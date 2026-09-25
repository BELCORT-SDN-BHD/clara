// Pre-integration gate for #1030's re-derivation lane and its cosmetic-edit rule
// (migration 0321_work_source_correction_rederivation.sql). NOT a test file: preloaded by the
// package-wide sweep (`node --test --import ./tests/work-source-correction-rederivation-preintegration-gate.mjs …`)
// so a run against a database predating 0321 greens with a LOUD skip instead of hard-failing.
// Mirrors client-financial-pack-wake-read-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/work-source-correction-rederivation.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY —
// a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_WORK_SOURCE_REDERIVATION = "1";
