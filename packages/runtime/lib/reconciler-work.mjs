// Accounting-Work reconcile edges (#623). Split out of reconciler.mjs for the repo's own
// module-size budget, exactly as reconciler-documents.mjs / reconciler-wake.mjs are; the sweep in
// reconciler.mjs wires it as one contained belt.
//
// TWO SECTIONS, mirroring reconcileTasks'/reconcileAutoDraftTasks' own shape:
//
//   §A  QUEUED-WITHOUT-A-RUN past a grace window -> re-enqueue through the REGISTRY. The
//       workflow's own claim step CAS-binds itself, so a duplicate start self-aborts and this
//       belt never needs to bind anything.
//   §B  RUNNING/PARKED-WITH-A-RUN whose engine run is TERMINAL -> settle from engine truth
//       through `clara.settle_work_run`, never `settle_chat_turn` (which raises CLR10 for any
//       kind other than `chat_turn` — the 2026-07-31 Section-I zombie's own lesson) and never
//       `settle_autodraft_task`.
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
 * The legal terminal settle for an OPEN accounting_work task given the engine's terminal status.
 * PURE, and deliberately shaped like `terminalForOpenTask`:
 *
 *   running        → completed is NOT reachable here (a completed run settles its own Work), so
 *                    a terminal engine run on a still-running task means the run died after
 *                    claiming and before settling → `failed`.
 *   awaiting_input → expired | cancelled ONLY. A parked Work whose engine run is gone cannot be
 *                    resumed: its hook is unreachable, so the honest settle is `expired`
 *                    (recoverable — a human's Retry makes a NEW run for the SAME Work).
 *
 * @returns {{outcome:'failed'|'expired'|'cancelled', errorCode:string|null, error:object}|null}
 */
export function terminalForWork(taskStatus, engine) {
  if (taskStatus === "running") {
    if (engine === "lost") {
      return { outcome: "failed", errorCode: "internal", error: reason("engine_lost", "The run executing this Work is gone. Nothing was posted.") };
    }
    if (engine === "failed") {
      return { outcome: "failed", errorCode: "internal", error: reason("run_failed", "The run executing this Work failed. Nothing was posted.") };
    }
    if (engine === "completed") {
      // The run finished without settling — it produced no receipt, so the Work produced no
      // effect. §6: success is decided by the complete business result, never by a stream ending.
      return { outcome: "failed", errorCode: "internal", error: reason("no_effect", "The run finished without recording an entry. Nothing was posted.") };
    }
    return null; // 'cancelled' on a plain running task is anomalous — the cancel path owns it
  }
  if (taskStatus === "awaiting_input") {
    if (engine === "lost" || engine === "failed") {
      return { outcome: "expired", errorCode: null, error: reason("question_unreachable", "The question this Work was waiting on can no longer be answered. Nothing was posted.") };
    }
    if (engine === "cancelled") {
      return { outcome: "cancelled", errorCode: null, error: reason("cancelled", "This Work was cancelled while waiting for an answer. Nothing was posted.") };
    }
    return null; // 'completed' while parked is impossible (a finished run settles its Work)
  }
  return null;
}

function reason(code, message) {
  return { code, reason: code, message, recoverable: true };
}

/** Settle an accounting Work terminally (idempotent by task — an already-terminal task returns
 *  `{"replayed":true}` rather than raising). */
export async function settleWorkTerminal(client, taskId, outcome, errorCode, error) {
  await client.query("select clara.settle_work_run($1::uuid, $2::text, $3::text, $4::jsonb, null::jsonb) as r", [
    taskId,
    outcome,
    errorCode,
    error == null ? null : JSON.stringify(error),
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
    const settle = terminalForWork(t.status, engine);
    if (!settle) {
      log(`[reconcile] no legal terminal for accounting-work task=${t.id} status=${t.status} engine=${engine} — skipping`);
      continue;
    }
    try {
      await settleWorkTerminal(client, t.id, settle.outcome, settle.errorCode, settle.error);
      if (settle.outcome === "failed") out.workSettledFailed += 1;
      else if (settle.outcome === "expired") out.workSettledExpired += 1;
      else out.workSettledCancelled += 1;
    } catch (err) {
      out.workSettleFailed += 1;
      log(`[reconcile] accounting-work settle failed task=${t.id} status=${t.status} engine=${engine}: ${err?.message ?? err}`);
    }
  }

  return out;
}
