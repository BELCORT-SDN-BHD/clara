// #648's firm setup cohort (0203_firm_setup.sql) lands on a frontier above several in-flight
// tickets, so a package-wide CI run against a chain that has NOT applied it must SKIP the firm
// setup battery LOUDLY rather than fail it. A focused invocation does NOT preload this module and
// therefore FAILS when the cohort is absent — the 0176/0192 idiom, verbatim
// (tests/knowledge-0192-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0203 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_0203 = "1";
