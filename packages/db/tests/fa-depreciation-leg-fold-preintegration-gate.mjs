// Pre-integration gate for #973's fold of the duplicated depreciation leg-pairing aggregation
// into `clara._fa_depreciation_leg_pairing` (migration 0248). NOT a test file: preload it for an
// estate sweep run against a chain that predates this PR's migration, so the sweep greens with a
// LOUD skip instead of hard-failing every cell against a database where `preview_depreciation_run`
// and `clara._fa_run_period_core` still each carry their own copy of the aggregation.
//
// Mirrors fa-birth-watermark-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (`node --test tests/fa-depreciation-leg-fold.test.mjs`) does not preload
// this file, so the variable stays unset and a chain missing the fold FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_DEPRECIATION_LEG_FOLD = "1";
