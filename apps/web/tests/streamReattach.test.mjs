// Detach -> reattach flow (P2-RAIL) — `lib/clara/stream.ts` `runClaraTaskStream`,
// proven end to end against REAL `Response`/`ReadableStream` bytes (not a mocked
// reducer call): a stub `fetchImpl` returns one SSE body on the first attach that ends
// in `detached`, and a different body on the second attach that runs to a terminal
// `message` + `done`. This is positive evidence the loop actually reattaches (law 2:
// absence is not evidence) — it asserts on the fetch call count, the onOpen firings,
// and the exact event sequence observed, not merely that the promise resolved.
//
// FIX ROUND (backoff/cap/give-up + the no-terminal-close class) extends this file with
// three more cases, still against real Response/ReadableStream bytes: a multi-detach
// cycle proving the backoff formula is what's actually awaited (a fake `sleepImpl`
// seam — never real waiting), the give-up ceiling landing the THREAD STORE in
// "connection-lost" with no further fetch calls, and an ungraceful close (no
// message/done/detached at all) surfacing visibly in the store while still counting
// as one failed attempt under the same policy.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { runClaraTaskStream, backoffDelayMs, DEFAULT_RECONNECT_POLICY } = await import("../lib/clara/stream.ts");
const { claraThreadStore } = await import("../lib/clara/threadStore.ts");

/** A fake delay seam: never actually waits, just records what it was asked to wait
 *  for — the same pattern every new test below uses to prove backoff without paying
 *  for it in wall-clock test time. */
function fakeSleep() {
  const calls = [];
  return { sleepImpl: async (ms) => { calls.push(ms); }, calls };
}

function frame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseResponse(frames) {
  const bytes = new TextEncoder().encode(frames.join(""));
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

test("detached triggers exactly one reattach, which then runs to done", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, authorization: init.headers.authorization, redirect: init.redirect });
    if (calls.length === 1) {
      return sseResponse([frame("chunk", { n: 1 }), frame("detached", { taskId: "t1", reason: "stream_window_expired" })]);
    }
    return sseResponse([
      frame("chunk", { n: 2 }),
      frame("message", { taskId: "t1", status: "completed", parts: [{ type: "text", text: "done" }] }),
      frame("done", { taskId: "t1", status: "completed" }),
    ]);
  };

  const opens = [];
  const events = [];
  const { sleepImpl } = fakeSleep();
  await runClaraTaskStream({
    token: "tok-123",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl,
    sleepImpl,
    onOpen: () => opens.push(true),
    onEvent: (evt) => events.push(evt.event),
  });

  assert.equal(calls.length, 2, "exactly one reattach — a second fetch to the same stream route");
  // SAME-ORIGIN, and both attaches, not just the first: a reattach that fell back to a
  // cross-origin base would be a working stream in this test and a CORS-blocked one in a
  // browser. The path is the runtime's `/api/tasks/:id/stream` with its `/api` prefix
  // replaced by `/api/runtime` — `app/api/runtime/[...path]/route.ts` re-adds `/api/`.
  for (const call of calls) {
    assert.equal(call.url, "/api/runtime/tasks/t1/stream");
    assert.equal(call.redirect, "manual", "a 307 to /login must never be read as an SSE body");
  }
  assert.equal(calls[0].authorization, "Bearer tok-123");
  assert.equal(opens.length, 2, "onOpen fires once per attach");
  assert.deepEqual(events, ["chunk", "detached", "chunk", "message", "done"]);
});

test("an already-aborted signal never attaches at all", async () => {
  let fetchCalls = 0;
  const controller = new AbortController();
  controller.abort();
  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: controller.signal,
    fetchImpl: async () => {
      fetchCalls += 1;
      return sseResponse([frame("done", { taskId: "t1", status: "completed" })]);
    },
    onEvent: () => {},
  });
  assert.equal(fetchCalls, 0);
});

test("a clean single-attach done never reattaches", async () => {
  let fetchCalls = 0;
  const events = [];
  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl: async () => {
      fetchCalls += 1;
      return sseResponse([
        frame("message", { taskId: "t1", status: "completed", parts: [] }),
        frame("done", { taskId: "t1", status: "completed" }),
      ]);
    },
    onEvent: (evt) => events.push(evt.event),
  });
  assert.equal(fetchCalls, 1);
  assert.deepEqual(events, ["message", "done"]);
});

test("a non-ok response throws with the status in the message", async () => {
  await assert.rejects(
    () =>
      runClaraTaskStream({
            token: "tok",
        taskId: "t1",
        signal: new AbortController().signal,
        fetchImpl: async () => new Response(null, { status: 404 }),
        onEvent: () => {},
      }),
    /stream attach failed \(404\)/,
  );
});

// ---------------------------------------------------------------------------
// FIX 1 — exponential backoff + cap + give-up ceiling.
// ---------------------------------------------------------------------------

test("a multi-detach cycle backs off exponentially and the attempt counter increments", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    if (fetchCalls <= 3) return sseResponse([frame("detached", { taskId: "t1", reason: "shutting_down" })]);
    return sseResponse([frame("message", { taskId: "t1", status: "completed", parts: [] }), frame("done", { taskId: "t1", status: "completed" })]);
  };

  const { sleepImpl, calls: sleptFor } = fakeSleep();
  const attempts = [];
  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl,
    sleepImpl,
    onEvent: () => {},
    onReconnectAttempt: (info) => attempts.push(info),
  });

  assert.equal(fetchCalls, 4, "3 failed attaches + the one that finally completes");
  assert.deepEqual(attempts.map((a) => a.attempt), [1, 2, 3], "the counter increments once per failed attempt");
  // The exact delay is base*2^(attempt-1), capped, plus 0..jitterMs — assert it
  // against the SAME formula the implementation exports, and that `sleepImpl` was
  // actually awaited with that exact value (not just reported to the callback).
  attempts.forEach((a, i) => {
    const floor = Math.min(DEFAULT_RECONNECT_POLICY.baseDelayMs * 2 ** i, DEFAULT_RECONNECT_POLICY.maxDelayMs);
    assert.ok(a.delayMs >= floor && a.delayMs < floor + DEFAULT_RECONNECT_POLICY.jitterMs, `attempt ${i + 1} delay ${a.delayMs} in [${floor}, ${floor + DEFAULT_RECONNECT_POLICY.jitterMs})`);
  });
  assert.deepEqual(sleptFor, attempts.map((a) => a.delayMs), "the loop actually awaits the delay it reports, not a stubbed zero");
  assert.ok(sleptFor[1] > sleptFor[0] && sleptFor[2] > sleptFor[1], "delays strictly increase across the cycle");
});

test("backoffDelayMs matches the documented curve at a few fixed attempts", () => {
  const policy = { baseDelayMs: 1000, maxDelayMs: 30_000, jitterMs: 0, maxAttempts: 8 };
  assert.equal(backoffDelayMs(1, policy), 1000);
  assert.equal(backoffDelayMs(2, policy), 2000);
  assert.equal(backoffDelayMs(5, policy), 16_000);
  assert.equal(backoffDelayMs(6, policy), 30_000, "capped, not 32s");
  assert.equal(backoffDelayMs(9, policy), 30_000, "stays capped past the curve's natural top");
});

test("the give-up ceiling lands the thread store in connection-lost with no further fetch calls", async () => {
  const threadId = "give-up-thread";
  claraThreadStore.reset(threadId);
  let fetchCalls = 0;
  const { sleepImpl } = fakeSleep();

  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl: async () => {
      fetchCalls += 1;
      return sseResponse([frame("detached", { taskId: "t1", reason: "shutting_down" })]); // never recovers
    },
    sleepImpl,
    reconnectPolicy: { maxAttempts: 2 }, // small on purpose — no need to wait out the real default of 8
    onEvent: (evt) => claraThreadStore.applyStreamEvent(threadId, evt),
    onReconnectAttempt: ({ attempt }) => claraThreadStore.markReconnectAttempt(threadId, attempt),
    onGiveUp: () => claraThreadStore.markConnectionLost(threadId),
  });

  assert.equal(fetchCalls, 3, "the initial attach + 2 reattach attempts, then give up — never a 4th");
  const callsAtGiveUp = fetchCalls;
  await new Promise((resolve) => setTimeout(resolve, 20)); // nothing pending should fire late
  assert.equal(fetchCalls, callsAtGiveUp, "no further fetch calls after give-up");

  const thread = claraThreadStore.getThread(threadId);
  assert.equal(thread.stream.status, "connection-lost");
  assert.equal(thread.stream.retryAvailable, true, "the manual-retry affordance flag");
});

// ---------------------------------------------------------------------------
// FIX 2 — a close with no message/done/detached at all is an error, not silence.
// ---------------------------------------------------------------------------

test("a clean close with no terminal event surfaces visibly, stops the spinner, and counts as an attempt", async () => {
  const threadId = "ungraceful-close-thread";
  claraThreadStore.reset(threadId);
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) return sseResponse([frame("chunk", { n: 1 })]); // body just ends — no detached, no message, no done
    return sseResponse([frame("message", { taskId: "t1", status: "completed", parts: [] }), frame("done", { taskId: "t1", status: "completed" })]);
  };

  const { sleepImpl } = fakeSleep();
  const reconnectAttempts = [];
  let snapshotAtUngracefulClose = null;
  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl,
    sleepImpl,
    onEvent: (evt) => claraThreadStore.applyStreamEvent(threadId, evt),
    onStreamEndedUnexpectedly: () => {
      claraThreadStore.markStreamEndedUnexpectedly(threadId);
      snapshotAtUngracefulClose = claraThreadStore.getThread(threadId); // read it back RIGHT NOW — not a later, possibly-clobbered read
    },
    onReconnectAttempt: (info) => reconnectAttempts.push(info),
  });

  assert.equal(fetchCalls, 2, "the ungraceful first attach + the one reattach that then completes");
  assert.ok(snapshotAtUngracefulClose, "onStreamEndedUnexpectedly fired — silence is exactly the bug this fixes");
  assert.equal(snapshotAtUngracefulClose.stream.streamEndedUnexpectedly, true, "the error state is visible");
  assert.notEqual(snapshotAtUngracefulClose.stream.status, "streaming", "the spinner (responding…) is stopped");
  assert.deepEqual(reconnectAttempts.map((a) => a.attempt), [1], "the ungraceful close counted as exactly one failed attempt");

  // Recovery: the next attach's real events clear the transient error — it never
  // lingers once the connection is proven to work again.
  const final = claraThreadStore.getThread(threadId);
  assert.equal(final.stream.streamEndedUnexpectedly, false);
  assert.equal(final.stream.status, "terminal");
});
