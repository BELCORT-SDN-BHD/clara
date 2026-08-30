import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import {
  AUTH_COOKIE_OPTIONS,
} from "@/lib/supabase/cookie-options";
import {
  applyAuthState,
  emptyAuthState,
  type QueuedAuthState,
} from "@/lib/supabase/response-state";

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
 * The `setAll` cookie write is wrapped in try/catch because a Server
 * Component cannot write cookies (Next.js throws) — this can be safely
 * ignored there because `proxy.ts` refreshes the session on every request, so
 * a Server Component never needs to be the one writing the refreshed cookie
 * back.
 *
 * `setAll(cookiesToSet, headers)` — the SECOND argument (cross-model security
 * review 2026-08-27, finding 1, HIGH) carries the pinned SDK's own anti-cache
 * headers (`Cache-Control: private, no-cache, no-store, must-revalidate,
 * max-age=0`, `Expires: 0`, `Pragma: no-cache`). A response that sets a
 * refreshed auth cookie and is then cached by a CDN hands one tenant's
 * session to the next visitor. A Server Component cannot set response headers
 * either, so this module offers `createRouteClient()` for the one place that
 * CAN — a Route Handler, which builds its own `Response`.
 */

interface BuiltClient {
  supabase: SupabaseClient;
  queued: QueuedAuthState;
}

export type ServerCookieStore = Pick<Awaited<ReturnType<typeof cookies>>, "getAll" | "set">;

interface BuildOptions {
  cookieStore?: ServerCookieStore;
  queueCookieWrites?: boolean;
}

async function build(options: BuildOptions = {}): Promise<BuiltClient> {
  const cookieStore = options.cookieStore ?? await cookies();
  const queued = emptyAuthState();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Headers are recorded BEFORE the cookie writes: the cookie write
          // is the call that can throw (Server Component), and losing the
          // anti-cache headers with it is exactly finding 1.
          for (const [key, value] of Object.entries(headers ?? {})) {
            queued.headers[key] = value;
          }
          if (options.queueCookieWrites) {
            // Route Handlers own the final response. Queue the SDK's cookie
            // instructions and apply them to THAT response in sealResponse;
            // writing them only to Next's ambient cookie store makes a direct
            // handler response impossible to verify and risks losing them on
            // a response object created after the auth call.
            queued.cookies.push(...cookiesToSet);
            return;
          }
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — proxy.ts (which runs first on
            // every request) is the one responsible for refreshing and
            // persisting the session cookie. Safe to ignore here.
          }
        },
      },
    },
  );

  return { supabase, queued };
}

/** Server Components / Server Actions. */
export async function createClient(options: Pick<BuildOptions, "cookieStore"> = {}): Promise<SupabaseClient> {
  return (await build(options)).supabase;
}

export interface RouteClient {
  supabase: SupabaseClient;
  /**
   * Applies the anti-cache headers Supabase queued during this request — plus
   * the `private, no-store` floor — to the response the handler is about to
   * return. Call it on the FINAL response object, after every auth call.
   */
  sealResponse<T extends NextResponse>(response: T): T;
}

/**
 * Route Handlers — the only server context in Next.js that owns its own
 * `Response` object and can therefore carry the SDK's anti-cache headers.
 */
export async function createRouteClient(
  options: Pick<BuildOptions, "cookieStore"> = {},
): Promise<RouteClient> {
  const { supabase, queued } = await build({
    ...options,
    queueCookieWrites: true,
  });

  return {
    supabase,
    sealResponse<T extends NextResponse>(response: T): T {
      return applyAuthState(response, queued);
    },
  };
}
