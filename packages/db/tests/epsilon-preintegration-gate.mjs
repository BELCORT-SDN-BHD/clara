// Pre-integration gate for the Wave E EPSILON suite. NOT a test file: it is preloaded by the
// package test script so the package-wide sweep, which may run against a database that predates
// the epsilon migrations, greens with LOUD skips instead of hard-failing.
//
// This is the delta gate's shape verbatim (tests/delta-preintegration-gate.mjs), for the same
// reason and with the same honesty boundary. It sets an environment variable rather than
// exporting a flag because `node --test` runs each test file in a child process, and children
// inherit `process.env` at spawn time -- so the assignment reaches them whether or not the runner
// forwards `--import` itself.
//
// A FOCUSED invocation (`node --test tests/epsilon-contract.test.mjs`) does not preload this
// file, so the variable stays unset and a pre-epsilon database fails loudly. Final acceptance is
// exactly that focused shape with the variable UNSET, and accounts for ZERO skips.
//
// WIRING (a merge-time item, not this lane's file to change): the package test script currently
// preloads only the delta gate --
//   "test": "node --test --test-concurrency=1 --import ./tests/delta-preintegration-gate.mjs tests/"
// Until this module is preloaded alongside it, the package-wide sweep hard-fails on
// epsilon-contract.test.mjs against any database without the epsilon migrations. Either add a
// second `--import ./tests/epsilon-preintegration-gate.mjs`, or set the variable in the delta
// gate. This file exists so that wiring is a one-token change by whoever owns package.json.
process.env.CLARA_ALLOW_MISSING_WAVE_E_EPSILON = "1";
