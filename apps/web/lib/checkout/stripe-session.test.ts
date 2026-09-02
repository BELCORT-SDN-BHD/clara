// The Stripe Checkout Session builder — the one place in `apps/web` that
// holds `STRIPE_SECRET_KEY` and talks to Stripe.
//
// WHAT THESE CELLS GUARD. (1) The wire shape, pinned field by field, because
// every value in it came from the DATABASE and a dropped one is a Session
// built on a default; (2) the secret, which must appear in exactly one header
// and nowhere else — not in a URL, not in a thrown message; (3) the failure
// classes, each distinguishable, so the route can render an honest card
// instead of retrying into a second Session.
//
// THE FIXTURE KEY IS DELIBERATELY NOT KEY-SHAPED. A realistic Stripe test-key
// literal in a source file is what the repo's leak-scan gate exists to refuse,
// and reshaping a fixture to slip past a secret scanner is exactly the habit
// that gate protects. The assertions below search for the ACTUAL fixture value
// rather than for a vendor prefix, which is the stronger property anyway: it
// catches a leak of whatever the real key happens to look like.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STRIPE_API_VERSION,
  STRIPE_SECRET_KEY_VAR,
  StripeSessionError,
  checkoutSessionForm,
  createCheckoutSession,
  type CheckoutSessionRequest,
} from "./stripe-session";

const FIXTURE_KEY = "lane-b-fixture-credential-value";

const REQUEST: CheckoutSessionRequest = {
  stripePriceId: "price_1Fixture",
  paymentMethodCollection: "if_required",
  successUrl: "https://app.clarabook.example/checkout/success",
  cancelUrl: "https://app.clarabook.example/pending",
  registrationId: "11111111-1111-1111-1111-111111111111",
  applicant: "22222222-2222-2222-2222-222222222222",
  intentId: "33333333-3333-3333-3333-333333333333",
  idempotencyKey: "op-key-fixture",
};

const ok = () =>
  new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("THE WIRE SHAPE is pinned field by field — every value is the DB's", () => {
  const form = checkoutSessionForm(REQUEST);
  assert.deepEqual(Object.fromEntries(form.entries()), {
    mode: "subscription",
    "line_items[0][price]": "price_1Fixture",
    "line_items[0][quantity]": "1",
    payment_method_collection: "if_required",
    success_url: "https://app.clarabook.example/checkout/success",
    cancel_url: "https://app.clarabook.example/pending",
    "metadata[clara_registration_id]": REQUEST.registrationId,
    "metadata[clara_applicant]": REQUEST.applicant,
    "metadata[clara_intent_id]": REQUEST.intentId,
    "subscription_data[metadata][clara_registration_id]": REQUEST.registrationId,
    "subscription_data[metadata][clara_applicant]": REQUEST.applicant,
    "subscription_data[metadata][clara_intent_id]": REQUEST.intentId,
  });
  // NO AMOUNT IS SENT. Stripe must never originate an authoritative number
  // (design §6's named non-goals, billing Annex A D12), and a Session that
  // carried its own price would be doing exactly that.
  for (const key of [...form.keys()]) {
    assert.doesNotMatch(key, /amount|unit_amount|currency|price_data/i, key);
  }
});

test("the collection mode is CARRIED, not defaulted — both arms reach the wire", () => {
  // Omitting the field entirely gives Stripe's own default of 'always', which
  // is the arm design part 3 §2 rejects at RM0 in test mode. A cell that only
  // exercised 'if_required' would stay green if the field were dropped when
  // the plan says 'always'.
  for (const mode of ["if_required", "always"] as const) {
    const form = checkoutSessionForm({ ...REQUEST, paymentMethodCollection: mode });
    assert.equal(form.get("payment_method_collection"), mode);
  }
});

test("the metadata is the three ids the applier cross-checks, and nothing else", () => {
  const form = checkoutSessionForm(REQUEST);
  const metadataKeys = [...form.keys()].filter((k) => k.startsWith("metadata["));
  assert.deepEqual(metadataKeys.sort(), [
    "metadata[clara_applicant]",
    "metadata[clara_intent_id]",
    "metadata[clara_registration_id]",
  ]);
});

test("the secret rides ONE header, and appears nowhere else", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  await createCheckoutSession(REQUEST, {
    env: { [STRIPE_SECRET_KEY_VAR]: FIXTURE_KEY },
    fetchImpl: async (url, init) => {
      seen = { url: String(url), init: init as RequestInit };
      return ok();
    },
  });
  const call = seen as unknown as { url: string; init: RequestInit };
  assert.equal(call.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(call.url.includes(FIXTURE_KEY), false, "the secret is in the URL");
  assert.equal(String(call.init.body).includes(FIXTURE_KEY), false, "the secret is in the body");
  const headers = new Headers(call.init.headers);
  assert.equal(headers.get("authorization"), `Bearer ${FIXTURE_KEY}`);
  assert.equal(headers.get("stripe-version"), STRIPE_API_VERSION);
  assert.equal(headers.get("idempotency-key"), "op-key-fixture");
  // Exactly one header carries it.
  const carrying = [...headers.entries()].filter(([, v]) => v.includes(FIXTURE_KEY));
  assert.equal(carrying.length, 1, `${carrying.length} headers carry the secret`);
});

test("an ABSENT key refuses without calling Stripe at all", async () => {
  for (const env of [{}, { [STRIPE_SECRET_KEY_VAR]: "" }, { [STRIPE_SECRET_KEY_VAR]: "   " }]) {
    await assert.rejects(
      () =>
        createCheckoutSession(REQUEST, {
          env,
          fetchImpl: async () => { throw new Error("fetch must not be reached"); },
        }),
      (err: unknown) => {
        assert.ok(err instanceof StripeSessionError);
        assert.equal(err.reason, "unconfigured");
        return true;
      },
      JSON.stringify(env),
    );
  }
});

test("every failure class is DISTINGUISHABLE, and none leaks Stripe's body", async () => {
  const cases: ReadonlyArray<[string, () => Promise<Response>, StripeSessionError["reason"]]> = [
    ["a refusal", async () => new Response(JSON.stringify({ error: { message: "No such price: price_1Fixture" } }), { status: 400 }), "refused"],
    ["a 500", async () => new Response("", { status: 500 }), "refused"],
    ["a non-JSON 200", async () => new Response("<html>", { status: 200 }), "malformed"],
    ["a 200 with no url", async () => new Response(JSON.stringify({ id: "cs_1" }), { status: 200 }), "malformed"],
    ["a 200 with no id", async () => new Response(JSON.stringify({ url: "https://x" }), { status: 200 }), "malformed"],
    ["a 200 with empty strings", async () => new Response(JSON.stringify({ id: "", url: "" }), { status: 200 }), "malformed"],
  ];
  for (const [label, impl, reason] of cases) {
    await assert.rejects(
      () => createCheckoutSession(REQUEST, { env: { [STRIPE_SECRET_KEY_VAR]: FIXTURE_KEY }, fetchImpl: impl as typeof fetch }),
      (err: unknown) => {
        assert.ok(err instanceof StripeSessionError, label);
        assert.equal(err.reason, reason, label);
        // Stripe's error body can echo request parameters; the message must
        // carry the status and nothing from the response.
        assert.doesNotMatch(err.message, /No such price|<html>/, label);
        return true;
      },
      label,
    );
  }
});

test("a transport failure is its own class, never a refusal", async () => {
  await assert.rejects(
    () =>
      createCheckoutSession(REQUEST, {
        env: { [STRIPE_SECRET_KEY_VAR]: FIXTURE_KEY },
        fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
      }),
    (err: unknown) => {
      assert.ok(err instanceof StripeSessionError);
      assert.equal(err.reason, "transport");
      return true;
    },
  );
});

test("a well-formed 200 resolves with exactly the id and url Stripe returned", async () => {
  const created = await createCheckoutSession(REQUEST, {
    env: { [STRIPE_SECRET_KEY_VAR]: FIXTURE_KEY },
    fetchImpl: async () => ok(),
  });
  assert.deepEqual(created, { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
});

test("the pinned API version is a real dated Stripe release train", () => {
  // Measured against docs.stripe.com/sdks/versioning through the Stripe docs
  // MCP on 2026-09-02 ("The current version of the API is 2026-08-26.dahlia").
  // The first cut of this module pinned a plausible string from memory — a
  // wrong version header is a 400 on the money surface — so the shape is
  // pinned here and the value is a deliberate, changelog-read bump.
  assert.match(STRIPE_API_VERSION, /^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
  assert.equal(STRIPE_API_VERSION, "2026-08-26.dahlia");
});
