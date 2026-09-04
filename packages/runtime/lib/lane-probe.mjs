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
//   * A TTL CACHE AND A BOUND. `/ready` is polled by fly on a short interval; opening seven
//     connections per poll would be a self-inflicted connection storm against the Supavisor
//     session ceiling the §4.1 budget of 19 is measured against. The result is cached for
//     CLARA_LANE_PROBE_TTL_MS (default 30s) and every probe is bounded at
//     CLARA_LANE_PROBE_TIMEOUT_MS (default 3s), run CONCURRENTLY under one Promise.allSettled,
//     so the whole set costs one timeout — not seven — of fly's 5s /ready budget.
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
const PROBE_TTL_MS = finiteEnv("CLARA_LANE_PROBE_TTL_MS", 30000);

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

const cache = { at: 0, value: null };

/**
 * Probe every configured lane CONCURRENTLY, cached for PROBE_TTL_MS. The cache is what keeps a
 * one-per-second load-balancer poll from opening seven connections per second.
 * `opts.probe` is a TEST SEAM only (production always uses `probeLane`): concurrency is a
 * property of this function, and proving it against a real socket would need a host that hangs
 * rather than refuses — a cell that passes for the wrong reason on a network that answers fast.
 * An injected prober makes the overlap deterministic and the cell discriminating.
 * @param {{timeoutMs?:number, ttlMs?:number, roster?:ReadonlyArray<object>, probe?:Function}} [opts]
 * @returns {Promise<Array<{lane:string}>>}
 */
export async function probeLanes(opts = {}) {
  const ttl = Number.isFinite(opts.ttlMs) && opts.ttlMs >= 0 ? opts.ttlMs : PROBE_TTL_MS;
  const now = Date.now();
  if (cache.value && now - cache.at < ttl) return cache.value;
  const roster = opts.roster ?? LANE_ROSTER;
  const probe = opts.probe ?? probeLane;
  const settled = await Promise.allSettled(roster.map((d) => probe(d, opts)));
  const results = settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { lane: roster[i].lane, ok: false, error: "probe_internal_error" },
  );
  cache.at = now;
  cache.value = results;
  return results;
}

/** Test-only: drop the TTL cache so a cell measures a fresh probe. */
export function _resetLaneProbeCacheForTest() {
  cache.at = 0;
  cache.value = null;
}
