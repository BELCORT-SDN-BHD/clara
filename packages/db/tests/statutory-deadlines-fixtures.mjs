// Shared fixtures for the statutory-deadlines DDL battery (statutory-deadlines-ddl.test.mjs +
// statutory-deadlines-checks.test.mjs). NOT a test file itself (does not end in .test.mjs, so
// `node --test` ignores it -- the x56-fixtures.mjs convention).
//
// GLOBAL vocabulary table, no firm/client dimension (client_fact_keys/sst_threshold_schedule's
// posture) -- no buildWorld() story. Every row helper mints a fresh obligation_code so cells
// stay independent of insertion order and of each other. No writer/wake wrapper exists yet, so
// every write below goes DIRECTLY as clara_fn_owner (roleQuery), the only role with any reach.

import assert from "node:assert/strict";
import { rootQuery, roleQuery, getPool, ROLES } from "./rig-fixtures.mjs";

export async function tableApplied() {
  const r = await rootQuery(
    `select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'statutory_deadlines'`,
  );
  return r.rowCount === 1 && r.rows[0].relkind === "r";
}

/** Run `fn` inside ONE transaction that is ALWAYS rolled back (f-a7-pi.test.mjs's / the debt
 *  read-surfaces suite's own idiom) -- adversarial DDL/DML against a shared table never leaks
 *  between cells. `rollback` -> `reset role` -> `reset all` before release (db-tests.md). */
export async function inRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* best-effort cleanup */ }
    try { await client.query("reset role"); } catch { /* best-effort cleanup */ }
    try { await client.query("reset all"); } catch { /* best-effort cleanup */ }
    client.release();
  }
}

let _n = 0;
/** A minimally-valid row, every column satisfying every base CHECK, with a fresh
 *  obligation_code per call so cells never collide with each other or with insertion order. */
export function baseRow(overrides = {}) {
  _n += 1;
  return {
    domain: "payroll",
    obligation_code: `x_sdtest_${process.pid}_${_n}`,
    authority: "lhdn",
    cadence: "monthly",
    due_rule_kind: "day_of_month_following",
    due_day: 15,
    due_month: null,
    wording: "tidak lewat daripada hari ke-15",
    instrument: "ITA 1967 s.107(2)",
    holiday_rule: "unverified",
    working_day_basis: "weekends_only",
    conflict: false,
    source_url: "https://example.gov.my/pcb",
    source_note: "rig fixture citation",
    source_accessed_on: "2026-08-27",
    evidence_grade: "direct",
    cite_role: "date_authority",
    notice_lead_days: 3,
    effective_from: "2020-01-01",
    effective_to: null,
    // superseded_by/superseded_at (fix round, item 2): NULL-defaulted so every EXISTING cell's
    // insert shape is unchanged (null=null satisfies ck_..._supersession_paired trivially),
    // but present in COLS/insertSql so a cell CAN override them to exercise the paired CHECK
    // on the INSERT path -- the path the trigger (UPDATE-only) never reaches.
    superseded_by: null,
    superseded_at: null,
    recorded_by: "rig-fixture",
    basis: "rig fixture row",
    basis_kind: "migration_seed",
    ...overrides,
  };
}

const COLS = [
  "domain", "obligation_code", "authority", "cadence", "due_rule_kind", "due_day", "due_month",
  "wording", "instrument", "holiday_rule", "working_day_basis", "conflict", "source_url",
  "source_note", "source_accessed_on", "evidence_grade", "cite_role", "notice_lead_days",
  "effective_from", "effective_to", "superseded_by", "superseded_at",
  "recorded_by", "basis", "basis_kind",
];

export function insertSql(row) {
  const vals = COLS.map((c) => row[c]);
  const placeholders = COLS.map((_, i) => `$${i + 1}`).join(",");
  return {
    sql: `insert into clara.statutory_deadlines (${COLS.join(",")}) values (${placeholders}) returning id`,
    vals,
  };
}

/** Insert baseRow(overrides) as clara_fn_owner and return the raw pg result. */
export function insertRow(overrides = {}) {
  const { sql, vals } = insertSql(baseRow(overrides));
  return roleQuery(ROLES.fnOwner, sql, vals);
}

/** A mutant cell: baseRow(overrides) must be REJECTED with a CHECK violation (23514) on
 *  EXACTLY the named constraint (or, if `expectConname` is an array, exactly one of the named
 *  constraints -- some inputs legitimately trip two independent walls at once, e.g. an
 *  out-of-domain due_rule_kind fails both its own closed-set CHECK and the pairing CHECK that
 *  depends on due_rule_kind matching a known value; which one Postgres reports first is an
 *  implementation detail neither wall's own correctness depends on). Never a substring match,
 *  never "some error". */
export async function insertMutant(overrides, expectConname) {
  const allowed = Array.isArray(expectConname) ? expectConname : [expectConname];
  const { sql, vals } = insertSql(baseRow(overrides));
  await assert.rejects(
    () => roleQuery(ROLES.fnOwner, sql, vals),
    (err) => {
      assert.equal(err.code, "23514", `expected a CHECK violation for ${JSON.stringify(overrides)}`);
      assert.ok(allowed.includes(err.constraint),
        `expected one of {${allowed.join(", ")}} to fire, got ${err.constraint}`);
      return true;
    },
  );
}

/** Which app roles hold which DML privilege on the base table -- the ACL census instrument. */
export async function reachCensus() {
  const roles = [
    ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime,
  ];
  const verbs = ["select", "insert", "update", "delete"];
  const bad = [];
  for (const role of roles) {
    for (const verb of verbs) {
      const r = await rootQuery(
        "select has_table_privilege($1, 'clara.statutory_deadlines', $2) as ok", [role, verb]);
      if (r.rows[0].ok) bad.push(`${role}:${verb}`);
    }
  }
  return bad;
}
