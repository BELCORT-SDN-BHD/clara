// Wave-A2.1 rig — SST-watch month anchors (rot guard).
//
// evaluate_sst_watch derives "today" from the REAL Asia/Kuala_Lumpur wall
// clock — `now() at time zone 'Asia/Kuala_Lumpur'`, executable and
// session-timezone-independent (0016_a21_compliance_watch.sql line ~477;
// proven immune to session tz by the "R3-10 (R2#5 tz)" cell in
// a21-adversarial.test.mjs). A fixture that hardcodes a calendar-literal date
// ("2026-06-15") as "the completed month" or "2026-07-31" as "the statutory
// due date" silently rots the instant real MYT wall-clock time crosses past
// it — exactly what broke the ADV-7..10 / R3-3 / §2* boundary-state cells
// across the a21-* battery at the 2026-07-31 24:00 MYT rollover (CI red at
// 2026-08-01 00:10 MYT, ~35 minutes after a same-SHA sibling ran green).
//
// Every SST-watch fixture anchors instead to the DB's OWN Asia/Kuala_Lumpur
// clock, queried once per test-file process and cached — never a fixed
// calendar string. This mirrors the idiom migration 0016's own embedded
// self-test already uses internally (v_cm/v_m derived from
// `now() at time zone 'Asia/Kuala_Lumpur'` at probe time, never a literal).

import { rootQuery } from "./wave-a-fixtures.mjs";

let _mytCurMonth = null;

/** {y, m} — the CURRENT (in-progress) MYT month, exactly as the evaluator's
 *  v_cur_month reads it right now. Queried once per process and cached — a
 *  suite run never straddles a month boundary mid-file in practice, and every
 *  fixture in a file shares one anchor by construction either way. */
async function mytCurMonth() {
  if (_mytCurMonth) return _mytCurMonth;
  const r = await rootQuery(
    "select extract(year from d)::int as y, extract(month from d)::int as m " +
      "from (select (now() at time zone 'Asia/Kuala_Lumpur')::date as d) s",
  );
  _mytCurMonth = { y: r.rows[0].y, m: r.rows[0].m };
  return _mytCurMonth;
}

/** {y, m} shifted by n months (n may be negative). Pure integer month
 *  arithmetic — never a Date object — so no local/session-timezone can leak in. */
function shiftMonth({ y, m }, n) {
  const total = y * 12 + (m - 1) + n;
  const y2 = Math.floor(total / 12);
  return { y: y2, m: total - y2 * 12 + 1 };
}

const pad2 = (n) => String(n).padStart(2, "0");

/** Days in calendar month `m` (1-12) of year `y`. Date.UTC is pure calendar
 *  arithmetic (never local/session tz) — day 0 of month `m` (0-indexed as
 *  `m`, i.e. calendar month m+1) is the last day of calendar month `m`. */
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' for day `day` of the month `n` months relative to the CURRENT
 *  (in-progress) MYT month: n=0 is the month in progress, n=-1 is the last
 *  COMPLETED month (the evaluator's statutory horizon, v_stat_month), n=-2 two
 *  months back, etc. `day` clamps to the target month's actual length. */
export async function mytMonthDate(n, day = 15) {
  const { y, m } = shiftMonth(await mytCurMonth(), n);
  return `${y}-${pad2(m)}-${pad2(Math.min(day, daysInMonth(y, m)))}`;
}

/** 'YYYY-MM-01' — the first day of month `n` (relative to the current MYT
 *  month). Matches the evaluator's `date_trunc('month', …)` anchors. */
export async function mytMonthStart(n) {
  return mytMonthDate(n, 1);
}

/** 'YYYY-MM-DD' — the LAST day of month `n` (relative to the current MYT
 *  month). */
export async function mytLastDayOfMonth(n) {
  const { y, m } = shiftMonth(await mytCurMonth(), n);
  return `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
}

/** The statutory application_due for a crossing whose month is `n` (relative
 *  to the current MYT month): the last day of the month FOLLOWING the crossing
 *  month (s.13(1)) — mirrors 0016's own
 *  `(v_earliest+interval '2 months')::date - 1`. */
export async function mytApplicationDue(n) {
  return mytLastDayOfMonth(n + 1);
}
