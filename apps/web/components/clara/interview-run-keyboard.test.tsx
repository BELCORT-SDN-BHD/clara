// FS-5 gate (c): keyboard order and real Base UI dialog interactions for the
// interview runner, mounted through the actual ClaraFullScreenThread route.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { enableDomInspection } from "../../test/domInspect";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClaraFullScreenThread } from "./ClaraFullScreenThread";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  getAttribute?: (name: string) => string | null;
  disabled?: boolean;
};

function findIn(root: Node, predicate: (node: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = findIn(child, predicate);
    if (found) return found;
  }
  return null;
}

function findAll(root: Node, predicate: (node: Node) => boolean): Node[] {
  const found: Node[] = predicate(root) ? [root] : [];
  for (const child of root.childNodes ?? []) found.push(...findAll(child, predicate));
  return found;
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

const OPEN_PLAN = {
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

function interviewState(cancelled: boolean) {
  return cancelled
    ? {
        run_id: "run-1", scope: "client", status: "cancelled", pending_park: null,
        terminal: { outcome: "cancelled" }, activity: [], plan: { id: "plan-1" }, items: [],
      }
    : {
        run_id: "run-1", scope: "client", status: "awaiting_input",
        pending_park: { parkIndex: 1, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
        terminal: null, activity: [], plan: { id: "plan-1" }, items: [],
      };
}

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

test("the active-run controls and typed cancel door follow DOM tab order and confirm exactly once", async () => {
  let runtimeCancelled = false;
  let planCancelled = false;
  const runtimeCancelBodies: unknown[] = [];
  const dbCancelBodies: unknown[] = [];

  await withMockedEnv(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rest/v1/onboarding_plans")) {
        return jsonResponse([{ ...OPEN_PLAN, state: planCancelled ? "cancelled" : "open", cancel_reason: planCancelled ? "entered twice" : null }]);
      }
      if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: planCancelled ? "archived" : "onboarding" }]);
      if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
      if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
      if (url === "/api/runtime/interview/client/start") return jsonResponse({ run_id: "run-1" }, 202);
      if (url.startsWith("/api/runtime/interview/state?")) return jsonResponse(interviewState(runtimeCancelled));
      if (url === "/api/runtime/interview/cancel") {
        runtimeCancelBodies.push(JSON.parse(String(init?.body)));
        runtimeCancelled = true;
        return jsonResponse({ error: "not_pending" }, 409);
      }
      if (url.includes("/rpc/cancel_client_onboarding")) {
        dbCancelBodies.push(JSON.parse(String(init?.body)));
        planCancelled = true;
        return jsonResponse({ client_id: "c1", plan_id: "plan-1", status: "archived" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: Node & { appendChild: (child: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const start = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render");
        await h.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await h.settle();

        const answer = h.find((node) => node.tagName === "TEXTAREA" && (node as unknown as Node).getAttribute?.("aria-label") === "Your answer");
        const send = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Send");
        const cancelTrigger = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Cancel onboarding");
        assert.ok(answer && send && cancelTrigger, "answer, Send, and the active-run cancel trigger must all render");
        assert.equal(
          findAll(h.container as never, (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding").length,
          1,
          "the active interview must suppress the checklist's competing DB-only cancel trigger",
        );

        await h.act(() => setFieldValue(answer as never, "Rome Public Advisory"));
        const collapsedOrder = focusableElements(body as never);
        assert.ok(collapsedOrder.indexOf(answer as never) < collapsedOrder.indexOf(send as never), "the answer box precedes Send in tab order");
        assert.ok(collapsedOrder.indexOf(send as never) < collapsedOrder.indexOf(cancelTrigger as never), "Send precedes Cancel onboarding in tab order");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "the collapsed route has no keyboard-structure violation");

        await h.fireEvent(cancelTrigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        let reason = findIn(body, (node) => node.tagName === "TEXTAREA" && node.getAttribute?.("aria-label") === "Reason for cancelling");
        const dialogCancel = findIn(body, (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel");
        let confirm = findIn(
          body,
          (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding" && node !== cancelTrigger,
        );
        assert.ok(reason && dialogCancel && confirm, "the typed-reason field and both dialog actions must render");

        await h.act(() => setFieldValue(reason as never, "dismiss this attempt"));
        const openOrder = focusableElements(body as never);
        assert.ok(openOrder.indexOf(reason as never) < openOrder.indexOf(dialogCancel as never), "the reason field precedes dialog Cancel");
        assert.ok(openOrder.indexOf(dialogCancel as never) < openOrder.indexOf(confirm as never), "dialog Cancel precedes Confirm");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "the open dialog has no keyboard-structure violation");

        await h.act(() => clickButton(dialogCancel as never));
        for (let i = 0; i < 6; i++) await h.settle();
        assert.equal(
          findIn(body, (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding" && node !== cancelTrigger),
          null,
          "DialogClose must genuinely close the first cancel attempt",
        );

        const reopenedTrigger = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Cancel onboarding");
        assert.ok(reopenedTrigger, "the active-run cancel trigger remains available after dismissing the dialog");
        await h.fireEvent(reopenedTrigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        reason = findIn(body, (node) => node.tagName === "TEXTAREA" && node.getAttribute?.("aria-label") === "Reason for cancelling");
        confirm = findIn(
          body,
          (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding" && node !== reopenedTrigger,
        );
        assert.ok(reason && confirm, "reopening must restore the typed field and distinct Confirm control");
        await h.act(() => setFieldValue(reason as never, "entered twice"));
        assert.equal((confirm as Node).disabled, false, "a non-empty reason makes Confirm reachable");

        await h.act(() => clickButton(confirm as never));
        for (let i = 0; i < 18; i++) await h.settle();

        assert.equal(runtimeCancelBodies.length, 1, "the runtime cancel is attempted exactly once");
        assert.equal(dbCancelBodies.length, 1, "runtime 409 is ignored and the idempotent DB cancellation still runs exactly once");
        assert.equal((dbCancelBodies[0] as { p_reason: string }).p_reason, "entered twice", "the typed reason reaches the governed DB door");
        // CB-AE2E-023 — this line USED to assert the INTERVIEW card's own terminal copy
        // ("This interview was cancelled."). It no longer can, and the reason is the change,
        // not a regression: once the DB cancel lands, the plan re-reads `cancelled` and the
        // checklist routes to its settled RECEIPT, which does not mount the interview card at
        // all. Mounting it there would offer "Start / continue interview" on a closed plan —
        // a control the runtime's own start route refuses.
        //
        // The post-condition is still DISCRIMINATING, and it is now a stronger one: this
        // sentence carries the reason the human TYPED, so it can only be on screen after the
        // governed DB cancel actually landed and the card re-read it.
        assert.match(textOf(body as never), /This onboarding plan was cancelled: entered twice/, "the terminal copy comes from the post-cancel plan read");
        assert.doesNotMatch(textOf(body as never), /Start \/ continue interview/, "a closed plan must not offer a run the runtime would refuse to start");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("MATERIAL-1 (review round 1): the sole cancel door survives a runtime that never answers /state after a successful start", async () => {
  // The divergent scenario the fix exists for: runtime down, or a
  // session-expired redirect — the run starts (so `runId` is set and
  // `active` goes true), but /state never comes back with a body, so
  // `run.state` stays null for the whole test. Before the fix,
  // `runId && state === null` rendered NO cancel affordance anywhere: the
  // checklist's own DB-only door was already suppressed by `active`, and the
  // interview card's own door lived inside a `{state ? … : null}` wrapper
  // that this shape never opens.
  let dbCancelled = false;
  let runtimeCancelCalls = 0;
  const dbCancelBodies: unknown[] = [];

  await withMockedEnv(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rest/v1/onboarding_plans")) {
        return jsonResponse([{ ...OPEN_PLAN, state: dbCancelled ? "cancelled" : "open", cancel_reason: dbCancelled ? "runtime unreachable" : null }]);
      }
      if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([ITEM]);
      if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: dbCancelled ? "archived" : "onboarding" }]);
      if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([]);
      if (url.includes("/rest/v1/chat_sessions")) return jsonResponse([]);
      if (url === "/api/runtime/interview/client/start") return jsonResponse({ run_id: "run-1" }, 202);
      // Permanently fails — never a 200, never a body `run.state` can adopt.
      if (url.startsWith("/api/runtime/interview/state?")) return jsonResponse({ error: "unauthenticated" }, 401);
      if (url === "/api/runtime/interview/cancel") {
        runtimeCancelCalls += 1;
        return jsonResponse({ ok: true });
      }
      if (url.includes("/rpc/cancel_client_onboarding")) {
        dbCancelBodies.push(JSON.parse(String(init?.body)));
        dbCancelled = true;
        return jsonResponse({ client_id: "c1", plan_id: "plan-1", status: "archived" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: Node & { appendChild: (child: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const start = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Start / continue interview");
        assert.ok(start, "the idempotent start/continue control must render");
        await h.fireEvent(start!, "click");
        for (let i = 0; i < 10; i++) await h.settle();

        // Count, not find-first (N1's own point): this proves exactly one
        // cancel door exists — not merely that `h.find` happened to see one.
        assert.equal(
          findAll(h.container as never, (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding").length,
          1,
          "exactly one cancel affordance must exist even when /state never resolves",
        );

        // NIT-1 (review round 2): the total-count assertion above cannot
        // tell WHICH door survived — a different broken shape (suppression
        // regressed so the checklist's identical-labelled door renders
        // instead, while this card's own door stays unrendered) passes it
        // identically: same count, same DB body. Scope the count to a
        // descendant of the interview card itself (its own `aria-label`,
        // InterviewRunCard.tsx's `<Card aria-label={t("cardLabel")}>`) so a
        // wrong-door survival is distinguishable from a right-door survival.
        const interviewCard = findIn(h.container as never, (node) => node.getAttribute?.("aria-label") === "Client onboarding interview");
        assert.ok(interviewCard, "the interview card itself must render with no runtime state");
        assert.equal(
          findAll(interviewCard as never, (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding").length,
          1,
          "the surviving cancel door must belong to the interview card, not the checklist's suppressed one",
        );

        const cancelTrigger = h.find((node) => node.tagName === "BUTTON" && textOf(node) === "Cancel onboarding");
        assert.ok(cancelTrigger, "the sole cancel trigger must be reachable with no runtime state");
        await h.fireEvent(cancelTrigger!, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        const reason = findIn(body, (node) => node.tagName === "TEXTAREA" && node.getAttribute?.("aria-label") === "Reason for cancelling");
        assert.ok(reason, "the typed-reason field must render with no runtime state");
        await h.act(() => setFieldValue(reason as never, "runtime unreachable"));

        const confirm = findIn(
          body,
          (node) => node.tagName === "BUTTON" && textOf(node as never) === "Cancel onboarding" && node !== cancelTrigger,
        );
        assert.ok(confirm, "the dialog Confirm control must render with no runtime state");
        await h.act(() => clickButton(confirm as never));
        for (let i = 0; i < 18; i++) await h.settle();

        assert.equal(runtimeCancelCalls, 0, "with no known park, the runtime-cancel leg must never be attempted");
        assert.equal(dbCancelBodies.length, 1, "the DB door — the one door that does not need the runtime — still runs exactly once");
        assert.equal((dbCancelBodies[0] as { p_reason: string }).p_reason, "runtime unreachable", "the typed reason reaches the governed DB door");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});
