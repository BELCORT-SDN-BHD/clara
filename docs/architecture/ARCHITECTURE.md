# Clara — Target Architecture (Rebuild v1)

*How the PRD becomes real. This is the technical source of truth for the greenfield build. It fixes the eleven verified failure patterns (`docs/audit/00-GATE-1-README.md`) and realises the Gate-1 rulings (`docs/audit/04-gate1-decisions.md`). Sections marked **[Wave-1 integration]** are finalised from the Phase-2 research (`docs/phase2-research/`). Status: Phase-2 draft for Gate 2, 2026-07-17.*

---

## 0. The one invariant, and how it is made structural

**The DB owns every number; the agent only orchestrates; one audited function per mutation class.** The prior build honoured this for GL balance but leaked everywhere else — the read tool could write (Ggr-1), provenance was unvalidated (GAP0-1), side-effects were prompt-only (F3), gates were model-asserted (A-5/A-16). The rebuild makes the invariant **structural at four load-bearing points** (Gate-1 C3), so correctness does not depend on model or app discipline:

1. **Client attribution** — a DB function (`assert_client_resolved`) gates every client-scoped write on a persisted, ≥0.95, *server-verified* client resolution; no write path exists that skips it.
2. **Provenance binding** — document-origin writes validate `source_doc_sha256` + `document_id` against a real ingested document row in the same transaction; an invalid or absent pair RAISES.
3. **Wake authority** — each wake kind carries a DB-enforced **allowlist** of invokable functions; `[proactive]` can call only `record_notification`. Not a blocklist.
4. **Write authorization** — the agent's read path is **structurally read-only** (a role with no EXECUTE on any volatile writer + `default_transaction_read_only`), so no SELECT-wrapped write is possible; role floors and plan→approve live in the DB.

Everything else (coding choices, materiality, close-readiness judgement) stays **visibility-first** — surfaced, not hard-blocked — per the owner's standing philosophy.

---

## 1. Topology — three planes, greenfield

```
Browser (Next.js dashboard)            Bearer = Supabase session USER JWT (firm claims)
  │
  ├─ READS  ──▶ Postgres via PostgREST (RLS-scoped) + typed read functions
  ├─ WRITES ──▶ audited RPC on the session JWT (never a god key)
  └─ CHAT/EVENTS ──▶ agent service (SSE)      Bearer = session JWT / firm-scoped short-TTL credential
  ▼
Postgres (fresh Supabase project)  ── THE SINGLE SOURCE OF TRUTH
  forced RLS per firm_id · EXECUTE-only audited SECURITY DEFINER writers · structural read-only agent role
  · durable event log + outbox · durable agent-runtime tables · the two-layer knowledge store
  ▲
Agent runtime (Clara) on Fly  ── long-lived Node service; durable runs/tasks/checkpoints; the ONLY holder of service credentials
```

- **Fresh Supabase project** + **local Supabase CLI** for day-to-day dev. Every schema change is a versioned migration in the repo from day one; seed scripts produce synthetic data. The old project stays frozen (read-only) until Phase-5 decommission sign-off.
- Isolation is **RLS on `firm_id`**, not project-per-firm — the proven model from the old build (frozen-repo ADR-029, cited as salvage evidence — not an ADR in this repo's PROJECTLOG), which is PORT. What changes is everything *above* the isolation boundary.
- **Hosts:** the runtime is a long-lived process on **Fly** (region `sin`, co-located with Supabase `ap-southeast-1`) — the WDK world needs an always-on worker, not a serverless function; the dashboard is on **Vercel**; the DB is **Supabase**. The runtime host is ratified in PROJECTLOG ADR-014 (Fly is also the frozen prior plane's host, so the ADR marks it a deliberate greenfield choice, not a carryover).

---

## 2. The event-driven accounting state layer (the North-Star spine)

Fixes A-1..A-7 (no event layer, no context pack, no freshness). This is the biggest net-new subsystem.

### 2.1 Domain events + outbox
- Every audited write function, in its own transaction, appends one or more **domain events** to an append-only `domain_events` log (firm-scoped, typed: `document.ingested`, `entry.coded`, `entry.approved`, `entry.reversed`, `ar_item.opened`, `ar_item.allocated`, `recon.matched`, `asset.acquired`, `asset.depreciated`, `period.closed`, `coa.changed`, `tax.updated`, …). The event carries the actor, the affected ids, and a monotonic per-firm sequence.
- A transactional **outbox** row is written in the same commit. A relay (in the agent service) drains the outbox and drives projections + wakes. **No fire-and-forget** — an event is never lost because the write committed but a webhook missed (the A-2 defect); at-least-once delivery + idempotent consumers.

### 2.2 Projections (read models Clara and the UI consume)
Consumers subscribe to the event stream and maintain derived read models: the per-client **context-pack cache**, the **knowledge wiki** (§5), reconciliation status, aging snapshots, the exception inbox, and coding signals. Projections are rebuildable from the log (replay), which also gives us disaster recovery for derived state.

### 2.3 Context packs + freshness
- Before any accounting decision, Clara calls `get_context_pack(client_id, purpose)` → a fresh, typed pack: client profile, FY/period + lock state, MSIC/business description, SST/tax status, COA policy, relevant documents, journal history slice, approval/reversal history, reconciliation exceptions, open questions (must-asks), the relevant wiki pages, and the **current books-version token**.
- Every pack carries the version token. A write asserts the token is still current (optimistic concurrency); a stale pack forces a re-fetch — Clara **never acts on stale context** (fixes A-7). Figures from an earlier chat turn can never replay as authoritative.

### 2.4 Trigger taxonomy (A-2)
A declarative table maps each event type → a routing decision: `internal_task` | `notification` | `background_review` | `context_update` | `ignore`, keyed on risk, materiality, workflow state, period status, freshness, and whether records/tax/reconciliation/reporting/audit/close-readiness are affected. Human-direct events that must NOT wake Clara are explicitly `ignore` (kills the over-automation noise). The routing is data, versioned, and testable — not scattered prose.

---

## 3. The data plane (Postgres)

### 3.1 What is PORT (keep) vs REBUILD
From the salvage manifest (89/134 DB assets PORT): the **isolation + audit spine is PORT** — forced RLS per `firm_id`, EXECUTE-only grants (no raw DML path), the deferred SECURITY-DEFINER balance trigger, `(client_id, account_code)` composite-FK COA integrity, anti-spoof actor stamping, the effective-dated `tax_rates` authority, the write primitives themselves (`approve_entry`, `reverse_entry`, the SST leg computation, the recon/FA/subledger writers). What is **REBUILD** is the *orchestration that calls them* and the *guards that gate them*.

### 3.2 The structural read-only agent role (fixes Ggr-1/I-1/H-6)
The agent's freeform read path no longer relies on a lexical verb filter. Two layers:
- The agent's DB role has **no EXECUTE on any volatile/SECURITY-DEFINER writer** — only EXECUTE on the STABLE typed read functions + RLS-scoped SELECT — and its session sets `default_transaction_read_only = on`. A `select approve_entry(...)` fails at the role level, not a string check.
- A **curated/typed read surface** covers every accounting workflow (the old build forced freeform SQL because curated reads were insufficient — Ggr-2). Where a genuinely freeform read is needed, it runs on the read-only role, is parameterised, and is **audit-logged** (query text + actor + purpose).

### 3.3 The four structural invariants as DB objects
- `assert_client_resolved(client_id, confidence)` — RAISES unless a persisted server-side resolution ≥0.95 exists; called inside every client-scoped writer.
- Provenance CHECK — document-origin writers validate `(document_id, source_doc_sha256)` against `documents`; RAISES on mismatch.
- Wake allowlist — the runtime mints a wake credential whose grants are the allowlist for that wake kind; the DB is the backstop (a `[proactive]` credential has EXECUTE only on `record_notification`).
- Role floors + plan→approve — `assert_can_*` floors on every writer; approval binds to an expected revision token (fixes GAP0-5); posted lines immutable via trigger (fixes GAP0-4).

### 3.4 Maker/checker (Gate-1 C4)
- Every entry stores `maker_actor` (drafter/last human editor) and `checker_actor` (approver), modelled as distinct identities.
- `approve_entry` on the **high-stakes lane** RAISES if `checker_actor = maker_actor` and the firm has ≥2 eligible humans; solo firms record a `self_approval_attestation`.
- The agent identity can never be a `checker_actor` on its own postings, and sweep acknowledgements require a bookkeeper+ human. Enforced in the DB, not the UI.

### 3.5 Intrinsic subledger + counterparty entity (Gate-1 C2; fixes F3-1..8)
- A first-class **`counterparties`** table per client: id-keyed, typed (customer/supplier/both), with **`counterparty_aliases`** children (the PORT'd alias/normalise machinery). Rules, KB evidence, recon hints, and AR/AP open items FK to the counterparty id — so an alias repoint never splits history (fixes C-9). Counterparty **narrative** (who this vendor is, quirks, typical treatments) lives as wiki pages cross-linked to the entity id (Gate-1 C2 §3).
- **Subledger maintenance is intrinsic to the write.** Coding a sales invoice to Trade Debtors and recording the AR open item happen in **one audited transaction** (`code_and_open_ar(...)` composes the GL write + `record_ar_invoice` + counterparty link + the domain event). There is no path that posts the GL leg without the open item — the F3 dead-chain class is structurally impossible. Same for AP bills, bank receipts→allocations, and FA acquisitions→register rows.
- Bank matching gets **structural parity checks** (fixes GAP1-1/1-2): `match_bank_line` RAISES on wrong account/period/amount-beyond-tolerance and enforces entry-exclusivity (an entry can be matched once); re-match requires an explicit unmatch first.

### 3.6 Period integrity (fixes F12-*, B-1, GAP2-1, GAP5-*)
- Carry-down (`seed_opening_carry_forward`) is **one-shot + idempotent**: a per-client "opening seeded" registry row makes a second full seed RAISE; per-item idempotency keys allow safe incremental completion; a supersede-not-duplicate re-seed verb handles corrections. A TB tie-out is asserted.
- Year-end close is **serialized** (advisory lock per client) so no writer escapes into the just-locked FY (fixes GAP2-1); every continuity read (bank recon, AR/AP/FA tie-outs) is taught the **close segment** so it never double-counts the opening restatement (fixes F12-1/F3-7); reverse/re-open has an **ordering guard** (cannot reverse FY(n) under a live FY(n+1) close — fixes GAP5-3); the close lifecycle writes history receipts (fixes GAP5-2).

### 3.7 Idempotency + cancellation (fixes GAP4-1/4-4)
Insert-style writers (`draft_entry`, `record_accrual`, …) accept an idempotency key; a retry after a lost HTTP response is a no-op, not a duplicate. Runs are server-side cancellable (a real abort path), so a UI Stop actually halts the tool loop.

---

## 4. The agent runtime (Clara)

The prior runtime was a thin, process-local shell — all run/clarify/interruption state in an in-memory Map, lost on restart (Grt-1). The rebuild's runtime is defined by the requirements below, and the SDK recommendation is now firm (Gate-2 decision item):

### 4.0 Runtime recommendation (G1 — for Gate-2 ratification)

**Recommended: Vercel AI SDK 7 (`ai@7`) + Workflow DevKit (`workflow` + `@workflow/world-postgres`), self-hosted in the Clara service on Fly, all state in our own Postgres — behind the swap-seam. Named fallback: LangGraph JS + PostgresSaver.** Full evidence: `docs/phase2-research/runtime-recommendation.md`, **double-verified by two independent primary-source lanes on 2026-07-17** (a second lane re-fetched every decisive doc claim and corroborated all of them verbatim — record: `docs/phase2-research/runtime-recommendation-corroboration.md`).

Why it wins the decisive rows: the agent loop runs *inside* a step-checkpointed durable engine on our own Postgres (`'use step'` memoization = the strongest no-double-post story); hooks park clarify/approval interruptions for **days at zero compute** and resume on answer; approvals persist as HMAC-signable message parts in our DB; OTel tracing carries full-content spans to a DPA-covered vendor (Langfuse a concrete candidate) or self-host from the same code — so the C6 posture (ADR-011: Clara-controlled at launch, vendor OFF until gated) is a config flag, not a re-architecture; true model-agnosticism; Apache-2.0. The incumbent OpenAI Agents SDK loses on its own docs (parallel package-aliased SDK versions recommended for approvals pending across upgrades; no step engine); LangGraph ties on durability/HITL but re-executes an interrupted node from its top (a permanent idempotency burden) and gravitates to LangSmith; the Claude Agent SDK fails the stated model-agnosticism requirement.

**Two hard preconditions carried to Gate 2:** (1) a **1–2 week production spike** before the Phase-3 commitment — Supabase session-mode (5432) LISTEN/NOTIFY under the WDK world, and explicit redeploy-under-parked-hook + redeploy-mid-run acceptance tests (WDK's deploy docs are verified silent on in-flight-run replay across code deploys — the top risk; mitigations: pinned versions, name-versioned workflows, drain-active-runs deploy policy); (2) the **C6 checklist** (executed DPA + firm disclosure + PDPA cross-border check) before any firm data flows to the trace vendor. **If the spike fails, LangGraph JS becomes #1 behind the same seam.**

Integration shape (detail in the research file §6): engine schemas (`workflow_*`, `graphile_worker`) under a dedicated `clara_runtime` role with no `authenticated` grants; firm-facing **RLS-scoped projection tables** (`agent_tasks`, `agent_interruptions`, `wakes_outbox`) carry what the dashboard shows; clarify = a hook-parked tool; approvals = the `toolApproval` UX layer over the DB-owned authorization law (C3/C4); dual idempotency (step memoization + DB idempotency keys); `trace_id` threaded into task rows and audited-fn receipts; **runs execute independently of SSE attach** (closes the ghost-upload class D-1/E-1).

### 4.0a Runtime requirements (SDK-independent — bind whichever runtime ships)

1. **Durable run/task/checkpoint state** — `tasks`, `runs`, `run_steps`, `interruptions`, `tool_calls`, `checkpoints`, `wakes` are DB tables written *as the run progresses*, surviving restart/redeploy (the old schema had `tool_calls`/`artifact` columns that were never written — this is now the spine).
2. **Resumable HITL** — clarification and approval interruptions are durable, first-class objects correlated to a `clarify_id` and bound to the asking user (fixes GAP4-3); a run pauses at zero compute and resumes on the answer, days later, without double-posting.
3. **Typed tools + structured outputs + per-tool guardrails**, parallel tool calls.
4. **Durable-workflow checkpointing + idempotency + error recovery/retry** — completed steps do not re-run on replay; re-drive treats an already-approved entry as success (fixes the bulk-approve miscount).
5. **Tracing (Gate-1 C6, governed by PROJECTLOG ADR-011)** — the runtime writes full-content traces to **Clara-controlled Postgres storage**; the OTel path *can* export full-content to a DPA-covered vendor from the same code, but that export ships **OFF** and is enabled later only **minimized-first** and only after the DPA + **MIA client authorization** + PDPA-cross-border gate (ADR-011). The DB-backed run history is the durable audit record regardless.
6. **Structural post-workflow sync** — derived outcomes (notifications, KB/wiki updates, recon hints, export receipts) are written by the outbox/projection layer or asserted at run settle, **not** left to the model remembering (fixes Grt-13).
7. **SSE streaming** driven independently of whether a client is attached — a run started by any surface (chat rail, documents tab) **executes** (fixes D-1/E-1: never toast success on a fire-and-forget POST).
8. **MCP consumption, skills/progressive-disclosure, multi-agent/background jobs** (bulk approve, reconciliation sweeps) as durable jobs.

### 4.1 Tool catalog (G4-G6)
Curated typed tools, one per audited mutation class, plus the typed read surface + the audited read-only freeform tool. The catalog is generated from the DB function registry and lint-checked against it (fixes the doctrine drift where a tool named in doctrine had no ToolSpec and would hard-fail — F3-12/I-4). No shell/psql/file/web tools. Skill-load + context-pack retrieval are **gated before any consequential write** (fixes G9 convention-not-gate).

### 4.2 Grounding (G2)
In-context: the current doctrine pack (regenerated fresh against the real registry — fixes the wrong-OCR-vendor drift), the active skill, tool schemas, and the fresh context pack. Retrievable: the full PRD/architecture, the client wiki, historical data via typed reads. The exact in-context/retrievable split is documented and token-budgeted.

---

## 5. The knowledge layer — two-layer Karpathy wiki (Gate-1 B)

- **Layer 1 — the wiki.** Per-client interlinked markdown pages in Storage + a `wiki_pages` index (path, summary, provenance, version, cross-refs) in Postgres, maintained by three operations: **ingest** (an event/document updates the relevant pages, cross-refs, and an append-only wiki log), **query** (retrieve relevant pages → synthesise with citations → optionally file the analysis back), **lint** (scheduled; flags contradictions, stale claims, orphaned pages, gaps → owner). Pages are provenance-cited to immutable sources, versioned, and **injected into every context pack**. Wiki content is **inert data on read** (injection defence).
- **Layer 2 — typed authority.** `coa_mapping_rules` (user-gated), the `assert_client_resolved` gate, and first-class **`open_questions`** (must-ask) objects with resolution state that block workflows. The three memory-note needs map here (observation/profile → typed profile facts; must_ask → open_questions; rule_hint → low-evidence proposals).
- **The wiki informs; the typed layer decides.** No wiki page selects an account, lowers a gate, or authorises a write. This is the structural guarantee that replaces the old free-text-note injection surface (C-1).

---

## 6. The reporting engine (H)

Fixes H-1/H-2/H-4 (model-authored numbers laundered as DB-authoritative). Composable + schema-driven, not fixed templates:
- Clara translates intent → a **structured report spec** (scope, period, entity, filters, layout).
- The spec is executed by **DB read functions only** — every figure, total, and balance/verification claim comes from the DB (the `balanced` flag is DB-computed, never hard-coded true).
- Renderers (CSV/PDF/XLSX/UI artifact) **format** DB output; a model cannot inject a number or a balance claim into a rendered artifact. Free-text commentary is clearly labelled model-authored and never presented as a computed figure.
- Every export is persisted as a **durable, auditable artifact** with parameters, data-version token, permissions, and reproducibility — never a loose file, never model-authored bytes filed as authoritative (fixes H-1).

---

## 7. Document pipeline, storage doctrine + registry (E)

**Evidence-region capture is an ingestion requirement, not a UI choice** (design dependency #2): the OCR pipeline captures and persists **per-field bounding regions** (Azure DI returns `boundingRegions` — the old integration discarded them), so the `doc_review` side-by-side verification surface (the J-18 fix, "verified against source IS the approval act") can bind every journal-line field to its exact source span, validated at insert (invariant 2b).


Firm-scoped keys (`firms/{firm_id}/…`), an **Unassigned lane** for persist-after-OCR-before-assignment (every document persists immediately after OCR — fixes E2), a **storage move capability** so an assigned document's bytes actually relocate (the old wake lane could not move objects — E3), and every generated export in the export taxonomy as an auditable artifact. The document registry stays consistent across storage objects, DB rows, UI tabs, Clara's access, and the unassigned lane. Delete is never granted (reverse-not-delete + retention).

## 7a. Retention (fixes GAP3-4/3-5)
The 7-year statutory clock anchors at **period-end + filing date** (ITA s.82/82A, CA2016 s.245), not row-creation, and is recomputed on close; `legal_hold` gets a real audited writer.

---

## 8. Tax / SST engine

The compliance-correct core (Gate-1 C5). **The normative requirements document is `docs/phase2-research/accounting-practice-map.md`** — grounded in the owner's SST primary-source research (Acts, regulations, MySST manuals) + the frozen repo's tax evidence, with a source register. The engine implements, at minimum:

- **Registration & taxable-period model** — registration-effective dates, assigned period cycles incl. DG variations; the SST taxable period is its own scope axis distinct from the FY (fixes GAP3-1).
- **Service tax on the payment basis** on the now-real AR anchors + the s.11(2) 12-month rule + bad-debt relief + credit/debit-note deductions (fixes F3-8/GAP3-8 — no more silent accrual substitution).
- **Sales tax on the accrual basis**; output-only, no input credit anywhere.
- **Rate & sector schedule** maintained and effective-dated, incl. the 6%-retained sectors; MSIC informs classification (fixes GAP3-2).
- **Dual-registrant (`both`) separation that survives export** — per-tax declarations through PDF/XLSX/CSV, never a combined payable (fixes GAP3-3/H-13).
- **The SST-02 return** with per-field form mapping, NIL validity, imported-taxable-services reverse charge, and group/B2B exemption awareness.
- **The draft tax computation** (add-backs, capital allowances, chargeable income, Form C/P/B, CP204) as the **last v1 slice**, allowed to slip to v1.1 (owner ruling).

Payroll = coding + the built deadline calendar (practice-map Part 3). Inventory = periodic closing-stock adjustment at close with a completeness check (practice-map §2.9). The practice map's Part 5 v1 scope ledger is the scope authority for Phase 4.

---

## 9. Cross-cutting

- **Security/isolation** — the PORT'd RLS + EXECUTE-only spine + firm-scoped credentials + the cross-firm isolation rig (kept as a go-live gate) + **live authority revocation** (removed/demoted members lose access immediately — fixes GAP1-4).
- **Observability** — DB-backed run history (always) + Clara-controlled OTel storage at launch; vendor export OFF until the ADR-011 gate (DPA + MIA client authorization + PDPA), minimized-first when enabled.
- **Ops / DR / CI (fixes GAP1-5/1-6/1-7)** — CI **applies the real `packages/db` schema and tests the agent runtime** (the old CI tested the decommissioned schema — the misleading-green defect); a real **backup/restore/DR contract** for the 7-year source of truth; **readiness probes + SLOs + alerting** (not liveness-only); the event log gives point-in-time replay for derived state.
- **AI-quality eval (fixes GAP3-6)** — a falsifiable eval harness (attribution precision/abstention, coding accuracy by document class, must-ask recall, auto-post precision) is a **real Phase-5 gate**, not waived.
- **Per-firm guardrails (fixes GAP4-5)** — metering, token/spend budgets, run-concurrency caps, fail-closed usage limits.

---

## 10. What this fixes, mapped

| Failure pattern (audit) | Architectural fix |
|---|---|
| 1 · dead subledger chain | §3.5 intrinsic subledger (same-txn side-effects) |
| 2 · no durable state | §4 durable runtime tables |
| 3 · no event/context layer | §2 event log + context packs + freshness |
| 4 · read tool can write | §3.2 structural read-only role |
| 5 · upload silently no-ops | §4(7) runs execute independent of SSE attach |
| 6 · dead generative-UI | §4 + design docs (card protocol) |
| 7 · period integrity | §3.6 idempotent carry-down, serialized close, segmented reads |
| 8 · governance prompt-deep | §0/§3.3/§3.4 structural invariants + maker-checker |
| 9 · reporting launders numbers | §6 DB-owned figures only |
| 10 · ops/verification/compliance | §9 CI/DR/eval/guardrails |
| 11 · doctrine drift | §4.1 registry-generated tool catalog + lint gate |
| 11a · bank-match integrity (GAP1-1/1-2) + evidence regions (J-18) | §3.5 structural match-parity + entry-exclusivity; §7 per-field bounding-region capture + the `doc_review` verification surface |

---

## Appendix A — Slice-0 spike results (2026-07-17): the durable engine is GO, with a binding versioning policy

The Slice-0 spike ran against the fresh hosted Supabase project (`spike/RESULTS.md` is the evidence record). **T1–T6 ALL PASS.** Decisive findings, now binding on the build:

1. **At-least-once is real; the DB idempotency key is the floor** (T4, empirically): the engine re-invoked a step whose transaction had already committed; only `ON CONFLICT (op_key)` kept the books at exactly one posting + the same receipt (`wasDuplicate: true` in the run's return value). Every audited mutation carries an idempotency key — permanent, mandatory (Codex refinement 1, confirmed).
2. **The world self-recovers active runs at startup** (undocumented): re-enqueues in-flight runs under their dedup key, bypassing dead workers' stale locks — crash recovery was automatic (~5s) in T4. Parked runs count as "active" and replay their memoized prefix harmlessly on every boot.
3. **No run pinning on self-hosted WDK** (T6, the hazard): an in-place edit to a workflow body **silently changes the semantics of the un-executed remainder of every in-flight run** — no error, no old-semantics preservation. A silent-correctness hazard for accounting workflows. **Mitigation proven:** name-versioned workflows — old parked runs completed on pure V1 semantics while new enqueues rode V2.
4. **BINDING VERSIONING POLICY (from T6):** (a) a deployed workflow body is immutable once any run can be in flight; every behavioral change ships as a new exported workflow (`_v2`, `_v3`, …), the old export retained until zero non-terminal runs reference it; (b) enqueue sites always target the newest version; a CI freeze-lint (golden-hash per frozen workflow) forbids editing frozen bodies; (c) renaming/deleting an export with in-flight runs is forbidden (workflowName derives from path+export — a rename strands parked runs); (d) in-place hotfixes only for provably pre-park-idempotent step-body bugs.
5. Operational notes: the runtime reads `WORKFLOW_POSTGRES_URL` (not `DATABASE_URL` — mapped in the worker entry); engine timestamps are tz-naive (display only); Supavisor session-mode LISTEN/NOTIFY verified at 32ms with sub-second job pickup.

Remaining before final Slice-0 sign-off: the 48-hour park check-in (armed 2026-07-17 15:15 +08, resume due ≥2026-07-19 15:15 +08).
