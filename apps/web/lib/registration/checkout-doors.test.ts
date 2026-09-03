// The four checkout door callers — the decoding walls that sit between
// PostgREST's answer and a money-surface act.
//
// WHY THESE ARE CELLED SEPARATELY from the route. The route's cells prove the
// ORDER and the refusals; these prove what each caller will and will not accept
// as an answer. `getCurrentCheckoutPlan`'s unknown-token refusal in particular
// is named as a wall in the PR body's seam↔door table and had no RED-before at
// all (review M4): neutering it left the whole suite green.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  claimPaidFirm,
  getCurrentCheckoutPlan,
  openCheckoutIntent,
  recordCheckoutSession,
} from "./checkout-doors";
import type { SessionTokenAccessor } from "@/lib/session";

const accessor: SessionTokenAccessor = { getAccessToken: async () => "test-token" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function withDoor<T>(answer: () => Response, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async () => answer()) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("M4: an UNKNOWN payment_method_collection REFUSES — it is never defaulted", async () => {
  // The DB CHECK is the real wall and this is defence-in-depth, but the PR body
  // names it as a wall, so it owes a RED-before. What makes it worth having:
  // the alternative to throwing is passing an unknown token straight to Stripe,
  // or silently falling back to a mode the design rejects at RM0.
  for (const mode of ["sometimes", "", null, 7, undefined, "IF_REQUIRED", "Always"]) {
    await assert.rejects(
      () =>
        withDoor(
          () => json([{ local_key: "clara-beta-2026", payment_method_collection: mode }]),
          () => getCurrentCheckoutPlan(accessor),
        ),
      (err: unknown) => {
        assert.match(String((err as Error).message), /payment_method_collection/);
        return true;
      },
      `mode ${JSON.stringify(mode)}`,
    );
  }

  // MUST-NOT-RED CONTROL: both real tokens resolve, so the refusals above are
  // the guard discriminating rather than the caller being broken.
  for (const mode of ["if_required", "always"] as const) {
    assert.deepEqual(
      await withDoor(
        () => json([{ local_key: "clara-beta-2026", payment_method_collection: mode }]),
        () => getCurrentCheckoutPlan(accessor),
      ),
      { localKey: "clara-beta-2026", paymentMethodCollection: mode },
    );
  }
});

test("a plan answer with no usable local_key refuses rather than building a Session", async () => {
  for (const rows of [[], [{}], [{ payment_method_collection: "always" }], null,
    [{ local_key: "", payment_method_collection: "always" }]]) {
    await assert.rejects(
      () => withDoor(() => json(rows), () => getCurrentCheckoutPlan(accessor)),
      /get_current_checkout_plan/,
      JSON.stringify(rows),
    );
  }
});

test("openCheckoutIntent requires all three fields the route then spends", async () => {
  const complete = { intent_id: "int-1", price_local_key: "k", stripe_price_id: "price_1" };
  assert.deepEqual(
    await withDoor(() => json(complete), () =>
      openCheckoutIntent({ registration: "r", originDigest: "\\xab", opKey: "o" }, accessor)),
    { intentId: "int-1", priceLocalKey: "k", stripePriceId: "price_1" },
  );
  // A partial answer is not an intent. The route would otherwise send a Session
  // to Stripe naming an empty price or stamp an intent that does not exist.
  for (const key of ["intent_id", "price_local_key", "stripe_price_id"]) {
    const partial: Record<string, unknown> = { ...complete };
    delete partial[key];
    await assert.rejects(
      () => withDoor(() => json(partial), () =>
        openCheckoutIntent({ registration: "r", originDigest: "\\xab", opKey: "o" }, accessor)),
      /open_checkout_intent/,
      `missing ${key}`,
    );
  }
});

test("claimPaidFirm requires a firm id, and carries the door's own replay marker", async () => {
  const complete = { firm_id: "f", plan_id: "p", registration_id: "r" };
  assert.deepEqual(
    await withDoor(() => json(complete), () => claimPaidFirm({ registration: "r", opKey: "o" }, accessor)),
    { firmId: "f", planId: "p", registrationId: "r", replay: false },
  );
  assert.equal(
    (await withDoor(() => json({ ...complete, replay: true }), () =>
      claimPaidFirm({ registration: "r", opKey: "o" }, accessor))).replay,
    true,
  );
  await assert.rejects(() =>
    withDoor(() => json({ plan_id: "p", registration_id: "r" }), () =>
      claimPaidFirm({ registration: "r", opKey: "o" }, accessor)));
});

test("recordCheckoutSession sends exactly the three door parameters", async () => {
  let sent: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body ?? "{}"));
    return json({ intent_id: "int-1", recorded: true });
  }) as typeof fetch;
  try {
    await recordCheckoutSession({ intentId: "int-1", sessionId: "cs_1", opKey: "o" }, accessor);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
  assert.deepEqual(sent, { p_intent: "int-1", p_session_id: "cs_1", p_op_key: "o" });
});
