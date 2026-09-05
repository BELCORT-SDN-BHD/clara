// Slice-2 rig — shared harness CORE (NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it). Fixtures + fn wrappers live in the
// sibling `rig-fixtures.mjs` (which re-exports everything here).
//
// Written INDEPENDENTLY from the migrations lane, straight from the Slice-2
// design contract (scratchpad/slice2-design.md v1 AMENDED by slice2-design-v2.md
// — v2 wins on conflict). The point is a second, adversarial implementation of
// the contract that cross-checks lane-M's schema.
//
// Connection: env only (lib/pg.mjs). Local validate target is the throwaway
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_test  (trust).
//
// Lane model (v2 §A — THE load-bearing change vs v1):
//   * Human lane — entry fns granted to clara_authenticated; identity from
//     request.jwt.claims ->> 'sub'; firm from LIVE active membership.
//   * Wake lane  — `wake_*` entry fns granted to the wake roles; identity+firm
//     from the wake credential in GUC clara.wake_secret (txn-local).
//   * Shared internal cores `clara._<name>_core(...)` are ungranted.
//   Impersonation is by SET ROLE onto the GROUP role + the matching GUC.
//
// SIGNATURE STRATEGY: every clara function is called with NAMED arguments
// (`p_x => $n`) using the contract's documented parameter names, NOT positional
// order. The contract's positional order is under-specified and in places not a
// legal Postgres signature (draft_entry / approve_entry / record_notification
// list defaulted params BEFORE the required p_op_key). Named args bind by name
// and let us omit defaulted optionals, so the rig depends only on the parameter
// NAMES the contract states — a divergence there is a real lane-M finding.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { makePool } from "../lib/pg.mjs";
import { migrate } from "../scripts/migrate.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The one global agent identity row (design §2, id-fixed, seeded by 0002). */
export const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";

/** NOLOGIN group roles the rig SET ROLEs into (design §1 / v2 §A/§B). */
export const ROLES = {
  fnOwner: "clara_fn_owner",
  authenticated: "clara_authenticated",
  agentRo: "clara_agent_ro",
  wakeInteractive: "clara_wake_interactive",
  wakeProactive: "clara_wake_proactive",
  runtime: "clara_runtime",
};

/** Clara SQLSTATEs (design §5). RAISE ... USING ERRCODE = 'CLRxx'. */
export const CLR = {
  client: "CLR01", // client attribution
  provenance: "CLR02", // provenance binding
  wake: "CLR03", // wake authority
  authz: "CLR04", // authz / role-floor / actor
  makerChecker: "CLR05", // maker-checker distinctness
  revision: "CLR06", // revision token
  balance: "CLR07", // balance
  immutable: "CLR08", // immutability / append-only
  lastOwner: "CLR09", // last-owner protection
  badRequest: "CLR10", // malformed args / unknown account / bad lifecycle
  notFound: "CLR11", // not-found-in-your-firm (NO existence oracle)
  stale: "CLR12", // stale context / books-version freshness gate (Slice 3, §2.5)
};

/** Standard Postgres SQLSTATEs the rig asserts directly. */
export const PG = {
  insufficientPrivilege: "42501",
  readOnly: "25006",
  checkViolation: "23514",
  uniqueViolation: "23505",
  undefinedFunction: "42883",
  invalidText: "22P02",
  foreignKeyViolation: "23503",
};

/** Money shapes (design: bigint cents; default high-stakes threshold RM10k). */
export const HIGH_STAKES_CENTS = 1_000_000;
export const ROUTINE_CENTS = 50_000;

// ---------------------------------------------------------------------------
// Pool + impersonation
// ---------------------------------------------------------------------------

let _pool = null;
/** Lazy shared pool. max>1 so the concurrency cases (T8/T14) get two clients. */
export function getPool() {
  if (!_pool) _pool = makePool({ max: 8 });
  return _pool;
}

/** Close the pool (call from an `after` hook). */
export async function endPool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

function assertRoleName(role) {
  if (!/^clara_[a-z_]+$/.test(role)) {
    throw new Error(`refusing to SET ROLE to a non-clara identifier: ${role}`);
  }
  return role;
}

/**
 * Run `fn(client)` under an impersonated identity, then ALWAYS reset the pooled
 * client (rollback any open/aborted txn → RESET ROLE → RESET ALL) before it goes
 * back to the pool. RESET ALL clears request.jwt.claims / clara.wake_secret so a
 * released client can never leak session state to the next checkout (T16b).
 *
 * @param {{role?:string, jwtSub?:string|null, wakeSecret?:string|null, transaction?:boolean}} ctx
 * @param {(client: import("pg").PoolClient) => Promise<any>} fn
 */
export async function withActor(ctx, fn) {
  const { role = null, jwtSub = null, wakeSecret = null, transaction = false } = ctx;
  const client = await getPool().connect();
  let inTxn = false;
  try {
    // A role-less call (asRoot) must run as the session superuser. RESET ALL does
    // NOT reset the role, so a manual block that forgot RESET ROLE could leave a
    // pooled client impersonating; force a clean baseline here (belt-and-suspenders).
    if (role) await client.query(`set role ${assertRoleName(role)}`);
    else await client.query("reset role");
    if (transaction) {
      await client.query("begin");
      inTxn = true;
    }
    // is_local = transaction: human autocommit sets session-level (survives the
    // single statement); wake sets txn-local (auto-cleared at COMMIT — v2 §C).
    if (jwtSub !== null) {
      await client.query("select set_config('request.jwt.claims', $1, $2)", [
        JSON.stringify({ sub: jwtSub, role: "authenticated" }),
        transaction,
      ]);
    }
    if (wakeSecret !== null) {
      await client.query("select set_config('clara.wake_secret', $1, $2)", [wakeSecret, transaction]);
    }
    const out = await fn(client);
    if (inTxn) {
      await client.query("commit");
      inTxn = false;
    }
    return out;
  } catch (err) {
    if (inTxn) {
      try {
        await client.query("rollback");
      } catch {
        /* connection already aborted — reset in finally */
      }
    }
    throw err;
  } finally {
    try {
      await client.query("rollback");
    } catch {
      /* no open txn — fine */
    }
    try {
      await client.query("reset role");
    } catch {
      /* best-effort */
    }
    try {
      await client.query("reset all");
    } catch {
      /* best-effort */
    }
    client.release();
  }
}

export const asRoot = (fn) => withActor({}, fn);
export const asHuman = (sub, fn) => withActor({ role: ROLES.authenticated, jwtSub: sub }, fn);
export const asRole = (role, fn) => withActor({ role }, fn);
export const asWake = (role, secret, fn) => withActor({ role, wakeSecret: secret, transaction: true }, fn);

export const rootQuery = (sql, params) => asRoot((c) => c.query(sql, params));
export const humanQuery = (sub, sql, params) => asHuman(sub, (c) => c.query(sql, params));
export const roleQuery = (role, sql, params) => asRole(role, (c) => c.query(sql, params));
export const wakeQuery = (role, secret, sql, params) => asWake(role, secret, (c) => c.query(sql, params));

/**
 * Claim `firm` as the estate's sole operator via uq_firms_one_operator (0133:274), waiting out
 * any current holder rather than assuming there is none. The singleton has FOUR takers across
 * three files and two packages with no ordering guarantee under CI's concurrent `pnpm -r
 * --if-present test` -- g1-wake-engine.test.mjs's before(), p4t2-fixtures.mjs's markOperator
 * (both db-side, both now route through this ONE shared helper — opus review round on PR #501,
 * the new-MEDIUM fix: a bare, unprotected take here or in markOperator meant EVERY OTHER taker's
 * critical section — tens to hundreds of ms each — was a chance to crash this one with a raw,
 * uncaught unique_violation instead of a bounded wait), and packages/runtime/tests/g1-wake-bodies
 * .test.mjs's G1B-C1 cell (a different package — mirrors this exact contract by value, its own
 * rig.mjs export of the same name, never a cross-package import).
 *
 * Retries ONLY on uq_firms_one_operator's OWN violation, matched by NAME (`err.constraint`,
 * MEASURED populated for this bare `CREATE UNIQUE INDEX ... WHERE` violation against a live rig
 * — never assumed) rather than by `err.code` alone: `clara.firms` carries exactly one unique
 * index today, so the two are equivalent NOW, but matching the bare code would silently start
 * retrying a genuinely different bug — a future second unique index, or an audit trigger — as
 * contention, all the way to the timeout, instead of surfacing it immediately.
 *
 * A successful claim is confirmed by `rowCount === 1`, never merely "the UPDATE did not throw"
 * — an UPDATE matching zero rows (a vanished or mistyped firm id) does not raise
 * uq_firms_one_operator either, and would otherwise exit the loop having silently claimed
 * nothing (still fails closed downstream, at the next operator-gated call, but as a confusing
 * refusal rather than a self-evidencing one here).
 *
 * Bounded: an exhausted wait throws loud, naming the current holder — never a silent skip.
 *
 * ACCEPTED CONSEQUENCE, by design, not a bug: a process that dies between claiming and its own
 * release (a killed test run, an after() hook that never fires) leaks the flag until something
 * scoped to what IT claimed clears it, or the rig resets — there is no lease/expiry. The
 * estate-wide clear this replaced would have silently RECLAIMED a leaked flag instead, which is
 * worse: it could just as easily steal a DIFFERENT, live claimant's flag out from under it. A
 * stuck flag surfaces as a loud, later, NAMED failure (this same function, on the next caller,
 * refusing to proceed); a stolen one surfaces as a silent, wrong-attribution failure, somewhere
 * else entirely. This cannot persist on CI (a fresh container per job); on a reused local rig it
 * can — the fix is `update clara.firms set is_operator=false where id='<the stuck id>'`, by hand,
 * once.
 *
 * @param {string} firm
 * @param {{timeoutMs?: number, pollMs?: number}} [opts]
 */
export async function claimOperatorFirm(firm, { timeoutMs = 90_000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let result;
    try {
      result = await rootQuery("update clara.firms set is_operator = true where id = $1", [firm]);
    } catch (err) {
      if (err.constraint !== "uq_firms_one_operator") throw err; // a genuine failure — surface it
      if (Date.now() >= deadline) {
        const holder = await rootQuery("select id from clara.firms where is_operator");
        throw new Error(
          `claimOperatorFirm(${firm}): the rig still has an operator firm (id=${holder.rows[0]?.id ?? "unknown"}) after waiting ${timeoutMs}ms — this would otherwise collide with uq_firms_one_operator; a legitimate concurrent holder should have released it well within this window`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }
    if (result.rowCount !== 1) {
      throw new Error(`claimOperatorFirm(${firm}): UPDATE matched ${result.rowCount} row(s), not 1 — no such firm id, or it matched more than expected`);
    }
    return; // claimed — self-evidenced by rowCount, not merely "did not throw"
  }
}

// ---------------------------------------------------------------------------
// Personas + generic named-argument call builder
// ---------------------------------------------------------------------------

export const human = (sub) => ({ kind: "human", sub });
export const wakeActor = (role, secret) => ({ kind: "wake", role, secret });
export const roleActor = (role) => ({ kind: "role", role });
export const rootActor = { kind: "root" };

/** Dispatch a single query under a persona. */
export function runAs(persona, sql, params) {
  switch (persona.kind) {
    case "human":
      return humanQuery(persona.sub, sql, params);
    case "wake":
      return wakeQuery(persona.role, persona.secret, sql, params);
    case "role":
      return roleQuery(persona.role, sql, params);
    default:
      return rootQuery(sql, params);
  }
}

/**
 * Build `select clara.<fn>(name => $1, name => $2::cast, ...) as result`.
 * @param {string} fnName
 * @param {{name:string, cast?:string}[]} specs  aligned with the params array
 */
export function namedCall(fnName, specs) {
  const args = specs.map((s, i) => `${s.name} => $${i + 1}${s.cast ? `::${s.cast}` : ""}`);
  return `select clara.${fnName}(${args.join(", ")}) as result`;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/**
 * Assert `fn()` rejects with EXACTLY SQLSTATE `code`. A success, a missing code,
 * or a different code all FAIL — and the failure message surfaces the ACTUAL
 * code + message (guard-first ordering means a wrong code is a real defect).
 */
export async function assertRaises(code, fn, label = "operation") {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  if (!err) assert.fail(`${label}: expected SQLSTATE ${code} but the call SUCCEEDED (no error)`);
  if (err.code !== code) {
    assert.fail(`${label}: expected SQLSTATE ${code} but got ${err.code ?? "(no code)"} — ${err.message}`);
  }
  return err;
}

/** Like assertRaises, for the few contract cases that name a small code set. */
export async function assertRaisesOneOf(codes, fn, label = "operation") {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  if (!err) assert.fail(`${label}: expected one of ${codes.join("/")} but the call SUCCEEDED (no error)`);
  if (!codes.includes(err.code)) {
    assert.fail(`${label}: expected one of ${codes.join("/")} but got ${err.code ?? "(no code)"} — ${err.message}`);
  }
  return err;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

let _opCounter = 0;
/** Unique op_key per call (idempotency-key fixtures must not collide on re-run). */
export const opk = (tag = "op") =>
  `${tag}_${Date.now().toString(36)}_${(_opCounter++).toString(36)}_${randomUUID().slice(0, 8)}`;

/** A valid 64-hex sha256 derived from a seed (documents CHECK: ^[0-9a-f]{64}$). */
export const sha = (seed) => createHash("sha256").update(String(seed)).digest("hex");

/**
 * A bank-account-number fixture value that ALWAYS carries at least one digit, so it can never
 * trip `clara._add_bank_account_core`'s CLR10 "account number % has no digits" wall
 * (0155_client_identifiers_unique.sql:557 -- `v_digits := regexp_replace(v_number,'\D','','g');
 * if btrim(v_digits) = '' then raise ... CLR10`) by pure chance.
 *
 * The flake this fixes: `${prefix}${randomUUID().slice(0, 6)}` draws six raw hex characters,
 * which are all-letter -- no digit at all -- with probability (6/16)^6 ~= 0.28% whenever the
 * prefix itself carries no digit (measured: f-a3pr3.mfA.pos, CI run 33985989527, prefix
 * "MFAPOS"). Same shape (a prefix plus six hex-class characters, so the wall's accepted
 * character set is unchanged), but the LAST character is forced to a decimal digit derived
 * from the same random draw -- every value this returns satisfies the wall's predicate by
 * construction, not by luck.
 */
export function acctNo(prefix = "") {
  const hex = randomUUID().replace(/-/g, "").slice(0, 6);
  const digit = (parseInt(hex[5], 16) % 10).toString();
  return `${prefix}${hex.slice(0, 5)}${digit}`;
}

/** A balanced 2-leg entry: debit `cash` / credit `sales`, both = amount. */
export function balanced(coa, amount, { desc = "rig" } = {}) {
  return [
    { account_code: coa.cash, debit_cents: amount, credit_cents: 0, description: `${desc}-dr` },
    { account_code: coa.sales, debit_cents: 0, credit_cents: amount, description: `${desc}-cr` },
  ];
}

// ---------------------------------------------------------------------------
// Readiness (lane-M may not have landed the schema yet)
// ---------------------------------------------------------------------------

/** Apply migrations (idempotent, advisory-locked) then report whether the
 * Slice-2 governed surface is present. When absent, the suites SKIP (not fail),
 * so a static/early run reports skips rather than crashing. */
export async function ensureReady() {
  await migrate({ log: () => {} });
  const r = await rootQuery(
    "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = 'draft_entry' limit 1",
  );
  return r.rowCount > 0;
}
