// Pre-integration gate for #960's firm-owned processing-cap writer (migration 0270).
// NOT a test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every #960 cell
// against a database where `clara.set_firm_document_limits` does not yet exist.
//
// Mirrors firm-document-limits-preintegration-gate.mjs (0196's, the same relation's other
// battery) with one difference this file's own test-side gate accounts for: readiness is
// detected off `clara.schema_migrations` (a row matching the stem `firm_document_limits_writer$`),
// never off a migration NUMBER — numbers are claimed at merge.
//
// A FOCUSED invocation (node --test tests/firm-document-limits-writer.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS_WRITER = "1";
