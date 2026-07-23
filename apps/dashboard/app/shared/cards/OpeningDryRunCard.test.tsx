// OpeningDryRunView tests (the regionOverlay/ComplianceWatch pattern: createElement +
// renderToStaticMarkup, no jsdom). The presentational view is tested with a DB-free
// fixture so the full surface renders: the tie/off band, OBE net, per-line deltas (DB
// figures verbatim, off-lines flagged), the compact commit-gate mode (targets columns
// hidden), and the unmapped-labels + missing-must-asks sections. The self-hydrating
// OpeningDryRunCard's null-token gate is covered too (a static render, no network).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpeningDryRunView, OpeningDryRunCard } from "./OpeningDryRunCard";
import type { OpeningDryRun } from "../../opening/openingModel";

function mkDry(p: Partial<OpeningDryRun> = {}): OpeningDryRun {
  return {
    seed_id: "seed-abcd1234",
    client_id: "client-1",
    as_of: "2026-06-30",
    state: "open",
    obe_net_cents: 0,
    deltas: [
      { account_code: "1000", target_debit: 500000, target_credit: 0, actual_debit: 500000, actual_credit: 0, delta_debit: 0, delta_credit: 0 },
    ],
    unmapped_labels: [],
    missing_must_asks: [],
    ...p,
  };
}

test("a tied dry-run shows the 'ties' band and a nil OBE", () => {
  const html = renderToStaticMarkup(createElement(OpeningDryRunView, { dry: mkDry({}), mode: "workbench" }));
  assert.ok(html.includes(">ties<"), "the tie band renders");
  assert.ok(html.includes("bandReady"), "a tied seed uses the ready band");
  assert.ok(html.includes("RM 0.00") && html.includes("(nil)"), "OBE net renders nil");
  assert.ok(html.includes("RM 5,000.00"), "the DB target figure renders verbatim via fmtCents");
});

test("an off dry-run shows 'does not tie', flags the off line, and renders the delta", () => {
  const html = renderToStaticMarkup(
    createElement(OpeningDryRunView, {
      dry: mkDry({
        obe_net_cents: 1200,
        deltas: [
          { account_code: "2000", target_debit: 0, target_credit: 300000, actual_debit: 0, actual_credit: 200000, delta_debit: 0, delta_credit: -100000 },
        ],
      }),
      mode: "workbench",
    }),
  );
  assert.ok(html.includes(">does not tie<"), "an off seed does not tie");
  assert.ok(html.includes("bandYou"), "the off band is the needs-you tone");
  assert.ok(html.includes(">off<"), "the off line is flagged");
  assert.ok(html.includes("RM 12.00"), "the non-nil OBE net renders");
  assert.ok(html.includes("must net to nil"), "the OBE guidance shows when non-nil");
});

test("commit-gate mode hides the target columns (compact) but keeps actuals + delta", () => {
  const workbench = renderToStaticMarkup(createElement(OpeningDryRunView, { dry: mkDry({}), mode: "workbench" }));
  const compact = renderToStaticMarkup(createElement(OpeningDryRunView, { dry: mkDry({}), mode: "commit-gate" }));
  assert.ok(workbench.includes("target Dr"), "workbench shows target columns");
  assert.ok(!compact.includes("target Dr"), "commit-gate hides target columns");
  assert.ok(compact.includes("actual Dr"), "commit-gate keeps the actual columns");
});

test("unmapped labels and missing must-asks render their DB-authored rows", () => {
  const html = renderToStaticMarkup(
    createElement(OpeningDryRunView, {
      dry: mkDry({
        unmapped_labels: [{ line_key: "misc", source_label: "Sundry balance" }],
        missing_must_asks: [{ item_key: "sst_status", question: "Is the client SST-registered?" }],
      }),
      mode: "workbench",
    }),
  );
  assert.ok(html.includes("Unmapped labels (1)"));
  assert.ok(html.includes("Sundry balance"));
  assert.ok(html.includes("Unanswered must-asks (1)"));
  assert.ok(html.includes("Is the client SST-registered?"));
});

test("an empty target set renders the honest empty state, never a fake tie", () => {
  const html = renderToStaticMarkup(createElement(OpeningDryRunView, { dry: mkDry({ deltas: [] }), mode: "workbench" }));
  assert.ok(html.includes("No target lines recorded yet."));
  assert.ok(html.includes(">does not tie<"), "no lines cannot tie");
});

test("F-H6: a line the DB did not fully return renders 'unavailable — refresh', never a fake RM 0.00", () => {
  const html = renderToStaticMarkup(
    createElement(OpeningDryRunView, {
      dry: mkDry({
        deltas: [
          { account_code: "1000", target_debit: 500000, target_credit: 0, actual_debit: null, actual_credit: 0, delta_debit: null, delta_credit: 0 },
        ],
      }),
      mode: "workbench",
    }),
  );
  assert.ok(html.includes("unavailable — refresh"), "the row + band declare the unavailable state");
  assert.ok(!html.includes(">ties<"), "an unavailable set never claims a tie");
  assert.ok(!html.includes(">does not tie<"), "the tie verdict is withheld, not asserted as 'off'");
});

test("the card gates on a token (no network read without one)", () => {
  const html = renderToStaticMarkup(createElement(OpeningDryRunCard, { token: null, seedId: "seed-abcd1234", mode: "workbench" }));
  assert.ok(html.includes("Paste a session JWT"));
  assert.ok(!html.includes("opening-balance-equity net"), "no figures render without a token");
});
