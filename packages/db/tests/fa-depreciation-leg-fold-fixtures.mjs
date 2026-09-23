// #973 [0248, fold `preview_depreciation_run`'s duplicated leg aggregation into
// `clara._fa_run_period_core`] — the battery's frontier gate. NOT a test file: the name does not
// end in `.test.mjs`, so `node --test` ignores it.
//
// NO SECOND CLIENT FACTORY. #973 changes nothing about what a preview or a run MEANS — only
// where the leg-pairing arithmetic the two of them agree on lives — so it reuses #651's whole
// world (`p651Client`, `faWorld`, `buyAsset`, `completeSL`, `liveAuthorityWithRef`,
// `backdateAuthorityFloor`, `previewRun`, `runManual`, `entryRowOf`, `approveEntry`,
// `entryLinesOf`, `prosrcSha`, `regprocedureExists`, `roleHasExecute`, `functionDef`, `rootQuery`,
// `mon`, `dayIn`, `opk`, `COST2`/`ACCUM2`/`EXPENSE2`) via `export *` rather than forking a second
// copy of the same depreciation world. Its own clients are still labelled `p973_…` (through
// `p651Client`'s own label argument) so a leftover rig's rows are traceable to this ticket.

import { assert, rootQuery, markSkip } from "./depreciation-history-fixtures.mjs";

export * from "./depreciation-history-fixtures.mjs";

// ===========================================================================================
// The frontier gate — on 0248's STABLE STEM, never its number (a number is claimed at MERGE, a
// stem is not).
// ===========================================================================================

/** `0248_fa_depreciation_leg_fold.sql` → `fa_depreciation_leg_fold$`. */
export const FA_DEPRECIATION_LEG_FOLD_STEM = "fa_depreciation_leg_fold$";

let _ready = null;
export async function faDepreciationLegFoldReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_DEPRECIATION_LEG_FOLD_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#973 migration (${FA_DEPRECIATION_LEG_FOLD_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  `fa-depreciation-leg-fold-preintegration-gate.mjs`) FAILS LOUDLY below 0248 — a skip is not
 *  evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate973(t) {
  if (await faDepreciationLegFoldReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_DEPRECIATION_LEG_FOLD !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-depreciation-leg-fold-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#973 fa-depreciation-leg-fold absent (no ${FA_DEPRECIATION_LEG_FOLD_STEM} migration applied)`);
  return true;
}

/** The exact normalized aggregation fragment #651's own tail (0227 §I, T.13) binds — copied here
 *  rather than re-derived, so a drift in either file is visible as a diff instead of a coincidence.
 *  Lowercased, whitespace-collapsed, comments stripped: the same normalization the migration's own
 *  tail assertions use. */
export const LEG_AGGREGATION_FRAGMENT =
  "from jsonb_array_elements(v_res -> 'charges') x join clara.fixed_assets f on f.id = "
  + "(x ->> 'asset_id')::uuid group by 1, 2 order by 1, 2";

/** The fully-qualified call the fold wires into both recut bodies. */
export const LEG_PAIRING_CALL = "clara._fa_depreciation_leg_pairing(";
