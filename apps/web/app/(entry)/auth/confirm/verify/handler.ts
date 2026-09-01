import { NextResponse } from "next/server";

import {
  claimConfirmationAttempt as defaultClaimConfirmationAttempt,
  settleConfirmationAttempt as defaultSettleConfirmationAttempt,
  type ClaimConfirmationAttempt,
  type SettleConfirmationAttempt,
} from "./confirmation-wall";
import { proveSameOrigin } from "@/lib/same-origin";
import { createRouteClient } from "@/lib/supabase/server";

/**
 * 裁-92 — the CODE flow. §3.6 of checkout-gate-design.md is the exact table
 * this file implements: `proveSameOrigin` survives VERBATIM (it was never the
 * binding — it is the CSRF wall on a state-changing route, and stays one
 * regardless of what the route verifies); what changed is everything after
 * it — the C1/C2 attempt wall runs BEFORE `verifyOtp`, and `verifyOtp` itself
 * now takes `{email, token, type:'signup'}` instead of a token hash.
 *
 * THE ATTEMPT WALL IS A LANE-B SEAM (`./confirmation-wall.ts`). Its default
 * production behaviour is to REFUSE with `{kind:"unavailable"}` — never to
 * let a caller through unchecked. See that module's header for why.
 */

type VerifyOtpError = { message?: string; code?: string };

type VerifyEmailResponse = {
  data: {
    user: { id: string } | null;
    session: {
      access_token: string;
      user: { id: string };
    } | null;
  };
  error: VerifyOtpError | null;
};

export interface EmailConfirmationRouteClient {
  supabase: {
    auth: {
      verifyOtp(params: {
        type: "signup";
        email: string;
        token: string;
      }): Promise<VerifyEmailResponse>;
    };
  };
  sealResponse<T extends NextResponse>(response: T): T;
}

export type CreateEmailConfirmationRouteClient = () => Promise<EmailConfirmationRouteClient>;

/**
 * N3, fix round 2026-09-01 (PR #488 Codex adversarial leg) — `otp_expired`
 * (verified against the current `supabase/auth` source via context7:
 * `ErrorCodeOTPExpired = "otp_expired"`) is Supabase's STABLE error code for
 * this branch, but it is NOT proof the code's window actually passed:
 * upstream returns the identical `otp_expired` for a wrong code, a
 * genuinely expired code, AND an email with no pending signup at all — one
 * code, three real causes this response cannot tell apart (very plausibly
 * deliberate on Supabase's side: distinguishing "unknown address" from
 * "wrong/expired code" here would be an email-enumeration oracle). This
 * function still names the `status=expired` branch — internal naming is
 * unaffected — but the CARD IT RENDERS must not claim certainty it doesn't
 * have (`messages/en.json`'s `ConfirmEmail.expiredTitle/Description`: "that
 * code didn't work", never "your code expired"). The security-relevant
 * distinction — does this failure count as a strike — does not need this
 * disambiguation either: the C1/C2 wall claimed the attempt BEFORE
 * `verifyOtp` even ran and settles it `"rejected"` on every one of these
 * three causes uniformly (`settleAttempt` below), so the wall's own
 * counting is what actually discriminates a real lockout from a rendering
 * choice — the copy does not have to. */
function isExpiredOtpError(error: VerifyOtpError | null): boolean {
  return error?.code === "otp_expired";
}

/**
 * Both redirects are built from the WALL'S OWN PROVEN origin, never
 * `request.url`'s authority — independent review of #455, MEDIUM-2 (kept
 * verbatim from the link-flow handler this file replaces): behind a proxy
 * those two diverge, and `request.url` can read an internal, plain-HTTP hop.
 * One validated value, every consumer.
 *
 * The query values this redirect ever carries are RESULT METADATA, never the
 * address — `status`, and the two numeric slots `remaining`/`wait`. This is
 * the SAME idiom the prior handler used for `status=invalid`; it does not
 * reopen W-H, which walls the ADDRESS specifically (part 1 §3.3).
 */
function confirmRedirect(
  origin: string,
  outcome: { status: "wrong"; remaining: number } | { status: "expired" }
    | { status: "locked"; wait: number } | { status: "unavailable" }
    | { status: "invalid" },
): NextResponse {
  const target = new URL("/auth/confirm", origin);
  target.search = "";
  target.hash = "";
  target.searchParams.set("status", outcome.status);
  if (outcome.status === "wrong") target.searchParams.set("remaining", String(outcome.remaining));
  if (outcome.status === "locked") target.searchParams.set("wait", String(outcome.wait));
  return NextResponse.redirect(target, { status: 303 });
}

function fixedSignupRedirect(origin: string): NextResponse {
  const target = new URL("/signup", origin);
  target.search = "";
  target.hash = "";
  return NextResponse.redirect(target, { status: 303 });
}

/** A successful verification must positively carry one matching user/session
 * pair. `error: null` without that session is not evidence that the cookie
 * session needed by `/signup` exists. */
function hasVerifiedSession(response: VerifyEmailResponse): boolean {
  const userId = response.data.user?.id;
  const session = response.data.session;
  return (
    response.error === null &&
    typeof userId === "string" &&
    userId.length > 0 &&
    typeof session?.access_token === "string" &&
    session.access_token.length > 0 &&
    session.user.id === userId
  );
}

/** Exactly one non-empty string field, or `null` — the same "reject a
 *  duplicated or blank field outright" discipline the prior token_hash
 *  handler used, extended to two fields instead of one. */
function singleNonEmptyField(form: FormData, name: string): string | null {
  const values = form.getAll(name);
  return values.length === 1 && typeof values[0] === "string" && values[0].length > 0
    ? values[0]
    : null;
}

/**
 * POST is the sole token-consuming execution root. `proveSameOrigin` runs
 * first and unconditionally — before the body is even read — exactly as the
 * link-flow handler did.
 */
export async function handleEmailConfirmationPost(
  request: Request,
  createClient: CreateEmailConfirmationRouteClient = createRouteClient,
  claimAttempt: ClaimConfirmationAttempt = defaultClaimConfirmationAttempt,
  settleAttempt: SettleConfirmationAttempt = defaultSettleConfirmationAttempt,
): Promise<Response> {
  // This is a login/session-creating mutation. A cross-origin page must not be
  // able to submit its own guess into somebody else's browser. Refused before
  // reading the body or constructing any auth client — a refused request has
  // no cookie-writing capability at all.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json(
      { ok: false, error: "cross-origin" },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const { supabase, sealResponse } = await createClient();

  const email = singleNonEmptyField(form, "email");
  const token = singleNonEmptyField(form, "token");
  if (email === null || token === null) {
    return sealResponse(confirmRedirect(proof.origin, { status: "invalid" }));
  }

  // THE C1/C2 WALL — before verifyOtp, always. §3.4: "the attempt is recorded
  // BEFORE the verification, never after," so a killed connection still
  // costs an attempt. The Lane-B seam's production default refuses with
  // `"unavailable"` — see confirmation-wall.ts's header.
  //
  // M1, fix round 2026-09-01 (PR #488 Codex adversarial leg): `originDigest`
  // is deliberately `undefined` here, NOT `proof.origin`. `proof.origin` is
  // `proveSameOrigin`'s CSRF proof — the `Origin` request header, identical
  // for every visitor to this deployment — never the C2 client-address
  // digest (`confirmation-wall.ts`'s `OriginDigest`: sha256(pepper ||
  // proxy-observed client IP), part 1 §4 option B). Feeding the header in
  // under the digest's name would key C2 on one shared value for the whole
  // deployment. Nothing upstream of this handler reads a trusted proxy-IP
  // header today, so there is no honest value to supply yet; Lane B adds it
  // when it wires the real runtime call (see confirmation-wall.ts's header
  // for why this is the chosen shape over minting a second refusal reason).
  const attempt = await claimAttempt({ email, originDigest: undefined });
  if (attempt.kind === "unavailable") {
    return sealResponse(confirmRedirect(proof.origin, { status: "unavailable" }));
  }
  if (attempt.kind === "rejected") {
    return sealResponse(
      confirmRedirect(proof.origin, { status: "locked", wait: attempt.retryAfterSeconds }),
    );
  }

  const response = await supabase.auth.verifyOtp({ type: "signup", email, token });

  // M2, fix round 2026-09-01: `attempt.attemptId` — the exact row this guess
  // was claimed against (part 3 §2.1) — rides both settlement calls below,
  // never a bare outcome string. Settling without it let a wrong-code and a
  // valid-code request in flight together stamp each other's attempt row.
  if (hasVerifiedSession(response)) {
    await settleAttempt(attempt.attemptId, "accepted");
    return sealResponse(fixedSignupRedirect(proof.origin));
  }

  await settleAttempt(attempt.attemptId, "rejected");
  if (isExpiredOtpError(response.error)) {
    return sealResponse(confirmRedirect(proof.origin, { status: "expired" }));
  }
  return sealResponse(
    confirmRedirect(proof.origin, { status: "wrong", remaining: attempt.remaining }),
  );
}
