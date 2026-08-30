// GATE (b) — structural a11y scan of the operator approval queue (P4-5,
// design §4 B / §5 ask 8). Ported mocked-fetch/renderComponent style from
// components/firm-admin/firm-admin-a11y.test.tsx's own precedent. See
// test/domInspect.ts's header for why this rides a hand-written rule engine
// rather than real axe-core.
//
// THE TWO POSITIVE CONTROLS THIS ORDER'S ACCEPTANCE LIST NAMES (annex 2 §G):
// a non-operator OWNER is refused, and an operator-firm ADMIN is refused —
// testing only the happy operator path would leave both halves of the
// `is_operator AND role_rank>=owner` conjunction unproven. Both are
// RED-BEFORE'd: deleting `isOperatorConsoleEligible`'s `role_rank`/
// `is_operator` conjunct (returning `true` unconditionally) turns either
// refusal test red, because the mocked queue fetch then throws
// "unexpected fetch" instead of the panel ever reaching it — verified by
// hand before this file shipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { RegistrationsQueuePanel } from "./registrations-queue";
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

function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

function callerContext(is_operator: boolean, role: string, role_rank: number) {
  return [{ user_id: "u1", firm_id: "f1", firm_name: "BELCORT", role, role_rank, is_operator }];
}

const OPEN_REQUEST = {
  id: "r1", applicant: "a1234567-89ab-cdef-0123-456789abcdef", firm_name: "Rome Public Advisory",
  note: "Referred by an existing client.", status: "open", decided_by: null, decided_at: null,
  reason: null, firm_id: null, created_at: "2026-08-30T09:00:00Z",
};

function mockFetch(ctxRows: unknown[], queueThrows = false) {
  return (u: string): Response => {
    if (u.includes("/rest/v1/caller_context")) return jsonResponse(ctxRows);
    if (u.includes("/rest/v1/firm_registration_requests_visible")) {
      if (queueThrows) throw new Error(`unexpected fetch: ${u}`);
      return jsonResponse([OPEN_REQUEST]);
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
}

test("a non-operator OWNER is refused — the queue never renders, zero a11y violations on the refusal state", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(false, "owner", 3), true)(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /does not carry that authority/, "the honest refusal must render");
        assert.doesNotMatch(h.text(), /Rome Public Advisory/, "the queue's own rows must never render for a non-operator");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("an OPERATOR-FIRM ADMIN (rank 2, below owner) is refused — zero a11y violations on the refusal state", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(true, "admin", 2), true)(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /does not carry that authority/, "the honest refusal must render");
        assert.doesNotMatch(h.text(), /Rome Public Advisory/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("POSITIVE CONTROL — an operator-firm OWNER sees the real queue, zero a11y violations once loaded", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(true, "owner", 3))(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        assert.match(h.text(), /Rome Public Advisory/, "the open request must have actually loaded");
        assert.doesNotMatch(h.text(), /does not carry that authority/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the Reject dialog (open, with its required reason textarea) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockFetch(callerContext(true, "owner", 3))(String(u)),
    async () => {
      const h = await renderComponent(App(createElement(RegistrationsQueuePanel), "Firm registrations"));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const trigger = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(trigger, "the Reject trigger must render for the open request");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(textOf(body as never), /Reason for rejecting/, "the reason field must be open");
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
