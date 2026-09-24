// Pre-integration gate for #915's `clara_runtime` twin of the prepayment-schedule door and its
// machine-lane term read (migration 0307_prepayment_schedule_obo_twin.sql). NOT a test file:
// preloaded by hand (node --test --import ./tests/prepayment-schedule-obo-preintegration-gate.mjs
// tests/) so a package-wide sweep that may run against a database predating 0307 greens with a LOUD
// skip instead of hard-failing. Mirrors prepayment-account-roster-preintegration-gate.mjs's own
// idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-schedule-obo.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PREPAYMENT_SCHEDULE_OBO = "1";
