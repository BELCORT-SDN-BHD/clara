// Pure-helper tests for the autopost-rule management surface (contract §6/§7). No DB,
// no React — the lifecycle classification + copy helpers only. Runs under node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutopostRule } from "../shared/reviewCardTypes";
import { daysUntil, isExpiringSoon, ruleUrgency, windowLabel, postsRemaining, canSign, canRetire } from "./model";

const NOW = new Date("2026-07-22T00:00:00Z");

function mkRule(p: Partial<AutopostRule>): AutopostRule {
  return {
    rule_id: "rule-1", client_id: "c1", counterparty_id: "cp1", counterparty_name: "ACME",
    direction: "purchase", account_code: "620-000", account_name: "Professional fees",
    amount_cap_cents: 100000, frequency_window: "monthly", window_max_posts: 3, posts_in_window: 1,
    expires_at: "2027-01-01T00:00:00Z", status: "live", signed_by: "u1", signed_at: "2026-06-01T00:00:00Z",
    supersedes_rule_id: null, reason: null, created_at: "2026-06-01T00:00:00Z", ...p,
  };
}

test("daysUntil counts forward days and is null-safe", () => {
  assert.equal(daysUntil("2026-08-01T00:00:00Z", NOW), 10);
  assert.equal(daysUntil(null, NOW), null);
  assert.equal(daysUntil("not-a-date", NOW), null);
});

test("isExpiringSoon fires only for LIVE rules within the window", () => {
  assert.equal(isExpiringSoon(mkRule({ expires_at: "2026-08-05T00:00:00Z" }), NOW), true); // 14d
  assert.equal(isExpiringSoon(mkRule({ expires_at: "2027-01-01T00:00:00Z" }), NOW), false); // far
  assert.equal(isExpiringSoon(mkRule({ status: "proposed", expires_at: "2026-08-05T00:00:00Z" }), NOW), false);
});

test("ruleUrgency classifies proposed / live / expiring / expired / terminal", () => {
  assert.equal(ruleUrgency(mkRule({ status: "proposed" }), NOW), "proposed");
  assert.equal(ruleUrgency(mkRule({ expires_at: "2027-01-01T00:00:00Z" }), NOW), "live");
  assert.equal(ruleUrgency(mkRule({ expires_at: "2026-08-05T00:00:00Z" }), NOW), "expiring");
  assert.equal(ruleUrgency(mkRule({ expires_at: "2026-07-01T00:00:00Z" }), NOW), "expired");
  assert.equal(ruleUrgency(mkRule({ status: "retired" }), NOW), "terminal");
});

test("windowLabel + postsRemaining read DB bounds only (no computation of money)", () => {
  assert.equal(windowLabel(mkRule({ window_max_posts: 3, frequency_window: "monthly" })), "≤3 posts / monthly");
  assert.equal(windowLabel(mkRule({ window_max_posts: null, frequency_window: null })), "no window bound");
  assert.equal(postsRemaining(mkRule({ window_max_posts: 3, posts_in_window: 1 })), 2);
  assert.equal(postsRemaining(mkRule({ window_max_posts: 3, posts_in_window: 5 })), 0); // never negative
  assert.equal(postsRemaining(mkRule({ posts_in_window: null })), null);
});

test("canSign is proposed-only; canRetire is proposed-or-live", () => {
  assert.equal(canSign(mkRule({ status: "proposed" })), true);
  assert.equal(canSign(mkRule({ status: "live" })), false);
  assert.equal(canRetire(mkRule({ status: "live" })), true);
  assert.equal(canRetire(mkRule({ status: "retired" })), false);
});
