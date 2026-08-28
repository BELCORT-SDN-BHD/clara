// governance-doors.ts — wire-shape pinning (mocked-fetch style, api.test.ts's
// own precedent). Covers: rpc name + args for each door, the firm-wide
// interruptions read, and refusal-verbatim passthrough.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerInterruption,
  approveRoutineEntry,
  listPendingInterruptions,
  withdrawDraft,
} from "./governance-doors";
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

const ENTRY_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const REV = "revtoken-1";

test("approveRoutineEntry: posts approve_routine_entry with entry/revision and a fresh op_key, no attestation field", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await approveRoutineEntry(ENTRY_ID, REV, { session: fakeSession() }); },
  );
  assert.equal(seenFn, "approve_routine_entry");
  assert.equal(seenBody.p_entry, ENTRY_ID);
  assert.equal(seenBody.p_expected_revision, REV);
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
  assert.equal("p_attestation" in seenBody, false);
});

test("approveRoutineEntry: CLR05 (routine refuses high-stakes) surfaces verbatim", async () => {
  await withMockedFetch(
    async () => refusal("CLR05", "CLR05: routine approval refuses high-stakes entries."),
    async () => {
      await assert.rejects(
        approveRoutineEntry(ENTRY_ID, REV, { session: fakeSession() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR05"); return true; },
      );
    },
  );
});

test("withdrawDraft: posts withdraw_draft with entry/reason/revision/op_key", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_url, init) => { seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await withdrawDraft(ENTRY_ID, "duplicate entry", REV, { session: fakeSession() }); },
  );
  assert.equal(seenBody.p_entry, ENTRY_ID);
  assert.equal(seenBody.p_reason, "duplicate entry");
  assert.equal(seenBody.p_expected_revision, REV);
});

test("withdrawDraft: CLR31 (opening entry, K-family only) surfaces verbatim", async () => {
  await withMockedFetch(
    async () => refusal("CLR31", "CLR31: opening entries are mutable only through the K-family"),
    async () => {
      await assert.rejects(
        withdrawDraft(ENTRY_ID, "x", REV, { session: fakeSession() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR31"); return true; },
      );
    },
  );
});

test("listPendingInterruptions: reads agent_interruptions filtered to status=eq.pending", async () => {
  let seenUrl = "";
  const rows = [{ id: "i1", task_id: "t1", kind: "clarify", question: { text: "which account?" }, answer: null, status: "pending", asked_of: null, answered_by: null, expires_at: "2026-04-01T01:00:00Z", created_at: "2026-04-01T00:00:00Z", answered_at: null }];
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse(rows); },
    async () => {
      const out = await listPendingInterruptions({ session: fakeSession() });
      assert.deepEqual(out, rows);
    },
  );
  assert.match(seenUrl, /agent_interruptions/);
  assert.match(seenUrl, /status=eq\.pending/);
});

test("answerInterruption: posts answer_interruption with id/answer/op_key", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return jsonResponse(null); },
    async () => { await answerInterruption("i1", { text: "the cash account" }, { session: fakeSession() }); },
  );
  assert.equal(seenFn, "answer_interruption");
  assert.equal(seenBody.p_id, "i1");
  assert.deepEqual(seenBody.p_answer, { text: "the cash account" });
});

test("answerInterruption: CLR13 (not pending / expired) surfaces verbatim", async () => {
  await withMockedFetch(
    async () => refusal("CLR13", "CLR13: the clarify has expired"),
    async () => {
      await assert.rejects(
        answerInterruption("i1", { text: "x" }, { session: fakeSession() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR13"); return true; },
      );
    },
  );
});
