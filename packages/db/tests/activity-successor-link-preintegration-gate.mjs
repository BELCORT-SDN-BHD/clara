// Pre-integration gate for #840's successor-Work link on a `work.cancelled` Activity row
// (migration 0262). NOT a test file: preload it for an estate sweep run against a chain that
// predates this ticket's migration, so the sweep greens with a LOUD skip instead of hard-failing
// activity-feed.test.mjs's af.31/af.32 against a database where `clara.list_activity`/
// `clara.get_activity_event` do not yet project `successor_work_id`.
//
// Mirrors accrual-adjustments-preintegration-gate.mjs / legal-enforcement-mode-preintegration-
// gate.mjs exactly: `assertSuccessorLinkCohortPresent` (activity-feed.test.mjs's own frontier
// discriminator) reads this variable, and every OTHER cell that depends on the same frontier
// skips quietly through `gateSuccessorLink` regardless of it — the double-gate idiom
// accrual-adjustments-fixtures.mjs documents.
//
// A FOCUSED invocation (node --test tests/activity-feed.test.mjs) does not preload this file, so
// the variable stays unset and a chain missing the door FAILS LOUDLY. Final acceptance is exactly
// that focused shape with the variable UNSET, counting ZERO skips on a database that carries 0262.
process.env.CLARA_ALLOW_MISSING_ACTIVITY_SUCCESSOR_LINK = "1";
