// Pre-integration gate for #885's source-correction supersession (migration 0268). NOT a test
// file: preload it for an estate sweep run against a chain that predates this PR's migration, so
// the sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara._source_corrected_work does not exist.
//
// Mirrors work-question-admitted-basis-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/work-source-correction-supersede.test.mjs) does not
// preload this file, so the variable stays unset and a chain missing the cohort FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_WORK_SOURCE_CORRECTION = "1";
