/**
 * THE LEGACY ROUTE MATRIX (#614).
 *
 * #614 moved two firm destinations and renamed a third: the cross-client inbox
 * `/needs-you` became the saved attention view of Work, and the whole `/admin`
 * subtree became `/settings`. Every one of those paths is in somebody's browser
 * history, in a Slack message, in an e2e walk, and in the deep link a Needs-you
 * row hands out. A moved page that 404s is a broken product, so each old path
 * REDIRECTS to its new home.
 *
 * `permanent: false` (HTTP 307), deliberately, and it is not timidity. A 308 is
 * cached by the browser essentially forever — reverting one means asking every
 * user to clear their cache. These moves are one train old and #615 may yet
 * relocate `/settings/registrations` to the operator console, so the redirects
 * stay temporary until the IA has been lived in. Revisit when the refresh
 * milestone closes.
 *
 * QUERY STRINGS PASS THROUGH. Next appends the original query to the destination
 * for a `redirects()` entry with no query matching, so `/admin/members?invite=1`
 * lands on `/settings/members?invite=1`.
 *
 * ORDER OF OPERATIONS, worth stating because it surprises: Next applies
 * `redirects()` BEFORE `proxy.ts`. An UNAUTHENTICATED hit on `/admin/members`
 * therefore redirects to `/settings/members` first and only then meets the auth
 * gate, landing on `/login?next=/settings/members`. That is the behaviour we
 * want — the visitor signs in and arrives at the destination they asked for, at
 * its current address — but it does mean the auth wall never sees the old path.
 *
 * NO PAGE IS LEFT BEHIND AT THE OLD ADDRESS. `app/(firm)/needs-you/` and
 * `app/(firm)/admin/` are deleted in the same commit; a redirect that shadowed a
 * live page would be a second, invisible authority over which surface renders.
 */

export interface LegacyRoute {
  readonly source: string;
  readonly destination: string;
}

export const LEGACY_ROUTES: readonly LegacyRoute[] = [
  { source: "/needs-you", destination: "/work?view=needs-you" },
  { source: "/admin", destination: "/settings" },
  { source: "/admin/members", destination: "/settings/members" },
  { source: "/admin/settings", destination: "/settings/firm" },
  { source: "/admin/compliance", destination: "/settings/compliance" },
  { source: "/admin/vendor-bindings", destination: "/settings/vendor-bindings" },
  { source: "/admin/registrations", destination: "/settings/registrations" },
] as const;

/**
 * The shape `next.config.ts`'s `redirects()` returns. Typed structurally rather
 * than importing `Redirect` from `next/dist/lib/load-custom-routes`, which is a
 * private path: this module is imported by a node test cell that must not pull
 * Next's build internals in with it.
 */
export interface NextRedirect {
  readonly source: string;
  readonly destination: string;
  readonly permanent: boolean;
}

export function legacyRedirects(): NextRedirect[] {
  return LEGACY_ROUTES.map((row) => ({ ...row, permanent: false }));
}
