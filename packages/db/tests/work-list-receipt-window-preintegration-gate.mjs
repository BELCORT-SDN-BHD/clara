// Pre-integration gate for #905's receipt-dated window (migration 0267). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.list_accounting_work carries no `p_receipt_since` / `p_receipt_until` parameters.
//
// Mirrors work-question-admitted-basis-preintegration-gate.mjs exactly. TWO batteries read this
// one flag — tests/work-list.test.mjs and tests/client-work-pack.test.mjs — because ONE migration
// is the frontier both of them gate on.
//
// A FOCUSED invocation (node --test tests/work-list.test.mjs) does not preload this file, so the
// variable stays unset and a chain missing the widen FAILS LOUDLY. Final acceptance is exactly
// that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_WORK_LIST_RECEIPT_WINDOW = "1";
