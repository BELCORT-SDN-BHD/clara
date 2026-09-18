// #642 AC5 — `revoked`, the fifth SSE event, at the two seams where it was dropped.
//
// THE DEFECT, in two halves and both of them silent:
//   1. `applyClaraStreamEvent` had cases for chunk/message/done/detached and a `default`
//      that IGNORES anything else. `revoked` fell through it, so the stream state stayed
//      `"streaming"` and the surface kept saying Clara was responding.
//   2. `runClaraTaskStream`'s event loop counted every non-`detached` event as progress,
//      so a `revoked` reset the backoff and the loop reattached — into a stream that is
//      refused for exactly the same reason. A member removed from the firm mid-reply saw
//      "Reconnecting…" forever.
//
// The event itself has been on the wire since B-M3: `packages/runtime/src/streamRoute.ts`
// sends `revoked {taskId, reason}` when the per-poll re-authorisation throws an
// `AuthError`, and `packages/runtime/tests/c5-stream-reauth-db.test.mjs` proves the
// SERVER half against a real revoked membership. This file is the client half.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyClaraStreamEvent,
  initialClaraStreamState,
  parseSseFrames,
  runClaraTaskStream,
  type SseEvent,
} from "./stream";

const revoked = (reason: string): SseEvent => ({ event: "revoked", data: { taskId: "t1", reason } });

test("p642.web.revoked_is_not_reconnecting — the reducer gives it its own TERMINAL state", () => {
  const streaming = applyClaraStreamEvent(initialClaraStreamState, { event: "chunk", data: { type: "text-delta", id: "t", text: "hi" } });
  assert.equal(streaming.status, "streaming");
  assert.equal(streaming.provisionalChunks.length, 1);

  const out = applyClaraStreamEvent(streaming, revoked("not_found"));
  assert.equal(out.status, "revoked", "never `streaming` — the whole defect was that this stayed `streaming`");
  assert.notEqual(out.status, "detached", "`detached` means REATTACH, and there is nothing to reattach into");
  assert.notEqual(out.status, "connection-lost", "`connection-lost` offers a Retry that can only be refused again");
  assert.equal(out.revokedReason, "not_found");
  assert.equal(out.detachReason, null, "a revocation is not a detach reason");
  assert.deepEqual(out.provisionalChunks, [], "the live buffer goes: the authority that would replace it is never coming");
  assert.equal(out.reconnectAttempt, 0);
  assert.equal(out.streamEndedUnexpectedly, false);
  assert.equal(out.retryAvailable, false, "no Retry is offered for a refusal a retry cannot fix");
});

test("p642.web.revoked_is_not_reconnecting — a payload with no `reason` is still terminal", () => {
  const out = applyClaraStreamEvent(initialClaraStreamState, { event: "revoked", data: {} });
  assert.equal(out.status, "revoked", "the STATE never depends on a field we may not have seen");
  assert.equal(out.revokedReason, null, "…and the reason is left null rather than guessed");
});

test("p642.web.revoked_is_not_reconnecting — the frame parses off the wire exactly as the route writes it", () => {
  // Written the way `streamRoute.ts` writes it, so this cell fails if the envelope ever
  // changes shape rather than only if the reducer does.
  const raw = `event: revoked\ndata: ${JSON.stringify({ taskId: "t1", reason: "CLR11" })}\n\n`;
  const { events } = parseSseFrames(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "revoked");
  assert.equal(applyClaraStreamEvent(initialClaraStreamState, events[0]).revokedReason, "CLR11");
});

test("p642.web.revoked_is_not_reconnecting — the reattach loop STOPS, and never sleeps, retries or reports a give-up", async () => {
  let attaches = 0;
  const sleeps: number[] = [];
  const seen: string[] = [];
  let gaveUp = false;
  let endedUnexpectedly = false;

  const body = (frames: string) =>
    new Response(frames, { status: 200, headers: { "content-type": "text/event-stream" } });

  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl: (async () => {
      attaches += 1;
      return body(
        `event: chunk\ndata: ${JSON.stringify({ type: "text-delta", id: "t", text: "part " })}\n\n`
        + `event: revoked\ndata: ${JSON.stringify({ taskId: "t1", reason: "not_found" })}\n\n`,
      );
    }) as typeof fetch,
    onEvent: (evt) => seen.push(evt.event),
    onGiveUp: () => { gaveUp = true; },
    onStreamEndedUnexpectedly: () => { endedUnexpectedly = true; },
    sleepImpl: async (ms: number) => { sleeps.push(ms); },
  });

  assert.equal(attaches, 1, "the loop must not reattach after a revocation");
  assert.deepEqual(sleeps, [], "…and must not sleep on a backoff it will never use");
  assert.deepEqual(seen, ["chunk", "revoked"], "the event still reaches the store before the loop leaves");
  assert.equal(endedUnexpectedly, false, "a revocation is an EXPLICIT close, not an ungraceful one");
  assert.equal(gaveUp, false, "and it is not the give-up ceiling either — nothing was attempted twice");
});

test("VACUITY CONTROL — the same harness DOES reattach on `detached`, so the cell above is not passing on a broken loop", () => {
  // Without this arm, a `runClaraTaskStream` that returned immediately on ANY event would
  // pass the cell above for entirely the wrong reason.
  return (async () => {
    let attaches = 0;
    const sleeps: number[] = [];
    await runClaraTaskStream({
      token: "tok",
      taskId: "t1",
      signal: new AbortController().signal,
      fetchImpl: (async () => {
        attaches += 1;
        const frames = attaches === 1
          ? `event: detached\ndata: ${JSON.stringify({ taskId: "t1", reason: "stream_window_expired" })}\n\n`
          : `event: done\ndata: ${JSON.stringify({ taskId: "t1", status: "completed" })}\n\n`;
        return new Response(frames, { status: 200, headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch,
      onEvent: () => {},
      sleepImpl: async (ms: number) => { sleeps.push(ms); },
    });
    assert.equal(attaches, 2, "a detach DOES reattach");
    assert.equal(sleeps.length, 1, "…after one backoff sleep");
  })();
});
