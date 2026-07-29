# Clara — agent guide

Clara is an **AI-native Accounting OS for Malaysian accounting firms** (greenfield
rebuild). It runs the accounting lifecycle — onboarding → ongoing close → tax →
reporting — under professional human control, with a shared **RLS-isolated
Postgres as the single source of truth**. This is a fresh harness; the frozen
prior build and its `belcort/` doctrine are **not** carried over wholesale — the
domain gold is extracted deliberately per `docs/audit/02-salvage-manifest.md`.

## Where the truth lives (read the relevant row before acting)

| Need | Source of truth |
|---|---|
| Decisions (append-only ADRs) + open items | `docs/PROJECTLOG.md` (START HERE block); ADR-001..021 in `docs/PROJECTLOG-ARCHIVE-ADR-001-021.md` |
| Live CODE structure (functions, callers, routes) | **codebase-memory graph — query it, don't grep** (`get_architecture` / `search_graph` / `trace_path`; re-index after big changes) |
| What / why / scope · product invariants (LAW) | `docs/prd/PRD.md` |
| Target architecture (event spine, structural invariants, runtime, reporting) | `docs/architecture/ARCHITECTURE.md` |
| Phase 3–5 plan (vertical slices, gates, verification) | `docs/plan/REBUILD-PLAN.md` |
| Design direction (two-pane Agentic OS, typed parts[], card catalog) | `docs/design/DIRECTION.md` |
| Gate-1 audit (11 failure patterns, salvage manifest, rulings) | `docs/audit/` |
| Gate-2 blueprint packet (ratified stack) | `docs/00-GATE-2-README.md` |
| Runtime spike results + BINDING workflow-versioning policy | `docs/architecture/ARCHITECTURE.md` Appendix A · `spike/RESULTS.md` |
| DR / backup / readiness / SLO | `docs/ops/DR.md` |
| Data plane (migrations, seeds, DR, rig) | `packages/db/README.md` |
| Runtime skeleton (durable substrate, health/ready) | `packages/runtime/README.md` |

## Cardinal invariants (never violate — full set in `docs/prd/PRD.md`)

- **The DB owns every number; the agent only orchestrates.** Book writes go
  through named, audited Postgres functions — never hand-write a row when a
  function exists. The agent never *computes* a figure.
- **Four structural invariants** (ARCHITECTURE §0/§3.3), enforced in the DB, not
  by model discipline: client attribution (`assert_client_resolved` ≥0.95),
  provenance binding (`source_doc_sha256` + `document_id` validated in-txn), wake
  authority (per-wake allowlist), write authorization (structural read-only agent
  role — a `select approve_entry(...)` fails at the role level).
- **Precedence on collision:** accounting-correctness > backend contracts >
  design look/motion. On a design-vs-contract conflict, clarify with the owner
  (Tao, tools@belcort.com) — don't pick a side.

## Working protocol (always run the `orchestrator-fable` skill FIRST)

- ***MOST IMPORTANT***:
  - **Orchestrate via the `orchestrator-fable` skill.** The main model is the **orchestrator** (plan, delegate, synthesize, verify, own state); **workers** are the hands — Claude native subagent lanes, or Codex for heavy implementation/debugging/refactors — **every dispatch lane carries an explicit `model` override;** Delegate bounded work orders, inspect every worker result before accepting it, and run cross-model review before merging security-critical work. **Codex lane caveat (learned):** the `codex:codex-rescue` companion queue is unreliable (it has stalled for hours at "starting"); prefer a **direct `codex exec` via Bash** (background + a file-watcher on the output) or a **native subagent** — both have been reliable. 

- **Never Blindly dispatch the main model.** Every subagent/workflow/teammate dispatch carries an explicit `model`; ***omission silently inherits Fable, which is forbidden.*** Codex lanes stay `gpt-5.6-sol`.
- **Ground before building.** On a new or compacted session, before answering an architecture question or changing code: **query the codebase-memory graph first** for structure, and read the relevant harness row above. For substantial, opt-in-scale work a grounding fan-out (Workflow) can help — but a few targeted graph queries + reads usually suffice.
- **Query the graph, don't grep.** The codebase-memory graph is the first stop for "where / what / who-calls" questions (~100× cheaper than file-by-file reading). Use Grep/Read to drill into the specific file the graph points you at. Re-index after big code changes. *(stdio MCP, project-scoped in `.mcp.json`.)*
- **Keep the harness fresh — each artifact for its purpose (before compact / refresh).** Check all the harness status and related docs is sync and refreshed with newest project state like **prd, rebuildplan, projectlog.......etc** , housekeeping anything that is stale or wrong/outdated, its for avoid the project's state, plan, decision, log 's pollution. and also refresh/update the memory record. (btw tidy up the loooong project log. make sure no context pollute in there and make sure claudemd is clean.)Always remember to refresh codebase-mcp and Do a harness-refresh pass before compacting a long session.
- **Grill until crystal-clear.** For any non-trivial plan, bug fix, or feature, use the **`grilling` skill (`/grillme`)** to interview the owner — as many rounds as it takes until the plan is unambiguous and aligned. Resolve ambiguity before writing code.
- **`main` is PR-only** — land via PR with green CI (never push `main`). Free-tier
  branch protection is not platform-enforced, so the git-base freeze-lint + CI are
  the real gate — treat them as binding.
- **Never commit a credential.** `.env` is gitignored; only `.env.example`
  (placeholders) is tracked. Connections come from the environment (libpq PG*
  vars or `DATABASE_URL`) — never a DSN in code or argv. The leak-scan gate
  (`scripts/check-leaks.mjs`) enforces this.
- **Workflow bodies are immutable once deployed** (ARCHITECTURE Appendix A): ship
  a behavioural change as a new `_vN` export and repoint `workflows/registry.ts`;
  never rename/delete an export with in-flight runs. The freeze-lint
  (`scripts/check-frozen-workflows.mjs`) enforces this — regenerate the manifest
  only via `pnpm freeze:update` when adding a brand-new frozen workflow.
- **DB changes are rig-validated, never hand-applied to a live project blindly.**
  Validate migrations on a throwaway Postgres (CI's `postgres:17` service, or a
  scratch schema) before anything live. Slice 1's pipeline is schema-scoped to
  `clara`; `db:reset` drops only that schema.
- **Keep the shared spike state safe.** The Slice-0 spike left `workflow` /
  `graphile_worker` / `spike` schemas on the project with a **live parked run**.
  Never start the WDK world against the shared project casually, and never drop
  those schemas.

## Boundaries

- ✅ **Always** run `pnpm typecheck` / `pnpm build` (and the DB smoke test where
  relevant) before declaring done; reverse-not-delete for posted entries; keep
  one audited function per mutation class; validate `db` changes on a throwaway.
- ⚠️ **Ask the owner first:** any design-vs-contract collision; deleting/
  overwriting files you didn't create; a genuinely destructive/irreversible op
  (a DROP on shared state, a data delete, a project teardown).
- 🚫 **Never:** compute a financial number in the agent/UI (the DB owns it);
  hand-write a books row when an audited fn exists; push to `main` directly;
  commit a secret; disturb the frozen prior project/repo or the spike's parked run.
- **All dispatch lanes get explicit model overrides, FORBID to use model `fable` as lane's model.**

## Dev toolchain (skills)

The engineering skill set (mattpocock/skills + repo-authored) is vendored under
`.claude/skills/` and **tracked in git** — available in every session. Key ones:
**`orchestrator-fable`** (the session workflow), **`grilling`** (`/grillme` —
interview the owner to kill ambiguity before building), **`handoff`** (a clean
continue-prompt for a fresh session), **`code-reviewbymatt`** (the review
standards/spec bar; the built-in `/code-review` remains the native review lane),
**`tdd`**, **`research`**, **`diagnosing-bugs`**, **`codebase-design`**, **`qa`**.
Per-repo skill config (issue-tracker → `BELCORT-SDN-BHD/clara`, triage labels,
the domain-doc map) lives in `docs/agents/`.

## Where we are

Current phase/slice **status lives in memory** (`project-clara-rebuild-state`,
read-first) **+ `docs/plan/REBUILD-PLAN.md`** — refreshed each slice so this file
stays stable. (`docs/PROJECTLOG.md` is **decisions-only**, not a status home.)

**Phase 4 — pre-Wave-C SETTLEMENT PROGRAM EXECUTED (ADR-048/049, 2026-07-28).** The waves:
**A** (daily AP loop) LIVE — ADR-022..024 · **A2** (sales/AR + MyInvois + SST 3-leg) LIVE —
ADR-025..027 · **A2.1** CLOSED — ADR-028..030 · **B** (knowledge + onboarding) CLOSED on
intent — ADR-044..046 · **the extraction slice** CLOSED — ADR-047/048 (`corroborated` =
explicit two-reader agreement; confidence GONE).

**LIVE POSTURE: 34 migrations (`0035`) · Fly `clara-runtime` v38 · FOUR firms** (BELCORT —
real, 3 clients, **high-stakes RM100,000** ADR-044 · ROME PUBLIC ADVISORY `39008536` = the
Gate-S synthetic sandbox, RM10k default · Alara Advisory + Borneo Books = slice-era RLS
fixtures, never repurpose) **· dashboard Pages `app.clarabook.com`** (must set
`NEXT_PUBLIC_CLARA_RUNTIME_URL=https://clara-runtime.fly.dev`) **· `clara-backup` daily.**
No migration queued.

**THE FIRST PRODUCTION AUTOPOST IS DONE (ADR-050, 2026-07-29 08:20:47 UTC):** entry
`f65eba11` · rule `90a07e89` · RM350 · 38 seconds PDF→posted, unattended, every step
receipted incl. the draft+post-phase binding resolutions. The full authority chain is
production-proven: two-reader corroboration → the owner's sighting floor → the signed rule →
the signed vendor binding `d871c50c` (F1 LCP `ez 易计 ezaccount` · F2 `ezsec-iv-00` ·
registration pinned · expires 2027-07-29) → the unified lane → autoDraft v5 (SST-zero =
2-leg, owner-precedent-ruled) → `execute_rule_post`. Six firings; every prior refusal was a
real control or real defect, none worked around. **Standing law: migration numbers are
claimed at MERGE time** (the deploy-onto-existing frontier check enforces).

**Settlement scoreboard (ADR-049; receipts `~/.clara-tools/captures/` + `docs/plan/research/`):**
Gate **L** CLOSED (labelled synthetic, PR #127 — the 0017 `contradiction` detector's first
coverage; citation producers owe ONE canonical `detail.value` encoding per `subject_key`) ·
**XG3** CLOSED live (corroborated population 0→9; the §12.2 prediction held exactly) · Gate
**S** CLOSED (labelled synthetic, Rome only — XML→facts→structured corroboration→signed
rule→the **first `execute_rule_post` ever, unattended**; the first PRODUCTION autopost is a
distinct open claim) · **K-doc producer** BUILT (#126, synthetic) · **0024/0025** (claim-secret
classify settle · receipt auto-routing) + **0026** (lane-widened keys · the filed-bootstrap
door) DEPLOYED via 5- and 3-round ladders · consent/wiki synthesis ACTIVATED · `interview_v2`
live (manifest 80/80).

**Autopost law (ADR-049/050):** the vendor-binding design v4.1 is BUILT AND LIVE
(`docs/plan/autopost-vendor-binding-design.md` + `-part2.md` are the mechanism of record);
hand-drafts are never autopost-eligible BY DESIGN; **autopost-from-seeding stays REFUSED**
(WB-R2/ADR-046) — posting authority comes from verified in-system approvals only.

**The closing batch is DONE (2026-07-29, PRs #143/#144 + the v38 ceremony):** migration
0035 (the counterparty-less-approval advisory warning — honest header: unreachable via
sanctioned verbs, reachable via reversal-gated direct construction, the warning is the net ·
the CLR23 withdraw-and-redraft remedy text) + chatTurn v8 (#46a stream-error capture with
`error_code` held to the 0006 CHECK allowlist — the diagnostic lives in the tagged message ·
#46b SST-zero two-leg propagation · #35 bind-existing-counterparty guidance).

**Open build items (the task ledger is the live status home):** the reconciler
double-dispatch cosmetics + the sweep-vs-human budget contention (→ Wave C) · the
nonzero-tax DB belt (TRIGGER-BOUND: lands before any binding/rule on a vendor whose bills
state nonzero tax) · Gate P (waits on the first real SST-charging supplier bill — operating
runway, not engineering) · the `opening_tb.line` producer + K-doc production door (Phase 5,
review-gated). **NEXT: Wave C (bank rec) in a fresh session.**

**Canary `daba7f2e` stays ARMED, due 2026-08-02 — NEVER answer it.**
