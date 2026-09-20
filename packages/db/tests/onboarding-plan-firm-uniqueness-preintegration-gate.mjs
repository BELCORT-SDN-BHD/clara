// Pre-integration gate for #894 (harden `uq_onboarding_plans_one_open_firm`'s predicate).
// NOT a test file: preloaded by hand (node --test --import
// ./tests/onboarding-plan-firm-uniqueness-preintegration-gate.mjs tests/) so a package-wide sweep
// that may run against a database predating 0255_onboarding_plan_firm_uniqueness.sql greens with
// a LOUD skip instead of hard-failing. Mirrors promotion-dup-open-wall-preintegration-gate.mjs's
// own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/onboarding-plan-firm-uniqueness.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the new index FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, and accounts for zero
// skips.
process.env.CLARA_ALLOW_MISSING_ONBOARDING_PLAN_FIRM_UNIQUENESS = "1";
