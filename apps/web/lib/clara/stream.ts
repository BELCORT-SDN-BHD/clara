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

import { REDIRECTED } from "./api";
import type { ClaraPart } from "./api";

// ---------------------------------------------------------------------------
// 1a. Frame parsing — bytes to `{event, data}` pairs.
// ---------------------------------------------------------------------------

export type SseEventName = "chunk" | "message" | "done" | "detached";

export type SseEvent = { event: string; data: unknown };

/** Payload shapes for the three named (non-`chunk`) events, as `streamRoute.ts` sends
 *  them. `chunk`'s payload is intentionally left `unknown` — see the module doc above:
 *  this module treats it as an opaque liveness signal and never parses it.
 *
 *  ONE consumer outside this module now reads the buffer, and only for one chunk kind:
 *  `./liveClarify.ts`'s `foldLiveClarifyParts` folds a `clarify` TOOL-CALL chunk into a
 *  `clarify` part so a PARKED question is answerable in the thread (PRD §5a). It has to
 *  come from here because a parked clarify never reaches the persisted transcript —
 *  `clara.settle_chat_turn` cancels the pending interruption in the same statement
 *  sequence that inserts the assistant message. That fold changes nothing here: chunks
 *  stay `unknown` on this side of the seam, and the terminal `message` still REPLACES
 *  the transcript wholesale (clearing `provisionalChunks`, below) — the persisted parts
 *  remain the authority, and the fold's output disappears the moment they arrive.
 *
 *  P2 FOLD SEAM B: `parts` below is typed as the canonical `ClaraPart` union, but
 *  `isTerminalMessagePayload`'s runtime check only proves `data` is an object with a
 *  `status` field — it never walks `parts` to prove each element is a real union
 *  member. That narrowing (an `unknown` -> `ClaraTerminalMessagePayload` type
 *  predicate) IS the one wire/parse-boundary cast for this module: it is safe only
 *  because `PartRenderer` (components/parts/PartRenderer.tsx) is fail-closed on any
 *  part whose `type` it does not recognise, so a malformed element from this cast
 *  renders a visible "Unsupported part" chip rather than manufacturing a state the
 *  UI silently trusts. */
export type ClaraTerminalMessagePayload = { taskId: string; status: string; parts: ClaraPart[] | null };
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

export type ClaraStreamStatus = "idle" | "streaming" | "terminal" | "detached" | "connection-lost";

export interface ClaraStreamState {
  status: ClaraStreamStatus;
  /** Live, provisional chunk payloads received during the CURRENT attach. Cleared on
   *  every terminal `message` (replaced by the authority) and on every `detached`
   *  (the reattach replays from index 0, so a stale partial buffer would double up). */
  provisionalChunks: unknown[];
  /** Set ONLY by a terminal `message` event — never inferred, never merged. `null`
   *  until then (law 2: absence is not evidence; an empty/absent transcript must render
   *  as "not yet authoritative", not as "empty"). */
  transcriptParts: ClaraPart[] | null;
  taskStatus: string | null;
  detachReason: string | null;
  /** Consecutive failed (re)attach attempts since the last attach that yielded any
   *  event (FIX 1). `0` when not reconnecting; the reattach loop bumps this right
   *  before each backoff sleep, so the UI can show "Reconnecting… (attempt N)". Reset
   *  to `0` by every real SSE event — a successful attach is evidence the connection
   *  works again. */
  reconnectAttempt: number;
  /** `true` only while the most recent attach closed WITHOUT a `message`, `done`, or
   *  `detached` event — an ungraceful close (FIX 2), distinct from an explicit,
   *  graceful `detached`. Cleared by the next real SSE event. */
  streamEndedUnexpectedly: boolean;
  /** `true` only once the give-up ceiling (FIX 1) is reached: the reattach loop has
   *  stopped on its own and a human must retry manually. The manual-retry affordance
   *  the store exposes to the UI. */
  retryAvailable: boolean;
}

export const initialClaraStreamState: ClaraStreamState = {
  status: "idle",
  provisionalChunks: [],
  transcriptParts: null,
  taskStatus: null,
  detachReason: null,
  reconnectAttempt: 0,
  streamEndedUnexpectedly: false,
  retryAvailable: false,
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

/** Every real SSE event — whatever else it means — is evidence THIS attach is
 *  talking to the server: FIX 1's "backoff resets on a successful attach that yields
 *  any event" and FIX 2's "an ungraceful close is cleared by the next real event"
 *  both land here, spread into every branch below. */
const NOT_RECONNECTING = { reconnectAttempt: 0, streamEndedUnexpectedly: false, retryAvailable: false };

/** The one place the authority rule is implemented: a terminal `message` REPLACES
 *  `transcriptParts` wholesale and discards every provisional chunk — it never merges.
 *  Unknown event names are ignored (forward-compatible, never a crash). */
export function applyClaraStreamEvent(state: ClaraStreamState, event: SseEvent): ClaraStreamState {
  switch (event.event) {
    case "chunk":
      return { ...state, ...NOT_RECONNECTING, status: "streaming", provisionalChunks: [...state.provisionalChunks, event.data] };
    case "message": {
      if (!isTerminalMessagePayload(event.data)) return state; // never guess a shape we didn't see
      return {
        ...state,
        ...NOT_RECONNECTING,
        status: "terminal",
        transcriptParts: event.data.parts,
        taskStatus: event.data.status,
        provisionalChunks: [],
      };
    }
    case "done": {
      if (!isDonePayload(event.data)) return { ...state, ...NOT_RECONNECTING, status: "terminal" };
      return { ...state, ...NOT_RECONNECTING, status: "terminal", taskStatus: event.data.status };
    }
    case "detached": {
      const reason = isDetachedPayload(event.data) ? event.data.reason : null;
      return { ...state, ...NOT_RECONNECTING, status: "detached", detachReason: reason, provisionalChunks: [] };
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
  token: string;
  taskId: string;
  signal: AbortSignal;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Attaches to the runtime's `/api/tasks/:id/stream` via a streaming `fetch` (never
 *  `EventSource` — the route authenticates on the `Authorization` header, which
 *  `EventSource` cannot send: `streamRoute.ts:29`, `apps/dashboard/app/chat/api.ts`
 *  `streamTask` doc). Resolving THIS promise is "the server stream opens" — the one
 *  instant callers may treat a turn as sent (hard constraint: no optimistic rendering
 *  of turn success).
 *
 *  SAME-ORIGIN, through `app/api/runtime/[...path]/route.ts`, on the path that maps to
 *  the runtime route above (`/api/runtime/tasks/…` → `<runtime>/api/tasks/…`, route.ts:53
 *  — see `lib/clara/api.ts`'s header for the whole finding and the `/api/api` hazard).
 *  It streams by construction rather than by hope: the proxy returns
 *  `new Response(res.body, …)` (`route.ts:121`) — the body is passed through, never
 *  buffered — and `signal: req.signal` (`:80`) carries the abort onward.
 *
 *  WHICH HEADERS ACTUALLY REACH THE BROWSER, measured there rather than reasoned from
 *  the allow-list (an earlier version of this comment got the second one wrong):
 *    - `content-type: text/event-stream` — the runtime sets it
 *      (`packages/runtime/src/streamRoute.ts:49`), the proxy copies it (`route.ts:113-114`),
 *      and it arrives intact. That is the one this reader depends on, and the
 *      chat-parity walk asserts it off the real response.
 *    - `cache-control` — NOT the runtime's `no-cache, no-transform`. The proxy copies
 *      that value, and then this app's own auth floor overwrites it: every response
 *      leaving `proxy.ts` gets `private, no-store` (`lib/supabase/response-state.ts:44`,
 *      the `AUTH_RESPONSE_CACHE_CONTROL` constant at `lib/supabase/cookie-options.ts:69`).
 *      So the browser sees `cache-control: private, no-store`. That is FINE, and not a
 *      compromise: `no-store` is strictly stronger than `no-cache` for caching, and the
 *      `no-transform` half is not load-bearing here — Cloudflare does not transform
 *      `text/event-stream`. Recorded because a reader chasing a buffering bug would
 *      otherwise look for a header that is not on the wire.
 *    - `x-accel-buffering: no` (`streamRoute.ts:52`) is NOT on the proxy's response
 *      allow-list and does not reach the browser. It is an nginx hint and means nothing
 *      on workerd — do not add it to the allow-list to "fix" a buffering symptom.
 *  The one header the OUTBOUND allow-list drops, `accept`, is not read by
 *  `streamRoute.ts` — it sets the SSE headers unconditionally. The remaining unknown is
 *  whether a Route Handler's streamed body survives OpenNext-on-Workers; nothing in this
 *  repo can answer that, and the FS-10 preview walk (step S14) is the instrument that does.
 *
 *  `redirect: "manual"` for the reason `lib/clara/api.ts`'s `runtimeFetch` carries it,
 *  and it matters MOST here: an unauthenticated 307 to `/login`, followed, is a 200
 *  `text/html` body this reader would parse as SSE — no events, a graceless close, and
 *  eight silent reattach attempts. Manual, `res.ok` is false and the attach throws. */
export async function openTaskStream(opts: OpenTaskStreamOptions): Promise<AsyncGenerator<SseEvent>> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`/api/runtime/tasks/${encodeURIComponent(opts.taskId)}/stream`, {
    headers: { authorization: `Bearer ${opts.token}`, accept: "text/event-stream" },
    cache: "no-store",
    redirect: "manual",
    signal: opts.signal,
  });
  // BEFORE the `!res.ok` throw, and for the same reason `api.ts`'s `expectJson` checks it
  // first: an opaque-redirect response reports `status: 0`, so the generic throw below
  // would say "stream attach failed (0)" — a number that describes nothing and sends the
  // next reader hunting for a runtime error that never happened. Same gate, same 307, so
  // the same phrase, imported rather than re-typed.
  if (res.type === "opaqueredirect") throw new Error(`stream attach failed: ${REDIRECTED}`);
  if (!res.ok || !res.body) throw new Error(`stream attach failed (${res.status})`);
  return readSseEvents(res.body);
}

// ---------------------------------------------------------------------------
// 2a. Reconnect backoff (FIX 1) — exponential, capped, jittered, with a give-up
// ceiling. A `detached` (server-initiated, e.g. a drain window) and an ungraceful
// close (FIX 2 — no message/done/detached at all) are folded into the SAME policy:
// neither reattaches with zero delay, and neither retries forever.
// ---------------------------------------------------------------------------

export interface ReconnectPolicy {
  /** Delay before the FIRST reattach, in ms. */
  baseDelayMs: number;
  /** The exponential curve never exceeds this, in ms. */
  maxDelayMs: number;
  /** A small random amount (0..jitterMs) added on top of every delay, so many open
   *  tabs reattaching after the same drain window don't all land in the same instant. */
  jitterMs: number;
  /** Consecutive failed attempts allowed before giving up entirely. */
  maxAttempts: number;
}

/** 1s -> 2s -> 4s -> 8s -> 16s -> 30s (cap) -> 30s -> 30s, +0..250ms jitter, give up
 *  after 8 — roughly the "8 attempts or ~3 minutes" the work order asks for (the
 *  worst case above sums to ~121s of sleeping before the 9th, refused attempt). */
export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterMs: 250,
  maxAttempts: 8,
};

/** `attempt` is 1-based: the delay BEFORE that attempt is made. Exported so tests can
 *  independently verify the formula against whatever `onReconnectAttempt` observes. */
export function backoffDelayMs(attempt: number, policy: ReconnectPolicy = DEFAULT_RECONNECT_POLICY): number {
  const capped = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  return capped + Math.floor(Math.random() * policy.jitterMs);
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export interface RunClaraTaskStreamOptions extends OpenTaskStreamOptions {
  /** Fires once per (re)attach, right after the stream opens — before any event is
   *  read. Idempotent on the caller's side: fires again on every reattach. */
  onOpen?: () => void;
  onEvent: (event: SseEvent) => void;
  /** Fires right before each backoff sleep — `attempt` is 1-based (this is the Nth
   *  consecutive failed attempt), `delayMs` is what's about to be waited. */
  onReconnectAttempt?: (info: { attempt: number; delayMs: number }) => void;
  /** Fires when an attach's body ended WITHOUT `message`, `done`, or `detached` at all
   *  (FIX 2) — an ungraceful close. Fires once per such close, before it is folded
   *  into the same backoff/counter as an explicit `detached`. */
  onStreamEndedUnexpectedly?: () => void;
  /** Fires once the give-up ceiling is reached; no further reattach follows. */
  onGiveUp?: () => void;
  /** Injectable delay — defaults to a real `setTimeout`-based sleep. Tests inject a
   *  fake so backoff is proven without waiting in real time. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Overrides for `DEFAULT_RECONNECT_POLICY`, merged shallowly. */
  reconnectPolicy?: Partial<ReconnectPolicy>;
}

/** The detach -> reattach flow. Opens the stream; on a clean `done` it stops. On
 *  `detached` — or on an ungraceful close with no terminal event at all (FIX 2) — it
 *  reattaches after a backoff sleep (FIX 1; the server replays from index 0, so the
 *  next attach's events are a fresh, complete replay — never a continuation to stitch
 *  by hand), up to `reconnectPolicy.maxAttempts` consecutive failures before giving
 *  up. Stops immediately if `signal` is already aborted, and lets a live `fetch`
 *  abort or a non-ok response propagate as a rejection (callers race this against
 *  their own abort, same as `apps/dashboard/app/chat/api.ts` `streamTask` callers do)
 *  — attach failures are never retried by this loop, only detaches/ungraceful closes. */
export async function runClaraTaskStream(opts: RunClaraTaskStreamOptions): Promise<void> {
  const policy: ReconnectPolicy = { ...DEFAULT_RECONNECT_POLICY, ...opts.reconnectPolicy };
  const sleep = opts.sleepImpl ?? defaultSleep;
  let attempt = 0; // consecutive failed attaches since the last one that yielded any event

  for (;;) {
    if (opts.signal.aborted) return;
    const events = await openTaskStream(opts);
    opts.onOpen?.();
    let sawProgress = false; // some event OTHER than the closing `detached` signal itself
    let detached = false;
    for await (const evt of events) {
      opts.onEvent(evt);
      if (evt.event === "detached") {
        detached = true; // the failure/retry signal, not evidence of progress — don't reset on it
        break;
      }
      sawProgress = true;
      if (evt.event === "done") return; // clean terminal end — never reattach after it
    }
    // FIX 1: reset backoff only when THIS attach proved itself with real data (a
    // `chunk`) before it ended. An attach that gets nothing but an immediate
    // `detached` (the drain-storm case FIX 1 exists for) must NOT reset — every open
    // tab reattaching, resetting, and immediately detaching again is exactly the
    // zero-delay hammering this fix removes.
    if (sawProgress) attempt = 0;

    if (!detached) {
      // FIX 2: the body closed with no message/done/detached at all — an ungraceful
      // close. It is folded into the SAME backoff/counter as an explicit `detached`,
      // never auto-retried beyond the policy below.
      opts.onStreamEndedUnexpectedly?.();
    }

    attempt += 1;
    if (attempt > policy.maxAttempts) {
      opts.onGiveUp?.();
      return;
    }
    const delayMs = backoffDelayMs(attempt, policy);
    opts.onReconnectAttempt?.({ attempt, delayMs });
    await sleep(delayMs);
  }
}
