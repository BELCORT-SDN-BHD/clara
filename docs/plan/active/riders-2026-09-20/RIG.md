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
