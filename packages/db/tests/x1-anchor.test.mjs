// Extraction slice X4 (migration 0022) — the `anchor_missing` DARK GUARD.
//
// WHAT IT IS. `anchor_missing` (0016:2715-2722) is the OCR-sales compensating control inside
// the posting executor. Today it is an UNCONDITIONAL structural refusal — but not because
// anyone decided that: `invoice.tax_total` and `invoice.total_excl_tax` have zero
// occurrences across all 29 live extractions, so `v_net is null or v_tax is null` is true
// for every OCR document that exists. X2 (the deterministic totals reader) supplies exactly
// those two inputs. Shipping it alone would therefore switch a live posting barrier OFF as
// a SIDE EFFECT of a feature — FATAL 2 of
// docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md, and the reason the naive
// Gate-P build was refused.
//
// So 0022 corrects the block's identity (to the X3 component identity, so that when the
// lane does open it opens on an equation that is right about Malaysian invoices) and adds a
// leading `if true` disjunct that keeps it firing regardless. Only X5's corroboration
// micro-migration may remove that disjunct — deliberately, with its own review and its own
// before/after measurement on live. Contract §2 X4; gate XG5.
//
// The cell below is the one that matters: a draft carrying a COMPLETE, arithmetically
// consistent anchor set — the exact state X2 will start producing — still skips.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, opk, buildWorld, firmOf, rm, fnSource,
  upsertAccountClassed, seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask,
  persistInvoiceFacts, factsRegion, grantConsent, freshResolution, ev, approveEntry,
  mintInteractive, wakeDraftEntry, addClientIdentifier, addClientAlias, draftEntryV3,
  classifyDocument, postViaRule, lastSkipReason, entryStatusOf, counterpartyRows,
  proposeAutopostRule, signAutopostRule, ruleRowById, seedStatedInvoiceFacts, FIELD,
  has0022, fail0022, ocrAnchorDarkGuard, componentFields, LAI_LOU_MEI, factField,
} from "./x1-helpers.mjs";

const REC = "300-X04";
const REV = "500-X04";
const SST = "250-X04";
const RND = "9990"; // the world's rounding account (one per client)
const CLIENT_REG = "199901000404";
const CLIENT_NAME = "X4 ANCHOR PROPERTIES SDN BHD";
const CUSTOMER = "ANCHOR RIG CUSTOMER SDN BHD";

let W = null;
let live = false;
let CLIENT = null;
let CP = null;
let RULE = null;

/** An approved human sales entry — the sighting the ocr_sales floor counts. */
async function approvedSales({ cp = null, newName = null, date, cents = 90000 }) {
  const sub = W.users.alice;
  const firm = await firmOf(CLIENT);
  const cited = await seedCitedDocument(sub, { firm, client: CLIENT, quote: rm(cents) });
  await seedStatedInvoiceFacts(cited, { firm }); // the floor needs >=6 DISTINCT stated invoice ids
  const d = await draftEntryV3(sub, {
    client: CLIENT,
    resolution: await freshResolution(sub, CLIENT, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    vendor: cp ? { existing_id: cp, kind: "customer" } : { new: { name: newName }, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    postingDate: date, opKey: opk("os"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("osa") });
  return d.entry_id;
}

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await has0022();
  if (!live) return;
  W = await buildWorld();
  CLIENT = W.clients.A1;
  const sub = W.users.alice;
  // The client is its OWN supplier identity, which is what resolves the direction to sales
  // and satisfies the executor's hard direction evidence (TIN/BRN + name/alias).
  await addClientIdentifier(sub, { client: CLIENT, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  await addClientIdentifier(sub, { client: CLIENT, kind: "tin", value: CLIENT_REG }).catch(() => {});
  await addClientAlias(sub, { client: CLIENT, alias: CLIENT_NAME.toLowerCase().replace(/[^a-z0-9]/g, "") }).catch(() => {});
  await upsertAccountClassed(sub, { client: CLIENT, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") });
  await upsertAccountClassed(sub, { client: CLIENT, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev") });
  await upsertAccountClassed(sub, { client: CLIENT, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sst") });
  await grantConsent(sub, { firm: await firmOf(CLIENT), client: CLIENT }).catch(() => {});

  // A resolved customer plus the 6-6-60 sighting floor, then a LIVE ocr_sales rule.
  await approvedSales({ newName: CUSTOMER, date: "2026-06-18" });
  const norm = CUSTOMER.toLowerCase().replace(/[^a-z0-9]/g, "");
  CP = (await counterpartyRows(CLIENT)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
  for (const date of ["2026-01-08", "2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08"]) {
    await approvedSales({ cp: CP, date });
  }
  const prop = await proposeAutopostRule(sub, {
    client: CLIENT, cp: CP, accountCode: REV, direction: "sales",
    evidenceClass: "ocr_sales", cap: 200000, windowMax: 3 });
  if (!prop.error) {
    await signAutopostRule(sub, { rule: prop.id });
    RULE = (await ruleRowById(prop.id))?.status === "live" ? prop.id : null;
  }
});
after(async () => { await endPool(); });

const gate = () => fail0022(live);

/** The document X2 will start producing: every anchor present and the component identity
 *  exact. `amountDue` defaults to the gross (the second independent anchor). */
async function fullyAnchoredDoc() {
  const sub = W.users.alice;
  const firm = await firmOf(CLIENT);
  const { gross, net, tax, rounding, serviceCharge } = LAI_LOU_MEI;
  const cited = await seedCitedDocument(sub, { firm, client: CLIENT, quote: rm(gross) });
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = componentFields({
    gross, net, tax, rounding, serviceCharge,
    invoiceId: `SI-${randomUUID().slice(0, 8)}`,
  });
  fields.push(factField("invoice.vendor_name", CLIENT_NAME));
  fields.push(factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }));
  fields.push(factField("invoice.customer_name", CUSTOMER));
  fields.push(factField("invoice.amount_due", rm(gross), { polygon: [], confidence: 0.9 }));
  await persistInvoiceFacts(task.id, fields);
  await classifyDocument({ document: cited.documentId, kind: "invoice", confidence: 0.97 });
  return { cited, gross, net, tax, rounding, serviceCharge };
}

async function anchoredDraft(cited, { gross, tax, rounding }) {
  const cred = await mintInteractive(await firmOf(CLIENT));
  const region = await factsRegion(cited.documentId, "invoice.total");
  return wakeDraftEntry(cred, {
    client: CLIENT,
    resolution: await freshResolution(W.users.alice, CLIENT, {
      subjectKind: "document", subjectId: cited.documentId }),
    lines: [
      { account_code: REC, debit_cents: gross, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: gross - tax - rounding, description: "sales-rev" },
      { account_code: SST, debit_cents: 0, credit_cents: tax, description: "sales-sst" },
      { account_code: RND, debit_cents: 0, credit_cents: rounding, description: "sales-rnd" },
    ],
    document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: CP, kind: "customer" },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "sales_invoice", opKey: `x4:${cited.filingId}:${cited.documentId}`,
  });
}

// ===========================================================================

test("[X4] the dark guard is ARMED and the block still carries the CORRECTED identity", async () => {
  gate();
  assert.equal(await ocrAnchorDarkGuard(), true,
    "execute_rule_post carries the X4 dark guard — the OCR-sales anchor lane is structurally shut");
  const src = await fnSource("execute_rule_post");
  assert.ok(src.includes("anchor_missing"),
    "…and the skip literal is unchanged, because the sentinels grep for exactly that word");
  assert.ok(src.includes("invoice.service_charge") && src.includes("invoice.discount")
    && src.includes("invoice.delivery"),
    "…while the identity underneath it is already the corrected component sum, so removing "
    + "the guard at X5 opens the lane on an equation that is RIGHT about service charges, "
    + "not on the one the refusal record showed to be wrong");
});

test("[X4/XG5] a COMPLETE, arithmetically consistent anchor set STILL skips anchor_missing", async () => {
  gate();
  assert.ok(RULE, "the ocr_sales rule is live (mandatory setup)");
  const { cited, gross, tax, rounding } = await fullyAnchoredDoc();

  // Precondition, asserted rather than assumed: the fact state really does carry every
  // anchor the block asks for. Without this the cell could pass for the boring reason.
  const state = (await rootQuery("select clara._invoice_fact_state($1) as s", [cited.documentId])).rows[0].s;
  assert.equal(state.corroborated, true, "the document is Tier-A corroborated (mandatory setup)");
  assert.ok(state.total_excl_tax_cents != null, "…it states an explicit net");
  assert.ok(state.tax_total_cents != null, "…and an explicit tax");
  assert.ok(state.invoice_id && state.invoice_date, "…and an invoice id and date");

  const draft = await anchoredDraft(cited, { gross, tax, rounding });
  assert.ok(draft?.entry_id, "the anchored draft exists (mandatory setup)");
  await postViaRule(draft.entry_id).catch(() => {});

  assert.notEqual(await entryStatusOf(draft.entry_id), "approved",
    "a fully anchored OCR sales draft is STILL not auto-posted — this is the whole point of "
    + "X4: X2's fields must not open the lane as a side effect");
  assert.equal(await lastSkipReason(draft.entry_id), "anchor_missing",
    "…and the skip is still NAMED anchor_missing, so the live outcome is byte-stable against "
    + "the 29 existing extractions (gate XG5: anchor outcomes change ONLY at X5's deploy)");
});

test("[X4] the draft REACHED the anchor block — the earlier controls all passed", async () => {
  gate();
  assert.ok(RULE, "the ocr_sales rule is live (mandatory setup)");
  // A guard that shut the lane by failing an EARLIER control would look identical from the
  // outside if you only checked "did not post". The skip reason is what distinguishes them:
  // reaching `anchor_missing` means polarity, hard direction evidence, buyer congruence and
  // the corroboration admission gate were all satisfied first.
  const { cited, gross, tax, rounding } = await fullyAnchoredDoc();
  const draft = await anchoredDraft(cited, { gross, tax, rounding });
  await postViaRule(draft.entry_id).catch(() => {});
  const reason = await lastSkipReason(draft.entry_id);
  for (const earlier of ["polarity_unverified", "direction_unproven", "buyer_mismatch",
    "not_corroborated", "evidence_class_mismatch", "control_shape", "account_mismatch"]) {
    assert.notEqual(reason, earlier,
      `the draft did not stop at ${earlier} — it got all the way to the anchor block`);
  }
  assert.equal(reason, "anchor_missing", "…and stopped there");
});

test("[X4] the two controls the guard SHADOWS are still present in the executor", async () => {
  gate();
  // The anchor block returns before controls (d) customer_unresolved and (e2) floor_lost, so
  // while the guard is armed those two are unreachable THROUGH THE EXECUTOR. That is a real
  // and temporary cost of shutting the lane at this point in the ladder, and it is recorded
  // here rather than left for someone to discover: they are shadowed, not removed, and X5
  // restores their reachability by deleting one disjunct.
  const src = await fnSource("execute_rule_post");
  assert.ok(src.includes("customer_unresolved"), "customer_unresolved is still in the executor");
  assert.ok(src.includes("floor_lost"), "floor_lost is still in the executor");
  assert.ok(src.includes("_ocr_sales_floor"), "…and the floor is still re-derived under the client lock");
  assert.ok(src.indexOf("anchor_missing") < src.indexOf("floor_lost"),
    "…with the anchor block ahead of them, which is WHY they are shadowed");
});
