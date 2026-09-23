// Pre-integration gate for #947's payroll NET-PAY SETTLEMENT lane (migration 0298). NOT a test
// file: preload it for a package-wide sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell against a
// database where clara.get_payroll_settlement_candidates / clara.settle_payroll_net_pay do not
// yet exist and clara.list_review_queue does not yet project
// row_kind='payroll_net_pay_unsettled'.
//
// Mirrors payroll-summary-posting-preintegration-gate.mjs (#946, migration 0297) exactly.
//
// A FOCUSED invocation (node --test tests/payroll-settlement.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_PAYROLL_SETTLEMENT = "1";
