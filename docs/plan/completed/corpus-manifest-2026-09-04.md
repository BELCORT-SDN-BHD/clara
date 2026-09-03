# The desktop corpus — manifest (FS-11 step 15.2, inventoried 2026-09-04 03:17 MYT)

The checklist says the corpus is "already on the desktop" and the as-run says it is not inventoried
anywhere in the repo. This is the inventory, taken by `find` (names and sizes only; no file opened).

| folder (under `C:\Users\zhant\Desktop\`) | files | what it holds |
|---|---|---|
| `Rome Properties YA2025 Files` | 117 | RPR bank statements (e-statements Apr–Dec 2025 + hardcopy scans Apr–Jul), journal vouchers (Feb, Jul–Oct 2025), management accounts YA2025 (BS · GL · P&L · TB), payroll (EA forms, salary slips Jul–Oct 2025, statutory Jul–Sep 2025) |
| `RS - YA2025` | 87 | ROME SECRETARY: Alliance Bank statements 2510–2603, Maybank statements 2505–2603, management account (BS · GL · P&L), 22 sales invoices (Jun–Dec 2025), 36 supplier invoices (EZSEC) |
| `BEE CREATIVE - Accounts` | 289 | BEE CREATIVE YA2024 (management accounts PDF, HLB statements Jan–Dec 2024, expenses/purchases/sales) + YA2025 (management accounts PDF, a folder, the archived close packet note) |
| `clara-rpr-decrypted` | 9 | the RPR e-statements Apr–Dec 2025, DECRYPTED copies |

## 15.1 · the RPR bank-statement series pick — WITH its measurement

Three candidate series cover Apr–Jul 2025:

| series | files (Apr · May · Jun · Jul) | measurement |
|---|---|---|
| A · e-statements `RPR - Bank Statement/…2025MM.pdf` | 97,256 · 97,265 · 99,808 · 98,553 B | **Apr, May, Jun carry `/Encrypt` (password-protected); Jul does not** — 3 of 4 unreadable by an extractor without the password; ~4 pages each |
| B · hardcopy scans `Scan from ori hardcopy/25MM_…` | 281,146 · 281,146 · 391,036 · 384,588 B | unencrypted; **Apr and May are 1-page scans** (Jun/Jul ~4 pages) — Apr/May incomplete relative to the 4-page e-statements; Apr and May share a byte size but differ by md5 (not duplicates) |
| C · `clara-rpr-decrypted/…2025MM.pdf` | 96,533 · 96,530 · 99,078 · 98,678 B | **unencrypted, all four present, one per month, decrypted copies of A** (sizes within 1 KB of A) |

**Chosen: series C (`clara-rpr-decrypted`).** Why: it is the only series that covers Apr–Jul exactly
once AND is readable — A is encrypted for three of the four months, B's Apr/May scans are single
pages. (Aug–Dec also exist in C; the walk uses Apr–Jul per the checklist's own phrase.)

## 15.2 · the 资料缺失 marks

| gap (checklist :227-229) | corpus probe | mark |
|---|---|---|
| BEE GL/TB for either FY | only `BEE CREATIVE - Management Accounts YA2024.pdf` and `…YA2025.pdf`; no file named ledger/trial-balance in 289 files | **资料缺失** |
| RPR Feb-2025 statements | no `202502` / `2502_` statement in either RPR series (only two Feb journal vouchers) | **资料缺失** |
| RPR Mar-2025 statements | no `202503` / `2503_` statement | **资料缺失** |
| named producer/certifier for RS and RPR | no certificate / engagement / signed-letter file in either folder | **资料缺失** |
