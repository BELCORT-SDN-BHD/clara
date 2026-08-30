// GATE (c) — keyboard-walk tests for the operator approval queue (P4-5).
// Ported mocked-fetch/renderComponent style from
// components/firm-admin/firm-admin-keyboard.test.tsx's own precedent. See
// test/keyboardWalk.ts's header for exactly what this environment can and
// cannot prove about real key-event dispatch.
//
// THE DISCRIMINATING POST-CONDITION (apps/web/AGENTS.md's own dialog law):
// "Approve" must be proven by something true only AFTER the click — here,
// that the approved row LEAVES the open queue on the mandatory re-read
// (act()'s own contract), not merely that the door returned 200. RED-BEFORE:
// commenting out `loadOperatorRegistrationQueue`'s re-mock swap below (i.e.
// always returning the SAME row) turns that cell red, because the row would
// still be present after the click — verified by hand before this file
// shipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { RegistrationsQueuePanel } from "./registrations-queue";
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

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

const CALLER_CONTEXT = [{ user_id: "u1", firm_id: "f1", firm_name: "BELCORT", role: "owner", role_rank: 3, is_operator: true }];
const OPEN_REQUEST = {
  id: "r1", applicant: "a1234567-89ab-cdef-0123-456789abcdef", firm_name: "Rome Public Advisory",
  note: null, status: "open", decided_by: null, decided_at: null, reason: null, firm_id: null,
  created_at: "2026-08-30T09:00:00Z",
};

async function mountEligibleQueue(mockQueue: (u: string) => Response) {
  const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body, mockQueue };
}

test("Reject dialog: opens on click, Confirm gates on the required reason, trigger reachable again after Cancel", async () => {
  let queueFetches = 0;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueFetches += 1;
        return jsonResponse([OPEN_REQUEST]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([OPEN_REQUEST]));
      try {
        assert.ok(queueFetches >= 1, "the queue must have loaded before this test drives it");
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(trigger, "the Reject trigger must render for the open request");

        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "keyboard focus must actually reach the Reject trigger");

        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        assert.match(textOf(body as never), /Cancel/, "opening the dialog must reveal its Cancel control");
        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");

        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration",
        );
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        assert.equal(
          (confirmButton as unknown as { disabled: boolean }).disabled,
          true,
          "Confirm stays disabled while the reason is empty — Mobbin grounding §2 takeaway 3",
        );
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the Reject dialog is open");

        const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
        assert.ok(cancelButton, "the Cancel control must render as a real <button>");
        await h.fireEvent(cancelButton as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const triggerAfterClose = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(
          triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
          "the trigger must be reachable again after the dialog closes — focus is not stranded on a removed node",
        );
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("Approve: the discriminating post-condition — the approved row LEAVES the open queue on the mandatory re-read, and the receipt names the real firm_id/plan_id", async () => {
  let queueCall = 0;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/approve_firm_registration")) {
        return jsonResponse({ request_id: "r1", firm_id: "f2", plan_id: "p1" });
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueCall += 1;
        // The FIRST read (mount) sees the open row; every read AFTER the
        // Approve click sees an EMPTY queue — the door's own re-read, not
        // this test asserting the click "worked" by claim.
        return jsonResponse(queueCall === 1 ? [OPEN_REQUEST] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue(() => jsonResponse([]));
      try {
        assert.match(textOf(body as never), /Rome Public Advisory/, "the open request must have loaded before the click");

        const approveButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        assert.ok(approveButton, "the Approve trigger must render — no confirmation dialog, per design (Mobbin §2 takeaway 2)");
        assert.equal((approveButton as unknown as { disabled: boolean }).disabled, false);

        (approveButton as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), approveButton, "keyboard focus must actually reach Approve");

        await h.fireEvent(approveButton as never, "click");
        for (let i = 0; i < 6; i++) await h.settle();

        assert.doesNotMatch(
          textOf(body as never),
          /Rome Public Advisory/,
          "the approved row must be GONE after the mandatory re-read — a match that was already true before the click proves nothing",
        );
        assert.match(textOf(body as never), /Firm f2 was created/, "the DB's own returned firm_id must render, verbatim");
        assert.match(textOf(body as never), /onboarding plan p1/, "the DB's own returned plan_id must render, verbatim — never dropped");
        assert.ok(queueCall >= 2, "the queue must have been re-read at least once after the write (hydrate-never-trust)");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
