// Prior-GL source (c): OCR TABLE CELLS (Wave B, R2). A deterministic reader that turns the
// `tables.N.cells.M` regions Azure already produces for a PDF general ledger into the SAME
// normalized entry shape the xlsx path yields — so a client who only ever has a PRINTED
// ledger is not locked out of seeding. NO model, NO egress, NO new field_path, NO migration.
//
// WHY THIS EXISTS. `seeding-parse.mjs` had two sources: authoritative `prior_gl.line` regions
// (which nothing in the pipeline has ever produced — 0 rows on live) and xlsx bytes. That made
// a spreadsheet export the ONLY working input. Real Malaysian clients frequently hand over a
// PDF printed from their accounting package and nothing else. This module is the third source.
//
// WHY IT IS NOT "READING A NUMBER OFF A PICTURE". It never reads an amount at all. The S1
// proposals (`entriesToProposals`) consume ONLY counterparty + account_code + date; amount and
// DR/CR side are not part of a seeding proposal. So this reader extracts identity and
// classification evidence, never a figure — the cardinal invariant is untouched by
// construction, not by discipline.
//
// GEOMETRY, NOT READING ORDER. Reading-order text (pdftotext -raw and friends) destroys column
// identity: a ledger's Debit and Credit columns collapse into one stream. Azure's table cells
// each carry a `page_polygon`, so the COLUMN a cell belongs to is recoverable from its x
// coordinate. Columns are learned from the header row itself — never hard-coded — so a
// different package's column order still works. That structural recovery — group into rows,
// learn the columns, address a cell by column — now lives in `table-cell-geometry.mjs`, shared
// with the trial-balance reader (`opening-tb-cells.mjs`); the tolerances below are still THIS
// reader's, measured on RPR's ledger, and are passed in rather than inherited.
//
// CONSERVATIVE BY DESIGN (zero-regression rule). The reader returns null unless it can
// POSITIVELY identify a general ledger: a header row carrying a date column + a description
// column, and at least one `Code : <account>` block header. On null the caller falls through
// to the existing xlsx-bytes path completely unchanged. A PDF that is not a ledger therefore
// behaves exactly as it does today.

import { cellAt as cellAtX, cellText, groupRows as groupRowsX, norm } from "./table-cell-geometry.mjs";

/** Account-code shapes accepted across the seeding lane (mirrors seeding-parse's ACCOUNT_RE). */
const ACCOUNT_RE = "[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4}";
/** `Code : 310-000 CASH AT BANK` — the per-account block header a ledger prints. */
const CODE_HEADER_RE = new RegExp(`^Code\\s*:?\\s*(${ACCOUNT_RE})\\b`, "i");
/** D/M/YYYY as Malaysian ledgers print it (`9/10/2025`). Zero-padding optional. */
const DMY_RE = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/;

/** Cells within this many inches of each other vertically belong to the same printed row. */
const ROW_TOLERANCE = 0.06;
/** A cell is in a column when its left edge is within this of the header's left edge. */
const COL_TOLERANCE = 0.35;

const HEADER_SYNONYMS = {
  date: ["date", "posting date", "txn date", "transaction date", "doc date"],
  counterparty: ["description 1", "description", "particulars", "counterparty", "payee", "name"],
  reference: ["ref. 1/2", "ref", "ref.", "reference", "doc no", "document no"],
};

/**
 * D/M/YYYY → YYYY-MM-DD, or null. The DAY-FIRST reading is not an assumption: RPR's ledger
 * states its own span as "From 10/2/2025 To 8/12/2025", which is only a forward range under
 * D/M/Y (month-first would run October→August, i.e. backwards). A date that does not
 * round-trip through a real calendar date is REFUSED rather than coerced — `date` is optional
 * evidence downstream, so refusing costs a date span, never a proposal.
 */
export function parseLedgerDate(text) {
  const m = DMY_RE.exec(String(text ?? "").trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const probe = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  // Reject 31/02 and friends: the Date constructor rolls them over silently.
  if (probe.getUTCDate() !== day || probe.getUTCMonth() + 1 !== month || probe.getUTCFullYear() !== year) return null;
  return iso;
}

/** Group cells into printed rows by page, then by vertical proximity (this reader's tolerance). */
const groupRows = (cells) => groupRowsX(cells, ROW_TOLERANCE);

/** Learn column x-positions from a header row, or null when this row is not a ledger header. */
function readHeader(row) {
  const cols = {};
  for (const cell of row.cells) {
    const text = norm(cell.text_content);
    if (!text) continue;
    for (const [key, syns] of Object.entries(HEADER_SYNONYMS)) {
      if (cols[key] === undefined && syns.includes(text)) cols[key] = cell.at.x;
    }
  }
  // A ledger row is only addressable when we can find BOTH when it happened and who it was
  // with. Without either, this is some other table and we must not guess.
  return cols.date !== undefined && cols.counterparty !== undefined ? cols : null;
}

/** The cell whose left edge is nearest a learned column, within THIS reader's tolerance. */
const cellAt = (row, x) => cellAtX(row, x, COL_TOLERANCE);

/**
 * Table-cell regions → normalized GL entries, or null when this is not a general ledger.
 *
 * ROW POLICY, and why it differs from the xlsx path's. A printed ledger interleaves STRUCTURAL
 * rows (`Balance B/F`, `Continue From Previous Page`, per-account subtotals) with transaction
 * rows. Those carry no date, so a DATED row is the definition of a source row here; an undated
 * row is furniture and is skipped, exactly as a blank xlsx row is.
 *
 * A dated row whose counterparty column is absent is UNATTRIBUTED, not a parse failure — and
 * that distinction is load-bearing. Measured against RPR's real ledger, all 24 such rows were
 * payroll accruals and statutory contributions (`BEING TAKE IN ACCRUAL SALARY…`,
 * `STATUTORY FOR JULY 2025`) whose Description-1 cell Azure merged into the reference cell.
 * Not one carried a counterparty, because internal journals genuinely have none. Failing the
 * whole parse over rows that have no vendor to seed would make every printed ledger
 * unusable. They are RETURNED and COUNTED instead — never silently dropped.
 *
 * NO NARRATIVE FILTERING, deliberately. Some Description-1 cells hold a journal narrative
 * rather than a party, so a few proposals will read oddly. Filtering them by shape was
 * rejected: RPRJV-202502/001 is a journal voucher that DOES name a real party (a
 * pay-on-behalf claim), so any "journals have no counterparty" rule would silently delete a
 * genuine vendor. Over-proposing is corrected by an admin declining a tick — the exact control
 * WB-R2 specifies — while under-proposing is an invisible loss. Emit, and let the human judge.
 *
 * @param {Array<{region_id:string, text_content:string, locator:object}>} cells
 * @returns {{entries:Array, unattributed:Array<{region_id:string,text:string}>}|null}
 */
export function cellsToEntries(cells) {
  const rows = groupRows(cells ?? []);
  if (rows.length === 0) return null;

  let cols = null;
  let account = null;
  let sawCodeHeader = false;
  const entries = [];
  const unattributed = [];

  for (const row of rows) {
    // A header can repeat on every printed page; re-learning keeps a shifted layout honest.
    const header = readHeader(row);
    if (header) {
      cols = header;
      continue;
    }
    // `Code : <account> <NAME>` switches the account every following row belongs to.
    const codeCell = row.cells.find((c) => CODE_HEADER_RE.test(cellText(c)));
    if (codeCell) {
      account = CODE_HEADER_RE.exec(cellText(codeCell))[1];
      sawCodeHeader = true;
      continue;
    }
    if (!cols) continue; // nothing addressable until a header has been seen

    const date = parseLedgerDate(cellText(cellAt(row, cols.date)));
    if (!date) continue; // structural row (Balance B/F, subtotal, page continuation)

    const counterparty = cellText(cellAt(row, cols.counterparty));
    const reference = cellText(cellAt(row, cols.reference));
    const anchorCell = cellAt(row, cols.counterparty) ?? cellAt(row, cols.date);
    if (!counterparty || !account) {
      // Surfaced, never silent: the caller reports the count so a thin batch is explainable.
      unattributed.push({
        region_id: anchorCell?.region_id ?? null,
        text: row.cells.map((c) => cellText(c)).filter(Boolean).join(" | ").slice(0, 200),
      });
      continue;
    }
    entries.push({
      counterparty,
      accountCode: account,
      date,
      cite: {
        region_id: anchorCell.region_id,
        text: [date, reference, counterparty].filter(Boolean).join(" | "),
      },
    });
  }

  // Not a general ledger. BOTH signals are required, and a unit test pins it: an arbitrary
  // table can contain a cell reading `Code : 310-000 …` while carrying no date/description
  // header at all. Without the header nothing is addressable, and without a block header the
  // account would have to be invented — so either absence means null, and the caller's
  // xlsx-bytes path runs exactly as it did before this source existed.
  if (!sawCodeHeader || !cols) return null;
  return { entries, unattributed };
}
