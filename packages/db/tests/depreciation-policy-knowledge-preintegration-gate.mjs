// #1090's depreciation-policy knowledge cohort (0345_depreciation_policy_knowledge_key.sql) lands
// on a frontier above several in-flight tickets, so a package-wide CI run against a chain that has
// NOT applied it must SKIP that battery LOUDLY rather than fail it. A focused invocation does NOT
// preload this module and therefore FAILS when the cohort is absent — the 0192/0220/0240 idiom,
// verbatim (tests/fye-day-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0345 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_DEPRECIATION_POLICY_KNOWLEDGE_0345 = "1";
