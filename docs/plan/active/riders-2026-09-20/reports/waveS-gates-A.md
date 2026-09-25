# Riders sweep wave S — gate A: the from-scratch chain and the census

**Code** `C:\Users\zhant\Desktop\clara-wt\636`, branch `integration/riders-sweep`, head
**`d812c2124d3d6ea5b1410dff7176d42ada17ba82`** — every command below was run at that commit, and
**207** files separate it from the base `3bf6aa94d` (`origin/main`, the released cut phase), which is
the merger's own figure. `git status --porcelain` in that worktree read **empty** before this gate
and empty after it. I committed nothing, edited no tracked file, pushed nothing, opened no pull
request, wrote nothing to GitHub, touched no lane worktree and no file in the main checkout but this
report, spawned no subagent, killed no process I did not start, and never set `CLARA_RIG_ALLOW_RESET`
or `CLARA_RIG_ALLOW_ROLE_SWEEP`. Gate B's clusters (`rigw4h` 55701, `rigw4c` 55702) and Gate C's
(`rigsweepc` 55708) were never connected to; the only servers this gate opened a connection to are
its own `rigsweep` (55707) and one read-only census of `clara_intS6` on `rl02` (55742).

**Host** Windows 11 + WSL PostgreSQL 17.11 (Ubuntu) · Node v22.23.2 · pnpm 10.33.0
**Cluster** `rigsweep`, `127.0.0.1:55707`, `C.UTF-8`, trust — **built for this gate and dropped at
the end of it** (§6).

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **the disposable cluster** | `pg_createcluster --locale C.UTF-8 17 rigsweep -p 55707 --start` | online, PostgreSQL **17.11**, `datcollate = C.UTF-8`, trust on `local` + both loopback hosts, **0** `clara%` roles at birth |
| 2 | **the chain, 0001 → the integrated head, from empty** | `pnpm --filter @clara/db migrate` | **337 new applied · 337 total**, exit 0, **2 m 02 s** (12:01:03Z → 12:03:05Z) |
| 2a | the ledger head | `clara.schema_migrations` | **337 rows**, head `0361_reservation_release_advice`, `0295` at the post-fix checksum `5196d64d…` |
| 2b | the wave's own 25 files | log read file by file | **25 / 25 applied, every one on its FIRST-apply branch, ZERO REDO**, zero prestate refusals, every tail green (§2.2) |
| 2c | hard errors | `ERROR:` / `FATAL:` in 1409 log lines | **none** |
| 2d | the cluster role census | `pg_roles like 'clara%'` | **0 → 20**, 0154's own count, reached by the chain alone (no reset, no sweep) |
| 2e | seed | `pnpm --filter @clara/db seed` | **2 seed file(s)**, exit 0 |
| 2f | drift | a second `migrate` on the same database | **0 new applied · 337 total**, exit 0 — no checksum drift |
| 3 | **the census, seven of them, vs `clara_intS6` (55742)** | `sha256(prosrc)` + five catalog censuses + the ledger | **every one diff 0** — §3 |
| 3a | function bodies | `oid::regprocedure` + `sha256(prosrc)` | **1540 rows, IDENTICAL** |
| 3b | columns | relation, name, type, NOT NULL, default | **4070 rows, IDENTICAL** |
| 3c | constraints | relation, name, `pg_get_constraintdef`, `convalidated` | **3122 rows, IDENTICAL** |
| 3d | indexes | `pg_indexes.indexdef` | **957 rows, IDENTICAL** |
| 3e | policies | relation, name, permissive, roles, cmd, `qual`, `with_check` | **663 rows, IDENTICAL** |
| 3f | grants and posture | relation owner + RLS + `relacl`; function owner + definer + volatility + `proconfig` + `proacl` | **1884 rows, IDENTICAL** |
| 3g | the ledger itself | `version` + `checksum`, all rows | **337 rows, IDENTICAL** |
| 4 | **every lane's db batteries, full 152-gate chain** | `node --test --test-concurrency=1 <152 gates> <49 files>` | **598 tests · 598 pass · 0 fail · 0 skipped**, exit 0, **2 m 15 s** |
| 4a | `operation-census` + `rig-isolation`, same chain | as above | **33 tests · 32 pass · 0 fail · 1 skipped**, exit 0, 52 s — the one skip is §5 N2 |
| 4b | the gate chain's own registration | 152 tokens vs `tests/*-preintegration-gate.mjs` on disk | **152 = 152**, no orphan file and no token pointing at a missing file; **128 on the base + 24 the wave adds** |
| 5 | **the cluster dropped** | `pg_dropcluster 17 rigsweep --stop` | exit 0, gone from `pg_lsclusters` (§6) |

**One sentence.** The whole estate rebuilds from `0001` to `0361` on a cluster that never saw a
migration before, in 2 m 02 s with every one of the wave's 25 files on its first-apply branch and no
refusal anywhere; and the database that chain produces is **byte-for-byte the same database the
merger integrated**, across 1540 function bodies, 4070 columns, 3122 constraints, 957 indexes, 663
policies, 1884 grant-and-posture rows and all 337 ledger rows. **Verdict: PASS. Nothing above note.**

Two numbers reconcile against the merger's §17 exactly: its db batteries read **574** "measured after
L8; L6 adds 24 more", and this gate, run once at the complete head, reads **598** = 574 + 24. Its
`operation-census` + `rig-isolation` reads 33 / 32 / 0 / 1, and so does this one.

---

## Method

`reports/wave4-gates-A.md` is the template and `reports/waveC-gates.md` §1.1 is the cluster recipe.
Three things are done differently, each because this gate is a sweep wave's rather than a wave 4's:

1. **The cluster is born for this gate.** Wave 4's gate A ran its from-scratch chain on `rigw4`, a
   cluster that had already carried one, and therefore needed the #867 `role-census-reset.mjs`
   recipe to get 0154's role pin back to 14 first. This gate takes waveC's route instead: a brand-new
   `rigsweep` with **zero** `clara%` roles, so the chain's own role arithmetic (0 → 20) is measured
   on a virgin cluster and `role-census-reset.mjs` is never invoked at all. `CLARA_RIG_ALLOW_RESET`
   and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.
2. **The census is seven censuses, not four.** Wave 4 compared function bodies, columns, constraints
   and indexes. The brief adds **policies** and **grants**, and this gate adds a seventh of its own,
   the **ledger** (`version` + `checksum` for all 337 rows), because a structural match on a chain
   that recorded a different checksum would still be a release hazard. The grants census also carries
   each relation's owner and RLS posture and each function's owner, `SECURITY DEFINER` flag,
   volatility and `proconfig`, so a body that moved lanes without changing text would show.
3. **The census is taken BEFORE the batteries run.** The batteries plant and drop rows and, in a few
   cases, transient objects. Taking the census first means what is compared is the chain's own
   output, not a chain plus test residue. This is stated rather than assumed because it is the one
   ordering choice that could have produced a false diff.

The census is read off the catalog, in a session with `search_path = pg_catalog` so that every
`regprocedure` and `regclass` renders schema-qualified on both servers, and ordered by the rendered
text rather than by OID, which differs between databases by construction.

---

## 1 · The cluster, built the way waveC's §1.1 built `rigcut`

Every command, verbatim, from Git Bash on Windows driving WSL:

```
sudo -n pg_createcluster --locale C.UTF-8 17 rigsweep -p 55707 --start
sudo -n cp /etc/postgresql/17/rigw4/pg_hba.conf /etc/postgresql/17/rigsweep/pg_hba.conf
sudo -n chown postgres:postgres /etc/postgresql/17/rigsweep/pg_hba.conf
sudo -n pg_ctlcluster 17 rigsweep reload
```

| step | result |
|---|---|
| `pg_createcluster` | online; `initdb --locale C.UTF-8`, encoding UTF8 |
| `select version()` | `PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg26.04+2) on x86_64-pc-linux-gnu` |
| `template1.datcollate` | **`C.UTF-8`** |
| `pg_hba.conf` after the copy | `local all all trust`, `host all all 127.0.0.1/32 trust`, `host all all ::1/128 trust`, plus the three replication lines — identical to `rigw4`'s |
| `clara%` roles at birth | **0** |

RIG.md's port rule is observed: Windows cannot reach TCP 55772–55871 on this host, and **55707** is
the port RIG.md already reserves for a disposable cluster below that range. `pg_lsclusters` showed no
cluster on 55707 and none named `rigsweep` before this gate created one.

---

## 2 · The chain, 0001 to the integrated head, on an empty database

### 2.1 The run

```
createdb -h 127.0.0.1 -p 55707 -U postgres clara_sweepint
PGHOST=127.0.0.1 PGPORT=55707 PGUSER=postgres PGDATABASE=clara_sweepint \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 pnpm --filter @clara/db migrate
```

**12:01:03Z → 12:03:05Z, 2 m 02 s, exit 0.**

```
migrate: 337 new migration(s) applied · 337 total · target 127.0.0.1:55707/clara_sweepint
```

337 `applied … · backend pid` lines in a 1409-line log. `clara.schema_migrations` reads **337 rows,
head `0361_reservation_release_advice`**, and `0295_wave4_chart_rows` carries the post-fix checksum
`5196d64d944e61ef836313cffd6bcc2d4dddd18bc808ca55f86e30544ecece0d` — the same value the pristine
`clara_l02` template and `clara_intS6` carry.

The roster this chain ran from was read first: `packages/db/migrations` holds **337** `.sql` files and
**the first four characters of every filename are unique across all 337** — no duplicate number
anywhere. The wave contributes **25** of them and every one is an **addition**:
`git diff --name-status 3bf6aa94d...HEAD -- packages/db/migrations` is 25 lines and all 25 are `A`.
**No already-shipped migration file was edited by this wave**, which is the cleanest possible
precondition for Gate B's upgrade path.

The cluster's `clara%` role count went **0 → 20**, reached by the chain alone. The twenty are
`clara_agent_read_login`, `clara_agent_ro`, `clara_auth_wall`, `clara_auth_wall_login`,
`clara_authenticated`, `clara_fn_owner`, `clara_freeform_login`, `clara_freeform_ro`,
`clara_invite_preview`, `clara_invite_preview_login`, `clara_runtime`, `clara_runtime_login`,
`clara_stripe_webhook`, `clara_stripe_webhook_login`, `clara_wake_bank`, `clara_wake_bank_login`,
`clara_wake_filing`, `clara_wake_interactive`, `clara_wake_proactive`, `clara_wake_write_login`.

Seed afterwards: `0001_smoke_seed.sql`, `0002_core_seed.sql`, exit 0.

### 2.2 The wave's 25 files, in chain order, with the branch each took

`0330 0331 0332 0333 0334 0335 0336 0337 0338 0339 0340 0341 0342 0343 0344 0345 0346 0347 0348 0349
0350 0352 0353 0360 0361` — the overflow block (`0360`, `0361`) last, exactly the order the merger's
§17 records as the release's own. **Every one printed a clean prestate and a green tail. Zero REDO,
zero refusals.**

Five files print the numeric prestate form and all five read `0 REDO`:

| file | prestate |
|---|---|
| 0335 | `OK — 4 FIRST, 0 REDO` |
| 0336 | `OK — 2 FIRST, 0 REDO` |
| 0337 | `OK -- 5 FIRST, 0 REDO` |
| 0338 | `OK -- 3 FIRST, 0 REDO` — and see below |
| 0361 | `OK -- 4 FIRST, 0 REDO` |

The other twenty print the ticket-number form (`#1051 prestate: FIRST APPLY …`, `#1080`, `#1074`,
`#1073`, `#1075`, `#1067`, `#1052`, `#1069`, `#1061`, `#1048`, `#1056`, `#1090`, `#1092`, `#1098`,
`#1046`, `#1132`, `#1058`, `#1136`, `#1137`, `#1056 fix`). Every one reads `FIRST`, `FRESH` or
`clean (FIRST apply)`. The word "redo" appears 40 times in the log and **every occurrence is prose**
inside a bimodal admission sentence; no file printed a redo branch as its taken arm.

**The one bimodal pin the cross-lane sweep flagged, read on the catalog.** `waveS-merge.md` §0 records
that 0338 §0 pins `clara._obo_plan_core` bimodally — `2049c1c4…` (0308's shape, a chain with no L1) or
`149b4a3d…` (0330 §C's post-image). On a from-scratch integrated chain, L1's 0330 is eight files
earlier, so the second arm is the only lawful one, and that is the arm the chain printed:

```
0338 prestate OK -- 3 FIRST, 0 REDO -- clara._authority_ref_refusal(text,uuid,uuid,uuid)=FIRST
  clara._prepayment_schedule_core(…)=FIRST
  clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)=FIRST(0330/#1051)
```

`FIRST(0330/#1051)` is the pin naming which arm it matched. This is the from-scratch half of the
question; the hosted half (which arm the 312-file upgrade path enters) is Gate B's §1.

**#1051's from-scratch proof.** `waveS-merge.md` §18.6 carries lane L1's open recheck item that #1051
had no from-scratch chain of its own. This chain supplies it independently of the merger's:
`#1051 prestate: FIRST APPLY` and its tail confirms `clara._assert_plan_authority` minted as a stable,
definer, `clara_fn_owner`-owned, search-path-pinned internal granted to nobody, resolving through an
`_authority_ref_refusal` byte-identical to its #977 pre-image.

### 2.3 No hard error anywhere

`ERROR:` and `FATAL:` appear **zero** times in the 1409-line log. The 20-odd lines that match
`error|refus|abort` on a case-insensitive grep are all `[notice]` prose in which a migration describes
a refusal it installs. `migrate` exited 0 and a second run reports `0 new migration(s) applied · 337
total`, so no file's on-disk text drifted from the checksum the ledger recorded.

---

## 3 · The census — the from-scratch chain against `clara_intS6`

`clara_intS6` on `127.0.0.1:55742` is the database `waveS-merge.md` names as the last of the merger's
four replays and the one every count in that report is taken on: created from the pristine
`clara_l02` template (312 files, head `0323`) and migrated to 337 / `0361`. It was read from and
never written to by this gate. Its own ledger was confirmed first: **337 files, head
`0361_reservation_release_advice`**, `0295` at `5196d64d…`.

Seven censuses, each dumped from both databases into a file, ordered by the rendered text on the
server, and diffed line by line:

| census | what it reads | rows | `clara_sweepint` vs `clara_intS6` |
|---|---|---|---|
| **functions** | `p.oid::regprocedure` + `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` for every `clara` body | **1540** | **IDENTICAL, 0 diff lines** |
| **columns** | relation, attname, `format_type`, `attnotnull`, default expression, for `r p v m f` | **4070** | **IDENTICAL** |
| **constraints** | `conrelid::regclass`, `conname`, `pg_get_constraintdef`, `convalidated` | **3122** | **IDENTICAL** |
| **indexes** | `pg_indexes.indexdef` | **957** | **IDENTICAL** |
| **policies** | `pg_policies`: relation, name, permissive, roles, cmd, `qual`, `with_check` | **663** | **IDENTICAL** |
| **grants + posture** | per relation: owner, `relrowsecurity`, `relforcerowsecurity`, `relacl`; per function: owner, `prosecdef`, `provolatile`, `proconfig`, `proacl` | **1884** | **IDENTICAL** |
| **the ledger** | `version` + `checksum`, every row | **337** | **IDENTICAL** |

**Diff 0 on all seven. There is no finding here.**

For orientation against the two earlier gates: wave 4's four censuses at 309 files read 1489 / 4051 /
3103 / 947, and the cut's at 312 read the same four. This wave's 25 migrations take them to 1540 /
4070 / 3122 / 957 — **+51 function bodies, +19 columns, +19 constraints, +10 indexes**.

### 3.1 The cross-lane collided bodies, named

`waveS-merge.md` §0 names the bodies that two lanes write or that a later file pins over an earlier
lane's rewrite. Each is read off both catalogs rather than inferred from the diff being empty:

| body | `sha256(prosrc)`, both databases |
|---|---|
| `clara._obo_plan_core(text,uuid,…,jsonb)` | `bbe338e80dfe0b19f7c4b7af49138982ac37c3282c…` |
| `clara._assert_plan_authority(text,jsonb,uuid,uuid)` | `60f2c5d10378f9fc853e672cc6bc53d662322283c3ed5276e399e87e71ee202b` |
| `clara.create_accounting_plan(uuid,text,…,text)` | `544cd88ecaa5b5237969aff36b1bd0d8a5…` |
| `clara._accrual_plan_core(uuid,uuid,…,jsonb)` | `89d2ac3a33e8dcda53b0f42a6c500a6a9aefd567af5…` |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `1b090889518b8a27f83de3726083d3394c9da98645207622d3150e0cf110e467` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb` |
| `clara._payroll_posting_verdict(uuid)` | `4c350623e41527b717a1fc58e3ee8b772060b895b5353098f8cd21153585dac8` |
| `clara._payroll_entry_plan(uuid,jsonb)` | `a584ced7bf6cbcd4733987b5331648dfebe713693772584122f5374ca3c1a45a` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `a76f8a575c1567d6b3577b9b3de0cb43e22d90fc9097a391da474aae1d844e48` |
| `clara._assert_claim_basis(uuid,jsonb,boolean)` | `d1dff7654eda906324b534d723511ba9d4fd5b091f994a84200680c3fb164ffd` |
| `clara._fa_assert_code_unreserved(uuid,text)` | `d31b5f7eea43ebb7f878a02c0a8d41b1cd0cf7ce90dced6fc59fe774142fcee5` |
| `clara.upsert_fa_account_profile(uuid,text,text,text,text)` | `ee503d3e93d0f9c0cb4fe8e8bfed65e26c3a3927e0c34d2dfaa378e4c9caaf54` |
| `clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)` | `0bd2d0f08cfffe2b9d0d5582253c17a409519bfac3006b49b6ba93480d6e…` |
| `clara._fa_role_claim_conflict(uuid,text,text)` | `55a962ced16fcca28c049435e72367387216efcc7bdd64e291c8e98d4b56d1d5` |

Each value is the same on both databases, and each body exists **exactly once** — no leftover
overload of a widened signature survived the chain.

One reading that could be mistaken for a contradiction and is not: `_obo_plan_core`'s post-chain sha
is `bbe338e8…`, not the `149b4a3d…` the merger's §0 table names. `149b4a3d…` is 0330 §C's
**post-image**, which is what 0338's §0 pins as its **prestate**; 0338 §E then replaces the body, so
the end-of-chain value is a third one. The two numbers describe different moments in the same chain.

---

## 4 · The batteries, under the full 152-gate chain

### 4.1 What "every lane's batteries" resolves to

`git diff --name-only 3bf6aa94d...HEAD -- packages/db/tests` names **87** files; **49** of them are
`.test.mjs` batteries (24 new gate files, 9 fixture or helper modules and a README account for the
rest). Those 49 are the set run here, on the from-scratch database, with every one of
`packages/db/package.json`'s **152** `--import ./tests/*-preintegration-gate.mjs` tokens in front:

```
cd packages/db
PGHOST=127.0.0.1 PGPORT=55707 PGUSER=postgres PGDATABASE=clara_sweepint \
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 \
  node --test --test-concurrency=1 <152 × --import ./tests/*-preintegration-gate.mjs> <49 files>
```

**12:05:22Z → 12:07:37Z, 2 m 15 s, exit 0.**

```
# tests 598
# pass 598
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 135095.2006
```

**598 cells, 598 green, nothing skipped and nothing cancelled.** Not one `# SKIP` marker appears in
the log. This is the merger's 574 (measured at the post-L8 head `cba214203`) plus the 24 L6 adds,
measured once at the complete head instead of in two parts.

The 49, exactly as the diff names them (`tests/` prefix and `.test.mjs` suffix elided):
`accounting-plans`, `accrual-adjustments`, `accrual-list-side-filter`, `accrual-plan-authority-wall`,
`accrual-revenue-side`, `admit-autodraft-task-outcome-disclosure`,
`agent-read-twins-payroll-agreement`, `agreement-contract-acquisition`,
`authority-ref-human-instruction`, `ci-frontier-leg-contract`, `ci-schedule-notify`,
`collation-pin-portability`, `collation-pin-scan`, `depreciation-policy-knowledge`,
`document-capability-registry`, `entry-post-receipts-via-wake-kind-disclosure`,
`fa-particulars-proposal`, `fa-retired-policy-agent-read`, `firm-document-limits-writer`,
`firm-portfolio-pack`, `firm-setup-committed-tin-backfill`, `knowledge-firm-defaults`,
`knowledge-onboarding-promotion`, `payroll-completeness-witness`, `payroll-correction-sentence`,
`payroll-fact-revision`, `payroll-settlement`, `payroll-summary-facts`, `payroll-summary-posting`,
`plan-authority-wall`, `plan-occurrence-reversal-door`, `plan-overlap-template-arm-retired`,
`plan-reversal-posted-basis`, `prepayment-account-reservation`, `prepayment-account-roster`,
`prepayment-close-standing-instruction`, `prepayment-schedule-obo`, `preview-invite`,
`rate-wall-attempts-retention`, `refusal-errcode-partition`, `reservation-release-advice`,
`revenue-recognition-plan-op-key`, `revenue-recognition`, `staff-expense-claim`,
`staff-expense-claim-allocations`, `tenancy-agent-twins`, `wave-b/wb-g-opkeys`,
`wave-b/wb-g-tail`, `work-list`.

Four of the wave's new gate files carry **no battery of their own**, which is a deliberate shape
rather than an omission: `internal-refusal-errcode`, `staff-expense-claim-empty-allocation`,
`staff-expense-claim-label-case` and `work-claim-allocation-count` ship a
`-preintegration-gate.mjs` (and, for the first, a `-fixtures.mjs`) that runs in front of **all 49**
files rather than a battery that runs once. Every one of those gates is in the 152 and therefore ran
598 times over.

### 4.2 The gate chain's own registration, cross-checked

Wave 4's gate A found lanes whose new evaluators were absent from a census that was supposed to carry
them, so the chain's registration is checked here rather than trusted:

| check | result |
|---|---|
| `--import … -preintegration-gate.mjs` tokens in `packages/db/package.json` | **152**, none listed twice |
| `tests/*-preintegration-gate.mjs` files on disk | **152** |
| on disk but not in the chain | **none** |
| in the chain but not on disk | **none** |
| the same token count on the base `3bf6aa94d` | **128** |
| gate files the wave adds | **24** (`git diff --name-status` reads 24 `A`, 0 `M`) |

128 + 24 = 152, and the two sets are equal as sets, not merely equal in size. **Every gate this wave
wrote is registered, and no token points at a file that does not exist.**

### 4.3 `operation-census` and `rig-isolation`

Same database, same 152-gate chain, run separately as the brief asks:

```
# tests 33
# pass 32
# fail 0
# cancelled 0
# skipped 1
```

**12:07:55Z → 12:08:47Z, 52 s, exit 0.** Identical to the merger's §17 reading. The one skip is named
in §5 and is not a gate declining.

### 4.4 Drift, after the batteries

A second `pnpm --filter @clara/db migrate` against the same database after every battery had run:
**`0 new migration(s) applied · 337 total`, exit 0.** The only line worth quoting is the expected one:

```
note: 1 isolation-pinned migration(s) already applied and skipped
      (0057_wave_e_registry_snapshots · repeatable read)
```

---

## 5 · Findings

**No blocker, no major, no minor. Two notes, both of which are a measurement rather than a defect.**

### N1 · NOTE — the fixtures’ documented privilege fallback fires on nine battery files

The battery log carries `[rig-runtime lane notes — <file>]` blocks whose entries read
`seed extraction: clara_runtime lane lacked privilege (permission denied for table
document_extractions) — fixture fell back to root`, and the same for `document_regions`.

Nine of the 49 files emit a block: `accrual-adjustments`, `accrual-plan-authority-wall`,
`accrual-revenue-side`, `admit-autodraft-task-outcome-disclosure`, `authority-ref-human-instruction`,
`fa-retired-policy-agent-read`, `fa-particulars-proposal` (its block is labelled `p933 particulars
proposal`), `plan-occurrence-reversal-door` and `wave-b/wb-g-opkeys`.

This is by design and by construction pre-existing. `packages/db/tests/rig-runtime-helpers.mjs:174-176`
documents it in the source: *"Run a fixture statement under a lane; 42501 falls back to root + a
LANE_NOTE. NEVER use for an assertion (assertions call role/root queries directly)."* The helper's
last commit is `30923867e` (`F-A6 PR-1: the audited freeform read (0131) (#346)`), far below this
wave's base, and `git diff --stat 3bf6aa94d...HEAD -- packages/db/tests/rig-runtime-helpers.mjs` is
empty, so this wave neither wrote the affordance nor changed it. The note means a **fixture** could
not be planted through the runtime lane and was planted as root instead; no assertion was relaxed,
and every cell that fired one still passed. Recorded so that a later reader does not mistake the
volume of these lines for a privilege regression this wave introduced.

### N2 · NOTE — the one skipped cell is the brief's own prohibition, not a gate declining

```
ok 33 - T19 poison-role: reset + re-migrate normalizes a poisoned clara role
        # SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an isolated DB to run
```

`CLARA_RIG_ALLOW_RESET` is one of the two variables the brief forbids this gate to set, so the cell
skipping is the correct outcome, not a gap this gate could have closed. It is the same single skip
the merger's §17 and §14.3 record, so nothing changed here. Closing it would need a database built
for that purpose alone.

---

## 6 · The cluster, dropped

```
sudo -n pg_dropcluster 17 rigsweep --stop
```

exit 0. `pg_lsclusters` afterwards shows **no `rigsweep` and nothing on 55707**. What remains online
is what was online before this gate started and is not this gate's: `main` (down), `rigint` 55720,
`rigl06ac3` 55710, `rigreh` 55730, `rigrt` 55721, `rigw4` 55700, `rigw4c` 55702, `rigw4h` 55701,
`rl01`–`rl10` 55741–55750, and Gate C's `rigsweepc` 55708. **`rigw4h`, `rigw4c` and `rigsweepc` are
Gate B's and Gate C's and this gate never opened a connection to any of them.**

On `rl02` (55742), which this gate read for the census, nothing was written: `clara_intS6` still reads
337 files at `0361` with `0295` at `5196d64d…`, the cluster still holds **20** `clara%` roles, and the
pristine `clara_l02` template is untouched at 312 / `0323`. The seven databases on that cluster
(`clara_l02`, `clara_intS` … `clara_intS6`) are exactly the seven the merger left.

The gate's own artefacts live in the session scratchpad and nowhere in the repository:
`…/scratchpad/gateA/migrate-fromscratch.log`, `batteries.log`, `census-tests.log`, `gates.txt`,
`batteries.txt` and `census/` (the fourteen census dumps plus the SQL that produced them).

---

## 7 · Anything unverified

1. **The census measures structure, not content.** Seed rows, catalogue rows and every other data
   row are outside all seven censuses except the ledger. A wave that changed what `0295`'s chart
   rows say without changing a column would not be caught here; `0295`'s own structural digest is the
   mechanism for that, and it is Gate B's §2 that reads it on a second collation.
2. **Two data-dependent arms could only run empty.** A from-scratch chain has no rows, so `0347`'s
   backfill reported `0 tin item(s) planted … (the prestate counted 0 such plans)` and `0348`'s two
   prune verbs ran against `0 invite_preview_attempts row(s), 0 confirmation_attempts row(s)`. Both
   printed a well-shaped envelope over the empty population and both refused a threshold inside the
   15-minute wall, so the **refusal** arms are driven; the **populated** arms are not, and cannot be,
   on this database. Gate B's populated upgrade path is where that is measured. (`0340`'s `#1052`
   label arm plants its own rows in its tail and IS driven here: `"Ali"` matches `"  ali  "` and is
   refused against `"Ali B"`.)
3. **This gate ran none of Gates B's or C's work**: no upgrade path from 312, no `en_US.UTF-8` twin,
   no browser suite, no static gates (`typecheck`, `lint`, frozen-workflows, dynamic-SQL, pins
   corpus), no web unit suite, no `packages/runtime` suite, no two-build cutover drill and no
   rollback preflight. Nothing in this report speaks to any of them.
4. **The census was taken before the batteries ran** (§Method 3). A structural change made by a
   battery and left behind would not appear in it. The re-run `migrate` in §4.4 is the only
   post-battery structural reading this gate took, and it found the ledger unmoved at 337.
5. **`clara_intS6` is trusted to be the database the merger measured.** Its identity was confirmed
   from its ledger (337 / `0361` / `0295` at `5196d64d…`) and its name against `waveS-merge.md`, not
   from a provenance record inside the database. If a later agent replayed the chain onto that name
   between the merge and this gate, this census would compare against the replay instead — the
   report is dated and the head is named so that can be checked.
6. **The `#867` reused-cluster recipe is untested by this gate**, deliberately: a virgin cluster
   never needs it. Wave 4's gate A is the run that exercised it.
