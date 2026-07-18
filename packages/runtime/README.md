# @clara/runtime — the durable chat runtime (Slice 4)

The long-lived Node service that hosts Clara. **Slice 4 lands the durable chat
runtime** on top of the Slice-0 substrate: the read-only chat advisor
(`chatTurn_v1`), leased clarify, the outbox drain, the settle-reconciler, and a
crash-only supervisor. Authority: `docs/plan/slice4-durable-runtime-contract.md`
v2.1; `docs/architecture/ARCHITECTURE.md` §4 + Appendix A; migration
`packages/db/migrations/0006_runtime_core.sql`.

## What is wired now

- **Durable substrate**: the Workflow DevKit Postgres world (`workflow` +
  `@workflow/world-postgres`, `ai@7.0.31`), built by Nitro with the
  `workflow/nitro` compiler module (Appendix A).
- **The chat loop** (`workflows/chatTurn.v1.ts` + its FROZEN closure
  `chatTurn.impl.ts` / `chatTurn.prompt.ts`): a read-only advisor that streams
  the model to the run's writable, reads the client context pack with a
  per-attempt wake credential (minted INSIDE the step, never crossing a step
  boundary), and parks on a hook when it needs a firm-visible clarify.
- **Two-login pools** (`lib/pools.mjs`): a `clara_runtime` pool + a read-only
  `clara_agent_ro` pool, txn-local GUCs, ROLLBACK-before-release,
  discard-on-any-connection-error (the P4 discipline).
- **Trusted-ingress authz** (`lib/authz.mjs`): pinned JWT + live-membership
  principal + own-OR-firm-shared session predicate (indistinguishable 404).
- **Control listener** (`lib/control.mjs`): leased clarify delivery + cancel
  settlement. **Leader loop** (`lib/leader.mjs`): routing + drain (`lib/drain.mjs`)
  + reconcile (`lib/reconciler.mjs`). **Supervisor** (`scripts/serve.mjs`):
  one crash-only process group.
- **HTTP** (`src/index.ts`): chat sessions/messages/turns, an SSE stream that
  survives detach, and `/health` + `/ready` (fail-vs-warn matrix, §4.7).
- **Workflow-versioning**: `registry.ts` names the newest version enqueue sites
  target; the CI freeze-lint golden-hashes every frozen body + its import
  closure. Prompt + tools live INSIDE the frozen closure by design (§4.9).

## The world is OFF by default

`plugins/startWorld.ts` starts the embedded queue worker **only** when
`CLARA_START_WORLD=1`. Default OFF so booting the skeleton for a health/ready
check never attaches a worker to the durable engine — important while the shared
project may hold parked runs from the Slice-0 spike.

## Commands

```sh
pnpm --filter @clara/runtime typecheck   # tsc --noEmit
pnpm --filter @clara/runtime build       # nitro build (compiles the WDK directives)
pnpm --filter @clara/runtime start       # boot the built server (reads .env if present)
```

For a health/ready check, boot with DB env set and `CLARA_START_WORLD` unset:

```sh
export PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=postgres PGPORT=5432
pnpm --filter @clara/runtime build && pnpm --filter @clara/runtime start
# GET http://localhost:3200/health  -> { ok: true }
# GET http://localhost:3200/ready   -> { ready: true, checks: { db: { ok: true }}}
```

## Versioning discipline (do not skip)

Per Appendix A, a deployed workflow body is immutable once any run can be in
flight. Never edit a `// @frozen` file — add `chatTurn.v2.ts` and repoint
`registry.ts`. Renaming/deleting an export with in-flight runs is forbidden
(the workflow name derives from path+export; a rename strands parked runs).

## Fly deploy runbook (contract §5 — gated by ruling 7)

Artifacts: `fly.toml` + `Dockerfile` (in this package). The deploy is a
single always-on, **non-HA** machine (contract §4.1) — the durable engine is
single-leader, so this app must never scale > 1.

### Prerequisites (do NOT deploy before these)

1. **Ruling 7 gate**: the Slice-0 48-hour park (`T2-48h`) is resumed + signed
   off (resume due ≥ 2026-07-19 15:15 +08), AND the owner has approved the
   spike-schema drop. Until then, build/test on local throwaways only.
2. A production Postgres reachable via a **SESSION-mode pooler** (port 5432 — the
   world needs `LISTEN/NOTIFY`, which transaction mode on 6543 drops).
3. `fly apps create <name>` and set `app = "<name>"` in `fly.toml`.

### One-time engine bootstrap (S4-V3)

Before the FIRST world start, the WDK engine schemas (`workflow` +
`graphile_worker`) must exist in the production DB. Run ONCE from a local clone
(the same `bootstrap` bin the Slice-0 spike used as `setup:engine`), pointed at
the prod pooler — it is idempotent:

```sh
WORKFLOW_POSTGRES_URL="<prod session-pooler DSN>" \
  pnpm --filter @clara/runtime exec bootstrap
```

### Operator DB step (out-of-band)

Migration `0006` creates `clara_runtime_login` + `clara_agent_read_login`
**NOLOGIN, no password**. Enable LOGIN + set a password for each out-of-band,
then hand those two credentials to the runtime as the DSN secrets below.

### Secrets (`fly secrets set` — NAMES only; never commit values)

- `OPENAI_API_KEY`
- `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUD`, and ONE of
  `SUPABASE_JWT_JWKS_URL` (asymmetric) or `SUPABASE_JWT_SECRET` (HS256)
- `WORKFLOW_POSTGRES_URL` (the world's DB — session pooler)
- `CLARA_RUNTIME_DATABASE_URL` (the `clara_runtime_login` DSN)
- `CLARA_READ_DATABASE_URL` (the `clara_agent_read_login` DSN)

`CLARA_START_WORLD=1` and `PORT` live in `fly.toml [env]`, not secrets. The
world runs ONLY in the deployed app.

### Deploy

From the **repo root** (so the Docker build context is the pnpm workspace root):

```sh
fly deploy --config packages/runtime/fly.toml
```

(Recommended: add a repo-root `.dockerignore` excluding `.git`, `node_modules`,
`**/.output`, `**/.env` to speed the context upload — it does not affect
correctness, since the Dockerfile copies source selectively.)

### Rollback preflight (§4.9 — BLIND REVERT FORBIDDEN)

Before any `fly releases`/rollback, confirm the target image **exports every
workflow name+version that has non-terminal runs**:

```sql
select name, count(*) from workflow.workflow_runs
 where status not in ('completed','failed','cancelled') group by name;
```

If the target image lacks a workflow that still has parked/running runs, a revert
would strand them — quiesce/drain those runs first, or do not roll back to it.

### First-deploy verification checklist

1. `GET /health` → 200; `GET /ready` → 200 with `checks.world.ok` +
   `checks.control.ok` + `checks.taxonomy.ok` all true.
2. One seeded-firm chat turn: `POST /api/chat/:sessionId/turns` (valid JWT) →
   202 `{task_id}`; the task reaches `completed` with an assistant message
   (typed parts) and non-zero recorded usage.
3. SSE detach/reattach: open `GET /api/tasks/:id/stream`, disconnect mid-stream,
   reattach → full replay from index 0 + a terminal `done` event.
4. Clarify on live: a turn that calls `clarify` parks (`awaiting_input`); answer
   it from the dashboard (`answer_interruption`) → the run resumes and settles.
