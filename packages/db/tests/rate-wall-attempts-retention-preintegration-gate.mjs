// Pre-integration gate for #1046 (the two pre-session rate-wall evidence tables gain a retention
// sweep). NOT a test file: preloaded by hand (node --test --import
// ./tests/rate-wall-attempts-retention-preintegration-gate.mjs tests/) so a package-wide sweep
// that may run against a database predating 0348_rate_wall_attempts_retention.sql greens with a
// LOUD skip instead of hard-failing. Mirrors firm-setup-committed-tin-backfill-preintegration-
// gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/rate-wall-attempts-retention.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing 0348 FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, and accounts for zero skips.
process.env.CLARA_ALLOW_MISSING_RATE_WALL_ATTEMPTS_RETENTION = "1";
