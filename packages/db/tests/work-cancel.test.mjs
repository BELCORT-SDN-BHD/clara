// #630 — SETTLING ADMITTED OPERATIONS UNDER CANCEL / REVOKE / LOCK-PERIOD RACES.
//
// The one claim this battery exists to prove: ADMISSION AND CANCELLATION SERIALISE ON ONE ROW
// LOCK — `clara.accounting_work` — so exactly one of them wins, no effect is ever created by the
// loser, and the winner's answer names what actually happened. Everything else here (the mirror's
// `stopping`, the settle's cancel translation, the takeover, the revoked reader) is a consequence
// of that boundary.
//
// CONTRACT-BLIND against #630's own contract, frontier-gated on the `work_cancel_ordering$` stem.
//
// A REFUSAL MUST LEAVE NOTHING BEHIND, and both halves are asserted every time: no journal rows
// (the entry count is unmoved) and no committed receipt. A cancel that answered `cancelled` over a
// posted entry, or an entry posted under a cancelled Work, is the exact failure this file is for.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateCancel, buildWorkWorld, endPool, printLaneNotes, printSkipCount, noteLane,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  settleWorkRun, cancelAgentTask, taskRow, workRow, receiptsForWork, entriesForClient,
  entryCount, committedReceiptCount, tasksForWork,
  cancelAccountingWork, takeOverAccountingWork, workAuthoritySnapshot,
  deactivateMember, demoteMember, interruptionsForTask, responsibleOf, timelineEvents,
  basis, REASON, CLR, CANCEL_REASON, CANCEL_ANSWER, assertPair, assertRaises,
  rootQuery, humanQuery, roleQuery, opk, ROLES, insertUser, addMember,
} from "./work-cancel-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";

let world = null;
let colleague = null; // a SECOND active bookkeeper of firm A — the takeover's taker.
before(async () => {
  world = await buildWorkWorld();
  colleague = await insertUser(world.prefix, "frank");
  await addMember(world.users.alice, {
    firm: world.firms.A, user: colleague, role: "bookkeeper", opKey: opk("w630-mem"),
  });
});
after(async () => {
  printLaneNotes("work-cancel");
  printSkipCount("work-cancel");
  await endPool();
});

const A1 = () => world.clients.A1;
const B1 = () => world.clients.B1;
const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const CAROL = () => world.users.carol;
const DAVE = () => world.users.dave;

/** Admit a Work. `author` is its initiator (and, until a takeover, its responsible human). */
async function admitted({ client = null, author = null, b = null, origin = "user_direct" } = {}) {
  const cli = client ?? A1();
  const who = author ?? BOB();
  const work = await admitJournalWork({
    client: cli, author: who, basis: b ?? basis(), origin,
  });
  return { ...work, client: cli, author: who, basis: b ?? basis() };
}

/** Admit + claim: the Work is `running` and its task holds an engine run. */
async function running(opts = {}) {
  const w = await admitted(opts);
  await claimWorkRun({ task: w.task_id, runId: opk("run") });
  return w;
}

/** Park a claimed run on a clarify through the estate's OWN opener (0006's runtime verb). */
async function park(task, question = { type: "text", text: "which bank account is this?" }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.open_interruption(p_task => $1, p_hook_token => $2, p_question => $3::jsonb, p_asked_of => null) as id",
    [task, opk("w630-hook"), JSON.stringify(question)]);
  return r.rows[0].id;
}

// -------------------------------------------------------------------------------------------
// RAW CONNECTIONS. Three cells below need a transaction held OPEN across several statements (a
// lock held while something else races it), which the pooled `withActor` helpers deliberately do
// not expose: they commit and reset. Each raw client is released in a `finally`.
// -------------------------------------------------------------------------------------------

async function rawClient({ role = null, sub = null, wakeSecret = null } = {}) {
  const c = await getPool().connect();
  if (role) await c.query(`set role ${role}`);
  else await c.query("reset role");
  if (sub !== null) {
    await c.query("select set_config('request.jwt.claims', $1, false)",
      [JSON.stringify({ sub, role: "authenticated" })]);
  }
  if (wakeSecret !== null) await c.query("select set_config('clara.wake_secret', $1, false)", [wakeSecret]);
  return c;
}

async function releaseRaw(c) {
  if (!c) return;
  await c.query("rollback").catch(() => {});
  await c.query("reset role").catch(() => {});
  await c.query("reset all").catch(() => {});
  c.release();
}

const backendPid = async (c) => (await c.query("select pg_backend_pid() as p")).rows[0].p;

/** Poll pg_stat_activity until `pid` is actually WAITING ON A LOCK. The estate's own witness that
 *  a transaction is queued behind a row lock — never a sleep, which asserts nothing. */
async function waitingOnLock(pid, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await rootQuery("select wait_event_type as w from pg_stat_activity where pid=$1", [pid]);
    if (r.rows[0]?.w === "Lock") return true;
    await new Promise((x) => setTimeout(x, 25));
  }
  return false;
}

/** Does `pid` already hold a WRITE lock on a relation? This is how "it blocked BEFORE it wrote
 *  anything" is measured rather than assumed: an INSERT takes RowExclusiveLock on its table the
 *  moment it executes, so a poster that is waiting WITHOUT this lock has not inserted. */
async function holdsWriteLock(pid, relation) {
  const r = await rootQuery(
    `select count(*)::int as n from pg_locks
      where pid=$1 and granted and locktype='relation'
        and relation = $2::regclass and mode in ('RowExclusiveLock','ExclusiveLock')`,
    [pid, relation]);
  return r.rows[0].n > 0;
}

/** Plant a PENDING question against a task no door would let park (a queued run). Root, stated. */
async function plantQuestion(task) {
  const r = await rootQuery(
    `insert into clara.agent_interruptions(task_id, hook_token, question, expires_at)
     values ($1, $2, '{"type":"text","text":"which bank account is this?"}'::jsonb, now() + interval '7 days')
     returning id`, [task, opk("w630-planted")]);
  return r.rows[0].id;
}

/** Post the Work's admitted entry under a REAL `interactive_client` credential — the only
 *  posture in which the commit-time authority recheck is actually exercised. */
async function post(w, { author = null } = {}) {
  const cred = await mintClientObo({ firm: FIRM_A(), obo: author ?? w.author, client: w.client });
  return wakeRecordJournalEntry(cred.secret, {
    client: w.client, work: w.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  });
}


// ===========================================================================================
// §A1 — clara.cancel_accounting_work: the door and its matrix.
// ===========================================================================================

test("wc.1 cancelling a QUEUED Work terminalises both halves, cancels its pending question and posts nothing", async (t) => {
  if (await gateCancel(t)) return;
  const w = await admitted();
  // A PENDING QUESTION AGAINST A QUEUED RUN. `clara.open_interruption` refuses a task that is not
  // `running`, so the estate has no door that produces this pair — and the cancel door's cascade
  // runs BEFORE it branches into the queued arm, so the pair is reachable code that no door can
  // set up. Planted as root, stated rather than hidden (wc.10's precedent), because the
  // alternative is the assertion this cell used to carry: one guarded by a condition that was
  // always false.
  const q = await plantQuestion(w.task_id);
  const before = await entryCount(w.client);

  const out = await cancelAccountingWork({ work: w.work_id, author: BOB() });
  assert.equal(out.cancelled, true, "wc.1 the door reports it cancelled the Work");
  assert.equal(out.status, "cancelled", "wc.1 a Work with no engine run reaches the TERMINAL directly");
  assert.equal(out.work_id, w.work_id);
  assert.equal(out.cancelled_by, BOB(), "wc.1 the answer names who cancelled");
  assert.ok(out.cancelled_at, "wc.1 …and when");

  assert.equal((await workRow(w.work_id)).status, "cancelled", "wc.1 the Work row is cancelled");
  assert.equal((await taskRow(w.task_id)).status, "cancelled", "wc.1 the task row is cancelled");
  assert.equal(await entryCount(w.client), before, "wc.1 nothing was posted");
  assert.equal((await receiptsForWork(w.work_id)).length, 0, "wc.1 no operation receipt exists");
  const rows = await interruptionsForTask(w.task_id);
  assert.equal(rows.length, 1, "wc.1 the planted question is the only one");
  assert.equal(rows[0].id, q, "wc.1 …and it is the one we planted");
  assert.equal(rows[0].status, "cancelled",
    "wc.1 the cascade runs on the QUEUED arm too — no question outlives the run it belongs to");
});

test("wc.2 the SAME op key replays the original answer; a DIFFERENT key on a terminal Work answers already_terminal", async (t) => {
  if (await gateCancel(t)) return;
  const w = await admitted();
  const key = opk("w630-replay");
  const first = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: key });
  const again = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: key });
  assert.equal(again.replayed, true, "wc.2 a duplicate cancel REPLAYS rather than acting twice");
  assert.equal(again.status, first.status, "wc.2 …and returns the original answer");
  assert.equal(again.work_id, first.work_id);

  const third = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: opk("w630-second") });
  assert.equal(third.cancelled, false, "wc.2 a second cancel under a NEW key is not an error");
  assert.equal(third.reason, CANCEL_ANSWER.alreadyTerminal, "wc.2 …it reports already_terminal");
  assert.equal(third.status, "cancelled");
});

test("wc.3 cancelling a RUNNING Work requests the abort and shows STOPPING — never the terminal early", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  assert.equal((await workRow(w.work_id)).status, "running", "wc.3 precondition: the Work is running");

  const out = await cancelAccountingWork({ work: w.work_id, author: BOB() });
  assert.equal(out.cancelled, true);
  assert.equal(out.status, "stopping", "wc.3 the Work shows STOPPING while the admitted run settles");
  assert.equal((await workRow(w.work_id)).status, "stopping", "wc.3 …on the row itself");
  const task = await taskRow(w.task_id);
  assert.equal(task.status, "cancel_requested", "wc.3 the task carries the abort REQUEST, not a terminal");
  assert.equal(task.cancelled_by, BOB(), "wc.3 the task names who asked");
  assert.ok(task.cancelled_at);
});

test("wc.4 cancelling a PARKED Work cancels its pending question and shows stopping", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  await park(w.task_id);
  assert.equal((await taskRow(w.task_id)).status, "awaiting_input", "wc.4 precondition: parked");

  const out = await cancelAccountingWork({ work: w.work_id, author: BOB() });
  assert.equal(out.status, "stopping");
  const rows = await interruptionsForTask(w.task_id);
  assert.ok(rows.length > 0 && rows.every((r) => r.status !== "pending"),
    "wc.4 no question is left pending against a run that is stopping");
});

test("wc.5 a Work that ALREADY HOLDS a committed receipt answers already_completed — never cancelled with money in the ledger", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  const receipt = await post(w);
  assert.equal(receipt.posted, true, "wc.5 precondition: the entry is on the books");

  const out = await cancelAccountingWork({ work: w.work_id, author: BOB() });
  assert.equal(out.cancelled, false, "wc.5 the cancel did NOT cancel anything");
  assert.equal(out.reason, CANCEL_ANSWER.alreadyCompleted);
  assert.equal(out.status, "completed");
  assert.equal(out.receipt_id, receipt.receipt_id, "wc.5 the answer names the receipt that won");
  assert.equal(out.entry_id, receipt.entry_id, "wc.5 …and the entry it recorded");

  const row = await workRow(w.work_id);
  assert.equal(row.status, "completed", "wc.5 the Work settles COMPLETED on its own receipt");
  assert.equal(row.error, null, "wc.5 …carrying no error");
  assert.equal((await taskRow(w.task_id)).status, "completed", "wc.5 the run is settled too");
  assert.equal((await receiptsForWork(w.work_id)).length, 1, "wc.5 exactly one receipt");
});

test("wc.6 the door is not an existence oracle and holds the bookkeeper floor", async (t) => {
  if (await gateCancel(t)) return;
  const mine = await admitted();
  const theirs = await admitJournalWork({ client: B1(), author: DAVE(), basis: basis() });

  await assertPair(CLR.notFound, REASON.workNotFound,
    () => cancelAccountingWork({ work: theirs.work_id, author: BOB() }),
    "wc.6 another firm's Work is NOT FOUND for this author");
  await assertPair(CLR.notFound, REASON.workNotFound,
    () => cancelAccountingWork({ work: "00000000-0000-0000-0000-000000000000", author: BOB() }),
    "wc.6 an absent Work answers the SAME way — no oracle");
  await assertPair(CLR.authz, REASON.insufficientRole,
    () => cancelAccountingWork({ work: mine.work_id, author: CAROL() }),
    "wc.6 a viewer may not cancel accounting work");
  await assertPair(CLR.badRequest, REASON.invalidOpKey,
    () => cancelAccountingWork({ work: mine.work_id, author: BOB(), opKey: "   " }),
    "wc.6 a whitespace idempotency key is refused BEFORE any effect");
  assert.equal((await workRow(mine.work_id)).status, "queued", "wc.6 every refusal left the Work untouched");
});

test("wc.7 a REVOKED author cannot cancel; the grant is clara_runtime's alone", async (t) => {
  if (await gateCancel(t)) return;
  const throwaway = await insertUser(world.prefix, "grace");
  await addMember(ALICE(), { firm: FIRM_A(), user: throwaway, role: "bookkeeper", opKey: opk("w630-mem2") });
  const w = await admitted();
  await deactivateMember(ALICE(), { firm: FIRM_A(), user: throwaway });
  await assertPair(CLR.authz, REASON.actorNotActive,
    () => cancelAccountingWork({ work: w.work_id, author: throwaway }),
    "wc.7 a removed member is not an author");

  const acl = await rootQuery(
    `select has_function_privilege('clara_runtime', 'clara.cancel_accounting_work(uuid,uuid,text)', 'execute') as rt,
            has_function_privilege('clara_authenticated', 'clara.cancel_accounting_work(uuid,uuid,text)', 'execute') as human,
            has_function_privilege('clara_wake_interactive', 'clara.cancel_accounting_work(uuid,uuid,text)', 'execute') as wake`);
  assert.equal(acl.rows[0].rt, true, "wc.7 clara_runtime holds EXECUTE");
  assert.equal(acl.rows[0].human, false, "wc.7 clara_authenticated does NOT (the route is the runtime's)");
  assert.equal(acl.rows[0].wake, false, "wc.7 no wake role may cancel the Work it is executing");
});

// ===========================================================================================
// §A2 — clara._record_journal_entry_core: the boundary, and what it refuses on the other side.
// ===========================================================================================

test("wc.8 a STOPPING Work refuses the admitted operation by name and posts nothing", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  await cancelAccountingWork({ work: w.work_id, author: BOB() });
  const before = await entryCount(w.client);

  const { detail } = await assertPair(CLR.conflict, CANCEL_REASON.workCancelled,
    () => post(w), "wc.8 posting into a stopping Work is refused");
  assert.equal(detail.status, "stopping", "wc.8 the refusal carries the Work status it saw");
  assert.equal(detail.cancelled_by, BOB(), "wc.8 …and who cancelled it");
  assert.equal(await entryCount(w.client), before, "wc.8 nothing was posted");
  assert.equal((await receiptsForWork(w.work_id)).length, 0, "wc.8 no receipt exists");
});

test("wc.9 a CANCELLED Work refuses work_cancelled; a SETTLED one refuses work_settled", async (t) => {
  if (await gateCancel(t)) return;
  const cancelled = await admitted();
  await cancelAccountingWork({ work: cancelled.work_id, author: BOB() });
  assert.equal((await workRow(cancelled.work_id)).status, "cancelled");
  await assertPair(CLR.conflict, CANCEL_REASON.workCancelled,
    () => post(cancelled), "wc.9 a cancelled Work admits no operation");

  const refused = await running();
  await settleWorkRun({
    task: refused.task_id, outcome: "refused", errorCode: "tool_error",
    error: { code: "CLR04", reason: "authority_lost", message: "gone", recoverable: true },
  });
  const { detail } = await assertPair(CLR.conflict, CANCEL_REASON.workSettled,
    () => post(refused), "wc.9 a settled Work admits no operation either");
  assert.equal(detail.status, "refused", "wc.9 …and says which terminal it is in");
  // BOTH HALVES OF "a refusal leaves nothing behind", against THIS Work rather than the client's
  // running total (other cells in this file post for the same client on purpose).
  assert.equal((await receiptsForWork(cancelled.work_id)).length, 0,
    "wc.9 the cancelled Work holds no receipt");
  assert.equal((await receiptsForWork(refused.work_id)).length, 0,
    "wc.9 …and neither does the settled one");
});

test("wc.10 a task moved to cancel_requested refuses the operation even when the Work row still reads running", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  await cancelAccountingWork({ work: w.work_id, author: BOB() });
  // The mirror wrote `stopping`; force the Work BACK to `running` as root so the TASK arm is the
  // only thing left that can refuse. A fixture shortcut around an absent writer, stated rather
  // than hidden — nothing in the estate moves a stopping Work back.
  await rootQuery("update clara.accounting_work set status='running' where id=$1", [w.work_id]);
  assert.equal((await workRow(w.work_id)).status, "running", "wc.10 precondition: the Work row lies");
  const before = await entryCount(w.client);
  await assertPair(CLR.conflict, CANCEL_REASON.workCancelled,
    () => post(w), "wc.10 the CURRENT TASK's cancel_requested is a boundary of its own");
  assert.equal(await entryCount(w.client), before, "wc.10 nothing was posted");
});

test("wc.11 THE ORDERING BOUNDARY: a cancel that arrives while the posting transaction holds the Work lock waits, then reports already_completed", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  const cred = await mintClientObo({ firm: FIRM_A(), obo: w.author, client: w.client });
  const before = await entryCount(w.client);

  const holder = await getPool().connect();
  let cancelOut = null;
  let cancelErr = null;
  try {
    await holder.query(`set role ${ROLES.wakeInteractive}`);
    await holder.query("begin");
    await holder.query("select set_config('clara.wake_secret', $1, true)", [cred.secret]);
    const posted = await holder.query(
      `select clara.wake_record_journal_entry($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text,
                                             $6::text, $7::text) as r`,
      [w.client, w.work_id, w.logical_op_id, JSON.stringify(w.basis), "a".repeat(64),
        opk("run"), "#630 boundary rig"]);
    assert.equal(posted.rows[0].r.posted, true, "wc.11 the operation was admitted inside the boundary");

    // The cancel now races the UNCOMMITTED posting. It must BLOCK on the Work row lock.
    const racing = cancelAccountingWork({ work: w.work_id, author: BOB() })
      .then((v) => { cancelOut = v; }, (e) => { cancelErr = e; });
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(cancelOut, null, "wc.11 the cancel is BLOCKED while the posting holds the boundary");
    assert.equal(cancelErr, null, "wc.11 …blocked, not refused");

    await holder.query("commit");
    await racing;
  } finally {
    await holder.query("rollback").catch(() => {});
    await holder.query("reset role").catch(() => {});
    await holder.query("reset all").catch(() => {});
    holder.release();
  }

  assert.equal(cancelErr, null, `wc.11 the cancel completed: ${cancelErr?.message ?? ""}`);
  assert.equal(cancelOut.cancelled, false, "wc.11 the ADMITTED OPERATION won");
  assert.equal(cancelOut.reason, CANCEL_ANSWER.alreadyCompleted);
  assert.equal((await workRow(w.work_id)).status, "completed", "wc.11 the Work is completed, never cancelled");
  assert.equal(await entryCount(w.client), before + 1, "wc.11 exactly ONE entry");
  assert.equal((await receiptsForWork(w.work_id)).length, 1, "wc.11 exactly ONE receipt");
});

// ===========================================================================================
// §A3 — the status mirror: the estate's own cancel door reaches the Work without being edited.
// ===========================================================================================

test("wc.12 clara.cancel_agent_task on a RUNNING accounting-work task shows the Work as stopping", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  const out = await cancelAgentTask(BOB(), { task: w.task_id });
  assert.equal(out.status, "cancel_requested", "wc.12 the estate's own door still answers as it did");
  assert.equal((await workRow(w.work_id)).status, "stopping",
    "wc.12 …and the Work it knows nothing about now reads STOPPING through the mirror");
});

test("wc.13 the mirror never re-opens a Work that already settled on its receipt", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  await post(w);
  // THE TRANSITION HAS TO ACTUALLY FIRE. `clara.cancel_agent_task` short-circuits on a TERMINAL
  // task with no UPDATE at all, so driving it against a settled run exercises the mirror not at
  // all — the cell that did read green with the guard deleted. Here the run is still LIVE and the
  // Work is terminal, which is the shape the guard exists for: the task transition `running ->
  // cancel_requested` fires the mirror's `stopping` arm against a Work that already holds its
  // receipt. Root writes the Work status because no door produces this pair on purpose.
  await rootQuery("update clara.accounting_work set status='completed' where id=$1", [w.work_id]);
  assert.equal((await workRow(w.work_id)).status, "completed", "wc.13 precondition: the Work is terminal");
  assert.equal((await taskRow(w.task_id)).status, "running", "wc.13 …and its run is still live");

  const out = await cancelAgentTask(BOB(), { task: w.task_id });
  assert.equal(out.status, "cancel_requested", "wc.13 the task DID transition — the mirror fired");
  assert.equal((await workRow(w.work_id)).status, "completed",
    "wc.13 …and a Work that already settled on its receipt is never re-opened to stopping");
});

// ===========================================================================================
// §A4 — clara.settle_work_run: the cancel translation, and what rides under it.
// ===========================================================================================

test("wc.14 a cancel_requested run settles CANCELLED whatever outcome it asks for, with the request preserved", async (t) => {
  if (await gateCancel(t)) return;
  for (const [requested, code] of [["failed", "internal"], ["refused", "tool_error"], ["expired", null]]) {
    const w = await running();
    await cancelAccountingWork({ work: w.work_id, author: BOB() });
    const asked = { code: "CLR13", reason: "work_cancelled", message: "the boundary said no", recoverable: true };
    const out = await settleWorkRun({
      task: w.task_id, outcome: requested, errorCode: code, error: asked,
    });
    assert.equal(out.status, "cancelled", `wc.14 a ${requested} request over a cancel becomes CANCELLED`);
    assert.equal(out.translated_by_cancel, true, `wc.14 …and says so (${requested})`);
    assert.equal(out.requested_outcome, requested, "wc.14 the request is echoed back");
    const row = await workRow(w.work_id);
    assert.equal(row.status, "cancelled");
    assert.equal(row.error.superseded.outcome, requested, "wc.14 the superseded outcome is kept on the row");
    assert.deepEqual(row.error.superseded.error, asked, "wc.14 …together with the error it carried");
    assert.equal(row.error.reason, "cancelled", "wc.14 the Work's own reason is the cancellation");
    assert.equal((await taskRow(w.task_id)).status, "cancelled", "wc.14 the task is cancelled too");
    assert.equal((await taskRow(w.task_id)).error_code, null, "wc.14 a cancelled run carries no error code");
  }
});

test("wc.15 a committed receipt still outranks the cancel translation — for EVERY outcome a cancelled run can ask for", async (t) => {
  if (await gateCancel(t)) return;
  // THE MATRIX IS (requested outcome × receipt present) AND IT IS CLOSED. wc.14 walks the three
  // translatable outcomes with NO receipt; this walks the same three WITH one. The receipt
  // override sits ABOVE the cancel translation in clara.settle_work_run, and narrowing it to one
  // outcome (or moving it below) would settle a cancelled run `cancelled` with an entry on the
  // books — "cancelled with money in the ledger", the failure this file exists to prevent.
  for (const [requested, code] of [["failed", "internal"], ["refused", "tool_error"], ["expired", null]]) {
    const w = await running();
    await post(w);
    // Move the task to cancel_requested WITHOUT the door's receipt short-circuit, so the settle is
    // the thing under test: the estate's own task-level cancel does exactly that.
    await cancelAgentTask(BOB(), { task: w.task_id });
    assert.equal((await taskRow(w.task_id)).status, "cancel_requested", `wc.15 precondition (${requested})`);
    const out = await settleWorkRun({ task: w.task_id, outcome: requested, errorCode: code,
      error: { code: "internal", reason: "run_failed", message: "gone", recoverable: true } });
    assert.equal(out.status, "completed", `wc.15 the BOOKS win over the run and the cancel (${requested})`);
    assert.equal(out.overridden_by_receipt, true, `wc.15 …and say so (${requested})`);
    assert.equal(out.translated_by_cancel, false, `wc.15 …so no cancel translation happened (${requested})`);
    const row = await workRow(w.work_id);
    assert.equal(row.status, "completed", `wc.15 the Work is completed (${requested})`);
    assert.equal(row.error, null, `wc.15 a completed Work carries no error (${requested})`);
    assert.equal((await receiptsForWork(w.work_id)).length, 1, `wc.15 exactly one receipt (${requested})`);
  }
});

test("wc.16 a run that was NOT cancelled settles exactly as it asks", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  const out = await settleWorkRun({ task: w.task_id, outcome: "failed", errorCode: "internal",
    error: { code: "internal", reason: "no_effect", message: "nothing", recoverable: true } });
  assert.equal(out.status, "failed", "wc.16 no cancel, no translation");
  assert.equal(out.translated_by_cancel, false);
  assert.equal((await workRow(w.work_id)).error.reason, "no_effect", "wc.16 the run's own error stands");
});

// ===========================================================================================
// §A5 — clara.take_over_accounting_work: a colleague picks up a Work whose initiator lost authority.
// ===========================================================================================

/** A Work whose INITIATOR has lost authority and which settled `refused/authority_lost`. */
async function orphaned({ origin = "user_direct" } = {}) {
  const initiator = await insertUser(world.prefix, "heidi");
  await addMember(ALICE(), { firm: FIRM_A(), user: initiator, role: "bookkeeper", opKey: opk("w630-mem3") });
  const w = await running({ author: initiator, origin });
  await settleWorkRun({
    task: w.task_id, outcome: "refused", errorCode: "tool_error",
    error: { code: "CLR04", reason: "authority_lost", message: "no longer a member", recoverable: true },
  });
  await deactivateMember(ALICE(), { firm: FIRM_A(), user: initiator });
  return { ...w, initiator };
}

test("wc.17 a colleague takes responsibility: a new run, the admitting human preserved, a timeline event", async (t) => {
  if (await gateCancel(t)) return;
  const w = await orphaned();
  const out = await takeOverAccountingWork({ work: w.work_id, author: colleague });
  assert.equal(out.taken_over, true, "wc.17 the door reports the takeover");
  assert.equal(out.status, "queued", "wc.17 a NEW run is admitted for the SAME Work");
  assert.equal(out.responsible, colleague, "wc.17 the colleague is now responsible");
  assert.equal(out.initiated_by, w.initiator,
    "wc.17 …and who ASKED is preserved as the immutable historical fact");
  assert.equal(out.previous_responsible, w.initiator, "wc.17 the answer says who it was taken from");
  assert.equal(out.logical_op_id, w.logical_op_id, "wc.17 the logical identity is unchanged");
  assert.notEqual(out.task_id, w.task_id, "wc.17 a NEW task carries the new run");

  const row = await responsibleOf(w.work_id);
  assert.equal(row.responsible, colleague, "wc.17 the Work is now executed AS the colleague");
  assert.equal(row.initiated_by, w.initiator, "wc.17 …and still records who admitted it");
  assert.equal((await tasksForWork(w.work_id)).length, 2, "wc.17 exactly two runs exist");

  const events = await timelineEvents(FIRM_A(), "work.taken_over");
  const mine = events.filter((e) => e.payload?.work === w.work_id);
  assert.equal(mine.length, 1, "wc.17 exactly one work.taken_over event");
  assert.equal(mine[0].actor, colleague, "wc.17 …attributed to the colleague");
  assert.equal(mine[0].payload.previous_responsible, w.initiator);
});

test("wc.17b `initiated_by` is frozen and `initiator` may only be handed to an active bookkeeper", async (t) => {
  if (await gateCancel(t)) return;
  const w = await admitted();
  await assertPair(CLR.immutable, "accounting_work_immutable",
    () => rootQuery("update clara.accounting_work set initiated_by=$2 where id=$1", [w.work_id, CAROL()]),
    "wc.17b who ASKED can never be rewritten");
  await assertPair(CLR.authz, "responsible_not_authorised",
    () => rootQuery("update clara.accounting_work set initiator=$2 where id=$1", [w.work_id, CAROL()]),
    "wc.17b …and a Work may not be handed to a viewer");
  const outsider = await insertUser(world.prefix, "mallory");
  await assertPair(CLR.authz, "responsible_not_authorised",
    () => rootQuery("update clara.accounting_work set initiator=$2 where id=$1", [w.work_id, outsider]),
    "wc.17b …nor to somebody who is not in the firm at all");
});

test("wc.18 a still-authorised, non-refused Work is NOT takeable", async (t) => {
  if (await gateCancel(t)) return;
  const live = await running();
  await assertPair(CLR.conflict, CANCEL_REASON.notTakeable,
    () => takeOverAccountingWork({ work: live.work_id, author: colleague }),
    "wc.18 a live Work may not be taken over");

  const failedButAuthorised = await running();
  await settleWorkRun({ task: failedButAuthorised.task_id, outcome: "failed", errorCode: "internal",
    error: { code: "internal", reason: "no_effect", message: "nothing", recoverable: true } });
  await assertPair(CLR.conflict, CANCEL_REASON.notTakeable,
    () => takeOverAccountingWork({ work: failedButAuthorised.work_id, author: colleague }),
    "wc.18 a failed Work whose responsible human is STILL authorised is the Retry's job, not a takeover's");

  // THE REINSTATEMENT. The one case the UI actually offers the button on: a Work whose STORED
  // error says `authority_lost`, whose human is authorised again. The live re-read decides, and
  // it says this Work is theirs — a colleague seizing it would move the authority a posted entry
  // commits under away from the person who asked for it, and delete their own Retry path.
  const reinstated = await orphaned();
  await addMember(ALICE(), {
    firm: FIRM_A(), user: reinstated.initiator, role: "bookkeeper", opKey: opk("w630-reinstate"),
  });
  assert.equal((await workRow(reinstated.work_id)).error.reason, "authority_lost",
    "wc.18 precondition: the STORED reason still says authority_lost");
  const { detail } = await assertPair(CLR.conflict, CANCEL_REASON.notTakeable,
    () => takeOverAccountingWork({ work: reinstated.work_id, author: colleague }),
    "wc.18 a REINSTATED responsible human keeps their Work, whatever the stored error says");
  assert.equal(detail.responsible_authorised, true,
    "wc.18 …and the refusal says why: the live re-read found them authorised");
  assert.equal((await responsibleOf(reinstated.work_id)).responsible, reinstated.initiator,
    "wc.18 the Work did not move");
});

test("wc.19 an INTERPRETED basis needs the colleague to confirm the digest they read", async (t) => {
  if (await gateCancel(t)) return;
  const w = await orphaned({ origin: "clara_interpreted" });
  const { detail } = await assertPair(CLR.badRequest, CANCEL_REASON.basisConfirmationRequired,
    () => takeOverAccountingWork({ work: w.work_id, author: colleague }),
    "wc.19 an interpreted basis is not taken on trust");
  const digest = (await workRow(w.work_id)).basis_digest;
  assert.equal(detail.basis_digest, digest, "wc.19 the refusal hands back the digest to confirm");

  await assertPair(CLR.badRequest, CANCEL_REASON.basisConfirmationRequired,
    () => takeOverAccountingWork({ work: w.work_id, author: colleague, basisDigest: "b".repeat(64) }),
    "wc.19 a WRONG digest is refused the same way");

  const out = await takeOverAccountingWork({ work: w.work_id, author: colleague, basisDigest: digest });
  assert.equal(out.taken_over, true, "wc.19 the confirmed digest is accepted");
});

test("wc.20 after a takeover the commit binds the RESPONSIBLE human, never the initiator", async (t) => {
  if (await gateCancel(t)) return;
  const w = await orphaned();
  const out = await takeOverAccountingWork({ work: w.work_id, author: colleague });
  await claimWorkRun({ task: out.task_id, runId: opk("run") });

  // The OLD initiator cannot even be given a credential any more — the estate's own
  // `clara.mint_wake_credential` liveness belt answers first, and that is the honest measured
  // behaviour rather than the core's arm. Recorded under its own code, not renamed to fit.
  const revokedErr = await assertRaises(CLR.badRequest,
    () => post({ ...w, author: w.initiator }),
    "wc.20 the revoked initiator cannot even hold a credential");
  noteLane(`wc.20 measured: a revoked initiator is refused at the credential mint (${revokedErr.code}: ${revokedErr.message})`);

  // …and an ACTIVE bookkeeper of the firm who is NOT the responsible human is refused by the
  // CORE's own binding — the arm #630 moved from `initiator` to `responsible`.
  await assertPair(CLR.authz, REASON.oboNotInitiator,
    () => post({ ...w, author: BOB() }),
    "wc.20 a live bookkeeper who is not responsible may not commit this Work");

  const before = await entryCount(w.client);
  const receipt = await post({ ...w, author: colleague });
  assert.equal(receipt.posted, true, "wc.20 the responsible colleague CAN commit");
  assert.equal(await entryCount(w.client), before + 1, "wc.20 exactly one entry");
  const rows = await receiptsForWork(w.work_id);
  assert.equal(rows.length, 1, "wc.20 exactly one receipt");
  assert.equal(rows[0].on_behalf_of, colleague, "wc.20 …under the colleague's live authority");
  assert.equal((await responsibleOf(w.work_id)).initiated_by, w.initiator,
    "wc.20 who ASKED is still the historical fact on the row");
});

test("wc.21 work_authority_snapshot answers for the human currently RESPONSIBLE", async (t) => {
  if (await gateCancel(t)) return;
  const w = await orphaned();
  const before = await workAuthoritySnapshot(w.task_id);
  assert.equal(before.initiator_authorised, false, "wc.21 the revoked human is not authorised");
  assert.equal(before.responsible, w.initiator, "wc.21 …and is still the one the Work runs as");
  assert.equal(before.taken_over, false, "wc.21 nothing has been handed over yet");

  const out = await takeOverAccountingWork({ work: w.work_id, author: colleague });
  const after = await workAuthoritySnapshot(out.task_id);
  assert.equal(after.responsible, colleague, "wc.21 the snapshot names the new responsible human");
  assert.equal(after.initiator, colleague,
    "wc.21 …under the key the DEPLOY-LOCKED closure reads, because that is the human it mints OBO");
  assert.equal(after.initiated_by, w.initiator, "wc.21 …while who ASKED is kept for attribution");
  assert.equal(after.taken_over, true, "wc.21 …and the pair is flagged as diverged");
  assert.equal(after.initiator_authorised, true,
    "wc.21 the liveness the frozen recheck reads is the human the run acts as");
  assert.equal(after.work_status, "queued");
});

// ===========================================================================================
// §A6 — the revoked reader. MEASURED against the live policies, never assumed.
// ===========================================================================================

test("wc.22 a REVOKED actor reads nothing of the firm's Work, receipts or journal; a live colleague reads them", async (t) => {
  if (await gateCancel(t)) return;
  const initiator = await insertUser(world.prefix, "ivan");
  await addMember(ALICE(), { firm: FIRM_A(), user: initiator, role: "bookkeeper", opKey: opk("w630-mem4") });
  const w = await running({ author: initiator });
  await park(w.task_id);
  const receipt = await post(w);
  assert.equal(receipt.posted, true, "wc.22 precondition: the Work posted an entry");

  // ALL FIVE RELATIONS THE WORK ORDER NAMES, including `clara.agent_tasks_visible` — the view the
  // SSE task stream the B7 rail reads is gated on, and the one a revoked reader would probe next.
  const counts = async (sub) => {
    const r = await humanQuery(sub,
      `select (select count(*)::int from clara.accounting_work where id=$1) as work,
              (select count(*)::int from clara.operation_receipts where work_id=$1) as receipts,
              (select count(*)::int from clara.journal_entries where id=$2) as entries,
              (select count(*)::int from clara.agent_interruptions where task_id=$3) as questions,
              (select count(*)::int from clara.agent_tasks_visible where id=$3) as tasks`,
      [w.work_id, receipt.entry_id, w.task_id]);
    return r.rows[0];
  };
  const live = await counts(colleague);
  assert.equal(live.work, 1, "wc.22 an active colleague reads the Work");
  assert.equal(live.receipts, 1, "wc.22 …its receipt");
  assert.equal(live.entries, 1, "wc.22 …and the posted entry");
  assert.equal(live.tasks, 1, "wc.22 …and the run behind the stream they are watching");

  await deactivateMember(ALICE(), { firm: FIRM_A(), user: initiator });
  const revoked = await counts(initiator);
  assert.equal(revoked.work, 0, "wc.22 the revoked actor reads ZERO accounting_work rows");
  assert.equal(revoked.receipts, 0, "wc.22 …ZERO operation_receipts");
  assert.equal(revoked.entries, 0, "wc.22 …ZERO journal_entries");
  assert.equal(revoked.questions, 0, "wc.22 …ZERO questions");
  assert.equal(revoked.tasks, 0,
    "wc.22 …and ZERO rows of agent_tasks_visible — a reconnect after the revocation sees no run");

  // Revocation after commit erases NOTHING: the entry and the receipt still stand for the firm.
  assert.equal((await receiptsForWork(w.work_id)).length, 1, "wc.22 the receipt survives the revocation");
  assert.equal((await entriesForClient(w.client)).some((e) => e.id === receipt.entry_id), true,
    "wc.22 …and so does the entry");
});

test("wc.23 a DEMOTION to viewer leaves the firm-visible reads intact — measured, not changed", async (t) => {
  if (await gateCancel(t)) return;
  const demoted = await insertUser(world.prefix, "judy");
  await addMember(ALICE(), { firm: FIRM_A(), user: demoted, role: "bookkeeper", opKey: opk("w630-mem5") });
  const w = await running({ author: demoted });
  const receipt = await post(w);
  await demoteMember(ALICE(), { firm: FIRM_A(), user: demoted, role: "viewer" });

  const r = await humanQuery(demoted,
    `select (select count(*)::int from clara.accounting_work where id=$1) as work,
            (select count(*)::int from clara.operation_receipts where work_id=$1) as receipts,
            (select count(*)::int from clara.agent_tasks_visible where id=$2) as tasks`,
    [w.work_id, w.task_id]);
  noteLane(`wc.23 measured: a demoted viewer reads work=${r.rows[0].work} receipts=${r.rows[0].receipts} tasks=${r.rows[0].tasks}`);
  assert.equal(r.rows[0].tasks, 1,
    "wc.23 a demoted viewer still sees the run in agent_tasks_visible — the view is firm-scoped, "
    + "measured and left alone (0006's law); the ACT below is what the rank floor gates");
  assert.equal(r.rows[0].work, 1,
    "wc.23 a viewer still reads the firm's Work — 0178's select policy is firm-scoped by design");
  assert.equal(r.rows[0].receipts, 1, "wc.23 …and its receipt");

  // …but a demoted viewer may no longer ACT on it.
  await assertPair(CLR.authz, REASON.insufficientRole,
    () => cancelAccountingWork({ work: w.work_id, author: demoted }),
    "wc.23 the ACT is what the role floor gates, and it refuses");
  assert.equal(receipt.posted, true);
});

// ===========================================================================================
// §A7 — the period wall, exercised at the boundary (structural: it is the estate's own trigger).
// ===========================================================================================

test("wc.24 a period locked between admission and commit refuses CLR19 and posts nothing", async (t) => {
  if (await gateCancel(t)) return;
  // A DEDICATED client: `clara.fiscal_years` is append-only, so a year closed here could never be
  // cleaned up and would silently close the period out from under every later cell.
  const client = await freshWorkClient(ALICE(), "w630-period");
  const fy = await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
     values((select firm_id from clara.clients where id=$1),$1,'w630 FY','2026-01-01','2026-12-31',1,'open','asserted',$2)
     returning id`, [client, ALICE()]);
  assert.ok(fy.rows[0]?.id, "wc.24 mandatory setup: an OPEN year exists at admission");

  const w = await running({ client, author: ALICE(), b: basis({ postingDate: "2026-09-01" }) });
  const before = await entryCount(client);

  // …and the period is locked AFTER admission, BEFORE the commit — the race the ticket names.
  // Walked open -> closing -> closed, because the estate's own lifecycle trigger admits no other
  // edge ("the audited verbs walk open|reopened->closing->closed->reopened only").
  for (const s of ["closing", "closed"]) {
    await rootQuery("update clara.fiscal_years set status=$2 where id=$1", [fy.rows[0].id, s]);
  }
  await assertPair(CLR.period, REASON.closedPeriod, () => post(w),
    "wc.24 the period wall fires INSIDE the posting transaction");
  assert.equal(await entryCount(client), before, "wc.24 nothing was posted");
  assert.equal((await receiptsForWork(w.work_id)).length, 0, "wc.24 no receipt exists");
});

// ===========================================================================================
// §A8 — A TERMINAL RUN NEVER STRANDS A LIVE WORK. Three belts, one receipt law.
// ===========================================================================================

test("wc.25 cancelling the TASK of a queued Work terminalises the Work at the source, and both doors stay idempotent", async (t) => {
  if (await gateCancel(t)) return;
  // THE ONE-CLICK PATH THAT USED TO STRAND A WORK FOREVER. `clara.agent_tasks_visible` carries no
  // kind filter and the /activity panel gates its Cancel control on STATUS alone, so an
  // accounting-work row carries it. `clara.cancel_agent_task` then terminalises a QUEUED task
  // itself, knowing nothing about clara.accounting_work.
  const w = await admitted();
  const before = await entryCount(w.client);
  const out = await cancelAgentTask(BOB(), { task: w.task_id });
  assert.equal(out.status, "cancelled", "wc.25 the estate's own door terminalises a queued run");

  const row = await workRow(w.work_id);
  assert.equal(row.status, "cancelled",
    "wc.25 …and the Work it knows nothing about reaches the SAME terminal through the mirror");
  assert.equal(row.error.reason, "cancelled", "wc.25 carrying the lane's own cancellation error");
  assert.match(row.error.message, /Nothing was posted/, "wc.25 …in the lane's own words");
  assert.equal(await entryCount(w.client), before, "wc.25 nothing was posted");

  // …and every door a human could press next answers, rather than raising a codeless conflict.
  const again = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: opk("w630-after") });
  assert.equal(again.cancelled, false, "wc.25 the Work-level cancel is not an error");
  assert.equal(again.reason, CANCEL_ANSWER.alreadyTerminal, "wc.25 …it answers already_terminal");
  assert.equal(again.status, "cancelled");
  await assertPair(CLR.conflict, CANCEL_REASON.notTakeable,
    () => takeOverAccountingWork({ work: w.work_id, author: colleague }),
    "wc.25 …and a cancelled Work is not takeable either");
});

test("wc.26 a terminal run found under a LIVE Work is converged by the receipt law, by either belt", async (t) => {
  if (await gateCancel(t)) return;
  const w = await admitted();
  await cancelAgentTask(BOB(), { task: w.task_id });
  assert.equal((await taskRow(w.task_id)).status, "cancelled", "wc.26 precondition: the run is terminal");

  // BELT (b): the cancel DOOR converges before it decides. The broken pair is planted as root
  // because the mirror now prevents it at the source — but a database that applied 0184 after the
  // pair already existed, or any future writer that terminalises a task without settling, still
  // reaches it, and the answer must be a terminal rather than an untyped 409.
  await rootQuery("update clara.accounting_work set status='queued', error=null where id=$1", [w.work_id]);
  assert.equal((await workRow(w.work_id)).status, "queued", "wc.26 precondition: the pair is broken");
  const out = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: opk("w630-conv") });
  assert.equal(out.cancelled, false);
  assert.equal(out.reason, CANCEL_ANSWER.alreadyTerminal, "wc.26 the door answers about the Work that exists");
  assert.equal(out.status, "cancelled", "wc.26 …having converged it first");
  assert.equal((await workRow(w.work_id)).status, "cancelled", "wc.26 the row moved");

  // BELT (a): clara.settle_work_run repairs the pair on its REPLAY path — the arm the runtime
  // reconciler reaches for when it finds the pair after a respawn.
  await rootQuery("update clara.accounting_work set status='queued', error=null where id=$1", [w.work_id]);
  const settled = await settleWorkRun({ task: w.task_id, outcome: "cancelled" });
  assert.equal(settled.replayed, true, "wc.26 the run itself is not settled twice");
  assert.equal(settled.converged, "cancelled", "wc.26 …but the WORK is converged, and it says so");
  assert.equal((await workRow(w.work_id)).status, "cancelled", "wc.26 the row moved again");

  // …and a Work that is ALREADY terminal is left entirely alone.
  const noop = await settleWorkRun({ task: w.task_id, outcome: "cancelled" });
  assert.equal(noop.converged, null, "wc.26 a terminal Work is not rewritten by a replay");
});

test("wc.26b the receipt still wins the convergence: a terminal run over a posted entry completes its Work", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  const receipt = await post(w);
  // A terminal run and a LIVE Work that holds a committed receipt — the shape in which "cancelled"
  // would be a lie about the books.
  await rootQuery("update clara.agent_tasks set status='cancelled' where id=$1", [w.task_id]);
  await rootQuery("update clara.accounting_work set status='running', error=null where id=$1", [w.work_id]);
  const out = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: opk("w630-conv2") });
  assert.equal(out.status, "completed", "wc.26b the BOOKS decide the terminal, not the run's status");
  const row = await workRow(w.work_id);
  assert.equal(row.status, "completed");
  assert.equal(row.error, null, "wc.26b a completed Work carries no error");
  assert.equal(row.result.entry_id, receipt.entry_id, "wc.26b …and the receipt is on the result");
});

// ===========================================================================================
// §A9 — THE LOCK ORDER IS GLOBAL, AND IT IS OBSERVED RATHER THAN ASSERTED IN A COMMENT.
// ===========================================================================================

test("wc.27 the estate's OWN doors take the Work row before the task row", async (t) => {
  if (await gateCancel(t)) return;
  // The discriminator is not "does it block" — both orders block. It is WHICH ROW IS STILL FREE
  // while it blocks. With the Work row held by a third party, a door that takes the Work FIRST has
  // not touched the task yet, so `for update nowait` on the task row succeeds; a door that takes
  // the task first would hold it and `nowait` would raise 55P03.
  for (const door of ["cancel_agent_task", "open_work_question"]) {
    const w = await running();
    if (door === "open_work_question") { /* a running task is what open_work_question needs */ }
    let holder = null; let caller = null; let probe = null; let racing = null;
    let err = null;
    try {
      holder = await rawClient();
      await holder.query("begin");
      await holder.query("select 1 from clara.accounting_work where id=$1 for update", [w.work_id]);

      caller = door === "cancel_agent_task"
        ? await rawClient({ role: ROLES.authenticated, sub: BOB() })
        : await rawClient({ role: ROLES.runtime });
      const pid = await backendPid(caller);
      racing = (door === "cancel_agent_task"
        ? caller.query("select clara.cancel_agent_task($1::uuid, $2::text)", [w.task_id, opk("w630-order")])
        : caller.query(
          `select clara.open_work_question($1::uuid, $2::text, '{"type":"text","text":"q"}'::jsonb,
                                           '[{"key":"a","label":"A","kind":"text"}]'::jsonb)`,
          [w.task_id, opk("w630-hook-order")])
      ).then(() => null, (e) => { err = e; return null; });

      assert.equal(await waitingOnLock(pid), true,
        `wc.27 ${door} is BLOCKED on the Work row somebody else holds`);

      probe = await rawClient();
      await probe.query("begin");
      const got = await probe.query("select id from clara.agent_tasks where id=$1 for update nowait", [w.task_id]);
      assert.equal(got.rowCount, 1,
        `wc.27 …and the TASK row is still free, so ${door} took the Work FIRST (the lane's order)`);
      await probe.query("rollback");

      await holder.query("commit");
      await racing;
    } finally {
      await releaseRaw(probe);
      await releaseRaw(caller);
      await releaseRaw(holder);
    }
    assert.equal(err, null, `wc.27 ${door} completed once the Work row was free: ${err?.message ?? ""}`);
  }
});

test("wc.27b a Work-level cancel racing the estate's task-level cancel never deadlocks", async (t) => {
  if (await gateCancel(t)) return;
  // The smoke behind the deterministic pin above. Before the recut this pair raised 40P01 (and the
  // route answered HTTP 500); with one global order there is no cycle to detect.
  const N = 12;
  const errs = [];
  for (let i = 0; i < N; i += 1) {
    const w = await running();
    const results = await Promise.allSettled([
      cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: opk("w630-race-a") }),
      cancelAgentTask(BOB(), { task: w.task_id, opKey: opk("w630-race-b") }),
    ]);
    for (const r of results) if (r.status === "rejected") errs.push(r.reason);
  }
  const deadlocks = errs.filter((e) => e?.code === "40P01" || e?.code === "40001");
  assert.equal(deadlocks.length, 0,
    `wc.27b ${N} concurrent pairs raised no serialization failure (saw: ${deadlocks.map((e) => e.code).join(",")})`);
  assert.equal(errs.length, 0, `wc.27b …and no other refusal either: ${errs[0]?.message ?? ""}`);
});

// ===========================================================================================
// §A10 — THE BOUNDARY, THE DIRECTION THE LOCK ACTUALLY EXISTS FOR.
// ===========================================================================================

test("wc.28 a posting that arrives while a cancel holds the Work row blocks BEFORE it writes, and is then refused", async (t) => {
  if (await gateCancel(t)) return;
  // wc.11 walks the direction in which the POSTING starts first; in that direction the core's own
  // tail UPDATE of clara.accounting_work already held the row, so the cell could not tell the new
  // `for update` from a write that was always there. THIS is the direction the clause exists for:
  // a cancel commits while a posting transaction is between its guard read and its INSERT. Delete
  // the `for update` from clara._record_journal_entry_core and this cell reds twice — the poster
  // holds a write lock on clara.journal_entries while it waits, and it COMMITS an entry into a
  // Work the estate has already told a human is stopping.
  const w = await running();
  const cred = await mintClientObo({ firm: FIRM_A(), obo: w.author, client: w.client });
  const before = await entryCount(w.client);

  let canceller = null; let poster = null; let posted = null; let postErr = null; let racing = null;
  try {
    // The CANCEL holds the boundary, inside its own open transaction — the real door, not a
    // hand-written UPDATE standing in for it.
    canceller = await rawClient({ role: ROLES.runtime });
    await canceller.query("begin");
    const answer = await canceller.query(
      "select clara.cancel_accounting_work($1::uuid, $2::uuid, $3::text) as r",
      [w.work_id, BOB(), opk("w630-boundary")]);
    assert.equal(answer.rows[0].r.status, "stopping", "wc.28 the cancel took the boundary and won");

    poster = await rawClient({ role: ROLES.wakeInteractive, wakeSecret: cred.secret });
    await poster.query("begin");
    await poster.query("select set_config('clara.wake_secret', $1, true)", [cred.secret]);
    const pid = await backendPid(poster);
    racing = poster.query(
      `select clara.wake_record_journal_entry($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text,
                                             $6::text, $7::text) as r`,
      [w.client, w.work_id, w.logical_op_id, JSON.stringify(w.basis), "a".repeat(64),
        opk("run"), "#630 boundary rig"])
      .then((r) => { posted = r.rows[0].r; }, (e) => { postErr = e; });

    assert.equal(await waitingOnLock(pid), true,
      "wc.28 the posting is BLOCKED on the Work row the cancel holds");
    assert.equal(await holdsWriteLock(pid, "clara.journal_entries"), false,
      "wc.28 …and it blocked BEFORE it wrote anything: no write lock on clara.journal_entries");

    await canceller.query("commit");
    await racing;
  } finally {
    // THE CANCELLER GOES FIRST, ALWAYS. If an assertion above threw while the poster's statement
    // was still in flight, rolling the canceller back is what releases the boundary and lets that
    // statement finish — releasing the poster first would queue a `rollback` behind its own
    // blocked query and hang the cell instead of failing it.
    await releaseRaw(canceller);
    await Promise.resolve(racing).catch(() => {});
    await releaseRaw(poster);
  }

  assert.equal(posted, null, "wc.28 the released posting did NOT post");
  assert.equal(postErr?.code, CLR.conflict, `wc.28 …it was refused CLR13: ${postErr?.message ?? "no error"}`);
  assert.equal(JSON.parse(postErr.detail ?? "{}").reason, CANCEL_REASON.workCancelled,
    "wc.28 …by name: work_cancelled");
  assert.equal(await entryCount(w.client), before, "wc.28 zero entries");
  assert.equal((await receiptsForWork(w.work_id)).length, 0, "wc.28 zero receipts");
  assert.equal((await workRow(w.work_id)).status, "stopping", "wc.28 the Work is stopping, as the human was told");
});

// ===========================================================================================
// §A11 — THE THREE ANSWERS THE CANCEL DOOR GIVES THAT NOTHING USED TO EXERCISE.
// ===========================================================================================

test("wc.29 asking twice while a run is stopping changes nothing, and the two reservation refusals are typed", async (t) => {
  if (await gateCancel(t)) return;
  const w = await running();
  const first = await cancelAccountingWork({ work: w.work_id, author: BOB(), opKey: opk("w630-stop1") });
  assert.equal(first.status, "stopping", "wc.29 precondition: the run is stopping");
  const task = await taskRow(w.task_id);

  const second = await cancelAccountingWork({ work: w.work_id, author: colleague, opKey: opk("w630-stop2") });
  assert.equal(second.cancelled, false, "wc.29 the second cancel changes nothing");
  assert.equal(second.reason, CANCEL_ANSWER.alreadyStopping, "wc.29 …and says so");
  assert.equal(second.cancelled_by, BOB(), "wc.29 WHO ASKED FIRST is not overwritten by the second asker");
  assert.equal(new Date(second.cancelled_at).getTime(), new Date(task.cancelled_at).getTime(),
    "wc.29 …nor when they asked");
  const after = await taskRow(w.task_id);
  assert.equal(after.cancelled_by, BOB(), "wc.29 the audit fact on the row is untouched");
  assert.equal(after.status, "cancel_requested", "wc.29 …and the run is still only ASKED to stop");

  // op_key_conflict: the same key, a different Work — `_reserve_op`'s untyped CLR10, re-raised
  // with a reason so the surface can say something better than "conflict".
  const other = await admitted();
  const shared = opk("w630-shared-key");
  await cancelAccountingWork({ work: other.work_id, author: BOB(), opKey: shared });
  const third = await admitted();
  await assertPair(CLR.badRequest, CANCEL_REASON.opKeyConflict,
    () => cancelAccountingWork({ work: third.work_id, author: BOB(), opKey: shared }),
    "wc.29 one key, two different cancels — refused by name");

  // operation_in_flight: a reservation that was taken and never finished (a sibling still running,
  // or a crash between the reserve and the finish). Planted as root: no door leaves one behind.
  const stuck = await admitted();
  const key = opk("w630-inflight");
  await rootQuery(
    `insert into clara.op_receipts(firm_id, fn, op_key, request_hash)
     values ((select firm_id from clara.accounting_work where id=$1), 'cancel_accounting_work', $2,
             clara._hash(jsonb_build_object('work', $1::uuid, 'author', $3::uuid)))`,
    [stuck.work_id, key, BOB()]);
  await assertPair(CLR.conflict, CANCEL_REASON.operationInFlight,
    () => cancelAccountingWork({ work: stuck.work_id, author: BOB(), opKey: key }),
    "wc.29 a key held by an in-flight sibling is refused by name");
  assert.equal((await workRow(stuck.work_id)).status, "queued", "wc.29 …and nothing happened");
});

test("wc.30 the cancellation's words have ONE source: clara._work_cancelled_error()", async (t) => {
  if (await gateCancel(t)) return;
  const r = await rootQuery("select clara._work_cancelled_error() as e");
  assert.deepEqual(r.rows[0].e, {
    code: "cancelled", reason: "cancelled", recoverable: true,
    message: "This Work was cancelled before an entry was recorded. Nothing was posted.",
  }, "wc.30 the helper's object is the lane's contract, byte for byte");

  // …and every SQL writer of that fact reaches for it rather than retyping it. The runtime twin
  // (`cancelSettleForWork`, reconciler-work.mjs) is pinned against this same function from the
  // runtime package's own DB battery — a cross-package import is not how this estate pins a
  // contract (rig-helpers.mjs' own note).
  const w = await admitted();
  await cancelAccountingWork({ work: w.work_id, author: BOB() });
  assert.deepEqual((await workRow(w.work_id)).error, r.rows[0].e,
    "wc.30 a queued Work cancelled through the door carries exactly it");

  const v = await running();
  await cancelAccountingWork({ work: v.work_id, author: BOB() });
  await settleWorkRun({ task: v.task_id, outcome: "failed", errorCode: "internal",
    error: { code: "internal", reason: "run_failed", message: "gone", recoverable: true } });
  const translated = (await workRow(v.work_id)).error;
  const { superseded, ...rest } = translated;
  assert.deepEqual(rest, r.rows[0].e, "wc.30 …and so does a settle the cancel translated");
  assert.equal(superseded.outcome, "failed", "wc.30 with the run's own request preserved underneath");
});

test("wc.31 the credential mint TYPES its authority refusal, so the revocation path is recognisable", async (t) => {
  if (await gateCancel(t)) return;
  // The refusal a mid-run revocation actually produces. Before this recut it carried NO detail, so
  // the Work settled `refused` with `reason: null` and no surface could tell an authority loss
  // from any other CLR10 — which is why B3 offered a Retry that could never succeed.
  const w = await orphaned();
  const err = await assertRaises(CLR.badRequest,
    () => mintClientObo({ firm: FIRM_A(), obo: w.initiator, client: w.client }),
    "wc.31 a revoked human cannot be minted a credential");
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "authority_lost",
    "wc.31 …and the refusal says WHY, in the word claraWork's own authority recheck uses");

  // …and that Work is exactly the one a colleague may take responsibility for.
  const out = await takeOverAccountingWork({ work: w.work_id, author: colleague });
  assert.equal(out.taken_over, true, "wc.31 the revocation path is takeable");
});
