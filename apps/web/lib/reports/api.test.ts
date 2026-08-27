// lib/reports/api.ts — argument-shape, defensive-parsing, and refusal-passthrough
// tests. The wire mechanism itself is proven in wire.test.ts/read.test.ts/
// doors.test.ts; this file proves each wrapper's exact relation/function name +
// args, the not_found→available:false fold, and that a real failure is never
// relabelled as that honest absence.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listReportArtifacts,
  issueReportForApproval,
  archiveSignedOriginal,
  retrieveSignedOriginal,
  listSandboxExports,
  registerExportRecipient,
  supersedeExportRecipient,
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

/** Captures every fetch call's [url, parsed body] pair — plural, for wrappers
 *  (like listFreeformReads, post-M6) that fire more than one request. */
function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
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

// --- LOW (independent review, "PC1 proved tsc can't see arg names"): every
// write door's exact posted body, arg-name-for-arg-name — a typo in a `p_`
// key compiles fine (the object literal is just `Record<string, unknown>` at
// the call boundary) and would only ever surface as a live CLR10, never a
// type error. These four were the write doors this build had NOT yet pinned.

test("issueReportForApproval posts the exact approve_report_for_issue body shape", async () => {
  const { impl, calls } = captureFetch({ ok: true });
  await withMockedFetch(impl, async () => {
    await issueReportForApproval(
      { reportRunId: "run1", artifactId: "a1", expectedArtifactSha256: "deadbeef", reason: "quarter-end issue", selfAttestation: "I attest" },
      { session: fakeSession() },
    );
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/approve_report_for_issue$/);
  assert.deepEqual(calls[0]!.body, {
    p_report_run_id: "run1",
    p_expected_artifact_sha256: "deadbeef",
    p_reason: "quarter-end issue",
    p_self_attestation: "I attest",
    p_op_key: "issue-a1",
  });
});

test("archiveSignedOriginal posts the exact archive_signed_original body shape", async () => {
  const { impl, calls } = captureFetch({ ok: true });
  await withMockedFetch(impl, async () => {
    await archiveSignedOriginal(
      {
        reportRunId: "run1", artifactId: "a1", sha256: "cafebabe", byteSize: 4096,
        signatureEvidence: { kind: "wet_signature", signer_name: "Alice Tan" }, answersPreSignSha256: "deadbeef",
      },
      { session: fakeSession() },
    );
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/archive_signed_original$/);
  assert.deepEqual(calls[0]!.body, {
    p_report_run_id: "run1",
    p_sha256: "cafebabe",
    p_byte_size: 4096,
    p_signature_evidence: { kind: "wet_signature", signer_name: "Alice Tan" },
    p_answers_pre_sign_sha256: "deadbeef",
    p_op_key: "archive-a1",
  });
});

test("registerExportRecipient posts the exact register_export_recipient body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ recipient_id: "rec1" });
  await withMockedFetch(impl, async () => {
    await registerExportRecipient(
      { kind: "firm_member", userId: "u1", displayName: "Bob", basis: "engagement partner", coveredClients: null },
      { session: fakeSession() },
    );
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/register_export_recipient$/);
  const body = calls[0]!.body;
  assert.equal(body.p_kind, "firm_member");
  assert.equal(body.p_user, "u1");
  assert.equal(body.p_display_name, "Bob");
  assert.equal(body.p_basis, "engagement partner");
  assert.equal(body.p_covered_clients, null);
  assert.match(String(body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("supersedeExportRecipient posts the exact supersede_export_recipient body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ recipient_id: "rec2" });
  await withMockedFetch(impl, async () => {
    await supersedeExportRecipient({ recipientId: "rec1", reason: "role change", coveredClients: null }, { session: fakeSession() });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/supersede_export_recipient$/);
  const body = calls[0]!.body;
  assert.equal(body.p_recipient, "rec1");
  assert.equal(body.p_reason, "role change");
  assert.equal(body.p_covered_clients, null);
  assert.match(String(body.p_op_key), /^[0-9a-f-]{36}$/);
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

// M6 (independent review): listFreeformReads now fires TWO reads (client_scope
// contains + scope=firm) and merges them — 0131:550-553 forces client_scope
// NULL whenever scope='firm', so a single contains-filter would silently drop
// every firm-wide read from a client's page.
test("listFreeformReads GETs BOTH the client_scope arm and the scope=firm arm, merged newest-first", async () => {
  const rows = [
    { id: 1, at: "2026-01-01T00:00:00Z", scope: "client" },
    { id: 2, at: "2026-01-03T00:00:00Z", scope: "firm" },
    { id: 3, at: "2026-01-02T00:00:00Z", scope: "client" },
  ];
  const calls: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("scope=eq.firm")) return jsonResponse([rows[1]], 200);
    return jsonResponse([rows[0], rows[2]], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await listFreeformReads("c1", { session: fakeSession() });
    assert.deepEqual(out.map((r) => r.id), [2, 3, 1], "merged and sorted by `at` DESCENDING across both arms");
  });
  assert.equal(calls.length, 2, "exactly two reads: the client_scope arm and the scope=firm arm");
  assert.ok(calls.some((u) => decodeURIComponent(u).includes("client_scope=cs.{c1}")));
  assert.ok(calls.some((u) => u.includes("scope=eq.firm")));
  assert.ok(calls.every((u) => u.includes("order=at.desc")));
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
