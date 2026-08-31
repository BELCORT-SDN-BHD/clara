// FS-5 gate (b): structural accessibility at each durable-interview state.
// This mounts through ClaraFullScreenThread, the real escalated route surface;
// the only expected finding belongs to the pre-existing thread composer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { checkAccessibility } from "../../test/a11yRules";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, textOf } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClaraFullScreenThread } from "./ClaraFullScreenThread";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
};

function findIn(root: Node, predicate: (node: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = findIn(child, predicate);
    if (found) return found;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

const PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

const ITEM = {
  id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "What is the client's legal name?", answer: null, state: "pending", required_for_commit: true,
  answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

const OPEN_STATE = {
  run_id: "run-1",
  scope: "client",
  status: "awaiting_input",
  pending_park: {
    parkIndex: 1,
    seg: "legal_name",
    phase: "q",
    question: "What is the client's legal name?",
  },
  terminal: null,
  activity: [],
  plan: { id: "plan-1" },
  items: [],
};

const PRE_EXISTING_COMPOSER_FINDING = {
  rule: "label",
  wcag: "1.3.1 Info and Relationships / 4.1.2 Name, Role, Value",
  element: "textarea",
  message: "Form elements must have an accessible name (aria-label, aria-labelledby, or an associated <label>).",
};

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(ClaraFullScreenThread, {
      threadId: "",
      clientId: "c1",
      returnHref: "/clients/c1",
    }),
  });
}

test("the real thread route stays accessible before start, at an open park, and with the interview cancel dialog open", async () => {
  await withMockedEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([PLAN]);
      if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
      if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
      if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
      if (url === "/api/runtime/interview/client/start") return jsonResponse({ run_id: "run-1" }, 202);
      if (url.startsWith("/api/runtime/interview/state?")) return jsonResponse(OPEN_STATE);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: Node & { appendChild: (child: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();

        const beforeStart = checkAccessibility(body as never);
        assert.deepEqual(beforeStart, [PRE_EXISTING_COMPOSER_FINDING], `before start: ${JSON.stringify(beforeStart)}`);

        const start = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render inside the real thread");
        await h.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await h.settle();

        assert.match(h.text(), /What is the client's legal name\?/, "the runtime-hydrated open park must render");
        const openPark = checkAccessibility(body as never);
        assert.deepEqual(openPark, [PRE_EXISTING_COMPOSER_FINDING], `open park: ${JSON.stringify(openPark)}`);

        const cancelTrigger = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Cancel onboarding");
        // N1 (review round 1): `h.find` only proves a FIRST match exists — it
        // cannot prove uniqueness. The count property ("exactly one Cancel
        // onboarding button") is interview-run-keyboard.test.tsx's own
        // assertion; this file only needs the trigger to be reachable at all.
        assert.ok(cancelTrigger, "a cancel trigger for the active interview must render");
        await h.fireEvent(cancelTrigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const reason = findIn(body, (node) => node.tagName === "TEXTAREA" && node.getAttribute?.("aria-label") === "Reason for cancelling");
        assert.ok(reason, "opening the interview cancel door must reveal its typed-reason field");
        const openDialog = checkAccessibility(body as never);
        assert.deepEqual(openDialog, [PRE_EXISTING_COMPOSER_FINDING], `open cancel dialog: ${JSON.stringify(openDialog)}`);
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});
