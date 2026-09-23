// Pre-integration gate for #919's prepayment term-liveness flag (migration
// 0285_prepayment_term_liveness.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/prepayment-term-liveness-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0285 greens with a LOUD skip
// instead of hard-failing. Mirrors accrual-correction-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-term-liveness.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PREPAYMENT_TERM_LIVENESS = "1";
