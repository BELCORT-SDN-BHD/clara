// #778's battery is frontier-gated on the `document_regions_unique_field_path$` stem (0201),
// which lands above several in-flight tickets. A package-wide CI run against a chain that has NOT
// applied it must SKIP the battery LOUDLY rather than fail it. A FOCUSED invocation does not
// preload this module and therefore FAILS when the migration is absent — the 0176 idiom
// (tests/counterparty-alias-kind-preintegration-gate.mjs), as 0191/0192/0193/0196 reuse it.
//
// Until 0201 is applied this file is the honest reason the battery is quiet, not a silent pass.
//
// WIRING: this module has no effect until `packages/db/package.json`'s `test` script preloads it
// with `--import ./tests/document-regions-unique-preintegration-gate.mjs`.
process.env.CLARA_ALLOW_MISSING_DOCUMENT_REGIONS_UNIQUE = "1";
