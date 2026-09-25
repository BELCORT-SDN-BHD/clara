# Riders closing wave K — gate B: the upgrade path, the collation twin, the browser suite twice, the static gates

**Code** `C:\Users\zhant\Desktop\clara-wt\710`, branch `integration/riders-closing`, head
**`18eb2dc4d1ceb62c8d335bb6f30526d4786d244f`** — every command below ran at that commit. `git
status --porcelain` in that worktree read **empty** before this gate and **empty** after it, and
`git rev-parse HEAD` is unchanged. I committed nothing, edited no tracked file, pushed nothing,
opened no pull request, wrote nothing to GitHub, touched no lane worktree and no file in the main
checkout but this report, spawned no subagent, killed no process I did not start, and never set
`CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP`. Gate A's cluster (`rigclose` 55711) and
Gate C's (`rigclosec` 55712) were never connected to; the servers this gate opened a connection to
are its own `rigw4h` (55701) and `rigw4c` (55702), plus one read-only census of `clara_intK` and one
of `clara_intS6` on `rl02` (55742).

**Base** `ffb629d73`, which is `origin/main`'s code. In this worktree `origin/main` resolves to
`40c5ca671`; `git diff --name-only ffb629d73 40c5ca671` is twelve files, all under
`docs/plan/active/factory-reset-2026-09-26/`, and `frozen-workflows.json` is **byte-identical** at
both (`git show` on each, `cmp` clean), so the freeze stage's append-only comparison against
`origin/main` is a comparison against the same manifest bytes `ffb629d73` carries. **97** files
separate the head from `ffb629d73`, the merger's own figure.

**Host** Windows 11 + WSL PostgreSQL 17 (Ubuntu) · Node v22.23.2 · pnpm 10.33.0
**Playwright triple** `https://127.0.0.1:3640` / `3641` / `3642`, through
`pnpm --filter @clara/web e2e` — never a bare `npx playwright test` (#865).

**Step 6 of the brief (the rollback preflight) is NOT in this report.** The orchestrator's task
message removed it from Gate B and left it with Gate C, which owns it. Everything else the brief
asks for is below.

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **the upgrade path**, `clara_w4_hosted` 55701, 337 → 341 | `pnpm --filter @clara/db migrate` | **4 new applied · 341 total**, exit 0, **1 s** (22:02:18Z → 22:02:19Z) |
| 1a | the ledger head | `clara.schema_migrations` | **341 rows**, head `0365_accrual_register_pagination` |
| 1b | the wave's four files | log read file by file | **4 / 4 applied**, **zero prestate refusals**, every tail green (§1.2) |
| 1c | hard errors | `ERROR:` / `FATAL:` in the 20-line log | **none** |
| 1d | drift | a second `migrate` on the same database | **0 new applied · 341 total**, exit 0 |
| 1e | the cluster role census | `pg_roles like 'clara%'` | **20 before, 20 after** — `0154`'s own count, untouched |
| 2 | **the census, seven of them, vs `clara_intK` (55742)** | `sha256(prosrc)` + six catalog censuses | **every one diff 0** (§2) |
| 2a | function bodies | `oid::regprocedure` + `sha256(prosrc)` + prokind/volatility/secdef | **1542 rows, IDENTICAL** |
| 2b | columns | relation, name, type, NOT NULL, default | **4070 rows, IDENTICAL** |
| 2c | constraints | relation, name, `pg_get_constraintdef`, `convalidated` | **3122 rows, IDENTICAL** |
| 2d | indexes | `pg_indexes.indexdef` | **957 rows, IDENTICAL** |
| 2e | policies | relation, name, cmd, `qual`, `with_check`, roles, permissive | **663 rows, IDENTICAL** |
| 2f | grants | every function and relation ACL, exploded per grantee and privilege | **4616 rows, IDENTICAL** |
| 2g | the ledger | `version` + `checksum`, all 341 rows | **IDENTICAL**, and the four new rows match the merger's §5.1 table to the character |
| 2h | the recut-body set itself | the 337-file `clara_intS6` vs the 341-file chain | **3 new signatures, 1 dropped, 7 recut in place** — the wave's ten bodies, each at the merger's own digest (§2.2) |
| 3 | **the collation twin**, `clara_w4_coll` 55702, `en_US.UTF-8`, 337 → 341 | `pnpm --filter @clara/db migrate` | **4 new applied · 341 total**, exit 0, **2 s** (22:02:35Z → 22:02:37Z) |
| 3a | the narration, hosted vs twin | diff of every prestate / tail / applied line | **exactly 1 line differs** — the `migrate:` summary, which names the target database (§3.1) |
| 3b | the same seven censuses vs `clara_intK` | as row 2 | **every one diff 0** |
| 3c | #1047's own live proof, on a real `en_US.UTF-8` server | `collation-pin-portability` + `collation-pin-scan` under the full 156-gate chain | **21 tests · 21 pass · 0 fail · 0 skipped**, exit 0 |
| 3d | drift on the twin | a second `migrate` | **0 new applied · 341 total**, exit 0 |
| 4 | **browser suite, run 1, with the build** | `pnpm --filter @clara/web e2e` | **598 cells · 591 passed · 0 failed · 7 skipped**, exit 0, 22:04:40Z → 22:21:41Z, suite **16.8 m** |
| 5 | **browser suite, run 2, `--no-build`, same artifact** | `pnpm --filter @clara/web e2e -- --no-build` | **598 cells · 590 passed · 1 failed · 7 skipped**, **exit 1**, 22:21:57Z → 22:38:19Z, suite **16.3 m** |
| 5a | the two runs against each other | cell-by-cell diff of both logs | **exactly ONE cell differs**: `responsive-shell-walk.spec.ts:708` (#736), green in run 1, red in run 2. Same 7 skips, same order, every other cell identical |
| 5b | that cell, two more isolated observations on the same artifact | `e2e -- --no-build responsive-shell-walk`, twice | **25 / 25 both times**, the cell green at 888 ms and 969 ms. **Three green, one red → a FLAKE, named** (finding M1) |
| 5c | #1141's B4 focus-landing cell | `work-question-walk.spec.ts:285` | **green in BOTH runs** (5.3 s, 5.7 s) |
| 6 | **the wave's own touched e2e spec, once** | `git diff --name-only ffb629d73...HEAD -- apps/web/e2e` returns **one** file, `accrual-mock.mjs` → `accrual-walk.spec.ts` | **21 cells · 21 pass · 0 fail**, 32.8 s (§5) |
| 7 | `pnpm typecheck` | from the worktree root | **exit 0**, `apps/web` and `packages/runtime` both Done, 57 s |
| 8 | `CI=true GITHUB_ACTIONS=true pnpm lint` | from the worktree root | **exit 0**, all four workspaces, 2 m 08 s |
| 8a | the frozen stage's base | `FREEZE_BASE_REF` unset → default | **`origin/main` = `40c5ca671`**, whose manifest is byte-identical to `ffb629d73`'s (§6.1) |
| 9 | `node scripts/check-frozen-workflows.mjs` | standalone | **OK — 362 frozen / 62 `"use workflow"` / 3 retired** |
| 9a | **the 350 locked entries, entry by entry** | base manifest vs head manifest | **0 sha moved · 0 `deployed` flag moved · 0 removed**; the 347 that were `deployed: true` still are (§6.2) |
| 9b | **the 15 new entries** | same comparison | **15, and not one carries a `deployed` key at all** — unlocked, which is what a cut's merge should leave for step 11a (§6.2) |
| 9c | `node scripts/check-frozen-workflows.selftest.mjs` | standalone | **OK, all cases** |
| 10 | `node scripts/check-wiki-dynamic-sql.mjs` | standalone | **OK**, 1611 function definitions and 256 patches scanned, **the same 20 justified waivers** |
| 11 | the web pins corpus | `apps/web/tests/firm-scope-db-pins.test.ts` | **22 tests · 22 pass · 0 fail** (3 suites) |
| 11a | rule (d), measured | the corpus file vs the wave's four migrations | **0** mentions of `0362`/`0363`/`0364`/`0365` in `firm-scope-db-pins.corpus.ts`, and `apps/web/tests/` is untouched by the wave — **no barrier entry owed** |
| 12 | the WHOLE `apps/web` unit suite, once | `node scripts/run-tests.mjs` | **5277 tests · 142 suites · 5275 pass · 0 fail · 2 skipped**, exit 0, 79 s |

**One sentence.** A 337-file database populated the way hosted is takes all four of the wave's
migrations in one second with every prestate branch entered on its FIRST-APPLY arm and no refusal,
the database it becomes is byte-for-byte the database the merger integrated across 1542 function
bodies, 4070 columns, 3122 constraints, 957 indexes, 663 policies, 4616 grant rows and all 341
ledger rows, the same is true on an `en_US.UTF-8` twin whose migration narration differs from the
hosted twin's by exactly one line (the database's own name), the frozen manifest's 350 locked
entries are unmoved while the cut's 15 new entries sit unlocked, and the browser suite run twice on
one artifact differs in exactly one cell — a rail-exit cell this estate has already documented as a
load-sensitive flake, green three times out of four here.

**Verdict: PASS. One minor, seven notes. Nothing blocking.**

### How this reconciles with the other two gates

This gate's census reference is **`clara_intK`**, the merger's own integration database, as the
orchestrator's task message directs. Gate A is proving the **from-scratch** chain on `rigclose`
55711 and Gate C the runtime suite and the two-build cutover drill on `rigclosec` 55712; neither had
published a database name when this gate closed. So the claim this report establishes is
**upgrade ≡ integration ≡ collation twin**, on seven censuses. Convergence with the from-scratch
chain is Gate A's to close, and this report does not claim it. What this report does hand Gate A is
a second independent reading of the same four ledger checksums the merger predicted (§2.3).

---

## 1 · The upgrade path, `clara_w4_hosted` on `rigw4h` 55701

### 1.1 The starting state, read rather than assumed

| reading | value |
|---|---|
| ledger | **337 files**, head `0361_reservation_release_advice` |
| `0295` checksum | `5196d64d…` (the post-fix one the cut phase settled) |
| encoding / collation / ctype | `UTF8` / `C.UTF-8` / `C.UTF-8` |
| `clara%` roles on the cluster | **20** |
| population, the relations the wave's four files turn on | `onboarding_plans` 63 · `onboarding_plan_items` 74 · `op_receipts` 667 · `accounting_work` 10 · `documents` 22 · `accounting_plans` 4 · `accrual_adjustments` 2 · `firm_standing_instructions` **0** · `payroll_summary` documents **0** · `contract_plan_confirmations` **0** |

This is the state the sweep wave's gate B left (`waveS-gates-B.md` note N4): wave 4's release-time
rows plus the cut phase's plant, carried to 337 files. It is materially unlike a seeded from-scratch
rig, and materially unlike `clara_intK`, which carries 132 482 `op_receipts` and 105 standing
instructions after the merger ran the whole `packages/db` suite on it.

### 1.2 The run, and the branch each prestate entered

```
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted \
  CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate    # from clara-wt/710
```

**22:02:18Z → 22:02:19Z, 1 s, exit 0 — `4 new migration(s) applied · 341 total`.** The order is
`0362 0363 0364 0365`, the file order the release will use. Four `applied …` lines, eight prestate
and tail notices, **zero** `ERROR:` or `FATAL:` in 20 log lines.

The brief's own question — *which branch did each bimodal or by-name prestate enter* — answered from
the lines the files printed, not from the chain order. **Every one took its FIRST-APPLY arm; not one
took a REDO arm, and not one refused.**

| file | the prestate line, verbatim | the branch |
|---|---|---|
| `0362` | `0362 prestate OK -- read door FIRST, withdraw door FIRST` | **both arms FIRST**. The read door's name was free; the withdraw door matched `0338 SG`'s pinned pre-image `c63c1fd0…` rather than a body already carrying `#1147 [0362]`, so the by-name redo arm was not taken |
| `0363` | `0363 prestate: OK -- the read door is FIRST APPLY; the verdict is at its measured pre-image and ungranted` | **FIRST APPLY**, not the redo path. `clara._payroll_posting_verdict(uuid)` was at its pinned sha and carried no ACL beyond its owner's — this file is the first granted way to reach its answer, and the prestate confirms nothing had granted it already |
| `0364` | `0364 prestate OK -- 6 FIRST, 0 REDO -- create_accrual_adjustment(…)=FIRST correct_accrual_adjustment(…)=FIRST _confirm_tenancy_rent_plan_core(…)=FIRST _confirm_tenancy_rent_plan_revision_core(…)=FIRST _obo_plan_core(…)=FIRST _tenancy_plan_core(…)=FIRST` | **all six bodies on their pinned pre-image arm**, none on the `#1150 [0364]` marker arm |
| `0365` | `#1152 prestate: clean -- exactly one starting shape of clara.list_accrual_adjustments is live (four-argument, pre-page (#1075/0334))` | **the four-argument `#1075`/`0334` arm**, not this file's own six-argument redo shape |

All four tails printed green, including `0365`'s long one, which re-measures owner,
`SECURITY DEFINER`, `STABLE`, the pinned `search_path`, the PUBLIC revoke and the single
`clara_authenticated` grant on the widened door, and asserts the four-argument signature is gone
rather than left as a resolvable overload.

### 1.3 Idempotence and the drift gate

A second `migrate` on the same database: **`0 new migration(s) applied · 341 total`**, exit 0. The
`clara%` role count on the cluster is **20** before and after, `0154`'s own pin. **No closing-wave
migration minted a role on the upgrade path**, which is the merger's §5.2 reading reproduced on a
populated database.

### 1.4 What the run moved in the data, measured

`0362` is the only file in the wave with a migration-time write outside a function body: one row
into `clara.wake_fn_allowlist`. It landed, and nothing else moved:

| relation | before | after |
|---|---|---|
| `wake_fn_allowlist` | 114 | **115** — the new row is `interactive -> wake_get_firm_standing_instruction`, identical on both twins and on `clara_intK` |
| `onboarding_plans` / `onboarding_plan_items` / `op_receipts` / `accounting_work` / `documents` | 63 / 74 / 667 / 10 / 22 | **unchanged** |

`0364` backfills nothing, by its own header's decision (*"the lanes that move leave their pre-move
receipts exactly where they are, because a receipt records an act that happened"*). Note N3 measures
what that leaves behind on this populated twin.

---

## 2 · The census — both upgraded twins against the merger's `clara_intK`

### 2.1 The seven censuses

Each census is one `psql -tAF'|'` query, sorted `LC_ALL=C`, run with the **same SQL text** against
all three databases, then `diff`ed. Row counts and diffs:

| census | rows | `clara_intK` vs hosted | `clara_intK` vs collation twin | hosted vs collation twin |
|---|---|---|---|---|
| function bodies — `oid::regprocedure`, `sha256(convert_to(prosrc,'UTF8'))`, `prokind`, `provolatile`, `prosecdef`, identity args | **1542** | **0** | **0** | **0** |
| columns — relation, attname, `format_type`, `attnotnull`, default expression | **4070** | **0** | **0** | **0** |
| constraints — relation, conname, `pg_get_constraintdef`, `convalidated` | **3122** | **0** | **0** | **0** |
| indexes — `pg_indexes.indexdef` | **957** | **0** | **0** | **0** |
| policies — relation, name, cmd, `qual`, `with_check`, roles, permissive | **663** | **0** | **0** | **0** |
| grants — function and relation ACLs, `aclexplode`d per grantee and privilege | **4616** | **0** | **0** | **0** |
| the ledger — `version`, `checksum`, all rows | **341** | **0** | **0** | **0** |

The body census was **re-run on the hosted twin after both browser suites and every static gate had
finished** and is still diff 0 against `clara_intK`, so nothing this gate did after §1 moved the
database it measured.

### 2.2 The recut-body set, measured against the pristine 337-file template

`clara_intS6` on 55742 is the sweep merger's ordered 337-file chain and was opened **read-only** for
one census. Against it, the 341-file chain shows the wave's ten bodies and nothing else.

**Three new signatures**

| body | post-image (first 16) | the merger's §5.1 figure |
|---|---|---|
| `clara.wake_get_firm_standing_instruction(text)` | `f69794dae2da194d` | **same** |
| `clara.get_payroll_posting_state(uuid)` | `c846456ffd80e51e` | **same** |
| `clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)` | `504ec1fe6e50803f` | **same** |

**One dropped signature** — `clara.list_accrual_adjustments(uuid,date,date,text)`. The four-argument
door is **gone rather than left as a resolvable overload**, which is `0365`'s own tail claim,
confirmed here on a database that reached 341 by upgrade rather than by template copy.

**Seven recut in place**

| body | pre-image → post-image (first 16) | the merger's §5.1 figure |
|---|---|---|
| `clara.withdraw_firm_standing_instruction(text,text,text)` | `c63c1fd09bc92713` → `1d057b74827f665b` | **same** |
| `clara.create_accrual_adjustment(…11 args…)` | `09c682f52d6d9209` → `a6319d252d8db1cc` | **same** |
| `clara.correct_accrual_adjustment(uuid,jsonb,text)` | `6a59591a6211acdb` → `5f26b7061cc19f58` | **same** |
| `clara._confirm_tenancy_rent_plan_core(…9 args…)` | `e8a65796245bd331` → `a4650cd2f28d8665` | **same** |
| `clara._confirm_tenancy_rent_plan_revision_core(…7 args…)` | `5fe080568b2cf3ae` → `17447d683ed1af15` | **same** |
| `clara._obo_plan_core(…14 args…)` | `bbe338e80dfe0b19` → `1e36654777973175` | **same** |
| `clara._tenancy_plan_core(…13 args…)` | `9560414f256f80e6` → `67fd7548a7ded4d4` | **same** |

Ten bodies, every post-image identical on the hosted twin, the collation twin and `clara_intK`. The
pre-image column is this gate's own addition: it is what the upgrade path actually replaced, and for
`withdraw_firm_standing_instruction` it is exactly the `c63c1fd0…` sha `0362`'s prestate names.

### 2.3 The four ledger rows, for Gate A and for the release

Identical on all three databases, and identical to the merger's §5.1 table:

| file | checksum |
|---|---|
| `0362_standing_instruction_agent_read` | `dea2860efae88070261b722e89d0b28fda78f57ae721f048a9ca3f2aebe2aa6e` |
| `0363_payroll_posting_state_read` | `58a3ac5a8cb082fc946b54d37737f2bba605f57f6f357a469274124c6c5132e0` |
| `0364_plan_reservation_namespace_obo_fold` | `b416ea4521b4275ee00bd125df32d05bb3c1d2b82dcaa3ba5cf9438bc9f557e7` |
| `0365_accrual_register_pagination` | `4983f44a3e27e6997fd1a82c5cb181eadd148ec0c17b3cf362937c8ab86bb8a4` |

---

## 3 · The collation twin, `clara_w4_coll` on `rigw4c` 55702 (`en_US.UTF-8`)

```
PGHOST=127.0.0.1 PGPORT=55702 PGUSER=postgres PGDATABASE=clara_w4_coll \
  CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate
```

**22:02:35Z → 22:02:37Z, 2 s, exit 0 — `4 new migration(s) applied · 341 total`.** Same file order,
zero refusals, zero `ERROR:`/`FATAL:`, and a second `migrate` reports `0 new · 341 total`. The
database is `UTF8` / `en_US.UTF-8` / `en_US.UTF-8`, read from `pg_database` rather than assumed.

### 3.1 The two databases' narration, diffed line for line

Every `notice`, `applied` and `migrate:` line from both logs was extracted, backend pids stripped,
and diffed. **Exactly one line differs**, and it is not a collation effect:

```
< migrate: 4 new migration(s) applied · 341 total · target 127.0.0.1:55701/clara_w4_hosted
> migrate: 4 new migration(s) applied · 341 total · target 127.0.0.1:55702/clara_w4_coll
```

Every prestate branch, every tail sentence, `0364`'s whole six-body mode string and `0365`'s
`four-argument, pre-page (#1075/0334)` arm are **byte-identical** between a `C.UTF-8` server and an
`en_US.UTF-8` one. The sweep wave's twin diff carried a second differing line (a row-population
census inside `#1098`); this wave's four files print no population census, so this one is cleaner.
**No collation-dependent refusal, and no pin to name.**

### 3.2 #1047's own live battery, on a real glibc `en_US.UTF-8` server

The brief calls this upgrade #1047's proof; the battery itself is the sharper proof, so it was also
run, on the `en_US.UTF-8` database, under the **full 156-gate chain**:

```
PGHOST=127.0.0.1 PGPORT=55702 PGUSER=postgres PGDATABASE=clara_w4_coll \
  node --test --test-concurrency=1 <156 gates> \
  tests/collation-pin-portability.test.mjs tests/collation-pin-scan.test.mjs
```

**21 tests · 21 pass · 0 fail · 0 skipped**, exit 0, and reproduced a second time at 21 / 21. The
connection was probed rather than assumed — a `pg` client under the same environment answered
`clara_w4_coll @ 55702 collate en_US.UTF-8`. Its own vacuity control passes first (*"the comparator
is a REAL second collation: it reorders the pair 0295 was stopped by, and `C` does not"*), its
corpus-non-empty control passes (cell 19), and all three positive controls (cells 6, 20, 21) are
green, so the ten portability assertions between them are not vacuous.

### 3.3 The censuses

All seven censuses of §2 on this database are **diff 0** against `clara_intK`: 1542 / 4070 / 3122 /
957 / 663 / 4616 / 341.

---

## 4 · The browser suite, twice, on one artifact

### 4.0 The target database

```
psql -p 55701 -c "create database clara_closing_e2e template clara_w4_hosted"   # 341 files, head 0365
```

Lower case, as the brief requires, and for the reason the merger's §5.3 gives: an unquoted
`${PGDATABASE}` interpolation folds an identifier, and every mixed-case integration database in this
programme has paid for it. Both runs carried `PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres
PGDATABASE=clara_closing_e2e` beside the triple, so nothing a walk could reach would touch the
upgraded database itself — confirmed afterwards by re-censusing `clara_w4_hosted` (§2.1). **The
two-build cutover drill of the cut is NOT repeated and no frozen body was moved**: the brief forbids
both, and `check-frozen-workflows` reads the merged manifest's own 362 / 62 / 3 at the end with the
350 locked entries byte-unmoved (§6.2).

### 4.1 Run 1 — with the build

`pnpm --filter @clara/web e2e`, **22:04:40Z → 22:21:41Z**. The build ran first and succeeded on the
first attempt (no `0xc0000142` panic, #869) — `✓ Compiled successfully in 3.9s`, 35 static pages —
producing `BUILD_ID QwE8F75ASppkDeXR3h44v`. The suite then ran **598 cells across 54 spec files, one
worker**.

| | |
|---|---|
| cells | **598** |
| passed | **591** |
| failed | **0** |
| skipped | **7** |
| suite wall clock | **16.8 m** |
| exit | **0** |

### 4.2 Run 2 — the same artifact, `--no-build`

`pnpm --filter @clara/web e2e -- --no-build`, **22:21:57Z → 22:38:19Z**. The harness confirms the
reuse in its own words, which is what makes this a second measurement of one artifact rather than of
two builds:

```
[e2e] --no-build: reusing the existing .next build, NOT rebuilding @clara/web
[WebServer] [e2e] serving .next BUILD_ID QwE8F75ASppkDeXR3h44v, built 17.1 min ago
```

| | run 1 | run 2 |
|---|---|---|
| cells | 598 | **598** |
| passed | 591 | **590** |
| failed | **0** | **1** |
| skipped | 7 | **7** |
| suite wall clock | 16.8 m | **16.3 m** |
| exit | 0 | **1** |

### 4.3 The two runs against each other

The `ok` / `x` / skip lines of both logs were extracted with their cell numbers and titles, their
durations stripped, and diffed. **The two runs differ in exactly one line**, cell 463:

```
463c463
<   ok 463 [chromium] › e2e\responsive-shell-walk.spec.ts:708:1 › #736: crossing from wide into narrow closes the rail by itself, through its own exit
---
>   x  463 [chromium] › e2e\responsive-shell-walk.spec.ts:708:1 › #736: crossing from wide into narrow closes the rail by itself, through its own exit
```

Every other cell is the same verdict in the same order, and the seven skips are the same seven.
**Red in one run and green in the other is the brief's own definition of a flake, so it is named
rather than carried as a browser finding** — finding **M1** in §7 gives the mechanism, two further
green observations and the estate's prior record of the same cell. **No cell is red in both runs, so
this gate reports no browser finding against the wave's code.**

**#1141's B4, named by the brief.** `work-question-walk.spec.ts:285` — *"B4: the SAME question is
answered from Needs-you, and the row leaves without dumping focus"* — is the cell wave 4's gate B and
the cut phase's gate each caught red once, and which #1141 rewrote to poll `document.activeElement`
to a settled observation. It is **`ok 593` in run 1 (5.3 s) and `ok 593` in run 2 (5.7 s)**. **It did
not flake here**, under a host carrying two sibling gate workers.

### 4.4 The seven skips, identical in both runs, each its own fixture gate

| cells | spec | why |
|---|---|---|
| 276–279 | `interview-walk.spec.ts:211,243,260,316` | the isolated COMPLETE / CANCEL / RACE client-thread fixture is supplied by `live-stack/run-live-walk.mjs`, not by this config |
| 440–441 | `reports-download-walk.spec.ts:64,125` | `run-reports-download-walk.mjs` supplies the client/artifact fixture and the second, unfinished export |
| 499 | `signup-confirm-pending.spec.ts:261` | `test.skip(true, …)` — the wall is wired and the skeleton below it covers the arm |

None is an environment failure. These are the same seven the sweep wave's gate and the cut phase's
gate recorded, and the four `interview-walk` cells are the same four the merger's §5.4 saw skip in
isolation.

---

## 5 · The wave's own touched e2e specs, once each

`git diff --name-only ffb629d73...HEAD -- apps/web/e2e` returns **one** file: `accrual-mock.mjs`, 14
insertions and 5 deletions, by commit `3a26bc94a` (*"feat(web): #1152 the accrual register pages, and
the side filter reaches the door"*, lane L3). Its consumer was located rather than assumed: the only
spec that drives it is `accrual-walk.spec.ts`, through `serve-built.mjs:187`'s import; the two other
mocks that name it (`prepayments-mock.mjs`, `trade-invoice-mock.mjs`) mention it only in comments.
**One walk is owed.**

| walk | the commit that touched it | cells | result | wall |
|---|---|---|---|---|
| `accrual-walk.spec.ts` (via `accrual-mock.mjs`) | `3a26bc94a` — L3, **#1152** | 21 | **21 passed · 0 failed** | 32.8 s |

Twenty-one cells, run `--no-build` on the same artifact and the same triple, and the identical
twenty-one inside both whole-suite runs — the merger's §5.4 figure exactly. The merger also drove
seven further walks because the wave changes nine non-test `apps/web` source files; those seven ran
green twice inside this gate's two full-suite runs, so they are covered here without being singled
out.

---

## 6 · The static gates at the integrated head

| check | when | result |
|---|---|---|
| `pnpm typecheck` | 22:41:48Z → 22:42:45Z (57 s) | **exit 0** — `apps/web` Done, `packages/runtime` Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | 22:42:50Z → 22:44:58Z (2 m 08 s) | **exit 0**, all four workspaces |
| `node scripts/check-frozen-workflows.mjs` | 22:04:46Z | **OK — 362 frozen / 62 `"use workflow"` / 3 retired**, append-only vs `origin/main` |
| `node scripts/check-frozen-workflows.selftest.mjs` | 22:06:58Z | **OK, all cases** |
| `node scripts/check-wiki-dynamic-sql.mjs` | 22:06:55Z | **OK** — 1611 function definitions, 256 change-of-record patches, **20 justified waivers** |
| `apps/web/tests/firm-scope-db-pins.test.ts` | 22:07:45Z | **22 tests · 22 pass · 0 fail**, 3 suites |
| the WHOLE `apps/web` unit suite | 22:45:22Z → 22:46:41Z (79 s) | **5277 tests · 142 suites · 5275 pass · 0 fail · 2 skipped**, exit 0 |

### 6.1 The frozen stage's base, checked rather than assumed

The brief asks that the frozen-workflow stage be measured against `origin/main`, not against
`7bc5a710f`. Both freeze checks read `process.env.FREEZE_BASE_REF || "origin/main"`
(`scripts/check-frozen-workflows.mjs:153`). `FREEZE_BASE_REF` was **unset** in this gate's
environment. In this worktree `origin/main` resolves to **`40c5ca671`** — one docs commit ahead of
the lanes' base `ffb629d73` — and `git show` on both refs produces a **byte-identical**
`frozen-workflows.json`, so the append-only comparison is against exactly the manifest bytes every
lane diffed against. The check's own line says so: *"verified against frozen-workflows.json
(append-only vs origin/main)"*. Inside the lint run the same stage prints the same sentence, and
`evaluator-freeze-lint` adds *"12 evaluator(s) verified … (append-only vs origin/main)"*.

### 6.2 The 350 locked entries and the 15 new ones, entry by entry

This is the brief's own question about a version cut, and it is answered against the manifests rather
than against a report. `git show ffb629d73:frozen-workflows.json` and the head's own file were parsed
and every object carrying a `sha256` collected, from both `workflows` and `retired`:

| reading | value |
|---|---|
| entries carrying a `sha256`, base | **350** (347 workflow + 3 retired) |
| entries carrying a `sha256`, head | **365** |
| base entries whose `sha256` moved | **0** |
| base entries whose `deployed` flag moved | **0** |
| base entries removed | **0** |
| base entries at `deployed: true` | **347** — and **347** of them are still `deployed: true` on the head |
| NEW entries | **15**, and **not one has a `deployed` key at all** |

The fifteen: `chatTurn.v23.ts`, `.impl.ts`, `.prompt.ts`, `.reads.ts`, `.refusals.ts`, `.tenancy.ts`,
`.tools.ts`, `.usage.ts`; `claraWork.v7.ts`, `.bundle.ts`, `.errors.ts`, `.impl.ts`, `.prompt.ts`,
`.tools.ts`; and `packages/runtime/lib/fa-proposal-grounds.ts`. The last is the sweep wave's own
file, already on `main`, joining the frozen closure because `claraWork.v7.impl.ts` imports it — the
merger's §4.1 reading, reproduced here from the manifest rather than from that report.

**Unlocked is what a cut's merge should leave.** Step 11a's `--lock-deployed` is the release's act,
not the merge's, and this gate does not run it.

### 6.3 The two skipped unit cells

Both are in the live-provider sign-in battery and skip themselves for want of
`CLARA_LIVE_SUPABASE_AUTH_URL` / `CLARA_LIVE_SUPABASE_AUTH_ANON_KEY`, each naming the mocked coverage
that stands in for it (`components/entry/password-recovery.test.tsx`, `components/login-a11y.test.tsx`).
The same two the merger's §5.2 counts. **No Windows-only red from RIG.md's list appeared.**

---

## 7 · Findings

**No blocker. No major. One minor, seven notes.**

### minor M1 — `responsive-shell-walk.spec.ts:708` (#736) flaked once in four observations, and failed run 2's exit code

**What happened.** Cell 463, *"#736: crossing from wide into narrow closes the rail by itself,
through its own exit"*, was **green in run 1** (847 ms) and **red in run 2** (5.7 s):

```
Error: the rail was removed without ever entering its closing state
  expect(received).toBe(expected)  Expected: true  Received: false
  apps/web/e2e/responsive-shell-walk.spec.ts:738
```

**Two further observations on the same artifact, both green.** `pnpm --filter @clara/web e2e --
--no-build responsive-shell-walk`, twice: **25 / 25** at 22:39:32Z→22:40:11Z with the cell at 888 ms,
and **25 / 25** at 22:40:17Z→22:40:53Z with it at 969 ms. **Three green, one red.**

**The mechanism, read from the source rather than guessed.** The cell starts a `page.evaluate` that
installs a `MutationObserver` on `[data-clara-rail]` and resolves `true` on the first
`data-state="closed"` while the node is still connected, `false` on a 5 s timeout. The promise is
**not awaited** before `page.setViewportSize({width: 320})`. The comment above it says the observer
is *"armed BEFORE the resize because the whole window is 200ms long"* — but arming it costs a round
trip to the page, and under load the resize can land before the observer is attached, so the 200 ms
`closed` window passes unseen and the promise resolves `false` at its 5 s timeout. The 5.7 s cell
duration against 847 / 888 / 969 ms on the three green observations is that timeout, not a slow
assertion.

**It is not this wave's, and it is already on the record.** `git diff --name-only
ffb629d73...HEAD -- apps/web/e2e/responsive-shell-walk.spec.ts apps/web/components/clara/` is
**empty**; the spec was last touched on 2026-09-23 by `777c7417b` (#1017).
`wave3-integration-gates-B.md` §"RED 2" records **this exact cell and this exact failure text**, red
in its run 1, green in its run 2, then 25 / 25 twice in isolation, and classifies it *"(b) — known,
pre-existing, load-sensitive timing flake"*, adding that `wave3-lane09-fix.md`'s `SPEC-864-C` had
already seen it once more. That report also names the fix it deserves: *"watch for the exit state OR
the removal, not the exact intermediate frame."*

**Why minor and not a note.** Every observation of it, here and in wave 3, has been under
multi-worker host contention, and it is not a product defect — but it is the reason run 2 exited 1,
so a CI run of the full browser suite can go red on it without a line of this wave's code being
wrong. It is worth the small ticket wave 3 asked for and never got.
**Evidence:** `e2e-run1.log` cell 463; `e2e-run2.log` cell 463 and its failure block;
`resp-walk-a.log`, `resp-walk-b.log`; `apps/web/e2e/responsive-shell-walk.spec.ts:722-738`;
`reports/wave3-integration-gates-B.md` §"RED 2" and §"Anything unverified".

### note N1 — the two doors the wave mints had no population to read on either twin

`clara.wake_get_firm_standing_instruction` and `clara.get_payroll_posting_state` both applied and
both passed their tails, but on the hosted twin `firm_standing_instructions` holds **0** rows and
`documents where document_kind='payroll_summary'` holds **0**; the collation twin is emptier still.
So the upgrade path proves the doors' **posture** — existence, ownership, `SECURITY DEFINER`, the
`search_path` pin, the PUBLIC revoke, the single grant, every one re-measured by the files' own
tails — and proves nothing about what they answer. That behaviour is the lanes' batteries', Gate A's
run of them on a from-scratch database, and the merger's whole-`packages/db` run on `clara_intK`,
which carries 105 standing instructions.
**Evidence:** population table in §1.1; the same counts read again after the run.

### note N2 — `contract_plan_confirmations` is empty, so `0364`'s two recut tenancy cores were not driven on the upgrade path either

Both `_confirm_tenancy_rent_plan_core` and `_confirm_tenancy_rent_plan_revision_core` were replaced
at their pinned pre-images and hash to the merger's digests, but the twin holds **0**
`contract_plan_confirmations` rows, so no tenancy confirmation was ever replayed against the new
bodies here. Same division of labour as N1.
**Evidence:** `select count(*) from clara.contract_plan_confirmations` = 0 on both twins.

### note N3 — two pre-move `:plan` receipts survive on the hosted twin, and they are provably short-circuited

`0364` moves the accrual lane's nested reservation key from `<key>:plan` to `<key>:acplan` and
backfills nothing. The hosted twin holds exactly the case that makes that worth checking: two
`create_accrual_adjustment` receipts (`w4gate-w4gA_muf75m6n_22_a252e044`,
`w4gate-w4gB_muf75max_2e_39ee6d73`) whose nested `create_accounting_plan` receipts carry the OLD
`…:plan` keys. A replay of either key after this wave would derive `…:acplan` for the nested call and
find no receipt.

It cannot reach that point. The live body was read out of `pg_proc` on the upgraded database: line 54
reserves on the door's own key (`clara._reserve_op(v_firm, 'create_accrual_adjustment', p_op_key)`)
and line 69 `return v_dedupe` short-circuits, thirty-five lines **before** line 89 derives
`p_op_key || ':acplan'`. So the two stale nested receipts are unreachable rather than
inconsistent — which is the file header's own claim (*"the OUTER reservation on each lane's own door
short-circuits the whole body, so a genuine retry never reaches the nested call at all"*), here
measured against real pre-move rows rather than argued. Worth carrying to the release only as a
sentence: hosted will hold more of these, and the same argument covers them.
**Evidence:** `clara.op_receipts` on 55701, the four `…:plan` rows and the two outer rows;
`prosrc` of `clara.create_accrual_adjustment` on the upgraded database, lines 54 / 69 / 89;
`0364_plan_reservation_namespace_obo_fold.sql:29-38`.

### note N4 — the browser suite's database is isolation, not coverage

`pnpm --filter @clara/web e2e` is mock-backed (`e2e/serve-built.mjs` and its file-disjoint mock
lanes). `clara_closing_e2e` was created and pointed at as the brief asks, and six of the seven skips
are live-stack fixture gates. **No browser cell in this suite reads the upgraded schema**, so the 591
green cells are evidence about the web artifact, not about the migration chain. The chain's evidence
is §1 to §3 and Gate A's batteries.

### note N5 — the rig state this gate leaves behind

| server | database | now |
|---|---|---|
| `rigw4h` 55701 | `clara_w4_hosted` | **341 files, head `0365`** (was 337 / `0361`) |
| `rigw4c` 55702 | `clara_w4_coll` | **341 files, head `0365`** (was 337 / `0361`) |
| `rigw4h` 55701 | **`clara_closing_e2e`** | **created by this gate**, a template copy of the upgraded hosted twin at 341 files, left in place as the browser runs' target |

No cluster was created or dropped, no role was created or swept (**20** `clara%` on both clusters,
before and after), `clara_intK` and `clara_intS6` on 55742 were opened **read-only** for censuses and
never written to, and the sweep wave's `clara_sweep_e2e` was left untouched. RIG.md's "Closing wave"
section is the place to record the two twins' new head, and this gate did not edit it.

### note N6 — `clara_w4_hosted` is a stand-in, not hosted

Every number in §1 is a rig reading. The stand-in carries wave 4's release-time rows plus the cut
phase's plant; real hosted carries far more, and as N1 to N3 say, will carry row shapes this
rehearsal did not have. What the rehearsal establishes is the shape-level claim: the chain applies in
one second from 337 to 341 with every prestate on its FIRST arm, and the schema it lands on is
byte-identical to the one the merger integrated and to an `en_US.UTF-8` twin's.

### note N7 — the rollback preflight is not in this report

The brief's Gate B step 6 (`rollback-preflight.mjs` against the upgraded database with the previous
runtime image) was removed from this gate by the orchestrator's own task message and left with Gate
C, which owns it. It was not run here, and nothing in this report should be read as covering it.

---

## 8 · Anything unverified

1. **The upgrade path was not diffed against a from-scratch database.** The census reference is
   `clara_intK`, the merger's integration database, as the task message directs. Gate A's
   from-scratch database on `rigclose` 55711 had not been named when this gate closed, so
   **from-scratch ≡ upgrade** is Gate A's to establish. What this report hands it is the four ledger
   checksums (§2.3) and the ten body digests (§2.2) to compare against.
2. **The grant census is this gate's own row shape (4616), not the sweep gate's (5396) nor Gate A's.**
   Mine explodes function and relation ACLs per grantee and privilege and does not enumerate
   column-level ACLs or default privileges. It is diff 0 across three databases, but it is one
   question asked three times, not three questions.
3. **Both browser runs ran under host contention** from two sibling gate workers (A on 55711, C on
   55712), as every browser measurement in this plan folder has. M1's flake is the visible cost of
   that; how the suite behaves on a quiet host remains unmeasured here, as it has been in every wave.
4. **`accrual-mock.mjs` is covered only through its walk.** It changed this wave and has no cell of
   its own; §5's twenty-one cells, twice inside the full suite and once in isolation, are the whole of
   this gate's evidence for it.
5. **`pnpm build` for `apps/web` was not run as a bare gate.** `next build` succeeded inside
   `e2e/run.mjs` and produced the artifact both runs served (`BUILD_ID QwE8F75ASppkDeXR3h44v`), which
   answers the question in substance; a root `pnpm build` and `pnpm --filter @clara/runtime build`
   were not invoked.
6. **`0362`'s and `0364`'s REDO arms were never entered anywhere in this gate.** Both files carry a
   by-name redo path for #957; every prestate here took FIRST. A redo is what a re-applied migration
   would meet, and nothing in this gate exercises it — the lanes' own rigs did.
7. **The db batteries, the runtime suite, the two-build cutover drill and step 11a's
   `--lock-deployed` are not this gate's.** Gate A owns the first, Gate C the next two, the release
   the last. `waveK-merge.md` §7's seven open items are not closed by anything here, except that
   §7.2's "the manifest is append-only and the new entries are unlocked" is now measured entry by
   entry rather than asserted (§6.2), and §7.5's web build ran green as run 1's build step.
8. **The upgrade twins' populations are one to three orders of magnitude smaller than
   `clara_intK`'s.** Where a body's behaviour depends on volume — `0365`'s cursor clamp over two
   accrual rows, for instance — this gate proves the shape and not the scale.

---

**Return value**

```json
{
  "gate": "B",
  "verdict": "pass",
  "counts": {
    "upgrade_hosted": "4 applied / 341 total, exit 0, 1s, 0 refusals, 0 ERROR, all prestates FIRST",
    "upgrade_collation_twin": "4 applied / 341 total, exit 0, 2s, 0 refusals, 0 ERROR, all prestates FIRST",
    "prestate_branches": "0362 read=FIRST withdraw=FIRST; 0363 FIRST APPLY; 0364 6 FIRST 0 REDO; 0365 four-argument pre-page (#1075/0334) arm — identical on both twins",
    "census_vs_clara_intK": "fn 1542, col 4070, con 3122, idx 957, pol 663, acl 4616, ledger 341 — all diff 0, on BOTH twins",
    "recut_bodies": "3 new signatures, 1 dropped, 7 recut in place — ten bodies, every digest equal to the merger's §5.1",
    "collation_narration_diff": "exactly 1 line, the migrate: summary naming the database",
    "collation_battery_on_en_US": "21 tests / 21 pass / 0 fail / 0 skipped (twice)",
    "browser_run1_with_build": "598 cells / 591 pass / 0 fail / 7 skip, exit 0, 16.8m",
    "browser_run2_no_build": "598 cells / 590 pass / 1 fail / 7 skip, exit 1, 16.3m, same BUILD_ID QwE8F75ASppkDeXR3h44v",
    "browser_runs_diff": "exactly ONE cell differs: responsive-shell-walk.spec.ts:708 (#736) — green run 1, red run 2, green twice more in isolation = flake; no cell red in both",
    "waves_own_walk_once": "accrual-walk.spec.ts 21 cells / 21 pass / 0 fail",
    "typecheck": "exit 0",
    "ci_lint": "exit 0, frozen stage vs origin/main = 40c5ca671, manifest byte-identical to ffb629d73's",
    "check_frozen_workflows": "OK 362 frozen / 62 use-workflow / 3 retired; 350 base entries: 0 sha moved, 0 deployed moved, 0 removed; 347 deployed:true still true; 15 new entries, none carrying a deployed key",
    "check_wiki_dynamic_sql": "OK, 1611 defs, 256 patches, 20 waivers",
    "pins_corpus": "22 / 22, and 0 barrier entries owed (corpus names none of 0362-0365)",
    "web_unit_suite": "5277 tests / 142 suites / 5275 pass / 0 fail / 2 skip, exit 0"
  },
  "findings": [
    { "severity": "minor", "title": "responsive-shell-walk.spec.ts:708 (#736) flaked once in four observations and failed run 2's exit code", "evidence": "green run 1 (847ms), red run 2 (5.7s = its 5s observer timeout), green twice in isolation (888ms, 969ms); the MutationObserver in page.evaluate is not awaited before setViewportSize; spec untouched by the wave (last commit 777c7417b, 2026-09-23); the same cell and text are classified a known load-sensitive flake in wave3-integration-gates-B.md §RED 2" },
    { "severity": "note", "title": "the two doors the wave mints had no population to read on either twin", "evidence": "firm_standing_instructions = 0 and payroll_summary documents = 0 on 55701 and 55702; clara_intK carries 105 standing instructions" },
    { "severity": "note", "title": "0364's two recut tenancy cores were not driven on the upgrade path", "evidence": "contract_plan_confirmations = 0 on both twins" },
    { "severity": "note", "title": "two pre-move ':plan' receipts survive on the hosted twin and are provably short-circuited", "evidence": "two create_accrual_adjustment receipts with ':plan' nested rows; the live body reserves on its own key at line 54 and returns at line 69, before ':acplan' is derived at line 89" },
    { "severity": "note", "title": "the browser suite is mock-backed, so clara_closing_e2e is isolation not coverage", "evidence": "apps/web/e2e/serve-built.mjs; 6 of 7 skips are live-stack fixture gates" },
    { "severity": "note", "title": "rig state left behind: both twins now at 341/0365, and clara_closing_e2e was created on 55701", "evidence": "clara.schema_migrations on both; pg_database on 55701; 20 clara% roles unchanged on both clusters" },
    { "severity": "note", "title": "clara_w4_hosted is a stand-in; every figure in §1 is a rig reading", "evidence": "population table in §1.1" },
    { "severity": "note", "title": "the rollback preflight (brief step 6) was reassigned to Gate C and is not covered here", "evidence": "the orchestrator's task message" }
  ],
  "unverified": [
    "the census reference is clara_intK, not a from-scratch database; from-scratch equivalence is Gate A's to close",
    "the grant census uses this gate's own row shape (4616) and omits column-level ACLs and default privileges",
    "both browser runs ran under sibling-gate host contention; quiet-host behaviour is unmeasured",
    "accrual-mock.mjs is covered only through accrual-walk.spec.ts",
    "no bare root pnpm build and no packages/runtime build; next build is proved only as run 1's e2e build step",
    "0362's and 0364's by-name REDO arms were never entered — every prestate here took FIRST",
    "the db batteries (Gate A), the runtime suite and the two-build cutover drill (Gate C), and step 11a's --lock-deployed (the release) are not run here",
    "the twins' populations are one to three orders of magnitude smaller than clara_intK's, so scale-dependent behaviour is unproved on this path"
  ]
}
```
