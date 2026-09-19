// Pre-integration gate for #657's bank-match evidence lane (migration 0226). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.get_bank_line_matching_context does not exist.
//
// Mirrors preview-invite-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/bank-line-existing-booking.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the read FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_BANK_MATCH_EVIDENCE = "1";
