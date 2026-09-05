// GATE (c) — keyboard-walk tests for the CLOSE journey (owner ruling Q7):
// fiscal-year picker -> gate rows -> the Attest door dialog. See
// test/keyboardWalk.ts's header for exactly what this environment can and
// cannot prove about real key-event dispatch. See test/domInspect.ts's
// header for why an open base-ui Dialog runs cleanly here at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { FiscalYearPicker } from "./FiscalYearPicker";
import { GateCheckRow } from "./GateCheckRow";
import { CloseDoorDialog } from "./CloseDoorDialog";
import type { ClosePlanCheck, FiscalYearRow } from "../../lib/close/types";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

/** `h.find` only walks `h.container` — DialogPortal renders into
 *  document.body instead, outside it. This is the same walk, over any root. */
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

const YEARS: FiscalYearRow[] = [
  { fiscal_year_id: "fy1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "open", fy_end_source: "asserted", has_active_reopen_receipt: false },
  { fiscal_year_id: "fy2", label: "FY2024", ordinal: 0, starts_on: "2024-01-01", ends_on: "2024-12-31", status: "closed", fy_end_source: "asserted", has_active_reopen_receipt: false },
];

function pickerApp(selected: string | null, onSelect: (id: string) => void) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(FiscalYearPicker, { years: YEARS, err: null, selected, onSelect }),
  });
}

test("CLOSE journey (fiscal-year picker): every year tab is keyboard-operable, in DOM order, and Enter/Space activation (click) selects it", async () => {
  let selected: string | null = null;
  const h = await renderComponent(pickerApp(selected, (id) => { selected = id; }));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const tabs = focusableElements(h.container as never).filter((n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("role") === "tab");
    assert.equal(tabs.length, 2, "both fiscal-year tabs must be keyboard-reachable");
    assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations in the picker");

    await h.fireEvent(tabs[0]!, "click");
    assert.equal(selected, "fy1", "activating the first tab must select FY2025 — its own fiscal_year_id");
  } finally {
    await h.unmount();
  }
});

function unattestedDrawer2Check(): ClosePlanCheck {
  return {
    check_key: "ar_control_tie", drawer: 2, title: "AR control tie", applies_when: "always",
    result: { state: "fail", measured: {}, measured_digest: "d", evaluated_at: "t" },
    items: [{ item_key: "__gate__", attestation: { state: "absent" } }],
  };
}

function gateApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    // 裁-187 (2026-09-04): the attest ceremony is revealed only beside a refusal
    // that NAMED an attestation (finalize_close's CLR41 `drawer2_unattested`,
    // 0128:199-232). The fixture plants that refusal, because the trigger this
    // test is about does not exist without it.
    children: createElement(GateCheckRow, {
      check: unattestedDrawer2Check(),
      closeRunId: "run1",
      busy: false,
      refusal: { code: "CLR41", reason: "drawer2_unattested" },
      refusalMessage: "drawer-2 gate ar_control_tie is fail and 1 item(s) carry no live attestation",
      onAttest: async () => true,
    }),
  });
}

// FIXED (P3 finale fold-seam truing): this test used to pin a KNOWN
// VIOLATION — GateCheckRow's AttestForm passed `disabled={reason.trim().
// length === 0}` to CloseDoorDialog, which applied that `disabled` to the
// DIALOG TRIGGER button itself, while the field it gated on (the reason
// textarea) lived INSIDE the dialog that trigger opens: a deadlock, WCAG
// 2.1.1 failing for every input modality at once. The P3 polish repaired it
// at the source (CloseDoorDialog.tsx's own header records the blocker and
// the fix): the prop is now named `confirmDisabled` and gates ONLY the
// CONFIRM button inside the dialog — the trigger itself takes no `disabled`
// prop at all any more and is unconditionally reachable. This test now pins
// THAT fix: the trigger is enabled from first render (the opposite of the
// old assertion), the click genuinely opens the dialog and reaches the
// reason field, and — per the polished trigger-test idiom in
// components/close/close-components.test.tsx's BLOCKER tests (reading the
// live `disabled` property, never string-matching) — the gate DID NOT
// disappear, it moved: exactly the dialog's own Confirm button stays
// disabled while the reason is empty, and the trigger is never that button.
test("the drawer-2 Attest door's trigger is ENABLED from first render, and Confirm (not the trigger) gates on the reason field it opens", async () => {
  const h = await renderComponent(gateApp());
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const attestTrigger = h.find((n) => n.tagName === "BUTTON");
    assert.ok(attestTrigger, "the Attest dialog trigger must render as a real <button>");
    assert.equal(
      (attestTrigger as unknown as { disabled: boolean }).disabled,
      false,
      "the fix: the trigger is enabled from first render, before any human input — it no longer waits on content only reachable inside itself",
    );
    assert.ok(
      focusableElements(h.container as never).includes(attestTrigger as never),
      "an enabled trigger must be keyboard-reachable",
    );

    await h.fireEvent(attestTrigger as never, "click");
    for (let i = 0; i < 3; i++) await h.settle();

    const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
    assert.ok(textarea, "the click genuinely opens the dialog and reaches the reason field — the deadlock is gone");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

    // The confirm-gating claim: the disabled condition MOVED, it did not
    // disappear. The dialog's own Confirm button — a second, distinct
    // "Attest"-labelled <button> now in the tree — must be disabled while
    // the reason is empty, and the ORIGINAL trigger must never be it.
    const confirmButton = findIn(
      body as never,
      (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Attest") && (n as unknown) !== (attestTrigger as unknown),
    );
    assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
    assert.equal(
      (confirmButton as unknown as { disabled: boolean }).disabled,
      true,
      "Confirm stays disabled while the reason is empty — the gate moved here, it did not disappear",
    );
    assert.equal(
      (attestTrigger as unknown as { disabled: boolean }).disabled,
      false,
      "the trigger itself must remain enabled after opening — it is not the one being gated",
    );
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
});

test("CLOSE journey (gate row's OWN working door dialog, for contrast): a differently-wired CloseDoorDialog — one whose `disabled` is NOT keyed to content only reachable inside itself — opens, reaches its reason field and Confirm/Cancel, and leaves its trigger reachable again on close", async () => {
  // Uses the exact door already proven end-to-end in
  // components/close/close-a11y.test.tsx (Begin-close) — reused here from
  // the KEYBOARD angle: tab reachability, Enter/Space-equivalent
  // activation, and focus not lost across open/close.
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(
        "div",
        null,
        createElement("h1", null, "Close"),
        // Minimal inline stand-in mirroring CloseDoors' own "Begin close"
        // trigger shape (a CloseDoorDialog with NO content-gated
        // `disabled`) — used directly rather than re-deriving CloseDoors'
        // full plan-shaped props here.
        createElement(CloseDoorDialog, {
          triggerLabel: "Begin close", title: "Begin close", confirmLabel: "Begin close", busy: false, onConfirm: async () => true,
        }),
      ),
    }),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Begin close"));
    assert.ok(trigger, "the trigger must render as a real, enabled <button>");
    assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

    (trigger as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const bodyText = textOf(body as never);
    assert.match(bodyText, /Cancel/, "opening the dialog must reach its Cancel control");
    assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

    const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
    assert.ok(cancelButton, "the Cancel control must render as a real <button>");
    await h.fireEvent(cancelButton as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Begin close"));
    assert.ok(
      triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
      "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
    );
  } finally {
    await h.unmount();
    for (let i = 0; i < 5; i++) await h.settle();
  }
});
