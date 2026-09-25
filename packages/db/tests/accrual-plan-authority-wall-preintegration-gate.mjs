// Pre-integration gate for #1080 (the accrual lane joins #1051's ONE plan authority wall:
// clara._accrual_plan_core calls clara._assert_plan_authority instead of 0222's own block and its
// inline `exists` probes). NOT a test file: preloaded by hand (node --test --import
// ./tests/accrual-plan-authority-wall-preintegration-gate.mjs tests/) so a package-wide sweep
// that may run against a database predating 0331_accrual_plan_authority_wall.sql greens with a
// LOUD skip instead of hard-failing. Mirrors plan-authority-wall-preintegration-gate.mjs's own
// idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/accrual-plan-authority-wall.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing 0331 FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_PLAN_AUTHORITY_WALL = "1";
