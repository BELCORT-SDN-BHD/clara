// The single-leader loop (Slice 4, contract §4.1/§4.5-4.7). ONE dedicated
// clara_runtime connection holds the 'router' advisory lock and, each cycle, runs
// all three leader-guarded phases in order:
//   1. routing  — domain_events -> wake_intents        (lib/relay.mjs, Slice 3)
//   2. drain    — wake_intents -> agent_tasks + outbox  (lib/drain.mjs)
//   3. reconcile — converge task rows with engine truth + expiry + prune + the
//      daily autopost-rule expiry sweep (reconciler; Wave A2.1 §7)
// plus a 'world' heartbeat (process-liveness proxy for /ready). A missing/empty
// active taxonomy HALTs the loop and EXITS the process non-zero (crash-only; the
// supervisor / Fly restarts) — an un-routable state is never silently swallowed.
// A relay-leader death must pull HTTP from the LB (S4-ND5): because the loop lives
// in the same process as the HTTP server, its exit takes /ready down with it.

import { setTimeout as sleep } from "node:timers/promises";
import {
  CONSUMER,
  TaxonomyHaltError,
  setRuntimeRole,
  acquireLeaderLock,
  runRelayCycle,
} from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { drainCycle } from "./drain.mjs";
import { runReconcilerSweep } from "./reconciler.mjs";
// Wave E lane ζ. Wired HERE rather than inside runReconcilerSweep for the repo's own module-size
// budget — reconciler.mjs already stands 26 lines over the 500-line file discipline, which is the
// same pressure that split reconciler-sst / -lint / -fa / -adjustments out of it. The two render
// belts run on different cadences anyway (dispatch every fast cycle, enqueue daily), and this is
// where every other cadence decision is already made.
import { reconcileRenderDispatch, reconcileRenderEnqueue } from "./reconciler-render.mjs";
// Wave F Track-A, F-A5b card 1. The sandbox-export queue is a SIBLING job family with its own
// verbs, so it gets its own belt on the SAME fast cadence as the render dispatch half — and for
// the same reason: latency is the feature, and its DB-side cooldown (not this loop) bounds how
// often the machine API is touched. It feature-detects the card-1 migration itself, so a runtime
// image running ahead of the migration boots it dormant.
import { reconcileSandboxDispatch } from "./reconciler-sandbox.mjs";
// FS-4 C-5 item 2 (design part 3 §1 step 6). The applier sweep is what recovers a webhook that
// arrived while the database was unavailable, and what makes the route's post-webhook call
// optional. It rides the LEADER (one sweeper estate-wide, under the lock that already serialises
// every other belt) but NOT the leader's connection: `apply_stripe_events` is granted to
// `clara_stripe_webhook` alone — measured, `clara_runtime` holds EXECUTE on neither webhook door
// — so the belt takes its own checkout from the webhook pool.
import { reconcileStripeEvents, stripeApplyDue } from "./stripe-applier.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

const POLL_INTERVAL_MS = Number(process.env.CLARA_LEADER_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const PRUNE_EVERY = Number(process.env.CLARA_LEADER_PRUNE_EVERY || 50);
// Finite-guarded: junk or non-positive CLARA_AUTOPOST_RECONCILE_HOURS falls back to 24h —
// a NaN here would make the due-check permanently false and silently DISABLE the
// WA2-R10 expiry sweep, the one failure mode this knob must never have.
const AUTOPOST_RECONCILE_HOURS = Number(process.env.CLARA_AUTOPOST_RECONCILE_HOURS);
const AUTOPOST_RECONCILE_MS =
  (Number.isFinite(AUTOPOST_RECONCILE_HOURS) && AUTOPOST_RECONCILE_HOURS > 0 ? AUTOPOST_RECONCILE_HOURS : 24) * 3600000;
// Finite-guarded like the autopost cadence: junk or non-positive CLARA_SST_RECONCILE_MS
// falls back to 24h — a NaN would make the due-check permanently false and silently
// DISABLE the SST repair belt. The DB surfaces stale_evaluator only past 48h, so a 24h
// cadence stays well under that staleness floor.
const SST_RECONCILE_MS_ENV = Number(process.env.CLARA_SST_RECONCILE_MS);
const SST_RECONCILE_MS = Number.isFinite(SST_RECONCILE_MS_ENV) && SST_RECONCILE_MS_ENV > 0 ? SST_RECONCILE_MS_ENV : 24 * 3600000;
// Finite-guarded like the SST cadence: junk or non-positive CLARA_LINT_RECONCILE_MS falls
// back to 24h (WB-R8: "lint daily on the per-client belt") — a NaN here would make the
// due-check permanently false and silently DISABLE the Wave-B wiki lint belt.
const LINT_RECONCILE_MS_ENV = Number(process.env.CLARA_LINT_RECONCILE_MS);
const LINT_RECONCILE_MS = Number.isFinite(LINT_RECONCILE_MS_ENV) && LINT_RECONCILE_MS_ENV > 0 ? LINT_RECONCILE_MS_ENV : 24 * 3600000;
// Finite-guarded like the SST/lint cadence: junk or non-positive CLARA_FA_RECONCILE_MS falls
// back to 24h — a NaN here would make the due-check permanently false and silently DISABLE the
// Wave D-a depreciation-run belt. This gates only the DAILY cadence; reconciler-fa.mjs's own
// feature-detect + per-client depreciation_run_due probe decide whether there is anything to do.
const FA_RECONCILE_MS_ENV = Number(process.env.CLARA_FA_RECONCILE_MS);
const FA_RECONCILE_MS = Number.isFinite(FA_RECONCILE_MS_ENV) && FA_RECONCILE_MS_ENV > 0 ? FA_RECONCILE_MS_ENV : 24 * 3600000;
// Finite-guarded like the SST/lint/FA cadence: junk or non-positive CLARA_ADJ_RECONCILE_MS
// falls back to 24h — a NaN here would make the due-check permanently false and silently
// DISABLE the Wave D-b adjustment-occurrence belt. This gates only the DAILY cadence;
// reconciler-adjustments.mjs's own feature-detect + per-client adjustment_run_due probe
// decide whether there is anything to do.
const ADJ_RECONCILE_MS_ENV = Number(process.env.CLARA_ADJ_RECONCILE_MS);
const ADJ_RECONCILE_MS = Number.isFinite(ADJ_RECONCILE_MS_ENV) && ADJ_RECONCILE_MS_ENV > 0 ? ADJ_RECONCILE_MS_ENV : 24 * 3600000;
// Finite-guarded like every cadence above — a NaN here would make the due-check permanently false
// and silently DISABLE the Wave E lane-ζ render-enqueue fallback, which is the belt that keeps a
// sealed run from sitting without a render job if lane ε's seal has not yet been repointed to
// clara.enqueue_render_job. Gates the DAILY cadence only; reconciler-render.mjs feature-detects
// the migration itself.
const RENDER_ENQUEUE_MS_ENV = Number(process.env.CLARA_RENDER_ENQUEUE_MS);
const RENDER_ENQUEUE_MS = Number.isFinite(RENDER_ENQUEUE_MS_ENV) && RENDER_ENQUEUE_MS_ENV > 0 ? RENDER_ENQUEUE_MS_ENV : 24 * 3600000;

/** True iff the daily autopost-rule expiry sweep is due (pure — the since-last-run
 *  guard; lastRunMs=0 makes the first cycle after (re)boot run it immediately, which
 *  is safe: the DB fn is a state transition + notification-deduped, so an extra run
 *  is a no-op). Wave A2.1 §7 / WA2-R10. */
export function autopostReconcileDue(lastRunMs, nowMs, intervalMs = AUTOPOST_RECONCILE_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

/** True iff the daily SST compliance-watch repair belt is due (pure — the since-last-run
 *  guard; lastRunMs=0 makes the first cycle after (re)boot run it immediately, which is
 *  exactly what catches pre-existing crossings right after the 0016 deploy ceremony —
 *  the evaluator is idempotent recomputation, so an extra run is a no-op). Wave A2.1 §2.2. */
export function sstReconcileDue(lastRunMs, nowMs, intervalMs = SST_RECONCILE_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

/** True iff the daily wiki lint belt is due (pure — the since-last-run guard; lastRunMs=0
 *  makes the first cycle after (re)boot run it immediately, which is exactly what catches
 *  pre-existing conditions right after the 0017 deploy ceremony — run_client_lint/run_lint_all
 *  are idempotent recomputation, so an extra run is a no-op). Wave B design part3 Block L /
 *  L3, WB-R8 (lint daily on the per-client belt, never firm-wide locks). */
export function lintReconcileDue(lastRunMs, nowMs, intervalMs = LINT_RECONCILE_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

/** True iff the daily depreciation-run sweep is due (pure — the since-last-run guard;
 *  lastRunMs=0 makes the first cycle after (re)boot run it immediately, which is safe:
 *  reconciler-fa.mjs feature-detects 0041 itself and per-client depreciation_run_due is
 *  idempotent recomputation, so an extra run is a no-op). Wave D-a §3.4 (WD-R4/R5/R6) —
 *  this predicate only gates CADENCE, never the migration's presence. */
export function depreciationRunDue(lastRunMs, nowMs, intervalMs = FA_RECONCILE_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

/** True iff the daily adjustment-occurrence sweep is due (pure — the since-last-run guard;
 *  lastRunMs=0 makes the first cycle after (re)boot run it immediately, which is safe:
 *  reconciler-adjustments.mjs feature-detects 0045 itself and per-client
 *  adjustment_run_due is idempotent recomputation, so an extra run is a no-op). Wave D-b
 *  §2.3/§2.7 (WD-R8/R9) — this predicate only gates CADENCE, never the migration's
 *  presence. */
export function adjustmentRunDue(lastRunMs, nowMs, intervalMs = ADJ_RECONCILE_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

/** True iff the daily render-ENQUEUE fallback is due (pure — the same since-last-run guard as its
 *  five siblings; lastRunMs=0 runs it on the first cycle after boot, which is safe because
 *  reconciler-render.mjs feature-detects the ζ migration itself and clara.enqueue_missing_render_jobs
 *  is idempotent — a run whose job already exists conflicts on the idempotency key and no-ops).
 *  Wave E lane ζ, design part2 §10. Gates CADENCE only, never the migration's presence.
 *
 *  NB: the render DISPATCH half is NOT on this daily cadence and deliberately so — it runs every
 *  fast cycle, because dispatch latency IS the feature (A33 arm (i) asks for a machine started
 *  "within the leader's stated cadence"). It cannot storm: clara.render_dispatch_begin stamps an
 *  attempt and applies its own cooldown in the database, so the Fly API is touched at most once
 *  per cooldown per job however often this loop spins. */
export function renderEnqueueDue(lastRunMs, nowMs, intervalMs = RENDER_ENQUEUE_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

/**
 * Start the leader loop. Returns { stop, done }. `onHalt` (default process.exit(2))
 * fires on a taxonomy HALT. Deps: { enqueueChatTurn, getRun, log }.
 * @param {{enqueueChatTurn:Function, getRun:Function, log?:Function, onHalt?:(e:Error)=>void}} deps
 */
export function startLeaderLoop(deps) {
  const log = deps.log ?? (() => {});
  const onHalt =
    deps.onHalt ??
    ((err) => {
      log(`LEADER HALT ${err.message} — exiting non-zero for supervision`);
      process.exit(2);
    });
  const stopRef = { stop: false, wake: null };

  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    let iteration = 0;
    let lastAutopostRun = 0; // 0 ⇒ the first cycle after boot runs the daily autopost sweep
    let lastSstRun = 0; // 0 ⇒ the first cycle after boot runs the SST repair belt (catches pre-existing crossings post-0016)
    let lastLintRun = 0; // 0 ⇒ the first cycle after boot runs the wiki lint belt (catches pre-existing conditions post-0017, WB-R8 daily cadence)
    let lastFaRun = 0; // 0 ⇒ first cycle after boot runs the depreciation sweep (reconciler-fa.mjs feature-detects 0041 itself, so a pre-0041 boot is a cheap no-op)
    let lastAdjRun = 0; // 0 ⇒ first cycle after boot runs the adjustment-occurrence sweep (reconciler-adjustments.mjs feature-detects 0045 itself, so a pre-0045 boot is a cheap no-op)
    let lastRenderEnqueueRun = 0; // 0 ⇒ first cycle after boot runs the ζ render-enqueue fallback (reconciler-render.mjs feature-detects the ζ migration itself, so a pre-ζ boot is a cheap no-op)
    let lastStripeApplyRun = 0; // 0 ⇒ first cycle after boot sweeps the Stripe applier, which is exactly what recovers a webhook delivered while this process was down (stripe-applier.mjs feature-detects 0160 and stays dormant without a lane DSN)
    while (!stopRef.stop) {
      const client = makeRuntimeClient();
      let connErr = null;
      client.on("error", (e) => {
        connErr = e;
      });
      try {
        await client.connect();
        await setRuntimeRole(client); // N10
        await acquireLeaderLock(client, CONSUMER); // BLOCKS until leadership
        await client.query("listen clara_events");
        log("LEADER acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const routed = await runRelayCycle(client, { log });
            const drained = await drainCycle(client, { log });
            const autopostDue = autopostReconcileDue(lastAutopostRun, Date.now());
            const sstDue = sstReconcileDue(lastSstRun, Date.now());
            const lintDue = lintReconcileDue(lastLintRun, Date.now());
            const faDue = depreciationRunDue(lastFaRun, Date.now());
            const adjDue = adjustmentRunDue(lastAdjRun, Date.now());
            const swept = await runReconcilerSweep(client, {
              ...deps,
              prune: iteration % PRUNE_EVERY === 0,
              autopostRules: autopostDue,
              sstWatches: sstDue,
              lintBelt: lintDue,
              faRuns: faDue,
              adjRuns: adjDue,
            });
            if (autopostDue && swept.autopostOk) lastAutopostRun = Date.now(); // a failed autopost sweep retries next cycle
            if (sstDue && swept.sstOk) lastSstRun = Date.now(); // a failed SST belt retries next cycle
            if (lintDue && swept.lintOk) lastLintRun = Date.now(); // a failed lint belt retries next cycle
            if (faDue && swept.faOk) lastFaRun = Date.now(); // a failed FA sweep retries next cycle
            if (adjDue && swept.adjOk) lastAdjRun = Date.now(); // a failed adjustment sweep retries next cycle
            // Wave E lane ζ. Both belts isolate their own errors and return flags rather than
            // throwing, so neither can abort this cycle the way the section-I zombie did — but
            // they are ALSO wrapped, because "a sweeper that cannot fail" is a claim, and the
            // reconciler's own history is a list of times that claim was wrong.
            try {
              // Dispatch runs EVERY cycle (latency is the feature); its own DB-side cooldown, not
              // this loop, bounds how often the Fly API is touched. Its result gates no cadence,
              // so it is not carried — the belt logs its own outcome and records it on the rows.
              await reconcileRenderDispatch(client, { log });
              if (renderEnqueueDue(lastRenderEnqueueRun, Date.now())) {
                const enqueued = await reconcileRenderEnqueue(client, { log });
                if (enqueued.renderEnqueueOk) lastRenderEnqueueRun = Date.now(); // a failed belt retries next cycle
              }
            } catch (err) {
              log(`[reconcile] render belt error: ${err?.message ?? err}`); // transient — retry next cycle
            }
            // ITS OWN try/catch, NOT the render belt's. A sandbox-lane failure must not stop a
            // render dispatch that could still start work, and sharing a catch would make the
            // second belt's outcome depend on the first one's — the two queues are independent and
            // their failure modes have to stay independent too.
            try {
              await reconcileSandboxDispatch(client, { log });
            } catch (err) {
              log(`[reconcile] sandbox belt error: ${err?.message ?? err}`); // transient — retry next cycle
            }
            // ITS OWN try/catch, for the reason the sandbox belt states: a Stripe-lane failure
            // must not stop a sandbox dispatch or a render dispatch that could still start work.
            // A failed sweep does NOT stamp lastStripeApplyRun, so it retries on the next cycle
            // rather than waiting out the full minute — a paying customer's firm is on the other
            // end of this belt.
            try {
              if (stripeApplyDue(lastStripeApplyRun, Date.now())) {
                const swept = await reconcileStripeEvents(client, { log });
                if (swept.stripeApplyOk) lastStripeApplyRun = Date.now();
              }
            } catch (err) {
              log(`[reconcile] stripe applier belt error: ${err?.message ?? err}`); // transient — retry next cycle
            }
            // NB: the 'world' heartbeat is NOT written here (S4-AB7b / ND5) — relay
            // leadership must not gate /ready. The engine heartbeat is a dedicated
            // task in the supervisor; the leader only beats 'reconciler' (via the sweep).
            capped = routed.capped || drained.capped;
            iteration += 1;
          } catch (err) {
            if (err instanceof TaxonomyHaltError || err?.halt) {
              onHalt(err);
              return;
            }
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`LEADER cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`LEADER connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      } finally {
        await client.end().catch(() => {});
      }
    }
  })();

  return {
    stop: async () => {
      stopRef.stop = true;
      if (stopRef.wake) stopRef.wake();
      await loop.catch(() => {});
    },
    done: loop,
  };
}
