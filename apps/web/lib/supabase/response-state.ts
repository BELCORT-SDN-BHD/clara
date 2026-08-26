import type { CookieOptions } from "@supabase/ssr";
import type { NextResponse } from "next/server";

import { AUTH_RESPONSE_CACHE_CONTROL } from "@/lib/supabase/cookie-options";

/**
 * lib/supabase/response-state.ts — the one place a request's queued auth
 * state is written onto the response that actually leaves the proxy.
 *
 * Cross-model security review 2026-08-27, findings 1 (HIGH) and 12 (LOW).
 * `@supabase/ssr` hands its cookie writes AND the anti-cache headers that
 * protect them to a `setAll(cookiesToSet, headers)` callback that fires
 * during `getClaims()` — i.e. BEFORE the proxy has decided whether this
 * request is being passed through or redirected to /login. Applying them
 * inside the callback therefore means applying them to a response that may
 * be discarded. Queue there, apply HERE, once, to the real response.
 *
 * Extracted from proxy.ts so the application step can be tested against a
 * genuine `NextResponse` — including the redirect, which is the branch that
 * used to lose everything.
 */

export interface QueuedAuthState {
  cookies: { name: string; value: string; options: CookieOptions }[];
  headers: Record<string, string>;
}

export function emptyAuthState(): QueuedAuthState {
  return { cookies: [], headers: {} };
}

/**
 * Applies `state` to `response` and returns it.
 *
 * Order is deliberate: the `private, no-store` floor goes on first so that
 * any `Cache-Control` @supabase/ssr supplied (which is stricter — it adds
 * `no-cache, must-revalidate, max-age=0`) overwrites it rather than being
 * overwritten by it.
 */
export function applyAuthState<T extends NextResponse>(
  response: T,
  state: QueuedAuthState,
): T {
  response.headers.set("Cache-Control", AUTH_RESPONSE_CACHE_CONTROL);

  for (const [key, value] of Object.entries(state.headers)) {
    response.headers.set(key, value);
  }

  for (const { name, value, options } of state.cookies) {
    response.cookies.set(name, value, options);
  }

  return response;
}
