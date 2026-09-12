# Fresh-machine checklist

For a Claude Code agent bootstrapping a clone of this repo from `main` to "all suites runnable,
hosted release runnable." Command-first; every claim cites the file it came from. Secrets: never
print values, only names (see §f).

## a. Toolchain

| Tool | Expected version | Pin location |
|---|---|---|
| Node | `>=22.11 <23`, exact `22.23.2` | `package.json:8-10` (`engines`); `.nvmrc`; `apps/web/package.json:6-11` `devEngines.runtime` |
| pnpm | `10.33.0` (`>=10` accepted) | `package.json:6` (`packageManager`), `:9` (`engines.pnpm`) |
| PostgreSQL | 17 server + client (`initdb`, `pg_ctl`, `psql`, `pg_dump`, `pg_dumpall`) | `packages/db/README.md:47-49` ("An older-major `pg_dump` refuses a newer server"); `packages/backup/.env.example` defaults `PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump` |
| Git | no version pinned in-repo | needed for `git archive origin/main` (§c) and worktree lanes |
| GitHub CLI (`gh`), authenticated | no version pinned | `docs/agents/issue-tracker.md:1-13`; run `gh auth login` once per machine |
| Fly CLI (`flyctl`) | no version pinned | `packages/runtime/README.md:220-238` (`fly deploy --config packages/runtime/fly.toml ...`) |
| Cloudflare Wrangler | `4.126.0`, pinned as a package dep — invoke via `pnpm --dir apps/web exec wrangler`, never global | `apps/web/package.json:57`; `apps/web/README.md:76-95` |
| Playwright browsers | `@playwright/test 1.62.1` | `apps/web/package.json:48`; install with `pnpm --filter @clara/web exec playwright install` (standard step, **not itself documented in-repo**) |
| WSL2 Ubuntu | one step only: building the Cloudflare Worker bundle needs a **Linux-native** `pnpm install` (`workerd` is platform-specific) | `apps/web/README.md:106-108` |
| Docker | **not required** for the four local suites (db, runtime unit, runtime e2e, web e2e) or the hosted release chain | only in-repo Docker use is CI's `packages/reporting-render` build/drill (`.github/workflows/ci.yml:141,146`); that package is excluded from the pnpm workspace (`pnpm-workspace.yaml:2-3`). Docker-in-WSL2 only needed to reproduce that one CI job locally. |

WSL also appears as a CI-runner platform and a Linux-only `/proc` test skip
(`scripts/ops/dsn-pipe.selftest.mjs:341-342`) — no action needed for those.

## b. Repository setup

```sh
git clone https://github.com/BELCORT-SDN-BHD/clara.git && cd clara
pnpm install --frozen-lockfile
```

Build order (`package.json:12-30`):

```sh
pnpm typecheck   # pnpm -r --if-present typecheck
pnpm lint        # frozen-workflow/evaluator/leak/wiki checks, then eslint, then per-package lint
pnpm build       # pnpm -r --if-present build (nitro for @clara/runtime; web build needs env, §c)
pnpm db:migrate  # -> pnpm --filter @clara/db migrate
pnpm db:seed     # -> pnpm --filter @clara/db seed
```

`packages/backup` and `packages/reporting-render` are **excluded** from the pnpm workspace on
purpose — separately-imaged Fly apps whose deps install inside their own Docker images
(`pnpm-workspace.yaml:1-25`, rationale in its comment block).

### Env files per package

Names only, copied from each `.env.example`; purposes condensed from that file's own comment.

**`apps/web/.env.example`**: `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-exposed Supabase config; build rejects a non-anon key), `CLARA_PUBLIC_ORIGINS` (accepted same-origin list), `CLARA_ALLOW_INSECURE_LOOPBACK` (test-only HTTP loopback), `SUPABASE_SERVICE_ROLE_KEY` (server-only, invite courier), `RESEND_API_KEY`/`INVITE_MAIL_FROM` (invitation mail), `CLARA_RUNTIME_URL` (same-origin runtime proxy target), `CLARA_RATE_WALL_PEPPER` (must match runtime's copy), `CLARA_TRUSTED_CLIENT_IP_HEADER` (trusted IP header name), `CLARA_AUTH_WALL_SERVICE_TOKEN` (bearer shared with runtime), `STRIPE_SECRET_KEY` (server-only, test key in beta), `CLARA_STRIPE_LIVEMODE` (declared mode, must agree with key class).

**`packages/db/.env.example`**: `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` (libpq vars, required for `pg_dump`/`psql`), `DATABASE_URL` (full DSN for node scripts; Supabase session pooler port 5432, not 6543), `PG_DUMP`/`PSQL` (override PATH binary).

**`packages/runtime/.env.example`** (not the full inventory — see `packages/runtime/README.md:57-68` for all seven DSN lanes): `PORT`, `WORKFLOW_TARGET_WORLD`, `CLARA_START_WORLD` (durable-world opt-in), `DATABASE_URL`/`WORKFLOW_POSTGRES_URL` (engine reads the latter), `CLARA_RUNTIME_DATABASE_URL`/`CLARA_READ_DATABASE_URL`/`CLARA_WRITE_DATABASE_URL` (dedicated login lanes, required at boot), `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` (tooling fallback), `CLARA_CHAT_MODEL`, `OPENAI_API_KEY`, `CLARA_AUTODRAFT_CATCHUP_SECONDS`/`CLARA_AUTODRAFT_RESERVE_TOKENS`, `SUPABASE_JWT_ISSUER`/`SUPABASE_JWT_AUD`/`SUPABASE_JWT_JWKS_URL`/`SUPABASE_JWT_SECRET` (JWT validation), `CLARA_RUNTIME_POOL_MAX`/`CLARA_READ_POOL_MAX`/`CLARA_WRITE_POOL_MAX`, `CLARA_DOC_EGRESS_APPROVED`, `AZURE_DI_ENDPOINT`/`AZURE_DI_KEY`, `CLARA_CLAMD_MIN_BACKOFF_MS`/`CLARA_CLAMD_MAX_BACKOFF_MS`/`CLARA_CLAMD_HEALTHY_RUN_MS`/`CLARA_CLAMD_SCAN_DEADLINE_MS`, `CLARA_STORAGE_URL`/`CLARA_STORAGE_ROLE`/`CLARA_STORAGE_ROLE_JWT` (restricted custody role, not `service_role`).

**`packages/backup/.env.example`** (not workspace-installed, §a): `DATABASE_URL`/`PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`, `CLARA_BACKUP_STORAGE_URL`, `CLARA_BACKUP_STORAGE_KEY_FILE` (mounted credential file), `CLARA_BACKUP_STORAGE_BUCKET`, `CLARA_BACKUP_R2_BUCKET`/`CLARA_BACKUP_R2_REMOTE`, `RCLONE_CONFIG`, `CLARA_BACKUP_AGE_RECIPIENTS_FILE`, `CLARA_BACKUP_PING_URL`/`CLARA_BACKUP_PING_URL_FILE`, `CLARA_BACKUP_STAGING_DIR`/`CLARA_BACKUP_RETENTION_DAYS`, `PG_DUMP`/`PG_DUMPALL`/`PSQL`.

### Where each secret NAME comes from (inferable from the example file or code)

- Supabase dashboard (Project Settings > API / Auth / Storage): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_*`, `CLARA_STORAGE_*` (the last also needs `packages/db/deploy/storage-provision.sql` run first, `packages/runtime/README.md:62-63`).
- Supabase "Connect > Session pooler" or a local disposable cluster (§c): `DATABASE_URL`, `PG*`, `CLARA_*_DATABASE_URL`.
- Vendor consoles: `RESEND_API_KEY` (Resend), `STRIPE_SECRET_KEY` (Stripe), `OPENAI_API_KEY` (OpenAI), `AZURE_DI_ENDPOINT`/`AZURE_DI_KEY` (Azure), R2 bucket/keys behind `CLARA_BACKUP_R2_BUCKET`/`RCLONE_CONFIG` (Cloudflare).
- Not vendor-issued, generated shared values that must match byte-for-byte across `apps/web` and `packages/runtime`: `CLARA_RATE_WALL_PEPPER`, `CLARA_AUTH_WALL_SERVICE_TOKEN`.
- `CLARA_BACKUP_STORAGE_KEY_FILE` — Supabase service key mounted as a file (Fly secrets mount); distinct from the runtime's restricted Storage role.
- `CLARA_BACKUP_AGE_RECIPIENTS_FILE` — generated locally (`age-keygen`); only the public recipients file ships.
- `CLARA_BACKUP_PING_URL(_FILE)` — a monitoring provider's ping endpoint, not further specified in-repo.

### Env-name diff found on this machine

Only `apps/web/.env.local` exists as an untracked `.env*` file (`find . -name ".env*" -not -path
"*/node_modules/*"`, confirmed gitignored by `.gitignore:6`). `packages/db|runtime|backup` have
none — they read ambient `PG*`/`DATABASE_URL` instead (`packages/db/README.md:35-38`).

Diffing names only (`grep -v '^#' <file> | grep '=' | cut -d= -f1`):

- In `.env.local`, not in `.env.example`: `NEXT_PUBLIC_CLARA_RUNTIME_URL`. **Not a gap** —
  `apps/web/README.md:72` and `apps/web/e2e/run.mjs:29-31` both say it's intentionally
  unsupported (same-origin proxy only); it's a stale value on this machine.
- In `.env.example`, not in `.env.local`: `CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_RATE_WALL_PEPPER`,
  `CLARA_STRIPE_LIVEMODE`, `CLARA_TRUSTED_CLIENT_IP_HEADER`, `STRIPE_SECRET_KEY` — gate
  checkout/confirm-wall; this machine's `.env.local` just hasn't configured that lane (the
  Playwright harness bakes its own throwaway values instead, so it needs none of these).

## c. Local verification recipe

**Disposable cluster** (`CLARA_ALLOW_DESTRUCTIVE=1` guard: `packages/db/README.md:40-42`;
`CLARA_RIG_DB=1` additionally gates a few dedicated-rig upgrade tests, e.g.
`packages/db/tests/wave-b/wb-0020-upgrade.test.mjs:38`):

```sh
initdb -D <dir> -U postgres -A trust -E UTF8 --locale=C
pg_ctl -D <dir> -o "-p <port> -c listen_addresses=127.0.0.1" -w start
psql -h 127.0.0.1 -p <port> -U postgres -c 'create database clara_ci'
export PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=clara_ci
export CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
```

This `initdb`/`pg_ctl` shape is operational practice, not a committed script (grep for
`initdb`/`pg_ctl` finds nothing outside comments/tests).

**Deploy-onto-existing** — proves HEAD's migrations apply onto an already-migrated, hosted-shaped
frontier, not just an empty database:

```sh
git archive origin/main -- packages/db/migrations | tar -x -C <tmp>
CLARA_MIGRATIONS_DIR=<tmp>/packages/db/migrations pnpm db:migrate
pnpm db:migrate   # HEAD's own chain, same DB
pnpm db:seed
```

`CLARA_MIGRATIONS_DIR` is real (`packages/db/README.md:61`); the `git archive` + two-pass shape is
practiced ceremony, not an in-repo script.

**Runtime unit suite** (`pnpm --filter @clara/runtime test`): run *without* `WORKFLOW_POSTGRES_URL`
but *with* `CLARA_ALLOW_DESTRUCTIVE=1` and `pg_dump` on PATH — some files assert no ambient DB
config (`packages/runtime/tests/l9-tls-ca.test.mjs:334-354`) while others clone an ambient
database via `pg_dump`/`psql` (`fs7-v17-chatturn-db.test.mjs:41,152,198`, using
`cloneAmbientDatabase` from `packages/db/tests/migrate-harness.mjs`, same destructive guard).

**Standalone runtime e2es**: `pnpm --filter @clara/runtime build` first, then
`WORKFLOW_POSTGRES_URL`, `RELAY_TEST_MODE=1`, and a loopback DB named `clara_wave_b_ci` or
`clara_rt_test` (hard-gated, e.g. `version-cutover-e2e.mjs:61,64`), bootstrapped with
`pnpm --filter @clara/runtime exec bootstrap` (bin confirmed present after install).
**Correction**: the CI wiring (`.github/actions/db-live-gates/action.yml:57-121`) runs *six*
standalone e2es on one rig — `interview-e2e.mjs`, `interview-kill-resume-e2e.mjs`, then
`version-cutover-e2e.mjs`, `work-journal-e2e.mjs`, `work-question-e2e.mjs`, `work-cancel-e2e.mjs`.
"Version-cutover first" is correct only for that trailing subset; the two interview e2es precede it.

**Web Playwright e2e** — only through the harness, never a bare `playwright test`:

```sh
pnpm --filter @clara/web exec playwright install   # once per machine
pnpm --filter @clara/web e2e
```

`apps/web/e2e/run.mjs:1-90` builds `@clara/web`, then runs Playwright with baked-in env
(mock Supabase URL, throwaway `CLARA_AUTH_WALL_SERVICE_TOKEN`/`CLARA_RATE_WALL_PEPPER`,
`STRIPE_SECRET_KEY` deliberately absent so checkout fails closed). Ports:
`CLARA_E2E_APP_ORIGIN` (default `https://127.0.0.1:3100`), `CLARA_E2E_NEXT_PORT` (`3101`),
`CLARA_E2E_RUNTIME_PORT` (`3102`, read by `chat-parity-mock.mjs:433`/`serve-built.mjs:75`). Not
run in CI (`.github/workflows/ci.yml` has no Playwright step) — a local quiet-host run is the
only browser evidence this repo has; don't run it alongside a db/runtime suite (contention causes
flakes/OOM per prior sessions — not itself citable to a file).

## d. Hosted release recipe

Runtime image (`packages/runtime/README.md:220-263`):

```sh
fly deploy --config packages/runtime/fly.toml --build-only --push --image-label refresh-<sha8>
```

Probe machine + DSN pipe for preflight and for a migration that recuts live writer bodies
(`scripts/ops/dsn-pipe.mjs:1-16`; ceremony narrated in `docs/PROGRESS.md:5`, not a runbook script):

```sh
fly ssh console -a clara-runtime --machine <probe> -q -C "sh -c 'printf %s \"$WORKFLOW_POSTGRES_URL\"'" \
  | node scripts/ops/dsn-pipe.mjs -- <migrate-or-psql-command>
```

Stop the writer machine first when a migration recuts live function bodies (writer-quiescence
rule, `packages/db/README.md:73-85`), apply, then:

```sh
fly deploy --config packages/runtime/fly.toml --image <verified-image-reference>
fly machine start <machine-id>   # a deploy onto a stopped machine leaves it stopped
```

Web build in a clean Linux clone + Wrangler upload (`apps/web/README.md:106-138`):

```sh
pnpm install --frozen-lockfile
pnpm --filter @clara/web cf:build   # NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + CLARA_BUILD_SHA at build time
pnpm --dir apps/web exec wrangler versions upload
pnpm --dir apps/web exec wrangler versions view <new-version-id>
pnpm --dir apps/web exec wrangler versions deploy <new-version-id>@100% --yes
```

Verify `/health`, `/ready` (`packages/runtime/README.md:97-140`), `/api/build-info`, then
`/login`, icons, and one changed behavior, on the production origin.

**Not verifiable against a repo file**: the `--image-label refresh-<sha8>` flag and the exact
probe/stop-machine sequencing live only in `docs/PROGRESS.md`'s release narrative and prior
session records, not a committed runbook — treat the shapes above as practiced procedure.

## e. Claude Code harness on this machine

Tracked: `.claude/skills/*`, `.claude/settings.json` (`.gitignore:49-51` ignores the rest of
`.claude/*`), `CLAUDE.md`, `AGENTS.md`, project `.mcp.json`.

`.mcp.json:1-19` (tracked) declares these servers — enable per-machine via `/mcp` or
`.claude/settings.local.json`'s `enabledMcpjsonServers`:

| Server | Type | Needs |
|---|---|---|
| `codebase-memory-mcp` | stdio, bare command | Must be on PATH — a **machine-local binary install**, not an npm package here (no in-repo install instructions). The reference machine runs the standalone binary `codebase-memory-mcp 0.10.8` from `%LocalAppData%\Programs\codebase-memory-mcp\`; install the same release on each new machine, then run `index_repository` once on the clone. Required by `AGENTS.md` step 1; referenced in `docs/ARCHITECTURE.md:6`. |
| `shadcn` | stdio, `pnpm --dir apps/web exec shadcn mcp` | Nothing extra once `pnpm install` has run |
| `cloudflare-api` | http | OAuth login per client (`apps/web/README.md:76-95`) |
| `mobbin` | http | OAuth login; Pro/Team/Enterprise plan (`apps/web/README.md:92`) |

`context7` and `github` are **not** in this project's `.mcp.json` — found instead at the user's
global `~/.claude.json` level (machine-local): `github` as a stdio server needing a
`GITHUB_PERSONAL_ACCESS_TOKEN` env var, `context7` as an installed Claude Code plugin. Neither
travels with `git clone`; configure both by hand on each new machine.

Auto-memory (`~/.claude/projects/<project>/memory/`) is machine-local and starts **empty** on a
fresh machine — none of the prior-session recipe knowledge travels automatically. This doc exists
so that knowledge doesn't have to live only there.

## f. Secrets transfer

Secrets are **not** in git — the repo is public, and `.gitignore:5-8` keeps every `.env*` file
(except `.env.example`) untracked. Carry real credentials machine-to-machine with
`scripts/dev/pack-secrets.sh` (source) and `scripts/dev/unpack-secrets.sh` (target). Both print
file **names** only, never contents; move the resulting archive over a channel you trust — these
scripts do not encrypt it.
