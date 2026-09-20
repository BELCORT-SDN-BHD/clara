// Pre-integration gate for #965's at-creation ceiling-refusal record (migration
// 0254_intake_refusal_record.sql). NOT a test file: preload it for an estate sweep run against a
// chain that predates this PR's migration, so the sweep greens with a LOUD skip instead of
// hard-failing every cell against a database where `clara.create_document_intake` still RAISES
// CLR18 and takes its own intake row down with the rolled-back transaction.
//
// Mirrors document-ingest-window-myt-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/intake-refusal-record.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the recut FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_INTAKE_REFUSAL_RECORD = "1";
