// Pre-integration gate for #656's opening-ledger source republication (migration 0228). NOT a
// test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell against a
// database where clara.document_capabilities still publishes registry_version 1.
//
// Mirrors preview-invite-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/opening-ledger-source.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0228 FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_OPENING_LEDGER_SOURCE = "1";
