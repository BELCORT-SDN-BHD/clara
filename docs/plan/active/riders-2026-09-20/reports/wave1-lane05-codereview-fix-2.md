# wave 1 · lane 05 — /code-review fix round 2 (answering the recheck's `RC-01`)

**Branch** `riders/w1-lane05` · **worktree** `C:\Users\zhant\Desktop\clara-wt\655`
**Head before this round** `ab6683c0` · **new head** `a7973b02` · **fixed point** `origin/main e7f0a10a`
**Findings answered** `RC-01` (major) from `wave1-lane05-codereview-recheck.json`
**Tree at finish** clean (`git status --short` -> 0 lines)

This round answers exactly one finding, and it is a process finding, not a functional one. Nothing
in the eight underlying `/code-review` fixes was re-designed here; what was missing was that they
existed only as uncommitted working-tree edits, with no report. Both gaps are now closed: five
commits, and `wave1-lane05-codereview-fix.md` beside this file narrating the eight findings.

---

## `RC-01` (major) — the second fix round existed only in the working tree · FIXED

**Reproduced first.** `git log --oneline origin/main..HEAD` ended at `ab6683c0`, the exact commit
both source reports name as `head`; `git status --short` listed the 14 modified tracked files the
recheck enumerated; `ls` on the reports directory confirmed no `wave1-lane05-codereview-fix.md`
(lanes 01, 02, 04, 06 and others each have one). So an integrator merging this branch would have
got none of the fixes, and no reviewer could have told which finding each edit answered.

**What I did not do.** I did not rewrite, re-design or "improve" any of the 14 diffs. I read every
one of them against its finding first (they are correct, and the narration in
`wave1-lane05-codereview-fix.md` is written from the diffs, not from the recheck's summary), then
re-proved them, then committed them unchanged. `git diff` between the working tree I inherited and
`a7973b02` is empty.

### The five commits (one per ticket, WORK-ORDER rule 2 and rule 4)

| commit | ticket | findings answered | files |
|---|---|---|---|
| `e2403227` | #917 | `L05B-S01`, `L05B-S02` | `scripts/ops/dsn-pipe.mjs`, its selftest, `packages/db/README.md`, `RELEASE-RUNBOOK-0225-0233.md` |
| `e303d6b1` | #969 | `L05B-S03` | `apps/web/scripts/ui-add.mjs`, its selftest, `apps/web/components/ui/README.md` |
| `e8eb79ba` | #849 | `L05B-S04`, `L05-STD-02` | `scripts/freeze-lint-retire.mjs`, `scripts/check-frozen-workflows.mjs`, its selftest |
| `86c0ec28` | #994 | `L05B-S05` | `eslint.config.mjs`, `scripts/eslint-config.selftest.mjs` |
| `a7973b02` | #957 | `L05-STD-03`, `L05-STD-04` | `packages/db/scripts/migrate.mjs`, `packages/db/tests/migrate-redo.test.mjs` |

Per ticket, not per file: the two #917 findings share one contiguous comment block in
`dsn-pipe.mjs` and one paragraph pair in `packages/db/README.md`, and the two #849 findings share
`check-frozen-workflows.mjs` and its selftest, so splitting them further would have meant
hunk-surgery on the same lines for no reviewer benefit. Rule 4 allows a commit "per green slice or
per small group of slices". Every commit message names its ticket, states the finding it answers,
carries its own gate evidence, and ends with `Co-Authored-By: Claude Fable 5.1
<noreply@anthropic.com>` (verified on all five with `git show -s --format=%B`).

`L05-STD-01` asked for that trailer and could not be satisfied retroactively on the landed
commits — those keep their `Claude Sonnet 5` trailer, and rewriting landed history for a trailer
would be worse than the defect. The five new commits satisfy it going forward.

### The vacuity control, re-run for this round

The inherited edits arrived green, and "green" alone cannot tell a real cell from a vacuous one.
WORK-ORDER rule 4's vacuity control was therefore re-run for every new or changed cell before
committing it: break the subject once, watch the cell go red **for the right reason**, restore the
subject byte for byte (sha256 compared before and after each time).

| break | cell(s) that went red | restored |
|---|---|---|
| drop `:CLARA_BACKUP_DIR/p` from `WSL_ENV_LIST` | the new `L05B-S02` cell **and** the existing full-`WSLENV` cell — 2 of the file's cells, no others | `dsn-pipe.mjs` `7bfda510…97638` ✓ |
| restore `if (code !== 0) return code;` in `ui-add.mjs` | the new `L05B-S03` failure-path cell only | `ui-add.mjs` `3ab2ac88…e2e9b6` ✓ |
| `checkRetiredRecords` returns `[]` | the "DOES fire all four codes" cell only | `freeze-lint-retire.mjs` `22879d73…4b0f3` ✓ |
| `--ruling` parsed with the old inline form | the new `L05-STD-02` regression cell only | `check-frozen-workflows.mjs` `d80f79b6…24d32` ✓ |
| the retire branch stops writing the manifest | the new success-path CLI cell only | `check-frozen-workflows.mjs` `d80f79b6…24d32` ✓ |
| restore the old `NO_RAW_COLOR_VALUES` wording | the new `L05B-S05` cell only | `eslint.config.mjs` `25cc023e…89b66c` ✓ |
| `migrationChecksum` returns a constant 64-zero string | AC1 plus AC4 and AC5 (3 of 8 cells) — the literals really pin the genuine hash | `migrate.mjs` `f48efb7c…8fa159` ✓ |

Two of these are worth stating plainly rather than as a tick:

- The `#969` `--dry-run` and override cells stayed **green** under their break, and that is correct:
  they assert "no strip" under both the old and the new shape, so they fence the exceptions rather
  than the new behaviour. The behaviour itself is held by the one cell that did go red.
- `L05-STD-04`'s two sha256 literals were **recomputed independently in this round**, not taken on
  the earlier reviewer's word: `printf '%s' '<body>' | sha256sum` (coreutils) reproduces
  `e8e9628e68a23a7f0c010f6977c0e8fbf5daa867ea303de03f58a2b529bd48ed` and
  `01926b8c313468f7dad1816fbb69aa3bb584850de467835a56e5c8e914f2be60` byte for byte, from the exact
  migration bodies the test writes. `migrationChecksum` was never used to produce them.

### Gates re-run for this round

Every gate my commits touch, plus typecheck and lint, at the committed tree:

| gate | result |
|---|---|
| `node scripts/ops/dsn-pipe.selftest.mjs` | ALL GREEN (3 skipped — the known Windows-only skips, RIG.md; reported as such, not "fixed") |
| `node apps/web/scripts/check-ui-add-guard.selftest.mjs` | all cases passed |
| `node scripts/check-frozen-workflows.selftest.mjs` | OK, all cases passed |
| `node scripts/check-frozen-workflows.mjs` (direct) | OK — 312 frozen, 55 `use workflow` modules, 3 retired, **no manifest diff** (rule 5) |
| `node scripts/eslint-config.selftest.mjs` | OK, all cases passed |
| `packages/db` `tests/migrate-redo.test.mjs` | 8 tests, 8 pass, 0 fail |
| `packages/db` `tests/operation-census.test.mjs` | 10 tests, 10 pass, 0 fail |
| `packages/db` `tests/rig-isolation.test.mjs` | 21 tests, 20 pass, 1 known destructive skip |
| `apps/web` `node scripts/run-tests.mjs` (whole unit suite, rule 8) | 4633 tests, 4631 pass, 0 fail, 2 skipped, 99.0s |
| `pnpm typecheck` (worktree root) | `apps/web` Done, `packages/runtime` Done, exit 0 |
| `pnpm lint` (worktree root) | exit 0 |

`packages/db` gates ran from `packages/db` against `clara_l05@127.0.0.1:55745` with
`PGHOST/PGPORT/PGUSER/PGDATABASE/CLARA_ALLOW_DESTRUCTIVE/CLARA_RIG_DB` set as RIG.md's lane-05 row
specifies, and the full 100-flag preintegration gate chain read out of `packages/db/package.json`.
Never with the reset flags.

The whole `apps/web` unit suite is the one gate the earlier recheck listed as `not_rerun` (flaky at
that size). It was run here because rule 8 requires it once when `apps/web` is touched, and it came
back clean at 4631/4633 with 0 failures — so the flakiness note does not apply to this round.

### Scope

No migration. No frozen workflow body and no module in a frozen closure (the manifest check above
is the evidence). `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched. `packages/runtime` untouched.
Of the shared files in rule 7, none were touched. Only this lane's worktree was written to; no
push, no PR, no GitHub write.

---

## For the orchestrator

- **New head:** `a7973b02` on `riders/w1-lane05`. Tree clean.
- **No GitHub write is owed by this round.** `RC-01` asked for commits and a report, both local.
  No finding in the three source reports asks for an issue or a comment to be filed.
- **Still open, unchanged from the source reports' own lists:** #917 AC1 end to end through
  `backup.mjs --profile full` needs a hosted DSN and `pg_dump` 17 — unverifiable on this rig, and
  it was already unverified before this round. Everything else in both lenses is fixed or answered.
- **Worth knowing at integration time:** `e2403227` edits
  `docs/plan/active/refresh-wave-2026-09-18/RELEASE-RUNBOOK-0225-0233.md`, another wave's runbook,
  because that is where the `#917` invocation the fix changes is written down. It is a four-line
  addition inside the existing `#917` update block; if another lane touches the same block, take
  both.
