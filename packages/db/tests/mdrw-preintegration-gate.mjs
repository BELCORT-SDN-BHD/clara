// Pre-integration gate for the member-door rank walls (#455 review's BLOCKER + M1 + M2, ruled
// 裁-94). NOT a test file: preload it for an estate sweep run against a chain that predates this
// PR's migration (UNNUMBERED as of this authoring session -- packages/db/README.md, "Migration
// numbers are claimed at MERGE time"), so the sweep greens with a LOUD skip instead of hard-
// failing the 6 MUST-RED cells against the pre-fix live bodies.
//
// Mirrors coa-template-pr-b-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/mdrw-rank-walls.test.mjs) does not preload this file,
// so the variable stays unset and a chain missing the walls FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_MDRW = "1";
