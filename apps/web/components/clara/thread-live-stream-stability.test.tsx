// #727 — THE LIVE TURN MUST SURVIVE ITS OWN STREAM.
//
// THE HOSTED OBSERVATION (2026-09-11 signed-in walk, clara-web 8560d72f). A turn was sent
// from the rail, the chat-lane `clarify` card rendered with its answer control, the turn
// clock counted "Clara has been working on this for 1:19" — and about a minute later the
// rail replaced the whole live view with
//   "Could not send that message: stream error: Minified React error #185"
// (#185 = "Maximum update depth exceeded"). The question itself was fine: after a reload
// the PERSISTED card rendered, accepted the answer and the run resumed. So nothing was
// wrong with the clarify, the door, or the park — the LIVE VIEW tore itself down.
//
// THE MECHANISM, MEASURED (not reasoned from the stack trace, which is minified).
//   1. `TurnProgress` took its clock as a DEFAULT PARAMETER — `now = () => Date.now()`.
//      A default parameter's initializer runs on every call, so `now` was a NEW function
//      identity on every render.
//   2. That identity was a dependency of the effect that arms the one-second tick, and
//      the effect's body calls `setNowMs(now())`.
//   3. So: render -> effect (deps "changed") -> setState -> render -> effect -> …
//      React bails out only while two consecutive `Date.now()` reads land in the SAME
//      millisecond, which a cheap render does and a real one — a long transcript with a
//      clarify card and two Work cards in it — does not. Measured here before the fix:
//      six timers armed just to MOUNT this component, 86 in total by the end of 50 further
//      parent renders, and 439 armed across the 200-delta burst in cell 3 below.
//   4. Each of those commits leaves work pending, which is what React counts toward its
//      nested-update ceiling. Past the ceiling the NEXT `scheduleUpdateOnFiber` throws —
//      and during a stream that call comes from `claraThreadStore.emit()` inside
//      `applyStreamEvent`, i.e. inside `runClaraTaskStream`'s own `onEvent(evt)`
//      (lib/clara/stream.ts:376), which has no catch. The throw rejects the stream promise,
//      `useClaraThread`'s `.catch` calls `markSendFailed("stream error: …")`, and THAT is
//      the banner the owner read. The sentence "Could not send that message" was never
//      about the message: it was React's own error arriving through the stream's rejection.
//      THAT LAST STEP IS PINNED, not inferred: the cell "a throw from inside
//      applyStreamEvent leaves through the STREAM" below drives a throwing store
//      subscriber through the real `runClaraTaskStream` and reads the resulting banner off
//      the rendered thread. Nothing here claims to have re-created React's OWN throw — it
//      substitutes a subscriber that throws, which is what React's `useSyncExternalStore`
//      subscriber IS once the scheduler is past its ceiling.
//
// WHY THE CELLS BELOW ARE SHAPED THIS WAY. The loop is CLOCK-RESOLUTION dependent: with a
// monotonically advancing `Date.now` it never terminates at all (measured: 19,328 React
// "Maximum update depth exceeded" warnings and still going, on one burst of deltas), so a
// cell that forced that condition would hang rather than fail. What is deterministic — and
// what IS the defect — is that the turn clock re-arms its timer on every render. That is
// cell 1, and it is red on the code this ticket was filed against.
//
// NOT FIXED BY CATCHING ANYTHING. A `try/catch` around `onEvent`, a debounce on the
// transcript, or dropping the clarify re-read would each hide this while leaving a
// component that schedules an update per render. The fix is the identity: the clock is read
// through a ref (the SAME discipline lib/parts/hooks.ts already documents for `session` and
// `loader`, after the 4GB-heap measurement recorded in its header), so the effect depends on
// `startedAt` alone and arms exactly one timer per turn.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Component, Profiler, createElement, useState, type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { TURN_PROGRESS_TICK_MS, TurnProgress } from "./TurnProgress";
import { ClarifyCard, CLARIFY_ROW_ATTEMPTS } from "../parts/ClarifyCard";
import { WorkAcceptedCard } from "../parts/WorkCards";
import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import { runClaraTaskStream } from "../../lib/clara/stream";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";

// `next/link`'s prefetch-on-visible hook reaches `self.requestIdleCallback`, which a bare
// Node process has not got — the `work_accepted` card in this transcript renders a Link, and
// without this shim the whole thread crashes into the boundary before a single delta lands.
enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD_ID = "44444444-4444-4444-8444-444444444444";
const TASK_ID = "44444444-4444-4444-8444-444444444445";
const WORK_ID = "44444444-4444-4444-8444-444444444446";
const CLIENT_ID = "44444444-4444-4444-8444-444444444447";
const INTERRUPTION_ID = "44444444-4444-4444-8444-444444444448";
const QUESTION = "Which posting date should this bank charge use?";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A `setInterval` census, filtered to the turn clock's own period. The count IS the
 *  number of times `TurnProgress`'s effect ran, which before the fix is the number of
 *  times the thread rendered — the instrument and the defect are the same measurement. */
function countTurnClockTimers(): { armed: () => number; restore: () => void } {
  const real = globalThis.setInterval;
  let armed = 0;
  (globalThis as unknown as { setInterval: unknown }).setInterval = ((
    fn: () => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    if (ms === TURN_PROGRESS_TICK_MS) armed += 1;
    return (real as unknown as (...a: unknown[]) => unknown)(fn, ms, ...rest);
  }) as unknown as typeof setInterval;
  return {
    armed: () => armed,
    restore: () => { (globalThis as unknown as { setInterval: unknown }).setInterval = real; },
  };
}

/** React's own name for this defect, in the words it prints in development. The
 *  production build throws #185 instead; both are the same ceiling. */
const NESTED_UPDATE = /Maximum update depth exceeded/;

function spyConsoleError(): { messages: () => string[]; restore: () => void } {
  const real = console.error;
  const seen: string[] = [];
  console.error = ((...args: unknown[]) => {
    seen.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  }) as typeof console.error;
  return { messages: () => seen, restore: () => { console.error = real; } };
}

/** The harness's error boundary: a render that throws must be VISIBLE to the cell rather
 *  than silently unmounting the tree the assertions then fail to find. */
class Boundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error) { this.props.onError(error); }
  override render() { return this.state.failed ? null : this.props.children; }
}

function intl(children: ReactNode): ReactElement {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children });
}

// ---------------------------------------------------------------------------
// 1. THE ROOT CAUSE — one turn, one timer.
// ---------------------------------------------------------------------------

let bumpParent: (() => void) | null = null;

function ClockUnderAStream(): ReactElement {
  const [delta, setDelta] = useState(0);
  bumpParent = () => setDelta((n) => n + 1);
  return createElement(
    "div",
    null,
    createElement("span", null, `delta ${delta}`),
    // EXACTLY the production call site (ClaraThreadView.tsx) — no injected clock, because
    // the defect lived in what the component supplied for itself when the caller passed none.
    createElement(TurnProgress, { startedAt: "2026-09-11T00:00:00.000Z", parked: false }),
  );
}

test("the turn clock arms ONE timer for one turn, however many live deltas re-render the thread", async () => {
  const timers = countTurnClockTimers();
  const errors = spyConsoleError();
  try {
    const h = await renderComponent(intl(createElement(ClockUnderAStream)));
    try {
      const atMount = timers.armed();
      // A STREAMING TURN IS A RE-RENDER PER DELTA. `ClaraThreadView` reads the store through
      // `useSyncExternalStore`, so every `chunk` event re-renders this subtree; 50 is a
      // conservative model of one paragraph of streamed text.
      const DELTAS = 50;
      for (let i = 0; i < DELTAS; i += 1) await h.act(() => bumpParent!());

      assert.equal(
        atMount,
        1,
        `mounting the turn clock must arm exactly one timer; it armed ${atMount}, which means the mount itself already looped`,
      );
      assert.equal(
        timers.armed(),
        1,
        `the turn clock re-armed its timer ${timers.armed() - atMount} times across ${DELTAS} deltas — an effect whose dependency is a fresh identity per render, calling setState in its body, is React's own definition of a nested-update loop`,
      );
      assert.deepEqual(
        errors.messages().filter((m) => NESTED_UPDATE.test(m)),
        [],
        "React must not report a nested-update ceiling while a turn streams",
      );
    } finally {
      await h.unmount();
    }
  } finally {
    errors.restore();
    timers.restore();
  }
});

test("the turn clock still TICKS — the fix is a stable identity, not a deleted timer", async () => {
  // The vacuity control for the cell above: "armed once" would also be satisfied by a
  // component that no longer counts. This drives the one armed interval by hand.
  let clock = Date.parse("2026-09-11T00:00:00.000Z");
  const readClock = () => clock;
  let tick: (() => void) | null = null;
  const real = globalThis.setInterval;
  (globalThis as unknown as { setInterval: unknown }).setInterval = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms === TURN_PROGRESS_TICK_MS) tick = fn;
    return (real as unknown as (...a: unknown[]) => unknown)(fn, ms, ...rest);
  }) as unknown as typeof setInterval;
  try {
    const h = await renderComponent(
      intl(createElement(TurnProgress, { startedAt: "2026-09-11T00:00:00.000Z", parked: false, now: readClock })),
    );
    try {
      assert.match(h.text(), /for 0:00/, "the clock starts at the run's own recorded start");
      clock += 65_000;
      await h.act(() => { tick!(); });
      assert.match(h.text(), /for 1:05/, "one armed interval still advances the rendered elapsed time");
    } finally {
      await h.unmount();
    }
  } finally {
    (globalThis as unknown as { setInterval: unknown }).setInterval = real;
  }
});

// ---------------------------------------------------------------------------
// 2. THE JOURNEY — the whole transcript under a burst of live deltas.
// ---------------------------------------------------------------------------

/** The transcript the hosted turn actually had behind it: a durable `work_accepted`
 *  card (which hydrates its Work on mount, #629/#725) and a `work_status` line, so the
 *  burst below re-renders everything #727 names, not a bare view. */
const TRANSCRIPT = [
  {
    id: "message-1",
    role: "assistant",
    parts: [
      { type: "text", text: "I have admitted that as accounting work." },
      { type: "work_accepted", work_id: WORK_ID, client_id: CLIENT_ID, purpose: "journal_entry", logical_op_id: `work:${WORK_ID}:journal_entry:1` },
      { type: "work_status", work_id: WORK_ID, status: "awaiting_input" },
    ],
    turn_key: null,
    task_id: TASK_ID,
    seq: 1,
    created_at: "2026-09-11T00:00:01.000Z",
  },
];

const clarifyChunk = {
  type: "tool-call",
  toolCallId: "call-727",
  toolName: "clarify",
  input: { question: QUESTION },
};

function pendingRow(status = "pending", answer: Record<string, unknown> | null = null) {
  return {
    id: INTERRUPTION_ID, task_id: TASK_ID, kind: "clarify",
    question: { question: QUESTION }, answer, status,
    asked_of: null, answered_by: answer ? "u1" : null,
    expires_at: "2026-09-12T00:00:00.000Z", created_at: "2026-09-11T00:00:00.000Z",
    answered_at: answer ? "2026-09-11T00:05:00.000Z" : null,
  };
}

type Counts = { interruptionReads: number };

/** Commits of the transcript subtree — the one containing the clarify card and both Work
 *  cards. `Profiler` is React's own instrument for this and needs no access to the
 *  components it measures, which is what makes it usable on a tree this cell renders
 *  through `ClaraThreadView` rather than assembling by hand. */
const transcriptCommits = { count: 0 };

async function withLiveTurn(
  run: (h: Awaited<ReturnType<typeof renderComponent>>, counts: Counts, boundaryErrors: Error[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  // `WorkAcceptedCard` hydrates through the blessed singleton, which otherwise waits out
  // its own bounded timeout before every read in this cell.
  configureSessionTokenSource(async () => "tok");
  const counts: Counts = { interruptionReads: 0 };
  let row = pendingRow();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/runtime/chat/sessions/")) return json({ messages: TRANSCRIPT });
    if (url.includes("agent_tasks_visible")) {
      // RELATIVE TO NOW, and that is load-bearing rather than tidy. `elapsedSeconds`
      // (lib/clara/turnRun.ts:167) returns null — and `TurnProgress` therefore renders
      // NOTHING — for a start that is in the future of the browser's own clock. A fixed
      // literal makes "is the clock on screen?" depend on what day the suite runs, which
      // is exactly the kind of silent skip the assertion below exists to prevent.
      return json([{ id: TASK_ID, status: "running", created_at: new Date(Date.now() - 5_000).toISOString() }]);
    }
    if (url.includes("/rest/v1/rpc/answer_interruption")) {
      void init;
      row = pendingRow("answered", { text: "2026-08-31" });
      return json({ status: "answered" });
    }
    if (url.includes("/rest/v1/agent_interruptions")) {
      counts.interruptionReads += 1;
      return json([row]);
    }
    // Everything else this transcript touches (the Work row the accepted card hydrates,
    // the caller context) answers honestly empty rather than throwing the burst apart.
    return json([]);
  }) as typeof fetch;

  const boundaryErrors: Error[] = [];
  transcriptCommits.count = 0;
  const h = await renderComponent(
    intl(
      createElement(Boundary, {
        onError: (e: Error) => boundaryErrors.push(e),
        children: createElement(Profiler, {
          id: "clara-transcript",
          onRender: () => { transcriptCommits.count += 1; },
          children: createElement(ClaraThreadView, { auth: session, threadId: THREAD_ID, variant: "full" }),
        }),
      }),
    ),
  );
  try {
    await h.settle();
    await h.settle();
    await run(h, counts, boundaryErrors);
  } finally {
    await h.unmount();
    claraThreadStore.reset(THREAD_ID);
    resetSessionTokenSource();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

/** Drives the store exactly as `attachClaraStream`'s `onEvent` does — one `applyStreamEvent`
 *  per SSE frame, each one an `emit()` that re-renders every subscriber. */
async function pumpDeltas(h: { act: (fn: () => void) => Promise<void> }, from: number, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await h.act(() => {
      claraThreadStore.applyStreamEvent(THREAD_ID, {
        event: "chunk",
        data: { type: "text-delta", id: `d${from + i}`, text: `token ${from + i} ` },
      });
    });
  }
}

test("a live clarify survives a 200-delta stream: no nested-update ceiling, and the re-read stays bounded", async () => {
  const timers = countTurnClockTimers();
  const errors = spyConsoleError();
  try {
    await withLiveTurn(async (h, counts, boundaryErrors) => {
      // The clarify arrives MID-STREAM, exactly as the hosted turn's did: deltas before it,
      // many more after it, with the card mounted and answerable throughout.
      await pumpDeltas(h, 0, 20);
      await h.act(() => {
        claraThreadStore.applyStreamEvent(THREAD_ID, { event: "chunk", data: clarifyChunk });
      });
      await h.settle();
      assert.match(h.text(), new RegExp(QUESTION), "the live clarify must be on screen before the burst");
      // THE VACUITY CONTROL ON THE TIMER CENSUS BELOW. `countTurnClockTimers` counts
      // one-second intervals, and a transcript with NO turn clock in it arms none — so
      // "the clock re-armed at most one timer" would be trivially true on a screen where
      // the component carrying the defect was never mounted at all. `TurnProgress` renders
      // null unless the run's start is readable and in the past (turnRun.ts's
      // `elapsedSeconds`), so reading its sentence off the screen is the one way to know
      // the instrument has a subject.
      assert.match(
        h.text(),
        /working on this for/,
        "the turn clock must be ON SCREEN before its timers are counted — an absent clock arms no intervals and would pass the census for the wrong reason",
      );
      const afterClarify = timers.armed();
      const readsAfterClarify = counts.interruptionReads;
      const commitsAfterClarify = transcriptCommits.count;
      const burstStartedAt = Date.now();

      await pumpDeltas(h, 20, 200);

      assert.deepEqual(
        boundaryErrors.map((e) => e.message),
        [],
        "no render in the transcript may throw while the stream is delivering",
      );
      assert.deepEqual(
        errors.messages().filter((m) => NESTED_UPDATE.test(m)),
        [],
        "React reported its nested-update ceiling during the stream — this is the production error 185 in development's own words",
      );
      assert.ok(
        timers.armed() - afterClarify <= 1,
        `the turn clock re-armed ${timers.armed() - afterClarify} timers across 200 deltas; one turn is one timer`,
      );
      // (c) The bounded re-read is bounded BY ITS OWN CAP, not by how long the stream ran.
      // `ClarifyCard`'s window is CLARIFY_ROW_ATTEMPTS ticks; the row here is answered on the
      // FIRST read, so the window closes at once and 200 further deltas must buy no reads.
      assert.ok(
        counts.interruptionReads - readsAfterClarify <= CLARIFY_ROW_ATTEMPTS,
        `the clarify card issued ${counts.interruptionReads - readsAfterClarify} reads across 200 deltas — the window is ${CLARIFY_ROW_ATTEMPTS} ticks and a delta is not a tick`,
      );
      // (b) THE TRANSCRIPT'S OWN RENDER BUDGET — the WO's "renders <= deltas + a small
      // constant", measured on the subtree that actually mounts the clarify card and both
      // Work cards. A `Profiler` commits once per commit of the tree it wraps, so this is
      // an upper bound on how many times each card inside it rendered; the per-CARD
      // counters live in the churn cell below, which mounts the two components directly
      // and can therefore count their own calls rather than their parent's.
      //
      // THE BUDGET IS SPELLED OUT RATHER THAN GUESSED, because two of its terms are REAL
      // TIME and this cell runs on a shared machine: 200 deltas, plus one commit per second
      // the burst actually took (the turn clock ticks once a second, by design — that IS
      // the component working correctly), plus the clarify card's own bounded re-read
      // window, plus a small constant for the settles. Measured: 204 commits for 200 deltas
      // running alone (a ~5s burst), 212 under the full suite (a ~15s burst) — i.e. the
      // whole difference between the two was the clock ticking, which is exactly the term
      // added here rather than absorbed into a fudged constant. The pre-fix build is
      // nowhere near this bound: its own census armed 439 one-second timers across this
      // same burst, and every one of those arms follows a commit.
      const burstSeconds = Math.ceil((Date.now() - burstStartedAt) / 1000);
      const commitBudget = 200 + burstSeconds + CLARIFY_ROW_ATTEMPTS + 8;
      const commitsDuringBurst = transcriptCommits.count - commitsAfterClarify;
      assert.ok(
        commitsDuringBurst <= commitBudget,
        `the transcript committed ${commitsDuringBurst} times for 200 deltas over ${burstSeconds}s (budget ${commitBudget}) — one commit per delta, one per second of turn clock, the card's bounded re-read and a small constant is the bound; anything beyond it is a component updating itself`,
      );
      // The failure the owner actually saw. `markSendFailed` is the only writer of this
      // banner, and during a stream its only caller is the rejection of `runClaraTaskStream`.
      assert.doesNotMatch(h.text(), /Could not send that message/, "the live view must not tear itself down mid-turn");
    });
  } finally {
    errors.restore();
    timers.restore();
  }
});

test("the live clarify is still ANSWERABLE IN PLACE after a burst of deltas", async () => {
  await withLiveTurn(async (h) => {
    await h.act(() => {
      claraThreadStore.applyStreamEvent(THREAD_ID, { event: "chunk", data: clarifyChunk });
    });
    await h.settle();
    await pumpDeltas(h, 0, 60);
    await h.settle();

    const answerButton = (node: Stub) => node.tagName === "BUTTON" && textOf(node).trim() === "Answer";
    const control = h.find(answerButton);
    assert.ok(control, "the answer control must still be mounted after the stream has re-rendered 60 times");
    const input = h.find((node) => node.tagName === "INPUT" && node.type !== "file");
    assert.ok(input);
    await h.act(() => setFieldValue(input, "2026-08-31"));
    await h.act(() => clickButton(h.find(answerButton)!));
    await h.settle();
    assert.match(h.text(), /Answered by your firm/, "answering in place must still reach the governed door and re-read the row");
  });
});

/**
 * THE MIS-ATTRIBUTION, PINNED — why a React error was printed as a MESSAGE failure.
 *
 * The header of this file, and the comment in `TurnProgress.tsx`, both assert a causal
 * chain: React's throw leaves through `claraThreadStore.emit()`, inside
 * `applyStreamEvent`, inside `runClaraTaskStream`'s uncaught `onEvent(evt)`
 * (lib/clara/stream.ts:376), which rejects the stream promise, which
 * `useClaraThread.ts:208` turns into `markSendFailed("stream error: …")`, which
 * `ClaraThreadView` renders as "Could not send that message: …". That is a claim about
 * this code's behaviour, so it is measured here rather than reasoned from a minified
 * stack trace.
 *
 * WHAT STANDS IN FOR REACT. A store SUBSCRIBER that throws — which is exactly what React's
 * `useSyncExternalStore` subscriber is when `scheduleUpdateOnFiber` is past the
 * nested-update ceiling. `emit()` (threadStore.ts:113) calls its listeners with no
 * try/catch, so the identity of the throwing listener is the only thing this substitutes.
 *
 * IT IS ALSO A DEFECT IN ITS OWN RIGHT, and this cell is the evidence for it: a sentence
 * that says "could not send that message" about a message that WAS sent, and a turn that
 * was running fine, sent the owner looking in the wrong place for a minute. Repairing the
 * attribution (a stream reader that distinguishes a transport failure from a subscriber's
 * own throw) belongs to its own ticket — it would change `runClaraTaskStream`'s contract,
 * which is outside #727's lane.
 */
function oneChunkStream(): typeof fetch {
  return (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const frame = `event: chunk\ndata: ${JSON.stringify({ type: "text-delta", id: "d1", text: "token " })}\n\n`;
          controller.enqueue(new TextEncoder().encode(frame));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch;
}

test("a throw from inside applyStreamEvent leaves through the STREAM, and the banner blames the message", async () => {
  await withLiveTurn(async (h) => {
    // React's own words for the ceiling, in the shape a PRODUCTION build throws them. The
    // code is ASSEMBLED rather than typed: a bare "#185" inside a string literal reads as a
    // three-digit hex colour to the raw-colour ESLint rule (owner ruling Q4), which is why
    // this repo keeps ticket-and-error ids like it out of literals.
    const ceilingCode = `#${185}`;
    const reactThrow = new Error(`Minified React error ${ceilingCode}; visit https://react.dev/errors/185 for the full message`);
    let thrown = false;
    const unsubscribe = claraThreadStore.subscribe(() => {
      if (thrown) return;
      thrown = true;
      throw reactThrow;
    });

    let caught: unknown = null;
    try {
      // INSIDE `act`, because the event this drives really does update the mounted thread —
      // running it outside would make React print its "not wrapped in act(...)" warning and
      // leave the re-render this cell then reads unflushed.
      await h.act(async () => {
        try {
          await runClaraTaskStream({
            token: "tok",
            taskId: TASK_ID,
            signal: new AbortController().signal,
            fetchImpl: oneChunkStream(),
            // VERBATIM `attachClaraStream`'s wiring (useClaraThread.ts): the store call IS
            // the callback, with nothing between them to catch anything.
            onEvent: (evt) => claraThreadStore.applyStreamEvent(THREAD_ID, evt),
          });
        } catch (err) {
          caught = err;
        }
      });
    } finally {
      unsubscribe();
    }

    assert.strictEqual(
      caught,
      reactThrow,
      "the subscriber's throw must come back out as the STREAM's rejection — that is the whole mis-attribution",
    );
    assert.ok(thrown, "the throwing subscriber must actually have been reached by an emit");

    // And now exactly what `useClaraThread.ts:208` does with that rejection.
    await h.act(() => {
      claraThreadStore.markSendFailed(THREAD_ID, `stream error: ${(caught as Error).message}`);
    });
    await h.settle();
    assert.match(
      h.text(),
      /Could not send that message: stream error: Minified React error #185/,
      "the banner the owner read is React's own error, arriving through the stream's rejection",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. HOSTILE INPUT AT THE CARD — a fresh `part` object on every delta.
// ---------------------------------------------------------------------------

let churn: (() => void) | null = null;
/** THE WO's A.1(b) COUNTERS, one per card — now a `Profiler` around EACH card, the same
 *  instrument `withLiveTurn` already uses for the transcript (see `transcriptCommits`
 *  above). A counter that lives in the wrapper's own function body only fires when the
 *  WRAPPER is re-invoked, which happens exactly once per parent render — it can never see
 *  a commit the CARD schedules on itself (its bounded re-read's `setTimeout`, its own
 *  hydration `setState`), so it silently measures the churn loop instead of the card. A
 *  `Profiler`'s `onRender` fires on every commit of the subtree it wraps, parent-driven or
 *  self-driven, which is what makes counting it a genuine count of the card. `WorkAcceptedCard`
 *  is in here because #629/#725 mounted it INSIDE the transcript between the previous hosted
 *  walk and the one that failed: it hydrates the Work on mount, so a card that re-read per
 *  render would have been the second candidate cause. */
const clarifyRenders = { count: 0 };
const workAcceptedRenders = { count: 0 };

function CountingClarify(props: { answerable: boolean; question: string }): ReactElement {
  return createElement(Profiler, {
    id: "clarify-card",
    onRender: () => { clarifyRenders.count += 1; },
    children: createElement(ClarifyCard, {
      // A NEW `part` OBJECT EVERY RENDER, which is the production shape and not a contrivance:
      // `foldLiveClarifyParts` rebuilds its array inside a `useMemo` keyed on the chunk buffer,
      // and `applyClaraStreamEvent` makes that buffer a NEW array on every chunk — so this
      // prop's identity genuinely churns once per delta on a streaming turn.
      part: { type: "clarify" as const, tool_call_id: "call-727", question: props.question, context: null, framing: "" },
      taskId: TASK_ID,
      session,
      answerable: props.answerable,
    }),
  });
}

function CountingWorkAccepted(): ReactElement {
  return createElement(Profiler, {
    id: "work-accepted-card",
    onRender: () => { workAcceptedRenders.count += 1; },
    children: createElement(WorkAcceptedCard, {
      // The same fresh-object-per-render shape as the clarify above, for the same reason:
      // the transcript's parts come out of `state.messages`, which the store replaces
      // wholesale on every stream event.
      part: {
        type: "work_accepted" as const,
        work_id: WORK_ID,
        client_id: CLIENT_ID,
        purpose: "journal_entry",
        logical_op_id: `work:${WORK_ID}:journal_entry:1`,
      },
    }),
  });
}

function ChurningParent(): ReactElement {
  const [n, setN] = useState(0);
  churn = () => setN((v) => v + 1);
  void n;
  return createElement(
    "div",
    null,
    createElement(CountingClarify, { answerable: true, question: QUESTION }),
    createElement(CountingWorkAccepted, null),
  );
}

test("neither card storms its re-read when the part identity churns on every delta", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  // `WorkAcceptedCard` hydrates through the blessed singleton (`sessionTokenAccessor`),
  // which otherwise waits out its own bounded timeout before every read here.
  configureSessionTokenSource(async () => "tok");
  let reads = 0;
  let workReads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/rest/v1/accounting_work")) {
      workReads += 1;
      // NOT `awaiting_input`: a parked Work would mount `WorkQuestionPanel` under this
      // card, and what this cell measures is the card's OWN render budget under churn,
      // not the panel's. The panel has its own walk (work-question-walk.spec.ts).
      return json([{ id: WORK_ID, client_id: CLIENT_ID, status: "completed" }]);
    }
    if (url.includes("/rest/v1/agent_interruptions")) {
      reads += 1;
      // The production ordering: the row lands three durable step boundaries after the
      // chunk, so the first reads come back empty. The bounded window's ticks are a second
      // apart and this burst runs in far less than that, so within it the card must issue
      // its MOUNT read and nothing else — measured on the fix: 1 interruption read and 1
      // Work read across 120 deltas (both counters below), which is the read-per-mount
      // bound and no more.
      return json(reads > 2 ? [pendingRow()] : []);
    }
    return json([]);
  }) as typeof fetch;
  clarifyRenders.count = 0;
  workAcceptedRenders.count = 0;
  try {
    const h = await renderComponent(intl(createElement(ChurningParent)));
    try {
      await h.settle();
      const DELTAS = 120;
      for (let i = 0; i < DELTAS; i += 1) await h.act(() => churn!());
      await h.settle();
      // THE BOUND, DERIVED, not guessed: a `Profiler`-measured commit count is one commit
      // per churned delta (each delta hands the card a fresh `part` object it cannot bail
      // out of), plus the ONE mount commit, plus the two SELF-DRIVEN commits the mount-time
      // hydration read itself always produces regardless of churn — `useHydratedPart`'s
      // `setLoading(true)` fires as its own commit before the awaited read, then the
      // resolved `data`/`err`/`loading(false)` triple batches into a second commit after it
      // — plus a small constant for scheduler jitter. MEASURED on this fix, four runs,
      // stable every time: 123 commits each for the clarify card and the accepted-Work
      // card across 120 deltas, i.e. exactly 121 (delta + mount) + 2 (the one hydration
      // read's own two commits) — the DELTAS + 8 headroom below is not the true count, only
      // its ceiling.
      const cardCommitBudget = DELTAS + 1 /* mount */ + 2 /* mount hydration read */ + 5 /* jitter */;
      assert.ok(
        clarifyRenders.count <= cardCommitBudget,
        `the clarify card committed ${clarifyRenders.count} times for ${DELTAS} deltas (budget ${cardCommitBudget}) — one commit per delta, one mount, two commits for the mount-time hydration read, and a small constant is the bound`,
      );
      assert.ok(
        workAcceptedRenders.count <= cardCommitBudget,
        `the accepted-Work card committed ${workAcceptedRenders.count} times for ${DELTAS} deltas (budget ${cardCommitBudget}) — one commit per delta, one mount, two commits for the mount-time hydration read, and a small constant is the bound`,
      );
      assert.ok(
        reads <= CLARIFY_ROW_ATTEMPTS + 2,
        `the card issued ${reads} reads across ${DELTAS} deltas; the window is ${CLARIFY_ROW_ATTEMPTS} ticks and a fresh \`part\` object is not a tick`,
      );
      // The accepted card's own read is a MOUNT read (`useHydratedPart` over a `useCallback`
      // whose deps are the part's three ids, all primitives), so a churning `part` object
      // must buy no further reads at all.
      assert.ok(
        workReads <= 2,
        `the accepted-Work card issued ${workReads} Work reads across ${DELTAS} deltas — it hydrates ONCE on mount, and a fresh \`part\` object is not a new Work`,
      );
    } finally {
      await h.unmount();
    }
  } finally {
    resetSessionTokenSource();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
