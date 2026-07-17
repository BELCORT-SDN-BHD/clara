# @clara/db — data plane

Versioned migrations, seeds (synthetic only), the ephemeral test rig, and the
DR backup/restore tooling. The shared Postgres is Clara's single source of
truth (`docs/architecture/ARCHITECTURE.md` §3).

> **Slice 1 scope.** This package contains the *pipeline*, not the real schema.
> The governed DB core (firms/RBAC/RLS, the four structural invariants, the
> balance trigger, money-as-cents) is **Slice 2** (`docs/plan/REBUILD-PLAN.md`).
> Migration `0001_smoke.sql` exists only to prove the pipeline runs end-to-end.

## Layout

```
migrations/NNNN_name.sql   numeric-ordered, immutable once applied
seeds/NNNN_name.sql        SYNTHETIC data only, idempotent
lib/pg.mjs                 env-only connection helper (no DSN in code/argv)
scripts/migrate.mjs        runner: applies pending migrations in a tx each; records sha256
scripts/seed.mjs           runner: applies seeds
scripts/reset.mjs          drops ONLY the `clara` schema
scripts/backup.mjs         pg_dump -> timestamped plain-SQL file
scripts/restore.mjs        psql apply of a dump file
scripts/dr-selftest.mjs    real dump+restore round-trip in a throwaway schema
tests/pipeline.test.mjs    migrate -> seed -> assert (node --test)
```

## Connecting (no secrets in code)

Connection comes from the environment only. Either export libpq vars or a DSN:

```sh
# libpq vars (REQUIRED for backup/restore — pg_dump/psql don't read a DSN)
export PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=postgres
# or a DSN for the node scripts (Supabase SESSION pooler, port 5432)
export DATABASE_URL=...
```

See `.env.example`. `.env` is gitignored; never commit a credential.

## Commands

```sh
pnpm --filter @clara/db migrate    # apply pending migrations
pnpm --filter @clara/db seed       # load synthetic seed data
pnpm --filter @clara/db test       # migrate -> seed -> assert (needs a DB)
pnpm --filter @clara/db reset      # drop the clara schema (scoped, safe)
pnpm --filter @clara/db backup     # pg_dump the clara schema
pnpm --filter @clara/db dr:selftest# exercise a full dump+restore round-trip
```

Root shortcuts: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`, `pnpm db:backup`.

## The migration runner contract

- Migrations apply in numeric filename order, each in its **own transaction**.
- Each applied migration's `sha256` is recorded in `clara.schema_migrations`.
- **Migrations are immutable**: editing an already-applied file trips a checksum
  drift error — add a new migration instead.
- `reset` drops only the `clara` schema. It never touches `public`, `spike`,
  `workflow`, `graphile_worker`, or any Supabase-managed schema. (On the shared
  project the Slice-0 spike still holds a live parked run in `workflow` /
  `graphile_worker` — this is why the pipeline is schema-scoped.)

## CI

CI applies every migration to a **throwaway `postgres:17` service container**
(never a live project), then runs the seed + smoke test against it. See
`.github/workflows/ci.yml` and the repo `README.md`.

## Typechecking

This package is intentionally plain ESM (`.mjs`) — no build step, runnable
directly by `node` in CI. It has no `tsc` typecheck; correctness is proven by
`tests/pipeline.test.mjs`. TypeScript packages (`@clara/runtime`,
`@clara/dashboard`) carry the `typecheck` gate.
