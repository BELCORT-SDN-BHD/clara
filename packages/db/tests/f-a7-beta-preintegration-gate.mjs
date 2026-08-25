// Pre-integration gate for F-A7 PR-4 (train beta) + its train-pi dependency. NOT a test file: it
// is preloaded by the package test script (node --test --import ./tests/f-a7-beta-preintegration-
// gate.mjs tests/) so the package-wide sweep, which may run against a database that predates this
// train's migration or train pi's (both UNNUMBERED as of this authoring session -- packages/db/
// README.md "Migration numbers are claimed at MERGE time"), greens with LOUD skips instead of
// hard-failing.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/f-a7-beta-filing-verb.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing wake_file_document or train pi's
// _firm_question_core FAILS LOUDLY (review finding 6a: a first draft of the test file's own
// before() hook silently t.skip()'d all 33 cells to a green exit regardless of whether this was a
// focused run or an estate sweep -- fixed to check this variable and throw when unset). Final
// acceptance is exactly that focused shape with the variable UNSET, and accounts for zero skips.
//
// MERGE NOTE: packages/db/package.json's test script needs this gate added to its --import chain
// alongside the existing delta/epsilon/eta/rs-guard/theta/zeta gates. The team lead owns that edit
// at merge prep; this lane does not touch package.json.
process.env.CLARA_ALLOW_MISSING_F_A7_BETA = "1";
