import { NextResponse } from "next/server";

import {
  checkoutFlashCookie,
  checkoutFlashMaxAgeSeconds,
  type CheckoutFlashOutcome,
  type CheckoutFlashPayload,
} from "@/lib/checkout/checkout-flash";
import {
  createCheckoutSession,
  StripeSessionError,
  type CheckoutSessionCreated,
  type CheckoutSessionRequest,
} from "@/lib/checkout/stripe-session";
import { isDoorRefusal } from "@/lib/doors";
import {
  getCurrentCheckoutPlan,
  openCheckoutIntent,
  recordCheckoutSession,
} from "@/lib/registration/checkout-doors";
import { originDigestArgFrom } from "@/lib/rate-wall-courier";
import { isRegistrationRequestRow } from "@/lib/registration/holding-state";
import {
  loadOwnRegistrationRequests,
  type OwnRegistrationResult,
} from "@/lib/registration/server-reads";
import { proveSameOrigin } from "@/lib/same-origin";
import { fixedTokenAccessor, resolveServerSession, type ServerSession } from "@/lib/supabase/server-session";

/**
 * ⑤ — `POST /checkout`, the second of the train's three server entries
 * (checkout-gate-design part 1 §1.1, part 3 §2). A route.ts HTTP-method
 * export, never a Server Action: an action is a POST endpoint wearing a
 * function call's clothes, page-level auth does not protect it, and — the
 * reason that decides it here — an action file is enumerated by NOTHING, so
 * the scope census could not force it to declare itself. This route IS
 * declared, in `SCOPE_EXEMPT_SURFACES`, with its reason.
 *
 * ============================================================================
 * WHY THE DOORS ARE CALLED HERE AND NOT FROM THE BROWSER
 * ============================================================================
 * The work order phrases ⑤ as "`open_checkout_intent` … from the client".
 * Design part 1 §1.1's step table and part 3 §2's `/checkout` row both put it
 * in this route handler, and the security reason is decisive rather than
 * stylistic: `p_origin_digest` IS the rate wall's key. A digest that travelled
 * to the browser to be posted back is a value the attacker fills in — part 1
 * §4.1's own named trap, "a wall keyed on a client-settable header is not a
 * wall; it is a form field the attacker fills in" — and one forged digest per
 * attempt is the C2 limb deleted outright. So the digest is computed in the
 * same server request that spends it, and never leaves this process. The
 * collision is REPORTED in the PR body, not resolved quietly (hard constraint
 * 1: accounting-correctness > backend contracts > design).
 *
 * THE DOORS STILL SEE THE PERSON. Every call below rides the CALLER'S OWN
 * session token over PostgREST (`lib/doors.ts`'s `callDoor` with an explicit
 * accessor), so `jwt_sub()` is the applicant and never a service identity —
 * part 3 §2's closing paragraph, and the reason C-5 measured these five doors
 * as unbuildable in the runtime at all (#511: no machine role can `SET ROLE
 * clara_authenticated`, and `extraction-slice-0022-postverify.sql:165-167`
 * raises if one could).
 *
 * NO CALLER-SUPPLIED PARAMETER REACHES A DOOR. The registration is read from
 * the caller's own verified session (`loadOwnRegistrationRequests`), the
 * digest is computed from a trusted proxy header, the price id comes from the
 * door, and the collection mode comes from the plan row. The request body is
 * not read at all — there is nothing in it this route would trust.
 *
 * ============================================================================
 * ORDER MATTERS, AND THIS IS THE ORDER
 * ============================================================================
 *   same-origin → session → registration → digest → open_checkout_intent →
 *   plan → Stripe Session → record_checkout_session → 303 to Stripe
 *
 * `record_checkout_session` runs AFTER Stripe returns and BEFORE the redirect,
 * so a person who reaches Stripe always has their intent stamped. The reverse
 * order would stamp an intent with a Session that was never created, and
 * `uq_checkout_intents_session_id` makes a stamp one-shot — the applicant
 * would be holding a spent intent pointing at nothing.
 */

type CheckoutDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly loadRegistration?: () => Promise<OwnRegistrationResult>;
  readonly createSession?: (request: CheckoutSessionRequest) => Promise<CheckoutSessionCreated>;
  readonly env?: Record<string, string | undefined>;
  readonly newOpKey?: () => string;
};

/** The one place a refusal becomes a response: a 303 back to the holding page
 *  carrying an opaque marker, plus the unforgeable cookie the card is rendered
 *  from. See `lib/checkout/checkout-flash.ts` for why the values never ride
 *  the URL. */
export function checkoutRefusal(origin: string, outcome: CheckoutFlashOutcome): NextResponse {
  const nonce = crypto.randomUUID();
  const target = new URL("/pending", origin);
  target.search = "";
  target.hash = "";
  target.searchParams.set("checkout", nonce);
  const response = NextResponse.redirect(target, { status: 303 });
  const payload: CheckoutFlashPayload = { nonce, ...outcome };
  const cookie = checkoutFlashCookie();
  response.cookies.set(cookie.name, JSON.stringify(payload), {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "strict",
    path: "/",
    maxAge: checkoutFlashMaxAgeSeconds(),
  });
  return response;
}

/** The caller's own newest OPEN registration, or null. The SAME validator
 *  `holding-state.ts` and `server-reads.ts` use, imported rather than
 *  re-derived, so this route and the page it redirects to can never disagree
 *  about whether a registration is checkoutable (review law 3). */
export function openRegistrationFrom(result: OwnRegistrationResult): string | null {
  if (!result.ok) return null;
  const newest = result.rows[0];
  if (!isRegistrationRequestRow(newest)) return null;
  if (newest.applicant !== result.subject) return null;
  return newest.status === "open" ? newest.id : null;
}

export async function handleCheckoutPost(
  request: Request,
  deps: CheckoutDeps = {},
): Promise<Response> {
  // A state-changing POST that spends a rate-wall budget and creates a Stripe
  // object. Refused before anything else runs, exactly as the confirm verify
  // route does — a cross-origin page must not be able to open a checkout in
  // somebody else's browser.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json({ ok: false, error: "cross-origin" }, { status: 403 });
  }

  const env = deps.env ?? process.env;
  const mintOpKey = deps.newOpKey ?? (() => crypto.randomUUID());
  const resolve = deps.resolveSession ?? resolveServerSession;
  const session = await resolve();
  if (session === null) {
    // No session at all: the proxy would normally have caught this. Send them
    // to sign in rather than showing a checkout card to nobody.
    const target = new URL("/login", proof.origin);
    return NextResponse.redirect(target, { status: 303 });
  }

  const loadRegistration = deps.loadRegistration ?? loadOwnRegistrationRequests;
  let registration: string | null;
  try {
    registration = openRegistrationFrom(await loadRegistration());
  } catch {
    return checkoutRefusal(proof.origin, { kind: "unavailable" });
  }
  if (registration === null) {
    return checkoutRefusal(proof.origin, { kind: "no_registration" });
  }

  // FAIL CLOSED (design part 3 §3: "absent ⇒ checkout refuses"). No configured
  // header, no pepper, or an address that does not parse — each refuses here
  // rather than calling the door with a constant, which would key C2 on one
  // value for the whole deployment (the M1 defect PR #488 already paid for).
  const originDigest = await originDigestArgFrom((name) => request.headers.get(name), env);
  if (originDigest === null) {
    return checkoutRefusal(proof.origin, { kind: "no_origin_digest" });
  }

  const accessor = fixedTokenAccessor(session.accessToken);
  const opKey = mintOpKey();
  try {
    const intent = await openCheckoutIntent({ registration, originDigest, opKey }, accessor);
    const plan = await getCurrentCheckoutPlan(accessor);
    // The intent and the plan row are two reads; a plan rotation between them
    // would build a Session at one plan's price with another plan's collection
    // mode. Refuse rather than pick a winner — a retry opens a fresh intent
    // wholly on the new plan (`open_checkout_intent` reuses only a CURRENT-plan
    // unstamped intent, `0161`'s own money-surface rule).
    if (plan.localKey !== intent.priceLocalKey) {
      return checkoutRefusal(proof.origin, { kind: "plan_rotated" });
    }

    const create = deps.createSession ?? ((r: CheckoutSessionRequest) => createCheckoutSession(r, { env }));
    const created = await create({
      stripePriceId: intent.stripePriceId,
      paymentMethodCollection: plan.paymentMethodCollection,
      successUrl: new URL("/checkout/success", proof.origin).toString(),
      cancelUrl: new URL("/pending", proof.origin).toString(),
      registrationId: registration,
      applicant: session.subject,
      intentId: intent.intentId,
      idempotencyKey: opKey,
    });

    await recordCheckoutSession(
      { intentId: intent.intentId, sessionId: created.id, opKey },
      accessor,
    );
    // 303, so the browser re-issues the navigation as a GET at Stripe.
    return NextResponse.redirect(created.url, { status: 303 });
  } catch (err) {
    if (isDoorRefusal(err)) {
      // The DB's own considered answer, carried verbatim — code and sentence
      // untouched, never retried (apps/web/AGENTS.md).
      return checkoutRefusal(proof.origin, {
        kind: "refused",
        code: err.code ?? "CLR",
        message: err.message,
      });
    }
    if (err instanceof StripeSessionError) {
      return checkoutRefusal(proof.origin, { kind: "stripe_unavailable" });
    }
    return checkoutRefusal(proof.origin, { kind: "unavailable" });
  }
}
