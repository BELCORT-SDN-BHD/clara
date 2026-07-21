# Lane F — RPR FY2025 Eval-Corpus Manifest (grounding brief for Wave A2)

**Scope:** Local-file read only, corpus at `C:/Users/zhant/Desktop/Rome Properties YA2025 Files`.
Read: 6 sales-invoice PDFs, 6 journal-voucher PDFs, 4 management-account PDFs (TB, P&L, BS, GL).
**NOT opened (hard boundary, listed by name only):** the entire `RPR - Payroll/` subtree
(consent-excluded; contains `RPR - Salary Slip/Chew Yue Ann - IC Copy.pdf`) and
`RPR_Consent_Evidence_Document.pdf` (already ingested live). `.xlsx`/`.xlsm` files cannot be
read by the tool — listed as unparsed at the end.

**Entity:** ROME PROPERTIES SDN BHD, SSM **202501005621 (1607035-V)**, Level 6, BO2-B, Menara 3,
Ace Tower, 59200 W.P. Kuala Lumpur. Incorporated ~Feb 2025 (first ledger date 10/2/2025).
Bank: Maybank 5144-8700-1867. Business = **property-agency commission income** (brokerage on unit sales).

---

## HEADLINE ANSWER FOR THE OPEN SST-SPLIT DECISION

**ZERO eval sales invoices carry any tax.** All six invoices are pure commission invoices where
`Total (MYR) = Σ(commission line amounts)`; there is **no SST / service-tax line, no tax rate, no
tax subtotal**, and the GL revenue postings have a **blank Tax column**. RPR prints **no SST
registration number** (only its SSM company number). No output-tax / SST-payable account exists
anywhere in the TB, P&L, Balance Sheet, or GL. **The SST-split code path will not be exercised by
this corpus.** (Edge-case flag, not a booked fact: real-estate agency commission is a taxable Group-G
service and RPR's RM1.97M turnover is above the RM500k service-tax threshold, so an SST-registered
real agent *would* charge 8% — but as-built, these documents show none. Treat as a compliance-visibility
note, not a parsing requirement.)

---

## 1. SALES-INVOICE MANIFEST (`RPR - Sales Invoice/`)

All six: **Currency = MYR**, **Terms = C.O.D.**, **Tax = none (net = gross)**, **no MyInvois markers**
(no QR code, no e-invoice UUID / long-ID, no "validated" text, no submission timestamp — plain
pre-e-invoice PDFs, date format DD/MM/YYYY). Seller reg on every face: 202501005621 (1607035-V).
**No customer registration number or TIN is printed on any invoice** (only the bill-to name + address).

| Invoice No (face) | File basename | Issue date | Customer (as printed) | Line desc / campaign | # lines | Pages | Gross (MYR) |
|---|---|---|---|---|---|---|---|
| RPRINV-2504/01 | `RPRINV-250401 - D & DREAM PROPERTIES SB - RM207,974.15.pdf` | 30/04/2025 | **D & DREAM PROPERTIES SDN BHD** | COMMISSION — "4% COMMISSION FOR DAWN" | 6 | 1 | **207,974.15** |
| RPRINV-2505/01 | `RPRINV-250501 - DARE TO DREAM REAL ESTATE SB - RM227,234.45.pdf` | 31/05/2025 | DARE TO DREAM REAL ESTATE SDN BHD | COMMISSION — "4% COMMISSION FOR CROWN" | 7 | 1 | **227,234.45** |
| RPRINV-2506/01 | `RPRINV-250601 - ... RM227,847.91.pdf` | 30/06/2025 | DARE TO DREAM REAL ESTATE SDN BHD | COMMISSION — "5% COMMISSION FOR ONE EQUINE" | 19 | 2 | **227,847.91** |
| RPRINV-2507/01 | `RPRINV-250701 - ... RM235,166.26.pdf` | 31/07/2025 | DARE TO DREAM REAL ESTATE SDN BHD | COMMISSION — "4.5% COMMISSION FOR AVANTRO" | 9 | 2 | **235,166.26** |
| RPRINV-2508/01 | `RPRINV-250801 - ... RM599,530.15.pdf` | 31/08/2025 | DARE TO DREAM REAL ESTATE SDN BHD | COMMISSION — "5% COMMISSION FOR ONE EQUINE" | 51 | 5 | **599,530.15** |
| RPRINV-2509/01 | `RPRINV-250901 - ... RM475,579.99.pdf` | 30/09/2025 | DARE TO DREAM REAL ESTATE SDN BHD | COMMISSION — "5% COMMISSION FOR ONE EQUINE" | 39 | 4 | **475,579.99** |

**Σ gross of all 6 sales invoices = RM 1,973,332.91** (207,974.15 + 227,234.45 + 227,847.91 +
235,166.26 + 599,530.15 + 475,579.99).

Line structure (all invoices identical shape): each line = `COMMISSION | 1.00 UNIT | <price/unit> |
Amount`, with a 3-line description per unit — `Unit No: <code>` / `Unit Net Price: RM <n>` /
`Commission: RM <n>`. The header band names the campaign + rate ("4% COMMISSION FOR DAWN", "5% …
ONE EQUINE", "4.5% … AVANTRO", etc.). Commission % is stated as a label, not a computed tax field.
Minor branding note: the 2504/2505/2506 PDFs use one ROME logo, 2507/2508/2509 a slightly different
logo — immaterial.

---

## 2. CUSTOMER-IDENTITY QUESTION (D & DREAM vs DARE TO DREAM)

**Evidence on the faces:**
- Both names carry the **identical bill-to address**: *G-22, Boulevard 28, Jalan Pandan Perdana 3/10,
  Pandan Perdana, 55300 Kuala Lumpur.*
- **Neither invoice prints a customer SSM number or TIN** — the one datum that could settle it is
  absent on every face.
- Invoice numbering is **continuous** across the name change (…2504/01 → 2505/01 → 2506/01 …).
- The GL treats them as **one revenue stream / one debtor**: `500-000 REVENUE` (GL p.4) books
  the 30/4 posting under "D & DREAM PROPERTIES SDN BHD" and 31/5-onward under "DARE TO DREAM REAL
  ESTATE SDN BHD" into the same account; `310-000 CASH AT BANK` (GL p.1) shows the April
  D&DREAM receipt (207,974.15) collected **10/6/2025 in the same batch** as the May DARE-TO-DREAM
  receipt (227,234.45); the trade-debtor control `300-000 TRADE DEBTORS` is a single control (GL p.7
  reconciliation), not split per name.
- The Apr/May supporting workbook is itself named `… TO DARE TO DREAM AND D&D - APR & MAY 2025.xlsx`,
  i.e. the preparer bundles "DARE TO DREAM" and "D&D" together.

**Reading:** The weight of evidence (same registered unit-address, continuous invoice series, single
debtor/revenue treatment, the preparer's own "DARE TO DREAM AND D&D" bundling) points to **one
customer whose billing name was corrected from "D & DREAM PROPERTIES SDN BHD" (April, first invoice)
to "DARE TO DREAM REAL ESTATE SDN BHD" (May onward)** — most likely a wrong/provisional name on the
first invoice. **UNVERIFIED as legally the same entity** because no customer SSM/TIN is printed on
either face; two distinct companies at one serviced address cannot be excluded from the documents
alone. → Keep as a first-class **AR customer-attribution eval case**: the pipeline must decide whether
these two printed names collapse to a single AR customer (correct expected answer per the books: **yes,
one customer**).

---

## 3. MANAGEMENT ACCOUNTS (`RPR - Management Accounts/`)

Period on every report: **10/02/2025 → 08/12/2025** (a first, short YA2025). All "Certified true &
correct — Company Director Tan Lake Wei."

### 3a. Trial Balance (`RPR - Trial Balance  YA2025.pdf`, 1 page — "GL Trial Balance As At 8/12/2025")
Lists **only non-zero-balance accounts** (all of which are P&L + share capital — see 3d for why):

| Acc | Name | Debit | Credit |
|---|---|---|---|
| 100-000 | SHARE CAPITAL | | 1,000.00 |
| 500-000 | REVENUE | | **1,973,332.91** |
| 530-000 | OTHER INCOME | | 2,220.15 |
| 610-000 | PURCHASE (COGS) | 1,307,136.31 | |
| 900-A01 | ACCOUNTING FEE | 31,500.00 | |
| 900-B01 | BANK CHARGES | 12.40 | |
| 900-E01 | EPF – EMPLOYER | 52,200.00 | |
| 900-E02 | EIS – EMPLOYER | 249.90 | |
| 900-O01 | OFFICE & WAREHOUSE RENTAL | 161,120.00 | |
| 900-R01 | RENTAL OF WATER PURIFYIER | 240.00 | |
| 900-S01 | SALARIES | 405,000.00 | |
| 900-S02 | SOCSO – EMPLOYER | 2,187.15 | |
| 900-S04 | SECRETARY FEE | 6,035.40 | |
| 900-T03 | TOLL, PARKING & FINED | 5,760.00 | |
| 900-W01 | WATER & ELECTRICITY | 5,111.90 | |
| | **Grand total** | **1,976,553.06** | **1,976,553.06** |

### 3b. Profit & Loss (`RPR - Profit & Loss Statement YA2025.pdf`, 1 page — "Statement Of Comprehensive Income")
- **Revenue 500-000 = 1,973,332.91 (100.0%)** — the single revenue account (commission income).
- COGS: **Purchase 610-000 = 1,307,136.31 (66.2%)** → **Gross profit = 666,196.60 (33.8%)**.
- Other income 530-000 = 2,220.15 (waiver of director debt).
- Expenses total = 669,416.75 (Salaries 405,000; Office & warehouse rental 161,120; EPF-er 52,200;
  Accounting fee 31,500; Secretary fee 6,035.40; Water & electricity 5,111.90; Toll/parking 5,760;
  SOCSO-er 2,187.15; Water purifier 240; EIS-er 249.90; Bank charges 12.40).
- **Net loss = (1,000.00); Retained earning c/f = (1,000.00).**

### 3c. Balance Sheet (`RPR - Balance Sheet  YA2025.pdf`, 1 page — "Statement Of Financial Position As At 08/12/2025")
**Equity section only — the statement is effectively a stub:**
- 100-000 SHARE CAPITAL = 1,000.00
- Retained earning / this-year loss = (1,000.00)
- Net equity = **0.00**. **No asset section, no liability section printed** → **total assets and total
  liabilities are not presented (both net to zero at YE).** There is **no YE trade-receivable, no YE
  trade-payable, no YE bank balance** on the face.

### 3d. General Ledger (`RPR - General Ledger YA2025.pdf`, **7 pages**, "GL Local - Ledger - Detail", 10/2/2025→8/12/2025)
This is a **full double-entry ledger** (unlike the P&L-only TB/BS). Accounts present and their **YE
balance**:

- **100-000 SHARE CAPITAL** (p.1): credited 1,000 via RPRJV-202502/002 → bal (1,000.00).
- **150-000 RETAINED EARNING** (p.1): 1,000.
- **310-000 CASH AT BANK** (p.1-2): total turnover **2,264,332.91 both sides → YE balance 0.00**
  (every ringgit in was paid out). Customer receipts: 10/6 D&DREAM 207,974.15 + DARE-TO-DREAM
  227,234.45; 3/7 227,847.91; 5/8 235,166.26; 7/10 1,075,110.14 (= Aug 599,530.15 + Sep 475,579.99).
  **Σ customer receipts = 1,973,332.91 = revenue** (AR fully collected by 7/10/2025).
- **350-002 AMOUNT OWING FROM ROME GROUP SDN BHD** (p.2): nets to 0.
- **410-001/003/004/005/006** WAGES/EPF/SOCSO/EIS/PCB **ACCRUED** (p.2-4): each accrual raised by a
  salary JV and cleared by the payment run → **all net to 0** at YE.
- **420-001 AMOUNT OWING TO DIRECTOR – TAN LAKE WEI** (p.4): 2,600 → part repaid 379.85 →
  **2,220.15 waived 8/12 (RPRJV-202512/001 → 530-000 Other income)** → 0.
- **420-002 AMOUNT OWING TO IWIFI GROUP SDN BHD** (p.4): drawn 150k+40k+100k, repaid 290k → 0.
- **500-000 REVENUE** (p.4): six postings 30/4, 31/5, 30/6, 31/7, 31/8, 30/9 — **exactly the six
  sales invoices, same amounts** → YE (1,973,332.91). **Tax column blank on all.**
- **530-000 OTHER INCOME** (p.4): 2,220.15 (director-debt waiver).
- **610-000 PURCHASE / COGS** (p.4-5): PKL Group 389,930 + 200,500 + 206,946.31; BrightPath 435,560 +
  45,000; Busystreet 29,200 → **1,307,136.31**.
- **900-xxx** expenses (p.5-7): match the P&L. Secretary fee 900-S04 (p.7) = 2,600 (JV formation) +
  1,190 (Kok Liong, 25/9) + 2,245.40 (Kok Liong, 2/12 — **"application for STRIKE OFF"**) = 6,035.40.

**GL reconciliation footer (p.7):** `Total 4,995,123.02 / 4,994,123.02 → 1,000.00`; then
`Add 300-000 TRADE DEBTORS 1,973,332.91 / 1,973,332.91` and `Add 400-000 TRADE CREDITORS
1,353,183.61 / 1,353,183.61`; grand `8,320,639.54 = 8,320,639.54`. So the **AR control (300-000)
turnover = 1,973,332.91** and **AP control (400-000 TRADE CREDITORS) turnover = 1,353,183.61**, and
**both control accounts net to 0.00 at YE** (their detail lines are not printed in this GL, only the
control totals).

**Structural conclusion:** RPR YA2025 is a **first-and-final, winding-up** set (secretary invoice
2/12 explicitly = "the company's application for strike off"). By 8/12/2025 **every balance-sheet
account has been driven to exactly zero** except equity — which is why the TB/BS look P&L-only.

### AP-balance question (RM 1,350,938.21)
**No RPR document shows RM 1,350,938.21.** The closest figures are AP-control (400-000 TRADE
CREDITORS) **turnover RM 1,353,183.61** (nets to 0 at YE) and **PURCHASE/COGS RM 1,307,136.31**.
The RM 1,350,938.21 in the task is the **BELCORT AP-gate number from the CLARA harness (a different
client)** — it does **not** corroborate against RPR. Flag as a likely cross-reference mix-up.

---

## 4. JOURNAL VOUCHERS (`RPR - Journal Voucher/`, 6 PDFs, 1 page each)

Header on all: ROME PROPERTIES SDN BHD 202501005621 (1607035-V); "computer generated, no signature."

| JV No | Date | Dr account(s) | Cr account(s) | Total | Narrative |
|---|---|---|---|---|---|
| **RPRJV-202502/001** | 4/2/2025 | 900-S04 SECRETARY FEE 2,600.00 | 420-001 AMOUNT OWING TO DIRECTOR – TAN LAKE WEI 2,600.00 | 2,600.00 | Pay-on-behalf expense claim for Tan Lake Wei (Jeff); Kok Liong secretary fee for company formation |
| **RPRJV-202502/002** | 10/2/2025 | 350-002 AMOUNT OWING FROM ROME GROUP SDN BHD 1,000.00 | 100-000 SHARE CAPITAL 1,000.00 | 1,000.00 | Incorporated allotment share |
| **RPRJV-202507/001** | 31/7/2025 | 900-S01 Salaries 60,000; 900-E01 EPF-er 7,800; 900-S02 SOCSO-er 312.45; 900-E02 EIS-er 35.70 | 410-001 Wages accr 42,987.45; 410-003 EPF accr 14,400; 410-004 SOCSO accr 401.70; 410-005 EIS accr 71.40; 410-006 PCB accr 10,287.60 | **68,148.15** | Accrue salary — July 2025 |
| **RPRJV-202508/001** | 31/8/2025 | 900-S01 115,000; 900-E01 14,800; 900-S02 624.90; 900-E02 71.40 | 410-001 82,774.90; 410-003 27,450; 410-004 803.40; 410-005 142.80; 410-006 19,325.20 | **130,496.30** | Accrue salary — August 2025 |
| **RPRJV-202509/001** | 30/9/2025 | (identical split to Aug) | (identical split to Aug) | **130,496.30** | Accrue salary — September 2025 |
| **RPRJV-202510/001** | 31/10/2025 | (identical split to Aug) | (identical split to Aug) | **130,496.30** | Accrue salary — October 2025 |

Each JV is internally balanced (Dr total = Cr total). The four salary JVs are a **fixed monthly
template** (Aug=Sep=Oct identical; Jul is the partial first month with 3 staff at 60,000 base).

---

## 5. CROSS-CHECKS (all resolved against the GL)

| Check | Result |
|---|---|
| Σ 6 sales invoices vs P&L revenue 500-000 | **EXACT: 1,973,332.91 = 1,973,332.91.** The 6 Apr–Sep invoices are the *entire* year's revenue. |
| Σ sales invoices vs GL 500-000 postings | **EXACT** — six GL revenue lines equal the six invoice totals, same dates. |
| JV `900-S01 SALARIES` (Jul 60k + Aug/Sep/Oct 115k) vs P&L Salaries 405,000 | **EXACT: 405,000 = 405,000.** JV amounts flow straight into P&L staff cost. |
| JV employer statutory vs P&L | **EXACT:** EPF-er 52,200 (7,800+14,800×3); SOCSO-er 2,187.15 (312.45+624.90×3); EIS-er 249.90 (35.70+71.40×3). |
| Revenue outside Apr–Sep in GL? | **NONE.** GL 500-000 has postings only 30/4, 31/5, 30/6, 31/7, 31/8, 30/9. No Oct/Nov/Dec revenue. |
| Salary outside Jul–Oct? | **NONE.** Only 4 salary JVs; company had no staff before July (first salary slips are July, 3 staff) and none accrued Nov/Dec (winding up). |
| Rounding / cents anomalies | (a) **Sen-rounding residuals** posted to `900-B01 BANK CHARGES` on electronic payments: RM0.50 (PKL ×2), RM0.20/0.40 (salary runs), plus RM10 Maybank sweep → 12.40 total. (b) **Filename formatting quirk:** BrightPath supplier files are named `…RM435,000.000.pdf` / `…RM45,000.000.pdf` (three decimals); the GL books BrightPath **435,560.00** and 45,000.00 — the 435,000 filename is rounded/truncated, actual = **435,560.00** (bank paid 435,560 on 14/10). *(BrightPath PDFs are in `RPR - Supplier Invoice/`, out of this lane's read scope; discrepancy noted from filenames + GL only — verify on ingest.)* |

---

## EXPECTED CHART / SEED ADDITIONS FOR WAVE A2 (AR side)

Based strictly on what the RPR books show:

- **AR control account — YES:** `300-000 TRADE DEBTORS` (control; sub-ledger by customer).
- **Revenue — YES:** `500-000 REVENUE` (commission income; single account, no product/tax split).
  Also `530-000 OTHER INCOME` (misc, e.g. debt waiver).
- **SST-payable — NO:** no output-tax/SST-payable account exists; **no eval invoice carries tax**;
  RPR shows no SST registration number. The SST-split path is **not** seeded/exercised by this corpus.
- **Customer master:** one AR customer = **DARE TO DREAM REAL ESTATE SDN BHD**, with **alias "D & DREAM
  PROPERTIES SDN BHD"** (April), address G-22 Boulevard 28, Jalan Pandan Perdana 3/10, 55300 KL — no
  SSM/TIN on file from the invoices.
- Supporting AP/expense accounts already in the books (for full replay): `610-000 PURCHASE`,
  `400-000 TRADE CREDITORS`, `410-00x` accruals, `420-001/002` director/related-party payables,
  `900-xxx` overheads.

## MyInvois relevance for the `structured_parse` XML engine

**None of these six invoices contain any MyInvois artefact** (no QR, no UUID/long-ID, no validation
text, no submission timestamp) — they are the **pre-e-invoice baseline**. This corpus therefore
exercises the *outbound* AR/MyInvois-generation path (Clara would have to *produce* MyInvois XML for
these), **not** the inbound `structured_parse` XML-upload path — there is **no MyInvois XML file in
the corpus** to parse. Wave A2's XML file-upload engine will need **separate MyInvois-XML fixtures**;
these PDFs cannot stand in for them.

## Standing-rules / bounded-auto-POST candidates (grounding, not a decision)

The corpus is unusually regular and makes clean auto-POST fixtures:
- **Monthly commission invoice → one customer, one revenue account, no tax:**
  `DR 300-000 Trade Debtors / CR 500-000 Revenue` (gross = net). Six near-identical instances.
- **Monthly salary accrual JV:** fixed template (`DR 900-S01/E01/S02/E02 → CR 410-001/003/004/005/006`),
  Aug=Sep=Oct byte-identical — an ideal recurring standing-rule + a good "auto-post within tolerance" test.

---

## FILES LISTED BUT NOT OPENED

**Hard-boundary (consent-excluded / already-ingested):**
- `RPR - Payroll/` — entire subtree **NOT opened**, incl. EA forms (RPR001–RPR006), salary slips
  (Jul–Oct), statutory receipts (EPF/SOCSO/EIS/PCB/MyTax), Form e-CP8D, Form e-E, and
  `RPR - Salary Slip/Chew Yue Ann - IC Copy.pdf` (**IC copy — the reason the folder is excluded**).
- `RPR_Consent_Evidence_Document.pdf` — **NOT opened** (already ingested live per harness).

**Unparsed (`.xlsx`/`.xlsm` — tool cannot read; names only):**
- `RPR - Sales Invoice/In Excel File - Document Supporting/` — 4 workbooks:
  `2504 2505 ROME PROPERTIES SDN BHD TO DARE TO DREAM AND D&D - APR & MAY 2025.xlsx`,
  `2506 … JUNE 2025.xlsx`, `2507 … JULY 2025.xlsx`, `2508 2509 … AUG & SEPT 2025.xlsx`.
- Payroll workbooks (inside the excluded subtree): `M2UBiz_StatutoryBody_FileUpload_v17.xlsm`,
  `Payment_Template.xlsx`, `ROME PROPERTIES - SALARY & EA FORM.xlsx`,
  `Salary Listing for the Year 2025.xlsx`, `Salary Summary & Slip.xlsx`.

**Present but out of this lane's read scope (referenced only via the GL):**
`RPR - Bank Statement/` (Apr–Dec 2025 PDFs + scanned originals) and `RPR - Supplier Invoice/`
(BrightPath, PKL Group, Busystreet, INF, Kok Liong, Rome Public Advisory). Supplier amounts above
are taken from the **GL**, not these PDFs.

---

## OPEN QUESTIONS FOR DESIGN

1. **SST-split scope.** Since no eval invoice carries tax, does Wave A2 want a *synthetic*
   SST-bearing sales-invoice fixture to exercise the split at all — or is "tax-free commission
   invoice" the intended default and SST handled only when markers appear? (The eval corpus alone
   gives the split **zero** coverage.)
2. **Should the eval assert the compliance gap?** RPR is above the RM500k service-tax threshold on
   taxable agency commission yet charges no SST. Is that an *expected finding the agent should flag*
   (edge-case visibility) or out of scope for the AR replay?
3. **Customer-identity collapse.** Confirm the expected answer: does "D & DREAM PROPERTIES SDN BHD"
   (Apr) collapse into "DARE TO DREAM REAL ESTATE SDN BHD" as one AR customer? With **no customer
   SSM/TIN on the invoice faces**, what evidence is the attribution allowed to use (address match +
   invoice-series continuity), and what confidence must it clear?
4. **AP-gate figure.** Confirm RM 1,350,938.21 is the BELCORT number, not RPR — and set the RPR AR/AP
   replay targets to **revenue RM 1,973,332.91**, **AP/creditor turnover RM 1,353,183.61**, **COGS
   RM 1,307,136.31**, with **all balance-sheet controls = 0 at YE**.
5. **Zeroed year-end / strike-off.** RPR YA2025 is a winding-up set (every BS account driven to 0;
   strike-off applied Dec 2025). Is the eval expected to reproduce the *interim* AR aging (balances
   outstanding Apr→Oct) or only the *final* zeroed state? The invoice-to-cash timing (e.g. Aug+Sep
   collected together on 7/10) is the interesting AR-loop signal.
6. **MyInvois fixtures.** The `structured_parse` XML-upload engine has **no** XML sample here. Where do
   the MyInvois-XML test fixtures come from, and should these six PDFs double as the *outbound*
   generate-and-validate target?
7. **BrightPath amount discrepancy.** Filename says RM435,000.000 but GL/bank = RM435,560.00 — which
   is canonical for the supplier-invoice eval, and does the 3-decimal filename format break any
   amount parser?
