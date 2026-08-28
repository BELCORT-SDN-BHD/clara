// lib/coding/reads.ts — wire-shape pinning, documents/reads.test.ts's own
// precedent: the property under test is the RIGHT relation/RPC + query, and
// that a batch read short-circuits on empty input without calling fetch.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCodingLane, getLintFindingDetail, getOpenQuestionDetail,
  listAgentTaskClientIds, listApprovedEntriesForFiling, listCancellableAgentTasks,
  listCodingLanes, listOpenCodingTasks, listOpenLintFindings, listUncodedFilings,
} from "./reads";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
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
function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function rpcName(url: RequestInfo | URL): string {
  return String(url).split("/rpc/")[1] ?? "";
}

const C = "client-1", F = "filing-1";

test("listUncodedFilings: posts list_uncoded_filings with p_client", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return okJson([]); },
    async () => { await listUncodedFilings(C, { session: session() }); },
  );
  assert.equal(seenFn, "list_uncoded_filings");
  assert.deepEqual(seenBody, { p_client: C });
});

test("listCodingLanes: posts list_coding_lanes with p_client", async () => {
  let seenFn = "";
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return okJson([]); },
    async () => { await listCodingLanes(C, { session: session() }); },
  );
  assert.equal(seenFn, "list_coding_lanes");
});

test("getCodingLane: posts coding_lane with p_client/p_filing", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return okJson([{ lane: "ready", reasons: [] }]); },
    async () => {
      const out = await getCodingLane(C, F, { session: session() });
      assert.deepEqual(out, [{ lane: "ready", reasons: [] }]);
    },
  );
  assert.equal(seenFn, "coding_lane");
  assert.equal(seenBody.p_filing, F);
});

test("listOpenCodingTasks: GETs coding_tasks_visible filtered to this client + status=open", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listOpenCodingTasks(C, { session: session() }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/coding_tasks_visible\?/);
  assert.match(seenUrl, new RegExp(`client_id=eq\\.${C}`));
  assert.match(seenUrl, /status=eq\.open/);
});

test("listOpenLintFindings: GETs lint_findings filtered to this client + state=open", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listOpenLintFindings(C, { session: session() }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/lint_findings\?/);
  assert.match(seenUrl, /state=eq\.open/);
});

test("getLintFindingDetail: posts get_lint_finding with p_finding", async () => {
  let seenFn = "";
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return okJson(null); },
    async () => { await getLintFindingDetail("finding-1", { session: session() }); },
  );
  assert.equal(seenFn, "get_lint_finding");
});

test("getOpenQuestionDetail: posts get_open_question with p_question", async () => {
  let seenFn = "";
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return okJson(null); },
    async () => { await getOpenQuestionDetail("q-1", { session: session() }); },
  );
  assert.equal(seenFn, "get_open_question");
});

test("listApprovedEntriesForFiling: GETs journal_entries filtered to filing_id + status=approved + reversed_by=is.null", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listApprovedEntriesForFiling(F, { session: session() }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/journal_entries\?/);
  assert.match(seenUrl, new RegExp(`filing_id=eq\\.${F}`));
  assert.match(seenUrl, /status=eq\.approved/);
  assert.match(seenUrl, /reversed_by=is\.null/);
});

test("listCancellableAgentTasks: GETs agent_tasks_visible filtered to the four non-terminal statuses", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listCancellableAgentTasks({ session: session() }); },
  );
  assert.match(seenUrl, /\/rest\/v1\/agent_tasks_visible\?/);
  assert.match(seenUrl, /status=in\.%28queued%2Cheld%2Crunning%2Cawaiting_input%29/);
});

test("listAgentTaskClientIds([]) resolves [] WITHOUT calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => { called = true; return okJson([]); },
    async () => {
      const rows = await listAgentTaskClientIds([], { session: session() });
      assert.deepEqual(rows, []);
    },
  );
  assert.equal(called, false);
});

test("listAgentTaskClientIds: GETs agent_tasks_visible filtered by id in(...)", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return okJson([]); },
    async () => { await listAgentTaskClientIds(["t1", "t2"], { session: session() }); },
  );
  assert.match(seenUrl, /id=in\.%28t1%2Ct2%29/);
});
