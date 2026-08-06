// AutopostRulePanel's §7-A(b) evidence-preview render cells (the
// AdjustmentTemplatePanel.test.tsx pattern: createElement + renderToStaticMarkup,
// no jsdom). `EvidencePreview` is exported specifically so its three states —
// ready / not-applicable / unavailable — can be asserted on a pixel without
// driving the panel's network effect (contract §3 PR-DASHBOARD).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidencePreview } from "./AutopostRulePanel";
import type { SalesEvidencePreviewFetch, SalesEvidencePreviewApplicable } from "./model";

const APPLICABLE: SalesEvidencePreviewApplicable = {
  applicable: true, rule_id: "r1", client_id: "c1", counterparty_id: "cp1",
  account_code: "410-000", rule_status: "proposed",
  qualifying: 4, distinct_invoices: 4, corroborated: 2, span_days: 45,
  tax_silent_documents: 2,
  required: { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 },
  floor_met: false, evaluated_at: "2026-08-07T03:00:00+08:00",
};

function render(state: SalesEvidencePreviewFetch): string {
  return renderToStaticMarkup(createElement(EvidencePreview, { state }));
}

test("loading renders nothing — the panel must not flash a verdict before the read resolves", () => {
  assert.equal(render({ kind: "loading" }), "");
});

test("unavailable (RPC threw, or the verb is not deployed yet) renders a QUIET single line, never an error banner", () => {
  const withDetail = render({ kind: "unavailable", error: "preview_ocr_sales_evidence failed (404)" });
  assert.match(withDetail, /evidence preview unavailable/);
  assert.match(withDetail, /preview_ocr_sales_evidence failed \(404\)/, "the underlying reason survives to the screen");
  assert.doesNotMatch(withDetail, /class="banner"/, "this is the quiet muted state, not the alarm-colored banner AdjustmentTemplatePanel uses for load-bearing failures");
  assert.doesNotMatch(withDetail, /class="errorText"/);

  const noDetail = render({ kind: "unavailable", error: null });
  assert.match(noDetail, /evidence preview unavailable\./);
});

test("each not-applicable reason renders its own quiet line, never an exception-shaped one", () => {
  const notSales = render({ kind: "ready", preview: { applicable: false, rule_id: "r2", reason: "not_sales", evidence_class: null, evaluated_at: "t" } });
  assert.match(notSales, /not a sales-direction rule/);

  const notOcr = render({ kind: "ready", preview: { applicable: false, rule_id: "r3", reason: "not_ocr_sales", evidence_class: "structured", evaluated_at: "t" } });
  assert.match(notOcr, /structured \(non-OCR\) sales rule/);
  assert.match(notOcr, /evidence class: structured/);

  const notAccessible = render({ kind: "ready", preview: { applicable: false, rule_id: "r4", reason: "rule_not_accessible", evidence_class: null, evaluated_at: "t" } });
  assert.match(notAccessible, /evidence preview unavailable for this rule/);

  // None of the three renders the applicable-only surface (the four counts / floor badge).
  assert.doesNotMatch(notSales, /floor met|floor not yet met/);
});

test("the applicable branch renders the four counts vs their required thresholds, the tax-silent gap, floor_met, and the advisory banner", () => {
  const html = render({ kind: "ready", preview: APPLICABLE });
  assert.match(html, /qualifying 4\/6/);
  assert.match(html, /distinct invoices 4\/6/);
  assert.match(html, /corroborated 2\/6/);
  assert.match(html, /span 45\/60 days/);
  assert.match(html, /floor not yet met/);
  assert.doesNotMatch(html, />floor met</);
  assert.match(html, /2 qualifying documents cannot corroborate — tax-silent documents/, "the gap, in plain words");
  assert.match(html, /Advisory — the sign act re-checks the live floor/);
  assert.match(html, /Evaluated/, "the evaluated_at timestamp reaches the pixel");
});

test("a met floor with zero tax-silent documents renders the OTHER badge and carries no gap sentence", () => {
  const met: SalesEvidencePreviewApplicable = { ...APPLICABLE, corroborated: 6, tax_silent_documents: 0, floor_met: true };
  const html = render({ kind: "ready", preview: met });
  assert.match(html, />floor met</);
  assert.doesNotMatch(html, /floor not yet met/);
  assert.doesNotMatch(html, /cannot corroborate/, "nothing to call out once every qualifying document corroborates");
});

test("a null span_days (an empty population) renders the DB's own em-dash, never a stray 'null'", () => {
  const empty: SalesEvidencePreviewApplicable = { ...APPLICABLE, qualifying: 0, distinct_invoices: 0, corroborated: 0, span_days: null, tax_silent_documents: 0, floor_met: false };
  const html = render({ kind: "ready", preview: empty });
  assert.match(html, /span —\/60 days/);
  assert.doesNotMatch(html, /null/);
});

// [mandatory premise] Skeleton §2b: "Renders as integer counts, not through fmtCents (the
// panel's `:73-80` currency formatter is for caps)." A count run through fmtCents would
// divide by 100 and print "RM 1.23"; the raw integer 12345 proves the counts were NOT
// divided, and the total absence of "RM" anywhere in this block proves the formatter was
// never reached at all.
test("[mandatory premise] fmtCents NEVER touches the evidence counts — no RM anywhere, and a large count survives undivided", () => {
  const large: SalesEvidencePreviewApplicable = { ...APPLICABLE, qualifying: 12345, distinct_invoices: 12345, corroborated: 12345, tax_silent_documents: 12345 };
  const html = render({ kind: "ready", preview: large });
  assert.match(html, /qualifying 12345\/6/, "the bare integer, undivided — fmtCents would have printed RM 123.45");
  assert.doesNotMatch(html, /RM/, "this block must never emit the money formatter's currency prefix");
});
