# The parked backend queue — ARCHIVED for post-beta re-integration (裁-123, 2026-09-02)

**Status: live · the map.** The owner ruled at the 2026-09-02 checkpoint sitting (裁-123) that the six
parked backend PRs — every one non-gating for beta, every one carrying an uncommitted fold round
from the 2026-08-31 sprint night — are archived rather than left open behind the cascade: the
uncommitted round is WIP-committed to git, the round's verify-bar notes are posted on the PR, the PR
is CLOSED, the worktree is removed. **Re-integration is post-beta, one lane each, from the PR's
resume comment — never from memory.** The work-order that ran is the checkpoint's
WO-archive-parked-lanes.md (session scratch); the lane was `claude-sonnet-5` xhigh; this record is
the orchestrator's transcription of its final report.

## The six PRs

| PR | What it is | Worktree (removed) | WIP ref (pushed) | Resume notes |
|---|---|---|---|---|
| #447 | BS-2 — `wake_open_firm_question` kind wall | `bs-2-kind-wall` (36 behind origin → sibling ref) | db/wake-open-firm-question-kind-wall-parked-round-2026-09-02 @ `0719e430` | [#447 comment](https://github.com/BELCORT-SDN-BHD/clara/pull/447#issuecomment-5503839511) |
| #448 | BS-3 — unique-violation `constraint_name` re-raise | `bs-3-unique-violation` (4 behind → sibling ref) | db/unique-violation-constraint-name-parked-round-2026-09-02 @ `6456b49c` | [#448 comment](https://github.com/BELCORT-SDN-BHD/clara/pull/448#issuecomment-5503839805) |
| #452 | binding PR-3 — post-time re-check | `binding-pr3` (even → direct push) | binding/pr-3-post-time-recheck @ `678d47f2` | [#452 comment](https://github.com/BELCORT-SDN-BHD/clara/pull/452#issuecomment-5503840171) |
| #456 | G1 PR-2a — the DB pass (the producers' DB half) | `g1-pr2-db` (even → direct push) | g1/pr-2a-db-pass @ `8053df39` | [#456 comment](https://github.com/BELCORT-SDN-BHD/clara/pull/456#issuecomment-5503840519) |
| #449 | G1 PR-2b — the producers (runtime) | `g1-pr2-rt` (even → direct push) | g1/pr-2b-producers @ `2d4161e5` | [#449 comment](https://github.com/BELCORT-SDN-BHD/clara/pull/449#issuecomment-5503840944) |
| #460 | `/ready` hard storage failure (裁-61 — the ruling STANDS and re-opens with it) | `ready-hard` (even → direct push) | runtime/ready-storage-hard-fail @ `65b64a1e` | [part 1](https://github.com/BELCORT-SDN-BHD/clara/pull/460#issuecomment-5503841345) · [part 2](https://github.com/BELCORT-SDN-BHD/clara/pull/460#issuecomment-5503842240) |

Each resume comment concatenates every `WO-codex-*` / `codex-lane-*` / `codex-review-*` / lane-brief
note the round had accumulated (what the round was, its verify bar, the rig it needs), fenced
self-sizingly so GitHub renders it; #460's exceeded the comment limit and is split. Every PR closed with
a comment naming its archive ref. Presence verified with `gh pr view --comments` before any local copy
was deleted.

## The other directories the ruling covered

- **#482 (merged) — the round-2 correction found on top:** measured right (both failing
  `expectCleanRefusal` calls sit outside the `withRolledBackTx` window; the merged comment's
  "window width" causal claim does not hold, the correction's "schema-wide before/after equality is
  unsound under concurrency" framing does). Posted as [a comment on #482](https://github.com/BELCORT-SDN-BHD/clara/pull/482#issuecomment-5503860752);
  worktree removed.
- **Two dead lanes with no origin branch:** pushed as `f-a3-pr-3-clock-local-archive-2026-09-02`
  (no tracked changes) and `worktree-agent-a73aa1ec259a89934-archive-2026-09-02` @ `42b1633b`
  (three modified files WIP-committed). Worktrees removed.
- **The live-preview server script** (apps/web/e2e/live-stack/serve-live-preview.mjs, 268 lines,
  the only untracked file of its lane): posted verbatim [on #483](https://github.com/BELCORT-SDN-BHD/clara/pull/483#issuecomment-5503885034).
- **#485's earlier lane copy:** four of five dirty files differed from the pushed `743886ef` →
  WIP-committed to runtime/fs7-chatturn-v17-parked-round-2026-09-02 @ `ac1ee5df`.
- **A 0.87 GB un-versioned snapshot:** five files byte-checked against merged `55c5522b`, all
  identical → deleted, nothing unique.
- **Clean/merged worktrees** (#501 · #495 · #499 · #503's truing) removed; the corrupted
  `agent-a13c9c7d…` tree (mis-parsed shell command names) removed cleanly.
- **The owner-preview stand** (裁-123: dropped; restand after #493): its seven scratch `.mjs`/`.json`
  files preserved to the session archive; the worktree removed.
- **The old sprint scratchpad** (`a659d3f4…\scratchpad`, the 08-31 night's round notes — all posted
  on their PRs first): deleted except one OS-locked 593-byte file (`rev-ft1-rebase\50-suites.out`).

## What could not be removed (low stakes; next elevated sweep)

1. .claude/worktrees/agent-a9f6854ecb5fbc759 — empty shell, `EBUSY` on `rmdir` ×2.
2. .claude/worktrees/agent-ac1c38bc266b18dc1 — contents removed; the empty shell "is being used
   by another process" ×3.
3. `C:\Users\zhant\.claude\jobs\eeca8047` — **NOT retired**: a still-running Claude Code session
   from 2026-08-31 (a background-pty fork) whose orphaned `tail -f` watchers were writing into it. Its
   preview-stand worktree was removed cleanly first; two delete attempts then removed the job's
   state.json and `timeline.jsonl` before the live-write signal was recognised — recorded honestly,
   cannot be undone. The lane STOPPED on the signal; `tmp\` (49,621 files, 1.17 GB) is left in place
   and the session's fate is the owner's (it ends with the next Claude Code restart).
4. `…\a659d3f4…\scratchpad\rev-ft1-rebase\50-suites.out` — "Access is denied" on every operation.

## Post-flight (quoted from the lane)

`git status --short` on the MAIN checkout: only `?? .agents/ ?? .codex/` and the two pre-existing
root PNGs — nothing under `apps/` or `packages/` at any point. apps/web/node_modules/next/package.json
present throughout (23 entries in `apps/web/node_modules` at every checkpoint). Disk: ≈3.4 GB net freed.

## Two lessons the lane minted

- **`git worktree prune` silently skips a worktree that is still flagged LOCKED even after its
  directory is gone** — `git worktree unlock <path>` before `prune`, every time.
- **A work order's "retired" is a claim, not a measurement**: a file whose mtime is *now* inside a
  directory described as dead is a live-process signal — stop, do not force past the lock.
