# Wave-1 CI figures for #850 and #967 — the first real `db-live-gates` run

**Measurement worker report. Read-only: no code, no comments, no tickets were touched.**

**AFTER run (both tickets' code present):** PR #1025 ("Riders wave 1: 42 small tickets outside
the mainline (no migration)"), branch `integration/riders-w1`, workflow run
[35497822078](https://github.com/BELCORT-SDN-BHD/clara/actions/runs/35497822078), head sha
`f6d828b2c86af8bc9971d8bd7ce63a405ec8c829`, job **db-live-gates** id `106044057547`, conclusion
`success`, the composite step `./.github/actions/db-live-gates` ran 2026-09-20T07:49:00Z →
2026-09-20T08:09:28Z. This branch has not merged to `main` (PR state: open).

**BEFORE run:** the newest `main` CI run at the time of writing, `35465749929` (head
`e7f0a10af`), did **not** run `db-live-gates` — its `changes` gate skipped it (no
db/runtime-path diff in that merge). So did the three main runs before it
(`35458368349`, `35456599996`, `35454966645` — all `db-live-gates: skipped`). Walking back
further, the most recent `main` run that actually executed `db-live-gates` is
[35451473743](https://github.com/BELCORT-SDN-BHD/clara/actions/runs/35451473743) — the merge of
PR #955 ("Wave 2026-09-18 hosted release as-run"), head sha
`dc9acfe1f2b55457bebc37e22fcfae8133551774`, merged 2026-09-19T15:19:51Z. Its **db-live-gates**
job id is `105919298241`, conclusion `success`, ran 2026-09-19T15:20:08Z → 15:39:45Z. Verified
against the log itself: it contains no trace of `OVERLAP_MIN_CORES`, `shouldOverlapSecondBuild`,
`#850`, `waitForQueueDrain` or `queue-drain.mjs` — `main` at this point genuinely predates both
tickets' code, which is what "before" needs to mean here.

Both logs were downloaded with `gh api repos/BELCORT-SDN-BHD/clara/actions/jobs/<id>/logs` and
parsed with small Node scripts (`analyze2.js`, in this session's scratch folder) rather than
printed whole — each is ~3.5–3.6 MB / ~29,600–30,200 lines.

**Sample-size caveat, stated once up front:** this is one CI run on each side. GitHub-hosted
runners vary in exact core allocation and load; a single sample cannot separate real effect from
run-to-run noise smaller than roughly the numbers below. Treat both figures as one honest data
point each, not as a distribution.

---

## #850 — Cut the two-build drill's two scratch builds to one

**AC1, quoted:** "The db-live-gates step that runs the drill is measured (wall clock, both legs)
before and after, and the action's recorded cost comment is updated to the current figure."

**Definition used:** the two-build cutover drill is `packages/runtime/tests/two-build-cutover-e2e.mjs`,
run as the `node tests/two-build-cutover-e2e.mjs` line inside the `db-live-gates` composite
step's shared "Slice/#637" script block, on its own `clara_rt_test` database. Wall clock = first
line the process itself prints (`[tb-e2e] build gate: ...`) to its last line
(`TWO-BUILD CUTOVER E2E: ALL PASS`), both read directly off their log timestamps — the same
"first and last line" method the task specified, and the same drill both the ticket and
`wave1-lane06-final.md` describe (their own local-rig numbers used the identical start/end
markers, just off a Windows host).

### BEFORE — run 105919298241 (main, pre-#794/#850 shape, sequential only)

| Marker | Timestamp |
|---|---|
| `[tb-e2e] build gate: ...` (start) | 2026-09-19T15:35:12.6674863Z |
| claraWork scratch build ("previous") | built in 4.5s (15:35:12.7342545 → 15:35:17.2650667) |
| chatTurn scratch build ("previous-chat") | started 15:35:39.0955687 — **only after** the claraWork leg's entire exercise (spawn/admit/stop/spawn/resume/preflight) finished; built in 4.6s (→ 15:35:43.6484013) |
| `TWO-BUILD CUTOVER E2E: ALL PASS` (end) | 2026-09-19T15:35:50.4760058Z |
| **Whole-file wall clock** | **37.809 s** |

Both scratch builds are fully sequential and both pay in full against the wall clock — the
pre-#850 shape, confirmed by the chatTurn build starting only once the claraWork leg is
completely done, not right after the claraWork scratch build itself finishes.

### AFTER — run 106044057547 (PR #1025, has #850's overlap guard)

| Marker | Timestamp |
|---|---|
| `[tb-e2e] build gate: ...` (start) | 2026-09-20T08:04:51.0664023Z |
| claraWork scratch build ("previous") | built in 4.8s (08:04:51.1341531 → 08:04:55.9645644) |
| chatTurn scratch build ("previous-chat") | started 08:04:55.9890142 — **24 ms after** the claraWork scratch build (not the whole leg) finished; built in 5.4s (→ 08:05:01.4350040), finishing well before the claraWork leg's own exercise even reaches "A ready" (08:05:08.15) |
| `TWO-BUILD CUTOVER E2E: ALL PASS` (end) | 2026-09-20T08:05:27.8746096Z |
| **Whole-file wall clock** | **36.808 s** |

**Which path did the runner take?** The action.yml comment expects a literal log line,
`[tb-e2e] #850: availableParallelism()=… is below the overlap threshold …`, to name the path.
That line is **not present** in this run's log — and by design: reading the current source
(`packages/runtime/tests/two-build-cutover-e2e.mjs`, `integration/riders-w1` branch,
lines 584–596), that message is only printed on the **sequential** branch
(`if (chatSupported && !canOverlap)`); the overlap branch prints nothing about its own core
count. So the path is inferable, not directly logged: the timing evidence above (second build
starting 24 ms after the first build — not after the whole claraWork leg — and finishing before
the claraWork leg's own exercise needs it) is the overlap shape, by elimination and by direct
comparison against the BEFORE run's unambiguously-sequential timing. **The exact core count
GitHub's runner reported is not recoverable from this log** — only that it was ≥ `OVERLAP_MIN_CORES`
(4), since the guard took the overlap branch. This job's workflow uses `runs-on: ubuntu-latest`
(`.github/workflows/ci.yml:284`); the action.yml comment's own assumption ("GitHub-hosted standard
runners report 2 cores") looks stale against this evidence, but that is an inference from one
run, not a re-measured fact about the runner class.

### Verdict

**AC1 (measurement) is now satisfiable with a real CI figure, and shows: BEFORE 37.809 s,
AFTER 36.808 s, a 1.001 s / 2.6% reduction, overlap path taken (inferred).** This is a real,
small improvement, not the "drops materially" the ticket's Desired Behavior hoped for — but AC1
itself only asks for the measurement and an updated comment, and AC3's own second branch ("or
the ticket is closed as not worth it, with the measured numbers recorded") is what
`wave1-lane06-codereview-fix.md` already argued for once a 2–4 core guard was added. One sample
per side cannot rule out that the ~1 s difference is within this runner class's own run-to-run
variance — a second BEFORE/AFTER pair would be needed to trust the delta itself, though the
*mechanism* (build-timing shape) is unambiguous from this one pair. **The action.yml comment
itself (`.github/actions/db-live-gates/action.yml:361-362`, still the old "78.0s / 124s,
Windows-host, pre-#794" text on `main` as of this writing) has not yet been updated with these
numbers — a code change, out of scope for this read-only report.**

**Ready-to-post paragraph for the ticket:**

> First real CI figures (PR #1025, run 35497822078, job 106044057547, `ubuntu-latest`): the
> two-build cutover drill's whole-file wall clock is **36.808 s**, taking the overlap path
> (inferred from build-start timing — the code only logs the core count on the sequential
> branch, which did not fire here). The most recent `main` run with this step actually
> executed (run 35451473743, pre-#850) measured **37.809 s**, sequential. That is a
> **1.001 s / 2.6% reduction** on one sample each side — real, but far short of "drops
> materially," and within what a single hosted-runner sample could plausibly attribute to
> noise. AC1's measurement obligation is discharged with these numbers; the action.yml
> comment (currently the stale Windows-host 78.0s/124s pair) should be updated to cite them.
> AC3's "closed as not worth it, with the numbers recorded" branch is the honest read once the
> 2–4-core guard is accounted for.

---

## #967 — CI World leg for intake batches: drain the queue between legs

**AC1, quoted:** "A normal passing run of the three intake legs produces a log volume not
dominated by concurrency-limit or retry noise inherited from an earlier leg (an
order-of-magnitude reduction from the measured roughly 1.27 million lines)."

**Definition used, and where it came from:** the ~1.27M-line figure originates in
`docs/plan/active/refresh-wave-2026-09-18/reports/636-final.md` (Follow-ups #5): *"My re-run on
an already-used World produced hundreds of `document-processing concurrency limit reached`
FatalErrors and `[classify] … exceeded 3 attempts` lines — 1.27M log lines — before it passed."*
That is a **deliberate re-run of the intake-batch World leg against a database that had already
carried a full prior pass's leftover Workflow state** — not a normal single first-pass CI job,
which always provisions a fresh `clara_intake_ci` per job run. `wave1-lane06-final.md` says
plainly it could not reproduce that figure either, for the same reason (no parallel unpatched
copy kept). Given that, I measured the only thing a normal `db-live-gates` job can show: **total
log-line volume of each of the three intake legs, in one normal single pass**, using GitHub's own
step boundaries (`##[start-action display=…]`, which line up 1:1 with the three `node
tests/intake-*.mjs` steps) — plus a line count matching the exact two phrases the 636 report and
the ticket both name (`concurrency limit reached`, `exceeded 3 attempts`), to see where any
noise actually sits.

### BEFORE — run 105919298241 (main, no drain)

| Leg | Lines | Noise lines* |
|---|---|---|
| `intake-e2e.mjs` ("Slice-5 intake transport e2e") | 1,041 | 0 |
| `intake-admission-e2e.mjs` ("#633") | 110 | 0 |
| `intake-batch-e2e.mjs` ("#636") | 3,864 | 160 |
| **Combined** | **5,015** | **160** |

\* lines matching `concurrency limit reached` or `exceeded 3 attempts`, case-insensitive. All
160 were `concurrency limit reached` (0 `exceeded 3 attempts`), clustered
2026-09-19T15:24:35Z–15:25:20Z (~45 s), inside the batch leg's own run.

No `[queue-drain]` marker anywhere in this log (expected — `main` has no #967 code).

### AFTER — run 106044057547 (PR #1025, has #967's drain gate)

| Leg | Lines | Noise lines* |
|---|---|---|
| `intake-e2e.mjs` ("Slice-5 intake transport e2e") | 1,049 | 0 |
| `intake-admission-e2e.mjs` ("#633") | 117 | 0 |
| `intake-batch-e2e.mjs` ("#636") | 3,976 | 152 |
| **Combined** | **5,142** | **152** |

All 152 were `concurrency limit reached` (0 `exceeded 3 attempts`), clustered
2026-09-20T07:52:33Z–07:53:20Z (~47 s), inside the batch leg's own run.

**Direct evidence the fix ran, and worked, in real CI:** `queue-drain.mjs`'s own marker,
`[queue-drain] drained (polls=N, waited=Xms)`, appears exactly twice, matching
`wave1-lane06-final.md`'s own local numbers almost exactly:

- after `intake-e2e.mjs`: `drained (polls=1, waited=16ms)`
- after `intake-admission-e2e.mjs`: `drained (polls=2, waited=457ms)`

No such marker exists in the BEFORE log (the code isn't there). This confirms the gate is live
and doing real work in CI, not a no-op — legs 1 and 2 hand the next leg a database with zero
non-terminal runs and zero unbound tasks, every time, in this run.

### Why the AC1 number does not move — and why that is not a red flag

The ~150–160 `concurrency limit reached` lines sit **entirely inside the batch leg's own run**,
in both BEFORE and AFTER, appearing within the first ~45–47 seconds of that leg's own 100-document
load — not inherited from legs 1/2 (which the drain now proves are clean before the batch leg
starts either way). This matches `wave1-lane06-final.md`'s own documented design choice:
`intake-batch-e2e.mjs` deliberately does **not** call the drain (nothing runs against
`clara_intake_ci` after it, and its own scope ends with live rows on purpose). So this leg's
own concurrency-limit noise, from its own legitimate concurrent load, was never the target of
#967's fix and is not evidence against it.

The ~1.27M-line figure is simply not a condition either sample reproduces, because a normal
`db-live-gates` job never runs against an "already-used World" — it provisions
`clara_intake_ci` fresh every job. Neither the BEFORE nor the AFTER sample gets anywhere near
that scale (5,015 and 5,142 total lines respectively, across all three legs combined), so an
"order-of-magnitude reduction from ~1.27M" is **not decidable from either sample**: there is
nothing at that scale to reduce from in a normal run, and the scenario that produced 1.27M is
not one a normal CI job encounters.

### Verdict

**Not decidable from these two samples, on the letter of AC1's cited scale — but the mechanism
AC1 actually cares about (cross-leg leftover noise) is directly proven fixed.** The drain gate
runs in real CI, does real bounded work (1–2 polls, 16–457 ms), and leaves each leg's `clara_intake_ci`
clean for the next. The batch leg's own ~150–160-line noise band is unchanged (152 vs. 160, a
5% difference within likely run-to-run variance) because it was never cross-leg noise to begin
with, by the lane's own documented design. The 1.27M-line scenario needs a deliberate re-run
against a used World to reproduce, which neither this task nor a normal CI job performs.

**Ready-to-post paragraph for the ticket:**

> First real CI figures (PR #1025, run 35497822078, job 106044057547 vs. the last `main` run
> with this step, 35451473743, job 105919298241): a normal single-pass run of the three intake
> legs shows **5,142 total log lines / 152 concurrency-limit lines (AFTER)** vs. **5,015 total /
> 160 concurrency-limit lines (BEFORE)** — all of the noise, on both sides, sits inside the
> `intake-batch-e2e.mjs` leg's own ~45-second run, not inherited from the two legs before it.
> Direct evidence the fix works: `[queue-drain] drained (polls=1, waited=16ms)` after
> `intake-e2e.mjs` and `drained (polls=2, waited=457ms)` after `intake-admission-e2e.mjs` — both
> absent from the pre-fix run, both proving the gate does real bounded work rather than
> resolving as a no-op. The cited ~1.27M-line figure came from a deliberate re-run against an
> already-used World (docs/plan/active/refresh-wave-2026-09-18/reports/636-final.md,
> Follow-ups #5); a normal `db-live-gates` job — which always provisions a fresh
> `clara_intake_ci` — never reaches that scale on either side of this fix, so AC1's specific
> "order-of-magnitude reduction from ~1.27M" is not decidable from a normal run. What is
> verified: the drain mechanism the AC actually cares about (no cross-leg leftover carried
> forward) works in real CI, matching the lane's own local-rig evidence almost exactly.

---

## Scripts and raw logs (scratch folder, not committed)

- `after-106044057547.log`, `before-105919298241.log` — full job logs downloaded via
  `gh api repos/BELCORT-SDN-BHD/clara/actions/jobs/<id>/logs`.
- `analyze2.js` — Node script that locates each job's `##[start-action display=…]` step
  boundaries, isolates the three intake-leg steps by their display names, and counts total
  lines and noise-phrase lines per step.
- `peek.js` — small helper used to sanity-check line counts and encodings before writing the
  real script.

All in `C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\2d0e3faa-4367-4726-8208-67089ecdd96a\scratchpad\riders\ci-figures\`.
