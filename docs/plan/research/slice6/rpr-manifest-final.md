# RPR supplier-bill eval manifest — FINALIZED from document content

Every PDF under `RPR - Supplier Invoice/` (including the BRIGHPATH/PKL/RPA
subfolders) was opened and read in full with the Read tool. **17 actual invoice
files** exist in this tree (the "20 files" figure some earlier notes use counts
the 3 containing sub-folders as rows too — there are only 17 real PDFs: 2
Brightpath, 1 Busystreet, 1 INF, 1 Kok Liong, 3 PKL, 9 RPA). `RPR - Payroll/`
was not touched, per the exclusion law. All content below is read directly off
the PDF pages, not inferred from filenames or the GL — figures in the
`gl_amount`/`gl_account` columns are carried over from the prior GL-derived
manifest (`6-rpr-corpus.md`) purely as a cross-check column, and every one of
them is now **content-confirmed**, not just filename-inferred.

All amounts in Malaysian Ringgit (MYR / RM). No invoice or debit note in this
set shows a **populated** SST/service-tax amount — see the SST note below.

```csv
file,vendor,registration_no,invoice_no,invoice_date,currency,pdf_total,filename_amount,gl_amount,gl_account,discrepancy_note
BRIGHPATH - Cost of Good Sold Invoice 2025/BINV202510-018 - BRIGHTPATH - RM435,000.000.pdf,BRIGHTPATH CONSULTANCY SDN. BHD.,202401047756 (1593602-X),BINV202510-018,14/10/2025,MYR,435560.00,435000.00,435560.00,610-000 PURCHASE (ref PI-00002),"Filename says RM435,000.00; PDF says subtotal excl. tax RM435,560.40, rounding -0.40, Total (Inclusive of Tax) RM435,560.00 -- PDF total matches GL/cash exactly, filename is the wrong figure (understates by RM560)."
BRIGHPATH - Cost of Good Sold Invoice 2025/BINV202511-014 - BRIGHTPATH - RM45,000.000.pdf,BRIGHTPATH CONSULTANCY SDN. BHD.,202401047756 (1593602-X),BINV202511-014,14/11/2025,MYR,45000.00,45000.00,45000.00,610-000 PURCHASE (ref PI-00001),"Exact match, no discrepancy."
BUSYSTREET - Cost of Good Sold Invoice - RM29,200.pdf,BUSYSTREET CONSULTANCY SDN BHD,202101041181 (1441481-X),IV-2512-001,03/12/2025,MYR,29200.00,29200.00,29200.00,610-000 PURCHASE (ref PI-00003),"Exact match, no discrepancy."
INF - CLAIM OF OFFICE EXPENSES - RM11,111.90.pdf,INF ASSET HOLDINGS SDN. BHD.,202501021627 (1623040-K) / TIN C60102450080,DN-2509001 (styled Debit Note, not Invoice),05/09/2025,MYR,11111.90,11111.90,11111.90,900-R01 (240.00) + 900-T03 (5760.00) + 900-W01 (5111.90),"Total matches exactly, but the source document is a 4-line debit note (2x monthly electricity + 2x monthly combined 'parking fee & Coway rental'), not natively split 3 ways. The 3-way category split is only recoverable from the two ACE Corporation (M) SDN BHD backup invoices attached as pages 2-3 (INV2507017 and INV2508017), which each itemise Coway rental RM120 + 8x named-staff TNG parking RM360 = RM3,000. Confirmed: Coway 120+120=RM240; parking 2,880+2,880=RM5,760; electricity (2 TNB bills, pages 4-7) 2,873.10+2,238.80=RM5,111.90. Sum 240+5,760+5,111.90=RM11,111.90 -- three-way split and grand total both confirmed."
KOK LIONG - SECRETARY FEE - RM1,190.00.pdf,KOK LIONG ACCOUNTANCY & MANAGEMENT SERVICES,MIA firm no. NF 0065 (invoice has no SSN/company-no field; payment note cites biz reg 1045761P for bank-transfer validation only),202509230,25/09/2025,MYR,1190.00,1190.00,1190.00,900-S04 SECRETARY FEE,"Invoice number and date match GL ref 202509230 / 25/9/2025 exactly. Line items: secretary fees 15 Feb-Dec 2025 (RM840.00) + BOI prep/submission via e-Bos (RM300.00) + bank-account-opening docs (RM50.00) = RM1,190.00."
PKL - Cost of Good Sold Invoice 2025/PKLG-2505-005 _ PKL GROUP SDN BHD _ RM389,930.00.pdf,PKL GROUP SDN BHD,202201010448 (1456145K),PKLG-2505-005,30/05/2025,MYR,389930.00,389930.00,389930.00,610-000 PURCHASE,"Exact match, no discrepancy. 4.7% commission for 'DAW' project, 8 units."
PKL - Cost of Good Sold Invoice 2025/PKLG-2507-003 _ PKL GROUP SDN BHD _ RM200,500.00.pdf,PKL GROUP SDN BHD,202201010448 (1456145K),PKLG-2507-003,04/07/2025,MYR,200500.00,200500.00,200500.00,610-000 PURCHASE,"Exact match, no discrepancy. 4.5% commission for 'Dawn' project, 5 units."
PKL - Cost of Good Sold Invoice 2025/PKLG-2508-001 _ PKL GROUP SDN BHD - RM206,946.31.pdf,PKL GROUP SDN BHD,202201010448 (1456145K),PKLG-2508-001,05/08/2025,MYR,206946.31,206946.31,206946.31,610-000 PURCHASE,"Exact match, no discrepancy. 4.5% commission for Emerald 9 Residence, 12 units."
RPA - Accounting Fee Invoice 2025/2504 - INV250425 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2504/25,30/04/2025,MYR,500.00,500.00,500.00,900-A01 ACCOUNTING FEE,"Exact match. 'Being accounting fee...for the writing up for Apr 25'."
RPA - Accounting Fee Invoice 2025/2505 - INV250522 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2505/22,31/05/2025,MYR,500.00,500.00,500.00,900-A01 ACCOUNTING FEE,"Exact match."
RPA - Accounting Fee Invoice 2025/2506 - INV250616 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2506/16,10/06/2025,MYR,500.00,500.00,500.00,900-A01 ACCOUNTING FEE,"Exact match."
RPA - Accounting Fee Invoice 2025/2507 - INV250714 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2507/14,15/07/2025,MYR,5000.00,500.00,5000.00,900-A01 ACCOUNTING FEE,"Filename says RM500 but the PDF itself prints Total (RM) 5,000.00 and 'RINGGIT MALAYSIA: FIVE THOUSAND ONLY' -- confirmed by both the numeral and the words-in-full line, not a scan/OCR artifact. Description text also changed from Apr-Jun's plain 'accounting fee' to 'accounting fee and payroll services in connection with the writing up for the month Jul 25', explaining the 10x step-up. PDF matches GL; filename is stale/wrong."
RPA - Accounting Fee Invoice 2025/2508 - INV250810 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2508/10,13/08/2025,MYR,5000.00,500.00,5000.00,900-A01 ACCOUNTING FEE,"Same pattern as 2507: PDF total RM5,000.00 ('FIVE THOUSAND ONLY'), filename says RM500. PDF matches GL."
RPA - Accounting Fee Invoice 2025/2509 - INV250910 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2509/10,17/09/2025,MYR,5000.00,500.00,5000.00,900-A01 ACCOUNTING FEE,"Same pattern: PDF total RM5,000.00, filename says RM500. PDF matches GL."
RPA - Accounting Fee Invoice 2025/2510 - INV251010 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2510/10,13/10/2025,MYR,5000.00,500.00,5000.00,900-A01 ACCOUNTING FEE,"Same pattern: PDF total RM5,000.00, filename says RM500. PDF matches GL."
RPA - Accounting Fee Invoice 2025/2511 - INV251110 - ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2511/10,13/11/2025,MYR,5000.00,500.00,5000.00,900-A01 ACCOUNTING FEE,"Same pattern: PDF total RM5,000.00, filename says RM500. PDF matches GL."
RPA - Accounting Fee Invoice 2025/2512 - INV251201- ROME PUBLIC ADVISORY SB - RM500.pdf,ROME PUBLIC ADVISORY SDN BHD (f.k.a LW PUBLIC ADVISORY SDN BHD),201501005365 (1130695-T),INV2512/01,02/12/2025,MYR,5000.00,500.00,5000.00,900-A01 ACCOUNTING FEE,"Same pattern: PDF total RM5,000.00 ('for the writing up for the month Dec 2025'), filename says RM500. PDF matches GL (GL ref shown as INV2512-01, same document)."
```

## Notes on the four items the brief asked to resolve

**1. RPA "Accounting Fee" invoices 2507-2512 (RM500-filename vs RM5,000-GL).**
Every one of the six PDFs (Jul, Aug, Sep, Oct, Nov, Dec 2025) prints
**Total (RM) 5,000.00** and spells it out as **"RINGGIT MALAYSIA: FIVE THOUSAND
ONLY"** — both the numeral and the words-in-full line agree, so this isn't a
scan/rounding artifact. The description line also changed starting with 2507:
Apr-Jun read "*Being accounting fee in connection with the writing up for
[month] 25*" (RM500), while Jul-Dec all read "*Being accounting fee **and
payroll services** in connection with the writing up for the month [month]
25*" (RM5,000) — the scope genuinely grew (payroll services added), which is
the likely real-world reason for the 10x jump. The **filenames are simply
wrong/stale** (someone kept the "RM500" naming pattern from the first three
months when renaming later files); the PDFs and the GL agree with each other.

**2. BRIGHTPATH BINV202510-018 (RM435,000-filename vs RM435,560-GL/cash, ref
PI-00002).** The PDF's own totals block reads: Sub Total (Excluding Tax)
435,560.40; Rounding -0.40; Service Tax (8%) -- (blank/nil); **Total
(Inclusive of Tax) 435,560.00** — and the words-in-full line confirms "Four
Hundred Thirty Five Thousand Five Hundred Sixty Only." The PDF total matches
the GL/cash figure (RM435,560.00) exactly; the filename's RM435,000.00 is the
one that's wrong (off by RM560, roughly the size of one of the seven RM690
line items on the 2-page itemized legal-consultancy bill — items 2-6 are each
exactly RM690.00 for 90 "jobs").

**3. INF ASSET HOLDINGS "CLAIM OF OFFICE EXPENSES" RM11,111.90.** This is
actually a **Debit Note** (DN-2509001, dated 5/9/2025), not an invoice, and it
runs 7 pages because it carries its own backup attachments. Its own 4 line
items are: electricity Jul period (INV 000421012888) RM2,873.10; electricity
Aug period (INV 000197112110) RM2,238.80; "parking fee & Coway rental fee for
Jul'25" RM3,000.00; same for Aug'25 RM3,000.00. The 3-way category split the
brief expected (Coway/parking/electricity) is **not how the debit note itself
is organized** — it only breaks out cleanly once you open the two attached ACE
Corporation (M) SDN BHD backup invoices (pages 2 and 3, INV2507017 and
INV2508017), each of which separately lines out "Coway rental for BO2-B-06"
RM120.00 and 8 named-staff non-reserved parking fees at RM360.00 each
(8 x 360 = 2,880). Doing that decomposition and combining both months:
**Coway = 120 + 120 = RM240.00; staff parking = 2,880 + 2,880 = RM5,760.00;
TNB electricity = 2,873.10 + 2,238.80 = RM5,111.90.** All three figures match
the brief's expectation exactly, and 240 + 5,760 + 5,111.90 = **RM11,111.90**,
the grand total on the debit note. Confirmed, with the caveat that this
requires the backup pages, not just the debit note's own 4 lines.

**4. KOK LIONG RM1,190.00.** Invoice No. **202509230**, dated **25/09/2025** —
matches the GL reference (202509230, 25/9/2025) exactly. Line items: secretary
fees 15 Feb-Dec 2025 (RM840.00) + BOI-info prep/submission via E-Bos
(RM300.00) + bank-account-opening document prep (RM50.00) = RM1,190.00.

## SST / service-tax check across all 17 bills

**No bill in this set shows a populated SST/service-tax amount.** Two of the
BRIGHTPATH invoices (BINV202510-018 and BINV202511-014) have a "Service Tax
(8%)" **line printed in the totals template**, but the amount field is left
blank/dash on both — i.e. the template has an SST slot but nothing was
charged. Every other vendor's invoice (Busystreet, INF, Kok Liong, PKL x3, RPA
x9) has no tax line at all, just a flat Total. This is consistent with the
earlier GL-level finding (`6-rpr-corpus.md` §d) that the General Ledger's own
"Tax" column is blank on every posted line for the whole year — there is no
separate SST ledger anywhere in this book.

## Surprises / things worth flagging

- File-count mismatch: the brief said 20 files; only **17** actual PDFs exist
  under `RPR - Supplier Invoice/` (some prior counting included the 3
  container sub-folders as if they were files).
- No unreadable scans, no OCR ambiguity, no unexpected currencies — every
  amount is legible as both a printed numeral and a words-in-full line
  ("RINGGIT MALAYSIA: ..."), which is how the two "wrong filename" cases
  (RPA 2507-2512, BRIGHTPATH 435k) could be confirmed with certainty rather
  than guessed.
- The INF debit note is a genuine multi-page bundle (7 pages: the debit note
  + 2 full ACE Corporation invoices + 2 full multi-page TNB bills), not a
  single-page bill like every other file in the set — worth remembering if
  a page-count or "single invoice page" assumption ever gets baked into the
  ingestion pipeline.
- KOK LIONG's invoice has no company-registration/SSN field printed on the
  face of the bill itself (only an MIA firm number, "NF 0065") — the "biz
  reg 1045761P" only appears in the payment/bank-transfer instructions, not
  as a formal vendor registration number the way every other vendor prints
  one on its letterhead.
