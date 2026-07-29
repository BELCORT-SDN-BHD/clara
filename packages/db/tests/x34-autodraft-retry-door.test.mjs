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
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  admitAutodraft,
  AP,
  attemptRow,
  beginAutodraft,
  buildWorld,
  endPool,
  EXP,
  grantConsent,
  humanQuery,
  opk,
  ORIGIN,
  primeReadyFiling,
  rootQuery,
  settleAutodraft,
  upsertAccountClassed,
  upsertPayableAccount,
  withActor,
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
