// #630 — THE RUNTIME HALF OF THE CANCEL BOUNDARY. Real Postgres, MOCKED WORLD (`cancelRun` /
// `getRun` are injected), so every cell below is deterministic: no engine, no network, no sleeping.
//
// THREE CLAIMS, and each one is a way the estate could previously have lied to an operator:
//
//   1. A `stopping` Work is SETTLED WITHIN ONE CONTROL CYCLE, and by the receipt law: a Work that
//      recorded an entry settles `completed` carrying it, and only a Work that posted nothing
//      settles `cancelled`. The runtime asks the books BEFORE it names a terminal
//      (`cancelSettleForWork`), and the database translates whatever it asks for when a cancel
//      raced it (`clara.settle_work_run`, 0184). BOTH belts, because either alone has been wrong.
//   2. A WORKER CRASH between the cancel write and the settle is repaired by the reconciler's own
//      cancel loop after respawn — the row does not sit in `cancel_requested` forever, which is the
//      2026-07-31 Section-I zombie in this lane.
//   3. STOP REPLY IS NOT CANCEL WORK. `clara.cancel_agent_task` on the CHAT-TURN task that started
//      a Work must not touch the Work's own task or row. The two are separate `clara.agent_tasks`
//      rows with no cascade between them, and this file proves it against the real doors rather
//      than by reading the SQL.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { processCancellations } from "../lib/control.mjs";
import { reconcileTasks } from "../lib/reconciler.mjs";
import { cancelSettleForWork, committedWorkResult } from "../lib/reconciler-work.mjs";
import * as rig from "./rig.mjs";

async function cancelLaneReady() {
  try {
    const r = await rig.rootQuery(`
      select
        to_regprocedure('clara.cancel_accounting_work(uuid,uuid,text)') is not null as cancel_fn,
        to_regprocedure('clara.take_over_accounting_work(uuid,uuid,text,text)') is not null as takeover_fn,
        to_regclass('clara.accounting_work') is not null as work_tbl`);
    const row = r.rows[0] ?? {};
    return Boolean(row.cancel_fn && row.takeover_fn && row.work_tbl);
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await cancelLaneReady());
const SKIP = READY ? false : "migration 0184 (work cancel ordering) is not on this database";

after(async () => {
  await rig.endPool();
});

function basis() {
  return {
    posting_date: "2026-09-01",
    memo: "office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
    ],
  };
}

/** The two accounts this file's basis codes to, created through the estate's OWN door. A planted
 *  `clara.coa_accounts` row would prove nothing about what the commit-time chart check reads. */
async function ensureChart(owner, client) {
  for (const [code, name, type] of [["6100", "Rent expense", "expense"], ["1100", "Maybank current", "asset"]]) {
    await rig.humanQuery(owner,
      "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
      [client, code, name, type, `coa-${randomUUID()}`]);
  }
}

/** An admitted Work, claimed onto a run. Everything through the REAL verbs. */
async function claimedWork(label) {
  const { owner, firm, client } = await rig.buildFirm(label);
  await ensureChart(owner, client);
  const admitted = await rig
    .asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
        client, owner, `wc-${label}-${randomUUID()}`, JSON.stringify(basis()), "user_direct", "[]", rig.DEFAULT_MODEL,
      ]),
    )
    .then((r) => r.rows[0].r);
  const runId = `run-${label}-${randomUUID()}`;
  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [
      admitted.task_id, runId,
      JSON.stringify({ id: "clara-work/v2", digest: "f".repeat(64), model: rig.DEFAULT_MODEL }),
    ]),
  );
  return { owner, firm, client, runId, taskId: admitted.task_id, workId: admitted.work_id,
    logicalOpId: admitted.logical_op_id };
}

/** Cancel the WORK through the real door, as the route does. */
const cancelWork = (work, author) =>
  rig.asRuntime((c) =>
    c.query("select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as r",
      [work, author, `cancel-${randomUUID()}`])).then((r) => r.rows[0].r);

const readWork = (id) =>
  rig.rootQuery("select * from clara.accounting_work where id=$1", [id]).then((r) => r.rows[0] ?? null);

/** Plant a committed receipt the honest way: run the real posting core under a real
 *  `interactive_client` credential minted OBO the Work's responsible human. */
async function postEntry({ firm, owner, client, workId, logicalOpId, runId }) {
  const cred = await rig.rootQuery(
    "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
    ["interactive_client", firm, owner, "15 minutes", client]).then((r) => r.rows[0]);
  const c = await rig.getPool().connect();
  try {
    await c.query("set role clara_wake_interactive");
    await c.query("begin");
    await c.query("select set_config('clara.wake_secret', $1, true)", [cred.secret]);
    const r = await c.query(
      `select clara.wake_record_journal_entry($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::text,$7::text) as r`,
      [client, workId, logicalOpId, JSON.stringify(basis()), "f".repeat(64), runId, "#630 rig"]);
    await c.query("commit");
    return r.rows[0].r;
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

// ===========================================================================================
// 1 · The receipt law, as a PURE predicate — the one both cancel paths share.
// ===========================================================================================

test("pure: cancelSettleForWork asks the books, never the run", { skip: SKIP }, () => {
  assert.equal(cancelSettleForWork(null).outcome, "cancelled");
  assert.equal(cancelSettleForWork({ budget: { toolCalls: 2 } }).outcome, "cancelled",
    "a result object with no entry_id describes a run, not a posting");
  const posted = cancelSettleForWork({ entry_id: "e1", receipt_id: "r1" });
  assert.equal(posted.outcome, "completed", "an entry on the books outranks the cancellation");
  assert.deepEqual(posted.result, { entry_id: "e1", receipt_id: "r1" });
  assert.equal(committedWorkResult({ entry_id: "   " }), null, "a blank entry id is not evidence");
});

// ===========================================================================================
// 2 · One control cycle settles a stopping Work — both ways.
// ===========================================================================================

test("cycle: a cancelled Work that posted NOTHING settles cancelled within one cycle", { skip: SKIP }, async () => {
  const w = await claimedWork("c1");
  const out = await cancelWork(w.workId, w.owner);
  assert.equal(out.status, "stopping", "precondition: the Work is stopping, not yet terminal");

  const aborted = [];
  const res = await rig.asRuntime((c) =>
    processCancellations(c, { cancelRun: async (id) => aborted.push(id), onlyFirm: w.firm }));
  assert.equal(res.settled, 1, "the cycle settled exactly one row");
  assert.equal(res.settleFailed, 0);
  assert.deepEqual(aborted, [w.runId], "the ENGINE run was aborted before the settle");

  const work = await readWork(w.workId);
  assert.equal(work.status, "cancelled", "the Work reaches its terminal only after the boundary is known");
  assert.equal(work.error.reason, "cancelled");
  assert.equal((await rig.readTask(w.taskId)).status, "cancelled");
  const entries = await rig.rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1", [w.client]);
  assert.equal(entries.rows[0].n, 0, "nothing was posted");
});

test("cycle: a cancelled Work that DID post settles completed, carrying its entry", { skip: SKIP }, async () => {
  const w = await claimedWork("c2");
  const posted = await postEntry(w);
  assert.equal(posted.posted, true, "precondition: the entry is on the books");

  // The Work-level door short-circuits on the receipt, so drive the task to cancel_requested
  // through the ESTATE's own door — the shape a human pressing Stop on the RUN produces.
  await rig.humanQuery(w.owner, "select clara.cancel_agent_task($1::uuid,$2::text)",
    [w.taskId, `k-${randomUUID()}`]);
  assert.equal((await rig.readTask(w.taskId)).status, "cancel_requested");
  assert.equal((await readWork(w.workId)).status, "stopping",
    "…and the Work reads stopping through the 0184 mirror");

  const res = await rig.asRuntime((c) =>
    processCancellations(c, { cancelRun: async () => {}, onlyFirm: w.firm }));
  assert.equal(res.settled, 1);
  const work = await readWork(w.workId);
  assert.equal(work.status, "completed", "a cancel never un-posts an entry");
  assert.equal(work.error, null);
  assert.equal(work.result.entry_id, posted.entry_id, "…and the result carries the entry it completed BY");
});

// ===========================================================================================
// 3 · Crash repair: the reconciler owns the same edge as a safety net.
// ===========================================================================================

test("repair: a worker that died between the cancel write and the settle is repaired by the reconciler", { skip: SKIP }, async () => {
  const w = await claimedWork("c3");
  await cancelWork(w.workId, w.owner);
  // The worker died HERE — the cancel is written, nothing settled it. No control cycle runs.
  assert.equal((await rig.readTask(w.taskId)).status, "cancel_requested");
  assert.equal((await readWork(w.workId)).status, "stopping");

  const res = await rig.asRuntime((c) =>
    reconcileTasks(c, {
      enqueueChatTurn: async () => ({ runId: "x" }),
      getRun: () => ({ status: Promise.resolve("cancelled"), cancel: async () => {} }),
      onlyFirm: w.firm,
    }));
  assert.ok(res.cancelled >= 1, `the sweep settled the stranded row (cancelled=${res.cancelled})`);
  assert.equal((await readWork(w.workId)).status, "cancelled");
  assert.equal((await rig.readTask(w.taskId)).status, "cancelled");
});

test("repair: the sweep does NOT settle a row whose engine abort failed", { skip: SKIP }, async () => {
  const w = await claimedWork("c4");
  await cancelWork(w.workId, w.owner);
  const res = await rig.asRuntime((c) =>
    reconcileTasks(c, {
      enqueueChatTurn: async () => ({ runId: "x" }),
      getRun: () => ({ status: Promise.resolve("running"), cancel: async () => { throw new Error("engine unreachable"); } }),
      onlyFirm: w.firm,
    }));
  assert.equal(res.cancelled, 0, "never fabricate a terminal for a run that may still be acting");
  assert.equal((await readWork(w.workId)).status, "stopping", "the Work stays stopping for the next sweep");
  assert.equal((await rig.readTask(w.taskId)).status, "cancel_requested");
});

// ===========================================================================================
// 4 · Stop reply is not Cancel Work.
// ===========================================================================================

test("labels: cancelling the CHAT TURN that started a Work leaves the Work running", { skip: SKIP }, async () => {
  const { owner, firm, client } = await rig.buildFirm("c5");
  const session = await rig.createChatSession({ author: owner, client });
  const turn = await rig.beginChatTurn({ session, author: owner });
  const turnTask = turn.task_id ?? turn.taskId ?? turn.task;
  assert.ok(turnTask, `the chat turn minted a task (${JSON.stringify(turn)})`);

  // The Work the turn "started": a SEPARATE clara.agent_tasks row of kind accounting_work.
  const admitted = await rig
    .asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
        client, owner, `wc-c5-${randomUUID()}`, JSON.stringify(basis()), "user_direct", "[]", rig.DEFAULT_MODEL,
      ]),
    )
    .then((r) => r.rows[0].r);
  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [
      admitted.task_id, `run-c5-${randomUUID()}`,
      JSON.stringify({ id: "clara-work/v2", digest: "f".repeat(64), model: rig.DEFAULT_MODEL }),
    ]),
  );
  assert.notEqual(admitted.task_id, turnTask, "the Work's run is its OWN task row");

  // STOP REPLY: cancel the chat turn.
  await rig.humanQuery(owner, "select clara.cancel_agent_task($1::uuid,$2::text)",
    [turnTask, `k-${randomUUID()}`]);

  assert.equal((await readWork(admitted.work_id)).status, "running",
    "stopping the reply does NOT cancel Work that was already accepted");
  assert.equal((await rig.readTask(admitted.task_id)).status, "running",
    "…and the Work's own run is untouched");
  const turnRow = await rig.readTask(turnTask);
  assert.ok(["cancel_requested", "cancelled"].includes(turnRow.status),
    `the chat turn itself IS cancelled (${turnRow.status})`);

  // …and one control cycle settles the turn without touching the Work.
  await rig.asRuntime((c) => processCancellations(c, { cancelRun: async () => {}, onlyFirm: firm }));
  assert.equal((await readWork(admitted.work_id)).status, "running",
    "a control cycle that settles the turn still leaves the Work alone");
});

// ===========================================================================================
// 5 · After cancellation, the boundary admits no new business action.
// ===========================================================================================

test("boundary: a tool call arriving AFTER the cancel is refused work_cancelled and posts nothing", { skip: SKIP }, async () => {
  const w = await claimedWork("c6");
  await cancelWork(w.workId, w.owner);
  let raised = null;
  try {
    await postEntry(w);
  } catch (err) {
    raised = err;
  }
  assert.ok(raised, "the admitted operation was refused");
  assert.equal(raised.code, "CLR13", "…with the estate's wrong-state code");
  assert.equal(JSON.parse(raised.detail).reason, "work_cancelled", "…and the exact typed reason");
  const entries = await rig.rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1", [w.client]);
  assert.equal(entries.rows[0].n, 0, "no effect was created");
  const receipts = await rig.rootQuery(
    "select count(*)::int as n from clara.operation_receipts where work_id=$1", [w.workId]);
  assert.equal(receipts.rows[0].n, 0, "…and no receipt");

  // A SECOND attempt answers identically — the refusal is a property of the state, not a one-shot.
  let again = null;
  try { await postEntry(w); } catch (err) { again = err; }
  assert.equal(JSON.parse(again.detail).reason, "work_cancelled",
    "no new business action is admitted, however many times the model tries");
});
