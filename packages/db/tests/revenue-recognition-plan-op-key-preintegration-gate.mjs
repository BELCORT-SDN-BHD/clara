// Pre-integration gate for #1077's per-lane nested plan key (migration
// 0336_revenue_recognition_plan_op_key.sql). NOT a test file: preloaded by hand
// (node --test --import ./tests/revenue-recognition-plan-op-key-preintegration-gate.mjs tests/) so
// a package-wide sweep that may run against a database predating 0336 greens with a LOUD skip
// instead of hard-failing on the cross-lane cells. Mirrors
// internal-refusal-errcode-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/revenue-recognition-plan-op-key.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_RR_PLAN_OP_KEY = "1";
