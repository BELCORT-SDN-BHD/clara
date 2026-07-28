// Shared synthetic trial-balance cell builders for the `opening_tb.line` producer tests.
//
// THE FIXTURE IS LABELLED SYNTHETIC AND SAYS SO. No real client has a trial balance in this
// corpus: both real clients' `uq_opening_seed_registry_once` slots are spent, RPR is greenfield,
// and the demo firms hold zero documents (ADR-048 ruled the synthetic closure).
//
// WHAT IS NOT SYNTHETIC IS THE GEOMETRY. The cell positions here reuse the convention measured
// off RPR's real General Ledger and documented in `wave-b-prior-gl-cells.test.mjs` (Azure
// `prebuilt-layout`: a left column at x≈0.45, a description column at x≈1.2-2.0, amount columns
// at x≈5.85 and x≈6.64, rows ~0.28 apart in y with a row's own cells varying by up to ~0.01). A
// synthetic layout with invented coordinates would prove nothing about a reader whose whole job
// is geometry.
//
// `65,747.97` is deliberate: it is the retained-earnings figure the live Gate-K corroboration
// closed on (Bee Creative's own YA2025 `BALANCE B/F 65,747.97`). It is here as a tie to that
// real evidence, not as a claim that this document is real.

let seq = 0;

/** One table cell at (x, y) on a page, in the shape `document_regions` actually stores. */
export const cell = (x, y, text, page = 1) => ({
  region_id: `c${String(++seq).padStart(4, "0")}`,
  text_content: text,
  locator: { polygon: [x, y, x + 0.5, y, x + 0.5, y + 0.1, x, y + 0.1], page_number: page },
});

/** The measured trial-balance header: Code · Description · Debit · Credit. */
export const HEADER = (y = 1.15, page = 1) => [
  cell(0.45, y, "Code", page),
  cell(1.2, y - 0.01, "Description", page),
  cell(5.85, y, "Debit (MYR)", page),
  cell(6.64, y, "Credit (MYR)", page),
];

/** One printed trial-balance row. Exactly one of `dr` / `cr` normally carries a figure. */
export const tbRow = (y, { code, label, dr = null, cr = null }, page = 1) => {
  const cells = [];
  if (code !== null && code !== undefined) cells.push(cell(0.45, y, code, page));
  if (label !== null && label !== undefined) cells.push(cell(1.2, y + 0.01, label, page));
  if (dr !== null) cells.push(cell(5.85, y + 0.01, dr, page));
  if (cr !== null) cells.push(cell(6.64, y, cr, page));
  return cells;
};

/** A balanced five-line trial balance: DR 130,000.00 = CR 130,000.00. */
export const BALANCED = () => [
  ...HEADER(),
  ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
  ...tbRow(1.71, { code: "400-000", label: "TRADE DEBTORS", dr: "25,000.00" }),
  ...tbRow(1.99, { code: "500-000", label: "TRADE CREDITORS", cr: "24,252.03" }),
  ...tbRow(2.27, { code: "900-RE", label: "RETAINED EARNINGS", cr: "65,747.97" }),
  ...tbRow(2.55, { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00" }),
];

/** The chart of accounts the balanced fixture needs (code, name, type) for the DB lane. */
export const ACCOUNTS = [
  ["310-000", "CASH AT BANK", "asset"],
  ["400-000", "TRADE DEBTORS", "asset"],
  ["500-000", "TRADE CREDITORS", "liability"],
  ["900-RE", "RETAINED EARNINGS", "equity"],
  ["910-000", "SHARE CAPITAL", "equity"],
];
