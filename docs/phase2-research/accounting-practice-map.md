# Malaysian Professional-Practice Requirements Map — the Compliance-Correct Core (C5)

**Phase 2 research deliverable · 2026-07-17 · Clara greenfield rebuild**
**Scope:** grounds the refreshed PRD's accounting scope in real Malaysian SME-firm practice for the Gate-1 **C5 "compliance-correct core"** ruling — *SST fully right; live subledgers/FA/depreciation/disposal; honest MPERS financial statements with SOCE + notes; draft tax computation as the last slice (may slip to v1.1); payroll = coding + a real deadline calendar; inventory = periodic closing-stock adjustment at close.*

This is a **requirements map, not an implementation spec.** For every capability it states three things the PRD and Phase-3/4 build must satisfy: **(A) what "correct" means** (the professional/statutory bar), **(B) the minimum v1 bar** (what C5 must ship), and **(C) the common failure/edge cases** a practicing firm hits — the visibility surface that is Clara's real safety layer (per the standing edge-case-visibility directive).

### How this map was grounded
- **Statute (primary):** Sales Tax Act 2018 (Act 806), Service Tax Act 2018 (Act 807), Service Tax Regulations 2018, and the SST-02 return form — read from the owner's primary-source research at `C:\Users\zhant\Desktop\sst-research\` (RMCD-sourced, retrieved 2026-07-02). Section numbers below are cited from those texts.
- **Current facts (fetched 2026-07-17, cited in the source register):** the 1 Mar 2024 6%→8% service-tax rate move and the 6%-retained list; the 1 Jul 2025 SST scope expansion (MOF press release + advisor confirmations); EPF/SOCSO/EIS/PCB deadlines.
- **Frozen-repo domain evidence (READ-ONLY, `C:\Users\zhant\Desktop\initial acc software skillmd`):** the old build already contained a genuinely sophisticated, statute-cited SST-02 engine and tax-computation bridge (`db/v2/23e-fns-sst.sql`, `db/v2/23d-fns-tax.sql`, `db/v2/19d/19e-tables-*.sql`), an anchored AR/AP open-item subledger (`db/v2/19-tables-subledger.sql`), and a fixed-asset register carrying CA metadata (`db/v2/19b-tables-fixed-assets.sql`). These functions are **salvage-PORT/REBUILD domain gold** — the audit's verdict (Gate-1 README) is that the *arithmetic was largely right but nothing called it and no gate enforced it* (the F3 dead side-effect chain, the F12 close double-count). This map therefore treats the old engines as the **floor of correctness to re-earn**, not a ceiling.
- **COA provenance:** `docs/coa-reconciliation-findings.md` (frozen) — the 95-account MPERS-aligned generic master, GST fully stripped, SST split into `460-000 Sales Tax Payable` + `461-000 Service Tax Payable` (output liability only), EPF/SOCSO/EIS statutory pairs added.

> **Cardinal invariant threaded through every capability (never violated):** the DB owns every number; the agent never computes a financial or tax figure — it orchestrates named audited functions and surfaces judgment items. Money is `bigint` cents. SST is **output-tax only — there is no input-tax credit** (the single most important regime fact; GST's recoverable-input model is dead and must never reappear in the COA or logic).

---

# PART 1 — SST DONE RIGHT

Malaysia's SST is **two distinct single-stage taxes** administered by RMCD (Royal Malaysian Customs Department), re-introduced 1 Sep 2018 after GST was repealed (Act 805, in force 1 Sep 2018):

- **Sales Tax** (Sales Tax Act 2018) — on **manufactured/imported taxable goods**, charged once at the manufacturer/import stage. Rates **5% or 10%** (+ specific per-unit rates for Schedule-2 goods, e.g. petroleum). **Accrual basis.**
- **Service Tax** (Service Tax Act 2018) — on **prescribed "taxable services"** (First Schedule, Service Tax Regulations 2018, Groups A–J). Rates **8% general, 6% retained** for a named list. **Payment (cash) basis** with a 12-month backstop.

Both are **output-only**: service/sales tax a business pays on *its own purchases* is a **non-recoverable cost folded into the expense** — the opposite of GST. **There must be no "input tax recoverable" asset anywhere.** The COA carries only output-tax **liabilities** (`460-000` Sales Tax Payable, `461-000` Service Tax Payable), remitted to RMCD via the **SST-02** return.

A firm's own SME clients touch SST in two ways: (a) as **registrants** who must charge, account for, and remit; (b) as **consumers** who bear irrecoverable SST inside their costs. Clara must get *both* right — but the **registrant** obligations (register/period/return/timing) are the compliance-critical core.

---

## 1.1 — Registration & liability model

**(A) What "correct" means**
- **Sales tax:** a manufacturer of taxable goods is liable to be registered when total sale value of taxable goods in the current + preceding 11 months exceeds **RM500,000** (Sales Tax Act s.12–13). Application by the **last day of the month following** the month liability arose (s.13(1)); the DG approves and sets an effective date **not earlier than** the liability date (s.13(3)); failure to apply is an offence and the DG registers the person compulsorily from a date he determines (s.13(4)–(5)).
- **Service tax:** a provider of a taxable service is liable to register when the total value of taxable services in the current + 11 preceding months exceeds **the threshold prescribed for that service Group** (Service Tax Act s.12; thresholds in the First Schedule — historically **RM500,000**, with **RM1,500,000** for F&B/Group B and **RM1,000,000** for the 2025-added rental/leasing and financial-services Groups). Liability arises the earlier of the historical-turnover trigger or the forward-looking expectation (s.12(2)); a business commencing above threshold registers **from commencement** (s.12(3)). Same "last day of the following month" application rule (s.13(1)).
- **Voluntary registration** (both Acts s.14): a below-threshold person may apply; the DG sets the effective date.
- **The registrant carries a taxable-period assignment and an SST registration number** — both mandatory on every SST-02.
- **Threshold is per legal person and per tax**, computed on a rolling 12-month look-back **and** a forward expectation.

**(B) Minimum v1 bar**
- Model, per client, a **typed SST registration profile**: `sst_regime ∈ {not_registered, sales_tax, service_tax, both}`, `sst_no`, **registration effective date**, the **assigned taxable-period cycle** (see 1.2), and — for service tax — the **taxable-service Group(s)** and applicable **threshold**. (The frozen build already keyed behaviour off `clients.sst_regime` + `clients.sst_no` in `compute_sst_return`; port and extend.)
- Clara must **refuse to draft an SST-02 for a `not_registered` client** (frozen build raises `client_not_registered` — keep) and must **loudly surface a registration-liability watch**: track rolling taxable turnover and flag when a non-registered client crosses a Group threshold ("liable to register — apply by the last day of next month"). This is a *visibility* obligation, not an auto-registration.
- Store the registration number's presence as a **hard pre-file check** (`sst_no` empty ⇒ confirmation blocker).

**(C) Failure / edge cases to surface**
- **Late/compulsory registration** — client should have registered months ago; the first return must back-capture output tax from the true liability date, not the app's onboarding date. Surface the gap.
- **Threshold crossed then dipped** — service tax: a person does not cease to be liable merely because turnover dips, where the DG is satisfied the dip is a temporary cessation/suspension of ≥30 days (Service Tax Act s.12-adjacent; the "shall not cease to be liable" proviso). Do not auto-deregister.
- **Wrong Group / threshold** — a client self-classifies as a sub-threshold Group when their service actually falls in a lower-threshold Group. Surface the Group determination as a human judgment.
- **Group-registration (branches/divisions)** — a person may register branches/divisions separately only if each keeps separate accounts and **the same taxable period** (Service Tax Act s.-branch provisions). Rare for SMEs; flag if claimed.
- **De-registration** — ceasing business / falling permanently below threshold triggers a final return and cessation; a client marked `not_registered` who still has tagged output legs is a mismatch (frozen build surfaces this — keep).

---

## 1.2 — Taxable-period model (incl. DG variations)

**(A) What "correct" means**
- **Default period** (both Acts s.25(1)): the **first** taxable period runs from the date the person should have been registered to the **last day of the following month**; **subsequent periods are two months** (bi-monthly) ending on a calendar month-end.
- **The DG may vary** (both Acts s.25(2)–(3)): on written application the DG may **allow a different period, refuse, or vary the length and the start/end dates.** So period bounds are **registrant-specific data, never a fixed formula.** Monthly and other cycles exist in practice.
- **The first period after registration is RMCD-assigned and is frequently irregular** (a stub of 1–3 months) — it must be read from the client's assignment, not derived.

**(B) Minimum v1 bar**
- Store the **assigned period cycle** per client and treat every SST-02 period's `period_start`/`period_end` as **caller/registrant data with only shape + completeness guards** (frozen `compute_sst_return` does exactly this: `period_end ≥ period_start`, `period_end` not in the future, no overlap with a live draft — port verbatim). **Do not hard-code bi-monthly.**
- Derive the **due date** but flag it as derived: month-end-aligned period → **last day of the following month** (s.26(1)); DG-**varied** period → **30 days from period end** (s.26(2)). Apply the next-working-day rule for weekend/public-holiday landings (surface as an assumption).
- Enforce **non-overlap**: statutory periods never overlap; an overlapping live pair is always an error (frozen build supersedes any overlapping live draft — keep).

**(C) Failure / edge cases to surface**
- **Irregular first period** — declaring on a naive bi-monthly grid double-counts or misses the stub. Surface "confirm the assigned bounds."
- **Period straddling a rate change** (e.g. a period spanning 1 Mar 2024 or 1 Jul 2025) — output must bucket by the rate **effective at each leg's date** (see 1.5), not one flat period rate.
- **Books opened mid-period at onboarding** — output tax charged before the opening date sits in the opening lump, not in booked entries; reconcile the first period against the opening `460/461` balance (frozen build surfaces this — keep).
- **Varied-period due-date miscalculation** — a DG-varied period uses the 30-day rule, not the month-following rule; getting this wrong mis-times the penalty tier.

---

## 1.3 — Service tax timing: payment basis + the 12-month rule

This is the **hardest and most valuable** part of SST correctness, and where the frozen build's engine is genuinely strong (re-earn it).

**(A) What "correct" means**
- **Payment basis** (Service Tax Act **s.11(1)**): service tax is **due at the time payment is received** for the taxable service — *not* at invoice date. Verbatim: *"The service tax chargeable under section 7 shall be due at the time when payment is received for the taxable service provided…"*
- **The 12-month rule** (**s.11(2)**): where any part of the payment is **not received within 12 months from the invoice date**, service tax on the unpaid part **becomes due the day after that 12-month period.** So an invoice unpaid at 12 months + 1 day is fully taxable regardless of payment.
- **Advances**: because tax is due on *receipt of payment*, a payment received **before** an invoice (an advance/deposit for a taxable service) triggers the tax in the period received (s.11(1)).
- **Invoice/accrual-basis option** (s.11(1A)/(3) provisos): the DG may approve, or transitional rules may deem, an **invoice-date basis** for particular registrants/situations. If a client has such approval, payment-basis timing is **wrong** for them.
- **Contra settlements** count as payment received; **write-offs are not payment** (the 12-month rule still runs, and bad-debt relief is a separate claim — see 1.9).

**(B) Minimum v1 bar**
- Re-time service tax from the **live AR open-item subledger**, not from invoice-date GL accruals. The books may *accrue* the output leg at invoice for bookkeeping, but the **return** must declare on the payment basis. The frozen engine's **cumulative-target model** is the right shape: for each anchored service invoice, compute `declared_target(period_end) − declared_target(day-before-period-start)` and declare the delta, where `target = min(tax × paid/gross, tax − cn_share)` pre-12-months and `= tax − cn_share` post-trigger. This is cadence-invariant, drift-free, and holds no per-invoice persisted state. **Port `app.sst_service_target` + the anchored-invoice loop.**
- Only count settlement while the **settling receipt's GL entry is still effective** (posted, not reversed) — a bounced cheque / voided receipt must *not* have declared tax on money that never arrived (frozen `app.sst_receipt_effective` — keep).
- Surface **advances**, the **s.11(1A) invoice-basis assumption** ("if RMCD approved this client for the invoice basis, this timing is wrong — confirm no such approval"), and any invoice whose 12-month due date already passed at posting (a prior-period-amendment judgment). All three are in the frozen build; keep them.

**(C) Failure / edge cases to surface**
- **Cash-sale vs credit-sale service tax** — a tagged service-tax leg with **no AR-invoice anchor** is treated as cash-sale semantics (declared at posting date, *early* never late); a credit sale must be anchored via `record_ar_invoice` for true payment-basis timing. Surface the assumption.
- **Invoice edited after recording** — proration uses a `gross_cents` snapshot; an edited draft anchor can leave it stale (frozen "gross snapshot ≠ live control leg" confirmation — keep).
- **Reversed invoice after part-payment** — prior-period declared tax is not auto-adjusted; a s.39 refund-deduction or manual amendment may be needed.
- **Late-received payment shifting tax between periods** — re-drafting a superseded period must happen *in order* before filing if the books moved.
- **Imported taxable services** (reverse charge) are **not** captured by the normal AR pipeline — see 1.11.

---

## 1.4 — Sales tax timing: accrual basis

**(A) What "correct" means**
- **Accrual** (Sales Tax Act **s.11(1)**): sales tax is **due at the time the taxable goods are sold, disposed of otherwise than by sale, or first used** — verbatim from s.11(1). No payment-basis deferral. (The Minister may set different times for specified cases — s.11(2) — but the SME default is sale-date accrual.)
- Period attribution = the output leg's **posting date** (the sale date). Credit/debit-note adjustments fall in the period the note is **issued** (s.23 / reg 12).

**(B) Minimum v1 bar**
- Count **known-treatment tagged `460-000` legs by posting date**, net Cr = output, net Dr = CN/DN deduction (frozen build's pure-accrual sales loop — port). No subledger re-timing needed (unlike service tax).
- Bucket by the rate **effective at the leg's source date** (5% or 10%; Schedule-2 specific-rate goods are a separate Part-C manual field — surface, do not compute).

**(C) Failure / edge cases to surface**
- **A tagged Dr on `460-000` that is actually an RMCD remittance** (which must be **untagged**) miscoded as a CN deduction — frozen build raises a confirmation. Keep: "a remittance must be untagged."
- **Schedule-2 specific-rate goods** (per-unit/per-litre, e.g. petroleum) — not computed from value; surface as a manual Part-C field.
- **Exempt / Schedule-A/B/C exempt sales, exports, designated/special areas** — zero-rated or exempt; the return has dedicated Part-D/E fields the books don't populate. Surface as "confirm none apply."
- **Manufacturer-only scope** — sales tax applies to *manufacturers/importers*; a pure reseller/retailer client is generally **not** a sales-tax registrant. Flag a sales-tax regime on a non-manufacturer as a probable misclassification.

---

## 1.5 — Rate & sector schedule (incl. the 6%-retained sectors)

**(A) What "correct" means** — the current (2026) rate landscape:

| Tax | Rate | Applies to | Effective |
|---|---|---|---|
| **Sales tax** | **5%** | Reduced-rate taxable goods (basic/semi-essential) | since 2018; scope revised 1 Jul 2025 |
| **Sales tax** | **10%** | Standard taxable goods (discretionary/non-essential) | since 2018; scope revised 1 Jul 2025 |
| **Sales tax** | specific per-unit | Schedule-2 goods (petroleum etc.) | — |
| **Sales tax** | 0% / exempt | Essential goods (unchanged 1 Jul 2025) | — |
| **Service tax** | **8%** | General taxable services (Groups A–I default) | **1 Mar 2024** (up from 6%) |
| **Service tax** | **6% (retained)** | **F&B (Group B), telecommunications, parking, logistics (Group J — added by post-2018 amendment; the original 2018 First Schedule ran Groups A–I)** | retained at the 1 Mar 2024 rise |
| **Service tax** | **8%** | New 1 Jul 2025 Groups: rental/leasing, construction, financial services (Group H), private healthcare (non-citizen), education (high-fee), beauty | **1 Jul 2025** |
| **Service tax** | RM25/card/yr | Group H credit-card/charge-card levy (per card) | — |

- **The 8% is NOT universal** — the **6%-retained list is a named carve-out** (F&B, telco, parking, logistics). Getting an F&B or telco client's tax at 8% overstates the return.
- **Effective-dating is mandatory:** the rate applied to a leg is the rate in force **at that leg's tax point** (payment date for service tax, sale date for sales tax). A period straddling 1 Mar 2024 or 1 Jul 2025 mixes rates.
- **Transitional rules** apply across each rate change (RMCD guidance) — services spanning the change date apportion.

**(B) Minimum v1 bar**
- A **maintained, effective-dated rate/sector schedule** — the frozen build's `tax_rates` table keyed by `treatment` (e.g. `service-standard`, `service-fnb`, `sales-5`, `sales-10`) with `valid_from`, read by both the posting path and the return engine. **Every output posting must carry the treatment id on both legs** so the return can bucket by rate (frozen doctrine — keep). The SST-02 field-11 buckets (11a 5% / 11b 10% / 11c 6% / 11d 8% / 11e Group-H) map directly.
- A **treatment→Group→rate reference** the coding agent consults, with the **6%-retained list encoded** so an F&B/telco/parking/logistics client is tagged at 6%.
- Surface any counted treatment that has **no effective rate row at its leg date** (in the totals but no field-11 bucket — frozen confirmation; keep).

**(C) Failure / edge cases to surface**
- **8%-vs-6% miscoding** — the single most common rate error; the sector list is the guard.
- **New-2025-Group clients** (a client who became a service-tax registrant only on 1 Jul 2025 for rental/construction/finance) — verify the registration date and that pre-1-Jul-2025 revenue is untaxed.
- **Rate-change straddle** — a service invoice issued Feb 2024 but paid Apr 2024: the tax point (payment) is post-change; confirm the correct rate and any transitional apportionment.
- **The cancelled RM500k–1M MyInvois band must never reappear** (ADR-013, carried from the frozen harness) — a hard "never re-add."

---

## 1.6 — Dual-registrant separation (`both` regime)

**(A) What "correct" means**
- A person registered for **both** sales and service tax files **one SST-02 form family but two separate declarations** — the form itself instructs: *"This form must be declared separately for Sales Tax and Service Tax."* The two taxes have different bases (accrual vs payment), different rate buckets, different deduction rules, and must never be netted against each other.

**(B) Minimum v1 bar**
- The return engine computes **sales and service independently**, each with its own output/deduction/payable, then presents them as **two declarations** with a combined provenance worksheet (frozen `compute_sst_return` already does this — the `sales{}` and `service{}` blocks are fully separated; port). The separation must **survive export** to the SST-02 file (a Gate-1 F-finding was that the old export could blur this — the rebuild's reporting engine must derive each declaration from the DB, never let one tax's figure leak into the other).
- Per-tax **payable floors at 0** — a return cannot go negative; excess deduction carries forward, surfaced as a number (frozen `least(ded, out)` model — keep).

**(C) Failure / edge cases to surface**
- **Regime mismatch** — service legs on a sales-only client (or vice-versa) — the books charged the tax so it must be remitted, but the *registration* question goes to a human (frozen surfaces this loudly — keep).
- **Cross-tax netting** — never offset a service-tax excess against a sales-tax payable.

---

## 1.7 — Output-tax accounting (COA + posting)

**(A) What "correct" means**
- Output SST is a **current liability** owed to RMCD: `Dr Debtor/Bank (gross incl. tax) / Cr Revenue (net) / Cr SST Payable (tax)`. There is **no input-tax asset** — SST on purchases is expensed gross.
- The COA carries **`460-000 SST — Sales Tax Payable`** and **`461-000 SST — Service Tax Payable`** (both `acc_type CL`, output-liability only), per the 2026-06-27 COA modernisation (frozen `docs/coa-reconciliation-findings.md`). The 5 GST accounts (including the impossible GST-input asset) were dropped; GST-era `SR`/`BL` tax codes neutralised.
- Remittance to RMCD is an ordinary coded payment `Dr SST Payable / Cr Bank` — **untagged** (it is not an output event).

**(B) Minimum v1 bar**
- Seed the split SST liabilities in the generic COA master; **never** seed an input-tax account. Every SST output posting is written through the **audited journal function with the treatment tag on both the revenue and the tax leg** (Track-B doctrine), and the subledger open item is created in the **same transaction** (C2 intrinsic-subledger ruling — kills the F3 dead chain).
- The return engine counts **only known-treatment tagged legs on 460/461**; untagged movement, tag/account mismatches, unknown treatments, and opening-balance lumps are **surfaced with entry ids, never counted** (frozen counting doctrine — port).

**(C) Failure / edge cases to surface**
- **Opening-balance SST lump** from onboarding (pre-migration tax) — must be reconciled by a human, never auto-counted.
- **Manual correction miscarrying a tax_code** — surfaced as uncounted movement.
- **Tax-free credit note** that adjusts economics but carries no tax leg — must not shrink the tax ceiling (frozen fold M5 — keep).

---

## 1.8 — Credit/debit notes & deductions

**(A) What "correct" means**
- A CN/DN is issued when consideration changes after invoicing (Service Tax Regs reg 12 / Sales Tax equivalent). The tax effect is taken in the **return for the period the note is issued/received** (reg 12(1)–(2)) — SST-02 **field 13(a)** (tax deduction from credit note).
- Deductions cannot make a return negative; excess carries forward.

**(B) Minimum v1 bar**
- Model CN/DN as first-class subledger receipts (`kind='credit_note'`) with a tagged tax leg; the return deducts them in the issue period (frozen build: sales CN as net-Dr on 460; service CN inside the cumulative model at the CN's date, or as a manual field-13(a) candidate when the invoice is already fully settled — port both paths).
- Split field-13 (13a CN / 13b/13c other / 13d bad-debt) is a **filer judgment** — present the combined applied-deduction number and let the human split (frozen build — keep).

**(C) Failure / edge cases to surface**
- **CN against an already-settled invoice** — can never be allocated (Σ allocations capped at gross); the unallocated tax share becomes a **manual field-13(a) deduction** (frozen fold M1 — keep).
- **CN allocated to an invoice with no tagged tax leg** — the deduction is not applied; re-tag or re-allocate (frozen fold M9 — keep).
- **CN + its reversal** = a cancelled pair, both excluded (frozen fold H3).

---

## 1.9 — Bad-debt relief

**(A) What "correct" means**
- **Sales tax** (Sales Tax Act **s.36–37**): a registered manufacturer may claim a **refund of sales tax paid** on goods whose consideration is **written off as bad debt** in his accounts, **provided the DG is satisfied all reasonable recovery efforts were made** (s.36(1)(a)–(b)). Claim **within 6 years** from the date the tax was paid (s.36(3)). Refund = **whole** if no payment received, or the **difference** if part-paid (s.36(2)(a)–(b)). Any subsequent recovery triggers **repayment** to the DG (s.37).
- **Service tax** (Service Tax Act **s.35–36**): the mirror provisions.
- Relief is a **separate claim to the DG**, computed **net of credit notes**, and is claimable **only on tax actually paid to RMCD** — never auto-netted into the current return's payable.

**(B) Minimum v1 bar**
- Surface **bad-debt-relief candidates** from the write-off fact in the subledger (full or partial write-off), with the statutory formula figure computed net of CNs: `refund = C` (no payment) or `C − A×C/B` (part payment), where `B = gross − cn_alloc`, `C = tax − cn_share`, `A = effective payments` — **as candidates only, never auto-deducted** (frozen build's exact model — port; this is domain gold).
- Attach the human conditions to every candidate: written-off + reasonable recovery efforts + within 6 years of *paying* the tax + repayable on later recovery; partial write-offs need DG apportionment judgment.

**(C) Failure / edge cases to surface**
- **Partial write-off** leaves the invoice `part_settled` but the written-off portion is still claimable (frozen fold L3).
- **Later recovery** of a relieved debt ⇒ **repayment obligation** (s.37 / s.36) — track and surface.
- **Claiming relief on tax not yet remitted** — invalid; relief is only for tax actually paid.

---

## 1.10 — The SST-02 return

**(A) What "correct" means** — the SST-02 (2025 amendment form) structure, from the form itself:
- **One form, declared separately** for sales tax and service tax.
- **Part B2 field 11** buckets output tax by rate: **11a** goods 5% · **11b** goods 10% · **11c** services 6% · **11d** services 8% · **11e** Group-H card levy (RM25/card). **Field 12** = total tax payable = [11a+11b] **or** [11c+11d+11e]. **Field 13** = deductions: **13a** CN deduction · **13b/13c** other/service-tax deductions · **13d** bad-debt relief. **Field 14** = 12 − 13a − 13b − 13c − 13A. **Field 15** = penalty. **Field 16** = total incl. penalty. Parts C/D/E cover Schedule-2 goods, exempt sales/services, and Schedule-C purchases.
- **A NIL return must still be filed** (both Acts s.26(5)/(6)) — a zero draft is a valid filing basis.
- **Due date:** month-aligned period → **last day of the month following** the period end (s.26(1)); DG-varied period → **within 30 days** of period end (s.26(2)). Filed + paid on **MySST**.
- **Filing a false/incorrect return is an offence** (STA/SalesTA s.26-family; fine ≤ RM50k / imprisonment ≤ 3 years). **BELCORT drafts, never submits** — the human reviews, resolves judgment items, and files.

**(B) Minimum v1 bar**
- The engine produces a **DRAFT return with a full-provenance worksheet + an explicit assumptions/confirmations honesty layer** (frozen `compute_sst_return` — this is the model to re-earn): every counted leg itemised with entry ids, per-invoice payment-basis arithmetic, CN deductions, uncounted-movement list, bad-debt candidates, the field-11 rate buckets, the `form_map` (11a–14), and the deferred-position reconciliation (accrued-to-date vs declared-to-date).
- Supersede-not-delete: one live draft per client+period; re-draft supersedes.
- **The rendered SST-02 file is recorded as a filings-class export artifact at export time** — and (per Gate-1 pattern 9) **every figure and every balance/verification claim on that artifact must derive from DB read functions; no model-authored bytes enter the audited store.**
- **NIL returns supported**; **due date derived + flagged**; **late-filing penalty tier warned, never computed as a filed figure** (10% ≤30d / 25% ≤60d / 40% 61d+, the statutory maximum — frozen build warns; keep).

**(C) Failure / edge cases to surface**
- **NIL period silently skipped** — the obligation to file persists even with nothing to declare.
- **Late draft** — warn the current penalty tier at today's date (a filer declaration, field 15).
- **Rounding convention** — no statutory SST-02 box-rounding convention is verifiable; keep integer cents, render RM, and state the assumption.
- **Group-H card levy, Schedule-2 goods, exemption declarations, Schedule-C purchases** — not computed from the books; confirm none apply or fill manually (frozen confirmations — keep).
- **Prior-period amendment** — an SST-02 amendment (the form's "Pindaan/Amendment" flag) for a period already filed; the draft must not silently re-file.

---

## 1.11 — Imported taxable services (reverse charge) & scope boundaries

**(A) What "correct" means**
- A Malaysian business **acquiring imported taxable services** must **account for and pay service tax itself** (reverse charge) — the recipient self-assesses on the value of the imported service (Service Tax Act imported-services provisions; declared on **SST-02A / within SST-02** depending on registration status). This is **still output-only** (no credit).
- **Digital services** imported by consumers are covered by the separate FRP (foreign registered person) regime — generally out of an SME firm's client scope, but relevant if a client is an FRP.

**(B) Minimum v1 bar**
- **Out of the automated pipeline for v1**, but **must be surfaced**: the return engine flags "imported taxable services (reverse charge / SST-02A) are not captured by the books pipeline — confirm none were acquired this period" (frozen confirmation — keep). A client with foreign-vendor service spend is a candidate for manual reverse-charge treatment.

**(C) Failure / edge cases to surface**
- **Silent omission** of reverse-charge tax on foreign consultancy/software/management fees — a common SME under-declaration. The visibility flag is the guard.

---

## 1.12 — Group relief, B2B & other exemptions

**(A) What "correct" means**
- **Intra-group relief** (Service Tax Regs, First Schedule Group-G/H provisions): a taxable service in specified items provided **between companies within the same group of companies** (control test) is **not a taxable service** — *unless* the same service is also provided to a person outside the group, in which case it becomes taxable. B2B exemptions apply to specified professional (Group G) services between registered persons.
- The SST-02 has dedicated fields for exempted taxable services (B2B, group relief, other).

**(B) Minimum v1 bar**
- **Surface, not auto-apply.** Group-relief and B2B-exemption determinations are legal judgments (control tests, same-service-outside-group tests) — the return engine flags exempt-eligible relationships as confirmations and lets the human apply the exemption fields. (An accounting firm's **own** professional services to clients are Group-G taxable services — the firm is frequently itself a registrant, a useful self-check.)

**(C) Failure / edge cases to surface**
- **Group relief lost** because the same service is also sold outside the group — the exemption evaporates for *all* the intra-group provisions of that service.
- **B2B exemption claimed without the counterparty being a registered person** — invalid.

---

# PART 2 — THE FULL ACCOUNTING LIFECYCLE A PRACTICING MY SME FIRM RUNS

The lifecycle below is the actual sequence a Malaysian SME accounting/bookkeeping firm performs per client per period. C5 requires the **subledger/FA/depreciation/disposal chain live** and **honest MPERS statements**; the Gate-1 verdict is that the old build had the DB primitives but **nothing called them and no gate enforced them** (the F3 dead chain). Every capability below therefore carries the same structural mandate: **subledger/register/period side-effects must be intrinsic to the coding execution — inside the audited write path or DB-derived — so they cannot silently diverge.**

---

## 2.1 — Client onboarding & opening-balance carry-down / tie-out

**(A) What "correct" means**
- A new client arrives mid-life with an existing **trial balance** (from the prior accountant / prior system). Onboarding must **seed the opening balances** as a dated opening journal so that the GL, the AR/AP open-item subledger, and the FA register all **tie out to the incoming TB on day one**. Opening debtors/creditors must be captured as **individual open items** (per invoice/bill), not a single control lump, or aging and settlement break immediately.
- The client's **fixed profile** must be captured: entity type (Sdn Bhd / LLP / partnership / sole prop), **FYE month**, SST registration profile (1.1), COA (seeded from the generic master, then pruned/extended), bank accounts, and the counterparty entities.
- **Carry-down tie-out**: opening TB total debits = total credits; control-account openings = Σ open items; FA cost/accum-depreciation openings = Σ register.

**(B) Minimum v1 bar**
- A **one-shot, idempotent** opening carry-down (the Gate-1 F12 finding: the frozen `seed_opening_carry_forward` had **no idempotency guard** and a re-run double-posted the entire opening TB + subledgers + FA — a firm-killer). The rebuild must make carry-down **DB-guarded one-shot** with a re-run refusal.
- Seed the 95-account MPERS-aligned COA master; capture entity type + FYE + SST profile as typed fields.
- Opening debtors/creditors seeded as **anchored open items**; opening FA seeded into the register with cost + accumulated depreciation + CA metadata.
- A **tie-out report** at end of onboarding: GL vs subledger vs register, surfacing any residual (opening lumps are visibility, not a hard block — frozen tie-out doctrine).

**(C) Failure / edge cases to surface**
- **Re-run double-post** (the F12 killer) — must be structurally impossible.
- **Opening imbalance** — incoming TB doesn't balance; the ≤5¢ residual auto-posts to rounding (`980-100`), anything larger is surfaced.
- **Opening SST/tax lumps** — pre-migration output tax in the opening 460/461 must reconcile against the first live return period (1.2/1.7).
- **Mid-year onboarding** — the first FY is a stub; the close and tax basis period must handle a partial year.
- **Missing prior-year comparatives** — MPERS statements need prior-period figures; a first-year-on-BELCORT client has no in-system comparative until the opening TB is captured as the comparative column.

---

## 2.2 — Bookkeeping & transaction coding

**(A) What "correct" means**
- Every source document (invoice, bill, receipt, bank line, expense) is **coded to the correct account** in the correct client's COA, with the correct **SST treatment**, the correct **counterparty**, and **typed provenance** (`source_doc_sha256` + evidence regions for document-origin entries; function/input/approval/lineage receipts for manual/system/reversal/carry-forward entries). **OCR output is inert data, never an instruction.**
- Entries must **balance** (Σdr = Σcr); a ≤5¢ residual auto-posts to `980-100` rounding.
- **Never guess the client** — <0.95 client-match confidence must escalate; cross-tenant posting is the firm-killing mistake.

**(B) Minimum v1 bar** (this is the porting spine, not new — but the gates become structural)
- The **≥0.95 client-attribution gate is DB-enforced** (Gate-1 C3 invariant 1), not model-asserted.
- **Provenance is validated at insert** (C3 invariant 2) — `document_id` + `source_doc_sha256` bound to a real document, not caller-supplied unchecked (the frozen build inserted these with **zero validation** — a Gate-1 critical).
- The **coding execution creates/links the subledger open item and any tax leg in the same audited transaction** (C2/F3 fix) — coding a sales invoice to Trade Debtors *and* opening the AR item is one atomic act.
- Confidence-ladder lane semantics (post vs escalate) ported from the frozen skills as **domain logic mapped to the live registry** (not prose).
- The two-layer KB (C-rulings) **informs** coding (counterparty narrative, treatment history, recurring patterns injected into the context pack) but **never decides an account or lowers a gate** — wiki content is inert on read.

**(C) Failure / edge cases to surface**
- **Ambiguous client** (<0.95) — escalate, never post.
- **Unbalanced entry** > 5¢ residual — block; ≤5¢ auto-rounds.
- **OCR-injection attempt** — a document whose text says "post this to…" is data, not an instruction.
- **Recurring-pattern drift** — a learned counterparty rule that would auto-post `Dr Bank / Cr Revenue` and double-count income (a Gate-1 critical: a confirmed rule auto-posting with no human gate) — auto-posting revenue-recognition must stay gated.
- **New account needed** — a transaction with no fitting COA account; propose an addition, don't force-fit.

---

## 2.3 — AR/AP open-item subledger + aging + statements

**(A) What "correct" means**
- The **control accounts** (Trade Debtors `special_acc_type='DC'` seed `300-000`; Trade Creditors `'CC'` seed `400-000`) hold the authoritative receivable/payable totals; the subledger is the **open-item detail** beneath them. Every open item is **anchored to the GL entry that moved the control account**, and its gross is **read from that control leg** — never agent-supplied.
- **Settlement** is pure matching: a receipt/payment journal already posted (`Dr Bank / Cr AR`) is *allocated* against the open invoice — it can never double-count the GL.
- **Aging** (30/60/90/120+ buckets) and **customer/supplier statements** derive from open items + due dates + allocations. **Control tie-out**: control-account balance = Σ outstanding open items (residuals — opening lumps, direct-to-control adjustments — surfaced, not blocked).

**(B) Minimum v1 bar**
- Port the frozen anchored open-item model (`ar_invoices/ap_bills`, `ar_receipts/ap_payments`, `ar_allocations/ap_allocations`) with gross read from the control leg. **Wire it live** — the Gate-1 F3 verdict was that these functions existed and were **called by nothing**, so aging/statements rendered stale onboarding-seed numbers forever. C5 requires the subledger **maintained intrinsically by every coding/receipt execution** (C2).
- **Aging report, customer/supplier statements, and control tie-out** as DB read functions.
- Handle the five receipt kinds: `receipt`, `credit_note`, `write_off`, `contra`, `advance`.

**(C) Failure / edge cases to surface**
- **Advance / customer-in-credit** — a payment before an invoice sits fully unallocated (frozen edge-case F1).
- **Over-allocation** — allocations exceeding gross must be impossible.
- **Void an invoice** — must reverse the anchoring GL entry too (no `void` state that drops the open item while the control leg stays — a phantom tie-out break; frozen build closes the status set to keep the tie structural).
- **Partial settlement** — `part_settled` state; aging on the outstanding remainder.
- **Reversed/bounced receipt after allocation** — the money never arrived; the allocation must stop counting (ties into SST 1.3).
- **Contra (AR↔AP same counterparty)** — a customer who is also a supplier; contra settlement.
- **Direct-to-control adjustment** — a manual journal straight to `300-000`/`400-000` with no open item — surfaced by tie-out as a residual.

---

## 2.4 — Bank reconciliation

**(A) What "correct" means**
- Each bank statement line is **matched to a posted GL entry** on the correct bank account, correct period, correct amount; unmatched lines drive new postings or investigation. A reconciliation ties **book balance ↔ bank balance** with a reconciling-items bridge (deposits in transit, unpresented cheques, bank charges, interest).
- Match parity is **structural**: a line can only match an entry of the **same bank account**, and one entry can be reconciled **once** (entry exclusivity).

**(B) Minimum v1 bar**
- A bank-rec surface with **structural match-parity checks** (same bank account, amount, period) and **entry exclusivity** — the Gate-1 pattern-11a critical: the frozen `match_bank_line` matched *any* line to *any* posted entry (wrong account/period/amount, even into a completed reconciliation), and re-matching without unmatching left **ghost reconciled entries** (last-writer-wins, no exclusivity). C5 must add both guards.
- Port the frozen **self-reconcile learning loop** (the human-gated recon-hint machinery is salvage domain gold) as a *hint* surface, not an auto-matcher.
- Reversal/unmatch path with an in-order guard.

**(C) Failure / edge cases to surface**
- **Cross-account / wrong-period match** — blocked by parity.
- **Double-match / ghost reconciled entry** — blocked by exclusivity.
- **Bank charges / interest not yet booked** — a statement line with no matching entry ⇒ propose a posting.
- **Timing differences** — deposits in transit / unpresented cheques as reconciling items, not forced matches.
- **Multi-currency bank account** — flag (out of core scope but must not silently mis-match).

---

## 2.5 — Fixed-asset register + capital-allowance metadata

**(A) What "correct" means**
- Every capitalised asset has a register row: cost (read from the acquisition entry's debit to the FA cost account — GL-bounded), **in-service date** (MPERS: depreciation starts when *available for use*), method (straight-line / reducing-balance / none-for-land), useful life or rate, residual, and the **CA-basis descriptors** for tax: `ca_class` (Schedule-3 class), `is_commercial_vehicle`, `is_new`.
- The register is a **layer over the GL, not a parallel ledger**: NBV = cost − accumulated depreciation; the PPE note derives from it; `fa_control_tie_out` reconciles register ↔ GL cost + accumulated-depreciation accounts.

**(B) Minimum v1 bar**
- Port the frozen `fixed_assets` + `fa_depreciation` model with cost GL-read and CA metadata carried (do **not** compute CA here — CA is tax, Part 2.12). **Wire it live** (F3: it existed, nothing called it).
- Composite-FK every account column to the client's COA; enforce the method-driver constraints (straight-line ⇒ life; reducing-balance ⇒ rate; none ⇒ neither).

**(C) Failure / edge cases to surface**
- **Land / non-depreciating** — `method='none'`, no accumulated-depreciation contra.
- **Asset acquired mid-period** — depreciation from in-service date, pro-rated.
- **Missing `ca_class`** — no drafted CA until classified (surfaced in the tax draft).
- **Cost ≠ acquisition-entry debit** — register drift from the GL; tie-out surfaces it.
- **Componentised assets / revaluation / impairment** — MPERS allows; flag as beyond core if encountered.

---

## 2.6 — Depreciation

**(A) What "correct" means**
- **MPERS Section 17**: depreciate systematically over useful life from available-for-use date; straight-line or reducing-balance; residual and useful life reviewed. Posted as `Dr Depreciation expense (923-000, EP) / Cr Accumulated depreciation (contra, special_acc_type='AD')`.
- Depreciation is **computed by the DB** deterministically — the agent never computes it.

**(B) Minimum v1 bar**
- Port the frozen `run_depreciation` (deterministic MPERS-17 formula, posts a real journal per asset per run period). **Wire it into the close/period workflow** — the Gate-1 F3 verdict: depreciation was computed *correctly* and posted *correctly* but **no workflow ever ran it.** C5 requires a period-close (or monthly) depreciation run that actually executes.
- Per-asset accumulated depreciation in `fa_depreciation`; the AD account holds the GL total.

**(C) Failure / edge cases to surface**
- **Depreciation never run** (the F3 failure) — a period closes with no depreciation posted; the close-readiness check must catch a stale FA register.
- **Fully-depreciated asset** — stop at residual; don't depreciate below.
- **Method/life change** — prospective under MPERS; re-run must not retroactively restate.
- **Disposal in the run period** — no depreciation in the disposal year for CA (tax); accounting depreciation to disposal date (a book/tax difference — see 2.7/2.12).

---

## 2.7 — Disposal & balancing adjustments

**(A) What "correct" means**
- On disposal: remove cost + accumulated depreciation, recognise proceeds, and post the **accounting gain/loss** (`proceeds − NBV`). For **tax**, the accounting gain/loss is **capital** (not income / not deductible) and is replaced by a **Schedule-3 balancing adjustment**: **balancing charge** (proceeds > tax residual, claw back excess CA, capped at CA claimed) or **balancing allowance** (proceeds < tax residual). **No CA in the disposal year.**
- **Schedule-3 para 71**: allowances may be **withdrawn** if the asset is disposed **within 2 years** of acquisition (unless the DGIR accepts commercial justification).

**(B) Minimum v1 bar**
- Port the frozen `dispose_fixed_asset` (posts the book disposal journal, sets register `disposed` status, anchors `disposal_entry_id`). **Wire it live.** The **balancing-adjustment computation lives in the tax draft** (2.12), where the frozen build already computes balancing charge/allowance, the disposal-value QE-scaling for capped MVs, the "acquired and disposed within one basis period ⇒ no CA, no BA" case, and the para-71 within-2-years withdrawal flag — port all of these.

**(C) Failure / edge cases to surface**
- **Book gain ≠ tax outcome** — the book gain is not income and the book loss is not deductible; both are reversed in the tax bridge and replaced by the BA (frozen build's disposal add-back/deduct so the figures can't double-count — keep).
- **Disposed within 2 years** — para-71 withdrawal (frozen confirmation — keep).
- **Disposed in first basis period** — no CA ever arose ⇒ no BA (the loss is capital, already adjusted — frozen fold).
- **Part-disposal / trade-in / insurance write-off** — proceeds determination is a judgment.

---

## 2.8 — Adjustments: accruals, prepayments, provisions, reclassifications

**(A) What "correct" means**
- **Accruals** (expenses incurred not yet invoiced), **prepayments** (paid in advance, deferred), **provisions** (obligations of uncertain timing/amount — MPERS Section 21), **depreciation** (2.6), **reclassifications**, and **period-end estimates** are posted as **manual/system journals with their own provenance receipts** (function/input/approval/lineage — not document-sha). Accruals/prepayments typically **reverse** in the following period.
- **Reverse-not-delete**: a posted entry is never deleted; corrections post a reversal.

**(B) Minimum v1 bar**
- Port the frozen adjustments layer (`db/v2/19c-tables-adjustments.sql` / `23c-fns-adjustments.sql`) for accruals/prepayments/provisions with **auto-reversal scheduling** where applicable, each carrying typed provenance. **Wire it into the close checklist** (a close is not ready until known accruals/prepayments are posted).
- **Reversal has an in-order guard** — the Gate-1 F12 finding: reversing FY(n) under a live FY(n+1) close posted mirrors into the locked period and orphaned the carry; re-dating an entry *out* of a closed period passed the guard. C5 must gate reversal ordering and closed-period edits.

**(C) Failure / edge cases to surface**
- **Accrual not reversed** — a following-period double-count if the actual invoice also posts.
- **Provision vs contingent liability** — MPERS Section 21: provide only when an obligation is probable and measurable; else disclose.
- **Reclassification across the close boundary** — blocked/ordered by the reversal guard.
- **Manual journal straight to a control account** — surfaced by subledger tie-out (2.3).

---

## 2.9 — Inventory / closing stock (periodic)

**(A) What "correct" means**
- MPERS Section 13: inventory at **lower of cost and net realisable value**; cost by FIFO or weighted-average. A **periodic** SME books COGS via `Opening stock + Purchases − Closing stock`, with the closing-stock figure posted at period-end from a **stock count / valuation**.

**(B) Minimum v1 bar** (C5 ruling: **periodic only, no perpetual inventory engine**)
- A **period-end closing-stock adjustment** posted from a human-provided count/valuation (`Dr Closing stock (SoFP) / Cr COGS`, reversing opening), with a **completeness check**: if the client trades goods (has purchases/COGS movement) but no closing-stock adjustment is posted at close, **surface it loudly** — a missing closing-stock entry materially misstates profit.

**(C) Failure / edge cases to surface**
- **No closing-stock entry at close** for a goods trader — the completeness flag (the whole point of periodic-at-close).
- **NRV write-down** — a judgment; surface if stock value looks impaired.
- **Consignment / goods-in-transit** — ownership judgment; flag.
- **Service-only client** — no inventory; suppress the check.

---

## 2.10 — Year-end close & carry-forward

**(A) What "correct" means**
- At FYE: post depreciation (2.6), accruals/prepayments/provisions (2.8), closing stock (2.9), the tax provision (from the human-confirmed tax figure — 2.12), then **close the P&L to retained earnings** (`150-000` seed) and **carry forward** balance-sheet balances as the next year's opening. Drawings (`100-900`) close to capital for unincorporated entities. The close must be **one-shot, serialized, and period-integral**: every continuity read (bank rec, AR/AP/FA tie-out) must understand the period segment so it doesn't double-count the restatement.

**(B) Minimum v1 bar**
- **DB-guarded one-shot close + carry-down** (the Gate-1 F12 pattern-7 verdict — the frozen close was broken in *both* directions: no carry-down idempotency, an opening-restatement model that made every subsequent-year bank-rec and AR/AP/FA tie-out **double-count** and report phantom drift, an unserialized close racing every journal writer, and ungated reversal ordering). C5 must: make close/carry-down **one-shot + DB-guarded**, **teach every continuity read the period segment**, **serialize the close** (the frozen build uses `pg_advisory_xact_lock('belcort_close:'||client_id)` — port that serialization to the whole close/adjustment/tax family), and **gate reversal ordering**.
- The close takes the **human-confirmed tax provision** — Clara never estimates the provision itself (the tax draft is the review material; the confirmed figure feeds the close).
- **Role floor + maker-checker on the high-stakes lane** (Gate-1 C4): year-end close and opening balances are distinct-approver HARD gates; a viewer must not be able to close a year (the frozen build had **no role floor at all** on close — a Gate-1 critical).
- **Close-readiness checks (g3/g4)** stay **visibility-first** (Gate-1 C3): surface "depreciation not run / accruals not posted / closing stock missing / subledger not tied / bank not reconciled / unresolved must-ask items" before allowing close.

**(C) Failure / edge cases to surface**
- **Re-run double-post** of carry-down (F12 killer) — structurally blocked.
- **Continuity double-count** from year 2 onward (the F12 core failure) — every tie-out read must be period-segment-aware.
- **Reversal into a locked period / re-date out of a closed period** — blocked by the ordering + closed-period guards.
- **Close before adjustments** — close-readiness surfaces the incomplete state.
- **Prior-period adjustment after close** — MPERS Section 10: correct via restatement of comparatives, not a silent current-period entry.
- **Stub first/final year** — a mid-year onboarding or cessation year is a partial period.

---

## 2.11 — MPERS financial statements (what a COMPLIANT set REQUIRES)

**(A) What "correct" means**
- Malaysian private entities (non-listed, not applying MFRS) report under **MPERS** (MASB's Malaysian Private Entities Reporting Standard; the Companies Act 2016 requires directors to prepare statements complying with approved accounting standards giving a true and fair view). **There is no government-mandated COA** — MPERS prescribes **minimum line items**, not a chart.
- **A complete set of financial statements under MPERS Section 3 comprises ALL of:**
  1. **Statement of Financial Position** (SoFP / balance sheet) — MPERS Section 4 minimum line items.
  2. **Statement of Comprehensive Income** (SoCI) — single statement, or two statements (a separate income statement + a statement of comprehensive income) — MPERS Section 5.
  3. **Statement of Changes in Equity** (SOCE) — MPERS Section 6 (or the combined **Statement of Income and Retained Earnings** *only if* the sole equity changes are profit/loss, dividends, and prior-period corrections — Section 6.4).
  4. **Statement of Cash Flows** (SCF) — MPERS Section 7 (operating/investing/financing; direct or indirect method).
  5. **Notes to the financial statements** — accounting policies + explanatory/disaggregation notes (Section 8), including the required disclosures per applicable sections (PPE movement, related parties, etc.).
- Plus **comparative prior-period figures** for every statement, and a **directors' report + statutory declaration + (unless audit-exempt) an auditor's report** for a Sdn Bhd under the Companies Act 2016.

**(B) Minimum v1 bar** (Gate-1 C5: "**honest FS — add SOCE + basic notes, or the pack stops claiming MPERS compliance**")
- The frozen build produced **SoCI + SoFP only** yet stamped every artifact *"Prepared in accordance with MPERS/MFRS"* — a Gate-1 critical (pattern 10). C5 requires either producing the **full set (SoFP + SoCI + SOCE + SCF + Notes + comparatives)** or **removing the compliance claim** and labelling the output as a management-accounts pack, not MPERS financial statements. **The honest floor: the compliance stamp is earned only by a complete set.**
- Every figure derives from **DB read functions** (Gate-1 pattern 9) — no model-authored numbers on a branded artifact; the "in balance" claim must be a real DB-derived verification, not a hard-coded `balanced:true`.
- Minimum for a defensible v1 "compliant set": SoFP, SoCI, **SOCE** (or Statement of Income & Retained Earnings where permitted), **SCF**, and **notes** covering accounting policies + PPE movement + the material disaggregations, with prior-year comparatives.

**(C) Failure / edge cases to surface**
- **Overclaiming compliance** — the exact frozen failure; the stamp must match what's actually produced.
- **Missing comparatives** (first year on system) — either present the opening TB as the comparative or state its absence.
- **Small-company audit exemption** — a dormant / zero-revenue / threshold-qualified private company may be audit-exempt (SSM practice directive) — but the *financial statements themselves* are still required; don't conflate audit exemption with a reporting exemption.
- **Sole prop / partnership** — no Companies Act filing set, but a proper accounts pack (SoFP/SoCI + capital accounts) is still needed for the tax return and the owner.
- **Going-concern / subsequent-events / related-party** disclosures — MPERS-required notes a bare two-statement pack omits.

---

## 2.12 — Draft corporate/business tax computation (LAST slice; may slip to v1.1)

Gate-1 C5: ADR-044 draft tax computation **stays v1 but as the last slice — first candidate to slip to v1.1.** The frozen build already has a genuinely strong, PR-cited engine (`compute_tax_draft`) — the requirement is to re-earn it as **review material with an honesty layer**, never a filing.

**(A) What "correct" means** — the tax bridge from accounting profit to chargeable income (ITA 1967):
- **PBT** (accounting profit before tax) →
- **Add back non-deductibles / non-business items** (s.39): **book depreciation** (s.39(1)(b)); **50% of entertainment** (s.39(1)(l) statutory default, with 100%-deductible provisos per PR 4/2015 for staff/promotional/sales-related); **100% of donations** (never s.33(1)-deductible; approved portion re-enters at aggregate stage); **disposal book gain/loss** reversed (capital — replaced by the balancing adjustment); plus **candidates a human confirms**: WHT-suspected payments (disallowed under s.39(1)(f)/(i)/(j) only if s.109/109B/109F WHT unremitted), fines (non-deductible) split from toll/parking (deductible), general vs specific doubtful-debt provision (specific deductible s.34(2), general not — PR 4/2019).
- **Less capital allowances** (Schedule 3) from the FA register: **Initial + Annual Allowance** by `ca_class`, effective-dated (heavy machinery/MV 20/20, general plant 20/14, office/furniture 20/10, ICT 40/20 from YA2024 per P.U.(A) 328/2024, IBA 10/3); the **non-commercial-MV QE cap** (RM100k if new & cost ≤ RM150k, else RM50k — Sch 3 para 2(2)); **small-value assets** (≤ RM2,000, 100%, RM20k/YA aggregate cap unless MSME — PR 3/2021); **no allowance in the disposal year** (balancing adjustment instead); unabsorbed CA carries **indefinitely** same-source, business losses cap at **10 YAs** (PR 1/2022).
- **= Chargeable income** → apply the rate: **companies (Form C) / LLP (Form PT)** at **MSME tiers 15%/17%/24%** (first RM150k / to RM600k / balance — PR 8/2025, conditions human-confirmed: paid-up ≤ RM2.5m, group-clean, gross income ≤ RM50m, ≤20% foreign) **or standard 24%**; **partnership (Form P) and sole prop (Form B) are tax-transparent** — no entity tax; the worksheet carries adjusted/divisible income for the partners'/owner's individual filings.
- **Instalments**: companies/LLPs file **CP204** (estimate ≥ 85% of the prior YA's revised estimate; revise in months 6/9/11; monthly instalments by the 15th; new-SME 2-YA exemption; underestimate penalty s.107C(10)); individuals with business income pay via **CP500** (bimonthly, revise via CP502 by 30 Jun).

**(B) Minimum v1 bar**
- Port `compute_tax_draft` as a **DB-computed DRAFT worksheet** with **full provenance** (every add-back's source entry ids, per-asset CA schedule with rates used, candidates awaiting confirmation) + an **explicit assumptions[] and confirmations_needed[] honesty layer** — the human tax agent reviews, confirms the judgment items, and e-files; **BELCORT never submits.** One live draft per client+YA, supersede-not-delete.
- The **confirmed** tax figure (not the draft) feeds the year-end-close provision posting (2.10).
- Rate/CA schedules stay in the **effective-dated global reference tables** (`tax_corp_rates`, `tax_ca_rates`).

**(C) Failure / edge cases to surface** (all present in the frozen honesty layer — keep)
- **MSME eligibility unconfirmed** — draft at standard 24%, surface the PR 8/2025 conditions.
- **Brought-forward relief** (prior unabsorbed CA / business loss) — **never silently applied**; quote the prior draft's figures and require manual confirmation.
- **Building-class asset drawing IBA** — confirm it qualifies as an industrial building (commercial office/shoplot earns no CA).
- **Entertainment/donation/WHT/doubtful-debt precedence** — a dual-flagged entry must never add back 150%; donation's 100% wins over entertainment's 50%; WHT never stacks on an already-added-back donation.
- **Transparent-entity non-December FYE** — individuals' basis period is the calendar year (s.21); a non-December FYE needs apportionment.
- **Unclassified assets** earn no drafted CA — surface for classification.
- **Exempt income** (single-tier dividends, exempt FSI) — no auto-adjustment; remove manually if present.

---

# PART 3 — STATUTORY PAYROLL TOUCHPOINTS (coding + deadline calendar only)

Gate-1 C5: **payroll = coding + the deadline calendar actually built (no engine).** Clara does **not** compute gross-to-net payroll; it **codes** the statutory contributions to the right accounts and **surfaces the deadline calendar** so the firm never misses a remittance. (Rates below are for coding sanity + the calendar, not a payroll engine.)

## 3.1 — EPF / SOCSO / EIS / PCB coding

**(A) What "correct" means** — the four statutory deductions and their account pairs (already seeded in the COA master):
- **EPF (KWSP)** — retirement fund. Employer share **13%** of wages ≤ RM5,000 / **12%** above; employee **11%** (statutory minimum). Foreign workers **now contribute** (from Oct 2025). Accounts: employee deduction → **`420-000` EPF liability**; employer expense → **`908-000` EPF – Employer**.
- **SOCSO (PERKESO)** — Employment Injury + Invalidity. Employer ~**1.75%**, employee **0.5%** (Category 1, under 60); wage-ceiling-based. Accounts: **`430-000` SOCSO liability** / **`909-000` SOCSO – Employer**.
- **EIS (SIP)** — Employment Insurance. Employer **0.2%** + employee **0.2%**. Accounts: **`435-000` EIS – Staff** / **`909-000A` EIS – Employer** (added in the 2026-06-27 COA modernisation — EIS mandatory for all employers since 2018).
- **PCB / MTD (Potongan Cukai Bulanan)** — monthly income-tax deduction remitted to LHDN. A payroll liability until remitted.
- A payroll journal codes: `Dr Salaries/wages expense, Dr employer EPF/SOCSO/EIS expense / Cr net pay (bank), Cr EPF/SOCSO/EIS/PCB liabilities`. On remittance: `Dr liability / Cr Bank`.

**(B) Minimum v1 bar**
- **Correct coding** of a payroll journal to the seeded statutory pairs, with the employer-expense vs employee-liability split honoured (the COA already carries `420/908` EPF, `430/909` SOCSO, `435/909-000A` EIS). Clara recognises payroll transactions and codes them; it does **not** compute the contribution amounts.
- **Do not** create an input-tax-style or netting error; each statutory liability is a distinct payable cleared on remittance.

**(C) Failure / edge cases to surface**
- **Employer expense miscoded as employee deduction** (or vice-versa) — misstates staff cost.
- **Liability not cleared on remittance** — a growing statutory-payable balance that should zero each month.
- **HRD levy (HRDF/PSMB)** — 1% for registered employers in covered sectors — a fifth touchpoint; code if present.
- **Foreign-worker EPF** (new Oct 2025) — a client with foreign staff now has EPF where it previously had none.

## 3.2 — Deadline calendar (the built artifact)

**(A) What "correct" means** — the recurring statutory payroll calendar:
- **EPF, SOCSO, EIS, PCB (CP39)** — monthly, **by the 15th of the following month** (salary for month M is remitted by the 15th of M+1). If the 15th is a weekend/public holiday, the last working day before it.
- **Form E** (employer's annual return) — **by 31 March** (with CP8D employee listing).
- **EA form** (employee's annual remuneration statement) — to employees **by end of February**.
- **Late penalties**: EPF — dividend-rate + 1% (min RM10); SOCSO/EIS — 6% p.a. per day; PCB — fine RM200–RM20,000 and/or ≤6 months imprisonment.

**(B) Minimum v1 bar**
- A **real, per-client deadline calendar** (Gate-1 pattern 10: payroll was "scaffolding-only despite PRD claims" — C5 requires the calendar *actually built*): surface upcoming EPF/SOCSO/EIS/PCB-15th deadlines, the annual Form E (31 Mar) and EA (end Feb), with a client-specific view (only clients that run payroll), and a **proactivity surface** that notifies ahead of each deadline — **notify/surface, never auto-file** (the standing UX law: proactivity surfaces but never acts).
- Include the **SST-02 filing deadlines** (Part 1.10) and **CP204/CP500 instalment 15ths** (Part 2.12) in the same statutory-calendar surface — the calendar is the firm's single compliance-deadline pane.

**(C) Failure / edge cases to surface**
- **Weekend/holiday-adjusted 15th** — the effective deadline is the prior working day.
- **New payroll client mid-month** — pro-rated first contribution.
- **Deadline missed** — surface the penalty exposure, don't silently pass.
- **Public-holiday variance by state** — Malaysian public holidays vary by state; the client's state governs.

---

# PART 4 — CROSS-CUTTING REQUIREMENTS THE COMPLIANCE-CORRECT CORE MUST HONOUR

These bind every capability above (from the Gate-1 rulings + failure patterns):

1. **The side-effect chain is intrinsic (F3 fix).** Coding/receipt executions maintain the subledger, FA register, tax legs, and KB **in the same audited transaction** or DB-derived — never a separate call that can be skipped (the frozen build's fatal gap: real functions, called by nothing).
2. **Four firm-killing invariants are structural DB guarantees (C3):** client attribution (≥0.95 gate DB-enforced), provenance binding (document/sha validated at insert), wake write-authority (allowlist per wake kind), write authorization (plan→approve + role floors in the DB). Accounting-judgement calls (coding, materiality, close-readiness) stay **visibility-first**.
3. **Maker-checker (C4):** maker identity always modelled; **distinct-approver HARD on the high-stakes lane only** (tax-affecting, closed-period, large-amount, year-end close, opening balances); the agent can never satisfy a human sign-off; solo firms self-attest (DB-recorded).
4. **The DB owns every number (pattern 9).** Every figure on every return/statement/report derives from a DB read function; no model-authored bytes enter the audited artifact store; no hard-coded `balanced:true`.
5. **Period integrity (pattern 7).** Close/carry-down one-shot + DB-guarded + serialized; every continuity read is period-segment-aware; reversal ordering gated.
6. **Provenance, receipts, reversibility, retention.** Every entry carries typed provenance; posted entries reverse-not-delete; a source of truth under a **7-year statutory retention** duty needs a backup/restore/DR contract (pattern 10 — absent in the frozen build).
7. **Honesty over completeness.** Every draft return/statement/computation carries an explicit **assumptions + confirmations-needed** layer; overclaiming compliance is the cardinal sin the rebuild exists to fix.

---

# PART 5 — v1 SCOPE LEDGER (mapped to Gate-1 C5)

| Capability | v1 status (C5) | Note |
|---|---|---|
| SST registration/period model incl. DG variations | **IN — fully right** | Typed profile + assigned-period data; liability-watch visibility |
| Service tax payment basis + s.11(2) 12-month rule | **IN — fully right** | Port the cumulative-target engine + effective-receipt guard |
| Sales tax accrual basis | **IN — fully right** | Posting-date attribution |
| Dual-registrant separation (`both`) | **IN — fully right** | Two declarations, survives export |
| Rate/sector schedule incl. 6%-retained + 1 Jul 2025 groups | **IN — fully right** | Effective-dated `tax_rates`; both legs carry treatment |
| SST-02 draft return + NIL + due dates + penalties-warned | **IN — fully right** | Draft only; human files on MySST |
| Bad-debt relief candidates | **IN** | Surfaced, never auto-deducted |
| Imported services / reverse charge | **IN as visibility flag** | Not automated; surfaced |
| Group relief / B2B exemptions | **IN as visibility** | Human-applied |
| AR/AP subledger + aging + statements | **IN — live** | Intrinsic maintenance (C2/F3) |
| Bank reconciliation | **IN — live** | Structural match-parity + exclusivity |
| FA register + CA metadata | **IN — live** | CA computed in tax draft, not here |
| Depreciation (MPERS-17) | **IN — live** | Actually run at close/period |
| Disposal + balancing adjustments | **IN — live** | BA in the tax draft |
| Adjustments/accruals/prepayments/provisions | **IN — live** | Auto-reversal + ordering guard |
| Inventory | **IN — periodic only** | Closing-stock adjustment at close + completeness check |
| Year-end close + carry-forward | **IN — live** | One-shot, serialized, period-segment-aware |
| MPERS FS: SoFP + SoCI + SOCE + SCF + Notes | **IN — honest set** | Full set or drop the compliance claim |
| Draft corporate/business tax computation | **IN — LAST slice; may slip to v1.1** | Review material + honesty layer; never files |
| Payroll | **IN — coding + calendar only** | No gross-to-net engine |
| Perpetual inventory / stock engine | **OUT** | Periodic-at-close only |
| MyInvois e-invoicing integration | **OUT of C5** | Separate track; the RM500k–1M band is permanently cancelled (ADR-013) |
| Auto-filing to MySST / LHDN / KWSP | **OUT — never** | BELCORT drafts; humans file |

---

# APPENDIX — SOURCE REGISTER

**Primary statute (owner's SST research, `C:\Users\zhant\Desktop\sst-research\`, RMCD-sourced, retrieved 2026-07-02):**
- Sales Tax Act 2018 (Act 806) — `sales-tax-act-2018.txt`: s.11(1) accrual timing; s.12–13 registration; s.25 taxable period; s.26 returns/due; s.36–37 bad-debt refund/repayment.
- Service Tax Act 2018 (Act 807) — `service-tax-act-2018.txt`: s.7 charge; s.11(1) payment basis, s.11(2) 12-month rule, s.11(1A)/(3) provisos; s.12–13 registration/threshold; s.25(1)–(3) taxable period + DG variation; s.26(1)–(2) returns + due (month-following / 30-day-varied); s.35–36 bad-debt.
- Service Tax Regulations 2018 — `service-tax-regulations-2018.txt`: reg 12 credit/debit notes; First Schedule taxable-service Groups A–I (Group B F&B, Group G Professionals, Group H credit-card/finance).
- SST-02 return form (2025 amendment) — `sst-02-form-2025.txt`: separate sales/service declaration; Part B2 fields 11–16; Parts C/D/E; field 13a–13d deductions.
- MySST return/payment user manual — `mysst-user-manual*.txt` / `.pdf`; Guide on Financial Services — `financial-services-guide-v2.txt` (Group H 8% from 1 Jul 2025; imported-services reverse charge).

**Current facts (fetched 2026-07-17):**
- Service tax 6%→8% effective **1 Mar 2024**, F&B/telco/parking/logistics(Group J) retained at **6%** — RMCD/advisor confirmations: https://www.vatcalc.com/malaysia/malaysia-service-tax-rise-to-8-2024/ ; https://www.crowe.com/my/insights/getting-ready-for-the-service-tax-rate-increase---what-you-need-to-know ; https://www.grantthornton.com.my/globalassets/1.-member-firms/malaysia/publications/tax-2024/changes-of-service-tax-rate.pdf
- SST scope expansion effective **1 Jul 2025** (rental/leasing, construction, financial services, private healthcare, education, beauty; thresholds incl. RM1m leasing/finance, RM1.5m construction; grace period to 31 Dec 2025) — MOF press release (primary): https://www.mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025 ; EY: https://www.ey.com/en_my/insights/tax/malaysia-budget/sst-expansion-from-1-july-2025-what-has-changed-and-what-to-expect-in-budget-2026 ; Wolters Kluwer: https://www.wolterskluwer.com/en-my/expert-insights/service-tax-sst-expansion-in-malaysia
- EPF/SOCSO/EIS/PCB deadlines (15th of following month; Form E 31 Mar; EA end Feb; foreign-worker EPF from Oct 2025) — KWSP: https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution ; Talenox: https://help.talenox.com/en/articles/2770664-deadlines-for-epf-socso-and-pcb-submission-in-malaysia

**Frozen-repo domain evidence (READ-ONLY, `C:\Users\zhant\Desktop\initial acc software skillmd`):**
- `db/v2/23e-fns-sst.sql` — `compute_sst_return` (the statute-cited SST-02 engine: payment-basis cumulative-target model, 12-month rule, effective-receipt guard, bad-debt candidates, field-11 buckets, honesty layer). `db/v2/19e-tables-sst.sql` — `sst_returns` draft table.
- `db/v2/23d-fns-tax.sql` — `compute_tax_draft` (the PR-cited add-back → CA → chargeable-income bridge, entity branching, CP204/CP500). `db/v2/19d-tables-tax.sql` — `tax_ca_rates`, `tax_corp_rates`, `tax_computations`.
- `db/v2/19-tables-subledger.sql` — anchored AR/AP open-item model. `db/v2/19b-tables-fixed-assets.sql` — FA register + CA metadata.
- `docs/coa-reconciliation-findings.md` — 95-account MPERS-aligned COA master; GST stripped; `460/461` SST split (output-only); EPF/SOCSO/EIS pairs.

**Gate-1 binding decisions & audit evidence (`C:\Users\zhant\Desktop\clara-rebuild\docs\audit\`):**
- `04-gate1-decisions.md` (C3/C4/C5 rulings — this map operationalises C5). `00-GATE-1-README.md` (the 11 failure patterns: F3 dead side-effect chain, F12 period-integrity double-count, MPERS overclaim, DB-owns-every-number, payroll scaffolding-only).
