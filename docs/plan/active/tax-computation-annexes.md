# F-T3 — the draft tax computation: annexes (v1)

> Annexes to `tax-computation-design.md`, on `tax-computation-survey.md`.
> **A** mechanics and a worked ladder · **B** decision register D-1..D-14 · **C** predictions to
> discharge at PR-0's rig replay · **D** owner questions (nine) · **E** the standing maintenance duty.
> Design stage: **no code authored, no rig run**.

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

`months` matters twice: it is the CP204 instalment divisor, and it is the AA period for an asset
acquired in a short period. **(D-1.)**

## A.2 Arithmetic discipline

Everything is **integer cents**. No floating point enters a durable artifact.

- A treatment amount is `balance_cents × code.fraction_bp × COALESCE(apportionment_bp, 10000)`
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
**R7 — aggregate income** = **410,850.00** (single source; no current-year loss)
**R8 — total income**: approved-institution donation 5,000.00, capped at 10% × 410,850.00 =
41,085.00, so fully deductible ⇒ **405,850.00**. No brought-forward loss.
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

**R11 — CP204 for YA2026.** Natural estimate 65,994.50; the 85% floor is 0.85 × the latest YA2025
estimate on record. If that was 60,000.00, the floor is 51,000.00 and the estimate clears it. Twelve
months ⇒ `floor(6,599,450 / 12) = 549,954` cents; 12 × 549,954 = 6,599,448, remainder **2 cents onto
instalment 1**. Instalment 1 = **5,499.56**, instalments 2-12 = **5,499.54**, due the **15th** of
each calendar month from the **2nd month** of the basis period. If no YA2025 filing is on record the
estimate still computes and the floor prints `prior_estimate_unknown`.

**R12 — s.107C(10) exposure**, narrative. If the assessment lands at 95,000.00 against a latest
estimate of 65,994.50: excess 29,005.50; 30% of 95,000.00 = 28,500.00; excess exceeds it, so the
penalty base is 29,005.50 − 28,500.00 = 505.50 and the increase is 10% = **50.55**. Printed as
exposure. Never posted.

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
| **D-3** | **Entity identity lands as `client_fact_keys` through `record_client_fact`** (`0055`), not as columns on `clara.clients`. | *Add columns.* `clients` is 6 columns by design and the fact store already carries `basis`/`basis_kind` — provenance for a paid-up figure is exactly what a rate test needs. |
| **D-4** | **Law that could not be read at an official source today does not land as a Tier-1 row.** The ICT 40/20 rate is left out and refuses by name. | *Seed it from professional-firm secondaries.* TA-P2 requires two independent **official** sources. A rate is a number in a client's books. |
| **D-5** | **`tax_authorities` is the citation store; F-A5's `basis_citations` carries pointers to it.** | *Ride F-A8's `web_fetch_citations`.* That is a per-fetch artefact; a statutory reference is standing law and must not be re-fetched (and re-risked) on every computation. It also inverts the failure mode: a fetch outage would stop a computation. |
| **D-6** | **An unproven SME premise REFUSES.** No fallback to 24%. | *The frozen build's honesty layer — draft at 24% with a banner.* A rate on an unproven premise is a fabricated number (hard constraint 2), and a banner is prompt-level mitigation for a structural problem. Owner-facing: **OQ-4**. |
| **D-7** | **Add `disposal_value_cents` + `disposed_on` to `clara.fixed_assets`** and set them in `dispose_fixed_asset`. | *Re-derive the disposal value from the posted entry.* Deriving a statutory input from a posting's shape is "a derived state is not evidence" (digest law 31); the verb already holds the number. |
| **D-8** | **Statutory output is a field-addressed pack, not a form replica.** | *Render the LHDN form.* The renderer carries a chart/line AST only, statutory templates are human-published and the wording is owner-signed (survey §3.3). Building a form renderer is its own wave. Owner-facing: **OQ-5**. |
| **D-9** | **A transparent entity refuses an entity charge**; it does not compute zero. | *Compute zero.* Zero is a number, and a Form C with a zero charge for a sole proprietorship is a wrong document, not a harmless one. Re-earns the frozen build's guard. |
| **D-10** | **v1 treats at account level**; a mixed account yields `mixed_account_needs_split` and a coding proposal. | *Entry-level treatment from the start.* It moves the judgement from ~40 accounts to ~4,000 entries and makes the human review unreviewable. The per-entry override lands in PR-6 for the exceptional line. |
| **D-11** | **The severance: Clara writes a `code`, the DB owns every numeral.** The proposal table has no numeric column. | *Let the model emit the amount and validate it.* Validation is a check on an output; the absence of a column is a property of the schema. Hard constraint 2 says the enforcement is structural, not prompt-level. |
| **D-12** | **Instalment rounding: `floor(estimate/n)` with the whole remainder on the FIRST instalment.** | *Remainder on the last.* Both sum exactly; the first-instalment convention means a mid-year revision never has to reconcile a stray sen in a month that has not happened yet. |
| **D-13** | **A treatment code's citation is bound ONCE, by the owner's signature — never re-picked per run.** | *Cite per computation from the model's reasoning.* This is the exact error class the survey found in the prior research (§6.4a — depreciation cited to s.39(1)(b)). Bind once, and it is wrong at most once, visibly, before it ships. |
| **D-14** | **Integer cents throughout; the exact rational is stored in `metric_cells`; per-field whole-ringgit truncation is declared in the field-pack definition.** | *Round the computation to whole ringgit because the form does.* Then the computation statement and the pack disagree, and the reviewer cannot tie them. |

---

# Annex C · Predictions to discharge at PR-0's rig replay

Each is a source-read claim that a replay can falsify. None may be relied on in a build PR until
discharged.

| # | Prediction | How PR-0 discharges it |
|---|---|---|
| **P-1** | `metric_cells.cell_status` domain is exactly `('ok','undefined','absent','refused')` and `not_evaluable` maps onto `undefined`/`absent` as §9 says. | `pg_get_constraintdef` on the live CHECK |
| **P-2** | `clara.verify_evaluator_freeze()` fails a migration that appends an `evaluator_version_member` without the accompanying function. | force the failure on the rig; assert the migration run aborts |
| **P-3** | `close_receipts.snapshot->'closing_position'` carries **every** account with a non-zero balance, not only P&L accounts. | seed a close on the rig, enumerate the snapshot against `trial_balance_as_of` |
| **P-4** | `uq_cr_one_active_close` makes "the sealed close for a fiscal year" a single unambiguous row. | `pg_get_constraintdef`; then attempt a second active row |
| **P-5** | `record_client_fact` accepts a newly registered key with an as-at date and rejects an unregistered one. | exercise both arms |
| **P-6** | `dispose_fixed_asset`'s live body is what `0041:3644` shows (bodies are spliced across generations; the file text is not the live body). | `pg_get_functiondef`; record the `prosrc` sha256 as PR-3's prestate pin |
| **P-7** | `publish_report_template_version` refuses `report_class='statutory'` from the agent principal and accepts it from the human admin verb. | exercise both arms — a refusal that cannot say NO has a meaningless YES |
| **P-8** | `fixed_assets.ca_class` has no CHECK domain restricting it to the classes the CA rate table will key on. | `pg_get_constraintdef`; if it does, PR-1's rate-table keys must match it exactly |
| **P-9** | `evaluator_versions.deployed` cannot be flipped by a plain UPDATE — `_tf_evaluator_deploy_once` (`0060:93-100`) is the only door. | attempt the plain UPDATE on the rig |

---

# Annex D · Owner questions

Nine. Each states the collision, the cost of each answer, and the recommendation. None is a
build choice the lane may make alone.

### OQ-1 · There is no acceptance oracle for F-T3 in the corpus. What is the bar?

The owner's three folders contain no Form C, no tax computation, no CP204 and no fixed-asset
register (survey §5). ADR-0075 §(2) says no oracle exists beyond the folders **or is required** — so
"reproduce last year's return" is not available and is not owed. Options: **(a)** the owner or the
firm's tax agent hand-works one YA for one client and that becomes the golden bar; **(b)** acceptance
is the battery's behavioural cells plus a review of the worked ladder, with the golden bar deferred
to Wave G; **(c)** F-T3 accepts on synthetic ROME PUBLIC ADVISORY data only.
**Recommendation: (a) for one company + (b) for the rest.** One hand-worked computation is a few
hours of the owner's time and it is the only thing that can catch a whole-ladder sign error. Without
it, every cell can pass and the total can still be wrong.

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
Options: **(a)** Tier-1 rows land only on two **official** sources, and an unreachable gazette simply
blocks that rate — the design's current posture; **(b)** a professional-firm secondary counts as one
of the two when the official source is provably down, with the row flagged; **(c)** the owner keys
the rate himself as a human act, which is neither Clara's draft nor a fetch.
**Recommendation: (a), with (c) as the escape.** A rate the owner keys is a human act with a human's
name on it — that is a better answer than relaxing what "official" means.

### OQ-4 · An unproven SME premise: refuse, or draft at 24% with a banner?

The frozen build drafted at the standard rate and surfaced the conditions; this design refuses and
names the missing fact (D-6). The cost of refusing is that a human sees no number until the paid-up
capital and shareholding facts are recorded. The cost of defaulting is a figure on a draft that a
tired reviewer may not re-question — and the difference is material (RM31,409.50 on the worked
example, A.3).
**Recommendation: refuse.** But this is genuinely the owner's call, because it changes what a busy
tax agent sees on screen in the common case.

### OQ-5 · Field-value pack, or a replica of the LHDN form?

v1 produces the computation statement plus a field-code → value pack (D-8); the renderer cannot
produce a boxed statutory form and the wording is owner-signed. A pack is what a human keys from; a
replica is what a human recognises.
**Recommendation: the pack for v1**, with a named Wave-G item for the form renderer if the owner
wants recognition as well as keyability.

### OQ-6 · The Tier-1 closure collides with the ALL-IN ruling. Contract amendment.

`wave-f-contract.md:342-344` closes Tier-1 to three tables for Wave F and puts income-tax bands and
capital allowances out "until their own consumers land (F-T2/F-T3)". The 2026-08-23 ruling lands
F-T3 *inside* Wave F, so the consumer has landed inside the closure. Either Tier-1 re-opens for
`tax_rate_bands` + `capital_allowance_rates`, or F-T3 builds a second governed-row mechanism — two
architectures for one job (digest law 81).
**Recommendation: re-open Tier-1 for exactly two more tables**, same door, same two-source check,
same immutable+supersede shape. It is a smaller change than it sounds and it keeps one mechanism.

### OQ-7 · Whose signature signs a treatment code?

`tax_treatment_codes.owner_signed_by` is the hinge of the whole severance (D-11, D-13): it is the act
that binds a fraction and a statutory citation together. Is that signature the owner's personally, or
the firm's licensed tax agent's, or either? The professional-signature framing is what holds the
statutory boundary here — the person who signs the code is the person who is professionally
answerable for the citation.
**Recommendation: a named licensed tax agent, who may be the owner.** Record the licence reference
on the signature row.

### OQ-8 · Who owns the standing duty to true the law after each Finance Act?

Act 53 as read is stamped 21 May 2024 (U7); Budget 2026 and its tax bills are already in circulation
(LHDN published a joint-memorandum response). Every rate band, threshold and Schedule-3 rate in
`tax_rate_bands` / `tax_thresholds` / `capital_allowance_rates` has an effective-YA window that
someone must extend or supersede each year, and **a missing row for the YA refuses by name** — which
is the correct behaviour, and it means the computation stops working every January until someone
acts.
**Recommendation: make it an explicit annual duty with a named owner and a clocked reminder** (digest
law 80 permits the clock to wake her; the work still triggers on data — she drafts the rows, the
human signs). Left unnamed, this is the most likely way F-T3 quietly breaks.

### OQ-9 · Does the confirmed tax figure post a provision in Wave F?

The design leaves the tax provision posting out of v1 (§13) because posting it into a closed year
needs a reopen, and the reopen window belongs to F-A4. But a computation whose figure never reaches
the books leaves the accounts understating a real liability.
**Recommendation: out of Wave F, named as a Wave-G item** — with the computation statement carrying
the provision amount explicitly so a human can post it manually in the meantime, rather than the
number existing only inside a sealed report nobody journals from.

---

# Annex E · The standing maintenance duty (a summary of what OQ-8 asks someone to own)

| Table | Refreshed when | Refused if stale |
|---|---|---|
| `tax_rate_bands` | each Finance Act / Budget affecting Schedule 1 | `rate_row_missing_for_ya` |
| `capital_allowance_rates` | each gazette order affecting Schedule 3 rates | `rate_row_missing_for_ya` |
| `tax_thresholds` | each Finance Act affecting a threshold in §4(5) of the design | the dependent rung is `not_evaluable` |
| `tax_treatment_codes` | when a Public Ruling is withdrawn or replaced | the code's `effective_ya_to` closes; a superseding code is signed |
| `tax_authorities` | when a cited URL moves or a PR is reissued | `citation_missing` at seal |

Two things follow. First, **the refusals are the health signal** — a January that produces
`rate_row_missing_for_ya` across the estate is the system correctly saying nobody has trued the year
yet, and it is far better than a silent carry-forward. Second, the table above is the argument for
`tax_authorities` carrying `accessed_at`: a citation whose last successful read was two years ago is
a citation worth re-reading, and that is a query, not a memory.
