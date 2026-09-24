// Pre-integration gate for #946's payroll-summary POSTING lane (migration 0297). NOT a test
// file: preload it for a package-wide sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell against a
// database where clara._payroll_entry_plan / clara._payroll_posting_verdict do not yet exist and
// clara.list_review_queue does not yet project row_kind='payroll_posting_blocked'.
//
// Mirrors payroll-summary-facts-preintegration-gate.mjs (#945, migration 0296) exactly.
//
// A FOCUSED invocation (node --test tests/payroll-summary-posting.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_PAYROLL_SUMMARY_POSTING = "1";
