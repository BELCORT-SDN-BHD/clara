// F1 (independent review, re-verify FIX-REQUIRED, 2026-08-28): the fix
// itself was byte-proven at review time via a probe, not pinned by a
// standing test — this file is that pin. It must kill two mutants:
//
//   M-F1  (swallow the read error, e.g. revert to useHydratedPart's
//          already-stringified err/clr) -> the component would show
//          "Loading…" FOREVER instead of the classified forbidden wording.
//   M-F1b (remove the `if (!data) return …` first-load gate) -> the
//          component falls through to `data ?? []` = an empty array,
//          rendering the FALSE "No accounts…yet." empty state with a LIVE
//          Add-account trigger over a read that never actually succeeded —
//          the exact silent-overwrite path F1 closed.
//
// Merge-base wording (fe81e10c, before T4 touched this file) for a 403:
// "Your account can't read this yet." — this file proves the SAME wording
// survives T4's write-surface addition.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ChartOfAccountsRegister } from "./chart-of-accounts-register";

enableDomInspection();

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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(ChartOfAccountsRegister, { clientId: "c1" })),
  });
}

test("F1: a 403 on coa_accounts renders the classified forbidden wording — never the raw PostgREST message, never a false empty state, never a live Add-account trigger", async () => {
  await withMockedEnv(
    (async () => jsonResponse({ message: "permission denied for table coa_accounts" }, 403)) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();

        assert.match(text, /Your account can't read this yet\./, "the classified, translated wording must render (kills M-F1: a swallowed error shows 'Loading…' forever instead)");
        assert.doesNotMatch(text, /permission denied for table coa_accounts/, "the raw PostgREST message — an internal relation name — must NEVER reach the screen");
        assert.doesNotMatch(text, /No accounts in this client's chart of accounts yet\./, "the FALSE empty state must never render over a refused read (kills M-F1b)");

        const addTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add account"));
        assert.equal(addTrigger, null, "the Add-account trigger must NOT be live while the read is refused — the exact silent-overwrite path F1 closed (kills M-F1b)");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("F1: the chart-of-accounts register shows 'Loading…' while the read is still pending — never the empty state, never a live Add-account trigger", async () => {
  const never = new Promise<Response>(() => {});
  await withMockedEnv((async () => never) as typeof fetch, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const text = h.text();

      assert.match(text, /Loading…/, "a still-pending read must show the loading state");
      assert.doesNotMatch(text, /No accounts in this client's chart of accounts yet\./, "a still-pending read must never show the empty state (kills M-F1b)");

      const addTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Add account"));
      assert.equal(addTrigger, null, "the Add-account trigger must NOT be live while the read is still pending (kills M-F1b)");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
