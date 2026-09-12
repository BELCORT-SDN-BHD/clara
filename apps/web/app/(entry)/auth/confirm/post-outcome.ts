// THE TWO THINGS BOTH CONFIRM POSTs DO — shared by `verify/handler.ts` (the
// code attempt) and `resend/handler.ts` (the new-code request, #621).
//
// WHY THIS MODULE EXISTS RATHER THAN A SECOND COPY IN THE SECOND HANDLER. The
// redirect-plus-cookie pair is the whole N1 fix (裁-109): the URL carries an
// opaque marker and NOTHING ELSE, every rendered value comes from an
// `httpOnly`, `SameSite=Strict`, `__Host-`-prefixed cookie only this server
// could have set, and the cookie's lifetime is chosen per outcome. Two
// handlers each minting their own version of that is exactly how one of them
// eventually ships without `httpOnly`, or with the outcome back in the query
// string. One minter, two callers, and a cell can drive it directly.
//
// THE ORIGIN IS THE CALLER'S PROVEN ONE, NEVER `request.url`'s authority —
// independent review of #455, MEDIUM-2, kept verbatim: behind a proxy those
// two diverge and `request.url` can read an internal, plain-HTTP hop.

import { NextResponse } from "next/server";

import {
  confirmFlashCookie,
  confirmFlashMaxAgeSeconds,
  type ConfirmFlashOutcome,
  type ConfirmFlashPayload,
} from "./confirm-flash";

/**
 * Mints the 303 back to `/auth/confirm` and its unforgeable flash cookie
 * together.
 *
 * `email`, when given, is the address THIS POST carried — echoed into the
 * cookie so the redirect does not empty the field the person filled in. See
 * `ConfirmFlashPayload`'s own note for why echoing it through the cookie
 * honours the W-H wall rather than weakening it.
 */
export function confirmFlashRedirect(
  origin: string,
  outcome: ConfirmFlashOutcome,
  email?: string | null,
): NextResponse {
  const nonce = crypto.randomUUID();
  const target = new URL("/auth/confirm", origin);
  target.search = "";
  target.hash = "";
  target.searchParams.set("flash", nonce);
  const response = NextResponse.redirect(target, { status: 303 });
  const payload: ConfirmFlashPayload = {
    nonce,
    ...outcome,
    ...(typeof email === "string" && email.length > 0 ? { email } : {}),
  };
  const cookie = confirmFlashCookie();
  response.cookies.set(cookie.name, JSON.stringify(payload), {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "strict",
    path: "/",
    maxAge: confirmFlashMaxAgeSeconds(outcome),
  });
  return response;
}

/** Exactly one non-empty string field, or `null` — a duplicated or blank field
 *  is rejected outright rather than resolved by picking one. */
export function singleNonEmptyField(form: FormData, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" && values[0].length > 0
    ? values[0]
    : null;
}
