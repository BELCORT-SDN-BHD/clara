# Local rig for implementation workers (Windows host + WSL PostgreSQL 17)

Shell state does NOT persist between tool calls. Start EVERY Bash command with the PATH line below and `cd` to your worktree.

## Node 22 (required — the Windows default `node` is v20 and must not be used)
- Bash tool:        `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`   → `node --version` prints v22.23.2
- PowerShell tool:  `$env:PATH = "C:\Users\zhant\AppData\Local\pnpm;" + $env:PATH`
- pnpm 10.33.0 is on PATH already.

## Your worktree
Your work order names a worktree path and a branch. Work ONLY there. If `node_modules` is absent, run once from the worktree root:
`CI=true pnpm install --frozen-lockfile --prefer-offline`

## PostgreSQL rig (only if your order gives you a cluster port)
Clusters run inside WSL and are reachable from Windows at 127.0.0.1:<port>, user `postgres`, trust auth, no password. No `psql` exists on Windows; use node + `pg` (e.g. from packages/db: `node -e "const {Client}=require('pg');(async()=>{const c=new Client({host:'127.0.0.1',port:PORT,user:'postgres',database:'postgres'});await c.connect();await c.query('create database NAME');await c.end();})()"`).

Env for every db command/test (Bash form):
`export PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<db> CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`

From your worktree root: `pnpm db:migrate` then `pnpm db:seed`. A from-scratch chain (187 files) takes several minutes. After you add a migration, `pnpm db:migrate` applies only the pending file. NEVER run two from-scratch chains on ONE cluster (migration 0154 pins the cluster-wide `clara%` role count; the second chain fails). If you need a fresh cluster, run via the **PowerShell** tool (Bash mangles the path):
`wsl -u root -- bash /mnt/c/Users/zhant/AppData/Local/Temp/claude/C--Users-zhant-Desktop-clara-rebuild/44ef844d-9f8b-41a7-a79d-6ce16177a954/scratchpad/mkrig.sh <clusterName> <port>` — use ONLY the cluster name/port your order assigned to you.

## Running tests (single files while iterating; the full suite is the orchestrator's/CI's job)
- NEVER set `CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1` on your cluster: `packages/db/tests/rig-isolation.test.mjs` (cell T19) and the upgrade drills then RESET the schema and re-migrate, which destroys your database and trips 0154's cluster-wide role-count pin. Three workers lost their rig this way. Run `rig-isolation.test.mjs` without those flags (its destructive cell skips).
- **db** (from packages/db): `node --test --test-concurrency=1 $GATES tests/<file>.test.mjs` where `$GATES` is the exact list of `--import ./tests/*-preintegration-gate.mjs` flags from packages/db/package.json "test" (copy them verbatim). Frontier-gated batteries SKIP (not fail) on a DB that lacks their migration — a skip is not evidence.
- **runtime unit** (from packages/runtime): `node --test tests/<file>.test.mjs`; the `*-db.test.mjs` files need the PG env.
- **runtime standalone e2e** (real Postgres World; from packages/runtime after `pnpm --filter @clara/runtime build` at the worktree root): with the PG env plus `WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/<db>`, run `pnpm --filter @clara/runtime exec bootstrap` once per database, then e.g. `RELAY_TEST_MODE=1 node tests/work-journal-e2e.mjs` (see .github/actions/db-live-gates/action.yml for the exact invocations).
- **web unit** (from apps/web): `node --import ./test/bootstrap.mjs --import tsx --test <file>`; every new test file MUST be listed in apps/web/test/manifest.txt (`pnpm --filter @clara/web lint` checks it).
- **web e2e** (Playwright; Chromium is installed; from the worktree root): `pnpm --filter @clara/web e2e <spec-name-substring>` builds Next then runs the matching spec(s) (several minutes). Set `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:<p0> CLARA_E2E_NEXT_PORT=<p1> CLARA_E2E_RUNTIME_PORT=<p2>` to the port triple in your order so parallel lanes don't collide. OpenSSL comes from Git for Windows.
- **typecheck / lint** (worktree root): `pnpm typecheck`, `pnpm lint`. Both must be green before you hand back.

Known Windows-only pre-existing reds you may ignore and must NOT "fix": #707 (x56-rest-c shells out to grep), #693 (intake scanner EICAR fixture quarantined by Defender).

## House rules that bite
- Frozen workflow bodies (see frozen-workflows.json, scripts/check-frozen-workflows.mjs) are never edited; a behaviour change ships as a new frozen version or in non-frozen infrastructure.
- Migrations are append-only; never edit a merged migration. New SQL goes in ONE new file with the number your order assigns.
- Every new web test file → apps/web/test/manifest.txt. Every new user-facing string → apps/web/messages/en.json (message-key lint).
- Claims need evidence: a file path, a test name with its pass/fail output, or "unverified".
