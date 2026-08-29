// Pre-integration gate for 裁-21 PR-a (the COA template half). NOT a test file: preload it
// explicitly for an estate sweep run against a chain that predates this PR's migration
// (UNNUMBERED as of this authoring session -- packages/db/README.md, "Migration numbers are
// claimed at MERGE time"), so the sweep greens with a LOUD skip instead of hard-failing.
//
// Mirrors f-a7b-pr-a-preintegration-gate.mjs's idiom exactly, including the wiring decision:
// this file is deliberately NOT in packages/db/package.json's --import chain, because CI always
// applies HEAD's migrations before the sweep and therefore always runs against a chain that
// carries PR-a. The allow-missing arm exists only for a hand-run against a pre-PR-a database:
//   node --test --import ./tests/coa-template-pr-a-preintegration-gate.mjs tests/
//
// A FOCUSED invocation (node --test tests/coa-template-pr-a.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the four relations FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_COA_TEMPLATE_PR_A = "1";
