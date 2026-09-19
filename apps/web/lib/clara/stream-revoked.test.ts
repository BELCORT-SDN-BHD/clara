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
  const [event] = events;
  assert.ok(event, "the frame must parse into exactly one event");
  assert.equal(event.event, "revoked");
  assert.equal(applyClaraStreamEvent(initialClaraStreamState, event).revokedReason, "CLR11");
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

test("p642.web.revoked_is_not_reconnecting — a revocation discovered at ATTACH time is the SAME fact, not a flaky transport", async () => {
  // Fix round 1, review finding ADV-642-5. The hole was only half closed: `streamRoute.ts`
  // can only send the `revoked` FRAME once the SSE headers are out, and its attach-time
  // authorisation answers an HTTP status BEFORE that (`res.status(err.status).json(…)`
  // precedes `res.status(200).set({Content-Type: text/event-stream})`). Every revocation
  // discovered at attach — the reattach after a `detached`, a rail reopen, a scope switch
  // back, any remount while the membership is already gone — therefore came back as 403 or
  // 404, which `openTaskStream` turned into a plain `Error` and the caller read as a
  // transport failure: backoff 1s→2s→4s…, up to eight attempts of "Reconnecting…", then a
  // generic give-up. The person who has lost access was told their connection was flaky —
  // the exact sentence this ticket set out to retire, on the path the new `revoked` case
  // never sees.
  const attaches: number[] = [];
  const sleeps: number[] = [];
  const seen: { event: string; data: unknown }[] = [];
  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl: (async () => {
      attaches.push(1);
      return new Response(JSON.stringify({ error: "no_membership", message: "no active firm membership" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
    onEvent: (evt) => seen.push({ event: evt.event, data: evt.data }),
    sleepImpl: async (ms: number) => { sleeps.push(ms); },
  });

  assert.deepEqual(seen.map((e) => e.event), ["revoked"], "one fact, one face — the same event the mid-stream arm delivers");
  assert.equal((seen.at(0)?.data as { reason?: string } | undefined)?.reason, "no_membership",
    "…carrying the route's own code, which the surface maps to copy and never renders raw");
  assert.equal(attaches.length, 1, "it must not reattach into a refusal that will be repeated");
  assert.deepEqual(sleeps, [], "…nor sleep on a backoff it will never use");
});

test("p642.web.revoked_is_not_reconnecting — a 404 at attach is `not_found`, exactly as the mid-stream arm words it", async () => {
  const seen: { event: string; data: unknown }[] = [];
  await runClaraTaskStream({
    token: "tok",
    taskId: "t1",
    signal: new AbortController().signal,
    fetchImpl: (async () => new Response(JSON.stringify({ error: "not_found", message: "not found" }), {
      status: 404, headers: { "content-type": "application/json" },
    })) as typeof fetch,
    onEvent: (evt) => seen.push({ event: evt.event, data: evt.data }),
    sleepImpl: async () => {},
  });
  assert.deepEqual(seen.map((e) => e.event), ["revoked"]);
  assert.equal((seen.at(0)?.data as { reason?: string } | undefined)?.reason, "not_found",
    "the same word `streamRoute.ts:157` uses, so one fact reads one way wherever it is discovered");
});

test("VACUITY CONTROL — an attach that failed for a TRANSPORT reason still rejects, and is not dressed as a revocation", async () => {
  // A 500, a torn proxy or an unreachable runtime says nothing about this reader's
  // access. It must keep reaching the caller's own `.catch`, which is what paints "could
  // not send that message" and the stream-lost banner. Without this arm, "treat a failed
  // attach as a revocation" would pass the two cells above and quietly tell every reader
  // with a flaky network that their access had been removed.
  const seen: string[] = [];
  await assert.rejects(
    runClaraTaskStream({
      token: "tok",
      taskId: "t1",
      signal: new AbortController().signal,
      fetchImpl: (async () => new Response(JSON.stringify({ error: "internal" }), {
        status: 500, headers: { "content-type": "application/json" },
      })) as typeof fetch,
      onEvent: (evt) => seen.push(evt.event),
      sleepImpl: async () => {},
    }),
    /stream attach failed \(500\)/,
  );
  assert.deepEqual(seen, [], "and nothing was announced to the reader on its way out");
});
