// lib/bank/rent-settlement-doors.ts — #949's accept door (clara.settle_rent_payable).
// Pins wire shape, and the TWO outcomes the door really has.

import { test } from "node:test";
import assert from "node:assert/strict";
import { settleRentPayable } from "./rent-settlement-doors";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}
function jsonResponse(body: unknown, status = 200): Response {
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

test("settleRentPayable: posts p_client/p_entry/p_line under settle_rent_payable, with a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({
        entry_id: "e2", match_id: "m1", unsettled_cents: 360000,
        period_month: "2026-02-01", posting_date: "2026-02-25", status: "settled",
      });
    },
    async () => {
      const receipt = await settleRentPayable(
        { clientId: "c1", entryId: "e1", lineId: "l1" },
        { session: fakeSession("tok") },
      );
      assert.ok(seenUrl.includes("/rpc/settle_rent_payable"));
      assert.equal(seenBody.p_client, "c1");
      assert.equal(seenBody.p_entry, "e1");
      assert.equal(seenBody.p_line, "l1");
      assert.equal(typeof seenBody.p_op_key, "string");
      assert.ok((seenBody.p_op_key as string).length > 0);
      assert.equal(receipt.status, "settled");
      assert.equal(receipt.match_id, "m1");
      assert.equal(receipt.unsettled_cents, 360000);
    },
  );
});

test("settleRentPayable: a HIGH-STAKES settlement comes back awaiting_checker with no match, and the caller can tell", async () => {
  await withMockedFetch(
    async () => jsonResponse({
      entry_id: "e2", match_id: null, unsettled_cents: 1200000,
      period_month: "2026-02-01", posting_date: "2026-02-25",
      status: "awaiting_checker", reason: "high_stakes_needs_checker", eligible_checker_count: 2,
    }),
    async () => {
      const receipt = await settleRentPayable(
        { clientId: "c1", entryId: "e1", lineId: "l1" },
        { session: fakeSession("tok") },
      );
      // The door DRAFTED the entry and left it for a distinct checker; a surface that read this
      // as "settled" would be telling a person something untrue, which is why the status is on
      // the receipt rather than inferred from match_id alone.
      assert.equal(receipt.status, "awaiting_checker");
      assert.equal(receipt.reason, "high_stakes_needs_checker");
      assert.equal(receipt.match_id, null);
      assert.equal(receipt.eligible_checker_count, 2);
    },
  );
});

test("settleRentPayable: two calls mint two DIFFERENT op_keys — one decision per click, never a derived tuple", async () => {
  const seenKeys: string[] = [];
  await withMockedFetch(
    async (_u, init) => {
      seenKeys.push(JSON.parse(String(init?.body)).p_op_key as string);
      return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 1, period_month: "2026-02-01", posting_date: "2026-02-25" });
    },
    async () => {
      await settleRentPayable({ clientId: "c1", entryId: "e1", lineId: "l1" }, { session: fakeSession("tok") });
      await settleRentPayable({ clientId: "c1", entryId: "e1", lineId: "l1" }, { session: fakeSession("tok") });
      assert.equal(seenKeys.length, 2);
      assert.notEqual(seenKeys[0], seenKeys[1]);
    },
  );
});
