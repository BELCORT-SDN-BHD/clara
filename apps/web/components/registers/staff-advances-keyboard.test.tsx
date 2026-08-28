// GATE (c) — keyboard-walk tests for the staff-advances workbench's door
// dialogs (owner ruling Q7). See test/keyboardWalk.ts's header for exactly
// what this environment can and cannot prove about real key-event dispatch.
// The P3 workbench lesson: a keyboard gate found six permanently-unopenable
// doors five code reviews missed — a different instrument, not another
// reader; every door dialog in this train gets one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { StaffAdvancesRegister } from "./staff-advances-register";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

const ACCOUNTS = [
  { client_id: "c1", account_code: "2100", name: "Staff advances — Ah Chong", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { client_id: "c1", account_code: "5100", name: "Wages and salaries", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];
const ENROLMENTS = [
  { id: "en1", client_id: "c1", account_code: "2100", person_label: "Ah Chong", enrolment_attestation: "Not a related party.", active: true, enrolled_at: "2026-01-01T00:00:00Z", retired_by: null, retired_at: null, retired_reason: null },
];
const ADVANCES = [
  { id: "adv1", client_id: "c1", enrolment_id: "en1", account_code: "2100", issue_date: "2026-08-01", amount_cents: 100000, purpose: null, reference: null, voided_by_entry_id: null, void_effective_date: null },
];
const SUMMARY = {
  client_id: "c1", as_of: "2026-08-28",
  advances: [{ enrolment_id: "en1", account_code: "2100", person_label: "Ah Chong", advance_id: "adv1", issue_date: "2026-08-01", amount_cents: 100000, outstanding_cents: 100000, days_outstanding: 27, purpose: null, reference: null, voided: false, particulars_complete: false, enrolment_active: true }],
  outstanding_cents: 100000, incomplete_count: 1, policy_notes: [],
};
const TIE = { client_id: "c1", as_of: "2026-08-28", tie: true, accounts: [] };

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rest/v1/staff_advances?")) return jsonResponse(ADVANCES);
  if (u.includes("/rest/v1/staff_advance_accounts?")) return jsonResponse(ENROLMENTS);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  if (u.includes("/rpc/staff_advance_summary")) return jsonResponse(SUMMARY);
  if (u.includes("/rpc/staff_advance_tie")) return jsonResponse(TIE);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(StaffAdvancesRegister, { clientId: "c1" })),
  });
}

test("staff-advances workbench: every door trigger is keyboard-reachable, in DOM order, no positive tabindex", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const triggers = ["Book application", "Enrol account", "Complete particulars", "Retire"];
      for (const label of triggers) {
        const t = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(label));
        assert.ok(t, `the ${label} trigger must render as a real <button>`);
        assert.ok(focusableElements(h.container as never).includes(t as never), `${label} must be keyboard-reachable`);
      }
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations on the collapsed panel");
    } finally {
      await h.unmount();
    }
  });
});

test("Book Application door dialog: opens on click, reaches every field and Confirm/Cancel, leaves its trigger reachable again on close", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Book application"));
      assert.ok(trigger, "the Book Application trigger must render");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the dialog must reveal its Cancel control");
      assert.match(bodyText, /Add line/, "the lines editor must be reachable inside the dialog");
      assert.match(bodyText, /Add allocation/, "the allocations editor must be reachable inside the dialog");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.ok(cancelButton, "the Cancel control must render as a real <button>");
      await h.fireEvent(cancelButton as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Book application"));
      assert.ok(
        triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
        "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("Retire Account door dialog (per-row): the trigger is enabled from first render, and Confirm gates on the required reason field it opens", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const retireTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
      assert.ok(retireTrigger, "the Retire trigger must render for the active enrolment row");
      assert.equal((retireTrigger as unknown as { disabled: boolean }).disabled, false, "the trigger itself is never gated — only Confirm is");

      await h.fireEvent(retireTrigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the click must genuinely open the dialog and reach the reason field");

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Retire account") && (n as unknown) !== (retireTrigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled while the reason is empty");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
