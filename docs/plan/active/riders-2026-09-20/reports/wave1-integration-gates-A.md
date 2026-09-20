# Wave 1 riders — integration gate worker A

Worktree: `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/riders-w1`.
Start head: `23cfad94` (ten lane branches merged onto `origin/main` `e7f0a10a`, no new migration this
wave, frontier 229 files / `0234_legal_enforcement_mode`).
**Final head: `cd7da1116`** — one commit landed on the shared worktree during this session by another
actor (not me; see "The one commit on this worktree" below). Working tree clean; I made **zero
commits**. `packages/db/migrations/` is byte-identical between `origin/main` and the final head
(`git diff --stat e7f0a10a..HEAD -- packages/db/migrations/` is empty) — this wave adds no migration.

Databases: `clara_int` (55720, db suite), `clara_rt_test` and `clara_wave_b_ci` (55721, runtime
suite). All three started at 228 files / `0233` and were forward-migrated to 229 / `0234` in step 2.

## Step 1 — install

`export PATH=".../pnpm:$PATH"; cd <worktree>; pnpm install --frozen-lockfile`
→ `Lockfile is up to date, resolution step is skipped` / `Already up to date`, **2.05s**. Ran exactly
once, at the start, as instructed. Never re-run.

## Step 2 — forward migrate to the frontier

All three via `packages/db`, `node scripts/migrate.mjs`, `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`:

| target | before | command | result | duration |
|---|---|---|---|---|
| `127.0.0.1:55720/clara_int` | 228/`0233` | `PGPORT=55720 PGDATABASE=clara_int node scripts/migrate.mjs` | 1 new migration (`0234_legal_enforcement_mode`) applied, 229 total | 10.9s |
| `127.0.0.1:55721/clara_rt_test` | 228/`0233` | `PGPORT=55721 PGDATABASE=clara_rt_test node scripts/migrate.mjs` | same, 229 total | 1.4s |
| `127.0.0.1:55721/clara_wave_b_ci` | 228/`0233` | `PGPORT=55721 PGDATABASE=clara_wave_b_ci node scripts/migrate.mjs` | same, 229 total | 2.0s |

Migration 0234's own header/tail notices printed clean prestate/seed/tail assertions on all three
(the #1008 legal-enforcement-mode ceremony). No drift, no CLR raised.

## Step 3 — lint, typecheck, frozen-workflows

- `node scripts/check-frozen-workflows.mjs` — **OK**, 30.5s (re-run after the worktree's one commit
  landed: OK again, 62.1s — the commit touches only `apps/web`, outside the frozen-workflow manifest,
  so no change was expected).
- `pnpm lint` (root) — **PASS**, 63.4s first run; re-run after the worktree's one commit: **PASS**,
  80.3s. Covers `packages/db lint`, `packages/runtime lint`, `apps/web lint` (eslint +
  check-token-contrast + check-test-manifest + check-message-keys + check-ui-add-guard.selftest, all
  green) and the root freeze/leak/dead-citation/document-region/wiki-dynsql/dsn-pipe/eslint-config
  selftests. `packages/reporting-render`'s own `check`/`test` (part of the CI **lint** job but not of
  the root `pnpm lint` script) were also run directly: **113/113 pass**, 4.6s.
- `pnpm typecheck` (root) — **first run: RED.**
  `apps/web/components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name
  'DOCUMENT_KINDS'` (+ a cascading TS7006 on the same line). `packages/runtime typecheck: Done`
  (clean) throughout. See "The one commit on this worktree" — this was diagnosed, not fixed, by me,
  and was independently fixed and verified by another actor mid-session. **Re-run after that fix:
  PASS**, 52.9s and 17.976s respectively (both `apps/web` and `packages/runtime` "Done").

## Step 4 — packages/db test suite (`pnpm --filter @clara/db test`, against `clara_int`)

Run twice.

**Run 1** — `CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, no `CLARA_ESTATE_REUSED_DB`. Killed partway
(after ~1809 top-level tests) once the failure pattern made clear that `clara_int` is a **reused**
database (see Reds) and `tests/README.md`'s own "Freshness and split chains" section names the
variable for exactly this shape. Killing and re-running with the documented variable, rather than
reporting a run known to be mis-invoked, seemed the more honest choice than letting it finish.

**Run 2** — same env plus `CLARA_ESTATE_REUSED_DB=1` (acknowledging reuse, per
`packages/db/tests/README.md`'s own instruction; RIG.md's env line predates this discovery and does
not mention the variable). `time pnpm test`:

```
# tests 5206
# pass 5054
# fail 60
# skipped 92
# duration_ms 1839275.5614   (real 30m39.906s)
DBTEST_EXIT=1
```

All **60 failures trace to exactly four root causes**, all of them pre-existing database state that
predates this wave and that none of the ten wave-1 lanes touch (verified below by `git log
e7f0a10a..HEAD -- <file>` for every implicated file — empty output for all four). Re-running with
`CLARA_ESTATE_REUSED_DB=1` changed nothing about these four (identical test numbers, identical
messages, in both runs) — they are **deterministic**, not flakes. `rig-isolation.test.mjs`'s T10b and
`operation-census.test.mjs` (the two gates the work order calls out by name) are both **fully green**
(20/20 and 3/3 T10b cells respectively) — `clara_int` has no World bootstrapped, and its RBAC surface
is clean. None of the 26 packages/db files this wave's ten lanes actually touched
(`checkout-convergence-*`, `coding-lane-evidence-link-fixtures.mjs`, `fixed-asset-acquisition.test.mjs`,
`hrd-a-recut-guard.test.mjs`, `hrd-b-upgrade-kit.mjs`, `migrate-redo.test.mjs`,
`opening-balance-evidence-link.test.mjs`, `operator-support*`, `reset-gate-routing.test.mjs`,
`rig-docs-upgrade.test.mjs`, `rig-events-upgrade.test.mjs`, `rig-isolation.test.mjs`, `rig-meta.mjs`,
`rig-runtime-upgrade.test.mjs`, `role-census-reset.test.mjs`, `s6-upgrade.test.mjs`,
`wave-a-upgrade.test.mjs`, `wave-b/*`, `x37/x40/x41-0041-upgrade.test.mjs`, `x41-fa-world.mjs`,
`x42-split-upgrade-kit.mjs`) appears anywhere in the failure list.

### Red classification — all four are "pre-existing rig contamination", not (a)/(b)/(c)/(d)

None of these fit the four given buckets cleanly: not Windows-specific (a), not timing-dependent (b,
confirmed deterministic across two full runs), and — this is the material finding — **not caused by
merging this wave's ten lanes** (c) and **not a defect inside one of this wave's ten lanes** (d),
because `git log e7f0a10a..HEAD --` is empty for every file named below. They are symptoms of
`clara_int` being a **long-lived, reused integration database** that has accumulated one-way/append-only
side effects from prior, unrelated sessions (most plausibly an earlier wave's own full-suite or
slice-frontier run against this same database — `tests/README.md`'s own "Freshness and split chains"
section names exactly this hazard class). I did not fix any of them: there is no source defect to fix,
and the actual remedy (a fresh `clara_int`) is a reset, which this task explicitly forbids me from
performing.

1. **`delta-contract.test.mjs` / `delta-catalog-phase.mjs:654`** (1 failure, both runs, cell 18 of
   `registerCatalogPhase`, "freeze verifier ... deployment count exact for either witness shape"):
   `verified_deployed` reads **8**, the cell computes an expected **7**. Cause: `clara.evaluator_versions`
   carries `prepayment_schedule@v1` with `deployed=true` on this database. The cell's own math (lines
   649-676) adds `fsPackDeployed` and `card1V2Deployed` to the expected deployed count when those two
   closures are live, but **never adds `prepayRegistered`/its deployed flag** to the same sum — an
   incomplete mirror of the pattern the file uses for the other two "ships dark until its own ceremony"
   closures. `prepayment_schedule` was registered by migration 0140 (long before this wave); nothing
   in `packages/db/migrations/` between 228 and 234 touches `evaluator_versions`, so the row was
   already `deployed=true` before I ever connected. `git log e7f0a10a..HEAD -- packages/db/tests/delta-catalog-phase.mjs packages/db/tests/delta-contract.test.mjs` is empty.
2. **`f-a5b-sandbox-export-pr1.test.mjs`** (**56 failures**, all one root cause): `fa5bReady()`'s
   readiness/drift probe throws `F-A5b PR-1 DRIFT: relations=true fns=14/14 sandbox_watermark
   rows=4/3` — `clara.watermark_policy_versions` carries **4** `policy_key='sandbox_watermark'` rows
   where migration 0132's own tail pins exactly 3 (verified live: `select count(*) from
   clara.watermark_policy_versions where policy_key='sandbox_watermark'` → 4). No migration through
   0234 inserts a fourth such row (checked 0111/0132/0135/0162, the only four files that reference the
   table); the extra row is a leftover write from some prior test invocation against this same database
   (the table is explicitly append-only/no-delete). Every one of the 56 failures is the SAME
   `before()`-hook throw propagating through every `test()` in the file (`hookFailed`) — one cause, one
   fix (a fresh database), not 56 independent defects. `git log e7f0a10a..HEAD --
   packages/db/tests/f-a5b-sandbox-export-pr1.test.mjs` (and its fixture imports) is empty.
3. **`f-t1-sst-reference.test.mjs`** (2 failures): `sst_rate_schedule carries exactly 10 seed rows (got
   12)`, then a second, causally downstream failure (`immutable + supersede` expected SQLSTATE `23514`
   but got `CLR10` because the row it tried to self-supersede was already superseded by leftover data).
   Same shape as (2): an append-only reference table carrying rows beyond what the migration chain
   seeds, from a prior session. `git log` on this file is empty.
4. **`x41-round35-tie.test.mjs`** (1 failure, `x41.s4`, the family-scoped `fa_register_tie` sweep at
   `as_of 2026-10-28`): one unexplained register-vs-GL difference of 77000 cents on account `200-D41`
   for a client named `x41_b3_8ee4e1` — the naming convention of the **D-b3 slice family**
   (`wave_d_b3_af2_composite`, CI's own `db-slice-frontiers` matrix), which is designed to run on its
   **own throwaway cluster** (`.github/actions/frontier-leg`), never sharing a database with the
   package-wide sweep. `x41.s4`'s own header documents this exact hazard class from an earlier incident
   (x42 reservation-authority tests planting raw `x42v_...` rows) and narrows its regex accordingly;
   this is the same class of leak with a different offending family. The one file the wave-1 diff
   touches in this family, `x41-fa-world.mjs`, adds a `freshEnrolledFaClient` helper that is a pure
   extraction of `kSeededFaClient`'s existing body (identical calls, identical arguments — diffed by
   hand) and is not the cause. `git log e7f0a10a..HEAD -- packages/db/tests/x41-round35-tie.test.mjs`
   is empty.

## Step 5 — packages/runtime unit suite + required e2e legs

### Unit suite

`pnpm --filter @clara/runtime test` (`node --test --test-concurrency=1 "tests/**/*.test.mjs"`)
against `clara_wave_b_ci` (`WORKFLOW_POSTGRES_URL` pointed at the same database; `RIG.md` names both
`clara_rt_test` and `clara_wave_b_ci` as mine and gives no third, isolated database for the unit suite
the way CI's `clara_runtime_ci` template is — see the deviation this causes, below).

```
# tests 2879
# pass 2863
# fail 4
# skipped 12
# duration_ms 350364.5176   (real 5m51.052s)
RTTEST_EXIT=1
```

Four failures:

1. **`intake-unit.test.mjs` "scanner rejects EICAR, encrypted PDF, and XML entity expansion"** —
   `open 'C:\...\eicar.bin': UNKNOWN: unknown error`. **(a) Known Windows-only red**, named verbatim in
   RIG.md ("the Defender/EICAR skip"): Windows Defender quarantines the EICAR fixture before the test
   can open it. The very next cell, "(#693) a quarantined EICAR fixture on win32 SKIPS with the
   explicit reason", exists for this and passed — only the outer cell (which has no such guard) reds.
   Not fixed, per instruction.
2. **`pg-tools-fixture.test.mjs` "(#806) this host's OWN probe: pg_dump/psql are on PATH here..."** —
   `this rig's PATH is prefixed with ~/.local/pg17/bin — pg_dump must resolve: false !== true`.
   **(a) Known Windows-only red**, named verbatim in RIG.md ("no `pg_dump` on PATH (four runtime
   files)"). Not fixed.
3. **`ready.test.mjs` "ready r2: NO DSN component reaches the /ready payload or a warning line
   (H-48)"** — `TypeError: r.checks.pools.find is not a function` (`checks.pools` fell back to its
   `{pending:true,...}` shape instead of settling to the lane array before the assertion ran).
   **(b) Flake** — re-ran the file alone, twice, against the same database:
   `node --test tests/ready.test.mjs` → **PASS, 0 failures** (both times). Only reproduces under the
   host contention of the full suite (concurrent with the `packages/db` suite's own 30-minute run and
   whatever Worker B's apps/web suites were doing at the same moment) — consistent with a per-lane
   probe cycle not settling inside this test's own wait window under load. Not fixed (the file is
   correct in isolation; this is host-contention timing, not a code defect I can point at).
4. **`rollback-preflight.test.mjs` "637.pf: B3 — two sources sharing one task_kind count the task
   ONCE..."** — `censusUnboundTasks(query, { taskIds: [taskId] })` returned **20** rows instead of the
   expected **1**: 1 correctly-scoped `agent_tasks` row plus **19 unrelated `document_processing_tasks`
   rows, unfiltered**. Root cause, read from `packages/runtime/lib/rollback-preflight.mjs:405-413`: the
   function's `document_processing_tasks` query scopes on `scope.documentTaskIds ?? null` — a key the
   caller never supplies (it passes `taskIds`, meant for the `agent_tasks` half) — so whenever a caller
   scopes by `taskIds`/`workIds` alone, the `document_processing_tasks` half of the census runs
   **completely unscoped** and returns every live row in the table. This is a genuine, reproducible code
   gap (confirmed live: `clara_wave_b_ci` currently carries 19 queued `document_processing_tasks` rows
   across `classify`/`llm_witness`/`local_facts`/`ocr`/`none` lanes and 38 queued `agent_tasks`, leftover
   from document-intake e2e work run against this database in an earlier, unrelated session — the exact
   shape `packages/runtime/README.md`'s own `#967` note describes). **Not a wave-1 defect**:
   `git log e7f0a10a..HEAD -- packages/runtime/lib/rollback-preflight.mjs
   packages/runtime/tests/rollback-preflight.test.mjs` is empty; the file was last touched at `#637`
   (well before this wave) and is latent — every OTHER cell in the same file that scopes by `taskIds`
   passed, because they happened to run before enough queued `document_processing_tasks` rows existed
   or scoped a client/firm that had none. I did not fix it: `lib/rollback-preflight.mjs` is untouched
   by any of the ten lanes, so this is neither a cross-lane collision (c) nor a wave-1 lane's own gate
   miss (d) — it is a pre-existing latent defect this run's database contamination happened to expose.
   Recorded here as a genuine follow-up worth its own ticket (unlike the four db-suite items above,
   this ONE has an actual code fix: also scope `document_processing_tasks` on `taskIds`, or accept
   `documentTaskIds` explicitly and treat an absent `documentTaskIds` alongside a present `taskIds`/
   `workIds` as "return none" rather than "return all").

**Deviation from CI, disclosed:** CI's `db-estate-suite` runs the runtime unit suite against
`clara_runtime_ci`, a database made ONLY as a template copy for that suite and never touched by any
e2e leg. I was given exactly two runtime databases (`clara_rt_test`, `clara_wave_b_ci`) and no third,
so I ran the unit suite against `clara_wave_b_ci` before touching it with any e2e leg. One side effect:
`tests/body-census-guard-db.test.mjs` (glob-matched by `tests/**/*.test.mjs`) is designed to SKIP when
`PGDATABASE` is not `clara_rt_test`/`clara_wave_b_ci` (that guard exists so it doesn't run inside CI's
isolated `clara_runtime_ci`); on my invocation it does NOT skip and runs for real, spawning the built
image. It **passed** (its three `637.s5` cells, including the `CLARA_ALLOW_STRANDED_BODIES=1` override
leg, all green) — a superset of CI's own bulk-suite behaviour here, not a weaker one.

### Runtime build + post-build gates (no `apps/web` touched)

`pnpm --filter @clara/runtime build` (nitro only) — **success**, 11.0s, `.output/server/index.mjs`
10.9MB (one benign `UNRESOLVED_IMPORT` warning for optional `@opentelemetry/api`, expected/pre-existing).
Then, against that build:

- `node scripts/check-worker-paths.mjs` — **OK**, 2 spawn sites resolve through `resolveLibWorker`,
  built bundle verified.
- `node scripts/check-workflow-bundle.mjs` — **OK**, 12 pinned classes present, chatTurn pinned at v21,
  40 checks.
- `node packages/runtime/scripts/check-parts-parity.mjs` — **OK**, reader ⊇ emittable at this commit.

The full `pnpm build` (which also builds `apps/web`) was not run — out of scope for worker A.

### Required e2e legs (`RELAY_TEST_MODE=1`, `WORKFLOW_POSTGRES_URL` set, from `packages/runtime`)

| leg | database | result | duration |
|---|---|---|---|
| `tests/work-journal-e2e.mjs` | `clara_wave_b_ci` | **PASS** ("WORK JOURNAL E2E: PASS", 5 legs incl. exit_after_commit crash/resume) | 2m43s |
| `tests/periodic-adjustment-e2e.mjs` | `clara_wave_b_ci` | **PASS** ("PERIODIC ADJUSTMENT E2E: PASS") | 1m01s |
| `tests/staff-expense-claim-e2e.mjs` | `clara_wave_b_ci` | **PASS** ("STAFF EXPENSE CLAIM E2E: PASS") | 52s |
| `tests/trade-invoice-e2e.mjs` | `clara_wave_b_ci` | **PASS** ("ti-e2e PASS — all legs green") | 1m12s |
| `tests/two-build-cutover-e2e.mjs` | `clara_rt_test` | **PASS** ("TWO-BUILD CUTOVER E2E: ALL PASS") | 2m20s |

`two-build-cutover-e2e.mjs`'s own inventory gate confirmed `clara_rt_test` was genuinely pristine
("no non-terminal runs and no unbound accounting_work tasks") going in — unlike `clara_wave_b_ci`,
this database was not carrying historical residue, so both builds, both preflight refusals/allowances
and both resumes ran exactly as the file's own header describes, cleanly.

All five legs print repeated `[Workflow] Error ... autoDraft.v10 ... claimAutoDraftStep failed after 3
retries: autodraft registry not active` background noise — leftover, already-failing scheduled retries
from the same pre-existing `clara_wave_b_ci` residue noted above, not new failures; each leg's own
`PASS`/`ALL PASS` line is unaffected by it (this is exactly the "1.27M lines of leftover
concurrency-limit/retry noise" class `packages/runtime/README.md`'s own `#967` note describes, just at
a far smaller scale here since I never ran the intake e2es that create it fresh in a CI run).

Not run — **out of scope by explicit task instruction**, not because they cannot run on this host: the
Slice-5/#633/#636 intake e2es, `interview-e2e`/`interview-kill-resume-e2e`/`version-cutover-e2e`,
`work-question-e2e`/`work-cancel-e2e`, `fixed-asset-acquisition-e2e`, `work-egress-e2e`,
`chat-turn-v19/v20/v21-e2e`, `plan-occurrence-e2e`, `accrual-e2e`, `prepayment-occurrence-e2e`,
`opening-ledger-source-e2e`, `work-knowledge-e2e`, `body-census-guard-db.test.mjs` standalone, and the
DR backup/restore self-test + full-profile two-cluster round-trip.

## Step 6 — `.github/workflows/ci.yml` job map

| job | condition | mapped to | verdict |
|---|---|---|---|
| `changes` | every event | N/A — GitHub-hosted git-diff classifier, not executable locally. For the record: this wave's diff (`packages/db`, `packages/runtime`, `apps/web`, root config) would read `code=true db=true storage=false` (no `packages/db/deploy/storage-*`, `storage-battery/`, or storage-related runtime file touched — confirmed by `git diff --name-only e7f0a10a..HEAD \| grep -i storage`, empty). | n/a |
| `lint` | every event | `pnpm lint` (root) + `packages/reporting-render` `check`/`test` — step 3, both re-run after the worktree's one commit | **PASS** |
| `render-drill` | code≠false | **not run.** Needs a Linux Docker build (`docker build -f packages/reporting-render/Dockerfile`) and `scripts/double-render-drill.mjs`; Docker is WSL-only on this host, not on the Windows PATH the harness runs in, and reporting-render is untouched by any wave-1 lane. Its OTHER prerequisite, the renderer's own `node --test` battery, was run directly (113/113 pass, see step 3) — the image build and the determinism/control-arm drill itself were not attempted. **Unverified.** | not run |
| `build` | code≠false | `pnpm typecheck` (RED → PASS, see step 3) + `pnpm --filter @clara/runtime build` + `check-worker-paths.mjs` + `check-workflow-bundle.mjs` + `check-parts-parity.mjs` (step 5) | **PASS** (partial: the `apps/web` half of `pnpm build` itself was not run — out of scope) |
| `db-estate` | code≠false | deploy-onto-existing ≡ the plain forward migrate in step 2 (migrations/ is byte-identical `origin/main`↔HEAD this wave, so there is nothing to replay-then-drift-check); migrate+seed+test ≡ steps 4+5; the focused `client-identifiers-unique.test.mjs` re-run (gate var unset) — ran directly, **17/17 pass, 0 skips** | **PASS** (with the disclosed runtime-database deviation above) |
| `db-live-gates` | code≠false | the 5 named e2e legs (step 5) | **PASS** for the 5 legs run; the rest of this job's ~20 other legs and the DR round-trip are out of this task's explicit scope, not attempted |
| `storage-policy-battery` | storage≠false | not run — wave touches zero storage inputs, so real CI's own classifier would skip this leg (`storage=false`) | lawfully not applicable |
| `closed-wave-drills` | schedule/dispatch only | sweep-only; lawfully skipped on pull_request/push | n/a here |
| `db-slice-frontiers` | schedule/dispatch only | sweep-only; lawfully skipped on pull_request/push. (Incidental finding: contamination consistent with an *earlier*, unrelated run of this job's D-b3 leg having shared `clara_int` — see Reds item 4.) | n/a here |
| `db-split-partition-total` | db≠false | ran the composite action's script body directly from `packages/db` | **PASS** — 87 files each in exactly one list, 3 cross-slice contracts OK, 1 declared floor re-run (`x41-belt.test.mjs`) |
| `ci` (meta-gate) | always | N/A — GitHub Actions-only aggregation of the above | n/a |

## Commits

**None.** I made zero commits in this worktree. Every red I found classifies as (a) known Windows-only,
(b) a confirmed flake, or pre-existing database contamination unrelated to any of the ten wave-1 lanes
(db suite, all four items) or a latent pre-wave-1 code defect merely exposed by that contamination
(runtime suite item 4) — none is a wave-1 cross-lane collision (c) or a wave-1 lane's own defect (d)
that was mine to fix.

## The one commit on this worktree (not mine)

Between my first (RED) and second (PASS) `pnpm typecheck` run, `origin/main`-tracking HEAD in this
SAME shared worktree advanced by one commit I did not make:

```
cd7da1116 fix(integration): document-kind-dialog SelectValue items must use the filtered roster
  (author zhantao-belcort, Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>)
```

This is **exactly** the defect my own typecheck run had already diagnosed independently (line 95's
`SelectValue`'s `items` prop read the unfiltered `DOCUMENT_KINDS`, never imported in the file, instead
of the `CLASSIFIABLE_DOCUMENT_KINDS` constant the `SelectContent` list two lines below it correctly
uses per #878's fix) — the other actor's own commit message states the identical root cause and
attributes it to **lane 08's own history** (`55fe794a` #878, `61f56acf` #1005), i.e. a defect inside
one lane that its own gates missed (category (d)), not a cross-lane collision. I did not act on this
myself because `apps/web` is explicitly off-limits to worker A this run; I re-ran `pnpm typecheck`,
`pnpm lint` and `node scripts/check-frozen-workflows.mjs` afterward to confirm the shared worktree is
still green at the new head (all three PASS — see step 3). Final head is `cd7da1116`.

## Unverified / not run

- `render-drill`'s Docker image build and `double-render-drill.mjs` (needs Docker; WSL-only on this
  host).
- `storage-policy-battery` (needs Docker + Supabase CLI; lawfully skipped for this wave's diff anyway).
- The ~20 `db-live-gates` legs and the DR round-trip beyond the 5 named e2es — out of explicit task
  scope, not attempted, not claimed either way.
- Whether an *earlier* run of the D-b3 slice-frontier legs (or an equivalent whole-suite run) is what
  actually left `clara_int`/`clara_wave_b_ci` in the state documented under Reds — I did not have
  access to any prior session's own logs to confirm the exact originating run; the state itself (extra
  `watermark_policy_versions`/`sst_rate_schedule` rows, the `prepayment_schedule` deploy flag, the
  `x41_b3_*` client, the queued `document_processing_tasks` backlog) is directly measured, not
  inferred.

## Final head

`cd7da1116ef176747cefbb56dec46b0c7d065d8a` — clean working tree, zero commits by me.
