# F-T1 — the SST engine: estate survey v1

> **Scope:** `docs/plan/active/wave-f-contract.md` § *Track B* · **F-T1** — "registration/taxable-period
> model incl. DG variations; service tax payment basis on real AR anchors + s.11(2) + bad-debt relief +
> credit/debit-note deductions; sales tax accrual; dual-registrant separation surviving export; the SST-02
> return with per-field mapping + NIL validity + imported-taxable-services reverse charge", plus the
> **[TA-2026-08-22]** amendments that reach this item: **TA-P11** (SST-02 gets its own form producer; the
> dissolved 7A-R3 residual is handed here), **TA-P2** (Tier-1 closes to three tables — the SST **rate**
> table is F-T1's to build), **TA-P5/law 80** (a clock may wake her), **R-L22** (statutory due dates are
> ONE fact in F-A4's `statutory_deadlines`; F-T1 contributes rows + consumers only).
>
> Companions: `sst-engine-design.md` (the design of record) · `sst-engine-annexes.md` (mechanics,
> decision register, predictions, owner questions).
>
> **Discipline.** Every code claim below is at the bytes, `file:line`, read on `origin/main` at
> `1f33268`. Every statutory claim is either **VERIFIED** against an official RMCD/LHDN/AGC page with
> the URL and the date it was fetched, or marked **UNVERIFIED** — no claim rests on recalled law
> (review law 2: absence is not evidence, and a dossier is not a primary source). Where this survey
> could not settle a live behaviour from source alone it is named a **PREDICTION** for the build's rig
> replay, never asserted as measured.
>
> **No rig was run for this survey.** Nothing below is a `pg_get_functiondef` replay; the bodies cited
> are migration text at the line given, and §6/R1 records the consequence.

---

## 1 · What already exists

### 1.1 The A2.1 SST compliance-watch belt (`0016_a21_compliance_watch.sql`) — the largest existing asset

This migration is the only SST *engine* code in the estate. It answers exactly one question — *is this
client about to cross the service-tax registration threshold?* — and it answers it well. F-T1 extends
it; it does not replace it.

| Artifact | Line | What it is |
|---|---|---|
| `clara.sst_threshold_schedule` | `0016:237-244` | Effective-dated per-service-group registration threshold. **Composite PK `(service_group, effective_from)`, no `id`.** `threshold_cents bigint`, `effective_from`/`effective_to`, `source_note not null check (btrim<>'')`. |
| its two seed rows | `0016:245-248` | `('G', 50000000, '2018-09-01', null, …)` and `('I', 50000000, '2018-09-01', null, …)` — RM500,000, both still open (`effective_to is null`). |
| `clara.client_turnover_accounts` | `0016:252-274` | Tri-state, effective-dated per-(client, account) turnover classification: `included` / `excluded` / `unknown_or_mixed`, optional `service_group`. **A MISSING row means `unknown_or_mixed` — an evaluator-side rule, never a stored default.** |
| `clara.sst_future_attestations` | `0016:277-292` | Human-attested future-method records (amount, horizon, evidence, reviewer, as-of, expiry). Append-only. |
| `clara.compliance_watches` | `0016:298-349` | The durable per-(client, service_group) case. `watch_kind` CHECK admits **exactly one value, `'sst_registration'`** (`:304`). States `monitored`/`early_warning`/`crossed`/`overdue`/`resolved`. Ack/snooze are OVERLAYS. `next_rearm_cents`/`next_rearm_at` make re-arm DATA. |
| `uq_compliance_watches_one_open` | `0016:352-354` | One open episode per `(client_id, service_group, watch_kind) where state<>'resolved'`. |
| `clara.compliance_watch_events` | `0016:359-371` | Append-only disposition trail; `event_kind in ('created','tier_change','acknowledged','snoozed','re_armed','resolved','evaluation')`. |
| `clara.compliance_eval_runs` | `0016:375+` | Append-only evaluation receipts; a receipt older than 48h is itself a surfaced condition. |
| `clara.evaluate_sst_watch(uuid,text)` | `0016:471` | The per-client evaluator. |
| `clara.evaluate_sst_watches_all(text)` | `0016:857` | The daily repair sweep. |
| `set_turnover_classification` · `record_future_attestation` · `ack_` / `snooze_` / `resolve_compliance_watch` | `0016:905` · `:993` · `:1047` · `:1101` · `:1151` | The five human verbs. |
| the migration-only write assertion | `0016:5216-5228` | Raises `'0016 a granted fn writes sst_threshold_schedule (must be migration-only)'` if any **granted** function's `prosrc` matches `insert into`/`update`/`delete from clara.sst_threshold_schedule`. |

**Six patterns from `evaluate_sst_watch` that F-T1's evaluators must copy verbatim, not re-invent:**

1. **Malaysian legal dates, explicitly.** `v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date`
   (`0016:477`) with the comment naming the failure it prevents (a UTC session is 8h behind at a month
   boundary). Every SST period boundary and due date is a **Malaysian** date.
2. **The statutory horizon is the last COMPLETED month** (`0016:484`, ADV-7): the month in progress
   produces `provisional_*` figures that are *separate labelled signals, never a state input*.
3. **The schedule is looked up PER MONTH-END, not once** (`0016:618-624`) — the historical series
   re-derives the threshold that applied at each historical month-end. F-T1's rate lookups inherit this.
4. **A missing schedule row does not default** (`0016:565-575`): `no_threshold_schedule` is emitted as
   the group's state and the loop `continue`s. This is TA-P2's "a missing row REFUSES by name" already
   built once.
5. **The turnover sum excludes the closing transfer** — `and not (e.is_year_end and e.closing_transfer)`
   (`0016:591`) — which is exactly the latent task-#17 depends on (`PROGRESS.md:191-198`).
6. **The evaluator can never poison a caller's transaction** (`0016:501-507`): an unknown client returns
   a `skipped` summary, never a raise.

### 1.2 The AR/AP subledger — the real payment anchor (`0037_wave_c_a_subledger.sql`)

Service tax is a **payment-basis** tax, so the whole engine turns on one question: *what did the client
actually receive, against which invoice, on what date?* The estate answers it exactly here.

- **`clara.open_items`** (`0037:726-778`) — `domain in ('ar','ap')`, `item_kind in ('invoice',
  'credit_note','bill','settlement','adjustment','opening','reversal_unwind')`, `entry_id not null`,
  `counterparty_id not null`, `item_date`, `due_date`, `amount_cents bigint check (<> 0)`. The grain
  and the idempotency key are the same constraint: `uq_open_items_grain unique (entry_id, domain,
  counterparty_id)` (`0037:745`).
- **The sign law** is CHECK-enforced (`0037:764-770`): an AR `invoice` is positive, an AR `credit_note`
  is negative, a `settlement` is **always negative** ("it is `-gross` by construction").
- **`clara.open_item_allocations`** (`0037:783-813`) — `application_group uuid not null`,
  `operation_kind in ('allocate','unallocate','apply')`, `amount_cents`, `reverses_allocation_id`.
  An unallocation is *exactly* a negation of one prior allocation (`ck_oia_unallocate_pairing`), and
  `uq_oia_reverses_once` (`0037:815-817`) forbids a double-undo.
- Both tables are **append-only** by trigger (`0037:823+`, the `0011:1073-1077` idiom).

**This is the anchor F-T1 needs and it already exists.** A partial receipt is an allocation row of
less than the invoice's gross, in an `application_group` that nets to zero per domain. **Law 9** (the
subledger is intrinsic) means every approved AR entry already has its item.

**PREDICTION P1 (rig).** The allocation grain supports apportioning a partial receipt into its
tax and non-tax halves *without a new table*: `tax_realised = allocated ÷ invoice_gross × invoice_tax`,
evaluated in bigint sen with a stated rounding rule. The replay must confirm (a) that `sum(allocations)`
for an AR invoice item never exceeds its `amount_cents`, and (b) whether an `apply` operation can
create an over-allocation the arithmetic would then over-tax.

### 1.3 The output-tax posting floor — the DB already owns "tax on this sales invoice"

The live sales-invoice shape floor is **`clara._assert_sales_invoice_shape_at`, body at
`0022:714-930`** (a CoR of `0016:1958`). Read first-hand, its four ties are:

| tie | line | predicate |
|---|---|---|
| component sum | `0022:867-872` | `net + service_charge + delivery + tax + rounding − discount = gross`, guarded on `net and tax both stated` |
| receivable | `0022:897-900` | receivable-class total (debit, or credit on a credit note) `= gross` |
| revenue | `0022:913-925` | when tax stated: revenue `= gross − tax − rounding`; else `= net + sc + dlv − disc` |
| **output tax** | `0022:927-930` | `sum(legs where a.special_acc_type='sst_output') = stated tax` — **guarded `v_tax is not null and v_tax > 0`** |

The closed leg world is `{receivable, income, sst_output, rounding}` (`0015:930-941`:
*"a sales entry admits only receivable, income, sst_output and rounding legs"*).

**Consequence for F-T1:** output tax per sales entry is a **DB-owned number already** — the sum of
`sst_output` legs, structurally tied to the stated tax fact. F-T1's return evaluator reads that sum; it
never re-derives tax from a rate × base multiplication of its own.

**The purchase side is deliberately asymmetric.** `0015:828-843` refuses any `sst_output` leg on a
supplier bill — *"a supplier bill admits no sst_output leg (purchase SST is expensed into cost)"* —
and `0016:117-126` adds `special_acc_type='sst_purchase_cost'`, CHECK-forced to `account_type='expense'`
(`ck_coa_sst_purchase_cost_expense`, `0016:124-125`). **Digest law 17: SST has no input-tax credit; the
purchase side is a visibility split.** F-T1 changes none of that.

### 1.4 The opening-seed SST trio — a carry-over shape already built, and *nothing reads it*

**`clara.opening_items`** (`0017:1122-1176`) carries three SST columns on brown-field open items:

```
sst_portion_cents bigint check (sst_portion_cents>=0),
sst_rate_bp       int    check (sst_rate_bp>0),
sst_basis         text   check (sst_basis is null or btrim(sst_basis)<>''),
```

bound by `ck_opening_items_sst` (`0017:1163-1168`) as an **all-or-nothing trio, admissible only on
`item_kind in ('ar_open_item','ap_open_item')`**.

This is the payment-basis carry-over shape, already ratified: when a brown-field client is seeded, its
opening **AR** includes invoices whose service tax has **not yet become due** (because service tax is a
payment-basis tax), and the seed records the tax portion, the rate **in basis points**, and the basis.
The estate's unit convention for an SST rate is therefore **`int` basis points** — `800` is 8%
(`packages/db/tests/wave-b/wb-k-registry.test.mjs:132`: `{ sst_portion_cents: 6000, sst_rate_bp: 800,
sst_basis: "output tax carried" }`).

**FINDING S0 — the trio is WRITE-ONLY.** A repo-wide search for readers returns exactly one hit, and it
is a test (`wb-k-registry.test.mjs:132,142`). No function, no view, no report consumes
`sst_portion_cents`. **F-T1 is the consumer that was anticipated and never arrived** — the opening
balance of "service tax not yet due" is a real input to the first taxable period of a brown-field
registrant, and today it is recorded and dropped.

**And the mirror gap:** `clara.open_items` (`0037:726`, the ONGOING subledger) has **no** SST columns.
So the tax portion of an ongoing AR invoice is not carried on its item and must be derived from the
entry's `sst_output` legs (§1.3). Design §3.2 states which of the two the evaluator reads and why —
they must not both become sources of the same number (TA-P11's test).

### 1.5 The COA markers, and the one that will not stretch

`clara.coa_accounts.special_acc_type` currently admits `('rounding','sst_output','sst_purchase_cost')`
(widened `0015:214`, then `0016:122-123`). **`uq_coa_special` is `unique (client_id, special_acc_type)`
(`0003:58`)** — *one* account per client per value.

**FINDING S1 — dual-registrant separation is structurally impossible in the ledger today.** A person
registered for BOTH sales tax and service tax has two different taxes to declare, two different
accounting bases (accrual vs payment) and two different SST-02 line groups — but the chart can hold
exactly **one** `sst_output` account, and the shape floor (§1.3) ties *all* output legs to one stated
tax figure. The contract's "dual-registrant separation **surviving export**" therefore cannot be met by
reading the ledger alone. Design §4 owns this; annexes' OQ-3 puts the choice to the owner.

### 1.6 The MyInvois facts — a ready-made per-tax-type breakdown

`packages/runtime/lib/myinvois-ubl.mjs:414-424` extracts every `cac:TaxSubtotal` into
`{type, rate, taxable, amount, exempt_reason}` where `type` is `cac:TaxCategory/cbc:ID` — the LHDN
**tax type code**. `packages/runtime/lib/myinvois.mjs:184-185` serialises it to the fact path
**`invoice.tax_breakdown`**, registered in the closed fact-path world at `0015:116-118` and `0015:3085-3086`.

Document type codes are polarity-bound per root (`myinvois-ubl.mjs:65-70`):
`Invoice ∈ {01,02,03,04,11,12,13,14}` · `CreditNote ∈ {02,12}` · `DebitNote ∈ {03,13}`.
`0016:1955-1957` refuses a supplier document whose `type_code` is stated and is not `'01'` from being
coded as a plain bill.

**Consequence:** for any structured (UBL) sales document the *tax-type split* F-T1 needs for a dual
registrant already arrives in the facts. For OCR/witness documents it does not — `type_code` is absent
on the OCR path (`0015:784`, `:904`, `:1953`), and `tax_breakdown` with it. **That asymmetry is the
dual-registrant design's real constraint, not the CHECK.**

### 1.7 The Tier-1 policy-table precedent — F-A8, already designed

`docs/plan/active/internet-lane-design.md` §3.1 designs the whole governed-write path TA-P2 A+ requires:
`clara.policy_drafts` (staging) → `_policy_extract_quoted_value` / `_policy_sources_agree` /
`_policy_value_plausible` (three **total, versioned** evaluators, `not_evaluable` on the unreadable) →
`decide_policy_draft` / `override_policy_draft` (the audited owner **one-click** door, owner-rank gated)
→ `_policy_draft_commit_core` (the shared delegate: mark, write, stamp predecessor, receipt, impact scan).
`p_table_key`'s closed set is `{'fx_rates'}` at F-A8 PR-1, and `internet-lane-design.md` §6.6 states
plainly: *"The SST rate table is F-T1's schema; F-A8 attaches fetching once it exists."*

**⚠ OWNERSHIP REVERSAL (conductor, 2026-08-23).** `internet-lane-design.md` §3.1/§7 assigns the
`sst_threshold_schedule` **ALTER** (surrogate `id` + supersession + actor + basis) to **F-A8's PR-3**.
The conductor has since reversed it: **F-T1 owns both SST reference tables** — `sst_rate_schedule`
greenfield *and* the threshold table's widening — and **F-A8 only attaches the fetch**. This survey and
the design are written to the reversal; `internet-lane-design.md` is stale on the point until F-A8
re-cuts it. Recorded in the annexes' decision register with the conductor's ruling as provenance.

`clara.fx_rates` is F-A8's greenfield shape and the pattern F-T1 copies: `id uuid pk`, key columns,
`superseded_by`/`superseded_at` with the paired CHECK, the WHO/BASIS/WHEN trio
(`recorded_by`/`basis`/`basis_kind`/`recorded_at`), a partial unique index for the live row, and the
half-open interval `[effective_from, effective_to)`.

### 1.8 Period, close and reporting machinery the SST period will sit beside

- `clara.fiscal_years` (`0056:232`) · `clara.close_runs` (`0056:410`) · `clara.close_attestations`
  (`0056:503`) · `clara.close_write_permits` (`0056:569`) · `clara.close_receipts` (`0056:1508`) ·
  `finalize_close` (the D1 body three Wave-F lines already share).
- **`clara.reporting_periods`** (`0057:279-300`) — `grain text not null check (grain in ('month',
  'fiscal_year'))`, `period_start`/`period_end` **both ends inclusive** (stated in the DDL because
  `days_in_period` is wrong by one for the whole estate otherwise).
- `clara.period_snapshots` (`0057:380`).

**An SST taxable period is two calendar months (or a DG-approved variation) and does not fit
`reporting_periods.grain`.** Design §2 mints its own period object rather than widening a Wave-E
reporting surface; annexes' D-4 records why that is not a second architecture under TA-P11's test.

### 1.9 The context pack already carries an SST block, and FIVE migrations pin it by name

`get_context_pack` emits an **`sst_registration_watch`** block, and that string is asserted as a
prestate by five separate migrations: `0017:5286` · `0036:465`, `:1527-1528`, `:1841` · `0055:129-130`,
`:781` · `0061:75`, `:156`. `0036:1528` raises *"get_context_pack is missing the 0016
sst_registration_watch block — not the body this migration accounts for"*.

**Consequence:** the context pack is a **hard shared surface for anything SST-shaped**. F-T1 adding an
`sst_return` block to the pack is a CoR of `get_context_pack` (live body `0016:4262`, since re-cut)
plus a schema-version bump, and it must leave the `sst_registration_watch` substring intact or five
migrations' prestate checks fail on a fresh rig. Design §6 keeps F-T1's pack contribution to a single
**additive** key and names the bump.

### 1.10 The word "filing" is already taken

`clara.document_filings` (`0007:63`), `clara.filing_corrections` (`0007:310`),
`clara.filing_correction_items` (`0007:339`), `list_uncoded_filings` (`0011:1637`, `0011:3967`),
`_coding_lane_core(p_client, p_filing)` (`0031:302`) — **"filing" means a DOCUMENT in this estate.**
F-T1 uses **"return"** and **"obligation"**, never "filing", for tax. Recorded so a later reader does
not read `document_filings` as a tax register.

---

## 2 · What does NOT exist (searched, not assumed)

Each row below is a search result over `packages/db/migrations/*.sql`, `packages/runtime/`,
`apps/dashboard/` and `docs/`, not an assumption.

| Thing F-T1 needs | Exists? | Evidence of absence |
|---|---|---|
| An SST **registration record** (registered? which taxes? number? effective date? DG-varied period?) | **NO** | No table or column matching `sst_registration`, `sst_number`, `registered_for` anywhere in `packages/db/migrations/`. `compliance_watches` records *whether a client should register*, never whether it **is** registered — §1.1's `resolved_conclusion='registration_recorded'` (`0016:333-335`) records only that a human said so, on the watch case, with no registration object behind it. |
| An SST **taxable period** object | **NO** | `reporting_periods.grain` admits only `month`/`fiscal_year` (`0057:282`). |
| An **SST rate** table | **NO** | Confirmed twice: no `sst_rate*` object in any migration, and `internet-lane-design.md` §3.1 states *"never `sst_rate_schedule`, which does not exist"*. Rates live in **prose** — `docs/product/PRD.md:215` embeds "service 6%/8% — 8% general from 2024-03-01 … sales 5%/10%", which **digest law 16 forbids** ("Malaysian tax facts live in effective-dated policy tables, never in product-law prose"). `docs/plan/research/wave-c/my-tax-verified-2026-07-29.md` §3 already flags PRD's prose rates for correction "when the tax policy tables are built (Wave F)". |
| An **SST-02 return** object, or any per-field mapping | **NO** | Zero hits for `sst_02`, `sst-02`, `sst_return` in `packages/`. In `docs/` the only references are forward-looking scope statements (`PRD.md:81`, `PRD.md:85`, `wave-f-contract.md:403`, `0074:263`). |
| **Bad-debt relief** machinery | **NO** | No `bad_debt`, `debt_relief` object. The statutory shape is dossier-recorded (`my-tax-verified-2026-07-29.md` §1.3) but nothing is built. |
| **Credit/debit-note SST deduction** into a return | **PARTIAL** | The *posting* side exists (`sales_credit_note` is a coding kind; `0022`'s credit-note arm mirrors every tie at `:873-884`; `open_items.item_kind='credit_note'`). The *return-deduction* side does not. |
| **Imported taxable services** / reverse charge | **NO** | No object. §1.3's purchase floor actively **refuses** an `sst_output` leg on a supplier bill (`0015:842`) — which is right for ordinary purchase SST and is precisely the wall a reverse charge must not be smuggled past. |
| **Dual-registrant** separation | **NO** — and structurally blocked | §1.5 finding S1. |
| A **service-group / taxable-service classification** of a *transaction* | **NO** | Classification today is **per income ACCOUNT** (`client_turnover_accounts`), which `codex-design-debate-sst.md` §C.1 already names as coarse: *"one commission account can contain taxable, out-of-scope, intra-group and exempt transactions … even 'confirmed' account classification remains a screening basis until transaction/service-level classification exists."* |
| An **SST-02 form producer** / renderer | **NO** | TA-P11(3) rules it into existence: *"SST-02 gets its own form producer, outside the seal/claim chain but sharing the deterministic evaluators and the bigint arithmetic beneath"* (`0074:263-265`), and makes that sentence part of F-A10's closing criterion. |
| `clara.statutory_deadlines` | **NOT YET** | Ruled into existence by **R-L22** (2026-08-23), DDL owned by **F-A4**. F-T1 contributes rows + consumers. |

---

## 3 · The statutory baseline — re-verified 2026-08-23

**Method.** Two verification lanes fetched primary sources on **2026-08-23**. Verbatim relays are held at
`…/scratchpad/ft1/sst-law-sales.md` and `…/scratchpad/ft1/sst-law-service.md`. Every row below is
**BYTE-VERIFIED** (from a gazette PDF or the AGC consolidated Act), **VERIFIED** (an official RMCD/LHDN/MOF
publication), **SECONDARY**, or **UNVERIFIED**. The design cites these rows by id.

> **Two method findings that outrank the content, because they change how a later refresh must be run.**
> **(M1)** `mysst.customs.gov.my`'s English orders tables are **STALE and silently incomplete** — they
> omit P.U.(A) 173/2025 and P.U.(A) 125/2026 entirely, both of which exist and are in force. **Absence
> from that portal is not evidence of absence in law.** Live documents are served from
> `https://mysst.customs.gov.my/wp-content/uploads/YYYY/MM/…` and the CDN
> `https://pub-359af8e1f79c472292a7e44ec60f3027.r2.dev/…`, often under Malay filenames; the legacy
> `/assets/document/…` paths mostly 404. **(M2)** The Act 807 copy on MySST's own SST-Act page is the
> **ORIGINAL 2018 print with no s.26A at all** — use the AGC consolidation (as at 1 Dec 2024). Both
> failures are the same class the F-A2 gate named: a stale body at a familiar path.

### 3.1 Sales tax and the two Acts' shared mechanics

| id | fact | grade |
|---|---|---|
| **S-1** | **Sales tax: 10% on all taxable goods**, except First-Schedule goods at **5%** and Second-Schedule goods at the **specific rate in column (4)** (RM/litre, RM/kg, ad valorem). **No 0% band** — out-of-charge goods are *exempt* via P.U.(A) 171/2025. *Sales Tax (Rate of Sales Tax) Order 2025, **P.U.(A) 170/2025**, gazetted 9 Jun 2025, in force 1 Jul 2025.* (mysst.customs.gov.my/assets/document/SST%20Orders/order/1-PUA%20170_2025.pdf, accessed 2026-08-23) | BYTE |
| **S-2** | Amended by **P.U.(A) 199/2025** (in force 1 Jul 2025) and **P.U.(A) 281/2026** (gazetted 31 Jul 2026, in force **1 Aug 2026**) — the latter moves vessels (89.01, 89.05-89.08) from 5% to **exempt**, with P.U.(A) 276/2026. The only 2026 sales-tax rate movement found. | BYTE |
| **S-3** | **Sales tax is ACCRUAL**: s.11(1) Act 806 — *"due at the time the taxable goods are sold, disposed of otherwise than by sale, or first used…"*. (lom.agc.gov.my reprint 1-10-2020, accessed 2026-08-23) | BYTE |
| **S-4 ⚠** | **Service tax is PAYMENT basis, with an INVOICE-BASIS election — not an "accrual" basis.** **s.11(1) verbatim:** tax is due *"at the time when payment is received for the service provided"*; for an imported taxable service, *"at the time when the payment is made or invoice is received … whichever is the earlier."* **s.11(1A) verbatim:** *"The Director General may, upon application in writing by any registered person and subject to such conditions as he deems fit, approve the service tax … to be due at the time the invoice is issued."* Inserted by **Act A1597 s.6(a)**, the same amending section as V-4. **The distinction from "accrual" is load-bearing: it keys on invoice ISSUANCE, so an unbilled accrual creates no liability under any basis.** **There are NO prescribed conditions** — no form, no regulation backs s.11(1A) the way reg 19 backs s.35; the conditions are whatever the DG's letter imposes, so eligibility **cannot be derived programmatically**. RMCD FAQ confirms the route: *"Yes, by submitting a written application for approval to the Director General of Customs."* Foreign registered persons have their own mirror at **s.56A(4A)**. | BYTE |
| **S-5** | **Registration RM500,000 / 12 months**, historical and future methods, both fixed at **month-end**; apply by the last day of the following month (s.13(1)); effective the first day of the month after application (s.13(3)); DG registers anyway on failure (s.13(4)). Sub-contract manufacturers are measured on the **job charge**, not the goods' value. | VERIFIED |
| **S-6** | **Bad-debt relief, sales tax: s.36 Act 806**; clawback **s.37**. `A/B × C` where `A` = payment received, `B` = the sale value **plus** the tax, `C` = the tax payable. **Six years from the date the sales tax is paid** (s.36(3)). "Bad debt" is the outstanding amount **including the tax**. | BYTE |
| **S-7** | **Taxable period:** first period from the date registration should have happened to the **last day of the following month**; thereafter **two months** (s.25(1)). Different period on application (s.25(3)-(5)). Return + payment by the **last day of the month following** (s.26(1), s.26(5)); **varied period → 30 days** (s.26(2)); **cessation → 30 days** (s.26(3)). **s.26(6): the return is furnished whether or not there is tax to pay.** Holiday roll-forward to the next day (Guide V3 ¶18). | BYTE |
| **S-8** | **Penalty:** 10% (first 30 days) → 25% (61 days) → **40% cap** (91+ days). s.26(8) Act 806 / s.26(7) Act 807. Offences: fine ≤ RM50,000 and/or ≤ 3 years. | BYTE |
| **S-9** | **LVG:** 10%, P.U.(A) 404/2023 in force 1 Jan 2024; seller threshold RM500,000, P.U.(A) 409/2022. A separate regime. | BYTE |

### 3.2 Service tax — rates, scope, and the four brief-correcting findings

| id | fact | grade |
|---|---|---|
| **V-1** | **8% general from 1 Mar 2024**, with **6%** retained for food & beverage, telecommunications, parking and logistics. *P.U.(A) 64/2024*, gazetted 26 Feb 2024. Credit/charge card **RM25 per card** on activation and every twelve months. | BYTE |
| **V-2** | **The current structure is P.U.(A) 173/2025** (gazetted 9 Jun 2025, in force 1 Jul 2025), which **replaced para 3 wholesale**: 8% on all services; **First Schedule items 1-13 at 6%** (food/beverage ×4, telecommunications ×2, parking, logistics, **healthcare**, **traditional & complementary medicine**, **allied health**, **construction works**, **education**); Second Schedule = the RM25 card rate. Para 3(3) mixed-supply rule: for a Group A/C/D/E person the *other* services are 8%; for Group B they are 6%. | BYTE |
| **V-3 ⚠** | **A RETROACTIVE 2026 rate change.** *P.U.(A) 125/2026*, gazetted **13 Mar 2026**, *"deemed to have come into operation on **1 January 2026**"*, inserts item 14 **"Provision of rental or leasing services"** into the 6% First Schedule. **Rental/leasing was 8% from 1 Jul 2025 to 31 Dec 2025 and 6% from 1 Jan 2026, ruled ten weeks after the fact.** RMCD issued a re-invoicing/SST-02 procedure notice. **A single "current rate" field produces wrong numbers for Jan-Mar 2026** — this is the live proof that the rate table must be effective-dated *and* support retroactive rows with an impact scan. | BYTE |
| **V-4 ⚠** | **s.11(2)'s twelve-month clock runs from the date the SERVICE WAS PROVIDED, not the invoice date.** Verbatim (AGC consolidation as at 1 Dec 2024): *"Where the whole or any part of the payment … is not received from the customer within a period of twelve months **from the date the taxable service was provided**, the service tax shall be due on the day following that period of twelve months."* The 2018 original said *"from the date of the invoice"*; changed by the **Service Tax (Amendment) Act 2019, Act A1597 s.6(b)** (which also inserted s.11(1A)). **Every secondary source and this project's own earlier framing carried the pre-2019 wording.** | BYTE |
| **V-5 ⚠** | **The 2025 expansion is exactly FIVE new categories** — private healthcare, construction works, private education, rental or leasing, financial services (RMCD's own FAQ index). **There is no "beauty services" group**; the nearest is Group C, whose heading changed to "WELLNESS CENTRE", which predates 2025. Instruments: **P.U.(A) 172/2025** (in force 1 Jul 2025), amended **before taking effect** by **P.U.(A) 201/2025**, which raised **Group H items 2-4 and Group K from RM500,000 to RM1,000,000**. *Any source quoting RM500,000 for finance or rental is reading 172 without 201.* | BYTE |
| **V-6** | **Full First Schedule thresholds:** A 500k · B **1.5m** · C 500k · D 500k · E 500k · F 500k · G 500k · **H item 1 NIL**, items 2-4 **1m** · I 500k (items 14-16 private healthcare / TCM / allied health **1.5m**) · J 500k (added by P.U.(A) 62/2024, in force 26 Feb 2024) · **K 1m** · **L 1.5m** · **M NIL** (with a separate RM60,000-per-student *scope* trigger for item 1 — two different gates). | BYTE |
| **V-7** | **2025 penalty grace expired.** RMCD Information Notice 1 Jul 2025: no prosecution or penalty until **31 Dec 2025** for late registration, late returns, late payment, declaration errors and invoice/CN/DN offences, absent fraud. **Full exposure since 1 Jan 2026.** | VERIFIED |
| **V-8** | **Bad-debt relief, service tax: s.35 Act 807** (claim), **s.36** (clawback), same `A/B × C` with `B` **tax-inclusive**, **six years from the date the tax was paid** (s.35(3)). **Reg 19**: claim on **Form JKDM No. 2** with the s.21 invoice, the SST-02 and payment proof, non-receipt records, recovery-effort records and the write-off record; **keep records SEVEN YEARS from the claim date**; the DG may disallow. **Reg 20**: the clawback is repaid **inside the SST-02** for the period the payment is received. **Asymmetry to encode: the refund is an out-of-return application; the clawback is a return line.** Neither section applies to a foreign registered person. | BYTE |
| **V-9 ⚠** | **Credit and debit notes are REGULATION 11**, not 22/23 (regs 22-23 are the *electronic service* Part). **Reg 11(1):** a CN/DN is issued where, **AFTER the return has been furnished**, tax changes *"(a) due to a change in the rate of service tax … or (b) due to any adjustment in the course of business"* — so limb (a) makes a CN/DN the prescribed vehicle for V-3's retroactive rate change. **Reg 11(2): the deduction or addition is made in the return for the taxable period IN WHICH THE NOTE IS ISSUED OR RECEIVED** — the note's period, never a restatement of the original. **Reg 11(3) prescribes ten particulars**, including **(j) the number and date of the original invoice** — the CN→invoice link is statutory, not a convenience. s.23 is the enabling section. | BYTE |
| **V-10** | **Imported taxable services.** Charging/timing is **s.11(1)(b)** — *payment made or invoice received, whichever is earlier*. A **registered** person declares in its SST-02 Part B1 with a special code; a **non-registered** person declares on **SST-02A** under **s.26A**, and **s.26A(1) is MONTHLY** — *"not later than the last day of the month following the end of the month in which the payment … has been made or invoice is received"*, **not the two-month taxable period**. Same 10/15/15 ladder (s.26A(3)). The RMCD guide is Malay-only, **printed 9 Jan 2019, still computing at 6%** — use the Act, not the guide. | BYTE |
| **V-11** | **B2B exemption and group relief are DIFFERENT mechanisms.** B2B: *Service Tax (Persons Exempted From Payment Of Tax) Order 2018*, P.U.(A) 380/2018 in force 1 Jan 2019 — **registered-to-registered, SAME ITEM**, Group G (excluding items 10-11), extended to Group I item 8 (advertising) and, by **P.U.(A) 66/2024**, to **Group J logistics**. Group relief is a **scope exclusion in the First Schedule** — the service *"shall not be a taxable service"*. **The 5% de-minimis is STILL LIVE** (Guide on Professional Services, 21 Sep 2021, ¶59, effective 1 Jan 2020): exceed 5% of total value to persons outside the group and the **intra-group** supplies become taxable — a retrospective cliff-edge. **SST-02 item 18(c) has THREE sub-lines** (B2B · group relief · other), so the data model needs a three-way reason code, not a boolean. | BYTE |
| **V-12 ⚠** | **There are FIVE designated areas: Labuan, Langkawi, Tioman, Pangkor and *Pulau 1*** (s.2 Act 807, current). Special areas: free zones, licensed warehouses and LMWs, the JDA, and a s.77B petroleum supply base. **The rule is three-way, not a flag** (ss.47-56): DA↔DA / SA↔SA / DA↔SA is **not** chargeable unless prescribed; **DA→Malaysia is taxable**; **Malaysia→DA is taxable**. **Pulau 1 (Forest City) INVERTS it** — P.U.(A) 371/2024 carves it out of the general order and **P.U.(A) 370/2024 makes supplies within Pulau 1 and between Pulau 1 and other DAs/SAs fully chargeable** (both in force 1 Dec 2024). **Modelling Pulau 1 as "just another DA" under-taxes.** Each island's extent is a statutory *enumeration of adjacent islands* — postcode matching is not sufficient. | BYTE |
| **V-13** | **"DG's Decisions" is a dead surface** — the RMCD DG's-Decisions index carries exactly four items, all from 2018, all GST-transitional. Against a DA regime legislated twice in 2024. Relevant to OQ-1's reading of "DG variations". | VERIFIED |
| **V-14** | **No Budget 2026 service-tax measure.** MOF's Fiscal Outlook 2026 attributes the projected 26.1% revenue rise to *full-year implementation*, not a new measure. Digital services (FSP) threshold RM500,000 under s.56B, unchanged; the 8% rate for digital services is **derived** from P.U.(A) 173/2025 ¶3(1), not directly quoted. | VERIFIED |
| **V-16 ⚠** | **Invoice basis and bad-debt relief are a PAIRED feature.** Under s.11(1A) the taxpayer pays tax on invoices not yet collected by design, so relief (V-8) is the only route back — shipping the basis flag without the relief lane builds a one-way valve. Also: **s.11(2)'s twelve-month sweeper is probably inert for an invoice-basis taxpayer** (the supply is already brought to tax at issuance), but **s.11(2) is not expressly disapplied for s.11(1A) approvals** — the lane recorded this as its own INFERENCE, not a sourced statement. Keep the sweeper **switchable per taxpayer, never hard-coded off.** | INFERRED (labelled) |
| **V-17** | **Two more service-date-anchored deadlines, and one that removes the invoice entirely.** **s.21(1):** an invoice must be issued **within ONE YEAR from the date the taxable service was provided** (or a DG-extended period). **s.21(1A):** *"the Director General may, upon request in writing … approve an invoice to not be issued"* — so **the model must not assume an invoice always exists**, and a taxpayer holding both a s.11(1A) and a s.21(1A) approval has no triggering event at all. | BYTE |
| **V-18 ⚠** | **Reg 11(3)(j) forbids an aggregate credit note.** A CN must name *"the number and date of the invoice issued for the taxable service"*, and (b) requires a **dedicated serial sequence**, (e) a printed **reason**. **A credit raised against a customer's overall balance cannot satisfy this** — so the estate's unallocated-credit path (`open_item_allocations.operation_kind='apply'`, `0037:790`) must be **closed for service-tax-bearing items**. This is a wall, not a warning. | BYTE |
| **V-19** | **String-keying traps, three of them.** P.U.(A) 173/2025 First Schedule item 10 is spelled **"complimentary"** in the gazette and **"complementary"** in the Regulations — they will not match. Group G's note is **"whether combined or singly"** — aggregate across all Group G items, never item-by-item. Group K Note 2 pulls **SOHO, serviced apartment, serviced condominium, serviced suite and residential suite INTO "housing accommodation"**, therefore **out** of Group K — the opposite of the common assumption; and a **finance lease** is out of Group K but in **Group H item 4**, a different group with a different threshold. Group L is a **double negative**: pure residential is out, but residential inside a **local-authority-approved mixed development** is **in** — the determinant is an approval document, not the building's use. Group M items 2-3 turn on the **student's citizenship**, a per-student attribute, so taxability varies inside one revenue line. | BYTE |
| **V-15 ⚠** | **Policy churn is the operational risk.** Service Tax Policy 1/2025 has **five** amendments (latest 1 Jul 2026); STP 2/2025's Amendment No.5 (22 Jul 2026) **revokes and replaces Nos. 1-4**; STP 5/2025's fourth amendment is dated **18 Aug 2026 — five days before this survey**. **Any cached reading of a Service Tax Policy is stale within weeks**, and imported-service treatment now lives *inside* each group's policy chain rather than in one guide. Monitor mysst.customs.gov.my's *announcements* and *service-tax-policy* indexes; its *news* page is dead (last item 31/12/2023). | VERIFIED |

### 3.3 The SST-02 form itself

| id | fact | grade |
|---|---|---|
| **F-1 ⚠** | **A dual registrant files TWO returns.** The form's own printed note: *"Borang ini hendaklah diisi secara berasingan bagi Cukai Jualan dan Cukai Perkhidmatan / **This form must be declared separately for Sales Tax and Service Tax**"*; guide §1.5: the manual form *"hanya membenarkan SATU Nombor Pendaftaran SST SAHAJA"*; item 12 is an exclusive **OR**; every other field is marked sales-only or service-only. | BYTE |
| **F-2** | Current form: **BORANG SST-02 (AMENDMENT 2025), dated 27.8.2025**. Current guide: ***Panduan Mengisi Penyata SST-02 (Secara Manual/Pindaan)*, 31 Mei 2026**, which expressly **withdrew and replaced** the 10 Sept 2025 guide. **BM only — no English version.** Registration-number shapes: `J11-1808-20000001` (CJ), `W24-1808-31006XXX` (CP). | BYTE |
| **F-3** | **Structure:** Part A items 1-4 · Part B1 columns (5)-(10) · Part B2 items 11(a)-(e), 12, 13(a)-(d), 13A, 14, 15, 16 · Part C item 17 · Part D items 18(a)-(e) · Part E items 19-21 · Part F items 22-26 · Part G item 27. **NIL:** s.26(6) requires the return regardless, and the form's note says *"Sekiranya tiada nilai untuk diikrar, sila isi angka '0'"* — **fill `0` in every mandatory field; there is no NIL tick-box.** Full inventory: annexes A.2. | BYTE |
| **F-4 ⚠** | **The form face and the 31 May 2026 guide DISAGREE, and the guide is newer.** Item 12 printed: `[11(a)+11(b)] OR [11(c)+11(d)+11(e)]`; **guide, sales arm: `[11(a)+11(b)] + 17`.** Item 14 printed: `(12) − 13(a) − 13(b) − 13(c) ± 13A` — **omits 13(d) and merges the tax types**; **guide, sales: `(12) − 13(a) − 13(b) − 13(d) − 13A`; service: `(12) − 13(a) − 13(c) − 13(d)`.** Part C's heading still cites the *2018* rate order, superseded by P.U.(A) 170/2025. | BYTE |
| **F-5** | **Debit notes are ADDITIVE inside columns (8) and (10)** (*"Termasuk Nilai Nota Debit"*) — there is no DN line. **Credit notes deduct at item 13(a)**; the guide takes the deduction in the **following** taxable period for tax already declared, which is the common case of reg 11(2)'s *"period in which the note is issued"* (V-9), reg 11(1) mandating a note only **after** the return has gone in. | BYTE |
| **F-6** | **Item 11(e) is counted in CARDS**, `__ UNIT × RM25`. **Item 15's penalty is *system-generated by CPPS on keying-in***, not by the filer. **Item 13(d) (bad-debt relief) is filled ONLY AFTER the application is approved.** Item 13(b)/13A are the s.41A sales-tax credit system; 13(c) is a s.39 STA deduction **approved by the DG**. Part F declares under **s.89/90 Act 806 or s.74/75 Act 807** and consents to electronic service. | BYTE |
| **F-7** | **SST-02A** — *"Service Tax Declaration By Person Other Than Registered Person"*. Parts A(1-8)/B(9-13)/C(14-18)/D(19). ⚠ **Item 10(a) prints only a 6% line and has no 8% line**, despite P.U.(A) 64/2024. Same `0`-fill NIL rule. | BYTE |
| **F-8** | **Amendment window** (Guide V3 FAQ 3): before the due date **and** before payment → unlimited amendments; after payment or after the due date → **no amendment**, use MySST's *Supplement*. Posted returns are acknowledged on the **post-mark date**. Manual submission is by post/courier to **CPPS, Petaling Jaya**. | VERIFIED |
| **F-9 ⚠** | **No MyInvois → SST-02 feed exists.** LHDN's SDK tax-type codes are **01 sales tax · 02 service tax · 03 tourism tax · 04 high-value goods tax · 05 sales tax on LVG · 06 not applicable · E exemption** (sdk.myinvois.hasil.gov.my/codes/tax-types/, accessed 2026-08-23); the SST field allows *"up to 2 SST numbers separated by semicolon"*, 35 chars — corroborating the two-registration world. **But nothing states that MyInvois data reaches RMCD or populates a return**, and the grains differ (document vs taxable-period aggregate). **Treat e-invoice tax lines as a cross-check, never a source.** | VERIFIED |
| **F-10 ⚠** | **BUT a self-billed e-invoice IS required for imported services, and it must carry the service tax.** e-Invoice Specific Guideline **v4.8 (7 Jul 2026) §10.4.3-10.4.9**: a Malaysian purchaser must issue a self-billed e-invoice for imported services, and §10.4.7 requires the **service tax amount to be included in it**; §10.4.9 times it to the month following payment or receipt of the foreign invoice, **aligning with s.26A**. This collides with `PROGRESS.md:297` (*self-billed detection is UNSCHEDULED*) — see §6/R11. | VERIFIED |

### 3.4 What is still open (named, not glossed)

| id | gap | what would close it |
|---|---|---|
| **U-1** | **P.U.(A) 174/2025** — *Persons Exempted From Payment of Tax (Amendment) Order 2025*, existence confirmed by RMCD's own expansion announcement (dated 10/06/2025), **text unreachable** on the portal, the CDN and AGC. It is the likely home of B2B relief for the five new groups. | a second fetch pass, or the RMCD helpdesk |
| **U-2** | Whether STP 3/2025 (construction), 4/2025 (education) and 5/2025 (healthcare) **amendment chains** add B2B or group relief. Base policies have none. **A gap, not a negative finding.** | reading each chain to its current amendment |
| **U-3** | The exact appointed commencement date for **Act A1597 s.6** (the s.11(2) change). The amended wording is in force per the 1 Dec 2024 consolidation regardless. | the commencement P.U.(B) |
| **U-4** | Whether RMCD's current **General Guide** adds an administrative waiting period for bad-debt relief. The Acts and Regulations contain none (V-8, S-6). **Do not encode one either way.** | the current General Guide's "Bad Debt" section |
| **U-5** | The Second Schedule tariff↔rate pairing in S-1 was layout-extracted from a PDF and is **column-shift-prone**. | line-by-line re-verification before any Part-C seed |

---

## 4 · Shared surfaces and closed-world censuses this item touches

**Announced to the `conductor` 2026-08-23; the ledger holds the merge order.**

| # | Surface | Owner | What F-T1 does |
|---|---|---|---|
| 1 | `clara.statutory_deadlines` | **F-A4** (R-L22) | Contributes SST **seed rows** + a **consumer**. No carrier, no oracle, no clock. |
| 2 | `compliance_watches.watch_kind` CHECK (`0016:304`) | unclaimed → F-T1 | Extend-only. **Two structural frictions:** `service_group` is `not null` (`0016:302`) and is meaningless for a return-due watch; `ck_compliance_watches_resolved` (`0016:343-347`) pins `resolved_conclusion` to two registration-specific values. |
| 3 | `coa_accounts.special_acc_type` CHECK (`0015:214`, `0016:122`) + `uq_coa_special` (`0003:58`) | F-T1, **contingent** | Only if the owner rules the payment-basis deferral and/or the dual-registrant split into the **ledger** (design §3.3, §4). |
| 4 | `_assert_sales_invoice_shape_at` (`0022:714-930`) — the closed leg world | **F-A2** | Only under the same contingency as #3. **This is F-A2's live judgement body**; a new leg class moves B4-sales' component tie (`f-a2-annexes-1-estate.md` Annex I) with it. CoR + D1. |
| 5 | `clara.sst_threshold_schedule` (`0016:237`) | **F-T1** (reversed from F-A8, conductor 2026-08-23) | F-T1 lands the surrogate-`id` + supersession + actor/basis ALTER. **Three ordered obligations:** `id uuid not null default gen_random_uuid()` **plus `unique (id)`** must exist *before* the self-referencing `superseded_by` FK; every new column nullable so `0016:247-248`'s two seed rows need no backfill; the existing `source_note not null check (btrim<>'')` must be satisfied by the writer. |
| 6 | `clara.policy_drafts` · `p_table_key`'s closed set · `_policy_extract_quoted_value` | **F-A8** | F-T1 builds `clara.sst_rate_schedule`; **F-A8's PR** admits it to the door. |
| 7 | `0016:5216-5228` migration-only write assertion | **F-T1** (moves with row 5) | Trued to its **reachable-closure** form — granted wrappers **plus the ungranted cores they call**, the correction F-A8's gate made; a core-only writer is invisible to the current granted-only scan. The **same** assertion is armed for `sst_rate_schedule`. *(Awaiting the conductor's confirmation that F-A8 is no longer landing the truing.)* |
| 8 | `wake_fn_allowlist` + `mint_wake_credential` kinds | shared | Only if F-T1 ships a wake verb (design §6). |

**Closed-world censuses that will fail on a new function or table** (each is a standing estate test, not a
one-time DO block): `packages/db/tests/x42-s5-helpers.mjs:161-203` (`S5_25_BARE_TOKEN_ROSTER`, ~150 names
compared **exactly** against the live catalog) · `packages/db/tests/rig-meta.mjs:43-51,65-68,72` ·
`packages/db/tests/wave-a-helpers.mjs` · `packages/db/tests/wave-b/wb-helpers.mjs:212-226`
(`WB_AUTHORITY_FNS`, the law-8 no-wiki roster — **every new gate/bound/floor function F-T1 mints belongs
here**) · `packages/db/tests/a21-helpers.mjs:81` (`A21_NEW_FNS`) · `packages/db/tests/a21-watch.test.mjs:98-132`
— the P1 census F-A8's gate found *pins the two `sst_threshold_schedule` seed rows' `effective_to IS
NULL`*, so **any supersession that closes them fails this standing cell**, and with the ownership
reversal the re-cut is **F-T1's**.

---

## 5 · The corpora — what BEE / RPR / RS can and cannot prove

Read from `docs/plan/active/wave-g-corpus-oracle-assessment.md` and
`docs/plan/research/wave-a2/F-rpr-eval-corpus.md`.

**The single most important acceptance fact: none of the three real clients is SST-registered.**

- *"A scan of every text-layer PDF across all three folders returned **zero** SST/service-tax
  registration hits on any client's own sales invoices"* (`wave-g-corpus-oracle-assessment.md:77-79`).
- RPR: *"no SST / service-tax line, no tax rate, no tax subtotal … the GL revenue postings have a blank
  Tax column … RPR prints no SST registration number … No output-tax / SST-payable account exists
  anywhere in the TB, P&L, Balance Sheet, or GL"* (`F-rpr-eval-corpus.md:19-22`, `:213-214`).
- RS: twenty-two all-no-tax invoices (`0074:268`).
- RPR + RS are both **in strike-off** (`wave-g-corpus-oracle-assessment.md:72-76`).

**And RPR's turnover is RM1.97M against a RM500,000 threshold** while it charges no SST
(`F-rpr-eval-corpus.md:19-24`, `:271`). That is not a gap in the corpus — **it is the single most
valuable positive test case in it**, and it is exactly the residual TA-P11 handed to F-T1:

> *"the genuine residual — a client who **ought** to charge SST but issues no-tax invoices — belongs to
> F-T1's SST engine, not to a posting gate"* (`0074:260-261`)

with the accepted cost stated in the same ruling: *"if a client's SST registration status is judged
wrong the error runs in the 'should have charged tax, treated as no-tax' direction — a tax-filing
problem that posts quietly"* (`0074:269-271`).

**The one real SST-stated document set in the estate is on the PURCHASE side and is excluded from the
acceptance run.** BEE's eight OpenAI invoices print `Service Tax - Malaysia (8% on $20.00) $1.60
(RM6.90)` with a Malaysian foreign-registered-person marker (`wave-g-corpus-oracle-assessment.md:107-114`)
— imported digital services with Malaysian service tax charged by a foreign supplier. **They are the same
eight USD documents excluded for multi-currency** (digest law 18), *"so Gate P is not discharged by them
in the acceptance run"*. **Gate P** — the first native-MYR SST-stated supplier bill — is still open
(`PROGRESS.md:272`).

**What this means for acceptance (design §9 owns the consequence).** F-T1 has:
- **real negative evidence** in abundance (three unregistered clients, no output tax anywhere) — which
  exercises NIL validity, the should-have-charged detector, and every fail-closed arm;
- **one real 8%-service-tax document set** that proves the *rate* and the foreign-supplier shape but is
  excluded from the tie-out;
- **zero real output-tax postings**, zero real SST-02s, zero real registrations.

So every positive-path SST-02 cell is **synthetic and must be LABELLED synthetic** under the ADR-048
sanction (digest law 22: *"synthetic evidence is sanctioned pre-go-live but is LABELLED synthetic and
never claimed as real"*). Wave-G's `CLIENT-SST-1` slot (`wave-g-e2e-corpus-design.md:110`, `:313`) is
the designed home for the real positive path and it is **not** in this wave.

---

## 6 · Risks this survey found (carried into design §10)

- **R1 — no rig replay under this survey.** Every body cited is migration TEXT at a line, and bodies in
  this estate are spliced across generations (`0022:714-930` is itself a CoR of `0016:1958`; the F-A2
  gate's strongest finding, GM-1, was that a design had derived against *"a body superseded seventy
  migrations ago"* — `f-a2-annexes-1-estate.md:465-471`). **Every §1.3 and §1.1 line cite is a
  PREDICTION until the build replays it with `pg_get_functiondef` at the frontier.** Annex C lists them.
- **R2 — the account-level classification is a screening basis, not a return basis.** `0016`'s watch is
  *advisory by construction* (`PRD.md:81`) and its numbers are labelled a screening proxy. **An SST-02
  is an authoritative artifact.** Reusing `client_turnover_accounts` as the return's taxable-value source
  would promote a screening estimate into a filed number. Design §3 must not do that.
- **R3 — the payment-basis deferral collides with F-A2's live posting wall.** §1.5 / §4.
- **R4 — the OCR/witness path carries no `type_code` and no `tax_breakdown`** (§1.6), so for
  non-structured documents the tax-type split has no fact behind it. A dual-registrant engine that
  assumes the breakdown is present will silently mis-split.
- **R5 — `sst_output` is tied to the STATED tax, not to a rate the engine controls** (`0022:927-930`).
  That is correct (the DB owns the document's own number) but it means **the engine cannot detect an
  under-charged rate from the ledger** — an invoice stating 6% when 8% applied ties perfectly. Only a
  rate-vs-schedule comparison against `sst_rate_schedule` can see it, and only if the service group and
  date are known.
- **R6 — the twelve-month rule (s.11(2)) is a POSTING consequence on a clock.** If tax becomes due
  twelve months after an unpaid invoice, something must move in the books without a human. **Digest law
  21** (narrowed by TA-P5 to *"periodic POSTING belts"*) governs it: sign once at admin+, **the first
  firing DRAFTS**, receipt everything. Design §3.4 must be written against that law, not around it.
- **R7 — `compliance_watches` will not stretch cleanly** (§4 row 2). Forcing a return-due watch into a
  `service_group not null` table is the kind of quiet mis-fit that produces a sentinel value nobody
  remembers. Design §7 picks a shape explicitly.
- **R8 — the SST-02 form producer is the estate's first artifact outside the seal/claim chain.**
  TA-P11(3) blesses it, but "outside the seal chain" means the render/claim guarantees that protect
  every other durable artifact do **not** apply. What replaces them is design §5's problem, and it is
  the item most likely to become a second architecture if it grows its own arithmetic.

---

## 7 · Change log

| v | date | change |
|---|---|---|
| v1 | 2026-08-23 | First survey. Code read on origin/main at commit 1f33268; statutory re-verification §3. |
