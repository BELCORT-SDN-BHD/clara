// The journey the WHOLE inline-clarify feature stands on: Clara parks mid-run, the
// question appears in the thread, and the human answers it there.
//
// It has to be driven through the LIVE stream, not the persisted transcript, and that
// is the finding this train was re-cut around: `clara.settle_chat_turn`
// (packages/db/migrations/0006_runtime_core.sql:1043-1065) inserts the assistant
// `chat_messages` row AND cancels every still-pending interruption in the same
// statement sequence, so a clarify that has reached `getMessages` can never be
// answerable. A cell that mounted an answer control on a persisted clarify would be
// green about a control production can never show.
//
// The SSE body here is deliberately left OPEN after the clarify chunk — that IS what a
// park looks like on the wire (streamRoute.ts polls to STREAM_MAX_MS and sends the
// terminal `message` only once the task is terminal).

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

enableDomInspection();

/** Roles whose ARIA definition carries an implicit non-off `aria-live`.
 *  Kept in step with test/a11yRules.ts's IMPLICIT_LIVE_ROLES — the assertions
 *  below are about announcement, so an explicit `aria-live` counts too. */
const LIVE_ROLES = new Set(["alert", "log", "status", "marquee", "timer"]);

function attrOf(n: Stub, name: string): string | null {
  const get = n.getAttribute as ((k: string) => string | null) | undefined;
  return typeof get === "function" ? get.call(n, name) : null;
}

function isLiveRegion(n: Stub): boolean {
  if (n.nodeType !== 1) return false;
  const declared = attrOf(n, "aria-live");
  if (declared !== null) return declared.toLowerCase() !== "off";
  const role = attrOf(n, "role");
  return role !== null && LIVE_ROLES.has(role);
}

const regionName = (n: Stub) => attrOf(n, "role") ?? `aria-live=${attrOf(n, "aria-live")}`;

/** The live regions ENCLOSING a node, innermost first — what actually decides
 *  who announces a change to it. Deliberately EXCLUSIVE of the node itself: a
 *  region does not announce its own insertion to a screen reader, its
 *  ancestor-most non-busy live region does. */
function liveRegionAncestors(node: Stub): string[] {
  const out: string[] = [];
  let n = (node.parentNode as Stub | null | undefined) ?? null;
  while (n) {
    if (isLiveRegion(n)) out.push(regionName(n));
    n = (n.parentNode as Stub | null | undefined) ?? null;
  }
  return out;
}

/** Every live region in the tree, by role — the vacuity control's instrument. */
function liveRegionRoles(root: Stub): string[] {
  return findAllIn(root, isLiveRegion).map(regionName);
}

type Stub = Record<string, unknown>;
type Call = { url: string; body: unknown };

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const INTERRUPTION_ID = "33333333-3333-4333-8333-333333333333";
const FIRST_QUESTION = "Which client owns this invoice?";
const SECOND_QUESTION = "Which period should it land in?";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const clarifyFrame = (toolCallId: string, question: string) =>
  `event: chunk\ndata: ${JSON.stringify({ type: "tool-call", toolCallId, toolName: "clarify", input: { question } })}\n\n`;

/** An SSE response that stays open, exactly as a parked task's does. The returned
 *  `close` is called in the test's `finally` so no reader is left pending. */
function parkedStream(frames: string[]): { response: Response; close: () => void } {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      for (const frame of frames) c.enqueue(encoder.encode(frame));
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    close: () => { try { controller?.close(); } catch { /* already closed */ } },
  };
}

function App(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Clara test context"),
      createElement(ClaraThreadView, { auth: session, threadId: THREAD_ID, variant: "full" }),
    ),
  });
}

function withFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response, run: (calls: Call[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  // No runtime-base variable to unset: the chat lane is same-origin (lib/clara/api.ts).
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, body });
    return impl(url, init);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

const buttonNamed = (name: string) => (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === name;

/** `h.find` proves a FIRST match exists; the cell below is about COUNT, which no
 *  `find` can establish (the repo's own N1 lesson, interview-run-a11y.test.tsx:138). */
function findAllIn(root: Stub, predicate: (node: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const walk = (node: Stub) => {
    if (predicate(node)) out.push(node);
    for (const child of (node.childNodes as Stub[] | undefined) ?? []) walk(child);
  };
  walk(root);
  return out;
}

async function sendATurn(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await settleUntil(h, () => h.find((node) => node.tagName === "TEXTAREA") !== null, "composer");
  const textarea = h.find((node) => node.tagName === "TEXTAREA")!;
  await h.act(() => setFieldValue(textarea, "Code this invoice"));
  const form = h.find((node) => node.tagName === "FORM")!;
  await h.fireEvent(form, "submit");
}

test("a PARKED clarify reaches the thread and is answerable there, through the pending row the DB owns", async () => {
  const parked = parkedStream([clarifyFrame("call-1", FIRST_QUESTION)]);
  let row = {
    id: INTERRUPTION_ID, task_id: TASK_ID, kind: "clarify",
    question: { question: FIRST_QUESTION }, answer: null as Record<string, unknown> | null,
    status: "pending", asked_of: null, answered_by: null as string | null,
    expires_at: "2026-09-03T00:00:00Z", created_at: "2026-09-02T00:00:00Z", answered_at: null as string | null,
  };
  try {
    await withFetch(
      (url) => {
        if (url.includes(`/api/runtime/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
        if (url === `/api/runtime/chat/${THREAD_ID}/turns`) return json({ task_id: TASK_ID }, 202);
        if (url === `/api/runtime/tasks/${TASK_ID}/stream`) return parked.response;
        if (url.includes("/rest/v1/rpc/answer_interruption")) {
          row = { ...row, status: "answered", answer: { text: "ROME PROPERTIES" }, answered_by: "u1", answered_at: "2026-09-02T00:05:00Z" };
          return json({ status: "answered" });
        }
        if (url.includes("/rest/v1/agent_interruptions")) return json([row]);
        if (url.includes("/rest/v1/caller_context")) return json([]);
        throw new Error(`unexpected fetch: ${url}`);
      },
      async (calls) => {
        const h = await renderComponent(App());
        try {
          await sendATurn(h);
          await settleUntil(h, () => h.text().includes(FIRST_QUESTION), "the parked question in the thread");
          // Not merely rendered — ANSWERABLE, and only because a pending row was read.
          await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "the inline answer control");
          const read = calls.find((call) => call.url.includes("/rest/v1/agent_interruptions"));
          assert.ok(read);
          assert.match(read.url, new RegExp(`task_id=eq\\.${TASK_ID}`), "the card is addressed by the task the stream is attached to");
          assert.match(read.url, /status=eq\.pending/);

          const input = h.find((node) => node.tagName === "INPUT" && node.type !== "file");
          assert.ok(input);
          await h.act(() => setFieldValue(input, "ROME PROPERTIES"));
          await h.act(() => clickButton(h.find(buttonNamed("Answer"))!));
          await settleUntil(h, () => /Answered by your firm/.test(h.text()), "the answered state");

          const door = calls.find((call) => call.url.includes("/rest/v1/rpc/answer_interruption"));
          assert.ok(door, "answering in the thread must call the SAME governed door the Journals pane calls");
          assert.deepEqual((door.body as { p_answer: unknown }).p_answer, { text: "ROME PROPERTIES" });
          assert.equal((door.body as { p_id: unknown }).p_id, INTERRUPTION_ID);

          assert.deepEqual(checkAccessibility(h.container as never), []);
          assert.deepEqual(checkKeyboardWalk(h.container as never), []);

          // THE ANNOUNCER, ASSERTED (review R3-M2). P6-3 moved this card OUT of
          // the transcript log to stop a live region nesting inside another one,
          // and the correctness argument for that move is that the card owns its
          // own `role="status"` and keeps announcing. Before the move the log was
          // a backstop; after it, ClarifyCard's status region is LOAD-BEARING —
          // and it had no cell. Deleting it left the whole 2080-test suite green,
          // which is a new behaviour shipped with nothing guarding it.
          //
          // Asserted as a STRUCTURAL fact about the rendered tree rather than as
          // a class-string read: the answered text sits inside exactly ONE live
          // region, and that region is not the transcript log.
          // The <p> carrying the text, not the region around it: a live region
          // does not announce its own insertion, its enclosing one does, so the
          // question "who announces this?" is only meaningful about a node
          // INSIDE the region.
          const answered = h.find((node) => node.tagName === "P" && /Answered by your firm/.test(textOf(node)));
          assert.ok(answered, "the answered confirmation must be in the tree");
          const enclosing = liveRegionAncestors(answered as Stub);
          assert.equal(
            enclosing.length,
            1,
            `the answered confirmation must sit inside exactly ONE live region, found ${JSON.stringify(enclosing)}`,
          );
          assert.equal(enclosing[0], "status", "…and that region is the card's own status, not the transcript log");

          // The whole tree: three live regions, exactly one of them announcing
          // the answer, zero nested. The count is the vacuity control — a tree
          // that rendered none of them would satisfy the assertion above.
          const allRegions = liveRegionRoles(h.container as Stub);
          assert.deepEqual(allRegions.sort(), ["log", "status", "status"], "the transcript log, the card's status, and the stream-status line");
        } finally {
          await h.unmount();
        }
      },
    );
  } finally {
    parked.close();
  }
});

test("with two clarify rounds live, ONLY the still-parked one carries a control — the answered one is read-only", async () => {
  const parked = parkedStream([clarifyFrame("call-1", FIRST_QUESTION), clarifyFrame("call-2", SECOND_QUESTION)]);
  // The DB allows at most one pending interruption per task (open_interruption's CLR13
  // linearization), so this read is the SECOND question's row. A card that offered the
  // FIRST question a control would deliver an answer typed for one question to another.
  const pendingSecond = {
    id: INTERRUPTION_ID, task_id: TASK_ID, kind: "clarify",
    question: { question: SECOND_QUESTION }, answer: null,
    status: "pending", asked_of: null, answered_by: null,
    expires_at: "2026-09-03T00:00:00Z", created_at: "2026-09-02T00:02:00Z", answered_at: null,
  };
  try {
    await withFetch(
      (url) => {
        if (url.includes(`/api/runtime/chat/sessions/${THREAD_ID}/messages`)) return json({ messages: [] });
        if (url === `/api/runtime/chat/${THREAD_ID}/turns`) return json({ task_id: TASK_ID }, 202);
        if (url === `/api/runtime/tasks/${TASK_ID}/stream`) return parked.response;
        if (url.includes("/rest/v1/agent_interruptions")) return json([pendingSecond]);
        if (url.includes("/rest/v1/caller_context")) return json([]);
        throw new Error(`unexpected fetch: ${url}`);
      },
      async () => {
        const h = await renderComponent(App());
        try {
          await sendATurn(h);
          await settleUntil(h, () => h.text().includes(SECOND_QUESTION), "both live questions");
          await settleUntil(h, () => h.find(buttonNamed("Answer")) !== null, "the one answer control");
          assert.match(h.text(), new RegExp(FIRST_QUESTION), "the earlier question stays in the thread, read-only");

          assert.equal(
            findAllIn(h.container, buttonNamed("Answer")).length,
            1,
            "exactly one clarify in a run is answerable at a time",
          );
          assert.equal(
            findAllIn(h.container, (node) => node.tagName === "INPUT" && node.type !== "file").length,
            1,
            "the answered round must not offer a second answer field",
          );
        } finally {
          await h.unmount();
        }
      },
    );
  } finally {
    parked.close();
  }
});
