# The corpus yield measurement (2026-07-27) — X5's evidence base

22 deliberate re-extractions fired across the historical invoice corpus (all 200-accepted,
bookkeeper-floor, audited; ~3 min of worker settlement), after X2 (v30) and X6 (v31) went
live. 21 settled to v7-norm extractions at measurement time.

## The numbers

| counter (across 21 docs) | totals_reader | vendor_identity |
|---|---|---|
| matched | 2 | 2 |
| absent | 11 | 19 |
| ambiguous / unparseable | 0 / 0 | 0 |
| sign_unknown | 1 | — |
| emitted | 0 (both collapsed into typed rows) | 2 |

New fact regions across the v7 corpus: `total_excl_tax` ×3 · `tax_total` ×1 ·
`vendor_registration` ×2 (plus the vehicle's own v6/v7 facts).

## What it means

1. **The legacy corpus mostly does not print labeled totals breakdowns.** Simple
   single-total supplier invoices dominate; there is nothing for a breakdown reader to
   read, and nothing an arithmetic identity could verify. Refusal-to-human is the correct
   outcome for those documents — the reader's low recall on old scans IS the honest
   autonomy boundary, not a defect. Zero ambiguous/unparseable across 21 real documents
   is the precision half working.
2. **The rounding-sign question is a measured corner case** (1/21). The as-built law
   (rounding emits only with an affirmatively captured sign) costs almost nothing
   corpus-wide.
3. **Corroboration-by-agreement (X5) will fire where it should**: documents that state
   their arithmetic (BRIGHTPATH-class layouts, future e-invoices, the XML tier which
   already corroborates structurally) — and nowhere else. Phase 5 §6's auto-post
   precision gate measures exactly this population.
4. Vendor identity resolves where the letterhead prints a labeled company number (2/21
   legacy; the Gate-P vehicle among them, flip proven live). The rest continue through
   the human coding loop + the R2 counterparty machinery, as today.
