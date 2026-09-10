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
import { settleCancelledByKind } from "./reconciler.mjs";

/** The control NOTIFY channel (empty-payload nudge — the poll is the guarantee). */
export const CONTROL_CHANNEL = "clara_runtime_ctl";

const LEASE_SECONDS = Number(process.env.CLARA_CTL_LEASE_SECONDS || 60);
const POLL_INTERVAL_MS = Number(process.env.CLARA_CTL_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
/** How many times ONE resume attempt may renew its own lease before it is abandoned. The bound is
 *  what makes a hung world call a bounded fault instead of a stalled listener: after this many
 *  renewals the attempt is dropped, the lease is left to expire, and the next cycle re-leases the
 *  row for a fresh attempt. */
const MAX_LEASE_RENEWALS = Number(process.env.CLARA_CTL_MAX_LEASE_RENEWALS || 6);

/** A stable per-process claimant id (host:pid:rand) for lease attribution. */
export const LISTENER_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

/** True iff the error is the engine's single-shot "hook already gone" signal. */
export function isHookNotFound(err) {
  return err != null && (err.name === "HookNotFoundError" || /hook not found/i.test(String(err.message || "")));
}

/** WDK "run not found" — the engine forgot a run we still hold an id for. Same predicate
 *  reconciler-work.mjs carries, kept local so this module has no import cycle into it. */
function isRunNotFound(err) {
  const m = String(err?.message ?? err ?? "");
  return /not\s*found/i.test(m) || err?.code === "RUN_NOT_FOUND";
}

/** An instant, as the wire carries it. `pg` hands a timestamptz back as a Date; a WDK resume
 *  payload is JSON, and a Date that round-trips through the engine as `{}` is a fact silently
 *  lost. */
function asInstant(v) {
  return v instanceof Date ? v.toISOString() : v ?? null;
}

/**
 * Build the resume payload the workflow's hook awaits, from a row status.
 *
 * A WORK question (#629) carries its OWN IDENTITY into the run: which question, which VERSION, and
 * on whose authority the answer was accepted. `claraWork_v2`'s `recheckAuthorityStep` re-reads that
 * human's CURRENT membership before continuing, and it cannot re-read a human the payload never
 * named. A CHAT clarify keeps exactly the payload it had before 0180 — chatTurn's frozen resume
 * body reads `{kind, answer}` and nothing else, and widening it would be a change to a closure this
 * ticket does not own.
 */
export function resumePayloadFor(row) {
  if (row.status === "answered") {
    if (row.work_id) {
      return {
        kind: "answer",
        answer: row.answer ?? null,
        question_id: row.id,
        question_version: row.question_version ?? null,
        answered_by: row.answered_by ?? null,
        answered_role: row.answered_role ?? null,
        answered_at: asInstant(row.answered_at),
      };
    }
    return { kind: "answer", answer: row.answer ?? null };
  }
  if (row.status === "expired") return { kind: "expired" };
  if (row.status === "cancelled") return { kind: "cancelled" };
  // Defensive — never lease a non-terminal row (predicate excludes it), but if we
  // somehow do, surface it as cancelled so the workflow unblocks and settles.
  return { kind: "cancelled" };
}

// ---------------------------------------------------------------------------
// Deploy-order capability probe.
// ---------------------------------------------------------------------------

/**
 * TRUE once `clara.agent_interruptions` carries #629's delivery columns.
 *
 * THIS PROBE IS NOT DEFENSIVENESS, IT IS THE DEPLOY-ORDER LAW. A statement naming a column that
 * does not exist fails at PARSE time, so a single query text mentioning `delivery_state` would make
 * a runtime image that starts ahead of migration 0180 fail to deliver ANY interruption — chat
 * clarifies included. workflows/registry.ts states the standard this package holds itself to: a
 * wrong order must leave Clara refusing the thing it offered to do, never breaking the things it
 * already did. So the pre-0180 query text is kept, verbatim, and chosen by a probe.
 *
 * Memoised only on TRUE: a database gains the columns exactly once and never loses them, while a
 * FALSE answer must stay re-askable so a long-lived process picks the new lane up after the
 * migration lands instead of needing a restart.
 */
let workQuestionColumnsPresent = false;
export async function hasWorkQuestionColumns(client) {
  if (workQuestionColumnsPresent) return true;
  const r = await client.query(
    `select count(*)::int as n from information_schema.columns
      where table_schema = 'clara' and table_name = 'agent_interruptions'
        and column_name in ('work_id','question_version','answered_role','delivery_state','delivery_attempts')`,
  );
  workQuestionColumnsPresent = (r.rows[0]?.n ?? 0) === 5;
  return workQuestionColumnsPresent;
}

/** TEST-ONLY fault injection, read at CALL time and only under RELAY_TEST_MODE=1 — the exact
 *  posture claraWork.v1.tools.ts's own `workTestFault` documents and for the same reason: a
 *  production process cannot be talked into these branches by a late environment mutation. */
export function controlTestFault(env = process.env) {
  if (env.RELAY_TEST_MODE !== "1") return null;
  const fault = env.CLARA_WORK_TEST_FAULT;
  return typeof fault === "string" && fault.length > 0 ? fault : null;
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
  const {
    resumeHook, getRun, batchSize = 20, listenerId = LISTENER_ID, onlyFirm = null, log = () => {},
    leaseSeconds = LEASE_SECONDS, maxLeaseRenewals = MAX_LEASE_RENEWALS,
  } = deps;
  const modern = await hasWorkQuestionColumns(client);
  // onlyFirm is a TEST-SCOPING knob (documented test-only, the relay's onlyFirm
  // precedent) so a test's listener never delivers other tests' leftovers in a
  // shared DB. Production leaves it null → all firms (one runtime for the cluster).
  //
  // THE MODERN PREDICATE EXCLUDES `delivery_state = 'hook_missing'`. Such a row has already been
  // reconciled against real run state and found unreachable: re-leasing it every poll would spend
  // an attempt for ever on a hook that can never fire, and hide the fact from the Work reconciler,
  // which is the belt that settles such a Work `expired` (recoverable).
  const leased = modern
    ? await client.query(
        `update clara.agent_interruptions
            set claimed_by = $1, claim_lease_until = now() + ($2 || ' seconds')::interval,
                delivery_state = 'leased', delivery_attempts = delivery_attempts + 1
          where id in (
            select id from clara.agent_interruptions
             where status in ('answered','expired','cancelled')
               and delivered_at is null
               and delivery_state <> 'hook_missing'
               and (claim_lease_until is null or claim_lease_until < clock_timestamp())
               and ($4::uuid is null or firm_id = $4)
             order by created_at
             limit $3
             for update skip locked
          )
          returning id, hook_token, status, answer, task_id, work_id, question_version,
                    answered_by, answered_role, answered_at`,
        [listenerId, String(leaseSeconds), batchSize, onlyFirm],
      )
    : await client.query(
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
          returning id, hook_token, status, answer, task_id`,
        [listenerId, String(leaseSeconds), batchSize, onlyFirm],
      );
  let delivered = 0;
  let leaseLost = 0;
  let hookMissing = 0;
  let leaseRenewals = 0;
  let attemptAbandoned = 0;

  /** Stamp delivered — CONDITIONED on this listener still holding a LIVE lease. Zero rows means
   *  the lease expired and somebody else owns this delivery now; counting it here would hide the
   *  other process's own resume behind ours. */
  const stampDelivered = async (row) => {
    const r = await client.query(
      modern
        ? `update clara.agent_interruptions
              set delivered_at = now(), delivery_state = 'delivered'
            where id = $1 and delivered_at is null and claimed_by = $2
              and claim_lease_until > clock_timestamp()`
        : `update clara.agent_interruptions set delivered_at = now()
            where id = $1 and delivered_at is null and claimed_by = $2
              and claim_lease_until > clock_timestamp()`,
      [row.id, listenerId],
    );
    if (r.rowCount === 0) {
      leaseLost += 1;
      log(`[control] lease lost before the delivered stamp interruption=${row.id} — not counted delivered`);
      return false;
    }
    delivered += 1;
    return true;
  };

  for (const row of leased.rows) {
    const payload = resumePayloadFor(row);
    // THE CRASH BARRIER (test mode only). The lease UPDATE above has COMMITTED; the resume has not
    // happened. Exiting here is the only way to produce that window deterministically, and it is
    // the window `work-question-e2e.mjs` leg 3 drives.
    if (row.work_id && controlTestFault() === "exit_before_deliver") {
      log(`[clara-runtime] CLARA_WORK_TEST_FAULT=exit_before_deliver — exiting after the lease, before the resume (question=${row.id})`);
      process.exit(137);
    }
    let hookGone = false;
    try {
      await withLeaseRenewal(client, row, { listenerId, leaseSeconds, maxLeaseRenewals, log, onRenew: () => { leaseRenewals += 1; } },
        () => resumeHook(row.hook_token, payload));
    } catch (err) {
      if (err?.code === "CLARA_ATTEMPT_ABANDONED") {
        attemptAbandoned += 1;
        log(`[control] resume attempt abandoned interruption=${row.id} after ${maxLeaseRenewals} lease renewals — the lease expires and the next cycle retries`);
        continue;
      }
      if (!isHookNotFound(err)) {
        // Transient world error — leave the lease to expire and retry next cycle.
        log(`[control] resume failed interruption=${row.id} (${err?.message ?? err}) — will retry after lease`);
        continue;
      }
      hookGone = true;
    }
    if (!hookGone) {
      await stampDelivered(row);
      continue;
    }
    // ------------------------------------------------------------------
    // HookNotFound. For a WORK question this is NOT delivery — it is a question about the RUN.
    //
    // FOR A CHAT CLARIFY IT STAYS EXACTLY WHAT IT WAS (S4-P1d: the engine hook is single-shot, so
    // a NotFound after a crashed attempt means it was already delivered). That is not deference to
    // a passing test: a chat turn has no Work reconciler, so a `hook_missing` resting state would
    // strand it FOR EVER with nothing to settle it — strictly worse than the assumption. #629
    // retires the assumption exactly where it has a belt to fall back on, and says so rather than
    // pretending the whole estate moved.
    // ------------------------------------------------------------------
    if (!row.work_id) {
      await stampDelivered(row);
      continue;
    }
    const landed = await resumeAlreadyLanded(client, row, { getRun, log });
    if (landed === true) {
      await stampDelivered(row);
      continue;
    }
    if (landed === null) {
      // The run state could not be read. Not knowing is not the same as knowing the hook is gone:
      // decide nothing, let the lease expire, ask again next cycle.
      log(`[control] hook missing but run state unreadable interruption=${row.id} — deciding nothing this cycle`);
      continue;
    }
    if (!modern) {
      // Pre-0180 there is nowhere to REST this fact, and the pre-0180 behaviour is the one the
      // deployed estate already depends on. Keep it verbatim rather than inventing a third.
      await stampDelivered(row);
      continue;
    }
    const r = await client.query(
      `update clara.agent_interruptions
          set delivery_state = 'hook_missing', claimed_by = null, claim_lease_until = null
        where id = $1 and delivered_at is null and claimed_by = $2`,
      [row.id, listenerId],
    );
    if (r.rowCount === 0) {
      leaseLost += 1;
      continue;
    }
    hookMissing += 1;
    log(`[control] hook unreachable and the run never moved on interruption=${row.id} work=${row.work_id ?? "-"} — resting at hook_missing for the Work reconciler`);
  }
  return { leased: leased.rowCount, delivered, leaseLost, hookMissing, leaseRenewals, attemptAbandoned };
}

/**
 * DID THE RESUME ALREADY LAND? Asked ONLY after a HookNotFoundError, and answered from two
 * independent witnesses rather than from the absence of a hook:
 *
 *   * the ENGINE RUN is terminal (completed / failed / cancelled, or forgotten entirely) — a
 *     terminal run consumed or discarded its hook, and there is nothing left to resume;
 *   * the TASK has LEFT `awaiting_input` — the workflow's own `markRunningStep` ran, which happens
 *     only on the resume path, so the answer demonstrably reached the run.
 *
 * `true` = delivered. `false` = the hook is genuinely gone while the run still waits. `null` = the
 * run state could not be read, which is neither, and must not be rounded to either.
 */
async function resumeAlreadyLanded(client, row, { getRun, log = () => {} }) {
  let task;
  try {
    const r = await client.query("select status, workflow_run_id from clara.agent_tasks where id = $1", [row.task_id]);
    task = r.rows[0] ?? null;
  } catch (err) {
    log(`[control] task read failed for interruption=${row.id}: ${err?.message ?? err}`);
    return null;
  }
  if (task === null) return true;                       // no task at all — nothing can still wait
  if (task.status !== "awaiting_input") return true;    // markRunningStep ran, or the run settled
  if (typeof getRun !== "function" || !task.workflow_run_id) return null;
  try {
    const status = await getRun(task.workflow_run_id).status;
    if (status === "completed" || status === "failed" || status === "cancelled") return true;
    return false;                                       // still running, and its hook is gone
  } catch (err) {
    if (isRunNotFound(err)) return true;                // the engine forgot the run entirely
    log(`[control] run status probe failed for interruption=${row.id}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Run `fn` while KEEPING THIS LISTENER'S LEASE ALIVE, and bound the whole attempt.
 *
 * A world resume is an out-of-transaction call of unbounded duration. Before #629 a resume slower
 * than the lease silently lost its claim and then stamped `delivered_at` anyway, because the stamp
 * asked no question. Now the stamp is conditioned on the claim — so the claim has to be kept, and
 * the keeping has to be bounded, or a hung world call would hold a row for ever.
 *
 * The renewal is conditioned on `claimed_by = me` for the same reason the stamp is: a lease this
 * process no longer holds must not be extended out from under whoever took it.
 */
async function withLeaseRenewal(client, row, { listenerId, leaseSeconds, maxLeaseRenewals, log = () => {}, onRenew = () => {} }, fn) {
  let renewals = 0;
  let stopped = false;
  let abandon;
  const abandoned = new Promise((_resolve, reject) => {
    abandon = () => reject(Object.assign(new Error("resume attempt exceeded its lease bound"), { code: "CLARA_ATTEMPT_ABANDONED" }));
  });
  const tick = async () => {
    if (stopped) return;
    if (renewals >= maxLeaseRenewals) {
      stopped = true;
      abandon();
      return;
    }
    renewals += 1;
    try {
      await client.query(
        `update clara.agent_interruptions
            set claim_lease_until = now() + ($2 || ' seconds')::interval
          where id = $1 and claimed_by = $3 and delivered_at is null`,
        [row.id, String(leaseSeconds), listenerId],
      );
      onRenew();
    } catch (err) {
      log(`[control] lease renewal failed interruption=${row.id}: ${err?.message ?? err}`);
    }
  };
  const timer = setInterval(() => { void tick(); }, Math.max(250, Math.floor((leaseSeconds * 1000) / 2)));
  if (typeof timer.unref === "function") timer.unref();
  try {
    return await Promise.race([fn(), abandoned]);
  } finally {
    stopped = true;
    clearInterval(timer);
  }
}

// ---------------------------------------------------------------------------
// 1b. Expiry — the 14-day deadline's enforcer.
// ---------------------------------------------------------------------------

/**
 * Move past-due WORK questions to `expired` through `clara.expire_due_interruptions` (0180), so the
 * parked run is resumed with `{kind:'expired'}` and settles its Work recoverably.
 *
 * MEASURED FINDING, not a design flourish: before 0180 nothing in packages/db or packages/runtime
 * ever moved a past-due `clara.agent_interruptions` row out of `pending`. A Work parked on a
 * question nobody answered stayed `awaiting_input` for ever — the question unanswerable (the answer
 * door refuses past its deadline), the run parked on a live hook, and no surface able to say so.
 *
 * A clean no-op on a database without 0180: the verb does not exist there, and the probe says so
 * before any statement naming it is parsed.
 */
export async function expirePastDueInterruptions(client, deps = {}) {
  const { batchSize = 50, onlyFirm = null, log = () => {} } = deps;
  if (!(await hasWorkQuestionColumns(client))) return { expired: 0 };
  try {
    const r = await client.query("select clara.expire_due_interruptions($1::int, $2::uuid) as r", [batchSize, onlyFirm]);
    const out = r.rows[0]?.r ?? { expired: 0 };
    if ((out.expired ?? 0) > 0) log(`[control] expired ${out.expired} past-due work question(s)`);
    return out;
  } catch (err) {
    log(`[control] expiry sweep failed: ${err?.message ?? err}`);
    return { expired: 0 };
  }
}

// ---------------------------------------------------------------------------
// 2. cancel_requested settlement.
// ---------------------------------------------------------------------------

/**
 * Abort + settle every cancel_requested task. `cancelRun(runId)` aborts the engine
 * run (idempotent — a terminal/absent run is fine); `settleCancelledByKind` moves the
 * task to its kind's own terminal state and closes pending interruptions (S4-D6).
 * Abort FIRST, then settle — a crash between them is repaired by the reconciler.
 *
 * TWO THINGS THIS LOOP LEARNED FROM #623's REVIEWED FINDING R2, and both of them are
 * about a raise that had nowhere to go:
 *
 *   1. IT DISPATCHES BY KIND. It used to call `settleTaskTerminal` — i.e.
 *      `clara.settle_chat_turn` — for EVERY cancel_requested row, and that verb raises
 *      CLR10 ('settle_chat_turn is for chat turns only') the instant the kind is not
 *      `chat_turn`. reconciler.mjs's sweep learned this in 2026-07-31's Section-I zombie
 *      and grew a kind dispatch; this listener never did, so an `accounting_work` (or
 *      autodraft, or wake) cancel raised here instead. It now shares the reconciler's
 *      ONE dispatch rather than carrying a second copy that can fall a kind behind.
 *   2. IT ISOLATES PER ROW. The raise above escaped `processCancellations` →
 *      `runControlCycle`, so ONE unsettleable row also killed the interruption delivery
 *      that runs beside it AND the `control` heartbeat that `/ready` reads — every poll,
 *      for as long as the row existed. A settle failure is now one logged, COUNTED row and
 *      the cycle carries on, exactly as reconcileTasks' own cancel loop does.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{cancelRun:(runId:string)=>Promise<unknown>, batchSize?:number,
 *          onlyFirm?:string|null, log?:(m:string)=>void}} deps
 *   onlyFirm scopes the scan to one firm (TEST-ONLY; production leaves it null).
 * @returns {Promise<{settled:number, settleFailed:number}>}
 */
export async function processCancellations(client, deps) {
  const { cancelRun, batchSize = 20, onlyFirm = null, log = () => {} } = deps;
  // `kind` rides the select for the same reason reconciler.mjs's cancel query carries it: the
  // settle cannot be chosen without it. Nothing else is joined here — the accounting arm reads
  // the Work's own row from inside the dispatch so this statement stays parseable against a
  // database that has not run migration 0178 yet.
  const rows = await client.query(
    `select id, kind, workflow_run_id
       from clara.agent_tasks
      where status = 'cancel_requested'
        and ($2::uuid is null or firm_id = $2)
      order by created_at
      limit $1`,
    [batchSize, onlyFirm],
  );
  let settled = 0;
  let settleFailed = 0;
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
    try {
      await settleCancelledByKind(client, t);
      settled += 1;
    } catch (err) {
      settleFailed += 1;
      log(`[control] cancel-settle failed task=${t.id} kind=${t.kind}: ${err?.message ?? err}`);
    }
  }
  return { settled, settleFailed };
}

/** One control cycle: expire past-due questions, deliver interruptions, then settle cancellations.
 *
 *  EXPIRY RUNS FIRST, and the order is load-bearing rather than alphabetical: a question that just
 *  became past due is moved to `expired` and then delivered as `{kind:'expired'}` IN THE SAME
 *  CYCLE, so the parked run settles recoverably within one poll instead of two. */
export async function runControlCycle(client, deps) {
  const e = await expirePastDueInterruptions(client, deps);
  const d = await deliverInterruptions(client, deps);
  const c = await processCancellations(client, deps);
  // Built field by field rather than spread: the parts-parity census refuses an unclassifiable
  // object spread anywhere under packages/runtime (claraWork.v1.tools.ts states the same rule at
  // its own read-failure payload), and a third arm made this one unclassifiable.
  return {
    expired: e.expired ?? 0,
    leased: d.leased,
    delivered: d.delivered,
    leaseLost: d.leaseLost,
    hookMissing: d.hookMissing,
    leaseRenewals: d.leaseRenewals,
    attemptAbandoned: d.attemptAbandoned,
    settled: c.settled,
    settleFailed: c.settleFailed,
  };
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
    // #629: the delivery path asks the ENGINE whether a resume already landed before it treats a
    // missing hook as a delivered answer. Passing the same `getRun` reconciler.mjs is wired with
    // keeps the two belts reading one witness rather than two.
    getRun: apiGetRun,
    ...extra,
  };
}
