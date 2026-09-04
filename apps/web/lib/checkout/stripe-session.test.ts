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
  CHECKOUT_TIMEOUT_MS,
  STRIPE_API_VERSION,
  STRIPE_LIVEMODE_VAR,
  STRIPE_SECRET_KEY_VAR,
  StripeSessionError,
  checkoutIdempotencyKey,
  checkoutSessionForm,
  createCheckoutSession,
  expectedStripeLivemode,
  reportStripeKeyClassAtStartup,
  stripeKeyLivemode,
  type CheckoutSessionRequest,
} from "./stripe-session";

const FIXTURE_KEY = "lane-b-fixture-credential-value";

/** The deployment mode the key-class gate needs before it will call Stripe at
 *  all. Every pre-existing cell below runs under it, so the gate is exercised
 *  on the happy path too rather than only where it refuses. */
const TEST_MODE = { [STRIPE_LIVEMODE_VAR]: "test" };
const CONFIGURED = { [STRIPE_SECRET_KEY_VAR]: FIXTURE_KEY, ...TEST_MODE };

const REQUEST: CheckoutSessionRequest = {
  stripePriceId: "price_1Fixture",
  paymentMethodCollection: "if_required",
  successUrl: "https://app.clarabook.example/checkout/success",
  cancelUrl: "https://app.clarabook.example/pending",
  registrationId: "11111111-1111-1111-1111-111111111111",
  applicant: "22222222-2222-2222-2222-222222222222",
  intentId: "33333333-3333-3333-3333-333333333333",
  idempotencyKey: "op-key-fixture",
  customerEmail: null,
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
    env: CONFIGURED,
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
      () => createCheckoutSession(REQUEST, { env: CONFIGURED, fetchImpl: impl as typeof fetch }),
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
        env: CONFIGURED,
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
    env: CONFIGURED,
    fetchImpl: async () => ok(),
  });
  assert.deepEqual(created, { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
});

test("NIT 5 — A HANGING STRIPE IS BOUNDED: the deadline refuses, it never hangs", async () => {
  // #517 review r2, NIT 5. `confirmation-wall.ts` bounded its runtime call and
  // this module — the MONEY hop — did not, so a hanging Stripe would have held
  // POST /checkout open to the platform's ceiling. No money moves on that path
  // (the Session is never created, the intent stays unstamped), which is why it
  // was a NIT; the bound is what makes the honest refusal reachable in finite
  // time.
  //
  // The fetch NEVER settles. Only the deadline can end this call, so the cell
  // cannot pass for any other reason: no status to read, no body to parse, no
  // error to catch. A real timer at a small injected bound, not a faked clock —
  // the abort has to travel through `fetch`'s own `signal` plumbing for this to
  // mean anything, and a fake clock would let a build that ignores the signal
  // pass.
  // THE STUB HONOURS THE SIGNAL, exactly as a real `fetch` does — and that is
  // what makes this cell discriminate rather than merely hang. A stub that
  // ignored the signal would leave a promise pending forever, which Node's
  // runner reports as "resolution is still pending" and cancels every sibling
  // cell in the file: a red, but an uninformative one that says nothing about
  // whether the signal was WIRED. So:
  //   · shipped code → `signal` reaches the stub → abort at the bound →
  //     `AbortError` → the typed transport refusal below.
  //   · mutant (`signal:` deleted) → no signal ever arrives → the FUSE fires
  //     instead, with a different error name, and the identity assertion reds
  //     CLEANLY without stranding the rest of the file.
  const hangingStripe = (_url: unknown, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      const fuse = setTimeout(
        () => reject(Object.assign(new Error("no signal was ever passed to fetch"), { name: "NoSignalError" })),
        2_000,
      );
      const fail = () => {
        clearTimeout(fuse);
        reject(Object.assign(new Error("the deadline aborted the call"), { name: "AbortError" }));
      };
      if (init?.signal === undefined) return; // the mutant's fate: only the fuse can end this
      if (init.signal.aborted) return fail();
      init.signal.addEventListener("abort", fail, { once: true });
    });

  await assert.rejects(
    () =>
      createCheckoutSession(REQUEST, {
        env: CONFIGURED,
        fetchImpl: hangingStripe as unknown as typeof fetch,
        timeoutMs: 40,
      }),
    (err: unknown) => {
      assert.ok(err instanceof StripeSessionError, "the deadline produced something other than a StripeSessionError");
      // NEVER AN ACCEPTANCE: the same class a dead socket produces, which
      // `handler.ts` renders as the `stripe_unavailable` card.
      assert.equal(err.reason, "transport");
      // The refusal came from THE ABORT, not from the fuse — this is the line
      // the `signal:` mutant reds.
      assert.match(err.message, /AbortError/, `the refusal did not come from the abort: ${err.message}`);
      assert.doesNotMatch(err.message, /NoSignalError/, "no AbortSignal was passed to fetch at all");
      return true;
    },
  );

  // MUST-NOT-RED CONTROL: the same module, unbounded in practice, still
  // resolves a fast answer. A bound that refused everything would pass the
  // assertions above and break checkout entirely.
  const created = await createCheckoutSession(REQUEST, {
    env: CONFIGURED,
    fetchImpl: async () => ok(),
    timeoutMs: 40,
  });
  assert.equal(created.id, "cs_test_123");
});

test("NIT 5 — the SHIPPED bound is the module's own constant, not a test's value", () => {
  // The injectable bound exists for the cell above; the value that ships is the
  // exported constant, so no test can quietly weaken production by passing a
  // smaller one. Pinned beside the confirm hop's 10 s, the discipline this
  // matches.
  assert.equal(CHECKOUT_TIMEOUT_MS, 10_000);
  assert.ok(Number.isInteger(CHECKOUT_TIMEOUT_MS) && CHECKOUT_TIMEOUT_MS > 0);
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

// ===========================================================================
// CB-AE2E-003 — THE KEY-CLASS GATE
// ===========================================================================
// The defect: the only validation on `STRIPE_SECRET_KEY` was "non-empty", so a
// LIVE key on the beta deployment would have been used and the first evidence
// of the mistake would have been a real charge in the live account.

/** A key with the live prefix and NOTHING else real about it. Deliberately not
 *  key-shaped beyond the prefix — this file's own header explains why a
 *  realistic Stripe literal does not belong in the tree, and the prefix is the
 *  only part the gate reads. */
const LIVE_SHAPED_KEY = "sk_live_lane-l1-fixture-not-a-real-key";
const TEST_SHAPED_KEY = "sk_test_lane-l1-fixture-not-a-real-key";

test("A LIVE-SHAPED KEY UNDER A TEST DEPLOYMENT REFUSES, and fetch is never reached", async () => {
  // The expensive direction. `fetchImpl` throws rather than returning a
  // refusal, so the cell can only pass if the gate ran BEFORE the network call
  // — "zero fetch calls" asserted by construction, not by counting after.
  let calls = 0;
  await assert.rejects(
    () =>
      createCheckoutSession(REQUEST, {
        env: { [STRIPE_SECRET_KEY_VAR]: LIVE_SHAPED_KEY, ...TEST_MODE },
        fetchImpl: async () => { calls += 1; throw new Error("Stripe must not be reached"); },
      }),
    (err: unknown) => {
      assert.ok(err instanceof StripeSessionError);
      // The reason the route already maps to `stripe_unavailable` — no new UI.
      assert.equal(err.reason, "unconfigured");
      assert.match(err.message, /livemode/);
      // THE SECRET IS NOT IN THE REFUSAL, which reaches a server log.
      assert.equal(err.message.includes(LIVE_SHAPED_KEY), false, "the refusal carries the key");
      return true;
    },
  );
  assert.equal(calls, 0, "the gate ran AFTER the Stripe call");
});

test("IT REFUSES IN BOTH DIRECTIONS — a test key on a live deployment is also refused", async () => {
  // The cheap-looking direction, which is the one that quietly takes no money
  // and opens firms for free cards. A gate that only rejected `sk_live_` would
  // pass every assertion in the cell above and miss this entirely.
  let calls = 0;
  await assert.rejects(
    () =>
      createCheckoutSession(REQUEST, {
        env: { [STRIPE_SECRET_KEY_VAR]: TEST_SHAPED_KEY, [STRIPE_LIVEMODE_VAR]: "live" },
        fetchImpl: async () => { calls += 1; return ok(); },
      }),
    (err: unknown) => {
      assert.ok(err instanceof StripeSessionError);
      assert.equal(err.reason, "unconfigured");
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("AN UNDECLARED MODE REFUSES — unset is never 'assume test'", async () => {
  // Fail-closed, the runtime gate's own position for the same reason: a
  // deployment that has not stated its mode has not been configured, and
  // "accept anything" is the one answer a money surface must never give.
  // A typo is in the same bucket by construction — the vocabulary is closed.
  for (const raw of [undefined, "", "  ", "TEST_MODE", "yes", "0.0", "livemode"]) {
    let calls = 0;
    const env: Record<string, string | undefined> = { [STRIPE_SECRET_KEY_VAR]: TEST_SHAPED_KEY };
    if (raw !== undefined) env[STRIPE_LIVEMODE_VAR] = raw;
    await assert.rejects(
      () => createCheckoutSession(REQUEST, {
        env,
        fetchImpl: async () => { calls += 1; return ok(); },
      }),
      (err: unknown) => {
        assert.ok(err instanceof StripeSessionError, JSON.stringify(raw));
        assert.equal(err.reason, "unconfigured", JSON.stringify(raw));
        assert.match(err.message, new RegExp(STRIPE_LIVEMODE_VAR));
        return true;
      },
      JSON.stringify(raw),
    );
    assert.equal(calls, 0, JSON.stringify(raw));
  }
});

test("MUST-NOT-RED CONTROL: a matching pair still reaches Stripe, in both modes", async () => {
  // A gate that refused everything would satisfy all three cells above and
  // break checkout entirely. Both AGREEING pairs must still transact — and the
  // live/live arm is the one a "reject sk_live_ outright" implementation would
  // red, which is why it is here rather than only the test/test arm.
  for (const [key, mode] of [
    [TEST_SHAPED_KEY, "test"],
    [LIVE_SHAPED_KEY, "live"],
    // The vocabulary's other spellings of the same two facts.
    [TEST_SHAPED_KEY, "false"],
    [TEST_SHAPED_KEY, "0"],
    [LIVE_SHAPED_KEY, "true"],
    [LIVE_SHAPED_KEY, "1"],
  ] as const) {
    const created = await createCheckoutSession(REQUEST, {
      env: { [STRIPE_SECRET_KEY_VAR]: key, [STRIPE_LIVEMODE_VAR]: mode },
      fetchImpl: async () => ok(),
    });
    assert.equal(created.id, "cs_test_123", `${mode} refused its own key class`);
  }
});

test("AN UNCLASSIFIABLE KEY IS NOT REFUSED — the gate catches mix-ups, it is not a key validator", async () => {
  // A restricted key with a shape this module does not know must not become an
  // outage. Stripe is the authority on whether a key works and says so as the
  // 401 the `refused` arm already reports. (This is also what keeps every other
  // cell in this file, which uses a non-key-shaped fixture, meaningful.)
  assert.equal(stripeKeyLivemode(FIXTURE_KEY), null);
  const created = await createCheckoutSession(REQUEST, {
    env: CONFIGURED,
    fetchImpl: async () => ok(),
  });
  assert.equal(created.id, "cs_test_123");
});

test("REVIEW LAW 3 — the mode vocabulary IS the runtime's, proven by executing the runtime's own parser", async () => {
  // `apps/web` cannot import `@clara/runtime` (it is not a dependency; this app
  // builds for Workers off its own set), so the vocabulary is re-expressed in
  // `stripe-session.ts`. A cell that re-typed the tokens here would assert its
  // own spelling three times over. Instead this LOADS the runtime module that
  // gates the webhook and runs both parsers over one table: two gates on one
  // deployment fact must agree about what "test" means, or a mode-mismatched
  // event is refused by one arm and a Session is happily created by the other.
  const runtimeUrl = new URL(
    "../../../../packages/runtime/lib/stripe-livemode.mjs",
    import.meta.url,
  ).href;
  const runtime = (await import(runtimeUrl)) as {
    LIVEMODE_VAR: string;
    expectedLivemode: (env: Record<string, string | undefined>) => boolean | null;
  };

  // The NAME is the same name, read from the runtime rather than retyped.
  assert.equal(STRIPE_LIVEMODE_VAR, runtime.LIVEMODE_VAR);

  const inputs = [
    "1", "true", "live", "LIVE", " True ",
    "0", "false", "test", "TEST", " test ",
    "", "   ", "yes", "no", "livemode", "2", "sandbox", undefined,
  ];
  let sawTrue = false;
  let sawFalse = false;
  let sawNull = false;
  for (const raw of inputs) {
    const env: Record<string, string | undefined> = {};
    if (raw !== undefined) env[STRIPE_LIVEMODE_VAR] = raw;
    const mine = expectedStripeLivemode(env);
    const theirs = runtime.expectedLivemode(env);
    assert.equal(mine, theirs, `the two gates disagree on ${JSON.stringify(raw)}`);
    if (mine === true) sawTrue = true;
    if (mine === false) sawFalse = true;
    if (mine === null) sawNull = true;
  }
  // VACUITY CONTROL: the table exercises all three answers, so "they agree"
  // is not the agreement of two functions that both returned null every time.
  assert.ok(sawTrue && sawFalse && sawNull, "the input table did not reach all three answers");
});

test("THE STARTUP ARM reports a mismatch and NEVER throws", async () => {
  // It runs at module scope. A throw there would fail `next build` on every
  // machine that legitimately holds no Stripe configuration — an outage with a
  // security-shaped comment. See the function's own header.
  const said: string[] = [];
  const reported = reportStripeKeyClassAtStartup(
    { [STRIPE_SECRET_KEY_VAR]: LIVE_SHAPED_KEY, ...TEST_MODE },
    (m) => said.push(m),
  );
  assert.ok(reported, "a live key under a test deployment was not reported at startup");
  assert.equal(said.length, 1);
  assert.match(said[0] as string, /STRIPE CONFIGURATION REFUSED AT STARTUP/);
  assert.equal((said[0] as string).includes(LIVE_SHAPED_KEY), false, "the log line carries the key");

  // SILENT when there is nothing to judge: no key at all is the pre-existing
  // `unconfigured` refusal's business, and shouting in every build shell
  // teaches the reader to ignore the line that matters.
  const quiet: string[] = [];
  assert.equal(reportStripeKeyClassAtStartup({}, (m) => quiet.push(m)), null);
  assert.equal(reportStripeKeyClassAtStartup(TEST_MODE, (m) => quiet.push(m)), null);
  // And silent on a correctly configured pair.
  assert.equal(
    reportStripeKeyClassAtStartup({ [STRIPE_SECRET_KEY_VAR]: TEST_SHAPED_KEY, ...TEST_MODE }, (m) => quiet.push(m)),
    null,
  );
  assert.deepEqual(quiet, []);
});

// ===========================================================================
// H-38 — customer_email
// ===========================================================================

test("H-38: customer_email reaches the wire when the token carries one", () => {
  const form = checkoutSessionForm({ ...REQUEST, customerEmail: "aisyah@example.test" });
  assert.equal(form.get("customer_email"), "aisyah@example.test");
  // And nothing else moved: the eleven pre-existing fields plus this one.
  assert.equal([...form.keys()].length, 13);
});

test("H-38: an ABSENT address OMITS the field — never an empty string (Stripe 400s on it)", () => {
  for (const value of [null, ""]) {
    const form = checkoutSessionForm({ ...REQUEST, customerEmail: value });
    assert.equal(form.has("customer_email"), false, JSON.stringify(value));
    // The discriminating half: `.get()` on a missing key is null, and so is
    // `.get()` on a key set to "" — only `.has()` tells them apart, which is
    // exactly the difference Stripe rejects.
    assert.equal([...form.keys()].filter((k) => k === "customer_email").length, 0);
  }
});

test("H-38: the IDEMPOTENCY KEY moved with the body, so a mid-deploy retry mints a fresh Session", () => {
  // Stripe answers a same-key request carrying DIFFERENT parameters with a
  // 400. Adding `customer_email` is such a change, so the key shape had to
  // move with it or an intent created before this deploy would take a hard
  // 400 on retry inside Stripe's 24-hour window.
  const key = checkoutIdempotencyKey("33333333-3333-3333-3333-333333333333", "if_required");
  assert.notEqual(
    key,
    "33333333-3333-3333-3333-333333333333:if_required",
    "the key did not move when the request body changed — a same-key retry now 400s",
  );
  // The two facts the key was already built on survive the widening.
  assert.match(key, /^33333333-3333-3333-3333-333333333333:if_required:/);
  assert.notEqual(
    checkoutIdempotencyKey("i", "if_required"),
    checkoutIdempotencyKey("i", "always"),
    "the collection mode left the key",
  );
  assert.notEqual(
    checkoutIdempotencyKey("a", "always"),
    checkoutIdempotencyKey("b", "always"),
    "the intent left the key",
  );
});
