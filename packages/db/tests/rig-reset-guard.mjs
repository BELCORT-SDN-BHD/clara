// #773 — the database-NAME allowlist that stands between `CLARA_RIG_ALLOW_RESET=1` and a rig
// somebody is still using. NOT a test file (no `.test.mjs` suffix): it is the guard itself,
// imported by rig-isolation.test.mjs's T19 and proven by rig-reset-guard.test.mjs.
//
// THE HOLE THIS CLOSES, measured rather than reasoned about. T19 ("poison-role: reset +
// re-migrate normalizes a poisoned clara role") gates solely on `CLARA_RIG_ALLOW_RESET=1` and
// then calls `reset()`, which delegates to `assertDestructiveAllowed()` in `lib/guard.mjs`. That
// gate permits the drop once `CLARA_ALLOW_DESTRUCTIVE=1` is set AND the target is "ephemeral" —
// and `targetIsEphemeral()` returns true for ANY loopback host regardless of the database name,
// a caveat the guard module's own doc comment states outright. So a shared local rig whose name
// does not match the disposable pattern is wiped anyway when a worker sets both flags out of
// habit. The rig names from the 2026-09-14 refresh wave — `clara_631`, `clara_643` — do not match
// that pattern, and they are exactly the databases three workers lost.
//
// THE REMEDY IS THE ONE ALREADY IN THE TREE, ONE FILE OVER. `dropDatabase()` in
// `rig-cluster-reset.mjs` refuses to drop a NAMED database unless it matches the guard module's
// exported `EPHEMERAL_DB`, with a comment saying why the connection-target check alone is
// insufficient. This is that same check, applied to T19's own connection target.
//
// THE SHARED GUARD MODULE IS NOT MODIFIED. `assertDestructiveAllowed`, `targetIsEphemeral` and
// `EPHEMERAL_DB` are reused as they are — never loosened, and never globally hardened, because
// `restore.mjs`, `restore-full.mjs`, `dr-selftest.mjs`, `seed.mjs`, `migrate-harness.mjs` and
// `rig-cluster-reset.mjs` all call the same gate and a global change would move all of their
// blast radii at once. The pattern is IMPORTED here and never re-spelled.

import { EPHEMERAL_DB } from "../lib/guard.mjs";
import { targetLabel } from "../lib/pg.mjs";

/** The database half of `targetLabel()`'s `host:port/db` — the same resolution (DSN-versus-PG*
 *  split included) every other destructive caller already reasons about. */
export function resolvedDatabaseName(label = targetLabel()) {
  const slash = label.indexOf("/");
  return slash === -1 ? "" : label.slice(slash + 1);
}

/**
 * Throw unless the database this process is CONNECTED TO is name-shaped like a throwaway.
 * `EPHEMERAL_DB` is a whole-name or final-`.`/`_`/`-`-segment match, so `clara_ci`,
 * `clara_test` and `clara_rt_test` stay resettable while `clara_631` does not.
 * @returns {string} the resolved database name, when it is admitted.
 */
export function assertResetTargetDisposable(label = targetLabel()) {
  const db = resolvedDatabaseName(label);
  if (!EPHEMERAL_DB.test(db)) {
    throw new Error(
      `T19 reset REFUSED for ${label}: the database name ${JSON.stringify(db)} does not look disposable `
      + "(no ci/test/tmp/temp/scratch/ephemeral whole-name or final segment). CLARA_RIG_ALLOW_RESET=1 and "
      + "CLARA_ALLOW_DESTRUCTIVE=1 authorize a DROP SCHEMA, and lib/guard.mjs's targetIsEphemeral() "
      + "authorizes ANY loopback host regardless of database name — so this check, not that one, is what "
      + "stands between the flags and a rig somebody is still using. Point the run at a *_ci / *_test "
      + "database, or clone this one first.",
    );
  }
  return db;
}

/**
 * The ONLY way T19 resets: the name check runs FIRST, so a refusal means `reset()` was never
 * entered and no schema was dropped. `reset` is passed in rather than imported here so the proof
 * in `rig-reset-guard.test.mjs` can hand it a spy and read that the spy never ran — the positive
 * bar `migrate-harness-clone-guard.test.mjs` sets (only what a read SAW counts as evidence).
 */
export async function guardedReset(reset, options = {}) {
  assertResetTargetDisposable();
  return reset(options);
}
