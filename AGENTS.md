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

1. Ground to the codebase with `codebase-memory-mcp`. Use it to query anything for implementation or clarify.
2. Use `grilling` to settle ambiguity that changes product scope or acceptance before a non-trivial
   build. Look up repository facts directly; ask the owner about unresolved product decisions.
3. Check current official documentation, through Context7 or the vendor, before changing a stack
   integration. Installed versions and lockfiles describe this repository's dependencies.
4. Verify the affected behaviour and update its existing source of truth in the same change.
   Keep the current task's unresolved work actionable and distinguish local tests from hosted evidence.
5. After Wayfinder or to-spec settles a product or technical decision, update the relevant PRD or
   Architecture section before to-tickets. Mark accepted technical targets separately from current
   implementation. Resolve contradictions explicitly; keep detailed acceptance in the delivery spec.
6. Push back with real examples: When you push back or recommend, include one real practice close to the case — a 
   company, product, or method you actually know (Linear, Shape Up, Figma), or better, one you can point to (a Mobbin 
   screenshot, a documentation link). Never invent or embellish one: if you know no close example, say so and argue 
   from the Founder's own product instead. An example you cannot point to is labeled as recalled, not presented as 
   fact. 
7. Claims need evidence: Any statement about the state of the world ("the design system covers this", "this rule is 
   already enforced", "that was fixed") 
   must be backed by a checkable source: a file path, a commit, a test or command run, or a link. A real-world 
   anecdote is an argument (7.2), not evidence. 
   If you cannot point to a source, say "unverified" instead of asserting. No evidence, no claim.
8. Wayfinder or grillwithdocs session 的 map / specs 可以add "Milestone" in Github as a 版本控制, 版本控制型号可以在
   wayfinder和agent 一起讨论.
9. 当用户主动说" Idea session " , 这个时期讨论出来的东西可以 as "idea" and "need-triages" lable publish in GitHub 
   Issues.

## At session start (clock in)
1. Read PROGRESS.md for current state
2. Check to confirm repo is in consistent state
3. Grill user to whether to continue from PROGRESS.md "Next Steps" section.

## Before session end (clock out)
1. Update PROGRESS.md
2. Check to confirm consistent state
3. Commit all completed work
4. IF FOUND OUT edit that didint done by you , grill user to comfirm it as commit and merge to main.
5. Refresh codebase-memory-mcp of this project, ensure all local and github main is sync also.

## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI (repo inferred from `git remote -v`). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: a root `CONTEXT.md` plus `docs/adr/`, created lazily by the domain-modeling skill. See `docs/agents/domain.md`.

