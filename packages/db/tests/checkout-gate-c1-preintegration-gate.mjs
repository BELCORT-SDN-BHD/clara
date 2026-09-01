// The C-1 migration was authored as UNNUMBERED_checkout_gate_c1_dpa.sql and was
// therefore deliberately skipped by the normal migration runner until merge prep,
// where it claimed 0158 (packages/db/migrations/0158_checkout_gate_c1_dpa.sql).
// Package-wide CI preloads this module so the C-1 battery skips LOUDLY on a
// pre-0158 chain. A focused invocation does not preload it and must fail when
// the cohort is absent; authoring evidence runs against a numbered suite copy.
process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C1 = "1";
