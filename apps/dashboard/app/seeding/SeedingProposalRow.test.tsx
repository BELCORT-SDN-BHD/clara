// SeedingProposalRow render tests (the regionOverlay.test.tsx pattern: createElement +
// renderToStaticMarkup, no jsdom, no network — the row hydrates from props only).
// Covers: evidence chips (occurrence/date-span/line-cites) render DB values verbatim,
// a refused row is visible but carries NO tick/decline controls, a ticked wiki_fact
// shows the "publishing to the wiki" state, and the decidable gate controls whether
// the tick/decline actions render at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeedingProposalRow } from "./SeedingProposalRow";
import type { SeedingProposal } from "../shared/seedingApi";

function mkProposal(p: Partial<SeedingProposal> = {}): SeedingProposal {
  return {
    id: "p1", batch_id: "b1", firm_id: "f1", client_id: "c1",
    proposal_kind: "vendor_account_rule", proposal_key: "k1",
    payload: { name: "Acme Sdn Bhd", account_code: "5100" },
    evidence: {
      occurrence_count: 4,
      date_span: { from: "2026-01-01", to: "2026-06-30" },
      line_cites: [{ kind: "row", row: 12, text: "recurring rent", raw: {} }],
      raw: {},
    },
    state: "proposed", decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null,
    resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-24T00:00:00Z", ...p,
  };
}

function render(
  p: Partial<SeedingProposal> = {},
  decidable = true,
  outcome: Parameters<typeof SeedingProposalRow>[0]["outcome"] = null,
) {
  return renderToStaticMarkup(
    createElement(SeedingProposalRow, {
      proposal: mkProposal(p), outcome, busy: false, decidable, declineReason: "",
      onDeclineReasonChange: () => {}, onTick: () => {}, onDecline: () => {},
    }),
  );
}

test("evidence renders DB values verbatim: occurrence count, date span, row cite (F-M14)", () => {
  const html = render();
  assert.ok(html.includes("4 occurrences"));
  assert.ok(html.includes("2026-01-01") && html.includes("2026-06-30"));
  assert.ok(html.includes("line 12"), "a {row,text} cite renders its row directly");
  assert.ok(html.includes("recurring rent"), "the cite text renders directly in the disclosure");
});

test("a region cite renders its region + text directly (F-M14)", () => {
  const html = render({
    evidence: { occurrence_count: null, date_span: null, line_cites: [{ kind: "region", region_id: "reg-9", text: "TB line 4", raw: {} }], raw: {} },
  });
  assert.ok(html.includes("region reg-9"), "a {region_id,text} cite renders its region directly");
  assert.ok(html.includes("TB line 4"));
});

test("an unknown-shape cite keeps its raw JSON fallback (F-M14)", () => {
  const html = render({
    evidence: { occurrence_count: null, date_span: null, line_cites: [{ kind: "raw", raw: { mystery: "x" } }], raw: {} },
  });
  assert.ok(html.includes("cite 1"), "an unknown cite falls back to a generic summary");
  assert.ok(html.includes("mystery"), "the raw cite JSON is preserved, never dropped");
});

test("a proposed + decidable row shows Tick and a disabled Decline (empty reason)", () => {
  const html = render({ state: "proposed" }, true);
  assert.ok(html.includes(">Tick<"));
  assert.match(html, /<button[^>]*disabled[^>]*>Decline<\/button>/);
});

test("a refused row is visible, shows its refuse_reason, and carries NO tick/decline controls", () => {
  const html = render({ state: "refused", refuse_reason: "control_account" }, false);
  assert.ok(html.includes("refused at parse: control_account"));
  assert.ok(!html.includes(">Tick<"), "a refused row is never tickable");
  assert.ok(!html.includes(">Decline<"));
});

test("a ticked wiki_fact proposal shows the publishing-to-the-wiki state", () => {
  const html = render({ proposal_kind: "wiki_fact", state: "ticked" }, false);
  assert.ok(html.includes("publishing to the wiki"));
});

test("a ticked non-wiki proposal does NOT claim a wiki dispatch", () => {
  const html = render({ proposal_kind: "vendor_account_rule", state: "ticked" }, false);
  assert.ok(!html.includes("publishing to the wiki"));
});

test("an unticked proposed row states plainly that it stays proposed", () => {
  const html = render({ state: "proposed" }, true);
  assert.ok(html.includes("proposed — not yet ticked"));
});

test("a per-row failure outcome (e.g. CLR27 duplicate_live) renders on THAT row only, verbatim", () => {
  const html = render({ id: "p9" }, true, { ok: false, clr: "CLR27", message: "a live rule already exists for this counterparty" });
  assert.ok(html.includes("CLR27"));
  assert.ok(html.includes("a live rule already exists for this counterparty"));
});

test("a per-row success outcome renders its label (e.g. after a tick)", () => {
  const html = render({ id: "p9" }, true, { ok: true, label: "ticked" });
  assert.ok(html.includes(">ticked<") || html.includes("ticked</p>"));
});

test("a proposal with no evidence renders with no evidence chips, never a crash", () => {
  const html = render({ evidence: { occurrence_count: null, date_span: null, line_cites: [], raw: {} } });
  assert.ok(!html.includes("occurrence"));
});
