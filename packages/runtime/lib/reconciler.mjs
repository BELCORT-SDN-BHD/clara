// The settle-reconciler + sweepers (Slice 4, contract §4.5–4.7). The crash-recovery
// safety net: it makes the durable truth (task rows) and the engine truth (WDK run
// status) converge, and it never leaves a task permanently stuck. Leader-guarded —
// the caller (scripts/serve.mjs) runs runReconcilerSweep only while it holds the
// relay leader lock, so exactly one process sweeps at a time.
//
// Because start() carries NO idempotency key (re-verified against workflow@4.8.4), the
// enqueue dedupe is RUN-LISTING (S4-V1 fallback): the route binds workflow_run_id
// onto the task immediately after start(); the reconciler only re-enqueues a task
// that is still 'queued' with a NULL run beyond a grace window, and the bind is a
// conditional UPDATE so a race with the route no-ops. Duplicate spend is bounded
// (settle_chat_turn is idempotent by task — the second run's settle is a
// stored-outcome no-op), which is the contract's accepted honesty envelope (§0.4).
//
// Engine status vocabulary (workflow@4.8.4 / @workflow/world-postgres@4.3.4):
// pending | running | completed | failed | cancelled. A PARKED run reports
// 'running' (S4-P1a) — so `awaiting_input` on the TASK is the only parked-visibility
// source; the reconciler never treats engine 'running' as "finished".

import { sweepSpoolTtl } from "./spool.mjs";
// The HALT class itself, not its spelling. runReconcilerSweep's per-belt containment must let a
// taxonomy HALT through to leader.mjs:218 (onHalt → process.exit(2), crash-only supervision), and
// the only way to be sure the thing it rethrows IS the thing the leader catches is to test against
// the SAME class object from the SAME module — a name test (`err.name === "TaxonomyHaltError"`)
// would pass for any impostor and, worse, silently stop matching if the class were ever renamed.
import { TaxonomyHaltError } from "./relay.mjs";
import { isRunNotFound, reconcileDocumentIntakes, reconcileDocumentTasks } from "./reconciler-documents.mjs";
import { reconcileSstWatches } from "./reconciler-sst.mjs";
import { reconcileLintBelt } from "./reconciler-lint.mjs";
import { reconcileFaRuns } from "./reconciler-fa.mjs";
import { reconcileAdjustmentRuns } from "./reconciler-adjustments.mjs";

const GRACE_REENQUEUE = process.env.CLARA_RECONCILE_GRACE || "15 seconds";
const ORPHAN_WINDOW = process.env.CLARA_RECONCILE_ORPHAN_WINDOW || "30 minutes";
const TRACE_RETENTION_DAYS = Number(process.env.CLARA_TRACE_RETENTION_DAYS || 90);
const PRUNE_BATCH = Number(process.env.CLARA_TRACE_PRUNE_BATCH || 1000);
const PRUNE_MAX_BATCHES = Number(process.env.CLARA_TRACE_PRUNE_MAX_BATCHES || 20);

// The document-lane sweepers moved to reconciler-documents.mjs (module-size budget);
// re-exported so existing import sites (intake-db, intake-reconcile, ingest-workflow-db)
// keep resolving them from reconciler.mjs.
export { isRunNotFound, reconcileDocumentIntakes, reconcileDocumentTasks };

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
  const out = { reenqueued: 0, settledTerminal: 0, cancelled: 0, abortedOrphans: 0, settleFailed: 0 };

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
  // Dispatch the settle by KIND (2026-07-31 C-b acceptance-night finding (2), named in
  // PROJECTLOG: "the leader cancel path misuses settle_chat_turn for autodraft tasks").
  // settle_chat_turn raises CLR10 ('settle_chat_turn is for chat turns only') the instant
  // t.kind <> 'chat_turn' (0006:1021); that raise was UNCAUGHT here, so it propagated out
  // of reconcileTasks -> runReconcilerSweep and aborted the ENTIRE sweep cycle (sections
  // C/D below and every other sweeper in runReconcilerSweep never ran) — the row stayed
  // 'cancel_requested' forever, got re-selected next poll, and re-threw: the two-day
  // Section-I zombie that also starved the document reconciler. NB: kind='wake' can never
  // reach 'cancel_requested' in the first place — clara._tf_agent_task_update's transition
  // matrix (0006:465-472) gives wake only held->cancelled DIRECTLY, and cancel_agent_task
  // (0006:845-849) only sets 'cancel_requested' when the task is running/awaiting_input,
  // neither of which a wake task (always created 'held', 0006:422) ever is — so this query
  // structurally only ever sees chat_turn/autodraft rows.
  const cancels = await client.query(
    `select id, kind, workflow_run_id from clara.agent_tasks
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
    try {
      if (t.kind === "autodraft") {
        // settle_autodraft_task (0036 CoR) has NO 'cancelled' outcome — its outcome
        // CHECK is drafted|skipped_lane|noop_existing|failed (0036:864-868) — so a
        // cancelled autodraft settles 'failed' with the cancellation named in the
        // refusal, matching terminalForAutodraft's own engine==='cancelled' arm below.
        await settleAutoDraftTerminal(client, t.id, "failed", null, { code: "internal", reason: "cancelled" });
      } else {
        await settleTaskTerminal(client, t.id, "cancelled", null);
      }
      out.cancelled += 1;
    } catch (err) {
      // Isolated PER TASK, same as section A's re-enqueue try/catch: one task's settle
      // failure must never abort the rest of this sweep (that isolation IS the fix —
      // an unexpected kind or a transient error now retries next cycle instead of
      // starving every sweeper after this one).
      log(`[reconcile] cancel-settle failed task=${t.id} kind=${t.kind}: ${err?.message ?? err}`);
    }
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
    // ISOLATED PER TASK — the SAME isolation sections A and B carry above, D carries below,
    // and reconcileAutoDraftTasks carries on its own terminal edge (§7-A FINDING F1). Until
    // now the status probe just above was the ONLY caught thing in this section: the repair
    // UPDATE and BOTH settles below ran bare. So one persistent bad row on THIS edge — a DB
    // refusal, an anomalous transition, a transient error on the settle statement — threw
    // straight out of reconcileTasks → runReconcilerSweep and aborted everything sequenced
    // after it: the REMAINING §C rows, section D, the autodraft edge, documents, intakes,
    // spool TTL and the daily belts, every ~2s, indefinitely — because the reconciler IS the
    // thing that would otherwise have healed it. That is section B's Section-I zombie on a
    // different edge, and it is fixed the same way: log the row, carry on to the next.
    //
    // A 'running' task whose engine run is CANCELLED can't go running→cancelled (AB11).
    // Route it matrix-legally in one repair txn: running→cancel_requested→cancelled
    // (S4-FX5) — otherwise the pair would be skipped forever.
    if (t.status === "running" && engineTerminal === "cancelled") {
      try {
        await client.query("update clara.agent_tasks set status = 'cancel_requested', updated_at = now() where id = $1 and status = 'running'", [t.id]);
        await settleTaskTerminal(client, t.id, "cancelled", null); // cancel_requested→cancelled (legal)
        out.settledTerminal += 1;
      } catch (err) {
        // A HALT must still reach the leader even from inside a per-item catch — see the belt()
        // wrapper's own comment. Nothing today can raise one here (settleTaskTerminal/the repair
        // UPDATE never throw TaxonomyHaltError), but a per-item catch that did not re-check would
        // silently swallow one if that ever changed.
        if (isLeaderHalt(err)) throw err;
        out.settleFailed += 1;
        log(`[reconcile] settle failed task=${t.id} status=${t.status} engine=${engineTerminal}: ${err?.message ?? err}`);
      }
      // The `continue` sits OUTSIDE the catch deliberately. If the UPDATE landed and the
      // settle did not, the ROW is now 'cancel_requested' while `t.status` still reads
      // 'running' from the snapshot — falling through to terminalFor would ask the matrix
      // about a status the row no longer has and log a spurious "no legal terminal". The
      // next sweep re-reads the row, and section B owns 'cancel_requested' rows anyway.
      continue;
    }
    const settle = terminalFor(t.status, engineTerminal);
    if (settle) {
      try {
        await settleTaskTerminal(client, t.id, settle.outcome, settle.errorCode);
        out.settledTerminal += 1;
      } catch (err) {
        // Same guard, same reason as the repair branch above — a HALT must not be eaten by a
        // per-item catch even though nothing today raises one from settleTaskTerminal.
        if (isLeaderHalt(err)) throw err;
        out.settleFailed += 1;
        log(`[reconcile] settle failed task=${t.id} status=${t.status} engine=${engineTerminal} outcome=${settle.outcome}: ${err?.message ?? err}`);
      }
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
// Autodraft-kind reconcile edges (Wave A, contract §3 / companion §4). autodraft tasks never
// park (no awaiting_input), so the matrix is simpler than chat: a terminal engine run always
// settles the task 'failed' UNLESS a draft was persisted (a crash after the draft, before the
// settle) — the persisted coding attempt is honored as 'drafted'. Uses settle_autodraft_task
// (not settle_chat_turn) and re-enqueues via deps.enqueueAutoDraft (registry provenance).
// ---------------------------------------------------------------------------

/** The failed-settle reason for a terminal engine run (pure; no awaiting_input branch). A
 *  'completed' run that left no persisted draft still settles failed (it produced nothing). */
export function terminalForAutodraft(engine) {
  if (engine === "failed") return { outcome: "failed", reason: "internal" };
  if (engine === "lost") return { outcome: "failed", reason: "engine_lost" };
  if (engine === "cancelled") return { outcome: "failed", reason: "cancelled" };
  if (engine === "completed") return { outcome: "failed", reason: "internal" };
  return null; // in-flight (running/pending)
}

/** Settle an autodraft task terminally (idempotent). tokens=0 at the reconcile edge. */
async function settleAutoDraftTerminal(client, taskId, outcome, entryId, refusal) {
  await client.query("select clara.settle_autodraft_task($1, $2, $3, $4, $5::jsonb)", [
    taskId,
    outcome,
    0,
    entryId ?? null,
    refusal == null ? null : JSON.stringify(refusal),
  ]);
}

/**
 * Converge autodraft task rows with engine truth. deps.enqueueAutoDraft is REQUIRED to run
 * (absent -> a clean no-op, so legacy callers that never wired it are unaffected). Pre-0011
 * the kind CHECK excludes 'autodraft' so no such rows exist and every query returns empty.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{enqueueAutoDraft?:Function, getRun?:Function, onlyFirm?:string|null,
 *          graceInterval?:string, log?:Function}} deps
 */
export async function reconcileAutoDraftTasks(client, deps) {
  const { enqueueAutoDraft, getRun, onlyFirm = null, graceInterval = GRACE_REENQUEUE, log = () => {} } = deps;
  const out = { autodraftReenqueued: 0, autodraftSettled: 0, autodraftSettleFailed: 0 };
  if (typeof enqueueAutoDraft !== "function") return out; // not wired — no-op

  // A) admitted-but-unstarted (queued, no run) past grace -> re-enqueue. The workflow's
  //    claim step (begin_autodraft_task) self-binds; a duplicate start self-aborts.
  const stuck = await client.query(
    `select id from clara.agent_tasks
      where kind = 'autodraft' and status = 'queued' and workflow_run_id is null
        and created_at < now() - ($1)::interval
        and ($2::uuid is null or firm_id = $2)
      order by created_at limit 20`,
    [graceInterval, onlyFirm],
  );
  for (const t of stuck.rows) {
    try {
      await enqueueAutoDraft(t.id);
      out.autodraftReenqueued += 1;
    } catch (err) {
      log(`[reconcile] autodraft re-enqueue failed task=${t.id}: ${err?.message ?? err}`);
    }
  }

  // C) running + bound with a terminal engine run -> honor a persisted draft, else settle failed.
  if (typeof getRun !== "function") return out;
  const open = await client.query(
    `select id, workflow_run_id from clara.agent_tasks
      where kind = 'autodraft' and status = 'running' and workflow_run_id is not null
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
        log(`[reconcile] autodraft status probe failed task=${t.id}: ${err?.message ?? err}`);
        continue;
      }
    }
    if (!engine) continue; // still in flight
    let draftedEntry = null;
    try {
      const a = (await client.query("select clara.get_coding_attempt($1) as a", [t.id])).rows[0]?.a ?? null;
      if (a && a.entry_id) draftedEntry = String(a.entry_id);
    } catch {
      /* no recovery surface — treat as no draft */
    }
    // ISOLATED PER TASK — the §7-A Half-2 blocker (FINDING F1, 2026-08-07), and the SAME
    // isolation reconcileTasks's section B already carries for the cancel edge. This settle
    // used to run bare, so a single task the DB refuses to settle threw all the way out of
    // reconcileAutoDraftTasks -> runReconcilerSweep and aborted the WHOLE leader cycle before
    // its remaining work: document dispatch, matching, the intake sweeps, the adjustments
    // belt, FA runs and SST watches all starved behind it, every ~2s, forever, because the
    // reconciler IS the thing that would otherwise have healed it. Measured: 52 "LEADER
    // cycle-error draft settlement entry not found" in one 25-minute window, five document
    // tasks queued 19 minutes, /ready warning on a 1,158,951 ms unbound-task age — cleared
    // only when a human cancelled a task they had no reason to know existed.
    //
    // The DB half of that specific CLR11 is fixed in migration 0047 (the guard now tests
    // identity, not a time-varying status). This is the OTHER half, and it is deliberately
    // not conditional on that one: whatever the DB refuses for — a genuinely foreign entry,
    // a losing dispatch, a transient error — one un-settleable task must never be able to
    // abort the sweep. The failure is COUNTED (autodraftSettleFailed) as well as logged, so
    // it stays visible rather than swallowed, and it retries next cycle.
    //
    // Logging every cycle rather than once is deliberate: it matches section B's cancel-edge
    // idiom exactly, and the leader does not log the sweep result, so a de-duplicated line
    // would turn a persistent strand into silence after its first occurrence.
    try {
      if (draftedEntry) {
        await settleAutoDraftTerminal(client, t.id, "drafted", draftedEntry, null); // crash-after-draft honored
      } else {
        const settle = terminalForAutodraft(engine) ?? { outcome: "failed", reason: "internal" };
        await settleAutoDraftTerminal(client, t.id, "failed", null, { code: "internal", reason: settle.reason });
      }
      out.autodraftSettled += 1;
    } catch (err) {
      out.autodraftSettleFailed += 1;
      log(`[reconcile] autodraft settle failed task=${t.id} entry=${draftedEntry ?? "none"} engine=${engine}: ${err?.message ?? err}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Autopost-rule expiry/nudge sweep (Wave A2.1 §7 / migration 0015 S3 — WA2-R10
// never-auto-renew). clara.reconcile_autopost_rules() hard-expires live autopost
// rules past expires_at (+ notification) and writes the ¾-term no-recent-post
// nudges; the returned {expired, nudged} counts are the receipt. The fn is
// runtime-GROUP-granted (the reconcile_sweep_runs precedent — a plain call on the
// clara_runtime connection, NOT the execute_rule_post login-direct dance). Errors
// are isolated: log + autopostOk:false, so the leader retries next cycle and the
// other sweepers are never blocked.
// ---------------------------------------------------------------------------

/** @param {import("pg").ClientBase} client  a clara_runtime connection */
export async function reconcileAutopostRules(client, opts = {}) {
  const log = opts.log ?? (() => {});
  try {
    const r = (await client.query("select clara.reconcile_autopost_rules() as r")).rows[0]?.r ?? {};
    const out = { autopostOk: true, autopostExpired: Number(r?.expired ?? 0), autopostNudged: Number(r?.nudged ?? 0) };
    log(`[reconcile] autopost rules expired=${out.autopostExpired} nudged=${out.autopostNudged}`);
    return out;
  } catch (err) {
    log(`[reconcile] reconcile_autopost_rules error: ${err?.message ?? err}`);
    return { autopostOk: false, autopostExpired: 0, autopostNudged: 0 };
  }
}

// The SST compliance-watch daily repair belt (Wave A2.1 §2.2 / migration 0016) lives in
// reconciler-sst.mjs (module-size budget, the reconciler-documents.mjs precedent) and is
// re-exported here so existing import sites keep resolving it from reconciler.mjs. It
// iterates the active clients ONE TRANSACTION PER CLIENT — a single all-clients call would
// hold the firm_event_seq row lock for the whole sweep and block every concurrent writer.
export { reconcileSstWatches };

// The per-client wiki-lint belt (Wave B design part3 L3 / WB-R8) lives in
// reconciler-lint.mjs under the same module-size budget and per-client-statement
// law: one run_client_lint statement per active client (one implicit txn, one
// short-lived event-seq lock each), then run_lint_all ONCE, last, as the receipt
// writer — never as the sweep itself.
export { reconcileLintBelt };

// The Wave D-a depreciation-run daily belt (design §3.4 / migration 0041) lives in
// reconciler-fa.mjs under the same module-size budget. Unlike its siblings it
// FEATURE-DETECTS its own DB surface per cycle (the runtime image ships before 0041,
// per the design's ceremony order) and asks clara.depreciation_run_due per client
// rather than evaluating everyone unconditionally — a client with no live authority
// or nothing overdue is a cheap {due:false} no-op.
export { reconcileFaRuns };

// The Wave D-b adjustment belt (design §2.3/§2.7 / migration 0045) lives in reconciler-adjustments.mjs.
export { reconcileAdjustmentRuns };

// ---------------------------------------------------------------------------
// One full sweep (called under the leader lock by the supervisor).
// ---------------------------------------------------------------------------

/** True iff this error belongs to the LEADER, not to the sweep. Mirrors leader.mjs:218's own
 *  test byte-for-byte (`err instanceof TaxonomyHaltError || err?.halt`) so the two can never
 *  disagree about what a HALT is: a halt must reach onHalt → process.exit(2), and no
 *  containment added here is ever allowed to eat one. */
function isLeaderHalt(err) {
  return err instanceof TaxonomyHaltError || !!err?.halt;
}

/**
 * Run every sweeper once + a heartbeat. Trace prune runs on a coarser cadence
 * (opts.prune=true) so it does not scan on every fast sweep; the autopost-rule
 * expiry sweep runs on the leader's daily flag (opts.autopostRules=true); the SST
 * compliance-watch repair belt runs on the leader's daily flag (opts.sstWatches=true);
 * the per-client wiki-lint belt runs on the leader's daily flag (opts.lintBelt=true); the FA
 * belt (opts.faRuns=true) and the D-b adjustment belt (opts.adjRuns=true) run on the same flag.
 *
 * EVERY belt is individually contained (see the wrapper's own comment): one belt's escape
 * costs that belt this cycle and never the belts behind it. The result carries `heartbeatOk`
 * and `beltErrors` (the names of the belts that threw, empty on a clean sweep) so a caller
 * can SEE a contained failure rather than infer it from a missing counter. A HALT is the one
 * error that still propagates — the leader owns it.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{enqueueChatTurn:Function, getRun:Function, log?:Function, prune?:boolean,
 *          autopostRules?:boolean, sstWatches?:boolean, lintBelt?:boolean, faRuns?:boolean,
 *          adjRuns?:boolean}} deps
 */
export async function runReconcilerSweep(client, deps) {
  const log = deps.log ?? (() => {});
  // BELT-AND-BRACES CONTAINMENT AT THE ASSEMBLY LEVEL. Every belt below already isolates its
  // own faults per item or per client — and this repo has now twice discovered that "a sweeper
  // that cannot fail" is a claim, not a fact (the Section-I cancel-edge zombie, reconcileTasks
  // section B; the §7-A F1 autodraft-settle zombie). Both times ONE unhandled throw deep in one
  // belt aborted every belt sequenced after it, every ~2s, indefinitely. This wrapper makes that
  // shape structurally unreachable: a belt's escape costs THAT belt this cycle and nothing else.
  //
  // TWO ERRORS ARE DELIBERATELY NOT CONTAINED HERE:
  //   * A HALT (isLeaderHalt) is RETHROWN — it is the leader's crash-only signal and swallowing
  //     it would turn an un-routable state into a silent, permanently-degraded loop.
  //   * ...and that is the only one. CONNECTION-CLASS errors are contained like everything else,
  //     which MATCHES the estate exactly: the three wraps that already existed here (intake
  //     artifact recovery, spool TTL, trace prune) and the leader's own render pair
  //     (leader.mjs:200-211) all log-and-continue on a conn error rather than rethrowing.
  //     Consequence, stated plainly: a connection that dies mid-sweep no longer short-circuits
  //     to leader.mjs:222's teardown-and-reconnect from INSIDE the sweep. It surfaces at most
  //     one cycle later and by two independent routes — the pg client's own 'error' event sets
  //     `connErr`, which leader.mjs:172 rethrows at the top of the next cycle, and the BARE
  //     runRelayCycle/drainCycle calls (leader.mjs:175-176) run BEFORE the sweep on that same
  //     connection. The cost is one cycle of belts logging failures against a dead socket; the
  //     purchase is that no belt can starve its siblings. Rethrowing conn errors here would
  //     re-open exactly the hole this change closes, because `isConnErr` is a MESSAGE-PATTERN
  //     test (listen.mjs:7-12) and any belt fault whose text happened to match would abort the
  //     sweep again.
  const beltErrors = [];
  const belt = async (name, run, fallback = {}) => {
    try {
      return await run();
    } catch (err) {
      if (isLeaderHalt(err)) throw err;
      beltErrors.push(name);
      // The `[reconcile] <name> error:` idiom, and the three pre-existing names, are preserved
      // verbatim so an operator's existing log greps keep matching. Logged EVERY cycle, never
      // de-duplicated: the leader does not log the sweep result, so a one-shot line would turn
      // a persistent strand into silence after its first occurrence (the argument section B and
      // reconciler-render.mjs:220-223 already make for their own lines).
      log(`[reconcile] ${name} error: ${err?.message ?? err}`);
      return fallback;
    }
  };

  // THE HEARTBEAT IS THE ONE DELIBERATE FAIL-FAST. NOT, as an earlier version of this comment
  // claimed, because the migration quiesce guards or /ready depend on THIS specific beat — they
  // do not: 0022/0023's quiesce guards read ANY component's beat within 90s
  // (0022_extraction_slice_x1.sql:133-142, 0023:80-95), which the INDEPENDENT 'control' beat
  // (control.mjs:204) and the supervisor's 'world' beat already keep hot on their own loops —
  // the reconciler beat is redundant to them, not load-bearing for them. And the writer those
  // migrations swap, clara.execute_rule_post, is never called by this sweep at all — its only
  // caller is rule-post.mjs:53, an independent loop. /ready (health.mjs:99-115) reads only
  // 'world' and 'control'; nothing anywhere reads the 'reconciler' component.
  //
  // The defensible reason is narrower and leans on no downstream reader: a leader that cannot
  // complete the CHEAPEST possible write on its own connection — a single-row upsert — has
  // nothing useful to do with that connection this cycle. Skip the sweep, log one loud line,
  // retry in ~2s. This cannot reproduce the starvation this change exists to kill, because
  // nothing that breaks that upsert (dead socket, revoked grant, catalog drift) would spare the
  // belts below it — they run on the SAME connection, so a fault that stops the beat stops them
  // too; skipping first only shortens the cycle, it never turns a healthy belt into a skipped one.
  try {
    await heartbeat(client, "reconciler");
  } catch (err) {
    if (isLeaderHalt(err)) throw err;
    log(`[reconcile] heartbeat error — SKIPPING the remainder of this sweep (the quiesce guards read this beat; a leader that cannot record liveness must not keep writing): ${err?.message ?? err}`);
    return { heartbeatOk: false, beltErrors: ["heartbeat"] };
  }

  const expiry = await belt("clarify expiry", () => expireClarifies(client, { onlyFirm: deps.onlyFirm ?? null }));
  const tasks = await belt("task reconcile", () => reconcileTasks(client, deps));
  const autodraftTasks = await belt("autodraft reconcile", () => reconcileAutoDraftTasks(client, deps));
  const documentTasks = await belt("document task reconcile", () => reconcileDocumentTasks(client, { ...deps, integrity: deps.prune === true }));
  const documentIntakes = await belt("document intake reconcile", () => reconcileDocumentIntakes(client, deps));
  let intakeRecovery = { recovered: 0, deferred: 0, expired: 0 };
  if (typeof deps.recoverDocumentIntakes === "function") {
    intakeRecovery = await belt("intake artifact recovery", () => deps.recoverDocumentIntakes(), intakeRecovery);
  }
  const spool = await belt("spool TTL sweep", () => sweepSpoolTtl(), { spoolRemoved: 0 });
  // The five DAILY belts fall back to their OWN ok:false, never to `{}`. leader.mjs advances the
  // 24h cadence only on a truthy `*Ok` (lines 191-195), so an absent key would already retry next
  // cycle — but saying it explicitly is the difference between a contract and an accident, and it
  // is the one thing a reviewer should not have to derive from undefined-is-falsy.
  const autopost = deps.autopostRules ? await belt("autopost rules", () => reconcileAutopostRules(client, { log }), { autopostOk: false }) : {};
  const sst = deps.sstWatches ? await belt("sst watches", () => reconcileSstWatches(client, { log }), { sstOk: false }) : {};
  const lint = deps.lintBelt ? await belt("lint belt", () => reconcileLintBelt(client, { log }), { lintOk: false }) : {};
  const fa = deps.faRuns ? await belt("fa runs", () => reconcileFaRuns(client, { log }), { faOk: false }) : {};
  const adj = deps.adjRuns ? await belt("adjustment runs", () => reconcileAdjustmentRuns(client, { log }), { adjOk: false }) : {}; // Wave D-b belt (0045)
  const prune = deps.prune ? await belt("trace prune", () => pruneTraces(client, {}), { pruned: 0 }) : { pruned: 0 };
  // A FAILED BELT CONTRIBUTES NO COUNTERS, deliberately: a zeroed fallback would claim "nothing
  // to settle" where the truth is "we do not know", and it would let a caller's `"key" in swept`
  // assertion pass for a belt that never ran. `beltErrors` names them positively instead — the
  // autodraft edge's own law (a failure that is COUNTED stays visible; a failure that is only
  // logged is one grep away from invisible).
  return { heartbeatOk: true, beltErrors, ...expiry, ...tasks, ...autodraftTasks, ...documentTasks, ...documentIntakes, ...intakeRecovery, ...spool, ...autopost, ...sst, ...lint, ...fa, ...adj, ...prune };
}
