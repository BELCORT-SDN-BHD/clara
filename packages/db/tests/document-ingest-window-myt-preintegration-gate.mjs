// Pre-integration gate for #964's document-ingest MYT window recut (migration
// 0252_document_ingest_window_myt.sql). NOT a test file: preload it for an estate sweep run
// against a chain that predates this PR's migration, so the sweep greens with a LOUD skip instead
// of hard-failing every cell against a database where the three reservation helpers still read a
// UTC calendar day.
//
// Mirrors legal-enforcement-mode-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/document-ingest-window-myt.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the recut FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_DOCUMENT_INGEST_WINDOW_MYT = "1";
