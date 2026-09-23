// Pre-integration gate for #932's fixed-asset default depreciation policy (migration 0277). NOT
// a test file: preload it for an estate sweep run against a chain that predates this PR's
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell against a
// database where clara._tf_fa_acquisition_birth still carries 0247's policy-free birth join.
//
// Mirrors fa-birth-watermark-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/fa-depreciation-policy.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the law FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_DEFAULT_DEPRECIATION_POLICY = "1";
