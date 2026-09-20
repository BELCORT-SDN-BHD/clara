# Wave 1 · Lane 06 — /code-review fix round

**Branch** `riders/w1-lane06` in `C:\Users\zhant\Desktop\clara-wt\656`, database `clara_l06` @
127.0.0.1:55746. Working tree clean at the end of this round. No push, no PR, no GitHub write, no
other worktree touched, no subagent spawned.

**RESUME NOTE.** This worker picked up mid-work after an earlier fix worker on this lane was killed
by a usage limit. `git status`/`git diff` at start showed five files with uncommitted changes and
one new untracked test file, all addressing this round's findings, and no `codereview-fix.md` yet
existed for this lane. Each uncommitted change was read in full, checked against the finding it
answers, and — where the finding made a factual or measurement claim — independently re-verified
(unit re-runs, a vacuity/mutation control, and two fresh live-database e2e runs of the ticket's own
blocker finding) before being judged complete and committed. Nothing was redone that was already
green; nothing was reverted. This file is new (no earlier `codereview-fix.md` existed to extend).

**Head at start of this round** `de3b251a` (already on the branch, from the round-1 fix cycle) ·
**New head** `50d954d7`

```
50d954d7 docs(db): #963 fix round 2 - the DRIFT wording claim was false; state what the migrations show
cf3c863f fix(runtime): #967 fix round 2 - a live-DB re-run of AC1's blocker, and a named residual against AC3
5be70900 fix(runtime): #850 fix round 2 - a real guard instead of a declined one, and an honest AC1
--- everything below was already on the branch at the start of this round ---
de3b251a fix(runtime): #967 + #850 fix round 1 — a real drained failure, a masked error, two mislabels
b89671ce docs(db): #963 fix round 1 — restore the migration-number qualifier, note 0214's earlier wording
7f956c6b docs(db): #963 name the cross-migration body-pin convention 0233 relies on
c00fc8d4 fix(runtime): #967 drain each intake CI leg's queue before it exits
ebbaa2ee perf(runtime): #850 overlap the two-build drill's two scratch builds
```

Fix-round-2 diff, `de3b251a..HEAD`: 6 files, 163 insertions / 83 deletions — `action.yml` (comment
only, both blocks), `packages/db/README.md` (prose only), `queue-drain.mjs` (a new header comment,
no statement changed), `scratch-image.mjs` (one new const + one new exported function),
`two-build-cutover-e2e.mjs` (wires the new guard into the existing overlap decision), and one new
test file. No migration, no frozen file. `.github/actions/db-live-gates/action.yml` is the one
work-order-rule-7 shared file touched — this round keeps both its hunks (necessary content per
AC1) but, per L06-SPEC-R2-07, drops the wave-local citation and finding-ids that were in it.

Split into three single-ticket commits this round (5be70900 #850, cf3c863f #967, 50d954d7 #963),
answering L06-STD-1's forward-looking ask directly. `action.yml` carries two independent hunks (one
per ticket, confirmed non-overlapping via `git diff` hunk headers) and was split hunk-by-hunk with
`git apply` against saved single-hunk patches so each commit touches only its own ticket's lines.

---

## Verdict per finding

| id | ticket | severity | outcome |
|---|---|---|---|
| L06-SPEC-R2-01 | 967 | blocker | **fixed via re-verification** — re-ran the two CI legs on a genuinely fresh DB (twice, this round, on top of the lane's own three); the new throw never fires on the feared FatalError/storage_error shape; the one failure seen is a pre-existing, unrelated, already-documented race |
| L06-SPEC-R2-02 | 850 | major | **fixed** — action.yml now states plainly that AC1 is unmet, names the stale figure as stale, and points at what the first CI run must record |
| L06-SPEC-R2-03 | 850 | major | **fixed** — the guard is now code (`shouldOverlapSecondBuild`/`OVERLAP_MIN_CORES`), tested, wired into the drill, and a vacuity control shows the tests catch a broken guard |
| L06-SPEC-R2-04 | 967 | major | **reported partial** (not silently closed) — no CI-scale before/after line count exists; strong local-rig evidence now exists in its place (five independent fresh runs, all small, none noise-dominated) |
| L06-SPEC-R2-05 | 963 | minor | **fixed** — the false "from 0221 onward" / "0214 is first" claims replaced with the verified truth (0222, 0228, 0231, 0107 all checked against the migration files) |
| L06-SPEC-R2-06 | 967 | minor | **fixed (documented, not code-changed)** — took the finding's first option: the two AC3 window gaps are now a named residual in `queue-drain.mjs`'s own header |
| L06-SPEC-R2-07 | 850 | minor | **fixed** — the `docs/plan/active/...` citation and L06-850-A/B/C finding-ids are gone from the shared CI file |
| L06-SPEC-R2-08 | 963 | minor | **fixed** — the false completeness claim replaced with the true one, plus the 16 migrations it wasn't naming, each individually verified |
| L06-SPEC-R2-09 | 967 | note | **stays, recorded** — no fix required; ticket-comment text drafted below for the orchestrator |
| L06-SPEC-R2-10 | 850 | note | **stays, recorded** — no fix required; noted here for the orchestrator's own read of the diff |
| L06-STD-1 | 967+850 | major | **answered going forward, not undone** — the already-made bundled commit (de3b251a) is not rewritten (no authorization for a history rewrite); this round's three new commits are each single-ticket |
| L06-STD-2 | 850 | minor | **left as a judgement call** — the AC explicitly requires the comment content; nothing to shrink beyond what L06-SPEC-R2-07 already removed |
| L06-STD-3 | 967 | note | **clean sweep, no action** |
| L06-STD-4 | 967 | note | **left as-is, judgement call** — self-documented ordering dependency in a test fake; the suggested `classifyQuery` helper is optional and not "small and clearly better" enough to add without a new query shape motivating it |

---

## L06-SPEC-R2-01 (blocker) — the drain's new throw was never run against the two CI legs it changes

**Reproduced, then answered with fresh live-DB evidence**, on top of what fix round 2's own
uncommitted work already carried (see below).

This lane's cluster cannot run a second from-scratch migration chain (migration 0154's role-count
pin — confirmed still true; `RIG.md` names the same constraint). The committed comment's own
methodology — `create database clara_intake_ci template clara_l06`, then this action's own
`bootstrap` — avoids that without touching the CI step's own commands. I ran it twice more myself,
independently, this round:

```
wsl.exe -- psql ... drop database clara_intake_ci;  create database clara_intake_ci template clara_l06;
pnpm --filter @clara/runtime exec bootstrap   (WORKFLOW_POSTGRES_URL=...clara_intake_ci)
cd packages/runtime
node tests/intake-e2e.mjs             # leg 1
node tests/intake-admission-e2e.mjs   # leg 2, same DB, real CI order
```

- **Run A:** leg 1 `INTAKE E2E: PASS` (`[queue-drain] drained (polls=2, waited=495ms)`, 42 log
  lines). Leg 2 **failed**, but not on the drain: `intake FAILED ... code=internal ...
  canonicalReached=true detail=EPERM: operation not permitted, rename '...\spool\intake-....json.PID.TS.tmp'
  -> '...\spool\intake-....json'`, then `AssertionError: the control document was adopted` at
  `intake-admission-e2e.mjs:394` — inside leg 2's own FIRST assertion, before `waitForQueueDrain` is
  ever called (that call is at line 761). `packages/runtime/README.md:1353` names exactly this shape
  — "a Windows-only EPERM race between the reconciler's sidecar reads and `writeIntakeMeta`'s
  `rename` (the #693 family)" — as pre-existing and already documented, independent of #967.
- **Run B** (fresh `clara_intake_ci` again): leg 1 `PASS` (40 lines, `polls=2, waited=429ms`); leg 2
  `PASS` (100 lines, `polls=4, waited=670ms`), `INTAKE ADMISSION E2E: PASS (7 legs — ...)`.

Across these two runs plus the three the committed comment already records (5 total, independent,
fresh-template, real-CI-order): the new "newly-failed" throw **never** fired, including on the one
run that did fail (it failed earlier, in code the drain change never touches, for a reason
`README.md` already attributes to a different, older ticket). The specific scenario the blocker
worried about — the lane's own earlier-observed FatalError'd `storage_error` run (`wave1-lane06-
final.md`) causing this leg to go red under the new throw — did not reproduce in any of the five
runs. I judge this **fixed via re-verification**, not merely refuted: the mechanism was exercised
live, in real CI order, on a genuinely fresh world, and behaved exactly as the ticket's AC2 and AC3
ask. The committed `action.yml` comment's own wording already states this accurately; I did not
need to change it, only confirm it independently (cleaned up the temporary `clara_intake_ci`
database afterwards — `RIG.md`'s fixed set for this lane is `clara_l06` only).

## L06-SPEC-R2-02 (major) — #850 AC1 unmet, and reported as met anyway

Fixed in `5be70900`. `action.yml`'s #850 comment now reads, verbatim: "AC1 (the step's own
before/after wall clock, measured on CI) REMAINS UNMET: the 78.0s/124s pair below is a Windows-host
measurement from the #637 fix round, not a CI one, and no CI figure for this step — taking either
path — has ever been recorded." This report (below, "Per-ticket status") carries #850 as **partial**
for AC1, not done — the ticket cannot honestly close until a real CI run supplies the figure.

## L06-SPEC-R2-03 (major) — the overlap raised CPU on a 2-4 core target with no guard

Fixed in `5be70900`. `packages/runtime/tests/scratch-image.mjs` now exports `OVERLAP_MIN_CORES = 4`
and `shouldOverlapSecondBuild(availableCores)`; `two-build-cutover-e2e.mjs` calls it with
`os.availableParallelism()` to decide, per run, whether `chatBuildPromise` starts in the background
(overlap) or the chatTurn build happens sequentially after the claraWork leg finishes (the pre-#850
shape). Below the threshold, nothing about the drill's behavior changed from before #850 landed.

New file `packages/runtime/tests/scratch-image-overlap.test.mjs`, 4 cells, run this round:

```
node --test tests/scratch-image-overlap.test.mjs
# tests 4 / pass 4 / fail 0
```

**Vacuity control (TDD rule 4), run this round:** mutated `shouldOverlapSecondBuild` to
`return true` unconditionally → 3 of 4 cells failed for the right reason (`true !== false`, the
cells asserting refusal below/at-threshold and on an unreadable reading). Restored byte for byte
(`git diff --stat` back to the pre-mutation insert count) → 4/4 green again.

This does not change the ticket's own total compute (still two full builds when it overlaps) — the
brief's other named mechanism ("one staged tree built twice" or "a shared scratch tree keyed by
class") was not implemented, and I did not attempt it this round: the finding's own required-fix
offers the guard as an accepted alternative ("If the overlap is kept, the
`os.availableParallelism()` guard ... needs an explicit recorded decision"), and that decision is
now in code, not a declined comment. AC3's own second branch — "or the ticket is closed as not worth
it, with the measured numbers recorded" — is what this now is on a 2-4 core runner, made explicit in
the action.yml comment (L06-SPEC-R2-02, above).

## L06-SPEC-R2-04 (major) — #967 AC1's order-of-magnitude reduction unmeasured

**Reported partial**, not silently closed. No run on this rig, or on CI, has ever produced a
comparable "before" figure at the ~1.27M-line scale AC1 cites, and none can: that baseline came from
a long-lived shared CI runner's accumulated noise, not a reproducible local condition. What this
round adds is five independent fresh-template runs (three from fix round 2's own work, two of mine,
detailed under L06-SPEC-R2-01) all landing in the tens-to-low-hundreds of lines, none dominated by
concurrency-limit or retry noise — real evidence the mechanism works, at a scale far short of the
figure named. Per the finding's own two options, I chose "report as partial" over "record on the
ticket that the mechanism argument is accepted" (the latter is a GitHub write outside this worker's
authority — see "For the orchestrator" below if that's the preferred resolution instead).

## L06-SPEC-R2-05 (minor) — false claims about which DRIFT wording is universal, and about 0214 being first

Fixed in `50d954d7`. Every specific claim in the new paragraph was independently checked against
`packages/db/migrations/` before committing (not just against the finding's own evidence):
`0222_accrual_adjustments.sql` — 6/6 pins read `has DRIFTED from the pinned 0193 body`; `0228_*.sql`
— 13/13 read `has DRIFTED from its measured live body`; `0231_firm_portfolio_pack.sql` — 4 read
`its pinned body`, 1 (line 289) reads `the pinned 0189 body`, confirmed line-for-line; `0107` raises
on a drifted pin well before 0214. The rewritten paragraph states the one true invariant (`has
DRIFTED`, grep-able regardless of the noun that follows) instead of a false "settled" claim.

## L06-SPEC-R2-06 (minor) — AC3's baseline-at-poll-1 misses two narrow windows

Fixed in `cf3c863f`, by the finding's own first option: `queue-drain.mjs`'s header now names both
gaps explicitly — (1) a run failing after a leg's own assertions finish but before
`waitForQueueDrain` is called, already baselined and never reported; (2) poll 1's three censuses are
separate statements in one `Promise.all`, so a run failing between the non-terminal read and the
failed read is counted as both non-terminal and baseline-failed on the same poll. Left deferred
rather than merged into one statement, to avoid changing a library function
(`censusNonTerminalRuns`) the two-build drill's own preflight also relies on — a recorded decision,
not silence. `queue-drain.test.mjs` re-run 6/6 after this comment-only change (no statement in the
file changed).

## L06-SPEC-R2-07 (minor) — wave-local citation and finding-ids in a shared, nine-lane CI file

Fixed in `5be70900`. The `docs/plan/active/riders-2026-09-20/reports/wave1-lane06-review-spec.json,
finding L06-850-C` citation and the `L06-850-A/B/C` / `L06-967-A/C` finding-ids are gone from
`action.yml`; the durable facts (two scratch builds exist, the 78.0s/124s pair predates the second
leg, the contention risk, and what the first CI run must record) stand on their own. Note: the new
source-module comments this round adds in `scratch-image.mjs` and `two-build-cutover-e2e.mjs` do
cite `L06-SPEC-R2-03` — those are this lane's own new modules, not the shared file the finding is
about, and work-order rule 7's own text asks logic to go "in your own new modules," so this is
intentional, not an oversight.

## L06-SPEC-R2-08 (minor) — false completeness claim about which migrations are documented

Fixed in `50d954d7`, alongside L06-SPEC-R2-05 in the same commit (same paragraph, same review pass).
Verified all 16 named migrations (0178, 0182, 0183, 0184, 0189, 0194, 0195, 0197, 0202, 0203, 0204,
0209, 0212, 0213, 0215, 0216) individually carry `has DRIFTED` (1-13 occurrences each, `grep -c`
per file) and that none had any other mention in `packages/db/README.md` before this commit
(`grep -c '<number>' packages/db/README.md` was 0 for each, now 1 — only this new list's own
mention). The false "every migration ... is findable" claim is replaced with the true one plus the
explicit list of what is not named.

## L06-SPEC-R2-09 / L06-SPEC-R2-10 (notes) — no fix required

Recorded, not acted on, per the findings' own "None required." L06-SPEC-R2-09's suggested
ticket-comment text is drafted below for the orchestrator, since posting it is a GitHub write.
L06-SPEC-R2-10 needs no ticket comment — it is a note for whoever reads the diff.

## L06-STD-1 (major, procedural) — one commit bundled #967 and #850

Not undone: rewriting `de3b251a`'s history is outside this worker's authority (the finding says so
itself — "not practically undoable ... without a history rewrite the lane is not authorized to
do"). Answered going forward instead: this round's three commits are each single-ticket
(`5be70900` #850 only, `cf3c863f` #967 only, `50d954d7` #963 only), including splitting
`action.yml`'s two independent comment hunks across the #850 and #967 commits rather than bundling
them again.

## L06-STD-2 / L06-STD-3 / L06-STD-4 — judgement calls and a clean sweep

L06-STD-2 (oversized shared-file hunk): no functional fix asked; L06-SPEC-R2-07 already removed the
one part of it that was actually excess (the wave-local citation), so nothing further was trimmed —
the AC itself requires the remaining comment content. L06-STD-3: clean sweep, nothing to do.
L06-STD-4 (order-dependent regex routing in the test fake, self-documented): left as-is — the smell
is real but low-risk (four fixed query shapes, already commented with the ordering constraint
spelled out), and the suggested `classifyQuery` helper would be speculative refactoring against a
fake that has not yet grown a fifth query shape. Judgement: not "small and clearly better" enough to
justify touching a green, already-reviewed test file for a smell with no reproducer.

---

## Horizontal-slicing sensitivity check (this round's new test file)

`scratch-image-overlap.test.mjs` is new this round, so its own sensitivity is the vacuity control
above (mutate `shouldOverlapSecondBuild` → 3/4 cells red for the right reason → byte-for-byte
restore → 4/4 green). `queue-drain.test.mjs`'s 6 cells are unchanged this round (only the file's
header comment changed); their own sensitivity was already established and re-verified by the
standards review (L06-STD-3: "a mutation check ... disabling the throw fails exactly the new cell").
Re-ran them this round anyway, unmutated, to confirm the comment-only diff broke nothing: 6/6 green
(see command below).

---

## Gates re-run this round, with counts

- `packages/runtime`: `node --test tests/scratch-image-overlap.test.mjs` → 4/4 pass (plus the
  vacuity control above). `node --test tests/queue-drain.test.mjs` → 6/6 pass, re-run twice (once
  before committing `cf3c863f`, once to confirm the final state).
- `node --check` on all five touched/added `.mjs` files → OK.
- `node scripts/check-frozen-workflows.mjs` → OK, 312 frozen files verified, no manifest diff.
- `node packages/runtime/scripts/check-parts-parity.mjs` → OK, reader ⊇ emittable holds.
- `pnpm typecheck` (repo root) → clean (`apps/web`, `packages/runtime` both `Done`).
- `pnpm lint` (repo root) → clean, exit 0, including every package's own self-tests
  (`check-token-contrast`, `check-test-manifest`, `check-message-keys`, `check-ui-add-guard`, all
  green).
- Live-DB re-verification of the L06-SPEC-R2-01 blocker: two fresh `clara_intake_ci` cycles
  (create-from-template → bootstrap → `intake-e2e.mjs` → `intake-admission-e2e.mjs`), detailed
  above. Temporary database dropped afterward; the rig's fixed database (`clara_l06`) untouched.
- Not re-run this round: `apps/web` unit suite and e2e (this round touched no `apps/web` file);
  `packages/db` gate chain beyond the README-only change (no `packages/db` code or test touched).

`git status --short` at the end of this round: empty.

---

## For the orchestrator (GitHub writes this worker does not make)

**#967 — L06-SPEC-R2-09 deviation, comment text to post if the orchestrator wants it recorded:**

> The drain (`tests/queue-drain.mjs`'s `waitForQueueDrain`) is called at the END of each producing
> leg (`intake-e2e.mjs:270`, `intake-admission-e2e.mjs:761`), not at the START of the next leg as
> this ticket's brief words it. Reason: the calling leg's own process is the only one with an engine
> actually running against the database, so it is the only place that can drive the queue to empty
> rather than merely observe it stuck — a better reading of the ticket than its literal placement.
> Residual: a leg that fails or is cancelled before reaching its own drain call leaves the queue
> dirty with nothing downstream to notice. This is moot today (every step uses `shell: bash -e {0}`,
> so a failing leg fails the whole job), but is the one thing the brief's own placement would have
> covered — recording it here so a future author reading the brief does not "fix" the placement
> back without re-deriving this reasoning.

**#967 — L06-SPEC-R2-04, alternative to "reported partial" (only if the orchestrator prefers closing
over holding):**

> AC1's ~1.27M-line reduction is not measured on this ticket's own PR at CI scale — that baseline
> came from a long-lived shared runner's accumulated noise, not a reproducible local or per-PR
> condition. Five independent fresh-template runs of the two modified legs (three from this lane's
> fix-round-2 work, two independently re-run by the code-review fix worker) all landed at 26-100 log
> lines, none dominated by concurrency-limit or retry noise — accepted as the mechanism argument in
> place of a directly comparable number, per this finding's own second option.

No other finding in this round asks for a GitHub write; the rest are answered in code, in comments,
or recorded above as "stays, no action" for the orchestrator's own read.

---

## Per-ticket status (for the orchestrator's roll-up)

- **#850 — partial.** AC2 (the "differs by exactly one body" invariant) and the mechanism itself are
  implemented and tested; AC1 (CI wall clock, before/after) is unmet and now says so in the action's
  own comment; AC3 is answered by the guard + its recorded decision, not by a compute-level fix.
  Blocking on: the first real CI run of this step, to supply the wall-clock figure and confirm which
  path (`OVERLAP_MIN_CORES`) it takes.
- **#967 — partial.** AC2 and AC3 are met and now backed by five independent fresh live-DB runs
  (L06-SPEC-R2-01); AC1's own number (order-of-magnitude line-count reduction at the cited scale) is
  unmeasured, with strong local-rig evidence in its place. Blocking on: the first CI run of this
  step, to supply a directly comparable count.
- **#963 — done.** AC3 and AC4 remain met (verified again this round); the two false claims the
  round-2 spec review found are corrected and every replacement claim independently verified against
  `packages/db/migrations/` before committing.

Nothing was found already-satisfied-and-untouched this round, and nothing was stopped.
