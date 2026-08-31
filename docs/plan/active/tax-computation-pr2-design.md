# F-T3 — the computation build increment: design (2026-08-30, replay-measured at `0155`)

> **What this file is.** The build design for F-T3's **computation half** — everything between
> PR-1 (`0152`, merged) and the frozen evaluator. The lead's work order names it "PR-2"; the
> design of record's own ladder (`tax-computation-design-part2.md` §11) calls the same span
> **PR-2 · PR-3 · PR-4 · PR-5 · PR-6**. **This file does not collapse them into one PR, and
> §8 says why that would be unbuildable** — the ordering law the PR-0 gate minted (the frozen
> member is the LAST DDL-dependent PR) is a property of `create function` not validating
> referenced relations, and no amount of care inside one file repairs it. The filename follows
> the order; the ladder inside it follows the law. **This is the one place this file departs
> from its own work order, and it is flagged as OQ-A in `tax-prep-gate-record.md`.**
>
> **Measured ground.** Every DB claim below was read from a throwaway `postgres:17`
> (container `ft3design-rig`, port 33701, password minted per-run and env-only, never argv,
> never a file) with `packages/db/scripts/migrate.mjs` applied **`0001` → `0155`, 150 files,
> all green**, then read through `pg_get_constraintdef` / `pg_proc.prosrc` / real row counts —
> never from migration file text. The rig was destroyed at the close of this lane.
> **This file supersedes nothing in the v1.3 design set; it is the build layer beneath it**,
> and where it corrects a v1.3 claim it says so and shows the measurement.
>
> Companions: `tax-computation-design.md` (§1-§7) · `-design-part2.md` (§8-§13) ·
> `-annexes.md` · `-annexes-2-mechanics.md` · `-gate-record.md` ·
> `tax-computation-pr0-replay-2026-08-29.md` (the 08-29 replay at `0147`) ·
> `tax-prep-wake-design.md` (the agentic half, PR-9) · `tax-prep-gate-record.md`.

---

## 1 · What PR-1 actually shipped, measured — the floor this increment builds on

`0152_f_t3_pr_1_tax_platform.sql` is merged and applies clean at the frontier. Six platform
relations, every one `relrowsecurity`+`relforcerowsecurity` with `relacl` **NULL** (a true
closed world — no grant to any role, not even a revoked one):

| Relation | Rows, measured |
|---|---|
| `clara.tax_authorities` | **26** |
| `clara.tax_treatment_codes` | **13 — all 13 `owner_signed_by IS NULL`** |
| `clara.tax_rate_bands` | **12** |
| `clara.capital_allowance_rates` | **5** |
| `clara.tax_thresholds` | **38** |
| `clara.tax_add_back_class_map` | **12** |

**The refusal vocabulary is seeded and is 24 rows, not 22.** Measured on the rig, scoped to
F-T3's own keys (never a whole-table count on a catalog this lane does not own):

- **`absent` — 11**: `basis_period_undetermined` · `business_source_count_unknown` ·
  `ca_class_unassigned` · `close_not_sealed` · `close_snapshot_missing_pl_rows` ·
  `disposal_value_not_established` · `entity_identifier_missing` ·
  `losses_brought_forward_unknown` · `prior_estimate_unknown` · `rate_row_missing_for_ya` ·
  `sme_facts_missing`
- **`undefined` — 8**: `account_untreated` · `basis_period_not_coextensive_with_close` ·
  `loss_relief_rules_unread` · `mixed_account_needs_split` ·
  `multiple_business_sources_unmodelled` · `treatment_code_unsigned` ·
  `treatment_on_non_pl_account` · `treatment_unapproved`
- **`refused` — 5**: `citation_missing` · `entity_transparent_no_entity_charge` ·
  `form_version_superseded` · `s44_6_relief_unmodelled` · `tax_issue_unavailable`

Every one is `firm_id = NULL`, `version = 1`, `effective_from = 2020-01-01`. **No PR in this
increment seeds a reason row** — the vocabulary is closed and already landed, and a refusal
string that does not appear in the list above **cannot be persisted at all**
(`metric_cells_check3`, read live: a non-`ok` cell REQUIRES `na_reason_version_id`, fail-closed
on NULL via its outer `COALESCE(..., false)`). That is the reuse the order asks for: this
increment **consumes** `0152`'s catalog and mints nothing beside it.

**`0152` granted NOTHING, so nothing in F-T3 is wireable yet — and the first grant is PR-2's.**
Measured at the replay, and confirmed by the migration's own tail census: all six relations are
owned by `clara_fn_owner` with `enable` + `force` RLS, exactly one unconditional `clara_fn_owner`
policy, and **`relacl` NULL** — a true closed world, no grant to any role. The migration minted
exactly **one** function, `clara._tf_ft3_law_row_immutable()`. So there is **no grant and no
reader**: today no human surface can display a treatment code, a rate band, or a citation.

That is correct for PR-1 (it is the `llm_price_table` posture, deliberately chosen) but it makes
the grant sequence load-bearing, and it is stated here so no lane assumes a surface exists:

| PR | First `clara_authenticated` reach it opens |
|---|---|
| PR-1 ✅ | **none** — zero grants, `relacl` NULL on all six |
| **PR-2** | **the FIRST grant in all of F-T3**: `record_client_tax_attribute` (the door) plus the firm-scoped select on `client_tax_attributes` and `tax_basis_periods` |
| PR-3 | `set_ca_classification` (裁-38) |
| PR-4 | `approve_tax_treatment` · `sign_tax_treatment_code` · **and the law-table READER the card needs — gate-record GB-4** |
| PR-5 | `record_cp204_filing` · `record_tax_carryforward` |
| PR-6 | none (the member is called by the wrapper, not by a human) |
| PR-9 | `hold_tax_prep` · `release_tax_prep` · `list_tax_drafts` |

**One code carries an unresolved conflict into the signature act.** `ADDBACK_DEPRECIATION_100`
records **CONFLICT C-1** in its own `conflict` column: the 裁-21 dossier cites s.39(1)(k) while
the 08-23 survey read of Act 53 reports (k) as the motor-vehicle rental restriction. The row is
unsigned, therefore unusable, therefore harmless — but **the signer must settle the paragraph
before signing**, and PR-4's door must not let a signature land that leaves the conflict
unresolved. §3.4.

---

## 2 · PR-4's severance — the treatment-proposal door, as it must be built

The severance (`-design.md` §2) is the one structural idea, and PR-1 built only its DB-owned
half. The half this increment owes is **Clara's write and the human's signature**.

**Clara's only write into a computation is a `code`.** `tax_account_treatments` (PR-4) carries
no numeric column, so there is nothing to type. The fraction lives on `tax_treatment_codes`
(measured: `fraction_bp int check (fraction_bp between 0 and 10000)`), the citation lives on
`tax_authorities`, and both are owner-signed migration content.

**裁-38's walls, as three mechanisms — not one CHECK.** The v1.3 design's D-24 already
establishes why the NULL-shaped CHECK is not the wall (the agent is a real `clara.users` row
with a stable uuid, so it satisfies a NULL-shaped pairing rule exactly as a human does). The
build owes all three:

1. **The CHECK stays** as the shape rule: an apportionment without an approval is malformed.
2. **`clara._tf_tax_treatment_human_only`**, `before insert or update`, is the ARM-0 guard.
   For **each** of `approved_by` and `apportionment_entered_by` the FIRST arm refuses
   NULL-where-required and the SECOND refuses a value resolving to `clara.users.is_agent`.
   A machine principal in either column raises, **whatever door it came through**.
3. **`clara.approve_tax_treatment` is a human verb** on the estate's established shape:
   `clara._human_ctx(clara.role_rank('admin'))`, eligible-approver count via the
   `join clara.users u … and not u.is_agent` predicate `approve_metric_definition` already
   uses, refusing `no_eligible_human`, requiring a distinct checker where two or more exist,
   admitting self-approval only for a sole eligible human with an attestation.

**Cell C2b is the acceptance for all three**: write the approval and the apportionment as
`clara.agent_user_id()` and assert it **refuses**; repeat as a real human and assert it computes.
A cell that only exercises NULL proves nothing here.

### 2.1 · `requires_apportionment` is a fourth wall PR-1 already built, and PR-4 must honour it

Measured on `tax_treatment_codes`: `requires_apportionment boolean not null default false`, and
`ADDBACK_MOTOR_RUNNING_PRIVATE_PORTION` carries it **true**. The column's own seeded note is
explicit and binding: *"With no human `apportionment_bp` this code must NOT fall back to 100%:
PR-2 refuses `mixed_account_needs_split`."* So the evaluator's fraction is **not** the
unconditional `code.fraction_bp * COALESCE(apportionment_bp, 10000) / 10000` the v1.2 text
gives. It is:

```
if code.requires_apportionment and apportionment_bp is null
     -> the line is `undefined` with reason `mixed_account_needs_split`
else -> code.fraction_bp * COALESCE(apportionment_bp, 10000) / 10000
```

A `COALESCE` on a `requires_apportionment` code silently books a mixed-use vehicle's **entire**
running cost as a private add-back — overstating the charge, on a signed return, with no
refusal. **This is judgement logic and it is the arm most likely to be written by reflex.**
Its cell asserts both directions.

### 2.2 · The signature door, and the conflict it must not sign through

`sign_tax_treatment_code` (PR-4, human, admin+) is 裁-38's answer to OQ-7: **a named licensed
tax agent, with the licence reference recorded on the signature row.** Three build rules:

- **One-way, once.** `owner_signed_by`/`owner_signed_at` move NULL→value exactly once, on the
  `_tf_evaluator_deploy_once` idiom (measured live: `if tg_op='INSERT' then if new.deployed
  then raise … end if` / `or old.deployed or not new.deployed then raise` — the shape to copy).
  An unsign is not a correction; a superseding row is.
- **The licence reference is NOT NULL on the signature.** A signature without one records a
  person, not a professional act.
- **A row whose `conflict` column is non-null refuses the signature** with a named refusal
  until the conflict is resolved into a superseding row. This is what makes C-1 (§1) a wall
  rather than a note nobody reads. *(New in this file; the v1.3 set does not carry it.)*

---

## 3 · The evaluator — one member, and the four things the freeze actually does

`clara.evaluate_tax_computation_v1(p_client uuid, p_ya int) returns setof
clara.tax_computation_line` — `STABLE`, pure, reads and never writes, calling **nothing but
built-ins**. One registered member. The ruling stands; §3.1-§3.4 give it the measured basis.

### 3.1 · A one-member closure is precedented — measured, not predicted

The registry holds **8 rows** at `0155`:

| `evaluator_name` | v | `migration_version` | members |
|---|---|---|---|
| `assess_metric_cell_independent` | 1 | `0059_wave_e_delta_metrics_behavior` | 2 |
| `evaluate_metric` | 1 | `0059_wave_e_delta_metrics_behavior` | 10 |
| `evaluate_witness_identity` | 1 | `0091_f_a1_identity_helper` | **1** |
| `evaluate_witness_fact_state` | 1 | `0092_f_a1_predicate` | 4 |
| `evaluate_witness_fact_state` | 2 | `0100_f_a2_nil_tax_arm_part2` | 4 |
| `prepayment_schedule` | 1 | `0140_f_a4_pr_2a_prepayment_limb` | **1** |
| `evaluate_metric` | 2 | `card1_substitution_seam` (`0135`) | 9 |
| `evaluate_fs_pack_agent` | 1 | `f_a5_reporting_agency_pr1` (`0111`) | 9 |

Two singletons already ship. **F-T3 is the ninth registration** — and the replay's §2 finding
holds unchanged: the registry and the manifest are both append-only and
`verify_evaluator_freeze()` iterates **every** row with no `deployed` filter (measured: its
loop is `for r in select * from clara.evaluator_versions order by evaluator_name, version`),
so **F-T3 does not have to be last in merge order.** Manifest conflict resolution is the only
thing order buys, and the standing rule is unchanged: *a manifest conflict is NEVER resolved by
dropping another lane's key.*

### 3.2 · The relation census, and why PR-6 is last

`create function` does not validate a plpgsql body's referenced relations, so a member
registered before a table it reads applies **cleanly** and then raises `relation … does not
exist` on its **first call** — aborting the whole `setof` return, which is exactly what
part 2 §9 promises never happens. The body is frozen the instant its `evaluator_versions` row
lands, so it cannot be patched later without a `_v2`.

**PR-6's §0 carries a closed census of every relation the body names, each with the PR that
creates it, and asserts each is present before proceeding.** The eighteen:

`close_receipts` · `fiscal_years` · `coa_accounts` · `fixed_assets` · `client_facts` ·
`client_identifiers` · `tax_authorities`\* · `tax_treatment_codes`\* · `tax_rate_bands`\* ·
`capital_allowance_rates`\* · `tax_thresholds`\* · `tax_basis_periods` (PR-2) ·
`client_tax_attributes` (PR-2) · `tax_account_treatments` (PR-4) · `tax_entry_treatments`
(PR-4) · `ca_asset_years` (PR-3) · `cp204_filings` (PR-5) · `tax_carryforwards` (PR-5).

*\* = shipped in `0152`, verified present on the rig.* The census is an **assertion in the
migration**, not a comment: `to_regclass` per name, abort CLR10 on the first NULL.

### 3.3 · The freeze moves on `search_path` — and NOT on owner or ACL

The 08-29 replay measured this and it is worth restating because it is counter-intuitive and it
is what the D-16 rationale now rests on. `pg_get_functiondef` renders body, language,
volatility, `SECURITY DEFINER`, strictness, cost/rows and `SET` config — **not** the owner and
**not** the ACL:

- `alter function … owner to postgres` → functiondef sha **unchanged**, checker **passes**.
- `grant execute … to clara_authenticated` → sha **unchanged**, checker **passes**.
- `alter function … set search_path` → sha **moves**, checker raises **CLR10**.

So the argument for ONE member is **not** "an ACL change elsewhere raises". It is the two
measurements that do hold: **(i)** the checker ignores `deployed` entirely, so registration
freezes immediately and `deployed:false` buys nothing; **(ii)** closures **share** members —
`clara._hash(jsonb)` is a member of three closures — so one helper's `search_path` change
raises for **every** closure naming it, at a later lane's apply, pointing at F-T3. A
self-contained member calling only built-ins shares nothing and adds exactly one body to the
frozen surface.

### 3.4 · **The evaluator SELF-REFUSES until it is DEPLOYED — and that is a second ceremony**

**This is the sharpest new finding in this file, and the v1.3 set does not carry it.** Measured
live, in the two closest sibling bodies:

```
-- clara.evaluate_fs_pack_agent_v1, live prosrc:
where evaluator_name = 'evaluate_fs_pack_agent' and version = 1 and firm_id is null and deployed;
raise exception 'the agent pack evaluator closure is not deployed' using errcode = 'CLR10',
  detail = '{"reason":"evaluator_undeployed","class":"evaluate_fs_pack_agent",
             "fix":"the owner flips the closure row as a ceremony from merged main"}';

-- clara.evaluate_metric_v2, live prosrc:
where evaluator_name='evaluate_metric' and version=1 and firm_id is null and deployed;
raise exception 'metric evaluator is not deployed' using errcode='CLR10',
  detail='{"reason":"evaluator_undeployed","class":"evaluate_metric"}';
```

The estate's evaluators **gate themselves on their own deployment**. `evaluate_tax_computation_v1`
must carry the same arm — anything else would make F-T3 the one evaluator that computes from a
closure nobody ceremonied. Three consequences the build and the ceremony both owe:

1. **PR-6 ships DARK and the number is unreachable until a deploy ceremony.** The registry row
   is born `deployed=false` (forced: `_tf_evaluator_deploy_once` raises CLR08 on a born-deployed
   INSERT, measured), and the flip is a plain `UPDATE` from a session holding **no** active
   `SET ROLE` (`current_user = session_user`), exactly once per row ever, and only after
   `verify_evaluator_freeze()` passes. `deploy-evaluator-version.mjs` is the **recipe**, not the
   wall.
2. **The G1 rollout ceremony's `tax_prep` switch must be ordered AFTER that flip.** Flipping
   `set_wake_source_enabled('tax_prep', true)` first makes every tax_prep run refuse
   `CLR10 evaluator_undeployed`, nightly, per client, to `max_attempts` and then dead-letter.
   Full argument and the ordered act list: `tax-prep-wake-design.md` §11.
3. **`frozen-evaluators.json` gets ONE appended entry, `"deployed": false`, and PR-6's body must
   say so** — `--lock-deployed` is **BLANKET**, so any other lane running it while F-T3 holds a
   dark entry would stamp it deployed while the DB row is still false. That is the cross-lane
   hazard the PR-0 replay flagged to the conductor and it is still live.

### 3.5 · The member must be named `clara.evaluate_tax_computation_v1`, and that is load-bearing

`scripts/check-frozen-evaluators.mjs` discovers only the `clara.evaluate_*` spelling. Measured
consequence, still true at `0155`: `clara.prepayment_schedule_v1` (`0140`) is DB-frozen and
**absent from the manifest** — the half-freeze the manifest exists to prevent, recurring. F-T3's
name is correct; **it must stay so**, and PR-6's tail asserts the manifest entry exists rather
than assuming the lint found it.

---

## 4 · The run wrapper — deliberately not a member, and larger than v1.2 stated

The wrapper materialises `ca_asset_years`, the carry-out rows and the `metric_cells` from the
evaluator's returned rowset. It is **not** registered, which is why the member stays pure.

Its obligations, measured (replay D-10, re-confirmed at `0155`):

- `metric_cells.evaluation_context_id` is **NOT NULL**, so the wrapper must mint a
  `metric_evaluation_contexts` row, which itself carries a `snapshot_id` →
  `metric_input_snapshots`.
- The DEFERRED `_tf_metric_cell_provenance_complete` requires `inputs->'normalized_provenance'`
  to carry **all seven** family keys — `period_ids`, `snapshot_ids`, `account_set_version_ids`,
  `constant_version_ids`, `entry_ids`, `document_ids`, `presentation_map_version_ids`. **An
  absent key is not an empty list**, and each must reconstruct its child table exactly or CLR11
  fires **at commit**, not at the statement.
- Every non-`ok` cell carries a `na_reason_version_id` resolved from `0152`'s 24 rows
  (`metric_cells_check3`, measured above). A refusal string with no row can be raised but never
  persisted — which is why §1's list is closed.

**The chain is empty on a fresh estate.** Measured at `0155` after `migrate`: `fiscal_years`
**0 rows**, `close_receipts` **0 rows**. The chain F-T3 must ride is *snapshot → evaluation
context → cell → period → run*, and **no link has ever carried a row on a fresh rig.** The
first tax computation in this estate is also the first exercise of four Wave-E surfaces
end to end. That is a sequencing fact, not a build-time discovery, and it is why PR-6's
acceptance needs a real sealed close, not a rig-seeded one.

---

## 5 · The draft-only wall (裁-33) — what this increment does NOT build

**There is no golden bar, so there is no artifact.** PR-7 (the report definitions, the
statutory-class template publication, the field-pack map, the `report_run` wiring) is **NOT
BUILT FOR BETA**. Measured, the surface it would have used is unchanged and unnarrowed:
`report_runs_state_check` admits `drafting | dataset_sealed | issued`, and `ck_rr_issue_mode`
admits `two_person | solo_self_attested | agent_prepared`. F-T3 narrows **neither** — a
shared-surface change for one item's convenience is law 81's shape.

The wall is therefore **by name**: `tax_issue_unavailable`, seeded in `0152` and measured
present, `cell_status = 'refused'`. It is the string PR-7 must refuse with **whenever it is
eventually built**; shipping the name first means the transition has a persistable refusal the
day the wall exists, and a later lane must **deliberately remove** a named wall rather than
drift through a gap.

**裁-33's other half is a property, and `0152` proved it positively**: not one of the six
platform relations carries a `status` / `state` / `issue_mode` / `issued_at` / `issued_by`
column — proven by a column census in the migration's own tail, never by the absence of a state
machine. **PR-2 through PR-6 must keep that property true**, and each one's tail re-runs the
census over its own new relations. The risk this leaves on the record, stated rather than
softened: **every battery cell can pass while the bottom line is wrong**, and the v2 fold's own
R7/R8 re-cut is exactly the class of error only a hand-worked ladder catches. Draft-only is
what keeps that error out of a document a human signs.

---

## 6 · The D1 inventory — PR-3, and nothing else

**PR-3 is F-T3's only D1 window in this increment**, and it covers **three** live judgement
bodies, not one. Live `prosrc` sha256, measured on the rig at `0155` (these are the prestate
pins the migration re-reads at apply time, aborting CLR10 on drift):

| Body | Live `prosrc` sha256 | Chars |
|---|---|---|
| `clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)` | `a2dbb8bd…b82b872` *(pinned in the 08-29 replay; unmoved at `0155`)* | 25 390 |
| `clara._fa_on_approve(...)` | `7ffa9a71…` *(replay pin; unmoved)* | 28 520 |
| `clara._tf_fixed_assets_immutable_0017()` | pin at PR-3 authoring, not here | — |

**PR-3's three deltas:**

1. `disposal_value_cents` + `disposal_value_basis` on `clara.fixed_assets`. **`uq_fa_id_tenant`
   is NOT added** — `uq_fixed_assets_id_firm_client UNIQUE (id, firm_id, client_id)` already
   exists (replay D-7), and `ca_asset_years`' tenant FK binds to the existing constraint.
2. `dispose_fixed_asset` is **proposal-shaped** and does **not** write the register row —
   `clara._fa_on_approve` does, on both the full path and the partial supersede split, which
   already carries `ca_class`/`is_commercial_vehicle`/`is_new` forward onto both rows.
3. **The immutability allowlist splice, widened by 裁-38's OQ-10 ruling.** Measured: the live
   allowlist is `array['status','disposed_at','disposal_entry_id','superseded_by_asset_id',
   'superseded_at','updated_at']`, UNION nine particulars columns **only while
   `clara._fa_particulars_complete(OLD)` is false**. So on a particulars-complete approved
   asset a `ca_class` UPDATE raises **CLR13** — and every asset in the estate today is
   registered tax-blind. 裁-38 ruled option (a): **PR-3 adds the human `set_ca_classification`
   door (bookkeeper+, audited, reasoned) and the three CA columns join the *unconditional*
   allowlist with that door as their only writer.** Without it, `ca_class_unassigned` is a
   permanent refusal with no in-product remedy and **R5 never computes for any real client**.

**Every other PR in this increment declares D1 EMPTY, and proves it** the way `0152` did — by a
whole-catalog census over `prosrc` + language + SECURITY DEFINER + volatility + strictness +
leakproof + owner + `SET` config + return type + setof + argument types + ACL (twelve
attributes, deliberately **not** the functiondef renderer, which §3.3 measured renders neither
the owner nor the ACL). A tail that says "no bodies replaced" has proven nothing.

---

## 7 · Judgement logic and review intensity

**PR-2, PR-3, PR-4, PR-5 and PR-6 each decide *whether* something is allowed**, so review law 1
binds each: one independent pass before merge, author's own read insufficient.

**PR-4 additionally gets a cross-model adversarial pass.** It is the model's only entrance into
a statutory document and it is an injection surface — a supplier invoice's description text
feeds Clara's classification reasoning. That pass is discharge-able now that §3.1 of the design
set names the entrance (the wake wrapper, its credential, its allowlist row) rather than
leaving three agent writes with no door.

---

## 8 · The PR ladder, and why it may not be collapsed

| PR | Content | Judgement? | D1 |
|---|---|---|---|
| **PR-1** ✅ `0152` | six platform relations · 26 authorities · 13 unsigned codes · 12 bands · 5 CA rates · 38 thresholds · 12 map rows · **24 reason rows** · five proven absences | yes | **none, proven** |
| **PR-2** | `tax_basis_periods` · `client_tax_attributes` + `record_client_tax_attribute` (admin+, human-only, supersede-never-update, **as-at** read). **No `client_fact_keys` seed and no `record_client_fact` call** | yes | no |
| **PR-3** | `disposal_value_cents`/`_basis` · the `set_ca_classification` door + the unconditional allowlist widening (裁-38) · the two body replacements · `ca_asset_years` | yes | **YES — 3 bodies** |
| **PR-4** | `tax_account_treatments` + `tax_entry_treatments` · `_tf_tax_treatment_human_only` · `wake_propose_tax_treatment` + core + allowlist row · `approve_tax_treatment` · `sign_tax_treatment_code` · the `requires_apportionment` arm (§2.1) | yes **+ cross-model** | no |
| **PR-5** | `cp204_filings` + `record_cp204_filing` · `tax_carryforwards` + `record_tax_carryforward` — **the last table PR** | yes | no |
| **PR-6** | **`evaluate_tax_computation_v1`** · the `evaluator_version` row (**dark**) · the 18-relation census · the run wrapper (§4) · `wake_run_tax_computation` + core + allowlist row | yes | no |
| ~~PR-7~~ | **NOT BUILT FOR BETA (裁-33)** — the wall's name ships in `0152` | — | — |
| **PR-8** | the `law_review_due` belt, `proactive` kind, a consumer of F-A4's clock | partial | no |
| **PR-9** | **the `tax_prep` wake** — `tax-prep-wake-design.md` | yes | no |

**Why collapsing PR-2…PR-6 into one file is unbuildable, said plainly.** The member is frozen
the instant its `evaluator_versions` row lands in the same transaction that creates it. If the
tables it reads are created in that same file, they exist — so the census passes and the file
applies. The failure is not at apply; it is **at review and at revision**. A single file makes
the eighteen-relation census self-satisfying (it asserts what it just created two hundred lines
above), removes the independent review pass from four judgement surfaces that each deserve one,
and puts a D1 write-quiesce window (PR-3's three bodies) in the same file as the frozen
evaluator — so a quiesce failure at deploy strands a frozen registration. **The ladder is the
review instrument, not a scheduling preference.** Flagged as OQ-A.

**Sequencing.** Both hard gates are LIVE and measured: F-A5 PR-1 (`0111`, merged + ceremonied)
and F-A4's `close_receipts` (`0120`, merged + ceremonied). PR-8 waits on F-A4's clock spine and
may ship late without holding the rest — until it exists a rate expiry is found by a refusal
instead of announced by a question; worse, but not wrong. **PR-9 waits on PR-6 and on the
evaluator deploy ceremony (§3.4).**

---

## 9 · Build-ready work orders

**PR-2 — the valid-time facts.** One `UNNUMBERED_f_t3_pr2_tax_client_facts` migration.
`tax_basis_periods` (keyed `(client_id, firm_id, ya)`, carrying `derived_from_fiscal_year_id`,
`period_start`, `period_end`) and `client_tax_attributes` (keyed `(client_id, firm_id,
attribute_key, effective_on)`, a value column per declared kind, seven keys). Client-scoped RLS
shape: `enable`+`force`, the `clara_fn_owner` policy, the `clara_authenticated` select scoped
`firm_id = clara.jwt_firm()`, composite tenant FKs to `clara.clients (id, firm_id)`.
`record_client_tax_attribute` is admin+, human-only, supersede-never-update. **The read is
as-at**: the live row with the greatest `effective_on <= the as-at date`; **no such row ⇒ the
dependent rung refuses by name**, never today's value. Prestate: assert both relation names and
the verb name free. Tail: the RLS/policy/grant census plus the 裁-33 column census. Cells: the
as-at read returns the historical value and not the current one (both directions); a missing
row refuses `sme_facts_missing` naming the attribute **and the date**; the door refuses a
non-admin and refuses an agent principal. **Frontend home for `record_client_tax_attribute`:
the client Tax tab (裁-34, P6) — a new `clara_authenticated` door, so the PR body names it.**

**PR-3 — the register limb + the D1 window.** Prestate pins all three bodies by live `prosrc`
sha256 and aborts CLR10 on drift. Deltas per §6. Tail proves the allowlist admits the three CA
columns **unconditionally** by a real UPDATE probe on a particulars-complete approved asset
(RED-before: the same probe raises CLR13 on a main-migrated control rig), and proves
`set_ca_classification` is the only writer. **D1 write-quiesce required at deploy.**
**Frontend home for `set_ca_classification`: the fixed-asset register row actions
(`apps/web/components/registers/fa-row-actions.tsx`), which already reads `ca_class`.**

**PR-4 — the severance.** The two treatment tables, the human-only trigger, the wake wrapper
over an ungranted core on the `0078:90-107` shape (resolve credential → refuse CLR03 without
one → assert the per-kind `wake_fn_allowlist` row → delegate), the two human doors, and §2.1's
`requires_apportionment` arm. Kind: **`autodraft` is wrong for this lane** — see
`tax-prep-wake-design.md` §3, which mints `tax_prep` and makes PR-4's allowlist row a
`tax_prep` row. Cells: C2b (machine principal refused in both columns, human admitted); the
`requires_apportionment` both-direction cell; the conflict-blocks-signature cell; the
one-way-once signature cell. **Cross-model adversarial pass owed.**

**PR-5 — the human-keyed inputs.** `cp204_filings` and `tax_carryforwards` on the design's
stated shapes. **Absence is not a nil**: no `tax_carryforwards` row ⇒
`losses_brought_forward_unknown` naming kind and YA; a human asserting there is none keys
`amount_cents = 0` **with a basis**. A **nil** row computes; a **non-nil** row makes the
dependent rung `not_evaluable` with `loss_relief_rules_unread` until PR 1/2022 is read.

**PR-6 — the member.** §3 and §4 in full. The eighteen-relation census as assertions. The
`deployed=false` registration, the appended manifest entry, and the body's own note that
`--lock-deployed` is blanket. Cell C15b: call the member on a client with **no data of any
kind** and assert a full refusal rowset comes back — no `relation … does not exist`, and no
rung raising out of the ladder.
