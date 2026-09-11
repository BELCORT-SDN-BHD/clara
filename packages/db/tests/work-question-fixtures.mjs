// #629 — SHARED WORK QUESTIONS: the battery's gate, verb wrappers and world helpers (NOT a test
// file: the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// BUILT ON #623's OWN FIXTURES. `work-journal-fixtures.mjs` already owns the Work world, the
// chart, the basis builders and `admit_journal_work` / `claim_work_run` / `settle_work_run` /
// `cancel_agent_task`; a question is opened ON one of those Works, so this module extends that
// one rather than standing up a second world with a second chart.
//
// THE FRONTIER GATE keys on the migration's STABLE STEM, never its number — numbers are claimed at
// MERGE (standing law), and a `like '0180_%'` gate would stop gating the moment the file is
// renumbered. `db-slice-frontiers` runs this package against databases pinned at EARLIER
// frontiers, where an unconditional assertion about a not-yet-born object reds the leg while
// saying nothing about the thing under test.

import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, buildWorkWorld, endPool,
  assertRaises, assertPair, detailOf, noteLane, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, settleWorkRun, cancelAgentTask, basis, WCHART, MODEL,
  workRow, taskRow, freshWorkClient, CLR,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, buildWorkWorld, endPool,
  assertRaises, assertPair, detailOf, noteLane, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, settleWorkRun, cancelAgentTask, basis, WCHART, MODEL,
  workRow, taskRow, freshWorkClient, CLR,
};

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #629 migration's STABLE STEM. */
export const WORK_QUESTION_STEM = "work_questions$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function workQuestionLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [WORK_QUESTION_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateQuestion(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateQuestion(t) {
  if (await workQuestionLaneReady()) return false;
  markSkip();
  t.skip(`#629 work-question lane absent (no ${WORK_QUESTION_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary. Every assertion in this battery uses THESE strings.
// ===========================================================================================

/** The typed `detail.reason` tokens the contract obliges each verb to raise. */
export const QREASON = {
  invalidHookToken: "invalid_hook_token",
  invalidFields: "invalid_fields",
  taskNotFound: "task_not_found",
  wrongTaskKind: "wrong_task_kind",
  workUnbound: "work_unbound",
  hookTokenBound: "hook_token_bound",
  questionAlreadyPending: "question_already_pending",
  taskNotRunning: "task_not_running",
  invalidOpKey: "invalid_op_key",
  invalidQuestionVersion: "invalid_question_version",
  opKeyConflict: "op_key_conflict",
  operationInFlight: "operation_in_flight",
  questionNotFound: "question_not_found",
  clientInactive: "client_inactive",
  alreadyAnswered: "already_answered",
  expired: "expired",
  cancelled: "cancelled",
  staleQuestion: "stale_question",
  basisChanged: "basis_changed",
  stateChanged: "state_changed",
  invalidAnswer: "invalid_answer",
  workQuestionImmutable: "work_question_immutable",
};

/** The two-field question this battery asks most often: a posting date and an amount in cents —
 *  the exact pair #629's scripted model asks for. */
export function twoFields() {
  return [
    { key: "posting_date", label: "Which date should this be posted on?", kind: "date", required: true },
    { key: "amount_cents", label: "How much, in cents?", kind: "money", required: true, unit: "MYR cents" },
  ];
}

/** The single-field question — the Field (not Questionnaire) shape. */
export function oneField(overrides = {}) {
  return [{ key: "memo", label: "What should the memo say?", kind: "text", required: true, ...overrides }];
}

export const QUESTION_TEXT = "Which date should this rent payment be posted on, and for how much?";

/** The `question` jsonb the runtime writes — the SAME shape chatTurn_v10's `openInterruptionStep`
 *  writes (`{type, question, context, framing}`), because the web's one reader parses that shape. */
export function questionPayload(text = QUESTION_TEXT, context = null) {
  return { type: "clarify", question: text, context, framing: "work_question" };
}

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

const RUNTIME = ROLES.runtime;

export async function openWorkQuestion({
  task, hookToken = null, question = null, fields = null, reason = null, sourceRef = null,
}) {
  const r = await roleQuery(RUNTIME, namedCall("open_work_question", [
    { name: "p_task", cast: "uuid" }, { name: "p_hook_token", cast: "text" },
    { name: "p_question", cast: "jsonb" }, { name: "p_fields", cast: "jsonb" },
    { name: "p_reason", cast: "text" }, { name: "p_source_ref", cast: "jsonb" },
  ]), [
    task,
    hookToken ?? `hook-${randomUUID()}`,
    JSON.stringify(question ?? questionPayload()),
    JSON.stringify(fields ?? twoFields()),
    reason,
    sourceRef === null ? null : JSON.stringify(sourceRef),
  ]);
  return r.rows[0].result;
}

export async function answerWorkQuestion(sub, { question, version, answer, opKey = null }) {
  const r = await humanQuery(sub, namedCall("answer_work_question", [
    { name: "p_question", cast: "uuid" }, { name: "p_question_version", cast: "int" },
    { name: "p_answer", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
  ]), [question, version, JSON.stringify(answer), opKey ?? opk("w629-answer")]);
  return r.rows[0].result;
}

export async function getWorkQuestion(sub, question) {
  const r = await humanQuery(sub,
    "select clara.get_work_question(p_question => $1::uuid) as result", [question]);
  return r.rows[0].result;
}

export async function getWorkPendingQuestion(sub, work) {
  const r = await humanQuery(sub,
    "select clara.get_work_pending_question(p_work => $1::uuid) as result", [work]);
  return r.rows[0].result;
}

export async function expireDueInterruptions({ limit = 50, firm = null } = {}) {
  const r = await roleQuery(RUNTIME, namedCall("expire_due_interruptions", [
    { name: "p_limit", cast: "int" }, { name: "p_firm", cast: "uuid" },
  ]), [limit, firm]);
  return r.rows[0].result;
}

/** The firm inbox, read as a HUMAN (the only role that holds it). */
export async function listReviewQueue(sub, { scope = {}, cursor = null, limit = 200 } = {}) {
  const r = await humanQuery(sub, namedCall("list_review_queue", [
    { name: "p_scope", cast: "jsonb" }, { name: "p_cursor", cast: "jsonb" },
    { name: "p_limit", cast: "int" },
  ]), [JSON.stringify(scope), cursor === null ? null : JSON.stringify(cursor), limit]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · Readers.
// ===========================================================================================

export async function interruptionRow(id) {
  const r = await rootQuery("select * from clara.agent_interruptions where id=$1", [id]);
  return r.rows[0] ?? null;
}

export async function interruptionsForWork(work) {
  const r = await rootQuery(
    "select id, question_version, status, delivery_state, delivery_attempts, answered_by,"
    + " answered_role, answer, answer_key, hook_token, task_id"
    + " from clara.agent_interruptions where work_id=$1 order by question_version", [work]);
  return r.rows;
}

/** The audit rows one verb wrote about one question, newest first. */
export async function auditForQuestion(fn, question) {
  const r = await rootQuery(
    "select fn, args from clara.audit_log where fn=$1 and args->>'question'=$2 order by at desc, id desc",
    [fn, question]);
  return r.rows;
}

// ===========================================================================================
// 5 · The world helper every answer cell starts from.
// ===========================================================================================

/**
 * A Work that is PARKED on one question: admitted, claimed (so its task is `running`), then
 * `open_work_question`. Returns everything a cell needs to answer it.
 *
 * Deliberately built through the REAL verbs rather than by planting rows: the mirror trigger
 * (0178) is what moves the Work to `awaiting_input`, and a planted row would prove nothing about
 * whether the estate actually parks.
 */
export async function parkedWork({
  client, author, fields = null, question = null, reason = "The admitted basis names no amount.",
  sourceRef = null, basis: b = null, hookToken = null,
}) {
  const admitted = await admitJournalWork({ client, author, basis: b });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w629-run") });
  const opened = await openWorkQuestion({
    task: admitted.task_id, hookToken, question, fields, reason, sourceRef,
  });
  return {
    workId: admitted.work_id,
    taskId: admitted.task_id,
    logicalOpId: admitted.logical_op_id,
    questionId: opened.question_id,
    version: opened.question_version,
    expiresAt: opened.expires_at,
  };
}

/** The answer that satisfies `twoFields()`. Exact minor units only — never a float anywhere. */
export function twoFieldAnswer({ postingDate = "2026-09-01", cents = 120000, note = null } = {}) {
  const a = { posting_date: postingDate, amount_cents: cents };
  if (note !== null) a.note = note;
  return a;
}

// ===========================================================================================
// 6 · TWO OPEN TASKS ON ONE WORK — the shape `agent_tasks(work_id)` permits and no verb produces.
//
// `clara.agent_tasks.work_id` is deliberately NON-UNIQUE (0178:519): a human's Retry makes a NEW
// task for the SAME Work, which is the whole recovery story. Nothing in the estate produces two
// CONCURRENTLY-RUNNING tasks on one Work today — `clara.retry_accounting_work` refuses until the
// Work is terminal — so a cell that needs that shape has to build it, and building it by CLONING a
// real admitted task (every column but the id, the timestamps and the run binding) is the honest
// way: it asserts nothing about how the row got there, only about what the doors do once it has.
// ===========================================================================================

/**
 * Clone one accounting_work task onto the same Work and CLAIM it, so the Work has a second
 * `running` task.
 *
 * THE CLONE IS INSERTED `queued`, NEVER `running`: 0178's own insert guard refuses an
 * accounting_work row that is not queued ("accounting_work task requires prevalidated firm/client,
 * no session/intent, queued status, a model snapshot and a firm/client-congruent work id" —
 * MEASURED, not assumed). The queued->running transition is then made by the REAL verb
 * `clara.claim_work_run`, so the second task reaches `running` exactly the way the first did,
 * status mirror and all.
 */
export async function cloneRunningTask(taskId) {
  const cols = await rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='agent_tasks'
        and is_generated='NEVER' and identity_generation is null
        and column_name not in ('id','status','created_at','updated_at','workflow_run_id')
      order by ordinal_position`);
  const list = cols.rows.map((r) => `"${r.column_name}"`).join(", ");
  const r = await rootQuery(
    `insert into clara.agent_tasks (${list}, status) select ${list}, 'queued'
       from clara.agent_tasks where id = $1 returning id`, [taskId]);
  const cloned = r.rows[0].id;
  await claimWorkRun({ task: cloned, runId: opk("w629-clone") });
  return cloned;
}

/**
 * THE FORCED SCHEDULE (X7's own law: PROVE the block before releasing it).
 *
 * Session A opens a question on `taskA` and HOLDS its transaction; session B fires the same verb on
 * `taskB` — a different task of the SAME Work — and must BLOCK, proven through `pg_blocking_pids`,
 * until A commits. A schedule where B never blocked proves nothing about what the loser gets.
 */
export async function raceTwoOpens({ taskA, taskB }) {
  const { getPool } = await import("./rig-helpers.mjs");
  const { waitBlockedBy } = await import("./rig-runtime-race.mjs");
  const call = "select clara.open_work_question($1::uuid, $2::text, $3::jsonb, $4::jsonb, $5::text, $6::jsonb) as result";
  const args = (task) => [task, `hook-${randomUUID()}`, JSON.stringify(questionPayload()),
    JSON.stringify(twoFields()), "raced open", null];
  const outcome = (e) => ({ ok: false, code: e.code, reason: detailOf(e).reason ?? null, message: e.message });
  const pool = getPool();
  const c1 = await pool.connect();
  const c2 = await pool.connect();
  const out = { a: null, b: null, provedBlocked: false };
  try {
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("begin");
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    try { out.a = { ok: true, result: (await c1.query(call, args(taskA))).rows[0].result }; }
    catch (e) { out.a = outcome(e); }

    await c2.query(`set role ${ROLES.runtime}`);
    await c2.query("begin");
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    const fired = c2.query(call, args(taskB))
      .then((r) => { out.b = { ok: true, result: r.rows[0].result }; })
      .catch((e) => { out.b = outcome(e); });

    out.provedBlocked = await waitBlockedBy(pid2, pid1);
    await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
    await fired;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}
