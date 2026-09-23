// #898's fye-day cohort (0240_financial_year_end_day.sql) lands on a frontier above several
// in-flight tickets, so a package-wide CI run against a chain that has NOT applied it must SKIP
// that battery LOUDLY rather than fail it. A focused invocation does NOT preload this module and
// therefore FAILS when the cohort is absent — the 0192/0220 idiom, verbatim
// (tests/knowledge-firm-defaults-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0240 is applied this file is the honest reason
// the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_FYE_DAY_0240 = "1";
