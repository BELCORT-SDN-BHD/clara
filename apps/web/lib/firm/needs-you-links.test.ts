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
  // `seeding_proposal` is one row per CLIENT (裁-17, 0146), not one per object. Sending it to a
  // tab would be a guess; the root is the honest destination and the label follows it, so a
  // click's destination is never oversold.
  for (const kind of ["seeding_proposal"]) {
    assert.equal(needsYouRowHref(row(kind)), `/clients/${CLIENT}`);
    assert.equal(hasOwningTab(row(kind)), false);
  }
});

// --- #659: the two repoints ------------------------------------------------------------------

test("ticket 659: a compliance_watch row opens the TAX tab, where the three acts are actually mounted", () => {
  // The old destination was the workspace root, under a comment claiming the watch "renders on
  // the firm admin compliance surface, which is NOT client-scoped". That stopped being true when
  // `components/tax/SstWatchSection.tsx` began mounting `ComplianceWatchAffordance` on
  // `/clients/:id/tax` — acknowledge, snooze and resolve are one click from there.
  assert.equal(needsYouRowHref(row("compliance_watch")), `/clients/${CLIENT}/tax`);
  assert.equal(hasOwningTab(row("compliance_watch")), true, "and the LABEL says which tab it opens");
});

test("ticket 659 (fix round 1, A1): a work_question row keeps the workspace ROOT — the queue row cannot address its Work", () => {
  // THE REPOINT THIS TICKET SHIPPED AND THIS FIX WITHDREW. The brief instructed
  // `work_question` -> `workDetailHref(row.client_id, row.task_id)` on the premise that "the row
  // carries the parked run in task_id". The premise is true; the conclusion is not. `task_id` is
  // an `agent_tasks` id — `list_review_queue` selects `wqi.task_id` while the accounting Work
  // reaches the row only through `join clara.accounting_work wqw on wqw.id = wqi.work_id`, a
  // DIFFERENT column that the row does not publish. `/clients/:id/work/<agent_task_id>` therefore
  // resolves nothing: `loadWorkDetail` -> `getAccountingWork` returns null for an id that is not an
  // `accounting_work.id` (lib/work/reads.ts).
  //
  // MEASURED ON A REAL ROW, not asserted here against a uuid this file made up — which is exactly
  // how the original cell passed while the link was broken. `packages/db/tests/firm-portfolio-pack
  // .test.mjs`'s `p659.links.work_question_row_cannot_address_its_work` opens a real question
  // through the real doors and asserts `row.task_id !== work.id`, plus that NO field of the row
  // carries the Work id. When that last assertion reds, the deep link has become buildable and
  // this cell is the other half of the change.
  const TASK = "33333333-3333-4333-8333-333333333333";
  assert.equal(
    needsYouRowHref({ ...row("work_question"), task_id: TASK }),
    `/clients/${CLIENT}`,
    "the honest destination is the workspace root, as it was before this ticket",
  );
  assert.equal(hasOwningTab({ row_kind: "work_question" }), false,
    "and the LABEL says 'Open the client', so a click's destination is never oversold");
  // The id is not merely unused — it must not reach a path at all.
  assert.doesNotMatch(needsYouRowHref({ ...row("work_question"), task_id: TASK }) ?? "", /work/);
});

test("ticket 659: the repointed kind resolves to a REAL message key, so no raw next-intl path reaches the eye", async () => {
  // `oldest-waiting-list.tsx` renders `t(\`openTab.${row.row_kind}\`)` whenever `hasOwningTab` is
  // true. Before this ticket `NeedsYou.openTab` carried seven keys and `compliance_watch` was not
  // among them, so the repoint alone would have shipped a key path to a professional.
  const messages = (await import("../../messages/en.json", { with: { type: "json" } })).default as {
    NeedsYou: { openTab: Record<string, string> };
  };
  const label = messages.NeedsYou.openTab.compliance_watch;
  assert.equal(typeof label, "string", "NeedsYou.openTab.compliance_watch must exist");
  assert.ok((label ?? "").length > 0, "NeedsYou.openTab.compliance_watch must not be empty");
  // And the key for the WITHDRAWN repoint is gone with it: `hasOwningTab` answers false for
  // `work_question`, so this label could only ever have been a promise nothing renders.
  assert.equal(messages.NeedsYou.openTab.work_question, undefined,
    "a label for a destination this build does not offer is a claim with no referent");
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
  // COMPARED AS PATHS, with any `?tab=` dropped from BOTH sides. #614 gave the
  // registers workbench four named views in the navigation registry
  // (`/registers?tab=aging`, `…=fixedAssets`, `…=adjustments`, `…=accounts`),
  // so `CLIENT_ROUTES` now carries the VIEW where it used to carry the bare
  // path. A deep link from a Needs-you row still points at the workbench and
  // still lands on it — the workbench falls back to its own default tab — so
  // the claim this cell makes is about the route the app serves, and that is
  // what it now compares. A row that pointed at a path with no page at all is
  // still caught, which is the defect it was minted for.
  const pathOf = (href: string) => href.split(/[?#]/, 1)[0]!;
  const served = new Set(CLIENT_ROUTES.map((route) => pathOf(route.href(CLIENT))));
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
