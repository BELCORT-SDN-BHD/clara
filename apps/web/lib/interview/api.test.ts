import { test } from "node:test";
import assert from "node:assert/strict";

import type { SessionTokenAccessor } from "@/lib/session";
import {
  CLIENT_SEG_KEYS,
  COMPLETE_OUTCOMES,
  RuntimeApiError,
  answerInterview,
  classifyDeliveryBody,
  deriveChip,
  isNotPending,
  normalizeInterviewState,
  segmentProgress,
  type AnswerArgs,
} from "./api";

const SESSION: SessionTokenAccessor = { getAccessToken: async () => "session-token" };
const ANSWER: AnswerArgs = {
  runId: "run-1",
  scope: "client",
  parkIndex: 4,
  value: "yes",
  planId: "plan-1",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: "run-1",
    scope: "client",
    status: "running",
    pending_park: { parkIndex: 4, seg: "turnover", phase: "q", question: "Turnover?" },
    terminal: null,
    activity: [],
    plan: { id: "plan-1" },
    items: [],
    ...overrides,
  };
}

async function withFetch(
  replies: Array<Response | ((url: string, init: RequestInit | undefined) => Response | Promise<Response>)>,
  run: (calls: Array<{ url: string; init: RequestInit | undefined }>) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected fetch: ${url}`);
    return typeof next === "function" ? next(url, init) : next;
  }) as typeof fetch;
  try {
    await run(calls);
    assert.equal(replies.length, 0, "every mocked response should be consumed");
  } finally {
    globalThis.fetch = original;
  }
}

test("isNotPending recognizes only the typed not_pending runtime code", () => {
  assert.equal(isNotPending(new RuntimeApiError(409, "not_pending", "no open park")), true);
  assert.equal(isNotPending(new RuntimeApiError(409, "conflict", "plan is not open")), false);
  assert.equal(isNotPending(new Error("not_pending")), false);
});

test("segmentProgress exposes only the client segment ordinal and never fabricates a total", () => {
  assert.deepEqual(segmentProgress("client", CLIENT_SEG_KEYS[0]), { index: 1, seg: "legal_name" });
  assert.deepEqual(segmentProgress("client", "sample_invoices"), { index: 17, seg: "sample_invoices" });
  assert.equal(segmentProgress("client", "future_segment"), null);
  assert.equal(segmentProgress("firm", "legal_name"), null, "firm-scope inventory is deliberately out of this port");
});

test("deriveChip preserves the complete-class set and terminal precedence", () => {
  assert.deepEqual([...COMPLETE_OUTCOMES], ["firm_created", "interview_complete", "complete", "completed"]);
  assert.equal(deriveChip(null, { outcome: "interview_complete" }, "running"), "complete");
  assert.equal(deriveChip({ parkIndex: 1, seg: "legal_name", phase: "q", question: "Name?" }, { outcome: "expired" }, "running"), "expired");
  assert.equal(deriveChip(null, { outcome: "plan_gone" }, "complete"), "ended");
  assert.equal(deriveChip({ parkIndex: 1, seg: "legal_name", phase: "q", question: "Name?" }, null, "running"), "awaiting_you");
  assert.equal(deriveChip(null, null, "active"), "working");
  assert.equal(deriveChip(null, null, "failed"), "ended");
  assert.equal(deriveChip(null, null, null), "unknown");
});

test("normalizeInterviewState prefers pinned fields and tolerates the legacy current_prompt fallback", () => {
  const pinned = normalizeInterviewState(stateBody({
    pending_park: { parkIndex: 3, seg: "ssm", phase: "c", question: "Confirm?", op_key: "typed" },
    current_prompt: { type: "interview_prompt", parkIndex: 9, seg: "ignored", phase: "q", question: "Ignored" },
    activity: [
      { kind: "answered", seg: "legal_name", phase: "q", echo: "Rome", at: "2026-09-01T00:00:00Z" },
      { kind: "note", seg: "ignored" },
    ],
    items: [
      { item_key: "legal_name", item_kind: "must_ask", state: "answered", required_for_commit: true, question: "Name?", answer: "Rome" },
      { state: "answered" },
    ],
  }));
  assert.equal(pinned.pendingPark?.parkIndex, 3);
  assert.equal(pinned.pendingPark?.opKey, "typed");
  assert.equal(pinned.activity.length, 1);
  assert.equal(pinned.items.length, 1);
  assert.deepEqual(pinned.progress, { index: 3, seg: "ssm" });

  const legacy = normalizeInterviewState({
    run_id: "run-2",
    scope: "client",
    status: "running",
    current_prompt: { type: "interview_prompt", parkIndex: 2, seg: "entity_type", phase: "q", question: "Entity?" },
  });
  assert.equal(legacy.pendingPark?.seg, "entity_type");
  assert.equal(legacy.chip, "awaiting_you");
});

test("classifyDeliveryBody requires literal identity before accepting either positive delivery fact", () => {
  assert.equal(classifyDeliveryBody(stateBody({ pending_park: { parkIndex: 5 } }), ANSWER), "delivered");
  assert.equal(classifyDeliveryBody(stateBody({ pending_park: { parkIndex: 4 } }), ANSWER), "still_open");
  assert.equal(classifyDeliveryBody(stateBody({ pending_park: { parkIndex: 3 } }), ANSWER), "unknown");
  assert.equal(classifyDeliveryBody(stateBody({ terminal: { outcome: "interview_complete" }, pending_park: { parkIndex: 4 } }), ANSWER), "delivered");
  assert.equal(classifyDeliveryBody(stateBody({ terminal: { outcome: "cancelled" }, pending_park: { parkIndex: 9 } }), ANSWER), "unknown", "a non-complete terminal outvotes a stale higher park");
  assert.equal(classifyDeliveryBody(stateBody({ run_id: "other", pending_park: { parkIndex: 9 } }), ANSWER), "unknown");
  assert.equal(classifyDeliveryBody(stateBody({ scope: "firm", pending_park: { parkIndex: 9 } }), ANSWER), "unknown");
  assert.equal(classifyDeliveryBody(stateBody({ plan: { id: "other" }, pending_park: { parkIndex: 9 } }), ANSWER), "unknown");
});

test("answerInterview: a clean 200 resolves after one POST", async () => {
  await withFetch([jsonResponse({ ok: true })], async (calls) => {
    await answerInterview(ANSWER, { session: SESSION });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "/api/runtime/interview/answer");
    assert.equal(calls[0]?.init?.method, "POST");
  });
});

test("answerInterview: 409 not_pending resolves only when a re-read proves a higher park", async () => {
  await withFetch([
    jsonResponse({ error: "not_pending", message: "not accepted" }, 409),
    jsonResponse(stateBody({ pending_park: { parkIndex: 5, seg: "tin", phase: "q", question: "TIN?" } })),
  ], async (calls) => {
    await answerInterview(ANSWER, { session: SESSION });
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.url, /\/api\/runtime\/interview\/state\?/);
  });
});

test("answerInterview: 409 not_pending resolves when a re-read proves a complete-class terminal", async () => {
  await withFetch([
    jsonResponse({ error: "not_pending", message: "not accepted" }, 409),
    jsonResponse(stateBody({ pending_park: null, terminal: { outcome: "interview_complete" }, status: "complete" })),
  ], async () => {
    await answerInterview(ANSWER, { session: SESSION });
  });
});

test("answerInterview: still-open evidence earns exactly one retry", async () => {
  await withFetch([
    jsonResponse({ error: "not_pending", message: "not accepted" }, 409),
    jsonResponse(stateBody()),
    jsonResponse({ ok: true }),
  ], async (calls) => {
    await answerInterview(ANSWER, { session: SESSION });
    assert.equal(calls.filter((c) => c.url === "/api/runtime/interview/answer").length, 2);
  });
});

test("answerInterview: duplicate submit of the last answer resolves after 409 -> still_open -> 409 -> delivered re-read", async () => {
  await withFetch([
    jsonResponse({ error: "not_pending", message: "not accepted" }, 409),
    jsonResponse(stateBody()),
    jsonResponse({ error: "not_pending", message: "not accepted again" }, 409),
    jsonResponse(stateBody({ pending_park: null, terminal: { outcome: "interview_complete" }, status: "complete" })),
  ], async (calls) => {
    await answerInterview(ANSWER, { session: SESSION });
    assert.equal(calls.length, 4, "the recovery is bounded to two POSTs and two reads");
  });
});

test("GH #152: unknown or still-open re-reads NEVER silently classify a genuinely dropped answer as delivered", async (t) => {
  await t.test("an unknown first read throws the original refusal without retrying", async () => {
    await withFetch([
      jsonResponse({ error: "not_pending", message: "dropped" }, 409),
      jsonResponse({}),
    ], async () => {
      await assert.rejects(
        answerInterview(ANSWER, { session: SESSION }),
        (e: unknown) => e instanceof RuntimeApiError && e.code === "not_pending" && e.message === "dropped",
      );
    });
  });

  await t.test("still_open on both reads throws after the single bounded retry", async () => {
    await withFetch([
      jsonResponse({ error: "not_pending", message: "first refusal" }, 409),
      jsonResponse(stateBody()),
      jsonResponse({ error: "not_pending", message: "retry refusal" }, 409),
      jsonResponse(stateBody()),
    ], async () => {
      await assert.rejects(
        answerInterview(ANSWER, { session: SESSION }),
        (e: unknown) => e instanceof RuntimeApiError && e.code === "not_pending" && e.message === "retry refusal",
      );
    });
  });
});
