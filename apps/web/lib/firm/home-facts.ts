// The Firm Home / Client Home board's PURE derivations.
//
// Nothing here reads, writes or renders. Everything here is arithmetic or ordering over rows a
// DB read already returned, extracted into one module so each rule has a test that does not
// need a React render pass — and so a reviewer can see, in one place, exactly which numbers on
// the two boards are computed by this build rather than owned by the database.
//
// THE LINE THIS FILE IS NOT ALLOWED TO CROSS (hard constraint 2). A derivation here may ORDER
// rows, BUCKET them by a date the DB supplied, or COUNT rows the DB returned in full. It may
// never compute an accounting figure, and it may never stand in for a `counts` field the
// envelope already ships: `clara.list_review_queue` computes its eight counts over the WHOLE
// population while `rows[]` is one page of it (lib/firm/use-review-queue.ts's own header), so
// `rows.length` is not the same number and must never be rendered as though it were. The
// client-status tally below is the ONE count computed here, and it is sanctioned explicitly by
// the map's own enumeration ("the DB ships no aggregate; group client-side") over
// `loadClientRegister`, which is UNPAGINATED — every row is present, so the count is total.

import { CLARA_BUSINESS_TIMEZONE } from "@/lib/business-date";
import type { ReviewQueueRow } from "./needs-you";
import type { ClientRow } from "./reads";

/**
 * Whole days between `iso` and `now`, or `null` when the instant is absent or unparseable.
 *
 * FLOORED, NEVER ROUNDED: a row that has waited 29 hours has waited "1 day", not "1.2" and not
 * "2". A future instant (a clock skew, a back-dated row) yields 0 rather than a negative count —
 * "waiting -1 days" is not a sentence about the books.
 *
 * This measures ELAPSED TIME, which is why it is not timezone-aware: the difference between two
 * instants is the same number of hours in every zone. `businessDate` exists for the other
 * question (which calendar day an instant falls on) and is used for the day headers below.
 */
export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const elapsed = now.getTime() - then;
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

/**
 * The `limit` rows that have waited LONGEST, oldest first.
 *
 * A row with no `aged_since` is not "infinitely old" and is not "brand new" — it is a row whose
 * age the DB did not report, so it sorts LAST and never displaces a row whose age is known. Ties
 * break on the queue's own stable row key so two reads of the same data produce the same list.
 */
export function oldestWaiting(rows: readonly ReviewQueueRow[], limit: number): ReviewQueueRow[] {
  return [...rows]
    .sort((a, b) => {
      const at = a.aged_since ? new Date(a.aged_since).getTime() : Number.NaN;
      const bt = b.aged_since ? new Date(b.aged_since).getTime() : Number.NaN;
      const aKnown = Number.isFinite(at);
      const bKnown = Number.isFinite(bt);
      if (aKnown && bKnown && at !== bt) return at - bt;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return `${a.row_kind}:${a.id}`.localeCompare(`${b.row_kind}:${b.id}`);
    })
    .slice(0, Math.max(limit, 0));
}

export type ClientStatusTally = {
  active: number;
  onboarding: number;
  archived: number;
  /** Every status outside the three the CHECK constraint admits today (0017_wave_b.sql:658-659).
   *  Counted rather than dropped: a fourth status the DB adds tomorrow must show up as a number
   *  the reader can see, not silently vanish from a line that claims to cover the register. */
  other: number;
  total: number;
};

/** Group `clara.clients` by status. The register read is UNPAGINATED
 *  (lib/firm/reads.ts's `loadClientRegister`), so these are totals, not page counts. */
export function clientStatusTally(rows: readonly ClientRow[]): ClientStatusTally {
  const tally: ClientStatusTally = { active: 0, onboarding: 0, archived: 0, other: 0, total: rows.length };
  for (const row of rows) {
    if (row.status === "active") tally.active += 1;
    else if (row.status === "onboarding") tally.onboarding += 1;
    else if (row.status === "archived") tally.archived += 1;
    else tally.other += 1;
  }
  return tally;
}

export type DayGroup<T> = {
  /** `YYYY-MM-DD` in the business timezone — the group's identity AND its React key. */
  day: string;
  items: T[];
};

/**
 * Bucket already-ordered items into calendar days, PRESERVING the order they arrived in.
 *
 * The day is computed in `Asia/Kuala_Lumpur` (lib/business-date.ts's own law), never in the
 * viewer's zone: between 00:00 and 08:00 MYT a UTC-derived day header would file this morning's
 * events under yesterday, which is exactly the "two machines, two days" hazard that module
 * exists to prevent. An item whose timestamp does not parse is dropped from the grouping rather
 * than filed under a guessed day — the caller sees a shorter list, never a wrong header.
 */
export function groupByBusinessDay<T>(items: readonly T[], at: (item: T) => string): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  let current: DayGroup<T> | null = null;
  for (const item of items) {
    const instant = new Date(at(item));
    if (!Number.isFinite(instant.getTime())) continue;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: CLARA_BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
    if (current === null || current.day !== day) {
      current = { day, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}
