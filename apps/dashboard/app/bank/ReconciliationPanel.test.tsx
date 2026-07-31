// ReconciliationView tests (the OpeningDryRunCard.test.tsx pattern:
// createElement + renderToStaticMarkup, no jsdom, no network). Targets the
// three properties named for this lane: the tie preview renders DB terms
// VERBATIM, the ack list gates the complete action, and the view fails
// closed (never a fake "tied") on an unknown/incomplete snapshot shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReconciliationView } from "./ReconciliationPanel";
import { toBankReconciliationView, type BankReconciliationView } from "./reconModel";
import { fmtCents, fmtDeltaCents } from "../shared/fmt";

function mkView(p: Partial<BankReconciliationView> = {}): BankReconciliationView {
  return {
    mode: "preview", recon_id: null, statement_id: "stmt-abcd1234", bank_account_id: "acc-1",
    coa_account_code: "601-000", prior_statement_id: "stmt-prior", prior_reconciliation_id: "recon-prior",
    first_period_exemption: false, period_start: "2026-05-01", period_end: "2026-05-31",
    status: "open",
    terms: {
      opening_anchor_cents: 1234500, gl_prime_cents: 9876500, uncleared_total_cents: -321000,
      unmatched_capacity_prime_cents: 45600, excepted_cents: -7800,
      computed_closing_cents: 10827300, statement_closing_cents: 10827300, difference_cents: 0,
    },
    snapshot: { outstanding_entries: [], outstanding_lines: [], exceptions: [], opening_lineage: [] },
    stale_outstanding_ids: [], precondition_met: true, chain_ok: true,
    completed_by: null, completed_at: null, voided_by: null, voided_at: null, voided_reason: null,
    ...p,
  };
}

function render(el: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(el);
}

// --- the tie preview renders DB terms verbatim -----------------------------------

test("the tie preview renders every identity term verbatim (fmtCents of the DB's own numbers, nothing recomputed)", () => {
  const view = mkView();
  const html = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()}));
  assert.ok(html.includes(fmtCents(view.terms.opening_anchor_cents)), "opening anchor renders verbatim");
  assert.ok(html.includes(fmtCents(view.terms.gl_prime_cents)), "gl prime renders verbatim");
  assert.ok(html.includes(fmtDeltaCents(view.terms.uncleared_total_cents)), "uncleared total renders verbatim");
  assert.ok(html.includes(fmtDeltaCents(view.terms.unmatched_capacity_prime_cents)), "unmatched capacity prime renders verbatim");
  assert.ok(html.includes(fmtDeltaCents(view.terms.excepted_cents)), "excepted renders verbatim");
  assert.ok(html.includes(fmtCents(view.terms.computed_closing_cents)), "computed closing renders verbatim");
  assert.ok(html.includes(fmtCents(view.terms.statement_closing_cents)), "statement closing renders verbatim");
  assert.ok(html.includes(">tied<"), "a zero difference reads tied");
});

test("a nonzero difference renders variance, not a silently-forced tie", () => {
  const view = mkView({ terms: { ...mkView().terms, difference_cents: 500, computed_closing_cents: 10827800 } });
  const html = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()}));
  assert.ok(html.includes(">variance<"));
  assert.ok(html.includes(fmtDeltaCents(500)), "the difference itself renders, verbatim");
});

// --- the ack list gates complete --------------------------------------------------

function completeButtonTag(html: string): string {
  const m = html.match(/<button[^>]*>Complete reconciliation<\/button>/);
  assert.ok(m, "expected a Complete reconciliation button");
  return m![0];
}

test("the ack list gates the complete button: disabled until every stale id is acknowledged", () => {
  const view = mkView({ status: "open", stale_outstanding_ids: ["stale-a", "stale-b"] });

  const none = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()}));
  assert.ok(completeButtonTag(none).includes("disabled"), "zero acks must stay disabled");
  assert.ok(none.includes("2 unacknowledged"), "the unacknowledged count renders");

  const partial = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set(["stale-a"]) }));
  assert.ok(completeButtonTag(partial).includes("disabled"), "one of two acked must still be disabled");
  assert.ok(partial.includes("1 unacknowledged"));

  const full = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set(["stale-a", "stale-b"]) }));
  assert.ok(!completeButtonTag(full).includes("disabled"), "both acked must be enabled");
  assert.ok(full.includes("all acknowledged"));
});

test("the ack list gates complete even with zero stale items, on precondition/chain", () => {
  const unsettled = mkView({ status: "open", precondition_met: false });
  const html1 = render(createElement(ReconciliationView, { view: unsettled, ackedStaleIds: new Set<string>()}));
  assert.ok(completeButtonTag(html1).includes("disabled"), "unsettled lines must disable complete");

  const gap = mkView({ status: "open", chain_ok: false });
  const html2 = render(createElement(ReconciliationView, { view: gap, ackedStaleIds: new Set<string>()}));
  assert.ok(completeButtonTag(html2).includes("disabled"), "a period gap must disable complete");
  assert.ok(html2.includes("recon_period_gap"));

  const ready = mkView({ status: "open", precondition_met: true, chain_ok: true, stale_outstanding_ids: [] });
  const html3 = render(createElement(ReconciliationView, { view: ready, ackedStaleIds: new Set<string>()}));
  assert.ok(!completeButtonTag(html3).includes("disabled"), "a clean, ready preview enables complete");
});

// --- fail-closed on unknown snapshot shapes ---------------------------------------

test("an unrecognised near-miss raw shape maps through toBankReconciliationView and renders unavailable, never a fake tie", () => {
  const view = toBankReconciliationView({ statement_id: "s1", status: "open", weird_unexpected_field: { nested: true } });
  const html = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()}));
  assert.ok(html.includes(">unavailable<"), "missing identity terms must read unavailable");
  assert.ok(!html.includes(">tied<"), "an unavailable read must never claim tied");
});

test("completely garbage raw input (a string, not an object) still renders inertly, never throws", () => {
  const view = toBankReconciliationView("not even an object");
  assert.doesNotThrow(() => render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()})));
  const html = render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()}));
  assert.ok(html.includes(">unavailable<"));
});

test("a snapshot with unrecognised nested shapes still renders, degrades fields, never crashes", () => {
  const view = toBankReconciliationView({
    statement_id: "s1", status: "complete", recon_id: "r1",
    terms: { opening_anchor_cents: 0, gl_prime_cents: 100, uncleared_total_cents: 0, unmatched_capacity_prime_cents: 0, excepted_cents: 0, computed_closing_cents: 100, statement_closing_cents: 100, difference_cents: 0 },
    snapshot: { outstanding_entries: "not an array", exceptions: [{ totally: "wrong shape" }] },
  });
  assert.equal(view.snapshot.outstanding_entries.length, 0, "a non-array snapshot field degrades to empty, not a crash");
  assert.equal(view.snapshot.exceptions.length, 1, "a malformed exception row still maps to a safe defensive row");
  assert.doesNotThrow(() => render(createElement(ReconciliationView, { view, ackedStaleIds: new Set<string>()})));
});
