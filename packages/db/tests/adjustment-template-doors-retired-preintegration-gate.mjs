// #927's three closed doors (`propose_adjustment_template`, `sign_adjustment_template`,
// `run_adjustment_manual`) are frontier-gated on the `retire_adjustment_template_doors$` stem
// (migration 0282), but a database that HAS the stem and an authoring copy that does not are two
// different situations. This module is the package-wide sweep's own reason to be quiet on the
// second one: it tells `x42-adjustments.test.mjs` (the three x42.t1/t2/t3 closed-door cells) and
// `x42-adj-canon.test.mjs` (the retirement-is-unconditional-on-shape cell) that a missing
// migration is an expected pre-integration state rather than a defect.
//
// A FOCUSED invocation of either file does not preload this module and therefore FAILS LOUDLY
// when 0282 is absent -- a skip is not evidence.
process.env.CLARA_ALLOW_MISSING_ADJUSTMENT_TEMPLATE_RETIREMENT = "1";
