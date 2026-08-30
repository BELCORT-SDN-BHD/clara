import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/same-origin";
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
  sealResponse<T extends Response>(response: T): T;
}

export type CreateEmailConfirmationRouteClient = () => Promise<EmailConfirmationRouteClient>;

function fixedRedirect(request: Request, path: "/signup" | "/auth/confirm", invalid = false) {
  const target = new URL(path, request.url);
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
  if (!isSameOriginRequest(request.headers, request.url)) {
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
    return sealResponse(fixedRedirect(request, "/auth/confirm", true));
  }

  const response = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenValues[0],
  });

  return sealResponse(
    hasVerifiedSession(response)
      ? fixedRedirect(request, "/signup")
      : fixedRedirect(request, "/auth/confirm", true),
  );
}
