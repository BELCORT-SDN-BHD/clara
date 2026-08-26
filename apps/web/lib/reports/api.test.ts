// lib/reports/api.ts — argument-shape, defensive-parsing, and refusal-passthrough
// tests. The wire mechanism itself is proven in wire.test.ts/read.test.ts/
// doors.test.ts; this file proves each wrapper's exact relation/function name +
// args, the not_found→available:false fold, and that a real failure is never
// relabelled as that honest absence.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listReportArtifacts,
  retrieveSignedOriginal,
  listSandboxExports,
  listFreeformReads,
  listReportAgentReceipts,
  isDoorRefusal,
} from "./api";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("listReportArtifacts GETs report_artifacts filtered+ordered, returns available:true rows", async () => {
  let seenUrl = "";
  const impl = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return jsonResponse([{ id: "a1", client_id: "c1", kind: "pre_sign" }], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await listReportArtifacts("c1", { session: fakeSession() });
    assert.deepEqual(out, { available: true, rows: [{ id: "a1", client_id: "c1", kind: "pre_sign" }] });
  });
  assert.match(seenUrl, /report_artifacts\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=sealed_at\.desc/);
});

test("listReportArtifacts folds a PostgREST 404 into available:false — the honest 'not deployed yet' state", async () => {
  const impl = (async () => jsonResponse({ message: "relation not found" }, 404)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await listReportArtifacts("c1", { session: fakeSession() });
    assert.deepEqual(out, { available: false });
  });
});

test("listReportArtifacts rethrows a genuine failure (401) — never relabelled as the honest absence", async () => {
  const impl = (async () => jsonResponse({ message: "JWT expired" }, 401)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(listReportArtifacts("c1", { session: fakeSession() }));
  });
});

test("retrieveSignedOriginal posts p_report_run_id; a null RPC result stays null (honest 'not yet archived')", async () => {
  let seenBody: unknown;
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonResponse(null, 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await retrieveSignedOriginal("run1", { session: fakeSession() });
    assert.equal(out, null);
  });
  assert.deepEqual(seenBody, { p_report_run_id: "run1" });
});

test("listSandboxExports posts p_view:null + p_limit, tolerates a non-array result", async () => {
  let seenBody: unknown;
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonResponse([{ id: "e1", state: "done" }], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await listSandboxExports(25, { session: fakeSession() });
    assert.deepEqual(out, [{ id: "e1", state: "done" }]);
  });
  assert.deepEqual(seenBody, { p_view: null, p_limit: 25 });
});

test("listSandboxExports: an admin-gated refusal (e.g. from a sibling recipient door) stays a DoorRefusal, verbatim", async () => {
  const impl = (async () =>
    jsonResponse({ code: "CLR04", message: "this act needs the admin role", details: "{}" }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(listSandboxExports(50, { session: fakeSession() }), (e: unknown) => {
      assert.ok(isDoorRefusal(e));
      return true;
    });
  });
});

test("listFreeformReads GETs freeform_read_log with a client_scope contains-filter", async () => {
  let seenUrl = "";
  const impl = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return jsonResponse([], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await listFreeformReads("c1", { session: fakeSession() });
  });
  assert.match(seenUrl, /freeform_read_log\?/);
  assert.match(decodeURIComponent(seenUrl), /client_scope=cs\.\{c1\}/);
  assert.match(seenUrl, /order=at\.desc/);
});

test("listReportAgentReceipts GETs report_agent_receipts filtered to one client", async () => {
  let seenUrl = "";
  const impl = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return jsonResponse([{ id: "r1", act: "seal_artifact", outcome: "done" }], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await listReportAgentReceipts("c1", { session: fakeSession() });
    assert.equal(out.length, 1);
    assert.equal(out.at(0)?.act, "seal_artifact");
  });
  assert.match(seenUrl, /report_agent_receipts\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
});
