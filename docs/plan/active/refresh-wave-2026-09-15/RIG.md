# Local rig for implementation workers — wave 2026-09-15 (Windows host + WSL PostgreSQL 17)

Twelve isolated worktrees, each with its own PostgreSQL 17 cluster, so twelve implementers can work in
parallel without colliding. Base commit for every worktree: `4464e471` (origin/main at rig-build time).

Shell state does NOT persist between tool calls. Start EVERY Bash command with the PATH line below and
`cd` to your worktree.

## Node 22 (required — the Windows default `node` is v20 and must not be used)
- Bash tool:        `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`   → `node --version` prints v22.23.2
- PowerShell tool:  `$env:PATH = "C:\Users\zhant\AppData\Local\pnpm;" + $env:PATH`
- pnpm 10.33.0 is on PATH already.

## Rig table

| ticket | worktree | branch | port | db | install | migrate | seed | smoke |
|---|---|---|---|---|---|---|---|---|
| 625 | C:\Users\zhant\Desktop\clara-wt\625 | impl/625-membership-lifecycle | 55501 | clara_625 | ok 308.8s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 633 | C:\Users\zhant\Desktop\clara-wt\633 | impl/633-document-intake | 55502 | clara_633 | ok 308.6s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 638 | C:\Users\zhant\Desktop\clara-wt\638 | impl/638-staff-claim | 55503 | clara_638 | ok 310.1s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 639 | C:\Users\zhant\Desktop\clara-wt\639 | impl/639-asset-acquisition | 55504 | clara_639 | ok 312.3s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 646 | C:\Users\zhant\Desktop\clara-wt\646 | impl/646-document-correction | 55505 | clara_646 | ok 313.5s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 647 | C:\Users\zhant\Desktop\clara-wt\647 | impl/647-counterparty-identity | 55506 | clara_647 | ok 302.1s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 648 | C:\Users\zhant\Desktop\clara-wt\648 | impl/648-firm-setup | 55507 | clara_648 | ok 311.9s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 649 | C:\Users\zhant\Desktop\clara-wt\649 | impl/649-client-onboarding | 55508 | clara_649 | ok 312.3s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 650 | C:\Users\zhant\Desktop\clara-wt\650 | impl/650-client-home-work | 55509 | clara_650 | ok 239.1s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 652 | C:\Users\zhant\Desktop\clara-wt\652 | impl/652-accrual-adjustments | 55510 | clara_652 | ok 221s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 653 | C:\Users\zhant\Desktop\clara-wt\653 | impl/653-prepayment-amortisation | 55511 | clara_653 | ok 241.6s | 193 applied | ok (2 files) | 193, PG 17.11 |
| 654 | C:\Users\zhant\Desktop\clara-wt\654 | impl/654-firm-defaults | 55512 | clara_654 | ok 239.4s | 193 applied | ok (2 files) | 193, PG 17.11 |

All twelve: install exit 0, migrate+seed exit clean, smoke query returned `select count(*) from
clara.schema_migrations` = 193 and `select current_setting('server_version')` = `17.11 (Ubuntu
17.11-1.pgdg26.04+2)`.

**Note on the 193 figure**: this wave's brief expected "198 applied on a fresh cluster" — the actual
repo state at `4464e471` has exactly 193 `.sql` files in `packages/db/migrations` (confirmed via
`ls packages/db/migrations | grep -c .sql`), so 193 is correct for this commit; the 198 estimate was
stale. Not a rig defect.

Each cluster is its own PG17 instance in WSL (`rig<ticket>`), trust auth, reachable from Windows at
127.0.0.1:<port>, user `postgres`. No `psql` on Windows — use node + `pg` (e.g. from packages/db:
`node -e "const {Client}=require('pg'); (async()=>{const c=new Client({host:'127.0.0.1',port:PORT,user:'postgres',database:'DB'});await c.connect();const r=await c.query('select 1');console.log(r.rows);await c.end();})()"`).

## Your worktree
Your work order names a worktree path and a branch above. Work ONLY there, on ONLY that branch. Never
touch another ticket's worktree, cluster, or port. Dependencies are already installed
(`CI=true pnpm install --frozen-lockfile --prefer-offline`, verified via `node_modules/.pnpm` present and
`pnpm --filter @clara/db exec node -e "require('pg')"` succeeding in every worktree); if `node_modules`
is ever absent or corrupted, re-run that command from the worktree root (~4–5 min).

## PostgreSQL rig
Env for every db command/test (Bash form):
`export PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<db> CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`

(PowerShell form: `$env:PGHOST='127.0.0.1'; $env:PGPORT='<port>'; $env:PGUSER='postgres'; $env:PGDATABASE='<db>'; $env:CLARA_ALLOW_DESTRUCTIVE='1'; $env:CLARA_RIG_DB='1'`)

Migrate+seed already ran once during rig setup (193 migrations, 2 seed files, per ticket above). From
your worktree root, `pnpm db:migrate` re-applies only pending files if you add a new migration;
`pnpm db:seed` is idempotent per the existing seed scripts.

NEVER run two from-scratch migration chains on ONE cluster (migration 0154 pins the cluster-wide
`clara%` role count) — each ticket already has its own dedicated cluster for exactly this reason, so you
should never need to. If you must recreate YOUR cluster from scratch, run via the **PowerShell** tool
(Bash mangles the path):
`wsl -u root -- bash /mnt/c/Users/zhant/Desktop/clara-rebuild/docs/plan/active/refresh-wave-2026-09-15/mkrig.sh <yourClusterName> <yourPort>`
— use ONLY the cluster name/port your order assigned to you (see the table above), then re-run
`pnpm db:migrate` and `pnpm db:seed` from your worktree root with the PG env set.

## Running tests
- NEVER set `CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1` on your cluster:
  `packages/db/tests/rig-isolation.test.mjs` (cell T19) and the upgrade drills then RESET the schema and
  re-migrate, which destroys your database and trips 0154's cluster-wide role-count pin. Run
  `rig-isolation.test.mjs` without those flags (its destructive cell skips).
- **db** (from packages/db): `node --test --test-concurrency=1 $GATES tests/<file>.test.mjs` where
  `$GATES` is the exact list of 28 `--import ./tests/*-preintegration-gate.mjs` flags from
  packages/db/package.json's `"test"` script (copy them verbatim). Frontier-gated batteries SKIP (not
  fail) on a DB that lacks their migration — a skip is not evidence.
- **runtime unit** (from packages/runtime): `node --test tests/<file>.test.mjs`; the `*-db.test.mjs`
  files need the PG env above.
- **web unit** (from apps/web): `node --import ./test/bootstrap.mjs --import tsx --test <file>`; every
  new test file MUST be listed in apps/web/test/manifest.txt (`pnpm --filter @clara/web lint` checks it;
  both `apps/web/test/manifest.txt` and `apps/web/test/bootstrap.mjs` confirmed present).
- **web e2e** (Playwright; Chromium is installed; from the worktree root):
  `pnpm --filter @clara/web e2e <spec-name-substring>` builds Next then runs the matching spec(s)
  (several minutes). Set `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:<p0> CLARA_E2E_NEXT_PORT=<p1> CLARA_E2E_RUNTIME_PORT=<p2>`
  to the port triple your order assigns so parallel lanes don't collide. OpenSSL comes from Git for
  Windows.
- **typecheck / lint** (worktree root): `pnpm typecheck`, `pnpm lint`. Both must be green before you hand
  back.

### Toolchain proof (ticket 625 only, as the wave-wide sanity check)
`pnpm typecheck` from `C:\Users\zhant\Desktop\clara-wt\625`: **exit 0**, duration **218s** (~3.6 min).
Output: `packages/runtime typecheck: Done`, `apps/web typecheck: Done` (3 of 4 workspace projects have a
typecheck script; the 4th has none). Full log:
`C:\Users\zhant\AppData\Local\Temp\claude\C--Users-zhant-Desktop-clara-rebuild\4971863d-e46e-4ef5-b227-a48d393cd771\scratchpad\rig\typecheck-625.log`
(scratchpad only — not part of this repo).

## Known Windows-only pre-existing reds you may ignore and must NOT "fix"
#707 (x56-rest-c shells out to grep), #693 (intake scanner EICAR fixture quarantined by Defender).

## House rules that bite
- Frozen workflow bodies (see frozen-workflows.json, scripts/check-frozen-workflows.mjs) are never
  edited; a behaviour change ships as a new frozen version or in non-frozen infrastructure.
- Migrations are append-only; never edit a merged migration. New SQL goes in ONE new file with the
  number your order assigns.
- Every new web test file → apps/web/test/manifest.txt. Every new user-facing string →
  apps/web/messages/en.json (message-key lint).
- Claims need evidence: a file path, a test name with its pass/fail output, or "unverified".

## Wave facts
- Free disk on C: after all twelve rigs (worktrees + node_modules + PG clusters): **47 GB** (was ~52 GB
  before the wave started; 450 GB total, 90% used).
- All twelve worktrees are at commit `4464e471` on their assigned `impl/<ticket>-<slug>` branch, created
  fresh from `origin/main` (confirmed via `git worktree list`).
- Deviations from the original plan (see "Deviations" in the rig-builder's final report to the
  orchestrator): the PowerShell migrate-launcher scripts had to be regenerated once — a first pass
  generated via a Bash heredoc mis-rendered the `-Root` path (a `$t` variable leaked through unexpanded)
  and used a Unix-style `/c/...` path for the log file that PowerShell resolved relative to the current
  drive root instead of as an absolute path. Both were caught before any migration ran against the wrong
  target (the very first run only mis-resolved paths and failed fast on a missing `package.json`; no rig
  data was affected) and fixed by generating the twelve scripts natively in PowerShell instead of via
  Bash string interpolation. All twelve rigs above reflect the corrected, verified run.
