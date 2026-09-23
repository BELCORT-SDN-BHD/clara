// Pre-integration gate for #1002's second-pass membership editor read (migration 0276).
// NOT a test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every #1002 cell
// against a database where `clara.get_client_cash_account_set_members` does not yet exist.
//
// Mirrors firm-document-limits-writer-preintegration-gate.mjs (0270's) and
// retire-create-account-set-preintegration-gate.mjs (0271's): readiness is detected off
// `clara.schema_migrations` (a row matching the stem `cash_account_set_membership_read$`), never
// off a migration NUMBER — numbers are claimed at merge.
//
// A FOCUSED invocation (node --test tests/cash-account-set-membership-read.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_CASH_ACCOUNT_SET_MEMBERSHIP_READ = "1";
