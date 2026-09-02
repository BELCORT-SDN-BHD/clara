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
 * Gate: EVERY route is protected EXCEPT /login, /invite/:token (the
 * invite-accept flow), /signup (the tier-3 self-serve registration face), and
 * /auth/confirm (the explicit email-token exchange). Each must work before a
 * session exists, alongside the framework/static paths the exported
 * `config.matcher` below already excludes. There is no public marketing root
 * in this app — "/" is the firm-altitude home and is gated like everything
 * else (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3; §0.4 of the
 * handoff — Supabase Auth cookie sessions).
 *
 * /signup joined the allowlist in P4-3 under **裁-57** (2026-08-30 evening):
 * beta is a PAID launch and signup is tier-3 self-serve. The handoff's §0.4
 * "invite-only" reading is superseded by that ruling — "invite" now means an
 * RBAC membership invite INTO an existing firm, not the only way in.
 *
 * THE HOLDING ROUTE /pending IS DELIBERATELY NOT HERE. It requires a session;
 * it just does not require a FIRM (design §4 E). Adding it would let an
 * unauthenticated stranger load a page whose entire job is to report the
 * caller's own registration status.
 * (Written without the bold markers the rest of this file uses for emphasis:
 * a literal `**` before a path spells a comment terminator and silently ends
 * this block — measured, on this exact line.)
 *
 * THIS LIST IS CROSS-CHECKED BOTH WAYS against `lib/require-firm-scope.ts`'s
 * `SCOPE_UNSCOPED_SURFACES` (the entries marked `public: true`) by
 * `tests/firm-scope-surfaces.test.ts`, so the app's auth gate and the scope
 * spine's idea of "public" cannot drift apart. Adding a prefix here without
 * registering its page there reds that suite, and vice versa.
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

export const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/invite",
  "/signup",
  "/auth/confirm",
  ...(process.env.CLARA_E2E_MONEY_INPUT_HARNESS === "1"
    ? ["/money-input-harness"]
    : []),
];

/**
 * EXPORTED so `tests/proxy-matcher.test.ts` drives THIS function rather than a
 * re-typed copy of the list (review law 3 — a test that re-declares the
 * prefixes is asserting its own spelling, not this gate's behaviour). It is a
 * pure predicate over a pathname: exporting it widens no surface.
 *
 * Prefix semantics, asserted both ways by that suite: a prefix matches the path
 * EXACTLY or as a `/`-delimited ancestor. `/signup` is public; `/signup/x` is
 * public; **`/signupsomething` is NOT** — the `${prefix}/` guard is what stops a
 * mere string-prefix collision from opening a route nobody allowlisted.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export type TokenRouteReferrerPolicy = "no-referrer" | "strict-origin";

/**
 * The confirmation POST needs the browser to retain its serialized Origin for
 * the route's same-origin wall. `no-referrer` makes a form navigation's Origin
 * opaque (`null`) in real browsers, so confirmation keeps only the origin and
 * never the token-bearing path/query. Invite acceptance has no same-origin form
 * POST and retains the stricter policy it already carried.
 *
 * Exported so the route split is driven directly in tests rather than inferred
 * from a source-code spelling. Segment boundaries match `isPublicPath` above.
 */
export function referrerPolicyForPath(
  pathname: string,
): TokenRouteReferrerPolicy | null {
  if (pathname === "/invite" || pathname.startsWith("/invite/")) {
    return "no-referrer";
  }
  if (
    pathname === "/auth/confirm" ||
    pathname.startsWith("/auth/confirm/")
  ) {
    return "strict-origin";
  }
  return null;
}

export type ConfirmCacheHeaders = { readonly cacheControl: string; readonly vary: string };

/**
 * FOLD 2 (N1 design review, 裁-109's fix) — pinning what used to be
 * structural for free. Before the flash-cookie fix, `/auth/confirm`
 * rendered a DIFFERENT URL per outcome (`?status=locked&wait=900` vs
 * `?status=wrong&remaining=3`, …), so one person's card being cache-served
 * to another was structurally impossible — there was nothing to key a cache
 * on besides the URL, and every outcome had its own. After the fix, every
 * outcome is the SAME URL (`/auth/confirm?flash=<nonce>`) differing only by
 * the REQUEST COOKIE.
 *
 * F2 CORRECTION (fresh opus review, 2026-09-01) — the original version of
 * this comment claimed "this repo sets no Cache-Control … on this route
 * today." FALSE: `applyAuthState` (`response-state.ts`) already sets
 * `Cache-Control: private, no-store` UNCONDITIONALLY on every proxied
 * response, confirm included — this function's `cacheControl` value is the
 * IDENTICAL string, so on the Cache-Control half it is a pinned, EXPLICIT
 * route-level floor layered on top of an already-real global one, not a
 * fresh assertion filling an actual gap. What was genuinely missing —
 * `Vary: Cookie` — is the half that matters: `applyAuthState` never touches
 * `Vary`, so before this fix there really was nothing preventing one
 * person's rendered card from being cache-served to the next visitor
 * (review law 2: absence of a cache header is not evidence there is no
 * caching). See `updateSession` below for WHERE this now applies — hoisted
 * ABOVE `applyAuthState`'s call so a `@supabase/ssr`-queued, STRICTER
 * `Cache-Control` (a cookie refresh's own `no-cache, must-revalidate,
 * max-age=0`) still wins over this route's floor, per `response-state.ts`'s
 * own documented ordering invariant — this block must never run after it.
 * `tests/proxy-matcher.test.ts` pins the returned values (the
 * `referrerPolicyForPath` idiom immediately above, applied to a second
 * header pair); the DELIVERY (that this function's output is actually
 * wired into a response) is pinned in the e2e instead
 * (`e2e/signup-confirm-pending.spec.ts`), the same instrument that already
 * asserts `referrer-policy` off a REAL `/auth/confirm` response.
 *
 * Segment boundaries match `isPublicPath`/`referrerPolicyForPath` above.
 */
export function confirmCacheHeadersForPath(pathname: string): ConfirmCacheHeaders | null {
  if (pathname === "/auth/confirm" || pathname.startsWith("/auth/confirm/")) {
    return { cacheControl: "private, no-store", vary: "Cookie" };
  }
  return null;
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

  // F2 CORRECTION (fresh opus review, 2026-09-01): this block MUST run
  // BEFORE `applyAuthState` below, not after. `applyAuthState` sets its own
  // `Cache-Control` floor and then, if `@supabase/ssr` queued a STRICTER
  // one during a cookie refresh, overwrites the floor with it (`response-
  // state.ts`'s own documented ordering invariant). Running this block
  // AFTER `applyAuthState` would let this route's `Cache-Control` write
  // clobber that stricter, later value right back down — inverting the
  // invariant for confirm specifically. Hoisted here, the ordering holds:
  // this sets an explicit route floor, and whatever `applyAuthState` does
  // next (repeat the floor, or override with something stricter) still
  // wins. `Vary` uses `append`, not `set` — this is the only writer of it
  // today, but `append` is the safe idiom if Next ever adds its own RSC
  // `Vary` value after the proxy runs.
  //
  // 裁-109 round (2026-09-01) — the `Cache-Control` write below is
  // DOCUMENTARY, not protective. `applyAuthState` runs unconditionally for
  // BOTH branches a few lines down, and its very first statement is
  // `response.headers.set("Cache-Control", AUTH_RESPONSE_CACHE_CONTROL)` —
  // the identical "private, no-store" literal `confirmCacheHeadersForPath`
  // returns for this path. So the `.set()` two lines below is superseded
  // by `applyAuthState`'s `.set()` one line later NO MATTER WHAT IT WRITES.
  // The effective header on the wire is correct and the e2e's
  // `cache-control` pin (`signup-confirm-pending.spec.ts`) is a real
  // assertion against a real response — but it passes because of the
  // GLOBAL auth floor in `response-state.ts`, not because of this
  // route-specific line. Keep the line — it is a useful breadcrumb of
  // intent — but do not read it as enforcement: it does NOT protect this
  // route if the global floor is ever weakened, and the e2e pin cannot see
  // that gap either, since it only observes the response the two writers
  // jointly produce.
  //
  // `Vary`'s `append` (not `set`) is still the right idiom here, but round
  // 2 (2026-09-02) CONFIRMED the risk this comment used to only warn
  // about: Next 16.3.3's own App Router OVERWRITES `Vary` for this
  // dynamic route with its own RSC negotiation tokens regardless of what
  // this `append` call, or `applyAuthState`, put there — proven by the
  // e2e AND a bare `curl` against the built app (see
  // `signup-confirm-pending.spec.ts`'s own comment at its `vary`
  // assertion for the full evidence and the two follow-up fixes that
  // ALSO lost to this: `next.config.ts`'s `headers()`, and there being no
  // route-segment header hook for a plain page). `Vary: Cookie` therefore
  // does not reach a real client today — `append` is kept anyway because
  // it costs nothing and becomes correct the moment a future Next
  // version stops clobbering it; the e2e's assertion is written to go
  // red exactly when that day comes, so this is not a "fix it later and
  // forget" situation. The primary control against cross-user response
  // caching is `Cache-Control: private, no-store` above, which Next does
  // NOT touch and which alone forbids a shared cache from storing this
  // response.
  const cacheHeaders = confirmCacheHeadersForPath(request.nextUrl.pathname);
  if (cacheHeaders !== null) {
    response.headers.set("Cache-Control", cacheHeaders.cacheControl);
    response.headers.append("Vary", cacheHeaders.vary);
  }

  // ONE application point, for BOTH branches — the pass-through and the
  // redirect (findings 1 and 12). lib/supabase/response-state.ts.
  applyAuthState(response, queued);

  // Both URLs carry single-use bearer values. The invite sends no referrer;
  // confirmation sends only its origin because its real browser form POST must
  // carry a non-opaque Origin into the same-origin wall.
  const referrerPolicy = referrerPolicyForPath(request.nextUrl.pathname);
  if (referrerPolicy !== null) {
    response.headers.set("Referrer-Policy", referrerPolicy);
  }

  return response;
}
