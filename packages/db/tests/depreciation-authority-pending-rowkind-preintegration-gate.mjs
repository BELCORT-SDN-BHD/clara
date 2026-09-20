// Pre-integration gate for #974's depreciation-authority-pending-rowkind lane (migration
// 0260). NOT a test file: preload it for a package-wide sweep run against a chain that
// predates this PR's migration, so the sweep greens with a LOUD skip instead of hard-failing
// every cell against a database where clara.list_review_queue does not yet project
// row_kind='depreciation_authority_pending'.
//
// Mirrors depreciation-history-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/depreciation-authority-pending-rowkind.test.mjs)
// does not preload this file, so the variable stays unset and a chain missing the lane FAILS
// LOUDLY. Final acceptance is exactly that focused shape with the variable UNSET, counting
// ZERO skips.
process.env.CLARA_ALLOW_MISSING_DEPRECIATION_AUTHORITY_QUEUE_ROW = "1";
