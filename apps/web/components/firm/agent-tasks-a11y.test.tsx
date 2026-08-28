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

const TASK = {
  id: "task-1", kind: "wake", status: "running", client_id: "c1", error_code: null,
  created_at: "2026-04-01T10:00:00Z", updated_at: "2026-04-01T10:01:00Z",
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
