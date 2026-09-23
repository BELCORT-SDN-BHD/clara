// #993's catalog key-grammar cohort (0242_knowledge_key_grammar.sql) lands on a frontier above
// several in-flight tickets, so a package-wide CI run against a chain that has NOT applied it
// must SKIP that battery LOUDLY rather than fail it. A focused invocation does NOT preload this
// module and therefore FAILS when the cohort is absent -- the 0240/0241 idiom, verbatim
// (tests/fye-day-preintegration-gate.mjs, tests/scope-default-drop-preintegration-gate.mjs).
//
// THE FLAG NAMES WHAT IS TIGHTENED, NOT ADDED: no new relation, no new column, no new function --
// two existing CHECK constraints replaced by a stricter pair. Until 0242 is applied this file is
// the honest reason the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_KEY_GRAMMAR_0242 = "1";
