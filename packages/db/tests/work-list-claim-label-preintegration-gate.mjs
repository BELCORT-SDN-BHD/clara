// Pre-integration gate for #880's claim-label projection (migration 0266). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.list_accounting_work / clara.get_accounting_work_row do not yet project `claim_id` and
// `claimant_label`.
//
// Mirrors work-question-admitted-basis-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/work-list.test.mjs) does not preload this file, so the
// variable stays unset and a chain missing the widen FAILS LOUDLY. Final acceptance is exactly
// that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_WORK_LIST_CLAIM_LABEL = "1";
