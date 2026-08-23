# F-T3 — the draft tax computation: estate + law survey (v1)

> **Survey of record for Wave-F Track-B item F-T3** (`docs/plan/active/wave-f-contract.md` §"Track B",
> lines 406-408), read against the standing laws digest (**71, 74, 75, 78, 80, 82**, and **2, 26, 31,
> 34**), hard constraints **2** (the DB owns every authoritative number) and **3**, and the owner's
> **2026-08-23 ALL-IN ruling** — F-T3 is *not* slipped to v1.1. Companions:
> `tax-computation-design.md`, `tax-computation-annexes.md`.
>
> **Every rate, threshold and rule below was re-fetched from LHDN and the Income Tax Act 1967 on
> 2026-08-23** and is cited with URL + fetch date in §6. `docs/phase2-research/accounting-practice-map.md`
> §2.12 was read as a *starting point only*; where it and a fetched source differ, the fetched source
> wins and the divergence is named (§6.4). Two of its claims did **not** survive re-verification as
> stated (§6.4 items a, b).
>
> **Standing caveat.** Everything below read from migration *source* is a prediction about the live
> catalog, not a measurement. F-T3 has run **no rig replay** — this is a design-stage survey and the
> lane authored no code. Every DB claim inherited from the two survey lanes is tagged with its cite
> and carried to F-T3 PR-0's replay. Claims tagged **[PREDICTION]** are the ones a replay can falsify.

---

## 1 · The three findings that reorder everything else

**F1 — the tax layer is greenfield, and the register that should feed it has no consumer.** An
exhaustive grep across every `.sql`, `.ts` and `.mjs` in the repo returns **zero** hits for `cp204`,
`form_c`, `add_back`, `chargeable`, `year_of_assessment`, `schedule 3`, `lhdn`. Nothing to port,
nothing to extend. And the one piece of tax metadata that *does* exist — the trio
`fixed_assets.ca_class` / `is_commercial_vehicle` / `is_new` (`packages/db/migrations/0041:354-357`)
— is written by the register and **read by nothing**, explicitly deferred to Wave F. F-T3 is
WD-R12's first and only consumer.

**F2 — the corpus contains no tax computation, and therefore no oracle.** All three of the owner's
folders were listed read-only (§5). There is **no Form C, no Form B, no Form P, no CP204, no tax
computation worksheet, no fixed-asset register and no depreciation schedule** in any of them. The
only tax-adjacent documents are payroll statutory receipts (four `MyTax.pdf` PCB receipts and one
`RProperties - Form e-CP8D YA2025.pdf`). ADR-0075 §(2) says the corpus is the owner's three folders
and *no oracle exists beyond them or is required* — so F-T3's acceptance **cannot** be "reproduce
the accountant's prior-year computation." What the acceptance oracle *is* becomes owner question
**OQ-1**.

**F3 — the number path F-T3 must ride is live but has never carried a run.** The versioned
deterministic evaluator machinery hard constraint 2 demands exists in full
(`clara.metric_definitions` / `evaluator_versions` / `metric_cells`, frozen by
`clara.verify_evaluator_freeze()`), and the report lifecycle that seals an artifact exists in full
(`report_runs` → `report_datasets` → `report_artifacts` → `render_jobs`). But
`clara.reporting_periods` and `clara.period_snapshots` hold **zero rows**
(`PROGRESS.md:87-89`), no `report_run` has ever been opened, and `seal_report_dataset` does not
call `enqueue_render_job` in-tree (F-A5's gap S9). **F-T3 does not get to discover this at build
time.** It is a hard sequencing dependency (§7).

---

## 2 · The substrate a computation evaluator can read (what exists)

### 2.1 The fixed-asset register — Wave D, complete, tax-blind

| Object | Cite | What it gives F-T3 |
|---|---|---|
| `clara.fixed_assets` | `0003:155-179` + `0041:291-379` | the asset row: cost, in-service date, client scope |
| `.ca_class` / `.is_commercial_vehicle` / `.is_new` | `0041:354-357` | **the CA classification inputs** — captured, computed against by nothing |
| `clara.fa_account_profiles` | `0041:419-451` | the CoA accounts an asset class posts to |
| `clara.fa_depreciation` (append-only) | `0041:519-543` | the **accounting** depreciation charge — an add-back input, never a CA input |
| `clara.fa_depreciation_authorities` | `0041:614-643` | who set the accounting rate |
| `clara.fa_depreciation_runs` | `0041:699-722` | run receipts |
| `dispose_fixed_asset` (verb) | `0041:3644` | disposal posts proceeds/gain/loss; **no columns store them** |

**Absent by measurement, not by assumption:** no initial allowance, no annual allowance, no residual
expenditure, no qualifying expenditure, no balancing allowance or charge, no notional allowance, no
Schedule-3 concept of any kind exists anywhere in the estate.

**The disposal shape is a real design constraint.** Because a disposal posts gain/loss rather than
storing proceeds, the balancing-adjustment evaluator cannot read a `proceeds` column — it must
re-derive disposal proceeds from the posted entry, or F-T3 must add the column. That is design
decision **D-7**.

### 2.2 The chart of accounts — flat, and carries no tax dimension

`clara.coa_accounts` (`0003:47-59`) has `account_type` (5 values), `account_class`
(`{null,payable,receivable}`) and `special_acc_type`
(`{null,rounding,sst_output,sst_purchase_cost,opening_balance_equity,retained_earnings}`). There is
**no tax mapping, no report-line grouping and no parent/child rollup.** The CoA is loaded per client
from CSV through `upsert_account` (`packages/db/scripts/onboard-rpr.mjs`); the only CSV in the repo
is `packages/db/deploy/rpr-coa.csv` = **ROME PROPERTIES SDN BHD** (the "RPR" prefix is ROME
PROPERTIES throughout this estate — *not* ROME PUBLIC ADVISORY; do not conflate them).

**Consequence.** There is no existing surface that says "this account is entertainment" or "this
account is depreciation." The CoA→tax-treatment mapping is a **new layer**, and it may not be
inferred from an account's *name*: review law 3 (spelling is not identity) forbids it, and TA-P8
governs how a learned identifier becomes a key — Clara proposes, a human promotes through an
audited door. Design decision **D-2**.

### 2.3 Period balances and the fiscal year

- `clara.trial_balance(p_client)` (`0004:730-739`) and `clara.trial_balance_as_of(p_client,p_as_of)`
  (`0017:3572-3585`) — SQL, `stable`, invoker-rights, aggregating approved entries. **No P&L view or
  function exists**; every caller classifies by `account_type` itself.
- `clara.fiscal_years` (`0056:232-260`) with `fy_end_source ∈ {asserted, default_1231}` and the
  CA2016 ≤18-month bound; `clients.fy_end_month/day` (`0041:774-779`).
- Reporting grain is `month | fiscal_year` only (`clara.reporting_periods.grain`, `0057:283`).

**The fiscal year is an accounting period, not a basis period.** Nothing in the estate models a
*basis period for a year of assessment* (ITA s.21/s.21A), and the two are not the same object — a
change of accounting date, a first or final period, or a period other than 12 months all break the
identity. Design decision **D-1**.

### 2.4 The sealed close — F-T3's authoritative input

`clara.close_receipts` (`0056:1508-1536`) carries `pl_net_cents`, `closing_tb_digest`,
`books_watermark`, `evaluator_version_ids` and `snapshot->'closing_position'` (per-account cents,
trigger-enforced at `0056:1546-1556`). There is **no persisted trial-balance table** — `finalize_close`
calls `trial_balance_as_of` and pins the result into the receipt. "This year is closed" =
`fiscal_years.status='closed'` **and** one active `close_receipts` row (`uq_cr_one_active_close`).

**This is the only lawful accounting-profit input for F-T3.** A computation that reads
`trial_balance()` live instead of the sealed receipt would produce a number that changes underneath
a filed return. The wall is: no active `close_receipts` row for the fiscal year ⇒ **refuse by name**,
never compute.

### 2.5 Entity identity — the biggest hole

`clara.clients` is `id, firm_id, name, status, fy_end_month, fy_end_day` and **nothing else**. No
TIN, no SSM registration number, no entity-type column, no incorporation date, no paid-up capital,
no shareholding. The mechanism that carries such things is the generic fact store `0055`:
`client_fact_keys` (catalog) + `client_facts` (with `basis` / `basis_kind`), one audited door
`record_client_fact`. Keys registered today: `entity_type`
(`sdn_bhd|bhd|sole_prop|partnership|llp|society|cooperative|other`), `msic` (format-checked only),
`trade_nature`, `customer_identity_policy`.

**Every single input to the SME-rate test is therefore missing**: paid-up ordinary share capital at
the beginning of the basis period, gross business income for the basis period (derivable), the
related-company test, and the YA2024 20% foreign/non-citizen shareholding test. So is the TIN the
Form C needs. F-T3 must mint these as fact keys through a migration and write them through the
existing `record_client_fact` door — it may not add columns to `clients`. Design decision **D-3**.

Note the generic name-only wall (`0062`/`0063`) is untouched by ADR-0075 and stays: a client flagged
name-only is never enriched. That wall is about a client's *customers*, not the client itself, so it
does not block D-3 — but the battery must prove it still bites while D-3's keys exist.

---

## 3 · The number path — the only lawful way a tax figure can exist

Inherited from the F-A5/F-A4 survey lane, byte-cited, not re-derived here.

**3.1 The evaluator.** `clara.metric_definitions` / `metric_definition_versions` (`0058:139`);
`evaluator_versions` + `evaluator_version_members` (`0058:213`), frozen by
`clara.verify_evaluator_freeze()` (`0059:248`; enforced at `packages/db/scripts/migrate.mjs:63-82,
243-252`). Results land in `clara.metric_cells` (`0058:239-263`) carrying `formula_sha256`,
`resolved_inputs_sha256`, `evaluator_version_id`, `exact_numerator` / `exact_denominator`,
`displayed_text`, and `cell_status ∈ ('ok','undefined','absent','refused')`; periods via
`metric_cell_periods`. Inputs are snapshotted through `metric_input_snapshots` (`0058:483-485`, a
second frozen closure of 15 members).

**A new evaluator is a migration.** New `_vN` function + an **appended, undeployed**
`evaluator_versions` row whose `deployed` flip is a ceremony act (`_tf_evaluator_deploy_once`,
`0060:93-100`). F-T3 cannot ship a tax number any other way.

**3.2 The sealed artifact.** `report_runs` (`0065:369-401`, state `drafting → dataset_sealed →
issued`, with `issue_mode`); `report_claim_assessments` (`0066:126`); `report_datasets` /
`report_dataset_points` (FK to `cell_id`); `report_artifacts` (`0066:264-306`, insert-once, `kind ∈
{draft_watermarked, pre_sign, signed_original}`); render via `render_jobs` (`0079`-`0083`,
`enqueue_render_job` at `0080:254`). **Gap S9 is confirmed:** `seal_report_dataset` never calls
`enqueue_render_job` in-tree except a fallback sweep (`0080:369-385`) — F-A5 owns that repair. The
issue segregation wall (`0072:93-108`) evaporates on agent-filled actors; F-A5 §3.3 repairs it.

**3.3 Templates.** `publish_report_template_version` (`0069:109`) **refuses `report_class='statutory'`
from anything but the human admin verb** (`0069:121`). `statutory_wording` has **zero seeded rows**
until human verification (task #43). And **fixed-layout boxed-form rendering is UNBUILT** — the
Typst 0.12.0 engine in `packages/reporting-render` carries a chart/line AST only.

**Consequence for F-T3.** A Form C or CP204 template is a **statutory-class** template, published by
the human admin, with owner-signed wording, and v1 cannot render a pixel replica of an LHDN form
even if the owner wanted one. Design decision **D-8**; owner question **OQ-4**.

**3.4 The citation carrier does not exist yet.** Both candidates are design-only: F-A8's
`web_fetch_receipts` / `web_fetch_citations` (url, accessed_at, quote; deferred must-cite trigger)
and F-A5's `report_agent_receipts.basis_citations jsonb`. **Nothing is built.** An add-back
judgement carrying "s.39(1)(l), PR 4/2015" has no home in the live schema today. Design decision
**D-5**.

---

## 4 · Absence census (stated, so it is evidence)

Each line was *searched for* and *not found*; none is an assumption.

| # | Thing | Searched | Result |
|---|---|---|---|
| A1 | any `tax_*` table or function | all `.sql` | none (SST aside, F-T1's) |
| A2 | `cp204`, `form_c`, `chargeable`, `add_back`, `year_of_assessment` | every SQL, TS and MJS file | zero hits |
| A3 | IA / AA / residual expenditure / QE / balancing charge | all `.sql` | zero |
| A4 | a rate or threshold table for income tax | `0016` Tier-1 family | not among the Tier-1 tables |
| A5 | a CoA→tax-line or CoA→report-line map | all `.sql` | none |
| A6 | a P&L view or function | all `.sql` | none (`account_type` classified by callers) |
| A7 | client TIN / registration / paid-up capital / shareholding | `clients`, `client_fact_keys` | none registered |
| A8 | a basis-period model | all `.sql` | none (fiscal years only) |
| A9 | a statutory-form renderer | `packages/reporting-render` | chart/line AST only |
| A10 | a citation table | all `.sql` | none |
| A11 | a tax computation / Form C in the corpus | the owner's three folders | none (§5) |

---

## 5 · The corpus, listed read-only (2026-08-23)

Nothing in the owner's folders was opened for content — the lane has no PDF text extractor for
scanned statements and did not need one for an inventory. Counts are file counts.

**`C:/Users/zhant/Desktop/BEE CREATIVE - Accounts`** — `BEE CREATIVE YA2024` (bank statements HLB ×12;
`Bee Creative - Expenses 2024` incl. **Food/**, **Petrol/**, a `BODY CHECK- RM900-25122024.pdf`, a
`MEDICAL - RM526.00` and a Maxis telco bill; purchases ×~25; sales invoices `INV2024001-012`;
`BEE CREATIVE - Management Accounts YA2024.pdf`), and `BEE CREATIVE YA2025`
(`BEE CREATIVE - Management Accounts YA2025.pdf`, plus
plus a markdown note whose filename records a FY2025 close packet archived and deferred to Wave G).

**`C:/Users/zhant/Desktop/Rome Properties YA2025 Files`** — 117 files across `RPR - Bank Statement`,
`RPR - Journal Voucher` (incl. `RPRJV202502002 - SHARE CAPITAL - RM1,000.pdf`),
`RPR - Management Accounts` (Balance Sheet / General Ledger / **P&L** / **Trial Balance**, YA2025),
`RPR - Payroll` (EA Forms, salary slips, `RPR - Statutory` with four `MyTax.pdf` PCB receipts for
07-10.25, and `RProperties - Form e-CP8D YA2025.pdf`), `RPR - Sales Invoice`, `RPR - Supplier Invoice`.

**`C:/Users/zhant/Desktop/RS - YA2025`** — 87 files: `RS - Bank Statement` (Alliance, Maybank),
`RS - Management Account` (Balance Sheet / General Ledger / P&L), `RS - Sales Invoice`,
`RS - Supplier Invoice`.

**`C:/Users/zhant/Desktop/2025 Tax`** — **empty** (zero files; directory exists).

### What this means for F-T3

1. **No tax-computation oracle exists** (finding F2). → **OQ-1**.
2. **No fixed-asset register or depreciation schedule exists in the corpus either** — so the
   capital-allowance evaluator has no real-world asset population to be tested against until the
   Wave-G reset seeds one. → **OQ-2**.
3. **RPR has a trial balance PDF; BEE and RS do not** (BEE and RS have management accounts / GL).
   The three clients are not at the same evidentiary depth.
4. **The judgement corpus is real even though the computation corpus is empty.** BEE's expense
   tree is precisely the add-back population a tax agent argues about: a **Food** folder (s.39(1)(l)
   entertainment, or private), a **Petrol** folder (business vs private apportionment), a body check and a
   medical bill (private / staff benefit), a telco bill (apportionment). F-T3's *judgement* half can
   be exercised against BEE without any Form C. Its *arithmetic* half cannot be validated against a
   real return at all in Wave F.
5. **The two entity regimes both appear.** ROME PROPERTIES SDN BHD and ROME SECRETARY are companies
   (Form C, CP204). **BEE CREATIVE SOLUTION is a sole proprietorship** (`entity_type='sole_prop'`,
   `docs/plan/active/wave-e-acceptance-matrix-part2.md:31`; digest law at `docs/adr/README.md:214`
   — the proprietor is not an employee, his account is EQUITY) and is **tax-transparent**: no entity
   tax charge, no Form C, no CP204. F-T3 must refuse an entity tax charge for a transparent entity,
   not compute zero. Design decision **D-9**.

---

## 6 · The law, re-fetched 2026-08-23

Every URL below was fetched **today, 2026-08-23**. Where a fetch failed or a source was secondary,
it is said so.

### 6.1 Sources ledger

| # | Source | URL | Published | Fetched |
|---|---|---|---|---|
| L1 | **PR No. 8/2025** — Tax Treatment for Micro, Small and Medium Companies | `https://www.hasil.gov.my/wp-content/uploads/pr-8-2025-tax-treatment-for-micro-small-and-medium-companies.pdf` | 22 Dec 2025 | 2026-08-23 |
| L2 | LHDN — Company Tax Rates (*Kadar Cukai Syarikat*) | `https://www.hasil.gov.my/en/syarikat/kadar-cukai-syarikat/` | — | 2026-08-23 |
| L3 | LHDN — Individual Tax Rates (*Kadar Cukai*) | `https://www.hasil.gov.my/en/individu/kadar-cukai/` | — | 2026-08-23 |
| L4 | LHDN — Tax Estimation / CP204 (*Anggaran Cukai*) | `https://www.hasil.gov.my/en/syarikat/anggaran-cukai/` | — | 2026-08-23 |
| L5 | LHDN — **Return Form Filing Programme for 2026** | `https://www.hasil.gov.my/wp-content/uploads/program-memfail-bn-bagi-tahun-2026.pdf` | issued 30 Dec 2025 | 2026-08-23 |
| L6 | **PR No. 12/2014** — Qualifying Plant and Machinery for Claiming Capital Allowances | `https://www.hasil.gov.my/wp-content/uploads/PR_12_2014.pdf` | 31 Dec 2014 | 2026-08-23 |
| L7 | **PR No. 6/2015** — Qualifying Expenditure and Computation of Capital Allowances | `http://lampiran1.hasil.gov.my/pdf/pdfam/PR_6_2015.pdf` | 27 Aug 2015 | 2026-08-23 |
| L8 | **PR No. 3/2018** — Qualifying Expenditure and Computation of Industrial Building Allowances | `http://lampiran1.hasil.gov.my/pdf/pdfam/PR_03_2018.pdf` | 12 Sep 2018 | 2026-08-23 |
| L9 | **Income Tax Act 1967 (Act 53)** — LHDN consolidated copy | `https://www.hasil.gov.my/wp-content/uploads/20240521-akta-cukai-pendapatan-1967-akta-53.pdf` | as at 21 May 2024 | 2026-08-23 |

**Fetch failures, recorded rather than papered over.** `phl.hasil.gov.my` did not resolve;
the AGC Laws-of-Malaysia act-detail endpoint returned `Invalid request` to a non-browser client and
`www.federalgazette.agc.gov.my` did not resolve. **No gazette order (P.U.(A)) was read at its own
official text today.** L9 is LHDN's own consolidated copy of Act 53, which is an official
publication but is stamped *as at 21 May 2024* — later amendments are not in it. Both facts feed
design decision **D-4** and owner question **OQ-3**.

### 6.2 What was verified, verbatim-grounded

**Company rates.** Standard 24% (L1 §6.2.1). MSMC bands *starting from YA2023*, unchanged into
YA2025 (L1 Table 5, §6.2.2): **15%** on the first RM150,000 · **17%** on RM150,001–RM600,000 ·
**24%** on the excess. L2's own page still shows only "Year Assessment 2023-2024" — the page lags;
L1, published 22 Dec 2025, is the current authority and states the bands as running from YA2023 with
no later change. *(Divergence noted, not resolved by inference: see D-4.)*

**MSMC conditions** (L1 §6.2.1(a)-(d); definitions at §5.2, §5.3.1-5.3.3):
(a) resident **and** incorporated in Malaysia (registered, for an LLP);
(b) paid-up ordinary share capital ≤ **RM2.5 million** *at the beginning of the basis period for a
YA* (capital contribution, for an LLP);
(c) gross income from a business source or sources ≤ **RM50 million** *in the basis period for a YA*;
(d) shareholding restriction — disqualified if >50% of the paid-up ordinary share capital is owned
directly or indirectly by a **related company** (a company whose own paid-up ordinary share capital
exceeds RM2.5m at the beginning of the basis period), **and, effective YA2024**, disqualified if
**more than 20%** of the paid-up ordinary share capital or LLP capital contribution *at the beginning
of the basis period for a YA* is owned directly or indirectly by **one or more foreign companies
incorporated outside Malaysia or one or more individuals who are not Malaysian citizens**.
The identically-worded 20% test appears in the Act at **Schedule 3 paragraph 19A(4)(d)** (L9), with
"related company" defined at 19A(5) as paid-up > RM2.5m.
Excluded from the special rate regardless: a business trust, and an ABS special-purpose company
(L1 §6.2.3).

**Capital allowance rates** (L6 §5, being Schedule 3 + P.U.(A) 52/2000):

| Category of qualifying asset | Initial allowance | Annual allowance |
|---|---|---|
| Heavy machinery, motor vehicle | 20% | 20% |
| Plant and machinery | 20% | 14% |
| Others (office equipment, furniture and fittings) | 20% | 10% |

L6 §5 states these three rates apply to any asset regardless of industry, and **do not** apply to
assets eligible for industrial building allowance, agriculture allowance, forest allowance, or the
specified assets carrying special rates.

**Industrial building allowance:** IA **10%**, AA **3%** (L8, worked example at p.~29 —
`IA (10% × RM450,000)`, `AA (3% × RM450,000)`).

**Motor-vehicle QE restriction** (L7 §(b)): for a vehicle **not** licensed for commercial
transportation of goods or passengers, QE is restricted to **RM100,000** if (i) the vehicle is new
*and* (ii) total cost does not exceed **RM150,000**; **otherwise RM50,000**. "New" = never used;
excludes used and reconditioned vehicles.

**Small value assets** (L9 Schedule 3 para 19A; L1 §6.3): each asset ≤ **RM2,000**, allowance equal
to the full expenditure in lieu of IA/AA; the proviso caps the total at **RM20,000** per YA; **para
19A(3) disapplies the cap** for a company resident and incorporated in Malaysia meeting the MSMC
criteria — L1 Table 6 states the maximum limit as **"No limit"** from YA2020. Not available to an
LLP, a business trust or an ABS SPV (L1 §6.3.4). L1 §6.3.5 points to **PR No. 3/2021** for detail
(not fetched — **D-4**).

**The ladder, in the Act** (L9 contents + text): Chapter 4 *Adjusted income and adjusted loss* —
**s.33(1)** ("deducting from the gross income … all outgoings and expenses **wholly and exclusively
incurred** during that period … in the production of gross income from that source") and **s.39(1)**
*Deductions not allowed*, whose paragraphs include **(a)** domestic or private expenses · **(b)** not
wholly and exclusively laid out for producing gross income · **(c)** capital withdrawn or employed as
capital · **(e)** qualifying expenditure for the purposes of Schedule 2/3/4 · **(k)** motor-vehicle
rentals above RM50,000 (RM100,000 where unused before the rental and total cost ≤ RM150,000, with an
aggregate lifetime cap) · **(l)** *"a sum equal to fifty percent of any expenses incurred in the
provision of entertainment"*, subject to seven provisos (i)-(vii) · **(m)** leave passage.
Then Chapter 5 **s.42** statutory income · Chapter 6 **s.43** aggregate income and **s.44** total
income, with **s.44(6)** capping approved-institution cash donations at **10% of aggregate income**,
and **s.44(5F)** limiting a carried-forward amount to **ten consecutive years of assessment**, the
balance disregarded thereafter.

**CP204 / s.107C** (L9 s.107C; L4; L1 §6.6):
- (1)-(2) every company, LLP, trust body or co-operative society furnishes an estimate, in the
  prescribed form, **not later than 30 days before the beginning of the basis period** for that YA.
- (3) the estimate **shall not be less than 85%** of the *revised* estimate for the immediately
  preceding YA, or of the *original* estimate if no revision was furnished.
- (4) a taxpayer first commencing operation in a YA whose basis period is **not less than six
  months** furnishes within **three months** of commencement; (2) and (3) apply from the second YA;
  instalments run **from the sixth month** of the basis period.
- (4A)-(4C) a company **resident and incorporated in Malaysia** first commencing operation is
  relieved of (1)-(3) for that YA and the immediate following YA (or the two following, where there
  is no basis period), provided paid-up ordinary share capital is **RM2,500,000 or less** at the
  beginning of each of those basis periods; L1 §6.6.2 adds that from **YA2024** the >20%
  foreign/non-citizen holding disqualifies this relief too.
- (7) a revised estimate may be furnished **in the sixth, ninth or eleventh month, or in all three**;
  an increase is spread over the remaining instalments, a decrease stops them immediately.
- (7A) the estimate and any revision must be furnished **electronically** (s.152A). L4: companies
  from YA2018, LLPs/trusts/co-ops from YA2019.
- Instalments are **equal monthly** amounts determined by the number of months in the basis period,
  due on the **15th of the calendar month** (L4), beginning from the **2nd month** of the basis
  period for an established taxpayer (L4) and the **6th month** for a new one (L9 s.107C(6)).
- (9) an unpaid instalment is increased by **10%**.
- (10) where the tax payable under the assessment exceeds the latest revised estimate (or the
  estimate, if none) **by more than 30% of the tax payable under the assessment**, the difference
  between that excess and 30% of the tax payable is increased by **10%**.
- A taxpayer that has **not commenced operations** need not furnish CP204 (L5 note 3(i)(b)); a
  **dormant** taxpayer must still furnish the return form (L5 note 3(i)(a)).

**Filing deadlines** (L5, LHDN's Filing Programme for 2026, issued 30 Dec 2025):

| Form | Category | Statutory due date | e-Filing extension |
|---|---|---|---|
| **e-C** | Company | **within 7 months from the date following the close of the accounting period** | **1 month** |
| e-PT | LLP | same | 1 month |
| **e-B** | Resident individual carrying on business, YA2025 | **30 June 2026** | **15 days** |
| **e-P** | Partnership, YA2025 | **30 June 2026** | **15 days** |
| e-BE | Resident individual not carrying on business, YA2025 | 30 April 2026 | 15 days |
| e-E | Employer, remuneration year 2025 | 31 March 2026 | 1 month |

The same column heading governs the **balance of tax** ("Tambahan Masa bagi Pengemukaan BN dan
Bayaran Baki Cukai") — the extension covers submission and payment of the balance together.

**Resident individual rates, YA2023 / YA2024 / YA2025** (L3 — one table covering all three):

| Chargeable income (RM) | Rate on excess | Cumulative tax at lower limit (RM) |
|---|---|---|
| 0 – 5,000 | 0% | 0 |
| 5,001 – 20,000 | 1% | 0 |
| 20,001 – 35,000 | 3% | 150 |
| 35,001 – 50,000 | 6% | 600 |
| 50,001 – 70,000 | 11% | 1,500 |
| 70,001 – 100,000 | 19% | 3,700 |
| 100,001 – 400,000 | 25% | 9,400 |
| 400,001 – 600,000 | 26% | 84,400 |
| 600,001 – 2,000,000 | 28% | 136,400 |
| Exceeding 2,000,000 | 30% | 528,400 |

### 6.3 Verified as *unverified* — the honest list

These are needed by the design and were **not** established from an official source today. Each one
is a Tier-1 row that cannot land until it is (§7, D-4):

| # | Item | Status today |
|---|---|---|
| U1 | **P.U.(A) 328/2024** — ICT equipment & customised software ACA at IA **40%** / AA **20%** from YA2024 | gazette text not readable (AGC portals down); confirmed only by professional-firm secondaries (PwC TaXavvy 32/2024, Moore, EY). **Not landable as a Tier-1 row on this evidence.** |
| U2 | PR No. 3/2021 *Special Allowance for Small Value Assets* | referenced by L1 §6.3.5; not fetched |
| U3 | PR No. 4/2015 *Entertainment Expense* (the s.39(1)(l) provisos in operational form) | not fetched |
| U4 | PR No. 4/2019 *Trade / doubtful debts* (specific vs general provision) | not fetched |
| U5 | PR No. 1/2022 *Tax treatment of losses* | not fetched |
| U6 | CP500 (individual bimonthly instalments) and CP502 revision by 30 June | not fetched |
| U7 | Whether Act 53's 21 May 2024 consolidation is superseded by any 2025/2026 Finance Act amendment touching s.33/s.39/s.44/s.107C or Schedule 1/3 | **unknown** — the consolidated copy is stamped as at 21 May 2024 |
| U8 | An individual's basis period for a business source where the accounting date is not 31 December | contested in practice; not settled from L9 today |

### 6.4 Where the prior research did not survive re-verification as stated

`docs/phase2-research/accounting-practice-map.md` §2.12 is a good map and most of it held. Two
claims did not, and one is materially wrong:

**(a) "book depreciation (s.39(1)(b))".** L9's s.39(1)(b) disallows *"disbursements or expenses not
being money wholly and exclusively laid out or expended for the purpose of producing the gross
income."* Depreciation is not disallowed for that reason; it is disallowed because it is a capital
write-off — the operative provisions are **s.33(1)** (it is not an outgoing or expense incurred) and
**s.39(1)(c)** / **(e)**. A computation that prints "s.39(1)(b)" beside a depreciation add-back is
citing the wrong paragraph on a document a human signs. **This is exactly the class of error F-T3's
design must make structurally impossible**, and it is why D-5 puts the citation on an owner-signed
treatment code rather than on a per-run model output.

**(b) "unabsorbed CA carries indefinitely, business losses cap at 10 YAs (PR 1/2022)".** The 10-YA
limit is confirmed at the Act (**s.44(5F)**, L9). The "indefinitely" half for unabsorbed capital
allowances was **not** verified today and is subject to Schedule 3 para 75/75A continuity conditions
— it goes to U5 and stays out of the evaluator until read.

**(c) "MSME eligibility unconfirmed → draft at standard 24%, surface the conditions."** This is the
frozen build's honesty layer, and F-T3 should **not** inherit it. Defaulting an unproven premise to
a rate is a fabricated number in a durable artifact (hard constraint 2; digest law 31 — a derived
state is not evidence). The design's answer is a three-valued refusal that names the missing fact.
Design decision **D-6**; owner question **OQ-5**.

---

## 7 · Dependencies and sequencing (what F-T3 cannot start without)

| # | Depends on | Why | Blocking? |
|---|---|---|---|
| S1 | **F-A5 PR-1** — the open→evaluate→seal→render closure, incl. gap S9 | the computation IS a report; there is no other sealed-artifact path | **hard** |
| S2 | **F-A4** — a real `close_receipts` row for a fiscal year | the only lawful accounting-profit input; the chain has never run | **hard** |
| S3 | F-A5's statutory-template + `statutory_wording` human acts | Form C / CP204 templates are statutory-class | hard for the *artifact*, not for the evaluator |
| S4 | A citation carrier (F-A5 `basis_citations` or F-A8 `web_fetch_citations`) | every add-back judgement must be cited | **hard** — D-5 chooses |
| S5 | Wave D's FA register | exists; needs no change except D-7's disposal proceeds | soft |
| S6 | **TA-P2's governed Tier-1 door** | the rate/CA/threshold tables must land through it | **hard** — and it collides (below) |

**The Tier-1 collision, named.** The contract's F-A8 section says *"Tier-1 **CLOSES to three tables**
for Wave F: `fx_rates` + the SST rate table + the SST threshold table. **Income-tax bands, capital
allowances**, EPF/SOCSO/EIS, stamp duty and MTD are explicitly **out until their own consumers land
(F-T2/F-T3)**"* (`wave-f-contract.md:342-344`). The owner's 2026-08-23 ALL-IN ruling lands F-T3 *in
Wave F* — so its consumer has landed, inside the wave the closure was scoped to. Either Tier-1
re-opens for two more tables in Wave F, or F-T3 carries its own policy tables outside the TA-P2 door.
The second option is worse (two governed-row mechanisms is two architectures — digest law 81). This
is **OQ-6**, and it is a contract amendment, not a build choice.

---

## 8 · What this survey could not do

1. **No rig replay.** No live body was re-derived by `pg_get_functiondef`; no `prosrc` sha is pinned.
   Every DB cite here is source-read. F-T3 PR-0 owes the replay.
2. **No corpus content was read** — only filenames. The lane had no PDF text extractor for the
   owner's scanned documents at inventory time and did not need one; but it means *"BEE's Food folder
   is entertainment"* is an inference from a folder name, not a reading of a receipt. It is offered
   as a candidate population, never as a classification.
3. **No gazette (P.U.(A)) text was read** at an official source (§6.1 fetch failures). U1 in
   particular is a rate the design needs and cannot yet have.
4. **Act 53 as read is stamped 21 May 2024.** Any 2025 or 2026 Finance Act amendment to the
   provisions relied on here is invisible to this survey (U7).
5. **F-T1's SST design was not read** — it was authored in a parallel lane during this survey and
   may not exist on `main` yet. Where F-T3 and F-T1 share a policy-table shape, the conductor owns
   the merge order (shared surface: the Tier-1 family).
