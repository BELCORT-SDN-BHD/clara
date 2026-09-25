# Riders rig (Windows host + WSL PostgreSQL 17), built 2026-09-20

Shell state does NOT persist between tool calls. Start EVERY Bash command with the Node 22 PATH line
and `cd` to your worktree:

`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`   (node v22; the Windows default node is v20)

| lane | worktree | PG port | db | Playwright triple (APP_ORIGIN / NEXT_PORT / RUNTIME_PORT) |
|---|---|---|---|---|
| 01 | `C:\Users\zhant\Desktop\clara-wt\635` | 55741 | `clara_l01` | https://127.0.0.1:3500 / 3501 / 3502 |
| 02 | `C:\Users\zhant\Desktop\clara-wt\636` | 55742 | `clara_l02` | https://127.0.0.1:3510 / 3511 / 3512 |
| 03 | `C:\Users\zhant\Desktop\clara-wt\642` | 55743 | `clara_l03` | https://127.0.0.1:3520 / 3521 / 3522 |
| 04 | `C:\Users\zhant\Desktop\clara-wt\651` | 55744 | `clara_l04` | https://127.0.0.1:3530 / 3531 / 3532 |
| 05 | `C:\Users\zhant\Desktop\clara-wt\655` | 55745 | `clara_l05` | https://127.0.0.1:3540 / 3541 / 3542 |
| 06 | `C:\Users\zhant\Desktop\clara-wt\656` | 55746 | `clara_l06` | https://127.0.0.1:3550 / 3551 / 3552 |
| 07 | `C:\Users\zhant\Desktop\clara-wt\657` | 55747 | `clara_l07` | https://127.0.0.1:3560 / 3561 / 3562 |
| 08 | `C:\Users\zhant\Desktop\clara-wt\658` | 55748 | `clara_l08` | https://127.0.0.1:3570 / 3571 / 3572 |
| 09 | `C:\Users\zhant\Desktop\clara-wt\659` | 55749 | `clara_l09` | https://127.0.0.1:3580 / 3581 / 3582 |
| 10 | `C:\Users\zhant\Desktop\clara-wt\660` | 55750 | `clara_l10` | https://127.0.0.1:3590 / 3591 / 3592 |
| C1 | `C:\Users\zhant\Desktop\clara-wt\635` | 55741 | `clara_l01` | https://127.0.0.1:3500 / 3501 / 3502 |
| C2 | `C:\Users\zhant\Desktop\clara-wt\636` | 55742 | `clara_l02` | https://127.0.0.1:3510 / 3511 / 3512 |

Every worktree has its dependencies installed and sits on a lane branch cut from `origin/main`
(`dd3f8f1d` or later). Every database was migrated from scratch 0001 → 0234 (229 files) on its own
fresh cluster and seeded; user `postgres`, trust auth, `127.0.0.1`.

Database env for every db command or test (Bash form):
`export PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<db> CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`

- NEVER set `CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP`, and never run a second
  from-scratch chain on your cluster (migration 0154 pins the cluster-wide role count).
- Runtime World legs: set `WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/<db>` beside the
  PG env. Bootstrapping a World on your database makes `rig-isolation.test.mjs` T10b red afterwards
  (#866); clone a sibling database first if you need both.
- **The `workflow` schema is PROVISIONED, not migrated, and one command does it:**
  `pnpm --filter @clara/runtime exec bootstrap`, once, with `WORKFLOW_POSTGRES_URL` set. It creates
  `workflow.workflow_runs` and five sibling tables. No migration in this repository creates them, and
  setting the variable alone does not either; it is not an npm script but a dependency bin
  (`packages/runtime/node_modules/.bin/bootstrap` resolving to
  `@workflow/world-postgres/bin/setup.js`).
  **Without it the runtime suite's DevKit-backed cells SKIP rather than fail**, which is the shape
  that hides them: they announce themselves as skipped on a probe for
  `to_regclass('workflow.workflow_runs')` and a green run looks green. That is how the sweep wave's
  integration merge left **22 lane-L6 cells unverified**, after recording three dead ends and
  concluding no script provisions the schema (`reports/waveS-merge.md` §16.1, §18 item 1); gate C
  then ran the same 22 green on a bootstrapped database (`reports/waveS-gates-C.md` §1c, §2a, §2b,
  F5). **Use a DISPOSABLE database for it**, per the bullet above: bootstrapping a World reds
  `rig-isolation.test.mjs` T10b afterwards (#866), so bootstrap a clone and drop it rather than your
  lane database. **The durable home for this is the repository's own `README.md` under "Develop"**,
  per the paragraph below; this is the wave's copy.
- db tests: from `packages/db`, `node --test --test-concurrency=1 $GATES tests/<file>.test.mjs` where
  `$GATES` is the exact list of `--import ./tests/*-preintegration-gate.mjs` flags in
  `packages/db/package.json`'s `"test"` script.
- runtime unit: from `packages/runtime`, `node --test tests/<file>.test.mjs`.
- web unit: from `apps/web`, `node --import ./test/bootstrap.mjs --import tsx --test <file>`; every new
  test file goes in `apps/web/test/manifest.txt`.
- web e2e: from the worktree root, `CLARA_E2E_APP_ORIGIN=… CLARA_E2E_NEXT_PORT=… CLARA_E2E_RUNTIME_PORT=…
  pnpm --filter @clara/web e2e <spec-name-substring>` with YOUR triple. Never a bare
  `npx playwright test` (it serves a stale build, #865). `next build` may panic `0xc0000142` under
  host contention: retry once (#869).
- `pnpm typecheck` (~4 min) and `pnpm lint` from the worktree root.

**The durable home for the next paragraph is the repository's own `README.md`, under "Develop"**
— this plan folder is archived when the wave closes, and a rig note that dies with its wave is how
this guidance went stale in the first place (#1124, review round). The root README carries the
symptom and the fix for every wave after this one; what follows is this wave's copy, with the
evidence that produced it. **Whoever cuts the next wave's RIG.md: point at the README rather than
re-deriving this.**

A worktree's `node_modules` can go stale relative to `pnpm-lock.yaml` and look exactly like a code
defect. `node_modules` is installed once when a worktree is set up; if `pnpm-lock.yaml` later gains a
package (on `main` before your lane's base, or from an earlier ticket on your own branch), your
worktree does not pick it up by itself. Five wave-4 lanes independently hit and separately diagnosed
this same gap for `@shadcn/react`, each spending a cycle before finding the same one-line fix
(`reports/wave4-lane01-ticket945.md`, `wave4-lane02-ticket930.md`, `wave4-lane05-ticket933.md`,
`wave4-lane06-ticket1031.md`, `wave4-lane07-ticket1041.md`; #1124). The symptom: `pnpm typecheck`
fails with `Cannot find module '@shadcn/react/message-scroller'`, web unit test files fail with
`Cannot find package '@shadcn/react'`, and `next build` (so every browser walk) fails with `Module
not found: Can't resolve '@shadcn/react/...'` — all on code your ticket never touched. **Before you
treat the first `pnpm typecheck` / `pnpm lint` / build / test failure of a session as a real defect,
rule this out** by running once from the worktree root:
`CI=true pnpm install --frozen-lockfile --prefer-offline`. It is side-effect-free when nothing was
missing (0 packages added, `pnpm-lock.yaml` and `git status` unchanged — the wave-4 evidence, every
time); when something was missing it installs only that, still touching neither the lockfile nor any
tracked file. This repo pins `pnpm@10.33.0` (`packageManager` in the root `package.json`), which has
no `install --dry-run`, so there is no side-effect-free way to check first short of running the
install itself. (Verified rather than recalled: `pnpm install --help` on the pinned 10.33.0 prints no
`--dry-run`, and the option landed in
[pnpm v11.8.0](https://github.com/pnpm/pnpm/releases/tag/v11.8.0), 2026-06-18 — "Added a `--dry-run`
option to `pnpm install`… writes nothing to disk", pnpm/pnpm#12449.)

Known Windows-only reds you must not "fix" unless your ticket IS that defect: #707 (x56-rest-c shells
out to grep), the Defender/EICAR skip, no `pg_dump` on PATH (four runtime files), the
`thread-live-clarify.test.tsx` load flake under the whole-suite run (re-run alone, report both), and
`use-clara-thread-stop.test.ts` (#956: lane 08 owns it this wave).

## Addendum for wave 2 and later (2026-09-20)

- Lane branches are `riders/w<w>-lane<k>`, cut from the integrated head of the wave before (the
  prompt names the commit). Wave 1 added no migration, so every lane database is still at
  229 files / `0234_legal_enforcement_mode` before the first wave-2 ticket.
- `use-clara-thread-stop.test.ts` (#956) was fixed in wave 1 and is no longer a known red.
- Runtime e2e spawners: four admit a `clara_l<NN>` database name (work-journal, trade-invoice,
  staff-expense-claim, periodic-adjustment); seven others admit only `clara_rt_test` and
  `clara_wave_b_ci`. If you must run one of those seven, CLONE your lane database inside your own
  cluster (`createdb -h 127.0.0.1 -p <port> -U postgres -T <your db> clara_rt_test`, with no open
  connection to the source), run against the clone, and drop the clone afterwards. Never widen a
  gate for the rig and never run a second from-scratch chain on your cluster.
- A second from-scratch chain on a cluster that already ran one needs the #867 recipe
  (`packages/db/README.md`, "From-scratch reapply on a reused cluster"). Lanes never need it: the
  integrator runs the from-scratch proof on a disposable cluster.
- CI sets `CI=true` and `GITHUB_ACTIONS=true`, and some CLIs here refuse ceremony acts under CI
  (`--retire`, `--update`, `--lock-deployed`). A selftest that spawns such a CLI must clear both
  variables for the child when the refusal it pins sits behind the CI refusal. Before you report,
  run the lint chain once more as the runner sees it: `CI=true GITHUB_ACTIONS=true pnpm lint`
  (wave 1 shipped a cell that was green on the rig and red on the runner, PR #1025).
- The runner is Linux and unprivileged; this host is Windows. A test that runs the real reconciler
  sweep (or anything that reaches the spool) must point `CLARA_SPOOL_DIR` at a per-run temporary
  directory, as `reconcile-belt-isolation-unit.test.mjs` does: off Windows the default is
  `/data/spool`, which a runner cannot create (PR #1025, second run). The integrator re-runs new
  runtime test files once under WSL as user `runner` (`/opt/node/bin/node --test <file>`) before a PR.
- NEVER run a `git worktree` subcommand (`add`, `remove`, `prune`, `repair`) or `git gc` from WSL
  against this repository. The worktrees are registered with Windows paths, WSL cannot stat them,
  and `git worktree prune` from WSL deregistered all eleven live worktrees on 2026-09-20 (repaired
  by hand; per-worktree reflogs were lost). Git housekeeping runs from Git Bash on Windows only;
  under WSL use git for read-only queries at most.
- NEVER make this repository shallow: no `git fetch --depth`, no `--shallow-since`, no
  `git clone --depth` that shares this object store. On 2026-09-20 a `.git/shallow` file appeared
  mid-wave and hid every parent of three commits: branches looked unrelated ("refusing to merge
  unrelated histories") and `main` read 804 commits instead of 1779. All parents were still in the
  object store, so removing the file restored the history; a `git gc` in that state could have
  deleted it. To mimic the runner's checkout, clone into a SEPARATE directory.

## Addendum for wave 3 (2026-09-20)

- Every lane cluster was dropped and recreated, and every lane database was migrated from scratch
  0001 to 0272 (267 files) and seeded, from the integrated wave-2 head. Lane branches are
  `riders/w3-lane<k>`, cut from that head (the prompt names the commit).
- Lane 11 works in `C:\Users\zhant\Desktop\clara-wt\int` and has NO database of its own: it is a
  web-only lane (Playwright triple 3600 / 3601 / 3602). A lane-11 ticket that turns out to need a
  database stops and says so.
- Reserved migration numbers for wave 3 start at `0273`; your prompt names yours.

## Cut phase (2026-09-25)

- Lane C1 (`clara-wt/635`, port 55741, db `clara_l01`) is on branch `riders/cut-lane01`; lane C2
  (`clara-wt/636`, port 55742, db `clara_l02`) is on branch `riders/cut-lane02`. Both were cut from
  `origin/main` at `6da02a8de`, both worktrees clean before and after, no `pnpm install` needed
  (lockfile unchanged across the checkout range).
- Both lane databases carried 309 files but the PRE-fix checksum of migration 0295 (the wave-4 lane
  databases took 0295 before its collation fix), so a migrate refused. Both were rebuilt: database
  dropped, `role-census-reset.mjs --apply` (four post-0154 roles existing and dependent-free once the
  database was gone; cluster back to 14, 0154's pin), database recreated, `pnpm --filter @clara/db
  migrate` from the lane's own worktree (309/309 applied, `0001` → `0318_knowledge_fye_pair_applicability`),
  then `pnpm --filter @clara/db seed`. Both ledgers now read 309 files, max `0318`, and both hold the
  same post-fix `0295` checksum (`5196d64d944e61ef836313cffd6bcc2d4dddd18bc808ca55f86e30544ecece0d`); a
  second `migrate` on each reports 0 new applied and no drift.
- `rigw2`, `rigw3` and `rigw3h` (ports 55760, 55770, 55771) were dropped on 2026-09-25 after the
  wave-4 release; `rigw4`, `rigw4h`, `rigw4c`, `rigint`, `rigrt`, `rigreh` and `rl03` through `rl10`
  were left untouched.

## Sweep wave (2026-09-25)

Seven code lanes on the wave-4 lane clusters, each database rebuilt from scratch at 309 / 0318 with the fixed 0295 checksum (5196d64d) and seeded; the branches are cut from main at 7bc5a710f. Lane L8 (the frozen family, #1136 #1137) runs on `clara-wt/635` after the cut phase merges, cut from the merged cut head. Migration numbers are assigned by the orchestrator (0330 upward; overflow 0360 upward on request).

| lane | worktree | PG port | db | Playwright triple | branch |
|---|---|---|---|---|---|
| L1 | `clara-wt/651` | 55744 | `clara_l04` | 3530 / 3531 / 3532 | `riders/wS-lane01` |
| L2 | `clara-wt/655` | 55745 | `clara_l05` | 3540 / 3541 / 3542 | `riders/wS-lane02` |
| L3 | `clara-wt/656` | 55746 | `clara_l06` | 3550 / 3551 / 3552 | `riders/wS-lane03` |
| L4 | `clara-wt/657` | 55747 | `clara_l07` | 3560 / 3561 / 3562 | `riders/wS-lane04` |
| L5 | `clara-wt/642` | 55743 | `clara_l03` | 3520 / 3521 / 3522 | `riders/wS-lane05` |
| L6 | `clara-wt/658` | 55748 | `clara_l08` | 3570 / 3571 / 3572 | `riders/wS-lane06` |
| L7 | `clara-wt/659` | 55749 | `clara_l09` | 3580 / 3581 / 3582 | `riders/wS-lane07` |
| L8 | `clara-wt/635` | 55741 | `clara_l01` | 3500 / 3501 / 3502 | `riders/wS-lane08` (cut from main at 061a6992b after the cut merged) |
| spare | `clara-wt/636` | 55742 | `clara_l02` | 3510 / 3511 / 3512 | `riders/wS-spare-636` |

Windows cannot reach TCP 55772 to 55871 today (a Hyper-V or WSL NAT exclusion range), so every new cluster takes a port below 55772: rigw4 55700, rigw4h 55701, rigw4c 55702, the cut gate's disposable rigcut 55706, the fix workers' disposable clusters 55704, 55705, 55707. rigw2, rigw3 and rigw3h were dropped on 2026-09-25 after the wave-4 release.

## Hosted (2026-09-25)

Hosted is released to the sweep wave: database **337 files / head `0361_reservation_release_advice`**,
runtime **`refresh-322fdf29`** =
`registry.fly.io/clara-runtime@sha256:20ab8c8352fd4372f1c8a6f50f2f163f742e92c65c7fa6dc1f227435a608344f`,
web **`fa2c6c0b-474c-40dc-9f6e-5064a2488a47`** (`RELEASE-WS-RUNBOOK.md` § RESULTS, 2026-09-25). The
previous runtime `refresh-061a6992` and previous web `3089d906-5bae-48cb-9666-72dff5aa8ef4` remain
lawful rollback targets: no frozen body moved this release (`registry.ts` byte-unchanged, `347/0
UNLOCKED`), and step 9's rollback preflight against `refresh-061a6992` read ALLOWED.

Rig databases as left after the sweep release:

- `clara_w4_hosted` (55701) and `clara_w4_coll` (55702) are now at 337 after gate B's replay.
- `clara_l02` (55742) is still the pristine 312-file template (unmigrated past the cut phase).
- `clara_intS` through `clara_intS6` (55742) are the sweep wave's integration replays.
- `rigsweep` (55707) and `rigsweepc` (55708) were dropped after the sweep gates closed.
- `clara_fixS` (55750) is the CI-reds fix database.
- `clara_sweep_e2e` (55701) is gate B's browser copy.

## Closing wave (2026-09-26)

Four code lanes, each on a NEW branch cut from `origin/main` at `ffb629d73` (the sweep wave's docs
merge, main checkout HEAD at prep time). Each database is a `createdb -T clara_intS6` template copy
on cluster 55742 — not a fresh migrate — since `clara_intS6` is the sweep merger's ordered 337-file
chain that gate A proved byte-equal to a from-scratch chain (a template copy is the sanctioned rig
shape per this file's own preface). All four lanes share cluster 55742.

| lane | worktree | cluster port | database | Playwright triple | branch |
|---|---|---|---|---|---|
| L1 | `clara-wt/701` | 55742 | `clara_c01` | 3600 / 3601 / 3602 | `riders/wK-lane01` |
| L2 | `clara-wt/702` | 55742 | `clara_c02` | 3610 / 3611 / 3612 | `riders/wK-lane02` |
| L3 | `clara-wt/703` | 55742 | `clara_c03` | 3620 / 3621 / 3622 | `riders/wK-lane03` |
| LC | `clara-wt/704` | 55742 | `clara_c04` | 3630 / 3631 / 3632 | `riders/wK-lane04` |

All four databases verified at 337 rows / max `0361_reservation_release_advice` immediately after
`createdb`, matching `clara_intS6`, and again read the same after each lane's dependency install,
`pnpm --filter @clara/db migrate` (0 new applied on every lane), and its smoke test run. `clara_l02`
(the pristine 312-file template) and `clara_intS6` itself were touched read-only (one `select
count(*), max(version)` each) and are otherwise untouched. Full detail, commands and timings:
`reports/waveK-rig-prep.md`.
