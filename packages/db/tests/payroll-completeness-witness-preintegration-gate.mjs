// Pre-integration gate for #1048's payroll COMPLETENESS WITNESS lane (migration 0343). NOT a test
// file: preload it for a package-wide sweep run against a chain that predates this PR's migration,
// so the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.evaluate_payroll_run_state_v2 / clara.answer_payroll_completeness /
// clara.payroll_completeness_answers do not yet exist and clara.list_review_queue does not yet
// project row_kind='payroll_completeness_question'.
//
// Mirrors payroll-summary-posting-preintegration-gate.mjs (#946, migration 0297) exactly, which
// itself mirrors payroll-summary-facts-preintegration-gate.mjs (#945, migration 0296).
//
// A FOCUSED invocation (node --test tests/payroll-completeness-witness.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_PAYROLL_COMPLETENESS_WITNESS = "1";
