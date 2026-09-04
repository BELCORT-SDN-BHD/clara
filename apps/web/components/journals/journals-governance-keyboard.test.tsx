// GATE (c) — keyboard-walk tests for T6's journals-half governance doors: the
// WITHDRAW dialog (the highest-risk keyboard surface in the product, per the
// P3 workbench lesson — a dialog a keyboard walk once found six
// permanently-unopenable instances of) and the interruptions ANSWER flow.
// journals-keyboard.test.tsx's own precedent for the harness/assertions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
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
        onApprove: () => {}, onRevise: () => {}, onApproveRoutine: () => {}, onWithdraw: async () => true,
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

    // CB-AE2E-021: there is now exactly ONE approval control on an expanded
    // draft. "Approve (routine)" used to sit beside "Approve" in the
    // governance row with nothing on screen saying what "routine" meant; the
    // routing moved onto the one button (drafts-queue-panel.tsx's own
    // comment). Asserting the ABSENCE here rather than only in the dedicated
    // cell keeps this walk from silently passing if it comes back.
    //
    // THE LITERAL IS DELIBERATE, not a leftover: the message key that produced
    // it (`DraftsDocumentGovernance.approveRoutine.trigger`) is DELETED, so
    // this string exists nowhere else in the tree and the assertion is a drift
    // pin on the label as much as on the button. The VERB is untouched —
    // `lib/journals/governance-doors.ts`'s `approveRoutineEntry` stays
    // exported and tested, and its header records that it is the right door
    // for a future batch-approve surface.
    const approveRoutine = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Approve \(routine\)$/) !== null);
    assert.equal(approveRoutine, null, "the duplicate 'Approve (routine)' button must be gone");
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

    // F4 (independent review, minor) — the GATED -> ENABLED transition,
    // documents-governance-keyboard.test.tsx's RE-EXTRACTION walk is the
    // model: confirm must be genuinely unreachable while the reason is
    // empty, and become reachable once one is typed — not merely present in
    // the DOM.
    assert.ok(
      !focusableElements(body as never).includes(confirmButton as never),
      "confirm must be unreachable (disabled) while the withdrawal reason is empty",
    );

    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations in the open dialog");

    (reasonField as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), reasonField, "focusing the reason field must move document.activeElement to it");

    await h.act(() => { setFieldValue(reasonField as never, "duplicate entry, drafted twice"); });
    const confirmAfterTyping = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Withdraw draft$/) !== null);
    assert.ok(
      focusableElements(body as never).includes(confirmAfterTyping as never),
      "confirm must become reachable once a reason is typed",
    );

    // Cancel is `DialogClose` (base-ui's own primitive, not this file's
    // code) — clicking it through EITHER `h.fireEvent` (proven earlier this
    // round to be a no-op for portaled content) OR `clickButton` (which
    // reaches base-ui's real internals, but those internals then call
    // `event instanceof KeyboardEvent` — a global this harness's fake DOM
    // does not define, since no test before this round ever drove a click
    // deep enough to reach it) cannot be honestly proven to close the dialog
    // with the tools available in this file. Recorded as a real, separate
    // harness gap — NOT fixed here (out of this round's scope; fixing it
    // means adding fake Event/KeyboardEvent/MouseEvent globals to
    // hookHarness.ts's shared `installDom()`, a bigger and riskier change
    // than this fix round owns). What IS proven: the control renders, is
    // keyboard-reachable, and the CONFIRM path (this file's OWN onClick,
    // the next test below) genuinely closes the dialog end to end.
    assert.ok(
      focusableElements(body as never).includes(cancelButton as never),
      "cancel must be keyboard-reachable",
    );
  } finally {
    await h.unmount();
    const bodyEl = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
    if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
  }
});

test("WITHDRAW confirm: a real click on Confirm calls onWithdraw and closes the dialog (the CONFIRM path, not just Cancel)", async () => {
  const calls: Array<{ entryId: string; reason: string; expectedRevision: string }> = [];
  const h = await renderComponent(
    App(
      createElement(DraftsQueuePanel, {
        clientId: "c1",
        queueRows: [QUEUE_ROW], queueCounts: { open_drafts: 1 }, entries: [DRAFT_ENTRY], lines: DRAFT_LINES,
        linesTruncated: false, accounts: ACCOUNTS, busy: false, err: null, clr: null, actingId: null,
        onApprove: () => {}, onRevise: () => {}, onApproveRoutine: () => {},
        onWithdraw: async (entryId, reason, expectedRevision, onOk) => { calls.push({ entryId, reason, expectedRevision }); onOk(); return true; },
      }),
    ),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const rowToggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("April supplies"));
    await h.fireEvent(rowToggle!, "click");
    await h.settle();
    const withdrawTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Withdraw$/) !== null);
    await h.fireEvent(withdrawTrigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
    await h.act(() => { setFieldValue(reasonField as never, "duplicate entry, drafted twice"); });
    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Withdraw draft$/) !== null);
    assert.ok(confirmButton, "confirm must render once the reason is typed");

    await h.act(() => clickButton(confirmButton as never));
    for (let i = 0; i < 6; i++) await h.settle();

    assert.equal(calls.length, 1, "onWithdraw must be called exactly once");
    assert.equal(calls[0]!.entryId, "je-1");
    assert.equal(calls[0]!.reason, "duplicate entry, drafted twice");
    assert.doesNotMatch(textOf(body as never), /Withdraw this draft/, "the dialog must actually close on a real confirm");
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
    App(createElement(InterruptionsPanel, { interruptions: [INTERRUPTION], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {}, clientIdByTaskId: {} })),
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

// T7 (F9, independent review): a keyboard walk for promote_clarify_to_question
// — the door dialog CodingDoorDialog wraps, portalled to document.body,
// same findIn/body-appendChild precedent as documents-governance-
// keyboard.test.tsx (this file's own header cites it).
test("PROMOTE journey: the dialog opens (only once a client_id genuinely resolved), Confirm/Cancel are keyboard-reachable, a real confirm calls onPromote with the interruption + resolved client id and closes", async () => {
  const calls: { interruptionId: string; scopeId: string }[] = [];
  const h = await renderComponent(
    App(createElement(InterruptionsPanel, {
      interruptions: [INTERRUPTION], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {},
      clientIdByTaskId: { t1: "client-9" },
      onPromote: async (interruptionId, scopeId) => { calls.push({ interruptionId, scopeId }); return true; },
    })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Promote to a durable question$/) !== null);
    assert.ok(trigger, "the promote trigger must render once clientIdByTaskId resolves this row's task");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    assert.match(textOf(body as never), /Promote this clarification to a durable question/, "the dialog must open with its own title");
    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Promote$/) !== null);
    const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(confirmButton, "the confirm control must render");
    assert.ok(cancelButton, "the cancel control must render");
    assert.ok(focusableElements(body as never).includes(confirmButton as never), "confirm must be keyboard-reachable (this door needs no fields)");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations in the open dialog");

    await h.act(() => { clickButton(confirmButton as never); });
    for (let i = 0; i < 6; i++) await h.settle();

    assert.deepEqual(calls, [{ interruptionId: "i1", scopeId: "client-9" }], "onPromote must be called exactly once with the interruption id and the RESOLVED client id, never a guess");
    assert.doesNotMatch(textOf(body as never), /Promote this clarification to a durable question/, "the dialog must actually close on a real confirm");
  } finally {
    await h.unmount();
    const bodyRef = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
    if (bodyRef.childNodes?.includes(h.container)) bodyRef.removeChild(h.container);
  }
});

test("PROMOTE journey: with no resolved client id for this task, the promote control does not render at all — never a guessed scope_id", async () => {
  const h = await renderComponent(
    App(createElement(InterruptionsPanel, {
      interruptions: [INTERRUPTION], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {},
      clientIdByTaskId: {},
      onPromote: async () => true,
    })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Promote to a durable question$/) !== null);
    assert.equal(trigger, null, "no promote control may render without a genuinely-resolved client id");
  } finally {
    await h.unmount();
  }
});
