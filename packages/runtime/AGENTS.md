# @clara/runtime — agent notes

The durable chat runtime: the Workflow DevKit Postgres world, the chat and autodraft workflows,
the consumer lanes, document intake, and the HTTP surface with `/health` + `/ready`. Full
reference: `README.md` here. Versioning mechanics: `.claude/rules/runtime-workflows.md`.

```sh
pnpm --filter @clara/runtime typecheck   # tsc --noEmit
pnpm --filter @clara/runtime build       # nitro build — this is what compiles the WDK directives
pnpm --filter @clara/runtime start       # boot the built server (port 3200)
```

`GET /health` then `GET /ready` is the smoke test; boot with the DB env set and
`CLARA_START_WORLD` unset.

## Hazards

- **The world is OFF by default** and should stay off locally. `CLARA_START_WORLD=1` attaches a
  worker to the durable engine, and the shared project may hold parked runs.
- **Never edit a `// @frozen` file** — add the next `_vN` and repoint `registry.ts`.
- **After any workflow-file edit, grep the built bundle for your change.** The WDK can swallow
  a directive silently; the source looks correct and the behaviour is simply gone.
- **A blind rollback is forbidden** — confirm the target image still exports every workflow
  name and version with non-terminal runs (README, "Rollback preflight").
- **Secrets are names only.** Credentials arrive via `fly secrets` or the environment; the
  README lists the names and never a value.
