// Money formatting for the Wave-A cards (contract §9). Every figure a card renders
// is a DB-owned bigint-cents value from an envelope — the UI NEVER computes one. The
// safe-integer guard is the dashboard-side assertion the WA hard gate demands: a
// cents value that does not round-trip as a JS safe integer (a bigint that overflowed
// Number, or a non-numeric) renders an explicit marker instead of a silently-wrong
// amount. RM (Malaysian ringgit); the DB owns rounding, so we only divide by 100 for
// the two-decimal display of an already-integral cents value.

/** The marker rendered when a cents value is absent or not a safe integer. */
export const CENTS_UNAVAILABLE = "—";
/** The marker rendered when a cents value is present but NOT a JS safe integer
 *  (would display wrong) — never a silently-truncated amount. */
export const CENTS_UNSAFE = "(amount out of range — verify in the ledger)";

/** True when `v` is a whole number that survives JS Number precision exactly. */
export function isSafeCents(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isSafeInteger(v);
}

/** Format integer cents as `RM 1,234.56`. `null`/`undefined` → `—`; a present but
 *  unsafe value → the loud unsafe marker (never a wrong number). */
export function fmtCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return CENTS_UNAVAILABLE;
  if (!isSafeCents(cents)) return CENTS_UNSAFE;
  const neg = cents < 0;
  const s = (Math.abs(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}RM ${s}`;
}

/** A signed delta in cents, e.g. `+RM 12.00` / `-RM 3.40` / `RM 0.00`. Same safety. */
export function fmtDeltaCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return CENTS_UNAVAILABLE;
  if (!isSafeCents(cents)) return CENTS_UNSAFE;
  if (cents === 0) return "RM 0.00";
  const sign = cents > 0 ? "+" : "-";
  const s = (Math.abs(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}RM ${s}`;
}

/** A short id chip label (first 8 chars) — matches the house `id.slice(0, 8)` idiom. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}
