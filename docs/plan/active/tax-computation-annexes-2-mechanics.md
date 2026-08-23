# F-T3 — the draft tax computation: mechanics annex (v2, gate-folded 2026-08-23)

> **Mechanics for `tax-computation-design.md` (§1-§7) and `tax-computation-design-part2.md` (§8-§13).**
> The decision register, the predictions and the question register stay in
> `tax-computation-annexes.md`. **This file was created at the v2 gate fold** to carry the material the
> design's two parts cite but cannot hold inside their line budget — the verb set, the surface DDL,
> tenancy and RLS, the disposal machinery, the law-review belt, and the behavioural battery. **Nothing
> here is new scope; every section is either v1.2 text moved verbatim or a gate fold the design's own
> sections name.**
>
> **Design stage: no code authored, no rig run.** Every DB cite is source-read; replay is PR-0's.

---

## M1 · The verb set — wake wrappers, ungranted cores, human doors

*(Fold of gate blocker B17; **D-25**. v1.2 named three agent writes — the proposal verb, the run wrapper
and the belt — and specified no entrance for any of them: no wrapper, no credential check, no allowlist
row, no `wake_kind`, no receipt. The word "wake" appeared three times in the whole set, twice as prose
about F-A4's clock and once in a cell that asserts an **absence** from the allowlist. Every comparable
design in this wave carries a §3.1-shaped section for exactly this — `bank-agency-design.md:107`,
`close-key-1-design.md:97`, `f-a2-agentic-posting-design.md:63`, `reporting-agency-design.md:79-114` —
and `payroll-calendar-design.md:192-206` states the analysis even where the answer is "nothing new is
needed". F-T3 was the outlier.)*

### M1.1 The three granted wrappers

Each takes the **`0078:90-107` shape exactly** — the comment there reads "the `0004:617-628` shape
exactly: resolve the wake credential, refuse without one, assert the per-kind allowlist row, then
delegate to the ungranted core", and its body is:

```
select * into w from clara.wake_context();
if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
perform clara.assert_wake_allowed(w.wake_kind, 'wake_…');
…op-key non-empty check…
return clara._…_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind, …);
```

| Wrapper (granted to the wake role) | Kind | Ungranted core | What the core writes |
|---|---|---|---|
| `wake_propose_tax_treatment(p_client, p_account_id, p_ya, p_code, p_proposal_basis, p_op_key)` | `autodraft` | `_ft3_propose_tax_treatment_core` | one `tax_account_treatments` row: `code`, `proposal_basis`, `proposed_by = agent_user_id()`. **No numeric column exists, and the ARM-0 trigger refuses the approval columns to a machine principal** (design §2) |
| `wake_run_tax_computation(p_client, p_ya, p_op_key)` | `autodraft` | `_ft3_run_tax_computation_core` | calls the pure member, then materialises `metric_cells` (+ `metric_cell_periods`, + `na_reason_version_id` on every non-`ok` cell), `ca_asset_years` and the `origin='evaluator'` `tax_carryforwards` carry-out rows |
| `wake_raise_law_review_due(p_op_key)` | `proactive` | `_ft3_law_review_due_core` | one typed question per expiring row (§M5) |

**No wrapper body carries DML** against any F-T3 table — the cores do. That is what keeps the writer
census on each new table at one, by construction, rather than by discipline.

**Receipts.** Every core runs `clara._reserve_op(firm, fn, p_op_key, hash)` → work →
`clara._audit(...)` → `clara._finish_op(...)`, and records an `agent_act_receipts` row carrying the
`wake_kind` and `on_behalf_of` the wrapper resolved, so an agent-authored treatment proposal stays
audit-distinguishable from a human's for the life of the record.

### M1.2 The wake-kind analysis — stated, not assumed

`0011:618-628` carries **two** CHECK families on `clara.wake_credentials`, and both bind:

```
add constraint ck_wake_credentials_kind_0011   check (wake_kind in ('interactive','proactive','autodraft')),
add constraint ck_wake_credentials_client_0011 check (
  (wake_kind='autodraft' and client_id is not null)
  or (wake_kind in ('interactive','proactive') and client_id is null))
```

- The two client-scoped writes carry a `p_client` and act on one client's books, so they are
  **`autodraft`** — the kind whose CHECK *requires* a non-null `client_id`.
- The belt is **firm-scoped** and clock-woken, with no client, so it is **`proactive`** — the kind whose
  CHECK *requires* `client_id` null. This is exactly how F-T2's payroll belt rides the existing grant.

**F-T3 therefore needs no new wake kind and no CHECK extension.** The gate's finding was not that a new
kind was needed; it was that the design owed its readers this analysis and supplied none. Three
`clara.wake_fn_allowlist(wake_kind, function_name)` rows land — two `autodraft`, one `proactive` — in
PR-4, PR-6 and PR-8 respectively, and cell **C16** enumerates the allowlist positively.

### M1.3 The five human doors

Each opens on `clara._human_ctx(clara.role_rank(...))` and is unreachable from a wake credential,
because `_human_ctx` reads `request.jwt.claims` and raises **CLR04** without one (`0004:302-305`) — the
failure `0078:124-127` records this repo shipping for real, in the opposite direction, when a wrapper
delegated to a human-shaped core.

| Door | Floor | Notes |
|---|---|---|
| `approve_tax_treatment` | admin+ | the eligible-approver census filters `and not u.is_agent`, the `approve_metric_definition` shape at `0059:85`; distinct checker where ≥2 exist; sole-eligible self-approval needs an attestation |
| `record_client_tax_attribute` | admin+ | supersede-never-update; `effective_on` is the caller's, `recorded_at` is the clock's |
| `record_tax_carryforward` | admin+ | a nil assertion is `amount_cents = 0` **with a basis**, never an absent row |
| `record_cp204_filing` | admin+ | what was actually filed; Clara cannot e-file and therefore cannot know |
| `publish_tax_form_field_map` | the statutory-class admin verb | rides `publish_report_template_version`'s human-only wall (`0069:121`) |

---

## M2 · The surface DDL

The ten new relations, their columns and their CHECKs. Tenancy columns, RLS and composite FKs are §M4
and are **not repeated** here.

**`tax_authorities`** — `(id, kind ∈ {act_section, schedule_para, public_ruling, gazette_order,
lhdn_page}, label, url, accessed_at, quote, fetched_by, valid_through, owner_signed_by, owner_signed_at,
revision, superseded_by, seeded_in_migration)`.

**`tax_treatment_codes`** — `(code pk, direction ∈ {add_back, deduct, allowable, exclude}, fraction_bp
int check 0..10000, regime, statutory_ref, effective_ya_from, effective_ya_to, authority_id →
tax_authorities, valid_through, owner_signed_by NOT NULL, owner_signed_at NOT NULL, revision,
superseded_by)`.

**`tax_rate_bands`** — `(regime ∈ {company_msmc, company_standard, individual_resident,
individual_non_resident}, ya, band_lower_cents, band_upper_cents NULL, rate_bp, authority_id,
valid_through, revision, superseded_by, seeded_in_migration)`.

**`capital_allowance_rates`** — `(ya_from, ya_to, ca_class, ia_bp, aa_bp, authority_id, valid_through,
revision, superseded_by, seeded_in_migration)`. **The ICT 40/20 row is deliberately not seeded** (survey
U1).

**`tax_thresholds`** — `(ya, key, value_cents NULL, value_bp NULL, authority_id, valid_through, revision,
superseded_by, seeded_in_migration)` with a CHECK that exactly one value column is non-null. Seeded
keys and values: `msmc_paid_up_max` RM2,500,000 · `msmc_gross_income_max` RM50,000,000 ·
`msmc_foreign_holding_max_bp` 2000 · `related_company_paid_up_min` RM2,500,000 · `sva_asset_max`
RM2,000 · **`sva_annual_cap` RM20,000 — NOT SEEDED until PR 3/2021 (survey U2) is read** ·
`mv_qe_cap_default` RM50,000 · `mv_qe_cap_new` RM100,000 · `mv_new_cost_ceiling` RM150,000 ·
`cp204_floor_bp` 8500 · `s107c10_threshold_bp` 3000 · `s107c10_penalty_bp` 1000 ·
`s44_6_donation_cap_bp` 1000 · `loss_carry_forward_years` 10.

**`ca_asset_years`** — `(client_id, firm_id, fixed_asset_id, supersedes_fixed_asset_id NULL, ya,
qe_cents, ia_cents, aa_cents, balancing_cents, residual_open_cents, residual_close_cents, rate_row_id,
evaluator_version_id, cell_id)`. One row per asset per YA, written only by the run wrapper.

**`cp204_filings`** — `(client_id, firm_id, ya, kind ∈ {estimate, revision_m6, revision_m9,
revision_m11}, amount_cents, filed_on, recorded_by, recorded_at)`.

**`tax_basis_periods`** (D-1) — `(client_id, firm_id, ya, period_start, period_end, months,
derivation ∈ {coincides_with_fy, asserted}, derived_from_fiscal_year_id, asserted_by, asserted_at)`.
**`derived_from_fiscal_year_id` is load-bearing after the fold**: it is how a YA resolves to the fiscal
year whose close receipt R1 reads, and a row that names none refuses (design §3, D-23).

**`client_tax_attributes`** — `(client_id, firm_id, attribute_key, effective_on date, value_cents bigint
NULL, value_bp int NULL, value_date date NULL, value_int int NULL, basis, basis_kind, source_document_id,
entered_by, entered_at, superseded_by, superseded_at)`. `attribute_key` is a closed CHECK set —
`incorporation_date` · `commenced_operations_on` · `paid_up_ordinary_capital_cents` ·
`foreign_or_noncitizen_holding_bp` · `related_company_paid_up_cents` · `tax_resident_in_malaysia` ·
`business_source_count` — with a CHECK that exactly the value column the key declares is non-null, and a
partial unique index on `(client_id, attribute_key, effective_on) where superseded_at is null`. Each
key's description scopes it explicitly to the CLIENT and cites the generic name-only wall (D-17).
**The as-at read** is `the live row with the greatest effective_on <= the as-at date`; none ⇒ the
dependent rung refuses by name.

**`tax_carryforwards`** — `(client_id, firm_id, ya, kind ∈ {adjusted_business_loss,
unabsorbed_capital_allowance}, origin ∈ {human_keyed, evaluator}, origin_ya, amount_cents check >= 0,
basis, evaluator_version_id NULL, cell_id NULL, recorded_by, recorded_at, superseded_by, superseded_at)`
with a CHECK pairing `origin='evaluator'` to non-null `evaluator_version_id` and `cell_id`, and
`origin='human_keyed'` to a non-empty `basis`.

**`tax_account_treatments`** and **`tax_entry_treatments`** — design §2's block, the second additionally
keyed on `(entry_id, line_no)`. Neither carries any numeric column but `apportionment_bp`.

**The field-pack map** — `(form_code, form_version, field_id, label, value_cell_id, whole_ringgit
boolean, authority_id, published_by, published_at)`.

**`clara.tax_computation_line`** — the member's return composite: `(rung, line_key, amount_cents,
exact_num, exact_den, status, reason, treatment_code, authority_id, asset_id)`.

---

## M3 · The disposal value, the register writer and the split

*(Fold of gate blocker B8 and material M10; **D-7 re-cut**, **D-26**.)*

### M3.1 The value is statutory, not the posting input

`clara.dispose_fixed_asset(p_client, p_asset, p_disposal_date, p_proceeds_cents, p_proceeds_account,
p_gain_account, p_loss_account, p_memo, p_op_key, p_cost_portion_cents default null)` — sole definer
`0041:3643`. The only money it holds is **`p_proceeds_cents`**, a caller-supplied posting input,
validated at `0041:3697-3700` as non-null and non-negative and nothing else. v1.2 justified taking it as
the disposal value on the grounds that "the verb already knows the number"; it knows a **different**
number.

**Sch 3 para 62(1)**: the disposal value is the market value at the date of disposal or, on a sale,
transfer or assignment, **the greater of market value and net proceeds**; a controlled sale is deemed
(PR 7/2017 Part II is the ruling on point). A director buying the company car at book value therefore
has a disposal value **above** the recorded proceeds — an understated balancing charge and understated
tax, and the v1.2 refusal `disposal_proceeds_unavailable` names an **absence**, so a present-but-wrong
substitution passes it silently.

**The fold: the statutory value is human-keyed, on the `apportionment_bp` pattern of design §2.** The
verb gains two trailing parameters after `p_cost_portion_cents`:

- `p_statutory_disposal_value_cents bigint` — checked `>= p_proceeds_cents` (the "greater of" rule);
- `p_disposal_value_basis text ∈ {arms_length_proceeds, market_valuation, deemed_controlled}`.

Both ride the proposal payload and are entered by the human who approves the disposal. **Not supplied ⇒
the register row carries NULL ⇒ R5's balancing adjustment for that asset is
`disposal_value_not_established`**, which replaces `disposal_proceeds_unavailable` in the vocabulary. On
a **partial** disposal the human keys the value **for the portion disposed**, not for the whole asset.

### M3.2 One new date column is one too many — `disposed_at` already exists

`clara.fixed_assets.disposed_at date` exists since `0003:169`, is set by the disposal path and is read
by the depreciation walk at `0041:1384` (`least(p_through, coalesce(fa.disposed_at, p_through))`).
v1.2's `disposed_on` would have been a **second authoritative disposal date** that can disagree with the
first about which YA a balancing adjustment falls in — exactly the class this design refuses elsewhere.
**`disposed_on` is dropped.** PR-3 adds `disposal_value_cents bigint` and `disposal_value_basis text`
only.

### M3.3 The verb does not write the register row — `_fa_on_approve` does

`dispose_fixed_asset` is **proposal-shaped** (`0041:3634-3640`): between `:3643` and `:4009` there is no
`update clara.fixed_assets` at all; it reserves the op and drafts the entry carrying an `fa_disposal`
proposal (`:3926`). The register effect runs at **approve time**, in `clara._fa_on_approve(uuid)`
(`0041:2227`):

- **Full path** (`:2454-2456`): `update clara.fixed_assets set status='disposed',
  disposed_at=v_dispose_date, disposal_entry_id=p_entry, updated_at=now() where id = a.id`.
- **Partial path** (`:2461-2510`): INSERTs a `"(disposed portion)"` row and a continuing row, splitting
  cost, residual and the carried accumulated share, then `update … set status='superseded',
  superseded_by_asset_id=v_cont, superseded_at=e.posting_date`.

So v1.2's PR-3 §0 inventory was wrong twice: it named **one** live writer, and the body it pinned a
`prosrc` SHA to is a body that never touches the table. The D1 quiesce window was scoped to a surface
the disposal does not write.

### M3.4 The immutability guard's allowlist is CLOSED, and would raise on the first disposal

`clara._tf_fixed_assets_immutable_0017()` fires `before update or delete on clara.fixed_assets for each
row` with **no WHEN clause and no column list** (attached at `0017:1951-1975`, body spliced at
`0041:799-906`). For an approved row it sets

```
v_mutable := array['status','disposed_at','disposal_entry_id','superseded_by_asset_id',
                   'superseded_at','updated_at'];
```

(UNION the nine particulars columns only while `clara._fa_particulars_complete(old)` is false) and then
raises `'an approved fixed-asset baseline is immutable'`, errcode `CLR13`, reason
`fa_baseline_immutable`, if `(to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable)`.
`disposal_value_cents` and `disposal_value_basis` are in neither set, so the **full disposal path's
UPDATE would raise on the first disposal in the estate** — and R5's balancing allowances and charges
would never compute for anyone.

The repo already made this exact mistake once and wrote it down (`0041:864-866`): *"The pre-0041
allowlist omitted `disposal_entry_id` and `superseded_at`, so the FIRST disposal would have raised
CLR13."*

**The fold.** PR-3 splices the guard to add both columns to `v_mutable`, and the splice follows the
0041 discipline exactly: **re-derive the body from the LIVE catalog** with `pg_get_functiondef`, never
from file text; assert the new markers landed; and assert the superseded six-column literal is **gone**,
so a vacuous `replace()` cannot pass — the shape of `0041:888-897`'s own postcheck. (The partial path's
two successors are INSERTs, which a `before update or delete` trigger never sees, so only the full path
needs the widening; the supersede UPDATE on the parent touches allowlisted columns only.)

### M3.5 The CA schedule across a supersede edge

A partial disposal ends one `fixed_asset_id` and begins two. `ca_asset_years` therefore carries
`supersedes_fixed_asset_id`, and `residual_close_cents` passes to the successors by the register's own
**remainder-absorbing** rule — the disposed-portion row takes the balancing adjustment against the
portion's residual expenditure, the continuing row takes the remainder and continues AA. This mirrors
`_fa_lineage_walk`'s read-time pro-rating (`0041:1148-1212`) rather than inventing a second
apportionment, and it is why the reversal mirror (`0041:2546-2560`) must also unwind the new columns.

---

## M4 · Tenancy, RLS and the composite keys

*(Fold of gate material M14, re-scoped. The finding read all ten relations as one class needing
`firm_id`; they are two classes, and it also mis-stated the CI mechanism. Both corrections are recorded
in the gate record; the design carries the corrected shape.)*

**What the gate actually enforces.** `packages/db/tests/rig-meta.mjs:1080-1115`'s `governedRlsFailures()`
reads **only** `relrowsecurity` and `relforcerowsecurity` from `pg_class`, for every `clara` base table,
exempting only `RLS_EXEMPT = {schema_migrations, slice1_smoke}` (`:961`). It inspects **no** column and
**no** policy predicate. So: every one of the ten needs `enable` + `force row level security`, and a
table with forced RLS, an owner-only policy and **no** `firm_id` passes it cleanly. What `firm_id`
buys is the scoped human read and the tenant FK — and **no gate in the estate catches a missing tenant
FK**, which is why this one is design review's to catch.

**Class A — the seven client-scoped relations.** `tax_account_treatments` · `tax_entry_treatments` ·
`tax_basis_periods` · `client_tax_attributes` · `ca_asset_years` · `cp204_filings` ·
`tax_carryforwards`. Each takes the house shape at `0056:1509-1535` and `0055:461-467`:

```
firm_id uuid not null,
constraint fk_…_client foreign key (client_id, firm_id) references clara.clients (id, firm_id)
…
alter table … enable row level security;  alter table … force row level security;
create policy p_…_owner on … for all to clara_fn_owner using (true) with check (true);
create policy p_…_human on … for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on … to clara_authenticated;
```

Two of them need a **second** composite binding, because tenant congruence is structural (`0055:414-417`
states it in so many words):

- **`tax_account_treatments` and `tax_entry_treatments` name an account**, so
  `foreign key (account_id, firm_id, client_id) references clara.coa_accounts (account_id, firm_id,
  client_id)`. The target `uq_coa_account_id_tenant unique(account_id, firm_id, client_id)` **already
  exists** at `0058:56` and is used by nothing — without the FK a treatment row can name one tenant's
  client and another tenant's account, and the add-back is computed off a foreign account's balance.
- **`ca_asset_years` names an asset**, and `clara.fixed_assets` has **no** `(id, firm_id, client_id)`
  unique to bind to — its PK is `id` alone (`0003:155`). **PR-3 adds `constraint uq_fa_id_tenant unique
  (id, firm_id, client_id)`** — additive DDL, no body replacement — and the table takes
  `foreign key (fixed_asset_id, firm_id, client_id) references clara.fixed_assets (id, firm_id,
  client_id)`. This is the same move `0058:56` made for `coa_accounts`.

**Class B — the six platform-scoped relations.** `tax_authorities` · `tax_treatment_codes` ·
`tax_rate_bands` · `capital_allowance_rates` · `tax_thresholds` · the field-pack map. These are law and
product vocabulary, not tenant data, and the estate's own effective-dated-policy-table idiom applies —
`metering-design.md:231-234` states it for `llm_price_table`: **`force row level security` with only an
owner policy, no `firm_id` column and no `clara_authenticated` grant**, read through a typed DEFINER
function. Giving them a `firm_id` would be the wrong shape, not a stricter one, and would make a
Malaysian tax band look like tenant data.

**Not a new relation:** the three report artifacts ride `report_runs` / `report_dataset_points`
(`0065:369-401`), which already carry `firm_id uuid not null references clara.firms(id)`, the composite
client FK and forced RLS. Only the field-pack **map** is new, and it is Class B.

---

## M5 · The `law_review_due` belt

*(Design §4.6's mechanism, moved here at v2. The ruling and the grant are unchanged.)*

Entered through `wake_raise_law_review_due` on the `proactive` kind (§M1). Each run reads
`tax_rate_bands`, `capital_allowance_rates`, `tax_thresholds` and `tax_authorities` and, for every row
whose `valid_through` falls inside the horizon, raises **one typed question to the firm's tax lead**,
naming the table, the row, its `authority_id`, its `accessed_at`, and **what refuses if it is not
trued**. Five properties make it a belt and not a reminder:

1. **It triggers on data**, so a quiet January is a measured fact rather than a missed run — law 80's
   shape: a clock may wake her, the WORK still triggers on data (R-L22).
2. **Idempotent per row per horizon** — the same expiring row raises once, not once a day.
3. **It resolves only by a seeded successor**, so "acknowledged" cannot silently become "handled".
4. **It never edits a rate.** Clara drafts the successor's content and cites it; the row lands by PR
   (R-L25). A belt that could write a rate would be a second seeding architecture (law 81).
5. **Its recipient is a role** — the tax lead, the same professional answerable for a treatment code's
   signature (OQ-7) — with the firm owner as an automatic fallback that **says it fell back**, so
   Annex D.3's option (c) cannot happen by drift.

A `valid_through` in the past is **not** an error state: the row still computes and the question is
already open, so the system degrades by asking rather than by stopping.

---

## M6 · The behavioural battery

Each cell makes a wall **refuse**. No cell asserts on source text (spelling is not identity), none
swallows a premise, and each forced cell asserts its precondition or exits by a named, counted
`skipHere`. **Every one of part 2 §9's twenty-one refusal strings has a row here** — v1.2 promised "each one
a battery cell" and covered seven of fourteen.

| # | Wall | Differential cell |
|---|---|---|
| C1 | no active close receipt ⇒ no computation | seal a close → computes; set `status<>'active'` → `close_not_sealed` |
| C2 | Clara cannot write a numeral | attempt an insert into `tax_account_treatments` with a fraction → **no such column**; attempt `apportionment_bp` without `approved_by` → CHECK refuses |
| **C2b** | **the human-keyed guarantee refuses the MACHINE, not only the NULL** | write `approved_by = apportionment_entered_by = clara.agent_user_id()` → **refuses** (`_tf_tax_treatment_human_only`); call `approve_tax_treatment` as the agent → refuses; as a real human → computes. Assert the eligible-approver census excludes `is_agent` by **enumerating** it, not by reading the verb's text |
| C3 | an unsigned treatment code is unusable | reference a code with `owner_signed_by IS NULL` → `treatment_code_unsigned`; sign it → computes |
| C4 | an untreated account is not allowable | leave one non-zero **`pl_rows`** account untreated → `account_untreated` naming it; treat it → computes |
| **C4b** | **the ladder reads `pl_rows`, not `closing_position`** | in ONE sealed receipt, assert the treated expense account is **present** in `snapshot->'pl_rows'` and **absent** from `snapshot->'closing_position'`; then move that account's movement only → R2 moves; move a balance-sheet account only → R2 does **not** |
| **C4c** | an unapproved treatment does not compute | propose without approving → `treatment_unapproved`; approve → computes |
| **C4d** | a treatment on a non-P&L account refuses | treat an asset account → `treatment_on_non_pl_account`; assert it is **not** silently nil |
| **C5b** | **the exclusion rung reduces adjusted income** | add an exempt-dividend line at R3 → assert R4 **falls** by the magnitude (A.2's sign rule); flip the account to a contra balance → assert the sign follows `account_type`, not `direction` |
| C5 | a missing rate row refuses, never carries forward | delete the YA row → `rate_row_missing_for_ya`; restore → computes. Also assert the **previous** year's row present does **not** rescue it |
| C6 | SME `not_evaluable` refuses, does not default to 24% | remove the paid-up attribute → `sme_facts_missing`; assert the charge is **not** 24% and **not** any number |
| C7 | a proven disqualification is decisive over a missing fact | set foreign holding 25% **and** remove the gross-income input → `not_eligible` (24%), not `not_evaluable` |
| **C7b** | **the SME facts are read AS AT, not as of now** | key paid-up 1,000 effective 2023-01-01 and 5,000,000 effective 2026-01-01; compute YA2024 → `eligible`; YA2026 → `not_eligible`; assert the YA2024 answer does **not** move when the 2026 row lands |
| **C8** | **a basis period that is not the sealed year refuses** | assert a `tax_basis_periods` row whose span ≠ the receipt's fiscal year → `basis_period_not_coextensive_with_close`; make it coincide → computes; delete it → `basis_period_undetermined` |
| **C9** | **more than one business source refuses** | `business_source_count = 2` → `multiple_business_sources_unmodelled`; remove it → `business_source_count_unknown`; set 1 → computes |
| **C10** | **a brought-forward figure is never a silent zero** | no `tax_carryforwards` row → `losses_brought_forward_unknown`; a **nil-asserted** row → computes with a nil deduction; a non-nil row while the U5 authority is unseeded → `loss_relief_rules_unread`. Assert the charge **differs** across the three |
| **C10b** | **the b/f business loss does not shelter non-business income** | b/f loss > aggregate business SI with non-business SI present → assert R7 floors the deduction at the business aggregate and the excess **carries**; assert total income is **not** reduced below the non-business amount |
| **C10c** | **the s.44(6) cap sits on aggregate income** | with a current-year loss AND an approved donation present, assert the cap = 10% × R7 (before the s.44(2) deduction), not 10% × (R7 − loss) |
| C11 | depreciation and CA are not the same read | change `fa_depreciation` only → R2 moves, R5 does not; change an asset's `ca_class` only → R5 moves, R2 does not |
| **C11b** | an unassigned CA class refuses | null an asset's `ca_class` → `ca_class_unassigned` naming the asset; assign it → computes |
| C12 | the MV QE cap bites both ways | new car, cost 140,000 → QE 100,000; same car `is_new=false` → QE 50,000; commercial van 200,000 → QE 200,000 |
| C13 | the SVA cap cascade is real, **and the excess is not stranded** | MSMC-eligible → no cap; flip the **C5 SME condition** to fail → the cap applies at RM20,000 **and** IA/AA runs on the balance (non-MSMC, RM35,000 of SVA assets → SVA line 20,000 **and** a non-zero IA/AA line; assert the CA total is **not** 20,000); make the **C2 SME condition** unknown → **`not_evaluable`, not the capped figure** |
| **C13b** | **a disposal without a statutory value refuses** | approve a disposal with `p_statutory_disposal_value_cents` null → `disposal_value_not_established`; key market value > proceeds → the balancing charge follows the **greater**; assert a below-market proceeds figure alone never computes |
| **C13c** | **the disposal write survives the immutability guard** | run a full disposal on an approved asset end to end → no CLR13, `disposal_value_cents` lands; assert the guard **still** refuses an unrelated baseline column on the same row |
| C14 | a transparent entity gets no entity charge | `entity_type='sole_prop'` → `entity_transparent_no_entity_charge`; assert the charge cell is **not** `0` |
| **C14b** | **CP204's year bindings are the right years** | move the `cp204_filings` row for `p_ya` → the 85% floor moves; move the row for `p_ya - 1` → the floor does **not**; delete `ya_target`'s basis period → `basis_period_undetermined` naming `ya_target`, never a fallback to the computed year's `months`; with no `p_ya` filing → `prior_estimate_unknown` and the estimate still computes |
| C15 | evaluator freeze holds | add a member without a migration → `verify_evaluator_freeze()` fails the migration run |
| **C15b** | **every relation the frozen body names exists at PR-6's apply** | on a rig at PR-6's tip, call the member for a client with **no** data of any kind and assert a full refusal rowset returns — no `relation … does not exist`, and no rung raising out of the ladder |
| C16 | the pack's only egress is human | enumerate the run's terminal transitions and assert the `issued` transition's actor is a human principal and `issue_mode` names them; assert `wake_fn_allowlist` contains no member of the pack's egress set (**positively**, by enumerating it, not by grepping for a name) |
| C17 | the ladder never reads a counterparty identifier | assert the member's plan touches no `counterparties.tin` / `.registration_no` (D-17); the name-only wall stays armed while F-T3's client attributes exist |
| C18 | a citation is structurally present | every `report_dataset_point` whose treatment is `direction='add_back'` resolves to ≥1 `tax_authorities` row; break the FK → the seal refuses |
| **C18b** | **a missing client identifier refuses the pack** | remove the client's `kind='tin'` row from `client_identifiers` → `entity_identifier_missing`; assert the pack does not render a blank TIN field |
| **C19** | **a superseded form version refuses the pack** | pin a map to `form_version` X, publish Y → `form_version_superseded`; re-map to Y → renders |
| **C20** | **a mixed account refuses until it is split or overridden** | flag an account mixed → `mixed_account_needs_split`; add an approved `tax_entry_treatments` row for the exceptional line → computes |
| **C21** | **every refusal string is persistable** | for each of the twenty-one strings, assert a seeded `metric_na_reason_versions` row exists and a `metric_cell` carrying it inserts; assert a string with **no** reason row cannot be persisted, only raised |

**A note on C13's cross-references.** v1.2's C10 read "flip C5 to fail → cap applies; make C2 unknown →
`not_evaluable`", which pointed at the *battery's* C5 (the rate-row cell) and C2 (the numeral wall)
rather than the *SME predicate's* conditions C5 and C2 (design §6). The mis-reference is corrected above
by naming them "the C5 SME condition" and "the C2 SME condition" explicitly.
