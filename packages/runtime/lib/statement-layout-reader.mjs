// READER-1 for the bank-statement lane (Wave C-b design §4.3): a DETERMINISTIC table
// extraction over the STORED intake layout geometry. No model, no vendor call, no new
// egress — it re-reads regions the OCR lane already persisted for this document
// (`clara.document_extractions` + `clara.document_regions`, the classify/matcher read path
// under the runtime role), so reader-1 costs one SELECT and can never be the reason a
// client's bytes leave the country.
//
// WHY A SECOND READER AT ALL, and why THIS one is independent. Corroboration is only worth
// something when the two readers can fail differently. Reader-2 is a vendor MODEL over the
// original bytes; reader-1 is arithmetic over polygons the layout pass already committed.
// They share the page and nothing else — not a parser, not a prompt, not a vendor. The one
// thing reader-1 must NEVER do is derive the printed endpoints from the rows it read: the
// design's §3 law is that opening/closing come from the PRINTED HEADER LABELS
// (BEGINNING/ENDING or LEDGER BALANCE) and a reader that cannot produce them independently
// refuses (`header_unreadable`). Deriving them would make the chain check tautological —
// v1's headline defect, killed by both review lanes.
//
// GEOMETRY, NOT READING ORDER (the `table-cell-geometry.mjs` doctrine, reused verbatim).
// Reading-order text collapses a Debit column and a Credit column into one stream: the
// numbers survive but the SIDE does not, which on a bank statement is the whole meaning.
// Azure's table cells carry a page polygon, so the COLUMN a cell belongs to is recoverable
// from its x coordinate and the ROW from its y. Columns are LEARNED from the statement's
// own header row, never hard-coded, so CIMB's column order works as well as Maybank's.
//
// CONSERVATIVE BY DESIGN. Every helper returns null rather than a guess, and the whole
// reader returns a RECEIPT naming what it could not read. A statement reader-1 cannot read
// is not a disaster: `enter_bank_statement` (design §4.3, the human-keyed path) exists
// precisely because a firm must always be able to key a statement by hand — the corpus's
// one mojibake file is the standing proof it will be needed [C].

import { cellAt as cellAtX, cellText, groupRows as groupRowsX, norm as normText } from "./table-cell-geometry.mjs";
import {
  applySign,
  detectCurrency,
  matchInstitution,
  normalizeAccountNumber,
  parseMoneyCents,
  parseStatementDate,
} from "./statement-grammar.mjs";

/** Cells within this many inches of each other vertically belong to the same printed row.
 *  Bank statements print denser than a general ledger, hence a tighter default than
 *  `table-cell-geometry.mjs`'s 0.06 — passed in, never inherited, so a divergence here can
 *  never shift the ledger/trial-balance readers. */
const ROW_TOLERANCE = 0.05;
/** A cell is in a column when its left edge is within this of the header's left edge. */
const COL_TOLERANCE = 0.35;

/** The load-bearing header fields (design §4.3). Corroboration requires agreement on ALL
 *  of them — this array is the single definition both the corroborator and the DB payload
 *  builder read, so "the full header" can never quietly mean different things. */
export const HEADER_FIELDS = Object.freeze([
  "institution_code",
  "account_number_normalized",
  "currency",
  "period_start",
  "period_end",
  "statement_date",
  "opening_cents",
  "closing_cents",
  "total_debit_cents",
  "total_credit_cents",
]);

// Label vocabularies. Matched as PREFIXES of the normalized line text so a dwibahasa label
// (`BAKI AWAL / BEGINNING BALANCE`) still anchors — the English half is what we key on, and
// a label that carries its figure on the same printed line is the common case.
const LABELS = Object.freeze({
  opening: ["beginning balance", "opening balance", "balance b/f", "balance brought forward", "baki awal"],
  closing: ["ending balance", "closing balance", "balance c/f", "balance carried forward", "ledger balance", "baki akhir"],
  total_debit: ["total debit", "total debits", "jumlah debit"],
  total_credit: ["total credit", "total credits", "jumlah kredit"],
  statement_date: ["statement date", "tarikh penyata", "date of statement"],
  period: ["statement period", "period", "tempoh penyata", "for the period"],
  account_number: ["account no", "account number", "acc no", "no akaun", "nombor akaun", "a/c no"],
});

const COLUMN_SYNONYMS = Object.freeze({
  entry_date: ["date", "entry date", "trans date", "transaction date", "posting date", "tarikh"],
  value_date: ["value date", "tarikh nilai"],
  description: ["description", "transaction description", "particulars", "details", "urusniaga", "keterangan"],
  amount: ["transaction amount", "amount", "amaun", "jumlah urusniaga"],
  debit: ["debit", "withdrawal", "withdrawals", "dr", "keluar"],
  credit: ["credit", "deposit", "deposits", "cr", "masuk"],
  running_balance: ["statement balance", "balance", "running balance", "baki", "baki penyata"],
});

/**
 * Read the document's stored OCR layout regions (reader-1's substrate). Scoped to the
 * NEWEST done, non-superseded `ocr` extraction — deliberately NOT the matcher's
 * read-ALL-extractions shape: a statement is one coherent document and concatenating two
 * engines' regions would interleave them by position and garble the table.
 *
 * ORDERING mirrors `classify.mjs`'s own note: `version_n` is allocated per
 * (document_id, engine_id), so ordering by `extracted_at` first makes newest genuinely win.
 */
export async function readStatementLayoutRegions(client, { documentId, firmId }) {
  const r = await client.query(
    `with newest as (
       select e.id, e.firm_id, e.engine_id
         from clara.document_extractions e
        where e.document_id = $1 and e.firm_id = $2 and e.status = 'done'
          and e.engine_kind = 'ocr' and e.superseded_by is null
        order by e.extracted_at desc, e.version_n desc, e.id desc
        limit 1)
     select e.id as extraction_id, e.engine_id, r.field_path, r.text_content, r.locator
       from newest e
       join clara.document_regions r on r.extraction_id = e.id and r.firm_id = e.firm_id`,
    [documentId, firmId],
  );
  return r.rows.map((row) => ({
    extraction_id: String(row.extraction_id),
    engine_id: row.engine_id == null ? null : String(row.engine_id),
    field_path: String(row.field_path ?? ""),
    text_content: String(row.text_content ?? ""),
    locator: row.locator ?? null,
  }));
}

/**
 * Reader-1's whole job, in one call: read the stored layout regions and parse them into the
 * header + line skeleton, carrying the SOURCE EXTRACTION's identity through so
 * `bank_statements.reader1_extraction_id` records exactly which committed read agreed
 * (design §4.2 — "who agreed is provable later"). An absent layout extraction is not an
 * error here: it returns an empty read whose header is all-null, which the corroborator
 * turns into `header_unreadable` — one refusal taxonomy, one place that owns it.
 */
export async function readStatementLayout(client, { documentId, firmId }) {
  const regions = await readStatementLayoutRegions(client, { documentId, firmId });
  const read = readStatementFromLayout(regions);
  return {
    ...read,
    extraction_id: regions[0]?.extraction_id ?? null,
    engine_id: regions[0]?.engine_id ?? null,
  };
}

/** Page-line regions (`pages.N.lines.M`) in printed reading order — the header substrate. */
function pageLines(regions) {
  return regions
    .filter((r) => r.field_path.startsWith("pages."))
    .map((r) => ({
      text: r.text_content,
      page: Number(r.locator?.page_number) || 0,
      y: Number(r.locator?.polygon?.[1]) || 0,
      x: Number(r.locator?.polygon?.[0]) || 0,
    }))
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

/** Table-cell regions (`tables.N.cells.M`) in the shape `table-cell-geometry` expects. */
function tableCells(regions) {
  return regions
    .filter((r) => r.field_path.startsWith("tables."))
    .map((r) => ({ text_content: r.text_content, locator: r.locator }));
}

/** The first line whose normalized text starts with one of `prefixes`, with the label
 *  stripped off — plus the NEXT line, because a label and its figure are as often printed
 *  in two regions as in one. */
// The tail is sliced off the NORMALIZED line, never the raw one: `norm` collapses runs of
// whitespace, so an index found in the normalized string does not address the same character
// in the raw string, and a label printed with double spacing would slice mid-token. Digits,
// separators and decimal points survive normalization unchanged, so nothing the money/date
// grammars read is lost. Both ends are stripped of label and delimiter noise, because
// `parseMoneyCents`/`parseStatementDate` refuse anything they cannot read EXACTLY — which is
// the right behaviour, and which makes an unstripped tail a silent `header_unreadable`.
function labelled(lines, prefixes) {
  for (const [index, line] of lines.entries()) {
    const n = normText(line.text);
    const hit = prefixes.find((p) => n.startsWith(p) || n.includes(`/ ${p}`) || n.includes(`${p} :`));
    if (!hit) continue;
    const tail = n.slice(n.indexOf(hit) + hit.length)
      .replace(/^[\s:.\-–]+/, "")
      .replace(/[\s,;|"']+$/, "")
      .trim();
    return { tail, next: lines[index + 1]?.text ?? "", line: line.text };
  }
  return null;
}

/** A labelled MONEY figure — the label's own tail first, then the following region. */
function labelledMoney(lines, prefixes) {
  const found = labelled(lines, prefixes);
  if (!found) return null;
  return parseMoneyCents(found.tail) ?? parseMoneyCents(found.next);
}

/** A labelled DATE — same two-region tolerance. */
function labelledDate(lines, prefixes, period) {
  const found = labelled(lines, prefixes);
  if (!found) return null;
  return parseStatementDate(found.tail, period) ?? parseStatementDate(found.next, period);
}

/** A printed period range (`01/04/2025 - 30/04/2025`, `01/04/2025 TO 30/04/2025`), or null.
 *  Scanned across every header line, because the range is as often printed bare as labelled. */
function readPeriod(lines) {
  const RANGE = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(?:-|–|—|to|hingga|until)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;
  for (const line of lines) {
    const m = RANGE.exec(line.text);
    if (!m) continue;
    const start = parseStatementDate(m[1]);
    const end = parseStatementDate(m[2]);
    if (start && end && start <= end) return { start, end };
  }
  return null;
}

/** The printed account number, from its own label. Never a bare digit run: an unlabelled
 *  12-digit token on a bank letterhead is as likely a branch or a reference number. */
function readAccountNumber(lines) {
  const found = labelled(lines, LABELS.account_number);
  if (!found) return null;
  for (const printed of [found.tail, found.next]) {
    const normalized = normalizeAccountNumber(printed);
    if (normalized) return { printed: String(printed).trim(), normalized };
  }
  return null;
}

/** Learn the transaction table's columns from its own header row, or null when this row is
 *  not a statement header. A statement row is addressable only when we can find WHEN it
 *  happened and HOW MUCH moved — either a single signed amount column, or a debit/credit
 *  pair. Without both axes this is some other table and we must not guess. */
function readColumns(row) {
  const cols = {};
  for (const cell of row.cells) {
    const text = normText(cellText(cell));
    if (!text) continue;
    for (const [key, syns] of Object.entries(COLUMN_SYNONYMS)) {
      if (cols[key] === undefined && syns.includes(text)) cols[key] = cell.at.x;
    }
  }
  const hasAmount = cols.amount !== undefined || (cols.debit !== undefined && cols.credit !== undefined);
  return cols.entry_date !== undefined && hasAmount ? cols : null;
}

/**
 * THE ONE LABEL-ANCHORED HEADER READ, over an ordered list of printed text lines
 * (`[{text, page, y, x}]`). Exported because BOTH readers must anchor on the same printed
 * labels: reader-1 applies it to the STORED layout regions, and the reader-2 engine
 * normalizer applies it to the VENDOR RESPONSE's own `pages[].lines[]` — which is what
 * lets reader-2 produce the printed TOTAL DEBIT / TOTAL CREDIT the typed bank-statement
 * model has no field for, without either reader borrowing the other's numbers.
 *
 * Sharing the VOCABULARY is not sharing the READING: the two inputs are different OCR runs
 * by different models over the same bytes. What must never be shared is a figure, and none
 * is — this function is pure and stateless.
 *
 * Every field is null when unreadable; the caller decides what a missing field means.
 */
export function readHeaderFromTextLines(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const headerText = rows.slice(0, 60).map((l) => l.text).join("\n");
  const period = readPeriod(rows);
  const institution = matchInstitution(headerText);
  const account = readAccountNumber(rows);
  const opening = labelledMoney(rows, LABELS.opening);
  const closing = labelledMoney(rows, LABELS.closing);
  const totalDebit = labelledMoney(rows, LABELS.total_debit);
  const totalCredit = labelledMoney(rows, LABELS.total_credit);
  return {
    institution_code: institution?.code ?? null,
    institution_name: institution?.name ?? null,
    account_number: account?.printed ?? null,
    account_number_normalized: account?.normalized ?? null,
    // Absence reads MYR (WC-R5, the 0023 posture) — but the READER reports what was
    // PRINTED, and the corroborator applies the default. A reader that silently defaulted
    // could never surface a genuinely foreign statement.
    currency: detectCurrency(headerText),
    period_start: period?.start ?? null,
    period_end: period?.end ?? null,
    statement_date: labelledDate(rows, LABELS.statement_date, period ?? {}),
    // Endpoints are ABSOLUTE magnitudes on the page; a bank account in credit prints a
    // positive balance and an overdrawn one prints DR. `applySign` with no column side
    // returns null for an unmarked figure, so an unmarked balance reads positive.
    opening_cents: signedBalance(opening),
    closing_cents: signedBalance(closing),
    total_debit_cents: totalDebit?.cents ?? null,
    total_credit_cents: totalCredit?.cents ?? null,
  };
}

/**
 * Layout regions → the statement HEADER + LINE SKELETON reader-1 offers for corroboration,
 * plus a receipt naming every field it could not read.
 *
 * The returned `header` carries `null` for anything unreadable — it is the CALLER
 * (`statement-corroboration.mjs`) that turns a missing endpoint into `header_unreadable`
 * and a missing printed total into `totals_unreadable`, because those refusals are a
 * property of the AGREED read, not of one reader.
 *
 * @param {Array<{field_path:string,text_content:string,locator:object}>} regions
 * @returns {{header:object, lines:Array<object>, receipt:object}}
 */
export function readStatementFromLayout(regions) {
  const rows = Array.isArray(regions) ? regions : [];
  const lines = pageLines(rows);
  const receipt = { reader: "layout_geometry", region_count: rows.length, unread: [], notes: [] };

  const header = readHeaderFromTextLines(lines);
  for (const field of HEADER_FIELDS) if (header[field] === null || header[field] === undefined) receipt.unread.push(field);

  const parsed = readLines(tableCells(rows), { start: header.period_start, end: header.period_end });
  receipt.line_rows_seen = parsed.rowsSeen;
  receipt.line_rows_skipped = parsed.skipped;
  if (!parsed.columns) receipt.notes.push("no_transaction_table_header");
  header.line_count = parsed.lines.length;
  return { header, lines: parsed.lines, receipt };
}

/** A printed balance → signed cents. Unmarked reads positive (money in the account);
 *  a DR/`-` marked balance is an overdraft and reads negative. */
function signedBalance(money) {
  if (!money) return null;
  const signed = applySign(money);
  return signed === null ? money.cents : signed;
}

/** The transaction rows, in printed order. Rows without a readable date AND a readable
 *  signed amount are FURNITURE (`Balance B/F`, page continuations, per-page subtotals) and
 *  are skipped and counted — never silently dropped, never guessed at. */
function readLines(cells, period) {
  const rows = groupRowsX(cells ?? [], ROW_TOLERANCE);
  let columns = null;
  const out = [];
  let rowsSeen = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!columns) {
      columns = readColumns(row);
      continue;
    }
    rowsSeen += 1;
    const at = (key) => (columns[key] === undefined ? null : cellAtX(row, columns[key], COL_TOLERANCE));
    const entryDate = parseStatementDate(cellText(at("entry_date")), period);
    if (!entryDate) {
      skipped += 1;
      continue;
    }
    const amount = readRowAmount(row, columns, at);
    if (amount === null) {
      skipped += 1;
      continue;
    }
    const running = parseMoneyCents(cellText(at("running_balance")));
    out.push({
      line_no: out.length + 1,
      entry_date: entryDate,
      value_date: parseStatementDate(cellText(at("value_date")), period),
      // Descriptions are UNCORROBORATED PROSE (design §4.2) — they inform, never decide,
      // and they are never part of the corroboration set.
      description: cellText(at("description")) || null,
      amount_cents: amount,
      running_balance_cents: running ? signedBalance(running) : null,
    });
  }
  return { lines: out, columns, rowsSeen, skipped };
}

/** One row's SIGNED amount under the sign law, from whichever layout the statement uses. */
function readRowAmount(row, columns, at) {
  if (columns.amount !== undefined) {
    const money = parseMoneyCents(cellText(at("amount")));
    return money ? applySign(money) : null;
  }
  const debit = parseMoneyCents(cellText(at("debit")));
  const credit = parseMoneyCents(cellText(at("credit")));
  if (debit && credit) return null; // both columns filled is not a readable row
  if (debit) return applySign(debit, "debit");
  if (credit) return applySign(credit, "credit");
  return null;
}
