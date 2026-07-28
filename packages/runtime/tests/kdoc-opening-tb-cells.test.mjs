// Gate K, document-tied (ADR-048 SYNTHETIC closure) — the `opening_tb.line` PRODUCER.
// PURE unit tests, no DB.
//
// THE FIXTURE IS LABELLED SYNTHETIC AND SAYS SO. No real client has a trial balance in this
// corpus: both real clients' `uq_opening_seed_registry_once` slots are spent, RPR is greenfield,
// and the demo firms hold zero documents. What is NOT synthetic is the GEOMETRY. The cell
// positions below reuse the convention measured off RPR's real General Ledger and documented in
// `wave-b-prior-gl-cells.test.mjs` (Azure `prebuilt-layout`: a left column at x≈0.45, a
// description column at x≈1.2-2.0, amount columns at x≈5.85 and x≈6.64, rows ~0.28 apart in y
// with a row's own cells varying by up to ~0.01). A synthetic layout with invented coordinates
// would prove nothing about a reader whose whole job is geometry.
//
// `65,747.97` is deliberate: it is the retained-earnings figure the live Gate-K corroboration
// closed on (Bee Creative's own YA2025 `BALANCE B/F 65,747.97`). It is here as a tie to that
// real evidence, not as a claim that this document is real.
//
// The dangerous direction for THIS reader is not a false positive (as it is for the printed
// ledger) — it is a QUIET one: a trial balance read almost right. So most cells below assert a
// REFUSAL, and specifically that nothing at all is emitted when anything is wrong.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { cellsToOpeningTb, readAmountCell, readTrialBalanceHeader } from "../lib/opening-tb-cells.mjs";
import { parseOpeningTbLine } from "../lib/opening-parse.mjs";

let seq = 0;
/** One table cell at (x, y) on a page, in the shape `document_regions` actually stores. */
const cell = (x, y, text, page = 1) => ({
  region_id: `c${String(++seq).padStart(4, "0")}`,
  text_content: text,
  locator: { polygon: [x, y, x + 0.5, y, x + 0.5, y + 0.1, x, y + 0.1], page_number: page },
});

/** The measured trial-balance header: Code · Description · Debit · Credit. */
const HEADER = (y = 1.15, page = 1) => [
  cell(0.45, y, "Code", page),
  cell(1.2, y - 0.01, "Description", page),
  cell(5.85, y, "Debit (MYR)", page),
  cell(6.64, y, "Credit (MYR)", page),
];

/** One printed trial-balance row. Exactly one of `dr` / `cr` normally carries a figure. */
const tbRow = (y, { code, label, dr = null, cr = null }, page = 1) => {
  const cells = [];
  if (code !== null) cells.push(cell(0.45, y, code, page));
  if (label !== null) cells.push(cell(1.2, y + 0.01, label, page));
  if (dr !== null) cells.push(cell(5.85, y + 0.01, dr, page));
  if (cr !== null) cells.push(cell(6.64, y, cr, page));
  return cells;
};

/** A balanced five-line trial balance: DR 130,000.00 = CR 130,000.00. */
const BALANCED = () => [
  ...HEADER(),
  ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
  ...tbRow(1.71, { code: "400-000", label: "TRADE DEBTORS", dr: "25,000.00" }),
  ...tbRow(1.99, { code: "500-000", label: "TRADE CREDITORS", cr: "24,252.03" }),
  ...tbRow(2.27, { code: "900-RE", label: "RETAINED EARNINGS", cr: "65,747.97" }),
  ...tbRow(2.55, { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00" }),
];

// ---------------------------------------------------------------------------
// Identification — the reader must POSITIVELY recognise a trial balance.
// ---------------------------------------------------------------------------

test("readTrialBalanceHeader needs code + description + BOTH amount columns", () => {
  const at = (cells) => ({ cells: cells.map((c) => ({ ...c, at: { x: c.locator.polygon[0], y: c.locator.polygon[1], page: 1 } })) });
  assert.ok(readTrialBalanceHeader(at(HEADER())));
  // Drop the Credit column: a table that cannot state a SIDE is not a trial balance.
  assert.equal(readTrialBalanceHeader(at(HEADER().slice(0, 3))), null);
  // A DATE column means a transaction listing, not a trial balance.
  assert.equal(readTrialBalanceHeader(at([...HEADER(), cell(7.4, 1.15, "Date")])), null);
});

test("returns null for a PRINTED GENERAL LEDGER — that geometry belongs to the other reader", () => {
  const cells = [
    cell(0.45, 1.15, "Date"),
    cell(2.04, 1.15, "Description 1"),
    cell(5.85, 1.15, "Debit (MYR)"),
    cell(6.64, 1.15, "Credit (MYR)"),
    cell(0.45, 1.35, "Code : 310-000 CASH AT BANK"),
    cell(0.45, 1.51, "10/6/2025"),
    cell(2.04, 1.51, "D & DREAM PROPERTIES SDN BHD"),
    cell(6.64, 1.51, "207,974.15"),
  ];
  assert.equal(cellsToOpeningTb(cells), null, "a ledger read as a trial balance would fabricate a seed");
});

test("returns null on empty input, on a headerless table, and on cells with no polygon", () => {
  assert.equal(cellsToOpeningTb([]), null);
  assert.equal(cellsToOpeningTb(null), null);
  assert.equal(cellsToOpeningTb([...tbRow(1.43, { code: "310-000", label: "CASH", dr: "1.00" })]), null,
    "no header → nothing is addressable, and the account/side would have to be invented");
  assert.equal(cellsToOpeningTb([{ region_id: "x", text_content: "Code", locator: {} }]), null);
});

test("returns null for a header with nothing under it (an empty table is not a refusal)", () => {
  assert.equal(cellsToOpeningTb(HEADER()), null);
});

// ---------------------------------------------------------------------------
// The happy path.
// ---------------------------------------------------------------------------

test("a balanced trial balance emits one canonical opening_tb.line per account", () => {
  const out = cellsToOpeningTb(BALANCED());
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.lines.length, 5);
  assert.deepEqual(out.refusals, []);
  assert.equal(out.nilRows, 0);
  assert.equal(out.totals.debitCents, 13_000_000n);
  assert.equal(out.totals.creditCents, 13_000_000n);

  assert.deepEqual(out.lines.map((l) => l.text), [
    "310-000 CASH AT BANK RM 105,000.00 DR",
    "400-000 TRADE DEBTORS RM 25,000.00 DR",
    "500-000 TRADE CREDITORS RM 24,252.03 CR",
    "900-RE RETAINED EARNINGS RM 65,747.97 CR",
    "910-000 SHARE CAPITAL RM 40,000.00 CR",
  ]);
  // The live Gate-K corroboration value, carried through to the sen.
  const re = out.lines.find((l) => l.accountCode === "900-RE");
  assert.equal(re.amountCents, 6_574_797n);
  assert.equal(re.side, "credit");
});

test("every emitted text round-trips through the DB's own evidence grammar", () => {
  const out = cellsToOpeningTb(BALANCED());
  for (const line of out.lines) {
    const proof = parseOpeningTbLine(line.text);
    assert.ok(proof, `the DB grammar must accept: ${line.text}`);
    assert.equal(proof.accountCode, line.accountCode);
    assert.equal(BigInt(proof.amountCents), line.amountCents);
    assert.equal(proof.side, line.side);
  }
});

test("the emitted REGION is exactly a persist_document_extraction element", () => {
  const out = cellsToOpeningTb(BALANCED());
  assert.equal(out.regions.length, 5);
  for (const r of out.regions) {
    assert.equal(r.field_path, "opening_tb.line");
    assert.equal(r.locator_kind, "page_polygon");
    assert.equal(r.locator.page_number, 1);
    assert.equal(r.locator.polygon.length, 8, "an axis-aligned rectangle around the printed row");
    // BigInt cents cross the JSON boundary as a decimal STRING — `JSON.stringify` throws on a
    // bigint, and the DB casts `(elem->>'monetary_cents')::bigint` either way.
    assert.equal(typeof r.monetary_cents, "string");
  }
  const re = out.regions.find((r) => r.text_content.startsWith("900-RE"));
  assert.equal(re.monetary_cents, "6574797");
  assert.equal(re.monetary_raw, "65,747.97");
  assert.doesNotThrow(() => JSON.stringify(out.regions));
});

test("columns are LEARNED, so a package that prints Description before Code still parses", () => {
  const cells = [
    cell(0.4, 1.15, "Account Name"),
    cell(3.0, 1.15, "A/C Code"),
    cell(5.0, 1.15, "Dr"),
    cell(6.2, 1.15, "Cr"),
    cell(0.4, 1.43, "CASH AT BANK"), cell(3.0, 1.43, "310-000"), cell(5.0, 1.43, "1,500.00"),
    cell(0.4, 1.71, "SHARE CAPITAL"), cell(3.0, 1.71, "910-000"), cell(6.2, 1.71, "1,500.00"),
  ];
  const out = cellsToOpeningTb(cells);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.deepEqual(out.lines.map((l) => l.text), [
    "310-000 CASH AT BANK RM 1,500.00 DR",
    "910-000 SHARE CAPITAL RM 1,500.00 CR",
  ]);
});

test("rows are grouped per page, so a two-page trial balance reads as one", () => {
  const cells = [
    ...HEADER(1.15, 1),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "9,000.00" }, 1),
    ...HEADER(1.15, 2),
    ...tbRow(1.43, { code: "910-000", label: "SHARE CAPITAL", cr: "9,000.00" }, 2),
  ];
  const out = cellsToOpeningTb(cells);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.lines.length, 2);
  assert.equal(out.regions[1].locator.page_number, 2, "the page-2 line anchors on page 2");
});

// ---------------------------------------------------------------------------
// Refusals — the whole point of the module.
// ---------------------------------------------------------------------------

test("UNBALANCED refuses the WHOLE document — a trial balance that does not balance is not one", () => {
  const cells = [
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "104,999.99" }),
  ];
  const out = cellsToOpeningTb(cells);
  assert.equal(out.status, "refused");
  assert.match(out.reason, /does not balance: DR 105000\.00 vs CR 104999\.99/);
  assert.deepEqual(out.lines, [], "not one survivor is emitted");
  assert.deepEqual(out.regions, []);
  // The sums are still REPORTED — a refusal that hides its arithmetic cannot be argued with.
  assert.equal(out.totals.debitCents, 10_500_000n);
  assert.equal(out.totals.creditCents, 10_499_999n);
});

test("a DUPLICATE account code refuses BOTH readings, and the document with them", () => {
  const cells = [
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
    ...tbRow(1.71, { code: "310-000", label: "CASH AT BANK - MBB", dr: "25,000.00" }),
    ...tbRow(1.99, { code: "910-000", label: "SHARE CAPITAL", cr: "130,000.00" }),
  ];
  const out = cellsToOpeningTb(cells);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals.length, 2, "the FIRST reading is pulled back out — first does not win");
  for (const r of out.refusals) {
    assert.equal(r.reason, "duplicate_account_code");
    assert.equal(r.detail, "310-000");
  }
  assert.match(out.reason, /^2 trial-balance row\(s\) did not parse/);
  assert.deepEqual(out.regions, []);
});

test("a row with a figure in BOTH columns is refused, never side-picked", () => {
  const cells = [
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00", cr: "5,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "100,000.00" }),
  ];
  const out = cellsToOpeningTb(cells);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals[0].reason, "two_sided_row");
  assert.deepEqual(out.regions, []);
});

test("a PARENTHESISED or NEGATIVE figure is refused — never sign-flipped into the other column", () => {
  for (const bad of ["(5,000.00)", "-5,000.00", "5,000.000", "5000.00"]) {
    const cells = [
      ...HEADER(),
      ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: bad }),
      ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "5,000.00" }),
    ];
    const out = cellsToOpeningTb(cells);
    assert.equal(out.status, "refused", `must refuse: ${bad}`);
    assert.equal(out.refusals[0].reason, "unparseable_amount", `must refuse: ${bad}`);
    assert.equal(out.refusals[0].detail, bad);
    assert.deepEqual(out.regions, []);
  }
});

test("a coded row with an EMPTY amount pair is refused; a NIL row is skipped and counted", () => {
  const missing = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK" }), // no figure at all
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "1.00" }),
  ]);
  assert.equal(missing.status, "refused");
  assert.equal(missing.refusals[0].reason, "amount_missing");

  const nil = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }),
    ...tbRow(1.71, { code: "320-000", label: "PETTY CASH", dr: "0.00" }),   // stated NIL
    ...tbRow(1.99, { code: "330-000", label: "DEPOSITS", dr: "-" }),        // stated NIL
    ...tbRow(2.27, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(nil.status, "ok", nil.reason ?? "");
  assert.equal(nil.lines.length, 2, "a NIL row is not a balance");
  assert.equal(nil.nilRows, 2, "and it is never silent");
});

test("a row with no DESCRIPTION is refused rather than labelled with its own code", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: null, dr: "1,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals[0].reason, "label_missing");
});

// ---------------------------------------------------------------------------
// The printed grand total — the dropped-row guard.
// ---------------------------------------------------------------------------

test("the document's own printed total is honoured when it agrees", () => {
  const out = cellsToOpeningTb([
    ...BALANCED(),
    ...tbRow(2.9, { code: null, label: "TOTAL", dr: "130,000.00", cr: "130,000.00" }),
  ]);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.lines.length, 5);
  assert.equal(out.printedTotals.debitCents, 13_000_000n);
  assert.equal(out.printedTotals.creditCents, 13_000_000n);
});

test("A DROPPED ROW still balances by itself — only the printed total catches it", () => {
  // Remove CASH AT BANK (105,000.00 DR) *and* one credit of the same size, exactly the way a
  // lost page would present: the survivors tie perfectly, so ΣDr = ΣCr cannot see the loss.
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "400-000", label: "TRADE DEBTORS", dr: "25,000.00" }),
    ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "25,000.00" }),
    ...tbRow(2.9, { code: null, label: "TOTAL", dr: "130,000.00", cr: "130,000.00" }),
  ]);
  assert.equal(out.status, "refused", "the tie held; only the document's own total disagreed");
  assert.match(out.reason, /read total DR 25000\.00 \/ CR 25000\.00 does not match the printed total DR 130000\.00/);
  assert.deepEqual(out.regions, []);
});

test("a FIGURE with no account code is refused by name, not left to surface as `does not balance`", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }),
    ...tbRow(1.71, { code: null, label: "CURRENT ASSETS", dr: "1,000.00" }), // unlabelled subtotal
    ...tbRow(1.99, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "refused");
  assert.equal(out.refusals[0].reason, "unrecognized_account_code");
  assert.match(out.reason, /unrecognized_account_code/);
});

test("furniture with no figure is still skipped silently — a caption is not a refusal", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: null, label: "CURRENT ASSETS" }),        // a section caption
    ...tbRow(1.71, { code: null, label: "Balance B/F" }),           // ledger furniture
    ...tbRow(1.99, { code: "310-000", label: "CASH AT BANK", dr: "1,000.00" }),
    ...tbRow(2.27, { code: "910-000", label: "SHARE CAPITAL", cr: "1,000.00" }),
  ]);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.lines.length, 2);
  assert.deepEqual(out.refusals, []);
});

test("a total row that prints NO figure states nothing — it never manufactures a refusal", () => {
  const out = cellsToOpeningTb([
    ...BALANCED(),
    ...tbRow(2.9, { code: null, label: "TOTAL", dr: "-", cr: "-" }), // the total cells were lost
  ]);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.printedTotals, null);
  assert.equal(out.lines.length, 5);
});

test("a real account described `TOTAL …` is a LINE, not a summation row", () => {
  const out = cellsToOpeningTb([
    ...HEADER(),
    ...tbRow(1.43, { code: "500-000", label: "TOTAL CREDITORS CONTROL", cr: "7,500.00" }),
    ...tbRow(1.71, { code: "310-000", label: "CASH AT BANK", dr: "7,500.00" }),
  ]);
  assert.equal(out.status, "ok", out.reason ?? "");
  assert.equal(out.lines.length, 2);
  assert.equal(out.printedTotals, null, "a coded row is never read as the document's total");
});

// ---------------------------------------------------------------------------
// The amount grammar seam.
// ---------------------------------------------------------------------------

test("readAmountCell separates absent / nil / amount / unparseable", () => {
  const at = (text) => readAmountCell({ text_content: text });
  assert.deepEqual(at(""), { kind: "absent" });
  assert.deepEqual(at(null), { kind: "absent" });
  assert.equal(at("-").kind, "nil");
  assert.equal(at("0.00").kind, "nil");
  assert.equal(at("1,234.56").kind, "amount");
  assert.equal(at("1,234.56").cents, 123_456n);
  assert.equal(at("RM 1,234.56").cents, 123_456n, "a currency word inside the cell is stripped");
  assert.equal(at("(1,234.56)").kind, "unparseable");
  assert.equal(at("1,234.567").kind, "unparseable");
  assert.equal(at("see note 4").kind, "absent", "prose in an amount column is not a figure");
});

test("cents are BigInt, so two readings a sen apart never compare equal above 2^53", () => {
  const big = (raw) => readAmountCell({ text_content: raw }).cents;
  const a = big("90,071,992,547,409.90");
  const b = big("90,071,992,547,409.91");
  assert.notEqual(a, b, "Number/Math.round collapse these two — BigInt must not");
  assert.equal(b - a, 1n);
});
