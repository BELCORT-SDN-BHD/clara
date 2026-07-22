// Pure-helper tests for the autopost-rule management surface (contract §6/§7). No DB,
// no React — the lifecycle classification + copy helpers only. Runs under node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutopostRule } from "../shared/reviewCardTypes";
import { daysUntil, isExpiringSoon, ruleUrgency, windowLabel, postsRemaining, canSign, canRetire } from "./model";
import { narrowRuleWrite, ruleWriteRefusedError } from "../shared/reviewApi";

const NOW = new Date("2026-07-22T00:00:00Z");

function mkRule(p: Partial<AutopostRule>): AutopostRule {
  return {
    rule_id: "rule-1", client_id: "c1", counterparty_id: "cp1", counterparty_name: "ACME",
    direction: "purchase", account_code: "620-000", account_name: "Professional fees",
    amount_cap_cents: 100000, frequency_window: "monthly", window_max_posts: 3, posts_in_window: 1, posts_remaining: 2,
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

test("windowLabel reads DB bounds only (no computation of money)", () => {
  assert.equal(windowLabel(mkRule({ window_max_posts: 3, frequency_window: "monthly" })), "≤3 posts / monthly");
  assert.equal(windowLabel(mkRule({ window_max_posts: null, frequency_window: null })), "no window bound");
});

test("postsRemaining reads the DB-emitted posts_remaining verbatim — the UI computes nothing", () => {
  assert.equal(postsRemaining(mkRule({ posts_remaining: 2 })), 2);
  assert.equal(postsRemaining(mkRule({ posts_remaining: 0 })), 0);
  // Even when the raw window counts are present, it never re-derives from them: only the
  // DB field is consulted, so it degrades to null when the DB omits posts_remaining.
  assert.equal(postsRemaining(mkRule({ posts_remaining: null, window_max_posts: 3, posts_in_window: 1 })), null);
});

test("canSign is proposed-only; canRetire is proposed-or-live", () => {
  assert.equal(canSign(mkRule({ status: "proposed" })), true);
  assert.equal(canSign(mkRule({ status: "live" })), false);
  assert.equal(canRetire(mkRule({ status: "live" })), true);
  assert.equal(canRetire(mkRule({ status: "retired" })), false);
});

// ADV-R3#6: the typed HTTP-200 refusal union — a refused write must NEVER
// narrow to success (the panel's onChanged()-as-success bug class).
test("narrowRuleWrite: a typed refusal is refused; every other shape is success", () => {
  assert.deepEqual(narrowRuleWrite({ status: "refused", reason: "bounds_exceeded" }),
    { status: "refused", reason: "bounds_exceeded" });
  assert.deepEqual(narrowRuleWrite({ status: "refused" }), { status: "refused", reason: "refused" });
  assert.deepEqual(narrowRuleWrite({ rule_id: "r1", status: "proposed" }), { status: "ok" });
  assert.deepEqual(narrowRuleWrite({ rule_id: "r1", status: "live" }), { status: "ok" });
  assert.deepEqual(narrowRuleWrite(null), { status: "ok" });
  assert.deepEqual(narrowRuleWrite(undefined), { status: "ok" });
  assert.deepEqual(narrowRuleWrite("ok"), { status: "ok" });
});

test("ruleWriteRefusedError renders through the existing refusal UI (PgrestError shape: CLR27 + reason)", () => {
  const err = ruleWriteRefusedError("bounds_exceeded");
  assert.equal(err.clr, "CLR27");
  assert.equal(err.reason, "bounds_exceeded");
  assert.match(err.message, /bounds_exceeded/);
});
