// The control listener (Slice 4, contract §3.3 / §4.3). It carries two duties,
// both driven by LISTEN clara_runtime_ctl PLUS a poll — the POLL is the delivery
// guarantee (a dropped NOTIFY can never strand a resume; the listen only makes it
// timely):
//
//   1. LEASED interruption delivery (S4-D2). A clarify that has reached a terminal
//      status (answered / expired / cancelled) but is not yet delivered is LEASED
//      (claim_lease_until = now()+60s) and its WDK hook is resumed. delivered_at is
//      stamped on resume success OR on HookNotFoundError (the engine hook is
//      SINGLE-SHOT — a NotFound after a crashed prior attempt means it was already
//      delivered, S4-P1d). A crashed lease simply expires and is retried, so
//      delivery is exactly-once-or-provably-already-done. The resume happens
//      OUTSIDE any DB transaction (a world call), between two autocommit writes.
//
//   2. cancel_requested settlement. A human cancel of an engine-active task moves
//      it to cancel_requested (§3.2); the runtime then ABORTS the engine run and
//      SETTLES the task to cancelled. Abort-then-settle is crash-safe: a kill
//      between the two is repaired by the reconciler (both are idempotent).
//
// Pure, injectable logic (deps: resumeHook + cancelRun from workflow/api, and the
// settle call) so the barrier tests can drive a cycle deterministically with a
// mock world. The long-lived loop (startControlListener) owns one dedicated
// clara_runtime LISTEN connection — the control half of the §4.1 "LISTEN 2".

import { randomUUID } from "node:crypto";
import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { resumeHook as apiResumeHook, getRun as apiGetRun } from "workflow/api";
import { makeRuntimeClient, setRuntimeRoleOn } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";
import { settleTaskTerminal } from "./reconciler.mjs";

/** The control NOTIFY channel (empty-payload nudge — the poll is the guarantee). */
export const CONTROL_CHANNEL = "clara_runtime_ctl";

const LEASE_SECONDS = Number(process.env.CLARA_CTL_LEASE_SECONDS || 60);
const POLL_INTERVAL_MS = Number(process.env.CLARA_CTL_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

/** A stable per-process claimant id (host:pid:rand) for lease attribution. */
export const LISTENER_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

/** True iff the error is the engine's single-shot "hook already gone" signal. */
export function isHookNotFound(err) {
  return err != null && (err.name === "HookNotFoundError" || /hook not found/i.test(String(err.message || "")));
}

/** Build the resume payload the workflow's clarify hook awaits, from a row status. */
export function resumePayloadFor(row) {
  if (row.status === "answered") return { kind: "answer", answer: row.answer ?? null };
  if (row.status === "expired") return { kind: "expired" };
  if (row.status === "cancelled") return { kind: "cancelled" };
  // Defensive — never lease a non-terminal row (predicate excludes it), but if we
  // somehow do, surface it as cancelled so the workflow unblocks and settles.
  return { kind: "cancelled" };
}

// ---------------------------------------------------------------------------
// 1. Leased interruption delivery.
// ---------------------------------------------------------------------------

/**
 * Lease up to `batchSize` deliverable interruptions and resume each hook. Returns
 * { leased, delivered }. resumeHook is injected (workflow/api in prod, a mock in
 * tests). The lease UPDATE and the delivered_at UPDATE are separate autocommit
 * statements bracketing the world resume — so a crash between them just re-leases
 * after the TTL and re-delivers (idempotent via the single-shot hook).
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{resumeHook:(token:string,payload:unknown)=>Promise<unknown>, batchSize?:number,
 *          listenerId?:string, onlyFirm?:string|null, log?:(m:string)=>void}} deps
 *   onlyFirm scopes the lease to a single firm (TEST-ONLY, the relay's onlyFirm
 *   precedent — a shared test DB must not deliver other tests' leftovers). Production
 *   leaves it null: one runtime delivers for the whole cluster.
 */
export async function deliverInterruptions(client, deps) {
  const { resumeHook, batchSize = 20, listenerId = LISTENER_ID, onlyFirm = null, log = () => {} } = deps;
  // onlyFirm is a TEST-SCOPING knob (documented test-only, the relay's onlyFirm
  // precedent) so a test's listener never delivers other tests' leftovers in a
  // shared DB. Production leaves it null → all firms (one runtime for the cluster).
  const leased = await client.query(
    `update clara.agent_interruptions
        set claimed_by = $1, claim_lease_until = now() + ($2 || ' seconds')::interval
      where id in (
        select id from clara.agent_interruptions
         where status in ('answered','expired','cancelled')
           and delivered_at is null
           and (claim_lease_until is null or claim_lease_until < clock_timestamp())
           and ($4::uuid is null or firm_id = $4)
         order by created_at
         limit $3
         for update skip locked
      )
      returning id, hook_token, status, answer`,
    [listenerId, String(LEASE_SECONDS), batchSize, onlyFirm],
  );
  let delivered = 0;
  for (const row of leased.rows) {
    const payload = resumePayloadFor(row);
    try {
      await resumeHook(row.hook_token, payload);
    } catch (err) {
      if (!isHookNotFound(err)) {
        // Transient world error — leave the lease to expire and retry next cycle.
        log(`[control] resume failed interruption=${row.id} (${err?.message ?? err}) — will retry after lease`);
        continue;
      }
      // HookNotFound = already delivered by a prior (crashed) attempt; fall through
      // to stamp delivered_at so we stop retrying it.
    }
    await client.query("update clara.agent_interruptions set delivered_at = now() where id = $1 and delivered_at is null", [row.id]);
    delivered += 1;
  }
  return { leased: leased.rowCount, delivered };
}

// ---------------------------------------------------------------------------
// 2. cancel_requested settlement.
// ---------------------------------------------------------------------------

/**
 * Abort + settle every cancel_requested task. `cancelRun(runId)` aborts the engine
 * run (idempotent — a terminal/absent run is fine); the reconciler's settleTaskTerminal
 * moves the task to cancelled + closes pending interruptions (S4-D6) and lets
 * settle_chat_turn recover any checkpointed work. Abort FIRST, then settle — a crash
 * between them is repaired by the reconciler.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{cancelRun:(runId:string)=>Promise<unknown>, batchSize?:number,
 *          onlyFirm?:string|null, log?:(m:string)=>void}} deps
 *   onlyFirm scopes the scan to one firm (TEST-ONLY; production leaves it null).
 */
export async function processCancellations(client, deps) {
  const { cancelRun, batchSize = 20, onlyFirm = null, log = () => {} } = deps;
  const rows = await client.query(
    `select id, workflow_run_id
       from clara.agent_tasks
      where status = 'cancel_requested'
        and ($2::uuid is null or firm_id = $2)
      order by created_at
      limit $1`,
    [batchSize, onlyFirm],
  );
  let settled = 0;
  for (const t of rows.rows) {
    if (t.workflow_run_id) {
      try {
        await cancelRun(t.workflow_run_id);
      } catch (err) {
        // A run that is already terminal / not found is not an error for us — the
        // task still needs settling below. Log and continue.
        log(`[control] cancelRun(${t.workflow_run_id}) noop/err: ${err?.message ?? err}`);
      }
    }
    await settleTaskTerminal(client, t.id, "cancelled", null);
    settled += 1;
  }
  return { settled };
}

/** One control cycle: deliver interruptions, then settle cancellations. */
export async function runControlCycle(client, deps) {
  const d = await deliverInterruptions(client, deps);
  const c = await processCancellations(client, deps);
  return { ...d, ...c };
}

// ---------------------------------------------------------------------------
// The long-lived listener loop (one dedicated clara_runtime LISTEN connection).
// ---------------------------------------------------------------------------

/**
 * Start the control listener. Resolves an object with stop(). It owns one
 * dedicated LISTEN connection with a reconnect-with-backoff lifecycle; on any
 * connection-level failure it discards the client and re-establishes. Production
 * deps come from workflow/api.
 * @param {{resumeHook:(token:string,payload:unknown)=>Promise<unknown>,
 *          cancelRun:(runId:string)=>Promise<unknown>, log?:(m:string)=>void,
 *          onFatal?:(err:unknown)=>void}} deps
 */
export function startControlListener(deps) {
  const log = deps.log ?? (() => {});
  const stopRef = { stop: false, wake: null };

  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    while (!stopRef.stop) {
      const client = makeRuntimeClient();
      let connErr = null;
      client.on("error", (e) => {
        connErr = e;
      });
      try {
        await client.connect();
        await setRuntimeRoleOn(client); // N10
        await client.query(`listen ${CONTROL_CHANNEL}`);
        log("CONTROL listening");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          try {
            await runControlCycle(client, deps);
            // Liveness beat for /ready (a dead control listener must fail readiness).
            await client.query(
              "insert into clara.runtime_heartbeats (component, beat_at) values ('control', now()) on conflict (component) do update set beat_at = now()",
            );
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`[control] cycle error: ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`[control] connection lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
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

/** Production dependency factory — the real world calls (workflow/api, statically
 *  imported so the enqueue/world API provenance is traceable — freeze-lint). */
export function productionControlDeps(extra = {}) {
  return {
    resumeHook: apiResumeHook,
    cancelRun: async (runId) => apiGetRun(runId).cancel(),
    ...extra,
  };
}
