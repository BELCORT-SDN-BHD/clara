// Pre-integration gate for the RS name-only guard battery (finding B7). NOT a test file: it is
// preloaded by the package test script
// (`node --test --import ./tests/rs-guard-preintegration-gate.mjs tests/`) so the package-wide
// sweep, which may run against a database that predates the guard migrations, greens with LOUD
// skips instead of hard-failing.
//
// It sets an environment variable rather than exporting a flag on purpose: `node --test` runs each
// test file in a child process, and children inherit the parent's `process.env` at spawn time, so
// this assignment reaches them whether or not the runner forwards `--import` itself. (The Wave E
// delta lane's tests/delta-preintegration-gate.mjs is the idiom this mirrors, verbatim in shape.)
//
// A FOCUSED invocation (`node --test tests/name-only-guard.test.mjs`) does not preload this file,
// so the variable stays unset and a database missing the guard FAILS instead of skipping. That is
// the whole point of the finding: before this gate existed the battery skipped unconditionally
// when the objects were absent, so a migration that was never applied -- or was misnumbered, or
// silently reverted -- read as green. Final acceptance is the focused shape with the variable
// UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_RS_GUARD = "1";
