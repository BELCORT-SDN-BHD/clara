// #649 AC5 — H-29, the chart row that told an onboarding client it had decided nothing.
//
// THE DEFECT, and its cause is not where the handover put it. `clara.coa_chart_state`'s `dec` CTE
// reads COMMITTED plans only (0156:1082), so a client who answered the chart question inside an
// OPEN onboarding plan falls through the CASE to `'undecided'`. `readCoaChartState` was faithful;
// the verdict was narrow. 0170 added a SECOND key, `seed_decision_plan_state`, precisely so the
// face could say which case it is in — and until #649 that key existed only in two source
// comments and was never read by any surface (`coa.ts:82-97` mapped exactly seven fields).
//
// WHAT THESE CELLS PIN. `readCoaChartState` returns the eighth field; the control renders 0170's
// own honest copy on the open-plan case; the generic `undecided` line still stands when the plan
// state is genuinely absent (a client who really has decided nothing); an unrecognised value
// renders its own token rather than being folded into a known arm; and none of this touches the
// wall — `apply_coa_template` refuses while the newest plan is open (0173:8-16), which is
// INTENDED, and this copy explains that refusal instead of removing it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { isKnownSeedDecisionPlanState, readCoaChartState } from "../../lib/onboarding/coa";
import messages from "../../messages/en.json";
import { ApplyStandardChartControl } from "./ApplyStandardChartControl";

enableDomInspection();

const CLIENT_ID = "c6490002-0000-4000-8000-000000000649";

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

const chartState = (over: Record<string, unknown>) => ({
  state: "undecided", seed_decision: null, seed_wants_template: false, accounts: 0,
  template_id: null, template_version: null, adoption_state: null,
  seed_decision_plan_state: null,
  ...over,
});

function mockEstate(row: Record<string, unknown>) {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/coa_chart_state")) return jsonResponse(row);
    if (u.includes("/rpc/list_coa_templates")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ApplyStandardChartControl, {
      clientId: CLIENT_ID, planOpen: true, session: { getAccessToken: async () => "tok" },
      onApplied: () => {},
    }),
  });
}

async function mount() {
  const h = await renderComponent(App());
  for (let i = 0; i < 8; i++) await h.settle();
  return h;
}

// ---------------------------------------------------------------------------
// The READ. 0170's key reaches the browser at all.
// ---------------------------------------------------------------------------

test("649 · readCoaChartState returns seed_decision_plan_state — the eighth field coa.ts never mapped", async () => {
  await withMockedEnv(mockEstate(chartState({ seed_decision_plan_state: "open", seed_decision: "lhdn_mpers_standard" })), async () => {
    const row = await readCoaChartState(CLIENT_ID);
    assert.ok(row);
    assert.equal(row!.seedDecisionPlanState, "open");
    assert.equal(row!.seedDecision, "lhdn_mpers_standard", "the seven fields it already mapped are untouched");
  });
});

test("649 · a database below 0170 answers no such key, and it reads as ABSENT rather than as a state", async () => {
  await withMockedEnv(mockEstate({ state: "undecided", seed_decision: null, accounts: 0 }), async () => {
    const row = await readCoaChartState(CLIENT_ID);
    assert.equal(row!.seedDecisionPlanState, null, "absent is absent — never coerced into 'open'");
  });
});

test("649 · the known-value guard is a CLOSED set, so a later migration's fourth value is visible as one", () => {
  assert.equal(isKnownSeedDecisionPlanState("open"), true);
  assert.equal(isKnownSeedDecisionPlanState("committed"), true);
  assert.equal(isKnownSeedDecisionPlanState("archived"), false);
});

// ---------------------------------------------------------------------------
// The rendered surface.
// ---------------------------------------------------------------------------

test("649 · AC5 — an OPEN plan's recorded decision renders 0170's honest copy instead of a bare 'undecided'", async () => {
  await withMockedEnv(mockEstate(chartState({ seed_decision_plan_state: "open" })), async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /The chart decision WAS made in the interview/,
        `the open-plan case must say so; got:\n${text}`);
      assert.match(text, /applies once the onboarding is committed/,
        "and it explains 0173's INTENDED refusal rather than hiding it");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · a client who really has decided nothing still reads 'undecided', with no extra claim", async () => {
  await withMockedEnv(mockEstate(chartState({ seed_decision_plan_state: null })), async () => {
    const h = await mount();
    try {
      const text = h.text();
      assert.match(text, /No chart-of-accounts decision has been recorded yet/);
      assert.doesNotMatch(text, /The chart decision WAS made in the interview/,
        "the new line must never appear where no decision exists — that would be the old defect, inverted");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · an unrecognised plan state renders its own token rather than being folded into a known arm", async () => {
  await withMockedEnv(mockEstate(chartState({ state: "adopted", accounts: 42, seed_decision_plan_state: "archived" })), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /a plan state this build does not recognise \("archived"\)/);
    } finally {
      await h.unmount();
    }
  });
});
