# Split-month revision allocation — cross-model research record (2026-08-02)

> Commissioned by the owner at the Wave D-b grilling (the D-a ladder residual #4: "WHICH lineage
> row owns the split month after a mid-month revision — unruled; pin it or leave it"). The owner's
> commission: *"research the best and most advanced practices in ai agentic and ai os in 2026 and
> the best method is accounting practices, you may collaborate with codex."* Two lanes ran in
> parallel: **Lane 1** — Codex `gpt-5.6-sol` xhigh, direct exec, read-only repo + live web ·
> **Lane 2** — native sonnet-5 xhigh live-web census (WebSearch/WebFetch, sources fetched not
> recalled). Outcome: **the owner PINNED the actual as-built period-boundary law** (WDB-G14,
> ruling minuted in `wave-d-b-design.md`).

---

## 0. The lane-1 repository finding that reframed the question

**The question as originally posed carried a reversed premise.** The D-b grounding census (and
the grill question built on it) framed the as-built law as "the successor owns the revision
month." Codex read the arithmetic and the contract-blind tests and proved the opposite; the
orchestrator independently re-verified all four cites before the ruling:

- `0041:1367` — the superseded predecessor's last chargeable month is
  `_fa_month_start(superseded_at - 1)`. For a 15-Aug revision that is `month_start(14 Aug) =
  1 Aug`: the **predecessor charges August**. Only a day-1 revision (`month_start(31 Jul) =
  1 Jul`) ends the predecessor in the prior month.
- `0041:3219` — the successor births with `baseline_as_of = effective_from - 1`.
- `0041:1283-1288` — `_fa_first_chargeable_month` = `greatest(month_start(start_date),
  month_start(baseline_as_of) + 1 month)`. A 15-Aug revision ⇒ successor's first month is
  **September**; a 1-Aug revision ⇒ August.
- `packages/db/tests/x41-round35-disposal.test.mjs:183-214` — asserts it verbatim: *"month
  grain gives a mid-month supersede to the PREDECESSOR."*

**The actual as-built law:** no calendar month is ever split between lineage rows; a revision
effective **day 1** hands the month to the successor; effective **day 2+** leaves the whole
month with the predecessor (the new particulars begin the following month).

Two record corrections that ride this finding: the RM80,000 20%→10% RB worked cell
(`x41-reducing-balance.test.mjs:67`) uses a **1-Oct** effective date, so it exercises the day-1
class and proves nothing about mid-month; and "thirteen receipts at difference exactly 0"
belongs to Wave C-c's reconciliation acceptance, not the FA register (the FA acceptance's own
instrument was `fa_register_tie` at two as-ofs).

## 1. Standards (both lanes, primary text fetched)

- **IAS 8 ¶¶32–38** (ifrs.org, fetched): a change in useful life/residual/method is a change in
  accounting estimate applied **prospectively** — recognised "in the period of the change" and
  future periods (¶36); ¶38 applies the change "from the date of that change." The operative
  unit is the **period**, never a day; the standard is silent on sub-period precision by
  construction.
- **IFRS for SMEs §17.19 + §§10.15–10.18** (the MPERS basis; Module 17 and the 2015 standard
  fetched): same period-of-change grain; the standard's own default review cadence is **annual**.
  MPERS is substantively word-for-word IFRS for SMEs here (IFRS Foundation Malaysia profile;
  MASB's Oct-2025 MPERS revision tracks the 3rd edition, effective 2027). No Malaysian-specific
  intra-month rule exists.
- **Materiality** (MPERS §10.3, IAS 8 ¶8, Practice Statement 2 ¶¶73–76): a consistently applied
  month convention is defensible while immaterial; a materially wrong result cannot hide behind
  consistency — hence the ruling's material-exception visibility note.
- Lane-1 honesty note: day-exact allocation is the most *literal* reading of IAS 8.38 — the
  month convention is a defensible approximation, not an explicit standards safe harbour. It is
  also *more* faithful than "successor owns the month," which would back-apply a new estimate to
  days before management made the change.

## 2. Mature ERP practice (per-vendor, both lanes convergent)

**No mainstream system day-splits an estimate-revision month.** The day/half-period proration
machinery that exists everywhere (SAP period controls, Oracle prorate conventions, Dynamics
conventions, Xero averaging) governs **acquisition and disposal**, a different accounting
moment. For mid-life estimate changes: SAP creates period-grain calculation intervals (its own
worked useful-life change lands on 1 July — the day-1 class) with period-grain catch-up;
Oracle's amortized adjustments compute catch-up "in the current open period"; Dynamics adjusts
"by the number of depreciation periods affected"; Sage's guidance says outright that
partial-period conventions exist so that daily allocation is unnecessary; ERPNext/Odoo
recompute the forward schedule from a period boundary (ERPNext's optional daily-pro-rata is a
depreciation-basis setting, not a revision-split rule); Xero's estimate changes apply per
financial year; QuickBooks documents no revision mechanic at all. A Malaysian public-sector
report (Kuantan Port Authority) documents a 1st–15th/16th–month-end convention — local
precedent for coarse, documented conventions, not authority.

## 3. AI-native 2026 census (the owner's explicit angle)

Digits, Puzzle, Truewind, ChatFin, Zeni, Basis, DualEntry, Money Forward: the cohort documents
agent-drafted monthly depreciation runs, rollforwards, human-confirmed useful lives — and is
**uniformly silent** on estimate-revision changeover-month granularity. Explicit
absence-of-evidence (both lanes, independently): no AI-native vendor is documented to
day-pro-rate a revision month, and none documents the contrary either. No precedent exists that
would oblige Clara to exceed month grain.

## 4. Verdict (both lanes convergent) and the ruling

**PIN the actual as-built period-boundary law; do not re-rule to day-level pro-rating** (and do
not "re-rule to successor-owns," which was never the code's behavior). Rationale of record:
standards operate at period grain with annual review cadence; the industry norm is
whole-period cutover; the as-built rule never back-applies an estimate before its decision
date; one-month-one-row keeps sen rounding, final-month absorption, RB FY segments, ties,
reversal and disposal-stub logic deterministic; and re-ruling would recompute an
acceptance-tested corpus for zero compliance gain. **Conditions carried into the design doc
(WDB-G14):** the convention is stated explicitly in policy wording and receipts; a potentially
material mid-month change (especially near FYE) gets reviewer-visible escalation with an
explicit adjusting-entry route — the agent never invents the difference.

**Owner ruling 2026-08-02: PINNED as stated.** The unruled residual is closed; x42 gains a
mid-month (day-2+) revision cell asserting predecessor ownership, alongside the existing day-1
cells.

## Sources (fetched)

ifrs.org IAS 8 (html-standards 2024) · IFRS for SMEs 2015 Part A + Module 17 PDF · IFRS
Practice Statement 2 · IFRS Foundation Malaysia jurisdiction profile · masb.org.my · SAP Help
(period controls; time-dependent parameters; day-exact option) + three SAP Community threads ·
Oracle Assets docs (prorate conventions; adjustments; 24d/25b/26b cloud) · Microsoft Learn
(D365 Finance conventions; Business Central daily calculation) · Sage Depreciation Fundamentals
+ KB 222924250017755 · ERPNext docs (asset-depreciation; daily-depreciation; shift-allocation) ·
Odoo 17/19 assets docs · Xero Central (calculation methods; change settings) · QuickBooks
Online Advanced FA article · truewind.ai (fixed-assets blog + support) · chatfin.ai · Digits
Automated Schedules · Puzzle help (fixed assets) · zeni.ai blog · openai.com Basis case study ·
dualentry.com · Money Forward press (2026-03-25) · parlimen.gov.my ST.113.2023 (Kuantan Port).
