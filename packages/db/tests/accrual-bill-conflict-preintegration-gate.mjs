// Pre-integration gate for #938's accrual-bill-conflict lane (migration 0302). NOT a test file:
// preload it for a package-wide sweep run against a chain that predates this PR's migration, so
// the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.list_review_queue does not yet project row_kind='accrual_bill_conflict' and
// clara.skip_plan_occurrence does not yet exist.
//
// Mirrors depreciation-authority-pending-rowkind-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/accrual-bill-conflict.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_BILL_CONFLICT = "1";
