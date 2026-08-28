// GATE (c) — keyboard-walk tests for T6's journals-half governance doors: the
// WITHDRAW dialog (the highest-risk keyboard surface in the product, per the
// P3 workbench lesson — a dialog a keyboard walk once found six
// permanently-unopenable instances of) and the interruptions ANSWER flow.
// journals-keyboard.test.tsx's own precedent for the harness/assertions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { DraftsQueuePanel } from "./drafts-queue-panel";
import { InterruptionsPanel } from "./interruptions-panel";
import type { JournalEntryRow, JournalLineRow, ReviewQueueRow, CoaAccountRow } from "../../lib/journals/types";
import type { AgentInterruptionRow } from "../../lib/journals/types";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

/** `h.find` only walks `h.container` — DialogPortal renders into
 *  document.body instead, outside it (close-keyboard.test.tsx's own
 *  precedent, whose header explains why an open base-ui Dialog runs cleanly
 *  in this harness at all). This is the same walk, over any root. */
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: "c1", account_code: "1000", name: "Cash", account_type: "asset", is_active: true },
];
const DRAFT_ENTRY: JournalEntryRow = {
  id: "je-1", client_id: "c1", status: "draft", posting_date: "2026-04-01", memo: "April supplies",
  origin: "manual", document_id: null, coding_kind: null, revision_token: "rev-1",
  maker_actor: "user-1", checker_actor: null, approved_at: null, reversal_of: null, reversed_by: null,
  reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-04-01T00:00:00Z",
};
const DRAFT_LINES: JournalLineRow[] = [
  { id: "l1", entry_id: "je-1", line_no: 1, account_code: "1000", debit_cents: 10000, credit_cents: 0, description: "Supplies", counterparty_id: null },
];
const QUEUE_ROW: ReviewQueueRow = {
  row_kind: "draft", section: "needs_review", sort: [], client_id: "c1", entry_id: "je-1",
  document_id: null, filing_id: null, lane: "needs_review", high_stakes: false, aged_since: null,
  amount_cents: 10000, period: "2026-04", created_at: "2026-04-01T00:00:00Z", id: "je-1", coding_kind: null,
};

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

test("WITHDRAW journey: from an expanded draft, the Withdraw dialog opens, its reason field and Confirm/Cancel are keyboard-reachable with focus visible", async () => {
  const h = await renderComponent(
    App(
      createElement(DraftsQueuePanel, {
        clientId: "c1",
        queueRows: [QUEUE_ROW], queueCounts: { open_drafts: 1 }, entries: [DRAFT_ENTRY], lines: DRAFT_LINES,
        linesTruncated: false, accounts: ACCOUNTS, busy: false, err: null, clr: null, actingId: null,
        onApprove: () => {}, onRevise: () => {}, onApproveRoutine: () => {}, onWithdraw: async () => {},
      }),
    ),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();

    const rowToggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("April supplies"));
    assert.ok(rowToggle, "the draft row's own toggle must render");
    await h.fireEvent(rowToggle!, "click");
    await h.settle();

    // Both new T6 controls are reachable in the expanded, collapsed (default) view.
    const approveRoutine = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Approve \(routine\)$/) !== null);
    assert.ok(approveRoutine, "the Approve (routine) button must render");
    const withdrawTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Withdraw$/) !== null);
    assert.ok(withdrawTrigger, "the Withdraw dialog trigger must render as a real button");
    assert.ok(focusableElements(h.container as never).includes(withdrawTrigger as never), "Withdraw trigger must be keyboard-reachable");

    await h.fireEvent(withdrawTrigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();
    assert.match(textOf(body as never), /Withdraw this draft/, "activating the trigger must open the dialog (portaled to document.body)");

    const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
    assert.ok(reasonField, "the withdrawal reason field must render as a real <textarea>");
    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Withdraw draft$/) !== null);
    const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(confirmButton, "the dialog's own confirm control must render");
    assert.ok(cancelButton, "the dialog's own cancel control must render");

    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations in the open dialog");

    (reasonField as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), reasonField, "focusing the reason field must move document.activeElement to it");

    await h.fireEvent(cancelButton as never, "click");
    for (let i = 0; i < 10; i++) await h.settle();
    const withdrawTriggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Withdraw$/) !== null);
    assert.ok(
      withdrawTriggerAfterClose && focusableElements(h.container as never).includes(withdrawTriggerAfterClose as never),
      "the trigger must be reachable again after the dialog closes",
    );
  } finally {
    await h.unmount();
    const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
    if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
  }
});

const INTERRUPTION: AgentInterruptionRow = {
  id: "i1", task_id: "t1", kind: "clarify", question: { text: "Which account for this line?" },
  answer: null, status: "pending", asked_of: null, answered_by: null,
  expires_at: "2026-04-01T01:00:00Z", created_at: "2026-04-01T00:00:00Z", answered_at: null,
};

test("ANSWER journey: the clarification's answer field and submit control are keyboard-reachable with focus visible", async () => {
  const h = await renderComponent(
    App(createElement(InterruptionsPanel, { interruptions: [INTERRUPTION], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {} })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const answerField = h.find((n) => n.tagName === "TEXTAREA");
    assert.ok(answerField, "the answer field must render as a real <textarea>");
    assert.ok(
      focusableElements(h.container as never).includes(answerField as never),
      "the answer field must be keyboard-reachable",
    );

    // The submit control is correctly DISABLED (unreachable) until the field
    // carries text — checked as its own fact, not skipped past.
    const submitDisabledInitially = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Answer$/) !== null);
    assert.ok(submitDisabledInitially, "the Answer submit control must render even while disabled");
    assert.ok(
      !focusableElements(h.container as never).includes(submitDisabledInitially as never),
      "the Answer submit control must NOT be keyboard-reachable while the field is empty",
    );

    (answerField as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), answerField, "focusing the answer field must move document.activeElement to it");
    await h.act(() => { setFieldValue(answerField as never, "the cash account"); });

    const submitButton = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Answer$/) !== null);
    assert.ok(submitButton, "the Answer submit control must still render once enabled");
    assert.ok(
      focusableElements(h.container as never).includes(submitButton as never),
      "the Answer submit control must become keyboard-reachable once the field carries text",
    );
    assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations");
  } finally {
    await h.unmount();
  }
});
