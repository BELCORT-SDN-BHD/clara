// GATE (b) — structural a11y scan of the chart-of-accounts register + the Add
// Account door dialog open (owner ruling Q7). See test/domInspect.ts's header
// for why this rides a hand-written rule engine rather than real axe-core.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
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

test("chart-of-accounts register + Add Account door dialog OPEN have zero violations", async () => {
  await withMockedEnv(mockFetch, async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /Rent expense/, "the register must have loaded far enough to show the existing account");

      const collapsedViolations = checkAccessibility(body as never);
      assert.deepEqual(collapsedViolations, [], `collapsed: ${JSON.stringify(collapsedViolations)}`);

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add account"));
      assert.ok(trigger, "the Add Account dialog trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");

      const openViolations = checkAccessibility(body as never);
      assert.deepEqual(openViolations, [], `open dialog: ${JSON.stringify(openViolations)}`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("a governed refusal (upsert_account) renders verbatim in the register's own persistent banner, never merely as a rendered string", async () => {
  await withMockedEnv(
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/rpc/upsert_account")) {
        return jsonResponse({ code: "CLR10", message: "cannot change type/class of an account that has lines" }, 400);
      }
      return mockFetch(url).then((r) => { void init; return r; });
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const editTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Edit");
        assert.ok(editTrigger, "the Edit trigger must render on the existing row");
        await h.fireEvent(editTrigger! as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const nameField = findIn(body as never, (n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("id") === "acct-name");
        assert.ok(nameField, "the name field must be reachable inside the dialog");
        await h.act(() => { setFieldValue(nameField as never, "Rent expense (revised)"); });
        for (let i = 0; i < 2; i++) await h.settle();

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Edit" && (n as unknown) !== (editTrigger as unknown),
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");

        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        assert.match(h.text(), /CLR10/, "the CLR code must render, verbatim");
        assert.match(h.text(), /cannot change type\/class of an account that has lines/, "the DB's own message must render, verbatim — never re-worded");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});
