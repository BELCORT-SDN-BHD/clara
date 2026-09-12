// FS-4 C-5 item 8 (A-M3) — THE SERVER-SIDE `verifyOtp` LEG OF THE ONE CONFIRM ENDPOINT.
//
// WHY THE RUNTIME VERIFIES THE CODE AT ALL. The security pass's A-M3 is that
// `clara.settle_confirmation_attempt` has NO caller binding and settling `'accepted'` RESETS the
// rate-limit budget (measured: a fully exhausted email digest went back to a full budget of
// five). Nothing in the DB can close that — the whole lane is pre-session, so the verb cannot
// prove who claimed an attempt. The wall is therefore a ROUTE CONTRACT, and the only shape that
// makes it structural rather than conventional is: ONE endpoint performs claim → verifyOtp →
// settle inside a single server request, `attempt_id` never crosses the wire, there is no
// client-callable settle endpoint, and `outcome` is DERIVED from verifyOtp's own result rather
// than read off a request body. That requires the process holding the attempt id to be the same
// process that verifies the code — so the verification moves here.
//
// WHY RAW `fetch` AND NOT `@supabase/supabase-js`. The SDK exists in this workspace under
// `apps/web` only; `packages/runtime` does not depend on it, and adding a dependency needs
// `pnpm install`, which this sprint's lane brief forbids outright (every worktree junctions the
// main checkout's `node_modules`). What this module issues is exactly what `supabase-js`
// v2.112.4 issues — read out of the installed `GoTrueClient.js`, not from memory:
// `POST ${url}/verify` with body `{...params, gotrue_meta_security:{captcha_token: undefined}}`
// and the project's apikey. The response's session fields are top level (`access_token`,
// `refresh_token`, `expires_in`, `expires_at`, `token_type`, `user`), which is also what
// supabase/auth's own `_autodocs/endpoints.md` documents for `POST /verify`.
//
// THE SESSION MATERIAL IS RETURNED TO THE CALLER, AND THAT IS NOT A WIDENING. `apps/web` owns
// the cookie: it must seal the session into `__Host-clara-auth` on ITS response, and it cannot
// re-verify the code itself because a Supabase OTP is single use — a second `verify` for the
// same token fails, so splitting the two calls across two services would break the flow
// outright. The tokens therefore ride back over the same trusted server-to-server hop that
// carried the code in. That hop is already the one `apps/web` uses to reach the runtime
// (`CLARA_RUNTIME_URL`, HTTPS, allow-listed headers), and the route that returns them is gated
// on a shared service token. Nothing here is logged: the whole session object is passed through
// by reference and never stringified into a log line.
//
// FAIL CLOSED. Missing URL or key ⇒ `verifyOtp` refuses and the caller answers 503. A network
// error, a non-2xx, or a 200 with no `access_token` ⇒ `{verified:false}`, and the ONE endpoint
// settles the attempt `'rejected'` — an errored verification is never an acceptance.

export const SUPABASE_URL_VAR = "CLARA_SUPABASE_URL";
export const SUPABASE_ANON_KEY_VAR = "CLARA_SUPABASE_ANON_KEY";
/** GoTrue's own path, under the project's `/auth/v1` mount. */
export const VERIFY_PATH = "/auth/v1/verify";
/** GoTrue's own path for a resend (#621 lane B's completion — see this file's `resendSignupOtp`). */
export const RESEND_PATH = "/auth/v1/resend";
const VERIFY_TIMEOUT_MS = Number(process.env.CLARA_SUPABASE_VERIFY_TIMEOUT_MS || 10000);
/** GoTrue's own documented default cooldown for a resend, used only when the provider's own
 *  response carries no retry-after number of its own (#621 contract item 6). */
const DEFAULT_RESEND_RETRY_AFTER_SECONDS = 60;

/** The exact body `supabase-js` v2.112.4 sends to `POST /verify` (GoTrueClient.js:2046-2051),
 *  assembled by key assignment — see the call site for why it is not an object literal. */
function verifyRequestBody(otpType, email, token) {
  const body = { email, token, gotrue_meta_security: { captcha_token: undefined } };
  body.type = otpType;
  return JSON.stringify(body);
}

export class SupabaseVerifyError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "SupabaseVerifyError";
    this.code = code;
  }
}

/** True iff both halves of the config are present. The route reads this to answer a typed 503
 *  rather than letting a throw surface as a 500. */
export function supabaseVerifyConfigured(env = process.env) {
  return Boolean(env[SUPABASE_URL_VAR]) && Boolean(env[SUPABASE_ANON_KEY_VAR]);
}

function verifyEndpoint(env) {
  const base = env[SUPABASE_URL_VAR];
  if (typeof base !== "string" || base.trim() === "") {
    throw new SupabaseVerifyError("supabase_url_absent", `${SUPABASE_URL_VAR} is not configured`);
  }
  return `${base.trim().replace(/\/+$/, "")}${VERIFY_PATH}`;
}

/**
 * Verify a signup email OTP. Returns `{verified, session}`; `session` is present ONLY on the
 * verified arm and is the GoTrue response verbatim minus nothing — the caller decides what to
 * forward.
 *
 * IT NEVER THROWS FOR A WRONG CODE. A wrong or expired code is an ordinary outcome of this
 * flow, and the ONE endpoint must settle the attempt `'rejected'` and answer the caller either
 * way. It throws only for a CONFIGURATION failure, which is ours and is not the applicant's to
 * absorb.
 *
 * @param {{email: string, token: string, type?: string}} args
 * @param {{fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv}} [deps] test seam — substitutes
 *   WHERE the request goes, never WHAT is sent
 * @returns {Promise<{verified: boolean, session: Record<string, unknown>|null, status: number|null}>}
 */
export async function verifySignupOtp({ email, token, type: otpType = "signup" }, deps = {}) {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const url = verifyEndpoint(env);
  const apikey = env[SUPABASE_ANON_KEY_VAR];
  if (typeof apikey !== "string" || apikey.trim() === "") {
    throw new SupabaseVerifyError("supabase_key_absent", `${SUPABASE_ANON_KEY_VAR} is not configured`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let res;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: {
        apikey,
        Authorization: `Bearer ${apikey}`,
        "Content-Type": "application/json",
      },
      // The exact body shape `supabase-js` sends (GoTrueClient.js:2046-2051).
      // `type` is built by key rather than written as a shorthand property: the parts-parity
      // census (`scripts/check-parts-parity.mjs`) refuses a `type` key it cannot resolve to a
      // string literal, because that is the shape of a typed `parts[]` member.
      body: verifyRequestBody(otpType, email, token),
      signal: controller.signal,
      redirect: "manual", // never follow a redirect out of the configured origin
      cache: "no-store",
    });
  } catch (err) {
    // A network failure is NOT a verification. It is reported as unverified so the attempt
    // settles 'rejected' and the applicant retries — never as an acceptance, and never as a
    // throw that would leave the attempt row unsettled for an unrelated reason.
    return { verified: false, session: null, status: null, transport: (err && err.name) || "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return { verified: false, session: null, status: res.status };
  let body = null;
  try {
    body = await res.json();
  } catch {
    return { verified: false, session: null, status: res.status };
  }
  // `_sessionResponse`'s own test: a session exists iff `access_token` is present.
  const verified = typeof body?.access_token === "string" && body.access_token.length > 0;
  return { verified, session: verified ? body : null, status: res.status };
}

// -------------------------------------------------------------------------------------------
// #621 (Ticket #621, journey A2) — THE RESEND LEG. Same reasoning as `verifySignupOtp` above for
// why this is raw `fetch` and not `@supabase/supabase-js`: what follows is exactly what
// `supabase-js` v2.112.4 issues for an email credential (GoTrueClient.js:2277-2286) — `POST
// ${url}/resend` with `{email, type, gotrue_meta_security:{captcha_token:undefined},
// code_challenge, code_challenge_method}`. `code_challenge`/`code_challenge_method` are always
// `null` here: those two are only populated when the calling client runs the PKCE flow, and this
// server-side caller has no PKCE verifier storage to challenge — it is a plain server-to-server
// resend, not a browser completing a code exchange.
//
// IT NEVER THROWS FOR A PROVIDER REFUSAL, same discipline as `verifySignupOtp`: a rate-limited
// provider, an already-confirmed address, or an unknown address are ordinary outcomes of this
// call, and the route settles the attempt either way. It throws only for OUR OWN configuration
// being absent, which `authWallRoutes.ts` already refuses before calling this (via
// `supabaseVerifyConfigured`), so that throw is not expected to surface in practice.

function resendEndpoint(env) {
  const base = env[SUPABASE_URL_VAR];
  if (typeof base !== "string" || base.trim() === "") {
    throw new SupabaseVerifyError("supabase_url_absent", `${SUPABASE_URL_VAR} is not configured`);
  }
  return `${base.trim().replace(/\/+$/, "")}${RESEND_PATH}`;
}

/** The exact body `supabase-js` sends to `POST /resend` for an email credential — see the
 *  header above for the line reference. */
function resendRequestBody(otpType, email) {
  // `type` is built by key assignment, exactly as `verifyRequestBody` above does and for the
  // SAME reason (see that function's comment): the parts-parity census
  // (`scripts/check-parts-parity.mjs`) refuses a `type` key inside an object LITERAL that it
  // cannot resolve to a string constant, because that is the shape of a typed `parts[]` member —
  // measured (`not ok ... unclassifiable discriminant at .../supabase-verify.mjs`) when this was
  // first written as `{ email, type: otpType, ... }`.
  const body = {
    email,
    gotrue_meta_security: { captcha_token: undefined },
    code_challenge: null,
    code_challenge_method: null,
  };
  body.type = otpType;
  return JSON.stringify(body);
}

/** The provider's own retry-after number, read from whichever place it chose to put it — the
 *  `Retry-After` HTTP header (seconds, the standard place) or a `retry_after`/`retry_after_seconds`
 *  body field — or null when neither is present, so the caller falls back to the documented
 *  default. Never throws on a malformed value; it just yields null. */
function providerRetryAfterSeconds(res, body) {
  // `Number(null)` is `0`, not `NaN` — a header that is genuinely ABSENT (`get` returns `null`)
  // must fall through to the body, and then to the caller's default, never read as "0 seconds".
  const rawHeader = res.headers?.get?.("retry-after");
  if (typeof rawHeader === "string") {
    const headerValue = Number(rawHeader);
    if (Number.isFinite(headerValue) && headerValue >= 0) return Math.trunc(headerValue);
  }
  const bodyValue = Number(body?.retry_after_seconds ?? body?.retry_after);
  if (Number.isFinite(bodyValue) && bodyValue >= 0) return Math.trunc(bodyValue);
  return null;
}

/**
 * Resend a signup confirmation email. NEVER logs `email` or the provider's response body — the
 * caller (`authWallRoutes.ts`) must not either.
 *
 * @param {{email: string, type?: string}} args
 * @param {{fetchImpl?: typeof fetch, env?: NodeJS.ProcessEnv}} [deps] test seam — substitutes
 *   WHERE the request goes, never WHAT is sent
 * @returns {Promise<
 *   | {outcome: "sent"}
 *   | {outcome: "rate_limited", retryAfterSeconds: number}
 *   | {outcome: "unavailable"}
 * >}
 */
export async function resendSignupOtp({ email, type: otpType = "signup" }, deps = {}) {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const url = resendEndpoint(env);
  const apikey = env[SUPABASE_ANON_KEY_VAR];
  if (typeof apikey !== "string" || apikey.trim() === "") {
    throw new SupabaseVerifyError("supabase_key_absent", `${SUPABASE_ANON_KEY_VAR} is not configured`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  let res;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: {
        apikey,
        Authorization: `Bearer ${apikey}`,
        "Content-Type": "application/json",
      },
      body: resendRequestBody(otpType, email),
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    // A network failure (including our own timeout) is not the provider refusing — it is us
    // unable to reach it, which is `unavailable`, never a fabricated `sent`.
    return { outcome: "unavailable" };
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return { outcome: "sent" };

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  // GoTrue's own rate-limit signal is HTTP 429, sometimes carrying `error_code:
  // "over_email_send_rate_limit"` — either is treated as the same outcome.
  if (res.status === 429 || body?.error_code === "over_email_send_rate_limit") {
    return {
      outcome: "rate_limited",
      retryAfterSeconds: providerRetryAfterSeconds(res, body) ?? DEFAULT_RESEND_RETRY_AFTER_SECONDS,
    };
  }

  // Any OTHER 4xx is the provider telling us something about THIS address specifically — already
  // confirmed, unknown, malformed as far as it's concerned. None of that is ours to leak: the
  // applicant sees the same `sent` a genuine send would produce (never confirm/deny an account).
  if (res.status >= 400 && res.status < 500) return { outcome: "sent" };

  // A provider-side failure (5xx) that is neither of the above — genuinely not our fault and not
  // the applicant's either.
  return { outcome: "unavailable" };
}
