# F-T1 — the SST engine: design v1

> **Design of record** for Wave F Track B item **F-T1**. Companions: `sst-engine-survey.md` (the estate at
> the bytes, **and every statutory citation with its URL + fetch date** — cited below by row id `S-*` /
> `V-*` / `F-*` / `U-*` / `M1`) · `sst-engine-annexes.md` (mechanics, the SST-02 field inventory, decision
> register, rig predictions, owner questions). Binds under hard constraint 2 + `PRD.md` §6 (**the DB owns
> every authoritative number**) and digest laws **16 · 17 · 18 · 21** (as narrowed by TA-P5) **· 22 · 68 ·
> 71/78 · 75 · 80 · 81**, plus **TA-P2**, **TA-P4**, **TA-P11** and **R-L22**.
>
> **This document designs; it does not build.** No migration is authored here, and no statutory rule is
> restated without a survey §3 row behind it.

## 1 · The ruled shape (fixed, not designable)

1. **Every SST figure comes from a versioned deterministic DB evaluator over DB-owned inputs.** Hard
   constraint 2; owner Q1 = A. Clara may *propose* a classification, *narrate* a return, *draft* a
   question — she never authors a numeral that lands in a return.
2. **Her judgement is CLASSIFICATION, SCOPE and PERIOD — never arithmetic.** "Is this revenue a taxable
   service, and in which group?" is hers. "What is 8% of RM12,340.55?" is the DB's.
3. **SST-02 gets its own form producer** — TA-P11(3): *"outside the seal/claim chain but sharing the
   deterministic evaluators and the bigint arithmetic beneath"*, part of F-A10's closing criterion.
4. **BOTH SST reference tables are F-T1's; F-A8 attaches only the fetch** (TA-P2 + the conductor's
   ownership reversal, 2026-08-23 — survey §1.7). Rows land through F-A8's **audited owner one-click
   door**, never a PR, behind two mechanical checks; immutable + supersede; a backdated effective date
   triggers a downstream impact scan; **a missing row for the day REFUSES by name and stops in the open.**
5. **Statutory due dates are ONE fact in F-A4's `clara.statutory_deadlines`** (**R-L22**). F-T1 contributes
   **seed rows and consumers**. No carrier, no second oracle, no clock.

**One deliverable is handed to F-T1 by name.** TA-P11(2) dissolved 7A-R3 with the rules machine and
recorded the residual: *"a client who **ought** to charge SST but issues no-tax invoices belongs to F-T1's
SST engine, not to a posting gate"* (`0074:260-261`). **§7.3 is that deliverable** — without it the cost
the owner accepted in that ruling has no mitigation anywhere in the product.

## 2 · Registration and the taxable period

### 2.1 Registration is RECORDED, never inferred

`0016`'s watch answers *should this client register?* Nothing answers *is it registered?* —
and `codex-design-debate-sst.md` §C.2 ruled the shape: **"Registration status is sticky human-recorded
state — never inferred from turnover data"** (no auto-deregistration on a dip; cessation needs the DG).

**`clara.sst_registrations`** — one row per (client, tax type, episode), immutable + supersede on the
`client_facts` (`0055:386-420`) pattern. Full columns in Annex A.1; the five carrying design weight:

| column | note |
|---|---|
| `tax_type` | **CLOSED `('sales','service')`.** A dual registrant has TWO rows — and RMCD requires two separate returns (§4), so this is the whole separation mechanism |
| `registration_no` | `J11-1808-20000001` (CJ) / `W24-1808-31006XXX` (CP) — F-2. **Shape-checked, never shape-inferred**: spelling is not identity (review law 3) |
| **`accounting_basis`** | **`('payment','invoice_issued_approved')`, default `payment`.** ⚠ **An INVOICE-BASIS election under STA s.11(1A), NOT an "accrual basis"** (S-4): it keys on invoice *issuance*, so an unbilled accrual creates no liability under any basis. Sales tax is always accrual (s.11(1) Act 806), CHECK-forced against `tax_type` |
| `dg_approval_ref`, `dg_approval_effective`, `dg_conditions text` | **s.11(1A) has NO prescribed conditions** — no form, no regulation backs it the way reg 19 backs s.35 (S-4). An **opaque operator-entered record transcribed from the DG's letter**; eligibility is **never derived**. The same trio carries a s.25(3) period variation |
| `taxable_period_months`, `period_anchor_month`, `service_groups text[]` | default 2 (s.25(1)); the cycle follows the FYE. **s.25(4) lets the DG reassign a period with no application**, so this is dated history, not config |

**Where the number lives.** `client_identifiers.kind` is closed `('tin','ssm','bank_account')` (`0007:227`)
with no SST kind. The number lives on `sst_registrations` — an SST number belongs to a *registration
episode* (it starts, it can cease), not to the client. **Extending `client_identifiers.kind` is explicitly
NOT proposed**: the conductor holds that surface, and a second home for one fact is law 81's two paths.

**Who may write it.** Under law 78 the roster is an open register, so this is not reserved — but the
evidence discipline is: the verb refuses a blank `basis`, and `basis_kind` must name what was seen (an RMCD
letter, the MySST portal, a client attestation). Clara may call it **as the owner's delegate under
ADR-0075** on test data, receipted, the basis recording honestly that it is synthetic.

### 2.2 The taxable period is DERIVED, then FROZEN

**`clara.sst_taxable_periods`** — one row per (registration, period), generated by a deterministic
evaluator, never typed: `period_start`, `period_end` (**both ends inclusive**, matching `reporting_periods`
at `0057:283-285` — the estate must not carry two range conventions), `registration_id`, `seq`, `status`,
`due_date`, `due_date_status`, `varied boolean`.

**The first period is the sharp one**: s.25(1) runs it *from the date the person **should have been**
registered to the last day of the following month* — a **stub of up to two months, never a default two**.
Three arms, none defaulting: ordinary registration → from the effective date to the cycle end ·
**retroactive registration** → **backdated to the date registration was due** (s.13(4)/s.25(1); factsheet
§2), the expensive case, which must be representable because the tax was never charged to customers and
the business absorbs it · a DG-varied length → §2.3.

**`due_date` is NOT computed here.** It is read from **F-A4's due oracle** (R-L22). If the oracle cannot
answer, the row lands `due_date_status='not_evaluable'` and the period **stops in the open** — it never
guesses "last day of next month" locally, which is the second path law 81 forbids. *(As at 2026-08-23 no
F-A4 PR carries that DDL; §8 names the dependency rather than assuming a shape.)*

**F-T1's `statutory_deadlines` seed rows are Annex A.9** — seven rules, each cited in survey §3 and each
owned by the ORACLE rather than by each consumer. Three are not variants of the others and would be lost by
a single "last day of the following month" rule: **a varied period is due within 30 days** (s.26(2)),
**cessation within 30 days** (s.26(3)), and **SST-02A is MONTHLY** (s.26A(1), V-10). The **holiday
roll-forward** (Guide V3 ¶18) belongs to the oracle too.

### 2.3 DG variations — TWO axes, and the design refuses to collapse them

1. **Period LENGTH** — s.25(2)-(4) Act 807 / s.25(3)-(5) Act 806: apply in writing; the DG may allow,
   refuse, **vary**, or **unilaterally reassign with no application at all**.
2. **Accounting BASIS** — **s.11(1A)**: the DG may approve tax being due **when the invoice is issued**
   (S-4). **This changes which evaluator runs** (§3.2 vs §3.6), which is why it is a column.

A third reading — **Designated / Special Areas** — changes *whether tax applies to a supply*, not the
period or the basis; it is a scope attribute (§3.5) reporting at item 18(a). **OQ-1** asks the owner which
reading the contract meant. All three are built either way, but the lane's evidence points at Designated
Areas (V-12/V-13: the DG's-Decisions index has been static since 2018 while the DA regime was legislated
twice in 2024) — an inference from activity levels, not a sourced statement.

## 3 · The evaluator family

Every evaluator is **versioned** (an `evaluator_version int` stamped on each output row, the
`_policy_extract_quoted_value` idiom), **total** by contract (no input it cannot read may raise), and
**three-valued** — `pass` / `fail` / `not_evaluable`, fail-closed on the missing, malformed and unknown
(law 68).

### 3.1 The reference tables

**`clara.sst_rate_schedule`** (greenfield) on F-A8's `fx_rates` pattern: `id uuid pk`; `tax_type` +
`scope_key`; `effective_from`/`effective_to` **half-open**; `superseded_by`/`superseded_at` + paired CHECK;
the WHO/BASIS/WHEN trio; `source_note not null`; a partial unique index for the live row.

**Three rate FORMS, not one** (S-1, V-2, F-6): *ad valorem* (5/10/6/8%), **specific** (RM/litre, RM/kg —
Second Schedule, P.U.(A) 170/2025) and **per-unit** (RM25 per credit/charge card). So the table carries
`rate_kind ('ad_valorem','per_unit','per_measure')`, `rate_bp int`, `rate_amount_sen bigint` and
`unit_code`, with **exactly one of `rate_bp` / `rate_amount_sen` non-NULL**, CHECK-forced. `rate_bp` is
**basis points, the estate's existing SST unit** (`opening_items.sst_rate_bp`, survey §1.4; `800` = 8%).
**A design shipping `rate_bp` alone misprices every Part-C line.**

**The lookup key is the SERVICE DATE, and V-3 is the proof.** P.U.(A) 125/2026, gazetted 13 Mar 2026, is
*"deemed to have come into operation on 1 January 2026"* — rental/leasing was 8% to 31 Dec 2025 and 6%
after, **ruled ten weeks after the fact**. A "current rate" column produces wrong numbers for every
Jan–Mar 2026 rental invoice. TA-P2's backdated-row impact scan is not a nicety here; it is the only thing
that finds the affected entries, and **reg 11(1)(a) makes a credit note the prescribed vehicle for the
correction** (V-9) — so the scan's output feeds §3.7, never a silent recompute. Also honour **para 3(3)'s
mixed-supply rule** (V-2): for a Group A/C/D/E person the *other* taxable services are 8%, for Group B 6%
— a per-group rule, so it lives in `scope_key`, not in code.

Seeded by migration at birth (each `source_note` carrying the URL + fetch date), then written **only
through F-A8's door**; widening `p_table_key` and adding the parse rule is **F-A8's PR** (survey §4/6).
**The migration-only write assertion is armed here in its REACHABLE-CLOSURE form** — granted wrappers *plus
the ungranted cores they call*; the live `0016:5216-5228` scan is granted-only, so a core writer is
invisible to it. **A missing row REFUSES by name** (TA-P2, the `0016:565-575` idiom).

**`clara.sst_threshold_schedule`'s widening moves here too** (survey §4/5); the ordered ALTER and its
standing-census re-cut are Annex A.1. **Two structural defects it must also fix, found by V-6:** the live
CHECK `threshold_cents bigint not null check (threshold_cents>0)` **cannot represent Group H item 1's or
Group M's NIL threshold**; and the PK `(service_group, effective_from)` **cannot hold per-ITEM
thresholds**, which Group H (item 1 Nil vs items 2-4 RM1m) and Group I (items 14-16 RM1.5m vs RM500k) both
need. The two live seed rows cover only G and I — **eleven groups are missing**. **`PRD.md:215`'s prose
rates move into the table** in the same PR (digest law 16).

### 3.2 Service tax, payment basis — on real AR anchors

**The anchor is `clara.open_item_allocations`, and there is exactly one of them.** For a service
registration on `accounting_basis='payment'` and a period `[P_start, P_end]`, the tax that became due is
the sum, over every AR allocation settling in the period, of:

```
realised_tax(allocation) = round_half_up( allocation_amount_sen × invoice_tax_sen / invoice_gross_sen )
```

all three inputs DB-owned: `invoice_tax_sen` = the sum of the entry's `special_acc_type='sst_output'` legs,
the number `_assert_sales_invoice_shape_at` already ties to the stated tax (`0022:927-930`);
`invoice_gross_sen` = the AR `open_items.amount_cents` (`0037:739`); `allocation_amount_sen` =
`open_item_allocations.amount_cents` net of any `unallocate` reversing it (`0037:806-817`). **Outstanding is
derived, never stored** (`_subledger_outstanding`, `0037:874`).

**Five arms, none of them a default:**

| condition | arm |
|---|---|
| no `sst_output` leg, but the client IS registered for a covering group | **not a zero** — §7.3's should-have-charged condition, reported as an open condition |
| `invoice_gross_sen` zero, or the item missing | `not_evaluable`; the period cannot close |
| allocations exceed the invoice's gross | `not_evaluable` **for that invoice**, named — the arithmetic must never produce more tax than was charged |
| the settlement entry is not `approved` | excluded **and counted**; an unapproved settlement is not a receipt |
| the invoice pre-dates `effective_from` | routed to the retroactive arm (§2.2), never silently dropped |

**One rounding rule, stated and versioned.** Sen-level apportionment does not distribute exactly: apportion
half-up and **carry the accumulated residual onto the FINAL allocation that settles the invoice**, so
`Σ realised_tax = invoice_tax_sen` exactly on full settlement (Annex A.3: worked example + the
two-direction rig cell). **`opening_items.sst_portion_cents`** — write-only today (survey §1.4) — is read
here for exactly one purpose, the **brown-field opening position**: tax carried in on day one that has not
yet become due. It never becomes a second source for an ongoing invoice's tax (law 81).

### 3.3 s.11(2) — the twelve-month rule, and the date the estate does not have

⚠ **V-4 corrects the contract's own framing, and this is the highest-risk item in the design.** s.11(2)
runs **from the date the taxable service was PROVIDED**, not the invoice date — the pre-2019 wording said
invoice, and Act A1597 s.6(b) changed it. **Clara has no service-performed date.** `journal_entries` carries
`posting_date`, `open_items` carries `item_date`/`due_date`, the facts carry the invoice date — **none is
when the service was performed**, and for a lease, retainer or construction stage it is a **date range**.
Clocking from the invoice date recognises the deemed-due event **late** whenever billing lags performance,
the normal case in construction and professional services.

**So PR-4 adds `service_period_start`/`service_period_end` to the AR open item**, populated from the witness
facts where the document states a service period and **left NULL where it does not** — and a NULL makes the
sweeper return **`not_evaluable` for that invoice, never a fallback to the invoice date**. A silent fallback
would be the ARM-0 defect wearing an accounting hat. **OQ-5** asks whether an invoice-date proxy is
acceptable as an *advisory* early warning alongside the `not_evaluable`.

The sweep runs on **F-A4's clock, not a new one** (law 80), writing an `sst_deferred_realisation` row per
invoice. **Part payments make one invoice generate tax across several periods** (V-4): amounts received
fall due as received under s.11(1)(a), and only the still-unreceived part falls due after the twelve
months — so the liability model is **per-receipt plus a deemed-due sweeper**, never per-invoice. **The
sweeper is switchable per taxpayer and NOT hard-coded off for invoice-basis registrations** (V-16): the
lane's reading that s.11(2) is inert under s.11(1A) is *its own inference*, and s.11(2) is not expressly
disapplied. Law 21 as narrowed by TA-P5 governs the belt: *sign once at admin+, **the first firing
DRAFTS**, receipt everything.*

**Whether it also POSTS is OQ-4 — with the owner now.** **(a) return-only:** the tax enters the SST-02 sum
and nothing moves in the GL — zero blast radius, but the ledger's `sst_output` balance no longer equals the
tax position. **(b) ledger:** a reclassification moves the amount from a deferred account to SST payable —
accounting-correct, but it costs a new `special_acc_type` value (live tip `0017:673-677`, five values), a
CoR of `_assert_sales_invoice_shape_at`'s closed leg world, a D1 window, and it moves F-A2's B4-sales rung
with it. Under hard constraint 1 the recommendation is **(b) deferred**: ship (a) so the SST-02 is right,
take (b) as its own reviewed migration once F-A2's body has stopped moving. **Either way the first firing
DRAFTS.** Both arms are designed in Annex A.4, so neither ruling costs a redesign.

### 3.4 Bad-debt relief and its clawback — approval-gated, on DIFFERENT RAILS

Claim and clawback are the **same formula with opposite signs** — one core, two callers: `relief = A/B × C`,
`A` = the payment received, `B` = the value **plus** the tax, `C` = the tax payable (s.35(2)/s.36(1) Act 807;
s.36(2)(b)/s.37 Act 806 — V-8, S-6). Six load-bearing consequences; Annex A.6 carries reg 19's full evidence
list and the worked arithmetic.

**Annex A.6 carries reg 19's evidence list and the worked arithmetic.** Six consequences bind the design:
⚠ **`B` is TAX-INCLUSIVE** (both lanes named it the section's commonest modelling error), and under limb (b)
the claim is *the difference between the tax paid and `A/B × C`* · **three preconditions, not two** (s.35(1):
tax already **PAID**, amount **written off in the accounts**, DG **satisfied as to recovery efforts**) ·
**six years from the date the tax was PAID**, which is a DB fact only via `sst_return_payments` (§5.4), so
until that table exists the evaluator returns `not_evaluable` · **it is NOT self-assessed** — reg 19 wants
Form JKDM No. 2, the s.21 invoice, **the specific SST-02 the tax was paid on**, the non-receipt, recovery and
write-off records, and seven years of retention, and item 13(d) is filled *only after approval* (F-6), so
`sst_bad_debt_claims` runs `draft → submitted → approved → rejected` with **only `approved` reaching 13(d)**
and *"all reasonable efforts"* treated as evidence production (no dunning trail ⇒ `not_evaluable`) ·
⚠ **the two directions ride DIFFERENT RAILS** (reg 20) — the refund is an **out-of-return application**, the
clawback goes **IN the SST-02** for the period the payment is received, so never a signed pair on one ledger
line, and recovery re-arms it automatically · 🚫 **no six-month waiting period** exists in either Act or
either set of Regulations (a GST-era carry-over — **do not encode it either way**; U-4 keeps the
administrative residual open), while **invoice basis and relief are a PAIRED feature** (V-16), since under
s.11(1A) the taxpayer pays tax on uncollected invoices by design and shipping the flag alone builds a
one-way valve.

### 3.5 Scope, exemptions, and the areas

**`clara.sst_scope_treatments`** — effective-dated, per (client, scope target), with a **closed `treatment`
set drawn from the form's own Part D taxonomy** (F-5, V-11; enumerated in Annex A.2).
`codex-design-debate-sst.md` §C.1 is the standing instruction: *"do not implement one generic `exempt` switch
… Model legal effect, scope, evidence and effective dates separately."* **Deriving the set from the form is
deliberate: a treatment that cannot be DECLARED cannot be RECORDED**, which stops the classification layer
and the return layer growing two vocabularies. **A missing row is `unknown`, never `taxable` and never
`exempt`** — the `client_turnover_accounts` idiom (`0016:252-274`).

**Three distinctions the model keeps separate, each because RMCD does** (detail in Annex A.7): **(1) B2B
exemption ≠ group relief** — item 18(c) has **three printed sub-lines**, so the reason code is **three-way,
not boolean**, and the arithmetic differs, because a **scope exclusion** does not count toward the
registration threshold while an **exemption from payment** does. **(2) B2B is REGISTERED-TO-REGISTERED and
SAME-ITEM** — *a lawyer buying accountancy is not covered*; both lanes call it the most over-applied relief
in Malaysian service tax, so the wall refuses rather than assumes. **(3) The 5% de-minimis is a rolling ratio
with an alarm, not a year-end check** — exceeding 5% of supplies *outside* the group makes the **intra-group**
supplies taxable retrospectively, and by the time a year-end check fires the whole period is mischarged.

**Designated and Special Areas are a three-way DIRECTIONAL rule, not a flag** (V-12), keyed on the supplier's
**principal place of business** and the recipient's location: DA↔DA / SA↔SA / DA↔SA not chargeable unless
prescribed, **DA→Malaysia taxable**, **Malaysia→DA taxable**. ⚠ **Pulau 1 (Forest City) INVERTS it** —
P.U.(A) 370/2024 makes its internal and inter-area supplies **fully chargeable**, so modelling it as "just
another DA" systematically **under-taxes**. Each area's extent is a **statutory enumeration of named
islands**, so **postcode or state matching is not sufficient**: the locality list is data with an override.

### 3.6 Sales tax accrual, and the invoice-basis service arm

**s.11(1) Act 806** (S-3): tax is due *"at the time the taxable goods are sold, disposed of otherwise than
by sale, or first used"*. So the evaluator sums tax on approved entries whose `posting_date` falls in the
period, **with no allocation join at all** — and it must reach **own use and disposals** (items (9)/11:
*dipakai sendiri / dilupus*), taxable events with **no invoice and no AR item**. An evaluator built only on
AR misses them entirely.

**The same core serves a service registration on `accounting_basis='invoice_issued_approved'`** — one core,
two callers, selected by the registration's own column, keyed on **invoice issuance** rather than posting
date. **That is the one-architecture answer**: not two evaluators that each separately know what issuance
means. ⚠ Per **V-17** the model must not assume an invoice always exists — s.21(1A) lets the DG approve
*not* issuing one, and a taxpayer holding both approvals has no triggering event at all; that combination
returns `not_evaluable` by name.

### 3.7 Credit and debit notes — reg 11, and the period of the NOTE

Posting already exists (survey §2). The **return** side is new, and ⚠ **the governing regulation is reg 11,
not reg 22/23** — regs 22-23 are the *Electronic Service* Part (V-9). Four rules, all statutory:

**Four rules, all statutory** (Annex A.8 has the ten prescribed particulars): **(1)** the obligation bites
only **AFTER the return has been furnished** — a correction found *before* filing is reg 15, *Correction of
errors* — so **the adjustment router branches on return-filed status and must know WHICH return covered the
original supply**. **(2)** the deduction or addition goes in the return for **the period in which the NOTE IS
ISSUED OR RECEIVED** (reg 11(2)) — **the note's period, never a restatement**; the 31 May 2026 guide's
"following taxable period" gloss (F-5) is the common case of this rule, and a CN evaluator that nets within
the original period understates the current return and overstates the next. **(3)** ⚠ **a CN cannot be
raised against an aggregate customer balance** (V-18): reg 11(3)(j) demands the original invoice's number and
date, (b) a dedicated serial sequence, (e) a printed reason — so **the estate's unallocated-credit path,
`open_item_allocations.operation_kind='apply'` (`0037:790`), must be CLOSED for service-tax-bearing items**.
A wall (§7.2), not a warning. **(4)** debit notes are **ADDITIVE inside columns (8) and (10)** — no DN line to
map; and on the **service** side a CN against an invoice never paid deducts nothing, so that arm mirrors §3.2
on the negative side while the **sales** side takes the naive accrual sum. Two arms, chosen by `tax_type` and
`accounting_basis`, never by a heuristic.

### 3.8 Imported taxable services — the reverse charge

Timing is **s.11(1)(b)**: *payment made or invoice received, whichever is earlier*. A **registered** person
declares in SST-02 **Part B1 with a special code**; a **non-registered** person declares on **SST-02A** under
**s.26A** — and ⚠ **s.26A(1) is MONTHLY**, not the two-month taxable period (V-10): a **separate filing
calendar**, which is why §2.2 seeds it as its own deadline rule. Four consequences:

**Four consequences.** **(1)** It is an **OUTPUT-side liability arising from a PURCHASE document**, and the
supplier-bill floor refuses an `sst_output` leg on a purchase (`0015:842`) — **that wall stays**; the
liability is a separate entry or a return-only line (the OQ-4 shape), never a smuggled leg, and the
`sst_purchase_cost` leg is a *cost* marker tied to `invoice.tax_total`, not this. **No input credit** (law
17) — though *honest grading*: the RMCD guide never says "no ITC" affirmatively, so V-10 records it as an
absence-of-mechanism finding. **(2)** A client with **NO registration still files SST-02A**, so §5 cannot key
a return's existence on `sst_registrations`; and ⚠ **SST-02A prints only a 6% line** despite P.U.(A) 64/2024
(F-7), so the producer emits the *correct* rate and raises **`form_rate_line_missing`** rather than declaring
6% on 8%. **(3)** ⚠ **A self-billed e-invoice is also required and must CARRY the service tax** (F-10: v4.8
§10.4.3-10.4.9, timed to align with s.26A) — two obligations, one event, aligned deadlines, colliding with
`PROGRESS.md:297` where self-billed detection is **UNSCHEDULED** (§10/R11). **(4)** Imported-service treatment
now lives **inside each GROUP's policy chain**, not one guide (V-10, V-15), so source-monitoring walks every
policy and the 2019 guide (still computing at 6%) is not a source.

### 3.9 The statutory basis

**Every statutory claim above is cited in `sst-engine-survey.md` §3** with its URL and fetch date, or marked
UNVERIFIED. **U-1 … U-5 are the named holes** — chief among them P.U.(A) 174/2025, the likely home of B2B
relief for the five new groups, whose text no lane could reach.

## 4 · Dual-registrant separation that survives export

**RMCD has already separated it, and that is the design's spine** (F-1). The form's printed note: *"This
form must be declared separately for Sales Tax and Service Tax"*; the guide: the manual form *"hanya
membenarkan SATU Nombor Pendaftaran SST SAHAJA"*; item 12 is an exclusive **OR**; every other field is
marked sales-only or service-only. **A dual registrant files TWO returns.** MyInvois corroborates the
two-number world — its SST field allows *"up to 2 SST numbers separated by semicolon"* (F-9).

So the model is already right: **one registration row per `tax_type` → one period series → one return.**
Separation at the return layer is structural and free; it is not a feature to build.

**What is NOT free is the LEDGER** (survey §1.5, S1): `uq_coa_special` is unique on
`(client_id, special_acc_type)` (`0003:58`), so a client has **one** `sst_output` account, and
`_assert_sales_invoice_shape_at` ties **all** output legs to **one** stated tax (`0022:927-930`).

| shape | how it separates the GL | cost |
|---|---|---|
| **A — two COA markers** (`sst_output_sales`, `sst_output_service`) | structurally | widens the `special_acc_type` CHECK (**live tip `0017:673-677`, five values**), changes `uq_coa_special`'s meaning, **CoRs `_assert_sales_invoice_shape_at`** (F-A2's live body), moves B4-sales with it. **D1.** |
| **B — a per-entry tax-type tag** | at the fact layer | the OCR/witness path carries no `tax_breakdown` (survey §1.6 / R4), so the tag would often be `unknown` |
| **C — registration-derived**: one `tax_type` registered ⇒ all output tax is of that type; a **GL-ambiguous dual registrant REFUSES** | no ledger change | correct for every client in the estate today, and honest about what it cannot do |

**Chosen: C now, A later, and the refusal is narrow and named.** No client in the estate is SST-registered
at all (survey §5), so paying A's D1 cost into a wave where nothing exercises it buys nothing and risks
F-A2's live body. **`dual_registration_gl_ambiguous` fires only for a client holding BOTH registrations**
and stops the producer in the open rather than mis-declaring. **OQ-3** puts A's timing to the owner.

**"Surviving export"** means the separation lives in the exported artifact's *data*: every emitted line
carries its `tax_type` and `registration_id`, and each return exports as its own document — because that is
what RMCD requires it to be.

## 5 · The SST-02 producer

### 5.1 What it means, and what it must not become

TA-P11(3) blesses a producer outside the seal/claim chain **on the condition that it shares the
deterministic evaluators and the bigint arithmetic beneath**. The failure it must avoid is TA-P11's own
test: *two mutually-unaware computations of the same fact*.

- **The producer computes NOTHING.** It reads `clara.sst_return_lines`, which §3's evaluators wrote from
  DB-owned period aggregates. If a figure is not already a row, it is not on the form.
- **One entrance per surface**: one function materialises, one renders. **Not claim-eligible, no definition
  version** — F-A5's preview-cell pattern.
- **E-invoice tax lines are a CROSS-CHECK, never a feed** (F-9). No MyInvois → SST-02 feed exists; the
  systems have different owners (LHDN vs RMCD), different grains (document vs period aggregate) and
  different bases, and SST-02's adjustments (13(a)'s note-period rule, 13(b)/(d)'s approval gates) have no
  e-invoice counterpart. Worse, the OCR/witness path emits no `type_code` and no `tax_breakdown` at all
  (survey §1.6), so a feed would silently mis-split every non-structured document. Where a UBL breakdown
  exists it is **compared**; a disagreement is a named condition, never a substitution.

### 5.2 The return objects

**`clara.sst_returns`** — one per (registration, period): `status`
(`draft`/`materialised`/`superseded`/`submitted_externally`), `amendment_seq` (the form's own *Pindaan*
number), `evaluator_version_set jsonb` (the reproducibility key), `materialised_at`, `materialised_by`,
`nil_return boolean`. Immutable + supersede: a re-run mints a NEW return and supersedes the old.
**`clara.sst_return_02a`** is the sibling for the non-registrant monthly reverse-charge declaration (§3.8),
keyed on the client, not a registration.

**`clara.sst_return_lines`** — one row per **form field**: `field_key`, `tax_type`, `rate_kind`,
`rate_bp`/`rate_amount_sen`, `taxable_value_sen`, **`unit_count`** (item 11(e) is declared in *cards*, not
ringgit — a value-only schema cannot hold it), `tax_sen`, `evaluator`, `evaluator_version`, and `basis
jsonb` naming the DB inputs it summed, so a reader walks from a form field to the entries behind it. **Field
keys are DATA, not code constants** — `my-tax-verified-2026-07-29.md` §1.1's lesson (*"Never key a policy
record on 'Table 3.6 item 7' — key it on the rule text"*); and **V-19 shows the same trap in the law
itself**: First-Schedule item 10 is *"complimentary"* in the gazette and *"complementary"* in the
Regulations, so **nothing is ever keyed on a description string**.

### 5.3 The per-field mapping

Form: **BORANG SST-02 (AMENDMENT 2025), 27.8.2025**; guide: **31 May 2026** (which withdrew and replaced the
10 Sept 2025 guide). **The complete item-by-item mapping — all 27 items, Parts A–G — is Annex A.2.** Six
rules govern it, and they are the ones a builder gets wrong:

Six rules govern it, and they are the ones a builder gets wrong. **(1) Item 12 is an exclusive OR and the
guide adds Part C to the sales arm** — *sales:* `[11(a)+11(b)] + 17`, *service:* `[11(c)+11(d)+11(e)]`; **the
printed form omits the `+17`**. **(2) Item 14 differs between the form face and the guide, and the guide
wins** (F-4) — *sales:* `(12) − 13(a) − 13(b) − 13(d) − 13A`, *service:* `(12) − 13(a) − 13(c) − 13(d)`;
**the printed formula omits 13(d) and merges the tax types**, so a build reading the form face ships a wrong
return. **(3) Item 15's penalty is NOT computed** — 10/+15/+15 capped at 40%, *system-generated by CPPS on
keying-in* (F-6) and charged on the amount still unpaid at each stage; it is emitted as
**`externally_determined`** and item 16 is `not_evaluable` until supplied, because computing a penalty we do
not own would be a fabricated number. **(4) Item 11(e) is counted in CARDS** (`__ UNIT × RM25`), and **items
(9) and 11 carry own-use and disposals** — taxable events with no invoice and no AR item. **(5) Three
line-groups are deliberately unbuilt** — 13(b)/13A (s.41A credit), 13(c) (s.39 deduction) and Part E
(Schedule C purchases), each a separate RMCD approval regime with no consumer here; they emit **zero with a
stated `not_in_scope` basis, never a blank**, so a reader can tell "we did not claim this" from "there was
nothing to claim". **(6) Part F is human** and Part G is never populated; the **amendment window** (F-8) is
unlimited before the due date *and* before payment, and closed after either — then it is MySST's *Supplement*.

### 5.4 NIL validity, and the payment record

**A NIL return is a positive act, not an absence**, and the statute agrees: **s.26(5) Act 807 / s.26(6) Act
806** — the return *"shall be furnished whether or not there is service tax to be paid."* The mechanics are
the form's own note: *"Sekiranya tiada nilai untuk diikrar, sila isi angka '0'"* — **fill `0` in every
mandatory field; there is no NIL tick-box** (F-3). So `nil_return=true` is set only when **every** evaluator
returned `pass` with a zero result; **any** `not_evaluable` makes the return non-NIL *and* non-materialisable
with the failing conjunct named — an unclassified income account, a missing rate row, an over-allocated
invoice or a missing service-period date produces a **stopped period and an open question**, never a quiet
NIL. That is review law 2 in one field.

**`clara.sst_return_payments`** — the payment against a materialised return (date, amount, reference),
existing for one reason: §3.4's six-year window runs from *the date the tax was paid*, and without it that
date is not a DB fact; reg 19(1)(b) also requires reproducing **the specific SST-02 on which the tax was
paid**, years later. Recording it is a human act by nature; the bank line matches through the ordinary
reconciliation, not a new mechanism.
## 6 · Continues in part 2

**`sst-engine-design-part2.md`** carries the rest of this design and is part of it, not an annex:
**§6** Clara's judgement and the one-click question path · **§7** watches, walls and receipts (incl.
§7.3, TA-P11's should-have-charged residual) · **§8** the build sequence as PR rows with ceremony needs ·
**§9** acceptance against BEE / RPR / RS · **§10** risks and named non-goals · **§11** the annex map ·
**§12** the change log.
