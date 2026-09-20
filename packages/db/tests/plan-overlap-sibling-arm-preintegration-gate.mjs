// #909's sibling-plan arm on `clara._plan_overlap_warning` is frontier-gated on the
// `plan_overlap_sibling_arm$` stem (migration 0281), but a database that HAS the stem and an
// authoring copy that does not are two different situations. This module is the package-wide
// sweep's own reason to be quiet on the second one: it tells
// tests/plan-overlap-sibling-arm.test.mjs that a missing migration is an expected pre-integration
// state rather than a defect.
//
// A FOCUSED invocation (node --test tests/plan-overlap-sibling-arm.test.mjs) does not preload this
// module and therefore FAILS LOUDLY when 0281 is absent -- a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_PLAN_OVERLAP_SIBLING_ARM = "1";
