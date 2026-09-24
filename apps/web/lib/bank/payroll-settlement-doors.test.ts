// lib/bank/payroll-settlement-doors.ts — the #947 accept door
// (clara.settle_payroll_net_pay). Pins wire shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { settlePayrollNetPay } from "./payroll-settlement-doors";
import { DoorRefusal } from "../doors";
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

test("settlePayrollNetPay: posts p_client/p_entry/p_line under settle_payroll_net_pay, with a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 425570, posting_date: "2026-09-01" });
    },
    async () => {
      const receipt = await settlePayrollNetPay(
        { clientId: "c1", entryId: "e1", lineId: "l1" },
        { session: fakeSession("tok") },
      );
      assert.ok(seenUrl.includes("/rpc/settle_payroll_net_pay"));
      assert.equal(seenBody.p_client, "c1");
      assert.equal(seenBody.p_entry, "e1");
      assert.equal(seenBody.p_line, "l1");
      assert.equal(typeof seenBody.p_op_key, "string");
      assert.ok((seenBody.p_op_key as string).length > 0);
      assert.equal(receipt.match_id, "m1");
      assert.equal(receipt.unsettled_cents, 425570);
    },
  );
});

test("settlePayrollNetPay: two calls mint two DIFFERENT op_keys — this door's identity is one decision per click, not a derived intent tuple", async () => {
  const seenKeys: string[] = [];
  await withMockedFetch(
    async (_u, init) => {
      seenKeys.push(JSON.parse(String(init?.body)).p_op_key as string);
      return jsonResponse({ entry_id: "e2", match_id: "m1", unsettled_cents: 1, posting_date: "2026-09-01" });
    },
    async () => {
      await settlePayrollNetPay({ clientId: "c1", entryId: "e1", lineId: "l1" }, { session: fakeSession("tok") });
      await settlePayrollNetPay({ clientId: "c1", entryId: "e1", lineId: "l1" }, { session: fakeSession("tok") });
      assert.notEqual(seenKeys[0], seenKeys[1]);
    },
  );
});

test("settlePayrollNetPay: a governed refusal (e.g. amount_mismatch) propagates as a typed DoorRefusal, verbatim", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "statement line l1 (100 cents) does not match this run's unsettled net pay (200 cents)", details: '{"reason":"amount_mismatch"}' }, 400),
    async () => {
      await assert.rejects(
        () => settlePayrollNetPay({ clientId: "c1", entryId: "e1", lineId: "l1" }, { session: fakeSession("tok") }),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "amount_mismatch" && e.code === "CLR10",
      );
    },
  );
});
