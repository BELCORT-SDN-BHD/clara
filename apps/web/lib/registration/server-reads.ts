// SERVER-ONLY half of the registration reads — the part that resolves WHO is
// asking from the request's own cookies.
//
// WHY IT IS A SEPARATE FILE. `./reads.ts` carries the types, the wire-shape pin
// and the applicant-scoped read, and P4-3's holding page value-imports those from
// a client component. A value import drags the whole module graph into the client
// bundle, so while this function lived beside them it pulled
// `@/lib/supabase/server-session` → `@/lib/supabase/server` → `next/headers` in
// with it and broke any client component that imported so much as a constant from
// that file (found by P4-5). The split is the fix; `./reads.ts` is isomorphic by
// construction and a test walks its transitive imports to keep it that way.
//
// Import from HERE only in a Server Component, a Server Action or a Route
// Handler. A client component that needs these rows should be handed them as
// props by a server parent, or read them with
// `loadRegistrationRequestsForApplicant` and an applicant id it already holds.

import {
  fixedTokenAccessor,
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

import {
  loadRegistrationRequestsForApplicant,
} from "./reads";
import {
  readCallerContextForSubject,
  type CallerContextOutcome,
} from "@/lib/identity/doors";

/** The server seam `loadOwnRegistrationRequests` resolves the caller through,
 *  injectable so the fail-closed branch can be DRIVEN in a test rather than read
 *  off the source. Production passes nothing and takes the default. */
export type OwnRegistrationDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly signal?: AbortSignal;
};

/**
 * What the holding page's read returns.
 *
 * A DISCRIMINATED RESULT, not a bare array (Codex review of #451, LOW-4). The
 * previous shape collapsed "your identity could not be verified" into `[]` — the
 * same value a verified applicant with no requests gets. Those are different facts
 * and the screen owes the person different words: one is "you have not applied
 * yet", the other is "we could not confirm who you are". Returning `[]` for both
 * would have the holding page confidently tell a signed-in applicant their pending
 * application does not exist, on nothing more than a claims verification blip.
 *
 * `[]` is reserved for exactly one case: a successful, applicant-filtered read
 * that observed zero rows.
 */
export type OwnRegistrationResult =
  | {
      readonly ok: true;
      /** The subject positively verified before the read was issued. Kept with
       *  the rows so the holding mapper can bind every hydrated row back to the
       *  identity that authorised this request. */
      readonly subject: string;
      /** Transport output is untrusted until holding-state validates all ten
       *  columns. `getRows<T>` is a compile-time projection, not a runtime
       *  decoder. */
      readonly rows: readonly unknown[];
      /** A separate, positive read of `clara.caller_context`. Zero registration
       * rows never stand in for this membership evidence. */
      readonly context: CallerContextOutcome;
    }
  | { readonly ok: false; readonly reason: "no_session" };

/**
 * The server-side convenience the holding page uses: resolve the caller's own
 * verified session, then read their requests.
 *
 * FAIL-CLOSED ON AN UNVERIFIED CALLER: with no session — or a `sub` claim that is
 * absent, unverifiable or not a uuid — this returns the `no_session` branch
 * **without issuing any read at all**. Review law 2: an absent identity is not a
 * licence to widen the query, and an unfiltered read here is precisely the
 * operator-queue leak `./reads.ts`'s header describes. The suite asserts the
 * stronger property — that `fetch` is never reached on this branch — because a
 * returned emptiness alone would also be true of a request that went out and came
 * back empty.
 *
 * A FAILED read THROWS rather than degrading into either branch: the caller must
 * distinguish loading, empty and error (§0.5's three distinguishable states), and
 * a read failure is none of the three answers this function is able to give.
 */
export async function loadOwnRegistrationRequests(
  deps: OwnRegistrationDeps = {},
): Promise<OwnRegistrationResult> {
  const resolve = deps.resolveSession ?? resolveServerSession;
  const session = await resolve();
  if (session === null) return { ok: false, reason: "no_session" };
  const accessor = fixedTokenAccessor(session.accessToken);
  const [rows, context] = await Promise.all([
    loadRegistrationRequestsForApplicant(accessor, session.subject, deps.signal),
    readCallerContextForSubject(session.subject, {
      session: accessor,
      signal: deps.signal,
    }),
  ]);
  return { ok: true, subject: session.subject, rows, context };
}
