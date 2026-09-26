// Pre-integration gate for #1150 (migration 0364_plan_reservation_namespace_obo_fold.sql).
// NOT a test file: preloaded by hand
// (node --test --import ./tests/plan-reservation-namespace-preintegration-gate.mjs tests/) so a
// package-wide sweep that may run against a database predating 0364 greens with a LOUD skip
// instead of hard-failing on the nested-reservation cells. Mirrors
// revenue-recognition-plan-op-key-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/plan-reservation-namespace.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_PLAN_RESERVATION_NAMESPACE = "1";
