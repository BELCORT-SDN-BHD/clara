// #947 (0298_payroll_net_pay_settlement.sql, riders wave 4 lane 01) — the THIRTEENTH review-queue
// row kind, `payroll_net_pay_unsettled`, and the four places a kind has to land in before a
// professional can see it.
//
// THE SEAM: the three lib-side modules the DB row passes through on its way to the inbox —
// `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind` (the closed world every label lookup is
// gated on), `needsYouRowHref` / `hasOwningTab` (where the row opens), and
// `getNeedsYouAffordance` (what, if anything, it can act on inline). The DB half is proven
// against a real queue read in `packages/db/tests/payroll-settlement.test.mjs` (S6); this file is
// about the web side's own closed registries, which are hand-written and would otherwise silently
// drop a kind the database ships.
//
// WHY A SEPARATE FILE, same reason #946's own payroll-posting file gives: four lanes edit
// `lib/firm/needs-you.ts` this wave, and every hunk one of them adds to a shared TEST file is a
// conflict the integrator resolves by hand.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REVIEW_QUEUE_ROW_KINDS, isKnownReviewQueueRowKind } from "./needs-you";
import { hasOwningTab, needsYouRowHref } from "./needs-you-links";
import { getNeedsYouAffordance } from "@/components/firm/needs-you-affordances";
import messages from "../../messages/en.json" with { type: "json" };

const CLIENT = "44444444-4444-4444-8444-444444444444";
const KIND = "payroll_net_pay_unsettled";

test("#947: the unsettled-net-pay row kind is inside the closed world the label lookup is gated on", () => {
  assert.ok(
    (REVIEW_QUEUE_ROW_KINDS as readonly string[]).includes(KIND),
    "a kind the database emits but this array does not carry renders with no label and no affordance",
  );
  assert.equal(isKnownReviewQueueRowKind(KIND), true);
  // The world is still CLOSED: adding one kind admits exactly one.
  assert.equal(isKnownReviewQueueRowKind("payroll_net_pay"), false);
});

test("#947: it carries a real label and a real openTab phrase, never a raw key path", () => {
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

test("#947: it opens the bank tab — where a person finds and accepts the payment", () => {
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: CLIENT }), `/clients/${CLIENT}/bank`);
  assert.equal(hasOwningTab({ row_kind: KIND }), true);
  // A row with no client has nowhere honest to go, exactly like every other kind.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: null }), null);
});

test("#947: it renders NO inline act — accepting a candidate names ONE specific bank line, which the row itself cannot carry", () => {
  // The row is fixed-shape (one row, no per-candidate slot); the bank tab's Matching view is
  // where `PayrollSettlementsSection` renders every candidate with its own Accept button.
  assert.equal(getNeedsYouAffordance(KIND), null, "a KNOWN kind with no inline act");
  assert.notEqual(getNeedsYouAffordance(KIND), undefined, "…never an unknown one");
});
