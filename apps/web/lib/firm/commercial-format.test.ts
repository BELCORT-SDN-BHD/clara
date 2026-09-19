// #635 — the money and date formatting this page is allowed to do.
//
// ADDED IN FIX ROUND 1 (adversarial A9). `formatMoneyCents` had no cell of its own: the plan
// figure is exercised through `commercial-state-card.test.tsx` and the spend column through
// `ai-usage-card.test.tsx`, and both only ever hand it a non-negative value — so the one branch
// that composes a sign by hand was never read by a test. On a MONEY surface that is exactly the
// branch worth pinning.

import test from "node:test";
import assert from "node:assert/strict";

import { formatInteger, formatMoneyCents, formatPlanAmount, formatUsageMonth, formatUtcDay } from "./commercial-format";

test("p635.format.money_cents renders integer cents with two places, in the currency the door named", () => {
  assert.equal(formatMoneyCents(19900, "MYR"), "MYR 199.00");
  assert.equal(formatMoneyCents(340, "USD"), "USD 3.40");
  assert.equal(formatMoneyCents(0, "USD"), "USD 0.00");
  assert.equal(formatMoneyCents(5, "USD"), "USD 0.05", "a sub-unit amount keeps its leading zero");
  assert.equal(formatMoneyCents(123456789, "MYR"), "MYR 1,234,567.89", "thousands separators, no float anywhere");
});

test("p635.format.money_negative_sub_unit carries ONE sign, not two", () => {
  // `Math.trunc(-50 / 100)` is `-0`, which `Intl.NumberFormat` itself renders as "-0" — so the
  // hand-composed sign in front of it produced "-USD -0.50" on a money surface. Not reachable
  // today (spend_cents is a coalesced sum over a non-negative price table and the beta plan's
  // amount is 0), which is precisely why it needs a cell rather than a comment.
  assert.equal(formatMoneyCents(-50, "USD"), "-USD 0.50");
  assert.equal(formatMoneyCents(-5, "USD"), "-USD 0.05");
  assert.equal(formatMoneyCents(-19900, "MYR"), "-MYR 199.00", "the sign survives above one unit too");
  assert.equal(formatMoneyCents(-100, "USD"), "-USD 1.00");
});

test("p635.format.plan_amount refuses an unruled price and returns the render condition instead", () => {
  assert.equal(formatPlanAmount({ amountCents: 0, currency: "MYR", amountsRuled: false }), null,
    "RM 0.00 would be a number nobody decided — the same defect as inventing one (C-01 / C-56)");
  assert.equal(formatPlanAmount({ amountCents: 19900, currency: "MYR", amountsRuled: true }), "MYR 199.00",
    "a later owner ruling shows a figure with no code change");
});

test("p635.format.utc_frame the usage window is spelled in UTC, and a token count is not money", () => {
  assert.equal(formatUtcDay("2026-09-01"), "01 Sept 2026");
  assert.equal(formatUsageMonth("2026-08"), "August 2026");
  assert.equal(formatInteger(3_000_000), "3,000,000");
});
