import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAging } from "./aging";
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

test("loadAging('ar', ...): POSTs /rpc/ar_aging with p_client/p_as_of/p_segment=null", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ as_of: "2026-08-27", domain: "ar", counterparties: [], totals: {} }, 200);
    },
    async () => {
      const env = await loadAging(fakeSession("tok"), "ar", "c1", "2026-08-27");
      assert.equal(env.domain, "ar");
    },
  );
  assert.match(seenUrl, /\/rpc\/ar_aging$/);
  assert.deepEqual(seenBody, { p_client: "c1", p_as_of: "2026-08-27", p_segment: null });
});

test("loadAging('ap', ...): POSTs /rpc/ap_aging, and defaults p_as_of to the business-timezone today", async () => {
  let seenUrl = "";
  let seenBody: { p_as_of?: string } = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ as_of: "2026-08-27", domain: "ap", counterparties: [], totals: {} }, 200);
    },
    async () => {
      await loadAging(fakeSession("tok"), "ap", "c1");
    },
  );
  assert.match(seenUrl, /\/rpc\/ap_aging$/);
  assert.match(seenBody.p_as_of ?? "", /^\d{4}-\d{2}-\d{2}$/);
});

// #647 AC2 — the two fields `clara._aging_core` has emitted since 裁-19 PR-1 spliced it
// (0149:590 per group, :596 per item) and this module's types dropped on the floor. The read is
// a pass-through, so the assertion is that the envelope ARRIVES intact rather than being reshaped:
// a wire type that omits a field the DB sends is not a type error anywhere, it is a silent loss.
test("ticket 647 — the aging envelope carries `resolution` per group and `recorded_counterparty_id` per item, untouched", async () => {
  const captured: Awaited<ReturnType<typeof loadAging>>[] = [];
  await withMockedFetch(
    async () =>
      jsonResponse({
        as_of: "2026-09-16", domain: "ar",
        counterparties: [{
          counterparty_id: "surv", counterparty_name: "Acme Holdings", resolution: "canonical",
          current_cents: 73117, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 41983,
          total_cents: 115100,
          items: [
            { item_id: "i1", item_kind: "invoice", item_date: "2026-09-10", due_date: "2026-10-10",
              overdue: false, outstanding_cents: 73117, bucket: "current",
              recorded_counterparty_id: "surv" },
            { item_id: "i2", item_kind: "invoice", item_date: "2026-04-01", due_date: "2026-05-01",
              overdue: true, outstanding_cents: 41983, bucket: "d91_plus",
              recorded_counterparty_id: "merged-away" },
          ],
        }],
        totals: { current_cents: 73117, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 41983, total_cents: 115100 },
      }, 200),
    async () => { captured.push(await loadAging(fakeSession("tok"), "ar", "c1", "2026-09-16")); },
  );
  const env = captured[0];
  assert.ok(env, "the aging read resolved");
  const row = env.counterparties[0];
  assert.ok(row, "the envelope carried its one group");
  assert.equal(row.resolution, "canonical", "a resolvable group says so");
  assert.deepEqual(row.items.map((i) => i.recorded_counterparty_id), ["surv", "merged-away"],
    "the party each invoice was RAISED under survives the fold — the audit trail a merge must not erase");
  // The folded item keeps its OWN age; nothing here re-buckets or re-sums (hard constraint 2).
  assert.equal(row.items[1]?.bucket, "d91_plus");
  assert.equal(row.total_cents, 115100);
});

test("ticket 647 — an UNRESOLVED group is readable as such — the optional field is not defaulted to the reassuring value", async () => {
  const captured: Awaited<ReturnType<typeof loadAging>>[] = [];
  await withMockedFetch(
    async () =>
      jsonResponse({
        as_of: "2026-09-16", domain: "ap",
        counterparties: [{
          counterparty_id: "x", counterparty_name: null, resolution: "unresolved",
          current_cents: 0, d31_60_cents: 0, d61_90_cents: 0, d91_plus_cents: 0, total_cents: 0,
          items: [],
        }],
        totals: {},
      }, 200),
    async () => { captured.push(await loadAging(fakeSession("tok"), "ap", "c1", "2026-09-16")); },
  );
  assert.equal(captured[0]?.counterparties[0]?.resolution, "unresolved");
});
