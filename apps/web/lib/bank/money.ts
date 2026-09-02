// Money display + input parsing for the /bank workbench. PURE, zero network.
// The DB owns every cents value (AGENTS.md hard constraint 2) — this module
// never computes a financial figure, it only converts between the cents
// integer the DB speaks and the decimal string a human types/reads. String-
// based parsing throughout (never `Math.round(x * 100)`) so a value like
// "0.1" can never drift off its exact cents through binary-float
// multiplication.

/** "-500.00" / "500" / "  1,234.5 " -> -50000 / 50000 / 123450 (cents).
 *  `null` for anything that is not a valid decimal amount (a blank field,
 *  stray text, more than 2 decimal places) — the caller must treat `null`
 *  as "not a number yet", never coerce it to 0.
 *
 *  COMMA HARDENING (sibling census off PR #489/FINDING 1, raised by
 *  pr489-codex-leg's law-28 leg): the body used to blanket-strip every
 *  comma (`input.replace(/,/g, "")`) BEFORE validating, so a European-style
 *  decimal-comma amount ("1234,56", meant as RM1,234.56 — a live,
 *  day-one user input on this bank workbench) silently parsed as
 *  RM123,456.00, a 100x error with no rejection and no echo of the
 *  interpreted amount. A comma is now accepted ONLY as a thousands
 *  separator in a strictly valid position — groups of exactly three
 *  digits, never the decimal mark; any other placement returns `null`. A
 *  strictly-grouped amount ("1,234.56") still parses exactly as before. */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const m = /^(-?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!m) return null;
  const [, sign = "", wholeRaw = "0", frac = ""] = m;
  const whole = wholeRaw.replace(/,/g, "");
  const fracPadded = (frac + "00").slice(0, 2);
  const cents = BigInt(whole) * 100n + BigInt(fracPadded);
  const signed = sign === "-" ? -cents : cents;
  return Number(signed);
}

/** cents -> "1,234.50" / "-500.00" — grouping for readability, always 2
 *  decimals, the sign carried on the whole string. `null`/non-finite input
 *  renders as an explicit placeholder, never a fabricated "0.00". */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${grouped}.${frac}`;
}

/** "RM 1,234.50" / "-RM 500.00" — the one currency this beta renders
 *  (0023 posture: absence reads MYR). */
export function formatMyr(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  const negative = cents < 0;
  return `${negative ? "-" : ""}RM ${formatCents(Math.abs(cents))}`;
}
