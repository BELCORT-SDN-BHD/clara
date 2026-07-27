# X6 — the vendor_unresolved diagnosis (2026-07-27, measured on live + the real capture)

Contract: §2 X6 (ADR-047 Q3 — diagnose AND fix in-slice, data + logic pre-authorized, own
block, never inside X5). The diagnosis below is measured, not assumed.

## The first production re-extraction (context)

`request_reextraction('509e788d')` — **the verb's first call ever** — returned 200
(`task dfe8a2a7`, version_n=2, queued→running→done in ~36s on runtime v30). The v6
extraction is authoritative; v1 superseded by the 0017 trigger; audit row 1-of-1. Regions:
`invoice.total_excl_tax = 435,560.40` (the corpus's FIRST such fact — 0/29 is now 1/30,
typed-collapsed with Azure's SubTotal), `tax_total` ABSENT (the printed dash), rounding
refused `sign_unknown` — byte-for-byte the amended-XG1 prediction. XG4 verified: 30
extractions, exactly one v6-norm, supersede delta = this document's v1 alone.

## The diagnosis

The autodraft lane never re-attempted `509e788d` — correctly: **an already-coded document
is not an autodraft candidate** (its one journal entry is approved). The historical
29/29 `vendor_unresolved` came from the uncoded-corpus era. The resolution failure itself
is directly measurable, and its root cause is now pinned:

| surface | value |
|---|---|
| registry (RPR, registered vendor) | `BRIGHTPATH CONSULTANCY SDN. BHD.` · `registration_normalized = 2024010477561593602x` |
| v6 typed `VendorName` | `"CONSULTANCY\nrightpath"` — OCR garbage at confidence 0.922 |
| v6 typed `VendorTaxId` | **ABSENT** (Azure never returned it on this layout) |
| v6 `invoice.vendor_registration` region | **none** (the v3 mapper's looksLikeRegistration emit is typed-field-gated) |
| **the document face** | `"Company No. 202401047756 (1593602-X)"` — printed and CLEANLY OCR'd in the letterhead of BOTH pages (`pages[].lines[]`, y≈0.9) — normalizes to the registry value EXACTLY |

**Root cause: the extraction carries no usable vendor identity, while a perfect one sits
in the OCR lines.** Resolution gets only a mangled name; name-only matching against a
REGISTERED counterparty is exactly what CLR23 doctrine refuses (correctly — the R2
ceremony proved that refusal against 6/12 ticks). The blocker is an extraction gap, not a
resolution defect: `_resolve_counterparty` would match on registration if the fact existed.

## The ruled fix (logic class — pre-authorized, ADR-047 Q3)

**A deterministic vendor-identity reader**, the X2 pattern with a small vocabulary:
label-anchored `Company No.` / `Co. Reg. No.` / `Registration No.` / `SSM No.` lines →
emit `invoice.vendor_registration` with the
(**Bare `(1234567-X)` tokens are RULED OUT** — a label-less token carries no evidence of
WHOSE registration it is; label-anchoring is what makes the attribution evidenced rather
than positional. Recorded as an explicitly-deferred vocabulary widening, not a gap; and
moot for the live lane's only bare-token example, which is `receipt`-kind.)
line's real geometry — reconciled against the typed emission exactly as X2 reconciles
totals (collapse on agreement; NEITHER on disagreement — `vendor_registration` is in the
DB's conflicting-duplicate forfeit list, so an unreconciled collision would forfeit the
extraction). Constraints: own block/PR (never inside X5); its own cross-model adversarial
review (house law for live-lane logic); lands BEFORE X5 so the corroboration sweep
measures with vendor identity present.

## Standing measurements folded in (for X5's design table)

The X2 reader's live receipt on the vehicle: matched=1 (subtotal), absent=2 (tax dash,
rounding), sign_unknown=1, sst_rate=8, typed_collapsed=1 — the yield questions
(tax-summary band depth, A4 pixel assumption, sign-capture and grammar yield on the wider
corpus) remain queued for measurement before X5 relies on reader agreement.
