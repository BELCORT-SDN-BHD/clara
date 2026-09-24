// #949 (0300_tenancy_terms_rent_plan.sql, riders wave 4 lane 01) — the FIFTEENTH and SIXTEENTH
// review-queue row kinds, `rent_payable_unsettled` and `rent_escalation_pending`, and the four
// places a kind has to land in before a professional can see it.
//
// THE SEAM: the three lib-side modules the DB row passes through on its way to the inbox —
// `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind` (the closed world every label lookup is
// gated on), `needsYouRowHref` / `hasOwningTab` (where the row opens), and
// `getNeedsYouAffordance` (what, if anything, it can act on inline). The DB half is proven
// against a real queue read in `packages/db/tests/tenancy-rent-plan.test.mjs` (S9); this file is
// about the web side's own closed registries, which are hand-written and would otherwise
// silently drop a kind the database ships.
//
// WHY A SEPARATE FILE rather than more cells in `needs-you.test.ts` and `needs-you-links.test.ts`:
// four lanes edit `lib/firm/needs-you.ts` in this wave, and every hunk one of them adds to a
// shared TEST file is a conflict the integrator resolves by hand. The kind's own cells live in
// the kind's own file; the two shared files gain only the one-line registry additions they must.
// #946's `needs-you-payroll-posting.test.ts` set that pattern in this same lane.
//
// WHY TWO KINDS IN ONE TICKET. AC4 and AC6 are two different questions a person answers
// differently — one accepts a settlement candidate on the bank surface, the other confirms a
// plan revision on the contract page — so folding them into one kind would leave the label, the
// link and the affordance all guessing which. They are appended contiguously, in one hunk.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REVIEW_QUEUE_ROW_KINDS, isKnownReviewQueueRowKind } from "./needs-you";
import { hasOwningTab, needsYouRowHref } from "./needs-you-links";
import { getNeedsYouAffordance } from "@/components/firm/needs-you-affordances";
import messages from "../../messages/en.json" with { type: "json" };

const CLIENT = "55555555-5555-4555-8555-555555555555";
const SETTLEMENT = "rent_payable_unsettled";
const ESCALATION = "rent_escalation_pending";

test("#949: both rent row kinds are inside the closed world the label lookup is gated on", () => {
  for (const kind of [SETTLEMENT, ESCALATION]) {
    assert.ok(
      (REVIEW_QUEUE_ROW_KINDS as readonly string[]).includes(kind),
      `a kind the database emits but this array does not carry renders with no label and no affordance: ${kind}`,
    );
    assert.equal(isKnownReviewQueueRowKind(kind), true);
  }
  // The world is still CLOSED: adding two kinds admits exactly two.
  assert.equal(isKnownReviewQueueRowKind("rent_payable"), false);
  assert.equal(isKnownReviewQueueRowKind("rent_escalation"), false);
  assert.equal(isKnownReviewQueueRowKind("contract_terms"), false, "the RECORD is not a row kind");
});

test("#949: each carries a real label and a real openTab phrase, never a raw key path", () => {
  const m = messages as unknown as {
    NeedsYou: { rowKind: Record<string, string>; openTab: Record<string, string> };
  };
  for (const kind of [SETTLEMENT, ESCALATION]) {
    assert.equal(typeof m.NeedsYou.rowKind[kind], "string");
    assert.ok((m.NeedsYou.rowKind[kind] ?? "").length > 0);
    assert.equal(typeof m.NeedsYou.openTab[kind], "string");
    assert.ok((m.NeedsYou.openTab[kind] ?? "").length > 0);
  }
  assert.match(
    m.NeedsYou.rowKind[SETTLEMENT]!,
    /rent/i,
    "the label names what the row is about — a professional reads it before anything else on the row",
  );
  assert.match(m.NeedsYou.rowKind[ESCALATION]!, /rent/i);
  assert.notEqual(
    m.NeedsYou.rowKind[SETTLEMENT],
    m.NeedsYou.rowKind[ESCALATION],
    "two different questions read as two different sentences",
  );
});

test("#949: the unpaid month opens the bank tab, and the escalation opens the documents tab", () => {
  // The settlement row's act is on the bank surface: find the line that paid the rent and accept
  // it. The escalation row's act is on the contract page: read what the tenancy says and confirm
  // the revision. They are different places because they are different decisions.
  assert.equal(needsYouRowHref({ row_kind: SETTLEMENT, client_id: CLIENT }), `/clients/${CLIENT}/bank`);
  assert.equal(needsYouRowHref({ row_kind: ESCALATION, client_id: CLIENT }), `/clients/${CLIENT}/documents`);
  assert.equal(hasOwningTab({ row_kind: SETTLEMENT }), true);
  assert.equal(hasOwningTab({ row_kind: ESCALATION }), true);
  // A row with no client has nowhere honest to go, exactly like every other kind.
  assert.equal(needsYouRowHref({ row_kind: SETTLEMENT, client_id: null }), null);
  assert.equal(needsYouRowHref({ row_kind: ESCALATION, client_id: null }), null);
});

test("#949: neither renders an inline act — the sentence and the link are the whole affordance", () => {
  // Accepting a settlement candidate names a SPECIFIC bank line among however many a month
  // offers, which the inbox row's own fixed shape (one row, no per-candidate slot) cannot carry
  // — #947's own reasoning, and this row is the same shape. Confirming an escalation needs the
  // accountant's written judgement, because a stepped rent always makes the lessee branch ask,
  // and a free-text judgement is not a click.
  for (const kind of [SETTLEMENT, ESCALATION]) {
    assert.equal(getNeedsYouAffordance(kind), null, `a KNOWN kind with no inline act: ${kind}`);
    assert.notEqual(getNeedsYouAffordance(kind), undefined, "…never an unknown one");
  }
});
