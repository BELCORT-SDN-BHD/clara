// The C-2 migration is authored as UNNUMBERED_checkout_gate_c2_stripe_events.sql and is
// therefore deliberately skipped by the normal migration runner until merge prep.
// Package-wide CI preloads this module so the C-2 battery skips LOUDLY on the
// unnumbered branch. A focused invocation does not preload it and must fail when
// the cohort is absent; authoring evidence runs against a numbered suite copy.
process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C2 = "1";
