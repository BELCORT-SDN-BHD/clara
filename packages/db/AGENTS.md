# @clara/db — agent notes

The data plane: versioned migrations, synthetic-only seeds, the ephemeral test rig, and the DR
backup/restore tooling. Full reference: `README.md` here. Authoring conventions:
`.claude/rules/db-migrations.md`.

```sh
pnpm --filter @clara/db migrate   # apply pending migrations, each in its own transaction
pnpm --filter @clara/db seed      # synthetic seed data
pnpm --filter @clara/db test      # migrate -> seed -> assert (needs a database)
pnpm --filter @clara/db reset     # drops ONLY the clara schema
```

Connection comes from the environment alone — libpq `PG*` vars, or `DATABASE_URL` for the node
scripts. `pg_dump` and `psql` do not read a DSN, so backup and restore need the `PG*` form.

## Hazards

- **Point at a throwaway, not live.** `reset` is scoped to the `clara` schema, but a `migrate`
  against the shared project is a real deploy with no confirmation step.
- **Applied migrations are immutable** — editing one trips checksum drift. Add a new file.
- **The Slice-0 spike's parked run lives in `workflow` / `graphile_worker` / `spike`.** `reset`
  never touches them, and neither do you.
- **This package is plain ESM (`.mjs`) with no `tsc` gate** — correctness is proven by
  `tests/pipeline.test.mjs`, so a green typecheck says nothing at all about it.
- **A writer-body migration owes a D1 write-quiesce window** at deploy once a live runtime
  exists (README, "Deploy contract").
