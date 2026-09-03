// The C-6 migration is authored as 0164_checkout_gate_c6_web_reads.sql and
// is therefore deliberately skipped by the normal migration runner until merge
// prep, where it claims its number under 裁-108. Package-wide CI preloads this
// module so the C-6 battery skips LOUDLY on a chain that has not applied it.
// A focused invocation does not preload it and must FAIL when the cohort is
// absent; authoring evidence runs against a numbered suite copy.
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS (裁-108's own lesson). Until then
// this file is the honest reason the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C6 = "1";
