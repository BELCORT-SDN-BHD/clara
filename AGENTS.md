# Clara — agent entry point

Clara is an **AI-native Agentic Accounting OS for Malaysian accounting firms** — it runs the
lifecycle (onboarding → ongoing close → tax → reporting) under professional human control on
an RLS-isolated Postgres. 

## Hard constraints


## The Harness menu — what you need, where the truth lives

| When you need | Read |
|---|---|
| 用户、问题、产品行为、核心体验、范围和完成条件 | `docs/product/PRD.md` |
| Live Codebase | codebase-memory-mcp |
| 技术栈及选择原因、系统边界、模块职责、依赖关系、主要数据流和关键技术取舍 | `docs/ARCHITECTURE.md` |
| Why something is the way it is — decisions and the standing laws they minted | `docs/adr/README.md` (the digest + its dated log, `docs/adr/README-log.md`) — **read the digest first**; drill to the ADR only if the digest is thin.|
| Migrations, seeds, the test rig, DR tooling | `packages/db/README.md` |
| The durable runtime: workflows, pools, document intake, deploy | `packages/runtime/README.md` |

## Working protocol

**Run the `orchestrator-fable` skill first on any substantive task.** 

**Ground before you build.** On a new or compacted session, and before answering any architecture question or changing code: query the graph for structure (the `codebase-memory-mcp` server, then read the one menu row that covers the question. A few targeted queries beat a fan-out.)

**/grlling until crystal-clear when encounter ambiguity or HAVNT hit allignment of comprehensive and vision in details of design and plan with user before a non-trivial build . Ambiguity is resolved before code, not during review.**

**Always query the newest, advanced, updated tech stack's official docs** like *Context7* or internet official sources before building or doing development, AVOID any stale standard or old docs being used or referred in development.

## Clock in, clock out

**Clock in** — new or compacted session:


**Clock out** — before the session ends, and before any compaction:


## CI/CD


## Agent skills

### Issue tracker

GitHub Issues, via the `gh` CLI (repo inferred from `git remote -v`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: a root `CONTEXT.md` plus `docs/adr/`, created lazily by the domain-modeling skill. See `docs/agents/domain.md`.
