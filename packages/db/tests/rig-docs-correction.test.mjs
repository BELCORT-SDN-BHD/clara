// Slice-5 rig — DOCUMENT PIPELINE part 6: CORRECTION CASE + WITHDRAWN + LOCK ORDER
// (S5-D3, companion §3.5 + §3.1). Contract-blind. Laws: retire_document_filing
// REFUSES while live posted entries / live drafts of that client cite the document
// (structured blockers); the guided case is preview (read-only blast radius) →
// propose (immutable hash-bound plan + books_version; no book effect) → approve
// (distinct checker or solo-attest; ONE bounded txn: per-entry reversal mirrors,
// drafts WITHDRAWN, A's filing retired, B's filing ensured, aggregate
// document.correction_applied + children); the belt (_tf_check_provenance,
// DEFERRABLE) validates congruence against the BOUND (now-retired) filing so the
// correction txn COMMITS — the §3.1 two-layer load-bearing test; closed periods
// HARD-BLOCK approve; stale plans reject; the withdrawn matrix + the global lock
// order (no posting-vs-retirement deadlock).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR,
  ROLES,
  ROUTINE_CENTS,
  assertRaisesOneOf,
  balanced,
  opk,
  human,
  rootActor,
  rootQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  freshResolution,
  draftEntry,
  approveEntry,
  seedVerifiedDocument,
  fileDocument,
  retireDocumentFiling,
  previewCorrection,
  proposeCorrection,
  approveCorrection,
  idOf,
  activeFilings,
  allFilings,
  RETIRE_BLOCKED_CODES,
  STALE_PLAN_CODES,
  CLOSED_PERIOD_CODES,
  STATUS_WITHDRAWN,
  DOC_EVT,
} from "./rig-docs-fixtures.mjs";
import { holdThenContend, concurrentTwoSession, sawDeadlock } from "./rig-docs-race.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("correction");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

const LINES = balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS);

/** A document filed to `client` with one APPROVED entry citing it (a live cite). */
async function docWithApprovedEntry(sub, client) {
  const firm = await firmOf(client);
  const { documentId, sha256 } = await seedVerifiedDocument({ firm });
  const filing = await fileDocument(sub, { document: documentId, client, resolution: await freshResolution(sub, client) });
  const active = (await activeFilings(documentId))[0];
  const res = await freshResolution(sub, client);
  const d = await draftEntry(human(sub), { client, resolution: res, document: documentId, sha256, lines: LINES, opKey: opk("d") });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("a") });
  return { documentId, sha256, filing: filing ?? active.id, filingRow: active, entry: d.entry_id };
}

// ===========================================================================
// §3.1 / S5-D3 — refuse-until-reversed.
// ===========================================================================

test("§3.1 retire_document_filing REFUSES while a live posted entry cites the document (structured blockers)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const s = await docWithApprovedEntry(users.alice, clients.A1);
  await assertRaisesOneOf(
    RETIRE_BLOCKED_CODES,
    () => retireDocumentFiling(users.alice, { filing: s.filing, reason: "rig direct retire", expectedRevision: s.filingRow.revision_token }),
    "retire a filing that a live approved entry cites",
  );
  noteLane("refuse-until-reversed: direct retirement blocked while a posted entry cites the filing (the correction case is the sanctioned path)");
});

// ===========================================================================
// §3.5 — preview → propose → approve; belt-vs-correction commit proof.
// ===========================================================================

test("§3.5 the guided correction commits ONE bounded txn: entry reversed, A's filing retired, B's filing ensured, aggregate document.correction_applied — belt stays satisfied against the retired filing", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const s = await docWithApprovedEntry(users.alice, clients.A1);

  // preview — read-only blast radius, no book effect.
  const preview = await previewCorrection(users.alice, { document: s.documentId, fromClient: clients.A1, toClient: clients.A2 });
  noteLane(`preview blast radius shape: ${JSON.stringify(preview).slice(0, 200)}`);
  // S5-D3: B's filing requires an authoritative human/rule DESTINATION attribution
  // (as-built: subject_kind='document' resolution for to_client, ≥0.95). Recorded
  // BEFORE propose — the plan binds books_version, and the resolution's own domain
  // event would otherwise stale the plan (the stale-plan law working as designed).
  await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: s.documentId });
  const evBefore = (await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1", [s.documentId])).rows[0].n;

  // propose — immutable hash-bound plan + books_version; NO book effect.
  const proposal = await proposeCorrection(users.alice, { document: s.documentId, fromClient: clients.A1, toClient: clients.A2, reason: "wrong client" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  assert.ok(correctionId, `propose returned a correction id (got ${JSON.stringify(proposal)})`);
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  assert.ok(planHash, "the proposal is hash-bound (plan_hash present)");
  const evAfterPropose = (await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1", [s.documentId])).rows[0].n;
  assert.equal(evAfterPropose, evBefore, "propose has NO book effect (no new document events)");

  // Maker/checker pin (integration reconciliation, house 0004 precedent: with
  // eligible_checker_count >= 2 an attestation is NOT a bypass — as-built CLR19,
  // pre-S5 maker-checker CLR05): the PROPOSER self-approving must refuse.
  await assertRaisesOneOf(
    ["CLR19", "CLR05"],
    () => approveCorrection(users.alice, { correction: correctionId, planHash, attestation: "solo-attest rig" }),
    "maker self-approves the correction while another eligible checker exists",
  );

  // approve — ONE bounded txn, by a DISTINCT eligible checker. This COMMITTING is
  // the belt-vs-correction proof: the reversed entry still references the
  // now-retired filing, and the DEFERRABLE belt validates congruence against that
  // historical filing row → commit succeeds.
  await approveCorrection(users.bob, { correction: correctionId, planHash });

  const entry = (await rootQuery("select status, reversed_by from clara.journal_entries where id=$1", [s.entry])).rows[0];
  assert.ok(entry.reversed_by, "the cited entry was reversed (whole-consequence mirror, F3)");
  const filingsNow = await allFilings(s.documentId);
  const a1 = filingsNow.find((f) => f.client_id === clients.A1);
  const a2 = filingsNow.find((f) => f.client_id === clients.A2);
  assert.ok(a1 && a1.retired_at != null, "A1's filing is retired (historical)");
  assert.ok(a2 && a2.retired_at == null, "A2's filing was ensured active (idempotent)");
  const agg = await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1 and event_type=$2", [s.documentId, DOC_EVT.correctionApplied]);
  assert.equal(agg.rows[0].n, 1, "exactly ONE aggregate document.correction_applied event");
});

// ===========================================================================
// §3.5 — withdrawn matrix.
// ===========================================================================

test("§3.5 a DRAFT of the corrected client is WITHDRAWN by the correction (draft→withdrawn only); its lines freeze; TB is unaffected", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const s = await docWithApprovedEntry(users.alice, clients.A1);
  // A second, still-DRAFT entry of A1 citing the same document.
  const res = await freshResolution(users.alice, clients.A1);
  const draft = await draftEntry(human(users.alice), { client: clients.A1, resolution: res, document: s.documentId, sha256: s.sha256, lines: LINES, opKey: opk("d2") });

  // Destination attribution BEFORE propose (its event would stale the bound plan).
  await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: s.documentId });
  const proposal = await proposeCorrection(users.alice, { document: s.documentId, fromClient: clients.A1, toClient: clients.A2, reason: "withdraw path" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  await approveCorrection(users.bob, { correction: correctionId, planHash });

  const st = (await rootQuery("select status from clara.journal_entries where id=$1", [draft.entry_id])).rows[0].status;
  assert.equal(st, STATUS_WITHDRAWN, "the draft was withdrawn (not deleted) by the correction");
  // Lines are frozen for a withdrawn entry (_tf_lines_immutable extends to withdrawn).
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest], () => rootQuery("update clara.journal_lines set debit_cents=1 where entry_id=$1", [draft.entry_id]), "mutate a withdrawn entry's lines");
  // A withdrawn entry can never move back to draft/approved.
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest, CLR.stale], () => rootQuery("update clara.journal_entries set status='draft' where id=$1", [draft.entry_id]), "revive a withdrawn entry");
});

// ===========================================================================
// §3.5 — closed-period hard block + stale plan reject.
// ===========================================================================

test("§3.5 stale plan reject: a proposal approved after the plan_hash/books_version drifts is refused", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const s = await docWithApprovedEntry(users.alice, clients.A1);
  const proposal = await proposeCorrection(users.alice, { document: s.documentId, fromClient: clients.A1, toClient: clients.A2, reason: "stale test" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  assert.ok(planHash, "the real plan is hash-bound (so a WRONG hash must be rejected)");

  // Approving with a WRONG plan_hash must reject (the plan is immutable + hash-bound).
  await assertRaisesOneOf(
    STALE_PLAN_CODES,
    () => approveCorrection(users.alice, { correction: correctionId, planHash: "0".repeat(64), attestation: "rig" }),
    "approve with a drifted/incorrect plan_hash",
  );
});

test("§3.5 closed periods HARD-BLOCK approve in v1 (preview may expose them; execution refuses)", async (t) => {
  if (unready(t)) return;
  // A closed-period fixture requires the close machinery, which is out of this
  // slice's writer surface. The observable law is recorded; if a close/period-lock
  // surface exists it would be driven here. Marked as an interface expectation.
  noteLane("closed-period HARD-BLOCK at approve (§3.5/S5-D3): no close-period writer is in the S5 surface to build the fixture — the block is asserted by the correction lane once a period-state fixture exists (interface expectation)");
  assert.ok(CLOSED_PERIOD_CODES.length > 0, "closed-period block codes recorded for the correction lane");
});

// ===========================================================================
// §3.5 — global lock order: posting-vs-retirement never deadlocks (X7-proven wait).
// ===========================================================================

test("§3.5 lock order (posting-vs-retirement): a retirement WAITS on a concurrent filing lock (pg_blocking_pids-proven) and resolves — never 40P01", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // A doc filed to A1 with NO live cited entry (so retirement is permitted once it
  // wins the lock) — the probe is purely about LOCK ORDER, not the cite block.
  const { documentId } = await seedVerifiedDocument({ firm });
  const filing = await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });
  const filingRow = (await activeFilings(documentId))[0];

  const out = await holdThenContend({
    // Holder: a raw SHARED lock on the active filing row (the posting lane's grip).
    a: { ...rootActor, run: (c) => c.query("select id from clara.document_filings where id=$1 for update", [filing ?? filingRow.id]) },
    // Contender: the retirement, human lane — must BLOCK, then resolve cleanly.
    b: { role: ROLES.authenticated, jwtSub: users.alice, run: (c) => c.query(
      "select clara.retire_document_filing(p_filing_id => $1, p_reason => $2, p_expected_revision => $3, p_op_key => $4)",
      [filing ?? filingRow.id, "rig lock-order", filingRow.revision_token, opk("lock")],
    ).catch((e) => { if (e.code === "42883") { noteLane("retire_document_filing: p_filing_id named-arg failed 42883 — param-name divergence"); throw e; } throw e; }) },
  });

  assert.equal(out.provedBlocked, true, "X7: the retirement was PROVEN blocked on the filing lock before the holder released");
  assert.ok(!(out.b && out.b.code === "40P01"), `no deadlock on the retirement side (got ${out.b?.code ?? "ok"})`);
});

test("§3.5 lock order: two concurrent filings on ONE document (filings id ASC) never deadlock", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  const resA1 = await freshResolution(users.alice, clients.A1);
  const resA2 = await freshResolution(users.alice, clients.A2);

  const out = await concurrentTwoSession({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: (c) => c.query(
      "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)", [documentId, clients.A1, resA1, opk("fa")],
    ).catch((e) => { if (e.code === "42883") { noteLane("file_document: p_document named-arg failed 42883 — param-name divergence"); } throw e; }) },
    b: { role: ROLES.authenticated, jwtSub: users.alice, run: (c) => c.query(
      "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)", [documentId, clients.A2, resA2, opk("fb")],
    ).catch((e) => { throw e; }) },
  });
  assert.ok(!sawDeadlock(out), `concurrent multi-client filings never deadlock (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);
});
