/**
 * THE `<h1>` IDS THE THREE FOCUS-MOVING SURFACES SHARE WITH THEIR PAGES — and the
 * one reason they live here rather than beside the components that read them (#733).
 *
 * THE SHAPE OF THE PROBLEM. Each of these three routes is a Server Component that
 * renders `PageHeader ... headingId={X}` while the CLIENT component below it moves
 * focus to `document.getElementById(X)`. Both halves need the same string, and the
 * string used to be declared inside the client module — so the server page imported
 * a PLAIN VALUE across the `"use client"` boundary. That import does not give the
 * server the string: the RSC bundler replaces it with a client reference, which is
 * why the built server module reads `headingId: e.ACTIVITY_HEADING_ID` where
 * `e.ACTIVITY_HEADING_ID` is a `registerClientReference(...)` stub that throws
 * "Attempted to call ACTIVITY_HEADING_ID() from the server" if anything ever calls
 * it (`.next/server/chunks/ssr/[root-of-the-server]__*.js`, measured 2026-09-14).
 *
 * WHY THESE THREE STILL WORKED, stated plainly so this module is not sold as a bug
 * fix it is not. A value that is only PASSED THROUGH as a prop is resolved later,
 * when the SSR pass renders the flight payload with the client manifest in hand —
 * `e2e/journal-work-walk.spec.ts:655` asserts `#work-detail-heading` has focus and
 * is green, which is only possible if the rendered `<h1>` carries the literal. The
 * #733 case broke because `app/(firm)/layout.tsx` CONSUMED its value on the server
 * (`cookies().get(SIDEBAR_COOKIE_NAME)` became `cookies().get(<stub>)`). So these
 * three were latent-correct, and what this module removes is the dependency on that
 * distinction: the difference between "silently inert" and "fine" was whether a
 * future edit ever reads the value instead of forwarding it.
 *
 * WHY `lib/navigation/`. Same answer as `sidebar-cookie.ts` beside it: these are
 * properties of the app's routes, which is what this directory already holds
 * (`tree.ts`, `legacy-routes.ts`). The client components re-export their own id, so
 * every existing importer keeps working and cannot drift onto a second spelling.
 */

/** `/activity` — `app/(firm)/activity/page.tsx` renders it; `components/firm/activity/activity-feed.tsx`
 *  focuses it after a filter change (#728 finding 4). */
export const ACTIVITY_HEADING_ID = "activity-feed-heading";

/** `/clients/:clientId/work/:workId` — §4's "Work detail focuses its heading when reached by
 *  navigation"; `components/work/work-detail.tsx` moves focus, the page renders the id. */
export const WORK_HEADING_ID = "work-detail-heading";

/** `/operator` — the focus fallback `components/operator/support-queue.tsx` uses when the row a
 *  Sheet was opened from is gone by the time it closes. */
export const OPERATOR_HEADING_ID = "operator-support-heading";
