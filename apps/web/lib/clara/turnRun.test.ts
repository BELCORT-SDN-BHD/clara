// P6-5 — the run read that anchors 裁-132's elapsed-time indicator and the parked-clarify
// rehydration. Every cell here is about one of the two things this module must not do:
// invent a duration, or reach a question that is not this thread's.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  THREAD_RUN_LIVE_STATUSES,
  clarifyPartFromInterruptionQuestion,
  elapsedSeconds,
  formatElapsed,
  readRunByTaskId,
  readThreadRun,
  readThreadRunSnapshot,
} from "./turnRun";
import type { SessionTokenAccessor } from "@/lib/session";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const INTERRUPTION_ID = "33333333-3333-4333-8333-333333333333";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const START = "2026-09-02T10:00:00.000Z";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch(
  impl: (url: string) => Response,
  run: (calls: string[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return impl(url);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

// ---------------------------------------------------------------------------
// elapsedSeconds — the honest-instrument half of 裁-132
// ---------------------------------------------------------------------------

test("elapsed time is measured from the DB's start, and is ABSENT rather than zero when it cannot be", () => {
  const startMs = Date.parse(START);
  assert.equal(elapsedSeconds(START, startMs + 7_000), 7);
  assert.equal(elapsedSeconds(START, startMs + 7_999), 7, "seconds floor, never round up into time that has not passed");

  // The three arms that must yield NOTHING. A "0:00" here would be a duration this module
  // asserted without an anchor to measure it from — 裁-132 asks for an honest instrument.
  assert.equal(elapsedSeconds(null, startMs), null, "no start read yet");
  assert.equal(elapsedSeconds("not a timestamp", startMs), null, "an unparseable start");
  assert.equal(elapsedSeconds(START, startMs - 1_000), null, "a start in the FUTURE — clock skew, not a negative duration");
});

test("formatElapsed rolls into minutes and hours without ever losing a digit", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(9), "0:09");
  assert.equal(formatElapsed(75), "1:15");
  assert.equal(formatElapsed(3_600), "1:00:00");
  assert.equal(formatElapsed(3_661), "1:01:01");
});

// ---------------------------------------------------------------------------
// clarifyPartFromInterruptionQuestion — no card without a question we SAW
// ---------------------------------------------------------------------------

test("a rehydrated clarify carries the DB's own question, and nothing is rendered without one", () => {
  const part = clarifyPartFromInterruptionQuestion(INTERRUPTION_ID, {
    type: "clarify",
    question: "  Which client owns this invoice?  ",
    context: "from the intake",
    framing: "Answer in the thread.",
  });
  assert.ok(part);
  assert.equal(part.question, "Which client owns this invoice?");
  assert.equal(part.context, "from the intake");
  assert.equal(part.framing, "Answer in the thread.");
  assert.equal(
    part.tool_call_id,
    `interruption:${INTERRUPTION_ID}`,
    "the id is the DB row's own, prefixed so it can never collide with a stream tool-call id",
  );

  // Absence is not evidence: each of these yields NO card rather than an empty one implying
  // Clara asked something.
  assert.equal(clarifyPartFromInterruptionQuestion(INTERRUPTION_ID, null), null);
  assert.equal(clarifyPartFromInterruptionQuestion(INTERRUPTION_ID, { type: "clarify" }), null, "no question text");
  assert.equal(clarifyPartFromInterruptionQuestion(INTERRUPTION_ID, { type: "clarify", question: "   " }), null, "blank question");
  assert.equal(
    clarifyPartFromInterruptionQuestion(INTERRUPTION_ID, { type: "something_else", question: "x" }),
    null,
    "a row whose question jsonb is not a clarify part is not folded into one",
  );
});

// ---------------------------------------------------------------------------
// readThreadRun — the thread-scoped read, and the exact-one rule
// ---------------------------------------------------------------------------

test("the run read is scoped to THIS thread's session and to non-terminal statuses only", async () => {
  await withFetch(
    () => json([{ id: TASK_ID, status: "running", created_at: START }]),
    async (calls) => {
      const run = await readThreadRun(THREAD_ID, { session });
      assert.deepEqual(run, { id: TASK_ID, status: "running", created_at: START });

      const url = calls[0]!;
      assert.match(url, /agent_tasks_visible/, "the masked human view, never the base table");
      assert.match(url, new RegExp(`session_id=eq\\.${THREAD_ID}`), "THIS thread — the wall against another thread's question");
      assert.match(url, /limit=2/, "exact-one, so an ambiguous result stays observable");
      for (const status of THREAD_RUN_LIVE_STATUSES) {
        assert.ok(decodeURIComponent(url).includes(status), `the status filter names ${status}`);
      }
      assert.ok(!decodeURIComponent(url).includes("completed"), "a terminal task is not a run in flight");
    },
  );
});

test("two live rows on one thread resolve to NO run — never to whichever sorted first", async () => {
  await withFetch(
    () => json([
      { id: TASK_ID, status: "running", created_at: START },
      { id: "44444444-4444-4444-8444-444444444444", status: "running", created_at: START },
    ]),
    async () => {
      assert.equal(await readThreadRun(THREAD_ID, { session }), null);
      assert.equal(await readRunByTaskId(TASK_ID, { session }), null);
    },
  );
});

test("a malformed row is not a run", async () => {
  await withFetch(
    () => json([{ id: TASK_ID, status: "running" }]),
    async () => {
      assert.equal(await readThreadRun(THREAD_ID, { session }), null, "no created_at means no start to measure from");
    },
  );
});

// ---------------------------------------------------------------------------
// readThreadRunSnapshot — the two-hop path, and what it refuses to do
// ---------------------------------------------------------------------------

test("a parked run rehydrates its question through the task's OWN exact-one pending row", async () => {
  await withFetch(
    (url) => {
      if (url.includes("agent_tasks_visible")) return json([{ id: TASK_ID, status: "awaiting_input", created_at: START }]);
      if (url.includes("agent_interruptions")) {
        return json([{
          id: INTERRUPTION_ID,
          task_id: TASK_ID,
          kind: "clarify",
          question: { type: "clarify", question: "Which client owns this invoice?", context: null, framing: "" },
          answer: null,
          status: "pending",
          asked_of: null,
          answered_by: null,
          expires_at: "2026-09-03T00:00:00Z",
          created_at: START,
          answered_at: null,
        }]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const snapshot = await readThreadRunSnapshot(THREAD_ID, { session });
      assert.equal(snapshot.run?.status, "awaiting_input");
      assert.equal(snapshot.parkedClarify?.question, "Which client owns this invoice?");

      const interruptionRead = calls.find((u) => u.includes("agent_interruptions"));
      assert.ok(interruptionRead);
      assert.match(
        interruptionRead,
        new RegExp(`task_id=eq\\.${TASK_ID}`),
        "addressed by the TASK the thread's own run read returned — the hop that keeps another thread's question out",
      );
      assert.match(interruptionRead, /status=eq\.pending/);
    },
  );
});

test("a RUNNING (not parked) task reads no interruption at all", async () => {
  await withFetch(
    (url) => {
      if (url.includes("agent_tasks_visible")) return json([{ id: TASK_ID, status: "running", created_at: START }]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const snapshot = await readThreadRunSnapshot(THREAD_ID, { session });
      assert.equal(snapshot.run?.status, "running");
      assert.equal(snapshot.parkedClarify, null);
      assert.equal(calls.filter((u) => u.includes("agent_interruptions")).length, 0);
    },
  );
});

test("a parked status with NO readable pending row yields no question — a status is not a question", async () => {
  await withFetch(
    (url) => {
      if (url.includes("agent_tasks_visible")) return json([{ id: TASK_ID, status: "awaiting_input", created_at: START }]);
      if (url.includes("agent_interruptions")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const snapshot = await readThreadRunSnapshot(THREAD_ID, { session });
      assert.equal(snapshot.run?.status, "awaiting_input");
      assert.equal(snapshot.parkedClarify, null, "absence of the row is not evidence that a question exists");
    },
  );
});

test("no live task at all is the honest 'no turn in flight' answer", async () => {
  await withFetch(
    (url) => {
      if (url.includes("agent_tasks_visible")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      assert.deepEqual(await readThreadRunSnapshot(THREAD_ID, { session }), { run: null, parkedClarify: null });
    },
  );
});
