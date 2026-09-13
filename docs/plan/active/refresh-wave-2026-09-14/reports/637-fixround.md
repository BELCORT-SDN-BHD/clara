# #637 fix round — two-build cutover

Branch `impl/637-two-build-cutover`, worktree `C:\Users\zhant\Desktop\clara-wt\637`, clean.
Six new commits (`git log --oneline main..HEAD`, newest first): `20e64671` docs · `a82ceaf0` drill
gates + scoped verdicts · `af9ba20f` world-guard tests + CI · `11a0d6c0` world guard · `0dfbf01b`
catalog-checked census cells · `0b43b4d1` preflight censuses every kind. The previous worker's six
(`2a7d908f`…`b26ba833`) are unchanged beneath them.

## Finding → what I did → evidence

| Finding | What I did | Evidence |
|---|---|---|
| **B1** scope disabled the unbound census (false zero) | Both censuses always run in full; a scope only adds a narrowed view. Also found: `held` was never counted, so every wake task waiting for its source was invisible — the same defect one level down | `637.pf: B1 — a RUN-shaped scope still measures the unbound-task leg IN FULL`, `637.pf: B1 — the live/no-body STATUS partition is complete against the catalog` — 24/24 |
| **B2** a name scope hid other classes' parked runs | `verdict` is global (exit code follows it), `scoped.verdict` sits beside it and never widens it | `637.pf: B2 — a name scope may NOT allow while an out-of-scope body is stranded`; CLI by hand: `--scope-name chatTurn` printed SCOPED ALLOWED, GLOBAL REFUSED naming `claraWork_v2`, **exit 1** |
| **B3** one of five kinds censused | All five `agent_tasks` kinds + all nine document lanes. `wake`/`close_prep` classes are **read** from `clara.wake_engine_sources` per row (event-type for `wake`, `task_kind` for `direct_queue`); unplaceable ⇒ fail-closed | `637.pf: B3 — …every kind in clara.agent_tasks's OWN check constraint…`, `…every document LANE…`, `…a HELD wake task's class is READ from…` — all green |
| **S4** dirty/unbuilt inventory | New `tests/built-bundle-gate.mjs`: refuses `not_built`, `registers_no_bodies`, `stale` (mtime vs bundled sources), `roster_disagrees` (artifact vs `registry.ts`), naming the build command. Wired at the two-build drill's door | `node --test tests/built-bundle-gate.test.mjs` → **7/7**; drill log: `[tb-e2e] build gate: … present, newer than every bundled source, and agrees with registry.ts` |
| **S5** world must refuse, not warn | Census moved **before** `getWorld().start()`; refusal returns (never exits), HTTP up, `/ready` 503 + `checks.bodies.world_start_refused`; `CLARA_ALLOW_STRANDED_BODIES=1` overrides; read failure still fails open | `tests/body-census-guard-db.test.mjs` (real World) **4/4**; override leg logged `world STARTED (replay divergence / crash …)`; `tests/ready.test.mjs` **24/24** |
| **S6 (re-derived)** `version-cutover-e2e.mjs` read the global verdict from its per-name helper | Helpers return the narrowed view; the #708 leg asserts both verdicts explicitly | `node tests/version-cutover-e2e.mjs` → **ALL PASS**, 22s (it failed before the fix) |
| **S7 (re-derived)** `two-build-cutover-e2e.mjs` asserted retired reason `unbound_accounting_work` and global verdicts on a shared DB | Reason → `unbound_task` + stranded class named; every drill verdict scoped; new B2 leg created by the drill itself | `node tests/two-build-cutover-e2e.mjs` → **ALL PASS**; `[tb-e2e] preflight B2: scoped-to-W1 ALLOWED while the global verdict REFUSES` |
| **Own** wake-source join fanned out | `source_key` is the PK, `task_kind` is not unique → one task produced **3** census rows with a superseded export. Now LATERAL + `reconciler-wake.mjs`'s own ordering | `637.pf: B3 — two sources sharing one task_kind count the task ONCE`; pre-fix run printed `expected 1, actual 3` |
| **Own** CLI re-derived the stranding rule inline | One exported `taskIsStranded`, used by the verdict and the CLI | `637.pf: the stranding predicate is ONE exported rule` |
| **Own** the ready source-shape cell was a false red | It spanned the plugin body incl. `fatal()`; now reads the census function and pins the `return` call site | `ready: S5 — plugins/startWorld.ts takes the census BEFORE…` green |
| **Own** the new fixture leaked a held wake task | A leaked one makes the preflight fail-closed and refuse **every** rollback on that DB (reproduced with the CLI). Retirement is by intent and asserts nothing live remains | `retireWakeTask`; post-run estate query: `live tasks after the run: []` |

Task-A audit, all verified: the supported set comes only from the target (bundle scan /
`--target-build-info` / `--supported`, never the running registry); exit 0/1/2 exercised by hand;
`workflowBodies`/`workflowPins` frozen under freeze-lint (g), with (h) refusing a `tests/` manifest key
(selftest prints both positive controls); banners byte-identical; §10 anchor + supersession pointer and the
README preflight step present.

## Commands

From `packages/runtime` with the rig env: `node --test --test-concurrency=1 tests/rollback-preflight.test.mjs
tests/ready.test.mjs tests/built-bundle-gate.test.mjs tests/work-bundle.test.mjs tests/l9-build-info.test.mjs
tests/registry-view.test.mjs` → **87 pass / 0 fail / 0 skip**; `tests/body-census-guard-db.test.mjs` on
`clara_rt_test` → **4/4**. `check-frozen-workflows.mjs` OK (264 files) + both selftests;
`check-workflow-bundle.mjs` OK (49 bodies) after `pnpm --filter @clara/runtime build` (2m02s);
`check-parts-parity` OK. `pnpm typecheck` **exit 0**, `pnpm lint` **exit 0**. apps/web untouched — suite
not run.

**Two-build e2e cost: 1m43s total, 54.6s of it the scratch nitro build** (previous worker measured 3m25s /
82.6s). Wired in `.github/actions/db-live-gates/action.yml` after `work-cancel-e2e`; the world-guard
`node --test tests/body-census-guard-db.test.mjs` is wired last in the same action (the unit suite runs on
`clara_ci` with no `.output`, where its gate would skip it — a skip is not evidence).

## Docs

`packages/runtime/README.md` (new boot-gate section, census coverage table, corrected #623 "lane parks"),
`docs/ARCHITECTURE.md` §5/§10/§11, `docs/PROGRESS.md` ceremony steps 1/4/5.

## Follow-ups (still open)

- **Manifest half of #637 AC1** — `claraWork.v2.bundle.ts` hashes `{id, instructions, skills, tools{id,names},
  budgets}`, not tool JSON schemas or dependencies; no literal pin for `CLARA_WORK_BUNDLE_V2_DIGEST`.
- **WDK crash-loop on an unrunnable parked run** — the engine still raises `ReplayDivergenceError` and exits 1;
  #637 only prevents the process from reaching it. A park-and-warn engine behaviour is the real fix.
- `lib/rollback-preflight.mjs` is 529 lines (past the informal 500 budget; unenforced).

## Unverified

Hosted evidence (two releases + one deliberate rollback on Fly) — owner-scheduled, not claimed. CI green for
the new steps — not run here. `ready.test.mjs`'s two MAJOR-1 wall-clock cells red intermittently under
parallel load on this Windows host (green every sequential run; pre-existing, per `4df3d425`).
