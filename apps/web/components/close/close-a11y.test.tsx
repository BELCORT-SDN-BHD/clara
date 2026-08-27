// GATE (b) — structural a11y scan of the close plan + doors dialog (owner
// ruling Q7). See test/domInspect.ts's header for why this rides a
// hand-written rule engine (test/a11yRules.ts) rather than real axe-core.
//
// ClosePlanPanel self-fetches get_close_plan (lib/close/api.ts) — mocked
// fetch exactly like components/bank/matching-section.test.tsx's own
// precedent. The dialog is opened for real (a click on "Begin close",
// mirroring a real user) so the scan covers the door dialog's ACTUAL open
// content — a closed dialog renders nothing for base-ui to check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClosePlanPanel } from "./ClosePlanPanel";
import type { ClosePlan } from "../../lib/close/types";

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

const OPEN_YEAR_PLAN: ClosePlan = {
  fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "open", fy_end_source: "asserted" },
  close_run: { state: "absent" },
  checks: [
    { check_key: "ar_control_tie", drawer: 1, title: "AR control tie", applies_when: "always", result: { state: "pass", measured: {}, measured_digest: "d", evaluated_at: "t" }, items: [] },
  ],
  receipt: { state: "absent" },
};

function App() {
  // Wrapped in the SAME <h1> the real page (ClosePage.tsx) renders above this
  // panel — ClosePlanPanel's own <h2> (the fiscal-year label) is a valid
  // section heading under that page h1 in production; see the identical note
  // in components/documents/documents-a11y.test.tsx.
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Close"),
      createElement(ClosePlanPanel, { clientId: "c1", fiscalYearId: "fy1", session: sessionTokenAccessor, reloadYears: async () => {} }),
    ),
  });
}

test("close plan panel + Begin-close door dialog OPEN have zero violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/get_close_plan")) return jsonResponse(OPEN_YEAR_PLAN);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      // In a real browser both the app root AND the dialog's portal target
      // are under <body> at once — hookHarness's renderComponent leaves
      // h.container detached by design (nothing else needed tree
      // connectivity before). Appending it here makes THIS test's
      // heading-order scan see the SAME single tree a real page would: the
      // "Close" <h1> from App() and the dialog's own <h2> title together,
      // not the dialog title in artificial isolation.
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        assert.match(h.text(), /Begin close/, "the plan must have loaded far enough to show the Begin-close door");

        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Begin close"));
        assert.ok(trigger, "the Begin-close dialog trigger must render");
        const collapsedViolations = checkAccessibility(body as never);
        assert.deepEqual(collapsedViolations, [], `collapsed: ${JSON.stringify(collapsedViolations)}`);

        await h.fireEvent(trigger!, "click");
        // DialogPortal renders the open dialog's content into document.body
        // too — several settle() hops because base-ui's own open transition
        // (useAnimationFrame-driven "mounted" flag) needs more than one
        // macrotask turn under this stub's setTimeout-based
        // requestAnimationFrame polyfill.
        for (let i = 0; i < 6; i++) await h.settle();
        const bodyText = textOf(body as never);
        assert.match(bodyText, /Cancel/, "opening the trigger must reveal the dialog's cancel control");
        assert.match(bodyText, /clara\.begin_close/, "the dialog must name the real governed verb it will call");

        const openViolations = checkAccessibility(body as never);
        assert.deepEqual(openViolations, [], `open dialog: ${JSON.stringify(openViolations)}`);
      } finally {
        await h.unmount();
        // base-ui's scroll-lock cleanup schedules its own restore via a
        // delayed `useTimeout`, independent of react-dom's unmount commit —
        // draining a few more macrotask turns HERE (while this test is
        // still the active one) lets it fire on this test's own watch
        // rather than surfacing as an "activity after the test ended"
        // failure on whichever test happens to run next.
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});
