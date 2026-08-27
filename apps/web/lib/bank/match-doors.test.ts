// lib/bank/match-doors.ts — matching workbench DOORS. Pins wire shape and
// the post-0129 SINGLE arity (never the retired p_via_rule overload).

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBankLine, unmatchBankMatch, settleFromBankLine, completePendingMatch } from "./match-doors";
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

test("matchBankLine: defaults p_adjustments to null and p_ack_period_exceptions to false", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ match_id: "m1" });
    },
    async () => {
      await matchBankLine({ clientId: "c1", lineIds: ["l1", "l2"], entries: [{ entry_id: "e1", matched_cents: -1500 }] }, { session: fakeSession("tok") });
      assert.deepEqual(seenBody.p_lines, ["l1", "l2"]);
      assert.equal(seenBody.p_adjustments, null);
      assert.equal(seenBody.p_ack_period_exceptions, false);
    },
  );
});

test("matchBankLine: never sends p_via_rule — the retired 0040 overload no longer resolves", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ match_id: "m1" });
    },
    async () => {
      await matchBankLine({ clientId: "c1", lineIds: ["l1"], entries: [{ entry_id: "e1", matched_cents: -1000 }] }, { session: fakeSession("tok") });
      assert.ok(!("p_via_rule" in seenBody), "a stray p_via_rule key would be a live 42883 against the retired overload");
    },
  );
});

test("unmatchBankMatch: posts p_reason under unmatch_bank_match", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({});
    },
    async () => {
      await unmatchBankMatch("c1", "m1", "wrong line selected", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/unmatch_bank_match"));
      assert.equal(seenBody.p_reason, "wrong line selected");
    },
  );
});

test("settleFromBankLine: sends the full pinned arg list with its stated defaults", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ entry_id: "e1", match_id: "m1", status: "approved" });
    },
    async () => {
      const receipt = await settleFromBankLine(
        { clientId: "c1", lineId: "l1", counterpartyId: "cp1", allocations: [{ item_id: "i1", amount_cents: 10000 }], memo: "settle inv-1" },
        { session: fakeSession("tok") },
      );
      assert.equal(seenBody.p_posting_date, null);
      assert.equal(seenBody.p_charge_cents, 0);
      assert.equal(seenBody.p_control_account, null);
      assert.equal(receipt.status, "approved");
    },
  );
});

test("settleFromBankLine: a governed refusal propagates as a typed DoorRefusal", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "counterparty domain mismatch", details: '{"reason":"item_not_this_party"}' }, 400),
    async () => {
      await assert.rejects(
        () =>
          settleFromBankLine(
            { clientId: "c1", lineId: "l1", counterpartyId: "cp1", allocations: [{ item_id: "i1", amount_cents: 1 }], memo: "x" },
            { session: fakeSession("tok") },
          ),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "item_not_this_party",
      );
    },
  );
});

test("completePendingMatch: posts p_match under complete_pending_match", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => { seenUrl = String(u); return jsonResponse({ match_id: "m1", status: "live" }); },
    async () => {
      const receipt = await completePendingMatch("c1", "m1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/complete_pending_match"));
      assert.equal(receipt.status, "live");
    },
  );
});
