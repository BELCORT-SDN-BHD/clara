// H-24 — Enter sends the composer, and the four ways it must NOT.
//
// THE DEFECT. The Ask-Clara composer is a raw `<textarea>` and had no key handler at
// all — its only binding was `onChange`. A `<textarea>` inside a form does not submit
// on Enter the way a single-line `<input>` does, so Enter inserted a newline and the
// turn was never posted: the text stayed in the box with Send still enabled, which is
// exactly what the owner reported.
//
// THE INSTRUMENT. The keydown handler is a prop on the real committed node, so these
// cells read `__reactProps$…`'s `onKeyDown` and call it — the same mechanism
// `clickButton` uses for `onClick`, and for the same reason (this harness's `fireEvent`
// dispatches only through the container's delegated listener). The POST COUNT to
// `/api/runtime/chat/{id}/turns` is the discriminating post-condition throughout: it is
// zero before any send and can only be raised by the real `sendMessage` path.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD = "aaaaaaaa-2222-4222-8222-222222222222";
const CLIENT = "bbbbbbbb-2222-4222-8222-222222222222";
const CALLER = "99999999-9999-4999-8999-999999999999";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Wire = { turns: number };

function withFetch(wire: Wire, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && url.includes(`/chat/${THREAD}/turns`)) {
      wire.turns += 1;
      // A 429 with no reset copy: the turn is REFUSED, so nothing downstream opens an
      // SSE stream this harness would then have to hold. What is under test is whether
      // the send path was entered at all, and the counter above records that.
      return json({ error: "rate_limited" }, 429);
    }
    if (url.includes(`/chat/sessions/${THREAD}/messages`)) return json({ messages: [] });
    if (url.includes("agent_tasks_visible")) return json([]);
    if (url.includes("/rest/v1/document_intakes_visible")) return json([]);
    if (url.includes("/rest/v1/onboarding_plans")) return json([]);
    if (url.includes("caller_context")) return json([]);
    if (url.includes("/rest/v1/")) return json([]);
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

function view(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null,
      createElement("h1", null, "Composer"),
      createElement(ClaraThreadView, {
        auth: { getAccessToken: async () => TOKEN },
        threadId: THREAD,
        variant: "rail" as const,
        clientId: CLIENT,
      }),
    ),
  });
}

/** Invokes the node's OWN `onKeyDown` prop, exactly as `clickButton` invokes `onClick`
 *  and for the same measured reason (this harness's `fireEvent` reaches only the
 *  container's delegated listener). `preventDefault` is recorded so a cell can assert
 *  the newline was suppressed — the other half of "Enter sends". */
async function pressKey(
  node: Stub,
  key: string,
  opts: { shiftKey?: boolean; isComposing?: boolean } = {},
): Promise<{ defaultPrevented: boolean }> {
  const propsKey = Object.keys(node).find((k) => k.startsWith("__reactProps"));
  const onKeyDown = propsKey
    ? (node as Record<string, { onKeyDown?: (e: unknown) => unknown }>)[propsKey]?.onKeyDown
    : undefined;
  if (!onKeyDown) throw new Error("pressKey: no onKeyDown prop on this node — is the composer really wired?");
  let defaultPrevented = false;
  await onKeyDown({
    key,
    shiftKey: opts.shiftKey ?? false,
    target: node,
    currentTarget: node,
    nativeEvent: { key, isComposing: opts.isComposing ?? false },
    preventDefault() { defaultPrevented = true; },
    stopPropagation() {},
    persist() {},
  });
  return { defaultPrevented };
}

function composer(h: { find: (p: (n: Stub) => boolean) => Stub | null }): Stub {
  const node = h.find((n) => n.tagName === "TEXTAREA");
  assert.ok(node, "the composer textarea must be mounted");
  return node;
}

async function settle(h: { settle: () => Promise<void> }, times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

test("ENTER on a non-empty draft posts the turn exactly once AND suppresses the newline", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = composer(h);
      await h.act(() => setFieldValue(box, "code this invoice"));
      const result = await pressKey(box, "Enter");
      await settle(h);
      assert.equal(result.defaultPrevented, true, "an Enter that sends must not also type a newline");
      assert.equal(wire.turns, 1);
    } finally {
      await h.unmount();
    }
  });
});

test("SHIFT+ENTER inserts a newline and posts nothing", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = composer(h);
      await h.act(() => setFieldValue(box, "line one"));
      const result = await pressKey(box, "Enter", { shiftKey: true });
      await settle(h);
      assert.equal(result.defaultPrevented, false, "Shift+Enter must fall through to the browser's own newline");
      assert.equal(wire.turns, 0, "a multi-line instruction to Clara is still being written");
    } finally {
      await h.unmount();
    }
  });
});

test("ENTER while an IME is COMPOSING posts nothing — zh/ms candidate commits fire Enter", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = composer(h);
      await h.act(() => setFieldValue(box, "请帮我"));
      const result = await pressKey(box, "Enter", { isComposing: true });
      await settle(h);
      assert.equal(result.defaultPrevented, false, "the IME's own Enter must reach the IME");
      assert.equal(wire.turns, 0, "committing a candidate is not sending a turn");
    } finally {
      await h.unmount();
    }
  });
});

test("ENTER on an empty or whitespace-only draft posts nothing — the SAME gate the Send button reads", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = composer(h);

      // Empty: the button is disabled here, and Enter must refuse for the same reason.
      const send = h.find((n) => n.tagName === "BUTTON" && /^(Send|Sending)/.test(String(n.textContent ?? "")));
      await pressKey(box, "Enter");
      await settle(h);
      assert.equal(wire.turns, 0);

      await h.act(() => setFieldValue(box, "   "));
      // The gate is ONE predicate read by both: if the button is enabled on whitespace
      // this assertion is the thing that catches it, not a second opinion about it.
      if (send) assert.equal((send as { disabled?: boolean }).disabled, true, "Send must refuse a whitespace-only draft");
      await pressKey(box, "Enter");
      await settle(h);
      assert.equal(wire.turns, 0, "Enter can never post what the button refuses to post");

      // And the positive control: the same box, with real text, does post — so the
      // zeroes above are a refusal, not a broken instrument.
      await h.act(() => setFieldValue(box, "now a real question"));
      await pressKey(box, "Enter");
      await settle(h);
      assert.equal(wire.turns, 1);
    } finally {
      await h.unmount();
    }
  });
});

test("ENTER WHILE A TURN IS ALREADY IN FLIGHT posts nothing — the gate is the button's OWN predicate", async () => {
  // THE CELL THE MUTANT PANEL DEMANDED. The four cases above all happen to be refused a
  // SECOND time downstream: `useClaraThread.sendMessage` returns early on an empty or
  // whitespace draft and on a null thread id, so a mutant that narrowed this composer's
  // guard to `!threadId` still produced no POST and every one of those cells stayed
  // green. `busy` is the predicate NOTHING downstream repeats — `sendMessage` will
  // happily post a second turn over a first — so this is the case that actually
  // discriminates "Enter reads the Send button's own disabled predicate" from "Enter
  // reads some weaker guard of its own".
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = composer(h);
      await h.act(() => setFieldValue(box, "a real question"));

      // A turn is in flight. This is the store's own "sending" state, set the same way
      // `sendMessage` sets it, so the view reads exactly what production would.
      await h.act(() => claraThreadStore.beginSend(THREAD));

      // ASSERT THE GATE, THEN ACT (the clickButton law, applied to a key): the button
      // must be refusing here, or this cell proves nothing about the key agreeing with it.
      const send = h.find((n) => n.tagName === "BUTTON" && /^(Send|Sending)/.test(String(n.textContent ?? "")));
      assert.ok(send, "the Send button must be mounted");
      assert.equal((send as { disabled?: boolean }).disabled, true, "Send must refuse while a turn is in flight");

      const result = await pressKey(box, "Enter");
      await settle(h);
      assert.equal(wire.turns, 0, "Enter can never post what the button refuses to post");
      // AND THE NEWLINE STAYS SUPPRESSED, deliberately. A plain Enter in this composer is
      // a send ATTEMPT, never a newline — Shift+Enter is the newline. Letting a refused
      // attempt fall through to the default action would drop a stray blank line into the
      // human's draft at exactly the moment they are being told to wait.
      assert.equal(result.defaultPrevented, true, "a plain Enter is a send attempt, admitted or not");
    } finally {
      await h.unmount();
    }
  });
});
