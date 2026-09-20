# Wave 1 — Lane 06 final report

Branch: `riders/w1-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\656`, cut from
`origin/main` at `dd3f8f1d`. Fork point unchanged throughout (`git merge-base origin/main
HEAD` = `dd3f8f1d`); `origin/main` itself fast-forwarded to `e7f0a10a` during this session
(PR #1013, another lane's work) — that is a normal wave event, not this lane's doing, and
this lane never touched `origin/main` or any other worktree. Own commits, in order:

```
ebbaa2ee perf(runtime): #850 overlap the two-build drill's two scratch builds
c00fc8d4 fix(runtime): #967 drain each intake CI leg's queue before it exits
7f956c6b docs(db): #963 name the cross-migration body-pin convention 0233 relies on
```

Diff against the true fork point (`git diff --stat dd3f8f1d..HEAD`): 8 files, +365/-19.
Working tree clean at hand-off.

## #850 — Cut the two-build drill's two scratch builds to one

**Status: partial** — done by overlap rather than by sharing one staged tree (measured first,
per the ticket's own rule), but **AC1 (the step's own before/after wall clock, measured on CI)
is unmet**: the numbers below are a Windows-host measurement, not a CI one, and no CI figure for
this step — taking either path — has ever been recorded (code review round 2, L06-SPEC-R2-02; see
`wave1-lane06-codereview-fix.md`'s "Per-ticket status"). Discharged only by the first real CI run
of this step, which must supply the wall-clock figure and confirm which path
(`OVERLAP_MIN_CORES`) it takes.

- **AC1 (measured before/after, action comment updated).** Local wall-clock measured on
  `packages/runtime/tests/two-build-cutover-e2e.mjs` run standalone against a bootstrapped
  `clara_rt_test` on this rig (Windows, Node 22, `RELAY_TEST_MODE=1`): sequential (before)
  36.6s and 42.5s across two runs; overlapped (after) 32.3s and 34.8s across two runs, each
  scratch build 5.0–6.2s. `.github/actions/db-live-gates/action.yml`'s own comment beside
  the step is updated with these numbers and states plainly that **the CI wall-clock figure
  is unverified here** — this rig has no CI runner, its scratch build (5–6s) is over an
  order of magnitude faster than CI's own recorded 78.0s, so only the mechanism (not the
  absolute seconds) transfers. Only CI can produce the number AC1 actually asks for; the
  comment says so and keeps the stale 78.0s/124s pair (now explicitly marked as predating
  #794's second leg) until a live run supersedes it, the same way the #637 fix-round review
  once superseded an earlier figure.
- **AC2 (both legs' build-A images still independently verified).** Unweakened:
  `buildPreviousVersionImage` is untouched: each scratch image is still staged, its own
  registry pin rewritten, its own successor body file deleted, and each is still
  independently scanned (`bodiesA` / `bodiesA2`) against build B's roster for the "differs
  by exactly one body" invariant, asserted in the same places as before.
- **AC3 (CI cost decreases, or closed with numbers).** Decreases, per the local measurement
  above; the mechanism (hide the second scratch build's compute inside the first leg's own
  HTTP/DB-bound exercise, not CPU-bound) is architecture-level and should transfer to CI,
  where a much larger scratch-build cost (78s recorded) sits inside a leg whose own exercise
  very likely also takes tens of seconds — but that is CI's own number to produce.

**Change:** the `clara.open_interruption`/`clara.answer_interruption` probe that gates the
chatTurn leg now runs once, at the top of `main()`, instead of deep inside that leg's own
block. Right after claraWork's own scratch build finishes, the chatTurn scratch build is
started (not awaited) in the background; the chatTurn leg later awaits that already-in-flight
promise instead of starting a fresh build.

**Test-first / vacuity control:** no new test file (the ticket's own proof instrument is the
existing drill's exhaustive assertions). Deliberately collided the two builds' scratch
directory names (dropping the chatTurn build's `name: "previous-chat"` override, defaulting
to `"previous"` — the most plausible mistake this refactor invites) and re-ran: **RED**,
`ENOENT` on claraWork's own build artifact (ripped out mid-flight by the second build's
`rmSync` on the SAME directory). Reverted byte-for-byte (`diff -q` confirmed) and re-ran:
**GREEN**, full drill passes, both legs.

**Commands run, local, both GREEN after the fix** (`packages/runtime`, against a bootstrapped
`clara_rt_test` on `127.0.0.1:55746`):
`node tests/two-build-cutover-e2e.mjs` — 2 runs, exit 0 both times, "TWO-BUILD CUTOVER E2E:
ALL PASS" both times (32.3s, 34.8s).

**Docs:** `packages/runtime/README.md`'s `#794` section gets a new `#850` block explaining
the overlap and citing the local numbers; `.github/actions/db-live-gates/action.yml`'s own
comment beside the step, as above.

**Left deliberately alone:** `CLARA_TWO_BUILD_REUSE`'s local-only semantics (out of scope);
removing either leg (out of scope).

## #967 — CI World leg for intake batches: drain the queue between legs

**Status: partial** for the two legs that precede another leg on the shared database (the
third (last) leg is deliberately NOT touched, and that is by design, not an omission), but
**AC1 (the order-of-magnitude log-line-count reduction, at the cited scale) is unmeasured**:
strong local-rig evidence stands in its place, but no CI-scale before/after count exists (code
review round 2, L06-SPEC-R2-04; see `wave1-lane06-codereview-fix.md`'s "Per-ticket status").
Discharged only by the first real CI run of this step, which must supply a directly comparable
line count.

- **AC1 (log volume not dominated by leftover noise).** `tests/queue-drain.mjs`'s
  `waitForQueueDrain` is called by `intake-e2e.mjs` and `intake-admission-e2e.mjs` right
  before their own `process.exit(0)`, reusing `lib/rollback-preflight.mjs`'s own two
  censuses (`censusNonTerminalRuns`, `censusUnboundTasks`) rather than a fixed sleep or a
  new definition of "live". Measured locally end to end on a bootstrapped `clara_intake_ci`
  (this rig, Windows): leg 1 drained in 21ms/330ms (1–2 polls) across two runs; leg 2 —
  which left a genuine straggler behind once (a `FatalError`'d workflow run,
  `storage_error`) — drained in 2008ms (10 polls) that run and 446ms (3 polls) the other,
  proving the gate does real bounded work rather than resolving as a no-op. I could not
  reproduce the reported ~1.27M-line figure directly (that would need the UNPATCHED code
  path on my rig, which I did not keep a parallel copy of to re-run for volume once the fix
  was verified correct — the mechanism match against `lib/classify.mjs`'s own documented
  capped-task line, logged once per poll of a task some earlier run left `queued` forever,
  is the evidence for *why* it would happen, not a re-measured line count).
- **AC2 (same cross-leg chain, no assertion weakened).** Both legs still passed every one
  of their own existing assertions across two full local runs (see below); nothing in
  either file's own scenarios changed, only an added wait+drain at the very end.
- **AC3 (a genuine failure surfaces as a failure).** `waitForQueueDrain` throws, naming the
  outstanding runs/tasks, on timeout — proven by the leg 2 run above, which needed real
  retries rather than resolving on the first poll, and by the unit test's own timeout cell.

**Key design choice, stated because it is not obvious:** the drain runs at the END of the
LEG THAT CREATES the leftover work, not at the START of the next one — that leg's own
process is the only one with an engine actually running to drive stragglers to a terminal
status; once a process exits, its consumers die with it and nothing is "in flight" to wait
on. `intake-batch-e2e.mjs` does NOT call it: nothing in the CI job runs against
`clara_intake_ci` after it, and its own leg 4/5 scope ends with live rows on purpose (a
declared-fact wait, a quota wait, a blocked cancellation) that a drain gate would either
hang on or wrongly report as a leftover.

**Test-first / vacuity control:** `packages/runtime/tests/queue-drain.test.mjs`, three
in-memory cells (no database) — resolves only once BOTH censuses read empty (not on the
first alone), throws on timeout naming the stuck row, resolves in one poll on an
already-clean database. Vacuity control: changed the resolve condition from `&&` to `||`
(runs.length === 0 || unbound.tasks.length === 0) — **RED**, 2 of 3 cells failed for the
right reason (resolved one step early / never rejected). Reverted byte-for-byte and
re-ran: **GREEN**, `node --test tests/queue-drain.test.mjs` → 3/3 pass.

**Local end-to-end verification (the strongest evidence available without CI):** created
`clara_intake_ci` on this rig's own cluster (`CREATE DATABASE ... TEMPLATE clara_l06`,
matching the CI action's own template-copy idiom), bootstrapped the Workflow world, and ran
all three legs in CI order twice. Both times legs 1 and 2 passed with the drain gate doing
real work. Leg 3 (`intake-batch-e2e.mjs`) failed BOTH times on its own leg-4
cross-firm-poison-isolation assertion (`AssertionError: firm P's/Q's ... COUNTED/reached
its terminal state`, a different specific assertion each time) — but **run a third time
completely alone, on a fresh database with no leg 1/2 and therefore zero #967 code in its
path, it showed the identical symptom** (860–952 occurrences of `no transport metadata in
its sidecar` / `intake finalize capability/state is invalid`) and that time passed. This is
`packages/runtime/README.md`'s own documented, pre-existing Windows-only EPERM/rename race
between the reconciler's sidecar reads and `writeIntakeMeta`'s rename (the "#693 family"),
timing-dependent and reproduced identically with #967's change entirely absent from the
run. Reported as a known Windows-only red per RIG.md's rule 8, not fixed.

**Gates:** `node scripts/check-frozen-workflows.mjs` and
`node packages/runtime/scripts/check-parts-parity.mjs` both OK after this change.

**Docs:** `packages/runtime/README.md` — a new `#967` block under `#633`'s section, and a
one-line cross-reference under the batch leg's own section; `.github/actions/db-live-gates/
action.yml`'s comment above the three steps.

**Follow-up worth filing:** re-measure the actual CI log-line reduction on a real run (this
lane cannot produce that number), and separately, the pre-existing Windows-only intake
storage race deserves its own ticket if the team ever runs this suite on Windows CI —
today's CI is presumably Linux, where this race is unlikely to reproduce, but that is
unverified from here.

## #963 — Record the cross-migration body-pin convention 0233 relies on

**Status: done.** Documentation only; no function signature, relation, migration body, or
recut is touched, and 0233's fail-closed behavior is unchanged (out of scope, respected).

- **AC1 (states the pattern as a general convention).** New paragraph in
  `packages/db/README.md`'s "Migration and deployment behavior" section, placed
  immediately before the 0214 anecdote it generalises, opening "Pinning another function's
  body hash is a named convention in this file, not one migration's habit."
- **AC2 (recutting requires finding + re-measuring every existing pin, same commit).**
  Stated as its own bolded sentence: "a later migration that recuts the pinned function
  must locate every existing pin on that function and re-measure each one against the
  function's NEW body, in the SAME COMMIT as the recut."
- **AC3 (quotes the DRIFTED wording, explains it).** Quotes `` `<name> has DRIFTED from its
  pinned body` `` verbatim and explains both readings (an intervening recut never
  re-derived the pin's argument, or the pin was wrong to begin with) and why it fires from
  the prestate (fails closed, before anything is touched).
- **AC4 (0233's three pinned bodies named, findable).** New paragraph in 0233's own section
  naming `clara.get_current_legal_documents()`, `clara.accept_legal_document(text,integer,
  text,text)` and `clara._accounting_work_egress_live(uuid,uuid)`, and distinguishing them
  from 0233's fourth pin (a pre-image of the body 0233 itself recuts, not a non-regression
  pin). Verified findable: `grep -n "get_current_legal_documents\|accept_legal_document\|
  _accounting_work_egress_live" packages/db/README.md` hits both the new paragraph and the
  pre-existing 0233 prose.

**Evidence for every claim:** read `packages/db/migrations/0233_firm_commercial_settings.sql`
directly (prestate lines 163–190, tail lines ~695–742) for the three signatures and their
shas rather than trusting the ticket's own paraphrase (which undercounts — 0233 pins FOUR
functions total; the fourth is its own pre-image, not a non-regression pin, and the new text
says so explicitly). Cross-checked the `has DRIFTED from its pinned body` wording against
its actual occurrences in 0221, 0224, 0229, 0231, 0232, 0233 and 0234 (`grep`), confirming it
is a repeated pattern rather than 0214's alone. No CONTEXT.md change: "prestate"/"recut" are
pre-existing internal terms used throughout this file already, not new vocabulary #963
introduces.

**Test-first:** not applicable — pure documentation ticket, no code seam to test.
Verification was evidentiary (direct file reads + grep), not a red/green cycle.

## Gates (whole lane, run once at the end)

- `pnpm lint` (worktree root): **PASS**, exit 0 (includes `apps/web`'s own lint battery —
  token contrast, test-manifest self-tests, message-key census, ui-add guard — and
  `packages/reporting-render`'s eslint; none of this lane's changes touch `apps/web`).
- `pnpm typecheck` (worktree root): **PASS**, exit 0 — `packages/runtime tsc --noEmit` and
  `apps/web tsc --noEmit` both "Done".
- `node scripts/check-frozen-workflows.mjs`: **OK**, 312 frozen files verified, 55
  `"use workflow"` modules frozen+registered, 3 retired.
- `node packages/runtime/scripts/check-parts-parity.mjs`: **OK**.
- `node --test tests/queue-drain.test.mjs` (from `packages/runtime`): **3/3 pass**.
- Not run: `apps/web`'s whole unit suite (`node scripts/run-tests.mjs`) and any Playwright
  walk — this lane touched nothing under `apps/web`, so rule 8's conditional does not apply.
- Not run: `packages/db/tests`' full gate chain, `operation-census.test.mjs`,
  `rig-isolation.test.mjs` — this lane touched only `packages/db/README.md`, never
  `packages/db/tests` or a migration.

## Anything unverified

- The actual CI wall-clock improvement for #850 and the actual CI log-line reduction for
  #967 — both explicitly called out as CI's own to measure, in the commits' own text and in
  the action.yml comments themselves.
- Whether CI's own runner OS ever hits the Windows-only intake storage race noted under
  #967 — presumed unlikely (Linux runners) but not checked from this session.

## Successor contracts

None — no ticket in this lane needed a new Work-lane or chat-lane tool.
