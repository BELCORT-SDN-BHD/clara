// Pre-integration gate for #986's opening-source re-read remedy (migration 0286).
// NOT a test file: preload it for a package-wide sweep run against a chain that predates this
// PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every #986 cell
// against a database where `clara.refresh_opening_targets_from_reread` does not yet exist.
//
// Mirrors opening-ledger-source-preintegration-gate.mjs (0228's own), with the discriminator the
// wave-2 lanes established: readiness is detected off the CATALOG (the door and its receipt
// relation), never off a migration NUMBER — numbers are claimed at merge, and 0286 is a reserved
// number that may move.
//
// A FOCUSED invocation (node --test tests/opening-source-reread.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
process.env.CLARA_ALLOW_MISSING_OPENING_SOURCE_REREAD = "1";
