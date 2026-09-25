// Pre-integration gate for #1067's empty-allocation refusal (migration
// 0339_staff_expense_claim_empty_allocation.sql). NOT a test file: preload it for an estate sweep
// run against a chain that predates this PR's migration, so the sweep greens with a LOUD skip
// instead of hard-failing the cells that need a door which names an empty `advance_allocations`
// array by its own reason.
//
// Mirrors schedule-term-correction-preintegration-gate.mjs exactly, and it sets an environment
// variable rather than exporting a flag on purpose: node --test runs each test file in a child
// process, and children inherit the parent's process.env at spawn time, so this assignment reaches
// them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/staff-expense-claim-allocations.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_SEC_EMPTY_ALLOCATION = "1";
