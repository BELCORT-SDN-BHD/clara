// Pre-integration gate for #857's document_regions field_path CHECK (migration 0290). NOT a
// test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell against a
// database where clara._field_path_conforms does not exist.
//
// Mirrors work-source-correction-supersede-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/document-regions-field-path-check.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the cohort FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_DOCUMENT_REGIONS_FIELD_PATH_CHECK = "1";
