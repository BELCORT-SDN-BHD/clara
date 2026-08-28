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
  opk, endPool, printLaneNotes, noteLane, rootQuery, humanQuery,
  wbEnsureReady, fail0017,
  buildWaveBWorld, onboardingClient,
  filedDocument, setDocumentKind,
  createSeedingBatch, tickProposal, declineProposal, proposalRows,
  cancelSeedingBatch, completeSeedingBatch, batchRow,
} from "./wave-b/wb-fixtures.mjs";
import { listReviewQueue, humanPersona } from "./wave-a-reads.mjs";
import { seedCitedDocument, freshResolution, draftEntryV3, billLines, ev, FIELD, openQuestion } from "./wave-a-fixtures.mjs";
import { advWorld, freshAdvClient, disburse, mon, dayIn, x42EnsureReady } from "./x42-adv-world.mjs";

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

test("MED-2 (Codex cross-model review, fec6ab5b, escalated HIGH by rev-nr): STRANDED ROWS — a proposal left 'proposed' by a CANCELLED or COMPLETED batch must NOT chase (SeedingBatchesPanel hides Tick/Decline once the owning batch is no longer open)", async () => {
  fail0017(live);
  const { users, firms } = w;

  // Cancel path: one open batch, one open proposal, present (positive control) —
  // then cancel the BATCH (never the proposal) and the row must vanish, even
  // though the proposal itself stays 'proposed' forever (0017/0118 census: no
  // batch-reopen door and no third writer of seeding_proposals.state).
  const cancelClient = await onboardingClient(users.alice, `${w.prefix}_med2cancel`);
  const cancelDoc = await priorGlDoc(users.alice, { firm: firms.A, client: cancelClient.client });
  const cancelBatchR = await createSeedingBatch({
    client: cancelClient.client, document: cancelDoc.documentId,
    proposals: [proposal("wf:med2-cancel", "MED-2 cancel-path fact.")],
  });
  const cancelBatchId = cancelBatchR.batch_id ?? cancelBatchR.id;

  const beforeCancel = seedingRows(await listReviewQueue(humanPersona(users.alice), { scope: { client_id: cancelClient.client } }));
  assert.equal(beforeCancel.length, 1, "positive control: the OPEN batch's row is present before cancellation");

  await cancelSeedingBatch(users.hana, { batch: cancelBatchId, reason: "MED-2 rig cancel", opKey: opk("med2cancel") });
  assert.equal((await batchRow(cancelBatchId)).state, "cancelled", "mandatory setup: the batch is genuinely cancelled");
  const cancelProps = await proposalRows(cancelBatchId);
  assert.equal(cancelProps[0].state, "proposed", "mandatory setup (the stranding itself): the proposal is STILL 'proposed' after its batch is cancelled — no third writer moves it");
  await assert.rejects(
    () => tickProposal(users.hana, { proposal: cancelProps[0].id, opKey: opk("med2cancelrefuse") }),
    (e) => e.code === "CLR34",
    "the panel's own tick door refuses CLR34 'seeding batch is not open' on the cancelled batch's proposal",
  );

  const afterCancel = seedingRows(await listReviewQueue(humanPersona(users.alice), { scope: { client_id: cancelClient.client } }));
  assert.equal(afterCancel.length, 0, "MED-2: the row is GONE once the owning batch is cancelled, even though the proposal is still 'proposed'");

  // Complete path: two open proposals, tick ONE, complete the batch with the
  // OTHER still 'proposed' (0017's own S4 cell: "unticked proposals STAY
  // 'proposed' after completion" — completeSeedingBatch's own receipt names
  // this still_proposed count, a DESIGNED-IN normal outcome, not an edge case).
  const completeClient = await onboardingClient(users.alice, `${w.prefix}_med2complete`);
  const completeDoc = await priorGlDoc(users.alice, { firm: firms.A, client: completeClient.client });
  const completeBatchR = await createSeedingBatch({
    client: completeClient.client, document: completeDoc.documentId,
    proposals: [
      proposal("wf:med2-complete-a", "MED-2 complete-path fact A."),
      proposal("wf:med2-complete-b", "MED-2 complete-path fact B."),
    ],
  });
  const completeBatchId = completeBatchR.batch_id ?? completeBatchR.id;
  const completeProps = await proposalRows(completeBatchId);
  assert.equal(completeProps.length, 2, "mandatory setup: two proposals landed");

  const beforeComplete = seedingRows(await listReviewQueue(humanPersona(users.alice), { scope: { client_id: completeClient.client } }));
  assert.equal(beforeComplete.length, 1, "positive control: the OPEN batch's row is present before completion");
  assert.equal(beforeComplete[0].open_proposal_count, 2, "positive control: both proposals count while the batch is open");

  await tickProposal(users.hana, { proposal: completeProps[0].id, opKey: opk("med2tick") });
  const completeReceipt = await completeSeedingBatch(users.hana, { batch: completeBatchId, opKey: opk("med2done") });
  assert.equal((await batchRow(completeBatchId)).state, "completed", "mandatory setup: the batch is genuinely completed");
  const stillOpenAfterComplete = (await proposalRows(completeBatchId)).filter((p) => p.state === "proposed");
  assert.equal(stillOpenAfterComplete.length, 1, "mandatory setup (the stranding itself): ONE proposal is STILL 'proposed' after completion — the designed WB-R2 landing state");
  if (typeof completeReceipt?.still_proposed === "number") {
    assert.equal(completeReceipt.still_proposed, 1, "the door's own receipt names the still_proposed count (rev-nr's own census)");
  }
  await assert.rejects(
    () => declineProposal(users.hana, { proposal: stillOpenAfterComplete[0].id, reason: "MED-2 rig", opKey: opk("med2completerefuse") }),
    (e) => e.code === "CLR34",
    "the panel's own decline door refuses CLR34 'seeding batch is not open' on the completed batch's still-proposed proposal",
  );

  const afterComplete = seedingRows(await listReviewQueue(humanPersona(users.alice), { scope: { client_id: completeClient.client } }));
  assert.equal(afterComplete.length, 0, "MED-2: the row is GONE once the owning batch completes, even with one proposal STILL 'proposed'");

  noteLane("MED-2: cancel path and complete path both strand a 'proposed' proposal permanently, and the ninth row correctly disappears in both — no route to a row the linked panel can never settle");
});

test("MED-3 (Codex cross-model review, fec6ab5b): ALL NINE row_kinds, produced through real state, EACH asserted present at its FULL 30-key shape — a missing kind is a FAIL, not a silently-skipped observation", async () => {
  fail0017(live);
  const { users, firms, clients } = w;
  const seen = {};
  const need = (kind) => { assert.ok(seen[kind], `row_kind='${kind}' never landed in ANY envelope this cell read — MED-3 requires every one of the nine kinds to be OBSERVED, not merely possible`); };

  // client_id A1 hosts: open_question, draft, uncoded_filing, coding_task,
  // compliance_watch, lint_finding, fixed_asset_incomplete — all firm A, so one
  // firm-wide read (below) collects them together with A1's OWN
  // seeding_proposal rows from the earlier cells (different tables, no
  // interference). A1, not A2: buildWaveBWorld() seeds WB_COA's control
  // accounts (apCtl/faExp) on A1 ONLY — the draft producer below needs them.
  const med3Client = clients.A1;

  // 1) open_question — the existing light producer.
  await openQuestion(users.alice, { client: med3Client, scopeKind: "client", scopeId: med3Client })
    .catch((e) => noteLane(`MED-3 openQuestion setup: ${e.code ?? e.message}`));

  // 2) draft — a real cited bill on client A2, using buildWaveBWorld's OWN
  // control accounts (WB_COA.apCtl payable / WB_COA.faExp expense), so no new
  // CoA setup is needed.
  const { WB_COA } = await import("./wave-b/wb-fixtures.mjs");
  const cited = await seedCitedDocument(users.alice, { firm: firms.A, client: med3Client, quote: "RM 700.00" });
  await draftEntryV3(users.alice, {
    client: med3Client,
    resolution: await freshResolution(users.alice, med3Client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: billLines(WB_COA.faExp, WB_COA.apCtl, 70000),
    vendor: { new: { name: "MED3 DRAFT VENDOR SDN BHD", registration_no: "202301019999" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    opKey: opk("med3draft"),
  });

  // 3) uncoded_filing + 4) coding_task — a SEPARATE plain filed document (never
  // drafted): uncoded_filing on its own; open_coding_task against the SAME
  // filing additionally produces coding_task (the two kinds are NOT mutually
  // exclusive on one filing — coding_task is a human-opened correction/manual
  // task, uncoded_filing is "no draft/approved entry yet", both true at once).
  const ctDoc = await filedDocument(users.alice, { firm: firms.A, client: med3Client, kind: null });
  await humanQuery(
    users.alice,
    "select clara.open_coding_task(p_client => $1, p_document => $2, p_filing => $3, p_reason => $4, p_op_key => $5) as r",
    [med3Client, ctDoc.documentId, ctDoc.filingId, "MED-3 rig probe", opk("med3ct")],
  );

  // 5) compliance_watch, 6) lint_finding, 7) fixed_asset_incomplete — direct
  // state seeding (rev-nr/Codex's own "seed one row of each through real
  // state" permission): each of these three kinds' SHAPE is what this cell
  // proves, not the compliance evaluator / lint engine / fixed-asset door's
  // own behaviour (each already has its OWN dedicated battery elsewhere —
  // a21-read-surfaces, wb-l-lint, x41b0-surface). A raw INSERT into the real
  // table clara.list_review_queue itself reads is real state by the review's
  // own words, not a mock.
  await rootQuery(
    `insert into clara.compliance_watches(firm_id, client_id, service_group, watch_kind, state)
     values ($1, $2, 'digital_services', 'sst_registration', 'crossed')`,
    [firms.A, med3Client],
  );
  await rootQuery(
    `insert into clara.lint_findings(firm_id, client_id, finding_kind, dedupe_key, severity, state)
     values ($1, $2, 'stale_claim', 'med3-rig-probe', 'critical', 'open')`,
    [firms.A, med3Client],
  );
  await rootQuery(
    `insert into clara.fixed_assets(firm_id, client_id, description, cost_cents, status)
     values ($1, $2, 'MED-3 rig probe fixed asset (particulars pending)', 500000, 'active')`,
    [firms.A, med3Client],
  );

  // 8) staff_advance_incomplete — the x42 world's own real door chain
  // (freshAdvClient + disburse), the SAME recipe x42b1-advances.test.mjs's own
  // r4 cell uses. advWorld() caches wb.buildWaveBWorld() itself, so this lives
  // in the SAME firm A this whole file already uses.
  await x42EnsureReady(); // anchors the mon()/dayIn() DB clock reference
  const aw = await advWorld();
  const { client: advClient } = await freshAdvClient("med3");
  await disburse({ client: advClient, cents: 42_000, postingDate: dayIn(mon(-1), 10) });

  // Read: A2/advClient's own client-scoped queue plus the firm-wide read
  // (which also carries client A1's seeding_proposal rows from earlier cells).
  const rows = [
    ...allRows(await listReviewQueue(humanPersona(users.alice), { scope: {}, limit: 500 })),
    ...allRows(await listReviewQueue(humanPersona(aw.users.alice), { scope: { client_id: advClient }, limit: 500 })),
  ];
  assert.ok(rows.length > 0, "mandatory setup: at least one row was read back");

  for (const row of rows) {
    seen[row.row_kind] = true;
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

  // The MED-3 floor: every one of the nine live kinds is OBSERVED, by name —
  // a kind absent from `seen` fails THIS assertion, never silently absent from
  // a passing test.
  for (const kind of [
    "draft", "uncoded_filing", "open_question", "coding_task", "compliance_watch",
    "lint_finding", "fixed_asset_incomplete", "staff_advance_incomplete", "seeding_proposal",
  ]) need(kind);
  noteLane(`MED-3: all nine row_kinds observed and shape-checked = ${Object.keys(seen).sort().join(",")}`);
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
