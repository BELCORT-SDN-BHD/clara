// Money formatting for the registers tab — ported from apps/dashboard/app/shared/
// fmt.ts (its own header states the law this preserves): every cents figure a
// register renders is a DB-owned bigint value from an envelope or row; this module
// only divides by 100 for display — it never computes one. The safe-integer guard
// renders an explicit marker instead of a silently-wrong amount for a cents value
// that does not round-trip as a JS safe integer.

/** Rendered when a cents value is absent. */
export const CENTS_UNAVAILABLE = "—";
/** Rendered when a cents value is present but not a safe JS integer — never a
 *  silently-truncated amount. */
export const CENTS_UNSAFE = "(amount out of range — verify in the ledger)";

export function isSafeCents(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isSafeInteger(v);
}

/** Format integer cents as `RM 1,234.56`. */
export function fmtCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return CENTS_UNAVAILABLE;
  if (!isSafeCents(cents)) return CENTS_UNSAFE;
  const neg = cents < 0;
  const s = (Math.abs(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}RM ${s}`;
}

/** A short id chip label (first 8 chars) — matches the house `id.slice(0, 8)` idiom. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}
