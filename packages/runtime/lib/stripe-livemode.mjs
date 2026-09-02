// FS-4 C-5 item 9 — THE LIVEMODE GATE (security pass A-M5, cutover checklist item 9).
//
// THE FINDING. `clara.stripe_events.livemode` is declared `boolean not null` (0160:158) and
// written on every row (0160:321), and a repo-wide census found FOUR non-test occurrences: the
// column, the write, and two design-doc lines. **Nothing reads it** — not `apply_stripe_events`,
// not `claim_paid_firm`, not `apps/web`, not the runtime. Storing without gating is deliberate
// today, because the beta itself runs in Stripe TEST mode: `checkout-gate-design-part2.md:74`
// says so in the column's own comment ("G13: a TEST-mode beta must be able to SEE that").
//
// IT BECOMES A DEFECT AT EXACTLY ONE MOMENT: the flip to live mode. From then on a TEST-mode
// `checkout.session.completed` — free test card, no money — delivered to the same endpoint
// mints a REAL firm, because nothing anywhere compares `livemode` to the mode the deployment
// believes it is in. Stripe sends test and live events to separately-configured endpoints, so
// this needs a misconfiguration to trigger. Misconfiguring one webhook endpoint during a mode
// flip is a common mistake, not an exotic one.
//
// THE GATE IS HERE, NOT IN `apply_stripe_events`, AND THAT IS THE CHEAPER HALF OF A-M5's OWN
// FIX SHAPE: the applier is a merged body under C-2's review and the environment is not a fact
// the database has. The route refuses BEFORE `record_stripe_event`, so a mode-mismatched event
// never reaches the store at all.
//
// FAIL CLOSED WHEN UNSET, AND THAT IS THE WHOLE POINT. An absent `CLARA_STRIPE_LIVEMODE` is not
// "assume test": a deployment that has not stated its mode has not been configured, and the one
// outcome a money surface must never have on a missing config is "accept everything". Every
// event is refused with a named 503 until the variable is set, which is loud, immediate and
// impossible to mistake for working. The deploy notes make it a required secret on both arms.

export const LIVEMODE_VAR = "CLARA_STRIPE_LIVEMODE";

/** A typed refusal. `code` distinguishes "not configured" from "the event disagrees" so the
 *  route can answer 503 for the first (ours to fix, retry later) and 403 for the second (the
 *  endpoint is wired to the wrong Stripe mode — retrying will not help, but Stripe retrying is
 *  still better than a silent 200, so both are non-2xx). */
export class StripeLivemodeError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "StripeLivemodeError";
    this.code = code;
  }
}

/**
 * The mode this deployment believes it is in, or null when unconfigured.
 *
 * Parsed from a CLOSED vocabulary, never `Boolean(raw)`: `Boolean("false")` is `true`, and a
 * deployment that wrote `CLARA_STRIPE_LIVEMODE=false` meaning test mode would silently accept
 * live events. Anything outside the vocabulary is unconfigured — a typo fails closed rather
 * than picking a mode for the operator.
 * @returns {boolean|null}
 */
export function expectedLivemode(env = process.env) {
  const raw = env[LIVEMODE_VAR];
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "live") return true;
  if (v === "0" || v === "false" || v === "test") return false;
  return null;
}

/**
 * Refuse an event whose `livemode` disagrees with the deployment's configured mode. Throws
 * `StripeLivemodeError`; returns nothing on success.
 * @param {unknown} eventLivemode the event's own top-level `livemode`
 */
export function assertLivemodeMatches(eventLivemode, env = process.env) {
  const expected = expectedLivemode(env);
  if (expected === null) {
    throw new StripeLivemodeError(
      "livemode_not_configured",
      `${LIVEMODE_VAR} is not set to one of 1/true/live/0/false/test — refusing every event until the deployment states its Stripe mode`,
    );
  }
  if (typeof eventLivemode !== "boolean") {
    throw new StripeLivemodeError("livemode_absent", "the event carries no boolean livemode");
  }
  if (eventLivemode !== expected) {
    throw new StripeLivemodeError(
      "livemode_mismatch",
      `the event is livemode=${eventLivemode} but this deployment is configured for livemode=${expected}`,
    );
  }
}
