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
// the number it depends on instead of retyping 768; and ONE guard.
//
// THE GUARD, and why it is not defensive noise. The vendored effect reaches
// straight through to `window.matchMedia`. That is fine in a browser and throws
// everywhere else the app's components are rendered — a partial `window` stub
// has the object and not the method, which is exactly the shape
// `components/clara/rail-chrome.tsx` already guards for in three places with the
// same one-line check and the same reasoning: "this host cannot tell me the arm,
// so do nothing". Measured, not assumed: without it, mounting anything that
// renders a sidebar in `test/hookHarness.ts` throws "window.matchMedia is not a
// function" out of a passive effect, which React reports only as a generic
// concurrent-rendering error. Falling back to NOT-mobile is the right default
// for a host with no viewport: the docked arm is the one that needs no modal
// dismissal to get out of.

const canMatchMedia = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"

import * as React from "react"

/** The width at and above which `components/ui/sidebar.tsx` renders its docked
 *  arm (Tailwind's `md`). Exported so nothing else has to spell 768. */
export const SIDEBAR_BREAKPOINT = 768

const MOBILE_BREAKPOINT = SIDEBAR_BREAKPOINT

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (!canMatchMedia()) return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
