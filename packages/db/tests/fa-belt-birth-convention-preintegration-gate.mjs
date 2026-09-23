// Pre-integration gate for #882(b)'s belt/birth convention comments (migration 0278). NOT a test
// file: preload it for an estate sweep run against a chain that predates this ticket's migration,
// so the sweep greens with a LOUD skip instead of hard-failing the convention-comment cell against
// a database where `clara._tf_fa_movement_belt` and `clara._tf_fa_acquisition_birth` do not yet
// carry the #882 (0278) catalog comment.
//
// Mirrors work-list-claim-label-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/fixed-asset-acquisition.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the convention comment FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_BELT_BIRTH_CONVENTION = "1";
