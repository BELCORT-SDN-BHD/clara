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

const PAID: CheckoutProgress = { checkoutOpen: true, paidUnconsumed: true };
const UNPAID: CheckoutProgress = { checkoutOpen: true, paidUnconsumed: false };

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
  assert.deepEqual(checkoutSuccessDecisionFrom(result(), UNPAID), { kind: "awaiting_payment" });
  assert.deepEqual(checkoutSuccessDecisionFrom(result(), NO_CHECKOUT_PROGRESS), {
    kind: "awaiting_payment",
  });
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
