import { NextResponse } from "next/server";

import { checkoutRefusal, openRegistrationFrom } from "../handler";
import { expireCheckoutSession, StripeSessionError } from "@/lib/checkout/stripe-session";
import { isDoorRefusal } from "@/lib/doors";
import {
  cancelCheckoutIntent,
  getOwnCheckoutIntentSession,
} from "@/lib/registration/checkout-doors";
import {
  loadOwnRegistrationRequests,
  type OwnRegistrationResult,
} from "@/lib/registration/server-reads";
import { proveSameOrigin } from "@/lib/same-origin";
import {
  fixedTokenAccessor,
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

/**
 * #628 — `POST /checkout/cancel`, the fourth server entry: THE WAY OUT OF A
 * CHECKOUT THE APPLICANT NO LONGER WANTS.
 *
 * ============================================================================
 * WHY THIS ROUTE HAS TO EXIST AT ALL
 * ============================================================================
 * `open_checkout_intent` allows ONE live Stripe Session per registration
 * (migration 0186's `CLR09 checkout_in_progress`), which is the rule that stops
 * a double-press or a lost acknowledgement from minting two subscriptions. The
 * cost of that rule, without this route, is a trap: an applicant who opened a
 * checkout with the wrong card, or on a plan they misread, or simply on a tab
 * they closed, is held against a Session they cannot reach and cannot end, and
 * their only options are to wait out an expiry they cannot see or to contact
 * support. A rule that prevents a duplicate must come with a way to release the
 * original, or it is a rule that strands people.
 *
 * ============================================================================
 * THE DOOR FIRST, STRIPE SECOND, AND THE ORDER IS LOAD-BEARING
 * ============================================================================
 *   same-origin → session → own OPEN registration → the caller's own intent →
 *   cancel_checkout_intent → (best effort) expire at Stripe → 303 /pending
 *
 * `cancel_checkout_intent` is the AUTHORITY: it is what the rest of the product
 * reads, and it is what refuses when cancelling would be wrong
 * (`payment_in_flight` — the bank is mid-authorisation and nobody may pull the
 * rug out; `already_paid` — the money landed and the answer is to claim, not to
 * cancel). Expiring the Stripe Session first would end a hosted page for an
 * intent the DB then refused to cancel, leaving the applicant with a live
 * intent pointing at a dead checkout: the exact stranding this route exists to
 * remove, manufactured by getting the order backwards.
 *
 * THE STRIPE CALL IS BEST EFFORT, AND SAYING SO IS NOT A SHRUG. Its job is to
 * stop a hosted page the person may still have open in another tab from taking
 * their money after they asked to stop. If it fails — Stripe is down, the
 * Session already expired, the deployment has no key — the intent STAYS
 * CANCELLED, because the door already decided and re-deciding on a third
 * party's availability would make the DB's answer depend on Stripe's uptime.
 * Money that lands anyway is exactly the case the applier's `paid_after_terminal`
 * handling exists for. The failure is logged, without secrets, and the person
 * is told their checkout was cancelled — which is true.
 *
 * NOTHING IS READ FROM THE REQUEST. No intent id, no session id, no
 * registration: the registration comes from the caller's own verified session
 * and the intent from `get_own_checkout_intent_session`, which is scoped inside
 * the door. A caller-supplied intent id on a route that ENDS A PAYMENT is a
 * value an attacker fills in; this route's body is never read at all, so there
 * is nothing to fill in.
 */

type CancelDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly loadRegistration?: () => Promise<OwnRegistrationResult>;
  /** Injected so the best-effort arm — including its FAILURE — is driven by a
   *  cell rather than reachable only against a live Stripe. */
  readonly expireSession?: (sessionId: string) => Promise<void>;
  readonly env?: Record<string, string | undefined>;
  readonly newOpKey?: () => string;
};

export async function handleCheckoutCancelPost(
  request: Request,
  deps: CancelDeps = {},
): Promise<Response> {
  // A state-changing POST that ends a payment. Refused cross-origin before
  // anything else runs — a page on another origin must not be able to cancel
  // somebody's checkout from inside their own browser.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json({ ok: false, error: "cross-origin" }, { status: 403 });
  }

  const env = deps.env ?? process.env;
  const resolve = deps.resolveSession ?? resolveServerSession;
  const session = await resolve();
  if (session === null) {
    return NextResponse.redirect(new URL("/login", proof.origin), { status: 303 });
  }

  const loadRegistration = deps.loadRegistration ?? loadOwnRegistrationRequests;
  let result: OwnRegistrationResult;
  try {
    result = await loadRegistration();
  } catch {
    return checkoutRefusal(proof.origin, { kind: "unavailable" });
  }
  // THE SAME validator `POST /checkout` uses, imported rather than re-derived,
  // so the route that STARTS a checkout and the route that ENDS one can never
  // disagree about whose registration is checkoutable (review law 3).
  const registration = openRegistrationFrom(result);
  if (registration === null) {
    return checkoutRefusal(proof.origin, { kind: "no_registration" });
  }

  const accessor = fixedTokenAccessor(session.accessToken);
  let intent: Awaited<ReturnType<typeof getOwnCheckoutIntentSession>>;
  try {
    intent = await getOwnCheckoutIntentSession(registration, accessor);
  } catch (err) {
    if (isDoorRefusal(err)) {
      return checkoutRefusal(proof.origin, {
        kind: "refused",
        code: err.code ?? "CLR",
        message: err.message,
      });
    }
    return checkoutRefusal(proof.origin, { kind: "unavailable" });
  }
  if (intent === null) {
    // Nothing to cancel. Its own card: no door refused anything and nothing
    // failed, so calling this `unavailable` would report a fault that did not
    // happen.
    return checkoutRefusal(proof.origin, { kind: "nothing_to_cancel" });
  }

  const opKey = (deps.newOpKey ?? (() => crypto.randomUUID()))();
  let cancelled: Awaited<ReturnType<typeof cancelCheckoutIntent>>;
  try {
    cancelled = await cancelCheckoutIntent({ intentId: intent.intentId, opKey }, accessor);
  } catch (err) {
    if (isDoorRefusal(err)) {
      // THE ONE REFUSAL WITH A NEXT STEP. `payment_in_flight` is not a fault
      // and not a permanent no: the bank is confirming, and the answer is to
      // wait and look again — which is what the holding page's own processing
      // face offers underneath this banner. Every other refusal (notably
      // `already_paid`) carries the door's own sentence verbatim.
      if (err.code === "CLR09" && err.reason === "payment_in_flight") {
        return checkoutRefusal(proof.origin, { kind: "payment_in_flight" });
      }
      // #628's DB ROUND — ONE REFUSAL FOR "NOT YOURS" AND FOR "NOT THERE".
      //
      // `cancel_checkout_intent` used to tell an absent intent apart from a
      // foreign one (`intent_not_found` vs a CLR04); it now answers `CLR04
      // not_your_intent` for BOTH, which is the right call at the DB end — a
      // caller asking about somebody else's intent must not learn from the
      // refusal whether that intent exists.
      //
      // WHAT THAT MEANS HERE IS NARROW AND WORTH STATING. This route never
      // accepts an intent id: it names the one `get_own_checkout_intent_session`
      // just handed it, scoped to the caller inside the door. So "not your
      // intent" cannot mean a probe — it can only mean the intent stopped being
      // live between the read and this call (the applier swept it, or another
      // tab cancelled it). The honest sentence for the person is the same one
      // they get when the read found nothing at all: there was no open checkout
      // to cancel. Rendering the door's own "not your intent" verbatim would
      // tell somebody their own checkout belongs to someone else.
      if (err.code === "CLR04") {
        return checkoutRefusal(proof.origin, { kind: "nothing_to_cancel" });
      }
      return checkoutRefusal(proof.origin, {
        kind: "refused",
        code: err.code ?? "CLR",
        message: err.message,
      });
    }
    return checkoutRefusal(proof.origin, { kind: "unavailable" });
  }

  // THE DOOR'S OWN WORD FOR WHAT HAPPENED. `cancel_checkout_intent` replays for
  // an intent that was ALREADY terminal, and returns that intent's real status
  // rather than pretending it cancelled it — so an intent the applier expired
  // in the moment between the read and this call comes back `expired`, and the
  // person is told their checkout expired instead of being told this app
  // cancelled something it did not. Narrow, and reachable only through that
  // race (`get_own_checkout_intent_session` returns only a live intent), which
  // is precisely why it is handled rather than assumed away.
  if (cancelled.status === "expired") {
    return checkoutRefusal(proof.origin, { kind: "checkout_expired" });
  }

  // THE DOOR HAS DECIDED. Everything below is courtesy, and none of it may
  // change the answer the person gets.
  //
  // The Session id is taken from the door's OWN return first and from the read
  // only as a fallback, because a REPLAY (`{status, replay:true}` — a second
  // press, or a retry whose first response was lost) legitimately carries none.
  const sessionId = cancelled.sessionId ?? intent.sessionId;
  if (sessionId !== null) {
    try {
      const expire = deps.expireSession ?? ((id: string) => expireCheckoutSession(id, { env }));
      await expire(sessionId);
    } catch (err) {
      // NO SECRET AND NO SESSION ID IN THE LINE. The id is an identifier for a
      // payment attempt; the reason class and message are built from variable
      // names, a status code or an error name (`stripe-session.ts`), never from
      // Stripe's body. An operator reading this knows the expiry did not land
      // and that the intent is cancelled regardless.
      const reason = err instanceof StripeSessionError ? err.reason : "unexpected";
      console.error(
        `[checkout] the Stripe Session expiry did not land after a cancelled intent (${reason}); ` +
          "the intent stays cancelled and a late payment is the applier's paid_after_terminal case",
      );
    }
  }

  // A REPLAY LANDS HERE TOO, deliberately. A person cannot tell a first cancel
  // from a second, the world is in the same state either way, and inventing a
  // different sentence for the retry would be reporting the mechanism instead
  // of the outcome.
  return checkoutRefusal(proof.origin, { kind: "cancelled" });
}
