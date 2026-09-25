# Wave S, lane 06, ticket #1127

**Branch:** `riders/wS-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\658`, db `clara_l08` on port 55748)
**Base:** `7bc5a710f` (confirmed via `git merge-base origin/main HEAD` before building)
**Commit:** `8994ae2f3` — `feat(ci): #1127 the weekly schedule's own failure now lands as a visible GitHub issue comment`
**Status: done**

Tickets before this one in the lane (#1044, #1128, #1129, #1131, #1126, #1124) were already landed
on the branch and their reports already existed in this folder when this session started; none of
them were re-built. No status-report request arrived mid-task in this session.

## Ticket verified live

`gh issue view 1127 --comments`: the issue is the Agent Brief itself ("is anyone reading the weekly
scheduled CI dispatch's result?"), plus one comment — "Ruling applied under the owner's delegation
of 2026-09-23 (riders sweep wave, SWEEP-PLAN.md)": **"Yes: wire the weekly scheduled CI dispatch's
failure to a visible notification... Joins the sweep wave's lane L6 as a rider, no migration."**
`SWEEP-PLAN.md` (main checkout) lines 89, 102, 237–238, 266 and 325 all corroborate: L6, no
migration, `.github/workflows/ci.yml`/`.github/actions/*` is an L6-only file plus #1127 if ruled,
and the ruling itself is recorded at line 266. Still live on this branch: `ci.yml` before this
change carried no notification wiring at all (verified by reading the file before editing it).

## Seams tested

No GitHub Actions runtime is reachable from this session (never push, never dispatch a workflow),
so — exactly like the two existing CI-workflow tickets in this same package
(`packages/db/tests/ci-frontier-leg-contract.test.mjs` for #1041/#1126,
`packages/db/tests/ci-drill-database-names.test.mjs` for #1041) — the seam is the **raw YAML text**
of `.github/workflows/ci.yml`: which job exists, its `needs`, its `if:` condition, its
`permissions:`, and what its step actually runs. `packages/db/tests/README.md`'s "Preintegration
gates" section already documents this as the established pattern for this class of ticket in this
package, and I added #1127's own paragraph to it in the same place.

## Acceptance criteria

The Agent Brief poses a question; the owner's ruling converts it into one concrete AC:

**AC1 — wire the weekly scheduled CI dispatch's failure to a visible notification (a GitHub issue
comment or an existing notification channel the repo already uses).**

Evidence:

- **No existing channel.** `grep -rln "github-script|slack|SLACK|notify|webhook|issues.create|createComment|create_comment" .github/`
  returns only `.github/actions/db-live-gates/action.yml:190,621`, both about the Stripe webhook
  *column names* (`clara_stripe_webhook`), unrelated to notifications. No `permissions:` block
  existed anywhere in `ci.yml` before this change (checked the same way, by grep, and asserted by
  `p1127.notify.least-privilege`). So the fallback the ticket itself names — a GitHub issue
  comment — is what shipped.
- **The job.** `.github/workflows/ci.yml` gains `notify-schedule-failure`: `needs: ci` (the
  terminal meta-gate, never an individual leg, so its verdict can never drift from what `ci`
  already decided); `if: always() && github.event_name == 'schedule' && needs.ci.result != 'success'`;
  job-level `permissions: issues: write` (the workflow itself still declares no top-level
  `permissions:`, so no other job's grant widened); one step running
  `gh issue comment 1127 --repo "$REPO" --body "..."`, authenticated via `GH_TOKEN:
  ${{ secrets.GITHUB_TOKEN }}` (docs.github.com, "Using GitHub CLI in workflows" — fetched this
  session), carrying `needs.ci.result` and a link back to the specific run
  (`.../actions/runs/${{ github.run_id }}`) rather than a bare "it failed."
- **Scope.** Fires only on `schedule`, never `workflow_dispatch` (a human who just triggered that
  run is already watching it) or `pull_request`/`push` (already visible to the author on the PR) —
  the ticket's own wording is "the weekly schedule," not "every red."
- **No cycle.** `ci`'s own `needs:` list is untouched — still exactly the same 10 entries it had
  before #1127; the new job depends on `ci`, `ci` does not depend on it.

Six cells in `packages/db/tests/ci-schedule-notify.test.mjs` hold all of the above:
`p1127.notify.exists`, `p1127.notify.needs`, `p1127.notify.scope`, `p1127.notify.least-privilege`,
`p1127.notify.channel`, `p1127.notify.no-cycle`. All six PASS against the current tree (counts
below).

**Done — AC1 fully built, nothing deliberately left out.**

## Gates, with counts

- **New test file**, full preintegration gate chain, against the lane database:
  ```
  GATES="$(node scripts/print-gate-chain.mjs)"
  PGHOST=127.0.0.1 PGPORT=55748 PGUSER=postgres PGDATABASE=clara_l08 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 \
  node --test --test-concurrency=1 $GATES tests/ci-schedule-notify.test.mjs
  ```
  Result: **6 pass, 0 fail** (`# tests 6 / # pass 6 / # fail 0`).
- **operation-census.test.mjs / rig-isolation.test.mjs: not run.** This ticket's own gate line
  scopes them to "if you added SQL functions"; #1127 adds no migration and no SQL function
  (confirmed by `SWEEP-PLAN.md`'s own L6 table and by the diff itself — `.github/workflows/ci.yml`,
  one new test file, one README paragraph, nothing under `packages/db/migrations`). Flagging this
  reading explicitly under "unverified" below since the base `WORK-ORDER.md` rule 8 reads
  unconditionally on any `packages/db/tests` touch.
- **Typecheck:** `pnpm typecheck` — exit 0. `apps/web typecheck: Done`, `packages/runtime
  typecheck: Done`. (Nothing under this ticket touches TypeScript; run anyway per the gate list.)
- **Lint:** `FREEZE_BASE_REF=7bc5a710f CI=true GITHUB_ACTIONS=true pnpm lint` — exit 0, full chain
  green (freeze-lint, every `*.selftest.mjs`, `eslint scripts eslint.config.mjs`, every workspace's
  own lint including `apps/web`'s battery and `packages/reporting-render`'s `eslint .`).
  **Note on `FREEZE_BASE_REF`:** plain `pnpm lint` (no override) reported 38 `freeze-lint`
  violations (`REMOVED-VS-BASE`, `UNLOCKED-VS-BASE`, `REGISTRY-DOWNGRADE`) — all of them frozen
  runtime/workflow files this lane's tree legitimately lacks because the lane was cut at
  `7bc5a710f` while this worktree's local `origin/main` ref had since moved to `3bf6aa94d` (later,
  unrelated main-checkout activity in the same session: PR #1142 merged, the frozen-workflow lock
  chore at `204b7c199`, etc. — visible in `git log` on the main checkout). None of the 38 named
  files were touched by this ticket. `scripts/check-frozen-workflows.mjs` documents exactly this
  override (`FREEZE_BASE_REF` env var, default `origin/main`); re-running with
  `FREEZE_BASE_REF=7bc5a710f` (the lane's actual cut point, consistent with the work order's own
  "everywhere a rule says `origin/main..HEAD`, read `<base>..HEAD`") removed every one of the 38
  and left lint clean. Recorded here rather than silently swallowed, since a reviewer diffing
  against plain `origin/main` will see the same 38 and should know they predate and are unrelated
  to this ticket.
- **apps/web: not touched** — no unit suite or Playwright walk run (rule 8's own conditional).
- **packages/runtime: not touched** — no separate `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` run beyond what `pnpm lint`'s own frozen-workflow step already covers.
- **YAML validity**, manual verification (matching #1126's own practice — see
  `wave S`/lane06's #1126 commit `b6030d20e`, which ran `python3 -c "yaml.safe_load(...)"` by hand
  rather than adding a CI-environment-dependent parser test cell, precisely so the automated suite
  never depends on PyYAML being present on the real Linux runner):
  ```
  python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml', encoding='utf-8'))"
  ```
  Parses cleanly. 12 top-level jobs (11 before this ticket + `notify-schedule-failure`); the parsed
  job's `needs`/`if`/`permissions`/`steps` were printed and inspected by hand and matched the YAML
  source exactly.
- **Vacuity control.** The test file was first run against the **unmodified** `ci.yml`: 5 of 6
  cells red (`.github/workflows/ci.yml has no top-level job named "notify-schedule-failure"`); the
  6th (`p1127.notify.no-cycle`) passed vacuously since there was nothing yet to conflict with. The
  job was then added and the same 6 cells went green with no other change to the file. This is the
  ordinary red→green TDD cycle rather than a separate synthetic break/restore, which satisfies the
  work order's vacuity requirement for a ticket whose whole deliverable is config-shaped.

## Migration

**None.** #1127 touches no PostgreSQL object — confirmed by `SWEEP-PLAN.md` ("L6 ... no
migration") and by the diff itself (one workflow file, one new db-tests file, one README
paragraph). No prestate pins apply.

## Docs

`packages/db/tests/README.md`, "Preintegration gates" section: a new paragraph
("**The weekly schedule's own failure is now a visible notification...(#1127)**"), inserted right
after the #1126 step-summary paragraph and before "A fixture that runs at two frontiers is not a
gate," naming the job, its `needs`/`if` wiring, its least-privilege grant, its channel choice and
the test file that holds it.

## Successor contract

**None.** #1127 does not touch a frozen chat or Work tool, and adds no door, read or CLI call a
FROZEN body or closure module would need.

## Follow-ups worth filing

- The comment target is a hardcoded literal (`gh issue comment 1127`) pointing at this same
  tracking issue. If the owner later wants a dedicated "CI health" issue instead of reusing the
  question ticket as the standing thread, that is a one-line follow-up.
- The job reports `needs.ci.result` verbatim (`failure`, `cancelled`, etc.) rather than branching
  per-result; deliberate (a hardcoded word would misreport a cancelled run as a genuine gate
  failure — see `p1127.notify.channel`'s own evidence requirement), but worth a follow-up if the
  owner wants different handling per result kind.
- Nothing closes or dedupes the comment thread on the next green schedule run; comments simply
  accumulate on #1127 over time. Not asked for by the brief; flagged in case the owner wants a
  "clears itself on green" behavior later.

## Anything unverified

- **No live dispatch run exercised this.** This session may never push, open a PR, or trigger a
  workflow, so `notify-schedule-failure` has not actually fired against a real `schedule` or
  `workflow_dispatch` event. Whether `gh issue comment` succeeds against the live default
  `GITHUB_TOKEN` with only the job's own `issues: write` grant (rather than needing a wider
  workflow-level grant, or being blocked by an org-level token-permission default narrower than
  what a job-level `permissions:` block can widen) is unverified beyond the official docs fetched
  this session (docs.github.com "Using GitHub CLI in workflows"; `cli.github.com/manual/gh_issue_comment`).
  The first real dispatch run after this merges should be watched.
- **The operation-census/rig-isolation reading above** — I followed the task-specific gate line
  ("operation-census and rig-isolation if you added SQL functions") over the more general
  `WORK-ORDER.md` rule 8 phrasing, which reads unconditionally on any `packages/db/tests` touch.
  Flagging the choice rather than asserting it is certainly the one the orchestrator wants; both
  gates are cheap to run afterward if wanted (no SQL function or migration exists for them to
  census in the first place).
