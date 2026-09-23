// #897 — FOCUS RETURNS TO THE CONTROL THAT OPENED THE FULL-SCREEN THREAD.
//
// The rail's escalate control ("Open full screen") sends the reader across a route-group
// boundary — `(firm)` to `(full)`, SIBLING groups, not nested (rail-mount.tsx's own note) — and
// the collapse control ("Back") sends them back the same way. THE BROWSER DOES NOT RESTORE
// FOCUS ACROSS EITHER LEG: measured directly (agentic-finish-walk.spec.ts's own #897 arm before
// this module existed — `document.activeElement` was `<body>` after the round trip, same
// failure mode `lib/firm/portfolio-focus-return.ts`'s own header already recorded for a
// different drilldown). This module is that fix's twin, built on the SAME idiom and the same
// tradeoffs, for this one control instead of a per-row set of them.
//
// THE CHANNEL IS `sessionStorage`, on `portfolio-focus-return.ts`'s own argument: per-tab,
// per-origin, never in the URL (a marker in the address bar would survive a copy-paste and move
// a stranger's focus). BEST-EFFORT AND NEVER LOAD-BEARING — `sessionStorage` throws in some
// private modes and can be disabled outright; every function here swallows that and answers
// "nothing to restore", degrading to the focus behaviour that shipped before this module.
//
// SCOPED BY ALTITUDE, not a bare boolean: the marker's VALUE is the same key `RailMount`'s own
// `key={clientId ?? FIRM_ALTITUDE}` uses, so a marker written by one client's escalate can never
// steal focus on a DIFFERENT client's (or the firm's) fresh rail mount — the case a plain
// boolean would get wrong if the reader left the full-screen route some way other than the
// collapse link (a bookmark, a typed URL) and a later, unrelated rail happened to mount while
// the marker was still unclaimed.
//
// AND IT IS TAKE-ONCE, like its sibling: read-and-clear, so a marker can move focus exactly one
// time and never yank focus away from wherever the reader goes next.

const STORAGE_KEY = "clara-rail-return-focus";

function readSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The SAME identity `RailMount`'s own `key={clientId ?? FIRM_ALTITUDE}` carries — imported
 *  from nowhere new (avoids a circular import with `useActiveThread.ts`), just re-derived the
 *  one place this module needs it: `undefined` (no client segment) means the firm altitude. */
function railFocusScope(clientId: string | undefined): string {
  return clientId ?? "firm";
}

/** Called when the escalate control is activated — by pointer or by Enter, which a browser
 *  dispatches as a click on an anchor, so one handler covers both. */
export function rememberRailReturnFocus(clientId: string | undefined): void {
  const storage = readSessionStorage();
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, railFocusScope(clientId));
  } catch {
    // A full or disabled store costs the person their focus position, never the navigation.
  }
}

/** Read AND clear, matching THIS mount's own altitude. `false` on a scope mismatch (a marker
 *  left over from a different client or the firm altitude), on a first visit, on a reload with
 *  nothing pending, in a private mode that refuses the store, and on every re-read after the
 *  first — the marker is gone the moment this returns, matched or not. */
export function takeRailReturnFocus(clientId: string | undefined): boolean {
  const storage = readSessionStorage();
  if (storage === null) return false;
  try {
    const value = storage.getItem(STORAGE_KEY);
    storage.removeItem(STORAGE_KEY);
    return value !== null && value === railFocusScope(clientId);
  } catch {
    return false;
  }
}
