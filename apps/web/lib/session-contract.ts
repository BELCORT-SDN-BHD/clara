// STAND-IN for `lib/session.ts` — owned by the sibling p2-auth lane, and NOT PRESENT
// in this worktree at the time P2-PARTS was built (verified: no `lib/session*` file
// anywhere in the repo as of this branch). `lib/wire.ts` needs only the narrow shape
// below — something that can hand back the current Supabase session's access token,
// or null when there is none — so this file declares that minimal interface locally
// rather than importing a module that does not exist (which would fail the build).
//
// WHEN lib/session.ts LANDS: re-point `lib/wire.ts`'s import at it directly (it
// should export a type at least this wide — a Supabase SSR session accessor
// naturally is). This file can then either re-export from lib/session.ts, or be
// deleted and every importer repointed — whichever the auth lane's actual shape
// makes cleaner. Grep for `SessionTokenAccessor` to find every call site.

export interface SessionTokenAccessor {
  /** The current session's Supabase access token (JWT), or null if there is no live
   *  session. Async because obtaining it may require a cookie read (Supabase SSR) or
   *  a refresh round-trip — never throws for "no session", which is a legitimate
   *  state, not a wire error. */
  getAccessToken(): Promise<string | null>;
}
