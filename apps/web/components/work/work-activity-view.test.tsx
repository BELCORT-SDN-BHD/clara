// #770 — the Work detail's ACTIVITY view after the door gained `p_work` (migration 0202).
//
// The ONE behaviour this cell exists for: the view no longer narrows `page.rows` by `work_id` in
// the browser. That filter was the whole reason the panel could say "no activity" about a Work
// whose rows simply sat further down the client's feed, and the door now answers this Work's own
// history. So a page whose rows the door returned is rendered AS RETURNED — asserted by feeding
// the injected loader a row this component would previously have hidden.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import type { ActivityPage, ActivityRow } from "../../lib/firm/activity";
import { WorkActivityView } from "./work-activity-view";

enableDomInspection();

const CLIENT = "11111111-1111-4111-8111-111111111111";
const WORK = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "r1", source: "operation_receipt", event_type: "journal_entry",
    description: "A posting this Work produced", client_id: CLIENT, client_name: null,
    actor: null, on_behalf_of: null, via_wake_kind: null,
    occurred_at: "2026-09-01T02:00:00.000Z", object_kind: "entry", object_id: null,
    work_id: WORK, receipt_id: "rc1", document_id: null, original_entry_id: null,
    replacement_entry_id: null, status: "approved", kind: "work",
    ...over,
  } as ActivityRow;
}

function App(children: unknown) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children: children as never,
  });
}

test("WorkActivityView renders every row the door returned — no client-side work_id filter survives", async () => {
  const page: ActivityPage = {
    // The SECOND row carries a work_id this view would have discarded before #770. The door is
    // the authority now: whatever a p_work page returns is this Work's history, and a browser
    // that second-guessed it would hide a row the server already said belongs here.
    rows: [row(), row({ id: "r2", description: "A row the old client-side filter hid", work_id: null })],
    next_cursor: null,
    truncated: false,
  };
  const view = await renderComponent(
    App(createElement(WorkActivityView, { clientId: CLIENT, workId: WORK, load: async () => page })),
  );
  const text = textOf(view.container);
  assert.match(text, /A posting this Work produced/, "the door's first row renders");
  assert.match(text, /A row the old client-side filter hid/,
    "…and so does a row whose work_id the old browser-side filter would have rejected");
  view.unmount();
});

test("WorkActivityView asks the door for THIS Work: the injected loader is the production read's stand-in, and the empty state no longer counts scanned rows", async () => {
  const empty: ActivityPage = { rows: [], next_cursor: null, truncated: false };
  const view = await renderComponent(
    App(createElement(WorkActivityView, { clientId: CLIENT, workId: WORK, load: async () => empty })),
  );
  const text = textOf(view.container);
  assert.match(text, /No activity recorded for this work yet/, "the empty state stands");
  assert.doesNotMatch(text, /most recent events for this client/,
    "…and it no longer explains how far the browser looked: the door answered for this Work, not for the client");
  assert.doesNotMatch(text, /\{scanned\}/, "no unsubstituted ICU placeholder survives in the copy");
  view.unmount();
});
