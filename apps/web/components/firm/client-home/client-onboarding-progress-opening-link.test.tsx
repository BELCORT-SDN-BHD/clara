// #649 AC3 — "separate first-year/no-opening-needed from missing imported opening evidence, and
// link the opening-books Work when applicable."
//
// THE SEPARATION WAS ALREADY BUILT AND THE LINK WAS NOT. `commit_client_onboarding` accepts an
// opening position as an OR of three (0017:2812-2822), the interview writes two of those three as
// item keys the database reads BY NAME (`first_year_zero_opening`, `carry_down_deferred`), and
// `opening-position-gate.tsx` has carried three honest branches for a long time — but grepping
// every onboarding surface for `registers`/`href` returned nothing, so a client whose opening
// balances were owed had no route from their own Home to the one surface that takes them.
//
// WHAT THESE CELLS PIN. The link appears on the DEFERRED branch and nowhere else; a first-year
// client gets a SENTENCE saying why it is absent (CONTEXT.md's *Opening position* Avoid: a
// deferred carry-down is not "no opening needed", and neither is the converse); a client whose
// seed is already finalized is not sent back to do it again; and a plan whose opening story cannot
// be read says neither thing rather than guessing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkAccessibility } from "../../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import messages from "../../../messages/en.json";
import { ClientOnboardingProgress, openingStory } from "./client-onboarding-progress";

enableDomInspection();

const CLIENT_ID = "c6490000-0000-4000-8000-000000000649";
const PLAN_ID = "p6490000-0000-4000-8000-000000000649".replace("p", "a");

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (a: string) => string | null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PLAN = {
  id: PLAN_ID, firm_id: "f1", scope_kind: "client", client_id: CLIENT_ID, state: "open",
  revision_token: "rev-1", revision_n: 7, committed_at: null, committed_by: null,
  review_maker: null, reviewed_at: null, contributors: [], commit_attestation: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

const item = (over: Record<string, unknown>) => ({
  id: "i1", plan_id: PLAN_ID, firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "Legal name?", answer: "Rome", state: "answered", required_for_commit: true,
  answered_by: "u1", answered_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const DEFERRED = item({
  id: "i-open", item_kind: "todo", item_key: "carry_down_deferred",
  question: "Carry down the prior-period closing position",
  answer: { opening: "carry_down", captured: false }, state: "deferred", required_for_commit: false,
});
const FIRST_YEAR = item({
  id: "i-open", item_key: "first_year_zero_opening", question: "Opening position",
  answer: { opening: "zero" }, state: "answered", required_for_commit: true,
});

function mockEstate(items: unknown[], { seeded = false } = {}) {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/onboarding_plans")) return jsonResponse([PLAN]);
    if (u.includes("/rest/v1/onboarding_plan_items")) return jsonResponse(items);
    if (u.includes("/rest/v1/opening_seed_registry")) return jsonResponse(seeded ? [{ id: "s1" }] : []);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
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

function App(status = "onboarding") {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    // The page's own <h1> — this section renders an <h2>, and `checkAccessibility`'s
    // heading-order rule is measuring the DOCUMENT, not the component in isolation.
    children: createElement("div", null,
      createElement("h1", null, "Client"),
      createElement(ClientOnboardingProgress, { clientId: CLIENT_ID, status })),
  });
}

async function mount(status = "onboarding") {
  const h = await renderComponent(App(status));
  for (let i = 0; i < 8; i++) await h.settle();
  return h;
}

function openingLink(h: Awaited<ReturnType<typeof mount>>): Node | null {
  return h.find(
    (n) => (n as Node).tagName === "A" && ((n as Node).getAttribute?.("href") ?? "").includes("tab=opening"),
  ) as Node | null;
}

// ---------------------------------------------------------------------------
// The projection, on its own. A pure function is cheaper to pin than a render, and both arms
// below depend on it answering the DB's OWN item keys rather than a label.
// ---------------------------------------------------------------------------

test("649 · openingStory reads the two item keys commit_client_onboarding reads BY NAME", () => {
  assert.equal(openingStory([DEFERRED] as never), "deferred");
  assert.equal(openingStory([FIRST_YEAR] as never), "first_year");
  assert.equal(openingStory([item({ item_key: "banks" })] as never), null,
    "a plan with neither opening key states no opening story — and the section says neither thing");
  assert.equal(
    openingStory([FIRST_YEAR, DEFERRED] as never), "first_year",
    "a plan carrying both keys reads as first-year: that is the arm commit_client_onboarding's own OR admits without any seed",
  );
});

// ---------------------------------------------------------------------------
// The rendered surface.
// ---------------------------------------------------------------------------

test("649 · AC3 — a DEFERRED carry-down links into the registers' opening tab", async () => {
  await withMockedEnv(mockEstate([DEFERRED]), async () => {
    const h = await mount();
    try {
      const link = openingLink(h);
      assert.ok(link, `the opening link must render on the deferred branch; got:\n${h.text()}`);
      assert.equal(link!.getAttribute?.("href"), `/clients/${CLIENT_ID}/registers?tab=opening`,
        "the link addresses the ONE surface in the product that takes opening balances");
      assert.doesNotMatch(h.text(), /no prior closing position/,
        "a deferred carry-down must never read as 'no opening needed' — CONTEXT.md's own Avoid");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC3 — a FIRST-YEAR client gets the honest sentence and NO link", async () => {
  await withMockedEnv(mockEstate([FIRST_YEAR]), async () => {
    const h = await mount();
    try {
      assert.equal(openingLink(h), null, "there is nothing to carry down, so there is nowhere to send anyone");
      assert.match(h.text(), /no prior closing position to carry down/,
        "the separation is SAID, not merely implied by an absent control");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC3 — a FINALIZED opening seed retires the link: the work is already done", async () => {
  await withMockedEnv(mockEstate([DEFERRED], { seeded: true }), async () => {
    const h = await mount();
    try {
      assert.equal(openingLink(h), null, "a finalized seed means the opening position is captured");
      assert.match(h.text(), /opening/i);
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC3 — a plan with NEITHER opening key says neither thing", async () => {
  await withMockedEnv(mockEstate([item({ item_key: "banks", answer: "Maybank" })]), async () => {
    const h = await mount();
    try {
      assert.equal(openingLink(h), null);
      assert.doesNotMatch(textOf(h.container as never), /no prior closing position/,
        "an unreadable opening story is not a first-year client");
    } finally {
      await h.unmount();
    }
  });
});
