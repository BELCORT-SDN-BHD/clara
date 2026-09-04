// 裁-149 — the runtime's background-client error CONTRACT, in one place.
//
// WHAT A BACKGROUND ERROR IS. node-postgres emits `'error'` on a Pool when an IDLE
// client's backend dies with nobody awaiting it — a Supavisor restart, a failover, an
// operator's maintenance kill. An EventEmitter `'error'` with NO listener THROWS, so
// such an event became an `uncaughtException`, and `scripts/serve.mjs`'s crash-only
// policy (its own `process.on("uncaughtException")`) took the whole process group down.
// That is "crash-as-contract": safe, because Fly restarts the machine and durable runs
// resume — but indistinguishable, from outside, from a real fault.
//
// THE RULING (裁-149, owner, 2026-09-03, option C — the hybrid). Two halves:
//
//   1. THE GENERAL POOL LOGS, COUNTS AND RECYCLES. `relay.mjs`'s `makePool()` was the
//      ONE `new pg.Pool` in the whole runtime with no `'error'` listener — every other
//      pool site already had one (`pools.mjs:196,205,216,227`, `checkout-pools.mjs:124,133`,
//      `freeform-read.mjs:214`, `db.ts:67`). The affected client is already out of the
//      pool by the time the event fires, so there is nothing to repair: the correct
//      behaviour is to log, COUNT, and let the next checkout open a fresh connection.
//      It is COUNTED rather than swallowed because the relay pool is the runner's real
//      connection pool — repeated background errors there are an AVAILABILITY signal,
//      surfaced on `/ready` as a WARNING that never flips `ready` false.
//
//   2. THE LEADER'S DEDICATED SESSION STAYS FAIL-LOUD AND FAILS OVER — and its as-built
//      posture is NOT what the ruling's premise states, which the PR that built this
//      had to correct rather than "keep". 裁-149 says `relay.mjs` attaches no listener
//      "nor to the leader's dedicated `makeClient()` session". Both leader call sites
//      already do: `scripts/relay.mjs:139-141` records into `connErr` and `:153` rethrows
//      it at the top of the next poll; `lib/leader.mjs:177-179` does the identical thing
//      and `:188` rethrows. The outer loops then reconnect with backoff
//      (`scripts/relay.mjs:311-324`). The FAILOVER the ruling wanted is untouched by
//      that: the dead session's SESSION-level advisory lock is released by the backend
//      the moment the session ends, so a standby blocked in `acquireLeaderLock` takes
//      over immediately. What the as-built adds is that the SURVIVING process
//      re-acquires instead of dying — strictly better than a machine restart. So the
//      leader is deliberately left byte-untouched; the correction is recorded in
//      `docs/ARCHITECTURE.md` §4.3 and pinned by a cell.
//
// This module owns ONLY the pool half. It has no imports and no DB reach — it is a
// counter plus a listener, kept separate from `relay.mjs` because that file is already
// past the repo's file-size ceiling and because a contract deserves one readable home.

const state = { errors: 0, lastErrorAt: null, lastErrorCode: null };

/**
 * SANITIZED error identity — a short libpq/Node code token, or the constant "unknown".
 * NEVER raw DB text: `/ready` serves this object on an UNAUTHENTICATED endpoint and
 * `lib/health.mjs`'s own contract (its opening paragraph) forbids leaking raw DB text
 * there. A connection-level error frequently carries no `code` at all — which is
 * exactly why the fallback is a constant and not the message. The pattern is a
 * whitelist, not a scrub: anything that is not an identifier-shaped token is dropped
 * whole rather than trimmed, so a code-shaped field carrying a sentence cannot leak a
 * prefix of it.
 * @param {unknown} err
 * @returns {string}
 */
export function sanitizedErrorCode(err) {
  const code = err && typeof err === "object" ? /** @type {{code?: unknown}} */ (err).code : undefined;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : "unknown";
}

/**
 * Attach the 裁-149 clause-1 posture to a pool: log at error level, COUNT, stamp the
 * time and the sanitized code — never a silent swallow, never a crash. Returns the same
 * pool so a call site can wrap its constructor in one expression.
 * @template {{on: (event: string, listener: (err: unknown) => void) => unknown}} P
 * @param {P} pool
 * @param {string} label  the pool's identity in the log line (never a DSN)
 * @returns {P}
 */
export function attachPoolErrorContract(pool, label) {
  pool.on("error", (err) => {
    state.errors += 1;
    state.lastErrorAt = new Date().toISOString();
    state.lastErrorCode = sanitizedErrorCode(err);
    const message = err && typeof err === "object" && "message" in err ? /** @type {{message: unknown}} */ (err).message : err;
    console.error(`[clara-runtime] ${label} pool error #${state.errors} (${state.lastErrorCode}):`, message);
  });
  return pool;
}

/**
 * The relay pool's background-error counters (裁-149 clause 1) — read by `/ready`.
 * Monotonic since process start; `errors > 0` is a WARNING, never a readiness failure.
 * @returns {{errors:number, last_error_at:string|null, last_error_code:string|null}}
 */
export function relayPoolHealth() {
  return { errors: state.errors, last_error_at: state.lastErrorAt, last_error_code: state.lastErrorCode };
}

/** Test-only reset — the counter is process-global, so cells must not leak into each other. */
export function _resetPoolErrorContractForTest() {
  state.errors = 0;
  state.lastErrorAt = null;
  state.lastErrorCode = null;
}
