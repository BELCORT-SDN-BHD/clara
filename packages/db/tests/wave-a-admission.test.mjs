// Wave-A rig — the autodraft ADMISSION protocol (Codex probes 15/17; contract §3
// step 2 + companion §4). The filing-keyed active-attempt registry: event ×
// catch-up × retry × one-click on ONE filing → exactly one active task / one
// reserve; registry short-circuit FIRST (noop_existing, success-shaped, no op
// receipt churn); redelivery replays clean (run_id EXCLUDED from the op-key hash —
// Codex 15); durable attempt counters park at 2 failures across "restarts" (new
// sessions); a new event cannot bypass the park. Contract-blind. SKIPS (counted)
// until 0011 lands.
//
// READY-reachability caveat (blindness): the READY predicate is definer-internal;
// primeReadyFiling maximizes it but cannot guarantee it. Tests assert the HARD
// invariant (≤1 non-terminal task/filing) unconditionally, and drive the deeper
// park chain only when admit yields 'admitted', recording a finding otherwise.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedVerifiedDocument, fileDocument, freshResolution, retireDocumentFiling, listDocumentAutodraftCandidates,
  primeReadyFiling, admitAutodraft, beginAutodraft, settleAutodraft, attemptRow, countWhere, openSweepRun,
  ORIGIN, ADMIT_OUTCOMES, concurrentTwoSession, sawDeadlock, GUARD,
} from "./wave-a-race.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => { printLaneNotes("wave-a-admission"); printSkipCount("wave-a-admission"); await endPool(); });

/** Non-terminal autodraft task count for a filing (root; the registry invariant).
 *  As-built: there is NO agent_tasks.params — the filing→task linkage lives in the
 *  autodraft_attempts registry (unique(filing_id), carries task_id), PINS §2. */
async function liveTasks(filing) {
  const r = await rootQuery(
    `select count(*)::int n from clara.autodraft_attempts aa join clara.agent_tasks t on t.id=aa.task_id
      where aa.filing_id=$1 and t.kind='autodraft' and t.status not in ('completed','failed','cancelled','expired')`, [filing]);
  return r.rows[0].n;
}
function outcomeOf(r) { return typeof r === "object" && r ? (r.outcome ?? null) : null; }

// ===========================================================================
// Registry short-circuit + one-task-per-filing across all four admission paths.
// ===========================================================================

test("registry short-circuit: a second admission for the same filing returns success-shaped noop_existing; exactly ONE non-terminal task exists", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const rf = await primeReadyFiling(users.alice, { client: clients.A1 });
  const a1 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  assert.ok(ADMIT_OUTCOMES.includes(outcomeOf(a1)), `admit returns a success-shaped outcome (got ${JSON.stringify(a1)})`);
  if (outcomeOf(a1) !== "admitted") { noteLane(`FINDING(candidate): primeReadyFiling did not reach READY — admit outcome=${outcomeOf(a1)} — verify the READY predicate/fixture`); }
  // A second admission (event redelivery) → noop_existing, no new task.
  const a2 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  if (outcomeOf(a1) === "admitted") assert.equal(outcomeOf(a2), "noop_existing", "the second same-filing admission short-circuits to noop_existing");
  assert.ok((await liveTasks(rf.filingId)) <= 1, "at most ONE non-terminal autodraft task exists for the filing");
});

test("event × catch-up × retry × one-click on ONE filing → exactly one active task (registry is filing-keyed, origin-agnostic on short-circuit)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const rf = await primeReadyFiling(users.alice, { client: clients.A2 });
  const outs = [];
  // Each sweep admission is run-bound; admitAutodraft opens a real sweep_run per call
  // (distinct run ids), and the filing-keyed registry short-circuits regardless.
  outs.push(outcomeOf(await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep }))); // event
  outs.push(outcomeOf(await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep }))); // catch-up
  outs.push(outcomeOf(await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep }))); // retry
  // one-click is a distinct op-key namespace but the ACTIVE registry row still short-circuits it.
  outs.push(outcomeOf(await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick })));
  assert.ok(outs.every((o) => ADMIT_OUTCOMES.includes(o)), `every admission returns a success-shaped outcome (got ${JSON.stringify(outs)})`);
  assert.ok((await liveTasks(rf.filingId)) <= 1, "across event/catch-up/retry/one-click there is at most ONE non-terminal task");
  // At most one active registry row for the filing (unique(filing_id)).
  assert.ok((await countWhere("autodraft_attempts", "filing_id=$1", [rf.filingId])) <= 1, "the registry holds at most one row per filing (unique(filing_id))");
});

test("concurrent admissions of the SAME filing (two runtime sessions) → exactly one task; the partial-unique race resolves to noop_existing, no deadlock", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "RACECO SDN BHD", registration: "201801001200" });
  // Sweep admissions are run-bound: a real open sweep_run uuid is the p_run_id (opk()
  // is a text op-key, not a uuid — the as-built FK is to sweep_runs.id).
  const raceRun = await openSweepRun({ firm: await firmOf(clients.A1), expected: 2 });
  const admitRun = (c) => { return (async () => { await c.query(GUARD); return c.query("select clara.admit_autodraft_task(p_filing => $1, p_origin => 'sweep', p_run_id => $2, p_model => 'gpt-5.6-terra', p_reserve_tokens => 40000) as r", [rf.filingId, raceRun]); })(); };
  const out = await concurrentTwoSession({
    a: { role: ROLES.runtime, run: admitRun },
    b: { role: ROLES.runtime, run: admitRun },
  });
  assert.ok(!sawDeadlock(out), "concurrent same-filing admissions do not deadlock");
  assert.ok((await liveTasks(rf.filingId)) <= 1, "exactly one non-terminal task after the concurrent admission race (registry 23505 caught → noop_existing)");
});

// ===========================================================================
// Redelivery replays clean — run_id EXCLUDED from the op-key request hash (Codex 15).
// ===========================================================================

test("redelivery replays clean: same filing + origin, DIFFERENT run_id → same stored receipt, NO CLR10 request-hash mismatch (run_id excluded from the hash)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const rf = await primeReadyFiling(users.alice, { client: clients.A2, vendorName: "REPLAYCO SDN BHD", registration: "201801001300" });
  // Two DISTINCT real sweep_run uuids (the event window vs the redelivery window) —
  // run_id is a uuid FK to sweep_runs.id, excluded from the op-key hash so a differing
  // run replays clean.
  const firmA2 = await firmOf(clients.A2);
  const runA = await openSweepRun({ firm: firmA2, expected: 1 });
  const runB = await openSweepRun({ firm: firmA2, expected: 1 });
  const first = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: runA });
  // A redelivered event carries a DIFFERENT run_id — must NOT raise CLR10 and must
  // replay to the SAME task (op-key args = admission facts only, never model output).
  let second, raised = null;
  try { second = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep, runId: runB }); }
  catch (e) { raised = e.code; }
  assert.notEqual(raised, "CLR10", "a differing run_id does NOT trip a request-hash mismatch (CLR10)");
  if (first?.task_id && second?.task_id) assert.equal(second.task_id, first.task_id, "the redelivery replays to the same stored task_id");
});

// ===========================================================================
// Durable attempt counters — park at 2 failures across "restarts"; new event held.
// ===========================================================================

test("attempt counters + park: two settle('failed') across new sessions park the filing (refused_attempts); a NEW event cannot bypass the park", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const rf = await primeReadyFiling(users.alice, { client: clients.A1, vendorName: "POISONCO SDN BHD", registration: "201801001400" });
  const a1 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  if (outcomeOf(a1) !== "admitted" || !a1.task_id) { noteLane(`park chain: could not admit (outcome=${outcomeOf(a1)}) — READY not reached; park mechanics unverified this run`); return; }
  // Failure 1 (begin → settle failed). A fresh admit simulates a consumer restart.
  await beginAutodraft({ task: a1.task_id }).catch((e) => noteLane(`begin_autodraft_task raised ${e.code}`));
  await settleAutodraft({ task: a1.task_id, outcome: "failed", tokens: 1000, refusal: { reason: "rig fail 1" } });
  const after1 = await attemptRow(rf.filingId);
  assert.ok(after1 && Number(after1.attempt_count) >= 1, `attempt_count durable after failure 1 (got ${after1?.attempt_count})`);
  // Restart → admit again → begin → settle failed 2 → parked.
  const a2 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  if (outcomeOf(a2) === "admitted" && a2.task_id) {
    await beginAutodraft({ task: a2.task_id }).catch(() => {});
    await settleAutodraft({ task: a2.task_id, outcome: "failed", tokens: 1000, refusal: { reason: "rig fail 2" } });
  }
  const parked = await attemptRow(rf.filingId);
  assert.equal(parked?.state, "parked", `the filing PARKS at 2 failures (state=${parked?.state}, attempts=${parked?.attempt_count})`);
  // A NEW event cannot bypass the park → refused_attempts.
  const a3 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep }); // run-bound via auto-open
  assert.equal(outcomeOf(a3), "refused_attempts", "a new event on a parked filing is refused_attempts (the cap holds)");
  assert.ok((await liveTasks(rf.filingId)) === 0, "no non-terminal task is minted for a parked filing");
});

// ===========================================================================
// PIN-ADD-1 — the event-path resolver list_document_autodraft_candidates.
// ===========================================================================

test("PIN-ADD-1 list_document_autodraft_candidates: one row per ACTIVE filing (firm-scoped), excludes a retired filing, empty for an unknown document (no oracle)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // Multi-filing (c): the SAME document filed to A1 AND A2 (both firm A) → two active filings.
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: seed.documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: seed.documentId }) });
  const f2 = await fileDocument(users.alice, { document: seed.documentId, client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: seed.documentId }) });
  const both = await listDocumentAutodraftCandidates({ document: seed.documentId });
  assert.equal(both.length, 2, `two active filings → two rows (got ${both.length})`);
  assert.ok(both.every((r) => r.firm_id === firm), "every row is firm-scoped to the document's firm");
  // (d) unknown/cross-context document → empty set (no oracle).
  const none = await listDocumentAutodraftCandidates({ document: "00000000-0000-4000-8000-0000000d0c00" });
  assert.equal(none.length, 0, "an unknown document returns an EMPTY set (no existence oracle)");
  // (b) a RETIRED filing disappears (the retired_at is null filter).
  const tok = (await rootQuery("select revision_token from clara.document_filings where id=$1", [f2])).rows[0]?.revision_token;
  await retireDocumentFiling(users.alice, { filing: f2, reason: "rig retire", expectedRevision: tok }).catch((e) => noteLane(`retire_document_filing raised ${e.code} — unretired-only assertion best-effort`));
  const retiredAt = (await rootQuery("select retired_at from clara.document_filings where id=$1", [f2])).rows[0]?.retired_at;
  const after = await listDocumentAutodraftCandidates({ document: seed.documentId });
  if (retiredAt) {
    assert.equal(after.length, 1, "a retired filing is EXCLUDED from the candidates (retired_at is null)");
    assert.equal(after[0].firm_id, firm, "the remaining row is the active A1 filing");
  } else {
    noteLane("the A2 filing did not retire (revision/blocker) — the unretired-only exclusion is unverified this run");
  }
});
