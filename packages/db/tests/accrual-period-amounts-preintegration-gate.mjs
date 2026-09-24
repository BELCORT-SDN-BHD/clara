// Pre-integration gate for #937's per-period accrual amounts lane (migration 0303). NOT a test
// file: preload it for a package-wide sweep run against a chain that predates this PR's migration,
// so the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.accrual_period_amounts does not exist and clara._accrual_methods() still holds one rule.
//
// Mirrors accrual-bill-conflict-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/accrual-period-amounts.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_PERIOD_AMOUNTS = "1";
