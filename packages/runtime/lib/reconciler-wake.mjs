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
//      source and re-enqueue (taskId + workflowExport only — NEVER a credential; MUST F, see
//      wake-engine.mjs's own module-header security law. No mint happens here: the dispatched
//      workflow's own first step mints its own fresh credential when IT runs). "Just start —
//      the workflow's first step CAS-binds itself; a duplicate start self-aborts" (reconcileTasks
//      §A's own idiom, unchanged here).
//   B) running + workflow_run_id NOT NULL -> engine truth. A terminal engine settles via
//      terminalFor; an engine-cancelled run on a plain 'running' task repairs through
//      running->cancel_requested->cancelled (reconcileTasks §C's own two-step shape — a direct
//      running->cancelled jump is not itself legal in the wake/close_prep matrix either).

import { terminalFor } from "./reconciler.mjs";
import { TaxonomyHaltError } from "./relay.mjs";
import { recordTaskDeadLetter, readDeadLetterAttempts, WAKE_ENGINE_ENQUEUE_CONSUMER } from "./wake-engine.mjs";

const GRACE_REENQUEUE = process.env.CLARA_RECONCILE_GRACE || "15 seconds";

function isLeaderHalt(err) {
  return err instanceof TaxonomyHaltError || !!err?.halt;
}

/** Resolve a stuck row's own wake-engine source (by event_type for kind='wake', by task_kind
 *  for a direct_queue kind) — null only if the source ROW ITSELF has since been dropped
 *  (deleted from the registry). M2 (Codex review): this deliberately does NOT filter on
 *  `enabled` — a task in this belt was already LEGITIMATELY claimed while its source was
 *  enabled (the claim transaction's own fresh enabled-recheck, wake-engine.mjs's M2 half,
 *  proves that); a disable stops NEW claims, it does not retroactively abandon in-flight work.
 *  Filtering on enabled here made a mid-flight disable strand an already-running task FOREVER
 *  — invisible, never dead-lettered, never retried (the exact defect this fix closes). The
 *  claimed-but-disabled recovery contract is: VISIBLE (this function still resolves it) and
 *  NEVER STRANDED (re-enqueue/settle proceeds to completion regardless of current enabled
 *  state) — proven by a dedicated battery cell. */
async function resolveSource(client, taskRow) {
  if (taskRow.kind === "wake") {
    // Not filtered on `enabled` (M2, see above) -- deliberately admits a since-disabled source
    // so a claimed-but-disabled task is still recoverable. This means MORE than one row can
    // legally match the same event_type over a registry's lifetime (an old disabled source and
    // its later replacement, e.g.) -- ORDER BY makes the pick DETERMINISTIC and semantically the
    // best available answer, rather than whatever order Postgres happens to return with no
    // ORDER BY at all: prefer a currently-ENABLED source (the live, authoritative answer for
    // this event_type today) and, among ties or if none is enabled, the MOST RECENTLY
        // registered one (closest in time to whichever source this task was actually claimed
    // under). Found reproducing M6 in the full-file battery, not a review finding: every
    // wake_outbox test in this file registers a source sharing ONE global event_type constant,
    // and none of them ever delete their own row -- by the time a later test's assertions
    // depend on WHICH source answers, several disabled-or-superseded rows already share the
    // same event_type, and `.rows[0]` with no ORDER BY was silently arbitrary. N3 (round-5,
    // opus NOTE): created_at alone can still tie WITHIN one transaction (multiple sources
    // registered inside the same commit share one statement-clock timestamp) -- source_key
    // (the table's own primary key, always unique) is the tertiary tiebreak, so the pick is
    // fully deterministic even then, never re-arbitrary at the next tie level down.
    const r = await client.query(
      `select s.source_key, s.workflow_export, s.max_attempts
         from clara.agent_tasks at
         join clara.wake_intents wi on wi.id = at.origin_intent_id
         join clara.domain_events de on de.id = wi.event_id
         join clara.wake_engine_sources s on s.event_type = de.event_type and s.carrier = 'wake_outbox'
        where at.id = $1
        order by s.enabled desc, s.created_at desc, s.source_key desc`,
      [taskRow.id],
    );
    return r.rows[0] ?? null;
  }
  // NOTE-a (opus, round-4 review): the SAME ambiguity resolveSource's wake-kind branch already
  // fixed above applies equally here — a direct_queue task_kind can have more than one
  // registered source row over a registry's lifetime (an old disabled one, a later
  // replacement), and an unordered `.rows[0]` was just as arbitrary. Same ORDER BY, same
  // reasoning: prefer the currently-enabled source, then the most recently registered, then
  // (N3, round-5) source_key as the deterministic tertiary tiebreak.
  const r = await client.query(
    `select source_key, workflow_export, max_attempts from clara.wake_engine_sources
      where task_kind = $1 and carrier = 'direct_queue'
      order by enabled desc, created_at desc, source_key desc`,
    [taskRow.kind],
  );
  return r.rows[0] ?? null;
}

/** §A — running-with-no-run past grace: re-mint + re-enqueue. Own txn per row (mirrors
 *  reconcileTasks §A's isolation — one un-enqueueable row must never block the rest).
 *  S1 (Codex review): the grace window keys off `updated_at`, NOT `created_at`. A held row can
 *  sit for a long time before its source enables (created_at stays old the whole while) — keying
 *  grace off created_at meant a task claimed only SECONDS ago (held->running, an old row) was
 *  IMMEDIATELY past the grace window on the very next sweep, triggering an unnecessary
 *  re-enqueue before the claim's own enqueue() call had any real chance to bind workflow_run_id
 *  — a repeated DURABLE start() every poll for perfectly healthy claims. `updated_at` is
 *  unconditionally re-stamped by _tf_agent_task_update's own trailing `new.updated_at:=now();`
 *  on EVERY write to the row (including the claim's own held->running UPDATE), so it correctly
 *  reflects "time since this row was last touched", not "time since it was first created". */
async function reenqueueStuckRows(client, deps) {
  const { enqueue, onlyFirm = null, graceInterval = GRACE_REENQUEUE, log = () => {} } = deps;
  let reenqueued = 0;
  let deadLettered = 0;
  if (typeof enqueue !== "function") return { wakeReenqueued: 0, wakeReenqueueDeadLettered: 0 };
  const stuck = await client.query(
    `select id, kind from clara.agent_tasks
      where kind = any(select task_kind from clara.wake_engine_sources)
        and status = 'running' and workflow_run_id is null
        and updated_at < now() - ($1)::interval
        and ($2::uuid is null or firm_id = $2)
      order by updated_at limit 20`,
    [graceInterval, onlyFirm],
  );
  for (const t of stuck.rows) {
    try {
      const source = await resolveSource(client, t);
      if (!source) {
        log(`[reconcile] wake-engine stuck task=${t.id} kind=${t.kind}: source row no longer registered (deleted) — leaving for a future cycle`);
        continue;
      }
      // M6 (opus+Codex review): CHECK attempt history FIRST, before touching enqueue() at all.
      // Pre-fix, enqueue() was attempted UNCONDITIONALLY every sweep — once genuinely
      // exhausted, a settle FAILURE (the _settle_wake_task call itself erroring, e.g. a
      // transient DB error) left the row 'running', so the NEXT sweep re-attempted enqueue()
      // again — wasting budget on a call already proven to keep failing for the SAME reason,
      // and pushing the dead-letter counter arbitrarily past its own cap instead of the cap
      // actually stopping anything. Exhaustion is now STICKY: once recorded, every later sweep
      // skips straight to (re-)settling and never touches enqueue() again — a hard cap in
      // EITHER direction, not just the first time it is reached.
      const priorAttempts = await readDeadLetterAttempts(client, { consumer: WAKE_ENGINE_ENQUEUE_CONSUMER, taskId: t.id });
      if (priorAttempts >= source.max_attempts) {
        try {
          await client.query("select clara._settle_wake_task($1,$2,$3)", [t.id, "failed", "internal"]);
          deadLettered += 1;
          log(`[reconcile] wake-engine task=${t.id} already exhausted (${priorAttempts}/${source.max_attempts}) — re-settling failed (idempotent by _settle_wake_task's own construction), enqueue NOT re-attempted`);
        } catch (settleErr) {
          if (isLeaderHalt(settleErr)) throw settleErr;
          log(`[reconcile] wake-engine settle-retry failed for already-exhausted task=${t.id}: ${settleErr?.message ?? settleErr}`);
        }
        continue;
      }
      try {
        // MUST F: taskId + workflowExport only — never a credential. No mint here.
        await enqueue(source.workflow_export, t.id);
        reenqueued += 1;
      } catch (enqErr) {
        // SHOULD I (opus/Codex review): an enqueue() that never resolves (e.g. a workflow_export
        // the registry does not carry) would otherwise retry FOREVER, every grace window, with
        // no cap and no dead-letter (probed: 1->4 credential-shaped attempts over 3 sweeps pre-
        // MUST-F; post-MUST-F it is a pure infinite-retry, still uncapped). Attempt-cap it
        // through the SAME wake_engine_task_dead_letters home the direct_queue carrier already
        // uses, then settle the task terminally once exhausted — mirrors wake-engine.mjs's own
        // poison-skip shape, never a silent forever-loop.
        const attempts = await recordTaskDeadLetter(client, { consumer: WAKE_ENGINE_ENQUEUE_CONSUMER, taskId: t.id, reason: enqErr?.message ?? String(enqErr) });
        if (attempts >= source.max_attempts) {
          try {
            await client.query("select clara._settle_wake_task($1,$2,$3)", [t.id, "failed", "internal"]);
            deadLettered += 1;
            log(`[reconcile] wake-engine re-enqueue for task=${t.id} exhausted ${source.max_attempts} attempts -> settled failed`);
          } catch (settleErr) {
            if (isLeaderHalt(settleErr)) throw settleErr;
            // M6: the settle itself failed — do NOT re-attempt enqueue on the next sweep. The
            // dead-letter row's attempt_count is already >= max_attempts, so the check-first
            // branch above will catch this task next time and retry ONLY the settle.
            log(`[reconcile] wake-engine settle failed for freshly-exhausted task=${t.id} — will retry the settle-only path next sweep, enqueue will not be attempted again: ${settleErr?.message ?? settleErr}`);
          }
        } else {
          log(`[reconcile] wake-engine re-enqueue failed task=${t.id} attempt=${attempts}/${source.max_attempts}: ${enqErr?.message ?? enqErr}`);
        }
      }
    } catch (err) {
      if (isLeaderHalt(err)) throw err;
      log(`[reconcile] wake-engine re-enqueue failed task=${t.id}: ${err?.message ?? err}`);
    }
  }
  return { wakeReenqueued: reenqueued, wakeReenqueueDeadLettered: deadLettered };
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
      // MUST B (opus/Codex review): the two statements below MUST commit or fail TOGETHER. The
      // pre-fix shape ran them bare (no surrounding txn) — when _settle_wake_task then failed
      // (its own direct_queue bug, fixed separately in the DB migration), the running->
      // cancel_requested UPDATE had ALREADY committed on its own, converting a perfectly
      // recoverable 'running' row into a PERMANENTLY STRANDED 'cancel_requested' one (proven:
      // reconciler-wake:124 was doing exactly this). Wrapping in begin/rollback means a settle
      // failure now leaves the row exactly as it started — 'running', retried cleanly next sweep
      // — never a partial, unrecoverable state.
      try {
        await client.query("begin");
        await client.query("update clara.agent_tasks set status = 'cancel_requested', updated_at = now() where id = $1 and status = 'running'", [t.id]);
        await client.query("select clara._settle_wake_task($1,$2,$3)", [t.id, "cancelled", null]);
        await client.query("commit");
        out.wakeSettled += 1;
      } catch (err) {
        try {
          await client.query("rollback");
        } catch {
          /* aborted/dead */
        }
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
