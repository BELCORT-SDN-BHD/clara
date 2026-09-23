// #1031's fye pair-wall cohort (0310_knowledge_fye_pair_wall.sql) lands on a frontier above
// several in-flight tickets, so a package-wide CI run against a chain that has NOT applied it
// must SKIP the cells that need it LOUDLY rather than fail them. A focused invocation does NOT
// preload this module and therefore FAILS when the cohort is absent — the 0192/0220/0240 idiom,
// verbatim (tests/fye-day-preintegration-gate.mjs).
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS. Until 0310 is applied this file is the honest reason
// the pair-wall cells are quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_FYE_PAIR_WALL_0310 = "1";
