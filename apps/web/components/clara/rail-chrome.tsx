"use client";

import * as React from "react";

import { claraThreadStore } from "@/lib/clara/threadStore";
import { useClaraRailOpen } from "@/lib/clara/useClaraThread";
import { RAIL_EXIT_MS } from "@/lib/clara/useRailPresence";

/**
 * CB-AE2E-019, SEAM 3 OF 3 — the Clara rail's chrome, and ONLY its chrome.
 *
 * WHAT THIS IS NOT. It is not a change to what the rail IS. 裁-117 fixed the
 * rail's shape — one thread per altitude, a switcher rather than a sidebar — and
 * nothing here touches the thread, the altitude, the store or the mount key. The
 * SAME `<ClaraRail>`, resolving the SAME thread, is rendered in both arms; what
 * changes is whether its box participates in the shell's flex row or floats over
 * it. Same thread, different chrome.
 *
 * THE TWO ARMS, and why `display: contents` is the mechanism.
 *
 *   At `lg` and above  — `lg:contents` removes this wrapper's box entirely, so
 *                        `<ClaraRail>`'s `<aside>` is a DIRECT flex child of the
 *                        shell row in `app/(firm)/layout.tsx`, exactly as it was
 *                        before this file existed. That is not a near-equivalent
 *                        of the old behaviour, it is the old behaviour: no box,
 *                        no stacking context, no inherited constraint.
 *                        `e2e/parity-holes.spec.ts`'s docked-rail proof measures
 *                        this arm and is unchanged by design.
 *   Below `lg`         — a `fixed inset-y-0 right-0` box, so the 320px rail costs
 *                        the workbench ZERO width. At 640 CSS px (a 1280px window
 *                        at 200% zoom, WCAG 2.2 SC 1.4.10's case) the rail was
 *                        eating half the viewport while open by default.
 *
 * WHY THE WRAPPER IS `contents` WHEN THE RAIL IS CLOSED, IN BOTH ARMS. A closed
 * rail renders `ClaraRailLauncher`, which is itself `fixed` to the viewport. If
 * this wrapper stayed a `fixed inset-y-0 right-0 z-40` box around it, the page
 * would carry an invisible full-height element at the right edge in the one
 * state where the rail is meant to be out of the way. It has zero width, so it
 * would not intercept a pointer — but "probably harmless" is not a reason to
 * leave a phantom in the layout.
 *
 * THE OVERLAY IS NOT MODAL, DELIBERATELY. No `aria-modal`, no focus trap, no
 * inert workbench: the rail is a `complementary` panel and the workbench behind
 * it stays operable and screen-reader reachable, which is the whole point of a
 * rail rather than a dialog. What it DOES owe, and what this file implements, is
 * the rest of the keyboard contract an overlay owes:
 *
 *   - focus moves INTO the panel when it opens in the overlay arm (otherwise the
 *     launcher unmounts under the user's own focus and focus falls to `<body>`);
 *   - focus RETURNS to the launcher when it closes, but only when focus was
 *     inside the rail at the moment it closed — closing via ⌘K, or via a route
 *     change, must not yank focus away from wherever the user actually is;
 *   - Escape closes it, scoped by `onKeyDown` on this wrapper so the handler
 *     only ever fires for a key pressed INSIDE the rail. A document-level Escape
 *     listener would have closed the rail out from under any dialog the user was
 *     dismissing.
 *
 * All three are overlay-arm only. In the docked arm the rail is a permanent
 * column beside the workbench, and stealing focus into a panel that was always
 * on screen would be a bug, not a service.
 */

/** Below `lg`. Kept as one string so the media query and `matchMedia` cannot drift. */
const NARROW_QUERY = "(width < 64rem)";

/**
 * The rail panel's own class string, owned here rather than in `ClaraRail.tsx`.
 *
 * `dock-panel` (app/globals.css) replaces the old `enter-panel`: same 200ms
 * `--motion-duration-panel` entrance, plus the exit the rail never had.
 * `max-w-[85vw]` binds only in the overlay arm — 85% of a 1280px viewport is
 * 1088px, far above `w-80`, so the cap is inert at `lg` and above and needs no
 * breakpoint of its own.
 */
export const RAIL_PANEL_CLASS =
  "dock-panel sticky top-0 flex h-dvh w-80 max-w-[85vw] shrink-0 flex-col border-l border-border bg-card shadow-lg";

export function ClaraRailChrome({ children }: { children: React.ReactNode }) {
  const open = useClaraRailOpen();
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const wasOpen = React.useRef(open);

  React.useEffect(() => {
    const previouslyOpen = wasOpen.current;
    wasOpen.current = open;
    if (previouslyOpen === open) return;
    // `matchMedia` is read at the moment of the transition rather than held in
    // state: this is the only place the arm matters to JavaScript (both LAYOUT
    // arms are pure CSS), so there is nothing to keep in sync across a resize
    // and no hydration mismatch to introduce by guessing a viewport on the
    // server.
    // Guarded on the METHOD, not on `window` itself: a partial `window` stub (a
    // node test harness, a non-DOM renderer) has the object and not the method,
    // and reaching straight through would throw where the honest answer is "this
    // host cannot tell me the arm, so do nothing". Both LAYOUT arms are pure CSS
    // and unaffected either way; only the focus and Escape extras live here.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia(NARROW_QUERY).matches) return;

    if (open) {
      wrapperRef.current?.focus();
      return;
    }

    // CLOSING. The panel is still mounted right now (presence is "closing" for
    // one --motion-duration-panel), so this containment check is a real read of
    // where focus is, not a guess about where it was.
    if (!wrapperRef.current?.contains(document.activeElement)) return;
    const timer = setTimeout(() => {
      // One frame past the unmount, so the launcher has actually rendered.
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[data-clara-rail-launcher]")?.focus();
      });
    }, RAIL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <>
      {open ? (
        <div
          // `aria-hidden` + no name: the backdrop is a pointer affordance only.
          // Escape and the rail's own "Collapse Clara" button are the keyboard
          // routes out, so this is not the sole path to any act.
          aria-hidden="true"
          className="motion-panel fixed inset-0 z-30 bg-black/10 transition-opacity lg:hidden"
          onClick={() => claraThreadStore.setRailOpen(false)}
        />
      ) : null}
      <div
        ref={wrapperRef}
        // `tabIndex={-1}` + `outline-none` is the SAME disposition, for the same
        // reason, as the shell's `#main-content` column (app/(firm)/layout.tsx's
        // own note): this is a programmatic focus target, not a control in the
        // tab order, and ringing a full-height panel wrapper every time the rail
        // opens would be louder than the journey it serves. Chrome does not match
        // `:focus-visible` on programmatic focus of a div in any case, so nothing
        // paints regardless. What confirms the move to a keyboard user is the
        // next Tab landing inside the rail — which the browser leg asserts.
        tabIndex={-1}
        className={
          open ? "fixed inset-y-0 right-0 z-40 flex outline-none lg:contents" : "contents"
        }
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (!window.matchMedia(NARROW_QUERY).matches) return;
          event.stopPropagation();
          claraThreadStore.setRailOpen(false);
        }}
      >
        {children}
      </div>
    </>
  );
}
