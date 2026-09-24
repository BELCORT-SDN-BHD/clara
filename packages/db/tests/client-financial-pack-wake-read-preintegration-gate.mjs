// Pre-integration gate for #1000's model-lane entrance to the client home's money band
// (migration 0320_client_financial_pack_wake_read.sql). NOT a test file: preloaded by the
// package-wide sweep (`node --test --import ./tests/client-financial-pack-wake-read-preintegration-gate.mjs …`)
// so a run against a database predating 0320 greens with a LOUD skip instead of hard-failing.
// Mirrors schedule-term-correction-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/client-financial-pack-wake-read.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY —
// a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK_WAKE_READ = "1";
