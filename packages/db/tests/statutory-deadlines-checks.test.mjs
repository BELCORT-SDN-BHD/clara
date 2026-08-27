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
import { randomUUID } from "node:crypto";
import { roleQuery, endPool, ROLES } from "./rig-fixtures.mjs";
import { tableApplied, insertSql, insertRow, baseRow, insertMutant } from "./statutory-deadlines-fixtures.mjs";

let live = false;
before(async () => { live = await tableApplied(); });
after(async () => { await endPool(); });

/** Two-armed gate (fix round -- see statutory-deadlines-ddl.test.mjs's own comment for the full
 *  reasoning). Package-wide runs skip LOUDLY via CLARA_ALLOW_MISSING_STATUTORY_DEADLINES=1
 *  (set by tests/statutory-deadlines-preintegration-gate.mjs); a focused run with the variable
 *  unset fails instead of skipping. */
const gate = (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_STATUTORY_DEADLINES === "1") {
      console.warn("SKIP statutory-deadlines: the migration is not applied to this database (explicit pre-integration run).");
      t.skip("clara.statutory_deadlines not applied -- explicit pre-integration run");
      return true;
    }
    assert.fail("clara.statutory_deadlines is required for a focused or post-migration run: apply the migration, or set CLARA_ALLOW_MISSING_STATUTORY_DEADLINES=1 for the package-wide pre-integration sweep");
  }
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

test("sd-C9 · an out-of-domain due_rule_kind is refused -- by the PAIRING check, not the "
  + "closed-set check alone (fix round: an earlier title overclaimed this). Every arm of "
  + "ck_..._due_params requires due_rule_kind to equal one of the three known literals, so a "
  + "fourth value can NEVER be the sole refusing wall -- ck_..._due_rule_kind's own closed-set "
  + "membership test contributes a diagnosis NAME (a reader sees 'not a known kind' instead of "
  + "'wrong day/month for this kind'), it does not add refusal reach the pairing check lacks.", async (t) => {
    if (gate(t)) return;
    await insertMutant({ due_rule_kind: "next_full_moon" },
      ["ck_statutory_deadlines_due_rule_kind", "ck_statutory_deadlines_due_params"]);
  });

test("sd-C13 · ck_..._supersession_paired has real behavioural coverage on the INSERT path "
  + "(fix round, item 2) -- the UPDATE-side trigger (sd-E2) never reaches this CHECK, since its "
  + "own OR-guard fires first and refuses a partial UPDATE before Postgres would evaluate the "
  + "table CHECK; only a fresh INSERT (no BEFORE INSERT trigger exists on this table) actually "
  + "exercises it. Both half-set shapes refused on the exact conname.", async (t) => {
    if (gate(t)) return;
    await insertMutant(
      { superseded_by: randomUUID(), superseded_at: null },
      "ck_statutory_deadlines_supersession_paired");
    await insertMutant(
      { superseded_by: null, superseded_at: new Date().toISOString() },
      "ck_statutory_deadlines_supersession_paired");
    // Positive control: both null (the default -- a live, never-superseded row) already
    // inserts clean in every other cell in this file; both set together is sd-E3's own
    // positive control (via the trigger's lawful UPDATE path, statutory-deadlines-ddl.test.mjs).
  });

test("sd-C14 · an impossible (due_month, due_day) pair is refused by "
  + "ck_..._due_day_calendar_valid (fix round, item 4) -- February bounded to 28, never 29", async (t) => {
    if (gate(t)) return;
    await insertMutant(
      { due_rule_kind: "date_in_following_year", due_month: 2, due_day: 31 },
      "ck_statutory_deadlines_due_day_calendar_valid");
    await insertMutant(
      { due_rule_kind: "date_in_following_year", due_month: 2, due_day: 29 },
      "ck_statutory_deadlines_due_day_calendar_valid");
    const r = await insertRow({ due_rule_kind: "date_in_following_year", due_month: 2, due_day: 28 });
    assert.equal(r.rowCount, 1, "28 February is a legitimate date_in_following_year target");
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
