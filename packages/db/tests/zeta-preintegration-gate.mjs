// Pre-integration gate for the Wave E ZETA suite. NOT a test file: it is preloaded by the package
// test script so the package-wide sweep, which may run against a database that predates the zeta
// migrations, greens with LOUD skips instead of hard-failing.
//
// This is the delta and epsilon gates' shape verbatim (tests/delta-preintegration-gate.mjs,
// tests/epsilon-preintegration-gate.mjs), for the same reason and with the same honesty boundary.
// It sets an environment variable rather than exporting a flag because `node --test` runs each
// test file in a child process, and children inherit `process.env` at spawn time — so the
// assignment reaches them whether or not the runner forwards `--import` itself.
//
// A FOCUSED invocation (`node --test tests/zeta-render-queue.test.mjs`) does not preload this
// file, so the variable stays unset and a pre-zeta database fails LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, and accounts for ZERO skips.
//
// WIRING: packages/db/package.json's `test` script preloads this module alongside the delta,
// rs-guard, theta and epsilon gates. It was written before that line existed and said the wiring
// was somebody else's merge-time item; leaving an unwired gate in the tree is exactly the shape
// that reads as protection and provides none, so the import was added with it.
process.env.CLARA_ALLOW_MISSING_WAVE_E_ZETA = "1";
