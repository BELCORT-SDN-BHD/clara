// Bank-statement GRAMMAR (Wave C-b — `docs/plan/completed/wave-c-b-bank-design.md` §3, §4.2, §4.3).
//
// WHY A GRAMMAR MODULE. Three independent producers have to agree on what a printed
// Malaysian bank statement MEANS before any of them may claim corroboration: reader-1
// (the deterministic layout-geometry pass, `statement-layout-reader.mjs`), the structured
// lane (`statement-parse.mjs` — CSV/OFX), and the reader-2 engine normalizer
// (`../workflows/statementFacts.v1.engine.mjs`). If each carried its own money/date/sign
// rules, "the readers agreed" would only mean "two copies of the same bug agreed". This
// module is the ONE place those rules live, and it is deliberately tiny, pure and
// refusal-biased: every helper returns `null` rather than a guess. The house pattern is
// `invoice-amount-grammar.mjs` / `opening-tb-grammar.mjs`; this is the bank sibling.
//
// THE SIGN LAW (design §4.2). `amount_cents` is SIGNED, and the sign is the ACCOUNT
// HOLDER's direction of travel: **+ = into the account, − = out of the account**. A
// Malaysian statement prints that direction in one of three ways and this module maps all
// three to the one law:
//   * a trailing marker on a single "TRANSACTION AMOUNT" column — `1,234.56-` (out),
//     `500.00+` (in). This is Maybank's printed form on the real corpus [C].
//   * a `DR` / `CR` suffix — DR reduces the customer's balance (out), CR increases it (in).
//   * two separate columns (Debit | Credit) — debit is out, credit is in.
// Nothing here infers direction from the running balance: the running balance is an
// INDEPENDENT witness the chain check cross-examines (design §3), so using it to decide the
// sign would make the chain tautological — exactly the v1 defect the review lanes killed.
//
// NEVER FLOATING POINT. Money is bigint cents end-to-end. `parseMoneyCents` reads the
// digit string directly (integer part, then exactly two decimal places) rather than
// multiplying a parsed float by 100, so `0.29` can never arrive as 28 cents.
//
// DATES. Maybank line dates print DD/MM with NO YEAR [C]; the year is derived from the
// statement period and the DB re-checks that every line date falls inside the period
// (`line_date_out_of_period`). A date that does not round-trip through a real calendar day
// is REFUSED, never coerced — 31/02 rolls over silently in the Date constructor.

/** ISO date, or null. Validates the round-trip so 31/02 is refused rather than rolled. */
export function isoDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const probe = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return null;
  return iso;
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Bahasa Malaysia month abbreviations print on the same statements (dwibahasa layout).
  // Keys are matched on the first THREE letters, so only 3-letter forms belong here.
  mac: 3, ogo: 8, dis: 12, okt: 10,
};

/** lower-case, single-spaced, trimmed — the shape every label synonym is matched in. */
export const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Digits only. The form `bank_accounts.account_number_normalized` binds ingest on (design §4.1). */
export function normalizeAccountNumber(text) {
  const digits = String(text ?? "").replace(/\D+/g, "");
  return digits.length >= 6 && digits.length <= 24 ? digits : null;
}

/**
 * The `client_identifiers` HOUSE normalization, unchanged (0007:679-680, 0007:1524-1525):
 * lower-cased, ALL whitespace stripped, hyphens PRESERVED. Restated here only so the bank
 * lane can compute the printed form it files alongside the digits-only form (design §4.1's
 * "two guarded inserts") without importing the identity lane. Changing this would orphan
 * every tin/ssm row — it is quoted law, not a local choice.
 */
export function houseNormalizeIdentifier(text) {
  return String(text ?? "").toLowerCase().replace(/\s+/g, "");
}

/**
 * Money → { cents, marker } in ABSOLUTE cents plus the printed direction marker, or null.
 * `marker` is one of '+', '-', 'DR', 'CR' or null (unmarked). The CALLER applies the sign
 * law — a single-amount column uses the marker, a two-column layout uses the column.
 *
 * Accepted: `1,234.56` · `1234.56` · `RM1,234.56` · `MYR 1,234.56` · `1,234.56-` ·
 * `500.00+` · `(1,234.56)` (accounting negative) · `1,234.56 DR` · `1,234.56CR` · `1,234`
 * (whole ringgit) · `.00` / `.50` (a LEADING-DOT decimal: Maybank prints zero with no
 * integer part — the real 202504 statement's every endpoint reads `.00`, found by the
 * first real C-b acceptance month — and the same form with a nonzero fraction is an
 * equally genuine sub-ringgit figure, not OCR noise).
 * Anything else is null — a statement figure we cannot read is a refusal
 * (`header_unreadable` / `totals_unreadable` / a line skeleton that will not corroborate),
 * never an assumption.
 */
export function parseMoneyCents(text) {
  let s = String(text ?? "").trim();
  if (!s) return null;
  let marker = null;
  // Currency prefixes print in both spellings on the dwibahasa layout.
  s = s.replace(/^(?:rm|myr)\s*/i, "").trim();
  if (/^\(.*\)$/.test(s)) {
    marker = "-";
    s = s.slice(1, -1).trim();
  }
  const suffix = /(dr|cr)$/i.exec(s.replace(/\s+/g, ""));
  if (suffix) {
    marker = suffix[1].toUpperCase();
    s = s.replace(/\s*(dr|cr)$/i, "").trim();
  }
  if (/[+-]$/.test(s)) {
    if (marker === null) marker = s.slice(-1);
    s = s.slice(0, -1).trim();
  }
  if (/^[+-]/.test(s)) {
    if (marker === null) marker = s[0];
    s = s.slice(1).trim();
  }
  // The body must now be a plain grouped decimal. A stray letter, a second decimal point,
  // or a thousands group of the wrong width is a REFUSAL: OCR noise must not become a number.
  // The leading-dot form (`.00`, `.50`) is Maybank's printed zero-magnitude — normalize it
  // to `0.xx` rather than widening the main pattern.
  if (/^\.\d{1,2}$/.test(s)) s = `0${s}`;
  if (!/^\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return { cents, marker };
}

/** Apply the sign law to an absolute reading. Returns signed cents, or null when the
 *  direction is genuinely unknown (an unmarked single-column amount cannot be signed). */
export function applySign({ cents, marker }, columnSide = null) {
  if (!Number.isSafeInteger(cents)) return null;
  const m = marker === null ? null : String(marker).toUpperCase();
  if (m === "-" || m === "DR") return -cents;
  if (m === "+" || m === "CR") return cents;
  if (columnSide === "debit") return -cents;
  if (columnSide === "credit") return cents;
  return null;
}

/**
 * A printed statement date → ISO, or null. Handles the forms the corpus prints:
 * `DD/MM/YYYY` · `DD/MM/YY` · `DD-MM-YYYY` · `DD.MM.YYYY` · `DD MMM YYYY` · `DDMMMYY`
 * (`01APR25`) · and the YEARLESS `DD/MM` Maybank prints on every line [C].
 *
 * `period` ({start, end} ISO, both optional) supplies the year for a yearless date and
 * disambiguates a two-digit year. A yearless date is resolved to whichever of the period's
 * years actually contains that day-and-month; if BOTH do (an impossible period spanning
 * >12 months) or NEITHER does, it refuses — a December line on a January statement must be
 * a refusal, not a coin flip. Day-first is not an assumption: Malaysian bank statements
 * print DD/MM, and the DB re-checks every line date against the period bounds.
 */
export function parseStatementDate(text, period = {}) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const years = periodYears(period);

  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(s);
  if (m) {
    const yy = Number(m[3]);
    // Two-digit years on an accounting document are this century; 2000-2099.
    return isoDate(2000 + yy, Number(m[2]), Number(m[1]));
  }

  m = /^(\d{1,2})\s*([A-Za-z]{3,4})\s*(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (!month) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoDate(y, month, Number(m[1]));
  }

  m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const hits = years.map((y) => isoDate(y, month, day)).filter((iso) => iso && withinPeriod(iso, period));
    return hits.length === 1 ? hits[0] : null;
  }
  return null;
}

function periodYears(period) {
  const out = [];
  for (const key of ["start", "end"]) {
    const y = Number(String(period?.[key] ?? "").slice(0, 4));
    if (Number.isInteger(y) && y > 1900 && !out.includes(y)) out.push(y);
  }
  return out;
}

/** ISO date inside [start, end] inclusive; true when the period is not stated. */
export function withinPeriod(iso, period = {}) {
  if (!period?.start || !period?.end) return true;
  return iso >= period.start && iso <= period.end;
}

/**
 * Malaysian institution vocabulary. `code` is the token the ingest payload carries and the
 * DB binds against `clara.bank_institutions.code` (design §4.1 — a seeded reference grown
 * additively by migration). `patterns` are matched against the header's own printed text.
 * Account numbers are NOT unique across institutions [R1], which is why identity is the
 * PAIR (code, digits-only number) and never the number alone.
 */
export const INSTITUTIONS = Object.freeze([
  // NOTE: codes are the clara.bank_institutions SEED vocabulary -- the two lists MUST
  // agree (a code the DB does not seed refuses header_unreadable for that whole bank).
  { code: "MBB", name: "Malayan Banking Berhad", patterns: [/\bmaybank\b/i, /\bmalayan banking\b/i] },
  { code: "CIMB", name: "CIMB Bank Berhad", patterns: [/\bcimb\b/i] },
  { code: "PBB", name: "Public Bank Berhad", patterns: [/\bpublic bank\b/i] },
  { code: "RHB", name: "RHB Bank Berhad", patterns: [/\brhb\b/i] },
  { code: "HLB", name: "Hong Leong Bank Berhad", patterns: [/\bhong leong\b/i] },
  { code: "AMB", name: "AmBank (M) Berhad", patterns: [/\bambank\b/i, /\bam bank\b/i] },
  { code: "BIMB", name: "Bank Islam Malaysia Berhad", patterns: [/\bbank islam\b/i] },
  { code: "BMMB", name: "Bank Muamalat Malaysia Berhad", patterns: [/\bmuamalat\b/i] },
  { code: "BSN", name: "Bank Simpanan Nasional", patterns: [/\bbank simpanan\b/i, /\bbsn\b/i] },
  { code: "AGRO", name: "Bank Pertanian Malaysia Berhad (Agrobank)", patterns: [/\bagrobank\b/i] },
  { code: "AFFIN", name: "Affin Bank Berhad", patterns: [/\baffin\b/i] },
  { code: "ALB", name: "Alliance Bank Malaysia Berhad", patterns: [/\balliance bank\b/i] },
  { code: "OCBC", name: "OCBC Bank (Malaysia) Berhad", patterns: [/\bocbc\b/i] },
  { code: "HSBC", name: "HSBC Bank Malaysia Berhad", patterns: [/\bhsbc\b/i] },
  { code: "UOB", name: "United Overseas Bank (Malaysia) Bhd", patterns: [/\buob\b/i, /\bunited overseas\b/i] },
  { code: "SCB", name: "Standard Chartered Bank Malaysia Berhad", patterns: [/\bstandard chartered\b/i] },
  { code: "MBSB", name: "MBSB Bank Berhad", patterns: [/\bmbsb\b/i] },
]);

/** The single institution whose printed name appears in `text`, or null when zero or more
 *  than one match — an ambiguous letterhead must never bind an account. */
export function matchInstitution(text) {
  const s = String(text ?? "");
  const hits = INSTITUTIONS.filter((inst) => inst.patterns.some((re) => re.test(s)));
  return hits.length === 1 ? { code: hits[0].code, name: hits[0].name } : null;
}

/** ISO-4217 codes a Malaysian statement might print. Absence reads MYR (the 0023 posture,
 *  WC-R5) — this returns the EXPLICIT code only, and null when nothing was printed. */
const CURRENCY_RE = /\b(MYR|USD|SGD|EUR|GBP|AUD|JPY|CNY|HKD|THB|IDR|CAD|CHF|NZD|INR|VND|PHP|KRW|BND)\b/;

/** The explicitly printed currency, or null. `RM` is Malaysia's own symbol and reads MYR. */
export function detectCurrency(text) {
  const s = String(text ?? "");
  const m = CURRENCY_RE.exec(s.toUpperCase());
  if (m) return m[1];
  return /\bRM\s?\d/.test(s) ? "MYR" : null;
}

/**
 * The STATEMENT IDENTITY check (design §3), computed as a receipt rather than a boolean so
 * a refusal can name where it broke. Never mutates its inputs.
 *
 *   opening + Σ(amount_cents) = closing            — the closure
 *   running_n = running_{n-1} + amount_n           — every step, running_0 = opening
 *   running_last = closing                          — the last step meets the printed end
 *   Σ(amounts > 0) = total_credit                   — the printed cross-check (in)
 *   Σ|amounts < 0| = total_debit                    — the printed cross-check (out)
 *
 * The printed TOTAL DEBIT / TOTAL CREDIT pair is the one control that catches an ADJACENT
 * OMISSION the running balance cannot see (design §3): drop a line and every surviving
 * running balance still chains, but the totals no longer match.
 */
export function chainReceipt(header, lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const opening = header?.opening_cents;
  const closing = header?.closing_cents;
  const out = {
    closes: false,
    steps_ok: false,
    totals_ok: null,
    line_count: rows.length,
    first_break: null,
    sum_cents: 0,
    credit_cents: 0,
    debit_cents: 0,
  };
  if (!Number.isSafeInteger(opening) || !Number.isSafeInteger(closing)) {
    out.first_break = "endpoints_missing";
    return out;
  }
  let running = opening;
  let stepsOk = true;
  for (const [index, line] of rows.entries()) {
    const amount = line?.amount_cents;
    if (!Number.isSafeInteger(amount) || amount === 0) {
      out.first_break = out.first_break ?? `line_${index + 1}_amount`;
      stepsOk = false;
      break;
    }
    running += amount;
    out.sum_cents += amount;
    if (amount > 0) out.credit_cents += amount;
    else out.debit_cents += -amount;
    const printed = line?.running_balance_cents;
    if (Number.isSafeInteger(printed) && printed !== running) {
      out.first_break = out.first_break ?? `line_${index + 1}_running_balance`;
      stepsOk = false;
      break;
    }
  }
  out.steps_ok = stepsOk;
  out.closes = stepsOk && opening + out.sum_cents === closing;
  if (!out.closes && out.first_break === null) out.first_break = "closing_mismatch";
  const td = header?.total_debit_cents;
  const tc = header?.total_credit_cents;
  if (Number.isSafeInteger(td) && Number.isSafeInteger(tc)) {
    out.totals_ok = td === out.debit_cents && tc === out.credit_cents;
    if (!out.totals_ok && out.first_break === null) out.first_break = "printed_totals_mismatch";
  }
  return out;
}
