// Pre-integration gate for #1078's prepayment-account reservation (migration
// 0337_prepayment_account_reservation.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/prepayment-account-reservation-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0337 greens with a LOUD skip instead
// of hard-failing on the reservation cells. Mirrors
// revenue-recognition-plan-op-key-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-account-reservation.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_RESERVATION = "1";
