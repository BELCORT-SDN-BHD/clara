// Pre-integration gate for #1050's firm-level standing instruction (migration
// 0338_prepayment_close_standing_instruction.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/prepayment-close-standing-instruction-preintegration-gate.mjs tests/)
// so a package-wide sweep that may run against a database predating 0338 greens with a LOUD skip
// instead of hard-failing on the standing-instruction cells. Mirrors
// prepayment-account-reservation-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-close-standing-instruction.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PREPAYMENT_CLOSE_STANDING_INSTRUCTION = "1";
