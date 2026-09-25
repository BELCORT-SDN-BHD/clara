// Pre-integration gate for #1152 (the accrual register reads a page at a time:
// clara.list_accrual_adjustments's fifth and sixth parameters, p_cursor/p_limit, migration
// 0365). NOT a test file: preload it for a package-wide sweep run against a chain that predates
// this PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every cell
// against a database where clara.list_accrual_adjustments still takes four arguments.
//
// Mirrors accrual-list-side-filter-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/accrual-register-pagination.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_REGISTER_PAGINATION = "1";
