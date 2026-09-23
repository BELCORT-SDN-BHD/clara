# PR #1025 `db-live-gates` red: the `#636 intake batch e2e` leg, heap OOM and assertion race

**Diagnosis worker report. Verdict (b): the defect predates wave 1. No code was changed, no commit
was made, nothing was pushed and nothing was written to GitHub.**

Subject: branch `integration/riders-w1`, worktree `C:\Users\zhant\Desktop\clara-wt\int`, head
`7b83b1c0d`. Event: job `106048901216`, step `#636 intake batch e2e (same isolated DB + world)`,
`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`, exit 134 after
167 s.

**Headline.** The leg runs its whole 100 document batch, its Workflow World, its leader loop and its
engine in ONE Node process, and that process peaks between 2.0 GB and 4.2 GB against Node 22's
default heap ceiling of 4144 MB. It does that on `main` too: measured here at 2.52, 3.41, 3.76 and
**3.99 GB** on `origin/main` `e7f0a10a` versus 2.00, 2.75, 2.77, 4.11 and **4.18 GB** on
`integration/riders-w1`. The two distributions overlap completely and `main`'s mean is the higher of
the two. The same `Reached heap limit` / exit 134 signature already fired in this same composite
action on 2026-09-17, three days before wave 1 existed. And `main` at `dd3f8f1d`, the exact commit
wave 1 was cut from, failed this very leg on 2026-09-19 in the same assertion block that the PR's
re-run failed in.

---

## 1. What the batch leg did in each run

Five CI runs of this step now exist. All logs were parsed with small Node scripts
(`steps.js`, `seg.js`, `shapes.js`, `rate.js`) in the session scratch folder, never printed whole.

| # | Job | Branch / head | When | Leg wall clock | Leg lines | Outcome |
|---|---|---|---|---|---|---|
| 1 | `105919298241` | `main` `dc9acfe1` | 09-19 15:24 | 114.9 s | 3,864 | PASS |
| 2 | `105954490814` | `main` `dd3f8f1d` | 09-19 19:34 | 140.6 s | 4,028 | **FAIL** assertion, exit 1 |
| 3 | `106044057547` | PR `f6d828b2` | 09-20 07:52 | 171.6 s | 3,976 | PASS |
| 4 | `106048901216` | PR `7b83b1c0` att.1 | 09-20 08:31 | 167.4 s | 3,908 | **FAIL** heap OOM, exit 134 |
| 5 | `106051996127` | PR `7b83b1c0` att.2 | 09-20 08:56 | 106.7 s | 4,255 | **FAIL** assertion, exit 1 |

Run 2 is the one the brief and the coordinator did not have. It is on `main`, at the wave-1 fork
point, and it is a red in this leg. **`main` is not a passing baseline for this step.**

### Phase markers (the leg's own `[p636]` prints)

| # | 100 children uploaded | facets | `cancelRun` | `belt after the interruption` | End |
|---|---|---|---|---|---|
| 1 main `dc9acfe1` | 54.8 s (45.3 s) | 62.2 s `failed:1` | 63.4 s | 114.2 s, `children:35` | 114.7 s ALL LEGS PASSED |
| 2 main `dd3f8f1d` | 56.9 s (47.4 s) | 63.8 s `failed:1` | 65.2 s | 136.2 s, `children:38` | 140.3 s AssertionError |
| 3 PR `f6d828b2` | 58.8 s (49.3 s) | 67.7 s `failed:2` | 68.6 s | 170.0 s, `children:26` | 171.4 s ALL LEGS PASSED |
| 4 PR OOM | 56.1 s (46.6 s) | 63.9 s `failed:2` | 64.4 s | **never printed** | 143.9 s FATAL ERROR |
| 5 PR att.2 | 46.7 s (37.6 s) | 54.6 s `failed:3` | 55.0 s | 103.7 s, `children:40` | 106.4 s AssertionError |

Every run reaches the identical facet census `settled:95, admitted:95, waiting:4, unassigned:4`,
with `failed` varying 1 to 3. The leg is doing the same work in all five.

### Line rate per 10 s bucket

| bucket | 1 main pass | 2 main fail | 3 PR pass | 4 PR OOM | 5 PR att.2 |
|---|---|---|---|---|---|
| t+0s | 86 | 115 | 54 | 54 | 56 |
| t+10s | 579 | 598 | 521 | 582 | 727 |
| t+20s | 627 | 642 | 613 | 670 | 837 |
| t+30s | 695 | 674 | 685 | 685 | 874 |
| t+40s | 762 | 705 | 649 | 647 | 915 |
| t+50s | 720 | 678 | 574 | **759** | 339 |
| t+60s | 266 | 350 | 452 | 278 | 30 |
| t+70s | 5 | 5 | 97 | 20 | 29 |
| t+80s | 29 | 58 | 5 | 58 | 29 |
| t+90s | 30 | 1 | 30 | 31 | 235 |
| t+100s | 28 | 30 | 29 | 2 | 184 |
| t+110s | 37 | 43 | 33 | 58 | 0 |
| t+120s | 0 | 48 | 44 | 1 | 0 |
| t+130s | 0 | 3 | 15 | 32 | 0 |
| t+140s | 0 | 78 | 35 | 28 | 0 |
| t+150s+ | 0 | 0 | 140 | 3 | 0 |

**Nothing accelerated.** The OOM run's profile is indistinguishable from the four others: a burst to
about 750 lines per 10 s while the 100 children upload, then a collapse to near silence. The process
emitted 28 lines in the 10 s bucket before it died. This is not a log runaway, and it is not a retry
storm visible in the log.

### Top repeating message shapes in the failing leg (3,908 lines)

| Count | Shape |
|---|---|
| 556 | `    at async .../@workflow/core+[...].mjs:N:N` (stack continuation) |
| 436 | `    at async trace$N (.../@workflow/core+[...].mjs:N:N)` |
| 218 | `  workflowRunId: '<id>',` |
| 218 | `}` |
| 158 | `  errorStack: 'error: document-processing concurrency limit reached` + 5 more frames each |
| 109 | `[Workflow] Error while running workflow {` |
| 109 | `  errorCode: 'USER_ERROR',` / `  errorName: 'FatalError',` |
| 102 | `[reconcile] sandbox dispatch UNWIRED` |
| 102 | `[reconcile] render dispatch UNWIRED` |
| 79 | `[Workflow] Max retries reached, bubbling error to parent workflow {` |
| 72 | `[reconcile] lane pacing deferred N queued task(s) this sweep` |
| 56 | `[reconcile] ingest task <uuid> (lane ocr) has no transport metadata in its sidecar` |

About 2,100 of the 3,908 lines are one exception object printed with a nine frame stack. That is the
log volume, and it is the same on `main`.

### The four phrases the brief asked about, across all five runs

| Phrase | 1 main pass | 2 main fail | 3 PR pass | 4 PR OOM | 5 PR att.2 |
|---|---|---|---|---|---|
| `concurrency limit reached` | 507 | (not counted) | 492 | 513 | (not counted) |
| `lane pacing deferred` | 80 | - | 79 | 72 | - |
| `no transport metadata in its sidecar` | 52 | - | 126 | 56 | - |
| `intake finalize capability/state is invalid` | 54 | 22 | 51 | 24 | 20 |
| distinct intake ids in `intake FAILED` | **3** | **3** | **3** | **3** | **3** |
| distinct intake ids in `intake recovery deferred` | **1** | **1** | **1** | **1** | **1** |
| `[queue-drain] drained` | 0 | 0 | 2 | 2 | 2 |

- **`intake FAILED ... intake finalize capability/state is invalid` is NOT new relative to `main`.**
  It appears in every run, including both `main` runs, always with exactly three distinct intake
  ids, and always with exactly one of them entering the `intake recovery deferred` retry. The
  failing run has FEWER of these lines than either `main` run, because it died before it could emit
  the rest.
- **`lane pacing deferred N` does not grow without bound.** In the failing run N climbs 3 to 58
  during the upload burst, then plateaus at 58 to 70 and is 67 at the last sweep before the abort.
  `main`'s passing run peaks in the same band.
- The same single intake id repeating each sweep (`14fcf719...` in run 4, `c7ab9142...` in run 5) is
  the documented `intake recovery deferred` behaviour, one deferral per sweep, present identically
  on `main`.

### What actually differs in the failing run

One thing, and it is not a message: **the sweep cadence collapses.** In the failing run the
reconciler sweeps run about 0.1 s to 0.3 s apart up to t+66 s, then the last four sweeps land at
t+70.3 s, t+99.7 s, t+134.9 s and never again. A gap of 29 s and then 35 s between sweeps of a loop
whose normal cadence is roughly 2 s is event loop starvation, which is what a V8 heap approaching
its ceiling produces. The abort follows at t+143.9 s.

The `Last few GCs` block confirms it:

```
[7185:0x28497000]   143878 ms: Scavenge 4018.0 (4127.7) -> 4015.3 (4130.0) MB ... allocation failure
[7185:0x28497000]   143902 ms: Scavenge 4021.1 (4130.0) -> 4018.1 (4148.5) MB ... allocation failure
```

Two scavenges 24 ms apart reclaiming under 3 MB each at 4018 MB, then
`Runtime_AddDictionaryProperty` fails to allocate.

**The OOM run never reached the block the coordinator suspected.** Its last harness line is
`[control] cancelRun(...)` at t+64.4 s. It never printed `[p636] belt after the interruption:`,
which is emitted at `packages/runtime/tests/intake-batch-e2e.mjs:506`, inside LEG 3. LEG 4, the
cross firm poison block whose assertion run 5 failed on, starts after line 548. So the OOM happened
in LEG 5 (the capacity wall, 100 sequential `clara.create_document_intake` calls), LEG 2 or LEG 3,
and not in LEG 4.

---

## 2. `main`'s history with this leg

`gh run list --repo BELCORT-SDN-BHD/clara --workflow ci --limit 60`, then a per run
`gh run view <id> --json headBranch,jobs` step census over the 22 most recent runs.
`db-live-gates` actually executed in 18 of them (4 were skipped by the `changes` gate).

**It failed 5 times in those 18, counting both attempts of run `35499602467`:**

| Job | Run | Branch / head | Date | Failing step | Signature |
|---|---|---|---|---|---|
| `104334169828` | 34954788268 | **`main`** `4464e471` | 2026-09-15 | Wave-B rig-confined fault-gate e2es | exit 1 |
| `105215992382` | 35225394786 | `integration/wave-2026-09-15` | 2026-09-17 | Wave-B rig-confined fault-gate e2es | **heap limit, exit 134** |
| `105954490814` | 35464577581 | **`main`** `dd3f8f1d` | 2026-09-19 | **#636 intake batch e2e** | assertion, exit 1 |
| `106048901216` | 35499602467 att.1 | `integration/riders-w1` | 2026-09-20 | **#636 intake batch e2e** | **heap limit, exit 134** |
| `106051996127` | 35499602467 att.2 | `integration/riders-w1` | 2026-09-20 | **#636 intake batch e2e** | assertion, exit 1 |

Three of the five predate wave 1, and two of those three are on `main` itself.

### The pre-wave-1 OOM is byte-for-byte the same failure mode

Job `105215992382`, 2026-09-17T13:18:14Z, branch `integration/wave-2026-09-15`:

```
[7739:0x44357000]    77093 ms: Mark-Compact 4016.5 (4132.6) -> 4004.7 (4138.4) MB, 1810.37 / 2.45 ms
[7739:0x44357000]    80257 ms: Mark-Compact 4022.4 (4139.1) -> 4012.9 (4145.4) MB, 3048.10 / 0.00 ms
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
... 7739 Aborted (core dumped) PGPORT=$PGC_PORT PGDATABASE=clara_wave_b_ci WORKFLOW_...
##[error]Process completed with exit code 134.
```

Same 4 GB ceiling, same `FATAL ERROR`, same `Aborted (core dumped)`, same exit 134, same
`##[error]` line, and the same preceding picture of a reconciler loop whose sweeps have stretched
out (3.5 s apart against a 2 s cadence) before the process dies. The only differences are the leg
(`clara_wave_b_ci`, the Wave-B fault gate e2e, not the intake batch) and the failing allocation site
(`Runtime_AllocateInYoungGeneration` rather than `Runtime_AddDictionaryProperty`). **The
`db-live-gates` composite action has been able to OOM a runtime-booting e2e at Node's default heap
ceiling since at least 2026-09-17.**

### `main` at the wave-1 fork point failed THIS leg, in the same block

Job `105954490814`, `main` `dd3f8f1d`, 2026-09-19T19:34Z, step `#636 intake batch e2e`, 140.6 s:

```
+  136.2s [p636] belt after the interruption: {"batchCancelOk":true,...,"batchCancelChildren":38,...}
+  140.3s AssertionError [ERR_ASSERTION]: firm P's refusals are COUNTED, not swallowed
+  140.6s ##[error]Process completed with exit code 1.
```

That is `packages/runtime/tests/intake-batch-e2e.mjs:576`. Attempt 2 of the PR failed on
`intake-batch-e2e.mjs:584`, `firm Q's batch, swept in the SAME belt call as firm P's poison, still
reached its terminal state`, actual `cancelling` expected `cancelled`. **Those two assertions are
eight lines apart in the same LEG 4 block.** `main` fails one of them, the PR fails the other.

This is exactly what `wave1-lane06-final.md` already recorded from the local rig before integration:
"Leg 3 (`intake-batch-e2e.mjs`) failed BOTH times on its own leg-4 cross-firm-poison-isolation
assertion (`AssertionError: firm P's/Q's ... COUNTED/reached its terminal state`, a different
specific assertion each time)", and, decisively, "run a third time completely alone, on a fresh
database with no leg 1/2 and therefore **zero #967 code in its path**, it showed the identical
symptom".

---

## 3. The mechanism

### Why the assertions are a race, not a regression

`packages/runtime/tests/intake-batch-e2e.mjs:574-584` is the whole LEG 4 verification, and it does
not poll:

```js
const mixed = await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
assert.equal(mixed.batchCancelOk, true, "...");
assert.ok((mixed.batchCancelFailed ?? 0) >= 1, "firm P's refusals are COUNTED, not swallowed");
for (const child of qChildren) {
  const task = (await rig.rootQuery(
    "select current_task_id from clara.accounting_work where id=$1", [child.work_id])).rows[0].current_task_id;
  if (task) await settleRun(task, "cancelled").catch(() => {});
}
await withRuntime((c) => reconcileIntakeBatchCancellations(c, { withRuntime }));
assert.equal((await batchState(qBatch)).state, "cancelled", "firm Q's batch, ...");
```

Two single shot sweeps, each followed immediately by one state read. `settleRun(...).catch(() => {})`
**swallows its own failure**, so if the World is busy (and at this point it is still churning the
67 to 70 lane paced tasks and the retrying document ingests from LEG 1) and a settle does not land
before the second sweep, firm Q's parent is still `cancelling` and the assertion at line 584 fails.
Symmetrically, if firm P's two children have not yet had a run minted when the first sweep runs,
`batchCancelFailed` is 0 and line 576 fails. There is no loop, no deadline and no retry anywhere in
this block.

This also **disproves the coordinator's hypothesis** that "firm Q's batch not reaching 'cancelled'
would also explain a leg that polls until memory runs out". Line 584 cannot poll. It throws
immediately, which is exactly what it did at 106.4 s in run 5. And the OOM run never executed LEG 4
at all (see section 1).

### Why the process reaches 4 GB

Measured, not inferred. On WSL, Node `v22.23.2`, `v8.getHeapStatistics().heap_size_limit` is
**4144 MB**, which is the same ceiling the CI runner reports in its GC lines (4130 to 4148 MB). Both
are Node's default for a host with this much RAM. The leg boots the full Nitro bundle
(`packages/runtime/.output/server/index.mjs`, 10.9 MB), the durable World, the leader loop, the
engine, the Graphile worker and 100 concurrent document ingest workflow runs in **one** process. Its
peak RSS lands anywhere between 2.0 GB and 4.2 GB depending on when V8 decides to do a major GC.

**The live set is far below the ceiling.** With `--max-old-space-size=2048` the identical leg on the
identical branch and database passed in 130 s at **2.01 GB** peak RSS. So the 4.1 to 4.2 GB peaks
are floating garbage V8 had no pressure to collect, and the OOM is an allocation rate versus GC
scheduling failure a few hundred MB from the default ceiling, **not an unbounded accumulator.** That
is consistent with the failing run's GC trace (scavenges reclaiming 3 MB at 4018 MB, no
Mark-Compact in the last two entries).

### No wave-1 change adds an accumulator on this path

`packages/runtime/tests/intake-batch-e2e.mjs` is **not in the wave-1 diff at all**
(`git diff --stat e7f0a10a HEAD -- packages/runtime/tests`). The wave-1 delta on the runtime modules
this leg boots is:

| File | Change | Bound |
|---|---|---|
| `packages/runtime/lib/spool.mjs` | `renameIntoPlace` retry (#966) | deadline `CLARA_SPOOL_RENAME_RETRY_MS`, default **250 ms**; only retries `EPERM`/`EACCES`/`EBUSY`, which do not occur on Linux |
| `packages/runtime/lib/spool.mjs` | `listJsonEntries` replaces eager `listJson` (#966) | allocates one small `{name,path,mtimeMs,read}` per sidecar and parses **strictly fewer** rows than before |
| `packages/runtime/lib/intake.mjs` | `recoverPendingDocumentIntakes` rewrite (#966) | `RECOVERY_BATCH = 10`, `RECOVERY_OPEN_BUDGET = 30`; the new `unusable` array is bounded by the same 30 and discarded per sweep |
| `packages/runtime/lib/reconciler.mjs` | chat-clarify belt moved into the sweep (#852) | same call, same cadence, one extra spread of five numeric counters onto the receipt |
| `packages/runtime/lib/leader.mjs` | belt call removed from the loop (#852) | strictly fewer allocations per iteration |
| `packages/runtime/lib/hook-resume.mjs` | new leaf module (#852) | pure, no state |

**#967 cannot be the cause.** `packages/runtime/tests/queue-drain.mjs`'s `waitForQueueDrain` is
strictly read only: three `select` censuses (`censusNonTerminalRuns`, `censusUnboundTasks` and its
own `select id, name from workflow.workflow_runs where status = 'failed'`) plus `sleep`. It contains
no `insert`, `update`, `delete`, `cancel` or `fail_` statement. It is called only from
`intake-e2e.mjs` and `intake-admission-e2e.mjs`, at the very end, in processes that exit immediately
after, and it is **never called by `intake-batch-e2e.mjs`**. Its measured effect in run 3 was
`drained (polls=1, waited=16ms)` and `drained (polls=2, waited=457ms)`, so legs 1 and 2 left almost
nothing behind either way. It cannot consume or cancel anything the batch leg expects.

I could not pin the exact retaining object from logs alone. Doing so needs a heap snapshot
(`--heapsnapshot-near-heap-limit=1` with a reduced `--max-old-space-size`), which is work for the
ticket, not for this diagnosis. What the evidence does establish is that whatever holds the memory
holds the same amount on `main`.

---

## 4. Local reproduction

WSL 2, Ubuntu, Node `/opt/node/bin/node` `v22.23.2` (heap limit 4144 MB), 24 GB RAM,
PostgreSQL 17 cluster `rigrt` on port 55721. Each run created a throwaway database with
`createdb -T clara_rt_test clara_9NN` (the source had **0 open connections**, verified before each
copy), ran `node tests/intake-batch-e2e.mjs` under `/usr/bin/time -v`, then dropped the database and
its spool directory. The template `clara_rt_test` was never written to and is intact at frontier
`0234_legal_enforcement_mode`. Default heap unless stated.

### `integration/riders-w1` @ `7b83b1c0d`

| Run | DB | Peak RSS | Wall clock | Result |
|---|---|---|---|---|
| 1 | `clara_901` | **4,382,608 kB = 4.18 GiB** | 130.2 s | PASS |
| 2 | `clara_902` | **4,306,640 kB = 4.11 GiB** | (not captured) | PASS |
| 3 | `clara_903` | 2,881,080 kB = 2.75 GiB | 174.2 s | PASS |
| 4 | `clara_905` | 2,906,564 kB = 2.77 GiB | 83.4 s | PASS |
| 5 | `clara_906` | 2,101,844 kB = 2.00 GiB | 62.2 s | PASS |
| control | `clara_904`, `--max-old-space-size=2048` | 2,106,764 kB = 2.01 GiB | 130.5 s | PASS |

Mean peak RSS over the five default-heap runs: **3.16 GiB**.

### `origin/main` @ `e7f0a10a` (fresh worktree, `pnpm install --frozen-lockfile`, `pnpm --filter @clara/runtime build`)

| Run | DB | Peak RSS | Wall clock | Result |
|---|---|---|---|---|
| 1 | `clara_911` | 3,577,292 kB = 3.41 GiB | 188.4 s | PASS |
| 2 | `clara_912` | 3,946,524 kB = 3.76 GiB | 133.9 s | PASS |
| 3 | `clara_913` | 2,642,144 kB = 2.52 GiB | 133.7 s | PASS |
| 4 | `clara_914` | **4,185,396 kB = 3.99 GiB** | 134.8 s | PASS |

Mean peak peak RSS over the four runs: **3.42 GiB**.

**Reading.** `main`'s mean is HIGHER than the integration branch's, and `main`'s worst run reaches
3.99 GiB, within 150 MB of the 4144 MB ceiling (and RSS overstates the heap, so the heap itself was
closer still). The spread within each branch (about 2.2 GiB) is an order of magnitude larger than
the 0.26 GiB difference between their means. **Nine samples cannot distinguish these two
distributions, and what difference there is points the wrong way for a wave-1 regression.** No run
OOMed locally; the WSL host is quieter than a shared GitHub runner, which is consistent with CI
tipping over the edge and this rig not.

The `--max-old-space-size=2048` control is the important one: the same work fits in 2 GB when V8 is
told to collect. That is the fix direction.

---

## 5. Verdict

**(b) The defect predates wave 1. Nothing was changed on `integration/riders-w1`.**

The seven independent lines of evidence:

1. The heap OOM / exit 134 signature in `db-live-gates` first appears on **2026-09-17** (job
   `105215992382`), three days before wave 1, at the same 4 GB ceiling, in a sibling leg.
2. `main` at `dd3f8f1d`, the exact wave-1 fork point, **failed this very leg** on 2026-09-19 (job
   `105954490814`) in the same LEG 4 block, on the assertion eight lines above the one the PR's
   re-run failed on.
3. Local measurement, nine runs: `main` peaks at up to 3.99 GiB with a higher mean than the
   integration branch's 3.16 GiB. No separable effect.
4. Every noise shape the brief asked about is present on `main` in equal or greater quantity, and
   the `intake finalize capability/state is invalid` retry involves **exactly three distinct intake
   ids and one deferred id in every single run, including both `main` runs**.
5. The OOM run's log rate never accelerated. It matches the four other runs bucket for bucket and
   then goes quiet for 80 s while the heap fills.
6. No wave-1 change on this path introduces an unbounded structure; every new loop and buffer is
   explicitly bounded (250 ms, 10, 30), and #967's drain is read only and is never called by this
   leg.
7. `wave1-lane06-final.md` already reproduced the same LEG 4 assertion twice locally, and once more
   with #967's code provably absent from the path.

The two CI signatures are **two distinct pre-existing defects in the same leg**, not one:

- **A.** The leg runs within a few hundred MB of Node's default heap ceiling, so it aborts with
  exit 134 nondeterministically.
- **B.** The LEG 4 cross firm poison block asserts on single, non-polling sweeps with a swallowed
  `settleRun` failure, so it fails with exit 1 nondeterministically.

Neither is caused or worsened by #966, #852 or #967. Two consecutive reds on the PR are a sampling
artefact of a leg that is a coin flip on both axes, against a `main` baseline that also reds.

**Recommendation to the orchestrator:** the PR is not blocked by a wave-1 regression. The cheapest
way to get `db-live-gates` green is to re-run; the right fix is defect A's one line
(`NODE_OPTIONS: --max-old-space-size=...` on that step, which the control run shows makes the leg
both smaller and reliable) and defect B's polling wrapper. Both belong in tickets, drafted below.

---

## 6. Drafted ticket bodies

### Ticket A (primary, the assigned event)

> *This was generated by AI during triage.*

## Context

The `db-live-gates` CI job aborts nondeterministically with
`FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` and exit code
134, in whichever e2e step happens to be running a full durable runtime World in a single Node
process.

Observed twice, in two different steps, on two different branches:

- Job `105215992382` (run 35225394786, `integration/wave-2026-09-15`, 2026-09-17T13:18:14Z), step
  "Wave-B rig-confined fault-gate e2es", against `clara_wave_b_ci`. Last GCs:
  `Mark-Compact 4016.5 (4132.6) -> 4004.7 (4138.4) MB, 1810.37 ms` then `4022.4 -> 4012.9 MB,
  3048.10 ms`.
- Job `106048901216` (run 35499602467 attempt 1, `integration/riders-w1`, 2026-09-20T08:34:21Z),
  step "#636 intake batch e2e (same isolated DB + world)", against `clara_intake_ci`. Last GCs:
  `Scavenge 4018.0 (4127.7) -> 4015.3 (4130.0) MB` then `4021.1 -> 4018.1 MB`, failing in
  `Runtime_AddDictionaryProperty`.

The step scripts are in `.github/actions/db-live-gates/action.yml`; the process that dies is
`node tests/intake-batch-e2e.mjs` (and in the 2026-09-17 case the Wave-B fault-gate e2e) under
`packages/runtime`. Neither step sets `NODE_OPTIONS`, so both run at Node 22's default heap limit,
which the runner reports as roughly 4130 to 4148 MB.

Measured locally, WSL, Node v22.23.2, same default ceiling of 4144 MB, each run on a throwaway
database copied from `clara_rt_test`, peak RSS from `/usr/bin/time -v`:

- `origin/main` `e7f0a10a`, four runs: 2.52, 3.41, 3.76, 3.99 GiB. All passed.
- `integration/riders-w1` `7b83b1c0d`, five runs: 2.00, 2.75, 2.77, 4.11, 4.18 GiB. All passed.
- The same leg with `--max-old-space-size=2048`: **2.01 GiB peak, 130 s, passed.**

So the live set is well under 2 GB and the 4 GB peaks are floating garbage V8 has no pressure to
collect at the default ceiling. The abort is an allocation rate versus GC scheduling failure a few
hundred MB from the limit, not an unbounded accumulator, and it is unrelated to any recent change:
the mean peak on `main` (3.42 GiB) is higher than on the wave-1 integration branch (3.16 GiB).

Log evidence that nothing runs away: in the aborting run the per 10 s line rate peaks at 759 lines
at t+50 s and collapses to under 60 lines per 10 s for the remaining 80 s, matching four other runs
of the same step bucket for bucket. What does change is the reconciler sweep cadence, which stretches
from about 0.2 s to 29 s and then 35 s between sweeps before the abort, the signature of event loop
starvation under GC pressure.

Frequency: `db-live-gates` executed in 18 of the 22 most recent CI runs and failed 5 times, 3 of
those before the current wave existed and 2 of those on `main`.

## Agent Brief

**Category:** bug
**Summary:** The live-gates e2e steps that boot a full durable World run at Node's default heap ceiling and abort with exit 134 at random

**Current behavior:**
Each end to end gate that boots the runtime bundle, the durable World, the leader loop, the engine
and a hundred concurrent document ingests does so in one Node process with no heap budget declared.
Peak memory for a single run of one such gate varies between roughly 2 GB and 4.2 GB depending only
on when the garbage collector chooses to do major work. The default ceiling on the CI runner is
about 4.1 GB, so a run whose allocation rate outpaces collection near that ceiling aborts the whole
job with a heap limit fatal error and exit code 134. The gate gives no warning: its log output rate
is normal right up to the abort, and the only visible symptom is that the background reconciler
sweeps slow from a two second cadence to tens of seconds apart in the final minute.

**Desired behavior:**
Every gate step that boots a durable World declares an explicit memory budget, chosen so the step
completes reliably rather than so it is merely allowed to grow. A budget well below the host default
is preferable where it has been measured to work, because a smaller ceiling makes the collector do
its work earlier and the step both smaller and faster. When a step genuinely exceeds its budget the
failure must be attributable: the job should surface which step and which process died and on what
budget, rather than only a native abort trace. The budget belongs beside the step, with the measured
figure that justifies it recorded alongside, in the same place the other per step cost notes live.

**Key interfaces:**
- The composite live-gates action's per step environment: a declared heap budget for each step that
  spawns a World bearing Node process, rather than inheriting the host default.
- The runtime package's own gate documentation: a recorded peak memory figure per gate, measured the
  same way on both sides of any future change to it, so the budget can be reviewed rather than
  guessed.
- Any shared helper that launches these e2e processes should be the single place the budget is
  applied, so a new gate cannot be added without one.

**Acceptance criteria:**
- [ ] Every live-gates step that boots a durable World runs under an explicit, committed heap budget rather than the host default.
- [ ] The chosen budget is justified by a recorded measurement of that step's peak memory across at least three runs, and the measurement method is written down.
- [ ] Running the intake batch gate under the committed budget passes three consecutive times with peak memory at least twenty five percent below the budget.
- [ ] A step that exceeds its budget fails with a message naming the step and the budget, not only a native out of memory abort.
- [ ] The two historical aborts cited in the context are re-checked against the new budget and the result recorded.

**Out of scope:**
- Reducing what the gates actually exercise, such as the hundred document batch size or the number of firms.
- Splitting any gate into multiple processes or multiple jobs.
- The separate nondeterministic assertion failure in the same intake batch gate's cross firm poison block, which is its own ticket.
- Any change to the runtime's own memory behaviour in production.

---

### Ticket B (the sibling red in the same leg)

> *This was generated by AI during triage.*

## Context

The `#636 intake batch e2e` gate fails nondeterministically with exit code 1 on one of two adjacent
assertions in its final leg, the cross firm poison isolation block
(`packages/runtime/tests/intake-batch-e2e.mjs`, the `LEG 4 p636.poison.cross_firm` section,
currently lines 549 to 585).

Observed on both `main` and the current integration branch:

- Job `105954490814` (run 35464577581, **`main`** at `dd3f8f1d`, 2026-09-19T19:34Z), 140.6 s:
  `AssertionError [ERR_ASSERTION]: firm P's refusals are COUNTED, not swallowed` (line 576).
- Job `106051996127` (run 35499602467 attempt 2, `integration/riders-w1`, 2026-09-20T08:58Z),
  106.7 s: `firm Q's batch, swept in the SAME belt call as firm P's poison, still reached its
  terminal state`, actual `cancelling`, expected `cancelled` (line 584).
- `docs/plan/active/riders-2026-09-20/reports/wave1-lane06-final.md` records the same block failing
  twice on a local rig, "a different specific assertion each time", and once more in a run where the
  wave's own code was provably absent from the path.

The block performs two single shot calls to `reconcileIntakeBatchCancellations` with an immediate
state read after each, and no polling, deadline or retry anywhere. Between them it settles firm Q's
children with `await settleRun(task, "cancelled").catch(() => {})`, which **swallows its own
failure**. At that point in the gate the in process World is still working through roughly seventy
lane paced tasks and the retrying document ingests from the first leg, so a settle that has not
landed by the time the second sweep runs leaves firm Q's parent in `cancelling`, and a firm P child
whose run has not yet been minted leaves `batchCancelFailed` at zero. Both are timing, not a
behaviour defect in the belt: the passing runs of the same gate reach the identical facet census
`settled:95, admitted:95, waiting:4, unassigned:4`.

The gate's earlier legs already poll for the states they assert on. This block does not, and it is
the only one that reds.

## Agent Brief

**Category:** bug
**Summary:** The intake batch gate's cross firm poison leg asserts on single un-polled sweeps, so it reds at random on both branches

**Current behavior:**
The final leg of the durable intake batch gate proves that a batch belonging to a firm whose stored
canceller has lost authority stays honestly unfinished, while a healthy firm's batch swept in the
same belt call still reaches its terminal state. It proves this by running the cancellation belt
once, reading a state, settling the healthy firm's child runs while discarding any error from doing
so, running the belt once more, and reading the state again. Nothing waits for the world to catch
up. When the engine is still busy with the hundred document workload from the gate's first leg, one
of two things happens at random: the healthy firm's parent has not yet flipped to its terminal state
and the gate fails, or the poisoned firm's refusals have not yet been counted and the gate fails on
the assertion just above. Both outcomes have been seen on the default branch and on a feature
branch, and both are indistinguishable from a genuine product defect in the job's output.

**Desired behavior:**
The leg converges before it judges. Each state the leg asserts on is polled to a deadline, and a
deadline that expires fails with a message naming exactly which firm, which parent and which
observed state fell short, so a real regression is still caught and is still legible. The settle
step for the healthy firm's children no longer discards its own failure silently: a settle that
cannot be performed is either awaited to success within the same deadline or reported. The
assertions themselves keep their current strength, including the disjointness they prove between a
poisoned firm's outcome and a healthy firm's, so the fix removes flakiness without weakening what
the leg establishes.

**Key interfaces:**
- The gate's own convergence helper: whatever the earlier legs already use to wait for a state should
  be the single mechanism this leg uses too, rather than a second private wait.
- The cancellation belt's returned receipt, in particular its counter for refused children and its
  per parent outcome: these are what the leg polls on, and their meaning must not change.
- The run settlement call used for a child's current task: its failure must become observable to the
  leg rather than being discarded.

**Acceptance criteria:**
- [ ] The healthy firm's terminal state is polled to a deadline rather than read once, and the poisoned firm's refusal count is polled the same way.
- [ ] A deadline that expires fails with a message naming the firm, the parent and the state actually observed.
- [ ] A settlement that cannot be performed is surfaced rather than silently discarded.
- [ ] The leg still proves that the poisoned firm's parent remains unfinished while the healthy firm's reaches its terminal state, with no assertion weakened or removed.
- [ ] The gate passes five consecutive runs against a freshly provisioned database, and a deliberately broken belt still reds the leg.

**Out of scope:**
- Any change to the cancellation belt's own behaviour, counters or receipt shape.
- The gate's other legs, which already converge before asserting.
- The separate heap exhaustion abort in the same gate, which is its own ticket.
- Reducing the gate's workload or the number of firms it builds.

---

## 7. Operational note (an incident I caused and repaired)

While cleaning up the temporary `main` reference worktree I ran `git worktree prune` **from inside
WSL** against `C:\Users\zhant\Desktop\clara-rebuild`. WSL's git could not stat the Windows style
paths recorded for the other worktrees, judged them missing, and deleted the whole
`.git/worktrees/` directory, deregistering all eleven live worktrees at once.

**Repaired in full.** All branch refs survived (they live in the common ref store), and no
working-tree file was touched at any point. I rebuilt `.git/worktrees/<name>/{gitdir,commondir,HEAD}`
for each of the eleven from the branch mapping captured immediately before the prune, then ran a
mixed `git reset` in each to rebuild its index from `HEAD`. Verified afterwards:

```
C:/Users/zhant/Desktop/clara-rebuild e7f0a10af [main]
C:/Users/zhant/Desktop/clara-wt/635  05195d9dd [riders/w2-lane01]   dirty=4
C:/Users/zhant/Desktop/clara-wt/636  a618d6e63 [riders/w2-lane02]   dirty=1
C:/Users/zhant/Desktop/clara-wt/642  9e8fd9e4a [riders/w2-lane03]   dirty=0
C:/Users/zhant/Desktop/clara-wt/651  e81ad46b1 [riders/w2-lane04]   dirty=1
C:/Users/zhant/Desktop/clara-wt/655  1d91c1a92 [riders/w2-lane05]   dirty=0
C:/Users/zhant/Desktop/clara-wt/656  07da571ae [riders/w2-lane06]   dirty=1
C:/Users/zhant/Desktop/clara-wt/657  a74ef35a8 [riders/w2-lane07]   dirty=0
C:/Users/zhant/Desktop/clara-wt/658  f8770aa1a [riders/w2-lane08]   dirty=0
C:/Users/zhant/Desktop/clara-wt/659  4c82c806d [riders/w2-lane09]   dirty=3
C:/Users/zhant/Desktop/clara-wt/660  ad1c2ce33 [riders/w2-lane10]   dirty=0
C:/Users/zhant/Desktop/clara-wt/int  7b83b1c0d [integration/riders-w1] dirty=0
```

The remaining dirty entries are genuine in-progress wave-2 lane work (modified `.tsx`/`.sql`/test
files and two untracked probe directories), consistent with lanes that are still running.

**What was lost and is not recoverable:** each worktree's per worktree reflog (`logs/HEAD`) and
`ORIG_HEAD`, and the staged versus unstaged distinction for any file a lane had `git add`ed but not
committed (those files are now unstaged modifications; their content is intact). **The `int`
worktree is clean at `7b83b1c0d`, exactly as it was at the start of this task.**

**Rule worth adding to RIG.md:** never run `git worktree prune`, or any `git worktree` subcommand,
from WSL against a repository whose worktrees are registered with Windows paths. Use the Windows
git for worktree administration, and WSL only for running things inside an already-registered
worktree.

---

## 8. Artefacts

Scratch folder
`C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\riders\ci-figures\`
(not committed):

- `before-105919298241.log`, `after-106044057547.log`, `fail-106048901216.log`,
  `hist-105954490814.log`, `hist-106051996127.log`, `hist-105215992382.log`,
  `hist-104334169828.log` (job logs via `gh api repos/BELCORT-SDN-BHD/clara/actions/jobs/<id>/logs`).
- `steps.js` (step boundary and duration map), `seg.js` (one step's lines with relative offsets),
  `shapes.js` (message-shape census and per 10 s buckets), `rate.js` (cross run rate comparison).
- `run-batch.sh`, `run-batch2.sh` (WSL repro harness), `probe.sh`, `cleanup.sh`, `setup-main.sh`.
- `/tmp/probe1..4.log`, `/tmp/int905..906.log`, `/tmp/main911..914.log` inside WSL, each with a
  `.time` sidecar carrying the `/usr/bin/time -v` output.

All probe databases (`clara_901` to `clara_906`, `clara_911` to `clara_914`) were dropped; the
cluster on port 55721 is back to `clara_rt`, `clara_rt_test`, `clara_wave_b_ci`. The temporary
`mainref2` worktree was removed and its directory deleted.
