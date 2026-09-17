// #639's fixed-asset acquisition battery is frontier-gated on the `fixed_asset_acquisition$` stem,
// but a database that HAS the stem and an authoring copy that does not are two different
// situations. This module is the package-wide sweep's own reason to be quiet on the second one:
// it tells `gateAcq` (tests/fixed-asset-acquisition-fixtures.mjs) that a missing lane is an
// expected pre-integration state rather than a defect.
//
// A FOCUSED invocation does not preload this module and therefore FAILS LOUDLY when 0216 is
// absent — a skip is not evidence. The per-cell frontier gate is unaffected either way: with this
// flag set it always skips (counted) on a database pinned below this migration, which is what the
// db-slice-frontiers matrix needs.
process.env.CLARA_ALLOW_MISSING_FA_ACQUISITION = "1";
