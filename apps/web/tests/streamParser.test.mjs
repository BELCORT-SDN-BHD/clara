// SSE frame-parsing tests (P2-RAIL) — `lib/clara/stream.ts` `parseSseFrames` /
// `createSseFrameParser`, exercised the same way `packages/runtime`'s own route tests
// load a `.ts` module: through tsx's ESM loader against the pure exported functions,
// no network, no DOM. Fixture frames use the EXACT wire format
// `packages/runtime/src/streamRoute.ts` `send()` emits:
// `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { parseSseFrames, createSseFrameParser } = await import("../lib/clara/stream.ts");

function frame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

test("parses a single complete frame", () => {
  const { events, remainder } = parseSseFrames(frame("chunk", { foo: 1 }));
  assert.deepEqual(events, [{ event: "chunk", data: { foo: 1 } }]);
  assert.equal(remainder, "");
});

test("parses multiple frames delivered in one push", () => {
  const raw = frame("chunk", { n: 1 }) + frame("chunk", { n: 2 }) + frame("done", { taskId: "t1", status: "completed" });
  const { events, remainder } = parseSseFrames(raw);
  assert.deepEqual(
    events.map((e) => e.event),
    ["chunk", "chunk", "done"],
  );
  assert.equal(remainder, "");
});

test("holds an incomplete frame in the remainder until the rest arrives", () => {
  const whole = frame("message", { taskId: "t1", status: "completed", parts: [] });
  const splitAt = Math.floor(whole.length / 2);
  const first = parseSseFrames(whole.slice(0, splitAt));
  assert.deepEqual(first.events, []);
  assert.equal(first.remainder, whole.slice(0, splitAt));

  const second = parseSseFrames(first.remainder + whole.slice(splitAt));
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].event, "message");
});

test("createSseFrameParser stitches a frame split across two pushes", () => {
  const whole = frame("chunk", { delta: "hello world" });
  const splitAt = 5;
  const parser = createSseFrameParser();
  assert.deepEqual(parser.push(whole.slice(0, splitAt)), []);
  const events = parser.push(whole.slice(splitAt));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { event: "chunk", data: { delta: "hello world" } });
});

test("createSseFrameParser carries its buffer across many small pushes", () => {
  const raw =
    frame("chunk", { n: 1 }) +
    frame("chunk", { n: 2 }) +
    frame("message", { taskId: "t1", status: "completed", parts: [{ type: "text", text: "hi" }] }) +
    frame("done", { taskId: "t1", status: "completed" });
  const parser = createSseFrameParser();
  const seen = [];
  for (let i = 0; i < raw.length; i += 3) {
    seen.push(...parser.push(raw.slice(i, i + 3)));
  }
  assert.deepEqual(
    seen.map((e) => e.event),
    ["chunk", "chunk", "message", "done"],
  );
});

test("a frame with no data: line is skipped, never yielded", () => {
  const { events } = parseSseFrames("event: ping\n\n" + frame("chunk", { n: 1 }));
  assert.deepEqual(
    events.map((e) => e.event),
    ["chunk"],
  );
});

test("a frame with malformed JSON is skipped, not fatal", () => {
  const { events } = parseSseFrames("event: chunk\ndata: {not json\n\n" + frame("chunk", { n: 1 }));
  assert.deepEqual(events, [{ event: "chunk", data: { n: 1 } }]);
});

test("a frame with no event: line defaults to 'message'", () => {
  const { events } = parseSseFrames(`data: ${JSON.stringify({ a: 1 })}\n\n`);
  assert.deepEqual(events, [{ event: "message", data: { a: 1 } }]);
});
