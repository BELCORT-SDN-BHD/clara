// FS-4 C-6 Lane B — WHICH SUCCESS CARD, decided once.
//
// The paint-only GET (`/checkout/success`) and the POST that runs the door
// (`/checkout/success/claim`) must agree about what state the applicant is in:
// if the page offered a control the route then refuses, or the route ran a
// door the page said was unavailable, the person would be reading one story
// and the database another. This is the ONE mapper both call, so they cannot
// disagree by construction (review law 3 — a second copy of a decision is free
// to drift from the first).
//
// EVERY ARM IS A POSITIVE READ. `claimable` requires an observed unconsumed
// payment row; `already_open` requires an observed non-null `firm_id`;
// `awaiting_payment` is the honest name for "your registration is open, we saw
// no payment row" and is NEVER inferred into "you did not pay" — Stripe may
// simply not have delivered yet, which is A-M4's whole point. A read that
// failed is `unavailable`, never any of the three.

import { isRegistrationRequestRow } from "@/lib/registration/holding-state";
import {
  checkoutStandingFrom,
  waitingActsFrom,
  type CheckoutProgress,
} from "@/lib/registration/checkout-progress-reads";
import type { OwnRegistrationResult } from "@/lib/registration/server-reads";

/**
 * #628 WIDENED THIS FROM FIVE ARMS TO TEN, and every one of the five new arms
 * is a fact the DB now states rather than a shade of "we are not sure".
 *
 * The old `awaiting_payment` carried FOUR different worlds under one sentence:
 * a Session that was opened and never paid, a payment the bank is still
 * confirming, a payment that FAILED, and a checkout the applicant abandoned.
 * A person in the third of those was told "we have not seen your payment yet,
 * it usually resolves on its own" — about a payment that was declined and
 * never will. Migration 0186's `checkout_intents.status` is what makes the four
 * separable, and separating them is the whole of this ticket's §2.
 */
export type CheckoutSuccessDecision =
  | { readonly kind: "claimable"; readonly registration: string }
  | { readonly kind: "already_open" }
  /** The bank is confirming an asynchronous payment. A WAIT with an end, not a
   *  failure — and never a claim control, because there is no payment row yet. */
  | {
      readonly kind: "processing";
      readonly statusAt: string | null;
      readonly registration: string;
    }
  /** A Stripe Session exists and nothing has come back about it. The honest
   *  name for "we have not been told", and NEVER for "you did not pay". */
  | {
      readonly kind: "awaiting_payment";
      readonly statusAt: string | null;
      /** Non-null ⇒ there is a live Session to cancel, so the card may offer
       *  "cancel and start again". Null ⇒ it must not — either the intent was
       *  never stamped, or (the #628 review's defect) the money already landed
       *  and `cancel_checkout_intent` would refuse `already_paid`. Derived by
       *  `waitingActsFrom`, never read straight off `intentSessionId`. */
      readonly sessionId: string | null;
      readonly registration: string;
    }
  /** The payment was refused. Terminal, and the only arm whose next step is a
   *  NEW checkout rather than waiting. */
  | { readonly kind: "payment_failed"; readonly reason: string | null }
  /** The Session ran out of time before it was paid. `reason` is the DB's own
   *  machine token for WHY, which is `processing_timeout` when the applier
   *  swept a `processing` intent that had not been answered for a day — a
   *  different sentence from an ordinary hosted-page expiry, and the person is
   *  owed it. */
  | { readonly kind: "expired"; readonly reason: string | null }
  /** The applicant cancelled it themselves, here or in another tab. */
  | { readonly kind: "cancelled" }
  /** Admission is full. Rendered with NO pay control: `open_checkout_intent`
   *  and `claim_paid_firm` both refuse `capacity_reached`, and offering a
   *  payment the door will refuse is how somebody believes they bought a firm. */
  | { readonly kind: "capacity_full"; readonly registration: string }
  | { readonly kind: "no_registration" }
  | { readonly kind: "unavailable" }
  /** #628 review — the DATABASE broke a deadlock or a serialization conflict
   *  (SQLSTATE 40P01 / 40001) under this request. NOTHING was changed, and a
   *  fresh attempt is the honest next step — which is a different sentence from
   *  `unavailable`'s "something went wrong reading where your application
   *  stands". `workRoutes.ts` draws the same line for the work lane. */
  | { readonly kind: "try_again" };

/**
 * `progress` is the applicant's OWN checkout progress
 * (`clara.get_own_checkout_progress`), which is only read when the newest row
 * is a validated, subject-bound OPEN registration — every other status owes no
 * checkout read, exactly as `server-reads.ts` already gates it.
 */
export function checkoutSuccessDecisionFrom(
  result: OwnRegistrationResult,
  progress: CheckoutProgress,
): CheckoutSuccessDecision {
  if (!result.ok) return { kind: "unavailable" };
  const newest = result.rows[0];
  if (newest === undefined) return { kind: "no_registration" };
  if (!isRegistrationRequestRow(newest)) return { kind: "unavailable" };
  // The subject binding is the same one `holdingStateFrom` applies: a row that
  // is not provably this caller's is not evidence about this caller.
  if (newest.applicant !== result.subject) return { kind: "unavailable" };

  // A firm on the registration is terminal and outranks everything: the door
  // already ran (here, in another tab, or on a retry whose response was lost),
  // and `claim_paid_firm` would simply replay.
  if (typeof newest.firm_id === "string" && newest.firm_id.length > 0) {
    return { kind: "already_open" };
  }
  if (newest.status !== "open") return { kind: "no_registration" };

  // THE ORDER BELOW IS THE DECISION, and each step outranks the next for a
  // stated reason rather than by accident of writing.
  //
  // 1. AN OBSERVED UNCONSUMED PAYMENT OUTRANKS EVERYTHING, INCLUDING A FULL
  //    HOUSE. This is the one arm where the applicant's money is already in
  //    Clara's hands, and a `capacity_full` card shown over it would take
  //    somebody's payment and then tell them the door is closed with no way
  //    forward. `claim_paid_firm` may still refuse `capacity_reached` — that is
  //    the DB's call to make on its own authority, and its refusal renders
  //    verbatim — but this page will not pre-empt it by hiding the claim.
  if (progress.paidUnconsumed) return { kind: "claimable", registration: newest.id };

  // 2. THE INTENT'S OWN STATUS, when it states one. `checkoutStandingFrom` is
  //    the single mapper `/pending` reads too, so the two surfaces cannot
  //    disagree about which wait a person is in (review law 3).
  const standing = checkoutStandingFrom(progress);
  if (standing === "processing") {
    return { kind: "processing", statusAt: progress.intentStatusAt, registration: newest.id };
  }
  if (standing === "payment_failed") return { kind: "payment_failed", reason: progress.intentStatusReason };
  if (standing === "expired") return { kind: "expired", reason: progress.intentStatusReason };
  if (standing === "cancelled") return { kind: "cancelled" };
  if (standing === "awaiting_payment") {
    return {
      kind: "awaiting_payment",
      statusAt: progress.intentStatusAt,
      // NOT `intentSessionId`. `paid` and `consumed` land on this arm with a
      // stamped Session, and offering to cancel a payment that already landed
      // is a control the door refuses — see `waitingActsFrom`.
      sessionId: waitingActsFrom(progress).cancelSessionId,
      registration: newest.id,
    };
  }

  // 3. CAPACITY, only once no payment and no live intent is in the way. A
  //    person mid-payment is not helped by being told the house is full; a
  //    person about to start one is.
  if (progress.capacityFull) return { kind: "capacity_full", registration: newest.id };

  // 4. THE PRE-#628 READING, unchanged, and it is what an older door still
  //    produces: an open registration with no observed payment is AWAITING, and
  //    that is never inferred into "you did not pay".
  return {
    kind: "awaiting_payment",
    statusAt: progress.intentStatusAt,
    sessionId: waitingActsFrom(progress).cancelSessionId,
    registration: newest.id,
  };
}
