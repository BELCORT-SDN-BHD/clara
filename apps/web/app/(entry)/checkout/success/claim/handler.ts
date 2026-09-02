import { NextResponse } from "next/server";

import {
  checkoutFlashCookie,
  checkoutFlashMaxAgeSeconds,
  type CheckoutFlashOutcome,
  type CheckoutFlashPayload,
} from "@/lib/checkout/checkout-flash";
import { checkoutSuccessDecisionFrom } from "@/lib/checkout/success-state";
import { isDoorRefusal } from "@/lib/doors";
import { claimPaidFirm } from "@/lib/registration/checkout-doors";
import { NO_CHECKOUT_PROGRESS } from "@/lib/registration/checkout-progress-reads";
import {
  loadOwnRegistrationRequests,
  type OwnRegistrationResult,
} from "@/lib/registration/server-reads";
import { proveSameOrigin } from "@/lib/same-origin";
import { fixedTokenAccessor, resolveServerSession, type ServerSession } from "@/lib/supabase/server-session";

/**
 * ⑧ — `POST /checkout/success/claim`, server entry 3 of 3. ONE DOOR:
 * `clara.claim_paid_firm` (裁-89), which claims the payment, creates the firm
 * and closes the registration in a single transaction.
 *
 * WHY THIS URL AND NOT `POST /checkout/success`. Design part 3 §2 calls for "a
 * sibling route.ts POST" beside the paint-only page, and the App Router
 * forbids a `page.tsx` and a `route.ts` in the SAME segment — so the sibling
 * is one segment deeper, exactly as `/auth/confirm` (page) and
 * `/auth/confirm/verify` (route) already are on this train's other surface.
 * The entry COUNT is unchanged: three server entries, all `route.ts`
 * HTTP-method exports, none a Server Action.
 *
 * NOTHING IS TAKEN FROM THE REQUEST. There is no body to read: the
 * registration comes from the caller's own verified session, and the firm's
 * name is read INSIDE the door from `firm_registration_requests.firm_name`
 * (NIT-6 — the registration is the authority, and no name crosses the wire).
 *
 * THE PRE-CHECK IS NOT A GUARD, AND SAYING SO MATTERS. `claim_paid_firm`
 * refuses on its own authority for every wrong: a foreign registration
 * (`CLR04 not your registration request`), an unverified email claim, a
 * registration that is not open, no completed payment, no DPA signature at
 * the intent's own version. The decision below chooses WHICH CARD to render
 * for a caller who has nothing to claim; it never admits anything the door
 * would refuse, and the door still judges every request independently.
 */

type ClaimDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly loadRegistration?: () => Promise<OwnRegistrationResult>;
  readonly newOpKey?: () => string;
};

/** A refusal or a non-claimable state: 303 back to the success page with an
 *  opaque marker plus the unforgeable cookie the card renders from. */
export function claimOutcomeRedirect(origin: string, outcome: CheckoutFlashOutcome): NextResponse {
  const nonce = crypto.randomUUID();
  const target = new URL("/checkout/success", origin);
  target.search = "";
  target.hash = "";
  target.searchParams.set("claim", nonce);
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

export async function handleClaimPaidFirmPost(
  request: Request,
  deps: ClaimDeps = {},
): Promise<Response> {
  // The most consequential POST in the product: it creates a tenant. Refused
  // cross-origin before anything else runs.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json({ ok: false, error: "cross-origin" }, { status: 403 });
  }

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
    return claimOutcomeRedirect(proof.origin, { kind: "unavailable" });
  }
  const progress = result.ok ? result.checkoutProgress : NO_CHECKOUT_PROGRESS;
  const decision = checkoutSuccessDecisionFrom(result, progress);
  if (decision.kind === "already_open") {
    // The firm exists. Go there rather than replaying a door whose answer the
    // person cannot tell apart from the first one.
    return NextResponse.redirect(new URL("/", proof.origin), { status: 303 });
  }
  if (decision.kind !== "claimable") {
    // `awaiting_payment`, `no_registration`, `unavailable` — each keeps its own
    // name all the way to its own card; none is flattened into a generic error.
    return claimOutcomeRedirect(proof.origin, { kind: "unavailable" });
  }

  const opKey = (deps.newOpKey ?? (() => crypto.randomUUID()))();
  try {
    await claimPaidFirm(
      { registration: decision.registration, opKey },
      fixedTokenAccessor(session.accessToken),
    );
  } catch (err) {
    if (isDoorRefusal(err)) {
      return claimOutcomeRedirect(proof.origin, {
        kind: "refused",
        code: err.code ?? "CLR",
        message: err.message,
      });
    }
    return claimOutcomeRedirect(proof.origin, { kind: "unavailable" });
  }
  // ⑨ — the firm exists. `/` is the firm home; the spine resolves the caller's
  // brand-new membership there. No id is put in the URL: the session is the
  // authority for whose firm this is.
  return NextResponse.redirect(new URL("/", proof.origin), { status: 303 });
}
