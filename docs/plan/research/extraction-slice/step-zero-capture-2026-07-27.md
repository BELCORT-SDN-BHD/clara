# X2 step zero — the real Azure captures, and what they changed (2026-07-27)

Two real documents were re-analyzed offline through the EXACT production call
(`prebuilt-invoice`, api-version `2024-11-30`, `features=keyValuePairs`), on the Fly
machine where the credentials live, read-only against storage. Cost: 3 Azure pages.
Raw payloads are held OUT OF REPO (they carry real client data); the measured facts and
the reader-design consequences are recorded here.

| document | pages | role |
|---|---|---|
| `509e788d` BRIGHTPATH BINV202510-018 (RPR) | 2 | the Gate-P vehicle; 8% SST label |
| `2684d237` LAI LOU MEI receipt 001/07525 (Bee Creative) | 1 | the service-charge shape (XG2); 6% SST |

## Verified (the contract's step-zero assumption is now an observation)

1. **`pages[].lines[]` exists on the invoice model** with a flat 8-number polygon on
   every line, `unit: "inch"` — both documents, all pages. The X2 reader's input shape
   is real.
2. **Totals sections are split-line**: labels and amounts are separate lines. Measured
   pairing: amount = line index label+1, same page, |Δy| ≤ 0.15in (0.01–0.02 on
   BRIGHTPATH, 0.11–0.14 on the receipt), amount x > label x.
3. **OCR noise is real**: `"11 SubTotal"` (leading item-count on the label line),
   `"ervice Tax@6%"` (first letter dropped in the Tax Summary repeat), vendor name read
   as `"CONSULTANCY\nrightpath"` at confidence 0.922. Confidence certifies nothing —
   further empirical support for ADR-047 Q1 (confidence dropped from gating).
4. **Azure's typed fields vary between runs on the same document**: the fresh BRIGHTPATH
   call returned a typed `SubTotal` (435,560.40 — correct off the face) where the
   production extraction had none (part of the 0/29). The reader/typed reconciliation
   in X2's design (emit neither on disagreement) is load-bearing, not defensive.

## THE FINDING — the Gate-P vehicle's tax amount is a DASH

Human eyes on the rendered page 2 (the PDF has no text layer; rendered at 200dpi):

```
Sub Total (Excluding Tax)    435,560.40
Rounding                  −       0.40     <- minus glyph, separate table column
Service Tax (8%)                    —      <- A DASH. Nil tax charged.
Total (Inclusive of Tax)     435,560.00
```

`509e788d` prints a Service Tax (8%) LABEL but charges NIL. The prior receipts'
"Service Tax (8%), total RM435,560.00 — everything the gate asks for"
(gate-p-unblocked-and-r2-blocked-2026-07-26.md) was written from the label's existence;
the face amount is a dash. Additionally, the OCR captured the amount NOWHERE (not in
lines, not in tables — the totals table's tax row has no amount cell — not in
keyValuePairs, which mashed "Rounding\nService Tax (8%)" into one key), and the rounding
MINUS GLYPH is captured nowhere either.

**Consequences:**
- **XG1 as written cannot close on `509e788d`.** A v6 re-extraction will (correctly)
  emit `total_excl_tax` 435,560.40 and rounding, and `tax_total` ABSENT — there is no
  nonzero stated tax to tie an `sst_purchase_cost` leg to. Gate P's real vehicle is a
  FUTURE genuinely-SST-charging supplier bill (the operating runway), unless the owner
  rules otherwise. OPEN OWNER QUESTION: amend XG1 to (a) retarget "the first real
  SST-charging bill to arrive", keeping `509e788d` as the re-extraction + XG5
  byte-stability vehicle only, or (b) something else.
- **Dash-means-nil is a first-class reader case**: emit ABSENT, never 0.00 (a fabricated
  zero would make the corrected identity 435,560.40 + 0 − 0.40 = 435,560.00 PASS on a
  document whose tax facts were never read — the exact wrong-post class X3 exists to
  refuse).
- **The detached minus glyph is a first-class hazard**: rounding signs live in separate
  table columns that OCR can drop entirely. X2's design handles the standalone-minus
  row for rounding only; components stay positive by law (0022 enforces).

## Where the artifacts live

Raw captures + the rendered totals-band PNG: local operator storage, out of repo
(real client data). The X2 fixtures replicate the measured geometry synthetically; the
real payloads drive a local-only validation run whose receipt rides the X2 PR.
