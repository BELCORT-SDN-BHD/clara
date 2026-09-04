"use client";

import { useEffect, useState } from "react";

/**
 * CB-AE2E-019 — THE HALF THAT MAKES AN EXIT TRANSITION POSSIBLE AT ALL.
 *
 * `components/clara/ClaraRail.tsx` recorded this gap in its own words and
 * declined to half-build it: "It is an ENTER only: an exit transition needs the
 * aside to stay mounted while it animates, which is a structural change to this
 * component's open/closed branch, not a polish edit". That sentence is exactly
 * right, and this file is the structural change it names. `railOpen` in the
 * thread store is a boolean with two values; a panel that animates has THREE
 * states, because "closing" is a real state in which the element is still in the
 * document, still painting, and no longer interactive.
 *
 * WHY IT MATTERS MORE NOW. Below `lg` the rail is a fixed OVERLAY (see
 * `rail-chrome.tsx`). A docked panel that vanishes instantly reads as a panel
 * that closed; an OVERLAY that vanishes instantly reads as a bug — the eye has
 * nothing to follow, so the workbench appears to flicker rather than to be
 * revealed. That is why the sibling finding was worth paying for here and not
 * before.
 *
 * WHY A TIMER AND NOT `transitionend`. `dock-panel` transitions three properties
 * (opacity, translate, width), so `transitionend` fires up to three times and,
 * under `prefers-reduced-motion`, for a different set of them. Worse, a
 * transition that never starts — an element that was display:none for a frame, a
 * browser that dropped the frame — never fires the event at all, and a missed
 * event leaves the panel mounted forever with `pointer-events` over the
 * workbench. A timer cannot fail open.
 *
 * THE DURATION IS THE TOKEN, NOT A NUMBER SOMEONE LIKED. `RAIL_EXIT_MS` is
 * `--motion-duration-panel` from `app/globals.css`, and `rail-presence.test.ts`
 * READS that file and asserts the two agree — so a lane that retunes the token
 * cannot leave this latch unmounting the panel mid-slide (too short) or holding
 * an invisible box over the workbench (too long).
 */

/** `--motion-duration-panel` (app/globals.css), in milliseconds. Drift-guarded. */
export const RAIL_EXIT_MS = 200;

export type RailPresence = "open" | "closing" | "closed";

export function useRailPresence(open: boolean): RailPresence {
  // Seeded from `open` rather than from `false`: the store's own default is
  // `railOpen: true` (lib/clara/threadStore.ts), so seeding false would render
  // the launcher on the server and the panel on the client — a hydration
  // mismatch on every first paint, in exchange for nothing.
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;
    // The BARE globals, not `window.setTimeout`. An effect never runs on the
    // server, so there is nothing to guard against there; reaching through
    // `window` only adds a way to fail on any host whose `window` is a partial
    // stub — which is exactly what the node harness provides, and it is how this
    // line was first written and first went red.
    const timer = setTimeout(() => setPresent(false), RAIL_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, present]);

  if (open) return "open";
  return present ? "closing" : "closed";
}
