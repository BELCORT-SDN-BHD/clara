// GATE (c), fold round 5 — the two load-bearing Reject concurrency pins.
// Kept separate from the earlier batteries because both are already beyond
// the repo's 500-line reviewability advisory. The real-browser Escape/focus-
// trap leg remains Wave G; the first cell uses the dialog's real Base UI
// dismiss control to exercise the same controlled `onOpenChange(false)` seam
// while the deferred digest keeps the governed act in flight.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { RegistrationsQueuePanel, rejectKeyFor } from "./registrations-queue";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  disabled?: boolean;
  getAttribute?: (name: string) => string | null;
};

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = findIn(child, predicate);
    if (found) return found;
  }
  return null;
}

function findAllIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const matches: Node[] = [];
  (function walk(node: Node) {
    if (predicate(node)) matches.push(node);
    for (const child of node.childNodes ?? []) walk(child);
  })(root);
  return matches;
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

function App(children: unknown) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Firm registrations"), children as never),
  });
}

const CALLER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALLER_FIRM_ID = "11111111-1111-4111-8111-111111111111";
const CALLER_CONTEXT = [{
  user_id: CALLER_USER_ID,
  firm_id: CALLER_FIRM_ID,
  firm_name: "BELCORT",
  role: "owner",
  role_rank: 3,
  is_operator: true,
}];
const OPEN_REQUEST = {
  id: "r1",
  applicant: "a1234567-89ab-cdef-0123-456789abcdef",
  firm_name: "Rome Public Advisory",
  note: null,
  status: "open",
  decided_by: null,
  decided_at: null,
  reason: null,
  firm_id: null,
  created_at: "2026-08-30T09:00:00Z",
};
const OPEN_REQUEST_2 = {
  ...OPEN_REQUEST,
  id: "r2",
  applicant: "b1234567-89ab-cdef-0123-456789abcdef",
  firm_name: "Alara Test Firm",
};

async function mountEligibleQueue() {
  const h = await renderComponent(App(createElement(RegistrationsQueuePanel)));
  const body = (globalThis as unknown as { document: { body: { appendChild: (child: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}

async function teardown(h: Awaited<ReturnType<typeof mountEligibleQueue>>["h"], body: unknown): Promise<void> {
  await h.unmount();
  const bodyElement = body as unknown as { removeChild: (child: unknown) => void; childNodes?: unknown[] };
  if (bodyElement.childNodes?.includes(h.container)) bodyElement.removeChild(h.container);
  for (let i = 0; i < 3; i++) await h.settle();
}

function deferCryptoDigests() {
  const subtle = globalThis.crypto.subtle;
  const originalOwnDescriptor = Object.getOwnPropertyDescriptor(subtle, "digest");
  const originalDigest = subtle.digest.bind(subtle);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;

  Object.defineProperty(subtle, "digest", {
    configurable: true,
    value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
      calls += 1;
      await gate;
      return originalDigest(...args);
    },
  });

  return {
    calls: () => calls,
    release,
    restore: () => {
      if (originalOwnDescriptor) Object.defineProperty(subtle, "digest", originalOwnDescriptor);
      else delete (subtle as unknown as Record<string, unknown>).digest;
    },
  };
}

test("ROUND 5 PIN 1: Reject owns the page-wide guard before its digest — dismissing row 1 cannot admit row 2", async () => {
  const reason = "Duplicate applicant.";
  const expectedKey = await rejectKeyFor("r1", CALLER_USER_ID, reason);
  let rejectCalls = 0;
  let approveCalls = 0;
  const rejectBodies: Array<Record<string, unknown>> = [];

  await withMockedEnv(
    async (input, init) => {
      const url = String(input);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/reject_firm_registration")) {
        rejectCalls += 1;
        rejectBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ request_id: "r1", status: "rejected" });
      }
      if (url.includes("/rpc/approve_firm_registration")) {
        approveCalls += 1;
        return jsonResponse({ request_id: "r2", firm_id: "f2", plan_id: "p2" });
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        return jsonResponse(rejectCalls === 0 ? [OPEN_REQUEST, OPEN_REQUEST_2] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue();
      let confirmPromise: Promise<void> | null = null;
      let row2RacePromise: Promise<void> | null = null;
      const deferredDigest = deferCryptoDigests();
      try {
        const rejectTriggers = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        const approveBefore = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        assert.equal(rejectTriggers.length, 2, "both rows must expose their Reject trigger before the first act begins");
        assert.equal(approveBefore.length, 2, "both rows must expose their Approve trigger before the first act begins");
        await h.fireEvent(rejectTriggers[0] as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const textarea = findIn(
          body as never,
          (n) => n.tagName === "TEXTAREA" && n.getAttribute?.("id") === "reg-reject-reason-r1",
        );
        assert.ok(textarea, "row 1's reason field must be open");
        await h.act(() => { setFieldValue(textarea as never, reason); });

        const confirm = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.ok(confirm, "row 1's Confirm must render");
        await h.act(() => {
          confirmPromise = clickButton(confirm as never);
          // Same synchronous turn, before React can apply `busy` to either
          // row: only the shared ref guard can stop this different action.
          row2RacePromise = clickButton(approveBefore[1] as never);
        });
        await h.act(async () => { await row2RacePromise; });

        assert.equal(deferredDigest.calls(), 1, "the first Confirm must be suspended at exactly one digest");
        assert.equal(rejectCalls, 0, "the Reject RPC cannot start until the digest resolves");
        assert.equal(approveCalls, 0, "the page-wide guard must drop row 2 synchronously, before busy has rendered");

        // The unit harness cannot dispatch Base UI's document-level Escape
        // listener (that remains the named Wave-G browser cell), so drive the
        // same controlled close seam through its real X dismiss control.
        const close = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Close");
        assert.ok(close, "the dialog's dismiss control must remain available while hashing");
        await h.act(() => clickButton(close as never));
        for (let i = 0; i < 3; i++) await h.settle();
        assert.doesNotMatch(textOf(body as never), /Reason for rejecting/, "the dialog must really close while its act remains in flight");

        const approveButtons = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Approve");
        const laterRejectTriggers = findAllIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.equal(approveButtons.length, 2);
        assert.equal(laterRejectTriggers.length, 2);
        for (const control of [...approveButtons, ...laterRejectTriggers]) {
          assert.equal(control.disabled, true, "every row's action controls must be globally disabled before the digest resolves");
        }

        let blockedAttempt: unknown;
        await h.act(async () => {
          try {
            await clickButton(approveButtons[1] as never);
          } catch (error) {
            blockedAttempt = error;
          }
        });
        assert.match(String(blockedAttempt), /DISABLED/, "a real row-2 click attempt must be rejected by the live disabled gate");
        assert.equal(approveCalls, 0, "row 2 must not reach its Approve RPC while row 1 hashes");
        assert.equal(rejectCalls, 0, "row 1 still has not reached its Reject RPC while the digest is held");

        deferredDigest.release();
        await h.act(async () => { await confirmPromise; });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(approveCalls, 0, "no second governed act may have raced the original Reject");
        assert.equal(rejectCalls, 1, "digest resolution must admit exactly the original Reject RPC");
        assert.equal(rejectBodies.length, 1);
        assert.equal(rejectBodies[0]?.p_request, "r1");
        assert.equal(rejectBodies[0]?.p_reason, reason);
        assert.equal(rejectBodies[0]?.p_op_key, expectedKey, "the delayed digest must still produce the stable deterministic key");
      } finally {
        deferredDigest.release();
        if (confirmPromise) await h.act(async () => { await confirmPromise?.catch(() => {}); });
        if (row2RacePromise) await h.act(async () => { await row2RacePromise?.catch(() => {}); });
        deferredDigest.restore();
        await teardown(h, body);
      }
    },
  );
});

test("ROUND 5 PIN 2: two Reject Confirms inside one act emit exactly one RPC", async () => {
  let queueReads = 0;
  let rejectCalls = 0;

  await withMockedEnv(
    async (input) => {
      const url = String(input);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
      if (url.includes("/rpc/reject_firm_registration")) {
        rejectCalls += 1;
        return jsonResponse({ request_id: "r1", status: "rejected" });
      }
      if (url.includes("/rest/v1/firm_registration_requests_visible")) {
        queueReads += 1;
        return jsonResponse(queueReads === 1 ? [OPEN_REQUEST] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const { h, body } = await mountEligibleQueue();
      try {
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject");
        assert.ok(trigger, "the Reject trigger must render");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(textarea, "the reason field must be open");
        await h.act(() => { setFieldValue(textarea as never, "Duplicate applicant."); });
        const confirm = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Reject registration");
        assert.ok(confirm, "Confirm must render after typing a reason");

        await h.act(async () => {
          const first = clickButton(confirm as never);
          const second = clickButton(confirm as never);
          await Promise.all([first, second]);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(rejectCalls, 1, "the synchronous second Confirm must be a no-op before it can reach the RPC");
      } finally {
        await teardown(h, body);
      }
    },
  );
});
