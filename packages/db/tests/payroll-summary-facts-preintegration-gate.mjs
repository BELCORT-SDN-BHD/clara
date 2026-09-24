// Pre-integration gate for #945's payroll-summary reading lane (migration 0296). NOT a test file:
// preload it for an estate sweep run against a chain that predates it, so the sweep greens with a
// LOUD skip instead of hard-failing payroll-summary-facts.test.mjs's cells (the field-path
// namespace, the answer vocabulary, the deterministic evaluator, the router arm, the persist door
// and the capability re-derivation).
//
// Mirrors wave4-chart-rows-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/payroll-summary-facts.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0296 FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_PAYROLL_SUMMARY_FACTS = "1";
