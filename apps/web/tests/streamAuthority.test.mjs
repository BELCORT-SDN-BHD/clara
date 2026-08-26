// Authority-replacement reducer tests (P2-RAIL) — `lib/clara/stream.ts`
// `applyClaraStreamEvent`. Proves the rule the work order names explicitly: live
// `chunk`s are provisional; a terminal `message` REPLACES the transcript wholesale
// (never merges) and discards whatever chunks preceded it; `detached` clears the
// provisional buffer too (a reattach replays from index 0, so nothing survives across
// a detach to duplicate against the replay).

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { applyClaraStreamEvent, initialClaraStreamState } = await import("../lib/clara/stream.ts");

test("a chunk is provisional: status streaming, appended, never authoritative", () => {
  const s1 = applyClaraStreamEvent(initialClaraStreamState, { event: "chunk", data: { delta: "Hel" } });
  assert.equal(s1.status, "streaming");
  assert.deepEqual(s1.provisionalChunks, [{ delta: "Hel" }]);
  assert.equal(s1.transcriptParts, null);

  const s2 = applyClaraStreamEvent(s1, { event: "chunk", data: { delta: "lo" } });
  assert.deepEqual(s2.provisionalChunks, [{ delta: "Hel" }, { delta: "lo" }]);
  assert.equal(s2.transcriptParts, null);
});

test("a terminal message REPLACES the transcript and discards provisional chunks", () => {
  const streaming = [{ event: "chunk", data: { delta: "Hel" } }, { event: "chunk", data: { delta: "lo" } }].reduce(
    applyClaraStreamEvent,
    initialClaraStreamState,
  );
  assert.equal(streaming.provisionalChunks.length, 2);

  const authoritativeParts = [{ type: "text", text: "Hello, final answer." }];
  const terminal = applyClaraStreamEvent(streaming, {
    event: "message",
    data: { taskId: "t1", status: "completed", parts: authoritativeParts },
  });

  assert.equal(terminal.status, "terminal");
  assert.equal(terminal.taskStatus, "completed");
  // Authority replacement, not merge: the two provisional deltas ("Hel"/"lo") are gone,
  // not folded into the result — the DB-persisted parts are the whole story.
  assert.deepEqual(terminal.transcriptParts, authoritativeParts);
  assert.deepEqual(terminal.provisionalChunks, []);
});

test("done after message keeps the terminal state and carries the task status", () => {
  const afterMessage = applyClaraStreamEvent(initialClaraStreamState, {
    event: "message",
    data: { taskId: "t1", status: "failed", parts: null },
  });
  const afterDone = applyClaraStreamEvent(afterMessage, { event: "done", data: { taskId: "t1", status: "failed" } });
  assert.equal(afterDone.status, "terminal");
  assert.equal(afterDone.taskStatus, "failed");
  // `message` with parts: null is itself authoritative (the DB row simply has none yet) —
  // still distinguished from "never received a terminal message" (see next test).
  assert.equal(afterDone.transcriptParts, null);
});

test("detached never fabricates a transcript and clears the stale provisional buffer", () => {
  const streaming = applyClaraStreamEvent(initialClaraStreamState, { event: "chunk", data: { delta: "partial" } });
  const detached = applyClaraStreamEvent(streaming, { event: "detached", data: { taskId: "t1", reason: "stream_window_expired" } });

  assert.equal(detached.status, "detached");
  assert.equal(detached.detachReason, "stream_window_expired");
  assert.equal(detached.transcriptParts, null); // never guessed from partial chunks
  assert.deepEqual(detached.provisionalChunks, []); // the reattach replays from index 0
});

test("an unrecognised event name is ignored, state unchanged", () => {
  const before = applyClaraStreamEvent(initialClaraStreamState, { event: "chunk", data: { delta: "x" } });
  const after = applyClaraStreamEvent(before, { event: "ping", data: {} });
  assert.deepEqual(after, before);
});

test("a message payload without a status field is never guessed at", () => {
  const before = initialClaraStreamState;
  const after = applyClaraStreamEvent(before, { event: "message", data: { taskId: "t1" } });
  assert.deepEqual(after, before);
});
