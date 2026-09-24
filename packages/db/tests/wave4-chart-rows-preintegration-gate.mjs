// Pre-integration gate for the wave-4 chart pre-step (migration 0295). NOT a test file: preload
// it for an estate sweep run against a chain that predates it, so the sweep greens with a LOUD
// skip instead of hard-failing wave4-chart-rows.test.mjs's four cells (the two new template
// rows, an existing client's chart left untouched, a new client's planted chart, and the
// cross-template code-collision read).
//
// Mirrors fa-arrears-judgement-scope-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/wave4-chart-rows.test.mjs) does not preload this file,
// so the variable stays unset and a chain missing 0295 FAILS LOUDLY. Final acceptance is exactly
// that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_WAVE4_CHART_ROWS = "1";
