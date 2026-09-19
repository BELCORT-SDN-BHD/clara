// Pre-integration gate for #1008's platform legal enforcement mode (migration 0234). NOT a test
// file: preload it for an estate sweep run against a chain that predates this PR's migration, so
// the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.set_legal_enforcement_mode does not exist.
//
// Mirrors firm-commercial-settings-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/legal-enforcement-mode.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the doors FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_LEGAL_ENFORCEMENT_MODE = "1";
