// Shared fixtures for the F-T3 PR-1 battery (f-t3-pr-1.test.mjs + f-t3-pr-1-walls.test.mjs).
// NOT a test file itself (the name does not end in `.test.mjs`, so `node --test` ignores it)
// -- the statutory-deadlines-fixtures.mjs / x56-fixtures.mjs convention.
//
// Migration: packages/db/migrations/0152_f_t3_pr_1_tax_platform.sql (authored UNNUMBERED, the
// number claimed at MERGE PREP 2026-08-30 -- hard constraint 10). Design of record, in precedence order: the PR-0 rig replay
// (docs/plan/active/tax-computation-pr0-replay-2026-08-29.md, the MEASURED ground), then
// docs/plan/active/tax-computation-design.md v1.3 + -design-part2.md + -annexes-2-mechanics.md.
//
// All six relations are PLATFORM-scoped (mechanics M4 class B): no firm/client dimension, no
// buildWorld() story of their own, forced RLS with a single clara_fn_owner policy and ZERO
// grants. Every write below therefore goes DIRECTLY as clara_fn_owner (roleQuery) -- the only
// role with any reach -- because PR-1 deliberately builds no door at all (R-L25).

import assert from "node:assert/strict";
import { rootQuery, roleQuery, getPool, ROLES } from "./rig-fixtures.mjs";

/** The six relations this PR mints, in the migration's own order. */
export const RELATIONS = [
  "tax_authorities", "tax_treatment_codes", "tax_rate_bands", "capital_allowance_rates",
  "tax_thresholds", "tax_add_back_class_map",
];

/** The thirteen seeded codes. Order-independent; compared as a sorted set. */
export const CODES = [
  "ADDBACK_CLUB_SUBSCRIPTION_100", "ADDBACK_DEPRECIATION_100",
  "ADDBACK_DONATION_UNAPPROVED_100", "ADDBACK_DOUBTFUL_DEBT_GENERAL_100",
  "ADDBACK_ENTERTAINMENT_50", "ADDBACK_FINE_100", "ADDBACK_LEAVE_PASSAGE_100",
  "ADDBACK_MOTOR_RUNNING_PRIVATE_PORTION", "ADDBACK_PRIVATE_EXPENSE_100",
  "ADDBACK_UNAPPROVED_PROVIDENT_FUND_100", "ALLOWABLE_DOUBTFUL_DEBT_SPECIFIC",
  "ALLOWABLE_ENTERTAINMENT_100", "REFUSE_DONATION_S44_6",
];

/** The twelve leaf add_back_class values the 裁-21 COA research JSON carries
 *  (docs/plan/research/coa-template-2026-08-29.json, accounts 6400-6492, tax_sensitive=true).
 *  The map must cover every one of them EXACTLY once. */
export const RESEARCH_LEAVES = [
  "club_subscriptions_and_entrance_fees", "depreciation_and_amortisation",
  "donations_approved", "donations_unapproved", "doubtful_debts_general",
  "doubtful_debts_specific", "entertainment", "fines_and_penalties", "leave_passage",
  "motor_running_costs", "private_and_proprietor_expenses", "unapproved_provident_fund",
];

/** The TWENTY-TWO ladder refusal strings and the cell_status each maps to: part 2 section 9's
 *  twenty-one, plus the replay's delta D-9 (close_snapshot_missing_pl_rows -- the close belt
 *  enforces closing_position ONLY, so the pl_rows key the whole ladder reads is unenforced and
 *  needs its own named refusal). This is a CLOSED set. */
export const LADDER_REASONS = {
  close_not_sealed: "absent",
  basis_period_undetermined: "absent",
  basis_period_not_coextensive_with_close: "undefined",
  account_untreated: "undefined",
  treatment_unapproved: "undefined",
  treatment_code_unsigned: "undefined",
  treatment_on_non_pl_account: "undefined",
  rate_row_missing_for_ya: "absent",
  ca_class_unassigned: "absent",
  disposal_value_not_established: "absent",
  sme_facts_missing: "absent",
  business_source_count_unknown: "absent",
  multiple_business_sources_unmodelled: "undefined",
  losses_brought_forward_unknown: "absent",
  loss_relief_rules_unread: "undefined",
  entity_transparent_no_entity_charge: "refused",
  prior_estimate_unknown: "absent",
  citation_missing: "refused",
  entity_identifier_missing: "absent",
  mixed_account_needs_split: "undefined",
  form_version_superseded: "refused",
  close_snapshot_missing_pl_rows: "absent",
};

/** OQ-11's fail-closed default, counted SEPARATELY from the closed ladder set above so the
 *  two never blur: an approved-institution donation is an s.44(6) deduction capped at 10% of
 *  aggregate income, which `fraction_bp x movement` cannot express. It retires the day the
 *  owner rules OQ-11 the other way. */
export const OQ11_REASON = "s44_6_relief_unmodelled";

/** 裁-33 (owner, 2026-08-29): there is NO golden bar, a tax computation goes to DRAFT ONLY and
 *  is never `issued`, and PR-7 (the artifacts) is not built for beta. `report_runs` keeps its
 *  pre-existing `issued` value — Wave-E's enum, shared with every report class — so the
 *  TRANSITION is walled by name instead. Counted separately from the closed ladder set, like
 *  OQ11_REASON, so a ruling row can never be mistaken for ladder vocabulary. */
export const RULING_33_REASON = "tax_issue_unavailable";

/** Column names that would mean an F-T3 platform relation carries a lifecycle state. 裁-33's
 *  other half is that NONE of them appears on any of the six — proven by census, not by the
 *  absence of a state machine. */
export const LIFECYCLE_COLUMNS = [
  "status", "state", "lifecycle_state", "issue_mode", "issued_at", "issued_by",
];

export async function tableApplied() {
  const r = await rootQuery(
    `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'clara' and c.relkind = 'r' and c.relname = any ($1)`, [RELATIONS]);
  return r.rows[0].n === RELATIONS.length;
}

/** Run `fn` inside ONE transaction that is ALWAYS rolled back (statutory-deadlines-fixtures'
 *  own idiom) -- adversarial DDL/DML against shared platform tables never leaks between
 *  cells. `rollback` -> `reset role` -> `reset all` before release (db-tests.md). */
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
const tag = () => { _n += 1; return `x_ft3test_${process.pid}_${_n}`; };

/** A minimally-valid clara.tax_authorities row, every column satisfying every base CHECK.
 *  A fresh `label` per call, so cells never collide with each other or with the seed. */
export function authorityRow(overrides = {}) {
  return {
    kind: "act_section",
    label: tag(),
    url: "https://www.hasil.gov.my/example",
    accessed_at: "2026-08-29",
    quote: "rig fixture quote",
    fetched_by: "rig fixture",
    evidence_grade: "official_primary",
    conflict: null,
    valid_through: "2026-12-31",
    owner_signed_by: null,
    owner_signed_at: null,
    superseded_by: null,
    superseded_at: null,
    seeded_in_migration: "rig_fixture",
    ...overrides,
  };
}
const AUTHORITY_COLS = [
  "kind", "label", "url", "accessed_at", "quote", "fetched_by", "evidence_grade", "conflict",
  "valid_through", "owner_signed_by", "owner_signed_at", "superseded_by", "superseded_at",
  "seeded_in_migration",
];

/** A minimally-valid clara.tax_treatment_codes row bound to a fresh authority. */
export function codeRow(authorityId, overrides = {}) {
  return {
    code: `X_FT3TEST_${process.pid}_${(_n += 1)}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    direction: "add_back",
    fraction_bp: 10000,
    requires_apportionment: false,
    refusal_reason_key: null,
    regime: "all",
    statutory_ref: "rig fixture reference",
    effective_ya_from: 2023,
    effective_ya_to: null,
    authority_id: authorityId,
    conflict: null,
    notes: null,
    valid_through: "2026-12-31",
    owner_signed_by: null,
    owner_signed_at: null,
    superseded_by: null,
    superseded_at: null,
    seeded_in_migration: "rig_fixture",
    ...overrides,
  };
}
const CODE_COLS = [
  "code", "direction", "fraction_bp", "requires_apportionment", "refusal_reason_key", "regime",
  "statutory_ref", "effective_ya_from", "effective_ya_to", "authority_id", "conflict", "notes",
  "valid_through", "owner_signed_by", "owner_signed_at", "superseded_by", "superseded_at",
  "seeded_in_migration",
];

const COLS = { tax_authorities: AUTHORITY_COLS, tax_treatment_codes: CODE_COLS };

function insertSql(table, row, cols) {
  const use = cols ?? COLS[table] ?? Object.keys(row);
  return {
    sql: `insert into clara.${table} (${use.join(",")}) values (${use.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
    vals: use.map((c) => row[c]),
  };
}

/** Insert as clara_fn_owner (the only role with reach) and return the raw pg result. */
export function insertLawRow(table, row, cols) {
  const { sql, vals } = insertSql(table, row, cols);
  return roleQuery(ROLES.fnOwner, sql, vals);
}

/** Insert a fresh authority and return its id -- the FK target every other fixture needs. */
export async function freshAuthority(overrides = {}) {
  const r = await insertLawRow("tax_authorities", authorityRow(overrides));
  return r.rows[0].id;
}

/** A mutant cell. `row` must be REJECTED with SQLSTATE `expectCode` (default 23514, a CHECK
 *  violation) on EXACTLY the named constraint. Never a substring match, never "some error" --
 *  a mutant that fails for the wrong reason has proven nothing about the wall it aimed at. */
export async function insertMutant(table, row, expectConname, expectCode = "23514", cols) {
  const allowed = Array.isArray(expectConname) ? expectConname : [expectConname];
  const { sql, vals } = insertSql(table, row, cols);
  await assert.rejects(
    () => roleQuery(ROLES.fnOwner, sql, vals),
    (err) => {
      assert.equal(err.code, expectCode,
        `expected SQLSTATE ${expectCode} inserting into ${table}, got ${err.code}: ${err.message}`);
      assert.ok(allowed.includes(err.constraint),
        `expected one of {${allowed.join(", ")}} to fire on ${table}, got ${err.constraint}`);
      return true;
    },
  );
}

/** Which app roles hold which DML privilege on the six platform tables -- the ACL census
 *  instrument, kept as a NAMED diagnosis beneath the relacl closed-world proof. */
export async function reachCensus() {
  const roles = [
    ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive,
    ROLES.runtime, "clara_freeform_ro",
  ];
  const bad = [];
  for (const rel of RELATIONS) {
    for (const role of roles) {
      for (const verb of ["select", "insert", "update", "delete"]) {
        const r = await rootQuery(
          `select has_table_privilege($1, 'clara.${rel}', $2) as ok`, [role, verb]);
        if (r.rows[0].ok) bad.push(`${rel}/${role}:${verb}`);
      }
    }
  }
  return bad;
}
