import { NextResponse, type NextRequest } from "next/server";

import { isSameOriginRequest } from "@/lib/same-origin";
import { createRouteClient } from "@/lib/supabase/server";

/**
 * "/logout" — POST only. Sign-out is a mutation, not a GET-navigable page:
 * a GET route is link-prefetchable and crawlable, which would make visiting
 * a page with a stray logout link enough to end a session by accident.
 * `components/logout-button.tsx` is the one caller.
 *
 * The session cookie is cleared server-side (lib/supabase/server.ts writes
 * through `cookieStore.set`, invoked here by `signOut()`), so the response
 * carries the cleared cookie regardless of the browser client's own cookie
 * access.
 *
 * THREE HARDENINGS (cross-model security review 2026-08-27, finding 11):
 *
 *  1. **Same-origin proof.** `SameSite=Lax` does NOT block a same-SITE
 *     cross-ORIGIN POST, so a hostile sibling origin (`evil.clara.example`)
 *     could submit a form here and end the victim's session. This route now
 *     requires an exact `Origin` match, with `Sec-Fetch-Site: same-origin` as
 *     an independent second signal. Both are fail-closed: a request that does
 *     not POSITIVELY prove same-origin is refused (review law 2 — absence is
 *     never evidence).
 *  2. **`scope: "local"`.** Parameterless `signOut()` defaults to `global`,
 *     which revokes every refresh session the account holds — on every
 *     device. Signing out of THIS browser must not log the user out of their
 *     phone. "Sign out everywhere" is a deliberate, separate operation if it
 *     is ever wanted.
 *  3. **Errors propagate.** A failed `signOut()` used to be swallowed and
 *     answered `{ ok: true }`, so the button navigated to /login while the
 *     session was still alive. It now answers 502 and the caller stays put.
 *
 * The response is sealed with the anti-cache headers Supabase queues for its
 * cookie writes (finding 1) — a cached logout response is a cached
 * `Set-Cookie`.
 *
 * DELIBERATELY EXEMPT FROM THE SCOPE SPINE (P4-2, design §4 E) — do not "fix"
 * this by adding `requireFirmScope()`. A session with no active firm membership
 * must still be able to log out; gating this route on membership would strand
 * exactly the people the holding state exists for, since /pending's one action
 * is this route. It returns no firm-scoped data on its own authority, so the
 * spine's rule does not reach it, and the walls that DO matter here are the two
 * above: an exact same-origin proof and POST-only. The exemption is registered
 * as data in `lib/require-firm-scope.ts`'s `SCOPE_EXEMPT_SURFACES` and asserted
 * by `tests/require-firm-scope.test.ts`, which goes RED if this file starts
 * calling the spine.
 */

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers, request.url)) {
    return NextResponse.json(
      { ok: false, error: "cross-origin" },
      { status: 403 },
    );
  }

  const { supabase, sealResponse } = await createRouteClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return sealResponse(
      NextResponse.json({ ok: false, error: error.message }, { status: 502 }),
    );
  }

  return sealResponse(NextResponse.json({ ok: true }));
}
