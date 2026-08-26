// Detach -> reattach flow (P2-RAIL) — `lib/clara/stream.ts` `runClaraTaskStream`,
// proven end to end against REAL `Response`/`ReadableStream` bytes (not a mocked
// reducer call): a stub `fetchImpl` returns one SSE body on the first attach that ends
// in `detached`, and a different body on the second attach that runs to a terminal
// `message` + `done`. This is positive evidence the loop actually reattaches (law 2:
// absence is not evidence) — it asserts on the fetch call count, the onOpen firings,
// and the exact event sequence observed, not merely that the promise resolved.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { runClaraTaskStream } = await import("../lib/clara/stream.ts");

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
    calls.push({ url, authorization: init.headers.authorization });
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
  await runClaraTaskStream({
    runtimeBase: "http://runtime.test",
    token: "tok-123",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl,
    onOpen: () => opens.push(true),
    onEvent: (evt) => events.push(evt.event),
  });

  assert.equal(calls.length, 2, "exactly one reattach — a second fetch to the same stream route");
  assert.equal(calls[0].url, "http://runtime.test/api/tasks/t1/stream");
  assert.equal(calls[0].authorization, "Bearer tok-123");
  assert.equal(opens.length, 2, "onOpen fires once per attach");
  assert.deepEqual(events, ["chunk", "detached", "chunk", "message", "done"]);
});

test("an already-aborted signal never attaches at all", async () => {
  let fetchCalls = 0;
  const controller = new AbortController();
  controller.abort();
  await runClaraTaskStream({
    runtimeBase: "http://runtime.test",
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
    runtimeBase: "http://runtime.test",
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
        runtimeBase: "http://runtime.test",
        token: "tok",
        taskId: "t1",
        signal: new AbortController().signal,
        fetchImpl: async () => new Response(null, { status: 404 }),
        onEvent: () => {},
      }),
    /stream attach failed \(404\)/,
  );
});
