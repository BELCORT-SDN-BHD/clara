// The H-17 / H-19 migration is authored as 0176_counterparty_alias_kind_scope.sql and is
// therefore deliberately skipped by the normal migration runner until merge prep, where it claims
// its number under 裁-108. Package-wide CI preloads this module so the battery skips LOUDLY on a
// chain that has not applied it. A focused invocation does not preload it and must FAIL when the
// cohort is absent; authoring evidence runs against a numbered suite copy.
//
// THE NUMBER CLAIM IS WHAT ARMS THESE CELLS (裁-108's own lesson). Until then this file is the
// honest reason the battery is quiet, not a silent pass.
process.env.CLARA_ALLOW_MISSING_COUNTERPARTY_ALIAS_KIND = "1";
