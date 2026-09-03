// THE §2.1 CHECKOUT-PROGRESS PROBE — repointed by FS-4 C-6 Lane B from two
// relation reads onto ONE door, `clara.get_own_checkout_progress(uuid)`.
//
// WHY THE RELATION READS RETIRE RATHER THAN START WORKING. Lane A's own
// corrected header measured it and said so: `checkout_intents` and
// `firm_registration_payments` ship with `force row level security`, a single
// `clara_fn_owner` policy and ZERO application-role grants — the blanket law
// for every table on this train (design part 2 §1). A browser read of either
// relation as `clara_authenticated` is UNREACHABLE BY DESIGN, PERMANENTLY, and
// was never going to resolve itself once C-3 merged. That header also named
// the fix — "a narrow SECURITY DEFINER read door exposing the applicant's OWN
// registration progress (never a general table grant), to be built when Lane B
// wires `/pending` for real" — and this train's own migration builds exactly
// that door. The two `getRows` probes are gone; nothing in this app reads
// either relation directly any more.
//
// ONE DOOR, NOT TWO PROBES, AND THE COUPLING IS THE POINT. Lane A ran the two
// facts independently because they "land in different migrations and will very
// plausibly become readable on different days". They now become readable on
// the SAME day through the same door, and reading them in one call makes the
// pair CONSISTENT: `paid_unconsumed` and `checkout_open` are evaluated in one
// snapshot, so `/pending` can never render a `paid` card built from a payment
// that was consumed between two separate round trips.
//
// THE DEGRADE IS UNCHANGED AND STILL HONEST. Any failure — no session, a
// refusal, a transport error, a malformed row — returns `NO_CHECKOUT_PROGRESS`,
// which `holding-state.ts` reads as "nothing was positively observed" and
// renders as plain `pending`. Review law 2 cuts both ways here: an absence
// must never be reported as "the person has not opened checkout", because that
// is not what was observed. The door's own refusals are part of that: a
// registration that is not the caller's raises `CLR04`, which is caught here
// exactly like every other cause, because a caller asking about somebody
// else's registration is owed no information about it at all — not even the
// distinction between "refused" and "nothing there".
//
// SCOPED BY BOTH `registration_id` AND `applicant` INSIDE THE DOOR — the same
// composite pair the schema's own FKs bind. 裁-74 deletes nothing, so an
// applicant who was rejected and reapplied holds more than one registration,
// and a superseded registration's intent must never read as progress on
// today's open one.
//
// N4 (PR #488's Lane-B completion contract) IS CLOSED BY THE CONTROL'S SHAPE.
// The contract asked for a Stripe session-status/expiry check before the
// "resume checkout" control went live, because `checkoutOpen` is true for ANY
// historical non-null `session_id`. The control this train ships does not
// navigate to a stored Stripe URL: it re-POSTs `/checkout`, and
// `open_checkout_intent` reuses only an UNSTAMPED current-plan intent — a
// stamped one is never reused — so a fresh Session is always minted. A stale
// positive therefore costs a new Session, never a dead link. See the door's
// own comment in the migration for the same reasoning at the DB end.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** The door, by exact name — a constant so a cell asserts the spelling this
 *  module actually calls rather than re-typing it (review law 3). */
export const OWN_CHECKOUT_PROGRESS_DOOR = "get_own_checkout_progress";

export type CheckoutProgress = {
  /** A `checkout_intents` row for this registration carries a non-null
   *  `session_id` — Stripe Checkout was opened at least once. Read positively
   *  inside the door, never inferred from the absence of a payment. */
  readonly checkoutOpen: boolean;
  /** A `firm_registration_payments` row for this registration exists with
   *  `consumed_at IS NULL` — money landed, `claim_paid_firm` has not run. */
  readonly paidUnconsumed: boolean;
};

/** The safe default: nothing was positively observed. */
export const NO_CHECKOUT_PROGRESS: CheckoutProgress = {
  checkoutOpen: false,
  paidUnconsumed: false,
};

type ProgressRow = { readonly checkout_open: unknown; readonly paid_unconsumed: unknown };

/** Positively decoded — two real booleans or nothing. A row whose fields are
 *  the wrong type is not a weaker observation; it is no observation. */
export function checkoutProgressFrom(rows: unknown): CheckoutProgress {
  if (!Array.isArray(rows)) return NO_CHECKOUT_PROGRESS;
  const first: unknown = rows[0];
  // `typeof null === "object"`, and a `[null]` body is a real shape PostgREST
  // can produce for a set-returning function that yielded a null composite.
  // Checked explicitly: the first cut tested only `=== undefined` and threw on
  // it, which `probeCheckoutProgress`'s catch would have hidden as a degrade —
  // the right answer for the wrong reason, one refactor away from a crash.
  if (typeof first !== "object" || first === null) return NO_CHECKOUT_PROGRESS;
  const row = first as ProgressRow;
  if (typeof row.checkout_open !== "boolean" || typeof row.paid_unconsumed !== "boolean") {
    return NO_CHECKOUT_PROGRESS;
  }
  return { checkoutOpen: row.checkout_open, paidUnconsumed: row.paid_unconsumed };
}

/**
 * The applicant's own progress on ONE registration. Called by
 * `server-reads.ts` only when the newest row is a validated, subject-bound,
 * OPEN registration — every other status is terminal or fail-closed and owes
 * no checkout read at all.
 */
export async function probeCheckoutProgress(
  session: SessionTokenAccessor,
  registrationId: string,
  _applicant: string,
  signal?: AbortSignal,
): Promise<CheckoutProgress> {
  try {
    const rows = await callDoor<unknown>(
      OWN_CHECKOUT_PROGRESS_DOOR,
      { p_registration: registrationId },
      { session, signal },
    );
    return checkoutProgressFrom(rows);
  } catch {
    // A refusal, a missing door, no grant, a transport failure — every one of
    // them means the same thing to this probe: nothing was observed.
    return NO_CHECKOUT_PROGRESS;
  }
}
