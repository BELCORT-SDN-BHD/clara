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

/** #715 — THE ONE CHANNEL a successful save tells the mounted sync about itself on.
 *
 *  The attribute this component owns was applied at MOUNT and never again, so
 *  `/settings/account`'s Save wrote the durable row, the person saw "Preferences
 *  saved" — and the product kept animating exactly as before until the next
 *  navigation. The obvious repair (have the section write `data-motion` itself)
 *  would have put a SECOND writer on the attribute, and the second writer would
 *  have had to re-derive "…unless the OS is already asking for reduced motion",
 *  which is the one rule this pair exists to keep in one place
 *  (`resolveEffectiveReducedMotion`). So the section publishes the VALUE it just
 *  saved and this component — still mounted, still holding the live `matchMedia`
 *  handle — recomputes, exactly as it does when the OS setting changes.
 *
 *  A `window` event rather than a module-level callback because the two live in
 *  different trees: the sync is mounted once in `app/layout.tsx`, the section is
 *  rendered by a route far below it, and neither can hold a ref to the other. */
export const MOTION_PREFERENCE_EVENT = "clara:motion-preference";

/** Announce a preference that has just been SAVED (never a draft — the attribute
 *  must not follow a radio the person may still reset). A no-op wherever there is
 *  no window; the mount-time read is always the authority underneath it. */
export function publishMotionPreference(preference: MotionPreference): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent<MotionPreference>(MOTION_PREFERENCE_EVENT, { detail: preference }));
}

/** The same paint cache the mount-time read writes — see this component's header
 *  for why it is a cache and never the authority. `undefined` (no row ever saved)
 *  clears it, exactly as "system" does: both mean "the OS query alone". */
function cachePreference(preference: MotionPreference | undefined): void {
  try {
    if (preference === "reduced") window.localStorage.setItem(MOTION_LOCAL_STORAGE_KEY, "reduced");
    else window.localStorage.removeItem(MOTION_LOCAL_STORAGE_KEY);
  } catch {
    // Best-effort cache only.
  }
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
        cachePreference(prefs.interface.motion);
        recompute();
      } catch {
        // No session, no saved row, or a transport failure — "system" (the
        // OS query alone) stands. This component has no UI to show a failure
        // in, and a motion preference is never worth surfacing an error for.
      }
    })();

    // #715 — A SAVED PREFERENCE APPLIES NOW, not on the next navigation. Same
    // `recompute`, so the OS query still wins the way it always did: publishing
    // "system" while the OS asks for reduced motion leaves the attribute reduced.
    const onPublished = (evt: Event) => {
      const next = (evt as CustomEvent<MotionPreference>).detail;
      if (next !== "system" && next !== "reduced") return;
      storedPreferenceRef.current = next;
      cachePreference(next);
      recompute();
    };
    window.addEventListener(MOTION_PREFERENCE_EVENT, onPublished);

    return () => {
      cancelled = true;
      mql.removeEventListener("change", recompute);
      window.removeEventListener(MOTION_PREFERENCE_EVENT, onPublished);
    };
  }, []);

  return null;
}
