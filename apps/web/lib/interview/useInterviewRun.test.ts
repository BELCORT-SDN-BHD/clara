import { test } from "node:test";
import assert from "node:assert/strict";

import type { SessionTokenAccessor } from "@/lib/session";
import { renderHook } from "../../test/hookHarness";
import { readClearsError, useInterviewRun, type RunError } from "./useInterviewRun";

const SESSION: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: "run-1",
    scope: "client",
    status: "running",
    pending_park: { parkIndex: 2, seg: "entity_type", phase: "q", question: "Entity type?" },
    terminal: null,
    activity: [],
    plan: { id: "plan-1" },
    items: [],
    ...overrides,
  };
}

async function settleSeveral(h: Awaited<ReturnType<typeof renderHook>>, count = 5): Promise<void> {
  for (let i = 0; i < count; i++) await h.settle();
}

test("readClearsError has exactly two positive facts for a park-bound refusal", () => {
  const action: RunError = { message: "not delivered", gen: 3, kind: "action", heldAtPark: 4 };
  assert.equal(readClearsError(action, 3, { pendingPark: { parkIndex: 5 } as never, terminal: null }), true);
  assert.equal(readClearsError(action, 3, { pendingPark: null, terminal: { outcome: "interview_complete" } }), true);

  assert.equal(readClearsError(action, 3, { pendingPark: { parkIndex: 4 } as never, terminal: null }), false);
  assert.equal(readClearsError(action, 3, { pendingPark: null, terminal: null }), false);
  assert.equal(readClearsError(action, 3, { pendingPark: { parkIndex: 9 } as never, terminal: { outcome: "cancelled" } }), false, "a non-complete terminal is authoritative over a stale higher park");
  assert.equal(readClearsError(action, 3, { pendingPark: null, terminal: { outcome: "plan_gone" } }), false);
  assert.equal(readClearsError(action, 2, { pendingPark: { parkIndex: 5 } as never, terminal: null }), false, "a read cannot clear an error raised after that read began");
  assert.equal(readClearsError({ ...action, heldAtPark: null }, 3, { pendingPark: { parkIndex: 5 } as never, terminal: null }), false);

  const readError: RunError = { message: "network", gen: 1, kind: "read", heldAtPark: null };
  assert.equal(readClearsError(readError, 1, { pendingPark: null, terminal: null }), true);
});

test("the poll interval stops issuing reads once the run has a terminal chip", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let reads = 0;
  let tick: (() => void) | null = null;
  const cleared: unknown[] = [];
  globalThis.fetch = (async () => {
    reads += 1;
    return jsonResponse(stateBody({
      status: "complete",
      pending_park: null,
      terminal: { outcome: "interview_complete" },
    }));
  }) as typeof fetch;
  globalThis.setInterval = ((cb: TimerHandler) => {
    tick = cb as () => void;
    return 41 as never;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: unknown) => { cleared.push(id); }) as typeof clearInterval;

  const h = await renderHook(() => useInterviewRun({
    session: SESSION, scope: "client", runId: "run-1", planId: "plan-1",
  }));
  try {
    await settleSeveral(h);
    assert.equal(h.current.state?.chip, "complete");
    assert.equal(reads, 1);
    await h.act(() => tick?.());
    await settleSeveral(h, 2);
    assert.equal(reads, 1, "a terminal run must not poll again");
    assert.deepEqual(cleared, [41], "the fixed interval itself is cleared at the first terminal observation");
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("a park-bound action refusal survives a successful but non-advancing poll, with no optimistic answer entry", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let tick: (() => void) | null = null;
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    const url = String(input);
    if (url.includes("/state")) return jsonResponse(stateBody());
    if (url.endsWith("/answer")) return jsonResponse({ error: "server_busy", message: "Answer was not accepted" }, 503);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  globalThis.setInterval = ((cb: TimerHandler) => {
    tick = cb as () => void;
    return 42 as never;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => {}) as typeof clearInterval;

  const h = await renderHook(() => useInterviewRun({
    session: SESSION, scope: "client", runId: "run-1", planId: "plan-1",
  }));
  try {
    await settleSeveral(h);
    const park = h.current.state?.pendingPark;
    assert.ok(park);
    const before = h.current.thread;
    let delivered = true;
    await h.act(async () => { delivered = await h.current.submitAnswer(park!, "company"); });
    assert.equal(delivered, false);
    assert.equal(h.current.error, "Answer was not accepted");
    assert.deepEqual(h.current.thread, before, "a refused answer never appears in the confirmed-only thread");

    await h.act(() => tick?.());
    await settleSeveral(h, 3);
    assert.equal(h.current.error, "Answer was not accepted", "the three-second poll must not swallow the refusal");
    assert.equal(calls, 3, "initial read + failed action + one successful poll");
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("a read-kind error is cleared by the next successful read", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let fail = true;
  globalThis.fetch = (async () => {
    if (fail) throw new Error("offline");
    return jsonResponse(stateBody());
  }) as typeof fetch;
  globalThis.setInterval = (() => 43 as never) as typeof setInterval;
  globalThis.clearInterval = (() => {}) as typeof clearInterval;

  const h = await renderHook(() => useInterviewRun({
    session: SESSION, scope: "client", runId: "run-1", planId: "plan-1",
  }));
  try {
    await settleSeveral(h);
    assert.match(h.current.error ?? "", /network request failed/);
    fail = false;
    await h.act(() => h.current.refresh());
    assert.equal(h.current.error, null);
    assert.equal(h.current.state?.pendingPark?.parkIndex, 2);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
