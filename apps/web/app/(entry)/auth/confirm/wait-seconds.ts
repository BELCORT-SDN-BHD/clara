// THE ONE WAIT-BOUNDING RULE ON THIS LANE — shared by the resend wall
// (`resend/resend-wall.ts`) and the verify wall (`verify/confirmation-wall.ts`)
// so the display ceiling and the clamp-not-downgrade rule have exactly one
// owner instead of two copies that could drift apart.
//
// A WAIT LONGER THAN A CARD ON THIS LANE WILL PRINT IS STILL A WAIT. Both
// walls guard a number a caller measured — the resend wall's provider cooldown
// is uncapped by construction, and the verify wall's C1/C2 wait is clamped by
// the door itself today, but a future door or a rolling deploy is not
// something this module takes on faith. Either way, an over-long wait is
// CLAMPED to `WAIT_SECONDS_CEILING` and FLAGGED (`atLeast`), never downgraded
// to a failure outcome — that would be a plain falsehood about a wall that
// answered perfectly, and it would invite a retry that spends another
// attempt. Only a value carrying NO usable number at all falls back to the
// caller's own per-outcome default.
export const WAIT_SECONDS_CEILING = 900;

/**
 * THE WAIT, AND WHETHER THE NUMBER IS EXACT.
 *
 * `fallback` is what a MISSING or unusable wait becomes — different callers
 * pass different numbers here because they are different mechanisms (a
 * provider send cooldown measured in tens of seconds vs. a 15-minute attempt
 * window), so this function takes no opinion on it.
 *
 * A non-integer is rounded UP rather than dropped — never promise a shorter
 * wait than the one that was measured.
 */
export function waitSeconds(value: unknown, fallback: number): { seconds: number; atLeast: boolean } {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { seconds: fallback, atLeast: false };
  }
  const seconds = Math.ceil(value);
  return seconds > WAIT_SECONDS_CEILING
    ? { seconds: WAIT_SECONDS_CEILING, atLeast: true }
    : { seconds, atLeast: false };
}
