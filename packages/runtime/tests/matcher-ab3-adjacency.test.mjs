// WA AB-3 adjacency (runtime side). Migration 0011's FIRST block pins
// record_rule_resolution's hard-identifier scan to engine_kind in
// ('ocr','structured_parse'), so an invoice_facts extraction can never feed the
// matcher's client-attribution lane. This test proves the matcher lane-1 role
// dance still resolves correctly once that pin is live, AND that a planted
// invoice_facts region carrying a colliding hard identifier is INVISIBLE to it
// (it does not turn a clean single-client hit into a conflict abstain).
//
// The DB-side twin (the 0011 tail assert) lives in Lane B. This is the runtime
// exercise of the real reset-role -> record_rule_resolution -> set-role lane.
//
// SKIP-WITH-MARKER until 0011 is applied: detected by the engine_kind pin being
// present in record_rule_resolution's body (the phrase 'structured_parse', which
// the 0007 body does not contain). Until then the pin is absent and the planted
// invoice_facts hit WOULD be visible — so the test would (correctly) not hold; we
// skip rather than assert a pre-0011 world.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyMatcherEffects } from "../lib/matcher.mjs";
import {
  skip as baseSkip,
  rootQuery,
  buildFirmWithClients,
  seedVerifiedDocument,
  seedExtraction,
  seedRegion,
  addClientIdentifier,
  asMatcherLogin,
  ruleResolutionsFor,
} from "./matcher-testkit.mjs";

// AB-3 readiness: the pin is present iff record_rule_resolution's body now names
// the structured_parse engine kind (added by 0011; absent in the 0007 body).
async function probeAb3Pinned() {
  const r = await rootQuery(
    `select coalesce(bool_or(pg_get_functiondef(p.oid) ~ 'structured_parse'), false) as pinned
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = 'record_rule_resolution'`,
  );
  return r.rows[0].pinned === true;
}

const AB3_PINNED = baseSkip ? false : await probeAb3Pinned();
const ab3Skip = baseSkip || (AB3_PINNED ? false : "0011 AB-3 engine_kind pin not applied — run after Lane A's migration 0011");

const tinOf = () => "tin" + randomUUID().replace(/-/g, "").slice(0, 16);

/** applyMatcherEffects assumes an open txn; wrap + restore the role on error. */
async function effectsInTxn(client, args, deps) {
  await client.query("begin");
  try {
    const r = await applyMatcherEffects(client, args, deps);
    await client.query("commit");
    return r;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    await client.query("set role clara_runtime").catch(() => {});
    throw e;
  }
}

/** Plant a DONE invoice_facts extraction (distinct engine_id ⇒ no unique clash). */
async function seedInvoiceFactsExtraction({ firm, document }) {
  const r = await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
       values($1,$2,'azure-di:prebuilt-invoice:2024-11-30','invoice_facts',1,'done',1) returning id`,
    [firm, document],
  );
  return r.rows[0].id;
}

test(
  "AB-3: a colliding invoice_facts identifier is invisible to record_rule_resolution (lane-1 still resolves the OCR client)",
  { skip: ab3Skip },
  async () => {
    const { owner, firm, clients } = await buildFirmWithClients(2);
    const tinOcr = tinOf();
    const tinFacts = tinOf();

    // The document has a clean OCR hard-identifier hit for client[0].
    const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
    const ocrExt = await seedExtraction({ firm, document }); // engine_kind='ocr'
    await seedRegion({ firm, extraction: ocrExt, fieldPath: "tin", textContent: tinOcr });
    await addClientIdentifier(owner, { client: clients[0], kind: "tin", value: tinOcr });

    // ADVERSARIAL PLANT: an invoice_facts extraction carrying a DIFFERENT client's
    // hard identifier under a colliding field_path. Pre-pin this would make the
    // hard-identifier set ambiguous (two clients) and force an abstain; the AB-3
    // pin must exclude it so lane-1 still sees a single, clean client.
    const factsExt = await seedInvoiceFactsExtraction({ firm, document });
    await seedRegion({ firm, extraction: factsExt, fieldPath: "tin", textContent: tinFacts });
    await addClientIdentifier(owner, { client: clients[1], kind: "tin", value: tinFacts });

    const res = await asMatcherLogin((c) =>
      effectsInTxn(c, { documentId: document, extractionId: ocrExt, firmId: firm }),
    );

    assert.equal(res.rule.outcome, "rule_resolved", "the OCR hit resolves; the invoice_facts plant is not counted");
    const rr = await ruleResolutionsFor(firm, document);
    assert.equal(rr.length, 1, "exactly one rule resolution");
    assert.equal(rr[0].client_id, clients[0], "resolves the OCR-attributed client, not the planted invoice_facts one");
  },
);
