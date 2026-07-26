// Wave B — R2 source (c): the printed-ledger table-cell reader. PURE unit tests, no DB.
//
// The cells here mirror the geometry Azure actually returned for RPR's real General Ledger
// (measured: Date x=0.45, Ref x=1.20, Description 1 x=2.04, Description 2 x=3.84,
// Debit x=5.85, Credit x=6.64, Balance x=7.36; rows separated by ~0.28 in y, and a row's own
// cells varying by up to 0.01). The dangerous direction is a FALSE POSITIVE — a non-ledger PDF
// producing proposals — so most cells below assert that the reader returns null and lets the
// existing xlsx-bytes path handle the source unchanged.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { cellsToEntries, parseLedgerDate } from "../lib/prior-gl-cells.mjs";
import { entriesToProposals } from "../lib/seeding-parse.mjs";

let seq = 0;
/** One table cell at (x, y) on a page, in the shape document_regions actually stores. */
const cell = (x, y, text, page = 1) => ({
  region_id: `r${String(++seq).padStart(4, "0")}`,
  text_content: text,
  locator: { polygon: [x, y, x + 0.5, y, x + 0.5, y + 0.1, x, y + 0.1], page_number: page },
});

const HEADER = (y = 1.15, page = 1) => [
  cell(0.45, y, "Date", page),
  cell(1.2, y, "Ref. 1/2", page),
  cell(2.04, y - 0.01, "Description 1", page),
  cell(3.84, y, "Description 2", page),
  cell(5.85, y, "Debit (MYR)", page),
  cell(6.64, y, "Credit (MYR)", page),
  cell(7.36, y, "Bal. (MYR)", page),
];

/** A dated transaction row; pass counterparty=null to omit the Description-1 cell entirely,
 *  which is exactly how Azure rendered RPR's payroll-accrual journals. */
const txnRow = (y, { date, ref, counterparty, credit }, page = 1) => {
  const cells = [cell(0.45, y, date, page), cell(1.2, y, ref, page)];
  if (counterparty !== null) cells.push(cell(2.04, y + 0.01, counterparty, page));
  cells.push(cell(6.64, y + 0.01, credit, page));
  return cells;
};

test("parseLedgerDate reads D/M/Y and refuses a date that is not on the calendar", () => {
  assert.equal(parseLedgerDate("9/10/2025"), "2025-10-09");
  assert.equal(parseLedgerDate("10/2/2025"), "2025-02-10");
  assert.equal(parseLedgerDate("31/12/2025"), "2025-12-31");
  // 31 February must NOT silently roll into 3 March.
  assert.equal(parseLedgerDate("31/2/2025"), null);
  assert.equal(parseLedgerDate("2025-10-09"), null);
  assert.equal(parseLedgerDate(""), null);
  assert.equal(parseLedgerDate(null), null);
});

test("a printed ledger yields one entry per dated, attributed row", () => {
  const cells = [
    ...HEADER(),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
    cell(6.64, 1.35, "Continue From"),
    ...txnRow(1.51, { date: "10/6/2025", ref: "RPROR-202506/001", counterparty: "D & DREAM PROPERTIES SDN BHD", credit: "207,974.15" }),
    ...txnRow(1.92, { date: "14/10/2025", ref: "RPRPV-202510/007", counterparty: "BRIGHTPATH CONSULTANCY SDN. BHD.", credit: "435,560.00" }),
    cell(0.45, 2.3, "Code : 900-A01 ACCOUNTING FEE"),
    ...txnRow(2.6, { date: "9/10/2025", ref: "RPRPV-202510/005", counterparty: "ROME PUBLIC ADVISORY SDN BHD", credit: "13,000.00" }),
  ];
  const out = cellsToEntries(cells);
  assert.ok(out, "the reader must recognise a ledger");
  assert.equal(out.entries.length, 3);
  assert.equal(out.unattributed.length, 0);

  // The account comes from the nearest PRECEDING `Code :` block header, never guessed.
  assert.deepEqual(out.entries.map((e) => e.accountCode), ["310-000", "310-000", "900-A01"]);
  assert.deepEqual(out.entries.map((e) => e.date), ["2025-06-10", "2025-10-14", "2025-10-09"]);
  assert.equal(out.entries[0].counterparty, "D & DREAM PROPERTIES SDN BHD");
  // Every cite anchors to a real region id so the dashboard/wiki can bind it (F-M14).
  for (const e of out.entries) assert.match(e.cite.region_id, /^r\d{4}$/);
});

test("a dated row with NO counterparty cell is unattributed, not a parse failure", () => {
  const cells = [
    ...HEADER(),
    cell(0.45, 1.35, "Code : 900-S01 SALARIES"),
    ...txnRow(1.51, { date: "31/7/2025", ref: "RPRJV-202507/001 BEING TAKE IN ACCRUAL SALARY", counterparty: null, credit: "14,400.00" }),
    ...txnRow(1.92, { date: "9/10/2025", ref: "RPRPV-202510/005", counterparty: "ROME PUBLIC ADVISORY SDN BHD", credit: "13,000.00" }),
  ];
  const out = cellsToEntries(cells);
  assert.ok(out);
  // The attributable row still lands — one unattributable journal must NOT void the batch.
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].counterparty, "ROME PUBLIC ADVISORY SDN BHD");
  assert.equal(out.unattributed.length, 1);
  assert.match(out.unattributed[0].text, /BEING TAKE IN ACCRUAL SALARY/);
});

test("undated furniture rows are skipped and never become entries", () => {
  const cells = [
    ...HEADER(),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
    cell(0.45, 1.51, "Balance B/F"),
    cell(6.64, 1.51, "0.00"),
    cell(6.64, 1.7, "1,041,765.25"), // an account subtotal line
    ...txnRow(1.92, { date: "10/6/2025", ref: "RPROR-202506/001", counterparty: "PKL GROUP SDN BHD", credit: "389,930.00" }),
  ];
  const out = cellsToEntries(cells);
  assert.equal(out.entries.length, 1);
  assert.equal(out.unattributed.length, 0, "furniture is not unattributed — it is not a source row");
});

test("returns null when there is no `Code :` block header — the account would have to be invented", () => {
  const cells = [
    ...HEADER(),
    ...txnRow(1.51, { date: "10/6/2025", ref: "INV-1", counterparty: "SOME VENDOR SDN BHD", credit: "100.00" }),
  ];
  assert.equal(cellsToEntries(cells), null);
});

test("returns null for a table that is not a ledger (no date/description header pair)", () => {
  const cells = [
    cell(0.45, 1.15, "Item"),
    cell(2.04, 1.15, "Qty"),
    cell(3.84, 1.15, "Unit Price"),
    cell(0.45, 1.35, "Code : 310-000 NOT A LEDGER"),
    cell(0.45, 1.51, "9/10/2025"),
    cell(2.04, 1.51, "90"),
  ];
  assert.equal(cellsToEntries(cells), null, "a false positive here would fabricate proposals");
});

test("returns null on empty input and on cells with no polygon", () => {
  assert.equal(cellsToEntries([]), null);
  assert.equal(cellsToEntries(null), null);
  assert.equal(
    cellsToEntries([{ region_id: "x", text_content: "Code : 310-000 CASH", locator: {} }]),
    null,
  );
});

test("columns are LEARNED from the header, so a different package's order still parses", () => {
  // Description 1 to the LEFT of Date — a layout no hard-coded x could survive.
  const cells = [
    cell(0.4, 1.15, "Description 1"),
    cell(2.5, 1.15, "Date"),
    cell(4.0, 1.15, "Credit (MYR)"),
    cell(0.4, 1.35, "Code : 610-000 PURCHASES"),
    cell(0.4, 1.51, "BUSYSTREET CONSULTANCY SDN BHD"),
    cell(2.5, 1.51, "17/6/2025"),
    cell(4.0, 1.51, "29,200.00"),
  ];
  const out = cellsToEntries(cells);
  assert.ok(out);
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].counterparty, "BUSYSTREET CONSULTANCY SDN BHD");
  assert.equal(out.entries[0].accountCode, "610-000");
  assert.equal(out.entries[0].date, "2025-06-17");
});

test("rows are grouped per page, so page 2 row 1 never merges into page 1 row 1", () => {
  const cells = [
    ...HEADER(1.15, 1),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK", 1),
    ...txnRow(1.51, { date: "10/6/2025", ref: "R1", counterparty: "VENDOR ONE SDN BHD", credit: "1.00" }, 1),
    ...HEADER(1.15, 2),
    cell(0.45, 1.35, "Code : 610-000 PURCHASES", 2),
    ...txnRow(1.51, { date: "11/6/2025", ref: "R2", counterparty: "VENDOR TWO SDN BHD", credit: "2.00" }, 2),
  ];
  const out = cellsToEntries(cells);
  assert.equal(out.entries.length, 2);
  assert.deepEqual(out.entries.map((e) => e.accountCode), ["310-000", "610-000"]);
  assert.deepEqual(out.entries.map((e) => e.counterparty), ["VENDOR ONE SDN BHD", "VENDOR TWO SDN BHD"]);
});

test("entries feed entriesToProposals unchanged — the shape matches the xlsx path exactly", () => {
  const cells = [
    ...HEADER(),
    cell(0.45, 1.35, "Code : 900-A01 ACCOUNTING FEE"),
    ...txnRow(1.51, { date: "9/10/2025", ref: "RPRPV-202510/005", counterparty: "ROME PUBLIC ADVISORY SDN BHD", credit: "13,000.00" }),
    ...txnRow(1.92, { date: "9/11/2025", ref: "RPRPV-202511/005", counterparty: "ROME PUBLIC ADVISORY SDN BHD", credit: "13,000.00" }),
  ];
  const props = entriesToProposals(cellsToEntries(cells).entries);
  const rules = props.filter((p) => p.proposal_kind === "vendor_account_rule");
  const wiki = props.filter((p) => p.proposal_kind === "wiki_fact");
  assert.equal(rules.length, 1, "two sightings of one pair make ONE rule proposal");
  assert.equal(rules[0].payload.account_code, "900-A01");
  assert.equal(rules[0].evidence.occurrence_count, 2);
  assert.deepEqual(rules[0].evidence.date_span, { first: "2025-10-09", last: "2025-11-09" });
  assert.equal(wiki.length, 1);
});

test("no amount or DR/CR side is ever read — a seeding proposal carries neither", () => {
  const cells = [
    ...HEADER(),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
    ...txnRow(1.51, { date: "10/6/2025", ref: "R1", counterparty: "PKL GROUP SDN BHD", credit: "389,930.00" }),
  ];
  const [entry] = cellsToEntries(cells).entries;
  assert.equal(entry.amountCents, undefined);
  assert.equal(entry.side, undefined);
  const serialized = JSON.stringify(entriesToProposals([entry]));
  assert.equal(/389,?930/.test(serialized), false, "no ledger amount may reach a proposal");
});
