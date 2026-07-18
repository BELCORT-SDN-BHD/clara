// The single-leader loop (Slice 4, contract §4.1/§4.5-4.7). ONE dedicated
// clara_runtime connection holds the 'router' advisory lock and, each cycle, runs
// all three leader-guarded phases in order:
//   1. routing  — domain_events -> wake_intents        (lib/relay.mjs, Slice 3)
//   2. drain    — wake_intents -> agent_tasks + outbox  (lib/drain.mjs)
//   3. reconcile — converge task rows with engine truth + expiry + prune (reconciler)
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
import { runReconcilerSweep, heartbeat } from "./reconciler.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

const POLL_INTERVAL_MS = Number(process.env.CLARA_LEADER_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const PRUNE_EVERY = Number(process.env.CLARA_LEADER_PRUNE_EVERY || 50);

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
            await runReconcilerSweep(client, { ...deps, prune: iteration % PRUNE_EVERY === 0 });
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
