// #913 — `clara.knowledge_keys.scope_default` IS NOW PROVABLY DEAD; DROP IT.
// Migration: 0241_knowledge_scope_default_drop.sql. Every cell gates on the LIVE CATALOGUE, never
// on the migration number (knowledge-fixtures.mjs `scopeDefaultDroppedCohortApplied`), the same
// discipline knowledge-fye-day.test.mjs and knowledge-firm-defaults.test.mjs both state.
//
// WHAT THESE CELLS ARE FOR, one per clause of #913's Agent Brief acceptance criteria:
//   AC1 — the column (and its own CHECK) is absent, the ONE OTHER table-level CHECK on this same
//         table survives by name, and the catalogue's rows are exactly what they were before the
//         drop — same count, same kind census, and 0240's OWN inserted row (the newest before
//         this ticket) still carries its full remaining shape (sd.01, sd.02).
//   AC2 — the firm-defaultability wall (0220, a relation this migration never touches) still
//         refuses a client-identity key and admits the three D8-seeded keys, through the real
//         `clara.capture_knowledge` door (sd.03).
//   AC3 — the catalogue's key count and its floor function's answers are unchanged (sd.04).
//
// sd.03 and sd.04 need NO new code: the migration that made sd.01/sd.02 green already left the
// firm-eligibility wall and clara._knowledge_floor untouched, so these two cells are the
// emergent-behaviour proof of that claim, exactly as knowledge-fye-day.test.mjs's fd.04/fd.05
// were for #898.
//
// NONE of these cells duplicate knowledge-firm-defaults.test.mjs's own 21-cell battery: that file
// is untouched by this ticket and its own green run (unaffected by a column it never reads) is
// itself part of the evidence, reported separately. These cells exist because #913's OWN
// acceptance criteria name "the firm-defaultability cells" and "the catalogue's key count and
// kind/floor assertions" as claims about the STATE AFTER THIS MIGRATION, which deserves its own
// proof rather than an inference from a neighbour file staying green.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertRaises, endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";
import { knowledgeWorld, scopeDefaultDroppedCohortApplied } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 4;
let live = false;
let executed = 0;

before(async () => { live = await scopeDefaultDroppedCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_SCOPE_DEFAULT_DROP_0241 === "1") {
    console.warn("SKIP knowledge-scope-default-drop: the 0241 cohort is not applied (explicit pre-integration run).");
    t.skip("scope_default-drop cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0241 scope_default-drop cohort is required for a focused run: apply 0241_knowledge_scope_default_drop.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

cell("sd.01 scope_default and its own CHECK are gone; the ONE OTHER table-level CHECK on clara.knowledge_keys survives by name", async () => {
  const col = await rootQuery(
    `select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'knowledge_keys' and column_name = 'scope_default'`);
  assert.equal(col.rowCount, 0, "scope_default must be absent from clara.knowledge_keys");

  const droppedCheck = await rootQuery(
    `select 1 from pg_constraint
      where conrelid = 'clara.knowledge_keys'::regclass and conname = 'knowledge_keys_scope_default_check'`);
  assert.equal(droppedCheck.rowCount, 0, "knowledge_keys_scope_default_check must be gone with its column");

  const survivingCheck = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_policy_authority'`);
  assert.equal(survivingCheck.rowCount, 1, "ck_knowledge_keys_policy_authority (unrelated to scope_default) must survive");
  assert.match(survivingCheck.rows[0].def, /kind <> 'policy'::text\) OR authority_bearing/,
    "the surviving CHECK's own definition must be untouched");
});

cell("sd.02 the catalogue's rows are exactly what they were before the drop -- same count, same kind census, 0240's own row intact", async () => {
  const total = await rootQuery("select count(*)::int as n from clara.knowledge_keys");
  assert.equal(total.rows[0].n, 14, "the 13-key 0192 catalogue plus 0240's financial_year_end_day");

  const kinds = await rootQuery(
    "select kind, count(*)::int as n from clara.knowledge_keys group by kind");
  const byKind = Object.fromEntries(kinds.rows.map((r) => [r.kind, r.n]));
  assert.deepEqual(byKind, { assertion: 11, policy: 2, preference: 1 },
    "a column drop must not move any row's kind");

  // The NEWEST row before this ticket (0240's own insert), read with a `select *` the way every
  // capture door reads a catalogue row -- proof that dropping one column left every remaining
  // column of every remaining row untouched, not just the count.
  const fyeDay = await rootQuery(
    `select kind, value_shape, validated_against, allowed_values, authority_bearing, min_role
       from clara.knowledge_keys where knowledge_key = 'financial_year_end_day'`);
  assert.equal(fyeDay.rowCount, 1);
  const row = fyeDay.rows[0];
  assert.equal(row.kind, "assertion");
  assert.equal(row.value_shape, "number");
  assert.equal(row.validated_against, "range:day_1_31");
  assert.equal(row.allowed_values, null);
  assert.equal(row.authority_bearing, false);
  assert.equal(row.min_role, "bookkeeper");
});

// Door wrapper, the same shape knowledge-firm-defaults.test.mjs's and knowledge-fye-day.test.mjs's
// CAPTURE use so the three batteries cannot drift into three dialects.
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p913"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
    JSON.stringify(o.appliesWhen ?? {}), o.from ?? null, o.to ?? null,
    JSON.stringify(o.source ?? {}),
  ]).then((r) => r.rows[0].r);
}

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

cell("sd.03 the firm-defaultability wall is unchanged: a client-identity key stays refused, the three D8-seeded keys stay admitted", async () => {
  const w = await knowledgeWorld("sd3");

  const refused = await assertRaises("CLR10", () => capture(w.admin, {
    key: "financial_year_end_month", scope: "firm", client: null, value: 6,
    basis: "the partner wants every client closed in June",
  }), "capture_knowledge(firm, financial_year_end_month)");
  assert.equal(reasonOf(refused), "knowledge_scope_not_firm_defaultable");

  const currency = await capture(w.admin, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "the firm presents in ringgit unless a client says otherwise",
  });
  assert.equal(currency.status, "captured");

  const framework = await capture(w.admin, {
    key: "reporting_framework", scope: "firm", client: null,
    value: { framework_code: "MPERS", framework_label: "Malaysian Private Entities Reporting Standard" },
    basis: "the firm prepares MPERS accounts unless a client's own framework says otherwise",
  });
  assert.equal(framework.status, "captured");

  const basis = await capture(w.admin, {
    key: "accounting_basis", scope: "firm", client: null,
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual basis" },
    basis: "the firm prepares on the accrual basis unless a client's own basis says otherwise",
  });
  assert.equal(basis.status, "captured");
});

cell("sd.04 the catalogue's key count and clara._knowledge_floor's answers are unchanged", async () => {
  const total = await rootQuery("select count(*)::int as n from clara.knowledge_keys");
  assert.equal(total.rows[0].n, 14);

  const floor = (key, scope) =>
    rootQuery("select clara._knowledge_floor($1, $2) as f", [key, scope]).then((r) => r.rows[0].f);
  assert.equal(await floor("entity_type", "client"), "admin");
  assert.equal(await floor("customer_identity_policy", "client"), "owner");
  assert.equal(await floor("coa_seed_decision", "client"), "bookkeeper");
  assert.equal(await floor("coa_seed_decision", "firm"), "admin");
  assert.equal(await floor("reporting_framework", "client"), "admin");

  const refusedCount = await rootQuery(
    `select count(*)::int as n from clara.knowledge_keys k
      where not exists (select 1 from clara.knowledge_key_firm_eligibility e where e.knowledge_key = k.knowledge_key)
        and k.kind not in ('preference', 'policy')`);
  assert.equal(refusedCount.rows[0].n, 10, "the firm-scope-refused census (#898's own tail) must be unmoved by this drop");
});
