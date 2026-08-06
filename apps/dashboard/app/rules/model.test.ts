// Pure-helper tests for the autopost-rule management surface (contract §6/§7). No DB,
// no React — the lifecycle classification + copy helpers only. Runs under node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutopostRule } from "../shared/reviewCardTypes";
import {
  daysUntil, isExpiringSoon, ruleUrgency, windowLabel, postsRemaining, canSign, canRetire,
  toSalesEvidencePreview, salesEvidenceNotApplicableLabel, taxSilentGapLabel,
  type SalesEvidencePreviewApplicable, type SalesEvidencePreviewNotApplicable,
} from "./model";
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

// === §7-A(b) — clara.preview_ocr_sales_evidence, mapped (0046 §SECTION 6) =========

const APPLICABLE_RAW = {
  rule_id: "r1", applicable: true, advisory: true,
  client_id: "c1", counterparty_id: "cp1", account_code: "410-000", rule_status: "proposed",
  qualifying: 4, distinct_invoices: 4, corroborated: 2, span_days: 45,
  tax_silent_documents: 2,
  required: { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 },
  floor_met: false, evaluated_at: "2026-08-07T03:00:00+08:00",
};

test("toSalesEvidencePreview maps the applicable branch — every count an INTEGER, verbatim", () => {
  const p = toSalesEvidencePreview(APPLICABLE_RAW);
  assert.ok(p && p.applicable);
  const a = p as SalesEvidencePreviewApplicable;
  assert.equal(a.rule_id, "r1");
  assert.equal(a.qualifying, 4);
  assert.equal(a.distinct_invoices, 4);
  assert.equal(a.corroborated, 2);
  assert.equal(a.span_days, 45);
  assert.equal(a.tax_silent_documents, 2);
  assert.deepEqual(a.required, { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 });
  assert.equal(a.floor_met, false);
  assert.equal(a.evaluated_at, "2026-08-07T03:00:00+08:00");
  assert.equal(a.advisory, true);
});

test("toSalesEvidencePreview reads `advisory` off the envelope's OWN field — false or absent maps to false, never a hardcoded true", () => {
  const off = toSalesEvidencePreview({ ...APPLICABLE_RAW, advisory: false }) as SalesEvidencePreviewApplicable;
  assert.equal(off.advisory, false);
  const withoutAdvisory: Record<string, unknown> = { ...APPLICABLE_RAW };
  delete withoutAdvisory.advisory;
  const missing = toSalesEvidencePreview(withoutAdvisory) as SalesEvidencePreviewApplicable;
  assert.equal(missing.advisory, false, "an envelope minted before this key existed must not be read as advisory:true");
});

test("toSalesEvidencePreview maps every not-applicable reason (0046's pinned vocabulary)", () => {
  const notSales = toSalesEvidencePreview({ rule_id: "r2", applicable: false, reason: "not_sales", advisory: true, evaluated_at: "t" });
  assert.ok(notSales && !notSales.applicable);
  assert.equal((notSales as SalesEvidencePreviewNotApplicable).reason, "not_sales");
  assert.equal((notSales as SalesEvidencePreviewNotApplicable).evidence_class, null);

  const notOcr = toSalesEvidencePreview({ rule_id: "r3", applicable: false, reason: "not_ocr_sales", evidence_class: "structured", advisory: true, evaluated_at: "t" });
  assert.equal((notOcr as SalesEvidencePreviewNotApplicable).evidence_class, "structured");

  const notAccessible = toSalesEvidencePreview({ rule_id: "r4", applicable: false, reason: "rule_not_accessible", advisory: true, evaluated_at: "t" });
  assert.equal((notAccessible as SalesEvidencePreviewNotApplicable).reason, "rule_not_accessible");
});

test("toSalesEvidencePreview returns null for a shape that matches NEITHER branch — folds into 'unavailable', never a confident verdict", () => {
  assert.equal(toSalesEvidencePreview(null), null);
  assert.equal(toSalesEvidencePreview([1, 2, 3]), null);
  assert.equal(toSalesEvidencePreview({ applicable: true }), null, "missing rule_id");
  assert.equal(toSalesEvidencePreview({ rule_id: "r1" }), null, "missing the applicable discriminant");
});

test("toSalesEvidencePreview defends span_days=null (an empty population) and defaults a missing `required`", () => {
  const p = toSalesEvidencePreview({ ...APPLICABLE_RAW, span_days: null, required: undefined }) as SalesEvidencePreviewApplicable;
  assert.equal(p.span_days, null);
  assert.deepEqual(p.required, { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 });
});

test("salesEvidenceNotApplicableLabel glosses all three reasons and falls back honestly for an unnamed one", () => {
  assert.match(salesEvidenceNotApplicableLabel({ applicable: false, rule_id: "r", reason: "not_sales", evidence_class: null, evaluated_at: null }), /not a sales-direction rule/);
  assert.match(
    salesEvidenceNotApplicableLabel({ applicable: false, rule_id: "r", reason: "not_ocr_sales", evidence_class: "structured", evaluated_at: null }),
    /structured/,
  );
  assert.match(salesEvidenceNotApplicableLabel({ applicable: false, rule_id: "r", reason: "rule_not_accessible", evidence_class: null, evaluated_at: null }), /unavailable/);
  assert.match(salesEvidenceNotApplicableLabel({ applicable: false, rule_id: "r", reason: "some_future_reason", evidence_class: null, evaluated_at: null }), /some_future_reason/);
});

test("taxSilentGapLabel reads the DB's OWN tax_silent_documents count — never re-subtracts qualifying-corroborated itself", () => {
  const gapped = toSalesEvidencePreview(APPLICABLE_RAW) as SalesEvidencePreviewApplicable;
  assert.match(taxSilentGapLabel(gapped) ?? "", /2 qualifying documents cannot corroborate — tax-silent documents/);

  const singular = toSalesEvidencePreview({ ...APPLICABLE_RAW, tax_silent_documents: 1 }) as SalesEvidencePreviewApplicable;
  assert.match(taxSilentGapLabel(singular) ?? "", /1 qualifying document cannot corroborate — tax-silent document\./);

  const clean = toSalesEvidencePreview({ ...APPLICABLE_RAW, tax_silent_documents: 0, corroborated: 6, floor_met: true }) as SalesEvidencePreviewApplicable;
  assert.equal(taxSilentGapLabel(clean), null, "no gap to call out once every qualifying document corroborates");
});
