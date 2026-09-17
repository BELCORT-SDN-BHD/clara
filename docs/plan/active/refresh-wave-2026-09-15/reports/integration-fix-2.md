# Wave 2026-09-15 integration — fix round 2

Branch `integration/wave-2026-09-15`, worktree `C:\Users\zhant\Desktop\clara-wt\int`.
In at **`2b30ddf2`**, out at **`2b30ddf2`** — **no commit, no repo change, no file edited**.
Working tree clean. Nothing pushed, no PR, no ticket worktree touched, no migration file edited,
no frozen file edited, no census widened. Rig `rigint` `127.0.0.1:55600` / `clara_int`, 204
migrations, PG 17.11; `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` never set.
Every number below is **LOCAL**. **Hosted evidence: none.**

Six failures were handed over. **Four are RESOLVED with real green test results** (they were an
environment gap standing in front of a second, hidden env-shape defect — both are the rig's,
neither is code). **Two are NAMED**: one pre-existing non-wave red whose cause is now *proven* by a
single-variable control, and #693.

**No failure in this batch is a merge artefact and none is a defect in any of the twelve branches.**

---

## 1 · Verdict table

| # | Failure | Verdict | Evidence |
|---|---|---|---|
| 1 | `delta-contract` subtest 18 — `8 !== 7` | **NAMED — pre-existing, cause PROVEN** by a single-variable control. Not fixed; ready-made patch in §6 (a) | §2 |
| 2 | `leader-state.test.mjs` — `pg_dump ENOENT` | **RESOLVED.** Environment closed; file now **4 tests / 4 pass / 0 fail** on this branch | §3, §4 |
| 3 | `relay-taxonomy.test.mjs` — `pg_dump ENOENT` | **RESOLVED.** **5 / 5 / 0** | §3, §4 |
| 4 | `fs7-v17-chatturn-db` `report-tools` — `pg_dump ENOENT` | **RESOLVED.** File is **2 / 2 / 0** | §3, §4 |
| 5 | `fs7-v17-chatturn-db` `close-stop` — `pg_dump ENOENT` | **RESOLVED.** Same run | §3, §4 |
| 6 | `intake-unit` scanner / EICAR | **NAMED — #693**, reproduced and characterised; excluded by RIG.md | §5 |

---

## 2 · Failure 1 — `delta-contract`: pre-existing, and now proven to be exactly one row

### Reproduced

`tests/delta-contract.test.mjs` alone against `clara_int`, with the exact 39 preintegration-gate
flags from `packages/db/package.json`:

```
# tests 60   # pass 58   # fail 2   # skipped 0   # duration_ms 69415
not ok 18 - freeze verifier positively reads registered live bodies, deployment count exact for either witness shape
  location: packages/db/tests/delta-catalog-phase.mjs:633:9
  error:    {"ok":true,"verified_deployed":8,"verified_registered":8}
            8 !== 7
  stack:    delta-catalog-phase.mjs:654:10
not ok 1  - delta contract requires a fresh disposable DB ...   (the wrapper)
```

Identical to the handover. Round 1's §5.2 diagnosis is confirmed, and the causal chain is now
closed end to end.

### Cause — measured, four links

1. **The live catalog.** `clara.evaluator_versions` on `clara_int` holds **8** rows, all
   `firm_id is null`, **all `deployed = true`**, including `prepayment_schedule` v1.
   `clara.verify_evaluator_freeze()` → `{"ok":true,"verified_deployed":8,"verified_registered":8}`.
2. **The cell's formula excludes exactly that row.** `delta-catalog-phase.mjs:652-654` asserts
   `verified_deployed = fresh ? 0 : 5 + fsPackDeployed + card1V2Deployed`. `evaluate_fs_pack_agent`'s
   and card 1 `evaluate_metric` v2's flags are *read from the catalog*; `prepayment_schedule` v1's is
   *assumed dark* ("it ships DARK until PR-2b", the comment at `:646-651`). Here `5 + 1 + 1 = 7`
   against a real 8.
3. **Who deploys it.** `packages/db/tests/f-a5b-sandbox-export-pr1.test.mjs:123-126`
   (`ensureEvaluatorDeployed()`, called at `:184`) runs
   `update clara.evaluator_versions set deployed = true where not deployed and evaluator_name <> 'evaluate_fs_pack_agent'`
   — it honours the **first** of the three exclusions `delta-contract.test.mjs` itself declares
   (`CEREMONY_EXCLUDED`, `CEREMONY_EXCLUDED_V2`, `CEREMONY_EXCLUDED_V3` / `EXCLUDED_PAIRS_SQL`,
   `delta-contract.test.mjs:16-29`) and blanket-deploys the other two. Card 1 v2's collision is
   absorbed because the cell reads that flag directly; `prepayment_schedule` v1's is not.
   `0060`'s `_tf_evaluator_deploy_once` makes the flip **one-way and permanent**, so it survives on
   any shared database. In a whole-estate run `delta-contract` sorts *before* `f-a5b` (`d` < `f`),
   so run 1 on a fresh DB is green and every later run against that same DB is red.
4. **None of it belongs to this wave.** `prepayment_schedule` v1 is registered by
   `packages/db/migrations/0140_f_a4_pr_2a_prepayment_limb.sql:1184` — 59 migrations below this
   wave's first file. `grep 'deployed' packages/db/migrations/0199…0209` matches **one line**,
   `0208_prepayment_amortisation.sql:35`, **a comment**. And `git diff --stat origin/main..HEAD` is
   **empty** for `delta-catalog-phase.mjs`, `delta-contract.test.mjs`, `delta-fixtures.mjs` and
   `f-a5b-sandbox-export-pr1.test.mjs`.

### The control — one variable, decisive

Round 1 could argue the cause; this round measured it. On a **disposable clone** of `clara_int`
(`clara_delta_cf_test`, made with `CREATE DATABASE` + `pg_dump | psql` — **never** a second
from-scratch chain, so DECISIONS §3.3 (3) and 0154's cluster-global role census are untouched),
exactly one thing was changed: `prepayment_schedule` v1's `deployed` flag, flipped false with the
one-way trigger momentarily disabled **on the clone only**.

| clone state | `verify_evaluator_freeze()` | `delta-contract.test.mjs` |
|---|---|---|
| as cloned (8 deployed) | `{"ok":true,"verified_deployed":8,"verified_registered":8}` | (identical to `clara_int`: 58/2) |
| `prepayment_schedule` v1 un-deployed | `{"ok":true,"verified_deployed":7,"verified_registered":8}` | **60 tests / 60 pass / 0 fail / exit 0** |

`fresh` is unaffected by the flip — `evaluatorCeremonyUnwitnessed()` (`delta-fixtures.mjs:133-137`)
reads only `DELTA_CEREMONY_COVERED`, which does not contain `prepayment_schedule` — so the control
moves the deployment census and nothing else. **That single row is the whole failure**, and the
other 59 assertions in the file hold on the merged chain. The clone was dropped; `clara_int` still
reads `{"ok":true,"verified_deployed":8,"verified_registered":8}` at 204 migrations.

### Why it is NOT fixed here

It is a pre-existing red owned by no wave ticket, it reproduces from byte-identical `origin/main`
files, and **CI never sees it** — `.github/workflows/ci.yml` runs against a fresh `clara_ci` each
time, which is the green first-run shape. Editing a file no branch owns, on an integration branch
whose job is to merge twelve tickets, is the wrong place for it. §6 (a) carries the exact patch so
the call costs the orchestrator a minute.

---

## 3 · Failures 2–5 — `pg_dump ENOENT` was TWO gaps, one hiding the other

### 3.1 · Gap A — no Windows PostgreSQL client (confirmed, then CLOSED)

Re-measured on this host: `Get-Command pg_dump` and `Get-Command psql` both return nothing;
`C:\Program Files\PostgreSQL\16\bin` **is on `PATH` but does not exist** (the `16` directory holds
only `data`). WSL has `pg_dump 17.11` and `psql 18.6`, unreachable from Windows Node.

**The obvious workaround does not work, and this is new.** `migrate-harness.mjs:144,152` already
has the seam — `process.env.PG_DUMP || "pg_dump"`, `process.env.PSQL || "psql"` — so a `.cmd`
forwarding to `wsl pg_dump` looks like a free fix. It is not: Node 22.23.2's `spawnSync` refuses a
`.bat`/`.cmd` without `shell: true` (the CVE-2024-27980 hardening). Measured:

```
spawnSync <scratch>\pgbin\shimtest.cmd ['--no-comments','--file','C:/tmp/x.sql']
  → error: spawnSync ...\shimtest.cmd EINVAL     status: null
```

The seam therefore needs a **native Windows `.exe`**, so one was installed: the official EDB
Windows x64 binaries for **PostgreSQL 17.11**, exactly matching the 17.11 server
(`postgresql-17.11-1-windows-x64-binaries.zip`, 340,719,294 bytes), extracted and placed at

```
C:\Users\zhant\AppData\Local\clara-rig\pg17\bin\      (76 MB: pg_dump.exe + psql.exe + their DLLs)
```

Verified against the rig: `pg_dump (PostgreSQL) 17.11`, `psql (PostgreSQL) 17.11`, a live
`select current_database()` on `clara_int`, and a real `pg_dump --schema-only`. Nothing in the repo
changed; nothing in a system directory changed. Use it with:

```
export PG_DUMP="/c/Users/zhant/AppData/Local/clara-rig/pg17/bin/pg_dump.exe"
export PSQL="/c/Users/zhant/AppData/Local/clara-rig/pg17/bin/psql.exe"
```

### 3.2 · Gap B — the rig env line itself breaks every clone-based runtime test

With `pg_dump` present the three files finally ran — and **all three failed again**, on something
the `ENOENT` crash had been hiding:

```
DB target split: WORKFLOW_POSTGRES_URL (127.0.0.1:55600/clara_leader_state_mu50eto4_a5a91a)
              != PG* (127.0.0.1:55600/postgres).
The relay must resolve exactly ONE target — unset the conflicting source. Refusing.
```

leader-state **0/4**, relay-taxonomy **0/5**, fs7-v17-chatturn-db **0/2** — every failure carrying
that message. The mechanism, read off the source:

* `setDatabaseEnv()` (`migrate-harness.mjs:45-71`) rewrites the DSN var and then **deletes
  `PGDATABASE`** (`:62`, `:67`) — deliberately, to remove a phantom PG* source.
* `packages/runtime/lib/relay.mjs:101-108` builds its PG* target as
  `db: PGDATABASE || PGUSER || "postgres"`. With `PGDATABASE` gone and `PGUSER=postgres` present,
  PG* resolves to the database **`postgres`**.
* `relay.mjs:118-134` then sees two live sources disagreeing and refuses.

So setting **both** a DSN URL and `PG*` — which is what my work order's rig line does
(`PGHOST/PGPORT/PGUSER/PGDATABASE …` plus `WORKFLOW_POSTGRES_URL=…`) — makes every file that calls
`setDatabaseEnv()` fail closed. **CI does not do this**: `.github/workflows/ci.yml:254-257` sets
`PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` and **no DSN var at all**, which is also exactly what
RIG.md's own "Env for every db command/test" line says. The URL is the non-canonical addition.

Re-run with **PG*-only** (`unset DATABASE_URL WORKFLOW_POSTGRES_URL`), same rig, same branch, same
`clara_int` source: all three green (§4).

---

## 4 · The three previously-dark files, now measured on the integration branch

These files had **never executed a single subtest** on this host. They do now, and they pass.

```
packages/runtime/tests/leader-state.test.mjs        4 tests / 4 pass / 0 fail / 0 skip / 35.1 s
  ok 1 - #617 leader state: acquire -> a real backend kill -> RE-acquire, with reconnects moving
  ok 2 - #617 leader state: a taxonomy HALT is recorded BEFORE onHalt runs, and reads ok:false
  ok 3 - #617: a consumer health query that THROWS yields an explicit unavailable ENTRY, never a missing key
  ok 4 - #617 leader state: /ready reports the halt as a WARNING and never as a new 503

packages/runtime/tests/relay-taxonomy.test.mjs      5 tests / 5 pass / 0 fail / 0 skip / ~31 s
  ok 1 - (c) zero active pointer: relay HALTS, no advance, no dead-letters; restore drains
  ok 2 - (X5) redrive: missing dead-letter throws; still-uncovered reopens a resolved row
  ok 3 - #1 (round-6, Codex): redrive() takes the SAME wake_coalesce advisory lock wake-engine.mjs's own checkpoint-writer does
  ok 4 - (f) uncovered => dead-letter, redrive after coverage; flip stamps one version per batch
  ok 5 - SHOULD C: an idempotent re-redrive of an already-drained event does NOT rewind the wake_engine checkpoint a second time

packages/runtime/tests/fs7-v17-chatturn-db.test.mjs 2 tests / 2 pass / 0 fail / 0 skip / 36.7 s
  ok 1 - fs7.v17.db.report-tools: open, assess and seal each reach their live interactive wrapper
  ok 2 - fs7.v17.db.close-stop: a chat-mintable client credential remains task-unbound after the allowlist wall is removed
```

Each one cloned the **merged 204-migration estate** (`cloneAmbientDatabase` →
`assertCloneIsPopulated` against the `clara._append_event(...)` witness) into its own disposable
database and dropped it afterwards. This is the first evidence in the wave that the
leader / relay / chat-turn-DB spine survives the merge. It is also cheap to believe:
`git diff --name-only origin/main..HEAD -- packages/runtime` touches **no** leader, relay, health or
readiness file (only `README.md`, the five new `lib/*` basis modules, `src/workRoutes.ts`,
`scripts/parts-parity-exemptions.mjs` and ticket test files), and all three test files are
byte-identical to `origin/main`.

---

## 5 · Failure 6 — EICAR / #693, reproduced and characterised, untouched

`packages/runtime/tests/intake-unit.test.mjs`: **17 tests / 16 pass / 1 fail / 0 skip.**

```
not ok 3 - scanner rejects EICAR, encrypted PDF, and XML entity expansion
ok   4 - (#693) a quarantined EICAR fixture on win32 SKIPS with the explicit reason
ok   5 - (#693) positive control: the cell RUNS when the fixture survives, and on every non-Windows platform
```

The two cells that pin #693's *decision* are green — the skip logic is not what is broken. What
loses is the **race**: `eicarSkipForThisHost()` (`tests/eicar-fixture.mjs:80-83`) probes **once**, at
module load, by writing an EICAR file and immediately `access()`-ing it (`probeEicarSurvives`,
`:52-71`). Defender's real-time protection is asynchronous, so the probe can win (→ `probeSurvived`
true → no skip) while the *cell's own* fixture, written seconds later, is eaten before `scanFile()`
opens it — hence `UNKNOWN: unknown error, open '…\eicar.bin'` surfacing as a failed
`assert.rejects` instead of the intended skip. Windows-only, pre-existing, named by RIG.md under
"Known Windows-only pre-existing reds you may ignore and must NOT fix", and the file is
byte-identical to `origin/main`. **Not touched.**

---

## 6 · Follow-ups this round found

**(a) `delta-contract`'s one-line repair — patch ready, deliberately not applied.**
In `packages/db/tests/delta-catalog-phase.mjs`, read the third exclusion's flag the way the first
two are already read:

```js
const prepayDeployed = (await rootQuery(
  "select deployed from clara.evaluator_versions where evaluator_name='prepayment_schedule' and version=1 and firm_id is null")).rows[0]?.deployed === true;
assert.equal(result.verified_deployed,
  fresh ? 0 : 5 + (fsPackDeployed ? 1 : 0) + (card1V2Deployed ? 1 : 0) + (prepayDeployed ? 1 : 0),
  JSON.stringify(result));
```

The §2 control shows this is the only moving part. **The tempting alternative — teaching
`f-a5b-sandbox-export-pr1.test.mjs:123-126` all three exclusions via `delta-contract.test.mjs`'s own
`EXCLUDED_PAIRS_SQL` — is the more principled fix but is NOT safe to apply blind**:
`f-a5b` calls `ensureEvaluatorDeployed()` for its own preconditions and may need `evaluate_metric`
v2 deployed, which that change would withdraw. It needs its own red-first cell; the read-directly
patch does not.

**(b) The rig's env line must not carry a DSN URL alongside `PG*`.** Four of this round's six
failures had this as their *second* cause, invisible until `pg_dump` existed. RIG.md's own env line
is already correct (PG* only); the wave's work orders add `WORKFLOW_POSTGRES_URL` on top. Worth a
one-line warning in RIG.md beside the existing "No `psql` on Windows" note, because the symptom
(`DB target split … Refusing`) names neither `setDatabaseEnv` nor the rig recipe.

**(c) Make the Windows PG17 client part of the rig, not of one session.** It now lives at
`C:\Users\zhant\AppData\Local\clara-rig\pg17\bin`. Two small things would finish the job: put that
directory on `PATH` (so `PG_DUMP`/`PSQL` need not be exported at all), and **remove the stale
`C:\Program Files\PostgreSQL\16\bin` entry**, which points at a directory that does not exist and is
what made "a PostgreSQL client is installed" look true.

**(d) Round 1's follow-ups (a), (c), (d) and (e) are untouched and still stand** — the F-A2 Tier-D
commit-time vocabulary, the remaining unscoped whole-database `count(*)` assertions, `x42v.g4`'s
raw-`prosrc` roster probes, and resetting `clara_int` / `clara_rt_test` before any further
full-suite run.

---

## 7 · What was NOT done

1. **No repo change and no commit.** Nothing in this batch was a merge artefact or a branch defect,
   so there was nothing to fix on the branch. `HEAD` is still `2b30ddf2`; the worktree is clean.
   No `pnpm lint` re-run was needed — round 1's `exit 0` stands, because no file changed since.
2. **No full db-estate suite run, no World e2e leg, no browser walk.** Playwright ports
   3350/3351/3352 unused. The five files named in the handover were each re-run in full; nothing
   else was.
3. **The successor cut is still not in this branch** — `chatTurn_v20`, `claraWork_v4`,
   `clientOnboarding_v5` remain uncut, as the merge report §7 and fix round 1 §7 left them.
4. **No migration edited**, no prestate or tail re-issued, no census widened, no frozen file touched.
5. **Host changes made (outside the repo, all reversible):** the PostgreSQL 17.11 Windows client
   installed to `%LOCALAPPDATA%\clara-rig\pg17\bin` (plus a copy under this session's scratchpad);
   one disposable database `clara_delta_cf_test` created and dropped on `rigint`; the three runtime
   files created and dropped their own disposable databases. `rigint` / `clara_int` finishes the
   round at 204 migrations with `{"ok":true,"verified_deployed":8,"verified_registered":8}` — the
   state it started in.
6. **Hosted: nothing.** No hosted run exists anywhere in this wave and none was attempted.
