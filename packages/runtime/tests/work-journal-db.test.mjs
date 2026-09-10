// #623 — the Work lane's DB edges, under the REAL least-privileged roles on a rig.
//
// These cells drive the four runtime-lane verbs migration 0178 introduces — `admit_journal_work`,
// `retry_accounting_work`, `claim_work_run`, `settle_work_run` — as `clara_runtime`, which is the
// role the runtime pool actually SET ROLEs to. What they prove is what the scripted-model cells
// cannot: that admission is idempotent on the intent key, that a changed payload under the same
// key is a TYPED conflict rather than a second Work, that the claim is a CAS one run wins, and
// that the settle is idempotent by task.
//
// GATED ON THE 0178 FRONTIER, and the gate is a POSITIVE read of the catalog rather than a
// version number: this branch's runtime half merges alongside the DB half, and a cell that
// pretended to pass against a database without the verbs would be worse than one that says it
// did not run. `node --test` has no file-level skip, so every cell carries its own `{ skip }` —
// the shape the rest of this suite uses for a migration-gated file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { register } from "tsx/esm/api";

import * as rig from "./rig.mjs";
import { AuthError, assertTaskStreamAccess, resolvePrincipal } from "../lib/authz.mjs";
import { processCancellations } from "../lib/control.mjs";
import { reconcileAccountingWorkTasks } from "../lib/reconciler-work.mjs";

register();
const { workErrorStatus, WORK_MAPPED_CODES } = await import("../src/workRoutes.ts");

/** Positive catalog probe: the relations AND the four runtime-lane verbs 0178 introduces. */
async function accountingWorkReady() {
  try {
    const r = await rig.rootQuery(`
      select
        to_regclass('clara.accounting_work') is not null as work_tbl,
        to_regclass('clara.operation_receipts') is not null as receipts_tbl,
        to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is not null as admit,
        to_regprocedure('clara.retry_accounting_work(uuid,uuid,text)') is not null as retry,
        to_regprocedure('clara.claim_work_run(uuid,text,jsonb)') is not null as claim,
        to_regprocedure('clara.settle_work_run(uuid,text,text,jsonb,jsonb)') is not null as settle
    `);
    const row = r.rows[0] ?? {};
    return row.work_tbl && row.receipts_tbl && row.admit && row.retry && row.claim && row.settle;
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await accountingWorkReady());
const SKIP = READY ? false : "migration 0178 (clara.accounting_work + the four runtime-lane verbs) is not on this database";
const MODEL = rig.DEFAULT_MODEL;

function basis(overrides = {}) {
  const base = {
    posting_date: "2026-09-01",
    memo: "office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
    ],
  };
  return Object.assign(base, overrides);
}

const admit = (client, author, intentKey, b = basis(), origin = "user_direct", refs = []) =>
  rig
    .asRuntime((c) =>
      c.query("select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r", [
        client,
        author,
        intentKey,
        JSON.stringify(b),
        origin,
        JSON.stringify(refs),
        MODEL,
      ]),
    )
    .then((r) => r.rows[0].r);

/** The run manifest `clara.claim_work_run` demands. 0178 refuses a claim whose bundle cannot
 *  state BOTH its id and its digest (C88.8: "a run that cannot state WHICH bundle is serving it
 *  may not claim work at all"), so every claim in this file carries the real pair — the shape
 *  claraWork_v1's own `claimWorkRunStep` passes. */
const manifestFor = (digest = "f".repeat(64)) => ({
  id: "clara-work/v1",
  digest,
  budgets: { segments: 4 },
  model: MODEL,
});

const readWork = (id) => rig.rootQuery("select * from clara.accounting_work where id = $1", [id]).then((r) => r.rows[0] ?? null);
const tasksForWork = (id) =>
  rig.rootQuery("select id, status, kind, workflow_run_id, error_code from clara.agent_tasks where work_id = $1 order by created_at", [id]).then((r) => r.rows);

/** Every raised error, captured with its SQLSTATE and its typed detail — the pair the runtime
 *  classifier keys on, so a cell that only caught the message would not be testing the contract. */
async function refused(fn) {
  try {
    await fn();
  } catch (err) {
    let detail = null;
    try {
      detail = err.detail ? JSON.parse(err.detail) : null;
    } catch {
      detail = { raw: err.detail };
    }
    return { code: err.code, detail, message: err.message };
  }
  throw new Error("expected a refusal, got success");
}

test("623.db: admission mints ONE Work, ONE queued task and a server-assigned logical identity", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-admit");
  const key = `intent_${randomUUID()}`;
  const receipt = await admit(client, owner, key);

  assert.ok(receipt.work_id, "a work id comes back");
  assert.ok(receipt.task_id, "and a task id");
  assert.equal(receipt.status, "queued");
  assert.equal(receipt.replayed, false);
  assert.equal(
    receipt.logical_op_id,
    `work:${receipt.work_id}:journal_entry:1`,
    "the logical identity is SERVER-assigned and parser-free (C33.8) — never client-supplied",
  );

  const work = await readWork(receipt.work_id);
  assert.equal(work.purpose, "journal_entry");
  assert.equal(work.status, "queued");
  assert.equal(work.client_id, client);
  assert.equal(work.initiator, owner);
  assert.equal(work.basis_origin, "user_direct");
  assert.deepEqual(work.source_refs, [], "a documentless Work carries an EMPTY source list, not a fabricated one");
  assert.ok(/^[0-9a-f]{64}$/.test(work.basis_digest), "the DATABASE derived the digest; the runtime never sends one");
  assert.equal(String(work.current_task_id), String(receipt.task_id));
  assert.ok(work.initiator_role, "the role at admission is snapshotted for display");

  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].kind, "accounting_work");
  assert.equal(tasks[0].status, "queued");
  assert.equal(tasks[0].workflow_run_id, null, "admission never binds a run — the workflow CAS-binds itself");
});

test("623.db: the same intent key with the SAME basis replays and mints no second task", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-replay");
  const key = `intent_${randomUUID()}`;
  const first = await admit(client, owner, key);
  const second = await admit(client, owner, key);

  assert.equal(second.work_id, first.work_id, "one intent, one Work");
  assert.equal(second.logical_op_id, first.logical_op_id);
  assert.equal(second.replayed, true, "the second admission says so, rather than pretending to be first");
  const tasks = await tasksForWork(first.work_id);
  assert.equal(tasks.length, 1, "a lost acknowledgement re-POSTed costs nothing");
});

test("623.db: the same intent key with a DIFFERENT basis is a typed conflict, not a second Work", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-conflict");
  const key = `intent_${randomUUID()}`;
  const first = await admit(client, owner, key);

  const changed = basis({
    lines: [
      { account_code: "6100", debit_cents: 130000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 130000, description: "Maybank" },
    ],
  });
  const err = await refused(() => admit(client, owner, key, changed));
  assert.equal(err.code, "CLR10");
  assert.equal(err.detail?.reason, "intent_payload_conflict", "TYPED — the runtime classifier keys on this, not on prose");

  const tasks = await tasksForWork(first.work_id);
  assert.equal(tasks.length, 1, "the conflict created NO second effect");
});

test("623.db: an empty or whitespace intent key is refused BEFORE any reservation (C82.1)", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-blank");
  for (const key of ["", "   ", "\t\n"]) {
    const err = await refused(() => admit(client, owner, key));
    assert.equal(err.code, "CLR10", `a blank key (${JSON.stringify(key)}) is refused`);
  }
  const rows = await rig.rootQuery("select count(*)::int as n from clara.accounting_work where client_id = $1", [client]);
  assert.equal(rows.rows[0].n, 0, "nothing was reserved on the way to refusing");
});

test("623.db: an invalid basis is refused with the offending FIELD named", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-invalid");
  const unbalanced = basis({
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0 },
      { account_code: "1100", debit_cents: 0, credit_cents: 110000 },
    ],
  });
  const err = await refused(() => admit(client, owner, `intent_${randomUUID()}`, unbalanced));
  assert.equal(err.code, "CLR10");
  assert.equal(err.detail?.reason, "invalid_basis");

  const oneLine = basis({ lines: [{ account_code: "6100", debit_cents: 120000, credit_cents: 0 }] });
  const err2 = await refused(() => admit(client, owner, `intent_${randomUUID()}`, oneLine));
  assert.equal(err2.detail?.reason, "invalid_basis");
});

test("623.db: claim_work_run is a CAS exactly one run wins, and a reclaim by the SAME run is idempotent", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-claim");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  const manifest = manifestFor();

  const claim = (runId) =>
    rig
      .asRuntime((c) => c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb) as r", [receipt.task_id, runId, JSON.stringify(manifest)]))
      .then((r) => r.rows[0].r);

  const first = await claim("run-A");
  assert.equal(first.claimed, true, "the first run claims it");
  const again = await claim("run-A");
  assert.equal(again.claimed, true, "the SAME run reclaiming (a step re-execution) is not a failure");
  const other = await claim("run-B");
  assert.equal(other.claimed, false, "a duplicate start self-aborts — C-35's 'preserve the old run identity'");

  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "running");
  assert.equal(work.bundle?.digest, manifest.digest, "the bundle manifest is stamped in the SAME transaction as the bind");
  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks[0].status, "running");
  assert.equal(tasks[0].workflow_run_id, "run-A", "the FIRST run keeps the task");
});

test("623.db: settle_work_run settles both halves and is idempotent by task", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-settle");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [receipt.task_id, "run-S", JSON.stringify(manifestFor())]),
  );

  const settle = (outcome, errorCode, error, result) =>
    rig
      .asRuntime((c) =>
        c.query("select clara.settle_work_run($1::uuid,$2::text,$3::text,$4::jsonb,$5::jsonb) as r", [
          receipt.task_id,
          outcome,
          errorCode,
          error == null ? null : JSON.stringify(error),
          result == null ? null : JSON.stringify(result),
        ]),
      )
      .then((r) => r.rows[0].r);

  const refusalPayload = { code: "CLR10", reason: "write_into_closed_period", message: "the period is closed", recoverable: true };
  await settle("refused", "tool_error", refusalPayload, null);

  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "refused", "the WORK carries `refused` — a status the task table has no member for");
  assert.equal(work.error?.reason, "write_into_closed_period", "and the typed reason survives to the human");
  assert.equal(work.error?.recoverable, true);
  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks[0].status, "failed", "the TASK rides as failed/tool_error — the estate's own CHECK vocabulary");
  assert.equal(tasks[0].error_code, "tool_error");

  const replayed = await settle("refused", "tool_error", refusalPayload, null);
  assert.equal(replayed.replayed, true, "an already-terminal task replays rather than raising");
});

test("623.db: budget exhaustion settles failed with error_code 'limit'", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-limit");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [receipt.task_id, "run-L", JSON.stringify(manifestFor())]),
  );
  await rig.asRuntime((c) =>
    c.query("select clara.settle_work_run($1::uuid,'failed','limit',$2::jsonb,null::jsonb)", [
      receipt.task_id,
      JSON.stringify({ code: "budget_exhausted", reason: "segments", message: "out of budget", recoverable: true }),
    ]),
  );
  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks[0].error_code, "limit", "'limit' is what the agent_tasks CHECK admits for a spent budget");
  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "failed");
  assert.equal(work.error?.code, "budget_exhausted");
  assert.equal(work.error?.recoverable, true, "a spent budget leaves a RECOVERABLE state");
});

test("623.db: retry makes a NEW run for the SAME logical identity, and only from a terminal state", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-retry");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);

  const retry = (opKey) =>
    rig
      .asRuntime((c) => c.query("select clara.retry_accounting_work($1::uuid,$2::uuid,$3::text) as r", [receipt.work_id, owner, opKey]))
      .then((r) => r.rows[0].r);

  // A queued Work is not retryable — there is nothing to retry. The estate spells "the state is
  // not the one this act needs" CLR13, and the typed reason is what the route turns into the
  // contract's 409 `{error:"not_retryable", status}`.
  const tooEarly = await refused(() => retry(`op_${randomUUID()}`));
  assert.equal(tooEarly.code, "CLR13");
  assert.equal(tooEarly.detail?.reason, "not_retryable");
  assert.equal(tooEarly.detail?.status, "queued", "and it names the status that made the retry illegal");

  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [receipt.task_id, "run-R", JSON.stringify(manifestFor())]),
  );
  await rig.asRuntime((c) =>
    c.query("select clara.settle_work_run($1::uuid,'refused','tool_error',$2::jsonb,null::jsonb)", [
      receipt.task_id,
      JSON.stringify({ code: "CLR10", reason: "write_into_closed_period", message: "closed", recoverable: true }),
    ]),
  );

  const opKey = `op_${randomUUID()}`;
  const retried = await retry(opKey);
  assert.equal(retried.work_id, receipt.work_id, "the SAME Work");
  assert.equal(retried.logical_op_id, receipt.logical_op_id, "and the SAME logical operation identity (C-62)");
  assert.notEqual(retried.task_id, receipt.task_id, "a NEW run");
  assert.equal(retried.status, "queued");

  const again = await retry(opKey);
  assert.equal(again.replayed, true, "the retry is idempotent on its op key");
  assert.equal(again.task_id, retried.task_id);

  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks.length, 2, "exactly two runs — the original and the retry");
});

test("623.db: a below-floor or foreign author cannot admit Work for a client", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-authz");
  const outsider = await rig.buildFirm("w-outsider");
  const foreign = await refused(() => admit(client, outsider.owner, `intent_${randomUUID()}`));
  assert.ok(["CLR03", "CLR04", "CLR11"].includes(foreign.code), `a foreign author is refused (got ${foreign.code})`);

  const viewer = await rig.addMember(owner, await rig.firmOfClient(client), { role: "viewer", prefix: "wv" });
  const below = await refused(() => admit(client, viewer, `intent_${randomUUID()}`));
  assert.ok(["CLR03", "CLR04"].includes(below.code), `a below-bookkeeper member is refused (got ${below.code})`);
});

// ==============================================================================================
// THE RECOVERY BELTS, against the real verbs and the real least-privileged role. These are the
// reviewed findings R1/R2/R6 at the only altitude that can prove them: a mock client can show the
// runtime ASKS for the right outcome, but only the database can show what the Work ends up saying.
// ==============================================================================================

/** Claim a Work's current task onto a run id, the way claraWork_v1's own claim step does. */
const claimFor = (taskId, runId) =>
  rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [taskId, runId, JSON.stringify(manifestFor())]),
  );

/** An engine double for the reconciler: every run id reports the same terminal status. */
const engineAlways = (status) => () => ({
  get status() {
    if (status === "lost") return Promise.reject(Object.assign(new Error("run not found"), { code: "RUN_NOT_FOUND" }));
    return Promise.resolve(status);
  },
  cancel: async () => {},
});

test("623.db.R1: a run that POSTED and then died settles COMPLETED, not 'Nothing was posted'", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-receipt");
  const firm = await rig.firmOfClient(client);
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  await claimFor(receipt.task_id, "run-posted");

  // The effect the tool's own commit leaves on the Work. This is the ONLY witness `clara_runtime`
  // can see — 0178 grants it SELECT on clara.accounting_work and NOTHING on
  // clara.operation_receipts — and it is what the belt must consult before naming a terminal.
  const posted = { entry_id: randomUUID(), receipt_id: randomUUID(), posted_at: new Date().toISOString() };
  await rig.rootQuery("update clara.accounting_work set result = $2::jsonb where id = $1", [receipt.work_id, JSON.stringify(posted)]);

  const out = await rig.asRuntime((c) =>
    reconcileAccountingWorkTasks(c, { enqueueClaraWork: async () => {}, getRun: engineAlways("lost"), onlyFirm: firm }),
  );
  assert.equal(out.workSettledCompleted, 1, "the belt settled it from the BOOKS, not from the dead engine");
  assert.equal(out.workSettledFailed, 0);

  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "completed", "a dead run cannot un-post an entry");
  assert.equal(work.error, null, "and no 'Nothing was posted.' is written over one that was");
  assert.equal(work.result.entry_id, posted.entry_id, "the entry survives as the Work's result");
  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks[0].status, "completed");
  assert.equal(tasks[0].error_code, null, "a completed run carries no task error");
});

test("623.db.R1: a run that posted NOTHING and died is still an honest failure", { skip: SKIP }, async () => {
  const { owner, client } = await rig.buildFirm("w-noeffect-db");
  const firm = await rig.firmOfClient(client);
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  await claimFor(receipt.task_id, "run-empty");

  const out = await rig.asRuntime((c) =>
    reconcileAccountingWorkTasks(c, { enqueueClaraWork: async () => {}, getRun: engineAlways("failed"), onlyFirm: firm }),
  );
  assert.equal(out.workSettledFailed, 1);
  assert.equal(out.workSettledCompleted, 0, "the receipt arm is EVIDENCE-driven, not a way to call everything completed");

  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "failed");
  assert.equal(work.error?.reason, "run_failed");
  assert.match(work.error?.message ?? "", /Nothing was posted/);
  assert.equal(work.error?.recoverable, true, "and a human's Retry is still on the table");
});

test("623.db.R2: a cancel_requested Work settles through settle_work_run and the cycle carries on", { skip: SKIP }, async () => {
  const { owner, firm, client } = await rig.buildFirm("w-cancel");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  await claimFor(receipt.task_id, "run-cancel");
  await rig.rootQuery("update clara.agent_tasks set status = 'cancel_requested' where id = $1", [receipt.task_id]);

  // A CHAT turn cancelled in the SAME firm, created AFTER the Work so it sorts behind it. Before
  // this fix the Work row raised CLR10 out of settle_chat_turn and took the whole control cycle
  // with it — this second row is the one that used to never be reached.
  const session = await rig.createChatSession({ author: owner, client, visibility: "private" });
  const { task_id: chatTask } = await rig.beginChatTurn({ session, author: owner });
  await rig.bindRun(chatTask, "run-chat-cancel");
  await rig.driveTask(chatTask, ["cancel_requested"]);

  const aborted = [];
  const logged = [];
  const out = await rig.asRuntime((c) =>
    processCancellations(c, { cancelRun: async (r) => aborted.push(r), onlyFirm: firm, log: (m) => logged.push(m) }),
  );

  assert.equal(out.settleFailed, 0, `no row refused its settle (${logged.join(" | ")})`);
  assert.equal(out.settled, 2, "BOTH rows settled — the Work no longer aborts the cycle before the chat turn");
  assert.deepEqual(aborted.sort(), ["run-cancel", "run-chat-cancel"], "both engine runs were aborted first");

  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "cancelled", "the WORK carries cancelled — a status settle_chat_turn could never write");
  assert.match(work.error?.message ?? "", /Nothing was posted/);
  const tasks = await tasksForWork(receipt.work_id);
  assert.equal(tasks[0].status, "cancelled");
  assert.equal((await rig.readTask(chatTask)).status, "cancelled", "and the chat turn behind it settled too");
});

test("623.db.R2: cancelling a Work that ALREADY POSTED completes it instead of erasing the entry", { skip: SKIP }, async () => {
  const { owner, firm, client } = await rig.buildFirm("w-cancel-posted");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  await claimFor(receipt.task_id, "run-cancel-posted");
  const posted = { entry_id: randomUUID(), receipt_id: randomUUID() };
  await rig.rootQuery("update clara.accounting_work set result = $2::jsonb where id = $1", [receipt.work_id, JSON.stringify(posted)]);
  await rig.rootQuery("update clara.agent_tasks set status = 'cancel_requested' where id = $1", [receipt.task_id]);

  const out = await rig.asRuntime((c) => processCancellations(c, { cancelRun: async () => {}, onlyFirm: firm }));
  assert.equal(out.settled, 1);
  assert.equal(out.settleFailed, 0);

  const work = await readWork(receipt.work_id);
  assert.equal(work.status, "completed", "ARCHITECTURE §6: a cancel does not reverse a posted entry");
  assert.equal(work.result.entry_id, posted.entry_id);
  assert.equal(work.error, null);
});

test("623.db.R6: the Work's own stream is reachable by its firm, and by nobody else", { skip: SKIP }, async () => {
  const { owner, firm, client } = await rig.buildFirm("w-stream");
  const receipt = await admit(client, owner, `intent_${randomUUID()}`);
  const task = await rig.readTask(receipt.task_id);
  assert.equal(task.session_id, null, "an accounting_work task carries NO chat session — the reason the old join dropped it");

  const ownerP = await rig.asRuntime((c) => resolvePrincipal(c, owner));
  const access = await rig.asRuntime((c) => assertTaskStreamAccess(c, receipt.task_id, ownerP));
  assert.equal(String(access.task_id), String(receipt.task_id), "the initiator reaches their own Work's stream");
  assert.equal(access.kind, "accounting_work");
  assert.equal(access.status, "queued", "and the row carries what streamRoute reads");
  assert.equal(access.workflow_run_id, null);

  // A colleague in the SAME firm reaches it too: clara.accounting_work's human read policy is
  // `firm_id = clara.jwt_firm()` with no per-client clause (0178's header), and this arm is that
  // policy, not a narrower guess.
  const colleague = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: "wsm" });
  const colleagueP = await rig.asRuntime((c) => resolvePrincipal(c, colleague));
  assert.ok(await rig.asRuntime((c) => assertTaskStreamAccess(c, receipt.task_id, colleagueP)));

  // Another firm's member gets the SAME 404 a nonexistent task gets — no existence oracle.
  const outsider = await rig.buildFirm("w-stream-out");
  const outsiderP = await rig.asRuntime((c) => resolvePrincipal(c, outsider.owner));
  const foreign = await rig.asRuntime((c) => assertTaskStreamAccess(c, receipt.task_id, outsiderP)).catch((e) => e);
  const missing = await rig.asRuntime((c) => assertTaskStreamAccess(c, randomUUID(), ownerP)).catch((e) => e);
  const malformed = await rig.asRuntime((c) => assertTaskStreamAccess(c, "not-a-uuid", ownerP)).catch((e) => e);
  for (const [label, err] of [["foreign", foreign], ["missing", missing], ["malformed", malformed]]) {
    assert.ok(err instanceof AuthError, `${label} raises AuthError`);
    assert.equal(err.status, 404, `${label} is 404`);
    assert.equal(err.message, "not found", `${label} says the same thing as the others`);
  }
});

test("623.db.R6: the chat arm is untouched — a foreign-private session is still 404", { skip: SKIP }, async () => {
  const { owner, firm, client } = await rig.buildFirm("w-stream-chat");
  const member = await rig.addMember(owner, firm, { role: "bookkeeper", prefix: "wsc" });
  const ownerP = await rig.asRuntime((c) => resolvePrincipal(c, owner));
  const memberP = await rig.asRuntime((c) => resolvePrincipal(c, member));

  const priv = await rig.createChatSession({ author: owner, client, visibility: "private" });
  const { task_id: taskId } = await rig.beginChatTurn({ session: priv, author: owner });

  const mine = await rig.asRuntime((c) => assertTaskStreamAccess(c, taskId, ownerP));
  assert.equal(mine.kind, "chat_turn");
  assert.equal(String(mine.session_id), String(priv), "the chat arm still resolves through the session");

  const denied = await rig.asRuntime((c) => assertTaskStreamAccess(c, taskId, memberP)).catch((e) => e);
  assert.ok(denied instanceof AuthError && denied.status === 404, "a firm colleague still cannot read a private session's stream");
});

// ==============================================================================================
// The route's CLR CENSUS — the c5-chat-clr-census idiom, pointed at the Work doors.
//
// WHY IT READS THE CATALOG RATHER THAN A LIST. A hand-written roster of "the codes admission can
// raise" is a comment, and comments do not fail. This recomputes the reachable set from `prosrc`
// on every run — the two doors, their whole clara-to-clara call graph, AND the triggers on the
// two relations they write, because the refusals that bite hardest (the immutability belt, the
// agent_tasks transition matrix) live in triggers no prosrc call-graph can see.
//
// BOTH DIRECTIONS. A raised code missing from the map is a 500 waiting to happen for an ordinary
// caller mistake; a mapped code nothing raises is a claim the route does not close.
// ==============================================================================================

const RAISE_RE = /raise exception\s+'((?:[^']|'')*)'([\s\S]{0,300}?)errcode\s*=\s*'([A-Z0-9]+)'/g;
const WRITTEN_RELATIONS = ["clara.accounting_work", "clara.agent_tasks"];

/** Every clara function `admit_journal_work` / `retry_accounting_work` can reach, three call
 *  hops deep, plus the trigger functions on the relations they write. */
async function reachableCodes() {
  const graph = await rig.rootQuery(
    `with recursive seed(fn) as (
       select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = any($1::text[])
     ),
     walk(fn, depth) as (
       select fn, 0 from seed
       union
       select p2.oid, w.depth + 1
         from walk w
         join pg_proc p1 on p1.oid = w.fn
         join pg_proc p2 on p2.oid <> p1.oid
         join pg_namespace n2 on n2.oid = p2.pronamespace and n2.nspname = 'clara'
        where w.depth < 3 and p1.prosrc ~ ('clara\\.' || p2.proname || '\\s*\\(')
     )
     select distinct p.oid::regprocedure::text as fn, p.prosrc
       from walk w join pg_proc p on p.oid = w.fn`,
    [["admit_journal_work", "retry_accounting_work"]],
  );
  const triggers = await rig.rootQuery(
    `select distinct p.oid::regprocedure::text as fn, p.prosrc
       from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where not t.tgisinternal and t.tgrelid::regclass::text = any($1::text[])`,
    [WRITTEN_RELATIONS],
  );
  const found = new Map();
  for (const row of [...graph.rows, ...triggers.rows]) {
    for (const m of row.prosrc.matchAll(RAISE_RE)) {
      if (!found.has(m[3])) found.set(m[3], []);
      found.get(m[3]).push(`${row.fn}: ${m[1]}`);
    }
  }
  return found;
}

test("623.db.census: every code the Work doors raise has an HTTP status — no bare 500", { skip: SKIP }, async () => {
  const found = await reachableCodes();
  assert.ok(found.size >= 4, `the census found only ${found.size} codes — the instrument is not reading prosrc`);
  const unmapped = [...found.keys()].filter((code) => workErrorStatus(code, null) === null);
  assert.deepEqual(
    unmapped,
    [],
    `these codes reach POST /api/work/journal and fall through to a bare 500: ${unmapped
      .map((c) => `${c} (${found.get(c)[0]})`)
      .join("; ")}`,
  );
});

test("623.db.census: the map claims nothing these doors cannot raise", { skip: SKIP }, async () => {
  const found = await reachableCodes();
  // 23505 is PostgreSQL's own unique_violation, raised by an INDEX rather than a RAISE, so it
  // can never appear in a prosrc census — exempted here by name, not by a wildcard.
  const claimed = WORK_MAPPED_CODES.filter((c) => c !== "23505");
  const unreachable = claimed.filter((c) => !found.has(c));
  assert.deepEqual(
    unreachable,
    [],
    `mapped but not reachable — either the mapping is dead or the census lost sight of it: ${unreachable.join(", ")}`,
  );
  assert.equal(workErrorStatus("CLR99", null), null, "an unknown code falls through, never to a default status");
  assert.equal(workErrorStatus(undefined, null), null);
});

test("623.db.census: the two CLR10s the contract distinguishes get DIFFERENT statuses", { skip: SKIP }, async () => {
  // The whole reason this map is keyed on the PAIR: a malformed basis is the caller's mistake
  // (400, with the offending field named) and an intent-key payload conflict is a genuine
  // conflict with a Work that already exists (409, with a link to it).
  assert.equal(workErrorStatus("CLR10", "invalid_basis"), 400);
  assert.equal(workErrorStatus("CLR10", "intent_payload_conflict"), 409);
  // And the retry door's own refusal, which the route turns into {error:"not_retryable", status}.
  assert.equal(workErrorStatus("CLR13", "not_retryable"), 409);
  assert.equal(workErrorStatus("CLR11", "work_not_found"), 404);
  assert.equal(workErrorStatus("CLR04", "insufficient_role"), 403);
});
