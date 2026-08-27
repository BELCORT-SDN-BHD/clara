// clara.statutory_deadlines -- CHECK-wall battery + the partial unique live-row index. Sibling
// file to statutory-deadlines-ddl.test.mjs (census/ACL/immutability); split only to stay under
// the file-size gate, sharing statutory-deadlines-fixtures.mjs. See that file's own header for
// the full provenance (migration, PROGRESS re-label note, scope).
//
// PER WALL: a mutant (the violating insert IS rejected, 23514, by its own conname) and a
// positive control (a satisfying insert succeeds) -- never a mutant alone, since a check that
// silently disallows every legitimate value would still "pass" a mutant-only cell.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { roleQuery, endPool, ROLES } from "./rig-fixtures.mjs";
import { tableApplied, insertSql, insertRow, baseRow, insertMutant } from "./statutory-deadlines-fixtures.mjs";

let live = false;
before(async () => { live = await tableApplied(); });
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("clara.statutory_deadlines not applied -- migration not yet on this rig"); return true; }
  return false;
};

// ---------------------------------------------------------------------------------------
// C · CHECK-constraint walls.
// ---------------------------------------------------------------------------------------

test("sd-C1 · domain is closed to {payroll, sst}", async (t) => {
  if (gate(t)) return;
  await insertMutant({ domain: "vat" }, "ck_statutory_deadlines_domain");
  const r = await insertRow({ domain: "sst" });
  assert.equal(r.rowCount, 1, "domain='sst' is a legitimate value (F-T1's future row set)");
});

test("sd-C2 · obligation_code/authority/wording/instrument/working_day_basis/source_url/"
  + "source_note/recorded_by/basis all refuse an empty-after-trim value", async (t) => {
    if (gate(t)) return;
    await insertMutant({ obligation_code: "   " }, "statutory_deadlines_obligation_code_check");
    await insertMutant({ authority: "" }, "statutory_deadlines_authority_check");
    await insertMutant({ wording: "  " }, "statutory_deadlines_wording_check");
    await insertMutant({ instrument: "" }, "statutory_deadlines_instrument_check");
    await insertMutant({ working_day_basis: " " }, "statutory_deadlines_working_day_basis_check");
    await insertMutant({ source_url: "" }, "statutory_deadlines_source_url_check");
    await insertMutant({ source_note: "  " }, "statutory_deadlines_source_note_check");
    await insertMutant({ recorded_by: "" }, "statutory_deadlines_recorded_by_check");
    await insertMutant({ basis: " " }, "statutory_deadlines_basis_check");
  });

test("sd-C3 · cadence is closed to {monthly, annual}", async (t) => {
  if (gate(t)) return;
  await insertMutant({ cadence: "weekly" }, "ck_statutory_deadlines_cadence");
  const r = await insertRow({
    cadence: "annual", due_rule_kind: "date_in_following_year", due_day: 31, due_month: 3,
  });
  assert.equal(r.rowCount, 1);
});

test("sd-C4 · holiday_rule is closed to {next_working_day, unverified}", async (t) => {
  if (gate(t)) return;
  await insertMutant({ holiday_rule: "always_forward" }, "ck_statutory_deadlines_holiday_rule");
  const r = await insertRow({ holiday_rule: "next_working_day" });
  assert.equal(r.rowCount, 1);
});

test("sd-C5 · evidence_grade is closed to {direct, index} -- index is a legitimate column "
  + "value even though P-11 forbids SEEDING one (an authoring discipline, not a DB wall)", async (t) => {
    if (gate(t)) return;
    await insertMutant({ evidence_grade: "hearsay" }, "ck_statutory_deadlines_evidence_grade");
    const r = await insertRow({ evidence_grade: "index" });
    assert.equal(r.rowCount, 1);
  });

test("sd-C6 · cite_role is closed to {date_authority, structural_only}", async (t) => {
  if (gate(t)) return;
  await insertMutant({ cite_role: "commentary" }, "ck_statutory_deadlines_cite_role");
  const r = await insertRow({ cite_role: "structural_only" });
  assert.equal(r.rowCount, 1);
});

test("sd-C7 · basis_kind is closed to {migration_seed} -- the table's only writer, ever", async (t) => {
  if (gate(t)) return;
  await insertMutant({ basis_kind: "owner_instruction" }, "ck_statutory_deadlines_basis_kind");
});

test("sd-C8 · notice_lead_days refuses negative", async (t) => {
  if (gate(t)) return;
  await insertMutant({ notice_lead_days: -1 }, "statutory_deadlines_notice_lead_days_check");
  const r = await insertRow({ notice_lead_days: 0 });
  assert.equal(r.rowCount, 1, "zero is a legitimate lead (speak same-day)");
});

test("sd-C9 · due_rule_kind is closed to the three named kinds -- an out-of-domain value "
  + "necessarily also fails the pairing CHECK (Annex A.2 has no fourth arm for it), so either "
  + "named wall firing is correct", async (t) => {
    if (gate(t)) return;
    await insertMutant({ due_rule_kind: "next_full_moon" },
      ["ck_statutory_deadlines_due_rule_kind", "ck_statutory_deadlines_due_params"]);
  });

test("sd-C10 · due_day/due_month are paired to due_rule_kind (Annex A.2) -- each kind's "
  + "own arithmetic parameters, and no other", async (t) => {
    if (gate(t)) return;
    // day_of_month_following needs due_day, forbids due_month.
    await insertMutant(
      { due_rule_kind: "day_of_month_following", due_day: 15, due_month: 3 },
      "ck_statutory_deadlines_due_params");
    await insertMutant(
      { due_rule_kind: "day_of_month_following", due_day: null, due_month: null },
      "ck_statutory_deadlines_due_params");
    // date_in_following_year needs BOTH.
    await insertMutant(
      { due_rule_kind: "date_in_following_year", due_day: 31, due_month: null },
      "ck_statutory_deadlines_due_params");
    // last_day_of_month_in_following_year needs due_month, forbids due_day.
    await insertMutant(
      { due_rule_kind: "last_day_of_month_in_following_year", due_day: 28, due_month: 2 },
      "ck_statutory_deadlines_due_params");
    await insertMutant(
      { due_rule_kind: "last_day_of_month_in_following_year", due_day: null, due_month: null },
      "ck_statutory_deadlines_due_params");

    // Three positive controls, one per kind -- the exact shape form_ea_ec (leap-day) needs.
    const a = await insertRow({ due_rule_kind: "day_of_month_following", due_day: 15, due_month: null });
    assert.equal(a.rowCount, 1);
    const b = await insertRow({
      due_rule_kind: "date_in_following_year", due_day: 31, due_month: 3, cadence: "annual",
    });
    assert.equal(b.rowCount, 1);
    const c = await insertRow({
      due_rule_kind: "last_day_of_month_in_following_year", due_day: null, due_month: 2,
      cadence: "annual",
    });
    assert.equal(c.rowCount, 1);
  });

test("sd-C11 · due_day/due_month range checks fire independently of the pairing wall", async (t) => {
  if (gate(t)) return;
  await insertMutant(
    { due_rule_kind: "day_of_month_following", due_day: 32, due_month: null },
    "ck_statutory_deadlines_due_day_range");
  await insertMutant(
    { due_rule_kind: "last_day_of_month_in_following_year", due_day: null, due_month: 13 },
    "ck_statutory_deadlines_due_month_range");
});

test("sd-C12 · effective_to must not precede effective_from", async (t) => {
  if (gate(t)) return;
  await insertMutant(
    { effective_from: "2026-06-01", effective_to: "2026-01-01" },
    "ck_statutory_deadlines_effective_range");
  const r = await insertRow({ effective_from: "2026-01-01", effective_to: "2026-06-01" });
  assert.equal(r.rowCount, 1, "effective_to == effective_from is a legitimate one-day window");
});

// ---------------------------------------------------------------------------------------
// D · THE PARTIAL UNIQUE LIVE-ROW INDEX
// ---------------------------------------------------------------------------------------

test("sd-D1 · two LIVE rows at the same (domain, obligation_code, effective_from) collide", async (t) => {
  if (gate(t)) return;
  const code = `x_sdtest_d1_${process.pid}_${Math.random()}`;
  const r1 = await insertRow({ obligation_code: code, effective_from: "2020-01-01" });
  assert.equal(r1.rowCount, 1);
  const { sql, vals } = insertSql(baseRow({ obligation_code: code, effective_from: "2020-01-01" }));
  await assert.rejects(
    () => roleQuery(ROLES.fnOwner, sql, vals),
    (err) => { assert.equal(err.code, "23505"); assert.equal(err.constraint, "uq_statutory_deadlines_live"); return true; },
  );
});

test("sd-D2 · a SUPERSEDED predecessor at the same key does not block a new live row "
  + "(the partial index scopes to WHERE superseded_at IS NULL)", async (t) => {
    if (gate(t)) return;
    const code = `x_sdtest_d2_${process.pid}_${Math.random()}`;
    const pred = await insertRow({ obligation_code: code, effective_from: "2020-01-01" });
    const predId = pred.rows[0].id;
    const succ = await insertRow({ obligation_code: `${code}_v2`, effective_from: "2020-01-01" });
    const succId = succ.rows[0].id;
    // Supersede the predecessor (pointing at an UNRELATED successor id is fine -- the FK only
    // requires SOME live row; the real supersession semantics are F-A4/F-T2's future door).
    await roleQuery(ROLES.fnOwner,
      "update clara.statutory_deadlines set superseded_by = $1, superseded_at = now() where id = $2",
      [succId, predId]);
    // The SAME key can now insert live again, because the predecessor is no longer counted.
    const again = await insertRow({ obligation_code: code, effective_from: "2020-01-01" });
    assert.equal(again.rowCount, 1, "the partial index only guards LIVE rows");
  });
