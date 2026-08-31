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
// `clara.caller_context` from two Server Component layouts and one Route Handler.
//
// WHY NOT THE BLESSED SINGLETON — and why this is not a house-law exception.
// `apps/web/AGENTS.md` says the session token comes ONLY from the blessed
// `sessionTokenAccessor` singleton (lib/session-accessor.ts). That singleton is
// the BROWSER lane's: its `tokenFn` is installed exactly once, by
// `components/session-token-bridge.tsx` — a Client Component mounted in the root
// layout — through `configureSessionTokenSource`. On the server that call never
// runs, so `sessionTokenAccessor.getAccessToken()` parks in
// `waitForConfiguration()` for the full config timeout (5s) and then resolves
// `null`. Using it here would not be a style slip; it would be a five-second stall
// per render ending in a fabricated "no session" for a perfectly valid one — and
// under `requireFirmScope`'s fail-closed branch, a redirect to the holding page
// for every signed-in member of the firm.
//
// ONE BUNDLE, ONE PRINCIPAL (Codex review of #451, HIGH-1). This module used to
// expose two independent resolutions — a cookie-backed token accessor and a
// separate `serverCallerSubject()` — and the runtime proxy checked scope with the
// first while forwarding the browser's own `Authorization` header onward. The
// guard and the governed request were therefore different principals: a caller
// holding a scoped cookie A could send `Authorization: Bearer B` and have A's
// scope authorise B's request. `resolveServerSession()` replaces both: ONE
// resolution yielding `{accessToken, subject}` whose two halves are bound to each
// other because the subject is verified FROM THAT TOKEN. Every caller — the
// `caller_context` read AND the outbound Authorization the proxy writes — uses
// that one token. There is no longer a second identity path to disagree with the
// first.
//
// PER-REQUEST BY CONSTRUCTION: the Supabase client is built INSIDE each function,
// never hoisted to module scope — lib/supabase/server.ts's own header ("don't put
// this client in a global variable ... it must be built from THAT request's
// cookies").

import { cache } from "react";

import type { SessionTokenAccessor } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** A uuid, in the one shape the estate mints (`gen_random_uuid()` / Supabase auth
 *  user ids): 8-4-4-4-12 hex. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One request's caller, resolved once. The two fields are bound: `subject` is the
 *  `sub` claim of `accessToken` itself, not of some other token the same request
 *  happened to carry. */
export type ServerSession = {
  readonly accessToken: string;
  readonly subject: string;
};

/**
 * The DECIDING half of the subject resolution, extracted so it can be driven by a
 * test. Everything around it — `cookies()`, `createClient()`, `getClaims()` — is
 * plumbing that needs a live Next request scope and decides nothing; this is the
 * part that says yes or no, and a fail-closed branch nobody can exercise is a
 * branch nobody has seen work (review law 1).
 *
 * Returns `null` for anything that is not a uuid-shaped string. That matters
 * beyond tidiness: the value is spliced into a PostgREST filter as
 * `applicant=eq.<sub>`, so a verified-but-malformed claim would otherwise reach
 * the query string. `URLSearchParams` encodes it and the view's own predicate
 * re-scopes it — this is the third, cheapest wall, not the only one.
 */
export function subjectFromClaims(claims: unknown): string | null {
  if (typeof claims !== "object" || claims === null) return null;
  const sub: unknown = (claims as Record<string, unknown>).sub;
  if (typeof sub !== "string" || !UUID_RE.test(sub)) return null;
  return sub;
}

/**
 * The deciding half of the token resolution, on the same reasoning.
 *
 * An empty-string token is "no usable token": `lib/read.ts`'s `getRows`
 * classifies `!token` as `no_session` anyway, so folding it to `null` here keeps
 * both ends of this seam agreeing on the same falsy set.
 */
export function tokenFromSession(session: unknown): string | null {
  if (typeof session !== "object" || session === null) return null;
  const token: unknown = (session as Record<string, unknown>).access_token;
  if (typeof token !== "string" || token.length === 0) return null;
  return token;
}

/** The deciding half of `resolveServerSession` — both halves must be present, or
 *  there is no session at all. Never a bundle with one field guessed. */
export function serverSessionFrom(session: unknown, claims: unknown): ServerSession | null {
  const accessToken = tokenFromSession(session);
  if (accessToken === null) return null;
  const subject = subjectFromClaims(claims);
  if (subject === null) return null;
  return { accessToken, subject };
}

/**
 * A `SessionTokenAccessor` pinned to ONE token — the mechanism that makes the
 * guard and the governed request the same principal.
 *
 * A fresh object per call, deliberately, and NOT a breach of the house law that
 * bans per-render accessor literals: that law exists because an accessor whose
 * IDENTITY changes across renders drove `useHydratedPart`'s unbounded reload loop
 * (the 4GB-heap-OOM). This one is server-only, is never handed to a React hook,
 * and nothing memoises on its identity — it is a value, not a subscription.
 */
export function fixedTokenAccessor(accessToken: string): SessionTokenAccessor {
  return { getAccessToken: async () => accessToken };
}

/**
 * Resolve this request's caller ONCE: the raw access token, plus the subject
 * VERIFIED FROM THAT TOKEN. `null` when there is no usable session — a legitimate
 * answer, never an error.
 *
 * Two Supabase calls, each the one its own job wants, per Supabase's current
 * auth-method guidance (verified via context7, 2026-08-30): `getSession()` for the
 * raw token to forward to another service, and `getClaims()` to verify identity —
 * here called WITH THAT EXPLICIT TOKEN (`getClaims(jwt?)`, auth-js 2.112.4
 * `GoTrueClient.d.ts:2538`) rather than bare, so what is verified is exactly what
 * will be sent. Calling it bare would re-read the cookie and could, in principle,
 * verify a different token than the one `getSession()` handed back — the same
 * class of split-principal bug at a smaller scale.
 *
 * `getClaims` verifies the JWT signature locally against the project's asymmetric
 * signing keys, with no network round-trip.
 *
 * WRAPPED IN REACT'S `cache()` (ruled on the #451 fold round). The memo is scoped
 * to ONE request: React's cache is keyed inside the request's own render scope, so
 * a second caller in the same request reuses the first resolution and NOTHING is
 * shared between requests — the property that makes this safe is the same one that
 * makes it useful. It respects the house singleton law rather than bending it:
 * `cache()` returns ONE module-level function object, not a per-render accessor,
 * so the identity hazard the law guards is untouched.
 *
 * Today exactly one entrance resolves per request, so the measured load count is 1
 * either way; the memo is what keeps it 1 when P4-6's nav shaping asks for the
 * context a second time in the same render, instead of quietly doubling every
 * scoped page's session work.
 */
export const resolveServerSession = cache(async (
  createSupabaseClient: typeof createClient = createClient,
): Promise<ServerSession | null> => {
  const supabase = await createSupabaseClient();

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return null;
  const accessToken = tokenFromSession(sessionData.session);
  if (accessToken === null) return null;

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(accessToken);
  if (claimsError) return null;

  return serverSessionFrom(sessionData.session, claimsData?.claims);
});
