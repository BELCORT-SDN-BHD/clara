// #630 — STOP REPLY, at the hook seam.
//
// THE ACCEPTANCE LINE THIS FILE OWNS: "stopping generation does not cancel already accepted Work,
// and closing the rail does neither." Two of those three claims are checkable here without a
// browser, and they are the two that would be easiest to get wrong by accident:
//
//   1. `stopReply` cancels the CHAT-TURN task and nothing else. The Work a turn started is a
//      separate `clara.agent_tasks` row; `packages/runtime/tests/control-work-cancel.test.mjs`
//      proves the DATABASE has no cascade between them, and this proves the browser does not add
//      one by calling a second door.
//   2. CLOSING THE RAIL DOES NEITHER. Unmounting this hook must call no door and abort nothing —
//      a rail that stopped the reply when it was closed would throw away a turn a person meant to
//      come back to, and one that cancelled Work would be worse.
//
// The third claim (a stopped stream keeps its partial prose with a "Stopped" marker) is a rendered
// property and belongs to the browser walk.

import assert from "node:assert/strict";
import { test } from "node:test";

import { enableDomInspection } from "../../test/domInspect";
import { renderHook } from "../../test/hookHarness";
import { claraThreadStore } from "./threadStore";
import type { SessionTokenAccessor } from "@/lib/session";

enableDomInspection();

const THREAD = "11111111-1111-4111-8111-111111111111";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

/** Every PostgREST RPC the hook's lifetime issues, by verb. The door wrapper builds a real URL, so
 *  swapping `fetch` records the WIRE rather than a mock of our own reader. */
async function withRecordedRpc(run: (seen: string[]) => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  // `pgrestRpc` refuses to build a URL without this, and the refusal is caught by `stopReply` —
  // so without it every cell below would pass by never calling anything. The doors suite's own
  // `withMockedFetch` sets the same variable for the same reason.
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const seen: string[] = [];
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    const rpc = /\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) seen.push(rpc[1]!);
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(seen);
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("630 stopReply with no live turn is IDLE — it invents no task to cancel", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withRecordedRpc(async (seen) => {
    const h = await renderHook(() => useClaraThread(session, THREAD));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      let answer: string | null = null;
      await h.act(async () => { answer = await h.current.stopReply(); });
      assert.equal(answer, "idle", "there is no turn in flight, so there is nothing to stop");
      assert.equal(seen.includes("cancel_agent_task"), false, "and no door was called");
    } finally {
      await h.unmount();
    }
  });
});

test("630 stopReply cancels the CHAT-TURN task, and calls no second door", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withRecordedRpc(async (seen) => {
    const h = await renderHook(() => useClaraThread(session, THREAD));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      // A live turn, as the store records one.
      claraThreadStore.markAccepted(THREAD, "task-1");
      await h.act(async () => { await h.current.stopReply(); });
      const doors = seen.filter((fn) => fn !== "get_my_preferences");
      assert.deepEqual(
        doors.filter((fn) => fn.includes("cancel") || fn.includes("work")),
        ["cancel_agent_task"],
        "ONE door: the chat turn's. Cancelling Work is a separately named act on a separate row.",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("630 CLOSING THE RAIL does neither — unmounting calls no door at all", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withRecordedRpc(async (seen) => {
    const h = await renderHook(() => useClaraThread(session, THREAD));
    await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    claraThreadStore.markAccepted(THREAD, "task-2");
    const before = seen.length;
    await h.unmount();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(
      seen.slice(before).filter((fn) => fn.includes("cancel")),
      [],
      "closing the rail must not stop the reply and must not cancel Work — a person may come back",
    );
  });
});

// ===========================================================================================
// #630 fix round — THE ADMISSION WINDOW. The Stop control is visible from the moment a person
// presses Send, and `postTurn` takes hundreds of milliseconds to come back with a task id. A press
// inside that window used to abort nothing, answer `idle`, and let the whole reply stream in behind
// a UI that said "Stopped".
// ===========================================================================================

/** A fetch that accepts the turn POST, records every RPC, and never opens a stream. */
async function withAdmittingFetch(
  run: (seen: string[], release: () => void) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const seen: string[] = [];
  let release: () => void = () => {};
  const admitted = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    const rpc = /\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) seen.push(rpc[1]!);
    if (/\/turns$/.test(url) && (init?.method ?? "GET") === "POST") {
      seen.push("POST:turns");
      await admitted;   // the ADMISSION WINDOW, held open for exactly as long as a cell needs
      return new Response(JSON.stringify({ task_id: "task-admitted" }), {
        status: 202, headers: { "content-type": "application/json" },
      });
    }
    if (/\/stream/.test(url)) {
      seen.push("GET:stream");
      return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(seen, release);
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

/** `claraThreadStore` is module-level and lives for the whole FILE, so a cell that asserts about a
 *  thread with no live turn needs a thread id no earlier cell has claimed. */
const THREAD_ADMIT = "22222222-2222-4222-8222-222222222222";
const THREAD_ABORT = "33333333-3333-4333-8333-333333333333";

test("630 a stop pressed DURING admission is remembered, then spent on the task the runtime returns", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withAdmittingFetch(async (seen, release) => {
    const h = await renderHook(() => useClaraThread(session, THREAD_ADMIT));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      let sent: boolean | null = null;
      let answer: string | null = null;
      await h.act(async () => {
        // The send is IN FLIGHT: `beginSend` has run, `postTurn` is held.
        const sending = h.current.sendMessage("hello").then((v) => { sent = v; });
        await new Promise((r) => setTimeout(r, 0));
        answer = await h.current.stopReply();
        release();
        await sending;
        await new Promise((r) => setTimeout(r, 0));
      });
      assert.equal(answer, "pending",
        "there is nothing to cancel YET, and that is not the same as nothing to cancel");
      assert.equal(sent, false, "…and the send reports it did not open a reply");
      assert.deepEqual(
        seen.filter((fn) => fn === "cancel_agent_task"),
        ["cancel_agent_task"],
        "the remembered stop is spent on the task the runtime handed back — exactly once",
      );
      assert.equal(seen.includes("GET:stream"), false,
        "…and no stream is attached at all: there is nothing for this tab to read");
    } finally {
      await h.unmount();
    }
  });
});

test("630 a stop AFTER admission leaves the composer usable — the send state must not stay `sending`", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withAdmittingFetch(async (_seen, release) => {
    const h = await renderHook(() => useClaraThread(session, THREAD_ABORT));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await h.act(async () => {
        const sending = h.current.sendMessage("hello");
        await new Promise((r) => setTimeout(r, 0));
        await h.current.stopReply();
        release();
        await sending;
        await new Promise((r) => setTimeout(r, 0));
      });
      // MEASURED (review): the abort path resolved the caller without ever transitioning the store,
      // so `sendStatus` stayed "sending" and the textarea and its attachment controls stayed
      // disabled for the life of the mount.
      assert.notEqual(claraThreadStore.getThread(THREAD_ABORT).sendStatus, "sending",
        "the turn was sent; the send state must leave `sending` whatever happened to the stream");
    } finally {
      await h.unmount();
    }
  });
});
