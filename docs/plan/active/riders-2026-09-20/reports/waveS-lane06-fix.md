# Riders sweep wave — lane 06, fix round

Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
Database `clara_l08` on `127.0.0.1:55748`. Playwright triple `3570 / 3571 / 3572`.
One implementer for all review findings (`/implement-spec`). No migration in this lane, so no
prestate pin moved and `apps/web/tests/firm-scope-db-pins.corpus.ts` is out of scope (rule (d):
no file under `packages/db/migrations/` appears in `git diff --name-only 7bc5a710f..HEAD`).

**New head: `5c086b8f2c475cb64c669970b0c9d9c6efc113dd`** (`5c086b8f2`).
Worktree clean; the whole branch is 21 files, +1634 / −87 against the base.
No status-report request arrived during this round.

## Commits added by the fix round (newest first)

| commit | subject |
|---|---|
| `5c086b8f2` | docs(web): #1141 what the fix round measured — three runs of the suite, ten under load, and the window itself |
| `8187e7d0f` | docs(runtime): #1131 record that the drill's contract leg has now actually been executed |
| `1d91f1839` | docs: #1124 the stale-node_modules note gets a durable home, and its pnpm claim is verified |
| `f26314192` | test(web): #1141 B4's focus landing is ONE settled observation, tag, identity and tabindex together |
| `b94f4970c` | fix(ci): #1127 the notification's channel is a standing OPEN issue, found by title |
| `ccde648eb` | feat(runtime): #1129 a contract exception that has gained its rule is named too |
| `42ea7cd3d` | fix(runtime): #1128 refreshOnce publishes the cycle it starts, so a concurrent caller joins it |
| `1d1fa0fc0` | fix(runtime): #1044 the delete is a mutation too, and the merge reads the path it locked |
| `65d4388c6` | fix(db): #1126 the summary cells cut the write group itself, and the floor counts what CI counts |

Every fix was reproduced before it was written, in the file it belongs in, and every subject broken
for a control was restored byte for byte (checked with `git status` / `sha256sum`, not by eye).

## The findings

| id | ticket | severity | outcome |
|---|---|---|---|
| ADV-L06-01 | #1044 | major | **fixed** — both removers take the sidecar's own lock; red 50/50 before, green after |
| ADV-L06-02 | #1126 | major | **fixed** — the cut is anchored to the write group; the decisive control now reds all three cells |
| ADV-L06-03 | #1127 | major | **fixed** — the channel is an OPEN issue resolved by title, created when absent; no number pinned |
| SPEC-1127-CHANNEL | #1127 | major | **fixed as far as a worktree can** — grant question answered from the docs + the repo's own setting; the notice also lands on the run summary, which needs no grant; both doors driven |
| SPEC-1131-UNRUN | #1131 | major | **fixed** — the drill ran end to end and printed its own line; `TWO-BUILD CUTOVER E2E: ALL PASS` |
| SPEC-1141-AC1 | #1141 | major | **the instrument ran and did not reproduce; the window was measured instead** (below) |
| SPEC-1141-AC2 | #1141 | major | **met** — the whole browser suite green twice (589 passed each), no B4 red; a third run with the PRE-FIX cell also green |
| SPEC-1044-AC3 | #1044 | major | **partly met, and the rest concretely diagnosed** (below) |
| STD-1 | #1131 | minor | **fixed** — vacuity control taken twice against the committed cell inside its real file |
| SPEC-1127-TARGET | #1127 | minor | **fixed** with ADV-L06-03 |
| SPEC-1126-SKIPSMAX | #1126 | minor | **fixed** — recorded as a deliberate residual, with the reason |
| SPEC-1124-SCOPE | #1124 | minor | **fixed** — the durable statement now lives in the repo's own `README.md` |
| ADV-L06-04 | #1128 | minor | **fixed** — `refreshOnce` publishes the cycle it starts |
| ADV-L06-05 | #1044 | minor | **fixed** — `readTaskMetaAt(path)`: read, lock and write are one string |
| ADV-L06-06 | #1126 | minor | **fixed** — the derivation counts what CI counts, and refuses the two shapes it cannot |
| ADV-L06-07 | #1127 | minor | **fixed** — the README says what is wired and what the first scheduled run still proves |
| ADV-L06-08 | #1044 | minor | **fixed** — both stale paragraphs rewritten |
| ADV-L06-09 | #1129 | minor | **fixed** — `deadContractRuleExceptions` closes the other end |
| ADV-L06-10 | #1141 | minor | **fixed** — one settled observation carries tag, identity and tabindex |
| ADV-L06-11 | #1124 | note | **fixed** — durable home, and the pnpm 11.8 claim verified and cited |
| ADV-L06-12 | #1126 | note | **fixed** with SPEC-1126-SKIPSMAX |
| SPEC-1141-BODYASSERT | #1141 | note | **fixed** — the poll carries a named message stating the defect in the cell's own words |
| SPEC-1129-SINCE | #1129 | note | no action required by the finding; left as the deliberate deviation it records |
| STD-2 | #1126 | note | **left, with a reason** (below) |

---

## #1044 — the sidecar lock

### ADV-L06-01 · the delete was the one mutator left outside the lock (major, fixed)

Reproduced first. New cell `p1044.delete` in `packages/runtime/tests/intake-sidecar-race.test.mjs`:
50 rounds of `writeTaskMeta` → start `mergeTaskMeta` with the widened body the lost-update cells
already use → `removeTaskMeta` → await both → read. **RED at 50 of 50 rounds** against the shipped
code (`a delete that has been ordered must stay done: 50 of 50 rounds came back with the sidecar the
terminal cleanup deleted`) — the reviewer's measurement, reproduced independently through the
module's own public doors.

One line in each remover: `removeTaskMeta` and `removeIntakeSpool`'s metadata `rm` now run inside
`withSidecarLock(path, …)` on the same key their writer uses. Green after, and
`_sidecarLockCountForTest()` is 0 at the end, so a delete's turn is collected like every other.

**The residual is now stated where it bites** — the reviewer's own alternative for the half that is
out of scope. The lock orders a delete against a mutation ALREADY RUNNING; it cannot order one
against a `mergeTaskMeta` that has not started. A lenient merge first called after the delete
re-creates the sidecar — correct for the task with no sidecar yet, indistinguishable from the task
whose sidecar was just collected — and `SPOOL_REAPABLE` is `intake-*` only, so nothing ever collects
that file. Widening `SPOOL_REAPABLE` is deliberately NOT done: a live task's sidecar can lawfully sit
untouched past the TTL, and reaping it would lose the transport fields the DB row does not carry,
which is the exact loss #1044 exists to prevent. Written into `lib/spool.mjs`'s `removeIntakeSpool`
header, `lib/reconciler-documents.mjs`'s own comment, and the README's #1044 section.

### ADV-L06-05 · the merge read through a third resolution of `CLARA_SPOOL_DIR` (minor, fixed)

New cell `p1044.one_path`, deterministic and sleep-free: call `mergeTaskMeta`, repoint
`CLARA_SPOOL_DIR` synchronously (so the change lands before the locked turn's own read), await.
**RED**: `the merge answered without ["storageKey","sha256","mime","format"]` — it read an empty base
out of directory B and wrote the transport-less result to the path it had locked in directory A.
Fixed with a private `readTaskMetaAt(path)` that `readTaskMeta(id)` now expresses itself over, so the
read's source, the lock's key and the write's target are literally one string. The comment that
claimed this is now true, and says what the first cut got wrong.

### ADV-L06-08 · the two places a reader lands still said the defect was open (minor, fixed)

`lib/reconciler-documents.mjs:249-257` sat directly above the `mergeTaskMeta(row.taskId, row)` call
#1044 fixed and still read "a hard guarantee needs real locking or a version/mtime CAS, out of scope
here". `packages/runtime/README.md`'s #1043 residual paragraph — the one `SWEEP-PLAN.md:188-190`
cites as the repository's own admission of #1044 — still read as a live defect immediately above the
section that closes it. Both rewritten to point at `withSidecarLock` and to state what remains.

### SPEC-1044-AC3 · the db-live-gates intake chain (major, partly met + diagnosed)

The finding says one leg of three was run and that leg went red twice. **All three legs were run, in
the action's own order, five consecutive rounds, each on a database rebuilt for that round.**

CI builds `clara_intake_ci` with `pnpm db:migrate` + `pnpm db:seed` + world bootstrap. RIG.md forbids
a second from-scratch chain on a lane cluster (migration 0154 pins the cluster-wide role count), so
each round instead CLONED `clara_l08` — itself migrated 0001→0234 from scratch and seeded —
bootstrapped the world on the clone, and settled the inherited test residue, which is what these
files' own doors tell you to do ("Use a fresh database, or settle/cancel those rows first"). Schema
and seed data are identical to CI's; what differs is that the clone starts from a USED estate.

| round | `intake-e2e` | `intake-admission-e2e` | `intake-batch-e2e` |
|---|---|---|---|
| 1 | exit 0 | exit 1 (terminal drain only) | exit 0 |
| 2 | exit 0 | exit 1 (terminal drain only) | **exit 1** (`:650`) |
| 3 | exit 0 | exit 1 (terminal drain only) | exit 0 |
| 4 | exit 0 | exit 1 (terminal drain only) | exit 0 |
| 5 | exit 0 | exit 1 (terminal drain only) | exit 0 |

**Leg 1 is green 5 of 5.** The lane's own report said legs 1 and 2 "cannot be run on this rig at
all"; leg 1 runs, and passes, every time (`INTAKE E2E: PASS (HTTP stream/CORS/token lock → Storage →
finalizer → WDK OCR → regions; SSE live under structured parse load)`).

**Leg 2's own assertions pass every round.** All ten of its legs print `PASS` in all five rounds
(`[leg 1] PASS` … `[leg 8] PASS`). What fails, every time, is the terminal cross-leg hygiene drain
`waitForQueueDrain` (#967), and the census says exactly why: `clara.agent_tasks` rows with
`kind='wake'`, `status='held'`, `known:false`. Those are minted DURING the leg from the cloned
estate's own backlog, and each layer of that backlog I settled removed more of them:

| what was settled on the clone before the leg | held wake tasks at the drain |
|---|---|
| live tasks only | 661 |
| + the 584 pending `clara.wake_intents` | 223 |
| + the `router` and `wake_engine` `clara.relay_checkpoints` advanced to each firm's head (3356 rows) | **19** |

The final 19 were created at `10:15:42–43`, inside the leg's own window, from
`lint.finding_transition` (17) and `compliance.watch_transition` (2) wake intents with decision
`notification` — i.e. the cloned estate's OWN client data producing compliance notifications while
the leg's runtime sweeps. They are born `held` because both `clara.wake_engine_sources` rows are
`enabled = false`. A freshly migrated and seeded `clara_intake_ci` has no such client data, which is
why this leg is green in CI and cannot complete on a clone of a used lane estate. **That is a rig
property, precisely named, and it is orthogonal to #1044**: no #1044 code path is involved.

**Leg 3 went red once, in round 2, at exactly the line the lane's own report named**
(`intake-batch-e2e.mjs:650`, `exactly one op receipt per live child (3 of 7)`), and the cause is now
concrete rather than "load-sensitive". The log shows `[p636] belt after the interruption:
{"batchCancelOk":true,"batchCancelSettled":0,"batchCancelChildren":0}` — the belt found an EMPTY
worklist, because `clara.sweep_intake_batch_cancellations` no longer had that parent to offer: the
remaining live children had settled on their own between the cancel decision and the belt sweep
(the same log carries `document ingest terminally failed (engine_error): test Azure adapter is not
injected` and `intake finalize capability/state is invalid` in that window). The cell's own comment
already allows for a child settling between the SEED and the DECISION, and asserts by identity there
— but it then asserts one receipt for every child on the decision's worklist, with no allowance for
a child settling between the DECISION and the belt. Under load that window widens. In round 3 the
same leg reported `batchCancelChildren: 26` and passed. **Follow-up for the orchestrator (I cannot
file issues): `intake-batch-e2e.mjs:650` should either scope its receipt census to children still
live at belt time, or assert by identity the way the lines above it do.**

**Also for AC3's third clause:** the touched runtime file was run under WSL as user `runner`, the
runner's own platform — `tests/intake-sidecar-race.test.mjs` **22 pass / 0 fail**, and
`tests/l9-pool-contract-lane-probe.test.mjs` **28 pass / 0 fail**
(`wsl -u runner --cd … /opt/node/bin/node --test <file>`, with `CLARA_SPOOL_DIR` pointed at a per-run
`/tmp` directory).

---

## #1126 — the frontier-leg floors and the step summary

### ADV-L06-02 · the three `p1126.summary` cells were false-green (major, fixed)

`summaryBlock`'s regex opened on the first `{` in the step, which is the one inside the step NAME's
own `${{ inputs.slice }}`. Measured on the real action, it captured **6350 of the slice-list step's
7966 characters** — the `node --test` invocation and every pre-existing `$PASS`/`$FLOOR` reference
the floor check above it already uses — so all three cells passed a write that emitted its `###`
heading and no count rows at all.

Slice, in order: an assertion that every captured line is an `echo` (**RED** against the loose cut, 3
of 15 failing, each naming `{ inputs.slice }} …`), then the anchored cut
`/\n[ \t]*\{\n([\s\S]*?)\n[ \t]*\} >> "\$GITHUB_STEP_SUMMARY"/` (green; captures 284/302/299
characters, all echoes). **The decisive control the reviewer asked for**: gut the three writes to
their headings alone, and the three cells now fail with `missing $PASS`. The action was restored byte
for byte after the control (`git diff` empty).

### ADV-L06-06 · the derivation was not the number CI measures (minor, fixed)

`staticCellCount` matched `^test\(` alone while the leg computes `CELLS=$((PASS + SKIP))`, so
quarantining a cell with `test.skip(` left the leg's count where it was and dropped this one,
forcing the declared floor DOWN for a cell that is still there.

The finding's suggested pattern also counted `test.todo(`. **Measured, it should not**: on node 22,
`test("a"); test.skip("b"); test.todo("c")` reports `# tests 3 / # pass 1 / # skipped 1 / # todo 1`,
and the leg reads `# pass` and `# skipped` only. So the derivation counts `^test(` and
`^test.skip(`, and `assertCountableCorpus` REFUSES the two shapes it cannot count — a registration at
non-zero indent, and a `test.todo(` — each with its reason in the message. Both refusals hold on
today's corpus (a scan of every file in all five lists finds neither shape). New cell
`p1126.floor.derivation` pins the counting rule against a known-good literal and is RED against the
old cut.

### SPEC-1126-SKIPSMAX / ADV-L06-12 · the skip bound stays hand-declared (minor/note, recorded)

Recorded with its reason in `packages/db/tests/README.md`: only the cell FLOOR is a property of the
corpus on disk. A skip count is how many of those cells stand down at ONE frontier, which depends on
which preintegration gates that frontier grants, so nothing static can compute it; deriving it would
need a run at each frontier. A recorded residual of #1126, not an oversight.

### STD-2 · the three step-summary shell blocks stay duplicated (note, left)

A composite action's steps share no in-process state, so the extraction is a new script file plus an
indirection, not a function in scope. The file's own FLOOR/SKIPMAX check blocks were already
duplicated once per step before this ticket, so the new writes follow the file's established
convention rather than introducing one, and the three differ in header text and in `FLOOR`/`SKIPMAX`
versus `DFLOOR`/`DSKIPMAX`. Seven lines each. A `scripts/ci/` file sourced by three steps would cost
more than it saves; the finding itself records it as a judgement call.

---

## #1127 — the weekly schedule's notification

### ADV-L06-03 / SPEC-1127-TARGET · the channel was an issue this wave closes (major/minor, fixed)

The first cut hardcoded `gh issue comment 1127` and the test pinned the literal. #1127 is the ticket
that ASKED for the notification and the wave that delivers it closes it, so the standing channel for
every future weekly red would have been a closed issue nobody has reason to reopen — the ticket's own
failure mode, re-created by its own fix.

**No owner ruling is needed, because the job no longer needs a number.** It resolves the OPEN issue
whose title is exactly `CI health: the weekly scheduled sweep` and OPENS one when none exists, so the
channel can neither be closed out from under it nor need a human to create it first. The search
index's eventual consistency is named in the workflow's own comment: at a weekly cadence two failures
inside the index's lag do not arise, and a duplicate standing issue is a visible outcome, not a silent
one, which is the property the job exists for.

New cell `p1127.notify.standing` refuses any literal issue number in the job and requires both the
`gh issue list --state open … in:title` resolution and the `gh issue create` fallback.

### SPEC-1127-CHANNEL / ADV-L06-07 · the grant, and the doors (major/minor, fixed as far as possible)

1. **The grant question is answered, not assumed.** The repository's default workflow permission is
   `read` — `gh api repos/BELCORT-SDN-BHD/clara/actions/permissions/workflow` →
   `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}`. GitHub's own
   documentation says a job-level `permissions:` key widens that default: *"Anyone with write access
   to a repository can modify the permissions granted to the `GITHUB_TOKEN`, adding or removing
   access as required, by editing the `permissions` key in the workflow file"* (docs.github.com,
   *Managing GitHub Actions settings for a repository* § Setting the permissions of the GITHUB_TOKEN
   for your repository). The ORG-level setting could not be read (`gh api orgs/…` → 403, needs
   `admin:org`) — recorded rather than assumed away.
2. **If the grant is ever refused, the notice still lands.** The step writes the failure to
   `$GITHUB_STEP_SUMMARY` — which needs no token scope at all — BEFORE any `gh` call, and runs under
   `set -euo pipefail` so a refused grant fails the job loudly instead of continuing past a call that
   did nothing. New cell `p1127.notify.summary` holds the ORDERING, not just the presence.
3. **The doors were DRIVEN.** The resolution command was run against this repository, read-only, both
   ways: with the standing title it returns empty (so the first failure takes the create branch);
   with an existing open issue's exact title it returns `1131`. The step's own shell was then
   extracted from the parsed YAML and executed end to end against a stubbed `gh` in BOTH branches —
   the summary write lands first in both, the found branch runs `issue comment 4242 --repo … --body
   Weekly scheduled CI sweep: …`, the absent branch runs `issue create --repo … --title CI health:
   the weekly scheduled sweep --body <standing-issue text>`. `bash -n` on the block is clean;
   `js-yaml` parses the workflow (12 jobs, the job's `permissions` = `{issues: write}`).

**Still not driven, and the README now says so instead of claiming otherwise:** the live API write.
`packages/db/tests/README.md` was reworded from "is now a visible notification" to "now WIRES … to a
visible notification", with the held / driven / not-driven split spelled out. **The first scheduled
run after this merges is what proves a comment posts, and belongs in the release evidence.**

---

## #1128, #1129, #1131, #1141, #1124

### ADV-L06-04 · the settle helper re-opened its own hole one level up (#1128, minor, fixed)

`_waitForLaneProbeSettleForTest` drove a fresh cycle but nothing re-pointed `inFlight` at it, and
`refreshOnce` hands `inFlight` to anyone arriving while a cycle is busy — so a second caller entering
mid-cycle awaited the previous cycle's already-resolved promise and read the verdict that cycle had
left behind, which is exactly what `refreshOnce`'s own comment says must never happen.

The new cell gates round 2's probes on a deferred, so the concurrent caller is guaranteed to arrive
while the cycle is genuinely in flight rather than by luck of scheduling. **RED**: the joining caller
came back `read.ok = true` (cycle 1) while the starting caller came back `false` (cycle 2).
`refreshOnce` now publishes at the one place a cycle can begin, so the invariant is structural rather
than something each call site must remember; `ensureStarted`'s interval callback loses the guard it
needed for the same reason.

### ADV-L06-09 · the exception list was write-only (#1129, minor, fixed)

`contractsMissingFrontierRule` never named an id that is BOTH excepted and ruled — the normal end
state, once the migration that requires the contract lands — so a
`CONTRACTS_DECLARED_AHEAD_OF_THEIR_RULE` entry survived forever with nobody told it was dead: the
same "sits forever, silently" failure the ticket names, moved onto the list that excuses it.
`deadContractRuleExceptions(rules, exceptions)` closes the other direction over a shared
`ruledContractIds`. The new cell is RED before the export exists, proves the guard by name on a
synthetic table (one excepted-and-ruled id among an excepted-and-unruled one and a
ruled-but-never-excepted one), and asserts this image's own list carries no dead entry.

### SPEC-1131-UNRUN and STD-1 · the drill was never run (#1131, major + minor, fixed)

The cell shipped without the drill it lives in ever having been executed, and that drill feeds the
required per-PR `db-live-gates` job.

**It has now been run the way `db-live-gates` runs it** — `node scripts/ci/world-gate.mjs
tests/two-build-cutover-e2e.mjs` against a bootstrapped WDK World on a throwaway clone of this lane's
database (created, bootstrapped, its inherited live Work settled at the drill's own door's
instruction, and dropped afterwards). It printed its own line:

```
[tb-e2e] preflight CLI: --supported <body-complete roster>, no --supported-contracts, exits 1
  naming frontier_requires_contract for intake_refusal_record_v1, fa_parked_run_v1
TWO-BUILD CUTOVER E2E: ALL PASS
[world-gate] … exit 0
```

**The vacuity control was then taken against the COMMITTED cell inside its real file, twice** — which
is exactly what STD-1 says the hand-reconstructed equivalent did not do:

- (a) emptying both `requiresContracts` rows in `lib/rollback-preflight.mjs` reds the block's own
  control: `control: a database at 0318_knowledge_fye_pair_applicability must carry at least one
  frontier CONTRACT rule; got []`;
- (b) sharper, on the deliverable assertion itself: suppressing only the contract line in the CLI's
  refusal output reds `…naming the reason`, i.e. `assert.match(cliC.stderr,
  /frontier_requires_contract/)`.

Each subject was restored byte for byte (`git status` clean; `sha256sum` unchanged —
`lib/rollback-preflight.mjs` `6dea87d9…`, `scripts/rollback-preflight.mjs` `18ecc52b…`) and the drill
re-run green afterwards. Recorded in `packages/runtime/README.md`'s two-build section. Incidental
evidence: the drill's own build gate refused a run after a restore had touched a bundled source's
mtime (`REFUSING TO RUN AGAINST AN UNTRUSTWORTHY BUILD (stale)`), i.e. that guard works too.

### SPEC-1141-AC1 · the reproduction (#1141, major)

**The ticket's own instrument was run verbatim and did not reproduce.** The PRE-FIX B4 cell (restored
from `7bc5a710f`), ten runs beside a parallel `node scripts/run-tests.mjs` of the whole web unit
suite: **10 green / 0 red of 10**. The fixed cell under the same load: **10 green / 0 red of 10**. A
whole-suite run with the pre-fix cell in place was also green. That is consistent with the ticket's
own rate of once in three whole-suite runs, and it is reported as a non-reproduction rather than
dressed up.

**So the window was MEASURED instead of waited for.** A temporary in-page sampler (one sample per
animation frame and one per macrotask beat, recording only changes) was installed around the answer
submission. **Four independent runs recorded the same sequence:**

```
[#1141 AC1] activeElement trace: ["BUTTON","BODY","H2"]
```

Focus leaves the submit button, spends a tick on `<body>` while the row is unmounted, and only then
lands on the heading. That `<body>` tick is precisely the state the old unwaited read could observe:
not hypothetical, and the reason no extra timeout on an instant read would have helped. The sampler
was an uncommitted edit of the cell, reverted immediately (`git status` clean).

Taken together with the vacuity control already on record (dropping `restoreFocusAfterRow`'s final
`landmark.focus()` reds the polled cell with `Timeout 15000ms exceeded while waiting on the
predicate`), the defect's mechanism, the cell's discrimination and the fix's effect are all
established. What is NOT established is a red produced on demand from the old cell; `apps/web/e2e/
README.md` now says so in those words.

### SPEC-1141-AC2 · the whole browser suite twice (#1141, major, met)

Three whole-suite runs on this lane's triple, 54 specs, `workers: 1`, `--no-build` against one build:

| run | B4 cell | result | B4 |
|---|---|---|---|
| 0 | PRE-FIX (`7bc5a710f`) | **589 passed** (18.2m) | green |
| 1 | committed fix | **589 passed** (21.0m) | green |
| 2 | committed fix | **589 passed** (17.9m) | green |

No failures in any run. AC2's "green twice with no B4 red" is met by runs 1 and 2; run 0 is AC1's
attempt at the reproduction.

### ADV-L06-10 / SPEC-1141-BODYASSERT · the residual unwaited read (minor/note, fixed)

The first cut polled `document.activeElement.tagName` and then re-read `document.activeElement` in a
SECOND, unwaited `evaluate` for its text and tabindex, so any focus movement between the two round
trips was read by the one carrying no wait — and the poll was satisfied by ANY `<h2>` on the page
while the identity check lived in the unwaited read. The whole triple now comes back from inside the
poll, asserted with `toEqual({ tag: "H2", text: expect.stringContaining("Needs you"), tabindex:
"-1" })`, and the poll carries a named message that still states the defect in the cell's own words.
Budget unchanged (`cellBudgetMs({ polls: 4 })`, still one added poll); `e2e/cell-budget-census.test.ts`
5 pass / 0 fail.

### SPEC-1124-SCOPE / ADV-L06-11 · a durable home, and a verified claim (#1124, minor/note, fixed)

AC2 asks for the fix to be documented once, in a single place other lanes' agents would naturally
find. It landed in this wave's own `RIG.md`, a plan folder archived when the wave closes — and three
earlier waves each carry their own RIG.md with their own narrower install line, which is the very
mechanism by which the guidance went stale. The durable statement now lives in the repository's own
`README.md` under "Develop", beside the `pnpm install --frozen-lockfile` line it qualifies. The wave
RIG.md keeps its copy with the wave-4 evidence and now opens by naming the README as the durable home
and telling whoever cuts the next wave's rig to point at it.

The `pnpm 11.8` attribution was flagged unverified; it is now checked both ways and cited.
`pnpm install --help` on the pinned 10.33.0 prints no `--dry-run`, and the option landed in
[pnpm v11.8.0](https://github.com/pnpm/pnpm/releases/tag/v11.8.0) (2026-06-18), whose release notes
read *"Added a `--dry-run` option to `pnpm install`. It runs a full dependency resolution and reports
what an install would change, but writes nothing to disk"* (pnpm/pnpm#12449, merged 2026-06-16).

---

## Gates, with counts

| gate | result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** |
| `packages/db`, gate chain + `ci-frontier-leg-contract` + `ci-schedule-notify` + `operation-census` + `rig-isolation` | 57 tests, **56 pass / 0 fail / 1 skip** |
| the same two CI files under `CI=true GITHUB_ACTIONS=true` | 24 tests, **24 pass / 0 fail** |
| `packages/runtime`: `intake-sidecar-race`, `l9-pool-contract-lane-probe`, `rollback-preflight`, `ready`, `intake-reconcile`, `reconcile`, `reconcile-belt-isolation-unit` | 162 tests, **140 pass / 0 fail / 22 skip** (the pre-existing WDK-World-gated skips) |
| WSL as user `runner`: `intake-sidecar-race.test.mjs` | **22 pass / 0 fail** |
| WSL as user `runner`: `l9-pool-contract-lane-probe.test.mjs` | **28 pass / 0 fail** |
| `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` | **OK** — 322 frozen files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `apps/web` whole unit suite (3 runs, as the AC1 load) | 5173 tests, **5171 pass / 0 fail / 2 skip** each, zero `not ok` lines |
| `apps/web` whole browser suite × 3 | **589 passed** each (18.2m / 21.0m / 17.9m) |
| `apps/web` `e2e/cell-budget-census.test.ts` | **5 pass / 0 fail** |
| `two-build-cutover-e2e.mjs` through `world-gate.mjs` | **ALL PASS**, exit 0 (plus two red controls and a re-run green) |
| `db-live-gates` intake chain, 5 rounds × 3 legs | leg 1 **5/5 green**; leg 2 0/5 (terminal drain only, diagnosed above); leg 3 **4/5 green** |
| `eslint` on every touched source file | clean |

**Known reds not fixed, reported as such:** `ready.test.mjs`'s `ready r2: NO DSN component reaches
the /ready payload or a warning line (H-48)` went red once in five runs and green in the other four
and in isolation. It is the file's documented host-contention flake
(`wave2-integration-ci-clock.md` classes it "(b) Flake"; `wave4-lane07-ticket1033.md` names it the
file's other contention cell), not a consequence of this round's changes.

## Rig hygiene

Every throwaway database created for this round (`clara_rt_test`, `clara_intake_ci`) was dropped;
`select datname from pg_database where datname like 'clara%'` now returns `clara_l08` alone, so the
lane cluster carries no bootstrapped World and `rig-isolation.test.mjs` re-ran green afterwards
(33 tests, 32 pass / 0 fail / 1 skip). The lane database was never written to — it was only ever the
`TEMPLATE` source for clones. Every helper script used for the clones lived in the worktree as a
dot-prefixed `.tmp.mjs` and was deleted; `git status` is clean. No `git worktree` subcommand, no
`git gc`, and no git at all from WSL.

## Follow-ups worth filing (I cannot write to GitHub)

1. **`intake-batch-e2e.mjs:650`** asserts one op receipt per child on the cancel decision's worklist
   with no allowance for a child settling between the DECISION and the belt sweep, though the lines
   above it make exactly that allowance for the window between the seed and the decision. Under load
   the belt finds an empty worklist and the count comes up short (measured: 3 of 7, with
   `batchCancelChildren: 0`). Scope the census to children still live at belt time, or assert by
   identity as the lines above do.
2. **`intake-admission-e2e.mjs`'s terminal `waitForQueueDrain`** cannot pass on any database carrying
   real client data, because the estate's own compliance/lint notifications mint `held` wake tasks
   while the leg's runtime sweeps and both `clara.wake_engine_sources` rows are disabled. It is
   green in CI only because `clara_intake_ci` is empty. If the rig is ever meant to run this leg, the
   drain needs to scope to the leg's own firms.
3. **#1127's first scheduled run** should be watched, and the comment (or the newly created standing
   issue) recorded in the release evidence. That is the one thing about this channel that a worktree
   cannot prove.
4. **`#!skips-max:`** stays hand-declared (recorded residual of #1126); deriving it needs a run at
   each frontier.
5. **The next wave's RIG.md** should point at the root `README.md`'s stale-`node_modules` paragraph
   rather than re-deriving it (#1124's AC2 across a wave boundary).
