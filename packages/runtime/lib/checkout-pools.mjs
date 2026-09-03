// FS-4 C-5 — THE TWO CHECKOUT-GATE LOGINS AND THEIR FOUR VERBS (the sixth and seventh pools).
//
// Design of record: checkout-gate design part 2 §1.6 (the webhook's principal) and part 3 §2.1
// (the pre-session auth wall) + §3 (the environment table). The DB half is 0160 (the webhook
// role pair + `record_stripe_event`/`apply_stripe_events`) and 0161 (the auth-wall role pair +
// `claim_confirmation_attempt`/`settle_confirmation_attempt`).
//
// WHY ITS OWN MODULE, LIKE `freeform-read.mjs` AND UNLIKE FOUR MORE BRANCHES IN `pools.mjs`.
// Two reasons, and neither is file size. (1) These two lanes are the estate's only pools whose
// group role holds ZERO relation privileges and EXACTLY TWO executable routines each — measured
// on the rig, not asserted: `clara_stripe_webhook` reaches
// `{record_stripe_event, apply_stripe_events}` and nothing else, `clara_auth_wall` reaches
// `{claim_confirmation_attempt, settle_confirmation_attempt}` and nothing else. That is cell
// W-O's set equality, and a reader has to be able to see the whole reachable surface of a money
// lane in one place. (2) Both DSNs are LAZY, unlike the write and freeform floors, and the
// reason is a deploy ordering fact that belongs beside the pools it governs — see
// `assertCheckoutPoolConfig`.
//
// FOUR FROZEN STATEMENTS, AND NO SEAM FOR A FIFTH. Like `freeform-read.mjs`'s S-1, this module
// composes no SQL and takes no statement text: the only strings it can issue are the four
// constants below plus the shared session setup. A caller holding one of these connections
// cannot reach anything else through this file, which is what makes "the blast radius is two
// functions" a property of the code rather than a promise about it.
//
// WHAT A COMPROMISED WEBHOOK DSN CAN DO, RESTATED WHERE THE CREDENTIAL IS USED (design part 2
// §1.6 / cell W-O2, M11). `record_stripe_event` performs NO authenticity check of its own — the
// signature check is in the route, not the door — so anyone holding this DSN who knows a real
// `(registration_id, applicant, intent_id, session_id)` tuple can append an event the applier
// WILL apply, and every customer knows their own tuple. The webhook DSN is therefore equivalent
// in power to `STRIPE_WEBHOOK_SECRET`; neither can create a firm, close a registration or read
// a book. Rotate them with the same care.

import pg from "pg";
import { connConfig, assertNoTargetSplit } from "./relay.mjs";

const TEST_MODE = process.env.RELAY_TEST_MODE === "1";

/** 0160 §0: the NOLOGIN group + its login member. The pool connects AS the login and SET ROLEs
 *  to the group on every checkout (N10 — never operate as the bare login). */
export const STRIPE_WEBHOOK_LOGIN = "clara_stripe_webhook_login";
export const STRIPE_WEBHOOK_ROLE = "clara_stripe_webhook";
/** Named by design part 3 §3's environment table, verbatim. */
export const STRIPE_WEBHOOK_DSN_VAR = "CLARA_STRIPE_WEBHOOK_DATABASE_URL";

/** 0161 §0: the pre-session auth-wall pair. */
export const AUTH_WALL_LOGIN = "clara_auth_wall_login";
export const AUTH_WALL_ROLE = "clara_auth_wall";
/** NOT named in part 3 §3 (the table predates 0161's role pair); this is the name the deploy
 *  notes in the PR body carry, and the only place it is defined. */
export const AUTH_WALL_DSN_VAR = "CLARA_AUTH_WALL_DATABASE_URL";

const STATEMENT_TIMEOUT_MS = Number(process.env.CLARA_STATEMENT_TIMEOUT_MS || 30000);
const IDLE_IN_TXN_TIMEOUT_MS = Number(process.env.CLARA_IDLE_IN_TXN_TIMEOUT_MS || 15000);
const CONNECT_TIMEOUT_MS = Number(process.env.CLARA_CONNECT_TIMEOUT_MS || 5000);

/** Small on purpose. The webhook lane is one insert per delivery plus a periodic sweep; the
 *  auth-wall lane is two calls per confirmation attempt.
 *
 *  THE BUDGET THEY COUNT AGAINST IS `packages/runtime/README.md`'s connection-ceiling paragraph,
 *  which these two pools take from ≈27 to ≈31. An earlier version of this comment cited "the
 *  §4.1 budget" — there is no connection budget at §4.1 in the checkout pack, or anywhere in it
 *  (the #511 review checked; part 1 §4.1 is the rate wall's trap, part 3 §4.1 is a mutant panel).
 *  The README's own count carries a standing warning that it is UNVERIFIED since the F-A4/FS-4
 *  trains landed, so Supavisor headroom stays an open cutover item rather than a settled one. */
export const STRIPE_WEBHOOK_POOL_MAX = Number(process.env.CLARA_STRIPE_WEBHOOK_POOL_MAX || 2);
export const AUTH_WALL_POOL_MAX = Number(process.env.CLARA_AUTH_WALL_POOL_MAX || 2);

/** THE FOUR STATEMENTS. Frozen module constants; nothing here is built from an argument. */
export const RECORD_STRIPE_EVENT_SQL = "select clara.record_stripe_event($1::text,$2::text,$3::jsonb) as receipt";
export const APPLY_STRIPE_EVENTS_SQL = "select clara.apply_stripe_events($1::int) as receipt";
export const CLAIM_CONFIRMATION_ATTEMPT_SQL = "select clara.claim_confirmation_attempt($1::bytea,$2::bytea) as receipt";
export const SETTLE_CONFIRMATION_ATTEMPT_SQL = "select clara.settle_confirmation_attempt($1::uuid,$2::text) as receipt";

/** Every SQL text this module is capable of issuing — the S-1 census, mechanised. */
export const CHECKOUT_POOL_SQL_TEXTS = Object.freeze([
  RECORD_STRIPE_EVENT_SQL,
  APPLY_STRIPE_EVENTS_SQL,
  CLAIM_CONFIRMATION_ATTEMPT_SQL,
  SETTLE_CONFIRMATION_ATTEMPT_SQL,
]);

function setupSql(role) {
  return [
    `set role ${role}`,
    `set statement_timeout = ${STATEMENT_TIMEOUT_MS}`,
    `set idle_in_transaction_session_timeout = ${IDLE_IN_TXN_TIMEOUT_MS}`,
  ].join("; ");
}

function laneConfig(dsnVar, login, poolMax) {
  assertNoTargetSplit(); // fail closed on a canonical-target split before connecting
  const dsn = process.env[dsnVar];
  let connectionString = null;
  if (TEST_MODE) {
    // The throwaway rig: 0160 and 0161 each grant their login role to `postgres` precisely so a
    // rig can SET ROLE into the lane with no password-bearing credential (the wake-role
    // precedent). With no DSN, `connConfig()` yields nothing and node-postgres reads the libpq
    // PG* vars itself; then SET ROLE (N10).
    connectionString = dsn ?? connConfig().connectionString ?? null;
  } else if (!dsn) {
    throw new Error(
      `${dsnVar} is required in production — refusing to connect the ${login} pool as a fallback identity.`,
    );
  } else {
    connectionString = dsn;
  }
  // ASSEMBLED BY ASSIGNMENT, NOT BY SPREAD. `scripts/check-parts-parity.mjs:302` refuses any
  // object spread under `packages/runtime` outside `tests/` — its census cannot tell a config
  // literal from a typed `parts[]` member, so it fails closed. `connectionString` is OMITTED
  // rather than set to null when there is none, which is what makes node-postgres fall through
  // to the libpq environment exactly as `connConfig()`'s empty object did.
  const config = { max: poolMax, connectionTimeoutMillis: CONNECT_TIMEOUT_MS };
  if (connectionString !== null) config.connectionString = connectionString;
  return config;
}

let _stripePool = null;
let _authWallPool = null;

/** Lazy singleton webhook pool (clara_stripe_webhook_login -> SET ROLE clara_stripe_webhook). */
export function getStripeWebhookPool() {
  if (!_stripePool) {
    _stripePool = new pg.Pool(laneConfig(STRIPE_WEBHOOK_DSN_VAR, STRIPE_WEBHOOK_LOGIN, STRIPE_WEBHOOK_POOL_MAX));
    _stripePool.on("error", (err) => console.error("[clara-runtime] stripe webhook pool error:", err.message));
  }
  return _stripePool;
}

/** Lazy singleton auth-wall pool (clara_auth_wall_login -> SET ROLE clara_auth_wall). */
export function getAuthWallPool() {
  if (!_authWallPool) {
    _authWallPool = new pg.Pool(laneConfig(AUTH_WALL_DSN_VAR, AUTH_WALL_LOGIN, AUTH_WALL_POOL_MAX));
    _authWallPool.on("error", (err) => console.error("[clara-runtime] auth wall pool error:", err.message));
  }
  return _authWallPool;
}

/**
 * The boot assert, called from `pools.mjs`'s `assertProductionPoolConfig` so there is still ONE
 * boot door.
 *
 * LAZY, NOT EAGER, AND THE REASON IS A DEPLOY ORDERING FACT — Gate G1's bank-pool posture, not
 * the write floor's. Both role pairs are created NOLOGIN by their migrations, and 0161's own
 * fail-closed tail REFUSES `rolcanlogin` on the auth-wall pair: flipping them to LOGIN with a
 * password is an out-of-band ceremony the migration deliberately cannot do (the security pass's
 * cutover checklist item 4). That ceremony cannot run until 0160/0161 are applied to the live
 * project, which happens at the Wave-G reset. An EAGER assert here would therefore refuse to
 * BOOT the whole runtime — chat, intake, the durable engine, everything — from the moment this
 * image ships until a ceremony that is itself gated on a later event. `getStripeWebhookPool()`
 * and `getAuthWallPool()` still fail CLOSED, just LAZILY, at first actual use: `laneConfig`
 * throws when the DSN is absent and there is no shared-identity fallback. The failure point
 * moves; it does not disappear.
 *
 * It is exported and called so the ONE boot door still names these two lanes — a pool nobody
 * mentions at boot is a pool nobody remembers to ceremony.
 */
export function assertCheckoutPoolConfig() {
  if (TEST_MODE) return;
  const missing = [STRIPE_WEBHOOK_DSN_VAR, AUTH_WALL_DSN_VAR].filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.warn(
      `[clara-runtime] ${missing.join(" and ")} not set: the checkout-gate lanes are DORMANT. ` +
        `The Stripe webhook route and the pre-session auth wall will refuse (503) until the ` +
        `${STRIPE_WEBHOOK_LOGIN}/${AUTH_WALL_LOGIN} ceremony runs and these DSNs are supplied. ` +
        `Deliberately not fatal — both roles ship NOLOGIN and their ceremony follows the migration.`,
    );
  }
}

/** True iff the lane has a usable credential. The routes read this to answer a typed 503 instead
 *  of letting `laneConfig`'s throw surface as a 500 — a dormant lane is a configuration fact to
 *  state honestly, not an internal error. */
export const stripeWebhookLaneConfigured = () => TEST_MODE || Boolean(process.env[STRIPE_WEBHOOK_DSN_VAR]);
export const authWallLaneConfigured = () => TEST_MODE || Boolean(process.env[AUTH_WALL_DSN_VAR]);

/**
 * The shared checkout wrapper: acquire, SET ROLE + timeouts, run, then ROLLBACK + RESET ALL,
 * destroying the physical connection on ANY connection-level failure (the P4 discipline, copied
 * in behaviour from `pools.mjs`'s `checkout` — never branching on SQLSTATE).
 *
 * NO CALLBACK SEAM FOR ARBITRARY SQL. `fn` receives the client, exactly as `pools.mjs` does, but
 * the only callers are the four wrappers below and they issue only the four frozen constants.
 * @template T
 * @param {pg.Pool} pool
 * @param {string} setup
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 */
async function checkout(pool, setup, fn) {
  const client = await pool.connect();
  let broken = false;
  const onErr = () => {
    broken = true;
  };
  client.on("error", onErr);
  try {
    await client.query(setup);
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      broken = true;
    }
    try {
      await client.query("reset all");
    } catch {
      broken = true;
    }
    client.removeListener("error", onErr);
    client.release(broken === true);
  }
}

/**
 * Record one verified, projected event. Returns the door's own receipt verbatim —
 * `{event_id, recorded}` — where `recorded:false` is the IDEMPOTENT REPLAY arm, not a failure.
 * @param {{eventId: string, eventType: string, projection: Record<string, unknown>}} args
 * @param {{pool?: pg.Pool}} [deps] test seam for WHERE the statement goes, never WHICH one
 * @returns {Promise<{event_id: string, recorded: boolean}>}
 */
export function recordStripeEvent({ eventId, eventType, projection }, deps = {}) {
  const pool = deps.pool ?? getStripeWebhookPool();
  return checkout(pool, setupSql(STRIPE_WEBHOOK_ROLE), async (c) => {
    const r = await c.query(RECORD_STRIPE_EVENT_SQL, [eventId, eventType, JSON.stringify(projection)]);
    return r.rows[0]?.receipt ?? null;
  });
}

/**
 * Run one applier sweep. Returns `{applied, examined, problems}` verbatim from the door.
 * @param {number} [limit]
 * @param {{pool?: pg.Pool}} [deps]
 */
export function applyStripeEvents(limit = 100, deps = {}) {
  const pool = deps.pool ?? getStripeWebhookPool();
  return checkout(pool, setupSql(STRIPE_WEBHOOK_ROLE), async (c) => {
    const r = await c.query(APPLY_STRIPE_EVENTS_SQL, [limit]);
    return r.rows[0]?.receipt ?? null;
  });
}

/**
 * Claim one confirmation attempt. Both digests are exactly 32 bytes (the door refuses CLR10
 * otherwise). Returns `{attempt_id, allowed, remaining, scope, retry_after_seconds}` verbatim.
 *
 * `attempt_id` COMES BACK HERE AND MUST NOT LEAVE THE PROCESS (A-M3). This function is the only
 * thing in the runtime that ever sees it; `src/authWallRoutes.ts` keeps it in a local and never
 * puts it in a response body. There is no route that accepts one.
 * @param {Buffer} emailDigest
 * @param {Buffer} originDigest
 * @param {{pool?: pg.Pool}} [deps]
 */
export function claimConfirmationAttempt(emailDigest, originDigest, deps = {}) {
  const pool = deps.pool ?? getAuthWallPool();
  return checkout(pool, setupSql(AUTH_WALL_ROLE), async (c) => {
    const r = await c.query(CLAIM_CONFIRMATION_ATTEMPT_SQL, [emailDigest, originDigest]);
    return r.rows[0]?.receipt ?? null;
  });
}

/**
 * Settle one claimed attempt. `outcome` is derived by the CALLER from `verifyOtp`'s own result
 * and is never read off a request body (A-M3); the door itself refuses anything but
 * `'accepted'`/`'rejected'` with CLR10.
 * @param {string} attemptId
 * @param {"accepted"|"rejected"} outcome
 * @param {{pool?: pg.Pool}} [deps]
 */
export function settleConfirmationAttempt(attemptId, outcome, deps = {}) {
  const pool = deps.pool ?? getAuthWallPool();
  return checkout(pool, setupSql(AUTH_WALL_ROLE), async (c) => {
    const r = await c.query(SETTLE_CONFIRMATION_ATTEMPT_SQL, [attemptId, outcome]);
    return r.rows[0]?.receipt ?? null;
  });
}

/** Close both pools (process shutdown / test teardown). Called by `pools.mjs`'s `endPools`. */
export async function endCheckoutPools() {
  const stripe = _stripePool;
  const authWall = _authWallPool;
  _stripePool = null;
  _authWallPool = null;
  if (stripe) await stripe.end().catch(() => {});
  if (authWall) await authWall.end().catch(() => {});
}
