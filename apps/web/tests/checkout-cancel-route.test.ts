// `POST /checkout/cancel` — #628's fourth server entry, the one that ENDS a
// checkout.
//
// WHAT THESE CELLS ARE FOR. This route exists because `open_checkout_intent`
// allows one live Stripe Session per registration: the rule that stops a
// double-press from minting two subscriptions also traps anyone who opened a
// checkout they no longer want. A release valve on a money surface has to be
// exactly as disciplined as the surface itself, so every cell below asserts
// what did NOT happen as hard as what did — no door on a cross-origin request,
// no Stripe call before the door has decided, no identifier read out of the
// request, and no outcome that depends on a third party's uptime.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NextResponse } from "next/server";

import { handleCheckoutCancelPost } from "../app/(entry)/checkout/cancel/handler";
import { checkoutFlashCookie } from "@/lib/checkout/checkout-flash";
import { StripeSessionError } from "@/lib/checkout/stripe-session";
import { NO_CHECKOUT_PROGRESS } from "@/lib/registration/checkout-progress-reads";
import type { OwnRegistrationResult } from "@/lib/registration/server-reads";

const SUBJECT = "22222222-2222-2222-2222-222222222222";
const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const INTENT = "44444444-4444-4444-8444-444444444444";
const SESSION = "cs_test_628_cancel";
const ORIGIN = "https://app.clarabook.example";

function postRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/checkout/cancel`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      host: "app.clarabook.example",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    // A body the handler must never read. On THIS route the values would name
    // somebody else's live payment, which is why the route reads no body at
    // all rather than validating one.
    body: new URLSearchParams({
      registration: "99999999-9999-9999-9999-999999999999",
      intent: "88888888-8888-4888-8888-888888888888",
      session_id: "cs_somebody_elses_session",
    }),
  });
}

function openRegistration(over: Record<string, unknown> = {}): OwnRegistrationResult {
  return {
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
      ...over,
    }],
    context: { ok: false, reason: "no_membership" },
    checkoutProgress: { ...NO_CHECKOUT_PROGRESS, checkoutOpen: true, intentSessionId: SESSION },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { fn: string; args: Record<string, unknown> };

/** The doors are intercepted at `fetch`, not at the module boundary, so these
 *  cells drive the REAL `callDoor` transport — the status-before-CLR ordering
 *  and the refusal's detail discriminant included. A module stub would have
 *  proved the handler's branching and nothing about the wire. */
async function withDoors<T>(
  calls: Call[],
  answers: Record<string, () => Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const fn = /\/rpc\/([A-Za-z0-9_]+)/.exec(String(input))?.[1] ?? "";
    calls.push({ fn, args: JSON.parse(String(init?.body ?? "{}")) });
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

const LIVE_INTENT = {
  get_own_checkout_intent_session: () =>
    json([{ intent_id: INTENT, session_id: SESSION, status: "session_created" }]),
  cancel_checkout_intent: () => json({ status: "cancelled", session_id: SESSION }),
};

function readFlash(response: Response): Record<string, unknown> {
  const raw = (response as NextResponse).cookies.get(checkoutFlashCookie().name)?.value;
  assert.ok(raw, "no checkout flash cookie was set");
  const url = new URL(response.headers.get("location") as string);
  assert.equal(url.pathname, "/pending");
  assert.deepEqual([...url.searchParams.keys()], ["checkout"], "the URL must carry ONLY the marker");
  const payload = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(payload.nonce, url.searchParams.get("checkout"), "the cookie is not bound to the marker");
  return payload;
}

const deps = (over: Partial<{
  resolveSession: () => Promise<{ accessToken: string; subject: string; email: string | null } | null>;
  loadRegistration: () => Promise<OwnRegistrationResult>;
  expireSession: (sessionId: string) => Promise<void>;
}> = {}) => ({
  resolveSession: over.resolveSession
    ?? (async () => ({ accessToken: "tok", subject: SUBJECT, email: "aisyah@example.test" })),
  loadRegistration: over.loadRegistration ?? (async () => openRegistration()),
  expireSession: over.expireSession ?? (async () => {}),
  newOpKey: () => "op-key-fixture",
});

test("THE HAPPY PATH: the DOOR decides, THEN Stripe is asked to expire, then 303 /pending", async () => {
  // THE ORDER IS THE PROPERTY. Expiring the Stripe Session first would end a
  // hosted page for an intent the DB might then refuse to cancel, leaving the
  // applicant with a live intent pointing at a dead checkout — the exact
  // stranding this route exists to remove, manufactured by getting the order
  // backwards.
  const calls: Call[] = [];
  const expired: string[] = [];
  const response = await withDoors(calls, LIVE_INTENT, () =>
    handleCheckoutCancelPost(postRequest(), deps({
      expireSession: async (id) => {
        assert.deepEqual(
          calls.map((c) => c.fn),
          ["get_own_checkout_intent_session", "cancel_checkout_intent"],
          "Stripe was asked to expire before the door had decided",
        );
        expired.push(id);
      },
    })),
  );

  assert.equal(response.status, 303);
  assert.equal(readFlash(response).kind, "cancelled");
  assert.deepEqual(calls.map((c) => c.fn), ["get_own_checkout_intent_session", "cancel_checkout_intent"]);
  assert.deepEqual(expired, [SESSION], "the Session Stripe was asked to expire is not the door's");

  // NOTHING CAME FROM THE REQUEST. The body named a different registration, a
  // different intent and a different Session; none of them reached a door.
  assert.equal(calls[0]!.args.p_registration, REGISTRATION);
  assert.deepEqual(Object.keys(calls[0]!.args), ["p_registration"]);
  assert.equal(calls[1]!.args.p_intent, INTENT);
  assert.deepEqual(Object.keys(calls[1]!.args).sort(), ["p_intent", "p_op_key"]);
  assert.notEqual(calls[1]!.args.p_intent, "88888888-8888-4888-8888-888888888888");
});

test("cross-origin is 403 BEFORE the door, the session read or the registration read", async () => {
  const CROSS_ORIGIN: ReadonlyArray<Record<string, string>> = [
    { origin: "https://evil.example" },
    { origin: "null" },
    { origin: "https://app.clarabook.example", "sec-fetch-site": "cross-site" },
  ];
  for (const headers of CROSS_ORIGIN) {
    const calls: Call[] = [];
    let sessionReads = 0;
    let registrationReads = 0;
    let expiries = 0;
    const response = await withDoors(calls, LIVE_INTENT, () =>
      handleCheckoutCancelPost(postRequest(headers), {
        resolveSession: async () => { sessionReads += 1; return { accessToken: "t", subject: SUBJECT, email: null }; },
        loadRegistration: async () => { registrationReads += 1; return openRegistration(); },
        expireSession: async () => { expiries += 1; },
      }),
    );
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.deepEqual(calls, [], "a refused request reached a door");
    assert.equal(sessionReads, 0);
    assert.equal(registrationReads, 0);
    assert.equal(expiries, 0, "a cross-origin request reached Stripe");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("no session is a redirect to sign in, and no open registration is its own card — neither touches a door", async () => {
  const noSession: Call[] = [];
  const signIn = await withDoors(noSession, LIVE_INTENT, () =>
    handleCheckoutCancelPost(postRequest(), deps({ resolveSession: async () => null })),
  );
  assert.equal(signIn.status, 303);
  assert.equal(signIn.headers.get("location"), `${ORIGIN}/login`);
  assert.deepEqual(noSession, []);

  for (const [label, result] of [
    ["no rows at all", { ok: true, subject: SUBJECT, rows: [], context: { ok: false, reason: "no_membership" }, checkoutProgress: NO_CHECKOUT_PROGRESS } as OwnRegistrationResult],
    ["a decided registration", openRegistration({ status: "approved" })],
    ["somebody else's row", openRegistration({ applicant: "33333333-3333-3333-3333-333333333333" })],
    ["a malformed row", openRegistration({ id: 7 })],
    ["an unverifiable caller", { ok: false, reason: "no_session" } as OwnRegistrationResult],
  ] as const) {
    const calls: Call[] = [];
    const response = await withDoors(calls, LIVE_INTENT, () =>
      handleCheckoutCancelPost(postRequest(), deps({ loadRegistration: async () => result })),
    );
    assert.equal(readFlash(response).kind, "no_registration", label);
    assert.deepEqual(calls, [], `${label}: a door ran for a caller with no open registration`);
  }
});

test("NO INTENT TO CANCEL is its own card — not a failure, and not a door call", async () => {
  // No door refused anything and nothing failed. Calling this `unavailable`
  // would report a fault that did not happen, on the surface where a person is
  // already anxious about money.
  for (const answer of [() => json([]), () => json([null]), () => json([{ session_id: SESSION }]), () => json([{ intent_id: INTENT }])]) {
    const calls: Call[] = [];
    let expiries = 0;
    const response = await withDoors(calls, { ...LIVE_INTENT, get_own_checkout_intent_session: answer }, () =>
      handleCheckoutCancelPost(postRequest(), deps({ expireSession: async () => { expiries += 1; } })),
    );
    assert.equal(readFlash(response).kind, "nothing_to_cancel");
    assert.deepEqual(calls.map((c) => c.fn), ["get_own_checkout_intent_session"],
      "a partial or empty intent row still reached the cancel door");
    assert.equal(expiries, 0);
  }
});

test("`payment_in_flight` is its OWN card, and Stripe is never asked to expire anything", async () => {
  // The bank is mid-authorisation. Nobody — not the applicant, not this app —
  // may pull the rug out, and expiring the Session anyway would be this route
  // overruling the door that just refused it.
  const calls: Call[] = [];
  let expiries = 0;
  const response = await withDoors(
    calls,
    {
      ...LIVE_INTENT,
      cancel_checkout_intent: () => json({
        code: "CLR09",
        message: "a payment is in flight for this checkout",
        details: JSON.stringify({ reason: "payment_in_flight" }),
      }, 400),
    },
    () => handleCheckoutCancelPost(postRequest(), deps({ expireSession: async () => { expiries += 1; } })),
  );
  assert.equal(readFlash(response).kind, "payment_in_flight");
  assert.equal(expiries, 0, "a refused cancel still expired the Session at Stripe");
});

test("every OTHER door refusal renders VERBATIM — code and sentence, never re-worded", async () => {
  for (const [code, message, reason] of [
    ["CLR09", "this registration is already paid", "already_paid"],
    // CLR04 IS NO LONGER IN THIS TABLE — it has its own cell below. #628's DB
    // round collapsed "absent" and "foreign" into one `CLR04 not_your_intent`,
    // which makes the door's sentence wrong for the only way this route can
    // meet it. See the cell.
    ["CLR10", "an operation key is required", null],
  ] as const) {
    const calls: Call[] = [];
    let expiries = 0;
    const response = await withDoors(
      calls,
      {
        ...LIVE_INTENT,
        cancel_checkout_intent: () => json({
          code,
          message,
          ...(reason === null ? {} : { details: JSON.stringify({ reason }) }),
        }, 400),
      },
      () => handleCheckoutCancelPost(postRequest(), deps({ expireSession: async () => { expiries += 1; } })),
    );
    const flash = readFlash(response);
    assert.equal(flash.kind, "refused", message);
    assert.equal(flash.code, code);
    assert.equal(flash.message, message, "the door's sentence was re-worded");
    assert.equal(calls.filter((c) => c.fn === "cancel_checkout_intent").length, 1, "a refusal was retried");
    assert.equal(expiries, 0);
  }
});

test("#628's DB round — CLR04 not_your_intent is NOTHING TO CANCEL, not 'that is not yours'", async () => {
  // WHAT CHANGED AT THE DB END. `cancel_checkout_intent` used to distinguish an
  // ABSENT intent from a FOREIGN one; it now answers ONE refusal, `CLR04
  // not_your_intent`, for both — correctly, because a caller must not learn
  // from a refusal whether somebody else's intent exists.
  //
  // WHY THAT REFUSAL MUST NOT RENDER VERBATIM HERE, which is the whole point of
  // this cell. This route NEVER accepts an intent id: it names the one
  // `get_own_checkout_intent_session` just handed it, scoped to the caller
  // inside the door. So "not your intent" cannot mean a probe — it can only
  // mean the intent stopped being live between the read and the cancel (the
  // applier swept it, another tab cancelled it). Rendering the door's sentence
  // verbatim would tell somebody their own checkout belongs to someone else.
  // The truthful card is the one they get when the read found nothing at all.
  const calls: Call[] = [];
  let expiries = 0;
  const response = await withDoors(
    calls,
    {
      ...LIVE_INTENT,
      cancel_checkout_intent: () => json({
        code: "CLR04",
        message: "not your checkout intent",
        details: JSON.stringify({ reason: "not_your_intent" }),
      }, 400),
    },
    () => handleCheckoutCancelPost(postRequest(), deps({ expireSession: async () => { expiries += 1; } })),
  );
  const flash = readFlash(response);
  assert.equal(flash.kind, "nothing_to_cancel", "the door's 'not yours' sentence reached the applicant");
  // NOTHING WAS RETRIED and Stripe was never asked to expire anything: a
  // refusal is the DB's considered answer, whichever card it chooses.
  assert.equal(calls.filter((c) => c.fn === "cancel_checkout_intent").length, 1, "a refusal was retried");
  assert.equal(expiries, 0, "a refused cancel still expired the Session at Stripe");
});

test("A FAILED STRIPE EXPIRY DOES NOT UN-CANCEL THE INTENT, and the log carries no identifier", async () => {
  // THE PROPERTY THAT MATTERS MOST ON THIS ROUTE. The door has already decided;
  // re-deciding on a third party's availability would make the database's own
  // answer depend on Stripe's uptime. Money that lands anyway is the applier's
  // `paid_after_terminal` case, which exists precisely because this call is not
  // guaranteed to win the race.
  for (const failure of [
    new StripeSessionError("unconfigured", "STRIPE_SECRET_KEY is not configured"),
    new StripeSessionError("refused", "Stripe refused /checkout/sessions/x/expire with status 400", 400),
    new StripeSessionError("transport", "the Stripe call did not complete: AbortError"),
    new Error("ECONNRESET"),
  ]) {
    const said: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };
    let response: Response;
    const calls: Call[] = [];
    try {
      response = await withDoors(calls, LIVE_INTENT, () =>
        handleCheckoutCancelPost(postRequest(), deps({
          expireSession: async () => { throw failure; },
        })),
      );
    } finally {
      console.error = realError;
    }
    assert.equal(readFlash(response).kind, "cancelled", String(failure));
    assert.deepEqual(calls.map((c) => c.fn), ["get_own_checkout_intent_session", "cancel_checkout_intent"]);
    // The operator's answer is one line, and it says the intent stayed
    // cancelled — a line that merely said "expiry failed" would leave a reader
    // wondering whether the cancel had landed.
    assert.equal(said.length, 1, `expected exactly one log line, saw ${said.length}`);
    const line = said[0] as string;
    assert.match(line, /stays cancelled/i, "the logged line does not say the door's answer stood");
    // NO SESSION ID, NO KEY. The id names a payment attempt; the line goes to a
    // platform log a shipper and a support ticket can both reach.
    assert.equal(line.includes(SESSION), false, "the logged line carries the Session id");
    assert.doesNotMatch(line, /\b(sk|rk|pk)_(live|test)_/, "the logged line carries a key prefix");
  }
});

test("A REPLAY IS A SUCCESS, and the Session id falls back to the one the read observed", async () => {
  // `{status, replay:true}` is what a second press — or a retry whose first
  // response was lost — receives, and it legitimately carries no Session. A
  // person cannot tell a first cancel from a second, the world is in the same
  // state either way, and inventing a different sentence for the retry would be
  // reporting the mechanism instead of the outcome.
  const calls: Call[] = [];
  const expired: string[] = [];
  const response = await withDoors(
    calls,
    { ...LIVE_INTENT, cancel_checkout_intent: () => json({ status: "cancelled", replay: true }) },
    () => handleCheckoutCancelPost(postRequest(), deps({
      expireSession: async (id) => { expired.push(id); },
    })),
  );
  assert.equal(readFlash(response).kind, "cancelled");
  assert.deepEqual(expired, [SESSION], "the replay lost the Session the read had already observed");
});

test("AN INTENT WITH NO SESSION cancels and never reaches Stripe at all", async () => {
  // An intent that was opened and never stamped has nothing at Stripe to
  // expire. Calling the expiry endpoint with an empty id would be this route
  // inventing a request out of an absence.
  const calls: Call[] = [];
  let expiries = 0;
  const response = await withDoors(
    calls,
    {
      get_own_checkout_intent_session: () => json([{ intent_id: INTENT, session_id: null, status: "open" }]),
      cancel_checkout_intent: () => json({ status: "cancelled", session_id: null }),
    },
    () => handleCheckoutCancelPost(postRequest(), deps({ expireSession: async () => { expiries += 1; } })),
  );
  assert.equal(readFlash(response).kind, "cancelled");
  assert.equal(expiries, 0, "Stripe was called for an intent that was never stamped");
});

test("a failed registration read is `unavailable`, and a refused intent read is the door's own sentence", async () => {
  const thrown: Call[] = [];
  const failed = await withDoors(thrown, LIVE_INTENT, () =>
    handleCheckoutCancelPost(postRequest(), deps({
      loadRegistration: async () => { throw new Error("ECONNRESET"); },
    })),
  );
  assert.equal(readFlash(failed).kind, "unavailable");
  assert.deepEqual(thrown, []);

  const calls: Call[] = [];
  const refused = await withDoors(
    calls,
    { ...LIVE_INTENT, get_own_checkout_intent_session: () => json({ code: "CLR04", message: "not your registration request" }, 403) },
    () => handleCheckoutCancelPost(postRequest(), deps()),
  );
  const flash = readFlash(refused);
  assert.equal(flash.kind, "refused");
  assert.equal(flash.code, "CLR04");
  assert.equal(flash.message, "not your registration request");
  assert.deepEqual(calls.map((c) => c.fn), ["get_own_checkout_intent_session"],
    "a refused read still reached the cancel door");
});

test("a door that REPLAYS an already-terminal intent is reported with the DOOR'S word, not ours", async () => {
  // `cancel_checkout_intent` replays `{status, replay:true}` for an intent that
  // was already `expired` or `cancelled`, and it returns that intent's REAL
  // status. Reachable only through the race between the intent read and this
  // call — the applier expiring the Session in between — which is exactly why
  // it is handled: telling somebody "your checkout was cancelled" about a
  // checkout that expired is this app inventing an act it did not perform.
  const calls: Call[] = [];
  const expired = await withDoors(
    calls,
    { ...LIVE_INTENT, cancel_checkout_intent: () => json({ status: "expired", session_id: SESSION, replay: true }) },
    () => handleCheckoutCancelPost(postRequest(), deps()),
  );
  assert.equal(readFlash(expired).kind, "checkout_expired");

  // MUST-NOT-RED CONTROL: a genuine cancellation still reads as one, so the arm
  // above is discriminating rather than a blanket rewrite.
  const cancelledCalls: Call[] = [];
  const cancelled = await withDoors(
    cancelledCalls,
    { ...LIVE_INTENT, cancel_checkout_intent: () => json({ status: "cancelled", session_id: SESSION, replay: true }) },
    () => handleCheckoutCancelPost(postRequest(), deps()),
  );
  assert.equal(readFlash(cancelled).kind, "cancelled");
});
