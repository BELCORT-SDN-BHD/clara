// The REAL-CORPUS header shapes (C-b acceptance, 2026-07-31 — every cell here mirrors a
// refusal the FIRST real Maybank month produced against a reader built on synthetic
// fixtures; the shapes are reconstructed synthetically, no real account data is committed):
//
//   1. `.00` — Maybank prints ZERO with no integer part on every endpoint of a
//      zero-activity month; the money grammar refused it as unreadable.
//   2. The label/value SPLIT — `NOMBOR AKAUN` and its digits sit up to five dwibahasa
//      regions apart, and the cleanest adjacency lives in a header TABLE's cells, which
//      the pages.* line scan never saw.
//   3. NO printed period range — only the statement date; the period is the statement
//      date's own month, derived identically by both readers.
//
// Pure-library cells, no rig.

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseMoneyCents } from "../lib/statement-grammar.mjs";
import { readStatementFromLayout } from "../lib/statement-layout-reader.mjs";

test("`.00` and `.50` parse as zero-magnitude money; junk stays refused", () => {
  assert.deepEqual(parseMoneyCents(".00"), { cents: 0, marker: null });
  assert.deepEqual(parseMoneyCents(".50"), { cents: 50, marker: null });
  assert.equal(parseMoneyCents("."), null);
  assert.equal(parseMoneyCents(".123"), null, "three decimals stay refused — the sen is the atom");
  assert.equal(parseMoneyCents("..00"), null);
});

/** The real 202504 header SHAPE, reconstructed with fictional digits: label and value
 *  split across regions, the dwibahasa block between them, a header TABLE carrying the
 *  same facts in consecutive cells, `.00` endpoints, and NO period range anywhere. */
function realShapeRegions() {
  const page = (i, text) => ({
    field_path: `pages.1.lines.${i}`, text_content: text,
    locator: { page_number: 1, polygon: [0, i * 10, 100, i * 10] },
  });
  const cell = (i, text) => ({
    field_path: `tables.0.cells.${i}`, text_content: text,
    locator: { page_number: 1, polygon: [0, 0, 0, 0] },
  });
  return [
    page(0, "Maybank"),
    page(1, "MALAYAN BANKING BERHAD (3813-K)"),
    page(2, "FICTIONAL SHAPE MIRROR SDN. BHD."),
    page(12, "TARIKH PENYATA"),
    page(15, "30/04/25"),
    page(16, "STATEMENT DATE"),
    page(17, "NOMBOR AKAUN"),
    page(18, "戶號 : ACCOUNT NUMBER"),
    page(20, "ACCOUNT"),
    page(21, "NUMBER"),
    page(22, "514400990011"),
    page(30, "BEGINNING BALANCE .00"),
    page(31, "ENDING BALANCE : .00"),
    page(32, "TOTAL DEBIT : .00"),
    page(33, "TOTAL CREDIT : .00"),
    cell(2, "TARIKH PENYATA"),
    cell(5, "30/04/25"),
    cell(8, "NOMBOR AKAUN"),
    cell(10, "戶號 : ACCOUNT NUMBER"),
    cell(11, "514400990011"),
  ];
}

test("the real Maybank header shape reads completely: split account label, table-cell adjacency, derived period, .00 endpoints", () => {
  const read = readStatementFromLayout(realShapeRegions());
  assert.equal(read.header.institution_code, "MBB");
  assert.equal(read.header.account_number_normalized, "514400990011",
    "the account digits are found across the dwibahasa split — never from a date region");
  assert.equal(read.header.statement_date, "2025-04-30");
  assert.equal(read.header.period_start, "2025-04-01", "the period derives from the statement date's month");
  assert.equal(read.header.period_end, "2025-04-30");
  assert.ok(read.receipt.notes.includes("period_derived_from_statement_date"), "the derivation is receipted, never silent");
  assert.equal(read.header.opening_cents, 0);
  assert.equal(read.header.closing_cents, 0);
  assert.equal(read.header.total_debit_cents, 0);
  assert.equal(read.header.total_credit_cents, 0);
  assert.equal(read.lines.length, 0, "a zero-activity month is a legal read, not an error");
});

test("a date region in the account look-ahead window is NEVER read as an account number", () => {
  const regions = [
    { field_path: "pages.1.lines.0", text_content: "NOMBOR AKAUN", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
    { field_path: "pages.1.lines.1", text_content: "30/04/25", locator: { page_number: 1, polygon: [0, 10, 0, 10] } },
    { field_path: "pages.1.lines.2", text_content: "STATEMENT DATE", locator: { page_number: 1, polygon: [0, 20, 0, 20] } },
  ];
  const read = readStatementFromLayout(regions);
  assert.equal(read.header.account_number_normalized, null,
    "30/04/25 must not normalize into a six-digit 'account' — the slash disqualifies, it never vanishes");
});

test("an explicitly printed period range still wins over the derivation", () => {
  const regions = [
    { field_path: "pages.1.lines.0", text_content: "Maybank", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
    { field_path: "pages.1.lines.1", text_content: "STATEMENT PERIOD : 01/03/2025 to 31/03/2025", locator: { page_number: 1, polygon: [0, 10, 0, 10] } },
    { field_path: "pages.1.lines.2", text_content: "STATEMENT DATE : 02/04/2025", locator: { page_number: 1, polygon: [0, 20, 0, 20] } },
  ];
  const read = readStatementFromLayout(regions);
  assert.equal(read.header.period_start, "2025-03-01");
  assert.equal(read.header.period_end, "2025-03-31", "the printed range is authoritative; derivation is absence-only");
  assert.ok(!read.receipt.notes.includes("period_derived_from_statement_date"));
});

test("dash- and space-separated dates in the account look-ahead are refused too (review MAJOR: the slash-only guard)", () => {
  for (const decoy of ["30-04-25", "30 04 25", ": 30-04-2025"]) {
    const regions = [
      { field_path: "pages.1.lines.0", text_content: "NOMBOR AKAUN", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
      { field_path: "pages.1.lines.1", text_content: decoy, locator: { page_number: 1, polygon: [0, 10, 0, 10] } },
    ];
    const read = readStatementFromLayout(regions);
    assert.equal(read.header.account_number_normalized, null,
      `${JSON.stringify(decoy)} must never normalize into an account number`);
  }
});

test("a seven-digit look-ahead token is refused; a genuine account still reads through a dashed print", () => {
  const probe = (value) => readStatementFromLayout([
    { field_path: "pages.1.lines.0", text_content: "NOMBOR AKAUN", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
    { field_path: "pages.1.lines.1", text_content: value, locator: { page_number: 1, polygon: [0, 10, 0, 10] } },
  ]).header.account_number_normalized;
  assert.equal(probe("1234567"), null, "below the eight-digit floor — a stray short digit run is not an account");
  assert.equal(probe("5144-0099-0011"), "514400990011", "a dash-grouped genuine account reads");
});

test("LEDGER-shaped table cells never feed the header scan: BALANCE B/F and subtotal rows cannot poison the header (review BLOCKER)", () => {
  const cell = (t, i, text) => ({
    field_path: `tables.${t}.cells.${i}`, text_content: text,
    locator: { page_number: 1, polygon: [0, 0, 0, 0] },
  });
  const regions = [
    { field_path: "pages.1.lines.0", text_content: "Maybank", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
    { field_path: "pages.1.lines.1", text_content: "STATEMENT DATE : 30/04/2025", locator: { page_number: 1, polygon: [0, 10, 0, 10] } },
    // The HEADER table — no transaction columns; its account adjacency must still read.
    cell(0, 0, "NOMBOR AKAUN"),
    cell(0, 1, "514400990011"),
    // The TRANSACTION table — carries an addressable column header, a BALANCE B/F first
    // row whose next cell is an unrelated credit figure, and a per-page subtotal row.
    cell(1, 0, "ENTRY DATE"), cell(1, 1, "DESCRIPTION"), cell(1, 2, "AMOUNT"), cell(1, 3, "STATEMENT BALANCE"),
    cell(1, 4, "BALANCE B/F"), cell(1, 5, "5,000.00"),
    cell(1, 6, "02/04/2025"), cell(1, 7, "SOME PAYMENT"), cell(1, 8, "+100.00"), cell(1, 9, "5,100.00"),
    cell(1, 10, "TOTAL DEBIT"), cell(1, 11, "999.99"),
    cell(1, 12, "TOTAL CREDIT"), cell(1, 13, "888.88"),
  ];
  const read = readStatementFromLayout(regions);
  assert.equal(read.header.account_number_normalized, "514400990011",
    "the header table's label→value adjacency still reads");
  assert.notEqual(read.header.opening_cents, 500000,
    "BALANCE B/F inside the ledger table must NOT slurp the adjacent credit into opening");
  assert.equal(read.header.opening_cents, null, "opening stays honestly unread — refusal, never a guess");
  assert.notEqual(read.header.total_debit_cents, 99999, "a per-page subtotal row must not become the printed totals");
  assert.equal(read.header.total_debit_cents, null);
  assert.equal(read.header.total_credit_cents, null);
});

test("entry_date maps to the ENTRY DATE column in BOTH column orders (review: specificity beats position)", () => {
  const build = (invert) => {
    // `col` is the PRINTED COLUMN position (x); the flat cell index only names the region.
    const colX = (col) => invert ? 60 - col * 20 : col * 20;
    const cellRow = (i, col, text, y) => ({
      field_path: `tables.0.cells.${i}`, text_content: text,
      locator: { page_number: 1, polygon: [colX(col), y, colX(col) + 18, y] },
    });
    return [
      { field_path: "pages.1.lines.0", text_content: "Maybank", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
      { field_path: "pages.1.lines.1", text_content: "STATEMENT DATE : 30/04/2025", locator: { page_number: 1, polygon: [0, 5, 0, 5] } },
      { field_path: "pages.1.lines.2", text_content: "BEGINNING BALANCE : 100.00", locator: { page_number: 1, polygon: [0, 6, 0, 6] } },
      { field_path: "pages.1.lines.3", text_content: "ENDING BALANCE : 200.00", locator: { page_number: 1, polygon: [0, 7, 0, 7] } },
      { field_path: "pages.1.lines.4", text_content: "TOTAL DEBIT : .00", locator: { page_number: 1, polygon: [0, 8, 0, 8] } },
      { field_path: "pages.1.lines.5", text_content: "TOTAL CREDIT : 100.00", locator: { page_number: 1, polygon: [0, 9, 0, 9] } },
      cellRow(0, 0, "TARIKH NILAI 仄過賬日期 VALUE DATE", 20),
      cellRow(1, 1, "TARIKH MASUK 進支日期 ENTRY DATE", 20),
      cellRow(2, 2, "JUMLAH URUSNIAGA 银码 TRANSACTION AMOUNT", 20),
      cellRow(3, 3, "BAKI PENYATA 結單存餘 STATEMENT BALANCE", 20),
      cellRow(4, 0, "02/04/2025", 30),
      cellRow(5, 1, "01/04/2025", 30),
      cellRow(6, 2, "+100.00", 30),
      cellRow(7, 3, "200.00", 30),
    ];
  };
  for (const invert of [false, true]) {
    const read = readStatementFromLayout(build(invert));
    assert.equal(read.lines.length, 1, `one transaction parses (invert=${invert})`);
    assert.equal(read.lines[0].entry_date, "2025-04-01",
      `entry_date comes from the ENTRY DATE column, never the VALUE DATE one (invert=${invert})`);
    assert.equal(read.lines[0].value_date, "2025-04-02", `value_date likewise (invert=${invert})`);
  }
});

test("one stray amount-vocabulary cell cannot exclude the whole header table (review: row-local ledger detection)", () => {
  const cell = (i, text) => ({
    field_path: `tables.0.cells.${i}`, text_content: text,
    locator: { page_number: 1, polygon: [(i % 2) * 40, Math.floor(i / 2) * 10, (i % 2) * 40 + 30, Math.floor(i / 2) * 10] },
  });
  const read = readStatementFromLayout([
    { field_path: "pages.1.lines.0", text_content: "Maybank", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
    cell(0, "TARIKH PENYATA"), cell(1, "30/04/25"),
    cell(2, "NOMBOR AKAUN"), cell(3, "514400990011"),
    cell(4, "SILA SEMAK AMAUN ANDA"), cell(5, "TERIMA KASIH"),
  ]);
  assert.equal(read.header.account_number_normalized, "514400990011",
    "a disclaimer containing an amount word shares the table; the header must still read");
  assert.equal(read.header.statement_date, "2025-04-30");
});

test("zero-amount ceremony rows are skipped-and-counted (the real 202512 account-closure month)", () => {
  const cell = (t, i, col, text, y) => ({
    field_path: `tables.${t}.cells.${i}`, text_content: text,
    locator: { page_number: 1, polygon: [col * 20, y, col * 20 + 18, y] },
  });
  const read = readStatementFromLayout([
    { field_path: "pages.1.lines.0", text_content: "Maybank", locator: { page_number: 1, polygon: [0, 0, 0, 0] } },
    { field_path: "pages.1.lines.1", text_content: "STATEMENT DATE : 31/12/2025", locator: { page_number: 1, polygon: [0, 2, 0, 2] } },
    { field_path: "pages.1.lines.2", text_content: "BEGINNING BALANCE : 10.00", locator: { page_number: 1, polygon: [0, 3, 0, 3] } },
    { field_path: "pages.1.lines.3", text_content: "ENDING BALANCE : .00", locator: { page_number: 1, polygon: [0, 4, 0, 4] } },
    { field_path: "pages.1.lines.4", text_content: "TOTAL DEBIT : 10.00", locator: { page_number: 1, polygon: [0, 5, 0, 5] } },
    { field_path: "pages.1.lines.5", text_content: "TOTAL CREDIT : .00", locator: { page_number: 1, polygon: [0, 6, 0, 6] } },
    cell(0, 0, 0, "ENTRY DATE", 20), cell(0, 1, 1, "DESCRIPTION", 20), cell(0, 2, 2, "AMOUNT", 20), cell(0, 3, 3, "STATEMENT BALANCE", 20),
    cell(0, 4, 0, "05/12/2025", 30), cell(0, 5, 1, "FINAL DEBIT", 30), cell(0, 6, 2, "10.00-", 30), cell(0, 7, 3, ".00", 30),
    cell(0, 8, 0, "05/12/2025", 40), cell(0, 9, 1, "CLOSE ACCOUNT", 40), cell(0, 10, 2, ".00", 40), cell(0, 11, 3, ".00", 40),
  ]);
  assert.equal(read.lines.length, 1, "the zero-amount CLOSE ACCOUNT row never becomes a line");
  assert.equal(read.lines[0].amount_cents, -1000);
  assert.equal(read.receipt.line_rows_skipped, 1, "skipped-and-counted, never silently dropped");
});
