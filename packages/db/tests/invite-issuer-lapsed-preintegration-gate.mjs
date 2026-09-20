// Pre-integration gate for #872's read-time `issuer_lapsed` effective status (migration 0269).
// NOT a test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every #872 cell against
// a database where `clara.firm_invites_visible` and `clara.preview_invite` do not yet compute the
// fifth status.
//
// Mirrors preview-invite-preintegration-gate.mjs exactly, with one difference this file's own
// test-side gate (`unready872` in preview-invite.test.mjs) accounts for: 0269 recuts two EXISTING
// bodies and adds no new catalog object, so readiness is detected off `clara.schema_migrations`
// (a row matching the stem `invite_issuer_lapsed_status$`), never off a function or view coming
// into existence -- and never off a migration NUMBER, because numbers are claimed at merge. A
// number-keyed probe would turn all four #872 cells into silent green SKIPS against a database
// where the behaviour is live and could have regressed, which is the exact "a skip is not
// evidence" failure this chain exists to prevent (adversarial ADV-L10-04, 2026-09-20; the header
// of tests/firm-document-limits-writer-preintegration-gate.mjs states the same rule).
//
// A FOCUSED invocation (node --test tests/preview-invite.test.mjs) does not preload this file, so
// the variable stays unset and a chain missing the migration FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_ISSUER_LAPSED = "1";
