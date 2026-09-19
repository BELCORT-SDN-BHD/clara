// #635 — the formatting this page is allowed to do, and the two it is not.
//
// IT NEVER CONVERTS A CURRENCY. `clara.llm_price_table.currency` is `'USD'` by CHECK (0110:497)
// with the FX non-goal written beside it (0110:494-496), and the firm's plan is denominated in
// MYR. A rate would have to come from somewhere, and there is nowhere in this estate it could
// honestly come from — so a provider price is rendered in the currency the door named, labelled
// as the provider's price rather than as the firm's money, and the two figures never appear in
// one column.
//
// IT NEVER RENDERS AN UNRULED PRICE. `formatPlanAmount` refuses when `amountsRuled` is false —
// it returns `null`, and the card renders the honest sentence instead. `RM 0.00` would be a
// number nobody decided, which is the same defect as inventing one (C-01 / C-56).
//
// INTEGER CENTS THROUGHOUT (house rule). No float ever holds money here: the division happens
// inside `Intl.NumberFormat` on a value derived by integer arithmetic.

export type PlanAmount = { readonly amountCents: number; readonly currency: string; readonly amountsRuled: boolean };

/** The plan's price, or `null` when the database has not been told what it is. `null` is the
 *  render condition, not an error. */
export function formatPlanAmount(plan: PlanAmount): string | null {
  if (!plan.amountsRuled) return null;
  return formatMoneyCents(plan.amountCents, plan.currency);
}

/** Cents in the currency the caller names, formatted for en-MY. Never called on a plan whose
 *  amount is unruled — `formatPlanAmount` is the gate for that. */
export function formatMoneyCents(cents: number, currency: string): string {
  // ONE SIGN, COMPOSED ONCE, AND THE MAGNITUDE FORMATTED WITHOUT IT. The first cut let
  // `Intl.NumberFormat` see a negative whole part AND prepended a "-" of its own when that whole
  // part was `-0`, so `formatMoneyCents(-50, "USD")` read "-USD -0.50" and `-19900` read
  // "MYR -199.00" — two different shapes for one idea, on a money surface. Neither is reachable
  // from today's data (spend is a coalesced sum over a non-negative price table; the beta plan is
  // 0), which is why `p635.format.money_negative_sub_unit` pins it rather than a comment.
  const sign = cents < 0 ? "-" : "";
  const whole = Math.abs(Math.trunc(cents / 100));
  const fraction = Math.abs(cents % 100);
  return `${sign}${currency} ${formatInteger(whole)}.${String(fraction).padStart(2, "0")}`;
}

/** Thousands separators, no locale surprises: a token count is a count, not money. */
export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value);
}

/** A timestamptz as a plain `Asia/Kuala_Lumpur` calendar day — the house calendar, used for
 *  every ACT this page reports (an acceptance, a payment). It is NOT used for the usage window,
 *  which is the door's own UTC month and says so (`usage-period.ts`). */
export function formatDay(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(at);
}

/** The same instant with its time, for a receipt line where "when exactly" is the point. */
export function formatInstant(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/** A UTC calendar day, spelled as the door spells it. Used only for the usage window, where the
 *  whole point is that the frame is UTC and not the house calendar. */
export function formatUtcDay(isoDate: string): string {
  const at = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(at);
}

/** `2026-09` → `September 2026`, in UTC for the same reason. */
export function formatUsageMonth(month: string): string {
  const at = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return month;
  return new Intl.DateTimeFormat("en-MY", { timeZone: "UTC", year: "numeric", month: "long" }).format(at);
}
