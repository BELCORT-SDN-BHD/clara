# @clara/db — data plane

Versioned migrations, seeds (synthetic only), the ephemeral test rig, and the
DR backup/restore tooling. The shared Postgres is Clara's single source of
truth (`docs/architecture/ARCHITECTURE.md` §3).

> **Scope.** Slice 1 landed the *pipeline* (migration `0001_smoke.sql` — a
> placeholder that only proves the runner works end-to-end). **Slice 2** (`0002`–
> `0004` + seed `0002_core_seed.sql`) lands the **governed DB core**: the six
> `clara_*` roles, identity/RBAC, forced RLS with role-pinned read policies, the
> two-lane audited writers (human vs. wake — the agent can never sign), the four
> structural invariants, the balance/immutability/append-only triggers, and
> money-as-cents. See `docs/plan/REBUILD-PLAN.md`.
>
> **audit_log append-only — honesty boundary.** `clara.audit_log` is append-only,
> enforced by UPDATE/DELETE/TRUNCATE triggers so that no app role, agent, or even
> a SECURITY DEFINER bug can rewrite a receipt. This is defense in depth against
> *application-layer* tampering — **not** against a compromised database
> **superuser**, who can drop the trigger or the table and therefore sits outside
> the guarantee. That boundary belongs to the platform (Postgres role hardening,
> backups, DR), not to the schema.

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

## Deploy contract (writer-body migrations) — rule D1

A migration that **replaces the body of an audited writer** (e.g. `0005_event_spine`
rewrites every `clara.*` writer to append its `domain_events` row in the same
transaction) carries a deploy-time obligation once a **live runtime** exists:

> **D1 — write-quiesce.** Any migration that replaces writer function bodies
> **requires an application write-quiesce for its deploy window.** PostgreSQL runs
> each in-flight PL/pgSQL execution to completion on the body it **started** with, so
> a writer call that begins *before* the migration commits and finishes *after* it
> runs on the OLD body — it would skip the new behaviour (e.g. emit no event). Quiesce
> the writers (stop accepting new wake/human write RPCs, let in-flight ones drain),
> apply the migration, then resume.

This is **materially zero-risk today** — no runtime is deployed until Slice 4, and
CI / throwaway targets have no concurrent writers — so `0005` needs no special
handling now. The rule binds the first live deploy that ships a writer-body change.
(Design authority: `scratchpad/slice3-design.md` v2.1 §D1; the in-flight-body
behaviour is a PostgreSQL property, not a Clara mechanism.)

## CI

CI applies every migration to a **throwaway `postgres:17` service container**
(never a live project), then runs the seed + smoke test against it. See
`.github/workflows/ci.yml` and the repo `README.md`.

## Typechecking

This package is intentionally plain ESM (`.mjs`) — no build step, runnable
directly by `node` in CI. It has no `tsc` typecheck; correctness is proven by
`tests/pipeline.test.mjs`. TypeScript packages (`@clara/runtime`,
`@clara/dashboard`) carry the `typecheck` gate.
