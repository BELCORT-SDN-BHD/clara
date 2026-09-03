// 裁-17 ④ — an inbox row opens the tab that OWNS it.
//
// The cell that matters most is the LAST one: every href this module can emit is a path
// `CLIENT_ROUTES` already serves, and `routes.test.ts` proves that list against the real
// `app/` tree. Without it, this map could name `/clients/<id>/drafts` — a plausible tab that
// does not exist — and every other cell here would still be green, because they only compare
// this module against itself. That is the exact shape of the `/inbox` defect
// `lib/command/routes.ts`'s own header records.

import assert from "node:assert/strict";
import { test } from "node:test";

import { hasOwningTab, needsYouRowHref, owningTabSuffixes } from "./needs-you-links";
import { REVIEW_QUEUE_ROW_KINDS } from "./needs-you";
import { CLIENT_ROUTES } from "@/lib/command/routes";

const CLIENT = "22222222-2222-4222-8222-222222222222";
const row = (row_kind: string, client_id: string | null = CLIENT) => ({ row_kind, client_id });

test("each row kind opens the tab that owns its verbs", () => {
  assert.equal(needsYouRowHref(row("draft")), `/clients/${CLIENT}/journals`);
  assert.equal(needsYouRowHref(row("uncoded_filing")), `/clients/${CLIENT}/documents`);
  assert.equal(needsYouRowHref(row("coding_task")), `/clients/${CLIENT}/documents`);
  assert.equal(needsYouRowHref(row("open_question")), `/clients/${CLIENT}/documents`);
  assert.equal(needsYouRowHref(row("lint_finding")), `/clients/${CLIENT}/journals`);
  assert.equal(needsYouRowHref(row("fixed_asset_incomplete")), `/clients/${CLIENT}/registers`);
  assert.equal(needsYouRowHref(row("staff_advance_incomplete")), `/clients/${CLIENT}/registers`);
});

test("a row with no owning tab keeps the workspace root, and SAYS it is the root", () => {
  // `seeding_proposal` is one row per CLIENT (裁-17, 0146), not one per object, and
  // `compliance_watch` is settled on a FIRM admin surface with no client tab at all. Sending
  // either to a tab would be a guess; the root is the honest destination and the label
  // follows it, so a click's destination is never oversold.
  for (const kind of ["seeding_proposal", "compliance_watch"]) {
    assert.equal(needsYouRowHref(row(kind)), `/clients/${CLIENT}`);
    assert.equal(hasOwningTab(row(kind)), false);
  }
});

test("an UNKNOWN row kind degrades to the root rather than throwing or guessing", () => {
  // A tenth row_kind the DB ships before this file learns it behaves exactly as every row
  // did before P6-5 — no crash, no invented tab.
  assert.equal(needsYouRowHref(row("a_tenth_kind_nobody_has_written_yet")), `/clients/${CLIENT}`);
  assert.equal(hasOwningTab(row("a_tenth_kind_nobody_has_written_yet")), false);
  // Prototype-pollution shapes are keys too: `constructor` must not resolve through the
  // prototype chain into a function, and `?? ""` is what keeps that from becoming a path.
  assert.equal(needsYouRowHref(row("constructor")), `/clients/${CLIENT}`);
  assert.equal(hasOwningTab(row("constructor")), false, "an inherited property is not a registered tab");
  assert.equal(hasOwningTab(row("toString")), false);
});

test("a row with no client has NOWHERE honest to go, so it gets no link", () => {
  // Every destination is under `/clients/<id>`; without one there is no page. A firm-altitude
  // row therefore renders no link rather than a broken one.
  assert.equal(needsYouRowHref(row("draft", null)), null);
  assert.equal(needsYouRowHref(row("seeding_proposal", null)), null);
});

test("every emitted href is a path CLIENT_ROUTES actually serves", () => {
  const served = new Set(CLIENT_ROUTES.map((route) => route.href(CLIENT)));
  for (const kind of REVIEW_QUEUE_ROW_KINDS) {
    const href = needsYouRowHref(row(kind));
    assert.ok(href, `${kind} resolves to a path`);
    assert.ok(
      served.has(href),
      `${kind} -> ${href} must be a real client-workspace route (CLIENT_ROUTES is proven against the app/ tree by routes.test.ts)`,
    );
  }
  // And the same both ways for the raw suffix set, so a tab RENAMED in routes.ts cannot leave
  // a stale suffix here that no row kind currently exercises.
  for (const suffix of owningTabSuffixes()) {
    assert.ok(served.has(`/clients/${CLIENT}${suffix}`), `the suffix "${suffix}" names a live tab`);
  }
});
