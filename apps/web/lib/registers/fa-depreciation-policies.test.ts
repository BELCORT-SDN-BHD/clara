import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setFaDepreciationPolicy, retireFaDepreciationPolicy, setPolicyIntent, retirePolicyIntent,
} from "./fa-depreciation-policies";
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

test("setFaDepreciationPolicy: posts the exact door body shape for a straight_line policy, reason omitted -> null", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", version: 1, active: true });
  await withMockedFetch(impl, async () => {
    await setFaDepreciationPolicy(fakeSession("tok"), {
      clientId: "c1", assetAccount: "1500", method: "straight_line",
      usefulLifeMonths: 36, rateBps: null, residualCents: 0, opKey: "k-sl",
    });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/set_fa_depreciation_policy$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset_account, "1500");
  assert.equal(body.p_method, "straight_line");
  assert.equal(body.p_useful_life_months, 36);
  assert.equal(body.p_rate_bps, null);
  assert.equal(body.p_residual_cents, 0);
  assert.equal(body.p_reason, null);
  assert.equal(body.p_op_key, "k-sl", "the CALLER's key, never one minted inside the wrapper");
});

test("setFaDepreciationPolicy: a reducing_balance policy posts both the life and the rate, plus a supplied reason", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", version: 2 });
  await withMockedFetch(impl, async () => {
    await setFaDepreciationPolicy(fakeSession("tok"), {
      clientId: "c1", assetAccount: "1500", method: "reducing_balance",
      usefulLifeMonths: 60, rateBps: 2000, residualCents: 500, reason: "annual review", opKey: "k-rb",
    });
  });
  const body = calls[0]!.body;
  assert.equal(body.p_method, "reducing_balance");
  assert.equal(body.p_useful_life_months, 60);
  assert.equal(body.p_rate_bps, 2000);
  assert.equal(body.p_residual_cents, 500);
  assert.equal(body.p_reason, "annual review");
});

test("retireFaDepreciationPolicy: posts p_client + p_asset_account with the caller's held op_key", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", active: false });
  await withMockedFetch(impl, async () => {
    await retireFaDepreciationPolicy(fakeSession("tok"), { clientId: "c1", assetAccount: "1500", opKey: "k-ret" });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_fa_depreciation_policy$/);
  assert.deepEqual(
    { p_client: calls[0]!.body.p_client, p_asset_account: calls[0]!.body.p_asset_account, p_reason: calls[0]!.body.p_reason },
    { p_client: "c1", p_asset_account: "1500", p_reason: null },
  );
  assert.equal(calls[0]!.body.p_op_key, "k-ret");
});

test("setFaDepreciationPolicy: a CLR37 not_enrolled refusal surfaces as a DoorRefusal, never masked", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR37", message: "account 9999 is not an enrolled fixed-asset account for this client", details: '{"reason":"fa_policy_invalid","axis":"not_enrolled"}' },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(
        setFaDepreciationPolicy(fakeSession("tok"), {
          clientId: "c1", assetAccount: "9999", method: "straight_line", usefulLifeMonths: 36,
          rateBps: null, residualCents: 0, opKey: "k-refused",
        }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});

// ===========================================================================================
// #932 FIX ROUND (adversarial review ADV-L04-5) — ONE DECISION, ONE KEY.
//
// Both wrappers used to mint `crypto.randomUUID()` inside themselves: the exact D15 class #978,
// the LAST ticket in this same lane, exists to remove. A retry after a lost response was then a
// NEW operation to `clara._reserve_op`, and one human decision sent twice left TWO policy
// versions (v2 active, v1 retired "superseded by set_fa_depreciation_policy v2") with any
// register row born in between stamped v1 while the account reads v2.
//
// The intent tuples below are exactly the doors' OWN `_reserve_op` fingerprints, measured off the
// live prosrc: set hashes (client, asset, method, useful_life_months, rate_bps, residual_cents)
// and retire hashes (client, asset) — `p_reason` is in NEITHER, the same way `p_memo` is outside
// `clara.dispose_fixed_asset`'s.
// ===========================================================================================

test("#932 setPolicyIntent: one decision while every field the door hashes is unchanged, a new one the moment any of them moves — reason EXCLUDED, because the door does not hash it", () => {
  const base = {
    clientId: "c1", assetAccount: "1500", method: "straight_line" as const,
    usefulLifeMonths: 36, rateBps: null, residualCents: 0,
  };
  assert.equal(setPolicyIntent(base), setPolicyIntent({ ...base }),
    "the same decision is ONE intent, so a retry replays the receipt it already earned");
  assert.equal(setPolicyIntent(base), setPolicyIntent({ ...base, reason: "annual review" }),
    "…and a changed REASON is the same decision: clara.set_fa_depreciation_policy does not hash p_reason");

  for (const [label, moved] of [
    ["client", { ...base, clientId: "c2" }],
    ["asset account", { ...base, assetAccount: "1510" }],
    ["method", { ...base, method: "none" as const }],
    ["useful life", { ...base, usefulLifeMonths: 60 }],
    ["rate", { ...base, rateBps: 2000 }],
    ["residual", { ...base, residualCents: 500 }],
  ] as const) {
    assert.notEqual(setPolicyIntent(base), setPolicyIntent(moved),
      `a different ${label} is a DIFFERENT decision and must earn its own key`);
  }
});

test("#932 retirePolicyIntent: the door hashes only (client, asset), and so does this", () => {
  assert.equal(retirePolicyIntent({ clientId: "c1", assetAccount: "1500" }),
    retirePolicyIntent({ clientId: "c1", assetAccount: "1500", reason: "no longer depreciated" }),
    "the reason is not part of the decision the door dedupes on");
  assert.notEqual(retirePolicyIntent({ clientId: "c1", assetAccount: "1500" }),
    retirePolicyIntent({ clientId: "c1", assetAccount: "1510" }),
    "a different account is a different decision");
  assert.notEqual(retirePolicyIntent({ clientId: "c1", assetAccount: "1500" }),
    retirePolicyIntent({ clientId: "c2", assetAccount: "1500" }),
    "…and so is a different client");
});

test("#932 both wrappers post the CALLER'S op key verbatim — neither mints one of its own", async () => {
  const { impl, calls } = captureFetch({ policy_id: "p1", version: 1 });
  await withMockedFetch(impl, async () => {
    await setFaDepreciationPolicy(fakeSession("tok"), {
      clientId: "c1", assetAccount: "1500", method: "straight_line",
      usefulLifeMonths: 36, rateBps: null, residualCents: 0, opKey: "held-set-key",
    });
    await retireFaDepreciationPolicy(fakeSession("tok"), {
      clientId: "c1", assetAccount: "1500", opKey: "held-retire-key",
    });
  });
  assert.equal(calls[0]!.body.p_op_key, "held-set-key");
  assert.equal(calls[1]!.body.p_op_key, "held-retire-key");
});
