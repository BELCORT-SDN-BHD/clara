# #637 — closure + adversarial review

Worktree `clara-wt/637`, branch `impl/637-two-build-cutover`, 12 commits, `git status` clean, no migration.
Rig `rig637` (55441). All commands below run from `packages/runtime`.

## Closure table (worker's fix-round rows, verified independently)

| Finding | State | Test + what it asserts |
|---|---|---|
| **B1** scope disabled the unbound census | CLOSED | `rollback-preflight.test.mjs` "B1 — a RUN-shaped scope still measures the unbound-task leg IN FULL" + "the live/no-body STATUS partition is complete against the catalog" (reads `agent_tasks`' CHECK from `pg_constraint`). Behavioural. Re-measured: `--scope-run <v2 run>` still printed all 7 unbound tasks. |
| **B2** name scope hid other classes | CLOSED | "B2 — a name scope may NOT allow while an out-of-scope body is stranded". Measured live: `--scope-name chatTurn` → `SCOPED ALLOWED` / `GLOBAL REFUSED … 2 non-terminal run(s) on claraWork_v2`, **exit 1**. |
| **B3** one kind of five | CLOSED | Catalog-derived cells for all 5 kinds + 9 lanes. Measured: my seeded `[wake held] -> bankAgent` resolved from `wake_engine_sources.workflow_export`, not a literal. |
| **Own** wake-source join fan-out | CLOSED | LATERAL+`limit 1` cell; my seeded held wake task counted **once** with two sources present on the rig. |
| **S4** dirty/unbuilt inventory | CLOSED | `built-bundle-gate.test.mjs` **7/7**; measured directly in scratch: `not_built`, `stale`, `roster_disagrees` ("artifact registers 49 … registry.ts declares 50; absent from the artifact: ghostBody_v9"), throw names `pnpm --filter @clara/runtime build`. The drill's inventory gate also refused a real dirty DB (exit 1, named `chatTurn_v7`). |
| **S5** world must refuse | CLOSED (behaviour) | `body-census-guard-db.test.mjs` **4/4** re-run on `clara_rt_test` against a real World: `/health` 200, `/ready` 503, `checks.bodies.world_start_refused`, body named, process alive. The "census BEFORE `getWorld().start()`" cell is a source-text pin, but the behaviour is independently proven by that file and by my own live refusal below. |
| **S6** e2e read the global verdict | CLOSED | `node tests/version-cutover-e2e.mjs` → **ALL PASS, 25s** (clean estate); the #708 leg asserts `scoped.verdict allowed`, `verdict refused`, `scope.given true`. |
| **S7** drill asserted retired reason | CLOSED | `node tests/two-build-cutover-e2e.mjs` → **ALL PASS, 124s** (scratch nitro build **78.0s**). Legs observed: A=48 bodies (no v2), B=49, `pins.claraWork=claraWork_v2`, rollback to A refused naming `claraWork_v2`, `preflight B2: scoped-to-W1 ALLOWED while the global verdict REFUSES`, W1 resumed on `claraWork_v1` (name invariant, receipt `afb2038a…`), W2 on v2 (`c8fd7670…`), both settled → A now ALLOWED, unbound Work refuses alone. |
| **Own** fixture leaked a held wake task | CLOSED | Rig left clean: `--target-bundle .output/server/index.mjs` on `clara_rt_test` → **ALLOWED, exit 0**. |

Supported set never comes from the running registry: `grep -n registry lib/rollback-preflight.mjs scripts/rollback-preflight.mjs` → comments only, no import. Exit codes measured: `--target-bundle`/`--supported`/`--target-build-info` → 0/1; pre-#637 build-info payload, two targets, no target → **2**.

Gates: `check-frozen-workflows` OK (264 files, 49 `use workflow` modules) · both selftests OK incl. (g) five provenance-shape controls + canary and (h) `tests/` manifest-key REFUSED + canary · `check-workflow-bundle` OK (49 superseded bodies ship) · `check-parts-parity` OK · unit suite `rollback-preflight/ready/built-bundle-gate/work-bundle/l9-build-info/registry-view` → **87 pass / 0 fail / 0 skip** · `pnpm typecheck` 0 · `pnpm lint` 0.

## Findings

**SHOULD-1 — the S5 guard is a database-wide gate, and its blast radius is wider than #637.** A/B on one database: clean → `VERSION CUTOVER E2E: ALL PASS` (25s); same DB + 20 parked runs of `foreignLane_v1` (a body no image exports) → the spawned runtime printed `[clara-runtime] stranded bodies n=20 … REFUSING TO START THE DURABLE WORLD`, **no lane started**, and the unrelated drill FAILED (exit 1, 54s). Any non-terminal run of an unexported body — left by another lane, an interrupted test, or a killed `body-census-guard-db` ghost row — now bricks every later runtime process on that database. In `db-live-gates` all four Wave-B steps share `clara_wave_b_ci`, so one interrupted step poisons the rest of the job. This is the accepted ruling working as designed; it needs to be in the owner's confirmation and in the CI runbook, not fixed here.

**SHOULD-2 — three doc blocks now contradict the shipped behaviour.** `lib/body-census.mjs:23-26` ("WARNING-ONLY, ALWAYS. Nothing here decides anything… Refusing to boot would take the estate down"), `plugins/startWorld.ts` `censusStrandedBodies` docblock ("WARNING-ONLY AND FAIL-OPEN, by ruling… a non-zero census logs loudly and boots"), and `tests/ready.test.mjs`'s #637 section header. In an estate where the comment is the spec, a future reader will believe the stale one.

**SHOULD-3 — an unplaceable task can never be satisfied.** `taskIsStranded` returns true for `known:false` regardless of `supported`, so the CLI's closing "two admissible ways forward" (retain every bundle / drain) are both unreachable for it. Measured on the rig before cleanup: three `wake/held` tasks whose event type had no source row → exit 1 **even against the full 49-body current bundle**. README prose does name the right answer (settle it or re-register the source); the CLI's own refusal footer does not.

**NOTE-4** `plugins/startWorld.ts:268-272` — a five-line comment describing "ONE MORE LINE" followed by a bare `//` and no code (the provenance line moved to the top of the boot sequence).

**NOTE-5** `registry.ts`'s provenance comment says a successor needs "exactly two edits in this file"; it actually needs five (import, `workflows` repoint, `export`, `workflowBodies`, `workflowPins`). `registry-view.test.mjs` reds on the omissions, so this is a doc bug only.

**NOTE-6 — CI, never run on GitHub.** `db-live-gates/action.yml` step 1 already runs `pnpm --filter @clara/runtime build`, so `.output` exists for both new steps; no Docker/nitro prerequisite is missing on `ubuntu-latest`. The untested surface is the scratch build's resolution path: one symlink `<repo>/.scratch/two-build/node_modules → packages/runtime/node_modules` over pnpm's virtual store, exercised only on Windows junctions so far. Added cost ~2 min into a 90-min job. The action.yml comment still quotes the *previous* worker's numbers (82.6s / 3m25s), not the current ones.

**NOTE-7** `apps/web/app/api/build-info/route.ts` is untouched (optional in the brief); it composes its own payload and proxies nothing, so no field is silently dropped.

**Standards (D).** `lib/rollback-preflight.mjs` is 529 lines but only **250 lines of code** against 247 of comment, across 24 declarations on one theme (what is live; can the target run it). CLI rendering already lives in `scripts/rollback-preflight.mjs` (255 lines) and the verdict is a 20-line pure function. Cohesive — no split warranted; the budget overrun is comment mass. README / ARCHITECTURE §5·§10·§11 / PROGRESS ceremony are factual and correctly refuse to claim hosted evidence. The §10 anchor `#workflow-versioning-and-rollback` exists with the supersession pointer; the three editable "Appendix A" citations named in the brief are repointed, and the two remaining editable stragglers (`nitro.config.ts`, `lib/malaysian-registration.mjs`) are named honestly in that paragraph. Several `packages/runtime/tests/*.mjs` still cite Appendix A — outside the brief's list.

## Shared-file conflict surface (wave 2)

`git diff main...HEAD --name-only` intersected with #624/#644/#640/#643:

- **`.github/actions/db-live-gates/action.yml`** — #637, #640, #643 all append inside the same `@@ -119` hunk. Textual conflict is certain; #637 additionally edits line 54 (step name) alone.
- **`docs/ARCHITECTURE.md`** — all five branches rewrite the same §11 "Agent 与宿主" table row near line 366-371. Highest-risk file in the wave. #637's other hunks (@@150 flowchart, @@348 checks/§10) are its own.
- **`CONTEXT.md`** — all five add a term, at disjoint offsets (#637 @@104, #624 @@156, #644 @@86, #640 @@20, #643 @@187). Low risk.
- `docs/PROGRESS.md` and `packages/runtime/README.md` are #637-only in wave 2.
- #643 touches no `workflows/`, `registry.ts` or `frozen-workflows.json` — no interaction with #637's provenance exports.

## The v3 re-run (wave 3)

The drill is registry-derived: `deriveVersionPair` reads the live `claraWork: claraWork_vN` pin and the retained `export { claraWork_vM }` roster; the only literals `claraWork_v1`/`_v2` in the drill, the scratch-image builder and the preflight are in comments. When #631 lands `claraWork_v3`, **re-run `node tests/two-build-cutover-e2e.mjs` with no edit** — it becomes v2→v3 automatically, provided v3 is added in the exact shapes `rewriteRegistryToPrevious` matches (`\n  claraWork: claraWork_v3,`, `import { claraWork_v3 } from "./claraWork.v3.js";`, `export { claraWork_v3 };`, `"claraWork_v3",` in `workflowBodies`, `claraWork: "claraWork_v3"` in `workflowPins`); any deviation throws `registry rewrite step did not apply`, loudly, never silently. Also re-run `registry-view.test.mjs`, `check-workflow-bundle.mjs` and `l9-build-info.test.mjs`. A **chatTurn v18→v19 drill is NOT free**: `buildPreviousVersionImage` is called without `className`, and the drill's admission legs are claraWork-shaped — that needs a real edit.

## Verdict

**MERGEABLE.** Every fix-round row closes on a test that goes red on regression, all three adversarial censuses and the World guard reproduce on the real rig, the two-build drill and the version-cutover drill both pass end-to-end, and typecheck/lint/freeze-lint/bundle/parity are green. The open items are one accepted-ruling blast radius to put in front of the owner (SHOULD-1), three stale comments and two notes — none of which change behaviour. Merge after the wave-2 integrator resolves the `action.yml` and ARCHITECTURE §11 conflicts by hand.
