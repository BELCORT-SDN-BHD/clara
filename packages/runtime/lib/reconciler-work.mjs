// Accounting-Work reconcile edges (#623). Split out of reconciler.mjs for the repo's own
// module-size budget, exactly as reconciler-documents.mjs / reconciler-wake.mjs are; the sweep in
// reconciler.mjs wires it as one contained belt.
//
// TWO SECTIONS, mirroring reconcileTasks'/reconcileAutoDraftTasks' own shape:
//
//   §A  QUEUED-WITHOUT-A-RUN past a grace window -> re-enqueue through the REGISTRY. The
//       workflow's own claim step CAS-binds itself, so a duplicate start self-aborts and this
//       belt never needs to bind anything.
//   §B  RUNNING/PARKED-WITH-A-RUN whose engine run is TERMINAL -> settle from THE BOOKS FIRST and
//       engine truth second, through `clara.settle_work_run`, never `settle_chat_turn` (which
//       raises CLR10 for any kind other than `chat_turn` — the 2026-07-31 Section-I zombie's own
//       lesson) and never `settle_autodraft_task`. "The books first" is #623's reviewed finding
//       R1: a Work that already recorded an effect settles `completed` with that effect no matter
//       what the engine says, because a dead run cannot un-post a journal entry.
//
// THE THIRD EDGE — a cancel_requested Work — LIVES IN reconciler.mjs's section B, beside the
// autodraft and wake arms, because that section is where the ONE cancel query already dispatches
// by kind. Adding a second cancel query here would mean two belts racing for the same rows.
//
// §A's GRACE IS ITS OWN, AND SHORTER THAN THE CHAT LANE'S, FOR A MEASURED REASON. A chat turn is
// enqueued by the route microseconds after its commit, so a 15-second grace is pure crash
// insurance there. An accounting Work has a SECOND admission path that cannot enqueue at all:
// chatTurn_v18's `start_journal_work` runs inside a FROZEN file, and a frozen file may not import
// workflows/registry.ts (it would pull the registry into the frozen import-closure and hash-lock
// a file that must move on every repoint), so freeze-lint's enqueue-provenance rule leaves that
// path with no legal way to call `start()`. For a chat-originated Work this belt is therefore the
// PRIMARY dispatcher, not a safety net, and its latency is a human-visible property: grace +
// (at most) one leader poll interval. With the defaults that is ~2s + ~2s ≈ 4s worst case.
// Both are env-tunable, and the route-originated path still enqueues immediately.

const WORK_GRACE_REENQUEUE = process.env.CLARA_WORK_REENQUEUE_GRACE || "2 seconds";

/** WDK "run not found" — the engine forgot a run we still have an id for (reconciler.mjs's own
 *  predicate, kept local so this module has no import cycle back into it). */
function isRunNotFound(err) {
  const m = String(err?.message ?? err ?? "");
  return /not\s*found/i.test(m) || err?.code === "RUN_NOT_FOUND";
}

/**
 * THE BOOKS COME FIRST. Reviewed finding (#623 R1): every arm below used to translate the
 * ENGINE's opinion of what happened straight onto the Work, without ever asking whether that Work
 * had already recorded an effect. A run that had committed `wake_record_journal_entry` — an
 * approved journal entry and a committed `clara.operation_receipts` row, real money in a real
 * client's ledger — and then died before checkpointing settled `failed` with "Nothing was posted."
 * written over a posted entry. `clara.settle_work_run` now overrides that from the receipt side
 * (0178's `clara._work_committed_receipt`), and BOTH belts stay: the database refuses to record a
 * false outcome, and the runtime does not ask for one in the first place. The witness the runtime
 * can see is `clara.accounting_work.result` — `clara_runtime` holds SELECT on that relation and
 * deliberately holds NOTHING on `clara.operation_receipts`, so the result object is the whole of
 * this lane's evidence and the database owns the rest.
 *
 * The legal terminal settle for an OPEN accounting_work task given the engine's terminal status.
 * PURE, and deliberately shaped like `terminalForOpenTask`:
 *
 *   any status     → a Work that ALREADY HOLDS a committed effect is `completed`, whatever the
 *                    engine says. A dead run cannot un-post an entry.
 *   running        → completed is NOT reachable here (a completed run settles its own Work), so
 *                    a terminal engine run on a still-running task means the run died after
 *                    claiming and before settling → `failed`.
 *   awaiting_input → expired | cancelled ONLY. A parked Work whose engine run is gone cannot be
 *                    resumed: its hook is unreachable, so the honest settle is `expired`
 *                    (recoverable — a human's Retry makes a NEW run for the SAME Work).
 *
 * @param {string} taskStatus
 * @param {string} engine
 * @param {object|null} [committed]  the Work's own committed result, from `committedWorkResult`
 * @returns {{outcome:'completed'|'failed'|'expired'|'cancelled', errorCode:string|null,
 *            error:object|null, result:object|null}|null}
 */
export function terminalForWork(taskStatus, engine, committed = null) {
  if (taskStatus !== "running" && taskStatus !== "awaiting_input") return null;
  const effect = committedWorkResult(committed);
  if (effect !== null) {
    // THE ONE ARM THAT OUTRANKS THE ENGINE. The entry exists; the only honest terminal is the one
    // the ledger already wrote, and the result carries it so the Work detail can show the entry.
    return { outcome: "completed", errorCode: null, error: null, result: effect };
  }
  if (taskStatus === "running") {
    if (engine === "lost") {
      return settle("failed", "internal", reason("engine_lost", "The run executing this Work is gone. Nothing was posted."));
    }
    if (engine === "failed") {
      return settle("failed", "internal", reason("run_failed", "The run executing this Work failed. Nothing was posted."));
    }
    if (engine === "completed") {
      // The run finished without settling AND the Work holds no committed effect — so the Work
      // produced nothing. §6: success is decided by the complete business result, never by a
      // stream ending. The receipt arm above is what keeps this from ever saying so falsely.
      return settle("failed", "internal", reason("no_effect", "The run finished without recording an entry. Nothing was posted."));
    }
    return null; // 'cancelled' on a plain running task is anomalous — the cancel path owns it
  }
  if (engine === "lost" || engine === "failed") {
    return settle("expired", null, reason("question_unreachable", "The question this Work was waiting on can no longer be answered. Nothing was posted."));
  }
  if (engine === "cancelled") {
    return settle("cancelled", null, reason("cancelled", "This Work was cancelled while waiting for an answer. Nothing was posted."));
  }
  return null; // 'completed' while parked is impossible (a finished run settles its Work)
}

function reason(code, message) {
  return { code, reason: code, message, recoverable: true };
}

function settle(outcome, errorCode, error) {
  return { outcome, errorCode, error, result: null };
}

/**
 * The Work's OWN committed effect, or null. `clara.accounting_work.result` is the only witness
 * `clara_runtime` can read (0178 grants it SELECT there and nothing at all on
 * `clara.operation_receipts`), and it counts as evidence ONLY when it names an entry: a result
 * object carrying budget numbers and no `entry_id` describes a run, not a posting.
 *
 * PURE, so the belts that consult it and the cells that pin it drive the same predicate.
 * @param {unknown} result  the `result` jsonb off a `clara.accounting_work` row
 * @returns {Record<string, unknown>|null}
 */
export function committedWorkResult(result) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return null;
  const entryId = /** @type {{entry_id?: unknown}} */ (result).entry_id;
  if (typeof entryId !== "string" || entryId.trim() === "") return null;
  return /** @type {Record<string, unknown>} */ (result);
}

/**
 * Read one accounting_work task's Work result and reduce it through `committedWorkResult`.
 *
 * ISSUED ONLY FOR A TASK ALREADY KNOWN TO BE `kind='accounting_work'`, and that is a DEPLOY-ORDER
 * decision rather than a stylistic one. `clara.accounting_work` does not exist before migration
 * 0178, and a statement naming a missing relation fails at PARSE time — so folding this read into
 * the sweep's own SELECT (or into either cancel path's) would have made a runtime image that ran
 * ahead of 0178 fail to reconcile or cancel ANY kind, chat turns included. workflows/registry.ts
 * states the standard this package holds itself to for that ordering: a wrong order must leave
 * Clara refusing the thing it offered to do, never breaking the things it already did. No
 * `accounting_work` row can exist before 0178 widens the kind CHECK, so a query reached only from
 * such a row is exactly as inert as the registry key itself.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string} taskId
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function workResultForTask(client, taskId) {
  const r = await client.query(
    `select w.result
       from clara.agent_tasks t
       join clara.accounting_work w on w.id = t.work_id
      where t.id = $1 and t.kind = 'accounting_work'`,
    [taskId],
  );
  return committedWorkResult(r.rows[0]?.result ?? null);
}

/**
 * The terminal settle a CANCEL of an accounting Work deserves, given what the Work already holds.
 * The same receipt-first law as `terminalForWork`, spelled once so the two cancel call sites
 * (reconciler.mjs's sweep and control.mjs's listener) can never disagree: ARCHITECTURE §6 says a
 * cancel does not reverse a posted entry ("取消不冲销已入账结果"), so a Work with a committed
 * effect settles `completed` and a Work without one settles `cancelled`.
 * PURE.
 * @param {unknown} result  the `result` jsonb off the Work row (may be null for a non-Work task)
 */
export function cancelSettleForWork(result) {
  const effect = committedWorkResult(result);
  if (effect !== null) return { outcome: "completed", errorCode: null, error: null, result: effect };
  return {
    outcome: "cancelled",
    errorCode: null,
    error: {
      code: "cancelled",
      reason: "cancelled",
      message: "This Work was cancelled before an entry was recorded. Nothing was posted.",
      recoverable: true,
    },
    result: null,
  };
}

/** Settle an accounting Work terminally (idempotent by task — an already-terminal task returns
 *  `{"replayed":true}` rather than raising). `result` rides to `p_result` so a receipt-aware
 *  `completed` carries the entry it is completed BY, rather than an empty success. */
export async function settleWorkTerminal(client, taskId, outcome, errorCode, error, result = null) {
  await client.query("select clara.settle_work_run($1::uuid, $2::text, $3::text, $4::jsonb, $5::jsonb) as r", [
    taskId,
    outcome,
    errorCode,
    error == null ? null : JSON.stringify(error),
    result == null ? null : JSON.stringify(result),
  ]);
}

/**
 * Converge accounting_work task rows with engine truth. `deps.enqueueClaraWork` is REQUIRED to
 * run (absent -> a clean no-op, so a caller that never wired it is unaffected — the
 * reconcileAutoDraftTasks precedent). Pre-0178 the kind CHECK excludes 'accounting_work', so no
 * such rows exist and every query below returns empty without touching a table 0178 introduces.
 *
 * COUNTERS ARE DISTINCT PER CATEGORY (C34.1). A sweep that expired one parked Work and lost
 * another to a dead run must not report "2 settled": the two are different facts about the
 * estate, and one number that could mean either is the aggregation defect that obligation names.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{enqueueClaraWork?:Function, getRun?:Function, onlyFirm?:string|null,
 *          graceInterval?:string, log?:Function}} deps
 */
export async function reconcileAccountingWorkTasks(client, deps) {
  const { enqueueClaraWork, getRun, onlyFirm = null, graceInterval = WORK_GRACE_REENQUEUE, log = () => {} } = deps;
  const out = {
    workReenqueued: 0,
    // The receipt-aware arm gets its OWN counter for the same C34.1 reason the other three have
    // one: "the run died but the entry is on the books" and "the run died and nothing was posted"
    // are different facts about the estate, and one number that could mean either hides the first.
    workSettledCompleted: 0,
    workSettledFailed: 0,
    workSettledExpired: 0,
    workSettledCancelled: 0,
    workSettleFailed: 0,
  };
  if (typeof enqueueClaraWork !== "function") return out; // not wired — no-op

  // §A — admitted-but-unstarted past grace -> re-enqueue. Isolated PER TASK: one un-enqueueable
  // row must never block the rest (reconcileTasks §A's own isolation).
  const stuck = await client.query(
    `select id from clara.agent_tasks
      where kind = 'accounting_work' and status = 'queued' and workflow_run_id is null
        and created_at < now() - ($1)::interval
        and ($2::uuid is null or firm_id = $2)
      order by created_at limit 20`,
    [graceInterval, onlyFirm],
  );
  for (const t of stuck.rows) {
    try {
      await enqueueClaraWork(t.id);
      out.workReenqueued += 1;
    } catch (err) {
      log(`[reconcile] accounting-work re-enqueue failed task=${t.id}: ${err?.message ?? err}`);
    }
  }

  // §B — open + bound with a terminal engine run -> settle from engine truth.
  if (typeof getRun !== "function") return out;
  const open = await client.query(
    `select id, status, workflow_run_id from clara.agent_tasks
      where kind = 'accounting_work' and workflow_run_id is not null
        and status in ('running','awaiting_input')
        and ($1::uuid is null or firm_id = $1)
      order by created_at limit 50`,
    [onlyFirm],
  );
  for (const t of open.rows) {
    let engine; // 'completed' | 'failed' | 'cancelled' | 'lost' | null(in-flight)
    try {
      const es = await getRun(t.workflow_run_id).status;
      engine = es === "completed" || es === "failed" || es === "cancelled" ? es : null;
    } catch (err) {
      if (isRunNotFound(err)) engine = "lost";
      else {
        log(`[reconcile] accounting-work status probe failed task=${t.id}: ${err?.message ?? err}`);
        continue;
      }
    }
    if (!engine) continue; // still in flight
    // ASK THE BOOKS BEFORE NAMING A TERMINAL. A read failure here does NOT fall through to the
    // engine's opinion: not knowing whether an entry was posted is precisely the state in which
    // writing "Nothing was posted." would be the lie R1 names. Skip the row; the next sweep asks
    // again, and the row is still open.
    let committed;
    try {
      committed = await workResultForTask(client, t.id);
    } catch (err) {
      log(`[reconcile] accounting-work result read failed task=${t.id}: ${err?.message ?? err}`);
      continue;
    }
    const settle = terminalForWork(t.status, engine, committed);
    if (!settle) {
      log(`[reconcile] no legal terminal for accounting-work task=${t.id} status=${t.status} engine=${engine} — skipping`);
      continue;
    }
    try {
      await settleWorkTerminal(client, t.id, settle.outcome, settle.errorCode, settle.error, settle.result);
      if (settle.outcome === "completed") out.workSettledCompleted += 1;
      else if (settle.outcome === "failed") out.workSettledFailed += 1;
      else if (settle.outcome === "expired") out.workSettledExpired += 1;
      else out.workSettledCancelled += 1;
    } catch (err) {
      out.workSettleFailed += 1;
      log(`[reconcile] accounting-work settle failed task=${t.id} status=${t.status} engine=${engine}: ${err?.message ?? err}`);
    }
  }

  return out;
}
