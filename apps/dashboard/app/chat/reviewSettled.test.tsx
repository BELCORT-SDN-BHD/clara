// §6.1 terminal-state hydration tests (Wave A2.1, reworked post-review). The bug: a
// settled entry's get_draft_review returns SQL NULL and toDraftReview FABRICATED a
// status-'unknown' DraftReview (empty lines, RM 0.00 totals, dead buttons). These
// tests pin the fix: (1) toDraftReview(null) → null, never a fabrication; (2) a
// draft payload still maps exactly as today; (3) null hydration resolves the honest
// no-claim shell DIRECTLY — there is NO bridge fetch (no writer records a terminal
// revision, so a revision walk can prove nothing; the module exports no bridge);
// (4) a hydrated non-draft status (the 0016 slim settled payload) resolves a TRUE
// terminal receipt with the DB's approved_at/withdrawn_at/actor/reason rendered.
// Pure model + static render (test/bootstrap.mjs stubs CSS; no DB, no effects).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { toDraftReview } from "./review";
import * as settledState from "../shared/settledState";
import { resolveReviewHydration, settledFromReview, settledReceiptCopy, REVIEW_GONE_COPY } from "../shared/settledState";
import { JeSettledReceipt, JeReviewGoneShell } from "./JeSettledCard";

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
  assert.equal(r.approved_at, null); // terminal metadata absent on a live draft
  const res = resolveReviewHydration(r);
  assert.equal(res.kind, "draft"); // renders the full card path, unchanged
});

test("a defensively-degraded payload (entry id, status key renamed) stays 'draft' — no false receipt", () => {
  const r = toDraftReview({ entry: { id: "e1" } });
  assert.ok(r, "an entry with an id still maps (defensive degradation)");
  assert.equal(r.status, "unknown");
  assert.equal(resolveReviewHydration(r).kind, "draft");
  assert.equal(settledFromReview(r), null);
});

// --- (3) null hydration → the honest shell DIRECTLY (no bridge exists) -----------

test("null hydration resolves gone directly — the module exports no bridge fetch", () => {
  assert.equal(resolveReviewHydration(null).kind, "gone");
  // The dead-code bridge (get_entry_diff never sees a terminal revision) is GONE:
  assert.ok(!("getSettledState" in settledState), "no bridge fetch may exist");
  assert.ok(!("settledFromDiff" in settledState), "no revision-walk mapper may exist");
});

test("the gone shell claims nothing unproven (no 'Settled', no RM, no 'unknown')", () => {
  const html = renderToStaticMarkup(createElement(JeReviewGoneShell, { entryId: "e1e2e3e4-0000" }));
  assert.ok(html.includes(REVIEW_GONE_COPY), "the honest shell copy must render");
  assert.ok(!REVIEW_GONE_COPY.toLowerCase().includes("settled"), "the shell must not claim a settled status");
  assert.ok(!html.includes("RM"), "the shell renders no fabricated figure");
  assert.ok(!html.includes("unknown"), "the shell never claims an 'unknown' status");
});

// --- (4) the 0016 slim settled payload → a TRUE terminal receipt -----------------

test("a slim approved payload resolves settled with approved_at/checker_actor mapped", () => {
  const r = toDraftReview({ entry: { id: "e1", status: "approved", approved_at: "2026-07-02T03:00:00Z", checker_actor: "u1u2u3u4-0000" } });
  assert.ok(r, "the slim payload must map");
  const res = resolveReviewHydration(r);
  assert.equal(res.kind, "settled");
  if (res.kind !== "settled") return;
  assert.equal(res.settled.status, "approved");
  assert.equal(res.settled.at, "2026-07-02T03:00:00Z"); // approved_at, not dropped
  assert.equal(res.settled.actor, "u1u2u3u4-0000");
  assert.equal(res.review, r); // the card uses the hydrated payload directly
  const html = renderToStaticMarkup(createElement(JeSettledReceipt, { entryId: "e1e2e3e4-0000", settled: res.settled, review: res.review }));
  assert.ok(html.includes("Approved — the entry is posted with filing-bound provenance."), "approved wording must render");
  assert.ok(html.includes("2026"), "the DB timestamp must render");
  assert.ok(html.includes("u1u2u3u4"), "the DB actor must render");
  assert.ok(!html.includes("unknown"), "the fabricated shell's 'unknown' must never render");
  assert.ok(!html.includes("RM"), "the receipt renders no fabricated RM figure");
});

test("a slim withdrawn payload maps withdrawn_at/withdrawn_by/withdrawal_reason and renders", () => {
  const r = toDraftReview({ entry: { id: "e1", status: "withdrawn", withdrawn_at: "2026-07-03T04:00:00Z", withdrawn_by: "w1w2w3w4-0000", withdrawal_reason: "duplicate bill" } });
  assert.ok(r, "the slim payload must map");
  const s = settledFromReview(r);
  assert.ok(s, "withdrawn must resolve settled");
  assert.equal(s.at, "2026-07-03T04:00:00Z");
  assert.equal(s.actor, "w1w2w3w4-0000");
  assert.equal(s.reason, "duplicate bill");
  const html = renderToStaticMarkup(createElement(JeSettledReceipt, { entryId: "e1e2e3e4-0000", settled: s, review: r }));
  assert.ok(html.includes("Draft discarded."), "withdrawn wording must render");
  assert.ok(html.includes("duplicate bill"), "the DB withdrawal reason must render");
});

test("an unforeseen settled status renders honestly by name", () => {
  assert.equal(settledReceiptCopy("reversed"), "Settled — reversed.");
});

// --- the receipt copy is the single source (the in-session outcome reuses it) ----

test("settledReceiptCopy carries the in-session outcome wording verbatim", () => {
  assert.equal(settledReceiptCopy("approved"), "Approved — the entry is posted with filing-bound provenance.");
  assert.equal(settledReceiptCopy("withdrawn"), "Draft discarded.");
});
