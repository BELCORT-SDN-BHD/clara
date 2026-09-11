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

/** A fetch that accepts (or refuses) the turn POST, records every RPC, and never opens a stream.
 *  `admit` decides what the held POST finally answers; `cancelAnswer` decides what the cancel door
 *  answers, so a cell can drive the machine's `failed` arms without mocking the hook itself. */
async function withAdmittingFetch(
  run: (seen: string[], release: () => void) => Promise<void>,
  opts: {
    admit?: boolean;
    cancelAnswer?: () => Response;
  } = {},
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
    if (rpc?.[1] === "cancel_agent_task" && opts.cancelAnswer) return opts.cancelAnswer();
    if (/\/turns$/.test(url) && (init?.method ?? "GET") === "POST") {
      seen.push("POST:turns");
      await admitted;   // the ADMISSION WINDOW, held open for exactly as long as a cell needs
      if (opts.admit === false) {
        return new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429, headers: { "content-type": "application/json" },
        });
      }
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

/** A governed refusal on the wire, in the shape `lib/wire.ts` classifies into a `RefusalError`. */
function refusal(code: string, message: string, reason: string | null = null): Response {
  return new Response(
    JSON.stringify({ code, message, details: reason === null ? null : JSON.stringify({ reason }) }),
    { status: 400, headers: { "content-type": "application/json" } },
  );
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
      assert.equal(sent, true,
        "…and the turn WAS admitted, so the composer forgets its text: it is in the transcript");
      assert.equal(h.current.stop.phase, "stopped",
        "the deferred door answered, and its answer — not the press — is what the machine records");
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

test("630 a stop AFTER admission, before the stream opens, leaves the composer usable", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  // THE CELL HAS TO REACH THE ABORT PATH, and the previous cut did not: pressing Stop while the
  // POST was still held takes the PENDING branch, which returns before any stream is attached, so
  // `attachClaraStream`'s abort catch — the code the X2 fix lives in — never ran and the cell was
  // green against the defect. Here the turn is admitted FIRST (`activeTaskId` is set), the stream
  // fetch is held open, and only then is Stop pressed: that is the abort path and nothing else.
  let openStream: () => void = () => {};
  const streamHeld = new Promise<void>((resolve) => { openStream = resolve; });
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (/\/turns$/.test(url) && (init?.method ?? "GET") === "POST") {
      return new Response(JSON.stringify({ task_id: "task-abort" }), {
        status: 202, headers: { "content-type": "application/json" },
      });
    }
    if (/\/stream/.test(url)) {
      await streamHeld;                       // the window between acceptance and the open SSE read
      const signal = init?.signal;
      if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const h = await renderHook(() => useClaraThread(session, THREAD_ABORT));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      let sent: boolean | null = null;
      await h.act(async () => {
        const sending = h.current.sendMessage("hello").then((v) => { sent = v; });
        // Wait for the ACCEPTANCE, so the store holds a task id and `stopReply` takes the direct
        // arm — the pending arm would return before any stream existed.
        for (let i = 0; i < 40 && claraThreadStore.getThread(THREAD_ABORT).activeTaskId === null; i += 1) {
          await new Promise((r) => setTimeout(r, 1));
        }
        assert.equal(claraThreadStore.getThread(THREAD_ABORT).activeTaskId, "task-abort",
          "precondition: the turn is ADMITTED and the stream has not opened");
        await h.current.stopReply();
        openStream();
        await sending;
        await new Promise((r) => setTimeout(r, 0));
      });
      // MEASURED (review): the abort path resolved the caller without ever transitioning the store,
      // so `sendStatus` stayed "sending" and the textarea and its attachment controls stayed
      // disabled for the life of the mount.
      assert.notEqual(claraThreadStore.getThread(THREAD_ABORT).sendStatus, "sending",
        "the turn was sent; the send state must leave `sending` whatever happened to the stream");
      assert.equal(sent, true,
        "…and the turn is on the record, so its text is forgotten rather than left to be sent twice");
    } finally {
      await h.unmount();
    }
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

// ===========================================================================================
// #630 fix round 3 — THE STOP-REPLY STATE MACHINE, stated once and pinned arm by arm.
//
//   idle  --press during admission-->  pending  --task id + door--> stopped | failed
//   idle  --press after admission -->  pending  --abort + door  --> stopped | failed
//
// `pending` is an INTENT, never an outcome: nothing says "Stopped" until a door has answered.
// It is spent on exactly the turn it was pressed for and on no other, and it dies with a turn
// the runtime refuses.
// ===========================================================================================

const THREAD_REFUSED = "44444444-4444-4444-8444-444444444444";
const THREAD_DENIED = "55555555-5555-4555-8555-555555555555";
const THREAD_TRANSPORT = "66666666-6666-4666-8666-666666666666";

test("630 a pending stop DIES with the turn the runtime refused — it never cancels the next one", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withAdmittingFetch(async (seen, release) => {
    const h = await renderHook(() => useClaraThread(session, THREAD_REFUSED));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      let answer: string | null = null;
      let sent: boolean | null = null;
      await h.act(async () => {
        const sending = h.current.sendMessage("first").then((v) => { sent = v; });
        await new Promise((r) => setTimeout(r, 0));
        answer = await h.current.stopReply();
        release();                    // …and the POST comes back 429
        await sending;
        await new Promise((r) => setTimeout(r, 0));
      });
      assert.equal(answer, "pending", "the press landed inside the admission window");
      assert.equal(sent, false,
        "a turn the runtime never took is NOT on the record — its text stays in the composer to fix and resend");
      assert.equal(claraThreadStore.getThread(THREAD_REFUSED).pendingUserParts, null,
        "…and nothing was echoed into the transcript for it either");
      assert.equal(h.current.stop.phase, "idle",
        "a turn that was never admitted has nothing to stop — the intent is forgotten, not carried");
      assert.deepEqual(seen.filter((fn) => fn === "cancel_agent_task"), [],
        "…and no door was called for a turn the runtime refused");
    } finally {
      await h.unmount();
    }
  }, { admit: false });
});

test("630 a REFUSED stop inside the admission window says so — it never prints Stopped", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withAdmittingFetch(async (seen, release) => {
    const h = await renderHook(() => useClaraThread(session, THREAD_DENIED));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      let answer: string | null = null;
      await h.act(async () => {
        const sending = h.current.sendMessage("hello").then(() => {});
        await new Promise((r) => setTimeout(r, 0));
        answer = await h.current.stopReply();
        release();
        await sending;
        await new Promise((r) => setTimeout(r, 0));
      });
      assert.equal(answer, "pending");
      assert.deepEqual(seen.filter((fn) => fn === "cancel_agent_task"), ["cancel_agent_task"],
        "the remembered stop IS spent");
      // `clara.begin_chat_turn` admits any active member; `clara.cancel_agent_task` floors at
      // bookkeeper. A clerk pressing Stop mid-admission gets CLR04, and the run carries on.
      assert.equal(h.current.stop.phase, "failed",
        "the deferred door's refusal reaches the reader instead of being swallowed");
      assert.equal(h.current.stop.phase === "failed" ? h.current.stop.cause : null, "denied",
        "…and it is named: the role floor, not the network, not a finished turn");
    } finally {
      await h.unmount();
    }
  }, { cancelAnswer: () => refusal("CLR04", "stopping a reply requires a bookkeeper", "insufficient_role") });
});

test("630 a stop that fails at the TRANSPORT is not reported as a role refusal", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  await withAdmittingFetch(async (_seen, release) => {
    const h = await renderHook(() => useClaraThread(session, THREAD_TRANSPORT));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await h.act(async () => {
        const sending = h.current.sendMessage("hello").then(() => {});
        await new Promise((r) => setTimeout(r, 0));
        await h.current.stopReply();
        release();
        await sending;
        await new Promise((r) => setTimeout(r, 0));
      });
      assert.equal(h.current.stop.phase, "failed");
      assert.equal(h.current.stop.phase === "failed" ? h.current.stop.cause : null, "transport",
        "a proxy 502 is not a statement about this reader's role in their own firm");
    } finally {
      await h.unmount();
    }
  }, { cancelAnswer: () => new Response("upstream is down", { status: 502 }) });
});

test("630 the machine is reset by a NEW turn and by a thread change", async () => {
  const { useClaraThread } = await import("./useClaraThread");
  const A = "77777777-7777-4777-8777-777777777777";
  const B = "88888888-8888-4888-8888-888888888888";
  await withRecordedRpc(async () => {
    let threadId = A;
    const h = await renderHook(() => useClaraThread(session, threadId));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      claraThreadStore.markAccepted(A, "task-reset");
      await h.act(async () => { await h.current.stopReply(); });
      assert.equal(h.current.stop.phase, "stopped", "precondition: the machine holds a stop");
      threadId = B;
      await h.act(async () => { await h.rerender(); });
      assert.equal(h.current.stop.phase, "idle",
        "a marker about one turn in one thread must not follow the reader into another");
    } finally {
      await h.unmount();
    }
  });
});
