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
