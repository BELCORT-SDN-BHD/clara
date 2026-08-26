import { createBrowserClient } from "@supabase/ssr";

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
 * design. The service_role key is NEVER referenced in this app.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
