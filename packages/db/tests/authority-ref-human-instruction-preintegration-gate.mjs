// Pre-integration gate for #977's ruling on what counts as a person's instruction for an
// `authority_ref` (migration 0250). NOT a test file: preload it for an estate sweep run against a
// chain that predates this PR's migration, so the sweep greens with a LOUD skip instead of
// hard-failing every cell against a database where `clara.sign_depreciation_authority` and
// `clara.create_accounting_plan` still resolve a chat-lane reference by a bare existence test.
//
// Mirrors fa-particulars-completion-fold-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (`node --test tests/authority-ref-human-instruction.test.mjs`) does not
// preload this file, so the variable stays unset and a chain missing the ruling FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_AUTHORITY_REF_HUMAN_INSTRUCTION = "1";
