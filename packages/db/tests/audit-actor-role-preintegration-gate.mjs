// #912's audit actor-role cohort (0243_audit_actor_role.sql) lands on a frontier above several
// in-flight tickets, so a package-wide CI run against a chain that has NOT applied it must SKIP
// that battery LOUDLY rather than fail it. A focused invocation does NOT preload this module and
// therefore FAILS when the cohort is absent -- the 0240/0241/0242 idiom, verbatim
// (tests/fye-day-preintegration-gate.mjs, tests/scope-default-drop-preintegration-gate.mjs,
// tests/key-grammar-preintegration-gate.mjs).
//
// THE FLAG NAMES WHAT IS ADDED: one nullable column on clara.audit_log and the BEFORE INSERT
// stamp that fills it, plus the one line clara.list_firm_knowledge gains to cite it. No door
// changes signature, so nothing else in the estate can tell the difference. Until 0243 is applied
// this file is the honest reason the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_AUDIT_ACTOR_ROLE_0243 = "1";
