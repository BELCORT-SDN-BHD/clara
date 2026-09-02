import { NextResponse } from "next/server";

import { addressedPublicOrigin, readSameOriginConfig } from "@/lib/same-origin";
import { createRouteClient } from "@/lib/supabase/server";

type ExchangeResult = {
  data: { session: { access_token: string } | null };
  error: { message: string } | null;
};

export interface PasswordRecoveryRouteClient {
  supabase: {
    auth: { exchangeCodeForSession(code: string): Promise<ExchangeResult> };
  };
  sealResponse<T extends NextResponse>(response: T): T;
}

export type CreatePasswordRecoveryRouteClient = () => Promise<PasswordRecoveryRouteClient>;

/**
 * The origin this 303 lands on. NOT derived here — `lib/same-origin.ts` owns
 * both the allowlist parser and the "which of our origins did this request
 * address" ruling, so this handler and the invite courier can never drift onto
 * two different answers (that file's own MEDIUM-2 header). `null` is a refusal,
 * never a fallback to an origin nobody addressed.
 */
function callbackOrigin(
  request: Request,
  env: Record<string, string | undefined>,
): string | null {
  return addressedPublicOrigin(request.headers, request.url, readSameOriginConfig(env));
}

/**
 * A request this deployment cannot place on one of its own public origins is
 * refused BEFORE the one-time code is spent — a redirect to a guessed origin
 * would burn the code and strand the person with no session, and there is no
 * safe third choice. Typed, no provider prose, and never cached.
 */
function originRefusal(): Response {
  return Response.json(
    { error: "recovery_origin_not_allowed" },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
}

function redirect(origin: string, path: string): NextResponse {
  const target = new URL(path, origin);
  target.hash = "";
  return NextResponse.redirect(target, { status: 303 });
}

export async function handlePasswordRecovery(
  request: Request,
  createClient: CreatePasswordRecoveryRouteClient = createRouteClient,
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  const origin = callbackOrigin(request, env);
  if (origin === null) return originRefusal();
  const code = new URL(request.url).searchParams.get("code");
  const { supabase, sealResponse } = await createClient();
  if (!code) return sealResponse(redirect(origin, "/forgot-password?status=invalid"));

  const result = await supabase.auth.exchangeCodeForSession(code);
  if (result.error !== null || !result.data.session?.access_token) {
    return sealResponse(redirect(origin, "/forgot-password?status=invalid"));
  }
  return sealResponse(redirect(origin, "/auth/recover/password"));
}
