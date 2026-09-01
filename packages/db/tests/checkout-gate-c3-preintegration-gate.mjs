// The C-3 migration is authored as UNNUMBERED_checkout_gate_c3_folded_door.sql and is
// therefore deliberately skipped by the normal migration runner until merge prep.
// Package-wide CI preloads this module so the C-3 battery skips LOUDLY on the
// unnumbered branch. A focused invocation does not preload it and must fail when
// the cohort is absent; authoring evidence runs against a numbered suite copy.
process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C3 = "1";
