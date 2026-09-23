// #871 — THE SIGNED-OUT INVITE-PREVIEW LOGIN AND ITS ONE VERB (the eighth pool).
//
// Design of record: ticket #871's Agent Brief as replaced by the owner's ruling of 2026-09-23
// ("a runtime pool for the new login shell beside the checkout and auth-wall pools, and a route on
// the auth-wall courier pattern"). The DB half is `packages/db/migrations/
// 0309_invite_preview_public_door.sql` (the role pair + `clara.preview_invite_by_token`).
//
// WHY ITS OWN MODULE, LIKE `checkout-pools.mjs` AND `freeform-read.mjs`, AND NOT A THIRD LANE
// INSIDE `checkout-pools.mjs`. That module's header states a measured property of ITS two lanes —
// "the estate's only pools whose group role holds ZERO relation privileges and EXACTLY TWO
// executable routines each" — and its `CHECKOUT_POOL_SQL_TEXTS` census is that claim, mechanised.
// This lane holds ZERO relation privileges and EXACTLY ONE routine. Folding it in would either
// falsify that sentence or force it to be re-worded around a lane that has nothing to do with
// checkout; a sibling module keeps both censuses true of one subject each. The lanes are still
// named together at ONE boot door (`pools.mjs`'s `assertProductionPoolConfig`) and closed together
// by `endPools()`, which is what "beside the checkout and auth-wall pools" actually buys.
//
// ONE FROZEN STATEMENT, AND NO SEAM FOR A SECOND. Like `freeform-read.mjs`'s S-1, this module
// composes no SQL and takes no statement text: the only string it can issue is the constant below
// plus the shared session setup. A caller holding this connection cannot reach anything else
// through this file — which is what makes "the blast radius is one function" a property of the
// code rather than a promise about it.
//
// WHAT A COMPROMISED DSN CAN DO, RESTATED WHERE THE CREDENTIAL IS USED. It can ask, for any invite
// token it already holds, which firm and role that token names and whether the invitation is still
// open — the same answer the invitee's own browser is shown. It cannot read an invite it has no
// token for (the door looks up by `sha256(token)` and returns ONE indistinguishable refusal
// otherwise), cannot enumerate (the door's own 15-minute / 5-attempt wall counts every call,
// including the ones that find nothing), cannot see an address (only the mask), cannot accept
// anything, and holds no privilege on any relation in the estate. Rotate it with the same ceremony
// the auth-wall DSN gets.
//
// THE CREDENTIAL IS NOT IN THE MIGRATION. `clara_invite_preview_login` ships NOLOGIN and
// password-less (0309's own tail refuses `rolcanlogin` on it); flipping it to LOGIN and setting a
// password is an out-of-band operator ceremony, which is why this lane's DSN check is LAZY, exactly
// as `assertCheckoutPoolConfig` is and for the same deploy-ordering reason: an eager assert would
// refuse to BOOT the whole runtime from the moment this image ships until a ceremony that follows
// it. The failure point moves to first use; it does not disappear.

import pg from "pg";
import { connConfig, assertNoTargetSplit } from "./relay.mjs";
import { attachPoolErrorContract } from "./pool-error-contract.mjs";

const TEST_MODE = process.env.RELAY_TEST_MODE === "1";

/** 0309 §A: the NOLOGIN group + its login member. The pool connects AS the login and SET ROLEs to
 *  the group on every checkout (N10 — never operate as the bare login). */
export const INVITE_PREVIEW_LOGIN = "clara_invite_preview_login";
export const INVITE_PREVIEW_ROLE = "clara_invite_preview";
/** The name the deploy notes and the release runbook carry, and the only place it is defined. */
export const INVITE_PREVIEW_DSN_VAR = "CLARA_INVITE_PREVIEW_DATABASE_URL";
/** #617: this lane's NAME on /ready — see FREEFORM_LANE's note in lib/freeform-read.mjs. */
export const INVITE_PREVIEW_LANE = "invite_preview";

const STATEMENT_TIMEOUT_MS = Number(process.env.CLARA_STATEMENT_TIMEOUT_MS || 30000);
const IDLE_IN_TXN_TIMEOUT_MS = Number(process.env.CLARA_IDLE_IN_TXN_TIMEOUT_MS || 15000);
const CONNECT_TIMEOUT_MS = Number(process.env.CLARA_CONNECT_TIMEOUT_MS || 5000);

/** Small on purpose: one call per invite-link landing, and the wall caps how often that can
 *  repeat. Counts against `packages/runtime/README.md`'s connection-ceiling paragraph. */
export const INVITE_PREVIEW_POOL_MAX = Number(process.env.CLARA_INVITE_PREVIEW_POOL_MAX || 2);

/** THE ONE STATEMENT. A frozen module constant; nothing here is built from an argument. */
export const PREVIEW_INVITE_BY_TOKEN_SQL =
  "select clara.preview_invite_by_token($1::text,$2::bytea) as receipt";

/** Every SQL text this module is capable of issuing — the S-1 census, mechanised. */
export const INVITE_PREVIEW_POOL_SQL_TEXTS = Object.freeze([PREVIEW_INVITE_BY_TOKEN_SQL]);

function setupSql(role) {
  return [
    `set role ${role}`,
    `set statement_timeout = ${STATEMENT_TIMEOUT_MS}`,
    `set idle_in_transaction_session_timeout = ${IDLE_IN_TXN_TIMEOUT_MS}`,
  ].join("; ");
}

function laneConfig() {
  assertNoTargetSplit(); // fail closed on a canonical-target split before connecting
  const dsn = process.env[INVITE_PREVIEW_DSN_VAR];
  let connectionString = null;
  if (TEST_MODE) {
    // The throwaway rig: 0309 grants the login role to `postgres` precisely so a rig can SET ROLE
    // into the lane with no password-bearing credential (0163's own precedent). With no DSN,
    // `connConfig()` yields nothing and node-postgres reads the libpq PG* vars itself; then SET
    // ROLE (N10).
    connectionString = dsn ?? connConfig().connectionString ?? null;
  } else if (!dsn) {
    throw new Error(
      `${INVITE_PREVIEW_DSN_VAR} is required in production — refusing to connect the ${INVITE_PREVIEW_LOGIN} pool as a fallback identity.`,
    );
  } else {
    connectionString = dsn;
  }
  // ASSEMBLED BY ASSIGNMENT, NOT BY SPREAD (`scripts/check-parts-parity.mjs` refuses an object
  // spread under packages/runtime outside tests/). `connectionString` is OMITTED rather than set
  // to null when there is none, which is what makes node-postgres fall through to the libpq
  // environment exactly as `connConfig()`'s empty object did.
  const config = { max: INVITE_PREVIEW_POOL_MAX, connectionTimeoutMillis: CONNECT_TIMEOUT_MS };
  if (connectionString !== null) config.connectionString = connectionString;
  return config;
}

let _invitePreviewPool = null;

/** Lazy singleton preview pool (clara_invite_preview_login -> SET ROLE clara_invite_preview). */
export function getInvitePreviewPool() {
  if (!_invitePreviewPool) {
    _invitePreviewPool = attachPoolErrorContract(new pg.Pool(laneConfig()), INVITE_PREVIEW_LANE);
  }
  return _invitePreviewPool;
}

/** The boot NOTICE, called from `pools.mjs`'s `assertProductionPoolConfig` so there is still ONE
 *  boot door and a lane nobody mentions at boot is not a lane nobody remembers to ceremony.
 *  Deliberately not fatal, for the same deploy-ordering reason `assertCheckoutPoolConfig` is not. */
export function assertInvitePreviewPoolConfig() {
  if (TEST_MODE) return;
  if (!process.env[INVITE_PREVIEW_DSN_VAR]) {
    console.warn(
      `[clara-runtime] ${INVITE_PREVIEW_DSN_VAR} not set: the signed-out invite-preview lane is DORMANT. ` +
        `POST /api/invite-preview will refuse (503) until the ${INVITE_PREVIEW_LOGIN} ceremony runs and ` +
        "this DSN is supplied. Deliberately not fatal — the role ships NOLOGIN and its ceremony follows the migration.",
    );
  }
}

/** True iff the lane has a usable credential. The route reads this to answer a typed 503 instead of
 *  letting `laneConfig`'s throw surface as a 500 — a dormant lane is a configuration fact to state
 *  honestly, not an internal error. */
export const invitePreviewLaneConfigured = () => TEST_MODE || Boolean(process.env[INVITE_PREVIEW_DSN_VAR]);

/**
 * The shared checkout wrapper: acquire, SET ROLE + timeouts, run, then ROLLBACK + RESET ALL,
 * destroying the physical connection on ANY connection-level failure (the P4 discipline, copied in
 * behaviour from `checkout-pools.mjs`'s `checkout` — never branching on SQLSTATE).
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
 * Read one signed-out invite preview. Returns the door's own receipt VERBATIM — one of
 * `{outcome:"preview", firm_name, role, status, masked_email}`,
 * `{outcome:"not_previewable"}` or `{outcome:"rate_limited", retry_after_seconds}` — because this
 * lane computes no number and collapses no refusal the database owns.
 *
 * @param {string} token the invite's plaintext token, as the link carries it
 * @param {Buffer} originDigest `sha256(pepper ‖ proxy-observed client IP)`, exactly 32 bytes (the
 *   door raises CLR10 `a digest is required` on anything else)
 * @param {{pool?: pg.Pool}} [deps] test seam for WHERE the statement goes, never WHICH one
 * @returns {Promise<Record<string, unknown>|null>}
 */
export function previewInviteByToken(token, originDigest, deps = {}) {
  const pool = deps.pool ?? getInvitePreviewPool();
  return checkout(pool, setupSql(INVITE_PREVIEW_ROLE), async (c) => {
    const r = await c.query(PREVIEW_INVITE_BY_TOKEN_SQL, [token, originDigest]);
    return r.rows[0]?.receipt ?? null;
  });
}

/** Close the pool (process shutdown / test teardown). Called by `pools.mjs`'s `endPools`. */
export async function endInvitePreviewPool() {
  const pool = _invitePreviewPool;
  _invitePreviewPool = null;
  if (pool) await pool.end().catch(() => {});
}
