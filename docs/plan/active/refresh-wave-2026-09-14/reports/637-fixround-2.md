# #637 fix round 2 — documentation truth + one CLI footer

Worktree `clara-wt/637`, branch `impl/637-two-build-cutover`, clean. Two new commits on top of the
first fix round (`git log --oneline main..HEAD`, newest first): `b9f698b5` fix · `2fcaaafe` docs.

## Item → what changed → evidence

**SHOULD-2 (three stale doc blocks).** Rewrote each to state the shipped rule — census runs
*before* `getWorld().start()`; a non-zero count REFUSES to start the world (HTTP stays up, `/ready`
503 naming the bodies); `CLARA_ALLOW_STRANDED_BODIES=1` overrides; the one fail-OPEN case is a
census *read* failure, not a nonzero result — and each names the pending owner confirmation
(SHOULD-1).
- `packages/runtime/lib/body-census.mjs:22-38` — replaced the "WARNING-ONLY, ALWAYS" block.
- `packages/runtime/plugins/startWorld.ts:89-113` — replaced `censusStrandedBodies`'s
  "WARNING-ONLY AND FAIL-OPEN" docblock.
- `packages/runtime/tests/ready.test.mjs:682-696` — replaced the `#637 — checks.bodies` section
  header; it now points at the `#637 review S5` section below (already correct) and states that
  only the `worldStartRefused:false` cell in that section still applies as originally written.

**SHOULD-1 (owner-confirmation sentence, doc-only).**
- `packages/runtime/README.md` — new "Blast radius (owner confirmation pending)" paragraph after
  the boot-gate section's refusal-fix paragraph (~line 268): refusal is database-wide, so one
  stranded body left by any lane blocks every later runtime process on that database, e.g. all four
  `db-live-gates` Wave-B steps sharing `clara_wave_b_ci`.
- `docs/ARCHITECTURE.md` §10 (`#workflow-versioning-and-rollback` anchor, ~line 414) — matching
  Chinese-language paragraph in the existing prose voice, same content.

**NOTE-4 (stale "ONE MORE LINE" comment).** `packages/runtime/plugins/startWorld.ts:279-286` — the
line it promised already exists: `emitProvenanceLine()` (line 255, before the stranded-body
census). Rewrote the comment to point at it instead of implying a still-missing line, and cited
`tests/body-census-guard-db.test.mjs:178`, which pins that the provenance line is emitted FIRST.

**NOTE-5 (registry.ts "two edits" comment).** `packages/runtime/workflows/registry.ts:767-774` —
was "exactly two edits" (export + roster entry); `registry-view.test.mjs` reds on five. Enumerated
all five: the import line, the `workflows.<className>` dispatch repoint, the `export` line, the
`workflowBodies` entry, and the `workflowPins` entry — confirmed against how `claraWork_v2` was
actually added (`registry.ts:31,32,149,716-717,792,831`).

**NOTE-6 (stale CI drill numbers).** `.github/actions/db-live-gates/action.yml:130-134` — replaced
"82.6s / 3m25s" with the closure review's re-measurement, "78.0s scratch build / 124s whole file",
and noted these are Windows-host measurements.

**SHOULD-3 (CLI footer, behavioural — the one non-doc item).** `taskIsStranded` returns `true` for
`known:false` regardless of `supported`, so the CLI's closing "two admissible ways forward"
(RETAIN / DRAIN) was unreachable for an unplaceable task. Extracted the footer into a new exported,
testable `refusalFooterLines(supported, result)` in `packages/runtime/lib/rollback-preflight.mjs`
(after `taskIsStranded`, ~line 365): returns the original two-way text when every stranded row
names a class, and a third-way text (register/repair the task's `clara.wake_engine_sources` row,
or retire the task) when any stranded row is unplaceable. `packages/runtime/scripts/
rollback-preflight.mjs:245` now calls it instead of printing a hardcoded string. Verdict semantics
and exit codes are unchanged — confirmed by inspection, no verdict-producing code touched.

Test added: `packages/runtime/tests/rollback-preflight.test.mjs` — "637.pf: SHOULD-3 — the refusal
footer names a THIRD way forward when a stranded task is UNPLACEABLE" (pure, no rig): asserts the
two-way wording is unchanged when every stranded row is placeable, the three-way wording (naming
the row and `wake_engine_sources`) appears when one is not, and that an unplaceable row still
triggers the third way even against a target carrying every named class.

## Verification

`node --test tests/rollback-preflight.test.mjs tests/ready.test.mjs tests/l9-build-info.test.mjs
tests/registry-view.test.mjs` from `packages/runtime`, rig `127.0.0.1:55441`/`clara_637`:
**71/71 pass** on a clean run. A first run of the same command hit one red
(`ready r2: NO DSN component reaches the /ready payload…`, `TypeError: r.checks.pools.find is not a
function`); a solo re-run of `tests/ready.test.mjs` alone instead reddened its two documented
MAJOR-1 wall-clock cells. Both are the pre-existing intermittent-under-load flake the prior worker
already recorded in `reports/637-fixround.md`'s Unverified section ("ready.test.mjs's two MAJOR-1
wall-clock cells red intermittently under parallel load on this Windows host — green every
sequential run"); none of the reddening tests are within 300 lines of anything this round touched
(my only edit to `ready.test.mjs` is the comment block at 682-696), and the clean 71/71 rerun is the
evidence of record.

`node scripts/check-frozen-workflows.mjs` (repo root) → `OK — 264 frozen file(s)… 49 "use workflow"
module(s) all frozen+registered`. `pnpm typecheck` → exit 0 (both `packages/runtime` and
`apps/web`). `pnpm lint` → exit 0 (all four workspaces, including `apps/web`'s token-contrast,
test-manifest and message-key selftests). No `apps/web` source changed, so its unit suite was not
run, per the work order.

## Commits

- `2fcaaafe` `docs(runtime): #637 — the boot census REFUSES, and the doc trail says so` (SHOULD-2,
  SHOULD-1, NOTE-4, NOTE-5, NOTE-6)
- `b9f698b5` `fix(runtime): #637 — the preflight footer names a THIRD way forward for an unplaceable
  task` (SHOULD-3 + test)

Worktree clean after both commits (`git status` → nothing to commit). No migration, no push, no PR.
