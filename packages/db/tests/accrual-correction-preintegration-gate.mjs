// Pre-integration gate for #936's dedicated accrual-correction door (migration 0284).
// NOT a test file: preload it for a package-wide sweep run against a chain that predates this
// PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every #936 cell
// against a database where `clara.correct_accrual_adjustment` does not yet exist.
//
// Mirrors accrual-adjustments-preintegration-gate.mjs (0222's own), with the SAME discriminator
// the wave-2 firm-document-limits-writer lane established for a door added to an EXISTING table's
// lane: readiness is detected off `clara.schema_migrations` (a row matching the STABLE STEM
// `accrual_correction$`), never off a migration NUMBER -- numbers are claimed at merge.
//
// A FOCUSED invocation (node --test tests/accrual-correction.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_CORRECTION = "1";
