// #660 — the client home's period arithmetic, which is the whole of the period selector's logic.
//
// THE CELL THAT MATTERS MOST is the elapsed-interval cap. A month-to-date run on the 31st has no
// counterpart day in a 28-day February, and a comparison that reached for one would either throw
// or silently roll into March — which would make "down 40% on last month" a sentence about the
// wrong month. The door computes the amounts; this module computes the LABEL, and the two must
// name the same interval or the number and its caption disagree.
//
// AND A MALFORMED `?period=` IS REPORTED, NEVER CORRECTED. Silently rewriting an address to a
// different month would let a reader screenshot one month under another month's label.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLIENT_PERIOD_HISTORY_MONTHS,
  daysInMonth,
  monthEnd,
  monthOf,
  monthStart,
  parsePeriodParam,
  periodHref,
  periodOptions,
  priorInterval,
  shiftMonth,
  todayInMyt,
} from "./period";

test("month arithmetic — ends, lengths and shifts, including a leap February", () => {
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2024-02"), 29, "2024 is a leap year");
  assert.equal(daysInMonth("2026-03"), 31);
  assert.equal(daysInMonth("2026-04"), 30);
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2024-02"), "2024-02-29");
  assert.equal(monthStart("2026-09"), "2026-09-01");
  assert.equal(monthOf("2026-09-18"), "2026-09");
  assert.equal(shiftMonth("2026-01", -1), "2025-12", "a shift crosses the year boundary");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-09", -5), "2026-04");
});

test("the elapsed interval is CAPPED at the prior month's last day — 31 March compares 1..28 February", () => {
  assert.deepEqual(priorInterval("2026-03", "2026-03-31"), { start: "2026-02-01", end: "2026-02-28" });
  // A day that DOES exist in both months is not capped.
  assert.deepEqual(priorInterval("2026-03", "2026-03-15"), { start: "2026-02-01", end: "2026-02-15" });
  // A leap February has 29 days and the cap moves with it.
  assert.deepEqual(priorInterval("2024-03", "2024-03-31"), { start: "2024-02-01", end: "2024-02-29" });
  // A whole 30-day month against a 31-day one is not extended either.
  assert.deepEqual(priorInterval("2026-05", "2026-05-31"), { start: "2026-04-01", end: "2026-04-30" });
});

test("the option list is month-to-date plus thirteen WHOLE months, and never offers the current month twice", () => {
  const options = periodOptions("2026-09-18");
  assert.equal(options.length, CLIENT_PERIOD_HISTORY_MONTHS + 1);
  assert.equal(options[0]?.isMtd, true);
  assert.equal(options[0]?.value, null, "month-to-date REMOVES the parameter rather than writing one");
  assert.equal(options[0]?.month, "2026-09");
  assert.deepEqual(options.slice(1, 4).map((o) => o.value), ["2026-08", "2026-07", "2026-06"]);
  assert.equal(options.at(-1)?.value, "2025-08");
  // The current month appears exactly once, as the MTD option. Offering "September (whole)" beside
  // "September to date" would be two labels for one unfinished interval.
  assert.equal(options.filter((o) => o.month === "2026-09").length, 1);
});

test("`?period=` — absent is month-to-date, a whole past month is that month, and anything else is REPORTED as malformed", () => {
  assert.deepEqual(parsePeriodParam(undefined, "2026-09-18"), { month: null, param: null, malformed: false });
  assert.deepEqual(parsePeriodParam("", "2026-09-18"), { month: null, param: null, malformed: false });
  assert.deepEqual(parsePeriodParam("2026-03", "2026-09-18"), { month: "2026-03-01", param: "2026-03", malformed: false });
  // An array (the shape Next hands a repeated query parameter) takes the first value.
  assert.deepEqual(parsePeriodParam(["2026-03", "2026-04"], "2026-09-18").param, "2026-03");

  for (const bad of ["2026-13", "2026-00", "march", "2026", "2026-3", "2026-03-01"]) {
    const parsed = parsePeriodParam(bad, "2026-09-18");
    assert.equal(parsed.month, null, `${bad} must not resolve to a month`);
    assert.equal(parsed.malformed, true, `${bad} must be REPORTED, not silently corrected`);
  }
  // The CURRENT month is month-to-date by definition, and that is not malformed.
  assert.deepEqual(parsePeriodParam("2026-09", "2026-09-18"), { month: null, param: null, malformed: false });
  // A FUTURE month has no actuals at all; the door would refuse a future as-of outright, so the
  // selector must never be able to ask for one.
  assert.equal(parsePeriodParam("2026-10", "2026-09-18").malformed, true);
});

test("the address the selector pushes keeps every other parameter and drops `period` for month-to-date", () => {
  assert.equal(periodHref("/clients/c1", "", "2026-03"), "/clients/c1?period=2026-03");
  assert.equal(periodHref("/clients/c1", "period=2026-03", null), "/clients/c1");
  assert.equal(periodHref("/clients/c1", "fy=2026", "2026-03"), "/clients/c1?fy=2026&period=2026-03");
  assert.equal(periodHref("/clients/c1", "fy=2026&period=2026-03", null), "/clients/c1?fy=2026");
});

test("today is resolved through the Asia/Kuala_Lumpur ZONE NAME, so a UTC instant late in the day is already tomorrow there", () => {
  // 2026-09-18T17:30Z is 2026-09-19 01:30 in Kuala Lumpur. A `+08` literal would have been a
  // claim about the calendar; the zone name is the calendar's own answer.
  assert.equal(todayInMyt(new Date("2026-09-18T17:30:00.000Z")), "2026-09-19");
  assert.equal(todayInMyt(new Date("2026-09-18T15:30:00.000Z")), "2026-09-18");
  // Midnight MYT exactly.
  assert.equal(todayInMyt(new Date("2026-09-18T16:00:00.000Z")), "2026-09-19");
  assert.equal(todayInMyt(new Date("2026-09-18T15:59:59.000Z")), "2026-09-18");
});

test("this module computes NO money — a cents value never passes through it", () => {
  // A SOURCE READ, because the rule is an ABSENCE and no behavioural cell can prove one. The
  // comparison arithmetic lives in the door (0232), once, so the browser and a later report
  // cannot disagree about what "down 12%" means; a helper here would be the second copy.
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "period.ts"), "utf8");
  const body = source.replace(/\/\/[^\n]*/g, "");
  for (const token of ["_cents", "fmtCents", "valueCents", "deltaPct"]) {
    assert.equal(body.includes(token), false, `period.ts mentions ${token}; the deltas belong to the door`);
  }
});
