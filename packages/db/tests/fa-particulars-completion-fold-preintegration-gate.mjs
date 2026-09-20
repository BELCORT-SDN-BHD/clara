// Pre-integration gate for #976's fold of the duplicated fixed-asset particulars completion
// wall into `clara._fa_assert_particulars_completable` (migration 0249). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// `complete_fixed_asset_particulars` and `_fa_complete_particulars_core` still each carry their
// own copy of the wall.
//
// Mirrors fa-depreciation-leg-fold-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (`node --test tests/fa-particulars-completion-fold.test.mjs`) does not
// preload this file, so the variable stays unset and a chain missing the fold FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_PARTICULARS_COMPLETION_FOLD = "1";
