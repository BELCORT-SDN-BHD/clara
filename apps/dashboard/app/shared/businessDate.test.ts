// businessDate.ts — the one-clock law. Pure, no DB, no DOM.
//
// EVERY CELL HERE FAILS ON THE OLD CODE. The old spelling was
// `new Date().toISOString().slice(0, 10)`, in four files, seven places.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { businessDate, businessToday, yearBefore, firstOfMonth, CLARA_BUSINESS_TIMEZONE } from "./businessDate";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

// THE CLASS-KILL, not the instance-fix. Round 3 corrected this law in ONE call
// site; round 5 found it re-introduced one file over. Four files and seven date
// origins were wrong when this gate was written. A law that lives in a comment is
// re-broken by the next lane; this one fails the build.
test("no dashboard file originates a date from the browser's UTC clock", () => {
  const forbidden = /new\s+Date\s*\([^)]*\)\s*\.toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/;
  const offenders: string[] = [];
  for (const file of walkTs(APP_DIR)) {
    const rel = relative(APP_DIR, file).split("\\").join("/");
    if (rel === "shared/businessDate.ts") continue; // the one sanctioned implementation
    const src = readFileSync(file, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue; // prose
      if (forbidden.test(line)) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    "these files take the BROWSER's UTC date. Malaysia is UTC+8, so for eight hours every day it is\n" +
    "the wrong day: a read omits everything dated today, and a WRITE default posts money into the\n" +
    "wrong month. Import `businessToday()` from shared/businessDate.ts, or hand the date to the DB:\n" +
    `  ${offenders.join("\n  ")}`,
  );
});

test("the business timezone is the one clara._fa_today() books in", () => {
  assert.equal(CLARA_BUSINESS_TIMEZONE, "Asia/Kuala_Lumpur");
});

test("[the defect] an instant inside the 00:00–08:00 MYT window is TOMORROW in UTC terms", () => {
  // 2026-08-03 01:30 MYT === 2026-08-02 17:30Z. The browser's UTC slice says
  // 2026-08-02 — the day BEFORE the DB's business date. `staff_advance_summary`
  // filters `issue_date <= as_of`, so an advance issued today vanished, and the
  // header's outstanding total understated to match.
  const instant = new Date("2026-08-02T17:30:00Z");
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-02", "this is what the old code sent");
  assert.equal(businessDate(instant), "2026-08-03", "this is the day the DB is actually on");
});

test("[the worse defect] a month boundary moves a WRITE date into the wrong period", () => {
  // 2026-09-01 00:30 MYT === 2026-08-31 16:30Z. The old default proposed 31 August
  // as a disposal date / in-service date / revision effective-from. The disposal
  // month is charged, so that is a depreciation charge in the wrong month — and a
  // revision effective 31 Aug vs 1 Sep hands a whole month to a different lineage
  // row under the pinned month-grain convention (WDB-G14).
  const instant = new Date("2026-08-31T16:30:00Z");
  assert.equal(instant.toISOString().slice(0, 10), "2026-08-31");
  assert.equal(businessDate(instant), "2026-09-01");
  assert.equal(firstOfMonth(businessDate(instant)), "2026-09-01");
  assert.equal(firstOfMonth(instant.toISOString().slice(0, 10)), "2026-08-01", "the old code's run period was a month early");
});

test("an afternoon-MYT instant agrees with UTC — the fix changes only the window that was wrong", () => {
  assert.equal(businessDate(new Date("2026-08-03T06:00:00Z")), "2026-08-03"); // 14:00 MYT
});

test("businessToday returns a well-formed ISO date", () => {
  assert.match(businessToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("yearBefore is calendar arithmetic on the string, never a Date round-trip", () => {
  assert.equal(yearBefore("2026-08-03"), "2025-08-03");
  assert.equal(yearBefore("2024-02-29"), "2023-02-28", "29 Feb clamps to 28 Feb in a non-leap year");
  assert.equal(yearBefore("2025-02-28"), "2024-02-28");
  assert.equal(yearBefore("not-a-date"), "not-a-date", "a malformed input is returned unchanged, never NaN");
});

test("firstOfMonth is exact and degrades on garbage", () => {
  assert.equal(firstOfMonth("2026-08-31"), "2026-08-01");
  assert.equal(firstOfMonth("2026-08"), "2026-08");
});

// WHAT THIS FIX DOES NOT THINK OF, stated rather than discovered:
//   * A WRONG DEVICE CLOCK. Rendering the instant in Asia/Kuala_Lumpur removes the
//     browser's TIMEZONE from the answer; it still trusts the machine's clock. The
//     only complete cure is asking the DB, which is why /advances sends a null
//     as-of to `staff_advance_summary` and adopts the echoed `as_of` — but
//     `staff_advance_tie`, `ar_aging`/`ap_aging` and every WRITE date REFUSE a
//     null, so this floor is what they get.
//   * A user working from another timezone still sees Malaysian business dates.
//     That is intended: the books are Malaysian.
test("the residual exposure is the device clock, not the timezone — documented, not silently assumed", () => {
  const wrongClock = new Date("1999-01-01T00:00:00Z");
  assert.equal(businessDate(wrongClock), "1999-01-01", "a wrong clock still yields a wrong date; only the DB can cure that");
});
