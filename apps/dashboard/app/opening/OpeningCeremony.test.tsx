// OpeningCeremony render tests (createElement + renderToStaticMarkup, no jsdom). Locks
// F-C3: a reopened seed carrying BOTH correction-linked drafts AND plain additive drafts
// must show the honest "approve each set separately" guidance (a mixed approval would
// finalize the seed with drafts stranded). The disable of the approval verb is enforced
// by `approveDisabled` (which folds in `mixed`) and the pure `ceremonyIsMixed` (tested in
// openingModel.test.ts); a static render always sees the ack unchecked, so this test locks
// the visible guidance surface, which appears ONLY on a mixed set.
//
// 0018 §5: the post-approval receipt is persisted, not auto-forwarded to onFinalized (the
// unmount-race fix). OpeningCeremony's own async onApprove() → setReceipt() transition is
// not exercisable in this no-jsdom harness (no simulated clicks/async), so the observable
// unit under test is the extracted, pure `OpeningApprovalReceiptView` it delegates to —
// every field DB-authored, a Done/Reload action, never a bare "it just reloaded" silence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpeningCeremony, OpeningApprovalReceiptView } from "./OpeningCeremony";
import type { OpeningSeedRow, ApprovalSetEntry, ApprovalReceipt } from "./openingModel";
import { shortId } from "../shared/fmt";

function mkSeed(p: Partial<OpeningSeedRow> = {}): OpeningSeedRow {
  return {
    id: "seed-1", client_id: "c1", plan_id: "pl1", as_of: "2026-06-30", state: "open",
    tie_document_id: null, tie_document_sha256: null, batch_n: 1, finalized_at: null, created_at: null, ...p,
  };
}
function mkEntry(p: Partial<ApprovalSetEntry>): ApprovalSetEntry {
  return {
    entry_id: "e1", revision_token: "r1", maker: "u1", posting_date: "2026-06-30", memo: null,
    is_reversal: false, item_kind: "gl_balance", item_key: "k1", supersedes_item_id: null, ...p,
  };
}

test("F-C3: a mixed correction+additive draft set shows the honest 'approve separately' guidance", () => {
  const html = renderToStaticMarkup(createElement(OpeningCeremony, {
    token: "jwt",
    seed: mkSeed(),
    entries: [mkEntry({ entry_id: "a" }), mkEntry({ entry_id: "b", is_reversal: true, item_kind: null, item_key: null })],
    dry: null,
    planRevision: "rev1",
    onFinalized: () => {},
  }));
  assert.ok(html.includes("separately"), "the honest guidance to approve each set separately renders");
  assert.ok(html.includes("stranded"), "it explains the mixed-approval hazard (drafts stranded)");
});

test("F-C3: a clean additive draft set shows NO mixed guidance", () => {
  const html = renderToStaticMarkup(createElement(OpeningCeremony, {
    token: "jwt",
    seed: mkSeed(),
    entries: [mkEntry({ entry_id: "a" }), mkEntry({ entry_id: "c" })],
    dry: null,
    planRevision: "rev1",
    onFinalized: () => {},
  }));
  assert.ok(!html.includes("would finalize the seed with drafts"), "no mixed guidance for a clean additive set");
});

// --- 0018 §5: the persisted approval receipt (the unmount-race fix) --------------

function mkReceipt(p: Partial<ApprovalReceipt> = {}): ApprovalReceipt {
  return { seed_id: "seed-1", status: "finalized", batch_n: 2, entry_count: 2, entries: ["entry-aaaaaaaa", "entry-bbbbbbbb"], ...p };
}

test("0018: the receipt view renders the DB-authored counts verbatim (never entries.length recomputed) with a Done/Reload action", () => {
  const receipt = mkReceipt({ entry_count: 2 });
  const html = renderToStaticMarkup(createElement(OpeningApprovalReceiptView, { receipt, kind: "initial", onDone: () => {} }));
  assert.ok(html.includes("Opening carry-down approved"));
  assert.ok(html.includes("Posted 2 entries in batch 2"), "entry_count/batch_n render verbatim");
  assert.ok(html.includes("status") && html.includes("finalized"));
  assert.ok(html.includes(shortId("entry-aaaaaaaa")) && html.includes(shortId("entry-bbbbbbbb")), "every posted entry id renders");
  assert.match(html, /<button[^>]*>Done<\/button>/, "a Done action exists");
  assert.match(html, /<button[^>]*>Reload<\/button>/, "a Reload action exists");
});

test("0018: a correction receipt uses the correction heading; a singular entry_count reads 'entry' not 'entries'", () => {
  const html = renderToStaticMarkup(createElement(OpeningApprovalReceiptView, {
    receipt: mkReceipt({ entry_count: 1, entries: ["entry-aaaaaaaa"] }),
    kind: "correction",
    onDone: () => {},
  }));
  assert.ok(html.includes("Opening correction approved"));
  assert.ok(html.includes("Posted 1 entry in batch 2"), "singular noun, not '1 entries'");
});
