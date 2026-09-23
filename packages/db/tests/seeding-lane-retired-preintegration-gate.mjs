// Pre-integration gate for #1012's seeding-lane retirement (migration
// 0288_seeding_lane_retired.sql). NOT a test file: preload it for an estate sweep run against a
// chain that predates this migration, so the sweep greens with a LOUD skip instead of
// hard-failing every cell that needs the three retired doors' typed refusal.
//
// A FOCUSED invocation (node --test tests/seeding-lane-retired.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY — the same
// polarity client-birth-wall-preintegration-gate.mjs documents for 0287.
process.env.CLARA_ALLOW_MISSING_SEEDING_LANE_RETIRED = "1";
