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
import type { CheckoutProgress } from "@/lib/registration/checkout-progress-reads";
import type { OwnRegistrationResult } from "@/lib/registration/server-reads";

export type CheckoutSuccessDecision =
  | { readonly kind: "claimable"; readonly registration: string }
  | { readonly kind: "already_open" }
  | { readonly kind: "awaiting_payment" }
  | { readonly kind: "no_registration" }
  | { readonly kind: "unavailable" };

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
  return progress.paidUnconsumed
    ? { kind: "claimable", registration: newest.id }
    : { kind: "awaiting_payment" };
}
