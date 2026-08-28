// 裁-17 (docs/plan/active/mohe-grill-rulings-2026-08-28.md) — the NINTH
// clara.list_review_queue row_kind, 'seeding_proposal'. Battery: the row appears
// IFF a client carries >=1 OPEN (state='proposed') seeding_proposals — 0/1/2-client
// differential; batch-level aggregation (open_proposal_count, batch_ids across
// MULTIPLE open batches for the same client); the writer-mirrored active-OR-
// onboarding admitted set (a deliberate deviation from the other eight kinds'
// active-only guard — see the migration's own header); the eight pre-existing
// row_kinds' full 30-key shape survives UNCHANGED (a differential on the KEY SET,
// never a bare row count) with the three new keys always present-but-null
// elsewhere; cross-firm isolation.
//
// Built on the SAME fixtures wb-s-seeding.test.mjs already proves
// create_seeding_batch/tick/decline against (./wave-b/wb-fixtures.mjs) plus the
// canonical listReviewQueue/humanPersona pair (./wave-a-reads.mjs) — no new world
// builder, no duplicated seeding-door plumbing.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane,
  wbEnsureReady, fail0017,
  buildWaveBWorld, onboardingClient,
  filedDocument, setDocumentKind,
  createSeedingBatch, tickProposal, declineProposal, proposalRows,
} from "./wave-b/wb-fixtures.mjs";
import { listReviewQueue, humanPersona } from "./wave-a-reads.mjs";

let live = false;
let w = null;

// The full, exact 30-key shape every clara.list_review_queue row carries after
// this migration (27 pre-existing + client_name/batch_ids/open_proposal_count).
// Sourced from the LIVE json builder (packages/db/migrations/
// UNNUMBERED_ninth_rowkind_seeding_proposal.sql splice (c)), never re-typed by
// hand from a migration's first text.
const FULL_ROW_KEYS = [
  "row_kind", "section", "sort", "client_id", "counterparty_id", "filing_id",
  "entry_id", "question_id", "task_id", "document_id", "lane", "auto",
  "rule_backed", "high_stakes", "aged_since", "amount_cents", "period",
  "question_text", "created_at", "id", "coding_kind", "watch_id", "tier",
  "finding_id", "asset_id", "advance_id", "autodraft",
  "client_name", "batch_ids", "open_proposal_count",
].sort();

function proposal(key, fact) {
  return {
    proposal_kind: "wiki_fact",
    proposal_key: key,
    payload: { slug: "profile", fact },
    evidence: { prior_gl_lines: [1] },
  };
}

async function priorGlDoc(sub, { firm, client }) {
  const doc = await filedDocument(sub, { firm, client, kind: null });
  await setDocumentKind(sub, { document: doc.documentId, kind: "prior_gl", reason: "ninth-rowkind rig fixture" });
  return doc;
}

/** Every 'seeding_proposal' row in an envelope, deep-collected (mirrors
 *  a21-helpers.mjs's collectRowKind / wb-l-lint's own walk idiom). */
function seedingRows(envelope) {
  const out = [];
  (function walk(n) {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.row_kind === "seeding_proposal") out.push(n);
    Object.values(n).forEach(walk);
  })(envelope);
  return out;
}
function allRows(envelope) {
  const out = [];
  (function walk(n) {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.row_kind) out.push(n);
    Object.values(n).forEach(walk);
  })(envelope);
  return out;
}

before(async () => {
  live = await wbEnsureReady();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("ninth-rowkind-seeding-proposal"); await endPool(); });

test("裁-17 zero/one/two-client differential: the row appears IFF an open proposal exists, batch-level, guard mirrors create_seeding_batch's own active-or-onboarding admitted set", async () => {
  fail0017(live);
  const { users, firms } = w;

  // Client ZERO: onboarding-status, no seeding batch at all — carries no row.
  const zero = await onboardingClient(users.alice, `${w.prefix}_seed0`);

  // Client ONE: onboarding-status (proves the ONBOARDING half of the admitted
  // set) — one batch, one proposal, left 'proposed'.
  const one = await onboardingClient(users.alice, `${w.prefix}_seed1`);
  const oneDoc = await priorGlDoc(users.alice, { firm: firms.A, client: one.client });
  const oneBatch = await createSeedingBatch({
    client: one.client, document: oneDoc.documentId,
    proposals: [proposal("wf:one", "Client ONE trades as a hardware wholesaler.")],
  });
  const oneBatchId = oneBatch.batch_id ?? oneBatch.id;
  const oneProps = await proposalRows(oneBatchId);
  assert.equal(oneProps.length, 1, "mandatory setup: client ONE's batch carries exactly one proposal");
  assert.equal(oneProps[0].state, "proposed", "mandatory setup: client ONE's proposal is still OPEN");

  // Client TWO: ACTIVE-status (proves the ACTIVE half of the admitted set) —
  // TWO SEPARATE open batches (two documents, two distinct sha256), one open
  // proposal in each — proves array_agg(distinct ...) genuinely spans batches,
  // not just proposals within one batch.
  const two = firms /* keep lint quiet about unused destructure order */ && w.clients.A1;
  const twoDocA = await priorGlDoc(users.alice, { firm: firms.A, client: two });
  const twoBatchA = await createSeedingBatch({
    client: two, document: twoDocA.documentId,
    proposals: [proposal("wf:two-a", "Client TWO batch A fact.")],
  });
  const twoBatchAId = twoBatchA.batch_id ?? twoBatchA.id;
  const twoDocB = await priorGlDoc(users.alice, { firm: firms.A, client: two });
  const twoBatchB = await createSeedingBatch({
    client: two, document: twoDocB.documentId,
    proposals: [proposal("wf:two-b", "Client TWO batch B fact.")],
  });
  const twoBatchBId = twoBatchB.batch_id ?? twoBatchB.id;
  assert.notEqual(twoBatchAId, twoBatchBId, "mandatory setup: client TWO's two open proposals live in TWO DISTINCT batches");

  const oldestExpected = oneProps[0].created_at;
  const twoOldest = [
    (await proposalRows(twoBatchAId))[0].created_at,
    (await proposalRows(twoBatchBId))[0].created_at,
  ].sort()[0];

  const page = await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 });
  const rows = seedingRows(page);

  const zeroRows = rows.filter((r) => r.client_id === zero.client);
  assert.equal(zeroRows.length, 0, "client ZERO (no seeding batch at all) carries NO seeding_proposal row");

  const oneRows = rows.filter((r) => r.client_id === one.client);
  assert.equal(oneRows.length, 1, `client ONE (one open proposal) carries EXACTLY one seeding_proposal row (got ${oneRows.length})`);
  assert.equal(oneRows[0].id, one.client, "the row's id IS the client_id (batch-level, one row per client)");
  assert.equal(oneRows[0].section, "needs_review", "section is needs_review unconditionally (the fixed_asset_incomplete/staff_advance_incomplete posture)");
  assert.equal(oneRows[0].lane, null, "lane is NULL (ready/needs_review/needs_you counts stay untouched)");
  assert.equal(oneRows[0].open_proposal_count, 1, "open_proposal_count reflects the ONE open proposal");
  assert.deepEqual(oneRows[0].batch_ids, [oneBatchId], "batch_ids names the ONE open batch");
  assert.equal(oneRows[0].client_name, `${w.prefix}_seed1`, "client_name is the client's own name");
  assert.equal(oneRows[0].aged_since, oldestExpected, "aged_since is the oldest OPEN proposal's created_at");

  const twoRows = rows.filter((r) => r.client_id === two);
  assert.equal(twoRows.length, 1, `client TWO (two open proposals across two batches) carries EXACTLY one seeding_proposal row (got ${twoRows.length})`);
  assert.equal(twoRows[0].open_proposal_count, 2, "open_proposal_count sums BOTH open batches' open proposals");
  assert.deepEqual([...twoRows[0].batch_ids].sort(), [twoBatchAId, twoBatchBId].sort(), "batch_ids names BOTH open batches");
  assert.equal(twoRows[0].aged_since, twoOldest, "aged_since is the oldest of the two open proposals' created_at");

  // The population-level 0/1/2 differential: exactly TWO clients carry a row.
  assert.equal(new Set(rows.map((r) => r.client_id)).size, 2, "exactly TWO distinct clients carry a seeding_proposal row (client ZERO excluded)");

  // Visibility-never-blocking symmetry (the fixed_asset_incomplete/staff_advance_
  // incomplete precedent, x41b0/x42b1's own r4 cells): decide every open proposal
  // for client TWO and the row must DISAPPEAR, not merely change its count.
  const twoPropsA = await proposalRows(twoBatchAId);
  const twoPropsB = await proposalRows(twoBatchBId);
  await tickProposal(users.hana, { proposal: twoPropsA[0].id, opKey: opk("ninth-tick") });
  await declineProposal(users.hana, { proposal: twoPropsB[0].id, reason: "ninth-rowkind rig decline" });
  const page2 = await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 });
  const twoRowsAfter = seedingRows(page2).filter((r) => r.client_id === two);
  assert.equal(twoRowsAfter.length, 0, "client TWO's row DISAPPEARS once every open proposal is decided (visibility, never blocking)");
  const oneRowsAfter = seedingRows(page2).filter((r) => r.client_id === one.client);
  assert.equal(oneRowsAfter.length, 1, "client ONE's row is UNAFFECTED by client TWO's decisions");

  w._nine = { zero: zero.client, one: one.client, two, oneBatchId, twoBatchAId, twoBatchBId };
  noteLane("裁-17 differential: 0/1/2-client population proven, batch-level aggregation across two open batches proven, decide-to-disappear symmetry proven");
});

test("裁-17 the eight pre-existing row_kinds survive at their FULL 30-key shape (a differential on the key SET, never a bare count) — client_name/batch_ids/open_proposal_count are always null elsewhere", async () => {
  fail0017(live);
  const { users, clients } = w;

  // A cheap, otherwise-unused open_question row (A2) alongside the ninth kind's
  // own rows from the previous cell — both walked through the SAME envelope.
  const { openQuestion } = await import("./wave-a-fixtures.mjs");
  await openQuestion(users.alice, { client: clients.A2, scopeKind: "client", scopeId: clients.A2 }).catch((e) => noteLane(`openQuestion setup: ${e.code ?? e.message}`));

  const page = await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 });
  const rows = allRows(page);
  assert.ok(rows.length > 0, "mandatory setup: the envelope carries at least one row to differential-check");

  const kindsSeen = new Set();
  for (const row of rows) {
    kindsSeen.add(row.row_kind);
    assert.deepEqual(
      [...Object.keys(row)].sort(), FULL_ROW_KEYS,
      `row_kind='${row.row_kind}' (id=${row.id}) carries a DIFFERENT key set than the pinned 30-key shape — a key was added, dropped or renamed (got ${JSON.stringify([...Object.keys(row)].sort())})`,
    );
    if (row.row_kind !== "seeding_proposal") {
      assert.equal(row.client_name, null, `row_kind='${row.row_kind}' must carry client_name=null (seeding_proposal-only field)`);
      assert.equal(row.batch_ids, null, `row_kind='${row.row_kind}' must carry batch_ids=null (seeding_proposal-only field)`);
      assert.equal(row.open_proposal_count, null, `row_kind='${row.row_kind}' must carry open_proposal_count=null (seeding_proposal-only field)`);
    }
  }
  assert.ok(kindsSeen.has("open_question"), "the open_question fixture actually landed in the envelope");
  assert.ok(kindsSeen.has("seeding_proposal"), "the seeding_proposal fixture (previous cell) actually landed in the envelope");
  noteLane(`裁-17 key-set differential: row_kinds observed in this envelope = ${[...kindsSeen].sort().join(",")}`);
});

test("裁-17 cross-firm isolation: firm B never sees firm A's seeding_proposal row", async () => {
  fail0017(live);
  const { users } = w;
  assert.ok(w._nine, "mandatory setup: the first cell's fixtures (client ONE/TWO) must have run");

  const daveEnvelope = await listReviewQueue(humanPersona(users.dave), { scope: {}, limit: 500 });
  const daveRows = seedingRows(daveEnvelope);
  assert.equal(daveRows.length, 0, "firm B (dave) sees ZERO seeding_proposal rows firm-wide (client ONE/TWO both live in firm A)");
  assert.ok(!daveRows.some((r) => r.client_id === w._nine.one), "firm A's client ONE never appears in firm B's envelope");

  // The positive control: alice (firm A) still sees client ONE's row — proves
  // the isolation above is a real firm boundary, not an accidentally-empty read.
  const aliceEnvelope = await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 });
  assert.ok(seedingRows(aliceEnvelope).some((r) => r.client_id === w._nine.one), "positive control: firm A (alice) still sees client ONE's row");
});
