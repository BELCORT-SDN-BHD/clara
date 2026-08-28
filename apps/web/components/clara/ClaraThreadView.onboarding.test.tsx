// T11 — proves OnboardingChecklistCard is actually MOUNTED inside
// ClaraThreadView (the real integration seam both the rail and the escalated
// full-screen thread share), not merely correct in isolation. This is the
// delete-the-card mutant's own pin: removing the mount line from
// ClaraThreadView.tsx reds this file even though onboarding-checklist.test.tsx
// (the component's own unit tests) would still pass untouched.
//
// `threadId={null}` needs NO session/message/SSE mocking at all —
// useClaraThread's own mount effect early-returns on a falsy threadId
// (lib/clara/useClaraThread.ts:100) — so only the onboarding-domain fetches
// below are mocked; a stray thread-transport fetch would throw and fail loud.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClaraThreadView } from "./ClaraThreadView";

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

function App(clientId: string | undefined) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(ClaraThreadView, { threadId: null, variant: "rail", clientId }),
  });
}

test("client-workspace thread (clientId set): the onboarding checklist card is mounted ALONGSIDE the thread, even while the thread itself is still resolving", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([]);
    if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "active" }]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App("c1"));
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Finding your conversation with Clara/, "the thread's own resolving state must still render");
      assert.match(h.text(), /Bootstrap onboarding plan/, "the onboarding checklist card must be mounted alongside it — deleting the mount line reds THIS assertion, not onboarding-checklist.test.tsx");
    } finally {
      await h.unmount();
    }
  });
});

test("firm-altitude thread (no clientId): the Begin-onboarding affordance is mounted, never a client-scoped plan read", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(undefined));
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Begin client onboarding/, "the firm-altitude Begin affordance must be mounted alongside the thread");
    } finally {
      await h.unmount();
    }
  });
});
