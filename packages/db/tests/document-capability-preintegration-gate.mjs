// #624's cohort ships as 0191_document_capability_registry.sql. Every other in-flight ticket's
// rig sits below that frontier while this branch is unmerged, so package-wide CI preloads this
// module and the two batteries SKIP LOUDLY there rather than failing for being early.
//
// A FOCUSED invocation does not preload it and must FAIL when the cohort is absent: authoring
// evidence only counts against a database that actually has the migration. A skip is not
// evidence — that is the whole reason this file exists rather than a silent `if (!live) return`.
process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY = "1";
