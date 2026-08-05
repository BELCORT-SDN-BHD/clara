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

**Phase 4 — WAVE C CLOSED (ADR-051..054) · WAVE D OPEN (ADR-055): D-a CLOSED (ADR-056) ·
D-b's SHIPPING SLICES CLOSED (ADR-058, 2026-08-05) — D-b2 (`0045`) is HELD and is NEXT.**
Closed: **A/A2/A2.1** LIVE (ADR-022..030) · **B** on intent (ADR-044..046) · the extraction
slice (ADR-047/048) · the settlement program (ADR-049) · the first production autopost
(ADR-050) · **C0/C-a/C-b/C-c** (ADR-051..054 — thirteen reconciliation receipts at exactly 0,
nine real RPR months chained to the sen; records `wave-c-*-design.md` + parts).

**LIVE POSTURE: 43 migrations (frontier `0044`) · Fly `clara-runtime` **v54** (interview v3 —
hooks arm before the park announces, PR #186 — + the adjustments belt dormant until `0045`) ·
Supavisor 31/60 ·
FOUR firms** (BELCORT — real, 3 clients, high-stakes RM100,000 ADR-044 · ROME PUBLIC ADVISORY
`39008536` = the Gate-S synthetic sandbox, RM10k default — its only client is "Fictional Test
Services"; do not confuse with BELCORT's real ROME PROPERTIES / ROME SECRETARY · Alara +
Borneo = slice-era RLS fixtures, never repurpose) **· dashboard Pages `app.clarabook.com`
incl. /assets** (needs `NEXT_PUBLIC_CLARA_RUNTIME_URL=https://clara-runtime.fly.dev`) **·
`clara-backup` daily.** No migration queued — **D-b2 claims `0045` at ITS merge.** Both REAL
FA registers AND both REAL staff-advance registers are honestly EMPTY (ADR-056: no real
client has ever owned a fixed asset; ADR-058: both real clients are in strike-off); the
sandbox carries the labelled-synthetic corpora — a live monthly depreciation authority and
ONE synthetic staff advance, `staff_advance_tie` TRUE at difference 0.

**WAVE D — `docs/plan/wave-d-contract.md` is the mechanism of record** (WD-R1..R15, ADR-055;
never re-grill). **D-a CLOSED (ADR-056)** — `wave-d-a-fa-design.md` v2.1 + `-part2.md` = the
full record; both real registers honestly EMPTY (the WD-R14 named deviation); RS's real
FYE = 31 March. **D-b: the AS-BUILT truth is `wave-d-b-asbuilt.md` + `-part2.md` (ADR-058)** —
the wave shipped as a **FOUR-SLICE SPLIT** (`0042` D-b0 shared authorities · `0043` D-b1 staff
advances · `0044` D-b3 AF-2 composite + producer, all LIVE · `0045` D-b2 recurring adjustments
**HELD**), proven complete by twin-rig equivalence (zero semantic difference, 14 axes) and a
418-cell test partition. `wave-d-b-design.md` v8 (WDB-G1..G16) + `-abi.md` + `-part2/-part3`
remain the DESIGN-time record and are bannered as such. **NEXT: D-b2's hold-ladder** (it ships
no round-11 fix by design; the inheritance register is asbuilt-part2 §12), then Gate P and the
§7-A bundle. The `bank_rule_suggested` producer is live but **UNGRANTED by design** — its
grant lands with `0045`. Closing stock → Wave E (WD-R11). The Wave C records (never re-grill):
`wave-c-contract.md` (WC-R1..R12) · the C-a/C-b/C-c design docs + parts (WCA/WCB/WCC +
AF-1..AF-5; **AF-2 shipped at `0044`**). Archive branch `build/wave-d-b-0042`: **NEVER MERGE**
(evidence only; do-not-restore list in asbuilt-part2 §13). Open registers: PROJECTLOG PART 2
(D-b2 · Gate P · the §7-A bundle parked for the unattended sales drafter).

**Autopost law (ADR-049/050):** vendor-binding v4.1 BUILT AND LIVE; hand-drafts are never
autopost-eligible BY DESIGN; autopost-from-seeding stays REFUSED (WB-R2/ADR-046). The
OCR-sales envelope is BUILT; the missing piece is the unattended sales drafter, and the
floor accrues ONLY from chatTurn drafts tagged `sales_invoice` — contract §7-A. **Standing
law: migration numbers are claimed at MERGE time.** Malaysian tax facts live in
effective-dated policy tables, never in prose
(`docs/plan/research/wave-c/my-tax-verified-2026-07-29.md`).

**Open build items (PROJECTLOG PART 2 is the live register):** **D-b2 / `0045`** (recurring +
reversing adjustments — BUILT, twin-proven and HELD; needs its own hold-ladder before any PR;
it also carries the producer's guarded grant and the D-b3 lane inheritance) · Gate P
(operating runway; owns the capitalised/mixed-purchase tax-allocation question) · the §7-A
runtime bundle (parked for the unattended sales drafter) · the `opening_tb.line` producer +
K-doc door (Phase 5, review-gated).

**Canary `daba7f2e` was due 2026-08-02 — NEVER answer it, even past due.**
