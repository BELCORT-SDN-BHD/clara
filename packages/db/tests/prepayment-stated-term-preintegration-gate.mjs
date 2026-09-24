// Pre-integration gate for #939's person-stated prepayment term (migration
// 0305_prepayment_stated_term.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/prepayment-stated-term-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0305 greens with a LOUD skip
// instead of hard-failing. Mirrors prepayment-term-liveness-preintegration-gate.mjs's own idiom
// exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-stated-term.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PREPAYMENT_STATED_TERM = "1";
