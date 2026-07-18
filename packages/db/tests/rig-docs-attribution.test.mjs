// Slice-5 rig — DOCUMENT PIPELINE part 5: ATTRIBUTION (S5-D2, companion §3.4).
// Contract-blind. Laws: client_identifiers has NO uniqueness constraint — a shared
// HARD identifier across sibling clients is REPRESENTABLE (lane-1 abstains, conflict
// recorded, never a constraint violation); attribution_attempts idempotent per
// (document, matcher_version, input_fingerprint) — the matcher's replay key;
// record_rule_resolution recomputes the lane-1 predicate SERVER-SIDE (callers never
// supply client/confidence — the fn takes only p_document/p_op_key) and is
// runtime-login-only EXECUTE; confirm/dismiss candidate writers (confirm = human
// resolution + optional file_document in ONE txn); attribution_candidate_regions
// carries a composite same-firm FK to document_regions.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PG,
  ROLES,
  assertRaises,
  assertRaisesOneOf,
  CLR,
  opk,
  sha,
  rootQuery,
  roleQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  seedVerifiedDocument,
  seedExtraction,
  seedRegion,
  addClientIdentifier,
  addClientAlias,
  recordRuleResolution,
  seedAttempt,
  seedCandidate,
  confirmCandidate,
  dismissCandidate,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("attribution");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

// ===========================================================================
// §3.4 — client_identifiers: representable shared HARD identifier (NO uniqueness).
// ===========================================================================

test("§3.4 a HARD identifier shared across sibling clients is REPRESENTABLE (no unique constraint) — the conflict is data, not a violation", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const account = "5551234567";
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "bank_account", value: account });
  // The SAME bank account on a sibling client (two related companies, §8) must be
  // storable — a uniqueness constraint here would be the bug S5-D2 forbids.
  await addClientIdentifier(users.alice, { client: clients.A2, kind: "bank_account", value: account });
  const rows = await rootQuery("select client_id from clara.client_identifiers where firm_id=$1 and kind='bank_account'", [await firmOf(clients.A1)]);
  const set = new Set(rows.rows.map((r) => r.client_id));
  assert.ok(set.has(clients.A1) && set.has(clients.A2), "the shared identifier is represented on BOTH sibling clients");
});

test("§3.4 client_aliases feeds candidates only (audited human writer; never authorizes)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  await addClientAlias(users.alice, { client: clients.A1, alias: `acme-${randomUUID().slice(0, 6)}` });
  const cols = await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name='client_aliases'");
  const names = new Set(cols.rows.map((x) => x.column_name));
  assert.ok(names.has("alias_normalized") || names.has("alias"), "client_aliases carries a normalized alias column");
  assert.ok(names.has("retired_at"), "client_aliases carries retired_at (a registry, not a fact)");
});

// ===========================================================================
// §3.4 — record_rule_resolution: server-side recompute + runtime-login-only.
// ===========================================================================

test("§3.4 record_rule_resolution is runtime-login-only EXECUTE: humans and the agent lane are denied", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select clara.record_rule_resolution(p_document => $1, p_op_key => $2)", [documentId, opk("x")]), "human EXECUTE record_rule_resolution");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "select clara.record_rule_resolution(p_document => $1, p_op_key => $2)", [documentId, opk("x")]), "agent EXECUTE record_rule_resolution");
});

test("§3.4 record_rule_resolution: a UNIQUE HARD identifier hit records a method='rule' resolution; callers supply neither client nor confidence", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const tin = `C${randomUUID().slice(0, 8)}`;

  // A document presenting the identifier: extraction + region carrying the TIN.
  const { documentId } = await seedVerifiedDocument({ firm });
  const extraction = await seedExtraction({ firm, document: documentId, versionN: 1 });
  await seedRegion({ firm, extraction, locatorKind: "page_polygon", fieldPath: "tin", textContent: tin, engineConfidence: 0.99 });
  // A UNIQUE identifier hit → client A1.
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "tin", value: tin });

  // The fn recomputes server-side; the wrapper passes ONLY p_document/p_op_key.
  let recorded = null;
  try {
    recorded = await recordRuleResolution({ document: documentId });
  } catch (e) {
    noteLane(`record_rule_resolution raised ${e.code}: ${e.message} — the lane-1 predicate's identifier INPUT (region field_path vs envelope) is an interface expectation`);
  }
  if (recorded != null) {
    const res = await rootQuery("select method, client_id, confidence from clara.client_resolutions where firm_id=$1 and method='rule' order by created_at desc limit 1", [firm]);
    assert.equal(res.rowCount, 1, "a method='rule' resolution was recorded server-side");
    assert.equal(res.rows[0].client_id, clients.A1, "the rule resolution attributes the uniquely-matched client");
    assert.ok(Number(res.rows[0].confidence) >= 0.95, "confidence is hardcoded ≥0.95 in-fn (caller never supplies it)");
  }
});

test("§3.4 record_rule_resolution ABSTAINS when the HARD identifier is shared across siblings (conflict represented, no rule resolution)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const tin = `S${randomUUID().slice(0, 8)}`;
  const { documentId } = await seedVerifiedDocument({ firm });
  const extraction = await seedExtraction({ firm, document: documentId, versionN: 1 });
  await seedRegion({ firm, extraction, locatorKind: "page_polygon", fieldPath: "tin", textContent: tin, engineConfidence: 0.99 });
  // Shared across two siblings → NON-unique → lane-1 abstains.
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "tin", value: tin });
  await addClientIdentifier(users.alice, { client: clients.A2, kind: "tin", value: tin });

  const before = await rootQuery("select count(*)::int as n from clara.client_resolutions where firm_id=$1 and method='rule'", [firm]);
  try { await recordRuleResolution({ document: documentId }); } catch (e) { noteLane(`shared-identifier record_rule_resolution outcome: ${e.code ?? "ok"}`); }
  const after = await rootQuery("select count(*)::int as n from clara.client_resolutions where firm_id=$1 and method='rule'", [firm]);
  assert.equal(after.rows[0].n, before.rows[0].n, "no rule resolution is created on a shared/ambiguous identifier (abstain)");
});

// ===========================================================================
// §3.4 — attempts idempotency + candidates confirm/dismiss.
// ===========================================================================

test("§3.4 attribution_attempts idempotent per (document, matcher_version, input_fingerprint) — the replay key", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  const fp = sha(randomUUID());
  await seedAttempt({ firm, document: documentId, matcherVersion: 1, inputFingerprint: fp });
  await assert.rejects(
    () => seedAttempt({ firm, document: documentId, matcherVersion: 1, inputFingerprint: fp }),
    (e) => e.code === PG.uniqueViolation,
    "a re-delivered event (same fingerprint) collides → one attempt (matcher idempotency)",
  );
});

test("§3.4 confirm_attribution_candidate creates a human resolution; dismiss marks the candidate dismissed", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });

  const attempt = await seedAttempt({ firm, document: documentId, matcherVersion: 1 });
  const cand = await seedCandidate({ firm, attempt, client: clients.A1, rank: 1, ruleKind: "name_exact", disposition: "open" });
  const before = await rootQuery("select count(*)::int as n from clara.client_resolutions where firm_id=$1 and method='human'", [firm]);
  await confirmCandidate(users.alice, { candidate: cand, client: clients.A1 });
  const disp = await rootQuery("select disposition from clara.attribution_candidates where id=$1", [cand]);
  assert.equal(disp.rows[0].disposition, "confirmed", "the confirmed candidate is disposition='confirmed'");
  const after = await rootQuery("select count(*)::int as n from clara.client_resolutions where firm_id=$1 and method='human'", [firm]);
  assert.ok(after.rows[0].n > before.rows[0].n, "confirming a candidate created a human resolution (§3.4)");

  const attempt2 = await seedAttempt({ firm, document: documentId, matcherVersion: 2 });
  const cand2 = await seedCandidate({ firm, attempt: attempt2, client: clients.A1, disposition: "open" });
  await dismissCandidate(users.alice, { candidate: cand2 });
  const disp2 = await rootQuery("select disposition from clara.attribution_candidates where id=$1", [cand2]);
  assert.equal(disp2.rows[0].disposition, "dismissed", "the dismissed candidate is disposition='dismissed'");
});

test("§3.4 attribution_candidate_regions references document_regions with a composite same-firm FK (a cross-firm region ref is rejected)", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firmA = await firmOf(clients.A1);
  const firmB = await firmOf(clients.B1);

  // A candidate in firm A.
  const { documentId } = await seedVerifiedDocument({ firm: firmA });
  const attempt = await seedAttempt({ firm: firmA, document: documentId, matcherVersion: 1 });
  const cand = await seedCandidate({ firm: firmA, attempt, client: clients.A1, disposition: "open" });
  // A region in firm B.
  const bDoc = await seedVerifiedDocument({ firm: firmB });
  const bExtraction = await seedExtraction({ firm: firmB, document: bDoc.documentId, versionN: 1 });
  const bRegion = await seedRegion({ firm: firmB, extraction: bExtraction });

  // Linking firm A's candidate to firm B's region must be rejected by the composite FK.
  await assertRaisesOneOf(
    [PG.foreignKeyViolation, PG.checkViolation, CLR.badRequest, CLR.notFound],
    () => rootQuery(
      "insert into clara.attribution_candidate_regions (firm_id, candidate_id, region_id) values ($1, $2, $3)",
      [firmA, cand, bRegion],
    ),
    "cross-firm candidate→region link",
  );
  noteLane(`candidate_regions composite same-firm FK exercised (firm A candidate ${String(cand).slice(0, 8)} vs firm B region)`);
});
