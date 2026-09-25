// Pre-integration gate for #1051 (ONE authority-wall predicate for clara.create_accounting_plan
// and clara._obo_plan_core). NOT a test file: preloaded by hand (node --test --import
// ./tests/plan-authority-wall-preintegration-gate.mjs tests/) so a package-wide sweep that may
// run against a database predating 0330_plan_authority_wall_predicate.sql greens with a LOUD skip
// instead of hard-failing. Mirrors create-client-grant-withdrawn-preintegration-gate.mjs's own
// idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/plan-authority-wall.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0330 FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_PLAN_AUTHORITY_WALL = "1";
