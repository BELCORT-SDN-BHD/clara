// THE SERVER-LANE session seam — the counterpart `lib/session.ts` did not merely
// permit but ORDERED, in its own header, rather than have a later lane reuse the
// browser one:
//
//   "CLIENT-SIDE ONLY. This calls lib/supabase/client.ts's browser client, which
//    reads cookies via `document.cookie` — call it only from a Client Component or
//    a browser event handler, never from a Server Component, Server Action, or
//    Route Handler (those read the session through lib/supabase/server.ts's
//    createClient() instead, which has no equivalent 'give me the raw token'
//    helper yet — none of today's P2 surfaces need one; A FUTURE LANE SHOULD ADD
//    ONE, NOT REUSE THIS)."
//
// P4-2 is that lane: `requireFirmScope()` (../require-firm-scope.ts) reads
// `clara.caller_context` from two Server Component layouts and one Route Handler,
// and a read needs a bearer token.
//
// WHY NOT THE BLESSED SINGLETON — and why this is not a house-law exception.
// `apps/web/AGENTS.md` says the session token comes ONLY from the blessed
// `sessionTokenAccessor` singleton (lib/session-accessor.ts), "never a per-render
// accessor object literal (the 4GB-heap-OOM lesson)". That singleton is the
// BROWSER lane's: its `tokenFn` is installed exactly once, by
// `components/session-token-bridge.tsx` — a Client Component mounted in the root
// layout — through `configureSessionTokenSource`. On the server that call never
// runs, so `sessionTokenAccessor.getAccessToken()` parks in
// `waitForConfiguration()` for the full config timeout (5s) and then resolves
// `null`. Using it here would not be a style slip; it would be a five-second stall
// per render ending in a fabricated "no session" for a perfectly valid one — and
// under `requireFirmScope`'s fail-closed branch, a redirect to the holding page
// for every signed-in member of the firm.
//
// The hazard the law actually guards is an accessor whose OBJECT IDENTITY changes
// across renders, which is what drove `useHydratedPart`'s unbounded reload loop.
// This module answers that the same way lib/session-accessor.ts does: ONE
// module-level `const`, one object for the life of the process, never constructed
// per render and never handed to a React hook. Only the SOURCE differs (the
// request cookie jar instead of `document.cookie`), which is the entire reason a
// second accessor has to exist at all.
//
// PER-REQUEST BY CONSTRUCTION: the Supabase client itself is built INSIDE
// `getAccessToken()`, never hoisted to module scope — lib/supabase/server.ts's own
// header ("don't put this client in a global variable ... it must be built from
// THAT request's cookies"). The stable thing is this accessor object; the session
// it resolves is whichever request is currently on the stack.

import type { SessionTokenAccessor } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** A uuid, in the one shape the estate mints (`gen_random_uuid()` / Supabase auth
 *  user ids): 8-4-4-4-12 lowercase-or-uppercase hex. Used to refuse a `sub` claim
 *  that is not a uuid BEFORE it is ever spliced into a PostgREST filter — the
 *  claim is signature-verified by `getClaims()`, so this is a shape check rather
 *  than a trust boundary, but a verified-yet-malformed value still has no business
 *  reaching the wire. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The stable server-lane accessor. Resolves the current request's raw Supabase
 * access token, or `null` when there is no session — `null` is a legitimate
 * answer, never an error (the same contract `lib/session.ts`'s `getSessionToken`
 * carries for the browser).
 *
 * `getSession()`, deliberately NOT `getClaims()`/`getUser()` — Supabase's own
 * current auth-method guidance (verified via context7 against the Supabase docs,
 * 2026-08-30): "use `getClaims` to verify identity ... and `getSession` when you
 * need the access or refresh token directly, but don't rely on the user object it
 * returns for authorization decisions." This function only RELAYS the token; the
 * authorization decision belongs to PostgREST + RLS, which re-verify the JWT on
 * every call (hard constraint 2 — the DB is the wall). The gate that verifies the
 * signature for PAGE access already ran: `lib/supabase/proxy.ts` calls
 * `getClaims()` on every matched request before any layout renders.
 */
export const serverSessionTokenAccessor: SessionTokenAccessor = {
  async getAccessToken(): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    // `|| null`, not `?? null`: an empty-string token is "no usable token", and
    // lib/read.ts's `getRows` classifies `!token` as `no_session` anyway — folding
    // it here keeps the two ends of this seam agreeing on the same falsy set.
    return data.session.access_token || null;
  },
};

/**
 * The caller's VERIFIED subject — the `sub` claim, which is byte-identical to
 * `clara.jwt_sub()` (`0002:339-351`: it parses `request.jwt.claims ->> 'sub'` and
 * casts to uuid) and therefore to `clara.users.id` (`0141:242`:
 * `insert into clara.users(id, ...) values (p_actor, ...)` where `p_actor` IS
 * `jwt_sub()`). That identity chain is what lets a client-side `applicant=eq.<sub>`
 * filter express the SAME self-scope the view's own predicate enforces
 * (`0145:918`), rather than a lookalike.
 *
 * `getClaims()` here, not `getSession()`: this value is used as an IDENTITY (which
 * rows are mine), and `getClaims()` verifies the JWT signature locally on every
 * call while `getSession()` explicitly does not revalidate what storage handed it.
 *
 * Returns `null` — never a guess — when there is no session, when the claim is
 * absent, or when it is not a uuid. Every caller must treat `null` as "no self
 * scope" and read nothing.
 */
export async function serverCallerSubject(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  const sub: unknown = data?.claims?.sub;
  if (typeof sub !== "string" || !UUID_RE.test(sub)) return null;
  return sub;
}
