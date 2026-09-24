// #948 (0299_agreement_contract_acquisition.sql, riders wave 4 lane 01) — the FOURTEENTH
// review-queue row kind, `agreement_posting_blocked`, and the four places a kind has to land in
// before a professional can see it.
//
// THE SEAM: the three lib-side modules the DB row passes through on its way to the inbox —
// `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind` (the closed world every label lookup is
// gated on), `needsYouRowHref` / `hasOwningTab` (where the row opens), and
// `getNeedsYouAffordance` (what, if anything, it can act on inline). The DB half is proven
// against a real queue read in `packages/db/tests/agreement-contract-acquisition.test.mjs` (S10);
// this file is about the web side's own closed registries, which are hand-written and would
// otherwise silently drop a kind the database ships.
//
// WHY A SEPARATE FILE rather than more cells in `needs-you.test.ts` and `needs-you-links.test.ts`:
// four lanes edit `lib/firm/needs-you.ts` in this wave, and every hunk one of them adds to a
// shared TEST file is a conflict the integrator resolves by hand. The kind's own cells live in
// the kind's own file; the two shared files gain only the one-line registry additions they must.
// #946's `needs-you-payroll-posting.test.ts` set that pattern in this same lane.

import assert from "node:assert/strict";
import { test } from "node:test";

import { REVIEW_QUEUE_ROW_KINDS, isKnownReviewQueueRowKind } from "./needs-you";
import { hasOwningTab, needsYouRowHref } from "./needs-you-links";
import { getNeedsYouAffordance } from "@/components/firm/needs-you-affordances";
import messages from "../../messages/en.json" with { type: "json" };

const CLIENT = "44444444-4444-4444-8444-444444444444";
const KIND = "agreement_posting_blocked";

test("#948: the blocked-agreement row kind is inside the closed world the label lookup is gated on", () => {
  assert.ok(
    (REVIEW_QUEUE_ROW_KINDS as readonly string[]).includes(KIND),
    "a kind the database emits but this array does not carry renders with no label and no affordance",
  );
  assert.equal(isKnownReviewQueueRowKind(KIND), true);
  // The world is still CLOSED: adding one kind admits exactly one.
  assert.equal(isKnownReviewQueueRowKind("agreement_posting"), false);
  assert.equal(isKnownReviewQueueRowKind("agreement_contract"), false, "the DOCUMENT KIND is not a row kind");
});

test("#948: it carries a real label and a real openTab phrase, never a raw key path", () => {
  const m = messages as unknown as {
    NeedsYou: { rowKind: Record<string, string>; openTab: Record<string, string> };
  };
  assert.equal(typeof m.NeedsYou.rowKind[KIND], "string");
  assert.ok((m.NeedsYou.rowKind[KIND] ?? "").length > 0);
  assert.match(
    m.NeedsYou.rowKind[KIND]!,
    /agreement/i,
    "the label names what the row is about — a professional reads it before anything else on the row",
  );
  assert.equal(typeof m.NeedsYou.openTab[KIND], "string");
  assert.ok((m.NeedsYou.openTab[KIND] ?? "").length > 0);
});

test("#948: it opens the documents tab — where the agreement that did not post is", () => {
  // The row is about ONE document that was read and did not post: the page whose two readings
  // disagreed, the agreement to re-file once the missing account exists, or a tenancy whose terms
  // were read and which will never post at all. Its verbs are not on the journals workbench —
  // there is no entry yet, which is the whole point of the row.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: CLIENT }), `/clients/${CLIENT}/documents`);
  assert.equal(hasOwningTab({ row_kind: KIND }), true);
  // A row with no client has nowhere honest to go, exactly like every other kind.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: null }), null);
});

test("#948: it renders NO inline act — the reason sentence and the link are the whole affordance", () => {
  // Every condition this row reports is cleared somewhere else: the chart door adds a missing
  // account, the fixed-assets register enrols the account the asset belongs to, the document page
  // shows the page whose readings disagreed, the journals workbench holds the entry a duplicate
  // points at. There is no act that belongs ON the row, and the posting lane has no "post it
  // anyway" door by design — nothing in this lane is posted on a guess. A non-financing
  // agreement's row has no act at all by construction: there is nothing to post, and the row
  // exists to say so.
  assert.equal(getNeedsYouAffordance(KIND), null, "a KNOWN kind with no inline act");
  assert.notEqual(getNeedsYouAffordance(KIND), undefined, "…never an unknown one");
});
