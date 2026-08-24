# F-T3 — the draft tax computation: annexes (v2, gate-folded 2026-08-23)

> Annexes to `tax-computation-design.md` (§1-§7) and `tax-computation-design-part2.md` (§8-§13), on
> `tax-computation-survey.md`. The verb set, the surface DDL, tenancy/RLS, the disposal machinery, the
> belt and the behavioural battery are in **`tax-computation-annexes-2-mechanics.md`**.
> **A** mechanics and a worked ladder · **B** decision register D-1..D-26 · **C** predictions to
> discharge at PR-0's rig replay · **D** the question register — **three RULED, three carded for the
> owner's sitting, three lane-open** · **E** the standing maintenance duty the `law_review_due` belt
> watches. Design stage: **no code authored, no rig run**.
>
> **v2, 2026-08-23 — the PR-0 gate fold.** **D-18..D-26** minted for the nine gate corrections that
> changed a mechanism · **D-3 and D-7 RE-CUT** (the fact-key route and the disposal column, both
> against live bodies that refuse them) · **D-17's "note on framing" CORRECTED** — constraint 12 was
> **vacated**, not reworded · **A.1** gains the co-extensive-basis-period wall · **A.2** gains the sign
> rule the ladder always needed · **A.3's R7/R8 and R12 re-worked** against the Act's own sequence ·
> **P-3 and P-5 re-cut** (both predicted falsehoods), **P-6's pin corrected to `0041:3643`**, and
> **P-11..P-15** added. **Annex D is untouched: the fold decided no owner question and closed none.**
>
> **v1.2, 2026-08-23 — conductor's measured corrections.** **D-16** the frozen closure collapses to
> ONE evaluator member (twelve would freeze twelve bodies estate-wide; `deployed:false` buys
> nothing) · **D-17** the name-only-wall scoping obligation and its battery cell · P-10 added.
>
> **v1.1, 2026-08-23 — the ruling trues.** OQ-6 → **R-L25** (developer-seeded law tables, **D-15**) ·
> OQ-4 → **REFUSE** · OQ-5 → **the pack, form version pinned** (D-8 extended, D-14 amended) ·
> OQ-8's **product half granted and designed** (Annex E rewritten around the belt) ·
> OQ-1 / OQ-7 / OQ-8's governance half rewritten as **one-question cards D.1-D.3**.

---

# Annex A · Mechanics

## A.1 The basis period, which is not the fiscal year

The estate models `clara.fiscal_years` (`0056:232-260`) — an accounting period with a CA2016 ≤18-month
bound. The Act taxes a **basis period for a year of assessment** (s.21/s.21A). They coincide in the
ordinary case and diverge in exactly the cases that matter:

| Case | Fiscal year | Basis period |
|---|---|---|
| ordinary 12-month period ending in the calendar year | = | = |
| first period, company incorporated mid-year | one long/short period | s.21A: the period ending in the YA; a >12-month first period is apportioned across two YAs |
| change of accounting date | one period of ≠12 months | s.21A(3)-(7): may be split or combined; the DGIR's direction governs |
| final period on cessation | short | the period to cessation |
| individual / sole prop with a non-31-Dec accounting date | the accounting period | contested in practice — **U8**, unresolved from the Act today |

**Model.** `tax_basis_periods(client_id, ya, period_start, period_end, months, derivation,
derived_from_fiscal_year_id, asserted_by, asserted_at)` where `derivation ∈ {coincides_with_fy,
asserted}`. The ordinary case is derived and needs no human. **Everything else is `asserted` — a
human keys the period and says why.** Clara may propose it; she may not derive an apportionment
across two YAs, because s.21A(3)-(7) turns on a DGIR direction she cannot see. No basis period ⇒
`basis_period_undetermined`, and every downstream rung is `not_evaluable`.

`months` matters twice: it is the CP204 instalment divisor — **for `ya_target = p_ya + 1`, not for the
computed year** (design §7) — and it is the AA period for an asset acquired in a short period. **(D-1.)**

**And the ladder now REFUSES the divergent case rather than modelling it** *(gate blocker; **D-23**)*.
`derived_from_fiscal_year_id` is the load-bearing column: it is how a YA resolves to the fiscal year
whose sealed close R1 reads. A row that names no fiscal year, or whose `(period_start, period_end)` is
not exactly that year's `(starts_on, ends_on)`, yields `basis_period_not_coextensive_with_close` and
every downstream rung is `not_evaluable`. v1.2 built this object precisely because the two diverge and
then never asked: a human could assert an 18-month first period, `basis_period_undetermined` would not
fire, and R1 would pull a whole fiscal year's profit into one YA while the co-YA read nothing.
Apportionment across two YAs is out of v1 (part 2 §13).

## A.2 Arithmetic discipline

Everything is **integer cents**. No floating point enters a durable artifact.

- **The sign rule, which v1.2 never stated** *(gate material; **D-18**)*. `snapshot->'pl_rows'` carries
  `movement_cents = (debit − credit) at ends_on − (debit − credit) at starts_on−1` (`0056:2142-2159`),
  so an **income** account's movement is **negative** and an **expense** account's is positive — the
  close's own net figure has to negate the income side to build `pl_net_cents` (`0056:2145`). The
  evaluator therefore normalises **by `account_type`, never by `direction`**:
  `amount_cents := case a.account_type when 'expense' then mv when 'income' then -mv end`.
  That yields a positive magnitude for a normal expense or income, R2 adds and R3 subtracts, and a
  contra balance (an expense credit, an income debit) carries its own sign through correctly. Read
  literally without this rule, a RM3,000 single-tier dividend stored as −300,000 cents and subtracted
  at R3 would **increase** adjusted income by RM3,000 — a RM6,000 swing on one line, in the direction
  that overstates the charge, and the worked ladder's R3 would move by RM17,200. Normalising by
  `direction` instead is also wrong: `deduct` can sit on an expense account and `exclude` on an income
  account, so one rung would need opposite handling of the raw value.
- A treatment amount is `amount_cents × code.fraction_bp × COALESCE(apportionment_bp, 10000)`
  divided by `10000 × 10000`, rounded **half-up at the cent, once, at the end** of that single
  multiplication chain — never rounded twice.
- A band charge is `band_amount_cents × rate_bp / 10000`, rounded half-up at the cent, **per band**,
  then summed. (Rounding the total instead of each band produces a different figure at the sen; the
  per-band rule matches how the charge is presented on a computation.)
- `metric_cells` already carries `exact_numerator` / `exact_denominator` (`0058:239-263`). The
  **exact rational is stored** and `displayed_text` carries the rounded presentation, so the
  rounding rule is auditable rather than baked into the only surviving figure.
- **Field packs may need whole ringgit.** LHDN forms drop sen on several fields (the Filing
  Programme's TP1 note is explicit that that form is "*tanpa nilai sen*"). The truncation rule is
  therefore **per field**, declared in the field-pack definition, never a global rounding of the
  computation. Which Form C fields are whole-ringgit needs the Form C guide notes, which were not
  fetched (Annex D, **OQ-3**). **(D-14.)**
- **A non-`ok` cell needs a reason ROW, not only a status** *(gate material)*. `0058:261-262` is a
  hard CHECK: `cell_status <> 'ok'` requires a non-null `na_reason_version_id` **and** null
  numerator/denominator/scale/text. PR-1 therefore seeds one `metric_na_reason_versions` row per
  refusal string (part 2 §9), and `t_scope_cell_na_reason` enforces firm-scope congruence on the
  binding. A string with no seeded row can be raised but never persisted — which is why cell C21
  exists.

## A.3 A worked ladder — an illustrative company, YA2025

Figures are illustrative, chosen to exercise every rung. They are **not** any client's numbers, and
nothing here is a claim about any real book.

**Facts.** Sdn Bhd, resident and incorporated in Malaysia, FY 1 Jan – 31 Dec 2025 = the basis period
for YA2025 (12 months). Paid-up ordinary RM 1,000; no related company; foreign/non-citizen holding
0%; gross business income RM 2.1m. SME predicate ⇒ **eligible** (all five conditions pass, §6).

**R1 — accounting profit before tax**, from the sealed close receipt: **412,650.00**

**R2 — add-backs**

| Account | Code | fraction | Balance | Add-back | Authority |
|---|---|---|---|---|---|
| Depreciation | `ADDBACK_DEPRECIATION_100` | 100% | 38,400.00 | 38,400.00 | s.33(1); s.39(1)(c),(e) |
| Entertainment | `ADDBACK_ENTERTAINMENT_50` | 50% | 12,300.00 | 6,150.00 | s.39(1)(l) |
| Donation — unapproved body | `ADDBACK_DONATION_100` | 100% | 2,000.00 | 2,000.00 | s.33(1); s.44(6) |
| Fines and penalties | `ADDBACK_FINE_100` | 100% | 850.00 | 850.00 | s.39(1)(b) |
| | | | | **47,400.00** | |

**R3 — deduct / not taxable**

| Account | Code | Amount | Authority |
|---|---|---|---|
| Gain on disposal of motor vehicle | `EXCLUDE_CAPITAL_GAIN_100` | 5,600.00 | capital; replaced by the balancing adjustment |
| Single-tier dividend income | `EXCLUDE_EXEMPT_DIVIDEND_100` | 3,000.00 | exempt |
| | | **8,600.00** | |

**R4 — adjusted income** = 412,650.00 + 47,400.00 − 8,600.00 = **451,450.00**

**R5 — capital allowances**, from `ca_asset_years`

| Asset | Class | Cost | QE | IA | AA | Balancing | This YA |
|---|---|---|---|---|---|---|---|
| A1 office furniture (in use since 2023) | others 20/10 | 18,000.00 | 18,000.00 | — | 1,800.00 | — | 1,800.00 |
| A2 motor car, **new**, acquired 1 Mar 2025 | motor vehicle 20/20 | 138,000.00 | **100,000.00** | 20,000.00 | 20,000.00 | — | 40,000.00 |
| A3 printer | others, **SVA** | 1,800.00 | 1,800.00 | — | — | — | 1,800.00 |
| A4 commercial van, disposed | heavy/MV 20/20 | 60,000.00 | 60,000.00 | — | **none in year of disposal** | **(3,000.00)** charge | (3,000.00) |
| | | | | | | **net** | **40,600.00** |

A2's QE is capped at RM100,000 because the vehicle is new **and** cost ≤ RM150,000 (PR 6/2015 §(b));
had it been used, or cost RM160,000, QE would be RM50,000. A3 takes the small-value-asset allowance
in full and, the company being MSMC-eligible, the RM20,000 annual cap does not apply (Sch 3 para
19A(3)). A4's residual expenditure at disposal was 12,000.00 and the disposal value 15,000.00, so a
**balancing charge** of 3,000.00 arises, capped at the allowances actually made.

**R6 — statutory income** = 451,450.00 − 40,600.00 = **410,850.00**

**R7 — aggregate income (s.43)** = **410,850.00**. One business source; no non-business source. The
brought-forward business loss is deducted **here**, under **s.43(2)**, against the aggregate of
statutory income from business sources only and floored at that aggregate — the excess would carry
forward rather than reach any other source. This client has a `tax_carryforwards` row for
`adjusted_business_loss`, YA2025, **`amount_cents = 0` with a basis**: a human asserting *there is
none*, which is a different state from *nobody entered it* (which would be
`losses_brought_forward_unknown` and would stop the ladder here).

**R8 — total income (s.44)** = R7 less the current-year adjusted loss (**s.44(2)** — nil here) and
approved donations (**s.44(6)**). The approved-institution donation is 5,000.00 and the cap is 10% ×
**aggregate income** = 10% × 410,850.00 = 41,085.00, so it is fully deductible ⇒ **405,850.00**.

> **What v1.2 had here, and why it moved.** v1.2 deducted the *current-year* loss at R7 and the
> *brought-forward* loss at R8 — each in the other's rung — and then struck the s.44(6) cap on an R7
> already reduced by the current-year loss. On this ladder the figures coincide because both losses are
> nil, which is exactly why the worked example never exposed it. They diverge whenever a company has
> both a loss and a donation (the cap is struck below the statutory allowance, overstating the charge)
> or a brought-forward loss larger than its business statutory income while holding rental or interest
> income (the excess shelters income the Act does not let it reach, understating the charge). v1.2 also
> printed **s.44(5F)** as the authority for the brought-forward deduction; s.44(5F) is the ten-YA
> **time limit** on the carried amount, and the deduction's authority is **s.43(2)**. **(D-19.)**

**R9 — chargeable income** = **405,850.00**

**R10 — tax charge**, regime `company_msmc` for YA2025

| Band | Amount | Rate | Charge |
|---|---|---|---|
| first 150,000.00 | 150,000.00 | 15% | 22,500.00 |
| 150,001 – 600,000 | 255,850.00 | 17% | 43,494.50 |
| exceeding 600,000 | — | 24% | — |
| | | | **65,994.50** |

Had the SME predicate returned `not_eligible` (say, 25% foreign holding at the beginning of the
basis period), the whole 405,850.00 would be charged at 24% = 97,404.00 — a **RM31,409.50**
difference on one shareholding fact. Had it returned `not_evaluable`, **no charge is produced at
all** and the computation names the missing fact (§6, D-6).

**R11 — CP204 for YA2026** — that is `ya_target = p_ya + 1`, and the design now says so in §7 rather
than leaving the body on `ya-1` while this worked example silently used the next year. Natural estimate
65,994.50; the **85% floor is 0.85 × the latest `cp204_filings` row for `ya_target − 1` = YA2025**, the
computed year. If that was 60,000.00, the floor is 51,000.00 and the estimate clears it. The divisor is
the months in **YA2026's** basis period, read from `tax_basis_periods` for `(client, 2026)` — twelve
here, but **never assumed**: no row for YA2026 ⇒ `basis_period_undetermined` naming YA2026, never a
silent fallback to YA2025's `months`. Twelve months ⇒ `floor(6,599,450 / 12) = 549,954` cents;
12 × 549,954 = 6,599,448, remainder **2 cents onto instalment 1**. Instalment 1 = **5,499.56**,
instalments 2-12 = **5,499.54**, due the **15th** of each calendar month from the **2nd month** of the
basis period. If no YA2025 filing is on record the estimate still computes and the floor prints
`prior_estimate_unknown`. R11's cells are stamped on YA2026's `reporting_periods` row; R1-R10's on
YA2025's.

**R12 — s.107C(10) exposure for YA2025**, narrative, measured against **the estimate that was on record
for YA2025** — 60,000.00 above — never against R11's proposal for YA2026. If the assessment lands at
95,000.00: excess = 95,000.00 − 60,000.00 = 35,000.00; 30% of 95,000.00 = 28,500.00; the excess exceeds
it, so the penalty base is 35,000.00 − 28,500.00 = 6,500.00 and the increase is 10% = **650.00**.
Printed as exposure. Never posted.

> **v1.2 printed 50.55 here**, having compared the YA2025 assessment against R11's YA2026 output of
> 65,994.50 while the same ladder put YA2025's estimate on record at 60,000.00 — the same year-confusion
> as R11's, producing a statutory number roughly 13× smaller. Corrected above, and cell **C14b** is the
> differential that keeps both bindings honest.

## A.4 The same books, if the entity were a sole proprietorship

R1-R6 run identically. **R7 onward do not run.** `entity_transparent_no_entity_charge` fires, R9-R12
are refusals, and the worksheet hands adjusted income and statutory income to the proprietor's Form
B. No CP204 (the individual pays via CP500, which is out of v1 — survey U6). The assertion the
battery makes is that the charge cell is a **refusal**, not `0` (§10 C11).

## A.5 What Clara narrates, and what she may not

**She may:** name the account, state which treatment she proposes and why, quote the statutory words
from the `tax_authorities` row, point at the specific entries that make her think so, say she is
unsure, and ask.

**She may not:** state an amount that is not a `metric_cell`; state a percentage that is not a
`fraction_bp` from a signed code or a human-keyed `apportionment_bp`; cite an authority not in the
catalog; or characterise the computation as anything other than a draft for review. The seal refuses
a dataset point whose add-back treatment resolves to zero citations (§10 C14) — citation is a
tool-boundary mechanism here exactly as TA-P4 made it for the fetch tool.

---

# Annex B · Decision register

| # | Decision | Alternative rejected, and why |
|---|---|---|
| **D-1** | **The basis period is its own modelled object** (`tax_basis_periods`), derived where it coincides with the fiscal year and **asserted by a human otherwise**. | *Reuse `fiscal_years` directly.* They diverge on incorporation, a change of accounting date, cessation, and a non-12-month period — precisely the cases where a wrong period is a wrong return. |
| **D-2** | **The CoA→treatment map is a new per-client layer**, Clara-proposed and human-approved (TA-P8's promotion shape). | *Infer the treatment from the account name.* Review law 3: spelling is not identity. "Entertainment" in a CoA might be a client-billed disbursement; "Sundry" might be all fines. |
| **D-3** *(RE-CUT at the gate fold, 2026-08-23)* | **Entity identity does NOT go through `record_client_fact`, and F-T3 mints no `client_fact_keys`.** The client's own TIN and SSM number are **read** from the existing `clara.client_identifiers` (`0007:222-236`, door `add_client_identifier` `0007:1508`); the five dated facts land in F-T3's own valid-time table `client_tax_attributes` (design §4.1). | *Add columns to `clients`* — still rejected, for v1's reason. *Ride `record_client_fact`* (the v1.2 choice) — rejected on three measured walls: the store has **no valid-time dimension** and `uq_client_fact_live` (`0055:422`) admits one live row per key; the validation dispatch (`0055:588-607`) implements `enum:%` and a hard-coded `msic` regex and raises `fact_value_invalid` on everything else, with `jsonb_typeof='string'` (`:582`) forbidding a `{value, as_at}` object; and the door opens on `_human_ctx`, raising **CLR04 inside a migration** (`0004:302-305`), while writing `client_facts` and never `client_fact_keys`. *Mint `tin`/`ssm_registration` anywhere at all* — rejected as law 81's two mutually-unaware paths: `filing-and-interview-design.md:163` already treats `client_identifiers` as attribution-authoritative for exactly those values. |
| **D-4** | **Law that could not be read at an official source today does not land as a Tier-1 row.** The ICT 40/20 rate is left out and refuses by name. | *Seed it from professional-firm secondaries.* TA-P2 requires two independent **official** sources. A rate is a number in a client's books. |
| **D-5** | **`tax_authorities` is the citation store; F-A5's `basis_citations` carries pointers to it.** | *Ride F-A8's `web_fetch_citations`.* That is a per-fetch artefact; a statutory reference is standing law and must not be re-fetched (and re-risked) on every computation. It also inverts the failure mode: a fetch outage would stop a computation. |
| **D-6** | **An unproven SME premise REFUSES.** No fallback to 24%. | *The frozen build's honesty layer — draft at 24% with a banner.* A rate on an unproven premise is a fabricated number (hard constraint 2), and a banner is prompt-level mitigation for a structural problem. Owner-facing: **OQ-4**. |
| **D-7** *(RE-CUT at the gate fold, 2026-08-23)* | **Add `disposal_value_cents` + `disposal_value_basis` to `clara.fixed_assets`, HUMAN-keyed as the Schedule 3 disposal value, written by `clara._fa_on_approve`** (mechanics §M3). | *Re-derive from the posted entry* — still rejected (law 31). *Take `p_proceeds_cents` as the disposal value* (the v1.2 choice) — rejected: Sch 3 para 62(1) makes it the **greater of market value and net proceeds**, deemed on a controlled sale (PR 7/2017), so a below-market director sale understates the balancing charge, and `disposal_proceeds_unavailable` names an absence and cannot catch a present-but-wrong substitution. *Add `disposed_on`* — rejected: `fixed_assets.disposed_at` exists (`0003:169`) and is read by the depreciation walk (`0041:1384`); two dates can disagree about which YA the adjustment falls in. *Set the pair "in `dispose_fixed_asset`"* — not implementable: that verb is proposal-shaped and writes no register row (`grep` finds no `update clara.fixed_assets` between `0041:3643` and `:4009`). |
| **D-8** | **Statutory output is a field-addressed pack, not a form replica.** | *Render the LHDN form.* The renderer carries a chart/line AST only, statutory templates are human-published and the wording is owner-signed (survey §3.3). Building a form renderer is its own wave. Owner-facing: **OQ-5**. |
| **D-9** | **A transparent entity refuses an entity charge**; it does not compute zero. | *Compute zero.* Zero is a number, and a Form C with a zero charge for a sole proprietorship is a wrong document, not a harmless one. Re-earns the frozen build's guard. |
| **D-10** | **v1 treats at account level**; a mixed account yields `mixed_account_needs_split` and a coding proposal. | *Entry-level treatment from the start.* It moves the judgement from ~40 accounts to ~4,000 entries and makes the human review unreviewable. The per-entry override lands in PR-6 for the exceptional line. |
| **D-11** | **The severance: Clara writes a `code`, the DB owns every numeral.** The proposal table has no numeric column. | *Let the model emit the amount and validate it.* Validation is a check on an output; the absence of a column is a property of the schema. Hard constraint 2 says the enforcement is structural, not prompt-level. |
| **D-12** | **Instalment rounding: `floor(estimate/n)` with the whole remainder on the FIRST instalment.** | *Remainder on the last.* Both sum exactly; the first-instalment convention means a mid-year revision never has to reconcile a stray sen in a month that has not happened yet. |
| **D-13** | **A treatment code's citation is bound ONCE, by the owner's signature — never re-picked per run.** | *Cite per computation from the model's reasoning.* This is the exact error class the survey found in the prior research (§6.4a — depreciation cited to s.39(1)(b)). Bind once, and it is wrong at most once, visibly, before it ships. |
| **D-14** | **Integer cents throughout; the exact rational is stored in `metric_cells`; per-field whole-ringgit truncation is declared in the field-pack definition** — and, per the OQ-5 ruling, it is a property of the **pinned form version**, not a global convention. | *Round the computation to whole ringgit because the form does.* Then the computation statement and the pack disagree, and the reviewer cannot tie them. |
| **D-16** *(conductor, measured, 2026-08-23)* | **The frozen closure is ONE member**, `evaluate_tax_computation_v1`, self-contained and calling only built-ins. | *Twelve members, one per rung* (v1.1). **`verify_evaluator_freeze()` iterates `evaluator_versions` with no `where deployed` and hashes the FULL `pg_get_functiondef`** — so registration freezes immediately (**`deployed:false` buys nothing**, which v1.1's "appended undeployed" wording obscured), and a later ACL/owner/`search_path` change to any member raises **at that later lane's apply, pointing at F-T3**. Twelve members = twelve bodies frozen estate-wide. Also rejected: *three members* (ladder/CA/CP204) — the SME predicate is needed by all three, so it becomes a shared fourth frozen body or gets inlined three times (two mutually-unaware paths, law 81). |
| **D-17** *(conductor, 2026-08-23; framing note CORRECTED at the gate fold)* | **F-T3's own key catalog describes the CLIENT, and says so in its own description text.** After D-3's re-cut that catalog is **`client_tax_attributes`' `attribute_key` set**, not `client_fact_keys` — the obligation moved with the table and is otherwise unchanged: each key's description scopes it explicitly ("the CLIENT's own paid-up ordinary capital; nothing to do with a counterparty's"), citing the generic name-only wall (`0062`/`0063`). **The ladder reads no counterparty `tin` or `registration_no` anywhere** (battery C17); if it ever needs one — related-party disclosure, withholding — **stop and escalate**, because lifting that wall is an OWNER-only act through `0063`'s audited door. | *Registering keys with a bare description.* `0055`'s culture is that the description carries the law (see `customer_identity_policy`'s), and this catalog is one table away from the wall that keeps a name-only client's counterparties unenriched. A later reader or agent must not mistake it for a place to record a customer's identifier. **Note on framing — CORRECTED 2026-08-23 by the PR-0 gate; the v1.2 wording was overtaken by a same-day recut 40 minutes after it was written.** Hard constraint 12 was **VACATED, not reworded**: `AGENTS.md` now carries only *"Number 12 is vacant … the name-only wall is a PRODUCT INVARIANT, `docs/product/PRD.md` §6 invariant 2(b), **not an agent constraint**"*, the substance moved to **PRD §6 invariant 2(b)**, and the digest records it as law 82 / ADR-0075 §5 — *"hard constraint 12 RETIRED as a named constraint"*. So **cite PRD §6 invariant 2(b)** (and `0062`/`0063`, untouched). v1.2's explicit go-ahead — "citing 'constraint 12' is correct as the harness now words it" — is **withdrawn**: it would point a later reader at a number the harness itself calls vacant. |
| **D-18** *(gate fold, 2026-08-23)* | **R1-R3 and the untreated-account census read `close_receipts.snapshot->'pl_rows'`; `closing_position` is used only for a balance-sheet-typed treatment, and a treatment naming a non-P&L account refuses.** A.2 states the `account_type` sign normalisation the rung needs. | *Read `closing_position`* (the v1.2 choice) — it is built at `0056:2285-2292` with an explicit `where a.account_type in ('asset','liability','equity')` filter, and read **after** the P&L→RE closing entry has zeroed every income and expense account, so the `<> 0` filter would exclude them even without the type filter. The table comment (`0056:1503`) and the write belt's own refusal text (`:1554`) both say "per balance-sheet account". Every line the worked ladder's R2/R3 needs — depreciation, entertainment, donation, fines, the disposal gain, the dividend — is by construction absent from it. Built as written the ladder returns nil add-backs (understated tax on a signed document) or refuses for every client, and `account_untreated` never fires on an expense account at all. The data was always there, under a key the v1.2 set never once cites. |
| **D-19** *(gate fold, 2026-08-23)* | **R7 is aggregate income with the s.43(2) brought-forward business-loss deduction floored at the business aggregate; R8 is total income less the s.44(2) current-year loss and the s.44(6) donation capped at 10% of R7. `tax_carryforwards` is the DB-owned input, absence refuses, and the set-off arithmetic is gated on U5.** | *v1.2's order* — the two deductions in each other's rung, with the cap struck on an R7 already reduced by the current-year loss and the b/f deduction cited to s.44(5F). Three wrong things at once: a b/f business loss sheltering non-business income (understated charge), a donation cap below the statutory allowance (overstated charge), and the ten-YA time limit printed as a deduction's authority. *Deducting zero when no carry-forward figure exists* — no table, column or fact key in the estate holds one, so a conforming implementer had to; `cp204_filings` one row away already rules that a prior-year fact Clara cannot know is a **named refusal, never a zero**. *Computing the set-off anyway* — the survey ruled it "stays out of the evaluator until read" (`survey:438-441`); U5 is unfetched and Sch 3 para 75/75A's continuity conditions unverified. |
| **D-20** *(gate fold, 2026-08-23)* | **v1 models exactly ONE business source and refuses the rest by name** (`business_source_count_unknown`, `multiple_business_sources_unmodelled`). | *Assert "per business source" over inputs that cannot express one* (v1.2). `coa_accounts` carries no source dimension through its whole lineage, `pl_rows` carries `account_code`/`account_type`/`movement_cents`, and `fixed_assets` has none — so capital allowances cannot be attributed and the R6 nil floor is applied once instead of per source. The design meets this class of hole three other times (D-1, D-6, D-9) and closes it every time; this was the one that got neither model nor refusal. |
| **D-21** *(gate fold, 2026-08-23)* | **`client_tax_attributes` is a valid-time store: the as-at read is the live row with the greatest `effective_on <= the date`, and no such row refuses by name.** | *Read the current value* — the SME test needs paid-up capital and foreign holding **at the beginning of the basis period**, and a YA2024 computation re-run in 2026 would read 2026's figures and flip `eligible ↔ not_eligible` with no change in the books; A.3 prices that flip at RM31,409.50. It also destroys the reproducibility `resolved_inputs_sha256` exists to certify. *A second answer to `client_facts`' question* — no: that store answers "what is it now" by deliberate design, and `0057:2129` says in terms that when a pack ever PRESENTS one of those facts, "this decision is the thing to revisit". F-T3 is that pack. |
| **D-22** *(gate fold, 2026-08-23)* | **The client's own TIN and SSM number are READ from `clara.client_identifiers`; F-T3 mints no store for them, and a missing row is `entity_identifier_missing`.** | *Mint `tin`/`ssm_registration` as new keys* (v1.2, on a survey census whose scope was `clients` + `client_fact_keys` and never looked at `client_identifiers`). The table exists, is live across a dozen migrations, has an audited door at bookkeeper+, and a sibling Wave-F design already refuses document attribution on it. Two unlinked stores for one number, on the one artifact a human transcribes into MyTax, is law 81 exactly. (`sst-engine-annexes.md` D-13 kept the SST number **off** that table because it "belongs to an episode, not the client" — a permanent TIN is the opposite case, so the same reasoning lands the other way.) |
| **D-23** *(gate fold, 2026-08-23)* | **R1 requires the basis period to be co-extensive with the fiscal year its `derived_from_fiscal_year_id` names; otherwise `basis_period_not_coextensive_with_close` and every rung is `not_evaluable`. Apportionment across two YAs is out of v1.** | *Read "for the fiscal year" and leave the divergence unhandled* (v1.2). `close_receipts` is one active row per `fiscal_year_id` sealing that whole year's movement, and `basis_period_undetermined` fires only on **absence** — so a human asserting an 18-month first period passes every wall and R1 pulls a whole fiscal year's profit into one YA. D-1 built the object because these cases are "precisely where a wrong period is a wrong return", and then the ladder never asked. |
| **D-24** *(gate fold, 2026-08-23)* | **The human-keyed guarantee is the CHECK *plus* an ARM-0 trigger refusing `is_agent` in either approval column *plus* a human door whose eligible-approver census filters `and not u.is_agent`.** | *The NOT-NULL-shaped CHECK alone* (v1.2). The agent is a real `clara.users` row with a stable uuid (`0002:195`, `:334-335`), so a machine-authored self-approval satisfies it exactly as a human's does, and the designated proof cell only ever removed the value — law 68's NULL-poisoned door drawn as a wall. The estate's own idiom for a genuine human-only door is explicit: `create_firm` raises on `is_agent` (`0004:328`) and `approve_metric_definition` filters it out of the eligible count (`0059:85`). |
| **D-25** *(gate fold, 2026-08-23)* | **F-T3's three agent writes are wake wrappers on the `0078:90-107` shape, `autodraft` for the two client-scoped writes and `proactive` for the belt — no new wake kind, and the analysis is STATED.** | *Leaving the entrance unspecified* (v1.2). The two available outcomes are both failures: an EXECUTE grant straight to the agent role is a second ungoverned entrance with no credential, allowlist row or receipt (laws 78/81), and a human-shaped verb the agent can never call is `0078:124-127`'s recorded CLR04 defect. §11 commits PR-4 to a cross-model adversarial pass *because* it is "the model's only entrance into a statutory document" — a pass that cannot be discharged against an unnamed entrance. |
| **D-26** *(gate fold, 2026-08-23)* | **PR-3 replaces THREE live bodies** — `dispose_fixed_asset`, `_fa_on_approve` and `_tf_fixed_assets_immutable_0017` — **and adds `uq_fa_id_tenant`; the frozen evaluator is the LAST DDL-dependent PR and carries a closed relation census.** | *"One live writer"* (v1.2) — it pinned the prestate SHA to a proposal-shaped verb that writes no register row, and left the post-approval allowlist (a closed six-column set at `0041:867-879`) untouched, so the **first** disposal in the estate raises CLR13; `0041:864-866` records the repo making that exact mistake once already. *Creating `cp204_filings` after the member* (v1.2's PR-5→PR-6 order) — `create function` does not validate referenced relations, so the migration applies and the **first call** raises `relation … does not exist`, aborting the whole rowset against §9's own "a rung never raises out of the ladder"; D-16's freeze-on-registration forecloses patching it later. |
| **D-15** *(from R-L25, 2026-08-23)* | **The law tables are DEVELOPER-SEEDED, not governed-door tables.** `tax_rate_bands`, `capital_allowance_rates`, `tax_thresholds` and `tax_authorities` land as versioned, effective-dated migration rows through the full PR ladder, each cited with its fetch date, immutable + supersede, `valid_through` on every row, a missing row refusing by name. A rate change is a ticket and a PR. | *TA-P2's owner one-click door* (the v1 design's choice). Two governed-row mechanisms for one job is two architectures (law 81); the D17/R-L19 precedent already settled the identical question for price rows, and the same reasoning applies — a rate is platform data, not client data, and no human session holds a role that makes a one-click approval meaningfully different from a PR. The F-A8 fetch can attach later without changing how a row lands. |

---

# Annex C · Predictions to discharge at PR-0's rig replay

Each is a source-read claim that a replay can falsify. None may be relied on in a build PR until
discharged.

| # | Prediction | How PR-0 discharges it |
|---|---|---|
| **P-1** | `metric_cells.cell_status` domain is exactly `('ok','undefined','absent','refused')` and `not_evaluable` maps onto `undefined`/`absent` as §9 says. | `pg_get_constraintdef` on the live CHECK |
| **P-2** | `clara.verify_evaluator_freeze()` fails a migration that appends an `evaluator_version_member` without the accompanying function. | force the failure on the rig; assert the migration run aborts |
| **P-3** *(RE-CUT — v1.2's version predicted a FALSEHOOD, and its discharge would have ticked PASS)* | `snapshot->'closing_position'` carries **only** asset/liability/equity accounts, and `snapshot->'pl_rows'` carries a jsonb ARRAY of `{account_code, account_type, movement_cents}` for income/expense accounts with non-zero movement. | **A DIFFERENTIAL enumeration, not a completeness check.** Seed a close with at least one non-zero expense account and one non-zero balance-sheet account; assert the expense code is **present in `pl_rows` and ABSENT from `closing_position`**, and the balance-sheet code the reverse. *Why the shape matters:* v1.2 predicted `closing_position` was inclusive and discharged it by enumerating the pin against `trial_balance_as_of` — but after the closing entry every P&L account is zero in the trial balance too, so the two tie cleanly and a discharger confirms "the pin enumerates completely" while R2/R3 still have no input. A completeness check cannot falsify this; only a differential can. |
| **P-4** | `uq_cr_one_active_close` makes "the sealed close for a fiscal year" a single unambiguous row. | `pg_get_constraintdef`; then attempt a second active row |
| ~~**P-5**~~ *(WITHDRAWN — it predicted a capability the live signature forecloses)* | v1.2 predicted "`record_client_fact` accepts a newly registered key **with an as-at date**". The door's sole definer `0055:499-501` has a fixed 7-argument signature with **no** as-at parameter, `:582` refuses any `fact_value` that is not a JSON string, and `uq_client_fact_live` `:422` admits one live row per key. The prediction is false as written, not merely undischarged — which is what D-3's re-cut acts on. | Nothing to discharge. **PR-0 records the withdrawal and instead re-reads the signature, the CHECK and the dispatch's ELSE arm** (`:588-607`) so the re-cut rests on a catalog read, not on this annex. |
| **P-6** *(pin corrected)* | `dispose_fixed_asset`'s live body is what **`0041:3643`** shows — the `create function` line; `:3644` is the parameter continuation. Bodies are spliced across generations, so the file text is not the live body regardless. | `pg_get_functiondef`; record the `prosrc` sha256 as **one of PR-3's three** prestate pins (D-26) |
| **P-7** | `publish_report_template_version` refuses `report_class='statutory'` from the agent principal and accepts it from the human admin verb. | exercise both arms — a refusal that cannot say NO has a meaningless YES |
| **P-8** | `fixed_assets.ca_class` has no CHECK domain restricting it to the classes the CA rate table will key on. | `pg_get_constraintdef`; if it does, PR-1's rate-table keys must match it exactly |
| **P-9** | `evaluator_versions.deployed` cannot be flipped by a plain UPDATE — `_tf_evaluator_deploy_once` (`0060:93-100`) is the only door. | attempt the plain UPDATE on the rig |
| **P-10** | D-16's two load-bearing properties hold as reported: `verify_evaluator_freeze()` covers **undeployed** rows, and its hash moves when only a member's **ACL / owner / `search_path`** changes (body untouched). | Reported measured by the conductor (L19-verified) — **F-T3 still re-measures both** on its own rig, because a design that collapsed twelve members to one on the strength of these two facts may not hold them on hearsay. Register an undeployed row → confirm it freezes; then `alter function … owner to` / `set search_path` → confirm the checker raises. |
| **P-11** *(gate fold)* | `clara._tf_fixed_assets_immutable_0017()`'s live `v_mutable` is exactly the six lifecycle columns, and an UPDATE writing `disposal_value_cents` on an approved row raises CLR13 `fa_baseline_immutable`. | `pg_get_functiondef` for the live array; then force the UPDATE on a rig-seeded approved asset and read the SQLSTATE. **A guard that has never refused anything is a guard that was never asked** — so the pre-splice refusal is measured, not assumed, before PR-3 widens it. |
| **P-12** *(gate fold)* | `clara._fa_on_approve` — **not** `dispose_fixed_asset` — is the body that writes `clara.fixed_assets` on a disposal, on both the full and the partial-supersede paths. | on a rig, run a full disposal and a partial one end to end; establish which function's statement wrote the row versions by trace or a temporary audit hook, rather than by reading either file's text |
| **P-13** *(gate fold)* | `metric_cells` refuses a non-`ok` cell with a NULL `na_reason_version_id` (`0058:261-262`), and `t_scope_cell_na_reason` refuses a cross-firm reason binding. | attempt both inserts on the rig; **both arms** — a refusal that cannot say NO has a meaningless YES |
| **P-14** *(gate fold)* | `clara.coa_accounts` carries `uq_coa_account_id_tenant unique(account_id, firm_id, client_id)` (`0058:56`) and `clara.fixed_assets` carries **no** `(id, firm_id, client_id)` unique, so `ca_asset_years`' tenant FK needs `uq_fa_id_tenant` added first. | `pg_get_constraintdef` on both relations before PR-3 authors the constraint |
| **P-15** *(gate fold)* | `clara.wake_credentials`' two CHECK families are live as `0011:618-628` shows — the kind domain, and the `autodraft ⇔ client_id not null` pairing — so F-T3's three wrappers need no CHECK extension. | `pg_get_constraintdef`; then mint an `autodraft` credential with a null `client_id` and confirm it refuses |

---

# Annex D · Questions — three ruled, three carded for the sitting, three lane-open

Nine were raised. Their status as at **2026-08-23**:

| # | Question | Status |
|---|---|---|
| OQ-1 | the missing acceptance oracle | **CARD — owner's sitting** (D.1) |
| OQ-2 | no fixed-asset population to test CA against | lane-open |
| OQ-3 | partial official-source access | lane-open |
| OQ-4 | refuse vs default to 24% | **RULED — REFUSE** |
| OQ-5 | field pack vs form replica | **RULED — the PACK, form version pinned** |
| OQ-6 | the Tier-1 closure collision | **RULED — R-L25, seeded fact tables** |
| OQ-7 | whose signature signs a treatment code | **CARD — owner's sitting** (D.2) |
| OQ-8 | who owns the annual duty to true the law | **CARD — owner's sitting** (D.3); **the product half is GRANTED and designed** (design §4.6) |
| OQ-9 | does the confirmed figure post a provision in Wave F | lane-open |

**The three rulings, recorded** (orchestrator, standing delegation, 2026-08-23):

- **OQ-4 → REFUSE.** An unknown SME status is a question to the human, never a rate. The design's
  recommendation stands unchanged; `sme_facts_missing` names the missing fact and Clara chases it.
- **OQ-5 → the field-addressed PACK**, never a form replica — **and the pack pins the form
  version**, mapping to LHDN's own field ids for that edition. New refusal
  `form_version_superseded`; the whole-ringgit rule becomes a property of the pinned version. Design
  §8 carries the fold.
- **OQ-6 → R-L25.** The Wave-F Tier-1 closure re-opens for the income-tax rate bands and the
  capital-allowance rate schedule, as **developer-seeded** versioned effective-dated fact tables on
  the D17/R-L19 pattern — not a second governed-row architecture. `wave-f-contract.md`'s
  `[TB-2026-08-23]` block is the contract note; **D-15** is the decision.

The three cards below are written for the owner's sitting: **one question, the options, what each
costs, and the lane's recommendation.** Nothing in them is a build choice the lane may make alone.
The three lane-open questions keep their original longer form after the cards.

## D.1 · CARD — OQ-1 · What is F-T3's acceptance bar, given there is no oracle?

**The question.** F-T3 computes tax. Nothing in the estate can tell it whether the total is right.

**Why it is being asked.** Your three folders hold no Form C, no tax computation, no CP204 and no
fixed-asset register (survey §5); the desktop `2025 Tax` folder is empty. ADR-0075 says no oracle
exists beyond the folders **or is required** — so "reproduce last year's return" is neither available
nor owed. That leaves a real hole: the fourteen battery cells each prove one wall bites, and **every
one of them can pass while the bottom line is still wrong** (a sign flip between add-backs and
deductions, a rung wired to the wrong input). A wall test cannot catch a ladder error.

| Option | What it costs you | What it buys |
|---|---|---|
| **(a)** you or the firm's tax agent hand-work **one YA for one company**, and that becomes the golden bar | a few hours, once | the only thing that catches a whole-ladder error; a permanent regression bar |
| **(b)** acceptance = the battery + a review of the worked ladder in Annex A.3; golden bar deferred to Wave G | nothing now | ships sooner; the ladder error stays possible until Wave G |
| **(c)** accept on synthetic ROME PUBLIC ADVISORY data only | nothing now | proves the arithmetic against numbers we invented — circular |

**Recommendation: (a) for one company, (b) for the rest.** Pick the company with real fixed assets
if there is one, so the hand-worked bar exercises capital allowances too.

## D.2 · CARD — OQ-7 · Whose signature signs a treatment code?

**The question.** When Clara says "this is entertainment, add back 50%, s.39(1)(l)" — whose
professional name is on the *rule* she applied?

**Why it is being asked.** The whole design rests on Clara choosing a **code** while the DB owns the
fraction and the citation (D-11, D-13). That only holds if the code itself was signed by someone
answerable. `tax_treatment_codes.owner_signed_by` is that act, and an unsigned code is unusable — so
whoever signs is, in substance, certifying "this fraction and this statutory reference belong
together." It happens once per code, not once per computation.

| Option | What it costs | What it risks |
|---|---|---|
| **(a)** the owner personally | your time, ~30-40 codes once | your name on a technical tax citation you may not have drafted |
| **(b)** a **named licensed tax agent** (who may be you) with the licence reference recorded on the signature row | the same time, plus recording the licence | nothing obvious — it matches how the statutory boundary is actually held |
| **(c)** either, whoever is available | least friction | the signature stops meaning anything specific, which is the one thing it must not do |

**Recommendation: (b).** The professional-signature framing is what holds the statutory boundary in
this product; record the licence reference so the row says *which* professional and under what
authority. It also answers D.3's "tax lead" by the same name.

## D.3 · CARD — OQ-8 · Who owns the annual duty to true the law?

**The question.** Every January, someone must extend or supersede the rate rows. Who is that, by name?

**Why it is being asked.** Act 53 as read is stamped *as at 21 May 2024*; Budget 2026 and its tax
bills are already in circulation. Every band, threshold and Schedule-3 rate carries an
effective-YA window, and **a missing row refuses by name** — correct behaviour, and it means the
computation stops for a client whose YA has rolled past the last seeded row. **This is the most
likely way F-T3 quietly breaks.**

**Half of this is already solved and needs no ruling.** The *product* half was granted 2026-08-23 and
is designed: every seeded row carries `valid_through`, and a `law_review_due` belt raises **one typed
question to the firm's tax lead** before expiry, naming the row, its authority, its last-fetched date
and what refuses if it is not trued (design §4.6). It triggers on data, is idempotent per row, and
**closes only when a superseding row is seeded** — it cannot be dismissed.

**What is left is the governance half: who receives that question, and is answering it a duty.**

| Option | What it costs | What it risks |
|---|---|---|
| **(a)** a **named tax lead** (the same person as D.2), with the annual true-up written as a standing duty | one named person; a real January obligation | if they leave, the duty must be reassigned — the belt makes that visible |
| **(b)** the belt raises to the firm owner every time | no designation needed | the owner becomes the tax-law maintainer by default |
| **(c)** nobody named; the belt raises and whoever notices acts | nothing | this is how it silently breaks — a question with no owner is a question nobody answers |

**Recommendation: (a), with (b) as the automatic fallback** — the design already specifies that when
no tax lead is designated the belt raises to the firm owner **and says that it did**, so (c) cannot
happen by drift.

---

## The three still open to the lane

### OQ-2 · There is no fixed-asset population to test capital allowances against.

No corpus client has an asset register, and the estate's `fixed_assets` table is unexercised for tax
purposes. The CA evaluator is the most arithmetically intricate part of F-T3 and it would ship
tested only against fixtures the same lane wrote. Options: **(a)** the owner supplies a real asset
listing for one client (cost, date in use, class, commercial/new flags); **(b)** synthetic assets on
ROME PUBLIC ADVISORY, designed to hit every branch; **(c)** both.
**Recommendation: (c)** — (b) for branch coverage, (a) for the one thing fixtures cannot give, which
is the messy classification of a real asset.

### OQ-3 · Official-source access is partial. Does that change what Clara may draft?

Today `phl.hasil.gov.my` and both AGC portals were unreachable, so **no gazette (P.U.(A)) text was
read at its own official source**, and LHDN's own consolidated Act 53 is stamped *as at 21 May 2024*
(survey §6.1, §6.3). Six items are consequently unverified (U1-U6), including a live CA rate. Also
unfetched: the Form C guide notes, which the field pack needs to know which fields drop sen (A.2).
Options: **(a)** a row is seeded only against an **official** source, and an unreachable gazette
simply blocks that rate — the design's current posture, which **R-L25 named as the model**;
**(b)** a professional-firm secondary suffices when the official source is provably down, with the
row flagged; **(c)** the owner or tax lead supplies the rate as a human act, cited to their own
authority rather than to a URL.
**Recommendation: (a), with (c) as the escape.** R-L25 settles the *mechanism* (seeded by PR, cited,
missing-refuses) but not the *evidence bar*, so this stays open. A rate a named professional supplies
is a human act with a human's name on it — a better answer than relaxing what "official" means.

### OQ-9 · Does the confirmed tax figure post a provision in Wave F?

The design leaves the tax provision posting out of v1 (§13) because posting it into a closed year
needs a reopen, and the reopen window belongs to F-A4. But a computation whose figure never reaches
the books leaves the accounts understating a real liability.
**Recommendation: out of Wave F, named as a Wave-G item** — with the computation statement carrying
the provision amount explicitly so a human can post it manually in the meantime, rather than the
number existing only inside a sealed report nobody journals from.

---

## The five that are settled — stubs kept so a reader following a cite lands somewhere

### ~~OQ-4~~ · RULED 2026-08-23 — **REFUSE**

An unproven SME premise refuses and names the missing fact; it never falls back to 24%. The design's
recommendation became the answer. Fold: design §6. The RM31,409.50 swing on the worked ladder (A.3)
is why.

### ~~OQ-5~~ · RULED 2026-08-23 — **the PACK, with the form version PINNED**

The field-addressed pack ships; no form replica. The ruling **added** a requirement the design did
not carry: the pack maps to LHDN's own field ids for a **pinned `form_version`**, a superseded
version is the named refusal `form_version_superseded`, and the whole-ringgit truncation rule becomes
a property of the mapped version rather than a global convention. Fold: design §8, D-8 extended,
D-14 amended.

### ~~OQ-6~~ · RULED 2026-08-23 — **R-L25, developer-seeded fact tables**

The Wave-F Tier-1 closure re-opens for `tax_rate_bands` + `capital_allowance_rates`, seeded by
migration on the D17/R-L19 pattern rather than through TA-P2's one-click door — one seeding
architecture, not two (law 81). **The lane's own recommendation was wrong on the mechanism**: it
proposed re-opening the *governed door*, and the ruling correctly points out that the price-row
precedent already settled this. Folds: `wave-f-contract.md` `[TB-2026-08-23]`, design §4 + §11 (PR-1
no longer builds a door), **D-15**.

### ~~OQ-7~~ · CARDED — see **D.2**

### ~~OQ-8~~ · CARDED — see **D.3**. Its **product half is granted and designed** (design §4.6).

---

# Annex E · The standing maintenance duty — what the belt watches

This is the population the `law_review_due` belt reads (design §4.6). Each row carries
`valid_through`; the belt raises one typed question per expiring row to the firm's tax lead, and the
question closes only when a superseding row is **seeded** (R-L25 — a rate change is a ticket and a
PR, never an in-place edit).

| Table | Refreshed when | Refuses if stale | `valid_through` set from |
|---|---|---|---|
| `tax_rate_bands` | each Finance Act / Budget affecting Schedule 1 | `rate_row_missing_for_ya` | the last YA the band is legislated for |
| `capital_allowance_rates` | each gazette order affecting Schedule 3 rates | `rate_row_missing_for_ya` | the order's own expiry, or the last YA seeded |
| `tax_thresholds` | each Finance Act affecting a threshold in §4(5) of the design | the dependent rung is `not_evaluable` | the last YA the threshold is legislated for |
| `tax_treatment_codes` | when a Public Ruling is withdrawn or replaced | `treatment_code_unsigned` on the successor until it is signed | `effective_ya_to`, plus a re-read horizon on the cited PR |
| `tax_authorities` | when a cited URL moves or a PR is reissued | `citation_missing` at seal | a re-read horizon from `accessed_at` |
| the field-pack map | when LHDN issues a new form edition | `form_version_superseded` | the pinned `form_version`'s own YA |

**Three rows the gate fold added, each a refusal that depends on an authority not yet seeded** (design
part 2 §12's research gates):

| Table | Refreshed when | Refuses if stale | `valid_through` set from |
|---|---|---|---|
| `capital_allowance_rates` — the **ICT 40/20** row | when P.U.(A) 328/2024 becomes readable at an official source | `rate_row_missing_for_ya` on the ICT class | the order's own scope, once read |
| `tax_thresholds` — **`sva_annual_cap`** (survey U2) | when PR 3/2021 is read at an official source | `rate_row_missing_for_ya` on the whole SVA branch | the last YA the cap is legislated for |
| `tax_authorities` — **PR 1/2022** (survey U5) | when the loss-relief ruling is read at an official source | `loss_relief_rules_unread` on R7/R8's set-off | a re-read horizon from `accessed_at` |

The belt does double duty after the fold: it warns before a **seeded** row expires, and it is the
surface on which a **deliberately absent** row stays visible instead of forgotten — one mechanism.

Three things follow. First, **the refusals are the health signal, and the belt is the early warning**
— a January that produces `rate_row_missing_for_ya` across the estate means nobody trued the year,
which is far better than a silent carry-forward, but the belt should have said so in November.
Second, this table is the argument for `tax_authorities` carrying `accessed_at`: a citation whose
last successful read was two years ago is worth re-reading, and that is a query, not a memory.
Third, **the belt is why a `valid_through` in the past is not an error state** — the row still
computes and the question is already open, so the system degrades by asking rather than by stopping.
