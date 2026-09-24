# Wave 4 · lane 07 · ticket #1041 — dispatch-only CI legs red on main

**Branch** `riders/w4-lane07`, base `cd2925391` (the integrated head of wave 3).
**Status** DONE for everything provable without a dispatch; **three acceptance criteria need the
orchestrator's `gh workflow run ci.yml --ref riders/w4-lane07`** (listed under "Needs the dispatch").
**Migration** none — this ticket takes none and needed none. No prestate pins.

## Commits (`git log --oneline cd2925391..HEAD`)

| commit | subject |
|---|---|
| `aaf2cf21b` | `fix(ci): #1041 the Wave-A drill database name the cleanup can actually drop` |
| `d5588321c` | `fix(db): #1041 the x41 rig speaks the revise door's grammar at BOTH frontiers` |
| `52c180092` | `fix(db): #1041 the d-b1 claiming-door censuses are frontier-keyed` |
| `28045cc20` | `fix(ci): #1041 the frontier legs preload the estate's gate chain, and the floor counts cells` |
| `574d86e66` | `fix(db): #1041 the 0041 drill's four seeds are four name families` |

21 files, +729 / −41. No migration, no frozen body, no closure module, no `apps/web` file.

## The seams I tested at (written before the first test, work-order rule 4)

The brief names four interfaces, and each is a seam a cell can drive:

1. **`packages/db/tests/rig-cluster-reset.mjs`'s `dropDatabase(name)`** — the public refusal the
   cleanup step meets. Its grammar is the seam; PostgreSQL's own `quote_ident` is the independent
   oracle for *why* it is the grammar.
2. **`.github/actions/frontier-leg`** — what the composite RUNS: the preload flags on every
   `node --test`, and the floor arithmetic it applies to the TAP summary. Both are text a cell can
   read and shell a cell can run verbatim.
3. **The x41 rig's revise fixture** (`x41-fa-fixtures.mjs`'s `reviseParticulars`) against the real
   `clara.revise_fixed_asset_particulars`, at two frontiers.
4. **`clara.begin_client_onboarding`** (through `wb.onboardingClient`) against #899's live
   name-family wall — the door the 0041 drill actually died on.

No cell was written at a seam the brief does not give. The 106-gate chain, the slice lists and the
four frontier databases are the rig those seams are exercised on, not seams themselves.

## The rig I measured on (reproducible)

Four throwaway databases on the lane-07 cluster, built exactly the way `frontier-leg` builds its
own (numeric compare, `CLARA_MIGRATIONS_DIR` pointed at the copy):

    for F in 0042 0043 0044 0045; do mkdir -p $RIG/mig-$F
      for f in migrations/[0-9][0-9][0-9][0-9]_*.sql; do n=$(basename $f | cut -c1-4)
        [ "$n" -le "$F" ] && cp "$f" $RIG/mig-$F/; done; done
    # createdb clara_fr_b{0,1,2,3}_ci, then per frontier:
    PGDATABASE=clara_fr_b0_ci CLARA_MIGRATIONS_DIR=$RIG/mig-0042 node scripts/migrate.mjs
    GATES="$(node scripts/print-gate-chain.mjs)"
    PGDATABASE=clara_fr_b0_ci CLARA_MIGRATIONS_DIR=$RIG/mig-0042 CLARA_RIG_DB=1 \
      node --test --test-concurrency=1 $GATES <the list's files>

Migration counts matched CI's exactly (41 / 42 / 43 / 44), and the **baseline reproduced dispatch
35893727271 cell-for-cell** before any fix: d-b0 `153 tests / 122 pass / 27 fail / 4 skip`.
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set; no second from-scratch
chain was run; the four databases were dropped afterwards through `rig-cluster-reset.mjs`
`--drop-database=` (never `--sweep-roles`), leaving the cluster as found (`clara_l07` only).

## What was actually wrong — six independent defects, not one

| # | leg | cells | cause |
|---|---|---|---|
| 1 | d-b0 | 26 | `x41-fa-fixtures.mjs` sent 0227's `change_class` / `change_reason` keys unconditionally; at frontier 0042 the door refuses `CLR37 particulars carries an unknown key "change_class"`. Also killed the d-b3 **drill**. |
| 2 | d-b0 | 1 | `x41.b3` needs #972's `fa_birth_watermark$`; the leg preloaded no gates, so the inline premise check failed loudly instead of standing that one assertion down. |
| 3 | d-b1 | 2 | `x42v.g4` / `x42.ra4` assert EXACT rosters that grew with 0216 and 0221 — both above 0043. |
| 4 | d-b2 | 4 | #927's retirement cells, whose gate module the leg did not preload (its own refusal message says to). |
| 5 | closed-wave | — | the 0041 drill's four seeds share the leading token `u41k`, and #899 [0287]'s birth wall refuses the third. That failure skipped the six drill steps after it. |
| 6 | closed-wave | — | `clara_waveA_upgrade_ci` is not a name `dropDatabase` accepts, so the `always()` cleanup failed too. |

The ticket attributes 1 to "#932's 0277". **Corrected, measured:** the keys are **#651's 0227**
(`0227_depreciation_history.sql`; `x41-fa-fixtures.mjs:267` names #651 itself). Same defect,
different premise migration — the stem I keyed the fix on is `depreciation_history$`.

## Acceptance criteria

### AC1 — `gh workflow run ci.yml --ref <branch>`: all five legs green, run id recorded

**NEEDS THE DISPATCH.** I cannot push or dispatch. What I can hand over is the local equivalent of
every leg's own test steps, run verbatim:

| leg | frontier | before (CI 35893727271) | after (local, gates preloaded) |
|---|---|---|---|
| d-b0 | 0042, 41 migrations | 153 / **122 pass / 27 fail** / 4 skip | 153 / **149 pass / 0 fail** / 4 skip |
| d-b1 | 0043, 42 migrations | 82 / **74 pass / 2 fail** / 6 skip | 82 / **76 pass / 0 fail** / 6 skip |
| d-b2 | 0045, 44 migrations | 169 / **161 pass / 4 fail** / 4 skip | 169 / **161 pass / 0 fail** / 8 skip |
| d-b3 | 0044, 43 migrations | list 74 / 70 / 0 / 4 **+ drill 1 fail** | 74 / 70 pass / 0 fail / 4 skip |
| contract roster | 0042 | (never reached) | 12 / 4 pass / 0 fail / 8 skip |
| contract roster | 0044 | 12 / 8 pass / 0 fail / 4 skip | 12 / 8 pass / 0 fail / 4 skip (unchanged) |

The roster was run at 0042 **with and without** the gate chain and is identical (4 pass / 8 skip):
preloading does not quieten a cell that was asserting.

### AC2 — a focused run still fails loudly; a gated estate sweep skips

**DONE, driven.** `tests/x42-adjustments.test.mjs` at frontier 0045 (`clara_fr_b2_ci`):

* focused, no `--import`: `not ok 1/2/3` — `x42.t1`, `x42.t2`, `x42.t3`, each carrying #927's own
  sentence *"this is a FOCUSED run and must fail loudly, not skip"*. `10 tests / 7 pass / 3 fail`.
* with `--import ./tests/adjustment-template-doors-retired-preintegration-gate.mjs`:
  `ok 1/2/3 … # SKIP 0282 not applied`, `10 tests / 7 pass / 0 fail / 3 skipped`.

The gate's contract is kept exactly; the leg simply stopped being a focused run, which it never was.

### AC3 — the 0041 drill passes on the current main chain with the name-family wall live

**PARTIAL — the fixture is fixed and proven; the drill itself NEEDS THE DISPATCH.**
`x41-0041-upgrade.test.mjs` is reset-gated, and RIG.md forbids this rig to set
`CLARA_RIG_ALLOW_RESET`; a from-scratch chain here would also die at 0154's cluster-wide role
census (18 roles live, 14 expected). So the proof runs at the seam the drill died on instead.

`tests/drill-fixture-name-family.test.mjs` `p1041.drill.name_family`, on the live 0295 lane
database with the wall in the catalog:

* the drill's **pre-fix** spelling `u41k_<label>_<hex6>` — two admitted, the **third refused
  `CLR10 … matches 2 existing clients or counterparties in your firm`**, the exact message CI
  printed;
* the drill's **post-fix** spelling `u41k<hex8>_<label>` — all four admitted, four distinct clients.

`p1041.drill.name_source` ties that to the drill's own source (the unique part must lead), and was
RED on `u41k_${label}_${randomUUID().slice(0, 6)}` before the fix, naming the token and the remedy.

### AC4 — `rig-cluster-reset` accepts the drill's database names, grammar rule in its README

**DONE.** The grammar was RIGHT and the NAME moved, and the README says why, because the choice is
decided by a measurement rather than a preference:

    create database clara_case_probe_A_ci;      -- pg_database gets clara_case_probe_a_ci (folded)
    PGDATABASE=clara_case_probe_A_ci  ->  3D000 database "clara_case_probe_A_ci" does not exist

`create database <x>` case-folds an unquoted identifier; `PGDATABASE` is a LITERAL libpq name. A
mixed-case drill name therefore names two different databases in the two lines of its own step —
the drill step itself would have failed on the connect even if the cleanup had accepted the name,
so widening the grammar would have hidden a second defect rather than fixed one.
`clara_waveA_upgrade_ci` → `clara_wave_a_upgrade_ci` in the action, in `wave-a-upgrade.test.mjs`'s
header recipe, in `reset-gate-routing.test.mjs`'s `NEWLY_COVERED` and in
`packages/db/tests/README.md`, which now carries "The drill database-name grammar (#1041)".
`CONFORMING_DB_NAME` is exported from `rig-cluster-reset.mjs` (its own `dropDatabase` reads it
rather than re-spelling the regexp), and `tests/ci-drill-database-names.test.mjs` censuses every
literal database name in BOTH dispatch-only composite actions against it, against `EPHEMERAL_DB`
and against `quote_ident` — both cells RED on the old name first.

### AC5 — `ci.yml` carries the schedule trigger; `CI=true GITHUB_ACTIONS=true pnpm lint` exits 0

**ALREADY SATISFIED (schedule) + DONE (lint).** No `ci.yml` change was needed and none was made
(work-order rule 3). `ci.yml:12-14` has `schedule: - cron: "23 19 * * 3"` (weekly, Thu 03:23 MYT),
present since `dc39c38ce` (2026-08-11); `closed-wave-drills` (`ci.yml:433`) and
`db-slice-frontiers` (`ci.yml:471`) both carry
`if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`, so they run on
that schedule and stay off the PR gate; the terminal `ci` job (`ci.yml:614-625`) already fails
closed both ways — the legs must be `success` on schedule/dispatch and `skipped` on
pull_request/push. `CI=true GITHUB_ACTIONS=true pnpm lint` exits **0**.

## What I built, and why each choice

* **A frontier-compat fixture, not a gate, for `change_class`.** A gate lets a cell stand down; 26
  d-b0 cells would then have dropped out while still being perfectly good tests of the supersede
  arithmetic. `fa-authority-sign-compat.mjs` already exists for exactly this — its own header says
  the x41 rig "must keep working at BOTH frontiers, because `db-slice-frontiers` runs this package
  against chains that predate 0227". `reviseTakesChangeClass()` joins `signTakesAuthorityRef()`
  there. It keys on the migration STEM and not the catalog because 0227 moved a JSONB KEY, not an
  arity: there is no signature to feature-detect, and probing the door's own body would ask the
  subject under test what it should be. `fa-rig-frontier-compat.test.mjs` cross-checks the switch
  (which reads the chain) against the live door (which the cell reads) — green on BOTH arms.
* **Stem-keyed rosters, not skips, for the two d-b1 censuses**, for the same reason and with the
  same instrument. The arms that MEASURE each late-joining name (the deferred birth trigger, the
  UPDATE-side widening probe, the fourth inheritor's discriminator) moved with their roster entry,
  because an arm is that entry's own classification.
* **The gate chain is DERIVED, not copied.** `packages/db/scripts/print-gate-chain.mjs` reads
  `package.json`'s `test` script; the action calls it in all three places it runs tests (the slice
  list, the cross-slice contract roster, the slice's own drill).
  `ci-frontier-leg-contract.test.mjs` holds the output to the gate modules ON DISK, in both
  directions (106 = 106 today).
* **The cell floor counts CELLS, and the skips got their own bound.** The old check compared
  PASSES, which answered "is the cell still there" and "does it still assert at this frontier" with
  one number — and only the first is a deletion, which is the whole reason the floor exists (the
  totality gate is file-granular). With the gates preloaded a lawfully gated cell skips, and a
  pass-floor reads that as a deletion. The leg now asserts `fail = 0`,
  `pass + skip >= #!cells-floor`, and `skip <= #!skips-max`. **Every floor went UP** —
  149→153, 76→82, 168→169, 70→74 — so nothing was lowered to go green, and the skip bound is
  coverage the pass-floor never had. `partition-total` requires both declarations on every PR (it
  runs on the PR gate; the frontier legs do not).

### d-b2's pass side is 161, not the 168 its header measured — both halves accounted

* **−4** are #927's retirement cells (`x42.k1`, `x42.t1`, `x42.t2`, `x42.t3`). 0282 is far above
  0045 and the three doors are LIVE at 0045, so they cannot pass here; asserting the
  pre-retirement behaviour instead would change what the slice list asserts (explicitly out of
  scope). The estate's own gate skips them, which is what a gate is for.
* **−3** left the corpus lawfully in commit `1a824cae7` ("#927 retarget the eight x42-adj
  batteries"): `x42-adjustments.test.mjs` 12 → 10 cells (five dead propose/sign lifecycle cells
  replaced by three closed-door cells) and `x42-adj-canon.test.mjs` 2 → 1. Counted per file with
  `git show 1a824cae7^:… | grep -c '^test('`. That commit never touched the floor — the rot this
  ticket is about — and the new cell floor of 169 records it instead of absorbing it.

## Gates, with counts

| gate | command | result |
|---|---|---|
| touched/added db test files, full 106-gate chain, `clara_l07` @0295 | `node --test --test-concurrency=1 $GATES <9 files>` | **31 tests / 26 pass / 0 fail / 5 skipped** (the 5 are the two reset-gated drills' own skips) |
| `operation-census` + `rig-isolation`, full gate chain, no reset flags | same | **33 tests / 32 pass / 0 fail / 1 skipped** |
| d-b0 list @0042 | frontier rig | **153 / 149 / 0 / 4** |
| d-b1 list @0043 | frontier rig | **82 / 76 / 0 / 6** |
| d-b2 list @0045 | frontier rig | **169 / 161 / 0 / 8** |
| d-b3 list @0044 | frontier rig | **74 / 70 / 0 / 4** |
| contract roster @0042 · @0044 | frontier rig | **12 / 4 / 0 / 8** · **12 / 8 / 0 / 4** |
| x41 at the estate frontier | `x41-depreciation` + `x41-belt` @0295 | **17 / 17 / 0 / 0** |
| the two censuses at the estate frontier | `x42-reservation-authority` + `x42-advances-gap` @0295 | **8 / 8 / 0 / 0** |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files, no manifest diff |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| typecheck | `pnpm typecheck` | **exit 0** (see the rig note below) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |

`apps/web` was not touched (`git diff --stat cd2925391..HEAD -- apps/web` is empty), so no unit
suite and no browser walk was owed; none was run.

**Rig note — typecheck.** The first `pnpm typecheck` failed with
`apps/web/components/ui/message-scroller.tsx(9,8): error TS2307: Cannot find module
'@shadcn/react/message-scroller'`. That file and that import are byte-identical at base
`cd2925391`, `@shadcn/react@^0.3.1` is declared in `apps/web/package.json` and present in
`pnpm-lock.yaml` — it had simply never been materialised into worktree 657's `node_modules` (this
lane's install predates #970). `pnpm install --frozen-lockfile` in this worktree added it
(`+10 packages`, lockfile unchanged, `git status` clean) and typecheck then exits 0. Nothing in the
tree was changed for it; **other lane worktrees are likely to carry the same install gap.**

## Vacuity controls (work-order rule 4)

* `p1041.dbname.grammar` and `p1041.dbname.roundtrip` — both RED on `clara_waveA_upgrade_ci` before
  the rename (`actual: 'clara_waveA_upgrade_ci'` / `actual: '"clara_waveA_upgrade_ci"'`), green
  after. The round-trip cell carries its own non-vacuity arm: it re-asks `quote_ident` about that
  literal name and fails if the oracle ever accepts it.
* `p1041.compat.change_class` — RED as a `SyntaxError` before the export existed; then green on
  **both** arms (0295: stem applied and the door knows the key; 0042: neither).
* `p1041.gates.script` / `p1041.gates.action` / `p1041.floor.declared` / `p1041.floor.action` —
  each RED before its own implementation step, each naming the thing that was missing.
* `p1041.drill.name_source` — RED on the drill's real pre-fix template.
* **The new floor block, run verbatim against doctored TAP summaries** (d-b0's list: declared floor
  153, skips-max 4):
  * `148 pass / 0 fail / 4 skip` → `CELL FLOOR BREACHED: … ran 152 cells, floor 153 — a cell was
    DELETED inside a still-listed file` (exit 1)
  * `148 pass / 0 fail / 5 skip` → `SKIP BOUND BREACHED: … skipped 5 cells, at most 4 may — a cell
    stopped asserting at this frontier` (exit 1)
  * `149 pass / 1 fail / 4 skip` → `the d-b0 list is not green` (exit 1)
  * a summary with no `# skipped` line → refused by name (exit 1)
  This is the pair the old pass-floor could not tell apart, now told apart.
* The whole d-b0 and d-b1 baselines reproduced CI's numbers exactly before any fix (122/27, 74/2).

## Needs the orchestrator's dispatch of `ci.yml` on this branch

1. **AC1 in full** — only a dispatch can put a run id on "d-b0..d-b3 and closed-wave-drills all
   green". Everything the four frontier legs RUN is proven locally, step for step; the run id is
   not.
2. **AC3's second half** — the 0041 drill's own destructive path. It is reset-gated and RIG.md bars
   this rig from `CLARA_RIG_ALLOW_RESET`; the fixture defect that killed it is fixed and proven
   against the live wall, but the drill has not executed anywhere since the fix.
3. **The six closed-wave drill steps that never ran in run 35893727271.** The 0041 failure skipped
   them, so their state on the current main chain is genuinely unknown, not "green":
   Wave-D-b split upgrade drill · Hardening-A recut-guard · Hardening-B populated upgrade ·
   0186 checkout-convergence · Slice-4 runtime upgrade/cutover · Wave-A 0011 fresh-vs-upgrade
   parity. The `wave-e-contract-drills` action in the same job never ran either. **The Wave-A step
   in particular has never executed at all** — #1023 added it in wave 3, and the first dispatch
   after that is the one that died before reaching it; its database name was wrong in both
   directions (create-vs-connect, and cleanup), which is what this ticket fixed, but the drill body
   itself remains unexercised in CI.
   I scanned those six for the #899 name-family shape: only the 0041 drill births through
   `begin_client_onboarding`; `x42-split-upgrade-kit.mjs` and `rig-runtime-upgrade.test.mjs` mint
   through `clara.create_client`, the residual #899's own census records as still unwalled.

## Deliberately left

* **What the slice lists assert** — untouched (the ticket's own out-of-scope). The #927 cells were
  gated, not re-aimed at the pre-retirement behaviour.
* **The dispatch-only legs stay off the PR gate.** The only thing that moved onto the PR gate is
  `partition-total`'s one-line `#!skips-max:` requirement, which is free and database-free.
* **`clara.create_client`'s missing birth wall** — #899's own recorded residual, not this ticket's.
* **RIG.md** — not edited (a shared plan doc other lanes are reading this wave). The
  `node scripts/print-gate-chain.mjs` recipe that replaces its "copy the `--import` flags out of
  `package.json`" instruction is documented in `packages/db/tests/README.md` instead; the
  orchestrator may want to carry it into RIG.md.

## Docs (in the same commits)

* `packages/db/tests/README.md` — "The drill database-name grammar (#1041)" in the
  `reset-gate-routing` section (AC4's rule, with the measurement), and three paragraphs in
  "Preintegration gates": the one-roster rule with the `print-gate-chain.mjs` recipe, why
  `db-slice-frontiers` preloads the whole chain, and the distinction between a GATE (a cell stands
  down) and a FRONTIER-COMPAT fixture (a cell keeps running on both sides of a door's grammar).
* `.github/actions/closed-wave-upgrade-drills/action.yml` — the Wave-A step records why the name
  moved instead of the grammar.
* `.github/actions/frontier-leg/action.yml` — step (3a) records why an old frontier IS an estate
  sweep, and step (3b) records why the floor counts cells and bounds skips.
* The four slice lists carry their re-measured numbers and, for d-b2, the full arithmetic of the
  −4 and the −3.
* No `CONTEXT.md` change: no new domain vocabulary (the new terms are rig terms and live in the
  test README).

## Successor contract

**None.** No frozen chat or Work tool needs anything from this ticket: no door, no zod input, no
part kind, no prompt stanza, no refusal mapping changed. The only exported surface added is
rig-side — `CONFORMING_DB_NAME` and `reviseTakesChangeClass()` / `DEPRECIATION_HISTORY_STEM` in
`packages/db/tests`, plus the `packages/db/scripts/print-gate-chain.mjs` CLI — and none of it is
reachable from `packages/runtime` or `apps/web`.

## Follow-ups worth filing

1. **Every lane worktree may be missing `@shadcn/react`.** Worktree 657's install predated #970;
   `pnpm typecheck` fails there until `pnpm install --frozen-lockfile` is run. Cheap to check
   across the rig before the next wave's lanes report a phantom red.
2. **`db-split-partition-total` could assert the floors are MEASURED, not guessed.** It now checks
   both directives exist; it cannot check the numbers. A dispatch that recorded each leg's
   `pass/fail/skip` into the run summary would make a stale floor visible without a human diffing
   logs.
3. **The weekly schedule has clearly not been green for some time.** #927 [0282] landed a retarget
   (`1a824cae7`) that changed the d-b2 corpus and never moved the floor, and #638 [0221] widened a
   census the d-b1 frontier cannot satisfy — both well before riders wave 3. Worth asking whether
   the scheduled sweep's result is READ by anyone, because the trigger existing is not the same as
   the red being noticed.
4. **The Wave-A 0011 drill's body has never run in CI** (see "Needs the dispatch", item 3). If the
   post-fix dispatch turns it red, that is #1023's drill meeting CI for the first time, not a
   regression from this ticket.

## Anything unverified

* **AC1's run id, AC3's drill execution, and the six skipped closed-wave drills** — see "Needs the
  dispatch". Stated as unverified rather than green.
* **The frontier legs' non-test steps** — the presence gate (0), the chain materialisation (1), the
  migrate (2), the cluster cleanup (3d) and the isolated-drill database creation (4) were not
  re-run locally: (3d) sweeps cluster-wide roles and (4) needs `CLARA_RIG_ALLOW_RESET`, both barred
  on this rig. I changed the GATES lines and the floor block inside steps (3) / (3b) / (3c) / (4);
  I did not change (0), (1), (2) or (3d). The floor block itself WAS run verbatim, five ways.
* **The other lane clusters.** Every number here is lane 07's cluster, PostgreSQL 17 at
  `127.0.0.1:55747`.
* **Windows-only**: nothing in this ticket depends on a Windows path or a Windows-only red. The
  four new test files read repo files through `node:path` joins and query the database; the shell
  I proved verbatim is the action's own `bash -e` block, run under Git Bash.

---

## Fix round 3 (D-b2 drill on the current frontier)

**Two commits.** Branch head moves `a3019c4c3` -> `5492d5a56`; tree clean. No migration, no slice
list and no floor change.

| commit | subject | files |
|---|---|---|
| `6ef2e0fa6` | `fix(db): #1041 the D-b2 drill restores the authority window 0227's backfill stamps` | 4 files, +160 / -6, all `packages/db/tests` |
| `5492d5a56` | `fix(ci): #1041 the Wave-A 0011 drill sweeps chain-minted roles between its five replays` | 2 files, +51 / -16 (`wave-a-upgrade.test.mjs` and the composite action) |

The second exists because the first one let the job REACH five steps it had never reached, and the
last of them was red. Both are in this section.

### The red

Dispatch run `35957081528`, job `107497574792`. `db-slice-frontiers` d-b0 to d-b3, `db-estate` and
`db-live-gates` all green; `closed-wave-drills` green through seven drills and red at the eighth
and last:

```
not ok 1 - D-b2 upgrade drill: the WHOLE split chain 0042→0043→0044→0045 lands on a populated book …
  error: '[D-b2] mandatory setup: a depreciation period is still due after the apply'
  code: 'ERR_ASSERTION'
  at assertPreExistingSurfacesStillWork (packages/db/tests/x42-split-upgrade-kit.mjs:377:10)
```

### The cause — measured, and NOT the one the hand-over named

The hand-over attributed it to riders wave 3 (0279 #975's fourth outcome, 0293's arrears judgement
scope, 0277 #932's `change_class`). **Corrected, driven:** the cause is **#651 [0227] section D8**,
and wave 3 is not in it. 0279 recut the oracle body and carried D8's floor through unchanged; the
arrears keys it added are present and empty on this book
(`closed_arrears: {arrears_cents: 0, fiscal_years: []}`).

`0227_depreciation_history.sql` adds `clara.fa_depreciation_authorities.authority_from` and
backfills it for every already-signed row at **the first day of its SIGNING month**
(`0227:346-350` — the one line of that file escalated to the orchestrator and ratified). The due
oracle then floors on it (`0227:1047-1051`, "THE AUTHORITY WINDOW'S FLOOR (D8) — a signature is not
permission to charge every past period"), and a period is due only once it has **ENDED**.

The drill signs its authority at the 0041 frontier, i.e. by the rig clock, and then applies
**0001..HEAD** — `MIG_DIR` defaults to the whole migrations directory, and the drill file's own
header says so. So the apply stamps the floor at the current month while every month the book still
owes falls below it. Driven on the post-apply database:

| read | value |
|---|---|
| `authority_from` after the apply | `2026-09-01` |
| `date_trunc('month', signed_at at Asia/Kuala_Lumpur)` | `2026-09-01` (equal: the backfill is correct) |
| oldest month the book still owes | `2026-04-01` |
| `clara.depreciation_run_due` | `{"due":false,"reason":"period_not_ended", …}` |
| `clara._book_today()` | `2026-09-24` |

This is a **fixture premise a migration moved, not a product defect**, and the estate already says
so in its own words. The `backdateAuthorityFloor` docstring in `fa-authority-sign-compat.mjs`:
"0227's D8 stamps `authority_from` as the first day of the SIGNING month and freezes it, so a
fixture that signs today can only ever produce a floor of 'this month' — and since a period is due
only once it has ENDED, NOTHING is ever due for such a client. That is correct product behaviour
(`p651.authority.floor` proves it against the real door)." Every x41 cell dodges it by back-dating
at SIGN time (`x41-fa-world.mjs:273-277`, guarded by `signTakesAuthorityRef()`). The four Wave-D-b
drills are the one family that cannot: at their frontier the column does not exist yet, and the
stamp lands inside the `migrate()` call the drill is measuring.

A real firm upgrading to 0227 carries an authority signed months ago, so the backfill floors it in
the past and its sweep keeps charging. Only a book whose authority was signed in the CURRENT month
is floored out of its own arrears, and the drill's book is one purely because the rig clock is
today.

**Why the drill only met this now.** It never got this far before. Fix round 1 found the x41 rig
sending 0227's `change_class` key unconditionally, which killed `reviseParticulars` at the pre-0042
frontier: the drill died at "mandatory setup: a REAL lineage edge exists pre-apply", long before
the apply. The same defect skipped the whole `closed-wave-drills` job at the 0041 drill in dispatch
`35893727271`. So this is the next defect in line behind the ones already fixed, not a regression
from them.

### The seam I fixed at, and why

**`packages/db/tests/fa-authority-sign-compat.mjs` — the estate's ONE labelled site for this
floor.** `restoreAuthorityWindowAfterApply(client, { firstPeriodStart, label })` joins
`backdateAuthorityFloor()` there as its post-apply twin, and the shared probe calls it before it
asks the oracle anything.

It **asserts the backfill before it stands it down**, because restoring the floor silently would
let a broken backfill through:

1. the stamp equals 0227 D8's documented rule, written out as `date_trunc('month', signed_at at
   time zone 'Asia/Kuala_Lumpur')` rather than read back out of `clara._fa_month_start` — 0227's
   own header states that composition, so the plain-SQL spelling is the rule and not the code;
2. that stamp really does sit above this book's whole depreciation history, which is the reason the
   oracle went quiet;
3. only then does the floor move to the first period the book actually ran.

Nothing is deleted and no assertion is relaxed: `assertPreExistingSurfacesStillWork` still drives
the MACHINE sweep through the due oracle, still posts a charge, still approves it, and still
settles a bank line. Answering the hand-over's question directly: the due-read **legitimately**
reported no due period, and the fix drives the premise back to the state a genuinely pre-0227
authority carries rather than relaxing the claim.

**The frontier switch is `information_schema`, never `signTakesAuthorityRef()`.** That helper is
memoised per process and the drills ask it at the PRE-apply frontier, so after an apply its answer
is stale by construction — a trap worth naming, because it is the obvious thing to reach for.
Below 0227 the helper returns `{windowed:false, authorityFrom:null}` and writes nothing, so the
three frontier-leg drills (0042 / 0043 / 0044, whose `CLARA_MIGRATIONS_DIR` stops below 0227) are
untouched.

`buildPre0042Book()` now also returns `rampPeriod` — the period its first charge ran, taken from
the oracle's own answer at the pre-apply frontier — because that is where this book's depreciation
history begins and the restorer needs it.

### The rig I measured on

A disposable PostgreSQL 17 cluster created for this round alone, per the #867 role census (the
composite migrates fresh databases from scratch, which is barred on a cluster that already carries
a Clara database):

```
wsl -u root -- pg_createcluster 17 rigd07 -p 55703 --locale=C.UTF-8 --start
# trust auth copied from the lane cluster's pg_hba.conf; reachable from Windows at 127.0.0.1:55703
```

Port 55703 because Windows cannot reach 55772 to 55871 today. Dropped at the end of the round
(`pg_dropcluster 17 rigd07 --stop`). The lane cluster at 55747 never ran a drill.

### Local results, the action's own commands verbatim

| drill | file | before | after |
|---|---|---|---|
| **Wave-D-b split (D-b2)** | `x42-0045-b2-upgrade` | 1 test / **0 pass / 1 fail** | 1 test / **1 pass / 0 fail** |
| Wave-D-a 0041 | `x41-0041-upgrade` | green in CI | 1 / 1 / 0 |
| Hardening-A | `hrd-a-recut-guard` | never reached in CI | 2 / 2 / 0 |
| Hardening-B | `hrd-b-upgrade-drill` | never reached in CI | 8 / 8 / 0 |
| 0186 checkout-convergence | `checkout-convergence-upgrade` | never reached in CI | 1 / 1 / 0 |

The pre-fix run reproduced the CI red **at the same assertion and the same stack frame**
(`x42-split-upgrade-kit.mjs:377`) before anything was changed.

The D-b2 drill's whole tail had **never executed anywhere**: the job stopped at the 0041 drill in
the previous dispatch and at D-b2 in this one. It now runs through the four-slice regression floor,
the E8 hook order, the template lifecycle through the post-#927 machine door, and the
`auto_reversal_of` 0 to 1 transition ("census section 4 Option A's dormant column is finally paid
off").

### Vacuity controls

* **The drill itself** was RED for the right reason twice (CI job 107497574792 and locally) and is
  green only after the fix.
* **`p1041.compat.authority_window`**, the new cell in `fa-rig-frontier-compat.test.mjs`, drives the
  helper through its public interface on a client whose authority really was signed by the clock:
  the window reads this month, the helper reports that window and moves it, and a SECOND call —
  where the window is no longer the backfill's stamp — must be **refused**. With
  `backdateAuthorityFloor(au.id, firstPeriodStart)` removed from the helper the cell is RED
  (`1 pass / 1 fail`); the helper was restored byte for byte and it is green.
* **Both new assertions driven to red against a real post-apply database** before that cell existed.
  A window that is not the rule's stamp: "the apply stamped the pre-existing authority's window at
  the first day of its SIGNING month (#651 [0227] D8) — got 2026-03-01, the rule says 2026-09-01".
  A window that does not sit above the book: "…and that window (2026-09-01) sits above this book's
  whole depreciation history, which starts 2026-10-01".
* **The remedy measured end to end** on that database: `runDue` returns
  `due:false reason:period_not_ended`, the floor is restored to `2026-03-01`, `runDue` then returns
  `due:true period 2026-05-01..2026-05-31`.

### Gates

| gate | command | result |
|---|---|---|
| the touched test file plus the FA authority batteries, full 106-gate chain, `clara_l07` @0295 | `node --test --test-concurrency=1 $GATES depreciation-history · fa-arrears-resolution · fa-rig-frontier-compat · ci-frontier-leg-contract · ci-drill-database-names` | **43 tests / 43 pass / 0 fail** |
| `operation-census` + `rig-isolation`, full gate chain, no reset flags | same | **33 / 32 / 0 / 1 skipped** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |

### A RIG FINDING the orchestrator should know about (not mine, and not fixed in code)

`rig-isolation` and `operation-census` could not run at all when this round started:

```
migration-history integrity check failed:
  - applied migration 0295_wave4_chart_rows was MODIFIED after being applied (checksum drift).
```

`clara_l07` applied 0295 at 2026-09-23 18:54 (checksum `7f490472…`); the chart branch's own fix
`4e7251038` (`fix(db): #941 0295 pins v1's content collation-independently, not its stored hash`)
then changed the file to `5196d64d…`, and the merge `a3019c4c3` brought it onto this branch. I
repaired the lane database through the supported #957 path,
`CLARA_MIGRATION_REDO=0295_wave4_chart_rows node scripts/migrate.mjs`, which re-applied it cleanly
(v1 retired and unmoved at 42 families / 142 accounts, v2 published at 42 / 146) and the two gates
then ran. **Every other lane worktree whose database took the pre-fix 0295 carries the same
drift**, and the integrator's from-scratch chain will not show it.

### THE SECOND RED THE FIRST FIX UNCOVERED — Wave-A 0011 (commit `5492d5a56`)

Fixing D-b2 let the job reach five steps it had never reached, and the LAST of them was red.
Fix round 2's follow-up 4 predicted exactly this ("the Wave-A 0011 drill's body has never run in
CI... that is #1023's drill meeting CI for the first time"), so it is recorded here rather than
left for the dispatch.

`tests/wave-a-upgrade.test.mjs`, run with the action's own command on the disposable cluster:

```
not ok 1 - probe 26: 0011 compiles clean on FRESH and on a 0010-UPGRADE image …
not ok 2 - probe 26: re-running migrate after 0011 applies ZERO new migrations …
not ok 4 - probe 26: two independent fresh bootstraps reach an IDENTICAL surface …
  error: 'migration 0154_binding_proposal_pr_1 failed and was rolled back: binding proposal pr-1
    tail: the clara role count moved from 14 to 18 -- this file mints no role and owes no
    roles-bootstrap twin'
  code: 'CLR10'
# tests 4 # pass 1 # fail 3
```

**Cause — the #867 hazard, plus a comment that rotted into a false premise.** `reset()` drops only
schema `clara`; roles are CLUSTER-WIDE, so the four roles 0160 and 0163 mint survive into the next
replay, and 0154's tail census (`0154:3788`) reads 18 where it pins 14. This file replays `MIG_DIR`
— EVERY migration on disk — five times in one process. The action's own comment said the drill
"applies only through 0011, well below the role-minting migration 0154 (RIG.md), so it carries no
in-file role sweep of its own". That was TRUE when the drill was written and the whole chain WAS
0001..0011, and silently false ever since the chain grew past 0154. Only cell 3 survived, because
it is the synthetic-duplicate probe that never completes a migrate.

Nothing caught it because the step has never once been REACHED. #1023 gave the file its first CI
leg, and every dispatch since has died at an earlier drill. This is the same rot the whole ticket
is about, one step further down the job.

**The fix is the one five sibling drills already carry** (review-518-r2 F1): a
`resetForFullReplay()` that pairs `guardedReset(reset)` with `sweepChainMintedRoles()`, routed
through by all five reset sites, plus the third gate that sweep demands
(`CLARA_RIG_ALLOW_ROLE_SWEEP=1`) on this drill's own step. `rig-docs-upgrade.test.mjs`,
`s6-upgrade.test.mjs`, `rig-events-upgrade.test.mjs`, `checkout-convergence-upgrade.test.mjs` and
the two shared upgrade kits all do it the same way. Nothing is skipped, no bound is relaxed and no
census is widened: each replay simply starts from the role state the one before it started from.
The action's stale sentence is replaced by what is true, including why no gate saw it.

### Every `closed-wave-drills` step, run locally on the disposable cluster

| # | step | file | result |
|---|---|---|---|
| 1 | Populated-upgrade cutover (C9) | `rig-events-upgrade` | green in CI (run 35957081528) |
| 2 | Slice-5 document pipeline | `rig-docs-upgrade` | green in CI |
| 3 | Slice-6 coding floor | `s6-upgrade` | green in CI |
| 4 | Wave-B 0020 A7/A8 | `wb-0020-upgrade` | green in CI |
| 5 | Wave-C-a 0037 subledger | `x37-0037-upgrade` | green in CI |
| 6 | Wave-C-c 0040 effective_date | `x40-0040-upgrade` | green in CI |
| 7 | Wave-D-a 0041 FA register | `x41-0041-upgrade` | **1 / 1 / 0** |
| 8 | **Wave-D-b split (D-b2)** | `x42-0045-b2-upgrade` | **1 / 1 / 0** (was 0 / 1) |
| 9 | Hardening-A recut guard | `hrd-a-recut-guard` | **2 / 2 / 0** (never reached in CI) |
| 10 | Hardening-B populated upgrade | `hrd-b-upgrade-drill` | **8 / 8 / 0** (never reached in CI) |
| 11 | 0186 checkout convergence | `checkout-convergence-upgrade` | **1 / 1 / 0** (never reached in CI) |
| 12 | Slice-4 runtime upgrade | `rig-runtime-upgrade` | **1 / 1 / 0** (never reached in CI) |
| 13 | Wave-A 0011 parity | `wave-a-upgrade` | **4 / 4 / 0** (was 1 / 3; never reached in CI) |

Steps 1 to 6 were green on the dispatch and are untouched by either commit, so they were not
re-run. Every step from 7 on was run here with the action's own command, in the action's own order,
each on its own throwaway database with the between-step cleanup and role sweep in between.

**The frontier legs' shared kit, at the frontier that takes the no-op arm.** The d-b3 drill at its
own 0044 chain (`CLARA_MIGRATIONS_DIR` pointed at a 43-file copy, the leg's own gate chain
preloaded): **2 tests / 2 pass / 0 fail / 0 skip**, matching that slice's declared
`#!drill-cells-floor: 2` and `#!drill-skips-max: 0`. That drives the branch where
`restoreAuthorityWindowAfterApply()` finds no `authority_from` column and does nothing, rather than
arguing it.

### Gates, both commits

| gate | command | result |
|---|---|---|
| the touched db test files + the FA authority batteries, full 106-gate chain, `clara_l07` @0295 | `node --test --test-concurrency=1 $GATES depreciation-history · fa-arrears-resolution · fa-rig-frontier-compat · ci-frontier-leg-contract · ci-drill-database-names` | **43 / 43 / 0** |
| the CI-contract cells after the action edit | `… reset-gate-routing · ci-drill-database-names · ci-frontier-leg-contract` | **21 / 21 / 0** |
| `operation-census` + `rig-isolation`, full gate chain, no reset flags | same | **33 / 32 / 0 / 1 skipped** |
| `wave-a-upgrade`, the action's own command, disposable cluster | `CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_ALLOW_ROLE_SWEEP=1 node --test` | **4 / 4 / 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |

### Follow-up worth filing (not this ticket)

**A drill step's own comment can assert a premise no gate checks.** The Wave-A step claimed the
drill stops below 0154; the drill had grown to replay the whole chain, and the sentence stayed
true-looking for 280 migrations. `ci-drill-database-names.test.mjs` censuses the action's database
NAMES and `reset-gate-routing.test.mjs` censuses its FLAGS, but nothing censuses "a step that
replays past 0154 grants the role sweep". That is a checkable claim: the set of drill files whose
`migrate()` can reach `MIG_DIR` is readable, and so is the set of steps granting
`CLARA_RIG_ALLOW_ROLE_SWEEP`. Worth a cell.

### Anything unverified

* **The dispatch itself.** AC1 still needs `gh workflow run ci.yml --ref riders/w4-lane07`; I
  cannot push or dispatch. Every step the composite RUNS is proven locally, in its own order, on
  its own throwaway database.
* **`closed-wave-drills` steps 1 to 6** were green on dispatch 35957081528 and neither commit
  touches them, so they were not re-run here. Steps 7 to 13 all were.
* **The frontier legs were not re-run in full.** Only the d-b3 drill was re-run at its own 0044
  frontier, to DRIVE the helper's no-op arm rather than argue it. The four slice lists are
  unchanged by this round and their numbers stand from fix round 1.
* **The five drills after D-b2 had never run anywhere.** They are green now, but their FIRST-EVER
  CI execution is still the dispatch, on Linux rather than on this rig. Only Wave-A needed a fix.
* **Windows-only**: nothing here depends on a Windows path. The drills ran under Git Bash against a
  WSL cluster, which is how CI's own `bash -e` steps read.
