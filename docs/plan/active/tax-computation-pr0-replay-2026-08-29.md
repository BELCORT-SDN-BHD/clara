# F-T3 PR-0 — the rig replay, measured at the live frontier (2026-08-29)

> **This is PR-0's discharge.** The design set (`tax-computation-design.md` v2 §1-§7 ·
> `-design-part2.md` §8-§13 · `-annexes.md` · `-annexes-2-mechanics.md`) and the gate record
> (`tax-computation-gate-record.md`) were authored **design-stage, with no rig run** — every DB claim
> in them is a *source read*. This file replaces those predictions with **measurements taken on a
> throwaway `postgres:17` at `main` = `7e9180df`**, and says, per claim, what changes in the design.
>
> **Rig provenance.** `postgres:17` container `clara_ft3_pr0`, port 33601, password minted per-run and
> env-only (never argv, never a file in this repo); `packages/db/scripts/migrate.mjs` applied
> **0001 → 0147, 142 files, all green**; then `seed.mjs` (2 seed files). Every body below was read with
> `pg_get_functiondef` / `pg_get_constraintdef` / `prosrc`, never from migration file text, except where
> a *file line pin* is the thing under test. Every behavioural probe ran inside a transaction and was
> rolled back. **The rig was destroyed at the close of this lane** (§7).
>
> **Ledger correction, counted not remembered:** the repo carries **142 migration files, `0001`-`0147`**
> (gaps: `0032`, never minted; `0073`-`0076`). *`packages/db/README.md`'s ledger still says
> "131 files, `0001`-`0136`" — stale by eleven; the harness-sync sweep owes it.*
>
> **Verdict: PR-1 is BUILD-READY.** No measurement contradicts the severance, the ladder shape, or the
> PR ordering law. Fifteen predictions are discharged: **nine CONFIRMED, three RE-CUT, two
> HALF-REFUTED, one WITHDRAWAL upheld.** Eleven design deltas (§3) must ride PR-1's doc bump to v1.3.
> Three new owner questions join the three standing cards (§4).

---

## 1 · The measurement table

Every row: the claim as the design states it · what it predicted · what the rig **measured** · the
verdict · what changes.

### 1.1 Annex C's fifteen predictions

| # | Claim | Predicted | MEASURED at 0147 | Verdict | Change |
|---|---|---|---|---|---|
| **P-1** | `metric_cells.cell_status` domain | `('ok','undefined','absent','refused')` | `metric_cells_cell_status_check` = `cell_status = ANY (ARRAY['ok','undefined','absent','refused'])` | **CONFIRMED** | none |
| **P-2** | freeze fails a migration appending a member without its function | aborts the run | appending `clara.no_such_function_v1(uuid)` to a closure → `verify_evaluator_freeze()` raises **CLR10** `evaluator freeze closure incomplete` | **CONFIRMED** | none |
| **P-3** *(re-cut)* | `closing_position` is balance-sheet-only; `pl_rows` is the P&L array | differential seed | **read from the LIVE `finalize_close` body** (prosrc sha `59ebaa4f…`): `v_closing_pos` = `jsonb_object_agg` over `trial_balance_as_of(client, ends_on)` **joined to `coa_accounts`** `where a.account_type in ('asset','liability','equity') and (t.debit_cents - t.credit_cents) <> 0`. `v_pl_rows` = `jsonb_agg({account_code, account_type, movement_cents})` over `coa_accounts where a.account_type in ('income','expense')`, movement = TB(`ends_on`) − TB(`starts_on−1`), **`where m.mv <> 0`** | **CONFIRMED — by a stronger instrument than the one predicted** | **the builders live in `0128`, not `0056`** (§3 D-1) |
| **P-4** | `uq_cr_one_active_close` makes "the sealed close" one row | one active per FY | `CREATE UNIQUE INDEX uq_cr_one_active_close ON clara.close_receipts (fiscal_year_id) WHERE kind='close' AND status='active'` | **CONFIRMED** | none |
| ~~**P-5**~~ | `record_client_fact` takes an as-at date | already withdrawn | live sole signature `record_client_fact(uuid,text,jsonb,text,text,uuid,text)`, 7 args, **no as-at**; body carries `jsonb_typeof`, the `enum:` arm, the `msic` arm, `fact_value_invalid` and `_human_ctx`; `uq_client_fact_live` = `unique(client_id, fact_key) where superseded_at is null` | **WITHDRAWAL UPHELD** | none — D-3's re-cut rests on a catalog read now |
| **P-6** | `dispose_fixed_asset`'s pin is `0041:3643` | the `create function` line | file `0041:3643` **is** `create function clara.dispose_fixed_asset(...)`; **single definition estate-wide** (no later CoR). Live pin: `clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)` · prosrc sha256 `a2dbb8bd9cc5c3c0c3cc9c7e17731d1198635b54d0655245df9a498b7b82b872` · functiondef sha256 `58608a88c59e731c76082adf2463426531aed8f6a721e8cc2999c395dfbc7f73` · 25 390 chars · SECURITY DEFINER · `search_path=clara,pg_temp` · owner `clara_fn_owner` | **CONFIRMED** (GN-1's nit closed) | pin the shas, not the line |
| **P-7** | statutory templates refuse the agent, admit the human admin | both arms | **mechanism, not comment**: `clara._publish_report_template_core(...)` raises `CLR04` `statutory_template_human` on `p_wake_kind is not null and p_report_class = 'statutory'`. The human door resolves `clara._human_ctx(clara.role_rank(case p_report_class when 'statutory' then 'admin' else 'bookkeeper' end))` — a **role floor**, not a refusal | **CONFIRMED** | **cite the CoR'd core, not `0069:121`** (§3 D-2) |
| **P-8** | `fixed_assets.ca_class` carries no CHECK domain | no CHECK | twelve CHECKs on `clara.fixed_assets`; **none names `ca_class`** | **CONFIRMED** | PR-1's CA rate-table keys are unconstrained by the register — F-T3 owns the closed set |
| **P-9** | `deployed` cannot be flipped by a plain UPDATE | the script is the only door | **a plain `update … set deployed=true` from the BARE migration principal SUCCEEDS.** Under `set role clara_fn_owner` it raises **CLR08** `evaluator deployment requires the migration ceremony principal`. A second flip and an un-deploy both raise CLR08; a born-deployed INSERT raises CLR08 | **RE-CUT** | the wall is `current_user = session_user` **+** one-way-once **+** a `verify_evaluator_freeze()` precheck — **not** "only `deploy-evaluator-version.mjs`" (§3 D-3) |
| **P-10** | (a) the freeze covers **undeployed** rows · (b) the hash moves on an **ACL / owner / `search_path`** change | both hold | **(a) CONFIRMED, behaviourally.** All 8 registry rows are `deployed=false` on a fresh rig and the checker returns `{"ok":true,"verified_deployed":0,"verified_registered":8}`; mutating an UNDEPLOYED member's `search_path` raises CLR10. **(b) HALF-REFUTED.** `alter function clara._hash(jsonb) owner to postgres` → functiondef sha **unchanged** (`80653b22…` → `80653b22…`), checker **passes**. `grant execute … to clara_authenticated` → sha **unchanged**, checker **passes**. `alter function … set search_path` → sha `80653b22…` → `5d0f03ff…`, checker raises **CLR10** `evaluator freeze mismatch` | **HALF-CONFIRMED / HALF-REFUTED** | **D-16's conclusion survives on a different, measured argument** (§3 D-4) |
| **P-11** | the immutability allowlist is the six lifecycle columns, and a non-allowlisted UPDATE on an approved row raises CLR13 | CLR13 | live `v_mutable := array['status','disposed_at','disposal_entry_id','superseded_by_asset_id','superseded_at','updated_at']` — **exactly the six**, UNION nine particulars columns **while `clara._fa_particulars_complete(OLD)` is false**. On a genuinely approved asset: `cost_cents` UPDATE → **CLR13** `an approved fixed-asset baseline is immutable`; the six lifecycle columns → succeed | **CONFIRMED, both directions** | **plus a new finding** — `ca_class` freezes once particulars complete (§3 D-5, OQ-10) |
| **P-12** | `_fa_on_approve`, not `dispose_fixed_asset`, writes the register row | trace | `dispose_fixed_asset`'s live prosrc contains **no** `update clara.fixed_assets` (regex over `prosrc`, live). `_fa_on_approve` (prosrc sha `7ffa9a71…`, 28 520 chars) **does**; its partial path INSERTs a `"(disposed portion)"` row and a continuing row, **both carrying `ca_class`/`is_commercial_vehicle`/`is_new` forward** | **CONFIRMED** (the negative half is decisive; the end-to-end trace arm rides PR-3's battery) | M3.5's supersede-edge model is right |
| **P-13** | `metric_cells` refuses a reasonless non-`ok` cell; `t_scope_cell_na_reason` refuses a cross-firm binding | both arms | arm 1: `metric_cells_check3` = `COALESCE(((cell_status='ok' AND na_reason_version_id IS NULL AND …) OR (cell_status<>'ok' AND na_reason_version_id IS NOT NULL AND exact_numerator IS NULL AND exact_denominator IS NULL AND displayed_scale IS NULL AND displayed_text IS NULL)), false)` — fail-closed on NULL. arm 2: `_tf_metric_catalog_scope`'s na_reason arm resolves `pf` from `metric_na_reason_versions.firm_id` and the verdict is `if scoped and pf is not null and pf is distinct from cf then raise CLR11` | **CONFIRMED** | **`pf is not null` is load-bearing**: a `firm_id = NULL` (platform) reason row is lawful for **every** firm — which is the shape PR-1's 21 rows must take (§3 D-6) |
| **P-14** | `coa_accounts` has `uq_coa_account_id_tenant`; `fixed_assets` has **no** `(id, firm_id, client_id)` unique, so PR-3 adds `uq_fa_id_tenant` | first true, second true | first **TRUE**: `uq_coa_account_id_tenant UNIQUE (account_id, firm_id, client_id)`. second **FALSE**: `clara.fixed_assets` already carries **`uq_fixed_assets_id_firm_client UNIQUE (id, firm_id, client_id)`**, plus `firm_id`, `client_id`, and two composite journal-entry FKs | **HALF-REFUTED** | **PR-3 must NOT add `uq_fa_id_tenant`** (§3 D-7) |
| **P-15** | `wake_credentials`' two CHECK families are as `0011:618-628` shows | 3-value kind domain; autodraft⇔client pairing | behaviourally **both arms CONFIRMED**: `autodraft` + NULL `client_id` → check_violation; `proactive` + non-NULL `client_id` → check_violation. **But the CHECK text is stale by four kinds**: live domain = `interactive · proactive · autodraft · interactive_client · close_prep · bank_agent · filing`, and the pairing CHECK has **six** arms | **CONFIRMED (conclusion) / STALE (evidence)** | re-derive M1.2's quoted CHECKs from the live catalog (§3 D-8) |

### 1.2 The headline items the lane brief named

| Claim as written | MEASURED | Verdict |
|---|---|---|
| **D-16/D-17: `client_fact_keys` is four rows** (gate record §2 GB-3; survey §2.5 lists four) | **FIVE**: `banking_arrangement` · `customer_identity_policy` · `entity_type` · `msic` · `trade_nature`. The fifth is F-T4 §2.3 / F-A3 X-1's `banking_arrangement` (`enum:BANKING_ARRANGEMENT_V1`). Every one is `enum:*` or `format_only`; the table carries **no `firm_id`** (platform-scoped) | **doc stale by one row; GB-5's conclusion UNCHANGED** — none of F-T3's seven fact shapes is an enum, so the fail-closed dispatch would still refuse all seven |
| **`0041`'s `ca_class` trio is "written by the register and read by nothing"** | `ca_class` now appears in **twelve** files. Beyond `0041` and its two db tests, it is **read and written by the frontend**: `apps/web/lib/registers/fixed-assets.ts`, `apps/web/components/registers/fa-particulars-fields.tsx`, `apps/web/components/registers/fa-row-actions.tsx`, and `apps/dashboard/app/assets/assetsModel.ts` | **"read by nothing" is STALE.** "F-T3 is its first **computational** consumer" **HOLDS** — no evaluator, no metric, no report reads it |
| **Zero repo hits for `cp204` / `form_c` / `add_back` / `chargeable`** | `cp204` **0** · `add_back` **0** · `year_of_assessment` **0** · `form_c` **14 hits, every one the substring inside `clara._freeform_core`** (`0131`) · `chargeable` **~19 hits, every one the depreciation/FA sense** ("chargeable to the P&L"), none tax-chargeable-income | **HOLDS**, with the two false-positive classes now named so the next re-grep does not re-raise them |
| **The number path is live but has never carried a run** | after `migrate` **and** `seed` at 0147: `firms` 2 · `clients` 3 · `coa_accounts` 39 · `journal_entries` 3 · and **ZERO** for `fiscal_years`, `close_receipts`, `reporting_periods`, `period_snapshots`, `metric_input_snapshots`, `metric_evaluation_contexts`, `report_runs`, `report_datasets`, `metric_cells`, `fixed_assets`, `client_facts`, `client_identifiers` | **CONFIRMED and WIDENED.** No `report_run` has ever opened on the rig. The empty set is larger than F3 named: `metric_cells` is `NOT NULL` on `evaluation_context_id`, so the chain F-T3 must ride is *snapshot → evaluation context → cell → period → run*, and **all four links are empty on a fresh estate** |
| **Live's state** (from `PROGRESS.md`) | the posture line says "zero `fiscal_years` rows; activation is the first human `open_fiscal_year`… zero `reporting_periods`/`period_snapshots`", but the 磨合 lane row records **"T1 executed the estate's FIRST `open_fiscal_year` (rung 5, judged honest)"** | **`PROGRESS.md` disagrees with itself.** Flagged for the harness-sync sweep; F-T3 must re-read live rather than either line |
| **`dispose_fixed_asset` prosrc pin, verified LIVE by sha** | see P-6 | pinned |
| **The evaluator roster / what F-T3's ONE-member closure must look like** | §1.3 | — |

### 1.3 The evaluator surface, measured

**Registry (8 rows, all `deployed=false` on a fresh rig — the flip is a ceremony act against live):**

| `evaluator_name` | v | `migration_version` | members | lane |
|---|---|---|---|---|
| `assess_metric_cell_independent` | 1 | `0059_wave_e_delta_metrics_behavior` | 2 | Wave E δ |
| `evaluate_metric` | 1 | `0059_wave_e_delta_metrics_behavior` | 10 | Wave E δ |
| `evaluate_witness_identity` | 1 | `0091_f_a1_identity_helper` | **1** | F-A1 |
| `evaluate_witness_fact_state` | 1 | `0092_f_a1_predicate` | 4 | F-A1 |
| `evaluate_witness_fact_state` | 2 | `0100_f_a2_nil_tax_arm_part2` | 4 | F-A2 opener ① |
| `evaluate_fs_pack_agent` | 1 | `f_a5_reporting_agency_pr1` (=`0111`) | 9 | **F-A5 PR-1** |
| `evaluate_metric` | 2 | `card1_substitution_seam` (=`0135`) | 9 | **F-A5b card-1** |
| `prepayment_schedule` | 1 | `0140_f_a4_pr_2a_prepayment_limb` | **1** | **F-A4 PR-2a** |

Four measurements follow, each load-bearing for PR-6:

1. **A ONE-member closure is precedented and lawful.** `evaluate_witness_identity v1` and
   `prepayment_schedule v1` both carry exactly one member. `verify_evaluator_freeze()`'s
   `entry_count <> 1` gate wants exactly one member whose `member_signature = entrypoint_signature`,
   which a singleton satisfies. **D-16's shape builds.**
2. **Members are SHARED across closures, and that is the real argument for D-16.** `clara._hash(jsonb)`
   is a member of three closures; `_metric_selector_account_ids`, `_metric_input_dataset_v1`,
   `_metric_context_sha256_v1` and `_metric_resolved_inputs_sha256_v1` of three each. The probe proves
   it: mutating `evaluate_witness_identity_v1` made the checker raise naming
   **`evaluate_witness_fact_state`** — a different closure. A self-contained member calling only
   built-ins shares nothing and adds exactly **one** body to the frozen surface.
3. **`evaluator_versions` and `evaluator_version_members` both carry a nullable `firm_id`; all 8 rows
   and all 40 member rows are `firm_id = NULL`.** F-T3's rows are platform-scoped, like every sibling.
4. **`frozen-evaluators.json` and the DB registry DISAGREE.** The manifest holds **9 entries, all
   `deployed: true`**; `clara.prepayment_schedule_v1` (0140) is in the **DB** registry and **absent from
   the manifest**, because `check-frozen-evaluators.mjs` discovers only the `clara.evaluate_*` spelling.
   That is the half-freeze the manifest's own notes warn about, recurring at 0140. F-T3's member is
   correctly named `clara.evaluate_tax_computation_v1` and **must stay so**.

**What F-T3's ONE-member closure must look like, exactly:**

```
clara.evaluator_versions:
  firm_id              = NULL                                    -- platform, like all 8 siblings
  evaluator_name       = 'evaluate_tax_computation'
  version              = 1
  entrypoint_signature = 'clara.evaluate_tax_computation_v1(uuid,integer)'   -- int -> integer
  closure_sha256       = sha256(convert_to(encode(<member body_sha256>,'hex'), 'UTF8'))
  migration_version    = <this migration's label>
  deployed             = false                                   -- forced: _tf_evaluator_deploy_once

clara.evaluator_version_members:            -- exactly ONE row
  firm_id = NULL · ordinal = 0
  member_signature = 'clara.evaluate_tax_computation_v1(uuid,integer)'   -- == entrypoint
  body_sha256      = sha256(convert_to(pg_get_functiondef(...)::text,'UTF8'))

frozen-evaluators.json:  ONE appended entry, "clara.evaluate_tax_computation_v1",
  "deployed": false.  DO NOT run --lock-deployed (it is BLANKET).
```

---

## 2 · The corrected merge order

The design (part 2 §12) states: *"Live claimants in merge order are **F-A5 PR-2 + the C-flip ceremony
→ F-A8 PR-1 → F-T3**, with F-A9 **not** a claimant."* **Two of its three terms are wrong at `main`.**

| Design says | Measured at `7e9180df` |
|---|---|
| F-A5 **PR-2** registers | the registration is **F-A5 PR-1** (`0111`, `evaluate_fs_pack_agent v1`). PR-2 (`0112`) registers nothing; **"the C-flip" is a *deploy* act on PR-1's row**, and it has run (manifest `deployed: true`) |
| F-A8 PR-1 is next | **F-A8 has NOT merged** — `PROGRESS.md` shows the lane at state `design`, no PR, and it registers nothing today |
| F-A9 is not a claimant | **correct, and confirmed**: no `evaluator_versions` row names it |
| *(unlisted)* | **F-A5b card-1** (`0135`, `evaluate_metric v2`) landed and its BL-3 flip DEPLOYED it |
| *(unlisted)* | **F-A4 PR-2a** (`0140`, `prepayment_schedule v1`) landed, dark |

**The corrected order, as at `main` = `7e9180df`:**

> **LANDED, in merge order:** F-A5 PR-1 (`0111`) → F-A5b card-1 (`0135`) → F-A4 PR-2a (`0140`).
> **UNLANDED and unscheduled ahead of F-T3:** F-A8 PR-1 (design only). F-T1's SST tables are still the
> stated ordering intent for PR-1's *seeded-law family*, and F-T1 claims **no** evaluator.
> **F-T3 is therefore the fourth registration** if F-A8 slips, the fifth if it lands first.

**And the ordering constraint is weaker than the design assumed.** Both the registry and the manifest
are **append-only**, and `verify_evaluator_freeze()` iterates all rows regardless of order — so F-T3
does **not** have to be last. Merge order matters for exactly one thing: **manifest conflict
resolution**, and the standing rule is unchanged (*a manifest conflict is NEVER resolved by dropping
another lane's key*). F-T3 is no longer gated on F-A5 PR-2 or the C-flip: **both are done.**

**One new cross-lane hazard, measured.** All 9 manifest entries are currently `deployed: true`, so a
`--lock-deployed` today is a no-op. The moment F-T3 appends its **dark** entry, any *other* lane running
`--lock-deployed` (which is **BLANKET**, per `packages/db/README.md`) would stamp F-T3's entry as
deployed while the DB row is still `deployed=false`. **PR-6's body must say so, and PR-0's note to the
conductor must carry it.**

---

## 3 · Design deltas — the v1.3 list PR-1 must carry

*Edits, not made here. The design files are untouched by this lane.*

**D-1 · `tax-computation-design.md` §3 R1/R2/R3 · `-annexes.md` A.2 · gate record GB-1 — re-cite the
snapshot builders to `0128`.** `clara.finalize_close` has **three** definitions: `0056:2003` (create),
`0120:267` (CoR), `0128:128` (CoR). Every `0056:2138-2158` / `0056:2285-2292` cite in the set points at
a body **superseded twice**. The substance survives — I measured the live body and both builders are as
GB-1 described — but the citations are the superseded-body class. Re-cite to `0128:307` (`into
v_pl_rows, v_pl`) and `0128:463`/`:473` (the snapshot assembly). *Two `0056` cites DO still resolve and
should be kept:* `uq_cr_one_active_close` at `0056:1544` and the write belt's refusal text at
`0056:1554` (`_tf_close_receipts_belt`, single definition, live prosrc sha `3080e4fb…`).

**D-1b · the gate record's "table comment at `0056:1503`" overstates its instrument.**
`obj_description('clara.close_receipts')` is **NULL** and the table carries **zero** column comments —
`0056:1503` is a SQL `--` comment in the file, not a catalog `COMMENT ON`. GB-1's *two* independent
catalog confirmations are really **one** (the belt's live refusal text) plus a file comment. The finding
is unaffected; the framing should be honest.

**D-2 · part 2 §8 · mechanics M1.3 — the statutory wall moved.** `0069:121` is superseded: the refusal
now lives in `clara._publish_report_template_core(uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,
jsonb,date,text)` as `if p_wake_kind is not null and p_report_class='statutory' then raise CLR04
statutory_template_human`. Cite the core. And note the human side is a **role floor**
(`role_rank('statutory' → 'admin')`), not a second refusal — `publish_tax_form_field_map`'s "rides
`publish_report_template_version`'s human-only wall" should say *rides the admin-rank floor*.

**D-3 · Annex C P-9 — re-word.** *"`deployed` cannot be flipped by a plain UPDATE"* is false as measured.
Correct: **`_tf_evaluator_deploy_once` is the only door, and it admits a plain UPDATE from a session
holding NO active `SET ROLE` (`current_user = session_user`), exactly once per row ever, and only after
`verify_evaluator_freeze()` passes.** `deploy-evaluator-version.mjs` is the *recipe*, not the wall.

**D-4 · `-design.md` §3's D-16 block · `-annexes.md` D-16 — replace the rationale, keep the ruling.**
The stated reason *"a later **ACL, owner** or `search_path` change to any member raises at that later
lane's apply"* is **wrong on two of three limbs**: `pg_get_functiondef` renders body, language,
volatility, `SECURITY DEFINER`, strictness, cost/rows and `SET` config — **not** the owner and **not**
the ACL. Measured: owner change → sha unchanged, checker passes; ACL change → sha unchanged, checker
passes; `search_path` change → sha moves, checker raises CLR10. **The ruling (ONE member) stands on the
two measurements that DO hold:** (i) the checker ignores `deployed` entirely — proven behaviourally, not
by reading the `for` loop; (ii) closures **share** members, so one helper's attribute change raises for
every closure naming it. Rewrite D-16 around those.

**D-5 · mechanics M3.4 · part 2 §11 PR-3 · battery C11b — `ca_class` is not freely correctable.**
`clara._tf_fixed_assets_immutable_0017()`'s allowlist admits `ca_class`, `is_commercial_vehicle` and
`is_new` **only while `clara._fa_particulars_complete(OLD)` is false** — that predicate is
`depreciation_start_date is not null AND depreciation_method is not null AND (…life/residual/rate…)`,
and says nothing about `ca_class`. **Measured: once particulars are complete, a `ca_class` UPDATE on an
approved asset raises CLR13.** Consequences: (a) battery cell **C11b as written is unbuildable** on a
particulars-complete asset; (b) a real asset registered with complete particulars and no `ca_class` can
**never** be classified in-product, so `ca_class_unassigned` becomes a permanent refusal with no remedy.
PR-3 must widen the allowlist for the three CA columns behind a human door, or F-T3 must route the
correction through the supersede path. **→ OQ-10.**

**D-6 · part 2 §9 · PR-1's seed obligation — the reason rows are PLATFORM rows.**
`clara.metric_na_reason_versions` already holds **9 rows, every one `firm_id = NULL`**, unique on
`(firm_id, reason_key, version) NULLS NOT DISTINCT`, with `cell_status in ('undefined','absent',
'refused')` — **`'ok'` is not a legal value**, which the §9 mapping already respects. `_tf_metric_catalog
_scope`'s verdict conjunct `pf is not null` is what makes a platform row lawful for every firm. **PR-1's
twenty-one rows land `firm_id = NULL`, `version = 1`, with an `effective_from`** (the 9 live rows use
`2020-01-01`) and a `display_token` (all 9 use `—`). State this; the design currently says only "seeds
one row per string".

**D-7 · mechanics M4 · part 2 §11 PR-3 — DELETE `uq_fa_id_tenant`.** `clara.fixed_assets` **already**
carries `uq_fixed_assets_id_firm_client UNIQUE (id, firm_id, client_id)`, plus `firm_id`, `client_id`,
`fk_fa_acquisition_entry_congruent` and `fk_fa_disposal_entry_congruent`. `ca_asset_years`' tenant FK
binds to the **existing** constraint. The `0003:155` "its PK is `id` alone" cite is stale by the whole
Wave-D/E arc. PR-3 loses one DDL statement and gains nothing.

**D-8 · mechanics M1.2 — re-derive the wake CHECKs from the live catalog.** The quoted
`0011:618-628` block is stale by four kinds. Live:
`ck_wake_credentials_kind_0011` = `interactive | proactive | autodraft | interactive_client |
close_prep | bank_agent | filing`; `ck_wake_credentials_client_0011` has six arms
(`autodraft`/`interactive_client`/`close_prep`/`bank_agent` require a client; `interactive`/`proactive`/
`filing` require none). **The conclusion is unchanged and now measured** — `autodraft` for the two
client-scoped writes, `proactive` for the belt, no new kind, no CHECK extension.

**D-8b · PR-8's allowlist delta is measurable.** `clara.wake_fn_allowlist` holds exactly **one**
`proactive` row today (`wake_record_notification`). PR-8 makes it **two**. `wake_fn_allowlist` carries
three columns (`wake_kind`, `function_name`, `fn_name`) and `assert_wake_allowed` matches on
`function_name`.

**D-9 · part 2 §9 — a new refusal string is owed: the receipt may carry no `pl_rows`.**
`_tf_close_receipts_belt` enforces the presence of **`closing_position` only** (`belt_reads_pl_rows =
false`, measured). `pl_rows` is present by `finalize_close`'s construction and by **nothing else** — no
belt, no CHECK, no trigger. F-T3's whole ladder reads an **unenforced** key. R1 needs a named refusal for
"the active receipt carries no `pl_rows` array" (proposed: **`close_snapshot_missing_pl_rows`**, mapping
to `absent`), a twenty-second reason row, and a battery cell. Today the design would read `null`
and either compute nil add-backs or raise out of the ladder — the exact failure §9 promises never happens.

**D-10 · part 2 §11 PR-6 — the run wrapper's obligations are larger than stated.** `metric_cells` is
`NOT NULL` on `evaluation_context_id`, and `_tf_metric_cell_provenance_complete` (a DEFERRED constraint
trigger on both `metric_cells` and `metric_cell_periods`) requires `inputs->'normalized_provenance'` to
carry **all seven family keys** — `period_ids`, `snapshot_ids`, `account_set_version_ids`,
`constant_version_ids`, `entry_ids`, `document_ids`, `presentation_map_version_ids` — **an absent key is
not an empty list**, and each must reconstruct its child table exactly or CLR11 fires at commit. So
PR-6's wrapper must mint a `metric_evaluation_contexts` row (which carries a `snapshot_id` →
`metric_input_snapshots`) and emit a complete manifest. The design says only "materialises
`metric_cells` (+ `metric_cell_periods`, + `na_reason_version_id`)".

**D-11 · §7 / A.3 R11 — `ya_target` has no period to stamp cells on.**
`clara.reporting_periods.grain` is `CHECK (grain in ('month','fiscal_year'))` and
`ck_rp_fy_present` makes `grain='fiscal_year'` ⟺ `fiscal_year_id IS NOT NULL`. `metric_cell_periods`
binds every cell to a `reporting_periods` row and `report_runs` binds `(reporting_period_id, firm_id,
client_id, period_start, period_end)`. **There is no year-of-assessment grain, and a
`grain='fiscal_year'` row for `ya_target = p_ya + 1` requires a `fiscal_years` row for a year that, by
s.107C(1)-(2)'s own timing, has not begun.** §7's "R11's cells are stamped on `ya_target`'s period" is
not buildable as written. **→ OQ-12.**

---

## 4 · The owner's sitting — three standing cards, three new

Each card: **one question · the options · what each costs · the recommendation · the fail-closed default
if the sitting does not reach it.**

### D.1 · OQ-1 — what is F-T3's acceptance bar, given there is no oracle?

**Unchanged in substance; the gate's argument is now sharper, and there IS a concrete alternative.**
The measurements make the case: every one of the thirty-five battery cells proves a *wall*, and
**GB-1 (the ladder wired to the wrong key) and GB-2 (two rungs in each other's place) would both have
passed the whole battery**. A wall test cannot catch a ladder error.

| Option | Cost to you | What it buys |
|---|---|---|
| **(a) the concrete alternative — hand-work ONE tax computation off a P&L you already have.** Survey §5 measured that `Rome Properties YA2025 Files/RPR - Management Accounts` holds a **Trial Balance and a P&L for YA2025**. The corpus has no *tax computation*, but it has the *input to one*. You or the firm's tax agent works RPR's YA2025 ladder — R1 to R10 — on paper or in a spreadsheet, once, from figures that already exist | **a few hours, once, on numbers already in your folder.** No new client data, no new client | the only instrument that catches a whole-ladder error; a permanent regression bar the battery can be diffed against, rung by rung |
| (b) acceptance = the battery + a review of Annex A.3 | nothing now | ships sooner; the ladder error stays possible until Wave G |
| (c) synthetic ROME PUBLIC ADVISORY only | nothing now | proves arithmetic against numbers we invented — circular |

**Recommendation: (a) for ROME PROPERTIES YA2025, (b) for everything else.** RPR is the right company:
it is a Sdn Bhd (so the whole R7-R11 company ladder runs), and if it has any fixed assets the bar
exercises capital allowances too. *If it has none, pair (a) with OQ-2's synthetic asset population so
R5 is not left unbarred.*

**Cost of being wrong:** a wrong bottom line on a document a human signs and files. **Fail-closed
default if unanswered: PR-1 through PR-6 build and merge; PR-7 (the artifacts) does NOT.** The ladder is
computable and inspectable; nothing reaches `issued`. That keeps the lane moving without letting an
unbarred number become a sealed statement.

### D.2 · OQ-7 — whose signature signs a treatment code?

**Unchanged, and now measurably narrower in scope.** The COA dossier (裁-21) gives twelve
citation-backed add-back families with their statutory references already drafted (§5), so the signing
act is *reviewing ~12-40 pre-drafted code rows*, not authoring them.

| Option | Cost | Risk |
|---|---|---|
| (a) the owner personally | your time, ~30-40 codes once | your name on a technical citation you may not have drafted |
| **(b) a named licensed tax agent (who may be you), licence reference recorded on the signature row** | the same time, plus recording the licence | nothing obvious — it matches how the statutory boundary is actually held |
| (c) whoever is available | least friction | the signature stops meaning anything specific |

**Recommendation: (b).** It also answers D.3's "tax lead" by the same name.
**Fail-closed default: `owner_signed_by` is `NOT NULL` and an unsigned code is unusable** — so with no
ruling, PR-1 seeds the code rows **unsigned** and every treatment refuses `treatment_code_unsigned`.
Nothing computes wrongly; it simply does not compute.

### D.3 · OQ-8 governance half — who owns the annual duty to true the law?

**Unchanged.** The product half is granted and designed (§4.6 / M5).

| Option | Cost | Risk |
|---|---|---|
| **(a) a named tax lead (same person as D.2), the annual true-up written as a standing duty** | one named person; a real January obligation | reassignment on departure — the belt makes that visible |
| (b) the belt raises to the firm owner every time | no designation | the owner becomes the tax-law maintainer by default |
| (c) nobody named | nothing | this is how it silently breaks |

**Recommendation: (a), with (b) as the automatic fallback that says it fell back.**
**Fail-closed default: (b).** The design already specifies the fallback, so (c) cannot happen by drift.

### D.4 · **NEW — OQ-10 · a fixed asset's CA classification becomes uncorrectable. Which door reopens it?**

**Measured, not predicted.** On an approved asset whose depreciation particulars are complete,
`update clara.fixed_assets set ca_class = …` raises **CLR13** — the immutability allowlist admits
`ca_class`/`is_commercial_vehicle`/`is_new` **only while particulars are incomplete**. So an asset that
was registered fully but tax-blind (which is every asset in the estate today, by `0041`'s own design
note: *"NOTHING until Wave F verifies CA facts"*) can never be classified. `ca_class_unassigned` would
be a permanent refusal with no in-product remedy, and **R5 would refuse for every existing asset**.

| Option | Cost | Risk |
|---|---|---|
| **(a) PR-3 widens the unconditional allowlist to the three CA columns, behind a new human door `set_ca_classification` (bookkeeper+, audited, reasoned)** | one more verb + one more allowlist splice in the same D1 window PR-3 already owns | the three columns become permanently mutable on an approved row — mitigated by the door being the only writer and the change being receipted |
| (b) corrections go through the existing supersede path (`_fa_on_approve`'s split) | no new door | a supersede mints a new asset id and re-bases the CA schedule; using it to fix a *classification* misstates the register's history |
| (c) leave it — `ca_class` is set at acquisition or never | nothing | every asset acquired before F-T3 refuses forever; capital allowances never compute for the existing population |

**Recommendation: (a).** It is the smallest change that makes R5 reachable, it rides a D1 window PR-3
already owns, and a classification is a *judgement about tax law*, not a *baseline accounting fact* — it
belongs in the mutable set the way `status` does.
**Cost of being wrong: (c) is the silent version of the same failure** — it looks like the design working
(a named refusal) while actually meaning capital allowances never compute for any real client.
**Fail-closed default if unanswered: (c)** — R5 refuses `ca_class_unassigned` by name for every asset,
which is honest but makes F-T3's most arithmetically intricate half dead on arrival.

### D.5 · **NEW — OQ-11 · the s.44(6) donation cap is a return-level figure the add-back model cannot express.**

*(Raised by the 裁-21 COA cross-reference; the conductor has already ruled the mapping-table half — see
§5. This is the residue that is genuinely the owner's.)* The design's `ADDBACK_DONATION_100` applies a
flat `fraction_bp = 10000` to a donation account's movement. But an **approved-institution** donation is
not an add-back at all: it is an **s.44(6) deduction capped at 10% of aggregate income** — a figure that
does not exist until R7. `fraction_bp × movement` structurally cannot express it.

| Option | Cost | Risk |
|---|---|---|
| **(a) v1 supports only the s.33(1) add-back of an UNAPPROVED-body donation; an approved-institution donation refuses by name (`s44_6_relief_unmodelled`) and the human keys it** | one more refusal string + a human-keyed field; the firm does one line by hand per return | a real, common deduction is manual in v1 |
| (b) build the cap into R8 now | R8 gains a second input class and a second human-keyed store | the cap interacts with R7's own loss floor; two rungs' arithmetic move at once, unbarred (OQ-1) |
| (c) apply 100% add-back to every donation account | nothing | **overstates the charge** on every client that donates to an approved institution — a wrong number on a signed return |

**Recommendation: (a).** The design already refuses six other things by name for exactly this reason;
this is the seventh. **Fail-closed default: (a).** **(c) must never be the default** — it is the only
option that produces a wrong number silently.

### D.6 · **NEW — OQ-12 · CP204 is for a year that has no period object. Where do R11's cells live?**

**Measured.** `reporting_periods.grain` is `month | fiscal_year` and a `fiscal_year` row requires a
`fiscal_years` row. R11 estimates for **`ya_target = p_ya + 1`**, whose fiscal year has not been opened
(s.107C requires the estimate *30 days before the basis period begins*). Every `metric_cell` must bind
to a period; every `report_run` names one.

| Option | Cost | Risk |
|---|---|---|
| **(a) the CP204 pack requires `ya_target`'s fiscal year to be OPEN, and refuses `cp204_target_year_unopened` otherwise** | the firm opens next year's fiscal year before drafting CP204 — which it must do anyway to keep books | one extra human act, correctly ordered |
| (b) extend `reporting_periods.grain` with a third value | a CHECK extension on a Wave-E table with live consumers, in F-T3's window | widens a shared surface for one item's convenience — a second grain vocabulary (law 81) |
| (c) stamp R11's cells on `p_ya`'s period | nothing | the cell says it is about a year it is not about; `metric_cell_periods` becomes a lie |

**Recommendation: (a).** It is the only option that adds no shared-surface change and no untruth.
**Fail-closed default: (a).**

*Unchanged and lane-open: **OQ-2** (no fixed-asset population — now sharpened, since the rig confirms
`fixed_assets` is empty even after seed), **OQ-3** (partial official-source access), **OQ-9** (does the
confirmed figure post a provision).*

---

## 5 · The tax-sensitive account source — the 裁-21 COA dossier

`docs/plan/research/coa-template-2026-08-29.json` + `coa-template-research-2026-08-29.md` are the
**tax-sensitive account source F-T3 should consume**, and they are **research-only today**: zero DB or
code hits for a `coa_template_*` relation, and no migration references the JSON.

**What it carries.** A per-**template-account** `tax_sensitive` flag (12 accounts) and an
`add_back_class` with **twelve leaf codes** — `entertainment` · `donations_approved` ·
`donations_unapproved` · `fines_and_penalties` · `depreciation_and_amortisation` · `leave_passage` ·
`private_and_proprietor_expenses` · `motor_running_costs` ·
`club_subscriptions_and_entrance_fees` · `doubtful_debts_specific` · `doubtful_debts_general` ·
`unapproved_provident_fund` — plus a **separate** `statutory` dimension (EPF/SOCSO/EIS/PCB-MTD/HRDF/
SST, 11 accounts) that is payroll withholding and indirect tax, **outside F-T3's income-tax scope**.
Ten `(Tax-Split)` opt-in families. `edition.lhdn_public_rulings` carries 11 citation strings.
**There is no structured numeric column** — every percentage and cap lives in free text (`basis`/`notes`).

**Does the design's add-back model match it? Mostly yes, with four citation corrections and two gaps.**

| Design's worked code | Dossier family | Match |
|---|---|---|
| `ADDBACK_ENTERTAINMENT_50` | `entertainment` — s.39(1)(l)/s.18 + PR 4/2015 | **matches**, but the dossier's "50% default with **eight exceptions at 100%**" sits inside ONE account (6400) |
| `ADDBACK_DONATION_100` (s.33(1); s.44(6)) | `donations_approved` / `donations_unapproved` — s.44(6) only | **mismatch** — see OQ-11 |
| `ADDBACK_FINE_100` (**s.39(1)(b)**) | `fines_and_penalties` — s.39(1) general + s.33(1) + *Aspac Lubricants*, **no paragraph letter** | **citation over-specified** — drop `(b)` |
| `ADDBACK_DEPRECIATION_100` (**s.39(1)(c),(e)**) | `depreciation_and_amortisation` — **s.39(1)(k)** + s.19/Sch 3 + PR 12/2014 + PR 6/2015 | **citation wrong** — and note the dossier assigns `(c)` to *unapproved provident funds*, a different family |
| `EXCLUDE_CAPITAL_GAIN_100` · `EXCLUDE_EXEMPT_DIVIDEND_100` | **none** | the dossier carries **no `exclude`-direction family at all** — income-side exclusions are outside a chart-of-accounts pass by nature. F-T3 owns them alone |
| *(not in the design's six)* | `club_subscriptions_and_entrance_fees` (s.39(1)(m)) · the three doubtful-debt leaves (s.34(2), PR 4/2019) · `leave_passage` (s.13(1)(b), PR 1/2003) · `private_and_proprietor_expenses` (s.39(1)(a)) · `motor_running_costs` (Sch 3 Para 2/2A) | **ready-made, citation-backed, flat 0/100% families the design should seed** |

**Three structural consequences:**

1. **The per-entry override is NECESSARY, not exceptional.** Entertainment's eight 100% exceptions live
   inside a single account. `tax_entry_treatments` (PR-4) is the only mechanism that expresses it —
   `mixed_account_needs_split` alone would fire on essentially every client. *(Related, measured:
   `clara.journal_entries` already carries `tax_affecting boolean NOT NULL` — an existing per-entry tax
   dimension `tax_entry_treatments` should reckon with rather than duplicate.)*
2. **The motor Sch-3 QE cap (RM50k/RM100k) is a capital-allowance figure a P&L account cannot encode.**
   It belongs to R5 and the register, not to `add_back_class`. Keep the two apart.
3. **The naming conventions differ** (`add_back_class` leaves vs `ADDBACK_*` codes), so a mapping table
   is needed either way.

**Conductor ruling, recorded — not re-litigated here.** The template's `add_back_class` is a
**citation-backed HINT that feeds F-T3's PROPOSE step**; a treatment becomes fact only through the
per-client approve door (D-2, "Clara proposes, a human approves"), so a pre-annotated template account
is a **legitimate pre-seeded proposal**, not an inference from a name. **F-T3 PR-1 owns the mapping
table (`add_back_class` → `tax_treatment_codes.code`) and the citation corrections above.** The
10%-of-aggregate-income cap and the QE cap are owner-question material (§4 D.5); capital allowances stay
the register's.

---

## 6 · PR-1 build brief

**Scope.** The five developer-seeded law tables + the reason-row vocabulary + the code→class mapping.
**No governed door is built** (R-L25). PR-1 authors no evaluator, replaces no live body, and reads
nothing the estate does not already have.

**Files.**

| File | Content |
|---|---|
| one new `UNNUMBERED_f_t3_pr1_tax_law_tables` migration under `packages/db/migrations/` (numbered at MERGE, hard constraint 10) | the six platform relations — `tax_authorities` · `tax_treatment_codes` · `tax_rate_bands` · `capital_allowance_rates` · `tax_thresholds` · the `add_back_class` → code mapping table. Each: `enable` + **`force row level security`**, an owner-only `for all to clara_fn_owner` policy, **no `firm_id`**, **no `clara_authenticated` grant** (the `llm_price_table` precedent, M4 class B). `valid_through` on every row. `owner_signed_by/at NOT NULL` on `tax_treatment_codes`. Immutable + supersede (`revision`, `superseded_by`). Seeded from survey §6.2 with `authority_id` + `accessed_at` per row. **Deliberately absent and refusing by name:** the ICT 40/20 row (U1) and `sva_annual_cap` (U2). Plus **twenty-two** `metric_na_reason_versions` rows — the twenty-one of part 2 §9 **plus D-9's new `close_snapshot_missing_pl_rows`** — each `firm_id = NULL`, `version = 1`, `effective_from` set, `cell_status ∈ ('undefined','absent','refused')` |
| `packages/db/tests/f-t3-pr1-*.test.mjs` | prestate + tail censuses on the rig; the PR-1 battery cells: C3 (unsigned code unusable), C5 (missing rate row refuses, and the **previous** year's row does not rescue it), C19 (superseded form version), **C21** (every reason string is *persistable*: a seeded row exists, a platform row is lawful for any firm, and a string with no row cannot be persisted) |
| `docs/plan/active/tax-computation-*.md` | the **v1.3** bump carrying §3's eleven deltas |
| `docs/plan/index.md` | one row for this replay record |

**Prestate section (measured claims this migration makes about what it is editing).**
Assert all thirteen relation names and all eleven verb names are **absent** (measured free at 0147, §1);
assert `metric_na_reason_versions` holds exactly the **9** platform rows and none of F-T3's keys; assert
`metric_na_reason_versions_cell_status_check` is the three-value set; assert
`_tf_metric_catalog_scope`'s na_reason arm is byte-present; abort on any false premise.

**Tail census.** Re-read the live catalog and `raise notice`: relation count, forced-RLS and policy shape
per relation, `relacl` closed-world per relation, the seeded row counts per table, the twenty-two reason
rows with their `cell_status` distribution, and a **positive proof of the two deliberate absences** (the
ICT class and `sva_annual_cap` resolve to zero rows, *reported by query, not asserted by comment*).

**D1 expectation: NONE.** PR-1 creates only new relations and seeds only new rows. It replaces **no**
function body, so no in-flight PL/pgSQL call can span it. *(F-T3's only D1 window is PR-3's, and it
covers **three** bodies — `dispose_fixed_asset`, `_fa_on_approve`, `_tf_fixed_assets_immutable_0017` —
whose live prestate shas are pinned in §1.1 P-6/P-11/P-12. PR-3 also **loses** `uq_fa_id_tenant`, §3 D-7.)*

**Review.** PR-1 decides *whether* a rate row covers a YA, *whether* a code is signed, and *whether* a
form version is current — judgement logic, so review law 1 binds: one independent pass before merge.
No cross-model pass is owed at PR-1 (that obligation is PR-4's).

**Gates.** Both hard gates are LIVE: **F-A5 PR-1** (`0111`, merged + ceremonied) and **F-A4's
`close_receipts`** (`0120`, merged + ceremonied). PR-1 is unblocked on both. Merge-order intent is
unchanged (after F-T1's SST tables), and §2 records why the evaluator-roster ordering no longer binds.

---

## 7 · Rig disposal and the note to the conductor

**The rig was destroyed at the close of this lane** — container `clara_ft3_pr0` stopped and removed, the
minted credential file deleted with the scratch directory. Nothing was applied to any live project; no
migration was authored; the design files are untouched.

**Note to the conductor, three items:**

1. **The evaluator-roster claimant list in `tax-computation-design-part2.md` §12 is wrong at `main`**
   (§2). F-A5 PR-2 and the C-flip are done; F-A5b card-1 and F-A4 PR-2a are claimants the list omits;
   F-A8 PR-1 has not merged. **F-T3 does not have to be last.**
2. **`--lock-deployed` is BLANKET and F-T3 will hold a dark manifest entry from PR-6** — any lane running
   it in that window would light F-T3's evaluator without a ceremony (§2).
3. **`clara.prepayment_schedule_v1` (0140) is DB-frozen but absent from `frozen-evaluators.json`**,
   because the lint discovers only the `clara.evaluate_*` spelling. That is F-A4's to close, not F-T3's,
   but it is the half-freeze the manifest exists to prevent and it recurred.

**Harness-sync items this replay surfaced** (flagged, not fixed here): `packages/db/README.md`'s
migration ledger is stale by eleven files; `PROGRESS.md`'s posture line ("zero `fiscal_years` rows")
contradicts its own 磨合 lane row ("T1 executed the estate's FIRST `open_fiscal_year`").
