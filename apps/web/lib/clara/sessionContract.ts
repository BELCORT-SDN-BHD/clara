// The session-token seam for the Clara rail/thread lane (P2-RAIL).
//
// `lib/session.ts` (the p2-auth lane's Supabase SSR session module) is not present in
// this worktree as of this build — the lanes run in parallel isolated worktrees
// (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q9 "graph-parallel conduct").
// This file declares the shape every function in `lib/clara/api.ts` and
// `lib/clara/stream.ts` depends on, so P2-RAIL can build and typecheck against it
// today without guessing at the auth lane's implementation.
//
// SWAP AT MERGE: once `lib/session.ts` lands and exports a compatible accessor,
// change the one import in `lib/clara/api.ts` / `lib/clara/stream.ts` from
// `./sessionContract` to `@/lib/session` (or re-export the real type from here —
// either works). Nothing downstream of the interface needs to change: every
// caller here only ever calls `getAccessToken()`.
export interface SessionTokenAccessor {
  /**
   * Resolves the current user's bearer token (the Supabase session JWT the
   * runtime's AGENT-lane routes authenticate with — `streamRoute.ts:29`,
   * `apps/dashboard/app/chat/api.ts` `runtimeFetch`). Resolves `null` when
   * signed out or the session could not be read — callers must treat `null`
   * as "not authenticated", never retry with an empty string.
   */
  getAccessToken(): Promise<string | null>;
}

/**
 * A safe placeholder accessor: always reports "signed out". Used only where a
 * route needs *some* `SessionTokenAccessor` to satisfy the type before the
 * real one lands (e.g. this lane's own full-screen thread pages, which the
 * (firm) layouts do not yet mount a session provider above). Never wire this
 * into a path that silently swallows a real auth failure — `ClaraThreadView`
 * renders an explicit "sign in required" state on `null` rather than
 * attempting an unauthenticated call (law 2: absence is not evidence).
 */
export const noSessionTokenAccessor: SessionTokenAccessor = {
  async getAccessToken() {
    return null;
  },
};
