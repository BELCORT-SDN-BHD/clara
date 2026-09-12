// The ONE mapper the paint-only success GET and its claim POST both call.
//
// WHY IT IS ONE FUNCTION AND WHY THAT IS CELLED. If the page offered a control
// the route then refused, or the route ran a tenant-creating door the page had
// called unavailable, the person would be reading one story and the database
// another. These cells drive the shared mapper, so a second copy of the
// decision cannot appear without one of them going red.
//
// EVERY ARM IS A POSITIVE READ. `awaiting_payment` in particular is NEVER
// "you did not pay" — Stripe may simply not have delivered yet, which is
// exactly the A-M4 stranding case the success card must not hide.

import assert from "node:assert/strict";
import { test } from "node:test";

import { checkoutSuccessDecisionFrom } from "./success-state";
import { NO_CHECKOUT_PROGRESS, type CheckoutProgress } from "../registration/checkout-progress-reads";
import type { OwnRegistrationResult } from "../registration/server-reads";

const SUBJECT = "22222222-2222-2222-2222-222222222222";
const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const FIRM = "44444444-4444-4444-4444-444444444444";

const PAID: CheckoutProgress = { ...NO_CHECKOUT_PROGRESS, checkoutOpen: true, paidUnconsumed: true };
const UNPAID: CheckoutProgress = { ...NO_CHECKOUT_PROGRESS, checkoutOpen: true, paidUnconsumed: false };

function result(over: Record<string, unknown> = {}, subject = SUBJECT): OwnRegistrationResult {
  return {
    ok: true,
    subject,
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
    checkoutProgress: PAID,
  };
}

test("CLAIMABLE requires an OBSERVED unconsumed payment — and carries the registration", () => {
  assert.deepEqual(checkoutSuccessDecisionFrom(result(), PAID), {
    kind: "claimable",
    registration: REGISTRATION,
  });
});

test("A-M4: an open registration with NO observed payment is awaiting_payment, never 'no payment'", () => {
  // The distinction is the whole point. "We have not seen it yet" is true;
  // "you did not pay" is a claim about the world this app cannot make, and it
  // is the sentence that would send a paying customer away.
  //
  // #628 added three fields to this arm and changed NONE of that reading: the
  // status time and the session id are what let the card say "since when" and
  // whether a cancel control has anything to cancel, and the registration is
  // the reference support needs once the bounded wait gives up.
  assert.deepEqual(checkoutSuccessDecisionFrom(result(), UNPAID), {
    kind: "awaiting_payment",
    statusAt: null,
    sessionId: null,
    registration: REGISTRATION,
  });
  assert.deepEqual(checkoutSuccessDecisionFrom(result(), NO_CHECKOUT_PROGRESS), {
    kind: "awaiting_payment",
    statusAt: null,
    sessionId: null,
    registration: REGISTRATION,
  });
});

// ===========================================================================
// #628 — THE FIVE FACES THE OLD `awaiting_payment` WAS HIDING
// ===========================================================================

/** Progress for an open registration with NO observed payment, carrying one
 *  intent status. Every cell below differs from the last ONLY in the status,
 *  which is what makes each one about the status rather than about a fixture. */
const withStatus = (over: Partial<CheckoutProgress>): CheckoutProgress => ({
  ...NO_CHECKOUT_PROGRESS,
  checkoutOpen: true,
  ...over,
});

test("#628: each intent status reaches its OWN face, and no two share one", () => {
  // THE DEFECT THIS CELL EXISTS FOR. Before 0186 all five of these were
  // `awaiting_payment`, whose copy says the payment "keeps trying on its own" —
  // told to a person whose card was DECLINED, whose checkout EXPIRED, and to a
  // person who CANCELLED it themselves. Three lies from one missing column.
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: "processing", intentStatusAt: "2026-09-12T04:30:00.000Z" })),
    { kind: "processing", statusAt: "2026-09-12T04:30:00.000Z", registration: REGISTRATION },
  );
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: "payment_failed", intentStatusReason: "card_declined" })),
    { kind: "payment_failed", reason: "card_declined" },
  );
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: "expired" })),
    { kind: "expired" },
  );
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: "cancelled" })),
    { kind: "cancelled" },
  );
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: "session_created", intentSessionId: "cs_test_628" })),
    { kind: "awaiting_payment", statusAt: null, sessionId: "cs_test_628", registration: REGISTRATION },
  );
});

test("#628: `paid` and `consumed` with NO unconsumed payment row are a WAIT, never a claim", () => {
  // The intent says money landed; the payment probe saw nothing claimable. The
  // one thing this must not do is offer the claim control — `claim_paid_firm`
  // would refuse, and a person who pressed it would read a refusal about a
  // payment they can see succeeded. `checkoutStandingFrom`'s own header carries
  // the two ways this state is reached.
  for (const status of ["paid", "consumed"] as const) {
    assert.equal(
      checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: status })).kind,
      "awaiting_payment",
      status,
    );
  }
});

test("#628: AN OBSERVED UNCONSUMED PAYMENT OUTRANKS EVERY STATUS, INCLUDING A FULL HOUSE", () => {
  // This is the arm where the applicant's money is already in Clara's hands.
  // A capacity card over it would take somebody's payment and then close the
  // door with no way forward; a `payment_failed` card over it would tell
  // somebody their successful payment failed. The door still judges the claim
  // on its own authority — this page simply refuses to pre-empt it.
  for (const status of ["processing", "payment_failed", "expired", "cancelled", "session_created"] as const) {
    assert.deepEqual(
      checkoutSuccessDecisionFrom(result(), { ...withStatus({ intentStatus: status }), paidUnconsumed: true, capacityFull: true }),
      { kind: "claimable", registration: REGISTRATION },
      status,
    );
  }
});

test("#628: capacity_full renders only when NOTHING is in flight", () => {
  // A person mid-payment is not helped by being told the house is full; a
  // person about to start one is. So capacity ranks BELOW every live intent
  // status and below an observed payment, and above nothing else.
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), { ...NO_CHECKOUT_PROGRESS, capacityFull: true }),
    { kind: "capacity_full" },
  );
  assert.equal(
    checkoutSuccessDecisionFrom(result(), withStatus({ intentStatus: "processing", capacityFull: true })).kind,
    "processing",
    "a full house was reported over a payment the bank is confirming",
  );
});

test("#628: the pre-0186 reading is UNCHANGED when the door states no status", () => {
  // The migration window, from the success page's side. An older door yields
  // `intentStatus: null`, and this page must render exactly what it rendered
  // before the column existed — never `no_registration`, never a blank.
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result(), { ...NO_CHECKOUT_PROGRESS, checkoutOpen: true }),
    { kind: "awaiting_payment", statusAt: null, sessionId: null, registration: REGISTRATION },
  );
});

test("A FIRM ON THE REGISTRATION outranks everything, including an unconsumed payment", () => {
  // The door already ran — here, in another tab, or on a retry whose response
  // was lost. Offering the claim control again would invite a click whose only
  // possible outcome is a replay the person cannot tell from a first run.
  assert.deepEqual(checkoutSuccessDecisionFrom(result({ firm_id: FIRM }), PAID), {
    kind: "already_open",
  });
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result({ firm_id: FIRM, status: "approved" }), UNPAID),
    { kind: "already_open" },
  );
});

test("a decided registration with no firm is not claimable", () => {
  for (const status of ["approved", "rejected", "paid", "something_new"]) {
    assert.deepEqual(
      checkoutSuccessDecisionFrom(result({ status }), PAID),
      { kind: "no_registration" },
      status,
    );
  }
});

test("SUBJECT BINDING: a row that is not provably this caller's is no evidence about them", () => {
  // Same discipline `holdingStateFrom` applies. A row read under one identity
  // and rendered under another is the shape a cross-tenant leak takes on a
  // pre-firm surface, where there is no `jwt_firm()` to catch it.
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result({ applicant: "33333333-3333-3333-3333-333333333333" }), PAID),
    { kind: "unavailable" },
  );
  assert.deepEqual(
    checkoutSuccessDecisionFrom(result({}, "33333333-3333-3333-3333-333333333333"), PAID),
    { kind: "unavailable" },
  );
});

test("a failed read and a malformed row are UNAVAILABLE — never 'nothing to do'", () => {
  assert.deepEqual(
    checkoutSuccessDecisionFrom({ ok: false, reason: "no_session" }, PAID),
    { kind: "unavailable" },
  );
  // `firm_name: ""` is deliberately NOT in this list. The shared validator
  // (`isRegistrationRequestRow`) accepts any string there, and widening it is
  // not this lane's call — nor would it matter on this surface, where
  // `claim_paid_firm` reads the name INSIDE the door and nothing here renders
  // it. Asserting a stricter contract than the validator actually has would be
  // a cell claiming more than the code closes (裁-113).
  for (const bad of [{ id: 7 }, { applicant: null }, { status: 42 }, { created_at: 0 }]) {
    assert.deepEqual(
      checkoutSuccessDecisionFrom(result(bad), PAID),
      { kind: "unavailable" },
      JSON.stringify(bad),
    );
  }
});

test("zero rows is NO REGISTRATION, which is a different fact from a read that failed", () => {
  const empty: OwnRegistrationResult = {
    ok: true,
    subject: SUBJECT,
    rows: [],
    context: { ok: false, reason: "no_membership" },
    checkoutProgress: NO_CHECKOUT_PROGRESS,
  };
  assert.deepEqual(checkoutSuccessDecisionFrom(empty, NO_CHECKOUT_PROGRESS), {
    kind: "no_registration",
  });
});

test("an EMPTY firm_id string is not a firm", () => {
  // A blank is the shape a bad projection produces, and reading it as "your
  // firm is open" would strand a person who still has a claim to make.
  assert.deepEqual(checkoutSuccessDecisionFrom(result({ firm_id: "" }), PAID), {
    kind: "claimable",
    registration: REGISTRATION,
  });
});
