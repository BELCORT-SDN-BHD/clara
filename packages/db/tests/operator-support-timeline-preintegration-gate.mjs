// Pre-integration gate for #843's operator support acts on the operator firm's own timeline
// (migration 0263). NOT a test file: preload it for an estate sweep run against a chain that
// predates this ticket's migration, so the sweep greens with a LOUD skip instead of hard-failing
// operator-support.test.mjs's os.20/os.21 against a database where `clara.set_admission_capacity`
// and `clara.resolve_stripe_event_problem` still append no domain event.
//
// Mirrors activity-successor-link-preintegration-gate.mjs / legal-enforcement-mode-preintegration-
// gate.mjs exactly: `assertSupportTimelineCohortPresent` (operator-support-fixtures.mjs's own
// frontier discriminator) reads this variable, and every OTHER #843 cell skips quietly through
// `gateSupportTimeline` regardless of it — the double-gate idiom accrual-adjustments-fixtures.mjs
// documents.
//
// A FOCUSED invocation (node --test tests/operator-support.test.mjs) does not preload this file,
// so the variable stays unset and a chain missing the migration FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips on a database that
// carries 0263.
process.env.CLARA_ALLOW_MISSING_OPERATOR_SUPPORT_TIMELINE = "1";
