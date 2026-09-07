# Clara — agent entry point

Clara is an AI-native Accounting OS for Malaysian accounting firms. The agent and the human
work on the same auditable, tenant-isolated accounting state.

## The Harness menu — what you need, where the truth lives

| Question | Source |
|---|---|
| Users, vision, experience, product scope and acceptance | [PRD](docs/PRD.md) |
| Frontend/backend structure, boundaries, data flows and technical decisions | [Architecture](docs/ARCHITECTURE.md) |
|  The fastest and most efficient code intelligence engine for AI coding agents. Full-indexes an average repository in milliseconds | codebase-memory-mcp |

## Working protocol

1. Run `orchestrator-fable` for substantive work.
2. Ground with `codebase-memory-mcp`: list projects, query the relevant
   structure and check coverage. Read source for gaps, then the relevant document above.
3. Use `grilling` to settle ambiguity that changes product scope or acceptance before a non-trivial
   build. Look up repository facts directly; ask the owner about unresolved product decisions.
4. Check current official documentation, through Context7 or the vendor, before changing a stack
   integration. Installed versions and lockfiles describe this repository's dependencies.
5. Verify the affected behaviour and update its existing source of truth in the same change.
   Keep the current task's unresolved work actionable and distinguish local tests from hosted evidence.

## Hard constraints



## Clock in, clock out

**Clock in** — new or compacted session:


**Clock out** — before the session ends, and before any compaction:


## CI/CD



## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI (repo inferred from `git remote -v`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: a root `CONTEXT.md` plus `docs/adr/`, created lazily by the domain-modeling skill. See `docs/agents/domain.md`.


