// #654's firm-default cohort (0205_firm_knowledge_defaults.sql) lands on a frontier above several
// in-flight tickets, so a package-wide CI run against a chain that has NOT applied it must SKIP
// that battery LOUDLY rather than fail it. A focused invocation does NOT preload this module and
// therefore FAILS when the cohort is absent — the 0192 idiom, verbatim
// (tests/knowledge-0192-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0205 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_FIRM_0205 = "1";
