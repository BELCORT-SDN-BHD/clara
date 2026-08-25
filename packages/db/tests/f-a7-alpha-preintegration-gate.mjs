// Pre-integration gate for F-A7 train alpha. NOT a test file: it is preloaded by the package
// test script (node --test --import ./tests/f-a7-alpha-preintegration-gate.mjs tests/) so the
// package-wide sweep, which may run against a database that predates the alpha1/alpha2
// migrations, greens with a LOUD skip instead of hard-failing.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/f-a7-alpha.test.mjs) does not preload this file, so the
// variable stays unset and a pre-alpha database fails loudly. Final acceptance is exactly that
// focused shape with the variable UNSET, and accounts for zero skips.
//
// MERGE NOTE: packages/db/package.json's test script needs this file folded into the combined
// --import chain alongside the other wave gates. The team lead/conductor owns that edit at merge
// prep; this lane does not touch package.json.
process.env.CLARA_ALLOW_MISSING_F_A7_ALPHA = "1";
