// The checkout refusal flash — the mechanism that carries a money-surface
// refusal across one redirect without ever putting it in a URL.
//
// WHY THE PARSER IS CELLED SEPARATELY FROM THE ROUTES. The cookie is the only
// thing standing between "the door refused you, here is what it said" and a
// link an attacker can hand a victim ("your payment failed, click here"). The
// nonce binding is what makes a forged or replayed cookie inert, and it is a
// pure function, so it gets driven directly rather than only through a route.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkoutFlashCookie,
  checkoutFlashMaxAgeSeconds,
  parseCheckoutFlash,
  type CheckoutFlashOutcome,
} from "./checkout-flash";

const NONCE = "6f1c2f1a-0d1a-4b3e-9f2a-1c2d3e4f5a6b";
const wrap = (payload: Record<string, unknown>) => JSON.stringify({ nonce: NONCE, ...payload });

/**
 * ONE SAMPLE PER KIND, TYPED AS A TOTAL MAP — so a kind added to the union
 * without a sample is a TYPE error rather than a silently untested arm.
 *
 * THE HOLE THIS CLOSES WAS REAL AND WAS ALREADY OPEN: `already_member` shipped
 * in #517 and never appeared in the round-trip list below, so the parser arm
 * that admits it had no cell at all. #628 added seven more kinds, which is
 * seven more chances for the same omission; the map's own type is what makes
 * the omission impossible rather than merely unlikely.
 */
const SAMPLES: Record<CheckoutFlashOutcome["kind"], CheckoutFlashOutcome> = {
  refused: { kind: "refused", code: "CLR09", message: "the data processing agreement is not signed" },
  no_origin_digest: { kind: "no_origin_digest" },
  stripe_unavailable: { kind: "stripe_unavailable" },
  payments_misconfigured: { kind: "payments_misconfigured" },
  checkout_in_progress: { kind: "checkout_in_progress" },
  checkout_expired: { kind: "checkout_expired" },
  capacity_reached: { kind: "capacity_reached" },
  payment_in_flight: { kind: "payment_in_flight" },
  cancelled: { kind: "cancelled" },
  nothing_to_cancel: { kind: "nothing_to_cancel" },
  plan_rotated: { kind: "plan_rotated" },
  no_registration: { kind: "no_registration" },
  already_member: { kind: "already_member" },
  unavailable: { kind: "unavailable" },
  // #621's own arm, and the ONLY one carrying a list: the door's `detail.missing`.
  legal_not_accepted: { kind: "legal_not_accepted", missing: ["terms", "dpa"] },
};

test("every typed outcome round-trips, and the nonce comes back with it", () => {
  const outcomes: CheckoutFlashOutcome[] = [
    ...Object.values(SAMPLES),
    { kind: "legal_not_accepted", missing: [] },
  ];
  for (const outcome of outcomes) {
    assert.deepEqual(parseCheckoutFlash(wrap({ ...outcome }), NONCE), { nonce: NONCE, ...outcome });
  }
  // VACUITY CONTROL: the map must actually be covering every arm the parser
  // admits, not a handful of them.
  assert.ok(outcomes.length >= 15, `only ${outcomes.length} outcomes were exercised`);
});

test("THE NONCE BINDING: a mismatched, absent or blank marker is exactly as untrustworthy as no cookie", () => {
  const good = wrap({ kind: "unavailable" });
  assert.equal(parseCheckoutFlash(good, "a-different-marker"), null);
  assert.equal(parseCheckoutFlash(good, undefined), null);
  assert.equal(parseCheckoutFlash(good, ""), null);
  assert.equal(parseCheckoutFlash(undefined, NONCE), null);
  assert.equal(parseCheckoutFlash("", NONCE), null);
  // MUST-NOT-RED CONTROL: the matched pair still parses, so the refusals above
  // are the binding rather than a parser that rejects everything.
  assert.deepEqual(parseCheckoutFlash(good, NONCE), { nonce: NONCE, kind: "unavailable" });
});

test("#621: the outstanding-agreement list is DECODED, never echoed — an unknown kind is dropped", () => {
  // The list reaches this card from a door's `detail`, so it is transport
  // output like any other: a kind this build cannot name would be printed as a
  // bullet nobody can act on. Dropping it leaves the honest general sentence,
  // and the legal stage itself is the authority on what is outstanding.
  assert.deepEqual(
    parseCheckoutFlash(wrap({ kind: "legal_not_accepted", missing: ["terms", "privacy", "dpa", "terms"] }), NONCE),
    { nonce: NONCE, kind: "legal_not_accepted", missing: ["terms", "dpa"] },
    "an unknown kind, or a duplicate, survived the decode",
  );
  for (const missing of [undefined, null, "terms", 3, {}]) {
    assert.deepEqual(
      parseCheckoutFlash(wrap({ kind: "legal_not_accepted", missing }), NONCE),
      { nonce: NONCE, kind: "legal_not_accepted", missing: [] },
      `a ${JSON.stringify(missing)} list must degrade to the plain sentence, never fail the whole card`,
    );
  }
});

test("a malformed, unknown or over-long payload fails closed", () => {
  for (const raw of [
    "not json",
    "null",
    "[]",
    '"a string"',
    wrap({ kind: "some_new_kind" }),
    wrap({}),
    JSON.stringify({ kind: "unavailable" }), // no nonce at all
    JSON.stringify({ nonce: "", kind: "unavailable" }),
    // `refused` without its two required fields, or with the wrong types.
    wrap({ kind: "refused" }),
    wrap({ kind: "refused", code: "CLR09" }),
    wrap({ kind: "refused", message: "no code" }),
    wrap({ kind: "refused", code: 9, message: "numeric code" }),
    wrap({ kind: "refused", code: "CLR09", message: "" }),
    // Bounded so the cookie cannot be grown into a storage channel.
    wrap({ kind: "refused", code: "CLR09", message: "x".repeat(401) }),
    wrap({ kind: "refused", code: "C".repeat(17), message: "long code" }),
  ]) {
    assert.equal(parseCheckoutFlash(raw, NONCE), null, raw.slice(0, 60));
  }
  // The bounds admit the real thing: the longest sentence `0163` raises is far
  // inside them, and a 400-character message still parses.
  assert.ok(parseCheckoutFlash(wrap({ kind: "refused", code: "CLR09", message: "x".repeat(400) }), NONCE));
});

test("the cookie NAME and its Secure flag are ONE decision", () => {
  // `__Host-` is rejected outright by the browser without `Secure` + HTTPS, so
  // a build that set them independently would ship a cookie the browser drops
  // — and every refusal would silently render as a generic state.
  const prod = checkoutFlashCookie({ NODE_ENV: "production" });
  assert.deepEqual(prod, { name: "__Host-clara-checkout-flash", secure: true });
  for (const env of [
    { NODE_ENV: "development" },
    { NODE_ENV: "test", CLARA_ALLOW_INSECURE_LOOPBACK: "1" },
  ]) {
    const dev = checkoutFlashCookie(env);
    assert.equal(dev.secure, false, JSON.stringify(env));
    assert.equal(dev.name.startsWith("__Host-"), false, JSON.stringify(env));
  }
  // A test process with no loopback opt-in still gets the strict pair.
  assert.deepEqual(checkoutFlashCookie({ NODE_ENV: "test" }), {
    name: "__Host-clara-checkout-flash",
    secure: true,
  });
});

test("the cookie is short-lived, and its name is distinct from the confirm flash", async () => {
  assert.ok(checkoutFlashMaxAgeSeconds() > 0 && checkoutFlashMaxAgeSeconds() <= 600);
  const { confirmFlashCookie } = await import("../../app/(entry)/auth/confirm/confirm-flash");
  assert.notEqual(
    checkoutFlashCookie({ NODE_ENV: "production" }).name,
    confirmFlashCookie({ NODE_ENV: "production" }).name,
    "one cookie for two surfaces would let a confirm refusal render as a checkout refusal",
  );
});
