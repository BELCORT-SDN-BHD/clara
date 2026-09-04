// The web-reads/doors cohort is authored as UNNUMBERED_web_reads_and_small_doors.sql plus its
// statement-lane sibling UNNUMBERED_stmt_witness_totals_and_institution_code.sql, and is
// therefore deliberately skipped by the normal migration runner until merge prep, where each
// claims its number under 裁-108. Package-wide CI preloads this module so the battery skips
// LOUDLY on a chain that has not applied it.
//
// A focused invocation does not preload it and must FAIL when the cohort is absent; authoring
// evidence runs against a numbered suite copy or a hand-applied rig.
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS (裁-108's own lesson). Until then this file is the
// honest reason the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_WEB_READS = "1";
