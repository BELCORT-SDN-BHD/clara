# Riders wave 4 — integration gates, worker A (chain, upgrade paths, db + runtime suites)

**Worktree** `C:\Users\zhant\Desktop\clara-wt\int2` · **branch** `integration/riders-w4`
**Head measured** `fb1dae78a3db2c29025fb82c4c79cde89197f354`. I committed nothing, edited no tracked
file, pushed nothing, opened no PR, wrote nothing to GitHub, touched no lane worktree and spawned no
subagent. Mid-run the orchestrator landed `fdb9ba135` (*docs: riders wave 4 lane, merge, rig,
release-prep reports …*) on top; `git diff --name-only fb1dae78a fdb9ba135 -- packages apps .github`
is **empty**, so no migration, no source file and no test moved and every number below still holds
at `fdb9ba135`.
**Host** Windows 11 + WSL PostgreSQL 17.11 (Ubuntu) · Node v22.23.2 · `psql` client 18.6

**Clusters** — `rigw4` 127.0.0.1:55700, `rigw4h` 55701, `rigw4c` 55702, exactly as
`wave4-rig-prep.md` §1 leaves them. Nothing outside those three was written: `pg_lsclusters` still
shows `rigint` (55720), `rigrt` (55721), `rigreh` (55730), `rl01`–`rl10` (55741–55750), `rigw2`
(55760), `rigw3` (55770) and `rigw3h` (55771) online, and the only command any of them saw was one
read-only `datname` listing on 55721.

---

## Counts, one table

| # | gate | result |
|---|---|---|
| 1 | from-scratch chain, `clara_w4int` on `rigw4` | **309 applied / 309 total**, exit 0, 4 m 01 s. Every wave-4 file on its FIRST-apply branch, **zero REDO**. Cluster `clara%` roles 14 → **20** |
| 2 | upgrade path, `clara_w4_hosted` on `rigw4h`, **populated first** | **21 applied / 309 total**, exit 0, 14 s. Every prestate clean, every tail green. **12 data-dependent branches entered with rows**; **11 guards shown to STOP** on a planted bad row and to pass on conforming rows |
| 2b | the two paths converge | **all 1489 function bodies byte-identical**, plus 4051 column rows, 3103 constraints and 947 indexes |
| 3 | the same 21 on `clara_w4_coll` (`en_US.UTF-8`) | **21 applied / 309 total**, exit 0, 12 s. 0295's structural digest reads the pin `d02a786a…` on a server whose stored v1 hash reads `673ede91…`. All four structural censuses identical to the from-scratch chain |
| 4 | `--post` preflight from the UPGRADED database | **verdict CLEAN, exit 0** — 11346 keys compared, 11346 equal, **0 env, 0 STOP, 0 GAP** |
| 5 | whole `packages/db` suite, 125-token gate chain | **5727 tests · 5589 pass · 43 fail · 95 skipped**, 23 m 49 s. The 43 are **7 distinct integration collisions** (F1–F7); 31 of them are one file's subtests downstream of a single setup assertion |
| 6 | whole `packages/runtime` unit suite | **2970 tests · 2926 pass · 4 fail · 40 skipped**, 6 m 22 s. **2 integration collisions** (F8, F9) and the **2 known Windows-only reds**. The documented `ready.test.mjs` flake did NOT fire |
| 7 | static gates | frozen-workflows **OK** (322 / 57 / 3) · parts-parity **OK** · `registry-view.test.mjs` **7 pass / 0 fail** · `pnpm typecheck` **exit 0** · `CI=true GITHUB_ACTIONS=true pnpm lint` **exit 0** |

**Baseline exported for the release preflight:**
`C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\w4\fp-w4-upg.json`

**Nine findings, all above note, all in §8.** Every one is an integration collision: a closed-world
census that was right on its own lane and on `main` and is wrong on the merged tree. **None is a
defect in a lane's product code, none is a known Windows-only red, and none is a flake.** Eleven of
the twelve database reds were re-run on a clean 309 clone with only the nine affected files and
reproduced there; the twelfth (F6) passed alone, which is itself the finding.

---

## Method

Wave 3's gate A (`wave3-integration-gates-A.md`) is the template. Four things are done differently,
each because this wave is different:

1. **The from-scratch chain is re-run, not inherited.** `wave4-merge.md` records a 309/309 chain on
   this head; §1 drops that database and runs the chain again as the gate's own proof, under the
   #867 recipe (`role-census-reset.mjs --apply` between), which is the ONE from-scratch chain this
   cluster gets.
2. **The upgrade database is POPULATED through the estate's own doors before the 21 files run.**
   `wave4-release-prep.md` §6 names this as the wave's largest unproven area: on the rig
   `document_processing_tasks`, `document_extractions`, `entry_post_receipts`,
   `accrual_adjustments` and `prepayment_schedules` all held ZERO rows, so every constraint swap and
   every backfill read was trivially clean. §2.1 plants real rows in all five plus a staff expense
   claim carrying an advance, so twelve data-dependent branches are ENTERED rather than skipped.
3. **Every row-dependent guard is shown to STOP.** §2.3 runs each file's own prestate block verbatim
   against a deliberately non-conforming row inside a rolled-back transaction, and then against the
   conforming database. Eleven refusals, each with the file's own sentence.
4. **Equality across the three databases is measured structurally, not spot-checked.** §2.4 compares
   every function body, column, constraint and index on all three databases rather than the sixteen
   bodies wave 3 sampled.

---

## 1 · The from-scratch chain — `clara_w4int` on `rigw4` (55700)

Roster read before anything ran: `packages/db/migrations` holds **309** `.sql` files and the first
four characters of every filename are unique across all 309 — **no duplicate number anywhere**, so
the 0317 collision `wave4-merge.md` resolved is genuinely gone. `packages/db/package.json`'s `test`
script carries **125** `--import` gate tokens, none twice.

```
dropdb clara_w4int
PGDATABASE=postgres CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs --apply   # 20 -> 14
createdb clara_w4int
PGHOST=127.0.0.1 PGPORT=55700 PGUSER=postgres PGDATABASE=clara_w4int \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node scripts/migrate.mjs
pnpm --filter @clara/db seed
```

**07:08:40Z → 07:12:41Z, 4 m 01 s, exit 0.**

```
migrate: 309 new migration(s) applied · 309 total · target 127.0.0.1:55700/clara_w4int
```

309 `applied … · backend pid` lines; `clara.schema_migrations` reads **309 /
`0318_knowledge_fye_pair_applicability`**. The role census behaved exactly as
`packages/db/README.md`'s #867 section predicts: the cluster carried **20** `clara%` roles from the
merger's chain, `role-census-reset.mjs` reported all six post-0154 roles safe to drop with no shared
dependents, `--apply` dropped exactly them and the count returned to **14**, and the chain recreated
all six on its way back to **20** (0160's two, 0163's two, 0309's two). `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. Seed: `0001_smoke_seed.sql`, `0002_core_seed.sql`.

**Zero REDO.** Four log lines contain the word "redo" and all four are pre-0295 files describing
their own bimodal admissions in prose (`#913`, `#993`, `#899`, `bslc`); no wave-4 file printed a redo
branch.

### 1.1 The 21, in chain order, with the branch each took

```
0295 0296 0297 0298 0299 0300 0301 0302 0303 0304 0305
0306 0307 0308 0309 0310 0311 0315 0316 0317 0318
```

0315–0318 apply above 0311, as `migrate.mjs`'s numeric sort requires, and 0318 (lane 06's renumbered
fix round) applies last. Every one printed a clean prestate and a green tail.

| file | prestate branch, abridged |
|---|---|
| 0295 chart | `clean (FIRST apply) — my_sme_starter v1 … is published, unmoved at 42 families / 142 accounts, structural digest d02a786a… (collation-independent, pinned)` |
| 0296 #945 | `OK (FIRST apply) — … the capability registry publishes one version across 240 rows with its high-water mark in agreement` |
| 0297 #946 | `OK — 0296's evaluator is at its pinned sha … 2040 Salaries Payable is already on the published standard chart` |
| 0298 #947 | `OK — clara._post_payroll_run and clara._match_bank_line_core are at their pinned live bodies … entry_post_receipts already admits 'interactive'` |
| 0299 #948 | `OK (FIRST apply) — clara._assert_field_path is at a pinned sha …` |
| 0300 #949 | `OK — clara.persist_agreement_facts … at their pinned #948 bodies; 2050 Rent Payable, 6100 Rental of Premises and 1120 Deposits Paid are live on the current published platform template` |
| 0301 #931 | `clean (FIRST apply) — the eight recut bodies are at their measured 0221 post-images` |
| 0302 #938 | **the structural arm**: `clara.list_review_queue is NOT at this file's pinned pre-image (measured 886df580…) — a sibling lane of the same wave spliced its own arm first. Admitted on STRUCTURE`, then `clean` |
| 0303 #937 | `clean (FIRST APPLY) — the six bodies this file recuts are each at exactly one of their two admitted values` |
| 0304 #942 | `clean (FIRST APPLY) — … and 0 accrual row(s) already exist on this database` — the vacuous arm; §2.2 enters the other one |
| 0305 #939 | `clean — … the four recut bodies are each at one of their two admitted pre-images (…=FIRST)` |
| 0306 #940 | `FIRST APPLY — the roster relation does not exist yet` |
| 0307 #915 | `FIRST APPLY — none of this file's four functions exists yet` |
| 0308 #941 | `FIRST APPLY — none of this file's eleven functions exists yet` |
| 0309 #871 | `the 18 chain-minted clara roles this file relies on are all present; the cluster-wide clara% census reads 18 and is RECORDED, not pinned` |
| 0310 #1031 | `clean — financial_year_end_month/day carry the shapes 0192/0240 left` |
| 0311 #1032 | `clean — … the catalogue holds its pinned fifteen rows (twelve unmoved, hashing to the prior pin), the append-only trigger is enabled` |
| 0315 #1036 | `clara._prepayment_plan_core_wake is absent (fresh chain, or a redo of the fix round)` |
| 0316 #1038 | `FIRST APPLY — clara.create_client is still granted to clara_authenticated; revoking now` |
| 0317 | `0317 prestate OK — 7 FIRST, 0 REDO — chain=FIRST …`, tail `0317 OK — the correction path exists on both lanes: 2 human doors, 2 ungranted predicates, 2 qualified uniqueness rules, 6 recut bodies, 0 machine wrappers` |
| 0318 #1031 fix | `clean — 0310 is applied, … all at their measured pre-images` |

0302's **behavioural probe** ran and reported: *"a same-period document-sourced bill produced exactly
one accrual_bill_conflict row … admitting the reversal cleared it with no cleanup;
clara.skip_plan_occurrence marked the next occurrence and clara._plan_admissible_event never offered
it again. Fixtures discarded."*

Full log: `…/scratchpad/w4/chain-w4.log`.

---

## 2 · The upgrade path — the release rehearsal on `clara_w4_hosted` (55701)

`clara_w4_hosted` started at **288 / `0293_fa_arrears_judgement_scope`**, `C.UTF-8`, seeded,
`my_sme_starter` v1 published with 0156's two society overrides and one client adopted
(`wave4-rig-prep.md` §3). **Before planting anything I cloned it** —
`createdb -T clara_w4_hosted clara_w4h_pre` — so the pristine pre-window baseline the ceremony's
`--baseline` export needs still exists on the same cluster, re-read afterwards at **288 / 0293** with
v1 `published`. Nothing was dropped.

### 2.1 What was planted, and through which door

Every row below was minted by calling a real estate door, or the rig's own governed fixture helper
where the door needs an engine round trip. All of it was driven from temporary scripts in the MAIN
checkout (`C:\Users\zhant\Desktop\clara-rebuild`, branch `main` at `8470d8212` — the PRE-wave tree,
which is what a 0293 database's doors actually are), and every script was deleted afterwards;
`git status` there shows no tracked change and no `zz-w4gate-*` file survives.

| relation | before | after | the door |
|---|---|---|---|
| `clara.accrual_adjustments` | 0 | **2** | `clara.create_accrual_adjustment` as a bookkeeper on two fresh clients, after a real authority instruction |
| `clara.prepayment_schedules` | 0 | **2** | `clara.create_prepayment_schedule` as a bookkeeper on `prepaymentScene`'s document and recorded service period |
| `clara.staff_expense_claims` | 0 | **1**, `advance_id` non-null | `clara.admit_staff_expense_claim_work` + `clara.wake_record_journal_entry` against a real seeded advance |
| `clara.entry_post_receipts` | 0 | **1**, `via_wake_kind='autodraft'` | `clara.wake_post_entry` on an agent draft |
| `clara.document_extractions` | 0 | **9**, kinds `ocr` / `llm_text_facts` / `llm_vision_facts` | `seedVerifiedDocument` + the witness pair + `seedExtraction` |
| `clara.document_processing_tasks` | 0 | **6**, lanes `classify` / `llm_witness`, statuses queued / done / failed | `clara.finalize_document_intake` through the intake fixtures |
| `clara.accounting_plans` | 0 | **4**, kinds `reversing_journal` / `amortisation_schedule` | minted by the two doors above |
| `clara.document_capabilities` | 240 at `registry_version` 4 | unchanged | migration-seeded, already there |
| `clara.coa_template_adoptions` | 1, v1 `adopted` | unchanged | already there |
| `clara.firm_setup_keys` | 15 | unchanged | already there |

**The `proposed` adoption could not be planted, and no real door can make one.** Verified
independently rather than repeated from `wave4-rig-prep.md`: `clara.apply_coa_template` is the ONLY
function whose body contains an `insert into clara.coa_template_adoptions`, and that insert's state
literal is `'adopted'`, read off `prosrc`. Its only other mention of `'proposed'` is the
`if v_had_prop then` branch, which PROMOTES a row something else created. Planting one by raw INSERT
would misrepresent hosted with a state no user or agent flow can produce, so the branch stays
unentered (§9).

### 2.2 The run, and every branch it entered

```
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted \
  CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate
```

**07:22:34Z → 07:22:48Z, 14 s, exit 0 — `21 new migration(s) applied · 309 total`.** All 21
prestates took the SAME branch as the from-scratch chain except where the data differs; every tail
green.

| branch | the row that entered it | what the file said, and what I measured after |
|---|---|---|
| **0304's accrual backfill** (`add column side text not null default 'expense'`) | the 2 planted accruals | prestate: *"… and **2 accrual row(s) already exist on this database**"* (the fresh chain read `0`). Tail: *"carries a NOT NULL side defaulting to expense with **every pre-existing row on the expense side**"*. After: `side='expense'` on **2 of 2** |
| **0303's method CHECK swap** | the 2 planted accruals at `{"rule":"stated_amount"}` | live `= 'stated_amount'` → `in ('stated_amount','stated_period_amount')`: a WIDENING, evaluated over live rows |
| **0301's allocation backfill** (a top-level `insert … select` over `clara.staff_expense_claims`) | the 1 planted claim carrying an advance | tail: *"**every advance-application claim on this database carries a list that adds up to it** and whose head is the claim row's own advance"*. After: `clara.staff_expense_claim_allocations` holds **1** row, against 0 on the fresh chain |
| **0305's carrier CHECK** `ck_ps_term_source_carrier` | the 2 planted schedules | both carry `term_source='document_service_period'` with non-null `service_period_id` and `document_id` — the first `case` arm. After: **2 of 2** |
| **0317's four guarded FKs, two paired CHECKs and the qualified uniqueness swap** | the 2 planted schedules | total `UNIQUE (source_entry_id)` → partial `UNIQUE (source_entry_id) WHERE superseded_at IS NULL`, built over live rows |
| **0296's and 0299's ten CHECK swaps** on `document_processing_tasks` and `document_extractions` | 6 tasks across 2 lanes and 3 statuses, 9 extractions across 3 engine kinds | each swap evaluated over live rows rather than an empty relation |
| **0297's and 0299's `entry_post_receipts` swap** | the 1 planted receipt at `via_wake_kind='autodraft'` | after: `array['autodraft','interactive','bank_agent','payroll_facts','contract_facts']` |
| **0308's `accounting_plans_kind_check` swap** | the 4 planted plans across 2 kinds | `+ 'revenue_recognition_schedule'`, evaluated over live rows |
| **0296's and 0299's registry raise** | the 240 live `document_capabilities` rows at version 4 | 4 → 5 → **6** uniformly across all 240, with **0** high-water disagreements measured after |
| **0295's retirement with an adopted client on the table** | the 1 `adopted` v1 row | tail: *"… so **every existing adopter still reads exactly what they adopted** and the picker now offers ONE starter"*. After: v1 `retired`, v2 `published`, the adoption row untouched |
| **0309's role pair from scratch** | `clara_invite_preview*` absent (census 18) | prestate: *"the 18 chain-minted clara roles this file relies on are all present; the cluster-wide clara% census reads 18 and is RECORDED, not pinned"*. After: **20**, both new roles NOLOGIN |
| **0311's one-cell backfill behind a disabled trigger** | the 15 live `firm_setup_keys` rows | tail: *"tin's user_note carries the new sentence and the append-only trigger is re-enabled; the catalogue holds its pinned fifteen rows"*. After: the `tin` row carries the new text and the trigger reads `tgenabled='O'` |

**Every one of the fifteen constraint swaps is a WIDENING, or a new constraint that is total on the
column's own DEFAULT.** Read by comparing `pg_get_constraintdef` on the preserved `clara_w4h_pre`
against the upgraded database. That is the answer to `wave4-release-prep.md` §6's "populated-row
behaviour … unproven at any scale": no existing row can fail any of them, because every row
satisfying the old clause satisfies the new one, and the two genuinely new CHECKs
(`ck_accrual_adjustments_side`, `ck_ps_term_source_carrier`) are satisfied by the DEFAULT the same
`alter table` writes — 0305's carrier arm because the two columns it requires were NOT NULL before
the file drops those constraints.

**Vacuity control for that claim.** A deliberately NARROWED copy of `ck_processing_task_lane_f_a1`
(the real new array minus `'classify'`) applied to the same populated relation inside a rolled-back
transaction:

```
ERROR:  check constraint "ck_processing_task_lane_f_a1" of relation
        "document_processing_tasks" is violated by some row
```

and the REAL widening on the same relation was accepted over **6 live task rows**. The relation is
genuinely scanned; the swaps pass because they are wider, not because the table is empty. The live
constraint is byte-unchanged after the rollback.

### 2.3 Every guard that stops the chain on a non-conforming row, shown stopping

Method: a harness splits a migration into its top-level statements (dollar-quote aware), opens ONE
transaction, plants the bad row, runs the file's leading statements **through its own prestate block
verbatim**, records the refusal, and rolls back. The conforming case is the same run with no plant.
Fourteen cases — three conforming, eleven planted. Nothing survived: `v1_accounts=142`,
`v1_state=published`, `document_capabilities=240`, `distinct registry_version=1`,
`firm_setup_keys=15`, `t_firm_setup_keys_append_only='O'` all re-read identically afterwards.

| file | planted row | verdict |
|---|---|---|
| 0295 | *(none — the database as planted)* | **PASSED** · `0295 prestate: clean (FIRST apply) — … is published, unmoved at 42 families / 142 accounts …` |
| 0295 | one extra account row on v1 | **STOPPED** CLR10 · `my_sme_starter v1 carries 42 families / 143 accounts, expected 42 / 142 — the platform starter has drifted from 0150's own seed` |
| 0295 | v1 retired before the window | **STOPPED** CLR10 · `my_sme_starter v1 is retired, not published` |
| 0295 | an existing v1 account recoded to `1180` | **STOPPED** CLR10 · `my_sme_starter v1's CONTENT has DRIFTED from its pinned structural digest (measured 08b363a9…, expected d02a786a…)` |
| 0296 | *(none)* | **PASSED** · `#945 prestate: OK (FIRST apply) — … the capability registry publishes one version across 240 rows with its high-water mark in agreement` |
| 0296 | one capability row left at `registry_version` 3 | **STOPPED** CLR10 · `the registry publishes 2 distinct registry_versions, not one` |
| 0296 | one capability row deleted | **STOPPED** CLR10 · `the registry holds 239 rows, not the 240 measured on this rig — this file inserts and deletes nothing` |
| 0296 | one `payroll_summary` pair moved off the pdf/image branch | **STOPPED** CLR10 · `5 payroll_summary pair(s) sit on the router's pdf/image branch, not the 6 measured on this rig` |
| 0296 | one high-water mark raised | **STOPPED** CLR10 · `1 pair(s) carry a high-water mark that disagrees with the published registry` |
| 0311 | *(none)* | **PASSED** · `#1032 prestate: clean — … the catalogue holds its pinned fifteen rows (twelve unmoved, hashing to the prior pin), the append-only trigger is enabled` |
| 0311 | `tin.user_note` edited | **STOPPED** CLR10 · `tin.user_note has DRIFTED from 0258's own text (got Gate-A planted drift)` |
| 0311 | one catalogue row deleted | **STOPPED** CLR10 · `the firm setup catalogue holds 14 rows (expected 15)` |
| 0311 | one of the twelve accounting rows' `question` edited | **STOPPED** CLR10 · `the twelve accounting rows' pre-existing columns have DRIFTED from the pinned baseline (sha de82d987…)` |
| 0311 | the append-only trigger left DISABLED | **STOPPED** CLR10 · `t_firm_setup_keys_append_only reads tgenabled=D, expected O (enabled)` |

**One guard could not be exercised standalone and is covered by the run instead.** 0304's prestate
refuses outright on a 0293 database — `#942 prestate: the 0222/0303 accrual cohort is absent — those
files must apply first` — because 0303 is chain-internal to the same run. Its data-dependent branch
is therefore proven by the real upgrade (`2 accrual row(s) already exist`) rather than by a
standalone plant.

### 2.4 The two paths converge, measured structurally

Four censuses, each dumped from both databases, byte-sorted and diffed:

| census | rows | `clara_w4int` vs upgraded `clara_w4_hosted` |
|---|---|---|
| every `clara` function: `oid::regprocedure` + `sha256(prosrc)` | **1489** | **IDENTICAL, diff empty** |
| every column: relation, name, type, NOT NULL, default | **4051** | **IDENTICAL** |
| every constraint: relation, name, `pg_get_constraintdef`, `convalidated` | **3103** | **IDENTICAL** |
| every index: `pg_indexes.indexdef` | **947** | **IDENTICAL** |

The four cross-lane collided bodies `wave4-merge.md` names carry exactly the values it recorded, on
all three databases:

| body | sha256(prosrc) |
|---|---|
| `clara.list_review_queue` | `d5456ecc…` |
| `clara.create_accounting_plan` | `a7c108d5…` |
| `clara._plan_admit_occurrence` | `02ea6afe…` |
| `clara._authority_ref_refusal` | `55c20b20…` |
| `clara._obo_plan_core` | `2049c1c4…` |

---

## 3 · The same 21 on `clara_w4_coll` (55702, `en_US.UTF-8`)

**07:23:42Z → 07:23:54Z, 12 s, exit 0 — `21 new migration(s) applied · 309 total`.** Every prestate
clean, every tail green.

**The collation separation 0295 was rewritten to make, proven live.** On this server the STORED v1
digest is `673ede910a7a3bb5f0b3197cbda9bdf7cfa269eb0068a3bb3ac7d6655bf9262b` — the value GitHub
Actions and hosted Supabase read:

```
0295 prestate: clean (FIRST apply) -- my_sme_starter v1 (e3b30b98-…) is published, unmoved at
  42 families / 142 accounts, structural digest
  d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df (collation-independent,
  pinned), stored content_sha256 673ede910a7a3bb5f0b3197cbda9bdf7cfa269eb0068a3bb3ac7d6655bf9262b
  (reproduces from its own rows on this server) …

0295 tail OK: … stored content_sha256 673ede91… is still the value the prestate read, its
  structural digest d02a786a… is still the pinned collation-independent one …
```

So the **structural digest matches the pin `d02a786a…` on a server whose stored v1 hash is
`673ede91…`**, which is exactly what gate 3 asked for. The same four censuses as §2.4, run against
this database, are byte-identical to the from-scratch chain: **1489** function bodies, **4051**
columns, **3103** constraints, **947** indexes.

**One note, expected and not a defect.** v2's own stored `content_sha256` differs by server for the
same reason v1's does — `6a36ad00…` on the two `C.UTF-8` databases, `342bb554…` here. 0295 does not
pin it, the preflight does not read it, and the structural digest is what both sides compare.
Recorded so nobody later mistakes the difference for content drift.

---

## 4 · The `--post` baseline for the release preflight

```
CLARA_MIGRATIONS_DIR=C:/Users/zhant/Desktop/clara-wt/int2/packages/db/migrations \
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted \
  node docs/plan/active/riders-2026-09-20/ceremony-w4/reads-w4.mjs \
       --export-fingerprint <scratchpad>/w4/fp-w4-upg.json
```

```
== fingerprint exported ==
  11346 structural key(s), 54 reference count(s)
  ledger 309 / 0318_knowledge_fye_pair_applicability
== verdict: CLEAN ==
```

Then the read the ceremony runs after its migrate:

```
… reads-w4.mjs --post --baseline <scratchpad>/w4/fp-w4-upg.json \
                --frontier-before 0293_fa_arrears_judgement_scope --no-state
```

**Exit 0, `== verdict: CLEAN ==`.** Zero STOP lines, zero GAP lines, zero `env` lines.

```
ok   the ledger reads 288 + 21 = 309 at 0318_knowledge_fye_pair_applicability
ok   every one of the 21 new migrations has a ledger row at its file checksum - missing=0 checksum-mismatch=0
ok   drift gate: all 309 applied rows match their files
keys compared: 11346  ·  equal: 11346  ·  env: 0
```

Its own reference row counts confirm the planting reached every relation the wave's swaps and
backfills touch: `accrual_adjustments 2`, `prepayment_schedules 2`, `entry_post_receipts 1`,
`document_extractions 9`, `document_processing_tasks 6`, `accounting_plans 4`,
`staff_expense_claim_allocations 1`, `document_capabilities 240`, `coa_template_adoptions 1`,
`firm_setup_keys 15`. The quiescence census printed cleanly, with `workflow_runs` reading `42P01`
(the WDK world is not bootstrapped here, which RIG.md forbids) and **no lock held by another backend
on any of the thirteen relations the wave locks**.

### 4.1 The same read through the pre-window STATE file, as a cross-check

The release-prep worker's note asks for `--frontier-before 0293_fa_arrears_judgement_scope` on
`--post`, which is what the run above used. The other route — the pre-window state file that worker
left in the same scratchpad — was run afterwards as a control, to prove the two agree:

```
… reads-w4.mjs --post --baseline <scratchpad>/w4/fp-w4-upg.json \
                --state <scratchpad>/w4/reads-w4.state.json
```

**Exit 0, `== verdict: CLEAN ==`**, with byte-identical verdict lines: the same
`288 + 21 = 309 at 0318_knowledge_fye_pair_applicability`, the same `missing=0 checksum-mismatch=0`,
the same drift gate over all 309, the same `keys compared: 11346 · equal: 11346 · env: 0`, and 0
STOP, 0 GAP, 0 env. The state file was NOT rewritten (still `applied_before 288`, taken
`2026-09-24T07:14:27.335Z`). **No script problem to report**: `--post` behaved as its README
documents on both routes.

### 4.2 The three artifacts, and what each is

| file | ledger | structural keys | taken |
|---|---|---|---|
| `fp-w4-hosted.json` (release-prep's, PRE-window) | 288 / `0293_fa_arrears_judgement_scope` | 10,976 | 07:09:28Z — before my planting and before the upgrade |
| `reads-w4.state.json` (release-prep's) | `applied_before 288`, 21 pending, `frontier_before 0293_…` | — | 07:14:27Z |
| `fp-w4-upg.json` (**mine, gate 4's deliverable**) | 309 / `0318_knowledge_fye_pair_applicability` | **11,346** | 07:24:50Z — from the UPGRADED database |

The wave adds **370 structural keys** (11,346 − 10,976), which is the difference the ceremony's two
baselines bracket.

**Baseline file path, for the release worker:**
`C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\w4\fp-w4-upg.json`

The pre-window pair sits beside it in the same directory:
`fp-w4-hosted.json` and `reads-w4.state.json`.

---

## 5 · The whole `packages/db` suite (gate 5)

```
cd packages/db
PGHOST=127.0.0.1 PGPORT=55700 PGUSER=postgres PGDATABASE=clara_w4int \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 pnpm test
# = node --test --test-concurrency=1 <125 × --import ./tests/*-preintegration-gate.mjs> "tests/**/*.test.mjs"
```

**07:23:31Z → 07:47:21Z, 23 m 49 s, exit 1.**

| | |
|---|---|
| tests | **5,727** |
| pass | **5,589** |
| fail | **43** |
| skipped | **95** |
| test files on disk | 525 |
| gate chain | **125** `--import` tokens, none twice |
| the wave's own footprint | 45 db test files added, 65 modified |

**The 43 are twelve top-level entries from seven distinct collisions** (§8, F1–F7). Thirty-one of
the 43 are `delta-contract.test.mjs` subtests downstream of a single setup assertion, so the true
count of independent defects is seven.

### 5.1 The confirmation run — eleven of twelve reproduce in isolation

The whole-suite reds could in principle be artefacts of one file writing rows another reads. Two
clean clones of the upgraded database settle it:

| run | database | result |
|---|---|---|
| `prepayment-stated-term.test.mjs` ALONE, full gate chain | `clara_w4_conf1`, a pristine `-T clara_w4_hosted` clone at 309 | **15 tests · 15 pass · 0 fail** |
| the other NINE affected files together, full gate chain | `clara_w4_conf2`, the same kind of clone | **103 tests · 61 pass · 42 fail** — the same eleven top-level reds, same messages |

So **eleven of the twelve are structural and reproduce with nothing else running**, and the twelfth
(F6) is green alone — which is the finding about it, not a doubt about it.

### 5.2 The 95 skips — none is a wave-4 gate declining

| count | reason |
|---|---|
| 39 | `destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE` — the flag RIG.md forbids |
| 29 | the retired F-A2 PR-3 rule-post / autopost / OCR-sales-floor lane, in eleven phrasings, each "this cell's claim has no subject left" |
| 8 | `0037/0038/0040 bank substrate absent (clara.bank_matches / clara.match_bank_line not found)` |
| 19 | named structural declines (an unreachable empty-set arm, an absent onboarding/archived fixture client, and the rest) |

**No skip cites a `CLARA_ALLOW_MISSING_*` escape** — `grep -c` returns 0 — which is what a wave-4
migration failing to apply would look like. The 8 bank-substrate skips are pre-existing: the wave
touched none of 0037/0038/0040, `clara.bank_matches` is present, and the live door is
`clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)` while the gate probes an older
signature. Not mine to fix, and noted only so it is not read as a wave-4 effect.

---

## 6 · The whole `packages/runtime` unit suite (gate 6)

CI's `db-estate-suite` builds the runtime's database as a template copy of the estate and runs the
suite against it. Same shape here, on a clone of the UPGRADED database — named `clara_rt_test`
because #1018's `tests/local-db-gate.mjs` admits `clara_(rt_test|wave_b_ci|intake_ci|\d{3}|l\d{2})`
and `body-census-guard-db.test.mjs` declines silently under any other name:

```
createdb -p 55701 -T clara_w4_hosted clara_rt_test          # 309 / 0318
PGDATABASE=clara_rt_test CLARA_RIG_DB=1 \
  WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55701/clara_rt_test \
  pnpm --filter @clara/runtime --if-present test
```

**07:45:49Z → 07:52:12Z, 6 m 22 s.** **2,970 tests · 2,926 pass · 4 fail · 40 skipped**, 239 test
files on disk.

| red | classification |
|---|---|
| `tests/facts-gate-consumer.test.mjs:126` — *a payroll_summary document.classified is HELD — a skipped_kind receipt* | **(c) integration collision** — F8 |
| `tests/l9-tls-ca.test.mjs:341` — *H-43 MINOR: the TLS roster is a SUPERSET of the lane roster* | **(c) integration collision** — F9 |
| `tests/intake-unit.test.mjs:114` — *scanner rejects EICAR, encrypted PDF, and XML entity expansion* | **(a) known Windows-only**, named in RIG.md |
| `tests/pg-tools-fixture.test.mjs` — *(#806) this host's OWN probe: pg_dump/psql are on PATH here* | **(a) known Windows-only**, named in RIG.md |

The two known reds, with their own evidence rather than an appeal to RIG.md:

```
intake-unit.test.mjs:114  Error: UNKNOWN: unknown error, open
                          'C:\…\Temp\clara-intake-hoV4QQ\eicar.bin'
                          — Defender removed the fixture before the scanner opened it, and the
                          very next cell, "(#693) a quarantined EICAR fixture on win32 SKIPS with
                          the explicit reason", PASSES, as does its positive control
pg-tools-fixture.test.mjs `which pg_dump` on this host: not found; the PATH's only Postgres entry
                          is C:\Program Files\PostgreSQL\16\bin, which holds no pg_dump.exe
```

**The documented `ready.test.mjs` flake did NOT fire**, even though this suite shared the host with
the `packages/db` suite for its first two minutes: all four H-48 cells (`ready MAJOR-1` ×2,
`ready r2` ×2) passed. No re-run was needed, so nothing here is classified (b).

### 6.1 The 40 skips, and the six I chased down

| count | reason |
|---|---|
| 22 | `the WDK world (workflow.workflow_runs), migration 0178 or the document lane is absent from this database` — RIG.md forbids bootstrapping a World here (#866: it would red `rig-isolation` T10b) |
| 11 | `pg_dump/psql not found on PATH` — the same Windows condition as the red above |
| 6 | `needs a built runtime` / `no .output/` |
| 1 | `post-0097: clara.fail_witness_facts is the real verb` — a named structural decline |

The six bundle-gated skips are the only ones CI would NOT skip, because CI builds the runtime. I
built it (`pnpm --filter @clara/runtime build`, 16 s, exit 0, `.output/` is gitignored and the
worktree stayed clean) and re-ran the three files that own them:

```
node --test --test-concurrency=1 tests/body-census-guard-db.test.mjs \
  tests/f-a6-pr2-fixround-unit.test.mjs tests/p6-1-chatturn-v16.test.mjs
# tests 40 · pass 37 · fail 3
```

`f-a6.pr2.bundle.s1-call-sites` and `p6-1.bundle` both **pass against the real built artifact** —
two cells the whole-suite run could not prove. The three `637.s5` cells then fail with
`relation "workflow.workflow_runs" does not exist` (42P01) and a 90 s `/ready` timeout: they need a
bootstrapped WDK world as well as a bundle, and the rig has neither by policy. **Not a defect, and
not proven by me** (§9).

### 6.2 The wave's new runtime test files under WSL as `runner`

`git diff --name-status 8470d8212...HEAD -- packages/runtime/tests` is **5 added, 11 modified, 0
deleted**. The five added, run as user `runner` on Linux (`/opt/node/bin/node --test <file>`):

| file | result |
|---|---|
| `agreement-facts-v1.test.mjs` | **12 pass / 0 fail** |
| `payroll-facts-v1.test.mjs` | **12 pass / 0 fail** |
| `runtime-contracts.test.mjs` | **2 pass / 0 fail** |
| `fa-particulars-proposal-unit.test.mjs` | **cannot run on this rig** |
| `p871-invite-preview-db.test.mjs` | **cannot run on this rig** (tried with a DB target too) |

The two that cannot run hit the wave-3 wall unchanged, and the cause is the rig, not the code:

```
You installed esbuild for another platform than the one you're currently using.
Specifically the "@esbuild/win32-x64" package is present but this platform needs
the "@esbuild/linux-x64" package instead.
```

This worktree's `node_modules` is a Windows install; both files reach `tsx`/esbuild
(`p871-invite-preview-db.test.mjs` imports `tsx/esm/api` directly). Fixing it means a Linux
`pnpm install` over the same tree. Both ran on Windows in the whole suite.

---

## 7 · Static gates

| gate | command | result |
|---|---|---|
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK** — `322 frozen file(s) verified against frozen-workflows.json (append-only vs origin/main); 57 "use workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded.` exit 0 |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — `CI proves reader ⊇ emittable at this commit`; emittable = {freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}; allowlist = {agent_receipt, firm_question, close_proposal}. exit 0 |
| registry view | `node --test packages/runtime/tests/registry-view.test.mjs` | **7 tests · 7 pass · 0 fail.** The `agreementFacts` roster defect `wave4-release-prep.md` §2 left OPEN is CLOSED on this head by `c9968b5fc`; **gate 0a of the runbook is satisfied** |
| typecheck | `pnpm typecheck` | **exit 0**, both projects, 07:25:46Z → 07:27:28Z (1 m 42 s) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, 07:27:37Z → 07:29:42Z (2 m 05 s) |

---

## 8 · Findings

Every one is an **integration collision**: a closed-world census that was correct on each lane's own
database and on `main`, and is wrong on the merged tree because a sibling lane added a member the
census does not know. **None is a defect in a lane's product code, none is a known Windows-only red,
and none is a flake.** The database repro shape is

```
cd C:\Users\zhant\Desktop\clara-wt\int2\packages\db
PGHOST=127.0.0.1 PGPORT=55700 PGUSER=postgres PGDATABASE=clara_w4int \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 \
  node --test --test-concurrency=1 $GATES tests/<file>.test.mjs
```

with `$GATES` the 125 `--import ./tests/*-preintegration-gate.mjs` flags from
`packages/db/package.json`'s `test` script.

### F1 · MAJOR — `#977`'s reader census does not know the OBO twin

```
tests/authority-ref-human-instruction.test.mjs:214
not ok 271 - p977.definition.one … and exactly the two doors the ruling names read the one definition
  actual:   ['_obo_plan_core', 'create_accounting_plan', 'sign_depreciation_authority']
  expected: ['create_accounting_plan', 'sign_depreciation_authority']
```

**The live set is right and the cell's roster is stale by one.** `bb102839c` widened
`clara.create_accounting_plan`'s authority wall for lane 01's third `authority_ref` kind and
deliberately left `clara._obo_plan_core`'s copy at two kinds. `0dadf0a69` closed that residual
because lane 04's own cells (`p915.obo.refusals_match`, `p941.obo.authority`) MEASURE the copy, and
the honest way to keep the copy exact was to make the OBO twin read the shared
`clara._authority_ref_refusal` — which is what #977 asks of any wall. So the third reader belongs
there. The fix is a third roster entry carrying that adjudication, never a weakened cell.

### F2 · MAJOR — lane 01's two new frozen evaluators are absent from the delta registration census

```
tests/delta-catalog-phase.mjs:718   (reached from delta-contract.test.mjs:66)
not ok 18 - freeze verifier positively reads registered live bodies, deployment count exact …
  {"ok":true,"verified_deployed":0,"verified_registered":11}
  11 !== 9
```

That one setup assertion is why `delta-contract.test.mjs` reports **`31 subtests failed`**: with the
catalog phase red the ceremony never completes for delta's purposes and all 31 downstream cells fail
`metric evaluator is not deployed`. **One collision, not thirty-two.**

| measured on `clara_w4int` | |
|---|---|
| `clara.verify_evaluator_freeze()` → `verified_registered` | **11** |
| the cell's arithmetic `6 + card1_v2 + prepay_v1 + prepay_v2` | **9** |
| platform closures this wave adds | **2** — `evaluate_payroll_run_state` v1 (`0296`, #945) and `evaluate_agreement_contract_state` v1 (`0299`, #948) |

The file's own pattern is explicit: every new closure gets a MEASURED three-state term so the cell
"stays exact on a pre-0305 chain too". The remedy is two more terms of the shape already there.

### F3 · MAJOR — the same two closures break epsilon's deployment census

```
tests/epsilon-contract.test.mjs:141   (ensureEvaluatorDeployed)
not ok 1027 - Wave E lane epsilon -- the FS reporting layer, end to end
  the one-way evaluator ceremony committed every registered closure it covers
  (plus 0 row(s) some prior run's own ceremony had already flipped)
  7 !== 5
```

Same cause, different arithmetic: epsilon pins the ceremony's COVERED set at `5 + extra`. Both
wave-4 closures ship `deployed = true` and neither sits in any `CEREMONY_EXCLUDED*` list, so the
covered set is 7. **F2 and F3 are one collision with two sites.**

### F4 · MAJOR — 0309's two new roles are not registered in the closed-world role roster

```
tests/er9-gates-boundaries.test.mjs:476
not ok 1045 - R9.H3 the close verbs are HUMAN-ONLY …
  mandatory setup: the non-sanctioned clara_ role census: clara_invite_preview is LIVE but appears
  in no roster entry. A closed world stays closed by registration: add it to
  packages/db/tests/fixtures/wake-allowlist-roster.mjs in the PR that creates it, with …
  (and the same sentence for clara_invite_preview_login)
```

The census names its own remedy. `0309_invite_preview_public_door.sql` (#871) mints
`clara_invite_preview` and `clara_invite_preview_login`;
`packages/db/tests/fixtures/wake-allowlist-roster.mjs` carries one entry per non-sanctioned `clara_`
role with a `stem`, an `applied` predicate and a `why`. The `clara_auth_wall` /
`clara_auth_wall_login` pair already in that file (lines 186–198) is the exact shape the new pair
needs — `applied` gated on the `invite_preview_public_door$` stem, the login shell gated on
`roleExists("clara_invite_preview")`. Three test files read that roster; only this one enforces the
census, and the other two (`f-a2-chat-limb`, `f-a2-grants`) ran green.

### F5 · MAJOR — `#942`'s two new queue columns break the pinned 31-key row shape, at BOTH sites

```
tests/ninth-rowkind-seeding-proposal.test.mjs:255
not ok 2643 - 0288: the surviving row_kinds are untouched …
  row_kind='open_question' carries a DIFFERENT key set than the pinned 31-key shape
  +   'accrual_plan_status'
  +   'accrual_side'
not ok 2644 - (the file's own `after` hook) expected 2 cells to run, 1 did

tests/work-question-reads.test.mjs:149
not ok 4536 - w629.inbox.row list_review_queue offers the pending work question in needs_you
  inbox.row: row_kind='work_question' carries a DIFFERENT key set than the pinned shape
  (now 31 keys, #974/0260 added authority_id)
  +   'accrual_plan_status'
  +   'accrual_side'
```

`0304_accrual_revenue_side.sql` (#942) is the only migration in the tree whose text names
`accrual_plan_status`, and its own notice says so: *"the row carries accrual_side and
accrual_plan_status (both derived from the shared id)"*. Two files carry a `FULL_ROW_KEYS` roster —
`ninth-rowkind-seeding-proposal.test.mjs:57` and `work-question-reads.test.mjs:48` — and **neither
mentions either key**. `wave4-merge.md`'s "what the gate workers inherit" item 4 lists "the two
db-side `FULL_ROW_KEYS` rosters" as an extension point for a new ROW KIND; #942 added two COLUMNS
instead, and the same two rosters needed the same edit. `not ok 2644` is the first file's `after`
hook cascading off its own red cell, not a separate defect.

### F6 · MODERATE — lane 04's evaluator cell pins a one-way ceremony's PRE state absolutely

```
tests/prepayment-stated-term.test.mjs:303
not ok 2991 - p939.evaluator.frozen — clara.prepayment_schedule_v2 is registered as its OWN closure …
  evaluator versions are born undeployed — the flip is a one-way ceremony act, not this file's
  true !== false
```

`assert.equal(v2.deployed, false, …)` reads a CLUSTER-WIDE one-way fact as if it were this file's
own. `epsilon-contract.test.mjs`'s `ensureEvaluatorDeployed()` runs the deployment login (which
commits) before its own assertion, and `e` sorts before `p`, so by the time lane 04's file runs the
row reads `deployed = true`.

**Proven to be the ordering, not the code:** run ALONE on a pristine 309 clone where no ceremony has
run, the file is **15 tests · 15 pass · 0 fail** (§5.1). Green alone, red in any whole-suite run, and
so red in CI. The two other files that reason about this state read it as a THREE-STATE fact — "read
back, never assumed" — precisely because of the one-way ceremony
(`delta-catalog-phase.mjs:700-717`, `epsilon-contract.test.mjs:120-140`). The remedy is to read it
the way its two neighbours do. The file is lane 04's own (`bd7da218a`, #939), so nothing
pre-existing regressed.

### F7 · MAJOR — the wave's new doors are missing from the S5.25 clock rosters (4 cells, 3 files)

```
tests/x42b2-r7-s5-census.test.mjs:129   not ok 5355 - x42.r7.s5.census.4b …
tests/x42b2-r7-s5-clock.test.mjs:211    not ok 5357 - x42.r7.s5c.5 …
tests/x42b2-s5c-clock.test.mjs:230      not ok 5366 - x42.s5c.5 …
tests/x42b2-s5c-clock.test.mjs:369      not ok 5367 - x42.s5c.6 …
```

The same family wave 3 fixed in `06060f362`, with this wave's doors. Both rosters live in
`packages/db/tests/x42-s5-helpers.mjs`. The exact deltas, computed from the cells' own
expected/actual strings:

**(a) The Asia/Kuala_Lumpur DUPLICATION roster** (`x42.r7.s5.census.4b`, `x42.s5c.5`) — expected 30
names, live **33**:

| | |
|---|---|
| ADDED | `_prepayment_schedule_core` (0315, #1036), `_revenue_recognition_core` (0308, #941), `replace_prepayment_schedule` and `replace_revenue_recognition_schedule` (0317) |
| MISSING | `create_prepayment_schedule` |

**The adjudication, measured rather than assumed.** In all four new bodies the `'Asia/Kuala_Lumpur'`
literal is the `p_timezone` ARGUMENT handed to the plan door, not a second derivation of the house
legal date — read off `prosrc`:

```
… p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
  p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => …
```

and `clara.create_prepayment_schedule` now carries **no such literal at all**, which is why it left
the roster: #1036's reroute moved that body into `_prepayment_schedule_core`. So one entry MOVED and
three joined for the same lawful reason. The fix worker should re-measure the roster and record that
adjudication, not silence the cell.

**(b) Arm (D)'s bare-token roster** (`x42.r7.s5c.5`, `x42.s5c.6`) — expected 289 names, live **296**,
seven added and none missing:

`enrol_prepayment_account`, `retire_prepayment_account` (0306, #940) · `record_prepayment_stated_term`
(0305, #939) · `replace_prepayment_schedule`, `replace_revenue_recognition_schedule` (0317) ·
`skip_plan_occurrence` (0302, #938) · `preview_invite_by_token` (0309, #871).

**The adjudication here is NOT finished and the fix worker owes it.** Arm (D) catches a bare clock
token, and a bare token is only a defect when the body derives a DATE from it. Wave 3's three doors
were cleared by measuring that every column they stamp is TIMESTAMPTZ. That is **not** true by
inspection here: the relations these seven write carry DATE columns as well as timestamptz ones —

| relation | `date` | `timestamptz` |
|---|---|---|
| `prepayment_schedules` | `term_start`, `term_end` | `created_at`, `superseded_at` |
| `prepayment_stated_terms` | `period_start`, `period_end` | `stated_at`, `superseded_at` |
| `revenue_recognition_schedules` | `term_start`, `term_end` | `created_at`, `superseded_at` |
| `accounting_plan_occurrences` | `due_date`, `period_key` | `admitted_at`, `created_at` |
| `prepayment_account_enrolments` | — | `enrolled_at`, `retired_at` |
| `invite_preview_attempts` | — | `attempted_at` |

The date columns are expected to come from a person's stated term rather than from the session
clock, but **that has to be read body by body before the seven names join the roster**. Two of the
seven (`enrol_prepayment_account`, `preview_invite_by_token`) write only timestamptz relations and
are cheap to clear; the other five need the read.

### F8 · MAJOR (runtime) — 0296 retired a receipt a pre-existing runtime cell still asserts

```
tests/facts-gate-consumer.test.mjs:126
not ok 867 - cycle: a payroll_summary document.classified is HELD — a skipped_kind receipt,
             NEVER a runnable invoice_facts task (the classifier gate)
  the gate left a skipped_kind receipt (got: )
```

The cell's FIRST assertion still passes — there is no runnable `invoice_facts` task for a
`payroll_summary`. The SECOND fails because there is no `failed`/`skipped_kind` row either: the task
list is empty. That is **0296 (#945) working as designed**, and
`wave4-release-prep.md` §3.3 predicted it in words: *"0296 and 0299 stop minting the terminal
`failed/skipped_kind` receipt for a payroll summary or an agreement contract and mint a `queued` row
on a lane the serving image does not know."*

`git diff --name-only 8470d8212...HEAD -- packages/runtime/tests/facts-gate-consumer.test.mjs` is
**empty** — the file is pre-existing and lane 01 never re-measured it, which a lane running only the
files it touched could not have seen. The cell is frontier-dependent: green against a 0293 database,
red against 309. The remedy is to re-measure it for the payroll lane (or gate it on the
`payroll_summary_typed_facts$` stem), and it must not be left red: it is the cell that proves the
classifier gate never starts a generic OCR run outside a lane's consent controls.

### F9 · MAJOR (runtime) — the invite-preview lane is probed but not TLS-checked

```
tests/l9-tls-ca.test.mjs:341
not ok 1261 - H-43 MINOR: the TLS roster is a SUPERSET of the lane roster
  every PROBED lane must also be TLS-checked; unchecked: CLARA_INVITE_PREVIEW_DATABASE_URL
```

`packages/runtime/lib/invite-preview-pool.mjs:51` declares
`INVITE_PREVIEW_DSN_VAR = "CLARA_INVITE_PREVIEW_DATABASE_URL"` (introduced by `2947bb72b`, lane 05's
#871), and `packages/runtime/lib/tls-ca.mjs:80-86` carries a seven-entry TLS roster
(`CLARA_RUNTIME_`, `_READ_`, `_WRITE_`, `_FREEFORM_`, `_BANK_`, `_STRIPE_WEBHOOK_`, `_AUTH_WALL_`)
that does not include it. The remedy is one line beside `CLARA_AUTH_WALL_DATABASE_URL`. Despite the
cell's own "MINOR" label this is the pool that will be pointed at hosted at runbook step 6e.3, so it
should not reach RELEASE_SHA unchecked.

---

## 9 · Anything unverified

1. **A `proposed` chart adoption was never present** on any of the three databases, because no
   shipped door creates one (§2.1, verified against `clara.apply_coa_template`'s own `prosrc`). 0295's
   `D-CHART-ADOPTIONS` census therefore ran with `proposed = 0`. If a "Clara proposes a chart" door
   ever ships, this branch is still unexercised.
2. **Six relations the wave itself creates were empty when their own constraints were built** —
   `revenue_recognition_schedules`, `prepayment_account_enrolments`, `accrual_period_amounts`,
   `prepayment_stated_terms`, `contract_terms`, `invite_preview_attempts` all read 0 after the
   upgrade. They cannot be populated before the file that creates them applies, so 0317's
   `revenue_recognition_schedules` FKs, uniqueness swap and paired CHECKs, and 0306's roster guards,
   ran over zero rows. Structural, not an omission — but it is not proof.
3. **Scale.** Every populated relation carries single-digit rows. The wave's largest measured cost —
   0296 and 0299 each rewriting all 240 `document_capabilities` rows, 1,920 trigger firings — took
   14 s here on a seeded rig. That is not a prediction for hosted.
4. **Arm (D)'s adjudication for the seven new doors is owed** (F7b). I measured the roster delta and
   the column types; I did not read all seven bodies to decide whether any derives a DATE from the
   session clock.
5. **Three `637.s5` runtime cells** need both a built bundle and a bootstrapped WDK world. With the
   bundle built they reach `relation "workflow.workflow_runs" does not exist`; RIG.md forbids
   bootstrapping a World here (#866). Unproven by me; CI has both.
6. **Two of the five new runtime test files could not run under WSL as `runner`** — the
   `@esbuild/win32-x64` wall (§6.2). Both ran on Windows.
7. **The 39 reset-gated `packages/db` skips** need `CLARA_RIG_ALLOW_RESET`, which RIG.md forbids on a
   shared rig, so those destructive cells are unproven by me on this wave.
8. **Anything hosted.** No hosted access. The upgrade rehearsal, the collation run and the `--post`
   baseline are rig readings.
9. **The web suites and `apps/web`** are not mine.
10. **The 8 bank-substrate skips** (§5.2) are reported, not diagnosed beyond establishing that the
    wave touched none of 0037/0038/0040.

---

## 10 · What is left on the rigs

**`rigw4` — 127.0.0.1:55700** · `clara_w4int`, **309 / 0318**: the from-scratch chain, seeded, and
the database §5's whole `packages/db` suite ran against. It carries that suite's rows and is no
longer a clean baseline. Cluster `clara%` roles: **20**.

**`rigw4h` — 127.0.0.1:55701**

| database | what it is |
|---|---|
| `clara_w4h_pre` | **288 / 0293, the preserved PRE-WINDOW baseline.** A `-T clara_w4_hosted` clone taken before anything was planted. This is what the release ceremony's `--baseline` export should come from |
| `clara_w4_hosted` | **309 / 0318, the UPGRADE baseline.** Populated through real doors, then migrated with the 21. `fp-w4-upg.json` was exported from it and `--post` ran CLEAN against it |
| `clara_rt_test` | a `-T clara_w4_hosted` clone at 309, the database §6's `packages/runtime` suite ran against. Carries that suite's rows. Not a baseline |
| `clara_w4_conf1` | §5.1's pristine control — `prepayment-stated-term.test.mjs` alone, 15/15 |
| `clara_w4_conf2` | §5.1's confirmation run of the nine affected files |

Cluster `clara%` roles: **20** (18 before, plus 0309's pair).

**`rigw4c` — 127.0.0.1:55702** · `clara_w4_coll`, **309 / 0318**, `en_US.UTF-8`. Gate 3's database.

Nothing was dropped on any cluster except `clara_w4int`, which §1 re-created. No cluster outside
these three was written to.

---

*(Gate A complete. `fb1dae78a` measured; `fdb9ba135` carries the same code.)*
