// PROVENANCE — vendored, not hand-written. Pulled in as a registry dependency of
// `sidebar` (`pnpm dlx shadcn@4.19.0 add sidebar breadcrumb collapsible`).
//
// THE BREAKPOINT IS 768 AND THAT IS A DECISION, not an inherited default — the
// one thing worth reading before changing this file.
//
// `components/ui/sidebar.tsx` renders its desktop arm behind Tailwind's `md:`
// (768px) and hands everything below that to a sheet. This hook is what decides
// which arm the JS half takes (which control the trigger toggles, whether the
// panel is modal), so the two MUST agree: a hook at 1024 with a stylesheet at
// 768 gives a visible sidebar whose trigger opens a second copy of itself in a
// drawer, between 768 and 1023.
//
// WHY 768 IS RIGHT HERE EVEN THOUGH THE SHELL'S OTHER ARM IS `lg` (1024). The
// Clara rail docks at `lg` and is an overlay below it (components/clara/
// rail-chrome.tsx), so between 768 and 1023 the sidebar is visible while the rail
// costs the workbench ZERO width. The arithmetic CB-AE2E-019 measured — 224
// (sidebar) + 320 (rail) + 64 (PageShell padding) = 608px of chrome, leaving
// 160px at `md` — was measured with the rail DOCKED, and it is why the old
// single-arm shell had to break at `lg`. With the rail overlaid, 768 - 224 - 32
// (PageShell's narrow padding) leaves 512px of workbench, and at 1024, where the
// rail docks, 1024 - 224 - 320 - 64 leaves 416px. Both clear the 320px floor,
// and neither arm makes the page scroll sideways.
//
// HAND EDITS: this header; `SIDEBAR_BREAKPOINT`, exported so the shell can state
// the number it depends on instead of retyping 768; ONE guard; and the whole
// body, rewritten for #732 — see below.
//
// THE GUARD, and why it is not defensive noise. The vendored implementation
// reaches straight through to `window.matchMedia`. That is fine in a browser and
// throws everywhere else the app's components are rendered — a partial `window`
// stub has the object and not the method, which is exactly the shape
// `components/clara/rail-chrome.tsx` already guards for with the same one-line
// check and the same reasoning: "this host cannot tell me the arm, so do
// nothing". Measured, not assumed: without it, mounting anything that renders a
// sidebar in `test/hookHarness.ts` throws "window.matchMedia is not a function"
// out of a passive effect, which React reports only as a generic
// concurrent-rendering error. Falling back to NOT-mobile is the right default
// for a host with no viewport: the docked arm is the one that needs no modal
// dismissal to get out of.
//
// ===========================================================================
// #732 — WHY THIS HOOK'S UPDATE HAD TO BECOME A TRANSITION
// ===========================================================================
// MEASURED, not reasoned about (2026-09-14, `next build` + `next start`, the
// e2e harness, Chromium 1234). Loading `/clients/:id/work/:workId` at 375 CSS px
// logged exactly TWO `Minified React error #418` — React's "the server rendered
// HTML didn't match the client" — and none at all at 1280. A `MutationObserver`
// armed at `DOMContentLoaded` showed what React actually did: it removed the
// server's `<div data-slot="sidebar" data-state="expanded">` TOGETHER WITH the
// `<!--$-->` / `<!--/$-->` comments that fence a Suspense boundary, and then
// removed and re-added every `<li>` of the breadcrumb. Two boundaries thrown
// away and client-rendered; two #418s.
//
// THE CHAIN. `app/(firm)/layout.tsx` wraps `<AppSidebar />` and `<ShellHeader />`
// in `<Suspense>` (a build-time contract for `useSearchParams()`, per its own
// note), and React hydrates those boundaries as their own units — while the root
// around them has already committed and run its effects. `SidebarProvider`
// (components/ui/sidebar.tsx) calls this hook and puts the answer in a
// `useMemo`'d context value. At 1280 the answer never moves, the memo returns the
// SAME object, the children bail out and the boundaries hydrate untouched. At 375
// the post-mount flip to `true` produces a NEW context value, both boundaries
// must re-render before they have hydrated, and the tree React then produces
// (`Sidebar`'s sheet arm renders nothing while closed) has no server markup to
// match. That is the whole of #732, and the width is only the trigger.
//
// THE FIX IS THE UPDATE'S PRIORITY, NOT ITS VALUE. `startTransition` marks the
// flip as non-urgent, which is React's own documented remedy for an update that
// reaches a boundary mid-hydration: React finishes hydrating against the server's
// HTML first and applies the narrow arm afterwards. The end state is unchanged —
// the sheet arm, the launcher, the collapsed nav, one render later — and at or
// above `md` nothing happens at all, because the initial state is already the
// answer (see below).
//
// `useState(false)`, NOT `useState<boolean | undefined>(undefined)`, and the
// difference is load-bearing rather than tidiness. With `undefined` the effect's
// `setIsMobile(false)` at a WIDE viewport is still a state CHANGE, so React
// re-renders `SidebarProvider` on every desktop load for an answer that never
// moved. Seeding `false` — the arm the server renders, because the server has no
// viewport — lets React's eager-state bailout drop that update entirely, so the
// wide arm costs no extra render and the narrow arm is the only one that ever
// schedules anything.
//
// `useSyncExternalStore` WAS TRIED AND REJECTED, recorded so the next lane does
// not re-try it. It looks like the right hook (`getServerSnapshot` is exactly
// "what the server answered") and it does fix the wide case for the same reason
// the `false` seed does — but React re-renders a changed store snapshot at
// SyncLane from inside its own subscription effect, and a caller cannot wrap
// that in a transition. Measured: the same two #418s at 375 px, unchanged.
//
// ONE DEFINITION OF "NARROW", NOT TWO. The vendored effect subscribed to
// `matchMedia("(max-width: 767px)")` but then stored `window.innerWidth < 768`,
// which are different questions wherever a classic scrollbar takes width
// (`innerWidth` includes it, the media query does not). Both halves now read
// `matches`, so the value cannot disagree with the event that announced it.

const canMatchMedia = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"

import * as React from "react"

/** The width at and above which `components/ui/sidebar.tsx` renders its docked
 *  arm (Tailwind's `md`). Exported so nothing else has to spell 768. */
export const SIDEBAR_BREAKPOINT = 768

const MOBILE_BREAKPOINT = SIDEBAR_BREAKPOINT

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

export function useIsMobile(): boolean {
  // THE DOCKED ARM IS THE SEED — the arm the server renders, so the first client
  // render agrees with it at every width. See the #732 note above.
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    if (!canMatchMedia()) return
    const mql = window.matchMedia(MOBILE_QUERY)
    // A TRANSITION, both on mount and on every later crossing. The mount call is
    // the one #732 is about; the listener uses the same wrapper because a resize
    // that arrives while a later navigation is streaming would be the same hazard,
    // and because two spellings of one update is how they drift apart.
    const sync = () => React.startTransition(() => setIsMobile(mql.matches))
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  return isMobile
}
