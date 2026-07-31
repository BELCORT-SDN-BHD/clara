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
 * NEWEST done `ocr` extraction that no LATER OCR read has replaced — deliberately NOT the
 * matcher's read-ALL-extractions shape: a statement is one coherent document and
 * concatenating two engines' regions would interleave them by position and garble the table.
 *
 * SUPERSEDE IS JUDGED KIND-HONESTLY (C-b acceptance, 2026-07-31): the 0017 authority
 * trigger supersedes KIND-BLIND, so in real pipeline order (OCR → classify → kind-stamp)
 * the geometry always arrives "superseded" by a doc_classify verdict and a bare
 * `superseded_by is null` filter starves reader-1 on EVERY real document. Only a LATER OCR
 * read replaces geometry — the filter excludes an ocr row only when its superseder is
 * itself ocr-kind; newest-first then picks the latest genuine re-OCR. (Trigger scope
 * ledgered in PROJECTLOG PART 2; ordering per classify.mjs — extracted_at first.)
 */
export async function readStatementLayoutRegions(client, { documentId, firmId }) {
  const r = await client.query(
    `with newest as (
       select e.id, e.firm_id, e.engine_id
         from clara.document_extractions e
        where e.document_id = $1 and e.firm_id = $2 and e.status = 'done'
          and e.engine_kind = 'ocr'
          and not exists (
            select 1 from clara.document_extractions s
             where s.id = e.superseded_by and s.engine_kind = 'ocr')
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

/** Page-line regions in printed reading order — the header substrate. */
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

/** Table cells as HEADER-SCAN pseudo-lines, in (table, cell) order — the real Maybank
 *  header block is itself a table, so the label→value adjacency the line scan needs lives
 *  in consecutive CELLS there, not in page lines. Text-only: the header finders never
 *  read geometry.
 *
 *  LEDGER TABLES ARE EXCLUDED (PR #155 review BLOCKER): a transaction table's text is
 *  full of header-label look-alikes (`BALANCE B/F` IS an opening needle; a subtotal row
 *  IS a totals needle with no cross-reader backstop) — feeding it to the label scan can
 *  slurp an adjacent unrelated number into the header. */
/** Word-bounded synonym containment — the ONE matching idiom for column/ledger detection:
 *  trilingual combined cells never hit whole-cell equality; consumers fail safe on over-match. */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function containsSynonym(text, syns) {
  return syns.some((s) => new RegExp(`(?:^|[^a-z0-9])${escRe(s)}(?:[^a-z0-9]|$)`).test(text));
}

function ledgerShapedTables(byTable) {
  const out = new Set();
  // ROW-LOCAL, by the SAME addressability rule readColumns posts (PR #156 review: a
  // table-wide word sweep let ONE stray amount-vocabulary cell — a disclaimer sharing the
  // header table — exclude the whole header table and silently revert header_unreadable).
  // A table is ledger-shaped iff some geometry-grouped ROW of it maps as a transaction
  // header; a stray word cannot fabricate an addressable row.
  for (const [table, cells] of byTable) {
    const rows = groupRowsX(cells.map((c) => ({ text_content: c.text, locator: c.locator })), ROW_TOLERANCE);
    if (rows.some((row) => readColumns(row) !== null)) out.add(table);
  }
  return out;
}

function cellScanLines(regions) {
  const cells = regions
    .filter((r) => r.field_path.startsWith("tables."))
    .map((r) => {
      const m = /^tables\.(\d+)\.cells\.(\d+)$/.exec(r.field_path);
      return { text: r.text_content, locator: r.locator, table: m ? Number(m[1]) : 0, cell: m ? Number(m[2]) : 0 };
    })
    .sort((a, b) => a.table - b.table || a.cell - b.cell);
  const byTable = new Map();
  for (const c of cells) {
    if (!byTable.has(c.table)) byTable.set(c.table, []);
    byTable.get(c.table).push(c);
  }
  const ledger = ledgerShapedTables(byTable);
  return cells
    .filter((c) => !ledger.has(c.table))
    .map((c) => ({ text: c.text, page: 0, y: 0, x: 0 }));
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
  const all = labelledAll(lines, prefixes);
  if (!all.length) return null;
  return { ...all[0], next: all[0].nexts[0] ?? "" };
}

/** Every label hit, each with its stripped tail + an eight-region look-ahead (the real
 *  202509 prints `ENDING BALANCE :` and `29,660.41` seven cells apart). */
function labelledAll(lines, prefixes) {
  const out = [];
  for (const [index, line] of lines.entries()) {
    const n = normText(line.text);
    const hit = prefixes.find((p) => n.startsWith(p) || n.includes(`/ ${p}`) || n.includes(`${p} :`));
    if (!hit) continue;
    out.push({
      tail: n.slice(n.indexOf(hit) + hit.length).replace(/^[\s:.\-–]+/, "").replace(/[\s,;|"']+$/, "").trim(),
      nexts: lines.slice(index + 1, index + 9).map((l) => l.text),
    });
  }
  return out;
}

function labelledMoney(lines, prefixes) {
  // EVERY label occurrence gets a chance (the real 202509 prints the label on page lines
  // with no nearby value AND in a summary table seven cells from its figure -- first-hit-
  // wins starved the one that carries the value). Look-aheads are STRICT whole-region
  // money literals, so prose and dates can never be slurped.
  for (const found of labelledAll(lines, prefixes)) {
    const tail = parseMoneyCents(found.tail);
    if (tail) return tail;
    for (const t of found.nexts) {
      const m = parseMoneyCents(String(t ?? "").trim().replace(/^[:\s]+/, ""));
      if (m) return m;
    }
  }
  return null;
}

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

/** A plausible printed ACCOUNT token for a look-ahead region: an optional leading `:`,
 *  digits/dashes/spaces ONLY, never anything that reads as a date in ANY separator, and
 *  never fewer than EIGHT digits (every DDMMYY shape is six; no Malaysian bank prints
 *  fewer than eight — PR #155 review MAJOR: `30-04-25`/`30 04 25` both normalize to a
 *  six-digit "300425" that the slash-only guard missed). */
function accountToken(text) {
  const s = String(text ?? "").trim().replace(/^[:\s]+/, "");
  if (!s || !/^[\d\s-]+$/.test(s)) return null;
  if (parseStatementDate(s.replace(/\s+/g, "/").replace(/-/g, "/"), {})) return null;
  const normalized = normalizeAccountNumber(s);
  return normalized && normalized.length >= 8 ? normalized : null;
}

/** The printed account number, from its own label — never a bare digit run. The label's
 *  own tail keeps the permissive parse; look-ahead regions use the STRICT token shape
 *  (the real corpus separates label from digits by up to five dwibahasa regions). */
function readAccountNumber(lines) {
  const found = labelled(lines, LABELS.account_number);
  if (!found) return null;
  const tailNormalized = normalizeAccountNumber(found.tail);
  if (tailNormalized) return { printed: String(found.tail).trim(), normalized: tailNormalized };
  for (const printed of found.nexts ?? []) {
    const normalized = accountToken(printed);
    if (normalized) return { printed: String(printed).trim(), normalized };
  }
  return null;
}

/** Learn the transaction table's columns from its own header row, or null when this row is
 *  not a statement header. A statement row is addressable only when we can find WHEN it
 *  happened and HOW MUCH moved — either a single signed amount column, or a debit/credit
 *  pair. Without both axes this is some other table and we must not guess. */
function readColumns(row) {
  // WORD-BOUNDED CONTAINS (real 202506: trilingual combined headers never hit an exact
  // match — the table read ZERO rows; only the chain refusal caught it), in TWO PASSES,
  // specificity before position (PR #156 review: x-order alone collapsed entry_date onto
  // an inverted VALUE DATE column): multi-word synonyms claim their cells first regardless
  // of order; bare single-word synonyms then fill unmapped keys from unclaimed cells.
  const cols = {};
  const claimed = new Set();
  const passes = [
    (syns) => syns.filter((s) => s.includes(" ") || s.includes("/")),
    (syns) => syns.filter((s) => !s.includes(" ") && !s.includes("/")),
  ];
  for (const pick of passes) {
    for (const cell of row.cells) {
      if (claimed.has(cell)) continue;
      const text = normText(cellText(cell));
      if (!text) continue;
      for (const [key, syns] of Object.entries(COLUMN_SYNONYMS)) {
        if (cols[key] !== undefined) continue;
        if (containsSynonym(text, pick(syns))) {
          cols[key] = cell.at.x;
          claimed.add(cell);
          break;
        }
      }
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

  // The HEADER scan reads the page lines first, then the table cells as pseudo-lines in
  // cell order (C-b acceptance, 202504): the real Maybank layout carries its cleanest
  // label→value adjacency INSIDE a header table (`NOMBOR AKAUN` in one cell, the digits
  // two cells later), which the pages.* substrate never sees. Page lines stay first so a
  // page-adjacent value keeps winning when both exist; the finders are label-anchored and
  // refusal-biased, so extra scan text can only fill fields, never corrupt them.
  const headerScan = lines.concat(cellScanLines(rows));
  const header = readHeaderFromTextLines(headerScan);

  // A REAL Maybank monthly statement prints NO period range — only the statement date
  // (C-b acceptance, 202504: every header token present, no `01/04 to 30/04` anywhere).
  // The month convention is derivable: the period is the statement date's own month up to
  // the statement date. Derivation is honest by construction — every line date is checked
  // against the period here AND re-checked in the DB core, and month-to-month continuity
  // binds the endpoints, so a wrong derivation refuses loudly instead of mis-filing.
  if (!header.period_start && !header.period_end && header.statement_date) {
    header.period_start = `${header.statement_date.slice(0, 8)}01`;
    header.period_end = header.statement_date;
    receipt.notes.push("period_derived_from_statement_date");
  }
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
    if (amount === null || amount === 0) {
      // Zero-amount rows are CEREMONY, not movement (the real 202512 account-closure month
      // prints nine 0.00 settle/close rows): the DB's line law requires non-zero
      // amount_cents, and the typed vendor read skips them too. Skipped-and-counted.
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
