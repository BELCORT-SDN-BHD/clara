// lib/coding/doors.ts — wire-shape pinning (mocked-fetch style,
// journals/governance-doors.test.ts's own precedent). Covers: rpc name +
// args for every T7 governed door, and refusal-verbatim passthrough.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeSweepRun, cancelAgentTask, completeCodingTask, dismissCodingTask,
  openCodingTask, openQuestion, promoteClarifyToQuestion, resolveLintFinding,
} from "./doors";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function refusal(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), { status: 400, headers: { "content-type": "application/json" } });
}
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}
function rpcName(url: RequestInfo | URL): string {
  return String(url).split("/rpc/")[1] ?? "";
}

const C = "client-1", D = "doc-1", F = "filing-1", T = "task-1";

test("openCodingTask: posts open_coding_task with client/document/filing/reason + a fresh op_key", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await openCodingTask(C, D, F, "vendor is ambiguous", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "open_coding_task");
  assert.equal(seenBody.p_client, C);
  assert.equal(seenBody.p_document, D);
  assert.equal(seenBody.p_filing, F);
  assert.equal(seenBody.p_reason, "vendor is ambiguous");
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
});

test("completeCodingTask: posts complete_coding_task with task/result_entry, no reason field", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await completeCodingTask(T, "entry-1", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "complete_coding_task");
  assert.deepEqual(Object.keys(seenBody).sort(), ["p_op_key", "p_result_entry", "p_task"]);
  assert.equal(seenBody.p_result_entry, "entry-1");
});

test("dismissCodingTask: posts dismiss_coding_task with task/reason", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await dismissCodingTask(T, "duplicate task", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "dismiss_coding_task");
  assert.equal(seenBody.p_reason, "duplicate task");
});

test("resolveLintFinding: posts resolve_lint_finding with finding/conclusion/note", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await resolveLintFinding("finding-1", "corrected", "fixed the page", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "resolve_lint_finding");
  assert.equal(seenBody.p_conclusion, "corrected");
  assert.equal(seenBody.p_note, "fixed the page");
});

test("acknowledgeSweepRun: posts acknowledge_sweep_run with run/op_key ONLY", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await acknowledgeSweepRun("run-1", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "acknowledge_sweep_run");
  assert.deepEqual(Object.keys(seenBody).sort(), ["p_op_key", "p_run"]);
});

test("cancelAgentTask: posts cancel_agent_task with task/op_key ONLY", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await cancelAgentTask("task-9", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "cancel_agent_task");
  assert.equal(seenBody.p_task, "task-9");
});

test("openQuestion: posts open_question with client/scope_kind/scope_id/question", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await openQuestion(C, "document", D, "Which account is this?", { session: fakeSession() }); },
  );
  assert.equal(seenFn, "open_question");
  assert.equal(seenBody.p_scope_kind, "document");
  assert.equal(seenBody.p_scope_id, D);
  assert.equal(seenBody.p_question, "Which account is this?");
});

test("promoteClarifyToQuestion: posts promote_clarify_to_question with interruption/scope_kind/scope_id", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await promoteClarifyToQuestion("interruption-1", "client", C, { session: fakeSession() }); },
  );
  assert.equal(seenFn, "promote_clarify_to_question");
  assert.equal(seenBody.p_interruption, "interruption-1");
  assert.equal(seenBody.p_scope_id, C);
});

test("a governed CLR refusal surfaces verbatim, never retried (one fetch attempt)", async () => {
  let attempts = 0;
  await withMockedFetch(
    async () => { attempts += 1; return refusal("CLR24", "coding task is not open"); },
    async () => {
      await assert.rejects(dismissCodingTask(T, "x", { session: fakeSession() }), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR24");
        assert.equal((e as { message: string }).message, "coding task is not open");
        return true;
      });
    },
  );
  assert.equal(attempts, 1);
});
