# Clara Slice-0 runtime spike

Minimal, deterministic TypeScript harness proving the **Workflow DevKit
durable engine** (`workflow` + `@workflow/world-postgres`) against **Supabase
Postgres**. **No model/LLM calls anywhere** - this tests the ENGINE
(durability / HITL / idempotency), per `docs/phase2-research/runtime-recommendation.md`
§6/§8 and `docs/plan/REBUILD-PLAN.md` Slice 0.

## Architecture (what actually runs)

One long-lived Node process (`.output/server/index.mjs`, built by Nitro with
the `workflow/nitro` compiler module) plays both roles:

- serves the engine's execution routes (`/.well-known/workflow/v1/{flow,step}`)
  plus this spike's control routes (`/demo/*`, `/health`), and
- runs the Postgres world's **embedded graphile-worker**, which claims jobs
  from `graphile_worker.*` and executes them by **loopback HTTP POST to
  itself** at `http://localhost:$PORT` (so `PORT` must match the listener).

All engine state (runs / events / steps / hooks / waits / stream chunks) lives
in the `workflow` schema of the DATABASE_URL database; the queue lives in
`graphile_worker`. The spike's domain tables live in the `spike` schema
(`schema.sql`). Kill the process at any point - state survives in Postgres.

## Setup

```powershell
pnpm install
Copy-Item .env.example .env    # paste the Supabase SESSION-mode (port 5432) connection string
pnpm setup                     # = setup:engine (workflow+graphile schemas) + setup:domain (schema.sql)
pnpm build                     # compile workflows + server
pnpm worker                    # terminal A: the long-lived worker
```

- **Supavisor SESSION mode only** (port 5432). Transaction mode (6543) drops
  LISTEN/NOTIFY and breaks the engine; `pnpm probe` (T5) verifies this.
- `pnpm setup:engine` runs the world's own idempotent bootstrap migration
  (the documented command is `pnpm dlx --package @workflow/world-postgres bootstrap`;
  as a direct dependency its `bootstrap` bin is on our path). It self-loads
  `.env` and reads `WORKFLOW_POSTGRES_URL` falling back to `DATABASE_URL`.
- The built server does NOT self-load `.env`, so `pnpm worker` runs
  `node --env-file=.env .output/server/index.mjs`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm build` | Nitro build (compiles `"use workflow"` / `"use step"`) |
| `pnpm worker` | Start the long-lived worker (env from `.env`) |
| `pnpm worker:fault` | Same, with `FAULT=kill-after-commit` armed (T4) |
| `pnpm enqueue [opKey] [amountCents]` | Start a `close-demo` run; prints runId + hook token |
| `pnpm resume <token> [--deny] [--approver <name>]` | Resume the parked approval hook |
| `pnpm status` | Dump engine + queue + domain state straight from Postgres (works with worker down) |
| `pnpm reset --yes` | Truncate domain + engine + queue tables (keeps migrations) |
| `pnpm unstick` | Release graphile job locks abandoned by a hard-killed worker (else: fixed 4h reclaim) |
| `pnpm probe` | T5: LISTEN/NOTIFY round trip over DATABASE_URL |
| `pnpm dryrun` | No-DB self-test of the harness on the Local World (see below) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm setup` / `setup:engine` / `setup:domain` | Engine bootstrap / domain schema.sql |

The test workflow (`workflows/closeDemo.ts`): step A `post_entry` inserts a
posting (idempotent `ON CONFLICT (op_key)`, returns the original row + a
`wasDuplicate` flag) and its receipt in ONE transaction, with a
`FAULT=kill-after-commit` seam that `process.exit(1)`s immediately after the
commit but before the step returns; then `await hook` parks for approval; then
step B `finalize` inserts a completion marker keyed to the run. A canary table
(`spike.step_invocations`) logs every step-body invocation so re-execution is
directly observable.

## Acceptance tests

`tests/acceptance.md` - T1 restart-under-parked-hook, T2 48h park (5-min
variant runnable now), T3 mid-run kill with zero re-execution, T4
kill-after-commit (the Codex-mandated idempotency test), T5 LISTEN/NOTIFY
through Supavisor session mode.

| Test | PASS criterion |
|---|---|
| T1 | After kill/restart/resume: completion row exists, postings(opKey)==1, post_entry invocations==1 |
| T2 | Same as T1 with >=48h parked and >=3 worker restarts in between (5-min variant now) |
| T3 | Replay completes with postings(opKey)==1 AND post_entry invocations==1 (zero re-execution) |
| T4 | EXACTLY ONE posting, the SAME single receipt, post_entry invocations==2, run completes |
| T5 | `pnpm probe` exits 0 (round-trip PASS) on session-mode DATABASE_URL |

## Pinned versions (2026-07-17, npm registry)

| Package | Version | Role |
|---|---|---|
| `workflow` | **4.6.0** | Workflow DevKit (directives, hooks, `workflow/api`) |
| `@workflow/world-postgres` | **4.3.0** | Self-hosted Postgres world (brings `graphile-worker@0.16.6`, `pg@8.20.0`, drizzle) |
| `nitro` | **3.0.260610-beta** | Build system + server (the official Express guide's path; `latest` on npm is this beta) |
| `express` | 5.2.1 | Control routes |
| `rollup` | 4.62.2 | Required alongside nitro per the guide |
| `pg` | 8.20.0 | Domain-table access in steps + operator scripts (matches the world's own pg) |
| `dotenv` | 17.3.1 | Env loading for tsx scripts |
| `typescript` / `tsx` | 5.9.3 / 4.23.1 | Typecheck / script runner (dev) |

Node on this machine: **v20.19.5** - fine: `graphile-worker@0.16.6` declares
`node >=14`. (The "Node 22.18+" note in the research doc tracks graphile-worker's
newer 0.17 line, which this pinned world does not use.)

## Verified here vs pending-DB

| Item | Status |
|---|---|
| `pnpm install` on this machine (Windows 11, Node 20.19.5, pnpm 10.33.0) | VERIFIED |
| `pnpm typecheck` | VERIFIED (clean) |
| `pnpm build` - workflow compiler accepts both directives, bundles server | VERIFIED |
| `pnpm dryrun` - full engine loop (start → step → **parked hook** → resume → completed run, correct return value) on the built output, Local World, zero external services | VERIFIED (PASS) |
| Engine bootstrap command exists, self-loads .env, falls back to DATABASE_URL | VERIFIED in package sources; **execution pending DB** |
| `schema.sql` apply, T1-T5 against Supabase | **PENDING DATABASE_URL** |
| Supavisor session-mode LISTEN/NOTIFY (T5) | **PENDING DATABASE_URL** (probe ready) |
| Connection budget / pool sizing under load (spike AC 7) | **PENDING DATABASE_URL** (world defaults: `queueConcurrency` 10 in this version, `maxPoolSize` 10; README of the world documents the knobs) |
| 4h stale-lock behavior + `pnpm unstick` mitigation | Mechanism VERIFIED in graphile-worker sources; live behavior **PENDING DB** |

`pnpm dryrun` deliberately strips `DATABASE_URL`/`WORKFLOW_TARGET_WORLD`/`FAULT`
from the child environment and runs the DB-free `pingDemo` workflow (same
step → hook → step shape) on the file-backed Local World - it can never touch
a real database.

## API surprises found (vs the runtime-recommendation's assumptions)

1. **Self-hosted has NO deployment pinning.** WDK docs now have a
   `foundations/versioning` page ("runs are pinned to the deployment that
   started them") - but `@workflow/world-postgres`'s `getDeploymentId()`
   returns the constant `'postgres'` (verified in dist): every run executes
   against whatever code currently serves the well-known routes, and
   `deploymentId: 'latest'` is an explicit no-op self-hosted. Consequences:
   (a) restarts/redeploys of the same workflow shape resume cleanly (good for
   T1-T4); (b) workflow-**name** versioning (`closeDemo_v2`) is OUR discipline,
   exactly as Codex Addendum 3 refinement 2 assumed; renaming a workflow
   strands its in-flight runs.
2. **The docs' Nitro plugin import path is stale.**
   `nitro/~internal/runtime/plugin` (postgres-world doc) does not exist in
   `nitro@3.0.260610-beta`'s exports map; the helper is `definePlugin`
   re-exported from the `nitro` root (see `plugins/startPgWorld.ts`).
3. **Job execution is loopback HTTP.** The embedded queue worker POSTs each
   workflow/step execution to `http://localhost:$PORT/.well-known/workflow/v1/*`
   (override: `WORKFLOW_LOCAL_BASE_URL`). `PORT` mismatch = a worker that
   claims jobs and cannot execute them. Also: the graphile runner start is
   deferred until the loopback target is reachable.
4. **Crash-lock reclaim is 4 hours, fixed.** graphile-worker 0.16.6 only
   frees locks abandoned by a dead worker via its periodic `resetLockedAt`
   (`locked_at < now() - interval '4 hours'`, not configurable), and the world
   adds no crash-unlock at startup. Hard-kill mid-step therefore stalls that
   job for up to 4h unless cleared - `pnpm unstick` is the spike instrument;
   a production deploy/restart story MUST address this (graceful drain, or an
   operational unstick step). Ctrl+C is graceful (locks released) - crash
   tests must use `taskkill /F`.
5. **The engine executes runs without any SSE/stream consumer attached**
   (dryrun proves it) - the ghost-upload class (failure pattern 5) is indeed
   structurally closed.
6. **Docs freshness:** `workflow@4.6.0` ships its authoritative docs inside
   the package (`node_modules/workflow/docs/`), including `foundations/versioning`
   and `foundations/idempotency` pages - the recommendation's "deploy docs are
   silent on in-flight runs" claim is now partially outdated (the gap that
   remains: no self-hosted pinning, per surprise 1).

## Layout

```
schema.sql                  domain tables (spike.*): postings, receipts, completions, step_invocations
workflows/closeDemo.ts      the close-demo workflow (step A -> hook -> step B)
workflows/steps.ts          post_entry (idempotent tx + FAULT seam), finalize
workflows/pingDemo.ts       DB-free twin used by pnpm dryrun
src/index.ts                Express control routes (enqueue/resume/run-status/health)
plugins/startPgWorld.ts     starts the world's embedded queue worker at boot
nitro.config.ts             workflow/nitro module + catch-all route to Express
scripts/*.ts                operator scripts (see table above)
tests/acceptance.md         T1-T5 procedures with expected observations
```
