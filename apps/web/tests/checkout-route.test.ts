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

import {
  handleCheckoutPost,
  isStripeHostedCheckoutUrl,
  openRegistrationFrom,
} from "../app/(entry)/checkout/handler";
import { checkoutFlashCookie } from "@/lib/checkout/checkout-flash";
import {
  checkoutIdempotencyKey,
  StripeSessionError,
  type CheckoutSessionRequest,
} from "@/lib/checkout/stripe-session";
import { PEPPER_VAR, TRUSTED_HEADER_VAR } from "@/lib/rate-wall-courier";
import { NO_CHECKOUT_PROGRESS } from "@/lib/registration/checkout-progress-reads";
import type { OwnRegistrationResult } from "@/lib/registration/server-reads";

const SUBJECT = "22222222-2222-2222-2222-222222222222";
/** The `email` claim of the SAME token `SUBJECT` is the `sub` of — H-38's whole
 *  point is that these two travel together or not at all. */
const APPLICANT_EMAIL = "aisyah@example.test";
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
  checkoutProgress: NO_CHECKOUT_PROGRESS,
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
    session?: () => Promise<{ accessToken: string; subject: string; email: string | null } | null>;
    createSession?: (r: CheckoutSessionRequest) => Promise<{ id: string; url: string }>;
    env?: Record<string, string | undefined>;
  } = {},
) {
  return {
    // The default caller CARRIES an address (H-38), so every existing cell
    // drives the arm the shipped route actually takes; the null arm has its own
    // cell below rather than being the fixture's silent default.
    resolveSession: over.session ?? (async () => ({ accessToken: "tok", subject: SUBJECT, email: APPLICANT_EMAIL })),
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
  // H-38 — the address comes from the RESOLVED SESSION, which is the verified
  // JWT's own claim, and travels beside the subject it is bound to.
  assert.equal(sent.customerEmail, APPLICANT_EMAIL);

  // THE DIGEST IS 32 BYTES ON THE WIRE, in PostgREST's bytea spelling. The
  // door raises CLR10 for anything else, so a mangled round trip refuses
  // rather than keying the wall short.
  const digest = rec.doorCalls[0]!.args.p_origin_digest as string;
  assert.match(digest, /^\\x[0-9a-f]{64}$/, `origin digest is ${digest}`);
  assert.equal(rec.doorCalls[0]!.args.p_registration, REGISTRATION);
  // The stamp carries the Session Stripe actually created.
  assert.equal(rec.doorCalls[2]!.args.p_session_id, "cs_test_123");
});

test("M1: the Stripe idempotency key is the INTENT's, so a retry replays one Session", async () => {
  // THE DEFECT THIS CELL EXISTS FOR (review M1). A per-request op key meant two
  // POSTs from one applicant — a double-click, a retry — landed on the SAME
  // intent (`0163` reuses the applicant's one unstamped current-plan intent)
  // with DIFFERENT idempotency keys, so Stripe minted a SECOND Session and
  // `record_checkout_session` refused it `CLR09 checkout session already
  // recorded`. Nothing reddened, because the only cell reading the key pinned a
  // fixture string.
  const rec = recorder();
  const keys: string[] = [];
  // Stripe's own behaviour, modelled: one Session per distinct key.
  const byKey = new Map<string, { id: string; url: string }>();
  let minted = 0;
  const createSession = async (r: CheckoutSessionRequest) => {
    rec.stripeCalls.push(r);
    keys.push(r.idempotencyKey);
    const existing = byKey.get(r.idempotencyKey);
    if (existing) return existing;
    minted += 1;
    const created = { id: `cs_test_${minted}`, url: `${SESSION_URL}_${minted}` };
    byKey.set(r.idempotencyKey, created);
    return created;
  };

  // Two POSTs, each minting its OWN op key (the production default), both
  // landing on the same intent — which is what the door actually does.
  for (const opKey of ["op-key-first", "op-key-second"]) {
    await withDoors(rec, HAPPY_DOORS, () =>
      handleCheckoutPost(postRequest(), { ...deps(rec, { createSession }), newOpKey: () => opKey }),
    );
  }

  assert.equal(keys.length, 2, "both POSTs reached Stripe");
  assert.equal(keys[0], keys[1], "the two POSTs carried DIFFERENT idempotency keys");
  assert.equal(minted, 1, "a second Checkout Session was minted for one intent");
  // And the key is built from the durable identity, not from either op key.
  // DERIVED, never re-typed: the route must build the key the module's own
  // builder builds. A literal here would assert this test's spelling and would
  // have to be edited every time the parameter shape moves (review law 3).
  assert.equal(keys[0], checkoutIdempotencyKey("int-1", "if_required"));
  for (const key of keys) assert.doesNotMatch(key, /op-key-/, "an op key leaked into the key");

  // The second stamp is the door's replay branch: same intent, SAME session id.
  const stamps = rec.doorCalls.filter((c) => c.fn === "record_checkout_session");
  assert.equal(stamps.length, 2);
  assert.equal(stamps[0]!.args.p_session_id, stamps[1]!.args.p_session_id,
    "the second stamp named a different Session — that is the CLR09 stranding");
});

test("M1: the collection mode is IN the key, so a mode flip cannot 400 on same-key params", async () => {
  // Stripe answers a same-key request carrying different parameters with a 400.
  // A plan whose `payment_method_collection` flipped without its `local_key`
  // moving slips past the route's rotation guard (which compares keys), so the
  // mode has to be part of the identity.
  const rec = recorder();
  const keys: string[] = [];
  const createSession = async (r: CheckoutSessionRequest) => {
    rec.stripeCalls.push(r);
    keys.push(r.idempotencyKey);
    return { id: "cs_test_1", url: SESSION_URL };
  };
  for (const mode of ["if_required", "always"]) {
    await withDoors(
      rec,
      {
        ...HAPPY_DOORS,
        get_current_checkout_plan: () =>
          json([{ local_key: "clara-beta-2026", payment_method_collection: mode }]),
      },
      () => handleCheckoutPost(postRequest(), deps(rec, { createSession })),
    );
  }
  assert.deepEqual(keys, [
    checkoutIdempotencyKey("int-1", "if_required"),
    checkoutIdempotencyKey("int-1", "always"),
  ]);
  // The intent is still IN the key — a builder that dropped it would make the
  // two derived expectations above agree with a route that had also dropped it.
  for (const key of keys) assert.match(key, /int-1/);
  assert.notEqual(keys[0], keys[1], "a mode flip reused the key and would 400 at Stripe");
});

test("H-38: the address is the SESSION's, never the registration's, and a tokenless one is null", async () => {
  // TWO PROPERTIES, and the first is the security one. The applicant's row in
  // `open_checkout_intent`'s world carries no address the route may trust; the
  // ONLY address bound to the principal the doors ran as is the claim on this
  // request's token. So the cell drives a session whose email differs from
  // anything else in the fixture and asserts THAT value reached Stripe.
  const rec = recorder();
  await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(rec, {
      session: async () => ({ accessToken: "tok", subject: SUBJECT, email: "someone-else@example.test" }),
    })),
  );
  assert.equal(rec.stripeCalls[0]!.customerEmail, "someone-else@example.test");

  // And a session with no address yields null — never "", which Stripe 400s,
  // and never a value invented from the registration row.
  const noEmail = recorder();
  await withDoors(noEmail, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(noEmail, {
      session: async () => ({ accessToken: "tok", subject: SUBJECT, email: null }),
    })),
  );
  assert.equal(noEmail.stripeCalls[0]!.customerEmail, null);
  // MUST-NOT-RED CONTROL: the tokenless-address arm still completes the
  // checkout. A route that refused without an address would strand a caller
  // over a field Stripe treats as optional.
  assert.equal(noEmail.doorCalls.filter((c) => c.fn === "record_checkout_session").length, 1);
});

test("review-544: the key-class refusal REACHES A LOG, and the line carries no key", async () => {
  // The applicant sees one collapsed card for every Stripe failure class, which
  // is right for them and wrong as the only record — a live key on the beta
  // deployment would refuse every checkout in silence that looks exactly like
  // Stripe being down. THE GATE IS DRIVEN FOR REAL: no stubbed `createSession`,
  // so `createCheckoutSession` reads this env, classifies the key and throws
  // its own refusal, and `fetchImpl` is absent because the gate must refuse
  // before any network call is attempted.
  const LIVE_SHAPED_KEY = "sk_live_route-cell-fixture-not-a-real-key";
  const said: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };

  const rec = recorder();
  let response: Response;
  try {
    response = await withDoors(rec, HAPPY_DOORS, () =>
      handleCheckoutPost(postRequest(), {
        ...deps(rec),
        createSession: undefined,
        env: { ...ENV, STRIPE_SECRET_KEY: LIVE_SHAPED_KEY, CLARA_STRIPE_LIVEMODE: "test" },
      } as Parameters<typeof handleCheckoutPost>[1]),
    );
  } finally {
    console.error = realError;
  }

  // #628 SPLIT THE CARD, AND THIS IS THE HALF THAT MOVED. The applicant used
  // to be told "we could not reach the payment provider — try again in a
  // moment" about a KEY-CLASS MISMATCH, which no number of retries fixes. The
  // card is now the configuration one; everything else about this cell — the
  // gate running for real, nothing charged, an UNSTAMPED intent — is unchanged.
  assert.equal(readFlash(response).kind, "payments_misconfigured");
  assert.deepEqual(
    rec.doorCalls.filter((c) => c.fn === "record_checkout_session"),
    [],
    "a refused key class still stamped the one-shot intent",
  );

  // The operator's answer is the log line, and it NAMES THE CAUSE rather than
  // repeating the card. A line that merely said "stripe_unavailable" would
  // satisfy "something was logged" and teach nobody anything.
  assert.equal(said.length, 1, `expected exactly one log line, saw ${said.length}`);
  const line = said[0] as string;
  assert.match(line, /unconfigured/, "the logged line does not name the failure class");
  assert.match(line, /CLARA_STRIPE_LIVEMODE/, "the logged line does not name the variable to fix");

  // AND IT CARRIES NO CREDENTIAL. Not the key, not a vendor prefix, not a
  // fragment of it — this line goes to a platform log an operator, a log
  // shipper and a support ticket can all reach.
  assert.equal(line.includes(LIVE_SHAPED_KEY), false, "the logged line carries the key");
  assert.doesNotMatch(line, /\b(sk|rk|pk)_(live|test)_/, "the logged line carries a key prefix");
  assert.doesNotMatch(line, /route-cell-fixture/, "the logged line carries a fragment of the key");
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
        resolveSession: async () => { sessionReads += 1; return { accessToken: "tok", subject: SUBJECT, email: APPLICANT_EMAIL }; },
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

test("#621: `legal_not_accepted` gets its OWN card, carrying the door's list — not the generic refusal", async () => {
  // A generic refusal tells the person what the DB said and leaves them on
  // /pending with nothing to do. This one has a next step — the legal stage,
  // where the agreement that moved under them can be read and accepted — so it
  // is classified by CODE AND REASON and routed to a card that offers it.
  const rec = recorder();
  const response = await withDoors(
    rec,
    {
      ...HAPPY_DOORS,
      open_checkout_intent: () =>
        json({
          code: "CLR09",
          message: "a required legal document is not accepted",
          details: JSON.stringify({ reason: "legal_not_accepted", missing: ["terms"] }),
        }, 400),
    },
    () => handleCheckoutPost(postRequest(), deps(rec)),
  );
  assert.deepEqual(
    { ...readFlash(response), nonce: undefined },
    { nonce: undefined, kind: "legal_not_accepted", missing: ["terms"] },
  );
  assert.deepEqual(rec.stripeCalls, [], "Stripe was called after the door refused");
  assert.deepEqual(rec.doorCalls.map((c) => c.fn), ["open_checkout_intent"]);
});

test("#621: a CLR09 that is NOT `legal_not_accepted` still renders the door's own sentence verbatim", async () => {
  // The discriminating negative: the new arm keys on the DETAIL's reason, not
  // on the code alone, so every other CLR09 keeps the generic card it had.
  const rec = recorder();
  const response = await withDoors(
    rec,
    {
      ...HAPPY_DOORS,
      open_checkout_intent: () =>
        json({
          code: "CLR09",
          message: "no current checkout plan",
          details: JSON.stringify({ reason: "no_plan" }),
        }, 400),
    },
    () => handleCheckoutPost(postRequest(), deps(rec)),
  );
  assert.equal(readFlash(response).kind, "refused");
  assert.equal((readFlash(response) as { message?: string }).message, "no current checkout plan");
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

test("M6: a caller who ALREADY BELONGS TO A FIRM is refused at ⑤, before Stripe", async () => {
  // 裁-139 (owner, 2026-09-02): refuse before payment. Design §5: "no path may
  // strand a paying customer without a firm."
  // `claim_paid_firm` reaches `_create_firm_core`, which refuses `CLR10 actor
  // already belongs to a firm` — so a member who completes checkout can never
  // be served by ⑧. Before this, the only membership wall was AFTER the money.
  //
  // Reachable without a page: `/pending` redirects members to `/`, so the
  // control is never offered, but a same-origin POST from a stale tab in the
  // member's own browser satisfies every other check.
  const rec = recorder();
  // The SAME predicate `holding-state.ts` derives `member` from, so the route
  // and the page cannot disagree about who is a member.
  const member = (): OwnRegistrationResult =>
    ({ ...openRegistration(), context: { ok: true, firm_id: "44444444-4444-4444-8444-444444444444" } }) as unknown as OwnRegistrationResult;

  const response = await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(rec, { registration: async () => member() })),
  );
  assert.equal(readFlash(response).kind, "already_member");
  // NOT A SINGLE SIDE EFFECT: no rate-wall attempt spent, no Stripe object, no
  // intent. This is what makes it a refusal at ⑤ rather than a nicer card at ⑧.
  assert.deepEqual(rec.doorCalls, [], "a member reached a door");
  assert.deepEqual(rec.stripeCalls, [], "a member reached Stripe");

  // MUST-NOT-RED CONTROL: the same request from a NON-member proceeds, so the
  // refusal above is the membership predicate discriminating rather than the
  // route refusing everyone.
  const rec2 = recorder();
  const ok = await withDoors(rec2, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(rec2)),
  );
  assert.equal(ok.status, 303);
  assert.ok(rec2.doorCalls.some((c) => c.fn === "open_checkout_intent"));
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

// ===========================================================================
// #628 — RESUME, CAPACITY, AND THE CONFIGURATION/OUTAGE SPLIT
// ===========================================================================

/** `open_checkout_intent`'s new refusal: a live Session already exists for this
 *  registration. The DETAIL is what the route resumes from, and it is the
 *  DOOR'S — there is no request parameter that could carry one. */
const inProgress = (detail: Record<string, unknown> = { session_id: "cs_live_628" }) => () =>
  json({
    code: "CLR09",
    message: "a checkout is already in progress for this registration",
    details: JSON.stringify({ reason: "checkout_in_progress", ...detail }),
  }, 400);

test("#628: `checkout_in_progress` RESUMES the live Session — it never mints a second one", async () => {
  // THE DEFECT THIS CLOSES IS THE ONE THE DB's RULE CREATED. One live Session
  // per registration is what stops a double-press from producing two
  // subscriptions; without a resume, the same rule traps the person pressing
  // the button, who does not want a new checkout but the one they already have.
  const rec = recorder();
  const retrieved: string[] = [];
  const response = await withDoors(
    rec,
    { ...HAPPY_DOORS, open_checkout_intent: inProgress() },
    () => handleCheckoutPost(postRequest(), {
      ...deps(rec),
      retrieveSession: async (id: string) => {
        retrieved.push(id);
        return { id, status: "open" as const, url: "https://checkout.stripe.com/c/pay/cs_live_628" };
      },
    }),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://checkout.stripe.com/c/pay/cs_live_628");
  assert.deepEqual(retrieved, ["cs_live_628"], "the resume asked Stripe about the wrong Session");
  // NOT A SINGLE STRIPE CREATE, AND NOT A SECOND STAMP. This is the property
  // the whole arm exists for.
  assert.equal(rec.stripeCalls.length, 0, "the resume minted a second Checkout Session");
  assert.deepEqual(
    rec.doorCalls.filter((c) => c.fn === "record_checkout_session"),
    [],
    "the resume stamped the intent again",
  );
  // And no flash cookie: a successful resume is a redirect, not an outcome
  // card.
  assert.equal((response as NextResponse).cookies.get(checkoutFlashCookie().name), undefined);
});

test("#628: A LOST ACKNOWLEDGEMENT resolves to the SAME Session, never a second one", async () => {
  // The journey-A1 case, driven end to end: the first POST creates a Session
  // and its 303 never reaches the browser; the person presses again. The door
  // refuses `checkout_in_progress` on the second attempt, and the route hands
  // back the SAME hosted page — so one press and two presses cost one Session,
  // one subscription and one charge.
  const rec = recorder();
  let intentIsStamped = false;
  const doors = {
    ...HAPPY_DOORS,
    open_checkout_intent: () =>
      intentIsStamped
        ? inProgress({ session_id: "cs_test_123" })()
        : json({ intent_id: "int-1", price_local_key: "clara-beta-2026", stripe_price_id: "price_123" }),
    record_checkout_session: () => { intentIsStamped = true; return json({ intent_id: "int-1", recorded: true }); },
  };
  const withResume = () => ({
    ...deps(rec),
    retrieveSession: async (id: string) => ({ id, status: "open" as const, url: SESSION_URL }),
  });

  const first = await withDoors(rec, doors, () => handleCheckoutPost(postRequest(), withResume()));
  assert.equal(first.headers.get("location"), SESSION_URL);
  // …the response is lost. The person presses again.
  const second = await withDoors(rec, doors, () => handleCheckoutPost(postRequest(), withResume()));
  assert.equal(second.status, 303);
  assert.equal(second.headers.get("location"), SESSION_URL, "the retry did not land on the same Session");

  assert.equal(rec.stripeCalls.length, 1, "the retry minted a SECOND Checkout Session");
  assert.equal(
    rec.doorCalls.filter((c) => c.fn === "record_checkout_session").length,
    1,
    "the one-shot intent was stamped twice",
  );
});

test("#628: Stripe's own verdict on the Session decides the card — open, complete, expired", async () => {
  // Each of these is a different sentence to a person waiting on a firm, and
  // guessing between them is how somebody is told their live checkout expired
  // (or, worse, is sent to pay for one that already completed).
  for (const [snapshot, expected] of [
    [{ status: "expired" as const, url: null }, "checkout_expired"],
    [{ status: "complete" as const, url: null }, "checkout_in_progress"],
    // An `open` Session Stripe returned WITHOUT a hosted URL is not somewhere a
    // person can be sent; it reads as in-progress rather than as a redirect to
    // nowhere.
    [{ status: "open" as const, url: null }, "checkout_in_progress"],
  ] as const) {
    const rec = recorder();
    const response = await withDoors(
      rec,
      { ...HAPPY_DOORS, open_checkout_intent: inProgress() },
      () => handleCheckoutPost(postRequest(), {
        ...deps(rec),
        retrieveSession: async (id: string) => ({ id, ...snapshot }),
      }),
    );
    assert.equal(readFlash(response).kind, expected, snapshot.status);
    assert.equal(rec.stripeCalls.length, 0, `${snapshot.status}: a Session was created anyway`);
  }
});

test("#628: a door that says `checkout_in_progress` and names NO Session gets the honest card", async () => {
  // Inventing a resume target out of an absent value is the one thing this
  // must not do on a surface that redirects people to pay.
  for (const detail of [{}, { session_id: "" }, { session_id: 7 }, { session_id: null }]) {
    const rec = recorder();
    let retrievals = 0;
    const response = await withDoors(
      rec,
      { ...HAPPY_DOORS, open_checkout_intent: inProgress(detail) },
      () => handleCheckoutPost(postRequest(), {
        ...deps(rec),
        retrieveSession: async (id: string) => { retrievals += 1; return { id, status: "open" as const, url: SESSION_URL }; },
      }),
    );
    assert.equal(readFlash(response).kind, "checkout_in_progress", JSON.stringify(detail));
    assert.equal(retrievals, 0, "Stripe was asked about a Session the door never named");
  }
});

test("#628: a resume that cannot reach Stripe tells the person WHICH kind of failure it was", async () => {
  // The split this ticket exists for, on the resume hop as well as the create
  // one: `unconfigured` is fixed by an operator and no number of retries
  // changes it; the other three are an outage and waiting genuinely helps.
  for (const [failure, expected] of [
    [new StripeSessionError("unconfigured", "STRIPE_SECRET_KEY is not configured"), "payments_misconfigured"],
    [new StripeSessionError("refused", "Stripe refused /checkout/sessions/x with status 500", 500), "stripe_unavailable"],
    [new StripeSessionError("transport", "the Stripe call did not complete: AbortError"), "stripe_unavailable"],
    [new StripeSessionError("malformed", "Stripe returned a Session with no id"), "stripe_unavailable"],
    [new Error("ECONNRESET"), "unavailable"],
  ] as const) {
    const rec = recorder();
    const said: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };
    let response: Response;
    try {
      response = await withDoors(
        rec,
        { ...HAPPY_DOORS, open_checkout_intent: inProgress() },
        () => handleCheckoutPost(postRequest(), {
          ...deps(rec),
          retrieveSession: async () => { throw failure; },
        }),
      );
    } finally {
      console.error = realError;
    }
    assert.equal(readFlash(response).kind, expected, String(failure));
    assert.equal(rec.stripeCalls.length, 0, "a failed resume created a Session");
    if (failure instanceof StripeSessionError) {
      assert.equal(said.length, 1, `expected one log line for ${failure.reason}`);
      assert.match(said[0] as string, new RegExp(failure.reason));
      assert.doesNotMatch(said[0] as string, /\b(sk|rk|pk)_(live|test)_/, "the logged line carries a key prefix");
    }
  }
});

test("#628: `capacity_reached` is its OWN card, and no Stripe call is made", async () => {
  // Admission is full. The card must not leave a pay control beside a door that
  // will refuse it — which is why this is not folded into the generic
  // `refused` arm, whose card carries the door's sentence and nothing else.
  const rec = recorder();
  const response = await withDoors(
    rec,
    {
      ...HAPPY_DOORS,
      open_checkout_intent: () => json({
        code: "CLR09",
        message: "admission is currently full",
        details: JSON.stringify({ reason: "capacity_reached", max_firms: 50, firms_count: 50 }),
      }, 400),
    },
    () => handleCheckoutPost(postRequest(), deps(rec)),
  );
  assert.equal(readFlash(response).kind, "capacity_reached");
  assert.equal(rec.stripeCalls.length, 0);
  assert.deepEqual(
    rec.doorCalls.map((c) => c.fn),
    ["open_checkout_intent"],
    "a full house still read the plan or stamped the intent",
  );
});

test("#628: a REAL Stripe outage still reads as an outage, not as a misconfiguration", async () => {
  // The must-not-red control for the split above. If every failure had simply
  // been renamed, the key-class cell would still pass while every genuine
  // outage started telling people to call support about a variable.
  const rec = recorder();
  const said: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };
  let response: Response;
  try {
    response = await withDoors(rec, HAPPY_DOORS, () =>
      handleCheckoutPost(postRequest(), {
        ...deps(rec),
        createSession: async () => {
          throw new StripeSessionError("refused", "Stripe refused the Checkout Session with status 503", 503);
        },
      }),
    );
  } finally {
    console.error = realError;
  }
  assert.equal(readFlash(response).kind, "stripe_unavailable");
  assert.match(said[0] as string, /stripe_unavailable \(refused\)/);
  // AND THE ONE-SHOT INTENT IS UNSTAMPED, so the retry the card invites is safe.
  assert.deepEqual(rec.doorCalls.filter((c) => c.fn === "record_checkout_session"), []);
});

// ===========================================================================
// #628 REVIEW — THE REDIRECT TARGET IS VALIDATED BEFORE ANYONE IS SENT TO IT
// ===========================================================================

test("#628 review — the hosted-checkout host check is an ALLOWLIST, anchored on a dot", async () => {
  // THE UNIT, DRIVEN DIRECTLY, because the interesting inputs are the ones a
  // route fixture cannot conveniently produce in bulk.
  for (const good of [
    "https://checkout.stripe.com/c/pay/cs_test_123",
    "https://checkout.stripe.com/pay/cs_live_628#fragment",
    "https://pay.stripe.com/x",
    "https://stripe.com/x",
  ]) {
    assert.equal(isStripeHostedCheckoutUrl(good), true, good);
  }
  for (const bad of [
    // THE SUFFIX TRAP. `endsWith("stripe.com")` waves this through; the dot
    // anchor is what makes the allowlist an allowlist.
    "https://evilstripe.com/c/pay/cs_test_123",
    "https://checkout.stripe.com.attacker.example/c/pay",
    // SCHEME. A payment page is https or it is not a payment page.
    "http://checkout.stripe.com/c/pay/cs_test_123",
    "javascript:alert(1)",
    "data:text/html,<h1>pay</h1>",
    // CREDENTIALS IN THE AUTHORITY — the classic way to make a URL LOOK like
    // one host while the browser resolves another.
    "https://checkout.stripe.com@attacker.example/pay",
    // NOT A URL AT ALL.
    "/c/pay/cs_test_123",
    "",
  ]) {
    assert.equal(isStripeHostedCheckoutUrl(bad), false, bad);
  }
});

test("#628 review — a RESUME to a non-Stripe URL is refused, and nobody is redirected", async () => {
  // THE DEFECT. `resumeCheckout` 303'd the browser to `live.url` taken straight
  // out of a JSON body — on the one route whose whole job is to send somebody
  // somewhere to type card details. "We trusted the upstream" is the sentence
  // at the start of every open-redirect post-mortem, and the value is a
  // REDIRECT TARGET derived from a third party's response.
  const rec = recorder();
  const response = await withDoors(
    rec,
    { ...HAPPY_DOORS, open_checkout_intent: inProgress() },
    () => handleCheckoutPost(postRequest(), {
      ...deps(rec),
      retrieveSession: async (id: string) => ({
        id,
        status: "open" as const,
        url: "https://evilstripe.com/c/pay/cs_live_628",
      }),
    }),
  );

  // NOT A REDIRECT TO IT. The card is the outage one, which is true in the only
  // sense that matters to the person: this app could not hand them a checkout
  // page it was willing to send them to.
  assert.equal(readFlash(response).kind, "stripe_unavailable");
  assert.notEqual(response.headers.get("location"), "https://evilstripe.com/c/pay/cs_live_628");
  // AND NOTHING WAS WRITTEN. A resume is a read plus a redirect; a refused one
  // is a read plus a card.
  assert.equal(rec.stripeCalls.length, 0, "a refused resume minted a Session");
  assert.deepEqual(rec.doorCalls.filter((c) => c.fn === "record_checkout_session"), []);
});

test("#628 review — a CREATED Session with a non-Stripe URL is refused BEFORE the stamp", async () => {
  // The same hazard on the create hop, and the order is the property: the check
  // runs before `record_checkout_session`, so a URL this app will not send
  // anyone to never spends the intent's one stampable Session slot.
  const rec = recorder();
  const response = await withDoors(rec, HAPPY_DOORS, () =>
    handleCheckoutPost(postRequest(), deps(rec, {
      createSession: async (r: CheckoutSessionRequest) => {
        rec.stripeCalls.push(r);
        return { id: "cs_test_123", url: "https://attacker.example/c/pay/cs_test_123" };
      },
    })),
  );

  assert.equal(readFlash(response).kind, "stripe_unavailable");
  assert.deepEqual(
    rec.doorCalls.filter((c) => c.fn === "record_checkout_session"),
    [],
    "a one-shot intent was stamped with a Session nobody will ever be sent to",
  );
});

// ===========================================================================
// #628 REVIEW — A BROKEN DEADLOCK IS "TRY AGAIN", NOT "UNAVAILABLE"
// ===========================================================================

test("#628 review — 40P01 / 40001 on a door reach the try_again card, and nothing is retried", async () => {
  // The DB fix round changes `claim_paid_firm`'s lock order and the applier's
  // arms, so two writers meeting is an ordinary event. PostgreSQL breaks it by
  // aborting one transaction WHOLE — nothing opened, nothing stamped, nothing
  // charged — and the honest next step is the same press again. `unavailable`
  // does not say that; `try_again` does, exactly as `workRoutes.ts` answers 409
  // `{error:'transient'}` on the work lane.
  for (const sqlstate of ["40P01", "40001"] as const) {
    const rec = recorder();
    const response = await withDoors(
      rec,
      { ...HAPPY_DOORS, open_checkout_intent: () => json({ code: sqlstate, message: "deadlock detected" }, 500) },
      () => handleCheckoutPost(postRequest(), deps(rec)),
    );
    assert.equal(readFlash(response).kind, "try_again", sqlstate);
    assert.equal(rec.stripeCalls.length, 0, `${sqlstate} reached Stripe`);
    assert.equal(
      rec.doorCalls.filter((c) => c.fn === "open_checkout_intent").length,
      1,
      `${sqlstate} was retried in-process`,
    );
  }

  // THE DISCRIMINATING CONTROL: an ordinary failure keeps `unavailable`, or
  // this arm would tell somebody to keep pressing through a state that pressing
  // will not fix.
  const rec = recorder();
  const response = await withDoors(
    rec,
    { ...HAPPY_DOORS, open_checkout_intent: () => json({ code: "58030", message: "io error" }, 500) },
    () => handleCheckoutPost(postRequest(), deps(rec)),
  );
  assert.equal(readFlash(response).kind, "unavailable", "a non-transient failure borrowed the try-again card");
});
