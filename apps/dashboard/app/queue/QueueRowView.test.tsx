// Queue row + pre-0016 compatibility render tests (the regionOverlay.test.tsx pattern:
// createElement + renderToStaticMarkup, no jsdom). Two things are pinned here:
//   1. §6.2 vocabulary reaches the ROW — a sales row says "customer", an unknowable
//      direction keeps the AP default "vendor" (never a guess).
//   2. The 0016 surfaces degrade on a PRE-0016 envelope. Live is still at 15
//      migrations while the dashboard auto-deploys from main, so the queue read has to
//      survive rows with no coding_kind / watch_id / tier and no `compliance` block.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueRowView } from "./QueueRowView";
import { ComplianceWatchCard } from "../shared/cards/ComplianceWatchCard";
import { toReviewQueue, type QueueRow } from "../shared/reviewTypes";

function mkRow(p: Partial<QueueRow>): QueueRow {
  return {
    row_kind: "draft", section: "needs_review", sort: [], client_id: "cl000001", counterparty_id: "cp000001",
    filing_id: null, entry_id: "en000001", question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, rule_backed: false, high_stakes: false, aged_since: null,
    amount_cents: null, period: null, question_text: null, created_at: null, id: "r1",
    coding_kind: null, watch_id: null, tier: null, ...p,
  };
}
function renderRow(row: QueueRow): string {
  return renderToStaticMarkup(createElement(QueueRowView, {
    row, active: false, selectable: false, selected: false, onOpen: () => {}, onToggleSelect: () => {},
  }));
}

// --- §6.2 vocabulary on the row -------------------------------------------------

test("a sales_invoice row calls the counterparty a customer", () => {
  const html = renderRow(mkRow({ coding_kind: "sales_invoice" }));
  assert.ok(html.includes("customer cp000001"), "sales direction → customer");
  assert.ok(!html.includes("vendor"), "no AP noun leaks onto a sales row");
});

test("a null-direction row keeps the AP default (vendor), never a guess", () => {
  assert.ok(renderRow(mkRow({ coding_kind: null })).includes("vendor cp000001"), "unknowable → vendor");
  assert.ok(renderRow(mkRow({ coding_kind: "journal_entry" })).includes("vendor cp000001"), "generic voucher → vendor");
  assert.ok(renderRow(mkRow({ coding_kind: "supplier_bill" })).includes("vendor cp000001"), "purchase → vendor");
});

// --- pre-0016 degradation --------------------------------------------------------

test("a PRE-0016 queue envelope maps to safe nulls — no watch surface, no crash", () => {
  // Exactly the 0011/0015-era shape: no coding_kind / watch_id / tier on the row and
  // no top-level `compliance` block at all.
  const q = toReviewQueue({
    watermark: "2026-07-23T00:00:00Z",
    counts: { ready: 1, needs_review: 2, needs_you: 0, open_drafts: 3, open_questions: 0, open_tasks: 1 },
    sweep: { open_run: false },
    rows: [{ row_kind: "draft", section: "needs_review", id: "r1", client_id: "cl000001", counterparty_id: "cp000001", entry_id: "en000001" }],
  });
  assert.equal(q.counts.compliance_watches, 0, "a missing count defaults to 0, not NaN");
  assert.deepEqual(q.compliance, { stale_evaluator: false, clients: [] }, "a missing compliance block degrades to empty");
  const row = q.rows[0];
  assert.ok(row);
  assert.equal(row.coding_kind, null);
  assert.equal(row.watch_id, null);
  assert.equal(row.tier, null);
  // The tile-gate condition fix [6] rests on this pair being empty pre-0016.
  assert.equal(q.counts.compliance_watches === 0 && q.compliance.clients.length === 0, true);
  assert.ok(renderRow(row).includes("vendor cp000001"), "the pre-0016 row still renders with the AP default");
});

test("the watch card renders a pre-0016-shaped row (no tier, no matched client) inertly-safe", () => {
  const html = renderToStaticMarkup(createElement(ComplianceWatchCard, {
    token: "jwt", row: mkRow({ row_kind: "compliance_watch", question_text: null, tier: null, watch_id: null }),
    client: null, watchId: "cw000001", onChanged: () => {},
  }));
  assert.ok(html.includes("SST registration watch"), "the card still renders its head");
  assert.ok(html.includes("SST registration threshold watch"), "a null question_text falls back to the house label");
  assert.ok(html.includes(">watch<"), "a null tier degrades to the neutral 'watch' band");
  assert.ok(!html.includes("s.13(1)"), "no statutory countdown without a crossed/overdue state");
  assert.ok(html.includes("confirmed included turnover"), "the basis labels still render");
  assert.match(html, /confirmed included turnover<\/td><td class="num">—<\/td>/, "a null client degrades every figure to the — marker");
});
