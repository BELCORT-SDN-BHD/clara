// FS-4 C-5 fold (the #511 review's N-7) — MAKE AN ATTACKER-INFLUENCED STRING SAFE TO LOG.
//
// THE FINDING. `src/stripeRoutes.ts` reads the event's `id` and `type` off the parsed payload
// BEFORE the projector validates either, so that a livemode or door refusal can name WHICH event
// it refused instead of "(unparsed)". The first cut clamped both to 255 characters and applied no
// character class. The `id` is safe by luck — the projector pins `^evt_[A-Za-z0-9_]+$`, and the
// log line that uses the raw value runs only in the catch arm — but `type` has no such shape, so
// an event whose `type` contained a newline could append a fabricated line to the runtime log.
//
// THE EXPOSURE IS BOUNDED AND STILL WORTH CLOSING. Reaching this code needs a signature that
// verifies, i.e. the endpoint signing secret, so the harm is log integrity AFTER a compromise
// rather than a way in. It costs one regex, and a forged log line is exactly the evidence an
// incident review would be reading.
//
// A `.mjs` MODULE RATHER THAN A HELPER INSIDE THE ROUTE, for a mechanical reason: the pure
// battery (`tests/c5-checkout-unit.test.mjs`) runs without tsx, so a function it drives cannot
// live in a `.ts` file. Keeping the wall where the pure test can reach it is the point.

/** The printable ASCII range. Everything else — newline, carriage return, escape, NUL — is a
 *  character no legitimate Stripe event type or id contains and every log forger needs. */
const NON_PRINTABLE = /[^\x20-\x7E]/g;

/**
 * @param {string} value
 * @param {number} [max] clamp length, applied BEFORE the substitution so the cost is bounded by
 *   the clamp rather than by the attacker's input length
 * @returns {string}
 */
export function logSafe(value, max = 255) {
  return String(value).slice(0, max).replace(NON_PRINTABLE, ".");
}
