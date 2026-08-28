// Fix round (rev-t2) pins for F3 (the opening-position census, trued) and F9
// (a read failure must never render as "no seed exists").

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OpeningRegister } from "./opening-register";

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

const PLAN = { id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" };

/** `positionItems`: `null` OMITS the endpoint from the mock entirely (throws
 *  "unexpected fetch" if reached) — the F3 read-drop mutant's own positive
 *  control: a test asserting the deferred/zero branches must, by
 *  construction, prove the read actually ran. */
function mockFetch(opts: { seeds?: unknown[]; positionItems?: unknown[] | null; seedsStatus?: number; seedsBody?: unknown }) {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/opening_seed_registry")) {
      if (opts.seedsStatus && opts.seedsStatus >= 400) return jsonResponse(opts.seedsBody ?? { message: "permission denied" }, opts.seedsStatus);
      return jsonResponse(opts.seeds ?? []);
    }
    if (url.includes("/rest/v1/onboarding_plan_items")) {
      if (opts.positionItems === null) throw new Error(`unexpected fetch (F3 read-drop control): ${url}`);
      return jsonResponse(opts.positionItems ?? []);
    }
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([PLAN]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

test("F3: a `carry_down_deferred` plan item renders the deferred info banner + chase text, AND still offers the Create trigger", async () => {
  await withMockedEnv(
    mockFetch({ seeds: [], positionItems: [{ id: "pi1", item_key: "carry_down_deferred", state: "deferred", question: "Carry down the prior-period closing position" }] }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Carry-down deferred at onboarding/, "the deferred title must render");
        assert.match(h.text(), /Carry down the prior-period closing position/, "the plan item's own question text (the chase content) must render verbatim");
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
        assert.ok(trigger, "the Create trigger must STILL be reachable — the carry-down is wanted, only deferred");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("F3: a `first_year_zero_opening` plan item renders the honest no-seed-needed text, and OMITS the Create trigger", async () => {
  await withMockedEnv(
    mockFetch({ seeds: [], positionItems: [{ id: "pi2", item_key: "first_year_zero_opening", state: "answered", question: "Opening position" }] }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /No opening seed needed/, "the honest first-year-zero text must render");
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
        assert.equal(trigger, null, "a seed is NOT wanted for a first-year-zero client — the Create trigger must not render here");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("F3: neither plan item present falls through to the generic empty state (with the Create trigger)", async () => {
  await withMockedEnv(mockFetch({ seeds: [], positionItems: [] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /No opening seed has been created for this client yet/);
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
      assert.ok(trigger, "the default branch must still offer Create");
    } finally {
      await h.unmount();
    }
  });
});

test("fix round 2: a PENDING first_year_zero_opening row must NOT suppress Create — only answered/resolved satisfies it (guarded like the port source's isSatisfied)", async () => {
  await withMockedEnv(
    mockFetch({ seeds: [], positionItems: [{ id: "pi3", item_key: "first_year_zero_opening", state: "pending", question: "Opening position" }] }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.doesNotMatch(h.text(), /No opening seed needed/, "a PENDING row is not yet satisfied — the first-year-zero branch must not fire");
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
        assert.ok(trigger, "Create must be reachable — a pending row cannot suppress it");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("fix round 2: the deferred branch's chase list renders every required-for-commit item not yet answered/resolved (the missing_must_asks predicate)", async () => {
  await withMockedEnv(
    mockFetch({
      seeds: [],
      positionItems: [
        { id: "pi1", item_key: "carry_down_deferred", state: "deferred", question: "Carry down the prior-period closing position", required_for_commit: false },
        { id: "pi4", item_key: "ssm_number", state: "pending", question: "What is the client's SSM registration number?", required_for_commit: true },
        { id: "pi5", item_key: "bank_statement", state: "answered", question: "Attach the closing bank statement", required_for_commit: true },
      ],
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Still needed before this client's opening can be keyed/, "the chase-list banner title must render");
        assert.match(h.text(), /What is the client's SSM registration number\?/, "an unsatisfied required item must be chased");
        assert.doesNotMatch(h.text(), /Attach the closing bank statement/, "an ALREADY-answered required item must NOT appear in the chase list");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("F9: a 403 on the seeds read shows the error state ONLY — never the empty-state text, never the Create trigger", async () => {
  await withMockedEnv(mockFetch({ seedsStatus: 403, seedsBody: { message: "permission denied for table opening_seed_registry" } }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.doesNotMatch(h.text(), /No opening seed has been created for this client yet/, "F9: a READ FAILURE must never be presented as 'no seed exists' — absence is not evidence");
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
      assert.equal(trigger, null, "the Create trigger must not render on a read failure — there is no confirmed 'no seed' state to act on");
    } finally {
      await h.unmount();
    }
  });
});
