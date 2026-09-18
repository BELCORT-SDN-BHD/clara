// #636's intake-batch battery is frontier-gated on the `intake_batches$` stem, but a database
// that HAS the stem and an authoring copy that does not are two different situations. This module
// is the package-wide sweep's own reason to be quiet on the second one: it tells
// `intake-batch.test.mjs` that a missing lane is an expected pre-integration state rather than a
// defect.
//
// A FOCUSED invocation does not preload this module and therefore FAILS loudly when the lane is
// absent — a skip is not evidence, and a worker running this battery on a rig that is supposed to
// carry 0229 must not be told "0 failures" by a file that quietly ran nothing. The per-cell
// frontier gate is unaffected either way: with this flag set it always skips (counted) on a
// database pinned below this migration, which is what the db-slice-frontiers matrix needs.
process.env.CLARA_ALLOW_MISSING_INTAKE_BATCHES = "1";
