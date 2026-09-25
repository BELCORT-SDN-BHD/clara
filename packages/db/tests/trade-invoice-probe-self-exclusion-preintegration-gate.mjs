// Pre-integration gate for #1135's probe self-exclusion (migration
// 0323_trade_invoice_probe_self_exclusion.sql). NOT a test file: preloaded by the package-wide
// sweep (`node --test --import ./tests/trade-invoice-probe-self-exclusion-preintegration-gate.mjs …`)
// so a run against a database predating 0323 greens with a LOUD skip instead of hard-failing.
// Mirrors work-source-correction-rederivation-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/trade-invoice-probe-self-exclusion.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY —
// a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_TRADE_INVOICE_PROBE_SELF_EXCLUSION = "1";
