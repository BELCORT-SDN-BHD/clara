import { NextResponse } from "next/server";

import { confirmFlashRedirect, singleNonEmptyField } from "../post-outcome";
import {
  resendConfirmationCode as defaultResendConfirmationCode,
  type ResendConfirmationCode,
} from "./resend-wall";
import { proxyObservedClientIp } from "@/lib/rate-wall-courier";
import { proveSameOrigin } from "@/lib/same-origin";

/**
 * `POST /auth/confirm/resend` — the "send me a new code" control's execution
 * root (#621). It closes the completion contract the
 * retired browser-side resend seam was left holding: a resend that is walled
 * before it reaches the provider, instead of a browser calling
 * `supabase.auth.resend` with a typed-in address and no wall at all.
 *
 * IT MIRRORS `../verify/handler.ts` DELIBERATELY, step for step:
 *
 *   same-origin proof → the address from the FORM → the trusted client IP this
 *   app's own edge observed → ONE runtime call that runs the C1/C2 wall and
 *   then sends → a 303 back to `/auth/confirm` carrying an opaque marker, with
 *   every value the person reads living in the unforgeable flash cookie.
 *
 * NO SESSION IS REQUIRED AND NONE IS CREATED. The whole lane is pre-session by
 * construction — somebody who cannot confirm their address has no session to
 * hold — so this route builds no auth client and seals no cookie. That is also
 * why it is registered in `SCOPE_EXEMPT_SURFACES` beside its sibling: there is
 * no firm scope to check, and `requireFirmScope()` would redirect a caller who
 * by definition has nowhere to be redirected to.
 *
 * IT IS A REAL FORM POST, NOT A FETCH, and that is the point rather than an
 * omission. The outcome has to survive one navigation to be rendered from the
 * flash cookie, the control keeps working with no JavaScript at all, and the
 * card the person lands on is a real page they can reload, bookmark-free and
 * Back-safe — "a persistent outcome, not a toast".
 *
 * THE ADDRESS IS ECHOED BACK on every arm except a malformed submission (where
 * there is nothing trustworthy to echo). Without it the redirect would empty
 * the field the person just filled in — the cross-device case 裁-92 exists for
 * is exactly where this browser has no remembered address of its own.
 */
export async function handleConfirmationResendPost(
  request: Request,
  resend: ResendConfirmationCode = defaultResendConfirmationCode,
): Promise<Response> {
  // A state-changing POST that spends a rate-wall budget and asks a provider to
  // send mail. Refused before the body is read, exactly as the verify route
  // refuses: a cross-origin page must not be able to burn somebody else's send
  // budget from inside their browser.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json({ ok: false, error: "cross-origin" }, { status: 403 });
  }

  const form = await request.formData();
  const email = singleNonEmptyField(form, "email");
  if (email === null) {
    return confirmFlashRedirect(proof.origin, { kind: "resend-invalid-email" });
  }

  // THE C2 INPUT — the address THIS app's edge observed, never `proof.origin`,
  // which is one value for the whole deployment. `null` fails closed inside
  // `resendConfirmationCode`; the wall is never keyed on a placeholder.
  const clientIp = proxyObservedClientIp((name) => request.headers.get(name));

  const outcome = await resend({ email, clientIp });
  switch (outcome.kind) {
    case "sent":
      return confirmFlashRedirect(proof.origin, { kind: "resent" }, email);
    case "locked":
      return confirmFlashRedirect(
        proof.origin,
        { kind: "resend-locked", waitSeconds: outcome.retryAfterSeconds, atLeast: outcome.atLeast },
        email,
      );
    case "rate_limited":
      return confirmFlashRedirect(
        proof.origin,
        { kind: "resend-rate-limited", waitSeconds: outcome.retryAfterSeconds, atLeast: outcome.atLeast },
        email,
      );
    case "invalid_email":
      return confirmFlashRedirect(proof.origin, { kind: "resend-invalid-email" }, email);
    default:
      return confirmFlashRedirect(proof.origin, { kind: "resend-unavailable" }, email);
  }
}
