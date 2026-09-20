// #913's scope_default-drop cohort (0241_knowledge_scope_default_drop.sql) lands on a frontier
// above several in-flight tickets, so a package-wide CI run against a chain that has NOT applied
// it must SKIP that battery LOUDLY rather than fail it. A focused invocation does NOT preload
// this module and therefore FAILS when the cohort is absent — the 0192/0220/0240 idiom, verbatim
// (tests/fye-day-preintegration-gate.mjs).
//
// THE FLAG NAMES WHAT IS MISSING THE OTHER WAY ROUND FROM ITS NEIGHBOURS: not a not-yet-added
// relation but a not-yet-dropped column. Until 0241 is applied this file is the honest reason the
// battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_SCOPE_DEFAULT_DROP_0241 = "1";
