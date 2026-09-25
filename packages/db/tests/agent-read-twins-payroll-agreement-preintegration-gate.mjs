// Pre-integration gate for #1136's agent-granted read twins over the payroll and agreement reads
// (migration 0352_agent_read_twins_payroll_agreement.sql). NOT a test file: preloaded by the
// package-wide sweep (`node --test --import ./tests/agent-read-twins-payroll-agreement-preintegration-gate.mjs …`)
// so a run against a database predating 0352 greens with a LOUD skip instead of hard-failing.
// Mirrors client-financial-pack-wake-read-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/agent-read-twins-payroll-agreement.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY —
// a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_AGENT_READ_TWINS_PAYROLL_AGREEMENT = "1";
