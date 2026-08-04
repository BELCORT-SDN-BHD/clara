// THE BUSINESS DATE — the dashboard's ONE sanctioned answer to "what day is it?"
// PURE: no network, no React.
//
// THE INVARIANT
//   The DB's Asia/Kuala_Lumpur business date is the only clock this product
//   recognises. No surface may originate a date from the browser's own timezone
//   and hand it to the DB as an as-of, effective, posting or period date.
//
// WHY. The DB's authority is `clara._book_today()` —
// `(now() at time zone 'Asia/Kuala_Lumpur')::date`, the ONE body that answers "what
// day is it" for every money-dated column since 0042 S5.20 (round 6: three live
// writers had reached for `current_date` because the house fact had no house-shaped
// name — only a helper scoped to the FA lane). `clara._fa_today()` is that
// authority's FA-lane alias and delegates to it, so every dated read still filters
// against the same answer. `new Date().toISOString().slice(0, 10)` is
// the browser's **UTC** date. Malaysia is UTC+8, so between 00:00 and 08:00 MYT
// those two disagree by a day, every single day:
//   * on a READ (`p_as_of`), the register silently omits everything dated today and
//     the header totals understate to match — a confident wrong number;
//   * on a WRITE default (a disposal date, an in-service date, a revision
//     effective-from, a depreciation period), it is worse. At 00:30 MYT on 1
//     September the browser proposes 31 August, so the disposal month charged, the
//     period the run posts into, and the month a prospective revision starts are
//     all one month early — money in the wrong period, in a book whose whole
//     convention is month-grain (WDB-G14).
//
// THE FIX, IN ONE PLACE.
//   * `businessToday()` renders the browser's ABSOLUTE INSTANT in the DB's
//     timezone. The device's timezone becomes irrelevant; only its clock matters,
//     and every date default in every browser app trusts that.
//   * For a read whose RPC accepts a null as-of, prefer `null` and adopt the DB's
//     echoed `as_of`: the DB then owns the date outright. `businessToday()` is the
//     floor for the reads that REFUSE a null (staff_advance_tie raises CLR10 'an
//     as-of date is required') and for every human-editable date default.
//
// Round 3 fixed this law in advancesApi.getStaffAdvance and nowhere else; round 5
// found it re-introduced one file over, in the sibling surface. A law that lives in
// one call site is not a law. This module is the law.

/** The IANA zone the DB books in. `clara._fa_today()` is defined against it. */
export const CLARA_BUSINESS_TIMEZONE = "Asia/Kuala_Lumpur";

/** `YYYY-MM-DD` for an instant, rendered in the business timezone.
 *
 *  `en-CA` is the locale whose short date format IS ISO-8601, so this needs no
 *  manual part assembly. Falls back to the UTC slice only if `Intl` has no tz data
 *  at all (never true on the Node/browser targets this app ships to) — an honest
 *  degrade rather than a throw on a date the user can still correct by hand. */
export function businessDate(instant: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: CLARA_BUSINESS_TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** Today, in the business timezone. The ONLY sanctioned "today" in the dashboard. */
export function businessToday(): string {
  return businessDate(new Date());
}

/** The same calendar day one year earlier — the default statement window's start
 *  (/aging and /advances both open on `[yearBefore(asOf), asOf]`). Calendar
 *  arithmetic on the ISO string, never a Date round-trip through the browser's
 *  local zone. 29 Feb clamps to 28 Feb, the ordinary accounting convention. */
export function yearBefore(dateIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!m) return dateIso;
  const y = Number(m[1]) - 1;
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const day = mo === 2 && d === 29 && !leap ? 28 : d;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first day of `dateIso`'s month. */
export function firstOfMonth(dateIso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateIso);
  return m ? `${m[1]}-${m[2]}-01` : dateIso;
}
