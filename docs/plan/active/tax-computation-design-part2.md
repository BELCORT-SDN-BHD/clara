# F-T3 — the draft tax computation: design, part 2 (v2, gate-folded 2026-08-23)

> **Part 2 of 2 — §8-§13.** Part 1 (`tax-computation-design.md`) carries the header, the change log,
> §1-§7: the severance, the ladder, the verb set, the new surfaces, the CA schedule, the SME predicate
> and CP204. Mechanics — the wrapper table, the surface DDL, tenancy/RLS, the disposal machinery, the
> belt and the behavioural battery — are in `tax-computation-annexes-2-mechanics.md`. Decisions,
> predictions and the question register are in `tax-computation-annexes.md`.
>
> **The two files are one design of record.** The split happened at v2 to keep each inside the
> 500-line budget; nothing was dropped in the move.

---

## 8 · The artifacts, and where the human wall stands

Three, all `report_runs` instances (`0065:369-401`) of new report definitions — which already carry
`firm_id` and forced RLS, so the artifacts ride governed infrastructure and only the field-pack **map**
is a new relation (mechanics §M4).

**(1) The computation statement.** Statement-shaped, one `report_dataset_point` per rung, each add-back
line carrying its treatment code, its statutory reference and its `tax_authorities` citation. This is
the document a Malaysian firm actually attaches and a tax agent actually reviews. The primary
deliverable.

**(2) The field-value packs** — `form_c`, `form_pt`, `form_b`, `form_p`, `cp204`. A field-code → value
table, so a human keys MyTax without re-deriving anything. **Not a replica of the LHDN form**:
`publish_report_template_version` refuses a `report_class='statutory'` template from anything but the
human admin verb (`0069:121`), `statutory_wording` has zero seeded rows, and fixed-layout boxed-form
rendering is unbuilt — the Typst engine carries a chart/line AST only (survey §3.3). A pixel replica in
v1 would mean either building a form renderer or faking one. **(D-8.)**

**[RULED 2026-08-23 — OQ-5 → the PACK, and the form version is PINNED.]** The pack is the shipped
shape; the human e-files. The ruling adds one requirement the design did not carry: **the pack maps to
the form's own field ids and pins the form version it was mapped against** — `form_version` being
LHDN's own edition marker for that YA's form, recorded at mapping time with its source URL and fetch
date in `tax_authorities`. Three things follow. **(a)** A pack rendered against a superseded form
version is a **named refusal**, `form_version_superseded`, not a silent mismatch — a field id that moved
between editions is exactly how a correct number lands in the wrong box. **(b)** The per-field
whole-ringgit truncation rule (A.2, D-14) is a property of the *mapped version*, not a global
convention. **(c)** The field map is itself statutory content, so it is published by the human admin
verb `publish_tax_form_field_map` alongside the template, and re-mapping a new edition is a human act
with a diff. **(D-8 extended.)**

**The client's own TIN and SSM number on the pack are read from `clara.client_identifiers`**, not from
any F-T3 surface (part 1 §4.1, **D-22**); no `kind='tin'` row ⇒ **`entity_identifier_missing`**, never
a blank field. This matters more here than anywhere else in the design: the pack is the one artifact a
human transcribes character-for-character into MyTax, so a TIN that disagrees with the one the firm's
own document-attribution wall treats as ground truth (`filing-and-interview-design.md:163`) is a wrong
return, not an inconsistency.

**(3) The transparent-entity worksheet.** For `entity_type ∈ {sole_prop, partnership}` there is **no
entity tax charge and no CP204** — the entity is transparent, and the computation stops at adjusted and
statutory income, which the worksheet hands to the proprietor's Form B or the partners' shares via Form
P. R9-R12 **refuse by name** (`entity_transparent_no_entity_charge`) rather than compute zero. Zero is a
number and it is wrong; a refusal is correct. This re-earns a guard the frozen build already had
(`docs/audit/01-findings-report.md:1408`). **(D-9.)** BEE CREATIVE SOLUTION is the live case (survey
§5.5).

**Personal reliefs are out of scope by nature** — an individual's chargeable income is total income less
s.46-49 reliefs, facts about a household rather than the books. F-T3 stops at statutory/total income;
the Form B pack carries the business-source figures only.

**The wall.** The terminal state is `issued` with `issue_mode` naming a human, and **F-T3 builds no verb
that transmits anything to LHDN** (law 82: e-filing is *excluded by nature*, not merely reserved). The
battery proves this **positively** — by enumerating `wake_fn_allowlist` and asserting the pack's egress
set is not in it — never by the absence of a submit function, because absence is not evidence.

---

## 9 · Three-valued evaluation and the refusal vocabulary

Every rung returns `ok` | `refused` | `not_evaluable`, mapped onto the live
`metric_cells.cell_status ∈ ('ok','undefined','absent','refused')` (`0058:245`, source-read and
confirmed at the bytes by the gate): `not_evaluable` → `undefined` where the inputs exist but the rule
cannot decide, → `absent` where a required input row does not exist.

**Every refusal string needs a registered reason row, not only a cell** *(gate material; the design
never carried this)*. `0058:261-262` makes it a hard CHECK: a `metric_cell` whose `cell_status <> 'ok'`
**must** carry a `na_reason_version_id`, with exact numerator/denominator/scale/text all NULL, and
`t_scope_cell_na_reason` enforces firm-scope congruence on it. So **PR-1 seeds one
`metric_na_reason_versions` row per string below** — `reason_key`, `version`, the `cell_status` it maps
to, a `display_token` and its `semantics` — and a string with no reason row cannot be persisted at all,
only raised. The vocabulary is closed twice over: by this list, and by that catalog.

**Fail-closed on the missing, the malformed and the unknown.** A rung never raises out of the ladder —
it returns a status and a named reason and the ladder continues, so the human sees *everything* wrong at
once rather than one error at a time. A downstream rung whose input is `not_evaluable` is itself
`not_evaluable` (part 1 §5's cascade is intended).

The vocabulary — **twenty-one strings, each printable, each with a battery cell (§10) and each with a seeded
`metric_na_reason_versions` row**:

| Refusal | Fires when | Maps to |
|---|---|---|
| `close_not_sealed` | no active `close_receipts` row for the named fiscal year | `absent` |
| `basis_period_undetermined` | no `tax_basis_periods` row for the YA being read (including `ya_target` at R11) | `absent` |
| **`basis_period_not_coextensive_with_close`** | the asserted period is not exactly the sealed fiscal year's span | `undefined` |
| `account_untreated` | a non-zero `pl_rows` account has no approved treatment | `undefined` |
| `treatment_unapproved` | a proposal exists but `approved_by` is null | `undefined` |
| `treatment_code_unsigned` | the referenced code has `owner_signed_by IS NULL` | `undefined` |
| **`treatment_on_non_pl_account`** | a treatment names an account whose `account_type` is not income/expense | `undefined` |
| `rate_row_missing_for_ya` | no seeded band, CA rate or threshold row covers the YA (incl. the ICT class and `sva_annual_cap`) | `absent` |
| `ca_class_unassigned` | an asset in the register carries no `ca_class` | `absent` |
| **`disposal_value_not_established`** | a disposal has no human-keyed statutory disposal value and basis | `absent` |
| `sme_facts_missing` | an SME condition's as-at attribute has no row at or before the basis-period start | `absent` |
| **`business_source_count_unknown`** | `business_source_count` is not recorded | `absent` |
| **`multiple_business_sources_unmodelled`** | it is recorded and greater than one | `undefined` |
| **`losses_brought_forward_unknown`** | no `tax_carryforwards` row for the kind and YA — not even a nil assertion | `absent` |
| **`loss_relief_rules_unread`** | a non-nil carry exists while PR 1/2022 (U5) is unseeded | `undefined` |
| `entity_transparent_no_entity_charge` | `entity_type ∈ {sole_prop, partnership}` at R9-R12 | `refused` |
| `prior_estimate_unknown` | no `cp204_filings` row for `p_ya` when the 85% floor is computed | `absent` |
| `citation_missing` | a dataset point's add-back treatment resolves to zero `tax_authorities` rows | `refused` |
| **`entity_identifier_missing`** | the pack needs a TIN/SSM and `client_identifiers` has no row | `absent` |
| `mixed_account_needs_split` | Clara believes one account carries two treatments and no entry override exists | `undefined` |
| `form_version_superseded` | the pack's pinned `form_version` is no longer the published edition | `refused` |

*(Bold = minted or re-cut by the gate fold. `disposal_proceeds_unavailable` is **retired**: it named an
absence, and the failure it was written for is a present-but-wrong substitution — part 1 §5.)*

**`account_untreated` is the important one, and it now enumerates the right set.** The census runs over
**`snapshot->'pl_rows'`**, every row of which is non-zero by the receipt's own `mv <> 0` filter: an
income or expense account in that array with no approved treatment makes the computation `not_evaluable`
and names the account. v1.2 pointed it at `closing_position`, which holds asset/liability/equity
accounts only — so the wall that exists to stop an untreated expense being silently allowable would
never have fired on an expense account at all. **An untreated account is never silently allowable.** That
is the difference between a tool that helps and a tool that quietly under-declares.

**A treatment must name a P&L account.** `tax_account_treatments` keys on `account_id`; the join to
`pl_rows` goes through `coa_accounts` on `(client_id, account_code)`. A treatment whose account resolves
to `account_type not in ('income','expense')` yields **`treatment_on_non_pl_account`** — the
disambiguation that keeps "absent because the movement was nil" (a legitimate zero line) apart from
"absent because the design read the wrong key" (the defect this fold closes).

**Mixed accounts.** v1 treats at **account level** by default. An account Clara believes carries two
treatments (a motor-expenses account holding both commercial fuel and private petrol) yields
`mixed_account_needs_split` and a coding proposal to split it — pushing the fix upstream into the books,
where the system of record is. The per-entry override (`tax_entry_treatments`, part 1 §4.3) is the
exceptional line's escape, and it lands in PR-4 **before** the member is frozen, not after. **(D-10.)**

---

## 10 · Walls, and the cells that prove them

**The battery is mechanics §M6** — thirty-five behavioural cells, one per refusal string plus the
structural walls. Its rules are unchanged: each cell makes a wall **refuse**; no cell asserts on source
text (spelling is not identity); none swallows a premise; and each forced cell asserts its precondition
or exits by a named, counted `skipHere`. **Every refusal string in §9 has a row there** — v1.2 promised
"each one a battery cell" and covered seven of fourteen, which is the shape law 31 warns about, and the
gate found the other seven unproven.

The cells the fold added that a reader should know exist without opening the annex:

- **C2b** attacks the human-keyed wall with the **machine principal** rather than with NULL — the
  adversary the v1 cell never exercised.
- **C4b** proves the ladder reads `pl_rows` and not `closing_position`, **differentially, in one sealed
  receipt**: the treated account is present in one key and absent from the other.
- **C5b** moves an exempt-income line and asserts adjusted income **falls**, then flips the account to a
  contra balance and asserts the sign follows `account_type`, not `direction`.
- **C10, C10b, C10c** prove the carry-forward store's three states (absent / nil-asserted / non-nil
  while unread), the s.43(2) floor against non-business income, and the s.44(6) cap's base.
- **C13b, C13c** prove the statutory disposal value bites where proceeds are below market, and that the
  disposal write survives the immutability guard end to end.
- **C15b** calls the frozen member on a client with **no data of any kind** and asserts a full refusal
  rowset comes back — no `relation … does not exist`, and no rung raising out of the ladder.
- **C21** asserts every refusal string is **persistable**: a seeded `metric_na_reason_versions` row
  exists for each, and a string without one cannot reach a cell.

**Judgement logic, and therefore review law 1.** PR-2, PR-4, PR-5 and PR-6 each decide *whether*
something is allowed, so each gets an independent review pass. **PR-4 additionally gets a cross-model
adversarial pass** — it is the model's only entrance into a statutory document and an injection surface
(a supplier invoice's description text feeds Clara's classification reasoning) — and that pass is now
discharge-able, because part 1 §3.1 finally names the entrance it is meant to attack.

---

## 11 · The PR ladder

**The ordering law, minted by the gate:** the frozen member is the **last DDL-dependent PR**, and its §0
carries a **closed census of every relation its body names**, each with the PR that creates it — because
`create function` does not validate referenced relations and the body is frozen the moment its
`evaluator_versions` row lands. The census: `close_receipts` · `fiscal_years` · `coa_accounts` ·
`fixed_assets` · `client_facts` · `client_identifiers` · `tax_authorities` · `tax_treatment_codes` ·
`tax_rate_bands` · `capital_allowance_rates` · `tax_thresholds` · `tax_basis_periods` ·
`client_tax_attributes` · `tax_account_treatments` · `tax_entry_treatments` · `ca_asset_years` ·
`cp204_filings` · `tax_carryforwards`. **Eighteen relations; PR-6 is the only PR after all of them.**

| PR | Content | Judgement? | D1 window |
|---|---|---|---|
| **PR-0** | gate record; rig replay at the frontier; the `prosrc`-SHA prestate pins for **all three** PR-3 bodies; discharge Annex C's predictions; the shared-surface note to `conductor` (Tier-1 family, `evaluator_versions`, `fixed_assets`) | — | — |
| **PR-1** | the five law tables, all **developer-seeded** per R-L25 (**no governed door is built**); `valid_through` on every row; the owner-signature requirement on treatment codes; the seeded law from survey §6.2, the ICT row and the `sva_annual_cap` row deliberately absent; **the twenty-one `metric_na_reason_versions` rows** (§9); the platform-scoped RLS shape | **yes** (missing row, superseded row, unsigned code) | no |
| **PR-2** | `tax_basis_periods` (D-1) · `client_tax_attributes` + `record_client_tax_attribute`; the client-scoped RLS shape and composite tenant FKs. **No `client_fact_keys` seed block and no `record_client_fact` call** | **yes** | no |
| **PR-3** | `disposal_value_cents` + `disposal_value_basis` on `fixed_assets`; `uq_fa_id_tenant`; the `dispose_fixed_asset` signature + body replacement (`0041:3643`); the `_fa_on_approve` body replacement (`0041:2227`); the `_tf_fixed_assets_immutable_0017` allowlist splice; `ca_asset_years` | partial | **yes** (three live bodies) |
| **PR-4** | `tax_account_treatments` + `tax_entry_treatments`; `_tf_tax_treatment_human_only`; `wake_propose_tax_treatment` + core + allowlist row; `approve_tax_treatment` (the human door, `is_agent`-excluding); the citation binding | **yes** + cross-model | no |
| **PR-5** | `cp204_filings` + `record_cp204_filing`; `tax_carryforwards` + `record_tax_carryforward` — **the last table PR**, moved ahead of the member so nothing the frozen body reads is created after it | **yes** | no |
| **PR-6** | **`evaluate_tax_computation_v1` — the ONE registered member**, the `evaluator_version` row, the relation census above, `wake_run_tax_computation` + core + allowlist row (the run wrapper materialises cells, `ca_asset_years` and the carry-out rows), the refusal vocabulary | **yes** | no |
| **PR-7** | the report definitions; the statutory-class template publication (a **human** act); the field-pack map + `publish_tax_form_field_map` **with `form_version` pinned** + `form_version_superseded`; the `report_run` wiring | partial | rides F-A5's |
| **PR-8** | the `law_review_due` belt — `wake_raise_law_review_due` on `proactive` + its allowlist row, a consumer of F-A4's clock, idempotent per row per horizon, resolving only by a seeded successor | partial | no |
| **PR-9** | **NEW, minted by 裁-44 (2026-08-30) — the `tax_prep` WAKE: the agentic half.** The wake body (shaped on `close_prep`), its `wake_engine_sources` row shipped `enabled=false`, the allowlist rows, and the **tax-draft card** in the needs-you inbox. After a close seals, Clara drafts R1–R10 + the CP204 estimate **unasked**, every rung carrying its statutory citation and her explanation, and **proposes** each account's treatment through PR-4's existing `wake_propose_tax_treatment` — **a human still signs** (裁-38). The SST-02 drafts when the taxable period closes; CP204 due-date reminders go proactive. **The computation layer is untouched**, and 裁-33's draft-only wall is unmoved. The source is the **fourth switch opened at the G1 rollout ceremony** with `bank_agent`, `close_prep` and the binding-expiry sweep (裁-40 as amended), **after this body is built and reviewed** | **yes** | no |

**Why PR-9 is last and not first.** It adds no relation the frozen member reads, so it cannot move
the ordering law above; and it cannot draft a computation before PR-6 registers the member that
computes one. It is the lane's **posture**, added once the lane's arithmetic exists.

**What moved, and why it is not cosmetic.** v1.2 put `cp204_filings` in PR-6 *after* the member in PR-5,
and the per-entry override there too. Both are read by the frozen body. The reorder is the whole fix:
the member cannot be registered until every relation it names exists, and it cannot be edited once it
is.

---

## 12 · Sequencing and merge order — [CONFIRMED 2026-08-23, conductor]

**Merge order, on the train.** **F-A8 PR-1 (train position 13) → F-T1's SST tables → F-T3 PR-1.** F-T3
adds siblings to the seeded-law family and races nobody. Caveat carried from the conductor: **F-T1 has
no train positions yet** — Track B has no PR list, so "after F-T1's SST tables" is an ordering *intent*,
not a scheduled slot. If F-A8/PR-1 rewrites a shared Tier-1 DDL idiom or a common supersede trigger,
F-T3 follows it — **re-derived against merged `main`, never against its design text**.

**Two shared surfaces, both narrower than v1.2 assumed.** F-T3 no longer touches `client_fact_keys` or
`record_client_fact` at all, so the collision with F-A3/F-A7/F-A8's seed blocks is **gone** — one fewer
merge hazard, and one fewer reason for those lanes to coordinate with this one. What F-T3 does share is
`clara.fixed_assets` (PR-3) and `evaluator_versions` (PR-6), and PR-0's note names both.

**The evaluator freeze roster: F-T3 is LAST and it appends.** Live claimants in merge order are **F-A5
PR-2 + the C-flip ceremony → F-A8 PR-1 → F-T3**. **F-A9 is NOT a claimant** — a v1.1 note said it "mints
the spend evaluator"; that was wrong. Its `llm_usage_events_priced` is a **VIEW**: no `prosrc`,
invisible to `verify_evaluator_freeze`, unmatched by the lint's `clara.evaluate_*` regex, no registry
row, no ceremony act.

**Hard gates, unchanged (survey §7).** **F-A5 PR-1** (the seal→render closure, gap S9) and **F-A4** (a
real `close_receipts` row — **F-A4/PR-1a is train position 3**). F-T3's evaluator can be *authored*
against a rig-seeded close but cannot be *accepted* until a real one exists. **PR-8 waits on F-A4's
clock spine (Window B, later)** and is the one PR that may ship late without holding the rest: until it
exists a rate expiry is found by a refusal instead of announced by a question — worse, but not wrong.

**PR-3's D1 window** is F-T3's only one, and it now covers **three** bodies rather than one — the
disposal verb, the approve-time register writer and the immutability trigger. It stays **separate** from
F-A4/F-A5's `finalize_close` window (agreed by the conductor: different bodies, different lane,
combining widens a quiesce for no gain). It is a *future* window — Track B is outside the current W1-W5
inventory. **Its §0 inventory is now correct in a way v1.2's was not**: v1.2 pinned the prestate SHA to
`dispose_fixed_asset`, a body that never writes the register row, and scoped the quiesce to a surface
the disposal does not touch.

**Two research gates the fold added, both fail-closed and neither blocking authoring.** **U5** (PR
1/2022, loss relief) gates the R7/R8 set-off arithmetic — `loss_relief_rules_unread` until it is read.
**U2** (PR 3/2021, small value assets) gates the `sva_annual_cap` threshold row —
`rate_row_missing_for_ya` until it is read. Both are R-L25's posture, not new machinery.

**Still open:** no acceptance oracle in the corpus (survey §5, F2) — **OQ-1**, a sitting card. It does
not block authoring; it blocks *accepting*. The gate sharpened why: every battery cell can pass while
the bottom line is wrong, and the fold's own R7/R8 re-cut is exactly the class of error only a
hand-worked ladder catches. **OQ-2, OQ-3, OQ-7, OQ-8's governance half and OQ-9 stand unchanged** — the
fold decided no owner question and closed none.

---

## 13 · Explicitly not in v1, each with its reason

| Not built | Why |
|---|---|
| **A basis period that is not the sealed fiscal year** — the >12-month first period apportioned across two YAs, a change of accounting date, a cessation short period | s.21A(3)-(7) turns on a DGIR direction Clara cannot see, and `close_receipts` seals one whole fiscal year per row. It refuses by name (`basis_period_not_coextensive_with_close`) rather than scaling a figure. A human-keyed apportioned base is its own design pass. |
| **More than one business source** | no input in the estate carries a source dimension (part 1 §3.2), so ring-fencing capital allowances and the per-source nil floor cannot be expressed. It refuses by name rather than collapsing silently. |
| **The loss and unabsorbed-CA set-off arithmetic**, until PR 1/2022 is read at an official source | survey U5. The *store* and the *refusals* ship (part 1 §4.2); the arithmetic waits, and a non-nil carry refuses with `loss_relief_rules_unread`. |
| **A taxpayer election on SVA ordering** | v1 pins descending qualifying expenditure (part 1 §5) so the number is reproducible; an election is a human act with no door in v1. |
| **s.6D rebate** (new MSMC, ≤RM20,000/YA × 3 YAs — PR 8/2025 §6.5) | needs the incorporation date, an "operating expenditure" definition and a three-YA window; mis-claiming carries a penalty. Its own design pass. |
| **ICT accelerated CA** (IA 40% / AA 20%) | the gazette (P.U.(A) 328/2024) was unreadable at an official source on 2026-08-23, so there is no citable row to seed (survey §6.3 U1). **R-L25 names this the model: the row is absent and the class refuses.** It seeds the day the gazette is readable. |
| Group relief (s.44A), carry-back (s.44B) · incentives (pioneer, ITA, RA) · transfer pricing, s.140C, CbCR | multi-entity, or each its own regime and its own ruling; no consumer in the estate |
| **The tax provision posting** into the close | the *confirmed* figure feeds a provision, but posting needs a close reopen — F-A4's window, not F-T3's (OQ-9) |
| Personal reliefs (s.46-49) · CP500 / CP502 | a household's facts, not the books' (§8); and CP500 was not fetched from an official source (survey §6.3 U6) |
| A pixel replica of any LHDN form | the renderer is unbuilt and the wording is owner-signed (§8, D-8) |
| Any submission verb | law, not scope: e-filing is human, excluded by nature (laws 71, 74, 80, 82) |
