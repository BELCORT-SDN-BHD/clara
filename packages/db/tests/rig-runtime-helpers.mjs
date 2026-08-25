// Slice-4 rig — durable-runtime shared helper CORE (NOT a test file: the name
// does not end in `.test.mjs`). Written by the CONTRACT-BLIND test lane straight
// from docs/plan/completed/slice4-durable-runtime-contract.md v2.1 (§0, §3, §6) +
// migrations 0002–0005 + the existing rig harness — NEVER from reading 0006. The
// point is mutual blindness: these tests encode the CONTRACT; a divergence from
// the built migration is the lane's product (signal), not a bug in the tests.
//
// Module layout (the repo's 500-line lint splits the harness like Slice 2/3):
//   rig-runtime-helpers.mjs  — constants, readiness, adaptive-insert core (this)
//   rig-runtime-fixtures.mjs — fixture creators + fn wrappers (re-exports this)
//   rig-runtime-race.mjs     — two-session forced-schedule drivers
//   rig-runtime-meta.mjs     — catalog audits (grants / overloads / RLS / roles)
//
// NAMING POLICY: where the contract NAMES a thing (fn params, status values,
// lease columns, error codes) we use that name verbatim — a mismatch is a real
// finding. Where the contract is SILENT (exact column names of the new tables),
// the insert helpers are ADAPTIVE: they read information_schema at run time, map
// the contract's semantic fields onto the columns that exist, and fail LOUDLY
// when a required column cannot be mapped (a finding, not a skip). Inspecting
// the LIVE catalog is allowed; reading 0006's source is not.
//
// LANE POLICY: fixture creation prefers the clara_runtime lane (the contract's
// writing lane for runtime-control tables). A 42501 on a FIXTURE insert/update
// falls back to root and records a LANE_NOTE (grants narrower than the contract
// implies — reported in the lane summary, never silently swallowed). Assertions
// NEVER use the fallback.

import { randomUUID } from "node:crypto";
import { ROLES, rootQuery, roleQuery } from "./rig-events-helpers.mjs";
import { RLS_EXEMPT } from "./rig-meta.mjs";

export * from "./rig-events-helpers.mjs";

// ---------------------------------------------------------------------------
// Contract constants (§0 / §3).
// ---------------------------------------------------------------------------

/** New Slice-4 SQLSTATEs (contract §3 header): CLR13 state conflict, CLR14 limit. */
export const CLR13 = "CLR13";
export const CLR14 = "CLR14";

/** §0.3: the default chat model id (durably snapshotted per task at admission). */
export const DEFAULT_MODEL = "gpt-5.6-terra";

/** §3.2: the bounded error_code CHECK allowlist (never free text — S4-C1). */
export const ERROR_CODES = ["model_error", "tool_error", "timeout", "engine_lost", "limit", "internal"];

/** §3.2: the agent_tasks status enum. */
export const TASK_STATUSES = [
  "queued", "held", "running", "awaiting_input", "cancel_requested",
  "completed", "failed", "cancelled", "expired",
];
/** §3.6/§0.4: the states that consume a compute slot (held/awaiting excluded). */
export const COMPUTE_STATUSES = ["queued", "running", "cancel_requested"];
export const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "expired"];

/** §0.4 defaults: 1,000,000 tokens/day + max 3 concurrent compute runs per firm. */
export const DEFAULT_DAILY_TOKENS = 1_000_000;
export const DEFAULT_RUN_CAP = 3;

/** §3.3: interruption statuses (pending → answered/expired/cancelled). */
export const INTERRUPTION_STATUSES = ["pending", "answered", "expired", "cancelled"];

/** The new tables §3 names + round-2 amendments (S4-AB5: task_checkpoints).
 *  A differently-named as-built table shows up via the unlisted-table catch in
 *  s4RlsAudit — classified, not lost. */
export const EXPECTED_NEW_TABLES = [
  "agent_tasks", "agent_interruptions", "wakes_outbox",
  "chat_sessions", "chat_messages",
  "firm_limits", "firm_usage_daily", "task_usage", "task_checkpoints",
  "trace_spans", "runtime_heartbeats",
];

// FROZEN pre-0006 snapshot (Slices 1–3 + exempt). Deliberately NOT derived from
// rig-meta's GOVERNED_TABLES: that list legitimately grows each slice (it now
// includes the Slice-4 tables), and deriving "new" from a growing list would
// filter every new table out of the discovery sweeps.
export const PRE_0006_TABLES = new Set([
  "firms", "firm_memberships", "clients", "coa_accounts", "documents", "client_resolutions",
  "journal_entries", "journal_lines", "fixed_assets", "notifications", "audit_log", "op_receipts",
  "freeform_read_log", "wake_credentials", "wake_fn_allowlist", "firm_admissions", "users",
  "event_types", "firm_event_seq", "domain_events", "taxonomy_versions", "trigger_taxonomy",
  "taxonomy_active", "wake_intents", "relay_checkpoints", "relay_dead_letters",
  ...RLS_EXEMPT,
]);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Lane notes — fixture-lane fallbacks and contract-silent observations collected
// for the lane report. Printed by each test file's after() hook.
// ---------------------------------------------------------------------------

export const LANE_NOTES = [];
export function noteLane(msg) {
  LANE_NOTES.push(msg);
}
export function printLaneNotes(label) {
  if (LANE_NOTES.length) {
    console.error(`\n[rig-runtime lane notes — ${label}]`);
    for (const n of LANE_NOTES) console.error(`  * ${n}`);
  }
}

// ---------------------------------------------------------------------------
// Readiness — the Slice-4 surface must be present (0006 applied), else SKIP.
// ---------------------------------------------------------------------------

export async function runtimeReady() {
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'clara' and c.relname = 'agent_tasks' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'clara' and p.proname = 'begin_chat_turn' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}

// ---------------------------------------------------------------------------
// Catalog introspection + the adaptive INSERT builder.
// ---------------------------------------------------------------------------

const _colsCache = new Map();
export async function columnsOf(table) {
  if (_colsCache.has(table)) return _colsCache.get(table);
  const r = await rootQuery(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'clara' and table_name = $1
      order by ordinal_position`,
    [table],
  );
  _colsCache.set(table, r.rows);
  return r.rows;
}

export async function columnMap(table) {
  return new Map((await columnsOf(table)).map((c) => [c.column_name, c]));
}

export function firstPresent(byName, candidates) {
  for (const c of candidates) if (byName.has(c)) return c;
  return null;
}

export function assertIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`refusing non-identifier: ${name}`);
  return name;
}

function stubFor(col) {
  const t = col.data_type;
  if (t === "jsonb" || t === "json") return {};
  if (t === "text" || t.startsWith("character")) return "rig";
  if (t === "uuid") return randomUUID();
  if (t.includes("timestamp")) return new Date().toISOString();
  if (t === "date") return new Date().toISOString().slice(0, 10);
  if (["bigint", "integer", "numeric", "smallint", "double precision", "real"].includes(t)) return 0;
  if (t === "boolean") return false;
  return undefined;
}

function serialize(col, v) {
  if (v === null || v === undefined) return v;
  if (col.data_type === "jsonb" || col.data_type === "json") {
    if (typeof v === "string") return /^\s*[[{"]/.test(v) ? v : JSON.stringify(v);
    return JSON.stringify(v);
  }
  if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

/** Run a fixture statement under a lane; 42501 falls back to root + a LANE_NOTE.
 *  NEVER use for an assertion (assertions call role/root queries directly). */
export async function laneQuery(lane, sql, params, label) {
  if (lane === "root") return rootQuery(sql, params);
  const role = lane === "runtime" ? ROLES.runtime : lane;
  try {
    return await roleQuery(role, sql, params);
  } catch (e) {
    if (e.code === "42501") {
      noteLane(`${label ?? sql.slice(0, 70)}: ${role} lane lacked privilege (${e.message}) — fixture fell back to root`);
      return rootQuery(sql, params);
    }
    throw e;
  }
}

/**
 * INSERT into clara.<table> from a desired-values map. Only columns that exist
 * are used; every NOT NULL column without a default that is not covered gets a
 * type-shaped stub or the call FAILS LOUDLY naming the column (a real finding).
 */
export async function adaptiveInsert(table, desired, { lane = "runtime", returning = "id", label } = {}) {
  assertIdent(table);
  const cols = await columnsOf(table);
  if (!cols.length) throw new Error(`clara.${table} does not exist (contract §3 expects it)`);
  const byName = new Map(cols.map((c) => [c.column_name, c]));
  const values = {};
  for (const [k, v] of Object.entries(desired)) {
    if (v === undefined) continue;
    if (byName.has(k)) values[k] = v;
    else noteLane(`adaptiveInsert ${table}: contract-named column '${k}' does not exist — value dropped (naming divergence to inspect)`);
  }
  const unfillable = [];
  for (const c of cols) {
    if (c.is_nullable === "YES" || c.column_default != null) continue;
    if (c.column_name in values) continue;
    const stub = stubFor(c);
    if (stub === undefined) unfillable.push(`${c.column_name} (${c.data_type})`);
    else values[c.column_name] = stub;
  }
  if (unfillable.length) {
    throw new Error(`adaptiveInsert clara.${table}: cannot fill NOT NULL columns: ${unfillable.join(", ")} — extend rig-runtime-helpers (finding)`);
  }
  const names = Object.keys(values).map(assertIdent);
  const params = names.map((n) => serialize(byName.get(n), values[n]));
  const casts = names.map((n) => (["jsonb", "json"].includes(byName.get(n).data_type) ? `::${byName.get(n).data_type}` : ""));
  const sql = `insert into clara.${table} (${names.join(", ")}) values (${names.map((_, i) => `$${i + 1}${casts[i]}`).join(", ")})${returning ? ` returning ${returning}` : ""}`;
  return laneQuery(lane, sql, params, label ?? `insert ${table}`);
}

/** Whole-row jsonb readback as root (superuser bypasses RLS, sees every firm). */
export async function readRow(table, id) {
  assertIdent(table);
  const r = await rootQuery(`select to_jsonb(t) as row from clara.${table} t where t.id = $1`, [id]);
  return r.rows[0]?.row ?? null;
}

export async function readRowsWhere(table, whereCol, value) {
  assertIdent(table);
  assertIdent(whereCol);
  const r = await rootQuery(`select to_jsonb(t) as row from clara.${table} t where t.${whereCol} = $1`, [value]);
  return r.rows.map((x) => x.row);
}

// ---------------------------------------------------------------------------
// Denial-or-empty probe (no-oracle sweeps): a cross-firm/agent read must yield
// ZERO rows or a clean 42501 — never data, never a leaky error.
// ---------------------------------------------------------------------------

export async function denialOrEmpty(fn, label) {
  try {
    const r = await fn();
    return { mode: "rows", n: r.rowCount ?? r.rows?.length ?? 0 };
  } catch (e) {
    if (e.code === "42501") return { mode: "denied" };
    throw new Error(`${label}: unexpected error ${e.code ?? "(none)"} — ${e.message}`);
  }
}

export async function observedNewTables() {
  const r = await rootQuery(
    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'clara' and c.relkind = 'r' order by c.relname",
  );
  return r.rows.map((x) => x.relname).filter((t) => !PRE_0006_TABLES.has(t));
}

// ---------------------------------------------------------------------------
// S4-AB1 — REAL session authorization for the login shells. SET SESSION
// AUTHORIZATION (from the superuser pool client) makes the session BE the
// login role — ambient privileges are then exactly what the login holds
// (INHERIT FALSE ⇒ none), and SET ROLE succeeds only for SET TRUE grants.
// Always restores the session identity before releasing the client.
// ---------------------------------------------------------------------------

// F-A6 PR-1 adds the FOURTH login. `withSessionAuth` is the only instrument that measures a
// login shell the way production does — SET SESSION AUTHORIZATION, so the session USER is the
// login and `SET ROLE` succeeds only for a real SET-TRUE membership. A freeform cell that used
// `set role` from a superuser session instead would prove nothing: a superuser may set any role,
// so the role-escape payload would appear to succeed against a wall that in fact holds.
const LOGIN_ROLES = new Set(["clara_runtime_login", "clara_agent_read_login", "clara_freeform_login"]);

export async function withSessionAuth(login, fn) {
  if (!LOGIN_ROLES.has(login)) throw new Error(`withSessionAuth: not a known login shell: ${login}`);
  const { getPool } = await import("./rig-events-helpers.mjs");
  const c = await getPool().connect();
  try {
    await c.query(`set session authorization ${login}`);
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset session authorization").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}
