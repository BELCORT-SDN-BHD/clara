// F-A8 (Wave-F Track A) — the internet lane: shared rig MEASUREMENT fixtures.
//
// NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it (the
// x38-match-fixtures.mjs / f-a1-statements-fixtures.mjs precedent). Design of record:
// docs/plan/active/internet-lane-design.md + internet-lane-annexes.md Annex C/E/F/G.
//
// WHY THIS FILE IS NAME-AGNOSTIC. Every helper below takes the object it measures as an
// ARGUMENT. Nothing here hardcodes an F-A8 verb or table name, and nothing here encodes an
// expectation. That is deliberate: these are INSTRUMENTS, and an instrument that already
// knows the answer cannot be used to find one. The expectations live in the `.test.mjs`
// files that import this module.
//
// THE TWO DISCIPLINES THIS MODULE EXISTS TO SERVE (Annex C's header, both bought at the
// F-A2 PR-1 gate):
//   1. A fixture must be buildable in the REAL order, and it THROWS on construction failure
//      rather than returning a degraded object a cell can silently assert against.
//   2. A census that cannot say NO is meaningless. Every scan-shaped helper here has a
//      companion `withThrowaway*` twin that hand-adds the thing the scan forbids, so the
//      calling cell can confirm the SAME scan fails. `absent()` reads are never treated as
//      evidence on their own — see `assertMeasured`.
//
// READINESS. The probe is a CATALOG fact, never `clara.schema_migrations` and never a
// migration number: this item is authored as `UNNUMBERED_*` and numbered at MERGE (hard
// constraint 10), so a battery that gated on a number would have to be re-cut by the
// conductor at merge time. `f_a8Ready` takes the catalog fact as an argument for the same
// reason the rest of the file does.

import { randomUUID } from "node:crypto";
import { ROLES, rootQuery } from "./rig-helpers.mjs";

// ---------------------------------------------------------------------------
// 0 · Honesty helpers
// ---------------------------------------------------------------------------

/**
 * THROW rather than return a degraded object. Every constructor below funnels through
 * this, so a fixture that could not be built stops the cell instead of letting it assert
 * against a half-built world (Annex C discipline 1).
 */
export function must(value, what) {
  if (value === null || value === undefined || value === false) {
    throw new Error(`f-a8 fixture could not be built: ${what}`);
  }
  return value;
}

/**
 * A read that returned NOTHING is not evidence. Use this wherever a cell is about to
 * conclude something from an empty result set: it forces the caller to say out loud that
 * it expected the read to be able to produce rows at all (review law 2 — an absence from
 * an instrument that cannot say NO has a meaningless YES).
 */
export function assertMeasured(rows, what) {
  if (!Array.isArray(rows)) throw new Error(`f-a8: ${what} did not return a row array`);
  return rows;
}

/** A collision-free suffix for throwaway catalog objects. */
export const throwawaySuffix = () => `_fa8p_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

// ---------------------------------------------------------------------------
// 1 · Readiness
// ---------------------------------------------------------------------------

/**
 * Readiness by CATALOG FACT. `kind` is 'table' or 'function'; `ident` is a relation name
 * (`clara.policy_drafts`) or a full signature (`clara.decide_policy_draft(uuid,text,text)`).
 * Returns a boolean — a cell turns that into `t.skip(...)` with a NAMED reason, never a
 * silent return.
 */
export async function f_a8Ready(kind, ident) {
  if (kind === "table") {
    const r = await rootQuery("select to_regclass($1) is not null as ok", [ident]);
    return r.rows[0].ok === true;
  }
  if (kind === "function") {
    const r = await rootQuery("select to_regprocedure($1) is not null as ok", [ident]);
    return r.rows[0].ok === true;
  }
  throw new Error(`f_a8Ready: unknown kind ${kind}`);
}

// ---------------------------------------------------------------------------
// 2 · Table posture (Annex E: RLS + FORCE, one owner policy, zero app-role grants)
// ---------------------------------------------------------------------------

/**
 * Everything Annex E's posture is made of, MEASURED off the live catalog for one table.
 * Returns `{ exists, rls, force, owner, policies[], triggerFns[], grants[] }`.
 * `grants` lists (grantee, privilege) pairs for every non-owner grantee — Annex E's
 * "zero direct app-role grants" is the caller asserting this array is empty.
 */
export async function tablePosture(relname) {
  const base = await rootQuery(
    `select c.relrowsecurity as rls, c.relforcerowsecurity as force,
            pg_get_userbyid(c.relowner) as owner
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = $1 and c.relkind = 'r'`, [relname]);
  if (base.rowCount === 0) return { exists: false, relname };
  const policies = await rootQuery(
    `select policyname, permissive, roles::text as roles, cmd, coalesce(qual,'') as qual,
            coalesce(with_check,'') as with_check
       from pg_policies where schemaname = 'clara' and tablename = $1 order by policyname`, [relname]);
  const triggers = await rootQuery(
    `select t.tgname, p.proname as fn
       from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = ('clara.' || $1)::regclass and not t.tgisinternal order by t.tgname`, [relname]);
  const grants = await rootQuery(
    `select a.grantee::regrole::text as grantee, a.privilege_type as privilege
       from pg_class c join pg_namespace n on n.oid = c.relnamespace,
            lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where n.nspname = 'clara' and c.relname = $1
        and a.grantee <> c.relowner
      order by 1, 2`, [relname]);
  return {
    exists: true,
    relname,
    rls: base.rows[0].rls,
    force: base.rows[0].force,
    owner: base.rows[0].owner,
    policies: policies.rows,
    triggerFns: triggers.rows.map((r) => r.fn).sort(),
    grants: grants.rows.map((r) => `${r.grantee}:${r.privilege}`),
  };
}

/** Constraint definitions for one table, by name — for asserting a paired CHECK verbatim. */
export async function constraintDefs(relname) {
  const r = await rootQuery(
    `select co.conname, pg_get_constraintdef(co.oid) as def
       from pg_constraint co join pg_class cl on cl.oid = co.conrelid
       join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'clara' and cl.relname = $1 order by co.conname`, [relname]);
  return new Map(r.rows.map((x) => [x.conname, x.def]));
}

/** Index definitions for one table, by name — for asserting a partial unique "live row" index. */
export async function indexDefs(relname) {
  const r = await rootQuery(
    "select indexname, indexdef from pg_indexes where schemaname = 'clara' and tablename = $1 order by indexname",
    [relname]);
  return new Map(r.rows.map((x) => [x.indexname, x.indexdef]));
}

/** Column shape for one table: name → { type, nullable, dflt, generated }. */
export async function columnShape(relname) {
  const r = await rootQuery(
    `select column_name, data_type, is_nullable, coalesce(column_default,'') as dflt,
            is_generated, coalesce(generation_expression,'') as genexpr
       from information_schema.columns
      where table_schema = 'clara' and table_name = $1 order by ordinal_position`, [relname]);
  return new Map(r.rows.map((x) => [x.column_name, {
    type: x.data_type, nullable: x.is_nullable === "YES", dflt: x.dflt,
    generated: x.is_generated !== "NEVER", genexpr: x.genexpr,
  }]));
}

// ---------------------------------------------------------------------------
// 3 · Function posture (Annex E: definer, pinned search_path, one grantee, no PUBLIC)
// ---------------------------------------------------------------------------

/**
 * Everything the DEFINER-hygiene posture is made of, for ONE function identified by its
 * full signature. Returns `{ exists, secdef, searchPath, owner, publicExec, grantees[] }`.
 * `grantees` excludes the owner, so a core's assertion is `grantees.length === 0`.
 */
export async function fnPosture(signature) {
  const oid = await rootQuery("select to_regprocedure($1)::oid as oid", [signature]);
  if (!oid.rows[0].oid) return { exists: false, signature };
  const r = await rootQuery(
    `select p.prosecdef, pg_get_userbyid(p.proowner) as owner, p.provolatile,
            coalesce(array_to_string(p.proconfig, ','), '') as cfg
       from pg_proc p where p.oid = $1::oid`, [oid.rows[0].oid]);
  const acl = await rootQuery(
    `select a.grantee::regrole::text as grantee, a.privilege_type as privilege
       from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = $1::oid order by 1`, [oid.rows[0].oid]);
  const owner = r.rows[0].owner;
  return {
    exists: true,
    signature,
    secdef: r.rows[0].prosecdef,
    volatility: r.rows[0].provolatile,
    owner,
    searchPath: /(^|,)search_path=clara, pg_temp(,|$)/.test(r.rows[0].cfg),
    cfg: r.rows[0].cfg,
    publicExec: acl.rows.some((x) => x.grantee === "-" && x.privilege === "EXECUTE"),
    grantees: acl.rows.filter((x) => x.privilege === "EXECUTE" && x.grantee !== owner && x.grantee !== "-")
      .map((x) => x.grantee).sort(),
  };
}

/**
 * Can `role` EXECUTE `signature`? Asked of the SERVER via has_function_privilege — never
 * inferred from an ACL string, which is a projection of the privilege and not the
 * privilege itself (review law 3).
 */
export async function canExecute(role, signature) {
  const r = await rootQuery(
    "select has_function_privilege($1, to_regprocedure($2)::oid, 'execute') as ok", [role, signature]);
  return r.rows[0].ok === true;
}

/** The five app roles T17 sweeps. Named here so a cell cannot quietly test four of them. */
export const APP_ROLES = [
  ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime,
];

/**
 * The exact-set EXECUTE map for one function across every app role — the per-verb shape of
 * T17's question, so a cell can assert "exactly one role, and it is this one" without
 * re-running the whole matrix.
 */
export async function executeMatrix(signature) {
  const out = {};
  for (const role of APP_ROLES) out[role] = await canExecute(role, signature);
  return out;
}

// ---------------------------------------------------------------------------
// 4 · The wake_fn_allowlist roster — RELATIVE, never absolute
// ---------------------------------------------------------------------------
//
// A 58-PR merge train means the absolute row count moves under any lane that asserts it
// (F-A5/PR-2 adds an `interactive` row ahead of F-A8/PR-1 in the train). So the roster
// helpers below return a SET and a snapshot/delta pair, and the cells assert membership
// and a delta — never a total.

/** The live roster as a Set of `"kind|fn"` strings, plus the raw rows. */
export async function allowlistSnapshot() {
  const r = await rootQuery(
    "select wake_kind, function_name from clara.wake_fn_allowlist order by wake_kind, function_name");
  assertMeasured(r.rows, "wake_fn_allowlist read");
  return {
    rows: r.rows,
    set: new Set(r.rows.map((x) => `${x.wake_kind}|${x.function_name}`)),
    count: r.rowCount,
  };
}

/**
 * What changed between two snapshots. Returns `{ added[], removed[], delta }`. A lane's
 * cell asserts `added` is exactly its own pairs, `removed` is empty, and `delta` equals
 * the number of pairs it claims — all three, because "added mine" without "removed
 * nothing" would pass a re-seed that dropped somebody else's row.
 */
export function allowlistDiff(before, after) {
  const added = [...after.set].filter((k) => !before.set.has(k)).sort();
  const removed = [...before.set].filter((k) => !after.set.has(k)).sort();
  return { added, removed, delta: after.count - before.count };
}

// ---------------------------------------------------------------------------
// 5 · The zero-CoR differential (Annex G.1)
// ---------------------------------------------------------------------------

/**
 * Every clara function body, keyed by `name(identity_args)` → sha256 of `prosrc`. Take one
 * before the migration and one after; a body whose sha MOVED is a CoR, and F-A8 PR-1
 * predicts ZERO of them. This is the claim F-A2 discovered was false for several of its
 * own bodies, so it is measured rather than asserted.
 */
export async function bodyShas() {
  const r = await rootQuery(
    `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
            encode(sha256(convert_to(coalesce(p.prosrc, ''), 'UTF8')), 'hex') as sha
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'`);
  assertMeasured(r.rows, "clara prosrc census");
  if (r.rowCount === 0) throw new Error("f-a8: the prosrc census found ZERO clara functions — the instrument is broken, not the estate");
  return new Map(r.rows.map((x) => [x.sig, x.sha]));
}

/** `{ changed[], added[], dropped[] }` between two `bodyShas()` maps. */
export function bodyDiff(before, after) {
  const changed = [];
  const added = [];
  for (const [sig, sha] of after) {
    if (!before.has(sig)) added.push(sig);
    else if (before.get(sig) !== sha) changed.push(sig);
  }
  const dropped = [...before.keys()].filter((sig) => !after.has(sig));
  return { changed: changed.sort(), added: added.sort(), dropped: dropped.sort() };
}

// ---------------------------------------------------------------------------
// 6 · Adversarial twins — the proof that each census CAN say NO
// ---------------------------------------------------------------------------
//
// Each twin creates the forbidden thing, hands control back to the cell, and ALWAYS
// removes it in a finally. The cell's job is to assert that the SAME scan it just saw
// pass now fails. A census asserted only in its passing direction is a census that has
// never been shown to work.

/** Run `fn()` with a throwaway clara function EXECUTE-granted to `role`. */
export async function withThrowawayGrantedFn(role, fn) {
  const name = `_l19_twin${throwawaySuffix()}`;
  await rootQuery(`create function clara.${name}() returns int language sql immutable as $$ select 1 $$`);
  try {
    await rootQuery(`revoke execute on function clara.${name}() from public`);
    await rootQuery(`alter function clara.${name}() owner to ${ROLES.fnOwner}`);
    await rootQuery(`grant execute on function clara.${name}() to ${role}`);
    return await fn(`clara.${name}()`);
  } finally {
    await rootQuery(`drop function if exists clara.${name}()`).catch(() => {});
  }
}

/** Run `fn()` with a throwaway SECURITY DEFINER function that pins NO search_path. */
export async function withThrowawayUnpinnedDefiner(fn) {
  const name = `_l19_twin${throwawaySuffix()}`;
  await rootQuery(`create function clara.${name}() returns int language sql immutable security definer as $$ select 1 $$`);
  try {
    await rootQuery(`revoke execute on function clara.${name}() from public`);
    await rootQuery(`alter function clara.${name}() owner to ${ROLES.fnOwner}`);
    return await fn(`clara.${name}()`);
  } finally {
    await rootQuery(`drop function if exists clara.${name}()`).catch(() => {});
  }
}

/** Run `fn()` with a throwaway clara base table that has RLS enabled but NOT forced. */
export async function withThrowawayUnforcedTable(fn) {
  const name = `_l19_twin${throwawaySuffix()}`;
  await rootQuery(`create table clara.${name}(id uuid primary key default gen_random_uuid())`);
  try {
    await rootQuery(`alter table clara.${name} enable row level security`);
    return await fn(name);
  } finally {
    await rootQuery(`drop table if exists clara.${name}`).catch(() => {});
  }
}

/**
 * Run `fn()` with a throwaway UNGRANTED clara function whose body WRITES `relname`. The
 * reachable-closure censuses (Annex F) exist precisely to see a writer that no role can
 * call directly; a scan that only reads granted wrappers cannot, and this twin is how a
 * cell proves which kind of scan it is holding.
 */
export async function withThrowawayHiddenWriter(relname, fn) {
  const name = `_l19_twin${throwawaySuffix()}`;
  await rootQuery(
    `create function clara.${name}() returns void language plpgsql security definer
       set search_path = clara, pg_temp as $twin$
     begin
       if false then delete from clara.${relname}; end if;
     end $twin$`);
  try {
    await rootQuery(`revoke execute on function clara.${name}() from public`);
    await rootQuery(`alter function clara.${name}() owner to ${ROLES.fnOwner}`);
    return await fn(`clara.${name}()`);
  } finally {
    await rootQuery(`drop function if exists clara.${name}()`).catch(() => {});
  }
}
