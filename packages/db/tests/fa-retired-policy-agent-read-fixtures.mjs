// #1092 [0346, the runtime read credential reaches a RETIRED default depreciation policy] — the
// battery's frontier gate and its two thin helpers. NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it.
//
// NO CLIENT FACTORY OF ITS OWN. `fa-depreciation-policy-fixtures.mjs` (#932's own battery) already
// carries `p932Client` on the x41 chart with the COST account enrolled, and the two policy doors
// `setFaPolicy` / `retireFaPolicy` as pinned verb wrappers. This ticket changes a READ over the
// rows those doors write, so it re-exports them rather than restating any — the same reasoning
// `fa-authority-retired-read-fixtures.mjs` (#979) states for the same situation one table over.

import assert from "node:assert/strict";
import { rootQuery, markSkip } from "./fa-depreciation-policy-fixtures.mjs";

export * from "./fa-depreciation-policy-fixtures.mjs";

// ===========================================================================================
// The frontier gate — on 0346's STABLE STEM, never its number (a number is claimed at MERGE, a
// stem is not).
// ===========================================================================================

/** `0346_fa_retired_policy_agent_read.sql` → `fa_retired_policy_agent_read$`. */
export const FA_RETIRED_POLICY_AGENT_READ_STEM = "fa_retired_policy_agent_read$";

let _ready = null;
export async function faRetiredPolicyAgentReadReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_RETIRED_POLICY_AGENT_READ_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#1092 migration (${FA_RETIRED_POLICY_AGENT_READ_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  `fa-retired-policy-agent-read-preintegration-gate.mjs`) FAILS LOUDLY below 0346 — a skip is
 *  not evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate1092(t) {
  if (await faRetiredPolicyAgentReadReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_RETIRED_POLICY_AGENT_READ !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-retired-policy-agent-read-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#1092 agent read of a retired depreciation policy absent (no ${FA_RETIRED_POLICY_AGENT_READ_STEM} migration applied)`);
  return true;
}
