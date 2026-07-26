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

**Phase 4, WAVE B (knowledge + onboarding) — closing out.** The waves so far, one
line each: **Wave A** (daily AP loop) FULLY LIVE — ADR-022/023/024; GATE 3 closed
beta-real (17/17 replay, AP gate exact RM 1,350,938.21, kill-mid-workflow
exactly-once). **Wave A2** (sales/AR + MyInvois local parse + SST 3-leg + CN/DN +
purchase-only bounded auto-posting) FULLY LIVE, §9 eval CLOSED — ADR-025/026/027
(Gate A exact RM 1,973,332.91; Gate B exact). **Wave A2.1** (SST registration watch
+ sales autopost lift + classifier gate) CLOSED — ADR-028/029/030, ruling WA21-R13;
the RPR watch surfaced OVERDUE **unprompted** in production, RM 1,310,276.40 to the
sen. **Wave B**: contract `docs/plan/wave-b-contract.md` v1.0 is LAW (ADR-032,
rulings WB-R1..R27); 0017 + the v25 runtime + the dashboard shipped via the WB-R18
ceremony (ADR-033/034/035/036), then 0018 (Gate-K domain) same-day (ADR-038).

**LIVE POSTURE: Supabase 21 migrations (`0021_counterparty_human_lane`) · Fly `clara-runtime`
release v27 (ten loops, WIKI_PROJECTION acquired, /ready true zero warnings) ·
dashboard Pages `app.clarabook.com` auto-deploys from `main` **and now sets `NEXT_PUBLIC_CLARA_RUNTIME_URL=https://clara-runtime.fly.dev`** (without it, intake bytes + finalize transit a Pages Function instead of going direct to Fly — `intake.ts` requires the direct URL for any deployment) · `clara-backup` daily
(zero-501-proven).** 0019 landed 2026-07-25 (ADR-039) and **0020 the same day**
(ADR-041) — both runtime-image-first, the second with a re-quiesce before the
preflight. **0021 (the human counterparty lane) DEPLOYED 2026-07-26 (ADR-042/043)** —
the first Wave-B migration needing **no quiescence and no runtime redeploy**, because
the runtime holds no EXECUTE on its one new verb. Post-verify 6/6 after a 7/7 read-only
pre-flight. **All Wave-B migrations are deployed; none is queued.**

**Gates CLOSED on real evidence.** **O + K TWICE, on two entity shapes** — Rome Secretary
(Sdn Bhd) and **Bee Creative (sole proprietorship, 2026-07-26, ADR-043)**: seed finalized,
four entries approved in ONE transaction, posted TB Dr = Cr = RM 210,000.00, OBE nil, the
**negative-equity** case (a debit-balance capital account into the single `retained_earnings`
slot), AP seeded **at invoice level** against a counterparty minted through the new verb.
WB-R22's solo lane refused the first submit `CLR05 · SELF_ATTESTATION` — the DB, not the UI.
**W2 claim (1) + (2)-structural** (audited on the live catalog; WB-R21's interim allowance
expired when 0019 removed the veto). **S deferred on hard evidence** (no MyInvois artifact
exists in the corpus).

**Both owner rulings are IN** (WB-R28: Gate P's FRP/FX/personal-name proof accepted; WB-R29:
B-12's date — since **superseded**, see below). **Wave B is NOT finished.** Honest gate status:

| gate | state |
|---|---|
| **O**, **K** | CLOSED **twice** each (Rome Secretary · Bee Creative). K corroborated afterwards: the client's YA2025 accounts print `BALANCE B/F (65,747.97)`, the exact figure Clara posted |
| **B-12** | CLOSED on the **still-to-capture checklist**, not an opening carry-down — RPR is a **greenfield 2025 entity** (owner-confirmed), so there was never a prior period. **This supersedes the opening-date half of WB-R29.** 11 of 15 accounts tie to RPR's certified TB to the sen; 4 gaps remain, each blocked on a document absent from the corpus |
| **W2** | (1) + (2)-structural CLOSED. **(2)-behavioural, (3), (4) remain** — need a live wake credential (0 exist) + a real draft |
| **P** | **BLOCKED on MULTI-CURRENCY, not on SST evidence.** The 8 OpenAI invoices are genuine (MY FRP 24000037, 8% SST) but are **USD with an RM figure on the TAX LINE ONLY**, and `clara` has **no currency/FX column anywhere**. 712 invoices scanned across both corpora; zero RM-denominated SST documents exist. One path untried: the Bee Creative `2025 claim` schedule is a **7MB scan** that may state RM — OCR is live |
| **L** | **BLOCKED — no conflicting real pair exists.** The candidate (Bee Creative YA2024 closing vs YA2025 opening) **agrees to the sen**. Manufacturing a conflict is fabrication |
| **R2** | **feasible, not started** — the tick-list ceremony over RPR's real prior GL; 0 seeding batches today |
| **F** | **BLOCKED on three OWNER acts** — `docs/ops/gate-f-provisioning.md` (a membership-free auth account, a fresh admission token, RPA's particulars) |

**Closeable by engineering: R2 and W2's journey claims.** Evidence receipts:
`docs/plan/research/wave-b/gate-p-and-l-evidence-2026-07-26.md`,
`…/live-gate-b12-rpr-2026-07-26.md`.

**Intake WORKS** — proven end-to-end with a genuinely new document. A 2026-07-26 "outage" was
misdiagnosed four times; the real defects were `putCanonical` never detecting a duplicate
(Supabase returns HTTP **400 wrapping `statusCode:409`**) and the error body being discarded.
Full account, including every wrong diagnosis: `docs/ops/incident-2026-07-26-intake-storage.md`.
**Open, undiagnosed:** extraction completes but `document_kind` stays pending and no classify
event fires (doc `0cb7c1f1`).

**One genuine build item is logged and unfixed: the `opening_tb.line` producer.** The
opening parser (`packages/runtime/lib/opening-parse.mjs`) reads only
`document_regions.field_path='opening_tb.line'` and **nothing in the pipeline emits it**,
so the document-tied carry-down has never worked on any client — Bee Creative's accounts
extracted perfectly (153 regions, both tables recognised) and still returned
`no_opening_tb_lines`. Two interview findings need an **`interview_v2`** ceremony (all
three interview files are freeze-locked): **F1** the SSM validator rejects both printed
forms of a sole proprietorship's ROBA identity; **F2** `framework` offers only
MPERS/MFRS, neither of which a non-company entity can honestly claim.

**Canary `daba7f2e` stays ARMED, due 2026-08-02 — NEVER answer it.**
