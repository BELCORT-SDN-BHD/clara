# Wave 1 CI gates: #1027 (the LEG 4 race) and #1026 (the heap budget)

**Implementer report. Branch `integration/riders-w1`, worktree `C:\Users\zhant\Desktop\clara-wt\int`.
Base `7b83b1c0d`. Two commits, one per ticket, worked in that order. Final head `dd3d335dd`.
Nothing was pushed, no PR was opened, nothing was written to GitHub, no other worktree was touched.**

| commit | ticket | files |
|---|---|---|
| `17b9e2368` | #1027 | `packages/runtime/tests/intake-batch-e2e.mjs`, `packages/runtime/README.md` |
| `dd3d335dd` | #1026 | `scripts/ci/world-gate.mjs` (new), `scripts/ci/world-gate.selftest.mjs` (new), `.github/actions/db-live-gates/action.yml`, `package.json`, `packages/runtime/README.md`, `packages/runtime/tests/intake-batch-e2e.mjs` |

**The rig for every measurement below.** WSL 2 (Ubuntu, user `runner`), Node `/opt/node/bin/node`
v22.23.2 (default `heap_size_limit` 4144 MB, measured), PostgreSQL 17 cluster `rigrt` on port 55721.
Every run took its own throwaway database with `createdb -T clara_rt_test clara_9NN` (no open
connection to the template), ran the leg under `/usr/bin/time -v`, and dropped the database
afterwards. The template `clara_rt_test` was never written to. Ten other workers loaded the host
throughout, which is welcome here: it is what makes the race show. **Every throwaway database was
dropped — the cluster is back to `clara_rt`, `clara_rt_test`, `clara_wave_b_ci` (verified by
`select datname from pg_database` after the last run).**

---

# TICKET #1027 — the cross-firm poison leg asserts on single un-polled sweeps

## Seams (written before the first cell, per /tdd)

- **The leg's LEG 4 block** in `packages/runtime/tests/intake-batch-e2e.mjs` — the public surface the
  ticket names. Nothing outside it was touched, and no product code was changed.
- **The belt's returned receipt**: `reconcileIntakeBatchCancellations`'s `batchCancelOk`,
  `batchCancelFailed`, `batchCancelBlocked`. Meaning unchanged; it is what the leg polls on.
- **The parent's stored state**: `clara.intake_batches.state` read through the leg's own
  `batchState(id)`.
- **The settlement call**: `clara.settle_work_run(task, 'cancelled')` through the leg's `settleRun`.
- **The wait style**: `tests/queue-drain.mjs`'s `waitForQueueDrain` — a `for(;;)` with a stated
  deadline and a throw that names what was last observed. That is the house shape this file's
  siblings use (`pollWork` in `chat-turn-v*-e2e.mjs`, `waitFor` in `body-census-guard-db.test.mjs`);
  no second style was invented.

## (1) The defect made deterministic BEFORE the fix

A fault knob was added to the leg on `CLARA_WORK_TEST_FAULT`'s precedent
(`CLARA_P636_LEG4_FAULT` + `CLARA_P636_LEG4_FAULT_MS`). It moves only **when the fixture acts** —
never what the belt does — and it is inert unless asked for.

| # | db | code | fault | outcome |
|---|---|---|---|---|
| 1 | `clara_921` | pre-fix + a row-lock fault | `lock_q` 6 s, `CLARA_P636_E2E_N=12` | PASS — knob inert at N=12 |
| 2 | `clara_922` | pre-fix + row-lock | `lock_q` 8 s | RED, but on the THIRD assertion (see "not fixed" below) |
| 3 | `clara_923` | pre-fix + row-lock | `lock_q` 8 s | RED, same; **sweep 2 took 8087 ms under an 8000 ms lock** |
| 4 | `clara_924` | pre-fix + timing faults | `late_poison` 8 s | **RED — "firm P's refusals are COUNTED, not swallowed"** |
| 5 | `clara_925` | pre-fix | `slow_settle` 8 s, children queued | PASS — fault inert |
| 6 | `clara_926` | pre-fix | `slow_settle` 8 s, children RUNNING | **RED — "firm Q's batch … reached its terminal state", actual `cancelling`** |
| 7 | `clara_931` | pre-fix | `late_poison` **1.5 s** | **RED — the refusal count, at sweep 1, `pState=open`** |
| 8 | `clara_932` | pre-fix | `slow_settle` **1.5 s** | **RED — firm Q still `cancelling`** |

Two findings on the way, both recorded in the file's own comments so the next reader does not repeat
them:

- **A row lock on the parent does NOT make the belt's `for update skip locked` worklist pass that
  parent by — it makes the whole sweep WAIT** (8087 ms under an 8000 ms lock, run 3). So a
  concurrent sweep delays this leg's observations rather than stealing them; the row-lock fault was
  rejected and replaced by the two timing faults.
- **`slow_settle` is inert unless firm Q's children are RUNNING** (run 5): a child the World has not
  dispatched is terminalised by `cancel_accounting_work` itself and its parent settles on the next
  sweep with or without the leg's settles. CI's failing run had them dispatched, which is exactly why
  its settle mattered. The fault therefore claims a run on each child first, as LEG 2 already does.

Runs 7 and 8 are the paired reds: the SAME fault parameters at which the fixed code is green (below),
so the comparison is like for like. **One run each, deterministic — not a hunt.**

## (2)(3)(4) The fix, and each acceptance criterion

> **AC1 — "The healthy firm's terminal state is polled to a deadline rather than read once, and the
> poisoned firm's refusal count is polled the same way."**
> Both observations are now `for(;;)` loops that re-run the sweep and re-read the state to
> `CLARA_P636_LEG4_DEADLINE_MS` (default 30 s, poll 500 ms), in `queue-drain.mjs`'s shape. Evidence:
> `clara_929` counted the refusal after **4 sweeps / 1516 ms** where the pre-fix code failed at once
> (`clara_931`); `clara_928` reached firm Q's terminal state after **6 sweeps / 2774 ms** where the
> pre-fix code failed at once (`clara_932`, `clara_926`).

> **AC2 — "A deadline that expires fails with a message naming the firm, the parent and the state
> actually observed."**
> `leg4Diagnosis()` builds it, read FRESH at the moment of failure: both firms by name, both parents
> by id, both states, every child's Work `status` and `current_task_id`, the last belt receipt, the
> sweep count, the elapsed ms and the deadline. Verbatim from the vacuity control (`clara_933`):
> ```
> Error: firm P's refusals are COUNTED, not swallowed: batchCancelFailed stayed 0 — after 59 sweep(s) in 30492ms (deadline 30000ms, poll 500ms).
>   firm P (poisoned) parent=fbad1919-… state=cancelled children=[{"id":"b62d3443-…","status":"failed","current_task_id":"5ff933d9-…"}, …]
>   firm Q (healthy)  parent=107a64c6-… state=cancelled children=[{"id":"31300ef1-…","status":"cancelled","current_task_id":"dee9c056-…"}, …]
>   last belt receipt: {"batchCancelOk":true,"batchCancelSettled":0,"batchCancelChildren":0,"batchCancelFailed":0,"batchCancelBlocked":0}
> ```

> **AC3 — "A settlement that cannot be performed is surfaced rather than silently discarded."**
> `settleRun(task, "cancelled").catch(() => {})` is gone. Each child carries
> `{work_id, task_id, settled, error}`; a settle that throws records `code + message` and is RETRIED
> on the next poll; a child with no `current_task_id` records that instead; and the whole array is
> printed on success and named in the deadline message on failure. Evidence, a passing run's own log
> line: `[p636] LEG4 firm Q terminal after 6 sweep(s) in 2774ms; settles=[{"work_id":"c3c5356f-…",
> "task_id":"4728f718-…","settled":false,"error":"held back by CLARA_P636_LEG4_FAULT=slow_settle"}, …]`
> — the leg reports that its settles never landed and that firm Q converged anyway, under the World.

> **AC4 — "The leg still proves that the poisoned firm's parent remains unfinished while the healthy
> firm's reaches its terminal state, with no assertion weakened or removed."**
> All four assertions are still there, with their original messages. Two are now STRONGER:
> `batchCancelOk` is asserted on EVERY polled sweep rather than on one, and the refusal count is
> cumulative over the polled sweeps and must still reach ≥ 1 (never "0 is fine now"). Firm Q must
> still reach `cancelled` and nothing weaker. Firm P's `cancelling` is deliberately NOT polled — a
> negative that converges is a negative that was never true — and it now carries the same census in
> its failure message.

> **AC5 — "The gate passes five consecutive runs against a freshly provisioned database, and a
> deliberately broken belt still reds the leg."**
> Five consecutive passes on fresh clones: `clara_941` … `clara_945`, all `rc=0`, all
> `ALL LEGS PASSED`. **Two of the five needed a second sweep for firm Q (509 ms, 548 ms) — those two
> runs would have RED on the pre-fix code.** Three converged on the first sweep in 6-13 ms, so the
> happy path costs nothing. (Plus three more consecutive passes on the final code after #1026,
> below: eight consecutive in total.)

| # | db | firm P | firm Q | result |
|---|---|---|---|---|
| 1 | `clara_941` | 2 refusals, 1 sweep, 21 ms | 1 sweep, 13 ms | PASS |
| 2 | `clara_942` | 2 refusals, 1 sweep, 25 ms | 1 sweep, 7 ms | PASS |
| 3 | `clara_943` | 2 refusals, 1 sweep, 24 ms | **2 sweeps, 509 ms** | PASS |
| 4 | `clara_944` | 2 refusals, 1 sweep, 102 ms | **2 sweeps, 548 ms** | PASS |
| 5 | `clara_945` | 2 refusals, 1 sweep, 12 ms | 1 sweep, 6 ms | PASS |

## The vacuity control

`packages/runtime/lib/intake-batches.mjs`'s `fanOutCancel` was deliberately broken so a CLR04
refusal is recorded as a SUCCESS (`refused.push(…)` → `cancelled.push(…)`) — precisely the
regression the assertion exists to catch. Run `clara_933`: the polled block **still reds**, at its
deadline, after 59 sweeps in 30492 ms, with the census quoted under AC2. The belt was then restored
with `git checkout --`, byte for byte (`git status` clean afterwards, verified).

A second, milder control came for free: with `late_poison` at 8 s (`clara_927`) the polled block reds
at its deadline too, and the census says why — firm P's children had already reached `failed`, so
there was never a refusal to count. The poll is not a way of passing a test whose subject is gone.

## What #1027 did NOT fix (a follow-up worth filing)

**Firm P's parent can be declared done, correctly, while this leg watches.** Its two children are
ordinary admitted Work; the World dispatches and terminalises them within seconds (measured: both
`failed` inside 8 s on runs `clara_922`, `clara_927`, `clara_933`). Once they are terminal the parent
has no live children and the belt settles it — which is right. A LEG 4 slow enough to see that reds
on "…and firm P's is honestly still stopping" or on the refusal deadline with a census showing P's
children already `failed`. That is a THIRD race in the same block, it predates this work, and it is
out of #1027's scope (its brief names the two observations only). It is now legible rather than
cryptic: both failure messages carry the child census. **Recommended follow-up ticket: keep firm P's
children out of the World's reach for the length of LEG 4, or assert P's non-terminality only while
its children are live.**

It is also possible that `main`'s CI red at line 576 (job 105954490814) was this third race rather
than the one fixed here — nothing in that job's log distinguishes them. The new census will, next
time.

## Docs (#1027)

`packages/runtime/README.md`, the "#636 intake batch lane" section: what the block now does, the
measured convergence figures, the fault knob, and a "What #1027 did NOT fix, and how to recognise
it" paragraph. The leg file itself carries the full measured rationale in its header.

---

# TICKET #1026 — World-booting steps run with no heap budget

## Seams

- **`.github/actions/db-live-gates/action.yml`'s per-leg invocations** — the 24 places a World-booting
  process is started.
- **A shared launcher**, which the ticket's "Key interfaces" asks for ("any shared helper that
  launches these e2e processes should be the single place the budget is applied"): none existed, so
  `scripts/ci/world-gate.mjs` is it.
- **`NODE_OPTIONS`** — the documented way a budget reaches a process and everything it spawns.
- **The child's exit status** — the only signal a wrapper has for "died of its budget".
- **`packages/runtime/README.md`** — the runtime package's own gate documentation, where the measured
  figure is recorded.

## The shape

`node "$GITHUB_WORKSPACE/scripts/ci/world-gate.mjs" tests/<leg>.mjs` replaces `node tests/<leg>.mjs`
in all 24 invocations across the four World-booting steps. The launcher:

- declares `HEAP_BUDGET_MB = 2048` — **one place**, reviewable as one number;
- **appends** `--max-old-space-size=<budget>` to any existing `NODE_OPTIONS` rather than replacing it;
- refuses a junk `CLARA_GATE_HEAP_MB` loudly instead of silently restoring the host default;
- passes stdio through untouched and preserves the leg's own exit code;
- on exit 134 / SIGABRT / SIGKILL / 137 prints a `::error::` annotation naming the step
  (`CLARA_GATE_STEP`, set per step in the action), the command, the pid and the budget;
- says NOTHING about memory on an ordinary exit 1.

## Each acceptance criterion

> **AC1 — "Every live-gates step that boots a durable World runs under an explicit, committed heap
> budget rather than the host default."**
> All four such steps, all 24 leg invocations. The command that reproduces that number exactly is
> `grep -c 'world-gate\.mjs" tests/' .github/actions/db-live-gates/action.yml` = 24, with
> `grep -c 'node tests/'` = 0 (a bare `grep -c world-gate.mjs` returns 25, because the header
> comment names the file too, review STD-1). Proven to take effect on the rig: a child launched through it
> reports `heap_size_limit = 2096 MB` and `NODE_OPTIONS = --max-old-space-size=2048`, against
> `4144 MB` for the same Node without it.

> **AC2 — "The chosen budget is justified by a recorded measurement of that step's peak memory across
> at least three runs, and the measurement method is written down."**
> The table below, and the method (throwaway clone, `/usr/bin/time -v` for peak RSS, `--trace-gc`
> parsed for peak occupancy) is written down in `packages/runtime/README.md`'s "#1026 — the live
> gates' heap budget".

> **AC3 — "Running the intake batch gate under the committed budget passes three consecutive times
> with peak memory at least twenty five percent below the budget."**
> Three consecutive passes through the real launcher on the final code: **0.79 / 0.91 / 0.93 GiB
> peak RSS against a 2 GiB budget — 53 to 60 % below it.** (An earlier consecutive triple, run with
> the flag passed directly: 0.82 / 0.88 / 1.06 GiB, 47 to 59 % below.)

> **AC4 — "A step that exceeds its budget fails with a message naming the step and the budget, not
> only a native out of memory abort."**
> `scripts/ci/world-gate.selftest.mjs`, cell "AN ABORT IS ATTRIBUTABLE": a child that calls
> `process.abort()` makes the launcher print `::error::` naming the step, the command and
> `--max-old-space-size=256`, and the exit code survives. Its positive control, cell "AN ORDINARY RED
> IS NOT BLAMED ON MEMORY", asserts an exit 1 passes through with no budget claim at all.

> **AC5 — "The two historical aborts cited in the context are re-checked against the new budget and
> the result recorded."**
> Recorded in the README. Job **105215992382** (2026-09-17, Wave-B) died in `interview-e2e.mjs`,
> which has armed `startHeapBound()` since that abort (a 119 MB live set under a forced collection
> above 512 MB) and now also runs under the 2 GiB budget: a process holding a flat 119 MB cannot
> reach it. Job **106048901216** (2026-09-20) died in `intake-batch-e2e.mjs` at 4018 MB of a 4144 MB
> ceiling; that same leg now peaks at 1.06 GiB of a 2 GiB ceiling across three consecutive passes,
> with a retained set of ~140-210 MB. **Unverified and stated as such: neither job can be replayed on
> its own runner from here. This is a re-check by measurement of the same legs, not a replay.**

## The measurements

All figures peak RSS from `/usr/bin/time -v` (KiB, converted to GiB) and peak heap occupancy from
`--trace-gc`. Budget 2048 MB = 2 GiB.

| leg | budget | peak RSS | peak occupancy | wall | result |
|---|---|---|---|---|---|
| `intake-batch-e2e.mjs` | host default (4144 MB) | **2.22 – 4.21 GiB** over 17 runs | up to ~4.1 GB | 1:02 – 3:11 | passed here; aborted twice in CI |
| `intake-batch-e2e.mjs` | 2048, no in-process bound | 1.97 / 2.11 GiB | 1832 / 1969 MB | 0:56 / 1:14 | pass |
| `intake-batch-e2e.mjs` | 2048 + heap bound | **0.82 / 0.88 / 1.06 GiB** | 696 / 734 / 926 MB | 2:35 / 2:46 / 3:22 | 3 consecutive passes |
| `intake-batch-e2e.mjs` **through the launcher, final code** | 2048 + heap bound | **0.79 / 0.91 / 0.93 GiB** | bound peak 657 / 717 / 795 MB | 2:00 / 2:17 / 2:51 | **3 consecutive passes** |
| `intake-admission-e2e.mjs` through the launcher | 2048 | 1.15 GiB | — | 0:46 | pass |
| `accrual-e2e.mjs` through the launcher | 2048 | 0.43 GiB | — | 2:07 | pass |

**The budget alone buys the ceiling, not the margin — and that is a measurement, not an opinion.**
V8 grows to whatever ceiling it is given: at 2048 with no in-process bound, occupancy runs to
1832-1969 MB of 2048 before every collection, so peak RSS lands at 98-105 % of the budget. No budget
can be "25 % above the peak" while the peak is defined by the budget. What the leg actually RETAINS
is ~140-210 MB (the post-collection floor in its own GC trace, consistent with `heap-bound.mjs`'s
independently measured 119 MB). So `intake-batch-e2e.mjs` also arms `startHeapBound()` — the existing
helper, already tested by `tests/heap-bound.test.mjs`, already used by `interview-e2e.mjs`. It cost
**8 to 30 forced collections per run** and is what puts peak memory at 40-53 % of the budget.

**Two other World legs were measured under the same budget** so the number is not tuned to one leg:
`intake-admission-e2e.mjs` at 1.15 GiB and `accrual-e2e.mjs` at 0.43 GiB, both through the launcher,
both passing. Neither needed an in-process bound to sit well under the budget.

**On "and faster".** The ticket expects a smaller ceiling to make the step faster. I measured smaller
but **not** faster (2:00-2:51 through the launcher against 1:02-3:11 at the default ceiling), and I
will not claim otherwise: this host carried ten other workers throughout, so the wall-clock
comparison is confounded, and the bound itself only ever ran 8-30 collections. The honest statement
is that the leg is *bounded* and *predictable* now, and that its time is within the band the
unbounded runs already occupied.

**The two-build drill's nitro builds.** They are spawned by `two-build-cutover-e2e.mjs` and inherit
`NODE_OPTIONS`, so they inherit the budget. A full runtime build was measured to succeed under it,
with the control that the same build at `--max-old-space-size=48` dies with `Exit status 134` —
proving the flag genuinely reaches the build process and that 2048 is not a guess for it either.

## The selftest, and why it is in the lint chain

`scripts/ci/world-gate.selftest.mjs`, 12 cells (7 unit + 5 end-to-end against the real launcher and
throwaway children). It is registered in the root `package.json` `lint` script beside
`scripts/ops/dsn-pipe*.selftest.mjs` and `scripts/hooks/dispatch-model-guard.selftest.mjs` — the
repo's existing, already-registered pattern for a script helper's selftest, which is what the brief
told me to check before adding one. Green on Windows **and on Linux** (`/opt/node/bin/node` under
WSL as user `runner`, the runner's OS), 12/12 both times.

## Docs (#1026)

- `packages/runtime/README.md`: a new "#1026 — the live gates' heap budget" section — the defect, the
  budget and where it lives, the measurement method, the full table, why the budget alone is not the
  whole fix, the re-check of both historical aborts, and what is not covered.
- `.github/actions/db-live-gates/action.yml`: a block comment above the first World-booting step with
  the same headline figures and a pointer to the README, plus `CLARA_GATE_STEP` on each of the four
  steps.
- `scripts/ci/world-gate.mjs`'s own header carries the full rationale and the usage forms.

---

# Gates, with counts

| gate | command | result |
|---|---|---|
| The #636 leg, final code, consecutive | 3 × through the launcher (`clara_981`-`983`) | **3/3 PASS** |
| The #636 leg, #1027 acceptance | 5 × fresh clones (`clara_941`-`945`) | **5/5 PASS** |
| The #636 leg, total this session | 27 runs (18 at the default ceiling, one of them at a reduced N; 9 under a budget) | every red accounted for above |
| Frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK — 312 files, no manifest diff** |
| Parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| Typecheck | `pnpm typecheck` | **clean** (`packages/runtime`, `apps/web`) |
| Lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, `world-gate selftest: OK` in the chain |
| The new selftest | `node scripts/ci/world-gate.selftest.mjs` (Windows) and `/opt/node/bin/node …` (WSL/Linux) | **12/12 both** |
| Action YAML | parsed with `js-yaml` | 7 steps, 4 carrying `CLARA_GATE_STEP` |
| Working tree | `git status` | clean at `dd3d335dd` |
| Throwaway databases | `select datname from pg_database` on port 55721 | only `clara_rt`, `clara_rt_test`, `clara_wave_b_ci` remain |

No Windows-only known red was touched or "fixed".

# Anything unverified

1. **Neither historical abort was replayed on its own runner.** The re-check is by measurement of the
   same legs on this rig (AC5 above says so in the README too).
2. **`interview-e2e.mjs` was not run here.** It is hard-gated to `PGDATABASE ∈
   {clara_rt_test, clara_wave_b_ci}` and this rig's `clara_rt_test` is the pristine template that
   must not be written to, while `clara_wave_b_ci` belongs to the rig rather than to me. Its budget
   is wired and its in-process bound predates this work, but the *combination* is unmeasured.
3. **21 of the 24 wired legs were not run under the budget ON THIS RIG** — three were
   (`intake-batch`, `intake-admission`, `accrual`). SUPERSEDED IN PART by the fix round below: CI
   run 35508993162 ran all 24 at the budget on the runner and was green, and every leg now prints
   its own peak line, so the next run records the figures themselves. A leg that turns out to need
   more than 2048 MB says so attributably and raises it with `CLARA_GATE_HEAP_MB` plus its own
   measurement.
4. **The two-build drill itself was not run**; only a full `nitro build` under the budget, with the
   48 MB control.
5. **The wall-clock comparison is confounded** by ten concurrent workers on this host, as stated.
6. **The third LEG 4 race** (firm P declared done when its children die on their own) is out of
   #1027's scope, is now legible AND distinguishable from a belt regression by the counters, and is
   drafted as a ticket body in the fix round below.
7. **`for update skip locked` did not skip** in the one experiment that tested it (run `clara_923`:
   the sweep waited out the lock instead). I did not chase why; it only mattered as a rejected fault
   mechanism.

---

# Code review fix round (2026-09-20)

Both axes returned **accept-with-fixes**: `wave1-ci-gates-codereview-spec.json` (3 major, 5 minor,
4 note, plus `SPEC-META-01` added while this round was in flight) and
`wave1-ci-gates-codereview-standards.json` (2 minor, 4 note). Two more commits, one per ticket:

| commit | ticket | what it answers |
|---|---|---|
| `3d57866da` | #1027 | SPEC-1027-01, -02, -03, -04, -06, SPEC-META-01, STD-3 |
| `2eb14b58d` | #1026 | SPEC-1026-01, -02, -03, -04, -05, -06, STD-1, STD-4 |

Every finding above note severity is fixed; the notes are answered in a line. Nothing was pushed.

## Every finding, one line each

| id | sev | outcome |
|---|---|---|
| SPEC-1027-01 | major | **fixed** - one 30 s deadline became two measured ones, P 5 s and Q 8 s, justified in the file; LEG 4's polling is bounded by 13 s against 60 s |
| SPEC-1027-02 | minor | **fixed** - the loop converges only on refusal AND `batchCancelBlocked` AND the estate's own per-parent `cancel_blocked`; the belt is untouched |
| SPEC-1027-03 | minor | **fixed** - the reading rule now discriminates on the counters, not on the children's status, in the file and in the README |
| SPEC-1027-04 | minor | **answered** - the fault knob stays, deliberately, and the file says why; it is how this round re-verified both deadlines |
| SPEC-1027-05 | note | **answered** - the reorder is a consequence of hoisting the poison into a callable; both parents are `cancelling` before the first sweep on the default path, which is what the leg's claim needs |
| SPEC-1027-06 | note | **fixed** - each firm Q child carries its own state (settled / nothing-to-settle / held-by-fault / settle-refused) plus its Work status |
| SPEC-META-01 (1) | major | **fixed** - the firm Q control is dropped, with the reason; it could only ever assert a constant |
| SPEC-META-01 (2) | major | **fixed** - the door verdict is observed inside the bounded loop, on the same sweep that counts the refusal, with the same census on failure |
| SPEC-1026-01 | major | **fixed** - every leg now prints its own peak line; one CI run records all 24 |
| SPEC-1026-02 | major | **fixed** - the README compares like for like and names the bound's price |
| SPEC-1026-03 | minor | **answered in the action** - the three `exec bootstrap` calls stay outside the budget, with the reason |
| SPEC-1026-04 | minor | **fixed** - a selftest cell reads the action and refuses an unwired leg, with an inverse control |
| SPEC-1026-05 | note | **fixed** - `CLARA_GATE_NODE` dropped |
| SPEC-1026-06 | note | **fixed** - `${GITHUB_WORKSPACE:?the repo root; set by GitHub Actions}` |
| STD-1 | minor | **fixed** - the report's command now reproduces 24 exactly |
| STD-2 | note | **answered** - the unit cells stay; the reviewer's own two broken-mechanism experiments showed the CLI seam catches both regressions independently, so they are faster-failing coverage rather than the only coverage |
| STD-3 | note | **taken** - both loops now share one local `pollToDeadline(deadline, step, diagnose)`, which is what makes the two numbers visible at their call sites |
| STD-4 | minor | **fixed** - `os.constants.signals[signal]` replaces the hand map |
| STD-5 | note | **acknowledged** - the reviewer's independent re-run matched the report's gate table |
| STD-6 | note | **acknowledged** - one commit per ticket is inside WORK-ORDER rule 4; this round adds two more, one per ticket |

## #1027, the substantive ones

**SPEC-1027-01, the deadlines.** The single 30 s constant was 4 to 20 times the lateness it was
built for, and it held LEG 4 inside the window in which firm P's children reach `failed` on their
own (about 8 s, measured on clara_922, clara_927, clara_933). Each loop now carries its own number,
written into the file with the measurement that justifies it:

| loop | deadline | worst case ever measured | margin | why not longer |
|---|---|---|---|---|
| firm P's refusal count | **5 s** | 1516 ms (`late_poison` at 1.5 s, clara_929) | 3.3x | past about 8 s the belt has correctly settled firm P's parent, so waiting cannot buy a pass, only a later red in a different place |
| firm Q's terminal state | **8 s** | 2774 ms (`slow_settle`, clara_928) | 2.9x | larger on purpose: the fact it waits for is produced by the engine, not by this fixture |

**SPEC-1027-02 and SPEC-META-01, the attributable refusal.** `batchCancelFailed` is estate wide and
LEG 2's parent is still on the worklist, so the loop now converges only when ONE sweep reports a
refusal AND `batchCancelBlocked` (which the belt raises only for a parent whose every child refused
CLR04) AND the estate's own per-parent verdict `clara.get_intake_batch(pBatch).cancel_blocked =
'canceller_not_active'` (0229:1088). The verdict is read INSIDE the loop, on the same sweep, because
it is a fact the World can invalidate; reading it once after the loop would have been the very shape
#1027 exists to delete. The belt's counters and receipt shape are untouched, as the ticket requires.

The paired firm Q control was **dropped rather than kept**: `cancel_blocked` is derived only while a
parent is `cancelling`, firm Q is terminal by then, and no moment in this leg holds it in
`cancelling` deterministically (its own sweeps, or the leader's, can settle it), so the cell could
only ever assert a constant. What keeps the verdict honest is measured instead: under `late_poison`
the loop polls through three sweeps of `null` before the verdict flips (4 sweeps, 1554 ms), and under
the vacuity control it never flips at all.

**SPEC-1027-03, the discriminator.** The old rule ("P's children already `failed` means the third
race") is also the signature of a belt that swallows refusals. The rule is now the counters:
`blocked >= 1` with `cancel_blocked=canceller_not_active` means the belt DID refuse, so a terminal
parent means the World terminalised the children first (the separate defect); `refusals=0 blocked=0`
means the belt is not counting refusals at all (a regression). Measured on both sides: the vacuity
control produces exactly `refusals=0 blocked=0`.

## #1026, the substantive ones

**SPEC-1026-01, continuous evidence.** AC2 asked for a per-step measurement and the table had three
legs of twenty four. Rather than hand-measure 21 more, the launcher now measures every leg, every
run: on Linux it samples the child's own `/proc/<pid>/status` VmHWM and prints one greppable line.
Measured end to end on the rig, against the independent instrument:

```
[world-gate] peak #636 intake batch e2e | node tests/intake-batch-e2e.mjs | budget 2048 MB | peak RSS 860 MB (42% of budget) | exit 0
   /usr/bin/time -v on the same run: Maximum resident set size = 881020 kB = 860 MB
```

It is best effort by construction (off Linux the line says so, a read that throws is counted and
ignored, the timer is unref'd), and five cells pin each of those properties. It samples every 200 ms,
so a process shorter than one interval reports only its first sample; the legs it wraps run for
minutes and VmHWM is monotonic. The README says where to read the lines out of a job log.

Plus the evidence the coordinator supplied: **CI run 35508993162, job 106073526212 `db-live-gates`,
21m29s, GREEN at `dd3d335dd`** with all 24 legs through the launcher at 2048 MB. Per-step durations
from the job log: Slice-5 178 s, #633 13 s, #636 179 s, Wave-B (20 legs) 668 s; no `::error::`
annotation and no `Reached heap limit` anywhere in 3.6 MB of log. That establishes every leg PASSES
at the budget. It does not give per-leg peaks, which is exactly what the new line will record from
the next run onwards.

**SPEC-1026-02, the bound's price against the right baseline.** Recorded in the README: the
in-process bound, not the budget, is what buys AC3's margin (peak RSS 1.97-2.11 GiB without it,
0.79-1.06 GiB with it); against the like-for-like rows on this rig it roughly doubles the leg's wall
clock (0:56 and 1:14 without, 2:00 to 3:22 with), though the runner's own figure for that step is
179 s against 107-172 s historically; post-change peaks are a property of the bound's 512 MB
threshold and are not comparable with pre-change figures. On whether the longer wall clock widens
LEG 4's third race window: **unverified for the leg as a whole**, and measured NOT to affect LEG 4's
own polls, which converge on the first sweep in 8-40 ms with the bound armed, the same as without.

**SPEC-1026-04, the wiring guard.** `world-gate.selftest.mjs` now parses the action, finds every
non-comment line that invokes `node` with a `tests/...` entry point, and fails naming any that is
not routed through the launcher. It refuses to pass if it finds fewer than 20 legs, so it cannot go
green on an empty or renamed file, and an inverse cell feeds it a hand-written unwired leg and
asserts it is classified as unwired. It runs inside `pnpm lint`.

## Re-run evidence for this round

All through the real launcher, on throwaway clones of the migrated template, final code:

| db | configuration | outcome |
|---|---|---|
| `clara_811` | clean | PASS, P 1 sweep / 40 ms `door=canceller_not_active`, Q 1 sweep / 8 ms |
| `clara_812` | `late_poison` 1.5 s | PASS, P 4 sweeps / 1554 ms (the door read `null` for three of them) |
| `clara_813` | `slow_settle` 1.5 s | PASS, Q 4 sweeps / 1543 ms |
| `clara_814` | belt broken (vacuity control) | **RED at the P deadline**, 11 sweeps / 5560 ms, census `refusals=0 blocked=0` |
| `clara_821` | clean, peak line smoke | PASS, `peak RSS 860 MB (42% of budget)` |
| `clara_831`-`835` | clean, five consecutive | see the gate table below |

The belt was restored byte for byte after the vacuity control (`git checkout --`, `git status`
clean).

## Gates for this round, with counts

| gate | result |
|---|---|
| The #636 leg through the launcher, final code, **five consecutive** (`clara_831`-`835`) | **5/5 PASS**, peak RSS 808 / 811 / 831 / 904 / 930 MB = **39-45 % of the 2048 MB budget**, each with its own `[world-gate] peak` line in the log |
| …firm P's loop in each | 1 sweep, 15-74 ms, `blocked=1`, `door=canceller_not_active` |
| The leg under both faults, final code | `late_poison` PASS (4 sweeps / 1554 ms), `slow_settle` PASS (4 sweeps / 1543 ms) |
| Vacuity control, final code | **RED** at the P deadline, 11 sweeps / 5560 ms, census `refusals=0 blocked=0`; belt restored byte for byte |
| `node scripts/ci/world-gate.selftest.mjs` | **19/19** on Windows and on Linux (`/opt/node/bin/node` under WSL as `runner`) |
| `node scripts/check-frozen-workflows.mjs` | OK, 312 files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `pnpm typecheck` | clean |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, 371 PASS lines, with `EVERY node invocation of a tests/ entry point in db-live-gates goes through this launcher` and `world-gate selftest: OK` in the chain |
| Working tree | clean at `2eb14b58d` |
| Throwaway databases | all dropped; cluster back to `clara_rt`, `clara_rt_test`, `clara_wave_b_ci` |

## The third race: a ticket body for the orchestrator to file

Both reviewers agree it should not block this change. Drafted in the house shape:

---

> *This was generated by AI during triage.*

## Context

The durable intake batch gate's final leg (`packages/runtime/tests/intake-batch-e2e.mjs`, the
`LEG 4 p636.poison.cross_firm` block) builds a poisoned firm P whose stored canceller has lost
authority, and asserts that firm P's parent batch is still `cancelling` at the end of the leg while
a healthy firm Q's has reached `cancelled`.

Firm P's two children are ordinary admitted Work. The World dispatches them, the accounting-work
belt settles a running Work whose engine run it does not know (the same behaviour
`packages/runtime/tests/intake-batch-e2e.mjs`'s own `postEntry` comment documents), and they reach
`failed` on their own. Measured on a local rig: both children were `failed` within roughly 8 seconds
of being seeded, on three separate runs (throwaway databases clara_922, clara_927, clara_933). Once
they are terminal, `clara._intake_batch_live_children` returns nothing for that parent and
`clara.sweep_intake_batch_cancellations` settles it, which is correct belt behaviour
(`packages/db/migrations/0229_intake_batches.sql:986-996`). The leg then reds on
"…and firm P's is honestly still stopping, rather than silently declared done".

This is a third, independent nondeterministic red in the same block, distinct from the two that
#1027 fixed (a refusal count read from a single sweep, and a terminal state read from a single
sweep). #1027 deliberately did not address it: its brief named only those two observations, and its
five-consecutive-run acceptance passed. What #1027 did do is make the failure legible. The leg's
deadline and failure messages now carry both firms, both parents, both states, every child's Work
status, the cumulative refusal and blocked counts and the estate's own per-parent `cancel_blocked`
verdict, so this failure is distinguishable from a genuine belt regression: `blocked >= 1` with
`cancel_blocked=canceller_not_active` is this race, `refusals=0 blocked=0` is a regression.

Frequency is unknown. It has never been observed in CI; it was produced locally three times, each
time by deliberately slowing the leg (a fault knob holding a parent's decision back by 8 seconds, or
a broken-belt control polling for 30 seconds). It becomes more likely the longer LEG 4 takes, which
is why #1027's fix round cut that block's polling from a possible 60 seconds to 13.

It is also possible that CI job 105954490814 on `main` (2026-09-19, the red on the refusal count)
was this race rather than the one #1027 fixed. Nothing in that job's log distinguishes them, and the
census added by #1027 will, next time.

## Agent Brief

**Category:** bug
**Summary:** The intake batch gate's cross firm poison leg assumes the poisoned firm's children stay unfinished, and the engine can finish them first

**Current behavior:**
The leg proves that a batch belonging to a firm whose stored canceller has lost authority stays
honestly unfinished while a healthy firm's batch, swept in the same belt call, reaches its terminal
state. It builds the poisoned firm's children as ordinary admitted work items and leaves them for
the running engine. The engine settles them within a few seconds, because a running work item whose
engine run the world does not recognise is settled by the estate's own recovery belt. Once they are
settled, the poisoned parent has nothing live left, the cancellation belt correctly records it as
finished, and the leg fails on an assertion that says the poisoned parent must still be stopping.
The failure is a property of how long the leg takes rather than of anything the belt did wrong, and
it is indistinguishable, from the assertion alone, from the belt genuinely declaring a poisoned batch
done while its children are still refusing.

**Desired behavior:**
The leg proves the same disjointness without depending on how fast the engine happens to be. Either
the poisoned firm's children are held in a state the engine will not finish for the length of the
leg, so the parent's unfinished state is a fact about the belt rather than a race against the world,
or the assertion is made precise: the poisoned parent must be unfinished while it still has live
children, and a poisoned parent whose children have all been finished by the engine is recorded as
the correct outcome it is, with the leg saying so in its output rather than failing. Whichever is
chosen, the leg still proves what it proves today: that a permanently refusing firm does not make
the belt claim ignorance about the whole estate, that its refusals are counted and attributed to it,
and that a healthy firm swept in the same call still reaches its terminal state.

**Key interfaces:**
- The gate's own poisoned fixture: how the poisoned firm's children are built and what keeps them
  live for the length of the leg.
- The cancellation belt's per parent outcome and its blocked counter, and the estate's per parent
  report of a stop blocked by a canceller who has lost authority: these are what distinguish this
  race from a belt regression and their meaning must not change.
- The leg's own failure message, which already carries both firms, both parents, both states, every
  child's work status and both counters.

**Acceptance criteria:**
- [ ] The leg's disjointness assertion no longer depends on the engine being slower than the leg.
- [ ] A poisoned parent whose children the engine has finished is either prevented or reported as a correct outcome, never as an assertion failure that reads like a belt defect.
- [ ] What the leg proves today is unchanged: the belt never claims ignorance about the whole estate because one firm refuses, the refusals are counted and attributed to the poisoned firm, and the healthy firm swept in the same call still reaches its terminal state.
- [ ] The change is proved by a deliberately slowed run in which the engine does finish the poisoned firm's children, which passes, and by a deliberately broken belt, which still reds.
- [ ] The gate passes five consecutive runs against a freshly provisioned database.

**Out of scope:**
- Any change to the cancellation belt's own behaviour, counters or receipt shape.
- The two convergence defects already fixed in the same block.
- The gate's other legs.
- Reducing the gate's workload or the number of firms it builds.

---
