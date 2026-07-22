// §6.1 terminal-state hydration tests (Wave A2.1). The bug: a settled entry's
// get_draft_review returns SQL NULL and toDraftReview FABRICATED a status-'unknown'
// DraftReview (empty lines, RM 0.00 totals, dead buttons). These tests pin the fix:
// (1) toDraftReview(null) → null, never a fabrication; (2) a draft payload still maps
// exactly as today; (3) a null hydration + the get_entry_diff bridge resolves a TRUE
// terminal receipt; (4) bridge-less null resolves the honest shell; (5) the future
// 0016 slim settled payload is used directly (no bridge). Pure model + static render
// (test/bootstrap.mjs stubs CSS; no DB, no effects).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toDraftReview } from "./review";
import {
  resolveReviewHydration,
  settledFromDiff,
  settledFromStatus,
  settledReceiptCopy,
  SETTLED_GONE_COPY,
} from "../shared/settledState";
import { toEntryDiff } from "../shared/reviewTypes";
import { JeSettledReceipt, JeSettledShell } from "./JeSettledCard";

// The as-built get_draft_review draft payload shape (0009/0011 — review.ts header).
const DRAFT_RAW = {
  entry: {
    id: "e1", client_id: "cl1", document_id: "d1", filing_id: null, status: "draft",
    revision_token: "r1", posting_date: "2026-07-01", memo: "July rent", flags: {},
  },
  lines: [
    { account_code: "620-000", account_name: "Rent", debit_cents: 135000, credit_cents: 0, account_class: "expense" },
    { account_code: "400-000", account_name: "Accounts payable", debit_cents: 0, credit_cents: 135000, account_class: "payable", counterparty_id: "cp1" },
  ],
  counterparty: { proposal: { new: { name: "Alpha Sdn Bhd" } }, current_outcome: null },
  evidence: [{ field_path: "invoice.total", quote: "RM 1,350.00", region_id: "rg1", provenance_tier: "verified" }],
  eligible_checker_count: 2,
  high_stakes: false,
};

// A get_entry_diff walk whose LAST revision header shows the terminal state.
const APPROVED_DIFF_RAW = {
  entry_id: "e1",
  revisions: [
    { revision_no: 0, actor_kind: "agent", actor: "a1", reason: "draft", created_at: "2026-07-01T02:00:00Z", header: { status: "draft" }, legs: [], rule_decision_id: null, deltas_vs_prev: [] },
    { revision_no: 1, actor_kind: "human", actor: "u1", reason: "approved", created_at: "2026-07-02T03:00:00Z", header: { status: "approved" }, legs: [], rule_decision_id: null, deltas_vs_prev: [] },
  ],
};

// --- (1) never fabricate --------------------------------------------------------

test("toDraftReview(null) returns null — never a fabricated 'unknown' review", () => {
  assert.equal(toDraftReview(null), null);
  assert.equal(toDraftReview(undefined), null);
  assert.equal(toDraftReview("scalar"), null);
  assert.equal(toDraftReview({}), null); // no entry identity, no status — not a review
});

// --- (2) a live draft maps exactly as today -------------------------------------

test("a draft payload still maps as today (status, lines, DB cents verbatim)", () => {
  const r = toDraftReview(DRAFT_RAW);
  assert.ok(r, "a draft payload must map to a review");
  assert.equal(r.status, "draft");
  assert.equal(r.entry_id, "e1");
  assert.equal(r.revision_token, "r1");
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0]!.debit_cents, 135000); // the DB figure, verbatim
  assert.equal(r.lines[1]!.credit_cents, 135000);
  assert.equal(r.vendor?.disposition, "new");
  const res = resolveReviewHydration(r, null);
  assert.equal(res.kind, "draft"); // renders the full card path, unchanged
});

test("a defensively-degraded payload (entry id, status key renamed) stays 'draft' — no false receipt", () => {
  const r = toDraftReview({ entry: { id: "e1" } });
  assert.ok(r, "an entry with an id still maps (defensive degradation)");
  assert.equal(r.status, "unknown");
  assert.equal(resolveReviewHydration(r, null).kind, "draft");
  assert.equal(settledFromStatus("unknown"), null);
});

// --- (3) settled + bridge available → a TRUE terminal receipt --------------------

test("settledFromDiff reads the LAST revision's header.status (the DB's word)", () => {
  const s = settledFromDiff(toEntryDiff(APPROVED_DIFF_RAW));
  assert.ok(s, "an approved walk must resolve a settled state");
  assert.equal(s.status, "approved");
  assert.equal(s.at, "2026-07-02T03:00:00Z");
  assert.equal(s.actor_kind, "human");
});

test("settledFromDiff refuses to call a still-draft or empty walk settled", () => {
  const draftLast = { ...APPROVED_DIFF_RAW, revisions: [APPROVED_DIFF_RAW.revisions[0]] };
  assert.equal(settledFromDiff(toEntryDiff(draftLast)), null); // scope miss, not settled
  assert.equal(settledFromDiff(toEntryDiff({ entry_id: "e1", revisions: [] })), null);
  const headerless = { entry_id: "e1", revisions: [{ ...APPROVED_DIFF_RAW.revisions[1], header: null }] };
  assert.equal(settledFromDiff(toEntryDiff(headerless)), null);
});

test("null hydration + bridge → settled; the receipt renders the terminal wording", () => {
  const bridge = settledFromDiff(toEntryDiff(APPROVED_DIFF_RAW));
  const res = resolveReviewHydration(null, bridge);
  assert.equal(res.kind, "settled");
  if (res.kind !== "settled") return;
  const html = renderToStaticMarkup(createElement(JeSettledReceipt, { entryId: "e1e2e3e4-0000", settled: res.settled, review: res.review }));
  assert.ok(html.includes("Approved — the entry is posted with filing-bound provenance."), "approved wording must render");
  assert.ok(!html.includes("unknown"), "the fabricated shell's 'unknown' must never render");
  assert.ok(!html.includes("RM"), "the receipt renders no fabricated RM figure");
});

test("a withdrawn terminal state renders the discard wording", () => {
  const html = renderToStaticMarkup(createElement(JeSettledReceipt, {
    entryId: "e1e2e3e4-0000",
    settled: { status: "withdrawn", at: null, actor_kind: null, reason: null },
    review: null,
  }));
  assert.ok(html.includes("Draft discarded."), "withdrawn wording must render");
});

test("an unforeseen settled status renders honestly by name", () => {
  assert.equal(settledReceiptCopy("reversed"), "Settled — reversed.");
});

// --- (4) settled + nothing → the honest shell ------------------------------------

test("null hydration + no bridge → gone; the honest shell renders (never RM 0.00)", () => {
  const res = resolveReviewHydration(null, null);
  assert.equal(res.kind, "gone");
  const html = renderToStaticMarkup(createElement(JeSettledShell, { entryId: "e1e2e3e4-0000" }));
  assert.ok(html.includes(SETTLED_GONE_COPY), "the honest settled shell must render");
  assert.ok(!html.includes("RM"), "the shell renders no fabricated figure");
  assert.ok(!html.includes("unknown"), "the shell never claims an 'unknown' status");
});

// --- (5) forward-compatible: the 0016 slim settled payload, used directly ---------

test("a future slim settled payload resolves settled directly — no bridge needed", () => {
  const r = toDraftReview({ entry: { id: "e1", status: "approved" } });
  assert.ok(r, "the slim payload must map");
  assert.equal(r.status, "approved");
  const res = resolveReviewHydration(r, null); // bridge never consulted
  assert.equal(res.kind, "settled");
  if (res.kind !== "settled") return;
  assert.equal(res.settled.status, "approved");
  assert.equal(res.review, r); // the card uses the hydrated payload directly
});
