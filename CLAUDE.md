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

**Phase 4 — WAVE B CLOSED ON INTENT (ADR-046, 2026-07-27).** The waves, one line each:
**Wave A** (daily AP loop) LIVE — ADR-022..024; GATE 3 beta-real (17/17 replay, AP gate exact
RM 1,350,938.21). **Wave A2** (sales/AR + MyInvois local parse + SST 3-leg + CN/DN + bounded
auto-post) LIVE, §9 eval closed — ADR-025..027 (Gate A exact RM 1,973,332.91). **Wave A2.1**
(SST watch + sales autopost lift + classifier gate) CLOSED — ADR-028..030. **Wave B**
(knowledge + onboarding; contract v1.0 = LAW, ADR-032; migrations 0017–0021 via ADR-033..043)
**CLOSED on intent — ADR-044/045/046**: every gate that can close on real evidence has closed;
every deferral names its cause and destination.

**LIVE POSTURE: 21 migrations (`0021`) · Fly `clara-runtime` v29 · FOUR firms** (BELCORT —
real, 3 clients, **high-stakes RM100,000** ADR-044 · ROME PUBLIC ADVISORY `39008536`, born via
Gate F, empty, RM10k default · Alara Advisory + Borneo Books = slice-era RLS fixtures, never
repurpose) **· dashboard Pages `app.clarabook.com`** (must set
`NEXT_PUBLIC_CLARA_RUNTIME_URL=https://clara-runtime.fly.dev` — intake requires the direct
URL) **· `clara-backup` daily.** All Wave-B migrations deployed; none queued.

| gate | state (receipts in `docs/plan/research/wave-b/`) |
|---|---|
| **O · K(keyed) · B-12** | CLOSED — O/K twice each (Rome Secretary · Bee Creative; K corroborated by the client's own YA2025 `BALANCE B/F 65,747.97`); B-12 as the still-to-capture checklist (supersedes WB-R29's date half) |
| **K document-tied** | DEFERRED → Phase 5 (synthetic): `uq_opening_seed_registry_once` — both real clients' slots spent, RPR greenfield, demo clients hold zero documents; a producer built now has no client to run on |
| **W2** | (1)+(2)-structural CLOSED (`live-gate-w2-2026-07-25.md`); (2)b/(3)/(4) → the operating runway (need a real wake + draft) |
| **P** | BLOCKED → **the extraction slice**. `invoice.tax_total` produced 0/29; the naive emit was **adversarially refused on three grounds** (`gate-p-build-refused-2026-07-27.md`) — no re-extract verb exists, `anchor_missing` would silently switch off, and the `net+tax+rounding=gross` tie fails on service-charge documents. `invoiceFacts.v1.azure.mjs` is NOT frozen |
| **L** | DEFERRED → Phase 5: no conflicting real pair exists (the candidate agrees to the sen); manufacturing one is fabrication |
| **R2** | 2/3 CLOSED live (`live-gate-r2-2026-07-26.md`): 6 signed `vendor_account` rules · 0 sightings from prior GL · 6/12 ticks correctly refused CLR23 (name-only vs registered identity) · **first 12 `recurring_pattern` knowledge pages** (deterministic — the wiki now holds real client knowledge). Claim (3) → the operating runway |
| **S** | DEFERRED → Phase 5: no MyInvois XML exists in any corpus |
| **F** | CLOSED (ADR-045, `live-gate-f-2026-07-27.md`) — durable 11-Q birthed the firm; durability proven by an unstaged fault (failed commit → re-park on the same op_key → clean retry, SAME run) |

**NEXT (the sole pre-Wave-C engineering): the EXTRACTION SLICE** —
`docs/plan/extraction-slice-contract.md` (DRAFT v0.1, **grill before building**; 4 open owner
questions). Order: 0022 (`request_reextraction` + `set_firm_high_stakes_threshold` + the
sum-of-stated-components sales tie + an explicit `anchor_missing` guard) → the deterministic
totals reader → **two-reader corroboration LAST and ALONE (X5)** — today Tier-A passes 0/29
(Azure confidence max 0.837 vs 0.95; polygon + MYR pass 29/29), which is why the autodraft
lane has never drafted (0/55 sweeps) and Phase 5 §6's auto-post-precision gate cannot yet be
measured. **Never lower the 0.95 bar; corroborate by agreement, as the XML tier already does.**

**The OPERATING runway (real future documents, interleave any day):** R2 claim (3) · W2
journeys · the **first production autopost** (~3 approved small-ticket bills of one recurring
vendor, e.g. KOK LIONG RM1,190–2,600; verbs fully built, 0 calls ever; 5 floor-met pairs
cannot fire — payroll JVs bind no facts lane, the AR-control pair lacks sales evidence).
**Autopost-from-seeding is REFUSED under WB-R2** (ADR-046) — posting authority comes from
verified in-system approvals only. Intake is proven end-to-end
(`docs/ops/incident-2026-07-26-intake-storage.md` for the misdiagnosis record).

**Open build items beyond the slice:** `interview_v2` (F1: the SSM validator rejects sole-prop
ROBA forms; F2: `framework` offers only MPERS/MFRS — all three interview files freeze-locked) ·
the `opening_tb.line` producer (Phase 5, with a synthetic codes+Dr/Cr trial balance).

**Canary `daba7f2e` stays ARMED, due 2026-08-02 — NEVER answer it.**
