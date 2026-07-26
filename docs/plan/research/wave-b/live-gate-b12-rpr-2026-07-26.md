# B-12 — the RPR incremental lane: the STILL-TO-CAPTURE checklist (2026-07-26)

> ## ⚠️ CORRECTED — one checklist row was WRONG, and the method that produced it was flawed
>
> **Row 1 (900-S04, RM2,600.00) is NOT a gap. It was captured all along.** The
> `RPRJV-202502/001` voucher is already in Clara — document `89e9d362`, filed, with an
> **approved** entry `22cdd90a`: `Dr 900-S04 2,600.00 / Cr 420-001 2,600.00`.
>
> **Why my tie-out missed it.** I filtered the comparison to the certified TB's period,
> `posting_date between 2025-02-10 and 2025-12-08`. **Clara posted the entry at the voucher
> date, 2025-02-04; the client's system posted it at period start, 10/2/2025.** Six days
> apart, on opposite sides of my filter, so the entry was silently excluded and read as
> missing. Re-run with no date bound, `900-S04` is **3,790.00** — which is exactly the
> running balance the client's own GL prints at 25/9/2025 (`202509230  3,790.00`).
>
> **The method lesson, which matters more than the row.** A period-bounded tie-out
> *silently* drops entries that both systems hold but date differently — and boundary
> entries are precisely where two systems disagree. A tie-out must reconcile **by account
> across all dates** and report date differences as their own finding, never let a filter
> turn a difference into an absence. **This is the same failure shape as concluding absence
> from a truncated grep**, which is already recorded in memory as a repeat offence.
>
> **Also corrected: I claimed document intake was DOWN. It was not.** The only document I
> tested with was this one — already ingested — and Supabase returns a duplicate as
> **HTTP 400 wrapping `statusCode: 409`**, which `putCanonical` could not detect, so a
> benign re-upload surfaced as a fatal `storage_error`. Both real bugs, now fixed; but
> "intake is down" was my inference, not a fact. See
> `docs/ops/incident-2026-07-26-intake-storage.md`.
>
> ### The corrected checklist
>
> | account | certified | in Clara (all dates) | still to capture |
> |---|---|---|---|
> | 900-O01 office & warehouse rental | 161,120.00 | — | **161,120.00** |
> | 530-000 other income | 2,220.15 | — | **2,220.15** |
> | 900-S04 secretary fee | 6,035.40 | **3,790.00** | **2,245.40** (2/12/2025 strike-off fee) |
> | 900-B01 bank charges | 12.40 | — | **12.40** |
>
> Eleven accounts still tie to the sen. Four carry gaps, **not five rows** — and every
> remaining gap is a document that is genuinely absent from the supplied corpus.


Pinned: **21 migrations (`0021_counterparty_human_lane`) · runtime v27.**
Client: ROME PROPERTIES SDN BHD (`202501005621 (1607035V)`), 29 approved entries,
2025-02-04 .. 2025-12-03.

---

## 1. What B-12 actually is, and the premise that failed

**WB-R16** says RPR's *"real, unused management accounts close the B-12 incremental
carry-down lane on the live books."* **B-12** itself is defined in the contract as
*"incremental carry-down **resumes the same plan with the 'still to capture' checklist**."*

The **opening-carry-down reading is unsatisfiable on RPR**, on the documents' own evidence:

- RPR was **incorporated in 2025** — the registration number `202501005621` says so.
- The certified trial balance covers **10/2/2025 to 8/12/2025** — the entity's **first**
  accounting period.
- The Statement of Financial Position carries **no prior-year comparative**: share capital
  1,000.00 and this-year loss (1,000.00), nothing else.
- Clara's live books already cover exactly that period.
- **Owner confirmation (2026-07-26): "RPR is greenfield accounting year in 2025, so it's a
  clean start entity."**

So there is nothing to carry *down*. An opening position dated before 2025-02-04 would have to
be **nil**, and re-seeding the share capital would double-count `RPRJV202502002` already posted.
**This supersedes the opening-date half of WB-R29**, which settled the *date* on the assumption
that a carry-down existed. The date was never the problem; the premise was.

**B-12 therefore closes under the contract's own definition** — the still-to-capture checklist —
built from RPR's real, previously-unused management accounts.

## 2. The tie-out: eleven accounts match the certified accounts TO THE SEN

Clara's live books vs the director-certified `RPR - Trial Balance YA2025.pdf`, same period.
Clara has **never seen this document**; it is an independent check of the whole Wave A/A2 loop.

| account | certified | Clara | |
|---|---|---|---|
| 100-000 share capital | 1,000.00 | 1,000.00 | ✅ |
| 500-000 revenue | 1,973,332.91 | 1,973,332.91 | ✅ |
| 610-000 purchases | 1,307,136.31 | 1,307,136.31 | ✅ |
| 900-S01 salaries | 405,000.00 | 405,000.00 | ✅ |
| 900-E01 EPF — employer | 52,200.00 | 52,200.00 | ✅ |
| 900-E02 EIS — employer | 249.90 | 249.90 | ✅ |
| 900-S02 SOCSO — employer | 2,187.15 | 2,187.15 | ✅ |
| 900-A01 accounting fee | 31,500.00 | 31,500.00 | ✅ |
| 900-T03 toll, parking & fines | 5,760.00 | 5,760.00 | ✅ |
| 900-W01 water & electricity | 5,111.90 | 5,111.90 | ✅ |
| 900-R01 rental of water purifier | 240.00 | 240.00 | ✅ |

## 3. THE STILL-TO-CAPTURE CHECKLIST — four rows, each traced to its source

Every gap is traced to the reference **printed in the client's own General Ledger**, so this is
a work list, not an estimate. Verified non-vacuously: all four accounts **exist in RPR's chart
of accounts** (so this is not miscoding to another code) and carry **no posting at any status,
ever**.

| # | account | certified | in Clara | still to capture | source, per the client's GL | in the supplied folder? |
|---|---|---|---|---|---|---|
| 1 | 900-S04 secretary fee | 6,035.40 | 1,190.00 | **2,600.00** | `RPRJV-202502/001` — pay-on-behalf claim, Tan Lake Wei, 10/2/2025, Kok Liong formation services | ✅ **YES** — `RPR - Journal Voucher/RPRJV202502001 - SECRETARY FEE - RM2,600.pdf` |
| 2 | 900-S04 secretary fee | ″ | ″ | **2,245.40** | Kok Liong, 2/12/2025 | ❌ no document supplied |
| 3 | 900-O01 office & warehouse rental | 161,120.00 | — | **161,120.00** | payment vouchers `RPRPV-202509/003`, `RPRPV-202510/002`, `/004`, `/005` … — INF ASSET HOLDINGS and **ROME PUBLIC ADVISORY SDN BHD** | ❌ no `RPRPV-*` payment vouchers supplied |
| 4 | 530-000 other income | 2,220.15 | — | **2,220.15** | `RPRJV-202512/001` — "being record for waiver of debt by the director", 8/12/2025 | ❌ folder's JVs stop at `RPRJV202510001` |
| 5 | 900-B01 bank charges | 12.40 | — | **12.40** | many `RPRPV-*` charges of 0.20–0.50 each | ❌ needs the payment vouchers / bank-statement lane |

**Row 1 is closeable today** from a document that is already in hand. **Rows 2–5 are blocked on
documents that do not exist in the supplied corpus** — chiefly the `RPRPV-*` **payment voucher**
series, which is absent as a category (the folder has Bank Statement, Journal Voucher,
Management Accounts, Payroll, Sales Invoice, Supplier Invoice — no Payment Voucher).

Row 5 in particular is bank-charge detail: it is naturally a **bank-statement** capture, and
statement ingest + reconciliation is **Wave C**, not built yet. Ten RPR statements sit unused in
`RPR - Bank Statement/` awaiting that wave.

## 4. What this proves, and what it does not

**Proves:** the incremental lane's actual subject — a live client whose books are partially
captured, with the authoritative target supplied by real, previously-unused management accounts,
and a per-account delta that is a concrete work list. Eleven accounts tie to the sen against a
document the system never saw.

**Does NOT prove:** the multi-sitting *resume-the-same-plan* mechanic. Both real carry-downs to
date (Rome Secretary, Bee Creative) completed in ONE sitting, so no plan has ever been resumed
across sittings on real documents. That mechanic remains unexercised and should not be claimed.

**Owner action to finish the tie-out:** supply the `RPRPV-*` payment-voucher series, the
December JVs (`RPRJV-202512/001`), and the 2/12/2025 Kok Liong secretary-fee document. With those,
RPR ties to its certified accounts exactly and the checklist goes to zero.
