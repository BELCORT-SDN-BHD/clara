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
// IT NEVER THROWS AT THE LOOP. Like its two siblings it returns a flag; the leader wraps it in
// its own try/catch anyway, because "a sweeper that cannot fail" is a claim and the reconciler's
// history is a list of times that claim was wrong.

import { applyStripeEvents, stripeWebhookLaneConfigured } from "./checkout-pools.mjs";

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
  if (!stripeWebhookLaneConfigured()) {
    if (!_dormantLogged) {
      _dormantLogged = true;
      log("[stripe] applier belt DORMANT — no webhook-lane DSN; the ceremony follows the migration");
    }
    return { stripeApplyOk: false, receipt: null };
  }
  if (!_doorPresent) {
    const r = await leaderClient.query("select to_regprocedure($1) is not null as ok", [APPLIER_SIGNATURE]);
    if (r.rows[0]?.ok !== true) return { stripeApplyOk: false, receipt: null };
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
