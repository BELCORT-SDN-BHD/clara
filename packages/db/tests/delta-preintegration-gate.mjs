// Pre-integration gate for the Wave E delta suites. NOT a test file: it is preloaded by the
// package test script (`node --test --import ./tests/delta-preintegration-gate.mjs tests/`) so the
// package-wide sweep, which may run against a database that predates the delta migrations, greens
// with LOUD skips instead of hard-failing.
//
// It sets an environment variable rather than exporting a flag on purpose: `node --test` runs each
// test file in a child process, and children inherit the parent's `process.env` at spawn time, so
// this assignment reaches them whether or not the runner forwards `--import` itself.
//
// A FOCUSED invocation (`node --test tests/delta-contract.test.mjs`) does not preload this file, so
// the variable stays unset and a pre-delta database fails loudly. Final acceptance is exactly that
// focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_WAVE_E_DELTA = "1";
