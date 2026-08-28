// components/clara/OnboardingChecklistCard.tsx — render-state tests. Pins the
// N/N counter as a DB-read fact (a fixture where completed !== total, both
// values traced to the mocked read, never a client-computed percentage — the
// MUTANT this kills: freezing the counter to a constant), the resolve door's
// per-row visibility (the MUTANT this kills: hiding the door for a pending
// item), and the three top-level shapes (begin-only at firm altitude,
// bootstrap-eligible, full plan).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

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

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

const PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

// A fixture where completed !== total — 2 of 5 — so a frozen "0 / 0" or a
// frozen "N / N" mutant is caught either way.
const ITEMS_2_OF_5 = [
  { id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name", question: "Legal name", answer: "Rome Public Advisory", state: "answered", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i2", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "entity_type", question: "Entity type", answer: "sdn_bhd", state: "resolved", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i3", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "fye", question: "Financial year end", answer: null, state: "pending", required_for_commit: true, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i4", plan_id: "plan-1", firm_id: "f1", item_kind: "capture", item_key: "opening_position", question: "Opening position", answer: null, state: "pending", required_for_commit: false, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i5", plan_id: "plan-1", firm_id: "f1", item_kind: "todo", item_key: "coa_seed", question: "Chart of accounts seed", answer: null, state: "pending", required_for_commit: false, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
];

const NO_GAPS = { "/rest/v1/clients": [{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }] };

function mockFetch(planItemsOverride?: unknown[]) {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/onboarding_plans")) return jsonResponse([PLAN]);
    if (u.includes("/rest/v1/onboarding_plan_items")) return jsonResponse(planItemsOverride ?? ITEMS_2_OF_5);
    for (const [path, body] of Object.entries(NO_GAPS)) if (u.includes(path)) return jsonResponse(body);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return impl;
}

async function mount(clientId?: string) {
  const h = await renderComponent(App(createElement(OnboardingChecklistCard, { clientId, session: sessionTokenAccessor })));
  for (let i = 0; i < 5; i++) await h.settle();
  return h;
}

test("the N/N counter reads '2 / 5' from a DB fixture where completed !== total — both values DB-read, never a fabricated percentage (freeze-the-counter mutant)", async () => {
  await withMockedEnv(mockFetch(), async () => {
    const h = await mount("c1");
    try {
      assert.match(h.text(), /2\s*\/\s*5/, `expected the exact completed/total pair from the fixture; got: ${h.text()}`);
      assert.doesNotMatch(h.text(), /%/, "the counter must never render a percentage");
    } finally {
      await h.unmount();
    }
  });
});

test("the counter tracks a DIFFERENT completed/total pair when the fixture changes — proves it is DERIVED, not a hardcoded string", async () => {
  const allPending = ITEMS_2_OF_5.map((i) => ({ ...i, state: "pending", answered_by: null, answered_at: null }));
  await withMockedEnv(mockFetch(allPending), async () => {
    const h = await mount("c1");
    try {
      assert.match(h.text(), /0\s*\/\s*5/, `expected 0 / 5 once every item is pending; got: ${h.text()}`);
    } finally {
      await h.unmount();
    }
  });
});

test("the Resolve door renders for a PENDING item row (hide-the-door mutant)", async () => {
  await withMockedEnv(mockFetch(), async () => {
    const h = await mount("c1");
    try {
      const resolveTriggers = [] as unknown[];
      const walk = (n: { tagName?: string; childNodes?: unknown[] }) => {
        if (n.tagName === "BUTTON" && textOf(n as never) === "Resolve") resolveTriggers.push(n);
        for (const c of n.childNodes ?? []) walk(c as never);
      };
      walk(h.container as never);
      assert.equal(resolveTriggers.length, ITEMS_2_OF_5.length, "every item row (pending or not) must render its own Resolve trigger — gating shapes, never hides");
    } finally {
      await h.unmount();
    }
  });
});

test("firm altitude (no clientId): renders the Begin-onboarding affordance, with NO onboarding-plan read at all", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    throw new Error(`unexpected fetch at firm altitude: ${String(url)}`);
  }) as typeof fetch;
  await withMockedEnv(impl, async () => {
    const h = await mount(undefined);
    try {
      assert.match(h.text(), /Begin client onboarding/);
    } finally {
      await h.unmount();
    }
  });
});

test("an active pre-0017 client with no plan renders the Bootstrap affordance, not a fabricated empty plan", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse([{ id: "c2", name: "Bee Creative Solution", status: "active" }]);
    if (u.includes("/rest/v1/onboarding_plans")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  await withMockedEnv(impl, async () => {
    const h = await mount("c2");
    try {
      assert.match(h.text(), /Bootstrap onboarding plan/);
    } finally {
      await h.unmount();
    }
  });
});
