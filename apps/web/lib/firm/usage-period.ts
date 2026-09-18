// #635 — the usage card's month, as a URL search param and as a door argument.
//
// THE URL IS THE STATE. `/settings/firm?period=YYYY-MM` is a stable address: Back restores the
// previous month rather than closing the page, and a link to a particular month opens on that
// month. A bad value is NOT an error — it falls back to the current month with a visible note,
// because a mistyped query string is the reader's, and a settings page that 500s on one is
// punishing them for it.
//
// THE WINDOW IS THE DOOR'S, AND IT IS UTC-DERIVED. `clara.get_llm_usage_summary` bins the period
// with `date_trunc('month', p_period)` and then filters rows by
// `(created_at at time zone 'utc')::date between v_from and v_to` (0110:711-712, :750). So the
// month a screen labels is a UTC month, NOT an `Asia/Kuala_Lumpur` calendar month — and the
// difference is real: a call made at 07:30 MYT on the 1st belongs to the PREVIOUS UTC day, and
// on the 1st of a month to the previous month's figures. The card says so in as many words
// rather than letting a reader assume the house calendar applies. Nothing here shifts a
// timestamp to hide that; a surface that quietly re-binned the door's own answer would be
// publishing a different number under the door's name.

/** `YYYY-MM`, and nothing else. */
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type UsagePeriod = {
  /** The canonical `YYYY-MM` the URL carries. */
  readonly month: string;
  /** The `YYYY-MM-01` date the door is called with. */
  readonly doorDate: string;
  /** The door's own UTC window, first and last day inclusive — derived the way the door derives
   *  it, so the label and the query cannot disagree. */
  readonly fromDate: string;
  readonly toDate: string;
  /** True when the requested value was unreadable and this is the current month instead. */
  readonly fellBack: boolean;
};

export function isUsageMonth(value: unknown): value is string {
  return typeof value === "string" && PERIOD_RE.test(value);
}

/** The current month in UTC — the door's own frame, not the browser's. A person in
 *  `Asia/Kuala_Lumpur` opening the page at 00:30 on the 1st is shown the UTC month the door will
 *  actually answer for, which is the previous one; the window line says which days that covers. */
export function currentUsageMonth(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function lastDayOfMonth(month: string): string {
  const parts = month.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  // Day 0 of the NEXT month is the last day of this one, computed in UTC.
  const d = new Date(Date.UTC(y, m, 0));
  return `${month}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Decode whatever the URL carried. Never throws; never returns an invalid month. */
export function resolveUsagePeriod(raw: string | null | undefined, now: Date = new Date()): UsagePeriod {
  const fallback = currentUsageMonth(now);
  const valid = isUsageMonth(raw);
  const month = valid ? (raw as string) : fallback;
  return {
    month,
    doorDate: `${month}-01`,
    fromDate: `${month}-01`,
    toDate: lastDayOfMonth(month),
    fellBack: !valid && raw != null && raw !== "",
  };
}

/** The months a selector offers: this UTC month and the eleven before it, newest first. A fixed
 *  window rather than a "since the firm joined" range, because the door answers any month and a
 *  list derived from a second read would be a second idea of what exists. */
export function recentUsageMonths(now: Date = new Date(), count = 12): string[] {
  const months: string[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(year, month - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** The href for a month, preserving nothing else: `/settings/firm` carries exactly one search
 *  param today, and inventing a merge for params that do not exist would be speculative. */
export function usagePeriodHref(month: string): string {
  return `/settings/firm?period=${month}`;
}
