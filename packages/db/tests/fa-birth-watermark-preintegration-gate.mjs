// Pre-integration gate for #972's fixed-asset birth watermark (migration 0247). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara._tf_fa_acquisition_birth still carries 0216's watermark-FREE birth join.
//
// Mirrors legal-enforcement-mode-preintegration-gate.mjs exactly.
//
// It also covers the ONE assertion #972 adds to a cell older than itself (x41.b3, in
// x41-wave-d-a-fa.test.mjs): below 0247 that assertion counts a skip instead of reddening a
// battery that has nothing to do with this migration.
//
// A FOCUSED invocation (node --test tests/fa-birth-watermark.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the law FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_BIRTH_WATERMARK = "1";
