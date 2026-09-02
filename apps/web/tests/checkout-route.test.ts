// `POST /checkout` — server entry 2 of 3 (checkout-gate-design part 1 §1.1).
//
// WHAT THESE CELLS ARE FOR. This is the money surface's front door: it spends
// a rate-wall attempt, creates a Stripe object and stamps a one-shot intent.
// Every refusal below is a wall whose deletion is a real defect, so each is
// driven through the SHIPPED handler rather than a copy of its predicate
// (裁-107), and each asserts what did NOT happen as well as the status —
// absence of a Stripe call, absence of a stamp, absence of a session install.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NextResponse } from "next/server";

import { handleCheckoutPost, openRegistrationFrom } from "../app/(entry)/checkout/handler";
import { checkoutFlashCookie } from "@/lib/checkout/checkout-flash";
import { StripeSessionError, type CheckoutSessionRequest } from "@/lib/checkout/stripe-session";
import { PEPPER_VAR, TRUSTED_HEADER_VAR } from "@/lib/rate-wall-courier";
import type { OwnRegistrationResult } from "@/lib/registration/server-reads";

const SUBJECT = "22222222-2222-2222-2222-222222222222";
const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const ORIGIN = "https://app.clarabook.example";
const SESSION_URL = "https://checkout.stripe.com/c/pay/cs_test_123";

const ENV = { [TRUSTED_HEADER_VAR]: "CF-Connecting-IP", [PEPPER_VAR]: "lane-b-pepper" };

function postRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/checkout`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      host: "app.clarabook.example",
      "sec-fetch-site": "same-origin",
      "cf-connecting-ip": "203.0.113.7",
      ...headers,
    },
  });
}

const openRegistration = (): OwnRegistrationResult => ({
  ok: true,
  subject: SUBJECT,
  rows: [{
    id: REGISTRATION,
    applicant: SUBJECT,
    firm_name: "ROME PROPERTIES",
    note: null,
    status: "open",
    decided_by: null,
    decided_at: null,
    reason: null,
    firm_id: null,
    created_at: "2026-09-02T00:00:00Z",
  }],
  context: { ok: false, reason: "no_membership" },
  checkoutProgress: { checkoutOpen: false, paidUnconsumed: false },
});

function readFlash(response: Response): Record<string, unknown> {
  const raw = (response as NextResponse).cookies.get(checkoutFlashCookie().name)?.value;
  assert.ok(raw, "no checkout flash cookie was set");
  const location = response.headers.get("location");
  assert.ok(location, "no redirect Location");
  const url = new URL(location);
  assert.equal(url.pathname, "/pending");
  assert.deepEqual([...url.searchParams.keys()], ["checkout"], "the URL must carry ONLY the marker");
  const payload = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(payload.nonce, url.searchParams.get("checkout"), "the cookie is not bound to the marker");
  return payload;
}

type Recorder = {
  stripeCalls: CheckoutSessionRequest[];
  doorCalls: Array<{ fn: string; args: Record<string, unknown> }>;
};

function deps(
  rec: Recorder,
  over: {
    registration?: () => Promise<OwnRegistrationResult>;
    session?: () => Promise<{ accessToken: string; subject: string } | null>;
    createSession?: (r: CheckoutSessionRequest) => Promise<{ id: string; url: string }>;
    env?: Record<string, string | undefined>;
  } = {},
) {
  return {
    resolveSession: over.session ?? (async () => ({ accessToken: "tok", subject: SUBJECT })),
    loadRegistration: over.registration ?? (async () => openRegistration()),
    createSession:
      over.createSession ??
      (async (r: CheckoutSessionRequest) => {
        rec.stripeCalls.push(r);
        return { id: "cs_test_123", url: SESSION_URL };
      }),
    env: over.env ?? ENV,
    newOpKey: () => "op-key-fixture",
  };
}

/**
 * The doors are intercepted at `fetch`, not at the module boundary, so these
 * cells drive the REAL `callDoor` transport — the status-before-CLR ordering,
 * the refusal classification and the bytea argument all included. A module
 * stub would have proved the handler's branching and nothing about the wire.
 */
async function withDoors<T>(
  rec: Recorder,
  answers: Record<string, () => Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const fn = /\/rpc\/([A-Za-z0-9_]+)/.exec(url)?.[1] ?? "";
    rec.doorCalls.push({ fn, args: JSON.parse(String(init?.body ?? "{}")) });
    const answer = answers[fn];
    if (!answer) throw new Error(`no fixture for door ${fn}`);
    return answer();
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const HAPPY_DOORS = {
  open_checkout_intent: () =>
    json({ intent_id: "int-1", price_local_key: "clara-beta-2026", stripe_price_id: "price_123" }),
  get_current_checkout_plan: () =>
    json([{ local_key: "clara-beta-2026", payment_method_collection: "if_required" }]),
  record_checkout_session: () => json({ intent_id: "int-1", recorded: true }),
};

const recorder = (): Recorder => ({ stripeCalls: [], doorCalls: [] });

test("THE HAPPY PATH: door → plan → Stripe → stamp → 303 to Stripe, in that order", async () => {
  const rec = recorder();
  const response = await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(rec)),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), SESSION_URL);

  // THE ORDER IS THE PROPERTY. `record_checkout_session` must run AFTER Stripe
  // returns: the reverse would stamp a one-shot intent with a Session that was
  // never created, leaving the applicant holding a spent intent pointing at
  // nothing.
  assert.deepEqual(
    rec.doorCalls.map((c) => c.fn),
    ["open_checkout_intent", "get_current_checkout_plan", "record_checkout_session"],
  );
  assert.equal(rec.stripeCalls.length, 1);

  // EVERY VALUE IN THE SESSION CAME FROM THE DATABASE.
  const sent = rec.stripeCalls[0]!;
  assert.equal(sent.stripePriceId, "price_123", "the price id must be the door's, never a literal");
  assert.equal(sent.paymentMethodCollection, "if_required", "the plan row's value, not a default");
  assert.equal(sent.registrationId, REGISTRATION);
  assert.equal(sent.applicant, SUBJECT);
  assert.equal(sent.intentId, "int-1");
  assert.equal(sent.successUrl, `${ORIGIN}/checkout/success`);
  assert.equal(sent.cancelUrl, `${ORIGIN}/pending`);

  // THE DIGEST IS 32 BYTES ON THE WIRE, in PostgREST's bytea spelling. The
  // door raises CLR10 for anything else, so a mangled round trip refuses
  // rather than keying the wall short.
  const digest = rec.doorCalls[0]!.args.p_origin_digest as string;
  assert.match(digest, /^\\x[0-9a-f]{64}$/, `origin digest is ${digest}`);
  assert.equal(rec.doorCalls[0]!.args.p_registration, REGISTRATION);
  // The stamp carries the Session Stripe actually created.
  assert.equal(rec.doorCalls[2]!.args.p_session_id, "cs_test_123");
});

test("W-G: a cross-origin POST is 403 before ANY door, Stripe call or session read", async () => {
  const CROSS_ORIGIN: ReadonlyArray<Record<string, string>> = [
    { origin: "https://evil.example" },
    { origin: "null" },
    { origin: "https://evil.clarabook.example", "sec-fetch-site": "same-site" },
    { origin: "", "sec-fetch-site": "cross-site" },
  ];
  for (const headers of CROSS_ORIGIN) {
    const rec = recorder();
    let sessionReads = 0;
    const response = await withDoors(rec, HAPPY_DOORS, () =>
      handleCheckoutPost(postRequest(headers), {
        ...deps(rec),
        resolveSession: async () => { sessionReads += 1; return { accessToken: "tok", subject: SUBJECT }; },
      }),
    );
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.deepEqual(await response.json(), { ok: false, error: "cross-origin" });
    assert.deepEqual(rec.doorCalls, [], "a refused request reached a door");
    assert.deepEqual(rec.stripeCalls, [], "a refused request reached Stripe");
    assert.equal(sessionReads, 0, "a refused request constructed a session");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("FAIL CLOSED: no trusted client-IP digest ⇒ checkout refuses, and no door runs", async () => {
  // Design part 3 §3: "absent ⇒ checkout refuses". The alternative — a
  // constant, a placeholder, the Origin header — keys C2 on ONE value for the
  // whole deployment, so five rejected guesses from anyone lock out everyone.
  for (const [label, over] of [
    ["no header on the request", { headers: { "cf-connecting-ip": "" } }],
    ["header name unconfigured", { env: { [PEPPER_VAR]: "p" } }],
    ["no pepper", { env: { [TRUSTED_HEADER_VAR]: "CF-Connecting-IP" } }],
    ["unparseable address", { headers: { "cf-connecting-ip": "app.clarabook.example" } }],
  ] as const) {
    const rec = recorder();
    const response = await withDoors(rec, HAPPY_DOORS, () =>
      handleCheckoutPost(
        postRequest((over as { headers?: Record<string, string> }).headers ?? {}),
        deps(rec, { env: (over as { env?: Record<string, string> }).env }),
      ),
    );
    assert.equal(readFlash(response).kind, "no_origin_digest", label);
    assert.deepEqual(rec.doorCalls, [], `${label}: a door ran without a digest`);
    assert.deepEqual(rec.stripeCalls, [], `${label}: Stripe was called without a digest`);
  }
});

test("a governed refusal renders the door's OWN code and sentence, verbatim, and stops", async () => {
  const rec = recorder();
  const response = await withDoors(
    rec,
    {
      ...HAPPY_DOORS,
      open_checkout_intent: () =>
        json({ code: "CLR09", message: "the data processing agreement is not signed" }, 400),
    },
    () => handleCheckoutPost(postRequest(), deps(rec)),
  );
  assert.deepEqual(
    { ...readFlash(response), nonce: undefined },
    {
      nonce: undefined,
      kind: "refused",
      code: "CLR09",
      message: "the data processing agreement is not signed",
    },
  );
  assert.deepEqual(rec.stripeCalls, [], "Stripe was called after the door refused");
  assert.deepEqual(rec.doorCalls.map((c) => c.fn), ["open_checkout_intent"]);
});

test("a PLAN ROTATION between the two reads refuses rather than mixing two plans", async () => {
  const rec = recorder();
  const response = await withDoors(
    rec,
    {
      ...HAPPY_DOORS,
      get_current_checkout_plan: () =>
        json([{ local_key: "clara-priced-2027", payment_method_collection: "always" }]),
    },
    () => handleCheckoutPost(postRequest(), deps(rec)),
  );
  assert.equal(readFlash(response).kind, "plan_rotated");
  assert.deepEqual(
    rec.stripeCalls,
    [],
    "a Session was built at one plan's price with another plan's collection mode",
  );
});

test("a Stripe failure refuses and leaves the intent UNSTAMPED, so a retry is safe", async () => {
  const rec = recorder();
  const response = await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(
      postRequest(),
      deps(rec, {
        createSession: async () => {
          throw new StripeSessionError("refused", "Stripe refused the Checkout Session with status 402", 402);
        },
      }),
    ),
  );
  assert.equal(readFlash(response).kind, "stripe_unavailable");
  assert.equal(
    rec.doorCalls.some((c) => c.fn === "record_checkout_session"),
    false,
    "the one-shot intent was stamped for a Session that does not exist",
  );
});

test("no open registration, and no session, each get their own answer", async () => {
  const rec = recorder();
  const none = await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(
      postRequest(),
      deps(rec, { registration: async () => ({ ok: false, reason: "no_session" }) }),
    ),
  );
  assert.equal(readFlash(none).kind, "no_registration");
  assert.deepEqual(rec.doorCalls, []);

  const anonymous = await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(rec, { session: async () => null })),
  );
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get("location"), `${ORIGIN}/login`);
  assert.deepEqual(rec.doorCalls, [], "a caller with no session reached a door");
});

test("openRegistrationFrom refuses every row that is not a validated, OWN, OPEN one", () => {
  const base = openRegistration();
  const withRows = (rows: readonly unknown[]): OwnRegistrationResult =>
    ({ ...base, rows } as OwnRegistrationResult);
  const newest = base.ok ? (base.rows[0] as Record<string, unknown>) : {};

  assert.equal(openRegistrationFrom(base), REGISTRATION);
  assert.equal(openRegistrationFrom({ ok: false, reason: "no_session" }), null);
  assert.equal(openRegistrationFrom(withRows([])), null);
  assert.equal(openRegistrationFrom(withRows([{ nonsense: true }])), null);
  // A row belonging to somebody else is not evidence about this caller, even
  // though the door would refuse it too — the subject binding is what stops
  // this handler from ever asking about a registration it cannot own.
  assert.equal(
    openRegistrationFrom(withRows([{ ...newest, applicant: "33333333-3333-3333-3333-333333333333" }])),
    null,
  );
  for (const status of ["approved", "rejected", "paid"]) {
    assert.equal(openRegistrationFrom(withRows([{ ...newest, status }])), null, status);
  }
});

test("the refusal cookie is httpOnly, SameSite=Strict and Secure — the forgery wall", () => {
  // A money-surface refusal in a query string is a phishing primitive ("your
  // payment failed, click here"). The unforgeability rests entirely on these
  // three attributes; every other cell in this file reads the cookie's VALUE
  // and would stay green if all three were deleted.
  const rec = recorder();
  return withDoors(rec, HAPPY_DOORS, async () => {
    const response = await handleCheckoutPost(
      postRequest(),
      deps(rec, { registration: async () => ({ ok: false, reason: "no_session" }) }),
    );
    const cookie = (response as NextResponse).cookies.get(checkoutFlashCookie().name);
    assert.ok(cookie);
    assert.deepEqual(
      { httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, secure: cookie.secure, path: cookie.path },
      { httpOnly: true, sameSite: "strict", secure: true, path: "/" },
    );
  });
});
