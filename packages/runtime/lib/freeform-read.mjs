// F-A6 PR-2 — THE FREEFORM-READ POOL AND ITS ONE WRAPPER (the fifth login).
//
// Design of record: docs/plan/active/freeform-read-design.md v2 §3.2/§3.8/§7 item 4, with
// Annex E.1 (the ops recipe) and Annex J's R-3/R-9 in docs/plan/active/
// freeform-read-annexes-2-record.md. The DB half is migration 0131 (+ the 0136 basis fix).
//
// WHY THIS IS ITS OWN MODULE AND NOT FOUR MORE BRANCHES IN pools.mjs. The freeform checkout
// differs from every other pool's on the three points below, and each one is load-bearing
// rather than cosmetic — a shared `checkout()` with three new flags would bury exactly the
// distinctions a reviewer has to see. pools.mjs keeps ownership of the boot assert and the
// shutdown sweep by CALLING this module (`assertFreeformPoolConfig` / `endFreeformPool`), so
// there is still one boot door and one shutdown door.
//
// H-4 — THE POOL SETS A SESSION `statement_timeout`, AND THE VERB CANNOT.
// PostgreSQL arms the statement timer ONCE, at the top-level statement's start. A `SET LOCAL`
// inside `clara.wake_freeform_read` therefore cannot bound the very statement it runs in — so
// it cannot bound a single stalled FETCH inside that statement either. The verb's own deadline
// (a `clock_timestamp()` check in the fetch loop, 0131 §6.1) is checked BETWEEN fetches: it
// bounds a slow-accumulating result, never one row that never arrives. The session
// `statement_timeout` this module issues BEFORE the verb call is the only wall that fires
// inside a stalled fetch, which is why it is set here and not there. It is deliberately LOOSER
// than the verb's in-loop deadline so the RECEIPTED path wins in the ordinary case: a read that
// overruns 5 s settles a receipt naming `read_timeout` (Tier B, committed), and only a read
// that gets nowhere at all reaches this backstop — a Tier-D death whose honest home is the
// runtime's own task record (design §3.5 Tier D; the 57014 raised inside FETCH is NOT trappable
// by a plpgsql handler, measured, 0131 §0.1(2)).
//
// H-5 — RELEASE WITH `DISCARD ALL`, NOT `reset all`.
// The composed SQL runs as `clara_freeform_ro` on this very connection and may call any
// PUBLIC-executable function, `pg_advisory_lock()` included. `RESET ALL` restores GUCs and
// nothing else: a session advisory lock a payload took on a well-known firm-derived key would
// survive into the next checkout and could wedge a lane that waits on the same key. `DISCARD
// ALL` is the one statement that also runs `pg_advisory_unlock_all()`, closes cursors, drops
// temp tables and deallocates prepared statements — and it subsumes `RESET ALL`, so nothing
// the old cleanup did is lost. (R-9/P-19: a non-local `set_config` from inside the payload
// outlives the transaction on a pooled backend, so the reset itself is not optional either.)
//
// S-1 — THIS WRAPPER CALLS ONLY `clara.wake_freeform_read`, ON EVERY CODE PATH.
// `clara._freeform_arm` and `clara._freeform_settle` are EXECUTE-granted to
// `clara_freeform_ro` (forced by the verb's SECURITY INVOKER chain — 0131 §0.2/D-20), so
// anyone holding this connection can call either DIRECTLY and arm+settle a receipt describing
// a read the verb's cursor/census/fetch ladder never ran. The DB cannot refuse that: the grant
// is structural, not a string check. The runtime's contribution is to make the call
// IMPOSSIBLE BY CONSTRUCTION here rather than merely absent today — this module composes no
// SQL, takes no statement text and no callback, and can only ever issue the four frozen
// constants below. The model's SQL travels as a BIND PARAMETER of the one verb call; there is
// no seam through which any other statement can reach this connection.

import pg from "pg";
import { connConfig, assertNoTargetSplit } from "./relay.mjs";

const TEST_MODE = process.env.RELAY_TEST_MODE === "1";

/** The fifth dedicated login (0131 §2). Created NOLOGIN by the migration; the operator
 *  ceremony grants LOGIN + a password and supplies the DSN below. */
export const FREEFORM_LOGIN = "clara_freeform_login";
/** The group role the checkout SET ROLEs to (N10 — never operate as the bare login). */
export const FREEFORM_ROLE = "clara_freeform_ro";
export const FREEFORM_DSN_VAR = "CLARA_FREEFORM_DATABASE_URL";

/** Read when the pool is CREATED, not at module load — the same discipline as the timeout
 *  below, and for a second reason here: it lets the battery pin the pool to ONE connection so
 *  "the next checkout landed on the same backend" is a measured fact rather than a hope. */
export function freeformPoolMax() {
  const n = Number(process.env.CLARA_FREEFORM_POOL_MAX || 2);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : 2;
}

/** `clara.wake_freeform_read`'s own `c_deadline_ms` (0131 §6.1). Recorded here so the ordering
 *  claim below is checkable, NOT as a second source of truth — the DB owns the number, and it is
 *  the clamp's floor because a session timeout at or under it would fire first and destroy the
 *  receipt that deadline exists to commit. */
export const FREEFORM_VERB_DEADLINE_MS = 5000;

export const FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS = 15000;

/**
 * H-4's wall, in milliseconds. Looser than the verb's own in-loop deadline on purpose (see the
 * header).
 *
 * READ PER CHECKOUT, NOT AT MODULE LOAD, and the reason is not test convenience. This is the one
 * pool constant that is a WALL rather than a capacity knob, so an operator who changes it must
 * see the change take effect on the next read — not only after a process restart that a lane in
 * trouble may be some way from getting. It also makes the number measurable: the battery moves
 * it and watches the kill time move with it, which is the only way to prove the bound is THIS
 * GUC and not something else in the stack that happens to be near the same duration.
 *
 * IT IS CLAMPED, AND THAT IS THE POINT (cross-model review, 2026-08-29). The first cut read the
 * env with `Number(x || default)`, which accepted ANY numeric string — and
 * `CLARA_FREEFORM_STATEMENT_TIMEOUT_MS=0` is the one value that means UNLIMITED in PostgreSQL.
 * A single character in a secret would therefore have emitted `set statement_timeout = 0` and
 * silently DELETED the only wall that bounds a stalled FETCH, with every test still green
 * because every test asserts the statement it expects rather than the number inside it. A wall a
 * config typo can remove is not a wall.
 *
 * THE FLOOR IS THE VERB'S OWN IN-LOOP DEADLINE, EXCLUSIVE. That deadline is 5 s and it commits a
 * receipt naming `read_timeout`; a session timeout at or under it would fire FIRST, killing the
 * transaction (a Tier-D death) and destroying the very audit record the design put there.
 *
 * THERE IS NO CEILING, DELIBERATELY. An operator may have a good reason to RAISE the backstop —
 * a slow replica, a one-off investigation — and a cap would turn a judgement call into a refused
 * lane. The hazard this function exists to close is a wall being REMOVED, not a wall being made
 * looser.
 *
 * A BAD VALUE FALLS BACK TO THE DEFAULT, LOUDLY, RATHER THAN THROWING. The wall stays up either
 * way, and refusing to boot over a mistyped tuning knob would take the whole world down (the
 * assert runs before Nitro) to fix a value that has a perfectly safe default. The warning names
 * the variable, the value and the substitution, so the mistake is visible in the first log line
 * rather than inferred from behaviour later.
 */
export function freeformStatementTimeoutMs() {
  const raw = process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
  if (raw === undefined || raw === null || String(raw).trim() === "") return FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS;
  return clampFreeformStatementTimeout(String(raw));
}

/**
 * Coerce one candidate value, or fall back to the default with a warning. Exported so the BOOT
 * path and the per-read path share ONE definition — a second copy of a rule is how a boot check
 * comes to bless a value the read path then rejects.
 * @param {string} raw the environment's own text, never a pre-coerced number
 * @param {(m: string) => void} [warn]
 */
export function clampFreeformStatementTimeout(raw, warn = (m) => console.warn(m)) {
  const text = String(raw).trim();
  // Parsed from the TEXT, not through `Number()` alone: `Number("0x2710")` is 10000 and
  // `Number("1e999")` is Infinity, so a coercion-only read admits shapes an operator never meant
  // to write and one that is not a number at all. Only a plain run of digits is a millisecond
  // count. (Surrounding whitespace is trimmed first: a secret pasted with a trailing newline is
  // an operator who meant the number.)
  const ms = /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(ms) || !Number.isFinite(ms) || ms <= FREEFORM_VERB_DEADLINE_MS) {
    warn(
      `[clara-runtime] CLARA_FREEFORM_STATEMENT_TIMEOUT_MS is ${JSON.stringify(raw)} — not a whole number of ` +
        `milliseconds greater than the verb's own ${FREEFORM_VERB_DEADLINE_MS}ms in-loop deadline. ` +
        `0 means UNLIMITED in PostgreSQL and would delete the only wall that bounds a stalled FETCH; anything at or ` +
        `below ${FREEFORM_VERB_DEADLINE_MS} would fire before that deadline and destroy the receipt it exists to ` +
        `commit. Using the default ${FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS}ms instead. There is no upper limit — ` +
        `raise it freely if you mean to.`,
    );
    return FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS;
  }
  return ms;
}
const IDLE_IN_TXN_TIMEOUT_MS = Number(process.env.CLARA_IDLE_IN_TXN_TIMEOUT_MS || 15000);
const CONNECT_TIMEOUT_MS = Number(process.env.CLARA_CONNECT_TIMEOUT_MS || 5000);

/**
 * The session setup, issued as its OWN round trip BEFORE the verb call — which is the whole
 * of H-4: the timer must already be armed when the verb's top-level statement starts.
 *
 * NOT read-only, unlike the `clara_agent_ro` read pool. The receipt is written by
 * `_freeform_arm`/`_freeform_settle` (SECURITY DEFINER, owned by clara_fn_owner) inside THIS
 * transaction, and `default_transaction_read_only = on` would refuse those writes with 25006
 * however privileged the definer is — "no read without a receipt" needs a transaction that can
 * commit one.
 */
export function freeformSetupSql() {
  return [
    `set role ${FREEFORM_ROLE}`,
    `set statement_timeout = ${freeformStatementTimeoutMs()}`,
    `set idle_in_transaction_session_timeout = ${IDLE_IN_TXN_TIMEOUT_MS}`,
  ].join("; ");
}

/** S-1: the ONE verb, as a frozen module constant. Nothing here is built from an argument. */
export const FREEFORM_VERB = "clara.wake_freeform_read";
export const FREEFORM_VERB_SQL =
  "select clara.wake_freeform_read($1::text, $2::text, $3::uuid, $4::text, $5::int) as result";
/** The wake secret is bound with the parameterised SET LOCAL form, so it never enters SQL text
 *  (no logging surface) and clears at COMMIT/ROLLBACK. `_freeform_arm` additionally clears it
 *  before the cursor opens (0131 MF-1) — belts, not substitutes. */
export const FREEFORM_SECRET_SQL = "select set_config('clara.wake_secret', $1, true)";
/** H-5. Named so a cell can pin the string itself, not only the behaviour. */
export const FREEFORM_RELEASE_SQL = "discard all";

/** Every SQL text this module is capable of issuing. A cell asserts the captured sequence of a
 *  real call is a subset of this set — the S-1 census, mechanised. */
export const FREEFORM_SQL_TEXTS = Object.freeze([
  "begin",
  "commit",
  "rollback",
  FREEFORM_SECRET_SQL,
  FREEFORM_VERB_SQL,
  FREEFORM_RELEASE_SQL,
]);

function freeformConfig() {
  assertNoTargetSplit(); // fail closed on a canonical-target split before connecting
  const dsn = process.env[FREEFORM_DSN_VAR];
  let base;
  if (TEST_MODE) {
    // Local throwaway: connect with the base env identity, then SET ROLE (N10).
    base = dsn ? { connectionString: dsn } : connConfig();
  } else if (!dsn) {
    throw new Error(`${FREEFORM_DSN_VAR} is required in production — refusing to connect the freeform pool as a fallback identity.`);
  } else {
    base = { connectionString: dsn };
  }
  return { ...base, max: freeformPoolMax(), connectionTimeoutMillis: CONNECT_TIMEOUT_MS };
}

let _freeformPool = null;

/** Lazy singleton freeform pool (clara_freeform_login -> SET ROLE clara_freeform_ro). */
export function getFreeformPool() {
  if (!_freeformPool) {
    _freeformPool = new pg.Pool(freeformConfig());
    _freeformPool.on("error", (err) => console.error("[clara-runtime] freeform pool error:", err.message));
  }
  return _freeformPool;
}

/**
 * The boot assert, called from pools.mjs's `assertProductionPoolConfig` so there is still ONE
 * boot door. EAGER, matching the Slice-6 write floor and Annex E.1's own words ("a world that
 * boots without the DSN must refuse to start, so the ceremony precedes the image") — and
 * DELIBERATELY unlike Gate G1's bank pool, whose DSN is lazy because its ceremony was gated on
 * that same PR merging. F-A6 PR-1 is merged AND ceremonied, so the freeform ceremony can run
 * before this image ships and the eager form costs nothing it does not buy back. THE DEPLOY
 * OBLIGATION THIS CREATES IS REAL AND BELONGS IN THE RUNBOOK: `clara_freeform_login` must hold
 * LOGIN + a password and `CLARA_FREEFORM_DATABASE_URL` must be set BEFORE the chatTurn_v15
 * image boots, or the whole world fails closed.
 */
export function assertFreeformPoolConfig() {
  // H-4's clamp runs FIRST and in EVERY mode, test included — so a mistyped tuning knob is named
  // in the FIRST log line at boot rather than inferred from behaviour weeks later. It never
  // throws: a bad value falls back to the safe default, and the read path clamps again anyway.
  // This is the boot half of "clamped at boot AND on every dynamic read".
  freeformStatementTimeoutMs();
  if (TEST_MODE) return;
  if (!process.env[FREEFORM_DSN_VAR]) {
    throw new Error(
      `${FREEFORM_DSN_VAR} is REQUIRED in production (RELAY_TEST_MODE unset): the freeform pool must connect as its dedicated ` +
        `login (${FREEFORM_LOGIN}) — never a fallback identity. Refusing to start.`,
    );
  }
}

/** Close the freeform pool (process shutdown / test teardown). Called by pools.mjs's endPools. */
export async function endFreeformPool() {
  const pool = _freeformPool;
  _freeformPool = null;
  if (pool) await pool.end().catch(() => {});
}

/**
 * Run ONE audited freeform read. The only entry point; there is no lower-level escape hatch.
 *
 * @param {{secret: string, sql: string, purpose: string, taskId: string, opKey: string, rowCap?: number|null}} args
 *   `secret` a live `interactive`/`interactive_client` wake-credential secret (never persisted,
 *   never returned, never crosses a WDK step boundary); `sql` the model's composed SELECT,
 *   passed as a BIND PARAMETER and never concatenated; `taskId` the triggering chat turn's
 *   agent_task (TA-P4's mechanical binding); `opKey` the deterministic per-call key;
 *   `rowCap` an optional caller ceiling, itself capped by the verb's own constant.
 * @param {{pool?: import("pg").Pool}} [deps] test seam ONLY for the statement-sequence cell —
 *   it can substitute WHERE the statements go, never WHICH statements exist (those are the
 *   frozen constants above), so S-1 is unaffected by it.
 * @returns {Promise<Record<string, unknown>|null>} the verb's own jsonb result, verbatim.
 */
export async function withFreeformRead(args, deps = {}) {
  const { secret, sql, purpose, taskId, opKey, rowCap = null } = args ?? {};
  // Fail loud and local rather than sending a malformed call at the ladder: every one of these
  // is a runtime-wiring mistake, not a model refusal, and the DB's own CLR10 for it would be
  // one layer further from the cause.
  if (typeof secret !== "string" || secret === "") throw new Error("withFreeformRead: a live wake-credential secret is required");
  if (typeof sql !== "string" || sql.trim() === "") throw new Error("withFreeformRead: a non-blank SQL text is required");
  if (typeof purpose !== "string" || purpose.trim() === "") throw new Error("withFreeformRead: a non-blank purpose is required");
  if (typeof taskId !== "string" || taskId === "") throw new Error("withFreeformRead: the triggering task id is required — the receipt binds the read to the turn");
  if (typeof opKey !== "string" || opKey === "") throw new Error("withFreeformRead: an op key is required");

  // H-4, the per-read half: build the setup BEFORE checking a connection out, so a bad band
  // value refuses without ever holding a pool slot (and without a half-configured session
  // reaching the server at all).
  const setup = freeformSetupSql();

  const pool = deps.pool ?? getFreeformPool();
  const client = await pool.connect();
  let broken = false;
  const onErr = () => {
    broken = true;
  };
  client.on("error", onErr);
  try {
    await client.query(setup); // H-4: the timer is armed BEFORE the verb call.
    await client.query("begin");
    await client.query(FREEFORM_SECRET_SQL, [secret]);
    try {
      // S-1: the ONE call. `sql` is a parameter of it, never part of it.
      const r = await client.query(FREEFORM_VERB_SQL, [sql, purpose, taskId, opKey, rowCap]);
      // COMMIT, not the read pool's ROLLBACK: the receipt is written inside this transaction
      // and a rollback would take the audit record with the read (design §3.5 Tier B — the
      // transaction COMMITS so the refusal reason is durable). The DEFERRED must-settle
      // constraint trigger fires HERE, so a read that somehow left its receipt unsettled
      // aborts at COMMIT rather than committing a lie.
      await client.query("commit");
      return r.rows[0]?.result ?? null;
    } catch (err) {
      await client.query("rollback").catch(() => {
        broken = true;
      });
      throw err;
    }
  } finally {
    // Shared cleanup on EVERY path (the P4 discipline, unchanged): close any open transaction,
    // then H-5's DISCARD ALL. If EITHER fails the physical connection is destroyed rather than
    // returned — we never branch on SQLSTATE.
    try {
      await client.query("rollback");
    } catch {
      broken = true;
    }
    try {
      await client.query(FREEFORM_RELEASE_SQL);
    } catch {
      broken = true;
    }
    client.removeListener("error", onErr);
    client.release(broken === true);
  }
}
