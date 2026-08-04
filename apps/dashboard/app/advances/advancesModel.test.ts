// /advances' pure model tests (the agingModel.test.ts / assetsModel.test.ts
// idiom): mappers, DISPLAY-ONLY predicates and the screen-state ladder. No
// network, no React.
//
// The round-2 as-built findings this file pins:
//   * `explained` is a BOOLEAN off `staff_advance_tie` (register_cents =
//     gl_cents). It used to be typed `string | null` and parsed with a
//     string-only guard, so the column could only ever render an em-dash.
//   * `policy_notes` is an ENVELOPE key, not a per-row key.
//   * a bare array (the old wrong assumption) must read as `unavailable`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toStaffAdvanceSummaryRead, toStaffAdvanceStatementRead, toStaffAdvanceTieRead,
  toStaffAdvanceTieRow, advanceRowHasOutstanding, advanceIsIncomplete,
  staffAdvanceTieState, tieExplainedLabel, advancesScreenState,
} from "./advancesModel";

test("toStaffAdvanceTieRow reads `explained` as a boolean — true, false and ABSENT are three different facts", () => {
  assert.equal(toStaffAdvanceTieRow({ account_code: "350-000", explained: true }).explained, true);
  assert.equal(toStaffAdvanceTieRow({ account_code: "350-000", explained: false }).explained, false);
  assert.equal(
    toStaffAdvanceTieRow({ account_code: "350-000" }).explained, null,
    "a MISSING verdict stays null — it must never collapse into 'the DB said no'",
  );
  // The pre-fix parse was `typeof v === "string" ? v : null`, which turns every
  // real DB answer into null. Guard the shape of the answer, not just its value.
  assert.notEqual(
    toStaffAdvanceTieRow({ account_code: "350-000", explained: true }).explained, null,
    "a boolean `explained` must survive the mapper (the round-2 defect: it never did)",
  );
});

test("tieExplainedLabel keeps 'not reported' distinct from 'unexplained'", () => {
  assert.equal(tieExplainedLabel(true), "explained");
  assert.equal(tieExplainedLabel(false), "unexplained");
  assert.equal(tieExplainedLabel(null), "not reported");
});

test("toStaffAdvanceSummaryRead lifts rows + envelope totals + the statute notes, and flags a wrong shape", () => {
  const read = toStaffAdvanceSummaryRead({
    client_id: "c1", as_of: "2026-08-03", outstanding_cents: 300000, incomplete_count: 2,
    advances: [{ advance_id: "a1", account_code: "350-000", person_label: "Aisyah", outstanding_cents: 300000, particulars_complete: false, enrolment_active: true }],
    policy_notes: [{ fact: "s27_no_interest", note: "Interest on advances is prohibited", source_note: "EA 1955 s.27" }],
  });
  assert.equal(read.available, true);
  assert.equal(read.advances.length, 1);
  assert.equal(read.outstanding_cents, 300000);
  assert.equal(read.incomplete_count, 2);
  assert.equal(read.policy_notes[0]?.fact, "s27_no_interest");

  const bare = toStaffAdvanceSummaryRead([]);
  assert.equal(bare.available, false, "a bare array is an UNKNOWN shape, not an empty register");
  assert.deepEqual(bare.advances, []);
});

test("toStaffAdvanceStatementRead lifts rows, the window's opening/closing balances and the generations", () => {
  const read = toStaffAdvanceStatementRead({
    client_id: "c1", account_code: "350-000", from: null, to: "2026-08-03",
    opening_cents: 0, closing_cents: 300000,
    rows: [{ date: "2026-05-04", kind: "disbursement", amount_cents: 1500000, running_cents: 1500000, advance_id: "a1" }],
    generations: [{ enrolment_id: "e1", person_label: "Aisyah", active: false, retired_at: "2026-07-01T00:00:00+08:00" }],
  });
  assert.equal(read.available, true);
  assert.equal(read.rows[0]?.advance_id, "a1");
  assert.equal(read.opening_cents, 0);
  assert.equal(read.closing_cents, 300000);
  assert.equal(read.generations[0]?.active, false);
  assert.equal(toStaffAdvanceStatementRead(null).available, false);
});

test("toStaffAdvanceTieRead keeps the whole-client verdict tri-state and never fakes a tie", () => {
  const read = toStaffAdvanceTieRead({
    client_id: "c1", as_of: "2026-08-03", tie: false,
    accounts: [{ account_code: "350-000", register_cents: 300000, gl_cents: 250000, difference_cents: 50000, out_of_window_cents: 0, explained: false }],
  });
  assert.equal(read.available, true);
  assert.equal(read.tie, false);
  const row = read.accounts[0];
  assert.ok(row, "the one account row mapped");
  assert.equal(staffAdvanceTieState(row), "variance");
  assert.equal(toStaffAdvanceTieRead({ client_id: "c1" }).tie, null, "no `tie` key means the DB did not say");
  assert.equal(toStaffAdvanceTieRead({ client_id: "c1" }).available, false);
});

test("staffAdvanceTieState fails CLOSED: an unreported identity term is `unavailable`, never `tied`", () => {
  assert.equal(staffAdvanceTieState({ register_cents: 0, gl_cents: 0, difference_cents: 0 }), "tied");
  assert.equal(staffAdvanceTieState({ register_cents: null, gl_cents: 0, difference_cents: 0 }), "unavailable");
  assert.equal(staffAdvanceTieState({ register_cents: 0, gl_cents: null, difference_cents: null }), "unavailable");
});

test("advanceIsIncomplete reads the DB's own particulars verdict; advanceRowHasOutstanding ignores a voided row", () => {
  assert.equal(advanceIsIncomplete({ particulars_complete: false, voided: false }), true);
  assert.equal(advanceIsIncomplete({ particulars_complete: true, voided: false }), false);
  assert.equal(advanceIsIncomplete({ particulars_complete: false, voided: true }), false, "a voided advance has nothing left to complete");
  assert.equal(advanceRowHasOutstanding({ outstanding_cents: 1, voided: false }), true);
  assert.equal(advanceRowHasOutstanding({ outstanding_cents: 1, voided: true }), false);
  assert.equal(advanceRowHasOutstanding({ outstanding_cents: null, voided: false }), false);
});

test("advancesScreenState: an unavailable SHAPE outranks empty, and error outranks loading", () => {
  assert.equal(advancesScreenState({ loading: true, error: false, totalRows: 0 }), "loading");
  assert.equal(advancesScreenState({ loading: false, error: true, totalRows: 0 }), "error");
  assert.equal(advancesScreenState({ loading: false, error: false, totalRows: 0, available: false }), "unavailable");
  assert.equal(advancesScreenState({ loading: false, error: false, totalRows: 0, available: true }), "empty");
  assert.equal(advancesScreenState({ loading: false, error: false, totalRows: 3, available: true }), "ideal");
});
