// [F17/CX6#6 fix] AgingListBody render-branch tests (the ReconciliationPanel.
// test.tsx pattern: createElement + renderToStaticMarkup, no jsdom). The bug
// was a MISSING 'error' render branch — this file pins that every
// agingScreenState arm has an explicit render, and the red-proof scenario
// named by the fix: load AR with totals, switch to AP, AP rejects ⇒ NO stale
// AR total anywhere in the DOM.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgingListBody } from "./AgingWorkbench";
import { toAgingBucketRow, toAgingTotals, type AgingBucketRow, type AgingTotals } from "./agingModel";
import { fmtCents } from "../shared/fmt";

const AR_ROW: AgingBucketRow = toAgingBucketRow({
  counterparty_id: "cp1", counterparty_name: "ACME Sdn Bhd",
  current_cents: 10000000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 10000000,
  items: [],
});
const AR_TOTALS: AgingTotals = toAgingTotals({
  current_cents: 10000000, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 10000000,
})!;

function render(props: Partial<Parameters<typeof AgingListBody>[0]> = {}): string {
  return renderToStaticMarkup(createElement(AgingListBody, {
    state: "ideal", domain: "ar", visibleRows: [], totals: null,
    selectedCounterpartyId: null, onSelect: () => {},
    ...props,
  }));
}

test("[F17/CX6#6 fix] a 'ideal' state with rows+totals renders the money table, including the footer total", () => {
  const html = render({ state: "ideal", visibleRows: [AR_ROW], totals: AR_TOTALS });
  assert.ok(html.includes("ACME Sdn Bhd"));
  assert.ok(html.includes(fmtCents(10000000)));
});

test("[F17/CX6#6 fix — red-proof] the 'error' arm renders NO money table at all, even when a caller still hands it a populated totals prop (the exact shape a missing state-clear would have produced)", () => {
  // This is the literal scenario named by the fix: AR loaded totals RM100,000
  // successfully, then a domain switch to AP fails. If AgingWorkbench failed
  // to clear `totals` on the transition/failure, THIS is the props shape
  // AgingListBody would still receive — so the render branch itself, not
  // just the caller's state hygiene, must refuse to show it.
  const html = render({ state: "error", domain: "ap", visibleRows: [], totals: AR_TOTALS });
  assert.ok(!html.includes(fmtCents(10000000)), "no stale AR total anywhere in the DOM under an AP error");
  assert.ok(!html.includes("ACME Sdn Bhd"), "no stale AR row either");
  assert.ok(!html.includes("<table"), "no money table renders at all under 'error'");
  assert.ok(html.includes("Could not load"), "an explicit error message renders instead");
});

test("[F17/CX6#6 fix] every agingScreenState arm has an explicit branch — 'unavailable' and 'empty' still render their own honest message, never falling through to a stale table", () => {
  const unavailable = render({ state: "unavailable", totals: AR_TOTALS });
  assert.ok(!unavailable.includes(fmtCents(10000000)));
  assert.ok(unavailable.includes("unexpected shape"));

  const empty = render({ state: "empty", totals: AR_TOTALS });
  assert.ok(!empty.includes(fmtCents(10000000)));
  assert.ok(empty.includes("No open"));

  const loading = render({ state: "loading", totals: AR_TOTALS });
  assert.ok(!loading.includes(fmtCents(10000000)));
  assert.ok(loading.includes("Loading"));
});
