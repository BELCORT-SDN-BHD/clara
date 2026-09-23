// #908's `clara._assert_plan_schedule` yield-wall is frontier-gated on the
// `plan_schedule_yield_wall$` stem (migration 0280), but a database that HAS the stem and an
// authoring copy that does not are two different situations. This module is the package-wide
// sweep's own reason to be quiet on the second one: it tells
// tests/plan-schedule-yield-wall.test.mjs that a missing migration is an expected pre-integration
// state rather than a defect.
//
// A FOCUSED invocation (node --test tests/plan-schedule-yield-wall.test.mjs) does not preload this
// module and therefore FAILS LOUDLY when 0280 is absent -- a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_PLAN_SCHEDULE_YIELD_WALL = "1";
