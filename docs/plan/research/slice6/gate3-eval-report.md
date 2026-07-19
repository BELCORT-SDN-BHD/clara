# RPR 17-bill replay eval — GATE-3 report (contract §9)

Generated 2026-07-19T18:33:40.758Z. Client RPR = `e2b0f365-09c5-4f6a-953a-52a18c1bcc8a`. AP account = `400-000`.

## Summary

- Bills in manifest: **17**
- Approved entries: **17/17**
- DEBIT-leg reconciliations PASS (§9 rule i): **17/17**
- **AP-balance gate (§9 rule i):** DB-owned AP `400-000` balance (`trial_balance`) = RM 1,350,938.21 vs Σ coded bills = RM 1,350,938.21 → **PASS** (Σ-of-legs cross-check matches)
- Exceptions for owner adjudication: **0**

> §9 adjudication standard: the DOCUMENT content is truth. A document-vs-GL divergence the flow surfaces is a possible human-GL error, surfaced here, and counts FOR document-grounded coding. Clara accrues every bill to `400-000` (S6-R7); the human GL booked direct-to-bank, so the eval binds on each bill's DEBIT leg(s) and the aggregate AP must equal the sum of coded bills.

## Per-bill reconciliation

| Bill | Vendor (disposition) | Inv# (captured) | Tier | Clara debit legs | GL expected | Debit verdict | Post date (vs inv) | Outcome |
|---|---|---|---|---|---|---|---|---|
| BINV202510-018 - BRIGHTPATH - RM435,000.000.pdf | BRIGHTPATH CONSULTANCY SDN.  (new) | BINV202510-018 | model_read | 610-000 435,560.00 | 610-000 435,560.00 | PASS | 2025-10-14 (2025-10-14) PASS | approved |
| BINV202511-014 - BRIGHTPATH - RM45,000.000.pdf | BRIGHTPATH CONSULTANCY SDN.  (registration_match) | BINV202511-014 | model_read | 610-000 45,000.00 | 610-000 45,000.00 | PASS | 2025-11-14 (2025-11-14) PASS | approved |
| BUSYSTREET - Cost of Good Sold Invoice - RM29,200.pdf | BUSYSTREET CONSULTANCY SDN B (new) | IV-2512-001 | model_read | 610-000 29,200.00 | 610-000 29,200.00 | PASS | 2025-12-03 (2025-12-03) PASS | approved |
| INF - CLAIM OF OFFICE EXPENSES - RM11,111.90.pdf | INF ASSET HOLDINGS SDN. BHD. (new) | DN-2509001 (styled Debit Note, not Invoice) | model_read | 900-R01 240.00<br>900-T03 5,760.00<br>900-W01 5,111.90 | 900-R01 240.00<br>900-T03 5,760.00<br>900-W01 5,111.90 | PASS (3-leg) | 2025-09-05 (2025-09-05) PASS | approved |
| KOK LIONG - SECRETARY FEE - RM1,190.00.pdf | KOK LIONG ACCOUNTANCY & MANA (new) | 202509230 | model_read | 900-S04 1,190.00 | 900-S04 1,190.00 | PASS | 2025-09-25 (2025-09-25) PASS | approved |
| PKLG-2505-005 _ PKL GROUP SDN BHD _ RM389,930.00.pdf | PKL GROUP SDN BHD (new) | PKLG-2505-005 | model_read | 610-000 389,930.00 | 610-000 389,930.00 | PASS | 2025-05-30 (2025-05-30) PASS | approved |
| PKLG-2507-003 _ PKL GROUP SDN BHD _ RM200,500.00.pdf | PKL GROUP SDN BHD (registration_match) | PKLG-2507-003 | model_read | 610-000 200,500.00 | 610-000 200,500.00 | PASS | 2025-07-04 (2025-07-04) PASS | approved |
| PKLG-2508-001 _ PKL GROUP SDN BHD - RM206,946.31.pdf | PKL GROUP SDN BHD (registration_match) | PKLG-2508-001 | model_read | 610-000 206,946.31 | 610-000 206,946.31 | PASS | 2025-08-05 (2025-08-05) PASS | approved |
| 2504 - INV250425 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (new) | INV2504/25 | model_read | 900-A01 500.00 | 900-A01 500.00 | PASS | 2025-04-30 (2025-04-30) PASS | approved |
| 2505 - INV250522 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2505/22 | model_read | 900-A01 500.00 | 900-A01 500.00 | PASS | 2025-05-31 (2025-05-31) PASS | approved |
| 2506 - INV250616 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2506/16 | model_read | 900-A01 500.00 | 900-A01 500.00 | PASS | 2025-06-10 (2025-06-10) PASS | approved |
| 2507 - INV250714 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2507/14 | model_read | 900-A01 5,000.00 | 900-A01 5,000.00 | PASS | 2025-07-15 (2025-07-15) PASS | approved |
| 2508 - INV250810 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2508/10 | model_read | 900-A01 5,000.00 | 900-A01 5,000.00 | PASS | 2025-08-13 (2025-08-13) PASS | approved |
| 2509 - INV250910 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2509/10 | model_read | 900-A01 5,000.00 | 900-A01 5,000.00 | PASS | 2025-09-17 (2025-09-17) PASS | approved |
| 2510 - INV251010 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2510/10 | model_read | 900-A01 5,000.00 | 900-A01 5,000.00 | PASS | 2025-10-13 (2025-10-13) PASS | approved |
| 2511 - INV251110 - ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2511/10 | model_read | 900-A01 5,000.00 | 900-A01 5,000.00 | PASS | 2025-11-13 (2025-11-13) PASS | approved |
| 2512 - INV251201- ROME PUBLIC ADVISORY SB - RM500.pdf | ROME PUBLIC ADVISORY SDN BHD (registration_match) | INV2512/01 | model_read | 900-A01 5,000.00 | 900-A01 5,000.00 | PASS | 2025-12-02 (2025-12-02) PASS | approved |

## AP-balance gate detail

Clara books every bill `Dr expense / Cr 400-000` with the vendor as counterparty (S6-R7). There is no per-bill AP in the human GL, so the gate is the aggregate AP. **The DB owns the number:** the authoritative AP balance is read straight from `clara.trial_balance(RPR)` (RLS-scoped, sums approved entries in SQL — 0004 "the DB owns every number"), not computed in the driver.

- **DB-owned AP `400-000` balance (`trial_balance`, credit − debit) = RM 1,350,938.21**  ← authoritative
- Σ pdf_total of approved bills = **RM 1,350,938.21**
- **Verdict: PASS — the DB's AP balance equals the sum of coded bills**
- Secondary cross-check — Σ `400-000` credit legs the driver summed from approved entries = RM 1,350,938.21 → **matches the DB**

## Manifest nuances checked

- **INF debit note**: ONE draft, THREE debit legs (900-R01 240.00 + 900-T03 5760.00 + 900-W01 5111.90 = 11,111.90) — recoverable only from backup pages 2–7 (§9 iii / S6-R11).
- **KOK LIONG**: no company registration on the bill face (MIA firm no. only) → vendor match falls to the NAME lane by design.
- **RPA**: letterhead carries an "f.k.a LW PUBLIC ADVISORY" former name (alias awareness).
- RPA Jul–Dec really bill RM5,000 and BRIGHTPATH BINV202510-018 really totals RM435,560.00 — filename figures are stale; PDF totals match the GL.
