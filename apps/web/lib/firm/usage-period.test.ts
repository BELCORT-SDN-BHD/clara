// #635 — the usage month as URL state, and the UTC frame it is honest about.

import test from "node:test";
import assert from "node:assert/strict";

import {
  currentUsageMonth,
  isUsageMonth,
  recentUsageMonths,
  resolveUsagePeriod,
  usagePeriodHref,
} from "./usage-period";

const AT = new Date("2026-09-19T04:30:00.000Z");

test("p635.period.round_trip a valid month survives the URL untouched and carries the door's own window", () => {
  const p = resolveUsagePeriod("2026-07", AT);
  assert.equal(p.month, "2026-07");
  assert.equal(p.doorDate, "2026-07-01", "the door is called with the first day; it bins the month itself");
  assert.equal(p.fromDate, "2026-07-01");
  assert.equal(p.toDate, "2026-07-31", "derived the way clara.get_llm_usage_summary derives it (0110:711-712)");
  assert.equal(p.fellBack, false);
  assert.equal(usagePeriodHref("2026-07"), "/settings/firm?period=2026-07");
});

test("p635.period.leap_and_short_months the last day is computed, never assumed", () => {
  assert.equal(resolveUsagePeriod("2024-02", AT).toDate, "2024-02-29");
  assert.equal(resolveUsagePeriod("2026-02", AT).toDate, "2026-02-28");
  assert.equal(resolveUsagePeriod("2026-04", AT).toDate, "2026-04-30");
  assert.equal(resolveUsagePeriod("2026-12", AT).toDate, "2026-12-31");
});

test("p635.period.bad_value falls back to the current month and SAYS it fell back — never an error", () => {
  for (const bad of ["2026-13", "26-09", "september", "2026-9", "2026-00", "2026-09-01"]) {
    const p = resolveUsagePeriod(bad, AT);
    assert.equal(p.month, "2026-09", `${bad} falls back`);
    assert.equal(p.fellBack, true, `${bad} must be VISIBLY a fallback, so the reader is not shown the wrong month silently`);
  }
});

test("p635.period.absent is not a fallback — no note is shown when nothing was asked for", () => {
  assert.equal(resolveUsagePeriod(null, AT).fellBack, false);
  assert.equal(resolveUsagePeriod(undefined, AT).fellBack, false);
  assert.equal(resolveUsagePeriod("", AT).fellBack, false);
  assert.equal(resolveUsagePeriod(null, AT).month, "2026-09");
});

test("p635.period.utc_frame the current month is the DOOR's UTC month, not the browser's local one", () => {
  // 00:30 on 1 September in Asia/Kuala_Lumpur is 16:30 on 31 August UTC. The door filters rows
  // by `(created_at at time zone 'utc')::date` (0110:750), so the month it will actually answer
  // for is AUGUST — and the page must open on the month the door answers, with the window line
  // saying which days that covers.
  const midnightMyt = new Date("2026-08-31T16:30:00.000Z");
  assert.equal(currentUsageMonth(midnightMyt), "2026-08",
    "a surface that quietly re-binned to the house calendar would publish a different number under the door's name");
  assert.equal(currentUsageMonth(new Date("2026-09-01T00:00:00.000Z")), "2026-09");
});

test("p635.period.recent_months twelve months, newest first, crossing a year boundary", () => {
  const months = recentUsageMonths(new Date("2026-02-15T00:00:00.000Z"), 4);
  assert.deepEqual(months, ["2026-02", "2026-01", "2025-12", "2025-11"]);
  assert.equal(recentUsageMonths(AT).length, 12);
  assert.equal(recentUsageMonths(AT)[0], "2026-09");
});

test("p635.period.shape_guard isUsageMonth accepts YYYY-MM and nothing else", () => {
  assert.equal(isUsageMonth("2026-01"), true);
  assert.equal(isUsageMonth("2026-12"), true);
  assert.equal(isUsageMonth("2026-13"), false);
  assert.equal(isUsageMonth("2026-00"), false);
  assert.equal(isUsageMonth(202609), false);
  assert.equal(isUsageMonth(null), false);
});
