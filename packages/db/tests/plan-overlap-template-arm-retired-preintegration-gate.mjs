// #929's retirement of `_plan_overlap_warning`'s template arm is frontier-gated on the
// `retire_plan_overlap_template_arm$` stem (migration 0283), but a database that HAS the stem
// and an authoring copy that does not are two different situations. This module is the
// package-wide sweep's own reason to be quiet on the second one: it tells
// tests/plan-overlap-template-arm-retired.test.mjs that a missing migration is an expected
// pre-integration state rather than a defect.
//
// A FOCUSED invocation (node --test tests/plan-overlap-template-arm-retired.test.mjs) does not
// preload this module and therefore FAILS LOUDLY when 0283 is absent -- a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_PLAN_OVERLAP_TEMPLATE_ARM_RETIRED = "1";
