import { createBrowserClient } from "@supabase/ssr";

import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

/**
 * The Supabase client for CODE THAT RUNS IN THE BROWSER (Client Components,
 * event handlers). Cookie-session auth, invite-only (no self-serve signup) —
 * docs/plan/active/frontend-handoff-2026-08-23.md §0.4.
 *
 * `createBrowserClient` is a singleton internally — safe to call this on
 * every render; it does not create a new connection each time (current
 * @supabase/ssr docs, verified via context7 2026-08-27).
 *
 * Env-driven only: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (apps/web/.env.example). This is the anon/publishable key — publishable by
 * design. The service_role key is NEVER referenced in this app, and
 * `scripts/check-public-key.mjs` (wired into this package's `build`) proves
 * the value in that env slot is of the publishable CLASS before anything is
 * bundled — a name is not a guarantee (security review finding 7).
 *
 * `AUTH_COOKIE_OPTIONS` is the SAME configuration the proxy and server
 * clients use (finding 6): `__Host-` name, `Secure`, `Path=/`, no `Domain`,
 * explicit `SameSite`. All three clients must agree — they read and write one
 * another's cookies.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: AUTH_COOKIE_OPTIONS },
  );
}
