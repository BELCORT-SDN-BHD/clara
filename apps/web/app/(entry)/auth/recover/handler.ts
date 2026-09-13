import { NextResponse } from "next/server";

import { addressedPublicOrigin, readSameOriginConfig } from "@/lib/same-origin";
import { createRouteClient } from "@/lib/supabase/server";

type ExchangeError = { message: string; code?: string; status?: number };

type ExchangeResult = {
  data: { session: { access_token: string } | null };
  error: ExchangeError | null;
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

/**
 * #622 — the four failure shapes `POST /token?grant_type=pkce` actually
 * distinguishes, verified against the current Supabase Auth error catalog
 * via Context7 (`/supabase/auth`, `internal/api/apierrors/errorcode.go` +
 * `_autodocs/api-reference/authentication.md`, 2026-09-13):
 *
 *   flow_state_expired (422)      the code was real but aged out
 *   flow_state_not_found (404)    the code is unknown OR already spent —
 *                                 GoTrue destroys a flow state the moment it
 *                                 is exchanged, so "used" and "never issued"
 *                                 are the SAME wire shape; there is no
 *                                 provider signal to tell them apart, hence
 *                                 one bucket rather than a distinction this
 *                                 door cannot make
 *   bad_code_verifier (400)       a mismatched PKCE verifier — the browser
 *                                 that opened the link is not the one that
 *                                 is exchanging the code
 *   over_request_rate_limit (429) the shared per-endpoint wall
 *
 * Everything else (a code this build does not recognise, a transport failure
 * with no `code` at all, the missing-`code`-param case above) stays on the
 * existing `invalid` bucket rather than inventing a fifth status nobody asked
 * for.
 *
 * `otp_expired` is included in the `expired` bucket: the token_hash fallback
 * shape (not the PKCE `code` this route reads, but the same catalog) returns
 * that ONE code for both an expired and an already-used token — there is no
 * wire signal to split it, so PKCE's own two-way split is not something the
 * copy at `/forgot-password` may promise for that shape either.
 */
export type RecoveryLinkStatus = "expired" | "used_or_unknown" | "refused" | "rate_limited" | "invalid";

const CODE_TO_STATUS: Readonly<Record<string, RecoveryLinkStatus>> = {
  flow_state_expired: "expired",
  otp_expired: "expired",
  flow_state_not_found: "used_or_unknown",
  bad_code_verifier: "refused",
  over_request_rate_limit: "rate_limited",
};

/** `status` maps the identical four HTTP codes GoTrue returns for these exact
 *  failures — a fallback for "an error that occurred before a response was
 *  received" (`AuthError#status`'s own documented case, where `code` is also
 *  absent), read in the order the brief names both fields: `code` first,
 *  `status` only when `code` did not resolve. */
const STATUS_TO_STATUS: Readonly<Record<number, RecoveryLinkStatus>> = {
  422: "expired",
  404: "used_or_unknown",
  400: "refused",
  429: "rate_limited",
};

function classifyExchangeFailure(error: ExchangeError | null): RecoveryLinkStatus {
  if (error === null) return "invalid";
  if (error.code !== undefined) {
    const byCode = CODE_TO_STATUS[error.code];
    if (byCode !== undefined) return byCode;
  }
  if (error.status !== undefined) {
    const byStatus = STATUS_TO_STATUS[error.status];
    if (byStatus !== undefined) return byStatus;
  }
  return "invalid";
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
    const status = classifyExchangeFailure(result.error);
    return sealResponse(redirect(origin, `/forgot-password?status=${status}`));
  }
  return sealResponse(redirect(origin, "/auth/recover/password"));
}
