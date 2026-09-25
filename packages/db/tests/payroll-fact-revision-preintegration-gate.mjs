// #1056's cohort ships as 0344_payroll_fact_revision.sql. Every other in-flight ticket's rig sits
// below that frontier while this branch is unmerged, so package-wide CI preloads this module and
// the battery SKIPS LOUDLY there rather than failing for being early.
//
// A FOCUSED invocation does not preload it and must FAIL when the cohort is absent: authoring
// evidence only counts against a database that actually has the migration. A skip is not
// evidence -- that is the whole reason this file exists rather than a silent `if (!live) return`.
process.env.CLARA_ALLOW_MISSING_PAYROLL_FACT_REVISION = "1";
