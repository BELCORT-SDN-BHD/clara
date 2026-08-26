import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import {
  applyAuthState,
  emptyAuthState,
} from "@/lib/supabase/response-state";

/**
 * updateSession() — the session-refresh + route-gate logic behind the root
 * `proxy.ts`. Split into its own file (current @supabase/ssr + Next.js
 * convention, verified via context7 2026-08-27) so the auth logic is
 * testable independent of the file Next.js requires at the app root.
 *
 * Gate: EVERY route is protected EXCEPT /login and /invite/:token (the
 * invite-accept flow, which must work before a session exists) and the
 * framework/static paths the exported `config.matcher` below already
 * excludes. There is no public marketing root in this app — "/" is the
 * firm-altitude home and is gated like everything else
 * (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3; §0.4 of the
 * handoff — Supabase Auth cookie sessions, invite-only).
 *
 * RESPONSE CONSTRUCTION (cross-model security review 2026-08-27, findings 1
 * and 12). Cookie writes and the headers that protect them are QUEUED here
 * and applied to whichever response actually leaves this function — the
 * pass-through one AND the unauthenticated redirect:
 *
 *  - finding 1 (HIGH): `setAll(cookiesToSet, headers)`'s second argument
 *    carries `Cache-Control: private, no-cache, no-store, must-revalidate,
 *    max-age=0`, `Expires: 0` and `Pragma: no-cache` — the pinned SDK's own
 *    defence against a CDN storing a response that carries a refreshed JWT in
 *    `Set-Cookie` and replaying it to the NEXT visitor, who is then signed in
 *    as the first one. The previous implementation accepted only the first
 *    argument and silently dropped that defence.
 *  - finding 12 (LOW): the redirect branch used to return a fresh
 *    `NextResponse.redirect()` that carried none of the queued cookies, so a
 *    session-clearing cookie deletion queued during `getClaims()` was thrown
 *    away and the browser kept a stale, half-dead session.
 */

const PUBLIC_PATH_PREFIXES = ["/login", "/invite"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  // Queued, never applied to a response inside the callback: the response
  // this function returns is not chosen until the gate decision below.
  const queued = emptyAuthState();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Headers first: a throw while copying cookies must not be able to
          // lose the anti-cache headers that protect them.
          for (const [key, value] of Object.entries(headers ?? {})) {
            queued.headers[key] = value;
          }
          for (const { name, value, options } of cookiesToSet) {
            // Mutating the REQUEST cookie jar is what makes the refreshed
            // value visible to the Server Components rendered downstream of
            // this proxy; `NextResponse.next({ request })` below snapshots the
            // mutated request headers.
            request.cookies.set(name, value);
            queued.cookies.push({ name, value, options });
          }
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users
  // being randomly logged out (current @supabase/ssr Next.js guidance).
  //
  // getClaims(), never getSession(), for this gate: getClaims() verifies the
  // JWT signature on every call, while getSession() reads the session as
  // stored and is not guaranteed to revalidate it — trusting it here would
  // let a spoofed cookie masquerade as a live session.
  //
  // Residual, recorded not fixed (review finding 5, README "Security posture
  // — owner/deploy obligations"): a signature-valid access JWT stays
  // acceptable here until its `exp`, even if the session was revoked
  // server-side. The bound is the configured access-token lifetime.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const isUnauthenticated = !claims && !isPublicPath(request.nextUrl.pathname);

  let response: NextResponse;
  if (isUnauthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Drop the original query string wholesale before writing `next` — an
    // attacker-supplied param on the blocked URL has no business riding into
    // the login page's own query string.
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    response = NextResponse.redirect(url);
  } else {
    // IMPORTANT: this response must be built from the (cookie-mutated)
    // `request` — creating a fresh NextResponse that does not carry those
    // cookies forward desyncs the browser and server session state and can
    // terminate the user's session prematurely.
    response = NextResponse.next({ request });
  }

  // ONE application point, for BOTH branches — the pass-through and the
  // redirect (findings 1 and 12). lib/supabase/response-state.ts.
  applyAuthState(response, queued);

  // The invite link's `token_hash` is a single-use bearer capability sitting
  // in the URL (review finding 9). `no-referrer` keeps it out of the
  // `Referer` header of every asset and API request the invite page makes.
  if (request.nextUrl.pathname.startsWith("/invite")) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}
