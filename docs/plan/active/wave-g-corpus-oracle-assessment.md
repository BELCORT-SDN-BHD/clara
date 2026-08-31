# Wave-G corpus — the oracle-tier assessment, the gaps, and the fixture sets

> **Companion to `wave-g-e2e-corpus-design.md`** (split out at the 2026-08-20 clock-out under
> the 500-line harness limit, the same split the F-A1 and F-A2 design sets take). The design
> doc carries the corpus's SHAPE and the owner's rulings; this file carries the **evidence
> those rulings were taken on** — what the three designated folders actually contain, judged
> against §4's seven-item golden-standard package.
>
> **Method and custody.** All three folders were read **locally and read-only**; no file was
> copied, moved, renamed or modified, and nothing left the machine. Every figure below was
> **transcribed from the printed face** of the document named beside it — positional extraction
> for text-layer PDFs, page rendering plus a visual read for image-only scans. **No figure here
> was computed or inferred**, and where two documents disagree both are quoted and the
> disagreement is named rather than resolved by arithmetic. Two custody restrictions were
> applied and are stated rather than assumed: the IC copy was **not opened**, and no IC number,
> TIN, personal email, EPF member number or personal bank-account number was transcribed —
> those fields are named by **class and location only**.
>
> **Constraint 12 check, done on the face:** ROME SECRETARY's sales-invoice template prints a
> customer name, an `Attn` contact and a phone number — **it does not print a customer
> registration number or a TIN at all**. Ingesting these invoices therefore cannot enrich an RS
> customer with either forbidden field, even by accident.

> **TRUED 2026-08-31 by 裁-31/裁-63:** these gaps are recorded as **资料缺失**, never chased or
> awaited; MBB-1 is CLOSED and the run proceeds on the desktop corpus as-is. The conductor/agent
> selects the RPR series by measurement and records that choice in the as-run. See
> `docs/plan/active/mohe-grill-rulings-2026-08-30.md` and `docs/ops/wave-g-setup-checklist.md`.

## 1 · The oracle verdicts, and the gaps recorded for the run

| Client | Verdict | §4 items MET | §4 items MISSING |
|---|---|---|---|
| **BEE CREATIVE** | **ACCEPTABLE-WITH-GAPS — the strongest of the three** | 3 SOFP · 4 P&L · 5 named certifier · 6 raw corpus (bank **12/12 both years**, no month missing) · 7 opening TB **derivable to the sen** from FY2024's own SOFP | **1 trial balance — BOTH FYs** · **2 general ledger — BOTH FYs** |
| **ROME SECRETARY** | **ACCEPTABLE-WITH-GAPS — one period only** | 2 GL (present, high quality — every posting dated, referenced, described) · 4 P&L · 6 raw corpus (**22/22 invoices tie to the GL**, 17 statements covering both accounts' full lives, 45 bills) · 7 n/a — **greenfield confirmed** | **1 trial balance** · **3 SOFP is DEGENERATE** · **5 no named producer — only the login `ADMIN`** |
| **ROME PROPERTIES** | **INSUFFICIENT as an oracle** (excellent as a payroll/volume fixture) | 2 GL · 7 n/a — greenfield confirmed | **1 TB present but NOT FIT** (dated 8 Dec 2025 on its face, not a period end; omits every balance-sheet account but share capital) · **3 SOFP degenerate against RM 1,973,332.91 of revenue** · **4 P&L is for a partial period** · **5 no named producer** · **6 Feb + Mar 2025 bank statements MISSING** |

**The gaps recorded here, then closed as 资料缺失 by 裁-63 — never a precondition to starting:**

1. **BEE: a general ledger and a trial balance for FY2024 and FY2025.** Without the GL there is
   no account-by-account reconciliation (EC-1) and **invoice-set completeness is unprovable** —
   for RS and RPR every invoice file ties to a GL posting; for BEE there is nothing to tie to,
   so "these 18 invoices are the RM 68,640.00 of sales" is an assertion, not evidence.
2. **BEE: the FULL document the FY2025 statements were extracted from.** They are pages
   numbered `8.0`/`9.0`, headed `Appendix I`/`II` — extracts from something larger the owner
   holds, which likely carries schedules 1-6 and the fixed-asset register behind
   `OFFICE EQUIPMENT 5,092.70` / `DEPRECIATION 1,143.30`.
3. **RPR: Feb 2025 and Mar 2025 bank statements, or a written statement that none exist.** The
   April statement's own face reads `BEGINNING BALANCE .00`, so the risk is low — but **absence
   is not evidence** (house law 2), and a low-risk gap closed by assumption is still closed by
   assumption.
4. **RS and RPR: a named producer and certifier.** Evidence law 3 — a figure without a named
   producer is not a golden standard. It is the gap that most directly blocks oracle status and
   the cheapest for the owner to close.
5. **BEE: who produced and certified these accounts, and why the firm changed** between FY2024
   (certified by ROME PUBLIC ADVISORY SDN BHD) and FY2025 (certified by LUXE WEALTH CONSULTANCY
   SDN BHD) under the same signatory name.
6. **BEE: the `1_UU-1.pdf` date** — its face reads `2Jan2024` while the file sits in the FY2025
   set. A typo or a misfile; either way a named discrepancy the run must resolve.

## 2 · What the assessment CONFIRMED — stated as loudly as the gaps

- **BEE's recorded acceptance bar is confirmed against the client's own papers** — FY2025 sales
  `68,640.00` / profit `47,245.65` / capital B/F `( 65,747.97)`, and FY2024's own closing
  `FINANCED BY` total is that same `(65,747.97)`, printed on **two independently produced
  documents**. The repo's bar was asserted; it is now evidenced.
- **BEE's bank statements tie to both balance sheets to the sen** — Dec-2024 closing
  `39,252.03` = FY2024 SOFP `HONG LEONG BANK BERHAD`; Dec-2025 closing `20,673.73` = FY2025
  SOFP `CASH IN BANK`; and the series is continuous across the FY boundary (Jan-2025's
  `Balance from previous statement` is `39,252.03`). **The strongest independent corroboration
  found anywhere in the three folders.**
- **RS and RPR are genuinely GREENFIELD.** Every one of RS's thirteen GL accounts and all of
  RPR's open with a printed `Balance B/F` of `0.00`, verified individually across all pages,
  and both are first accounting periods of 2025-registered companies. **No opening seed is
  required and §4 item 7 does not apply** — which makes RS the cleanest greenfield-induction
  proof available: a real first period opening from documented zero, with a complete
  GL-verified document set at modest volume.
- **Both RS and RPR are in STRIKE-OFF, and that is why both balance sheets are empty.** Their
  own GLs say so on the face — RPR carries a `SECRETARY FEE OF THE COMPANY'S APPLICATION FOR
  STRIKE OFF` dated 2 Dec 2025, RS a `STRIKE OFF COMPANY FEE` dated 6 Mar 2026 — and both banks are
  then deliberately run down to `0.00`. **This is the single most important structural fact
  about the two candidates**, and it is what forced the design's two-tier reshape.
- **No slot is SST-registered.** A scan of every text-layer PDF across all three folders
  returned **zero** SST/service-tax registration hits on any client's own sales invoices, so
  the SST axis stays with CLIENT-SST-1 as the design assumed. *(Caveat, per house law 2: a
  dozen image-only supplier bills have no text layer and were not machine-scanned — that
  affects input tax only, never whether a client is registered.)*

## 3 · Corpus exclusions and fixture sets

**EXCLUDED from ingestion:**

- **The IC copy** (`Chew Yue Ann - IC Copy.pdf`) — ruled out entirely by ADR-0072 ⑤. A pure
  identity document with no accounting content: excluding it costs nothing and removes the
  single highest-sensitivity item in the corpus. *(It was never opened by the assessment.)*
- **BEE's `invoice sample\` folder — 68 exact byte-duplicates** (md5-verified) of all 37 FY2024
  sales invoices and all 31 FY2024 purchase bills. **Zero unique content.** Ingesting it would
  either double-count every FY2024 document or manufacture 68 duplicate-detection events. It is
  the only duplication anywhere in the three folders (no cross-client duplicates exist).
- **The ~32 USD-denominated BEE purchase invoices** — 12 Midjourney + 1 Vecteezy in FY2024, 12
  Midjourney + 8 OpenAI in FY2025, confirmed by reading the invoice faces (`$10.00 USD`,
  `$21.60 USD`), never by filename. §2 says **MYR only** is today's fit. **Excluded from the
  acceptance run** — an unbuilt capability must not contaminate a tie-out — with the amounts
  booked from the bank statement in MYR, which is the desk's own practice (the FY2024
  Midjourney PDFs carry a bank exchange-rate table as page 2). **RETAINED as the ready-made
  FX-lite fixture set for Wave F, and as EC-10's live test.**

**One decision still owed before ingestion:** RPR's `Scan from ori hardcopy\` holds four
statements (2504–2507) that **overlap** the main `202504`–`202507` PDFs — same months,
different files, different content hashes (hardcopy scans vs electronic). **One series must be
picked as authoritative**, or the bank reconciliation sees every April–July transaction twice.

**A positive find worth carrying:** BEE's eight OpenAI invoices are **SST-stated supplier
bills** — the face prints `Service Tax - Malaysia (8% on $20.00) $1.60 (RM6.90)` and the vendor
carries a Malaysian foreign-registered-person marker. That is imported digital services with
Malaysian service tax charged by a foreign supplier, and OD-2 names "Gate P's first native
SST-stated supplier bill" as an outstanding debt. **It collides with the exclusion above — the
same eight documents are the USD ones** — so Gate P is not discharged by them in the acceptance
run; they are instead the FX-lite fixture's most interesting members.

**A corpus-hygiene law, proven on these papers: FILENAMES ARE NOT FIGURES.**
`BINV202510-018 - BRIGHTPATH - RM435,000.000.pdf` has a face that totals `435,560.00` — the GL
agrees with the face, and the filename is simply wrong. Never let a filename seed an extracted
amount.

**Nine spreadsheet files** (`.xlsx`/`.xlsm`, RPR payroll ×4 and sales-invoice support ×4) sit
outside the PDF/image intake path entirely. Decide whether they are corpus or context.

## 4 · The classes that will exercise OCR and vision hardest

Ordered, so the run is not surprised by its own inputs:

1. **BEE's receipt photographs — 70 JPGs** (17 Food + 4 Petrol in FY2024; 49 in FY2025). The
   FY2025 set is materially harder: opaque numeric filenames carry **no amount or date hint at
   all**, unlike FY2024's `RM101-28042024.JPG` convention. That is **good for honesty** — no
   filename leakage into extraction — but it removes any cross-check. The hardest single class
   in the corpus is a hand-held phone photo of a **rotated** thermal receipt on a patterned
   tablecloth with mixed Chinese/English line items.
2. **BEE's 51-page scanned claim pack** — image-only, one document containing many receipts.
   Needs page-level splitting.
3. **The scanned bank statements** — RS Maybank `2505`–`2509` and RPR `202512` plus the
   hardcopy scans. Degraded photocopies: the statement date renders as `3LlA5l25` on one and
   the header as `3Lltzl2s` / `BAXI PENYATA` on another. **Readable by eye, hostile to OCR** —
   the poorest legibility in the corpus.
4. **RPR's scanned supplier invoices** — 12 image-only PDFs. Quality is good; they simply have
   no text layer.

*Eighteen documents were opened across all three clients and every class. **Nothing was corrupt,
blank or unreadable.*** Two edge cases surfaced worth planting deliberately: a Shell receipt
whose header reads `INITIAL RECEIPT — This is not the final receipt` (a provisional document,
not a tax invoice), and a restaurant receipt printing a `Tax Summary / Taxable / Tax` header
with **blank values** under a vendor stamp, with handwritten pen annotations across it.

## 5 · Personal data — the tightest-custody inventory (OD-4(c))

**The design anticipated "at least one IC copy". The reality is broader: identity data sits in
the machine-readable TEXT LAYER of 32 documents, not just the one image.** Named by class and
location only, per the custody restriction above:

| Where | Files | Field classes printed |
|---|---|---|
| RPR payroll · salary slips, four months | **21 payslips** | employee name · IC number · personal email · TIN · EPF number · position · full salary and deductions · personal bank-account number |
| RPR payroll · EA forms | **6** | name · identity/passport fields · tax identification |
| RPR payroll · form e-E | 1 | identity/passport · tax identification |
| RPR payroll · form e-CP8D | 1 | submitter name · identity-card number |
| RPR payroll · statutory contribution statements | 4 | EPF member numbers |
| RPR payroll · the IC copy | 1 | **an identity-card image — EXCLUDED from ingestion (§3)** |
| RPR payroll · spreadsheets | 4 | not opened; expected to consolidate the same fields |
| BEE FY2025 management accounts | 1 | **a personal TIN printed in the page header** |
| RS Alliance Bank statements | 6 | boilerplate `identity card`/`passport` terms only — **no personal values** |

**The ruling this feeds (ADR-0072 ⑤): FULL PERMISSION, with the IC copy excluded and the whole
RPR payroll tree treated as the tightest-custody slot.** Vendor tracing stays **OFF** for the
entire run — the C6 checklist is open owner/legal work and PRD §6.16 keeps the flag closed
until all three of its parts are evidenced.
