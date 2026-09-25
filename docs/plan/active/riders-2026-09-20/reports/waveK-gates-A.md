# Riders closing wave K — gate A: the from-scratch chain and the census

**Code** `C:\Users\zhant\Desktop\clara-wt\710`, branch `integration/riders-closing`, head
**`18eb2dc4d1ceb62c8d335bb6f30526d4786d244f`** — every command below was run at that commit, and
**97** files separate it from the base `ffb629d73`, which is the merger's own figure
(`reports/waveK-merge.md` §5.2). `git status --porcelain` in that worktree read **empty** before this
gate and empty after it. I committed nothing, edited no tracked file, pushed nothing, opened no pull
request, wrote nothing to GitHub, touched no lane worktree and no file in the main checkout but this
report, spawned no subagent, killed no process I did not start, and never set `CLARA_RIG_ALLOW_RESET`
or `CLARA_RIG_ALLOW_ROLE_SWEEP`. Gate B's clusters (`rigw4h` 55701, `rigw4c` 55702) and Gate C's
(`rigclosec` 55712) were never connected to; the only servers this gate opened a connection to are
its own `rigclose` (55711) and a **read-only** census of `clara_intK` and `clara_intS6` on `rl02`
(55742).

**Host** Windows 11 + WSL PostgreSQL 17.11 (Ubuntu) · Node v22.23.2 · pnpm 10.33.0
**Cluster** `rigclose`, `127.0.0.1:55711`, `C.UTF-8`, trust — **built for this gate and dropped at
the end of it** (§6).
**Database** `clara_closeint` — **all lower case**, deliberately, per the brief and
`waveK-merge.md` §5.3.

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **the disposable cluster** | `pg_createcluster --locale C.UTF-8 17 rigclose -p 55711 --start` | online, PostgreSQL **17.11**, `datcollate = C.UTF-8`, trust on `local` + both loopback hosts, **0** `clara%` roles at birth |
| 2 | **the chain, 0001 → 0365, from empty** | `pnpm --filter @clara/db migrate` | **341 new applied · 341 total**, exit 0, **2 m 04 s** (22:01:25Z → 22:03:29Z) |
| 2a | the ledger head | `clara.schema_migrations` | **341 rows**, head `0365_accrual_register_pagination`, `0295` at the post-fix checksum `5196d64d…` |
| 2b | the wave's own four files | log read file by file | **4 / 4 applied, every one on its FIRST-apply branch, ZERO REDO**, zero prestate refusals, every tail green (§2.2) |
| 2c | the four files' ledger checksums | `clara.schema_migrations` | **all four identical to the values `waveK-merge.md` §5.1 / §7.1 predicted**, to the character (§2.3) |
| 2d | hard errors | `ERROR:` / `FATAL:` in 1424 log lines | **none** |
| 2e | the cluster role census | `pg_roles like 'clara%'` | **0 → 20**, 0154's own count, reached by the chain alone (no reset, no sweep) |
| 2f | seed | `pnpm --filter @clara/db seed` | **2 seed file(s)**, exit 0 |
| 2g | drift | a second `migrate` on the same database | **0 new applied · 341 total**, exit 0 — no checksum drift |
| 3 | **the census, seven of them, vs `clara_intK` (55742)** | `sha256(prosrc)` + five catalog censuses + the ledger | **every one diff 0** — §3 |
| 3a | function bodies | `oid::regprocedure` + `sha256(prosrc)` | **1542 rows, IDENTICAL** |
| 3b | columns | relation, name, type, NOT NULL, default | **4070 rows, IDENTICAL** |
| 3c | constraints | relation, name, `pg_get_constraintdef`, `convalidated` | **3122 rows, IDENTICAL** |
| 3d | indexes | `pg_indexes.indexdef` | **957 rows, IDENTICAL** |
| 3e | policies | relation, name, permissive, roles, cmd, `qual`, `with_check` | **663 rows, IDENTICAL** |
| 3f | grants and posture | relation owner + RLS + `relacl`; function owner + definer + volatility + `proconfig` + `proacl` | **1886 rows, IDENTICAL** |
| 3g | the ledger itself | `version` + `checksum`, all rows | **341 rows, IDENTICAL** |
| 3h | the ten bodies the wave writes | `sha256(convert_to(prosrc,'UTF8'))` | **all ten equal `waveK-merge.md` §5.1's post-images** (§3.2) |
| 4 | **every lane's db batteries, full 156-gate chain** | `node --test --test-concurrency=1 <156 gates> <12 files>` | **125 tests · 125 pass · 0 fail · 0 skipped**, exit 0, **52 s** |
| 4a | `operation-census` + `rig-isolation`, same chain | as above | **33 tests · 32 pass · 0 fail · 1 skipped**, exit 0, 51 s — the one skip is §5 N2 |
| 4b | the per-lane reconciliation | the same 12 files re-run in three lane groups | **L1 35 · L2 64 · L3 26**, and 35 + 64 + 26 = 125 (§4.2) |
| 4c | the gate chain's own registration | 156 tokens vs `tests/*-preintegration-gate.mjs` on disk | **156 = 156**, no orphan file and no token pointing at a missing file; **152 on the base + 4 the wave adds** |
| 4d | the census RE-TAKEN after the batteries | all seven, diffed against the pre-battery dumps | **all seven diff 0** — the batteries left no structural residue (§3.3) |
| 5 | **the cluster dropped** | `pg_dropcluster 17 rigclose --stop` | exit 0, gone from `pg_lsclusters` (§6) |

**One sentence.** The whole estate rebuilds from `0001` to `0365` on a cluster that never saw a
migration before, in 2 m 04 s, with all four of the wave's files on their first-apply branch, zero
REDO, zero refusals and no recut; and the database that chain produces is **byte-for-byte the same
database the merger integrated**, across 1542 function bodies, 4070 columns, 3122 constraints, 957
indexes, 663 policies, 1886 grant-and-posture rows and all 341 ledger rows.
**Verdict: PASS. Nothing above note.**

**This closes the largest debt the merge carried.** `waveK-merge.md` §7 item 1 records that the
from-scratch chain was not run there, because `CLOSING-PLAN.md` risk 1 forbids a second from-scratch
chain on cluster 55742, and that all three code lanes carry it as an open item (L1's `SPEC-04`, L2's
§7, L3's `SPEC-K3-08`). It is run here, on a disposable cluster, and it agrees with the merger's
template-based chain on every axis measured.

---

## Method

`reports/waveS-gates-A.md` is the template and `reports/waveC-gates.md` §1.1 is the cluster recipe.
Three things are done differently, each because this wave is a version cut whose merge made no recut:

1. **The database name is all lower case, by instruction.** `waveK-merge.md` §5.3 found the one red
   in its whole-suite run to be `role-census-reset.test.mjs:182` interpolating `PGDATABASE`
   **unquoted** into a `grant connect on database …`, which PostgreSQL folds to lower case, so any
   mixed-case integration database makes that cell unrunnable. `clara_closeint` carries no capital,
   so this gate could not have reproduced that red even had it run the cell. It did not run it: that
   file is not one of the wave's batteries (§4.1), and the whole `packages/db` suite is the merger's
   gate, already run twice there.
2. **The census is taken BEFORE the batteries run, and then AGAIN after them.** The sweep's gate A
   took it once, before, and listed the post-battery structural state as unverified (its §7 item 4).
   Here both readings exist and both are diff 0, so a structural change left behind by a battery is
   ruled out rather than assumed away.
3. **The lane reconciliation is measured, not divided.** The twelve batteries were run once together
   for the headline count and then a second time in three lane groups, so each lane's figure can be
   compared with the number that lane and the merger reported, instead of inferring it from a total.

The census is read off the catalog, in a session with `search_path = pg_catalog` so that every
`regprocedure` and `regclass` renders schema-qualified on both servers, and ordered by the rendered
text rather than by OID, which differs between databases by construction.

---

## 1 · The cluster, built the way waveC's §1.1 built `rigcut`

Every command, verbatim, from Git Bash on Windows driving WSL:

```
sudo -n pg_createcluster --locale C.UTF-8 17 rigclose -p 55711 --start
sudo -n cp /etc/postgresql/17/rigw4/pg_hba.conf /etc/postgresql/17/rigclose/pg_hba.conf
sudo -n chown postgres:postgres /etc/postgresql/17/rigclose/pg_hba.conf
sudo -n pg_ctlcluster 17 rigclose reload
```

| step | result |
|---|---|
| `pg_createcluster` | online; `initdb --locale C.UTF-8`, encoding UTF8 |
| `select version()` | `PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg26.04+2) on x86_64-pc-linux-gnu` |
| `template1.datcollate` / `datctype` | **`C.UTF-8`** / **`C.UTF-8`**, encoding UTF8 |
| `pg_hba.conf` after the copy | `local all all trust`, `host all all 127.0.0.1/32 trust`, `host all all ::1/128 trust`, plus the three replication lines — identical to `rigw4`'s |
| `clara%` roles at birth | **0** |
| databases at birth | `postgres`, `template0`, `template1` and nothing else |

RIG.md's port rule is observed: Windows cannot reach TCP 55772–55871 on this host, and **55711** is
below that range. Before this gate created it, `pg_lsclusters` showed no cluster named `rigclose` and
nothing listening on TCP 55711 (checked from both sides: `ss -ltn` in WSL and `netstat -ano` on
Windows each showed 55710 only).

---

## 2 · The chain, 0001 to the integrated head, on an empty database

### 2.1 The roster and the run

`packages/db/migrations` holds **341** `.sql` files and **the first four characters of every filename
are unique across all 341** — no duplicate number anywhere. The wave contributes **four** of them and
every one is an **addition**: `git diff --name-status ffb629d73...HEAD -- packages/db/migrations` is
four lines and all four are `A`. **No already-shipped migration file was edited by this wave**, which
is the cleanest possible precondition for Gate B's upgrade path.

```
createdb -h 127.0.0.1 -p 55711 -U postgres clara_closeint
PGHOST=127.0.0.1 PGPORT=55711 PGUSER=postgres PGDATABASE=clara_closeint \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 pnpm --filter @clara/db migrate
```

**22:01:25Z → 22:03:29Z, 2 m 04 s, exit 0.**

```
migrate: 341 new migration(s) applied · 341 total · target 127.0.0.1:55711/clara_closeint
```

341 `applied … · backend pid` lines in a 1424-line log. `clara.schema_migrations` reads **341 rows,
head `0365_accrual_register_pagination`**, and `0295_wave4_chart_rows` carries the post-fix checksum
`5196d64d944e61ef836313cffd6bcc2d4dddd18bc808ca55f86e30544ecece0d` — the same value `clara_intK` and
the pristine `clara_intS6` template carry.

The cluster's `clara%` role count went **0 → 20**, reached by the chain alone, and the twenty are the
same twenty the sweep's gate A enumerated: `clara_agent_read_login`, `clara_agent_ro`,
`clara_auth_wall`, `clara_auth_wall_login`, `clara_authenticated`, `clara_fn_owner`,
`clara_freeform_login`, `clara_freeform_ro`, `clara_invite_preview`, `clara_invite_preview_login`,
`clara_runtime`, `clara_runtime_login`, `clara_stripe_webhook`, `clara_stripe_webhook_login`,
`clara_wake_bank`, `clara_wake_bank_login`, `clara_wake_filing`, `clara_wake_interactive`,
`clara_wake_proactive`, `clara_wake_write_login`. **No closing-wave migration minted a role**, which
is `CLOSING-PLAN.md` risk 1's mitigation holding on a virgin cluster rather than on a reused one.

Seed afterwards: `0001_smoke_seed.sql`, `0002_core_seed.sql`, exit 0.

### 2.2 The wave's four files, with the branch each took

**Every one printed a clean prestate and a green tail. Zero REDO, zero refusals, and no body was
recut** — which is what §0 of the merge predicted from the body sets, now confirmed on a chain that
started from nothing rather than from a template.

```
[notice] 0362 prestate OK -- read door FIRST, withdraw door FIRST
[notice] 0362 tail OK -- the model lane can ask what a firm has instructed, a withdrawal says how
        many plans keep posting, and neither gave anybody a way to act
[notice] 0363 prestate: OK -- the read door is FIRST APPLY; the verdict is at its measured
        pre-image and ungranted
[notice] 0363 tail OK -- a document page can ask why a payslip did not post, the internal is still
        nobody's to call, and nothing above the door may reword what it says
[notice] 0364 prestate OK -- 6 FIRST, 0 REDO -- clara.create_accrual_adjustment(...)=FIRST
        clara.correct_accrual_adjustment(uuid,jsonb,text)=FIRST
        clara._confirm_tenancy_rent_plan_core(...)=FIRST
        clara._confirm_tenancy_rent_plan_revision_core(...)=FIRST
        clara._obo_plan_core(...)=FIRST clara._tenancy_plan_core(...)=FIRST
[notice] 0364 tail OK -- the accrual and tenancy lanes hold namespaces of their own, the prepayment
        lane keeps :plan, both tenancy cores close their lane set, and the third on-behalf-of plan
        step is a caller
[notice] #1152 prestate: clean -- exactly one starting shape of clara.list_accrual_adjustments is
        live (four-argument, pre-page (#1075/0334)), matching what this file expects for it; its
        three prerequisites (clara._human_ctx, clara.role_rank, clara._accrual_sides) and five
        relations are present; and clara.get_accrual_adjustment still resolves, untouched.
[notice] #1152 tail: OK -- clara.list_accrual_adjustments exists EXACTLY ONCE, at
        (uuid,date,date,text,jsonb,integer); the four-argument signature is GONE rather than left
        as a resolvable overload ...
```

**`0364`'s six prestates all read FIRST on a from-scratch chain**, which is the reading that matters
for a fold: the file is not entering a redo arm, it is cutting the six bodies once. `0365`'s
prestate is the from-scratch confirmation the merge could only make on a template — that exactly one
starting shape of `clara.list_accrual_adjustments` is live at the moment the file runs, with every
other lane's file already applied beneath it.

The word "redo" appears **35** times in the log and **every occurrence is prose** inside a bimodal
admission sentence (`… or, on a redo, this file's own prior effect …`). The five files that print the
numeric prestate form all read `0 REDO`: `0317`, `0335`, `0336`, `0337`, `0338`, `0361` and `0364`.
No file printed a redo branch as its taken arm.

### 2.3 The four checksums, against the values the merger predicted

`waveK-merge.md` §5.1 hashes each migration file on the merged head and §7 item 1 names the two
values "a gate-A run should expect". All four match this chain's own ledger to the character:

| file | this chain's ledger checksum | merger's predicted value |
|---|---|---|
| `0362_standing_instruction_agent_read` | `dea2860efae88070261b722e89d0b28fda78f57ae721f048a9ca3f2aebe2aa6e` | **same** |
| `0363_payroll_posting_state_read` | `58a3ac5a8cb082fc946b54d37737f2bba605f57f6f357a469274124c6c5132e0` | **same** |
| `0364_plan_reservation_namespace_obo_fold` | `b416ea4521b4275ee00bd125df32d05bb3c1d2b82dcaa3ba5cf9438bc9f557e7` | **same** |
| `0365_accrual_register_pagination` | `4983f44a3e27e6997fd1a82c5cb181eadd148ec0c17b3cf362937c8ab86bb8a4` | **same** |

### 2.4 No hard error anywhere

`ERROR:` and `FATAL:` appear **zero** times in the 1424-line log. `migrate` exited 0, and a second
run reports `0 new migration(s) applied · 341 total`, so no file's on-disk text drifted from the
checksum the ledger recorded. The only note that run prints is the expected one:

```
note: 1 isolation-pinned migration(s) already applied and skipped
      (0057_wave_e_registry_snapshots · repeatable read)
```

---

## 3 · The census — the from-scratch chain against `clara_intK`

`clara_intK` on `127.0.0.1:55742` is the database `waveK-merge.md` names as the merger's own chain
and the one every count in that report is taken on: created `-T clara_intS6` and migrated to 341 /
`0365` by four `migrate` runs, one per lane. Its identity was confirmed first from its own ledger —
**341 files, head `0365_accrual_register_pagination`**, `0295` at `5196d64d…` — and it was read from
and never written to by this gate.

Seven censuses, each dumped from both databases into a file, ordered by the rendered text on the
server, and diffed line by line:

| census | what it reads | rows | `clara_closeint` vs `clara_intK` |
|---|---|---|---|
| **functions** | `p.oid::regprocedure` + `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` for every `clara` body | **1542** | **IDENTICAL, 0 diff lines** |
| **columns** | relation, attname, `format_type`, `attnotnull`, default expression, for `r p v m f` | **4070** | **IDENTICAL** |
| **constraints** | `conrelid::regclass`, `conname`, `pg_get_constraintdef`, `convalidated` | **3122** | **IDENTICAL** |
| **indexes** | `pg_indexes.indexdef` | **957** | **IDENTICAL** |
| **policies** | `pg_policies`: relation, name, permissive, roles, cmd, `qual`, `with_check` | **663** | **IDENTICAL** |
| **grants + posture** | per relation: owner, `relrowsecurity`, `relforcerowsecurity`, `relacl`; per function: owner, `prosecdef`, `provolatile`, `proconfig`, `proacl` | **1886** | **IDENTICAL** |
| **the ledger** | `version` + `checksum`, every row | **341** | **IDENTICAL** |

**Diff 0 on all seven. There is no finding here.**

### 3.1 What the wave moved, measured against the 337-file baseline

`clara_intS6` (55742, 337 files / `0361`) was censused read-only with the same seven queries, so the
wave's structural delta is a measurement rather than an inference:

| census | 337 baseline | 341 closing head | delta |
|---|---|---|---|
| functions | 1540 | **1542** | **+2** |
| columns | 4070 | 4070 | **0** |
| constraints | 3122 | 3122 | **0** |
| indexes | 957 | 957 | **0** |
| policies | 663 | 663 | **0** |
| grants + posture | 1884 | 1886 | **+2** (the two new function rows; the 344 relation rows are unchanged) |
| ledger | 337 | 341 | **+4** |

**This wave installs no table, no column, no constraint, no index and no policy.** It is four
migrations of pure body work, and the catalog says so on four axes at once.

The **+2** reconciles exactly: three signatures appear that the baseline does not have, and one
disappears.

| | signature |
|---|---|
| **added** | `clara.get_payroll_posting_state(uuid)` |
| **added** | `clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)` |
| **added** | `clara.wake_get_firm_standing_instruction(text)` |
| **removed** | `clara.list_accrual_adjustments(uuid,date,date,text)` |

`0365`'s own tail claim — that the four-argument pre-page shape is **gone** rather than left as a
resolvable overload — is therefore true on the catalog of a chain that carries every other lane's
file, and is read here off `pg_proc` rather than off the migration's own notice.

### 3.2 The ten bodies the wave writes, each equal to the merger's post-image

The set of `clara` bodies whose `sha256(prosrc)` differs between the 337 baseline and this chain is
**exactly ten**, and every one equals the post-image `waveK-merge.md` §5.1 recorded:

| body | post-image (first 16) | equals §5.1 |
|---|---|---|
| `wake_get_firm_standing_instruction(text)` | `f69794dae2da194d` | **yes** |
| `withdraw_firm_standing_instruction(text,text,text)` | `1d057b74827f665b` | **yes** |
| `get_payroll_posting_state(uuid)` | `c846456ffd80e51e` | **yes** |
| `create_accrual_adjustment(…11 args…)` | `a6319d252d8db1cc` | **yes** |
| `correct_accrual_adjustment(uuid,jsonb,text)` | `5f26b7061cc19f58` | **yes** |
| `_confirm_tenancy_rent_plan_core(…9 args…)` | `a4650cd2f28d8665` | **yes** |
| `_confirm_tenancy_rent_plan_revision_core(…7 args…)` | `17447d683ed1af15` | **yes** |
| `_obo_plan_core(…14 args…)` | `1e36654777973175` | **yes** |
| `_tenancy_plan_core(…13 args…)` | `67fd7548a7ded4d4` | **yes** |
| `list_accrual_adjustments(uuid,date,date,text,jsonb,integer)` | `504ec1fe6e50803f` | **yes** |

No eleventh body moved. That is the independent confirmation of the merge's central claim, that the
four files touch exactly the bodies §0 said they touch and nothing else.

One reading worth stating because it is easy to misread the merge's §0 table: of `0362`'s two doors,
`clara.wake_get_firm_standing_instruction` is a **creation** (absent at 337) and
`clara.withdraw_firm_standing_instruction` is a **replacement** — it exists at 337 with
`c63c1fd09bc92713…` and leaves this chain at `1d057b74827f665b…`. The migration's `read door FIRST,
withdraw door FIRST` notice is about which branch the file took, not about whether the body was new.

### 3.3 The census again, after the batteries

All seven censuses were re-taken on `clara_closeint` after §4's batteries and §2.4's drift run, and
diffed against the pre-battery dumps: **1542 / 4070 / 3122 / 957 / 663 / 1886 / 341, diff 0 on every
one**. `clara%` roles still **20**, and the cluster held no leftover probe role of any kind (the only
non-`clara`, non-`pg_` role on the server was `postgres`). The batteries planted and dropped rows;
they left nothing structural behind.

---

## 4 · The batteries, under the full 156-gate chain

### 4.1 What "every lane's batteries" resolves to

`git diff --name-only ffb629d73...HEAD -- packages/db/tests` names **22** files; **12** of them are
`.test.mjs` batteries (4 new `-preintegration-gate.mjs` files, 3 fixture or helper modules,
`rig-helpers.mjs`, `rig-meta.mjs` and a README account for the rest). Those 12 are the set run here,
on the from-scratch database, with every one of `packages/db/package.json`'s **156**
`--import ./tests/*-preintegration-gate.mjs` tokens in front:

```
cd packages/db
PGHOST=127.0.0.1 PGPORT=55711 PGUSER=postgres PGDATABASE=clara_closeint \
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 \
  node --test --test-concurrency=1 <156 × --import ./tests/*-preintegration-gate.mjs> <12 files>
```

**22:06:52Z → 22:07:44Z, 52 s, exit 0.**

```
# tests 125
# pass 125
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 52153.7124
```

**125 cells, 125 green, nothing skipped and nothing cancelled.** Not one `# SKIP` marker and not one
`not ok` line appears in the log.

The 12, by owning lane (`tests/` prefix and `.test.mjs` suffix elided), each lane's set taken from
`git diff --name-only ffb629d73...riders/wK-laneNN` rather than from its report:

| lane | files |
|---|---|
| **L1** (3) | `payroll-posting-state-read`, `prepayment-close-standing-instruction`, `standing-instruction-agent-read` |
| **L2** (7) | `accrual-correction`, `accrual-plan-authority-wall`, `authority-ref-human-instruction`, `errcode-catalog`, `plan-overlap-template-arm-retired`, `plan-reservation-namespace`, `tenancy-agent-twins` |
| **L3** (2) | `accrual-adjustments`, `accrual-register-pagination` |
| **LC** (0) | LC's `packages/db/tests` diff is empty; the version cut owns no db battery |

### 4.2 The per-lane reconciliation, measured

The same 12 files were run a second time in three lane groups, so each lane's number can be compared
with the figure that lane and the merger reported instead of divided out of a total:

| group | files | this gate | `waveK-merge.md` | reconciles |
|---|---|---|---|---|
| **L1** | 3 | **35 / 35 / 0 / 0** | 35 (§1) | **exactly** |
| **L2** | 7 | **64 / 64 / 0 / 0** | 64 (§2) | **exactly** |
| **L3** | 2 | **26 / 26 / 0 / 0** | — | see below |
| L3's neighbour `accrual-list-side-filter` | 1 | **3 / 3 / 0 / 0** | — | |
| `operation-census` + `rig-isolation` | 2 | **33 / 32 / 0 / 1** | 33 / 32 / 0 / 1 (§1, §2, §3) | **exactly** |

L3's merger figure is **62 / 61 / 0 / 1** over "three touched db files plus `operation-census` and
`rig-isolation`". Its third file, `accrual-list-side-filter.test.mjs`, is **not in L3's diff** — it
is a neighbour the lane ran, not a file it changed — so this gate's own set is two files. Run
separately, that neighbour reads 3, and **26 + 3 + 33 = 62**, the merger's number to the cell. The
three lane groups also sum to the headline: **35 + 64 + 26 = 125**.

### 4.3 The gate chain's own registration, cross-checked

| check | result |
|---|---|
| `--import … -preintegration-gate.mjs` tokens in `packages/db/package.json` | **156**, none listed twice |
| `tests/**/*-preintegration-gate.mjs` files on disk | **156** |
| on disk but not in the chain | **none** |
| in the chain but not on disk | **none** |
| the same token count on the base `ffb629d73` | **152** |
| gate files the wave adds | **4** (`git diff --name-status` reads 4 `A`, 0 `M`) |

152 + 4 = 156, and the two sets are equal as sets, not merely equal in size. The four the wave adds
are `accrual-register-pagination`, `payroll-posting-state-read`, `plan-reservation-namespace` and
`standing-instruction-agent-read`. **Every gate this wave wrote is registered, and no token points at
a file that does not exist.**

### 4.4 `operation-census` and `rig-isolation`

Same database, same 156-gate chain, run separately as the brief asks:

```
# tests 33
# pass 32
# fail 0
# cancelled 0
# skipped 1
```

**22:08:18Z → 22:09:09Z, 51 s, exit 0.** Identical to the merger's reading at every lane head. The
one skip is named in §5 N2 and is not a gate declining.

---

## 5 · Findings

**No blocker, no major, no minor. Two notes, both a measurement rather than a defect.**

### N1 · NOTE — the fixtures' documented privilege fallback fires on three battery files

The battery log carries three `[rig-runtime lane notes — <file>]` blocks, on
`accrual-adjustments`, `accrual-plan-authority-wall` and `authority-ref-human-instruction`, whose
entries read `seed extraction: clara_runtime lane lacked privilege (permission denied for table
document_extractions) — fixture fell back to root`.

This is by design and pre-existing. `packages/db/tests/rig-runtime-helpers.mjs:174-176` documents it
in the source: *"Run a fixture statement under a lane; 42501 falls back to root + a LANE_NOTE. NEVER
use for an assertion (assertions call role/root queries directly)."*
`git diff --stat ffb629d73...HEAD -- packages/db/tests/rig-runtime-helpers.mjs` is **empty**, so this
wave neither wrote the affordance nor changed it. The note means a **fixture** could not be planted
through the runtime lane and was planted as root instead; no assertion was relaxed, and every cell
that fired one still passed. The sweep's gate A recorded the same affordance on nine of its 49 files;
three of twelve here is the same phenomenon at this wave's smaller surface.

### N2 · NOTE — the one skipped cell is the brief's own prohibition, not a gate declining

```
ok 33 - T19 poison-role: reset + re-migrate normalizes a poisoned clara role
        # SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an isolated DB to run
```

The cell lives in `packages/db/tests/rig-isolation.test.mjs`. `CLARA_RIG_ALLOW_RESET` is one of the
two variables the brief forbids this gate to set, so the cell skipping is the correct outcome, not a
gap this gate could have closed. It is the same single skip the merger records at every lane head, so
nothing changed here.

### Not a finding — the merger's §5.3 red, and why it does not reappear

`waveK-merge.md` §5.3's one red is `role-census-reset.test.mjs:168` failing with `database
"clara_intk2" does not exist`, because line 182 interpolates `PGDATABASE` unquoted into a `grant
connect on database …`. This gate's database is `clara_closeint`, all lower case, so the fold is a
no-op. **But this gate did not run that cell**: `role-census-reset.test.mjs` is not one of the wave's
batteries (`git diff --stat ffb629d73...HEAD` on it is empty) and the whole `packages/db` suite is the
merger's gate, run twice there. The merger's own lower-case control (`clara_intk_lower`, 9 / 9 green)
is the evidence that the cell passes on a lower-case name; this report adds no new evidence either
way, and the two actions it proposed — the release naming its database in lower case, and a
one-character fix in a later ticket — still stand.

---

## 6 · The cluster, dropped

```
sudo -n pg_dropcluster 17 rigclose --stop
```

exit 0. `pg_lsclusters` afterwards shows **no `rigclose` and nothing on 55711**. What remains online
is what was online before this gate started, plus Gate C's own cluster: `main` (down), `rigclosec`
55712 (**Gate C's**, created after this gate started and never connected to), `rigint` 55720,
`rigl06ac3` 55710, `rigreh` 55730, `rigrt` 55721, `rigw4` 55700, `rigw4c` 55702 (**Gate B's**),
`rigw4h` 55701 (**Gate B's**), and `rl01`–`rl10` 55741–55750.

On `rl02` (55742), which this gate read for the census, nothing was written: `clara_intK` still reads
**341 files at `0365`**, `clara_intS6` still reads **337 files at `0361`**, and the cluster still
holds **20** `clara%` roles. The fifteen databases on that cluster are exactly the fifteen the merger
left (`clara_c01`–`clara_c04`, `clara_intK`, `clara_intK2`, `clara_intS`–`clara_intS6`,
`clara_intk_lower`, `clara_l02`, `clara_rt_testK`).

The gate's own artefacts live in the session scratchpad and nowhere in the repository:
`…/scratchpad/gateA-K/migrate-fromscratch.log`, `seed.log`, `migrate-drift.log`, `batteries.log`,
`census-tests.log`, `lane-L1.log`, `lane-L2.log`, `lane-L3.log`, `lane-L3-neighbour.log`,
`gates.txt`, `batteries.txt` and `census/` (the seven SQL queries plus their twenty-one dumps).

---

## 7 · Anything unverified

1. **The census measures structure, not content.** Seed rows, catalogue rows and every other data row
   are outside all seven censuses except the ledger. A wave that changed what `0295`'s chart rows say
   without changing a column would not be caught here. This wave installs no DML on a shipped table
   that would show there, but the statement is a limit of the method, not a clearance.
2. **This gate ran none of Gate B's or Gate C's work.** No upgrade path from 337, no `en_US.UTF-8`
   collation twin, no browser suite, no static gates (`typecheck`, `lint`, `check-frozen-workflows`,
   `check-wiki-dynamic-sql`, the pins corpus), no web unit suite, no `packages/runtime` suite, **no
   two-build cutover drill and no rollback preflight**. This wave is a version cut and the brief
   itself says the cutover drill is *the* gate of the wave; nothing in this report speaks to it, to
   `chatTurn_v23`, to `claraWork_v7` or to the frozen manifest.
3. **The whole `packages/db` suite was not run here**, only the twelve batteries the wave touches plus
   `operation-census` and `rig-isolation`, which is what the brief asks for. The merger ran the whole
   suite twice (6071 / 5960 / 1 / 110, the one red being §5's name question). A pre-existing red in a
   file no lane touched would not be visible to this gate.
4. **`clara_intK` is trusted to be the database the merger measured.** Its identity was confirmed from
   its ledger (341 / `0365` / `0295` at `5196d64d…`) and its name against `waveK-merge.md`, not from a
   provenance record inside the database. If a later agent replayed the chain onto that name between
   the merge and this gate, this census would compare against the replay instead — the report is dated
   and the head is named so that can be checked.
5. **Two data-dependent arms can only run empty on a from-scratch chain**, as they did for the sweep's
   gate A. Nothing in this wave's four files has a populated arm of that kind that this gate could
   detect as unexercised, but the general limit holds: Gate B's populated upgrade path is where a
   backfill or prune arm over real rows is measured.
6. **The `#867` reused-cluster recipe is untested by this gate**, deliberately: a virgin cluster never
   needs it, and `CLARA_RIG_ALLOW_ROLE_SWEEP` was never set.
7. **The lanes' own open items are carried, not closed.** This gate verified the CHAIN and the
   CATALOG, not the lanes' claims. `waveK-merge.md` §6's six successor contracts and §7's unverified
   list — #1147's owner ruling, L2's two open reservation pairs, LC's `STD-2`, L3's `STD-1`, the WSL
   re-run that this host's WSL cannot do for want of Node — are untouched by anything here.
