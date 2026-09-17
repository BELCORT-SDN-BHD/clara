// #647's counterparty-identity cohort (0215_counterparty_identity_provenance.sql) lands on a
// frontier above several in-flight tickets, so a package-wide CI run against a chain that has NOT
// applied it must SKIP the battery LOUDLY rather than fail it. A focused invocation does NOT
// preload this module and therefore FAILS when the cohort is absent — the 0176 idiom
// (tests/counterparty-alias-kind-preintegration-gate.mjs) and 0192's (tests/knowledge-0192-
// preintegration-gate.mjs), verbatim.
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0215 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_COUNTERPARTY_IDENTITY = "1";
