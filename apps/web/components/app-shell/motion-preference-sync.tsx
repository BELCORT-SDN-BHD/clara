"use client";

import { useLayoutEffect, useRef } from "react";

import { getMyPreferences } from "@/lib/settings/preferences";
import { getSessionToken } from "@/lib/session";
import {
  MOTION_DATA_ATTRIBUTE,
  MOTION_LOCAL_STORAGE_KEY,
  motionAttributeValue,
  resolveEffectiveReducedMotion,
  type MotionPreference,
} from "@/lib/settings/motion-preference";

function applyAttribute(effectiveReduced: boolean): void {
  document.documentElement.setAttribute(MOTION_DATA_ATTRIBUTE, motionAttributeValue(effectiveReduced));
}

/**
 * Mounted ONCE in the root layout (app/layout.tsx), beside
 * `<SessionTokenBridge />` — see that component's own header for why a small,
 * side-effect-only global component belongs at the root rather than in the
 * firm shell: this must run on the (entry) faces too, where it simply never
 * finds a session and leaves the OS query as the only signal, exactly like
 * today. Renders nothing.
 *
 * WHY THIS CANNOT REGRESS AN OS-REDUCED-MOTION CALLER, even before this
 * component has run at all: `app/globals.css`'s `@custom-variant motion-reduce`
 * override ADDS the `[data-motion="reduced"]` arm beside the existing
 * `@media (prefers-reduced-motion: reduce)` arm — it does not replace it (see
 * that file's own comment, verified by compiling the block through Tailwind's
 * `compile()` API before landing). So the very first paint, before any JS
 * executes, already matches every `motion-reduce:`-tagged utility exactly as
 * it did before this file existed; this component only ever ADDS a match
 * (an explicit "reduced" preference), never removes the OS's own.
 *
 * `useLayoutEffect`, not `useEffect`: the OS-only synchronous branch below
 * commits before the browser paints THIS component's own render, closing the
 * one flash window this component itself could introduce. The async fetch
 * that can widen the match to an explicit override still cannot beat the
 * network, so a caller who saved "reduced" while their OS asks for no
 * preference can see one initial frame at full motion — a disclosed,
 * accepted limitation (this app's CSP is `script-src 'self'`, no
 * `'unsafe-inline'`/nonce, so the usual blocking-inline-script fix for this
 * exact class of flash is not available here; see docs/ARCHITECTURE.md).
 *
 * localStorage is a same-browser PAINT CACHE ONLY, read here purely to narrow
 * that one-frame window on a REPEAT visit — never the authority, and never
 * read by anything that decides real UI state (contrast lib/parts/hooks.ts's
 * hydrate-never-trust law, which governs DATA, not a cosmetic motion hint).
 * clara.get_my_preferences() is queried on every mount regardless of what the
 * cache said, and its answer always wins.
 */
export function MotionPreferenceSync(): null {
  const storedPreferenceRef = useRef<MotionPreference | undefined>(undefined);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    try {
      const cached = window.localStorage.getItem(MOTION_LOCAL_STORAGE_KEY);
      if (cached === "reduced") storedPreferenceRef.current = "reduced";
    } catch {
      // Private browsing / blocked storage — the OS query alone still governs.
    }

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const recompute = () => {
      applyAttribute(resolveEffectiveReducedMotion(storedPreferenceRef.current, mql.matches));
    };

    recompute(); // Synchronous, OS(+cache)-only — matches pre-existing behavior exactly.
    mql.addEventListener("change", recompute);

    let cancelled = false;
    void (async () => {
      try {
        const token = await getSessionToken();
        if (!token || cancelled) return;
        const prefs = await getMyPreferences();
        if (cancelled) return;
        storedPreferenceRef.current = prefs.interface.motion;
        try {
          if (prefs.interface.motion === "reduced") {
            window.localStorage.setItem(MOTION_LOCAL_STORAGE_KEY, "reduced");
          } else {
            window.localStorage.removeItem(MOTION_LOCAL_STORAGE_KEY);
          }
        } catch {
          // Best-effort cache only.
        }
        recompute();
      } catch {
        // No session, no saved row, or a transport failure — "system" (the
        // OS query alone) stands. This component has no UI to show a failure
        // in, and a motion preference is never worth surfacing an error for.
      }
    })();

    return () => {
      cancelled = true;
      mql.removeEventListener("change", recompute);
    };
  }, []);

  return null;
}
