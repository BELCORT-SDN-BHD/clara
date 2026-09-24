// Pre-integration gate for #941's deferred-revenue recognition lane (migration
// 0308_deferred_revenue_recognition.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/deferred-revenue-preintegration-gate.mjs tests/) so a package-wide
// sweep that may run against a database predating 0308 greens with a LOUD skip instead of
// hard-failing. Mirrors prepayment-schedule-obo-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/revenue-recognition.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_DEFERRED_REVENUE = "1";
