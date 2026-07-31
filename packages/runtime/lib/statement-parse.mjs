// The STRUCTURED bank-statement lane (Wave C-b design §4.3, lane `statement_parse`): two
// deterministic, IN-PROCESS parsers behind ONE interface. No model, no vendor, no egress —
// which is exactly why this lane sits outside the kill switch and the page budget while
// still being consent-recorded at enqueue (design §4.3/§4.4).
//
// "THE CHAIN IS THE SECOND READER" (WC-R7). The OCR lane earns corroboration from two
// independent readers agreeing. A CSV or OFX file has only one honest reading — the bytes
// say what they say — so a second parser would be theatre. What stands in for reader-2 here
// is the STATEMENT IDENTITY itself: `opening + Σ(amounts) = closing`, every printed running
// balance stepping, and the printed TOTAL DEBIT/TOTAL CREDIT cross-check when the file
// carries them. A file that parses but does not chain is refused (`chain_broken`) exactly
// as a two-reader disagreement is. That is a genuinely independent check because the
// numbers it reconciles were produced by the BANK, not by this parser.
//
// CSV FIRST, OFX BEHIND THE SAME INTERFACE (design §4.3 — "CSV ships first, OFX rides the
// same lane behind its own fixture"). Both return the identical `{header, lines, receipt}`
// shape the OCR lane produces, so `statement-corroboration.mjs` and the persist payload
// builder never learn which lane fed them.
//
// REFUSAL-BIASED. A column we cannot map, an amount we cannot read, a date that does not
// round-trip: all null, all counted in the receipt, none guessed. A statement is a legal
// record of money; a plausible-looking parse of an ambiguous file is worse than no parse.

import { readFile } from "node:fs/promises";
import {
  applySign,
  detectCurrency,
  isoDate,
  matchInstitution,
  norm,
  normalizeAccountNumber,
  parseMoneyCents,
  parseStatementDate,
} from "./statement-grammar.mjs";

/** Hard cap on a structured statement file. A bank statement is a month of one account;
 *  anything past this is not one, and an unbounded read is an availability surface. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_LINES = 20_000;

const CSV_COLUMNS = Object.freeze({
  entry_date: ["date", "entry date", "transaction date", "trans date", "posting date", "tarikh"],
  value_date: ["value date", "tarikh nilai"],
  description: ["description", "details", "particulars", "narrative", "transaction description", "keterangan"],
  amount: ["amount", "transaction amount", "amaun"],
  debit: ["debit", "withdrawal", "withdrawals", "debit amount", "dr"],
  credit: ["credit", "deposit", "deposits", "credit amount", "cr"],
  running_balance: ["balance", "running balance", "statement balance", "ledger balance", "baki"],
});

export class StatementParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StatementParseError";
    this.code = code;
  }
}

/**
 * The lane's single entry point. `format` is 'csv' or 'ofx' (mapped from the document's
 * mime by the caller). Returns the same `{header, lines, receipt}` shape reader-1 returns.
 *
 * @param {string} filePath canonical bytes already downloaded and sha-verified
 * @param {string} format   'csv' | 'ofx'
 */
export async function parseStatementFile(filePath, format) {
  const bytes = await readFile(filePath);
  if (bytes.byteLength > MAX_BYTES) throw new StatementParseError("limit", "statement file exceeds the structured-parse cap");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    // OFX 1.x is frequently latin-1; CSV exports from Malaysian banking portals sometimes
    // are too. Fall back rather than refuse — but only after UTF-8 has genuinely failed.
    text = bytes.toString("latin1").replace(/^\uFEFF/, "");
  }
  if (format === "ofx") return parseStatementOfx(text);
  if (format === "csv") return parseStatementCsv(text);
  throw new StatementParseError("bad_type", `unsupported structured statement format '${format}'`);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC4180-shaped split of one line, honouring quotes and doubled quotes. */
function splitCsvLine(line, delimiter) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** The delimiter the file actually uses, learned from its own header row. */
function detectDelimiter(headerLine) {
  for (const d of [",", ";", "\t", "|"]) {
    if (splitCsvLine(headerLine, d).length >= 3) return d;
  }
  return null;
}

/**
 * A bank-exported CSV → `{header, lines, receipt}`.
 *
 * The PREAMBLE (everything above the transaction header row) carries the header facts:
 * institution, account number, period, statement date, opening/closing, printed totals.
 * A CSV export that carries no opening/closing at all is not refused HERE — it is returned
 * with nulls, and `statement-corroboration.mjs` raises `header_unreadable`, so one refusal
 * taxonomy governs both lanes.
 */
export function parseStatementCsv(text) {
  const rawLines = String(text).split(/\r?\n/);
  if (rawLines.length > MAX_LINES) throw new StatementParseError("limit", "statement CSV exceeds the row cap");
  const receipt = { reader: "csv", rows_seen: 0, rows_skipped: 0, notes: [] };

  let headerIndex = -1;
  let delimiter = null;
  let columns = null;
  for (const [index, line] of rawLines.entries()) {
    if (!line.trim()) continue;
    const d = detectDelimiter(line);
    if (!d) continue;
    const mapped = mapCsvColumns(splitCsvLine(line, d));
    if (mapped) {
      headerIndex = index;
      delimiter = d;
      columns = mapped;
      break;
    }
  }
  if (!columns) throw new StatementParseError("corrupt", "no transaction header row found in the statement CSV");

  const preamble = rawLines.slice(0, headerIndex).join("\n");
  const header = readPreambleHeader(preamble);

  const lines = [];
  for (const raw of rawLines.slice(headerIndex + 1)) {
    if (!raw.trim()) continue;
    receipt.rows_seen += 1;
    const cells = splitCsvLine(raw, delimiter);
    const at = (key) => (columns[key] === undefined ? "" : (cells[columns[key]] ?? ""));
    const entryDate = parseStatementDate(at("entry_date"), { start: header.period_start, end: header.period_end });
    const amount = csvRowAmount(columns, at);
    if (!entryDate || amount === null || amount === 0) {
      // Zero-amount ceremony rows (account-closure months) are skipped-and-counted --
      // the DB's line law requires non-zero movement; same rule as the layout reader.
      receipt.rows_skipped += 1;
      continue;
    }
    const running = parseMoneyCents(at("running_balance"));
    lines.push({
      line_no: lines.length + 1,
      entry_date: entryDate,
      value_date: parseStatementDate(at("value_date"), { start: header.period_start, end: header.period_end }),
      description: at("description") || null,
      amount_cents: amount,
      running_balance_cents: running ? (applySign(running) ?? running.cents) : null,
    });
  }
  header.line_count = lines.length;
  return { header, lines, receipt };
}

function mapCsvColumns(cells) {
  const columns = {};
  for (const [index, cell] of cells.entries()) {
    const key = norm(cell);
    if (!key) continue;
    for (const [field, syns] of Object.entries(CSV_COLUMNS)) {
      if (columns[field] === undefined && syns.includes(key)) columns[field] = index;
    }
  }
  const hasAmount = columns.amount !== undefined || (columns.debit !== undefined && columns.credit !== undefined);
  return columns.entry_date !== undefined && hasAmount ? columns : null;
}

function csvRowAmount(columns, at) {
  if (columns.amount !== undefined) {
    const money = parseMoneyCents(at("amount"));
    return money ? applySign(money) : null;
  }
  const debit = parseMoneyCents(at("debit"));
  const credit = parseMoneyCents(at("credit"));
  if (debit && credit) return null;
  if (debit) return applySign(debit, "debit");
  if (credit) return applySign(credit, "credit");
  return null;
}

/** Header facts read out of the CSV preamble by label — the same vocabulary the layout
 *  reader anchors on, applied to `Label,Value` rows instead of page regions. */
function readPreambleHeader(preamble) {
  const rows = String(preamble).split(/\r?\n/);
  // The value is sliced off the NORMALIZED row, never the raw one: `norm` collapses runs of
  // whitespace, so an index found in the normalized string does not address the same
  // character in the raw string (`Beginning  Balance,1,000.00` drifts by one and the slice
  // lands mid-token). Digits, separators and decimal points survive normalization
  // unchanged, so nothing load-bearing is lost by reading the normalized form.
  //
  // BOTH ENDS are stripped of delimiter noise. A `Label,Value,` row leaves a TRAILING comma
  // on the value, and `parseMoneyCents`/`parseStatementDate` refuse — correctly, they must
  // never coerce — so an unstripped tail silently turned every preamble figure into a
  // `header_unreadable`. Caught by the first smoke fixture; the strip is the fix.
  const find = (needles) => {
    for (const row of rows) {
      const n = norm(row);
      const hit = needles.find((needle) => n.includes(needle));
      if (!hit) continue;
      return n.slice(n.indexOf(hit) + hit.length)
        .replace(/^[\s:,;|.\-–"']+/, "")
        .replace(/[\s,;|"']+$/, "")
        .trim();
    }
    return "";
  };
  const money = (needles) => parseMoneyCents(find(needles));
  const period = readPeriodFromText(preamble);
  const institution = matchInstitution(preamble);
  const accountRaw = find(["account no", "account number", "acc no", "no akaun", "a/c no"]);
  const opening = money(["beginning balance", "opening balance", "balance b/f", "baki awal"]);
  const closing = money(["ending balance", "closing balance", "balance c/f", "ledger balance", "baki akhir"]);
  const debit = money(["total debit", "jumlah debit"]);
  const credit = money(["total credit", "jumlah kredit"]);
  return {
    institution_code: institution?.code ?? null,
    institution_name: institution?.name ?? null,
    account_number: accountRaw || null,
    account_number_normalized: normalizeAccountNumber(accountRaw),
    currency: detectCurrency(preamble),
    period_start: period?.start ?? null,
    period_end: period?.end ?? null,
    statement_date: parseStatementDate(find(["statement date", "tarikh penyata"]), period ?? {}),
    opening_cents: opening ? (applySign(opening) ?? opening.cents) : null,
    closing_cents: closing ? (applySign(closing) ?? closing.cents) : null,
    total_debit_cents: debit?.cents ?? null,
    total_credit_cents: credit?.cents ?? null,
  };
}

function readPeriodFromText(text) {
  const RANGE = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(?:-|–|—|to|hingga|until)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;
  const m = RANGE.exec(String(text));
  if (!m) return null;
  const start = parseStatementDate(m[1]);
  const end = parseStatementDate(m[2]);
  return start && end && start <= end ? { start, end } : null;
}

// ---------------------------------------------------------------------------
// OFX (1.x SGML and 2.x XML), read as a TAG STREAM
// ---------------------------------------------------------------------------
//
// OFX 1.x is SGML with unclosed leaf tags (`<DTPOSTED>20250403`), 2.x is well-formed XML.
// Both are read here by the SAME token scan: a tag, then the text up to the next tag. That
// is deliberately not an XML parser — an OFX file is a flat record stream inside a small
// number of containers, and a real parser would buy nothing but an entity-expansion
// surface. Entity references are NOT expanded (only the five predefined ones are decoded),
// so an OFX file cannot become an XXE vector on this path.

const OFX_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeOfx(value) {
  return String(value).replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (whole, name) => {
    if (OFX_ENTITIES[name]) return OFX_ENTITIES[name];
    const code = Number(name.slice(1));
    return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
  });
}

/** `<TAG>text` / `</TAG>` tokens in document order. */
function ofxTokens(text) {
  const body = String(text).replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  const re = /<(\/?)([A-Za-z0-9._]+)[^>]*>([^<]*)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ close: m[1] === "/", tag: m[2].toUpperCase(), text: decodeOfx(m[3]).trim() });
    if (out.length > MAX_LINES * 12) throw new StatementParseError("limit", "OFX token cap exceeded");
  }
  return out;
}

/** OFX `YYYYMMDD[HHMMSS][.XXX][TZ]` → ISO date, or null. */
export function parseOfxDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(value ?? "").trim());
  return m ? isoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** An OFX signed amount → cents. OFX states the sign IN the amount (`-1234.56`), which is
 *  already the design's sign law: negative is out of the account. */
function parseOfxAmount(value) {
  const raw = String(value ?? "").trim();
  const money = parseMoneyCents(raw);
  if (!money) return null;
  return /^-/.test(raw) ? -money.cents : money.cents;
}

/**
 * An OFX/QFX bank statement → `{header, lines, receipt}`.
 *
 * Mapped fields: `BANKID`/`ACCTID` (identity) · `CURDEF` (currency) · `DTSTART`/`DTEND`
 * (period) · `LEDGERBAL/BALAMT`+`DTASOF` (closing + statement date) · each `STMTTRN`
 * (`DTPOSTED`, `DTAVAIL`, `TRNAMT`, `NAME`/`MEMO`).
 *
 * OFX carries NO opening balance and NO printed totals — the format simply does not have
 * them. The design's endpoints law is not weakened for it: `opening_cents` is left NULL and
 * `statement-corroboration.mjs` raises `header_unreadable`, so an OFX file corroborates
 * ONLY when its own `<LEDGERBAL>` plus an opening supplied by continuity is available. That
 * is a deliberate, named limitation of this lane rather than a derived opening — deriving
 * `opening = closing − Σ(amounts)` would make the chain check tautological, which is the
 * exact defect §3 forbids.
 */
export function parseStatementOfx(text) {
  const tokens = ofxTokens(text);
  if (!tokens.some((t) => t.tag === "STMTTRN" || t.tag === "BANKTRANLIST")) {
    throw new StatementParseError("bad_type", "file carries no OFX bank transaction list");
  }
  const receipt = { reader: "ofx", rows_seen: 0, rows_skipped: 0, notes: ["ofx_carries_no_opening_or_printed_totals"] };
  const flat = {};
  const lines = [];
  let current = null;
  let inLedgerBal = false;
  const ledger = {};

  for (const token of tokens) {
    if (token.tag === "STMTTRN") {
      if (!token.close) current = {};
      else {
        if (current) pushOfxLine(lines, current, receipt);
        current = null;
      }
      continue;
    }
    if (token.tag === "LEDGERBAL") {
      inLedgerBal = !token.close;
      continue;
    }
    if (token.close || !token.text) continue;
    if (current) current[token.tag] = token.text;
    else if (inLedgerBal) ledger[token.tag] = token.text;
    else if (flat[token.tag] === undefined) flat[token.tag] = token.text;
  }
  if (current) pushOfxLine(lines, current, receipt);

  const institution = flat.ORG ? matchInstitution(flat.ORG) : null;
  const accountRaw = flat.ACCTID ?? null;
  const closing = ledger.BALAMT === undefined ? null : parseOfxAmount(ledger.BALAMT);
  const header = {
    institution_code: institution?.code ?? null,
    institution_name: institution?.name ?? flat.ORG ?? null,
    account_number: accountRaw,
    account_number_normalized: normalizeAccountNumber(accountRaw),
    currency: flat.CURDEF ? String(flat.CURDEF).toUpperCase() : null,
    period_start: parseOfxDate(flat.DTSTART),
    period_end: parseOfxDate(flat.DTEND),
    statement_date: parseOfxDate(ledger.DTASOF) ?? parseOfxDate(flat.DTEND),
    opening_cents: null,
    closing_cents: closing,
    total_debit_cents: null,
    total_credit_cents: null,
    line_count: lines.length,
  };
  return { header, lines, receipt };
}

function pushOfxLine(lines, trn, receipt) {
  receipt.rows_seen += 1;
  const entryDate = parseOfxDate(trn.DTPOSTED);
  const amount = parseOfxAmount(trn.TRNAMT);
  if (!entryDate || amount === null || amount === 0) {
    receipt.rows_skipped += 1;
    return;
  }
  const description = [trn.NAME, trn.MEMO].filter(Boolean).join(" — ") || null;
  lines.push({
    line_no: lines.length + 1,
    entry_date: entryDate,
    value_date: parseOfxDate(trn.DTAVAIL),
    description,
    amount_cents: amount,
    // OFX never prints a per-transaction running balance. NULL is honest: the chain's
    // per-step check simply has no printed witness to compare against on this lane, and
    // `chainReceipt` skips a null without weakening the closure check.
    running_balance_cents: null,
  });
}
