// C-3 is live-numbered as 0161_checkout_gate_c3_folded_door.sql. Package-wide CI keeps
// this preload so an intentionally older frontier skips LOUDLY; once 0161 is applied the
// catalog gate self-disarms and every C-3 cell runs. A focused invocation does not preload
// it and must fail when the cohort is absent.
process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C3 = "1";
