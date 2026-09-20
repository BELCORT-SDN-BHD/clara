// Pre-integration gate for #921's revoke of the human EXECUTE grant on
// propose_vendor_identity_binding / sign_vendor_identity_binding / decline_vendor_identity_binding
// (migration 0273_vendor_binding_write_doors_revoked). NOT a test file (does not end in
// `.test.mjs`): `node --test` ignores it. Preload it for an estate sweep run against a chain
// that PREDATES this PR's migration, so the sweep greens with a LOUD skip instead of hard-
// failing the one battery that asserts clara_authenticated is DENIED these three doors — a
// pre-0273 chain still grants them, and a naive "must be denied" assertion would be wrong
// there, not merely absent.
//
// UNLIKE 0271's drop-shaped gate, this migration REVOKES a grant rather than dropping a
// function: the three doors still RESOLVE on every frontier, before and after. Readiness is
// therefore keyed on the ledger's own stem match (`vendor_binding_write_doors_revoked$` on
// `clara.schema_migrations`, never a migration NUMBER, which is claimed at merge), exactly as
// 0271's own gate reads existence rather than a version string.
//
// A FOCUSED invocation (node --test tests/vendor-binding-write-doors-revoked.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the migration FAILS
// LOUDLY. Final acceptance is exactly that focused shape with the variable UNSET, counting zero
// skips.
process.env.CLARA_ALLOW_MISSING_VENDOR_BINDING_WRITE_DOORS_REVOKED = "1";
