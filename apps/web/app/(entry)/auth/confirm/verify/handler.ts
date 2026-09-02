import { NextResponse } from "next/server";

import {
  claimConfirmationAttempt as defaultClaimConfirmationAttempt,
  settleConfirmationAttempt as defaultSettleConfirmationAttempt,
  type ClaimConfirmationAttempt,
  type SettleConfirmationAttempt,
} from "./confirmation-wall";
import {
  confirmFlashCookie,
  confirmFlashMaxAgeSeconds,
  type ConfirmFlashOutcome,
  type ConfirmFlashPayload,
} from "../confirm-flash";
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
 *
 * N1 + N3 CLOSED (裁-109, beta-gating, most conservative option — owner
 * ruled after a plain-language briefing: 最保守，两个都修完再上线). Both were
 * pre-existing, measured NOT worsened by #488, found by the law-28 Codex
 * leg reviewing that PR, and recorded there as OPEN rather than fixed —
 * this PR is that fix, from fresh `main`, with the full ladder (fs4-
 * pr488-review design-conformance + one fresh-context opus review + the
 * law-28 Codex leg, a native lane building an auth surface).
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
 * N3 CLOSED — replaces the round-3/4/5 `isExpiredOtpError` classification
 * this file used to carry. That function only ever recognised Supabase's
 * literal `otp_expired` code, but upstream returns that SAME code for a
 * wrong guess, a genuinely expired code, AND an email with no pending
 * signup — and, separately, a banned account's own attempt surfaces its
 * OWN distinct code (`user_banned`, confirmed in the live `supabase/auth`
 * error registry, 2026-09-01), observably different from an unknown/normal
 * account's. Round 5 recorded both as open findings rather than fixing
 * them; 裁-109's ruling is to close them by FLATTENING rather than special-
 * casing `user_banned` — a special case would itself become a new,
 * narrower oracle, which is the whole reason nothing below ever reads
 * `error.code` again. Every verification failure — wrong code, expired
 * code, unknown email, banned account, anything else Supabase can return —
 * now renders through the exact same `"wrong"` flash outcome.
 *
 * THE ACCEPTED COST (stated to and accepted by the owner, 裁-109): round
 * 4's presentational split is gone — a person whose code had genuinely
 * timed out no longer sees a distinct "expired" card, only "that code
 * didn't work" with the same remaining-attempt count a wrong guess would
 * show. The security-relevant counting is unaffected either way: the
 * C1/C2 wall settles every one of these causes as `"rejected"` uniformly,
 * unchanged by this file.
 */

/**
 * Mints the redirect and its unforgeable flash cookie together — N1 CLOSED.
 * See `../confirm-flash.ts`'s header for the full mechanism (the nonce
 * binding, the cookie's attributes, and why a cookie was chosen over a
 * signed query param). The URL carries ONLY the marker; every value the
 * page actually renders — `remaining`, `waitSeconds`, which of the four
 * outcomes this is — comes from the cookie, which nobody but this server
 * could have set for this browser.
 *
 * Both redirects (this one and `fixedSignupRedirect` below) are built from
 * the WALL'S OWN PROVEN origin, never `request.url`'s authority —
 * independent review of #455, MEDIUM-2 (kept verbatim from the link-flow
 * handler this file replaces): behind a proxy those two diverge, and
 * `request.url` can read an internal, plain-HTTP hop. One validated value,
 * every consumer.
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
    return sealResponse(confirmRedirect(proof.origin, { kind: "invalid" }));
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
    return sealResponse(confirmRedirect(proof.origin, { kind: "unavailable" }));
  }
  if (attempt.kind === "rejected") {
    return sealResponse(
      confirmRedirect(proof.origin, { kind: "locked", waitSeconds: attempt.retryAfterSeconds }),
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
  // N3 CLOSED — every verification failure renders identically; see this
  // file's header for why `response.error` is never inspected here.
  return sealResponse(
    confirmRedirect(proof.origin, { kind: "wrong", remaining: attempt.remaining }),
  );
}
