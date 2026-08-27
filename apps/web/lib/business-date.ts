// The business date/time law for apps/web — ported from apps/dashboard's
// shared/businessDate.ts (its own header names the bug this exists to prevent: the
// browser's `Date.toISOString()` is UTC, and Malaysia is UTC+8, so between 00:00 and
// 08:00 MYT a plain UTC date silently omits everything dated "today" — a wrong
// posting-date default in compose, a wrong `as_of` on an aging/fixed-asset/staff-
// advance register). `clara._book_today()` in the DB is the ONE authority for "what
// day is it"; this renders the browser's instant in the SAME timezone so the two
// never disagree, without needing a round-trip to ask the DB.
//
// P3 FOLD: the journals and firm lanes each ported this independently (their two
// branches had not merged); this file is the ONE canonical copy after the fold —
// "a law that lives in one call site is not a law. This module is the law."

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

/** N11 (independent review, 2026-08-27): a PROVENANCE timestamp (who recorded
 *  what, when — an agent receipt, a client fact, a client's created_at) rendered
 *  via the viewer's browser locale/timezone is the "two machines, two days"
 *  audit-trail hazard — a reviewer in a DIFFERENT timezone than the firm's own
 *  business day sees a date that can disagree with the DB's own idea of when the
 *  act happened, exactly the class of bug `businessDate` above exists to
 *  prevent for a query argument. This renders the SAME instant explicitly in
 *  the business timezone, date AND time, so every viewer of an audit trail
 *  reads the identical wall-clock moment regardless of where they are. */
export function businessDateTime(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  try {
    return new Intl.DateTimeFormat("en-MY", {
      timeZone: CLARA_BUSINESS_TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
