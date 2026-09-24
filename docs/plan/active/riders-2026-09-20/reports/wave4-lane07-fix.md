# Wave 4, lane 07 — fix round (single fix worker)

Branch `riders/w4-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, database
`127.0.0.1:55747/clara_l07` (289 files @ `0295_wave4_chart_rows`, unchanged by this round).
Base `cd2925391`. Head at review `49bfad4196367125e47ccd3a1bb034a84c7e985b`.

**New head: `c6f465a33`.**

Six new commits on top of the twelve the lane already carried:

| commit | subject |
|---|---|
| `a20524691` | `fix(ci): #1041 the frontier leg's other two runs get a floor and a skip bound` |
| `7ea17f41e` | `docs(runtime): #1035 the release runbook's step 9, in the repo rather than in a report` |
| `05be5f5f2` | `refactor(runtime): #1035 one describer for a frontier violation, for both things that print one` |
| `7c296ca01` | `docs(runtime): #1033 what the refresh does to the cell AC1 names, measured on that cell` |
| `a7c52002f` | `test(runtime): #877 the residual names all four reasons, the leg says where it begins, and it is observed exiting 0` |
| `c6f465a33` | `docs(db): #1041 record the change_class deviation from the brief where the reader will find it` |

Start state: `git status` clean; `git log --oneline cd2925391..HEAD` showed exactly the twelve
commits the two reviews diffed. No migration in this lane, before or after this round
(`git diff cd2925391...HEAD -- packages/db/migrations` is empty), and no `apps/web` file is
touched, so no web census keys on anything here.

Nine findings: **seven fixed, one fixed-and-refuted-in-part (SPEC-1033-A: the review's own
suggested measurement does not discriminate — measured, with the replacement measurement), one
kept with its reason written into the code (SPEC-877-B).**

---

## Findings, one by one

### SPEC-1041-B — minor — the gate chain reached two steps that carry no floor and no skip bound
**FIXED**, both steps, with both bounds declared outside the file they bound.

Reproduced first. `git show` of `28045cc20` confirms the `#!cells-floor:` / `#!skips-max:` pair is
declared only in `tests/split-lists/test-list-d-b*.txt` and read only by step (3b) and
`partition-total`, while `GATES="$(node scripts/print-gate-chain.mjs)"` was added to all three
`node --test` invocations. Step (3c) asserted `FAIL = 0`; step (4) asserted nothing but node's exit
code. I also read the dispatch this lane is about (`gh run view 35893727271 --job 107292338582
--log`): the d-b0 leg's list step ended `153 tests / 122 pass / 27 fail / 4 skipped` and **steps
(3c) and (4) never ran at all** (`outcome=skipped` on both) — so neither step has ever executed with
the gate chain preloaded, on any runner.

**What is now declared, and where.** Never in the file it bounds: a floor a deletion can edit in the
same hunk bounds nothing.

| the run | floor | skip bound | declared in |
|---|---|---|---|
| slice list (3) | `#!cells-floor:` | `#!skips-max:` | `test-list-d-bN.txt` (unchanged) |
| contract roster (3c) | `#!cells-floor: 12` | `#!skips-max-d-b0/1/3/2:` = 8 / 6 / 4 / 4 | `test-list-contracts.txt` |
| isolated drill (4) | `#!drill-cells-floor:` = 3 / 1 / 2 / 1 | `#!drill-skips-max: 0` | `test-list-d-bN.txt` |

**Measured, not assumed** (lane-07 cluster, 2026-09-24, one throwaway database per frontier, chain
materialised by number exactly as the leg materialises it, gate chain preloaded,
`--test-concurrency=1`):

```
roster @0042 (d-b0): 12 tests / 4 pass / 0 fail / 8 skipped
roster @0043 (d-b1): 12 tests / 6 pass / 0 fail / 6 skipped
roster @0044 (d-b3): 12 tests / 8 pass / 0 fail / 4 skipped
roster @0045 (d-b2): 12 tests / 8 pass / 0 fail / 4 skipped
```

Twelve cells at **every** frontier — which is why the floor is one number and the skip bound is
four. The roster's own header used to say a floor "would be a lie at three frontiers out of four";
that is true of the PASS count it was written about, and is the same conflation #1041 already took
out of the slice lists. Rewritten to say so.

The four drills, run at their own frontiers with the reset gate WITHHELD (the state in which every
cell reports and skips, so `# tests` IS the cell count): `x42-0042-b0` 3, `x42-0043-b1` 1,
`x42-0044-b3` 2, `x42-0045-b2` 1. `#!drill-skips-max: 0` is not a guess: the only stand-down any of
the four carries is `skipUnlessReset` (`x42-split-upgrade-kit.mjs:78`), step (4) is the one place
that gate is granted, and a new census cell (`p1041.drill.only-skip`) fails by name if a drill ever
grows another skip.

**Proved on the steps' OWN shell text**, cut out of the action by step name and substituted the way
GitHub substitutes (`${{ inputs.slice }}`, `${{ inputs.dbtag }}`, `${{ steps.gate.outputs.drill }}`),
then run with `bash -e` against a real frontier database:

| run | result |
|---|---|
| step (3) d-b0 list | `149 pass / 0 fail / 4 skip = 153 cells · declared floor 153, skips-max 4` → exit 0 |
| step (3) with the list's `#!skips-max:` line deleted | `…declares no '#!skips-max:' — every list must` → exit 1 |
| step (3c) roster at d-b0 | `4 pass / 0 fail / 8 skip = 12 cells · declared floor 12, skips-max 8` → exit 0 |
| step (3c) floor raised to 13 | `CELL FLOOR BREACHED: … ran 12 cells, floor 13` → exit 1 |
| step (3c) bound lowered to 7 | `SKIP BOUND BREACHED: … skipped 8 cells, at most 7 may` → exit 1 |
| step (3c) bound line deleted | `…declares no '#!skips-max-d-b0:' — each frontier bounds its own skips` → exit 1 |
| step (4) against a 3-cell stand-in | `3 pass / 0 fail / 0 skip = 3 cells · declared floor 3, skips-max 0` → exit 0 |
| step (4), one stand-in cell stands down | `DRILL SKIP BOUND BREACHED: … skipped 1 cells, at most 0 may` → exit 1 |
| step (4), one stand-in cell deleted | `DRILL FLOOR BREACHED: … ran 2 cells, floor 3` → exit 1 |
| step (4), one stand-in cell red | exit 1 (on the run's own status, through the new `pipefail`) |
| `partition-total` | `partition OK: 87 files, each in exactly one list` → exit 0 |
| `partition-total`, a list without its drill floor | `…declares no '#!drill-cells-floor:' for its isolated drill` → exit 1 |
| `partition-total`, the roster without one frontier's bound | `…declares no '#!skips-max-d-b3:' for the d-b3 frontier` → exit 1 |

The four **real** drills were not run here and must not be: their kit's `freshDb()` calls
`sweepChainMintedRoles()` twice, which is cluster-wide, and RIG.md forbids it on a lane cluster.
Step (4)'s shell was therefore driven against a stand-in test file with a known TAP shape (created
in `packages/db/tests` for the length of the control and deleted; `git status` clean afterwards),
which is the right subject for a claim about the STEP. The drills' own cell counts are measured, as
above.

**One defect found while proving it, and fixed.** Under `set -o pipefail` + `bash -e`, a
`grep | head | awk` read of a missing directive fails the whole pipeline on the ASSIGNMENT, so the
step died with exit 1 and **no message** instead of the named refusal on the next line — the
pre-existing shape in step (3b) as well as my new one. Every directive read is now `awk`, which
exits 0 when it matches nothing. The "bound line deleted" rows above are the before/after.

Held to the action by five new cells in `packages/db/tests/ci-frontier-leg-contract.test.mjs`
(`p1041.roster.floor`, `p1041.roster.action`, `p1041.drill.floor`, `p1041.drill.only-skip`,
`p1041.drill.action`, `p1041.total.declared`), each seen red for its own reason first.
`p1041.drill.floor` also holds each declared drill floor to the drill's own cell count ON DISK, so a
deleted drill cell reds a PR-gate cell days before anyone dispatches the legs.

### SPEC-1041-A — minor — the `change_class` cells got a fixture, not the gate the brief named
**KEPT, and the deviation is now recorded in the repo** (`c6f465a33`).

No code change: the choice is right and the review agrees. A gate lets a cell STAND DOWN, and at the
d-b0 frontier that would have dropped 26 cells out of the very floor the leg exists to measure. What
was missing is that nothing in the tree said the brief's named interface was not what shipped.
`packages/db/tests/README.md`'s own "a fixture that runs at two frontiers is not a gate" section now
states the deviation and its cost (at 0042 those cells exercise the pre-0227 revise grammar — which
is the grammar that frontier has). **For the closing comment:** #1041's "gate module, or a premise
check of the same shape" was answered with a frontier-compat fixture, deliberately.

### SPEC-1035-A — minor — the "release runbook template: step 9" key interface had no artifact
**FIXED** (`7ea17f41e`), in the only place that can hold it.

Reproduced: there is no runbook TEMPLATE file in this repo. `find . -iname "*RUNBOOK*"` returns six
files, all per-wave records under `docs/plan/active/<wave>/`; the two in this wave are as-run
records (W2's § RESULTS is dated 2026-09-23, W3's landed on main after this branch's base), and the
W4 runbook is not written yet. Editing an as-run record would be rewriting history; writing the W4
runbook is the release author's act, not a lane's.

So the durable statement went where the command is documented: `packages/runtime/README.md` gains
`### The release runbook's step 9, since #1035` — a block quote the next runbook author copies
verbatim, naming what step 9 runs, the THREE gates it now demonstrates (body rules, door-contract
rules, stranded-body census), what each exit code means, and the one thing step 9 still does not
cover (a rollback below the migration frontier is a database ceremony this command does not speak
to). It also retires, by name, the sentence the W3 runbook had to write by hand: "the preflight will
say ALLOWED, because its rule table knows nothing about a door's return contract".

**Owed to the orchestrator:** carry that block into the wave-4 release runbook's step 9 when it is
written, and say on #1035 that the key interface closed there.

### F1 (standards) — minor — `printFrontier()` duplicated `frontierRefusalLines()`'s branch
**FIXED** (`05be5f5f2`). The fix is small and clearly better, which is the test for a smell.

`lib/rollback-preflight.mjs` exports `frontierViolationPhrase(v)` — one description of one
violation: the reason, the verb by which an image has the thing, the thing, and what the target
fails to do with it. The verdict's refusal lines and the CLI's per-violation line both read it, so a
THIRD kind of rule cannot reach one output path and miss the other. Both sentences keep their
wording, except that a body refusal now ends "which the target does NOT carry" rather than "which
the target does NOT".

Two cells, red first (`does not provide an export named 'frontierViolationPhrase'`): one drives the
describer for both kinds and re-checks that the refusal line still names the reason, the migration,
the contract and the frontier; one censuses `printFrontier`'s own body for a `requirement ===`
branch, which is the guard that stops the copy coming back.

Driven end to end as well, against a World-bootstrapped clone at frontier `0295_wave4_chart_rows`:

```
      !! 0254_intake_refusal_record requires the intake_refusal_record_v1 door contract, which the target does NOT declare
      !! 0279_fa_closed_year_arrears requires the fa_parked_run_v1 door contract, which the target does NOT declare
  - frontier_requires_contract: this database is at 0295_wave4_chart_rows, and 0254_intake_refusal_record requires the image to understand the intake_refusal_record_v1 door contract, which the target does NOT declare.
```
exit 1; and on the body path (`--supported claraWork_v1 --supported-contracts …`):
`!! 0195_… requires claraWork_v3, which the target does NOT carry`. Both printers, one describer.

### SPEC-1033-A — minor — AC1 names the disconnect-and-recover cell, the red-green was on a new one
**MEASURED ON THE NAMED CELL; the review's suggested measurement is REFUTED, with the run.**
(`7c296ca01`, a comment-only change: there is nothing to fix in the code.)

The review proposed "one run of the original cell with the helper's refresh removed and the same two
env knobs set". I ran exactly that: **it passes**, in 522 ms, with and without the refresh. The
reason is measurable: with `CLARA_LANE_PROBE_CYCLE_MS=50` the real lanes answer inside the cycle
bound, so no cycle is discarded, so the wait never approaches the 30 s heartbeat window. Narrowing
`CLARA_HEARTBEAT_STALE_MS` to 100 ms and to 50 ms does not discriminate either (the first iteration's
read lands inside the window). The collision needs a discarded cycle, and a discarded cycle needs
the injected prober — which is why #1033 built a new cell rather than re-using this one.

What CAN be measured on the named cell, and now is: instrumented runs of the
disconnect-and-recover cell (a scratch copy, the cell itself unchanged) print the world heartbeat
age its own `ready === true` assertion reads —

```
WITH the refresh:    iteration 1: world age_ms=48    iteration 2: world age_ms=37
WITHOUT it:          iteration 1: world age_ms=59    iteration 2: world age_ms=1374
```

— so the refresh bounds that age by ONE iteration instead of by the whole wait, which is exactly the
property the cell's assertion rests on and the property CI's 30089 ms failure was on the other side
of. Recorded in `settleLaneUntil`'s own header, with both halves. I also re-drove the #1033 cell's
vacuity myself: red at 35034 ms with `actual: false` against the fix removed, green with it;
`tests/ready.test.mjs` whole: 25/25.

### SPEC-877-C — minor — the corrected residual named one reason where the door names four
**FIXED** (`a7c52002f`). The file header and `packages/runtime/README.md` now name `tier_a_fails`
(with its own explanation), `direction_unresolved`, `vendor_unresolved` and `no_consent`, and quote
the door's verbatim printout, re-measured today on the clone:
`{"clr":"CLR29","lane":"needs_you","reason":"lane_changed","reasons":["tier_a_fails",
"direction_unresolved","vendor_unresolved","no_consent"]}`. Naming only the first understated the
residual by three and made leg 8's fixture read as a one-thing-away variant of arm (c)'s when it is
four.

### SPEC-877-A — minor — AC3 held only under the report's own reading of where the leg begins
**FIXED by writing the boundary into the file** (`a7c52002f`), which is what the review asked for.
Leg 8's entry in the file's EIGHT LEGS list now says it plainly: the trip begins AT THE BYTES;
everything before them (two accounts, a birth entry drafted and approved, the coding-lane consent)
is the client's pre-existing state, set up through the real human doors exactly as `primeReadyFiling`
sets up its own; between the bytes landing and the admission there is ONE human act, `fileToClient`,
which is leg 1(c)'s unchanged claim; and the recovery door appears nowhere at all, before or after,
which is the half of AC3 the file's own `AUTOMATIC_LANE` source census proves outright.
**For the closing comment:** tick AC3 with that boundary, not as "no human act appears anywhere".

### SPEC-877-B — minor — leg 8 calls `reconcile_sweep_runs()` as root
**KEPT, with the thing to re-check written beside it** (`a7c52002f`) — the review demanded no fix
and its reasoning is right: `refused_concurrency` is a resource-scheduling refusal, not one of
`_coding_lane_core`'s own preconditions, and `reconcile_sweep_runs` is the estate's own idle-cleanup
door that `queue-drain.mjs` and the consumer's catch-up pass already call. What the comment lacked
was the coupling the review named: it is ORDER-dependent. Added: a leg inserted between leg 1 and
leg 8, or leg 8 moved up, puts a sweep run outside the reconcile and returns this leg to
`refused_concurrency` — a red that names a resource, never the lane.

### SPEC-877-D — minor — the e2e was never observed to exit 0, and never ran under WSL
**FIXED, and the root cause is now documented rather than left as a rig anecdote** (`a7c52002f`).

Root cause, found rather than worked around: a `clara.wakes_outbox` row left `held` by an earlier
session is turned into a `held` `clara.agent_tasks` wake row by `lib/drain.mjs`'s wake phase at
EVERY boot — including this leg's own — and `censusUnboundTasks` counts it, so `waitForQueueDrain`
times out on rows no leg here created. Cancelling only the tasks does not help (measured: the run
then failed on four RE-created held wake tasks). The lawful exit is on the outbox row itself
(`held -> cancelled`, the transition `clara._tf_wakes_outbox_update` allows; the rows cannot be
deleted at all).

Measured on a disposable clone of `clara_l07` (`clara_877`, World bootstrapped — the lane database's
own name is not admitted by `local-db-gate.mjs`'s pattern, which is a property of that gate, not of
this ticket):

| run | result |
|---|---|
| before settling the outbox | 8/8 legs PASS, **exit 1** at `waitForQueueDrain` on 4 re-created held wake tasks |
| after settling it, Windows | `INTAKE ADMISSION E2E: PASS (8 legs …)`, **exit 0** |
| after settling it, **WSL as `runner`** (`/opt/node/bin/node tests/intake-admission-e2e.mjs`) | same line, **exit 0** |
| `tests/ready.test.mjs` under **WSL as `runner`** | 25 tests / 25 pass / 0 fail / 0 skipped |

The recipe is in `packages/runtime/README.md` beside the drain's own section, with the measurement,
so the next person running this file on a reused database does not spend the same hour.

---

## The four notes (no action, by design)

* **SPEC-1041-C** — AC1, AC3's drill execution and the six never-run closed-wave steps still need the
  orchestrator's dispatch. Unchanged by this round, and see "What needs the dispatch" below.
* **SPEC-1035-B** — AC3's "55 bodies" fixture is a SHAPE reproduction, and both the cell and the
  report say so. Nothing to change; do not overstate it in the closure as a replay of
  `refresh-ddb5a125`'s actual roster.
* **SPEC-1035-C** — the 0279 rule is authorised by the wave (RELEASE-W3-RUNBOOK.md line 619), not by
  the issue. Name it in the closure. The ticket body's `0254_intake_ceiling_refusal_record` is a
  typo for `0254_intake_refusal_record`; the rule table names the real file, and AC4's selftest cell
  is what catches that class of typo.
* **SPEC-1033-B** — the repro cell costs ~35 s by construction. `ready.test.mjs` now runs 25 cells in
  ~40 s on this rig (measured again under WSL today); expected, not a regression.

## Gates, with counts

| gate | command | result |
|---|---|---|
| db files touched + neighbours | `node --test --test-concurrency=1 $GATES tests/ci-frontier-leg-contract tests/ci-drill-database-names tests/drill-fixture-name-family tests/reset-gate-routing tests/fa-rig-frontier-compat tests/operation-census tests/rig-isolation` (no reset flags) | **57 tests / 56 pass / 0 fail / 1 skipped** |
| runtime unit files touched | `node --test --test-concurrency=1 tests/rollback-preflight tests/runtime-contracts tests/l9-build-info` | **63 / 41 / 0 / 22** (rollback-preflight alone: 44 / 22 / 0 / 22 — was 42/20/0/22 before F1's two cells) |
| runtime unit, the #1033 file | `node --test --test-concurrency=1 tests/ready.test.mjs` | **25 / 25 / 0 / 0** (and the same under WSL as `runner`) |
| runtime standalone leg | `node tests/intake-admission-e2e.mjs` (clone, World) | **exit 0**, 8 legs PASS — twice (Windows, and WSL as `runner`) |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` (repo root) | OK — 312 frozen / 55 `use workflow` / 3 retired, no manifest diff |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| composite-action shells | the harness above, driving the REAL step text | 13 runs, table under SPEC-1041-B |
| YAML | `yaml.safe_load` on `frontier-leg`, `partition-total`, `ci.yml` | parses; frontier-leg 9 steps |
| typecheck | `pnpm typecheck` (repo root) | **exit 0** (`apps/web` Done, `packages/runtime` Done) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root) | **exit 0** |

No `apps/web` file is touched, so no web unit suite and no browser walk. No migration, so no redo,
no prestate re-measure, and nothing for `apps/web/tests/firm-scope-db-pins.corpus.ts` to re-key on.

## Rig hygiene

Created and dropped again, all within lane 07's own cluster: `clara_x1041_b0_ci`,
`clara_x1041_b1_ci`, `clara_x1041_b3_ci`, `clara_x1041_b2_ci` (four frontier rigs at 0042/0043/0044/
0045 — every chain stops far below 0121, so no role is minted), `clara_x42_b0_upgrade_ci` (the drill
step's own database, created by the step under test) and `clara_877` (the World clone for the leg).
Dropped through `tests/rig-cluster-reset.mjs --drop-database` (never `--sweep-roles`). After:
databases = `clara_l07, postgres, template0, template1`; `clara%` roles = **18**, the count before
this round; `clara_l07` still reads 289 migrations @ `0295_wave4_chart_rows`. `CLARA_RIG_ALLOW_RESET`
and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set on this cluster.

## What needs the orchestrator's dispatch (unchanged, plus one)

`gh workflow run ci.yml --ref riders/w4-lane07`, before integration:

1. **#1041 AC1** — `db-slice-frontiers` d-b0..d-b3 and `closed-wave-drills` all green; record the run
   id on the ticket. Not confirmable from this host.
2. **#1041 AC3's drill half** — the 0041 drill passing on the current chain with the name-family wall
   live. The fixture half is proven locally (`p1041.drill.name_family`, `p1041.drill.name_source`).
3. **NEW: the first execution of the bounds this round added.** No frontier leg has ever reached step
   (3c) or step (4) — in run 35893727271 both were `outcome=skipped` after the list step failed — so
   the roster's floor, its four per-frontier skip bounds and the drills' floors will be enforced for
   the first time on that dispatch. Each has been driven locally on the step's own shell (table
   above) and each refusal names itself; if a number is wrong on the runner the leg says which bound,
   which slice and by how much, and the remedy is to re-measure and raise the declaration, never to
   lower it to go green.
4. **#1041 AC5** still needs no `ci.yml` change: the weekly `schedule` trigger and both dispatch-only
   jobs' `if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'` guards
   predate the base commit, and `git diff cd2925391...HEAD -- .github/workflows/ci.yml` is empty.
5. Read the six never-run closed-wave steps in 35893727271 as FIRST-EXECUTION results, not as
   regressions from this lane.

## Anything unverified

* The four real deploy drills (`x42-00NN-bN-upgrade.test.mjs`) were not executed on this host, by
  design: their kit sweeps cluster-minted roles cluster-wide. Their cell counts are measured (reset
  withheld); their ZERO skip bound rests on that measurement plus the `p1041.drill.only-skip` census,
  and is first enforced on the dispatch above.
* The leg's exit 0 was measured on a CLONE of `clara_l07`, not on `clara_l07` itself:
  `local-db-gate.mjs`'s pattern does not admit the `clara_lNN` shape. Widening that gate for a rig is
  exactly what RIG.md forbids, so the clone is the right answer, and CI builds this file's database
  fresh in the same job anyway.
* `packages/db`'s whole estate suite was not re-run here (the work order asks for the files touched,
  plus `operation-census` and `rig-isolation`, which is what the table above reports).
