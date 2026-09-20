// Pre-integration gate for #839's shared question record (migration 0265). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara._work_question_record does not yet project `basis`.
//
// Mirrors legal-enforcement-mode-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/work-question-admitted-basis.test.mjs) does not preload
// this file, so the variable stays unset and a chain missing the recut FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_WORK_QUESTION_ADMITTED_BASIS = "1";
