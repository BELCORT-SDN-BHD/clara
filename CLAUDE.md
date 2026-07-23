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
| Decisions (append-only ADRs) + open items | `docs/PROJECTLOG.md` (START HERE block) |
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

## Working protocol

- **Orchestrate via the `orchestrator-fable` skill.** The main model is the **orchestrator** (plan, delegate, synthesize, verify, own state); **workers** are the hands — Claude native subagent lanes, or Codex for heavy implementation/debugging/refactors — **every dispatch lane carries an explicit `model` override;** Delegate bounded work orders, inspect every worker result before accepting it, and run cross-model review before merging security-critical work. **Codex lane caveat (learned):** the `codex:codex-rescue` companion queue is unreliable (it has stalled for hours at "starting"); prefer a **direct `codex exec` via Bash** (background + a file-watcher on the output) or a **native subagent** — both have been reliable. 
- **Never Blindly dispatch the main model.** Every subagent/workflow/teammate dispatch carries an explicit `model`; ***omission silently inherits Fable, which is forbidden.*** Codex lanes stay `gpt-5.6-sol`.
- **Ground before building.** On a new or compacted session, before answering an architecture question or changing code: **query the codebase-memory graph first** for structure, and read the relevant harness row above. For substantial, opt-in-scale work a grounding fan-out (Workflow) can help — but a few targeted graph queries + reads usually suffice.
- **Query the graph, don't grep.** The codebase-memory graph is the first stop for "where / what / who-calls" questions (~100× cheaper than file-by-file reading). Use Grep/Read to drill into the specific file the graph points you at. Re-index after big code changes. *(stdio MCP, project-scoped in `.mcp.json`.)*
- **Keep the harness fresh — each artifact for its purpose (before compact / refresh).** Check all the harness status and related docs is sync and refreshed with newest project state like **prd, rebuildplan, projectlog.......etc** , housekeeping anything that is stale or wrong/outdated, its for avoid the project's state, plan, decision, log 's pollution. and also refresh/update the memory record. (btw tidy up the loooong project log. make sure no context pollute in there.)Do a harness-refresh pass before compacting a long session.
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

**Phase 4, mid-WAVE B (knowledge + onboarding).** The waves so far, one line each:
**Wave A** (daily AP loop) FULLY LIVE — ADR-022/023/024; GATE 3 closed beta-real
(17/17 replay, AP gate exact RM 1,350,938.21, kill-mid-workflow exactly-once).
**Wave A2** (sales/AR + MyInvois local parse + SST 3-leg + CN/DN + purchase-only
bounded auto-posting) FULLY LIVE, §9 eval CLOSED — ADR-025/026/027 (Gate A exact
RM 1,973,332.91; Gate B exact). **Wave A2.1** (SST registration watch + sales
autopost lift + classifier gate) CLOSED — ADR-028/029/030, ruling WA21-R13; the RPR
watch surfaced OVERDUE **unprompted** in production, RM 1,310,276.40 to the sen;
Gates S/P deferred to REAL documents (PART 2). **Wave B**: the design contract
`docs/plan/wave-b-contract.md` v1.0 is LAW (ADR-032, rulings WB-R1..R18) and the
**DB heart — migration 0017 — is MERGED UNDEPLOYED** (ADR-033, PR #67): built by
blind lanes (a 179-cell contract-blind battery, SQL-unread) and a SIX-round
cross-model adversarial ratchet to RESOLVED; evidence in
`docs/plan/research/wave-b/`. **Live posture: Supabase 16 migrations · Fly
`clara-runtime:wave-b-v25` (chatTurn_v7/autoDraft_v3, ten loops) · dashboard Pages
`app.clarabook.com` auto-deploys from `main` · `clara-backup` daily (rclone
1.74.4, zero-501-proven).** The **v25 runtime lanes are BUILT merged undeployed**
(ADR-034: chatTurn_v7, wiki-aware autoDraft_v3, firmInterview_v1/
clientOnboarding_v1 on durable WDK-hook parks, the wiki-projection + lint
consumers; runtime suite 482/482; adjudications in
`docs/plan/research/wave-b/v25-runtime-lanes-memo.md` — model synthesis ships
fail-closed DARK pending the runtime consent-read ruling, PART 2). The dashboard
surfaces + runtime lanes are BUILT (ADR-035, PR #71) and **the WB-R18 CEREMONY
IS EXECUTED (ADR-036, 2026-07-24): LIVE = Supabase 17 migrations · Fly
`clara-runtime` wave-b-v25 (ten loops, WIKI_PROJECTION acquired, /ready 200) ·
wiki backfill 30/30 · every post-verify probe green (pack dark/lit, replay
byte-identical, sightings unchanged, F10 serializable via PostgREST) · the
freeze deploy-lock committed (18 v25 entries immutable).** **What remains of
Wave B is ONLY the live gates O/K/W2/L/R2/F on REAL documents** (WB-R16: a real
second client + RPR''s management accounts for the B-12 lane; Gate K is
parse-feasible document-primary — the live OCR must emit `opening_tb.line`
regions, else the attributed keyed fallback). **Canary `daba7f2e` stays ARMED, due
2026-08-02 — NEVER answer it.**
