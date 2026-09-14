/**
 * THE `sidebar_state` COOKIE'S NAME AND LIFETIME — and the ONE reason this file
 * exists rather than the two `const`s living beside the component that uses them
 * (#733).
 *
 * `components/ui/sidebar.tsx` opens with `"use client"`. A Server Component may
 * import a CLIENT COMPONENT from such a module and render it — that is the whole
 * mechanism, and `SidebarProvider`/`SidebarInset` reach `app/(firm)/layout.tsx`
 * exactly that way — but a PLAIN VALUE export from the same module carries no
 * client-reference machinery: the RSC bundler has nothing to hand the server for
 * a bare string constant, so the server-side import resolved to `undefined`.
 * `app/(firm)/layout.tsx`'s `cookies().get(SIDEBAR_COOKIE_NAME)` was therefore
 * `cookies().get(undefined)` on every firm route, which finds nothing whatever
 * the request's cookie jar holds — so a collapsed sidebar silently rendered
 * expanded on the server on every visit, and the cookie the client writes on
 * every toggle was inert on the one layout that reads it back. Measured twice
 * (a `console.error` of the imported value in the layout printed `undefined`;
 * raw SSR requests with `sidebar_state=false` and `=true` rendered
 * byte-identical `data-state="expanded"`).
 *
 * A PLAIN MODULE HAS NO SUCH BOUNDARY. Both halves import from here:
 * `app/(firm)/layout.tsx` (server) reads the name, and
 * `components/ui/sidebar.tsx` (client) re-exports both constants so its existing
 * importers — `components/settings/account-settings.tsx`, whose "sidebar starts"
 * preference writes THIS SAME cookie — need no change and cannot drift onto a
 * second spelling.
 *
 * WHY `lib/navigation/`. The cookie is the persistence of the app's ONE
 * navigation surface, which is what this directory already holds (`tree.ts`, the
 * registry that surface renders; `legacy-routes.ts`, where its old addresses
 * went). It is deliberately NOT a new top-level module: one value, one home, and
 * it is the navigation shell's.
 */

/** The cookie `components/ui/sidebar.tsx` writes on every toggle and
 *  `app/(firm)/layout.tsx` reads back to seed `defaultOpen`. Value is the string
 *  `"true"` or `"false"`; ABSENT means open, which is the right default for a
 *  first visit. */
export const SIDEBAR_COOKIE_NAME = "sidebar_state";

/** One week, in seconds. Shared with #626's personal-settings "sidebar starts"
 *  preference (`components/settings/account-settings.tsx`), which writes the
 *  same name with the same max-age so a saved default is the ONE mechanism
 *  above rather than a second one. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
