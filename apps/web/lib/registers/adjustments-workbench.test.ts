import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAdjustmentGovernance } from "./adjustments-workbench";
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

test("loadAdjustmentGovernance: reads runs (RPC), pair reversals (table) and run-due (RPC) in one bundle, verbatim", async () => {
  const runs = [{ id: "r1", client_id: "c1", template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entry_id: "e1", reversal_entry_id: null, amount_cents: 5000, created_at: "t", correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_adjustment_pair", correction_wall: null, correction_wall_advice: null }];
  const pairReversals = [{ id: "pr1", client_id: "c1", template_id: "t1", occurrence_id: "e1", mirror_id: "e2", occurrence_correction_id: "e3", mirror_correction_id: "e4", maker: "u1", status: "pending", completed_at: null, op_key: "k1", created_at: "t" }];
  const due = { due: false, reason: "nothing_due", blocked: [] };

  const seen: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    seen.push(u);
    if (u.includes("/rpc/list_adjustment_runs")) return jsonResponse({ client_id: "c1", runs }, 200);
    if (u.includes("/rpc/adjustment_run_due")) return jsonResponse(due, 200);
    if (u.includes("/rest/v1/adjustment_pair_reversals")) return jsonResponse(pairReversals, 200);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;

  let resolved: Awaited<ReturnType<typeof loadAdjustmentGovernance>> | undefined;
  await withMockedFetch(impl, async () => {
    resolved = await loadAdjustmentGovernance(fakeSession("tok"), "c1");
  });

  assert.equal(seen.length, 3, "all three sources must be read");
  assert.deepEqual(resolved!.runs, runs);
  assert.deepEqual(resolved!.pairReversals, pairReversals);
  assert.deepEqual(resolved!.due, due);
});
