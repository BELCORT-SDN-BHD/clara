// FS-4 C-5 item 2 — THE APPLIER SWEEP BELT.
//
// Design part 3 §1 steps 5 and 6: after every accepted webhook the route calls
// `apply_stripe_events` best-effort and OUTSIDE the response path, and "a periodic sweep on the
// runtime's existing reconciler cadence calls `apply_stripe_events()` every minute. **This is
// what makes step 5 optional and what recovers a webhook that arrived while the database was
// unavailable.**" This module is step 6.
//
// WHY IT IS NOT INSIDE `runReconcilerSweep`. Every other belt in that sweep runs on the leader's
// own `clara_runtime` client, and `apply_stripe_events` is granted to `clara_stripe_webhook`
// ALONE — measured: `clara_runtime` holds EXECUTE on neither webhook door. So this belt cannot
// ride the leader's connection at all; it takes its own checkout from the webhook pool. It is
// wired into the leader LOOP (one process-wide sweeper, under the same leader lock that already
// serialises the estate's other belts) rather than into a second timer, so two machines never
// sweep concurrently.
//
// FEATURE-DETECTED, LIKE THE SANDBOX AND RENDER BELTS. A runtime image can ship ahead of the
// migration, and an image that crash-looped because 0160 was not applied yet would take chat
// down with it. The probe is a `to_regprocedure` on the EXACT signature — not a name — and it is
// cached after the first positive answer only, so a runtime that boots before the migration
// starts sweeping once it lands without a restart.
//
// DORMANT WITHOUT A CREDENTIAL, AND SILENT ABOUT IT AFTER THE FIRST LINE. Both checkout logins
// ship NOLOGIN and gain their DSN at a ceremony that follows the migration (see
// `checkout-pools.mjs`'s `assertCheckoutPoolConfig`). Until then this belt logs once and returns
// — a per-cycle log line every two seconds for a known-pending ceremony is noise that trains a
// reader to ignore the log.
//
// "DORMANT" IS DECIDED BY A CREDENTIAL, NOT BY `RELAY_TEST_MODE`, and the first cut of this file
// got that wrong (the #511 review's B-2). It gated on `stripeWebhookLaneConfigured()`, which is
// `TEST_MODE || DSN` — deliberately true on a rig so the batteries can drive the real doors
// through the base identity. The consequence was that EVERY test process booting the world with
// `RELAY_TEST_MODE=1` ran the belt: a seventh pool connected and two queries issued inside
// `tests/intake-e2e.mjs`'s timed window, in a process that never asked for a background writer.
// `stripeApplierBeltEnabled` below reads the DEPLOYMENT fact instead. The comment that used to
// sit on `leader.mjs`'s `lastStripeApplyRun` claimed this file "stays dormant without a lane
// DSN" — false under TEST_MODE at the time it was written, true now.
//
// IT NEVER THROWS AT THE LOOP. Like its two siblings it returns a flag; the leader wraps it in
// its own try/catch anyway, because "a sweeper that cannot fail" is a claim and the reconciler's
// history is a list of times that claim was wrong.

import { applyStripeEvents, STRIPE_WEBHOOK_DSN_VAR } from "./checkout-pools.mjs";

/** The opt-in/opt-out override, for a rig that deliberately wants the belt (or deliberately
 *  does not). Absent ⇒ the credential decides. */
export const BELT_VAR = "CLARA_STRIPE_APPLIER_BELT";

/**
 * Should the belt run at all?
 *
 * THIS IS NOT `stripeWebhookLaneConfigured()`, AND THE DIFFERENCE IS THE #511 REVIEW'S B-2.
 * That predicate answers "can this process REACH the lane", and it is true under
 * `RELAY_TEST_MODE=1` with no DSN on purpose — the rig connects with the base env identity and
 * SET ROLEs, which is what lets the batteries drive the real doors. Using it to decide whether a
 * BACKGROUND WRITER runs made every test process that boots the world — `intake-e2e.mjs` sets
 * `RELAY_TEST_MODE=1` at its line 30 — open a seventh pool and issue two queries it never asked
 * for, inside a cell that times a chat round trip against a parse load.
 *
 * A belt is a deployment decision, so it reads a DEPLOYMENT fact: a real credential, or an
 * explicit opt-in. A test-mode flag is neither.
 */
export function stripeApplierBeltEnabled(env = process.env) {
  const override = env[BELT_VAR];
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return Boolean(env[STRIPE_WEBHOOK_DSN_VAR]);
}

/** Design part 3 §1 step 6: "every minute". */
const STRIPE_APPLY_MS_ENV = Number(process.env.CLARA_STRIPE_APPLY_MS);
export const STRIPE_APPLY_MS =
  Number.isFinite(STRIPE_APPLY_MS_ENV) && STRIPE_APPLY_MS_ENV > 0 ? STRIPE_APPLY_MS_ENV : 60_000;

/** How many events one sweep examines. The door's own default is 100. */
const STRIPE_APPLY_LIMIT_ENV = Number(process.env.CLARA_STRIPE_APPLY_LIMIT);
export const STRIPE_APPLY_LIMIT =
  Number.isInteger(STRIPE_APPLY_LIMIT_ENV) && STRIPE_APPLY_LIMIT_ENV > 0 ? STRIPE_APPLY_LIMIT_ENV : 100;

/** The exact signature, never a bare name (law 3 — spelling is not identity). */
export const APPLIER_SIGNATURE = "clara.apply_stripe_events(integer)";

/**
 * True iff the sweep is due — pure, the same since-last-run shape as its five siblings in
 * `leader.mjs`. `lastRunMs = 0` makes the first cycle after boot sweep immediately, which is
 * exactly what recovers a webhook delivered while this process was down.
 */
export function stripeApplyDue(lastRunMs, nowMs, intervalMs = STRIPE_APPLY_MS) {
  return nowMs - lastRunMs >= intervalMs;
}

let _doorPresent = false;
let _dormantLogged = false;

/** Reset the memoised probe + the one-shot log. Test-only. */
export function _resetStripeApplierProbeForTest() {
  _doorPresent = false;
  _dormantLogged = false;
}

/**
 * Run one applier sweep.
 *
 * @param {import("pg").ClientBase} leaderClient the leader's own clara_runtime client — used
 *   ONLY for the feature probe (a catalog read any role may do), never for the door call
 * @param {{log?: (m: string) => void}} [deps]
 * @returns {Promise<{stripeApplyOk: boolean, receipt: Record<string, unknown>|null}>}
 */
export async function reconcileStripeEvents(leaderClient, deps = {}) {
  const log = deps.log ?? (() => {});
  if (!stripeApplierBeltEnabled(deps.env ?? process.env)) {
    if (!_dormantLogged) {
      _dormantLogged = true;
      log(`[stripe] applier belt DORMANT — no ${STRIPE_WEBHOOK_DSN_VAR}; the ceremony follows the migration`);
    }
    // `true`, not `false`. This is "nothing to do", not "the sweep failed", and the leader
    // stamps on true — so a dormant belt costs ONE evaluation per interval instead of a
    // `to_regprocedure` every ~2 s forever (the review's N-4). It also issues NO query at all
    // on this path, which is what keeps a test process that never asked for the belt free of it.
    return { stripeApplyOk: true, receipt: null };
  }
  if (!_doorPresent) {
    const r = await leaderClient.query("select to_regprocedure($1) is not null as ok", [APPLIER_SIGNATURE]);
    // Same reasoning as the dormant arm: a runtime deployed ahead of 0160 has nothing to sweep,
    // and re-probing the catalog every cycle is noise, not diligence. The probe is memoised only
    // on success, so the belt still wakes on its own once the migration lands.
    if (r.rows[0]?.ok !== true) return { stripeApplyOk: true, receipt: null };
    _doorPresent = true;
  }
  const receipt = await applyStripeEvents(STRIPE_APPLY_LIMIT);
  // Log only when the sweep DID something. A line per minute saying "0 of 0" is how a log stops
  // being read; a line naming a problem row is how an operator finds a stranded customer.
  const applied = Number(receipt?.applied ?? 0);
  const problems = Number(receipt?.problems ?? 0);
  if (applied > 0 || problems > 0) {
    log(`[stripe] applier sweep: applied=${applied} examined=${receipt?.examined ?? 0} problems=${problems}`);
  }
  return { stripeApplyOk: true, receipt: receipt ?? null };
}
