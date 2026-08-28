// Pre-integration gate for 裁-22 (agent proposal bases become DB-resolved citations).
// NOT a test file: preloaded by hand (node --test --import ./tests/proposal-basis-
// preintegration-gate.mjs tests/) so a sweep that may run against a database predating this
// migration (UNNUMBERED as of this authoring session -- packages/db/README.md "Migration
// numbers are claimed at MERGE time") greens with a LOUD skip instead of hard-failing. Mirrors
// f-a7b-pr-a-preintegration-gate.mjs's own idiom exactly (rev-pb NEW-3, 2026-08-29).
//
// It sets an environment variable rather than exporting a flag on purpose: node --test runs each
// test file in a child process, and children inherit the parent's process.env at spawn time, so
// this assignment reaches them whether or not the runner forwards --import itself.
//
// A FOCUSED invocation (node --test tests/proposal-basis-resolved.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing clara._resolve_proposal_basis /
// the two 裁-22 door signatures FAILS LOUDLY. Final acceptance is exactly that focused shape
// with the variable UNSET, and accounts for zero skips.
//
// MERGE NOTE: this gate is NOT wired into packages/db/package.json's --import chain --
// deliberately, matching every F-A7 sibling (f-a7-alpha/-beta/-a7b-pr-a-preintegration-
// gate.mjs), none of which is wired either. The package-wide sweep always runs against a chain
// that carries this migration (CI applies HEAD's migrations first), so the allow-missing arm is
// only ever needed by a hand-run against a pre-0143 database -- preload it explicitly then:
//   node --test --import ./tests/proposal-basis-preintegration-gate.mjs tests/
process.env.CLARA_ALLOW_MISSING_PROPOSAL_BASIS = "1";
