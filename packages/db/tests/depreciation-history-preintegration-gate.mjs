// Pre-integration gate for #651's depreciation-history lane (migration 0227). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara._fa_assert_period_open, clara.preview_depreciation_run and
// clara.run_depreciation_period_for do not exist.
//
// Mirrors preview-invite-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/depreciation-history.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_DEPRECIATION_HISTORY = "1";
