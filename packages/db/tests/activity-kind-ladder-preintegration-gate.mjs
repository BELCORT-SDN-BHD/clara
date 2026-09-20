// Pre-integration gate for #861's activity kind ladder — the five new rungs (`people`, `assets`,
// `counterparties`, `clients`, `firm`) and the widened `p_kinds` roster (migration 0264). NOT a
// test file: preload it for an estate sweep run against a chain that predates this ticket's
// migration, so the sweep greens with a LOUD skip instead of hard-failing activity-feed.test.mjs's
// af.33–af.39 against a database whose `clara.list_activity` still refuses `kinds=['people']`
// with CLR10 invalid_kind and files every one of those families under `documents`.
//
// Mirrors activity-successor-link-preintegration-gate.mjs (the same file's #840 frontier) exactly:
// `assertKindLadderCohortPresent` (activity-feed.test.mjs's own frontier discriminator) reads this
// variable, and every OTHER cell on the same frontier skips quietly through `gateKindLadder`
// regardless of it — the double-gate idiom accrual-adjustments-fixtures.mjs documents.
//
// A FOCUSED invocation (node --test tests/activity-feed.test.mjs) does not preload this file, so
// the variable stays unset and a chain missing the recut FAILS LOUDLY. Final acceptance is exactly
// that focused shape with the variable UNSET, counting ZERO skips on a database that carries 0264.
process.env.CLARA_ALLOW_MISSING_ACTIVITY_KIND_LADDER = "1";
