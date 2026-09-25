// Pre-integration gate for #1052's case-insensitive claimant-label arm (migration
// 0340_staff_expense_claim_label_case.sql). NOT a test file: preload it for an estate sweep run
// against a chain that predates this PR's migration, so the sweep greens with a LOUD skip instead
// of hard-failing the cells that need a wall comparing `lower(btrim(person_label))` on both sides.
//
// Mirrors staff-expense-claim-empty-allocation-preintegration-gate.mjs exactly, and it sets an
// environment variable rather than exporting a flag on purpose: node --test runs each test file in
// a child process, and children inherit the parent's process.env at spawn time, so this assignment
// reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/staff-expense-claim-allocations.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_SEC_LABEL_CASE = "1";
