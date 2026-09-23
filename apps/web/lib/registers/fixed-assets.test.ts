import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadFixedAssets,
  getFixedAsset,
  faRegisterTie,
  completeFixedAssetParticulars,
  completeIntent,
  reviseFixedAssetParticulars,
  reviseIntent,
  disposeFixedAsset,
  disposeIntent,
} from "./fixed-assets";
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

/** Captures the posted body for a single-call wrapper. */
function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("loadFixedAssets: POSTs /rpc/list_fixed_assets with p_client, resolves the envelope verbatim", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  const envelope = { client_id: "c1", as_of: "2026-08-27", assets: [], incomplete_count: 0 };
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse(envelope, 200);
    },
    async () => {
      const env = await loadFixedAssets(fakeSession("tok"), "c1");
      assert.deepEqual(env, envelope);
    },
  );
  assert.match(seenUrl, /\/rpc\/list_fixed_assets$/);
  assert.deepEqual(seenBody, { p_client: "c1" });
});

test("loadFixedAssets: a 403 (RLS/grant refusal) is not masked into an empty list", async () => {
  await withMockedFetch(
    async () => jsonResponse({ message: "permission denied for function list_fixed_assets" }, 403),
    async () => {
      const { isDoorError } = await import("../doors");
      await assert.rejects(loadFixedAssets(fakeSession("tok"), "c1"), (e: unknown) => {
        assert.ok(isDoorError(e));
        return true;
      });
    },
  );
});

test("getFixedAsset: POSTs /rpc/get_fixed_asset with exactly p_asset", async () => {
  const { impl, calls } = captureFetch({ asset: { id: "a1" }, lineage: [], charges: [], schedule: [], uncharged_due: [] });
  await withMockedFetch(impl, async () => {
    await getFixedAsset(fakeSession("tok"), "a1");
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/get_fixed_asset$/);
  assert.deepEqual(calls[0]!.body, { p_asset: "a1" });
});

test("faRegisterTie: POSTs /rpc/fa_register_tie with p_client + p_as_of, resolves verbatim (tie is never re-derived here)", async () => {
  const tieOut = { client_id: "c1", as_of: "2026-08-27", tie: false, accounts: [{ asset_account: "1500" }], incomplete_count: 1, pending_draft_count: 0 };
  const { impl, calls } = captureFetch(tieOut);
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await faRegisterTie(fakeSession("tok"), "c1", "2026-08-27");
  });
  assert.deepEqual(calls[0]!.body, { p_client: "c1", p_as_of: "2026-08-27" });
  assert.deepEqual(resolved, tieOut);
});

test("completeFixedAssetParticulars: posts the exact door body shape, with the CALLER's key", async () => {
  const { impl, calls } = captureFetch({ asset_id: "a1", client_id: "c1", particulars_complete: true });
  await withMockedFetch(impl, async () => {
    await completeFixedAssetParticulars(fakeSession("tok"), {
      clientId: "c1",
      assetId: "a1",
      particulars: { method: "straight_line", useful_life_months: 60, start_date: "2026-01-01" },
      opKey: "decided-complete",
    });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/complete_fixed_asset_particulars$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset, "a1");
  assert.deepEqual(body.p_particulars, { method: "straight_line", useful_life_months: 60, start_date: "2026-01-01" });
  assert.equal(body.p_op_key, "decided-complete");
});

// #978 — the door mints NOTHING of its own: two calls with the SAME caller-supplied key post the
// SAME p_op_key both times, which is what makes a retry after a lost response a replay of one
// completion rather than a second one (`clara.complete_fixed_asset_particulars`'s own
// `_reserve_op` dedupe, 0249:350-352, is what turns that replayed key into the same receipt).
test("completeFixedAssetParticulars: calling it twice with the SAME key posts the SAME p_op_key both times — no key is minted internally", async () => {
  const { impl, calls } = captureFetch({ asset_id: "a1", client_id: "c1", particulars_complete: true });
  const args = {
    clientId: "c1",
    assetId: "a1",
    particulars: { method: "straight_line", useful_life_months: 60, start_date: "2026-01-01" } as const,
    opKey: "decided-complete",
  };
  await withMockedFetch(impl, async () => {
    await completeFixedAssetParticulars(fakeSession("tok"), args);
    await completeFixedAssetParticulars(fakeSession("tok"), args);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.body.p_op_key, "decided-complete");
  assert.equal(calls[1]!.body.p_op_key, "decided-complete", "the retry carries the SAME key, not a fresh one");
});

test("#978 completeIntent: one decision while the form is unchanged, a new one the moment any particular is edited", () => {
  const base = {
    clientId: "c1", assetId: "a1",
    particulars: { method: "straight_line" as const, useful_life_months: 36, start_date: "2026-01-01" },
  };
  assert.equal(completeIntent(base), completeIntent({ ...base }), "the same completion is ONE decision");
  assert.equal(completeIntent(base),
    completeIntent({ ...base, particulars: { start_date: "2026-01-01", useful_life_months: 36, method: "straight_line" } }),
    "…and the particulars' key ORDER is not part of the decision");
  assert.notEqual(completeIntent(base),
    completeIntent({ ...base, particulars: { ...base.particulars, useful_life_months: 48 } }),
    "…changing the life is a different completion");
  assert.notEqual(completeIntent(base), completeIntent({ ...base, assetId: "a2" }),
    "…and so is a different asset");
});

test("reviseFixedAssetParticulars: posts p_effective_from AND the change classification alongside the particulars", async () => {
  const { impl, calls } = captureFetch({ asset_id: "a1", successor_asset_id: "a2" });
  await withMockedFetch(impl, async () => {
    await reviseFixedAssetParticulars(fakeSession("tok"), {
      clientId: "c1",
      assetId: "a1",
      particulars: { method: "none", start_date: "2026-01-01" },
      effectiveFrom: "2026-09-01",
      changeClass: "estimate",
      changeReason: "the plant survey revised the life",
      opKey: "decided-revise",
    });
  });
  const body = calls[0]!.body;
  assert.match(calls[0]!.url, /\/rpc\/revise_fixed_asset_particulars$/);
  assert.equal(body.p_effective_from, "2026-09-01");
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset, "a1");
  // #651 [0227] — THE FIVE-ARGUMENT SIGNATURE IS UNMOVED and the classification travels INSIDE
  // p_particulars (measurement M1's green arm). The door refuses CLR37 fa_change_class_required
  // without it, so a revision can no longer be recorded without saying what kind of change it is.
  assert.deepEqual(body.p_particulars, {
    method: "none", start_date: "2026-01-01",
    change_class: "estimate", change_reason: "the plant survey revised the life",
  });
  // #651 fix-round 1 (adversarial review ADV-651-8) — ONE DECISION, ONE KEY: the caller's key
  // reaches the door verbatim, so a retry after a lost response is the SAME revision rather than a
  // second supersede-forward insert.
  assert.equal(body.p_op_key, "decided-revise");
  assert.equal(Object.keys(body).length, 5, "…and the door still takes exactly five arguments");
});

test("#651 reviseIntent: one decision while the form is unchanged, a new one the moment any value is edited", () => {
  const base = {
    clientId: "c1", assetId: "a1",
    particulars: { method: "straight_line" as const, useful_life_months: 36, start_date: "2026-01-01" },
    effectiveFrom: "2026-09-01", changeClass: "estimate" as const, changeReason: "survey",
  };
  assert.equal(reviseIntent(base), reviseIntent({ ...base }), "the same revision is ONE decision");
  assert.equal(reviseIntent(base),
    reviseIntent({ ...base, particulars: { start_date: "2026-01-01", useful_life_months: 36, method: "straight_line" } }),
    "…and the particulars' key ORDER is not part of the decision");
  assert.notEqual(reviseIntent(base), reviseIntent({ ...base, effectiveFrom: "2026-10-01" }),
    "moving the effective date is a different revision");
  assert.notEqual(reviseIntent(base),
    reviseIntent({ ...base, particulars: { ...base.particulars, useful_life_months: 48 } }),
    "…and so is changing the life");
  assert.notEqual(reviseIntent(base), reviseIntent({ ...base, changeReason: "a different reason" }),
    "…and so is re-writing the reason");
});

test("disposeFixedAsset: posts every door argument by exact p_ name, cost portion defaults to null, WITH the caller's key", async () => {
  const { impl, calls } = captureFetch({ status: "posted", entry_id: "e1", asset_id: "a1", nbv_cents: 0, gain_cents: 0, stub_cents: 0 });
  await withMockedFetch(impl, async () => {
    await disposeFixedAsset(fakeSession("tok"), {
      clientId: "c1",
      assetId: "a1",
      disposalDate: "2026-08-27",
      proceedsCents: 50000,
      proceedsAccount: "1010",
      gainAccount: "4900",
      lossAccount: "5900",
      memo: "Scrapped",
      opKey: "decided-dispose",
    });
  });
  const body = calls[0]!.body;
  assert.match(calls[0]!.url, /\/rpc\/dispose_fixed_asset$/);
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_asset, "a1");
  assert.equal(body.p_disposal_date, "2026-08-27");
  assert.equal(body.p_proceeds_cents, 50000);
  assert.equal(body.p_proceeds_account, "1010");
  assert.equal(body.p_gain_account, "4900");
  assert.equal(body.p_loss_account, "5900");
  assert.equal(body.p_memo, "Scrapped");
  assert.equal(body.p_cost_portion_cents, null);
  assert.equal(body.p_op_key, "decided-dispose");
});

// #978 — the door mints NOTHING of its own: two calls with the SAME caller-supplied key post the
// SAME p_op_key both times, which is what makes a retry after a lost response a replay of one
// disposal rather than a second one (`clara.dispose_fixed_asset`'s own `_reserve_op` dedupe,
// 0041:3662-3672, is what turns that replayed key into the same receipt).
test("disposeFixedAsset: calling it twice with the SAME key posts the SAME p_op_key both times — no key is minted internally", async () => {
  const { impl, calls } = captureFetch({ status: "posted", entry_id: "e1", asset_id: "a1", nbv_cents: 0, gain_cents: 0, stub_cents: 0 });
  const args = {
    clientId: "c1", assetId: "a1", disposalDate: "2026-08-27", proceedsCents: 50000,
    proceedsAccount: "1010", gainAccount: "4900", lossAccount: "5900", memo: "Scrapped",
    opKey: "decided-dispose",
  };
  await withMockedFetch(impl, async () => {
    await disposeFixedAsset(fakeSession("tok"), args);
    await disposeFixedAsset(fakeSession("tok"), args);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.body.p_op_key, "decided-dispose");
  assert.equal(calls[1]!.body.p_op_key, "decided-dispose", "the retry carries the SAME key, not a fresh one");
});

test("#978 disposeIntent: one decision while the money facts are unchanged, a new one the moment any of them move — memo EXCLUDED", () => {
  const base = {
    clientId: "c1", assetId: "a1", disposalDate: "2026-08-27", proceedsCents: 50000,
    proceedsAccount: "1010", gainAccount: "4900", lossAccount: "5900",
  };
  assert.equal(disposeIntent(base), disposeIntent({ ...base }), "the same disposal is ONE decision");
  assert.notEqual(disposeIntent(base), disposeIntent({ ...base, proceedsCents: 60000 }),
    "…changing the proceeds is a different disposal");
  assert.notEqual(disposeIntent(base), disposeIntent({ ...base, disposalDate: "2026-08-28" }),
    "…and so is moving the disposal date");
  assert.notEqual(disposeIntent(base), disposeIntent({ ...base, costPortionCents: 10000 }),
    "…and so is naming a partial-disposal cost portion");
  assert.notEqual(disposeIntent(base), disposeIntent({ ...base, proceedsAccount: null }),
    "…and so is dropping the proceeds account");
  // #978 — `clara.dispose_fixed_asset`'s own dedupe hash EXCLUDES the memo (0041:3667-3671: two
  // calls sharing an op_key and differing only in their note are the SAME disposal relabelled),
  // so the client's decision key follows the same rule.
});
