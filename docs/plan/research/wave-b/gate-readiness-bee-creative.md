# Bee Creative — live-gate readiness brief (measured 2026-07-25)

> The corpus at `C:\Users\zhant\Desktop\BEE CREATIVE - Accounts`, measured file by file so
> the remaining Wave B gates can be run without re-discovery. **Every count below was taken
> with a null-delimited walk** (`find … -print0 | while IFS= read -r -d ''`) — an earlier
> pass used an unquoted `$(find …)`, which word-split on the spaces in the folder name and
> produced a confidently wrong "all 288 files are image-only scans". They are not.

## The entity

**BEE CREATIVE SOLUTION** — a **SOLE PROPRIETORSHIP** (202103229799 / PG0516352-X), not an
Sdn Bhd. Equity is Balance b/f · Profit · Drawing. Sole-proprietor chart-of-accounts support
is merged (PR #87): the capital account takes the single `retained_earnings` slot, drawings
is contra-equity, `190-OBE` sits in the `system` block because Gate K refuses without it, and
`conflictsWith` swaps the company blocks out. Nothing else is needed to onboard it.

*(RPR = ROME PROPERTIES SDN BHD and ROME SECRETARY SDN BHD are the Sdn Bhd vehicles and are
different entities. Rome **Public Advisory** Sdn Bhd is the Gate F firm — a fourth thing
again.)*

## The corpus, exactly

288 files: **218 PDF, 70 JPG. No third file type anywhere.**

| folder | files |
|---|---|
| YA2024 / invoice sample | 68 |
| YA2025 / 2025 claim / New folder | 49 |
| YA2024 / Sales | 37 |
| YA2024 / Purchases | 31 |
| YA2025 / Sales Invoice | 18 |
| YA2024 / Expenses / Food | 17 |
| YA2025 / Purchase | 13 |
| YA2025 / Bank Statement (HLB) | 12 |
| YA2024 / Bank Statements (HLB) | 12 |
| YA2025 / Purchase / Lucy | 11 |
| YA2025 / Purchase / AI Open | 8 |
| YA2024 / Expenses / Petrol | 4 |
| (remaining) | 8 |

**206 of the 218 PDFs are born-digital with a real text layer.** The JPGs are photographs
and will need OCR; the PDFs mostly will not.

## Gate by gate

### Gate L — bank reconciliation · READY
**24 contiguous monthly HLB statements** (Jan-24 → Dec-25), 12 per year, overlapping the
whole sales and purchase range. This is the cleanest gate in the set.

### Gate R2 — recurring-pattern rule signatures · READY
37 YA2024 sales invoices, plus two strong repeating purchase counterparties in YA2025:
**Lucy Artistry Lab (11)** and **OpenAI (8, monthly, identical amount)**. Well past the ≥3
floor, with a genuine pattern rather than a coincidence.

### Gate K — a second, independent carry-down · READY
Both YA2024 and YA2025 are present, so a real prior period exists. This would be an
independent second Gate K run on a **different entity shape** (sole proprietorship) from
Rome Secretary's — which is worth more than a repeat.

### Gate S — MyInvois e-invoice · DEFERRED ON HARD EVIDENCE
Zero `.xml`, `.zip` or `.json` in the entire tree — exactly 218 PDF + 70 JPG and no third
file type. **No MyInvois e-invoice document exists here.** This is evidence of absence, not
absence of evidence, and it is the kind of deferral WB-R17 permits by ruling.

### Gate P — SST · READY BUT ATYPICAL, and it needs an owner ruling

I scanned **all 218 PDFs** for any SST / service-tax / FRP / registration-number marker.
**Exactly 8 files matched, all of them OpenAI invoices**, and nothing else in the corpus
carries a tax line at all.

```
Invoice-NJQKBGFJ-0001 … 0008   Apr 2025 → Nov 2025, monthly
OpenAI, LLC · MY FRP 24000037
ChatGPT Plus Subscription   $20.00
Service Tax - Malaysia (8% on $20.00)   $1.60   (RM6.90 … RM6.61 across the months)
Total $21.60 USD
Bill to: TAN LIK PIN, 29 Loring Intan Baiduri 2C, Taman Intan Baiduri, 52100 Kepong
```

These are **genuine Malaysian service-tax documents** — a real FRP registration, a real 8%
service tax, and an RM equivalent on the face of the invoice. Nothing is fabricated. But
they exercise a different path from the one Gate P probably had in mind:

- the registered person is **foreign** (OpenAI as a Foreign Registered Person self-charging
  service tax on an imported digital service), **not a local Sdn Bhd billing a business**;
- the bill is to **the proprietor personally, at a residential address**, not to BEE CREATIVE
  SOLUTION — which is also a live accounting question in its own right, not just a gate one;
- the amounts are **USD** with an RM tax indication of roughly RM6.61–6.90, so the FX leg is
  in play on every one of them.

Separately, **every Midjourney invoice carries no tax line at all** — that is the
imported-services self-accounting case, which is a *different* workflow again and not Gate P.

**Owner ruling needed:** is an FRP self-charged service tax on a personally-billed USD
subscription the proof Gate P wants? Three honest options —

1. **Accept it.** It is real, it is Malaysian service tax, and it exercises FRP + FX + a
   personal-name bill on a sole proprietorship. Gate P closes on an atypical but genuine
   document, and the receipt says exactly that.
2. **Defer Gate P by ruling**, the way Gate S is being deferred, and close it later on a
   local registered supplier's invoice when one arrives.
3. **Use a different client.** If another BELCORT client has a local SST-registered supplier
   bill, that is the typical path and would close Gate P as designed.

I would not merge options 1 and 2 quietly — whichever is chosen should be written into the
receipt, because "Gate P closed" reads very differently against a local supplier bill than
against a foreign digital-services charge.

## Sequencing

**WB-R24 is binding: no live-gate journey may straddle a deploy.** The 0020 ceremony is
pending and owner-gated. Recommendation: **run the ceremony first, then the gates**, so every
receipt pins the final posture (20 migrations + the A5-aware image) rather than a state that
is about to change — and because 0020 lights deterministic ingest on `document.classified`,
which is exactly what a Bee Creative document journey drives.
