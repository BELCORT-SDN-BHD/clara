# @clara/runtime — agent-runtime skeleton

The long-lived Node service that will host Clara. **Slice 1 is the durable
substrate + health/ready only** — no agent/LLM logic yet. That is Slice 4
(`docs/plan/REBUILD-PLAN.md`; runtime requirements in
`docs/architecture/ARCHITECTURE.md` §4).

## What is wired now

- **Durable substrate**: the Workflow DevKit Postgres world (`workflow` +
  `@workflow/world-postgres`), built by Nitro with the `workflow/nitro`
  compiler module — the exact stack proven in the Slice-0 spike (Appendix A).
- **Health/ready probes** (`src/index.ts`):
  - `GET /health` — liveness (process up, no dependencies).
  - `GET /ready` — readiness: checks DB connectivity; returns **503** when the
    DB is unreachable so an orchestrator holds traffic. (GAP1-7 fix: readiness,
    not liveness-only.)
  - `GET /workflows` — the registered workflows (the versioning hook point).
- **Workflow-versioning policy hook point**: `workflows/` holds the frozen
  example (`closeExample.v1.ts`, marked `// @frozen`) and `registry.ts` names
  the newest version enqueue sites target. The CI freeze-lint
  (`scripts/check-frozen-workflows.mjs`) golden-hashes frozen bodies and fails
  on any change — enforcing the binding Appendix A policy.

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
flight. Never edit a `// @frozen` file — add `closeExample.v2.ts` and repoint
`registry.ts`. Renaming/deleting an export with in-flight runs is forbidden
(the workflow name derives from path+export; a rename strands parked runs).
