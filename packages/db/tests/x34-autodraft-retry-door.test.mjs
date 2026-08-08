// Migration 0034 -- the admission retry door (ledger #45, GitHub #43).
//
//   x34.a  a terminal-FAILED task (via settle_autodraft_task's own failure branch)
//          admits a genuinely NEW task on retry ('re_admitted'), the op receipt is
//          rewritten to point at it, attempt_count survives the supersede
//          (governance is not reset), and the new task dispatches + settles clean.
//   x34.b  a LIVE task's replay semantics are byte-identical to before 0034 --
//          queued/running/cancel_requested short-circuit to noop_existing, never
//          re-admitted; held/awaiting_input are proven GENUINELY UNREACHABLE for
//          kind='autodraft' (a build-time draft widened the live-status list to
//          include them, but clara._tf_agent_task_update's own transition matrix
//          rejects any such transition with CLR13 -- the widening was reverted,
//          not shipped as dead code).
//   x34.c  a COMPLETED task refuses honestly ('already_done') -- never a silent
//          re-admit, and the ORIGINAL admission receipt is left byte-untouched.
//   x34.d  reservation reconciliation on BOTH terminal paths, immediate case: a
//          genuine settle-failure (already refunded -- no double-refund) and a
//          generic cancel_agent_task cancellation (never refunded before 0034 --
//          proven not to leak once the retry door reconciles it), each retry
//          landing back on a lane-ready filing that succeeds all the way through.
//   x34.e  the parked (2-failure) governance gate is untouched -- a retry consumes
//          one of the two strikes, and a filing parked on the second genuine
//          failure still refuses (refused_attempts), never re_admitted.
//   x34.f  O-round confirmation (Codex, High/blocking): a cancellation's retry
//          that is ITSELF refused (lane_changed) must not re-refund the same
//          reservation on a later call -- the first-built fix only cleared
//          firm_usage_daily, never the attempt row's own reserved_tokens, so a
//          refused retry left the row re-enterable and re-refundable forever.
//          Reduction-tested: reverting the durable per-row UPDATE reproduces the
//          leak here.
//
// Migration 0053 -- §7-A FINDING F8 (ledger task #33): the unattended lane must be
// able to honor the remedy CLR23 itself prints. 0034 refused EVERY completed
// attempt; a WITHDRAWN entry falsifies its "the work already exists" premise, so a
// completed attempt whose filing carries no live entry now re-admits.
//
//   x34.g  THE FIX, end to end on the real product path: admit -> draft -> settle
//          'drafted' -> (standing draft: still already_done, the F8 wall reproduced
//          in the same cell as its own prestate) -> clara.withdraw_draft ->
//          re-admit as 're_admitted_after_withdrawal', a genuinely NEW queued task,
//          registry repointed, op-key receipt rewritten exactly once, and the new
//          task dispatches + settles clean.
//   x34.h  CONTRAST: completed + APPROVED-and-unreversed -> still already_done.
//   x34.i  CONTRAST: completed + approved-then-REVERSED -> still already_done. A
//          reversal is NOT a withdrawal: the work HAPPENED and was formally undone
//          in the books, so re-drafting is a human accounting judgement, not an
//          unattended retry. Deliberate boundary, pinned so it is not "fixed" later.
//   x34.j  The THIRD predicate is load-bearing, not decorative: a filing that
//          carries BOTH a withdrawn entry AND a later approved-and-unreversed one
//          refuses (already_done). REDUCTION-TESTED on a copy of the rig with that
//          one conjunct stripped: the branch then fires, the lane check downstream
//          still stops the draft (an independent backstop), but the refusal is
//          misnamed 'lane_changed' AND the branch's side effects have already
//          deleted the filing's settled admission receipt (1 -> 0). Both are
//          asserted here.
//
//   x34.c is ALSO the fourth contrast and is left UNMODIFIED: it settles
//   'skipped_lane' with no entry, so its filing has NO journal_entries row at all --
//   the "absence is not evidence" case, which must keep refusing.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  admitAutodraft,
  AP,
  approveEntry,
  attemptRow,
  autodraftDraftEntry,
  beginAutodraft,
  buildWorld,
  endPool,
  EXP,
  grantConsent,
  humanQuery,
  mintAutodraftCred,
  opk,
  ORIGIN,
  primeReadyFiling,
  reverseEntry,
  rootQuery,
  settleAutodraft,
  upsertAccountClassed,
  upsertPayableAccount,
  wakeBillDraft,
  withActor,
  withdrawDraft,
} from "./wave-a-fixtures.mjs";

let w = null;

async function has31() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0031_autopost_lane_unify'",
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function has34() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0034_autodraft_retry_door'",
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function has53() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0053_autodraft_readmit_after_withdrawal'",
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function requireReady() {
  if (!await has31()) {
    throw new Error(
      "0031_autopost_lane_unify is not applied -- x34 requires the post-0031 admission prestate",
    );
  }
  if (!await has34()) {
    throw new Error(
      "0034_autodraft_retry_door is not applied -- this battery must fail against the pre-0034 behavior",
    );
  }
  // 0053 is hard-required for the SAME reason 0034 is: the g/h/i/j cells must FAIL against
  // the pre-fix behavior rather than skip past it. (0034's own precedent, restated.)
  if (!await has53()) {
    throw new Error(
      "0053_autodraft_readmit_after_withdrawal is not applied -- the F8 cells must fail against the pre-0053 behavior, never skip",
    );
  }
}

/** The revision token + status of an entry, read fresh (withdraw/approve both need the
 *  CURRENT token, and settle does not rotate it -- so this is read at the point of use
 *  rather than cached from the draft receipt). */
async function entryRow(entry) {
  const r = await rootQuery(
    "select status, revision_token, reversed_by, reversal_of, filing_id from clara.journal_entries where id=$1",
    [entry],
  );
  return r.rows[0] ?? null;
}

/** Every journal entry bound to a filing -- the population the 0053 branch judges. */
async function entriesOf(filing) {
  const r = await rootQuery(
    "select id, status, reversed_by, reversal_of from clara.journal_entries where filing_id=$1 order by created_at, id",
    [filing],
  );
  return r.rows;
}

async function receiptCount(filing, origin = "one_click") {
  const r = await rootQuery(
    `select count(*)::int as n from clara.op_receipts
     where fn='admit_autodraft_task' and op_key='autodraft:'||$1::text||':'||$2`,
    [filing, origin],
  );
  return r.rows[0].n;
}

/** Drive an admitted task to a genuine DRAFT via the REAL wake path, with an EXPLICIT
 *  op_key. autodraftDraftEntry() hard-codes the deterministic `code-doc:<filing>:<doc>`
 *  key, so a SECOND draft on the same filing would replay the first receipt and hand back
 *  the OLD entry id -- silently turning a two-draft cell into a one-draft one. x34.j needs
 *  two genuine drafts on one filing, so it needs its own key. */
async function draftUnderTask(sub, { task, rf, firm, client, vendorName, amount = 500000, opKey }) {
  await beginAutodraft({ task, workflowRunId: `wf-${randomUUID()}` }).catch(() => {});
  const cred = await mintAutodraftCred(firm, client);
  const draft = await wakeBillDraft(sub, cred, { client, cited: rf, vendorName, amount, opKey });
  return draft.entry_id ?? draft.entryId ?? null;
}

/** admit -> real draft -> settle 'drafted'. Leaves: task COMPLETED, registry idle, and
 *  exactly one standing draft on the filing. The shared prestate of every F8 cell. */
async function completedAttemptWithDraft(label, vendorName) {
  const rf = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  const first = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(first.outcome, "admitted", `${label} premise: the fixture admits (${JSON.stringify(first)})`);
  const entry = await autodraftDraftEntry(w.users.alice, {
    task: first.task_id, rf, firm: w.firms.A, client: w.clients.A1, vendorName,
  });
  assert.ok(entry, `${label} premise: the real autodraft draft path produced an entry`);
  await settleAutodraft({ task: first.task_id, outcome: "drafted", tokens: 1200, entry });
  assert.equal(await taskStatus(first.task_id), "completed", `${label} premise: the task settled COMPLETED`);
  const row = await entryRow(entry);
  assert.equal(row.status, "draft", `${label} premise: the settled entry is a standing draft`);
  return { rf, task1: first.task_id, entry, vendorName };
}

async function liveTasks(filing) {
  const r = await rootQuery(
    `select count(*)::int as n
     from clara.autodraft_attempts aa
     join clara.agent_tasks t on t.id=aa.task_id
       where aa.filing_id=$1
         and t.kind='autodraft'
         and t.status not in ('completed','failed','cancelled','expired')`,
    [filing],
  );
  return r.rows[0].n;
}

async function taskStatus(task) {
  const r = await rootQuery("select status from clara.agent_tasks where id=$1", [task]);
  return r.rows[0]?.status ?? null;
}

async function receiptFor(filing, origin = "one_click") {
  const r = await rootQuery(
    `select result from clara.op_receipts
     where fn='admit_autodraft_task'
       and op_key='autodraft:'||$1::text||':'||$2`,
    [filing, origin],
  );
  return r.rows[0]?.result ?? null;
}

async function todaysUsage(firm) {
  const r = await rootQuery(
    `select coalesce(tokens_used,0)::bigint as used
     from clara.firm_usage_daily
     where firm_id=$1 and usage_date=(now() at time zone 'UTC')::date`,
    [firm],
  );
  return Number(r.rows[0]?.used ?? 0);
}

/** cancel_agent_task(p_task, p_op_key) -- the GENERIC verb (chat_turn/wake/autodraft
 *  share it), with NO autodraft_attempts awareness at all -- the second, independent
 *  gap 0034 must reconcile alongside a genuine settle_autodraft_task failure. */
async function cancelAgentTask(sub, { task, opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.cancel_agent_task(p_task => $1, p_op_key => $2) as r",
    [task, opKey ?? opk("x34-cancel")],
  );
  return r.rows[0].r;
}

before(async () => {
  await requireReady();
  w = await buildWorld();
  await upsertPayableAccount(w.users.alice, {
    client: w.clients.A1,
    code: "400-000",
    name: "Trade Creditors",
    opKey: opk("x34-ap"),
  });
  await upsertAccountClassed(w.users.alice, {
    client: w.clients.A1,
    code: "500-A01",
    name: "Prof Fees",
    type: "expense",
    opKey: opk("x34-exp"),
  });
  await grantConsent(w.users.alice, {
    firm: w.firms.A,
    client: w.clients.A1,
  });
});

after(async () => { await endPool(); });

test("x34.a a terminal-FAILED task retries into a genuinely NEW task, re_admitted, dispatched for real, attempt accounting correct", async () => {
  const rf = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-A ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });

  const first = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(first.outcome, "admitted", JSON.stringify(first));
  const task1 = first.task_id;

  await beginAutodraft({ task: task1 });
  await settleAutodraft({ task: task1, outcome: "failed", tokens: 1000, refusal: { reason: "x34.a rig fail" } });
  assert.equal(await taskStatus(task1), "failed");

  const afterFail = await attemptRow(rf.filingId);
  assert.equal(afterFail.state, "idle", "exactly one failure lands at idle, not parked");
  assert.equal(Number(afterFail.attempt_count), 1);
  assert.equal(Number(afterFail.reserved_tokens), 0, "settle_autodraft_task's own failure branch already refunded");
  assert.equal(afterFail.task_id, task1, "the registry row still points at the failed task (settle keys on task_id)");

  // Pre-0034 this call would silently replay the OLD 'admitted' receipt: same task_id,
  // nothing dispatched, attempt_count frozen -- exactly ledger #45/#43's sin.
  const retry = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 55000 });
  assert.equal(retry.outcome, "re_admitted", `the retry must be honestly labeled, not a plain 'admitted' or a replay: ${JSON.stringify(retry)}`);
  assert.notEqual(retry.task_id, task1, "the retry must mint a GENUINELY NEW task, not replay the old one");
  const task2 = retry.task_id;
  assert.equal(retry.reserved_tokens, 55000);

  assert.equal(await liveTasks(rf.filingId), 1, "exactly one non-terminal task after the retry (task1 is terminal, task2 is live)");

  const midway = await attemptRow(rf.filingId);
  assert.equal(midway.task_id, task2, "the registry now points at the fresh task");
  assert.equal(midway.state, "active");
  assert.equal(Number(midway.reserved_tokens), 55000);
  assert.equal(
    Number(midway.attempt_count), 1,
    "attempt_count must SURVIVE the supersede -- a retry that silently reset the strike count would let the park-at-2-failures governance be bypassed forever",
  );

  const receipt = await receiptFor(rf.filingId, "one_click");
  assert.ok(receipt, "the op receipt must be resettled, not left orphaned");
  assert.equal(receipt.outcome, "re_admitted", "the receipt itself must carry the honest outcome, not the stale 'admitted'");
  assert.equal(receipt.task_id, task2, "the receipt must point at the NEW task, never the superseded one");

  // Dispatch the retry for real and settle it clean -- proving the retry door does not
  // leave the fresh task in some half-wired state.
  await beginAutodraft({ task: task2 });
  await settleAutodraft({ task: task2, outcome: "skipped_lane", tokens: 500 });
  assert.equal(await taskStatus(task2), "completed");

  const settled = await attemptRow(rf.filingId);
  assert.equal(settled.task_id, task2);
  assert.equal(settled.state, "idle");
  assert.equal(Number(settled.attempt_count), 0, "a genuine success resets the strike count exactly as any other settlement would");
  assert.equal(Number(settled.reserved_tokens), 0);
});

test("x34.b a LIVE task (queued, then running, then cancel_requested) replays unchanged -- never re-admitted; held/awaiting_input are genuinely unreachable for autodraft, not merely untested", async () => {
  const rf = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-B ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  const first = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(first.outcome, "admitted", JSON.stringify(first));
  const task1 = first.task_id;

  // queued (the natural post-admission status) -- unchanged pre-0031 behavior.
  const replayQueued = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(replayQueued.outcome, "noop_existing", JSON.stringify(replayQueued));
  assert.equal(replayQueued.task_id, task1);

  // running (a real begin_autodraft_task transition, not a forced catalog write).
  await beginAutodraft({ task: task1 });
  assert.equal(await taskStatus(task1), "running");
  const replayRunning = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(replayRunning.outcome, "noop_existing", JSON.stringify(replayRunning));
  assert.equal(replayRunning.task_id, task1);

  // cancel_requested (a running task's cancellation stops there -- the engine must
  // settle it, cancel_agent_task cannot force it straight to 'cancelled') -- still
  // live, still replays, never treated as terminal.
  const cancelled = await cancelAgentTask(w.users.bob, { task: task1 });
  assert.equal(cancelled.status, "cancel_requested", JSON.stringify(cancelled));
  const replayCancelRequested = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(replayCancelRequested.outcome, "noop_existing", JSON.stringify(replayCancelRequested));
  assert.equal(replayCancelRequested.task_id, task1);

  assert.equal(await liveTasks(rf.filingId), 1);
  const attempt = await attemptRow(rf.filingId);
  assert.equal(attempt.task_id, task1);
  assert.equal(Number(attempt.attempt_count), 0, "a live replay never touches attempt_count");

  // held/awaiting_input were considered for the live-status list during 0034's build
  // and DROPPED: clara._tf_agent_task_update's own transition matrix for
  // kind='autodraft' proves they are structurally unreachable (queued only ever
  // reaches running/cancel_requested/cancelled; running only completed/failed/
  // cancel_requested; cancel_requested only completed/failed/cancelled) -- so this
  // is not an untested branch, it is a branch that cannot exist. Proven directly
  // rather than asserted: the DB itself refuses the transition.
  for (const status of ["held", "awaiting_input"]) {
    await assert.rejects(
      () => rootQuery("update clara.agent_tasks set status=$2 where id=$1", [task1, status]),
      (err) => err.code === "CLR13",
      `an autodraft task must never be able to reach status=${status} -- if this starts succeeding, the live-status list needs the widening back`,
    );
  }
});

test("x34.c a COMPLETED task refuses honestly ('already_done'); the ORIGINAL admission receipt is left byte-untouched", async () => {
  const rf = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-C ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  const first = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(first.outcome, "admitted", JSON.stringify(first));
  const task1 = first.task_id;
  await beginAutodraft({ task: task1 });
  await settleAutodraft({ task: task1, outcome: "skipped_lane", tokens: 200 });
  assert.equal(await taskStatus(task1), "completed");

  const originalReceipt = await receiptFor(rf.filingId, "one_click");
  assert.equal(originalReceipt.outcome, "admitted");
  assert.equal(originalReceipt.task_id, task1);

  const refused = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(refused.outcome, "already_done", `a completed task must refuse honestly, never silently re-admit: ${JSON.stringify(refused)}`);
  assert.equal(refused.task_id, task1);

  assert.equal(await liveTasks(rf.filingId), 0, "a completed task is terminal -- no non-terminal task exists");

  // The 'completed' branch returns before ever touching v_op_key / _reserve_op /
  // _finish_op -- the ORIGINAL 'admitted' receipt must be exactly as it was, never
  // rewritten to 'already_done' and never duplicated.
  const receiptAfter = await receiptFor(rf.filingId, "one_click");
  assert.deepEqual(receiptAfter, originalReceipt, "the already_done refusal must never touch the settled admission receipt");
  const receiptCount = (await rootQuery(
    `select count(*)::int as n from clara.op_receipts
     where fn='admit_autodraft_task' and op_key='autodraft:'||$1::text||':one_click'`,
    [rf.filingId],
  )).rows[0].n;
  assert.equal(receiptCount, 1, "no second receipt is created for the honest refusal");

  const attempt = await attemptRow(rf.filingId);
  assert.equal(attempt.task_id, task1, "the registry row is untouched by the refusal");
  assert.equal(attempt.state, "idle");
});

test("x34.d reservation reconciliation across the supersede -- a genuine settle-failure (already refunded, no double-refund) and a cancel_agent_task cancellation (never refunded before 0034, proven not to leak)", async () => {
  const firm = w.firms.A;

  // ---- d1: settle('failed') already refunded -- the retry must NOT refund again. ----
  const rf1 = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-D1 ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  const before1 = await todaysUsage(firm);
  const first1 = await admitAutodraft({ filing: rf1.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(first1.outcome, "admitted", JSON.stringify(first1));
  const afterAdmit1 = await todaysUsage(firm);
  assert.equal(afterAdmit1 - before1, 40000, "the admission reserves exactly the requested tokens");

  await beginAutodraft({ task: first1.task_id });
  await settleAutodraft({ task: first1.task_id, outcome: "failed", tokens: 1000, refusal: { reason: "x34.d1 rig fail" } });
  const afterSettle1 = await todaysUsage(firm);
  assert.equal(afterSettle1 - before1, 0, "settle_autodraft_task's own failure branch already refunded the reservation net to zero");
  const registryAfterSettle1 = await attemptRow(rf1.filingId);
  assert.equal(Number(registryAfterSettle1.reserved_tokens), 0);

  const retry1 = await admitAutodraft({ filing: rf1.filingId, origin: ORIGIN.oneClick, reserveTokens: 33000 });
  assert.equal(retry1.outcome, "re_admitted", JSON.stringify(retry1));
  const afterRetry1 = await todaysUsage(firm);
  assert.equal(
    afterRetry1 - before1, 33000,
    "the retry reserves exactly the NEW amount -- a double-refund bug would show up as a negative or short delta here",
  );

  // ---- d2: cancel_agent_task never refunds -- the retry itself must reconcile it. ----
  const rf2 = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-D2 ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  const before2 = await todaysUsage(firm);
  const first2 = await admitAutodraft({ filing: rf2.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(first2.outcome, "admitted", JSON.stringify(first2));
  const afterAdmit2 = await todaysUsage(firm);
  assert.equal(afterAdmit2 - before2, 40000);

  // task1 is 'queued' (never begun) -- cancel_agent_task's queued/held branch cancels
  // it directly, terminal, no engine involved.
  const cancelled = await cancelAgentTask(w.users.bob, { task: first2.task_id });
  assert.equal(cancelled.status, "cancelled", JSON.stringify(cancelled));
  assert.equal(await taskStatus(first2.task_id), "cancelled");

  // THE DEFECT #43's second gap, reproduced directly: cancel_agent_task has zero
  // autodraft_attempts awareness -- the reservation is genuinely still outstanding.
  const afterCancel2 = await todaysUsage(firm);
  assert.equal(afterCancel2 - before2, 40000, "cancel_agent_task does NOT refund -- the reservation is still outstanding immediately after cancellation");
  const registryAfterCancel2 = await attemptRow(rf2.filingId);
  assert.equal(registryAfterCancel2.state, "active", "the registry row is STALE ('active') after a generic cancellation -- 0034 must read task_status, not state, to see through this");
  assert.equal(Number(registryAfterCancel2.reserved_tokens), 40000, "the stale row still carries the un-refunded reservation");

  const retry2 = await admitAutodraft({ filing: rf2.filingId, origin: ORIGIN.oneClick, reserveTokens: 27000 });
  assert.equal(retry2.outcome, "re_admitted", `a cancelled task must be recognized as terminal despite state='active': ${JSON.stringify(retry2)}`);
  assert.notEqual(retry2.task_id, first2.task_id);

  const afterRetry2 = await todaysUsage(firm);
  assert.equal(
    afterRetry2 - before2, 27000,
    "the retry must refund the never-refunded 40000 AND reserve the new 27000 -- no leak, no double-count",
  );
  const registryAfterRetry2 = await attemptRow(rf2.filingId);
  assert.equal(registryAfterRetry2.task_id, retry2.task_id);
  assert.equal(registryAfterRetry2.state, "active");
  assert.equal(Number(registryAfterRetry2.reserved_tokens), 27000);
});

test("x34.e the parked (2-failure) governance gate is untouched -- a retry consumes one strike, and a parked filing still refuses via refused_attempts, never re_admitted", async () => {
  const rf = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-E ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });
  const first = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(first.outcome, "admitted", JSON.stringify(first));
  await beginAutodraft({ task: first.task_id });
  await settleAutodraft({ task: first.task_id, outcome: "failed", tokens: 1000, refusal: { reason: "x34.e rig fail 1" } });
  assert.equal(Number((await attemptRow(rf.filingId)).attempt_count), 1);

  const retry = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(retry.outcome, "re_admitted", JSON.stringify(retry));
  assert.equal(
    Number((await attemptRow(rf.filingId)).attempt_count), 1,
    "the retry-admit itself does not add a strike -- only a genuine settlement does",
  );

  await beginAutodraft({ task: retry.task_id });
  await settleAutodraft({ task: retry.task_id, outcome: "failed", tokens: 1000, refusal: { reason: "x34.e rig fail 2" } });
  const parked = await attemptRow(rf.filingId);
  assert.equal(parked.state, "parked", `two genuine failures (across one retry-door supersede) must still park: ${JSON.stringify(parked)}`);
  assert.equal(Number(parked.attempt_count), 2);

  const blocked = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.equal(blocked.outcome, "refused_attempts", `the parked branch must take precedence over the terminal-retry branch: ${JSON.stringify(blocked)}`);
  assert.equal(await liveTasks(rf.filingId), 0, "no task is minted for a parked filing, retry door or not");
});

test("x34.f O-round confirmation (Codex): a cancellation whose retry is ITSELF refused (lane_changed) must NOT re-refund the same reservation on a later call", async () => {
  const firm = w.firms.A;
  const primed = await primeReadyFiling(w.users.alice, {
    client: w.clients.A1,
    vendorName: `X34-F ${randomUUID().slice(0, 8)} SDN BHD`,
    registration: `2026${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  });

  const beforeAll = await todaysUsage(firm);
  const first = await admitAutodraft({ filing: primed.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(first.outcome, "admitted", JSON.stringify(first));
  assert.equal((await todaysUsage(firm)) - beforeAll, 40000);

  // Cancel the (still-queued) task -- reserved_tokens=40000 is now genuinely
  // outstanding on the row, never refunded by cancel_agent_task itself.
  const cancelled = await cancelAgentTask(w.users.bob, { task: first.task_id });
  assert.equal(cancelled.status, "cancelled", JSON.stringify(cancelled));

  // Open an unresolved draft on the SAME filing (the x31.e technique) so the retry's
  // own lane check refuses it -- the exact shape that exposes an early return AFTER
  // the terminal branch's refund but BEFORE the success-path upsert would ever reset
  // reserved_tokens.
  const draft = await withActor({ transaction: true }, async (client) => {
    const inserted = await client.query(
      `insert into clara.journal_entries(
         firm_id,client_id,status,posting_date,memo,origin,document_id,
         filing_id,source_doc_sha256,maker_actor
       ) values (
         $1,$2,'draft','2026-03-15','x34.f open-draft blocker','agent',$3,$4,$5,$6
       ) returning id`,
      [firm, w.clients.A1, primed.documentId, primed.filingId, primed.sha256, w.users.alice],
    );
    const entry = inserted.rows[0].id;
    await client.query(
      `insert into clara.journal_lines(
         entry_id,line_no,account_code,debit_cents,credit_cents,
         description,counterparty_id
       ) values
         ($1,1,$2,50000,0,'x34.f blocker expense',$4),
         ($1,2,$3,0,50000,'x34.f blocker payable',$4)`,
      [entry, EXP, AP, primed.counterpartyId],
    );
    return entry;
  });

  const beforeRefusedRetry = await todaysUsage(firm);
  const refusedRetry1 = await admitAutodraft({ filing: primed.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(refusedRetry1.outcome, "lane_changed", `the retry itself must be refused by the open draft, exercising the exact early-return path: ${JSON.stringify(refusedRetry1)}`);
  const afterRefusedRetry = await todaysUsage(firm);
  assert.equal(afterRefusedRetry - beforeRefusedRetry, -40000, "the terminal branch's refund fires exactly once, even though this call itself is refused");

  const reconciled = await attemptRow(primed.filingId);
  assert.equal(Number(reconciled.reserved_tokens), 0, "the reservation must be DURABLY cleared on the attempt row itself, not left at the old amount for the next call to re-refund");
  assert.equal(reconciled.state, "idle", "a non-active state is required by ck_autodraft_attempts_reservation once reserved_tokens=0");

  // THE ACTUAL DEFECT, reproduced directly: a second call while still blocked must NOT
  // subtract another 40,000 -- the guard (a.reserved_tokens>0) must see 0 this time.
  const refusedRetry2 = await admitAutodraft({ filing: primed.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(refusedRetry2.outcome, "lane_changed", JSON.stringify(refusedRetry2));
  const afterSecondRefusedRetry = await todaysUsage(firm);
  assert.equal(
    afterSecondRefusedRetry, afterRefusedRetry,
    `a second refused retry must NOT re-refund -- firm_usage_daily moved by ${afterSecondRefusedRetry - afterRefusedRetry} when it should be unchanged`,
  );

  // Resolve the blocker and confirm the door still genuinely works end-to-end once the
  // lane clears -- the fix must not have broken the success path it sits in front of.
  await withActor({ transaction: true }, async (client) => {
    await client.query(
      `update clara.journal_entries
       set status='withdrawn', withdrawn_by=$2, withdrawn_at=now(),
           withdrawal_reason='x34.f blocker resolved'
       where id=$1`,
      [draft, w.users.alice],
    );
  });
  const finalRetry = await admitAutodraft({ filing: primed.filingId, origin: ORIGIN.oneClick, reserveTokens: 22000 });
  assert.equal(finalRetry.outcome, "re_admitted", JSON.stringify(finalRetry));
  assert.notEqual(finalRetry.task_id, first.task_id);
  const afterFinal = await todaysUsage(firm);
  assert.equal(
    afterFinal - beforeAll, 22000,
    "net across the whole cell: +40000 (first admit) -40000 (single genuine refund) +22000 (final successful retry) = +22000 from baseline, proving no leak and no double-refund end to end",
  );
});

// ===========================================================================
// 0053 -- §7-A FINDING F8: the unattended lane can honor CLR23's own remedy.
// ===========================================================================

test("x34.g a COMPLETED attempt whose entry is WITHDRAWN re-admits ('re_admitted_after_withdrawal') into a genuinely NEW task -- while a STANDING draft still refuses", async () => {
  const { rf, task1, entry } = await completedAttemptWithDraft("x34.g", `X34-G ${randomUUID().slice(0, 8)} SDN BHD`);

  const receiptBefore = await receiptFor(rf.filingId, "one_click");
  assert.equal(receiptBefore.outcome, "admitted");
  assert.equal(receiptBefore.task_id, task1);

  // ---- THE WALL, REPRODUCED IN ITS OWN PRESTATE. While the draft STANDS, 0034's honest
  // refusal is exactly right and 0053 must not have touched it: the work really does exist.
  const whileStanding = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(
    whileStanding.outcome, "already_done",
    `a completed attempt with a STANDING draft must still refuse -- 0053 narrowed the branch, it did not open it: ${JSON.stringify(whileStanding)}`,
  );
  assert.equal(whileStanding.task_id, task1);
  assert.equal(await liveTasks(rf.filingId), 0, "no task is minted while the draft stands");
  assert.deepEqual(
    await receiptFor(rf.filingId, "one_click"), receiptBefore,
    "the standing-draft refusal must leave the settled admission receipt byte-untouched (x34.c's law, re-asserted on this shape)",
  );

  // ---- THE REMEDY CLR23 PRINTS, TAKEN THROUGH THE REAL VERB.
  const pre = await entryRow(entry);
  await withdrawDraft(w.users.alice, {
    entry, reason: "x34.g CLR23 redraft cycle", expectedRevision: pre.revision_token, opKey: opk("x34-g-wd"),
  });
  const post = await entryRow(entry);
  assert.equal(post.status, "withdrawn", "clara.withdraw_draft flipped the entry -- the POSITIVE evidence the branch reads");
  // The premise F8 is about, read rather than assumed: the withdrawal is structurally
  // invisible to the registry, which still points at the completed task.
  const staleRegistry = await attemptRow(rf.filingId);
  assert.equal(staleRegistry.task_id, task1, "withdraw_draft never touches clara.autodraft_attempts -- the registry still points at the completed task");

  // ---- THE FIX.
  const readmit = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 31000 });
  assert.equal(
    readmit.outcome, "re_admitted_after_withdrawal",
    `a withdrawn filing must re-admit under its OWN token -- never 'already_done' (F8), and never the plain 're_admitted', which means a failed/cancelled/expired retry: ${JSON.stringify(readmit)}`,
  );
  assert.notEqual(readmit.task_id, task1, "the re-admission must mint a GENUINELY NEW task, not replay the completed one");
  assert.equal(readmit.reserved_tokens, 31000);
  const task2 = readmit.task_id;

  // A REAL queued agent_task, not a bookkeeping entry -- this is what the runtime enqueues.
  assert.equal(await taskStatus(task2), "queued", "the re-admitted task is a real QUEUED agent_tasks row");
  assert.equal(await liveTasks(rf.filingId), 1, "exactly one non-terminal task after the re-admission");

  const registry = await attemptRow(rf.filingId);
  assert.equal(registry.task_id, task2, "the registry now points at the fresh task");
  assert.equal(registry.state, "active");
  assert.equal(Number(registry.reserved_tokens), 31000);

  // OP-KEY HYGIENE, mirroring the supersede branch: the stale settled receipt is cleared and
  // re-settled under the SAME deterministic key -- one row, carrying the honest outcome.
  const receiptAfter = await receiptFor(rf.filingId, "one_click");
  assert.equal(receiptAfter.outcome, "re_admitted_after_withdrawal", "the durable receipt must carry the honest token, not the stale 'admitted'");
  assert.equal(receiptAfter.task_id, task2, "the receipt must point at the NEW task");
  assert.equal(await receiptCount(rf.filingId, "one_click"), 1, "exactly one op receipt for the deterministic key -- cleared and re-settled, never duplicated");

  // END TO END: the re-admitted task drafts and settles for real, so the door cannot leave a
  // half-wired task behind.
  const entry2 = await draftUnderTask(w.users.alice, {
    task: task2, rf, firm: w.firms.A, client: w.clients.A1,
    vendorName: rf.vendorName, opKey: opk("x34-g-redraft"),
  });
  assert.ok(entry2, "the re-admitted task drafts for real");
  assert.notEqual(entry2, entry, "the redraft is a NEW entry, never the withdrawn one");
  await settleAutodraft({ task: task2, outcome: "drafted", tokens: 900, entry: entry2 });
  assert.equal(await taskStatus(task2), "completed");
  const settled = await attemptRow(rf.filingId);
  assert.equal(settled.state, "idle");
  assert.equal(Number(settled.reserved_tokens), 0);
});

test("x34.h CONTRAST: a COMPLETED attempt whose entry is APPROVED and unreversed still refuses ('already_done')", async () => {
  const { rf, task1, entry } = await completedAttemptWithDraft("x34.h", `X34-H ${randomUUID().slice(0, 8)} SDN BHD`);
  const receiptBefore = await receiptFor(rf.filingId, "one_click");

  const pre = await entryRow(entry);
  await approveEntry(w.users.alice, { entry, expectedRevision: pre.revision_token, opKey: opk("x34-h-ap") });
  const post = await entryRow(entry);
  assert.equal(post.status, "approved");
  assert.equal(post.reversed_by, null, "premise: the approved entry is LIVE (not reversed)");

  const refused = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(
    refused.outcome, "already_done",
    `an approved-and-unreversed entry means the work exists and is in the books -- the refusal must stand: ${JSON.stringify(refused)}`,
  );
  assert.equal(refused.task_id, task1);
  assert.equal(await liveTasks(rf.filingId), 0, "no task is minted for an already-coded filing");
  assert.deepEqual(await receiptFor(rf.filingId, "one_click"), receiptBefore, "the refusal leaves the settled receipt byte-untouched");
});

test("x34.i CONTRAST (deliberate boundary): a COMPLETED attempt whose entry was approved and then REVERSED still refuses -- a reversal is not a withdrawal", async () => {
  const { rf, task1, entry } = await completedAttemptWithDraft("x34.i", `X34-I ${randomUUID().slice(0, 8)} SDN BHD`);
  const receiptBefore = await receiptFor(rf.filingId, "one_click");

  const pre = await entryRow(entry);
  await approveEntry(w.users.alice, { entry, expectedRevision: pre.revision_token, opKey: opk("x34-i-ap") });
  await reverseEntry(w.users.alice, { entry, reason: "x34.i reversal", opKey: opk("x34-i-rv") });

  // Read the post-state the branch actually judges rather than assuming its shape: the
  // ORIGINAL keeps status='approved' and gains reversed_by (0003:97-99), and whether the
  // mirror carries this filing_id is the DB's business, not this cell's assumption. Either
  // shape must refuse, and the cell records which one the DB produced.
  const original = await entryRow(entry);
  assert.equal(original.status, "approved", "a reversed original KEEPS 'approved'");
  assert.ok(original.reversed_by, "premise: the original is now linked to its reversal");
  const rows = await entriesOf(rf.filingId);
  assert.equal(
    rows.filter((r) => r.status === "withdrawn").length, 0,
    "premise: a reversal produces NO withdrawn row -- which is exactly why the 0053 branch cannot fire here",
  );

  const refused = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(
    refused.outcome, "already_done",
    `a reversal means the work HAPPENED and was formally undone in the books; re-drafting is a human accounting judgement, not an unattended retry. If this ever starts re-admitting, 0053's header records the decision to change, not a bug to fix: ${JSON.stringify(refused)}`,
  );
  assert.equal(refused.task_id, task1);
  assert.equal(await liveTasks(rf.filingId), 0);
  assert.deepEqual(await receiptFor(rf.filingId, "one_click"), receiptBefore, "the refusal leaves the settled receipt byte-untouched");
});

test("x34.j the no-live-entry predicate is LOAD-BEARING: a filing carrying BOTH a withdrawn entry and a later approved one refuses", async () => {
  const { rf, entry } = await completedAttemptWithDraft("x34.j", `X34-J ${randomUUID().slice(0, 8)} SDN BHD`);

  // (1) withdraw -> re-admit, exactly as x34.g proves.
  const pre = await entryRow(entry);
  await withdrawDraft(w.users.alice, {
    entry, reason: "x34.j first cycle", expectedRevision: pre.revision_token, opKey: opk("x34-j-wd"),
  });
  const readmit = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 25000 });
  assert.equal(readmit.outcome, "re_admitted_after_withdrawal", JSON.stringify(readmit));

  // (2) The redraft is approved, so the filing is now genuinely CODED -- and the withdrawn
  // row from cycle 1 is still sitting there.
  const entry2 = await draftUnderTask(w.users.alice, {
    task: readmit.task_id, rf, firm: w.firms.A, client: w.clients.A1,
    vendorName: rf.vendorName, opKey: opk("x34-j-redraft"),
  });
  assert.ok(entry2);
  await settleAutodraft({ task: readmit.task_id, outcome: "drafted", tokens: 800, entry: entry2 });
  const r2 = await entryRow(entry2);
  await approveEntry(w.users.alice, { entry: entry2, expectedRevision: r2.revision_token, opKey: opk("x34-j-ap") });

  const rows = await entriesOf(rf.filingId);
  assert.ok(
    rows.some((r) => r.status === "withdrawn") && rows.some((r) => r.status === "approved" && r.reversed_by === null),
    `premise: the filing carries BOTH a withdrawn row and a live approved one -- the exact shape the third predicate exists for: ${JSON.stringify(rows)}`,
  );
  const receiptBefore = await receiptFor(rf.filingId, "one_click");
  assert.ok(receiptBefore, "premise: the filing carries a settled admission receipt under the deterministic op-key");

  // (3) THE MEASUREMENT, AND WHAT THE REDUCTION ACTUALLY SHOWED. A branch that asked only
  // "does a withdrawn row exist" fires here. It does NOT then draft into the coded filing --
  // the lane check downstream is an independent backstop and refuses (double_coded). What it
  // DOES do, measured on a reduced copy of this database rather than argued:
  //   * it reports 'lane_changed' instead of 'already_done' -- naming the wrong reason for
  //     the refusal, which is the same class of dishonest receipt 0034 called the #43 sin; and
  //   * its side effects run FIRST, so the settled admission receipt under the deterministic
  //     op-key is DELETED (measured: 1 receipt with the predicate, 0 without) and the registry
  //     row is rewritten -- on EVERY such call, for a filing that is correctly refused.
  // Both assertions below fail against the reduced body; the receipt one is the sharper of
  // the two because it survives any future change to which refusal token the lane emits.
  const refused = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick, reserveTokens: 40000 });
  assert.equal(
    refused.outcome, "already_done",
    `a withdrawn row is not enough -- the filing is coded, so the door must refuse BY NAME, not fall through to a lane refusal: ${JSON.stringify(refused)}`,
  );
  assert.equal(await liveTasks(rf.filingId), 0, "no task is minted for a filing that is already coded");
  assert.deepEqual(
    await receiptFor(rf.filingId, "one_click"), receiptBefore,
    "the refusal must not run the re-admit branch's side effects -- deleting the settled admission receipt of an already-coded filing erases the record of what really happened",
  );
  assert.equal(await receiptCount(rf.filingId, "one_click"), 1, "the deterministic op-key still carries exactly its one settled receipt");
});
