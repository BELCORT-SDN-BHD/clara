// #946 (0297_payroll_summary_posting.sql, riders wave 4 lane 01) — the TWELFTH review-queue row
// kind, `payroll_posting_blocked`, and the four places a kind has to land in before a
// professional can see it.
//
// THE SEAM: the three lib-side modules the DB row passes through on its way to the inbox —
// `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind` (the closed world every label lookup is
// gated on), `needsYouRowHref` / `hasOwningTab` (where the row opens), and
// `getNeedsYouAffordance` (what, if anything, it can act on inline). The DB half is proven
// against a real queue read in `packages/db/tests/payroll-summary-posting.test.mjs`; this file
// is about the web side's own closed registries, which are hand-written and would otherwise
// silently drop a kind the database ships.
//
// WHY A SEPARATE FILE rather than four more cells in `needs-you.test.ts` and
// `needs-you-links.test.ts`: four lanes edit `lib/firm/needs-you.ts` in this wave, and every
// hunk one of them adds to a shared TEST file is a conflict the integrator resolves by hand.
// The kind's own cells live in the kind's own file; the two shared files gain only the one-line
// registry additions they must.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REVIEW_QUEUE_ROW_KINDS, isKnownReviewQueueRowKind } from "./needs-you";
import { hasOwningTab, needsYouRowHref } from "./needs-you-links";
import { getNeedsYouAffordance } from "@/components/firm/needs-you-affordances";
import messages from "../../messages/en.json" with { type: "json" };

const CLIENT = "33333333-3333-4333-8333-333333333333";
const KIND = "payroll_posting_blocked";

test("#946: the blocked-payroll row kind is inside the closed world the label lookup is gated on", () => {
  assert.ok(
    (REVIEW_QUEUE_ROW_KINDS as readonly string[]).includes(KIND),
    "a kind the database emits but this array does not carry renders with no label and no affordance",
  );
  assert.equal(isKnownReviewQueueRowKind(KIND), true);
  // The world is still CLOSED: adding one kind admits exactly one.
  assert.equal(isKnownReviewQueueRowKind("payroll_posting"), false);
});

test("#946: it carries a real label and a real openTab phrase, never a raw key path", () => {
  const m = messages as unknown as {
    NeedsYou: { rowKind: Record<string, string>; openTab: Record<string, string> };
  };
  assert.equal(typeof m.NeedsYou.rowKind[KIND], "string");
  assert.ok((m.NeedsYou.rowKind[KIND] ?? "").length > 0);
  assert.match(
    m.NeedsYou.rowKind[KIND]!,
    /payroll/i,
    "the label names what the row is about — a professional reads it before anything else on the row",
  );
  assert.equal(typeof m.NeedsYou.openTab[KIND], "string");
  assert.ok((m.NeedsYou.openTab[KIND] ?? "").length > 0);
});

test("#946: it opens the documents tab — where the payslip that did not post is", () => {
  // The row is about ONE document that was read and did not post, so the documents tab is where
  // a person goes: to look at the page the two readings disagreed about, or to re-file it once
  // the missing account exists. Its verbs are not on the journals workbench — there is no entry
  // yet, which is the whole point of the row.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: CLIENT }), `/clients/${CLIENT}/documents`);
  assert.equal(hasOwningTab({ row_kind: KIND }), true);
  // A row with no client has nowhere honest to go, exactly like every other kind.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: null }), null);
});

test("#946: it renders NO inline act — the reason sentence and the link are the whole affordance", () => {
  // Every condition this row reports is cleared somewhere else: the chart door adds a missing
  // account, the document page shows the page whose readings disagreed, the journals workbench
  // holds the entry a duplicate points at. There is no act that belongs ON the row, and the
  // posting lane has no "post it anyway" door by design — nothing is posted on a guess.
  assert.equal(getNeedsYouAffordance(KIND), null, "a KNOWN kind with no inline act");
  assert.notEqual(getNeedsYouAffordance(KIND), undefined, "…never an unknown one");
});
