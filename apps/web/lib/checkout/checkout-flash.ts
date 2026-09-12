// FS-4 C-6 Lane B — THE CHECKOUT REFUSAL FLASH.
//
// The two new server entries are POSTs that end in a redirect, so a refusal
// has to survive one navigation to be rendered. This is the SAME mechanism
// `app/(entry)/auth/confirm/confirm-flash.ts` uses and for the same reason
// (its own N1/裁-109 header): the URL carries only an opaque marker, and every
// value the page renders comes from an `httpOnly`, `SameSite=Strict`,
// `__Host-`-prefixed cookie nobody but this server could have set for this
// browser. A refusal in a query string is a refusal an attacker can hand a
// victim by link — on a money surface that is a phishing primitive ("your
// payment failed, click here").
//
// WHY A SECOND MODULE RATHER THAN WIDENING THE CONFIRM ONE. Different cookie,
// different lifetime, different payload, different reader — and the confirm
// cookie is scoped to a PRE-session surface while this one is only ever set
// for a caller who already has a session. Sharing one cookie name across the
// two would let a confirm refusal render as a checkout refusal after a
// redirect. The dev/loopback carve-out below is deliberately the same three
// conditions as `lib/same-origin.ts`'s, copied for the reason confirm-flash
// records: `__Host-` and `Secure` are ONE decision, and a shared import that
// let them diverge would produce a cookie the browser silently drops.
//
// THE REFUSAL TEXT IS THE DOOR'S OWN. `message` is a `DoorRefusal`'s verbatim
// sentence and `code` its CLR SQLSTATE — never re-worded here and never
// re-worded by the renderer (apps/web/AGENTS.md: "a `DoorRefusal` renders
// VERBATIM (code + message), never retried"). The bounded `kind` set is what
// chooses the CARD; the door's sentence is what the person reads inside it.

import { isLegalKind, type LegalKind } from "@/lib/registration/legal-reads";

const PROD_COOKIE_NAME = "__Host-clara-checkout-flash";
const DEV_COOKIE_NAME = "clara-checkout-flash";

const MAX_AGE_SECONDS = 180;
/** A refusal sentence longer than this is not a door sentence — the longest
 *  `0163` raises is well under it. Bounded so a cookie cannot be grown into a
 *  storage channel, and so a malformed payload fails closed rather than
 *  rendering an arbitrary blob. */
const MAX_MESSAGE_CHARS = 400;
const MAX_CODE_CHARS = 16;

export type CheckoutFlashOutcome =
  /** A governed refusal from one of the four doors — rendered verbatim. */
  | { readonly kind: "refused"; readonly code: string; readonly message: string }
  /** The rate-wall courier could not produce a digest: no configured header,
   *  no pepper, or an unparseable address. Design part 3 §3's "absent ⇒
   *  checkout refuses" — its own card, never folded into `refused`, because
   *  nothing was asked of the DB and no door said no. */
  | { readonly kind: "no_origin_digest" }
  /** Stripe could not be reached, refused the Session, or answered a shape
   *  this build will not act on. The intent is open and unstamped, so
   *  retrying is safe and the card says so. */
  | { readonly kind: "stripe_unavailable" }
  /**
   * #628 — THE CONFIGURATION ARM, SPLIT OUT OF `stripe_unavailable`.
   *
   * `StripeSessionError` has always distinguished `unconfigured` (no secret,
   * no declared mode, or a key whose class contradicts the declared mode) from
   * the three failures that mean Stripe itself did not answer — and every one
   * of them collapsed into the same card, which told the applicant "try again
   * in a moment" about a state no number of retries can change. The two are
   * different facts and they owe different sentences: an outage is waited out,
   * a misconfiguration is fixed by an operator and the person needs to be told
   * to stop pressing and ask for help. `stripe-session.ts`'s key-class gate
   * already draws the line internally; this kind is that line reaching a face.
   */
  | { readonly kind: "payments_misconfigured" }
  /**
   * #628 — `open_checkout_intent` refused `CLR09 checkout_in_progress`: a live
   * Stripe Session already exists for this registration (one per applicant),
   * AND the resume could not hand the person back to it — either Stripe said
   * the Session is `complete` (the money is with the applier now) or the route
   * could not ask. Never rendered as a failure: nothing is wrong, the payment
   * is somewhere between the applicant and the bank, and the holding card
   * beneath this banner carries the intent's own waiting face.
   */
  | { readonly kind: "checkout_in_progress" }
  /** #628 — Stripe says the Session the applicant was resuming has EXPIRED.
   *  The applier owns the intent's own expiry; this card exists so the person
   *  is told why the resume went nowhere and is offered a fresh start. */
  | { readonly kind: "checkout_expired" }
  /** #628 — `open_checkout_intent` or `claim_paid_firm` refused `CLR09
   *  capacity_reached`. Its own card, with NO pay control: admission is full,
   *  and inviting a payment that the door will refuse is how somebody ends up
   *  believing they bought something. */
  | { readonly kind: "capacity_reached" }
  /** #628 — `cancel_checkout_intent` refused `CLR09 payment_in_flight`: the
   *  bank is still confirming, and nobody — not the applicant, not this app —
   *  may cancel a payment mid-authorisation. An honest wait, not a failure. */
  | { readonly kind: "payment_in_flight" }
  /** #628 — the cancel SUCCEEDED. The one non-refusal outcome this cookie
   *  carries, and it rides the same channel for the same reason every refusal
   *  does: the route ends in a redirect, so the outcome has to survive one
   *  navigation, and a linkable "your checkout was cancelled" is a sentence an
   *  attacker could hand a victim. */
  | { readonly kind: "cancelled" }
  /** #628 — a cancel POST for an applicant whose registration carries no
   *  intent at all. Not a refusal (no door said no) and not a failure: there
   *  was simply nothing to cancel, which is what the card says. */
  | { readonly kind: "nothing_to_cancel" }
  /** `open_checkout_intent`'s plan and `get_current_checkout_plan()`'s plan
   *  disagree — the plan rotated mid-request. Not a door refusal and not a
   *  transport failure: a retry lands wholly on the new plan. */
  | { readonly kind: "plan_rotated" }
  /** The caller has no OPEN registration to check out for. */
  | { readonly kind: "no_registration" }
  /**
   * `open_checkout_intent` refused `CLR09` with `detail.reason =
   * "legal_not_accepted"` — one or both of the two agreements is not accepted
   * at its CURRENT version (#621). Its own card rather than the generic
   * `refused` one, because this refusal has a real next step: the person goes
   * back to `/signup`, where the legal stage shows each agreement's actual
   * state and offers the acceptance it is still owed. `missing` is the door's
   * own list, carried so the card names what is outstanding instead of making
   * somebody re-read both documents to find out.
   */
  | { readonly kind: "legal_not_accepted"; readonly missing: readonly LegalKind[] }
  /**
   * The caller ALREADY BELONGS TO A FIRM, so `claim_paid_firm` could never
   * serve them — `_create_firm_core` refuses `CLR10 actor already belongs to a
   * firm`, and `uq_membership_active_user` makes one active membership a
   * database property. Design §5's law is that "no path may strand a paying
   * customer without a firm", so this refuses at ⑤ rather than taking the
   * money at ⑤ and discovering it at ⑧.
   */
  | { readonly kind: "already_member" }
  /** Anything else this route could not classify. Distinct from every arm
   *  above so a card never claims a cause that was not observed. */
  | { readonly kind: "unavailable" };

export type CheckoutFlashPayload = CheckoutFlashOutcome & { readonly nonce: string };

/** The door's `detail.missing`, decoded. Anything that is not one of the two
 *  known kinds is DROPPED rather than rendered: a card that printed whatever
 *  string arrived would be this app repeating a value it cannot name. An empty
 *  result is fine — the card then says only that something is outstanding, and
 *  the legal stage itself is the authority on which. */
function boundedKinds(value: unknown): LegalKind[] {
  if (!Array.isArray(value)) return [];
  const out: LegalKind[] = [];
  for (const entry of value) {
    if (isLegalKind(entry) && !out.includes(entry)) out.push(entry);
  }
  return out;
}

function insecureLoopbackAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (env.NODE_ENV === "development" || env.CLARA_ALLOW_INSECURE_LOOPBACK === "1")
  );
}

/** The cookie name AND whether it may carry `Secure` are ONE decision —
 *  `__Host-` is rejected outright by the browser without `Secure` + HTTPS. */
export function checkoutFlashCookie(
  env: Record<string, string | undefined> = process.env,
): { readonly name: string; readonly secure: boolean } {
  if (insecureLoopbackAllowed(env)) return { name: DEV_COOKIE_NAME, secure: false };
  return { name: PROD_COOKIE_NAME, secure: true };
}

export function checkoutFlashMaxAgeSeconds(): number {
  return MAX_AGE_SECONDS;
}

function boundedText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/**
 * The single validated read. `null` for anything malformed, over-long,
 * nonce-mismatched or absent — never a partial or best-guess result, and a
 * mismatched nonce is treated exactly like no cookie at all.
 */
export function parseCheckoutFlash(
  raw: string | undefined,
  marker: string | undefined,
): CheckoutFlashPayload | null {
  if (typeof marker !== "string" || marker.length === 0) return null;
  if (typeof raw !== "string" || raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.nonce !== "string" || candidate.nonce.length === 0) return null;
  if (candidate.nonce !== marker) return null;
  const nonce = candidate.nonce;

  switch (candidate.kind) {
    case "refused": {
      const code = boundedText(candidate.code, MAX_CODE_CHARS);
      const message = boundedText(candidate.message, MAX_MESSAGE_CHARS);
      return code === null || message === null ? null : { nonce, kind: "refused", code, message };
    }
    case "legal_not_accepted":
      return { nonce, kind: "legal_not_accepted", missing: boundedKinds(candidate.missing) };
    case "no_origin_digest":
    case "stripe_unavailable":
    case "payments_misconfigured":
    case "checkout_in_progress":
    case "checkout_expired":
    case "capacity_reached":
    case "payment_in_flight":
    case "cancelled":
    case "nothing_to_cancel":
    case "plan_rotated":
    case "no_registration":
    case "already_member":
    case "unavailable":
      return { nonce, kind: candidate.kind };
    default:
      return null;
  }
}
