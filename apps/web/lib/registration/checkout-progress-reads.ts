// THE §2.1 CHECKOUT-PROGRESS PROBE — best-effort evidence for /pending's two
// NEW arms that sit past "registered": `checkout_open` (a Stripe Checkout
// session is open, unpaid) and `paid` (a payment landed, unconsumed).
//
// LANE A / LANE B SPLIT (FS-4 C-6). `checkout_intents` and
// `firm_registration_payments` are C-3 objects — they do not exist on `main`
// yet, and even once C-3 merges neither table grants `clara_authenticated`
// any access (the estate's measured idiom for every pre-firm table: RLS
// enabled AND forced, owner-only policy, zero application-role grants,
// reached only through a SECURITY DEFINER door). So a browser read of either
// relation fails TODAY for two independent reasons — "the relation does not
// exist" and, later, "the relation exists but grants nothing to this role" —
// and this module treats both identically: an honest "not observed" rather
// than a page-breaking error.
//
// WHY A PROBE AND NOT A HOLDING-STATE PARAMETER GUESSED FROM ABSENCE. Review
// law 2 — "absence is not evidence" — cuts the other way here too: an absence
// caused by a schema that has not landed must never be reported as "the
// person has not opened checkout", because that is not what was observed;
// it is honestly UNKNOWN. `holdingStateFrom` therefore never infers
// `checkout_open`/`paid` from a missing read — it only renders them when this
// probe positively saw a row. Until Lane B's C-3/C-2 doors and grants land,
// every call here degrades to `NO_CHECKOUT_PROGRESS` and the mapper falls
// through to the existing `pending` arm — never a guess, never a crash.
//
// EACH FACT IS PROBED INDEPENDENTLY (`Promise.all`, two separate try/catch).
// A `checkout_intents` failure must not also blind the `firm_registration_
// payments` read (and vice versa) — they land in different migrations and
// will very plausibly become readable on different days.
//
// SCOPED BY BOTH `registration_id` AND `applicant` — the same composite pair
// the DB's own FKs bind (part 2 §1.3.1's `fk_checkout_intents_registration_
// applicant` / `firm_registration_payments`'s twin). An applicant can hold
// more than one registration over time (裁-74: nothing is ever deleted, so a
// rejected-then-reapplied person has two), and a past registration's
// superseded checkout intent must never be read as progress on today's OPEN
// one. Filtering on `applicant` alone would risk exactly that; the pair is
// what the schema itself treats as the identity of "this registration's
// intent."

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

export const CHECKOUT_INTENTS_RELATION = "checkout_intents";
export const FIRM_REGISTRATION_PAYMENTS_RELATION = "firm_registration_payments";

export type CheckoutProgress = {
  /** A `checkout_intents` row for this registration carries a non-null
   *  `session_id` (Stripe Checkout was opened) — read positively, never
   *  inferred from the absence of a payment.
   *
   *  N4, fix round 2026-09-01 (PR #488 Codex adversarial leg) — LANE B
   *  COMPLETION CONTRACT: `probeCheckoutOpen` below treats ANY historical
   *  non-null `session_id` as "checkout open", with no freshness or Stripe-
   *  status check. A Checkout Session that already expired, was abandoned,
   *  or completed through a path this probe doesn't also check would still
   *  read `checkoutOpen: true` here. This is contract-only today — the
   *  `/pending` "resume checkout" control this flag drives is already
   *  rendered disabled (`Pending.checkout_open.notBuilt`), so nothing acts
   *  on a stale positive yet. Lane B must add the Stripe-status/expiry
   *  check (session status = `open`, not past `expires_at`) before wiring
   *  that control live. */
  readonly checkoutOpen: boolean;
  /** A `firm_registration_payments` row for this registration exists with
   *  `consumed_at IS NULL` — money landed, `claim_paid_firm` has not run. */
  readonly paidUnconsumed: boolean;
};

/** The safe default: nothing was positively observed. This is what every
 *  caller gets today, honestly, until C-2/C-3 land and grant a read path —
 *  see this module's header. */
export const NO_CHECKOUT_PROGRESS: CheckoutProgress = {
  checkoutOpen: false,
  paidUnconsumed: false,
};

type CheckoutIntentSessionRow = { readonly session_id: string | null };
type UnconsumedPaymentRow = { readonly id: string };

async function probeCheckoutOpen(
  session: SessionTokenAccessor,
  registrationId: string,
  applicant: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const rows = await getRows<CheckoutIntentSessionRow>(CHECKOUT_INTENTS_RELATION, {
      select: "session_id",
      filters: {
        registration_id: `eq.${registrationId}`,
        applicant: `eq.${applicant}`,
        session_id: "not.is.null",
      },
      limit: 1,
      session,
      signal,
    });
    const row = rows[0];
    return (
      row !== undefined &&
      typeof row.session_id === "string" &&
      row.session_id.length > 0
    );
  } catch {
    // Missing relation, no grant, RLS, a genuine transport failure — every
    // one of them means the same thing to this probe: nothing was observed.
    return false;
  }
}

async function probePaidUnconsumed(
  session: SessionTokenAccessor,
  registrationId: string,
  applicant: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const rows = await getRows<UnconsumedPaymentRow>(FIRM_REGISTRATION_PAYMENTS_RELATION, {
      select: "id",
      filters: {
        registration_id: `eq.${registrationId}`,
        applicant: `eq.${applicant}`,
        consumed_at: "is.null",
      },
      limit: 1,
      session,
      signal,
    });
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * The combined probe /pending's page calls for an OPEN registration only —
 * every other status is terminal or fail-closed and owes no checkout read at
 * all (`server-reads.ts` gates the call on that).
 */
export async function probeCheckoutProgress(
  session: SessionTokenAccessor,
  registrationId: string,
  applicant: string,
  signal?: AbortSignal,
): Promise<CheckoutProgress> {
  const [checkoutOpen, paidUnconsumed] = await Promise.all([
    probeCheckoutOpen(session, registrationId, applicant, signal),
    probePaidUnconsumed(session, registrationId, applicant, signal),
  ]);
  return { checkoutOpen, paidUnconsumed };
}
