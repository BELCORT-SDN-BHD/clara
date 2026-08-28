// GATE (c) — keyboard-walk test for T7's cancel_agent_task door dialog (F9,
// independent review). documents-governance-keyboard.test.tsx's own
// findIn/body-appendChild precedent. Drives a REAL confirm through to a
// mocked cancel_agent_task and asserts the DISCRIMINATING post-condition
// F6 exists for: a running task's cancel is a REQUEST, so the row stays
// visible with its status flipped to "Cancel requested" and no cancel
// control any more — it does NOT vanish, and the trigger does not survive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { AgentTasksPanel } from "./agent-tasks-panel";

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

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
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

const RUNNING_TASK = {
  id: "task-1", kind: "wake", status: "running", client_id: "c1", error_code: null,
  created_at: "2026-04-01T10:00:00Z", updated_at: "2026-04-01T10:00:00Z",
  cancelled_by: null, cancelled_at: null, session_id: null, created_by: null,
};
const CANCEL_REQUESTED_TASK = { ...RUNNING_TASK, status: "cancel_requested" };

test("CANCEL journey: the dialog opens, Confirm/Cancel are keyboard-reachable, a real confirm posts cancel_agent_task and re-reads — the row STAYS (status: cancel_requested), never vanishes, and loses its cancel control", async () => {
  let reads = 0;
  let posted = false;
  await withMockedEnv(
    async (u, init) => {
      const url = String(u);
      if (url.includes("/rpc/cancel_agent_task")) {
        posted = true;
        return jsonResponse({ task_id: "task-1", status: "cancel_requested" });
      }
      if (url.includes("/rest/v1/agent_tasks_visible")) {
        reads += 1;
        // First read (mount): the running task. Every read AFTER the cancel
        // posts: the SAME row, now cancel_requested — proving F6's own claim
        // that the read (AGENT_TASK_LIVE_STATUSES) keeps it in view.
        return jsonResponse([posted ? CANCEL_REQUESTED_TASK : RUNNING_TASK]);
      }
      throw new Error(`unexpected fetch: ${url}${init ? "" : ""}`);
    },
    async () => {
      const h = await renderComponent(App(createElement(AgentTasksPanel)));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Running/, "the task must render its initial status");

        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
        assert.ok(trigger, "the cancel trigger must render for a running task");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel task$/) !== null);
        const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null && n !== trigger);
        assert.ok(confirmButton, "the confirm control must render");
        assert.ok(cancelButton, "the dialog's own cancel control must render");
        assert.ok(focusableElements(body as never).includes(confirmButton as never), "confirm must be keyboard-reachable (this door needs no fields)");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations in the open dialog");

        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.ok(posted, "cancel_agent_task must actually have been posted");
        assert.ok(reads >= 2, "act() must re-read after the write — no optimistic UI");
        assert.match(textOf(body as never), /Cancel requested/, "the row must show its NEW status after the re-read");
        assert.equal(
          findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null),
          null,
          "a cancel_requested row must carry NO cancel control (AGENT_TASK_CANCELLABLE_STATUSES excludes it)",
        );
      } finally {
        await h.unmount();
        const bodyRef = body as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyRef.childNodes?.includes(h.container)) bodyRef.removeChild(h.container);
      }
    },
  );
});
