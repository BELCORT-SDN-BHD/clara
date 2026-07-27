// The BYTE-LEVEL money grammar for the X2 totals reader (extraction slice / ADR-047).
//
// Split out from `invoice-totals-reader.mjs` because it answers a different question. The
// reader decides WHICH line is the amount for WHICH label — a geometry problem. This module
// decides WHETHER a token may be handed to the database at all — a byte problem, and one
// whose only correct reference is `clara._normalize_invoice_cents` (0009:102-123). The two
// concerns fail in different ways and are calibrated against different evidence, so they read
// better apart.
//
// THE RULE THAT GOVERNS EVERYTHING HERE: this grammar must be NARROWER than the DB's, never
// wider. Narrower means we refuse a value the DB would have accepted — a lost field, and the
// document goes to a human. Wider means we hand the DB a value it normalizes to NULL, and
// 0022's present-but-malformed check (b) then forfeits the ENTIRE extraction, destroying the
// working `invoice.total` capture along with the new field. The asymmetry is total.

// ASCII whitespace ONLY — never JavaScript's `\s`, and this is a correctness requirement
// rather than tidiness. `_normalize_invoice_cents` strips `[,[:space:]]`, a POSIX class.
// U+FEFF is NOT POSIX space (Unicode itself removed it from White_Space), so `RM<U+FEFF>1.00`
// survives the DB's strip, fails its numeric regex, and normalizes to NULL. JavaScript's `\s`
// DOES match U+FEFF, so using it here would admit exactly the byte that forfeits everything.
// PostgreSQL's POSIX classes are locale-dependent and may strip MORE than ASCII; stripping
// only ASCII keeps this side conservative under every locale.
export const ASCII_SPACE = /[ \t\n\r\f\v]+/g;

// ASCII TRIM. `String.prototype.trim()` is Unicode-aware and strips U+FEFF and NBSP from the
// edges of a token; PostgreSQL's `btrim(text)` strips SPACES only, and the later
// `[,[:space:]]` pass never touches U+FEFF anywhere. So JS trim SILENTLY REPAIRS a token the
// DB will reject — which is the wider-than-the-DB direction, the one that forfeits the whole
// extraction. Every acceptance and comparison step below trims in ASCII only, so an edge
// U+FEFF survives to be refused here rather than at the write boundary.
const ASCII_TRIM = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;
export const asciiTrim = (s) => String(s ?? "").replace(ASCII_TRIM, "");

/** DB-ALIGNED BLANKNESS. `_normalize_invoice_cents` returns NULL ("not stated") only when
 *  `btrim(p_raw)` is empty — and one-argument `btrim` strips SPACES, not tabs. So a typed
 *  value of "\t" is BLANK to JavaScript but PRESENT-and-malformed to PostgreSQL: it survives
 *  btrim, normalizes to NULL cents, and trips 0022's present-but-malformed refusal. Callers
 *  deciding "is this typed value really absent" must ask this, never `trim()`. */
export const isDbBlank = (s) => /^ *$/.test(String(s ?? ""));

// A DASH standing alone is the document saying NIL — never zero. Kept as its own token class
// so a printed "-" can never normalize to 0.00 and satisfy an identity the face refuses.
/** Every dash glyph OCR produces for a printed minus / nil, as a character-class body so
 *  callers building their own patterns share ONE list instead of a partial copy. The ASCII
 *  hyphen is ESCAPED: this string gets interpolated into other classes, and an unescaped
 *  leading `-` silently becomes a RANGE operator wherever it lands mid-class — `[#-‐]`
 *  spans every character from `#` to U+2010, which swallows digits and letters whole. */
export const DASH_CHARS = "\\-‐‑‒–—―−";
const DASH_ONLY = new RegExp(`^[${DASH_CHARS}]{1,3}$`);

/** THE ACCEPT GRAMMAR — a strict subset of `_normalize_invoice_cents`, which also accepts
 *  bare integers, one decimal place and the accounting parenthesis form. Narrower on purpose:
 *  exactly two decimals with grouped thousands is the shape a Malaysian totals column prints,
 *  and requiring the grouping is what stops a 4-digit reference or a "2025.10"-style token
 *  from being read as money. */
export const AMOUNT_STRICT = /^(?:RM[ \t]*)?[0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}$/;

// Amount-SHAPED but outside the accept grammar (a negative, a parenthesised figure, a bare
// integer, three decimals, an OCR-mangled digit run, a Unicode-space-infected token). Never
// emitted — its only job is to make a refusal VISIBLE as `unparseable` instead of silently
// indistinguishable from "the document printed nothing here" (contract §2 X2: no silent caps).
//
// THIS ONE USES `\s` ON PURPOSE, and the asymmetry with the accept grammar above is the whole
// design. The accept grammar decides what may reach the DB, so it must be ASCII-strict: a
// U+FEFF that slips through forfeits the extraction. This regex decides only how a refusal is
// LABELLED, so it must be Unicode-TOLERANT: a token the DB would choke on is exactly the thing
// an operator most needs to see reported as `unparseable` rather than as an empty column.
const AMOUNT_SHAPED = /^(?:RM|MYR)?[\s(]*[-‐-―−]?\s*[0-9][0-9,.\s]*\)?$/i;

/** Is this a bare dash — the document's own "nil"? */
export const isDash = (s) => DASH_ONLY.test(asciiTrim(s));

/** Does this token pass the accept grammar? */
export const isStrictAmount = (s) => AMOUNT_STRICT.test(asciiTrim(s));

/** Amount-shaped but refused by the accept grammar (drives the `unparseable` counter). */
export function looksLikeAmountAttempt(s) {
  const t = String(s ?? "").trim(); // Unicode-aware ON PURPOSE — diagnostics, see above
  if (!t || t.length > 24 || !/[0-9]/.test(t)) return false;
  return AMOUNT_SHAPED.test(t);
}

/**
 * Cents for a token, byte-aligned to `_normalize_invoice_cents`: strip `MYR`/`RM`, then commas
 * and ASCII whitespace only. Returns a BigInt, or null for anything the DB would also refuse.
 *
 * BIGINT, LEXICALLY — no float touches this path. `Number`/`Math.round` collapse distinct cent
 * values once the figure passes 2^53: 90,071,992,547,409.90 and ...91 both round to
 * 9007199254740991, so two readings that differ by a sen compare EQUAL and a disagreement is
 * recorded as agreement. Both values fit PostgreSQL's `bigint` perfectly well, so the DB would
 * have distinguished them — the imprecision was ours alone, and "agree to the sen" cannot be
 * built on a type that stops counting sens. The digits are therefore assembled directly:
 * integer part times 100, plus the two-decimal remainder, in BigInt throughout.
 *
 * Used for two things and never for a third: comparing two readings of one field (the DB
 * collapses duplicates on normalized cents, not on text, so agreement must be measured the
 * same way), and as the reader's EMIT GATE. It never produces a figure that reaches the
 * ledger — `value_raw` is always the verbatim OCR token.
 */
export function centsOfRaw(raw) {
  const t = asciiTrim(raw).toUpperCase().replace(/MYR|RM/g, "").replace(/,/g, "").replace(ASCII_SPACE, "");
  if (!t) return null;
  let negative = false;
  let v = t;
  if (/^\([0-9]+(?:\.[0-9]{1,2})?\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  const m = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(v);
  if (!m) return null;
  const [, sign, whole, frac = ""] = m;
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  return negative || sign === "-" ? -cents : cents;
}
