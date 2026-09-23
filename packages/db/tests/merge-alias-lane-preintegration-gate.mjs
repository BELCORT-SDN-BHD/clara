// Pre-integration gate for #889's merge-door alias lane (migration
// 0289_merge_alias_lane.sql). NOT a test file: preload it for an estate sweep run against a
// chain that predates this migration, so the sweep greens with a LOUD skip instead of hard
// failing every cell that asserts a fresh merge's alias records `recorded_via='human_ui'`
// (on a pre-0289 chain the same alias is a real row, just still stamped the honest
// `legacy_unknown` default — a BEHAVIOUR frontier, not merely an absent table or column, which
// is why this gate exists at all for a migration that adds no new catalog object).
//
// A FOCUSED invocation (node --test tests/merge-alias-lane.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY — the same
// polarity client-birth-wall.test.mjs's own gate documents for 0287.
process.env.CLARA_ALLOW_MISSING_MERGE_ALIAS_LANE = "1";
