import { test } from "node:test";
import assert from "node:assert/strict";

import type { SessionTokenAccessor } from "@/lib/session";
import { cancelInterview, startClientInterview } from "./api";

const SESSION: SessionTokenAccessor = { getAccessToken: async () => "live-session" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("startClientInterview uses the same-origin proxy and distinguishes fresh from existing runs", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const replies = [
    jsonResponse({ run_id: "run-fresh", scope: "client" }, 202),
    jsonResponse({ run_id: "run-existing", scope: "client", existing: true }, 200),
  ];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return replies.shift()!;
  }) as typeof fetch;
  try {
    assert.deepEqual(await startClientInterview({ clientId: "c1", planId: "p1" }, { session: SESSION }), {
      runId: "run-fresh", scope: "client", existing: false,
    });
    assert.deepEqual(await startClientInterview({ clientId: "c1", planId: "p1" }, { session: SESSION }), {
      runId: "run-existing", scope: "client", existing: true,
    });
    assert.equal(calls[0]?.url, "/api/runtime/interview/client/start");
    assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer live-session");
    assert.equal(calls[0]?.init?.redirect, "manual");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { clientId: "c1", planId: "p1" });
  } finally {
    globalThis.fetch = original;
  }
});

test("cancelInterview treats runtime 409 as already resolved so the DB cancellation can continue", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => jsonResponse({ error: "not_pending" }, 409)) as typeof fetch;
  try {
    assert.deepEqual(
      await cancelInterview({ runId: "run-1", scope: "client", parkIndex: 2, planId: "plan-1" }, { session: SESSION }),
      { delivered: false, alreadyResolved: true },
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("wire calls fail before fetch when there is no live signed-in session", async () => {
  const noSession: SessionTokenAccessor = { getAccessToken: async () => null };
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({});
  }) as typeof fetch;
  try {
    await assert.rejects(
      startClientInterview({ clientId: "c1", planId: "p1" }, { session: noSession }),
      /not signed in — no live session/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
