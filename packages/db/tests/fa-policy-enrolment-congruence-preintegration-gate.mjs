// Pre-integration gate for #932's fix-round enrolment-congruence guard (migration 0280). NOT a
// test file: preload it for an estate sweep run against a chain that predates this file's
// migration, so the sweep greens with a LOUD skip instead of hard-failing the `p932.drift` cell
// against a database where a stale default depreciation policy still births an unchargeable
// COMPLETE register row.
//
// Mirrors fa-belt-birth-convention-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/fa-depreciation-policy.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the guard FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_POLICY_ENROLMENT_CONGRUENCE = "1";
