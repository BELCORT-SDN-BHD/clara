// The dedicated-login connection pools (Slice 4 two-login base + the Slice-6 write floor +
// Gate G1's bank pool + F-A6's FREEFORM READ pool; contract §4.1 / §5). EVERY runtime DB
// access flows through
// here so the P4 discipline is enforced in exactly one place (proven empirically in the
// S4 probes — see spike/RESULTS + contract §2):
//
//   * FIVE logins / FIVE roles (three here since Slice 6, plus Gate G1's bank pool and
//     F-A6's freeform pool, the latter in lib/freeform-read.mjs — see the import below).
//     The runtime pool connects as clara_runtime_login and
//     SET ROLEs to clara_runtime on every checkout; the read pool connects as
//     clara_agent_read_login and SET ROLEs to clara_agent_ro with
//     default_transaction_read_only=on; the Slice-6 WRITE pool connects as
//     clara_wake_write_login and SET ROLEs to clara_wake_interactive (NOT read-only; it
//     COMMITs the draft). SET ROLE is issued IMMEDIATELY on every checkout (N10 — never
//     operate as the bare login, so a missing grant fails loudly instead of silently
//     succeeding as a privileged login).
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
//     session; pool sizes are env-tunable (defaults 5 runtime + 5 read + 2 write
//     + 5 engine + 2 dedicated LISTEN clients = the §4.1 budget of 19 against the
//     Supavisor session ceiling; the Slice-6 write floor added the +2).
//
// Connections come from the ENVIRONMENT only (contract secrets law): the three
// prod logins are supplied as DSNs (CLARA_RUNTIME_DATABASE_URL /
// CLARA_READ_DATABASE_URL / CLARA_WRITE_DATABASE_URL); when those are absent (local
// throwaway, trust auth, no login passwords) the pools connect with the base env
// identity and SET ROLE — but ONLY when RELAY_TEST_MODE=1, so a production
// misconfiguration can never silently run the whole runtime as the base login (N10
// also binds tests).

import pg from "pg";
import { randomUUID } from "node:crypto";
import { connConfig, assertNoTargetSplit } from "./relay.mjs";
// F-A6 PR-2: the FIFTH login (clara_freeform_login) and its ONE wrapper live in their own
// module — its checkout differs on three load-bearing points (a session statement_timeout set
// before the call, a DISCARD ALL release, and no callback seam at all), and lib/freeform-read.mjs
// states each. This file keeps the ONE boot door and the ONE shutdown door by calling into it.
import { assertFreeformPoolConfig, endFreeformPool } from "./freeform-read.mjs";

const TEST_MODE = process.env.RELAY_TEST_MODE === "1";

// Pool sizing + timeouts — env-tunable, documented against the §4.1 budget.
export const RUNTIME_POOL_MAX = Number(process.env.CLARA_RUNTIME_POOL_MAX || 5);
export const READ_POOL_MAX = Number(process.env.CLARA_READ_POOL_MAX || 5);
// The Slice-6 write floor (contract §5 / brief-4 Shape-1): a THIRD login
// (clara_wake_write_login, member of clara_wake_interactive alone) + a SMALL write
// pool (max 2 — inside the connection budget) that reaches the EXISTING
// wake_draft_entry writer. NOT read-only; SET ROLE clara_wake_interactive; COMMITs.
export const WRITE_POOL_MAX = Number(process.env.CLARA_WRITE_POOL_MAX || 2);
// Gate G1 Annex E step 1: bank_agent's own dedicated pool (write-floor shape, least-privilege).
// Inert until clara_wake_bank_login (NOLOGIN-created, 0121) gains LOGIN+password+DSN at the
// operator ceremony — assertProductionPoolConfig deliberately does NOT require this DSN eagerly
// (MUST G below): that ceremony is itself gated on G1 merging first.
export const BANK_POOL_MAX = Number(process.env.CLARA_BANK_POOL_MAX || 2);

// The dedicated login each pool connects AS in production (the two-login law, N10):
// the pool connects as this login, then SET ROLEs to its one group on every checkout.
const LOGIN_NAMES = { runtime: "clara_runtime_login", read: "clara_agent_read_login", write: "clara_wake_write_login", bank: "clara_wake_bank_login" }; // step 2
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
  if (which === "runtime") return "CLARA_RUNTIME_DATABASE_URL";
  if (which === "write") return "CLARA_WRITE_DATABASE_URL";
  if (which === "bank") return "CLARA_BANK_DATABASE_URL"; // Gate G1 Annex E, step 3
  return "CLARA_READ_DATABASE_URL";
}

function poolMaxFor(which) {
  if (which === "runtime") return RUNTIME_POOL_MAX;
  if (which === "write") return WRITE_POOL_MAX;
  if (which === "bank") return BANK_POOL_MAX; // Gate G1 Annex E, step 4
  return READ_POOL_MAX;
}

/**
 * Assert the production pool config is present — call once at boot (serve.mjs). In
 * production (RELAY_TEST_MODE !== '1') ALL FOUR dedicated login DSNs are REQUIRED;
 * the runtime must never fall back to a shared/base identity (S4-AB8, fail-closed).
 * The write DSN (CLARA_WRITE_DATABASE_URL) joins this fail-closed set (contract §5 /
 * C-18): a coding-floor world must never boot without a wired write floor. NOTE
 * (deploy ordering): the clara_wake_write_login is created NOLOGIN in 0009 and given
 * LOGIN+password + this secret at the operator ceremony — the secret must be present
 * BEFORE the Slice-6 image boots, or the world fails closed.
 * CLARA_BANK_DATABASE_URL is DELIBERATELY NOT eager here (MUST G, opus/Codex review — an
 * earlier draft put it in this set, which would refuse to BOOT the whole server+worker until
 * the bank ceremony ran, and that ceremony is itself gated on G1 merging first). `getBankPool()`
 * below still fails CLOSED, just LAZILY, at first actual bank use (its own `loginConfig("bank")`
 * throws if the DSN is absent) — no shared-identity fallback, only a deferred failure point that
 * cannot fire before bank_agent is registered+enabled regardless.
 */
export function assertProductionPoolConfig() {
  if (TEST_MODE) return;
  for (const which of ["runtime", "read", "write"]) {
    const v = dsnVarFor(which);
    if (!process.env[v]) {
      throw new Error(
        `${v} is REQUIRED in production (RELAY_TEST_MODE unset): the ${which} pool must connect as its dedicated ` +
          `login (${LOGIN_NAMES[which]}) — never a fallback identity. Refusing to start.`,
      );
    }
  }
  // F-A6 (design Annex E.1 / R-4): CLARA_FREEFORM_DATABASE_URL joins this fail-closed set as
  // the fourth eager member, so clara_freeform_login's ceremony PRECEDES the image — the write
  // floor's posture, deliberately NOT the bank pool's lazy one (whose ceremony was gated on
  // its own PR merging; F-A6 PR-1 is merged and ceremonied already). The assert itself lives
  // beside the pool it guards, with both names as its own constants.
  assertFreeformPoolConfig();
}

function loginConfig(which) {
  assertNoTargetSplit(); // fail closed on a canonical-target split before connecting
  const dsn = process.env[dsnVarFor(which)];
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
    max: poolMaxFor(which),
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
let _writePool = null;
let _bankPool = null;

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

/** Lazy singleton WRITE pool (the Slice-6 coding floor). Connects as
 * clara_wake_write_login and SET ROLEs to clara_wake_interactive — NOT read-only
 * (it COMMITs the draft). Small (max 2) so it fits the connection budget. */
export function getWritePool() {
  if (!_writePool) {
    _writePool = new pg.Pool(loginConfig("write"));
    _writePool.on("error", (err) => console.error("[clara-runtime] write pool error:", err.message));
  }
  return _writePool;
}

/** Gate G1 Annex E step 6: lazy singleton bank pool. clara_wake_bank_login -> SET ROLE
 * clara_wake_bank (NOT read-only, small/least-privilege) — only a DISPATCHED bank_agent
 * workflow's own bank-scoped work uses this; the engine's claim/checkpoint stays clara_runtime. */
export function getBankPool() {
  if (!_bankPool) {
    _bankPool = new pg.Pool(loginConfig("bank"));
    _bankPool.on("error", (err) => console.error("[clara-runtime] bank pool error:", err.message));
  }
  return _bankPool;
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
 * Run one deterministic metric-evaluation batch inside an authorized caller-owned
 * transaction supplied by lane eta. Delta owns the timeout discipline; eta owns
 * the authenticated-human or wake-wrapper identity boundary. An already-stricter
 * timeout is preserved; zero (unlimited) and looser limits become 15 seconds.
 *
 * EXPLICIT TRANSACTION, PROVEN — not assumed. The cap is applied with
 * set_config(..., is_local => true), i.e. SET LOCAL, which reverts at the end of the
 * ENCLOSING transaction. In autocommit each statement is its own transaction, so the
 * cap would revert the instant it was set and every subsequent query would run
 * uncapped — a silent, total failure of the discipline this helper exists to enforce.
 * A docstring saying "call me in a transaction" cannot detect that, so this reads it
 * off the server: a nonce is written to a txn-local GUC and read back in a SEPARATE
 * round trip. Surviving that round trip is positive evidence of an open transaction;
 * an empty or missing read is the fail-closed branch and refuses before fn runs.
 *
 * RESTORATION is the same mechanism, and follows from the same proof. With an
 * explicit transaction established, SET LOCAL's revert at COMMIT/ROLLBACK IS the
 * restoration, performed by the transaction owner (eta) at the boundary eta already
 * controls — the probe GUC included. An explicit try/finally restore was considered
 * and rejected: it would have to run its own query on the way out, which fails with
 * 25P02 whenever fn left the transaction aborted, and a cleanup that throws over a
 * live error is exactly the masking this codebase refuses elsewhere.
 * @template T
 * @param {pg.PoolClient} c an already-authorized transaction client
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withMetricEvaluationBatch(c, fn) {
  const nonce = randomUUID();
  await c.query("select set_config('clara.metric_batch_probe', $1, true)", [nonce]);
  const probe = await c.query("select current_setting('clara.metric_batch_probe', true) as probe");
  if (probe.rows[0]?.probe !== nonce) {
    throw Object.assign(
      new Error(
        "withMetricEvaluationBatch requires an explicit transaction: a txn-local probe did not survive " +
          "its own round trip, so the caller is in autocommit and the statement_timeout cap would revert " +
          "before the batch ran. Open a transaction (eta owns the authorized one) and call again.",
      ),
      { code: "CLARA_METRIC_BATCH_NO_TRANSACTION" },
    );
  }
  const timeoutResult = await c.query(
    "select (extract(epoch from current_setting('statement_timeout')::interval) * 1000)::bigint as current_timeout_ms",
  );
  const currentTimeoutMs = Number(timeoutResult.rows[0]?.current_timeout_ms);
  const batchTimeoutMs = currentTimeoutMs === 0 ? 15000 : Math.min(currentTimeoutMs, 15000);
  await c.query("select set_config('statement_timeout', $1, true)", [`${batchTimeoutMs}ms`]);
  return fn(c);
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
 * Mint an interactive wake credential ON BEHALF OF a firm member (Slice 6, C-11/
 * NEW-5). The DB mint REJECTS a below-bookkeeper OBO with CLR10, and wake_context()
 * re-validates the member's bookkeeper+ standing on every USE — so a demoted author's
 * outstanding credential goes inert. Used by the v2 read tools + the write floor so
 * the coding capability rides the initiator's live authority, not a firm-wide grant.
 * Same secret-handling law as mintWakeCredential (never crosses a WDK step boundary).
 * @param {string} firmId
 * @param {string} oboUserId  the task's created_by (the initiating member)
 * @param {string} [ttl]
 * @returns {Promise<{credentialId: string, secret: string}>}
 */
export function mintWakeCredentialObo(firmId, oboUserId, ttl = READ_CREDENTIAL_TTL) {
  return withRuntime(async (c) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, $3, $4::interval)",
      ["interactive", firmId, oboUserId, ttl],
    );
    return { credentialId: r.rows[0].credential_id, secret: r.rows[0].secret };
  });
}

/**
 * F-A2 (D34 / §D.2c / R-1) — mint the PINNED chat wake kind, `interactive_client`.
 *
 * WHY A NEW KIND RATHER THAN A CLIENT ON `interactive`. `clara.wake_open_question` is keyed on
 * the credential's CLIENT PIN, and a plain `interactive` credential is client-less BY
 * CONSTRUCTION (`ck_wake_credentials_client_0011`) — so the attended lane could not open the
 * typed open question the contract requires. The fix is an EXTENSION of the kind enumeration,
 * never a weakening of the client binding: the census that killed the weakening is on file
 * (`list_unassigned_documents` regresses, `coding_lane` widens SILENTLY and changes frozen
 * chatTurn_v12's answers with no byte change, eight more readers flip, and it contradicts the
 * PIN BLOCKER comment at 0011:1980-1983). The three existing kinds keep byte-identical
 * semantics and no plain `interactive` credential ever gains a client.
 *
 * NARROWED TO ONE CALL PATH IN v13 (R-1, verified sound at the PR-0 gate). Frozen chatTurn_v13
 * mints this credential for the fail-closed `wake_open_question` call and NOTHING else — every
 * other v13 chat read and write, INCLUDING the post, keeps plain `interactive` with its
 * NULL-client guarantee, which is what made the v13-era census findings genuinely not arise
 * rather than merely be argued around.
 *
 * THE DB-SIDE NARROWING THIS PARAGRAPH USED TO CLAIM IS GONE, DELIBERATELY (F-A3 PR-3 SS4,
 * owner ruling 2026-08-25): `interactive_client` no longer holds exactly one `wake_fn_allowlist`
 * row. Full OQ-6 chat parity mirrors the thirteen live `bank_agent` bank-matching wrappers onto
 * `interactive_client` (fourteen rows total: those thirteen, plus `wake_open_question`), on the
 * hard condition that the receipt tells the truth about who acted — see `clara._agent_wake_ctx`
 * and the recut `_agent_bank_receipt` (migration `0129`, SS5). Those thirteen verbs DO post,
 * unlike `wake_open_question`; "posts nothing" is no longer a property of the kind as a whole.
 * `wake_book_staff_advance_application` is the one live `bank_agent` verb deliberately EXCLUDED
 * from the mirror — no chat-parity design exists for it, so it never gains an
 * `interactive_client` row (the two kinds' rosters differ by exactly one name each way; see
 * `0129`'s SS-TAIL). What remains true here is v13-caller-side only: this function is generic
 * (it mints `interactive_client` for whatever call site invokes it with a client id), and it is
 * chatTurn_v14's own infra file, not this one, that states which of the fourteen allowlisted
 * verbs v14 actually drives through it.
 *
 * IT KEEPS `on_behalf_of` (unlike `autodraft`, which forbids it), so the question is opened
 * under the initiating bookkeeper's live authority. The DB mint verifies the client is
 * firm-congruent and ACTIVE — honest footnote, carried from the design: it does NOT verify that
 * this human is authorised for that client, which is the estate's existing firm-scoped model and
 * opens nothing new.
 *
 * FAIL LOUD, NEVER FALL BACK. If the kind is absent (a runtime deployed ahead of PR-1's
 * migration) the DB raises CLR10 `bad wake_kind` and that error PROPAGATES. Silently falling
 * back to plain `interactive` would mint a credential `wake_open_question` refuses CLR03 anyway,
 * one layer further from the cause.
 *
 * Same secret-handling law as the two helpers above, whose signatures and bodies are
 * byte-untouched: minted, used and discarded inside ONE step execution attempt.
 * @param {string} firmId
 * @param {string} oboUserId  the task's created_by (the initiating member)
 * @param {string} clientId   the chat session's client — REQUIRED; the pin is the whole point
 * @param {string} [ttl]
 * @returns {Promise<{credentialId: string, secret: string}>}
 */
export function mintWakeCredentialClientObo(firmId, oboUserId, clientId, ttl = READ_CREDENTIAL_TTL) {
  if (!clientId) throw new Error("interactive_client wake credential requires a client id — the pin is the authority");
  return withRuntime(async (c) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, $3, $4::interval, $5)",
      ["interactive_client", firmId, oboUserId, ttl, clientId],
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
 * Run fn on a clara_wake_interactive WRITE connection (Slice-6 coding floor). The
 * checkout SET ROLEs to clara_wake_interactive (NOT read-only); this helper binds
 * the wake secret TXN-LOCALLY, runs the write, and COMMITs (a write, unlike the read
 * path's rollback). A thrown fn rolls back; checkout()'s shared cleanup (ROLLBACK +
 * RESET ALL) and P4 destroy-on-connection-error then apply. The secret is set with
 * set_config(..., is_local=true) so it never enters SQL text and clears on commit.
 * @template T
 * @param {string} secret  a live interactive wake-credential secret (never persisted/returned)
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 */
export function withWriteWakeScoped(secret, fn) {
  return checkout(getWritePool(), setupSql("clara_wake_interactive", false), async (c) => {
    await c.query("begin");
    // Parameterised SET LOCAL — the secret never enters SQL text; txn-scoped.
    await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
    try {
      const result = await fn(c);
      await c.query("commit");
      return result;
    } catch (err) {
      // Roll back so the wake secret + any partial write are dropped; checkout()'s
      // finally then resets/destroys the connection as appropriate (P4).
      await c.query("rollback").catch(() => {});
      throw err;
    }
  });
}

/**
 * Gate G1 Annex E step 7: clara_wake_bank WRITE scoped-txn helper (shaped after
 * withWriteWakeScoped) — binds the wake secret TXN-LOCALLY, writes, COMMITs; throw -> rollback.
 * @template T
 * @param {string} secret  a live bank_agent wake-credential secret (never persisted/returned)
 * @param {(c: pg.PoolClient) => Promise<T>} fn
 */
export function withBankWakeScoped(secret, fn) {
  return checkout(getBankPool(), setupSql("clara_wake_bank", false), async (c) => {
    await c.query("begin");
    // Parameterised SET LOCAL — the secret never enters SQL text; txn-scoped.
    await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
    try {
      const result = await fn(c);
      await c.query("commit");
      return result;
    } catch (err) {
      await c.query("rollback").catch(() => {});
      throw err;
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

/** Close all pools (process shutdown / test teardown). */
export async function endPools() {
  const runtime = _runtimePool;
  const read = _readPool;
  const write = _writePool;
  const bank = _bankPool;
  _runtimePool = null;
  _readPool = null;
  _writePool = null;
  _bankPool = null;
  if (runtime) await runtime.end().catch(() => {});
  if (read) await read.end().catch(() => {});
  if (write) await write.end().catch(() => {});
  if (bank) await bank.end().catch(() => {});
  await endFreeformPool(); // F-A6: the fifth login's pool, owned by lib/freeform-read.mjs.
}
