# Runtime recommendation — independent second-lane corroboration record

**Date:** 2026-07-17 · **Recorded by:** the orchestrator, from the second lane's report delivered in-session. Two lanes were (unintentionally) tasked with the same G1 deliverable; the second lane found the first lane's file complete and, rather than overwrite it, ran an **independent primary-source re-verification** (fetched the official docs itself on 2026-07-17) as a cross-check.

## Second-lane result: full corroboration

The second lane reported the following decisive claims **CONFIRMED against primary docs it fetched independently**:

- OpenAI Agents SDK: the "install two versions in parallel via package aliases" caveat for days-later approvals across a version bump — confirmed **verbatim** in the official docs.
- Workflow DevKit `WorkflowAgent`: runs the agent loop inside a workflow, persists state across step boundaries, `'use step'` auto-retry (3×) — confirmed.
- WDK Postgres world: production-ready self-host, graphile-worker + LISTEN/NOTIFY, long-lived process (not serverless), Fly.io named — confirmed.
- WDK hooks: pause "even after days of inactivity" at zero compute, `hook.resume(token)` — confirmed.
- AI SDK tool approvals: persisted as message parts + `experimental_toolApprovalSecret` HMAC; `needsApproval` reserved for WorkflowAgent — confirmed.
- `@ai-sdk/otel`: full-content spans (`recordInputs`/`recordOutputs` default-on) to any OTLP backend — confirmed (the clean C6 fit: DPA-covered vendor **or** self-host from the same code).
- LangGraph: an interrupted node re-executes from its start on resume (the idempotency burden) — confirmed **verbatim**.
- Claude Agent SDK: Claude-models-only, Anthropic Commercial ToS, bundles the native Claude Code binary — confirmed (fails the stated model-agnosticism requirement).

**Second-lane bottom line (quoted):** "FIRM CALL = Vercel AI SDK 7 + Workflow SDK on self-hosted `@workflow/world-postgres`, behind the ADR-031 swap-seam; LangGraph JS + PostgresSaver as the named fallback; C6 tracing via `@ai-sdk/otel` to a DPA-covered OTLP vendor (Langfuse a concrete candidate) with self-host fallback. Two hard preconditions carried to Gate 2: (1) the 1–2 week WDK×Supabase spike (direct/session-mode connection for LISTEN/NOTIFY; in-flight-run-across-redeploy replay — WDK /docs/deploying is verified silent on this); (2) the C6 checklist (executed DPA + firm disclosure + PDPA cross-border)."

## Provenance note

The second lane completed and terminated before it could append this record itself; the orchestrator recorded its report verbatim-in-substance here so the "double-verified by two independent lanes" statement in `ARCHITECTURE.md` §4.0 has a citable artifact. The first lane's full evidence remains `runtime-recommendation.md`; earlier, the original Phase-1 preliminary matrix (a third, earlier pass over the same candidates) reached the same shortlist and decisive rows (`../audit/evidence/runtime-research.md`).
