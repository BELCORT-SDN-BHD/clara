// #936 — fixtures for the dedicated accrual-correction door (migration 0284). NOT a test file
// (the name does not end in `.test.mjs`), so `node --test` ignores it.
//
// EXTENDS `accrual-adjustments-fixtures.mjs` (which extends accounting-plans → work-cancel →
// work-journal) rather than building a second world, for that file's own reason: #936's whole
// claim is that a correction rides `clara.revise_accounting_plan` UNCHANGED and writes a
// SUCCESSOR `clara.accrual_adjustments` row, so the cells need exactly the chart, the accrual
// builder and the configuration door #652's fixtures already carry.
//
// THE WIRE CONTRACT THIS MODULE ADDS (#936's own door):
//
//   clara.correct_accrual_adjustment(p_accrual_id, p_accrual, p_op_key)
//         -> {accrual_id, corrects_accrual_id, plan_id, revision_id, revision,
//             superseded_revision, status, overlap_warning}
//
// THE FRONTIER GATE keys on THIS migration's STABLE STEM (`accrual_correction$`), never its
// number, and never the base accrual lane's own stem (`accrual_adjustments$`) — the
// `db-slice-frontiers` matrix runs this package against databases pinned at earlier frontiers
// where 0222 has applied and 0284 has not.

import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk,
} from "./accrual-adjustments-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./accrual-adjustments-fixtures.mjs";

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #936 migration's STABLE STEM. */
export const ACCRUAL_CORRECTION_STEM = "accrual_correction$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function accrualCorrectionLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [ACCRUAL_CORRECTION_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateAccrualCorrection(t)) return;` — the house per-cell frontier gate, counted. */
export async function gateAccrualCorrection(t) {
  if (await accrualCorrectionLaneReady()) return false;
  markSkip();
  t.skip(`#936 accrual-correction door absent (no ${ACCRUAL_CORRECTION_STEM} migration applied)`);
  return true;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the door is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. */
export async function assertAccrualCorrectionCohortPresent(t) {
  if (await accrualCorrectionLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_CORRECTION === "1") {
    markSkip();
    t.skip("#936 accrual-correction door absent (pre-integration sweep)");
    return true;
  }
  assert.fail(
    "#936: the accrual-correction door is absent. Apply the migration, or set "
    + "CLARA_ALLOW_MISSING_ACCRUAL_CORRECTION=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary #936's own door adds, beside the #652 tokens it inherits.
// ===========================================================================================

export const ACCRUAL_CORRECTION_REASON = {
  alreadyCorrected: "accrual_already_corrected",
};

// ===========================================================================================
// 3 · The verb wrapper. Named arguments only.
// ===========================================================================================

const CORRECT_SPECS = [
  { name: "p_accrual_id", cast: "uuid" }, { name: "p_accrual", cast: "jsonb" },
  { name: "p_op_key", cast: "text" },
];

/** The HUMAN door — `clara_authenticated`, bookkeeper floor inside its own body. */
export async function correctAccrualAdjustment(sub, { accrualId, accrual: a, opKey = null }) {
  const r = await humanQuery(sub, namedCall("correct_accrual_adjustment", CORRECT_SPECS),
    [accrualId, JSON.stringify(a), opKey ?? opk("p936-correct")]);
  return r.rows[0].result;
}

export { assert };
