# Clara — Rebuild Plan (Phases 3–5)

*Vertical-slice sequencing, risks, and the Phase-5 verification plan. Companion to `docs/prd/PRD.md` + `docs/architecture/ARCHITECTURE.md` + `docs/design/DIRECTION.md`. Status: Gate-2 ratified 2026-07-17 (see `docs/PROJECTLOG.md`).*

**Method:** every slice is vertical (DB → runtime → UI → test), lands behind green CI on the **new** schema + runtime (never the old build's misleading-green defect, GAP1-5), keeps the app runnable, and commits incrementally. PORT assets are ported deliberately with their tests; REBUILD assets are rewritten to the named standard; DROP stays behind (salvage manifest = the authority).

---

## Phase 3 — Foundations (ends at GATE 3: the thin slice demo)

**Slice 0 — the spike (hard precondition, 1–2 weeks).** The WDK×Supabase production spike from the runtime recommendation: session-mode LISTEN/NOTIFY under `@workflow/world-postgres`; redeploy-under-parked-hook; redeploy-mid-run; parked-interruption resume after 48h; idempotent re-drive. **Acceptance: all five pass, or the seam flips to LangGraph JS and the same acceptance re-runs.** Nothing else in Phase 3 starts on the runtime until Slice 0 passes.

**Slice 1 — repo + project + CI + ops floor.** Fresh repo (seeded from `clara-rebuild/`); fresh Supabase project + local CLI dev; versioned migrations from day one; seed scripts (synthetic data only); CI that **applies every migration + runs the isolation rig + typechecks + tests the runtime** on every PR. The cross-firm isolation suite is PORT'd and green before any books table carries data. **The ops floor lands here too (fixes GAP1-6/1-7):** the backup/restore/DR contract for the 7-year source of truth (documented + a restore actually exercised against a synthetic backup), readiness probes (not liveness-only), SLOs, and alerting.

**Slice 2 — the governed DB core.** Foundation schema (firms/users/RBAC + live authority revocation), forced RLS, EXECUTE-only grants, the **structural read-only agent role**, the four structural invariants as DB objects (`assert_client_resolved`, provenance CHECK, wake allowlists, role floors + revision-token approve), maker/checker columns + high-stakes gate, the balance trigger (PORT), money-as-cents. Rig tests for every guard **including the negative paths** (a SELECT-wrapped writer must FAIL; a provenance mismatch must RAISE).

**Slice 3 — the event spine.** `domain_events` + transactional outbox + relay + idempotent consumers; the context-pack read fn with the books-version token; the trigger-taxonomy table. Replay test: kill the relay mid-stream, restart, no event lost, no duplicate effect.

**Slice 4 — the durable runtime skeleton.** WDK world wiring under `clara_runtime`; `agent_tasks`/`agent_interruptions`/`wakes_outbox` projections; a minimal chat loop with typed `parts[]` persistence, tool chips, SSE that survives detach (runs execute regardless); clarify as a hook-parked interruption; per-firm metering/concurrency caps; DB-backed run history; tracing wired (vendor export **disabled until the C6 checklist is satisfied**).

**Slice 5 — document pipeline core.** Upload (picker/drag/paste) → OCR (**with bounding-region capture**) → **persist-after-OCR always** (unassigned lane) → assign/reassign (row + citations + storage move together) → the attachment lifecycle chip. Storage doctrine + registry + retention anchored at period-end+filing.

**Slice 6 — the thin end-to-end slice (GATE 3 demo).** Upload → OCR → persist-unassigned → assign to client → domain event published → context pack retrievable (fresh, token-checked) → one simple agent workflow (code one document into a balanced draft with provenance bound, `je_review` card, human approve with revision token) → full audit trail (events, receipts, tool history, maker/checker). **Kill the server mid-workflow and resume as part of the demo.**

## Phase 4 — Product build (ends at GATE 4: the built product mapped against the PRD)

Ordered by dependency + risk; each wave keeps the app runnable.

> **STATUS (2026-07-22):** Wave **A** is FULLY LIVE (ADR-022/023/024). **Wave A2**
> — the sales-invoice/AR side + MyInvois UBL local-parse + SST 3-leg + CN/DN +
> **purchase-only** bounded auto-posting (the "standing rules" from Wave A's scope)
> + the R2 backup app — was **deliberately inserted before Wave B** and is now
> BUILT + MERGED (ADR-025/026, migration `0015`), pending the live deploy.
> **Deferred to Wave A2.1:** sales-direction autopost + purchase-side SST 3-leg.
> Waves **B–G** below are unchanged; **B (knowledge + onboarding) is next** after
> the A2 deploy + A2.1.

**Wave A — the daily loop.** Coding with **intrinsic side-effects** (`code_and_open_ar/ap` composites; counterparty entity + aliases PORT'd in), the review queue (List model), `doc_review` side-by-side evidence surface, the confidence ladder lanes (DB-gated), auto-draft sweep with human acknowledgement floors, KB Layer-2 (typed rules, user-gated; open-question objects), diffs (legs + doc↔entry).
**Wave B — knowledge + onboarding.** The client wiki (ingest/query/lint; injected context packs; lint schedule), firm/client onboarding interviews as durable runs, ongoing-client carry-down (one-shot, idempotent, TB tie-out — the FA-register **schema** lands in Phase-3 Slice 2 so the carry-down can seed asset rows + depreciation baseline here; the FA **workflows** wire up in Wave D), bulk rule/knowledge seeding from prior GL (redesigned per the Karpathy direction, not the stale notes).
**Wave C — money movement.** Bank statement ingest, parity-checked matching + exclusivity, reconciliation tie-out, receipt/payment allocation (intrinsic), aging + statements, the self-reconcile learn loop (advisory, human-gated).
**Wave D — assets + adjustments.** FA register from coding (intrinsic), depreciation runs (scheduled + close-gated), disposal, recurring/reversing adjustments, periodic closing-stock at close.
**Wave E — periods + statements.** Serialized year-end close with structural pre-close gates, segmented continuity reads, ordered reverse guards, carry-forward; the honest FS pack (SoFP/SoCI/SOCE/cash-flow/notes); the reporting engine (spec → DB reads → renderers → auditable artifacts).
**Wave F — tax.** The SST engine per the practice map (periods, payment basis, dual-registrant exports, SST-02, bad-debt relief); the payroll deadline calendar; **last: the draft tax computation** (add-backs, CA, chargeable income, forms — the slice allowed to slip to v1.1).
**Wave G — the OS surface.** Proactive inbox (allowlisted wakes), cross-scope needs-you, ⌘K Ask/Do/Go + ActionPanels, plan-as-document for close/onboarding, exports UI, generative-UI completion + parity CI gates, the design floors.

**Doctrine/skills:** regenerated fresh against the real tool registry per wave (registry-generated catalog + drift lint), never copied wholesale from `belcort/` (the domain gold — SST ladder, carry-down interview, CN/DN polarity — is extracted deliberately, per the salvage manifest).

## Risks (top 8)

| # | Risk | Mitigation |
|---|---|---|
| 1 | WDK in-flight-run replay across deploys (verified doc-silent) | Slice-0 spike ACs; pinned versions; name-versioned workflows; drain-active-runs deploy policy; LangGraph fallback behind the seam |
| 2 | Intrinsic side-effects widen the audited-fn surface (composite writers) | One composite fn per workflow class, rig-tested with negative paths; the F3 failure criterion as a per-wave regression suite |
| 3 | Scope creep in the compliance-correct core | The practice map's Part-5 scope ledger is the authority; tax-comp is pre-authorized to slip |
| 4 | The wiki becomes an unbounded token/complexity sink | Lint caps page count/size per client; context packs inject pages by relevance budget; wiki is advisory-only so degradation is graceful |
| 5 | C6 checklist slips (DPA/disclosure/PDPA) while tracing ships | Vendor trace export is **feature-flagged off** until the checklist is evidenced; DB run history carries debugging meanwhile. **Ownership: the DPA execution, the firm-facing disclosure text, and the PDPA cross-border check are OWNER/legal work items (Tao), tracked from Gate-2 approval — engineering's only task is keeping the flag off until all three are evidenced** |
| 6 | Design ambition (parts[], cards, evidence viewer) outruns the build | The design-critical path (DIRECTION.md §4) is ordered; the fail-closed catalog means unbuilt cards degrade to nothing, never to broken UI |
| 7 | Old-build habits re-imported via ported code | Every PORT lands with its tests + a re-review against the findings that touched it; DROP list enforced in review |
| 8 | Single-maintainer bus factor on a bigger stack | Boring choices everywhere else (Next.js, Postgres, shadcn); the runtime is the one novel bet, seam-isolated |

## Phase 5 — Verification plan (the hero prompt's criteria, made falsifiable)

Run in local/dev with synthetic data only. Every scenario records: **what was read, changed, synced, skipped, or blocked.**

1. **End-to-end use cases** (each with evidence): document ingestion + classification; bank statement ingestion → coding → reconciliation → exception handling; SOFP/balance-sheet preparation + review; AR/AP sync, matching, aging, list updates; payment coding to AP/AR; customer/vendor ledger updates; year-end depreciation calculation + posting; fixed-asset disposal treatment; report generation with provenance, scope, audit trail.
2. **Acceptance criteria** (Workstream G): schema/context retrieval before workflows; relevance determination; scoping by client/entity/period/permission with zero cross-client mixing; COA validation; lock-date/closed-period/approval checks before posting; outcome sync-back; read/changed/synced/skipped/blocked records; resumability under interruption.
3. **The F3 failure criterion applied to every accounting workflow:** skill loaded → context retrieved → correct tool → GL posted → subledger/register/reporting/KB side-effects completed or explicitly surfaced. **Any workflow that leaves required state stale fails.**
4. **Load & limits (first-party QA of our own product, new build only):** batch sizes to design targets, large files, mixed types, duplicate handling, partial failures, retries, queue behavior, OCR throughput, unassigned persistence — **measured ceilings recorded in the docs, not guessed.**
5. **Resumability:** kill and restart the server mid-workflow (mid-close, mid-onboarding, mid-bulk); resume-or-reconcile with **no double-posting and no lost context**; parked clarifications resume after ≥48h.
6. **The AI-quality eval harness (GAP3-6, now a real gate):** attribution precision + abstention, coding accuracy by document class, must-ask recall, auto-post precision — falsifiable thresholds set at Gate 3, measured before cutover readiness.
7. **Structural-guard negative tests:** SELECT-wrapped writer fails; provenance mismatch RAISES; wake allowlist blocks; maker=checker blocked on high-stakes; revision-token mismatch rejects; stale context-pack token rejects; double carry-down seed RAISES; cross-FY reverse-out-of-order RAISES; **bank matching (GAP1-1/1-2): a wrong-account/wrong-period/amount-beyond-tolerance match RAISES; a second match on an exclusively-matched entry is blocked; re-match without an explicit unmatch is blocked.**
8. **Data-egress verification:** with vendor tracing flagged on, verify the DPA/disclosure evidence exists; with it off, prove zero trace egress.
9. **Final report:** pass/fail per scenario, measured limits, known gaps, the supersession manifest, and the old-project decommission checklist (decommission executes only after owner sign-off).

**Methodology carried from the owner's harness notes (Gate-1 E2):** user-journey simulation against the production-mode build (not dev-only), state-transition acceptance criteria with an observable UI + DB assertion per transition, verification-before-completion as a hard per-slice gate, and a cross-feature happy-path regression suite run on every evaluation.
