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
import type { StopReplyState } from "./useClaraThread";

enableDomInspection();

const THREAD = "11111111-1111-4111-8111-111111111111";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

// ===========================================================================================
// THE DOOR'S OWN ANSWER SHAPES (`clara.cancel_agent_task`, 0184's recut). `status` alone cannot
// tell the terminal settle of a queued turn from a no-op over a turn that had already ended —
// both read `cancelled` — so the door answers a discriminator on every arm and these cells drive
// the REAL shapes. packages/db/tests/work-cancel.test.mjs wc.35 pins the database side of the
// same four.
// ===========================================================================================
function doorAnswer(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
/** A QUEUED turn: no engine run, so this press settled the task terminally. */
const cancelled = (taskId: string) =>
  doorAnswer({ task_id: taskId, status: "cancelled", changed: true, transition: "cancelled" });
/** A RUNNING turn: the engine was asked to abort. */
const cancelRequested = (taskId: string) =>
  doorAnswer({ task_id: taskId, status: "cancel_requested", changed: true, transition: "cancel_requested" });
/** The turn had already ended before the press arrived — the ONE answer that is not a stop. */
const alreadyTerminal = (taskId: string, status = "completed") =>
  doorAnswer({ task_id: taskId, status, changed: false, transition: "already_terminal" });
/** A cancel was already pending. This press changed nothing, but the reply IS stopping. */
const alreadyRequested = (taskId: string) =>
  doorAnswer({ task_id: taskId, status: "cancel_requested", changed: false, transition: "already_requested" });

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
    // THE CANCEL DOOR ANSWERS AS THE DOOR ANSWERS. `{}` used to stand in for it, which meant no
    // cell in this file could see the classifier at all: `status` was undefined, so every arm
    // read "stopped" and the inversion the discriminator exists to end was invisible here.
    if (rpc?.[1] === "cancel_agent_task") return cancelled("task-1");
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
    if (rpc?.[1] === "cancel_agent_task") {
      // The default is the arm the admission window actually hits: `clara.begin_chat_turn` admits
      // every chat turn as `queued`, so a press inside that window reaches the TERMINAL-SETTLE arm.
      return opts.cancelAnswer ? opts.cancelAnswer() : cancelled("task-admitted");
    }
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

// ===========================================================================================
// #630 fix round 4 — WHAT THE DOOR ANSWERED, READ AS THE DOOR MEANT IT.
//
// `clara.cancel_agent_task` returns `{status:'cancelled'}` for the TERMINAL SETTLE it performs on
// a queued or held task AND for a task that was already terminal when the press arrived. Reading
// the status alone classified the first as the second, so a press that killed a real, queued reply
// printed "Nothing was stopped — this reply had already finished" beside a transcript holding only
// the person's own message. Every chat turn is admitted `queued`, so this was the ordinary case.
// The recut answers `changed` + `transition`; these four cells drive all four arms.
// ===========================================================================================

const THREAD_QUEUED = "99999999-9999-4999-8999-999999999999";
const THREAD_TERMINAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THREAD_REQUESTED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THREAD_CONFLICT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Drive one door answer through the real hook on a thread with a live task, and report the
 *  machine. The store is module-level, so each cell brings its own thread id. */
async function stopWith(threadId: string, answer: () => Response): Promise<StopReplyState> {
  const { useClaraThread } = await import("./useClaraThread");
  let settled: StopReplyState = { phase: "idle" };
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    if (/\/rpc\/cancel_agent_task/.test(url)) return answer();
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const h = await renderHook(() => useClaraThread(session, threadId));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      claraThreadStore.markAccepted(threadId, `task-${threadId.slice(0, 4)}`);
      await h.act(async () => { await h.current.stopReply(); });
      settled = h.current.stop;
    } finally {
      await h.unmount();
    }
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
  return settled;
}

test("630 a stop that TERMINALLY CANCELLED a queued turn is a STOP — the inversion is gone", async () => {
  // The measured defect: `status:'cancelled'` is in TURN_TERMINAL, so the old classifier read this
  // very success as "the turn had already finished" and the rail told the reader nothing had been
  // stopped over a turn the press had just killed.
  const settled = await stopWith(THREAD_QUEUED, () => cancelled("task-9999"));
  assert.equal(settled.phase, "stopped",
    "the door settled the task on this press; the surface must say so, not the opposite");
});

test("630 …and an ALREADY-TERMINAL answer is the one that is not a stop", async () => {
  const settled = await stopWith(THREAD_TERMINAL, () => alreadyTerminal("task-aaaa", "completed"));
  assert.equal(settled.phase, "failed", "the turn ended by itself before the press arrived");
  assert.equal(settled.phase === "failed" ? settled.cause : null, "finished",
    "…and 'finished' is reached ONLY on the door's own word");
});

test("630 an ALREADY-REQUESTED cancel is still a stop: the reply is stopping either way", async () => {
  const settled = await stopWith(THREAD_REQUESTED, () => alreadyRequested("task-bbbb"));
  assert.equal(settled.phase, "stopped",
    "this press changed nothing, but a cancel is pending and the reply IS stopping — "
    + "telling the reader nothing was stopped would be false");
});

test("630 a governed refusal that is NOT the role floor is never reported as 'finished'", async () => {
  // CLR10 — an op-key conflict, the refusal `clara._reserve_op` raises when the same key is
  // replayed with different arguments. It says nothing whatever about whether the reply ended.
  const settled = await stopWith(THREAD_CONFLICT, () => refusal("CLR10", "op_key conflict", "op_key_conflict"));
  assert.equal(settled.phase, "failed");
  assert.equal(settled.phase === "failed" ? settled.cause : null, "refused",
    "a refusal is a refusal; the reply may still be running and the line must say so");
});

// ===========================================================================================
// #630 fix round 4 — THE POLL, THE CLOCK, THE ABANDONED TURN, AND THE REOPENED RAIL.
// ===========================================================================================

const THREAD_POLL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const THREAD_CLOCK = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const THREAD_ABANDON = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const THREAD_REOPEN = "12121212-1212-4121-8121-121212121212";

const PARKED = {
  type: "clarify" as const,
  tool_call_id: "interruption:parked-1",
  question: "which bank account is this?",
  context: null,
  framing: "",
};

test("630 the run poll: a read that finds NO ROW keeps the parked question — absence is not an ending", async () => {
  // MEASURED DEFECT: the poll treated "no visible row" as "the turn ended" and wrote
  // `hydrateRun(null)`, which also clears `parkedClarify`, `turnStartedAt` and `turnStatus`. A
  // walk whose mock answers `agent_tasks_visible` by session_id only — and a real read blocked by
  // RLS, a transient, or a stale id — lost the question card, its Answer control and its clock
  // four seconds after load, on a run that was still waiting for the answer.
  const { useClaraThread, CLARA_RUN_POLL_MS } = await import("./useClaraThread");
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let runReads = 0;
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    if (/agent_tasks_visible/.test(url)) {
      runReads += 1;
      // The shape of a mock (or an RLS predicate) that does not answer this filter: an empty set.
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  // THE INTERVAL IS CAPTURED, NOT WAITED ON. Sleeping four real seconds per assertion measures the
  // host's scheduler, and in a suite whose files run in parallel it is four seconds of somebody
  // else's budget. The BODY is still run — a spy that only records the delay would pass against an
  // interval that does nothing, which is the defect itself. (The same shape
  // `components/clara/thread-stop-reply.test.tsx` uses for this poll.)
  const ticks: Array<() => void> = [];
  const scheduled: number[] = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    scheduled.push(Number(ms));
    ticks.push(fn);
    return realSet(fn, 1_000_000);
  }) as typeof globalThis.setInterval;
  try {
    const h = await renderHook(() => useClaraThread(session, THREAD_POLL));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      // A thread parked on a question, exactly as the mount's own rehydrate leaves one.
      claraThreadStore.hydrateRun(
        THREAD_POLL,
        { taskId: "task-parked", status: "awaiting_input", startedAt: "2026-09-12T00:00:00.000Z" },
        PARKED,
      );
      await h.act(async () => { await h.rerender(); });
      assert.ok(scheduled.includes(CLARA_RUN_POLL_MS),
        `precondition: the DB arm is polled on its own interval; saw ${JSON.stringify(scheduled)}`);
      const before = runReads;
      // Fire ONE tick from a SNAPSHOT — every re-render re-registers the interval this cell is
      // capturing, so iterating the live array would keep firing bodies the loop is still creating.
      await h.act(async () => {
        for (const tick of [...ticks]) tick();
        await new Promise((r) => setTimeout(r, 10));
      });
      assert.ok(runReads > before, "precondition: the poll actually ran (it read the run at least once)");

      const after = claraThreadStore.getThread(THREAD_POLL);
      assert.deepEqual(after.parkedClarify, PARKED,
        "the question Clara is parked on survives a read that saw no row");
      assert.equal(after.turnStartedAt, "2026-09-12T00:00:00.000Z", "…so does its clock");
      assert.equal(after.turnStatus, "awaiting_input", "…and the turn is still known to be parked");
    } finally {
      await h.unmount();
    }
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

test("630 a settled stop RETIRES the turn clock, so nothing counts under the Stopped marker", async () => {
  // The store is global, so this outlives the mount: someone who navigates away and back must not
  // find the same stopped turn timing itself again.
  const { useClaraThread } = await import("./useClaraThread");
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown) => {
    if (/rpc\/cancel_agent_task/.test(String(u))) return cancelled("task-clock");
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const h = await renderHook(() => useClaraThread(session, THREAD_CLOCK));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      claraThreadStore.hydrateRun(
        THREAD_CLOCK,
        { taskId: "task-clock", status: "running", startedAt: "2026-09-12T00:00:00.000Z" },
        null,
      );
      assert.equal(claraThreadStore.getThread(THREAD_CLOCK).turnStartedAt, "2026-09-12T00:00:00.000Z",
        "precondition: the clock is running");
      await h.act(async () => { await h.current.stopReply(); });
      assert.equal(h.current.stop.phase, "stopped");
      const after = claraThreadStore.getThread(THREAD_CLOCK);
      assert.equal(after.turnStartedAt, null, "the clock retires with the turn the door stopped");
      assert.equal(after.turnStatus, null, "…and the turn is no longer claimed to be running");
      assert.equal(after.activeTaskId, "task-clock",
        "…but the task id stays: a stopped reply is still a turn the database can be asked about");
    } finally {
      await h.unmount();
    }
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

test("630 a REFUSED stop inside the admission window does not ABANDON the live turn", async () => {
  // MEASURED DEFECT: the pending arm spent the stop and returned unconditionally. On a CLR04 the
  // run was still live but this tab attached no stream at all — no reply would ever arrive here —
  // and `turnLive`'s four arms were all false, so the Stop control was withdrawn at exactly the
  // moment the copy said the reply was still running.
  await withAdmittingFetch(async (seen, release) => {
    const { useClaraThread } = await import("./useClaraThread");
    const h = await renderHook(() => useClaraThread(session, THREAD_ABANDON));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await h.act(async () => {
        const sending = h.current.sendMessage("hello").then(() => {});
        await new Promise((r) => setTimeout(r, 0));
        await h.current.stopReply();
        release();
        await sending;
        await new Promise((r) => setTimeout(r, 30));
      });
      assert.equal(h.current.stop.phase, "failed", "precondition: the door refused");
      assert.equal(h.current.stop.phase === "failed" ? h.current.stop.cause : null, "denied");
      assert.ok(seen.includes("GET:stream"),
        "the turn the runtime took is READ: a refused stop must not leave the reply unreadable in this tab");
    } finally {
      await h.unmount();
    }
  }, { cancelAnswer: () => refusal("CLR04", "stopping a reply requires a bookkeeper", "insufficient_role") });
});

test("630 Stop after the rail is CLOSED AND REOPENED still aborts the first mount's read", async () => {
  // `ClaraRail` genuinely unmounts the view (`presence === "closed"` renders the launcher), and the
  // hook deliberately does not abort on unmount — closing the rail must not stop the reply. With
  // the controller in a per-instance ref, the reopened rail held nothing and its Stop press aborted
  // nothing: chunks kept appending under a marker that said the reply was stopped.
  const { useClaraThread } = await import("./useClaraThread");
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let streamSignal: AbortSignal | null = null;
  // Read through a function: TypeScript cannot see the closure assignment below, so reading the
  // `let` directly after an `assert.ok` narrows it to `never` for the rest of the cell.
  const capturedSignal = (): AbortSignal | null => streamSignal;
  let holdOpen: () => void = () => {};
  const held = new Promise<void>((resolve) => { holdOpen = resolve; });
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (/\/turns$/.test(url) && (init?.method ?? "GET") === "POST") {
      return new Response(JSON.stringify({ task_id: "task-reopen" }), {
        status: 202, headers: { "content-type": "application/json" },
      });
    }
    if (/\/stream/.test(url)) {
      streamSignal = init?.signal ?? null;
      await held;                       // the read is STILL OPEN across the unmount/remount
      return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    if (/rpc\/cancel_agent_task/.test(url)) return cancelRequested("task-reopen");
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    // FIRST MOUNT: post a turn, so a read is open for it.
    const first = await renderHook(() => useClaraThread(session, THREAD_REOPEN));
    await first.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await first.act(async () => {
      void first.current.sendMessage("hello");
      for (let i = 0; i < 80 && capturedSignal() === null; i += 1) await new Promise((r) => setTimeout(r, 1));
    });
    const opened = capturedSignal();
    assert.ok(opened, "precondition: a read is open for the admitted turn");
    assert.equal(opened.aborted, false, "…and it has not been aborted");

    // THE RAIL CLOSES. The view unmounts; the reply must keep running.
    await first.unmount();
    assert.equal(opened.aborted, false,
      "closing the rail does not stop the reply — someone may be coming back to it");

    // THE RAIL REOPENS on a fresh instance, and Stop is pressed there.
    const second = await renderHook(() => useClaraThread(session, THREAD_REOPEN));
    try {
      await second.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await second.act(async () => { await second.current.stopReply(); });
      assert.equal(opened.aborted, true,
        "the press reaches the read the FIRST mount opened — the handle lives with the turn, not the mount");
      assert.equal(second.current.stop.phase, "stopped", "…and the door was called for that same turn");
    } finally {
      await second.unmount();
      holdOpen();
    }
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

// ===========================================================================================
// #630 (fifth review round) — THE THREE READERS OF `turnStartedAt` THAT ROUND 4 LEFT BEHIND.
// ===========================================================================================

const THREAD_REMOUNT = "77777777-7777-4777-8777-777777777777";
const THREAD_STATUSES = "88888888-8888-4888-8888-888888888888";
const THREAD_GIVEUP = "99999999-9999-4999-8999-999999999999";
const THREAD_REATTACH = "aaaaaaaa-9999-4999-8999-999999999999";

/** The mount hydrate + the poll both read `agent_tasks_visible`; a cell drives them by handing
 *  this a row (or none) and swapping it between mounts. `/stream` opens are recorded, because
 *  R8's claim is about a read being re-attached. */
function withRunFetch(opts: {
  row: () => Record<string, unknown> | null;
  cancel?: () => Response;
}): { restore: () => void; streams: string[]; runReads: () => number } {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const streams: string[] = [];
  let reads = 0;
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    if (/\/stream/.test(url)) {
      streams.push(url);
      return new Response("", { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    if (/agent_tasks_visible/.test(url)) {
      reads += 1;
      const row = opts.row();
      return new Response(JSON.stringify(row ? [row] : []), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (/rpc\/cancel_agent_task/.test(url)) return (opts.cancel ?? (() => cancelRequested("task-x")))();
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return {
    streams,
    runReads: () => reads,
    restore: () => {
      globalThis.fetch = original;
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    },
  };
}

/** Capture the poll's interval instead of sleeping four real seconds per tick. Returns a snapshot
 *  firer, because every re-render re-registers the interval this is capturing. */
function withCapturedInterval(): { fire: () => void; scheduled: number[]; restore: () => void } {
  const ticks: Array<() => void> = [];
  const scheduled: number[] = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    scheduled.push(Number(ms));
    ticks.push(fn);
    return realSet(fn, 1_000_000);
  }) as typeof globalThis.setInterval;
  return {
    scheduled,
    fire: () => { for (const tick of [...ticks]) tick(); },
    restore: () => { globalThis.setInterval = realSet; globalThis.clearInterval = realClear; },
  };
}

test("630 a REMOUNT does not re-start the clock on a turn the door already stopped", async () => {
  // MEASURED DEFECT (round-5 finding [4]): `markTurnStopped` retires the clock, and the two
  // fire-and-forget hydrates consult `wasTurnStopped` — but the MOUNT hydrate did not, and it is
  // the only one a remount runs. `clara.cancel_agent_task` leaves a RUNNING turn at
  // `cancel_requested`, which `THREAD_RUN_LIVE_STATUSES` still calls live, so closing and
  // reopening the rail (a real unmount: ClaraRail renders the launcher at `presence === "closed"`)
  // read the row straight back and started the clock again — from the ORIGINAL created_at, with
  // the "Stopped" marker gone, on a reply the person had stopped.
  const { useClaraThread } = await import("./useClaraThread");
  let status = "running";
  const net = withRunFetch({
    row: () => ({ id: "task-remount", status, created_at: "2026-09-12T00:00:00.000Z" }),
    cancel: () => cancelRequested("task-remount"),
  });
  try {
    const first = await renderHook(() => useClaraThread(session, THREAD_REMOUNT));
    await first.act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    assert.equal(claraThreadStore.getThread(THREAD_REMOUNT).turnStartedAt, "2026-09-12T00:00:00.000Z",
      "precondition: the mount hydrate started the clock from the DB's own created_at");

    await first.act(async () => { await first.current.stopReply(); });
    assert.equal(first.current.stop.phase, "stopped", "precondition: the door stopped the turn");
    assert.equal(claraThreadStore.getThread(THREAD_REMOUNT).turnStartedAt, null, "…and the clock retired");
    await first.unmount();

    // THE DOOR'S OWN RESTING STATE for a stopped running turn: still non-terminal, still returned.
    status = "cancel_requested";
    const second = await renderHook(() => useClaraThread(session, THREAD_REMOUNT));
    try {
      await second.act(async () => { await new Promise((r) => setTimeout(r, 10)); });
      const after = claraThreadStore.getThread(THREAD_REMOUNT);
      assert.equal(after.turnStartedAt, null,
        "the reopened rail must not time a reply this surface has already said was stopped");
      assert.equal(after.turnStatus, null, "…nor claim it is running");
      assert.equal(after.activeTaskId, "task-remount",
        "…while the task id stays, so the turn can still be asked about");
    } finally {
      await second.unmount();
    }
  } finally {
    net.restore();
  }
});

test("630 the run poll runs for EVERY non-terminal status the hydrate can produce", async () => {
  // MEASURED DEFECT (round-5 finding [5]): the poll was gated to `running`/`awaiting_input`, two of
  // the five statuses `turnRun.ts` hydrates a clock for. A turn hydrated as `queued` (every chat
  // turn is admitted queued), `held` or `cancel_requested` had no stream, no poll and no terminal
  // `message` — so `turnStartedAt` had no writer that could ever clear it, and the rail counted
  // upward for the life of the mount about a run that had long since settled.
  const { useClaraThread, CLARA_RUN_POLL_MS } = await import("./useClaraThread");
  const { THREAD_RUN_LIVE_STATUSES } = await import("./turnRun");
  for (const status of THREAD_RUN_LIVE_STATUSES) {
    const thread = `${THREAD_STATUSES.slice(0, -1)}${THREAD_RUN_LIVE_STATUSES.indexOf(status)}`;
    let answer: Record<string, unknown> | null = { id: `task-${status}`, status, created_at: "2026-09-12T00:00:00.000Z" };
    const net = withRunFetch({ row: () => answer });
    const clock = withCapturedInterval();
    try {
      const h = await renderHook(() => useClaraThread(session, thread));
      try {
        await h.act(async () => { await new Promise((r) => setTimeout(r, 10)); });
        assert.equal(claraThreadStore.getThread(thread).turnStatus, status,
          `precondition: a ${status} run is hydrated with a clock`);
        assert.ok(clock.scheduled.includes(CLARA_RUN_POLL_MS),
          `${status}: the DB arm must be polled — otherwise nothing can ever retire this clock; `
          + `saw ${JSON.stringify(clock.scheduled)}`);

        // …and the poll is what ENDS it. The run settles server-side; only this can notice.
        answer = { id: `task-${status}`, status: "completed", created_at: "2026-09-12T00:00:00.000Z" };
        await h.act(async () => { clock.fire(); await new Promise((r) => setTimeout(r, 10)); });
        assert.equal(claraThreadStore.getThread(thread).turnStartedAt, null,
          `${status}: a terminal read retires the clock`);
        assert.equal(claraThreadStore.getThread(thread).turnStatus, null,
          `${status}: …and stops claiming the turn is live`);
      } finally {
        await h.unmount();
      }
    } finally {
      clock.restore();
      net.restore();
    }
  }
});

test("630 after the miss limit the poll gives up OUT LOUD — the clock and the control retire", async () => {
  // MEASURED DEFECT (round-5 finding [6]): after `CLARA_RUN_POLL_MISS_LIMIT` misses the poll
  // stopped asking and wrote NOTHING. `turnStatus` stayed at the last real read, so the Stop
  // control stayed mounted and the clock kept counting for the life of the mount, about a turn
  // this tab had provably stopped being able to see. Work order B1 asked for "a bounded label";
  // round 4 delivered the bound without the label.
  const { useClaraThread, CLARA_RUN_POLL_MISS_LIMIT } = await import("./useClaraThread");
  let visible = true;
  const net = withRunFetch({
    row: () => (visible ? { id: "task-lost", status: "running", created_at: "2026-09-12T00:00:00.000Z" } : null),
  });
  const clock = withCapturedInterval();
  try {
    const h = await renderHook(() => useClaraThread(session, THREAD_GIVEUP));
    try {
      await h.act(async () => { await new Promise((r) => setTimeout(r, 10)); });
      await h.act(() => { claraThreadStore.hydrateRun(THREAD_GIVEUP,
        { taskId: "task-lost", status: "running", startedAt: "2026-09-12T00:00:00.000Z" }, PARKED); });
      await h.act(async () => { await h.rerender(); });
      assert.equal(claraThreadStore.getThread(THREAD_GIVEUP).turnLostSight, false,
        "precondition: nothing has been lost sight of yet");

      visible = false;
      for (let i = 0; i < CLARA_RUN_POLL_MISS_LIMIT; i += 1) {
        await h.act(async () => { clock.fire(); await new Promise((r) => setTimeout(r, 10)); });
      }
      const after = claraThreadStore.getThread(THREAD_GIVEUP);
      assert.equal(after.turnLostSight, true, "the give-up is a STATE, not merely a stopped timer");
      assert.equal(after.turnStartedAt, null, "…the clock retires: it was asserting a run this tab cannot see");
      assert.equal(after.turnStatus, null, "…and so does the control's own DB arm");
      assert.equal(after.activeTaskId, "task-lost", "…while the turn stays addressable");
      assert.deepEqual(after.parkedClarify, PARKED,
        "…and the transcript, parked question included, is kept — losing sight is not an ending");
    } finally {
      await h.unmount();
    }
  } finally {
    clock.restore();
    net.restore();
  }
});
