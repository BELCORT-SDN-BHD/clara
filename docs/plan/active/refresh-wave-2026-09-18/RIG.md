# Local rig for implementation workers — wave 2026-09-18 (Windows host + WSL PostgreSQL 17)

Ten isolated worktrees, each with its own PostgreSQL 17 cluster, so ten implementers work in
parallel without colliding. Base commit for every worktree: **`abcc5030`** (origin/main at
rig-build time, 2026-09-18). Built by `build-all.sh` → `build-rig.sh` (beside this file); clusters
by `mkrigs-all.sh` → `mkrig.sh`.

Shell state does NOT persist between tool calls. Start EVERY Bash command with the PATH line below
and `cd` to your worktree.

## Node 22 (required — the Windows default `node` is v20 and must not be used)
- Bash tool:        `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`   → `node --version` prints v22.23.2
- PowerShell tool:  `$env:PATH = "C:\Users\zhant\AppData\Local\pnpm;" + $env:PATH`
- pnpm 10.33.0 is on PATH already.

## Rig table (measured 2026-09-18 13:47Z)

| ticket | worktree | branch | PG port | db | Playwright triple (APP_ORIGIN / NEXT_PORT / RUNTIME_PORT) | install | migrate | seed | smoke |
|---|---|---|---|---|---|---|---|---|---|
| 635 | C:\Users\zhant\Desktop\clara-wt\635 | impl/635-firm-commercial-settings | 55701 | clara_635 | https://127.0.0.1:3300 / 3301 / 3302 | ok 438s | 219 applied | ok (2 files) | 219 · 0224_preview_invite · PG 17.11 |
| 636 | C:\Users\zhant\Desktop\clara-wt\636 | impl/636-work-batch | 55702 | clara_636 | https://127.0.0.1:3310 / 3311 / 3312 | ok 437s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 642 | C:\Users\zhant\Desktop\clara-wt\642 | impl/642-chat-stream-admission | 55703 | clara_642 | https://127.0.0.1:3320 / 3321 / 3322 | ok 437s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 651 | C:\Users\zhant\Desktop\clara-wt\651 | impl/651-assets-depreciation | 55704 | clara_651 | https://127.0.0.1:3330 / 3331 / 3332 | ok 434s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 655 | C:\Users\zhant\Desktop\clara-wt\655 | impl/655-invoice-bill | 55705 | clara_655 | https://127.0.0.1:3340 / 3341 / 3342 | ok 434s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 656 | C:\Users\zhant\Desktop\clara-wt\656 | impl/656-opening-ledger | 55706 | clara_656 | https://127.0.0.1:3350 / 3351 / 3352 | ok 438s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 657 | C:\Users\zhant\Desktop\clara-wt\657 | impl/657-bank-existing-booking | 55707 | clara_657 | https://127.0.0.1:3360 / 3361 / 3362 | ok 434s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 658 | C:\Users\zhant\Desktop\clara-wt\658 | impl/658-knowledge-retrieval | 55708 | clara_658 | https://127.0.0.1:3370 / 3371 / 3372 | ok 437s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 659 | C:\Users\zhant\Desktop\clara-wt\659 | impl/659-firm-home | 55709 | clara_659 | https://127.0.0.1:3380 / 3381 / 3382 | ok 437s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |
| 660 | C:\Users\zhant\Desktop\clara-wt\660 | impl/660-dashboard-cash-profit | 55710 | clara_660 | https://127.0.0.1:3390 / 3391 / 3392 | ok 438s | 219 applied | ok (2 files) | 219 · 0224 · PG 17.11 |

All ten: install exit 0 (`CI=true pnpm install --frozen-lockfile --prefer-offline`), `pnpm db:migrate`
exit 0 (`219 new migration(s) applied · 219 total`), `pnpm db:seed` exit 0 (`0001_smoke_seed.sql`,
`0002_core_seed.sql`), smoke `select count(*) from clara.schema_migrations` = **219**, newest
`version` = `0224_preview_invite`, `server_version` = `17.11 (Ubuntu 17.11-1.pgdg26.04+2)`,
`clara%` roles = 18 on every cluster (fresh clusters; 0154's role census is honest).

Each cluster is its own PG17 instance in WSL (`rig<ticket>`), trust auth, reachable from Windows at
`127.0.0.1:<port>`, user `postgres`. No `psql` on Windows — use node + `pg` (e.g. from packages/db:
`node -e "const {Client}=require('pg'); (async()=>{const c=new Client({host:'127.0.0.1',port:PORT,user:'postgres',database:'DB'});await c.connect();const r=await c.query('select 1');console.log(r.rows);await c.end();})()"`).
`clara.schema_migrations` columns are `version, checksum, applied_at`.

## Your worktree
Your brief names a worktree path and a branch above. Work ONLY there, on ONLY that branch. Never
touch another ticket's worktree, cluster, or port. Dependencies are installed; if `node_modules`
is ever absent or corrupted, re-run `CI=true pnpm install --frozen-lockfile --prefer-offline` from
the worktree root (~7 min under ten-lane contention, ~4 min alone).

## PostgreSQL rig
Env for every db command/test (Bash form):
`export PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<db> CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`

(PowerShell form: `$env:PGHOST='127.0.0.1'; $env:PGPORT='<port>'; $env:PGUSER='postgres'; $env:PGDATABASE='<db>'; $env:CLARA_ALLOW_DESTRUCTIVE='1'; $env:CLARA_RIG_DB='1'`)

From your worktree root, `pnpm db:migrate` re-applies only pending files if you add a new
migration; `pnpm db:seed` is idempotent per the existing seed scripts.

NEVER run two from-scratch migration chains on ONE cluster (migration 0154 pins the cluster-wide
`clara%` role count) — each ticket already has its own dedicated cluster for exactly this reason.
If you must recreate YOUR cluster from scratch, run via the **PowerShell** tool (Bash mangles the
path unless you prefix `MSYS_NO_PATHCONV=1`):
`wsl -u root -- bash /mnt/c/Users/zhant/Desktop/clara-rebuild/docs/plan/active/refresh-wave-2026-09-18/mkrig.sh <yourClusterName> <yourPort>`
then `wsl -u root -- runuser -u postgres -- createdb -p <yourPort> <yourDb>`, then `pnpm db:migrate`
and `pnpm db:seed` from your worktree root with the PG env set. Use ONLY the cluster name/port/db
your brief assigned to you.

For the runtime World e2e legs set `WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/<db>`
beside the PG env. Bootstrapping a Workflow World on your db makes `rig-isolation.test.mjs` T10b
red afterwards (#866 — graphile_worker functions become PUBLIC-executable); if you need that cell
green after a World leg, clone a sibling database first
(`create database <db>_world template <db>` from a root connection with no other sessions open)
and point the World legs at the clone.

## Running tests
- NEVER set `CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1` on your cluster:
  `packages/db/tests/rig-isolation.test.mjs` (cell T19) and the upgrade drills then RESET the schema
  and re-migrate, which destroys your database and trips 0154's cluster-wide role-count pin. Run
  `rig-isolation.test.mjs` without those flags (its destructive cell skips).
- **db** (from packages/db): `node --test --test-concurrency=1 $GATES tests/<file>.test.mjs` where
  `$GATES` is the exact list of **40** `--import ./tests/*-preintegration-gate.mjs` flags from
  packages/db/package.json's `"test"` script (copy them verbatim; add your own gate to the chain in
  MIGRATION-NUMBER order, after `preview-invite-preintegration-gate.mjs`). Frontier-gated batteries
  SKIP (not fail) on a DB that lacks their migration — a skip is not evidence; a FOCUSED run of your
  own battery without its gate must FAIL loudly below its migration.
- **runtime unit** (from packages/runtime): `node --test tests/<file>.test.mjs`; the `*-db.test.mjs`
  files and the standalone World legs (`tests/*-e2e.mjs`) need the PG env + `WORKFLOW_POSTGRES_URL`.
- **web unit** (from apps/web): `node --import ./test/bootstrap.mjs --import tsx --test <file>`; every
  new test file MUST be listed in apps/web/test/manifest.txt (`pnpm --filter @clara/web lint` checks it).
- **web e2e** (Playwright; Chromium is installed; from the worktree root):
  `pnpm --filter @clara/web e2e <spec-name-substring>` builds Next then runs the matching spec(s)
  (several minutes). Set `CLARA_E2E_APP_ORIGIN=… CLARA_E2E_NEXT_PORT=… CLARA_E2E_RUNTIME_PORT=…` to
  YOUR triple from the table so parallel lanes don't collide. `npx playwright test` alone serves a
  STALE build (#865) — always go through `pnpm --filter @clara/web e2e`. OpenSSL comes from Git for
  Windows. `next build` may panic `0xc0000142` under ten-lane contention — retry once (#869).
- **typecheck / lint** (worktree root): `pnpm typecheck` (~4 min), `pnpm lint`. Both must be green
  before you hand back.

## Known Windows-only pre-existing reds you may ignore and must NOT "fix"
#707 (x56-rest-c shells out to grep), #693 (intake scanner EICAR fixture quarantined by Defender),
no `pg_dump` on PATH (four runtime files), `thread-live-clarify.test.tsx` load flake under the
whole-suite run (re-run alone and report both).

## House rules that bite
- Frozen workflow bodies and their import closure (see frozen-workflows.json,
  scripts/check-frozen-workflows.mjs) are never edited; a behaviour change ships as a new frozen
  version cut by the integration worker, or in non-frozen infrastructure. At base the frozen
  runtime libs are: `accrual-basis.ts`, `capability-registry.mjs`, `fixed-asset-acquisition.ts`,
  `knowledge-conflicts.mjs`, `knowledge.mjs`, `malaysian-registration.mjs`,
  `periodic-adjustment-basis.ts`, `staff-expense-claim-basis.ts`, `work-trace.mjs`.
- Migrations are append-only; never edit a merged migration. New SQL goes in ONE new file with the
  number your brief assigns (this wave starts at **0225**).
- Every new web test file → apps/web/test/manifest.txt. Every new user-facing string →
  apps/web/messages/en.json (message-key lint). Every RPC verb your e2e mock answers →
  apps/web/e2e/e2e-fixture-ownership.test.ts.
- Claims need evidence: a file path, a test name with its pass/fail output, or "unverified".

## Wave facts
- Free disk on C: after all ten rigs: **67 GB** (68 GB before). WSL: 24 GB RAM, 930 GB free.
- Windows free RAM during the ten parallel installs: ~8 GB of 32 — expect contention when many
  lanes build Next at once; the orchestrator caps concurrent browser stages.
