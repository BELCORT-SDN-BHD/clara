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
 *
 * Returns BOTH halves of the outcome, which are different facts and must not be
 * conflated (CB-AE2E-004, the fifteen-wrapper class defect):
 *
 *   - `ran`   — whether `fn` was invoked at all. `false` ONLY when this call was
 *               dropped because another was already in flight. A concurrent call
 *               is a NO-OP, never queued and never retried (doors.ts's own "a
 *               refusal is never auto-retried" law extends naturally to "a door
 *               is never double-submitted" here).
 *   - `value` — what `fn` itself resolved to, `undefined` when the call was
 *               dropped. This is the ONLY channel that carries whether the act
 *               SUCCEEDED: `act()` (lib/parts/hooks.ts) catches every failure and
 *               resolves, so a governed refusal never rejects and `ran` is `true`
 *               for a refused act exactly as it is for a successful one.
 *
 * The previous single-boolean signature made those two facts indistinguishable,
 * and all fifteen door-dialog wrappers read it as "the act succeeded" — closing
 * the dialog (and destroying the human's typed input) on a refusal that was
 * asking them to correct a field inside it. A caller that must close only on
 * success reads `value === true`; a caller that only cares about re-entrancy
 * reads `ran`.
 *
 * `fn` may still throw — the guard is released in a `finally` and the rejection
 * propagates unchanged, exactly as before.
 */
export async function runOnce<T>(
  guard: SingleFireGuard,
  fn: () => Promise<T>,
): Promise<{ ran: boolean; value: T | undefined }> {
  if (guard.current) return { ran: false, value: undefined };
  guard.current = true;
  try {
    const value = await fn();
    return { ran: true, value };
  } finally {
    guard.current = false;
  }
}
