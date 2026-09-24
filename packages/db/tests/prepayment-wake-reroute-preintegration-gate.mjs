// Pre-integration gate for #1036's reroute of the agent-lane prepayment wake door onto
// `clara._prepayment_schedule_core`'s new 'wake' lane (migration
// 0315_prepayment_wake_reroute.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/prepayment-wake-reroute-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0315 greens with a LOUD skip
// instead of hard-failing. Mirrors prepayment-schedule-obo-preintegration-gate.mjs's own idiom
// exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-wake-reroute.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE = "1";
