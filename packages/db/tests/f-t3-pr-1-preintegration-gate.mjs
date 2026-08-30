// Pre-integration gate for the F-T3 PR-1 tax-platform battery. NOT a test file: it is
// preloaded by the package test script (node --test --import ./tests/f-t3-pr-1-
// preintegration-gate.mjs tests/) so the package-wide sweep, which may run against a database
// that predates this migration, greens with a LOUD skip instead of a silent one-armed skip
// with no CI net (statutory-deadlines-preintegration-gate.mjs's own idiom).
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs
// each test file in a child process, and children inherit the parent's process.env at spawn
// time, so this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/f-t3-pr-1.test.mjs tests/f-t3-pr-1-walls.test.mjs)
// does not preload this file, so the variable stays unset and a pre-migration database fails
// loudly. Final acceptance is exactly that focused shape with the variable UNSET, and accounts
// for zero skips.
process.env.CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM = "1";
