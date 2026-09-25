# Riders sweep wave S — Gate C: the runtime suite on a provisioned Workflow schema, and the two-build cutover drill

**Code** `C:\Users\zhant\Desktop\clara-wt\636`, branch `integration/riders-sweep`, head **`d812c2124`**
— every command below ran at that commit. `git status --porcelain` in 636 was **empty before and after**
this gate. Two things this gate wrote into 636 are absent from that list because both are gitignored,
and each was checked rather than assumed: `packages/runtime/.output/` (`.gitignore:13:.output/`, the
merger's own 19:46 build, reused rather than rebuilt) and `.scratch/two-build/` (`.gitignore:65:.scratch/`,
the drill's three previous-version images, which the drill removes itself). Nothing was committed,
nothing was pushed, no PR was opened, no GitHub object was written, no lane worktree and no main-checkout
file but this report was touched. No subagent was spawned. No process this gate did not start was killed.
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set. Ports 55700–55707 and 55741–55750
were not touched: this gate built, used and dropped **one** cluster, `rigsweepc` on **55708**.

**Verdict: PASS.** Both gaps the merge left open are closed. The 22 runtime cells that skipped at
integration all RUN and all pass, the whole runtime suite has exactly the two standing Windows reds and
no others, and the two-build cutover drill passes all three legs with #1131's new contract-rule assertions
driven at frontier `0361`. **Nothing above note.**

---

## Counts, one table

| # | gate | command | result |
|---|---|---|---|
| 1 | **the cluster**, built for this gate and dropped after it | `sudo pg_createcluster --locale C.UTF-8 17 rigsweepc -p 55708 --start` | online, `datcollate = C.UTF-8`, PostgreSQL **17.11**, trust on `local` + both loopback hosts |
| 1a | the chain from 0001 on an empty database | `pnpm --filter @clara/db migrate` | **337 new applied · 337 total**, `0001` → `0361_reservation_release_advice`, 12:00:34Z → 12:02:35Z (**2 m 01 s**), exit 0 |
| 1b | seed | `pnpm --filter @clara/db seed` | **2 seed file(s)**, exit 0 |
| 1c | **the Workflow DevKit schema** (the thing the merge could not provision) | `pnpm --filter @clara/runtime exec bootstrap` | exit 0; `workflow`, `workflow_drizzle`, `graphile_worker` created; `to_regclass('workflow.workflow_runs')` **not null**, **6** tables under `workflow` |
| 1d | the test database | `createdb -T clara_wave_b_ci clara_rt_test` | **337 files / `0361`**, **0** non-terminal `workflow.workflow_runs` |
| 2 | **the WHOLE `packages/runtime` suite** | `node --test --test-concurrency=1 "tests/**/*.test.mjs"` | **3181 tests · 3162 pass · 2 fail · 17 skipped**, 345.8 s — both fails are RIG.md's standing Windows reds (§5 F1, F2) |
| 2a | **the 22 lane-L6 cells**, named in §2.2 | same run | **all 22 RAN**, none skipped, none red; `rollback-preflight.test.mjs` shows **33 / 33** inside the whole-suite run |
| 2b | lane L6's four batteries alone, pristine database | `node --test tests/{intake-sidecar-race,l9-pool-contract-lane-probe,ready,rollback-preflight}.test.mjs` | **123 tests · 123 pass · 0 fail · 0 skipped** — against the merge's **123 / 101 / 22 skipped** |
| 3 | **the two-build cutover drill** | `node ../../scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs` | **ALL PASS**, exit 0, **84 s** — three legs (claraWork v5→v6, chatTurn v21→v22, statementFacts v3→v4) |
| 3a | **#1131's new assertions**, the point of this leg | inside the drill | **driven and green** at frontier `0361`: `--supported <body-complete roster>` with `--supported-contracts` OMITTED exits **1** naming `frontier_requires_contract` for `intake_refusal_record_v1, fa_parked_run_v1`, and NOT `frontier_requires_body` |
| 3b | the drill's two doors | inside the drill | build gate and inventory gate both opened before anything was built |
| 4 | **rollback preflight**, five readings at `0361` | `rollback-preflight.mjs` | **ALLOWED / ALLOWED / REFUSED / ALLOWED / REFUSED** — §4 |
| 4a | the roster this wave ships | `supportedBodiesFromBundle` on the built artifact | **60 bodies · 2 door contracts** |
| 4b | the roster `origin/main` and the hosted image ship | `git diff` over `packages/runtime/workflows` + `runtime-contracts.mjs` | **byte-identical** at `3bf6aa94d` AND at `061a6992b` — this wave moves **no** body and **no** contract |
| 5 | the cluster, at the end | `sudo pg_dropcluster 17 rigsweepc --stop` | **DROPPED**; `pg_lsclusters` no longer lists it |

**One sentence.** The merge's two largest open gaps are closed at `d812c2124`: with the Workflow DevKit
schema provisioned the 22 cells of `#1129`'s own file run and pass, the whole runtime suite is green but
for the two reds RIG.md already owns, and the drill passes every leg with `#1131`'s contract-rule proof
actually driven — and because this wave repoints **no pin**, the rollback verdict against the previous
build is **ALLOWED** rather than the cut's REFUSED.

---

## Method, and the four things done differently from `waveC-gates.md`

`reports/waveC-gates.md` §1.1, §1.2 and §1.4 are the template, and this gate departs from it in four
places, each for a reason that is measured rather than assumed:

1. **No `pg_dump` from `rigw4` was needed.** The brief allowed dumping the CI template from 55700 if
   `waveC-gates.md`'s recipe required it. It does not: §1.1's route is self-contained — `createdb`,
   `migrate`, `seed`, `pnpm --filter @clara/runtime exec bootstrap`, then `createdb -T`. The `bootstrap`
   bin is `@workflow/world-postgres/bin/setup.js`, and it is the piece the merge's three recorded dead
   ends were all missing. Nothing was read from any other cluster.
2. **A pristine snapshot was banked before the suite ran.** `clara_pristine` is a template copy of
   `clara_wave_b_ci` taken while the only live connection in the cluster was the suite's own to
   `clara_rt_test`. Every later leg that needs a clean database drops `clara_rt_test` and re-creates it
   from that snapshot, so the drill and the preflight readings each start from 337 files, 0 runs and 0
   Works rather than from whatever the previous leg left.
3. **The 22 cells are proved twice, and the second time alone.** Inside the whole-suite run (where a
   shared database is the honest condition CI reproduces) and again as lane L6's four batteries on a
   pristine database, because the merge's own figure — 123 tests, 101 pass, 22 skipped — is a per-battery
   figure and only a per-battery figure can be set beside it.
4. **The previous build was not rebuilt, because it does not differ.** `waveC-gates.md` §1.3 had to build
   a fourth image because the cut repointed three pins. This wave repoints none, so main's registry IS this
   head's registry, byte for byte, at both `3bf6aa94d` and the hosted image's commit `061a6992b` (§4.0).
   The reading is taken against the built artifact and against the same roster typed in as an operator
   would, and the live machine's own bundle stream is recorded as owed to the release window (§7).

---

## 1 · The cluster, and the schema the DevKit provisions

`rigsweepc`, PostgreSQL 17.11, `127.0.0.1:55708`, `C.UTF-8`, trust for `local` and both loopback hosts.

| step | command | result |
|---|---|---|
| create | `sudo pg_createcluster --locale C.UTF-8 17 rigsweepc -p 55708 --start` | online; locale `C.UTF-8` |
| auth | `sudo cp /etc/postgresql/17/rigw4/pg_hba.conf /etc/postgresql/17/rigsweepc/pg_hba.conf` + `chown postgres:postgres` + `pg_ctlcluster 17 rigsweepc reload` | `local all all trust`, `host all all 127.0.0.1/32 trust`, `host all all ::1/128 trust` (+ the three replication lines) |
| reachability | a TCP connect from the Windows side | `TCP 55708 reachable from Windows` — checked rather than assumed, because RIG.md records that 55772–55871 is unreachable on this host |
| database | `createdb -h 127.0.0.1 -p 55708 -U postgres clara_wave_b_ci` | `datcollate = datctype = C.UTF-8` |
| chain | `pnpm --filter @clara/db migrate` | **337 new applied · 337 total**, exit 0, 2 m 01 s; ledger reads `337 files, head 0361_reservation_release_advice` |
| seed | `pnpm --filter @clara/db seed` | 2 files, exit 0 |
| **the WDK schema** | `pnpm --filter @clara/runtime exec bootstrap` | `✅ Database schema created successfully!`, exit 0 |
| template copy | `createdb -h 127.0.0.1 -p 55708 -U postgres -T clara_wave_b_ci clara_rt_test` | 337 files / `0361`, 0 non-terminal runs |

The environment for every migration and test command was RIG.md's own form:

```
export PGHOST=127.0.0.1 PGPORT=55708 PGUSER=postgres PGDATABASE=<db> \
       CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
```

and for every runtime command, `waveC-gates.md` §1.2's:

```
PGHOST=127.0.0.1 PGPORT=55708 PGUSER=postgres PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55708/clara_rt_test
```

with `CLARA_SPOOL_DIR` pointed at a per-run scratch directory, which is RIG.md's own wave-2 addendum
(off Windows the default is `/data/spool`).

**Before the bootstrap, this database was in exactly the state the merge described**, and it was read
rather than recalled: `to_regclass('workflow.workflow_runs')` was `NULL` with the chain at 337 files, and
the only schemas present were `clara` and `public`. **After it**: `clara, graphile_worker, public,
workflow, workflow_drizzle`, six tables under `workflow`, `workflow.workflow_runs` a real relation with
0 rows. So §16.1 of `waveS-merge.md` is confirmed in both directions — the schema is not any migration's,
and one documented command provisions it. That command is `pnpm --filter @clara/runtime exec bootstrap`,
and `packages/runtime` DOES have it: not as an npm script (the merge looked there, correctly, and found
none) but as a dependency bin, `node_modules/.bin/bootstrap` →
`@workflow/world-postgres/bin/setup.js`.

---

## 2 · The whole runtime suite

```
cd packages/runtime
node --test --test-concurrency=1 --test-reporter=tap "tests/**/*.test.mjs"
```

**12:03:57Z, 345.8 s, exit 1.**

| | |
|---|---|
| tests | **3181** |
| pass | **3162** |
| fail | **2** |
| skipped | **17** |
| cancelled / todo | 0 / 0 |

Set beside the cut phase's own whole-suite run on `origin/main`'s head (`waveC-merge.md`: 3156 tests,
3136 pass, 3 fail, 17 skipped): **+25 tests** — the wave's own new cells — **the same 17 skips**, and
**one fewer red**. The red that is gone is §5 F3's.

### 2.1 The two reds, each identified

Both are on RIG.md's standing "Known Windows-only reds you must not fix" list, and **neither file is
touched by this wave** (`git diff --name-only 3bf6aa94d...HEAD` names neither).

1. `scanner rejects EICAR, encrypted PDF, and XML entity expansion`
   (`tests/intake-unit.test.mjs:114`) — `Error: UNKNOWN: unknown error, open …\clara-intake-7uLGTA\eicar.bin`.
   Windows Defender ate the fixture between the guard's probe and the read. **#693.** The two sibling
   cells that exist precisely to describe this — `(#693) a quarantined EICAR fixture on win32 SKIPS with
   the explicit reason` and its positive control — are both **green**, which is what makes the failure
   attributable to the race rather than to the scanner.
2. `(#806) this host's OWN probe: pg_dump/psql are on PATH here (RIG-MAC.md's toolchain), so this rig runs, not skips`
   (`tests/pg-tools-fixture.test.mjs:33`) — `this rig's PATH is prefixed with ~/.local/pg17/bin — pg_dump
   must resolve`. They are not on this Windows host's PATH. **RIG.md's "no `pg_dump` on PATH (four runtime
   files)".** Its sibling, `(#806) the PG_DUMP/PSQL overrides are honoured`, is **green**.

**Eleven** of the seventeen skips are the same missing-`pg_dump` fact stated as a skip rather than a red
(`# SKIP pg_dump/psql not found on PATH`). Of the remaining six, one is `post-0097: clara.fail_witness_facts
is the real verb` and five are the onboarding-plan cells that carry a bare `# SKIP`.

### 2.2 The 22 cells, named, and the fact that they RAN

All 22 live in **one** file, `packages/runtime/tests/rollback-preflight.test.mjs` — `#1129`'s own — behind
one gate:

```js
const READY = (await rig.runtimeReady()) && (await preflightReady());
const SKIP = READY ? false : "the WDK world (workflow.workflow_runs), migration 0178 or the document lane is absent from this database";
```

`preflightReady()` reads `to_regclass('workflow.workflow_runs')` among four other probes. With the schema
provisioned the gate opens, and in the whole-suite run **every `637.pf:` cell reports `ok`: 33 run, 0
skipped, 0 failed.** The 22 that the merge could not drive, in file order:

| # | cell |
|---|---|
| 1 | `637.pf: B3 — every kind in clara.agent_tasks's OWN check constraint is covered, derived from the catalog` |
| 2 | `637.pf: B1 — the live/no-body STATUS partition is complete against the catalog (a wake task is born 'held')` |
| 3 | `637.pf: B3 — every document LANE in the catalog's own check constraint is covered` |
| 4 | `637.pf: a non-terminal run on a body the TARGET image lacks REFUSES, and the refusal names it` |
| 5 | `637.pf: a TERMINAL run on an unsupported body does not refuse — the census is of live state` |
| 6 | `637.pf: B1 — a RUN-shaped scope still measures the unbound-task leg IN FULL; never a false zero` |
| 7 | `637.pf: B2 — a name scope may NOT allow while an out-of-scope body is stranded; the global verdict is the authority` |
| 8 | `637.pf: an UNBOUND accounting_work task refuses on its own, with zero workflow runs in scope` |
| 9 | `637.pf: B3 — a queued CHAT_TURN task with no run strands a target without chatTurn` |
| 10 | `637.pf: B3 — a queued DOCUMENT task with no run strands a target without that lane's class` |
| 11 | `637.pf: B3 — a document lane that rides a CONSUMER LOOP (classify) never strands a rollback` |
| 12 | `637.pf: B3 — a HELD wake task's class is READ from clara.wake_engine_sources, and is fail-closed until one is registered` |
| 13 | `637.pf: B3 — two sources sharing one task_kind count the task ONCE, and the ENABLED one decides its class` |
| 14 | `637.pf: #1015 — a census scoped by task ids ignores unrelated document-processing tasks in other lanes and firms` |
| 15 | `637.pf: #1015 — an explicit ask for the FULL document picture (documentTaskIds: null) is honoured even alongside a task-id scope` |
| 16 | `637.pf: N8 — a WORK-shaped scope narrows the RUN census too, with foreign parked runs present` |
| 17 | `637.pf: #708 — an explicit scope answers about THIS caller's runs, with 20 unrelated parked runs present` |
| 18 | `637.pf: the raw censuses are separately readable — an operator can see the inventory, not only the verdict` |
| 19 | `637.pf: the BOOT census names the bodies live runs are parked on that THIS image does not carry` |
| 20 | `637.pf: the frontier is READ from clara.schema_migrations when the caller does not supply one` |
| 21 | `637.pf: a read that THROWS is never answered as 'allowed'` |
| 22 | `637.pf: teardown` |

### 2.3 Lane L6's four batteries alone, against the merge's own figure

On a database dropped and re-created from `clara_pristine` first, so the reading is of the batteries and
not of the suite's leftovers:

| battery | ticket | tests | pass | fail | skipped | s |
|---|---|---|---|---|---|---|
| `tests/intake-sidecar-race.test.mjs` | #1044 | 22 | 22 | 0 | **0** | 8.5 |
| `tests/l9-pool-contract-lane-probe.test.mjs` | #1128 | 28 | 28 | 0 | **0** | 7.9 |
| `tests/ready.test.mjs` | #1128 | 26 | 26 | 0 | **0** | 3.3 |
| `tests/rollback-preflight.test.mjs` | #1129 | 47 | 47 | 0 | **0** | 1.6 |
| **total** | | **123** | **123** | **0** | **0** | |

`waveS-merge.md` §16 recorded **123 tests, 101 pass, 0 fail, 22 skipped** for exactly these four files.
Same 123 cells, 22 fewer skips, no new red. **This is the gap closed, measured as a difference rather
than asserted.**

---

## 3 · The two-build cutover drill

```
cd packages/runtime
PGHOST=127.0.0.1 PGPORT=55708 PGUSER=postgres PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 \
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55708/clara_rt_test \
CLARA_GATE_STEP="sweep wave S gate C two-build drill" \
  node ../../scripts/ci/world-gate.mjs tests/two-build-cutover-e2e.mjs
```

**12:12:05Z → 12:13:29Z, 84 s, exit 0 — `TWO-BUILD CUTOVER E2E: ALL PASS`.** The launcher reports
`budget 2048 MB | peak RSS unavailable (no /proc on this platform) | exit 0`; the peak figure is a
Linux-only reading and is UNVERIFIED here, exactly as `waveC-gates.md` F3 recorded.

The database was dropped and re-created from `clara_pristine` immediately before the run (0 runs, 0
`clara.accounting_work` rows, 337 files), and both doors opened before anything was built:

```
[tb-e2e] build gate: .output/server/index.mjs is present, newer than every bundled source, and agrees with registry.ts
[tb-e2e] inventory gate: no non-terminal runs and no unbound accounting_work tasks
[tb-e2e] database frontier: 0361_reservation_release_advice
```

The build gate passed against the merger's own 19:46 artifact; **no rebuild of build B was needed or
done**. The drill built its own three previous-version images (`previous` 7.3 s, `previous-chat` 6.0 s,
`previous-stmt` 6.5 s) and removed them afterwards — `.scratch/` is empty on disk now.

### 3.1 Every leg, with the line that recorded it

| leg | pair, derived from `registry.ts` | verdict | what the drill printed |
|---|---|---|---|
| **claraWork** | `claraWork_v5` (A) → `claraWork_v6` (B) | **PASS** | `artifacts: A carries 59 bodies (no claraWork_v6), B carries 60 (both)` |
| | | | `W1 parked on claraWork_v5 (typed Work question, 2 fields), bundle clara-work/v5 fe64198207d5…` |
| | | | `preflight: target-with-claraWork_v5 allowed; target-without-claraWork_v5 REFUSED naming it` |
| | | | `build A stopped (SIGTERM) — W1 is parked on a body no running process now carries` |
| | | | `B's OWN durable world started pid=76908, 0ms after /ready answered 200` |
| | | | `B /api/build-info: pins.claraWork=claraWork_v6, 60 bodies, frontier 0361_reservation_release_advice` |
| | | | `W2 parked on claraWork_v6 …, bundle clara-work/v6` |
| | | | `preflight: rollback to A REFUSED, naming claraWork_v6` |
| | | | `preflight B2: scoped-to-W1 ALLOWED while the global verdict REFUSES, naming claraWork_v6` |
| | | | `RESUME W1: completed on claraWork_v5 inside build B (name invariant), 1 receipt @ fe64198207d5…` |
| | | | `RESUME W2: completed on claraWork_v6, 1 receipt @ e716d9b046d6…` |
| | | | `preflight: with both Works settled, rollback to A is now ALLOWED` |
| | | | `preflight frontier rule: database at 0361_reservation_release_advice REFUSES a target without claraWork_v3; adding it clears the reason (build A itself CARRIES the required body, so its own verdict is allowed)` |
| | | | `preflight CLI: --supported <pre-rule roster> exits 1 naming frontier_requires_body; --target-bundle B carries claraWork_v3 and clears the rule` |
| | | | **#1131** `preflight CLI: --supported <body-complete roster>, no --supported-contracts, exits 1 naming frontier_requires_contract for intake_refusal_record_v1, fa_parked_run_v1` |
| | | | `unbound Work: refuses on its own against a claraWork-less target; allowed against build A` |
| **chatTurn** | `chatTurn_v21` (A2) → `chatTurn_v22` (B) | **PASS** | `artifacts: A2 carries 59 bodies (no chatTurn_v22), B carries 60` |
| | | | `C1 parked on chatTurn_v21 (chat clarification, run workflow//./workflows/chatTurn.v21//chatTurn_v21)` |
| | | | `preflight: a target without chatTurn_v21 is refused by the parked turn, naming it` |
| | | | `B ready for the chat leg: pins.chatTurn=chatTurn_v22, roster carries chatTurn_v21` |
| | | | `RESUME C1: the turn completed on chatTurn_v21 inside build B (run name invariant), clarification delivered` |
| **statementFacts** | `statementFacts_v3` (A3) → `statementFacts_v4` (B) | **PASS** | `artifacts: A3 carries 59 bodies (no statementFacts_v4), B carries 60` |
| | | | `S1 parked on statementFacts_v3 (text channel held, run workflow//./workflows/statementFacts.v3//statementFacts_v3)` |
| | | | `preflight: a target without statementFacts_v3 is refused by the parked statement, naming it` |
| | | | `B ready for the statement leg: pins.statementFacts=statementFacts_v4, roster carries statementFacts_v3` |
| | | | `RESUME S1: settled on statementFacts_v3 inside build B (run name invariant), 3 lines, none cited` |
| | | | `S2: 3 lines admitted inside build B on statementFacts_v4, every one citing its page and the region's own locator` |

Every `A` boot line reads `frontier=0361_reservation_release_advice(337) bodies=59`, and build B's reads
`bodies=60` with the cut's three pins where the cut put them — so the drill is running against **this
wave's own 337-file chain**, not against the cut's 312.

### 3.2 What #1131 actually bought, and why the line above is the whole ticket

Before this wave, the CLI's real exit code for a target missing a required **body** was driven by the
drill (`cliA`), and the exit code for a target missing a required **contract** was driven nowhere on
anybody's schedule — `#1035` added the rule and the drill never exercised the CLI end of it. `#1131` adds
the mirror-image isolation: a roster that carries **every required body** (so `frontier_requires_body`
cannot fire) and declares **no contract at all** (so the exit is the contract rule's alone), with
`--supported-contracts` **omitted rather than passed empty**, because an absent flag is what an image
built before `#1035` looks like from the CLI's own point of view.

Read at `0361` this run, and all of it green:

- the control, read from the rule table rather than restated: the required-contract set is non-empty and
  contains both `intake_refusal_record_v1` (0254) and `fa_parked_run_v1` (0279);
- `frontier_requires_body` is **not** among the reasons, and `frontier_requires_contract` **is**;
- the CLI exits **1**, its stderr names the reason, both migrations (`0254_intake_refusal_record`,
  `0279_fa_closed_year_arrears`) and both contract ids, and does **not** name `frontier_requires_body`.

§18 item 2 of `waveS-merge.md` is therefore closed: the drill ran, and `#1131`'s assertions were driven.

---

## 4 · The rollback preflight, five readings

### 4.0 First, the fact that makes this wave's reading different from the cut's

The cut repointed three pins, so its reading was **REFUSED** the moment a run on `chatTurn_v22`,
`claraWork_v6` or `statementFacts_v4` existed. **This wave repoints none, and that is measured, not
inferred:**

| measurement | result |
|---|---|
| `git diff --stat 3bf6aa94d...d812c2124 -- packages/runtime/workflows packages/runtime/lib/runtime-contracts.mjs` | **empty** |
| `git diff 3bf6aa94d:packages/runtime/workflows/registry.ts` vs `HEAD:…` | **byte-identical** |
| `git diff --stat 061a6992b 3bf6aa94d -- packages/runtime/workflows packages/runtime/lib/runtime-contracts.mjs` | **empty** — the hosted image's commit carries the same roster too |
| contract ids on main vs head | `fa_parked_run_v1`, `intake_refusal_record_v1` on both |
| the built artifact's own declaration | **60 bodies · 2 contracts** |
| `waveS-merge.md` §17, independently | `check-frozen-workflows` **OK, 347 frozen / 60 `"use workflow"` / 3 retired, identical to the base** |

So the previous build's roster and this build's roster are the **same 60 bodies and the same 2
contracts**, and no image needed to be rebuilt to ask the rollback question. `FRONTIER_RULES` is also
unmoved: three rows, `0195` → `claraWork_v3`, `0254` → `intake_refusal_record_v1`, `0279` →
`fa_parked_run_v1`. `#1129` adds `contractsMissingFrontierRule`, `deadContractRuleExceptions` and an
empty `CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE`; it adds no rule.

### 4.1 The readings

All against `clara_rt_test` @ 55708 at frontier `0361_reservation_release_advice`, through
`node packages/runtime/scripts/rollback-preflight.mjs`. Runs were staged as
`tests/rollback-preflight.test.mjs`'s own `stageRun` stages them — rows in `workflow.workflow_runs`,
because the preflight and the boot census read ROWS, not engines.

| # | target | non-terminal runs | verdict | exit |
|---|---|---|---|---|
| **A** | the built artifact (`--target-bundle`, 60 bodies, 2 contracts) | `chatTurn_v22`, `claraWork_v6`, `statementFacts_v4` | **ALLOWED** | 0 |
| **B** | the same roster typed in (`--supported` + `--supported-contracts`, the operator path) | the same three | **ALLOWED** | 0 |
| **C** | that roster **minus `claraWork_v6`** (59) — the negative control | the same three | **REFUSED (unsupported_body)**, naming `claraWork_v6` | 1 |
| **D** | the built artifact (60) | `chatTurn_v21`, `claraWork_v5`, `statementFacts_v3` | **ALLOWED** | 0 |
| **E** | the body-complete roster with **no contracts declared** — the pre-`#1035` image | the same three | **REFUSED (frontier_requires_contract)**, naming both rules | 1 |

**Reading A is the one the release runbook's step 9 must record, and this time it is an ALLOW.** Verbatim:

```
rollback-preflight: target supports 60 body(ies) and declares 2 door contract(s) — from bundle packages/runtime/.output/server/index.mjs
  GLOBAL (the whole database — this is what the exit code follows)
    non-terminal workflow runs: 3 across 3 name(s)
      ok 1x chatTurn_v22  (workflow//./workflows/chatTurn.v22//chatTurn_v22)
      ok 1x claraWork_v6  (workflow//./workflows/claraWork.v6//claraWork_v6)
      ok 1x statementFacts_v4  (workflow//./workflows/statementFacts.v4//statementFacts_v4)
    live tasks bound to NO run: 0
    verdict: ALLOWED
  THE DATABASE'S OWN RULES (frontier vs the target's bodies AND its door contracts — global, no scope clears them)
    clara.schema_migrations frontier: 0361_reservation_release_advice
    rules checked: 0195_work_egress_purpose_and_execution_trace, 0254_intake_refusal_record, 0279_fa_closed_year_arrears
    contracts the target declares: fa_parked_run_v1, intake_refusal_record_v1
      ok  the target satisfies every rule the applied schema carries
rollback-preflight: ALLOWED — every in-flight body is carried by the target image.
```

**Reading C exists so that reading A is not vacuous.** Drop one body from the same roster and the same
database at the same frontier answers REFUSED, one refusal line, naming it:

```
rollback-preflight: REFUSED (global)
  - 1 non-terminal run(s) on claraWork_v6, which the target image does NOT carry (workflow//./workflows/claraWork.v6//claraWork_v6).
```

**Reading E is `#1035`'s and `#1131`'s rule read outside the drill**, at the frontier the release will
actually run at, and it refuses both ways forward the census refusal offers — the CLI says so itself:

```
  - frontier_requires_contract: this database is at 0361_reservation_release_advice, and 0254_intake_refusal_record requires the image to understand the intake_refusal_record_v1 door contract, which the target does NOT declare.
  - frontier_requires_contract: this database is at 0361_reservation_release_advice, and 0279_fa_closed_year_arrears requires the image to understand the fa_parked_run_v1 door contract, which the target does NOT declare.

  The frontier refusal is NOT drainable: it is a rule in the applied schema, not a row in a queue. And a DOOR-CONTRACT refusal has neither of the census refusal's two answers…
```

Every reading printed `live tasks bound to NO run: 0`. Reading B carries the CLI's own
`*** UNVERIFIED SET ***` banner, which is correct and is the reason A rather than B is the reading the
runbook should quote.

**What this means for the release runbook.** `CUT-PLAN` §2.9's obligation — the previous image is a legal
rollback target only until the first non-terminal run of a newly pinned body exists — **does not bind this
wave**, because no pin moves. The previous build (`refresh-061a6992`) carries every body any run of this
build can be parked on and declares both door contracts the applied schema requires at `0361`. Step 9 is
still run and still recorded as a timestamped snapshot, and the expected answer is **ALLOWED**.

---

## 5 · Findings

### F1 · NOTE (carry-forward, not new) — the EICAR cell reds on this host

`scanner rejects EICAR, encrypted PDF, and XML entity expansion`, `tests/intake-unit.test.mjs:114`.
Windows Defender removes the fixture between the guard's probe and the read (`UNKNOWN: unknown error,
open …eicar.bin`). **RIG.md's standing list; #693.** `tests/intake-unit.test.mjs` is not touched by this
wave, and the cut phase's own whole-suite run recorded the same red. The two `#693` cells whose whole job
is to describe the quarantine are green. Not this wave's, and not to be "fixed" by a gate.

### F2 · NOTE (carry-forward, not new) — the `pg_dump` host probe reds on this host

`(#806) this host's OWN probe: pg_dump/psql are on PATH here (RIG-MAC.md's toolchain), so this rig runs,
not skips`, `tests/pg-tools-fixture.test.mjs:33`. They are not on this Windows host's PATH. **RIG.md's
standing list.** Eleven further cells skip on the same fact. Same file untouched, same red in the cut
phase's run.

### F3 · NOTE — the cut's third red did NOT reproduce, and that is a measurement, not a fix

`waveC-merge.md` recorded three whole-suite reds; its third was
`637.pf: B2 — a name scope may NOT allow while an out-of-scope body is stranded`, diagnosed there as
**shared-database contamination** (24 non-terminal `workflow.workflow_runs` rows left by earlier files),
proven by the same file being 44/44 green on a pristine clone. In this gate's whole-suite run on a shared
database, **`637.pf: B2` is green**, and so is every other `637.pf` cell. Nothing in this wave targets
that contamination, so the honest reading is that the leftovers this particular run left did not happen
to land on B2 — the class is still live and `CUT-PLAN` §4.1's warning still stands. It is recorded here
so that a future run that reds on B2 or B3 is recognised as the same class rather than as a new defect.

### F4 · NOTE — `world-gate`'s peak-RSS line is blank on this host, again

`budget 2048 MB | peak RSS unavailable (no /proc on this platform)`. Linux-only by construction and by
the launcher's own design; identical to `waveC-gates.md` F3. The budget was honoured (exit 0, no
SIGABRT), but the peak figure this wave's runs used is UNVERIFIED on this rig.

### F5 · NOTE — the provisioning command exists, and neither RIG.md nor `packages/runtime/README.md` names it

`waveS-merge.md` §16.1 recorded three dead ends for provisioning the WDK schema and concluded "no script
in `packages/runtime` provisions it, so the schema is a DEPLOY CEREMONY step". The first half is exact —
there is no npm script — but the command does exist as a dependency bin
(`packages/runtime/node_modules/.bin/bootstrap` → `@workflow/world-postgres/bin/setup.js`), it is one
line, and `waveC-gates.md` §1.1 already used it for the cut's own cluster. The cost of it not being in
RIG.md is measurable: a whole lane's 22 cells went unverified through an integration merge. **The durable
home RIG.md itself names for rig guidance is the repository's `README.md` under "Develop"** (#1124's own
ruling, RIG.md's fourth paragraph). A one-line addition there — *"a database that must serve World legs
needs `pnpm --filter @clara/runtime exec bootstrap` once, with `WORKFLOW_POSTGRES_URL` set; no migration
creates the `workflow` schema"* — would retire this. **Not fixed here: a gate reports, it does not
commit.** Suggested as a follow-up ticket for the orchestrator.

---

## 6 · Rig hygiene, and what is left behind

| | |
|---|---|
| cluster built | `rigsweepc`, 17/55708, `C.UTF-8` |
| databases created on it | `clara_wave_b_ci`, `clara_rt_test`, `clara_pristine` |
| cluster dropped | `sudo pg_dropcluster 17 rigsweepc --stop` → **DROPPED**; `pg_lsclusters` no longer lists `rigsweepc` |
| clusters touched that were not mine | **none** — `rigw4` (55700) was read once, for `pg_hba.conf` only, with `cp`; 55701, 55702 and 55707 were never contacted |
| worktree 636 | `git status --porcelain` **empty** before and after; HEAD still `d812c2124` |
| gitignored artefacts left in 636 | `packages/runtime/.output/` (pre-existing, the merger's build — reused, not rebuilt) and an **empty** `.scratch/` |
| files written outside the scratchpad | **this report only** |
| processes killed | none this gate did not start; the drill stops its own builds with SIGTERM and did so for all three |

---

## 7 · Anything unverified

1. **The live machine's own bundle was not read.** The rollback readings are taken against the built
   artifact at this head and against the same roster typed in. That artifact's roster is byte-identical to
   `origin/main`'s and to the hosted image commit `061a6992b`'s at source (§4.0), so the verdict is
   determinate — but **streaming `refresh-061a6992`'s `/app/.output/server/index.mjs` off the machine and
   re-reading it is owed to the release window**, which is the only place it can be done, and is what the
   brief allows to be recorded as owed. It is a confirmation, not a question: an image whose registry and
   contract roster are identical cannot declare a different set.
2. **`world-gate`'s peak RSS** — F4. Linux-only.
3. **The 22 cells were proved on THIS rig, not on the runner.** They are green under Windows Node 22
   against a provisioned schema. RIG.md's wave-2 addendum asks that new runtime test files be re-run once
   under WSL as user `runner`; that is the integrator's step and `waveS-merge.md` does not record it for
   lane L6's four files. Not this gate's to run, and named so it is not assumed done.
4. **`apps/web`, the browser suite, the upgrade path, the collation twin and the from-scratch census are
   not this gate's.** They are Gates A and B; nothing here speaks to them.
5. **The whole runtime suite ran ONCE.** A cell that is red only intermittently would not be separated
   from a stable red by a single run. Both reds seen are named files with named, standing causes, and both
   were red in the cut phase's independent run too, which is the next best thing to a second run.
6. **`clara_pristine` is a template copy, not a second from-scratch chain.** No cluster ran the chain twice
   (0154 pins the cluster-wide role count), and `CLARA_RIG_ALLOW_RESET` was never set.
