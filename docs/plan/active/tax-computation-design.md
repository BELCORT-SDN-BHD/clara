# F-T3 — the draft tax computation: design (v2, gate-folded 2026-08-23)

> **Design of record for Wave-F Track-B item F-T3 — part 1 of 2 (§1-§7).**
> **`tax-computation-design-part2.md` carries §8-§13** (artifacts, the refusal vocabulary, the
> battery, the PR ladder, sequencing, scope). Reads on `tax-computation-survey.md`,
> `tax-computation-annexes.md` (decision register D-1..D-26, predictions, question register) and
> **`tax-computation-annexes-2-mechanics.md`** (the verb set, the surface DDL, tenancy/RLS, the
> disposal mechanics and the behavioural battery). **The split and the annex move happened at v2 to
> keep each file inside the 500-line budget; nothing was dropped in either move.**
> Contract: `wave-f-contract.md:406-408`. Owner ruling 2026-08-23: **ALL-IN in Wave F**.
>
> **v2, 2026-08-23 — the PR-0 gate fold.** The gate confirmed **11 blockers, 11 materials and one
> nit** against v1.2 and refuted nine. Every one is folded; the record, with a fold disposition per
> finding, is `tax-computation-gate-record.md`. The ten that changed a mechanism:
>
> | What was wrong in v1.2 | Where it is fixed |
> |---|---|
> | The ladder read `closing_position`, which is **balance-sheet-only**; the per-account P&L movement is `snapshot->'pl_rows'`, and the sign rule was never stated | §3, A.2 (**D-18**) |
> | The **two loss deductions were in each other's rung** and the s.44(6) cap sat on the wrong base | §3 R7/R8 (**D-19**) |
> | The **carry-forward inputs did not exist** anywhere in the estate; the ladder deducted zero silently | §4.2 (**D-19**) |
> | `record_client_fact` **cannot carry F-T3's facts** — no valid time, a fail-closed dispatch, CLR04 in a migration — and `tin`/`ssm` already have a governed home | §4.1 (**D-21, D-22**) |
> | A basis period diverging from the sealed fiscal year computed anyway | §3 R1 (**D-23**) |
> | The **human-keyed guarantee was a NOT-NULL check the agent satisfies** | §2 (**D-24**) |
> | **No wake door** for any of the three agent writes | §3.1 (**D-25**) |
> | The disposal value is **not** the accounting proceeds; the FA immutability allowlist excludes the new column; the disposal verb does not write the register row | §5, mechanics §M3 (**D-7 re-cut, D-26**) |
> | The frozen evaluator read tables created in a **later** PR | part 2 §11 |
> | Ten new relations with **no tenancy or RLS shape**, and every refusal string missing its `metric_na_reason_versions` row | mechanics §M4, part 2 §9 |
>
> **Carried forward unchanged where the fold did not touch them:** §3's ONE evaluator member (D-16) ·
> the name-only-wall scoping obligation, re-homed onto F-T3's own attribute catalog (D-17) ·
> OQ-6 → R-L25 · OQ-4 → REFUSE · OQ-5 → the pinned-version PACK · OQ-8's product half.
>
> **Design-stage only. No code authored, no rig run.** Every DB cite is source-read; replay is PR-0's.

---

## 1 · The shape, in one paragraph

A Malaysian tax computation is a ladder from a sealed accounting profit to a tax charge. Every rung is
arithmetic over DB-owned inputs and therefore belongs to a versioned deterministic evaluator — hard
constraint 2, and there is no second way to make a number in this estate (survey §3.1). Exactly one
thing is *not* arithmetic: deciding **which treatment a line of the books attracts** — is this
entertainment, is it private, is it capital. That decision is Clara's, it is cited, and a human
approves it in one click. The design's whole job is to make the two halves **structurally unable to
touch**: Clara picks a *label from a closed set*, the DB owns every *numeral*, and the model has no
column to type a number into. The output is a sealed computation statement plus a field-addressed pack
a human keys into MyTax. **F-T3 builds no submission verb of any kind** (laws 71, 74, 80, 82 —
e-filing is human, excluded by nature even from the delegate grant).

---

## 2 · The severance — the one structural idea

The failure this design exists to prevent is a model-authored numeral reaching a document a human signs
and files. Prompt discipline cannot prevent it; a schema can.

**Clara's only write into the computation is a `code`.** The treatment codes are a migration-seeded,
owner-signed, closed set. Each code carries its own fraction and its own statutory citation. Clara's
proposal row has **no numeric column at all** — there is nothing to type.

```
tax_treatment_codes        (migration-seeded, immutable + supersede, OWNER-SIGNED)
  code pk 'ADDBACK_ENTERTAINMENT_50' · direction add_back|deduct|allowable|exclude
  fraction_bp int          10000 = 100%, 5000 = 50%, 0 = nil     <-- the DB owns this
  regime · statutory_ref 's.39(1)(l) ITA 1967' · effective_ya_from/to
  authority_id -> tax_authorities                                <-- the citation
  owner_signed_by/at NOT NULL                                    <-- unsigned = unusable

tax_account_treatments     (Clara PROPOSES, a human APPROVES)
  client_id, firm_id, account_id, ya                   <-- tenancy: mechanics §M4
  code -> tax_treatment_codes                          <-- Clara writes ONLY this
  proposal_basis text                                  <-- her narration
  proposed_by/at · approved_by/at                      <-- the one-click door
  apportionment_bp int NULL · apportionment_entered_by <-- HUMAN-keyed only
  CHECK (apportionment_bp IS NULL
         OR (approved_by IS NOT NULL AND apportionment_entered_by IS NOT NULL))
```

The evaluator's fraction is `code.fraction_bp * COALESCE(apportionment_bp, 10000) / 10000`, applied to
the account's **sealed P&L movement for the basis period** (§3 R2/R3 — `snapshot->'pl_rows'`, never
`closing_position`). Three properties follow, each with a behavioural cell (mechanics §M6): **(1)** a
model cannot emit a numeral into the computation — not "is discouraged from", cannot; **(2)** a
treatment cannot exist without a citation, because the code carries one and an unsigned code is
unusable; **(3)** an apportionment percentage — the one judgement number that is genuinely a number —
is human-keyed or it does not exist.

**Property (3) is NOT the CHECK.** *(Gate blocker; **D-24**.)* The CHECK above is NULL-shaped, and the
agent is a real `clara.users` row with a stable uuid (`0002:195` `is_agent`, `0002:334-335`
`agent_user_id()`), so a row carrying `agent_user_id()` in both `approved_by` and
`apportionment_entered_by` satisfies it exactly as a human-keyed row does — law 68's "a CASE whose arms
are all NULL-poisoned is an open door drawn as a wall". The wall is **three mechanisms**:

1. **The CHECK stays** as the shape rule — an apportionment without an approval is malformed.
2. **`_tf_tax_treatment_human_only`**, a `before insert or update` trigger, is the ARM-0 guard: for each
   of `approved_by` and `apportionment_entered_by` the **first** arm refuses NULL-where-required and
   the second refuses a value resolving to `clara.users.is_agent` — a machine principal in either
   column raises, whatever door it came through.
3. **The approve door is a human verb, on the estate's own established shape.** `approve_tax_treatment`
   opens with `clara._human_ctx(clara.role_rank('admin'))` and counts eligible approvers with the
   predicate `approve_metric_definition` already uses at `0059:85` — `join clara.users u … and not
   u.is_agent` — refusing `no_eligible_human`, requiring a distinct checker where two or more exist,
   and admitting self-approval only for a sole eligible human with an attestation. Clara's proposal
   verb is a **wake** verb (§3.1) with no path to those columns.

Cell **C2b** is the arm the v1 battery never ran: write the approval and apportionment as
`agent_user_id()` and assert it **refuses**; repeat as a real human and assert it computes. The
severance also fixes the error class the survey found in the prior research (§6.4a): the citation is
bound **once, to the code, by the owner**, not re-picked per run by a model — a depreciation add-back
cannot cite the wrong paragraph on Tuesday and the right one on Wednesday.

---

## 3 · The ladder as ONE evaluator member

> **[RE-CUT 2026-08-23 — conductor, measured.]** v1.1 registered **~12 members, one per rung**. Wrong,
> for a measured reason: **`verify_evaluator_freeze()` iterates `evaluator_versions` with no
> `where deployed`, and hashes the FULL `pg_get_functiondef`.** So **(a)** registration freezes
> immediately — **`deployed:false` buys nothing**; **(b)** a later ACL, owner or `search_path` change to
> any member raises **at that later lane's apply, pointing at F-T3**. Twelve members = twelve bodies
> frozen estate-wide and twelve chances to hand a red migration to a lane that never heard of this
> item. **(D-16.)**

**ONE registered member**, self-contained, calling **nothing but built-ins**:
`clara.evaluate_tax_computation_v1(p_client uuid, p_ya int) returns setof clara.tax_computation_line` —
`(rung, line_key, amount_cents, exact_num, exact_den, status, reason, treatment_code, authority_id,
asset_id)` — **`STABLE`, pure, reads and never writes.** It computes the whole ladder in one body
(R1-R12, the CA schedule, the SME predicate and its reasons, the CP204 schedule) and returns them as
addressable rows. Nothing else in F-T3 is a member.

**Why one, not three.** The tempting split (ladder / CA / CP204) fails on the SME predicate, which R10,
the small-value-asset cap (§5) and the CP204 relief (§7) all need. Registering it freezes a fourth
body; inlining it three times duplicates judgement logic across three bodies — two mutually-unaware
paths in a third hat (law 81). One body has it once. **The cost, stated:** one large body reviews
harder than twelve small ones, and changing any rung's arithmetic becomes a new `_v2` member plus a new
`evaluator_version`, not an edit. Both accepted — the rungs stay separately **addressable** (one
`metric_definition` and one returned row each), and "changing how a number is derived is a versioned
act" is what hard constraint 2 wants anyway.

**And it is why the member is the LAST DDL-dependent PR** *(gate blocker)*. Postgres does not validate a
plpgsql body's referenced relations at `create function` time, so a member registered before a table it
reads applies cleanly and then raises `relation … does not exist` on its **first call** — aborting the
whole `setof` return, which is precisely what part 2 §9 promises never happens. The body is frozen the
instant its `evaluator_versions` row lands, so that cannot be patched later without a `_v2`. **PR-6
carries a closed census of every relation the body names, each with the PR that creates it, and every
one is created strictly before PR-6.**

**Deliberately NOT members**, and so free to change: the run wrapper that materialises `ca_asset_years`,
the carry-out rows and `metric_cells` from the returned rowset (which is also why the evaluator stays
pure); Clara's proposal verb; the approval door; the `law_review_due` belt; every read view. **No F-T3
member is a general-purpose helper** — satisfied trivially by there being one, calling only built-ins.
**`frozen-evaluators.json` is append-only vs `origin/main`**, and **a manifest conflict is NEVER
resolved by dropping another lane's key.**

Every rung's output is a `metric_cell` with `formula_sha256`, `resolved_inputs_sha256` and
`evaluator_version_id` — and, for every non-`ok` cell, a `na_reason_version_id`, which `0058:261-262`
makes a hard CHECK (part 2 §9).

| # | Rung | Reads | Yields |
|---|---|---|---|
| R1 | **accounting profit before tax** | `close_receipts.pl_net_cents` for the fiscal year the basis period names, `status='active'`, `kind='close'` | the base |
| R2 | **add-backs** | `tax_account_treatments` (approved) × the account's sealed **`snapshot->'pl_rows'`** movement, normalised by `account_type` (A.2) | one line per treated account, one total |
| R3 | **further deductions / income not taxable** | same, `direction ∈ {deduct, exclude}` | exempt/single-tier dividends, capital gains reversed |
| R4 | **adjusted income** (s.33) | R1 + R2 − R3 | the single modelled business source (§3.2) |
| R5 | **capital allowances** (Sch 3) | `ca_asset_years` (§5) | IA + AA + balancing adjustments |
| R6 | **statutory income** (s.42) | R4 − R5, floored at nil; unabsorbed CA carried **within the source** | |
| R7 | **aggregate income** (s.43) | (Σ R6 **business** sources − brought-forward business loss, **s.43(2)**, floored at that business aggregate, the excess carried) + Σ R6 **non-business** sources | |
| R8 | **total income** (s.44) | R7 less current-year adjusted loss (**s.44(2)**) and approved donations (**s.44(6)**: ≤10% of **R7**) | |
| R9 | **chargeable income** | company: = R8. individual: R8 less personal reliefs — **not F-T3's** | |
| R10 | **tax charge** | R9 through `tax_rate_bands` for the regime the SME predicate returned (§6) | |
| R11 | **CP204 estimate + instalments for `p_ya + 1`** | R10, the 85% floor from `p_ya`'s filing, months in **`p_ya + 1`**'s basis period | §7 |
| R12 | **s.107C(10) exposure for `p_ya`** | R10 vs the latest `cp204_filings` row **for `p_ya`** | narrative, never a posting |

**R7/R8 were swapped in v1.2, and the cap sat on the wrong base** *(gate blocker; **D-19**)*. Under the
Act the brought-forward business loss is the **s.43(2)** deduction, taken against the aggregate of
statutory income from **business sources only** and floored at that aggregate — the excess carries
forward, it does not reach rental, interest or other-source income. The **current-year** adjusted loss
is the **s.44(2)** deduction from aggregate income. s.44(5F) is the ten-YA **time limit** on the carried
amount, not the deduction provision, so v1.2 printed it as the authority for a deduction whose
authority is s.43(2). And because R7 no longer subtracts the current-year loss, the s.44(6) donation cap
now sits on aggregate income, which is what the Act says.

**R1's input rules are walls, not preferences.**

- **No active `close_receipts` row ⇒ `close_not_sealed`.** Reading `trial_balance()` live would give a
  computation that silently changes after it is filed.
- **The basis period must be co-extensive with the fiscal year the receipt seals** *(gate blocker;
  **D-23**)*. The member resolves `tax_basis_periods` for `(client, p_ya)`; no row ⇒
  `basis_period_undetermined`. The row's `derived_from_fiscal_year_id` names the fiscal year, and R1
  reads the active close receipt for **that** year. If the row names no fiscal year, or its
  `(period_start, period_end)` is not exactly that year's `(starts_on, ends_on)`, every rung from R1 is
  `not_evaluable` with **`basis_period_not_coextensive_with_close`**. `close_receipts` is one active row
  per `fiscal_year_id` (`uq_cr_one_active_close`, `0056:1544`) sealing the whole fiscal year's movement,
  so an 18-month first period, a change of accounting date or a cessation short period cannot be served
  by scaling it. **Apportionment across two YAs is out of v1**: s.21A(3)-(7) turns on a DGIR direction
  Clara cannot see.

### 3.1 · The verb set — wake wrappers, ungranted cores, human doors

*(Gate blocker; **D-25**. v1.2 specified three agent writes with no entrance at all — no wrapper, no
credential, no allowlist row, no kind, no receipt — while every sibling design in the wave states this
analysis explicitly. The failure it invites is on the record here: `0078:124-127` shipped a wrapper
delegating to a `_human_ctx` core that "raised CLR04 for every wake caller and could never have
executed".)*

The three agent writes — `wake_propose_tax_treatment`, `wake_run_tax_computation` and
`wake_raise_law_review_due` — take the **`0078:90-107` shape exactly**: resolve the wake credential,
refuse without one (CLR03), assert the per-kind `wake_fn_allowlist` row, then delegate to an ungranted
core taking an already-resolved `(firm, actor, on_behalf_of, wake_kind)`. The core carries the DML; the
wrapper carries none. Receipts run `_reserve_op` / `_audit` / `_finish_op` plus `agent_act_receipts`.

**The kind analysis, stated rather than assumed.** `0011:618-628` carries two CHECK families:
`wake_kind in ('interactive','proactive','autodraft')`, and the pairing rule that `autodraft`
**requires** a non-null `client_id` while `interactive`/`proactive` require it null. The two
client-scoped writes are therefore `autodraft`; the belt is firm-scoped and clock-woken, so it rides
`proactive` exactly as F-T2's payroll belt does. **F-T3 needs no new wake kind and no CHECK
extension** — and this sentence is the analysis the gate found missing, not a claim that none was
needed. The five human doors, their role floors and the full wrapper table are in **mechanics §M1**.

### 3.2 · One business source, said out loud

*(Gate material; **D-20**.)* R4-R7 are stated per source, and **nothing in the estate carries a
business-source dimension** — `coa_accounts` has none through its whole lineage, `pl_rows` carries
`account_code`/`account_type`/`movement_cents` only, and `fixed_assets` has none, so capital allowances
cannot be attributed to a source at all. Left as written, a two-source client silently collapses to
one: source A's capital allowances absorb source B's income and the nil floor at R6 is applied once
instead of per source, understating statutory income with no refusal. v1 therefore **models exactly one
business source and refuses the rest**. `client_tax_attributes` carries `business_source_count`; absent
⇒ **`business_source_count_unknown`**; greater than one ⇒ R4-R7 are `not_evaluable` with
**`multiple_business_sources_unmodelled`**, naming the count. Multiple sources are part 2 §13's. This is
the same move D-1, D-6 and D-9 already make: model it, or refuse it by name — never compute through it.

---

## 4 · New DB surfaces

**Ten relations, all new**, plus **two alterations** to `clara.fixed_assets` (one column pair and one
unique constraint — D-7). Every column list, every CHECK, the tenancy shape and the composite keys are
in **mechanics §M2 and §M4**; this section carries what each relation is *for* and the three the gate
made the design re-think.

| # | Relation | What it is | Scope |
|---|---|---|---|
| 1 | `tax_authorities` | the citation catalog — `kind`, `label`, `url`, `accessed_at`, `quote`, `owner_signed_by/at` | platform |
| 2 | `tax_treatment_codes` | §2's closed, owner-signed code set | platform |
| 3 | `tax_rate_bands` | Schedule 1 bands per regime and YA | platform |
| 4 | `capital_allowance_rates` | Schedule 3 IA/AA rates per class and YA window | platform |
| 5 | `tax_thresholds` | the fourteen seeded scalars (MSMC limits, MV caps, SVA caps, CP204 floor, s.107C(10) rates, the donation cap, the loss-carry years) | platform |
| 6 | `ca_asset_years` | the capital-allowance schedule, one row per asset per YA — §5 | client |
| 7 | `cp204_filings` | what was actually filed and when — human-keyed | client |
| 8 | `client_tax_attributes` | the **valid-time** entity facts the SME predicate reads as-at | client |
| 9 | `tax_carryforwards` | brought-forward adjusted loss and unabsorbed capital allowance | client |
| 10 | `tax_entry_treatments` | the per-entry treatment override, same severance shape as §2 | client |
| — | the field-pack map | `(form_code, form_version, field_id, label, value_cell_id, whole_ringgit)` — part 2 §8 | platform |

**(1) is F-T3's answer to survey §3.4.** **Neither** F-A8's `web_fetch_citations` **nor** F-A5's
`basis_citations` is the right home for a *statutory* citation: both are per-run artefacts of a fetch,
and a statutory reference is standing law that must not be re-fetched (and re-risked) on every
computation. A `report_agent_receipt`'s `basis_citations` then carries `tax_authorities.id` values —
F-A5's carrier used as a pointer, not as the store. **(D-5.)** **How (3), (4) and (5) land —
[RULED 2026-08-23, OQ-6 → R-L25].** They are **developer-seeded fact
tables on the D17/R-L19 pattern**, not TA-P2 governed-door tables: **versioned, effective-dated rows
seeded by migration through the full PR ladder**, each cited to LHDN or the AGC gazette with its fetch
date via `authority_id`, immutable + supersede, and **a missing row for the YA refuses by name and
stops in the open** — never carried forward from the previous year. A rate change is a ticket and a PR.
This is the **same** mechanism as the F-A9 price rows and the deadline tables — one seeding
architecture, not two (law 81) — and the F-A8 scheduled fetch may attach later without changing how a
row lands. The Tier-1 closure re-opens for **exactly these two rate tables**; EPF/SOCSO/EIS, stamp duty
and MTD stay out. Contract note: `wave-f-contract.md`'s `[TB-2026-08-23]`. **(D-15.)**

Two rows are **deliberately absent**, and their classes refuse by name. The ICT 40/20 row
(P.U.(A) 328/2024) is not seeded — survey §6.3 U1: the gazette text could not be read at an official
source on 2026-08-23, and a rate on professional-firm secondaries is not a cited official row, so an
asset whose `ca_class` resolves to ICT returns `rate_row_missing_for_ya`. `sva_annual_cap` is not
seeded either — PR 3/2021 is survey U2, unfetched (§5). **R-L25 names this posture as the model for the
whole family**: that is the design working, not failing.

### 4.1 · (8) `client_tax_attributes` — why `record_client_fact` could not carry this

*(Gate blockers; **D-21**.)* v1.2 routed seven new `client_fact_keys` through `record_client_fact`.
Three independent walls, all read from the live body of `0055`, make that unbuildable:

- **No valid-time dimension.** `client_facts` carries `recorded_at` and the supersession pair only
  (`0055:386-421`); `uq_client_fact_live` (`:422`) admits exactly **one live row per
  `(client, fact_key)`**; the door's signature (`:499-501`) has no as-at parameter. The store can answer
  "what is it now", never "what was it at the beginning of the YA2024 basis period" — and the worked
  ladder prices that difference at RM31,409.50 on one shareholding fact (A.3).
- **The validation dispatch is fail-closed and implements two branches.** `0055:588-607` handles
  `enum:%` membership and a hard-coded `msic` regex and raises `fact_value_invalid` on everything else;
  `:582` additionally requires `jsonb_typeof(p_fact_value) = 'string'`, so a `{value, as_at}` object
  cannot ride inside the value either. None of F-T3's facts is an enum.
- **The door cannot execute inside a migration, and it writes the other table anyway.** It opens on
  `clara._human_ctx(clara.role_rank('admin'))`, which raises CLR04 without a JWT (`0004:302-305`), and
  its only writes are `insert into clara.client_facts`; `client_fact_keys` is a bare owner insert
  (`0055:342-370`). "A migration seed block through `record_client_fact`" is two different acts, and
  neither is the one described.

So **F-T3 mints no `client_fact_keys` and never calls `record_client_fact`.**

**`tin` and `ssm_registration` are dropped from F-T3's surface entirely** *(gate material; **D-22**)*.
They already have a governed home: `clara.client_identifiers` (`0007:222-236`,
`kind in ('tin','ssm','bank_account')`, composite tenant FK) written through `add_client_identifier`
(`0007:1508`, bookkeeper+) — and a sibling Wave-F design, `filing-and-interview-design.md:163`, already
treats it as **attribution-authoritative** for exactly these values. A parallel store would be law 81's
two mutually-unaware paths, on the one number the Form C pack prints for a human to key into MyTax.
F-T3 **reads** it; no `kind='tin'` row ⇒ `entity_identifier_missing` on the pack rather than a blank
field.

**The dated facts land in the new valid-time table**, keyed `(client_id, firm_id, attribute_key,
effective_on)` with a value column per declared kind. Keys: `incorporation_date` ·
`commenced_operations_on` · `paid_up_ordinary_capital_cents` · `foreign_or_noncitizen_holding_bp` ·
`related_company_paid_up_cents` · `tax_resident_in_malaysia` · `business_source_count`. **The read is
as-at**: the live row with the greatest `effective_on <= the as-at date`; **no such row ⇒ the dependent
rung refuses by name**, never today's value. Written through `record_client_tax_attribute` (admin+,
human-only, supersede-never-update).

**Why a second fact store is one architecture, not two.** `client_facts` is a **current-state** store by
deliberate design, and `0057:2129` records that it carries no staleness trigger because it "feed[s]
close GATES … not the presented P&L or balance-sheet figures", adding that "**if a later pack ever
PRESENTS a fact from one of them, that table joins the six and this decision is the thing to
revisit**". F-T3 is that pack. A valid-time store answers *what was true on this date* — a different
question, not a second answer to the same one. Each attribute key's description scopes it explicitly to
the CLIENT and cites the generic name-only wall, exactly as D-17 required of the fact keys.

### 4.2 · (9) `tax_carryforwards` — the input that did not exist

*(Gate blocker; **D-19**.)* v1.2's R6 promised "excess CA carried" and R8 deducted a brought-forward
loss, and **no input in the estate or in the design held either figure** — a repo-wide sweep for
`unabsorbed|loss_carr|brought.forward|carry.forward` returns two unrelated comments. A conforming
implementer had to deduct zero, silently, on a statutory document. The design's own precedent is one
row away in the table above: `cp204_filings` is human-keyed "because Clara cannot e-file and therefore
cannot know. Its absence is a named `not_evaluable`, never a zero."

The table is keyed `(client_id, firm_id, ya, kind ∈ {adjusted_business_loss,
unabsorbed_capital_allowance})` with `origin ∈ {human_keyed, evaluator}`, `origin_ya`, `amount_cents`
and a basis. **Human-keyed** rows are the opening balance for a client whose history predates Clara — a
professional's figure, on `cp204_filings`' shape and through the same kind of door. **Evaluator** rows
are written by the run wrapper from the prior YA's returned carry-out rows with their
`evaluator_version_id` and `cell_id`, so once F-T3 has run a year the next year's input is DB-owned and
reproducible, exactly like `ca_asset_years`. Three rules:

- **Absence is not a nil.** No row ⇒ **`losses_brought_forward_unknown`**, naming kind and YA. A human
  asserting there is none keys `amount_cents = 0` with a basis — "nobody entered it" and "there is
  none" are different states, which law 31 requires.
- **The set-off arithmetic is gated on U5.** The survey ruled the carry rules "goes to U5 and **stays
  out of the evaluator until read**" (`survey:438-441`) — PR 1/2022 unfetched, Sch 3 para 75/75A's
  continuity conditions unverified. v1.2 put them in anyway. A **nil** row computes; a **non-nil** row
  makes the dependent rung `not_evaluable` with **`loss_relief_rules_unread`** until the authority is
  seeded. R-L25's posture, unchanged.
- **The two carries are kept apart.** Unabsorbed capital allowance is a Sch 3 quantity carried within
  the same source under continuity conditions; a brought-forward adjusted business loss is an s.43(2)
  quantity under the s.44(5F) ten-YA limit. v1.2 conflated them into one phrase; `kind` is the fix.

### 4.3 · (10) `tax_entry_treatments` — moved forward, not deferred

v1 treats at account level by default (part 2 §9, D-10); the exceptional line needs an entry-level
override. Because the frozen member reads it, it must exist **before** the member is registered — so it
ships in PR-4 with the account-level table rather than in a PR after the freeze, which would have
needed a `_v2` member for a table the design always meant v1 to have. Same severance shape as §2: Clara
proposes a `code`, a human approves, no numeric column. Its presence for an account removes that
account from `mixed_account_needs_split`.

### 4.6 · `valid_through` and the law-review belt — [GRANTED 2026-08-23, OQ-8's product half]

A refusal is the right behaviour when a rate row is missing, and it is a **terrible first warning**: the
firm discovers it in January, mid-filing, on a client's return. The seeded law tables therefore carry
their own expiry, and something wakes before it.

**Every row in `tax_rate_bands`, `capital_allowance_rates`, `tax_thresholds` and `tax_authorities`
carries `valid_through`** — the last date the row is known-current, set at seed time from the source's
own scope. It is **not** an automatic invalidation: past `valid_through` the row still computes, and the
belt has already raised the question. **`law_review_due`** is a periodic belt, a **consumer of F-A4's
clock** (law 80), entered through `wake_raise_law_review_due` on the `proactive` kind (§3.1); it reads
the seeded tables and raises **one typed question to the firm's tax lead** per row expiring inside the
horizon. **Its five belt properties, its recipient rule and its resolution rule are in mechanics §M5.**
This is the product half of Annex E's standing duty; the **governance** half stays OQ-8's card.

---

## 5 · The capital allowance schedule

The evaluator finally gives `fixed_assets.ca_class` / `is_commercial_vehicle` / `is_new`
(`0041:354-357`) the consumer Wave D deferred to Wave F. `ca_asset_years` is one row per asset per YA,
produced only by the run wrapper from the evaluator's rowset, hand-writable by nobody (columns in
mechanics §M2).

**Qualifying expenditure.** `qe = cost` except for a motor vehicle that is not a commercial vehicle,
where `qe = LEAST(cost, is_new AND cost <= mv_new_cost_ceiling ? mv_qe_cap_new : mv_qe_cap_default)`
(PR 6/2015 §(b)). `is_commercial_vehicle` and `is_new` are register facts, not inferences.
**Allowances:** IA on QE in the year the asset comes into use; AA on QE each year, both at the rate row
for the `ca_class` and YA; AA never exceeds residual expenditure. **No AA in the year of disposal** — a
balancing allowance or charge instead, and a balancing charge is capped at the allowances actually made.

**Small value assets** (Sch 3 para 19A). `cost <= sva_asset_max` ⇒ the full cost in lieu of IA/AA,
subject to `sva_annual_cap` per YA — **except** for a company resident and incorporated in Malaysia
meeting the MSMC criteria, where the cap does not apply (para 19A(3); PR 8/2025 Table 6 "No limit"). Not
available to an LLP, a business trust or an ABS SPV. **Accept the cascade this creates:** a
`not_evaluable` SME verdict makes the SVA cap `not_evaluable` → the CA total → the whole computation.

**What happens above the cap** *(gate material; v1.2 stopped at the cap and left the build to choose)*.
Expenditure the cap excludes is **not stranded**: an asset outside the annual cap takes **normal IA/AA
at its `ca_class` rate**, which is what "in lieu of" means per asset. Two rules make it deterministic,
because the Act does not order the assets and Clara may not elect for the taxpayer: **(a)** assets are
taken in **descending `qe_cents`** order, so the cap covers the largest qualifying expenditure and the
allowance is maximised; **(b)** an asset is **wholly inside or wholly outside** the cap, never split
across the boundary. And the rule may not land until its authority does: PR 3/2021 is survey U2, not
fetched, so `sva_annual_cap` is absent and the SVA branch refuses with `rate_row_missing_for_ya` in the
meantime — R-L25's posture, unchanged.

**Accounting depreciation and capital allowances never meet.** `fa_depreciation` (`0041:519-543`) feeds
R2 as an add-back; `fixed_assets` feeds R5 as QE — two different reads, two rungs, proved differentially.

**The disposal value, the register writer and the split** are the fold's largest single correction and
live in **mechanics §M3**. In one paragraph: the Schedule 3 disposal value is **not** the accounting
proceeds (para 62(1) — the greater of market value and net proceeds; a controlled sale is deemed), so it
is **human-keyed** at the disposal's approval with a stated basis and is `disposal_value_not_established`
without one; **one** new column pair lands because `fixed_assets.disposed_at` already exists and a second
disposal date could disagree about the YA; `dispose_fixed_asset` is proposal-shaped and does **not**
write the register row — `clara._fa_on_approve` does, both on the full path and on the partial supersede
split; and the post-approval immutability guard's allowlist must be widened or the **first** disposal in
the estate raises CLR13, a mistake `0041:864-866` records the repo already having made once. **PR-3
therefore replaces three live bodies, not one.**

---

## 6 · SME eligibility — a three-valued predicate, never a default

`sme_rate_eligibility_v1(client_id, ya) → (verdict, reasons jsonb)` with
`verdict ∈ {eligible, not_eligible, not_evaluable}`. Five conditions, evaluated independently (PR
8/2025 §6.2.1, survey §6.2). Every as-at read resolves against `client_tax_attributes` at the **basis
period's `period_start`**, and no such row ⇒ `sme_facts_missing` naming the attribute **and the date**.

| C | Condition | Input |
|---|---|---|
| C1 | resident **and** incorporated in Malaysia | `entity_type` (`client_facts`, read-only) + `tax_resident_in_malaysia` as-at |
| C2 | paid-up ordinary share capital ≤ RM2.5m **at the beginning of the basis period** | `paid_up_ordinary_capital_cents` as-at that date |
| C3 | gross business income ≤ RM50m **in the basis period** | derived from the sealed close |
| C4 | not >50% owned by a related company (paid-up > RM2.5m) | `related_company_paid_up_cents` as-at |
| C5 | **from YA2024**, not >20% owned directly or indirectly by foreign companies or non-citizens | `foreign_or_noncitizen_holding_bp` as-at |

**Combination rule.** Any condition returning a definite *fail* ⇒ `not_eligible` (a proven
disqualification is decisive; no missing fact can rescue it). Otherwise, any condition returning
`not_evaluable` ⇒ `not_evaluable`. Only all-pass ⇒ `eligible`.

**And `not_evaluable` refuses the computation — it does not fall back to 24%. [RULED 2026-08-23,
OQ-4 → REFUSE.]** The frozen build's honesty layer defaulted to the standard rate and printed a banner
(survey §6.4c); F-T3 does not inherit that. A rate on an unproven premise is a fabricated number in a
durable artifact (hard constraint 2), wrong in the client's favour or against depending which way the
fact lands, and a banner is prompt-level mitigation for a structural problem. **An unknown SME status
is a question to the human, never a rate** — and the refusal is not a dead end on screen, because
`sme_facts_missing` names the exact missing fact. **(D-6.)** The as-at read is the whole point of
§4.1's table: reading today's paid-up capital for a YA2024 computation is the same failure OQ-4
refuses, certified by a `resolved_inputs_sha256` over a figure that is not re-derivable. A later share
issue must not retroactively disqualify a filed year, and a capital reduction must not retroactively
qualify it.

---

## 7 · CP204

**R11 is the estimate for `p_ya + 1`, and the design now says so** *(gate material)*. s.107C(1)-(2)
requires the estimate **not later than 30 days before the beginning of the basis period for its YA**,
while R1 walls on a sealed close that exists only after the computed year has ended — so an estimate
"for the YA" under v1.2's literal reading was always produced twelve months after its own deadline. The
annex's worked ladder had already silently shifted to YA+1 while the body kept `ya-1`; the two bindings
differ by exactly one year on a statutory floor.

- **The estimate:** R10 for `p_ya`, proposed as the estimate for **`ya_target = p_ya + 1`**.
- **The 85% floor** is `0.85 ×` the latest `cp204_filings` row for `ya_target - 1` — which **is
  `p_ya`**, the computed year, not `p_ya - 1` (s.107C(3): revision if any, else the original). **No
  prior row ⇒ the floor is `prior_estimate_unknown`**, said beside the number rather than silently
  omitted. The estimate itself still computes.
- **The divisor** `n` = months in **`ya_target`'s** basis period, from `tax_basis_periods` for
  `(client, ya_target)`. **No row ⇒ `basis_period_undetermined` naming `ya_target`** — never a silent
  fallback to the computed year's `months`, which differs in exactly the first-period, change-of-date
  and cessation cases A.1 exists for.
- **The cell's period.** `metric_cell_periods` (`0058:265-269`) binds every cell to a concrete
  `reporting_periods` row, so R11's cells are stamped on `ya_target`'s period and R1-R10's on `p_ya`'s.

`cp204_instalments_v1`: equal monthly instalments due on the **15th of each calendar month**, beginning
at **month 2** for an established taxpayer and **month 6** for one that first commenced operation with a
basis period of ≥6 months (s.107C(4), (6); LHDN tax-estimation page). Rounding convention **D-12**:
`floor(estimate/n)` with the whole remainder on the **first** instalment, so the schedule sums exactly
to the estimate and no rounding drift reaches the last month.

**The new-company relief** (s.107C(4A)): a company resident and incorporated in Malaysia first
commencing operation is relieved for that YA and the immediate following YA (or the two following),
provided paid-up ordinary ≤ RM2.5m at the beginning of each and — from YA2024 — the >20%
foreign/non-citizen test does not bite (PR 8/2025 §6.6.2). It reuses C2 and C5 from §6 and so inherits
the same three-valued discipline **and the same as-at read, at each relieved year's own basis-period
start**. **R12, the s.107C(10) exposure** is measured for **`p_ya`**, against the latest `cp204_filings`
row **for `p_ya`** — the estimate on record for the year now assessed, never R11's proposal for the next
one. Where `actual − estimate > 0.30 × actual`, exposure = `0.10 × (actual − estimate − 0.30 × actual)`.
**Narrative** — commentary and pack, never a provision, never a posting. And a taxpayer that has **not
commenced operations** need not furnish CP204 (Filing Programme 2026 note 3(i)(b)) while a **dormant**
one must still furnish the return form: both are verdicts of the evaluator, both printed.

---

**Continue at `tax-computation-design-part2.md` — §8 the artifacts and the human wall · §9 the refusal
vocabulary · §10 the battery · §11 the PR ladder · §12 sequencing · §13 what is not in v1.**
