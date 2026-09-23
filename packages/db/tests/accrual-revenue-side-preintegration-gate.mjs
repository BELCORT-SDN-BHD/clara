// Pre-integration gate for #942's revenue-side accrual lane (migration 0304). NOT a test file:
// preload it for a package-wide sweep run against a chain that predates this PR's migration, so
// the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.accrual_adjustments carries no `side` column and clara._accrual_sides() does not exist.
//
// Mirrors accrual-period-amounts-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/accrual-revenue-side.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_REVENUE_SIDE = "1";
