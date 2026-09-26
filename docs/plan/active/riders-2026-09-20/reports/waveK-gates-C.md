# Riders closing wave K — Gate C: the runtime suite on a provisioned Workflow schema, and the two-build cutover drill of a VERSION CUT

**Code** `C:\Users\zhant\Desktop\clara-wt\710`, branch `integration/riders-closing`, head **`18eb2dc4d`**
— every command below ran at that commit. `git status --porcelain` in 710 was **empty before and after**
this gate. Two things this gate wrote into 710 are absent from that list because both are gitignored,
and each was checked rather than assumed: `packages/runtime/.output/` (`.gitignore:13:.output/`, build B,
built by this gate) and `.scratch/two-build/` (`.gitignore:65:.scratch/`, the drill's three
previous-version images plus this gate's two previous-build images, all removed at the end). Nothing was
committed, nothing was pushed, no PR was opened, no GitHub object was written, no lane worktree and no
main-checkout file but this report was touched. No subagent was spawned. No process this gate did not
start was killed. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. This gate
built, used and dropped **one** cluster, `rigclosec` on **55712**; Gate A's 55711 and Gate B's 55701 /
55702 were never contacted, and `rigw4` (55700) was read once, for `pg_hba.conf` only.

**Verdict: PASS.** The gate this wave turns on is green. The two-build cutover drill passes every leg
with **`chatTurn_v23` and `claraWork_v7` carried**, the whole runtime suite has exactly the two standing
Windows reds and no others, the 23 World-gated cells the merge could not drive all RUN and pass, and the
rollback preflight against the previous build reads the cut's own five-way shape: **ALLOWED while no
successor-body run is non-terminal, REFUSED (`unsupported_body`) naming both bodies the moment one
exists.** **Nothing above note.**

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **the cluster**, built for this gate and dropped after it | `sudo pg_createcluster --locale C.UTF-8 17 rigclosec -p 55712 --start` | online, `datcollate = C.UTF-8`, PostgreSQL **17.11**, trust on `local` + both loopback hosts |
| 1a | the chain from 0001 on an empty database | `pnpm --filter @clara/db migrate` | **341 new applied · 341 total**, `0001` → `0365_accrual_register_pagination`, 22:02:20Z → 22:04:26Z (**2 m 06 s**), exit 0 |
| 1b | seed | `pnpm --filter @clara/db seed` | **2 seed file(s)**, exit 0 |
| 1c | **the Workflow DevKit schema** | `pnpm --filter @clara/runtime exec bootstrap` | exit 0; `workflow`, `workflow_drizzle`, `graphile_worker` created; `to_regclass('workflow.workflow_runs')` **not null**, **6** tables under `workflow` |
| 1d | the test database | `createdb -T clara_wave_b_ci clara_rt_test` | **341 files / `0365`**, **0** non-terminal `workflow.workflow_runs` |
| 1e | build B, this head's artifact | `pnpm --filter @clara/runtime build` | exit 0, **17 s**, `.output/server/index.mjs` 12.0 MB |
| 2 | **the WHOLE `packages/runtime` suite** | `node --test --test-concurrency=1 "tests/**/*.test.mjs"` | **3242 tests · 3223 pass · 2 fail · 17 skipped**, 337.1 s — both fails are RIG.md's standing Windows reds (F1, F2) |
| 2a | **the World-gated cells** | same run | **34 `637.pf:` cells RAN**, 0 skipped, 0 failed |
| 2b | the two World-gated files alone, pristine database | `node --test tests/{queue-drain,rollback-preflight}.test.mjs` | **58 tests · 58 pass · 0 fail · 0 skipped** — against the merge's **58 / 35 / 0 fail / 23 skipped** |
| 2c | LC's own new cells inside the whole-suite run | same run | **49 `v23` cells, all green** — the lane's own count exactly |
| 3 | **the two-build cutover drill** | `node ../../scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs` | **ALL PASS**, exit 0, **89 s** — three legs, two of them this cut's |
| 3a | the legs, derived from `registry.ts` | inside the drill | **claraWork v6 → v7** PASS · **chatTurn v22 → v23** PASS · statementFacts v3 → v4 PASS |
| 3b | the successor bodies carried | inside the drill | A / A2 / A3 each carry **61** bodies, **B carries 62**; both retired runs RESUME inside B on their own bodies |
| 3c | **#1131's assertions**, at this wave's frontier | inside the drill | **driven and green** at `0365`: `--supported <body-complete roster>` with `--supported-contracts` omitted exits **1** naming `frontier_requires_contract` for `intake_refusal_record_v1, fa_parked_run_v1`, and NOT `frontier_requires_body` |
| 3d | the drill's two doors | inside the drill | build gate and inventory gate both opened before anything was built |
| 4 | **the previous build**, two independent constructions | registry rewrite · main's true sources at `ffb629d73` | **60 bodies each, rosters identical**; this head has and both LACK exactly `chatTurn_v23, claraWork_v7`; neither has anything this head lacks |
| 4a | **rollback preflight**, seven readings at `0365` | `rollback-preflight.mjs` | **ALLOWED / ALLOWED / REFUSED / ALLOWED / REFUSED**, and B and C re-read against main's true bundle agree — §4 |
| 4b | the boot census, as a number | `scripts/serve.mjs` | `bodies=62`, `chatTurn=chatTurn_v23 claraWork=claraWork_v7`, **`stranded bodies n=0`** |
| 4c | the hosted image's roster vs this wave's base | `git diff 322fdf29 ffb629d73 -- workflows + runtime-contracts.mjs` | **empty** — `refresh-322fdf29`'s roster IS `ffb629d73`'s |
| 5 | the cluster, at the end | `sudo pg_dropcluster 17 rigclosec --stop` | **DROPPED**; `pg_lsclusters` no longer lists it |

**One sentence.** At `18eb2dc4d` the cut's own gate is green: the drill carries `chatTurn_v23` and
`claraWork_v7` through a real cutover and resumes a run parked on each retired pin inside the new build,
the whole runtime suite is green but for the two reds RIG.md already owns, the 23 cells the merge left
unverified all run, and the previous build `refresh-322fdf29` is a lawful rollback target **only until
the first non-terminal run on `chatTurn_v23` or `claraWork_v7` exists** — which is the snapshot the
release runbook's step 9 must record.

---

## Method, and the three things done differently from `waveS-gates-C.md`

`reports/waveC-gates.md` §1.1–§1.4 is the template, because this wave, like the cut, repoints pins.
`reports/waveS-gates-C.md` is the recipe for the cluster and the schema. Three departures, each measured:

1. **The previous build had to be built, and it was built TWICE, two different ways.** The sweep repointed
   no pin, so main's registry WAS its head's registry and no image was needed. This wave repoints two, so
   §1.3's question returns. It is answered from two directions that do not consult each other: the drill's
   own primitives with `registry.ts` rewritten back to `chatTurn_v22` / `claraWork_v6` and both successor
   body files deleted (`mainshape`), and a build of main's **actual sources** at `ffb629d73`, staged with
   `git archive` into the same scratch shape (`mainsrc`). §4.0 sets them side by side.
2. **A pristine snapshot was banked before the suite ran.** `clara_pristine` is a template copy of
   `clara_wave_b_ci` taken while nothing was connected. Every later leg that needs a clean database drops
   `clara_rt_test` and re-creates it from that snapshot, so the drill and each preflight reading start from
   341 files, 0 runs and 0 Works rather than from the previous leg's leftovers.
3. **The stranded census is read as a number, not inferred from a process booting** — `waveC-gates.md`
   §1.2's own departure, repeated here because this wave is a cut. §4.2.

---

## 1 · The cluster, and the schema the DevKit provisions

`rigclosec`, PostgreSQL 17.11, `127.0.0.1:55712`, `C.UTF-8`, trust for `local` and both loopback hosts.

| step | command | result |
|---|---|---|
| create | `sudo pg_createcluster --locale C.UTF-8 17 rigclosec -p 55712 --start` | online; locale `C.UTF-8`; 06:01:21+08 in the host's own sudo log |
| auth | `sudo cp /etc/postgresql/17/rigw4/pg_hba.conf /etc/postgresql/17/rigclosec/pg_hba.conf` + `chown postgres:postgres` + `sudo pg_ctlcluster 17 rigclosec reload` | `local all all trust`, `host all all 127.0.0.1/32 trust`, `host all all ::1/128 trust` (+ the three replication lines) |
| reachability | a TCP connect from the Windows side | `TCP 55712 reachable from Windows` — checked rather than assumed, because RIG.md records 55772–55871 unreachable on this host |
| database | `createdb -h 127.0.0.1 -p 55712 -U postgres clara_wave_b_ci` | `datcollate = datctype = C.UTF-8`, server `17.11 (Ubuntu 17.11-1.pgdg26.04+2)` |
| chain | `pnpm --filter @clara/db migrate` | **341 new applied · 341 total**, exit 0, 2 m 06 s; ledger reads `341 files, head 0365_accrual_register_pagination` |
| seed | `pnpm --filter @clara/db seed` | 2 files, exit 0 |
| **the WDK schema** | `pnpm --filter @clara/runtime exec bootstrap` | `✅ Database schema created successfully!`, exit 0 |
| template copies | `createdb -T clara_wave_b_ci clara_rt_test` and `… clara_pristine` | 341 files / `0365`, 0 non-terminal runs |

The environment for every migration command was RIG.md's own form:

```
export PGHOST=127.0.0.1 PGPORT=55712 PGUSER=postgres PGDATABASE=<db> \
       CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
```

and for every runtime command, `waveC-gates.md` §1.2's:

```
PGHOST=127.0.0.1 PGPORT=55712 PGUSER=postgres PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55712/clara_rt_test
```

with `CLARA_SPOOL_DIR` pointed at a per-run scratch directory, RIG.md's wave-2 addendum.

**Before the bootstrap this database was in exactly the state the merge described**, read rather than
recalled: `to_regclass('workflow.workflow_runs')` was `NULL` with the chain at 341 files, and the only
schemas present were `clara` and `public`. **After it**: `clara, graphile_worker, public, workflow,
workflow_drizzle`, six tables under `workflow`, `workflow.workflow_runs` a real relation with 0 rows.
RIG.md's provisioning bullet is confirmed in both directions on a second wave.

---

## 2 · The whole runtime suite

```
cd packages/runtime
node --test --test-concurrency=1 --test-reporter=tap "tests/**/*.test.mjs"
```

**22:06:23Z → 22:12:01Z, 337.1 s, exit 1.**

| | |
|---|---|
| tests | **3242** |
| pass | **3223** |
| fail | **2** |
| skipped | **17** |
| cancelled / todo | 0 / 0 |

Set beside the sweep wave's gate C run at `d812c2124` (3181 tests, 3162 pass, 2 fail, 17 skipped):
**+61 tests** — this wave's own new cells — **the same 17 skips, the same 2 reds, no new red**.

### 2.1 The two reds, each identified

Both are on RIG.md's standing "Known Windows-only reds you must not fix" list, and **neither file is
touched by this wave** (`git diff --name-only ffb629d73...HEAD` names neither, checked).

1. `scanner rejects EICAR, encrypted PDF, and XML entity expansion`
   (`tests/intake-unit.test.mjs:114`) — Windows Defender eats the fixture between the guard's probe and
   the read. **#693.** F1.
2. `(#806) this host's OWN probe: pg_dump/psql are on PATH here (RIG-MAC.md's toolchain), so this rig runs, not skips`
   (`tests/pg-tools-fixture.test.mjs:33`) — they are not on this Windows host's PATH, confirmed directly
   (`which pg_dump` finds nothing; WSL carries them, Windows does not). F2.

The 17 skips break down as **11** `# SKIP pg_dump/psql not found on PATH`, **1** `post-0097:
clara.fail_witness_facts is the real verb`, and **5** onboarding-plan cells carrying a bare `# SKIP` —
the same three groups, in the same proportions, as the sweep's run.

### 2.2 The World-gated cells RAN, and the merge's gap is closed as a difference

`waveK-merge.md` §7 item 3 carries this as "the largest gap this report carries": **23 World-gated cells
in `queue-drain.test.mjs` and `rollback-preflight.test.mjs` still skipping**, measured at integration as
**58 tests, 35 pass, 0 fail, 23 skipped** on a template clone with no World (§ its own table, row "L3's
two runtime files").

On a database dropped and re-created from `clara_pristine` first, so the reading is of the batteries and
not of the suite's leftovers:

| battery | tests | pass | fail | skipped | s |
|---|---|---|---|---|---|
| `tests/queue-drain.test.mjs` | 10 | 10 | 0 | **0** | 2.1 |
| `tests/rollback-preflight.test.mjs` | 48 | 48 | 0 | **0** | 2.9 |
| **total** | **58** | **58** | **0** | **0** | |

**Same 58 cells, 23 fewer skips, no new red.** Inside the whole-suite run (a shared database, the honest
condition CI reproduces) every `637.pf:` cell also reports `ok`: **34 run, 0 skipped, 0 failed** — one
more cell than the sweep's 33, which is L3's own addition in this wave.

One thing measured rather than carried over: **`queue-drain.test.mjs` has no World gate at all.** Its ten
cells are pure in-memory against a fake `rig.rootQuery` (the file's own header says so, and it carries no
`SKIP` string), so all 23 of the merge's skips were `rollback-preflight.test.mjs`'s. L3's argument
recorded in `waveK-merge.md` §7 item 4 is therefore correct as written.

### 2.3 LC's own cut cells

**49 `v23` cells green** inside the whole-suite run — exactly the 49 `chat-turn-v23-tools` +
`chat-turn-v23-tenancy` cells `waveK-merge.md` §4.2 counted for the lane, now driven against a
provisioned World rather than in isolation.

---

## 3 · The two-build cutover drill — the gate of this wave

```
cd packages/runtime
PGHOST=127.0.0.1 PGPORT=55712 PGUSER=postgres PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55712/clara_rt_test \
CLARA_GATE_STEP="closing wave K gate C two-build drill" \
  node ../../scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs
```

**22:13:46Z → 22:15:15Z, 89 s, exit 0 — `TWO-BUILD CUTOVER E2E: ALL PASS`.** The launcher reports
`budget 2048 MB | peak RSS unavailable (no /proc on this platform) | exit 0`; the peak figure is a
Linux-only reading and is UNVERIFIED here (F3).

The database was dropped and re-created from `clara_pristine` immediately before the run, and both doors
opened before anything was built:

```
[tb-e2e] build gate: .output/server/index.mjs is present, newer than every bundled source, and agrees with registry.ts
[tb-e2e] inventory gate: no non-terminal runs and no unbound accounting_work tasks
[tb-e2e] database frontier: 0365_accrual_register_pagination
```

The drill built its own three previous-version images (`previous` 7.9 s, `previous-chat` 7.1 s,
`previous-stmt` 6.4 s) and removed them afterwards.

### 3.1 Every leg, with the line that recorded it

**Both of this cut's repointed pins are drill legs**, because the drill derives its pairs from
`registry.ts` rather than from a list.

| leg | pair, derived from `registry.ts` | verdict | what the drill printed |
|---|---|---|---|
| **claraWork** | `claraWork_v6` (A) → **`claraWork_v7`** (B) | **PASS** | `artifacts: A carries 61 bodies (no claraWork_v7), B carries 62 (both)` |
| | | | `W1 parked on claraWork_v6 (typed Work question, 2 fields), bundle clara-work/v6 e716d9b046d6…` |
| | | | `preflight: target-with-claraWork_v6 allowed; target-without-claraWork_v6 REFUSED naming it` |
| | | | `build A stopped (SIGTERM) — W1 is parked on a body no running process now carries` |
| | | | `B's OWN durable world started pid=94900, 0ms after /ready answered 200` |
| | | | `B /api/build-info: pins.claraWork=claraWork_v7, 62 bodies, frontier 0365_accrual_register_pagination` |
| | | | `W2 parked on claraWork_v7 …, bundle clara-work/v7` |
| | | | `preflight: rollback to A REFUSED, naming claraWork_v7` |
| | | | `preflight B2: scoped-to-W1 ALLOWED while the global verdict REFUSES, naming claraWork_v7` |
| | | | `RESUME W1: completed on claraWork_v6 inside build B (name invariant), 1 receipt @ e716d9b046d6…` |
| | | | `RESUME W2: completed on claraWork_v7, 1 receipt @ a0fb27648d30…` |
| | | | `preflight: with both Works settled, rollback to A is now ALLOWED` |
| | | | `preflight frontier rule: database at 0365_accrual_register_pagination REFUSES a target without claraWork_v3; adding it clears the reason` |
| | | | `preflight CLI: --supported <pre-rule roster> exits 1 naming frontier_requires_body; --target-bundle B carries claraWork_v3 and clears the rule` |
| | | | **#1131** `preflight CLI: --supported <body-complete roster>, no --supported-contracts, exits 1 naming frontier_requires_contract for intake_refusal_record_v1, fa_parked_run_v1` |
| | | | `unbound Work: refuses on its own against a claraWork-less target; allowed against build A` |
| **chatTurn** | `chatTurn_v22` (A2) → **`chatTurn_v23`** (B) | **PASS** | `artifacts: A2 carries 61 bodies (no chatTurn_v23), B carries 62` |
| | | | `C1 parked on chatTurn_v22 (chat clarification, run workflow//./workflows/chatTurn.v22//chatTurn_v22)` |
| | | | `preflight: a target without chatTurn_v22 is refused by the parked turn, naming it` |
| | | | `build A2 stopped (SIGTERM) — the turn is parked on a body no running process now carries` |
| | | | `B ready for the chat leg: pins.chatTurn=chatTurn_v23, roster carries chatTurn_v22` |
| | | | `RESUME C1: the turn completed on chatTurn_v22 inside build B (run name invariant), clarification delivered` |
| **statementFacts** | `statementFacts_v3` (A3) → `statementFacts_v4` (B) | **PASS** | `artifacts: A3 carries 61 bodies (no statementFacts_v4), B carries 62` |
| | | | `S1 parked on statementFacts_v3 (text channel held, …)` |
| | | | `preflight: a target without statementFacts_v3 is refused by the parked statement, naming it` |
| | | | `RESUME S1: settled on statementFacts_v3 inside build B (run name invariant), 3 lines, none cited` |
| | | | `S2: 3 lines admitted inside build B on statementFacts_v4, every one citing its page and the region's own locator` |

Every `A` boot line reads `frontier=0365_accrual_register_pagination(341) bodies=61`, and build B's reads
`bodies=62` with **`chatTurn=chatTurn_v23 claraWork=claraWork_v7`** on the pin list — so the drill ran
against this wave's own 341-file chain and this wave's own cut, not a rerun of the cut phase's.

**The successor bodies are shown CARRIED three ways, not asserted:** B's artifact registers 62 bodies
against each A's 61; `/api/build-info` answers `pins.claraWork=claraWork_v7, 62 bodies`; and a run parked
on each RETIRED pin (`claraWork_v6`, `chatTurn_v22`) **resumes and completes inside build B** with its run
name invariant, which is policy (c)'s whole content.

### 3.2 The one leg that is not this wave's, said plainly

The statementFacts leg is the cut phase's, not this wave's: `statementFacts_v4` is already on `origin/main`
and this wave does not touch it. The drill re-drives it because its legs are derived from the pin table,
and it passes. It is recorded so the three PASSes are not read as three repointed pins: **this wave
repoints exactly two**, and both are legs above. F4.

---

## 4 · The rollback preflight, the cut's five-way shape

### 4.0 First, the previous build — built twice, and the two agree

`refresh-322fdf29` is the image hosted serves (RIG.md § Hosted 2026-09-25,
`registry.fly.io/clara-runtime@sha256:20ab8c8352fd4372f1c8a6f50f2f163f742e92c65c7fa6dc1f227435a608344f`).
Its commit is an ancestor of this wave's base, and their rosters are the same object:

| measurement | result |
|---|---|
| `git merge-base --is-ancestor 322fdf29 ffb629d73` | **YES** |
| `git diff --stat 322fdf29 ffb629d73 -- packages/runtime/workflows packages/runtime/lib/runtime-contracts.mjs` | **empty** — the image's roster IS `ffb629d73`'s |
| `git diff --stat ffb629d73...HEAD -- packages/runtime/lib/runtime-contracts.mjs` | **empty** — this wave declares no new contract |
| `git diff ffb629d73...HEAD -- packages/runtime/workflows` | **15 files, 4170 insertions, 4 deletions**: 14 new `chatTurn.v23.*` / `claraWork.v7.*` files, and `registry.ts` |
| the four deleted lines, in full | `chatTurn: chatTurn_v22,` · `claraWork: claraWork_v6,` · `chatTurn: "chatTurn_v22",` · `claraWork: "claraWork_v6",` |
| `git diff --stat ffb629d73...HEAD -- packages/runtime/package.json pnpm-lock.yaml nitro.config.ts tsconfig.json` | **empty** — the build inputs are unmoved, so one `node_modules` serves both builds |

So the whole distance from the hosted image's roster to this head's roster is **two bodies and four pin
lines**. Two previous-build artifacts were then built and read, by methods that share nothing but the
nitro binary:

| artifact | how it was built | bodies |
|---|---|---|
| `mainshape` | `waveC-gates.md` §1.3's method: this head's tree, `registry.ts` rewritten to `claraWork_v6` then `chatTurn_v22` by the drill's own `rewriteRegistryToPrevious`, both successor body files deleted, nitro twice (9.2 s + 11.9 s) | **60** |
| `mainsrc` | `git archive ffb629d73` of `workflows src lib plugins scripts` + `nitro.config.ts package.json tsconfig.json`, staged into the same scratch shape, nitro once (6.0 s) — **main's actual sources**, no rewrite | **60** |

```
head (18eb2dc4d)            : 62 bodies
mainshape (registry rewrite): 60 bodies
mainsrc  (ffb629d73 sources): 60 bodies
mainshape roster === mainsrc roster : true
head has and mainsrc LACKS  : chatTurn_v23, claraWork_v7
mainsrc has and head lacks  : (none)
```

**This is what `waveC-gates.md` §1.3 had to leave as a fidelity limit, and it is closed here**: the
registry-rewrite image and a build of main's real sources register the byte-same roster, so nothing the
preflight reads depends on which construction is used. 60 is also main's own figure from a third
direction — `waveK-merge.md` §4.1's manifest reads **62 `"use workflow"` modules** at this head against
the base's 60.

### 4.1 The readings

All against `clara_rt_test` @ 55712 at frontier `0365_accrual_register_pagination`, through
`node packages/runtime/scripts/rollback-preflight.mjs`. Runs were staged as
`tests/rollback-preflight.test.mjs`'s own `stageRun` stages them — rows in `workflow.workflow_runs`,
because the preflight and the boot census read ROWS, not engines.

| # | target | non-terminal runs | verdict | exit |
|---|---|---|---|---|
| **A** | this head (`--target-bundle`, 62 bodies, 2 contracts) | `chatTurn_v22`, `claraWork_v6` | **ALLOWED** | 0 |
| **B** | the previous build, `mainshape` (60) | the same two | **ALLOWED** | 0 |
| **B′** | the previous build, **`mainsrc`** (60) | the same two | **ALLOWED** | 0 |
| **C** | the previous build, `mainshape` (60) | **`chatTurn_v23`, `claraWork_v7`** | **REFUSED (`unsupported_body`)**, naming both | 1 |
| **C′** | the previous build, **`mainsrc`** (60) | the same two | **REFUSED (`unsupported_body`)**, naming both | 1 |
| **D** | this head (62) | the same two successors | **ALLOWED** | 0 |
| **E** | the 62-body roster typed in with **no `--supported-contracts`** — the pre-`#1035` image | the same two successors | **REFUSED (`frontier_requires_contract`)**, naming both rules | 1 |

**Reading B is the answer to "the previous build strands nothing the new one carries":** with a run parked
on each retired pin, `refresh-322fdf29`'s roster refuses nothing, because both images carry `chatTurn_v22`,
`claraWork_v6` and every body before them.

**Reading C is this cut's rollback verdict, and it is what the runbook's step 9 must record.** Verbatim,
from the `mainsrc` reading (main's own sources):

```
rollback-preflight: target supports 60 body(ies) and declares 2 door contract(s) — from bundle .scratch/two-build/mainsrc/.output/server/index.mjs
  GLOBAL (the whole database — this is what the exit code follows)
    non-terminal workflow runs: 2 across 2 name(s)
      !! 1x chatTurn_v23  (workflow//./workflows/chatTurn.v23//chatTurn_v23)
      !! 1x claraWork_v7  (workflow//./workflows/claraWork.v7//claraWork_v7)
    live tasks bound to NO run: 0
    verdict: REFUSED (unsupported_body)
  THE DATABASE'S OWN RULES …
    clara.schema_migrations frontier: 0365_accrual_register_pagination
    rules checked: 0195_work_egress_purpose_and_execution_trace, 0254_intake_refusal_record, 0279_fa_closed_year_arrears
    contracts the target declares: fa_parked_run_v1, intake_refusal_record_v1
      ok  the target satisfies every rule the applied schema carries

rollback-preflight: REFUSED (global)
  - 1 non-terminal run(s) on chatTurn_v23, which the target image does NOT carry (workflow//./workflows/chatTurn.v23//chatTurn_v23).
  - 1 non-terminal run(s) on claraWork_v7, which the target image does NOT carry (workflow//./workflows/claraWork.v7//claraWork_v7).

The two admissible ways forward are the ones the runbook names: RETAIN every non-terminal bundle in the target …, or DRAIN first and re-run this command until it allows. Elapsed time is not a drain.
```

**Both bodies strand, one refusal line each**, the moment a non-terminal run of either exists — and
readings A, B and B′ show the same database, at the same frontier, answering ALLOWED while none does.
**Reading E** is `#1035`'s and `#1131`'s rule read outside the drill, at the frontier the release will run
at: an image that carries every body but declares no door contract is refused by the schema itself, and
that refusal is not drainable. Every reading printed `live tasks bound to NO run: 0`, and in all seven the
frontier's body rule (`0195` → `claraWork_v3`) was satisfied by every target — **the refusal in C is the
body census alone, never the frontier.**

**What this means for the release runbook.** `CUT-PLAN` §2.9's obligation binds this wave exactly as it
bound the cut: the previous image `refresh-322fdf29` is a legal rollback target **only until the first
non-terminal run of `chatTurn_v23` or `claraWork_v7` exists**. Step 9 runs immediately after step 7 and is
recorded as a timestamped snapshot; the expected answer is **ALLOWED** if it is taken before any traffic
reaches the new pins, and **REFUSED naming both bodies** at any moment after.

### 4.2 The boot census, as a number

Three staged rows are not the same claim as a booted image, so the census was read separately. With a
non-terminal run staged on each RETIRED pin, this head was booted through its supported entry point
(`packages/runtime/scripts/serve.mjs`, the image's `CMD`):

```
[clara-runtime] serving git_sha=<unset> frontier=0365_accrual_register_pagination(341) bodies=62
  pins closeExample=closeExampleV1 chatTurn=chatTurn_v23 claraWork=claraWork_v7
  documentIngest=documentIngest_v2 invoiceFacts=invoiceFacts_v1 statementFacts=statementFacts_v4
  witnessFacts=witnessFacts_v3 payrollFacts=payrollFacts_v1 agreementFacts=agreementFacts_v1
  autoDraft=autoDraft_v10 firmInterview=firmInterview_v3 clientOnboarding=clientOnboarding_v5
  bankAgent=bankAgent_v1 closePrep=closePrep_v1
[clara-runtime] stranded bodies n=0 (every live run's body is carried by this image)
[world-postgres] Re-enqueued 2 active run(s) on startup
[clara-runtime] durable world started pid=56396
```

The process was stopped (SIGTERM) by the same script that started it. After `durable world started` the
engine re-enqueued the two staged rows and graphile-worker failed them — a consequence of the rows being
staged rather than real, **after** the census had already answered, and the same behaviour
`waveC-gates.md` §1.2 recorded. Not a finding about the image.

---

## 5 · Findings

### F1 · NOTE (carry-forward, not new) — the EICAR cell reds on this host

`scanner rejects EICAR, encrypted PDF, and XML entity expansion`, `tests/intake-unit.test.mjs:114`.
Windows Defender removes the fixture between the guard's probe and the read. **RIG.md's standing list;
#693.** The file is untouched by this wave (measured), and the cut phase's and the sweep's whole-suite runs
both recorded the same red. Not this wave's, and not to be "fixed" by a gate.

### F2 · NOTE (carry-forward, not new) — the `pg_dump` host probe red on this host

`(#806) this host's OWN probe: pg_dump/psql are on PATH here …`, `tests/pg-tools-fixture.test.mjs:33`.
Confirmed directly this run: Windows has neither binary on PATH, WSL has both. **RIG.md's standing list.**
Eleven further cells skip on the same fact. Same file untouched, same red in the two previous gate runs.

### F3 · NOTE (carry-forward) — `world-gate`'s peak-RSS line is blank on this host, again

`budget 2048 MB | peak RSS unavailable (no /proc on this platform)`. Linux-only by construction; identical
to `waveC-gates.md` F3 and `waveS-gates-C.md` F4. The budget was honoured (exit 0, no SIGABRT), but the
peak figure this wave's drill used is UNVERIFIED on this rig.

### F4 · NOTE — the drill drives THREE legs but this wave repoints TWO pins

`statementFacts_v3 → v4` is the cut phase's leg, re-derived from the pin table and passing again. Recorded
so that "three legs PASS" is not read as "three pins moved": this wave moves `chatTurn` and `claraWork`
only, and `waveK-merge.md` §4.1's manifest agrees (15 new frozen entries, all `chatTurn.v23.*`,
`claraWork.v7.*` and the one imported helper). No action; it is a reading aid for the runbook.

### F5 · NOTE — `waveK-merge.md`'s "23 World-gated cells in `queue-drain.test.mjs` and `rollback-preflight.test.mjs`" is 23 cells in ONE file

`queue-drain.test.mjs` has no World gate: its ten cells drive a fake `rig.rootQuery` entirely in memory and
the file contains no `SKIP` string. All 23 skips the merge measured were `rollback-preflight.test.mjs`'s.
The merge's count of 58 / 35 / 23 for the pair is right; only the attribution across the two files was
loose. Both files are 100 % green here either way, so nothing follows for the release — it is recorded so a
later reader does not go looking for a gate in `queue-drain.test.mjs` that is not there.

---

## 6 · Rig hygiene, and what is left behind

| | |
|---|---|
| cluster built | `rigclosec`, 17/55712, `C.UTF-8` |
| databases created on it | `clara_wave_b_ci`, `clara_rt_test`, `clara_pristine` (all lower case) |
| cluster dropped | `sudo pg_dropcluster 17 rigclosec --stop` → **DROPPED** at 06:23:59+08; `pg_lsclusters` no longer lists it |
| clusters touched that were not mine | **none** — `rigw4` (55700) was read once, for `pg_hba.conf` only, with `cp`; 55701, 55702, 55711 and 55741–55750 were never contacted |
| **Gate A's `rigclose` (55711)** | it was online when this gate started and gone when it finished, and **this gate did not drop it**: the host's own sudo log records `pg_dropcluster 17 rigclose --stop` at **06:13:48**, ten minutes before this gate's only drop command, which named `rigclosec`. Gate A's brief assigns that drop to Gate A |
| worktree 710 | `git status --porcelain` **empty** before and after; HEAD still `18eb2dc4d` |
| gitignored artefacts left in 710 | `packages/runtime/.output/` (build B, built by this gate and left in place for whoever needs it next) and an **empty** `.scratch/two-build/` (its `node_modules` junction aside) |
| files written outside the scratchpad | **this report only** |
| processes killed | none this gate did not start; the drill stops its own three builds with SIGTERM, and the boot census stops the server it started. At the end of this gate the only `node.exe` processes on the host are Gate B's browser suite (`apps/web e2e -- --no-build`, `e2e/serve-built.mjs`, Playwright), started 06:21:58 — read from their command lines, not assumed, and left alone |
| **worktree 710 is SHARED with Gate B** | Gate B drives `apps/web` in the same checkout while this gate drove `packages/db` and `packages/runtime`. Nothing tracked was written by either (status empty), and the two gitignored artefacts this gate produced are outside `apps/web`. The drill's own build gate re-checked that `.output/server/index.mjs` was newer than every bundled source and agreed with `registry.ts` at the moment it ran, so a concurrent build by anyone else could not have been read as this head's |

---

## 7 · Anything unverified

1. **The live machine's own bundle was not read.** The rollback readings are taken against two locally
   built previous-build artifacts whose rosters agree, and against git measurements showing
   `refresh-322fdf29`'s commit and this wave's base carry a byte-identical roster. **Streaming
   `refresh-322fdf29`'s `/app/.output/server/index.mjs` off the machine and re-reading it is owed to the
   release window**, which is the only place it can be done. The image DIGEST
   (`sha256:20ab8c83…a608344f`) was taken from RIG.md and not re-read from the registry by this gate.
2. **`world-gate`'s peak RSS** — F3. Linux-only.
3. **The whole runtime suite ran ONCE.** A cell red only intermittently would not be separated from a
   stable red by a single run. Both reds seen are named files with named, standing causes, and both were
   red in the cut phase's and the sweep's independent runs.
4. **The cells were proved on THIS rig, not on the runner.** They are green under Windows Node 22 against
   a provisioned schema. RIG.md's wave-2 addendum asks that new runtime test files be re-run once under
   WSL as user `runner`; WSL on this host carries no Node (`waveK-merge.md` §7 item 4 measured this), so
   that run is unavailable here rather than skipped by choice.
5. **`apps/web`, the browser suite, the upgrade path, the collation twin, the from-scratch census and the
   static gates are not this gate's.** They are Gates A and B; nothing here speaks to them. In particular
   this gate did NOT run `check-frozen-workflows`, `pnpm typecheck` or `pnpm lint`.
6. **`clara_pristine` is a template copy, not a second from-scratch chain.** No cluster ran the chain twice
   (0154 pins the cluster-wide role count), and `CLARA_RIG_ALLOW_RESET` was never set.
7. **`mainsrc` is main's runtime sources, not a full main checkout.** It stages the five directories and
   three files the image is built from, with this tree's `node_modules` (proved identical: neither
   `packages/runtime/package.json` nor `pnpm-lock.yaml` moved this wave). A full `pnpm install` at
   `ffb629d73` was not performed, and no git worktree was created.
