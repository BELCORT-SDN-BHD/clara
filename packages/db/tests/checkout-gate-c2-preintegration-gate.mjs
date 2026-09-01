// The C-2 migration was authored as UNNUMBERED_checkout_gate_c2_stripe_events.sql and was
// therefore deliberately skipped by the normal migration runner until merge prep,
// where it claimed 0160 (packages/db/migrations/0160_checkout_gate_c2_stripe_events.sql).
// Package-wide CI preloads this module so the C-2 battery skips LOUDLY on a
// pre-0160 chain. A focused invocation does not preload it and must fail when
// the cohort is absent; authoring evidence runs against a numbered suite copy.
process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C2 = "1";
