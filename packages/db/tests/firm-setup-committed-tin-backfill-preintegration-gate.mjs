// Pre-integration gate for #1098 (the TIN firm-setup item is backfilled onto every ALREADY
// COMMITTED firm-setup plan). NOT a test file: preloaded by hand (node --test --import
// ./tests/firm-setup-committed-tin-backfill-preintegration-gate.mjs tests/) so a package-wide
// sweep that may run against a database predating
// 0347_firm_setup_committed_tin_backfill.sql greens with a LOUD skip instead of hard-failing.
// Mirrors firm-setup-tin-required-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/firm-setup-committed-tin-backfill.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing 0347 FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_COMMITTED_TIN_BACKFILL = "1";
