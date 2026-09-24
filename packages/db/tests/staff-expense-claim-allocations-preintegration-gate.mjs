// Pre-integration gate for #931's multi-advance allocation list (migration
// 0301_staff_expense_claim_allocations). NOT a test file: preload it for an estate sweep run
// against a chain that predates this PR's migration, so the sweep greens with a LOUD skip instead
// of hard-failing every cell against a database where a staff expense claim can still only name
// ONE advance.
//
// Mirrors staff-expense-claim-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/staff-expense-claim-allocations.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the law FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_SEC_ALLOCATIONS = "1";
