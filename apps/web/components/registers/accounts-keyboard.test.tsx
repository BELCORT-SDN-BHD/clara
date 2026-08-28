// GATE (c) — keyboard-walk tests for the chart-of-accounts register's door
// dialog (owner ruling Q7). See test/keyboardWalk.ts's header for exactly
// what this environment can and cannot prove about real key-event dispatch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ChartOfAccountsRegister } from "./chart-of-accounts-register";

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
  { client_id: "c1", account_code: "5100", name: "Rent expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

async function mockFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  if (u.includes("/rest/v1/coa_accounts?")) return jsonResponse(ACCOUNTS);
  throw new Error(`unexpected fetch: ${u}`);
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(ChartOfAccountsRegister, { clientId: "c1" })),
  });
}

test("chart-of-accounts register: Add and Edit triggers are keyboard-reachable, no positive tabindex", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      for (const label of ["Add account", "Edit"]) {
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

test("Add Account door dialog: opens on click, reaches Confirm/Cancel, Confirm gates on code+name, no keyboard-walk violations while open", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add account"));
      assert.ok(trigger, "the Add Account trigger must render");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the dialog must reveal its Cancel control");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add account") && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "Confirm stays disabled with no code/name entered yet");

      // F7 (independent review, fix-required — RECORDED, not a retry-harder
      // fix): a Cancel-based close proof was attempted and genuinely FAILS
      // in this harness — hookHarness.ts's own `clickButton` header documents
      // that `@base-ui/react`'s `DialogClose` (Cancel) checks `event
      // instanceof KeyboardEvent` internally, which this fake-DOM harness's
      // dispatched events never satisfy (via `fireEvent` OR `clickButton`).
      // Asserting "the trigger is reachable again" after a Cancel click (the
      // ORIGINAL shape here) was vacuous for exactly that reason — Cancel
      // never provably closes anything here, so it always passed. The
      // genuine close proof below rides the Confirm path instead, which
      // `clickButton` IS proven to reach end to end.
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("Add Account door dialog: a real successful confirm closes the dialog for real (Confirm GONE afterward, never a never-closes mutant)", async () => {
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rpc/upsert_account")) return jsonResponse({ client_id: "c1", account_code: "5200" });
    void init;
    return mockFetch(url);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add account"));
      assert.ok(trigger, "the Add Account trigger must render");
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const codeField = findIn(body as never, (n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("id") === "acct-code");
      assert.ok(codeField, "the code field must be reachable inside the dialog");
      await h.act(() => { setFieldValue(codeField as never, "5200"); });

      const nameField = findIn(body as never, (n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("id") === "acct-name");
      assert.ok(nameField, "the name field must be reachable inside the dialog");
      await h.act(() => { setFieldValue(nameField as never, "Office supplies"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add account") && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm button must be reachable");
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "code + name are now filled — Confirm must be enabled");

      await h.act(() => { clickButton(confirmButton as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const confirmAfterSuccess = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add account") && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(confirmAfterSuccess, null, "the dialog's own Confirm button must be GONE after a real, successful confirm — the dialog genuinely closed");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
