// Pre-integration gate for #949's TENANCY CONTRACT-TERMS + RECURRING RENT PLAN lane (migration
// 0300). NOT a test file: preload it for a package-wide sweep run against a chain that predates
// this PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every cell
// against a database where clara.contract_terms, clara.get_tenancy_rent_plan_draft and
// clara.settle_rent_payable do not yet exist and clara.list_review_queue does not yet project
// row_kind='rent_payable_unsettled' / 'rent_escalation_pending'.
//
// Mirrors payroll-settlement-preintegration-gate.mjs (#947, migration 0298) exactly.
//
// A FOCUSED invocation (node --test tests/tenancy-rent-plan.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the lane FAILS LOUDLY. Final acceptance
// is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_TENANCY_RENT_PLAN = "1";
