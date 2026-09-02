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

/** Compatibility exports for register callers that predate P6-4. The
 * implementation lives exactly once in `lib/bank/money.ts`; this module keeps
 * the stable register import path without preserving a second parser body. */
export { parseAmountToCents, parseMoneyInput } from "@/lib/bank/money";
export type {
  MoneyInputRefusal,
  MoneyInputRefusalCode,
  MoneyParseResult,
} from "@/lib/bank/money";
