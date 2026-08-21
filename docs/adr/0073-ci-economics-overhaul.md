# ADR-0073 — THE CI ECONOMICS OVERHAUL: closed-wave drills demote to the weekly sweep; the monolith splits; the required check becomes a fail-closed meta-gate

**Date:** 2026-08-21 · **Status:** standing
**Ruled by:** the owner (Tao, BELCORT), in-session 2026-08-21 — the approval is recorded
in PR #277 and scheduled this work as the next session's opener; this PR is that opener
and mints the entry. **Mechanism of record:** `.github/workflows/ci.yml` +
`.github/actions/*` (this PR).

## The problem (measured, not asserted)

The monolithic `ci` job re-proved EVERY closed wave's deploy drill serially on every
code PR — twelve full-chain applies (C9 · Slice-5 · Slice-6 · WB-0020 · x37 · x40 ·
x41 · the D-b split drill · δ · θ · ε · η) plus the four-leg D-b frontier matrix,
growing by one full-chain apply per closed wave, forever. Measured on the 2026-08-21
ceremony-closeout PR: **~42 minutes wall-clock** on the two self-hosted runner
instances; docs-only PRs ~8 minutes. The growth is structural: every future wave
closure would have added its drill to every future PR.

## The ruling (lever 1 — the one ADR-061-territory piece)

**Closed-wave drills demote to the weekly sweep** (which already re-proves every leg by
design, in its own cancellation-isolated concurrency group); **the estate suite and the
deploy-onto-existing check stay per-PR as the backstop.** A CURRENT wave's drill rides
per-PR while its wave is open and demotes when the wave closes. This amends per-PR CI
*scope*, not review intensity: ADR-061's uniform review ladder (digest law 26) is
untouched — every substantive PR still takes the full ladder; what changed is which CI
legs re-run per PR. Batch-CI-per-wave was CONSIDERED AND REJECTED in the same sitting
(the per-PR gate caught T17 drift, a seam census gap, a frontier-ordering violation and
the S0.9 flake in one night) — this is scope routing, never frequency reduction.

## The classification judgement (what counts as "closed-wave drill")

Demoted — the serially-growing full-chain family, all proving FROZEN artifacts:
the eight closed-wave upgrade drills and the four Wave-E contract drills (now
`.github/actions/closed-wave-upgrade-drills` + `wave-e-contract-drills`, run by the
`closed-wave-drills` job), and the D-b `db-slice-frontiers` matrix. All run on
`schedule` + `workflow_dispatch` only.

NOT demoted, each on its own stated ground:

- **Estate suite + deploy-onto-existing** — the ruling's named backstop (`db-estate`).
- **The runtime e2es** (intake · interview/kill-resume · version-cutover) — they
  exercise LIVE code paths the current wave keeps changing (the WDK engine, spool,
  intake, cutover machinery), not frozen history (`db-live-gates`).
- **The DR pair** (self-test + full-profile two-cluster round-trip) — law-39 standing
  anti-misleading-green material (ADR-012/0020), not a wave drill (`db-live-gates`).
- **The render drill** — `docs/ops/DR-render.md` states every PR performs it; a
  document claiming a gate the pipeline does not run is worse than no claim.
- **The partition-totality gate** — seconds, database-free, and it catches a
  PR-authoring mistake at the PR.
- **Lint** — unconditional on every event, unchanged.

**The residual, stated:** a regression in a closed-wave drill's own inputs (a rig-lib
change, a drill-file edit) now surfaces at the next sweep, not at the PR — the ruled
trade, compensated by the sweep's isolation guarantee. Standing practice: **after
merging a PR that touches a closed drill, a split-list, or the pipeline itself, run the
sweep by hand** (`gh workflow run ci.yml`) rather than waiting for Thursday. This PR
itself follows that practice at merge.

## The meta-gate (and the two pre-existing fail-open shapes it closes)

Branch protection requires exactly one status context, `ci` (strict + enforce_admins,
measured via the API on 2026-08-21). The former monolith carried that name; the split
therefore ends in a terminal `ci` job — `if: always()`, needing every other job —
that fails unless each leg is success or LAWFULLY skipped (classifier output `false`,
or a sweep-only leg outside `schedule`/`workflow_dispatch`, asserted in BOTH
directions so event-wiring drift is a visible red either way).

Found while measuring, closed by the same mechanism — both predate this PR:

1. **`lint` was never a required check.** A red lint (secrets scan included) never
   actually blocked a merge; only practice did. Now `ci` requires it, on every event,
   docs-only PRs included.
2. **A failed `changes` classifier skipped every downstream job**, and GitHub treats a
   SKIPPED required check as satisfied — a classifier crash made a PR mergeable with
   nothing but its own red X as advice. The gate now fails outright when `changes` is
   not `success`.

## Levers 2-5, disposed

- **(2) The split** — per-PR jobs `build` · `db-estate` · `db-live-gates` ·
  `render-drill` run in parallel on the two runner instances; expected per-PR
  wall-clock ~20-25 min (from ~42), sweep-night unchanged in coverage.
- **(3) Caching** — the install uses a LOCAL shared pnpm store
  (`$HOME/.pnpm-store`, content-addressed, lock-safe) replacing the remote-cache
  `cache: pnpm`, which zip-uploaded to GitHub's cache service from our own hardware;
  the gitleaks binary is version-keyed cached; docker layer cache already persists on
  the shared self-hosted daemon (nothing to add).
- **(4) Hybrid runners — DECLINED for now.** GitHub-hosted legs would reopen
  paid-minutes exposure; the recorded owner preference is $0 (`docs/ops/ci-runner.md`),
  and levers 1-3 deliver the cut without it. Revisit only if the owner re-prices.
- **(5) The composite refactor** — every step body moved into `.github/actions/*`
  VERBATIM, proven mechanically (a run-block extractor diffed old vs new; 44/50 blocks
  byte-identical after the documented `matrix.*`→`inputs.*` transform). The enumerated
  deliberate deltas, complete: the `--store-dir` install flag; the cached gitleaks
  binary (scan scope/flags unchanged); the frontier PG17-client step unified into the
  shared composite (identical recipe; trailing version print differs); one comment
  word ("below") dropped where a step's neighbour moved files; the NEW runtime-only
  build step in `db-live-gates` (the e2es import `../.output/server/index.mjs`; the
  full build + worker-path gate still run per-PR in `build`). `ci.yml` is back under
  the 500-line harness limit (500 exactly; was 1447).

## Scheduled WITH this overhaul (per the 2026-08-20 audit note)

**The Supabase non-superuser deploy-role CI leg** (Slice-2 HIGH 8/9 remainder) is
DESIGNATED to the weekly sweep, as its own PR — it is judgement-logic design work
(reproducing Supabase's non-superuser role posture in vanilla PG is not a ride-along).
Candidate shape on file: harden the deploy-onto-existing leg to apply the chain under
a roles-bootstrap-created non-superuser login on the sweep first; promote to per-PR
only if measured cheap.

## What did not change

Gate CONTENT: zero semantic changes to any step that runs; every fail-closed polarity
(`!= 'false'`, absence-fails presence guards, the R1 MAJOR classifier polarity) is
preserved; the classifier body is byte-identical; the sweep keeps its own concurrency
group; the runner topology and its private-repo-only law (digest law 38) stand.
