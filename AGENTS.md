# Clara — agent entry point

<!-- ROUTER FILE. Keep it under ~180 lines and free of state: PROGRESS.md owns posture,
     the indexes own their own record lists. Every line here is either a constraint whose
     worst case is expensive, or a pointer. If a machine gate already enforces something,
     this file gets ONE pointer line — never a restatement of the rule.
     The skills toolchain is deliberately absent: the harness lists available skills itself. -->

Clara is an **AI-native Agentic Accounting OS for Malaysian accounting firms** — it runs the
lifecycle (onboarding → ongoing close → tax → reporting) under professional human control on
an RLS-isolated Postgres. **The DB owns every authoritative number; the agent orchestrates.**
The dashboard is not a form UI — it is the agent's body language.

**Read the fifteen hard constraints below before your first write.** Nothing else in this
repo outranks them.

## Run / verify

```sh
pnpm install
pnpm typecheck   # tsc across the TS packages
pnpm lint        # freeze-lint · leak-scan · wiki gates · binding post-control · harness-links · eslint
pnpm build       # nitro runtime + next dashboard
pnpm test        # per-package tests
```

The data plane runs its own pipeline against a **throwaway** Postgres — `pnpm db:migrate`,
`pnpm db:seed`, then `pnpm --filter @clara/db test`. The rig, the DR tooling and the reset
scoping are in `packages/db/README.md`.

## The menu — what you need, where the truth lives

| When you need | Read |
|---|---|
| Product law: what/why/scope, and the invariants that bind every feature | `docs/product/PRD.md` (**§6 is LAW**) |
| The bar the work is judged against, before you call something done | `docs/product/EVALUATION_RUBRIC.md` |
| Target architecture: event spine, the four structural invariants, runtime, reporting | `docs/ARCHITECTURE.md` (Appendix A = workflow versioning) |
| Why something is the way it is — decisions and the standing laws they minted | `docs/adr/README.md` — **read the digest first**; drill to the ADR only if the digest is thin |
| Where the work stands: posture, lanes, next, backlog, known issues | `PROGRESS.md` |
| A wave or slice plan, contract, design doc, or acceptance record | `docs/plan/index.md` |
| Design direction: the two-pane Agentic OS, typed `parts[]`, the card catalog | `docs/design/` |
| Live CODE structure — who calls what, where a route lives · **before you grep** | `docs/references/codebase-memory-graph.md` |
| Backup, restore, DR drill, readiness, SLO | `docs/ops/DR.md` |
| The CI runner: what it is, how to operate or decommission it | `docs/ops/ci-runner.md` (**private-repo only**) |
| Migrations, seeds, the test rig, DR tooling | `packages/db/README.md` |
| The durable runtime: workflows, pools, document intake, deploy | `packages/runtime/README.md` |
| What the prior build got wrong (11 failure patterns) and what was salvaged from it | `docs/audit/` |
| The ratified stack and the blueprint packet behind it | `docs/00-GATE-2-README.md` |
| Prior research: Malaysian tax/standards dossiers, evidence packages | `docs/phase2-research/` · `docs/plan/research/` |

## Hard constraints

These are the rules whose worst case is expensive — a wrong number in a client's books, a
leaked credential, a stranded run, a cross-tenant read. Everything else is judgement.

1. **Precedence on collision: accounting-correctness > backend contracts > design look and
   motion.** A design-vs-contract collision goes to the owner (Tao, tools@belcort.com) —
   never a unilateral call.
2. **The DB owns every authoritative number; the agent only orchestrates.** The model may
   propose or independently check a figure, but no model-generated numeral enters a durable
   artifact unless a versioned deterministic evaluator reproduces it from DB-owned inputs.
   Law: `docs/product/PRD.md` §6; the enforcement is structural, not prompt-level.
3. **`main` is PR-only.** A docs-only PR (zero code paths touched) takes the single-lane
   review; everything else takes the full ADR-061 ladder.
4. **Never commit a credential.** DSNs come from the environment only — never code, never
   argv. The leak-scan and gitleaks gates enforce it.
5. **Every dispatch pins an explicit `model`.** Omission silently inherits Fable, which is
   forbidden. Codex lanes are `gpt-5.6-sol`. Named and built-in Workflows count as dispatches.
6. **Grill until crystal-clear before a non-trivial build** (`/grillme`, as many rounds as it
   takes). Ambiguity is resolved before code, not during review.
7. **Query the codebase graph before you grep** — roughly 100× cheaper for where/what/
   who-calls; drill in with Read once it points you at a file. Manual:
   `docs/references/codebase-memory-graph.md`.
8. **The repo is the system of record and `PROGRESS.md` is the state authority.** Memory is a
   preferences-and-lessons cache, never a second copy of project state.
9. **Workflow bodies are immutable once deployed** — ship a behavioural change as a new `_vN`
   export and repoint the registry; never rename or delete an export with in-flight runs.
   Freeze-lint enforces it.
10. **DB changes are rig-validated on a throwaway, never hand-applied to a live project.**
    Migration numbers are claimed at MERGE time, not at authoring.
11. **The pinned ids are hard-blocked by a PreToolUse hook** — canary `daba7f2e` is NEVER
    answered (even past due), witness `d023b48c` is NEVER approved. See `.claude/hooks/`.
12. **ROME SECRETARY's customers are NAME-ONLY — never enrich them** with a registration
    number or a TIN. (A DB-side guard is a registered candidate; until it lands, this one
    rests on you.)
13. **Four firms, and they are not interchangeable:** **BELCORT** is the real, high-stakes
    firm (ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION — its sole proprietor is
    not an employee, his account is EQUITY) · **ROME PUBLIC ADVISORY** is the synthetic
    sandbox · **Alara** and **Borneo** are slice-era RLS fixtures. Never repurpose one.
14. **ADR-060's data authority is DATA-scoped and expires at beta.** Test data may be
    deleted, reseeded and re-run freely; the product's security mechanisms are the thing
    under test and are never weakened or bypassed for testing convenience.
15. **Never disturb the frozen prior build or the Slice-0 spike's parked run** (the
    `workflow` / `graphile_worker` / `spike` schemas).

## Working protocol

**Run the `orchestrator-fable` skill first on any substantive task.** You are the
orchestrator — plan, delegate, synthesize, verify, own the state. Workers are the hands:
native subagent lanes for bounded work, Codex for heavy implementation, debugging and
refactors. Delegate bounded work orders, inspect every result before accepting it, and run a
cross-model review before merging anything security-critical. *Codex lane, learned the hard
way:* the `codex:codex-rescue` companion queue is unreliable (it has stalled for hours at
"starting") — prefer a direct `codex exec` via Bash, backgrounded with a file-watcher on the
output, or a native subagent.

**Ground before you build.** On a new or compacted session, and before answering any
architecture question or changing code: query the graph for structure, then read the one menu
row that covers the question. A few targeted queries beat a fan-out.

**The three review and evidence laws** (minted 2026-08-06; each cost real money to learn):

1. **A PR that changes judgement logic gets an independent review pass before merge** — the
   author's own read is not sufficient. Judgement logic is code that decides *whether*
   something happened, is allowed, or succeeded: a guard, a disambiguation, a refusal branch.
2. **Absence is not evidence, and a derived state is not evidence.** Only what a read
   actually SAW counts as positive evidence; every absence and every derivation falls through
   to the fail-closed branch.
3. **Spelling is not identity.** A guard that reads a NAME reads a projection of the thing,
   not the thing — prove an identifier IS its import before trusting it.

Review intensity is **uniform** (ADR-061): the full ladder for every substantive change.
Law 1 is the floor, not the ceiling.

## Clock in, clock out

**Clock in** — new or compacted session:

1. Read `PROGRESS.md` — posture, live lanes, backlog.
2. Read the `docs/adr/README.md` digest.
3. Ground: a graph query plus the relevant menu row.
4. Recall memory for preferences and lessons (not state — see constraint 8).

**Clock out** — before the session ends, and before any compaction:

1. Update `PROGRESS.md`: posture, lanes, backlog.
2. Harness-sync sweep: anything stale in a menu file gets trued, or flagged under Known
   issues if truing it needs a decision.
3. Grill the owner on any ambiguity or foreign change you found and could not resolve.
4. Refresh memory — lessons and preferences only.
5. Re-index the codebase graph if code changed materially.

## CI/CD

CI is GitHub Actions on a **self-hosted WSL2 runner** (`clara-wsl`, labels
`self-hosted, linux, clara`) — the same workflows and the same binding green-check gate, on
our own hardware. It is **private-repo only**: if the repo is ever made public, decommission
the runner *first* (`docs/ops/ci-runner.md`). An offline runner makes jobs queue visibly; it
never lets one silently pass.

Every PR gets the lint job unconditionally, docs-only diffs included — freeze-lint,
leak-scan, gitleaks, the wiki dynamic-SQL gates, the vendor-binding post-control gate,
harness-links, eslint. A diff that touches code additionally gets typecheck, build, the
deploy-onto-existing check, and the full DB suite (migrate → seed → tests → the historical
upgrade drills → the DR round-trip) against a throwaway `postgres:17` service container. A
docs-only diff skips the code and DB legs by classifier, and a weekly scheduled sweep
re-proves every leg regardless.

**Ceremonies run from merged `main`, never from a branch.** A migration that replaces a live
writer's body needs a D1 write-quiesce window; the recipes live in `docs/ops/`.
