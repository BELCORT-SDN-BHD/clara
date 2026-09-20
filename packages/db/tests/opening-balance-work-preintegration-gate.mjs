// Pre-integration gate for #984's opening-balance Work (migration 0239). NOT a test file:
// preload it for an estate sweep run against a chain that predates this PR's migration, so the
// sweep greens with a LOUD skip instead of hard-failing every cell against a database where the
// `opening_balance` purpose does not exist.
//
// Mirrors opening-binding-claim-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (node --test tests/opening-balance-work.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the widened vocabulary FAILS LOUDLY.
// Final acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK = "1";
