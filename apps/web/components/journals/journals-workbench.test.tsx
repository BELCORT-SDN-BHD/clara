// #719 leftover — WHICH TAB AN ACTIVITY LINK OPENS ON.
//
// THE DEFECT THIS CELL FENCES, end to end. `activityJournalsHref`
// (lib/firm/activity.ts:470) emits `/clients/:id/journals?entry=<id>` with no
// `?tab=`; the workbench opened on Drafts unless `?tab=` said otherwise; and the
// addressed read lives in `PostedPanel` (`initialEntryId`, rendered only on the
// posted tab). So the feed's own entry links landed a reader on a tab that never
// looked at the id they arrived with — the link changed tabs and nothing else.
//
// WHY THE RULE IS TESTED HERE AND NOT THROUGH A MOUNT. `JournalsWorkbench` self-
// hydrates through `useJournalsWorkbench` (session accessor, four doors, two
// parallel reads), so mounting it to read one initial `useState` would be a
// fixture for the loader, not for the rule. `openingJournalsTab` is the whole
// decision, exported so it can be stated once and checked directly; the browser
// leg (`e2e/activity-feed-walk.spec.ts`, "#719: an entry row's object link lands
// on the ENTRY") is what proves the rule reaches a real screen.

import { test } from "node:test";
import assert from "node:assert/strict";

import { openingJournalsTab } from "./journals-workbench";

test("issue 719: an ?entry= with no ?tab= opens on POSTED, where the addressed read lives", () => {
  assert.equal(openingJournalsTab(undefined, "je-1"), "posted");
});

test("no ?entry= and no ?tab= keeps the tab's own default, Drafts", () => {
  assert.equal(openingJournalsTab(undefined, ""), "drafts");
});

test("an explicit ?tab= always wins — it is the reader's own request, entry or not", () => {
  assert.equal(openingJournalsTab("drafts", "je-1"), "drafts", "?tab=drafts&entry= stays on drafts");
  assert.equal(openingJournalsTab("clarifications", "je-1"), "clarifications");
  assert.equal(openingJournalsTab("posted", ""), "posted");
});
