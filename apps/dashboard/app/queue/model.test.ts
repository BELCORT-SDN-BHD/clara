// Pure queue-model + cents-safety tests (no DOM, no DB). Covers the five-screen-state
// selector, the batch selection model (high-stakes exclusion — WA-R7/WA-D5), the URL
// cursor codec (fail-closed — §6 row 10), the always-on filter, section grouping, and
// the safe-integer cents guard the WA hard gate demands.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueRow } from "../shared/reviewTypes";
import { toReviewQueue } from "../shared/reviewTypes";
import {
  decodeCursor, encodeCursor, filterRows, groupBySection, isSelectable, queueScreenState, selectableRows,
} from "./model";
import { fmtCents, fmtDeltaCents, isSafeCents, CENTS_UNAVAILABLE, CENTS_UNSAFE } from "../shared/fmt";

function mkRow(p: Partial<QueueRow>): QueueRow {
  return {
    row_kind: "draft", section: "needs_review", sort: [], client_id: "cl1", counterparty_id: null,
    filing_id: null, entry_id: "e1", question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, rule_backed: false, high_stakes: false, aged_since: null,
    amount_cents: null, period: null, question_text: null, created_at: null, id: "row1",
    coding_kind: null, watch_id: null, tier: null, finding_id: null, ...p,
  };
}

// --- cursor codec (fail-closed) ------------------------------------------------

test("cursor round-trips through encode/decode", () => {
  const c = { tuple: ["needs_review", "cl1", "vendorA", "2026-01-01", "e1"] };
  assert.deepEqual(decodeCursor(encodeCursor(c)), c);
});
test("malformed / empty cursor decodes to null (list resets to page 1)", () => {
  assert.equal(decodeCursor("not-json"), null);
  assert.equal(decodeCursor(encodeURIComponent(JSON.stringify({ notAnArray: true }))), null);
  assert.equal(decodeCursor(encodeURIComponent(JSON.stringify(["ok", 5]))), null); // non-string member
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(encodeCursor(null), "");
  assert.equal(encodeCursor({ tuple: [] }), "");
});

// --- five screen states --------------------------------------------------------

test("queueScreenState resolves each of the five states", () => {
  assert.equal(queueScreenState({ loading: true, error: false, totalRows: 0, visibleRows: 0, loadingMore: false, hasMore: false }), "loading");
  assert.equal(queueScreenState({ loading: false, error: true, totalRows: 0, visibleRows: 0, loadingMore: false, hasMore: false }), "error");
  assert.equal(queueScreenState({ loading: false, error: false, totalRows: 0, visibleRows: 0, loadingMore: false, hasMore: false }), "empty");
  assert.equal(queueScreenState({ loading: false, error: false, totalRows: 3, visibleRows: 0, loadingMore: false, hasMore: false }), "empty"); // filtered to nothing
  assert.equal(queueScreenState({ loading: false, error: false, totalRows: 3, visibleRows: 3, loadingMore: false, hasMore: true }), "partial");
  assert.equal(queueScreenState({ loading: false, error: false, totalRows: 3, visibleRows: 3, loadingMore: false, hasMore: false }), "ideal");
});
test("an error with rows already shown does not blank the list (stays row-driven)", () => {
  assert.equal(queueScreenState({ loading: false, error: true, totalRows: 5, visibleRows: 5, loadingMore: false, hasMore: false }), "ideal");
});

// --- batch selection model (WA-R7: high-stakes excluded) -----------------------

test("only non-high-stakes drafts with an entry are selectable", () => {
  assert.equal(isSelectable(mkRow({ row_kind: "draft", high_stakes: false, entry_id: "e1" })), true);
  assert.equal(isSelectable(mkRow({ row_kind: "draft", high_stakes: true, entry_id: "e1" })), false);
  assert.equal(isSelectable(mkRow({ row_kind: "draft", entry_id: null })), false);
  assert.equal(isSelectable(mkRow({ row_kind: "open_question", question_id: "q1", entry_id: null })), false);
  assert.equal(isSelectable(mkRow({ row_kind: "uncoded_filing", filing_id: "f1", entry_id: null })), false);
});
test("selectableRows drops high-stakes and non-drafts", () => {
  const rows = [
    mkRow({ id: "a", entry_id: "e1", high_stakes: false }),
    mkRow({ id: "b", entry_id: "e2", high_stakes: true }),
    mkRow({ id: "c", row_kind: "open_question", question_id: "q", entry_id: null }),
  ];
  assert.deepEqual(selectableRows(rows).map((r) => r.id), ["a"]);
});

// --- filter + grouping ---------------------------------------------------------

test("filter is an always-on case-insensitive subsequence over row tokens", () => {
  const rows = [mkRow({ id: "a", question_text: "BRIGHTPATH bill" }), mkRow({ id: "b", question_text: "Acme invoice" })];
  assert.deepEqual(filterRows(rows, "").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(filterRows(rows, "bright").map((r) => r.id), ["a"]);
  assert.deepEqual(filterRows(rows, "zzz").map((r) => r.id), []);
});
test("groupBySection orders needs_you before needs_review (WA21-R14) and drops empty sections", () => {
  // WA21-R14 / ADR-031: the exception band renders first — including needs_you-lane
  // drafts, which the 0016 envelope still ranks 2 (the UI hoists them per page).
  const rows = [
    mkRow({ id: "a", section: "needs_you" }),
    mkRow({ id: "b", section: "needs_review" }),
    mkRow({ id: "c", section: "needs_you", row_kind: "draft" }),
  ];
  const groups = groupBySection(rows);
  assert.deepEqual(groups.map((g) => g.key), ["needs_you", "needs_review"]);
  assert.deepEqual(groups.find((g) => g.key === "needs_you")?.rows.map((r) => r.id), ["a", "c"]);
  assert.deepEqual(groupBySection([mkRow({ section: "needs_review" })]).map((g) => g.key), ["needs_review"]);
});

// --- compliance_watch row (0016 §2.3) ------------------------------------------

test("a compliance_watch row groups by its section and is NOT selectable", () => {
  const crossed = mkRow({ id: "cw1", row_kind: "compliance_watch", section: "needs_you", watch_id: "cw1", tier: "crossed", entry_id: null });
  const monitored = mkRow({ id: "cw2", row_kind: "compliance_watch", section: "needs_review", watch_id: "cw2", tier: "monitored", entry_id: null });
  // A watch is never batch-selectable (isSelectable keys on row_kind==='draft').
  assert.equal(isSelectable(crossed), false);
  assert.equal(isSelectable(monitored), false);
  const groups = groupBySection([crossed, monitored]);
  // WA21-R14 / ADR-031: crossed/overdue watches render top-of-queue (needs_you first).
  assert.deepEqual(groups.map((g) => g.key), ["needs_you", "needs_review"]);
  assert.deepEqual(groups.find((g) => g.key === "needs_you")?.rows.map((r) => r.id), ["cw1"]);
});

// --- envelope mapper defensiveness (compliance block + counts) -----------------

test("toReviewQueue maps the compliance block + additive row/count keys", () => {
  const q = toReviewQueue({
    counts: { compliance_watches: 2 },
    compliance: {
      stale_evaluator: true,
      clients: [{ client_id: "cl1", service_group: "G", state: "crossed", confirmed_included_cents: 500000, application_due: "2026-09-30" }],
    },
    rows: [{ id: "cw1", row_kind: "compliance_watch", watch_id: "cw1", tier: "crossed", coding_kind: null, client_id: "cl1", period: "2026-07-31" }],
  });
  assert.equal(q.counts.compliance_watches, 2);
  assert.equal(q.compliance.stale_evaluator, true);
  assert.equal(q.compliance.clients.length, 1);
  assert.equal(q.compliance.clients[0]?.confirmed_included_cents, 500000);
  assert.equal(q.compliance.clients[0]?.application_due, "2026-09-30");
  assert.equal(q.compliance.clients[0]?.unknown_or_mixed_cents, null); // absent → degrades to null
  assert.equal(q.rows[0]?.watch_id, "cw1");
  assert.equal(q.rows[0]?.tier, "crossed");
});

test("an absent compliance block degrades to a safe empty summary (never throws)", () => {
  const q = toReviewQueue({ rows: [] });
  assert.equal(q.compliance.stale_evaluator, false);
  assert.deepEqual(q.compliance.clients, []);
  assert.equal(q.counts.compliance_watches, 0);
  // A garbage compliance value also degrades rather than crashing.
  const q2 = toReviewQueue({ compliance: "nope", counts: null });
  assert.equal(q2.compliance.stale_evaluator, false);
  assert.deepEqual(q2.compliance.clients, []);
  assert.equal(q2.counts.compliance_watches, 0);
});

// --- cents safety (WA hard gate) ----------------------------------------------

test("fmtCents renders the AP-gate figure and guards unsafe/absent values", () => {
  assert.equal(fmtCents(135093821), "RM 1,350,938.21"); // AP gate exact (AGENTS.md)
  assert.equal(fmtCents(-340), "-RM 3.40");
  assert.equal(fmtCents(null), CENTS_UNAVAILABLE);
  assert.equal(fmtCents(undefined), CENTS_UNAVAILABLE);
  assert.equal(fmtCents(1.5), CENTS_UNSAFE); // non-integer cents never render as a number
  assert.equal(fmtCents(Number.MAX_SAFE_INTEGER + 1), CENTS_UNSAFE); // overflowed bigint
});
test("fmtDeltaCents signs deltas and guards", () => {
  assert.equal(fmtDeltaCents(1200), "+RM 12.00");
  assert.equal(fmtDeltaCents(-340), "-RM 3.40");
  assert.equal(fmtDeltaCents(0), "RM 0.00");
  assert.equal(fmtDeltaCents(null), CENTS_UNAVAILABLE);
});
test("isSafeCents accepts only safe integers", () => {
  assert.equal(isSafeCents(100), true);
  assert.equal(isSafeCents(1.5), false);
  assert.equal(isSafeCents("100"), false);
  assert.equal(isSafeCents(Number.MAX_SAFE_INTEGER + 1), false);
});
