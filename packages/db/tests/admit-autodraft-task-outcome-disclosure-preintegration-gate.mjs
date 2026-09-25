// Pre-integration gate for #1132 (clara.sweep_run_items.outcome has no admitted member -- a
// documented trap on clara.admit_autodraft_task, never an enum widening). NOT a test file:
// preloaded by hand (node --test --import
// ./tests/admit-autodraft-task-outcome-disclosure-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating
// 0349_admit_autodraft_task_outcome_disclosure.sql greens with a LOUD skip instead of
// hard-failing. Mirrors rate-wall-attempts-retention-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/admit-autodraft-task-outcome-disclosure.test.mjs) does
// not preload this file, so the variable stays unset and a chain missing 0349 FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_ADMIT_AUTODRAFT_TASK_OUTCOME_DISCLOSURE = "1";
