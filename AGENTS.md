# Clara — agent entry point

Clara is an AI-native Accounting OS for Malaysian accounting firms. The agent and the human
work on the same auditable, tenant-isolated accounting state.

## Harness menu

| Source | Responsibility | Read when |
|---|---|---|
| [PRD](docs/PRD.md) | Highest-level product blueprint: context, vision, users, problems, product behaviour, core journeys, scope, non-goals and success criteria | Understanding or changing what Clara should do and why |
| [Architecture](docs/ARCHITECTURE.md) | Highest-level technical blueprint: stack and rationale, system boundaries, module responsibilities, dependencies, data flows and tradeoffs; distinguish implemented state from accepted target | Understanding or changing how Clara works |
| codebase-memory-mcp | Searchable map of current code structure; verify coverage and read source for gaps | Locating implementation and checking technical claims |
| [Context](CONTEXT.md) | Shared accounting and product vocabulary | Naming concepts or resolving domain ambiguity |
| [PROGRESS](docs/PROGRESS.md) | Minimal session state: current commit, verification, active work, known blockers and next steps | Starting, resuming or handing off a session |

PRD and Architecture are the enduring human-readable sources of truth. GitHub specs describe a
particular delivery scope; tickets own its work, dependencies and completion evidence. Later accepted
decisions may supersede older specs: update the relevant blueprint instead of accumulating conflicting
instructions. Source code and deployment evidence establish what is actually implemented.

## Working protocol

1. Run `orchestrator-fable` for substantive work.
2. Ground with `codebase-memory-mcp`: list projects, query the relevant
   structure and check coverage. Read source for gaps, then the relevant document above.
3. Use `grilling` to settle ambiguity that changes product scope or acceptance before a non-trivial
   build. Look up repository facts directly; ask the owner about unresolved product decisions.
4. Check current official documentation, through Context7 or the vendor, before changing a stack
   integration. Installed versions and lockfiles describe this repository's dependencies.
5. After Wayfinder or to-spec settles a product or technical decision, update the relevant PRD or
   Architecture section before to-tickets. Mark accepted technical targets separately from current
   implementation. Resolve contradictions explicitly; keep detailed acceptance in the delivery spec.
6. Verify affected behaviour and update the relevant blueprint with implementation changes. Record
   completion evidence and remaining work on GitHub; distinguish local checks from hosted evidence.

## Session continuity

Start with the minimal state file, then read the active GitHub spec/tickets and relevant blueprint.
Before ending or compacting, replace that state with the current commit, actual verification results,
unfinished work and the next concrete action. Keep it brief; GitHub owns the delivery history and backlog.

## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI (repo inferred from `git remote -v`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: a root `CONTEXT.md` plus `docs/adr/`, created lazily by the domain-modeling skill. See `docs/agents/domain.md`.

