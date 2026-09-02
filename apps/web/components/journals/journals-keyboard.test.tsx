// GATE (c) — keyboard-walk tests for the journals APPROVE and REVIEW
// journeys (owner ruling Q7). See test/keyboardWalk.ts's header for exactly
// what this environment can and cannot prove about real key-event
// dispatch, and why activation via a proven-native control's `click` event
// is the honest substitute here.
//
// APPROVE journey: reach a draft row -> open its detail -> reach the
// Approve control, all keyboard-operable, in DOM tab order, keeping focus
// visible. REVIEW journey: from the same detail, reach the Revise control
// and confirm the revision editor's own fields are keyboard-operable too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { DraftsQueuePanel } from "./drafts-queue-panel";
import type { JournalEntryRow, JournalLineRow, ReviewQueueRow, CoaAccountRow } from "../../lib/journals/types";

enableDomInspection();

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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(DraftsQueuePanel, {
      clientId: "c1",
      queueRows: [QUEUE_ROW], queueCounts: { open_drafts: 1 }, entries: [DRAFT_ENTRY], lines: DRAFT_LINES,
      linesTruncated: false, accounts: ACCOUNTS, busy: false, err: null, clr: null, actingId: null,
      onApprove: () => {}, onRevise: () => {},
      onApproveRoutine: () => {}, onWithdraw: async () => {},
    }),
  });
}

test("APPROVE journey: the draft row is reachable, expandable by keyboard-operable activation, and the Approve control is then reachable with focus visible", async () => {
  const h = await renderComponent(App());
  try {
    for (let i = 0; i < 2; i++) await h.settle();

    // Step 1: reach the draft row's own toggle button.
    const step1 = focusableElements(h.container as never);
    assert.equal(step1.length, 1, "collapsed, only the row's own toggle button is reachable");
    const rowToggle = step1[0]!;
    assert.equal((rowToggle as unknown as { tagName?: string }).tagName, "BUTTON", "the row toggle must be a real, natively-operable <button>");

    // Step 2: activate it (a real <button>'s Enter/Space press dispatches
    // exactly this click event at the browser level).
    await h.fireEvent(rowToggle as never, "click");
    await h.settle();
    assert.match(h.text(), /Approve/i, "expanding must reach the Approve control");

    // Step 3: the Approve control (and everything else the detail reveals)
    // is keyboard-operable, in DOM order, with no tabindex/focus-ring
    // violations anywhere in the now-expanded tree.
    const approveButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Approve$/i) !== null);
    assert.ok(approveButton, "the Approve button must render as a real <button>");
    const step3 = focusableElements(h.container as never);
    assert.ok(step3.includes(approveButton as never), "the Approve button must be in the reachable set");
    assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations anywhere in the expanded tree");

    // Step 4: a keyboard focus arrival on the Approve control actually
    // moves document.activeElement (domInspect.ts's own `.focus()` addition
    // — a real, checkable fact, not assumed).
    (approveButton as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), approveButton, "focusing the Approve button must move document.activeElement to it");
  } finally {
    await h.unmount();
  }
});

test("REVIEW journey: from the same expanded draft, the Revise control is reachable and leads to a fully keyboard-operable revision editor", async () => {
  const h = await renderComponent(App());
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const rowToggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("April supplies"));
    assert.ok(rowToggle, "the row toggle must render");
    await h.fireEvent(rowToggle!, "click");
    await h.settle();

    const reviseButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Revise$/i) !== null);
    assert.ok(reviseButton, "the Revise button must render as a real <button>");
    assert.ok(focusableElements(h.container as never).includes(reviseButton as never), "Revise must be keyboard-reachable");

    await h.fireEvent(reviseButton!, "click");
    await h.settle();
    assert.match(h.text(), /Save revision/i, "activating Revise must reach the revision editor");

    const editorInputs = focusableElements(h.container as never).filter((n) => (n as unknown as { tagName?: string }).tagName === "INPUT");
    assert.ok(editorInputs.length >= 2, "the revision editor's own account/description inputs must be keyboard-reachable");
    const debitMoneyInput = editorInputs.find((n) => (
      n as unknown as { getAttribute?: (name: string) => string | null }
    ).getAttribute?.("aria-label") === "Debit");
    assert.ok(debitMoneyInput, "the migrated shared debit MoneyInput must be keyboard-reachable in this real revision door");
    (debitMoneyInput as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), debitMoneyInput, "keyboard focus must land on the migrated money input itself");

    const saveButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Save revision$/i) !== null);
    const cancelButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Cancel$/i) !== null);
    assert.ok(saveButton && focusableElements(h.container as never).includes(saveButton as never), "Save revision must be keyboard-reachable");
    assert.ok(cancelButton && focusableElements(h.container as never).includes(cancelButton as never), "Cancel must be keyboard-reachable");

    assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations in the revision editor");
  } finally {
    await h.unmount();
  }
});
