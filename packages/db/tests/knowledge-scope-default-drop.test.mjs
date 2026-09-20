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
//
// NONE of these cells duplicate knowledge-firm-defaults.test.mjs's own 21-cell battery: that file
// is untouched by this ticket and its own green run (unaffected by a column it never reads) is
// itself part of the evidence, reported separately.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { endPool, rootQuery } from "./rig-fixtures.mjs";
import { scopeDefaultDroppedCohortApplied } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 2;
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
