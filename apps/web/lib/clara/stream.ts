// The Clara task-stream client (P2-RAIL). Implements the SSE envelope exactly as
// `packages/runtime/src/streamRoute.ts` emits it — four events, no more, no fewer:
//
//   chunk    — a live, PROVISIONAL update (`streamRoute.ts:117`). Never authoritative;
//              never persisted as a rendered part.
//   message  — TERMINAL ONLY. The route's one call site is inside `terminate()`
//              (`streamRoute.ts:74-77`), which only runs once the task has reached a
//              terminal status. It re-sends the DB-persisted `parts` for the task —
//              this IS the authority on the final transcript (frontend-handoff-
//              2026-08-23.md §4.1 "SSE envelope"). Receiving `message` REPLACES the
//              transcript; it never merges with the provisional chunks that preceded it.
//   done     — always follows a terminal `message` (`streamRoute.ts:76`); ends the
//              attempt. Carries the same terminal `status`.
//   detached — the attempt ended WITHOUT reaching a terminal status (supervisor drain
//              or the read-window cap — `streamRoute.ts:159-161`). Never treated as
//              failure or success: it means "reattach". A reattaching client gets the
//              FULL history again for free (`getReadable({startIndex:0})`,
//              `streamRoute.ts:91`), so a fresh attach always starts from a clean,
//              empty provisional buffer — never appends onto stale chunks from the
//              attempt that just detached.
//
// This module is split in two testable layers:
//   1. Pure functions — `parseSseFrames` / `createSseFrameParser` (bytes -> events) and
//      `applyClaraStreamEvent` (events -> UI state, the authority-replacement rule).
//      Exercised directly with fixture text/event sequences — no network, no DOM.
//   2. `openTaskStream` / `runClaraTaskStream` — the actual `fetch`-based reader and the
//      reattach loop built on top of the pure layer. `fetchImpl` is injectable so callers
//      (and tests that want to prove the reattach loop end-to-end) never have to monkey-
//      patch `globalThis.fetch`.

import type { ClaraPartLike } from "./api";

// ---------------------------------------------------------------------------
// 1a. Frame parsing — bytes to `{event, data}` pairs.
// ---------------------------------------------------------------------------

export type SseEventName = "chunk" | "message" | "done" | "detached";

export type SseEvent = { event: string; data: unknown };

/** Payload shapes for the three named (non-`chunk`) events, as `streamRoute.ts` sends
 *  them. `chunk`'s payload is intentionally left `unknown` — see the module doc above:
 *  we treat it as an opaque liveness signal, never as content we parse or render. */
export type ClaraTerminalMessagePayload = { taskId: string; status: string; parts: ClaraPartLike[] | null };
export type ClaraDonePayload = { taskId: string; status: string };
export type ClaraDetachedPayload = { taskId: string; reason: string };

/** Parses as many complete `\n\n`-delimited SSE frames as `raw` contains, returning the
 *  parsed events plus whatever incomplete tail remains (to be prefixed onto the next
 *  chunk of bytes). A frame with no `data:` line is skipped (never yielded) — mirrors
 *  `apps/dashboard/app/chat/api.ts` `streamTask`'s `if (dataLines.length === 0) continue`.
 *  A frame whose data does not parse as JSON is skipped, not fatal, for the same reason
 *  that module gives: one malformed frame must not take down the whole stream. */
export function parseSseFrames(raw: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  let buf = raw;
  let sep: number;
  while ((sep = buf.indexOf("\n\n")) >= 0) {
    const frame = buf.slice(0, sep);
    buf = buf.slice(sep + 2);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    try {
      events.push({ event, data: JSON.parse(dataLines.join("\n")) });
    } catch {
      // a malformed frame is skipped, never fatal (mirrors api.ts:streamTask)
    }
  }
  return { events, remainder: buf };
}

/** A stateful wrapper around `parseSseFrames` for a live byte stream: holds the
 *  cross-chunk buffer so callers just `push()` whatever text arrived and get back any
 *  complete events it produced. */
export function createSseFrameParser(): { push(text: string): SseEvent[] } {
  let buffer = "";
  return {
    push(text: string): SseEvent[] {
      const { events, remainder } = parseSseFrames(buffer + text);
      buffer = remainder;
      return events;
    },
  };
}

// ---------------------------------------------------------------------------
// 1b. Authority-replacement reducer — events to UI state.
// ---------------------------------------------------------------------------

export type ClaraStreamStatus = "idle" | "streaming" | "terminal" | "detached";

export interface ClaraStreamState {
  status: ClaraStreamStatus;
  /** Live, provisional chunk payloads received during the CURRENT attach. Cleared on
   *  every terminal `message` (replaced by the authority) and on every `detached`
   *  (the reattach replays from index 0, so a stale partial buffer would double up). */
  provisionalChunks: unknown[];
  /** Set ONLY by a terminal `message` event — never inferred, never merged. `null`
   *  until then (law 2: absence is not evidence; an empty/absent transcript must render
   *  as "not yet authoritative", not as "empty"). */
  transcriptParts: ClaraPartLike[] | null;
  taskStatus: string | null;
  detachReason: string | null;
}

export const initialClaraStreamState: ClaraStreamState = {
  status: "idle",
  provisionalChunks: [],
  transcriptParts: null,
  taskStatus: null,
  detachReason: null,
};

function isTerminalMessagePayload(data: unknown): data is ClaraTerminalMessagePayload {
  return typeof data === "object" && data !== null && "status" in data;
}

function isDonePayload(data: unknown): data is ClaraDonePayload {
  return typeof data === "object" && data !== null && "status" in data;
}

function isDetachedPayload(data: unknown): data is ClaraDetachedPayload {
  return typeof data === "object" && data !== null && "reason" in data;
}

/** The one place the authority rule is implemented: a terminal `message` REPLACES
 *  `transcriptParts` wholesale and discards every provisional chunk — it never merges.
 *  Unknown event names are ignored (forward-compatible, never a crash). */
export function applyClaraStreamEvent(state: ClaraStreamState, event: SseEvent): ClaraStreamState {
  switch (event.event) {
    case "chunk":
      return { ...state, status: "streaming", provisionalChunks: [...state.provisionalChunks, event.data] };
    case "message": {
      if (!isTerminalMessagePayload(event.data)) return state; // never guess a shape we didn't see
      return {
        ...state,
        status: "terminal",
        transcriptParts: event.data.parts,
        taskStatus: event.data.status,
        provisionalChunks: [],
      };
    }
    case "done": {
      if (!isDonePayload(event.data)) return { ...state, status: "terminal" };
      return { ...state, status: "terminal", taskStatus: event.data.status };
    }
    case "detached": {
      const reason = isDetachedPayload(event.data) ? event.data.reason : null;
      return { ...state, status: "detached", detachReason: reason, provisionalChunks: [] };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 2. Network layer — fetch-based reader + the reattach loop.
// ---------------------------------------------------------------------------

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const parser = createSseFrameParser();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      for (const evt of parser.push(decoder.decode(value, { stream: true }))) {
        yield evt;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export interface OpenTaskStreamOptions {
  runtimeBase: string;
  token: string;
  taskId: string;
  signal: AbortSignal;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Attaches to `/api/tasks/:id/stream` via a streaming `fetch` (never `EventSource` —
 *  the route authenticates on the `Authorization` header, which `EventSource` cannot
 *  send: `streamRoute.ts:29`, `apps/dashboard/app/chat/api.ts` `streamTask` doc).
 *  Resolving THIS promise is "the server stream opens" — the one instant callers may
 *  treat a turn as sent (hard constraint: no optimistic rendering of turn success). */
export async function openTaskStream(opts: OpenTaskStreamOptions): Promise<AsyncGenerator<SseEvent>> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.runtimeBase}/api/tasks/${encodeURIComponent(opts.taskId)}/stream`, {
    headers: { authorization: `Bearer ${opts.token}`, accept: "text/event-stream" },
    cache: "no-store",
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`stream attach failed (${res.status})`);
  return readSseEvents(res.body);
}

export interface RunClaraTaskStreamOptions extends OpenTaskStreamOptions {
  /** Fires once per (re)attach, right after the stream opens — before any event is
   *  read. Idempotent on the caller's side: fires again on every reattach. */
  onOpen?: () => void;
  onEvent: (event: SseEvent) => void;
}

/** The detach -> reattach flow. Opens the stream; on a clean `done` it stops. On
 *  `detached` it loops and reattaches (the server replays from index 0, so the next
 *  attach's events are a fresh, complete replay — never a continuation to stitch by
 *  hand). Stops immediately if `signal` is already aborted, and lets a live `fetch`
 *  abort propagate as a rejection (callers race this against their own abort, same as
 *  `apps/dashboard/app/chat/api.ts` `streamTask` callers do). */
export async function runClaraTaskStream(opts: RunClaraTaskStreamOptions): Promise<void> {
  for (;;) {
    if (opts.signal.aborted) return;
    const events = await openTaskStream(opts);
    opts.onOpen?.();
    let detached = false;
    for await (const evt of events) {
      opts.onEvent(evt);
      if (evt.event === "detached") {
        detached = true;
        break;
      }
      if (evt.event === "done") return;
    }
    if (!detached) return; // stream ended without an explicit done/detached — stop rather than loop forever
  }
}
