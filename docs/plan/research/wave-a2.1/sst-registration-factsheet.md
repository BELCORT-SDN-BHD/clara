# SST registration-threshold fact-sheet (Wave A2.1)

> The research doc ADR-027 referenced as "on file" — now actually on file. Compiled
> 2026-07-22 from OFFICIAL sources (Service Tax Act 2018 consolidated text; RMCD
> guides) with Malaysian practice commentary as secondary. **§6 lists what could NOT
> be primary-verified — read it before hard-coding anything.** This sheet feeds the
> Wave A2.1 structural threshold-visibility design; it is reference, not law — the
> Act and the current Regulations control.

## 1. The statutory test (Service Tax Act 2018, s.12(2))

Liability to register arises at the **earlier** of two **month-end** tests:

- **Historical:** at the end of any month, the total value of taxable services in
  *that month + the 11 preceding months* has exceeded the threshold (RM500,000 for
  Group G and Group I services).
- **Future:** at the end of any month, there are *reasonable grounds for believing*
  the total for *that month + the 11 succeeding months* will exceed the threshold.

**The statutory evaluation point is the end of every month** — a monthly rolling
check is the law itself, not a best practice. The future method is mandatory once a
reasonable basis exists (e.g. one large signed mandate can create liability at the
next month-end with low trailing turnover); RMCD may challenge projections with
hindsight, so a contemporaneous documented analysis — including any conclusion that
a client is *not yet* liable — is the professional-defense artifact.

## 2. Deadlines, effective date, and the cost of lateness

- **Apply** by the **last day of the month following** the liability month (s.13(1)).
- **Registration effective** (and tax chargeable) from the **first day of the month
  following the application month**, or an earlier agreed date (s.13(3)). Crossing →
  first chargeable invoice is roughly a 1–2 month runway.
- **Late discovery is retroactive** (s.13(4) + s.25(1)): the first taxable period
  runs *from the date registration should have happened* — tax never charged to
  customers is absorbed by the business — plus late-payment penalties 10%+15%+15%
  (max 40%, s.26(7)), and offence exposure (s.13(5)/s.79: fine ≤ RM30,000 and/or
  ≤ 2 years; return/payment offences ≤ RM50,000 / 3 years, s.26). Practice note:
  voluntary disclosure before audit attracts RMCD leniency.
- **This retroactivity is the money case for an early-warning tier**: the warning's
  value is precisely the RM exposure between crossing and detection.

## 3. What counts toward the threshold (a CLASSIFIED sum, not raw revenue)

| Component | Counts? | Basis |
|---|---|---|
| Taxable services (value excl. the tax) | ✅ | s.12; RMCD registration guide |
| **B2B same-service-exempt** turnover | ✅ **counts** | exemption from *payment* only (Exemption Order 2018 Item 1); declared in SST-02 18(c) — see §6 caveat |
| **Intra-group-relieved** turnover | ❌ excluded | First Schedule: "shall not be a taxable service" |
| Out-of-scope services (e.g. land outside MY) | ❌ excluded | not taxable services |
| Disbursements (strict agent test: known third-party provider, exact amount, discharges customer's own obligation) | ❌ excluded | RMCD Disbursement & Reimbursement guide |
| Reimbursements (any mark-up/alteration → principal) | ✅ full amount | same guide |

**Aggregation is per GROUP:** professional-category groups compute separately —
Group G and Group I sums do **not** combine, but multiple services *within* one
group **do** (registration guide paras 13–15 + FAQ 3; see §6 tension note). A
property agency doing Group G estate-agency work *and* Group I brokerage runs
**two separate threshold watches**.

## 4. The groups that catch a property agency

- **Group G (professional):** estate agency sits under the surveying item —
  "licensed or registered surveyors including … estate agents", covering valuation,
  appraisal, estate agency, property management, rental arrangement. RM500,000
  threshold; 6% → **8% from 1 Mar 2024** (professional services not among the
  excepted categories).
- **Group I item 12 (brokerage):** expanded **effective 26 Feb 2024** from financial
  to non-financial brokerage **expressly including real estate** ("hartanah");
  8% from 1 Mar 2024; RM500,000. Post-1-Jul-2025 restructure: financial brokerage
  moved to Group H item 3; Group I item 12 = brokerage *excluding* financial — i.e.
  real-estate brokerage commission lives here.
- **Rate/group metadata is temporal** (6%→8% on 1-Mar-2024; scope change 26-Feb-2024;
  the 1-Jul-2025 regrouping): store group/item/rate as **effective-dated versioned
  reference data**, never constants.

## 5. Exemptions, relief, and their traps

- **Intra-group relief** (Group G items (a)–(i),(l) — not employment/private-agency):
  same-group services are not taxable. **Evaporation rule:** providing the *same
  service* to anyone outside the group makes it taxable for ALL provisions — unless
  the **5% de-minimis** holds: outside-group value of that service in *the month +
  11 succeeding* ≤ 5% of the service's total. **The de-minimis test is itself a
  forward 12-month rolling watch** — a second monitor, and a breach is compounding
  (relieved turnover re-enters the threshold sum). Group = >50% control, or 20–50%
  plus board-appointment power.
- **B2B same-service exemption** (since 1 Jan 2019): registered provider → customer
  who is registered *for the same service* and provides it onward (end consumers
  never qualify). Invoicing duties: customer's registration number + exempted tax
  shown; SST-02 column 18(c). Turnover still counts toward the threshold (§3).
- **No auto-deregistration on a dip** (s.18–20): cessation of liability needs DG
  satisfaction; dips from ≥30-day suspensions don't count; written notification
  within 30 days; DG *may* cancel. **Registration status is sticky human-recorded
  state — never inferred from turnover data.**
- **Voluntary registration** (s.14) exists — relevant for a hovering client wanting
  B2B-exemption eligibility or de-risking backdating.
- **Anti-splitting** (s.15): the DG can consolidate artificially separated
  businesses into a single taxable person.

## 6. NOT primary-verified — do not hard-code without confirming

1. The per-group aggregation reading (combine within group, not across) resolves a
   mild tension between the 2018 guide's para 14 and FAQ 3 — confirm against the
   current First Schedule before relying on it for a multi-stream client.
2. The English registration guide used is the archived **27 Aug 2018** edition (the
   live MySST restructure broke old URLs); mechanics track the Act verbatim, but a
   newer edition may exist.
3. Post-1-Jul-2025 consolidated **item numbering** (Group H item 3 / Group I item
   12) is taken from the 29-Dec-2025 RMCD brokerage guide, not the amending
   regulations' text.
4. Whether the 5% de-minimis wording survives unchanged in the post-2025
   consolidated regulations — verified only via the 2021 guide.
5. "B2B-exempt turnover counts toward the threshold" is **derived** from the legal
   mechanism (payment exemption vs not-a-taxable-service) + the 18(c) declaration —
   no verbatim RMCD sentence found.
6. The ~80% early-warning tier is a **practice heuristic** (TaxJar uses 75%,
   Avalara ~80–90% per secondary sources) — no RMCD basis; the statutory alert is
   the month-end crossing itself. Label it as configurable practice, not law.
7. The 31-Dec-2025 penalty-grace window applied to the 2025 scope-expansion
   services (secondary-sourced); no analogous 2026 concession may be assumed.

## Sources

Official: Service Tax Act 2018 consolidated (investmalaysia.gov.my copy — ss.12–15,
18–20, 25(1), 26, 79) · RMCD Guide on Service Tax Registration (27-Aug-2018, via
Internet Archive) · RMCD Guide on Professional Services (21-Sep-2021) · RMCD
Panduan Pembrokeran (29-Dec-2025, Malay) · RMCD Guide on Disbursement &
Reimbursement (15-Sep-2020) · mysst.customs.gov.my/industry-guides/ (current index;
guide PDFs now served from RMCD's R2 bucket — old /assets/document/ URLs 404).
Secondary (MY practice): Thannees (late-registration/penalties/hindsight-challenge),
CCS & Co (s.13 mechanics), 3E Accounting (penalty stack), ClearTax MY (2025 grace
window), customsstmsia.blogspot (intra-group commentary).
