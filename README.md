# Clara

An AI-native Accounting OS for Malaysian accounting firms: client onboarding, bookkeeping,
reconciliation, close, tax preparation and reporting, with Clara and the accountant sharing one
auditable workspace.

- [Product](docs/PRD.md) — vision, scope and what a complete experience means.
- [Architecture](docs/ARCHITECTURE.md) — how the frontend, agent runtime and database fit together.
- [Agent entry point](AGENTS.md) — repository working protocol.

## Develop

Use the Node version in `.nvmrc` and the pnpm version in `package.json`, then run
`pnpm install --frozen-lockfile`. Cloudflare packaging has a separate Node requirement documented
in the web README; pnpm provisions the web package's Node runtime automatically. Credentials come
from the environment; package examples list their names.

**A checkout's `node_modules` can go stale against `pnpm-lock.yaml` and look exactly like a code
defect (#1124).** Dependencies are installed once per checkout or worktree; if `pnpm-lock.yaml`
later gains a package — on `main`, or in an earlier commit on your own branch — that checkout does
not pick it up by itself. The symptom is a failure in code you never touched: `pnpm typecheck`
reporting `Cannot find module '<pkg>/<entry>'`, a test file reporting `Cannot find package
'<pkg>'`, or `next build` (so every browser walk) reporting `Module not found: Can't resolve
'<pkg>/…'`. Before treating a session's FIRST typecheck, lint, build or test failure as a real
defect, rule this out by running once from the repository root:
`CI=true pnpm install --frozen-lockfile --prefer-offline`. It adds nothing and changes no tracked
file when nothing was missing, and installs only what was missing when something was. There is no
cheaper check: the pinned pnpm predates `pnpm install --dry-run`, which landed in pnpm
[v11.8.0](https://github.com/pnpm/pnpm/releases/tag/v11.8.0) (2026-06-18). Five parallel lanes
each spent a cycle rediscovering this separately, which is why it is written here rather than in
any one wave's rig notes.

**A database that must serve World legs needs the Workflow DevKit's own `workflow` schema, and no
migration in this repository creates it (#1145).** Provision it once:
`pnpm --filter @clara/runtime exec bootstrap`, with `WORKFLOW_POSTGRES_URL` set. It is not an npm
script; it resolves to the dependency bin `@workflow/world-postgres/bin/setup.js`, which creates
`workflow.workflow_runs` and five sibling tables. Skip it and the runtime suite's DevKit-backed
cells do not fail — they SKIP, probing `to_regclass('workflow.workflow_runs')` and reporting the
same success either way, so a run missing the schema still reads green with nothing DevKit-backed
actually exercised: the riders sweep wave's integration merge lost 22 lane cells to exactly this
shape before a later gate provisioned the schema and ran them for real. Bootstrap a DISPOSABLE
database for this, never one other work depends on: bootstrapping a World reds
`rig-isolation.test.mjs` T10b afterward (#866).

| Component | Purpose | Setup and verification |
|---|---|---|
| `apps/web` | Next.js workbench and agent rail; Cloudflare Worker | [Web README](apps/web/README.md) |
| `packages/runtime` | Durable workflows, document processing, chat and event consumers | [Runtime README](packages/runtime/README.md) |
| `packages/db` | Postgres migrations, accounting contracts and disposable test rig | [DB README](packages/db/README.md) |
| `packages/reporting-render` | Separate deterministic report worker | [Renderer README](packages/reporting-render/README.md) |
| `packages/backup` | Separate encrypted off-site backup job | [Backup README](packages/backup/README.md) |

`pnpm typecheck` and `pnpm lint` run repository checks. Database integration tests require a
disposable database; follow the DB README before `pnpm test`. The standalone backup and renderer
packages are outside the pnpm workspace and have separate checks.

CI is defined in [ci.yml](.github/workflows/ci.yml). Passing repository checks proves the tested
source; hosted configuration and complete user journeys require their own evidence.
