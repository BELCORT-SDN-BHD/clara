import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The Supabase client for CODE THAT RUNS ON THE SERVER (Server Components,
 * Server Actions, Route Handlers) — reads/writes the session via the request
 * cookie jar rather than `document.cookie`.
 *
 * Especially important if using Fluid compute: don't put this client in a
 * global variable. Always create a new one inside each function that needs
 * it — it must be built from THAT request's cookies (current @supabase/ssr
 * Next.js docs, verified via context7 2026-08-27).
 *
 * The `setAll` call is wrapped in try/catch because a Server Component
 * cannot write cookies (Next.js throws) — this can be safely ignored here
 * because `proxy.ts` refreshes the session on every request, so a Server
 * Component never needs to be the one writing the refreshed cookie back.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — proxy.ts (which runs first on
            // every request) is the one responsible for refreshing and
            // persisting the session cookie. Safe to ignore here.
          }
        },
      },
    },
  );
}
