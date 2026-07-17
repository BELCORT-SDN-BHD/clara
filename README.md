# Clara

**AI-native Accounting OS for Malaysian accounting firms — greenfield rebuild.**

Clara runs the accounting lifecycle (onboarding → ongoing close → tax → reporting)
under professional human control, with a shared RLS-isolated Postgres as the
single source of truth. This repo is the rebuild from the Gate-1 audit + Gate-2
blueprint. **Product law → `docs/prd/PRD.md`. Target architecture →
`docs/architecture/ARCHITECTURE.md`. Plan → `docs/plan/REBUILD-PLAN.md`.**

> **Status: Phase 3, Slice 1 (foundations).** This is the repo scaffold, CI, and
> ops floor — *not* the product. The governed DB core is Slice 2; the durable
> runtime is Slice 4 (`docs/plan/REBUILD-PLAN.md`).

## The stack (ratified at Gate 2)

- **Data plane** — Postgres 17 on **Supabase**, forced RLS per `firm_id`,
  EXECUTE-only audited functions. The DB owns every number. Versioned migrations
  from day one (`packages/db`).
- **Runtime (Clara)** — **Vercel AI SDK 7 + Workflow DevKit** (`workflow` +
  `@workflow/world-postgres`), self-hosted on our own Postgres so every step is
  durably checkpointed; LangGraph JS is the named fallback behind a seam. Proven
  in the Slice-0 spike (`spike/`, `docs/architecture/ARCHITECTURE.md` Appendix A).
  `packages/runtime` is the Slice-1 skeleton (durable substrate + health/ready).
- **Dashboard** — **Next.js 15** on Vercel, dashboard-direct on the Supabase
  session JWT (`apps/dashboard`).

## Monorepo map

```
packages/db/          versioned SQL migrations + seeds + DR tooling + test rig
packages/runtime/     Clara agent-runtime skeleton (WDK durable substrate, /health, /ready)
apps/dashboard/       Next.js 15 dashboard skeleton
scripts/              repo governance: freeze-lint + leak-scan
docs/                 PRD, architecture, plan, design, audit (source of truth)
spike/                the frozen Slice-0 runtime spike (NOT a workspace member)
.github/workflows/    CI
frozen-workflows.json golden hashes for the workflow-versioning freeze-lint
```

## Develop

Requires **Node 20.19+**, **pnpm 10**, and a Postgres client (**v17** for DR
`pg_dump`). No Docker required for remote-DB work; local Supabase stack dev
(`supabase start`) needs Docker and is a follow-up.

```sh
pnpm install

# Point at a database via env (never commit credentials — .env is gitignored).
# libpq vars work everywhere (backup/restore REQUIRE them); or set DATABASE_URL.
export PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=postgres

pnpm typecheck                       # tsc across TS packages
pnpm lint                            # freeze-lint + leak-scan
pnpm build                           # nitro (runtime) + next (dashboard)

pnpm db:migrate && pnpm db:seed      # apply migrations + synthetic seed
pnpm --filter @clara/db test         # migrate -> seed -> assert
pnpm db:reset                        # drop the clara schema (scoped, safe)

pnpm --filter @clara/dashboard dev   # dashboard at http://localhost:3000
```

## How CI works (the anti-"misleading-green" gate)

The old build's CI tested a decommissioned schema — a green check that proved
nothing (audit GAP1-5). Ours (`​.github/workflows/ci.yml`) runs on every push +
PR and:

1. `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
2. **Freeze-lint** — golden-hashes every `// @frozen` workflow and fails if a
   frozen body changed (enforces the binding versioning policy, below).
3. **Leak-scan** — fails on any committed credential.
4. Spins up a **throwaway `postgres:17` service container** (never a live
   project), installs the v17 client, then **applies every migration + seed +
   smoke test** and runs the **DR dump/restore self-test** against it.

CI touches only a disposable container. It never connects to the real project.

## Workflow-versioning policy (do not skip)

The Slice-0 spike proved self-hosted WDK has **no run-pinning**: editing a
workflow body in place silently changes the semantics of every in-flight run.
So (ARCHITECTURE Appendix A): a deployed workflow body is **immutable** once any
run can be in flight — ship changes as a new `_vN` export and repoint the
registry; never rename/delete an export with in-flight runs. The freeze-lint
(`scripts/check-frozen-workflows.mjs` + `frozen-workflows.json`) enforces this in
CI.

## Ground rules

- **Never commit a credential.** `.env` is gitignored; only `.env.example`
  (placeholders) is tracked. The leak-scan gate enforces it.
- **`master` is PR-only** — land via PR with green CI.
- **The DB owns every number; the agent only orchestrates** (`docs/prd/PRD.md`).
- Full agent working guide: `CLAUDE.md`.
