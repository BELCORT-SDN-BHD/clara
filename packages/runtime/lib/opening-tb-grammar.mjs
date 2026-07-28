// The TOKEN GRAMMAR for the `opening_tb.line` producer (Gate K document-tied · ADR-048).
//
// Split out of `opening-tb-cells.mjs` for the same reason `invoice-amount-grammar.mjs` was split
// out of the totals reader: these answer a different question. The reader decides WHICH row is a
// balance and WHICH column it sits in — a geometry problem, calibrated against page coordinates.
// This module decides WHAT ONE CELL SAYS — a byte problem, calibrated against migration 0017's
// evidence grammar and against the ways OCR mangles printed money. The two fail differently and
// are argued from different evidence, so they read better apart.
//
// Everything here is re-exported from `opening-tb-cells.mjs`, so callers and tests keep ONE
// import surface (the idiom `seeding-parse.mjs` already uses for its xlsx reader).

import { asciiTrim, centsOfRaw, isDash, isStrictAmount } from "./invoice-amount-grammar.mjs";
import { cellText } from "./table-cell-geometry.mjs";

/** Account-code shapes the opening grammar accepts (0017 `_derive_opening_region_fact`). */
export const ACCOUNT_RE = /^(?:[0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})$/;

/** The ONLY nonblank content an amount column may carry without stating a figure: a footnote
 *  marker, BARE. Explicit and tiny on purpose — see the ABSENCE rule in `readAmountCell`. */
const NOTE_MARKER_RE = /^[*†‡#]{1,3}$/;

/** Strip the currency word a package sometimes prints inside the amount cell. Applied ONLY
 *  after the cell has been classified as nonblank and non-marker — see `readAmountCell`. */
const stripCurrency = (s) => asciiTrim(String(s ?? "").replace(/^(?:RM|MYR)\s*/i, ""));

/** The cell's text, whitespace-collapsed and ASCII-trimmed, with EVERY character the document
 *  printed still present. Classification decisions are made against THIS, never a rewrite. */
export const normalizedCellText = (cell) => asciiTrim(cellText(cell));

/**
 * Read ONE amount cell. Returns a typed verdict rather than a number, because the four
 * outcomes are genuinely different things and collapsing them is how a nil becomes a zero
 * balance or a mangled token becomes an absence.
 *   { kind:'absent' }              — the cell is EMPTY or missing (the ordinary one-sided row)
 * · { kind:'nil' }                 — the document printed `-` or `0.00`: no balance, stated
 * · { kind:'amount', raw, cents }  — a strict, positive, comma-grouped figure (BigInt cents)
 * · { kind:'unparseable', raw }    — anything else NONBLANK: a parenthesised or negative
 *                                    figure, three decimals, an ungrouped run, OCR mangling
 *
 * ABSENCE MEANS EMPTY, AND NOTHING ELSE. This is the module's most important single rule, and
 * it is written in blood: the first version fell back to `absent` for any nonblank token that
 * did not LOOK amount-shaped, which sounds harmless and is not. `9OO.00` — a printed `900.00`
 * whose zeroes OCR'd as the letter O — is not amount-shaped, so a genuinely TWO-SIDED row read
 * as cleanly one-sided. Two such rows produced a perfectly balanced, perfectly canonical, and
 * completely wrong opening seed that the database accepted without complaint, because every
 * line it was shown was individually valid. The failure was invisible at every downstream
 * checkpoint. So: an amount column either printed nothing, or it printed something we can read
 * exactly, or we do not know what this row says — and not knowing is a refusal.
 *
 * ORDER IS PART OF THAT RULE, and the second review round proved it the hard way. The first fix
 * stripped the currency word BEFORE classifying, so the rewrite decided the verdict: a bare `RM`
 * became the empty string and read as ABSENT, and `RM #` became `#` and passed as the permitted
 * bare marker. Mirroring `RM #` against real figures rebuilt the very same balanced-and-wrong
 * document P1-4 was supposed to have closed. Emptiness and the marker exception are therefore
 * decided against the ORIGINAL token, with every character the document printed still present;
 * stripping happens only afterwards, to read a figure we have already agreed is a figure. A
 * currency token with nothing after it is STATED CONTENT we cannot read.
 */
export function readAmountCell(cell) {
  const original = normalizedCellText(cell);
  if (original === "") return { kind: "absent" }; // genuinely empty, or no cell at that column
  // The marker exception admits ONLY the bare glyph. `RM #` is a currency-prefixed form and
  // therefore content, not an absence — the ordering hole above, closed.
  if (NOTE_MARKER_RE.test(original)) return { kind: "absent" };
  // Likewise NIL: only a bare dash is the document's own "no balance". `RM -` states something
  // more than a dash, and a nil verdict on one side of a row lets the other side emit alone.
  if (isDash(original)) return { kind: "nil" };

  const raw = stripCurrency(original);
  // A currency word and nothing else. The cell was NOT empty; we simply cannot read it.
  if (raw === "") return { kind: "unparseable", raw: original };
  if (isStrictAmount(raw)) {
    const cents = centsOfRaw(raw);
    if (cents === null) return { kind: "unparseable", raw };
    if (cents === 0n) return { kind: "nil" };
    // A NEGATIVE cannot reach here (AMOUNT_STRICT has no sign) — asserted, not assumed.
    return cents > 0n ? { kind: "amount", raw, cents } : { kind: "unparseable", raw };
  }
  return { kind: "unparseable", raw };
}

/** The canonical `opening_tb.line` evidence text: `<code> <label> RM <amount> <DR|CR>`. */
export function canonicalTbLineText({ accountCode, label, raw, side }) {
  return `${accountCode} ${label} RM ${raw} ${side === "debit" ? "DR" : "CR"}`;
}
