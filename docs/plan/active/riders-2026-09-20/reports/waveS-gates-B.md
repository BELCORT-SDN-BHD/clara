# Riders sweep wave S — gate B: the upgrade path, the collation twin, the browser suite twice, the static gates

**Code** `C:\Users\zhant\Desktop\clara-wt\636`, branch `integration/riders-sweep`, head
**`d812c2124d3d6ea5b1410dff7176d42ada17ba82`** — every command below ran at that commit, and **207**
files separate it from the base `3bf6aa94d` (`origin/main`, the released cut phase), which is the
merger's own figure and Gate A's. `git status --porcelain` in that worktree read **empty** before this
gate and **empty** after it, and `git rev-parse HEAD` is unchanged. I committed nothing, edited no
tracked file, pushed nothing, opened no pull request, wrote nothing to GitHub, touched no lane
worktree and no file in the main checkout but this report, spawned no subagent, killed no process I
did not start, and never set `CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP`. Gate A's cluster
(`rigsweep` 55707) and Gate C's (`rigsweepc` 55708) were never connected to; the servers this gate
opened a connection to are its own `rigw4h` (55701) and `rigw4c` (55702), plus one read-only census of
`clara_intS6` and one of the pristine `clara_l02` template on `rl02` (55742).

**Host** Windows 11 + WSL PostgreSQL 17 (Ubuntu) · Node v22.23.2 · pnpm 10.33.0
**Playwright triple** `https://127.0.0.1:3510` / `3511` / `3512`, through
`pnpm --filter @clara/web e2e` — never a bare `npx playwright test` (#865).

**Step 6 of the brief (the rollback preflight) is NOT in this report.** The orchestrator's task
message removed it from Gate B and left it with Gate C, which owns it. Everything else the brief asks
for is below.

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **the upgrade path**, `clara_w4_hosted` 55701, 312 → 337 | `pnpm --filter @clara/db migrate` | **25 new applied · 337 total**, exit 0, **6 s** (12:02:24Z → 12:02:30Z) |
| 1a | the ledger head | `clara.schema_migrations` | **337 rows**, head `0361_reservation_release_advice`, `0295` at the post-fix checksum `5196d64d…` |
| 1b | the wave's own 25 files | log read file by file | **25 / 25 applied**, zero prestate refusals, every tail green (§1.2) |
| 1c | hard errors | `ERROR:` / `FATAL:` in the 104-line log | **none** |
| 1d | drift | a second `migrate` on the same database | **0 new applied · 337 total**, exit 0 |
| 1e | the cluster role census | `pg_roles like 'clara%'` | **20 before, 20 after** — 0154's own count, untouched |
| 2 | **the census, six of them, vs `clara_intS6` (55742)** | `sha256(prosrc)` + five catalog censuses | **every one diff 0** (§2) |
| 2a | function bodies | `oid::regprocedure` + `sha256(prosrc)` | **1540 rows, IDENTICAL** |
| 2b | columns | relation, name, type, NOT NULL, default | **4070 rows, IDENTICAL** |
| 2c | constraints | relation, name, `pg_get_constraintdef`, `convalidated` | **3122 rows, IDENTICAL** |
| 2d | indexes | `pg_indexes.indexdef` | **957 rows, IDENTICAL** |
| 2e | policies | relation, name, cmd, `qual`, `with_check`, roles | **663 rows, IDENTICAL** |
| 2f | grants | every function and relation ACL, exploded per grantee and privilege | **5396 rows, IDENTICAL** |
| 2g | the recut-body set itself | the 312-file template vs the 337-file chain | **42 new signatures, 1 dropped, 40 bodies recut in place** — all 40 at the same digest on all three paths (§2.2) |
| 2h | the ledger rows of the wave's 25 files | `version` + `checksum` | **identical on all three databases**, 25 / 25 |
| 3 | **the collation twin**, `clara_w4_coll` 55702, `en_US.UTF-8`, 312 → 337 | `pnpm --filter @clara/db migrate` | **25 new applied · 337 total**, exit 0, **7 s** (12:03:25Z → 12:03:32Z) |
| 3a | the narration, hosted vs twin | diff of every prestate / tail / applied line | **2 lines differ**, and neither is collation (§3.1) |
| 3b | the same six censuses vs `clara_intS6` | as row 2 | **every one diff 0** |
| 3c | #1047's own live proof, on a real `en_US.UTF-8` server | `collation-pin-portability` + `collation-pin-scan` under the full 152-gate chain | **21 tests · 21 pass · 0 fail · 0 skipped**, exit 0 |
| 3d | drift on the twin | a second `migrate` | **0 new applied · 337 total**, exit 0 |
| 4 | **browser suite, run 1, with the build** | `pnpm --filter @clara/web e2e` | **598 cells · 591 passed · 0 failed · 7 skipped**, exit 0, suite **16.0 m** (12:03:18Z → 12:19:31Z) |
| 5 | **browser suite, run 2, `--no-build`, same artifact** | `pnpm --filter @clara/web e2e -- --no-build` | **598 cells · 591 passed · 0 failed · 7 skipped**, exit 0, suite **16.8 m** (12:19:53Z → 12:36:45Z) |
| 5a | the two runs against each other | cell-by-cell diff of both logs | **identical** — the same 591 `ok` cells in the same order and the same 7 skips. **No flake, in either direction** |
| 5b | #1141's B4 focus-landing cell | `work-question-walk.spec.ts:285` | **green in BOTH runs** (5.7 s, 6.3 s) |
| 6 | **the wave's own touched walks, once each** | `e2e -- --no-build <spec>` on the same artifact | **60 cells · 60 pass · 0 fail** across five walks (§5) |
| 7 | `pnpm typecheck` | from the worktree root | **exit 0**, `apps/web` and `packages/runtime` both Done, 1 m 11 s |
| 8 | `CI=true GITHUB_ACTIONS=true pnpm lint` | from the worktree root | **exit 0**, all four workspaces, 2 m 43 s |
| 8a | the frozen stage's base | `FREEZE_BASE_REF` unset → default | **`origin/main` = `3bf6aa94d`**, not `7bc5a710f` (§6.1) |
| 9 | `node scripts/check-frozen-workflows.mjs` | standalone | **OK — 347 frozen / 60 `"use workflow"` / 3 retired**, the locked count unchanged from the base |
| 10 | `node scripts/check-wiki-dynamic-sql.mjs` | standalone | **OK**, 1608 function definitions and 256 patches scanned, **the same 20 justified waivers** |
| 11 | the web pins corpus | `apps/web/tests/firm-scope-db-pins.test.ts` | **22 tests · 22 pass · 0 fail** (3 suites) |
| 12 | the WHOLE `apps/web` unit suite, once | `node scripts/run-tests.mjs` | **5249 tests · 5247 pass · 0 fail · 2 skipped**, exit 0, 97 s |

**One sentence.** A 312-file database populated the way hosted is takes all 25 of the wave's
migrations in six seconds with every prestate branch satisfied and no refusal, the database it
becomes is byte-for-byte the database the merger integrated across 1540 function bodies, 4070
columns, 3122 constraints, 957 indexes, 663 policies and 5396 grant rows, the same is true on an
`en_US.UTF-8` twin, and the browser suite run twice on one artifact produced **two identical green
runs with not one red cell** — including the B4 cell #1141 was written to stop flaking.

**Verdict: PASS. Nothing above note.**

### How this reconciles with the other two gates

Gate A measured the **from-scratch** chain against `clara_intS6` and found it identical: 1540 / 4070 /
3122 / 957 / 663 rows, the same five figures this gate reads on the upgrade path and on the collation
twin. Because both gates compared against the same third database, the four paths converge
transitively and exactly: **from-scratch ≡ integration ≡ upgrade ≡ collation twin.** Gate A's report
(§2.2) explicitly leaves "which arm the 312-file upgrade path enters" to this gate's §1.2, and §1.3
below answers it with measured digests rather than with the chain order.

---

## 1 · The upgrade path, `clara_w4_hosted` on `rigw4h` 55701

### 1.1 The starting state, read rather than assumed

| reading | value |
|---|---|
| ledger | **312 files**, head `0323_trade_invoice_probe_self_exclusion` |
| `0295` checksum | `5196d64d…` (the post-fix one — the collation fix the cut phase settled) |
| encoding / collation | `UTF8` / `C.UTF-8` |
| `clara%` roles on the cluster | **20** |
| population, the relations the wave's branches turn on | `onboarding_plans` 63 · `onboarding_plan_items` 74 · `tin` items 0 · `invite_preview_attempts` 0 · `confirmation_attempts` 0 · `document_capabilities` 240 · `op_receipts` 667 · `trade_invoices` 1 · `accounting_work` 10 |

The 667 `op_receipts` and the one keyed `trade_invoices` row are the cut phase's own plant
(`waveC-gates.md` §2.1) sitting on top of wave 4's release-time rows; this is the "populated like
hosted" state the brief names, and it is materially unlike a seeded from-scratch rig.

### 1.2 The run

```
PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_w4_hosted \
  CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate    # from clara-wt/636
```

**12:02:24Z → 12:02:30Z, 6 s, exit 0 — `25 new migration(s) applied · 337 total`.** The order it took
is `0330 … 0350`, then `0352`, `0353`, then the overflow block `0360`, `0361` — the file order the
release will use. Twenty-five `applied …` lines, twenty-eight tail notices, **zero** `ERROR:` or
`FATAL:` in 104 log lines.

Every one of the twenty-five prestates printed and was read. None refused; none took a redo branch.
The modes, by the form each file prints:

| file(s) | prestate, as printed |
|---|---|
| 0330 `#1051`, 0331 `#1080`, 0332 `#1074`, 0333 `#1073` | `FIRST APPLY` |
| 0334 `#1075` | `clean — exactly one starting shape of clara.list_accrual_adjustments is live (three-argument, pre-widen)` |
| 0335 | `OK — 4 FIRST, 0 REDO` |
| 0336 | `OK — 2 FIRST, 0 REDO` |
| 0337 | `OK -- 5 FIRST, 0 REDO` |
| 0338 | `OK -- 3 FIRST, 0 REDO`, with the bimodal arm named — §1.3 |
| 0339 `#1067`, 0340 `#1052`, 0341 `#1069` | `clean (FIRST apply)` |
| 0342 `#1061` | `OK` — registry at version 6 across **240** rows, the 6 stale `payroll_summary` rows found |
| 0343 `#1048` | `OK` — the queue at 16 row kinds, four recut and two spliced bodies at their measured pre-images |
| 0344 `#1056` | `OK (FIRST (0321 pre-image) apply)` — the SECOND admissible pre-image arm, §1.3 |
| 0345 `#1090`, 0346 `#1092` | `clean` |
| 0347 `#1098` | `clean (FIRST)`, census `open=24 committed=0 cancelled=0` firm-scope plans with no `tin` item; **backfill planted 0** (note N1) |
| 0348 `#1046` | `clean (FIRST)`, population at apply time **0** `invite_preview_attempts`, **0** `confirmation_attempts` (note N2) |
| 0349 `#1132`, 0350 `#1058` | `clean (FIRST)` |
| 0352 `#1136` | `OK -- mode **FRESH**`, both pre-images recovered at their pinned sha, the two cores re-derived byte for byte (24 queue firm predicates, 17 row kinds each projected once) |
| 0353 `#1137` | `OK` — nine bodies recovered, pinned, derived and reversed, **modes: FRESH ×9**; 15 neighbours unmoved |
| 0360 `#1056 fix` | `OK (FIRST)`, both bimodal pins on their integrated arm — §1.3 |
| 0361 | `OK -- 4 FIRST, 0 REDO` |

### 1.3 The five bimodal or measured prestates, and the arm each entered

This is the brief's own question, and each answer below is a **measured digest**, not an inference
from the chain order.

**0338 — `clara._obo_plan_core`, the one cross-lane body.** `waveS-merge.md` §0 records the pin as
bimodal: `2049c1c4…` (0308's shape, a chain without L1) or `149b4a3d…` (0330 §C's post-image). The
upgrade path printed the arm it matched:

```
0338 prestate OK -- 3 FIRST, 0 REDO -- clara._authority_ref_refusal(text,uuid,uuid,uuid)=FIRST
  clara._prepayment_schedule_core(…)=FIRST
  clara._obo_plan_core(text,uuid,…,jsonb)=FIRST(0330/#1051)
```

**The `0330/#1051` arm**, the same one Gate A's from-scratch chain took. Independently confirmed off
the catalog: the pre-wave template carries `_obo_plan_core` at `2049c1c4404e4710…`, so the FIRST arm
of the pin is what the 312-file database held before the wave, and L1's 0330 — eight files earlier in
the chain — is what moved it to the shape 0338 then matched.

**0344 (`#1056`) — `clara.revise_document_fact` and `clara.list_source_revisions`.** Mode printed as
**`FIRST (0321 pre-image)`**: the file's `v_alt` table, i.e. the SECOND admissible pre-image it gained
at integration, not the shape its lane measured alone. The alternative arms are a bare `FIRST` (the
lane's own pin) and `REDO` (this file's marker already live); neither was taken.

**0352 (`#1136`) — mode `FRESH`.** The file decides FRESH / REDO by counting its two cores: both
absent is fresh, both present is a redo, one of each refuses. **Both absent → FRESH**, and both
pre-images were recovered at their pinned sha on the way.

**0353 (`#1137`) — nine bodies, `FRESH` nine times.** Every one recovered, pinned, derived and
reversed on the fresh arm; 15 neighbours unmoved.

**0360 (`#1056 fix`) — both pins on the integrated arm, printed with their digests.** This is the
strongest reading in the section, because §A and §B each log the pre- and post-image of the body they
splice:

```
#1056 fix §A: clara._payroll_posting_verdict spliced -- owner (clara_fn_owner) and ACL byte-unchanged.
  prosrc sha256: 378086068b13e4fa… -> 4c350623e41527b7…
#1056 fix §B: clara.revise_document_fact spliced -- owner, ACL, DEFINER-ness and search_path byte-unchanged.
  prosrc sha256: 4b9a264d57925d0d… -> 279e4b818bcb2674…
```

`378086068b13e4fa…` is the file's own `c_verdict_alt` — **lane L4's 0343 post-image**, not the lane's
pin `23c644b7…`. `4b9a264d57925d0d…` is its `c_door_alt` — **0344's integrated post-image**, not the
lane's pin `a6858d3e…`. So both of 0360's bimodal pins entered their **second (integrated) arm**, and
the `ready`-arm anchor still occurred exactly once, which is the whole reason the splice needed no
change.

### 1.4 Idempotence and the drift gate

A second `migrate` on the upgraded database reports **`0 new migration(s) applied · 337 total`**,
exit 0 — no checksum drift between any of the 337 files on disk and the rows the ledger holds.

---

## 2 · The census — the upgraded database against the merger's integration chain

The brief allows either Gate A's from-scratch database or the merger's, and the comparator used here
is **`clara_intS6` on 127.0.0.1:55742**, the chain `waveS-merge.md` §17 names as final (337 files,
head `0361`). The reason is a timing one, recorded rather than glossed: when this census ran
(≈12:06Z) `reports/waveS-gates-A.md` did not yet exist, so Gate A's database had no name this gate
could have used — `pg_lsclusters` at 12:02Z showed `rigsweepc` (Gate C's) but no `rigsweep`, and the
report naming `clara_sweepint` landed at 12:14Z, by which time the cluster carrying it had been
dropped (§6 of that report). `clara_intS6` is the database Gate A also compared against, with the
same row counts, so the two gates chain transitively (see "How this reconciles", above).

Six censuses, each dumped from both databases and sorted `LC_ALL=C` before the diff, because sorting
inside Postgres differs by server locale and that is not a difference in content:

| census | rows | integration vs upgraded | integration vs collation twin |
|---|---|---|---|
| every `clara` function: `oid::regprocedure` + `sha256(prosrc)` | **1540** | **diff 0** | **diff 0** |
| every column: relation, name, type, NOT NULL, default | **4070** | **diff 0** | **diff 0** |
| every constraint: relation, name, `pg_get_constraintdef`, `convalidated` | **3122** | **diff 0** | **diff 0** |
| every index: `pg_indexes.indexdef` | **957** | **diff 0** | **diff 0** |
| every policy: relation, name, cmd, `qual`, `with_check`, roles | **663** | **diff 0** | **diff 0** |
| every grant: function and relation ACLs exploded per grantee and privilege | **5396** | **diff 0** | **diff 0** |

### 2.1 What the wave moves, measured against the pristine 312-file template

The pristine `clara_l02` template (312 files, never written to by the merge) was censused read-only
to establish what the wave actually changes, so "diff 0" is a statement about a moving estate rather
than a static one:

| | 312-file template | 337-file chain | delta |
|---|---|---|---|
| `clara` function bodies | 1499 | **1540** | **+42 new signatures, −1 dropped** |
| columns | 4051 | **4070** | +19 |
| constraints | 3103 | **3122** | +19 |
| indexes | 947 | **957** | +10 |
| policies | 658 | **663** | +5 |
| grants | 5320 | **5396** | +76 |

The one dropped signature is **`clara.list_accrual_adjustments(uuid,date,date)`** — #1075's widen,
whose own tail asserts the three-argument form is *gone* rather than left as a resolvable overload.
The census confirms it: the four-argument `(uuid,date,date,text)` exists exactly once and the
three-argument one exists nowhere.

### 2.2 The recut-body census proper

**Forty bodies keep their signature and move**, and every one holds the same digest on the upgrade
path, on the collation twin and on the integration chain. The heaviest, with pre → post
digests (first 16 hex of `sha256(prosrc)`):

| body | template | integrated |
|---|---|---|
| `clara._obo_plan_core(text,uuid,…,jsonb)` | `2049c1c4404e4710` | `bbe338e80dfe0b19` |
| `clara._accrual_plan_core(uuid,uuid,…,jsonb)` | `31adc6d4ae74d220` | `89d2ac3a33e8dcda` |
| `clara.create_accounting_plan(uuid,text,…,text)` | `a7c108d5dd4febba` | `544cd88ecaa5b523` |
| `clara._payroll_posting_verdict(uuid)` | `23c644b7b4ad11ce` | `4c350623e41527b7` |
| `clara.revise_document_fact(uuid,text,jsonb,integer,text,text)` | `e0d7ee1c016d1eb7` | `279e4b818bcb2674` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `d5456eccb945decd` | `a76f8a575c1567d6` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `02ea6afe635dc9a8` | `5cc0fa562dec69fa` |
| `clara._prepayment_schedule_core(uuid,uuid,…,text)` | `87fc7e25d9e872e5` | `af096b607079e11a` |
| `clara._assert_claim_basis(uuid,jsonb,boolean)` | `e439346cbf68a267` | `d1dff7654eda9063` |
| `clara._draft_opening_item_core(uuid,uuid,…,text)` | `642967d213f75b3d` | `97a91ee0ab6296f1` |

The other thirty (`_acct_role_reserved`, `_adj_line_eligibility_breach`, `_adv_enrolment_admission`,
`_authority_ref_refusal`, `_fa_assert_code_unreserved`, `_fa_role_claim_conflict`,
`_payroll_answers_ok`, `_payroll_entry_plan`, `_post_payroll_run`, `_revenue_recognition_core`,
`confirm_tenancy_rent_plan`, `confirm_tenancy_rent_plan_revision`, `create_prepayment_schedule_for`,
`create_revenue_recognition_schedule_for`, `get_accounting_work_row`, `get_contract_terms`,
`get_payroll_settlement_candidates`, `get_rent_settlement_candidates`, `get_tenancy_deposit_coding`,
`get_tenancy_escalation_revision`, `get_tenancy_rent_plan_draft`, `get_work_claim_origin`,
`list_source_revisions`, `persist_payroll_facts`, `propose_contract_terms`,
`read_prepayment_source_for`, `read_revenue_recognition_source_for`,
`replace_revenue_recognition_schedule`, `revise_accounting_plan`, `upsert_fa_account_profile`)
are equally identical across the three paths, by the same whole-census diff.

`_obo_plan_core`'s integrated digest is `bbe338e8…`, not the `149b4a3d…` that 0338's bimodal pin
names, and that is correct rather than a contradiction: `149b4a3d…` is 0330's post-image, which 0338
pins as its **prestate**, and 0338 §E then replaces the body. Gate A records the same reading (§3,
"One reading that could be mistaken for a contradiction").

### 2.3 The ledger itself

For all 25 of the wave's files, `version` + `checksum` were read from `clara_w4_hosted`,
`clara_w4_coll` and `clara_intS6`. Every (version, checksum) pair occurs on **all three** databases
and no pair occurs on fewer — 25 / 25, no orphan, no mismatch.

---

## 3 · The collation twin, `clara_w4_coll` on `rigw4c` 55702 (`en_US.UTF-8`)

```
PGHOST=127.0.0.1 PGPORT=55702 PGUSER=postgres PGDATABASE=clara_w4_coll \
  CLARA_RIG_DB=1 CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate
```

**12:03:25Z → 12:03:32Z, 7 s, exit 0 — `25 new migration(s) applied · 337 total`.** Same file order,
zero refusals, zero `ERROR:`/`FATAL:` in 104 log lines, and a second `migrate` reports `0 new · 337
total`.

### 3.1 The two databases' narration, diffed line for line

Every `prestate`, `tail`, `backfill` and `applied` line from both logs was extracted (backend pids
stripped) and diffed. **Exactly two lines differ**, and neither is a collation effect:

1. the `migrate:` summary line, which names the target database;
2. `#1098`'s prestate census — `open=24 committed=0 cancelled=0` on the hosted twin against
   `open=3 committed=0 cancelled=0` on the collation twin. That is a **row-population** difference
   between two rigs (63 vs 7 `onboarding_plans`), and the arm both entered is the same one: committed
   = 0 on both, so both backfilled 0 items.

Every other prestate mode, every tail sentence and every count printed by the twenty-five files is
**byte-identical** between a `C.UTF-8` server and an `en_US.UTF-8` one. **No collation-dependent
refusal, and no pin to name.**

### 3.2 #1047's own live battery, run on a real glibc `en_US.UTF-8` server

`#1047` (lane L7) added the collate-C house rule, the text-ordered pin census and a live portability
battery. The brief calls this upgrade its proof; the battery itself is the sharper proof, so it was
also run — on the `en_US.UTF-8` database, under the **full 152-gate chain**:

```
PGHOST=127.0.0.1 PGPORT=55702 PGUSER=postgres PGDATABASE=clara_w4_coll \
  node --test --test-concurrency=1 <152 gates> \
  tests/collation-pin-portability.test.mjs tests/collation-pin-scan.test.mjs
```

**21 tests · 21 pass · 0 fail · 0 skipped**, exit 0. Its own vacuity control passes first — *"the
comparator is a REAL second collation: it reorders the pair 0295 was stopped by, and `C` does not"* —
so the ten portability assertions after it are not vacuous.

### 3.3 The censuses

All six censuses of §2 on this database are **diff 0** against `clara_intS6`, once both sides are
sorted `LC_ALL=C`. 1540 / 4070 / 3122 / 957 / 663 / 5396.

---

## 4 · The browser suite, twice, on one artifact

### 4.0 The target database and what it is for

```
psql -p 55701 -c "create database clara_sweep_e2e template clara_w4_hosted"   # 337 files, head 0361
```

Both runs carried `PGHOST=127.0.0.1 PGPORT=55701 PGUSER=postgres PGDATABASE=clara_sweep_e2e` beside
the triple, so nothing a walk could reach would touch the upgraded database itself. **The two-build
cutover drill of the cut phase was NOT repeated and no frozen body was moved** — the brief forbids
both, and `check-frozen-workflows` reads the base's own 347 / 60 / 3 at the end (row 9).

Worth stating plainly rather than leaving implied: `pnpm --filter @clara/web e2e` is **mock-backed**
(`e2e/serve-built.mjs` and its file-disjoint mock lanes), so the template copy is *isolation*, not
coverage. The walks that do want a live stack (`interview-walk`, `reports-download-walk`) live behind
`e2e/live-stack/` with their own configs and skip themselves here — six of the seven skips below.

### 4.1 Run 1 — with the build

`pnpm --filter @clara/web e2e`, **12:03:18Z → 12:19:31Z**. The build ran first and succeeded on the
first attempt (no `0xc0000142` panic, #869), producing `BUILD_ID I_NI2HDqSy0qugGhG9iKV`. The suite
then ran **598 cells across 54 spec files, one worker**.

| | |
|---|---|
| cells | **598** |
| passed | **591** |
| failed | **0** |
| skipped | **7** |
| suite wall clock | **16.0 m** |
| exit | **0** |

### 4.2 Run 2 — the same artifact, `--no-build`

`pnpm --filter @clara/web e2e -- --no-build`, **12:19:53Z → 12:36:45Z**. The harness confirms the
reuse in its own words, which is what makes this a second measurement of one artifact rather than of
two builds:

```
[e2e] --no-build: reusing the existing .next build, NOT rebuilding @clara/web
[WebServer] [e2e] serving .next BUILD_ID I_NI2HDqSy0qugGhG9iKV, built 16.5 min ago
```

| | run 1 | run 2 |
|---|---|---|
| cells | 598 | **598** |
| passed | 591 | **591** |
| failed | **0** | **0** |
| skipped | 7 | **7** |
| suite wall clock | 16.0 m | **16.8 m** |
| exit | 0 | **0** |

### 4.3 The two runs against each other

The `ok` / `not ok` / skip lines of both logs were extracted with their cell numbers and titles and
diffed: **the two runs report the same 591 passing cells in the same order and the same 7 skips.**
There is no cell red in one run and green in the other, so **this gate names no flake**, and no cell
red in both, so it reports no browser finding.

**#1141's B4, named by the brief.** `work-question-walk.spec.ts:285` — *"B4: the SAME question is
answered from Needs-you, and the row leaves without dumping focus"* — is the cell wave 4's gate B and
the cut phase's gate both caught red once. This wave's #1141 rewrote it to poll
`document.activeElement` to a settled observation instead of sampling it once. It is **`ok 593` in
run 1 (5.7 s) and `ok 593` in run 2 (6.3 s)**, and green a third time in the isolated walk of §5.
Three green observations under a host carrying two sibling gate workers.

### 4.4 The seven skips, identical in both runs, each its own fixture gate

| cells | spec | why |
|---|---|---|
| 276–279 | `interview-walk.spec.ts:211,243,260,316` | the isolated COMPLETE / CANCEL / RACE client-thread fixture is supplied by `live-stack/run-live-walk.mjs`, not by this config |
| 440–441 | `reports-download-walk.spec.ts:64,125` | `run-reports-download-walk.mjs` supplies the client/artifact fixture and the second, unfinished export |
| 499 | `signup-confirm-pending.spec.ts:261` | `test.skip(true, …)` — the wall is wired and the skeleton below it covers the arm |

None is an environment failure; each names its own reason in its source. These are the same seven the
cut phase's gate recorded.

---

## 5 · The wave's own touched e2e specs, once each

`git diff --name-only 3bf6aa94d...HEAD -- apps/web/e2e` returns eight files: four `.spec.ts`
(`accrual-walk`, `payroll-settlement-walk`, `prepayments-walk`, `work-question-walk`), three mocks
(`accrual-mock.mjs`, `payroll-settlement-mock.mjs`, `staff-expense-claim-mock.mjs`) and the e2e
`README.md`. The `staff-expense-claim-mock.mjs` change belongs to `staff-expense-claim-walk.spec.ts`,
so **five** walks are the wave's, which is also the set the merger ran.

Each run once, `--no-build`, on the same artifact and the same triple:

| walk | the commit that touched it | cells | result | wall |
|---|---|---|---|---|
| `accrual-walk.spec.ts` (+ `accrual-mock.mjs`) | `fc9d61b2b` — L1, **#1073** | 21 | **21 passed** | 32.2 s |
| `prepayments-walk.spec.ts` | `cf8bc6752` + `d6ede5c56` — L2, **#1050 #1079** | 8 | **8 passed** | 21.3 s |
| `payroll-settlement-walk.spec.ts` (+ its mock) | `15c4c3ff3` — L4, **#1059 #1060 #1048** | 3 | **3 passed** | 7.4 s |
| `work-question-walk.spec.ts` | `f26314192` + `a6343dd79` — L6, **#1141** | 14 | **14 passed** | 1.2 m |
| `staff-expense-claim-walk.spec.ts` (via `staff-expense-claim-mock.mjs`) | `48bfb5998` — L3, **#1069** | 14 | **14 passed** | 28.1 s |
| **total** | | **60** | **60 passed · 0 failed** | |

Each attribution is `git log 3bf6aa94d...HEAD -- <file>` read, not inferred from the lane table.

Sixty cells, and the identical sixty inside both whole-suite runs — 21 / 8 / 3 / 14 / 14 in run 1 and
the same in run 2, which is also the merger's §17 figure exactly.

---

## 6 · The static gates at the integrated head

| check | when | result |
|---|---|---|
| `pnpm typecheck` | 12:40:12Z → 12:41:23Z (1 m 11 s) | **exit 0** — `apps/web` Done, `packages/runtime` Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | 12:41:28Z → 12:44:11Z (2 m 43 s) | **exit 0**, all four workspaces |
| `node scripts/check-frozen-workflows.mjs` | 12:05:07Z | **OK — 347 frozen / 60 `"use workflow"` / 3 retired** |
| `node scripts/check-wiki-dynamic-sql.mjs` | 12:05:12Z | **OK** — 1608 function definitions, 256 patches, **20 justified waivers** |
| `apps/web/tests/firm-scope-db-pins.test.ts` | 12:05:18Z | **22 tests · 22 pass · 0 fail**, 3 suites |
| the WHOLE `apps/web` unit suite | 12:44:19Z → 12:45:56Z (97 s) | **5249 tests · 5247 pass · 0 fail · 2 skipped**, exit 0 |

### 6.1 The frozen stage's base, checked rather than assumed

The brief asks that the frozen-workflow stage be measured against `origin/main`, not against
`7bc5a710f`. Both freeze checks read `process.env.FREEZE_BASE_REF || "origin/main"`
(`scripts/check-frozen-workflows.mjs:153`, `scripts/check-frozen-evaluators.mjs:50`).
`FREEZE_BASE_REF` is set nowhere in this repository outside two selftests that pass their own value
to a child, and it was unset in this gate's environment. In this worktree `origin/main` resolves to
**`3bf6aa94dfc48f0f3781dd56dc275e88787c7d4b`** — the released cut phase and this branch's own base.
The check's own line says so: *"verified against frozen-workflows.json (append-only vs origin/main)"*.

### 6.2 The two skipped unit cells

Both are in the live-provider sign-in battery and skip themselves for want of
`CLARA_LIVE_SUPABASE_AUTH_URL` / `CLARA_LIVE_SUPABASE_AUTH_ANON_KEY`, each naming the mocked coverage
that stands in for it (`components/entry/password-recovery.test.tsx`, `components/login-a11y.test.tsx`).
Same two the merger's §17 counts. **No Windows-only red from RIG.md's list appeared**: the
`thread-live-clarify.test.tsx` load flake did not reproduce, and `use-clara-thread-stop.test.ts`
(#956) is green.

---

## 7 · Findings

**No blocker. No major. No minor.** Six notes.

### note N1 — 0347's backfill arm was not exercised on either upgrade twin

`0347_firm_setup_committed_tin_backfill` plants a `tin` item on every **committed** firm-scope
onboarding plan that lacks one. Both twins counted **committed = 0**, so both planted 0 and the
loop's body never ran on this gate's path. This is not a defect and not an omission this gate could
close without widening its scope: lane L7 drove the arm for real on its own database — *"#1098
backfill: 2 tin item(s) planted on committed firm-scope plans"* — and
`packages/db/tests/firm-setup-committed-tin-backfill.test.mjs` carries the cell
(`p1098.backfill.committed_plan_gains_tin_marked_by_turnover`) that Gate A ran green inside its 598.
What is worth carrying to the release: **hosted may hold committed firm-scope plans, and this
rehearsal did not.** The file's tail asserts the post-condition unconditionally (*"no committed
firm-scope plan lacks a tin item any more"*, plus byte-identity of every pre-existing row), so a
non-zero plant on hosted is self-checking — but it will be the first non-zero plant anywhere outside
one lane database.
**Evidence:** hosted prestate `open=24 committed=0 cancelled=0`; twin `open=3 committed=0
cancelled=0`; `onboarding_plan_items where item_key='tin'` = 0 on both after the run;
`reports/waveS-lane07-ticket1098.md`.

### note N2 — 0348's retention prune ran against an empty population here

`#1046`'s prestate printed *"Population at apply time: 0 invite_preview_attempts row(s), 0
confirmation_attempts row(s)"* on the hosted twin, and the same on the collation twin. The merger's
integration database carries 12 and 14 of those rows respectively, so the non-empty arm is proved
there and in the lane's battery, not on this gate's upgrade path.
**Evidence:** the prestate line in both logs; `select count(*)` on all three databases.

### note N3 — the browser suite's database is isolation, not coverage

`pnpm --filter @clara/web e2e` is mock-backed. `clara_sweep_e2e` was created and pointed at as the
brief asks, and the six live-stack cells skipped by their own fixture gates in both runs. **No
browser cell in this suite reads the upgraded schema**, so the 598 green cells are evidence about the
web artifact, not about the migration chain. The chain's own evidence is §1 to §3 and Gate A's
batteries.

### note N4 — the rig state this gate leaves behind

Three changes a later reader needs:

| server | database | now |
|---|---|---|
| `rigw4h` 55701 | `clara_w4_hosted` | **337 files, head `0361`** (was 312 / `0323`) |
| `rigw4c` 55702 | `clara_w4_coll` | **337 files, head `0361`** (was 312 / `0323`) |
| `rigw4h` 55701 | **`clara_sweep_e2e`** | **created by this gate**, a template copy of the upgraded hosted twin, left in place as the browser runs' target |

No cluster was created or dropped, no role was created or swept (20 `clara%` on both clusters, before
and after), and `clara_l02` on 55742 was opened read-only for one census and not written to.

### note N5 — `clara_w4_hosted` is a stand-in, not hosted

Every number in §1 is a rig reading. The stand-in carries wave 4's release-time rows plus the cut
phase's two planted rows; real hosted carries far more and, as N1 says, may carry row shapes this
rehearsal did not have. What the rehearsal does establish is the shape-level claim: the chain applies
in six seconds from 312 to 337 with every prestate satisfied, and the schema it lands on is
byte-identical to the one three other paths reach.

### note N6 — the rollback preflight is not in this report

The brief's Gate B step 6 (`rollback-preflight.mjs` against the upgraded database with main's
`refresh-061a6992` image) was removed from this gate by the orchestrator's own task message and left
with Gate C, which owns it. It was not run here, and nothing in this report should be read as
covering it.

---

## 8 · Anything unverified

1. **The upgrade path was never diffed directly against Gate A's from-scratch database.** That gate
   had not yet named `clara_sweepint` when this census ran, and its cluster was dropped before the
   name was published, so the convergence of the upgrade path with the from-scratch chain is
   **transitive** through `clara_intS6` rather than a single direct diff. Sound, because Gate A's own
   census of `clara_intS6` reports the same 1540 / 4070 / 3122 / 957 / 663 row counts this gate
   reads — but one step longer than a direct comparison would have been, and nothing now alive can
   shorten it.
2. **The grant census is this gate's own shape, not Gate A's.** Mine explodes every function and
   relation ACL per grantee and privilege (5396 rows); Gate A's pairs owner + definer + volatility +
   `proconfig` + `proacl` (1884 rows). Both are diff 0, but they are two different questions asked of
   the same catalog, not one question asked twice.
3. **Both browser runs ran under host contention** from two sibling gate workers, as every browser
   measurement in this plan folder has. That both runs were nevertheless perfectly green is a
   stronger reading than a quiet host would have given, but the converse — how the suite behaves on a
   quiet host — remains unmeasured here, as it has been in every wave.
4. **`accrual-mock.mjs` and `payroll-settlement-mock.mjs` were exercised only through their walks.**
   Both changed this wave and neither has a cell of its own; the five walks of §5 are the whole of
   this gate's evidence for them.
5. **The wave's own unverified lists stand.** This gate verified the upgrade path, the collation
   twin, the browser artifact and the static gates. It did not re-review a lane's claim, did not run
   the db batteries (Gate A's) and did not run the runtime suite or the cutover drill (Gate C's).
   `waveS-merge.md` §18's eight items are not closed by anything here except §18.3's web build, which
   ran green as run 1's build step.
6. **`pnpm build` for `apps/web` is now proved only as the e2e build step.** `next build` succeeded
   inside `e2e/run.mjs` and produced the artifact both runs served, which answers `waveS-merge.md`
   §18.3 in substance; a bare `pnpm build` at the root was not separately invoked.

---

**Return value**

```json
{
  "gate": "B",
  "verdict": "pass",
  "counts": {
    "upgrade_hosted": "25 applied / 337 total, exit 0, 6s, 0 refusals, 0 ERROR",
    "upgrade_collation_twin": "25 applied / 337 total, exit 0, 7s, 0 refusals, 0 ERROR",
    "census_vs_clara_intS6": "fn 1540, col 4070, con 3122, idx 957, pol 663, acl 5396 — all diff 0, on BOTH twins",
    "recut_bodies": "42 new signatures, 1 dropped, 40 recut in place — identical on all three paths",
    "collation_batteries_on_en_US": "21 tests / 21 pass / 0 fail / 0 skipped",
    "browser_run1_with_build": "598 cells / 591 pass / 0 fail / 7 skip, exit 0, 16.0m",
    "browser_run2_no_build": "598 cells / 591 pass / 0 fail / 7 skip, exit 0, 16.8m",
    "browser_runs_diff": "identical — no flake, no cell red in either run",
    "waves_own_walks_once_each": "60 cells / 60 pass / 0 fail across 5 specs",
    "typecheck": "exit 0",
    "ci_lint": "exit 0, frozen stage vs origin/main = 3bf6aa94d",
    "check_frozen_workflows": "OK 347 / 60 / 3",
    "check_wiki_dynamic_sql": "OK, 1608 defs, 256 patches, 20 waivers",
    "pins_corpus": "22 / 22",
    "web_unit_suite": "5249 tests / 5247 pass / 0 fail / 2 skip, exit 0"
  },
  "findings": [
    { "severity": "note", "title": "0347's backfill arm was not exercised on either twin (committed firm-scope plans = 0)", "evidence": "hosted prestate open=24 committed=0; twin open=3 committed=0; tin items 0 on both; lane L7 planted 2 on clara_l09" },
    { "severity": "note", "title": "0348's retention prune met an empty population on both twins", "evidence": "#1046 prestate: 0 invite_preview_attempts, 0 confirmation_attempts; clara_intS6 carries 12 and 14" },
    { "severity": "note", "title": "the browser suite is mock-backed, so clara_sweep_e2e is isolation not coverage", "evidence": "apps/web/e2e/serve-built.mjs; 6 of 7 skips are live-stack fixture gates" },
    { "severity": "note", "title": "rig state left behind: both twins now at 337/0361, and clara_sweep_e2e was created on 55701", "evidence": "clara.schema_migrations on both; pg_database on 55701" },
    { "severity": "note", "title": "clara_w4_hosted is a stand-in; every figure is a rig reading", "evidence": "population table in §1.1" },
    { "severity": "note", "title": "the rollback preflight (brief step 6) was reassigned to Gate C and is not covered here", "evidence": "the orchestrator's task message" }
  ],
  "unverified": [
    "Gate A's from-scratch database was already dropped, so convergence is transitive through clara_intS6 rather than a direct diff",
    "the grant census uses this gate's own row shape (5396), not Gate A's (1884) — two questions, both diff 0",
    "both browser runs ran under sibling-gate host contention; quiet-host behaviour is unmeasured",
    "accrual-mock.mjs and payroll-settlement-mock.mjs are covered only through their walks",
    "the db batteries, the runtime suite and the two-build cutover drill are Gates A and C's, not re-run here",
    "a bare root `pnpm build` was not invoked; next build is proved only as run 1's e2e build step"
  ]
}
```
