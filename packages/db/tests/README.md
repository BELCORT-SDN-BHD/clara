# @clara/db tests — the ephemeral rig

Slice-1 scope is the **pipeline smoke test** only: `pipeline.test.mjs` runs
`migrate -> seed -> assert` against a real Postgres and proves the plumbing
works end-to-end.

The real **cross-firm isolation suite** (RLS + FORCE on every base table, the
SELECT-wrapped-writer negative path, provenance-mismatch RAISE, wake allowlists,
role floors) is **Slice 2** — PORT'd from the frozen build's `90-isolation-tests.sql`
and extended per the salvage manifest's hardening notes, and green before any
books table carries data (`docs/plan/completed/rebuild-plan-history.md` Slice 2;
`docs/audit/02-salvage-manifest.md`).

## Running

Needs a reachable database (env: PG* vars or `DATABASE_URL`).

```sh
# CI: a throwaway postgres:17 service container
# local: the remote project's SESSION pooler, then `pnpm db:reset`
pnpm --filter @clara/db test
```

The rig must always run against a **throwaway** or scratch target — never a live
project in CI. Locally, reset (`pnpm db:reset`) after running so the shared
project is left clean for Slice 2.
