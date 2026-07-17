# PROJECTLOG — Clara rebuild

> Append-only decision log — the durable "why it is this way." Supersede a decision with a NEW entry; don't rewrite old ones. Build narrative / commit hashes / status do NOT belong here — those live in git, the plan, and memory.
> Artifacts-of-record (cite, don't duplicate): `docs/prd/PRD.md`, `docs/architecture/ARCHITECTURE.md` (+ Appendix A), `docs/design/DIRECTION.md`, `docs/plan/REBUILD-PLAN.md`, `docs/audit/` (Gate-1 evidence + rulings), `docs/00-GATE-2-README.md`, `docs/phase2-research/`.

---

> **START HERE.** Clara is a greenfield **AI-native Agentic Accounting OS** for Malaysian accounting firms, rebuilt from the frozen prior BELCORT build. This repo (`github.com/mosaladtaooo/clara`, `main` PR-only) is the active workspace. The old repo `initial acc software skillmd` + Supabase `belcort-shared` are FROZEN read-only audit evidence (untouched until Phase-5 decommission). The DB owns every number; the agent orchestrates. Phase 3 (foundations) is in progress: Slice 0 (spike) + Slice 1 (foundations) done; Slice 2 (governed DB core) next.

---

## PART 1 — DECISIONS (append-only)

### ADR-001 — Greenfield rebuild on a fresh repo + fresh Supabase project
**Decision:** Rebuild Clara in a new repo (`clara-rebuild` → `github.com/mosaladtaooo/clara`) and a new Supabase project (`clara-rebuild` = `bzecqklouchkmdmdxlln`, ap-southeast-1, PG17). The prior build (`initial acc software skillmd` + `belcort-shared`) stays frozen read-only as the audit's evidence until Phase-5 sign-off.
**Why:** The Phase-1 audit found the prior build's "go-live-ready" claim structurally false (235 verified findings, 11 failure patterns) — the fix is a re-architecture of the orchestration/state/governance/UX layers on a mostly-salvageable DB layer, not a patch. Evidence: `docs/audit/`.

### ADR-002 — The four firm-killing invariants are STRUCTURAL DB guarantees (Gate-1 C3)
**Decision:** Client attribution (≥0.95, DB-gated), provenance binding (`source_doc_sha256`+`document_id` validated in-txn), wake authority (allowlist per wake kind), and write authorization (structural read-only agent role — no EXECUTE on writers + `default_transaction_read_only`) are enforced in the DB, not by model/prompt discipline. Everything judgement-flavored (coding, materiality, close-readiness) stays visibility-first.
**Why:** The audit proved the prior build's prose-only gates leaked (the read tool could write — SDT-001; provenance unvalidated — GAP0-1). Draw the hard-constraint boundary exactly where the prose demonstrably leaked. Ref: ARCHITECTURE §0/§3.

### ADR-003 — Maker/checker: modelled always, hard-gate high-stakes only, agent never signs (Gate-1 C4)
**Decision:** Every entry records maker + checker as distinct identities. Distinct-approver is a HARD DB gate only on the high-stakes lane (tax-affecting, closed-period, large-amount, year-end, opening balances) where the firm has ≥2 eligible staff; routine entries keep the one-person flow; solo firms record a self-approval attestation. The agent can never satisfy a human sign-off.
**Why:** Audit-defensible segregation of duties without breaking small-firm reality.

### ADR-004 — KB = two-layer Karpathy wiki that informs but never decides (Gate-1 B)
**Decision:** Replace the prior write-only memory-note layer with a per-client Clara-maintained markdown **wiki** (ingest/query/lint, provenance-cited, injected into every context pack) over a thin **typed authority** layer (user-gated coa-mapping rules, the ≥0.95 gate, first-class open-question objects). The wiki informs every decision but never selects an account or lowers a gate; wiki content is inert data on read. Per the Karpathy LLM-wiki pattern. Supersedes the stale prior KB design notes.
**Why:** A compounding client-knowledge layer without an LLM-written file gating money. Ref: ARCHITECTURE §5, PRD §6a.

### ADR-005 — Counterparties split + INTRINSIC same-transaction subledger (Gate-1 C2)
**Decision:** Port the proven alias/normalise + recon-hint machinery; build a first-class id-keyed counterparty entity; counterparty narrative lives in the wiki. Subledger maintenance is intrinsic to the coding/receipt execution — the audited write composes the GL leg + the AR/AP open item in ONE transaction. No path posts the GL leg without the open item.
**Why:** Structurally kills the F3 "dead subledger chain" (the audit's #1 theme — the prior build's subledger writers had zero callers). Ref: ARCHITECTURE §3.5.

### ADR-006 — v1 scope = the compliance-correct core (Gate-1 C5)
**Decision:** SST done right (taxable-period model incl. DG variations, service-tax payment basis + s.11(2) 12-month rule, dual-registrant separation surviving export, maintained rate/sector schedule, SST-02, bad-debt relief); live AR/AP subledgers + FA register + depreciation + disposal; honest MPERS financial statements **including the cash-flow statement** (MPERS S.3 requires it — the Gate-1 "SoCE+notes" floor would itself overclaim without SCF); the draft tax computation as the LAST v1 slice (may slip to v1.1); payroll = coding + deadline calendar (no engine); inventory = periodic closing-stock at close.
**Why:** Matches the prior build's ADR-044 ambition, grounded in `docs/phase2-research/accounting-practice-map.md`; the SCF inclusion was surfaced + owner-ratified at Gate 2.

### ADR-007 — Event-driven state layer + context packs + freshness (the North-Star spine)
**Decision:** Every audited write appends a domain event + a transactional outbox row; a relay drives projections + wakes (at-least-once + idempotent consumers). Before any accounting decision Clara retrieves a fresh context pack carrying a books-version token; a stale token forces re-fetch. A declarative, versioned trigger taxonomy routes each event type.
**Why:** The prior build had no event layer, no context pack, no freshness (audit A-1..A-7) — stale figures replayed as authoritative. Ref: ARCHITECTURE §2, PRD §7.

### ADR-008 — Runtime = Vercel AI SDK 7 + Workflow DevKit, self-hosted on our own Postgres (Gate-2)
**Decision:** Adopt the AI SDK 7 model layer + Workflow DevKit durable substrate (`@workflow/world-postgres`), self-hosted on the project's own Postgres, behind a swap-seam. Named fallback: LangGraph JS + PostgresSaver. Model-agnosticism is "keep the provider seam + a tested exit plan," NOT a hard veto (Codex-reframed). The incumbent OpenAI Agents SDK and the Claude Agent SDK were excluded (no durable step engine / model-lock respectively).
**Why:** The #1 prior-build failure was process-local state lost on restart (Grt-*). Durable execution for agents is the 2026 convergence; every serious TS durable-agent lane builds on the AI SDK model layer. Three independent lanes concurred. Preconditions: the Slice-0 spike (passed) + the C6 tracing checklist. Ref: `docs/phase2-research/runtime-recommendation.md` (+ addenda, corroboration, sdk-gap-analysis, codex-cross-check).

### ADR-009 — Durable-engine step memoization is NOT exactly-once; DB idempotency keys are the mandatory floor
**Decision:** Every mutation carries a stable idempotency key (unique; returns the original receipt on duplicate). The workflow engine reduces re-execution but cannot guarantee exactly-once — a step's DB txn can commit and the worker die before the engine records completion, so replay may re-invoke it.
**Why:** Empirically proven by the Slice-0 spike's kill-after-commit test (T4): the engine re-invoked a committed step; only `ON CONFLICT (op_key)` kept the books at one posting. Codex flagged this as the strongest counter-argument and it was confirmed. Ref: ARCHITECTURE Appendix A, `spike/RESULTS.md` T4.

### ADR-010 — BINDING workflow-versioning policy (no run pinning on self-hosted WDK)
**Decision:** A deployed workflow body is immutable once any run of it can be in flight; every behavioural change ships as a new `_vN` export (old export retained until zero non-terminal runs reference it); enqueue sites target the newest version; renaming/deleting an export with in-flight runs is forbidden. Enforced by a CI freeze-lint that golden-hashes each frozen workflow + its import closure and compares append-only vs `origin/main` (a changed/removed/renamed frozen entry is a hard REJECT); `"use workflow"` files must be frozen+registered.
**Why:** The spike (T6) proved self-hosted WDK has no run pinning — an in-place edit silently changes the un-executed remainder of every in-flight run (a silent-correctness hazard for accounting). Name-versioning fully mitigates it. Ref: ARCHITECTURE Appendix A.

### ADR-011 — Tracing: Clara-controlled storage at launch; vendor export gated on DPA + MIA client authorization (Gate-2 C6)
**Decision:** The runtime writes full-content run traces into our own Postgres. Cloud-vendor trace export ships feature-flagged OFF, enabled later only after: an executed DPA, firm-facing client authorization (MIA By-Laws require *specific* authority to disclose outside the firm — a DPA regulates the processor but does not itself confer it), documented PDPA cross-border basis, short retention, tested deletion, and field-level minimization. When enabled, start minimized, not blanket full-content.
**Why:** The prior build exported every firm's chat/OCR/tool payloads to a vendor by default (GAP1-8). Two reviewers + MIA By-Laws converge: our own store covers debugging/audit; a third-party copy of client books is a professional-confidentiality decision, not a debugging convenience. The owner initially preferred full-content-under-DPA; the Codex cross-check + MIA finding moved the launch posture to self-controlled-first with owner consent. Ref: `docs/phase2-research/codex-cross-check.md` Q2.

### ADR-012 — Anti-"misleading-green" CI (test the REAL artifact)
**Decision:** CI applies real migrations to a throwaway `postgres:17` service (never a live project) and runs a deploy-onto-existing check (apply `origin/main` migrations, THEN HEAD) so an edited historical migration fails CI; plus freeze-lint, leak-scan (with redaction + gitleaks second layer), typecheck, build, smoke test, and a real DR backup/restore round-trip. Destructive DB scripts refuse without a disposable-target sentinel.
**Why:** The prior build's CI tested a decommissioned schema (GAP1-5) — a green that proved nothing. A green check must mean something. Established in Slice 1; hardened after a two-lane review found 2 CRITICAL freeze-lint bypasses. Ref: `.github/workflows/ci.yml`, ARCHITECTURE §9.

### ADR-013 — Workspace/harness relocated to the rebuild repo; prior parent doctrine deleted
**Decision:** `C:\Users\zhant\Desktop\clara-rebuild` is the active Claude Code working directory. Its own `CLAUDE.md`/`AGENTS.md`/this PROJECTLOG + the `.claude/` skill + `.mcp.json` (codebase-memory + shadcn; supabase MCP dropped — CLI/management-API used instead) are the harness. The stale parent `Desktop\CLAUDE.md` (old-plane doctrine that loaded for this dir too) was deleted; rebuild-relevant memory was migrated to this project's memory namespace and the reverted-first-attempt memories dropped. The codebase-memory graph is (re)indexed on this repo; the old repo's index remains as frozen evidence.
**Why:** The harness pointed at / lived in the frozen old repo, polluting rebuild sessions with stale old-plane context. Owner-directed cleanup (2026-07-17). The old repo + Supabase remain frozen evidence — only the *workspace* moved.

---

## PART 2 — OPEN ITEMS
- **Slice-0 close-out:** resume the 48h parked WDK run (armed ~2026-07-17 15:15 +08; resume ≥2026-07-19 15:15 +08) to fully sign off Slice 0.
- **C6 checklist (ADR-011):** the DPA execution, firm-facing disclosure text, and PDPA cross-border check are OWNER/legal work items before any vendor trace export; engineering keeps the flag OFF until all three are evidenced.
- **Owner housekeeping:** rotate the Supabase `sbp_` access token (it passed through a session transcript).
- **Billing / scale guardrails, MyInvois depth, tax-comp v1-vs-v1.1 slip** — deferred product questions (PRD §9).
