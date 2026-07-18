// The settle-reconciler + sweepers (Slice 4, contract §4.5–4.7). The crash-recovery
// safety net: it makes the durable truth (task rows) and the engine truth (WDK run
// status) converge, and it never leaves a task permanently stuck. Leader-guarded —
// the caller (scripts/serve.mjs) runs runReconcilerSweep only while it holds the
// relay leader lock, so exactly one process sweeps at a time.
//
// Because start() carries NO idempotency key (verified against workflow@4.6.0), the
// enqueue dedupe is RUN-LISTING (S4-V1 fallback): the route binds workflow_run_id
// onto the task immediately after start(); the reconciler only re-enqueues a task
// that is still 'queued' with a NULL run beyond a grace window, and the bind is a
// conditional UPDATE so a race with the route no-ops. Duplicate spend is bounded
// (settle_chat_turn is idempotent by task — the second run's settle is a
// stored-outcome no-op), which is the contract's accepted honesty envelope (§0.4).
//
// Engine status vocabulary (workflow@4.6.0 / @workflow/world-postgres@4.3.0):
// pending | running | completed | failed | cancelled. A PARKED run reports
// 'running' (S4-P1a) — so `awaiting_input` on the TASK is the only parked-visibility
// source; the reconciler never treats engine 'running' as "finished".

const GRACE_REENQUEUE = process.env.CLARA_RECONCILE_GRACE || "15 seconds";
const ORPHAN_WINDOW = process.env.CLARA_RECONCILE_ORPHAN_WINDOW || "30 minutes";
const TRACE_RETENTION_DAYS = Number(process.env.CLARA_TRACE_RETENTION_DAYS || 90);
const PRUNE_BATCH = Number(process.env.CLARA_TRACE_PRUNE_BATCH || 1000);
const PRUNE_MAX_BATCHES = Number(process.env.CLARA_TRACE_PRUNE_MAX_BATCHES || 20);

/** True iff the error is the engine's "run id unknown" signal. */
export function isRunNotFound(err) {
  return err != null && (/RunNotFound/i.test(String(err.name || "")) || /run .*not found/i.test(String(err.message || "")));
}

/**
 * The legal terminal settle for an open task given the engine's terminal status,
 * respecting the AB11 transition matrix:
 *   running        → completed | failed
 *   awaiting_input → expired | cancelled  (NEVER completed/failed)
 * `engine` is 'completed' | 'failed' | 'cancelled' | 'lost'. Returns null when no
 * legal settle applies (anomalous pair — leave for the next sweep / the cancel path).
 * @returns {{outcome:'completed'|'failed'|'cancelled'|'expired', errorCode:string|null}|null}
 */
export function terminalFor(taskStatus, engine) {
  if (taskStatus === "running") {
    if (engine === "completed") return { outcome: "completed", errorCode: null };
    if (engine === "failed") return { outcome: "failed", errorCode: "internal" }; // ran + failed = internal
    if (engine === "lost") return { outcome: "failed", errorCode: "engine_lost" }; // run absent = engine_lost
    return null; // engine 'cancelled' on a plain 'running' task is anomalous (cancel sets cancel_requested first)
  }
  if (taskStatus === "awaiting_input") {
    // A parked task can only terminal to expired/cancelled. A lost/failed/cancelled
    // engine run for a parked clarify settles 'cancelled' (the clarify can't resume).
    if (engine === "lost") return { outcome: "cancelled", errorCode: "engine_lost" };
    if (engine === "failed") return { outcome: "cancelled", errorCode: "internal" };
    if (engine === "cancelled") return { outcome: "cancelled", errorCode: null };
    return null; // engine 'completed' while parked is impossible (a finished run settles the task)
  }
  return null;
}

// ---------------------------------------------------------------------------
// Heartbeats — one row per component, upserted each beat (§3.8). /ready reads
// these to decide world/control liveness.
// ---------------------------------------------------------------------------

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function heartbeat(client, component) {
  await client.query(
    `insert into clara.runtime_heartbeats (component, beat_at)
       values ($1, now())
     on conflict (component) do update set beat_at = now()`,
    [component],
  );
}

// ---------------------------------------------------------------------------
// Clarify expiry — a single-statement conditional transition; the control
// listener's lease pipe then delivers the 'expired' resume (§3.3).
// ---------------------------------------------------------------------------

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function expireClarifies(client, opts = {}) {
  const { onlyFirm = null } = opts;
  const r = await client.query(
    `update clara.agent_interruptions
        set status = 'expired'
      where status = 'pending' and expires_at < clock_timestamp()
        and ($1::uuid is null or firm_id = $1)`,
    [onlyFirm],
  );
  if (r.rowCount > 0) {
    // Nudge the control listener so the expired rows are delivered promptly (the
    // listener also polls, so a dropped NOTIFY only affects latency).
    await client.query("select pg_notify('clara_runtime_ctl','')");
  }
  return { expired: r.rowCount };
}

// ---------------------------------------------------------------------------
// Trace prune — audited, keyed on started_at, bounded batches (§3.7 / §0.8).
// ---------------------------------------------------------------------------

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function pruneTraces(client, opts = {}) {
  const days = opts.retentionDays ?? TRACE_RETENTION_DAYS;
  const batch = opts.batchSize ?? PRUNE_BATCH;
  const maxBatches = opts.maxBatches ?? PRUNE_MAX_BATCHES;
  let pruned = 0;
  for (let i = 0; i < maxBatches; i++) {
    // prune_trace_spans returns jsonb { pruned_before, spans_deleted }.
    const r = await client.query(
      "select (clara.prune_trace_spans((now() - ($1 || ' days')::interval), $2) ->> 'spans_deleted')::bigint as n",
      [String(days), batch],
    );
    const n = Number(r.rows[0]?.n ?? 0);
    pruned += n;
    if (n < batch) break; // caught up
  }
  return { pruned };
}

// ---------------------------------------------------------------------------
// Task settlement helpers.
// ---------------------------------------------------------------------------

/** Settle a task to a terminal outcome (idempotent; closes pending interruptions). */
export async function settleTaskTerminal(client, taskId, outcome, errorCode) {
  await client.query("select clara.settle_chat_turn($1, $2::jsonb, $3, $4, $5)", [taskId, "[]", 0, outcome, errorCode]);
}

// ---------------------------------------------------------------------------
// The task reconciliation matrix.
// ---------------------------------------------------------------------------

/**
 * Converge task rows with engine truth.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{enqueueChatTurn:(taskId:string)=>Promise<{runId:string}>,
 *          getRun:(runId:string)=>{status:Promise<string>, cancel:()=>Promise<unknown>},
 *          log?:(m:string)=>void}} deps
 */
export async function reconcileTasks(client, deps) {
  const { enqueueChatTurn, getRun, onlyFirm = null, graceInterval = GRACE_REENQUEUE, log = () => {} } = deps;
  const out = { reenqueued: 0, settledTerminal: 0, cancelled: 0, abortedOrphans: 0 };

  // A) queued-without-run beyond the grace window -> re-enqueue.
  const stuck = await client.query(
    `select id from clara.agent_tasks
      where kind = 'chat_turn' and status = 'queued' and workflow_run_id is null
        and created_at < now() - ($1)::interval
        and ($2::uuid is null or firm_id = $2)
      order by created_at limit 20`,
    [graceInterval, onlyFirm],
  );
  for (const t of stuck.rows) {
    try {
      // Just start — the workflow's first step CAS-binds itself (S4-AB3); a duplicate
      // start (e.g. racing the ingress) self-aborts. No bind here.
      await enqueueChatTurn(t.id);
      out.reenqueued += 1;
    } catch (err) {
      log(`[reconcile] re-enqueue failed task=${t.id}: ${err?.message ?? err}`);
    }
  }

  // B) cancel_requested -> abort + settle (safety net alongside the control listener).
  const cancels = await client.query(
    `select id, workflow_run_id from clara.agent_tasks
      where status = 'cancel_requested' and ($1::uuid is null or firm_id = $1)
      order by created_at limit 20`,
    [onlyFirm],
  );
  for (const t of cancels.rows) {
    if (t.workflow_run_id) {
      try {
        await getRun(t.workflow_run_id).cancel();
      } catch (err) {
        log(`[reconcile] cancel run ${t.workflow_run_id} noop: ${err?.message ?? err}`);
      }
    }
    await settleTaskTerminal(client, t.id, "cancelled", null);
    out.cancelled += 1;
  }

  // C) open task with a run -> settle from engine truth when the engine is terminal.
  // The terminal OUTCOME is matrix-aware (S4-AB11): a 'running' task may go
  // completed/failed, but an 'awaiting_input' (parked) task may only go
  // expired/cancelled — so a lost/failed parked run settles 'cancelled', never 'failed'.
  const open = await client.query(
    `select id, status, workflow_run_id from clara.agent_tasks
      where kind = 'chat_turn' and workflow_run_id is not null
        and status in ('running','awaiting_input')
        and ($1::uuid is null or firm_id = $1)
      order by created_at limit 50`,
    [onlyFirm],
  );
  for (const t of open.rows) {
    let engineTerminal; // 'completed' | 'failed' | 'cancelled' | 'lost' | null(in-flight)
    try {
      const es = await getRun(t.workflow_run_id).status;
      engineTerminal = es === "completed" || es === "failed" || es === "cancelled" ? es : null;
    } catch (err) {
      if (isRunNotFound(err)) {
        engineTerminal = "lost";
      } else {
        log(`[reconcile] status probe failed task=${t.id}: ${err?.message ?? err}`);
        continue;
      }
    }
    if (!engineTerminal) continue; // 'running'/'pending' (incl. a parked run) — in flight.
    // A 'running' task whose engine run is CANCELLED can't go running→cancelled (AB11).
    // Route it matrix-legally in one repair txn: running→cancel_requested→cancelled
    // (S4-FX5) — otherwise the pair would be skipped forever.
    if (t.status === "running" && engineTerminal === "cancelled") {
      await client.query("update clara.agent_tasks set status = 'cancel_requested', updated_at = now() where id = $1 and status = 'running'", [t.id]);
      await settleTaskTerminal(client, t.id, "cancelled", null); // cancel_requested→cancelled (legal)
      out.settledTerminal += 1;
      continue;
    }
    const settle = terminalFor(t.status, engineTerminal);
    if (settle) {
      await settleTaskTerminal(client, t.id, settle.outcome, settle.errorCode);
      out.settledTerminal += 1;
    } else {
      log(`[reconcile] no legal terminal for task=${t.id} status=${t.status} engine=${engineTerminal} — skipping`);
    }
  }

  // D) terminal task whose run is still active (crash after settle, before abort) ->
  //    abort the orphan. Scoped to recently-cancelled tasks (the realistic source).
  const orphans = await client.query(
    `select id, workflow_run_id from clara.agent_tasks
      where kind = 'chat_turn' and workflow_run_id is not null
        and status = 'cancelled'
        and coalesce(cancelled_at, created_at) > now() - ($1)::interval
        and ($2::uuid is null or firm_id = $2)
      order by created_at desc limit 50`,
    [ORPHAN_WINDOW, onlyFirm],
  );
  for (const t of orphans.rows) {
    let es;
    try {
      es = await getRun(t.workflow_run_id).status;
    } catch {
      continue; // gone already
    }
    if (es === "running" || es === "pending") {
      try {
        await getRun(t.workflow_run_id).cancel();
        out.abortedOrphans += 1;
      } catch (err) {
        log(`[reconcile] orphan abort failed run=${t.workflow_run_id}: ${err?.message ?? err}`);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// One full sweep (called under the leader lock by the supervisor).
// ---------------------------------------------------------------------------

/**
 * Run every sweeper once + a heartbeat. Trace prune runs on a coarser cadence
 * (opts.prune=true) so it does not scan on every fast sweep.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{enqueueChatTurn:Function, getRun:Function, log?:Function, prune?:boolean}} deps
 */
export async function runReconcilerSweep(client, deps) {
  const log = deps.log ?? (() => {});
  await heartbeat(client, "reconciler");
  const expiry = await expireClarifies(client, { onlyFirm: deps.onlyFirm ?? null });
  const tasks = await reconcileTasks(client, deps);
  let prune = { pruned: 0 };
  if (deps.prune) {
    try {
      prune = await pruneTraces(client, {});
    } catch (err) {
      log(`[reconcile] trace prune error: ${err?.message ?? err}`);
    }
  }
  return { ...expiry, ...tasks, ...prune };
}
