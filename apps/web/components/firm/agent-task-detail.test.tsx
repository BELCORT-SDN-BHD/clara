// THE AGENT-TASK DETAIL DRAWER (E-2 / CB-AE2E-018 — the owner: "agent task 的
// component 没有内容, 没有交互? only cancel?").
//
// `listCancellableAgentTasks` selects ELEVEN columns and the panel rendered
// THREE. These cells drive the real panel through the real read and require the
// other seven to be reachable — and, on the case that mattered most, require a
// FAILED task to say WHY rather than only "Failed".
//
// Inside an OPEN dialog `h.fireEvent` silently no-ops (Base UI portals the
// content onto document.body, outside the delegated-listener tree), so every
// click here goes through `clickButton` from test/hookHarness — the one shared
// instrument, which also THROWS on a disabled node.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { AgentTasksPanel } from "./agent-tasks-panel";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

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

/** The eleven columns clara.agent_tasks_visible publishes (0006:684-694). */
const TASK = {
  id: "3f2a1b8c-0000-4000-8000-000000000001",
  kind: "autodraft",
  status: "awaiting_input",
  client_id: "c0ffee00-0000-4000-8000-000000000002",
  error_code: null as string | null,
  created_at: "2026-09-01T02:00:00Z",
  updated_at: "2026-09-02T03:30:00Z",
  cancelled_by: null as string | null,
  cancelled_at: null as string | null,
  session_id: "5e551011-0000-4000-8000-000000000003",
  created_by: "11111111-0000-4000-8000-000000000004",
};

async function mountPanel(task: Record<string, unknown>) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null, createElement("h1", null, "Activity"), createElement(AgentTasksPanel)),
    }),
  );
  const body = (globalThis as unknown as { document: { body: Node & { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 4; i++) await h.settle();
  void task;
  return { h, body };
}

test("the Details drawer opens and renders the SEVEN columns the row used to discard", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) return jsonResponse([TASK]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountPanel(TASK);
      try {
        const before = textOf(body as never);
        // DISCRIMINATING: none of the drawer's fields may already be on screen,
        // or "it opened" would be true before the click.
        assert.doesNotMatch(before, /Agent task detail/, "the drawer must start closed");
        assert.doesNotMatch(before, /Chat thread/, "no drawer field may leak into the row");

        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Details");
        assert.ok(trigger, "every task row must offer a Details trigger");
        await h.act(async () => { await clickButton(trigger as never); });
        for (let i = 0; i < 3; i++) await h.settle();

        const after = textOf(body as never);
        assert.match(after, /Agent task detail/, "the drawer must open");
        // The seven previously-discarded columns, each reachable.
        assert.match(after, /Open the client/, "client_id — a task was attributed to no client at all before");
        assert.match(after, /5e551011/, "session_id, as a short id");
        assert.match(after, /11111111/, "created_by");
        assert.match(after, /Last change/, "updated_at");
        assert.match(after, /No error was recorded/, "error_code, honestly absent on a live task");
        // The two absences, stated rather than faked.
        assert.match(after, /no read joins a task id to the receipts/, "the receipt link is a NAMED gap, not a fake control");
        assert.match(after, /private to their author/, "the chat thread is an id, not a link, and says why");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a FAILED task's drawer renders error_code VERBATIM beside a sentence a professional can act on", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) {
        return jsonResponse([{ ...TASK, status: "held", error_code: "timeout" }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountPanel(TASK);
      try {
        assert.doesNotMatch(textOf(body as never), /ran past its time limit/, "the explanation must not be on the row already");
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Details");
        await h.act(async () => { await clickButton(trigger as never); });
        for (let i = 0; i < 3; i++) await h.settle();
        const after = textOf(body as never);
        assert.match(after, /timeout/, "the DB's own code renders verbatim");
        assert.match(after, /ran past its time limit and was stopped/, "…beside a sentence, which is what the row never had");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("an error_code outside the CHECK renders its RAW value, never a next-intl key path", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) {
        return jsonResponse([{ ...TASK, error_code: "some_future_code" }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountPanel(TASK);
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Details");
        await h.act(async () => { await clickButton(trigger as never); });
        for (let i = 0; i < 3; i++) await h.settle();
        const after = textOf(body as never);
        assert.match(after, /some_future_code/, "the unknown code must still reach the human");
        assert.doesNotMatch(after, /errorCodes\./, "and must never render as a key path");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the loading branch renders its own scoped message — the H-25 MISSING_MESSAGE the walk saw four times", async () => {
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/agent_tasks_visible")) {
        await held;
        return jsonResponse([]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement(AgentTasksPanel),
        }),
      );
      try {
        await h.settle();
        const text = h.text();
        assert.match(text, /Loading running agent tasks/, "the first-load branch must render a real string");
        assert.doesNotMatch(text, /CodingQuestionsSignals/, "a missing key would surface the namespace path itself");
      } finally {
        release?.();
        for (let i = 0; i < 3; i++) await h.settle();
        await h.unmount();
      }
    },
  );
});
