# F-T3 — the draft tax computation: design (v1)

> **Design of record for Wave-F Track-B item F-T3.** Reads on `tax-computation-survey.md` (the
> estate + the law, both re-fetched 2026-08-23) and `tax-computation-annexes.md` (mechanics,
> decision register D-1..D-15, predictions, owner questions). Contract:
> `wave-f-contract.md:406-408`. Owner ruling 2026-08-23: **ALL-IN in Wave F**, not slipped to v1.1.
>
> **v1.1, 2026-08-23 — three of the design's nine questions are RULED** (orchestrator, standing
> delegation), and the folds are in place, each marked **[RULED 2026-08-23]** where it bites:
> **OQ-6 → R-L25** — the Wave-F Tier-1 closure re-opens for F-T3's two tables, and they land as
> **developer-seeded versioned effective-dated fact tables** on the D17/R-L19 pattern, **not** on
> TA-P2's owner one-click door (§4, §11; the contract note is `wave-f-contract.md`'s
> `[TB-2026-08-23]` block). **OQ-4 → REFUSE** — an unknown SME status is a question to the human,
> never a fall-back to 24% (§6). **OQ-5 → the field-addressed PACK**, with the **form version
> pinned**, never a form replica (§8). Also granted: **OQ-8's product half is designed now** — every
> seeded law row carries `valid_through` and a `law_review_due` belt raises a typed question to the
> firm's tax lead before expiry (§4.6, a consumer of F-A4's clock, R-L22). **OQ-1 / OQ-7 / OQ-8's
> governance half go to the owner's sitting as one-question cards** (annexes, Annex D).
>
> **Design-stage only. No code was authored and no rig was run.** Every DB cite is source-read; the
> replay is PR-0's.

---

## 1 · The shape, in one paragraph

A Malaysian tax computation is a ladder from a sealed accounting profit to a tax charge. Every rung
of that ladder is arithmetic over DB-owned inputs, and therefore belongs to a versioned deterministic
evaluator — hard constraint 2, and there is no second way to make a number in this estate (survey
§3.1). Exactly one thing in the computation is *not* arithmetic: deciding **which treatment a line
of the books attracts** — is this entertainment, is it private, is it capital. That decision is
Clara's, it is cited, and a human approves it in one click. The design's whole job is to make those
two halves **structurally unable to touch**: Clara picks a *label from a closed set*, the DB owns
every *numeral*, and the model has no column to type a number into. The output is a sealed
computation statement plus a field-addressed pack a human keys into MyTax. **F-T3 builds no
submission verb of any kind** (digest laws 71, 74, 80, 82 — e-filing is human, excluded by nature
even from the delegate grant).

---

## 2 · The severance — the one structural idea

The failure this design exists to prevent is a model-authored numeral reaching a document a human
signs and files. Prompt discipline cannot prevent it; a schema can.

**Clara's only write into the computation is a `code`.** The treatment codes are a
migration-seeded, owner-signed, closed set. Each code carries its own fraction and its own statutory
citation. Clara's proposal row has **no numeric column at all** — there is nothing to type.

```
tax_treatment_codes            (migration-seeded, immutable + supersede, OWNER-SIGNED)
  code                    text pk        e.g. 'ADDBACK_ENTERTAINMENT_50'
  direction               text           add_back | deduct | allowable | exclude
  fraction_bp             int            10000 = 100%, 5000 = 50%, 0 = nil     <-- the DB owns this
  regime                  text           company | individual | both
  statutory_ref           text           's.39(1)(l) ITA 1967'
  authority_id            uuid  -> tax_authorities                             <-- the citation
  effective_ya_from/to    int
  owner_signed_by/at      NOT NULL                                             <-- unsigned = unusable

tax_account_treatments         (Clara PROPOSES, a human APPROVES)
  client_id, account_id, ya
  code                    text  -> tax_treatment_codes                         <-- Clara writes ONLY this
  proposal_basis          text                                                 <-- her narration
  proposed_by, proposed_at
  approved_by, approved_at                                                     <-- the one-click door
  apportionment_bp        int NULL                                             <-- HUMAN-keyed only
  apportionment_entered_by
  CHECK (apportionment_bp IS NULL
         OR (approved_by IS NOT NULL AND apportionment_entered_by IS NOT NULL))
```

The evaluator's fraction is `code.fraction_bp * COALESCE(apportionment_bp, 10000) / 10000`, and the
amount is that fraction applied to the **sealed closing position of the account**. Three properties
follow mechanically, and each gets a behavioural cell in the battery (§10):

1. **A model cannot emit a numeral into the computation.** Not "is discouraged from" — cannot.
2. **A treatment cannot exist without a citation**, because the code carries one and an unsigned code
   is unusable (`owner_signed_by NOT NULL`).
3. **An apportionment percentage — the one judgement number that is genuinely a number** — is keyed
   by a human or it does not exist. Clara may argue for 60% in `proposal_basis`; she cannot store 60.

This also fixes the error class the survey found in the prior research (§6.4a): the citation is bound
**once, to the code, by the owner**, not re-picked per run by a model. A depreciation add-back cannot
cite the wrong paragraph on Tuesday and the right one on Wednesday.

---

## 3 · The ladder as evaluator members

One `evaluator_version` (`clara.evaluator_versions`, appended undeployed; `deployed` flipped by the
`_tf_evaluator_deploy_once` ceremony — `0060:93-100`), whose members are the rungs. Every rung's
output is a `metric_cell` with `formula_sha256`, `resolved_inputs_sha256` and `evaluator_version_id`.

| # | Rung | Reads | Yields |
|---|---|---|---|
| R1 | **accounting profit before tax** | `close_receipts.pl_net_cents` + `snapshot->'closing_position'` for the fiscal year, `status='active'`, `kind='close'` | the base |
| R2 | **add-backs** | `tax_account_treatments` (approved) × the sealed closing position | one line per treated account, one total |
| R3 | **further deductions / income not taxable** | same, `direction ∈ {deduct, exclude}` | exempt/single-tier dividends, capital gains reversed |
| R4 | **adjusted income** (s.33) | R1 + R2 − R3 | per business source |
| R5 | **capital allowances** (Sch 3) | `ca_asset_years` (§5) | IA + AA + balancing adjustments |
| R6 | **statutory income** (s.42) | R4 − R5, floored at nil; excess CA carried | per source |
| R7 | **aggregate income** (s.43) | Σ R6 across sources, less current-year adjusted loss | |
| R8 | **total income** (s.44) | R7 less brought-forward loss (s.44(5F): 10 YAs) and approved donations (s.44(6): ≤10% of R7) | |
| R9 | **chargeable income** | company: = R8. individual: R8 less personal reliefs — **not F-T3's** (§8) | |
| R10 | **tax charge** | R9 through `tax_rate_bands` for the regime the SME predicate returned (§6) | |
| R11 | **CP204 estimate + instalment schedule** | R10, the 85% floor, months in the basis period | §7 |
| R12 | **s.107C(10) exposure** | R10 vs the latest recorded estimate | narrative, never a posting |

R1's input rule is a wall, not a preference: **no active `close_receipts` row ⇒ `close_not_sealed`**.
Reading `trial_balance()` live would give a computation that silently changes after it is filed.

---

## 4 · New DB surfaces

Seven, all new; nothing existing is altered except one column (D-7).

**(1) `tax_authorities`** — the citation catalog. `kind ∈ {act_section, schedule_para, public_ruling,
gazette_order, lhdn_page}`, `label`, `url`, `accessed_at`, `quote`, `fetched_by`, `owner_signed_by/at`.
This is F-T3's answer to survey §3.4: **neither** F-A8's `web_fetch_citations` **nor** F-A5's
`basis_citations` is the right home for a *statutory* citation, because both are per-run artefacts of
a fetch, and a statutory reference is standing law that must not be re-fetched (and re-risked) on
every computation. `tax_authorities` rows are seeded by migration for the provisions this design
names, and a *new* authority **arrives the same way its rate row does — seeded by migration, cited,
through the PR ladder** (R-L25; the v1 text routed this through TA-P2's one-click door and is
superseded). Clara drafts the row's content from a fetch and cites it; the row lands by PR. A
`report_agent_receipt`'s `basis_citations` then carries `tax_authorities.id` values — so F-A5's
carrier is still used, as a pointer, not as the store. **(D-5)**

**(2) `tax_treatment_codes`** — §2. Seeded per the survey's verified law; each row owner-signed once.

**How (3), (4) and (5) land — [RULED 2026-08-23, OQ-6 → R-L25].** They are **developer-seeded fact
tables on the D17/R-L19 pattern**, not TA-P2 governed-door tables: **versioned, effective-dated rows
seeded by migration through the full PR ladder**, each row cited to LHDN or the AGC gazette with its
fetch date via `authority_id`, immutable + supersede, and **a missing row for the YA refuses by name
and stops in the open** — never carried forward from the previous year. A rate change is a ticket and
a PR. This is the **same** mechanism as the F-A9 price rows and the deadline tables — one seeding
architecture, not two (digest law 81) — and the F-A8 scheduled fetch may attach to these tables later
without changing how a row lands. The Wave-F Tier-1 closure re-opens for **exactly these two rate
tables**; EPF/SOCSO/EIS, stamp duty and MTD stay out. Contract note: `wave-f-contract.md`'s
`[TB-2026-08-23]` block. **(D-15.)**

**(3) `tax_rate_bands`** — `(regime, ya, band_lower_cents, band_upper_cents NULL, rate_bp,
authority_id, valid_through, revision, superseded_by, seeded_in_migration)`. Regimes:
`company_msmc`, `company_standard`, `individual_resident`, `individual_non_resident`. A band that
silently persists past a Budget is a wrong number in a client's books — hence the refusal, and hence
`valid_through` (§4.6).

**(4) `capital_allowance_rates`** — `(ya_from, ya_to, ca_class, ia_bp, aa_bp, authority_id,
valid_through, …)`. Seeded from PR 12/2014's three categories and PR 3/2018's IBA. **The ICT 40/20
row (P.U.(A) 328/2024) is NOT seeded** — survey §6.3 U1: the gazette text could not be read at an
official source on 2026-08-23, and a rate on professional-firm secondaries is not a cited official
row. An asset whose `ca_class` resolves to ICT therefore returns `rate_row_missing_for_ya`. **R-L25
names this posture as the model for the whole family**: that is the design working, not failing.

**(5) `tax_thresholds`** — `(ya, key, value_cents | value_bp, authority_id, valid_through, …)`. Keys:
`msmc_paid_up_max` (RM2,500,000) · `msmc_gross_income_max` (RM50,000,000) · `msmc_foreign_holding_max_bp`
(2000) · `related_company_paid_up_min` (RM2,500,000) · `sva_asset_max` (RM2,000) ·
`sva_annual_cap` (RM20,000) · `mv_qe_cap_default` (RM50,000) · `mv_qe_cap_new` (RM100,000) ·
`mv_new_cost_ceiling` (RM150,000) · `cp204_floor_bp` (8500) · `s107c10_threshold_bp` (3000) ·
`s107c10_penalty_bp` (1000) · `s44_6_donation_cap_bp` (1000) · `loss_carry_forward_years` (10).

**(6) `ca_asset_years`** — the capital-allowance schedule, §5. Evaluator-written only.

**(7) `cp204_filings`** — what was actually filed and when: `(client_id, ya, kind ∈
{estimate, revision_m6, revision_m9, revision_m11}, amount_cents, filed_on, recorded_by)`. Human-keyed,
because Clara cannot e-file and therefore cannot know. Its absence is a named `not_evaluable`, never
a zero.

**Plus, not a table: new `client_fact_keys`** written through the existing audited door
`record_client_fact` (`0055`) — `tin`, `ssm_registration`, `incorporation_date`,
`paid_up_ordinary_capital_cents` (as-at-dated), `foreign_or_noncitizen_holding_bp` (as-at-dated),
`related_company_paid_up_cents`, `commenced_operations_on`. **No column is added to `clara.clients`**
(survey §2.5). **(D-3)**

### 4.6 · `valid_through` and the law-review belt — [GRANTED 2026-08-23, OQ-8's product half]

A refusal is the right behaviour when a rate row is missing, and it is a **terrible first warning**:
the firm discovers it in January, mid-filing, on a client's return. The seeded law tables therefore
carry their own expiry, and something wakes before it.

**Every row in `tax_rate_bands`, `capital_allowance_rates`, `tax_thresholds` and `tax_authorities`
carries `valid_through`** — the last date on which the row is known-current, set at seed time from
the source's own scope (a YA-scoped rate expires with its YA; a Public Ruling's citation expires when
a reasonable re-read is due). It is **not** an automatic invalidation: past `valid_through` the row
still computes, and the belt has already raised the question.

**`law_review_due`** is a periodic belt, a **consumer of F-A4's clock** (digest law 80 — a clock may
wake her; the WORK still triggers on data, R-L22's shape). Each run reads the seeded tables and, for
every row whose `valid_through` falls inside the horizon, raises **one typed question to the firm's
tax lead**, naming the table, the row, its authority, its `accessed_at`, and what refuses if it is
not trued. Properties that make it a belt rather than a reminder:

- **It triggers on data, never on the calendar alone.** No expiring row, no question — a quiet
  January is a measured fact, not a missed run.
- **It is idempotent per row per horizon.** One open question per row; re-running does not multiply.
- **It resolves only by a seeded successor**, never by dismissal: the question closes when a
  migration lands a superseding row, so "acknowledged" cannot silently become "handled."
- **It never edits a rate.** Clara drafts the successor row's *content* and cites it; the row lands
  by PR (R-L25). The belt's whole output is a question with a name on it.
- **The recipient is a role, not a person** — the firm's tax lead, who is the same professional
  answerable for a treatment code's signature (OQ-7). If no tax lead is designated, the belt raises
  to the firm owner and says that it did.

This is the product half of the standing maintenance duty in the annexes' Annex E. The **governance**
half — who is contractually on the hook each Finance Act — stays an owner question (OQ-8's card).

---

## 5 · The capital allowance schedule

The evaluator finally gives `fixed_assets.ca_class` / `is_commercial_vehicle` / `is_new`
(`0041:354-357`) the consumer Wave D deferred to Wave F.

`ca_asset_years(client_id, fixed_asset_id, ya, qe_cents, ia_cents, aa_cents, balancing_cents,
residual_open_cents, residual_close_cents, rate_row_id, evaluator_version_id, cell_id)` — one row per
asset per YA, produced only by the evaluator, hand-writable by nobody.

**Qualifying expenditure.** `qe = cost` except for a motor vehicle that is not a commercial vehicle,
where `qe = LEAST(cost, is_new AND cost <= mv_new_cost_ceiling ? mv_qe_cap_new : mv_qe_cap_default)`
(PR 6/2015 §(b)). `is_commercial_vehicle` and `is_new` are register facts, not inferences.

**Allowances.** IA on QE in the year the asset comes into use; AA on QE each year, both at the rate
row for the `ca_class` and YA; AA never exceeds residual expenditure. **No AA in the year of
disposal** — a balancing allowance or charge instead, and a balancing charge is capped at the
allowances actually made.

**Small value assets** (Sch 3 para 19A). `cost <= sva_asset_max` ⇒ the full cost in lieu of IA/AA,
subject to `sva_annual_cap` per YA — **except** for a company resident and incorporated in Malaysia
meeting the MSMC criteria, where the cap does not apply (para 19A(3); PR 8/2025 Table 6 "No limit").
Note the cascade this creates and accept it: **SVA depends on the SME predicate, so a
`not_evaluable` SME verdict makes the SVA cap `not_evaluable`, which makes the CA total
`not_evaluable`, which makes the whole computation `not_evaluable`.** Fail-closed all the way up
(§9). It is not available to an LLP, a business trust or an ABS SPV.

**Accounting depreciation and capital allowances never meet.** `fa_depreciation` (`0041:519-543`)
feeds R2 as an add-back; `fixed_assets` feeds R5 as QE. Two different reads, two different rungs. A
differential battery cell proves they are not wired to the same source (§10 C8).

**One register change (D-7).** `dispose_fixed_asset` (`0041:3644`) posts proceeds and gain/loss but
stores neither. The balancing adjustment needs the **disposal value**. Options were (a) re-derive it
from the posted entry, (b) add `disposal_value_cents` + `disposed_on` to `fixed_assets`. (b) is
chosen: re-deriving a statutory input from a posting's shape is exactly the "derived state is not
evidence" trap (digest law 31), and the disposal verb already knows the number. This touches a live
writer's body — a `prosrc`-SHA prestate pin and a D1 write-quiesce window, listed in PR-3's §0
inventory.

---

## 6 · SME eligibility — a three-valued predicate, never a default

`sme_rate_eligibility_v1(client_id, ya) → (verdict, reasons jsonb)` with
`verdict ∈ {eligible, not_eligible, not_evaluable}`. Five conditions, evaluated independently
(PR 8/2025 §6.2.1, survey §6.2):

| C | Condition | Input |
|---|---|---|
| C1 | resident **and** incorporated in Malaysia | `entity_type` + a residence fact |
| C2 | paid-up ordinary share capital ≤ RM2.5m **at the beginning of the basis period** | `paid_up_ordinary_capital_cents` as-at that date |
| C3 | gross business income ≤ RM50m **in the basis period** | derived from the sealed close |
| C4 | not >50% owned by a related company (paid-up > RM2.5m) | `related_company_paid_up_cents` |
| C5 | **from YA2024**, not >20% owned directly or indirectly by foreign companies or non-citizens | `foreign_or_noncitizen_holding_bp` as-at |

**Combination rule.** Any condition returning a definite *fail* ⇒ `not_eligible` (a proven
disqualification is decisive; no missing fact can rescue it). Otherwise, any condition returning
`not_evaluable` ⇒ `not_evaluable`. Only all-pass ⇒ `eligible`.

**And `not_evaluable` refuses the computation — it does not fall back to 24%.** The frozen build's
honesty layer defaulted to the standard rate and printed a banner (survey §6.4c). F-T3 does not
inherit that. A rate applied on an unproven premise is a fabricated number in a durable artifact
(hard constraint 2), it is the *wrong* number in the client's favour-or-not depending on which way
the fact lands, and a banner is a prompt-level mitigation for a structural problem. The refusal
`sme_facts_missing` names the exact missing fact, and Clara chases it — which is the product's whole
shape. **(D-6.)**

**[RULED 2026-08-23 — OQ-4 → REFUSE.]** The design's recommendation is now the standing answer: **an
unknown SME status is a question to the human, never a rate.** The refusal is not a dead end on
screen — `sme_facts_missing` names the exact missing fact, so what the human sees is a chase, which
is the thing they would have had to do anyway before signing. Nothing in the design changes; the
question closes.

---

## 7 · CP204

`cp204_estimate_v1(client_id, ya)`:
- the natural estimate is R10 for the YA;
- the **85% floor** is `0.85 × ` the latest `cp204_filings` row for `ya-1` (revision if any, else the
  original estimate — s.107C(3));
- **no prior row ⇒ the floor is `prior_estimate_unknown`**, and the pack says so beside the number
  rather than silently omitting the floor. The estimate itself still computes.

`cp204_instalments_v1`: `n` = months in the basis period; equal monthly instalments due on the **15th
of each calendar month**, beginning at **month 2** for an established taxpayer and **month 6** for one
that first commenced operation with a basis period of ≥6 months (s.107C(4), (6); LHDN tax-estimation
page). Rounding convention **D-12**: instalments are `floor(estimate/n)` with the whole remainder on
the **first** instalment, so the schedule sums exactly to the estimate and no rounding drift reaches
the last month.

**The new-company relief** (s.107C(4A)): a company resident and incorporated in Malaysia that first
commenced operation is relieved for that YA and the immediate following YA (or the two following),
provided paid-up ordinary ≤ RM2.5m at the beginning of each, and — from YA2024 — provided the >20%
foreign/non-citizen test does not bite (PR 8/2025 §6.6.2). Reuses C2 and C5 from §6, so it inherits
the same three-valued discipline.

`cp204_underestimate_exposure_v1` (R12): where `actual − estimate > 0.30 × actual`, exposure =
`0.10 × (actual − estimate − 0.30 × actual)`. It is **narrative** — a number in the computation's
commentary and in the pack, never a provision, never a posting.

A taxpayer that has **not commenced operations** need not furnish CP204 (LHDN Filing Programme 2026
note 3(i)(b)); a **dormant** one must still furnish the return form. Both are verdicts of the
evaluator, both printed.

---

## 8 · The artifacts, and where the human wall stands

Three, all `report_runs` instances (`0065:369-401`) of new report definitions.

**(1) The computation statement.** Statement-shaped, one `report_dataset_point` per rung, each add-back
line carrying its treatment code, its statutory reference and its `tax_authorities` citation. This is
the document a Malaysian firm actually attaches and a tax agent actually reviews. It is the primary
deliverable.

**(2) The field-value packs** — `form_c`, `form_pt`, `form_b`, `form_p`, `cp204`. A field-code → value
table, so a human keys MyTax without re-deriving anything. **Not a replica of the LHDN form**:
`publish_report_template_version` refuses a `report_class='statutory'` template from anything but the
human admin verb (`0069:121`), `statutory_wording` has zero seeded rows, and fixed-layout boxed-form
rendering is unbuilt — the Typst engine carries a chart/line AST only (survey §3.3). Attempting a
pixel replica in v1 would mean either building a form renderer or faking one. **(D-8.)**

**[RULED 2026-08-23 — OQ-5 → the PACK, and the form version is PINNED.]** The pack is the shipped
shape; the human e-files. The ruling adds one requirement the design did not carry: **the pack maps
to the form's own field ids and pins the form version it was mapped against.** So the pack's
definition is `(form_code, form_version, field_id, label, value_cell_id, whole_ringgit boolean)` —
`form_version` being LHDN's own edition marker for that YA's form, recorded at mapping time with its
source URL and fetch date in `tax_authorities`. Three things follow. **(a)** A pack rendered against
a superseded form version is a **named refusal**, `form_version_superseded`, not a silent
mismatch — a field id that moved between editions is exactly how a correct number lands in the wrong
box. **(b)** The per-field whole-ringgit truncation rule (annexes A.2, D-14) is a property of the
*mapped version*, not a global convention. **(c)** The field map is itself statutory content, so it is
published by the human admin verb alongside the template, and re-mapping a new edition is a human act
with a diff. **(D-8 extended.)**

**(3) The transparent-entity worksheet.** For `entity_type ∈ {sole_prop, partnership}` there is **no
entity tax charge and no CP204** — the entity is transparent, and the computation stops at adjusted
and statutory income, which the worksheet hands to the proprietor's Form B or the partners' shares
via Form P. R9-R12 **refuse by name** (`entity_transparent_no_entity_charge`) rather than compute
zero. Zero is a number and it is wrong; a refusal is correct. This re-earns a guard the frozen build
already had (`docs/audit/01-findings-report.md:1408`). **(D-9.)** BEE CREATIVE SOLUTION is the live
case (survey §5.5).

**Personal reliefs are out of scope by nature.** An individual's chargeable income is total income
less s.46-49 reliefs, which are facts about a person's household, not about the books. F-T3 computes
to statutory/total income and stops. The Form B pack carries the business-source figures only.

**The wall.** The terminal state is `issued` with `issue_mode` naming a human, and **F-T3 builds no
verb that transmits anything to LHDN.** Digest law 82 makes the delegate grant explicit on this
point: e-filing is *excluded by nature*, not merely reserved. The battery proves the wall positively
(§10 C13) — by showing the pack's only egress is a human-initiated artifact retrieval — never by the
absence of a submit function, because absence is not evidence.

---

## 9 · Three-valued evaluation and the refusal vocabulary

Every rung returns `ok` | `refused` | `not_evaluable`, mapped onto the live
`metric_cells.cell_status ∈ ('ok','undefined','absent','refused')`: `not_evaluable` → `undefined`
where the inputs exist but the rule cannot decide, and → `absent` where a required input row does
not exist. **[PREDICTION — the mapping is asserted from `0058:239-263` source, and PR-0's replay
confirms the live CHECK domain.]**

**Fail-closed on the missing, the malformed and the unknown.** A rung's own evaluation never raises
out of the ladder — it returns a status and a named reason, and the ladder continues so the human
sees *everything* that is wrong at once rather than one error at a time. A downstream rung whose
input is `not_evaluable` is itself `not_evaluable` (the cascade in §5 is the intended behaviour).

The refusal vocabulary, each string printable and each one a battery cell:

`close_not_sealed` · `basis_period_undetermined` · `account_untreated` · `treatment_unapproved` ·
`treatment_code_unsigned` · `rate_row_missing_for_ya` · `ca_class_unassigned` ·
`disposal_proceeds_unavailable` · `sme_facts_missing` · `entity_transparent_no_entity_charge` ·
`prior_estimate_unknown` · `citation_missing` · `mixed_account_needs_split` ·
`form_version_superseded` (§8, added by the OQ-5 ruling).

**`account_untreated` is the important one.** An account with a non-zero sealed balance and no
approved treatment makes the computation `not_evaluable` and names the account. **An untreated
account is never silently allowable.** That is the difference between a tool that helps and a tool
that quietly under-declares.

**Mixed accounts.** v1 treats at **account level only**. An account Clara believes carries two
treatments (a motor-expenses account holding both commercial fuel and private petrol) yields
`mixed_account_needs_split` and a coding proposal to split it — pushing the fix upstream into the
books, where the system of record is. A per-entry override is PR-6 work and is code-only and
human-approved on the same shape as §2. **(D-10.)**

---

## 10 · Walls, and the cells that prove them

Behavioural cells: each makes a wall **refuse**. No cell asserts on source text (spelling is not
identity), none swallows a premise, and each forced cell asserts its precondition or exits by a
named, counted `skipHere`.

| # | Wall | Differential cell |
|---|---|---|
| C1 | no active close receipt ⇒ no computation | seal a close → computes; set `status<>'active'` → `close_not_sealed` |
| C2 | Clara cannot write a numeral | attempt an insert into `tax_account_treatments` with a fraction → **no such column**; attempt `apportionment_bp` without `approved_by` → CHECK refuses |
| C3 | an unsigned treatment code is unusable | reference a code with `owner_signed_by IS NULL` → `treatment_code_unsigned`; sign it → computes |
| C4 | an untreated account is not allowable | leave one non-zero account untreated → `account_untreated` naming it; treat it → computes |
| C5 | a missing rate row refuses, never carries forward | delete the YA row → `rate_row_missing_for_ya`; restore → computes. Also assert the **previous** year's row present does **not** rescue it |
| C6 | SME `not_evaluable` refuses, does not default to 24% | remove the paid-up fact → `sme_facts_missing`; assert the charge is **not** 24% and **not** any number |
| C7 | a proven disqualification is decisive over a missing fact | set foreign holding 25% **and** remove the gross-income fact → `not_eligible` (24%), not `not_evaluable` |
| C8 | depreciation and CA are not the same read | change `fa_depreciation` only → R2 moves, R5 does not; change an asset's `ca_class` only → R5 moves, R2 does not |
| C9 | the MV QE cap bites both ways | new car, cost 140,000 → QE 100,000; same car `is_new=false` → QE 50,000; commercial van 200,000 → QE 200,000 |
| C10 | the SVA cap cascade is real | MSMC-eligible → no cap; flip C5 to fail → cap applies at RM20,000; make C2 unknown → **`not_evaluable`, not the capped figure** |
| C11 | a transparent entity gets no entity charge | `entity_type='sole_prop'` → `entity_transparent_no_entity_charge`; assert the charge cell is **not** `0` |
| C12 | evaluator freeze holds | add a member without a migration → `verify_evaluator_freeze()` fails the migration run |
| C13 | the pack's only egress is human | enumerate the run's terminal transitions and assert the `issued` transition's actor is a human principal and `issue_mode` names them; assert the wake allowlist contains no member of the pack's egress set (**positively**, by enumerating the allowlist, not by grepping for a name) |
| C14 | a citation is structurally present | every `report_dataset_point` whose treatment is `direction='add_back'` resolves to ≥1 `tax_authorities` row; break the FK → the seal refuses |

**Judgement logic, and therefore review law 1.** PR-2 (the SME predicate), PR-4 (the treatment
proposal and its approval door) and PR-5 (the ladder's refusal branches) all decide *whether*
something is allowed. Each gets an independent review pass. PR-4 additionally gets a **cross-model
adversarial pass**: it is the model's only entrance into a statutory document, and it is an
injection surface (a supplier invoice's description text is an input to Clara's classification
reasoning).

---

## 11 · The PR ladder

| PR | Content | Judgement? | D1 window |
|---|---|---|---|
| **PR-0** | gate record; rig replay at the frontier; the `prosrc`-SHA prestate pins; discharge the survey's [PREDICTION] tags; the shared-surface note to `conductor` (Tier-1 family, `client_fact_keys`, `evaluator_versions`) | — | — |
| **PR-1** | `tax_authorities` · `tax_treatment_codes` · `tax_rate_bands` · `capital_allowance_rates` · `tax_thresholds`, all **developer-seeded** per R-L25 (**no governed door is built** — that limb is dropped, not deferred, on the D17/R-L19 precedent); `valid_through` on every row; the owner-signature requirement on treatment codes; the seeded law from survey §6.2, the ICT row deliberately absent | **yes** (the refusal branches: missing row, superseded row, unsigned code) | no |
| **PR-2** | new `client_fact_keys`; the basis-period model (D-1); `sme_rate_eligibility_v1` | **yes** | no |
| **PR-3** | `disposal_value_cents` on `fixed_assets` + the `dispose_fixed_asset` body replacement; `ca_asset_years` + the CA evaluator | partial | **yes** (one live writer) |
| **PR-4** | `tax_account_treatments`; Clara's proposal verb; the human one-click approve door; the citation binding | **yes** + cross-model | no |
| **PR-5** | the ladder evaluator R1-R10 as one `evaluator_version`; the refusal vocabulary | **yes** | no |
| **PR-6** | `cp204_filings`; R11-R12; the per-entry treatment override | partial | no |
| **PR-7** | the report definitions; the statutory-class template publication (a **human** act); the field packs **with `form_version` pinned** + the `form_version_superseded` refusal; the `report_run` wiring | partial | rides F-A5's |
| **PR-8** | the `law_review_due` belt (§4.6) — a consumer of F-A4's clock, idempotent per row per horizon, resolving only by a seeded successor | partial | no |

**PR-3's D1 window** is F-T3's only one and it is small (one verb body). It must **not** be merged
into F-A4/F-A5's `finalize_close` window — different body, different lane, and combining them widens
a quiesce for no gain. The conductor owns the ordering.

**PR-8 depends on F-A4's clock**, so it lands after F-A4 whatever else moves. It is the one PR that
may ship late without holding the rest: until it exists, a rate expiry is discovered by a refusal
instead of announced by a question — worse, but not wrong.

---

## 12 · Sequencing — and the two things that gate the build

**Hard, from the survey §7:** F-A5 PR-1 (the seal→render closure, gap S9) and F-A4 (a real
`close_receipts` row — the chain has never run). F-T3's evaluators can be *authored* against a
rig-seeded close, but F-T3 cannot be *accepted* until a real one exists.

**One item was open and is now closed; one remains.**

1. ~~**The Tier-1 closure collides with the ALL-IN ruling.**~~ **RULED 2026-08-23 (R-L25):** the
   closure re-opens for `tax_rate_bands` + `capital_allowance_rates`, and they land as
   **developer-seeded** versioned effective-dated fact tables on the D17/R-L19 pattern — **not** a
   second governed-row door, so law 81 is satisfied by having one seeding architecture rather than
   two. The contract carries the amendment as `wave-f-contract.md`'s `[TB-2026-08-23]` block. **PR-1
   is unblocked on this axis** and no longer builds an approval door.
2. **There is no acceptance oracle in the corpus** (survey §5, F2) — **OQ-1**, an owner-sitting card.
   It does not block authoring; it blocks *accepting*.

---

## 13 · Explicitly not in v1, each with its reason

| Not built | Why |
|---|---|
| **s.6D rebate** (new MSMC, up to RM20,000/YA for 3 YAs — PR 8/2025 §6.5) | needs the incorporation date, an "operating expenditure" definition and a three-YA window; mis-claiming it carries a penalty. Wants its own design pass. |
| **ICT accelerated CA** (IA 40% / AA 20%) | the gazette (P.U.(A) 328/2024) could not be read at an official source on 2026-08-23, so there is no citable official row to seed (survey §6.3 U1). R-L25 names this posture as the model: **the row is absent and the class refuses**, rather than landing on professional-firm secondaries. It seeds the day the gazette is readable. |
| Group relief (s.44A), carry-back (s.44B) | multi-entity; no consumer in the estate |
| Incentives — pioneer status, ITA, reinvestment allowance | each is its own regime and its own ruling |
| Transfer pricing, s.140C interest limitation, CbCR | out of the firm's client profile |
| **The tax provision posting** into the close | the *confirmed* figure feeds a provision, but posting it needs a close reopen — F-A4's window, not F-T3's |
| Personal reliefs (s.46-49) | facts about a household, not about the books (§8) |
| CP500 / CP502 (individual instalments) | not fetched from an official source today (survey §6.3 U6) |
| A pixel replica of any LHDN form | the renderer is unbuilt and the wording is owner-signed (§8, D-8) |
| Any submission verb | law, not scope: e-filing is human, excluded by nature (digest laws 71, 74, 80, 82) |
