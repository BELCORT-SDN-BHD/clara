// lib/client-id.ts — #614: a general shape check for `clara.clients.id`
// (Postgres `uuid`, 0003_books_core.sql:34-40), applied BEFORE a client id
// from the URL ever reaches a request.
//
// THE DEFECT THIS CLOSES. `/clients/not-a-client/journals` — a MALFORMED id,
// not merely an unknown one — used to reach `loadClientById`
// (lib/firm/reads.ts) and the rail's onboarding-client read
// (lib/onboarding/api.ts's `getOnboardingClient`) as a raw `id=eq.<value>`
// filter. Real PostgREST answers a non-uuid `eq.` filter on a uuid column
// with HTTP 400 `22P02` ("invalid input syntax for type uuid") — which
// THROWS, unlike an unknown-but-well-formed id, which resolves an honest
// empty result set. The layout's `notFound()` call sat AFTER that fetch, so
// it was never reached: the route rendered the ERROR boundary ("Something
// went wrong") instead of the scoped not-found state, and the thrown
// message — the raw `22P02` code included — leaked into the Clara rail's
// error banner. Both are violations: AC5 ("missing, deleted, denied or
// scope-mismatched objects never redirect silently… the scoped not-found is
// the explicit state") and CB-AE2E-022 (no internal error codes in user
// copy).
//
// A malformed id is a NOT-FOUND question, not a database one. Every call
// site below checks the SHAPE first and treats a failure as "this address
// cannot name a client" rather than a request worth sending — defence in
// depth, not a single gate, because a malformed id can reach a caller from
// more than one direction (the route param, the rail's own `useParams()`
// read of the same URL).
//
// The e2e mock (`e2e/serve-built.mjs`) used to return `[]` for ANY `id=eq.`
// value, well-formed or not — masking this defect in every local/CI run. It
// now mirrors real PostgREST's 400 for a non-uuid value; see that file's own
// note on its `/rest/v1/clients` handler.

/**
 * Postgres `uuid`'s own textual grammar — 8-4-4-4-12 hex, case-insensitive.
 * SHAPE ONLY: no version/variant nibble check, deliberately — this says
 * nothing about whether the id names a client this session (or any session)
 * can see. `loadClientById` and RLS still answer THAT question honestly,
 * with `null`. The nil uuid (`00000000-…-000000000000`) passes this check —
 * it is a syntactically valid uuid that simply names no row.
 */
const CLIENT_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientIdShape(value: string): boolean {
  return CLIENT_ID_SHAPE.test(value);
}
