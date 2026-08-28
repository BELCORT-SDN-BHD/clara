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
  listPeriodSnapshots,
  listRenderJobs,
  listSeedingBatches,
  listSeedingProposals,
  listWikiPages,
  mintMonthSnapshot,
  snapshotState,
  requeueRenderJob,
  cancelSeedingBatch,
  completeSeedingBatch,
  declineSeedingProposal,
  tickSeedingProposal,
  retireWikiPage,
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

// --- T9 (port-wave) reads — GET filter/order pinning, one per relation.

test("listPeriodSnapshots GETs period_snapshots filtered+ordered, excluding payload from the select", async () => {
  let seenUrl = "";
  const impl = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return jsonResponse([{ id: "s1" }], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await listPeriodSnapshots("c1", { session: fakeSession() });
  });
  assert.match(seenUrl, /period_snapshots\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=period_start\.desc/);
  assert.ok(!decodeURIComponent(seenUrl).includes("payload"), "the frozen dataset payload must not be requested by the list view");
});

test("listRenderJobs GETs render_jobs filtered+ordered", async () => {
  let seenUrl = "";
  const impl = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return jsonResponse([], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await listRenderJobs("c1", { session: fakeSession() });
  });
  assert.match(seenUrl, /render_jobs\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=enqueued_at\.desc/);
});

test("listSeedingBatches / listSeedingProposals GET their own relations, filtered to one client", async () => {
  const calls: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return jsonResponse([], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await listSeedingBatches("c1", { session: fakeSession() });
    await listSeedingProposals("c1", { session: fakeSession() });
  });
  assert.ok(calls.some((u) => /seeding_batches\?/.test(u) && u.includes("client_id=eq.c1")));
  assert.ok(calls.some((u) => /seeding_proposals\?/.test(u) && u.includes("client_id=eq.c1")));
});

test("listWikiPages GETs wiki_pages filtered to one client", async () => {
  let seenUrl = "";
  const impl = (async (url: RequestInfo | URL) => {
    seenUrl = String(url);
    return jsonResponse([], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await listWikiPages("c1", { session: fakeSession() });
  });
  assert.match(seenUrl, /wiki_pages\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
});

// --- T9 (port-wave) doors — exact posted body shape, arg-name-for-arg-name
// (the PC1 lesson: a typo in a `p_` key compiles fine and only ever surfaces
// as a live CLR10, never a type error).

test("mintMonthSnapshot posts the exact mint_month_snapshot body shape, forwarding the CALLER-supplied op_key verbatim (ruling F9 — no internal minting)", async () => {
  const { impl, calls } = captureFetch({ snapshot_id: "s1" });
  await withMockedFetch(impl, async () => {
    await mintMonthSnapshot({ clientId: "c1", monthStart: "2026-06-01", opKey: "caller-supplied-key-1" }, { session: fakeSession() });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/mint_month_snapshot$/);
  assert.deepEqual(calls[0]!.body, { p_client: "c1", p_month_start: "2026-06-01", p_op_key: "caller-supplied-key-1" });
});

// F9 TRUED at re-verify: this pins the WIRE SHAPE only — that
// mintMonthSnapshot forwards WHATEVER op_key the caller passes, verbatim,
// never generating its own. It does NOT prove a live replay scenario (no
// caller in this codebase currently makes two calls with the same key in
// practice; DoorDialog closes on every confirm attempt, so there is no
// second click within one open to replay against). See lib/reports/
// api.ts's mintMonthSnapshot header for the full reasoning.
test("mintMonthSnapshot forwards the SAME caller-supplied op_key verbatim across two calls — the wire-SHAPE pin, not a live replay proof (F9)", async () => {
  const { impl, calls } = captureFetch({ snapshot_id: "s1" });
  await withMockedFetch(impl, async () => {
    await mintMonthSnapshot({ clientId: "c1", monthStart: "2026-06-01", opKey: "same-key" }, { session: fakeSession() });
    await mintMonthSnapshot({ clientId: "c1", monthStart: "2026-06-01", opKey: "same-key" }, { session: fakeSession() });
  });
  assert.equal(calls[0]!.body.p_op_key, "same-key");
  assert.equal(calls[1]!.body.p_op_key, "same-key");
});

test("snapshotState posts p_snapshot and returns the RPC's own text verbatim — a read, not a governed act", async () => {
  let seenBody: unknown;
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonResponse("stale", 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await snapshotState("s1", { session: fakeSession() });
    assert.equal(out, "stale");
  });
  assert.deepEqual(seenBody, { p_snapshot: "s1" });
});

test("requeueRenderJob posts the exact requeue_render_job body shape — NO op_key (the rung-0 finding: this door's live signature has none)", async () => {
  const { impl, calls } = captureFetch({ render_job_id: "rj2" });
  await withMockedFetch(impl, async () => {
    await requeueRenderJob({ jobId: "rj1", reason: "render timeout", acceptDrift: true }, { session: fakeSession() });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/requeue_render_job$/);
  assert.deepEqual(calls[0]!.body, { p_job: "rj1", p_reason: "render timeout", p_accept_drift: true });
});

test("requeueRenderJob defaults p_accept_drift to false when omitted", async () => {
  const { impl, calls } = captureFetch({ render_job_id: "rj2" });
  await withMockedFetch(impl, async () => {
    await requeueRenderJob({ jobId: "rj1", reason: "render timeout" }, { session: fakeSession() });
  });
  assert.equal(calls[0]!.body.p_accept_drift, false);
});

test("cancelSeedingBatch posts the exact cancel_seeding_batch body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "cancelled" });
  await withMockedFetch(impl, async () => {
    await cancelSeedingBatch({ batchId: "b1", reason: "duplicate upload" }, { session: fakeSession() });
  });
  assert.match(calls[0]!.url, /\/rpc\/cancel_seeding_batch$/);
  assert.equal(calls[0]!.body.p_batch, "b1");
  assert.equal(calls[0]!.body.p_reason, "duplicate upload");
  assert.match(String(calls[0]!.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("completeSeedingBatch posts the exact complete_seeding_batch body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "completed" });
  await withMockedFetch(impl, async () => {
    await completeSeedingBatch("b1", { session: fakeSession() });
  });
  assert.match(calls[0]!.url, /\/rpc\/complete_seeding_batch$/);
  assert.equal(calls[0]!.body.p_batch, "b1");
  assert.match(String(calls[0]!.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("declineSeedingProposal posts the exact decline_seeding_proposal body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "declined" });
  await withMockedFetch(impl, async () => {
    await declineSeedingProposal({ proposalId: "p1", reason: "not a match" }, { session: fakeSession() });
  });
  assert.match(calls[0]!.url, /\/rpc\/decline_seeding_proposal$/);
  assert.equal(calls[0]!.body.p_proposal, "p1");
  assert.equal(calls[0]!.body.p_reason, "not a match");
  assert.match(String(calls[0]!.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("tickSeedingProposal posts the exact tick_seeding_proposal body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "ticked" });
  await withMockedFetch(impl, async () => {
    await tickSeedingProposal("p1", { session: fakeSession() });
  });
  assert.match(calls[0]!.url, /\/rpc\/tick_seeding_proposal$/);
  assert.equal(calls[0]!.body.p_proposal, "p1");
  assert.match(String(calls[0]!.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("retireWikiPage posts the exact retire_wiki_page body shape, with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "retired" });
  await withMockedFetch(impl, async () => {
    await retireWikiPage({ pageId: "w1", reason: "superseded by a newer treatment note" }, { session: fakeSession() });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_wiki_page$/);
  assert.equal(calls[0]!.body.p_page, "w1");
  assert.equal(calls[0]!.body.p_reason, "superseded by a newer treatment note");
  assert.match(String(calls[0]!.body.p_op_key), /^[0-9a-f-]{36}$/);
});
