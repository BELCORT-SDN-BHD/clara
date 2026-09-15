// #652's accrual battery is frontier-gated on the `accrual_adjustments$` stem, but a database that
// HAS the stem and an authoring copy that does not are two different situations. This module is the
// package-wide sweep's own reason to be quiet on the second one: it tells
// `assertAccrualCohortPresent` (tests/accrual-adjustments-fixtures.mjs) that a missing lane is an
// expected pre-integration state rather than a defect.
//
// A FOCUSED invocation does not preload this module and therefore FAILS loudly when the cohort is
// absent — a skip is not evidence. The per-cell `gateAccruals` frontier gate is unaffected either
// way: it always skips (counted) on a database pinned below this migration, which is what the
// db-slice-frontiers matrix needs. The idiom is `accounting-plans-preintegration-gate.mjs`'s,
// verbatim, because a second spelling of one discipline is a second place for it to drift.
process.env.CLARA_ALLOW_MISSING_ACCRUAL_ADJUSTMENTS = "1";
