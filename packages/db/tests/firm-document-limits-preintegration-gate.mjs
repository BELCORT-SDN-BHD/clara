// #692's firm-document-limits battery is frontier-gated on the `firm_document_limits_preserving$`
// stem (0196), which lands above several in-flight tickets. A package-wide CI run against a chain
// that has NOT applied it must SKIP the battery LOUDLY rather than fail it. A FOCUSED invocation
// does not preload this module and therefore FAILS when the recut is absent — the 0176 idiom
// (tests/counterparty-alias-kind-preintegration-gate.mjs), as 0191/0192/0193 reuse it.
//
// THE NUMBER CLAIM IS WHAT ARMS THE CELLS. Until 0196 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/firm-document-limits-preintegration-gate.mjs`.
process.env.CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS = "1";
