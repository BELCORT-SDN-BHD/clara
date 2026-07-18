# Consult: file-transport + ingestion architecture for Clara Slice 5 (document pipeline core)

You are consulted as an independent senior architect. Recommend ONE browser→system file-transport and ingestion architecture. You may read this repo (read-only) to ground yourself: key files are packages/runtime/src/index.ts (express.json 1MB is today's ONLY ingress), packages/runtime/src/chatRoutes.ts, docs/plan/slice4-durable-runtime-contract.md, packages/db/migrations/0003_books_core.sql (documents table), docs/architecture/ARCHITECTURE.md §7.

## System facts (fixed)
- Topology: Next.js dashboard on Vercel; Node agent-runtime on Fly (ONE non-HA machine, crash-only supervisor — any component crash kills the group; event-loop stalls degrade chat SSE); Supabase (Postgres 17 + Storage) in ap-southeast-1; runtime↔DB via Supavisor SESSION-mode pooler with a documented 17-connection budget (5+5+5+2) — new pools must fit inside it.
- Durable engine: Workflow DevKit (workflow@4.6.0, @workflow/world-postgres@4.3.0) self-hosted on the same Postgres. Step IO is durably persisted: NO file bytes and NO credentials may transit step inputs/returns/state — documents cross step boundaries as references (document_id + sha256 + storage key). Steps re-drive at-least-once; a step that throws after an external call re-invokes the call (bounded duplicate vendor spend); DB effects must be idempotent by key.
- OCR: Azure Document Intelligence prebuilt-layout v4.0 (pinned; SEA region; Standard tier). OCR runs deterministically inside the pipeline (no LLM in the ingest critical path — hard law, prior build lost batches when persistence depended on the model choosing to call a tool).
- DB as-built: clara.documents has UNIQUE(firm_id, sha256); sha256 is currently a caller-supplied UNVERIFIED claim — Slice 5 MUST verify sha↔actual-bytes; ingest writers are audited SECURITY DEFINER fns with op_key idempotency; document.ingested domain event emitted same-txn via a transactional outbox.

## Laws (binding)
1. Persist-after-OCR ALWAYS: bytes + document row persist structurally, deterministic server-side, before/independent of any model involvement; no success signal until the row exists.
2. Storage doctrine: private write-once bucket (no UPDATE preserves sha↔bytes bond; no DELETE — reverse-not-delete + 7-year retention); firm-scoped keys firms/{firm_id}/...; key grammar validated at CREATION (client slug or _unassigned, folder whitelist, key ends in sha256+ext). NOTE an owner ruling is pending on move-on-assign vs content-addressed-never-move — design so either resolution works, and say which you'd pick and why.
3. Owner preference: the AGENT'S OWN runtime service owns document custody end-to-end (receive bytes, OCR, validate, persist) via its OWN storage credential; the transport stays dumb; no separate broker service. The browser must never hold a storage-write credential beyond, at most, a single-use scoped signed URL — and bytes bypassing the runtime's custody is a negative.
4. Scale shape: chat-attachment scale is ~5 files × 20MB per turn (ported caps); bulk month-end intake through a Documents tab is dozens of files with queueing + per-file retry. Multi-tenant accounting firm SaaS; documents are invoices/receipts/bank statements (sensitive PII).

## Options on the table (challenge or extend them)
A. Runtime-owned authenticated multipart route: bytes stream through the Fly runtime to Supabase Storage under the runtime's credential; sha256 computed on the stream; row persisted in the same pipeline.
B. Direct-to-storage: browser uploads via Supabase signed upload URL (or TUS resumable); runtime notified with the key; runtime reads back to verify sha + OCR. (Orphan-object window; custody bypass at ingest; but no big-body route on the single machine.)
C. Hybrid/staged variants.

## Analyze specifically
- Backpressure + memory behavior on ONE shared Fly machine (streaming vs buffering; effect on chat SSE liveness); Fly proxy request-size/timeout constraints.
- Whether Supabase Storage supports enforcing a client-declared checksum at upload (compare S3 x-amz-content-sha256 / checksum conditions), TUS resumable semantics, upsert=false write-once behavior, object copy/move semantics.
- Orphan/crash windows in each option and the reconciliation story (object-without-row, row-without-object) under at-least-once re-drives.
- Where sha256 verification happens in each option and whether an attacker (or a buggy client) can get a row whose sha doesn't match stored bytes.
- Batch intake (dozens of files): queueing, per-file retry, resumability, partial failure UX.
- Virus/malware scanning posture for accountant-uploaded files.
- What current (2025-2026) production AI-agent SaaS platforms actually do for chat-attachment + bulk document ingestion.

## Deliverable
A decisive recommendation (pick ONE architecture, may be staged), the failure-mode table, and the 5-8 sharpest implementation gotchas. Be terse and concrete.
