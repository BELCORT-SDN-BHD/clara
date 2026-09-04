// H-48 — the PER-LANE boot probe.
//
// THE DEFECT THIS CLOSES. `assertProductionPoolConfig` (pools.mjs) is a truthiness loop over
// env NAMES — `if (!process.env[v]) throw`. It never opens a connection. So a DSN that is
// PRESENT but points at the wrong host, carries a stale password, or names a role whose LOGIN
// was never flipped boots the runtime green and fails at FIRST USE: for the bank lane that is
// "whenever bank_agent first runs", for the write lane "the first coding act", for the freeform
// lane "the first chat question about the books". `/ready` did not close the gap either —
// `checkReadiness` made exactly ONE round trip, through `withRuntime`, so `checks.db.ok` meant
// "the runtime pool answered" and nothing more. Six other logins were never touched by
// readiness at all.
//
// WHAT THIS DOES. For each lane whose DSN is CONFIGURED, open ONE short-lived dedicated client,
// issue that lane's own `set role` (N10 — AFTER the role, so a missing GRANT surfaces, which is
// the entire point), run `select 1`, and end. Per lane: `{lane, ok, latency_ms}` or
// `{lane, ok:false, error:<sanitized code>}`; for a lane with no DSN, `{lane, skipped:true,
// reason:"dsn_not_configured"}`.
//
// FOUR CONSTRAINTS MAKE THIS SAFE RATHER THAN A NEW OUTAGE SOURCE:
//
//   * CONFIGURED, NOT ALL. The bank lane and the two checkout lanes are LAZY BY RULING because
//     their operator ceremonies are gated on later events (pools.mjs's own comments; 0160/0161
//     ship both checkout logins NOLOGIN). An unconfigured lane reports `skipped`, never an
//     error — otherwise /ready goes red the moment this ships.
//   * WARN, NOT FAIL, FOR EVERY LANE EXCEPT `runtime`. A dead read/write/freeform/bank/checkout
//     lane DEGRADES the product; it is not "nothing works", which is the only thing the /ready
//     contract fails on. Only the runtime lane joins the existing failure set, and it joins the
//     one that was already there — a dead runtime pool is `checks.db.ok === false` today.
//   * ITS OWN CLIENT, NEVER THE POOL. Probing through `getBankPool()` would CONSTRUCT the lazy
//     pool and defeat the lazy posture; probing through a checkout would contend for a pooled
//     connection under load. A dedicated client that is opened and ended is neither.
//   * OFF /READY'S LATENCY BUDGET ENTIRELY, NOT MERELY BOUNDED WITHIN IT — see below. This is
//     the storage-probe posture, and it is here because the first cut of this file got it
//     wrong in exactly the way lib/storage-probe.mjs's own header warns about.
//
// WHY THIS RUNS IN THE BACKGROUND (review-558 MAJOR-1, and the defect was real).
//
// The first cut called `probeLanes()` from `checkReadiness` inside health.mjs's `bounded()`
// wrapper. `bounded` spends READY_DEADLINE_MS = 5000 PER CALL, SEQUENTIALLY, and there were
// already two such calls — the main DB round trip and the intake snapshot — while
// `fly.toml`'s `/ready` check allows a TOTAL of 5s. So H-48's own headline case, a lane whose
// DSN names a host that BLACK-HOLES rather than refuses, made the probe spend its full ~3s and
// pushed the whole response past fly's timeout: the operator would have got a timed-out health
// check INSTEAD of the `pool lane 'x' unreachable` warning this feature exists to give. The
// feature would have removed the signal it was built to add.
//
// `lib/storage-probe.mjs` had already met and solved this, and says so in its own header: "a
// THIRD sequential network round trip here, even bounded to a 'few seconds', could eat most of
// the remaining budget." That file is imported two lines above this one in health.mjs.
//
// So `laneProbeHealth()` is SYNCHRONOUS: it returns the last known verdict from memory, ~0ms,
// every time. A background interval — started lazily on first use, unref'd so it never keeps
// the process alive, never overlapping itself — refreshes that verdict every
// CLARA_LANE_PROBE_INTERVAL_MS (default 30s). Each cycle probes the lanes CONCURRENTLY, each
// lane bounded at CLARA_LANE_PROBE_TIMEOUT_MS (default 3s), and the whole cycle is bounded
// again at CLARA_LANE_PROBE_CYCLE_MS (default 5s) so a hung lane can never wedge the loop.
// This also removes the connection-storm hazard the old TTL cache existed to bound: seven
// connections every 30s on a fixed cadence, never one burst per /ready poll.
//
// A COLD CACHE READS `pending`, NEVER BLOCKS, AND NEVER FAILS READINESS. A fresh boot has no
// evidence of a problem, so the first /ready before the first cycle settles reports
// `checks.pools = {pending: true}` with no warnings — and, critically, `runtimeLaneFailed` is
// FALSE while pending, so an unmeasured lane can never 503 a healthy machine. A SINGLE pending
// sample is therefore NOT a statement that the lanes are healthy; it says only that they have
// not been measured yet. Read the second poll.
//
// AND `pending` IS NOT LEFT AMBIGUOUS FOREVER. A cycle that blows its hard bound resets the
// verdict to null, i.e. back to `pending` — so a loop that keeps timing out would have read
// identically to "not measured yet", indefinitely, with /ready saying nothing (review-558 r2:
// absence is not evidence). `laneProbeHealth()` therefore also reports `stalled`, true once
// TWO intervals have passed since the loop LAST SETTLED a cycle (or since it started, before
// the first one), and /ready turns that into a WARNING — never a readiness failure, because a
// stalled INSTRUMENT is not a broken lane. The reference point matters: measured from loop
// START, a single blown cycle after hours of healthy ones would report a stall that never
// happened (review-558 r3).
//
// THE STALENESS THIS BUYS IS BOUNDED AND ALREADY THE HOUSE CONTRACT. A cached runtime-lane
// failure can flip `ready` false on a reading up to one interval old — the same shape the
// world/control heartbeat checks already have (HEARTBEAT_STALE_MS, also 30s). And live
// liveness is NOT weakened: `checks.db` still measures the runtime pool on the request path
// every poll. What this probe uniquely proves is that each DEDICATED LOGIN connects and its
// SET ROLE succeeds (N10) — a configuration property, which a fixed cadence serves properly.
//
// NEVER THE DSN. A lane's identity in the output is its NAME and its LOGIN name; a failure
// carries only a SANITIZED libpq code (the pool-error contract's own sanitizer). The full error
// is logged server-side. /ready is unauthenticated — the same reason lib/health.mjs's opening
// contract forbids raw DB text there.

import pg from "pg";
import { connConfig, assertNoTargetSplit } from "./relay.mjs";
import { sanitizedErrorCode } from "./pool-error-contract.mjs";
import { POOLS_LANE_DESCRIPTORS } from "./pools.mjs";
import { FREEFORM_DSN_VAR, FREEFORM_LOGIN, FREEFORM_ROLE } from "./freeform-read.mjs";
import {
  STRIPE_WEBHOOK_DSN_VAR,
  STRIPE_WEBHOOK_LOGIN,
  STRIPE_WEBHOOK_ROLE,
  AUTH_WALL_DSN_VAR,
  AUTH_WALL_LOGIN,
  AUTH_WALL_ROLE,
} from "./checkout-pools.mjs";

const TEST_MODE = process.env.RELAY_TEST_MODE === "1";

/** The lane whose failure is a READINESS FAILURE. Every other lane warns. */
export const READINESS_CRITICAL_LANE = "runtime";

function finiteEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const PROBE_TIMEOUT_MS = finiteEnv("CLARA_LANE_PROBE_TIMEOUT_MS", 3000);
/** How often the background loop re-probes. Floor 1000ms: this value FEEDS setInterval, so a
 *  smaller one would be a sustained connection hot loop driven by a health check. */
function intervalMs() {
  const n = Number(process.env.CLARA_LANE_PROBE_INTERVAL_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 30_000;
}
/** A hard bound on a WHOLE cycle, so a hung lane can never wedge the interval loop itself —
 *  belt and braces over the per-lane bound, which is the thing that should normally stop it. */
function cycleMs() {
  const n = Number(process.env.CLARA_LANE_PROBE_CYCLE_MS);
  return Number.isFinite(n) && n > 0 ? n : 5_000;
}

/**
 * The full seven-lane roster: this runtime's four `pools.mjs` lanes (derived there from the
 * same private mapping the pools themselves use), plus the freeform lane and the two checkout
 * lanes, composed from THEIR OWN exported constants. Nothing here re-types a login, a role or a
 * DSN variable name — "spelling is not identity", and a roster that spells its members itself
 * is a second source of truth that drifts.
 */
export const LANE_ROSTER = Object.freeze([
  ...POOLS_LANE_DESCRIPTORS,
  Object.freeze({ lane: "freeform", dsnVar: FREEFORM_DSN_VAR, login: FREEFORM_LOGIN, role: FREEFORM_ROLE, eager: true }),
  Object.freeze({ lane: "stripe_webhook", dsnVar: STRIPE_WEBHOOK_DSN_VAR, login: STRIPE_WEBHOOK_LOGIN, role: STRIPE_WEBHOOK_ROLE, eager: false }),
  Object.freeze({ lane: "auth_wall", dsnVar: AUTH_WALL_DSN_VAR, login: AUTH_WALL_LOGIN, role: AUTH_WALL_ROLE, eager: false }),
]);

/**
 * Is there a base (non-lane) connection source at all? In RELAY_TEST_MODE the pools fall back
 * to the base env identity and rely on the per-checkout SET ROLE (pools.mjs `loginConfig`), so
 * a rig with no per-lane DSNs still has every lane genuinely reachable — and the probe should
 * say so rather than report seven skips.
 */
function hasBaseConnectionSource() {
  const { DATABASE_URL, WORKFLOW_POSTGRES_URL, PGHOST, PGPORT, PGDATABASE, PGUSER } = process.env;
  return Boolean(DATABASE_URL || WORKFLOW_POSTGRES_URL || PGHOST || PGPORT || PGDATABASE || PGUSER);
}

/**
 * Is this lane configured enough to be probed HONESTLY? Mirrors `loginConfig`'s own branching:
 * a lane DSN always counts; in test mode the base identity counts too.
 *
 * `opts.testMode` is an EXPLICIT seam because `TEST_MODE` is read at MODULE LOAD, as it is in
 * pools.mjs. A cell that deleted `RELAY_TEST_MODE` from the environment to reach the production
 * branch therefore changed nothing — and passed alone while failing inside the full suite,
 * where `tests/rig.mjs` sets that variable before this module loads. Measured, not theorised.
 * Production never passes it, so the production read is byte-unchanged.
 * @param {{dsnVar:string}} descriptor
 * @param {{testMode?:boolean}} [opts]
 */
export function laneConfigured(descriptor, opts = {}) {
  if (process.env[descriptor.dsnVar]) return true;
  const testMode = opts.testMode ?? TEST_MODE;
  return testMode && hasBaseConnectionSource();
}

/**
 * Probe ONE lane. Never throws — every failure becomes a sanitized result, because a probe that
 * throws would take the readiness aggregation with it.
 * @param {{lane:string, dsnVar:string, login:string, role:string}} descriptor
 * @param {{timeoutMs?:number, testMode?:boolean}} [opts]
 * @returns {Promise<{lane:string, ok?:boolean, latency_ms?:number, error?:string, skipped?:boolean, reason?:string}>}
 */
export async function probeLane(descriptor, opts = {}) {
  if (!laneConfigured(descriptor, opts)) {
    return { lane: descriptor.lane, skipped: true, reason: "dsn_not_configured" };
  }
  const budget = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : PROBE_TIMEOUT_MS;
  const started = Date.now();
  let client = null;
  let timer;
  try {
    assertNoTargetSplit(); // the same fail-closed canonical-target guard every pool opens behind
    const dsn = process.env[descriptor.dsnVar];
    // Assembled BY ASSIGNMENT, not by spread: check-parts-parity.mjs refuses any object spread
    // under packages/runtime outside tests/ (its census cannot tell a config literal from a
    // typed parts[] member, so it fails closed). checkout-pools.mjs states the same reason.
    const config = { connectionTimeoutMillis: budget };
    const base = dsn ? dsn : connConfig().connectionString;
    if (base) config.connectionString = base;
    client = new pg.Client(config);
    // A dedicated client emits 'error' on a mid-probe backend death; with no listener that
    // would be an uncaughtException — the very class 裁-149 exists to close. Swallowed here on
    // purpose: the awaited query below rejects with the same fault and IS the reported result.
    client.on("error", () => {});
    const work = (async () => {
      await client.connect();
      await client.query(`set role ${descriptor.role}`); // N10 — AFTER the role, so a missing grant surfaces
      await client.query("select 1");
    })();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("__lane_probe_deadline__"), { code: "probe_timeout" })), budget);
    });
    await Promise.race([work, deadline]);
    return { lane: descriptor.lane, ok: true, latency_ms: Date.now() - started };
  } catch (err) {
    // Server-side only: the full message (which may name a host or a role) never leaves here.
    console.error(`[clara-runtime] lane probe FAILED lane=${descriptor.lane} login=${descriptor.login}:`, err?.message ?? err);
    return { lane: descriptor.lane, ok: false, latency_ms: Date.now() - started, error: sanitizedErrorCode(err) };
  } finally {
    if (timer) clearTimeout(timer);
    if (client) await client.end().catch(() => {});
  }
}

/**
 * Probe every configured lane CONCURRENTLY. Pure with respect to the cache — the background
 * loop below owns the caching; this function just runs one cycle.
 *
 * `opts.probe` is a TEST SEAM only (production always uses `probeLane`): concurrency is a
 * property of this function, and proving it against a real socket would need a host that hangs
 * rather than refuses — a cell that passes for the wrong reason on a network that answers fast.
 * An injected prober makes the overlap deterministic and the cell discriminating.
 * @param {{timeoutMs?:number, testMode?:boolean, roster?:ReadonlyArray<object>, probe?:Function}} [opts]
 * @returns {Promise<Array<{lane:string}>>}
 */
export async function probeLanes(opts = {}) {
  const roster = opts.roster ?? LANE_ROSTER;
  const probe = opts.probe ?? probeLane;
  const settled = await Promise.allSettled(roster.map((d) => probe(d, opts)));
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { lane: roster[i].lane, ok: false, error: "probe_internal_error" },
  );
}

// ---------------------------------------------------------------------------
// The background refresh loop — the storage-probe.mjs machinery, for the reason stated in this
// file's header. NOTHING here ever runs on the /ready request path.
// ---------------------------------------------------------------------------

/** Race `fn()` against a hard deadline; resolves to `onTimeout` if it does not settle in time.
 *  Mirrors storage-probe.mjs's `withHardTimeout` — the timer is unref'd so a pending cycle can
 *  never hold the process open by itself. */
function withHardTimeout(fn, ms, onTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(onTimeout);
    }, ms);
    timer.unref?.();
    fn().then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

// PENDING until the first cycle settles: a fresh boot has no evidence of a problem, and an
// UNMEASURED lane must never 503 a healthy machine (see the header).
let cachedLanes = null;
let intervalHandle = null;
let inFlight = null;
let busy = false;
let probeOverride = null; // test seam only; production is always null
let loopStartedAt = 0;
let lastSettledAt = 0;

async function refreshOnce() {
  // NEVER a fresh no-op promise while a cycle is running (review-558 r2 NIT): returning the
  // IN-FLIGHT one keeps `inFlight` pointing at real work, so a waiter cannot await a promise
  // that resolves immediately and then read a verdict the cycle has not written yet.
  if (busy) return inFlight;
  busy = true;
  try {
    const run = () => probeLanes(probeOverride ? { probe: probeOverride } : {});
    // A cycle that blows its own hard bound reports every lane as unknown rather than freezing
    // the previous verdict: a stale green is the one answer worse than "not measured".
    const result = await withHardTimeout(run, cycleMs(), null);
    cachedLanes = result;
    if (Array.isArray(result)) lastSettledAt = Date.now();
  } finally {
    busy = false;
  }
  return undefined;
}

function ensureStarted() {
  if (intervalHandle) return;
  loopStartedAt = Date.now();
  inFlight = refreshOnce();
  intervalHandle = setInterval(() => {
    const started = refreshOnce();
    // Only re-point `inFlight` at a cycle we actually STARTED; a skipped tick returns the
    // in-flight promise, and clobbering with it would be harmless but reassigning a resolved
    // no-op would not be. Keep the invariant explicit rather than incidental.
    if (started !== undefined) inFlight = started;
  }, intervalMs());
  intervalHandle.unref?.();
}

/**
 * SYNCHRONOUS — the last known verdict, ~0ms, no I/O on the calling path. Starts the background
 * loop lazily on first use.
 *
 * `stalled` CLOSES AN ABSENCE-IS-NOT-EVIDENCE HOLE (review-558 r2). A cycle that blows its hard
 * bound sets `cachedLanes` back to null, i.e. back to `pending` — so a probe that keeps timing
 * out read EXACTLY like "not measured yet", forever, and /ready said nothing either way. A
 * reader could not tell an unmeasured lane from a wedged loop. `stalled` is true once the loop
 * has been running for more than TWO intervals with no settled cycle, which /ready turns into a
 * WARNING (never a readiness failure — a stalled INSTRUMENT is not a broken lane).
 * @returns {{pending:boolean, lanes:Array<{lane:string}>, stalled:boolean, since_ms:number|null}}
 */
export function laneProbeHealth() {
  ensureStarted();
  const now = Date.now();
  // THE STALL CLOCK KEYS ON THE LAST SETTLED CYCLE, falling back to loop start only before the
  // first one (review-558 r3). Keying it on `loopStartedAt` alone was wrong in a way that would
  // have printed a false statement: after hours of healthy cycles, ONE blown cycle nulls the
  // verdict, and the loop would have been reported stalled on the very next /ready with a line
  // claiming no cycle had settled in hours — about a loop that settled seconds earlier. The
  // question `stalled` answers is "how long since this loop last told me anything", and the
  // answer is measured from the last time it did.
  const reference = lastSettledAt || loopStartedAt;
  const sinceMs = reference ? now - reference : null;
  if (!Array.isArray(cachedLanes)) {
    return {
      pending: true,
      lanes: [],
      stalled: sinceMs !== null && sinceMs > 2 * intervalMs(),
      since_ms: sinceMs,
    };
  }
  return { pending: false, lanes: cachedLanes.map((l) => Object.assign({}, l)), stalled: false, since_ms: sinceMs };
}

/** Test-only: the resolved timing knobs, so a cell can assert the floor and the bounds it
 *  actually runs under rather than re-deriving them from the env. */
export function _laneProbeTimingForTest() {
  return { intervalMs: intervalMs(), cycleMs: cycleMs(), probeTimeoutMs: PROBE_TIMEOUT_MS };
}

/** Test-only: run ONE cycle directly, bypassing the interval, so the `busy` non-overlap guard
 *  can be driven deterministically. Returns whatever refreshOnce returned. */
export function _refreshOnceForTest() {
  return refreshOnce();
}

/** Test-only: full reset (cache + interval + in-flight + override). */
export function _resetLaneProbeCacheForTest() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  inFlight = null;
  busy = false;
  cachedLanes = null;
  probeOverride = null;
  loopStartedAt = 0;
  lastSettledAt = 0;
}

/** Test-only: drive the background loop with an injected prober, so a cell can arm a lane that
 *  BLACK-HOLES (never resolves) or fails, deterministically and with no socket. */
export function _setLaneProbeForTest(fn) {
  probeOverride = fn;
}

/** Test-only: await the most recently started (or currently in-flight) cycle — starting the
 *  loop if it has not started — so a cell asserts on a SETTLED verdict instead of racing it. */
export async function _waitForLaneProbeSettleForTest() {
  laneProbeHealth();
  await inFlight;
  return laneProbeHealth();
}
