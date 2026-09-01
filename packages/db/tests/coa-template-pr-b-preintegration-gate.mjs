// Pre-integration gate for 裁-21 PR-b (the COA APPLY half). NOT a test file: preload it for an
// estate sweep run against a chain that predates this PR's migration (UNNUMBERED as of this
// authoring session -- packages/db/README.md, "Migration numbers are claimed at MERGE time"), so
// the sweep greens with a LOUD skip instead of hard-failing.
//
// Mirrors coa-template-pr-a-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/coa-template-pr-b.test.mjs) does not preload this file,
// so the variable stays unset and a chain missing the apply doors FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_COA_TEMPLATE_PR_B = "1";
