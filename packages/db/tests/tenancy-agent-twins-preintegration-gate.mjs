// Pre-integration gate for #1137's tenancy agent-granted read twins and on-behalf-of confirmation
// twins (migration 0353_tenancy_agent_twins_obo_confirmations.sql). NOT a test file: preloaded by
// the package-wide sweep (`node --test --import ./tests/tenancy-agent-twins-preintegration-gate.mjs …`)
// so a run against a database predating 0353 greens with a LOUD skip instead of hard-failing.
// Mirrors agent-read-twins-payroll-agreement-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/tenancy-agent-twins.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY — a skip is not
// evidence.
process.env.CLARA_ALLOW_MISSING_TENANCY_AGENT_TWINS = "1";
