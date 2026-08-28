import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDepreciationAuthority,
  proposeDepreciationAuthority,
  signDepreciationAuthority,
  retireDepreciationAuthority,
  listDepreciationRuns,
  getDepreciationRun,
  runDepreciationManual,
} from "./depreciation";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("getDepreciationAuthority: posts p_client only, resolves the envelope verbatim (ramp_earned/fy_end never re-derived)", async () => {
  const envelope = { client_id: "c1", authority: null, ramp_earned: false, fy_end: { month: 12, day: 31, fallback: true }, high_stakes_threshold_cents: 500000 };
  const { impl, calls } = captureFetch(envelope);
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await getDepreciationAuthority(fakeSession("tok"), "c1");
  });
  assert.match(calls[0]!.url, /\/rpc\/get_depreciation_authority$/);
  assert.deepEqual(calls[0]!.body, { p_client: "c1" });
  assert.deepEqual(resolved, envelope);
});

test("proposeDepreciationAuthority: posts p_client + p_cadence with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ authority_id: "au1", client_id: "c1", cadence: "monthly", status: "proposed" });
  await withMockedFetch(impl, async () => {
    await proposeDepreciationAuthority(fakeSession("tok"), { clientId: "c1", cadence: "monthly" });
  });
  assert.match(calls[0]!.url, /\/rpc\/propose_depreciation_authority$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_cadence, "monthly");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("signDepreciationAuthority: posts p_client + p_authority — no client-side role gate on this call", async () => {
  const { impl, calls } = captureFetch({ authority_id: "au1", status: "live" });
  await withMockedFetch(impl, async () => {
    await signDepreciationAuthority(fakeSession("tok"), { clientId: "c1", authorityId: "au1" });
  });
  assert.match(calls[0]!.url, /\/rpc\/sign_depreciation_authority$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_authority, "au1");
});

test("retireDepreciationAuthority: posts p_reason alongside p_client/p_authority", async () => {
  const { impl, calls } = captureFetch({ authority_id: "au1", status: "retired" });
  await withMockedFetch(impl, async () => {
    await retireDepreciationAuthority(fakeSession("tok"), { clientId: "c1", authorityId: "au1", reason: "client switched vendor" });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_depreciation_authority$/);
  assert.equal(calls[0]!.body.p_reason, "client switched vendor");
});

test("listDepreciationRuns: posts p_client, unwraps the .runs array (never the raw envelope)", async () => {
  const runs = [{ id: "r1", authority_id: "au1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entries: 3, charged_cents: 12000, skipped: [], entry_id: "e1", created_at: "t" }];
  const { impl, calls } = captureFetch({ client_id: "c1", runs });
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await listDepreciationRuns(fakeSession("tok"), "c1");
  });
  assert.deepEqual(calls[0]!.body, { p_client: "c1" });
  assert.deepEqual(resolved, runs);
});

test("getDepreciationRun: posts p_run (NOT p_client — the live signature is per-run, singular), unwraps .run", async () => {
  const run = { id: "r1", authority_id: "au1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entries: 3, charged_cents: 12000, skipped: [], entry_id: "e1", created_at: "t" };
  const { impl, calls } = captureFetch({ run });
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await getDepreciationRun(fakeSession("tok"), "r1");
  });
  assert.match(calls[0]!.url, /\/rpc\/get_depreciation_run$/);
  assert.deepEqual(calls[0]!.body, { p_run: "r1" });
  assert.deepEqual(resolved, run);
});

test("runDepreciationManual: posts the exact cadence-window arguments with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "posted", entry_id: "e1", charged_cents: 12000, entries: 3, skipped: [] });
  await withMockedFetch(impl, async () => {
    await runDepreciationManual(fakeSession("tok"), { clientId: "c1", periodStart: "2026-01-01", periodEnd: "2026-01-31" });
  });
  assert.match(calls[0]!.url, /\/rpc\/run_depreciation_manual$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_period_start, "2026-01-01");
  assert.equal(calls[0]!.body.p_period_end, "2026-01-31");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("runDepreciationManual: a CLR38 not_cadence_aligned refusal surfaces verbatim as a DoorRefusal", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR38", message: "this client's monthly depreciation cadence runs 2026-01-01 .. 2026-01-31, not 2026-01-05 .. 2026-01-31", details: '{"reason":"period_request_invalid","axis":"not_cadence_aligned"}' },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(
        runDepreciationManual(fakeSession("tok"), { clientId: "c1", periodStart: "2026-01-05", periodEnd: "2026-01-31" }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});
