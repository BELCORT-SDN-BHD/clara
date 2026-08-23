# F-T3 — the draft tax computation: annexes (v1.2)

> Annexes to `tax-computation-design.md`, on `tax-computation-survey.md`.
> **A** mechanics and a worked ladder · **B** decision register D-1..D-17 · **C** predictions to
> discharge at PR-0's rig replay · **D** the question register — **three RULED, three carded for the
> owner's sitting, three lane-open** · **E** the standing maintenance duty the `law_review_due` belt
> watches. Design stage: **no code authored, no rig run**.
>
> **v1.2, 2026-08-23 — conductor's measured corrections.** **D-16** the frozen closure collapses to
> ONE evaluator member (twelve would freeze twelve bodies estate-wide; `deployed:false` buys
> nothing) · **D-17** the `client_fact_keys` name-only-wall scoping obligation, its own seed block,
> and battery cell **C15** · P-10 added to Annex C.
>
> **v1.1, 2026-08-23 — the ruling trues.** OQ-6 → **R-L25** (developer-seeded law tables, **D-15**) ·
> OQ-4 → **REFUSE** · OQ-5 → **the pack, form version pinned** (D-8 extended, D-14 amended) ·
> OQ-8's **product half granted and designed** (design §4.6; Annex E rewritten around the belt) ·
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
| **D-14** | **Integer cents throughout; the exact rational is stored in `metric_cells`; per-field whole-ringgit truncation is declared in the field-pack definition** — and, per the OQ-5 ruling, it is a property of the **pinned form version**, not a global convention. | *Round the computation to whole ringgit because the form does.* Then the computation statement and the pack disagree, and the reviewer cannot tie them. |
| **D-16** *(conductor, measured, 2026-08-23)* | **The frozen closure is ONE member**, `evaluate_tax_computation_v1`, self-contained and calling only built-ins. | *Twelve members, one per rung* (v1.1). **`verify_evaluator_freeze()` iterates `evaluator_versions` with no `where deployed` and hashes the FULL `pg_get_functiondef`** — so registration freezes immediately (**`deployed:false` buys nothing**, which v1.1's "appended undeployed" wording obscured), and a later ACL/owner/`search_path` change to any member raises **at that later lane's apply, pointing at F-T3**. Twelve members = twelve bodies frozen estate-wide. Also rejected: *three members* (ladder/CA/CP204) — the SME predicate is needed by all three, so it becomes a shared fourth frozen body or gets inlined three times (two mutually-unaware paths, law 81). |
| **D-17** *(conductor, 2026-08-23)* | **F-T3's `client_fact_keys` describe the CLIENT, and say so in their own description text.** Each key's description scopes it explicitly — "the CLIENT's own TIN; nothing to do with a counterparty's" — citing the generic name-only wall (`0062`/`0063`). **The ladder reads no counterparty `tin` or `registration_no` anywhere** (battery C15); if it ever needs one — related-party disclosure, withholding — **stop and escalate**, because lifting that wall is an OWNER-only act through `0063`'s audited door. F-T3 also takes its **own** seed block, never shared with F-A7's. | *Registering `tin`/`ssm_registration` with a bare description.* `0055`'s culture is that the description carries the law (see `customer_identity_policy`'s), and this catalog is one table away from the wall that keeps a name-only client's counterparties unenriched. A later reader or agent must not mistake it for a place to record a customer's identifier. **Note on framing:** ADR-0075 §(5) **retired hard constraint 12 as a named constraint** while leaving `0062`/`0063` untouched — so the obligation attaches to the **generic wall**, and the description text must cite the wall and ADR-0075, not the retired constraint number. |
| **D-15** *(from R-L25, 2026-08-23)* | **The law tables are DEVELOPER-SEEDED, not governed-door tables.** `tax_rate_bands`, `capital_allowance_rates`, `tax_thresholds` and `tax_authorities` land as versioned, effective-dated migration rows through the full PR ladder, each cited with its fetch date, immutable + supersede, `valid_through` on every row, a missing row refusing by name. A rate change is a ticket and a PR. | *TA-P2's owner one-click door* (the v1 design's choice). Two governed-row mechanisms for one job is two architectures (law 81); the D17/R-L19 precedent already settled the identical question for price rows, and the same reasoning applies — a rate is platform data, not client data, and no human session holds a role that makes a one-click approval meaningfully different from a PR. The F-A8 fetch can attach later without changing how a row lands. |

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
| **P-10** | D-16's two load-bearing properties hold as reported: `verify_evaluator_freeze()` covers **undeployed** rows, and its hash moves when only a member's **ACL / owner / `search_path`** changes (body untouched). | Reported measured by the conductor (L19-verified) — **F-T3 still re-measures both** on its own rig, because a design that collapsed twelve members to one on the strength of these two facts may not hold them on hearsay. Register an undeployed row → confirm it freezes; then `alter function … owner to` / `set search_path` → confirm the checker raises. |

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

Three things follow. First, **the refusals are the health signal, and the belt is the early warning**
— a January that produces `rate_row_missing_for_ya` across the estate means nobody trued the year,
which is far better than a silent carry-forward, but the belt should have said so in November.
Second, this table is the argument for `tax_authorities` carrying `accessed_at`: a citation whose
last successful read was two years ago is worth re-reading, and that is a query, not a memory.
Third, **the belt is why a `valid_through` in the past is not an error state** — the row still
computes and the question is already open, so the system degrades by asking rather than by stopping.
