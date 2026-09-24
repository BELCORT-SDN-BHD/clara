// Pre-integration gate for #939 AC4 / #941 AC3's term-correction doors (migration
// 0317_schedule_term_correction.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/schedule-term-correction-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0317 greens with a LOUD skip
// instead of hard-failing. Mirrors prepayment-wake-reroute-preintegration-gate.mjs's own idiom
// exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/prepayment-stated-term.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_SCHEDULE_TERM_CORRECTION = "1";
