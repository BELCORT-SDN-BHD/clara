import { NextResponse } from "next/server";

import { readSameOriginConfig } from "@/lib/same-origin";
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

function callbackOrigin(request: Request): string {
  return readSameOriginConfig(process.env).publicOrigins[0] ?? new URL(request.url).origin;
}

function redirect(origin: string, path: string): NextResponse {
  const target = new URL(path, origin);
  target.hash = "";
  return NextResponse.redirect(target, { status: 303 });
}

export async function handlePasswordRecovery(
  request: Request,
  createClient: CreatePasswordRecoveryRouteClient = createRouteClient,
): Promise<Response> {
  const origin = callbackOrigin(request);
  const code = new URL(request.url).searchParams.get("code");
  const { supabase, sealResponse } = await createClient();
  if (!code) return sealResponse(redirect(origin, "/forgot-password?status=invalid"));

  const result = await supabase.auth.exchangeCodeForSession(code);
  if (result.error !== null || !result.data.session?.access_token) {
    return sealResponse(redirect(origin, "/forgot-password?status=invalid"));
  }
  return sealResponse(redirect(origin, "/auth/recover/password"));
}
