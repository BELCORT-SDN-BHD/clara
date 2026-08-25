// Gate G1's own reconciler belt (design §1.3/Annex C, "reconcileWakeEngineTasks", the
// reconciler-fa.mjs / reconciler-adjustments.mjs module-size-budget precedent — split out of
// reconciler.mjs from the start rather than appended, per leader.mjs:25-29's own comment).
//
// GENERIC OVER EVERY KIND THE REGISTRY NAMES — kind = ANY(select task_kind from
// clara.wake_engine_sources), so kind='wake' (the wake_outbox carrier) and kind='close_prep' (the
// direct_queue carrier, and any future direct_queue kind) share ONE belt, never one per source.
// Reuses reconciler.mjs's terminalFor UNCHANGED (a pure (taskStatus,engine)->{outcome,errorCode}
// map with no kind parameter, survey §7 P-G1c) and settles through clara._settle_wake_task
// instead of settle_chat_turn, so the paired wakes_outbox write happens on every settlement path
// INCLUDING crash-recovery — the stranded-row cure's crash-safety half.
//
// Two sections, mirroring reconcileTasks'/reconcileAutoDraftTasks' own shape:
//   A) running + workflow_run_id NULL past grace -> the claim committed but enqueue() never
//      landed (a crash between commit and enqueue, or a lost nudge) -> re-derive the row's
//      source, re-mint a FRESH credential (never cached/reused, the estate's own law) and
//      re-enqueue. "Just start — the workflow's first step CAS-binds itself; a duplicate start
//      self-aborts" (reconcileTasks §A's own idiom, unchanged here).
//   B) running + workflow_run_id NOT NULL -> engine truth. A terminal engine settles via
//      terminalFor; an engine-cancelled run on a plain 'running' task repairs through
//      running->cancel_requested->cancelled (reconcileTasks §C's own two-step shape — a direct
//      running->cancelled jump is not itself legal in the wake/close_prep matrix either).

import { terminalFor } from "./reconciler.mjs";
import { TaxonomyHaltError } from "./relay.mjs";

const GRACE_REENQUEUE = process.env.CLARA_RECONCILE_GRACE || "15 seconds";
const DEFAULT_TTL = process.env.CLARA_WAKE_ENGINE_CREDENTIAL_TTL || "00:15:00";

function isLeaderHalt(err) {
  return err instanceof TaxonomyHaltError || !!err?.halt;
}

/** Resolve a stuck row's own wake-engine source (by event_type for kind='wake', by task_kind
 *  for a direct_queue kind) — null if the source has since been dropped/disabled. */
async function resolveSource(client, taskRow) {
  if (taskRow.kind === "wake") {
    const r = await client.query(
      `select s.source_key, s.wake_kind, s.workflow_export
         from clara.agent_tasks at
         join clara.wake_intents wi on wi.id = at.origin_intent_id
         join clara.domain_events de on de.id = wi.event_id
         join clara.wake_engine_sources s on s.event_type = de.event_type and s.carrier = 'wake_outbox'
        where at.id = $1 and s.enabled`,
      [taskRow.id],
    );
    return r.rows[0] ?? null;
  }
  const r = await client.query(
    `select source_key, wake_kind, workflow_export from clara.wake_engine_sources
      where task_kind = $1 and carrier = 'direct_queue' and enabled`,
    [taskRow.kind],
  );
  return r.rows[0] ?? null;
}

/** §A — running-with-no-run past grace: re-mint + re-enqueue. Own txn per row (mirrors
 *  reconcileTasks §A's isolation — one un-enqueueable row must never block the rest). */
async function reenqueueStuckRows(client, deps) {
  const { enqueue, onlyFirm = null, graceInterval = GRACE_REENQUEUE, log = () => {} } = deps;
  let reenqueued = 0;
  if (typeof enqueue !== "function") return { wakeReenqueued: 0 };
  const stuck = await client.query(
    `select id, kind, firm_id, client_id from clara.agent_tasks
      where kind = any(select task_kind from clara.wake_engine_sources)
        and status = 'running' and workflow_run_id is null
        and created_at < now() - ($1)::interval
        and ($2::uuid is null or firm_id = $2)
      order by created_at limit 20`,
    [graceInterval, onlyFirm],
  );
  for (const t of stuck.rows) {
    try {
      const source = await resolveSource(client, t);
      if (!source) {
        log(`[reconcile] wake-engine stuck task=${t.id} kind=${t.kind}: source no longer registered/enabled — leaving for a future cycle`);
        continue;
      }
      const cred = await client.query(
        "select credential_id, secret from clara.mint_wake_credential($1,$2,$3,$4::interval,$5)",
        [source.wake_kind, t.firm_id, null, DEFAULT_TTL, t.client_id],
      );
      await enqueue(source.workflow_export, t.id, cred.rows[0]);
      reenqueued += 1;
    } catch (err) {
      if (isLeaderHalt(err)) throw err;
      log(`[reconcile] wake-engine re-enqueue failed task=${t.id}: ${err?.message ?? err}`);
    }
  }
  return { wakeReenqueued: reenqueued };
}

/** §B — running-with-a-run: converge on engine truth, exactly reconcileTasks §C's own shape but
 *  settling through clara._settle_wake_task (so wakes_outbox settles in the SAME crash-recovery
 *  path a fresh claim uses). */
async function settleFromEngineTruth(client, deps) {
  const { getRun, onlyFirm = null, log = () => {} } = deps;
  const out = { wakeSettled: 0, wakeSettleFailed: 0 };
  if (typeof getRun !== "function") return out;
  const open = await client.query(
    `select id, status, workflow_run_id from clara.agent_tasks
      where kind = any(select task_kind from clara.wake_engine_sources)
        and workflow_run_id is not null and status = 'running'
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
      log(`[reconcile] wake-engine status probe failed task=${t.id}: ${err?.message ?? err}`);
      continue;
    }
    if (!engineTerminal) continue; // in flight

    // A 'running' task whose engine run is CANCELLED can't go running->cancelled directly (the
    // matrix admits running->cancel_requested only) — repair in two steps, reconcileTasks §C's
    // own precedent verbatim.
    if (engineTerminal === "cancelled") {
      try {
        await client.query("update clara.agent_tasks set status = 'cancel_requested', updated_at = now() where id = $1 and status = 'running'", [t.id]);
        await client.query("select clara._settle_wake_task($1,$2,$3)", [t.id, "cancelled", null]);
        out.wakeSettled += 1;
      } catch (err) {
        if (isLeaderHalt(err)) throw err;
        out.wakeSettleFailed += 1;
        log(`[reconcile] wake-engine settle failed task=${t.id} engine=cancelled: ${err?.message ?? err}`);
      }
      continue;
    }

    const settle = terminalFor(t.status, engineTerminal);
    if (!settle) {
      log(`[reconcile] wake-engine no legal terminal for task=${t.id} status=${t.status} engine=${engineTerminal} — skipping`);
      continue;
    }
    try {
      await client.query("select clara._settle_wake_task($1,$2,$3)", [t.id, settle.outcome, settle.errorCode]);
      out.wakeSettled += 1;
    } catch (err) {
      if (isLeaderHalt(err)) throw err;
      out.wakeSettleFailed += 1;
      log(`[reconcile] wake-engine settle failed task=${t.id} status=${t.status} engine=${engineTerminal} outcome=${settle.outcome}: ${err?.message ?? err}`);
    }
  }
  return out;
}

/** @param {import("pg").ClientBase} client  a clara_runtime connection
 *  @param {{enqueue?:Function, getRun?:Function, onlyFirm?:string|null, graceInterval?:string,
 *           log?:Function}} deps */
export async function reconcileWakeEngineTasks(client, deps = {}) {
  const a = await reenqueueStuckRows(client, deps);
  const b = await settleFromEngineTruth(client, deps);
  return { ...a, ...b };
}
