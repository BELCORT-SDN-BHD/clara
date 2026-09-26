// Pre-integration gate for #1147 (migration 0362_standing_instruction_agent_read.sql).
// NOT a test file: preloaded by hand
// (node --test --import ./tests/standing-instruction-agent-read-preintegration-gate.mjs tests/) so
// a package-wide sweep that may run against a database predating 0362 greens with a LOUD skip
// instead of hard-failing on the model-lane read cells. Mirrors
// prepayment-close-standing-instruction-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/standing-instruction-agent-read.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_STANDING_INSTRUCTION_AGENT_READ = "1";
