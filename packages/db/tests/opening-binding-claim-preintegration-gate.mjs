// Pre-integration gate for #1014's document binding claim (migration 0235). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.document_binding_claims does not exist.
//
// Mirrors legal-enforcement-mode-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/opening-balance-evidence-link.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the claim FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_OPENING_BINDING_CLAIM = "1";
