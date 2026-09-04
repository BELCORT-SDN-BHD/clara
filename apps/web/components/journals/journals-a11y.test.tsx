// GATE (b) — structural a11y scan of the journals drafts/posted panels (owner
// ruling Q7). See test/domInspect.ts's header for why this rides a
// hand-written rule engine (test/a11yRules.ts) rather than real axe-core.
//
// DraftsQueuePanel/PostedPanel take fixed props (no self-fetch) — the same
// fixture-mounting pattern components/close/close-components.test.tsx uses.
// The drafts panel is scanned TWICE: collapsed (the queue row only) and
// EXPANDED (clicking the row, exactly like a real user, to reach the
// approve/revise detail — the same surface gate (c)'s keyboard walk exercises).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import messages from "../../messages/en.json";
import { DraftsQueuePanel } from "./drafts-queue-panel";
import { PostedPanel } from "./posted-panel";
import type { JournalEntryRow, JournalLineRow, ReviewQueueRow, CoaAccountRow } from "../../lib/journals/types";

enableDomInspection();

/** The subset of the live-mounted stub node this file reads — `getAttribute`
 *  and `querySelectorAll` come from test/domInspect.ts's `enhanceElement`,
 *  which the call above installs. */
type El = { getAttribute(name: string): string | null; querySelectorAll(selector: string): El[] };

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: "c1", account_code: "1000", name: "Cash", account_type: "asset", is_active: true },
  { client_id: "c1", account_code: "5000", name: "Expenses", account_type: "expense", is_active: true },
];

const DRAFT_ENTRY: JournalEntryRow = {
  id: "je-1", client_id: "c1", status: "draft", posting_date: "2026-04-01", memo: "April supplies",
  origin: "manual", document_id: null, coding_kind: null, revision_token: "rev-1",
  maker_actor: "user-1", checker_actor: null, approved_at: null, reversal_of: null, reversed_by: null,
  reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-04-01T00:00:00Z",
};

const DRAFT_LINES: JournalLineRow[] = [
  { id: "l1", entry_id: "je-1", line_no: 1, account_code: "5000", debit_cents: 10000, credit_cents: 0, description: "Supplies", counterparty_id: null },
  { id: "l2", entry_id: "je-1", line_no: 2, account_code: "1000", debit_cents: 0, credit_cents: 10000, description: null, counterparty_id: null },
];

const QUEUE_ROW: ReviewQueueRow = {
  row_kind: "draft", section: "needs_review", sort: [], client_id: "c1", entry_id: "je-1",
  document_id: null, filing_id: null, lane: "needs_review", high_stakes: false, aged_since: null,
  amount_cents: 10000, period: "2026-04", created_at: "2026-04-01T00:00:00Z", id: "je-1", coding_kind: null,
};

const POSTED_ENTRY: JournalEntryRow = {
  ...DRAFT_ENTRY, id: "je-2", status: "approved", approved_at: "2026-04-02T00:00:00Z", memo: "Posted rent",
};
const POSTED_LINES: JournalLineRow[] = [
  { id: "l3", entry_id: "je-2", line_no: 1, account_code: "5000", debit_cents: 20000, credit_cents: 0, description: "Rent", counterparty_id: null },
  { id: "l4", entry_id: "je-2", line_no: 2, account_code: "1000", debit_cents: 0, credit_cents: 20000, description: null, counterparty_id: null },
];

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

test("journals drafts queue (collapsed) has zero violations", async () => {
  const h = await renderComponent(
    App(
      createElement(DraftsQueuePanel, {
        clientId: "c1",
        queueRows: [QUEUE_ROW], queueCounts: { open_drafts: 1 }, entries: [DRAFT_ENTRY], lines: DRAFT_LINES,
        linesTruncated: false, accounts: ACCOUNTS, busy: false, err: null, clr: null, actingId: null,
        onApprove: () => {}, onRevise: () => {},
        onApproveRoutine: () => {}, onWithdraw: async () => {},
      }),
    ),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("journals drafts queue EXPANDED (approve/revise detail visible) has zero violations", async () => {
  const h = await renderComponent(
    App(
      createElement(DraftsQueuePanel, {
        clientId: "c1",
        queueRows: [QUEUE_ROW], queueCounts: { open_drafts: 1 }, entries: [DRAFT_ENTRY], lines: DRAFT_LINES,
        linesTruncated: false, accounts: ACCOUNTS, busy: false, err: null, clr: null, actingId: null,
        onApprove: () => {}, onRevise: () => {},
        onApproveRoutine: () => {}, onWithdraw: async () => {},
      }),
    ),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const rowToggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("April supplies"));
    assert.ok(rowToggle, "the draft row's own toggle button must render");
    await h.fireEvent(rowToggle!, "click");
    await h.settle();
    assert.match(h.text(), /Approve/i, "expanding the row must reach the Approve control");
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

function postedPanel() {
  return createElement(PostedPanel, {
    clientId: "c1",
    entries: [POSTED_ENTRY], lines: POSTED_LINES, linesTruncated: false, entriesTruncated: false,
    accounts: ACCOUNTS, busy: false, err: null, clr: null, actingId: null, onReverse: () => {},
  });
}

test("journals posted panel has zero violations", async () => {
  const h = await renderComponent(App(postedPanel()));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

// The FIRST aria-sort in the product (measured while building the table: a grep
// for aria-sort across apps/web returned only test/a11yRules.ts's attribute
// allow-list), so it gets its own cell rather than riding on the scan above —
// the scan checks that attributes are KNOWN and well-formed, never that the
// one this table depends on is present at all.
test("the entries table names itself and marks its sorted column with aria-sort", async () => {
  const h = await renderComponent(App(postedPanel()));
  try {
    for (let i = 0; i < 2; i++) await h.settle();

    const table = h.find((n) => n.tagName === "TABLE") as El | null;
    assert.ok(table, "the posted tab must render a real <table>");
    assert.equal(table!.getAttribute("aria-label"), "Journal entries", "the table carries an accessible name");

    const headers = (h.container as unknown as El).querySelectorAll("th");
    const sortStates = headers.map((th) => th.getAttribute("aria-sort"));
    // Exactly ONE column is the active sort, and it is the default the table
    // opens on (posting_date, descending) — the fix for the read ordering by
    // created_at while the panel rendered posting_date.
    assert.equal(sortStates.filter((s) => s === "descending").length, 1, JSON.stringify(sortStates));
    assert.equal(sortStates.filter((s) => s === "ascending").length, 0, JSON.stringify(sortStates));
    const active = headers.find((th) => th.getAttribute("aria-sort") === "descending");
    assert.match(textOf(active as never), /Posting date/);

    // Every sortable header holds a real button, so it is a tab stop.
    const sortable = headers.filter((th) => th.getAttribute("aria-sort") !== null);
    assert.ok(sortable.length >= 4, `expected several sortable headers, saw ${sortable.length}`);
    for (const th of sortable) {
      assert.ok(th.querySelectorAll("button").length === 1, `sortable header ${textOf(th as never)} must hold exactly one <button>`);
    }
  } finally {
    await h.unmount();
  }
});
