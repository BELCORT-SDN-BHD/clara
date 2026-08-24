// LintFindingCard tests (the ComplianceWatchCard.test.tsx pattern: createElement +
// renderToStaticMarkup, no jsdom). `LintFindingCardView` is the pure, prop-driven
// render (finding/events/loading/loaded/busy/err/clr all passed directly) — this is
// what makes a network-hydrated card testable this way without mocking fetch; the
// thin `LintFindingCard` hydrating wrapper only adds the `!token` gate + the
// get_lint_finding/useCard/resolve_lint_finding wiring, which this file does not
// re-verify (no dedicated network/useEffect harness exists in this test runner —
// see the OpenQuestionCard/DiffCard precedent, which also have no test file for
// exactly that reason). renderToStaticMarkup can't drive useState, so the citation
// chip's click-to-expand toggle is asserted only in its COLLAPSED initial state —
// the ComplianceWatchCard.test.tsx caveat applies here too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LintFindingCard, LintFindingCardView,
  findingKindCopy, severityBand, isTerminalFinding, figureRows, deltaRows, citationChips, eventKindCopy,
  FINDING_KIND_COPY, RESOLVE_CONCLUSIONS,
} from "./LintFindingCard";
import type { QueueRow, LintFinding, LintFindingEvent } from "../reviewTypes";

function mkFinding(p: Partial<LintFinding> = {}): LintFinding {
  return {
    id: "lf1", client_id: "cl1", finding_kind: "contradiction", dedupe_key: "contradiction:a:b",
    severity: "critical", page_id: null, seed_id: null, detail: {}, state: "open",
    prior_finding_id: null, opened_at: "2026-07-01T00:00:00Z", evaluated_through_event_seq: 10,
    resolved_conclusion: null, resolved_note: null, resolved_by: null, resolved_at: null,
    superseded_at: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z", ...p,
  };
}
function mkEvent(p: Partial<LintFindingEvent> = {}): LintFindingEvent {
  return {
    id: "ev1", finding_id: "lf1", event_kind: "created", state_before: null, state_after: "open",
    figures: {}, actor: null, rationale: null, created_at: "2026-07-01T00:00:00Z", ...p,
  };
}
function mkRow(p: Partial<QueueRow> = {}): QueueRow {
  return {
    row_kind: "lint_finding", section: "needs_you", sort: [], client_id: "cl1", counterparty_id: null,
    filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, high_stakes: false, aged_since: null,
    amount_cents: null, period: null, question_text: "Lint: contradiction", created_at: null, id: "lf1",
    coding_kind: null, watch_id: null, tier: "critical", finding_id: "lf1", ...p,
  };
}

function render(props: Partial<Parameters<typeof LintFindingCardView>[0]> = {}): string {
  return renderToStaticMarkup(createElement(LintFindingCardView, {
    findingId: "lf1", row: mkRow(), finding: mkFinding(), events: [], loading: false, loaded: true,
    busy: false, err: null, clr: null, onResolve: () => {}, ...props,
  }));
}

// --- render: the row's plain-language copy + severity chip ----------------------

test("finding_kind maps to plain-language copy in the card head", () => {
  for (const [kind, copy] of Object.entries(FINDING_KIND_COPY)) {
    const html = render({ finding: mkFinding({ finding_kind: kind }) });
    assert.ok(html.includes(copy), `${kind} should render "${copy}"`);
  }
});

test("an unrecognised finding_kind degrades to its own spaced text, never a crash", () => {
  const html = render({ finding: mkFinding({ finding_kind: "future_kind_xyz" }) });
  assert.ok(html.includes("future kind xyz"));
});

test("the severity chip renders shape+label per severity, never hue-only", () => {
  const critical = render({ finding: mkFinding({ severity: "critical" }) });
  assert.ok(critical.includes("bandYou") && critical.includes(">critical<"));
  const warn = render({ finding: mkFinding({ severity: "warn" }) });
  assert.ok(warn.includes("bandReview") && warn.includes(">warn<"));
  const info = render({ finding: mkFinding({ severity: "info" }) });
  assert.ok(info.includes(">info<") && !info.includes("bandYou") && !info.includes("bandReview"));
});

test("with no finding yet (still loading), the row's own tier is the severity fallback", () => {
  const html = render({ finding: null, loaded: false, loading: true, row: mkRow({ tier: "warn" }) });
  assert.ok(html.includes(">warn<"));
  assert.ok(html.includes("Loading finding"));
});

// --- render: not-found vs still-loading (the `loaded` gate) ----------------------

test("a not-yet-loaded absence never flashes the not-found message", () => {
  const html = render({ finding: null, loaded: false, loading: true });
  assert.ok(!html.includes("could not be found"));
});

test("a loaded-but-absent finding renders the honest not-found message", () => {
  const html = render({ finding: null, loaded: true, loading: false });
  assert.ok(html.includes("could not be found"));
});

// --- render: figures / deltas verbatim -------------------------------------------

test("detail figures render label+value rows; a cents key formats via fmtCents", () => {
  const html = render({ finding: mkFinding({ finding_kind: "cap_pages", detail: { actual: 48, limit: 50, budget_key: "max_pages_per_client" } }) });
  assert.ok(html.includes(">actual<") && html.includes(">48<"));
  assert.ok(html.includes(">limit<") && html.includes(">50<"));
  assert.ok(html.includes("max_pages_per_client"));
});

test("obe_net_cents renders SIGNED via fmtDeltaCents, never a bare fmtCents", () => {
  const positive = render({ finding: mkFinding({ finding_kind: "opening_tb_tie_broken", detail: { obe_net_cents: 150000 } }) });
  assert.ok(positive.includes("+RM 1,500.00"));
  const negative = render({ finding: mkFinding({ finding_kind: "opening_tb_tie_broken", detail: { obe_net_cents: -150000 } }) });
  assert.ok(negative.includes("-RM 1,500.00"));
});

test("a UUID-shaped detail value shortens for display via the shortId idiom", () => {
  const html = render({ finding: mkFinding({ detail: { page_a: "11111111-2222-3333-4444-555555555555" } }) });
  assert.ok(html.includes("11111111"));
  assert.ok(!html.includes("11111111-2222-3333-4444-555555555555"));
});

test("the opening deltas table renders every column verbatim from the DB row", () => {
  const html = render({
    finding: mkFinding({
      finding_kind: "opening_tb_tie_broken",
      detail: { deltas: [{ account_code: "1000", target_debit: 100000, target_credit: 0, actual_debit: 120000, actual_credit: 0, delta_debit: 20000, delta_credit: 0 }] },
    }),
  });
  assert.ok(html.includes("Opening deltas vs target"));
  assert.ok(html.includes(">1000<"));
  assert.ok(html.includes("RM 1,000.00")); // target_debit
  assert.ok(html.includes("RM 1,200.00")); // actual_debit
  assert.ok(html.includes("+RM 200.00")); // delta_debit (signed)
});

test("a malformed deltas array degrades to no deltas table, never a crash", () => {
  const html = render({ finding: mkFinding({ detail: { deltas: "not-an-array" } }) });
  assert.ok(!html.includes("Opening deltas vs target"));
});

// --- render: citation chips (layered disclosure, collapsed state only) ----------

test("no citations block renders when detail carries no citations array", () => {
  const html = render({ finding: mkFinding({ detail: {} }) });
  assert.ok(!html.includes("Wiki citations"));
});

test("a structured citations array renders one collapsed chip per entry", () => {
  const html = render({
    finding: mkFinding({ detail: { citations: [{ subject_key: "sst_registered", source_at: "2026-06-01" }, {}] } }),
  });
  assert.ok(html.includes("Wiki citations"));
  assert.ok(html.includes("sst_registered · 2026-06-01"));
  assert.ok(html.includes("citation 2"), "an entry with no identifying fields still gets a label");
  assert.ok(!html.includes('"subject_key"'), "the raw JSON preview stays collapsed by default");
});

// --- render: episode lifecycle ----------------------------------------------------

test("the episode lifecycle renders every event with its transition + rationale", () => {
  const html = render({
    events: [
      mkEvent({ id: "e1", event_kind: "created", state_before: null, state_after: "open" }),
      mkEvent({ id: "e2", event_kind: "evaluation", state_before: "open", state_after: "open", rationale: "daily lint convergence" }),
    ],
  });
  assert.ok(html.includes("opened"));
  assert.ok(html.includes("re-evaluated"));
  assert.ok(html.includes("daily lint convergence"));
});

test("eventKindCopy maps every 0017 event_kind + degrades an unknown one", () => {
  assert.equal(eventKindCopy("created"), "opened");
  assert.equal(eventKindCopy("superseded"), "superseded");
  assert.equal(eventKindCopy("resolved"), "resolved");
  assert.equal(eventKindCopy("recheck_opened"), "reopened (recheck)");
  assert.equal(eventKindCopy("evaluation"), "re-evaluated");
  assert.equal(eventKindCopy("some_future_kind"), "some future kind");
});

// --- render: terminal states + the resolve gate ----------------------------------

test("a resolved finding renders inert with its conclusion + note, no resolve controls", () => {
  const html = render({ finding: mkFinding({ state: "resolved", resolved_conclusion: "false_positive", resolved_note: "checked the source doc" }) });
  assert.ok(html.includes("Resolved: false positive"));
  assert.ok(html.includes("checked the source doc"));
  assert.ok(!html.includes(">Resolve<"));
});

test("a superseded finding renders its own inert message, no resolve controls", () => {
  const html = render({ finding: mkFinding({ state: "superseded" }) });
  assert.ok(html.includes("Superseded"));
  assert.ok(!html.includes(">Resolve<"));
});

test("the resolve button is disabled while the note is empty", () => {
  const html = render();
  assert.match(html, /<button[^>]*disabled[^>]*>Resolve<\/button>/);
});

test("isTerminalFinding is true only for resolved/superseded", () => {
  assert.equal(isTerminalFinding("resolved"), true);
  assert.equal(isTerminalFinding("superseded"), true);
  assert.equal(isTerminalFinding("open"), false);
  assert.equal(isTerminalFinding(null), false);
});

test("RESOLVE_CONCLUSIONS matches the 0017 resolve_lint_finding check constraint exactly", () => {
  assert.deepEqual([...RESOLVE_CONCLUSIONS], ["corrected", "accepted_revision", "false_positive", "superseded_by_edit"]);
});

// --- render: refusal + no-token gates ---------------------------------------------

test("a governed refusal renders its CLR code + reason verbatim", () => {
  const html = render({ clr: { code: "CLR33", reason: "bad_conclusion" } });
  assert.ok(html.includes("CLR33") && html.includes("bad_conclusion"));
});

test("with no token the wrapper asks for a JWT and touches no network", () => {
  const html = renderToStaticMarkup(createElement(LintFindingCard, {
    token: null, findingId: "lf1", row: mkRow(), onChanged: () => {},
  }));
  assert.ok(html.includes("Paste a session JWT"));
});

// --- pure: figureRows / deltaRows / citationChips defensive shapes ---------------

test("figureRows excludes the specially-rendered deltas/citations keys", () => {
  const rows = figureRows({ actual: 1, deltas: [{}], citations: [{}] });
  assert.deepEqual(rows.map((r) => r.label), ["actual"]);
});

test("deltaRows degrades every non-numeric field to null, never NaN or a crash", () => {
  const rows = deltaRows({ deltas: [{ account_code: 42, target_debit: "oops" }] });
  assert.deepEqual(rows, [{ account_code: null, target_debit: null, target_credit: null, actual_debit: null, actual_credit: null, delta_debit: null, delta_credit: null }]);
});

test("citationChips degrades a non-array/absent field to []", () => {
  assert.deepEqual(citationChips({}), []);
  assert.deepEqual(citationChips({ citations: "not-an-array" }), []);
  assert.deepEqual(citationChips({ citations: null }), []);
});

test("severityBand degrades an unrecognised severity to a neutral chip carrying the raw value", () => {
  assert.deepEqual(severityBand("weird"), { label: "weird", tone: "neutral" });
  assert.deepEqual(severityBand(null), { label: "finding", tone: "neutral" });
});

test("findingKindCopy covers exactly the 0017 finding_kind check-constraint set", () => {
  assert.deepEqual(Object.keys(FINDING_KIND_COPY).sort(), [
    "cap_page_size", "cap_pages", "contradiction", "opening_doc_unfiled",
    "opening_tb_tie_broken", "orphan_page", "stale_claim", "wiki_synthesis_held",
  ]);
  for (const kind of Object.keys(FINDING_KIND_COPY)) assert.equal(findingKindCopy(kind), FINDING_KIND_COPY[kind]);
});
