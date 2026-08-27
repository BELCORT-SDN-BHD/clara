// The business date for a posting-date default — ported from apps/dashboard's
// shared/businessDate.ts (its own header names the bug this exists to prevent: the
// browser's `Date.toISOString()` is UTC, and Malaysia is UTC+8, so between 00:00 and
// 08:00 MYT a plain UTC date silently omits everything dated "today" from an aging/
// fixed-asset/staff-advance register). `clara._book_today()` in the DB is the ONE
// authority for "what day is it"; this renders the browser's instant in the SAME
// timezone so the two never disagree, without needing a round-trip to ask the DB.
//
// FIX-4 (independent review, web/p3-journals): SAME path body as
// apps/web/lib/registers/business-date.ts (the web/p3-firm lane's own port, for the
// identical reason) — deliberately duplicated at THIS path rather than imported
// cross-lane (the two branches have not merged yet), so the eventual fold trivially
// recognizes these as the same file and dedupes to one canonical location instead of
// two divergent copies.

/** The IANA zone the DB books in. */
export const CLARA_BUSINESS_TIMEZONE = "Asia/Kuala_Lumpur";

/** `YYYY-MM-DD` for an instant, rendered in the business timezone. `en-CA`'s short
 *  date format IS ISO-8601, so no manual part assembly is needed. */
export function businessDate(instant: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: CLARA_BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** Today, in the business timezone. */
export function businessToday(): string {
  return businessDate(new Date());
}
