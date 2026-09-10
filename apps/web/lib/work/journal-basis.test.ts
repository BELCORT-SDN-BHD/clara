// The composer's validation, under test. Pure functions, so every cell here is
// about a RULE rather than about a rendering — the component's own cells prove
// the rules reach a control and move focus.
//
// THE ORDER OF `validateJournalDraft`'S OUTPUT IS PART OF ITS CONTRACT and is
// asserted directly: "focus the first invalid field" is only meaningful if the
// list is in the order a human reads the form. A cell that only checked
// membership would pass on a list that named the memo before the posting date.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LINE_DESCRIPTION_MAX_CHARS,
  MEMO_MAX_CHARS,
  charsLeft,
  fieldForServerPath,
  firstInvalidField,
  isCalendarDate,
  showCharsLeft,
  toJournalBasisWire,
  totalsOf,
  validateJournalDraft,
  type JournalDraftLine,
} from "./journal-basis";

const CHART = new Set(["1100", "6100"]);

function line(over: Partial<JournalDraftLine> = {}): JournalDraftLine {
  return { account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "", ...over };
}

/** A clean draft: RM 1,200.00 office rent, Dr 6100 / Cr 1100. */
function goodDraft() {
  return {
    postingDate: "2026-09-01",
    memo: "Office rent, September",
    lines: [line(), line({ account_code: "1100", debit_cents: 0, credit_cents: 120_000 })],
  };
}

test("a clean draft raises no issue and builds the wire body the runtime accepts", () => {
  const draft = goodDraft();
  assert.deepEqual(validateJournalDraft(draft, CHART), []);
  assert.equal(firstInvalidField(validateJournalDraft(draft, CHART)), null);

  const wire = toJournalBasisWire(draft, CHART);
  assert.deepEqual(wire, {
    postingDate: "2026-09-01",
    memo: "Office rent, September",
    currency: "MYR",
    lines: [
      { accountCode: "6100", debitCents: 120_000, creditCents: 0 },
      { accountCode: "1100", debitCents: 0, creditCents: 120_000 },
    ],
  });
});

test("the wire body carries MYR as a literal, and drops an EMPTY description rather than sending one", () => {
  // The draft has no currency control at all — inventing one would be a field
  // the product does not offer. And a blank description is ABSENT on the wire,
  // never `""`: the DB column is nullable and an empty string is a different
  // value from no value.
  const draft = goodDraft();
  draft.lines[0]!.description = "  ";
  draft.lines[1]!.description = "  bank  ";
  const wire = toJournalBasisWire(draft, CHART)!;
  assert.equal(wire.currency, "MYR");
  assert.equal("description" in wire.lines[0]!, false);
  assert.equal(wire.lines[1]!.description, "bank");
});

test("an INVALID draft never produces a wire body — the UI does not ask the database to refuse what it can see", () => {
  const draft = goodDraft();
  draft.memo = "";
  assert.equal(toJournalBasisWire(draft, CHART), null);
});

test("BALANCE is exact cents, and one sen out is out", () => {
  const draft = goodDraft();
  draft.lines[1]!.credit_cents = 119_999;
  const issues = validateJournalDraft(draft, CHART);
  assert.deepEqual(issues, [{ field: "lines", code: "unbalanced" }]);
  assert.deepEqual(totalsOf(draft.lines), {
    debitCents: 120_000,
    creditCents: 119_999,
    differenceCents: 1,
    balanced: false,
  });
});

test("ONE SIDE PER LINE: both sides is an issue, neither side is a different issue", () => {
  const both = goodDraft();
  both.lines[0]!.credit_cents = 5;
  assert.deepEqual(
    validateJournalDraft(both, CHART).map((i) => i.code),
    ["amountBothSides", "unbalanced"],
  );

  const neither = goodDraft();
  neither.lines[0]!.debit_cents = 0;
  const codes = validateJournalDraft(neither, CHART).map((i) => i.code);
  assert.ok(codes.includes("amountRequired"), `expected amountRequired, saw ${codes.join(", ")}`);
  // The message lands on the DEBIT control — the first of the pair — so a human
  // is pointed at a field rather than at "this row".
  assert.equal(validateJournalDraft(neither, CHART)[0]!.field, "line.0.debit");
});

test("CENTS ARE INTEGERS: a fractional or negative amount is refused, never rounded", () => {
  const fractional = goodDraft();
  fractional.lines[0]!.debit_cents = 120_000.5;
  const first = validateJournalDraft(fractional, CHART)[0]!;
  assert.equal(first.code, "amountNotExact");
  assert.equal(first.field, "line.0.debit", "the offending SIDE is named, not the row");

  const negative = goodDraft();
  negative.lines[1]!.credit_cents = -1;
  assert.equal(validateJournalDraft(negative, CHART)[0]!.code, "amountNotExact");
  assert.equal(validateJournalDraft(negative, CHART)[0]!.field, "line.1.credit");
});

test("an UNKNOWN account is an issue — but only when the chart was actually read", () => {
  const draft = goodDraft();
  draft.lines[0]!.account_code = "9999";
  assert.deepEqual(validateJournalDraft(draft, CHART), [
    { field: "line.0.account", code: "accountUnknown" },
  ]);
  // A FAILED chart read must not block a preparer who knows the code: the rule
  // is skipped, and the commit rechecks every code against the live chart.
  assert.deepEqual(validateJournalDraft(draft, null), []);
});

test("a blank account code is its own issue, distinct from an unknown one", () => {
  const draft = goodDraft();
  draft.lines[1]!.account_code = "   ";
  assert.deepEqual(validateJournalDraft(draft, CHART), [
    { field: "line.1.account", code: "accountRequired" },
  ]);
});

test("FEWER THAN TWO LINES is reported as too few, not as unbalanced", () => {
  const draft = { ...goodDraft(), lines: [line()] };
  const codes = validateJournalDraft(draft, CHART).map((i) => i.code);
  assert.ok(codes.includes("tooFewLines"));
  assert.ok(!codes.includes("unbalanced"), "an incomplete entry is empty, not out of balance");
});

test("the ISSUE ORDER is DOM order, so `firstInvalidField` names the topmost control", () => {
  const draft = {
    postingDate: "",
    memo: "",
    lines: [line({ account_code: "" }), line({ account_code: "", debit_cents: 0 })],
  };
  const issues = validateJournalDraft(draft, CHART);
  assert.deepEqual(
    issues.map((i) => i.field),
    ["postingDate", "memo", "line.0.account", "line.1.account", "line.1.debit", "lines"],
  );
  assert.equal(firstInvalidField(issues), "postingDate");
});

test("a posting date must be a REAL calendar day — no timezone, no Date.parse leniency", () => {
  assert.equal(isCalendarDate("2026-09-01"), true);
  assert.equal(isCalendarDate("2026-02-31"), false, "Feb 31 must not silently become March 3rd");
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-9-1"), false, "the DB stores YYYY-MM-DD; a short form is not it");
  assert.equal(isCalendarDate("01/09/2026"), false);
  assert.equal(isCalendarDate(""), false);
  assert.equal(isCalendarDate("2026-09-01T00:00:00Z"), false, "a date column has no instant");

  const draft = { ...goodDraft(), postingDate: "2026-02-31" };
  assert.deepEqual(validateJournalDraft(draft, CHART), [
    { field: "postingDate", code: "postingDateInvalid" },
  ]);
});

test("the wire's `field` string is ONE-BASED: lines[1] is the FIRST row of this form", () => {
  // THE DEFECT THIS CELL FENCES, and it was pinned the wrong way round before.
  // `POST /api/work/journal`'s 400 speaks the DATABASE's vocabulary, and the
  // database generates its line paths from `with ordinality`, which counts from
  // ONE. A mapper that read the index as zero-based reddened the SECOND row for
  // a refusal about the FIRST — and focused the wrong money control while doing
  // it.
  assert.equal(fieldForServerPath("lines[1].debit_cents"), "line.0.debit");
  assert.equal(fieldForServerPath("lines[1].credit_cents"), "line.0.credit");
  assert.equal(fieldForServerPath("lines[1].account_code"), "line.0.account");
  assert.equal(fieldForServerPath("lines[1].description"), "line.0.description");
  assert.equal(fieldForServerPath("lines[2].credit_cents"), "line.1.credit");
  assert.equal(fieldForServerPath("lines[2].account_code"), "line.1.account");
  assert.equal(fieldForServerPath("lines[12].account_code"), "line.11.account");
  // A BARE `lines[N]` — `exactly_one_side` is about the two amount controls, and
  // debit is the first of them in the row.
  assert.equal(fieldForServerPath("lines[3]"), "line.2.debit");
});

test("the wire's whole-payload paths map onto the controls that exist, and onto NOTHING when they do not", () => {
  assert.equal(fieldForServerPath("posting_date"), "postingDate");
  assert.equal(fieldForServerPath("memo"), "memo");
  assert.equal(fieldForServerPath("lines"), "lines");

  // `basis` and `currency` are REAL wire paths with no control of their own —
  // this form has no currency field, because every basis it can build is in
  // ringgit. Both render as a form-level message carrying the server's reason.
  assert.equal(fieldForServerPath("basis"), null);
  assert.equal(fieldForServerPath("currency"), null);

  // THE REQUEST'S OWN camelCase IS NOT A REFUSAL'S SPELLING. `postingDate` is
  // what `lib/work/api.ts` SENDS; no door ever answers in it, and accepting it
  // here was a second vocabulary nothing speaks.
  assert.equal(fieldForServerPath("postingDate"), null);

  // A future field name must not focus whichever control shares a prefix.
  assert.equal(fieldForServerPath("basis_digest"), null);
  assert.equal(fieldForServerPath("lines[x].debit_cents"), null);
  assert.equal(fieldForServerPath("lines[-1].debit_cents"), null);
  // ONE-BASED means `lines[0]` is not a path this vocabulary can produce.
  assert.equal(fieldForServerPath("lines[0].credit_cents"), null);
  assert.equal(fieldForServerPath(null), null);
});

test("the two LENGTH CAPS are the frozen tool schema's, measured the way that schema measures them", () => {
  assert.equal(MEMO_MAX_CHARS, 4000);
  assert.equal(LINE_DESCRIPTION_MAX_CHARS, 2000);

  // MEMO: TRIMMED, because zod trims before it caps. Four thousand characters
  // wrapped in whitespace is a legal memo.
  const memo4000 = "m".repeat(MEMO_MAX_CHARS);
  assert.deepEqual(validateJournalDraft({ ...goodDraft(), memo: `  ${memo4000}  ` }, CHART), []);
  assert.deepEqual(validateJournalDraft({ ...goodDraft(), memo: `${memo4000}x` }, CHART), [
    { field: "memo", code: "memoTooLong" },
  ]);
  // BLANK BEATS TOO LONG: they are different instructions and only one can hold.
  assert.deepEqual(validateJournalDraft({ ...goodDraft(), memo: "   " }, CHART), [
    { field: "memo", code: "memoRequired" },
  ]);

  // DESCRIPTION: RAW, because that schema does NOT trim — so a narration padded
  // to 2,001 characters is refused even though its trimmed form would fit.
  const draft = goodDraft();
  draft.lines[1]!.description = `${"d".repeat(LINE_DESCRIPTION_MAX_CHARS)} `;
  assert.deepEqual(validateJournalDraft(draft, CHART), [
    { field: "line.1.description", code: "descriptionTooLong" },
  ]);
});

test("a line's narration issue sits BETWEEN its account and its amounts — the order IS the focus order", () => {
  const draft = goodDraft();
  draft.lines[0]!.account_code = "";
  draft.lines[0]!.description = "x".repeat(LINE_DESCRIPTION_MAX_CHARS + 1);
  draft.lines[0]!.debit_cents = 0;
  draft.lines[0]!.credit_cents = 0;
  assert.deepEqual(
    validateJournalDraft(draft, CHART).map((i) => i.field),
    ["line.0.account", "line.0.description", "line.0.debit", "lines"],
  );
  // The first invalid control is still the leftmost one in the row.
  assert.equal(firstInvalidField(validateJournalDraft(draft, CHART)), "line.0.account");
});

test("the remaining-characters count appears only NEAR the cap, and counts down in exact characters", () => {
  // A counter on screen from the first keystroke is a number nobody reads. A
  // TENTH left is where it starts earning its space.
  assert.equal(showCharsLeft("", MEMO_MAX_CHARS), false);
  assert.equal(showCharsLeft("m".repeat(3_000), MEMO_MAX_CHARS), false);
  assert.equal(showCharsLeft("m".repeat(3_600), MEMO_MAX_CHARS), true);
  assert.equal(charsLeft("m".repeat(3_600), MEMO_MAX_CHARS), 400);

  assert.equal(showCharsLeft("d".repeat(1_799), LINE_DESCRIPTION_MAX_CHARS), false);
  assert.equal(showCharsLeft("d".repeat(1_800), LINE_DESCRIPTION_MAX_CHARS), true);
  assert.equal(charsLeft("d".repeat(1_800), LINE_DESCRIPTION_MAX_CHARS), 200);

  // A RESTORED draft can be over the cap even though `maxLength` would never
  // have let it be typed — the count goes negative rather than clamping to zero,
  // because "you are 40 over" is the instruction and "0 left" is not.
  assert.equal(charsLeft("d".repeat(LINE_DESCRIPTION_MAX_CHARS + 40), LINE_DESCRIPTION_MAX_CHARS), -40);
});

test("totalsOf ignores a non-integer rather than adding NaN into a money total", () => {
  // A restored draft is untrusted input. A NaN in a sum would render as "—" or
  // worse, silently, across the whole footer.
  const totals = totalsOf([
    { account_code: "6100", debit_cents: 100, credit_cents: 0 },
    { account_code: "1100", debit_cents: Number.NaN, credit_cents: 100 },
  ]);
  assert.deepEqual(totals, { debitCents: 100, creditCents: 100, differenceCents: 0, balanced: true });
});

// ===========================================================================================
// #634 — THE EVIDENCE CONTROL joins the one wire→control vocabulary.
// ===========================================================================================

test("#634: the evidence array's wire path maps onto the evidence control, in BOTH spellings", () => {
  // The route re-spells `source_refs[N]` as `sourceRefs[N]` before it answers (that is its ONE
  // translation, `toWireField`), so the browser normally sees the camelCase form — but a refusal
  // that ever arrived in the database's own spelling must still land on the same control rather
  // than on nothing at all. Accepting both is not a second vocabulary: it is the SAME path,
  // recognised whichever side of the one translator it came from.
  assert.equal(fieldForServerPath("sourceRefs"), "evidence");
  assert.equal(fieldForServerPath("sourceRefs[1]"), "evidence");
  assert.equal(fieldForServerPath("sourceRefs[2]"), "evidence");
  assert.equal(fieldForServerPath("source_refs"), "evidence");
  assert.equal(fieldForServerPath("source_refs[1]"), "evidence");
});

test("#634: an unknown path is still null rather than a guessed control", () => {
  // `sourceRefs[0]` is not a path this vocabulary produces (SQL counts from one), and a prefix
  // match would be exactly the "focus whichever control shares a prefix" failure the module's
  // own header refuses.
  assert.equal(fieldForServerPath("sourceRefs[0]"), null);
  assert.equal(fieldForServerPath("sourceRefsomething"), null);
  assert.equal(fieldForServerPath("basis"), null);
});
