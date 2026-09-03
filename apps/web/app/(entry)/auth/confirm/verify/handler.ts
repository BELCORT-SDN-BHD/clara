import { NextResponse } from "next/server";

import {
  confirmEmailCode as defaultConfirmEmailCode,
  type ConfirmEmailCode,
} from "./confirmation-wall";
import {
  confirmFlashCookie,
  confirmFlashMaxAgeSeconds,
  type ConfirmFlashOutcome,
  type ConfirmFlashPayload,
} from "../confirm-flash";
import { proxyObservedClientIp } from "@/lib/rate-wall-courier";
import { proveSameOrigin } from "@/lib/same-origin";
import { createRouteClient } from "@/lib/supabase/server";

/**
 * 裁-92 — the CODE flow, WIRED FOR REAL by FS-4 C-6 Lane B. §3.6 of
 * checkout-gate-design.md is the table this file implements: `proveSameOrigin`
 * survives VERBATIM (it was never the binding — it is the CSRF wall on a
 * state-changing route, and stays one regardless of what the route verifies),
 * and everything after it is the C1/C2 wall running BEFORE the verification.
 *
 * WHAT CHANGED FROM LANE A, AND WHY IT IS NOT A WIDENING. Lane A ran
 * `verifyOtp` in THIS process, between a claim call and a settle call. C-5's
 * A-M3 fix moves all three into one runtime request, because a caller that can
 * settle an attempt — or that merely holds its id — can zero out the rate wall
 * (see `./confirmation-wall.ts`'s header for the measurement). So this handler
 * no longer calls `verifyOtp` at all; it hands the runtime the two fields the
 * person typed plus the address this app's edge observed, and gets back a
 * verdict. The route is still one of §1.1's three server entries, still makes
 * a DIRECT server-to-server call rather than going through the generic proxy
 * (§3.5: the proxy is entrance 3 of the scope spine and would refuse a caller
 * who by definition has no session), and still adds no fourth entry.
 *
 * THE SEALING MOVED WITH IT, AND STAYS POSITIVE. `hasVerifiedSession`'s job —
 * "a null session is not evidence of success" — is now done in two places that
 * cannot disagree: `confirmEmailCode` refuses to report `verified` without
 * both tokens present as non-empty strings, and this handler only seals a
 * cookie when `setSession` itself reports a session back. `error: null` alone
 * has never been accepted here and is not accepted now.
 *
 * N3 IS UNCHANGED (裁-109). Every verification failure — wrong code, expired
 * code, unknown email, banned account — renders through the same `"wrong"`
 * flash. Nothing in this file reads an error code, and the runtime reports
 * only a boolean, so the flattening is now structural rather than a discipline
 * this file has to keep.
 *
 * N1 IS UNCHANGED. The URL carries only an opaque marker; every rendered value
 * comes from the unforgeable flash cookie.
 */

/** What this handler needs from a Supabase route client: a way to install a
 *  session into the cookie jar, and the seal that flushes it onto a response.
 *  Narrower than the whole client, so a cell can drive it without standing up
 *  auth. */
export interface EmailConfirmationRouteClient {
  supabase: {
    auth: {
      setSession(params: { access_token: string; refresh_token: string }): Promise<{
        data: { session: { access_token: string } | null };
        error: { message?: string } | null;
      }>;
    };
  };
  sealResponse<T extends NextResponse>(response: T): T;
}

export type CreateEmailConfirmationRouteClient = () => Promise<EmailConfirmationRouteClient>;

/**
 * Mints the redirect and its unforgeable flash cookie together.
 *
 * Both redirects are built from the WALL'S OWN PROVEN origin, never
 * `request.url`'s authority — independent review of #455, MEDIUM-2, kept
 * verbatim: behind a proxy those two diverge, and `request.url` can read an
 * internal, plain-HTTP hop. One validated value, every consumer.
 */
function confirmRedirect(origin: string, outcome: ConfirmFlashOutcome): NextResponse {
  const nonce = crypto.randomUUID();
  const target = new URL("/auth/confirm", origin);
  target.search = "";
  target.hash = "";
  target.searchParams.set("flash", nonce);
  const response = NextResponse.redirect(target, { status: 303 });
  const payload: ConfirmFlashPayload = { nonce, ...outcome };
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

function fixedSignupRedirect(origin: string): NextResponse {
  const target = new URL("/signup", origin);
  target.search = "";
  target.hash = "";
  return NextResponse.redirect(target, { status: 303 });
}

/** Exactly one non-empty string field, or `null` — the same "reject a
 *  duplicated or blank field outright" discipline the prior handler used. */
function singleNonEmptyField(form: FormData, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" && values[0].length > 0
    ? values[0]
    : null;
}

/**
 * POST is the sole code-consuming execution root. `proveSameOrigin` runs first
 * and unconditionally — before the body is even read.
 */
export async function handleEmailConfirmationPost(
  request: Request,
  createClient: CreateEmailConfirmationRouteClient = createRouteClient as unknown as CreateEmailConfirmationRouteClient,
  confirmCode: ConfirmEmailCode = defaultConfirmEmailCode,
): Promise<Response> {
  // This is a login/session-creating mutation. A cross-origin page must not be
  // able to submit its own guess into somebody else's browser. Refused before
  // reading the body or constructing any auth client — a refused request has
  // no cookie-writing capability at all.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json({ ok: false, error: "cross-origin" }, { status: 403 });
  }

  const form = await request.formData();
  const { supabase, sealResponse } = await createClient();

  const email = singleNonEmptyField(form, "email");
  const token = singleNonEmptyField(form, "token");
  if (email === null || token === null) {
    return sealResponse(confirmRedirect(proof.origin, { kind: "invalid" }));
  }

  // THE C2 INPUT — the address THIS app's edge observed, never `proof.origin`.
  // `proof.origin` is `proveSameOrigin`'s CSRF proof (the browser's `Origin`
  // header), identical for every visitor to this deployment; feeding it into
  // the rate wall under any name would key C2 on one shared value and let five
  // rejected guesses from anyone lock out every applicant. That was M1 on PR
  // #488 and it is not being paid for twice. `null` here (no configured
  // header, or a value that does not parse as an IP) fails closed inside
  // `confirmEmailCode` — the wall is never keyed on a placeholder.
  const clientIp = proxyObservedClientIp((name) => request.headers.get(name));

  // THE C1/C2 WALL AND THE VERIFICATION, in one runtime request, in that
  // order. §3.4: "the attempt is recorded BEFORE the verification, never
  // after," so a killed connection still costs an attempt — the ordering is
  // the door's, and this app cannot reorder it even by accident because it
  // cannot reach the two verbs separately.
  const outcome = await confirmCode({ email, token, clientIp });
  if (outcome.kind === "unavailable") {
    return sealResponse(confirmRedirect(proof.origin, { kind: "unavailable" }));
  }
  if (outcome.kind === "locked") {
    return sealResponse(
      confirmRedirect(proof.origin, { kind: "locked", waitSeconds: outcome.retryAfterSeconds }),
    );
  }
  if (outcome.kind === "wrong") {
    return sealResponse(
      confirmRedirect(proof.origin, { kind: "wrong", remaining: outcome.remaining }),
    );
  }

  // VERIFIED. Install the runtime's session into this browser's cookie jar.
  // The seal is what actually writes it onto the response, exactly as before.
  const sealed = await supabase.auth.setSession({
    access_token: outcome.session.accessToken,
    refresh_token: outcome.session.refreshToken,
  });
  // POSITIVE CHECK, not `error === null`. A null error with no session is not
  // evidence that the cookie session `/signup` needs now exists — the same
  // property `hasVerifiedSession` enforced against `verifyOtp`'s result.
  const installed = sealed.data.session;
  if (sealed.error !== null || typeof installed?.access_token !== "string"
    || installed.access_token.length === 0) {
    // The code IS spent — a Supabase OTP is single use, and the runtime
    // already settled the attempt `accepted`. Saying "that code didn't work"
    // would be false and would send the person to burn another one. This is
    // our failure, and `unavailable` is the one outcome that says so.
    return sealResponse(confirmRedirect(proof.origin, { kind: "unavailable" }));
  }
  return sealResponse(fixedSignupRedirect(proof.origin));
}
