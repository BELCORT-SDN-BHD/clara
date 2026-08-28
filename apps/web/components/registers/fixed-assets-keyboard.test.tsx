// GATE (c) — keyboard-walk tests for T3's fixed-asset door dialogs (owner
// ruling Q7). The P3 workbench lesson: a keyboard gate once found SIX
// permanently-unopenable doors five code reviews missed — every door dialog
// in this train gets one of these. Mirrors components/close/
// close-keyboard.test.tsx's own idiom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { CompleteParticularsDialog, DisposeDialog } from "./fa-row-actions";
import type { FixedAssetRow } from "@/lib/registers/fixed-assets";
import type { AccountRow } from "@/lib/registers/accounts";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

const ASSET: FixedAssetRow = {
  id: "a1", description: "Delivery van", status: "pending", particulars_complete: false,
  acquired_date: "2026-01-15", effective_from: "2026-01-15", cost_cents: 8000000, residual_cents: null,
  accumulated_cents: null, nbv_cents: null, method: null, rate_bps: null, useful_life_months: null,
  start_date: null, asset_account: "1500", accum_account: null, expense_account: null, ca_class: null,
  is_commercial_vehicle: null, is_new: null, superseded_by_asset_id: null, disposed_at: null,
  disposal_entry_id: null, uncharged_due_count: 0, split_month_advisory_count: 0,
  disposal_draft_outstanding: false, disposal_draft_entry_id: null,
};
const ACCOUNTS: AccountRow[] = [
  { account_code: "1500", name: "Office equipment", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "4900", name: "Gain on disposal", account_type: "income", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "5900", name: "Loss on disposal", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

function withProvider(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

test("Complete-particulars dialog: trigger is enabled from first render (no fields to gate it on before it opens), reaches its fields, and closes back to a reachable trigger", async () => {
  const h = await renderComponent(
    withProvider(createElement(CompleteParticularsDialog, { clientId: "c1", asset: ASSET, accounts: ACCOUNTS, busy: false, act: async () => true })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(trigger, "the trigger must render as a real <button>");
    assert.equal((trigger as unknown as { disabled: boolean }).disabled, false, "the trigger must be enabled before any input — it gates nothing reachable only inside itself");
    assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

    (trigger as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger");

    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const methodSelect = findIn(body as never, (n) => n.tagName === "SELECT");
    assert.ok(methodSelect, "the dialog must reach the particulars form (a real <select> for method)");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Complete particulars") && (n as unknown) !== (trigger as unknown));
    assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
    assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled until the particulars are complete (no method chosen yet) — the trigger itself is never this gate");

    const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
    assert.ok(cancelButton, "the Cancel control must render as a real <button>");
    await h.fireEvent(cancelButton as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
    assert.ok(
      triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
      "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
    );
  } finally {
    await h.unmount();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});

test("Dispose dialog: every field (date, proceeds, account selects, memo, cost portion) is keyboard-reachable and Confirm is gated on the required fields, not the trigger", async () => {
  const h = await renderComponent(
    withProvider(createElement(DisposeDialog, { clientId: "c1", asset: { ...ASSET, status: "active", particulars_complete: true }, accounts: ACCOUNTS, busy: false, act: async () => true })),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Dispose"));
    assert.ok(trigger, "the Dispose trigger must render");
    assert.equal((trigger as unknown as { disabled: boolean }).disabled, false, "the trigger is enabled from first render");

    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const selects = findAll(body as never, (n) => n.tagName === "SELECT");
    assert.equal(selects.length, 3, "proceeds/gain/loss account pickers must all render as real <select> elements");
    for (const s of selects) assert.ok(focusableElements(body as never).includes(s as never), "every account select must be keyboard-reachable");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

    const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Dispose") && (n as unknown) !== (trigger as unknown));
    assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
    assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled until the required fields (date, gain, loss account) are filled");
  } finally {
    await h.unmount();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});

function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  if (predicate(root)) out.push(root);
  for (const c of root.childNodes ?? []) out.push(...findAll(c, predicate));
  return out;
}
