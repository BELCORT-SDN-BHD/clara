// Slice-5 matcher — ATTRIBUTION effects against the live 0007 surface: the raw-
// login-vs-SET-ROLE grant proof, lane-1 server-side resolve/abstain, replay-key
// idempotency, and the lane-2 candidate + confirm/dismiss round-trip. Runs on
// clara_test (0007 present); unique prefixes keep it clear of sibling lanes.
// Contract §4.4 / §0 S5-D2; migration 0007 companion §3.4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyMatcherEffects, MATCHER_VERSION } from "../lib/matcher.mjs";
import {
  skip,
  rootQuery,
  humanQuery,
  asRuntime,
  opk,
  buildFirmWithClients,
  seedVerifiedDocument,
  seedExtraction,
  seedRegion,
  addClientIdentifier,
  seedMatchableDocument,
  recordAttemptWithCandidates,
  asMatcherLogin,
  asMatcherLoginRaw,
  attemptsFor,
  ruleResolutionsFor,
  humanResolutionsFor,
  candidatesForDoc,
} from "./matcher-testkit.mjs";

const tinOf = () => "tin" + randomUUID().replace(/-/g, "").slice(0, 16);

/** Run applyMatcherEffects inside a transaction (the handler assumes an open txn). */
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

// ---------------------------------------------------------------------------
// #4 — the narrow login surface: record_rule_resolution is executable ONLY by the
// raw clara_runtime_login identity; a pooled SET ROLE clara_runtime session (and
// the human/agent lanes) get a role-level denial (42501).
// ---------------------------------------------------------------------------

test("record_rule_resolution: the RAW clara_runtime_login CAN execute it", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const doc = await seedVerifiedDocument({ firm, uploadedBy: owner });
  // Raw login (no SET ROLE): the call must NOT be a permission denial. It may
  // return an honest 'abstained' (no identifier seeded) — that is success.
  const res = await asMatcherLoginRaw(async (c) => {
    const r = await c.query("select clara.record_rule_resolution($1,$2) as r", [doc, opk("rule")]);
    return r.rows[0].r;
  });
  assert.equal(res.outcome, "abstained", "raw-login call executed server-side (abstain: no identifier)");
  void clients;
});

test("record_rule_resolution: a SET ROLE clara_runtime session is DENIED (42501)", { skip }, async () => {
  const { owner, firm } = await buildFirmWithClients(1);
  const doc = await seedVerifiedDocument({ firm, uploadedBy: owner });
  await assert.rejects(
    () => asRuntime((c) => c.query("select clara.record_rule_resolution($1,$2)", [doc, opk("rule")])),
    (e) => e.code === "42501",
    "the clara_runtime GROUP does not carry record_rule_resolution EXECUTE (login-only, INHERIT FALSE)",
  );
});

// ---------------------------------------------------------------------------
// Lane 1 — server-side hard-identifier resolve / abstain.
// ---------------------------------------------------------------------------

test("lane 1: a UNIQUE hard-identifier hit records a method='rule' resolution server-side", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(2);
  const tin = tinOf();
  const { document } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });

  const res = await asMatcherLogin((c) => effectsInTxn(c, { documentId: document, extractionId: null, firmId: firm }));
  assert.equal(res.rule.outcome, "rule_resolved");

  const rr = await ruleResolutionsFor(firm, document);
  assert.equal(rr.length, 1, "exactly one live rule resolution");
  assert.equal(rr[0].client_id, clients[0], "attributes the uniquely-matched client");
  assert.ok(Number(rr[0].confidence) >= 0.95, "confidence hardcoded ≥0.95 in-fn (caller supplies none)");
});

test("lane 1: a hard identifier SHARED across siblings ABSTAINS with the conflict represented", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(2);
  const tin = tinOf();
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  const extraction = await seedExtraction({ firm, document });
  await seedRegion({ firm, extraction, fieldPath: "tin", textContent: tin });
  await addClientIdentifier(owner, { client: clients[0], kind: "tin", value: tin });
  await addClientIdentifier(owner, { client: clients[1], kind: "tin", value: tin }); // shared ⇒ non-unique

  const res = await asMatcherLogin((c) => effectsInTxn(c, { documentId: document, extractionId: extraction, firmId: firm }));
  assert.equal(res.rule.outcome, "abstained");

  assert.equal((await ruleResolutionsFor(firm, document)).length, 0, "no rule resolution on a shared identifier");
  const rv1 = (await attemptsFor(document)).find((a) => a.matcher_version === "rule-v1");
  assert.ok(rv1 && rv1.outcome === "abstained" && rv1.conflict_reason, "the conflict is REPRESENTED in an abstained rule-v1 attempt");
});

// ---------------------------------------------------------------------------
// Replay-key idempotency — a re-delivered event produces ZERO new rows.
// ---------------------------------------------------------------------------

test("idempotency: re-delivering the same event yields ONE matcher attempt and ONE rule resolution", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const tin = tinOf();
  const { document, extraction } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });

  await asMatcherLogin(async (c) => {
    await effectsInTxn(c, { documentId: document, extractionId: extraction, firmId: firm });
    await effectsInTxn(c, { documentId: document, extractionId: extraction, firmId: firm }); // re-delivery
    await effectsInTxn(c, { documentId: document, extractionId: extraction, firmId: firm }); // and again
  });

  const mv = (await attemptsFor(document)).filter((a) => a.matcher_version === MATCHER_VERSION);
  assert.equal(mv.length, 1, "exactly one matcher-v1 replay-key attempt across three deliveries");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 1, "exactly one rule resolution (partial-unique deduped)");
});

// ---------------------------------------------------------------------------
// Lane 2 — advisory candidates + confirm/dismiss round-trip. The matcher cannot
// COMPUTE candidates under the as-built grants, but it (and the tests) can WRITE
// them via record_attribution_attempt; confirming is a human act.
// ---------------------------------------------------------------------------

test("lane 2: applyMatcherEffects wires computed candidates into the attempt (injected reader)", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  const extraction = await seedExtraction({ firm, document });
  const region = await seedRegion({ firm, extraction, fieldPath: "supplier_name", textContent: "Acme Sdn Bhd" });

  // An injected reader (bypasses the as-built read-grant gap) yielding a name hit.
  const readMatchInputs = async () => ({
    regions: [{ regionId: region, text: "Acme Sdn Bhd" }],
    aliases: [],
    clients: [{ clientId: clients[0], name: "Acme Sdn Bhd" }],
  });
  const res = await asMatcherLogin((c) =>
    effectsInTxn(c, { documentId: document, extractionId: extraction, firmId: firm }, { readMatchInputs }),
  );
  assert.equal(res.lane2.candidates.length, 1);

  const cands = await candidatesForDoc(document);
  assert.equal(cands.length, 1, "the candidate was persisted via record_attribution_attempt");
  assert.equal(cands[0].client_id, clients[0]);
  assert.equal(cands[0].rule_kind, "name_exact");
});

test("lane 2: confirm creates a human resolution; dismiss marks the sibling candidate dismissed", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  const extraction = await seedExtraction({ firm, document });
  const region = await seedRegion({ firm, extraction, fieldPath: "supplier_name", textContent: "Beta" });

  // Two attempts each with one candidate (record_attribution_attempt as clara_runtime).
  const attemptA = await recordAttemptWithCandidates({
    document,
    matcherVersion: "matcher-v1",
    candidates: [{ client_id: clients[0], rank: 1, rule_kind: "name_exact", region_ids: [region] }],
  });
  const candA = (await rootQuery("select id from clara.attribution_candidates where attempt_id=$1", [attemptA])).rows[0].id;
  await humanQuery(owner, "select clara.confirm_attribution_candidate(p_candidate=>$1,p_op_key=>$2)", [candA, opk("confirm")]);
  assert.equal(
    (await rootQuery("select disposition from clara.attribution_candidates where id=$1", [candA])).rows[0].disposition,
    "confirmed",
  );
  const hr = await humanResolutionsFor(firm, document);
  assert.ok(hr.length >= 1 && hr.some((r) => r.client_id === clients[0]), "confirming created a human resolution");

  const attemptB = await recordAttemptWithCandidates({
    document,
    matcherVersion: "matcher-v2",
    candidates: [{ client_id: clients[0], rank: 1, rule_kind: "alias_exact", region_ids: [] }],
  });
  const candB = (await rootQuery("select id from clara.attribution_candidates where attempt_id=$1", [attemptB])).rows[0].id;
  await humanQuery(owner, "select clara.dismiss_attribution_candidate(p_candidate=>$1,p_op_key=>$2)", [candB, opk("dismiss")]);
  assert.equal(
    (await rootQuery("select disposition from clara.attribution_candidates where id=$1", [candB])).rows[0].disposition,
    "dismissed",
  );
});

// ---------------------------------------------------------------------------
// No auto-filing — the matcher never files a document (assignment stays a human
// act, even for a lane-1 rule hit). S5-D2.
// ---------------------------------------------------------------------------

test("no auto-filing: a lane-1 rule hit records a resolution but creates NO document_filings row", { skip }, async () => {
  const { owner, firm, clients } = await buildFirmWithClients(1);
  const tin = tinOf();
  const { document } = await seedMatchableDocument({ firm, owner, client: clients[0], tin });
  await asMatcherLogin((c) => effectsInTxn(c, { documentId: document, extractionId: null, firmId: firm }));
  const filings = await rootQuery("select count(*)::int as n from clara.document_filings where document_id=$1 and retired_at is null", [document]);
  assert.equal(filings.rows[0].n, 0, "the matcher attributes but never files — assignment is a human act");
});
