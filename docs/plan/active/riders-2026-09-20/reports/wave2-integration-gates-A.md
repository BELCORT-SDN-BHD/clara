# Wave 2 riders — integration gate worker A

Worktree `C:\Users\zhant\Desktop\clara-wt\int2`, branch `integration/riders-w2`.
Start head **`8264fa3ee`** (nine lanes merged: 01–08 and 10; lane 09 absent, 0265–0268 free).
**Final head: `0968b5287e82657dbb818dce1437d24c43038a17`**, working tree clean, **7 commits**, all mine.
Never pushed, no PR, no GitHub write. No other worktree and no other cluster was touched.

Headline: the from-scratch chain found **one prestate pin failure** (two lanes, one body family) and the
whole `packages/db` suite found **nine red cells** — one cross-lane collision, eight lane gate misses
that only an integrated catalog exposes. All ten are fixed by re-measuring against the merged tree; no
entry was deleted anywhere. Every gate is green at the final head, and **all 34 new migrations also
apply cleanly on a populated database at the hosted frontier** (no release blocker).

| gate | result |
|---|---|
| from-scratch chain 0001→0272 (263 files) on a fresh cluster | **PASS** after one migration fix |
| `packages/db` whole suite (80-gate chain) | **5367 tests / 5250 pass / 10 fail / 107 skip** → all 10 fixed, re-run **101/101 green** |
| `packages/runtime` unit suite | **2884 / 2844 pass / 2 fail / 38 skip** — both failures are RIG.md's known Windows-only reds |
| `check-frozen-workflows` / `check-parts-parity` | OK / OK |
| `pnpm typecheck` | PASS |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | PASS (exit 0) |
| new runtime test file under WSL as `runner` | **5/5 pass** |
| upgrade path 0234 → 0272 on a seeded database | **PASS**, 34/34, every tail assertion OK |

---

## Step 1 — a fresh disposable cluster for this wave

`/etc/postgresql/17/rigw2` existed as a **stale, empty config directory** (only `conf.d`, dated
Sep 15) from an earlier wave; `pg_lsclusters` listed no such cluster and `/var/lib/postgresql/17`
had no `rigw2` data directory, so it was a leftover, not a live cluster. It was removed before
creating the real one. Ports 55760–55769 were verified free (`ss -ltnp`) first.

```sh
sudo rm -rf /etc/postgresql/17/rigw2
sudo pg_createcluster 17 rigw2 --port=55760          # exit 0
sudo cp /etc/postgresql/17/rl01/pg_hba.conf        /etc/postgresql/17/rigw2/pg_hba.conf
sudo cp /etc/postgresql/17/rl01/conf.d/rig.conf    /etc/postgresql/17/rigw2/conf.d/rig.conf
sudo chown postgres:postgres /etc/postgresql/17/rigw2/pg_hba.conf
sudo pg_ctlcluster 17 rigw2 start                    # exit 0
```

Effective `pg_hba.conf` (identical to `rl01`'s):
`local all all trust` / `host all all 127.0.0.1/32 trust` / `host all all ::1/128 trust`
plus the three replication lines. `conf.d/rig.conf`: `listen_addresses = '127.0.0.1'`,
`max_connections = 200` — the same listen settings the rig's lane clusters carry.

`pg_lsclusters` → `17 rigw2 55760 online postgres /var/lib/postgresql/17/rigw2`.
Server version **17.11 (Ubuntu 17.11-1.pgdg26.04+2)**. The ten lane clusters and 55720/55721/55730
were never contacted.

**The cluster is left running** for the orchestrator's lane-09 re-run.

## Step 2 — the from-scratch chain, and the one prestate pin failure

```sh
psql -h 127.0.0.1 -p 55760 -U postgres -d postgres -c "create database clara_w2"
# from packages/db:
PGHOST=127.0.0.1 PGPORT=55760 PGUSER=postgres PGDATABASE=clara_w2 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node scripts/migrate.mjs
```

**RED at 100s**, rolled back, ledger left at 260 files / `0269_invite_issuer_lapsed_status`:

```
migrate: FAIL — migration 0270_firm_document_limits_writer failed and was rolled back:
  #960 prestate: clara._reserve_document_ingest(uuid,uuid,integer,timestamp with time zone)
  has DRIFTED from its measured pre-image -- this file must not touch it, so re-measure before
  applying (got 32a42ca3de5c3f4de81971530430ceffe4f763eb9ed2b7e215941c8a94e70400)
```

### What it found — two lanes, one body family

0270 (#960, lane 10) pins **nine** bodies it must not touch by `sha256(prosrc)`, measured on lane 10's
own database. **Four** of them are recut EARLIER in merged chain order by **0252** (#964, lane 05 —
the Asia/Kuala_Lumpur ingest window), which lane 10 never had. Measured on the stalled `clara_w2` at
0269 (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')`, the migration's own expression):

| body | lane-10 pin | live in chain order | verdict |
|---|---|---|---|
| `clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)` | `074c9b18…` | `32a42ca3…` | **drifted** (0252) |
| `clara._resize_document_reservation(uuid,uuid,integer)` | `41528b31…` | `865f01a0…` | **drifted** (0252) |
| `clara._settle_document_reservation(uuid,uuid,integer)` | `b72d83e7…` | `c96f43c0…` | **drifted** (0252) |
| `clara.settle_ingest_reservation(uuid,integer,text)` | `a7b8d4ee…` | `0cb7be8f…` | **drifted** (0252) |
| `clara._tf_firm_document_limits_upsert()` | `e07fabd4…` | `e07fabd4…` | unmoved |
| `clara._reserve_processing_call(uuid,integer)` | `a713fa37…` | `a713fa37…` | unmoved |
| `clara._settle_processing_call(uuid,integer)` | `e8b50f0d…` | `e8b50f0d…` | unmoved |
| `clara.claim_document_processing_task(uuid,text,boolean)` | `01e517bf…` | `01e517bf…` | unmoved |
| `clara.get_firm_commercial_state()` | `347141ee…` | `347141ee…` | unmoved |

**This is "a lane measured a non-canonical state", not "two lanes overwrote one body".** 0270 changes
none of these bodies — it only asserts they are unmoved, and its comment claims each keeps its
`coalesce(l.<cap>, <fallback>)` reading off a LEFT JOIN on `clara.firm_document_limits`. That claim
was **re-verified against the post-0252 bodies before the pins moved**: all four still carry
`left join clara.firm_document_limits`, with `coalesce(l.` occurring 2/1/1/1 times respectively. 0252
changes only their calendar-day window. So nothing had to be re-derived from two intents and no
lane's change was dropped — the LATER migration's prestate was corrected to pin what is live in chain
order, which is exactly what the rule prescribes.

0271's three pins (`create_account_set_v1`, `_agent_create_account_set_core`,
`wake_create_account_set`) and 0272's two (`_tf_document_capability_high_water_monotone`,
`_tf_no_truncate`) were checked the same way against the stalled chain **before** re-running: all five
matched, so 0270 was the only file that needed an edit.

**Commit `c51172a27` — `fix(integration): #960's prestate pins the four bodies #964 recut`**
(both the prestate array and the identical tail array, 8 literals; plus a comment block stating the
chain-order reason).

### The authoritative re-run, with the 0154 rule (#867)

Because a migration was edited, the chain was re-run from scratch into a **new** database. A second
from-scratch chain on a cluster that already ran one hits 0154's cluster-wide `clara%` role pin
(14 vs 18), so `packages/db/README.md`'s "From-scratch reapply on a reused cluster (#867)" recipe was
followed exactly:

```sh
drop database clara_w2;  create database clara_w2b;           # the recipe's stated precondition
node scripts/role-census-reset.mjs            # read-only: all four "no shared dependents", → 14 MATCHES
CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs --apply
#   drop role clara_stripe_webhook; clara_stripe_webhook_login; clara_auth_wall; clara_auth_wall_login;
#   "clara% role count is now 14 (0154 pins 14)."
PGDATABASE=clara_w2b node scripts/migrate.mjs
```

→ **`migrate: 263 new migration(s) applied · 263 total · target 127.0.0.1:55760/clara_w2b`**, exit 0,
**120s**. `select count(*), max(version) from clara.schema_migrations` → **263 /
`0272_document_capability_wall_completion`**. `clara%` roles back to **18**, exactly as the recipe
predicts. No CLR raised anywhere in the chain.

Seeded as the rig does (`build-lane.sh`'s `pnpm db:seed`, i.e. `node scripts/seed.mjs` with the same
PG env): `seed: 2 seed file(s) applied` (`0001_smoke_seed.sql`, `0002_core_seed.sql`), **<1s**.

A template clone `clara_w2_rt` was taken immediately after the seed (source had 0 open connections)
for step 4, so the runtime suite ran against an estate copy the db suite had never touched — the same
shape CI's `db-estate-suite` uses for `clara_runtime_ci`.

## Step 3 — the whole `packages/db` suite, the way CI runs it

```sh
# from packages/db, PGDATABASE=clara_w2b, CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
pnpm test        # the package.json "test" script: node --test --test-concurrency=1
                 # + 80 --import ./tests/*-preintegration-gate.mjs + "tests/**/*.test.mjs"
```

```
# tests 5367   # pass 5250   # fail 10   # skipped 107
# duration_ms 1105345.1765     (18m25s)      DBTEST_EXIT=1
```

`CLARA_ESTATE_REUSED_DB` was **not** set and was not needed: `clara_w2b` is a genuinely fresh
database on a fresh cluster. **All four of wave 1's contamination reds are gone** (the
`f-a5b-sandbox-export-pr1` 56-failure drift, `f-t1-sst-reference`, `delta-contract`'s deployed count,
`x41-round35-tie`) — they were artefacts of the long-lived `clara_int`, as wave 1's worker A
suspected, and a fresh cluster proves it.

Chain/roster pre-checks on the merged tree, for the record: **80** `--import` gate tokens, each
exactly once, and **80** `*-preintegration-gate.mjs` files on disk; **263** migration files, no
duplicated 4-digit prefix; `rig-meta.mjs` loads (104 exports); `en.json` **5964** leaf keys;
`manifest.txt` **501** path lines — every figure matches the merger's record.

### The ten reds, classified

`not ok 1976` is the file-level rollup of `firm-document-limits-writer.test.mjs`, so there are **nine
distinct cells**. None is (a) a known Windows-only red and none is (b) a flake — every one is
deterministic, caused by a catalog fact, and re-measuring fixed it. Seven of the nine are **(d) a real
defect inside one lane that its own gates missed**, one is **(c) an integration collision**, and one
is (d) reported against four lanes at once.

Why so many (d)s: the census files involved (`f-a9-pr-1b`, `firm-portfolio-pack`, `wb-0019-ratchet`,
`x42-s5-helpers`, `x56-rest-c`) were **not touched by any wave-2 lane** — verified with
`git log 17b9e2368...HEAD -- <file>` (empty for all five) — and rule 8 only requires a lane to run the
files it touched. A lane that recuts a body therefore never meets the estate-wide census that pins it.

---

**1. (c) `#960 cell 9` — `firm-document-limits-writer.test.mjs:392`**

The test-side twin of the step-2 migration failure: the same nine pins, the same four stale values.

```
clara._reserve_document_ingest(...) MOVED -- 0270 must not touch a body that enforces a cap
+ '32a42ca3…'   - '074c9b18…'
```

A genuine **collision**: lane 10 was green alone (no 0252 on its database) and lane 05 was green alone
(this battery skips behind its own 0270 gate there). Red only together.

*Fix* — re-measure the four, flat rather than two-generation, because this battery gates on 0270 and
no chain can carry 0270 without 0252 (0252 is lower in the same ordered chain). The non-vacuity probe
against a body 0270 *did* write is untouched, and the other five pins keep lane 10's values.
**Commit `c32ff67bf`.**

**2. (d, lane 10 / #960) `[gate 7]` — `f-a9-pr-1b.test.mjs:415`**

A closed-world census of every `clara` function whose body names `pages_per_day`, written so a new
name must be classified out loud. 0270 adds two and classified neither:

```
+ '_firm_document_limit_ceiling, …, set_firm_document_limits, …'
- '_reserve_document_ingest, _resize_document_reservation, _settle_document_reservation,
   _tf_firm_document_limits_upsert, get_firm_commercial_state, settle_ingest_reservation'
```

*Fix* — widen with the classification beside each name, exactly as #635 widened it once before:
`set_firm_document_limits` reads `pages_per_day` as a column it **sets** and reports on its receipt
(it refuses nothing on consumption, raises no CLR18 against a day's usage, and no ingest path calls
it); `_firm_document_limit_ceiling(text)` answers the **estate's** maximum for a cap name
(10000/100000/16/16), is granted to nobody, and bounds what a firm may SET, never what it may
CONSUME. Gate 6's KEPT family is unchanged. Pinned in the post-0270 generation only (selected on
`^0270_`), so the census stays exact below 0270. **Commit `ee880759c`.**

**3. (d ×2, lanes 07 and 08) `p659.portfolio.no_recut` — `firm-portfolio-pack.test.mjs:714`**

Five bodies pinned to prove 0231 recut nothing; two were later recut, in scope:

| body | pinned | live | by |
|---|---|---|---|
| `clara.list_review_queue(jsonb,jsonb,int)` | `29deb82d…` | `1641f99f…` | #974, 0260, lane 07 |
| `clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)` | `dec4bc22…` | `02a7f720…` | #840 (0262) then #861 (0264), lane 08 |

(The other three — `list_accounting_work`, `get_client_work_pack`, `_work_run_attempts` — are
unmoved.) A trap worth recording: 0260's own notice prints `5b666500… -> eb54cb8a…`, which is a
`sha256(pg_get_functiondef(...))`, **not** a `prosrc` hash; the `prosrc` value after 0260 is
`1641f99f…`. Comparing those two numbers is a false lead.

*Fix* — both pinned in BOTH generations, selected on `^0260_` and `^0264_`, the shape
`intake-batch.test.mjs` already uses for #964's window recut, so the cell stays true below them.
Message updated to name the two tolerated recuts. **Commit `633c5c016`.**

**4. (d, lane 01 / #914) `[R1-5]` — `wave-b/wb-0019-ratchet.test.mjs:441`**

The ordered lock-acquisition chain of `clara.approve_wrong_client_correction`. 0238 deliberately moves
one link: the door was the only one in the estate that took a `clara.clients` ROW before the client
advisory rung 203005004, and 0238 moves the **row down** below the rung rather than hoisting the rung
(which 0037 SECTION K forbids — this door and `clara.reverse_entry` must take a pre-existing
`journal_entries` row before 203005004, because `clara._approve_entry_core` does). Measured on the
merged chain (normalized offsets):

```
filing_corrections 1197 → document_filings 2946 → CLR19 3205
→ `for update of je` 3400 → rung 203005004 4799 → clara.clients row 5238 → retirement UPDATE 10693
```

so the client row now follows the entry locks, and the ordered walk failed at that link.

*Fix* — re-measured, not relaxed: all six links still present and ordered, and the hazard the cell
exists for (a client lock hoisted **above** the filing lock) is still refused, because the client row
still sits after both filing locks. The pre-0238 order is kept beside the new one and selected on
`^0238_`. `retire_document_filing`'s chain is untouched. The rung's own position is proven by
`correction-client-rung-order.test.mjs` and by 0238's tail, not restated here. **Commit `432d49ffe`.**

**5. (d ×5, lanes 01/03/05/06) the four S5.25 clock cells — `x42b2-r7-s5-census.test.mjs`,
`x42b2-r7-s5-clock.test.mjs`, `x42b2-s5c-clock.test.mjs`**

Four cells, one shared data module (`x42-s5-helpers.mjs`), five un-rostered names.

*Arm (B), the Asia/Kuala_Lumpur duplication roster* — **one** name missing,
`settle_ingest_reservation` (#964, 0252, lane 05). 0252 moved the ingest ceiling to an MYT day in
FOUR bodies; the lane rostered the three helpers and missed the door its own tail calls "the fourth
shipped door on the same ceiling".

*Arm (D), the lawful bare-clock-token roster* — **four** names, from four different lanes, each
measured on the integrated chain and each a STAMP rather than a date derived from the session clock:

| name | migration / ticket / lane | the token |
|---|---|---|
| `_lock_document_binding` | 0235 / #1014 / 01 | `claimed_at = now()` (the body carried no clock token at all at 0197, where it was born) |
| `_tf_document_capabilities_high_water_record` | 0244 / #846 / 03 | `recorded_at = now()` on an append-only watermark row |
| `create_document_intake` | 0254 / #965 / 05 | `v_at := now()` on the committed CLR18 refusal record |
| `dismiss_firm_setup_tip` | 0259 / #935 / 06 | `answered_at = now(), updated_at = now()` |

*Fix* — one stem-gated cohort per migration (never number-gated, for the reason the file's own
`:207-214` comment gives), each with its adjudication written out. Nothing removed from either
roster. **Commit `e9dab6922`.**

**6. (d, lane 01 / #984) `A19g the HOW` — `x56-rest-c.test.mjs:289`**

The cell scans every migration file for a from-scratch `create or replace function
clara.approve_opening_seed` and requires zero hits, because a from-file rewrite can silently drop an
arm an intervening migration added. `0239_opening_balance_work.sql` has one.

This one deserved a decision rather than a re-measure reflex. 0239 restates the whole body on purpose:
`create or replace function` drops every SET clause it does not repeat, and this door carries 0171's
`default_transaction_isolation = serializable` pin beside its `search_path`. And it buys the cell's
guarantee back **structurally** — its prestate §A.5 pins the live `prosrc` sha256 of the door at the
exact body the file was generated from
(`f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132`, with a redo arm that accepts only
#984's own result), so any intervening recut makes 0239 refuse with CLR10 instead of overwriting it;
its tail then re-reads the live body for the per-entry approval, the tie assertion and the op receipt.

*Fix* — admit that one file by name through a `DECLARED_FROM_FILE_RECUTS` list, with the reasoning in
the cell; any other hit is still the defect the cell was written for. The three live-catalog
assertions below the scan are unchanged and pass (`_assert_seed_matches_prior_pin`,
`correction_draft_present`, `_assert_opening_tie` all measured present in the live body).
**Commit `0968b5287`.**

**Note on RIG.md's known reds.** `x56-rest-c` is listed as a known Windows-only red (#707, "shells out
to grep"), but A19g now does the scan **in process** (`readdirSync`/`readFileSync`; the cell's own
comment says so), and nothing else in that file reddened. So #707 did not manifest on this run and
this failure was a real one, not the listed exception. The Defender/EICAR skip and the `pg_dump`
absence appeared only in the runtime suite (step 4), where RIG.md places them.

### Non-vacuity

These are re-measures of existing structural cells, not new cells, so the vacuity control is the
**recorded RED itself**: each cell demonstrably fails when its expected value does not match the live
catalog (the run above is that demonstration, with the exact diff for each), and passes after the
value is corrected. `#960 cell 9` additionally keeps its own built-in non-vacuity probe (the same
`sha256` probe must *disagree* for a body 0270 did write), which still passes.

### Re-run of everything touched

```sh
# from packages/db, PGDATABASE=clara_w2b, full 80-gate chain
node --test --test-concurrency=1 $GATES \
  tests/f-a9-pr-1b.test.mjs tests/firm-document-limits-writer.test.mjs \
  tests/firm-portfolio-pack.test.mjs tests/wave-b/wb-0019-ratchet.test.mjs \
  tests/x42b2-r7-s5-census.test.mjs tests/x42b2-r7-s5-clock.test.mjs \
  tests/x42b2-s5c-clock.test.mjs tests/x56-rest-c.test.mjs \
  tests/operation-census.test.mjs tests/rig-isolation.test.mjs
```

**`# tests 101 · pass 100 · fail 0 · skipped 1`, 43s.** Every one of the nine previously-red cells is
`ok`. The single skip is the documented destructive cell (`T19 poison-role … set
CLARA_RIG_ALLOW_RESET=1 on an isolated DB`), which the work order forbids enabling.
Rule 8's two named gates are green: `opcen.1`–`opcen.10` all `ok`, and `rig-isolation`
`T1/T2/T3/T6/T10a/T10b/T10b-AC2` all `ok` (no World is bootstrapped on this database, so #866 does
not bite).

Skip census for the full run (107): 39 destructive `CLARA_RIG_ALLOW_RESET` cells, 26 "retired with
F-A2 PR-3" cells with no subject left, 12 `ensureReady() found no draft_entry` (a fresh migrate+seed
estate has no draft entry — the same shape CI's own fresh chain has), 8 dormant Wave-D-b AF-2
bank-substrate cells, and the remainder single gated cells. No skip hides a wave-2 change.

## Step 4 — runtime, typecheck, lint, and the Linux leg

**Runtime unit suite, the way CI's `db-estate-suite` runs it** — `PG*` only (no
`WORKFLOW_POSTGRES_URL`), `CLARA_RIG_DB=1`, against `clara_w2_rt`, the template copy of the migrated
and seeded estate (CI uses `clara_runtime_ci` the same way):

```sh
PGHOST=127.0.0.1 PGPORT=55760 PGUSER=postgres PGDATABASE=clara_w2_rt CLARA_RIG_DB=1 \
  pnpm --filter @clara/runtime --if-present test
```

```
# tests 2884   # pass 2844   # fail 2   # skipped 38   # duration_ms 312104.7574   (313s)
```

Both failures are **(a) known Windows-only reds named in RIG.md**, not fixed:

1. `intake-unit.test.mjs` — "scanner rejects EICAR, encrypted PDF, and XML entity expansion": the
   Defender/EICAR quarantine. The sibling cell that SKIPS with the explicit win32 reason passes.
2. `pg-tools-fixture.test.mjs` — "(#806) this host's OWN probe: pg_dump/psql are on PATH here": no
   `pg_dump` on the Windows PATH. 11 further cells skip for the same reason, counted.

**Wave 1's two non-Windows runtime reds did not recur**: `ready.test.mjs`'s `checks.pools` flake (it
was host contention) and `rollback-preflight.test.mjs`'s `censusUnboundTasks` over-count (it needed a
backlog of queued `document_processing_tasks`, which a fresh estate copy does not have). The
`rollback-preflight` gap wave 1 diagnosed in `packages/runtime/lib/rollback-preflight.mjs:405-413` is
**still latent and still unticketed** — this run simply could not expose it.

Other skips, all matching CI's own shape on this job: 20 "the WDK world … is absent from this
database" (no World bootstrapped), 4 "needs … PGDATABASE in {clara_rt_test, clara_wave_b_ci}"
(including `body-census-guard-db.test.mjs`, which skips in CI's `clara_runtime_ci` for the same
reason — the database was deliberately NOT named `clara_rt_test`, to keep the run faithful), and 2
"no `.output/`" (CI's `db-estate` job has no build step either).

**Static gates**, from the worktree root, re-run at the final head after every edit:

| command | result | duration |
|---|---|---|
| `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files append-only vs `origin/main`, 55 `"use workflow"` modules frozen+registered, 3 retired entries | 1s |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable at this commit | 1s |
| `pnpm typecheck` | **PASS** — `apps/web` Done, `packages/runtime` Done | 5s |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **PASS**, exit 0 across the workspace | 39s |

**New runtime test files** — `git diff --name-only 17b9e2368...HEAD -- packages/runtime/tests` lists
four: `intake-refusal-unit.test.mjs` (**added**), `intake-batch-e2e.mjs`,
`document-facts-validation-db.test.mjs`, `reconcile-fa.test.mjs` (**modified**). Only the first needs
no database (it drives `spool.mjs`'s `readIntakeMeta` against a temp `CLARA_SPOOL_DIR`); the other
three are DB integration / e2e files and were therefore not run under WSL. The Linux leg, as the
unprivileged runner:

```sh
wsl -- sudo -u runner bash -c 'cd /mnt/c/.../packages/runtime && /opt/node/bin/node --test tests/intake-refusal-unit.test.mjs'
# tests 5   # pass 5   # fail 0   # skipped 0   # duration_ms 1335.15
```

It sets `CLARA_SPOOL_DIR` to a per-run temporary directory itself, so RIG.md's `/data/spool` hazard
does not apply to it.

`apps/web` unit and browser suites were **not run** — worker B's scope, by instruction.

## Step 5 — the upgrade path hosted will actually take

Because the 0154 role pin forbids a second from-scratch chain on a cluster that still carries one,
the #867 recipe was run again first, and `clara_w2b`/`clara_w2_rt` were dropped as its stated
precondition (their evidence is above; nothing further needed them).

```sh
# terminate + drop clara_w2b, clara_w2_rt        → "remaining clara dbs: (none)"
node scripts/role-census-reset.mjs               # all four "no shared dependents", → 14 MATCHES
CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs --apply    # → clara% = 14

create database clara_w2_hosted
PGDATABASE=clara_w2_hosted CLARA_MIGRATIONS_DIR=<tmp copy of migrations, 0001..0234 only, 229 files> \
  node scripts/migrate.mjs                       # 229 new · 229 total, exit 0, 103s
PGDATABASE=clara_w2_hosted node scripts/seed.mjs # 2 seed files, exit 0

create database clara_w2_upg template clara_w2_hosted     # 0 open connections to the source
#   frontier before: schema_migrations 229 / 0234_legal_enforcement_mode
#   seeded rows before: {"firms":2,"clients":3,"users":6}
PGDATABASE=clara_w2_upg node scripts/migrate.mjs # FULL migrations dir
```

**`migrate: 34 new migration(s) applied · 263 total · target 127.0.0.1:55760/clara_w2_upg`, exit 0,
6s.** All 34 `applied …` lines present, 0235 → 0272 in order, **no CLR raised and no rolled-back
migration**. Every prestate and every tail assertion passed on a database that already holds seeded
rows — including the ones that actually *read* those rows, e.g. 0244's high-water mark
"backfilled TOTAL over the live registry at version 2" and 0272's proof "against the live tables
(240 marks, registry at version 3)". Final ledger: **263 / `0272_document_capability_wall_completion`**.

**No release blocker.** Cross-check: all nine `#960` pinned bodies and all five `p659` pinned bodies
read **byte-identical shas on the upgraded database and on the from-scratch database** — the upgrade
path and the from-scratch path converge exactly. And the six repaired cells were re-run against a
throwaway clone of the upgraded database with the full gate chain: **`# tests 68 · pass 68 · fail 0 ·
skipped 0`, 14s** (the clone was dropped afterwards).

## Commits

| sha | subject |
|---|---|
| `c51172a27` | fix(integration): #960's prestate pins the four bodies #964 recut |
| `c32ff67bf` | fix(integration): #960 cell 9 pins the four bodies #964 recut |
| `633c5c016` | fix(integration): #659's no-recut census admits #974's and #861's recuts |
| `ee880759c` | fix(integration): gate 7's pages_per_day census classifies #960's bodies |
| `432d49ffe` | fix(integration): the 0019 ratchet re-measures #914's acquisition order |
| `e9dab6922` | fix(integration): the S5.25 clock rosters take wave 2's five new names |
| `0968b5287` | fix(integration): A19g admits #984's sha-pinned regeneration of the seed door |

Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; each was staged
with explicit paths. `git diff --stat 8264fa3ee..HEAD -- packages/db/migrations` is exactly one file,
`0270_firm_document_limits_writer.sql` (+19 −8); everything else is under `packages/db/tests`.

## What I left behind

**Cluster `17/rigw2`, port 55760, ONLINE** — keep it; the orchestrator re-uses it when lane 09 lands.
Trust `pg_hba`, `listen_addresses = '127.0.0.1'`, `max_connections = 200`. `clara%` roles: **18**.

| database | state |
|---|---|
| `clara_w2_hosted` | 229 files / `0234_legal_enforcement_mode`, seeded — the hosted-frontier base; clone it with `createdb -T` to redo an upgrade rehearsal without a second chain |
| `clara_w2_upg` | 263 files / `0272_…`, seeded, built by the upgrade path — untouched by any test run |

Dropped by me: `clara_w2` (the stalled first attempt), `clara_w2b` (the from-scratch proof),
`clara_w2_rt` (the runtime clone), `clara_w2_upgchk` (the throwaway re-run clone).

**For the lane-09 re-run:** a further from-scratch chain on this cluster needs the #867 recipe again —
drop every `clara%` database first, then `CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs
--apply` (it refuses while any database still holds a grant for the four roles), then migrate.
Lane 09's 0265–0268 will land *between* 0264 and 0269, so **every wave-2 prestate pin at 0269 and
above must be re-checked against the chain with lane 09 in it** — 0269, 0270 (whose four pins I have
already moved once), 0271 and 0272. Expect the same class of finding if lane 09 recuts a body any of
those four files pin, and expect the five S5.25 roster cohorts and the two `pages_per_day` /
`no_recut` censuses to need the same widening treatment if lane 09 adds a clock stamp or recuts a
pinned read.

## Unverified / not run

- `apps/web` unit and browser suites — worker B's, by instruction.
- The `packages/runtime` **build** and the post-build gates (`check-worker-paths.mjs`,
  `check-workflow-bundle.mjs`) — not in this task's list; consequently 2 runtime cells skipped for
  "no `.output/`", exactly as they do in CI's `db-estate` job.
- CI's `render-drill` (needs a Linux Docker build) and `storage-policy-battery` — not attempted.
- The `db-live-gates` e2e legs and the DR round-trip — not in this task's list, not attempted, not
  claimed either way.
- `packages/reporting-render`'s own `check`/`test` (part of CI's lint job but not of the root
  `pnpm lint` script) — not run this time.
- The latent `rollback-preflight.mjs` `censusUnboundTasks` scoping gap wave 1 diagnosed: still
  unfixed and, as far as I can see, still unticketed. A fresh estate cannot expose it.
- Whether lane 09's 0265–0268 disturb any pin above them — untested by construction; lane 09 is not
  in this branch.
- Pre-existing prose drift the merger already flagged (`packages/db/tests/README.md:23` says "the 29
  `--import` flags"; there are 80). Prose, not a pin; left alone.
