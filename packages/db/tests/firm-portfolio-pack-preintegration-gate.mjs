// #659's firm-portfolio-pack lane is frontier-gated on the `firm_portfolio_pack$` stem, but a
// database that HAS the stem and an authoring copy that does not are two different situations.
// This module is the package-wide sweep's own reason to be quiet on the second one: it tells
// `firm-portfolio-pack.test.mjs` and `compliance-watch-disposition.test.mjs` — the TWO batteries
// 0231 ships, one migration, one stem, one cohort — that a missing lane is an expected
// pre-integration state rather than a defect.
//
// A FOCUSED invocation does not preload this module and therefore FAILS loudly when the lane is
// absent — a skip is not evidence, and a worker running either battery on a rig that is supposed to
// carry 0231 must not be told "0 failures" by a file that quietly ran nothing. The per-cell
// frontier gate is unaffected either way: with this flag set it always skips (counted) on a
// database pinned below this migration, which is what the db-slice-frontiers matrix needs.
process.env.CLARA_ALLOW_MISSING_FIRM_PORTFOLIO_PACK = "1";
