// #640's accounting-plan battery is frontier-gated on the `accounting_plans$` stem, but a database
// that HAS the stem and an authoring copy that does not are two different situations. This module
// is the package-wide sweep's own reason to be quiet on the second one: it tells
// `assertPlanCohortPresent` (tests/accounting-plans-fixtures.mjs) that a missing lane is an
// expected pre-integration state rather than a defect.
//
// A FOCUSED invocation does not preload this module and therefore FAILS loudly when the cohort is
// absent — a skip is not evidence. The per-cell `gatePlans` frontier gate is unaffected either
// way: it always skips (counted) on a database pinned below this migration, which is what the
// db-slice-frontiers matrix needs.
process.env.CLARA_ALLOW_MISSING_ACCOUNTING_PLANS = "1";
