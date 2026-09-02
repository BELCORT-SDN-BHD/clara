// Money formatting for the registers tab — ported from apps/dashboard/app/shared/
// fmt.ts (its own header states the law this preserves): every cents figure a
// register renders is a DB-owned bigint value from an envelope or row; this module
// only divides by 100 for display — it never computes one. The safe-integer guard
// renders an explicit marker instead of a silently-wrong amount for a cents value
// that does not round-trip as a JS safe integer.
//
// N9 (independent review, 2026-08-27): the unsafe-amount marker is PROSE a human
// reads ("verify in the ledger") — routed through i18n at the CALL SITE rather
// than hardcoded here, since this module has no translation context of its own.
// `unsafeLabel` defaults to the original English so a caller that has not yet
// been updated still compiles and renders (never a hard break), but every call
// site in this build passes `t("centsUnsafe")` (the "Common" namespace).
// `CENTS_UNAVAILABLE` ("—") is left as a bare glyph, not prose — the same
// placeholder every ClaraBook surface already uses for "no value" regardless of
// locale (see e.g. ClientsRegister.factAbsent).

/** Rendered when a cents value is absent. */
export const CENTS_UNAVAILABLE = "—";
/** The English default for `unsafeLabel` — kept as a named export for any
 *  caller that has a genuine reason not to pass a translated one (none in this
 *  build; every register component threads `Common.centsUnsafe` through). */
export const CENTS_UNSAFE = "(amount out of range — verify in the ledger)";

export function isSafeCents(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isSafeInteger(v);
}

/** Format integer cents as `RM 1,234.56`. `unsafeLabel` is the i18n'd marker a
 *  caller passes for the "present but not a safe JS integer" case. */
export function fmtCents(cents: number | null | undefined, unsafeLabel: string = CENTS_UNSAFE): string {
  if (cents === null || cents === undefined) return CENTS_UNAVAILABLE;
  if (!isSafeCents(cents)) return unsafeLabel;
  const neg = cents < 0;
  const s = (Math.abs(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}RM ${s}`;
}

/** A short id chip label (first 8 chars) — matches the house `id.slice(0, 8)` idiom. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

/** T3 (port wave): a human-typed decimal amount -> integer cents, for the
 *  fixed-asset write surface's own money fields (disposal proceeds). String-
 *  based (BigInt), never `Math.round(x * 100)` — the same reasoning as
 *  lib/bank/money.ts's own `parseAmountToCents`, ported rather than cross-
 *  imported so components/registers stays independently reviewable (the same
 *  "one door dialog per domain" reasoning DoorDialog.tsx's header states, now
 *  applied to this domain's money parser). `null` for anything that is not a
 *  valid decimal amount — the caller must treat `null` as "not a number yet",
 *  never coerce it to 0.
 *
 *  COMMA HARDENING (sibling census off PR #489/FINDING 1, raised by
 *  pr489-codex-leg's law-28 leg): the body used to blanket-strip every
 *  comma (`input.replace(/,/g, "")`) BEFORE validating, so a European-style
 *  decimal-comma amount ("1234,56", meant as RM1,234.56 — a live, day-one
 *  fixed-asset proceeds/cost-portion input) silently parsed as
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
