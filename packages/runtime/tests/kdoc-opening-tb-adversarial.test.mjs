// Gate K, document-tied — THE CODEX ADVERSARIAL REPROS for the `opening_tb.line` producer.
// PURE unit tests, no DB.
//
// Four P1 money-safety failures found by an adversarial cross-model review of this module, each
// of which produced WRONG-BUT-DB-CONSISTENT output: a canonical, balanced, individually-valid
// opening seed that migration 0017 accepted without complaint. That is the signature of the
// only class of bug that matters here — every downstream checkpoint said yes, because every
// line it was shown was genuinely well-formed. The document as a WHOLE was the lie.
//
// They live in their own file because they are a different kind of test from the happy-path
// suite next door: each one is a documented attack with a name, and a regression here is not a
// style slip but a wrong opening balance. `kdoc-opening-tb-cells.test.mjs` proves the reader
// works; this file proves it cannot be talked into working wrongly.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { cellsToOpeningTb, readAmountCell } from "../lib/opening-tb-cells.mjs";
import { BALANCED, HEADER, cell, tbRow } from "./kdoc-opening-tb-testkit.mjs";

test("[P1-1] a later SECTION SUBTOTAL must not overwrite an observed grand total", () => {
  // Codex's repro: rows totalling 1,000, a GRAND TOTAL of 2,000 (proving rows are missing),
  // then TOTAL SECTION B of 1,000. Last-total-wins let the smaller, later claim win, and the
  // half-read seed then agreed with it perfectly.
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
    ...tbRow(1.99, { code: null, label: "GRAND TOTAL", dr: "2,000.00", cr: "2,000.00" }),
    ...tbRow(2.27, { code: null, label: "TOTAL SECTION B", dr: "1,000.00", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused", "choosing between competing totals means inventing a rule");
  assert.match(out.reason, /states 2 different totals/);
  assert.match(out.reason, /DR 2000\.00 \/ CR 2000\.00 vs DR 1000\.00 \/ CR 1000\.00/);
  assert.deepEqual(out.regions, []);
  assert.equal(out.printedTotals, null);
  assert.equal(out.statedTotals.length, 2, "both claims are reported, neither is preferred");
});

test("[P1-1] the SAME total repeated (carried across pages) is one claim and collapses", () => {
  const out = cellsToOpeningTb([
    ...BALANCED(),
    ...tbRow(2.9, { code: null, label: "TOTAL", dr: "130,000.00", cr: "130,000.00" }),
    ...tbRow(3.2, { code: null, label: "TOTAL", dr: "130,000.00", cr: "130,000.00" }),
  ]);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.statedTotals.length, 1);
  assert.equal(out.printedTotals.debitCents, 13_000_000n);
});

test("[P1-2] an UNPARSEABLE printed total is a refusal, not furniture", () => {
  // Codex's repro: a balanced 500 pair dropped, and the printed total stated UNGROUPED
  // (`1500.00`, outside the accept grammar). The guard silently vanished and an incomplete
  // 1,000 seed came back `ok` with `printedTotals:null`.
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
    ...tbRow(1.99, { code: null, label: "TOTAL", dr: "1500.00", cr: "1500.00" }),
  ]);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals[0].reason, "total_unparseable");
  assert.equal(out.refusals[0].detail, "1500.00");
  assert.deepEqual(out.regions, []);
});

test("[P1-2] a HALF-STATED total is a refusal — a printed total is a pair", () => {
  const out = cellsToOpeningTb([
    ...BALANCED(),
    ...tbRow(2.9, { code: null, label: "TOTAL", dr: "130,000.00" }), // credit column lost
  ]);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals[0].reason, "total_incomplete");
});

test("[P1-3] a balanced JOURNAL headed `No` must yield null, not an opening seed", () => {
  // Codex's repro. `No` is a serial-number column; its four-digit row numbers satisfy 0017's
  // account grammar, so `0001 Cash introduced RM 1,000.00 DR` was emitted as an opening
  // balance whose "account code" was a row counter — and it balanced.
  const out = cellsToOpeningTb([
    cell(0.45, 1.15, "No"),
    cell(1.2, 1.15, "Description"),
    cell(5.85, 1.15, "Debit"),
    cell(6.64, 1.15, "Credit"),
    cell(0.45, 1.43, "0001"), cell(1.2, 1.43, "Cash introduced"), cell(5.85, 1.43, "1,000.00"),
    cell(0.45, 1.71, "0002"), cell(1.2, 1.71, "Capital introduced"), cell(6.64, 1.71, "1,000.00"),
  ]);
  assert.equal(out, null, "a serial column is not account evidence, however well the rows balance");
});

test("[P1-3] a genuine account-column header still identifies the table", () => {
  for (const header of ["Code", "A/C Code", "Account No", "GL Code", "Kod Akaun"]) {
    const out = cellsToOpeningTb([
      cell(0.45, 1.15, header),
      cell(1.2, 1.15, "Description"),
      cell(5.85, 1.15, "Debit"),
      cell(6.64, 1.15, "Credit"),
      cell(0.45, 1.43, "310-000"), cell(1.2, 1.43, "CASH AT BANK"), cell(5.85, 1.43, "1,000.00"),
      cell(0.45, 1.71, "910-000"), cell(1.2, 1.71, "SHARE CAPITAL"), cell(6.64, 1.71, "1,000.00"),
    ]);
    assert.equal(out?.status, "ok", `must still identify: ${header}`);
  }
});

test("[P1-4] an OCR-MANGLED amount refuses — it must never read as an ABSENT column", () => {
  // Codex's repro, and the worst of the four. `9OO.00` is a printed 900.00 whose zeroes OCR'd
  // as the letter O. Classified as `absent`, two genuinely TWO-SIDED rows read as cleanly
  // one-sided, balanced each other exactly, and produced a canonical seed the DB accepted.
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00", cr: "9OO.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", dr: "9OO.00", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused", "a row we cannot fully read is not a row we may half-emit");
  assert.equal(out.refusals.length, 2);
  for (const r of out.refusals) {
    assert.equal(r.reason, "unparseable_amount");
    assert.equal(r.detail, "9OO.00");
  }
  assert.deepEqual(out.regions, []);
});

test("[P1-4] absence means EMPTY; only an explicit note marker may sit in an amount column", () => {
  const at = (text) => readAmountCell({ text_content: text });
  assert.equal(at("").kind, "absent");
  assert.equal(at("   ").kind, "absent");
  assert.equal(at(undefined).kind, "absent");
  assert.equal(at("*").kind, "absent", "a footnote marker states no figure");
  assert.equal(at("**").kind, "absent");
  for (const nonblank of ["see note 4", "9OO.00", "l,000.00", "N/A", "n/a", "TBC", "—/-", "1 000.00"]) {
    assert.equal(at(nonblank).kind, "unparseable", `nonblank must not read as absent: ${nonblank}`);
  }
});

test("[P1-4] figure-like junk on a CODE-LESS row is refused, not swallowed as furniture", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }),
    ...tbRow(1.71, { code: null, label: "SUBTOTAL", dr: "l,000.00" }), // mangled, no account
    ...tbRow(1.99, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals[0].reason, "unrecognized_account_code");
});

test("[side note] a NIL row still CLAIMS its code — a nil + a balance is a duplicate", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "-" }),        // nil first
    ...tbRow(1.71, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }), // then a balance
    ...tbRow(1.99, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused", "the same account stated twice is ambiguous either way");
  assert.equal(out.refusals[0].reason, "duplicate_account_code");
  assert.equal(out.refusals[0].detail, "310-000");
  assert.deepEqual(out.regions, []);
});

test("[side note] the reverse order refuses too, and RETRACTS the already-emitted line", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }), // emitted first
    ...tbRow(1.71, { code: "310-000", label: "CASH AT BANK", dr: "-" }),        // then nil
    ...tbRow(1.99, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals.length, 2, "the emitted line is pulled back out");
  assert.deepEqual(out.regions, []);
});
