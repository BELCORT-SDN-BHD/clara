// The one-click-one-act guard for a governed door's confirm button (review
// finding M3, web/p3-close-reports independent review 2026-08-27). `busy` (a
// hydrated-part's write-in-flight flag, lib/parts/hooks.ts's `act()`) is
// necessary but NOT sufficient as the only guard on a dialog's confirm
// button: `setBusy(true)` happens synchronously inside `act()`, but the
// Button's own `disabled={busy}` prop only takes effect on the NEXT render —
// there is a real, measured window where a second click before that re-render
// still reaches `onConfirm` a second time. Proven by the review: deleting
// `disabled={busy}` from a door dialog left the full 265-test suite green,
// because nothing exercised the concurrent-click path. A ref-backed guard
// closes that window without depending on render timing at all — `.current`
// is read/written synchronously, in the same microtask as the click handler,
// with no React re-render in between.

export type SingleFireGuard = { current: boolean };

export function createSingleFireGuard(): SingleFireGuard {
  return { current: false };
}

/**
 * Runs `fn` only if no other call is already in flight through THIS guard.
 * Returns `true` if `fn` actually ran, `false` if this call was dropped
 * because another was already in flight — a concurrent call is a NO-OP, never
 * queued and never retried (doors.ts's own "a refusal is never auto-retried"
 * law extends naturally to "a door is never double-submitted" here). The
 * caller uses the boolean to decide whether ITS OWN follow-up (e.g. closing a
 * dialog) should run — a dropped call must not behave as if it had succeeded.
 */
export async function runOnce(guard: SingleFireGuard, fn: () => Promise<void>): Promise<boolean> {
  if (guard.current) return false;
  guard.current = true;
  try {
    await fn();
  } finally {
    guard.current = false;
  }
  return true;
}
