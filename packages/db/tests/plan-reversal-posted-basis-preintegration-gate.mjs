// Pre-integration gate for #1074 (a reversal reverses what its own occurrence POSTED:
// clara._plan_admit_occurrence hands clara._plan_occurrence_basis the lines of the entry
// clara._plan_primary_entry resolved, instead of the plan's live revision's basis). NOT a test
// file: preloaded by hand (node --test --import
// ./tests/plan-reversal-posted-basis-preintegration-gate.mjs tests/) so a package-wide sweep that
// may run against a database predating 0332_plan_reversal_posted_basis.sql greens with a LOUD skip
// instead of hard-failing. Mirrors accrual-plan-authority-wall-preintegration-gate.mjs's own idiom
// exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/plan-reversal-posted-basis.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing 0332 FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_PLAN_REVERSAL_POSTED_BASIS = "1";
