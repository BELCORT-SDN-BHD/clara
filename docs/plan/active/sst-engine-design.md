# F-T1 — the SST engine: design v2 (gate-folded 2026-08-23)

> **Design of record** for Wave F Track B item **F-T1**, §1-§4. Companions: `sst-engine-survey.md` (the
> estate at the bytes, **and every statutory citation with its URL + fetch date** — cited below by row id
> `S-*` / `V-*` / `F-*` / `U-*` / `M1`) · `sst-engine-design-part2.md` (**§5-§12**, opening with the SST-02
> producer) · `sst-engine-annexes.md` (mechanics A.1-A.9, the SST-02 field inventory, decision register, rig
> predictions, owner questions) · `sst-engine-annexes-2.md` (**Annex F — the gate-folded mechanisms**) ·
> `sst-engine-gate-record.md` (**the PR-0 gate, and this fold's specification**). Binds under hard constraint
> 2 + `PRD.md` §6 (**the DB owns every authoritative number**) and digest laws **16 · 17 · 18 · 21** (as
> narrowed by TA-P5) **· 22 · 68 · 71/78 · 75 · 80 · 81**, plus **TA-P2**, **TA-P4**, **TA-P11** and
> **R-L22**.
>
> **v2 folds the PR-0 gate** (five lenses + a refute-style verify pass; two blockers, sixteen materials and
> five nits CONFIRMED, eight REFUTED). Fourteen findings are folded into this set; **four are reserved to the
> owner as open cards OQ-11 … OQ-14** and are marked in place. **No card is a silent default** — each stands
> on a fail-closed position until ruled.
>
> **This document designs; it does not build.** No migration is authored here, and no statutory rule is
> restated without a survey §3 row behind it. *(The gate found one breach of that rule — the taxable-period
> anchor, §2.2 — and struck it.)*

## 1 · The ruled shape (fixed, not designable)

1. **Every SST figure comes from a versioned deterministic DB evaluator over DB-owned inputs.** Hard
   constraint 2; owner Q1 = A. Clara may *propose* a classification, *narrate* a return, *draft* a
   question — she never authors a numeral that lands in a return.
2. **Her judgement is CLASSIFICATION, SCOPE and PERIOD — never arithmetic.** "Is this revenue a taxable
   service, and in which group?" is hers. "What is 8% of RM12,340.55?" is the DB's.
3. **SST-02 gets its own form producer** — TA-P11(3): *"outside the seal/claim chain but sharing the
   deterministic evaluators and the bigint arithmetic beneath"*, part of F-A10's closing criterion.
4. **The `sst_rate_schedule` is F-T1's; F-A8 attaches only the fetch** (TA-P2; `wave-f-contract.md:340`,
   `PROGRESS.md:135`). Rows land through F-A8's **audited owner one-click door**, never a PR, behind two
   mechanical checks; immutable + supersede; a backdated effective date triggers a downstream impact scan;
   **a missing row for the day REFUSES by name and stops in the open.**
   ⚠ **`sst_threshold_schedule`'s ALTER is NOT settled ground and v1 was wrong to list it here** (GB-2).
   Survey §1.7 records a conductor reversal moving it to F-T1, but **that reversal is corroborated nowhere
   outside this design set**: `wave-f-contract.md:340` and `PROGRESS.md:135` move only the *rate* table, no
   ADR carries it, and `internet-lane-design.md` — **live** per `docs/plan/index.md`, v3, dated the same day
   and itself gated — still assigns the identical ALTER to **F-A8's PR-3** (`:431`), spelled out again in
   `internet-lane-annexes.md` Annex M/S-16 and `internet-lane-gate-record.md:378`. Two live documents each
   author the same DDL on the same two-row table; whichever migration lands second collides. **This is
   owner card OQ-14, and it BLOCKS F-T1's PR-1** — the fail-closed position is that **F-T1 does not author
   the threshold ALTER** until the ownership is ruled cross-document. Annex A.1's ordered ALTER stands as
   the *specification* of the work either lane would do, not as a claim on it.
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
| `taxable_period_months`, `period_anchor_month`, `anchor_source`, `service_groups text[]` | default 2 (s.25(1)). ⚠ **The anchor is RECORDED, not derived** — see below. **s.25(4) lets the DG reassign a period with no application**, so this is dated history, not config |

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

⚠ **The cycle anchor is RECORDED, never inferred — and v1's rule was struck at the gate** (GM-8). v1 said
*"the cycle follows the FYE"*, with **no survey §3 row behind it**, in a design whose own header forbids
restating a statutory rule without one. Nothing sources it: no §3 row anchors the cycle on the financial
year, the one row that does speak (**S-7**) anchors it on the *registration effective date*, and
`docs/phase2-research/design-saas.md:157` states the opposite outright — SST taxable periods are *"distinct
from the financial year"*. Since the anchor decides **every** period boundary and therefore every due date,
a wrong one is systematic, not per-transaction. **The v2 rule, three arms:**

1. **`period_anchor_month` is a recorded fact**, transcribed from RMCD's own assignment (the MySST approval
   letter names the taxable period), on the same opaque-operator-record pattern §2.1 already uses for the
   s.11(1A) / s.25(3) trio — `basis` and `basis_kind` bind it, and eligibility is never derived.
2. **Absent, the generator falls back to S-7's SOURCED s.25(1) rule** — first period from the effective date
   (or the date registration was due) to the last day of the following month, two months thereafter —
   stamping `anchor_source='s25_1_derived'` on every row, so the return's `basis` says so.
3. **A derived anchor is a surfaced condition, not a silent default**: an `sst_period_anchor_unconfirmed`
   watch stands until the operator transcribes RMCD's assignment, and a correction **supersedes** the series
   rather than editing it. With no effective date either, no series is generated and the registration stops
   in the open (`no_period_anchor`, §7.2). `sst_registrations`' full column list is **Annex A.1**.

**`due_date` is NOT computed here.** It is read from **F-A4's due oracle** (R-L22). If the oracle cannot
answer, the row lands `due_date_status='not_evaluable'` and the period **stops in the open** — it never
guesses "last day of next month" locally, which is the second path law 81 forbids. *(As at 2026-08-23 no
**The DDL's home is ruled: F-A4 PR-1c, the additive no-ceremony PR** (conductor's ledger,
2026-08-23). F-T1's PR-2 depends on it and assumes nothing about its column shape.)*

**F-T1's `statutory_deadlines` seed rows are Annex A.9** — seven rules, each cited in survey §3 and each
owned by the ORACLE rather than by each consumer. Three are not variants of the others and would be lost by
a single "last day of the following month" rule: **a varied period is due within 30 days** (s.26(2)),
**cessation within 30 days** (s.26(3)), and **SST-02A is MONTHLY** (s.26A(1), V-10). The **holiday
roll-forward** (Guide V3 ¶18) belongs to the oracle too.

### 2.3 DG variations — TWO axes, and the design refuses to collapse them

**(1) Period LENGTH** — s.25(2)-(4) Act 807 / s.25(3)-(5) Act 806: apply in writing; the DG may allow,
refuse, **vary**, or **unilaterally reassign with no application at all**. **(2) Accounting BASIS** —
**s.11(1A)**: the DG may approve tax being due **when the invoice is issued** (S-4). **This changes which
evaluator runs** (§3.2 vs §3.6), which is why it is a column. A third reading — **Designated / Special
Areas** — changes *whether tax applies to a supply*, not the period or the basis; it is a scope attribute
(§3.5) reporting at item 18(a). **OQ-1** asks the owner which reading the contract meant; all three are
built either way, but the lane's evidence points at Designated Areas (V-12/V-13) — an inference from
activity levels, not a sourced statement.

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

**`clara.sst_threshold_schedule`'s widening is specified in Annex A.1** — the ordered ALTER, its
standing-census re-cut, and the **two structural defects V-6 found**: the live CHECK `threshold_cents > 0`
**cannot represent Group H item 1's or Group M's NIL threshold**, and the PK `(service_group,
effective_from)` **cannot hold per-ITEM thresholds**, which Group H and Group I both need. The two live seed
rows cover only G and I — **eleven groups are missing** — and **`PRD.md:215`'s prose rates move into the
table** with them (digest law 16). ⚠ **WHICH LANE authors that ALTER is owner card OQ-14** (§1 point 4);
until it is ruled, this is a specification, not a claim.

### 3.2 Service tax, payment basis — on real AR anchors

**The anchor is `clara.open_item_allocations`, and there is exactly one of them.** For a service
registration on `accounting_basis='payment'` and a period `[P_start, P_end]`, the tax that became due is
the sum, over every AR allocation settling in the period, of:

```
realised_tax(allocation) = round_half_up( allocation_amount_sen × invoice_tax_sen / invoice_gross_sen )
```

**All three inputs are DB-owned, and each carries an `input_convention_version` stamped on the output row
beside `evaluator_version`** — so a corrected convention is a new version, never a silent re-read. The
derivations, with their bytes, are **Annex F.1**; why each reads as it does is the gate record.

| input | definition |
|---|---|
| `invoice_tax_sen` | the sum of the entry's legs on **the account the registrant's own basis credits AT INVOICE** — `sst_output_deferred` for a payment-basis service registration, `sst_output` for the invoice-basis and sales arms (§3.6). Keyed on `sst_registrations.accounting_basis`, **never on one account name**: under the ruled OQ-4 mechanism the payment-basis invoice has no `sst_output` leg at all, and tie 5 sees the tax in **either** account, *not the sum of both* (Annex A.4) |
| `invoice_gross_sen` | the AR `open_items.amount_cents` (`0037:739`), **positive by `ck_open_items_kind_matrix`** (`0037:765`) |
| `allocation_amount_sen` | **`−1 ×` the sum of `open_item_allocations.amount_cents` over the rows whose `item_id` IS the invoice item**, bounded `effective_date <= P_end`, **reduced to its CASH-BACKED portion** |

**The sign transform is STATED, not assumed.** The estate writes a balanced pair — **`-X` against the settled
item, `+X` against the settlement item** (`0037:1248-1257`; `_subledger_outstanding` = `amount + Σ
allocations`, `0037:874-880`) — and the positive half cannot say *which* invoice it settles, since one
receipt writes N of them into one `application_group`. So the invoice's own **negative** row is the only
available join and the negation is part of the convention, never a build-time `abs()`. Two consequences the
arms table carries: the over-allocation predicate is **`_subledger_outstanding(item) < 0`**, never
`Σ allocations > gross`, which on negative rows can never be true; and **A.3's cell asserts the sign
directly**, because a cell proving only `Σ realised_tax = invoice_tax_sen` is green on the wrong sign — the
residual carry absorbs it.

**Cash-backed, not allocated.** An allocation set may total **cash PLUS a settlement discount**
(`v_gross := p_amount_cents + v_disc`, `0044:1073`), and the AR bank-line path passes a **bank charge**
through the same parameter slot (`0044:1927`). The two are economically opposite — a waiver is consideration
never received, a charge is consideration the customer *did* discharge — and they are **indistinguishable at
the bytes**, both landing as one debit leg captioned `'Settlement discount'` (`0044:1313`; review law 3). So
the non-cash leg's ACCOUNT carries a closed per-account treatment (`consideration_waived` /
`consideration_received_net`) on §3.5's missing-row-is-`unknown` idiom, and a missing row is **`not_evaluable`
by name** (`settlement_leg_unclassified`) — never a default in either direction. **Annex F.1(b)** has the
apportionment and the §3.7 interlock.

**Date-bounded, never retroactive.** An `unallocate` carries **its own `created_at::date`** as
`effective_date` (`0040:771-773` — *"corrected history is NOT retroactive"*); an `allocate` carries the
settlement entry's `posting_date` (`0040:777-787`). Netting through the `reverses_allocation_id` pairing link
alone is **date-blind**, so a May unallocate would reduce a Jan–Feb figure already furnished — the treatment
§3.7 rule (2) forbids. The sum is therefore bounded on `effective_date <= P_end`, the house as-of pattern
(`0058:394`), and the later-period movement routes through §3.7's filed-return-aware router.

**Seven arms, none of them a default:**

| condition | arm |
|---|---|
| no leg on the **basis-correct** invoice account, but the client IS registered for a covering group | **not a zero** — §7.3's should-have-charged condition, reported as an open condition. *Keyed on the basis-correct account: read against `sst_output` alone this arm fires on every payment-basis invoice in the book* |
| `invoice_gross_sen` zero, or the item missing | `not_evaluable`; the period cannot close |
| `_subledger_outstanding(item) < 0` — the position is over-settled | `not_evaluable` **for that invoice**, named — the arithmetic must never produce more tax than was charged |
| the settlement entry is not `approved` | excluded **and counted**; an unapproved settlement is not a receipt |
| the invoice pre-dates `effective_from` | routed to the retroactive arm (§2.2), never silently dropped |
| **the tax on this item is already DEEMED DUE** under s.11(2) | the allocation realises **only the residue** `invoice_tax_sen − Σ already-realised(item)`, read from `sst_deferred_realisation` — §3.3's interlock, Annex F.2 |
| **the settlement's non-cash leg is unclassified** | `not_evaluable` by name (`settlement_leg_unclassified`); tax is never declared on money whose nature is unknown |

**One rounding rule, stated and versioned.** Sen-level apportionment does not distribute exactly: apportion
half-up and **carry the accumulated residual onto the FINAL allocation that settles the invoice**, so
`Σ realised_tax = invoice_tax_sen` exactly on full settlement (Annex A.3: worked example + the
three-direction rig cell). **`opening_items.sst_portion_cents`** — write-only today (survey §1.4) — is the
**brown-field opening position**: tax carried in on day one that has not yet become due. Under the ruled GL
mechanism that position needs a **day-one credit to `sst_output_deferred`**, which the opening seed does not
post (`0017:3305-3313` builds exactly two legs, control and OBE, and the SST trio is copied to
`opening_items` as a memo at `:3463-3470`); an `item_kind='opening'` AR item also carries **no entry legs at
all**, so it needs its own `invoice_tax_sen` source. Both are specified in **Annex F.3**, and an opening AR
item with a NULL `sst_portion_cents` under a registration effective on or before its `item_date` is
`not_evaluable` by name (`opening_sst_unknown`). It never becomes a second source for an ongoing invoice's
tax (law 81).

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
acceptable as an *advisory* early warning alongside the `not_evaluable`. ⚠ **But OQ-5's three options all
leave the return unfileable, and that is owner card OQ-13** (GM-9): §5.4 makes **any** `not_evaluable`
non-materialisable, `open_items` is UPDATE-blocked by trigger (`0037:824`) so the column is a **birth fact
only**, the witness path has no service-period source today, and §6's question path may mint **no new
authority path** (law 81) — so *no operator door exists to supply the date*, and one legacy invoice blocks
every SST-02 for that registrant while the duty to file runs. `opening_items` has no service-date column
either (`0017:1135-1176`). **PR-4's ADD COLUMN must not open until OQ-13 is ruled** — after it lands, every
row alive at that moment is permanently stranded.

The sweep runs on **F-A4's clock, not a new one** (law 80), writing an `sst_deferred_realisation` row per
invoice. **Part payments make one invoice generate tax across several periods** (V-4): amounts received
fall due as received under s.11(1)(a), and only the still-unreceived part falls due after the twelve
months — so the liability model is **per-receipt plus a deemed-due sweeper**, never per-invoice. **The
sweeper is switchable per taxpayer and NOT hard-coded off for invoice-basis registrations** (V-16): the
lane's reading that s.11(2) is inert under s.11(1A) is *its own inference*, and s.11(2) is not expressly
disapplied. Law 21 as narrowed by TA-P5 governs the belt: *sign once at admin+, **the first firing
DRAFTS**, receipt everything.*

**OQ-4 IS RULED (owner, 2026-08-23): THE GL CARRIES THE DEFERRAL.** *(The ruling relay lettered it "(a)";
Annex D letters the same substance "(b)". **The letters are inverted between the card and this document —
the substance governs and is not in doubt.**)* **The ruling is also WIDER than OQ-4 asked**: it is not only
the twelve-month edge case but **the normal payment-basis path**. Two liability accounts —
**`sst_output_deferred`** credited at invoice for every payment-basis service-tax registrant, transferred to
**`sst_output`** (payable) **on receipt** (an allocation, §3.2) **or on the s.11(2) twelve-month day**,
whichever comes first. The transfer is posted by `allocate_receipt` and by the belt, **DB-owned and
receipted**; **registrants on the s.11(1A) invoice-basis election skip the deferred account entirely**
(a per-registration scope flag). **Owner's reason, recorded:** it matches local practice — AutoCount and
SQL Account both carry an "SST Deferred" account — and it is what an auditor expects to see.

**The SST-02 then cross-checks two DB-owned derivations of the same fact, and a mismatch REFUSES rather
than silently picking one.** ⚠ **The gate corrected both operands (GM-4): v1 compared the payable account's
whole period movement against §3.2's allocation sum, and those are not the same fact.** The payable account
also carries CN debits (13(a)), the imported-services reverse charge (§3.8), and — decisively — the belt's
own deemed-due transfers, which §3.2's allocation sum by definition excludes; a bare equality would have
refused on any ordinary period containing a credit note or a twelve-month sweep, while s.26(5) Act 807 makes
furnishing mandatory regardless. **v2 scopes each side by name:**

- **Side A — the TRANSFER movement.** Only the `sst_output_deferred → sst_output` transfer legs, identified
  by a **DB-owned entry marker** written by the two transfer writers (`journal_entries.flags →
  `sst_deferral_transfer``, the `0044:1300-1303` `settlement_allocation` idiom), **never by inferring intent
  from an account pair**. Every other movement in the payable account is out of scope for this check and
  reaches the form at its own item.
- **Side B — realised PLUS deemed.** §3.2's allocation-derived sum for the period **plus** the belt's
  `sst_deferred_realisation` rows dated in the period. Per-receipt *and* the deemed-due sweeper — the model
  §3.3 already states — so side B is the same population side A posts.

A mismatch refuses by name (`deferral_transfer_mismatch`) against **that identity**, not against the whole
return, so a return with an unrelated defect still names the right conjunct. That is a differential control,
not TA-P11's second architecture: the two derivations are *mutually aware* by construction. §5.1's "the
producer computes nothing" is unchanged — both figures are evaluator output. **First firing still DRAFTS**
(law 21). Annex A.4 carries the shape and the costs the ruling accepts; **Annex F.4 carries the operands**.

⚠ **The two transfer writers need an INTERLOCK, or the same tax transfers twice** (GM-5). "Whichever comes
first" is the rule; v1 gave it no mechanism, and the failure is silent: an invoice 20% paid at month 6, swept
for the unreceived 80% at month 12, then paid in full at month 18 posts the 80% twice — and §3.3's own
cross-check *agrees* on the doubled figure, because side A is the transfer `allocate_receipt` just posted and
side B is the `realised_tax` that sized it. **`sst_deferred_realisation` is therefore the interlock, not just
a record**: it is the per-item ledger of what has already become due, both writers read it before posting,
and each transfers `min(candidate, invoice_tax_sen − Σ already-realised(item))`. §3.2's sixth arm is its
read side. **Annex F.2** carries the mechanism, the writer census — ⚠ **`_settle_from_bank_line_core` calls
`_allocate_receipt_core` DIRECTLY** (`0044:1927`; the census is pinned at `0055:243-244`), so a transfer
posted in the *wrapper* misses every bank-line settlement — and the two-direction cell for swept-at-12 →
paid-at-18 that A.3's cell cannot see.

### 3.4 Bad-debt relief and its clawback — approval-gated, on DIFFERENT RAILS

Claim and clawback are the **same formula with opposite signs** — one core, two callers: `relief = A/B × C`,
`A` = the payment received, `B` = the value **plus** the tax, `C` = the tax payable (s.35(2)/s.36(1) Act 807;
s.36(2)(b)/s.37 Act 806 — V-8, S-6). **Six consequences bind the design, and Annex A.6 carries them in full
with reg 19's evidence list and the worked arithmetic**: ⚠ `B` is **TAX-INCLUSIVE**, the section's commonest
modelling error · **three preconditions, not two** (s.35(1)) · **six years from the date the tax was PAID**,
a DB fact only via `sst_return_payments` (§5.4), so until that table exists the evaluator is `not_evaluable` ·
**it is NOT self-assessed**, so `sst_bad_debt_claims` runs `draft → submitted → approved → rejected` with
**only `approved` reaching 13(d)** · ⚠ **the two directions ride DIFFERENT RAILS** (reg 20) — the refund is an
out-of-return application, the clawback goes IN the SST-02 · 🚫 **no six-month waiting period** exists in
either Act (a GST-era carry-over — do not encode it either way), while **invoice basis and relief are a
PAIRED feature** (V-16).

### 3.5 Scope, exemptions, and the areas

**`clara.sst_scope_treatments`** — effective-dated, per (client, scope target), with a **closed `treatment`
set drawn from the form's own Part D taxonomy** (F-5, V-11; enumerated in Annex A.2).
`codex-design-debate-sst.md` §C.1 is the standing instruction: *"do not implement one generic `exempt` switch
… Model legal effect, scope, evidence and effective dates separately."* **Deriving the set from the form is
deliberate: a treatment that cannot be DECLARED cannot be RECORDED**, which stops the classification layer
and the return layer growing two vocabularies. **A missing row is `unknown`, never `taxable` and never
`exempt`** — the `client_turnover_accounts` idiom (`0016:252-274`).

**Three distinctions the model keeps separate, each because RMCD does — Annex A.7 carries them:** **(1) B2B
exemption ≠ group relief**, so item 18(c)'s reason code is **three-way, not boolean**, and a **scope
exclusion** does not count toward the registration threshold while an **exemption from payment** does ·
**(2) B2B is REGISTERED-TO-REGISTERED and SAME-ITEM** — *a lawyer buying accountancy is not covered* — the
most over-applied relief in Malaysian service tax, so the wall refuses rather than assumes · **(3) the 5%
de-minimis is a rolling ratio with an alarm, not a year-end check**, since breaching it makes the
**intra-group** supplies taxable *retrospectively*. **Designated and Special Areas are a three-way
DIRECTIONAL rule, not a flag** (V-12), keyed on the supplier's principal place of business and the
recipient's location, with ⚠ **Pulau 1 (Forest City) INVERTING it** (P.U.(A) 370/2024) and each area's extent
a **statutory enumeration of named islands** — postcode or state matching is not sufficient.

⚠ **B2B collides with the name-only invariant, and the design stops rather than routing around it.**
Evaluating `b2b_exempt` needs the RECIPIENT's registration status and First-Schedule item — a hard
identifier fact about a *counterparty*. **PRD §6 invariant 2(b)** forbids enriching a name-only client's
counterparties by inference, generally: *"no registration number, no TIN."* The DB wall that discharges it
(`0062`) is a BEFORE-row trigger on **`clara.counterparties` alone** (`0062:253-254`), so a new table is
outside it by construction — which makes this a **design-level closed world, not a trigger the design may
lean on**. Three rules: `sst_scope_treatments` carries **no counterparty identifier column**; a scope target
resolving to a counterparty of a name-only client makes `b2b_exempt` **`not_evaluable` by name**
(`b2b_recipient_unidentifiable`, §7.2), never `taxable` and never `exempt`; and **if the B2B arm is ever
found to need a counterparty identifier, the build STOPS and escalates** — the same discipline Annex A.4
already carries for the deferred-SST arm, now stated for both. Lifting name-only stays `0063`'s OWNER-only
audited act.

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
not reg 22/23** — regs 22-23 are the *Electronic Service* Part (V-9).

**Four rules, all statutory** (Annex A.8 has the ten prescribed particulars): **(1)** the obligation bites
only **AFTER the return has been furnished** — a correction found *before* filing is reg 15, *Correction of
errors* — so **the adjustment router branches on return-filed status and must know WHICH return covered the
original supply**. **(2)** the deduction or addition goes in the return for **the period in which the NOTE IS
ISSUED OR RECEIVED** (reg 11(2)) — **the note's period, never a restatement**; the 31 May 2026 guide's
"following taxable period" gloss (F-5) is the common case of this rule, and a CN evaluator that nets within
the original period understates the current return and overstates the next. **(3)** ⚠ **a CN cannot be
raised against an aggregate customer balance** (V-18): reg 11(3)(j) demands the original invoice's number and
date, (b) a dedicated serial sequence, (e) a printed reason. v1 discharged this by CLOSING
`open_item_allocations.operation_kind='apply'` (`0037:790`) for service-tax-bearing items. ⚠ **The gate
found that wall aimed at the wrong mechanism and it is now an OWNER CARD (OQ-12), not settled design** —
`apply_open_items` is a NAMED-PAIR verb (`0037:3225`, refusing any element lacking both a `source_item_id`
and a `target_item_id` at `:3251-3259`, writing one row per named item at `:3384-3389`), i.e. it is the one
estate path that *satisfies* reg 11(3)(j), while the real gap — an AR `credit_note` open item carrying no
originating-invoice reference at all — is untouched. **Until OQ-12 is ruled the wall is NOT built**, and
`b2b`-style silence is not the fallback: a service-tax CN is `not_evaluable` by name. **(4)** debit notes are
**ADDITIVE inside columns (8) and (10)** — no DN line to map; and on the **service** side a CN against an
invoice never paid deducts nothing, so that arm mirrors §3.2 on the negative side while the **sales** side
takes the naive accrual sum. Two arms, chosen by `tax_type` and `accounting_basis`, never by a heuristic.

**The router also owns the LATE UNALLOCATE, which is not a note at all** (GM-6). §3.2's date-bound now keeps
a May `unallocate` out of a Jan–Feb sum; what remains is where that movement *goes*. Two arms: while the
covering return is still `draft`/`materialised` and unfurnished, the period simply recomputes — a
supersession, not an adjustment. Once it is furnished, **nothing recomputes**: the `post_furnishing_restatement`
wall (§7.2) refuses the materialisation and files the condition for a human, because the vehicle is reg 15 or
the amendment window, and F-8 closes that window once payment is made — a professional act, never a line the
engine invents. An unallocate is **not** a credit note, so reg 11(2) is its analogy, not its authority.

### 3.8 Imported taxable services — the reverse charge

Timing is **s.11(1)(b)**: *payment made or invoice received, whichever is earlier*. A **registered** person
declares in SST-02 **Part B1 with a special code**; a **non-registered** person declares on **SST-02A** under
**s.26A** — and ⚠ **s.26A(1) is MONTHLY**, not the two-month taxable period (V-10): a **separate filing
calendar**, which is why §2.2 seeds it as its own deadline rule.

**Four consequences.** **(1)** It is an **OUTPUT-side liability arising from a PURCHASE document**, and the
supplier-bill floor refuses an `sst_output` leg on a purchase — **that wall stays**, live tip **`0036:686-693`**,
three generations past the `0015:842` v1 cited (`0016:3817` → `0036:601`, self-proved at `:1696`; Annex C-14
pins it). ⚠ **v1 left the liability at "a separate entry or a return-only line (the OQ-4 shape)" — a fork
whose return-only arm that same ruling REJECTED, so it resolved to nothing. v2 rules it to the BOOKS:** the
reverse charge posts its **own journal entry**, flagged `sst_reverse_charge`, **Dr the expense account the
imported service was coded to / Cr `sst_output`** — the payable account directly, never
`sst_output_deferred`, since s.11(1)(b) has no receipt condition to defer against. Being a separate entry it
is not a supplier bill, so `0036`'s wall never sees it: not routed around, simply not in scope. The debit is
**the tax expensed into cost**, exactly the purchase-SST wall's own rationale; **no input credit** (law 17),
though *honest grading*: the RMCD guide never says "no ITC" affirmatively, so V-10 records it as an
absence-of-mechanism finding. Because this credits `sst_output` with no allocation behind it, **§3.3's
control must not see it** — and does not: side A reads only the flagged transfer legs. **Annex F.5** carries
the entry shape, the SST-02A arm, and the cell proving the supplier-bill wall still refuses. **(2)** A client with **NO registration still files SST-02A**, so §5 cannot key
a return's existence on `sst_registrations`; and ⚠ **SST-02A prints only a 6% line** despite P.U.(A) 64/2024
(F-7), so the producer emits the *correct* rate and raises **`form_rate_line_missing`** rather than declaring
6% on 8%. **(3)** ⚠ **A self-billed e-invoice is also required and must CARRY the service tax** (F-10: v4.8
§10.4.3-10.4.9, timed to align with s.26A) — two obligations, one event, aligned deadlines, colliding with
`PROGRESS.md:297` where self-billed detection is **UNSCHEDULED** (§10/R11). **(4)** Imported-service treatment
now lives **inside each GROUP's policy chain**, not one guide (V-10, V-15), so source-monitoring walks every
policy and the 2019 guide (still computing at 6%) is not a source.

### 3.9 The statutory basis

**Every statutory claim above is cited in `sst-engine-survey.md` §3** with its URL and fetch date, or marked
UNVERIFIED; **U-1 … U-5 are the named holes**, chief among them P.U.(A) 174/2025, the likely home of B2B
relief for the five new groups, whose text no lane could reach.

## 4 · Dual-registrant separation that survives export

**RMCD has already separated it, and that is the design's spine** (F-1). The form's printed note: *"This
form must be declared separately for Sales Tax and Service Tax"*; the guide: the manual form *"hanya
membenarkan SATU Nombor Pendaftaran SST SAHAJA"*; item 12 is an exclusive **OR**; every other field is
marked sales-only or service-only. **A dual registrant files TWO returns**, and MyInvois corroborates the
two-number world (F-9).

So the model is already right: **one registration row per `tax_type` → one period series → one return.**
Separation at the return layer is structural and free; it is not a feature to build. **What is NOT free is
the LEDGER** (survey §1.5, S1): `uq_coa_special` is unique on `(client_id, special_acc_type)` (`0003:58`),
so a client has **one** `sst_output` account, and `_assert_sales_invoice_shape_at` ties **all** output legs
to **one** stated tax (`0022:927-930`).

| shape | how it separates the GL | cost |
|---|---|---|
| **A — two COA markers** (`sst_output_sales`, `sst_output_service`) | structurally | widens the `special_acc_type` CHECK (**live tip `0017:673-677`, five values**), changes `uq_coa_special`'s meaning, **CoRs `_assert_sales_invoice_shape_at`** (F-A2's live body), moves B4-sales with it. **D1.** |
| **B — a per-entry tax-type tag** | at the fact layer | the OCR/witness path carries no `tax_breakdown` (survey §1.6 / R4), so the tag would often be `unknown` |
| **C — registration-derived**: one `tax_type` registered ⇒ all output tax is of that type; a **GL-ambiguous dual registrant REFUSES** | no ledger change | correct for every client in the estate today, and honest about what it cannot do |

**Chosen: C now, A later, and the refusal is narrow and named.** No client in the estate is SST-registered
at all (survey §5), so paying A's D1 cost into a wave where nothing exercises it buys nothing and risks
F-A2's live body. **`dual_registration_gl_ambiguous` fires only for a client holding BOTH registrations**
and stops the producer in the open rather than mis-declaring. **OQ-3** puts A's timing to the owner.
**"Surviving export"** then means the separation lives in the exported artifact's *data*: every emitted line
carries its `tax_type` and `registration_id`, and each return exports as its own document.

## 5 · Continues in part 2

**`sst-engine-design-part2.md`** carries the rest of this design and is part of it, not an annex:
**§5** the SST-02 producer — what it must not become, the return objects, the per-field mapping, NIL
validity and the payment record *(**moved there at the v2 fold**: part 1 crossed the repo's 500-line
ceiling, so the split boundary went from §1-§5 / §6-§12 to **§1-§4 / §5-§12**. Section NUMBERS are
unchanged — every existing `§5.x` citation still resolves, only the file it resolves in moved)* ·
**§6** Clara's judgement and the one-click question path · **§7** watches, walls and receipts (incl.
§7.3, TA-P11's should-have-charged residual) · **§8** the build sequence as PR rows with ceremony needs ·
**§9** acceptance against BEE / RPR / RS · **§10** risks and named non-goals · **§11** the annex map ·
**§12** the change log.
