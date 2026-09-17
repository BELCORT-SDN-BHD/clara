// The H-17 / H-19 cohort ships as 0176_counterparty_alias_kind_scope.sql, which has CLAIMED its
// number and is inside the applied frontier (#647 re-measured it on the 0200 rig: 0176 is a row
// in clara.schema_migrations). The 'authored but unnumbered, skipped by the runner until merge
// prep' sentence this header used to carry was true only before 裁-108 settled; it is deleted
// rather than amended. What the gate still does is unchanged and still needed: package-wide CI
// preloads this module so the battery skips LOUDLY on a chain BELOW 0176, while a focused
// invocation does not preload it and must FAIL when the cohort is absent.
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS (裁-108's own lesson). On a chain below 0176 this
// file is the honest reason the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_COUNTERPARTY_ALIAS_KIND = "1";
