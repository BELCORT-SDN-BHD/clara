// OpeningCeremony render tests (createElement + renderToStaticMarkup, no jsdom). Locks
// F-C3: a reopened seed carrying BOTH correction-linked drafts AND plain additive drafts
// must show the honest "approve each set separately" guidance (a mixed approval would
// finalize the seed with drafts stranded). The disable of the approval verb is enforced
// by `approveDisabled` (which folds in `mixed`) and the pure `ceremonyIsMixed` (tested in
// openingModel.test.ts); a static render always sees the ack unchecked, so this test locks
// the visible guidance surface, which appears ONLY on a mixed set.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpeningCeremony } from "./OpeningCeremony";
import type { OpeningSeedRow, ApprovalSetEntry } from "./openingModel";

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
