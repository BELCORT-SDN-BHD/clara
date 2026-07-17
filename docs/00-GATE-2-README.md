# Clara — Phase 2 Blueprint · Gate 2 Packet

**Date:** 2026-07-17 · **Status:** awaiting owner approval. Phase 1's audit (235 verified findings) and the Gate-1 rulings are fully synthesized into the rebuild blueprint. **Nothing is built, deployed, or destroyed yet** — Phase 3 starts only on your approval here.

## The packet

| # | Deliverable | File | What it settles |
|---|---|---|---|
| 1 | **Refreshed PRD** | [`prd/PRD.md`](prd/PRD.md) | Product law: North Star kept; the four structural invariants, the F3 "complete the whole accounting job" law, maker/checker, the two-layer knowledge wiki, and the compliance-correct-core scope — all as binding invariants. Supersedes the old PRD. |
| 2 | **Target architecture** | [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) | The event-driven state layer (log+outbox+context packs+freshness), the structural read-only agent role, intrinsic same-transaction subledgers, period integrity, the durable runtime, the two-layer wiki, the DB-owned reporting engine, ops/DR/CI/eval — each mapped to the audit pattern it fixes. |
| 3 | **Runtime recommendation** (decision item) | [`phase2-research/runtime-recommendation.md`](phase2-research/runtime-recommendation.md) + `ARCHITECTURE.md` §4.0 | **Vercel AI SDK 7 + Workflow DevKit, self-hosted on our own Postgres; LangGraph JS fallback behind the seam.** Double-verified by two independent primary-source lanes. Preconditions: the 1–2 week spike (Slice 0) + the C6 checklist. |
| 4 | **Design direction** | [`design/DIRECTION.md`](design/DIRECTION.md) (normative synthesis: [`phase2-research/design-direction-synthesis.md`](phase2-research/design-direction-synthesis.md)) | The two-pane Agentic Accounting OS; typed `parts[]` transcript; fail-closed card catalog; PLAN→SHOW→GATE→VERIFY→RECOVER surfaces; DP-1…DP-8; ADOPT/AVOID mapped to every UX finding. Supersedes the old `docs/design/`. |
| 5 | **Rebuild plan** | [`plan/REBUILD-PLAN.md`](plan/REBUILD-PLAN.md) | Phase-3 foundations (7 slices, spike-first, GATE-3 thin-slice demo), Phase-4 waves A–G, top-8 risks, and the Phase-5 verification plan with your acceptance criteria + use cases made falsifiable. |
| 6 | **Accounting practice map** (scope authority) | [`phase2-research/accounting-practice-map.md`](phase2-research/accounting-practice-map.md) | SST done right (12 requirement areas, source-registered), the full firm lifecycle, payroll calendar, the Part-5 v1 scope ledger. |

Research provenance: `phase2-research/design-{genui,agentic,saas,agent-coexist}.md` (primary-source lanes behind the synthesis).

## Decisions requested at this gate

1. **Ratify the runtime** — AI SDK 7 + WDK (self-hosted Postgres world) with the LangGraph fallback and the Slice-0 spike as a hard precondition. *(Gate-1 left this open; the incumbent was not presumptive and indeed did not win.)*
2. **Ratify the design direction** — including two explicit calls: **plan-as-document as a first-class versioned DB object**, and the **rewind-vs-reverse UI convention** (drafts discard; posted entries only Reverse-with-reason).
3. **The C6 checklist** (from your Gate-1 override): the executed **DPA**, the **firm-facing disclosure**, and the **PDPA cross-border check** must be evidenced before vendor trace export is switched on. Until then tracing ships **feature-flagged off** with DB run history carrying debugging. Confirm this sequencing.
4. **Approve the phase plan** — the slice/wave order, the GATE-3 thin-slice definition, and the Phase-5 verification plan (incl. the AI-quality eval as a real gate and tax-comp's pre-authorized slip to v1.1).

## What happens on approval

Phase 3 begins: the Slice-0 runtime spike immediately, then the fresh repo + fresh Supabase project + CI + the governed DB core, ending at **GATE 3** — the thin end-to-end slice demoed live (upload → OCR → persist-unassigned → assign → event → context pack → one governed agent workflow with a full audit trail, including a mid-workflow kill-and-resume).

The frozen old repo + old Supabase project remain untouched throughout (decommission only after Phase-5 sign-off).
