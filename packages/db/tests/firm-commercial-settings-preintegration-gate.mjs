// Pre-integration gate for #635's firm commercial/legal/usage reads (migration 0233). NOT a
// test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell against a
// database where clara.get_firm_legal_standing does not exist.
//
// Mirrors preview-invite-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/firm-commercial-settings.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the doors FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FIRM_COMMERCIAL_SETTINGS = "1";
