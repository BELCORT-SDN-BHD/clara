// GATE (b) — structural a11y scan of the AgentTasksPanel (T7, port-wave plan
// §7.2). needs-you-a11y.test.tsx's own idiom for the synthetic ambient <h1>
// (on the real page this renders under app/(firm)/activity/page.tsx's own
// PageHeader <h1>).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { AgentTasksPanel } from "./agent-tasks-panel";
import messages from "../../messages/en.json";

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

// M12, independent review (pin the fixes): 20:00 UTC = 4:00 AM the FOLLOWING
// day in Asia/Kuala_Lumpur — `businessDateTime` and a raw UTC slice disagree
// on both the date AND the hour, so asserting the MYT string below fails
// outright on a regression to `.slice(0, 16)`.
const TASK = {
  id: "task-1", kind: "wake", status: "running", client_id: "c1", error_code: null,
  created_at: "2026-04-01T20:00:00Z", updated_at: "2026-04-01T20:01:00Z",
  cancelled_by: null, cancelled_at: null, session_id: null, created_by: null,
};

test("agent tasks panel (one running task) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) return jsonResponse([TASK]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Activity"), createElement(AgentTasksPanel)),
        }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Wake/, "the task's kind label must render");
        assert.match(h.text(), /Running/, "the task's status label must render");
        // M12, independent review: businessDateTime, not a raw UTC slice —
        // see the TASK fixture's own header.
        assert.match(h.text(), /2 Apr 2026, 4:00 am/, "the task's timestamp must render in the business timezone (MYT), not raw UTC");
        assert.doesNotMatch(h.text(), /2026-04-01 20:00/, "the RAW UTC slice must never appear — it would prove a regression");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// M17, independent review (pin the fixes): a FAILED initial load must
// render the refusal, never fall through to the empty-state message.
test("agent tasks panel: a FAILED initial load renders the refusal, never the fabricated empty-list message", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) return jsonResponse({ code: "PGRST301", message: "JWT expired" }, 401);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Activity"), createElement(AgentTasksPanel)),
        }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.doesNotMatch(h.text(), /No running agent tasks right now/, "a FAILED read must never render the honest-empty claim");
        assert.match(h.text(), /Sign in|session|expired|forbidden|Something went wrong/i, "the panel must show its own failed-read state");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent tasks panel: empty state has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Activity"), createElement(AgentTasksPanel)),
        }),
      );
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /No running agent tasks right now/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});
