import { NextResponse } from "next/server";

import { proveSameOrigin } from "@/lib/same-origin";
import { createRouteClient } from "@/lib/supabase/server";

type VerifyEmailResponse = {
  data: {
    user: { id: string } | null;
    session: {
      access_token: string;
      user: { id: string };
    } | null;
  };
  error: { message?: string } | null;
};

export interface EmailConfirmationRouteClient {
  supabase: {
    auth: {
      verifyOtp(params: {
        type: "email";
        token_hash: string;
      }): Promise<VerifyEmailResponse>;
    };
  };
  sealResponse<T extends NextResponse>(response: T): T;
}

export type CreateEmailConfirmationRouteClient = () => Promise<EmailConfirmationRouteClient>;

/**
 * Both redirects are built from the WALL'S OWN PROVEN origin, never
 * `request.url`'s authority — independent review of #455, MEDIUM-2:
 * behind a proxy those two diverge, and `request.url` can read an internal,
 * plain-HTTP hop (`lib/same-origin.ts`'s own header explains why the invite
 * courier was fixed the same way). One validated value, both consumers.
 */
function fixedRedirect(origin: string, path: "/signup" | "/auth/confirm", invalid = false) {
  const target = new URL(path, origin);
  target.search = "";
  target.hash = "";
  if (invalid) target.searchParams.set("status", "invalid");
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

/**
 * POST is the sole token-consuming execution root. It reads exactly one
 * `token_hash`; hostile `type` and `next` fields are ignored because the OTP
 * purpose and both redirects are literals below.
 */
export async function handleEmailConfirmationPost(
  request: Request,
  createClient: CreateEmailConfirmationRouteClient = createRouteClient,
): Promise<Response> {
  // This is a login/session-creating mutation. A cross-origin page must not be
  // able to submit its own token into somebody else's browser and install the
  // attacker's session there. Refuse before reading the bearer or constructing
  // any auth client: a refused request has no cookie-writing capability at all.
  // `proof.origin` (present only on `ok: true`) is the ONE value both
  // redirects below are built from — never `request.url`'s own authority.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return NextResponse.json(
      { ok: false, error: "cross-origin" },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const tokenValues = form.getAll("token_hash");
  const { supabase, sealResponse } = await createClient();

  if (
    tokenValues.length !== 1 ||
    typeof tokenValues[0] !== "string" ||
    tokenValues[0].length === 0
  ) {
    return sealResponse(fixedRedirect(proof.origin, "/auth/confirm", true));
  }

  const response = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenValues[0],
  });

  return sealResponse(
    hasVerifiedSession(response)
      ? fixedRedirect(proof.origin, "/signup")
      : fixedRedirect(proof.origin, "/auth/confirm", true),
  );
}
