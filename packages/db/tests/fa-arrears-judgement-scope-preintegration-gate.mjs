// Pre-integration gate for #975's fix round (migration 0293). NOT a test file: preload it for an
// estate sweep run against a chain that predates it, so the sweep greens with a LOUD skip instead
// of hard-failing the four cells that assert post-0293 behaviour — a per-year arrears figure in
// the refusal, a judgement that licenses only the figure it was made about, and a reopen_prior
// refusal on a year that is only closing.
//
// Mirrors fa-arrears-resolution-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/fa-arrears-resolution.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0293 FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_ARREARS_JUDGEMENT_SCOPE = "1";
