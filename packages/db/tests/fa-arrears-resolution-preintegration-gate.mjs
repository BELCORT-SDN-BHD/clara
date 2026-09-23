// Pre-integration gate for #975's closed-year arrears question (migration 0279). NOT a test
// file: preload it for an estate sweep run against a chain that predates this PR's migration, so
// the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara._fa_run_period_core still folds a closed year's months forward without asking.
//
// Mirrors fa-depreciation-policy-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/fa-arrears-resolution.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the law FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_CLOSED_YEAR_ARREARS = "1";
