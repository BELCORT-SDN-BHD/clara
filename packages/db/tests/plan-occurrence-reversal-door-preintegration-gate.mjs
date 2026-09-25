// Pre-integration gate for #1073 (the THIRD accrual/bill-conflict remedy:
// clara.reverse_plan_occurrence, one human act that admits exactly the flagged period's own
// reversal occurrence without walking a catch-up window). NOT a test file: preloaded by hand
// (node --test --import ./tests/plan-occurrence-reversal-door-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating
// 0333_plan_occurrence_reversal_door.sql greens with a LOUD skip instead of hard-failing. Mirrors
// plan-reversal-posted-basis-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/plan-occurrence-reversal-door.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing 0333 FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_PLAN_OCCURRENCE_REVERSAL_DOOR = "1";
