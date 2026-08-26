import { createClient } from "@/lib/supabase/client";

/**
 * getSessionToken() — the session→API seam. This is the ONE place later
 * lanes read the Supabase access token through to attach as
 * `Authorization: Bearer <token>` on outbound calls:
 *   - PostgREST (the HUMAN governance lane — `Accept-Profile`/
 *     `Content-Profile: clara`, per docs/plan/active/frontend-handoff-
 *     2026-08-23.md §4.2).
 *   - the runtime HTTP surface (the AGENT lane — chat turns, SSE streams,
 *     document intake; §4.1).
 *
 * Contract:
 *   - Returns the current access token as a string, or `null` when there is
 *     no session. `null` is a normal, expected answer (logged out), never an
 *     error — callers branch on it, they do not need to catch a throw.
 *   - CLIENT-SIDE ONLY. This calls lib/supabase/client.ts's browser client,
 *     which reads cookies via `document.cookie` — call it only from a Client
 *     Component or a browser event handler, never from a Server Component,
 *     Server Action, or Route Handler (those read the session through
 *     lib/supabase/server.ts's createClient() instead, which has no
 *     equivalent "give me the raw token" helper yet — none of today's P2
 *     surfaces need one; a future lane should add one, not reuse this).
 *   - Uses `getSession()`, deliberately not `getClaims()`/`getUser()`: per
 *     Supabase's own auth-method guidance (verified via context7
 *     2026-08-27), `getSession()` is for exactly this — handing over the
 *     raw access token to forward to another service — while
 *     `getClaims()`/`getUser()` are for making an authorization decision
 *     (which `proxy.ts` already makes, for page access; PostgREST and the
 *     runtime independently re-verify the token server-side on every call
 *     regardless of what this function returns).
 *   - This function does not itself decide who is allowed to do what — it
 *     only relays the token. The DB and the runtime are the authority on
 *     that token's validity (hard constraint 2: the DB owns every
 *     authoritative number/decision; the agent — and this seam — only
 *     orchestrates).
 */
export async function getSessionToken(): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    return null;
  }

  return data.session.access_token;
}
