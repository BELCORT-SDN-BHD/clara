// Pre-integration gate for F-A7b PR-a (the additive opener of the client-onboarding train).
// NOT a test file: preloaded by the package test script (node --test --import ./tests/f-a7b-
// pr-a-preintegration-gate.mjs tests/) so the package-wide sweep, which may run against a
// database that predates this PR's migration (UNNUMBERED as of this authoring session --
// packages/db/README.md "Migration numbers are claimed at MERGE time"), greens with LOUD
// skips instead of hard-failing. Mirrors f-a7-beta-preintegration-gate.mjs's own idiom exactly.
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/f-a7b-pr-a.test.mjs) does not preload this file, so
// the variable stays unset and a chain missing wake_propose_client_onboarding FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, and accounts for zero
// skips.
//
// MERGE NOTE (trued at merge prep, 2026-08-29): this gate is NOT wired into packages/db/
// package.json's --import chain — deliberately, matching its two F-A7 siblings
// (f-a7-alpha-preintegration-gate.mjs, f-a7-beta-preintegration-gate.mjs), neither of which is
// wired either. The package-wide sweep always runs against a chain that carries this
// migration (CI applies HEAD's migrations first), so the allow-missing arm is only ever needed
// by a hand-run against a pre-0142 database — preload it explicitly in that case:
//   node --test --import ./tests/f-a7b-pr-a-preintegration-gate.mjs tests/
process.env.CLARA_ALLOW_MISSING_F_A7B_PR_A = "1";
