// #629 — THE FIELD GRAMMAR ON THE BROWSER'S SIDE, under test.
//
// WHAT A GREEN HERE MEANS. The cheap half of the answer contract — required, exact cents, a real
// ISO date, a declared option, length — refuses the same things `clara._assert_work_answer` refuses
// and names the same `constraint` tokens. It does NOT mean the browser is the authority: the
// account-code and question-still-open rules belong to the database and are deliberately absent
// here, which the account cells assert positively rather than leave to a reader's assumption.
//
// THE MONEY CELLS ARE THE LOAD-BEARING ONES. `Number("1234.35") * 100` is 123434.99999999999 in
// this runtime — the cell proves it — so a parser built on that multiplication would post 123434
// or 123435 depending on the rounding mode somebody picked. Exact cents is an accounting law here,
// not a preference.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAnswer,
  centsToText,
  isBlank,
  isIsoDate,
  isRequired,
  isSingleField,
  parseMoneyToCents,
  stepCount,
  validateDraft,
  validateField,
} from "./question-fields";
import type { WorkQuestionField } from "./questions";

const MONEY: WorkQuestionField = { key: "amount_cents", label: "How much?", kind: "money" };
const DATE: WorkQuestionField = { key: "posting_date", label: "Which date?", kind: "date" };
const CHOICE: WorkQuestionField = {
  key: "leg",
  label: "Which leg?",
  kind: "choice",
  options: [
    { value: "expense", label: "Expense" },
    { value: "asset", label: "Asset" },
  ],
};
const ACCOUNT: WorkQuestionField = { key: "account", label: "Which account?", kind: "account" };
const TEXT_OPTIONAL: WorkQuestionField = { key: "memo", label: "Memo", kind: "text", required: false };

test("required defaults to TRUE — the database's own default, not optional-by-absence", () => {
  assert.equal(isRequired(MONEY), true, "a field that omits `required` IS required");
  assert.equal(isRequired({ ...MONEY, required: true }), true);
  assert.equal(isRequired(TEXT_OPTIONAL), false, "only an explicit false makes it optional");
});

test("a blank is a blank; ZERO is not", () => {
  assert.equal(isBlank(undefined), true);
  assert.equal(isBlank(null), true);
  assert.equal(isBlank("   "), true);
  assert.equal(isBlank(0), false, "a zero-cent answer is a real answer — the falsy-check defect");
  assert.equal(isBlank("0"), false);
});

test("money parses to EXACT integer cents, by string surgery and never by multiplication", () => {
  // The defect this parser exists to avoid, measured in this runtime rather than asserted.
  assert.notEqual(Number("1234.35") * 100, 123435, "float multiplication does NOT give exact cents here");

  assert.equal(parseMoneyToCents("1234.35"), 123435);
  assert.equal(parseMoneyToCents("1,200.00"), 120000);
  assert.equal(parseMoneyToCents("1200"), 120000);
  assert.equal(parseMoneyToCents(".50"), 50);
  assert.equal(parseMoneyToCents("-42.07"), -4207);
  assert.equal(parseMoneyToCents("0"), 0);
});

test("money REFUSES what it cannot represent, rather than rounding it into existence", () => {
  for (const bad of ["1200.555", "abc", "", "  ", "1.2.3", "12e5", "1200-"]) {
    assert.equal(parseMoneyToCents(bad), null, `parseMoneyToCents(${JSON.stringify(bad)}) must refuse`);
  }
});

test("cents render back exactly, including under a ringgit and negative", () => {
  assert.equal(centsToText(123435), "1234.35");
  assert.equal(centsToText(5), "0.05");
  assert.equal(centsToText(0), "0.00");
  assert.equal(centsToText(-4207), "-42.07");
});

test("an ISO date must be a REAL calendar date, not merely the right shape", () => {
  assert.equal(isIsoDate("2026-09-01"), true);
  assert.equal(isIsoDate("2026-02-30"), false, "the shape matches and the date does not exist");
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("01/09/2026"), false);
  assert.equal(isIsoDate("2026-9-1"), false);
});

test("each kind names its OWN constraint token — the same tokens the database names", () => {
  assert.equal(validateField(MONEY, ""), "required");
  assert.equal(validateField(MONEY, "1200.555"), "integer_cents");
  assert.equal(validateField(MONEY, "1200.00"), null);
  assert.equal(validateField(DATE, "01/09/2026"), "iso_date");
  assert.equal(validateField(DATE, "2026-09-01"), null);
  assert.equal(validateField(CHOICE, "liability"), "option");
  assert.equal(validateField(CHOICE, "asset"), null);
  assert.equal(validateField(TEXT_OPTIONAL, ""), null, "an optional blank is not a problem");
  assert.equal(validateField(TEXT_OPTIONAL, "x".repeat(4001)), "max_length");
});

test("an ACCOUNT code is checked for presence only — the chart is the database's to know", () => {
  assert.equal(validateField(ACCOUNT, ""), "required");
  assert.equal(
    validateField(ACCOUNT, "9999"),
    null,
    "a code this browser cannot know is inactive passes locally and is refused by the door, which names the field",
  );
});

test("validateDraft reports problems in FIELD ORDER, so the first is the one to focus", () => {
  const problems = validateDraft([DATE, MONEY, TEXT_OPTIONAL], { posting_date: "", amount_cents: "oops" });
  assert.deepEqual(problems, [
    { field: "posting_date", constraint: "required" },
    { field: "amount_cents", constraint: "integer_cents" },
  ]);
});

test("buildAnswer sends integer cents as a NUMBER and omits a blank optional field entirely", () => {
  const answer = buildAnswer([DATE, MONEY, TEXT_OPTIONAL], {
    posting_date: "2026-09-05",
    amount_cents: "1,200.00",
    memo: "   ",
  });
  assert.deepEqual(answer, { posting_date: "2026-09-05", amount_cents: 120000 });
  assert.equal(typeof answer.amount_cents, "number", "the door refuses a string amount");
});

test("buildAnswer carries a NOTE only when one was written", () => {
  assert.deepEqual(buildAnswer([DATE], { posting_date: "2026-09-05" }, "   "), { posting_date: "2026-09-05" });
  assert.deepEqual(buildAnswer([DATE], { posting_date: "2026-09-05" }, " from the bank app "), {
    posting_date: "2026-09-05",
    note: "from the bank app",
  });
});

test("one fact is a Field; a related set is a bounded walk with a review step", () => {
  assert.equal(isSingleField([MONEY]), true);
  assert.equal(isSingleField([MONEY, DATE]), false);
  assert.equal(stepCount([MONEY, DATE]), 3, "two fields plus the review");
});
