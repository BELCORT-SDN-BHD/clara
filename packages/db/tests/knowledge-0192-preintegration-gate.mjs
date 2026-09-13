// #644's knowledge cohort (0192_client_knowledge_records.sql) lands on a frontier above several
// in-flight tickets, so a package-wide CI run against a chain that has NOT applied it must SKIP
// the two knowledge batteries LOUDLY rather than fail them. A focused invocation does NOT preload
// this module and therefore FAILS when the cohort is absent — the 0176 idiom, verbatim
// (tests/counterparty-alias-kind-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0192 is applied this file is the honest
// reason the batteries are quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_0192 = "1";
