// #626 (refresh spec #612, journey D1) — the pure, DOM-free half of the motion
// preference: what the effective state should be, and what the shell must write
// to make Tailwind's `motion-reduce:` variant see it. No React, no
// `window`/`document` — `components/app-shell/motion-preference-sync.tsx` is the
// one caller that touches the DOM, and `app/globals.css`'s `@custom-variant
// motion-reduce` override is the one place that reads the attribute this file
// names. Kept separate so the state-resolution logic (the part with real branches
// worth a unit cell) is testable with zero DOM shim.

/** The two values `interface.motion` may carry (0179_user_preferences.sql's
 *  enumerated supported set). "system" — and an unset/absent value, which the
 *  web treats identically — means "defer to the OS query". */
export type MotionPreference = "system" | "reduced";

export const MOTION_PREFERENCE_VALUES: readonly MotionPreference[] = ["system", "reduced"];

export function isMotionPreference(value: unknown): value is MotionPreference {
  return value === "system" || value === "reduced";
}

/** The attribute `app/globals.css`'s `@custom-variant motion-reduce` block
 *  matches on. ONE name, read from both sides so a rename can never drift. */
export const MOTION_DATA_ATTRIBUTE = "data-motion";

/** A same-browser paint cache ONLY — never the authority. See
 *  motion-preference-sync.tsx's header for why a stale/absent value here is
 *  always safe to fall back past. */
export const MOTION_LOCAL_STORAGE_KEY = "clara:motion-preference";

/**
 * Whether motion should be reduced RIGHT NOW, given the caller's saved
 * preference (`undefined` when no row has ever been saved, or the value has
 * not loaded yet) and whether the OS itself is currently asking for reduced
 * motion. An explicit "reduced" choice wins outright; anything else defers
 * entirely to the OS — there is no way to force motion BACK ON against the
 * OS's own request, matching every other product's reduced-motion contract.
 */
export function resolveEffectiveReducedMotion(
  preference: MotionPreference | undefined,
  osPrefersReduced: boolean,
): boolean {
  if (preference === "reduced") return true;
  return osPrefersReduced;
}

/** The value to WRITE into `MOTION_DATA_ATTRIBUTE` for a given effective state —
 *  never a boolean string; the CSS selector matches the literal `"reduced"`. */
export function motionAttributeValue(effectiveReduced: boolean): "reduced" | "system" {
  return effectiveReduced ? "reduced" : "system";
}
