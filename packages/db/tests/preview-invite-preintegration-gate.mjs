// Pre-integration gate for #625's invite preview door (migration 0224). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where
// clara.preview_invite does not exist.
//
// Mirrors mdrw-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/preview-invite.test.mjs) does not preload this file,
// so the variable stays unset and a chain missing the door FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_PREVIEW_INVITE = "1";
