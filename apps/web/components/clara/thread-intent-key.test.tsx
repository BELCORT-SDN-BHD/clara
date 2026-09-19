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

/** A turn that actually SETTLES: the terminal `message` (the authority that the turn
 *  ended — `lib/clara/stream.ts`'s header) followed by `done`. It is the terminal message
 *  that makes `attachClaraStream` re-read the persisted transcript, which is how the
 *  conversation moves on under the composer. */
function sseSettled(): Response {
  const message = JSON.stringify({ status: "completed", parts: [{ type: "text", text: "Done." }] });
  const done = JSON.stringify({ taskId: TASK, status: "completed" });
  return new Response(`event: message\ndata: ${message}\n\nevent: done\ndata: ${done}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

type MessageRowish = {
  id: string;
  role: "user" | "assistant";
  parts: unknown[];
  turn_key: string | null;
  task_id: string | null;
  seq: number;
  created_at: string;
};

type Wire = {
  /** Every turn POST, in order, as the send path actually serialised it. */
  turns: { turnKey: string; parts: unknown[] }[];
  /** How the next turn POST is answered. `door` is the only arm that behaves like
   *  `clara.begin_chat_turn`: it REMEMBERS the keys it has admitted, answers
   *  `replayed:true` for a key it has seen (returning the ORIGINAL task and inserting
   *  nothing — 0006:954-960 returns before it ever reads `p_user_parts`), and appends a
   *  persisted user row for a key it has not. The three fixed arms above cannot express
   *  the defect ADV-642-1 is about, because they answer the same way whatever is posted. */
  answer: "error" | "accepted" | "replayed" | "door";
  /** Transcript reads — the DISTINCT-resubmit pre-read is counted here. */
  messageReads: number;
  runReads: number;
  /** What the `door` arm answered each POST, in order. */
  replays: boolean[];
  /** The PERSISTED transcript, as the messages endpoint serves it. The `door` arm grows
   *  it on a fresh admission and the stream arm grows it again when the turn settles —
   *  which is the whole point: a conversation that has moved on. */
  transcript: MessageRowish[];
  /** Keys the door has already admitted. */
  admitted: Set<string>;
};

const newWire = (answer: Wire["answer"]): Wire => ({
  turns: [], answer, messageReads: 0, runReads: 0, replays: [], transcript: [], admitted: new Set<string>(),
});

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
      if (wire.answer === "door") {
        const replayed = wire.admitted.has(body.turnKey);
        wire.replays.push(replayed);
        if (!replayed) {
          wire.admitted.add(body.turnKey);
          wire.transcript.push({
            id: `u${wire.transcript.length + 1}`, role: "user", parts: body.parts,
            turn_key: body.turnKey, task_id: TASK, seq: wire.transcript.length + 1,
            created_at: new Date().toISOString(),
          });
        }
        return json({ task_id: TASK, replayed }, 202);
      }
      return json({ task_id: TASK, replayed: wire.answer === "replayed" }, 202);
    }
    if (url.includes(`/tasks/${TASK}/stream`)) {
      if (wire.answer !== "door") return sse();
      // The turn SETTLES: the assistant's row is persisted and the terminal `message`
      // arrives, which is what makes `attachClaraStream` re-read the transcript. This is
      // the ordinary end of a turn, not an exotic one.
      wire.transcript.push({
        id: `a${wire.transcript.length + 1}`, role: "assistant", parts: [{ type: "text", text: "Done." }],
        turn_key: null, task_id: TASK, seq: wire.transcript.length + 1,
        created_at: new Date().toISOString(),
      });
      return sseSettled();
    }
    if (url.includes(`/chat/sessions/${THREAD}/messages`)) {
      wire.messageReads += 1;
      return json({ messages: wire.transcript });
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

/** `noUncheckedIndexedAccess` is on: a cell that read `wire.turns[1].turnKey` off a list
 *  with one entry would crash rather than fail, and the message would be about a property
 *  of undefined instead of about the send path. */
function postedKey(wire: Wire, at: number): string {
  const turn = wire.turns[at];
  assert.ok(turn, `expected a POST at index ${at}; the wire saw ${wire.turns.length}`);
  return turn.turnKey;
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
  const wire: Wire = newWire("error");
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
      assert.equal(postedKey(wire, 1), postedKey(wire, 0),
        "the retry must carry the ORIGINAL key so the door's replay branch can deduplicate it");
      assert.match(postedKey(wire, 0), /^intent-[0-9a-f]{32}$/, "…and it is a content address, not a uuid");
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.intent_key — a CHANGED sentence derives a NEW key, so a new intent gets a new identity", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = newWire("error");
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
      assert.notEqual(postedKey(wire, 1), postedKey(wire, 0));
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.distinct_resubmit_reads_state_first — a DIFFERENT intent after an unknown outcome re-reads run + messages BEFORE posting; a SAME-key retry does not", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = newWire("error");
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
  const wire: Wire = newWire("replayed");
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
  const wire: Wire = newWire("accepted");
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

test("p642.web.repeated_utterance_is_a_NEW_intent — the SAME sentence sent again AFTER a settled turn is admitted, not swallowed", async () => {
  // THE DEFECT (fix round 1, review finding ADV-642-1 / STANDARDS F1, severity blocker).
  // The address was `(threadId, altitude, text, sorted attachment ids)` and NOTHING that
  // advances with the conversation, so every REPEATED utterance in a session derived the
  // key of the first one and landed on `begin_chat_turn`'s replay branch — which returns
  // the original task and never reads `p_user_parts` (0006:954-960 returns before the
  // insert at :995-996). In an agent chat the repeated utterance IS the common case
  // ("yes", "ok", "continue", "post it"), the lookup has no time or state bound, and
  // `chat_messages` is append-only: the collapse was PERMANENT for the life of the
  // session. The person's second "yes" produced no bubble, no task, no run and no error —
  // only "Clara already had that message".
  //
  // THE FIX is one more field in the address: the conversation's POSITION (the count and
  // last id of the persisted rows this composer has seen). A retry is unaffected, because
  // a refused or lost send adds nothing to the transcript — which is exactly what the
  // three cells above and `p642.e2e.duplicate_send` hold fixed, and they are this cell's
  // vacuity control: if position made every press a new key, they would red.
  claraThreadStore.reset(THREAD);
  const wire: Wire = newWire("door");
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await h.act(() => setFieldValue(composer(h), "yes"));
      await pressEnter(composer(h));
      await settle(h, 12);
      assert.equal(wire.turns.length, 1, "the first 'yes' posted");
      assert.equal(wire.replays.at(0), false, "…and the door admitted it");
      assert.equal(claraThreadStore.getThread(THREAD).messages.length, 2,
        "the fixture must have SETTLED the turn — two persisted rows — or this cell proves nothing");

      // The conversation has moved on. The person answers a LATER question with the same
      // word, which is a genuinely new instruction.
      await h.act(() => setFieldValue(composer(h), "yes"));
      await pressEnter(composer(h));
      await settle(h, 12);

      assert.equal(wire.turns.length, 2, "the second 'yes' reached the door");
      assert.notEqual(postedKey(wire, 1), postedKey(wire, 0),
        "a repeated utterance AFTER a settled turn is a NEW intent and must carry a NEW key");
      assert.equal(wire.replays.at(1), false,
        "…so the door admits it rather than answering with the turn it already ran");
      assert.doesNotMatch(h.text(), /Clara already had that message/,
        "the surface must not tell the person their new instruction was already handled");
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.distinct_resubmit_reads_state_first — a REMOUNT does not lose the pre-read (the last key is not mount-scoped)", async () => {
  // Fix round 1, review finding ADV-642-4. The pre-read was gated on `priorKey !== null`,
  // where `priorKey` came from a per-MOUNT `useRef` while the `sendStatus === "error"` it
  // pairs with lives in the module-level store. After a rail close/reopen, a scope switch
  // back, or any remount following a failed send, the ref was null, the conjunct was
  // false, and a genuinely DIFFERENT intent posted with no state re-read at all — the one
  // case the brief says nothing else protects, because a different key cannot reach the
  // door's replay branch.
  claraThreadStore.reset(THREAD);
  const wire: Wire = newWire("error");
  await withFetch(wire, async () => {
    const first = await renderComponent(view());
    try {
      await settle(first);
      await first.act(() => setFieldValue(composer(first), "book the invoice from Rome"));
      await pressEnter(composer(first));
      await settle(first);
      assert.equal(claraThreadStore.getThread(THREAD).sendStatus, "error", "the fixture must leave the outcome UNKNOWN");
    } finally {
      await first.unmount();
    }

    const second = await renderComponent(view());
    try {
      await settle(second);
      const reads = { messages: wire.messageReads, runs: wire.runReads };
      await second.act(() => setFieldValue(composer(second), "actually, book the Milan one"));
      await pressEnter(composer(second));
      await settle(second);
      assert.ok(wire.messageReads > reads.messages,
        "a DIFFERENT intent after an unknown outcome must re-read the transcript, even on a fresh mount");
      assert.ok(wire.runReads > reads.runs, "…and the run");
    } finally {
      await second.unmount();
    }
  });
});
