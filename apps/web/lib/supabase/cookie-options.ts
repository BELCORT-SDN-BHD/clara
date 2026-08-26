import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * lib/supabase/cookie-options.ts — ONE cookie configuration, shared by all
 * three Supabase clients (browser, proxy, server). Cross-model security
 * review 2026-08-27, finding 6.
 *
 * `@supabase/ssr` 0.12.5's own defaults are
 * `{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400d }` — no
 * `secure`, and a project-ref-derived name with no cookie prefix
 * (node_modules/@supabase/ssr/dist/main/utils/constants.js, read at the
 * pinned version). That leaves two gaps this file closes:
 *
 *  - **`__Host-` name prefix.** A cookie named `__Host-…` is only accepted by
 *    the browser when it is `Secure`, `Path=/`, and carries NO `Domain`
 *    attribute — and, crucially, a cookie with that name CANNOT be set by a
 *    sibling or parent domain. That is the defence against cookie tossing: a
 *    compromised `evil.clara.example` cannot plant a same-named
 *    `Domain=clara.example` cookie and win the duplicate-cookie race (session
 *    fixation / denial of service). The chunked names `@supabase/ssr` derives
 *    from this one (`__Host-clara-auth.0`, `.1`, `…-code-verifier`) all keep
 *    the prefix, so the guarantee covers every cookie the SDK writes.
 *  - **`secure: true`.** Never transmitted over plaintext HTTP; also a
 *    precondition of the `__Host-` prefix above.
 *
 * `httpOnly: false` is DELIBERATE and must stay false: this architecture has
 * the browser Supabase client maintain the user's own session through
 * `document.cookie` (lib/supabase/client.ts). A `httpOnly` cookie would be
 * invisible to it and would break sign-in outright. The review raised this
 * explicitly and did not treat it as a finding for that reason — it is a
 * property of the chosen architecture, not an oversight.
 *
 * `sameSite: "lax"` (not `"strict"`) is also deliberate: the invite-accept
 * link in an email is a cross-site top-level GET navigation, and `"strict"`
 * would withhold the session cookie on that first hop. Lax withholds the
 * cookie from cross-site POSTs, which is the arm that matters here; the
 * remaining same-SITE POST risk is closed at the route (app/logout/route.ts
 * checks `Origin`/`Sec-Fetch-Site` — finding 11).
 *
 * LOCAL DEV: `secure: true` + `__Host-` works on `http://localhost` in
 * Chrome and Firefox (both treat localhost as a trustworthy origin). Safari
 * historically does not — use `https` locally, or Chrome/Firefox, if you are
 * developing against Safari.
 */
export const AUTH_COOKIE_NAME = "__Host-clara-auth";

export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  name: AUTH_COOKIE_NAME,
  // The three attributes the `__Host-` prefix REQUIRES. `domain` is absent by
  // construction — adding one would make every browser reject the cookie.
  path: "/",
  secure: true,
  sameSite: "lax",
  // Must stay false — see the header comment.
  httpOnly: false,
  // Matches the pinned SDK default (400 days is the browser cap on cookie
  // lifetime); stated explicitly so a future SDK default change is visible.
  maxAge: 400 * 24 * 60 * 60,
};

/**
 * The `Cache-Control` floor for any response that can carry a refreshed auth
 * cookie. `@supabase/ssr` hands its own (stricter) anti-cache headers to the
 * `setAll` callback when it actually writes cookies; this is the baseline for
 * every other response on an authenticated route, so a CDN/reverse proxy in
 * front of this app can never store one tenant's response and replay it to
 * another (Supabase SSR advanced guide, "CDN and reverse proxy caching").
 */
export const AUTH_RESPONSE_CACHE_CONTROL = "private, no-store";
