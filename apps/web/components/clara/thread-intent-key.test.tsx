// #642 AC3 — ONE INTENT, ONE KEY, at the INTEGRATION seam: what the composer actually
// puts on the wire, and what the surface does with the door's answer.
//
// `lib/clara/intentKey.test.ts` proves the algebra. It cannot prove that `sendMessage`
// derives the key from the same inputs the person is looking at, nor that a
// `replayed:true` 202 stops a second bubble being drawn — both of those live in the
// composition, which is where the defect lived.
//
// THE DEFECT, measured: `useClaraThread.sendMessage` called `postTurn(…,
// crypto.randomUUID(), …)`. A fresh uuid per press is the OPPOSITE of idempotency: the
// door's `turn_key` replay lookup (0006:954-960) could never fire from this surface, so
// a retry after a dropped ack was admitted as a SECOND turn with a second bubble and a
// second run. `uq_agent_task_one_live_turn` (0006:165-166) covered only the double-press
// window and stops working the moment the first turn reaches a terminal.
//
// THE INSTRUMENT is the POSTED BODY — every cell reads the `turnKey` the real send path
// serialised, not a value this file computed. Mount shape and the `pressKey` idiom are
// `composer-keyboard.test.tsx`'s, verbatim.

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

const THREAD = "aaaaaaaa-6420-4420-8420-642064206420";
const CLIENT = "bbbbbbbb-6420-4420-8420-642064206420";
const TASK = "cccccccc-6420-4420-8420-642064206420";
const CALLER = "99999999-9999-4999-8999-999999999999";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** An SSE body that opens and immediately ends cleanly, so `openTaskStream` resolves
 *  (which is the ONE instant this app treats a turn as sent) and the reattach loop stops. */
function sse(): Response {
  return new Response(`event: done\ndata: ${JSON.stringify({ taskId: TASK, status: "completed" })}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

type Wire = {
  /** Every turn POST, in order, as the send path actually serialised it. */
  turns: { turnKey: string; parts: unknown[] }[];
  /** How the next turn POST is answered. */
  answer: "error" | "accepted" | "replayed";
  /** Transcript reads — the DISTINCT-resubmit pre-read is counted here. */
  messageReads: number;
  runReads: number;
};

function withFetch(wire: Wire, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && url.includes(`/chat/${THREAD}/turns`)) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { turnKey: string; parts: unknown[] };
      wire.turns.push({ turnKey: body.turnKey, parts: body.parts });
      if (wire.answer === "error") return json({ error: "internal" }, 500);
      return json({ task_id: TASK, replayed: wire.answer === "replayed" }, 202);
    }
    if (url.includes(`/tasks/${TASK}/stream`)) return sse();
    if (url.includes(`/chat/sessions/${THREAD}/messages`)) {
      wire.messageReads += 1;
      return json({ messages: [] });
    }
    if (url.includes("agent_tasks_visible")) {
      wire.runReads += 1;
      return json([]);
    }
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
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ClaraThreadView, {
      auth: { getAccessToken: async () => TOKEN },
      threadId: THREAD,
      variant: "rail" as const,
      clientId: CLIENT,
    }),
  });
}

async function pressEnter(node: Stub): Promise<void> {
  const propsKey = Object.keys(node).find((k) => k.startsWith("__reactProps"));
  const onKeyDown = propsKey
    ? (node as Record<string, { onKeyDown?: (e: unknown) => unknown }>)[propsKey]?.onKeyDown
    : undefined;
  if (!onKeyDown) throw new Error("pressEnter: no onKeyDown prop — is the composer really wired?");
  await onKeyDown({
    key: "Enter",
    shiftKey: false,
    target: node,
    currentTarget: node,
    nativeEvent: { key: "Enter", isComposing: false },
    preventDefault() {},
    stopPropagation() {},
    persist() {},
  });
}

const composer = (h: { find: (p: (n: Stub) => boolean) => Stub | null }): Stub => {
  const node = h.find((n) => n.tagName === "TEXTAREA");
  assert.ok(node, "the composer textarea must be mounted");
  return node;
};

async function settle(h: { settle: () => Promise<void> }, times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

const provisionalBubbles = (h: { container: Stub }): number => {
  let n = 0;
  (function walk(node: Stub) {
    const cls = typeof node.getAttribute === "function"
      ? (node.getAttribute as (a: string) => string | null)("class")
      : null;
    if (typeof cls === "string" && cls.includes("border-dashed")) n += 1;
    for (const c of (node.childNodes as Stub[] | undefined) ?? []) walk(c);
  })(h.container);
  return n;
};

test("p642.web.intent_key_survives_a_refusal — a refused send keeps the draft, and the RETRY posts the SAME key", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: [], answer: "error", messageReads: 0, runReads: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "book the invoice from Rome"));
      await pressEnter(composer(h));
      await settle(h);
      assert.equal(wire.turns.length, 1, "the first press posted");
      // #614 A7 — the text stays in the composer on a refusal, which is exactly what makes
      // the retry's inputs identical to the first attempt's.
      assert.equal(claraThreadStore.getDraft(CLIENT, THREAD), "book the invoice from Rome");

      await pressEnter(composer(h));
      await settle(h);
      assert.equal(wire.turns.length, 2, "the retry posted");
      assert.equal(wire.turns[1].turnKey, wire.turns[0].turnKey,
        "the retry must carry the ORIGINAL key so the door's replay branch can deduplicate it");
      assert.match(wire.turns[0].turnKey, /^intent-[0-9a-f]{32}$/, "…and it is a content address, not a uuid");
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.intent_key — a CHANGED sentence derives a NEW key, so a new intent gets a new identity", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: [], answer: "error", messageReads: 0, runReads: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "book the invoice from Rome"));
      await pressEnter(composer(h));
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "book the invoice from Milan"));
      await pressEnter(composer(h));
      await settle(h);
      assert.equal(wire.turns.length, 2);
      assert.notEqual(wire.turns[1].turnKey, wire.turns[0].turnKey);
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.distinct_resubmit_reads_state_first — a DIFFERENT intent after an unknown outcome re-reads run + messages BEFORE posting; a SAME-key retry does not", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: [], answer: "error", messageReads: 0, runReads: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "book the invoice from Rome"));
      await pressEnter(composer(h));
      await settle(h);
      // The first send's outcome is now UNKNOWN: a 500 says nothing about whether the
      // turn landed.
      const readsAfterFirst = { messages: wire.messageReads, runs: wire.runReads };

      // A SAME-key retry: no pre-read. The door's own lookup runs under the per-firm
      // advisory lock (0006:952) and is strictly better than a client read that would
      // race the admission it is meant to protect.
      await pressEnter(composer(h));
      await settle(h);
      assert.equal(wire.messageReads, readsAfterFirst.messages, "a same-key retry must not gate on a transcript read");
      assert.equal(wire.runReads, readsAfterFirst.runs, "…nor on a run read");

      // A DIFFERENT intent: nothing protects it, so this tab looks first.
      await h.act(() => setFieldValue(composer(h), "actually, book the Milan one"));
      await pressEnter(composer(h));
      await settle(h);
      assert.ok(wire.messageReads > readsAfterFirst.messages, "a distinct resubmit re-reads the transcript first");
      assert.ok(wire.runReads > readsAfterFirst.runs, "…and the run");
      assert.equal(wire.turns.length, 3);
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.replayed_draws_no_second_bubble — a `replayed:true` 202 says so ONCE and draws no second bubble", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: [], answer: "replayed", messageReads: 0, runReads: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "book the invoice from Rome"));
      await pressEnter(composer(h));
      await settle(h);
      assert.equal(wire.turns.length, 1);
      assert.match(h.text(), /Clara already had that message/, "the reader is told, rather than left wondering");
      assert.equal(provisionalBubbles(h), 0,
        "a replay must draw NO provisional bubble — the original user row is already in the transcript");
    } finally {
      await h.unmount();
    }
  });
});

test("VACUITY CONTROL — a FRESH admission DOES draw the provisional bubble and says nothing about a replay", async () => {
  // Without this arm the cell above passes on a surface that never draws a bubble at all
  // and never renders the line, which is exactly what a broken render would produce.
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: [], answer: "accepted", messageReads: 0, runReads: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "book the invoice from Rome"));
      await pressEnter(composer(h));
      await settle(h);
      assert.equal(wire.turns.length, 1);
      assert.equal(provisionalBubbles(h), 1, "a fresh admission draws exactly one provisional bubble");
      assert.doesNotMatch(h.text(), /Clara already had that message/);
    } finally {
      await h.unmount();
    }
  });
});
