// Pre-integration gate for #1148 (migration 0363_payroll_posting_state_read.sql).
// NOT a test file: preloaded by hand
// (node --test --import ./tests/payroll-posting-state-read-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0363 greens with a LOUD skip
// instead of hard-failing on the document-scoped read cells. Mirrors
// standing-instruction-agent-read-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/payroll-posting-state-read.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PAYROLL_POSTING_STATE_READ = "1";
