// Pre-integration gate for #846's capability-registry version high-water mark (migration
// 0244_document_capability_version_high_water.sql). NOT a test file: preload it for an estate
// sweep run against a chain that predates this PR's migration, so the sweep greens with a LOUD
// skip instead of hard-failing every cell against a database where
// clara.document_capability_version_high_water does not exist.
//
// Mirrors document-capability-preintegration-gate.mjs (0191's own gate) exactly, and sits beside
// it in packages/db/package.json's test chain: the two migrations are the same subject at two
// frontiers, so a leg pinned below either one must skip rather than fail.
//
// A FOCUSED invocation (node --test tests/document-capability-high-water.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the cohort FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips —
// a skip is not evidence, which is the whole reason this file exists rather than a silent
// `if (!live) return` inside the battery.
process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY_HIGH_WATER = "1";
