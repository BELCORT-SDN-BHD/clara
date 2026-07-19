# Lane 6 — RPR corpus: chart of accounts + eval manifest (ground truth)

Client: **ROME PROPERTIES SDN BHD** (Co. No. 202501005621 / 1607035V). Source
folder: `C:/Users/zhant/Desktop/Rome Properties YA2025 Files/`. Read in full:
`RPR - Management Accounts/RPR - Trial Balance  YA2025.pdf` (1 page),
`RPR - Management Accounts/RPR - General Ledger YA2025.pdf` (7 pages),
`RPR - Management Accounts/RPR - Profit & Loss Statement YA2025.pdf` (1 page).
Listed only (no content read): `RPR - Supplier Invoice/**`. **Not opened**, per
S6-R1: `RPR - Payroll/**` (EA forms, salary slips, IC copy, statutory files —
untouched). **Filename-only, no content read**, per instructions: `RPR - Bank
Statement/**`, `RPR - Sales Invoice/**` (also not required by this lane's
questions). The Balance Sheet PDF in the same folder (`RPR - Balance Sheet
YA2025.pdf`) was **not named in this lane's source list and was not opened** —
flag for the contract author if a full BS view is later needed.

All amounts MYR. Report period on every management-accounts doc: **10/2/2025
to 8/12/2025**.

---

## (a) Chart of accounts — from the Trial Balance

**Codes ARE used**, not names-only. Scheme: `<major-3-digit>-<suffix>` where
major blocks are `100` (equity), `500`/`530` (income), `610` (COGS), `900`
(expense) — and the `900` block uses a **mnemonic letter + 2-digit** suffix
(A=Accounting, B=Bank, E=EPF/EIS, O=Office rental, R=Rental-purifier,
S=Salary/Socso/Secretary — disambiguated by 01/02/04 — T=Toll, W=Water). The
Trial Balance (`RPR - Trial Balance  YA2025.pdf`, page 1) lists exactly 15
accounts with YTD movement; it foots to Grand Total 1,976,553.06 = 1,976,553.06.

```csv
account_code,account_name,debit,credit,classification
100-000,SHARE CAPITAL,0.00,1000.00,equity
500-000,REVENUE,0.00,1973332.91,income
530-000,OTHER INCOME,0.00,2220.15,income
610-000,PURCHASE,1307136.31,0.00,expense_cogs
900-A01,ACCOUNTING FEE,31500.00,0.00,expense
900-B01,BANK CHARGES,12.40,0.00,expense
900-E01,EPF - EMPLOYER,52200.00,0.00,expense
900-E02,EIS - EMPLOYER,249.90,0.00,expense
900-O01,OFFICE & WAREHOUSE RENTAL,161120.00,0.00,expense
900-R01,RENTAL OF WATER PURIFYIER,240.00,0.00,expense
900-S01,SALARIES,405000.00,0.00,expense
900-S02,SOCSO - EMPLOYER,2187.15,0.00,expense
900-S04,SECRETARY FEE,6035.40,0.00,expense
900-T03,"TOLL, PARKING & FINED",5760.00,0.00,expense
900-W01,WATER & ELECTRICITY,5111.90,0.00,expense
```

**Critical gap — the TB is not a full balance-sheet trial balance.** It only
shows accounts with YTD *P&L* movement (plus SHARE CAPITAL). The GL (7 pages)
contains additional accounts that carry **zero balance as of 8/12/2025**
(fully cleared/settled) and are therefore invisible on the TB, plus two
control accounts that appear **only as a reconciliation footer**, never as
individually-postable ledger lines in this export:

```csv
account_code,account_name,closing_balance,classification,source
150-000,RETAINED EARNING,-1000.00,equity,GL p.1 (NOT on TB — omission/inconsistency to flag)
310-000,CASH AT BANK,0.00,asset,GL p.1-2 (fully drawn down to 0.00 by 5/12/2025)
350-002,AMOUNT OWING FROM ROME GROUP SDN BHD,0.00,asset_related_party,GL p.2 (settled 28/11/2025)
410-001,WAGES & SALARIES ACCRUED,0.00,liability_accrual,GL p.2
410-003,EPF ACCRUED,0.00,liability_accrual,GL p.2-3
410-004,SOCSO ACCRUED,0.00,liability_accrual,GL p.3
410-005,EIS ACCRUED,0.00,liability_accrual,GL p.3
410-006,PCB ACCRUED,0.00,liability_accrual,GL p.3-4
420-001,AMOUNT OWING TO DIRECTOR - TAN LAKE WEI,0.00,liability_related_party,GL p.4 (waived 8/12/2025)
420-002,AMOUNT OWING TO IWIFI GROUP SDN BHD,0.00,liability_related_party,GL p.4 (repaid 14/10/2025)
300-000,TRADE DEBTORS,1973332.91 / 1973332.91,asset_ar_control,"GL p.7 footer only — no itemised entries printed; nets to 0 (cash-traced, see (b))"
400-000,TRADE CREDITORS,1353183.61 / 1353183.61,liability_ap_control,"GL p.7 footer only — no itemised entries printed; does not cleanly foot to visible on-account lines (see oddities)"
```

Implication for Slice 6: there is **no discrete AP/creditors GL code** the
write-floor can point a supplier-bill credit leg at from this chart — 400-000
TRADE CREDITORS exists only as a control-account plug in the GL export's own
reconciliation note, never posted to directly in the visible ledger. Every
observed supplier-bill credit in this book actually posts straight to
**310-000 CASH AT BANK** (cash/bank basis, no AP holding period is modelled in
the export we have) — see (b).

---

## (b) General Ledger entries for supplier-bill-adjacent accounts

Source: `RPR - General Ledger YA2025.pdf`, "GL Local - Ledger - Detail",
10/2/2025–8/12/2025.

**610-000 PURCHASE (COGS)** — GL p.4-5:
| Date | Vendor | Ref | Description | Amount |
|---|---|---|---|---|
| 30/5/2025 | PKL GROUP SDN BHD | PKLG-2505-005 | Unit L30-07 (net price RM1,236,380), 4.7% commission for Daw | 389,930.00 |
| 4/7/2025 | PKL GROUP SDN BHD | PKLG-2507-003 | Unit L61-11 (net price RM1,350,350), 4.5% commission for Dawn | 200,500.00 |
| 5/8/2025 | PKL GROUP SDN BHD | PKLG-2508-001 | Unit KMS-RB-098B (net price RM396,910), 4.5% commission for Emerald 9 Residence | 206,946.31 |
| 14/10/2025 | BRIGHTPATH CONSULTANCY SDN. BHD. | PI-00002 | Purchase | 435,560.00 |
| 14/11/2025 | BRIGHTPATH CONSULTANCY SDN. BHD. | PI-00001 | Purchase | 45,000.00 |
| 3/12/2025 | BUSYSTREET CONSULTANCY SDN BHD | PI-00003 | Purchase | 29,200.00 |
Total 1,307,136.31 (ties to TB/P&L).

**900-A01 ACCOUNTING FEE** — GL p.5:
| Date | Vendor | Ref | Description | Amount |
|---|---|---|---|---|
| 30/4/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2504/25 | Accounting fee — April 2025 | 500.00 |
| 31/5/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2505/22 | Accounting fee — May 2025 | 500.00 |
| 10/6/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2506/16 | Accounting fee — June 2025 | 500.00 |
| 15/7/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2507/14 | Accounting fee **& payroll services** — July 2025 | 5,000.00 |
| 13/8/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2508/10 | Accounting fee & payroll services — August 2025 | 5,000.00 |
| 17/9/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2509/10 | ...— September 2025 | 5,000.00 |
| 13/10/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2510/10 | ...— October 2025 | 5,000.00 |
| 13/11/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2511/10 | ...— November 2025 | 5,000.00 |
| 2/12/2025 | ROME PUBLIC ADVISORY SDN BHD | INV2512-01 | ...— December 2025 | 5,000.00 |
Total 31,500.00 (ties to TB/P&L).

**900-S04 SECRETARY FEE** — GL p.7:
| Date | Vendor | Ref | Description | Amount |
|---|---|---|---|---|
| 10/2/2025 | KOK LIONG ACCOUNTANCY & MANAGEMENT SERVICES | 202502014 | Company-formation secretary services (via JV RPRJV-202502/001, expense-claim by director) | 2,600.00 |
| 25/9/2025 | KOK LIONG ACCOUNTANCY & MANAGEMENT SERVICES | 202509230 | Secretary fees, 15 Feb–Dec 2025 | 1,190.00 |
| 2/12/2025 | KOK LIONG ACCOUNTANCY & MANAGEMENT SERVICES | 202512281 | Secretary fee for the company's strike-off application | 2,245.40 |
Total 6,035.40 (ties to TB/P&L).

**900-O01 OFFICE & WAREHOUSE RENTAL** — GL p.6:
| Date | Vendor | Description | Amount |
|---|---|---|---|
| 12/9/2025 | INF ASSET HOLDINGS | Rental charges 01/09–30/09/2025 | 41,040.00 |
| 2/10/2025 | ROME PUBLIC ADVISORY SDN BHD | Rental charges 01/08–31/08/2025 (1st payment) | 25,000.00 |
| 9/10/2025 | INF ASSET HOLDINGS | Rental charges 01/10–31/10/2025 | 41,040.00 |
| 9/10/2025 | ROME PUBLIC ADVISORY SDN BHD | Rental charges 01/08–31/08/2025 (2nd payment) | 13,000.00 |
| 2/11/2025 | INF ASSET HOLDINGS | Rental charges 01/11–30/11/2025 | 41,040.00 |
Total 161,120.00 (ties to TB/P&L). Note: ROME PUBLIC ADVISORY (the accounting
vendor) is *also* a rent co-payee for August (RM38,000 split over 2 payments)
— see oddities.

**900-R01 / 900-T03 / 900-W01 (the INF "office expenses claim" split)** — GL p.6-7,
all sourced from one debit note `DN-2509001` dated 5/9/2025 from INF ASSET
HOLDINGS SDN BHD:
| Account | Description | Amount |
|---|---|---|
| 900-R01 RENTAL OF WATER PURIFYIER | 01/07/2025, INV2507017, ACE Corporation (M) S/B — Coway rental for July 2025 | 240.00 |
| 900-T03 TOLL, PARKING & FINED | 01/07/2025, INV2507017 — non-reserved parking, July 2025 (8 named staff × RM360/pax) | 5,760.00 |
| 900-W01 WATER & ELECTRICITY | 02/09/2025, TNB a/c 210270879907 — electricity 02/08–01/09/2025 | 5,111.90 |
Sum = **11,111.90**, paid as a single lump sum 3/11/2025 (Cash ledger:
"RPRPV-202511/002 INF ASSET HOLDINGS SDN BHD Payment For Account 11,111.90").
This is the exact match for the `INF - CLAIM OF OFFICE EXPENSES -
RM11,111.90.pdf` supplier-invoice file — **one PDF, three GL accounts, one
credit leg**. Not a 1:1 bill.

No standalone AP/creditors ledger is printed; every credit above is booked
directly against **310-000 CASH AT BANK** at time of payment (see full p.1-2
cash ledger for the RPRPV/RPROR references cross-linking each line above to
its cash-disbursement date).

---

## (c) Supplier-bill eval manifest (filenames × GL cross-reference)

All 20 files under `RPR - Supplier Invoice/` (listed, not opened):

```csv
file_path,vendor,filename_amount,apparent_month,expected_gl_account,ambiguous,note
BRIGHPATH - Cost of Good Sold Invoice 2025/BINV202510-018 - BRIGHTPATH - RM435,000.000.pdf,BRIGHTPATH CONSULTANCY SDN BHD,435000.00,2025-10,610-000 PURCHASE,YES,"filename RM435,000.00 vs GL/cash-paid RM435,560.00 (PI-00002) — 560 variance unexplained from filename alone"
BRIGHPATH - Cost of Good Sold Invoice 2025/BINV202511-014 - BRIGHTPATH - RM45,000.000.pdf,BRIGHTPATH CONSULTANCY SDN BHD,45000.00,2025-11,610-000 PURCHASE,NO,"matches GL PI-00001 45,000.00 exactly"
BUSYSTREET - Cost of Good Sold Invoice - RM29,200.pdf,BUSYSTREET CONSULTANCY SDN BHD,29200.00,unclear from filename (GL: Dec),610-000 PURCHASE,NO,"matches GL PI-00003 29,200.00 exactly (3/12/2025)"
INF - CLAIM OF OFFICE EXPENSES - RM11,111.90.pdf,INF ASSET HOLDINGS SDN BHD,11111.90,unclear from filename (source DN 5/9; paid 3/11),"900-R01 (240.00) + 900-T03 (5760.00) + 900-W01 (5111.90)",YES,"one bill, THREE expense accounts + one credit — not a single-line code; do not use as the simple 1-bill demo case without handling the split"
KOK LIONG - SECRETARY FEE - RM1,190.00.pdf,KOK LIONG ACCOUNTANCY & MANAGEMENT SERVICES,1190.00,unclear from filename (GL: 25/9),900-S04 SECRETARY FEE,NO,"matches GL ref 202509230 exactly; NB two other KOK LIONG secretary-fee postings exist in GL (RM2,600 Feb — filed as a Journal Voucher not a Supplier Invoice; RM2,245.40 Dec strike-off fee — no file located in either folder listed)"
PKL - Cost of Good Sold Invoice 2025/PKLG-2505-005 _ PKL GROUP SDN BHD _ RM389,930.00.pdf,PKL GROUP SDN BHD,389930.00,2025-05,610-000 PURCHASE,NO,"matches GL PKLG-2505-005 exactly"
PKL - Cost of Good Sold Invoice 2025/PKLG-2507-003 _ PKL GROUP SDN BHD _ RM200,500.00.pdf,PKL GROUP SDN BHD,200500.00,2025-07,610-000 PURCHASE,NO,"matches GL PKLG-2507-003 exactly"
PKL - Cost of Good Sold Invoice 2025/PKLG-2508-001 _ PKL GROUP SDN BHD - RM206,946.31.pdf,PKL GROUP SDN BHD,206946.31,2025-08,610-000 PURCHASE,NO,"matches GL PKLG-2508-001 exactly"
RPA - Accounting Fee Invoice 2025/2504 - INV250425 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-04,900-A01 ACCOUNTING FEE,NO,"matches GL INV2504/25 exactly"
RPA - Accounting Fee Invoice 2025/2505 - INV250522 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-05,900-A01 ACCOUNTING FEE,NO,"matches GL INV2505/22 exactly"
RPA - Accounting Fee Invoice 2025/2506 - INV250616 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-06,900-A01 ACCOUNTING FEE,NO,"matches GL INV2506/16 exactly"
RPA - Accounting Fee Invoice 2025/2507 - INV250714 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-07,900-A01 ACCOUNTING FEE,YES,"filename RM500 vs GL-booked RM5,000.00 (INV2507/14, ""accounting fee & payroll services"") — 10x mismatch, first of a 6-invoice run with this pattern"
RPA - Accounting Fee Invoice 2025/2508 - INV250810 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-08,900-A01 ACCOUNTING FEE,YES,"filename RM500 vs GL-booked RM5,000.00 (INV2508/10) — same 10x pattern"
RPA - Accounting Fee Invoice 2025/2509 - INV250910 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-09,900-A01 ACCOUNTING FEE,YES,"filename RM500 vs GL-booked RM5,000.00 (INV2509/10) — same 10x pattern"
RPA - Accounting Fee Invoice 2025/2510 - INV251010 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-10,900-A01 ACCOUNTING FEE,YES,"filename RM500 vs GL-booked RM5,000.00 (INV2510/10) — same 10x pattern"
RPA - Accounting Fee Invoice 2025/2511 - INV251110 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-11,900-A01 ACCOUNTING FEE,YES,"filename RM500 vs GL-booked RM5,000.00 (INV2511/10) — same 10x pattern"
RPA - Accounting Fee Invoice 2025/2512 - INV251201- ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD,500.00,2025-12,900-A01 ACCOUNTING FEE,YES,"filename RM500 vs GL-booked RM5,000.00 (INV2512-01) — same 10x pattern"
```

(20 files listed — 2 Brightpath, 1 Busystreet, 1 INF, 1 Kok Liong, 3 PKL, 9 RPA
Accounting Fee, plus 3 folder-container entries not counted as files.)

**Best single-bill demo candidates (unambiguous, 1 file : 1 GL account : 1
amount):** the RM45,000.00 BRIGHTPATH bill (BINV202511-014), the RM29,200.00
BUSYSTREET bill, the RM1,190.00 KOK LIONG bill, or any of the three PKL COGS
bills. **Avoid** the INF office-expenses claim (3-way split) and the Apr–Jun
RPA invoices are clean 1:1 (RM500=RM500) but the Jul–Dec RPA invoices are
**not** (filename says RM500, book says RM5,000) — pick Apr–Jun if a
RPA-accounting-fee example is wanted, or explicitly design the eval to handle
the amount mismatch if picking Jul–Dec.

---

## (d) FY span, year-end, SST, and oddities

**FY span:** first transaction 10/2/2025 (`BEING INCORPORATED ALLOTMENT
SHARE`, GL p.1) — this is the incorporation date. Last transaction in the
General Ledger: 8/12/2025 (retained-earnings closing entry + director's
debt-waiver JV, GL p.4/p.7); the Cash ledger's last line is 5/12/2025 (Maybank
charge draining cash to 0.00). Both TB and P&L are captioned "for the period
10/02/2025 to 08/12/2025" — this is a **report run-date cut-off, not a stated
fiscal year-end**. No document in the three read explicitly states the
company's financial year-end. Inferred from context (folder name "YA2025",
continuous postings through December, incorporation in Feb 2025): the first
financial period most likely runs **10/2/2025 → 31/12/2025** (a ~10.7-month
first accounting period aligned to calendar year), but this is an **inference,
not a stated fact** — flag for the contract author to confirm with the owner
if the exact FYE matters to Slice 6's design.

**SST:** does **not** appear as separate GL lines. The GL report layout itself
carries a `Tax` column (header row: "Ref. 1/2 | Tax | Bal. (MYR)" on every
page) but it is **blank on every single posted line** across all 7 pages —
no line shows a tax code or amount. No SST/output-tax/input-tax account exists
anywhere in the 15-line TB or the fuller GL account list. This is consistent
with SST being **either not applicable (no separate tax) or already absorbed
gross** into the invoice amounts as posted — there is no way from these three
documents to distinguish "not registered/exempt" from "gross-absorbed"; the
report format has a tax column ready to be populated but it is empty
throughout. **This directly validates ruling S6-R7** (whichever framing it
uses: assume no separate SST ledger line exists in this corpus; the contract
should not expect the write-floor to split out an SST leg for these bills).

**Oddities the contract author must know:**

1. **Related-party web.** (i) `350-002 AMOUNT OWING FROM ROME GROUP SDN BHD`
   — a receivable that exactly mirrors the RM1,000 share-capital allotment
   (booked same JV, 10/2/2025), settled by a RM1,000 cash receipt from ROME
   GROUP SDN BHD on 28/11/2025 — i.e., **the founding shareholder's paid-up
   capital sat as an intercompany receivable for ~9.5 months** before cash
   actually moved. (ii) `420-001 AMOUNT OWING TO DIRECTOR - TAN LAKE WEI` — the
   director personally paid the RM2,600 company-formation secretary fee
   (booked via Journal Voucher, not a cash payment), the company later repaid
   only RM379.85 in cash (4/12/2025) and the director **waived** the remaining
   RM2,220.15 (booked 8/12/2025 as `530-000 OTHER INCOME` — "being record for
   waiver of debt by the director"). This is the entire content of Other
   Income for the period. (iii) `420-002 AMOUNT OWING TO IWIFI GROUP SDN BHD`
   — an unsecured RM290,000 bridging loan drawn in three tranches
   (3/9, 12/9, 7/10/2025) and repaid in one lump sum on 14/10/2025 — a
   related/group entity funding a working-capital gap between COGS payments
   going out and sales collections coming in.

2. **The office-expense claim is a split-coded bill, not a simple bill.** See
   (b)/(c) above — one INF ASSET HOLDINGS invoice (RM11,111.90, sourced from
   debit note DN-2509001) books to three different expense accounts
   (water-purifier rental, toll/parking, water & electricity) with one credit
   leg, paid ~2 months after the underlying charge date. If Slice 6 wants a
   "one supplier bill → one balanced draft" demo case, this is the wrong file
   to pick unless the design explicitly supports multi-line debit splits.

3. **INF ASSET HOLDINGS wears two hats** — it is both the RM41,040/month
   office-and-warehouse landlord (recurring, 900-O01) *and* the payee for the
   one-off bundled utilities/toll claim above. **The recurring RM41,040
   monthly rental invoices themselves have no corresponding PDF anywhere in
   `RPR - Supplier Invoice/`** — only the one bundled RM11,111.90 claim is
   present as a file. The single largest recurring operating expense
   (office rental, RM161,120 total, 8.2% of revenue) is therefore **entirely
   un-sourced** in the supplier-invoice corpus provided to this lane.

4. **ROME PUBLIC ADVISORY SDN BHD also wears two hats** — the same vendor
   that issues the monthly accounting-fee invoices (900-A01) also billed
   RM38,000 of August office rent (900-O01, split into a RM25,000 + RM13,000
   payment pair, 2/10 and 9/10/2025). That rental billing has **no
   corresponding file** under `RPA - Accounting Fee Invoice 2025/` (which
   contains only the 9 monthly accounting-fee PDFs) — another vendor/expense
   combination not represented by any file in the corpus.

5. **Share-capital JV is barely a "bill" at all.** `RPRJV202502002 - SHARE
   CAPITAL - RM1,000.pdf` lives under `RPR - Journal Voucher/`, not `RPR -
   Supplier Invoice/` — it's a pure equity/related-party JV (see oddity 1(i)),
   not a purchase/expense document, and was excluded from the eval manifest
   in (c) on that basis.

6. **The AP/Trade-Creditors control account (400-000) doesn't foot cleanly.**
   The GL's own reconciliation footer (p.7) states Trade Creditors =
   RM1,353,183.61 (added equally to both debit and credit columns to balance
   the report), but summing the visible on-account expense/COGS postings that
   plausibly ran through creditors does not obviously reconcile to that exact
   figure from the pages read — the underlying AP sub-ledger detail is not
   part of this export. Treat 400-000/300-000 as **control-account plugs**,
   not postable GL codes, for Slice 6 purposes.

7. **150-000 RETAINED EARNING is on the GL but missing from the TB.** The
   Trial Balance (a 15-line, P&L-plus-share-capital report) omits the closing
   RE entry (RM1,000 debit/deficit) that the GL and P&L both show — a
   TB/GL inconsistency in the source system's own reports, not a Slice-6
   design choice.

8. Company is loss-making in its first (partial) period: NET PROFIT/(LOSS)
   **(RM1,000.00)** — driven entirely by the RM1,000 share-capital-adjacent
   bookkeeping (see oddity 1(ii)); revenue RM1,973,332.91, gross profit
   RM666,196.60 (33.8% margin), total expenses RM669,416.75 (33.9%).
