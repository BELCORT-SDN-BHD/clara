// #660 (journey B2) — the client home's PERIOD, as pure Malaysian-calendar month arithmetic.
//
// THERE IS NO PERIOD SELECTOR ANYWHERE ELSE IN THIS APP. This module is the first, and it is
// deliberately scoped to the money band on ONE page rather than lifted into a global shell: a
// firm-wide period control is #612's shell work, and building it here would collide with two
// other lanes editing the same chrome this wave.
//
// PURE, AND WITH NO MONEY MATH IN IT. Every delta, cap and percentage a figure carries is computed
// in the door (0232), once, so the browser and a later report cannot disagree. What lives here is
// only the calendar: which months a reader may choose, what `?period=` means, and what a month's
// first and last day are. A cents value never passes through this file.
//
// THE ADDRESS IS THE ONLY SOURCE OF TRUTH FOR THE PERIOD. `?period=YYYY-MM` names a whole natural
// month; its ABSENCE means month-to-date. The selector `router.push`es a new address (push, not
// replace, so Back returns the reader to the period they came from) and the component keeps no
// period state of its own — which is what makes Back work at all.
//
// A MALFORMED `?period=` FALLS BACK TO MONTH-TO-DATE AND THE FACE SAYS SO. Silently correcting an
// address to a different month would let a reader screenshot one month under another month's
// label; `parsePeriodParam` therefore reports the fallback rather than hiding it.
//
// MALAYSIA HAS NO DST, but every "today" here is resolved through the ZONE NAME rather than a
// `+08` literal, for the reason the estate names everywhere else: a literal offset is a claim
// about the calendar that the calendar, not this file, owns.

export const CLIENT_PERIOD_TIMEZONE = "Asia/Kuala_Lumpur";

/** How many whole months the selector offers behind the current one. */
export const CLIENT_PERIOD_HISTORY_MONTHS = 13;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` split into a year and a ZERO-BASED month index. ONE parser, so no caller has to
 *  remember which of the two conventions `Date.UTC` wants — an off-by-one here would silently
 *  shift a whole trend by a month. */
function monthParts(month: string): { year: number; index: number } {
  const parts = month.split("-");
  return { year: Number(parts[0] ?? 0), index: Number(parts[1] ?? 1) - 1 };
}

/** Today's calendar date in `Asia/Kuala_Lumpur`, as `YYYY-MM-DD`. Uses `en-CA` because it is the
 *  one widely-available locale whose short date IS ISO order — never a hand-rolled offset. */
export function todayInMyt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLIENT_PERIOD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `YYYY-MM` of a `YYYY-MM-DD`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The first day of a `YYYY-MM`, as the door's `p_month` wants it. */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** How many days a `YYYY-MM` has. Day 0 of the NEXT month is the last day of this one, which is
 *  the one arithmetic that needs no leap-year table of its own. */
export function daysInMonth(month: string): number {
  const { year, index } = monthParts(month);
  // Day 0 of the NEXT month is the last day of this one — the one arithmetic that needs no
  // leap-year table of its own.
  return new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
}

/** The last day of a `YYYY-MM`, as `YYYY-MM-DD`. */
export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

/** `YYYY-MM` shifted by `delta` whole months. */
export function shiftMonth(month: string, delta: number): string {
  const { year, index } = monthParts(month);
  const d = new Date(Date.UTC(year, index + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * THE ELAPSED-INTERVAL CAP, as a pure date rule — the SAME rule the door applies to the numbers.
 * It is restated here only so a face can LABEL the comparison it is showing; nothing on this side
 * computes the amounts.
 *
 * A month-to-date run to the 31st compares against the prior month's LAST DAY when that month is
 * shorter: 2026-03-31 compares 2026-02-01..2026-02-28, never a date that does not exist.
 */
export function priorInterval(periodMonth: string, asOf: string): { start: string; end: string } {
  const prior = shiftMonth(periodMonth, -1);
  const elapsedDay = Number(asOf.slice(8, 10));
  const capped = Math.min(elapsedDay, daysInMonth(prior));
  return { start: monthStart(prior), end: `${prior}-${String(capped).padStart(2, "0")}` };
}

export type PeriodOption = {
  /** The `?period=` value, or null for month-to-date. */
  value: string | null;
  /** `YYYY-MM` this option is about — the current month for the MTD option. */
  month: string;
  /** True for the month-to-date option. */
  isMtd: boolean;
};

/**
 * The choice list: month-to-date first, then the current month's own whole self is NOT offered
 * twice — the list runs from the PREVIOUS month back through `CLIENT_PERIOD_HISTORY_MONTHS`.
 *
 * Offering "this month (whole)" beside "month to date" would be two labels for one interval on a
 * date that has not finished yet, and a reader choosing the first would get the second's numbers.
 */
export function periodOptions(today: string = todayInMyt()): PeriodOption[] {
  const current = monthOf(today);
  const out: PeriodOption[] = [{ value: null, month: current, isMtd: true }];
  for (let i = 1; i <= CLIENT_PERIOD_HISTORY_MONTHS; i++) {
    const m = shiftMonth(current, -i);
    out.push({ value: m, month: m, isMtd: false });
  }
  return out;
}

export type ParsedPeriod = {
  /** `YYYY-MM-01` for the door's `p_month`, or null for month-to-date. */
  month: string | null;
  /** The `?period=` value this resolved to, or null. */
  param: string | null;
  /** True when the address carried something this module could not read. The face SAYS so rather
   *  than silently rendering a different month under the label the reader chose. */
  malformed: boolean;
};

/**
 * `?period=` → the door's `p_month`. An absent parameter is month-to-date. Anything that is not a
 * well-formed `YYYY-MM`, or that names a month in the FUTURE, falls back to month-to-date and is
 * reported as malformed — the door would refuse a future as-of outright, and a selector that could
 * silently ask for one would turn a caller defect into a mystery.
 */
export function parsePeriodParam(raw: unknown, today: string = todayInMyt()): ParsedPeriod {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  if (value === "") return { month: null, param: null, malformed: false };
  if (!MONTH_RE.test(value)) return { month: null, param: null, malformed: true };
  if (value >= monthOf(today)) {
    // The current month is month-to-date by definition and a later one has no actuals at all;
    // both are the MTD read, and naming a future month is a malformed address.
    return { month: null, param: null, malformed: value > monthOf(today) };
  }
  return { month: monthStart(value), param: value, malformed: false };
}

/** The address the selector pushes. An MTD choice REMOVES the parameter rather than writing an
 *  empty one, so the canonical address for "now" has exactly one spelling. */
export function periodHref(pathname: string, search: string, value: string | null): string {
  const params = new URLSearchParams(search);
  if (value === null) params.delete("period");
  else params.set("period", value);
  const qs = params.toString();
  return qs === "" ? pathname : `${pathname}?${qs}`;
}
