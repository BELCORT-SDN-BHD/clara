// DS-04 (FS-9 §3, P6-3) — the nested-live-region defect, pinned at the
// INTEGRATION seam where it actually lived.
//
// The defect was never visible from either component alone: ClaraThreadView's
// scroll region carried `role="log" aria-live="polite"`, and everything the
// rail renders — six StateBanner sites, the LoadingState sentence, and
// (through OnboardingChecklistCard) InterviewRunCard's own `role="log"` thread
// — was a descendant of it. Two files apart, and each component's own suite
// green. So this file renders the real ClaraThreadView, through the real
// provider, and asserts the STRUCTURAL property over the whole rendered tree.
//
// Mount shape is borrowed verbatim from ClaraThreadView.onboarding.test.tsx:
// `threadId={null}` needs no session/message/SSE mocking (useClaraThread's
// mount effect early-returns on a falsy threadId), so only the onboarding
// fetches are stubbed and a stray transport fetch throws loudly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClaraThreadView } from "./ClaraThreadView";

enableDomInspection();

type Stub = {
  nodeType?: number;
  tagName?: string;
  childNodes?: Stub[];
  getAttribute?: (name: string) => string | null;
};

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

const onboardingFetch = (async (u: RequestInfo | URL) => {
  const url = String(u);
  if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([]);
  if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "active" }]);
  throw new Error(`unexpected fetch: ${url}`);
}) as typeof fetch;

function collect(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  (function walk(n: Stub) {
    if (n.nodeType === 1 && predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

const attrOf = (n: Stub, name: string) => (typeof n.getAttribute === "function" ? n.getAttribute(name) : null);

test("the rail's rendered tree contains ZERO nested live regions", async () => {
  await withMockedEnv(onboardingFetch, async () => {
    const h = await renderComponent(App("c1"));
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const violations = checkAccessibility(h.container as never).filter((v) => v.rule === "nested-live-region");
      assert.deepEqual(violations, [], JSON.stringify(violations, null, 2));
    } finally {
      await h.unmount();
    }
  });
});

test("VACUITY CONTROL: the tree really does contain live regions and a status inside the scroll column", async () => {
  // Without this arm the assertion above passes trivially on a tree that has no
  // live regions at all — which is exactly what a render that silently failed
  // to mount would produce. It also pins the pre-fix geometry: the resolving
  // LoadingState (now role="status") and the transcript log are BOTH present,
  // and they are the two elements that used to be nested one inside the other.
  await withMockedEnv(onboardingFetch, async () => {
    const h = await renderComponent(App("c1"));
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const live = collect(h.container as Stub, (n) => attrOf(n, "role") !== null || attrOf(n, "aria-live") !== null);
      const roles = live.map((n) => attrOf(n, "role"));
      assert.ok(roles.includes("log"), `expected the transcript log; roles were ${JSON.stringify(roles)}`);
      assert.ok(roles.includes("status"), `expected the resolving LoadingState; roles were ${JSON.stringify(roles)}`);
      assert.match(h.text(), /Finding your conversation with Clara/);
    } finally {
      await h.unmount();
    }
  });
});

test("DS-03: the transcript log carries aria-busy while the messages are still being read", async () => {
  // The log is the one region here that PERSISTS across the load, which is what
  // makes aria-busy meaningful on it (a placeholder that is swapped out can
  // never flip the flag false). `threadId={null}` is the pre-thread state, so
  // the flag reads false — the discriminating fact this pins is that the
  // attribute is RENDERED and reflects state, not that it is hardcoded true.
  await withMockedEnv(onboardingFetch, async () => {
    const h = await renderComponent(App("c1"));
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const [log] = collect(h.container as Stub, (n) => attrOf(n, "role") === "log");
      assert.ok(log, "the transcript log must be mounted");
      assert.equal(attrOf(log, "aria-busy"), "false");
      // …and it must NOT be the scroll column any more: the checklist card and
      // the state banners are siblings of the log, never inside it.
      assert.equal(collect(log, (n) => attrOf(n, "role") === "status").length, 0);
    } finally {
      await h.unmount();
    }
  });
});
