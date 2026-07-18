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

import { listTaskMetas, removeTaskMeta, sweepSpoolTtl, writeTaskMeta } from "./spool.mjs";
import { verifyCanonical } from "./storage.mjs";

const GRACE_REENQUEUE = process.env.CLARA_RECONCILE_GRACE || "15 seconds";
const ORPHAN_WINDOW = process.env.CLARA_RECONCILE_ORPHAN_WINDOW || "30 minutes";
const TRACE_RETENTION_DAYS = Number(process.env.CLARA_TRACE_RETENTION_DAYS || 90);
const PRUNE_BATCH = Number(process.env.CLARA_TRACE_PRUNE_BATCH || 1000);
const PRUNE_MAX_BATCHES = Number(process.env.CLARA_TRACE_PRUNE_MAX_BATCHES || 20);
const DOCUMENT_GRACE_MS = Number(process.env.CLARA_DOCUMENT_RECONCILE_GRACE_MS || 15000);
let warnedDocumentSelectGap = false;

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
// Document processing reconciliation (Slice 5). Migration 0007 currently grants
// runtime writers but no base-table SELECT. Prefer a DB snapshot when available;
// otherwise the 0600 spool sidecars are the crash-recovery index. A permission
// failure never blocks the Slice-4 reconciler or readiness.
// ---------------------------------------------------------------------------

function documentOp(prefix, taskId) {
  return `${prefix}:${taskId}`;
}

/** DB-first intake/reservation reclamation. Sidecars remain a fast resume index,
 * but these rows are the authority and cover a crash before sidecar creation. */
export async function reconcileDocumentIntakes(client, deps = {}) {
  const log = deps.log ?? (() => {});
  const out = { documentIntakesExpired: 0, documentReservationsRefunded: 0 };
  let expired;
  try {
    expired = await client.query(
      `select id from clara.document_intakes
        where status in ('uploading','received','verifying') and expires_at<now()
          and ($1::uuid is null or firm_id=$1)
        order by expires_at limit 100`,
      [deps.onlyFirm ?? null],
    );
  } catch (err) {
    if (isDocumentSelectUnavailable(err)) {
      log(`[reconcile] document intake SELECT unavailable: ${err?.message ?? err}`);
      return out;
    }
    throw err;
  }
  for (const row of expired.rows) {
    try {
      const failed = await client.query("select clara.fail_document_intake($1,$2,$3) as receipt", [
        row.id,
        "expired",
        documentOp("doc-intake-db-expired", row.id),
      ]);
      if (failed.rows[0]?.receipt?.status === "failed") out.documentIntakesExpired += 1;
    } catch (err) {
      if (err?.code !== "CLR16") log(`[reconcile] DB intake expiry failed intake=${row.id}: ${err?.message ?? err}`);
    }
  }

  // A live finalized ingest reservation is bound to its processing task. Only a
  // terminal intake whose unsettled carrier has NO task is orphaned/refundable.
  const orphaned = await client.query(
    `select r.id from clara.document_ingest_reservations r
       join clara.document_intakes i on i.id=r.intake_id and i.firm_id=r.firm_id
      where r.state in ('reserved','resized') and r.task_id is null
        and i.status in ('finalized','adopted','failed')
        and ($1::uuid is null or r.firm_id=$1)
      order by r.created_at limit 100`,
    [deps.onlyFirm ?? null],
  );
  for (const row of orphaned.rows) {
    try {
      const refunded = await client.query("select clara.refund_ingest_reservation($1,$2,$3) as receipt", [
        row.id,
        documentOp("doc-orphan-reservation-refund", row.id),
        "terminal-intake-orphan",
      ]);
      if (refunded.rows[0]?.receipt?.state === "refunded") out.documentReservationsRefunded += 1;
    } catch (err) {
      if (err?.code !== "CLR18") log(`[reconcile] orphan reservation refund failed reservation=${row.id}: ${err?.message ?? err}`);
    }
  }
  return out;
}

function isDocumentSelectUnavailable(err) {
  return err?.code === "42501" || err?.code === "42P01" || /permission denied|does not exist/i.test(String(err?.message || ""));
}

function documentFormat(mime, storageKey) {
  const normalized = String(mime || "").toLowerCase();
  if (normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (normalized === "text/tab-separated-values") return "tsv";
  if (normalized === "text/csv") return "csv";
  if (normalized === "application/xml" || normalized === "text/xml") return "xml";
  if (normalized === "application/pdf") return "pdf";
  const extension = String(storageKey || "").match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return extension === "jpg" ? "jpeg" : extension || "unknown";
}

async function documentTaskSnapshot(client, onlyFirm) {
  const result = await client.query(
    `select t.id as task_id, t.document_id, t.firm_id, t.engine_id, t.engine_config,
            t.version_n, t.lane, t.status, t.workflow_run_id as run_id, t.created_at,
            d.storage_path as storage_key, d.sha256, d.mime_type as mime
       from clara.document_processing_tasks t
       join clara.documents d on d.id=t.document_id and d.firm_id=t.firm_id
      where t.status in ('queued','held_egress','running')
        and ($1::uuid is null or t.firm_id=$1)
      order by t.created_at limit 100`,
    [onlyFirm ?? null],
  );
  return result.rows.map((row) => ({
    schemaVersion: 1,
    taskId: String(row.task_id),
    documentId: String(row.document_id),
    firmId: String(row.firm_id),
    engineId: String(row.engine_id),
    engineConfig: row.engine_config ?? {},
    versionN: Number(row.version_n),
    lane: String(row.lane),
    status: String(row.status),
    runId: row.run_id == null ? null : String(row.run_id),
    storageKey: String(row.storage_key),
    sha256: String(row.sha256),
    mime: String(row.mime),
    format: documentFormat(row.mime, row.storage_key),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

async function documentTaskIndex(client, deps) {
  try {
    const rows = await documentTaskSnapshot(client, deps.onlyFirm);
    const existingRows = await listTaskMetas();
    for (const row of rows) {
      const existing = existingRows.find((meta) => meta?.taskId === row.taskId);
      await writeTaskMeta(row.taskId, { ...existing, ...row });
    }
    return rows;
  } catch (err) {
    if (!isDocumentSelectUnavailable(err)) throw err;
    if (!warnedDocumentSelectGap) {
      warnedDocumentSelectGap = true;
      deps.log?.("[reconcile] document task SELECT unavailable; using durable spool task index");
    }
    return (await listTaskMetas()).filter((row) => row && !row.corrupt && row.taskId);
  }
}

async function documentRunState(getRun, runId) {
  if (!runId) return "lost";
  try {
    return await getRun(runId).status;
  } catch (err) {
    if (isRunNotFound(err)) return "lost";
    throw err;
  }
}

/** Reconcile queued-unbound, held-egress, and stranded-running document tasks. */
export async function reconcileDocumentTasks(client, deps) {
  const log = deps.log ?? (() => {});
  const out = { documentReenqueued: 0, documentRequeuedLost: 0, documentHeldReleased: 0, documentIntegrityWarnings: 0 };
  if (typeof deps.enqueueDocumentIngest !== "function") return out;

  if (process.env.CLARA_DOC_EGRESS_APPROVED === "1") {
    try {
      const released = await client.query("select clara.release_held_document_tasks($1) as receipt", [1000]);
      out.documentHeldReleased = Number(released.rows[0]?.receipt?.released ?? 0);
    } catch (err) {
      log(`[reconcile] held-egress release failed: ${err?.message ?? err}`);
    }
  }

  const tasks = await documentTaskIndex(client, deps);
  for (const task of tasks) {
    if (!task?.taskId) continue;
    if (task.status === "held_egress" && process.env.CLARA_DOC_EGRESS_APPROVED === "1") {
      task.status = "queued";
      task.runId = null;
      await writeTaskMeta(task.taskId, { ...task, updatedAt: new Date().toISOString() });
    }

    if (task.status === "queued") {
      const age = Date.now() - Date.parse(task.createdAt || task.updatedAt || 0);
      if (Number.isFinite(age) && age < DOCUMENT_GRACE_MS) continue;
      if (task.runId) {
        try {
          const state = await documentRunState(deps.getRun, task.runId);
          if (state === "pending" || state === "running") continue;
        } catch (err) {
          log(`[reconcile] document status probe failed task=${task.taskId}: ${err?.message ?? err}`);
          continue;
        }
      }
      try {
        const run = await deps.enqueueDocumentIngest(task.taskId);
        await writeTaskMeta(task.taskId, { ...task, runId: run?.runId ?? null, updatedAt: new Date().toISOString() });
        out.documentReenqueued += 1;
      } catch (err) {
        log(`[reconcile] document re-enqueue failed task=${task.taskId}: ${err?.message ?? err}`);
      }
      continue;
    }

    if (task.status === "running") {
      let state;
      try {
        state = await documentRunState(deps.getRun, task.runId);
      } catch (err) {
        log(`[reconcile] document run probe failed task=${task.taskId}: ${err?.message ?? err}`);
        continue;
      }
      if (state !== "lost") continue;
      try {
        await client.query("select clara.requeue_stranded_document_task($1,$2)", [
          task.taskId,
          documentOp("doc-engine-lost", task.taskId),
        ]);
        await writeTaskMeta(task.taskId, { ...task, status: "queued", runId: null, updatedAt: new Date().toISOString() });
        out.documentRequeuedLost += 1;
      } catch (err) {
        if (err?.code === "CLR16") await removeTaskMeta(task.taskId);
        else log(`[reconcile] document stranded requeue failed task=${task.taskId}: ${err?.message ?? err}`);
      }
    }
  }

  // Coarse integrity pass: verify retained canonical references, never delete.
  if (deps.integrity) {
    for (const task of tasks.slice(0, 10)) {
      if (!task.storageKey || !task.sha256) continue;
      try {
        await verifyCanonical(task.storageKey, task.sha256);
      } catch (err) {
        out.documentIntegrityWarnings += 1;
        log(`[reconcile] DOCUMENT STORAGE INTEGRITY task=${task.taskId}: ${err?.message ?? err}`);
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
  const documentTasks = await reconcileDocumentTasks(client, { ...deps, integrity: deps.prune === true });
  const documentIntakes = await reconcileDocumentIntakes(client, deps);
  let intakeRecovery = { recovered: 0, deferred: 0, expired: 0 };
  if (typeof deps.recoverDocumentIntakes === "function") {
    try {
      intakeRecovery = await deps.recoverDocumentIntakes();
    } catch (err) {
      log(`[reconcile] intake artifact recovery error: ${err?.message ?? err}`);
    }
  }
  let spool = { spoolRemoved: 0 };
  try {
    spool = await sweepSpoolTtl();
  } catch (err) {
    log(`[reconcile] spool TTL sweep error: ${err?.message ?? err}`);
  }
  let prune = { pruned: 0 };
  if (deps.prune) {
    try {
      prune = await pruneTraces(client, {});
    } catch (err) {
      log(`[reconcile] trace prune error: ${err?.message ?? err}`);
    }
  }
  return { ...expiry, ...tasks, ...documentTasks, ...documentIntakes, ...intakeRecovery, ...spool, ...prune };
}
