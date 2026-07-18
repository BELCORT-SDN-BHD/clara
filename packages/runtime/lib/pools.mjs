// The two-login connection pools (Slice 4, contract §4.1). EVERY runtime DB
// access flows through here so the P4 discipline is enforced in exactly one
// place (proven empirically in the S4 probes — see spike/RESULTS + contract §2):
//
//   * TWO logins / TWO roles. The runtime pool connects as clara_runtime_login
//     and SET ROLEs to clara_runtime on every checkout; the read pool connects
//     as clara_agent_read_login and SET ROLEs to clara_agent_ro with
//     default_transaction_read_only=on. SET ROLE is issued IMMEDIATELY on every
//     checkout (N10 — never operate as the bare login, so a missing grant fails
//     loudly instead of silently succeeding as a privileged login).
//   * txn-local GUCs ONLY. A session-level GUC LEAKS across checkouts (P4); so
//     the wake-credential secret is set with SET LOCAL inside a transaction (see
//     withReadWakeScoped) and clears on COMMIT/ROLLBACK. Session GUCs we DO set
//     (role, read-only, timeouts) are re-issued every checkout and wiped by the
//     RESET ALL on release, so nothing a caller set can outlive its checkout.
//   * ROLLBACK-before-release + RESET ALL: every checkout ends by closing any
//     open transaction (which also drops SET LOCAL state) and resetting session
//     state, so the next checkout starts clean.
//   * DISCARD-ON-ANY-CONNECTION-ERROR (P4): idle-in-txn kills surface as a
//     generic connection error with NO SQLSTATE, so we never branch on SQLSTATE
//     — if the client emits 'error' OR a cleanup ROLLBACK fails, the physical
//     connection is destroyed (client.release(true)) rather than returned. A
//     plain query error (e.g. CLR14) that leaves the connection healthy is NOT a
//     connection error: its cleanup ROLLBACK succeeds and the client is reused.
//   * idle_in_transaction_session_timeout + statement_timeout bound every
//     session; pool sizes are env-tunable (defaults 5/5 + 2 dedicated LISTEN
//     clients = the §4.1 budget of 17 against the Supavisor session ceiling).
//
// Connections come from the ENVIRONMENT only (contract secrets law): the two
// prod logins are supplied as DSNs (CLARA_RUNTIME_DATABASE_URL /
// CLARA_READ_DATABASE_URL); when those are absent (local throwaway, trust auth,
// no login passwords) the pools connect with the base env identity and SET ROLE
// — but ONLY when RELAY_TEST_MODE=1, so a production misconfiguration can never
// silently run the whole runtime as the base login (N10 also binds tests).

import pg from "pg";
import { connConfig, assertNoTargetSplit } from "./relay.mjs";

const TEST_MODE = process.env.RELAY_TEST_MODE === "1";

// Pool sizing + timeouts — env-tunable, documented against the §4.1 budget.
export const RUNTIME_POOL_MAX = Number(process.env.CLARA_RUNTIME_POOL_MAX || 5);
export const READ_POOL_MAX = Number(process.env.CLARA_READ_POOL_MAX || 5);
const STATEMENT_TIMEOUT_MS = Number(process.env.CLARA_STATEMENT_TIMEOUT_MS || 30000);
const IDLE_IN_TXN_TIMEOUT_MS = Number(process.env.CLARA_IDLE_IN_TXN_TIMEOUT_MS || 15000);
const CONNECT_TIMEOUT_MS = Number(process.env.CLARA_CONNECT_TIMEOUT_MS || 5000);

// The wake-credential TTL minted for a per-attempt read step (§4.1 — ≈5 min,
// short enough that no credential outlives a single execution attempt).
export const READ_CREDENTIAL_TTL = process.env.CLARA_READ_CREDENTIAL_TTL || "5 minutes";

/**
 * Resolve the pg config for a login. In production each login is a distinct DSN
 * from the environment; in RELAY_TEST_MODE (no login passwords on the local
 * throwaway) both fall back to the base env identity and rely on the per-checkout
 * SET ROLE. A production process (TEST_MODE off) with no per-login DSN gets the
 * base config too, but the SET ROLE still runs — so a bare-login misconfig fails
 * loudly rather than running privileged.
 * @param {"runtime"|"read"} which
 * @returns {pg.PoolConfig}
 */
function dsnVarFor(which) {
  return which === "runtime" ? "CLARA_RUNTIME_DATABASE_URL" : "CLARA_READ_DATABASE_URL";
}

/**
 * Assert the production pool config is present — call once at boot (serve.mjs). In
 * production (RELAY_TEST_MODE !== '1') BOTH dedicated login DSNs are REQUIRED; the
 * runtime must never fall back to a shared/base identity (S4-AB8, fail-closed).
 */
export function assertProductionPoolConfig() {
  if (TEST_MODE) return;
  for (const which of ["runtime", "read"]) {
    const v = dsnVarFor(which);
    if (!process.env[v]) {
      throw new Error(
        `${v} is REQUIRED in production (RELAY_TEST_MODE unset): the ${which} pool must connect as its dedicated ` +
          `login (${which === "runtime" ? "clara_runtime_login" : "clara_agent_read_login"}) — never a fallback identity. Refusing to start.`,
      );
    }
  }
}

function loginConfig(which) {
  assertNoTargetSplit(); // fail closed on a canonical-target split before connecting
  const dsn =
    which === "runtime" ? process.env.CLARA_RUNTIME_DATABASE_URL : process.env.CLARA_READ_DATABASE_URL;
  let base;
  if (TEST_MODE) {
    // Local throwaway: connect with the base env identity, then SET ROLE (N10).
    base = dsn ? { connectionString: dsn } : connConfig();
  } else if (!dsn) {
    // Fail CLOSED — never fall back to connConfig() in production (S4-AB8).
    throw new Error(`${dsnVarFor(which)} is required in production — refusing to connect the ${which} pool as a fallback identity.`);
  } else {
    base = { connectionString: dsn };
  }
  return {
    ...base,
    max: which === "runtime" ? RUNTIME_POOL_MAX : READ_POOL_MAX,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  };
}

// The exact session setup issued on EVERY checkout (multi-statement simple
// query). Role first (N10), then the read-only default (read pool) and the two
// bounding timeouts. RESET ALL on release wipes these, so re-issuing per checkout
// is both necessary and sufficient.
function setupSql(role, readOnly) {
  const parts = [`set role ${role}`];
  if (readOnly) parts.push("set default_transaction_read_only = on");
  parts.push(`set statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  parts.push(`set idle_in_transaction_session_timeout = ${IDLE_IN_TXN_TIMEOUT_MS}`);
  return parts.join("; ");
}

let _runtimePool = null;
let _readPool = null;

/** Lazy singleton runtime pool (clara_runtime). */
export function getRuntimePool() {
  if (!_runtimePool) {
    _runtimePool = new pg.Pool(loginConfig("runtime"));
    // A pool-level error (backend terminating an idle client) must never crash
    // the process — the affected client is already removed; log and move on.
    _runtimePool.on("error", (err) => console.error("[clara-runtime] runtime pool error:", err.message));
  }
  return _runtimePool;
}

/** Lazy singleton read pool (clara_agent_ro, read-only). */
export function getReadPool() {
  if (!_readPool) {
    _readPool = new pg.Pool(loginConfig("read"));
    _readPool.on("error", (err) => console.error("[clara-runtime] read pool error:", err.message));
  }
  return _readPool;
}

/**
 * Core checkout wrapper. Acquires a client, applies the role/timeout setup, runs
 * fn, then cleans up (ROLLBACK + RESET ALL). Any connection-level failure (the
 * client 'error' event OR a failed cleanup ROLLBACK) DESTROYS the physical
 * connection instead of returning it (P4 — no SQLSTATE branching). A plain query
 * error propagates but the client is reused when the connection stayed healthy.
 * @template T
 * @param {pg.Pool} pool
 * @param {string} setup
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function checkout(pool, setup, fn) {
  const client = await pool.connect();
  let broken = false;
  const onErr = () => {
    broken = true;
  };
  client.on("error", onErr);
  try {
    await client.query(setup); // SET ROLE ... (+ read-only) + timeouts — N10
    return await fn(client);
  } finally {
    // SHARED cleanup on EVERY path (success AND throw — S4-AB8): close any open
    // transaction (also drops SET LOCAL state) then reset session state. If EITHER
    // fails, the connection is gone → discard it. We never inspect SQLSTATE (P4).
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
    // release(true) DESTROYS the client (removes it from the pool); release()
    // returns it. Discard on any connection-level error.
    client.release(broken === true);
  }
}

/**
 * Run fn on a clara_runtime connection. Used for admission (begin_chat_turn),
 * settlement, cancel, credential minting, interruption/hook creation, drain,
 * heartbeats, and the reconciler.
 * @template T
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 */
export function withRuntime(fn) {
  return checkout(getRuntimePool(), setupSql("clara_runtime", false), fn);
}

/**
 * Run fn on a clara_agent_ro read-only connection. Firm scope requires a wake
 * credential in the txn-local clara.wake_secret GUC — use withReadWakeScoped for
 * any firm-scoped read; a bare withRead sees zero rows under FORCE RLS.
 * @template T
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 */
export function withRead(fn) {
  return checkout(getReadPool(), setupSql("clara_agent_ro", true), fn);
}

/**
 * Mint a short-lived interactive wake credential for a firm (clara_runtime).
 * Returns { credentialId, secret }. The SECRET is plaintext material and MUST
 * NOT cross a WDK step boundary (§4.1) — mint it, use it, and discard it inside
 * the same step execution attempt.
 * @param {string} firmId
 * @param {string} [ttl]
 * @returns {Promise<{credentialId: string, secret: string}>}
 */
export function mintWakeCredential(firmId, ttl = READ_CREDENTIAL_TTL) {
  return withRuntime(async (c) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, null, $3::interval)",
      ["interactive", firmId, ttl],
    );
    return { credentialId: r.rows[0].credential_id, secret: r.rows[0].secret };
  });
}

/**
 * Run a firm-scoped read on the read pool with a wake secret bound TXN-LOCALLY
 * (SET LOCAL inside a transaction, so it can never leak to a later checkout —
 * P4). The whole read runs inside a read-only transaction; we ROLLBACK to end it
 * (a read-only txn has nothing to commit) which also clears the SET LOCAL secret.
 * @template T
 * @param {string} secret  a live wake-credential secret (never persisted/returned)
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 */
export function withReadWakeScoped(secret, fn) {
  return withRead(async (c) => {
    await c.query("begin");
    // set_config(..., is_local=true) is the parameterised form of SET LOCAL — the
    // secret never enters the SQL text (no logging surface) and is txn-scoped.
    await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
    try {
      return await fn(c);
    } finally {
      // End the read-only txn; this drops the txn-local wake_secret. checkout()
      // then runs its own ROLLBACK/RESET (harmless no-ops) before release.
      await c.query("rollback").catch(() => {});
    }
  });
}

/**
 * A dedicated long-lived clara_runtime client for LISTEN (the control listener
 * and the relay leader each hold one — the "LISTEN 2" of the §4.1 budget). The
 * caller owns its lifecycle (connect/end) and reconnect policy. SET ROLE is
 * issued here so the LISTEN session is never the bare login (N10).
 * @returns {pg.Client}
 */
export function makeRuntimeClient() {
  assertNoTargetSplit();
  const dsn = process.env.CLARA_RUNTIME_DATABASE_URL;
  // Fail CLOSED in production (S4-FX7): a dedicated LISTEN client must never fall
  // back to the base identity — require the login DSN when not in test mode.
  if (!TEST_MODE && !dsn) {
    throw new Error(`${dsnVarFor("runtime")} is required in production — refusing a bare-identity LISTEN client.`);
  }
  return new pg.Client(dsn ? { connectionString: dsn } : connConfig());
}

/** Issue the runtime SET ROLE on a freshly-connected dedicated client (N10). */
export async function setRuntimeRoleOn(client) {
  await client.query("set role clara_runtime");
}

/** Close both pools (process shutdown / test teardown). */
export async function endPools() {
  const runtime = _runtimePool;
  const read = _readPool;
  _runtimePool = null;
  _readPool = null;
  if (runtime) await runtime.end().catch(() => {});
  if (read) await read.end().catch(() => {});
}
