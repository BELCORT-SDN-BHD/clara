// Pre-integration gate for #1075 (the accrual register's side filter moving server-side:
// clara.list_accrual_adjustments's fourth parameter, p_side, migration 0334). NOT a test file:
// preload it for a package-wide sweep run against a chain that predates this PR's migration, so
// the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.list_accrual_adjustments still takes three arguments.
//
// Mirrors accrual-revenue-side-preintegration-gate.mjs and
// plan-occurrence-reversal-door-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/accrual-list-side-filter.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_LIST_SIDE_FILTER = "1";
