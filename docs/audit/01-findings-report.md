# Clara Phase 1 Audit — Findings Report

*Generated from the verified per-workstream finding sets. Every finding was produced by an auditor citing frozen-repo evidence, then re-opened and refuted-by-default by an independent adversarial verifier; only survivors appear here. Severities follow the brief's rubric: **critical** = correctness / isolation / audit-integrity / data-loss / firm-killing; **high** = a North-Star-blocking capability gap; **medium** = materially weakens a workflow or trust; **low** = polish.*

## Summary counts

| Workstream | Findings | Crit | High | Med | Low | Refuted | Unverified |
|---|--:|--:|--:|--:|--:|--:|--:|
| **A · Accounting state, events & governance** (`A`) | 16 | 0 | 7 | 8 | 1 | 0 | 5 |
| **B · Onboarding** (`B`) | 15 | 1 | 3 | 8 | 3 | 1 | 7 |
| **C · Knowledge, memory & counterparties** (`C`) | 16 | 0 | 2 | 9 | 5 | 0 | 6 |
| **D · Chat panel & interaction model** (`D`) | 17 | 1 | 6 | 8 | 2 | 0 | 8 |
| **E · Document pipeline & storage** (`E`) | 13 | 1 | 2 | 6 | 4 | 0 | 7 |
| **F · Accounting engine — year-end & tax coverage** (`F12`) | 15 | 1 | 5 | 7 | 2 | 0 | 6 |
| **F · Accounting engine — side-effects & subledger sync** (`F3`) | 12 | 3 | 6 | 3 | 0 | 0 | 7 |
| **G · Agent runtime — statefulness, resumability, sync** (`Grt`) | 15 | 0 | 4 | 9 | 2 | 0 | 4 |
| **G · Agent runtime — grounding, DB context, tool surface, safety** (`Ggr`) | 13 | 1 | 2 | 9 | 1 | 0 | 5 |
| **H · Reporting & exports** (`H`) | 16 | 0 | 4 | 7 | 5 | 0 | 6 |
| **I · Skills & harness architecture** (`I`) | 16 | 1 | 2 | 7 | 6 | 0 | 7 |
| **J · Frontend & UX** (`J`) | 29 | 1 | 8 | 14 | 6 | 0 | 8 |
| **X · Cross-cutting gaps (completeness pass: ops, security, compliance, concurrency)** (`GAPS`) | 42 | 10 | 26 | 6 | 0 | 0 | 12 |
| **TOTAL** | **235** | **20** | **77** | **101** | **37** | 0 | — |

---

## Workstream A — Accounting state, events & governance

### `A-1` · **HIGH** · No context-pack layer exists: Clara's run context is static doctrine + the last <=40 chat turns of prose; every piece of client/accounting context is a model-initiated ad-hoc read
*Hero-prompt item: A1*

**Evidence**
- `agent/src/doctrine/loader.ts:91-109 - systemInstructions = SOUL + AGENTS + skill-routing menu + wake-routing lines + reference index only; no client data`
- `agent/src/runtime/openai/runtime.ts:160-173 - one static Agent per tool policy (agents Map keyed on policy); instructions never vary per client/run`
- `agent/src/runtime/openai/runtime.ts:60-78 + agent/src/http/sessions.ts:253-270 - cross-turn 'memory' = last 40 chat_messages replayed as raw prose (cap 100), no other injection`
- `agent/src/http/server.ts:340-366 - POST /chat resolves scope -> loadHistory -> startRun(message, history); nothing else is injected`
- `belcort/coa-coding/SKILL.md:47-49 - 'Load the ClientContext once per coding session - browse the client's tables' (query_books prose, model-dependent)`
- `agent/src/tools/registry/reads.ts:6-147 - the named read surface has no client-profile/context read tool (only TB, TB-range, journal_entry_detail, firm_activity_feed, resolve_counterparty, auto_draft_review_batch, get_job/list_jobs, suggest_recon_counterparty); client_overview exists as a DB fn (db/v2/28-fns-reads.sql:840) but is not a named tool`
- `agent/src/runtime/inject.ts:86-96 - a wake run's entire input is the framing + read-hints + the fenced id envelope`

**What is wrong / missing** — There is no structural guarantee that Clara sees client profile, FY/period, MSIC, SST status, COA, document/journal/approval/reversal history, recon exceptions, or any 'books version' before a decision. Whether context is loaded, how fresh it is, and whether it is complete depends entirely on the model obeying skill prose via query_books. A wake run gets even less: a minimal id envelope plus read-back instructions.

**What the rebuild must do** — A DB-assembled, versioned client/accounting context pack retrieved at run start (and re-retrieved on invalidation) - profile, FY/period state, SST status, COA policy, KB rules, open exceptions, recent history, books version - injected by the layer, not left to model initiative.

### `A-16` · **HIGH** · Gate 0 (client identity >=0.95) is model-self-reported: client_match_conf is persisted verbatim and never enforced by any fn
*Hero-prompt item: A3*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:223-231 - ingest_document persists (p->>'client_match_conf')::numeric verbatim; grep-verified client_match_conf appears ONLY in the table DDL and this insert - no floor, no derivation, no gate anywhere in db/v2`
- `db/v2/22-fns-documents-recon.sql:30-68 - assign_document checks firm ownership and unassigned-status only; no confidence input or gate`
- `docs/reference/confidence-ladder.md:17-21,32-42 - the ladder calls this input 'deterministic, persisted' and gate 0 the firm-killer axis`
- `belcort/doc-ingest/SKILL.md:70-99 - client inference is model judgment over table browses (bank accounts, email domains, aliases, legal name, SSM, TIN); the 0.95 threshold lives in prose only`

**What is wrong / missing** — The single control the product itself calls firm-killing (never guess the client) has no structural teeth within a firm: the confidence number is an LLM's self-assessment, recorded but never validated or gated on by the DB. Cross-FIRM is sealed by RLS; cross-CLIENT within the firm rests on prompts plus the interactive clarify flow.

**What the rebuild must do** — DB-owned identity gating: assignment/drafting fns require a recorded match basis and refuse/park below the floor; identity evidence (which signals matched) persisted for audit.

### `A-2` · **HIGH** · Event distribution is fire-and-forget with at least five independent loss points and no durable event log, outbox, or replay
*Hero-prompt item: A1*

**Evidence**
- `db/v2/25-fns-ops.sql:1430-1457 - belcort_proactive_emit wraps net.http_post in EXCEPTION WHEN OTHERS -> 'raise warning' (enqueue failure swallowed); comment 1453-1455: 'live HTTP drops land in net._http_response' - verified nothing in the repo consumes net._http_response; no retry anywhere`
- `agent/src/http/wakeGate.ts:9-14,110-136 - in-memory governor: a new-window submit beyond ratePerMin/firm is DROPPED ('rate_limited', line 124); clearPending() drops every open window WITHOUT firing (131-136); timers unref'd - at-most-once by design`
- `agent/src/main.ts:184,236 - windowMs 15s, ratePerMin 6; shutdown calls wakeGate.clearPending() dropping pending batches unfired`
- `agent/src/runtime/openai/runtime.ts:42,497-507 - a dispatched wake run is killed at 90s (wake_run_timeout) mid-learning; 130-137,196-205,444-468 - all run state is a process-local Map (restart loses everything; drainWake deletes the record at settle)`
- `agent/src/http/server.ts:204,229 - wakesEnabled:false and rate_limited both answer 202 with no durable record of the dropped event (console.info/error only, 217-227)`
- `docs/architecture/backend.md:87,92 - the docs call these wakes 'durable out-of-band wakes'`

**What is wrong / missing** — Every hop from a committed DB change to Clara acting on it is best-effort: pg_net enqueue -> HTTP POST (no retry) -> in-memory gate (rate-drop, shutdown-drop) -> in-memory run map -> 90s drain deadline. The KB/agent-context synchronization the target requires can silently not happen, and nothing records that it did not. Recovery depends on a human visiting a read surface. The repo's own docs call these wakes 'durable', which is false at every layer above the notification row itself.

**What the rebuild must do** — A transactional domain-event log/outbox in the DB (same commit as the mutation), with durable consumers, retries, and an auditable dispatch/consumption record - events as first-class rows, not webhooks-as-hints.

### `A-3` · **HIGH** · KB/books synchronization is LLM-mediated, never transactional - and chat-mediated human decisions never emit the learn event at all
*Hero-prompt item: A1*

**Evidence**
- `belcort/coa-coding/SKILL.md:275-288 - coding-time KB evidence (Step 6) is a prose instruction the model may or may not execute`
- `belcort/kb-evolve/SKILL.md:164-183,258-290 - wake-time learning (record_kb_evidence, record_recon_hint) is model-executed inside a lossy, 90s-capped wake run`
- `db/v2/25-fns-ops.sql:1522-1524 - recorded 'KNOWN ASYMMETRY': a human approving THROUGH CHAT rides the tool layer which injects actor='agent' - chat-mediated review decisions do not (yet) teach`
- `agent/src/tools/buildTools.ts:82-89 + agent/src/runtime/openai/runtime.ts:183,362 - actor is always 'agent' for every agent-executed write, so trg_pn_workbench/trg_pn_bank_match (25-fns-ops.sql:1531-1548) never fire for them`
- `belcort/kb-evolve/SKILL.md:306-326 - the compensation ('On a chat-mediated human self-reconcile' - self-record the learn inline) is again pure prompt discipline`

**What is wrong / missing** — The client knowledge base is only 'continuously synchronized' to the extent a language model reliably executes multi-step prose procedures across lossy runs. The one deterministic learn direction (rule decay on reject/edit-away) is in-transaction; the positive direction (evidence accrual) never is. An entire class of human decisions (made via chat) produces no durable learn signal whatsoever.

**What the rebuild must do** — Learning signals derived transactionally from the committed verbs themselves (approve/edit/reject/match write their own evidence events in the same transaction), with the model consuming events rather than being the event bus.

### `A-4` · **HIGH** · Trigger taxonomy is a static condition->lane map with no risk/materiality/period-status keying, and whole families of human-direct events emit nothing
*Hero-prompt item: A2*

**Evidence**
- `db/v2/25-fns-ops.sql:1464-1548 - the COMPLETE emit inventory (re-verified exhaustive: belcort_proactive_emit is wired only in this file): je_needs_human, kb_proposal_open, recon_unbalanced, new_document, new_bank_line, document_triaged, workbench_committed, bank_line_matched - 8 conditions total`
- `db/v2/25-fns-ops.sql:1531-1537 - trg_pn_workbench WHEN action in ('approved','edited','rejected') - human REVERSALS excluded (db/v2/22-fns-documents-recon.sql:821-825 writes 'reversed'/'reversal' history rows; the only in-transaction trace of a reversal's rule impact is the non-waking client_kb_audit 'flag' row at 22:832-837)`
- `No emit trigger exists on coa_audit (COA add/retire/reclassify), client_profile_audit (incl. sst_regime/tax-status changes via update_client_profile, 24-fns-onboard.sql:434-478), firm_profile_audit, client_fy_close (close/reopen), client_kb_audit (governance verbs - belcort/kb-evolve/SKILL.md:346-348 admits they 'have NO durable wake source in v2'), export_receipts, or any subledger/FA/adjustment/tax/SST engine write`
- `agent/src/http/wakes.ts:30-40 - static CONDITION_WAKE_KIND lookup; unknown -> 'proactive'; agent/src/http/wakeGate.ts:81-98 - batching by (firm,condition,client) + per-firm token bucket; nothing reads estimated_risk, confidence, amount, or period status`
- `agent/src/main.ts:182-184 - the only 'policy' knobs are 15s window / 6 per min / 30 per batch; the sole materiality logic anywhere is the >=5x-median prose heuristic in belcort/review-queue/SKILL.md:452-454, executed by the model`

**What is wrong / missing** — Which events proactively trigger Clara is an accident of relay history, not a designed taxonomy: an entry parking in needs_review triggers her; a human reversing a posted entry, changing a client's SST registration, editing the COA, or closing a year triggers nothing. There is zero risk-, materiality-, or period-keyed trigger logic in code.

**What the rebuild must do** — A DB-owned trigger policy: every domain event classified, with routing/priority keyed on risk tier, materiality, and period status, and an explicit registry of which events wake the agent, notify humans, or both.

### `A-5` · **HIGH** · The auto-post lane's six gate conditions are prompt-only: the DB enforces the status<->risk label binding, not the substance
*Hero-prompt item: A3*

**Evidence**
- `db/v2/20-fns-journal.sql:128-158 - finalize_coding validates ONLY: status enum (137), auto_draft<->estimated_risk='auto' binding (140-143), entry is 'drafting' (148). No check of kb_rule_id presence, rule confidence, must_ask_flags emptiness, or tax-leg absence for the auto lane`
- `db/v2/20-fns-journal.sql:95-99 - draft_entry checks a cited rule is CONFIRMED and THIS client's, but never that the rule's pattern matches the entry description or that its account_code appears in the lines`
- `db/v2/20-fns-journal.sql:101-110 - journal_entries.confidence and must_ask_flags are persisted verbatim from the model's jsonb`
- `belcort/coa-coding/SKILL.md:161-165 - the six auto-gate conditions (confirmed rule, conf >=0.95, balanced, empty flags, no tax leg, open period) live only in skill prose; docs/reference/confidence-ladder.md:139-144 claims 'the ladder's verdict cannot be faked at write time' - true only for the LABEL binding, not the gates`
- `Compensating controls that ARE enforced: closed-period guard (db/v2/25-fns-ops.sql:297-322), deferred balance trigger (db/v2/15-triggers.sql:33-75), auto-draft oversight sweep (25-fns-ops.sql:1209-1292)`

**What is wrong / missing** — An entry with confidence 0.2, non-empty must_ask_flags, a tax leg, and no KB rule can be finalized auto_draft/auto - posted unsupervised - if the model (or any authenticated same-firm caller of finalize_coding) says so. The 'deterministic ladder' (must-ask detection, rule matching, confidence, collision detection, estimated_risk derivation) is executed entirely by the LLM in prose; the DB stores its self-report. Only balance, closed-period, and rule-citation-validity are structurally enforced.

**What the rebuild must do** — DB-enforced gate: finalize_coding (or its successor) refuses the unsupervised lane unless a confirmed rule is cited, flags are empty, no tax-coded line exists, confidence clears the floor - the autonomy/materiality kernel the rebuild specifies.

### `A-7` · **HIGH** · No stale-context detection of any kind: no books/KB version token, no invalidation, and stale figures from earlier chat turns replay verbatim into later runs
*Hero-prompt item: A4*

**Evidence**
- `Exhaustive grep for stale/freshness concepts across agent/src + belcort: the only hits are belcort/review-queue/SKILL.md:419 (wake-time 'stale condition -> finish silently' read-back rule) and belcort/coa-coding/SKILL.md:228 ('stale sst_regime' named as an escalation reason) - both prose, neither machinery`
- `agent/src/http/sessions.ts:253-270 + agent/src/runtime/openai/runtime.ts:60-78 - prior assistant turns (including numbers read from the books hours earlier) are folded into every new run with no timestamps, no version markers, no invalidation when the books change mid-session`
- `db/v2 - no version/sequence column exists on clients, client_kb_rules, or the books (verified by grep over 10-tables-core.sql, 12-tables-kb.sql, 13-tables-client.sql); the only watermarks are auto_draft_sweep_log and dashboard-seen state`
- `db/v2/24-fns-onboard.sql:434-478 - update_client_profile (e.g. sst_regime change) writes client_profile_audit; no emit trigger, no wake, no session invalidation follows (client_profile_audit is absent from the exhaustive 25-fns-ops.sql PART 7 emit inventory, and 'clients' is not in wakes.ts BOOKS_TABLES)`

**What is wrong / missing** — If a human edits the client profile, changes SST registration, retires a KB rule, or reverses entries while a chat session is open, Clara's next turn carries the old world-state as authoritative-looking history. Nothing detects stale KB, stale books, changed tax status, or recent human edits; the sole freshness discipline is 'read the DB back' prose inside wake procedures.

**What the rebuild must do** — Versioned state (books version / KB version / profile version) + event-driven invalidation of any cached or replayed context, with the context pack (A-1) re-fetched on change.

### `A-10` · **MEDIUM** · Agent-run traceability gap: wake runs and tool calls leave no durable record; interactive transcripts persist only user text + final assistant prose; dropped wakes and active-run state vanish
*Hero-prompt item: A4*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:80-99,130-137 - RunRecord (policy, input, pending clarify) is an in-memory Map; 444-468 - drainWake deletes the record at settle; wake runs never carry a session (95-97)`
- `agent/src/runtime/openai/runtime.ts:285-292 + agent/src/main.ts:159-179 - only the final assistant prose is persisted (best-effort persistAssistant); tool calls, intermediate reads, and clarify Q/A are not stored anywhere`
- `agent/src/http/server.ts:217-230 - wake dispatch/drop visibility is console.info/202 responses only; no DB row records a dispatched, rate-limited, or failed wake`
- `Contrast: the DB side IS traceable (journal_entry_history/audit tables with before/after) - the gap is the agent plane`

**What is wrong / missing** — An agent-led decision is traceable only through its terminal DB writes. Why a wake did or did not produce a notification, what a run read before drafting, which wakes were dropped, and any run interrupted by restart are all unreconstructible.

**What the rebuild must do** — DB-backed tasks/runs/tool-call/interruption records (the durable-runtime requirement) so every recommendation and trigger outcome is auditable.

### `A-11` · **MEDIUM** · Actor attribution is weak on the ops-engine fns and the 'agent' label is caller-assertable everywhere, which also silences the human-verb learn-wakes
*Hero-prompt item: A4*

**Evidence**
- `db/v2/25-fns-ops.sql:385 (record_year_end_close), 845 (record_opening_balances), 171 (record_export), 1288 (acknowledge_auto_draft_sweep, blank -> 'agent') - the ops engines accept free-text p_actor with only a non-empty check and never call app.audit_actor (grep-verified: no audit_actor call in 25-fns-ops.sql)`
- `db/v2/00-foundation.sql:212-229 - app.audit_actor lets ANY caller stamp the literal 'agent' (constrained only for other labels); its own header (205-211) records the 'a human labels their own firm's row agent' residual as accepted-with-visibility. It IS applied across the journal-review, KB, document/recon-triage, and profile fns (grep: 20-fns-journal, 21-fns-kb, 22-fns-documents-recon, 24-fns-onboard) - but not the ops engines above`
- `db/v2/25-fns-ops.sql:1526-1548 - trg_pn_doc_triage/trg_pn_workbench/trg_pn_bank_match all fence on actor is distinct from 'agent' - a spoofed 'agent' label suppresses the wake/learn event`

**What is wrong / missing** — Audit rows on the close/opening/export/sweep engines record whatever string the caller supplied, and any caller can label a write 'agent' - simultaneously corrupting attribution and switching off the event fences that A2's taxonomy depends on (a recorded, accepted residual - but governance requires attribution the caller cannot choose).

**What the rebuild must do** — Layer/DB-derived actor identity on every mutation (JWT-derived, never caller-supplied), with the agent principal a real distinguishable principal, not a string.

### `A-12` · **MEDIUM** · firm_activity_feed unions only 6 audit sources - COA changes, firm-profile edits, year-end closes, sweep sign-offs, and memory notes are invisible in the firm's one audit surface
*Hero-prompt item: A4*

**Evidence**
- `db/v2/25-fns-ops.sql:1115-1160 - the feed CTE unions exactly journal_entry_history, client_kb_audit, client_profile_audit, document_audit, export_receipts, bank_match_audit`
- `coa_audit (db/v2/13-tables-client.sql:147-160), firm_profile_audit (00-foundation.sql:456-465), client_fy_close (14-tables-ops.sql:197+), auto_draft_sweep_log, client_memory_notes all exist but have no feed source (verified against the union list)`

**What is wrong / missing** — 'Every action visible in one feed' is only 6 of 11 audit families; a COA reclassification or a year-end close - both accounting-material - never appear. The raw tables are RLS-readable, but the governance surface humans actually use is partial.

**What the rebuild must do** — A complete, uniformly-cursored event/audit feed generated from the single domain-event log rather than hand-unioned sidecars.

### `A-13` · **MEDIUM** · new_document / new_bank_line / je_needs_human triggers have no actor fence: the agent's own ingest and coding fire proactive wakes about its own in-flight work
*Hero-prompt item: A2*

**Evidence**
- `db/v2/25-fns-ops.sql:1464-1472,1494-1502 - trg_pn_je/trg_pn_je_upd/trg_pn_doc/trg_pn_bsl WHEN clauses gate on status only (contrast the Track-2c human-verb triggers 1526-1548 which fence actor is distinct from 'agent')`
- `agent/src/main.ts:184 + agent/src/http/wakeGate.ts:124 - every wake window consumes the 6/firm/min token budget at submit, before the runtime decides anything; new_document/new_bank_line wakes are real model runs (je_needs_human is handled deterministically, runtime.ts:383-442, but still consumes the budget)`
- `belcort/review-queue/SKILL.md:419 - the mitigation is prose: read back, 'stale condition -> finish silently'`

**What is wrong / missing** — An interactive ingest-and-code turn generates wake work about itself (doc lands ingested -> wake; entry parks needs_review -> wake), consuming the small per-firm wake budget (6/min) that real out-of-band changes need, and relying on model-side read-backs to stay silent. The taxonomy conflates 'something changed' with 'something the agent did not already know changed'.

**What the rebuild must do** — Origin-aware events (actor/source on every event) so self-caused changes never re-trigger the agent, and the rate budget serves genuine external changes.

### `A-15` · **MEDIUM** · The document/OCR 'index + retrieval layer' is one jsonb column with two competing schemas and prose-SQL retrieval
*Hero-prompt item: A1*

**Evidence**
- `db/v2/10-tables-core.sql:64-104 - documents.ocr_cache jsonb is the entire OCR index; no FTS index (only firm/client/status/kind/financial_date btrees), no extracted-field columns beyond invoice_date/financial_date, no vector/semantic store anywhere in db/v2 (grep-verified)`
- `belcort/review-queue/SKILL.md:429-450 - duplicate detection and field reads are model-written SQL over coalesce(ocr_cache->'fields', ocr_cache->'extracted_fields') (the acknowledged dual-shape drift)`
- `belcort/_shared/ocr-cache-schema.md is the referenced contract while doc-ingest/SKILL.md:197-206 admits the producer writes a different, flatter shape ('Either is accepted while the producer catches up')`

**What is wrong / missing** — Retrieval over documents (dedup, cross-doc lookups, 'find the prior invoice') is ad-hoc jsonb probing whose key paths differ by producer era. There is no indexed, versioned document/OCR layer for either the agent or future retrieval to build on.

**What the rebuild must do** — A typed, indexed extraction store (per-field columns or validated jsonb + generated columns/FTS) with one enforced schema version.

### `A-6` · **MEDIUM** · Deterministic je_needs_human wake handler swallows the rest of a batch when the first entry has settled, and dedup-keys the whole batch on the first entry
*Hero-prompt item: A2*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:394 - const entryId = entryIds[0]! (only the first record is read back via journal_entry_detail, 396-398)`
- `agent/src/runtime/openai/runtime.ts:404-406 - if the FIRST entry's status is no longer needs_review/needs_decision, return true -> the wake is treated as handled; no notification for the remaining N-1 batch entries`
- `agent/src/runtime/openai/runtime.ts:417-424 - dedup_key `je:<first entryId>:needs_review` (line 422) for a multi-entry batch; the title (410-411) counts the total but the key does not`

**What is wrong / missing** — A coalesced batch (15s window can hold up to 30 entries) where entry #1 was already reviewed produces no notification for the others; a later batch with a different first id re-notifies for overlapping sets. Recoverable via the dashboard needs-attention read surface, but the notification plumbing is wrong for exactly the batched case the gate was built for.

**What the rebuild must do** — Per-record read-back and per-record (or set-correct) dedup in the deterministic wake path.

### `A-8` · **MEDIUM** · Real coding path uses far less context than the target list: MSIC named in the context-load prose but consumed by no step or DB logic, no business-description field, exact-match-only rule retrieval, history/patterns unused
*Hero-prompt item: A3*

**Evidence**
- `db/v2/10-tables-core.sql:22 - clients.msic_code exists; verified by grep across db/v2: it is only inserted (24-fns-onboard.sql:301-305), patched (24:469), and echoed in client_overview (28-fns-reads.sql:840) - NO coding/tax/validation logic reads it; coa_accounts.msic_ind_code (10:52) likewise only seeded/echoed`
- `belcort/coa-coding/SKILL.md:47-49 names msic_code in the Step-1 ClientContext load, but no subsequent step (2-7) ever uses it - loaded-but-unused prose, not a coding input`
- `No business_description/industry column exists on clients (grep-verified); the only home is advisory client_memory_notes (db/v2/27-fns-memory.sql:2-31 - 'It NEVER decides an account or touches client_kb_rules')`
- `belcort/coa-coding/SKILL.md:54-78,126-129 - the prescribed match is pattern equality against client_kb_rules (plus the custom_instruction hint); db/v2/21-fns-kb.sql:44-56 - resolve_counterparty is a single-level normalized-exact alias map; no fuzzy/semantic retrieval exists anywhere (grep: no tsvector/FTS/embedding in db/v2)`
- `Historical postings, approval/reversal history, and vendor patterns beyond the exact-pattern rulebook appear nowhere in the coding procedure (coa-coding Steps 1-6); journal history is only consulted by kb-evolve wake learns`
- `Bank narrations feed only the recon-hint matcher (db/v2/22-fns-documents-recon.sql:580-686), i.e. line->counterparty matching, not account coding`
- entity_type, sst_regime, default_sst_treatment, directors, and the OCR extract ARE genuinely in the prescribed path (coa-coding Steps 1,4,5) - the strongest real inputs

**What is wrong / missing** — A3's answer: coding is 'raw extract + exact-match KB rules + a handful of client fields', executed by the model. MSIC code, industry, business description, prior COA usage, posting history, and approval/reversal history are either stored-but-unread or absent from the schema. There is no retrieval layer (no FTS, no embeddings, no candidate ranking) - a rule fires only on exact canonical-name equality, so learning generalizes to nothing beyond the literal counterparty.

**What the rebuild must do** — Context-aware coding that structurally consumes the full signal set (industry/MSIC, description, history, patterns, tax rules) through a real retrieval/ranking layer with recorded inputs.

### `A-9` · **MEDIUM** · KB evidence is an aggregate tally with zero provenance: no entry/document link, in-run dedup lives only in model memory, double-counting is acknowledged and tolerated
*Hero-prompt item: A4*

**Evidence**
- `db/v2/21-fns-kb.sql:170-211 - record_kb_evidence(client, pattern, account, increment): upserts an aggregate counter in client_kb_rules_history; no entry_id, no source_doc_sha256, no per-sighting row`
- `db/v2/12-tables-kb.sql:49-63 - client_kb_rules_history is (pattern, account_code, evidence_count, last_seen_at) only, 'Deliberately NOT FK-constrained on account_code'; no provenance columns`
- `belcort/kb-evolve/SKILL.md:180-183,273-276 - 'One entry, one increment - if you already recorded for this entry id in THIS run, skip' (model-memory dedup) and 'Known tolerated overlap: ... double-counts the pair - harmless: ... only the tally inflates'`

**What is wrong / missing** — You cannot answer 'which transactions taught this rule?' - the evidence trail that justifies a proposal (and eventually a confirmed auto-posting authority) is an unattributable integer. Replay, dedup, and audit of the learning loop are impossible; inflated tallies can cross the >=3 proposal threshold from repeated wakes on the same entry.

**What the rebuild must do** — Per-sighting evidence events carrying entry/document provenance, with idempotency enforced by the DB (unique on source event), aggregates derived.

### `A-14` · **LOW** · Doctrine/docs contradict the code on wake authority, durability, and the OCR engine - the 'living SoT' premise is already drifted
*Hero-prompt item: A1*

**Evidence**
- `docs/architecture/backend.md:92 - 'Every wake is speak-never-act' vs agent/src/tools/buildTools.ts:19-26 (the documents lane may call every write fn except the 5 onboarding/bootstrap ones) and agent/src/runtime/inject.ts:38-39 ('[documents] Act on the human's verb')`
- `docs/architecture/backend.md:87,92 - 'durable out-of-band wakes' vs the at-most-once in-memory gate (A-2)`
- `belcort/AGENTS.md:50 (par. 6) - 'Google Document AI' vs Azure Document Intelligence in code (agent/src/main.ts:124-131, agent/src/ocr/azureDocai.ts); backend.md:89 says Azure; even buildTools.ts:310 still says Google in a comment - the loaded doctrine itself is wrong`
- `belcort/doc-ingest/SKILL.md:197-206 - the OCR-cache canonical schema vs the 'flatter' live-produced shape, with consumers told to coalesce both forever (review-queue/SKILL.md:429-450)`
- `agent/src/doctrine/loader.ts:130-148 - only .md files load; the GL-Account-TaxNIndustriesCode.pdf shipped in 3 skill dirs (glob-verified: coa-coding, review-queue, rule-edit) can never be served to the model`

**What is wrong / missing** — The doctrine the model executes and the architecture docs the rebuild will mine disagree with the code on load-bearing facts (what a wake may do, whether events are durable, which OCR engine reads documents). Any port that trusts the prose inherits the errors.

**What the rebuild must do** — Doc-vs-code reconciliation as a gate before salvage; single-sourced generated contracts where possible.

#### Verified as sound (workstream A)

- Human-led and agent-led workflows genuinely converge on one shared state plane: the dashboard calls the same audited SECURITY DEFINER fns as the agent's curated tools, so books/KB/document state (as data) is never forked between planes  ·  _evidence:_ `dashboard/lib/workbenchActions.ts (approve_entry/reject_entry/edit_entry via rpcBooks, actor from token); dashboard/lib/activity.ts:83-92 (reverse_entry), dashboard/lib/documentActions.ts:137-142 (assign/reassign_document), dashboard/lib/kbActions.ts:28 (promote_proposal), dashboard/components/records/CoaBrowser.tsx:35-40,80-86 (add_coa_account/set_coa_account_active/set_coa_account_type); agent/src/tools/registry/*.ts - identical fn names; actor injected by the layer (buildTools.ts:82-89)`
- Per-mutation auditability at the DB is real: append-only history/audit sidecars with before/after jsonb snapshots and reversal lineage exist for journals, KB, documents, profiles, and matches  ·  _evidence:_ `db/v2/10-tables-core.sql:200-214 (journal_entry_history with before/after, action set incl. reversed/reversal), db/v2/12-tables-kb.sql:96-108 (client_kb_audit before/after jsonb); db/v2/22-fns-documents-recon.sql:820-825 (dual 'reversed'/'reversal' rows), db/v2/25-fns-ops.sql:1162-1183 (reverse lineage computed in the feed)`
- Where learning IS wired transactionally it is well-built: reject/edit-away decays the cited rule in the same transaction (auto-retire at 3 overrides, evidence preserved), evidence >=3 auto-files an idempotent human-gated proposal, and alias canonicalization happens inside record_kb_evidence so variants cannot fork tallies  ·  _evidence:_ `db/v2/21-fns-kb.sql:130-161 (app.decay_rule_on_override, sole decay writer, not grantable), 21-fns-kb.sql:187-207 (canonical resolve + confirmed/retired suppress + partial-unique idempotent proposal via uq_kb_proposal_open, 12-tables-kb.sql:88-89); db/v2/20-fns-journal.sql:259,345 (reject_entry and edit_entry call app.decay_rule_on_override in-transaction)`
- Wake envelopes are minimal id+verb payloads with the DB as truth, injection-fenced at every interpolation, and the doctrine mandates provenance read-back before any wake action  ·  _evidence:_ `db/v2/25-fns-ops.sql:1435-1450 ('Deliberately NOT the row's before/after payloads - the envelope stays minimal ids+verb'); agent/src/runtime/inject.ts:1-96 (control-char strip, guillemet fence, 4000-char cap), agent/src/http/wakes.ts:119-155 (strict envelope validation, allowlisted extras only); belcort/review-queue/SKILL.md:390-396 and belcort/kb-evolve/SKILL.md:146-153,240-246 (mandatory read-back / zero-row -> stop)`
- Self-wake loops are structurally prevented on the learn lanes and the kb chain is bounded one hop  ·  _evidence:_ `db/v2/25-fns-ops.sql:1526-1548 (actor is distinct from 'agent' fences on the three human-verb sources; workbench additionally via_fn-gated to the three review fns; unmatch fenced out via action='matched'); db/v2/25-fns-ops.sql:1474-1482 (kb_proposal_open deliberately creator-agnostic but idempotent + rate-bounded + one hop deep); agent/src/tools/buildTools.ts:19-26 (workbench-kb writes limited to record_kb_evidence/record_recon_hint/record_proactive_notification)`
- The most common wake (je_needs_human) is handled deterministically without a model run - typed read + audited notification under the minted wake JWT (modulo the A-6 batch bug)  ·  _evidence:_ `agent/src/runtime/openai/runtime.ts:383-442 (recordDeterministicProactive: journal_entry_detail read-back + record_proactive_notification, no model loop)`
- Hard accounting-state invariants are DB-enforced independent of the agent: deferred Sigma-dr=Sigma-cr balance at commit, closed-period posting lock, auto_draft<->risk-label binding, confirmed-rule-only citation  ·  _evidence:_ `db/v2/15-triggers.sql:33-75 (SECURITY DEFINER deferred constraint triggers on entries AND lines); db/v2/25-fns-ops.sql:297-322 (closed-period guard, close-machinery exempt via via_fn); db/v2/20-fns-journal.sql:137-143 (label binding), 95-99 (confirmed-rule citation)`
- The agentless books-changed SSE nudge keeps human dashboards refetch-fresh without agent cost, correctly separated from agent wakes at the front door  ·  _evidence:_ `agent/src/http/wakes.ts:50-64,130-134 (BOOKS_TABLES allowlist; books_changed never becomes a wake); agent/src/http/server.ts:187-196 (books -> coalescer nudge / notifications -> hub 'proactive'; no agent run)`
- Proactive notifications are durable, dedup-keyed rows (not chat ephemera), and wake output is forced through them because wake runs have no chat reader  ·  _evidence:_ `agent/src/runtime/inject.ts:27-42 (no-chat framing in every wake note); agent/src/runtime/openai/runtime.ts:417-435 (dedup_key + source_ref); belcort/review-queue/SKILL.md:477-483 (pre-write open-dedup check)`

#### Unverified (workstream A) — could not be confirmed from frozen evidence; carried as open

- The audit brief (undefined/audit-brief.md) and three of the four evidence maps (agent-map.md, doctrine-map.md, dashboard-map.md) do not exist on disk - only undefined/maps/db-map.md exists (re-verified 2026-07-17). Verification proceeded on the task-text contract: repo treated as read-only, writes confined to undefined/, severity rubric critical=live correctness/security exposure, high=architectural gap vs the workstream target, medium=bounded defect, low=hygiene/drift. Every citation above was re-opened against the actual files.
- Live deployment state: whether SUPABASE_JWT_SECRET (wake credential), per-firm belcort_webhook_config rows, and Azure OCR env are actually configured in production - i.e. whether ANY wake fires live today - is not verifiable from the frozen repo (agent/src/main.ts:133-138 makes wakes honestly disabled without the secret).
- Model compliance with doctrine (context loading in coa-coding Step 1, Step-6 evidence recording, wake procedures, the chat-mediated self-teach compensation) - no eval harness exists in the repo (docs/architecture/backend.md:104 defers the accuracy eval), so all prose-governed behavior is unverifiable statically.
- OpenAI Agents SDK internals (RunState preserving full context across clarify suspend/resume; interruption field shapes) - asserted in code comments; agent/README.md:243-245 itself flags 'Verify before real books: the exact SDK run_item/interruption field names' - not executable in this audit.
- Whether any external scheduler (e.g. Supabase cron) exists live for periodic sweeps/digests - no evidence in the repo; the runtime itself has no scheduler, so the static conclusion is 'none', but a live-project cron cannot be ruled out from code alone.

#### Decision brief (workstream A)

> Distance from the Workstream-A target (adversarially re-verified; all 16 findings stand, 14 as-written and 2 with evidence-precision fixes): the DB layer is a genuinely strong transactional substrate - one shared state plane for human and agent verbs, per-mutation append-only audits with before/after snapshots, and a handful of well-built in-transaction couplings (rule decay, proposal thresholds, balance/closed-period locks). But there is no event-driven accounting state layer in the target sense. Domain events exist only as fire-and-forget webhooks with at least five loss points and no outbox/log/replay (A-2); the trigger taxonomy is a static 8-condition relay port with zero risk/materiality/period keying and entire missing families - reversals, COA changes, tax-status changes, closes, KB governance (A-4). Clara has no context pack: her world-state is static doctrine plus 40 turns of replayed prose, with all grounding left to model-initiated reads and no stale-context detection anywhere (A-1, A-7). The governance story inverts the product's own claims at the two highest-stakes points: the auto-post lane's six gates and the 0.95 client-identity gate are both model-self-reported values the DB stores but does not enforce (A-5, A-16), and the KB learning loop is LLM-mediated end-to-end, unattributable to source transactions, and silent for chat-mediated human decisions (A-3, A-9). Traceability is solid for state, absent for agent behavior (A-10) and partial at the feed surface (A-12). Verdict for the rebuild: salvage the audited-fn/audit-sidecar substrate and the wake fencing/injection-defence patterns as reference designs; the event backbone (transactional outbox + durable consumers), context-pack builder, DB-enforced ladder gates, provenance-carrying learning events, and versioned/invalidation-aware state must be new architecture - none of it exists to port.

---

## Workstream B — Onboarding

### `B-1` · **CRITICAL** · seed_opening_carry_forward has no idempotency or already-seeded guard — a re-run silently DOUBLES the entire opening position
*Hero-prompt item: B1*

**Evidence**
- `db/v2/25b-fns-opening.sql:206-315 — the orchestrator has no check for pre-existing opening entries, no idempotency key on per-item seeders (ar_invoices/ap_bills have unique(entry_id) only — invoice_no/bill_no are plain non-unique text, db/v2/19-tables-subledger.sql:37,48,111,120), and step-2's balance check (25b:249-260) recomputes OBE across ALL opening entries: after run 1 plugged OBE to 0, run 2 with the same payload re-passes the check (items re-credit OBE by X, gl_lines net credit X) and posts everything again, plugging OBE back to 0`
- `db/v2/25b-fns-opening.sql:300-308 — the client_financial_position snapshot upserts on (client_id, as_of_date), so the doubled totals overwrite the snapshot with in_balance still TRUE (assets = liab + equity holds at 2x) — no signal anything is wrong`
- `db/v2/24-fns-onboard.sql:243 (seed_client_coa on-conflict-do-nothing) and 24:384-419 (seed_client_knowledge idempotent on pattern/account and kind/note) — every OTHER onboarding writer IS idempotent; the carry-forward is the exception`
- `dashboard/lib/useOnboardingRun.ts:33-35 — the dashboard explicitly relies on 'the agent's idempotent onboard tools make safe' a fresh-start reload; that assumption is false for the carry-down`
- `db/v2/25-fns-ops.sql:835-894 — record_opening_balances is equally unguarded (no pre-existing-opening check) and coexists with the carry-forward (both granted to authenticated, both agent tools: agent/src/tools/registry/onboard.ts:61-75 + ops.ts:91-107); nothing but skill prose (belcort/client-onboarding/SKILL.md:296-298) prevents running both`
- `db/v2/tests/opening_carry_forward_test.sql (CF1-CF4) and db/v2/tests/opening_balances_test.sql — no test ever re-runs a seed; no test covers the duplicate case`
- `contrast db/v2/14-tables-ops.sql:222 — uq_fy_close_live gives the close family exactly the one-live-row DB guard the opening family lacks`

**What is wrong / missing** — The single most consequential onboarding write (an ongoing client's whole opening TB, subledgers, FA register) can be posted twice with zero resistance and zero surfacing. The trigger path is real and documented: the interview run is non-durable (B-4), a reload restarts it, and the sanctioned recovery ('a later chat session can capture it', SKILL.md:314) is exactly a second seed_opening_carry_forward call. Combined with B-8 (opening entries cannot be reversed and subledger rows have no void path), a double-seed is silent books corruption with no clean repair.

**What the rebuild must do** — Carry-down must be a one-shot, DB-guarded operation: a per-client 'opening seeded' registry row (or partial unique on live opening state) that makes a second full seed raise loudly; per-item idempotency keys for incremental completion; and a supersede-not-duplicate re-seed verb for corrections — mirroring uq_fy_close_live's design for the close family.

### `B-2` · **HIGH** · No intra-firm role floor on the onboarding/carry-down write family — a viewer can onboard clients, post approved opening journals, and write advisory memory (the confirmed-KB-rule leg is DB-blocked)
*Hero-prompt item: B1+B2*

**Evidence**
- `db/v2/24-fns-onboard.sql:258-351 (onboard_client) and 24:111-248 (seed_client_coa) — neither calls any app.assert_can_* role floor; contrast update_client_profile 24:449 and add_bank_account 24:605-607 which call app.assert_can_review`
- `db/v2/25b-fns-opening.sql:40-315 — all four opening seeders (which post status='approved' entry_kind='opening' journals directly) have no role floor; db/v2/25-fns-ops.sql:843-845 — record_opening_balances likewise; all granted EXECUTE to authenticated`
- `db/v2/24-fns-onboard.sql:367-424 — seed_client_knowledge has no floor of its own; its NOTES leg lands via record_memory_note (db/v2/27-fns-memory.sql — no assert_can_* anywhere in the file), so a viewer can seed advisory memory. Its RULES leg is NOT bypassable: the nested create_kb_rule asserts admin+ (db/v2/21-fns-kb.sql:316 app.assert_can_manage_kb, which reads the CALLER's JWT role — db/v2/00-foundation.sql:176-185), so a sub-admin seed with rules raises 'forbidden' and the atomic seed rolls back — the draft claim that a viewer can mint confirmed rules is REFUTED`
- `dashboard/app/(dash)/firms/[slug]/clients/new/page.tsx:5,34 — the page gates clients.create=admin and its comment claims 'onboard_client re-enforces via RLS — defense in depth', which is false: RLS enforces firm isolation only; any member (including a rank-1 viewer) with a session JWT can call the EXECUTE-granted fns directly via PostgREST (the dashboard-direct rpcBooks plane proves the wire exists)`
- `db/v2/90-isolation-tests.sql:180-183 — isolation tests prove cross-FIRM denial (BLC02) for the seeders, but no test in db/v2/tests/ proves any intra-firm role denial for onboard_client/seed_client_coa/the opening family (role-floor tests exist for kb/approve/triage/firm-profile only: kb_rbac_test.sql, approve_entry_test.sql:166, document_triage_test.sql:160, update_firm_profile_test.sql:50)`

**What is wrong / missing** — The dashboard's admin gate is presentation-only for the onboarding and opening-balance write family: a viewer can create clients, seed COAs, and post the takeover opening position (approved journals + FP snapshot) with one HTTP call — the plan→approve law for the most consequential onboarding writes has no DB enforcement. The KB rulebook floor, by contrast, DOES hold through seed_client_knowledge (admin+ asserted inside the nested create_kb_rule), so the confirmed-rule surface is not part of this gap; only advisory memory notes are viewer-writable.

**What the rebuild must do** — Every onboarding/carry-down mutation class needs an explicit DB-owned authorization floor (admin+ for onboard/seed families, consistent with the KB rulebook and the clients.create UI gate), asserted inside the SECURITY DEFINER fn like update_client_profile does — never only in the UI — plus rbac tests proving the intra-firm denial.

### `B-3` · **HIGH** · Run completion is read as success and post-commit verification covers only the client row — a failed or never-reached carry-down/KB-seed still shows an unqualified success card
*Hero-prompt item: B2*

**Evidence**
- `dashboard/lib/stageReducer.ts:130-131 — 'done' maps to phase 'success' unconditionally, whatever the run actually accomplished`
- `agent/src/runtime/openai/runtime.ts:258 — settleRun(rec,'completed',…) fires on ANY final model output; a seed_opening_carry_forward raise the model narrates ('surface the exact text and STOP', belcort/client-onboarding/SKILL.md:256-258) settles the run as completed`
- `dashboard/app/(dash)/firms/[slug]/clients/new/ClientOnboardLive.tsx:85-112 — the commit re-read verifies ONLY the client row + COA count; nothing re-reads the opening position, FP snapshot, or seeded KB`
- `dashboard/components/onboarding/cinematic/CarryDownReview.tsx:32-33 + ClientOnboardCinematic.tsx:244 — the review card's error prop is fed only state.error (transport errors: stall/unknown-run/agent-down, useOnboardingRun.ts:104-116); a DB fn raise never reaches it`
- `dashboard/components/onboarding/client/ClientOnboardCinematic.tsx:119-129 — the false-success guard exists ONLY for the missing-client-row case (commitUnverified)`

**What is wrong / missing** — For an ongoing client, 'onboarded' without the opening position is materially false — the books tie out to nothing at the takeover date — yet the flow renders the same success card whether carry-down posted, raised opening_carry_forward_unbalanced, or was never reached because the run died after onboard_client. The one verification that exists (client row) proves the WRONG invariant for the B1 requirement.

**What the rebuild must do** — The success card must verify the full committed outcome for the path taken: client row + (when carry-down was proposed/confirmed) the opening FP snapshot / opening entries + KB seed counts, with an explicit 'carry-down not captured — resume here' state instead of silent omission.

### `B-4` · **HIGH** · The whole interview lives in one process-local, non-durable run where any plain assistant sentence ends onboarding — with two observed production failure modes documented in the skill itself
*Hero-prompt item: B2*

**Evidence**
- `belcort/client-onboarding/SKILL.md:35-43 — 'a single stray sentence between questions ends the run after just one answer (this is the observed onboarding-stops-after-Q1 failure)'; SKILL.md:84-91 — 'the observed SSM-format-reject → hard-exit bug' aborting 'with NO client created'; the sole mitigation is prompt discipline ('emit nothing but clarify_tool calls')`
- `agent/src/runtime/openai/runtime.ts:136 ('private readonly runs = new Map<string, RunRecord>()'), :3-4 (streamRun generator suspends on clarify awaiting a side-channel answer), :80-99 and :482-495 (bounded in-memory retention; abandoned runs evicted) — active interview state is process-local; an agent deploy/restart mid-interview destroys it`
- `dashboard/lib/useOnboardingRun.ts:33-35 — 'Cross-visit resume is intentionally dropped on v2 (the run pointer is in-memory only): a reload begins a fresh interview'; :106-107 — 3 consecutive unknown-run polls surface 'This onboarding session ended.'`
- `belcort/firm-bootstrap/SKILL.md:32-39 — identical fragility on the firm interview ('a single stray sentence between questions ends the run after just one answer')`
- `dashboard/lib/useOnboardingRun.ts:157-165, 215-225 — a stray plain-text turn is synthesized as a clarify with clarifyId null; answering it posts a NEW chat turn/run, so even the graceful path re-orients instead of continuing`

**What is wrong / missing** — This directly answers B2's question: the flow is agentic, but end-to-end continuation is guaranteed by nothing but the model's obedience to a MANDATORY prose rule the authors already watched it break twice in production. A half-initialized client (committed identity, no carry-down, no KB) is a normal outcome of a mid-flow death, and there is no guided resume — a fresh interview hits client_exists (SKILL.md:152, whose only guidance is 'ask the user, don't retry blindly'), leaving completion to unstructured chat, which then collides with B-1.

**What the rebuild must do** — Durable, DB-backed interview/run state (the ADR-122 target's tasks/runs/checkpoints/interruptions) with a structural pause primitive that does not depend on the model never emitting prose, plus a resumable onboarding checklist (identity → carry-down → KB) whose incomplete steps persist and re-surface.

### `B-10` · **MEDIUM** · The deterministic fallback silently onboards a stripped client: no banks, no directors/aliases, no carry-down, no KB — with no warning or follow-up
*Hero-prompt item: B2*

**Evidence**
- `dashboard/lib/clientWizard.ts:94-115 — buildClientPayload hard-codes bank_accounts/directors/email_domains/aliases to []`
- `dashboard/lib/clientOnboardingScript.ts:3-6 — 'the four array fields + management-accounts upload are deferred'`
- `dashboard/components/onboarding/client/ClientOnboardFallback.tsx — zero occurrences of carry/opening/knowledge/bank (grep) — the form never mentions what it skipped`
- `belcort/client-onboarding/SKILL.md:331-332 — 'a cold start is NOT acceptable' is the product's own bar; the fallback ships one`
- `dashboard/app/(dash)/firms/[slug]/clients/new/ClientOnboardLive.tsx:165-172,196-197 — the fallback is the sanctioned degradation whenever the live run errors (which B-4 shows is easy), so this is a common path, not an edge`

**What is wrong / missing** — An ongoing client onboarded through the fallback has books that tie out to nothing at takeover and an agent starting cold, and the user is never told or given a to-do; no dashboard surface anywhere invokes seed_opening_carry_forward or seed_client_knowledge afterwards (grep across dashboard/: only the cinematic's in-run review), so completion depends on the user spontaneously asking chat.

**What the rebuild must do** — The fallback must end with an explicit 'still to capture: opening position, bank accounts, day-one knowledge' checklist that deep-links into a resumable completion flow (chat or workbench), and the client record should carry a visible onboarding-incomplete state.

### `B-11` · **MEDIUM** · Live-lane validation is model-enforced prose and the dry-run→commit equivalence is honor-system
*Hero-prompt item: B2*

**Evidence**
- `belcort/_shared/validators.md:1-58 — validate_ssm/validate_tin/validate_msic are markdown specs the model applies mentally; belcort/client-onboarding/SKILL.md:63-65 confirms 'there is NO code_execution/Python runtime in v2'`
- `db/v2/24-fns-onboard.sql:276-308 — onboard_client validates only enums/fye/band/legal_name; ssm_no, myinvois_tin, msic_code are stored as arbitrary text (no DB-side format check)`
- `dashboard/lib/clientWizard.ts:52-83 — the FALLBACK form has real code validators (validateSsm/validateTin at :58,:66), i.e. the deterministic lane validates more strongly than the AI lane`
- `dashboard/app/(dash)/firms/[slug]/clients/new/ClientOnboardLive.tsx:114-116 — 'WYSIWYC: the agent commits exactly the dry-run profile' is asserted, but nothing machine-compares the committed row to the approved [[dryrun]] JSON; the re-read binds only slug/tier/coa_count (+ a legal-name match) (dashboard/lib/resolveOnboardResult.ts:20-45)`

**What is wrong / missing** — B2 asks whether the flow 'can store flawed data': yes — a model that mis-applies the prose validators or assembles a payload differing from the approved dry-run stores malformed SSM/TIN/MSIC (or altered fields) with only the human's eyeball on the dry-run card as defense; the DB accepts it.

**What the rebuild must do** — Move identifier format validation into the DB fn (structural, fail-loud like invalid_field) or a deterministic tool, and have the stage verify the committed row equals the approved dry-run profile field-by-field (a true WYSIWYC check, extending the existing commit re-read).

### `B-14` · **MEDIUM** · Client-KB initialization exists but is thin, chat-only, and hostage to the fragile run — no dashboard path, no structural-knowledge carry
*Hero-prompt item: B1+B2*

**Evidence**
- `db/v2/24-fns-onboard.sql:367-424 + agent/src/tools/registry/onboard.ts:44-59 — seed_client_knowledge (confirmed rules @1.000 + advisory notes) exists, is atomic/idempotent, and is proven (db/v2/90-isolation-tests.sql:780-853)`
- `grep dashboard/ for seed_client_knowledge: zero occurrences — no dashboard surface ever seeds or completes the KB; the only path is the skill's Phase D/D-seed inside the same non-durable run (belcort/client-onboarding/SKILL.md:328-367), after the commit and carry-down, i.e. the part most likely never reached when the run dies (B-4)`
- `belcort/client-onboarding/SKILL.md:156-168 — the sample-invoices step exists only as a [[step:14/14]] clarify with an attach affordance; onboardingChapters.ts:13-26 doesn't list sample_invoices as a chapter field (clientFieldPresentation.ts:58-59 has the upload rail, so it renders, but progress/chapters end at management_accounts)`
- `belcort/client-onboarding/SKILL.md + db/v2/25b — no carry of structural client knowledge for an ongoing client: recurring-journal templates, mid-life amortisation schedules, partnership PSR (set_client_partners exists at db/v2/23c-fns-adjustments.sql:486-580 but onboarding never captures it), or recon hints`

**What is wrong / missing** — B1 requires onboarding an existing client to initialize the client KB: the mechanism is real and well-guarded (human-confirmed rules only, advisory evidence via record_kb_evidence), but its delivery is the tail end of a brittle single run with no fallback, no dashboard surface, and no completion tracking — and 'knowledge' covers only coding rules/notes, not the operational fixtures an ongoing client arrives with.

**What the rebuild must do** — KB seeding becomes a first-class resumable onboarding step (workbench surface + chat), with completion state on the client, and the carry-down scope extends to structural fixtures (partners' PSR for partnerships, recurring/amortisation templates) or explicitly tracks them as to-dos.

### `B-5` · **MEDIUM** · FA carry-down baseline vs cumulative-target model: any historical depreciation-policy mismatch produces a silent first-run catch-up lump or a silent depreciation holiday
*Hero-prompt item: B1*

**Evidence**
- `db/v2/23b-fns-fixed-assets.sql:174-193 — the charge is v_target − v_accum where v_target is re-derived from cost/in-service/life-or-rate; the carried baseline only pins Σ recorded, it does not make the model respect the old policy`
- `db/v2/25b-fns-opening.sql:180-185 — the baseline row pins accumulated depreciation but nothing validates the carried accum against the model's target at as_of or surfaces the delta`
- `db/v2/tests/opening_carry_forward_test.sql:79-106 (CF2) — the only continuation test uses an EXACT-match case (24 months of SL@36m on 300000 = precisely the carried 200000); no test covers carried accum ≠ model target`
- `belcort/client-onboarding/SKILL.md:250-253 — the skill promises 'NEVER re-charges the past' but gives no guidance to choose useful_life_months/rate so the model's implied history matches the carried accum`

**What is wrong / missing** — Example (verified against the 23b arithmetic): cost 300000, carried accum 150000 under the client's old reducing-balance policy, onboarded as straight_line/36m in service since 2023-01 → model target at first post-takeover month (elapsed 25) ≈ 208333 → one silent 58333 catch-up charge; carried accum 250000 → months of zero charge until elapsed catches up. Both misstate post-takeover P&L with no warning, no assumptions[] surface, no visibility read — an ISA 510 / MPERS prospective-continuation failure mode for exactly the ongoing-client case B1 exists for.

**What the rebuild must do** — At seed time, compute the model's implied accumulated depreciation at as_of and either require the caller to reconcile (fail-loud with the delta) or record a policy-transition row and surface the first-run delta as a confirmation, mirroring the tax engine's assumptions[]/confirmations_needed[] honesty layer.

### `B-6` · **MEDIUM** · Per-item model is bypassable and aging dates default away: control accounts are accepted in gl_lines, and omitted invoice/due dates collapse the takeover aging profile
*Hero-prompt item: B1*

**Evidence**
- `db/v2/25b-fns-opening.sql:253-277 — the only lump-entry check is NET equality (gl_cr − gl_dr = OBE net); nothing excludes marker-bearing control accounts (DC/CC/AD/FA-cost) from gl_lines, so a self-balancing full TB with empty ar_items/ap_items/fa_assets seeds lump AR/AP with EMPTY subledgers — accepted at seed time, surfaced only later by ar/ap_control_tie_out (23-fns-subledger.sql:585-591) / fa_control_tie_out (23b:425) reads`
- `belcort/client-onboarding/SKILL.md:244-247 — 'Do NOT put the AR/AP control totals or the FA cost/accum-dep here' is prose-only; no enforcement`
- `db/v2/25b-fns-opening.sql:67-68 and :108-109 — invoice_date/due_date (bill_date/due_date) default to as_of; ar_aging/ap_aging (db/v2/23-fns-subledger.sql:440-534, buckets keyed on due_date vs as_of at :451-457) then report every carried item as current at takeover — the true historical age (e.g. already 90+ days overdue) is erased and the aging clock restarts at as_of; the skill passes dates only when present (SKILL.md:238-239 marks them optional)`

**What is wrong / missing** — The 'ties out to management accounts' guarantee is only as strong as net arithmetic: a compensating misplacement (AR as a lump + no open items) passes every seed-time assertion, and the aged debtors/creditors listing the accountant relies on for collections is silently flattened when dates are omitted. Nothing verifies subledger-vs-control composition or aging fidelity at the moment the human approves the [[carrydown]] card.

**What the rebuild must do** — seed_opening_carry_forward should reject marker-resolved control accounts inside gl_lines (fail-loud), require or explicitly confirm real item dates for aged listings, and return a seed-time tie-out block (control vs subledger per account) that the CarryDownReview card renders before confirm.

### `B-7` · **MEDIUM** · Opening entries carry no history/audit trail and unconstrained actor attribution
*Hero-prompt item: B1*

**Evidence**
- `db/v2/25b-fns-opening.sql (entire file) — no seeder writes a journal_entry_history row; contrast run_depreciation db/v2/23b-fns-fixed-assets.sql:221-222 which attributes its auto-posted journal`
- `db/v2/25-fns-ops.sql:857-864 — record_opening_balances likewise writes no history row`
- `db/v2/25b-fns-opening.sql:211,225 — p_actor is free text (no app.audit_actor constraint, contrast db/v2/24-fns-onboard.sql:450) and lands only in client_financial_position.captured_by; the per-item seeders take no actor at all`
- `db/v2/25-fns-ops.sql:1103-1160 — firm_activity_feed unions journal_entry_history / kb / profile / document audits / export receipts / bank-match audit; opening postings appear in none of those sources, so they never surface in the firm's activity feed`

**What is wrong / missing** — The takeover opening position — the highest-stakes posting family in the product — is the only posting family with no actor-attributed audit rows and no feed visibility, undermining the provenance/receipts invariant precisely where an ISA 510 reviewer needs it.

**What the rebuild must do** — Every opening seeder writes attributed history/audit rows (actor via app.audit_actor, payload snapshot, source document sha256 of the management accounts where available) and surfaces in the activity feed.

### `B-8` · **MEDIUM** · No correction path for a wrong carry-down: opening entries cannot be reversed, and editing them strands the subledger snapshot and FA baseline
*Hero-prompt item: B1*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:792 — reverse_entry raises cannot_reverse_close_entry for entry_kind in ('closing','opening')`
- `db/v2/20-fns-journal.sql:269-355 — edit_entry has no entry_kind guard (grep for entry_kind: zero hits in the file) and explicitly permits editing an APPROVED entry with a reason (:291-297, demoting it to needs_review), deleting + reinserting its lines (:312-317); but ar_invoices/ap_bills gross is snapshotted at record time (db/v2/23-fns-subledger.sql:95-104, gross read from the control leg once) and fa_depreciation baseline rows (25b:182-185) are never recomputed on edit — the GL moves, the subledger/register does not`
- `db/v2/19-tables-subledger.sql:41-43,115 — 'no void state: voiding a posted invoice must REVERSE the anchoring GL entry too … A future void_invoice fn adds it back'; write_off_ar_invoice is a bad-debt posting, not an un-seed`
- `belcort/client-onboarding/SKILL.md:256-258 — the only correction guidance is pre-commit ('re-read the figures with the human'); nothing for post-commit`

**What is wrong / missing** — A wrongly keyed carried invoice (wrong gross, wrong counterparty, duplicate from B-1) is effectively permanent: the sanctioned reversal verb refuses, the edit verb desynchronizes GL from subledger (and knocks the opening entry to needs_review), and the tie-out reads then show perpetual drift the fn family cannot clear.

**What the rebuild must do** — A dedicated supersede/void verb for opening items (reverse-not-delete at both GL and subledger layers, baseline recomputation for FA), consistent with reverse_year_end_close's bespoke handling of its own machinery.

### `B-9` · **MEDIUM** · SST continuity for a service-tax registrant is not modeled at takeover: carried invoices produce zero declared output tax on post-takeover collection
*Hero-prompt item: B1*

**Evidence**
- `db/v2/25b-fns-opening.sql:56-68 — opening AR entries post Dr control / Cr OBE only; no 461-000 output-tax leg, no treatment tag on the carried item`
- `db/v2/23e-fns-sst.sql:57-85 (per-invoice declared-tax model reads the invoice's tagged 461 legs) — a carried invoice has none, so its collection declares zero service tax; :42-50, :453-487, :707, :714 — opening lumps on 460/461 are excluded and surfaced as 'reconcile the first period against the opening 460/461 lump', but an opening AR item with NO 461 leg never appears in the uncounted-movement scan at all (the scan covers journal_lines on 460/461 only)`
- `db/v2/25b-fns-opening.sql:67 — invoice_date defaults to as_of; the s.11(2) 12-month payment-trigger clock is keyed on invoice_date (db/v2/23e-fns-sst.sql:309,556), so the deemed-due clock for carried invoices is reset`
- `belcort/client-onboarding/SKILL.md:201-258 — the carry-down section never mentions SST treatment of carried open invoices`

**What is wrong / missing** — For exactly the ongoing-client case, service tax due on post-takeover collections of pre-takeover invoices (and the aged 12-month deemed-due trigger) is invisible to compute_sst_return and un-prompted at onboarding — a compliance gap only partially covered by a generic first-period assumption string.

**What the rebuild must do** — Carried AR items for taxable regimes should capture treatment + original invoice date and either carry the pending output-tax split (Cr 461 vs Cr OBE) or register an explicit per-invoice SST-continuity candidate the return computation surfaces.

### `B-12` · **LOW** · No incremental carry-down tool: only the atomic orchestrator is exposed to the agent, making the sanctioned 'capture it later' path a footgun
*Hero-prompt item: B1*

**Evidence**
- `agent/src/tools/registry/onboard.ts — only seed_opening_carry_forward is registered (:61-75); seed_opening_ar_invoice/ap_bill/fixed_asset are not agent tools (grep agent/src: only the buildTools fence + onboard.ts mention the family)`
- `belcort/client-onboarding/SKILL.md:314 — 'on skip the client is onboarded WITHOUT carry-down (a later chat session can capture it)'`
- `db/v2/25b-fns-opening.sql:249-260 — a later partial call must supply compensating gl_lines to satisfy the OBE-net equation (with prior OBE plugged to 0, a top-up's items re-credit OBE and demand matching net-credit gl_lines), and (B-1) a later FULL call duplicates`

**What is wrong / missing** — The only later-completion instrument the agent has is the same non-idempotent atomic call, whose balance equation makes partial top-ups awkward and whose re-run is destructive.

**What the rebuild must do** — Expose guarded per-item seeders (or an additive orchestrator mode) for post-onboarding completion, with the B-1 registry guard distinguishing 'first seed' from 'addendum'.

### `B-13` · **LOW** · Seeder edge inputs raise raw Postgres errors instead of domain errors
*Hero-prompt item: B1*

**Evidence**
- `db/v2/25b-fns-opening.sql:160-163 — accum_dep_cents>0 with a missing accum_deprn_account_code inserts a NULL account_code journal line → raw 23502 (journal_lines.account_code NOT NULL, db/v2/10-tables-core.sql:167) fires BEFORE record_fixed_asset's domain raise (23b:68) is ever reached`
- `db/v2/25b-fns-opening.sql:266-271 — gl_lines with unknown/foreign account codes fail via the composite FK (10-tables-core.sql:175) as a raw 23503, while the skill instructs the agent to surface exact error text to the human (SKILL.md:256-258)`

**What is wrong / missing** — Fail-loud holds, but the interview loop surfaces opaque constraint noise instead of the domain-coded messages every other validation in the family produces, degrading the clarify-loop recovery UX.

**What the rebuild must do** — Pre-validate accum-account presence and gl_lines account existence with named raises (accum_account_required_for_carried_dep, unknown_coa_code:<code>) like onboard_client's bank-account check (24:317-322).

### `B-15` · **LOW** · No carry of un-reconciled bank state at takeover — first reconciliation cannot tie without unscripted manual workarounds
*Hero-prompt item: B1*

**Evidence**
- `db/v2/25b-fns-opening.sql:200-204 — the carry-down payload has per-item machinery only for AR/AP/FA; the bank balance is one gl_lines lump`
- `db/v2/22-fns-documents-recon.sql:688-734 — close_reconciliation computes deposits-in-transit/unpresented from per-entry bank-COA lines dated WITHIN [period_start, period_end] that are not reconciled; takeover-date uncleared items live only inside the opening lump (dated as_of, before the first period), so they can neither be individually matched against post-takeover statement lines nor enter the outstanding computation`
- `belcort/client-onboarding/SKILL.md:201-323 — the carry-down section never mentions uncleared bank items`

**What is wrong / missing** — An ongoing client with uncleared items at the conversion date (extremely common) will show an unexplained difference on their first bank reconciliation; the model offers no per-item carry for bank, and the skill doesn't warn the human to split the lump.

**What the rebuild must do** — Carry-down should optionally accept uncleared bank items as per-item opening entries on the bank account (mirroring AR/AP), or the skill/UI must instruct splitting the bank lump so the first recon can tie.

#### Verified as sound (workstream B)

- AR open items CAN be loaded at takeover: per-item opening journals (Dr DC control by marker / Cr OBE) anchored 1:1 to ar_invoices rows whose gross is read from the posted control leg, later settling through the normal allocation machinery  ·  _evidence:_ `db/v2/25b-fns-opening.sql:40-73; db/v2/23-fns-subledger.sql:83-110 (gross READ from the leg); db/v2/tests/opening_carry_forward_test.sql:45-50 (AR control 150000 = subledger 150000); db/v2/90-isolation-tests.sql:180 (cross-firm BLC02 proven)`
- AP open items CAN be loaded: mirror seeder, proven to the cent including against a real client's management accounts (BEE CREATIVE FY2024, negative-equity sole prop)  ·  _evidence:_ `db/v2/25b-fns-opening.sql:81-114; db/v2/tests/bee_carry_down_close_test.sql:13-47 (opening SoFP reproduces the accountant to the cent; OBE nil; AP ties; negative equity carried as a 150-000 DEBIT)`
- FA register with accumulated-depreciation baseline CAN be loaded: Dr cost / Cr AD (historical) / Cr OBE (NBV), register cost GL-bounded via record_fixed_asset, and a fa_depreciation baseline row that prevents historical re-charging when the carried accum matches the model (one-month ~8333 charge, not the 208333 catch-up)  ·  _evidence:_ `db/v2/25b-fns-opening.sql:128-190; db/v2/tests/opening_carry_forward_test.sql:79-106 (CF2); db/v2/23b-fns-fixed-assets.sql:60-104 (account-role + method-driver validation)`
- Internal TB tie-out IS verified at seed time: opening_carry_forward_unbalanced raises when lumps don't reconcile with carried subledger equity; OBE asserted to net to zero; deferred Σdr=Σcr trigger backstops every entry; FP snapshot records in_balance; downstream client_trial_balance raises trial_balance_unbalanced and ar/ap/fa control tie-out reads exist  ·  _evidence:_ `db/v2/25b-fns-opening.sql:257-260, 279-284, 300-308; db/v2/tests/opening_carry_forward_test.sql:108-124 (CF3 fail-loud); db/v2/15-triggers.sql:33-75; db/v2/25-fns-ops.sql:105 (trial_balance_unbalanced raise); db/v2/23-fns-subledger.sql:541-591 + 23b:425-472 (tie-out reads)`
- Carry-down runs behind a genuine human plan→approve gate: the [[carrydown]] clarify renders the exact seed_opening_carry_forward payload (Dr/Cr grid, AR/AP/FA blocks) with Confirm/Skip on the retained clarifyId, double-submit latched  ·  _evidence:_ `dashboard/lib/stageReducer.ts:18-23, 96-102; dashboard/components/onboarding/cinematic/CarryDownReview.tsx:36-115; dashboard/app/(dash)/firms/[slug]/clients/new/ClientOnboardLive.tsx:122-128`
- The identity commit is verified against the DB before success is shown (false-success guard): the client row is re-read with retries and a definitive miss renders the recovery panel, never a fake 'onboarded' card; firm bootstrap likewise verifies the committed my_firm row after a session refresh  ·  _evidence:_ `dashboard/app/(dash)/firms/[slug]/clients/new/ClientOnboardLive.tsx:54-112; dashboard/components/onboarding/client/ClientOnboardCinematic.tsx:119-129; dashboard/app/welcome/FirmBootstrapFlow.tsx:21-52`
- The live lane IS an iterative agent workflow, not a hardcoded form: 13-Q clarify interview with chip choice cards, validation re-ask loops, synonym normalisation, TIN-conditional-on-turnover back-tracking, dry-run confirm, in-run document upload (management accounts ride the clarify answer), and SSE + poll-recovery that tolerates slow turns instead of expiring them  ·  _evidence:_ `belcort/client-onboarding/SKILL.md:71-197 (incl. :113 TIN-conditional); belcort/firm-bootstrap/SKILL.md:123-199 (buttons, synonym normalisation, validator loops); dashboard/lib/useOnboardingRun.ts:89-175, 238-264; dashboard/components/onboarding/client/clientFieldPresentation.ts:29-66`
- The [documents] wake cannot invoke onboarding/carry-down/KB-seed tools (fence excludes create_firm, onboard_client, seed_client_coa, seed_client_knowledge, seed_opening_carry_forward), and record_year_end_close's opening_balances_required is satisfied by carry-forward opening entries  ·  _evidence:_ `agent/src/tools/buildTools.ts:22-25; db/v2/25-fns-ops.sql:393-401 (existence check on entry_kind='opening' journals — the carry-forward creates exactly those)`
- seed_client_knowledge is a sound dual-seed: atomic both directions, idempotent on (pattern,account)/(kind,note), confirmed rules only via create_kb_rule (audit + alias resolution + unknown_account fail-loud, AND its admin+ assert_can_manage_kb floor transits the nested call — a sub-admin cannot seed confirmed rules), cross-firm denied — and the skill's confirm-vs-propose boundary keeps agent-inferred mappings advisory  ·  _evidence:_ `db/v2/24-fns-onboard.sql:353-424; db/v2/21-fns-kb.sql:304-343 (:316 admin+ floor); db/v2/90-isolation-tests.sql:780-853; belcort/client-onboarding/SKILL.md:344-366`
- Cross-firm isolation on the whole onboarding/carry-down family is proven (BLC02 fires before any other error on all four opening seeders and the onboard fns)  ·  _evidence:_ `db/v2/90-isolation-tests.sql:148-186 (incl. :180-183)`

#### Unverified (workstream B) — could not be confirmed from frozen evidence; carried as open

- The audit brief (undefined/audit-brief.md) does not exist on disk — only undefined/maps/db-map.md and undefined/findings/ exist; both the draft pass and this verification pass proceeded on standard audit discipline (read-only frozen repo, file:line evidence, critical/high/medium/low rubric) without the brief's exact severity wording or output constraints.
- Runtime behavior was verified by static code reading only — neither pass executed the agent service, the dashboard, or the db/v2 test rigs on this frozen tree, so 'tests pass' claims rest on the checked-in suites, not a fresh run.
- The two production onboarding failures ('stops-after-Q1', 'SSM-reject hard-exit') are documented only in the skill's own prose (belcort/client-onboarding/SKILL.md:35-43, 84-91; firm-bootstrap/SKILL.md:32-39); incident reports could not be independently confirmed.
- The read_skill wiring was not traced end-to-end to confirm the v2 runtime loads client-onboarding/firm-bootstrap SKILL text verbatim into onboarding runs (agent/src/doctrine/loader.ts assumed per README/CLAUDE.md).
- Whether the Command-Center chat surface (outside the cinematic) renders [[carrydown]]/[[dryrun]] clarifies usably for a later-session carry-down was not verified (makeHermesRunner/hermesChatTransport not audited).
- DryRunReview.tsx internals were not read; the dry-run per-field 'Check answers' fidelity is assumed from stageReducer/onboardingMarkers evidence (the CarryDownReview internals WERE fully read and verified).
- The exact behavior of a double seed_opening_carry_forward run (B-1) was derived by code analysis of the OBE-net arithmetic (independently re-derived during this verification pass: run-2 items re-credit OBE by X across the all-opening-entries sum, so the same gl_lines net credit X re-passes the :257 check) — deterministic, but not executed on a rig, so it remains analytically certain rather than rig-CONFIRMED.

#### Refuted in verification (workstream B) — dropped

- ~~Draft sub-claim 'a viewer can mint confirmed KB rules via seed_client_knowledge' — REFUTED; the parent finding survives as ADJUSTED~~ — seed_client_knowledge's rules leg calls public.create_kb_rule for every rule (db/v2/24-fns-onboard.sql:393-396), and create_kb_rule asserts app.assert_can_manage_kb() (db/v2/21-fns-kb.sql:316), which reads the CALLER's JWT role via app.current_user_role() (db/v2/00-foundation.sql:176-185) — the nested SECURITY DEFINER call does not change the JWT claims, so a viewer/bookkeeper seed containing any rule raises 'forbidden' and the atomic seed rolls back entirely. Only the advisory-notes leg (record_memory_note, db/v2/27-fns-memory.sql — no role assert) is sub-admin-writable. No whole finding was refuted.

#### Decision brief (workstream B)

> ADVERSARIAL VERIFICATION (2026-07-17): all 15 findings re-checked against the cited files/lines; 14 CONFIRMED, 1 ADJUSTED (B-2), 0 refuted outright. The one material draft error: B-2 claimed seed_client_knowledge bypasses the KB-confirmation floor — false, because create_kb_rule's app.assert_can_manage_kb() (21-fns-kb.sql:316) reads the caller's JWT role and transits the nested call, so a sub-admin cannot mint confirmed rules; B-2 was rewritten around the real, still-high gap (no role floor on onboard_client/seed_client_coa/all opening seeders/record_opening_balances + viewer-writable advisory notes + zero intra-firm rbac tests for the family). B1 verdict: the carry-down machinery is real and unusually good at its core — per-item opening journals for AR/AP/FA anchored 1:1 to subledger/register rows with marker-resolved controls, an OBE plug asserted to nil, fail-loud unbalanced raises, an FA depreciation baseline, and a golden test against a real client's management accounts (BEE, negative equity, to the cent). AR open items, AP open items, and a mid-life FA register all load and tie out internally. What is missing is everything around that core: the orchestrator is NOT idempotent and a re-run silently doubles the entire opening position with the FP snapshot still reporting in_balance (B-1, critical — and B-8 blocks repair: opening entries can't be reversed and subledger snapshots strand on edit); there is no intra-firm role floor anywhere in the family, so a viewer can onboard clients and post approved opening journals (B-2, high, adjusted); tie-out verification is net-arithmetic only, so control accounts in gl_lines bypass the per-item model and defaulted dates flatten the aged profile (B-6); the FA baseline meets a cumulative-target engine that silently trues up any historical-policy mismatch (B-5, arithmetic verified); opening postings have no history/audit rows or feed visibility (B-7); and SST continuity for carried service-tax invoices is unmodeled, with the s.11(2) 12-month clock keyed to a defaulted invoice_date (B-9). KB initialization exists (seed_client_knowledge, well-guarded incl. the admin+ floor, idempotent, atomic) but is chat-only, last in a fragile run, with zero dashboard surface and no structural-fixture carry (B-14). B2 verdict: the live lane is genuinely an intelligent iterative agent workflow — clarify loops with choice cards, validation re-asks, synonym normalisation, dry-run and carry-down plan→approve gates, in-run uploads, and a false-success guard on the identity commit — but its end-to-end continuation rests solely on the model never emitting a plain sentence, over a process-local in-memory run map with cross-visit resume deliberately dropped; the skills themselves document two observed production aborts (B-4). Run completion is read as success and only the client row is verified, so a dead or failed carry-down/KB step yields an unqualified success card (B-3), and the deterministic fallback silently ships a stripped, cold-start client against the product's own 'cold start is NOT acceptable' bar (B-10). Rebuild guidance: port the 25b accounting model (per-item + OBE plug + baseline) and its tests; add a DB-owned seeded-once registry (mirror uq_fy_close_live), role floors + rbac tests, seed-time composition tie-out, audit rows, and a supersede verb; and rebuild onboarding as a durable, resumable, step-tracked workflow rather than one heroic run.

---

## Workstream C — Knowledge, memory & counterparties

### `C-1` · **HIGH** · Memory-note layer is write-only: no structural consumer exists anywhere (agent, dashboard, DB fns, wake lanes)
*Hero-prompt item: C1*

**Evidence**
- `db/v2/17-tables-memory.sql:3-7 — table header claims 'the agent reads it (RLS-scoped SELECT) and renders a per-client markdown memory index to Storage'`
- `belcort/AGENTS.md:74 — the ONLY read path in the whole system: one sentence telling the model to 'READ my notes for the active client via query_books … at the start of substantive client work' (optional, model-volition)`
- `belcort/coa-coding/SKILL.md:47-49 — Step 1 ClientContext enumerates MSIC, legal name, directors, COA, sst_regime — memory notes absent; grep of belcort/ for 'memory' hits ONLY AGENTS.md:57/:74, firm-bootstrap (Hermes session memory, unrelated) and client-onboarding:355-365 (the seed) — kb-evolve/review-queue/doc-ingest/bank-recon contain ZERO memory-note mentions`
- `agent/src/runtime/inject.ts:44-84 — wake read-hints cover journal_entries/journal_entry_history/documents/bank_match_audit only; no lane injects or hints client_memory_notes`
- `grep dashboard/ for client_memory_notes|record_memory_note = zero hits (no UI surface); grep db/v2/28-fns-reads.sql for 'memory' = zero (no read fn touches the table)`
- `agent/src/tools/registry/kb.ts:132-143 — record_memory_note write tool exists (cls:'write'); its own description defers reads to 'query_books (client_memory_notes)'`

**What is wrong / missing** — ADR-033's advisory memory layer contributes approximately nothing to Clara's intelligence: notes can be written (tool + onboarding dual-seed) but nothing structural ever reads them — not the coding context, not the wake notes, not a read fn, not the dashboard. Whether a note is ever consulted depends entirely on the model choosing to run an optional doctrine-suggested SELECT. A knowledge layer whose consumption is unverifiable and unenforced is dead weight presented as a built capability.

**What the rebuild must do** — In the rebuild, client knowledge/context must be STRUCTURALLY injected (context packs assembled by the runtime per task, from the governed KB), never left to a doctrine sentence. Retire the free-text notes table; carry its three real needs into the KB/event layer as typed objects (see decision brief).

### `C-6` · **HIGH** · AR/AP subledger has NO sanctioned write path after onboarding — counterparty open-items are populated once (opening seed) and never maintained by any accounting execution
*Hero-prompt item: C2*

**Evidence**
- `agent/test/registry.test.ts:28-53 — the EXPECTED curated tool set contains no subledger fn (it DOES contain the FA writers and seed_opening_carry_forward), and the 'no surprise extras' assertion (:59-61) proves record_ar_invoice/record_ar_receipt/allocate_ar_receipt/record_ap_bill/record_ap_payment/allocate_ap_payment/write_off_ar_invoice can never be agent tools as-built`
- `agent/src/tools/registry.ts:39-53 — EXCLUDED_FNS documents only the job lane + 4 helpers; the seven subledger writers are in neither list (unaccounted-for surface)`
- `grep repo-wide for the seven writer names = hits ONLY in db/v2 (definitions, opening seeds, SST consumer, tests) — zero callers in belcort/, dashboard/, agent/; dashboard/lib/arap.ts:1-6 declares the AR/AP surface 'Read-only + the one export'; docs/design/05-surfaces.md:189-196 (§2.5) confirms read-only`
- `belcort/coa-coding/SKILL.md:45 — coding a sales invoice = Dr 300-000 / Cr 500-000 with NO instruction to record an ar_invoices row; grep belcort/ for ar_receipt|allocat = only client-onboarding's opening carry-forward, whose own comment (:249) promises items 'later settle through the same allocation machinery' that no workflow ever invokes`
- `db/v2/25b-fns-opening.sql:34-90 — the only production writers are the opening-carry-forward seeds (onboarding), which call record_ar_invoice/record_ap_bill`
- `db/v2/23-fns-subledger.sql:15-21, 94-98, 180-192 — the writers exist, are granted to authenticated, and are internally sound (GL-anchored gross, counterparty-mismatch guard)`

**What is wrong / missing** — The moment onboarding finishes, every credit sale, supplier bill, customer receipt, and settlement bypasses the open-item subledger entirely: ar_invoices/ap_bills freeze at the opening set, receipts are never allocated, statuses never advance, and ar/ap_control_tie_out drifts immediately. Aging grids, per-counterparty statements, the contacts-register fold-in ('a supplier/customer Clara has coded' — contactsRegister.ts:4-6 — a population that can never grow post-onboarding), the close checklist's subledger tie-outs (05-surfaces.md:212-213), and the SST service payment basis (C-8) all read a corpse. A whole Track-1a capability is built in the DB but disconnected from every workflow.

**What the rebuild must do** — The rebuild must make subledger maintenance intrinsic to the accounting executions: either the coding/receipt workflows atomically record open items with the GL entry (one governed mutation class), or the open-item layer is DERIVED from control-account legs by the DB — never an optional parallel register that humans and the agent can silently skip.

### `C-10` · **MEDIUM** · Alias resolution is enforced only on writes/tallies; the coding-time rule LOOKUP never resolves the counterparty, contradicting the schema's own contract
*Hero-prompt item: C2*

**Evidence**
- `db/v2/13-tables-client.sql:56-58 — table contract: 'record_kb_evidence + create_kb_rule + edit_kb_rule resolve the counterparty pattern THROUGH this map…; the agent resolves a counterparty before a rule lookup'`
- `belcort/coa-coding/SKILL.md:54-65 — Step 3 instructs a raw SELECT of all non-retired client_kb_rules and model-side pattern matching; no resolve_counterparty call is instructed anywhere in the coding procedure (grep: 'resolve_counterparty' appears only in the boilerplate tool list at line 40)`
- `db/v2/21-fns-kb.sql:182-188 — resolution IS structural inside record_kb_evidence (write side), proving the asymmetry`

**What is wrong / missing** — The mechanism that stops 'TNB / TNB Berhad / Tenaga' fragmenting the learning loop is deterministic when TALLYING but purely LLM-judgment when MATCHING at coding time — the exact moment the rule must fire to hit the auto lane. A registered alias guarantees the evidence converges but does not guarantee the rule is found, so auto-post consistency rests on model fuzziness the schema comment claims is deterministic.

**What the rebuild must do** — Rule matching in the rebuild must be a deterministic DB-side operation (lookup keyed on the normalized/alias-resolved canonical), returning matched rules to the agent — never model-side fuzzy matching over a raw rule dump.

### `C-11` · **MEDIUM** · The 'candidate' rule tier is unreachable in production — every sanctioned writer mints 'confirmed', while the ratified ladder, the coding skill, the design docs, and the dashboard all describe candidates as a live rung
*Hero-prompt item: C1/KB-intent*

**Evidence**
- `db/v2/12-tables-kb.sql:25 — status CHECK candidate/confirmed/retired with DEFAULT 'candidate', but…`
- `db/v2/21-fns-kb.sql:245-246 (promote_proposal inserts 'confirmed'), :329-330 (create_kb_rule inserts 'confirmed'); seed_client_knowledge delegates to create_kb_rule (db/v2/24-fns-onboard.sql:384-399); record_kb_evidence writes only the history tally + proposals; repo-wide grep shows status='candidate' inserted ONLY by privileged test setup`
- `db/v2/tests/confirm_kb_rule_test.sql:6-8 — the test suite's own admission: 'no audited fn creates a candidate rule (create_kb_rule makes a CONFIRMED 1.000 rule), so a candidate must still be seeded raw'`
- `docs/reference/confidence-ladder.md:93-99 (ratified, ADR-041) + belcort/coa-coding/SKILL.md:62-64 + belcort/AGENTS.md §15 lane note ('a clean cold-start / candidate-rule → needs_review') — all describe candidate rules as a live routing rung read at coding time (status <> 'retired')`
- `db/v2/21-fns-kb.sql:439-467 — confirm_kb_rule exists to promote candidate→confirmed rows that production can never mint; db/v2/20-fns-journal.sql:93-99 — draft_entry carries a candidate-specific rejection ('a candidate/retired rule is not a citable posting authority')`
- `docs/design/05-surfaces.md:390-391 — the KB workbench spec has 'confirmed rules · candidates · proposals' lanes and 'confirm a candidate'; dashboard/lib/contactsRegister.ts:23 counts 'candidate + confirmed' rules — surfaces for a population of zero`

**What is wrong / missing** — A whole tier of the documented learning state machine is dead in production: no writer mints a candidate, so the candidate rung survives only as dead schema, dead ratified-doc text (ladder, skill, AGENTS.md), a dead confirm transition, and dashboard lanes/counts that can never populate. Behaviourally, no rule row of any status exists until 3 evidence sightings PLUS a human promotion — sightings 2 and 3 cold-start exactly like sighting 1. (The draft's claim that this 'guts the owner's day-2-learning intent' rests on signals/ docs absent from the frozen repo — moved to unverified; severity accordingly rebased from high to medium: it is a docs-vs-code contradiction plus a capability gap, not a books-correctness or isolation risk.)

**What the rebuild must do** — The rebuild must make an explicit owner decision: either restore first-sighting candidate rules (auto-created, clearly sub-auto-lane, influencing routing at reduced confidence) or deliberately ratify the 3-evidence-then-promote-only model and delete the candidate tier from schema, ladder, skills, and dashboard so docs match reality.

### `C-15` · **MEDIUM** · coa-coding Step 6 instructs the KB-evidence write as a SELECT-wrapped fn call — doctrine-endorsed use of the agent_select mutation-bypass shape
*Hero-prompt item: C2/C1-adjacent*

**Evidence**
- `belcort/coa-coding/SKILL.md:275-283 — Step 6 verbatim: '`select record_kb_evidence(<client_id>, <pattern>, <account_code>, 1);`' — SQL form, not the curated tool call (the same skill's own DB-access preamble at :40 routes WRITES through named tools)`
- `db/v2/26-fns-session.sql:119-140 — agent_select is VOLATILE, SECURITY INVOKER, and its guard is a lexical verb-scan (:130-135) that does not block function calls; record_kb_evidence is SECURITY DEFINER (21-fns-kb.sql:170-172) so the write commits through the read surface`
- `agent/src/tools/sqlGuard.ts:57-85 (per its own header 'defence-in-depth ONLY') passes the same string (fn names are not banned verb words); the bypass skips buildTools' match_client scope gate (agent/src/tools/buildTools.ts:62-69 vs queryToolDef :110-122, which enforces no scope)`

**What is wrong / missing** — The doctrine itself teaches the exact SELECT-wrapped-SECURITY-DEFINER pattern that SDT-001/SEC-001 flags as the mutation-bypass hole: a model following the skill verbatim routes a learning-loop WRITE through query_books, bypassing the tool layer's active-scope write-gate (record_kb_evidence is registered as a match_client tool precisely to get that gate). It both normalizes the bypass shape for the model and makes the KB write escapable from scope enforcement.

**What the rebuild must do** — Rebuild: structural (not lexical) read-only enforcement on any freeform read surface (read-only transaction / no EXECUTE on writers from that path), and a doctrine lint that forbids skills from expressing writes as SQL.

### `C-2` · **MEDIUM** · ADR-033's promised per-client markdown memory index in Storage was never built
*Hero-prompt item: C1*

**Evidence**
- `docs/PROJECTLOG.md:90 — ADR-033: notes are 'rendered to a per-client markdown memory index in Storage'`
- `db/v2/17-tables-memory.sql:6-7 — repeats 'renders a per-client markdown memory index to Storage (the render is agent-side)'`
- `grep agent/src for 'memory index'/'profile.md' = no renderer; agent/src/tools/exportTool.ts:276-371 enumerates every storage-writing export scope (trial_balance/journals/documents/general_ledger/management_accounts/aging/sst_return/full) — no memory index; grep belcort/ for 'memory index|profile.md' = zero (no skill instructs producing one)`

**What is wrong / missing** — A ratified ADR describes a deliverable (the storage-rendered memory index — the intended human-readable consumption surface) that has no implementation anywhere. The docs-vs-code disagreement is itself a finding; it also explains WHY the layer is consumerless (C-1): the read surface was designed but never shipped.

**What the rebuild must do** — Rebuild ADRs must not record consumption surfaces as built until code exists; the replacement knowledge layer needs its human-readable projection (workbench surface) shipped in the same slice as the write path.

### `C-3` · **MEDIUM** · must_ask / rule_hint / profile note kinds have no lifecycle, no resolution state, and no surfacing mechanism
*Hero-prompt item: C1*

**Evidence**
- `db/v2/17-tables-memory.sql:11-28 — schema has no status/resolved/superseded column; 'superseded by a newer note, never edited' (27-fns-memory.sql:6-7) is pure convention with no supersede key`
- `db/v2/17-tables-memory.sql:15-17 — kind comments promise: must_ask = 'a standing question to raise next time'; profile = 'the profile.md index'; rule_hint = 'a candidate the agent may PROPOSE'`
- `db/v2/21-fns-kb.sql:199-207 — kb_proposals are auto-filed ONLY from the record_kb_evidence tally; rule_hint notes have no bridge to proposals`
- No skill step, wake, or dashboard lane re-raises an open must_ask (greps in C-1); nothing renders profile notes (C-2)

**What is wrong / missing** — A 'standing question to raise next time' that nothing raises, can never be marked answered, and accumulates forever is a broken contract: over months a client accrues stale must_asks with no way to distinguish open from resolved, and rule_hints never feed the proposal pipeline they were designed to seed.

**What the rebuild must do** — must_ask belongs in the rebuild as a first-class open-question/interruption object (task with resolution state, surfaced by the workflow engine at client-work start); rule_hint collapses into a low-evidence KB-proposal state; profile facts become typed KB profile fields with provenance.

### `C-4` · **MEDIUM** · Design docs claim memory notes ride the self-reconcile learn loop, but the workbench-kb tool policy structurally blocks record_memory_note and the handler skill never mentions notes
*Hero-prompt item: C1*

**Evidence**
- `docs/design/04-agentic.md:177-179 — 'a bank_line_matched learn-wake feeds each confirmed match back to Clara — matching heuristics via client_recon_hints, coding rules, reactivated client memory notes'`
- `docs/design/05-surfaces.md:184-186 — same claim ('…coding-rule learn, reactivated client memory notes')`
- `agent/src/tools/buildTools.ts:19-26 — WRITE_ALLOW['workbench-kb'] = record_kb_evidence | record_recon_hint | record_proactive_notification ONLY; record_memory_note is cls:'write' (kb.ts:135), so buildTools.ts:374 filters it OUT of the wake tool set entirely`
- `agent/src/runtime/openai/runtime.ts:339 — every non-proactive/non-documents wake kind (including the bank_match_audit self-reconcile wake) maps to the 'workbench-kb' policy`
- `belcort/kb-evolve/SKILL.md — zero occurrences of 'memory' (grep); belcort/AGENTS.md:74 tells the agent to record notes when 'a self-reconcile reveals a DURABLE client fact' — impossible in the wake lane that handles self-reconciles`

**What is wrong / missing** — Two ratified design chapters describe a memory-note learning behaviour the code makes impossible: a [workbench] wake run literally cannot write a memory note (the tool is not even built for that policy), and its skill never instructs one. Doctrine (AGENTS.md §15) and policy (buildTools) contradict each other on the same behaviour.

**What the rebuild must do** — Rebuild must keep tool-policy matrices, doctrine, and design docs generated/tested from one source so a policy row cannot silently falsify a documented learning loop.

### `C-7` · **MEDIUM** · Aging exports (aging scope, management_accounts, full pack) read the unmaintained subledger with no tie-out check in the export path
*Hero-prompt item: C2*

**Evidence**
- `agent/src/tools/exportTool.ts:336-346 — aging scope fetches ar_aging/ap_aging only; :355-368 — the 'full' client pack merges FS + TB + aging; grep agent/src for tie_out = no call to ar_control_tie_out/ap_control_tie_out anywhere in the export pipeline`
- `PRD.md:64 — aging is a headline export scope; belcort/export/SKILL.md:83,115 — management-accounts/full pack 'trial balance + AR/AP aging, each on its own page'`
- `dashboard/lib/arap.ts:63-65 — the tie-out fns exist and the dashboard surface shows the drift badge (05-surfaces.md:193-196 'the tie-out badge never hides'); the export path drops it`

**What is wrong / missing** — Given C-6, an exported 'AR/AP aging' page in a client-facing management-accounts or full pack shows only opening items aging forever — materially wrong receivables/payables — and unlike the dashboard, the exported artifact carries no tie-out drift warning, so the one honesty mechanism the DB provides is dropped exactly where the number leaves the firm.

**What the rebuild must do** — Every exported statement that depends on a reconcilable register must embed its tie-out/drift check in the artifact (or refuse to render on drift) — honesty surfaces must travel with the number, not stay on the dashboard.

### `C-8` · **MEDIUM** · compute_sst_return's statutory service-tax payment basis rides the unmaintained AR subledger: with no ar_invoices anchor, credit-sale service tax silently falls back to the cash-direct bucket and declares in full at posting_date (accrual, not payment, basis); s.11(2), bad-debt relief, and advance handling can never operate
*Hero-prompt item: C2*

**Evidence**
- `db/v2/23e-fns-sst.sql:222-236 — the service-tax model: bucket (1) 'ANCHORED invoices (ar_invoices): the cumulative-target model' (payment basis); bucket (2) 'CASH-DIRECT entries (tagged 461 legs, not an anchor…): net Cr declares at posting_date'`
- `db/v2/23e-fns-sst.sql:353-381 — bucket (2)'s selection: any posted tagged 461 leg with NO ar_invoices row (`not exists (select 1 from ar_invoices i where i.entry_id = e.id)`) is DECLARED in full at posting_date — so an unanchored credit-sale invoice is counted immediately, not routed to the uncounted surface (:479-487, which covers only untagged/mismatched/unknown/opening legs)`
- `db/v2/23e-fns-sst.sql:57-101 — the payment-basis machinery (sst_service_target paid-proration, s.11(2) 12-month trigger, receipt effectiveness) operates ONLY on anchored invoices + their ar_receipts/ar_allocations — rows nothing records after onboarding (C-6)`
- `docs/architecture/backend.md:81 — declares 'service tax on the payment basis (per-invoice cumulative-target from the AR subledger, s.11(2) 12-month rule)' as the built policy`

**What is wrong / missing** — The draft's original mechanism ('revenue lands in the surfaced-but-uncounted bucket, the SST-02 draft is perpetually incomplete') is WRONG — unanchored tagged legs ARE counted, as cash-direct. The verified defect is a silent statutory-basis substitution: for a service-tax registrant invoicing on credit, every post-onboarding invoice declares its full tax in the period of POSTING (accrual-like), not when payment is received — tax is remitted before it is statutorily due, period allocations on SST-02 are wrong, and the payment-basis machinery the docs claim (12-month trigger, bad-debt relief A×C/B, advances) is structurally inoperative because its feedstock (invoice → receipt → allocation) is never recorded. The engine is sound; its feedstock pipeline was never connected (root cause C-6), and nothing in the draft output warns that the basis silently degraded.

**What the rebuild must do** — Rebuild treats the SST service-basis dependency chain (invoice → receipt → allocation → declaration) as one governed lifecycle; the return computation must be able to PROVE its feedstock is complete (tie-out gate / anchored-coverage check) before a draft is presented as filable, and must surface when the payment-basis model degraded to accrual.

### `C-9` · **MEDIUM** · No counterparty entity exists: contacts are a display-side merge over free-text snapshot strings, alias repoints never re-key history, and stored-string matching can strand allocations
*Hero-prompt item: C2*

**Evidence**
- `dashboard/lib/contactsRegister.ts:1-10 — 'There is no contacts table: a counterparty is assembled display-side from client_counterparty_aliases… client_kb_rules… client_kb_rules_history… AND the AR/AP subledger counterparties'; docs/design/05-surfaces.md:380-387 confirms owner-decided display-side population`
- `db/v2/23-fns-subledger.sql:98-104 — counterparty is canonicalised then SNAPSHOTTED as text on ar_invoices at record time; db/v2/21-fns-kb.sql:95-98 — add_counterparty_alias upserts the mapping for FUTURE resolution only; no code re-keys existing client_kb_rules/client_kb_rules_history/ar_invoices rows on a repoint (the FROZEN-normalizer warning at 00-foundation.sql:289-290 itself notes a 'canonical re-key sweep' would be needed — none exists)`
- `db/v2/23-fns-subledger.sql:188-189 — allocate_ar_receipt rejects on 'v_rcp is distinct from v_icp' comparing STORED strings: an invoice recorded before an alias repoint and its receipt recorded after resolve to different canonicals → counterparty_mismatch on a legitimate settlement`
- `dashboard/lib/contactsRegister.ts:8-10 — display-side normalizeName only 'mirrors app.normalize_counterparty's intent' (a second, drift-prone implementation)`

**What is wrong / missing** — Counterparty identity is a string convention, not data: four sources fragment or merge purely by name folding; correcting a name mid-life (the alias workflow's whole purpose) silently splits history — old rules/evidence/open items keep the old canonical while new writes use the new one — and can block settlements. The 'contacts register' is a projection of this fragility, not a fix for it.

**What the rebuild must do** — Rebuild with a first-class per-client counterparty record (id-keyed; alias rows as children; typed customer/supplier/director/related-party), FK'd from KB rules, evidence, subledger items, and recon hints, so a rename/merge is one governed mutation that atomically re-keys — never a string convention.

### `C-12` · **LOW** · The KB learning pipeline is purely reactive and structurally single-type: kb_proposals forbids every proposal kind except rule_promotion, no system-initiated proposal source exists beyond the ≥3 evidence tally, and doctrine still carries v1 residue (kb_compile) with no recorded drop decision
*Hero-prompt item: C1/KB-intent*

**Evidence**
- `db/v2/12-tables-kb.sql:77 — proposal_type CHECK IN ('rule_promotion') — any other proposal kind (new-account candidates, conflict resolutions, document-extracted rules) is an impossible row`
- `v2's only proactive mining = the ≥3 evidence auto-file inside record_kb_evidence (db/v2/21-fns-kb.sql:199-207) plus read-only 'looks wrong' heuristics in the [proactive] wake handler (belcort/review-queue/SKILL.md:423-530, Step P3 — READ-ONLY, never mutates)`
- `grep db/v2 + belcort/ for kb_material|graphify|kb_curator = zero implementations; belcort/rule-edit/SKILL.md:49 still references 'kb_compile's helpers' (a v1 mechanism with no v2 equivalent) — undeleted doctrine residue`
- `grep docs/PROJECTLOG.md for curator|materials|graph|new_account = zero — no ADR records deciding these v1 mechanisms' fate`
- `One-time seeding exists only at onboarding: seed_client_knowledge (db/v2/24-fns-onboard.sql:367-424); no post-onboarding document-to-rules extraction pathway exists`

**What is wrong / missing** — As-built, Clara learns ONLY from what a human approves (evidence tally → threshold → human promote). There is no system-initiated pattern mining, no new-account detection, no document-to-rules extraction after onboarding, and the proposals table is typed so narrowly that adding any of these requires a schema change. The draft's framing of this as dropping a specific owner-designed two-tier system (weekly curator, materials registry, knowledge graph) could NOT be verified — the cited signals/ intent docs do not exist in the frozen repo; what is verifiable is the structural single-type CHECK, the reactive-only pipeline, the v1 doctrine residue, and the absence of any recorded decision. Severity rebased medium→low accordingly (a design-scope gap for the rebuild, not an as-built defect).

**What the rebuild must do** — The rebuild's KB design must explicitly decide each proactive-learning mechanism's fate (materials/extraction-to-proposals, pattern miners, new-account detection, periodic digest) — carrying the proposal-gate discipline (never auto-mutate rules) while restoring system-initiated proposal SOURCES; the proposals table must be typed for multiple proposal kinds from day one.

### `C-13` · **LOW** · No pinned/locked tier: a human-created 1.000 rule ('always code X to Y') silently auto-retires after 3 overrides, identically to an evidence-derived rule, while doctrine still offers 'lock' verbs
*Hero-prompt item: C1/KB-intent*

**Evidence**
- `db/v2/12-tables-kb.sql:25 — no 'locked' status exists; db/v2/21-fns-kb.sql:130-161 — app.decay_rule_on_override applies to ANY confirmed rule (including create_kb_rule's human pins at confidence 1.000) and auto-retires at threshold 3 with no human confirmation`
- `belcort/rule-edit/SKILL.md:54-56 — doctrine still speaks the lock vocabulary ('Add/lock a new rule', 'Promote existing to locked — lock rule…'), mapping to confirm_kb_rule (whose kb.ts:116 description says 'Confirm/lock'), but the resulting 'locked' rule is just 'confirmed' and decays like any other; :49 references v1 'kb_compile's helpers' that have no v2 equivalent`
- `docs/PROJECTLOG.md:89-92 — ADR-033 ratifies decay/auto-retire generally (rejected 'increment-only no-demotion') but never distinguishes human-pinned directives from evidence-derived rules`
- `The conflict-resolution UX on a contradicted rule is surface-only: belcort/kb-evolve/SKILL.md:185 (Step W3) + :292-299 (BM3) warn via record_proactive_notification and STOP; belcort/review-queue/SKILL.md:423 (P3) is read-only`

**What is wrong / missing** — A rule the human explicitly pinned and a rule promoted from 3 sightings share one decay fate: three overrides silently retire either. For exactly the rules a human most deliberately authored, retirement happens without a human decision — the only surviving safeguard is an advisory heads-up. Doctrine's own 'lock' verbs promise a stickiness the schema does not implement. (The draft's v1 keep/switch/split flow and 'locked = 1.00 sticky' intent rest on signals/ docs absent from the frozen repo — moved to unverified; the in-repo doctrine-vs-schema mismatch and the ADR's silence on pin semantics stand.)

**What the rebuild must do** — Rebuild autonomy/rulebook design should distinguish evidence-derived rules (decayable) from human-pinned directives (conflict surfaces to the human, never silently retires), and put that distinction in front of the owner as an explicit decision.

### `C-14` · **LOW** · Knowledge provenance on entries is single-rule, points at the rule's mutable current state, and is destroyed by corrections — no draft-time rule-application snapshot exists
*Hero-prompt item: C1/KB-intent*

**Evidence**
- `Provenance = the single journal_entries.kb_rule_id column (db/v2/12-tables-kb.sql:148-165, FK on delete set null); grep repo-wide for journal_entry_rules_applied|rules_applied = zero — no snapshot of what fired at draft time`
- `db/v2/20-fns-journal.sql:337-348 — edit-away NULLs kb_rule_id ('drop the now-inaccurate provenance'); :386-389 — reassign_entry NULLs it on a client move`
- `The cited rule row itself is mutable after the fact (edit_kb_rule changes pattern/account, decay changes status), so even a surviving kb_rule_id answers 'which rule NOW', not 'what fired THEN'; reconstruction requires walking journal_entry_history before/after jsonb snapshots + client_kb_audit prose`

**What is wrong / missing** — The auditor question 'which knowledge produced this entry AT THE TIME' cannot be answered deterministically after any correction: the pointer is cleared (edit-away/reassign) or points at the rule's CURRENT mutated state; only history-row jsonb snapshots and KB-audit prose allow effortful reconstruction. (The draft's comparison to v1's journal_entry_rules_applied six-step audit chain rests on signals/ docs absent from the frozen repo — moved to unverified; the in-repo structural facts stand on their own.)

**What the rebuild must do** — The rebuild's decision/receipt layer must snapshot the knowledge inputs (rule id + pattern + account + status + confidence at fire time) immutably per decision, separate from the mutable rulebook — corrections may supersede, never erase.

### `C-16` · **LOW** · update_client_profile hard-deletes and reinserts the contact-ish registers (directors/domains/aliases; delete-missing bank accounts) — no reverse-not-delete, id churn, raw FK errors
*Hero-prompt item: C2*

**Evidence**
- `db/v2/24-fns-onboard.sql:484-511 — bank accounts: DELETE where account_no not in the incoming list (:484-487); directors/email_domains/aliases: DELETE ALL then reinsert (:495, :501, :507)`
- `db/v2/11-tables-recon.sql:45,86,148 — bank_reconciliations / bank_statement_lines / client_recon_hints FK client_bank_accounts(id) with no ON DELETE action (NO ACTION): deleting a referenced bank account makes the whole profile save fail with a raw 23503, not a domain error`
- `Contrast: every other register in the schema is reverse-not-delete (e.g. retire_kb_rule 21-fns-kb.sql:406-430, retire_recon_hint 22-fns-documents-recon.sql:660+)`

**What is wrong / missing** — The client identity/contact data (directors used by the director_payee must-ask flag, domains/aliases used for doc→client matching) is the one register family that violates the repo's own reverse-not-delete law: every profile save rewrites history-less rows and churns ids anything may have cached, and a legitimate save that drops an in-use bank account crashes with an undomained FK violation.

**What the rebuild must do** — Rebuild: contact/identity registers get the same audited, reverse-not-delete, per-row mutation treatment as every other register; referenced rows deactivate, never delete.

### `C-5` · **LOW** · record_memory_note is the weakest-audited writer in the schema: no via_fn, unconstrained actor, empty note accepted
*Hero-prompt item: C1*

**Evidence**
- `db/v2/27-fns-memory.sql:10-31 — no set_config('belcort.via_fn'…), no app.audit_actor() (actor is free text via nullif), note = coalesce(p->>'note','') so an EMPTY note inserts, provenance free text, kind enforced only by the table CHECK (raises raw check_violation, not a domain error), no role floor (granted to authenticated)`
- `db/v2/24-fns-onboard.sql:404-412 — the onboarding seed wrapper validates notes fail-loud (note required, kind whitelist, confidence range) — proving the validation exists but lives in the wrong layer`
- `Contrast: db/v2/21-fns-kb.sql:78-81 (add_counterparty_alias applies assert_can_review + app.audit_actor)`

**What is wrong / missing** — Every other learning-loop writer constrains its audit attribution and validates its input; the memory writer does neither, so any member (or the wake credential, or a spoofed direct PostgREST call) can insert blank/attributed-to-anyone narrative rows into what ADR-033 calls part of the audit-visible knowledge layer.

**What the rebuild must do** — Any knowledge write in the rebuild carries the same actor-attribution + validation + receipt discipline as book writes — no second-class writers.

#### Verified as sound (workstream C)

- The memory-note WRITE path works end-to-end and is firm-isolated: fn + curated tool + onboarding dual-seed, with rig proof of isolation and idempotent atomic seeding.  ·  _evidence:_ `db/v2/27-fns-memory.sql:10-31 (writer, cross-firm guard first); agent/src/tools/registry/kb.ts:132-143 (tool); db/v2/24-fns-onboard.sql:401-420 (seed path, fail-loud validation, idempotent on (kind,note)); db/v2/90-isolation-tests.sql:332-363 (TEST 7: isolation + direct-write blocked + cross-firm denied) and :777-826 (TEST 11a/b/c dual-seed: seeds, idempotent, atomic)`
- The counterparty-alias machinery is sound engineering: IMMUTABLE frozen normalizer backing a functional unique index, single-level alias guard, canonical collapse on register, upsert-repoint correction model, audited, bookkeeper+ floor with audit_actor.  ·  _evidence:_ `db/v2/00-foundation.sql:284-297 (normalize_counterparty, FROZEN warning documented); db/v2/13-tables-client.sql:62-75 (uq_client_cp_alias_norm); db/v2/21-fns-kb.sql:65-107 (add_counterparty_alias: assert_can_review, audit_actor, single-level guard, canonical collapse, kb_audit 'alias')`
- resolve_counterparty is deterministic and backward-compatible: alias-column hit beats canonical-column hit, then lowest id; no-hit returns the trimmed input as its own canonical.  ·  _evidence:_ `db/v2/21-fns-kb.sql:44-56`
- record_kb_evidence is alias-aware and correctly suppresses re-proposal of retired rules (a decay-killed coding cannot silently return), with the ≥3 auto-file idempotent via the open-only partial unique index.  ·  _evidence:_ `db/v2/21-fns-kb.sql:182-207; db/v2/12-tables-kb.sql:88-89 (uq_kb_proposal_open); db/v2/tests/record_kb_evidence_test.sql:63-78 (confirmed pin suppresses proposal, tally continues)`
- The recon-hint (narration→counterparty) loop is genuinely wired end-to-end and human-fenced: DB trigger fires only on human 'matched' actions; the wake lane may write the hint; the coding-side read consumes it; promote is admin-gated; a confirmed hint never silently flips.  ·  _evidence:_ `db/v2/25-fns-ops.sql:1539-1548 (trg_pn_bank_match fence: actor is distinct from 'agent' and action='matched'); agent/src/tools/buildTools.ts:21 (workbench-kb allows record_recon_hint); agent/src/runtime/inject.ts:80-82 (wake procedure); belcort/kb-evolve/SKILL.md:284-317 (BM2b + chat-mediated learn); belcort/bank-recon/SKILL.md:79-83 (suggest_recon_counterparty first, advisory-only); db/v2/22-fns-documents-recon.sql:599-609 (candidate may flip, confirmed/retired never), :638-657 (promote admin+)`
- The AR/AP subledger writer fns are internally sound accounting (the integration, not the fns, is the failure): gross is read from the anchoring GL control leg (never agent-supplied), counterparty canonicalised, cross-customer allocation rejected except explicit contra, over-allocation raises, write-off bounded by outstanding.  ·  _evidence:_ `db/v2/23-fns-subledger.sql:15-21 (doctrine header); db/v2/23-fns-subledger.sql:94-98 (control-leg gross + canonicalised counterparty); db/v2/23-fns-subledger.sql:180-192 (positive/mismatch/over-allocate guards); db/v2/23-fns-subledger.sql:249-255 (write-off 0 < amt ≤ outstanding); db/v2/90-isolation-tests.sql:890+ (TEST 13 exact-cents tie-out, write-off preserves tie, over-allocation rejected)`
- The contacts register is honestly display-only: names, counts, dates, provenance flag; no financial figure computed client-side.  ·  _evidence:_ `dashboard/lib/contactsRegister.ts:1-10, 20-29; docs/design/05-surfaces.md:380-387`
- The KB proposal loop (evidence → open proposal → human promote/reject with no-downgrade of a human 1.000) is wired across DB, wake, agent tools, and dashboard.  ·  _evidence:_ `db/v2/21-fns-kb.sql:199-207 (auto-file), :245-252 (promote upsert, greatest(confidence,0.95), override reset); db/v2/25-fns-ops.sql:1474-1482 (trg_pn_kbp creator-agnostic wake); agent/src/tools/registry/kb.ts:25-57 (promote/reject tools); dashboard/lib/kbActions.ts + dashboard/components/command/InboxLanes.tsx (both exist — UI surface); db/v2/tests/promote_proposal_test.sql:74-91 (no-downgrade)`
- Client identity registers (directors/email domains/client aliases) ARE genuinely read by accounting executions as model context: director_payee must-ask matching and doc→client identification.  ·  _evidence:_ `belcort/coa-coding/SKILL.md:88-99 (client_directors drives director_payee + entity-type routing); belcort/doc-ingest/SKILL.md:80 (email-domain/alias/legal-name/SSM/TIN client matching); belcort/doc-ingest/references/extracted-fields-schemas.md:129 (claimant_name matched against client_directors)`

#### Unverified (workstream C) — could not be confirmed from frozen evidence; carried as open

- signals/kb-iteration-system.md and signals/per-client-kb-mechanism.md — the owner-intent documents cited throughout the draft's C-11..C-14 — DO NOT EXIST in the frozen repo (or anywhere on the Desktop; searched). Every claim sourced solely to them (the two-tier learning design, the three circles, the weekly curator, kb-material-add, 'locked = 1.00 sticky', keep/switch/split, the v1 journal_entry_rules_applied audit chain, first-approval candidate rules at 0.75) is unverifiable here. Residual in-repo corroboration that SOME v1 mechanism existed: belcort/rule-edit/SKILL.md:49,54-56 still references kb_compile helpers and lock/locked verbs.
- audit-brief.md was absent at its specified path (undefined/audit-brief.md); verification proceeded on the task-stated rules (frozen repo read-only, adversarial default-refute, severity discipline).
- Live belcort-shared DB contents: whether ANY client_memory_notes rows, post-onboarding ar_invoices/ap_bills rows, counterparty aliases, or recon hints exist in production (no live DB access; repo/Desktop guide state no real client books). All 'dead weight' conclusions are structural (no caller/consumer exists), not usage-measured.
- Runtime model behaviour: whether the deployed model ever actually obeys AGENTS.md:74's optional 'read my notes via query_books' directive, or follows coa-coding Step 6's SQL form vs the curated tool (no eval/trace artifacts in the repo either way).
- Whether the agent_select SELECT-wrapped-DEFINER write (C-15) commits on the LIVE Supabase instance under the live role grants — verified at code/rig level (VOLATILE fn + lexical guard + EXECUTE grants) but not exercised against production.
- Whether any live firm's exported aging/management-accounts pack has actually shipped misleading figures (would require live artifact inspection).

#### Decision brief (workstream C)

> C1 — MEMORY NOTES: RECOMMEND MERGE-INTO-KB (retire the as-built table/fn as-is; carry the three underlying needs into the rebuild's knowledge layer as typed, lifecycle-managed objects). Does it work end-to-end? Only half: the WRITE half works and is well-isolated (27-fns-memory.sql + kb.ts tool + seed_client_knowledge dual-seed; isolation TEST 7 / dual-seed TEST 11), but the READ half was never built — no skill, no wake hint, no context builder, no read fn, and no dashboard surface consumes a note; the only consumption path is one optional sentence in AGENTS.md:74 asking the model to run a query_books SELECT, and ADR-033's promised storage-rendered markdown index has no implementation (C-1/C-2). The learn-wake lanes that should generate notes are policy-blocked from writing them (C-4), and the special kinds (must_ask/rule_hint/profile) have no lifecycle or surfacing (C-3). Its measurable contribution to Clara's intelligence is therefore approximately zero: Clara's real memory as-built is (a) the KB rulebook + evidence tally (alive, wired, tested) and (b) the 40-turn chat transcript (sessions.loadHistory). Once the rebuild has a real KB + event/task layer, every legitimate memory-note use collapses into it: 'observation/profile' → typed client-profile facts with provenance in the KB (structurally injected into context packs); 'must_ask' → a first-class open-question/interruption object with resolution state that the workflow engine surfaces at client-work start; 'rule_hint' → a low-evidence KB-proposal state. Do not port the table: an append-only free-text pile with no consumer, no lifecycle, and the weakest audit discipline in the schema (C-5) is pure injection-surface liability.
> 
> C2 — CONTACTS/COUNTERPARTIES: SPLIT RECOMMENDATION — CARRY-FORWARD-AND-INTEGRATE the name-intelligence machinery; REDESIGN the counterparty data layer and its subledger integration. Genuinely used and in sync: client_counterparty_aliases + app.normalize_counterparty + resolve_counterparty (written via the audited bookkeeper+ tool, read structurally inside evidence/rule/subledger/recon-hint writers, isolation-tested) and client_recon_hints (full human-fenced learn loop: trg_pn_bank_match → workbench wake → record_recon_hint → suggest_recon_counterparty at match time, promote admin-gated) — this is proven, tested design worth porting conceptually. Mostly dead weight: the AR/AP open-item layer that actually CARRIES counterparty balances. Its seven writer fns are sound but have zero callers after onboarding — absent from the agent tool registry (proven by the registry parity test's closed EXPECTED set), absent from every skill, absent from the dashboard (arap.ts is read-only) — so aging, statements, allocations, tie-outs, and the contacts fold-in all freeze at the opening seed (C-6/C-7). VERIFICATION CORRECTION on the SST consequence (C-8): the return is NOT starved — an unanchored tagged service-tax leg silently falls back to the cash-direct bucket and declares IN FULL at posting_date — so the real defect is a silent statutory-basis substitution (accrual instead of payment basis; s.11(2), bad-debt relief, and advance handling structurally inoperative), which the docs (backend.md:81) misrepresent as a built payment basis. And there is no counterparty ENTITY at all: identity is free-text snapshot strings merged display-side, so an alias repoint splits history and can strand settlements (C-9), while coding-time rule lookup doesn't even use the alias map (C-10). The rebuild should: (1) create a first-class per-client counterparty record (id-keyed, typed, alias children) FK'd from rules, evidence, hints, and subledger items; (2) make subledger maintenance intrinsic to the coding/receipt executions (or DB-derived from control-account legs) so it cannot silently diverge; (3) keep the tie-out honesty pattern but let it travel with exported artifacts, and gate the SST service-basis computation on proven feedstock completeness.
> 
> KB INTENT vs AS-BUILT: the as-built v2 keeps a strong governance spine (per-client rules, user-gated promotion, alias collapse, decay/override-watch, full KB audit — all verified and tested) but the learning ENGINE is thinner than the repo's own documentation describes: the candidate tier is unreachable (no writer mints one; the ratified ladder, the coding skill, AGENTS.md, the KB-workbench design spec, and a dashboard count all still describe it as live — C-11), the pipeline is purely reactive and the proposals table structurally forbids every proposal type except rule_promotion (C-12), human-pinned 1.000 rules decay and silently auto-retire identically to evidence-derived rules while doctrine still offers 'lock' verbs (C-13), and knowledge provenance on entries is single-rule, mutable-target, and destroyed by corrections (C-14). CAVEAT FOR GATE 1: the draft attributed these gaps to a specific owner-designed v1 system documented in signals/kb-iteration-system.md and signals/per-client-kb-mechanism.md — those files do not exist in the frozen repo, so the 'owner intended X' framing is unverifiable here (only doctrine residue like rule-edit's kb_compile/lock references corroborates that a richer v1 existed). Each item should still go to the owner as an explicit keep/drop decision in the rebuild's KB design — but present them as verified docs-vs-code contradictions and capability gaps, not as verified owner-intent violations, unless the owner re-supplies the intent documents.

---

## Workstream D — Chat panel & interaction model

### `D-1` · **CRITICAL** · Documents-tab upload silently does nothing: the chat run it starts is never executed (no SSE attach), yet the UI toasts success
*Hero-prompt item: image/file upload through EVERY expected path*

**Evidence**
- `dashboard/components/documents/DocumentsTable.tsx:471-482 — defaultSend only POSTs /firms/:id/chat and returns res.json(); it never opens GET /chat/events (the run_id in the response is discarded at :250)`
- `dashboard/components/documents/DocumentsTable.tsx:8-11 — header declares this 'the ONLY ingest path'; :250-252 success toast 'Clara is filing them; they'll appear in this list'`
- `dashboard/components/workbench/WorkspaceIslands.tsx:142-154 — production passes no deps.send, so defaultSend is the live path`
- `agent/src/runtime/openai/runtime.ts:175-206 — startRun only registers a RunRecord (status 'running'); the model loop runs exclusively inside streamRun (:233 `run(agent, rec.input, …)` is reached only from an SSE attach); :371 the wake path documents this exact contract — 'fire-and-forget: a wake has no SSE consumer — drain the stream so the run executes' — and drains itself; nothing drains an interactive run`
- `agent/src/http/server.ts:340-371 — POST /chat persists the user turn (:357 appendUser, so a ghost transcript turn IS durable) and calls startRun, dispatching nothing; :434-449 GET /chat/events is the sole execution driver`
- `agent/src/runtime/openai/runtime.ts:484-495 — a never-streamed 'running' run (streaming=false, no pending clarify) is silently evicted after 30 min; server.ts:413-428 acknowledges the 'never-streamed running run' state in the reset guard (15-min unwedge)`

**What is wrong / missing** — Uploading via the Documents tab drop-zone/picker reads the bytes, POSTs a chat turn, persists the user message, and toasts success — but with no SSE consumer the agent run never executes: no upload_document, no ingest_document, no OCR, no document row. Files never appear; the transcript later shows a ghost 'Uploaded N documents…' turn with no reply, and the scope's session reset is even 409-blocked for 15 minutes by the wedged run pointer. Complete, silent feature failure on the primary ingest surface.

**What the rebuild must do** — Any path that starts a run must also drive it: either attach an events/poll consumer after POST (like HermesChatTransport does), or make the agent service execute runs independently of an SSE attach (the durable-runtime target, ADR-122). Never toast success on a fire-and-forget POST.

### `D-2` · **HIGH** · Half the artifact catalog is unreachable dead UI: review_summary has no emitter or fence tag anywhere; sst_summary/journal_table/kv_summary have no emitter and no live extraction; the native 'artifact' SSE frame is dead vocabulary on both ends
*Hero-prompt item: inventory ALL interactive artifacts / card registry + agent-side card emission*

**Evidence**
- `dashboard/lib/artifacts.ts:45 — 8 registered types incl. review_summary; parseArtifact:478-495 validates all 8`
- `dashboard/lib/chat/artifactFence.ts:24-29 — live fence allowlist is only export_result|je_review|suggestion|client_row; review_summary absent`
- `agent/src/http/sessions.ts:43-44 — hydrate-path fence regex lifts 7 types; review_summary absent there too; :13-15 the native artifact jsonb column is 'reserved', and appendAssistant (:169-175) passes only content — nothing populates it (db/v2/26-fns-session.sql:62 has the column, never fed)`
- `belcort doctrine grep — the only fenced-card instructions are coa-coding/SKILL.md:322-327 (je_review), export/SKILL.md:174-177 + year-end-close/SKILL.md:160 (export_result), _shared/suggestion-chips.md:25-29, _shared/client-row.md:17-22; kv_summary/journal_table/sst_summary/review_summary appear nowhere in belcort/ and (grep-verified) nowhere in agent/src outside a types.ts comment and the sessions.ts regex`
- `agent/src/runtime/sse.ts:47-49 — an 'artifact' SSE frame exists, but agent/src/runtime/openai/events.ts:38-67 maps only delta/tool events (never kind:'artifact'), and dashboard/lib/relayStream.ts:47-81 has no 'artifact' branch (frame ignored if ever sent)`
- `dashboard/components/rail/ReviewSummaryCard.tsx + AgentCard.tsx:72-73 — full component + 'Post all N' onPostBand wiring exists (ClaraThread.tsx:225-243 approveBandEntries) for a card that can never arrive`

**What is wrong / missing** — 4 of 8 catalog cards (review_summary, sst_summary, journal_table, kv_summary) can never render from a real agent turn: no doctrine/tool emits them, the live translator doesn't extract three of them (they'd stream as raw JSON in the bubble), and review_summary isn't in either extractor — it is unreachable even after reload. The parallel native artifact wire (RuntimeEvent 'artifact' → SSE frame → dashboard) is dead code end-to-end. The design SoT (docs/design/04-agentic.md:97-108) marks all 8 as ✅ live; the catalog is proven only by test fixtures.

**What the rebuild must do** — One authoritative emit path per card type: doctrine/tool emission + identical fence allowlists in the live extractor and shape-at-read extractor + a parity test across dashboard/agent — or delete the dead card types and dead wire vocabulary.

### `D-3` · **HIGH** · filter_journals directive channel is dead at every station AND doctrine-instructed emission renders raw JSON in the live chat bubble
*Hero-prompt item: agent-side card emission / streaming quality*

**Evidence**
- `belcort/AGENTS.md:90 + belcort/_shared/filter-directive.md:3-7,21-26 — doctrine instructs Clara to emit ```filter_journals fences and promises 'the runtime lifts the directive off your message stream… it never shows as text, live or on reload'`
- `agent/src/runtime/openai/events.ts:38-67 — the SDK-event mapper never yields a 'directive' RuntimeEvent, so agent/src/runtime/sse.ts:50-53's directive frame is never produced`
- `dashboard/lib/relayStream.ts:47-81 — parseRunEvents has no 'directive' branch (the frame would be ignored even if sent)`
- `dashboard/lib/directives.ts:40-43 — dispatchDirective exists but a repo-wide grep finds no production caller (tests only); a grep for DIRECTIVE_EVENT/'belcort:directive' listeners finds NONE outside directives.test.ts — the promised grid listener does not exist either`
- `dashboard/lib/chat/artifactFence.ts:76-79 — hasFenceOpener matches only the 4 artifact tags, so a filter_journals fence is NOT suppressed while streaming; runEventChunks.ts:123-147 finalize (no-artifact branch flushes ex.content, which still contains the block) leaves it in the visible text`
- `agent/src/http/sessions.ts:65-72 — stripDirectiveBlocks runs only at read (reload), confirming the live turn shows it raw`

**What is wrong / missing** — Whenever Clara follows her own doctrine (e.g. after coding a batch: 'filter to the new needs_review drafts'), the user sees an ugly raw ```filter_journals {json}``` code block in the live reply, the grid never filters (the channel is dead at all four stations: no agent emitter, no SSE branch, no dispatch call, no grid listener), and the block disappears after reload — live and persisted views of the same turn differ. The doctrine's promise is false twice over.

**What the rebuild must do** — Either build the channel end-to-end (translator extracts the fence → dispatchDirective → add the grid's DIRECTIVE_EVENT listener, which does NOT yet exist — only the dispatcher utility and asJournalDirective narrowing do) or remove the doctrine instruction; live view and reload view of a turn must be identical.

### `D-4` · **HIGH** · Multi-card turns are structurally broken: only the first fence is lifted, fence suppression never resets, and all post-fence prose is silently withheld from the live stream
*Hero-prompt item: do cards render properly / streaming quality*

**Evidence**
- `dashboard/lib/chat/runEventChunks.ts:50,90-98 — `suppressing` is set at the first fence opener (:98) and never reset; every subsequent delta only buffers (:90)`
- `dashboard/lib/chat/runEventChunks.ts:123-147 — the artifact branch of finalize emits only closeText + the card; the stripped post-fence prose (ex.content beyond emitted) is never flushed live`
- `dashboard/lib/chat/artifactFence.ts:57-59 and agent/src/http/sessions.ts:47-60 — both extractors lift only the FIRST fence match (single regex exec); ShapedMsg carries a single `artifact` and hydrate attaches at most one data-artifact part (hydrateTranscript.ts:32-41)`
- `belcort/_shared/client-row.md:11,17-18 — doctrine explicitly instructs 'one client_row chip per client' and 'emit ONE chip's JSON per block (emit several blocks for several clients)'`

**What is wrong / missing** — A firm-level answer like 'what needs my attention?' with 3 client_row chips renders live as: prose + first card only, everything after the first fence (including more prose) invisible until reload; after reload it renders as first card + the remaining fences as raw JSON code blocks. Any prose Clara writes after a je_review/export_result card is likewise lost live.

**What the rebuild must do** — Support N artifact parts per turn (both extractors + message shape), reset suppression at the fence close, and flush post-fence prose — or constrain doctrine to exactly one trailing card and enforce it.

### `D-5` · **HIGH** · Chat attachments are invisible in the transcript: no attachment parts, no metadata persisted, no thumbnails, no upload/OCR/assignment status, files-only turns show '(see attached)'
*Hero-prompt item: attachments: filename/type/size/upload status/OCR status/assignment status or a bare line*

**Evidence**
- `dashboard/components/clara/ClaraTranscript.tsx:116-163 — MessageTurn renders only text, data-artifact and data-clarify parts; there is no attachment part in the vocabulary (lib/chat/hermesUIMessage.ts:41-46: artifact/tool/clarify/recovery only)`
- `dashboard/lib/attachments.ts:141-148 — 'chat_messages persists no attachment metadata: this text is the turn's durable transcript trace'; the composer's AttachmentMeta chips exist pre-send only (ClaraComposer.tsx:248-261) and are dropped on send (:157)`
- `dashboard/lib/chat/useHermesChat.ts:88 — a files-only turn becomes the literal text '(see attached)'`
- `docs/design/04-agentic.md:37-38 — the design SoT promises 'thumbnail chips above the textarea with per-chip remove + upload progress'; there are no thumbnails and no progress indicator anywhere (a 5×20MB base64 POST just sits in 'submitted')`
- `Contrast: the Documents tab does show filename/size/status/OCR-pending (components/documents/docStatus.ts:14-47) — but only there, not in chat`

**What is wrong / missing** — After Send, a user turn with attachments shows only its text (or '(see attached)'). Neither live nor after reload does the transcript show what was attached — no filename, type, size, no upload progress, no OCR/ingestion state, no client-assignment state, no preview, no actions. This is below the 'bare attached-file line' bar the workstream asks about — there is no line at all.

**What the rebuild must do** — Persist attachment metadata on the turn (documents row ids once ingested), render attachment chips/thumbnails on transcript turns with live status (uploading → ingested → OCR'd → assigned) and open/preview actions.

### `D-6` · **HIGH** · Tool activity is effectively invisible: the humanized verb is computed then never rendered, most curated tool names map to 'Working…', tool history is never persisted, and a 60-150s cold start shows nothing in the thread
*Hero-prompt item: tool-result cards / streaming quality vs Claude-class*

**Evidence**
- `dashboard/components/clara/ClaraThread.tsx:160-168 — chat.toolVerb feeds useAgentState, which consumes it as `toolActive: Boolean(input.toolVerb)` (lib/chat/useAgentState.ts:58) — boolean only; a repo grep shows the verb string is rendered nowhere; the rail header uses <PresenceDot showLabel={false}> (ClaraThread.tsx:278)`
- `dashboard/lib/relayStream.ts:28-45 — VERB_MAP regex buckets; curated tool names draft_entry/approve_entry/assign_document/record_ar_invoice/extract_document/ingest_document match no bucket → 'Working…'; only query_books-style names map ('Checking the books…')`
- `dashboard/lib/chat/hydrateTranscript.ts:25-27 — 'tool_calls … no landing slot in HermesUIMessage; dropped'; agent-side appendAssistant persists content only (agent/src/http/sessions.ts:169-175) — the chat_messages tool_calls column is never fed`
- `dashboard/lib/chat/makeHermesRunner.ts:16-18 — 'A cold container takes ~60-150s to the first SSE event'; ClaraTranscript.tsx:102-114 renders nothing for an empty assistant turn (no thinking indicator, no status line)`
- `docs/design/04-agentic.md:52,65-71 — even the design's reduced v1 promise (pre-first-token honest status line; 'v1 renders verb + phase only' as one chip per tool call) is unimplemented; 04-agentic.md:8 bans 'Working…' microcopy — which is exactly what the pipeline produces`

**What is wrong / missing** — During a long tool-heavy run the transcript shows an empty reply with only a small pulsing presence dot; the user cannot see that Clara is reading a document, querying the books, or drafting an entry — and after reload there is zero trace any tool ever ran. Versus Claude/Codex-class tool-call cards (named call, inputs, outputs, expandable) this is the single largest fidelity gap, and it is not even at the level the design SoT scoped for v1.

**What the rebuild must do** — Render the existing verb stream as an in-thread status line/chips (pre-first-token included), map curated tool names honestly, persist typed tool-call history, and add expandable tool-result detail per the design's recorded wire extension.

### `D-7` · **HIGH** · Rehydrated je_review approval cards are stale-actionable: an already-posted/rejected entry re-renders as 'Plan · needs approval' with a live Approve button
*Hero-prompt item: approval cards — do they render properly*

**Evidence**
- `dashboard/components/rail/planStateMap.ts:22-24 — planStateOf defaults every untracked entry to 'pending'; the optimistic ledger is per-mount React state (ClaraThread.tsx:138), empty after every reload/scope switch (ClaraRail.tsx:206-210 remounts ClaraThread per scope/session)`
- `dashboard/components/rail/PlanCard.tsx:80,90,129-135 — the card gates on the `state` prop only (toConfirmation maps it to the Confirmation branches); art.status (the persisted lifecycle status, artifacts.ts:123) is never consulted for inertness`
- `docs/design/04-agentic.md:116-118 — catalog LAW: 'cards re-hydrate identically from persisted parts forever … with stale actionable cards marked inert'`

**What is wrong / missing** — Open any thread containing an old je_review card: it shows the urgent 'needs approval' header and an enabled Approve & post regardless of the entry's real state. Clicking Approve on a posted entry round-trips to the DB and errors with a status-gate toast; on an entry edited since emission the user approves based on stale displayed legs while the DB posts the current ones. Safe at the DB, but the chat lies about pending work — corrosive to the trust spine and a design-law violation.

**What the rebuild must do** — Derive card state from the entry's live/persisted status on hydrate (art.status at minimum; ideally a fresh read — note art.status is itself emit-time-stale), render posted/dismissed terminal states inert.

### `D-10` · **MEDIUM** · Pasted screenshots after the first are silently dropped: attachment de-dupe keys on filename and clipboard images are all named identically
*Hero-prompt item: Ctrl+V paste upload path*

**Evidence**
- `dashboard/components/clara/ClaraComposer.tsx:125-129 — addFiles filters incoming by held NAME and returns with setFileError(null) when nothing is 'fresh' — no user feedback`
- Browsers name every pasted clipboard image 'image.png' (same name, different bytes), so the second pasted screenshot in a message is treated as a duplicate of the first

**What is wrong / missing** — Paste screenshot A (attaches), paste screenshot B (silently ignored — no chip, no error). The user sends believing both are attached; only A rides the wire. Data-loss-shaped UX on the most common image path.

**What the rebuild must do** — De-dupe on content (size+hash) or uniquify names (image-2.png); at minimum surface 'already attached' feedback instead of silence.

### `D-11` · **MEDIUM** · No visibility or reattach for in-flight chat runs across reload/navigation: the reply lands in the DB but the UI never learns
*Hero-prompt item: long-run task visibility*

**Evidence**
- `dashboard/lib/chat/hermesChatTransport.ts:263-265 — reconnectToStream returns null by design; dashboard/components/clara/ClaraRail.tsx:122-132 — mount hydrates history only; nothing reads the session's active_run_id to resume/poll`
- `agent/src/http/server.ts:186-197 — the notifications hub nudges only proactive_notifications + books tables; db/v2/25-fns-ops.sql:1581-1606 — the trg_bs emit set is journal_entries/journal_lines/documents/client_kb_rules/kb_proposals/proactive_notifications/export_artifacts; chat_messages has NO trigger, so no signal refreshes the transcript when the reply persists`
- `dashboard/lib/chat/hermesChatTransport.ts:4-6 + agent/src/runtime/openai/runtime.ts:225-228 — the SSE is single-consumer/non-replaying, so even a same-session second tab cannot watch a run`

**What is wrong / missing** — Reload (or navigate scope) during a 2-minute run: the thread renders as if nothing is happening; the run completes server-side and persists, but the answer only appears after a manual refresh or scope round-trip. There is no 'Clara is still working on X' state anywhere, and no other tab can see it. (Bulk-approve jobs DO have a tray + job SSE — chat runs have nothing.)

**What the rebuild must do** — Durable runs with reattach (poll active_run_id on mount, resume or at least show a working/settled banner and auto-refetch on completion) — aligns with the ADR-122 durable-runtime requirement.

### `D-12` · **MEDIUM** · je_review Edit and 'Not now' are dead in the shipped chat: ClaraThread never wires onEdit/onDismiss, so the card offers Approve only
*Hero-prompt item: approval cards — available actions*

**Evidence**
- `dashboard/components/clara/ClaraThread.tsx:312-346 — ClaraTranscript is called without onEdit/onDismiss; ClaraTranscript.tsx:144-145 forwards them only if present; PlanCard.tsx:219-220 renders Edit/'Not now' buttons only when handlers exist`
- `dashboard/components/rail/AgentCard.tsx:23-24 — the props exist and are typed, upstream support is complete (PlanCard's dismissed terminal state at :264-268 is fully built)`
- `docs/design/04-agentic.md:101 — the catalog row promises 'Approve/Edit/Reject' on the Plan card`

**What is wrong / missing** — The in-chat approval card cannot route to the edit sheet or be parked ('Not now') — the two non-approve verbs the design promises. A user who disagrees with a draft has no in-thread affordance except leaving it; Edit exists only in the Journals grid.

**What the rebuild must do** — Wire onEdit (open EditEntrySheet for the entry) and onDismiss (plan-state 'dismissed') from ClaraThread at client scope.

### `D-13` · **MEDIUM** · Drag-drop is composer-only; dropping a file on the transcript triggers the browser's default (navigates away), contra the design's 'drag-drop anywhere on the thread'
*Hero-prompt item: drag-and-drop upload path*

**Evidence**
- `dashboard/components/clara/ClaraComposer.tsx:178-216 — dragover/drop handlers live on the composer wrapper div only`
- `repo grep — the only onDrop/onDragOver handlers in dashboard/components are ClaraComposer and DocumentsTable; no drop handlers on ClaraTranscript/MessageScroller and no document-level preventDefault anywhere in the rail`
- `docs/design/04-agentic.md:37 — 'Attachments: button + drag-drop anywhere on the thread + paste'`

**What is wrong / missing** — A user dragging a PDF onto the visible conversation (the natural large target) gets the browser opening the PDF over the app — losing the composer draft (module state unloads on navigation) and thread position. The valid drop target is only the slim composer strip.

**What the rebuild must do** — Thread-wide (or rail-wide) drop zone with the existing overlay affordance; suppress default drop on the shell.

### `D-14` · **MEDIUM** · No per-message affordances at all: no copy, no edit, no per-turn regenerate, no quote-reply; code-block copy explicitly disabled; no day dividers; live turns lack timestamps
*Hero-prompt item: chat must feel Claude-class: message affordances*

**Evidence**
- `dashboard/components/clara/ClaraTranscript.tsx:98-114 — a turn renders prose + hover timestamp only; there is no hover action row anywhere`
- `dashboard/components/clara/StreamdownView.tsx:23 — <Streamdown … controls={false}> turns OFF the library's code-block copy/download controls; docs/design/04-agentic.md:62-63 promises 'Code blocks always get copy + language label'`
- `docs/design/04-agentic.md:59-63 — promised v1 affordances (copy · edit-as-copy-into-composer · regenerate-as-new-turn · quote-reply) are all absent; the only retry is the turn-level error banner (ClaraThread.tsx:348-355)`
- `dashboard/components/clara/ClaraTranscript.tsx:62-67 + lib/chat/hermesUIMessage.ts:49-55 — createdAt exists only on hydrated turns, so live turns show no timestamp until reload; no day dividers exist (04-agentic.md:31)`

**What is wrong / missing** — Against the Claude/Codex bar named in this workstream — and against this repo's own design SoT — the transcript is display-only: you cannot copy an answer, re-ask, or quote without manual selection. Copy on code/SQL blocks (an accountant's export surface) is deliberately disabled.

**What the rebuild must do** — Hover/roving-tabindex action row per turn (copy, copy-into-composer, resend-as-new-turn, quote), controls enabled on code blocks, day dividers, timestamps on live turns.

### `D-16` · **MEDIUM** · Generative UI is a fixed 8-type static catalog (only 4 emittable today — see D-2): no dynamic forms, tables beyond 12 rows, charts, or workflow controls; all 6 design-planned additions unbuilt
*Hero-prompt item: generative-UI capability assessment*

**Evidence**
- `dashboard/lib/artifacts.ts:1-18 — deliberate LAW: 'text-to-hydration, NEVER text-to-code'; the agent selects from a finite catalog, no agent-authored layout (a sound trust ceiling, correctly enforced by parseArtifact:478-495 fail-closed with caps :229-243)`
- `docs/design/04-agentic.md:97-114 — catalog table: 8 'live' + 6 planned additions all ⬜ unbuilt: plan (multi-step plan-as-document), recon_table, doc_review (thumbnail + per-field evidence), account_combo (structured clarify picker), mini_chart (the ONLY chart anywhere), receipt`
- `dashboard/components/rail/ReadOnlyCards.tsx / ReviewSummaryCard.tsx / PlanCard.tsx — every renderer is a hardcoded component; no chart library, no dynamic form machinery in the chat surface`

**What is wrong / missing** — Answering the workstream question directly: Clara cannot dynamically render context-aware cards/forms/tables/charts/workflow controls — only static hardcoded component types, and (per D-2) only je_review, export_result, suggestion and client_row can actually arrive. There is no charting capability at all, no structured input beyond clarify choice chips, and no multi-step workflow card. The static-catalog LAW is defensible for a system of record; the catalog being half-dead and the planned tier-2 cards all missing is the gap.

**What the rebuild must do** — Keep the fail-closed catalog LAW, but make every registered card reachable (D-2) and build the planned structured-input (account_combo), doc_review and mini_chart cards to close the Claude-class interactivity gap.

### `D-8` · **MEDIUM** · Clarify lifecycle is process-local and lossy: never persisted, orphaned by reload, absent from the model's own memory, answered fire-and-forget, and the card stays clickable after a free-text answer
*Hero-prompt item: clarification cards / choice cards / message persistence*

**Evidence**
- `dashboard/lib/chat/hydrateTranscript.ts:32-41 — shapedToHermesUI emits only text + artifact parts; a data-clarify part is never rehydrated (agent-side chat_messages stores no clarify rows)`
- `agent/src/runtime/openai/runtime.ts:236-258,285-292 — the clarify Q&A lives only in the in-memory RunRecord/RunState; persistAssistant stores only the final output; sessions.ts loadHistory:253-270 reads chat_messages only, so the NEXT turn's model memory omits what the user answered`
- `dashboard/components/clara/ClaraRail.tsx:122-132 — mount hydrates the transcript only; no reattach to active_run_id (GET /chat/messages doesn't even return it), so a reload mid-clarify hides the question while the run stays parked server-side (runtime.ts:491 — a run with a pending clarify is never evicted; server.ts:421-428 — the scope unwedges only after 15 min)`
- `dashboard/components/clara/ClaraThread.tsx:248-256 — markClarifyResolved fires optimistically with the send; makeHermesRunner.ts:88-100 clarify() never throws on a failed POST (raiseIf401 only), so a failed answer leaves the run parked while the composer exits answer-mode`
- `dashboard/components/clara/ClaraClarify.tsx:21-28 + ClaraTranscript.tsx:158-161 — answeredWith exists as a prop but is never passed, so after a composer-typed answer the choice buttons remain clickable and re-POST to the (possibly settled) run`
- `docs/design/04-agentic.md:13-17 — design promise (cross-scope needs-you amber count badge + jump list; 'a clarify never times out silently … it persists as needs-you') is unbuilt — grep finds no such badge/jump-list, only PresenceDot state colors`

**What is wrong / missing** — Reload during a clarify: the question vanishes, the composer is normal-mode, the next message starts a new run while the old one sits parked; the transcript never shows the Q&A again; the model itself forgets the user's answer in later turns; a network blip while answering silently discards the answer.

**What the rebuild must do** — Persist clarify request/response as typed transcript rows (the greenfield interruptions table), reattach or surface parked runs on mount, ack/error the clarify POST, pin the answered state on the card from persisted data.

### `D-9` · **MEDIUM** · Drop-recovery needlessly discards the final answer the poll endpoint already returns, settling on a partial with a false 'may be partial' warning
*Hero-prompt item: error/retry UX / SSE streaming*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:330-335 — pollRun returns `output` (the authoritative final text) for settled runs`
- `dashboard/lib/chat/makeHermesRunner.ts:102-141 — the dashboard's poll parses only {status, pendingClarify} and drops `output`; lib/runRecovery.ts:31-41 classifyRunPollResult's terminal bucket carries only `ok``
- `dashboard/lib/chat/hermesChatTransport.ts:34,147-150 — a terminal poll settles the turn on the streamed partial + '⚠ Clara was interrupted mid-reply; this may be partial'; the module header's rationale (:8-16, 'the accumulated-but-undelivered content is lost service-side — there is no replay') is stale relay-era doctrine for the terminal case`
- `agent/src/runtime/openai/runtime.ts:285-292 — the full output IS persisted, so a later reload shows the complete reply that the live view labeled partial`

**What is wrong / missing** — After any mid-stream blip on a run that completes, the user sees a truncated reply stamped 'may be partial' even though the complete text was one field away in the very poll response the client already made — and the same turn silently becomes complete after a reload (live/persisted divergence).

**What the rebuild must do** — When the recovery poll returns a terminal status with output, reconcile the turn to that output (same finalize path as `done`) instead of settling partial.

### `D-15` · **LOW** · No slash-commands or @-mentions in the composer (design-promised); context comes only from the scope and the rail 'reference' chips
*Hero-prompt item: chat must feel native: composer power features*

**Evidence**
- `docs/design/04-agentic.md:44 — 'Slash-commands + @-mentions via a caret-anchored cmdk popover (accounts, clients, documents, entries)'`
- `dashboard/components/clara/ClaraComposer.tsx — full read: a plain textarea; no popover, no mention/command parsing; the only entity referencing is the railChips bus (:114-119) fed from grid rows`

**What is wrong / missing** — The user cannot reference an account, client, document or entry from within the composer; the promised caret-anchored cmdk surface does not exist. (⌘K palette exists but is a separate, non-caret dispatch surface.)

**What the rebuild must do** — Caret-anchored mention/command popover backed by the existing read plane, per the design SoT.

### `D-17` · **LOW** · Regenerate after a failed attachment turn likely re-sends the text without the files (per-call body not replayed)
*Hero-prompt item: error/retry UX*

**Evidence**
- `dashboard/lib/chat/useHermesChat.ts:92-93 — documents ride ChatRequestOptions.body on the ORIGINAL sendMessage call only`
- `dashboard/lib/chat/hermesChatTransport.ts:237-241 — sendMessages reads options.body.documents; chat.regenerate() (useHermesChat.ts:109) passes no body, so the re-POST would carry message text only`

**What is wrong / missing** — Clicking Retry on an errored attachment turn plausibly re-runs the turn without its files — Clara answers '(see attached)' with nothing attached. Marked plausible: AI SDK 6's regenerate body-replay semantics were not verified against the library source.

**What the rebuild must do** — Cache the turn's WireDocs until the turn settles successfully and replay them on regenerate, or disable Retry for attachment turns with honest copy.

#### Verified as sound (workstream D)

- SSE streaming core is robust and well-engineered: line-buffered frame decoding tolerant of both event-name dialects (assistant.delta/message.delta, assistant.completed/run.completed), keepalive comments ignored, 25s server heartbeat, 150s headers-only deadline with unbounded body read, early stream-close on terminal event (fixes the frozen-mid-word bug), single-consumer + firm-bound streams (WIRE-03 IDOR guards on events/poll/clarify)  ·  _evidence:_ `dashboard/lib/relayStream.ts:47-81; agent/src/http/server.ts:151-157,434-449; dashboard/lib/chat/makeHermesRunner.ts:16-18,69-86; dashboard/lib/chat/hermesChatTransport.ts:191-209; agent/src/runtime/openai/runtime.ts:211-228,304-307,326-328`
- Streaming markdown rendering is genuinely Claude-class where it works: Streamdown 2.5 with parseIncompleteMarkdown, per-word fade honoring prefers-reduced-motion, fence-flash suppression for the 4 live card tags, and an accounting-safe screen-reader sentence-flush mirror (polite, whole sentences, never split decimals)  ·  _evidence:_ `dashboard/components/clara/ClaraMarkdown.tsx:32-58; dashboard/components/clara/StreamdownView.tsx:21-27; dashboard/lib/chat/runEventChunks.ts:35-41,84-99; dashboard/package.json:41`
- Scroll behavior is polished: use-stick-to-bottom engine, pin-user-turn-to-top-on-send with self-guarded ResizeObserver spacer, '↓ latest' pill, auto-follow that never yanks a scrolled-up reader, instant under reduced motion, keyboard-focusable role=log region  ·  _evidence:_ `dashboard/components/clara/MessageScroller.tsx:23-109; dashboard/components/clara/ClaraTranscript.tsx:179-219`
- Message persistence + pagination are solid: DB-backed per-(firm,user,scope) sessions via audited SECURITY DEFINER fns on the caller's JWT, id-keyset pagination (limit+1/before, 50 default 200 max), read-only 'Show earlier' lead pages, archived sessions browsable read-only, reset guarded by run-in-flight 409 with a 15-min stale-run escape, raw-persist + shape-at-read (recoverable if extraction rules change)  ·  _evidence:_ `agent/src/http/sessions.ts:113-272; agent/src/http/server.ts:337-431; dashboard/lib/chat/sessionsApi.ts:44-84; dashboard/components/clara/ClaraRail.tsx:121-170,177-199; dashboard/components/clara/SessionMenu.tsx:56-106`
- All three chat upload paths exist in code and share one validation pipeline: paperclip file picker, drag-drop over the composer (with visible overlay), and Ctrl+V paste — cumulative caps (5 files/20MB each), MIME allowlist mirroring the agent gate (PDF/PNG/JPEG/WebP/TIFF/HEIC/XML with .xml MIME normalization), inline first-failure-wins errors, 32,768-char message cap surfaced inline; server re-validates independently (defense in depth) and the 150MB body ceiling is sized to the cap  ·  _evidence:_ `dashboard/components/clara/ClaraComposer.tsx:125-216,276-297; dashboard/lib/attachments.ts:7-110; agent/src/http/documents.ts:7-63; agent/src/http/server.ts:61-67`
- Uploaded documents CAN be OCRed and referenced later — via the agent tool chain when a run actually executes (the composer/chat path; the Documents-tab path is D-1): attachments ride the POST as b64, the runtime injects a facts-only manifest (index/filename/MIME/bytes/sha256), and the model calls upload_document → ingest_document (idempotent on sha256 — db/v2/tests/documents_ingest_idempotency_test.sql) → extract_document (deterministic OCR engine, agent/src/ocr/azureDocai.ts); the Documents tab then offers preview (DocumentExpand), signed-URL open ('o' key, 600s TTL), and OCR-pending/coded status display  ·  _evidence:_ `agent/src/runtime/openai/runtime.ts:48-58,192; agent/src/tools/buildTools.ts:239-339; agent/src/ocr/azureDocai.ts; dashboard/components/documents/DocumentsTable.tsx:140-158; dashboard/components/documents/docStatus.ts:14-47`
- The clarify LIVE flow (when nothing drops) is well-built: first-class card with enumerated choice chips + free-text escape, composer answer-mode with visible banner and Esc ladder (Stop > cancel-answer > collapse), answering resumes the SAME suspended run over the open SSE (RunState approve/resume), injection-sanitized answers (sanitizeClarify), and the CLARA-01 guard prevents stray answers to settled runs  ·  _evidence:_ `dashboard/components/clara/ClaraClarify.tsx:24-70; dashboard/components/clara/ClaraComposer.tsx:94,117,163-169,219-224; agent/src/runtime/openai/runtime.ts:236-258,301-322; dashboard/lib/chat/hermesChatTransport.ts:247-261; dashboard/lib/chat/useHermesChat.ts:69-73`
- The artifact validation gate is a genuine security asset: fail-closed discriminated parsing, bounded strings/rows/files/chips, safe-integer cents, strict slug charset preventing in-app open-redirect, no raw HTML anywhere (no dangerouslySetInnerHTML over agent output; Streamdown keeps sanitised defaults), unknown types render nothing  ·  _evidence:_ `dashboard/lib/artifacts.ts:229-500; dashboard/lib/chat/runEventChunks.ts:127-133; dashboard/components/rail/AgentCard.tsx:68-90`
- Error/offline UX has honest foundations: turn-level error banner with Retry, scope-mismatch write blocks with dismissible reason, durable relay-offline latch feeding a global banner + composer disable ('nothing posts'), expired-session Approve rendered inert with a note, lossy drop-recovery clearly labels partials rather than fabricating (though see D-9 for the terminal case), session-expiry 401 signal raised once idempotently  ·  _evidence:_ `dashboard/components/clara/ClaraThread.tsx:154-172,200-218,348-364; dashboard/components/rail/PlanCard.tsx:107-116,222-230; dashboard/lib/chat/hermesChatTransport.ts:29-34,106-155; dashboard/lib/chat/makeHermesRunner.ts:25-31`
- The je_review approval card itself (fresh, live, client scope) is strong: exact-balance cue distinct from the ≤5¢ posting gate, SST tax legs always visible, evidence glyph + declared-risk tier rendered never derived, durable RULE/AUTO/MATCHED authorship badge shared with the grid, source-document provenance chip, posted-state 'View in Journals' jump, role-gated with honest read-only copy, non-blocking role=group (never a focus trap)  ·  _evidence:_ `dashboard/components/rail/PlanCard.tsx:80-269; dashboard/components/rail/planCardModel.ts; dashboard/components/clara/ClaraTranscript.tsx:122-136`
- Session hygiene details are right: per-scope draft persistence across remounts, prefill seeds (⌘K ask + window event bus that expands a collapsed rail), files-only turns not silently dropped, viewer role honestly blocked from messaging, empty-state suggested prompts, per-thread state remounted clean on scope switch (no cross-client leakage)  ·  _evidence:_ `dashboard/components/clara/ClaraComposer.tsx:64-102; dashboard/components/clara/ClaraRail.tsx:60-78,206-235; dashboard/lib/chat/useHermesChat.ts:76-94; dashboard/components/clara/ClaraThread.tsx:96-113,258-269,329-345`

#### Unverified (workstream D) — could not be confirmed from frozen evidence; carried as open

- The audit brief (undefined/audit-brief.md) and the two prescribed evidence maps (undefined/maps/dashboard-map.md, undefined/maps/agent-map.md) do not exist in the repo — only undefined/maps/db-map.md does. Verification proceeded directly against the code; severity rubric applied is critical/high/medium/low.
- D-17 (regenerate dropping attachments) remains PLAUSIBLE, not exercised — AI SDK 6's regenerate/body-replay semantics were not verified against the installed library source; the finding is stated as hedged and its code-side evidence (per-call body, no body on regenerate) is confirmed.
- Whether the agent's model loop actually survives a client SSE disconnect to completion (res.write on a closed socket not aborting the for-await loop in server.ts:441-447) is inferred from Node semantics + the persistAssistant design, not exercised — if it does NOT survive, D-11 worsens (the reply would never persist).
- Streamdown 2.5's `controls={false}` disabling code-block copy controls (D-14) is inferred from the library's documented prop and the deliberate in-code usage, not exercised in a browser.
- No live/runtime testing was possible (frozen read-only repo, no deploy touched): every finding is static analysis of code + doctrine. In particular, whether gpt-5.5 ever spontaneously emits the undocumented kv_summary/journal_table/sst_summary fences (which would render as raw JSON live, then as cards after reload via the hydrate extractor's 7-tag regex) was not observed.
- The onboarding/ceremony bootstrap chat (/bootstrap/chat via useOnboardingRun, cinematic interview) rides the same SSE decoder but was not audited in depth — adjacent surface, likely shares D-3/D-4-class fence behaviors.
- Visual polish (Ledger Glass fidelity, exact a11y contrast, motion feel) was not assessed in a browser; only the code-level a11y/motion mechanics were verified.
- dashboard/lib/chat/__tests__ and component test suites were not executed (read-only audit); claims about tested behavior rely on reading the source, not on green runs.

#### Decision brief (workstream D)

> Adversarial verification of workstream D: 16 of 17 draft findings CONFIRMED against the cited source lines, 1 ADJUSTED (D-3 — the finding is real and in fact worse than drafted: the filter_journals directive channel is dead at all four stations, since even the 'grid listener' the draft's fix assumed exists turns out to be test-only; no production listener for DIRECTIVE_EVENT exists), 0 REFUTED. Verdict unchanged in substance: the chat panel's FOUNDATIONS are unusually good — the SSE transport (dual-dialect decoder, heartbeats, firm-bound single-consumer streams), streaming markdown (Streamdown + SR sentence-flush), scroll physics, DB-backed persistence/pagination on audited fns, the fail-closed artifact gate, and the clarify live-flow are genuinely Claude-class engineering — but the EXPERIENCE fails the 'native modern assistant' bar because the layer between agent and UI is half-dead. One critical: the Documents-tab upload (the self-declared ONLY ingest path) POSTs a run that nothing ever executes (startRun registers, only an SSE attach drives streamRun — the wake path even documents this contract and drains itself), toasts success, persists a ghost user turn, and 409-wedges session reset for 15 minutes (D-1). Five highs cluster on the unfinished emission seam: half the 8-card registry unreachable with dead native artifact wire vocabulary on both ends (D-2), doctrine-instructed directives rendering as raw JSON live with no consumer (D-3), structurally broken multi-card turns with post-fence prose lost live (D-4), attachments invisible in the transcript (D-5), tool activity invisible — verb computed then rendered nowhere, curated tools mapped to the design-banned 'Working…', zero persisted tool history, blank thread through 60-150s cold starts (D-6) — plus stale-actionable rehydrated approval cards violating the catalog's own inertness law (D-7). Rebuild guidance: keep the transport/rendering/persistence spine and the artifact-gate LAW (salvage-grade); design the emission contract (agent→card/directive), attachment surfacing, tool-activity display, and durable-run visibility as first-class wire features, not fenced-text conventions — every doctrine promise of 'the runtime lifts it off the stream' is currently false. Note: the prescribed audit-brief.md and dashboard/agent maps did not exist; db-map.md plus direct code evidence (including db/v2 trigger sets and doctrine greps) was used throughout.

---

## Workstream E — Document pipeline & storage

### `E-1` · **CRITICAL** · Documents-tab uploads never execute: the upload chat turn is POSTed but nothing ever attaches its SSE stream, and interactive runs only run inside streamRun - files are silently never ingested while the UI toasts success
*Hero-prompt item: E1/E2 - upload flow end-to-end trace*

**Evidence**
- `dashboard/components/documents/DocumentsTable.tsx:238-257 - startUpload POSTs the turn via deps.send/defaultSend, ignores the returned run_id, clears the pending row and toasts 'Clara is filing them'`
- `dashboard/components/documents/DocumentsTable.tsx:471-482 - defaultSend only POSTs ${NEXT_PUBLIC_AGENT_URL}/firms/:id/chat and parses JSON; no GET /chat/events follows`
- `dashboard/components/workbench/WorkspaceIslands.tsx:142-154 - the production mount passes NO deps, so defaultSend (the bare POST) is the live path`
- `agent/src/http/server.ts:340-371 - POST /firms/:id/chat persists the user turn (appendUser :357) and calls runtime.startRun, returning { run_id } only`
- `agent/src/runtime/openai/runtime.ts:175-206 - startRun merely registers an in-memory RunRecord; the model loop (run(agent, ...) at :233/:254) lives ONLY inside streamRun (:208-279), consumed solely by GET /firms/:id/chat/events (server.ts:433-449), GET /bootstrap/chat/events (server.ts:259-274), and the wake drain (drainWake :445-468); pollRun (:324-336) reads state without executing`
- `Repo-wide trace of /chat/events consumers: dashboard/lib/chat/makeHermesRunner.ts:75 streams only the run its own hermesChatTransport.sendMessages just started (hermesChatTransport.ts:232-244; reconnectToStream returns null, :263-265), and dashboard/lib/useOnboardingRun.ts streams only runs it started (:210, :231); the chat_threads.active_run_id dialect is retired dead code (dashboard/lib/chatThreads.ts is imported only by its own test) - nothing attaches a run by session pointer`
- `agent/src/http/server.ts:410-431 - the reset guard explicitly ages out 'a never-streamed running run' ('the client died between POST /chat and the SSE attach'), confirming no server-side execution fallback exists`
- `agent/src/runtime/openai/runtime.ts:40,484-495 - the never-streamed run (not streaming, no pending clarify) is evicted after DEFAULT_RUNNING_RUN_TTL_MS = 30 min, taking the base64 attachments with it`

**What is wrong / missing** — The documents workbench drop-zone/picker - the primary bulk-ingest surface - produces a run that never executes: no upload_document, no OCR, no ingest_document, no documents row, ever. The user sees a success toast and an SSE-refreshing list that never shows the file; the transcript shows the turn (appendUser committed it) so Clara appears to have ignored it. The attachments are unrecoverable after run eviction; re-uploading via the same tab hits the same bug. Only the Clara rail composer path (which streams the run it starts) actually works.

**What the rebuild must do** — dashboard/components/documents/DocumentsTable.tsx + agent/src/http/server.ts

### `E-2` · **HIGH** · Persist-after-OCR is doctrine-mandated, not structural: attachments are process-local in-memory state (evicted on TTL/restart/OOM), persistence happens only if the LLM calls upload_document->ingest_document, and any run failure before that point loses the whole batch
*Hero-prompt item: E2 - persist-after-OCR guarantee*

**Evidence**
- `belcort/doc-ingest/SKILL.md:56-60 - the ordered flow (upload bytes FIRST -> dedup -> OCR -> ingest_document) and :83-90/:102-113 - unassignable docs must be ingested with client_id=NULL/status=unassigned_pending BEFORE the client picker; this is a prompt-level mandate on the model, with zero code enforcement`
- `agent/src/runtime/openai/runtime.ts:80-99,136 - runs (incl. the b64 attachments in context.documents and parked clarify resolvers) live in a plain Map on one process; :39-42 TTLs (running 30min, settled 10min) and deploy/fly.toml:8-15 (single always-on machine, 'in-memory run state ... split-brain otherwise') mean restart/deploy/crash loses every in-flight batch and pending clarify`
- `dashboard/lib/attachments.ts:141-148 + agent/src/http/server.ts:355-357 - chat_messages persists ONLY the text turn ('chat_messages persists no attachment metadata') - the bytes exist nowhere durable until the model calls upload_document`
- `agent/src/tools/buildTools.ts:270-276 and :329-337 - upload_document/extract_document read documents only from the CURRENT run context by index; a later run seeing 'Uploaded 2 documents...' in history gets UploadRejected ('not an attachment of this turn') - lost batches cannot be recovered from the transcript`
- `agent/src/runtime/openai/runtime.ts:39 - MAX_TURNS=40 hard-fails a long mixed batch mid-run ('Max turns exceeded'); each ingest_document commits independently, so processed docs persist but the rest of the batch is stranded with no retry/resume`
- `db/v2/22-fns-documents-recon.sql:186-236 - when the flow IS followed, the guarantee holds: ingest_document accepts client_id NULL (firm from JWT), stores sha256, storage_path, ocr_cache, source_filename, and is idempotent on (firm, sha256) with OCR fill-forward, never silently reassigning`

**What is wrong / missing** — The answer to 'does EVERY document persist immediately after OCR even when unassignable?' is NO as a guarantee: the DB/storage substrate supports it perfectly (unassigned holding area, idempotent ingest, write-once bytes), but the only executor of the persist chain is the model following SKILL.md inside a volatile in-memory run. Mid-conversation client-match failure is survivable only if the model already ran upload_document+ingest_document (the doctrine's ordered flow); a run abort, clarify abandonment, JWT expiry, process restart, Stop, or E-1's never-executed run loses bytes+OCR entirely and requires re-upload.

**What the rebuild must do** — agent/src/runtime/openai/runtime.ts + belcort/doc-ingest/SKILL.md

### `E-3` · **HIGH** · The agent has no storage read/copy/move/delete capability, so the doctrine-mandated 'Storage move' after assign/reassign is structurally impossible in the wake lane - assigned documents' bytes stay under _unassigned/ indefinitely, and the doctrine's 'verify the object serves / sign-HEAD it' instructions name capabilities that do not exist
*Hero-prompt item: E3 - storage doctrine consistency (the Storage move)*

**Evidence**
- `agent/src/tools/* (exhaustive: full tool-name inventory + a grep for download/createSignedUrl/.remove/.move/.copy/.list/storage.from across agent/src) - the runtime's ONLY storage capability is the storeBytes upload closure (main.ts:113-122, upsert:false); there is no download, copy, move, delete, sign, or HEAD tool anywhere in the tool surface`
- `db/v2/storage-setup.sql:27-38,43-59 - NO UPDATE and NO DELETE policies, so no authenticated caller (dashboard included) can relocate an object, only add a second copy; the service-role client bypasses RLS but no move/copy/delete call is wired anywhere in agent/src, so no actor in the system can relocate bytes`
- `belcort/review-queue/SKILL.md:285-289 - 'THE WAKE CARVE-OUT: a wake run has NO turn attachments and no byte-download tool - the bytes are unobtainable, so the move DEFERS honestly ... file ONE record_proactive_notification flagging the pending Storage move'`
- `belcort/review-queue/SKILL.md:286-287 and :330-331 - the same skill still instructs 'verify the object still serves at the OLD storage_path' and 'Verify the object EXISTS at storage_path (the runtime can sign/HEAD it)' - no tool can do either; the instruction is unexecutable doctrine drift`
- `dashboard/components/documents/FirmDocumentsTriage.tsx:102-121 + db/v2/22-fns-documents-recon.sql:26-53 - the dashboard assign path sets client_id/status only ('storage_path deliberately NOT changed here - the agent owns the Storage move'), then relies on the [documents] wake, which cannot move bytes`
- `agent/src/main.ts:182-184,236 + agent/src/http/server.ts:204,229 - wake ingress is best-effort (6 wake windows/firm-minute, drops on shutdown, at-most-once), so even the deferral notification can silently never happen`

**What is wrong / missing** — The canonical taxonomy (firms/{firm}/clients/{slug}/raw/ingested/{year}/{sha}.{ext}) is aspirational for every dashboard-assigned document: bytes permanently remain at firms/{firm}/_unassigned/{sha}.{ext}. Row-level consistency survives ONLY because the carve-out tells the model not to call set_document_storage_path without bytes - a prompt-level guard; a model that follows the older doc-ingest SKILL.md wording ('move the bytes to the assigned key via set_document_storage_path', SKILL.md:109-113) would repoint the DB path at a key with no object and break 'open original' (set_document_storage_path validates grammar, not object existence - 22-fns:332-382).

**What the rebuild must do** — agent/src/tools/buildTools.ts + belcort/review-queue/SKILL.md + db/v2/22-fns-documents-recon.sql

### `E-4` · **MEDIUM** · ingest_document performs no key-grammar validation (only the table CHECK's firm prefix), while the Storage CREED claims all writers reject keys outside the asserted client's slug - a document can be created pointing at another client's folder, a wrong-sha key, or any invented firm-scoped layout
*Hero-prompt item: E3 - storage key validation at creation*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:223-232 - ingest_document inserts p->>'storage_path' verbatim; the only structural guard is the documents table CHECK (db/v2/10-tables-core.sql:96-98: 'firms/{firm_id}/%' + no '..')`
- `belcort/AGENTS.md:94 (paragraph 20, Storage CREED) - claims ingest_document/set_document_storage_path/record_export_artifact 'all reject any key outside my own firm + the asserted client's slug' - true only for the latter two`
- `agent/src/tools/buildTools.ts:210-225 - assertFirmScopedKey (the upload gate) checks only firm prefix + seg[2] in {clients,_unassigned}; no slug ownership, folder whitelist, or sha-suffix check - bytes ARE uploadable under another client's slug`
- `db/v2/22-fns-documents-recon.sql:352-375 - set_document_storage_path is the ONLY place slug/folder/sha are enforced, and it only runs on a later move`

**What is wrong / missing** — At creation time a client-A document can legally carry storage_path under client B's slug (bytes uploadable there via upload_document too), or a path whose sha segment does not match documents.sha256, silently breaking the sha256<->bytes provenance bond and the per-client folder story the CREED promises. Firm isolation holds; within-firm registry/object taxonomy consistency does not.

**What the rebuild must do** — db/v2/22-fns-documents-recon.sql (ingest_document)

### `E-5` · **MEDIUM** · A reachable 'invisible document' state: ingest_document accepts caller-supplied status, so client_id=NULL + status='ingested' (or 'coded') creates a row that appears in NO UI surface and can never be assigned
*Hero-prompt item: E2/E3 - unassigned lane completeness*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:190 - v_status := coalesce(nullif(p->>'status',''),'unassigned_pending') with no cross-check that a NULL client_id forces unassigned_pending`
- `dashboard/lib/documentActions.ts:92-99 - the unassigned lane reads status=eq.unassigned_pending AND client_id=is.null; :82-89 - client tabs read client_id=eq.N: a NULL-client 'ingested' row matches neither`
- `db/v2/22-fns-documents-recon.sql:50 - assign_document raises document_not_unassigned for any status other than unassigned_pending, and :87 - reassign_document raises document_not_assigned on a NULL client, so the row is permanently stuck outside every workflow verb`

**What is wrong / missing** — One model slip (doctrine says status 'ingested' when a client is assigned - doc-ingest SKILL.md:60 - but nothing enforces the pairing) permanently hides a persisted source document from the triage funnel, every client tab, and all triage verbs; it is findable only via raw query_books/SQL.

**What the rebuild must do** — db/v2/22-fns-documents-recon.sql (ingest_document) + dashboard/lib/documentActions.ts

### `E-6` · **MEDIUM** · Stored documents are referenceable but not re-readable: no tool can OCR or read a persisted storage object (extract_document is turn-attachments-only) and ocr_cache is effectively write-once (fill-forward only when NULL) - a thin or failed first OCR leaves the content permanently opaque to Clara without a human re-upload
*Hero-prompt item: E1/E2 - later referenceability without re-upload*

**Evidence**
- `agent/src/tools/buildTools.ts:329-337 - extract_document resolves document_ref against ctx.documents (this turn's attachments) only; there is no OCR-from-storage or storage-read tool`
- `db/v2/22-fns-documents-recon.sql:213-218 - ingest_document sets ocr_cache = coalesce(ocr_cache, p->'ocr_cache'): an existing non-null value is never replaced; a repo grep confirms ingest_document is the ONLY writer of ocr_cache in db/v2`
- `belcort/_shared/ocr-cache-schema.md:14-24 - the live producer already writes a flatter, sometimes preview-only record than the belcort_ocr_cache.v1 envelope ('Produced reality ... verified on firm 21'); doc-ingest/SKILL.md:241 admits preview-only caches are 'incomplete'`
- `agent/src/main.ts:128-131 - with AZURE_DOCAI_* unset the runtime honestly ingests without OCR; those docs' ocr_cache stays NULL and can only be filled by re-uploading the same bytes in a new turn (the sha-idempotent fill-forward path, 22-fns:205-221)`

**What is wrong / missing** — 'Uploaded once, referenceable forever' holds for the row and the bytes (durable, signed-URL viewable, assignable later), but NOT for the content: Clara's only future access to a document is whatever one-shot ocr_cache landed at ingest. A wrong/thin cache cannot be corrected (coalesce keeps the old value even on re-ingest with better OCR), and the human 'open original + re-attach' loop is the only repair path.

**What the rebuild must do** — agent/src/tools/buildTools.ts (extract_document) + db/v2/22-fns-documents-recon.sql

### `E-7` · **MEDIUM** · Capacity ceiling: the 150MB JSON body cap is fully buffered and parsed in memory on a single shared-cpu-1x/1GB Fly machine that also holds all run state - a couple of concurrent max-size uploads can OOM the process and destroy every in-flight run, clarify, and attachment batch
*Hero-prompt item: E1 - hard ceilings (body caps, VM, buffering)*

**Evidence**
- `agent/src/http/server.ts:67,69-91 - MAX_BODY_BYTES = 150MB; readJson accumulates all chunks then Buffer.concat().toString() + JSON.parse (chunks, the concatenated string, and the parsed object concurrently resident); agent/test/bodyLimit.test.ts pins 150MB to the 5x20MB attachment cap`
- `deploy/fly.toml:52-54 - [[vm]] size shared-cpu-1x, memory 1gb; :8-15 - deliberately ONE machine because run state is in-memory (split-brain otherwise)`
- `agent/src/runtime/openai/runtime.ts:40-41,196-204 - each RunRecord retains the full b64 documents for up to 30 min running / 10 min settled`
- `agent/src/http/server.ts:343-345 and :493-495 - stale comments still describe a '32MiB body limit', evidence the cap was raised without revisiting the memory budget`

**What is wrong / missing** — A by-the-caps-legal workload (two users each sending 5x20MB) transiently needs several hundred MB just for body buffering plus retained run contexts, on a 1GB VM. An OOM kill is a total-loss event for every unpersisted document batch and parked clarify in the process (see E-2).

**What the rebuild must do** — agent/src/http/server.ts + deploy/fly.toml

### `E-8` · **MEDIUM** · Azure DI adapter: the 429-throttle branch skips the poll deadline check, making the OCR poll loop unbounded under sustained throttling, and interactive runs have no overall deadline to catch it
*Hero-prompt item: E1 - OCR engine limits and timeouts*

**Evidence**
- `agent/src/ocr/azureDocai.ts:91-111 - loop order is sleep -> fetch -> `if (res.status === 429) continue;` (:94) -> ... -> deadline check LAST (:109); the 429 path never reaches the deadline check despite the comment 'keep waiting within the deadline' - the loop only times out on the first non-429 poll after the deadline, so 100% sustained 429s pin it forever`
- `agent/src/ocr/azureDocai.ts:19-20 - POLL_INTERVAL_MS=1500, POLL_TIMEOUT_MS=120000 are the only OCR bounds in the repo; the poll fetch itself carries no AbortSignal/timeout either`
- `agent/src/runtime/openai/runtime.ts:42,497-507 - wake runs get a 90s drain deadline (DEFAULT_WAKE_DRAIN_TIMEOUT_MS) but interactive streamRun has no per-run or per-tool timeout`
- `agent/src/runtime/openai/runtime.ts:484-495 - evictRuns skips records with streaming=true, so a stream-attached run hung inside extract_document is NEVER evicted; the run record and its attachment batch leak until process restart (only the scope's reset guard, server.ts:410-431, unwedges the UI after 15 min)`
- `deploy/RUNTIME.md:43 - the resource is S0 (Standard) tier; no Azure-side file-size/page/TPS limits are recorded anywhere in the repo`

**What is wrong / missing** — A throttled Azure resource (S0 TPS pressure from a multi-doc batch polling every 1.5s per doc) can pin an extract_document call indefinitely; the user's stream hangs with no timeout. For a stream-attached run the record is never evicted (streaming=true exempts it from the TTL sweep), so the hang and its held batch persist until a deploy/restart - which then loses the batch per E-2; the user can only reset the scope after the 15-minute guard.

**What the rebuild must do** — agent/src/ocr/azureDocai.ts

### `E-9` · **MEDIUM** · Client matching is entirely model-driven and client_match_conf is a model-fabricated number rendered as 'Evidence' in the triage UI; the <0.95 never-guess gate is prompt-only, and on the firm-scope thread the write-gate allows ingest to any within-firm client
*Hero-prompt item: E1 - client matching*

**Evidence**
- `belcort/doc-ingest/SKILL.md:70-99 (Step 2) - inference = the model querying client_bank_accounts/client_email_domains/client_aliases via query_books; no deterministic matcher exists in agent/src or db/v2`
- `db/v2/22-fns-documents-recon.sql:229-230 - ingest_document stores (p->>'client_match_conf')::numeric verbatim; dashboard/components/documents/FirmDocumentsTriage.tsx:289,318-320 renders it as the 'Evidence' percent (Clara's stored figure rendered verbatim)`
- `agent/src/tools/buildTools.ts:71-77 + agent/src/tools/registry/documents.ts:80 - ingest_document is scopeRule 'firm_or_client': on a client thread the target must equal the scope, but on the FIRM thread (scope null) ANY client_id passes with only the DB firm check - a misidentification files to the wrong client within the firm`
- `belcort/AGENTS.md:35-43 (paragraph 3) - the 0.95 protocol is doctrine text, enforced nowhere in code or SQL`

**What is wrong / missing** — The firm-killing-mistake defence for document filing rests on prompt compliance plus a human reading a model-invented confidence number labelled 'Evidence'. Within-firm cross-client filing via the firm thread is one hallucinated match away; only the audited reassign verb repairs it after the fact.

**What the rebuild must do** — belcort/doc-ingest/SKILL.md + agent/src/tools/buildTools.ts (enforceScope)

### `E-10` · **LOW** · Batch mechanics: 5 files x 20MB per turn, whole-batch validation rejection (first failure wins), no upload retry anywhere (the Documents-tab 'retry' affordance is actually Dismiss-only), and MAX_TURNS=40 can abort a large mixed batch mid-flight leaving partial ingest with no resume
*Hero-prompt item: E1 - batch limits, partial failure, retries*

**Evidence**
- `dashboard/lib/attachments.ts:7-11,50-63 - MAX_DOCS_PER_TURN=5, MAX_DOC_BYTES=20MB, validateFiles returns first failure for the whole set (nothing is dropped or partially sent); ClaraComposer.tsx:125-143 applies the caps cumulatively across pick/drop/paste batches`
- `agent/src/http/documents.ts:7-8,45-63 - the service mirror (MAX_DOCS=5, 20MB decoded, MIME allowlist) rejects the whole turn with DocumentRejected -> HTTP 400`
- `dashboard/components/documents/DocumentsTable.tsx:253-256,270,364-373 - a POST failure marks ALL transient rows failed; retryUpload(key) only removes the row (button copy 'Dismiss'); docStatus.ts:36-38 still documents the state as '(retry)'`
- `agent/src/runtime/openai/runtime.ts:32-39 - MAX_TURNS=40; a 5-doc mixed batch (upload+extract+ingest+assign+bank-lines+coding per doc, plus read_skill/query_books dedup checks) can exhaust it; the run fails, committed ingests survive, the rest need re-upload (idempotent ingest makes the re-send safe)`

**What is wrong / missing** — Bulk month-end intake (dozens of documents) must be hand-chunked into 5-file turns with no queueing, no automatic retry, and a hard model-loop budget that can strand the tail of a batch; the only safety net is sha-idempotency on re-upload.

**What the rebuild must do** — dashboard/lib/attachments.ts + agent/src/runtime/openai/runtime.ts

### `E-11` · **LOW** · Edge-path gaps: the pre-firm bootstrap chat and bootstrap clarify routes silently drop attached documents (no documents field is read), and the rail composer refuses attachments on a clarify answer only by silently holding them
*Hero-prompt item: E1 - upload ingress edge paths*

**Evidence**
- `agent/src/http/server.ts:247-257 - POST /bootstrap/chat reads only body.message; startRun is called without documents; :276-285 - POST /bootstrap/chat/clarify likewise never calls validateDocuments (the firm-scoped clarify route does, :453-464)`
- `dashboard/lib/useOnboardingRun.ts:24-26,50-51,238-264 - answerWithDocs POSTs a documents array to ${base}/clarify (and sendWithDocs to ${base}), where base is /bootstrap/chat in bootstrap mode - those bytes are silently discarded by the server`
- `dashboard/components/clara/ClaraComposer.tsx:150-157,177 - in answer-mode held files are deliberately kept, not sent ('attachments only ride a new turn') and canAttach is false, a quiet UX trap flagged only in a code comment`

**What is wrong / missing** — A user who attaches a file during the firm-bootstrap interview (e.g. an SSM form) gets no error and no ingestion; the model is told nothing was attached. Low blast radius (pre-firm flows rarely need files) but a silent-drop contract violation.

**What the rebuild must do** — agent/src/http/server.ts (bootstrap routes)

### `E-12` · **LOW** · The [documents] wake chain (human assign/reassign -> trg_pn_doc_triage -> webhook -> wakeGate -> model run) is best-effort and lossy at four points, so the post-triage reconcile/flag work can silently never happen
*Hero-prompt item: E3 - wake ingress durability for the document lifecycle*

**Evidence**
- `agent/src/http/server.ts:204 - wakesEnabled=false answers dispatched:false without queueing; :229 - rate_limited wakes are dropped with a 202`
- `agent/src/main.ts:182-184 - wakeGate: 15s window, max 6 wake windows/firm-minute (wakeGate.ts:21-25 - maxBatch default 30 records/batch); main.ts:236 - shutdown clearPending() drops unfired hints (at-most-once by design, wakeGate.ts:51-53)`
- `agent/src/http/wakes.ts:15-17,30-40 - only document_triaged maps to the may-act documents lane; new_document (an unassigned arrival) is deliberately speak-only proactive`
- `agent/src/runtime/openai/runtime.ts:338-378,445-468 - a wake run is a fire-and-forget throwaway with a 90s drain deadline (:42); its failure is only a log line`

**What is wrong / missing** — Assign in the UI succeeds atomically (row + audit + trigger - db/v2/25-fns-ops.sql:1526-1529, human-actor fenced), but the second half - Clara verifying the assignment, flagging the pending storage move, or acting on the code verb - evaporates whenever the webhook, rate gate, credential, or 90s deadline drops it. The DB row stays consistent; the promised agent follow-through is best-effort with no dead-letter surface.

**What the rebuild must do** — agent/src/http/wakes.ts + agent/src/main.ts

### `E-13` · **LOW** · unique(firm_id, sha256) makes byte-identical documents un-representable for two different clients in one firm; ingest returns the other client's existing row as 'idempotent'
*Hero-prompt item: E2 - dedup edge*

**Evidence**
- `db/v2/10-tables-core.sql:98 - unique (firm_id, sha256)`
- `db/v2/22-fns-documents-recon.sql:205-221 - the idempotent path returns the existing row (with ITS client_id) and never reassigns; belcort/doc-ingest/SKILL.md:58,66 treats any same-sha row as a true duplicate to skip`

**What is wrong / missing** — A genuinely shared source file (one supplier statement covering two sibling clients, a shared rental invoice) cannot be filed to both clients; the second ingest silently resolves to the first client's document. Rare, but the model is doctrine-bound to call it a duplicate rather than surface the cross-client tension.

**What the rebuild must do** — db/v2/10-tables-core.sql (documents unique constraint)

#### Verified as sound (workstream E)

- Upload ingress caps are real, mirrored at three layers, and pinned by tests: 5 documents/turn, 20MB decoded each, MIME allowlist (PDF, PNG/JPEG/JPG/WebP/TIFF/HEIC, XML), 32,768-char message cap, 150MB body ceiling sized to fit the attachment cap as base64  ·  _evidence:_ `dashboard/lib/attachments.ts:7-11,20-36 (picker mirror + .xml extension fallback normalized to application/xml at the wire, :95-100); agent/src/http/documents.ts:7-21,45-63 (service gate); agent/src/http/server.ts:67 (MAX_BODY_BYTES=150MB) + agent/test/bodyLimit.test.ts (pins body cap to MAX_DOCS x MAX_DECODED_BYTES x 4/3 with headroom); server.ts:345 + attachments.ts:9-11 (32,768-char message cap enforced both sides)`
- All three attach paths exist in the rail composer - paperclip picker, drag-drop, paste - through one cumulative-cap pipeline; the Documents tab adds a drop-zone + picker with an accept filter  ·  _evidence:_ `dashboard/components/clara/ClaraComposer.tsx:125-143 (addFiles cumulative validation), :171-184 (onPaste/onDrop), fileInputRef picker (reset at :159); dashboard/components/documents/DocumentsTable.tsx:259-269,295-340 (picker accept=ALLOWED_TYPES+.xml, drop-zone, bookkeeper+ gating)`
- The storage substrate is sound: one private firm-docs bucket; RLS SELECT/INSERT gated on the firms/{current_firm_id}/ prefix; NO UPDATE policy (write-once, protecting the sha256<->bytes bond); NO DELETE policy (reverse-not-delete + 7-yr LHDN retention); the service-role client is contained to a single upload closure guarded by assertFirmScopedKey  ·  _evidence:_ `db/v2/storage-setup.sql:15-59; agent/src/main.ts:108-122 (storeBytes closure, upsert:false); agent/src/tools/buildTools.ts:210-225 (firm-prefix + taxonomy-root guard), :292-304 (already-exists treated as durable write-once success); db/v2/10-tables-core.sql:88-98 (retain_until 7yr, legal_hold, firm-scoped path CHECK)`
- The documents registry supports the unassigned lifecycle structurally: client_id nullable (holding area), firm_id NOT NULL, unique(firm_id,sha256) dedupe, status lifecycle unassigned_pending->ingested->coded, and ingest_document is idempotent with OCR fill-forward and an explicit never-silently-reassign rule  ·  _evidence:_ `db/v2/10-tables-core.sql:64-107; db/v2/22-fns-documents-recon.sql:186-236; db/v2/tests/documents_ingest_idempotency_test.sql (exists in the rig); db/v2/90-isolation-tests.sql:160-166 (cross-firm BLC02 asserted on ingest/assign/reassign/sample/request-coding/set_document_storage_path)`
- An 'Unassigned' lane exists in the UI: the firm-level Documents page is a triage funnel (status=unassigned_pending, client_id IS NULL, oldest-first) with per-row assign, Assign-all (loop of audited singles with named partial failures), an onboard escape hatch, read-only viewer mode, model-confidence rendered as evidence, and SSE-driven silent refresh  ·  _evidence:_ `dashboard/components/documents/FirmDocumentsTriage.tsx:99-153,285-357; dashboard/lib/documentActions.ts:92-99 (readUnassigned, uploaded_at.asc); dashboard/app/(dash)/firms/[slug]/documents/page.tsx:13,38 (route exists and mounts FirmDocumentsTriage)`
- Human triage verbs are DB-audited and atomic with the agent notification: assign/reassign/mark-sample/request-coding are SECURITY DEFINER fns with bookkeeper+ floor, actor constrained to verified identity, document_audit rows, and the document_triaged wake fires from the same transaction (no dispatch flag / retry state)  ·  _evidence:_ `db/v2/22-fns-documents-recon.sql:30-174; dashboard/lib/documentActions.ts:127-149; db/v2/25-fns-ops.sql:1526-1529 (trg_pn_doc_triage AFTER INSERT on document_audit, WHEN actor is distinct from 'agent')`
- set_document_storage_path (the move-time writer) enforces the full key grammar: caller's own firm prefix, _unassigned or the asserted client's OWN slug, folder whitelist (ingested|sampleinvoices), no '..', and the key must end in THIS document's sha256 + extension  ·  _evidence:_ `db/v2/22-fns-documents-recon.sql:332-382`
- Exports ARE auditable, referenceable artifacts, not loose files: build_export/build_analysis_report file through record_export (receipt) -> record_export_artifact (write-once versioned row, server-derived firm-scoped key, reserve-then-upload with unique-violation retry x3 and a belt-and-braces firm-prefix assert) -> storeBytes; the FilesShelf UI folds versions per (fy, content_kind, scope) with superseded history visible read-only; 7-yr retention + legal_hold on export_artifacts  ·  _evidence:_ `agent/src/tools/exportTool.ts:145-220; dashboard/lib/filesShelf.ts:1-60 + dashboard/components/files/FilesShelf.tsx; db/v2/14-tables-ops.sql:148-188 (unique(firm_id,object_key) + composite version unique, retain_until 7yr, key-shape CHECK)`
- Progress/status surfacing exists at the granularity built: transient uploading/failed rows are component state (never a fake doc status); tool start/complete events stream over SSE (the rail shows Clara's tool activity); an OCR-pending accent is inferred (ingested + zero resolved OCR parts); document lists silently live-refresh off the books SSE nudge; source bytes open via 600s signed URLs minted on click, never listed or cached  ·  _evidence:_ `dashboard/components/documents/docStatus.ts:25-47; agent/src/runtime/openai/events.ts:52-63; dashboard/components/documents/DocumentsTable.tsx:193-222,348-378; dashboard/lib/documentActions.ts:113-125 (getFileUrl, signBooksUrl 600s)`
- Deduplication is layered and safe to retry: sha256 computed by the tool layer (never model-fabricated), storage write-once with already-exists reported as flagged success, DB idempotency on (firm, sha256), and doctrine dedup-on-sha before ingest  ·  _evidence:_ `agent/src/tools/buildTools.ts:288-304; db/v2/22-fns-documents-recon.sql:205-221; belcort/doc-ingest/SKILL.md:57-58,64-66`
- OCR is deterministic and injection-fenced: Azure Document Intelligence v4.0 prebuilt-layout via REST (no SDK), key never model-visible, text+tables returned as inert data with an explicit notice; a no-OCR deploy reports itself honestly instead of letting the model fabricate; MyInvois UBL XML is explicitly NOT parsed in this runtime (stored + routed to review per the Track-C carve-out)  ·  _evidence:_ `agent/src/ocr/azureDocai.ts:1-27,73-113; agent/src/tools/buildTools.ts:316-353 (extract_document + inert-data notice, honest no-op when unconfigured); agent/src/main.ts:124-131; belcort/doc-ingest/SKILL.md:116-126 (UBL not-wired warning); deploy/RUNTIME.md:36-43 (env manifest + S0 tier)`
- In-interview uploads ride the clarify channel on firm-scoped routes: POST /firms/:id/chat/clarify accepts a documents array, the runtime attaches them to the parked run's context and appends a layer-computed attachment manifest (indices + sha256s) to the sanitized answer  ·  _evidence:_ `agent/src/http/server.ts:451-464; agent/src/runtime/openai/runtime.ts:44-58,301-322`

#### Unverified (workstream E) — could not be confirmed from frozen evidence; carried as open

- The audit brief does not exist: the task's paths were literal 'undefined/...' and undefined/audit-brief.md is absent (verified again this pass; only undefined/maps/db-map.md and prior findings JSONs exist under undefined/). A standard critical/high/medium/low ladder was applied; every citation was re-verified from the source files, not the maps.
- Azure Document Intelligence S0 service-side hard limits (max file size, max pages, TPS/concurrency quotas) are not recorded anywhere in the repo; deploy/RUNTIME.md:43 names the tier only. The real OCR ceiling per document is therefore unverifiable from repo evidence (only the client-side 120s poll deadline and 20MB attachment cap are code facts).
- Whether a dropped SSE connection mid-run stalls the server-side model loop: server.ts passes an AbortSignal that streamRun accepts but never consumes, and generator-pull semantics under a destroyed response socket could not be proven either way by code reading alone (no runtime execution was performed against the frozen repo). E-1's never-attached case is code-certain; the mid-run-drop case is not.
- Supabase project-level storage limits (max object size for the service-role upload; whether a 20MB upload can be rejected platform-side) - project configuration, not in the repo.
- Live behavior of the [documents] wake end-to-end (webhook config rows, WEBHOOK_SECRET/SUPABASE_JWT_SECRET presence on the live Fly deployment) - deploy/RUNTIME.md documents intent; live secrets/config were not inspected.
- E-1 was re-verified this pass by independent exhaustive static tracing (all streamRun/(bootstrap)/chat/events consumers located; startRun/streamRun split confirmed; WorkspaceIslands.tsx:142-154 passes no deps so the bare-POST defaultSend is the live path; chatThreads.ts active_run pointer is consumer-less dead code; hermesChatTransport.reconnectToStream returns null), but not by driving the live dashboard - a runtime repro would make it incontrovertible.
- The model's actual compliance with the doc-ingest persist-before-picker ordering and the review-queue wake carve-out (prompt-level guarantees) is inherently unverifiable statically; findings E-2/E-3 rate the structural exposure, not observed misbehavior.

#### Decision brief (workstream E)

> Workstream E verdict (adversarially verified: 12 findings CONFIRMED, 1 ADJUSTED, 0 refuted; all 12 fine claims spot-verified against source): the substrate is genuinely good - a private write-once firm-prefixed bucket, a firm-scoped documents registry with a real unassigned holding area, idempotent sha-keyed ingest, audited triage verbs with atomic wake triggers, a real UI unassigned lane, and exports filed as versioned write-once artifacts with a shelf UI. But the pipeline ABOVE the substrate is not a pipeline: it is one LLM run following a skill document, holding the only copy of the bytes in process memory. Three structural breaks dominate. (1) CRITICAL E-1: the Documents-tab upload (the primary bulk-ingest surface) POSTs a chat turn whose run is never streamed, and runs only execute inside streamRun - so those files are never uploaded, OCR'd, or ingested, while the UI toasts success; only the chat-rail path works. (2) E-2: persist-after-OCR is doctrine, not architecture - attachments live in an in-memory run map on one Fly machine (30-min TTL, 1GB RAM vs a 150MB fully-buffered body cap), so run failure, restart, eviction, clarify abandonment, or OOM loses whole batches unrecoverably; nothing durable exists until the model volunteers upload_document+ingest_document. (3) E-3: the agent has no storage read/copy/move capability, so the mandated post-assign 'Storage move' is impossible in the wake lane - assigned docs' bytes live under _unassigned forever, and doctrine still cites verification capabilities (sign/HEAD) that do not exist. Registry-level consistency mostly holds (path never repointed without bytes IF the model obeys the carve-out), but ingest-time key validation is far weaker than the CREED claims (E-4), an invisible stuck document state is one model slip away (E-5), and stored documents can never be re-read or re-OCR'd by Clara (E-6). For the rebuild: keep the DB/storage layer nearly verbatim; replace the model-discretionary ingest chain with a durable, deterministic server-side pipeline (persist bytes + row BEFORE any model involvement), give the runtime a scoped storage read/move capability or drop the move doctrine, and fix the run-execution model so a POSTed turn always executes.

---

## Workstream F — Accounting engine — year-end & tax coverage

### `F12-1` · **CRITICAL** · Every post-close continuity read outside GL/FS is segmentation-blind: bank reconciliation, AR/AP control tie-outs, and FA control tie-out double-count the close's opening restatement entry
*Hero-prompt item: F1*

**Evidence**
- `db/v2/25-fns-ops.sql:658-704 — the close's opening entry re-posts EVERY real account's post-closing balance dated period_end+1; original entries remain, so any all-time GL sum thereafter counts real balances twice (compounding once per close)`
- `db/v2/22-fns-documents-recon.sql:711-718 — close_reconciliation book balance = Σ(dr−cr) on the bank account for ALL posted entries ≤ period_end, no entry_kind exclusion, no segment floor`
- `db/v2/22-fns-documents-recon.sql:723-735 — the outstanding computation counts the opening entry's bank leg (never matchable to a statement line, so never reconciled=true) as a phantom 'deposit in transit' when it falls in the recon window; verified arithmetic: in the FIRST post-close recon the phantom DIT exactly cancels the doubled book balance so diff can hit 0 (a spuriously 'completed' recon with a full-balance phantom DIT in the working figures); from the SECOND post-close reconciliation onward (opening entry outside the window) the difference is permanently off by the full restated balance — the recon can never complete`
- `db/v2/23-fns-subledger.sql:551-557 — _tie_out_core control_balance is an all-time posted sum on the DC/CC control account with no kind filter/floor, while subledger_net (23:564-575) has no opening-entry twin → ar/ap_control_tie_out reads permanently untied (difference = full carried control balance) after the first close`
- `db/v2/23b-fns-fixed-assets.sql:432-443 — fa_control_tie_out GL cost/accum are all-time posted sums with no kind filter/floor; register side (23b:450-463) anchors on acquisition/depreciation entries only → cost and accum differences equal the full carried balances after the first close`
- `Contrast — the reads that DO handle it: db/v2/25-fns-ops.sql:50-52,69 (_trial_balance_core all-time excludes closing/opening), db/v2/28-fns-reads.sql:473-487 + 615-620 (client_general_ledger segment floor + gl_window_spans_close; client_financial_statements per-window floors)`
- `Test gap re-verified 2026-07-17: `grep -l tie_out db/v2/tests/*.sql` → fixed_assets_test.sql, subledger_test.sql; `grep -l record_year_end_close` → 7 other files; `grep -l close_reconciliation` → add_bank_account_test.sql, edit_entry_test.sql (neither runs a close). The sets are disjoint — no test ever runs a tie-out or close_reconciliation after a close`

**What is wrong / missing** — The year-end close uses an opening-restatement model (real balances re-posted into the new segment) but only client_general_ledger, client_financial_statements and the all-time TB were taught about segments. close_reconciliation, _tie_out_core and fa_control_tie_out sum the GL all-time, so from the client's SECOND financial year every bank reconciliation reports a doubled book balance and cannot reach difference=0 (and the first post-close recon can spuriously 'complete' on a phantom full-balance deposit-in-transit), and all three control tie-outs report a permanent 'drift' equal to the entire carried balance — burying any real drift they exist to surface. This silently breaks the exact continuity (subledger open items, FA register, bank recon) the close is supposed to hand into the next FY.

**What the rebuild must do** — db/v2/22-fns-documents-recon.sql (close_reconciliation), db/v2/23-fns-subledger.sql (_tie_out_core), db/v2/23b-fns-fixed-assets.sql (fa_control_tie_out) — add the client_fy_close segment floor (or exclude entry_kind in ('closing','opening')), plus post-close rig tests

### `F12-2` · **HIGH** · Cross-FY bank matching is hard-blocked: match/unmatch of an entry dated in a closed period trips the closed-period guard (unpresented cheques / deposits-in-transit can never be cleared after close)
*Hero-prompt item: F1*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:493-495 — match_bank_line UPDATEs journal_entries (reconciled/reconciliation_id/cleared_date) on the matched entry`
- `db/v2/25-fns-ops.sql:297-322 — trg_je_closed_period fires BEFORE INSERT OR UPDATE (no column list, no WHEN clause) and raises posting_date_in_closed_period for any row with posting_date ≤ the latest live close period_end; the only exemption is entry_kind closing/opening under the close via_fns — match_bank_line has no exemption`
- `db/v2/22-fns-documents-recon.sql:549-552 — unmatch_bank_line has the same journal_entries UPDATE, so a wrong pre-close match can't be unwound either`
- `db/v2/tests/closed_period_lock_test.sql — zero mentions of match_bank_line/reconciliation (grep re-verified 2026-07-17); the interaction was never tested`
- `belcort/year-end-close/SKILL.md:46,72-82 — the g4 gate only requires reconciliations COVERING the closed period; items that clear in the NEXT FY's statements are by definition matched after the close`

**What is wrong / missing** — The textbook year-end scenario — a December-dated payment clearing on the January bank statement — cannot be reconciled once FY-December is closed: match_bank_line raises posting_date_in_closed_period. The firm's options are absurd (reverse the whole year-end close to match one cheque, or leave lines permanently unmatched). Setting recon metadata is not an accounting mutation of the period; the guard over-blocks it.

**What the rebuild must do** — db/v2/25-fns-ops.sql trg_je_closed_period (exempt recon-field-only updates, e.g. via_fn match/unmatch + no posting_date/lines change) or restructure match state off journal_entries

### `F12-3` · **HIGH** · compute_tax_draft has no entry_kind filter — run after the FY is closed it silently computes PBT=0 (the closing sweep nets every P&L account inside the window) and supersedes the live draft with a garbage worksheet
*Hero-prompt item: F2*

**Evidence**
- `db/v2/23d-fns-tax.sql:86-92 — PBT sums P&L nets over posted entries in [v_start, v_end] with status filter only; `grep -n entry_kind db/v2/23d-fns-tax.sql` returns nothing (re-verified 2026-07-17)`
- `db/v2/25-fns-ops.sql:566-601 — the closing entry is dated v_end (inside 'between v_start and v_end') and exactly negates every nominal account's net, so post-close v_pbt=0, v_dep=0 (923-000 is EP, swept), v_fines=0 (916-000 swept); v_disp (23d:114-125) is anchored on disposal entries only, so it survives — corrected from the draft's claim that it zeroes`
- `Post-close arithmetic (verified against 23d:293-299): v_adjusted = 0 + 0 + v_disp + flag add-backs — typically a small POSITIVE number, so statutory income ≈ 0, the entire CA total drafts as inflated 'unabsorbed CA', tax ≈ 0; a phantom business LOSS drafts only when deduction-direction items (disposal book gains) exceed the add-backs. Either way the worksheet is internally inconsistent (flag buckets still populated against a zero PBT) and wrong`
- `db/v2/23d-fns-tax.sql:417-419 — the fn SUPERSEDES the prior (correct) live draft when it runs ('update tax_computations set status = superseded')`
- `Contrast: db/v2/28-fns-reads.sql:627 (SoCI filters entry_kind='standard' for exactly this reason) and db/v2/23e-fns-sst.sql:193 (SST engine counts entry_kind='standard' only)`
- `db/v2/tests/tax_computation_test.sql — `grep -n "close\|entry_kind"` returns nothing: the post-close case is untested`
- `Workflow reality: Form C/CP204 work happens up to 7 months after FYE — re-drafting after the books are closed is the NORMAL sequence`

**What is wrong / missing** — A tax computation regenerated after record_year_end_close (the common professional sequence — close first, prepare tax later, or re-draft during tax-agent review) silently supersedes the live draft with garbage: PBT 0, depreciation and fines sweeps 0, flag-based buckets still populated (inconsistent), statutory income near zero with the full CA total mis-drafted as unabsorbed relief (or a phantom loss in gain-heavy years), and no assumption/confirmation warns that the FY is closed.

**What the rebuild must do** — db/v2/23d-fns-tax.sql — add entry_kind='standard' to the PBT/depreciation/916-000 window queries (mirroring 23e/SoCI), plus a closed-FY note in the worksheet

### `F12-4` · **HIGH** · The closed-period lock is one-directional: re-dating an entry OUT of a closed period passes the guard, silently draining closed-FY history that the close already swept and carried
*Hero-prompt item: F1*

**Evidence**
- `db/v2/25-fns-ops.sql:307-315 — the guard inspects only NEW.posting_date; an UPDATE moving posting_date from inside the closed period to any later date does not raise`
- `db/v2/20-fns-journal.sql:305-310 — edit_entry accepts a new posting_date on any non-rejected entry (approved→needs_review with reason; drafting/needs_review freely), agent- and dashboard-callable at the bookkeeper floor (assert_can_review, 20:284)`
- `db/v2/tests/closed_period_lock_test.sql:108-116 — the only UPDATE-path test keeps posting_date inside the period (approve_entry); the move-out direction is untested`
- `Effect chain: the moved entry's nominal effect was already swept to RE by the closing entry (25:566-601) and its real effect carried by the opening entry (25:658-704); after the move the closed FY's window no longer supports its own close, and the current segment holds the entry AND its carried effect — double count in GL/FS segment reads (28:496-517, 28:668-683)`

**What is wrong / missing** — An operator or the agent 'fixing a wrong date' on a pre-close entry (a natural response to F12-2's block, and an ordinary correction instinct) mutates a locked period without any raise: closed-FY statements no longer tie to the recorded close, and current-segment reads double-count the moved amounts. The hard lock the whole close model rests on has an unguarded exit door.

**What the rebuild must do** — db/v2/25-fns-ops.sql app.je_closed_period_guard — also reject when OLD.posting_date falls in a live closed period (UPDATE branch)

### `F12-5` · **HIGH** · Nothing blocks re-open (or re-close) out of order: reverse_year_end_close has no later-close guard, and the via_fn+kind exemption lets its entries post inside LATER closed periods, silently staling every subsequent close's carry-forward
*Hero-prompt item: F1*

**Evidence**
- `db/v2/25-fns-ops.sql:783-830 — reverse_year_end_close guards are only actor_required and no_live_close; no check that a later FY close exists`
- `db/v2/25-fns-ops.sql:302-306 — closing/opening-kind entries under via_fn record_/reverse_year_end_close are exempt from the closed-period guard, so reversing FY2023 posts mirrors dated inside FY2024/FY2025's already-closed windows; a bare RE-close of the mid-chain year also passes (its closing/opening entries are exempt) while a re-close WITH p_tax_provision_cents fails confusingly (the provision entry is kind 'standard' dated v_end, 25:474-475, and trips the guard)`
- `Verified worse: after a mid-chain reversal the CORRECTING entry the operator reversed for is itself still blocked (any FY2023 posting_date ≤ the live FY2024/25 period_end raises, 25:308-313) — the books strand in a corrupted intermediate state where FY2023 is un-closed but still locked`
- `db/v2/25-fns-ops.sql:420-434 — g2 (prior_fy_not_closed) enforces close-in-ORDER but nothing enforces reverse-in-order; later closes' opening entries (computed from v_carry_from at their close time) are never recomputed or invalidated`
- `db/v2/tests/reverse_year_end_close_test.sql:95 — proves only the single-FY reverse → re-close cycle; no multi-year out-of-order scenario`

**What is wrong / missing** — With FY2023–FY2025 all closed, any member can reverse (and even bare-re-close) FY2023 while FY2024/25 stay live. The moment FY2023 is reversed, the FY2024 close's opening entry no longer equals its segment's true prior balances — silent chain corruption with no raise, no flag, and no mechanism to mark downstream closes stale; and the correction the operator wanted to post is still blocked by the later closes' lock. Combined with the missing role floor (F12-8) this is the most consequential unguarded operation in the books.

**What the rebuild must do** — db/v2/25-fns-ops.sql reverse_year_end_close — raise later_fy_still_closed unless the reversal is the LATEST live close; record_year_end_close — refuse when any later live close exists

### `F12-8` · **HIGH** · No RBAC floor on the close family or the tax/SST engines: a viewer (rank-1) — or any credential lacking a bookkeeper+ role — can close a year, re-open it, post opening balances, seed carry-downs, and supersede tax/SST drafts
*Hero-prompt item: F1*

**Evidence**
- `db/v2/25-fns-ops.sql:376-385 (record_year_end_close) and :789-791 (reverse_year_end_close) — guard set is via_fn + assert_firm_owns_client + actor_required only; no assert_can_review/assert_can_manage_kb (the file's only two role asserts are at :1114 and :1395 — the activity-feed/notification fns)`
- `db/v2/25-fns-ops.sql:835-845 (record_opening_balances), db/v2/25b-fns-opening.sql:40-315 (all four seed_opening_* fns, assert_firm_owns_client only), db/v2/23d-fns-tax.sql:73-77 (compute_tax_draft), db/v2/23e-fns-sst.sql:148-152 (compute_sst_return) — same pattern, EXECUTE granted to authenticated`
- `db/v2/00-foundation.sql:152-160 — assert_can_review exists and gates approve/reject/edit/reverse_entry and even match/unmatch_bank_line (20-fns, 22-fns:467,529), i.e. a viewer may NOT approve a single RM50 entry or match one bank line but MAY close and re-open an entire financial year`
- `db/v2/90-isolation-tests.sql:1621-1642 TEST 20d — proves viewer denial only on the 4 re-homed bookkeeper+ surfaces (reverse_entry/update_client_profile/resolve_notification/firm_activity_feed); close/tax/SST floors untested because they don't exist`

**What is wrong / missing** — The privilege ordering is inverted: the highest-consequence mutations (year-end close, its reversal, opening balances, carry-down seeding, tax/SST draft supersession) have a LOWER effective floor than routine entry approval or bank-line matching. Firm isolation is airtight, but intra-firm a read-only viewer — or a wake-lane credential whose role never reaches bookkeeper+ — can restructure the books' period spine and supersede filing drafts.

**What the rebuild must do** — db/v2/25-fns-ops.sql, 25b-fns-opening.sql, 23d/23e — add assert_can_review (or an admin+ floor for close/reverse) consistent with the re-homed surfaces

### `F12-10` · **MEDIUM** · SST-02 and tax-computation drafting are dashboard-only: compute_sst_return / compute_tax_draft / get_sst_return / get_tax_computation are not registered agent tools and no belcort skill exists for either; the dashboard's 'Export forms' intent routes to an export scope that doesn't exist
*Hero-prompt item: F2*

**Evidence**
- `grep of agent/src/ for the four fn names (re-verified 2026-07-17) — sole match is exportTool.ts:350 reading get_sst_return inside build_export scope 'sst_return'; the registry files (documents/enums/fixedAssets/journal/kb/onboard/ops/reads.ts) register none of them`
- `belcort/ directory listing (re-verified) — skills are bank-recon, client-onboarding, coa-coding, doc-ingest, export, firm-bootstrap, kb-evolve, period-entries, review-queue, rule-edit, year-end-close; no SST-return or tax-computation skill`
- `dashboard/lib/sstReturn.ts:129-137 (computeSstReturn) and dashboard/lib/taxComp.ts:91-106 (computeTaxDraft) — the compute writes are dashboard-direct RPCs (so the capability exists, human-driven only)`
- `dashboard/lib/taxComp.ts:108-112 — buildExportFormsIntent asks Clara to 'Prepare the draft Form + tax computation worksheet … and save it as a filing', but agent/src/tools/exportTool.ts:53-62 EXPORT_SCOPES has no tax-computation scope (trial_balance/journals/documents/general_ledger/management_accounts/aging/sst_return/full only)`

**What is wrong / missing** — The product law says Clara runs the lifecycle through tax preparation, but the agent can neither draft an SST-02 nor a tax computation, has no doctrine for when/how to draft them (period-end triggers, pre-close provision sequencing), and the dashboard hands her an export request she cannot fulfil. Tax prep is a human-clicks-a-button feature, not an agent capability — and the export of the tax computation worksheet has no lane at all.

**What the rebuild must do** — agent/src/tools/registry (register the four fns), a belcort/sst-return + tax-computation skill pair, and a tax_comp export scope in agent/src/tools/exportTool.ts

### `F12-11` · **MEDIUM** · The SST return engine keys entirely on literal account codes 460-000/461-000 which carry NO special_acc_type marker — SST tagged to any other account silently vanishes from both the return and its uncounted-movement safety net
*Hero-prompt item: F2*

**Evidence**
- `db/v2/23e-fns-sst.sql:195, 249, 294-300, 370, 419, 466-467, 475, 490-498, 513-516, 530-532, 613, 621, 627 — every counting, model, candidate AND visibility query is anchored on the two literals (grep re-verified 2026-07-17); the uncounted-movement scan itself is `jl.account_code in ('460-000','461-000')` (:475, :498)`
- `db/v2/24-fns-onboard.sql:169-170 — the seed creates 460-000/461-000 with special_acc_type NULL (no marker exists for SST payable)`
- `db/v2/23-fns-subledger.sql:28-43 — the subledger/close family deliberately resolves control accounts by marker (DC/CC, and OBE at 24:179) precisely so re-keyed COAs can't break them; the SST engine diverges`
- `db/v2/20-fns-journal.sql:101-116 — draft_entry takes account codes straight from the coding payload (compute_sst_leg computes the amount only, 20:42-73); nothing forces tagged legs onto 460/461, and add_coa_account lets a firm add e.g. a second SST payable account`

**What is wrong / missing** — A client whose output-tax legs land on any account other than the two seeded literals produces a confidently-wrong (understated or NIL) SST-02 draft, and the engine's own uncounted-movement scan — its designed safety net — is blind to it too, because it scans the same two literals. Under-declaration on SST-02 is an offence (STA s.26); this is the exact failure class the marker system was built to prevent.

**What the rebuild must do** — db/v2/24-fns-onboard.sql (seed OS-style markers on 460/461) + db/v2/23e-fns-sst.sql (resolve by marker; widen the uncounted scan to any tagged sales-%/service-% leg on ANY account)

### `F12-12` · **MEDIUM** · Tax add-back detection depends on coding-time must_ask_flags with no account-based fallback for donations or entertainment: the seeded 924-000 DONATIONS account is never swept and no entertainment account exists, so unflagged items silently escape the bridge
*Hero-prompt item: F2*

**Evidence**
- `db/v2/23d-fns-tax.sql:129-160 — entertainment/donation/WHT/doubtful-debt buckets select ONLY entries where must_ask_flags && the four flag names; account-code sweeps exist only for depreciation (923-000 + register expense accounts, :97-107), 916-000 fines (:165-168), and — the one bucket with a fallback — 925-000 doubtful-debt movement, which triggers a confirmation even unflagged (:406-409). Donations and entertainment have no equivalent`
- `db/v2/24-fns-onboard.sql:233 — the master COA seeds 924-000 DONATIONS; the seed's EP list (208-241) contains no ENTERTAINMENT account at all`
- `db/v2/20-fns-journal.sql:101-108 — must_ask_flags are set only from the draft_entry payload (agent coding lane); human/dashboard-drafted or edited entries carry no flags (edit_entry never writes must_ask_flags, 20:305-317)`
- `db/v2/23d-fns-tax.sql:306-308 — the engine's own confirm text acknowledges unflagged donations for the DEDUCTION direction ('unflagged donation entries must be flagged + added back…') but nothing detects movement on 924-000 to trigger that warning`

**What is wrong / missing** — A donation posted manually to 924-000, or an entertainment expense coded without the keyword flag (any human-drafted entry, any OCR miss), is silently fully deducted in the draft chargeable income — the add-back engine under-adds-back with no candidate row and no confirmation item. The deterministic signal that DOES exist in the books (the 924-000 account) is ignored in favour of a fragile coding-time flag — even though the engine already demonstrates the account-sweep pattern for 925-000 doubtful debts.

**What the rebuild must do** — db/v2/23d-fns-tax.sql — sweep 924-000 (and a seeded entertainment account) as candidates alongside the flag buckets, mirroring the existing 925-000 confirmation; surface flagless movement on those accounts as confirmations

### `F12-13` · **MEDIUM** · No depreciation-completeness signal at close: adjustments_status covers recurring+amortisation only, and neither the DB close return nor the year-end-close skill checks that depreciation was run through period_end
*Hero-prompt item: F1*

**Evidence**
- `db/v2/23c-fns-adjustments.sql:592-678 — adjustments_status computes recurring due-occurrences and amortisation catch-up; grep for depreciation/fixed_asset in 23c returns only a comment (:17)`
- `db/v2/25-fns-ops.sql:484-490 — the close's pending_adjustments visibility is exactly adjustments_status; no FA component`
- `belcort/year-end-close/SKILL.md:37-85 (Step 0) — the mandatory gate lists entries/documents/recon/TX-provision/pending-adjustments/partners/RE; depreciation is never mentioned (only run_recurring_journals/run_amortisation at :59)`
- `db/v2/23b-fns-fixed-assets.sql:131-231 — run_depreciation's journal is dated coalesce(posting_date, period_end) (:138) as entry_kind 'standard' (:206); after the close a catch-up must be dated in the new FY (the cumulative-target model, :153-197, then lands the missing charge in the wrong year's P&L)`

**What is wrong / missing** — A firm can close an FY having never run depreciation: the close proceeds silently, the FY's profit is overstated, the tax draft's depreciation add-back and the FA-register CA basis diverge from the books, and the eventual catch-up charge lands in the next FY. Every comparable completeness condition (recurring, amortisation, TX provision, auto-posts) got a visibility surface; depreciation — the one MPERS-mandatory period charge the system itself generates — got none.

**What the rebuild must do** — db/v2/23c-fns-adjustments.sql adjustments_status (add an FA depreciation-through-period_end component) + belcort/year-end-close/SKILL.md Step 0

### `F12-6` · **MEDIUM** · The DB closes over 'drafting' entries (g1 counts only needs_review/needs_decision); they strand in the locked period where finalize_coding can never run
*Hero-prompt item: F1*

**Evidence**
- `db/v2/25-fns-ops.sql:408-418 — g1 counts status in ('needs_review','needs_decision') only; 'drafting' entries are neither counted nor swept (sweep scope :550 is auto_draft/approved)`
- `db/v2/20-fns-journal.sql:128-160 — finalize_coding UPDATEs journal_entries (status), so post-close the row-level trigger raises posting_date_in_closed_period; there is no delete path for a drafting entry (`grep 'delete from journal_entries' db/v2/*.sql` → no matches; reject_entry requires non-drafting status, 20:233)`
- `belcort/year-end-close/SKILL.md:43 — 'drafting' is listed only in the skill's Step-0 surface-and-acknowledge gate; the DB itself is silent`
- `Partial rescue exists but is itself the F12-4 hole: edit_entry can re-date the drafting entry out of the closed window (20:305-310); the balance trigger skips 'drafting' (15-triggers.sql:52) so the stranded row may not even balance; journal_entries_page lists drafting rows with no default exclusion (28-fns-reads.sql:43)`

**What is wrong / missing** — An in-flight drafted-but-never-finalized entry does not block the close and cannot be finalized afterwards — it lingers forever in the workbench grid inside a locked period, and the only clean fix is reversing the whole close. The unbalanced-drafting escape compounds it: the stranded row may not even balance.

**What the rebuild must do** — db/v2/25-fns-ops.sql record_year_end_close g1 — include 'drafting' in the hard block, or surface a drafting count in the close return

### `F12-7` · **MEDIUM** · fye_month is freely editable after closes exist; FY-window reads re-window history against frozen close periods and client_financial_statements silently double-counts when a close boundary lands inside a re-windowed FY
*Hero-prompt item: F1*

**Evidence**
- `db/v2/24-fns-onboard.sql:462-463,476 — update_client_profile (bookkeeper floor, :449) sets fye_month with no live-close guard; client_fy_close rows keep the ORIGINAL period_start/period_end (14-tables-ops.sql:201-203)`
- `db/v2/28-fns-reads.sql:607-620 — FS windows are computed from the CURRENT fye_month; the segment floor takes only closes with period_end < v_cs, so a close boundary INSIDE the re-windowed FY is not floored and the SoFP cumulative (28:669-675) includes both the pre-boundary entries AND the restating opening entry — double count with no raise`
- `db/v2/28-fns-reads.sql:480-487 — client_general_ledger DOES raise gl_window_spans_close for this case; the FS/TB paths have no equivalent guard (25:124-151 client_trial_balance/trial_balance_range)`
- `db/v2/28-fns-reads.sql:788 — the FS basis[] admits 'a changed FYE re-windows history' but not the double-count mode`

**What is wrong / missing** — A legitimate FYE change (companies do change year-ends) on a client with closed years silently corrupts the comparative statements and the FY TB: windows straddle close boundaries and the SoFP double-counts the opening restatement, with in_balance potentially still true (both sides inflate). Also the next record_year_end_close computes its window from the new fye_month, which can overlap or gap against the frozen prior close (gap activity is caught by g2, but a gap with only real-account movement is not).

**What the rebuild must do** — db/v2/24-fns-onboard.sql update_client_profile — block or gate fye_month changes when a live client_fy_close exists; db/v2/28-fns-reads.sql — add a spans-close raise to FS/TB windows

### `F12-9` · **MEDIUM** · Doctrine–tool drift on the close: the year-end-close SKILL mandates the 7-arg Track-1c tax-provision path, but the registered agent tool exposes only 4 parameters — Clara cannot pass p_tax_provision_cents
*Hero-prompt item: F1*

**Evidence**
- `belcort/year-end-close/SKILL.md:100-108 — 'The as-built fn is 7-arg (Track 1c) … pass the human-confirmed figure as p_tax_provision_cents to record_year_end_close'`
- `agent/src/tools/registry/ops.ts:56-72 — the record_year_end_close tool schema carries only p_client_id, p_fy, p_actor, p_first_year_zero_opening; no provision params, and the description omits the provision entirely`
- `db/v2/25-fns-ops.sql:346-352 — the DB fn is genuinely 7-arg; the dashboard is unaffected (dashboard-direct RPC), the agent lane is the one that breaks`

**What is wrong / missing** — The skill's Step-0 TX-vs-provision gate offers 'two sanctioned paths' and the second (provision via the close call) is uncallable from the agent runtime — the declared tool schema simply has no parameter to carry the figure. Clara following her own doctrine dead-ends; only the hand-post-then-close path works. The skill and tool registry were not updated together.

**What the rebuild must do** — agent/src/tools/registry/ops.ts — add the three provision params (or amend belcort/year-end-close/SKILL.md to the hand-post-only path)

### `F12-14` · **LOW** · ICT capital-allowance rate direction for YA2024+ (IA 40 / AA 20) is self-flagged as disputed and could not be verified against the gazette; the engine fixes it permanently per asset at first-use YA
*Hero-prompt item: F2*

**Evidence**
- `db/v2/19d-tables-tax.sql:17-19 — 'NOTE: an earlier research pass inverted this as 20/40 — the gazette split is 40/20, no sunset year corroborated' (verbatim, re-verified)`
- `db/v2/19d-tables-tax.sql:50 — the seeded computer_ict row is IA 40 / AA 20 valid_from 2024-01-01 citing P.U.(A) 328/2024`
- `db/v2/23d-fns-tax.sql:186-197 — the rate row is fixed at each asset's first-use YA for the WHOLE schedule, so a wrong split mis-drafts every ICT asset's CA for its entire life`
- `C:/Users/zhant/Desktop/sst-research/ contains only SST sources (acts, regulations, MySST manuals, SST-02 form) — no income-tax gazettes; the claim is unverifiable from the frozen evidence base`

**What is wrong / missing** — Two internal research passes disagreed on whether the 2024 ACA ICT split is IA40/AA20 (3-year claim) or IA20/AA40 (2-year claim); the seeded value follows the later pass but no primary source is in the repo or research folder. If inverted, every YA2024+ ICT asset's drafted CA schedule is wrong in both timing and per-year quantum, permanently (first-use fixing).

**What the rebuild must do** — db/v2/19d-tables-tax.sql seed — owner to verify P.U.(A) 328/2024 against the gazette (e-Federal Gazette) before any live reliance

### `F12-15` · **LOW** · client_trial_balance_comparative shows a post-closing TB for a closed prior FY (nominals swept to zero) against a pre-closing current TB — asymmetric comparative presentation
*Hero-prompt item: F1*

**Evidence**
- `db/v2/25-fns-ops.sql:50-52,69 — a bounded FY window INCLUDES close machinery by design; the closed FY's window contains its own closing entry dated period_end, netting every nominal to zero (dropped by the netted CTE :74-77)`
- `db/v2/28-fns-reads.sql:801-815 — client_trial_balance_comparative is two client_trial_balance calls; no standard-only variant for the prior year`
- `Mitigation exists: the FS pack's SoCI is standard-entries-only per window (28:622-637), so the STATEMENTS comparative is correct — only the TB viewer pair is asymmetric`

**What is wrong / missing** — The 'TB current vs prior' viewer promised by the read model shows the prior closed year with no P&L rows at all (post-closing TB) while the current year shows full nominal detail — technically defensible but certain to read as data loss to a practitioner comparing years, and the UI aligns rows by account_code so every nominal row shows a blank prior column.

**What the rebuild must do** — db/v2/28-fns-reads.sql client_trial_balance_comparative — pre-closing option (exclude closing entries from the prior window) or a documented UI affordance

#### Verified as sound (workstream F)

- The core close mechanics are correct and well-guarded: g1 (unreviewed entries) and g2 (close-in-order) hard-raise; the TB is re-asserted inside the close (trial_balance_unbalanced refuses); the acc_type exhaustiveness guard prevents unclassified accounts slipping the sweep; the closing sweep resolves drawings by the DRAWINGS marker (not literal codes); the RE residual balances the entry to the cent; partner-mode PSR must sum to exactly 1, shared drawings are rejected, unmapped drawings fail loud, and the rounding residual goes to the largest-PSR partner.  ·  _evidence:_ `db/v2/25-fns-ops.sql:408-434 (g1/g2); db/v2/25-fns-ops.sql:492-505 (TB + exhaustiveness); db/v2/25-fns-ops.sql:510-655 (sweep/marker/partner mode: PSR=1 at :513-515, shared drawings :517-521, largest-PSR residual :611-621, unmapped raise :640-643); db/v2/tests/year_end_close_test.sql:285 (proven on the rig)`
- Retained-earnings roll and real-account carry-forward are arithmetically correct within the aligned-FY happy path, including multi-year chains: the opening entry carries every real account's post-closing balance segment-by-segment (posting_date > carry_from), and the BEE CREATIVE golden test proves an accountant-reproduced SoFP carries unchanged through FY2025 and FY2026 openings.  ·  _evidence:_ `db/v2/25-fns-ops.sql:658-704; db/v2/tests/bee_carry_down_close_test.sql:40-47,138-146 (exact-cents asserts re-verified)`
- The tax-provision double-count guard at close is real and conservative: any live movement on the liability account in the window blocks a second provision (operator must omit the arg or reverse the old entry), and transparent entities are hard-blocked from an entity provision with correct statutory reasoning (LHDN PR 8/2021 partnership / Form B sole prop; LLP + sdn_bhd allowed).  ·  _evidence:_ `db/v2/25-fns-ops.sql:441-482; belcort/year-end-close/SKILL.md:47-56`
- Onboarding carry-down (prior-accountant handover) is genuinely sound: seed_opening_ar_invoice/ap_bill/fixed_asset + seed_opening_carry_forward create per-item opening entries tied to controls via markers, assert OBE nets to zero, and the FA baseline fa_depreciation row makes run_depreciation continue from NBV with no historical catch-up — all rig-proven.  ·  _evidence:_ `db/v2/25b-fns-opening.sql:40-315; db/v2/tests/opening_carry_forward_test.sql:70-158 (CF1 control-tie/OBE-nil/snapshot, CF2 depreciation baseline single-month charge, CF4 validations — re-verified)`
- The closed-period guard's conjunctive exemption is correctly narrow (entry_kind AND via_fn both required, proven in both failure directions on the rig), and reverse_entry correctly never touches the original row — the mirror is deliberately dated current_date (documented), so a pre-close APPROVED entry can still be corrected via a current-dated mirror, which is the audit-correct behavior; reverse_entry refuses closing/opening entries (cannot_reverse_close_entry).  ·  _evidence:_ `db/v2/25-fns-ops.sql:297-317; db/v2/tests/closed_period_lock_test.sql:108-135; db/v2/22-fns-documents-recon.sql:792,807-818`
- AR/AP open-item continuity across the FY boundary is structurally fine at the subledger layer: items/allocations/aging/statements are keyed on their own document dates and never touch journal-line GL sums, so aging and customer/supplier statements remain correct after a close (the breakage is only in the GL-side tie-out, F12-1).  ·  _evidence:_ `db/v2/23-fns-subledger.sql:434-526 (_aging_core as-of arithmetic on invoice/receipt dates); db/v2/23-fns-subledger.sql:597-668 (_statement_core)`
- The SST-02 engine's statutory mechanics verify against the owner's primary-source research: service tax on the payment basis with the s.11(2) 12-month trigger at invoice_date+12m+1d (Act text: 'due on the day following that period of twelve months'); form arithmetic 14 = 12 − 13a − 13b − 13c − 13A with 13d (bad-debt relief) OUTSIDE the arithmetic exactly matches the 2025 SST-02 form; the field-11 buckets (5%/10%/6%/8%/Group-H card levy) match; due date last-day-of-following-month for aligned periods (s.26(1)) vs +30d for varied (s.26(2)); NIL returns valid; separate sales/service declarations; bad-debt relief C or C−A×C/B computed net of CNs as candidates only.  ·  _evidence:_ `db/v2/23e-fns-sst.sql:15-55, 165-172, 309, 554-568, 788-798; C:/Users/zhant/Desktop/sst-research/service-tax-act-2018.txt (s.11(2) text re-verified); C:/Users/zhant/Desktop/sst-research/sst-02-form-2025.txt:109-136, 168-178 ((14)=(12)−(13a)−(13b)−(13c)−(13A) verbatim)`
- The SST engine is close-safe (counts entry_kind='standard' only), reversal-aware (cancelled pairs, bounced-receipt effectiveness via app.sst_receipt_effective, reversal rates bucketed at the original entry's date), floors per-tax payables at 0 with explicit carried-excess numbers, and its confessed gaps (Group-H levy, Part C/D/E, imported taxable services/SST-02A, first-period irregularity, s.11(1A) approval, rounding convention) accurately match the real SST-02 form's uncomputable fields.  ·  _evidence:_ `db/v2/23e-fns-sst.sql:92-101, 186-196, 238-256, 356-382, 665-678, 702-718; C:/Users/zhant/Desktop/sst-research/sst-02-form-2025.txt:189-224 (field 18 families the books can't derive)`
- The SST rate table is correct as far as it goes: service 6% from 2018-09-01, general 6%→8% at 2024-03-01 with retained-6% categories noted, sales 5/10, exempt/zero/none 0 — and the July-2025 scope expansions require no NEW rate values (new taxable categories map onto the existing 6/8/5/10 treatments), so the rates authority is not blocking; classification guidance is the doctrine layer's job.  ·  _evidence:_ `db/v2/18-tables-reference.sql:38-51 (re-verified); db/v2/20-fns-journal.sql:42-73 (date-aware compute_sst_leg raising no_sst_rate_for_date)`
- The income-tax engine's verified-correct statutory numbers: MSME bands 15/17/24 from YA2023 with PR 8/2025 conditions human-confirmed; non-commercial MV QE caps RM100k (new, cost≤RM150k) / RM50k per Sch 3 para 2(2); SVA RM2,000/asset at 100% with the RM20k/YA aggregate cap waived for MSME (PR 3/2021); balancing charge capped at allowances claimed; disposal-year no-allowance; s44(6) approved donations capped at 10% of aggregate income AND at the flagged add-back (anti-double-dip); Sch 3 para-71 2-year withdrawal confirmations; brought-forward relief never silently applied (quoted from the prior draft as a confirmation item).  ·  _evidence:_ `db/v2/19d-tables-tax.sql:77-87; db/v2/23d-fns-tax.sql:206-216 (MV caps), 218-256 (disposal year + BC cap least(...,v_prior) at 242-245 + para 71 at 251-255), 259-274 (SVA), 301-309 (s44(6)), 382-391 (b/f quoted, never applied)`
- Both engines' 'honesty layers' (assumptions[] + confirmations_needed[]) are genuinely comprehensive review-flag systems — single-source assumption, CA continuity assumption, entertainment proviso reclass, WHT remittance confirmation, fines split, IBA qualification, calendar-basis warning for non-Dec individuals, registration mismatches, late-penalty tiers — this is the strongest professional-review scaffolding in the codebase and should be preserved in any rebuild.  ·  _evidence:_ `db/v2/23d-fns-tax.sql:374-415; db/v2/23e-fns-sst.sql:655-718`
- The compliance calendar (dashboard) is honestly scoped: dates-not-money carve-out, primary-source citations per deadline, 'assumed/verify' caveats, and an explicit do-NOT-guess deferred list (CP204 YA2027/28 timeline, CP204A/CP502, SST-02A, DG-varied periods, Form E/EA, penalties).  ·  _evidence:_ `dashboard/lib/complianceCalendar.ts:1-60 (re-verified: basis 'derived'|'assumed', caveat chip, citation field, deferred list at :9-12)`

#### Unverified (workstream F) — could not be confirmed from frozen evidence; carried as open

- P.U.(A) 328/2024 ICT ACA split (IA 40/AA 20 vs 20/40) and the P.U.(A) 52/2000 general CA rates — no income-tax gazettes in the repo or the sst-research folder (folder re-listed 2026-07-17: SST acts/regulations/manuals/form only); the 19d file itself records an internal research-pass disagreement (F12-14). Needs owner gazette verification.
- All findings are from code reading of the frozen repo; nothing was executed. The F12-1/F12-3 arithmetic (post-close double-count and phantom-DIT cancellation, PBT-zeroing) is confirmed by tracing the SQL and by the disjoint test coverage, but was not run on the ephemeral rig (read-only audit discipline).
- The claimed 'LAST VERIFIED 2026-06-14 vs RMCD MySST' status of the 18-tables-reference retained-6% category list (F&B, telco, parking, logistics) — the sst-research folder's sources were spot-checked for the 12-month rule and the SST-02 form arithmetic only; the full 2025-07-01 service/sales scope-expansion category mapping (which categories a coding skill should tag service-6 vs service-8) was not exhaustively cross-checked and belongs to the coa-coding doctrine workstream.
- Whether the agent tool layer rejects or silently drops unknown params for the 4-arg record_year_end_close tool when the skill instructs the 7-arg call (F12-9) — buildTools.ts passes spec.params as the tool parameter schema (agent/src/tools/buildTools.ts:96) but the SDK-side validation/strictness path was not traced end-to-end; either behavior leaves the provision path uncallable.
- The dashboard SstReturn.tsx / TaxComputation.tsx surfaces' fidelity to the worksheets (whether all confirmations_needed render) — UI-lane, outside this workstream.
- CP204 statutory notes in the engine (85% floor s.107C(3), month-11 revision permanent from YA2024, new-SME 2-YA exemption, 10%-beyond-30% underestimate penalty) — consistent with domain knowledge but not re-verified against a primary source in the evidence base.

#### Decision brief (workstream F)

> WORKSTREAM F PART 1 — VERDICT (adversarially re-verified 2026-07-17: 13 findings CONFIRMED, 2 ADJUSTED, 0 REFUTED; all 12 fine claims spot-verified against code and primary sources). The close/tax engines are the best-crafted SQL in the repo (marker-driven sweeps, partner-mode exactness, cumulative-target models, exceptional honesty layers, exact-cents tests) — but they fail the workstream's central question: the system does NOT correctly transition a client into the next FY, because the close's opening-restatement model was only taught to 3 of the ~7 read/write families that consume the GL.
> 
> F1 ANSWER (what carries / what silently doesn't / what blocks re-open). CARRIES correctly: retained-earnings roll (single-RE, sole-prop drawings, and per-partner PSR modes), every real account's post-closing balance into an opening entry, the FP snapshot, AR/AP open items + aging + statements (subledger-native, close-immune), FA register + cumulative-target depreciation continuity, FS comparatives (segment-floored SoCI/SoFP). SILENTLY BREAKS: (1) bank reconciliation + AR/AP/FA control tie-outs — all-time GL sums with no segment floor double-count the opening restatement, so from year 2 every recon is structurally uncompletable (the first post-close recon can even spuriously 'complete' on a phantom full-balance deposit-in-transit) and every tie-out reads untied (F12-1, critical, untested combination); (2) cross-FY bank matching of unpresented items — the closed-period guard blocks match/unmatch UPDATEs (F12-2); (3) a re-run tax draft — no entry_kind filter, PBT computes 0 post-close, statutory income collapses and unabsorbed CA inflates (a phantom loss in gain-heavy years), superseding the correct draft (F12-3); (4) the lock itself is one-directional — entries can be re-dated OUT of a closed period (F12-4); (5) drafting entries strand (F12-6); (6) fye_month edits re-window history against frozen closes (F12-7). BLOCKS RE-OPEN: almost nothing — reverse_year_end_close needs only a live close + actor; no later-close ordering guard (F12-5, and after a mid-chain reversal the correcting entry is itself still locked, stranding the books mid-corruption), no role floor (a viewer can close/re-open a year, F12-8), and the via_fn exemption lets close machinery post inside later closed periods. There is no periods table (D18: computed windows) and no interim/month-end lock of any kind — SST bimonthly periods and monthly management closes have zero lock support; the FY close is the only period boundary in the system.
> 
> F2 COVERAGE MAP (practicing-firm capabilities). SUPPORTED: output SST leg computation (date-aware, effective-dated, DB-owned); SST-02 Part-B2 draft with correct statutory mechanics (sales accrual, service payment-basis + 12-month rule, CN handling, cancelled/bounced awareness, bad-debt-relief candidates via the statutory formula, due dates, NIL returns, penalty-tier warnings) — form arithmetic verified against the owner's 2025 SST-02 primary source; output-tax liability tracking incl. a deferred-position reconciliation; draft chargeable-income computation delivering the full ADR-044 promise as a worksheet (certain add-backs, surfaced candidates, per-asset CA schedule with first-use-YA rate fixing, MV/SVA caps, balancing-adjustment candidates, MSME/standard bands, Form C/PT/P/B classification, CP204 draft, PSR allocation, CP500 notes); CA metadata on the FA register (ca_class, is_commercial_vehicle, is_new with conservative defaults); review flags (assumptions/confirmations) — outstanding. PARTIAL: unabsorbed CA/loss brought-forward (computed but never auto-applied, no persistent relief ledger — confirmation-quote only); CP204 (no CP204A revision support); Form outputs (worksheet only — no form-field artifact, and the dashboard's 'Export forms' intent routes to a nonexistent agent export scope); compliance calendar (dates-only, honest deferrals); SST category guidance post-2025-expansion (rates suffice, classification doctrine unverified); add-back detection (flag-driven; account fallback exists only for 925-000 doubtful debts, not donations/entertainment — F12-12). MISSING: imported taxable services / SST-02A reverse charge (confessed); SST registration-threshold monitoring (nothing watches taxable turnover vs RM500k/1.5M); Group-H levy + SST-02 Parts B1/C/D/E + field-18 exemption values (confessed — books lack source data); WHT remittance ledger (CP37 family); HP-asset QE timing + private-use apportionment metadata; RPGT; Form E/EA/PCB engine (declared non-goal); deferred tax (declared out of scope). AGENT-LANE GAP: compute_sst_return/compute_tax_draft and their reads are not agent tools and have no skills — 'Clara does tax prep' is currently false (F12-10); the year-end skill's tax-provision path is uncallable via the 4-arg registered tool (F12-9).
> 
> REBUILD GUIDANCE: the engines' statutory logic, honesty layers, marker doctrine, and test discipline are port-grade assets; the defect class to design out is systemic, not local — every GL-consuming read/write must be forced through ONE segment-aware balance primitive (a single 'account balance as-of within segment' fn) instead of each fn hand-writing its own Σ(dr−cr), and period locking needs to become first-class (bidirectional, ordered, role-floored, with interim locks) rather than a trigger bolted to one table. Also unify detection signals: literal account codes (SST 460/461, tax 916/923/924/925) and coding-time flags should both resolve through markers/registries so silent-miss classes (F12-11, F12-12) become impossible.

---

## Workstream F — Accounting engine — side-effects & subledger sync

### `F3-1` · **CRITICAL** · Coding a sales invoice to Trade Debtors never creates/links the AR open item — record_ar_invoice has no caller in any workflow (agent, doctrine, or dashboard)
*Hero-prompt item: (a) Trade debtor/AR coding*

**Evidence**
- `db/v2/23-fns-subledger.sql:83 — record_ar_invoice exists as an audited SD writer (gross READ from the anchoring entry's DC control leg via app.entry_account_net at :95)`
- `db/v2/19-tables-subledger.sql:186-189 — the only trigger on ar_* tables is the firm-stamp; no trigger/constraint links journal_lines on the DC control account to ar_invoices`
- `agent/test/registry.test.ts:28-53 — the complete EXPECTED curated tool list contains NO subledger fn (record_ar_invoice/record_ar_receipt/allocate_ar_receipt/write_off_ar_invoice all absent); :59-61 the 'no surprise extras' test structurally forbids adding one without changing the test`
- `agent/src/tools/registry.ts:39-53 — EXCLUDED_FNS documents only the job lane + pure helpers as deliberate exclusions; the entire 23-fns-subledger family is unaccounted for in the parity story`
- `belcort/coa-coding/SKILL.md:45,254-258 — the skill instructs 'Dr 300-000 TRADE DEBTORS' journal lines (cold-start polarity note + the issued-sales-invoice branch) with zero mention of any subledger step; repo-wide grep of belcort/ for record_ar|allocate_|ar_aging finds no operative subledger-write instruction (only export-read mentions)`
- `belcort/AGENTS.md:71-78 — the §15 canonical audited-fn list omits every AR/AP subledger fn`
- `dashboard/lib/arap.ts:1-8 — the dashboard AR/AP surface is read-only (ar_aging/ap_aging, tie-outs, statements; the one write is an agent-routed export intent); repo-wide grep of dashboard/ + agent/src/ finds ZERO production caller of any AR writer`
- `db/v2/25b-fns-opening.sql:21-22,64 — the ONLY production callers are the opening seeders inside seed_opening_carry_forward (plus tests)`

**What is wrong / missing** — Every sales invoice Clara codes moves the GL control account while the open-item subledger stays frozen at the onboarding seed: aging, customer statements, allocation state, and the AR control tie-out are permanently stale from day one, and the firm-facing 'aging' and 'full' export deliverables (agent/src/tools/exportTool.ts:336-346,364-368; belcort/export/SKILL.md:53-55,75) render that wrong data to clients. Meets the workstream failure criterion exactly: journal lines post while required AR state goes stale.

**What the rebuild must do** — db/v2/23-fns-subledger.sql + agent/src/tools/registry.ts + belcort/coa-coding/SKILL.md

### `F3-2` · **CRITICAL** · Supplier-bill coding to Trade Creditors has the identical dead chain — record_ap_bill is never invoked by any workflow
*Hero-prompt item: (b) Trade creditor/AP coding*

**Evidence**
- `db/v2/23-fns-subledger.sql:306 — record_ap_bill exists (gross read from the CC control leg)`
- `belcort/coa-coding/SKILL.md:298-302 — the Step-7 worked card posts 'Cr 400-000 TRADE CREDITORS 432.50' with no subledger step; :231-240 CN/DN handling flips legs only, never touches ap_bills`
- `agent/test/registry.test.ts:28-53 — no AP writer in the tool surface; belcort/AGENTS.md:71-78 omits them; dashboard/lib/arap.ts is read-only (grep confirms zero production callers)`
- `db/v2/25b-fns-opening.sql:78-114 — seed_opening_ap_bill is the sole production caller`

**What is wrong / missing** — AP aging, supplier statements and the AP control tie-out go stale on the first coded bill; ap_allocations never receive rows so nothing can ever mark a bill settled.

**What the rebuild must do** — db/v2/23-fns-subledger.sql + belcort/coa-coding/SKILL.md

### `F3-3` · **CRITICAL** · A bank receipt is never recorded as ar_receipts nor allocated — it just posts Dr/Cr — and the bank-recon design routes customer receipts into coa-coding where a confirmed customer KB rule can AUTO-POST a revenue double-count
*Hero-prompt item: (c) Bank receipt/payment settling AR/AP*

**Evidence**
- `db/v2/23-fns-subledger.sql:116,157,336,373 — record_ar_receipt/allocate_ar_receipt/record_ap_payment/allocate_ap_payment exist; grep of agent tools, doctrine, and dashboard finds no caller anywhere (same greps as F3-1)`
- `belcort/bank-recon/SKILL.md:84-90 — Step-3 auto-match searches finalised entries 'on that COA account' (the BANK account); an invoice entry (Dr 300-000/Cr 5XX) has no bank leg, so a customer-payment line can never match it; :92-103 the unmatched line is declared 'usually a bank-only item' and handed to coa-coding`
- `belcort/coa-coding/SKILL.md — the entire 357-line skill has no receipt/settlement branch; Step 3 matches KB rules by counterparty and Step 5.1 (:127) auto-drafts on a single confirmed rule ≥0.95; kb-evolve/SKILL.md:58 confirms customer-name rules map to 5XX Sales — so 'ACME PAYMENT' on a statement can code Dr Bank / Cr 500-000 into the ungated auto_draft lane (balanced, no tax leg for a non-SST client, no flags); the kb-evolve BM2/recon-hint learning loop actively CREATES these narration→customer→revenue mappings`
- `belcort/kb-evolve/SKILL.md:267-269 — the doctrine explicitly anticipates pure settlements 'Dr 3XX Bank / Cr 300-000 Debtors' — but only to SKIP KB learning; nothing records or allocates the receipt`
- `db/v2/25-fns-ops.sql:1302-1373 — proactive-notification kinds are generic (stuck/new_data/looks_wrong + internal digest); no unmatched/open-allocation task class exists`
- `dashboard/lib/arap.ts:31-33 — 'credit_balances_cents' (unallocated receipts/advances) is surfaced only from ar_receipts rows, which no workflow ever creates`

**What is wrong / missing** — Best case the receipt posts Dr Bank / Cr 300-000 and the invoice stays open forever (aging overstates, statements never clear, s.11(2) service-tax trigger never fires); worst case a confirmed customer rule auto-posts Dr Bank / Cr Revenue — double-counted revenue with no human gate. No unmatched/open-allocation task ever surfaces.

**What the rebuild must do** — belcort/bank-recon/SKILL.md + belcort/coa-coding/SKILL.md + db/v2/23-fns-subledger.sql

### `F3-12` · **HIGH** · Three-way drift between the DB fn surface, the agent tool registry, and the doctrine's canonical tool list — including a doctrine-promised tool (unmatch_bank_line) that does not exist in the registry and would HARD-FAIL a run if called
*Hero-prompt item: cross-chain root cause*

**Evidence**
- `belcort/AGENTS.md:75 — §15 lists unmatch_bank_line as a curated tool; agent/test/registry.test.ts:38-42 — the registry's complete documents/recon set has match_bank_line but NO unmatch_bank_line; agent/src/tools/buildTools.ts:128-133 documents that the OpenAI Agents SDK default toolNotFoundBehavior='raise_error' HARD-FAILS a run on an unknown tool name (the exact defect class that comment says was fixed for clarify_tool). Precision: the DB fn itself EXISTS and is granted (db/v2/22-fns-documents-recon.sql:522-567) — the drift is at the tool-registry layer`
- `belcort/AGENTS.md:71-78 — §15 omits tools that DO exist in the registry: record_fixed_asset, run_depreciation, dispose_fixed_asset, set_coa_account_type, seed_opening_carry_forward — while §8 (:57) instructs never to act from a tool description alone, making the FA tools doctrine-unreachable`
- `agent/src/tools/registry.ts:39-53 — EXCLUDED_FNS accounts only for the job lane + helpers; the whole 22 (unmatch_bank_line)/23/23c/23d/23e fn families (subledger writers/allocators, recurring/accrual/amortisation posters, compute_tax_draft, compute_sst_return, adjustments_status) are neither tools nor documented exclusions; registry.ts:4 still describes the surface as '(20..25-fns-*.sql)'`
- `agent/src/doctrine/loader.ts:10-22 — the 11 routed skills contain no FA, no AR/AP, no adjustments, no tax-comp skill; belcort/year-end-close/SKILL.md:57-59 tells the user to run run_recurring_journals/run_amortisation, which are NOT agent tools and (verified by grep) have NO dashboard caller either — an instruction with no executable surface except the SDT-001 SELECT-wrap bypass`

**What is wrong / missing** — The doctrine, the tool registry, and the DB engine surface each describe a different product. Consequences range from silent capability gaps (F3-1..6) to a latent hard-exit (unmatch_bank_line) to skills instructing tools that don't exist — and the registry parity test freezes the drift in place rather than detecting it (it asserts only the EXPECTED snapshot, with no completeness check against granted DB fns).

**What the rebuild must do** — belcort/AGENTS.md §15 vs agent/src/tools/registry/* vs db/v2/22/23*-fns-*.sql

### `F3-4` · **HIGH** · Coding to an FA cost account never creates the FA register row: record_fixed_asset is a curated tool but is doctrine-orphaned — no skill references it, AGENTS §15 omits it, and §8 forbids acting from tool descriptions alone
*Hero-prompt item: (d) Fixed-asset acquisition*

**Evidence**
- `agent/src/tools/registry/fixedAssets.ts:9-35 — record_fixed_asset is in the tool registry with a full description`
- `grep of belcort/ for record_fixed_asset|capitalis|fixed.asset|depreciat — zero operative hits outside client-onboarding's carry-down (belcort/client-onboarding/SKILL.md:250-253) and the export presentation-mapping note; none of the 11 routed skills (agent/src/doctrine/loader.ts:10-22) instructs capitalisation at coding time`
- `belcort/AGENTS.md:71-78 — §15's canonical write-tool list omits record_fixed_asset/run_depreciation/dispose_fixed_asset entirely; :57 (§8) mandates 'I never onboard, bootstrap, code, close, or export from memory or from a tool description alone'`
- `belcort/coa-coding/SKILL.md:86,117-119 — the motor_vehicle_over_50k must-ask flag is a materiality/awareness flag routing to needs_review only; no register step follows approval`
- `dashboard/components/books/FaRegister.tsx:6-8 — 'DISPOSAL is the one write' on the dashboard FA surface; no acquisition writer (grep confirms)`
- `db/v2/19b-tables-fixed-assets.sql:108-125 — only RLS + the firm-stamp trigger; no DB link from FA-cost journal lines to fixed_assets`
- `db/v2/23d-fns-tax.sql:25,98,115,173-201 — compute_tax_draft's capital-allowance schedule reads the fixed_assets register (ca_class-driven), so an unregistered asset is silently excluded from the CA computation`

**What is wrong / missing** — An asset purchase coded Dr 200-xxx posts to the GL with no register row: no method/life/rate, no in-service date, no CA metadata (ca_class/is_commercial_vehicle), so depreciation and the capital-allowance computation silently exclude it. fa_control_tie_out would show the drift but is a dashboard-only read no skill checks — and F3-7 breaks it after the first close.

**What the rebuild must do** — agent/src/tools/registry/fixedAssets.ts + belcort/AGENTS.md §15 + belcort/coa-coding/SKILL.md

### `F3-5` · **HIGH** · Depreciation is DB-computed and DB-posted when run — but NOTHING in the product ever runs or gates it: no skill, no dashboard action, no close guard, and adjustments_status deliberately excludes it; manual depreciation journals are unblocked
*Hero-prompt item: (e) Depreciation*

**Evidence**
- `db/v2/23b-fns-fixed-assets.sql:131 — run_depreciation is a cumulative-target, idempotent DB engine (structural math; posts one balanced approved journal at :205-218 + fa_depreciation rows at :224-225)`
- `grep of belcort/ for run_depreciation/depreciat — no skill instructs running it; belcort/year-end-close/SKILL.md:37-85 — the mandatory Step-0 pre-close gate lists pending entries, docs, recon, TX-provision, recurring/amortisation — depreciation is absent`
- `db/v2/23c-fns-adjustments.sql:587-690 — adjustments_status covers ONLY recurring journals + amortisation (+ amortisation anchor-shortfall); db/v2/25-fns-ops.sql:490,767 — the close's pending_adjustments IS adjustments_status, so record_year_end_close closes an FY with zero depreciation charged and surfaces nothing`
- `dashboard/components/books/FaRegister.tsx:6-8 — no 'run depreciation' action (disposal is the one write); grep of dashboard/ for run_depreciation finds only error copy (booksErrors.ts:87); agent/src/jobs/bulkApproveRunner.ts:104 — the only job lane calls approve_entry only`
- `db/v2/20-fns-journal.sql:83-160 — draft_entry/finalize_coding validate firm scope, kb-rule citation, status/risk binding and balance only; nothing blocks a hand-drafted Dr 923-000 / Cr <AD> journal that bypasses the register (grep special_acc_type in 20-fns-journal.sql: guards exist only in set_coa_account_active at :433-454)`

**What is wrong / missing** — A financial year can be closed and hard-locked with no depreciation, or with model-invented depreciation hand-journaled outside the register (fa_depreciation stays empty ⇒ compute_tax_draft's register-driven add-back and CA schedules go wrong). The only detection surface (fa_control_tie_out) is unrouted for the agent and structurally false after the first close (F3-7).

**What the rebuild must do** — db/v2/23b-fns-fixed-assets.sql + db/v2/23c-fns-adjustments.sql + belcort/year-end-close/SKILL.md

### `F3-6` · **HIGH** · Disposal is structurally complete inside dispose_fixed_asset and human-initiable from the dashboard register — but no workflow links disposal evidence (proceeds receipts, scrap decisions) to it, and reverse_entry lets an FA/AR/AP anchor be reversed leaving a live register row that keeps depreciating
*Hero-prompt item: (f) Disposal*

**Evidence**
- `db/v2/23b-fns-fixed-assets.sql:242-340 — DB owns NBV + gain/loss (:277-279), posts the compound journal (:296-326), retires the row (:328-330); gain/loss account required when nonzero (:289-290); depreciate-to-date surfaced as warning (:280-288)`
- `dashboard/components/books/FaRegister.tsx:6-8,60-64 + dashboard/lib/fa.ts:102-129 — the one write path: a human-initiated agent-routed intent ('Dispose fixed asset #N …') plus an admin+ deterministic rpcBooks('dispose_fixed_asset') fallback`
- `grep of belcort/ for dispose — zero hits: no skill routes a coded proceeds receipt or scrap instruction to disposal; coa-coding would post the proceeds as an ordinary entry with the register untouched`
- `db/v2/22-fns-documents-recon.sql:786-805 — reverse_entry blocks ONLY close-kind entries (:792) and active amortisation anchors (:802-805); the comment at :798-801 explicitly relies on 'the FA/AR/AP registers' tie-outs to surface anchor reversals — visibility-only, and that visibility is broken post-close (F3-7). A reversed acquisition leaves fixed_assets.status='active', and run_depreciation (23b:163-167 selects status='active') would keep charging on cost the GL no longer holds`

**What is wrong / missing** — Chain verdict PROMPT-ONLY: the engine is sound, the human dashboard path exists, but Clara coding 'sold the van, RM20k banked in' posts a plain journal and leaves the register holding an active asset — register/accum-dep/gain-loss/status all stale; and the anchor-reversal hole silently corrupts the register with only a (broken) tie-out to notice.

**What the rebuild must do** — db/v2/22-fns-documents-recon.sql (reverse_entry) + dashboard/components/books/FaRegister.tsx + belcort doctrine (missing skill)

### `F3-7` · **HIGH** · Post-close control tie-outs are structurally FALSE: the year-end close's opening entry re-posts every real-account balance (incl. DC/CC/FA/AD) but _tie_out_core and fa_control_tie_out sum raw posted GL with no entry_kind/segment exclusion — after the first close every AR/AP/FA tie-out reports phantom drift that grows with each close
*Hero-prompt item: (g)+(a-f) visibility layer*

**Evidence**
- `db/v2/25-fns-ops.sql:406,658-704 — the opening entry (entry_kind='opening', posted at v_open_date = period_end+1, status approved) carries every real account's balance forward, windowed from the prior close (v_carry_from) so each close's opening equals the FULL cumulative real balance; :366 v_real includes FA/CA/CL (the DC/CC controls are CA/CL; AD accounts are FA-typed per export/references/presentation-mapping.md:34). The closing entry sweeps NOMINAL accounts only — real accounts are never zeroed, so the opening entry DUPLICATES them in any raw all-time sum`
- `db/v2/23-fns-subledger.sql:551-577 — _tie_out_core's GL side: sum over ALL entries with status in (auto_draft,approved) and posting_date <= as_of — no entry_kind filter; the subledger side counts each anchored item once ⇒ for any as_of ≥ the close's opening date the GL side is 2× (then 3× after close 2, since each opening entry window includes the prior opening entry) while the subledger stays 1×`
- `db/v2/23b-fns-fixed-assets.sql:431-443 — fa_control_tie_out has the identical raw GL sums for FA cost and AD; its register side (:450-459) anchors on acquisition-entry posting dates and stays 1×`
- `db/v2/25-fns-ops.sql:49-69 — _trial_balance_core EXCLUDES entry_kind in ('closing','opening') for all-time reads (:69), proving the double-count hazard was known and handled there but not in the tie-outs`
- `test coverage (verified by grep): db/v2/tests/subledger_test.sql and fixed_assets_test.sql call the tie-outs but never record_year_end_close; bee_carry_down_close_test.sql calls record_year_end_close twice (:106,:133) but never a tie_out — the close × tie-out interaction is untested`
- `dashboard/lib/periodClose.ts:89-91 — the pre-close checklist reads ar/ap/fa tie-outs at as_of = the FY end being closed, so from the second FY onward the checklist itself shows false drift`

**What is wrong / missing** — The tie-out reads are the ONLY drift-detection layer the design relies on for the dead subledger and for anchor edits/reversals (22-fns-documents-recon.sql:798-801 says so explicitly). After the first close they cry wolf forever — false drift ≈ the full control balance — simultaneously destroying trust in the control and masking the real drift from F3-1/2/3/4. Static-analysis finding: derived by construction from the SQL (v_open_date=period_end+1; no entry_kind filter; disjoint test coverage verified); not executed on the rig in this session (see unverified).

**What the rebuild must do** — db/v2/23-fns-subledger.sql:_tie_out_core + db/v2/23b-fns-fixed-assets.sql:fa_control_tie_out

### `F3-8` · **HIGH** · Service-tax payment basis degrades to accrual: with no workflow creating AR anchors, every on-credit service invoice falls into compute_sst_return's cash-direct bucket and is declared at posting_date; the s.11(2) 12-month rule, bad-debt relief, and CN machinery never engage — surfaced only as a generic boilerplate assumption, never per-invoice
*Hero-prompt item: (i) Tax/SST*

**Evidence**
- `db/v2/23e-fns-sst.sql:353-383 — bucket (2) counts any tagged 461 leg whose entry is NOT in ar_invoices as 'cash-direct at posting_date'; the exclusion list is anchors/CN-receipts/reversals only — an unanchored CREDIT invoice is indistinguishable from a cash sale and declares on the accrual basis with no per-invoice flag`
- `db/v2/23e-fns-sst.sql:222-254 — the payment-basis cumulative-target model exists only for ar_invoices anchors; docs/architecture/backend.md:81 states service tax is payment-basis 'per-invoice cumulative-target from the AR subledger'`
- `db/v2/23e-fns-sst.sql:703-714 — the draft's 'honesty layer' DOES carry a static assumptions line (:706): unanchored tagged legs 'are declared at posting_date (cash-sale semantics — early, never late); anchor credit-sale invoices via record_ar_invoice for true payment-basis timing' — but it is identical boilerplate on every draft, distinguishes nothing per-invoice, and the recommended fix (record_ar_invoice) is unreachable from any workflow (F3-1/F3-3)`
- `F3-1/F3-3 — no workflow ever records the anchors or the settling receipts, so for a service-tax client the entire payment-basis machinery is starved from day one`
- `the 'uncounted movement' visibility (23e:466-487) covers untagged/mismatched-tag/unknown-treatment legs on 460/461 only — a correctly tagged but unanchored invoice is silently counted on the wrong basis`

**What is wrong / missing** — SST-02 drafts for service-tax registrants declare output tax in the wrong taxable period as a systematic matter — early declaration on unpaid invoices ('early, never late', i.e. a cash-flow/timing misdeclaration rather than under-declaration), no 12-month-trigger tracking, no bad-debt relief candidates. The only surface is one generic assumptions line buried among ~11 boilerplate notes; no per-invoice detection exists and nothing in the product can create the anchors the note prescribes — a statutory-compliance defect flowing directly from the dead AR chain. (ADJUSTED from the draft: 'zero surfaced warning' overstated the invisibility; 'silently' softened to note the generic honesty-layer line.)

**What the rebuild must do** — db/v2/23e-fns-sst.sql + db/v2/23-fns-subledger.sql (missing anchor writers in workflows)

### `F3-10` · **MEDIUM** · Carry-down document provenance step is broken as written: client-onboarding instructs ingest_document(kind='management_account') but the documents.kind CHECK only allows transaction_source/sample_invoice
*Hero-prompt item: (g) Opening/carry-down*

**Evidence**
- `belcort/client-onboarding/SKILL.md:218-219 — 'then ingest_document (kind='management_account', financial_date = the statement's period end)'`
- `db/v2/10-tables-core.sql:77-79 — «dead 'management_account'/'export' kinds are dropped (Track 0c)»; CHECK (kind in ('transaction_source','sample_invoice'))`
- `db/v2/22-fns-documents-recon.sql:223-232 — ingest_document inserts p->>'kind' verbatim, so the call raises a raw 23514 check violation`

**What is wrong / missing** — The MA/aged-listing source document that anchors the ISA-510 opening position cannot be indexed as instructed: the model either fails the step, mislabels the doc as transaction_source, or skips indexing — leaving the carry-down without its provenance anchor.

**What the rebuild must do** — belcort/client-onboarding/SKILL.md:218-219 vs db/v2/10-tables-core.sql:79

### `F3-11` · **MEDIUM** · KB/memory learning is prompt-only end-to-end: evidence tally, recon hints, memory notes and the chat-mediated self-reconcile learn all depend on the model remembering skill text, over a lossy wake transport — only rule DECAY is structural
*Hero-prompt item: (j) KB/memory*

**Evidence**
- `belcort/coa-coding/SKILL.md:275-288 — Step-6 record_kb_evidence for auto_draft entries is a skill instruction; nothing in draft_entry/finalize_coding/approve_entry records evidence in the DB`
- `belcort/kb-evolve/SKILL.md:306-325 — the doctrine itself documents the gap: a chat-mediated match is stamped actor='agent', the teach-wake deliberately does NOT fire (db/v2/25-fns-ops.sql:1526-1548 fences on actor is distinct from 'agent'), and the model must self-record record_kb_evidence + record_recon_hint inline — pure prompt discipline`
- `db/v2/25-fns-ops.sql:1415-1460 — belcort_proactive_emit is exception-wrapped so webhook failures are swallowed (:1453-1456, books writes never abort); the harness records wake ingress as best-effort/lossy — a dropped wake permanently loses the lesson`
- `agent/src/runtime/inject.ts:41,82 — the wake note says 'you may record evidence' (permission, not enforcement); the workbench-kb tool policy (agent/src/tools/buildTools.ts:21) correctly CAPS the lane to evidence+hint+notify but cannot compel any call`
- `structural exception (verified): human reject/edit-away decays the cited rule INSIDE the DB fns — db/v2/20-fns-journal.sql:259,345 call app.decay_rule_on_override; db/v2/21-fns-kb.sql:130-162 (internal, revoked from callers, auto-retire at 3 overrides)`
- `belcort/AGENTS.md:74 — record_memory_note duties ('RECORD when … reveals a DURABLE client fact') are prompt text; db/v2/27-fns-memory.sql:18-26 takes actor from the payload with no via_fn/actor constraint compelling the write`

**What is wrong / missing** — A workflow that reveals a durable client rule/alias/treatment updates the KB only if (1) the wake webhook fired and was delivered, (2) the model chose to act on the note, or (3) the model remembered the inline chat-learn step — three prompt/transport hops with no receipt or reconciliation sweep; skipped lessons are invisible and the KB silently under-learns (the exact zero-rules-after-12-approvals class the doctrine says PR #13 fixed by prompt).

**What the rebuild must do** — belcort/kb-evolve/SKILL.md + db/v2/25-fns-ops.sql wake emitters + agent/src/runtime/inject.ts

### `F3-9` · **MEDIUM** · The coding-time SST output leg is prompt-only and a MISSING leg is invisible: no DB constraint requires a tax leg on a taxable revenue entry, and compute_sst_return can only scan legs that exist; the return additionally keys on literal account codes 460-000/461-000
*Hero-prompt item: (i) Tax/SST*

**Evidence**
- `belcort/coa-coding/SKILL.md:174-229 — the entire mandatory hybrid SST ladder (post 461/460 leg, tag tax_code) is skill text; the model may skip it`
- `db/v2/20-fns-journal.sql:83-160 — draft_entry/finalize_coding validate firm scope, kb-rule citation, balance-trigger arming and status/risk binding only; no tax-leg check for sst_regime clients`
- `db/v2/23e-fns-sst.sql:195,249,370,475 — the return counts only existing legs on literal '460-000'/'461-000' (the uncounted-movement scan at :475 also only inspects those two codes), so a skipped leg or a re-keyed SST-payable account produces a silently understated/empty return`
- `docs/architecture/backend.md:63 — the ≤5¢/tax-leg gating lives in the dashboard review surfaces (UI contract, je-balance-tax-leg.md), not the DB`
- `structural mitigations that DO exist: compute_sst_leg is a DB compute tool (agent/src/tools/registry/journal.ts:149-165) and coa-coding routes computed legs to needs_review — but only if the model follows the text`

**What is wrong / missing** — A model that omits the output-tax leg on a taxable sale posts a balanced, gate-passing entry whose tax never reaches the SST-02; nothing downstream can detect absence. PROMPT-ONLY.

**What the rebuild must do** — belcort/coa-coding/SKILL.md Step 5 + db/v2/20-fns-journal.sql + db/v2/23e-fns-sst.sql

#### Verified as sound (workstream F)

- (g) Opening/carry-down side-effect completeness is structural ONCE INVOKED: seed_opening_carry_forward atomically posts per-item opening journals, attaches AR/AP open items by reusing record_ar_invoice/record_ap_bill, registers FA via record_fixed_asset AND seeds a fa_depreciation BASELINE row so run_depreciation continues from NBV, plugs OBE and asserts it nets to zero (fail-loud), and writes the financial-position snapshot; invocation is prompt-driven but gated by a mandatory human [[carrydown]] approval card  ·  _evidence:_ `db/v2/25b-fns-opening.sql:18-27 (header: subledger attach REUSES record_ar_invoice/record_ap_bill/record_fixed_asset; baseline row), :64 (record_ar_invoice call), :105 (record_ap_bill), :168 (record_fixed_asset), :182-185 (fa_depreciation baseline insert), :256-260 (opening_carry_forward_unbalanced fail-loud) + :280-284 (opening_balance_equity_not_nil assertion over opening entries); belcort/client-onboarding/SKILL.md:230-258 (payload contract: gl_lines exclude controls; per-item ar/ap/fa), :304-314 (mandatory [[carrydown]] clarify gate before the call); agent/test/registry.test.ts:44-45,89-99 (seed_opening_carry_forward IS a registered tool, firm_or_client scoped)`
- (h) SOFP/financial statements on the governed lanes are DB-owned reads only: build_export fetches client_financial_statements/client_trial_balance/client_general_ledger/aging/get_sst_return via ctx.rpc inside the tool — the model supplies scope/fy/format, never a figure; the analysis lane runs model-authored read-only SELECTs but prints DB cells verbatim with a provenance page; year-end-close's MA pack is one build_export call  ·  _evidence:_ `agent/src/tools/exportTool.ts:286-371 (every scope's data from ctx.rpc/ctx.query; sst_return reads the persisted draft and errors loudly when none exists at :350-351); agent/src/tools/analysisTool.ts:1-12 ('a figure NEVER passes through the model's text: Clara supplies the SQL, Postgres computes every number' + the provenance page); belcort/year-end-close/SKILL.md:136-149 (Step 3 is one build_export(scope='management_accounts') call; no hand-built statements); residual (prompt-only, low): chat prose figures and the model-authored analysis SQL/headings rest on doctrine text (AGENTS.md §2/§15), not structure`
- (e-partial) When run_depreciation IS called, the figure is structurally DB-owned: cumulative-target model, whole-month proration, per-asset row locks (FOR UPDATE), idempotent per (asset, period) via the overlap-skip check with the fa_depreciation unique(asset_id, period_start, period_end) constraint as backstop, one balanced approved journal — the model cannot inject an amount  ·  _evidence:_ `db/v2/23b-fns-fixed-assets.sql:131-230 (engine: FOR UPDATE at :167, overlap-skip at :169-173, cumulative target at :180-192, balanced journal at :205-218); db/v2/19b-tables-fixed-assets.sql:96 (unique (asset_id, period_start, period_end)); agent/src/tools/registry/fixedAssets.ts:36-58 (tool params carry no amount; actor layer-injected)`
- (f-partial) dispose_fixed_asset's accounting is structural (DB owns NBV and gain/loss; compound journal; register retire; reverse-not-delete) and a human-initiated invocation path exists on the dashboard FA register (agent-routed intent + admin+ deterministic rpc fallback)  ·  _evidence:_ `db/v2/23b-fns-fixed-assets.sql:242-340 (NBV/gain-loss at :277-279; compound journal :296-326; retire :328-330; gain/loss account required :289-290); dashboard/components/books/FaRegister.tsx:6-8,60-64; dashboard/lib/fa.ts:102-129`
- (j-partial) KB rule decay on human override is STRUCTURAL: reject_entry and edit-away-from-rule call app.decay_rule_on_override inside the DB fns (internal, revoked from callers), with auto-retire at 3 overrides — no prompt dependence; likewise the teach-WAKE TRIGGERS themselves (trg_pn_workbench/trg_pn_bank_match/trg_pn_doc_triage) fire structurally on human verbs  ·  _evidence:_ `db/v2/20-fns-journal.sql:259,345 (decay calls inside reject/edit); db/v2/21-fns-kb.sql:130-162 (sole decay writer, revoked, threshold 3 auto-retire); db/v2/25-fns-ops.sql:1526-1548 (human-verb wake triggers, actor-is-distinct-from-'agent' fences)`
- (c-partial) The bank-reconciliation tie-out math itself is structural: close_reconciliation computes book balance, deposits-in-transit, unpresented payments and difference in the DB and never forces a balance; match_bank_line writes line+entry recon fields atomically with actor stamping  ·  _evidence:_ `db/v2/22-fns-documents-recon.sql:458 (match_bank_line), :688 (close_reconciliation computes everything); belcort/bank-recon/SKILL.md:111-129 (skill defers all math to the fn — 'The DB owns the entire tie-out')`
- (i-partial) The SST leg AMOUNT, when the model does post one, comes from the DB (compute_sst_leg, effective-dated tax_rates) and the return computation itself (compute_sst_return / compute_tax_draft) is correctly kept OFF the agent surface and human-driven from the dashboard (bookkeeper+ UI), with the agent export reading only the persisted draft  ·  _evidence:_ `db/v2/20-fns-journal.sql:42-73 (compute_sst_leg, effective-dated); agent/src/tools/registry/journal.ts:149-165 (compute tool, cls='compute'); dashboard/lib/sstReturn.ts:128-137 and dashboard/lib/taxComp.ts:91-107 (dashboard-direct compute, bookkeeper+ UI gate); agent/test/registry.test.ts:28-53 (compute_sst_return/compute_tax_draft not agent tools); agent/src/tools/exportTool.ts:347-354 (export reads get_sst_return only)`

#### Unverified (workstream F) — could not be confirmed from frozen evidence; carried as open

- The audit brief could not be read by the drafting agent OR this verifier: <repo>/undefined/audit-brief.md does not exist on disk (Glob for **/audit-brief.md across the repo returns nothing), and only maps/db-map.md of the named evidence maps is present under undefined/. Verification proceeded on the workstream spec verbatim: repo treated as read-only evidence, writes only under undefined/, file:line evidence re-opened for every finding, severity rubric applied by impact (critical = wrong client-facing figures/statutory output or ungated wrong posting; high = silent books/register corruption or broken control; medium = fail-visible or bounded).
- F3-7 (post-close tie-out doubling) is established by static construction from the SQL — independently re-derived by this verifier (v_open_date = v_end + 1 at 25-fns-ops.sql:406; the closing entry sweeps nominal accounts only, so real accounts are never zeroed and the opening entry duplicates them in a raw sum; _tie_out_core/fa_control_tie_out have no entry_kind filter; the test-coverage disjointness was verified by grep). Neither the drafting agent nor this verifier executed the ephemeral rig to demonstrate the doubled figure empirically.
- Classification PROMPT-ONLY vs ABSENT is structural (what the model CAN skip / what no workflow invokes); no empirical measurement of how often the live model actually skips prompt-only steps (e.g. the coa-coding Step-6 evidence tally or the SST leg) was possible from the frozen repo.
- Whether the live Supabase project exactly matches the frozen db/v2 files was not verified (frozen-repo audit only; CLAUDE.md asserts the planes are in sync).
- dashboard/docs/contracts/je-balance-tax-leg.md was cited only via its summary in docs/architecture/backend.md:63; the contract file itself was not read in full by the drafter or this verifier.
- The SDT-001/SEC-001 agent_select SELECT-wrap bypass was re-verified structurally by this verifier (db/v2/26-fns-session.sql:119-141: the read-only guard is a lexical verb-scan — a `select record_ar_invoice(...)`/`select run_recurring_journals(...)` wrapper contains no banned verb and passes), so the model COULD invoke the unrouted subledger/adjustment fns via query_books despite them not being tools; whether the model ever does so in practice is unverifiable here — noted because it is the only path by which year-end-close's own instruction to 'run run_recurring_journals / run_amortisation' is executable at all.
- Whether the aging/full export deliverables have actually been sent to any real client is unknown (repo contains no client books; the finding is about what the shipped lanes would render).

#### Decision brief (workstream F)

> F3 verdict (adversarially verified — 11 CONFIRMED, 1 ADJUSTED, 0 REFUTED): COA coding is a self-contained journal loop; almost every accounting side-effect beyond the journal is either absent or resting on prompt text. Per chain: (a) AR — FAIL/ABSENT: record_ar_invoice (db/v2/23-fns-subledger.sql:83) has zero callers in the agent tool registry (agent/test/registry.test.ts:28-61 freezes the surface without it), zero mentions in the 11 routed skills, and the dashboard AR surface is read-only — the subledger dies at the onboarding seed while every coded invoice moves the GL control. (b) AP — FAIL/ABSENT, identical. (c) Settlement — FAIL/ABSENT and actively dangerous: bank-recon's matcher can only match entries with bank legs, so a customer receipt is classified 'bank-only' and handed to coa-coding, which has no settlement branch — a confirmed customer KB rule can AUTO-POST Dr Bank/Cr Revenue (double-count) into the ungated auto_draft lane, and the kb-evolve learning loop actively creates exactly those narration→customer→revenue mappings; allocations never happen; no unallocated-task surface exists. (d) FA acquisition — FAIL: the tool exists but is doctrine-orphaned (AGENTS.md §15 omits the FA trio; §8 forbids acting from tool descriptions; no skill and no dashboard writer; compute_tax_draft's CA schedule reads the register, so unregistered assets silently drop out of the tax comp). (e) Depreciation — FAIL: the engine is exemplary DB-owned math, but nothing invokes or gates it — adjustments_status and the close's pending_adjustments cover only recurring+amortisation, the year-end-close skill's Step-0 gate omits depreciation, and manual depreciation journals bypassing the register are unblocked. (f) Disposal — PROMPT-ONLY: structural fn + human dashboard intent path, but no workflow linkage from coded proceeds to disposal, and reverse_entry permits reversing FA/AR/AP anchors (close-kind + amortisation-only guards) while its own comment leans on the tie-outs for visibility. (g) Carry-down — the one genuinely well-built chain: seed_opening_carry_forward is atomic, subledger-complete (reuses the real writers + dep baseline), OBE-asserted and human-gated — PASS structurally once invoked; two defects: the skill instructs a dead ingest_document kind ('management_account' fails the CHECK), and — the sleeper bug — the close's opening entry (posted at period_end+1, duplicating every real balance the closing entry never zeroes) plus filterless tie-outs makes EVERY AR/AP/FA control tie-out report false, growing phantom drift after the first year-end close (interaction verified untested: the subledger/FA tests never close, the close test never ties out), destroying the only drift-visibility layer the whole design leans on — _trial_balance_core:69 proves the hazard was known and handled elsewhere. (h) SOFP/FS — PASS structurally on the governed lanes (build_export/analysis read DB fns internally; figures never transit model text). (i) Tax/SST — the leg amount and return engines are DB-owned and the return is correctly human-driven from the dashboard, but the coding-time leg is prompt-only with missing legs undetectable, the return keys on literal 460/461 codes, and — consequentially — service tax declares on the ACCRUAL basis because the payment-basis model is starved of the AR anchors no workflow creates: a statutory timing defect flowing directly from (a)/(c), surfaced only as one generic boilerplate assumption line (23e:706) whose prescribed fix (record_ar_invoice) is unreachable — ADJUSTED from 'zero surfaced warning', and note the DB itself documents the degradation as 'early, never late'. (j) KB/memory — PROMPT-ONLY over a lossy wake transport (emitters swallow failures; chat-mediated matches deliberately suppress the teach-wake and rely on model self-discipline); only rule decay and the wake triggers themselves are structural. Root cause (F3-12): three-way drift between the DB fn surface, the agent registry, and the doctrine canon — including a doctrine-promised tool (unmatch_bank_line — the DB fn exists at 22:522, the registry entry does not) whose invocation would hard-fail a run, and skills instructing fns (run_recurring_journals/run_amortisation) that have NO executable surface anywhere (not agent tools, no dashboard caller). Rebuild implication: the Track-1 DB engines (subledger, FA, adjustments, tax, SST, carry-down) are PORT-grade assets; the binding of workflows to them is the missing product — the greenfield target's per-mutation-class policy and workflow binding should make each side-effect either a structural co-commit (journal + subledger row in one governed transaction) or a DB-gated block/surface, never skill prose; and the tie-out fns need the same close-machinery exclusion _trial_balance_core already has, plus close-cross tests.

---

## Workstream G — Agent runtime — statefulness, resumability, sync

### `Grt-1` · **HIGH** · All run, clarification, and interruption state lives in one process-local in-memory Map; nothing durable survives a restart
*Hero-prompt item: G1 / G7*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:136 declares: private readonly runs = new Map<string, RunRecord>()`
- `runtime.ts:80-99 RunRecord holds context, input, status, output, sessionId, and pending {clarifyId, question, choices, resolve} where the clarify resolver is an in-memory Promise callback (line 98)`
- `runtime.ts:484-495 evictRuns() deletes runs by TTL; no code path persists any RunRecord field to the DB`
- `db/v2 full 'create table' survey: only chat_sessions/chat_messages (16-tables-session.sql) and jobs (14-tables-ops.sql:98) exist as agent-adjacent state; NO tasks/runs/parts/interruptions/tool-calls/checkpoints/wakes tables anywhere in db/v2`
- `deploy/fly.toml:8-15 single always-on machine by design ('--ha=false ... ONE always-on machine (in-memory run state + SSE — split-brain otherwise)'; 'ALWAYS-ON ... pending clarify prompts — auto-stop would drop them'); :37-39 auto_stop_machines=off, auto_start_machines=false, min_machines_running=1`

**What is wrong / missing** — A Fly restart/redeploy (single always-on machine, deploy/fly.toml) destroys the entire runs Map: every in-flight run, parked clarification, approval interruption, selected skill, retrieved context, pending tool call and output is lost with no recovery.

**What the rebuild must do** — Rebuild must persist run/task state, interruptions, and pending tool calls in the DB (durable runtime) so a redeploy resumes rather than drops work.

### `Grt-13` · **HIGH** · No post-workflow sync phase; derived outcomes (notifications, memory notes, recon hints, KB proposals) are model-remembered, not structural
*Hero-prompt item: G6*

**Evidence**
- `no reconciliation step exists after a run settles: runtime.ts:258-260 settles status + fires the best-effort assistant persist and nothing else; outcomes are only whatever fns the model called during the run`
- `record_proactive_notification (registry/ops.ts:109), record_memory_note + add_counterparty_alias (registry/kb.ts:119,132), record_recon_hint (registry/documents.ts:213) are ordinary tools invoked only if the model chooses; buildTools.ts:98-105 execute just policy-checks, scope-checks, injects the actor and rpc's the fn`
- the DB owns posted numbers structurally (the audited write fn IS the sync), but nothing verifies the full derived-outcome set was recorded after a workflow

**What is wrong / missing** — After a workflow, whether a stuck item gets a notification, a learned pattern gets a memory note, or a match gets a recon hint depends on the model remembering to call the tool; a forgotten call silently leaves the outcome un-synced with no structural backstop.

**What the rebuild must do** — Rebuild must add a structural post-workflow outcome-sync/reconciliation so derived writes (notifications, KB proposals, recon hints, memory notes, export receipts) are guaranteed, not model-discretionary.

### `Grt-6` · **HIGH** · Durable-vs-process-local inventory: only the user turn, final assistant text, active_run_id pointer, and bulk-approve job survive restart; everything agentic is process-local
*Hero-prompt item: G7*

**Evidence**
- `Process-local (lost): RunRecord incl. pending clarify Promise/resolve (runtime.ts:98, 242-246), approval interruptions/RunState (runtime.ts:236-256), selected skill + retrieved context + pending tool calls/outputs (inside the SDK run, never externalized), wake runs (runtime.ts:370-372)`
- `Durable: user message pre-run (server.ts:355-358), assistant final text best-effort at settle (runtime.ts:285-292), active_run_id (26-fns-session.sql:71-80), bulk-approve remaining array in jobs.payload (bulkApproveRunner.ts:110-113, 171-178)`
- `Trace IDs and wake-retry state: none persisted; wakeGate windows are unref'd in-memory timers (http/wakeGate.ts:66-73) and shutdown calls wakeGate.clearPending() which drops them WITHOUT firing (main.ts:236; wakeGate.ts:131-136)`

**What is wrong / missing** — Of pending runs, clarifications, approvals, selected skill, active scope, retrieved context, pending tool calls, tool outputs, trace IDs, and wake/retry state, essentially only the persisted transcript text and the durable job survive; the entire agentic working set is volatile.

**What the rebuild must do** — Rebuild must move the full workflow working set into durable DB state (runs, clarifications, approvals, tool calls/outputs, retrieved context, wake/retry state, trace IDs).

### `Grt-7` · **HIGH** · A mid-interview redeploy loses the entire clarify interview with no resume path; the 15-minute reset wedge applies only to a same-process dead run, not to a restart
*Hero-prompt item: G7*

**Evidence**
- `runtime.ts:242-246 the clarify answer is awaited on an in-memory Promise held only in rec.pending; the onboarding interview is one long-lived paused run (runtime.ts:3-6: 'the streamRun generator SUSPENDS on a clarify ... which is why a blocking clarify needs a long-lived process')`
- `server.ts:367-369 set_active_run persists only the runId pointer to the session; the run itself is memory-only`
- `server.ts:422-428 reset is refused 409 run_in_flight ONLY while pollRun reports status 'running' and age < 15 min; after a restart the runs Map is empty and pollRun on the unknown runId returns {status:'failed'} (runtime.ts:326-328), so reset is immediately allowed — the wedge scenario is a SAME-process run stuck 'running' (e.g. never-streamed after POST /chat), which the 15-min age-out eventually frees`

**What is wrong / missing** — Redeploying during an onboarding/carry-down interview drops every answered question with no client created and no way to resume — the user starts the whole interview over. (The draft's claim that the redeploy also wedges reset for up to 15 minutes is wrong: post-restart the poll reads failed and reset proceeds immediately; the 15-minute guard only wedges a same-process dead-but-'running' run.)

**What the rebuild must do** — Rebuild must persist clarification state and resume the interview after restart; the reset guard must key on durable run records, not an in-memory liveness poll.

### `Grt-11` · **MEDIUM** · Bulk-approve restart re-drive can inflate the failed count and settle a job FAILED; re-drive fires only on a user surface (SSE reconnect or a new bulk start), never self-driven
*Hero-prompt item: G7 / G6*

**Evidence**
- `bulkApproveRunner.ts:100 remaining.shift() removes the id locally BEFORE the approve; :110-113 advance_job persists the shifted remaining AFTER the approve — a crash between the approve_entry commit (:104) and advance_job leaves the already-approved id in the DB payload's remaining`
- `on resume approve_entry raises cannot_approve:approved (db/v2/20-fns-journal.sql:190-191); bulkApproveRunner.ts:106-109 counts that raise as a per-entry failure; :123-126 any partial failure settles the job FAILED (deliberate relay contract per the comment)`
- `resumeOpen is invoked from exactly two user-triggered surfaces: the notifications SSE subscribe (server.ts:308-310) and the start() of any NEW bulk job (bulkApproveRunner.ts:166); an orphaned job with neither event never re-drives (the header :10-13 documents automatic restart re-drive as a deferral)`

**What is wrong / missing** — No double-post (the DB status gate blocks it), but a restart-window re-approve is miscounted as failed and can flip a genuinely successful bulk job to a red FAILED; an orphaned job resumes only when the same user reconnects the notifications stream or starts another bulk job.

**What the rebuild must do** — Rebuild must make restart re-drive idempotent (treat already-approved as success) and drive it from durable job state, not a user-triggered surface.

### `Grt-12` · **MEDIUM** · Wake runs are process-local and best-effort; an in-flight wake or a batching window is dropped on restart
*Hero-prompt item: G7*

**Evidence**
- `runtime.ts:370-372 a dispatched wake is stored in the same in-memory runs Map and drained fire-and-forget with no consumer (drainWake :445-468 deletes the record at settle)`
- `http/wakeGate.ts:66-73 pending windows are unref'd setTimeout handles ('a pending hint never holds the process open'); main.ts:236 shutdown calls wakeGate.clearPending() which drops every open window WITHOUT firing (wakeGate.ts:131-136, 'at-most-once hints')`
- `server.ts:204 an unconfigured deployment answers 202 dispatched:false; :229 a rate-limited submit drops with 202 rate_limited; no durable wake queue exists (db/v2 table survey)`

**What is wrong / missing** — A restart mid-wake, or during an open batching window, loses the wake entirely; wakes are at-most-once hints recoverable only from the notification/needs-attention read surfaces, so a burst lost at redeploy silently skips proactive processing.

**What the rebuild must do** — Rebuild needs a durable wake/queue with per-mutation policy and retry, not unref'd in-memory timers cleared on shutdown.

### `Grt-14` · **MEDIUM** · The only structural, model-independent sync is the deterministic je_needs_human notification; the rest of the interactive lane is fully model-driven
*Hero-prompt item: G6*

**Evidence**
- `runtime.ts:383-442 recordDeterministicProactive reads journal_entry_detail and records the audited notification WITHOUT the model, but the gate at :388 fires only for kind='proactive' AND condition='je_needs_human' AND table='journal_entries'`
- `all other wake kinds and the entire interactive lane fall through to the model loop (runtime.ts:370-372; inject.ts:87-96 buildWakeNote is prompt framing, not enforcement)`
- `export receipts are structural (exportTool.ts:166-219 always records record_export + record_export_artifact before returning); record_kb_evidence auto-files a kb_proposals row at threshold 3 in-DB (db/v2/21-fns-kb.sql:165-211); these are the exceptions, not the rule`

**What is wrong / missing** — Structural sync exists only for a narrow deterministic notification path and a few always-run tool internals; there is no general guarantee that an interactive workflow's outcomes are synced back through the audited fns.

**What the rebuild must do** — Generalize the deterministic-sync pattern in the rebuild so outcome recording is structural across all workflow types, not just je_needs_human.

### `Grt-15` · **MEDIUM** · Assistant-turn persistence is best-effort after settle and can silently drop, desyncing the durable transcript from what the user saw
*Hero-prompt item: G6 / G7*

**Evidence**
- `runtime.ts:285-292 settleInteractive is fire-and-forget: void this.persistAssistant(...).catch(console.error); a persist failure is logged, never retried (the opts doc :116-119 says so explicitly)`
- `main.ts:171-177 a clarify-length run can outlive the caller's ~1h JWT; the settle append 401s, logs '[chat] transcript gap: caller JWT expired before settle', and rethrows into the log-only catch — the assistant turn is lost`
- `main.ts:164-170 the mid-run reset (TOCTOU) branch re-homes the reply to the fresh session, but the JWT-expiry branch has no such recovery (the durable fix is a recorded deferral per the comment)`

**What is wrong / missing** — The assistant reply the user watched stream live can be absent from the durable transcript on reload (JWT expiry on a long clarify run), so the persisted history and the DB outcomes diverge from the actual conversation.

**What the rebuild must do** — Rebuild must persist assistant turns durably within the run's own credential/transaction (e.g. a placeholder row reserved pre-run, or a refreshed credential on clarify) so the transcript never silently loses a delivered turn.

### `Grt-2` · **MEDIUM** · Cross-turn memory is cold transcript replay, not resumed agent state; each chat POST is a stateless run over re-folded history
*Hero-prompt item: G1*

**Evidence**
- `runtime.ts:60-78 buildRunInput folds prior turns into the SDK input; the comment says each chat POST is otherwise a COLD run on the new message alone with zero memory of earlier turns (the DB transcript persisted only for UI hydration)`
- `agent/src/http/sessions.ts:253-270 loadHistory returns the last ≤40 turns as role/content text (assistant turns de-fenced) that http/server.ts:355-366 passes into startRun; the model re-reads the transcript every turn`
- `runtime.ts:161-173 agentFor() builds one cached SDK Agent per tool policy; instructions are the static doctrine string; no planner, no plan object, no persisted agent state`

**What is wrong / missing** — Within one run the SDK provides a genuine tool loop (and RunState carries the input across a clarify suspend/resume), but there is no durable agent state, no planning artifact, and nothing carried between turns except replayed message text; statefulness is an illusion produced by re-prompting.

**What the rebuild must do** — Rebuild needs first-class durable run state plus fresh context packs so continuity is structural, not reconstructed by string-folding the transcript each turn.

### `Grt-3` · **MEDIUM** · No tracing/observability in the system's own surfaces: no trace IDs or spans threaded or persisted; the durable tool_calls column is never written
*Hero-prompt item: G1 / G7*

**Evidence**
- `grep of agent/src for tool_calls returns zero matches (re-verified this pass); the column at db/v2/16-tables-session.sql:51 (labelled 'the reasoning-trail steps (cap 3), durable on reload') is never populated`
- `sessions.ts:163-175 appendUser/appendAssistant send only session_id, role, content, scope_client_id to append_chat_message; 26-fns-session.sql:62-64 therefore stores NULL for tool_calls and artifact`
- `grep of agent/src for trace/otel/opentelemetry/span returns zero observability hits (only spreadsheet-cell and OCR-table 'span' fields); no OpenTelemetry, no span, no persisted trace id`
- `observability is console.error/console.info only; the runId does appear in SOME failure logs ('[chat] run <id> failed' runtime.ts:268, '[wake] run <id> ...' runtime.ts:449,455) but is never threaded into DB writes, tool calls, or success paths`

**What is wrong / missing** — There is no way to trace a run end-to-end through BELCORT's own surfaces (logs are partial, DB has nothing); the reasoning trail streams to the UI live (events.ts) but is never persisted, so a reloaded transcript loses all tool-step history. (Whether the Agents SDK's default platform-side tracing exports anything to the OpenAI dashboard was out of scope and does not change the in-system gap.)

**What the rebuild must do** — Rebuild must persist typed tool calls/outputs and emit trace IDs/spans; the reserved durable columns must actually be written.

### `Grt-4` · **MEDIUM** · No guardrails layer; the Agents SDK input/output guardrail feature is unused; safety rests on tool-layer scope/policy plus DB RLS plus prompt fencing
*Hero-prompt item: G1*

**Evidence**
- `grep of agent/src for guardrail returns zero matches (re-verified this pass)`
- `the only structural gates are the tool-layer policy filter + write-gate + actor inject (buildTools.ts:19-33, 54-107) and per-turn prompt fencing of untrusted DATA (runtime/inject.ts:1-23)`
- `agent_select read tool is lexically-guarded only (db/v2/26-fns-session.sql:119-141 — regex anchors + verb scan at 130-135); a SELECT-wrapped SECURITY DEFINER call passes the lexical guard (the documented SDT-001/SEC-001 mutation-bypass path)`

**What is wrong / missing** — Nothing validates model inputs/outputs at the runtime boundary; a malformed or adversarial tool argument is caught only by the DB fn raises, and prompt-injected instructions in OCR/DB text are mitigated only by text fencing.

**What the rebuild must do** — Rebuild should add an explicit guardrail stage (input plus output plus tool-arg validation) instead of relying solely on prompt fencing and DB raises.

### `Grt-5` · **MEDIUM** · Error recovery is thin and the clarify loop depends on a brittle prompt nudge to keep the model from ending a run
*Hero-prompt item: G1*

**Evidence**
- `runtime.ts:261-269 a run failure just settles failed and yields an error; no retry, no resume, no compensation`
- `openai/tools.ts:54-64 the clarify tool result injects a long [flow-control] instruction because a plain assistant reply ENDS the run ('a plain reply ends the run and aborts onboarding with NO client created'); the comment records the observed failure ('onboarding asks 1-2 Qs then completes on an empty/"Noted" message')`
- `runtime.ts:33-39 MAX_TURNS=40 was raised from the SDK default 10 because a legitimate onboarding aborts at the wrap-up with 'Max turns (10) exceeded'`

**What is wrong / missing** — Multi-question flows rely on the model obeying a prompt to keep calling clarify; one stray plain reply ends the run mid-interview with no client created, and there is no structural recovery, only re-ask from scratch.

**What the rebuild must do** — Rebuild must make multi-step flows structurally resumable/checkpointed rather than prompt-coerced, with real retry/compensation on failure.

### `Grt-9` · **MEDIUM** · The reserved durable tool_calls and artifact columns are never written; reasoning trail and native cards are not durable
*Hero-prompt item: G7*

**Evidence**
- `db/v2/16-tables-session.sql:51-52 columns tool_calls jsonb ('the reasoning-trail steps (cap 3), durable on reload') and artifact jsonb ('a native typed card payload')`
- `sessions.ts:163-175 appendUser/appendAssistant pass only role/content/scope; append_chat_message (26-fns-session.sql:62-64) inserts p->'tool_calls' and p->'artifact', which are absent from every caller — both store NULL`
- `sessions.ts:229-249 on read, the artifact is re-derived by regex fence extraction (extractFencedArtifact) precisely because the column is empty ('unless a native artifact column is populated (it wins)')`

**What is wrong / missing** — The schema advertises durable typed tool/card history but the runtime never populates it; a reloaded transcript reconstructs cards from fenced prose and loses the reasoning trail entirely.

**What the rebuild must do** — Rebuild must actually persist typed tool-call and artifact history, retiring the fence-regex reconstruction.

### `Grt-10` · **LOW** · Native artifact/directive runtime events are dead code; the retire-the-fenced-block-regex design is unrealized
*Hero-prompt item: G7 / G1*

**Evidence**
- `runtime/types.ts:130,132 define RuntimeEvent kinds 'artifact' and 'directive'; runtime/sse.ts:47-53 maps both to SSE frames`
- `grep of agent/src for kind:'artifact' / kind:'directive' returns ONLY the type definitions; mapStreamEvent (events.ts:38-67) only ever returns delta or tool events, and no tool emits the native kinds`
- `agent/README.md:84-86 claims 'Cards/directives are native typed tool-results (retire the fenced-block regex)', but sessions.ts:236-240 still relies on the fence regex at read`

**What is wrong / missing** — The neutral event union and SSE mapper support native cards/directives, but nothing produces them; cards still travel as fenced prose and the documented native path is aspirational.

**What the rebuild must do** — Rebuild should either implement true native typed tool-results end-to-end or drop the dead seam; do not carry an unrealized contract forward as built.

### `Grt-8` · **LOW** · active_run_id becomes a dangling pointer after restart; drop-recovery reads the dead run as failed with no resume (self-heals on the next message)
*Hero-prompt item: G7*

**Evidence**
- `26-fns-session.sql:71-80 set_active_run durably stores the runId on chat_sessions`
- `runtime.ts:210-216 streamRun on an unknown runId yields kind:'error' 'unknown run'; runtime.ts:324-328 pollRun on an unknown run returns {status:'failed'}`
- `server.ts:340-370 a new POST /chat simply starts a fresh run and overwrites active_run_id via setActiveRun — the user is NOT forced to reset (and reset is not blocked, see Grt-7); the stale pointer costs one misreported 'failed' poll and the lost work is the Grt-7 finding`

**What is wrong / missing** — After a restart the session still points at a runId absent from memory; the UI drop-recovery poll misreports the interrupted run as failed and nothing can resume it. Severity is low because the pointer self-heals on the next message and the substantive loss (the interview) is captured in Grt-7.

**What the rebuild must do** — Rebuild must tie active_run_id to durable run records so a reconnect resumes the real run instead of reading a tombstone.

#### Verified as sound (workstream G)

- Run ops are correctly firm-bound: streamRun/resolveClarify/pollRun reject a runId minted by another firm (WIRE-03), reading as an unknown run with no existence leak.  ·  _evidence:_ `runtime.ts:210-216 (streamRun firm check → 'unknown run'); runtime.ts:301-308 (resolveClarify checks rec.context.caller.firmId !== req.caller.firmId → same error as no-pending-clarify); runtime.ts:324-328 (pollRun firm mismatch → {status:'failed'})`
- Within the same process, a reconnect after settle REPLAYS the terminal outcome instead of re-running the loop, and a concurrent second attach is refused, so tools are not double-executed and the assistant turn is not double-persisted on same-process reattach.  ·  _evidence:_ `runtime.ts:217-228 (status !== 'running' replays done/'run already settled'; rec.streaming guard yields 'stream already attached')`
- The user turn is persisted BEFORE the run starts, so a run that dies immediately does not leave a ghost run with no transcript record; a store failure fails the request honestly.  ·  _evidence:_ `server.ts:355-358 (await sessions.appendUser precedes runtime.startRun); server.ts:23-27 (header: 'persists the user turn BEFORE the run (a store failure fails the request honestly — no ghost runs)')`
- Resume cannot double-post a journal entry: approve_entry has a hard status gate rejecting any entry not in (auto_draft, needs_review, needs_decision), so a re-approve of an already-approved entry raises rather than posting twice.  ·  _evidence:_ `db/v2/20-fns-journal.sql:187-191 (SELECT ... FOR UPDATE then raise cannot_approve:% for any other status); db/v2/20-fns-journal.sql:207 (the approved update runs only past the gate)`
- The wake credential rides the same anon-key plus JWT RLS plane as a human caller (never service_role on the request path), scoped to exactly the webhook firm; wakes stay honestly dispatched:false when the mint secret is absent.  ·  _evidence:_ `runtime/wakeCredential.ts:56-89 (role:'authenticated', firm_id claim, synthetic sub, aud 'belcort-wake'); runtime.ts:347-349 (no minter → {dispatched:false}); main.ts:133-138 (minter only when SUPABASE_JWT_SECRET present)`

#### Unverified (workstream G) — could not be confirmed from frozen evidence; carried as open

- Live runtime behavior could not be exercised (no OPENAI_API_KEY / shared-DB access in this frozen repo); all runtime claims are from static code reading, not a live run.
- Whether the OpenAI Agents SDK RunState is JSON-serializable (i.e., whether durable checkpointing of an in-flight run is feasible without SDK changes) was not verified; SDK internals were out of scope. Likewise, whether the SDK's default platform-side tracing exports anything externally was not assessed — Grt-3 is scoped to BELCORT's own surfaces.
- The draft's fly CLI deployment facts (belcort-agent v51, 1 machine 080d16ef6461e8 in sin, releases v41-v51, the exit-255 telemetry error) were NOT re-executed in this verification pass; deploy/fly.toml independently confirms the single-always-on-machine design, which is what the findings rest on.
- Dashboard-side handling of live artifact/directive frames was not inspected (out of workstream); Grt-10's claim that the runtime never EMITS them is verified from the runtime side only.

#### Decision brief (workstream G)

> VERDICT (G1): Old Clara is NOT a durable, truly-stateful agent, but also not a bare chat-completions wrapper. It is a THIN, PROCESS-LOCAL orchestration shell around the OpenAI Agents SDK run() loop. WITHIN a single run it gets a real multi-turn tool loop, interruptions, and RunState from the SDK (runtime.ts:232-256). ACROSS turns it is stateless COLD replay: every /chat POST reconstructs memory by string-folding prior DB message text into the next run input (buildRunInput runtime.ts:60-78; sessions.loadHistory:253-270). No planner, no plan persistence, no in-system tracing, no guardrails. The sole source of run/clarify/interruption state is one in-memory Map<string,RunRecord> (runtime.ts:136) evicted by TTL, never persisted.
> 
> WHAT BREAKS (G7): A Fly restart/redeploy (single always-on machine by design, deploy/fly.toml:8-15,37-39) vaporizes every in-flight run, parked clarification, approval interruption, selected skill, retrieved context, pending tool call and output. Durable across restart: only the user turn (server.ts:355-358), the assistant FINAL text (best-effort at settle IF settle happens, runtime.ts:285-292), the dangling active_run_id pointer (26-fns-session.sql:71-80), and the bulk-approve job remaining[] (bulkApproveRunner.ts). Trace IDs: none. Worst case: a mid-onboarding redeploy loses the whole clarify interview with no resume. CORRECTION vs draft: the redeploy does NOT wedge reset — post-restart pollRun on the vanished run returns 'failed' (runtime.ts:326-328) so the reset guard (server.ts:422-428) passes immediately; the 15-min wedge only applies to a same-process dead-but-'running' run. NO double-post risk: the DB approve_entry status gate (20-fns-journal.sql:190-191) structurally rejects re-approve; the in-memory single-consumer/replay guards (runtime.ts:217-228) are only a same-process defense. Bulk-approve restart re-drive miscounts an already-approved id as failed and can settle a genuinely-successful job FAILED; re-drive fires only on a user surface (notifications SSE subscribe, server.ts:308-310, or a new bulk start, bulkApproveRunner.ts:166), never self-driven.
> 
> POST-WORKFLOW SYNC (G6): No sync phase. Because the DB is SoT, a posted entry IS the outcome, written structurally by the audited fn the model called mid-run. But derived outcomes (notifications, KB proposals beyond the DB threshold-3 auto-file, recon hints, memory notes) are written ONLY IF THE MODEL REMEMBERS to call the tool. The only structural model-independent sync is recordDeterministicProactive for je_needs_human (runtime.ts:383-442) plus the in-DB record_kb_evidence auto-proposal (21-fns-kb.sql:165-211); export receipts are structural (exportTool.ts:166-219 always records). Nothing reconciles that a workflow's full outcome set was recorded, and the assistant-turn persist can silently drop (main.ts:159-179, JWT expiry on a clarify-length run).
> 
> RUNTIME REQUIREMENTS THE REBUILD MUST SATISFY: (1) durable DB-backed run/task/checkpoint state survivable across redeploy; (2) durable, resumable clarification/approval interruptions (not an in-memory Promise, runtime.ts:242-246); (3) durable typed tool-call/output/artifact history (tool_calls/artifact columns exist at 16-tables-session.sql:51-52 but are NEVER written — grep tool_calls in agent/src = 0 hits); (4) trace IDs/spans threaded and persisted; (5) a real guardrails layer (grep guardrail = 0 hits); (6) structural error-recovery/retry vs the prompt flow-control nudge (openai/tools.ts:62); (7) a structural post-workflow outcome-sync so derived writes are not model-remembered; (8) restart re-drive for all durable work (idempotent — treat already-approved as success), not only bulk-approve on a user-triggered surface.
> 
> DEPLOYMENT FACTS: deploy/fly.toml independently confirms the single always-on machine design and that a redeploy is exactly the event that drops all in-process state. The draft's live fly CLI output (app v51, 1 machine, sin, checks passing, releases v41-v51) was not re-executed this pass and is carried as reported.
> 
> VERIFICATION RESULT: 15 draft findings — 11 CONFIRMED, 4 ADJUSTED (Grt-3 scope caveat on SDK-side tracing + partial runId in failure logs; Grt-7 the restart-wedge claim removed, interview loss stands at high; Grt-8 downgraded medium→low, the dangling pointer self-heals on the next message and does not force a reset; Grt-11 resumeOpen also fires on a new bulk start, not SSE-only), 0 REFUTED. All 5 fine_claims spot-verified and confirmed.

---

## Workstream G — Agent runtime — grounding, DB context, tool surface, safety

### `Ggr-1` · **CRITICAL** · query_books SELECT can invoke a SECURITY DEFINER write fn — tool-layer mutation-bypass confirmed at BOTH the TS guard and the DB guard
*Hero-prompt item: G4*

**Evidence**
- `agent/src/tools/sqlGuard.ts:57-85 — assertReadOnlySql is purely lexical: rejects ANYWHERE_VERBS ['insert','update','delete','merge','truncate','drop','alter','grant','revoke'] as whole words and STMT_START_VERBS only at a statement/CTE head. A function CALL in a SELECT target list (`select approve_entry(1,2,'x')`) contains none of these and passes; the file header (sqlGuard.ts:1-7) calls itself 'Defence-in-depth ONLY'.`
- `agent/src/tools/buildTools.ts:110-122 queryToolDef runs assertReadOnlySql then ctx.query(safe); it is pushed under EVERY policy (buildTools.ts:375), so proactive / documents / workbench-kb / interactive lanes all reach it — bypassing the buildFnToolDef enforcement core (policyAllows/WRITE_ALLOW at 28-33, enforceScope at 54-79, injectActor at 81-89) which only runs on the curated rpc path.`
- `agent/src/runtime/openai/db.ts:58-65 — ctx.query routes to rpc('agent_select',{p_sql}); the header comment (db.ts:6-9) claims agent_select is 'READ ONLY', but the fn sets NO read-only transaction and switches to NO read-only role.`
- `db/v2/26-fns-session.sql:119-141 — agent_select is `language plpgsql volatile security invoker`; its guard (129-135) rejects the same verb list plus create/copy/call, then `execute format('select ... from (%s) __q', p_sql)`. `select approve_entry(...)` matches no banned token ('call' blocks the CALL statement, not a function call), and there is only `set local statement_timeout='5s'` — no `set transaction read only` / no `default_transaction_read_only`.`
- `db/v2/20-fns-journal.sql:166,212 — approve_entry is `security definer` granted to `authenticated`; a SECURITY DEFINER fn invoked from within the SECURITY INVOKER agent_select runs with the DEFINER's rights, so the caller's EXECUTE-only-no-write-grant posture does not stop it and the write commits. reverse_entry (22-fns-documents-recon.sql:771,842), edit_entry, finalize_coding, run_depreciation, record_year_end_close are likewise definer+granted and wrappable.`
- `db/v2/90-isolation-tests.sql:277-280 — the only agent_select write-guard probes are `update`, `select 1; drop table`, and `delete`; a SELECT-wrapped definer call is never tested, so this path is unverified and unblocked in the suite.`
- `SURVIVING mitigators (verified — this narrows blast radius, keeps it critical): on the wrapped call the target fn's OWN guards still fire — app.assert_firm_owns_client (20-fns-journal.sql:178) keeps it in-firm (NOT a cross-firm leak), app.assert_can_review (00-foundation.sql:152-161) enforces bookkeeper+ (NO viewer→writer escalation), and app.audit_actor (00-foundation.sql:212-229) clamps the actor. What is bypassed is the TOOL layer: enforceScope (a same-firm non-active-scope client can be mutated) and, critically, WRITE_ALLOW — the wake credential mints firm_role:'bookkeeper' (wakeCredential.ts:72) so a proactive/workbench-kb speak-never-act wake passes assert_can_review and can invoke any granted write via a wrapped call. This is the recorded SDT-001/SEC-001 class, now confirmed to pass the DB-side guard too.`

**What is wrong / missing** — The agent's one freeform read tool is only lexically read-only at both the TS and DB layers, with no transactional or role-level read-only barrier, so it can execute any granted SECURITY DEFINER write fn wrapped in a SELECT. Firm isolation, the bookkeeper+ RBAC floor, and the audited actor survive (the DB fn's internal guards fire), but the tool-layer active-scope write-gate and the per-wake speak-never-act policy are defeated — a proactive wake or a non-active-scope-client turn can post/approve/reverse via a wrapped call the curated tool layer would have blocked, and it is untested.

**What the rebuild must do** — Make the agent read path STRUCTURALLY read-only: eliminate freeform SQL for a sufficient curated/typed read layer, or run agent SQL under a role with NO EXECUTE on any volatile/SECURITY DEFINER write fn (a read-only replica role, or EXECUTE only on the STABLE read fns) and set default_transaction_read_only. A verb-based string filter is not a security boundary. Add an isolation test asserting a SELECT-wrapped definer write is refused.

### `Ggr-2` · **HIGH** · Curated read-tool surface is insufficient — whole accounting-workflow read families exist as granted DB fns but are not tools, forcing freeform SQL
*Hero-prompt item: G4*

**Evidence**
- `agent/src/tools/registry/reads.ts — the curated READS set is exactly 9 fns: client_trial_balance, trial_balance_range, journal_entry_detail, firm_activity_feed, resolve_counterparty, auto_draft_review_batch, get_job, list_jobs, suggest_recon_counterparty.`
- `db/v2 defines and GRANTS TO authenticated many more read fns that are NOT in TOOL_REGISTRY (grants verified): ar_aging / ap_aging (23-fns-subledger.sql:530,534), ar_control_tie_out (587), customer_statement (673), fa_register (23b:385), fa_control_tie_out (23b:472), adjustments_status (23c:690), get_tax_computation (23d:483), get_sst_return (23e:843), client_general_ledger (28-fns-reads.sql:560), client_financial_statements (28:790), client_overview (28:904); also-defined (grants not each individually read): supplier_statement, ap_control_tie_out, fa_depreciation_schedule, amortisation_schedule_detail, client_trial_balance_comparative, firm_needs_attention, firm_digest.`
- `Workflows with no curated read path reach data only via query_books freeform SQL: bank-recon reads statement lines through query_books; coa-coding says 'Load the extracted JSONB data from the document table' and browse client_kb_rules/coa_accounts via query_books (belcort/coa-coding/SKILL.md:40,49-55). There is no curated read tool for AR/AP aging, statements, GL, FS, FA register, tie-outs, tax/SST computation, KB rules, or period/lock status.`

**What is wrong / missing** — An authorized read that should be a first-class, structurally-safe, individually-describable tool is instead reachable only by the model hand-writing SQL through the exact freeform surface that carries the Ggr-1 bypass and the Ggr-3 schema-guessing risk. backend.md and AGENTS §15 present the curated surface as the access path, but for AR/AP aging, statements, GL/FS, FA register, tie-outs, tax/SST, KB rules and period/lock status it is not.

**What the rebuild must do** — Provide a curated (or typed/generated) read tool for every workflow's authorized data so no workflow needs freeform SQL. Treat 'a workflow with no curated read path' as a build gate; make the read layer enumerable and mapped to the workflows that need it.

### `Ggr-7` · **HIGH** · [documents] wake lane can post/approve/reverse/depreciate/close unsupervised — permissive write BLOCKLIST + bookkeeper RBAC, narrowed only by doctrine prose
*Hero-prompt item: G10*

**Evidence**
- `agent/src/tools/buildTools.ts:19-33 — WRITE_ALLOW.documents is a BLOCKLIST: `(n) => !['create_firm','onboard_client','seed_client_coa','seed_client_knowledge','seed_opening_carry_forward'].includes(n)`. approve_entry, reverse_entry, edit_entry, run_depreciation, dispose_fixed_asset, record_year_end_close, build_export are all reachable in the [documents] lane (confirmed registered write tools in registry/journal.ts, fixedAssets.ts, ops.ts, and build_export/analysis pushed for the documents policy at buildTools.ts:384-389).`
- `agent/src/runtime/wakeCredential.ts:63-73 — the wake credential mints role 'authenticated' + firm_role:'bookkeeper'; its own comment (66-71) states this makes 'the bookkeeper+ HUMAN-decision fns that 2d re-gated (reverse_entry / update_client_profile / …) additionally pass — a wake lane's TOOL POLICY is what fences those'. So app.assert_can_review (00-foundation.sql:152-161) PASSES for a wake; only the blocklist stands between the wake and reverse/close.`
- `agent/src/http/wakes.ts:30-39 — CONDITION_WAKE_KIND maps document_triaged (a document_audit INSERT: assign/reassign/sample/code) → the 'documents' MAY-act lane; inject.ts:38-39 ('[documents] Act on the human's verb (assign/reassign/code/sample) via review-queue') is the only narrowing — prompt framing, not a structural fence.`
- `docs/architecture/backend.md:92 asserts 'Every wake is speak-never-act', which directly contradicts wakes.ts (documents = 'MAY-act') and the permissive blocklist.`
- `Compounded by Ggr-1: every wake lane also carries query_books, so even the proactive/workbench-kb lanes can reach any granted write via a SELECT-wrapped definer call, defeating the blocklist entirely.`

**What is wrong / missing** — backend.md claims every wake is speak-never-act, but the [documents] lane can execute posting/reversing/editing/depreciation/close writes with only a bookkeeper RBAC floor (which the wake credential satisfies) and a prose fence. Consequential, sometimes irreversible, book mutations can occur on a wake with no human authorization verb — and the Ggr-1 freeform path removes even the lane blocklist.

**What the rebuild must do** — Make wake autonomy an explicit DB-owned per-mutation-class policy (ALLOWLIST, not blocklist), default fail-to-draft-only; no wake lane should carry a freeform SQL tool; consequential/irreversible writes from a wake must require a human authorization verb or a materiality-gated policy. Reconcile backend.md's 'speak-never-act' claim with the actual documents-lane capability.

### `Ggr-10` · **MEDIUM** · Resident doctrine names the wrong OCR vendor to the model every run; on-demand skill bodies carry Hermes/Telegram/code_execution residue and a self-contradiction; the §15 tool inventory has drifted
*Hero-prompt item: G2*

**Evidence**
- `agent/src/doctrine/loader.ts:91-109 loads SOUL.md + AGENTS.md VERBATIM as the resident system instructions on EVERY run — 22191 bytes total by wc -c; the exact per-run token cost was not tokenizer-measured.`
- `RESIDENT error (every run): belcort/AGENTS.md:50 §6 states the OCR engine is 'Google Document AI' SERVER-SIDE; the actual engine is Azure AI Document Intelligence (agent/src/ocr/azureDocai.ts, engine:'azure-document-intelligence'). The same wrong vendor is repeated in a code comment (agent/src/tools/buildTools.ts:311).`
- `ON-DEMAND residue (loaded only when read_skill pulls that skill body, NOT every run): a `hermes:` front-matter key + Hermes references in bank-recon/client-onboarding/coa-coding/doc-ingest SKILL.md (e.g. client-onboarding/SKILL.md:391 '<HERMES_HOME> paths'; coa-coding/SKILL.md:316 'upstream Hermes'); Telegram mechanics (coa-coding/SKILL.md:30 'clarify_tool stays canonical for Telegram'); and a live self-contradiction — coa-coding/SKILL.md:40 says 'Python stays fine for OCR / code_execution' while bank-recon/SKILL.md:41 and client-onboarding/SKILL.md:65 state 'there is NO code_execution/Python runtime in v2'.`
- `belcort/AGENTS.md §15's tool inventory omits add_bank_account, dispose_fixed_asset, run_depreciation, seed_opening_carry_forward, build_export, and extract_document — it has drifted behind the built tool set.`

**What is wrong / missing** — The resident pack the model receives on every run contains a factual error (wrong OCR vendor), and the on-demand skill bodies carry dead-runtime instructions (Hermes/Telegram/code_execution) plus a direct self-contradiction about whether a Python/code_execution runtime exists; the §15 tool list is stale. The 'every run' scope applies to the AGENTS.md/SOUL.md resident core; the skill-body residue reaches the model only when that skill is loaded.

**What the rebuild must do** — Author a curated, current, self-consistent resident doctrine pack; drop verbatim loading of narrative/stale mandates; generate the tool inventory from the registry so it cannot drift; purge Hermes/Telegram/code_execution residue and the code_execution self-contradiction from skill bodies; verify every named external dependency (OCR vendor) matches the as-built runtime.

### `Ggr-12` · **MEDIUM** · Multi-entity/branch/currency scope is effectively unsupported — currency_default column exists but the ledger is MYR bigint-cents only, no branch/FX dimension
*Hero-prompt item: G3*

**Evidence**
- `db/v2/10-tables-core.sql:30 — clients.currency_default default 'MYR'; but journal_lines amounts are plain bigint debit_cents/credit_cents (10-tables-core.sql:168-169) with no currency/FX columns anywhere (grep for fx_/exchange_rate/foreign_currency across db/v2/*.sql returns nothing).`
- `No branch/segment/entity_group table or column exists (the sole 'segment' hit, 28-fns-reads.sql:783, is statement-period prose, not an entity segment).`
- `ActiveScope carries no entity/branch/currency axis (agent/src/runtime/types.ts:34-37).`

**What is wrong / missing** — If any client keeps foreign-currency records or multiple branches/segments, the agent has no data model or context axis to see or code them correctly; currency_default is a label with no FX ledger behind it.

**What the rebuild must do** — Decide multi-currency/branch scope explicitly for the rebuild; if in scope, add FX-aware ledger columns and a branch/segment dimension plus context axes, otherwise document the single-MYR-single-entity constraint as a hard product boundary so the agent never silently mis-handles a multi-entity/FX client.

### `Ggr-13` · **MEDIUM** · Auto-post's six-AND conditions are only partially structural — finalize_coding enforces just the label bind; confirmed-rule/≥0.95/empty-must_ask/no-tax-leg are model-asserted
*Hero-prompt item: G10*

**Evidence**
- `db/v2/20-fns-journal.sql:137-143 — finalize_coding structurally asserts only (a) p_status ∈ {auto_draft,needs_review,needs_decision} and (b) the auto_draft↔estimated_risk='auto' self-consistency bind. It does NOT verify the substantive auto conditions.`
- `docs/reference/confidence-ladder.md:56-64 lists the six-AND auto conditions: a CONFIRMED client_kb_rule matched, confidence ≥0.95, balanced, must_ask_flags empty, no tax leg, posting_date not in a closed period. Of these, only balance (15-triggers.sql:33-64) and closed-period (app.je_closed_period_guard) are trigger-enforced; confirmed-rule / ≥0.95 / empty-must_ask / no-tax-leg are asserted by the model's chosen status+risk labels, not checked by the DB.`
- `draft_entry (db/v2/20-fns-journal.sql:95-99) raises kb_rule_not_confirmed_for_client ONLY when a kb_rule_id is cited and it is not a confirmed rule of the client — which MATCHES the canon (confidence-ladder.md:98-99, a provenance-honesty check). The canon does NOT require every draft to cite a rule; cold-start/needs_review drafts with no rule are explicitly allowed (confidence-ladder.md:77,87-89). The draft-time 'confirmed-rule-or-raise' framing was a misreading and is withdrawn.`

**What is wrong / missing** — A mislabeling or mis-judging model can set status='auto_draft' + estimated_risk='auto' for an entry that does not actually satisfy the confirmed-rule / ≥0.95 / empty-must_ask / no-tax-leg conditions, and the DB will accept it (only balance and closed-period are trigger-enforced; the label bind is a self-consistency check, not a substantive one). The ≥0.95 confidence value is stored but never gated.

**What the rebuild must do** — Assert the substantive auto-post conditions structurally in the DB fn (a confirmed cited rule, the stored confidence ≥0.95, empty must_ask_flags, zero tax leg) rather than trusting the model's status/risk labels, and keep the confidence-ladder doc reconciled with the actual enforcement.

### `Ggr-3` · **MEDIUM** · No schema map / tool-to-table / workflow-to-data map; schema knowledge is prose + hardcoded per-wake hints that leak hallucinated legacy names
*Hero-prompt item: G4*

**Evidence**
- `No schema-map artifact exists in agent/src or belcort/. The model's only schema knowledge is tool descriptions (registry/*.ts), skill-body prose, and hardcoded column-name hints in wake notes.`
- `agent/src/runtime/inject.ts:58-63 — the journal wake read-hint hand-enumerates 'Useful columns' for journal_entries/journal_lines/coa_accounts and literally instructs 'Do not use legacy names: chart_of_accounts, active, source_document_id, or journal_entries.entry_id.' An explicit anti-legacy-name instruction is direct evidence the model has hallucinated old schema.`
- `belcort/coa-coding/SKILL.md:49,52 tells the model to 'Load the ClientContext once … browse the client's tables' and to 'Load the extracted JSONB data from the document table, to have the extarted field' (sic) — there is no ClientContext tool or structured schema the model can rely on.`

**What is wrong / missing** — There is no machine-usable schema/tool-to-table/workflow-to-data map, so when a workflow must use freeform SQL the model reconstructs table and column names from lossy prose and per-wake string hints — a hallucination surface the code itself patches with negative instructions. The failure mode is a query error (Postgres rejects an unknown column), not silent wrong data, which is why this is a robustness rather than a correctness gap.

**What the rebuild must do** — Ship a first-class schema/data-dictionary the agent can consult, or (better) remove the need by giving it typed read tools per Ggr-2 so it never names a table/column; provide an explicit workflow-to-data-requirements mapping so each skill knows exactly which reads to run.

### `Ggr-4` · **MEDIUM** · Query auditing is not real — agent_select reads are unlogged; the catch-all DML audit was removed (its bypass route is now Ggr-1)
*Hero-prompt item: G4*

**Evidence**
- `db/v2/26-fns-session.sql:119-140 — agent_select executes arbitrary SELECT text and returns rows; it writes NO audit row of the SQL it ran, so every agent READ over client books is invisible.`
- `db/v2/25-fns-ops.sql:36-38 — 'the firm_activity_feed dml_audit source (src 5) is DROPPED: ADR-030 revokes all direct DML' — the residual-DML audit net is gone. Its stated justification (direct DML no longer possible) is sound for the curated path; the Ggr-1 wrapped-definer route re-introduces a mutation path this net would otherwise have caught.`
- `Mutations remain per-fn audited: each write fn writes its own history row (e.g. journal_entry_history in approve_entry, 20-fns-journal.sql:208-209) with an app.audit_actor-constrained actor (00-foundation.sql:212-229). So a Ggr-1 SELECT-wrapped write is audited by the target fn's own trail; the gap is unlogged reads and the missing catch-all net.`

**What is wrong / missing** — Reads over client books are unattributable and non-replayable (agent_select logs nothing), and the generic mutation audit net was dropped. Mutations still write their own constrained-actor history row, so this is a forensic/traceability completeness gap for an audit-grade OS rather than an unaudited-mutation hole.

**What the rebuild must do** — Log every agent-issued query (statement, caller, firm, timestamp, row-count) in a durable RLS-scoped audit table, and re-establish a catch-all mutation audit so reads are attributable/replayable and any bypass write leaves more than the target fn's own trail.

### `Ggr-5` · **MEDIUM** · Skill-first execution is convention, not a gate — no structural check that read_skill (or the required context reads) precede a write tool
*Hero-prompt item: G9*

**Evidence**
- `agent/src/tools/buildTools.ts:92-107 — buildFnToolDef.execute enforces policyAllows → enforceScope → injectActor → rpc. Nothing checks whether read_skill(name) was called this run.`
- `read_skill / read_reference are ordinary tools (buildTools.ts:157-202) with no side effect on write eligibility.`
- `The only 'enforcement' is prose: belcort/AGENTS.md §8 ('I MUST call read_skill before I act … I NEVER call a write/commit tool … whose body I have not loaded THIS run') and the runtime's flow-control nudge injected into the clarify tool result (agent/src/runtime/openai/tools.ts:62).`
- `Mitigating floor: the hard DB invariants hold regardless of skill-load — balance trigger, closed-period trigger, RBAC floors, firm-ownership, and (when cited) the confirmed-rule check — so a skill-skip risks procedural/quality error, not a bypass of the DB-owned invariants.`

**What is wrong / missing** — A model that skips read_skill (or skips the client-context reads a skill mandates) can still call onboard_client, draft_entry, finalize_coding, approve_entry, record_year_end_close, etc. 'Load the procedure and the client context before acting' is prompt-enforced only, so premature/under-grounded action is not structurally prevented — the harm is bounded by the DB invariants but the grounding-before-action requirement is not a gate.

**What the rebuild must do** — Gate consequential writes on a satisfied precondition set (the relevant skill body loaded this run AND the required client-context reads performed), enforced in the tool layer or a planner/verifier step rather than in doctrine prose.

### `Ggr-6` · **MEDIUM** · No distilled product-doctrine pack and no bundled per-client context pack; profile/COA/FY/tax/banks/KB/open-items retrieval is model-discretion
*Hero-prompt item: G2*

**Evidence**
- `agent/src/doctrine/loader.ts:91-109 — the resident systemInstructions are SOUL.md (2318 bytes) + AGENTS.md (19873 bytes) loaded verbatim + a rendered routing menu; there is no compact, curated product-doctrine distillation.`
- `There is no context-pack tool that returns a client's profile + COA + FY/period + tax regime + banks + open items + KB rules in one grounded payload. belcort/coa-coding/SKILL.md:49 tells the model to 'Load the ClientContext once' but no such tool exists — it must assemble context ad hoc via query_books.`
- `No curated read tool exists for client_kb_rules or client_fy_close (period/lock/close status), so 'retrieve the KB and the FY/period before proposing actions' is only possible via freeform SQL (Ggr-2), at the model's discretion.`

**What is wrong / missing** — Grounding before action depends on the model choosing to run the right reads, over stale verbatim doctrine, rather than on a curated product-doctrine pack plus an authoritative per-client context pack delivered up front. The North-Star 'agent as a grounded super-UI' has no context substrate — a target-architecture gap rather than an active defect.

**What the rebuild must do** — Build a distilled, current product-doctrine pack (not raw verbatim mandates) and a first-class per-client context pack (profile, COA + normal balances, FY/period + lock/close status, tax regime, banks, open items, KB rules, recon hints, FA register summary) retrieved/attached before the agent proposes any action for a client.

### `Ggr-8` · **MEDIUM** · The agent is a scope-follower, not a super-UI owner — ActiveScope carries no period/entity dimension and there is no durable per-conversation working context
*Hero-prompt item: G8*

**Evidence**
- `agent/src/runtime/types.ts:34-37 — ActiveScope is exactly {clientId, clientSlug}; there is NO period/FY/entity/branch/currency dimension.`
- `dashboard/lib/activeScope.ts:15-36 — the dashboard owns the active-scope selection and its write-gate; the file's own comment calls it 'A NO-OP for today's single-client UX'. The agent's write-gate merely mirrors the passed-in scope (buildTools.ts:54-79); the agent does not autonomously carry or advance scope.`
- `Cross-turn memory is cold transcript replay: loadHistory returns the last ≤40 (cap 100) turns of one session as prose (agent/src/http/sessions.ts:253-270); run state is process-local (runtime.ts:136, cross-verified in workstream Grt). No server-side working context (client profile, COA, FY, open items) persists across a workflow — each turn re-derives it via reads.`
- `Period is re-computed per skill from query_books (belcort/period-entries, year-end-close skills) rather than being a carried context axis.`

**What is wrong / missing** — The North-Star 'stateful super-UI over the whole product that carries client + period context across workflows' is not met: the dashboard drives scope, the agent has no period/entity axis, and every turn reloads client context from scratch. This is a capability/architecture gap for the rebuild target, not an active correctness or isolation defect.

**What the rebuild must do** — Give the agent a durable, server-owned working context per conversation — client + period/FY + entity scope + a cached context pack — that it carries and advances across workflows, so it is the state-owning super-UI rather than a per-request scope-follower.

### `Ggr-9` · **MEDIUM** · No-model-math is structural only for DERIVED totals; primary draft amounts are model-transcribed with no source-tie check
*Hero-prompt item: G5*

**Evidence**
- `Derived/aggregate figures ARE DB-owned: client_trial_balance/trial_balance_range/tie-outs are read fns; compute_sst_leg computes the tax leg (20-fns-journal.sql:42-72); export/report/analysis renderers only FORMAT — exportTool.ts:85-124 builds SQL from validated/escaped literals and the DB joins/returns cents; reportModel.ts:110-127 maps DB cents through M()/T() and takes totals from tb.total_debit_cents/total_credit_cents (DB), 'balanced' a display boolean (122,262); analysisTool.ts:4-10 has Clara supply the SELECT and Postgres compute every number, stamped 'Analytical view — not an audited financial statement'.`
- `But draft_entry (db/v2/20-fns-journal.sql:112-116) inserts model-supplied debit_cents/credit_cents with NO check they match any source document; the deferred balance trigger (15-triggers.sql:33-64) only asserts Σdr=Σcr and non-zero at commit, not that the amounts are the invoice's amounts. Primary transaction amounts on a draft are transcribed by the model from OCR/prose.`
- `Combined with Ggr-1/analysisTool.ts, the model can run arbitrary aggregation SQL and narrate/render the (DB-computed, but model-chosen) result as an authoritative-looking view.`

**What is wrong / missing** — The invariant 'the agent never computes a figure' is enforced structurally only for derived totals; the amounts the model transcribes onto a draft line are not validated against their source, and the balance trigger checks internal consistency (Σdr=Σcr), not source-correctness. Nothing structurally ties a drafted amount to the extracted document field it came from.

**What the rebuild must do** — Bind drafted document-origin amounts to their source (require OCR field/region provenance and validate legs against it) and keep all aggregation/derivation in DB fns the model cannot rewrite, so any figure the agent surfaces is a passthrough of a DB-owned value.

### `Ggr-11` · **LOW** · Unknown needsApproval interruptions are silently auto-approved — latent fail-open default
*Hero-prompt item: G10*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:236-253 — the while-interruptions loop handles clarify_tool specially, then the else branch (249-252) calls result.state.approve(interruption) for ANY other needsApproval interruption, with the comment 'under the curated-tool model (W5) the surface is already bounded'.`
- `agent/src/runtime/openai/tools.ts:47-53 — today ONLY clarify_tool sets needsApproval:true, so nothing else is currently auto-approved; the risk is purely latent — any future tool or SDK default that marks a call needsApproval would be auto-consented with no human/policy check.`

**What is wrong / missing** — The approval-interruption handler defaults to auto-approve for everything that is not clarify, so the SDK's human-in-the-loop mechanism is fail-open by default. There is no current-code impact (only clarify sets needsApproval), so this is a latent-defensive concern: a single tool change (or SDK default) would flip consequential tool calls to silent auto-consent.

**What the rebuild must do** — Default unknown/other approval interruptions to DENY or route them to an explicit human/policy decision; never auto-approve an interruption the runtime does not specifically understand.

#### Verified as sound (workstream G)

- Closed-period / lock-date safety is genuinely DB-enforced (not prompt-enforced) and tested.  ·  _evidence:_ `db/v2/25-fns-ops.sql (app.je_closed_period_guard, ~297-322) — a SECURITY DEFINER BEFORE INSERT OR UPDATE trigger on journal_entries that raises posting_date_in_closed_period for any entry whose posting_date <= a live (reversed_at is null) close's period_end, exempting only entry_kind in ('closing','opening') under via_fn record_year_end_close / reverse_year_end_close.; db/v2/tests/closed_period_lock_test.sql:84,134 — PASS assertions cover blocking in-period standard entries, the UPDATE (approve) path, and the conjunctive close-exemption in both directions.`
- The Σdr=Σcr balance rule is a deferred SECURITY DEFINER constraint trigger, never RLS-skippable, with drafting exempt.  ·  _evidence:_ `db/v2/15-triggers.sql:33-75 — app.check_entry_balance, SECURITY DEFINER, wired as deferrable-initially-deferred constraint triggers on journal_entries (70-71) and journal_lines (73-75); skips status='drafting' (52); raises on Σdr<>Σcr (58-60) or zero value (61-63) at commit.`
- Human-review RBAC floors are re-homed into the DB fns (bookkeeper+ for review writes, admin+ for KB management), constraining a raw-PostgREST caller and the wake credential.  ·  _evidence:_ `db/v2/00-foundation.sql:152-161 app.assert_can_review() (bookkeeper/admin/owner, NULL denied) and 176-185 app.assert_can_manage_kb() (admin/owner).; db/v2/20-fns-journal.sql:184,226,284,374,411,450,493 — assert_can_review is called by approve_entry / reject_entry / edit_entry / reassign_entry / add_coa_account / set_coa_account_active / set_coa_account_type. Wake credential mints firm_role:'bookkeeper' (agent/src/runtime/wakeCredential.ts:72) so it passes the review floor but is denied admin+ KB-management fns.`
- Actor attribution on the CURATED tool path is set by the layer, not the model, and DB-constrained.  ·  _evidence:_ `agent/src/tools/buildTools.ts:81-89 — injectActor OVERWRITES any model-supplied p_actor / p.actor with ctx.actor (curated buildFnToolDef path only; NOT the query_books path — see Ggr-1).; db/v2/00-foundation.sql:212-229 — app.audit_actor constrains p_actor to the literal 'agent' or the caller's own JWT email/sub, else falls back to the caller identity (the 'a human labels their own firm's row agent' residual is accepted-with-visibility per the fn's note).`
- Cross-firm isolation is structurally enforced (assert_firm_owns_client in every write fn + composite FK), and agent_select is SECURITY INVOKER so RLS scopes reads to the caller's firm; tested.  ·  _evidence:_ `db/v2/20-fns-journal.sql:91,135,178,223 (and 280,369,380,407,449,492) — perform app.assert_firm_owns_client(...) on the write paths; the fn is defined at 00-foundation.sql:319.; db/v2/10-tables-core.sql:175 — journal_lines foreign key (client_id, account_code) references coa_accounts(client_id, acc_code), preventing coding to another client's account.; db/v2/26-fns-session.sql:120 — agent_select is `security invoker`; db/v2/90-isolation-tests.sql:273-281 PASS 6c proves firm-B reads its own clients and zero firm-A rows.`
- Export/report/analysis figures are DB-computed and only formatted in the agent; no authoritative aggregate is model-computed on those paths.  ·  _evidence:_ `agent/src/tools/exportTool.ts:85-124 — SQL builders assemble from validated/escaped literals; the DB does the joins and returns cents.; agent/src/tools/reportModel.ts:110-127 — trialBalanceDoc maps DB-returned cents through M()/T() for presentation only; totals come from tb.total_debit_cents/total_credit_cents (DB), 'balanced' a display boolean (122,262).; agent/src/tools/analysisTool.ts:4-10 — 'Clara supplies the SQL, Postgres computes every number, the renderer prints DB cells verbatim'; the output is stamped 'Analytical view — not an audited financial statement'.`
- There is no shell/psql/file/web tool surface — the structural containment holds for the CURATED tool set (does NOT cover the Ggr-1 SQL-wrapped-definer path).  ·  _evidence:_ `agent/src/tools/registry.ts:57-74 — BANNED_TOOL_TOKENS = shell, bash, exec, spawn, psql, run_sql, raw_sql, execute_sql, file_read, file_write, readfile, writefile, fetch, http, curl, browser.; agent/src/tools/buildTools.ts:356-363 assertNoBannedTools runs over the built set on every buildTools call (390).`

#### Unverified (workstream G) — could not be confirmed from frozen evidence; carried as open

- Live confirmation that `select approve_entry(...)` (or another SECURITY DEFINER write) actually mutates through agent_select was NOT executed — the repo is frozen/read-only and no connection to belcort-shared was made. The bypass is established from the guard code (sqlGuard.ts:57-85 + db/v2/26-fns-session.sql:129-137), the fn's SECURITY DEFINER grant (20-fns-journal.sql:166,212), the absence of any read-only-transaction/role barrier in agent_select, and standard Postgres definer-in-invoker semantics; a live rig test should confirm before treating it as closed.
- Whether the DEPLOYED Fly runtime (belcort-agent) actually has AZURE_DOCAI_ENDPOINT/KEY set (OCR live) vs answering 'OCR not configured' — not checked; no authenticated live inspection was performed. The as-built engine is Azure per agent/src/ocr/azureDocai.ts regardless of the doctrine's 'Google Document AI' text.
- The ~22KB resident-doctrine figure is exact by byte count (SOUL.md 2318 + AGENTS.md 19873 = 22191 via wc -c) plus the rendered menu; the exact per-run TOKEN cost was not measured against a tokenizer.
- Whether the dashboard passes any period/FY parameter to the agent through a channel OTHER than ActiveScope was not exhaustively grepped across all of dashboard/; ActiveScope itself (runtime/types.ts:34-37, dashboard/lib/activeScope.ts:15-20) carries none, but a separate period field elsewhere in the chat payload was not ruled out.
- Grants were spot-verified for ~11 of the read fns cited as granted-but-not-tools (ar_aging/ap_aging/ar_control_tie_out/customer_statement/fa_register/fa_control_tie_out/adjustments_status/get_tax_computation/get_sst_return/client_general_ledger/client_financial_statements/client_overview); the remaining fns (supplier_statement, ap_control_tie_out, fa_depreciation_schedule, amortisation_schedule_detail, client_trial_balance_comparative, firm_needs_attention, firm_digest) were confirmed DEFINED but their individual GRANT lines were not each read, so the exact granted-but-not-a-tool list may be off by a few fns.

#### Decision brief (workstream G)

> No audit-brief.md exists at undefined/audit-brief.md (only undefined/maps/db-map.md and the sibling findings/*.json are present); the severity rubric and output contract were taken from the task instructions. Verification outcome: the load-bearing critical (Ggr-1, the SELECT-wrapped SECURITY-DEFINER mutation-bypass) is CONFIRMED against the actual guard code, the fn grants, and standard Postgres definer-in-invoker semantics. agent_select (26-fns-session.sql:119-141) is `volatile security invoker` with only a lexical guard and NO `set transaction read only` / no read-only role, so `select approve_entry(1,2,'x')` passes the TS guard (sqlGuard.ts:57-85) AND the DB guard (26-fns-session.sql:129-135) and executes approve_entry (SECURITY DEFINER, granted authenticated, 20-fns-journal.sql:166,212) with definer rights. IMPORTANT precision (verified): the target fn's OWN internal guards still fire on the wrapped call — app.assert_firm_owns_client keeps it in-firm (no cross-firm leak), app.assert_can_review enforces the bookkeeper+ floor (no viewer→writer escalation), and app.audit_actor clamps the actor to 'agent' or the caller identity. So Ggr-1 is a TOOL-LAYER bypass, not a DB-guard bypass: it defeats the active-scope write-gate (enforceScope — a same-firm NON-active-scope client can be mutated) and, most seriously, the per-wake speak-never-act policy (WRITE_ALLOW — the wake credential mints firm_role:'bookkeeper', so a proactive/workbench-kb wake passes assert_can_review and can invoke any granted write via a wrapped call). Critical stands because it breaks the 'firm-killing invariant' the tool layer exists to enforce (buildTools.ts:18) and it is untested (90-isolation-tests.sql:277-280 probes only update/drop/delete text). Query reads are additionally unlogged. The second structural spine: the ONLY general read path is freeform query_books — curated reads are 9 fns while ~14+ workflow read fns are granted-but-not-tools — so whole workflows must hand-write SQL through the exact surface Ggr-1 rides. Several draft findings framed as `high` are genuine but are target-architecture / robustness / forensic gaps with no active correctness-or-isolation harm (no distilled doctrine pack, no per-client context pack, no period/entity scope axis, no schema map, unlogged reads, skill-first is convention-not-gate) — recalibrated to `medium`; the two that force the vulnerable surface (Ggr-2) or open an actual unsupervised-mutation path (Ggr-7) stay `high`. Ggr-4 is reframed (the dropped dml_audit is justified — direct DML is revoked — so the real gap is unlogged reads plus the Ggr-1 route, not a mutation-audit hole). Ggr-13 is reframed (the canon does NOT require every draft to cite a rule and draft_entry's provenance RAISE matches the canon; the real, confirmed gap is that finalize_coding structurally enforces only the auto_draft↔risk_auto label bind while 4 of the 6 auto-post conditions are model-asserted). Ggr-11 is downgraded to `low` (purely latent — only clarify_tool sets needsApproval today, so nothing is currently auto-approved). Genuinely structural and worth preserving (all re-verified): the closed-period lock trigger (tested), the deferred SECURITY-DEFINER balance trigger, cross-firm isolation via assert_firm_owns_client + the (client_id,account_code) composite FK, the bookkeeper+/admin+ RBAC floors that also fence the wake credential, layer-set + DB-clamped actor on the curated path, the format-only export/report/analysis renderers (DB computes every figure), and the no-shell/psql/file/web token guard. The rebuild should keep these but make the agent read path structurally read-only, give every workflow a curated/typed read tool, audit every agent query, gate skill-load + context-load before consequential writes, add a period/entity axis + durable per-conversation working context, make wake autonomy an allowlist per mutation class, and ship a clean current doctrine pack (the resident AGENTS.md still names the wrong OCR vendor) plus a per-client context pack.

---

## Workstream H — Reporting & exports

### `H-1` · **HIGH** · The audited-export invariant is opt-in: the model can file model-authored bytes as a durable, branded export artifact via record_export_artifact + upload_document(content_base64)
*Hero-prompt item: Are ALL exports persisted as auditable artifacts / where could a model-computed number sneak into a rendered report*

**Evidence**
- `agent/src/tools/registry/ops.ts:6-25 and :26-54 — record_export and record_export_artifact are registered as direct model-callable write tools (allowed under 'interactive' AND the 'documents' wake policy, since WRITE_ALLOW.documents only excludes the five onboarding fns — agent/src/tools/buildTools.ts:25); record_export_artifact's match_client guard only requires the fabrication to target the active client scope`
- `agent/src/tools/buildTools.ts:250-251 — upload_document's own model-facing description blesses the manual lane: "export bundles: the exact object_key record_export_artifact returned"; :277-287 accepts model-generated content_base64 (≤2MB decoded) with content_type text/csv or application/pdf (INLINE_TYPES, :237)`
- `db/v2/25-fns-ops.sql:190-282 — record_export_artifact accepts caller-supplied p_sha256/p_byte_size/p_row_count and RESERVES the row before any bytes exist; nothing ever verifies the stored object matches the recorded sha256; content_kind has no CHECK (db/v2/14-tables-ops.sql:161)`
- `dashboard/lib/exportArtifacts.ts:83-97 — download re-reads object_key by artifactId and signs it: the fabricated artifact serves the model-authored bytes, indistinguishable on the Files shelf from a real build_export product`
- `Every prohibition of this lane is prose-only, and the doctrine self-contradicts: belcort/export/SKILL.md:128-131 + :203-209 and belcort/year-end-close/SKILL.md:148-149 ('you do NOT call record_export / record_export_artifact / upload_document yourself') and belcort/export/references/journals-csv-execution-pattern.md:3-7 all forbid hand-filing — while belcort/export/SKILL.md:63 still cites that same superseded reference as 'the proven live pattern … formatter invocation, upload_document call, and byte-level verification'; no code path enforces any of it`

**What is wrong / missing** — The cardinal 'a figure NEVER passes through the model's text generation' guarantee holds only when the model voluntarily uses build_export. Inside the same curated tool surface a model (or a prompt-injected model) can reserve an artifact row, upload a CSV/PDF whose every number it wrote itself, and emit the export_result card for it — producing a durable, versioned, 7-year-retained 'audited' deliverable containing hallucinated figures. sha256/byte_size/row_count in the index are caller claims, never reconciled against the stored object.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\buildTools.ts:250

### `H-2` · **HIGH** · build_export hardcodes balanced:true for every scope, the model relays it, and the dashboard renders an unlabelled green 'In balance' chip the SKILL falsely claims is 'labelled non-authoritative at render'
*Hero-prompt item: Do the numbers come from DB read fns / audit trail honesty*

**Evidence**
- `agent/src/tools/exportTool.ts:413 — build_export returns fileExportBytes(..., balanced: true, ...) unconditionally (and fileExportBytes defaults `input.balanced ?? true`, :218) — even for management_accounts where the DB's client_financial_statements returns an explicit sofp.in_balance {current,prior} the tool never reads (db/v2/28-fns-reads.sql:770-772); build_analysis_report also files balanced:true (analysisTool.ts:307)`
- `belcort/export/SKILL.md:186-187 — "`balanced` is your agent-reported claim (labelled non-authoritative at render), not DB-verified"; the Step-7 card template at :177 even ships "balanced":true inline`
- `dashboard/components/export/ExportFileRow.tsx:83-87 — renders 'In balance' as a green chip with NO non-authoritative label; the file-top comment (:7-9) even calls it "a faithful-dump signal the accountant defends to LHDN"`
- `dashboard/lib/artifacts.ts:415-435 — parseExportResult passes any boolean `balanced` through shape-validation only (:428); no server-side cross-check against the artifact or the books`
- `Only trial_balance-backed figures are protected: _trial_balance_core RAISES trial_balance_unbalanced (db/v2/25-fns-ops.sql:102-106); client_financial_statements raises only client_not_found/fy_required and returns in_balance as data`

**What is wrong / missing** — Export a management-accounts pack for books whose SoFP does not balance (client_financial_statements surfaces in_balance=false but does not raise): the tool returns balanced:true, the card shows a green 'In balance' chip, and an accountant hands LHDN a pack carrying a false assurance. Only trial_balance is protected (the DB raises trial_balance_unbalanced); every other scope's 'balanced' is theater.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\exportTool.ts:413

### `H-4` · **HIGH** · The analysis lane launders model-authored numbers as 'computed by the database': SQL literals become authoritative cells, and free-text titles/headings/notes are unverified model prose printed on the branded PDF
*Hero-prompt item: Ad hoc/flexible reporting — can Clara generate charts/tables/commentary from verified sources*

**Evidence**
- `agent/src/tools/analysisTool.ts:5-7 — the invariant claim: "Clara supplies the SQL, Postgres computes every number"; but the SQL is model text — `select 999999 as revenue_cents` 'computes' the model's own literal (assertReadOnlySql passes it), which then renders as a DB-owned money cell (tableSection :133-138, kpiSection :186-191)`
- `agent/src/tools/pdfReport.ts:227 — the analytical banner asserts to the reader: "every figure is computed by the database from the query on the provenance page" — untrue for literal-bearing SQL; :385-386 repeats "it did not compute any number"`
- `agent/src/tools/analysisTool.ts:105,110,252-253 — heading/note/title/subtitle are unbounded model free text; pdfReport.ts drawHeading (:185-189), section notes (:176-181,:359) and the masthead title (:84) print them verbatim on the branded artifact — model-computed numbers can appear in 'commentary' with no stamp distinguishing them from DB cells`
- `Mitigation exists but is reader-dependent: the provenance page prints each query (pdfReport.ts:382-395) — only an auditor who reads SQL catches a laundered literal; the 'Analytical view' stamp (reportModel.ts:382, pdfReport.ts:223-229) flags the lane but not the laundering`

**What is wrong / missing** — The 'ad hoc reporting engine' answer to the hero prompt is: yes it exists (structured section specs, tables/bar/line/hbar/donut/KPI, one branded PDF, filed under the analysis class) — but its central trust claim is over-stated. Two composition paths admit model-computed numbers into the rendered report: (1) numeric literals/expressions the model embeds in section SQL, presented as DB-computed cells under a banner asserting the opposite; (2) the model's own prose (title, subtitle, headings, notes) printed on the artifact. Commentary is not 'from verified sources'.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\analysisTool.ts:105

### `H-6` · **HIGH** · The reporting lane's 'read-only' SQL guard is lexical and its claimed Postgres backstop is false — a SELECT-wrapped SECURITY DEFINER write inside an analysis section (or query_books) mutates the books, and the analysis PDF would print the mutating SQL as provenance
*Hero-prompt item: Retrieve authoritative data through safe tools (adjacent: known SDT-001 reaches the reporting lane)*

**Evidence**
- `agent/src/tools/sqlGuard.ts:17-43,57-85 — verb-word scan only; `select public.record_year_end_close(...)` / `select approve_entry(...)` contain no banned verb and pass; :3-6 claims "even a write that slipped past this guard would be refused by Postgres" — FALSE for fn calls: EXECUTE on the SECURITY DEFINER write fns is exactly the grant `authenticated` holds (per-file `grant execute ... to authenticated` in db/v2/25-fns-ops.sql etc.; db/v2/30-grants.sql only strips PUBLIC/anon)`
- `db/v2/26-fns-session.sql:119-141 — agent_select is SECURITY INVOKER with the same lexical verb-scan (:130-135), no `set transaction read only`, and `execute format('select ... from (%s) __q', p_sql)` (:137) — a smuggled DEFINER call executes as the caller who holds EXECUTE`
- `agent/src/tools/analysisTool.ts:273-289 — each model-composed section SQL runs assertReadOnlySql → ctx.query → agent_select under the caller's JWT; a smuggled DEFINER call executes, its return renders as report data, and the SQL is immortalized on the provenance page (pdfReport.ts:382-395)`
- `agent/src/tools/buildTools.ts:375 — queryToolDef (same guard) is pushed under EVERY policy, including the proactive wake lane`
- `CLAUDE.md acknowledges SDT-001/SEC-001 as a known audit finding; this workstream adds that the NEW analysis lane widened the surface where model-composed SQL is executed`

**What is wrong / missing** — An ostensibly read-only reporting request is a mutation vector: prompt-injected or confused model SQL in build_analysis_report/query_books can post, approve, or close via DEFINER fns. The guard file's comment materially misstates the defence-in-depth (Postgres does NOT refuse it), which invites future maintainers to trust a backstop that does not exist.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\sqlGuard.ts:3

### `H-10` · **MEDIUM** · No role floor anywhere on the export lane: a viewer can trigger export writes and download every whole-ledger artifact; the SKILL's 'bookkeeper+' download claim is stale relay doctrine
*Hero-prompt item: Permissions on exports*

**Evidence**
- `db/v2/25-fns-ops.sql:178,283-285 — record_export/record_export_artifact granted to authenticated with no assert_can_review/assert_can_manage floor`
- `dashboard/lib/rbac.ts:26 — 'documents.export': 'viewer'; dashboard/components/export/ExportFileRow.tsx:47-49 and dashboard/components/rail/AgentCard.tsx:100 gate Download on that viewer-level permission`
- `db/v2/storage-setup.sql:43-47 — firm_docs_read is firm-prefix-only, no role dimension; dashboard/lib/exportArtifacts.ts:83-97 signs dashboard-direct on the session JWT`
- `belcort/export/SKILL.md:183-184 — claims the runtime mints the URL "for bookkeeper+ via GET /firms/:id/books/exports/:artifactId/file" — no such route exists in agent/src/http (hub/cors/auth/wakeGate/documents/server/sessions/wakes only; grep for 'exports' finds none); the as-built path is dashboard-direct and viewer-accessible`

**What is wrong / missing** — Reads-ungated is the PRD's stated design, but the export lane also has ungated WRITES (receipts/artifacts/build_export under any membership at the DB layer), and the doctrine tells the model a stricter gate exists than actually does. If the firm ever relies on the documented bookkeeper+ boundary for client-data egress, it is not enforced anywhere.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\dashboard\lib\rbac.ts:26

### `H-11` · **MEDIUM** · The MANDATORY whole-ledger client-confirm is prompt-only, and the export tools also run on the [documents] wake lane where clarify_tool does not even exist; a null active scope lets any client in the firm be exported
*Hero-prompt item: Agentic flow safety — wrong-client export*

**Evidence**
- `belcort/export/SKILL.md:87-92 — Step 3 mandates a clarify_tool client-confirm for full/management_accounts; no code path enforces it (exportTool.ts has no confirm state)`
- `agent/src/tools/exportTool.ts:249-251 + analysisTool.ts:239-241 + buildTools.ts:384-388 — build_export and build_analysis_report are permitted under policy 'documents' (an autonomous wake); buildTools.ts:381 pushes clarifyToolDef only for 'interactive', so the mandated gate is structurally impossible on that lane`
- `agent/src/tools/exportTool.ts:261-263 — the scope check passes whenever ctx.scope.clientId is null (the firm thread): `if (ctx.scope.clientId != null && clientId !== ctx.scope.clientId)`; build_export calls record_export/record_export_artifact via ctx.rpc directly, so the registry's enforceScope never runs for them`
- `dashboard/lib/reportsPicker.ts:44-47 — even the 'deterministic' picker routes through the model by client NAME, not id (`buildExportIntent(clientName, ...)`), so client resolution is still LLM inference on look-alike names`

**What is wrong / missing** — The design treats a whole-ledger export of the wrong client as firm-killing, yet the only gate is model obedience to a skill paragraph — absent entirely on wake lanes and un-anchored (name-based) from the picker. RLS caps the blast radius at the firm, but intra-firm wrong-client egress to a client is exactly the scenario the SKILL calls firm-killing.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\exportTool.ts:261

### `H-3` · **MEDIUM** · The PDF 'IN BALANCE' seal is agent-recomputed with JS floats (ignoring the DB's in_balance) and provably fails on balanced books
*Hero-prompt item: Where could a model-computed number sneak into a rendered report (exact composition path)*

**Evidence**
- `agent/src/tools/reportModel.ts:258-261 — managementAccountsDoc computes `balanced = assets !== '' && Number(assets) === Number(equity) + Number(liab)` over 2dp decimal strings instead of reading fs.sofp.in_balance (db/v2/28-fns-reads.sql:770-772, integer-cents equality in SQL)`
- `Verified by execution in this audit: node -e "Number('0.30') === Number('0.10') + Number('0.20')" → false — a genuinely balanced SoFP (assets 30¢ = equity 10¢ + liabilities 20¢) is stamped unbalanced`
- `agent/src/tools/pdfReport.ts:88 — `if (rep.balanced) drawSeal(...)` — the false-negative silently withholds the assurance seal; agent/src/tools/reportModel.ts:354-369 — buildFullBundleDoc propagates it (`if (sd.balanced === false) allBalanced = false`) to the whole Full Client Pack`
- Combined with H-2, the SAME export can carry a PDF without the seal while its chat card says 'In balance'

**What is wrong / missing** — An assurance figure the DB already owns is recomputed in the agent with float arithmetic — a direct 'the agent never computes a figure' violation, with a demonstrated wrong output (false negative on cent combinations subject to binary-fraction error). Direction is false-negative only, so no unbalanced pack gains a seal, but deliverable and card contradict each other and the invariant is breached on the exact composition path reportModel.ts:258→pdfReport.ts:88.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\reportModel.ts:258

### `H-5` · **MEDIUM** · Analysis money magnitude depends entirely on the model's money_columns labeling: unflagged cents render 100x too large, mislabelled non-cents 100x too small, and non-integer money is silently truncated or blanked
*Hero-prompt item: Ad hoc reporting — verified data rendering*

**Evidence**
- `agent/src/tools/analysisTool.ts:121-138 — a column is money ONLY if the model lists it in money_columns; an unflagged cents column falls to isNumericColumn → fmtNum groups raw cents ('123456' → '123,456', read as RM 123,456 when it is RM 1,234.56); label() (:38-41) even strips the '_cents' suffix from the header, erasing the unit clue`
- `agent/src/tools/exportFormat.ts:13,17-37 — centsToDecimal divides any flagged value by 100 (an integer whole-RM column flagged as money renders ÷100); a STRING decimal ('123.45' fails INT_RE) returns '' and the cell renders '—' (pdfReport.ts:135-139), while a JSON-NUMBER decimal (the live path: agent_select returns jsonb via PostgREST, so a numeric avg() arrives as a JS number) is Math.trunc'd toward zero (:26) — sub-cent dropped silently; text-cast money blanks silently`
- `agent/src/tools/pdfReport.ts:240-241 — chart axes/values divide by 100 only when chart.money is set (analysisTool.ts:164-169 derives it from the same model labels)`
- `belcort/export/SKILL.md:149-150 — the only guard is doctrine: "ALWAYS list your cents columns here, else they print as raw integers"`

**What is wrong / missing** — A single omitted or wrong money_columns entry produces a branded PDF whose figures are off by exactly 100x (or truncated/blanked for non-integer money) with no detection — no schema introspection, no _cents-suffix heuristic cross-check, no unit sanity check. For a report a client treats as authoritative, magnitude correctness resting on model labeling discipline is a real defect.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\analysisTool.ts:121

### `H-7` · **MEDIUM** · Artifact rows are reserved before bytes and never reconciled: a failed upload leaves a permanent phantom artifact (sha256/byte_size recorded, no object, no status column, no integrity verification ever)
*Hero-prompt item: Are exports persisted as auditable artifacts with reproducibility/audit trail*

**Evidence**
- `db/v2/25-fns-ops.sql:270-279 — "RESERVE the row BEFORE the agent writes bytes"; the row carries sha256/byte_size at reserve time; export_artifacts has no stored/verified status column (db/v2/14-tables-ops.sql:156-186)`
- `agent/src/tools/exportTool.ts:166-220 — fileExportBytes: record_export → record_export_artifact → ctx.storeBytes with no compensation on upload failure; the append-only index keeps the dangling row for 7 years (retain_until, 14-tables-ops.sql:176) and its version number is consumed`
- `dashboard/components/export/ExportFileRow.tsx:67-69 — the user-facing consequence is only a generic "Couldn't mint that download — retry."`
- `No fn, job, or route re-hashes a stored object against export_artifacts.sha256 at any point in the lifecycle (searched db/v2 + agent/src + dashboard/lib — sha256 is only stored and displayed)`

**What is wrong / missing** — The artifact index — the audit trail an accountant would cite — can contain entries for files that never existed, and conversely nothing detects storage-side corruption/substitution (service_role bypasses RLS and could overwrite semantics aside, the recorded sha256 is never re-checked). An audit-grade export register needs a stored/verified status and an integrity sweep.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\exportTool.ts:176

### `H-8` · **MEDIUM** · Reproducibility is not pinned: the full request spec is not persisted (analysis section SQL lives only inside the PDF bytes; GL account_code filter unrecorded) and there is no data-version anchor
*Hero-prompt item: Persisted with parameters, data version, reproducibility*

**Evidence**
- `db/v2/25-fns-ops.sql:161-178,190-282 — receipts/artifacts persist scope/format/fy/period/row_count only; there is no parameters/spec column (table shape: db/v2/14-tables-ops.sql:127-186)`
- `agent/src/tools/analysisTool.ts:303-308 — build_analysis_report files scope='analysis' with period fields; the sections spec (the SQL that defines the report) is never written to the DB — the only copy is the provenance page rendered into the PDF (reportModel.ts:375-384)`
- `agent/src/tools/exportTool.ts:303-327 — a single-account GL export passes account_code to the read fn but records nothing distinguishing it from a full-ledger GL artifact at the same coordinates`
- `No snapshot/as-of ledger version exists: books keep mutating (auto_draft entries are included in exports and remain editable — journalsFySql exportTool.ts:102 includes status 'auto_draft'; client_financial_statements likewise, db/v2/28-fns-reads.sql:626), so re-running the same parameters later yields different numbers; only the bytes' sha256 pins WHAT was produced, not FROM WHICH data state`

**What is wrong / missing** — "Reproducible" today means 're-run against whatever the books now say'. An auditor cannot regenerate or even fully characterize a filed artifact from its DB record — for analysis artifacts the defining queries are unqueryable, and for GL the filter is lost. Parameters + data-version capture are missing.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\analysisTool.ts:303

### `H-9` · **MEDIUM** · Export receipts and artifacts attribute everything to the literal 'agent': the requesting human is never recorded, and the fns accept any free-text actor
*Hero-prompt item: Audit trail — who exported*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:183 — interactive ToolContext actor is hardcoded 'agent'; exportTool.ts:177,189 pass ctx.actor into p_actor/created_by`
- `db/v2/25-fns-ops.sql:171,218 — record_export/record_export_artifact validate only non-blank actor; app.audit_actor (the verified-email constraint, db/v2/00-foundation.sql:212-229) is NOT applied here — and 'agent' is an accepted label under it anyway`
- `The only tie to the human is the per-user chat transcript — outside the export audit trail; firm_activity_feed shows the receipt with actor 'agent' (db/v2/25-fns-ops.sql:1141-1147 — export_receipts is source 5 of the feed union)`

**What is wrong / missing** — The audit trail cannot answer 'which member exported the whole ledger and when' — a basic confidentiality/accountability question for a firm handling client books. The JWT carries the caller identity; the fns simply do not capture it.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\runtime\openai\runtime.ts:183

### `H-12` · **LOW** · General-ledger export silently truncates any account beyond 200 pages (200k lines) with no error or truncation note; journals/documents exports are unbounded in memory
*Hero-prompt item: Standard exports — completeness of the produced file*

**Evidence**
- `agent/src/tools/exportTool.ts:313-323 — `for (let guard = 0; guard < 200; guard++)` per account (limit 1000/page); when the guard exhausts with has_more still true the loop just ends — pages collected so far are formatted as if complete`
- `agent/src/tools/exportFormat.ts:137-153 — generalLedgerCsv emits whatever pages it received; no truncation marker exists in the CSV or the PDF`
- `agent/src/tools/exportTool.ts:293-300 — journals/documents pull the entire result set into memory in one agent_select (the 5s statement timeout, db/v2/26-fns-session.sql:136, is the only bound)`

**What is wrong / missing** — An export presented as a complete audit ledger can be silently incomplete at pathological volume; the honest-truncation discipline the analysis lane has (MAX_TABLE_ROWS note, analysisTool.ts:140-143) is missing from the audited-scope lane where it matters more.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\exportTool.ts:313

### `H-13` · **LOW** · The SST return PDF/XLSX omit the form_map (SST-02 field mapping) rows that the CSV carries, while still counting them in rowCount
*Hero-prompt item: Standard exports — SST-02*

**Evidence**
- `agent/src/tools/exportFormat.ts:289-295 — sstReturnCsv emits a form_map row per entry`
- `agent/src/tools/reportModel.ts:323-330 — sstReturnDoc counts formCount into rowCount (`rowCount: 3 + byRate.length + formCount`) but builds only summary + by_rate sections — no form_map section is ever rendered`
- `Consequence: the branded 'SST Return' PDF lacks the very form-field mapping an SST-02 preparer needs, and its recorded row_count overstates its rendered content; the rowCount parity test (agent/test/reportRender.test.ts:85-93) passes only because both sides count the same number while one side does not render the rows`

**What is wrong / missing** — Format parity claim ('all three carry the same figures', SKILL.md:79-81) is false for sst_return: PDF/XLSX drop the form_map figures. The numeric rowCount parity masks a content non-parity for this one scope.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\reportModel.ts:323

### `H-14` · **LOW** · Doctrine drift cluster in the export skill: ghost Step 6, a reference asserting full/analysis are 'not yet wired', Hermes-era transport claims, a class ('permanent') the tool cannot produce, a picker stuck on CSV-only, and an implementation note billing the superseded hand-assembly pattern as 'the proven live pattern'
*Hero-prompt item: Export SKILL + references correctness*

**Evidence**
- `belcort/export/SKILL.md:164 — steps jump 5 → 7; :207 cites "the documented 23505 version-retry in Step 6" which no longer exists; :166-167 "Upstream Hermes has NO message-artifact field" and :30-31 `messaging.send_message` are retired-runtime references`
- `belcort/export/references/journals-csv-execution-pattern.md:30-31 — "Not yet wired: the full bundle and the ad-hoc VISUAL analysis report … never fabricate a file/card for an unwired scope" — contradicts SKILL.md:114-122/Step 5 and the shipped code (exportTool.ts:61 'full'; analysisTool.ts) — a model reading the reference may refuse wired capabilities; meanwhile SKILL.md:63 still bills this superseded reference as "the proven live pattern for FY journals CSV exports: … formatter invocation, upload_document call, and byte-level verification" — the exact hand-assembly lane the reference's own banner (:3-7) forbids`
- `belcort/export/SKILL.md:57-58 — instructs class 'permanent' for non-period registers, but EXPORT_SCOPES hardcodes documents/aging → 'generated' and sst_return → 'filings' (agent/src/tools/exportTool.ts:53-62); build_export accepts no class parameter at all`
- `dashboard/lib/reportsPicker.ts:13,23 — "Full bundle + PDF remain future scope"/"PDF deferred" are stale; the picker exposes only csv|bundle though all scopes render pdf/xlsx (exportTool.ts:239); agent/src/tools/registry/ops.ts:16-17,39 param docs omit xlsx/aging/sst_return/analysis`

**What is wrong / missing** — The doctrine is the runtime's behavioral spec (loaded verbatim into the model); contradictory/stale instructions produce refusals of wired features, wrong class expectations, and — worst — the SKILL's own implementation note (line 63) directs the model at the superseded hand-assembly pattern (formatter + upload_document) that the v2 invariant and the reference's banner exist to forbid.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\belcort\export\references\journals-csv-execution-pattern.md:29

### `H-15` · **LOW** · presentation-mapping.md still sanctions model-side statement composition (placing/netting TB figures, NBV = cost − accumulated depreciation) in tension with the DB-owned client_financial_statements
*Hero-prompt item: References — presentation-mapping.md*

**Evidence**
- `belcort/export/references/presentation-mapping.md:3-7 — "This reference is the agent's deterministic map from acc_type … to a statement line … it places the DB's signed nets into these lines" — the model doing FS presentation`
- `belcort/export/references/presentation-mapping.md:32-37 — §2 instructs net presentations ("Net book value = cost − accumulated depreciation", "Net sales = sales − returns inwards") — subtraction performed by whoever follows the doc, i.e. the model in chat`
- `The as-built statement pipeline is DB-owned end-to-end (db/v2/28-fns-reads.sql client_financial_statements → reportModel managementAccountsDoc), and belcort/year-end-close/SKILL.md:145-146 confirms "the DB owns the signed-net → SoFP/P&L mapping — you never place a figure into a statement line"; the reference is live-loaded doctrine (agent/test/loader.test.ts:52 asserts presentation-mapping loads into read_reference) — a live contradiction inside the export references directory`

**What is wrong / missing** — A model following this doctrine composes statement figures in its own text (netting = computing money), the exact class of output the export lane was rebuilt to prevent. Either the reference is dead (then it must say so like journals-csv-execution-pattern.md does) or it licenses in-chat model-computed statements.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\belcort\export\references\presentation-mapping.md:32

### `H-16` · **LOW** · Journals/documents/COA/client-name reads are agent-templated raw SQL through agent_select — not named read fns — and the journals FY window duplicates app.fye_period_start/end logic in agent code
*Hero-prompt item: Standard exports — do numbers come from DB read fns or model composition*

**Evidence**
- `agent/src/tools/exportTool.ts:91-124 — journalsFySql/journalsRangeSql/documentsSql/accountsSql are SQL strings built in agent TypeScript (deterministic code, NOT model text; identifiers guarded by sqlInt/sqlDate/sqlText :64-89) executed via ctx.query → agent_select (agent/src/runtime/openai/db.ts:58-65)`
- `agent/src/tools/exportTool.ts:91-104 vs db/v2/15-triggers.sql:78-91 — two independent FY-window definitions; re-verified equivalent in this audit by case analysis including the leap-February edge (fye_month=2, fy=2024 → both yield 2023-03-01..2024-02-29 via Postgres date clamping), but nothing keeps them in lockstep if D18 semantics ever change`
- `belcort/export/SKILL.md:98-99 claims build_export "reads the numbers from the authoritative DB fns" — true for 5 of 7 single scopes (client_trial_balance/trial_balance_range, client_general_ledger, client_financial_statements, ar_aging/ap_aging, get_sst_return; 'full' composes three of those); journals and documents are raw-SQL scopes`

**What is wrong / missing** — Not a model-composition leak (the SQL is compiled agent code), but the 'named audited read fns' claim is overstated and the duplicated FY-window rule is a drift trap: a future change to app.fye_period_start/end (or a client FYE change mid-flight) would silently desynchronize the journals export window from every other FY surface.

**What the rebuild must do** — C:\Users\zhant\Desktop\initial acc software skillmd\agent\src\tools\exportTool.ts:91

#### Verified as sound (workstream H)

- All eight standard export scopes exist and are wired: trial_balance, journals, documents, general_ledger, management_accounts (SoCI + SoFP = P&L + SOFP), aging (AR+AP), sst_return (SST-02 draft), and the combined 'full' client pack — each in CSV/PDF/XLSX (full = always one PDF).  ·  _evidence:_ `agent/src/tools/exportTool.ts:53-62 (EXPORT_SCOPES), :238-239 (format enum), :286-371 (per-scope DB reads), :391-406 (full-pack composition + forced ext='pdf' at :404); agent/src/tools/exportFormat.ts (all seven CSV shapers), agent/src/tools/reportModel.ts:335-346 (buildReportDoc dispatch)`
- On the build_export path, figures genuinely never pass through the model's text: the tool reads DB JSON server-side (rpc to client_trial_balance/trial_balance_range, client_general_ledger, client_financial_statements, ar_aging/ap_aging, get_sst_return; agent-templated SQL for journals/documents), shapes it once, and the CSV/PDF/XLSX layers only format cells (centsToDecimal/presentMoney/moneyToNumber).  ·  _evidence:_ `agent/src/tools/exportTool.ts:279-407; agent/src/tools/reportModel.ts:1-9,89; agent/src/tools/exportFormat.ts:17-53; agent/src/runtime/openai/db.ts:53-65`
- Exports are persisted as durable, versioned, firm-scoped artifacts — receipt (export_receipts) + write-once index row (export_artifacts, 7yr retain_until + legal_hold, per-firm unique object_key, version computed under an advisory lock with a unique backstop and a tool-side 23505 retry) — stored in a private write-once bucket (no UPDATE/DELETE storage policies, runtime upload upsert:false), with the object key derived server-side and belt-and-braces firm-prefix-checked in the tool layer.  ·  _evidence:_ `db/v2/14-tables-ops.sql:127-188; db/v2/25-fns-ops.sql:161-285; db/v2/storage-setup.sql:41-59; agent/src/main.ts:108-122; agent/src/tools/exportTool.ts:166-220 (23505 retry :182-199; the firm-prefix assert :203-206)`
- The CSV formatter is defensively correct: RFC-4180 quoting, formula-injection neutralization of leading =/+/-/@/TAB/CR (which deliberately apostrophe-prefixes negative values too — csvCell('-1') → "'-1", tested at agent/test/exportFormat.test.ts:126, a consumer-visible tradeoff), UTF-8 BOM + CRLF, BigInt-safe integer-cents→2dp (no floats in cell text), boolean/NaN guards.  ·  _evidence:_ `agent/src/tools/exportFormat.ts:12-53; agent/test/exportFormat.test.ts (exercises centsToDecimal negatives/strings, csvCell injection, and the per-scope shapers)`
- The download path is honest and scoped: the export_result card carries ONLY artifactId (never a URL/key), the dashboard fail-closed parses the card shape, listing is an RLS-direct select, and Download mints a fresh 10-minute signed URL on click via the session JWT with storage RLS as backstop.  ·  _evidence:_ `belcort/export/SKILL.md:181-184; dashboard/lib/artifacts.ts:415-435 (parseExportResult), dashboard/lib/exportArtifacts.ts:52-97 (signBooksUrl ttl 600 at :94), dashboard/components/rail/AgentCard.tsx:84-130, agent/src/http/sessions.ts:41-60 (fence extraction)`
- Ad-hoc agentic reporting exists and is structurally real: build_analysis_report takes a typed report specification (1-16 sections of {sql, render, money_columns, label_column, value_columns, note}), executes each SELECT server-side under RLS/agent_select, renders tables/bar/line/hbar/donut charts/KPI tiles into one branded PDF, stamps 'Analytical view — not an audited financial statement', prints every source query on a provenance page, files under the segregated 'analysis' class, and honestly caps/annotates truncation and empty results.  ·  _evidence:_ `agent/src/tools/analysisTool.ts (whole file, esp. :26-32 caps, :116-198 renders, :273-289 execution+provenance, :303-308 filing); agent/src/tools/pdfReport.ts:223-395; db/v2/14-tables-ops.sql:132-135,179-182 ('analysis' in the scope/class closed sets); agent/test/analysisReport.test.ts:94-148`
- The dashboard Reports picker is a deterministic parameterized intent (fixed 8-item menu, FY selector, exact skill grammar, RBAC-aware via can(role,'chat.use')), and the Files shelf derives current-version-per-coordinate folding read-only without recomputing any figure.  ·  _evidence:_ `dashboard/lib/reportsPicker.ts:17-47 + dashboard/lib/__tests__/reportsPicker.test.ts (exists); dashboard/components/reports/ReportsPicker.tsx:40-56; dashboard/lib/filesShelf.ts:1-70`
- The journals FY window in agent SQL is currently numerically identical to the DB's app.fye_period_start/end for all months including leap-February (re-verified by case analysis: fye_month=12 and 2 across year boundaries, including the 2024-02-29 clamp).  ·  _evidence:_ `agent/src/tools/exportTool.ts:91-104 vs db/v2/15-triggers.sql:78-91; db/v2/25-fns-ops.sql:122-137 (client_trial_balance uses the app helpers)`
- Render-layer test coverage exists for shape parity and output validity: rowCount parity CSV↔ReportDoc per scope, %PDF/%%EOF and PK-zip magic-byte smoke tests per scope, trial-balance balanced-flag + total-row test, analysis-lane section execution/scope-refusal/read-only-rejection/empty-set tests — but NOT for the management-accounts balanced float identity, the build_export balanced:true hardcode, or build_export's period/scope orchestration (no exportTool.test.ts in agent/test/).  ·  _evidence:_ `agent/test/reportRender.test.ts:69-128; agent/test/analysisReport.test.ts:94-148; absence verified: agent/test/ directory listing has no exportTool test file`

#### Unverified (workstream H) — could not be confirmed from frozen evidence; carried as open

- The audit brief itself was unavailable to the verifier too: 'undefined/audit-brief.md' does not exist (verified — the literal 'undefined' directory contains only maps/db-map.md). Verification proceeded on the task-text discipline (frozen repo read-only, file:line evidence, H-n IDs, severity critical/high/medium/low); if the brief's rubric differs, severities may need remapping.
- No code was executed against a live system: PDF/XLSX byte output, PostgREST jsonb numeric/bigint transport behavior (the H-5 truncate-vs-blank analysis is reasoned from row_to_json serialization + JSON.parse, not exercised live), and live storage-policy state (storage-setup.sql:7-12 notes the policy block must be applied by hand in the Dashboard SQL editor — the repo cannot prove what is applied in production) were reasoned from source. Exceptions verified by execution: the H-3 float-equality failure (Number('0.30') !== Number('0.10')+Number('0.20') → confirmed false) and the agent/test directory listing.
- Whether the model in practice ever uses the manual record_export_artifact + upload_document lane (H-1) — the code permits it, the upload_document tool description advertises it, and SKILL.md:63 points at its execution pattern, but no transcripts/live artifacts were examined.
- Whether any legacy dashboard export surface beyond the ReportsPicker/FilesShelf remains reachable (comments say the v1 ExportSheet retired at slice 5d; its removal from every route was not exhaustively proven).
- db/v2/tests functional coverage of record_export/record_export_artifact edge cases (dangling-reservation, NULL-fy version backstop) was not read file-by-file; the isolation suite's cross-firm coverage of these fns is asserted by the db map but the test bodies were not independently re-read.
- The exact behavior of a Supabase signed-URL mint for a nonexistent object (H-7 user-facing consequence) — inferred from the dashboard's generic error handling, not exercised.

#### Decision brief (workstream H)

> Verdict (adversarially re-verified — 12/16 findings CONFIRMED as drafted, 4 ADJUSTED on evidence/wording, 0 REFUTED): this is roughly two-thirds of a true agentic reporting engine — materially better than 'fixed templates only', but its central trust guarantee is opt-in rather than structural. What is real: eight standard scopes (TB, journals, GL, documents, management accounts = P&L+SOFP, AR/AP aging, SST-02 draft, full pack) in CSV/PDF/XLSX; five of seven single scopes read named DB fns and the DB genuinely owns those figures; a genuine ad-hoc lane (build_analysis_report) where Clara translates intent into a typed section spec (SQL + render + money labels), the DB executes under RLS, and a deterministic renderer produces branded PDFs with tables/charts/KPIs, an 'analytical view' stamp, and a printed provenance page; and a serious artifact discipline — receipts, write-once versioned server-keyed artifacts, 7-year retention, private write-once storage, artifactId-only cards, mint-on-click signed URLs, a version-folded Files shelf. No DOCX anywhere; analysis is PDF-only; the picker still exposes CSV-only. What breaks the 'true engine' claim: (1) the figures-never-pass-through-the-model invariant is enforceable only if the model cooperates — record_export_artifact + upload_document(content_base64) let model-authored bytes become indistinguishable audited artifacts (H-1: every prohibition is prose, and the doctrine self-contradicts — SKILL.md:63 still bills the hand-assembly pattern as 'the proven live pattern'), and the analysis lane launders SQL literals and free-text commentary under a banner asserting the database computed everything (H-4); (2) assurance honesty is broken — build_export hardcodes balanced:true onto every card while the PDF seal is agent-recomputed in floats with an execution-verified false negative (H-2/H-3); (3) auditability is shallower than it looks — no requesting-human attribution, no stored report spec or data-version anchor, phantom-artifact reservations never reconciled, no post-hoc integrity check (H-7/H-8/H-9); (4) safety gates are prose — the whole-ledger client confirm, the read-only SQL guard (whose in-code comment falsely claims a Postgres backstop against SELECT-wrapped DEFINER writes), and the 'bookkeeper+ download' all exist in doctrine but not in code (H-6/H-10/H-11). For the rebuild: PORT the format/renderer/report-model stack, the artifact taxonomy/versioning, and the analysis section-spec concept largely as-is; REBUILD the trust seams in the DB — server-verified balanced, sha256-verified stored artifacts with status, captured caller identity and full request spec, structural (not lexical) read scoping, and make the receipt→artifact→bytes pipeline the ONLY way bytes enter the exports tree; DROP the stale Hermes-era doctrine (ghost Step 6, the 'not yet wired' reference text, SKILL.md:63's superseded implementation note, presentation-mapping's model-side netting license).

---

## Workstream I — Skills & harness architecture

### `I-1` · **CRITICAL** · Every skill's DB-ACCESS CANON calls query_books "read-only", but agent_select is a lexical guard that lets a SELECT-wrapped SECURITY DEFINER write-fn mutate — the read tool is added under every wake policy, bypassing the write-gate + actor injection
*Hero-prompt item: I-guardrails (skill tool safety vs registry)*

**Evidence**
- `belcort/AGENTS.md:29 tells the agent query_books is 'a single read-only, RLS-scoped SELECT'; the same 'read-only / EXECUTE-only, no raw SQL write path' framing repeats in coa-coding/SKILL.md:40, review-queue/SKILL.md:63, doc-ingest/SKILL.md:35-39, kb-evolve/SKILL.md:44-46, bank-recon/SKILL.md:30-31, period-entries/SKILL.md:33-40, firm-bootstrap/SKILL.md:66-79, client-onboarding, rule-edit/SKILL.md:20-27, year-end-close/SKILL.md:17-19 — all 11 skills present query_books as a safe read surface.`
- `db/v2/26-fns-session.sql:119-140 agent_select is SECURITY INVOKER with a purely lexical guard: line 134 blocks the whole words insert|update|delete|merge|truncate|drop|alter|grant|revoke|create|copy|call but NOT a function call, so `select draft_entry('{...}'::jsonb)` or `select approve_entry(1,2,'x')` passes the ^(select|with) anchor + verb scan and reaches `execute format('select ... from (%s) __q', p_sql)`.`
- `The wrapped fns are SECURITY DEFINER granted to authenticated (db/v2/20-fns-journal.sql:120 draft_entry, :212 approve_entry, and the other journal writers all `security definer set search_path`), so the definer executes the mutation; the fn's own firm-scope re-check still fires (cross_firm_denied) so RLS bounds it to the caller's firm, but WITHIN-firm the write commits.`
- `agent/src/tools/sqlGuard.ts:1-6,15-17 assertReadOnlySql is self-described 'Defence-in-depth ONLY' and blocks the same verbs, not function-call nodes; agent/src/tools/buildTools.ts:375 pushes queryToolDef() unconditionally under EVERY policy (interactive + proactive + documents + workbench-kb), so a SELECT-wrapped writer skips policyAllows/enforceScope/injectActor entirely (buildTools.ts:98-104 only guards buildFnToolDef, not queryToolDef).`

**What is wrong / missing** — The doctrine loaded verbatim into Clara's resident prompt (AGENTS.md §1 via loader.ts:94) tells the agent — and any auditor reading the skills — that query_books is a safe read surface. In fact it is the known SDT-001/SEC-001 mutation-bypass path: a SELECT-wrapped SECURITY DEFINER writer skips the tool layer's per-wake write-gate, scope-gate, and p_actor anti-spoof attribution. RLS still prevents cross-firm writes, but an injected instruction that reaches the SELECT string, or a model over-reach, can draft/approve/reverse/close WITHIN the firm through the 'read' tool under any wake policy — defeating the speak-never-act guarantee the per-wake policy is meant to enforce.

**What the rebuild must do** — The rebuilt read tool must be structurally read-only — a parameterized/whitelisted read surface (named views or a query builder over allowed tables), OR agent_select must run under a role with EXECUTE revoked on the write-fns (or parse for function-call nodes, not just verbs). Until then no skill may describe query_books as inherently safe; the guardrail must live in code, not prose.

### `I-2` · **HIGH** · The [documents] wake tool policy is a BLOCKLIST, not an allowlist — a document_triaged wake can reach approve_entry / reverse_entry / run_depreciation / record_year_end_close; only skill prose narrows it to 4 triage verbs
*Hero-prompt item: I-guardrails (wake policy vs doctrine)*

**Evidence**
- `agent/src/tools/buildTools.ts:25 WRITE_ALLOW.documents = (n) => !['create_firm','onboard_client','seed_client_coa','seed_client_knowledge','seed_opening_carry_forward'].includes(n) — every write tool EXCEPT those five onboarding fns is permitted in the [documents] lane; approve_entry/reject_entry/edit_entry/reverse_entry/reverse_year_end_close/record_year_end_close/run_depreciation/dispose_fixed_asset/build_export all pass.`
- `The scope-gate still applies (buildTools.ts:54-79 enforceScope) but a [documents] wake resolves scope.clientId to the wake's own client_id, so approve_entry(entry, that_client) satisfies match_client — nothing structurally blocks it.`
- `The narrowing is prose only: agent/src/runtime/inject.ts:38-39 frames the lane '[documents] Act on the human\'s verb (assign/reassign/code/sample) via review-queue'; belcort/AGENTS.md:54 '[documents] — MAY act on the human\'s verb (code / assign / reassign / mark-sample)'; review-queue/SKILL.md:226-293 implements only those four verbs ('Reconcile, do NOT code… never auto-code on assign').`
- `The trigger is a human-actor document_audit INSERT (db/v2/25-fns-ops.sql:1526-1529 trg_pn_doc_triage fires belcort_proactive_emit('document_triaged') when new.actor is distinct from 'agent').`

**What is wrong / missing** — The safety of the [documents] lane rests entirely on the model obeying skill prose plus injection defence — not on the code policy. The code policy is more permissive than the doctrine's own stated intent (AGENTS.md §7 lists exactly four triage verbs). A second-order-injected document_audit/OCR free-text row, or a model that over-reaches, can in principle drive a posting, approval, reversal, or year-end close from a non-interactive wake with no human in the loop. NOTE (adjustment): the draft cited 'PRD §6.10' and 'backend.md:92' as contradicted — PRD.md:96 §6.10 speak-never-act is scoped to `[proactive]` ONLY, not `[documents]`, so it is NOT the contradicted contract; the genuinely over-broad statement is backend.md:92 'Every wake is speak-never-act', which the [documents] design (act-on-verb) already breaks by intent. The real defect is defence-in-depth: a blocklist where an allowlist belongs.

**What the rebuild must do** — The [documents] wake policy must be an explicit ALLOWLIST of exactly the triage verbs its handler needs (assign_document, reassign_document, mark_document_sample, request_document_coding, and the coa-coding draft/finalize chain for the code verb) — never a blocklist. Posting-class and destructive fns (approve_entry, reverse_entry, record_year_end_close, run_depreciation, edit_entry) must be structurally unreachable from any wake lane.

### `I-3` · **HIGH** · Whole accounting-lifecycle capabilities are implemented in the DB and dashboard but have NO agent SKILL — Clara cannot drive AR/AP, fixed-asset runs, tax computation, SST returns, or recurring/accrual postings via chat
*Hero-prompt item: I-coverage (lifecycle workflows with NO skill)*

**Evidence**
- `db/v2 defines these fns granted to authenticated with NO belcort/*/SKILL.md that teaches them: AR/AP subledger — record_ar_invoice/allocate_ar_receipt/write_off_ar_invoice/record_ap_bill/allocate_ap_payment/customer_statement/supplier_statement (db/v2/23-fns-subledger.sql:83,157,223,306,373,671,675); tax — compute_tax_draft/get_tax_computation (db/v2/23d-fns-tax.sql:45,465); SST return — compute_sst_return (db/v2/23e-fns-sst.sql:112; get_sst_return:823 appears only as an export SCOPE in export/SKILL.md:56, not a preparation skill); fixed assets — record_fixed_asset/run_depreciation/dispose_fixed_asset (db/v2/23b-fns-fixed-assets.sql:37,131,242); recurring/accrual/amortisation — create_recurring_journal/record_accrual/create_amortisation_schedule/run_recurring_journals/run_amortisation (db/v2/23c-fns-adjustments.sql:35,222,294,126,384); members/RBAC — create_invite/accept_invite/set_member_role/remove_member (db/v2/24b-fns-members.sql:31,81,183,203).`
- `Grep of belcort/ confirms the only mentions are incidental, not driving skills: run_recurring_journals/run_amortisation appear once in year-end-close/SKILL.md:59 ('have the user run them' inside the pre-close gate); run_depreciation once in client-onboarding/SKILL.md:252 (carry-down baseline note); the AR/AP/tax/SST/FA/members write-fns have ZERO skill references.`
- `Dashboard surfaces exist for the un-skilled capabilities: dashboard/components/tax/TaxComputation.tsx, SstReturn.tsx (a human can drive them in the UI); belcort/AGENTS.md:9 scopes Clara's mandate to coding transactions + escalating.`

**What is wrong / missing** — The DB and dashboard implement a full Malaysian practice platform (AR/AP subledger, FA register, tax computation, SST return, adjustments), but the 11 skills cover only ingest→code→review→learn→reconcile→export→year-end-close — the document-coding loop. Every capability above is reachable by a human in the dashboard yet invisible to Clara: she cannot raise an AR invoice, allocate a receipt, run/dispose depreciation, prepare a tax computation or an SST-02 return, or post a recurring journal/accrual from chat. This is the single largest gap between the 'conversational super-UI over the whole product' North Star and the shipped agent doctrine.

**What the rebuild must do** — The rebuild needs new (or consolidated lifecycle) skills mapped 1:1 to the built fn families: an AR/AP-management skill, a fixed-asset skill, a tax-computation skill, an SST-return skill, a recurring-and-accruals skill, and a members/RBAC skill — each product-mapped to its fns with the correct scope/policy and a progressive-disclosure trigger.

### `I-13` · **MEDIUM** · Salvage classification: of 11 SKILL.md, ~3 are light PORTs and ~6 REBUILDs; SOUL.md + the _shared contracts PORT; AGENTS.md REBUILD; the GL PDFs + two export references DROP/REBUILD
*Hero-prompt item: I-salvage (per-skill PORT/REBUILD/DROP)*

**Evidence**
- `PORT verbatim: SOUL.md (grep for Hermes/Telegram/send_message/Google/code_execution → 0 hits, clean persona); _shared/myinvois-reference.md (myinvois-reference.md:41-44 verified RM1M threshold, no RM500k band, cancellation recorded).`
- `PORT (light edit): bank-recon/SKILL.md (Step 4 has a mid-sentence paste error at :94-96 that interrupts the draft_entry/finalize_coding instruction), rule-edit/SKILL.md (specify the missing Steps 1-2 client picker; drop Telegram phrasing at :53), period-entries/SKILL.md (drop 'Plain send_message' at :66).`
- `REBUILD (high-value domain content + material drift/defects): coa-coding (SST hybrid ladder :174-229 + CN/DN polarity :231-234 are crown jewels — fix the I-8 code_execution line at :40), client-onboarding (BEE negative-equity carry-down worked example :280-294 is gold — fix no-Phase-C, 13-vs-14 marker, record_opening_balances-superseded), review-queue (531 lines; split the [documents]/[proactive] wake handlers out; fix the I-2 blocklist in CODE; drop Telegram; add the missing Step 2), kb-evolve (learning loop sound — fix the Step 1→3a gap), doc-ingest (fix Telegram inflow + move any 'NOT WIRED' UBL block to a reference), year-end-close (rich close content — fix front-matter + the missing When-this-fires I-11 + the full-unwired I-9), export (build_export orchestration sound — fix the I-9 bundled-reference contradiction + the Step-6 dangling cite).`
- `AGENTS.md REBUILD (§6 wrong OCR vendor I-5, §15 tool drift I-4, Hermes header/firm-bootstrap residue I-6 — the 20-mandate shape is right; refresh contents). DROP/REBUILD references: 3× GL PDF DROP (I-12), journals-csv-execution-pattern.md REBUILD-or-DROP (I-9), presentation-mapping.md REBUILD (906-000 stale flag I-10), _shared/ocr-cache-schema.md REBUILD (stale engine enum I-5, producer drift I-12).`

**What is wrong / missing** — Roughly half the skill corpus carries stale v1 residue (Hermes/Telegram/code_execution/unwired-feature claims) that would be inherited wholesale if the rebuild copies the tree; yet the domain content (SST ladder, carry-down, tax provision, learning loop) is genuinely valuable and must not be lost in a from-scratch rewrite.

**What the rebuild must do** — Rebuild plan: PORT the clean _shared assets + SOUL + the 3 light-edit skills near-verbatim; REBUILD the 6 domain-heavy skills by extracting their accounting logic into fresh, drift-free bodies mapped to the current registry; REBUILD AGENTS.md against the live tool set; DROP the dead PDFs/__init__.py and the self-contradicting references. Preserve the proven domain examples (BEE carry-down, SST hybrid, CN/DN polarity) as tested fixtures.

### `I-4` · **MEDIUM** · AGENTS.md §15 claims to be THE audited-function inventory but has drifted from the built registry in BOTH directions — it omits registered tools and lists a fn that has no ToolSpec
*Hero-prompt item: I-tools (AGENTS.md §15 inventory vs registry)*

**Evidence**
- `OMISSIONS verified — registered ToolSpecs absent from §15: set_coa_account_type (registry/journal.ts:118), add_bank_account (registry/documents.ts:131), record_fixed_asset/run_depreciation/dispose_fixed_asset (registry/fixedAssets.ts:11,37,60), seed_opening_carry_forward (registry/onboard.ts:61), and the read journal_entry_detail (registry/reads.ts:41) — none appear in AGENTS.md §15 (verified by grep of belcort/AGENTS.md). Plus the non-registry tools upload_document/extract_document/build_export/build_analysis_report/read_skill/read_reference (buildTools.ts:379-388) are not in §15.`
- `REVERSE drift: belcort/AGENTS.md:75 lists `unmatch_bank_line` in the documents/recon inventory, but there is NO unmatch_bank_line ToolSpec (grep of agent/src/tools/registry/* finds none; the fn exists in db/v2/22-fns-documents-recon.sql:522 and is deliberately handled surface-only, so the agent has no tool to call it) — the inventory advertises a tool the agent cannot invoke.`
- `CORRECTION to the draft: record_recon_hint/promote_recon_hint/retire_recon_hint ARE present in §15 (AGENTS.md:75), and seed_client_knowledge + update_client_profile ARE present (AGENTS.md:76) — the draft wrongly listed all five as omitted.`
- `Superseded-in-place confirmed: belcort/AGENTS.md:77 still lists record_opening_balances (registered ops.ts:91) while client-onboarding/SKILL.md:296-298 declares it superseded by seed_opening_carry_forward for a carry-down; both are live and §15 gives no precedence rule.`

**What is wrong / missing** — §15 is loaded verbatim as Clara's resident 'these are your audited functions' mandate (loader.ts:94). It lags the registry (the agent's own charter under-describes set_coa_account_type, the FA tools, build_analysis_report, etc.), advertises unmatch_bank_line which is not a callable tool, and carries record_opening_balances vs seed_opening_carry_forward with no precedence. For an inventory that claims completeness the bidirectional drift is a correctness defect, not cosmetics — though smaller than the draft implied (several tools it flagged as missing are in fact listed).

**What the rebuild must do** — Either generate the resident tool list from the registry at load time (single source of truth) or drop the claim-to-completeness and point to the registry. If kept by hand, regenerate on every registry change, remove non-tool entries (unmatch_bank_line), and carry an explicit superseded/preferred rule for overlapping fns.

### `I-5` · **MEDIUM** · AGENTS.md §6 names the OCR engine as 'Google Document AI' — the as-built engine is Azure Document Intelligence; three different OCR identities exist across the doctrine/code tree
*Hero-prompt item: I-ambiguity (wrong OCR vendor in verbatim doctrine)*

**Evidence**
- `belcort/AGENTS.md:50 §6: 'the runtime OCRs the bytes through a deterministic engine (Google Document AI) SERVER-SIDE'.`
- `As-built is Azure: agent/src/ocr/azureDocai.ts:1-9 implements Azure AI Document Intelligence v4.0 REST (prebuilt-layout, api-version 2024-11-30); agent/src/main.ts:25,59,124-130 wires makeAzureDocaiOcr; docs/architecture/backend.md:89 names 'Azure Document Intelligence'.`
- `The stale 'Google Document AI' string also survives in code comments: agent/src/tools/buildTools.ts:310 and agent/src/tools/types.ts:95 (ToolContext.ocrDocument doc-comment).`
- `belcort/_shared/ocr-cache-schema.md:36 carries a THIRD, v1-era engine vocabulary: engine enum 'pymupdf (text PDF) | marker-pdf (scanned/OCR)'; doc-ingest/SKILL.md:3 alone is vendor-agnostic ('deterministic Document-AI OCR').`

**What is wrong / missing** — The doctrine file the live agent loads (AGENTS.md §6) names a vendor BELCORT does not use, and the shared OCR-cache contract names two more stale engines. Three OCR identities exist; at most one is as-built. This is a provenance/integrity defect in a document that must be authoritative, and it misleads any engineer or auditor reasoning about the OCR path.

**What the rebuild must do** — Standardise on the real engine (Azure Document Intelligence) in AGENTS.md §6, the ocr-cache-schema engine enum, and the buildTools/types code comments — or make them vendor-agnostic ('the deterministic OCR engine') and pin the vendor once, in the deploy/runtime doc only.

### `I-6` · **MEDIUM** · Decommissioned Hermes/v1 instructions live inside the verbatim-loaded v2 doctrine — a pointer to a DEPLOY.md that does not exist, and a 'Hermes session memory' persistence step the v2 runtime cannot honor
*Hero-prompt item: I-ambiguity (Hermes/v1 residue in the v2 canon)*

**Evidence**
- `belcort/firm-bootstrap/SKILL.md:107-109 'Human prerequisite… Hermes is installed, the belcort profile exists… See DEPLOY.md.' — no DEPLOY.md exists anywhere in the repo (verified: Glob **/DEPLOY.md → none).`
- `belcort/firm-bootstrap/SKILL.md:292-293 failure-mode: 'User picks /pause mid-interview: persist partial answers to Hermes session memory; on next turn, resume' — the v2 runtime has no such store (interview state is in-conversation per firm-bootstrap:50-51; run/clarify state is process-local per agent/src/runtime/openai/runtime.ts:136 `private readonly runs = new Map`), so the instruction is unfulfillable.`
- `All 11 SKILL.md carry a metadata.hermes front-matter block (grep 'hermes:' → 11/11 files); firm-bootstrap/SKILL.md:302 and client-onboarding/SKILL.md:391 say 'Does NOT touch <HERMES_HOME> paths' — dangling v1 references. AGENTS.md:3-5 states belcort/ is loaded verbatim, so all of this is live prompt content.`

**What is wrong / missing** — Clara's resident instructions reference a retired runtime (Hermes), a non-existent runbook (DEPLOY.md), and a persistence mechanism the current runtime lacks. A capable model may follow the DEPLOY.md pointer or rely on 'session memory' that will silently drop the interview on a restart — the exact process-local-state fragility the runtime already has.

**What the rebuild must do** — Purge all Hermes/DEPLOY.md/HERMES_HOME/session-memory residue from the doctrine. Re-ground the /pause-resume story on whatever durable state the rebuilt runtime provides (DB-backed runs/checkpoints), and rename/remove the metadata.hermes front-matter block.

### `I-7` · **MEDIUM** · Multiple doctrine files still teach Telegram inline_keyboard + messaging.send_message mechanics for a v2 runtime that has neither; AGENTS.md §4 itself says the tool does not exist
*Hero-prompt item: I-ambiguity (Telegram / send_message residue)*

**Evidence**
- `belcort/review-queue/SKILL.md:16-47 header teaches Telegram inline_keyboard buttons + messaging.send_message, cites 'R.6 (Telegram batch UX)' (a plan doc not in the repo), and description L3 says cards surface 'on Telegram/Web'.`
- `Telegram/send_message references also in coa-coding/SKILL.md:30-31 ('clarify_tool stays canonical for Telegram'), doc-ingest/SKILL.md:18-19 (messaging.send_message), rule-edit/SKILL.md:35,53 ('Bookkeeper Telegram phrases'), period-entries/SKILL.md:66 ('Plain send_message').`
- `belcort/AGENTS.md:45-46 §4: 'there is no messaging.send_message tool — plain prose IS its equivalent'; the runtime has no Telegram transport (agent HTTP surface is SSE/web only). A literal messaging.send_message call would hit the SDK's toolNotFoundBehavior='raise_error' hard-fail path (buildTools.ts:130-133 note).`

**What is wrong / missing** — The doctrine repeatedly instructs the agent to use a transport (Telegram) and a tool (messaging.send_message) that do not exist in v2, relying on the model to reinterpret 'plain send_message' as 'plain prose'. A literal reading produces a failed/absent tool call, and the Telegram-card framing muddies the actual (web/SSE + fenced-artifact) card mechanics.

**What the rebuild must do** — Strip Telegram and messaging.send_message from every skill; state the real surface (web chat + SSE, clarify_tool for pauses, fenced je_review/export_result blocks for cards). The clarify-tool-card-patterns reference should describe the web renderer, not Telegram inline_keyboard.

### `I-8` · **MEDIUM** · coa-coding/SKILL.md:40 says 'Python stays fine for OCR / code_execution' — contradicting the no-code_execution rule stated in six sibling skills and enforced structurally in the runtime
*Hero-prompt item: I-ambiguity (code_execution contradiction)*

**Evidence**
- `belcort/coa-coding/SKILL.md:40, inside the DB-ACCESS paragraph of the highest-throughput skill: '(Python stays fine for OCR / code_execution.)'`
- `The opposite is stated in doc-ingest/SKILL.md:39 ('this v2 runtime has NO code_execution / Python sandbox; never plan a step that runs code'), firm-bootstrap/SKILL.md:79, export/SKILL.md:96, year-end-close/SKILL.md:27, bank-recon/SKILL.md:41, period-entries/SKILL.md:39-40.`
- `Structurally enforced: agent/src/tools/registry.ts:57-74 BANNED_TOOL_TOKENS blocks shell/exec/psql/file/fetch/http/browser tool names, and there is no code_execution tool anywhere in agent/src/tools/*; the only 'code_execution' strings in agent/src are NEGATIONS in exportFormat.ts:2-4 ('the v2 OpenAI-Agents-SDK runtime has NO code_execution').`

**What is wrong / missing** — A single stale v1 line inside the most-used coding skill tells the model that a Python/code_execution capability exists. If believed, the model may plan a code_execution OCR/formatting step that has no tool to execute it, producing a dead-end or a fabricated result — in the exact skill that drafts journal entries.

**What the rebuild must do** — Delete the code_execution line from coa-coding; the no-code_execution invariant should be stated once in AGENTS.md and inherited, not restated (correctly six times, incorrectly once) across skills.

### `I-9` · **MEDIUM** · Two loadable export texts tell the agent the `full` pack and the analysis report don't exist — both are wired in code
*Hero-prompt item: I-ambiguity (full/analysis 'unwired' contradiction)*

**Evidence**
- `belcort/export/references/journals-csv-execution-pattern.md:30-31 'Not yet wired: the full bundle and the ad-hoc VISUAL analysis report (charts/KPIs) — say so honestly; never fabricate a file/card for an unwired scope.'`
- `belcort/year-end-close/SKILL.md:151-153 'The full multi-file bundle is still unwired — don\'t fabricate one.'`
- `Contradicted by belcort/export/SKILL.md:114-117 (full pack described as wired) and by code: agent/src/tools/exportTool.ts:61 EXPORT_SCOPES includes full, :238 lists full in the scope enum, :276 requires fy, :355 handles scope==='full' composing a combined PDF, :404 forces pdf; agent/src/tools/analysisTool.ts implements build_analysis_report (buildTools.ts:388 wires it under interactive + documents).`

**What is wrong / missing** — When year-end-close or the journals-CSV reference is loaded (progressive disclosure), the agent is told a working feature is unavailable and instructed to refuse it. A user asking for the full client pack via year-end-close, or the agent citing the CSV reference, will wrongly decline or 'honestly' say it is unwired.

**What the rebuild must do** — Update both stale texts to match export/SKILL.md and exportTool.ts (full + build_analysis_report are wired). Better: remove the journals-csv-execution-pattern reference (kept 'only as a pointer' yet now misinforms) and delete the year-end-close 'still unwired' caveat.

### `I-10` · **LOW** · presentation-mapping.md still instructs the agent to FLAG 906-000 as mis-typed OI — the seed was corrected to EP on 2026-06-27, so the instruction now generates false escalations
*Hero-prompt item: I-ambiguity (906-000 stale flag)*

**Evidence**
- `belcort/export/references/presentation-mapping.md:58-63 '906-000 UPKEEP OF MOTOR VEHICLE is seeded acc_type=OI (other income) but is an expense (EP). When this account appears with a balance, FLAG it to the user.'`
- `db/v2/24-fns-onboard.sql:214 `('906-000','UPKEEP OF MOTOR VEHICLE','EP',null,null,null),  -- fixed 2026-06-27: was mis-typed 'OI'` — the seed now types it EP, so any client onboarded after the fix has no discrepancy to flag.`
- `presentation-mapping.md:66-69 notes record_year_end_close independently RAISES unclassified_acc_type as the real backstop.`

**What is wrong / missing** — For every client seeded after 2026-06-27, the reference tells the agent to raise a false 'this account is mis-typed' flag on the management-accounts cover note, eroding trust in the agent's flags. It is correct only for pre-fix legacy data, which the reference does not scope.

**What the rebuild must do** — Scope the flag to legacy clients only, or remove it (the seed is fixed and record_year_end_close is the real backstop).

### `I-11` · **LOW** · Step/phase numbering gaps and dangling cross-references riddle the verbatim-loaded procedure bodies, and year-end-close has no '## When this fires' so its routing trigger renders empty
*Hero-prompt item: I-ambiguity (structural defects in verbatim procedure text)*

**Evidence**
- `belcort/review-queue/SKILL.md step headings run Step 0,1,3,4,5 (verified by grep '### Step') — there is no Step 2.`
- `belcort/export/SKILL.md headings jump Step 5→7 (no Step 6) yet Step 7's error section at :207 cites 'the ONLY sanctioned retry is the documented 23505 version-retry in Step 6' — Step 6 does not exist.`
- `belcort/kb-evolve/SKILL.md jumps Step 1→3a (no Step 2/3); belcort/rule-edit/SKILL.md's only numbered step is 'Step 3' (:64) with the Step 1-2 client-picker referenced but never specified.`
- `belcort/client-onboarding/SKILL.md:3 says 'across 4 phases' then the body runs Phase A, B, D, D-seed, E (grep '## Phase') — there is NO Phase C; and a '[[step:14/14:sample_invoices]]' marker (:156-163) appears inside a 'Phase A — Identity interview (13 questions)' (:71).`
- `belcort/year-end-close/SKILL.md has NO '## When this fires' heading (grep count 0; headings are Step 0/1/2/3/4 + 'Adjustments after a close'), so agent/src/doctrine/frontmatter.ts:62 section('when this fires') returns '' and loader.ts:66 renders that skill's routing line with no 'Fires:' trigger.`

**What is wrong / missing** — The bodies are served verbatim to the model on demand (read_skill), and the routing menu is the model's only trigger index. Missing steps, a citation to a non-existent Step 6, a 13-vs-14 marker mismatch, and an empty 'When this fires' for the most consequential skill (year-end close) each force the model to reconcile an inconsistency at decision time and weaken routing.

**What the rebuild must do** — Renumber every skill's steps/phases contiguously, fix or remove the export Step-6 citation, reconcile the client-onboarding phase/question counts, and give year-end-close a '## When this fires' block so its routing trigger renders. Treat the loaded body as executable spec, not prose.

### `I-12` · **LOW** · A 39KB binary PDF is shipped byte-identically in three skill dirs but the loader only serves .md references — the PDFs are never loaded (dead weight); an empty __init__.py v1 artifact remains; the flat OCR-cache producer drift is carried as permanent 'aspirational' debt
*Hero-prompt item: I-salvage (dead/duplicate reference assets)*

**Evidence**
- `belcort/coa-coding/GL-Account-TaxNIndustriesCode.pdf, belcort/review-queue/GL-Account-TaxNIndustriesCode.pdf, belcort/rule-edit/GL-Account-TaxNIndustriesCode.pdf are byte-identical (39372 bytes each; SHA256 9063DB4D…F73F3 for all three, verified).`
- `agent/src/doctrine/loader.ts:142 loads references from each skill's references/ dir but filters `.endsWith('.md')` only, and read_reference serves by basename over that .md set — a PDF is never loaded or servable; the three PDFs are never seen by the agent.`
- `belcort/__init__.py is 0 bytes (verified) — a v1 Python-package artifact meaningless in the TS runtime.`
- `belcort/_shared/ocr-cache-schema.md:14-24 documents that the live agent writes a FLAT {text,fields,confidence,…} record while the nested belcort_ocr_cache.v1 envelope is 'target/aspirational, not yet produced' (SP-6.4 deferred), with consumers coalescing both shapes — a producer/consumer drift every doc-consuming skill must code around.`

**What is wrong / missing** — The three GL PDFs are pure repo/doctrine bloat that can never inform the agent (wrong file type for the loader), and __init__.py is dead v1 residue. The OCR-cache schema simultaneously documents a target shape the producer never emits and instructs all consumers to defensively read the other shape — permanent aspirational debt that complicates every doc-consuming skill.

**What the rebuild must do** — DROP the three duplicate PDFs (or convert their content to a single loaded .md reference if the COA/tax mapping is needed) and the empty __init__.py. For the OCR cache, pick ONE shape as the rebuild contract and make the producer emit it, retiring the coalesce-both adapter.

### `I-14` · **LOW** · The agentic security core is real and code-enforced, but the interview clarify-loop reliability is propped up by a hardcoded flow-control directive injected into every clarify result, and the 'cards' are fenced-text re-extraction, not a native artifact lane
*Hero-prompt item: I-agentic-vs-hardcoded*

**Evidence**
- `Genuinely agentic + code-enforced (holds regardless of skill prose): the p_actor anti-spoof injection (agent/src/tools/buildTools.ts:82-89 overwrites any model-supplied actor), the active-scope write-gate (buildTools.ts:54-79), the per-wake tool policy (buildTools.ts:19-33), and progressive disclosure (read_skill/read_reference over pre-loaded bodies, loader.ts:44-53 + buildTools.ts:157-202).`
- `Hardcoded plumbing compensating for model behavior: agent/src/runtime/openai/tools.ts:56-63 the clarify_tool execute returns the human answer PLUS a hardcoded '[flow-control]' directive re-stating the interview loop discipline on EVERY clarify result — the comment (:57-60) says the model tends to yield its turn after a clarify result. The same discipline is also stated in AGENTS.md §4 and firm-bootstrap:32-40 / client-onboarding:35-43.`
- `The je_review/export_result 'cards' travel as fenced JSON in assistant text, re-extracted at read (agent/src/http/sessions.ts:43-59 ARTIFACT_FENCE regex + extractFencedArtifact), not a native SDK typed-artifact lane.`

**What is wrong / missing** — The 'genuinely agentic vs hardcoded plumbing' question resolves to: the security/attribution/scoping/progressive-disclosure layer is genuinely agentic and code-enforced (keep it), but the multi-question interview reliability is carried by a hardcoded per-turn directive injection and triple-stated prose, and the card system is fenced-text extraction, not a native artifact channel. Copying the skills without the tools.ts flow-control shim would regress onboarding to the 'stops after Q1' bug the shim was written to fix.

**What the rebuild must do** — In the rebuild, keep the code-enforced write-gate/actor/policy/progressive-disclosure core. Decide deliberately whether the interview loop should stay a prompt shim or move to a durable, runtime-owned checkpointed multi-step flow, and whether cards should become a native typed artifact lane — so the doctrine no longer has to over-state the loop discipline three times.

### `I-15` · **LOW** · Signal file harness-improvement-report: its top recommendations were ALREADY ADOPTED in the installed dev-harness plugin (3.2.1) — the report is largely satisfied, not outstanding
*Hero-prompt item: I-signal (harness-improvement-report verification)*

**Evidence**
- The signal file (on the owner's Desktop, dated 2026-05-07, analysing harness 2.3.0) recommends a mandatory User-Journey-Simulation phase between BUILD and EVALUATE and evaluator-plugin integration.
- `Verified in the installed plugin ~/.claude/plugins/cache/belcort-harness/harness/3.2.1: SIMULATE is now a generator MODE (agents/generator.md contains 21 'SIMULATE' occurrences; commands/sprint.md:73 lists generator modes 'NEGOTIATE, FINALIZE-CONTRACT, BUILD, SIMULATE', :88 'T7 Simulate', :264 '3.5. Simulate — drive prod-mode runtime'; templates/features/simulation-report.md.txt exists). agentlint + security-guidance are integrated into the evaluator (evaluator.md matches agentlint/security-guidance).`

**What is wrong / missing** — The improvement report reads as an outstanding to-do list, but its highest-ROI items (the simulation phase, evaluator plugin integration) are already shipped in the harness version actually installed. Treating it as open work would duplicate effort. NOTE: this signal concerns the belcort-HARNESS dev-pipeline plugin (Planner/Generator/Evaluator), which is separate from the belcort/ accounting doctrine that is the substance of Workstream I.

**What the rebuild must do** — Report to the owner that the improvement-report's key recommendations are already in 3.2.1; scope any further harness-plugin work to residual items rather than re-adding the simulation phase. Keep the accounting-doctrine audit (I-1..I-14) separate from dev-plugin refinement.

### `I-16` · **LOW** · Signal file harness-bugs: several concerns reference dev-harness scripts that DO NOT EXIST in the installed plugin (already removed), and the sessionstart-hook ask is already satisfied
*Hero-prompt item: I-signal (harness-bugs verification)*

**Evidence**
- `The signal file (owner's Desktop 'harness bugs.txt') items #15/#16/#18 ask to reassess progress-poller / phase-guard / assumption-test scripts; a recursive grep of ~/.claude/plugins/cache/belcort-harness/harness/3.2.1 for progress-poller|phase-guard|assumption-test returns 0 hits, and scripts/ contains only doctor.sh, install-rules.sh, setup.sh, uninstall-rules.sh — these features are already gone.`
- `harness-bugs #11 'sessionstart hook should only fire main skill and let orchestrator self-read the project state': hooks/session-start.sh is already minimal ('this hook is only a 1-line trigger. State reading is done by the skill itself') and does no state-reading.`
- `harness-bugs #14 'read the pretools use hook': hooks/pre-tool-use.sh exists and is documented — it parses tool JSON from stdin (fixing a prior $1 parse bug), blocks force-push/sudo/.harness deletion, and fails open if no JSON parser is available.`

**What is wrong / missing** — The owner's harness-bugs list was written against an earlier/bloated harness state; against the installed 3.2.1 plugin, items #15/#16/#18 are moot (the scripts are already removed) and #11 is already implemented. Verifying them prevents wasted 'clean it up' work on features that no longer exist. NOTE: like I-15, this signal targets the dev-harness plugin, not the belcort/ accounting doctrine.

**What the rebuild must do** — Confirm to the owner that #15/#16/#18 need no action (already removed) and #11 is already satisfied; focus harness-bugs triage on the still-live design questions in the file rather than the removed scripts.

#### Verified as sound (workstream I)

- Injection defence is consistently and thoroughly applied across the doctrine — AGENTS.md §16 declares all OCR/DB free-text/«»-fenced content inert DATA, and the wake handlers re-state second-order injection with concrete DATA-not-command examples.  ·  _evidence:_ `belcort/AGENTS.md:86 §16 global injection defence; belcort/review-queue/SKILL.md:249-257 (second-order injection with source_filename/supplier_name DATA examples); agent/src/runtime/inject.ts:31-32 the dataRule framing prepended to every wake note; clean()/fence() strip control chars + guillemets`
- The DB-owns-every-number invariant is consistently stated in skills AND structurally backed — the agent's only write paths are the named audited fns routed through ctx.rpc, and it never computes a figure.  ·  _evidence:_ `belcort/AGENTS.md:31-33 §2 'Database is the only state mutator… NEVER compute a financial figure'; belcort/coa-coding/SKILL.md:211-213 'make the Dr the SUM of the other legs — never compute the Dr independently'; bank-recon/SKILL.md:112-113 'The DB owns the entire tie-out'; agent/src/tools/buildTools.ts:104 buildFnToolDef routes every fn call through ctx.rpc(spec.fn, finalArgs). NOTE: this holds for the fn-tools; query_books/agent_select is the exception documented in I-1.`
- The SST hybrid ladder in coa-coding is accounting-correct and matches the binding backend policy — output-tax only, no input credit, not_registered never auto-legs, doc-states-verbatim over compute.  ·  _evidence:_ `belcort/coa-coding/SKILL.md:174-229 (three-precedence hybrid; :227-229 'Never post an output-tax leg for a non-registrant'; :221-225 purchase-side SST folded into expense, no input-tax asset); docs/architecture/backend.md §2A (output-only, effective-dated tax_rates); db/v2/18-tables-reference.sql:43-44 service-8 general = 6% at 2018-09-01, rose to 8% on 2024-03-01 (effective-dated); db/v2/20-fns-journal.sql:42 compute_sst_leg`
- The interview clarify-loop discipline (no plain prose between questions) is reinforced in BOTH doctrine and runtime code, so onboarding reliability does not rest on the prompt alone.  ·  _evidence:_ `belcort/AGENTS.md:45-46 §4; belcort/firm-bootstrap/SKILL.md:32-40 and client-onboarding/SKILL.md:35-43; agent/src/runtime/openai/tools.ts:56-63 injects a [flow-control] directive into every clarify tool result`
- Tool-layer enforcement (scope write-gate, p_actor anti-spoof injection, per-wake policy, structural no-shell/psql/file/web) holds for the fn-tools regardless of skill prose.  ·  _evidence:_ `agent/src/tools/buildTools.ts:54-89 enforceScope + injectActor; agent/src/tools/buildTools.ts:19-33 policyAllows / WRITE_ALLOW; agent/src/tools/registry.ts:57-74 BANNED_TOOL_TOKENS + buildTools.ts:356-363 assertNoBannedTools. CAVEAT: applies to buildFnToolDef; the freeform query_books read tool (buildTools.ts:110-122) is NOT routed through this gate — see I-1.`
- The kb-evolve learning loop is coherently designed and product-mapped — never blind-writes client_kb_rules, evidence→user-gated proposal, promotions user-gated, recon-hint kept distinct from kb-evidence, human-only self-reconcile fence.  ·  _evidence:_ `belcort/kb-evolve/SKILL.md:16 (never blind-writes), :76-86 (user-gated promotion, no auto-promote), :258-292 (BM2 account vs BM2b matching split), :306-325 (chat-mediated human-only fence); db/v2/25-fns-ops.sql:1479-1482 trg_pn_kbp emits kb_proposal_open on a new open proposal`

#### Unverified (workstream I) — could not be confirmed from frozen evidence; carried as open

- Live Supabase (belcort-shared) state could not be inspected — the repo is frozen READ-ONLY and no live DB connection was made; all DB claims are verified against db/v2/*.sql source, not the running catalog. Whether the deployed doctrine on Fly matches belcort/ HEAD is assumed from loader.ts (reads belcort/ at startup) but not confirmed against a live process.
- Whether the model, at runtime, actually reinterprets the stale 'messaging.send_message'/'Telegram' instructions as 'plain prose' (I-7) rather than attempting a literal tool call is behavioral and not statically verifiable from the frozen code.
- The exact live-fired wake conditions and their note grammar were verified against db/v2/25-fns-ops.sql triggers and agent/src/runtime/inject.ts, but not exercised on the ephemeral rig — the emit-vs-consume coupling is read from source only.
- belcort/doc-ingest/references/extracted-fields-schemas.md was not exhaustively cross-checked field-by-field against the MyInvois 55-field model (myinvois-reference.md:12-24) — classified PORT-pending-review, not fully verified.
- Whether a SECURITY DEFINER writer invoked through agent_select (I-1) succeeds within-firm depends on the fn owner's RLS posture (FORCE RLS vs owner-bypass) on the running catalog; verified from source that the guard does not block the call and that the fns are `security definer` + granted to authenticated, but the actual commit was not exercised against a live/rig DB.
- The two owner signal files concern the belcort-HARNESS dev-pipeline PLUGIN (installed at ~/.claude/plugins/cache/belcort-harness/3.2.1), outside the frozen accounting repo; the specific checkable claims (removed scripts, adopted SIMULATE phase, session-start/pre-tool-use hooks) were verified, but the full 3.2.1 Planner/Generator/Evaluator pipeline was not audited end-to-end.
- The je_review/export_result/suggestion/client_row card rendering on the dashboard (whether the fenced-block seam hydrates a live card) is a dashboard-workstream concern; the agent-side extraction (sessions.ts:43-59) was confirmed but not the dashboard render path.

#### Decision brief (workstream I)

> WORKSTREAM I — Skills & harness architecture (ADVERSARIAL VERIFICATION). I opened every cited file/line for all 16 draft findings and all 6 fine_claims. Result: 14 CONFIRMED, 2 ADJUSTED (I-2, I-4), 0 REFUTED; all 6 fine_claims stand.
> 
> HEADLINE unchanged: the security/attribution CORE is genuinely agentic and code-enforced (curated fn-tools, scope write-gate, p_actor anti-spoof, per-wake policy, progressive disclosure) — keep it. Three problem classes dominate: (1) two GUARDRAIL gaps where doctrine over-claims safety the code does not enforce — query_books/agent_select is a SELECT-wrapped-DEFINER mutation path presented as 'read-only' in all 11 skills and wired under every wake policy (I-1, CONFIRMED CRITICAL; RLS still bounds it to the firm, so it is a WITHIN-firm write + policy-bypass, not cross-tenant — the draft's cross-firm framing was tightened), and the [documents] wake policy is a blocklist leaving approve/reverse/close reachable from a non-interactive wake (I-2, HIGH but ADJUSTED: the draft's 'contradicts PRD §6.10' is wrong — PRD.md:96 §6.10 is scoped to [proactive] only; the over-broad statement is backend.md:92, and the real defect is blocklist-where-allowlist-belongs); (2) a large COVERAGE gap — AR/AP, fixed-asset, tax, SST-return, recurring/accrual, members fns are all built + granted but have NO driving skill (I-3, CONFIRMED HIGH); §15's tool inventory has drifted BOTH ways — it omits set_coa_account_type/add_bank_account/the 3 FA tools/seed_opening_carry_forward/journal_entry_detail and the 6 non-registry tools, AND lists unmatch_bank_line which has no ToolSpec (I-4, ADJUSTED MEDIUM: the draft wrongly flagged record_recon_hint/promote_recon_hint/retire_recon_hint + seed_client_knowledge + update_client_profile as omitted — those ARE present in §15); (3) pervasive v1 RESIDUE loaded verbatim — wrong OCR vendor (Google vs Azure, plus a third pymupdf/marker-pdf enum) (I-5), Hermes/DEPLOY.md/session-memory (I-6, DEPLOY.md confirmed absent), Telegram/messaging.send_message across 6 files (I-7), a code_execution contradiction in coa-coding:40 vs 6 siblings (I-8), two 'full/analysis unwired' claims contradicting wired code (I-9), a stale 906-000 false-flag (I-10, seed fixed 2026-06-27), and structural numbering/routing defects incl. year-end-close's missing '## When this fires' (I-11). Salvage (I-13) and agentic-vs-hardcoded (I-14) verified as-stated; the two signal findings (I-15/I-16) target the dev-harness PLUGIN 3.2.1 (SIMULATE phase + agentlint/security already adopted; progress-poller/phase-guard/assumption-test already removed) — a workstream distinct from the belcort/ doctrine.
> 
> PER-SKILL SALVAGE (I-13, verified): SOUL.md + _shared PORT; bank-recon/rule-edit/period-entries light-PORT; coa-coding/client-onboarding/review-queue/kb-evolve/doc-ingest/year-end-close/export REBUILD (extract the domain gold — SST hybrid, BEE carry-down, CN/DN polarity, tax provision, learning loop — into drift-free bodies mapped to the live registry); AGENTS.md REBUILD (fix §6 vendor, §15 drift, Hermes header); DROP the 3 byte-identical GL PDFs (SHA256 verified identical; loader serves .md only) + the empty __init__.py; REBUILD/DROP journals-csv-execution-pattern.md, presentation-mapping.md, _shared/ocr-cache-schema.md.

---

## Workstream J — Frontend & UX

### `J-18` · **CRITICAL** · No evidence-region or side-by-side document verification surface exists: document 'detail' is a raw OCR JSON dump plus a new-tab file link — and evidence regions are not captured anywhere in the pipeline
*Hero-prompt item: (4) trust surfaces — evidence at the point of decision*

**Evidence**
- `dashboard/components/documents/DocumentExpand.tsx:135-139 — the full OCR renders as guillemet-fenced JSON.stringify in a <pre>; :59-71,174-186 — 'View original' mints a signed URL on click and window.open()s it in another tab`
- `dashboard/components/workbench/EntryDrawer.tsx:147-195 — the drawer's Source document section = filename/type/date/truncated SHA + an 'Open document' deep-link; no inline preview, no field↔region linking`
- `dashboard (whole tree) — grep for evidence_region/boundingRegion/polygon: zero hits outside package-lock.json`
- `agent/ + db/v2/ + PRD.md — grep for region/boundingRegion: zero hits — bounding regions from Azure DI are not persisted anywhere in this repo; there is nothing upstream to surface`

**What is wrong / missing** — The core professional verification loop — see the invoice beside Clara's proposed entry with the extracted amount/date/party highlighted on the page — does not exist. A reviewer must open the raw file in a separate browser tab and eyeball a JSON blob. VERIFIER CORRECTION: the draft claimed evidence regions are 'stored upstream but never surfaced' — they are not; no region/bounding data is captured by the agent's OCR path, stored in db/v2, or required by this repo's PRD (per-field evidence regions are a rebuild-target requirement, not an as-built fact). So this is a missing capability end-to-end (pipeline capture + storage + UI), not merely an unsurfaced field. 'Can the professional SEE why' still fails at the exact point of decision — the single largest gap between the current app and an Agentic Accounting OS.

**What the rebuild must do** — Capture per-field evidence regions in the OCR pipeline (Azure DI already returns boundingRegions), persist them with the extraction, and ship an in-drawer/side-by-side document viewer with extracted-field overlays, linked from every je_review card, drawer, and inbox review card.

### `J-1` · **HIGH** · Live chat plan cards are Approve-only: Edit and Dismiss exist in PlanCard but are never wired; Reject-with-reason does not exist in chat
*Hero-prompt item: (1) agent-native surfaces — approvals*

**Evidence**
- `dashboard/components/clara/ClaraThread.tsx:312-346 — the ClaraTranscript render passes onApprove/onSuggestion/onPostBand/onClarify but never onEdit or onDismiss`
- `dashboard/components/clara/ClaraTranscript.tsx:144-145 — onEdit/onDismiss forwarded only if provided (they never are from the live thread; grep confirms no other PlanCard-bound onEdit/onDismiss source)`
- `dashboard/components/rail/PlanCard.tsx:219-220 — Edit and 'Not now' buttons render only when handlers exist; no reject-with-reason affordance at all; the 'dismissed' terminal state (264-268) is unreachable live`
- `docs/design/04-agentic.md:101,136 — je_review contract and §5 gate both mandate Approve / Edit / Reject with edit first-class`

**What is wrong / missing** — Handbook ch.04 §5 mandates Approve/Edit/Reject with edit first-class ('rejection-only gates force re-runs'). As built, a wrong account code in Clara's proposal cannot be corrected or rejected from the conversation — the user can only approve or leave it, then hunt the entry down in the workbench. The approval surface is half a gate.

**What the rebuild must do** — Wire onEdit (open EditEntrySheet or an inline leg editor for the proposed entry) and an audited Reject-with-reason from the chat card; keep Esc/'Not now' as dismiss-without-decision, logged.

### `J-13` · **HIGH** · The URL is not the source of truth: workspace tab switches and all journal filters (period/status/band/flagged) never write to the URL
*Hero-prompt item: (6) IA — deep-link contract*

**Evidence**
- `dashboard/components/workbench/ClientWorkspace.tsx:119,123,147-156 — tab, flagged, period, status, band are plain useState; only the FY selector syncs (?fy= via replaceState, lines 134-141)`
- `dashboard/components/workbench/WorkspaceHeader.tsx:82,113 — onTab just calls the state setter; no router/history write`
- `docs/design/03-architecture.md:36-48 — ch.03 §3 'non-negotiable': URL state is the source of truth for filters/tabs; back/forward always work`

**What is wrong / missing** — Reload or share from the Recon tab with a status+band filter and you land on Overview with everything reset; browser back/forward do nothing across tabs. The deep-link contract is parse-only (in — parseTabParam/?statuses=/?entry= all consumed), never write (out) — breaking shareability, the audit story ('send me the link to what you saw'), and Clara's own deep-links landing in a stale context.

**What the rebuild must do** — Mirror tab/filter/band state into the querystring (replaceState for filters, push for tab changes) exactly as ?fy= already does.

### `J-2` · **HIGH** · No multi-step plan surface: the generative-UI catalog is stalled at 8 types; plan / recon_table / doc_review / account_combo / mini_chart / receipt are all unbuilt
*Hero-prompt item: (1) agent-native surfaces — plans/progress*

**Evidence**
- `dashboard/lib/artifacts.ts:45 — ARTIFACT_TYPES = ['sst_summary','journal_table','kv_summary','export_result','je_review','suggestion','client_row','review_summary'] only`
- `docs/design/04-agentic.md:109-114 — the six ⬜ NEW catalog cards, including 'plan' (multi-step plan-as-document, checkable steps, per-step status)`

**What is wrong / missing** — A multi-write batch or long task has no plan-as-document the human can read, check off, and approve step-by-step — the core 'agent proposes a plan, human governs it' surface of an Agentic OS is missing. Clara's bigger work can only arrive as N separate je_review cards or opaque prose.

**What the rebuild must do** — Ship the 'plan' card (steps + per-step status composing je_review rows) first; recon_table and doc_review next — they carry the two highest-volume daily flows.

### `J-22` · **HIGH** · Live backdrop-filter still ships on a daily product surface: the ⌘K palette is a .glass-live pane, and the whole glass ladder remains in shipped CSS with no grep gate
*Hero-prompt item: (5) floors — performance/opaque-first*

**Evidence**
- `dashboard/components/command/CommandPalette.tsx:127 — contentClassName="glass-live bc-cmdk-content"; lines 49-51 self-describe the live-blur budget`
- `dashboard/app/glass.css:27-46,55-67,102-110 — .glass-live/.glass-panel utilities with backdrop-filter: blur(16px) saturate(1.8) (+ the #fc-lens refraction variant) still compiled into the app CSS`
- `docs/design/01-foundations.md:12-14 (P2 'Opaque always'), :67 — ch.01 §2B: 'Zero backdrop-filter in product surfaces — a lint rule, not a convention'; §3.3 prescribes the ⌘K overlay as L2 shadow + scrim, not glass`
- `.github/workflows/control-plane.yml:49-81 — CI has no backdrop-filter grep gate (SQL tests/build/typecheck/vitest/secret-scan only)`

**What is wrong / missing** — The strictest carried-forward MUST floor of the design system is violated by the most-used overlay in the product, and the enforcement mechanism the handbook promises (grep gate, ch.06 §6) was never built — so nothing stops further regressions.

**What the rebuild must do** — Restyle the palette opaque (L2 overlay shadow + scrim), delete the live-glass utilities, and add the backdrop-filter + --agent* allowlist grep gates to CI.

### `J-3` · **HIGH** · No diff/before-after surface anywhere: edit history blobs are deliberately rendered opaque
*Hero-prompt item: (1) agent-native surfaces — diffs/before-after*

**Evidence**
- `dashboard/components/workbench/EntryDrawerCells.tsx:5 — 'History before/after blobs are opaque — never parsed'`
- `dashboard/components/workbench/EntryDrawerCells.tsx:121-134 — HistoryRow renders action + actor + reason + timestamp only`
- `db/v2/10-tables-core.sql:203-214 — journal_entry_history carries before/after jsonb on every action (verified), so the data exists and is discarded at render`
- `dashboard/components/workbench/EditEntrySheet.tsx — no before/after preview (grep for before/after/diff: only a comment about the balance gate)`

**What is wrong / missing** — The DB stores before/after jsonb on every edit (journal_entry_history, verified in db/v2/10-tables-core.sql), but a reviewer can never see WHAT changed — who edited an entry and what the legs looked like before is invisible. For an audit-first accounting product, edits are effectively black-box; 'diffs/before-after' are not a surface at all, let alone first-class.

**What the rebuild must do** — Render a structured legs-diff (account/amount changes highlighted) in the drawer history and on activity receipts; show a before/after preview inside EditEntrySheet before save.

### `J-4` · **HIGH** · Clara's process is invisible: no tool chips in the transcript, no honest pre-first-token status line — tool activity collapses to the single word 'working' on a dot
*Hero-prompt item: (1) agent-native surfaces — progress/process*

**Evidence**
- `dashboard/components/clara/ClaraTranscript.tsx:116-163 — MessageTurn renders only text / data-artifact / data-clarify parts; no tool part rendering`
- `dashboard/lib/chat/useHermesChat.ts:28,54,64 — toolVerb is captured from the wire (data-tool) but grep confirms it only feeds useAgentState (the FSM); it is never rendered as text anywhere`
- `dashboard/components/shell-v2/PresenceDot.tsx:17 — 'tool-use' renders as the status word 'working'`
- `docs/design/04-agentic.md:8 (Agentic Update Formula bans 'Working…'), :52 (pre-first-token honest status line), :65-71 (one chip per tool call; v1 = verb + phase)`

**What is wrong / missing** — Handbook ch.04 §2 requires one chip per tool call (icon + honest verb + target + state) and an honest pre-first-token status line ('Clara is reading invoice.pdf…'); ch.04 §1's Agentic Update Formula bans 'Working…'. As built, during a long run the user sees a pulsing dot labeled 'working' and an empty transcript — indistinguishable from a hang. Trust in a professional tool is built exactly here. (The handbook scopes v1 to verb+phase chips because the wire carries no call id/payloads — but even that v1 floor is unbuilt.)

**What the rebuild must do** — Render tool breadcrumbs as transcript chips (verb + phase now; target + expandable I/O when the wire extension lands) and surface toolVerb as the pre-first-token status line in the thread.

### `J-7` · **HIGH** · Row references into chat drop the entry id: only the human-readable label is sent, and multi-row selections cannot be attached at all
*Hero-prompt item: (2) chat↔workbench — workbench→agent*

**Evidence**
- `dashboard/components/clara/ClaraComposer.tsx:150 — send() serializes chips as `Re ${chips.map(c=>c.label).join(', ')} — ${body}`; chip.entryId is discarded`
- `dashboard/lib/railChips.ts:12-17 — RailChip carries entryId + label, but only label survives to the wire`
- `dashboard/components/workbench/ClientWorkspace.tsx:392-417 — the batch bar (N selected) offers Clear + Approve only; no 'Ask Clara' on a selection`
- `docs/design/03-architecture.md:45-47 — 'every grid selection offers "Ask Clara", attaching context chips' (the draft's 'ch.02 §6' pointer is a phantom — ch.02 ends at §4; the binding text lives at ch.03 §3, which itself cites the phantom section)`

**What is wrong / missing** — The context-passing contract (ch.03 §5: selections → removable chips Clara can resolve) is reduced to a lossy prose prefix — Clara receives '14 Apr · Director loan' and must guess which entry; a 30-row selection can't be discussed at all. The two halves of the product exchange vibes, not references.

**What the rebuild must do** — Send structured context (entry ids, document ids, filter descriptors) alongside the text; add 'Ask Clara about these N' to the batch bar.

### `J-8` · **HIGH** · The agent→UI directive channel supports exactly one verb: filter_journals — Clara cannot open a view, focus an entity, or carry a period
*Hero-prompt item: (2) chat↔workbench — agent→workbench*

**Evidence**
- `dashboard/lib/directives.ts:17-26,35 — 'SCOPE: only filter_journals ships today. open_journals / highlight_row are NOT in the union… period is NOT carried'; DIRECTIVE_TYPES = ['filter_journals']`
- `docs/design/03-architecture.md:82-84 — ch.03 §5: the agent may drive READS — open a view, apply filters, focus an entity`

**What is wrong / missing** — Half the coexistence loop is missing: Clara can narrate and deep-link inside her own cards, but she cannot drive the workbench the user is looking at. 'Show me the unreconciled ones' cannot end with the recon tab opening focused. (The narrowing is deliberate and documented — 'don't ship an unhonoured contract' — but vs the North Star the capability gap stands.)

**What the rebuild must do** — Extend the directive union (open_view, focus_entity, apply_filter with period) with the same attributed, one-click-undo chip pattern the filter directive already has.

### `J-10` · **MEDIUM** · Entities Clara mentions in prose never become navigable chips — deep links exist only on artifact cards
*Hero-prompt item: (2) chat↔workbench — entity chips*

**Evidence**
- `dashboard/components/clara/ClaraMarkdown.tsx:44-58 — prose renders through Streamdown only; no entity-chip plugin/renderer`
- `dashboard/components/clara/ClaraTranscript.tsx:122-136 — navigation handlers exist only for journal_table/client_row/je_review artifact envelopes`
- `docs/design/03-architecture.md:45-47 — 'the coexistence keystone: every entity Clara mentions renders as an entity chip → click navigates/focuses the workbench row'`

**What is wrong / missing** — When Clara writes 'entry JE-841 for Tenaga looks mis-coded' in prose, nothing is clickable — the keystone chat→grid affordance only works when the agent happens to emit a card.

**What the rebuild must do** — An entity-reference syntax on the wire (or post-parse of known id patterns) rendered as chips that navigate/focus, consistent with the card links.

### `J-11` · **MEDIUM** · Rail⇄canvas is a hard remount with no expand affordance on the rail, no morph, and the client chat canvas loses the books context header
*Hero-prompt item: (2)+(6) rail⇄canvas continuity*

**Evidence**
- `dashboard/components/clara — no /chat link or expand control in the rail (ClaraThread header = PresenceDot + SessionMenu + collapse only; SessionMenu grep: no canvas/expand); the only path to the canvas is the top-bar presence button (FirmShell.tsx:195-202)`
- `dashboard/app/(dash)/firms/[slug]/chat/ChatCanvasClient.tsx:27-37 — the canvas is a fresh ClaraRail mount; the transcript re-hydrates (ClaraRail.tsx:122-128), scroll position lost`
- `docs/design/05-surfaces.md:413-416 — §3: the client canvas must show the condensed workspace header (client + FY + in_balance); docs/design/03-architecture.md:62-64 — expansion is a layoutId morph of the same thread, no reload, scroll preserved`

**What is wrong / missing** — Expanding the conversation is undiscoverable from the conversation itself, costs a full reload of thread state, and on the client /chat route the books context (FY, in-balance) disappears entirely — the canvas feels like a second app.

**What the rebuild must do** — An expand control in the rail header; shared thread state across seats (no re-hydrate); the condensed client header on the client canvas.

### `J-12` · **MEDIUM** · Plan-card state is thread-local: approving an entry in the grid leaves the rail's pending card stale
*Hero-prompt item: (2) chat↔workbench — state projection*

**Evidence**
- `dashboard/components/clara/ClaraThread.tsx:137-139 — planStates is per-thread useState (optimistic ledger), keyed only by in-thread actions (guardedApprove, 203-218)`
- `dashboard/components/rail/planStateMap.ts — a pure local Map; no subscription to books SSE / query invalidation`
- `docs/design/04-agentic.md:163-165 — the projection-of-state rule (approve in the workbench → the card self-resolves everywhere) is implemented only for Inbox notifications (CommandCenterV2.tsx:93-107)`

**What is wrong / missing** — The two surfaces can disagree about the same work item: an entry approved in the grid still shows a live 'Approve & post' card in the rail; clicking it produces a server error instead of the card reflecting reality.

**What the rebuild must do** — Reconcile plan-card state from the DB-owned entry status (the books SSE already nudges the grid) so cards project the work item, matching the Inbox rule.

### `J-14` · **MEDIUM** · Journals grid falls short of the §2.2 spec and of practice needs: single Amount column (no Dr|Cr), no footer Σ, single-status filter, FY-only period granularity, no reassign, no auto-draft sweep banner, and bulk ops are approve-only
*Hero-prompt item: (3) workbench vs firm needs — journals ergonomics*

**Evidence**
- `dashboard/components/workbench/JournalsGrid.tsx:63-76 — columns: Date/Description/Amount/SST/Evidence/Status/actions; one amount column; footer (382-398) shows only 'Showing N' + Load more, no DB Σ`
- `dashboard/components/workbench/FilterBar.tsx:69-97 — period = FY-year <select> only; status = single-value <select> (spec: statuses[] checkbox set + Dr|Cr columns + footer Σ from the DB payload, docs/design/05-surfaces.md:122-134)`
- `dashboard/components/workbench/ClientWorkspace.tsx:392-417 — batch bar = Clear + Approve only (spec batch bar: Approve/Reject/Export, docs/design/02-interaction.md:98); reassign absent (05-surfaces.md:140 as-built note 'Not built: reassign'); auto_draft_review_batch banner nowhere (grep: no consumer)`

**What is wrong / missing** — A practicing bookkeeper clearing 200 entries needs Dr/Cr at a glance, page totals that tie, month-level windows, and bulk verbs beyond approve. The daily-driver grid is a good skeleton but materially thinner than both the spec and Xero/QBO-class review ergonomics.

**What the rebuild must do** — Dr|Cr split columns, DB-owned footer Σ, multi-status checkbox filter, month/quarter windows, bulk reject with one reason, reassign, and the sweep-acknowledge banner.

### `J-15` · **MEDIUM** · Keyboard model is implemented but undiscoverable: no '?' shortcut sheet, no g-then-x go-to chords, no shortcut hints in tooltips or palette rows
*Hero-prompt item: (3) keyboard flow — discoverability*

**Evidence**
- `dashboard — no shortcut-sheet component exists (grep ShortcutSheet/KeyboardHelp: only incidental matches); FirmShell.tsx:104-114 registers only ⌘K`
- `dashboard — no 'g then c/j/i/a' chord handling anywhere (grep)`
- `docs/design/02-interaction.md:76-77,99 — ch.02 §2.1 specifies '?' per-surface cheat card + chords; §2.2 'Every shortcut is discoverable: shown in the ? sheet, in tooltips, and in the palette rows'`

**What is wrong / missing** — j/k/x/a/r/e/o all work (useGridKeys.ts, verified 122-203) but nothing in the product tells the user they exist — keyboard-first is a hidden feature, which for accountants (the archetypal keyboard users) forfeits the main ergonomic win.

**What the rebuild must do** — Ship the '?' sheet reading from a per-surface shortcut registry; add chords; annotate palette rows and action tooltips with their keys.

### `J-16` · **MEDIUM** · auto_draft entries are excluded from the flagged review queue, checkboxes, and bulk approve — yet the drawer treats them as reviewable
*Hero-prompt item: (3) review queue ergonomics*

**Evidence**
- `dashboard/components/workbench/StatusPill.tsx:16-23,45-48 — auto_draft → family 'draft' → isFlagged() false; JournalsGrid.tsx:110-126,304,370 gates selection/checkboxes/approve affordance to isFlagged rows`
- `dashboard/components/workbench/clientWorkspaceData.ts:13 — FLAGGED_STATUSES = ['needs_review','needs_decision'] (the flagged quick-view filter)`
- `dashboard/components/workbench/EntryDrawer.tsx:20 — REVIEWABLE = ['auto_draft','needs_review','needs_decision'] (drawer offers Approve/Edit/Reject on auto_draft)`
- `dashboard/lib/directives.ts:23-24 — the directive channel itself names 'the Plan deck's pending set (needs_review + needs_decision + auto_draft)', a third queue definition`

**What is wrong / missing** — Clara's auto-drafted entries — the highest-volume class in the target autonomy model ('AUTO always drafts') — can only be approved one at a time via the drawer; they never appear in the 'flagged' quick-view and can't be bulk-selected. Either the queue definition or the drawer's is wrong; the two currently contradict each other.

**What the rebuild must do** — Decide the semantics once (does auto_draft belong to the human review queue?) and align isFlagged, FLAGGED_STATUSES, the band facet, and REVIEWABLE.

### `J-19` · **MEDIUM** · The inbox card's reason/body is rendered screen-reader-only — sighted users never see Clara's evidence reason at the decision point
*Hero-prompt item: (4) trust surfaces — reasons on inbox cards*

**Evidence**
- `dashboard/components/command/InboxLanes.tsx:206 — {row.notice?.body && <span className="sr-only">{row.notice.body}</span>}`
- `docs/design/04-agentic.md:153-155 — ch.04 §6 card anatomy: what happened + evidence band + reason ('matched 14 prior TNB bills') + ONE action`

**What is wrong / missing** — The differentiating trust pattern ('reason with every judgment') is inverted here: the reason exists in the payload and is deliberately hidden from the visual card, leaving label + band only.

**What the rebuild must do** — Render the body as visible secondary text on the card (clamped), making the sr-only duplicate unnecessary.

### `J-23` · **MEDIUM** · Legacy-styled surfaces still live inside the v2 shell (Members, Jobs, Activity receipts, the ⌘K panel), and core v2 components themselves violate the no-inline-styles rule
*Hero-prompt item: (5) floors + (1) coherence*

**Evidence**
- `dashboard/app/(dash)/firms/[slug]/members/MembersLive.tsx:192,273 — glass-set + inline style objects (legacy skin)`
- `dashboard/components/jobs/JobLane.tsx:110,222,257,296-298 + dashboard/components/activity/ReceiptItem.tsx:91-106 (card/tile/reverseBtn style objects) — legacy tokens --agent-accent/--card-2 + inline styles`
- `dashboard/components/rail/PlanCard.tsx:133-237, dashboard/components/workbench/EvidenceGlyph.tsx:69-88 — v2-era components built almost entirely from inline style objects (docs/design/06-implementation.md:37-38: 'inline style objects are retired'); build order 06:134 shows the Members/Jobs/Activity restyle (slice 8) unshipped`

**What is wrong / missing** — The 'accepted interim seam' of ch.06 §4 is the shipped steady-state: a user crosses from the paper-white precision instrument into dark legacy panels within one session, and the trust-spine PlanCard is styled outside the token/Tailwind system the floors are verified against.

**What the rebuild must do** — Finish the route-by-route conversion (Members/Jobs/Activity), and migrate PlanCard/EvidenceGlyph/ReviewSummaryCard/JobLane to Tailwind + tokens so the contrast harness actually governs them.

### `J-24` · **MEDIUM** · No route-level loading boundaries under (dash): navigations to server-fetching pages block with no skeleton
*Hero-prompt item: (5) screen states — loading*

**Evidence**
- `dashboard/app — the only loading.tsx is app/loading.tsx (root); none under (dash)/firms/[slug]/** (glob verified)`
- `dashboard/app/(dash)/firms/[slug]/documents/page.tsx:15-35 — RSC page doing auth + membership + two awaited data reads before render (activity/calendar/members follow the same pattern)`
- `docs/design/02-interaction.md:112 — ch.02 §3: route swap shows the skeleton ≤200ms after nav`

**What is wrong / missing** — Switching rail icons (e.g. Home → Documents) gives no feedback until the server round-trip completes — the ≤200ms skeleton floor is met inside client islands but not for the route swaps users perform most.

**What the rebuild must do** — Per-segment loading.tsx skeletons mirroring each surface's real layout (rows, not boxes).

### `J-26` · **MEDIUM** · The handbook's validation gates are not enforced: no grep gates, no bundle-budget assertion, no axe pass in CI
*Hero-prompt item: (5) floors — enforcement*

**Evidence**
- `.github/workflows/control-plane.yml:49-81 — CI = SQL assertion tests + Next build + typecheck + vitest + secret scan; none of the ch.06 §6 design gates exist (the draft's 'build + vitest only' undercounted the workflow but the design-gate absence is exact)`
- `docs/design/06-implementation.md:143-158 — ch.06 §6 lists the per-slice gates: 250KB gz route budget 'CI-asserted', backdrop-filter grep-gate, --agent* allowlist grep-gate, axe pass; :150-152 itself records the bundle CI assertion as a recorded open item`

**What is wrong / missing** — Every floor that is not a vitest assertion (contrast is; bundle/glass/agent-token/axe are not) depends on discipline, and J-22 shows discipline already failed once. The handbook even acknowledges the bundle assertion as an open item — it has stayed open.

**What the rebuild must do** — Add the two grep gates, a route-size assertion from the build output, and an axe smoke run to the workflow.

### `J-28` · **MEDIUM** · Cross-scope needs-you is invisible: the presence dot has no amber count/jump list, and a pending clarify in a non-active scope disappears until that thread is revisited
*Hero-prompt item: (6)+(2) cross-scope awareness*

**Evidence**
- `dashboard/components/shell-v2/FirmShell.tsx:86-88,195-202 — the top-bar dot shows only the mounted rail's published state; click = navigate to the active scope's chat`
- `dashboard/lib/agentPresence.ts:16-25 — a single global state slot; only the mounted (active-scope) thread publishes; reset to 'idle' on unmount`
- `dashboard/lib/attention.ts — grep 'clarify': zero hits (no notification kind projects a pending clarify into the Inbox)`
- `docs/design/04-agentic.md:13-17 — ch.04 §1: other scopes' needs-you must badge the dot with a count + jump list; 'a clarify never times out silently while the user is on another route'`

**What is wrong / missing** — If Clara asks a blocking question in Client A's thread and the user navigates to Client B, nothing anywhere shows the stalled run (proactive_notifications carries no clarify kind to project it into the Inbox either) — the agent silently waits, the exact failure the FSM spec forbids.

**What the rebuild must do** — Project pending clarifies/undecided plans into the Inbox needs-decision lane (DB-backed), and give the dot the cross-scope count + jump list.

### `J-5` · **MEDIUM** · Three different frictions for the same posting write: grid 'a'/row-button approves instantly with no gate; drawer approve gets the full ApproveGate; bulk approve fires a job with no summary gate card
*Hero-prompt item: (1)+(3) approvals consistency*

**Evidence**
- `dashboard/components/workbench/ClientWorkspace.tsx:261-283 — onGridApprove calls approveEntry directly (fire-with-feedback toast), no gate (only an unbalanced-row refusal)`
- `dashboard/components/workbench/EntryReview.tsx:335,350-358 — drawer approve routes through ApproveGate (role=alertdialog, full context)`
- `dashboard/components/workbench/ClientWorkspace.tsx:239-255 — onBulkApprove fires approveBulkEntries immediately from the batch bar; docs/design/05-surfaces.md:132-133 specifies 'Bulk-approve = the batch bar → one summary gate card'`

**What is wrong / missing** — Approving is the product's most consequential daily verb, and its confirmation model is inconsistent: single-keystroke 'a' posts to the books with zero review context while the identical action in the drawer demands a modal gate. Bulk approve of N entries shows no per-item summary before dispatch.

**What the rebuild must do** — One coherent approval model: keep one-tap for balanced strong-evidence rows if that is the deliberate ergonomics, but state it; bulk approve gets the spec'd one-summary-card with per-row opt-out.

### `J-6` · **MEDIUM** · The Background-work lane is a legacy relay-era surface with no staleness rule — a dead runner shows a live pulsing bar forever
*Hero-prompt item: (1) long-running task status*

**Evidence**
- `dashboard/components/jobs/JobLane.tsx:3-15,110,222,257,296-298 — 'SET-GLASS tray', prototype-era comments, className="glass-set", legacy tokens (--agent-accent/--card-2), all inline styles`
- `dashboard/lib/jobs.ts — no stale/heartbeat/'state unknown' logic (grep: zero relevant matches)`
- `docs/design/05-surfaces.md:455-458 — the ch.05 §5 staleness rule: a running job with no heartbeat for 10 minutes must render 'state unknown — runner offline', never an eternal spinner`

**What is wrong / missing** — Long-running agent work is a first-class North-Star surface, but the lane is unported legacy UI and violates the handbook's own staleness rule — if the runner dies mid-batch the user watches an indefinite 'running' bar.

**What the rebuild must do** — Port the lane to v2, add the 10-minute heartbeat/staleness state tied to the degraded banner, and bind controls to the target durable-runtime job model.

### `J-9` · **MEDIUM** · No fixed scope chip in the composer, and no slash-commands or @-mentions
*Hero-prompt item: (2) chat↔workbench — composer contract*

**Evidence**
- `dashboard/components/clara/ClaraComposer.tsx:186-197 — scope appears only in the placeholder text, which vanishes the moment the user types`
- `dashboard/components/clara/ClaraComposer.tsx — no cmdk popover, no @-mention or /command handling anywhere (docs/design/04-agentic.md:43-44: fixed scope chip + 'Slash-commands + @-mentions via a caret-anchored cmdk popover'; docs/design/03-architecture.md:76-78: 'Echoed in the composer as a fixed scope chip')`

**What is wrong / missing** — While composing a cross-tenant-sensitive instruction the user has no persistent visual anchor of which client's books Clara is scoped to (the firm-killing-mistake surface), and cannot reference an account/document/entry precisely without leaving the composer.

**What the rebuild must do** — A fixed, always-visible scope chip above the textarea (ch.03 §5) + @-mention popover resolving to structured entity references.

### `J-17` · **LOW** · The journals empty state does not distinguish 'no data yet' from 'no results for this filter' and offers no clear-filters action
*Hero-prompt item: (5) screen states — empty*

**Evidence**
- `dashboard/components/workbench/JournalsGrid.tsx:246-249 — rows.length===0 → static 'No entries in this view.' regardless of filters (the grid receives no filterActive prop at all, ClientWorkspace.tsx:418-433)`
- `docs/design/02-interaction.md:109-111 — ch.02 §3 binding rule: filtered-empty must show the active filters + a clear-filters action; onboard inside the true empty state`

**What is wrong / missing** — A user with a band+status filter applied sees the same dead text as a brand-new client — a direct violation of the five-states table and a real confusion in daily triage.

**What the rebuild must do** — Branch the empty state on filterActive: show active filter chips + 'Clear filters'; give the true empty state the one CTA (upload documents / ask Clara).

### `J-20` · **LOW** · Raw confidence percentages reach the DOM in the firm documents triage lane
*Hero-prompt item: (4) trust surfaces — band never a digit*

**Evidence**
- `dashboard/components/documents/FirmDocumentsTriage.tsx:318-320 — renders `${Math.round(conf * 100)}%` from client_match_conf`
- `docs/design/04-agentic.md:187-189 — ch.04 §7: 'Evidence is a shaped band, never a digit… confidence numerals never reach the DOM'; docs/design/05-surfaces.md:61 — the §1.3 as-built note codified the deviation ('client_match_conf as %') instead of fixing it`

**What is wrong / missing** — One surface breaks the product-wide shaped-band vocabulary; users now meet both '87%' and 'Second look' for the same concept.

**What the rebuild must do** — Bucket client_match_conf through EvidenceGlyph like every other surface (with the <0.95 ask-doctrine threshold marked).

### `J-21` · **LOW** · No 'why?' popover on grid cells: seat-3 row intelligence is a one-line KB citation, with the review reason only in the drawer
*Hero-prompt item: (4) trust surfaces — seat-3 why popover*

**Evidence**
- `dashboard/components/workbench/JournalsGrid.tsx:327-337 — the KB citation renders as a title-attr line under the description; no popover with rule/provenance/reason`
- `docs/design/03-architecture.md:66-68 — seat 3: 'the coded-account cell carries the evidence band + why? popover (rule/provenance/reason)'`

**What is wrong / missing** — To answer 'why did Clara pick 620-100?' the reviewer must open the drawer per row — the at-a-glance explanation the spec demands is a hover tooltip string.

**What the rebuild must do** — A keyboard-reachable popover on the account/evidence cell: firing rule, prior-match count, reason, doc link.

### `J-25` · **LOW** · The workspace tab row uses role=tablist/tab without the ARIA tabs keyboard pattern or tab↔panel wiring
*Hero-prompt item: (5) a11y — tabs pattern*

**Evidence**
- `dashboard/components/workbench/WorkspaceHeader.tsx:104-131 — role="tablist" + role="tab" + aria-selected, but every tab is a plain button in the tab order; no roving tabindex, no arrow-key handling, no aria-controls, and the pane has no role="tabpanel" (ClientWorkspace.tsx:371)`

**What is wrong / missing** — AT users are promised tablist semantics but get button-group behavior; SC 4.1.2-adjacent pattern mismatch on the product's central navigation device. (The group row above it deliberately uses the honest role=group + aria-pressed — the tab row should get the same rigor in either direction.)

**What the rebuild must do** — Either implement the tabs keyboard pattern (roving tabindex, ←/→, aria-controls/tabpanel) or drop to the honest button-group semantics used by the group row above it.

### `J-27` · **LOW** · Client switching lives only in ⌘K and the Clients list page — no in-chrome switcher on the breadcrumb or workspace header
*Hero-prompt item: (6) IA — client switching*

**Evidence**
- `dashboard/components/shell-v2/FirmShell.tsx:151-176,262-276 — the breadcrumb's client segment is a link to the current client, not a menu`
- `dashboard/lib/commandIndex.ts:52-74 — palette client rows (journals/documents/kb per client) are the fast path; dashboard/app/(dash)/firms/[slug]/clients/ClientsList.tsx is the browse path`

**What is wrong / missing** — For the daily many-clients workflow the two paths are adequate but neither is zero-thought: the breadcrumb looks like a switcher and isn't; there is no MRU/adjacent-client affordance in the workspace where the user actually lives.

**What the rebuild must do** — Make the breadcrumb client segment a type-ahead switcher (same data as the palette), preserving the current tab across the switch.

### `J-29` · **LOW** · Density defaults to comfortable globally; the spec's compact-by-default on journals/recon/GL/TB is not implemented
*Hero-prompt item: (3) density*

**Evidence**
- `dashboard/lib/uiPrefs.ts:31-37 — DEFAULT_PREFS density: 'comfortable' (one global value; DensityBoot applies it app-wide)`
- `docs/design/01-foundations.md:158-160 — ch.01 §5: compact default on data surfaces, comfortable elsewhere, user-persisted`

**What is wrong / missing** — First-run data screens render at 48px rows — the 'density with dignity' posture for the data surfaces is opt-in instead of default.

**What the rebuild must do** — Per-surface density defaults (data-density on the grid roots) with the user preference as an override.

#### Verified as sound (workstream J)

- The streaming-chat a11y floor is genuinely implemented: role=log scroll region, aria-busy on the live turn, sr-only speaker labels, and a polite SR mirror that flushes settled text at sentence boundaries (never per-token), with reduced-motion instant scroll throughout.  ·  _evidence:_ `dashboard/components/clara/MessageScroller.tsx:104-135 (role=log, tabIndex, reduced instant); dashboard/components/clara/ClaraMarkdown.tsx:44-58 (aria-hidden streaming node + sr-only aria-live mirror); dashboard/components/clara/ClaraTranscript.tsx:99-114 (sr-only speaker, aria-busy); dashboard/components/clara/useSentenceFlush.ts`
- useGridKeys faithfully implements the ch.02 §2.2 grid keyboard model: roving tabindex, j/k/arrows/Home/End/PageUp-Down, x/Space toggle, Shift-range with a sticky anchor, ⌘A over loaded ids only, Enter/e/a/r/o actions, Esc clears selection, and the binding edit-mode suppression rule ('a' in a reason field never approves) plus an Alt/AltGr bail.  ·  _evidence:_ `dashboard/lib/useGridKeys.ts:22-29,122-203; dashboard/components/workbench/JournalsGrid.tsx:156-166`
- The journals grid is virtualized (TanStack react-virtual, measured rows, overscan 10) with an honest aria-rowcount of -1 while keyset pages remain, and its selection funnel structurally prevents bulk-approving non-flagged (posted/rejected) rows.  ·  _evidence:_ `dashboard/components/workbench/JournalsGrid.tsx:136-142,213-224,110-126`
- Durable machine-authorship is real and consistent: one shared RULE/AUTO/MATCHED badge derived server-side from durable fields (never mutable status) renders identically on the grid, the entry drawer, and the chat je_review card; human rows carry no badge.  ·  _evidence:_ `dashboard/components/workbench/AuthorshipBadge.tsx:1-53; dashboard/components/workbench/JournalsGrid.tsx:364; dashboard/components/workbench/EntryDrawer.tsx:82-99; dashboard/components/rail/PlanCard.tsx:186-189`
- Evidence strength is a shaped four-band glyph (icon+word+bars, aria-labelled, never colour-alone) that honestly maps null confidence to no-prior-evidence and never scores frontend-side — everywhere except the one triage % (finding J-20).  ·  _evidence:_ `dashboard/components/workbench/EvidenceGlyph.tsx:25-92; dashboard/components/command/InboxLanes.tsx:49-53 (agent-declared band only, never derived)`
- KB rule provenance is surfaced at the point of decision: a violet 'coded by rule pattern → account' citation on the grid row and in the drawer (resolved with zero extra round-trip via the detail read), deep-linking to the KB tab; the KB workbench itself is the visible, governable memory manager.  ·  _evidence:_ `dashboard/components/workbench/JournalsGrid.tsx:327-337; dashboard/components/workbench/EntryDrawer.tsx:41-68,104; dashboard/components/workbench/EntryReview.tsx:229-234; dashboard/components/kb/KbWorkbench.tsx`
- The drawer's write gates are full-context and correctly tiered: ApproveGate (alertdialog) shows legs, DB balance cue, SST legs, evidence+reason, KB citation and the reverse-not-delete note; Reject requires a reason; Reverse is the destructive tier (typed 'REVERSE' + required reason); the Reverse affordance binds to the fn-provided reversible flag in the drawer and Activity.  ·  _evidence:_ `dashboard/components/workbench/ApproveGate.tsx:1-187; dashboard/components/workbench/EntryReview.tsx:67-164,350-391; dashboard/components/workbench/EntryDrawer.tsx:229-233,394; dashboard/components/activity/ReceiptItem.tsx:52`
- The v2 token system is contrast-verified by a real computed WCAG harness (OKLCH→sRGB→ratio) pinning ≥4.5:1 text and ≥3:1 non-text pairs in both themes, and the adaptive blocks (reduced-motion, contrast-more, forced-colors, reduced-transparency) exist in the shipped CSS.  ·  _evidence:_ `dashboard/lib/__tests__/tokens-v2.test.ts:5-95; dashboard/app/globals.css:123-144,276; dashboard/app/glass.css:154-209`
- The Inbox is a workable lane surface, not a bell: decision/review/proposals/FYI lanes off machine-readable intent, optimistic resolve with visible 'Resolved' fade (projection rule), the zero-client onboarding empty state with one CTA, honest loading/error states, j/k roving, and Answer/Discuss seeding the USER's composer (never a fabricated assistant turn).  ·  _evidence:_ `dashboard/components/command/InboxLanes.tsx:40-47,74-124,134-143,215-262; dashboard/app/(dash)/firms/[slug]/CommandCenterV2.tsx:93-112`
- Deep-link focus targets work one-shot with a flash: ?entry=N scrolls/actives/flashes the grid row; ?focus=document:N and ?focus=recon:N switch tabs and focus their targets; guards prevent refetch re-firing and never fight a manual tab switch.  ·  _evidence:_ `dashboard/components/workbench/JournalsGrid.tsx:168-183; dashboard/components/workbench/ClientWorkspace.tsx:297-320`
- The desktop-only gate is a11y-correct: below 1024px the overlay covers AND the wrapped tree is set inert, so invisible controls are not keyboard/SR-operable; the auth perimeter is exempt.  ·  _evidence:_ `dashboard/components/shell-v2/DesktopGate.tsx:1-52; dashboard/app/(dash)/layout.tsx:17-30`
- Offline/degraded honesty is implemented: a durable relay-offline latch feeds the top-bar dot, rail edge and an in-thread 'Clara is offline — your books are safe and editable' banner; the workbench shows OfflineNote and withholds doomed controls (jobs, approves via the expired-mutation guard).  ·  _evidence:_ `dashboard/components/clara/ClaraThread.tsx:154-171,306-310; dashboard/lib/connectivity.ts:19-45; dashboard/components/jobs/JobLane.tsx:122-126; dashboard/lib/chat/useBlockExpiredMutations.ts`
- ⌘K is dispatch, not conversation, and never executes a write: Ask routes into the live rail send-handle (degrading to a seeded ?ask= navigation, never a silent no-op), Do rows navigate/seed only, forbidden Switch-firm rows are structurally stripped, and permission-gated rows are absent rather than disabled.  ·  _evidence:_ `dashboard/components/command/CommandPalette.tsx:60-111; dashboard/lib/commandRouter.ts:13,144-154; dashboard/lib/commandIndex.ts:44`
- OCR output is consistently treated as inert data: document detail renders the extraction guillemet-fenced as text, the triage lane's counterparty guess renders text-only, and the chat markdown layer is sanitised Streamdown (no raw HTML, no hand-rolled renderer).  ·  _evidence:_ `dashboard/components/documents/DocumentExpand.tsx:135-139; dashboard/components/documents/FirmDocumentsTriage.tsx:296-298; dashboard/components/clara/ClaraMarkdown.tsx:1-23`
- Reports keep the DB-owns-every-number law: the TB renders the DB's Dr/Cr split and only the envelope's own column totals (columnTotals extracts, never sums — verified); the FS interleaves the envelope's subtotals with zero client arithmetic, renders presentation_complete=false as a first-class banner with the unclassified band, an actionable resolve-in-COA drill, and a never-hidden A=L+E badge.  ·  _evidence:_ `dashboard/components/reports/TrialBalance.tsx:1-12; dashboard/lib/trialBalance.ts:136-157; dashboard/components/reports/FinancialStatements.tsx:1-16`
- Chat→workbench data freshness works: books SSE nudges funnel through one debounced gate that suppresses refetch while an editor is dirty and flushes once on close; BooksRouterRefresh bridges the same signal to server-rendered surfaces via router.refresh without resetting the persistent rail. (Whether the DB-side emit set covers documents/exports tables was not verified in this workstream — see unverified.)  ·  _evidence:_ `dashboard/lib/booksSync.ts:23-66; dashboard/app/(dash)/firms/[slug]/BooksRouterRefresh.tsx:1-30; dashboard/components/jobs/FirmJobsLane.tsx:92`
- The review_summary triage card enforces the safety carve-out: 'no-prior-evidence' is review-only (count shown, never a Post-all), a single in-flight latch prevents double bulk jobs, and Post-all re-reads live balanced ids rather than acting on its snapshot.  ·  _evidence:_ `dashboard/components/rail/ReviewSummaryCard.tsx:27-58; dashboard/components/clara/ClaraThread.tsx:220-243`
- The clarify lifecycle is correctly wired in the active thread: a pending clarify flips the composer to a visible answer-mode banner (Esc cancels without killing the card), choice-clicks and composer answers resume the same run, and resolved/dismissed sets prevent the composer wedging in answer-mode after completion.  ·  _evidence:_ `dashboard/components/clara/ClaraThread.tsx:115-135,246-256; dashboard/components/clara/ClaraComposer.tsx:94,117,162-169,219-224`
- Chat scope-safety on writes is structural, not advisory: the je_review approve path fail-closes on any client mismatch or unresolved scope (jeReviewClientIdFor → scopeBlockCode) before the network call, firm-scope threads render the Approve genuinely handlerless with an honest note, and an expired session renders the button inert instead of firing a doomed write.  ·  _evidence:_ `dashboard/components/clara/ClaraThread.tsx:73-84,194-218; dashboard/components/rail/PlanCard.tsx:107-116,222-230`

#### Unverified (workstream J) — could not be confirmed from frozen evidence; carried as open

- The audit brief (undefined/audit-brief.md) and two of the three evidence maps (undefined/maps/dashboard-map.md, undefined/maps/doctrine-map.md) DO NOT EXIST in the workspace — verified by directory listing; only undefined/maps/db-map.md is present. Both the draft auditor and this verifier proceeded directly against the frozen repo files with docs/design/HANDBOOK.md + ch.01-06 as the normative baseline and a standard severity rubric (critical = North-Star-breaking; high = MUST-floor breach or major gap; medium = spec deviation with real UX cost; low = polish/drift). If the missing brief's rubric differs, severities may need remapping.
- Runtime floors not executed: 10k-row 60fps scroll on 4x throttle, the 250KB gz route budget, live SSE behavior, and real a11y tool passes (axe) were not run — this is a static code audit. The bundle-budget comment in ClaraMarkdown.tsx:17-23 records /chat at 441KB gz before the mermaid deferral; current numbers unmeasured.
- Agent-service behavior is out of scope for J: whether Clara can actually resolve the label-only 'Re 14 Apr · Director loan' references (J-7), and whether the wire could already carry tool call ids/targets for J-4, needs the runtime workstream.
- Server-side semantics of journal_entries_page's evidence_band/flagged set and approveBandEntries (whether auto_draft participates in band counts and band bulk-approve, which would soften or sharpen J-16) — the db/v2 fn source was not audited in this workstream. (The directive-channel comment in directives.ts:23-24 naming auto_draft in 'the Plan deck's pending set' independently supports the inconsistency.)
- Whether any legacy .glass-live chrome besides the ⌘K palette is still mounted on live routes (the legacy NavShell appears superseded by the opaque FirmShell, but not every legacy component's mount path was exhaustively traced; GlassSurface/LiquidGlassEngine remain in the tree with test files).
- Ceremony surfaces (welcome/firm-setup/client-onboarding GSAP register) were spot-checked only via comments and greps (SpokenQuestion/CeremonyPresence live regions, SkipCeremony exist); a full ceremony a11y/motion audit was not performed.
- MembersLive/SettingsLive/ActivityFeedLive/ComplianceCalendarLive and the tax surfaces (SstReturn, TaxComputation) were assessed from structure, greps, and their handbook as-built notes rather than full line-by-line reads; J-23's characterization of Members/Activity/Jobs as legacy-styled is line-verified (glass-set + inline styles + legacy tokens), but those surfaces may hold additional per-surface deviations not itemized here.
- The DB-side books-sync emit coverage (whether belcort_books_sync_emit fires on documents/exports writes so the triage lane and Files shelf live-refresh) was not verified — the frontend gate and RSC refresh bridge are verified, the trigger coverage is a db/v2 concern.

#### Decision brief (workstream J)

> Verdict (adversarially verified — 26 findings CONFIRMED, 3 ADJUSTED, 0 REFUTED): this dashboard is far better than 'a form app with chat bolted on' — the grid/rail coexistence, plan-gated approvals, durable AUTO/RULE authorship, shaped evidence bands, KB provenance chips, receipts+reverse, and a genuinely implemented streaming-a11y layer are real and mostly excellent craft (all 19 fine_claims survived verification). But it is roughly the first half of an Agentic Accounting OS. The five gaps that matter most for the Phase 2 refresh, in order: (1) J-18 — there is no evidence-region/document-verification surface, and (verifier correction) evidence regions are not even captured by the pipeline, so the fix is capture+store+render, not just UI; the professional cannot see WHY Clara coded something next to the source page, which is the product's entire trust thesis; (2) J-4/J-2 — Clara's process is invisible (no tool chips, no status line, no multi-step plan card), so long work reads as a hang and big work has no governable plan document; (3) J-1/J-5 — the approval gate is inconsistent and half-built in chat (Approve-only, no Edit/Reject; instant one-key grid approves; ungated bulk); (4) J-7/J-8/J-12 — chat and workbench exchange lossy text and a single filter directive instead of structured references and projected state, so the two halves drift; (5) J-13 — the URL-as-truth contract is parse-only, breaking share/reload/back on the daily driver. Floor hygiene: the ⌘K palette still runs live backdrop-filter and none of the handbook's grep/bundle/axe gates exist in CI (J-22/J-26 — the handbook itself records the bundle assertion as an open item that stayed open); several shipped surfaces (Members, Jobs, Activity) are still legacy-skinned and even v2 trust components are inline-styled outside the verified token system (J-23). Review-queue ergonomics need a deliberate pass (Dr/Cr columns, footer ties, multi-status + month filters, bulk verbs, auto_draft queue semantics — three contradictory queue definitions verified — and '?' discoverability; J-14/15/16). Most findings are additive to a strong skeleton: the salvage posture for the dashboard should be PORT the models/grids/gates/a11y machinery (useGridKeys, AuthorshipBadge, EvidenceGlyph model, artifacts gate, booksSync, connectivity latch, tokens-v2 harness) and REBUILD the trust-verification (document viewer + evidence-region pipeline) and process-visibility (plan/tool) layers, which were never built rather than built wrong.

---

## Workstream X — Cross-cutting gaps (completeness pass: ops, security, compliance, concurrency)

### `GAP0-1` · **CRITICAL** · Journal provenance is not structurally bound: draft_entry inserts caller-supplied document_id + source_doc_sha256 verbatim; nothing anywhere validates the pair
*Hero-prompt item: A/F3*

**Evidence**
- `db/v2/20-fns-journal.sql:101-110 — draft_entry INSERTs (p->>'document_id')::bigint and p->>'source_doc_sha256' straight from caller JSON; the ONLY provenance check in the fn is the kb_rule_id confirmed-rule check at :95-99. No check that the document exists in the caller's firm, belongs to the entry's client, or that the sha256 matches documents.sha256.`
- `db/v2/10-tables-core.sql:116-117 — journal_entries.document_id is a bare `references public.documents(id) on delete set null` (no firm/client composite parity, unlike journal_lines' composite FK to coa_accounts at :175); source_doc_sha256 is plain unconstrained text.`
- `Grep source_doc_sha256 across db/v2 (re-run by verifier): the only writers are draft_entry (20:105), record_memory_note (27:25), seed_client_knowledge (24:417); the only reader is journal_entry_detail (28:418). No function or trigger anywhere compares it to documents.sha256.`
- `Cross-firm ids also pass: Postgres referential-integrity checks bypass RLS by design, and the SECURITY DEFINER fns are owned by the migration role with the belcort_definer non-BYPASSRLS re-ownership documented as NOT applied ('Left as a deploy step', db/v2/30-grants.sql:24-43) — so any existing documents.id from any firm satisfies the FK.`
- `db/v2/20-fns-journal.sql:364-394 — reassign_entry moves client_id on the entry+lines and clears kb_rule_id (:389) but leaves document_id/source_doc_sha256 untouched, so every reassign of a document-origin entry manufactures a cross-client document citation even with honest inputs.`
- `db/v2/20-fns-journal.sql:305-310 — edit_entry's header UPDATE touches only description/posting_date/status/review_reason, so a wrong binding can never be corrected via the audited edit path either; and `on delete set null` (10:116) silently erases provenance if a document row is ever removed by a privileged role.`

**What is wrong / missing** — The cardinal invariant 'every entry traces to its source document' (CLAUDE.md, PRD §6) is conventional, not structural. Clara (or any authenticated member, or the SELECT-bypass path) can draft an entry citing another client's document, another FIRM's document id, or a fabricated hash, and the pair (document_id, source_doc_sha256) can be internally inconsistent. This is the wrong-client-evidence state that destroys audit defensibility, and it confirms the prior-audit DSE-003/EDGE-002/ACCT-009/SEC-007/VP-06 cluster is real in the frozen tree — the fresh findings set covered only client-identity confidence (A-16), not document binding.

**What the rebuild must do** — The rebuild needs a typed-origin contract per entry (document / bank-line / depreciation-run / close / opening / manual / reversal): document-origin entries must have the DB derive-and-assert the (document_id -> firm_id, client_id, sha256) tuple at draft time (composite FK or in-function assert with sha equality against documents.sha256), reassign must re-derive or refuse when provenance would cross clients, and provenance columns must be non-nullable per origin type with reverse-not-delete instead of `on delete set null`.

### `GAP0-2` · **CRITICAL** · No structural human-authorization on any write tool in the interactive lane — the plan->approve gate is UI convention plus model obedience only, and unknown approval interruptions are auto-approved
*Hero-prompt item: G10*

**Evidence**
- `agent/src/tools/buildTools.ts:31 — `if (policy === 'interactive') return true; // all writes in interactive chat (plan->approve gate is UI-side)` — the code itself concedes the gate is not in the capability layer.`
- `agent/src/runtime/openai/tools.ts:47-53 — only `clarify_tool` is built with `needsApproval: true`; every other tool (every fn-backed write) gets a plain `execute` that runs immediately when the model calls it.`
- `agent/src/runtime/openai/runtime.ts:249-252 — the interruption loop's else-branch: any non-clarify needsApproval interruption is silently `result.state.approve(interruption)`d ('under the curated-tool model (W5) the surface is already bounded'), so even a future approval-requiring tool would be auto-consented.`
- `agent/src/tools/registry/journal.ts:40,131 and registry/ops.ts:56,74,91 — approve_entry, reverse_entry, record_year_end_close, reverse_year_end_close, record_opening_balances are all registered interactive tools; run_depreciation/dispose_fixed_asset (registry/fixedAssets.ts:37,60) and the full onboarding set likewise.`
- `dashboard/lib/artifacts.ts:110-115 — the je_review card's approve 'routes through the SAME approve_entry op as the rail': the card is a presentation-layer verb; nothing requires the card to have been rendered, read, or acknowledged before the agent can call approve_entry itself in an ordinary chat turn.`
- `db/v2/20-fns-journal.sql:166,184-185 — approve_entry's DB-side guards are assert_can_review (role floor) + audit_actor; there is no human-approval event, policy token, or approval envelope in the signature.`

**What is wrong / missing** — The supervised-autonomy law (consequential writes go plan->review->approve) has no capability boundary anywhere in the stack: a prompt-injected or erring model can post, reverse, year-end-close, or seed opening balances in a single interactive turn with zero human event, and the runtime would auto-approve any SDK-level approval pause that wasn't the clarify tool. This confirms the prior AR-01/SEC-004 CRITICAL that the fresh Ggr-11 downgraded to LOW as 'latent' — the evidence for the downgrade ('only clarify_tool sets needsApproval') is precisely the defect.

**What the rebuild must do** — Gate-1 must classify this as a structural failure. The rebuild needs DB-owned per-mutation-class authorization policy: consequential writes require an exact-payload approval envelope (human-verb event recorded in the DB, bound to the precise payload) that the write function verifies before executing — the direction the owner already ratified in the reverted WP-013 exact-approval kernel. The runtime must fail-closed (reject, never auto-approve) on unknown interruptions.

### `GAP0-3` · **CRITICAL** · reassign_entry moves the GL entry cross-client while every dependent stays behind — subledger anchors, bank match/recon state, FA/amortisation anchors, and document evidence all left pointing across clients
*Hero-prompt item: F3*

**Evidence**
- `db/v2/20-fns-journal.sql:364-394 — reassign_entry's complete guard set: firm asserts on both clients, assert_can_review, same_client, and `cannot_reassign_approved` (:382). It then updates journal_lines.client_id and the header client_id + kb_rule_id=null. There is NO un-reconcile block (contrast reject_entry :238-249 and edit_entry :319-330 which both clear reconciled/reconciliation_id and unmatch bank_statement_lines), NO subledger/FA/amortisation anchor check, and NO document provenance handling.`
- `db/v2/23-fns-subledger.sql:62-71 — assert_postable_entry accepts status 'auto_draft', so ar_invoices/ar_receipts/ap_bills/ap_payments (unique(entry_id) NOT NULL anchors, db/v2/19-tables-subledger.sql:35-48,65-73,109-120,136-144), fixed_assets.acquisition_entry_id (19b-tables-fixed-assets.sql:42), and amortisation_schedules.anchor_entry_id (19c-tables-adjustments.sql:105) can all anchor auto_draft entries — exactly the entries reassign_entry will move (only 'approved' is blocked).`
- `db/v2/22-fns-documents-recon.sql:458-511 (match_bank_line) — matching also accepts auto_draft entries (:480-481), so a matched entry is reassignable: after the move, client A's bank_statement_lines.matched_entry_id points at client B's entry and the moved entry's reconciliation_id still points at client A's reconciliation.`
- `db/v2/22-fns-documents-recon.sql:802-805 — reverse_entry DOES guard `entry_anchors_active_schedule` ('a silent negative-holding corruption'); reassign_entry, which creates the same orphaned-anchor state plus a cross-client one, has no equivalent guard for any dependent.`

**What is wrong / missing** — The correction verb intended to FIX a wrong-client posting manufactures the exact wrong-client state it exists to prevent: the GL movement lands in client B while client A keeps the open AR/AP item (which now fails entry_client_mismatch on any future touch but persists as a row), the bank match, the recon pointer, the FA/amortisation anchor, and (per GAP0-1) the document citation. Both clients' control tie-outs, recon state, and audit lineage become false simultaneously. Confirms prior ACCT-002 (CRITICAL); the fresh set covered only the KB-provenance NULLing (C-14) and storage bytes (E-3).

**What the rebuild must do** — The rebuild needs reassignment as an atomic domain-aware transfer (move or explicitly re-derive every dependent: subledger items, matches, recon fields, register anchors, document/evidence links, with receipts) or a refuse-when-dependents-exist rule mirroring reverse_entry's anchor guard — never a bare two-table UPDATE.

### `GAP1-1` · **CRITICAL** · match_bank_line enforces zero structural parity: any line can match any posted entry into any reconciliation of the client — wrong bank account, wrong statement, wrong period, wrong amount, even a COMPLETED recon
*Hero-prompt item: GAP-05 / F1-bank*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:458-511 (match_bank_line, re-read whole fn) — the ONLY guards are: line.client_id = p_client_id (:470-474), entry.client_id = p_client_id + status in ('auto_draft','approved') (:476-481), recon.client_id = p_client_id (:483-486). It never compares the line's bank_account_id to the reconciliation's bank_account_id, the line's document_id to the recon's statement_document_id, the line's txn_date to the recon's period_start/period_end, or the line's amount_cents to the entry's net movement on the bank COA account — and it never checks that the entry touches the recon's bank account at all.`
- `db/v2/22-fns-documents-recon.sql:483-486 — the recon lookup selects client_id ONLY; recon.status is never read, so matching (and unmatch_bank_line at :522-567, same omission) freely mutates a status='completed' reconciliation, while close_reconciliation refuses recompute ('reconciliation_already_completed', :704) — a closed recon's stored book_balance/outstanding/difference go silently stale with no path to re-tie.`
- `db/v2/11-tables-recon.sql:81-97 (bank_statement_lines carries bank_account_id + document_id) and :41-57 (bank_reconciliations carries bank_account_id + statement_document_id) — all the parity data exists in the schema and is simply not checked.`
- `db/v2/22-fns-documents-recon.sql:720-735 — a wrongly-matched entry gets reconciled=true and is thereafter EXCLUDED from the outstanding (deposits-in-transit / unpresented) computation of whatever recon its bank account really belongs to (filter je.reconciled = false at :735), corrupting that recon's difference_cents.`
- `db/v2/tests/match_bank_line_actor_test.sql + db/v2/tests/open_reconciliation_contract_test.sql — no test asserts account/statement/period/amount parity, recon-status gating, or match exclusivity (the fn body contains no such guards for a test to pin).`

**What is wrong / missing** — A reconciliation 'match' is the atomic fact the entire close gate rests on, and it is structurally unvalidated: a RM100 Maybank June line can be matched to a RM5,000 entry with no leg on any bank account inside a CIMB March reconciliation — or into an already-completed one. The entry is stamped reconciled/cleared, the audit row looks legitimate, and every recon whose arithmetic depends on the reconciled flag is silently misstated. Overstated reconciliation completion feeds period-close readiness (record_year_end_close does not re-verify recon integrity) and every downstream statement.

**What the rebuild must do** — REBUILD the match model, don't port it: make membership structural (a match row FK-bound to (reconciliation_id, line_id, entry_id) with DB CHECKs/uniques enforcing line.bank_account_id = recon.bank_account_id, line.document_id = recon.statement_document_id, txn_date within period), validate line amount against the entry's net movement on the recon's bank COA account (with an explicit partial-match/split concept if needed), and hard-block any mutation of a completed reconciliation (reopen must be an audited verb that voids the stored tie-out).

### `GAP1-2` · **CRITICAL** · Re-match without unmatch leaves ghost 'reconciled' entries, and one entry can be claimed by many lines/recons with last-writer-wins overwrite — confirmed still unfixed
*Hero-prompt item: GAP-05 / F1-bank (prior ACCT-006)*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:470-472 — v_prev_match (the line's current match_status) is read for the audit row but NO guard rejects re-matching an already-'matched' line; :488-495 then repoints the line to the new entry and marks the NEW entry reconciled, while the OLD matched entry's reconciled/reconciliation_id/cleared_date are never cleared -> a ghost 'reconciled' entry that no statement line points to.`
- `db/v2/11-tables-recon.sql:81-104 — no uniqueness on bank_statement_lines.matched_entry_id (only unique(document_id, line_no) at :96 and a NON-unique partial index idx_bsl_matched_entry at :103-104), so two different lines (even in two different reconciliations) can both match the same entry; journal_entries has a single reconciliation_id slot, so the second match silently overwrites the first recon's claim on the entry.`
- `db/v2/22-fns-documents-recon.sql:549-553 (unmatch_bank_line) — clears the ENTRY's reconciled/reconciliation_id/cleared_date unconditionally from the line's matched_entry_id; after a cross-recon double-match, unmatching the FIRST (stale) line strips the entry's reconciliation fields that now belong to the SECOND recon — cross-reconciliation corruption via a legitimate-looking unmatch.`
- `db/v2/22-fns-documents-recon.sql:729-735 — ghost reconciled entries are excluded from the outstanding computation (filter je.reconciled = false), so deposits-in-transit/unpresented are understated and difference_cents misstated; the recon either cannot tie out or, worse, completes against offsetting errors.`
- `db/v2/tests/match_bank_line_actor_test.sql — no test covers match->re-match, two-lines-one-entry, or cross-recon overwrite.`

**What is wrong / missing** — The prior audit's ACCT-006 CRITICAL is confirmed in the current code: there is no unmatch-before-rematch requirement and no exclusivity constraint, so ordinary re-matching workflows (agent retries, human corrections) manufacture ghost cleared entries and cross-recon field theft that the append-only bank_match_audit dutifully records but nothing prevents. Reconciliation completeness becomes unauditable: the set {lines matched} and the set {entries flagged reconciled} drift apart permanently.

**What the rebuild must do** — New build: a first-class match table with UNIQUE(line_id) and UNIQUE(entry_id) (or explicit split semantics), rematch only via an audited unmatch verb that atomically restores the displaced entry, and a DB invariant (constraint trigger) that entry.reconciled state is derivable from live match rows — never a free-floating flag.

### `GAP1-4` · **CRITICAL** · All authority is stale-JWT-claims-only until token refresh: a removed/demoted member (or a suspended firm's users) keeps reading and mutating the firm's books across PostgREST, dashboard and agent until token expiry — no revocation mechanism exists
*Hero-prompt item: GAP-06 / cross-access-control (prior SEC-005/EDGE-004)*

**Evidence**
- `db/v2/00-foundation.sql:98-108 — app.current_firm_id() reads ONLY the JWT firm_id claim (top-level or app_metadata); every RLS policy keys on it. No policy consults firm_users or firms.status at query time.`
- `db/v2/00-foundation.sql:112-123 — app.current_user_role() PREFERS the JWT firm_role claim and falls back to the membership row only when the claim is absent: a demoted member's stale 'admin' claim outranks their live 'viewer' row for every fn-level floor (assert_can_review/assert_can_manage_kb/assert_can_manage_firm_settings, 00:152-203).`
- `db/v2/24b-fns-members.sql:183-227 — set_member_role/remove_member mutate/DELETE the firm_users row only; no session invalidation, no token-version bump. The only sign-out in the product is self-service (dashboard/lib/authActions.ts:13-15); no auth-admin revocation call exists anywhere.`
- `db/v2/00-foundation.sql:243 (comment) + :252-276 — the access-token hook is the SOLE revocation point and fires only at token issuance/refresh: 'a removed member's stale claim dies at the next refresh'. Suspension likewise only bites at re-issuance (:264-268 join firms f on f.status='active').`
- `agent/src/http/auth.ts:36-44 + :119-125 — the agent verifies the JWT signature then trusts firm_id/firm_role from claims; no membership lookup. The JWT is bound into the run's ToolContext, so an in-flight chat/clarify run keeps the removed member's authority for the run's remaining life (a clarify-length run can outlive the JWT itself — agent/src/main.ts:171-176 logs the settle-side 401 as a known gap). Dashboard middleware/auth validates only that the auth USER exists — never membership — and the data plane sends the raw access token to PostgREST (dashboard/lib/booksApi.ts).`
- `db/v2/90-isolation-tests.sql TEST 20 proves claim stripping at ISSUANCE for a memberless user; no test in the repo covers the removal->expiry window. The access-token TTL is a live GoTrue setting not present in the repo (Supabase default 1h) — window length unverified.`

**What is wrong / missing** — Zero fresh findings covered this, and it is fully confirmed in code: firing an employee, demoting a rogue bookkeeper, or suspending a firm leaves their existing access token a full-power credential — RLS reads of every client's books, plus approve/edit/reverse/close/export at the stale role — for up to the full token lifetime, with in-flight agent runs extending it further. For a multi-tenant accounting SaaS this is a confidentiality and books-integrity hole independent of RLS correctness, and it is an architecture-time decision the current design silently made (claims-only) without a compensating control.

**What the rebuild must do** — The rebuild must pick its revocation model at design time: (a) short access-token TTL + the hook (bounded staleness, documented as an accepted window), or (b) a session-version/epoch claim checked against a DB row in the RLS helper, or (c) live-membership resolution for role floors (invert current_user_role's precedence so the membership row wins) — PLUS an admin-triggered session revocation (GoTrue admin sign-out) fired by remove/demote/suspend, and a test that proves the window.

### `GAP1-5` · **CRITICAL** · The only CI workflow never applies db/v2 and never tests the agent runtime — green CI tests the DECOMMISSIONED legacy schema while the real product ships unverified
*Hero-prompt item: GAP-07 / ops (prior OPS-001)*

**Evidence**
- `.github/workflows/ contains exactly one workflow, control-plane.yml; its triggers are dashboard/**, db/**, belcort/** (:8-20) — agent/** does not even trigger a run, and no job runs the agent's vitest/tsc (grep of the workflow for 'agent' = zero hits).`
- `control-plane.yml:49-50 runs dashboard/ci/run_sql_tests.sh, which applies dashboard/supabase/migrations/*.sql and runs dashboard/supabase/tests/*.sql (run_sql_tests.sh:17-32, re-read). Those directories are the LEGACY v1 control-plane (0001_init … 0011_firm_container_addr, 0013_broker_rls, 0015_provisioning_rpcs, chat_threads — glob re-verified) — the decommissioned relay/per-firm plane. db/v2/*.sql is never applied and db/v2's suites never run in CI; the 90-isolation gate + functional suite exist only as a local script (db/v2/tests/).`
- `Net effect: a change to db/v2/** TRIGGERS the workflow (paths include db/**) and gets a green check from SQL tests that never touched the changed files — the most misleading possible shape of CI.`
- `control-plane.yml:69 — the Next build step still exports NEXT_PUBLIC_RELAY_URL (a legacy relay env), evidencing the workflow predates the v2 plane and was never re-pointed.`
- `CLAUDE.md ('master is PR-only… treat contract-CI green as advisory') and the repo's go-live-ready claims — the doc/code disagreement is itself the finding: the documented merge gate demonstrably does not gate the product's actual schema or runtime.`

**What is wrong / missing** — Gate-1's central ops lesson is confirmed and worse than 'advisory': the required check is green for reasons unrelated to the change under review. Every db/v2 fn merged since the v2 plane landed was protected only by developer discipline in running the local rig; the agent runtime has NO CI at all. A silent fresh-apply breakage of db/v2 (ordering, grant, trigger regression) would merge green.

**What the rebuild must do** — The greenfield must design CI truthfulness in from day one: per-plane workflows whose triggers match what they test (db/os fresh-apply + isolation + functional suite on PG17 in CI; agent tsc+vitest; dashboard build+tests), path-filtered so a green check is evidence about the changed code — and delete or clearly quarantine the legacy dashboard/supabase tree so it can never masquerade as coverage again.

### `GAP1-6` · **CRITICAL** · No backup/restore/DR contract exists anywhere for the accounting source of truth — a 7-year statutory retention duty with no proven restoration path
*Hero-prompt item: GAP-07 / ops (prior OPS-008)*

**Evidence**
- `grep -i 'backup|PITR|restore|disaster|point-in-time' over deploy/ = 0 hits (re-run by verifier); over docs/ = 3 incidental hits, all UI copy (docs/design/05-surfaces.md:278 'point-in-time for aging' — a report parameter; two 'restores to the composer' interaction notes). deploy/RUNTIME.md (the env/secret manifest SoT) and deploy/CUTOVER.md contain no backup step, no PITR enablement check, no restore drill, no RPO/RTO statement.`
- `db/v2/10-tables-core.sql:89-92 — documents.retain_until defaults to now()+7 years with legal_hold (LHDN retention), and db/v2/14-tables-ops.sql:175-177 (export_artifacts) mirrors the 7-yr duty; storage-setup.sql makes the bucket delete-less for the same reason — the schema legislates a retention obligation the ops layer never underwrites with a restoration capability.`
- `The DB is the declared single source of truth for every number, receipt and audit trail (CLAUDE.md, PRD invariants) — loss of the belcort-shared project is loss of the product; nothing in the repo tests, documents, or even mentions recovering it.`
- `Live Supabase backup/PITR tier state for msegmhvkmwcyxtxoszzp: UNVERIFIED (read-only audit; no live inspection possible). Even if enabled, an untested restore is an unproven control.`

**What is wrong / missing** — The fresh audit's findings files contain zero 'backup' coverage — the entire dimension was unexamined and the repo confirms there is nothing to examine: for an audit-grade accounting OS, inability to PROVE restoration is itself a material control gap, independent of whether Supabase happens to have PITR ticked. Firms' statutory books (7-year LHDN duty) currently depend on an unexamined platform default.

**What the rebuild must do** — The rebuild's ops contract must include: PITR + scheduled backups verified as enabled (and their tier documented in RUNTIME.md), Storage-bucket backup for the sha256-bonded documents, a written RPO/RTO, and a periodically executed restore drill (restore to a scratch project, run the isolation+functional gates against it) as a standing calendar item — restoration proof as a Gate requirement, not an assumption.

### `GAP2-1` · **CRITICAL** · record_year_end_close races every interactive/engine journal writer — the close's own comment admits entries can commit into the just-locked FY unswept ('a silent escape from RE') and ships anyway
*Hero-prompt item: F1 — close concurrency (prior EDGE-003)*

**Evidence**
- `db/v2/25-fns-ops.sql:378-382 — record_year_end_close takes pg_advisory_xact_lock('belcort_close:'||client) with an in-code admission: the lock is shared ONLY with 'run_recurring_journals / run_amortisation / record_accrual', and 'under READ COMMITTED a poster committing between this close's sweep computation and its commit would land an in-window entry NO close ever sweeps (the next close's g2/carry exclude it) — a silent escape from RE. Review fold.'`
- `Grep pg_advisory_xact_lock across db/v2 (re-run): exactly 7 sites — 23c-fns-adjustments.sql:142/:234/:398 (recurring/accrual/amortisation), 23d-fns-tax.sql:75, 23e-fns-sst.sql:157, 25-fns-ops.sql:254 (different artifact key) and :382 (the close). ZERO in 20-fns-journal.sql, 22-fns-documents-recon.sql, 23-fns-subledger.sql, 23b-fns-fixed-assets.sql, 25b-fns-opening.sql.`
- `db/v2/20-fns-journal.sql — finalize_coding (:128-159) and approve_entry (:166-212) take only a per-row `for update` on the entry (:146, :188); draft_entry (:83), edit_entry (:269, can re-date posting_date), reassign_entry (:364, can move an entry INTO the closing client) acquire no per-client serialization primitive of any kind.`
- `db/v2/25-fns-ops.sql:297-322 — app.je_closed_period_guard (BEFORE INSERT/UPDATE on journal_entries) checks only COMMITTED client_fy_close rows; under READ COMMITTED (no `set transaction isolation` exists anywhere in db/v2 — grep re-run, zero) an in-flight close's registry row is invisible, so a concurrent writer passes the guard during the entire close transaction.`
- `db/v2/25-fns-ops.sql:411-418 — the g1 unreviewed_entries_in_period scan is a single point-in-time count before the sweep; the sweep (:537+) and opening carry-forward (:658-704) read in later statements; nothing re-validates the window between sweep computation and commit.`
- `db/v2/25-fns-ops.sql:422-434 + :670,:689 — the NEXT close's g2/carry filter `posting_date > v_carry_from` (= this close's period_end), so an entry stranded inside the closed window is permanently excluded from every future close's sweep — matching the code comment's 'the next close's g2/carry exclude it'.`
- `db/v2/23b-fns-fixed-assets.sql:124-144 — run_depreciation posts an approved journal defaulting posting_date to period_end with NO close lock (grep confirms no advisory lock in the file); write_off_ar_invoice (23-fns-subledger.sql) posts journals lock-free too.`
- `db/v2/25-fns-ops.sql:783-830 — reverse_year_end_close takes no advisory lock either (only FOR UPDATE on the client_fy_close row :792-794), so even the lock-taking computes (23d:75 / 23e:157) are unprotected against a concurrent close REVERSAL mid-computation.`
- `db/v2/tests — no concurrency test exists (single-session BEGIN/ROLLBACK rig).`

**What is wrong / missing** — An entry finalized (drafting->auto_draft), approved, edited/re-dated into the window, reassigned in, or posted by run_depreciation/write_off_ar_invoice while record_year_end_close is executing can commit into the just-locked FY after the close's sweep computation: its nominal balance never sweeps to retained earnings, its real-side legs are missing from the opening carry-forward, the closed-period guard then locks the row against any correcting UPDATE, and no future close (g2 excludes it) or read surface repairs it — permanent double-sided books corruption fixable only by reversing the entire close. The prior audit's EDGE-003 CRITICAL stands, now with the sharper fact that the code documents the race as a known 'Review fold' and was shipped without the fix.

**What the rebuild must do** — The rebuild must make the per-client close serialization primitive universal: every journal-mutating function (interactive writers, engines, reversal machinery) acquires the same per-client lock (or a books-state row lock) the close family holds — the reverted WP-015 'per-family close-exclusive run claim' is the ratified design shape — plus a post-sweep re-validation of the window inside the close transaction before commit.

### `GAP5-3` · **CRITICAL** · reverse_year_end_close has no close-in-order guard: an earlier FY's close can be reversed while a later FY's close is live, posting mirror entries into the later locked period and silently orphaning its opening carry
*Hero-prompt item: F1 (new — reversal ordering)*

**Evidence**
- `db/v2/25-fns-ops.sql:792-795 (re-read) — the only existence check is the live close for (client_id, fy) — there is no check that no LATER fy has a live close, i.e. no mirror of the close's g2 prior_fy_not_closed guard (:422-434).`
- `db/v2/25-fns-ops.sql:297-317 (re-read) — trg_je_closed_period exempts any entry_kind closing/opening posted under via_fn record_/reverse_year_end_close (:303-305) — so FY(n)'s reversal entries, dated FY(n) period_end and period_end+1 (:800,:811 — both <= FY(n+1)'s period_end), sail INTO the window locked by FY(n+1)'s live close instead of being rejected.`
- `db/v2/25-fns-ops.sql:658-704 (re-read) — FY(n+1)'s close computed its opening carry-forward including FY(n)'s close-generated opening entry (the carry scope is posting_date > v_carry_from = FY(n)'s period_end, which includes FY(n)'s opening entry dated period_end+1); after reversing FY(n), FY(n+1)'s still-live close row and opening entry assert balances carried from a close that no longer exists — no error is raised at any point.`
- `belcort/year-end-close/SKILL.md (documented post-close adjust path: reverse_year_end_close -> post the correcting entry -> re-run record_year_end_close, per :80-82's 'the period re-opened via reverse_year_end_close') — gives NO latest-first ordering instruction; an accountant adjusting FY2024 after FY2025 closed follows this path and the reversal succeeds silently; only the subsequent standard-kind correcting entry is stopped by the closed-period guard.`
- `db/v2/tests/reverse_year_end_close_test.sql (re-read whole file) — reverses the only live close; no test exercises reversal of an earlier FY under a later live close.`

**What is wrong / missing** — The close family enforces close-in-order (g2) but not reverse-in-reverse-order: reversing FY(n) under a live FY(n+1) close is accepted without error, mutating the books inside a period the system presents as locked and leaving the ledger internally inconsistent — FY(n) now has unswept nominals inside a locked window, and FY(n+1)'s opening entry, GL segmentation, and issued statements no longer tie to any live prior close. This is a silent audit-integrity break in signed-off periods, reachable through the skill's own documented adjustment procedure.

**What the rebuild must do** — The rebuild's period-state machine must enforce reversal ordering structurally: reversing period n requires every later closed period to be reversed first (a 'later_fy_closed' raise mirroring g2), and the closed-period guard's via_fn exemption must be scoped to the period actually being closed/reversed, never to any close-machinery write into other locked periods.

### `GAP0-4` · **HIGH** · Posted-entry in-place mutability is ledger-wide: edit_entry rewrites approved AND auto_draft entries' lines under the same id, no trigger enforces posted-line immutability, and stale downstream snapshots only warn
*Hero-prompt item: F*

**Evidence**
- `db/v2/20-fns-journal.sql:291-297 — edit_entry explicitly permits editing an APPROVED entry (reason required, demoted to needs_review) and, sharper: an 'auto_draft' entry — a POSTED status counted by the trial balance, GL, financial statements, bank matching, and subledger anchoring — falls into the else-branch (v_new_status := v_status) and is edited with NO reason and NO status demotion.`
- `db/v2/20-fns-journal.sql:312-317 — the edit is a physical `delete from journal_lines` + reinsert: the posted legs are destroyed and replaced under the same entry id.`
- `db/v2/15-triggers.sql:1-137 (complete file, re-read) — the only journal_lines triggers are the deferred balance constraint triggers (:69-75); no trigger blocks UPDATE/DELETE of lines whose parent is approved/auto_draft. The closed-period guard exists only on journal_entries (db/v2/25-fns-ops.sql:297-322), not on journal_lines.`
- `db/v2/23-fns-subledger.sql:56-61 — in-code concession: 'An auto_draft entry is still mutable, so a later edit to its control leg makes the stored gross stale… surfaces in tie-out… never silently propagated' — surfacing, not blocking, is the whole defense.`
- `db/v2/23e-fns-sst.sql:708 — the SST worksheet's own assumption admits 'edits to auto_draft entries can shift figures between periods; re-draft SUPERSEDED periods in order before filing if the books moved' — warning-level, not blocking.`

**What is wrong / missing** — The ledger-wide reverse-not-delete/immutability promise is defeated: figures already counted in historical statements, SST return drafts, reconciliations, exports, and register anchors can change under an unchanged entry id (auto_draft silently, approved with a reason string). journal_entry_history records the edit, but nothing invalidates or re-derives the dependent snapshots — they drift and at best warn on the next compute. Confirms prior SEC-003 (HIGH); the fresh set framed this only for opening entries (B-8).

**What the rebuild must do** — The rebuild must make posted mean immutable: once an entry is in any posted-scope status, line UPDATE/DELETE is trigger-blocked and the only amendment paths are reversal or supersede-with-lineage; snapshot consumers (subledger gross, SST/tax drafts, recon) must be invalidated or re-derived on amendment, never left to a warning.

### `GAP0-5` · **HIGH** · approve_entry carries no expected-revision/snapshot token — an approval after an intervening edit posts legs the approver never saw
*Hero-prompt item: G10*

**Evidence**
- `db/v2/20-fns-journal.sql:166 — signature is approve_entry(p_entry_id bigint, p_client_id bigint, p_actor text); the fn approves whatever the current rows are, gated only on status in (auto_draft, needs_review, needs_decision) (:190-191). reject_entry (:217) and edit_entry (:269) equally carry no concurrency token.`
- `dashboard/lib/workbenchActions.ts:28-34 — the dashboard approve sends exactly {p_entry_id, p_client_id, p_actor}; nothing binds the click to the entry contents rendered in the grid/card.`
- `db/v2/20-fns-journal.sql:295-296 — an edit of a needs_review entry requires no reason and keeps the status needs_review, so an intervening edit (by the agent, a wake-lane write, or a teammate) does not invalidate a human's pending approval; approve_entry then posts the changed legs attributed to the human approver.`

**What is wrong / missing** — Approval is not bound to the content reviewed. Combined with GAP0-2 (the agent can call edit_entry in the same window) the human sign-off — the system's central safety event — can attest to legs the human never saw. Confirms prior EDGE-005, absent from the fresh set.

**What the rebuild must do** — Approve/reject/edit RPCs must carry an expected-revision id or snapshot hash and the DB must reject on mismatch (optimistic concurrency), so an approval is an exact-payload attestation — consistent with the WP-013 exact-approval envelope direction.

### `GAP0-6` · **HIGH** · reassign_document moves the document row alone: journal entries citing it, parsed bank statement lines, and the storage path all stay with the old client
*Hero-prompt item: F3*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:73-105 — reassign_document's complete guards: not-found, `document_already_coded`, not-assigned, same-client, both-firm asserts. The write is a single `update documents set client_id, status='ingested'` (:91). The header comment itself says 'storage_path untouched' (:71). No check for, and no handling of, dependents.`
- `db/v2/10-tables-core.sql:116 + 20-fns-journal.sql:101-110 — journal_entries.document_id rows drafted for the OLD client keep citing the moved document (only 'coded' docs are blocked from moving, but entries can cite docs at any status since draft_entry never validates status or ownership — see GAP0-1), leaving client A's entries evidencing client B's document.`
- `db/v2/11-tables-recon.sql:81-97 — bank_statement_lines.document_id is NOT NULL with unique(document_id, line_no) and its own client_id/bank_account_id: a parsed statement document reassigned to client B leaves client A's statement lines (and any in-progress reconciliation opened on that statement doc) anchored to a document now owned by client B.`
- `db/v2/10-tables-core.sql:93-97 + 22-fns-documents-recon.sql:91 — documents.storage_path (CHECK'd to `firms/<firm>/…`, taxonomy `clients/<slug>/raw/…`) is untouched by the move, so the row's client_id and its evidence-bytes path (old client's slug) permanently disagree unless the agent separately performs the Storage move — nothing enforces it.`

**What is wrong / missing** — The document-side half of the cross-client correction has the same dependents-left-behind defect as reassign_entry: evidence ownership, entry citations, statement-line anchors, and byte location fall out of sync across two clients after a single sanctioned verb — audit lineage for both clients becomes untrustworthy.

**What the rebuild must do** — Document reassignment in the rebuild must be an atomic transfer that re-validates or refuses when journal citations/statement lines exist, and must move (or transactionally re-key) the storage object with the row — evidence identity (row, citations, bytes, path) may never diverge.

### `GAP1-3` · **HIGH** · close_reconciliation ignores statement opening-continuity entirely and drops prior-period outstanding items from the tie-out; completion never requires lines to be matched
*Hero-prompt item: GAP-05 / F1-bank (prior ACCT-008)*

**Evidence**
- `db/v2/22-fns-documents-recon.sql:688-754 (re-read whole fn) — statement_opening_cents is never read at close (only statement_closing_cents, :699-700); there is no check that this statement's opening equals the prior reconciliation's closing, and db/v2/11-tables-recon.sql:41-57 has no uniqueness on (bank_account_id, period), so duplicate/overlapping/gap-leaving recons for the same account are all silently accepted.`
- `db/v2/22-fns-documents-recon.sql:733 — the outstanding computation filters `je.posting_date between v_period_start and v_period_end`, while book balance (:717) is all-time `<= v_period_end`: an unpresented cheque posted BEFORE period_start and still uncleared is inside book balance but EXCLUDED from outstanding, so difference_cents = stmt_closing + outstanding - book is systematically misstated in every period after the first whenever brought-forward outstanding items exist — the standard accounting treatment (carry prior o/s items) is unrepresentable.`
- `db/v2/22-fns-documents-recon.sql:688-754 — bank_statement_lines is never referenced in the close: a reconciliation can reach status='completed' with every statement line unmatched (or every line matched and the totals wrong) because the line-matching model is decorative to the arithmetic.`
- `db/v2/11-tables-recon.sql:54 — status CHECK includes 'balanced', which no code path ever sets (close sets only completed/unbalanced, 22:740-741): dead state evidencing model drift.`
- `db/v2/tests/ — no test constructs a second-period recon, a prior-period unpresented item, or an opening-continuity mismatch.`

**What is wrong / missing** — The close's tie-out formula is only correct for a client's very first reconciliation period. From month two onward, any brought-forward outstanding item makes the DB-computed difference wrong, pushing users to force-match or mis-code to make it tie; and 'completed' asserts nothing about the statement's lines or its continuity with the prior statement — so 'reconciliation complete' as a close-gate signal is unreliable in exactly the silent way that corrupts period-close readiness.

**What the rebuild must do** — New build: recon must chain (opening = prior closing enforced, one live recon per account-period), outstanding items must carry forward across periods (all-time uncleared scope, or an explicit brought-forward register), and completion must require every statement line matched or explicitly ignored plus difference=0 — with the per-period arithmetic preserved on top of that corrected scope.

### `GAP1-7` · **HIGH** · Liveness-only /health with no dependency checks, no readiness probe, no SLOs or alerting — a single always-on machine whose restarts are silent data-loss events
*Hero-prompt item: GAP-07 / ops (prior OPS-007)*

**Evidence**
- `agent/src/http/server.ts:167-171 — GET /health statically returns {ok:true, runtime:name}; it never touches Supabase, OpenAI, the session store, or doctrine state, so a machine that can serve JSON but can do nothing else reports healthy. No /readyz or startup-gating probe exists (full route inventory re-read: health, hooks, bootstrap chat, notifications stream, approve-bulk, chat/messages/sessions/reset/events/clarify/run — nothing else).`
- `deploy/fly.toml (re-read whole file) — the health check targets /health on ONE always-on machine (auto_stop_machines off, min_machines_running 1, :34-50) precisely because run state is in-memory ('ALWAYS-ON: the runtime holds SSE streams, in-memory run state, and pending clarify prompts — auto-stop would drop them', :14-15); a deploy/restart destroys every in-flight run and parked clarify (agent/src/runtime/openai/runtime.ts:136 process-local Map) with nothing alerting on it.`
- `grep -i 'alert|SLO|monitor|uptime|readiness|readyz' over deploy/ = no operational hits; no metrics endpoint, no error-budget, no paging/alert configuration exists anywhere in the repo.`
- `Wake ingress is at-most-once/lossy by design (agent/src/http/wakeGate.ts:9-14, re-read: 'wakes are HINTS — at-most-once by doctrine; a dropped wake is recoverable from the notification read surfaces') — dropped wakes and failed webhook dispatches are exactly the class of silent degradation that only alerting would surface.`
- `Live re-verification 2026-07-17: curl https://belcort-agent.fly.dev/health -> {"ok":true,"runtime":"openai"}; flyctl status: exactly ONE machine (080d16ef6461e8, v51, sin, started, 1/1 checks) — the single-machine posture is the real production topology.`

**What is wrong / missing** — A go-live-claimed accounting service has no way to distinguish 'up' from 'working', and no human is notified when runs die, wakes drop, OCR fails, or the DB is unreachable — the notification surfaces that doctrine calls the recovery path for lossy wakes are themselves unmonitored. Operational blindness compounds the durability gaps (SDT-001 family) the audit already confirmed.

**What the rebuild must do** — Rebuild ops floor: /health (liveness) plus /readyz that verifies DB reachability + credential validity + doctrine loaded; minimal SLOs (run success rate, wake dispatch success, SSE availability) with alerting wired to a human channel; and deploy-time draining once durable runs exist so a restart is an orchestrated event, not silent loss.

### `GAP1-8` · **HIGH** · OpenAI Agents SDK platform tracing is ON by default with traceIncludeSensitiveData=true: every firm's chat, OCR text, and tool args/results are exported to api.openai.com/v1/traces/ingest — no disable, no redaction, no doc mention, no owner decision
*Hero-prompt item: GAP-08 / G7 (prior AR-07)*

**Evidence**
- `agent/src grep for 'tracing|Tracing|withTrace|traceInclude|OPENAI_AGENTS_DISABLE|setTracing' = ZERO hits (re-run); agent/src/runtime/openai/runtime.ts:233 calls run(agent, input, {context, stream:true, maxTurns}) with no tracing config; agent/src/main.ts:106 sets only setDefaultOpenAIKey.`
- `Vendored @openai/agents: importing '@openai/agents' (runtime.ts:9) executes setDefaultOpenAITracingExporter() as a module-load side effect (agent/node_modules/@openai/agents/dist/index.js:44, re-read) -> exporter POSTing batches to 'https://api.openai.com/v1/traces/ingest' (agents-openai/dist/openaiTracingExporter.js:526, re-read), authenticated with the tracing key falling back to env OPENAI_API_KEY — which is required env on Fly (deploy/RUNTIME.md:32, re-read) and Deployed live (flyctl secrets list re-run 2026-07-17), so export is live and authenticated.`
- `Defaults in the vendored runner (re-read): tracingDisabled ?? false and traceIncludeSensitiveData ?? true (agents-core/dist/run.js:109-110). With sensitive data on: function spans carry raw tool-call arguments and outputs (agents-core/dist/runner/toolExecution.js:295 span.spanData.input = toolRun.toolCall.arguments; :352 span.spanData.output = stringResult) and generation spans get full model input/output payloads.`
- `Every ambient kill-switch is inactive in production (re-read): agents-core/dist/config.js:85-95 disables tracing only in a browser, under NODE_ENV=test, or via OPENAI_AGENTS_DISABLE_TRACING — RUNTIME.md's env manifest lists no such variable, and NODE_ENV=test means the vitest suite runs traced-OFF, so no test could ever observe the leak. deploy/RUNTIME.md and docs/architecture/backend.md never mention tracing at all.`
- `Data in scope per run construction: buildRunInput folds chat history + user message into model input (runtime.ts:60-78); extract_document returns OCR text that re-enters the model; the DB-fn tools' args/results carry journal lines, amounts, counterparties, storage keys — all of it lands in exported spans for every interactive run and every wake run of every firm.`

**What is wrong / missing** — The fresh Grt verification explicitly left this unassessed; it is now confirmed at pinned-code level: confidential client accounting data of every firm leaves the trust boundary into OpenAI's persistent trace store by default — beyond the inference-only exposure the owner implicitly accepted by choosing the model, and without any documented decision, per-firm consent, or redaction. That is a professional-secrecy/PDPA exposure and an undocumented sub-processor relationship for every firm on the platform.

**What the rebuild must do** — The rebuild's runtime selection (Gate-2) must make tracing an explicit owner-approved policy: default to setTracingDisabled(true)/OPENAI_AGENTS_DISABLE_TRACING=1 (or traceIncludeSensitiveData=false if span-level ops telemetry is wanted), record the decision in RUNTIME.md + the data-processing register, and add a boot-time assertion/test that fails when the tracing posture drifts from the declared policy. Unverified residue: whether the live Fly app carries OPENAI_AGENTS_DISABLE_TRACING as an unmanifested secret — RESOLVED by verifier: flyctl secrets list (2026-07-17) shows NO such secret deployed, so the exporter is armed in production; OpenAI-side trace retention terms remain external/unverified.

### `GAP2-2` · **HIGH** · The owner's per-client KB materials registry (Circle 1: register/hash/retrieve/scan accounting manuals, vendor contracts, bookkeeper notes) has no v2 equivalent — no table, no skill, no document kind
*Hero-prompt item: C — owner KB signals (Circle 1 materials registry)*

**Evidence**
- `scratchpad/signals/per-client-kb-mechanism.md §1/§6 (verified present) — Circle 1 spec: client_kb_materials table (sha256-hashed, idempotent on (client_id, sha256), material_type classification), kb-material-add skill with a scan step emitting new_rule proposals; scratchpad/signals/kb-iteration-system.md Path E — 'kb-material-add Step 4 (proactive scan)'.`
- `db/v2 — grep 'material' (case-insensitive) across all SQL files (re-run): zero tables; the only hits are 'REVIEW MATERIAL' comments (19d/19e/23d/23e) and two COA seed rows ('RAW MATERIAL', 24-fns-onboard.sql:195-196). db/v2/12-tables-kb.sql defines exactly four tables (re-verified): client_kb_rules (:19), client_kb_rules_history (:54), kb_proposals (:72), client_kb_audit (:96).`
- `db/v2/10-tables-core.sql:79 — documents.kind CHECK is closed to ('transaction_source','sample_invoice'): an accounting manual, vendor contract, or bookkeeper-notes file has no legal home anywhere in the document pipeline.`
- `belcort/ skill inventory (re-listed): bank-recon, client-onboarding, coa-coding, doc-ingest, export, firm-bootstrap, kb-evolve, period-entries, review-queue, rule-edit, year-end-close — no kb-material-add; grep 'material|curator|graphify' across belcort/ finds no counterpart.`
- `db/v2/17-tables-memory.sql — client_memory_notes is the only knowledge-artefact store besides rules: free-text advisory notes with an optional source_doc_sha256 (17:25), no file registry, no typed retrieval — not a materials registry.`

**What is wrong / missing** — An explicit owner Gate-1 mechanism (Circle 1) is wholly absent from v2: there is nowhere to durably register a client's accounting manual, vendor contracts, or a predecessor bookkeeper's notes, no retrieval surface for them at coding time, and no scan-into-rule-proposals path. Any Gate-1 recommendation of 'merge C1 into the KB layer' understates what the KB layer must absorb — the prior C-workstream findings (C-11..C-14) mapped tiers/proposals but never inventoried this capability because the verifier could not access the signal docs.

**What the rebuild must do** — The rebuild's knowledge layer needs a first-class client materials registry: typed artefact classes, sha256 + provenance, RLS-scoped storage + retrieval into the agent's context, and a human-gated scan-to-rule-proposal lane.

### `GAP2-3` · **HIGH** · Bulk rule seeding from a prior-period GL import (owner's Path B, 'hundreds of rules in seconds' — the fastest cold-start cure) has no v2 counterpart; onboarding seeds only hand-ticked mappings and the carry-down deliberately carries balances, not knowledge
*Hero-prompt item: C — owner KB signals (Path B bulk seed)*

**Evidence**
- `scratchpad/signals/kb-iteration-system.md §2 Path B (verified present, :55-57) — kb_compile.add_seed_rule(evidence_count=N), ladder-derived status (candidate 1-2 / confirmed >=3 / locked >=10), '100s of rules in seconds (one per unique supplier+acct)'; per-client-kb-mechanism.md:117 mirrors it.`
- `db/v2/24-fns-onboard.sql:367-424 (re-read whole fn) — seed_client_knowledge is the only batch seeding fn: it accepts a rules[] JSON array and delegates to create_kb_rule (confirmed @1.000), but has no GL-parse input, no evidence-count parameter, and no status ladder.`
- `belcort/client-onboarding/SKILL.md:344-366 (re-read) — Phase D-seed explicitly restricts eligibility: 'Only mappings the human explicitly ticks during onboarding are seeded confirmed'; everything merely inferred goes to the kb_proposals queue. No interview question requests a prior GL export.`
- `belcort/client-onboarding/SKILL.md:121, 201-228 — the Q12 carry-down ingests prior management accounts / FS / aged listings but produces ONLY the opening position via seed_opening_carry_forward; no vendor->account rule derivation happens from the same prior-books documents — confirming and extending fresh B-14's 'no structural-knowledge carry'.`
- `db/v2/21-fns-kb.sql:199-207 (re-read) — record_kb_evidence tallies evidence one observation at a time and only auto-files a proposal at >=3; there is no N-evidence or batch-tally entry point that a GL import could drive.`

**What is wrong / missing** — The owner's fastest cold-start cure does not exist in v2: a newly onboarded client starts with only the mappings a human hand-ticks, so the smartening curve begins at near-zero auto-draft even when 12 months of coded prior GL is sitting in the very documents the carry-down already ingests. This materially shapes the rebuild's onboarding design and was examined by neither audit.

**What the rebuild must do** — Rebuild onboarding must include a prior-GL ingestion lane: parse the prior ledger, tally per-(counterparty, account) evidence, and emit laddered rule seeds/proposals under the existing human gate — reusing the carry-down's document intake so one upload seeds both opening balances AND coding knowledge.

### `GAP2-5` · **HIGH** · The financial-statement pack is SoCI + SoFP only yet stamps every artifact 'Prepared in accordance with MPERS/MFRS' — no SOCE, no cash-flow statement, no notes, anywhere in the repo
*Hero-prompt item: F/H — financial statements (prior ACCT-014)*

**Evidence**
- `db/v2/28-fns-reads.sql:745-772 (re-read) — client_financial_statements returns exactly two statements: 'soci' (:745-758) and 'sofp' (:759-772); nothing else in the payload.`
- `db/v2/28-fns-reads.sql:775-780 — the same payload's basis[] opens with a framework compliance declaration: 'Prepared in accordance with the Malaysian Private Entities Reporting Standard (MPERS), under the historical cost convention, on a going-concern basis.' (MFRS variant :778), sourced from clients.accounting_framework.`
- `Repo-wide grep 'changes in equity|SOCE|cash.?flow' (case-insensitive, re-run) : ZERO hits — no statement of changes in equity, no cash-flow statement, no notes/disclosure engine in db/, agent/, dashboard/, belcort/, or docs/. MPERS §3.17 / MFRS 101 require a SOCE (or the combined statement), a statement of cash flows, and notes for a compliant set.`
- `agent/src/tools/exportTool.ts:53-62 (re-read) — the export scope enum is closed: trial_balance | journals | documents | full | management_accounts | general_ledger | aging | sst_return; 'full' composes management accounts + TB + AR/AP aging into one PDF (belcort/export/SKILL.md:75,:82) — there is no statutory-FS scope to grow into.`
- `belcort/year-end-close/SKILL.md — the doctrine consistently names the deliverable 'management accounts', so the skill layer is honest about the product being management accounts while the DB artifact itself claims a statutory preparation basis — a claim-vs-content disagreement inside one payload.`

**What is wrong / missing** — A Malaysian firm's core year-end deliverable — the full statutory FS pack (SoFP, SoCI, SOCE, cash-flow statement, notes, directors'-report support) — cannot be produced, and the two statements that DO exist carry a printed MPERS/MFRS compliance declaration they don't satisfy, which a client or auditor could reasonably rely on. Neither fresh workstream measured the pack against MPERS §3/MFRS 101.

**What the rebuild must do** — Gate-1/2 owner decision: either (a) relabel — keep the pack as management accounts and strip/soften the framework basis line, or (b) build the statutory reporting engine (SOCE, SCF via the indirect method over the existing GL segmentation, a notes/disclosure framework, comparative rules). The choice materially sizes the rebuild's reporting engine and must be made deliberately, not discovered late.

### `GAP2-6` · **HIGH** · Payroll accounting is scaffolding-only: COA seeds + a payroll_summary OCR schema exist, but no accrual-journal machinery, no remittance tracking, and the PRD's 'calendars the deadlines' claim has no implementation at all
*Hero-prompt item: F — capability areas (payroll)*

**Evidence**
- `What EXISTS — db/v2/24-fns-onboard.sql:161-163 seeds statutory payables 420-000 EPF-STAFF / 430-000 SOCSO-STAFF / EIS-STAFF (CL) and :216-218 employer expenses 908-000 EPF / 909-000 SOCSO / EIS (EP); employee PCB referenced at :158. db/v2/10-tables-core.sql:80 — doc_type CHECK includes 'payroll_summary'; belcort/doc-ingest/references/extracted-fields-schemas.md defines a typed per-employee extraction; belcort/client-onboarding/SKILL.md:116 captures the client's EPF/SOCSO/EIS/HRDF registration numbers; coa-coding/SKILL.md:223-225 carries a parenthetical listing the statutory payroll COA accounts.`
- `What is MISSING — belcort/coa-coding/SKILL.md contains zero references to the payroll_summary (or claim_form) doc types (grep re-run: no matches): there is no documented pattern for turning an extracted payroll summary into the standard multi-leg monthly accrual (Dr salaries + employer contributions / Cr EPF+SOCSO+EIS+PCB payables + net wages), and no other skill covers it.`
- `db/v2 — grep 'EPF|SOCSO|PCB|payroll' (re-run): the ONLY hits are the doc_type CHECK and the COA seed rows; no payroll function, no payroll register/subledger, no remittance state, no test coverage.`
- `PRD.md:119 (re-read verbatim) claims 'BELCORT codes PCB/EPF/SOCSO postings + calendars the deadlines — it does not run payroll (ADR-044)': the coding half is generic-journal-only with no skill guidance, and the calendaring half has NO implementation — no payroll-deadline logic anywhere in belcort/. Doc-vs-code disagreement per the audit brief's rule 2. PRD.md:122 confirms statutory payroll (EPF/SOCSO/EIS) as durable domain context.`

**What is wrong / missing** — Nearly every Malaysian SME client runs payroll; monthly books cannot tie out to management accounts without the payroll accrual journals, and statutory payables (EPF/SOCSO/EIS by the 15th, PCB) have no remittance tracking or deadline surface despite the PRD claiming exactly that capability. Neither audit examined this area; the old build's real position is 'COA seeds + OCR extraction, nothing downstream'.

**What the rebuild must do** — The rebuild PRD must scope payroll accounting deliberately: a payroll-accrual journal class driven by the payroll_summary extraction, statutory-payable tracking with remittance matching, and a compliance calendar — or explicitly descope and correct the PRD claim.

### `GAP2-7` · **HIGH** · Inventory is marker-deep only: stock COA accounts carry OS/CS/BS special markers that NO function consumes — no closing-stock adjustment, no COGS derivation, and the year-end close sweeps stock P&L accounts with zero completeness check
*Hero-prompt item: F — capability areas (inventory/stock)*

**Evidence**
- `db/v2/24-fns-onboard.sql:142,193-203 (re-read) — the seed COA carries a full periodic-stock account set: 330-000 STOCK (CA, marker 'BS'), 600-000 STOCKS AT THE BEGINNING OF YEAR ('CO','OS'), 605-100 OPENING STOCK - RAW MATERIAL ('CO','OS'), 605-900 CLOSING STOCK ('CO','CS'), 620-000 STOCKS AT THE END OF THE YEAR ('CO','CS').`
- `No consumer: grep 'OS'|'CS'|'BS' across db/v2 (re-run) matches ONLY the seed rows; the engines resolve DC/CC (23-fns-subledger.sql:31-43), AD (23b), OBE (25b), DRAWINGS (25-fns-ops.sql:539-596, re-read) — no function anywhere resolves 'OS', 'CS', or 'BS'; the markers are dead metadata.`
- `No skill covers the periodic closing-stock entry: grep 'closing stock|opening stock|inventory|COGS' across belcort/ matches only the presentation-mapping layout line; belcort/year-end-close/SKILL.md Step 0 (re-read :37-82) has no stock-count or closing-stock item in its close checklist.`
- `PRD.md:118 (re-read verbatim) scopes 'Perpetual inventory -> Periodic-basis stock only (ADR-044)' — the periodic model REQUIRES a closing-stock journal each period to state COGS; nothing prompts, posts, or validates it.`
- `db/v2/25-fns-ops.sql:365,:544-599 — record_year_end_close classifies all CO accounts as nominal and sweeps them to RE with no check that a closing-stock entry was posted for the FY, so a trading client's close silently locks in COGS = purchases and a stale/zero SoFP stock figure — and after the closed-period guard, the omission cannot be corrected in-period.`

**What is wrong / missing** — For the many stock-carrying SME clients, gross profit, COGS, and the SoFP stock line are silently wrong unless a human remembers to hand-draft the closing-stock adjustment with zero system support — the exact 'tie out to management accounts' failure the owner flagged. Neither audit examined inventory; the old build's real position is 'seeded accounts + dead markers'.

**What the rebuild must do** — The rebuild must implement the scoped periodic model end-to-end: a stock-count capture step, a DB-owned closing-stock adjustment function (marker-resolved OS/CS/BS, next-period auto-reversal like record_accrual), and a close-time completeness guard or surfaced warning when a stock-carrying client closes without a stock adjustment in the window.

### `GAP3-1` · **HIGH** · SST taxable-period facts are not modeled anywhere: no registration-effective date, no assigned period cycle, no DG-variation record — and the dashboard hard-codes calendar-aligned bi-monthly periods, so an odd-cycle or DG-varied registrant cannot even draft the right period
*Hero-prompt item: GAP-13a (F2 — TAX-MY-004)*

**Evidence**
- `db/v2/10-tables-core.sql:14-37 — clients carries only sst_no, sst_regime, default_sst_treatment; no sst registration-effective date, no assigned taxable-period cycle, no DG-variation, no s.11(1A) accrual-basis-approval flag. Repo-wide grep for taxable_period|sst_registration = 0 hits.`
- `db/v2/23e-fns-sst.sql:30-34 (header, re-read): 'period bounds are CALLER data; the only hard guards are shape + completeness'; :150-154 guards are only actor/shape/period-ended.`
- `db/v2/23e-fns-sst.sql:712-713 (re-read) — the fn pushes the problem to the human: due_date 'DERIVED… verify it against the MySST-assigned taxable period'; 'the FIRST taxable period after SST registration is RMCD-assigned and often irregular — confirm the assigned period bounds'.`
- `dashboard/lib/sstReturn.ts:22-40 (re-read) — biMonthlyPeriods generates ONLY the six calendar-aligned periods (m1 = 1,3,5,7,9,11); dashboard/components/tax/SstReturn.tsx:81-86,203-207 (re-verified) — the taxable-period selector offers exactly those and nothing else.`
- `agent/src grep compute_sst_return (re-run): zero hits — the agent has no compute tool for the return; the dashboard is the only compute surface.`
- `db/v2/tests/sst_return_test.sql:263-266 (re-read) — SP5 proves the FN accepts a DG-varied period (due = end+30, s.26(2)) — but no product surface can supply one.`

**What is wrong / missing** — The DB deliberately treats period bounds as caller data, yet no caller has the facts: the client's RMCD-assigned taxable-period cycle, registration-effective date, and DG variations are stored nowhere, and the only compute surface offers a fixed Jan-anchored calendar cycle. A registrant whose assigned cycle starts on an even month, a DG-varied client, or a first-return client will draft plausible-looking but wrong-period returns — the fn's overlap-supersede and honesty notes are the only backstops, and the wrong-bounds draft raises no error. TAX-MY-004 is confirmed still open, and the dashboard surface actively narrows below what the fn supports.

**What the rebuild must do** — Model SST registration facts as first-class data: registration effective date, regime effective-dating, the RMCD-assigned taxable-period cycle (anchor month + length), DG variations, and any s.11(1A) accrual-basis approval — then DERIVE period candidates (including the irregular first period) from those facts and validate caller-supplied bounds against them (fail loud on a non-assigned period instead of assuming calendar alignment). The rebuild's tax schema should treat 'assigned period' like tax_rates: effective-dated, human-confirmed master data.

### `GAP3-2` · **HIGH** · Coding still defaults an unconfigured service-tax registrant to service-8 (8%), the retained-6% classification doctrine is frozen at the 2024-03-01 list, and the tax_rates schedule carries no post-2024 effective rows despite claiming verification on 2026-06-14 — MSIC is captured but never drives the 6-vs-8 choice
*Hero-prompt item: GAP-13b (F2 — TAX-MY-003)*

**Evidence**
- `belcort/coa-coding/SKILL.md:201-204 (re-read) — 'read clients.default_sst_treatment. If NULL, INFER from sst_regime: service_tax -> service-8, sales_tax -> sales-10'; :209-210 the sector doctrine is only 'service-6 retained categories — F&B, telco, parking, logistics — stay 6%'.`
- `db/v2/18-tables-reference.sql:41-49 (re-read) — the entire effective-dated schedule: service-6@6 (2018), service-8@6->8 (2024-03-01), sales-5/10 (2018), exempt/zero/none; NO row dated after 2024-03-01; :23 claims 'LAST VERIFIED 2026-06-14 vs RMCD MySST'. The treatment vocabulary has no way to express the 2025-07-01 service-tax expansion sectors except by mislabeling them into the two legacy buckets.`
- `belcort/client-onboarding/SKILL.md:115 (Q6, re-read) — default_sst_treatment capture is OPTIONAL, frames service-6 as '(essentials)', and states 'if skipped it stays null and the agent infers service-8/sales-10 and routes the computed leg to review'.`
- `db/v2/tests/sst_default_treatment_test.sql — pins only column mechanics; zero assertions about sector classification or 6-vs-8 selection.`
- `clients.msic_code exists (db/v2/10-tables-core.sql:22; onboarding Q5 validates it) but the coa-coding treatment-resolution step (:201-204) never reads it — sector classification is not driven by any structured datum.`
- `Mitigations verified: computed legs ALWAYS route to needs_review with a human-confirm reason (coa-coding/SKILL.md:219-220), and a document-stated SST amount overrides computation (:184-193) — so the wrong rate cannot auto-post unsupervised, but the DRAFT a busy reviewer approves defaults to 8%.`

**What is wrong / missing** — TAX-MY-003 is confirmed still open: a 6%-sector service registrant whose default_sst_treatment was never set gets an 8% output-tax draft by doctrine default, and neither the rate schedule nor the classification doctrine has been updated past 2024-03-01 even though the file claims a 2026-06-14 verification — a doc-claim-vs-content drift. The only guard is the human reviewer rubber-stamping a queue. (Exact current RMCD sector/rate facts for the 2025-07-01 expansion were not re-verified against official sources in this pass — listed under unverified.)

**What the rebuild must do** — The rebuild must (1) re-verify the full SST rate/sector schedule against official RMCD sources and re-seed tax_rates with all effective-dated changes including the 2025-07-01 expansion groups; (2) widen the treatment vocabulary so 6% and 8% sectors are distinct, dated treatments rather than two frozen ids; (3) make sector classification a structured decision (MSIC/service-group driven, human-confirmed at onboarding, stored per client or per revenue stream) instead of an optional free default with a hardcoded 8% fallback; and (4) pin the classification doctrine with tests.

### `GAP3-3` · **HIGH** · The dual-registrant 'two separate declarations' remediation does not survive export: PDF/XLSX render one combined payable and silently drop the form_map (while counting its rows in row_count), CSV exports a form_map whose fields 12/13/14 are themselves combined across both taxes, and the worksheet's per-tax payables are never exported at all
*Hero-prompt item: GAP-13c (F2 — TAX-MY-001 residual, confirms H-13)*

**Evidence**
- `Fn-side remediation is real (re-read): db/v2/23e-fns-sst.sql:16-20 (header: ONE form, sales and service DECLARED SEPARATELY — a 'both' registrant files two declarations), :660-661 ('both' -> separate-declarations assumption), :751-775 worksheet.sales and worksheet.service each carry their own output/deduction_applied/excess/payable_cents. Test pin is note-level only: db/v2/tests/sst_return_test.sql:259-260 (SP5 asserts the 'SEPARATELY' assumption text exists — nothing about rendering).`
- `BUT the form_map itself is COMBINED (re-read): db/v2/23e-fns-sst.sql:788-798 — '12_total_output_tax_cents' = v_out (sales+service, :734), '13_deductions_applied_cents' = v_sal_applied + v_svc_applied, '14_payable_cents' = v_payable (both taxes summed, :736). A 'both' filer cannot lift two SST-02 declarations from form_map: fields 13/14 per tax are unrecoverable from it.`
- `PDF/XLSX drop the form map entirely (re-read): agent/src/tools/reportModel.ts:299-331 — sstReturnDoc renders only 'Return summary' (combined Output tax / Deduction / 'Tax payable' single total, :304-311) + 'By tax rate'; formMap is read (:323-324) but never pushed as a section (:325-326), while rowCount includes formCount (:330) — so the write-once export receipt's row_count overstates the rows actually rendered.`
- `CSV keeps form_map rows (agent/src/tools/exportFormat.ts:289-295, re-read) but inherits the combined 12/13/14, and neither CSV nor PDF/XLSX exports worksheet.sales/service per-tax payables or the assumptions/confirmations honesty layer (exportFormat.ts:273-296 emits only summary+by_rate+form_map).`
- `This artifact is the filing record: exportTool.ts:60 files sst_return under class 'filings' (subfolder sst-return) into the 7-yr write-once export_artifacts index.`

**What is wrong / missing** — The prior TAX-MY-001 defect (combined declaration for a dual registrant) is fixed in the DB worksheet but regresses at the artifact boundary: the exported SST-02 filing file — the thing a human actually files from, retained 7 years as the filing record — presents ONE combined return. In PDF/XLSX the per-tax and per-field structure is absent entirely; in CSV fields 12/13/14 are cross-tax sums. A 'both'-regime filer working from the artifact would declare combined figures on two separate statutory declarations, and the rendered PDF/XLSX additionally misstates its own row_count in the receipt.

**What the rebuild must do** — The rebuild's SST-02 export must render TWO complete declarations for a 'both' registrant (per-tax fields 11/12/13/14 from per-tax figures the fn must expose in form_map), carry the assumptions/confirmations honesty layer into the filing artifact, and make receipt row_count equal rendered rows. Pin with a golden dual-registrant export test.

### `GAP3-4` · **HIGH** · Statutory retention clock is anchored at row-creation (now()+7 years), not at the financial-period/YA end + filing date the ITA s.82/82A and CA2016 s.245 regime anchors on — and it is never recomputed by anything
*Hero-prompt item: GAP-14 (E — DSE-009)*

**Evidence**
- `db/v2/10-tables-core.sql:89-92 (re-read) — documents.retain_until timestamptz not null default (now() + interval '7 years'), comment: 'advisory floor + a legal-hold flag; delete is never granted (reverse-not-delete), a hold-gated purge job is future work'.`
- `db/v2/14-tables-ops.sql:175-177 (re-read) — export_artifacts.retain_until identical creation-anchored default.`
- `Repo-wide grep retain_until (re-run) = exactly 3 sites: the two column defaults + belcort/AGENTS.md:94 (§20 Storage CREED presents 'the 7-yr retain_until/legal_hold' as the operating retention control). No fn, trigger, test, or read surface ever recomputes, validates, or consumes retain_until.`
- `Failure window: a document for FY-end 31-Dec-2026 transactions uploaded 15-Jan-2026 gets retain_until 15-Jan-2033, while the statutory window (7 years from the period/YA end, later where filing extends it) runs to ~31-Dec-2033 — the advisory clock expires up to ~12 months (or more) inside the statutory window for every document uploaded before its period end. documents.financial_date exists (10-tables-core.sql:86) but is not used for the clock.`
- `Current mitigation verified: no purge path exists — table DELETE revoked from authenticated, and storage-setup.sql defines no DELETE (or UPDATE) policy (:43-59, re-read) — so the defect is latent until the documented 'hold-gated purge job' is built trusting this column.`

**What is wrong / missing** — DSE-009 is confirmed unremediated: retain_until is the only machine-readable retention clock in the system, doctrine (AGENTS.md §20) advertises it as the retention control, and it systematically under-states the statutory window because it starts at upload instead of at the financial-period/YA end + filing anchor. The moment the promised purge job (or any operator cleanup trusting the column) arrives, records still inside the statutory window become deletable — a compliance-grade defect for an accounting system of record. (Exact statutory anchor language of ITA s.82/82A / CA2016 s.245 taken from the prior ruling; not re-verified against gazette text — see unverified.)

**What the rebuild must do** — Anchor retention structurally in the rebuild: derive retain_until from the record's financial period (FY/YA end of the transactions it evidences, extended by filing date where applicable), recompute it when the document's financial_date/period attribution changes, floor it — never shorten it — and make any future purge job read the derived statutory clock plus legal_hold, with per-record disposal receipts.

### `GAP3-6` · **HIGH** · No falsifiable AI-quality acceptance harness exists anywhere: attribution precision/abstention, coding accuracy by document class, must-ask recall, and auto-post precision are all unmeasurable; the 0.95 thresholds gate on numbers that are self-reported or administratively pinned, and the docs declare go-live-ready with the eval explicitly waived
*Hero-prompt item: GAP-15 (cross — VP-02)*

**Evidence**
- `docs/architecture/backend.md:104 (re-read verbatim) — 'The system is go-live-ready; a formal accuracy eval is a future quality follow-up (the OpenAI SDK was chosen), not a remaining gate.' — the eval is not deferred-and-blocking, it is declared a non-gate.`
- `docs/reference/confidence-ladder.md:17-30 (inputs) and :129-137 (owner-tunable constants: 0.95 client match / auto-post, RM10k/RM50k bands, >=3 evidence, >=3 decay) — re-read; no calibration evidence cited anywhere. Gate 0 reads documents.client_match_conf (db/v2/10-tables-core.sql:83, numeric(4,3)) which is agent-self-reported at ingest — no ground-truth corpus measures whether nominal 0.95 ~ actual 95% precision.`
- `The auto-lane 'confidence' is assigned, not measured: db/v2/21-fns-kb.sql:250 and :453 pin confidence = greatest(confidence, 0.95) at promote/confirm (re-read) — every confirmed rule satisfies the >=0.95 auto rung BY CONSTRUCTION; confidence-ladder.md:95-97 admits the coupling ('the auto rung's threshold is satisfied by any confirmed rule'), so the threshold cannot fail and measures nothing.`
- `No eval assets exist: agent/test/ holds 27 unit test files (re-globbed), all mechanism-level (auth, cors, sse, wakes, buildTools, exportFormat…); no fixtures corpus; repo *eval* glob matches nothing product-level. db/v2/tests pin DB determinism, not model quality.`
- `Owner signal: scratchpad/signals/kb-iteration-system.md projects the smartening curve ('~85% auto-draft steady state', '0% -> ~70% auto-draft on day 1') — with no measurement apparatus anywhere in the product to observe those rates, let alone gate on them.`

**What is wrong / missing** — VP-02 is confirmed still open: every autonomy-threshold decision (0.95/0.97, must-ask bands, auto-lane admission) is uncalibrated guesswork, the one quantity the DB checks against 0.95 is pinned to pass, and the business case (85% auto-draft) is unfalsifiable. Without a scorecard the rebuild cannot define Gate-5 pass/fail for the AI layer, cannot detect model/doctrine regressions across model swaps (AGENT_MODEL is an env override), and cannot honestly tune autonomy per the supervised-autonomy law.

**What the rebuild must do** — Build the eval harness as a Phase-0/Gate-5 deliverable: a labeled golden corpus per document class (Malaysian invoices, receipts, statements, multilingual/handwritten), measured metrics — client-attribution precision AND abstention rate, coding accuracy by class, must-ask/escalation recall, auto-post precision — run per model/doctrine change, with published pass thresholds that the 0.95 constants must be calibrated against; store scorecards as governed artifacts so autonomy widening is evidence-gated.

### `GAP3-7` · **HIGH** · No maker-checker / segregation-of-duties model exists at any layer: the same bookkeeper who drafts or edits an entry approves it, 'high-stakes' needs_decision has the same one-person bookkeeper floor as routine review, the drafter's identity is not even modeled, and the auto-lane's compensating sweep sign-off can be executed by a viewer — or by the agent on its own postings
*Hero-prompt item: GAP-16 (cross — VP-07)*

**Evidence**
- `db/v2/20-fns-journal.sql:166-212 (re-read) — approve_entry gates ONLY assert_can_review() (bookkeeper+) + audit_actor (:184-185); the status gate (:190-191) accepts auto_draft/needs_review/needs_decision identically — the high-stakes tier requires no higher role and no second person; nothing compares the approver to any prior actor in journal_entry_history.`
- `Same-person edit->approve is unguarded: edit_entry (20-fns-journal.sql:269+) moves approved->needs_review under the same bookkeeper floor; the same caller can immediately approve their own edit — no drafter!=approver or editor!=approver check exists anywhere in db/v2 (grep).`
- `Maker identity is structurally absent: journal_entries has no author/drafted_by column (10-tables-core.sql:112-144, re-read), and the 'drafted' history row hardcodes actor 'agent' (20-fns-journal.sql:156-157) regardless of who drove the draft — the schema cannot even EXPRESS maker!=checker.`
- `The concept is absent from product law: grep maker|four-eyes|segregation|dual approv|partner sign|self-approv across every .md in the repo (re-run) = 0 hits; PRD.md:31-36 (re-read) defines role FLOORS only (je.approve at bookkeeper) with no separation duty; no table maps staff to clients (no portfolio/engagement-ownership model).`
- `The compensating control for unsupervised posting is self-satisfiable: acknowledge_auto_draft_sweep (db/v2/25-fns-ops.sql:1270-1292, re-read) has NO role floor and NO audit_actor constraint — p_actor is free text, blank coalesces to 'agent' (:1288), granted to all authenticated (:1292) — so a viewer can sign off the firm's auto-draft oversight sweep, and the fn is an interactive agent tool, meaning the same principal that auto-posted the entries can acknowledge its own sweep.`
- `Amplifier: bulk approve lets one actor approve batches, and its restart-resume runs on WHOEVER next attaches while auditing the original actor string (agent/src/jobs/bulkApproveRunner.ts:180-193, re-read: resumeOpen launches with job.actor under the attaching caller's JWT) — attribution and authorization can name different people.`

**What is wrong / missing** — VP-07 confirmed: fresh RBAC findings cover role floors only; there is no approval-control separation anywhere — actor attribution without duty separation. For a professional firm under MIA by-laws/ISQM expectations, one bookkeeper can draft, edit, approve, bulk-approve, and (via the unfloored sweep) sign off oversight of AI postings entirely alone; the agent can structurally satisfy its own compensating control. The owner had already ratified 'adaptive maker-checker' in the reverted decision set (per the work order; the reverted WP-013 kernel is prior art — tag not read per brief), so Gate-1 must record this as an evidenced absence, not an oversight.

**What the rebuild must do** — The rebuild must model duty separation as DB-owned policy: record the maker (drafter/editor) structurally on the entry, enforce drafter!=approver (and editor!=approver) in the approve function per firm policy, add a partner/admin sign-off tier for material and high-stakes classes (needs_decision must be distinguishable from needs_review in WHO may clear it), give the oversight sweep a real role floor + audit_actor and forbid 'agent' as its sign-off identity, and add client/portfolio assignment so coverage and review responsibility are expressible.

### `GAP4-1` · **HIGH** · No mutation-idempotency protocol: insert-style audited fns (draft_entry, record_accrual) take no idempotency key — a retry after a lost HTTP response duplicates books rows, including APPROVED accrual pairs
*Hero-prompt item: GAP-17*

**Evidence**
- `db/v2/20-fns-journal.sql:83-120 (re-read) — draft_entry(p jsonb): unconditional INSERT into journal_entries + journal_lines; no idempotency-key parameter and no natural unique constraint that would block a duplicate draft for the same document/description/date.`
- `db/v2/23c-fns-adjustments.sql:222-279 (re-read) — record_accrual: inserts the accrual entry with status 'approved' directly (:256-258) plus an auto-reversal pair (:266-272); no idempotency key — a duplicated call posts a SECOND approved accrual pair with no review gate.`
- `agent/src/runtime/openai/tools.ts:83 (re-read) — the tool layer's error text coaches the model: 'If this failed before a DB result, no row was written; retry the same tool' — true only for the JSON-parse pre-check, but it normalizes retry behavior for the case where PostgREST committed and only the response was lost.`
- `agent/src/http/server.ts:340-371 + agent/src/tools/buildTools.ts:92-107 (re-read) — neither the HTTP chat path nor the tool execute path layers any request-id/dedup on top of the fn call; nothing in the stack turns retry-after-unknown-outcome into a safe no-op for these fns.`

**What is wrong / missing** — The system has DB-level idempotency only where a natural key happened to exist (sha256, period bounds, occurrence dates); the two agent-driven insert fns most likely to be retried — draft_entry and the auto-posting record_accrual — silently duplicate on retry. record_accrual duplicates land as approved entries: a books-correctness failure that no human review intercepts.

**What the rebuild must do** — The rebuild's audited-fn catalog must make idempotency a schema-level rule: every insert-style mutation signature carries a caller idempotency key (or a declared natural unique) with a typed already-done response, so a duplicating retry is structurally impossible rather than behaviorally unlikely.

### `GAP4-3` · **HIGH** · Clarify answers are not correlated to the pending clarifyId and not bound to the asking user — a late/duplicate answer resolves the WRONG question, and any same-firm caller can answer another user's clarify
*Hero-prompt item: GAP-18*

**Evidence**
- `agent/src/http/server.ts:453-464 (and the bootstrap mirror :275-285, re-read) — the clarify route parses body.clarifyId and passes it into resolveClarify.`
- `agent/src/runtime/types.ts:53-59 (re-read) — ResolveClarifyRequest declares clarifyId: string | null, but agent/src/runtime/openai/runtime.ts:301-322 (re-read) never reads req.clarifyId: the only checks are run existence, rec.context.caller.firmId === req.caller.firmId, and rec.pending truthiness (:306); rec.pending.clarifyId (:98, :243) is never compared.`
- `agent/src/runtime/openai/runtime.ts:306 — no userId comparison either: the run's owning user (rec.context.caller.userId) is available but unchecked, so the runId acts as a firm-wide bearer capability for answering clarifies (any role, including viewer).`
- `agent/src/runtime/openai/runtime.ts:236-254 (re-read) — the clarify loop parks one question at a time; after answer A resolves question 1 the model may immediately park question 2 on the same runId, so a duplicate/late POST of answer A (slow network retry, double-click) is consumed as the answer to question 2.`

**What is wrong / missing** — During the exact flow where Clara is committing client facts (onboarding/carry-forward interviews are clarify chains), a stale or duplicated answer is silently attributed to a different question, and a different firm member can answer a question asked of someone else — mis-correlated answers become seeded knowledge and journal decisions with no protocol-level defense.

**What the rebuild must do** — The rebuild's clarify protocol must validate answer->question identity: reject with a typed 409 when the supplied clarifyId does not equal the pending one, bind the answer channel to the asking user (or an explicit policy), and persist Q&A as typed turns so mis-correlation is auditable.

### `GAP4-4` · **HIGH** · Stop/disconnect never aborts the server-side run: no cancel endpoint exists, the AbortSignal is accepted but never consumed, and the dashboard's Stop settles the UI while tools keep mutating books
*Hero-prompt item: GAP-18*

**Evidence**
- `agent/src/http/server.ts:434-449 (re-read) — the SSE route wires req.on('close') -> ac.abort() and passes ac.signal into streamRun.`
- `agent/src/runtime/openai/runtime.ts:208-279 (re-read whole fn) — streamRun's body never references req.signal; the SDK run() calls at :233 and :254 receive no signal, so the model loop plus its write tools continue to MAX_TURNS=40 (:39) regardless of the client.`
- `agent/src/http/server.ts full route inventory (re-read) — there is no cancel/stop route for interactive runs anywhere (the only cancel verbs are the bulk-approve job fns).`
- `dashboard/lib/chat/useHermesChat.ts:40-41 + dashboard/lib/chat/hermesChatTransport.ts:115-121 (re-read) — the composer's Stop aborts the client-side fetch and 'settle[s] on the partial at once' ('A user Stop (the turn's abort fired) is NOT a recoverable drop — settle on the partial at once'); no server call is made.`
- `agent/src/runtime/openai/runtime.ts:258-260,285-292 (re-read) — the abandoned run later settles 'completed' and settleInteractive persists a full assistant turn the stopped user never saw; meanwhile POST /chat/reset answers 409 run_in_flight (server.ts:425-426) while the zombie loop runs.`
- `Precedent already in-code: the wake path abandons rather than cancels too — withWakeDeadline is a Promise.race (runtime.ts:497-507, re-read).`

**What is wrong / missing** — A user who clicks Stop reasonably believes Clara stopped; in fact the loop continues for up to 40 model->tool turns under the interactive policy (which allows ALL writes), can approve/draft/reverse entries after the Stop, then persists a transcript that contradicts what the user watched. This is a direct supervised-autonomy/trust failure, not just a resource leak.

**What the rebuild must do** — The rebuild's run protocol must make cancellation real: an explicit cancel verb (and disconnect policy) that aborts before the next tool call, propagates an AbortSignal into the SDK loop and tool executor, records the run as cancelled with its partial output, and frees the scope lease immediately.

### `GAP4-5` · **HIGH** · No per-firm metering, token/spend budgets, run-concurrency limits, or fail-closed usage guardrails exist anywhere — the owner's pre-pilot requirement is confirmed absent in code and acknowledged open in the docs
*Hero-prompt item: GAP-19*

**Evidence**
- `Repo grep of agent/src for budget|spend|cost|meter|quota|usage — zero enforcement hits; the only limiter in the runtime is the wake gate's per-firm token bucket (agent/src/http/wakeGate.ts, configured windowMs 15_000 / ratePerMin 6 at agent/src/main.ts:184, re-read), which governs ONLY the webhook wake lane.`
- `agent/src/http/server.ts:340-371, :233-292 (re-read) — POST /firms/:id/chat and POST /bootstrap/chat have no rate limit, no per-firm concurrency cap, and no queue; the runs Map has TTL eviction (runtime.ts:484-495) but no size cap and no per-firm concurrency limit.`
- `agent/src/runtime/openai/runtime.ts:31,:39 + agent/src/main.ts:106 (re-read) — the entire OpenAI configuration is setDefaultOpenAIKey(cfg.openaiKey) plus MAX_TURNS=40; no modelSettings/maxTokens, no spend accounting, no provider circuit breaker.`
- `docs/PROJECTLOG.md:126 (re-read verbatim) — '[owner-only] Billing model — the explicit gate before public launch … the guardrail question is a per-firm token/usage cap + pricing/packaging. Interim guardrail is … the fail-closed signup_admission gate' — the harness itself records that the only live guardrail is a firm-COUNT gate, not usage metering.`

**What is wrong / missing** — A single firm (or a single stuck loop) can consume unbounded OpenAI spend and machine capacity on the shared single-machine plane with zero accounting, alerting, or fail-closed cutoff; the owner already ruled metering + fail-closed usage guardrails a pre-pilot requirement, and nothing of it exists — Gate 1 must record this as a sequencing constraint, and the commercial limits (per-firm budgets, concurrency, queue depth) become an explicit owner decision item.

**What the rebuild must do** — The rebuild must sequence DB-owned per-firm metering (tokens, runs, storage) with fail-closed budget enforcement, per-firm run-concurrency caps, and provider circuit breakers BEFORE any pilot; budgets are policy rows in the governed state layer, not code constants.

### `GAP5-1` · **HIGH** · Year-end close locks a period without any structural check on uncoded in-period documents, open/unbalanced reconciliations, or AR/AP/FA tie-outs — the g3/g4 gates exist only as prompt text and a bypassable UI button
*Hero-prompt item: F1 (prior ACCT-007)*

**Evidence**
- `db/v2/25-fns-ops.sql:384-535 (re-read; record_year_end_close complete guard list): actor_required, client_not_found, fy_already_closed, opening_balances_required, g1 unreviewed_entries_in_period at :411-418 counting ONLY needs_review/needs_decision, g2 prior_fy_not_closed at :422-434, tax-provision guards, trial_balance_unbalanced via _trial_balance_core :492-493, unclassified_acc_type :495-505, RE/partner guards — the fn never queries documents, bank_reconciliations, bank_statement_lines, or any *_control_tie_out.`
- `db/v2/25-fns-ops.sql:324-327 (header comment, re-read): 'g3/g4 stay skill-enforced (ADR-027) and are deliberately NOT added here'.`
- `belcort/year-end-close/SKILL.md:37-46 (Step 0 pre-close gate is doctrine text) and :72-82 ('uncoded/unassigned documents (g3) and the incomplete bank reconciliation (g4) are NOT enforced by the DB — they are THIS skill's MANDATORY surface-and-acknowledge gate'; owner-ratified visibility-over-constraint, re-read verbatim).`
- `belcort/year-end-close/SKILL.md Step 0 (re-read) — its checklist covers entries, documents, recons, the TX provision, pending adjustments, partnership registry, and the RE account; AR/AP/FA tie-outs are absent even from the skill's list.`
- `dashboard/lib/periodClose.ts:100-149 (re-read) — UI checklist: open recons = blocker:true (:119) but AR/AP/FA tie-outs = warn-only 'A timing gap — surfaced, not blocking' (:127-134), uncoded docs = advisory warn (:121-125); and EVERY failed read degrades to state:'warn', blocker:false (:106,:112,:118,:124,:130,:139) — a recon-read failure silently converts the would-be blocker into 'Couldn't check' and ready flips true (:149).`
- `dashboard/components/books/PeriodClose.tsx — the 'Close FY' button only sends a chat intent to Clara (periodClose.ts:153-154 buildCloseFyIntent) and is disabled on blockers — it is not the mutation authority.`
- `db/v2/25-fns-ops.sql:777 (re-read) — grant execute on record_year_end_close to authenticated; the fn body contains NO assert_can_review/role floor and p_actor is free text (not audit_actor-constrained): any member, including a viewer, can call the fn directly via PostgREST, bypassing both the skill's Step 0 and the dashboard checklist.`
- `db/v2/25-fns-ops.sql:738-775 + db/v2/14-tables-ops.sql (client_fy_close) — the fn's own visibility payload covers only pending_adjustments + unswept_auto_posts; nothing about docs/recons/tie-outs is surfaced or persisted, and client_fy_close stores no readiness/acknowledgment state at close time.`

**What is wrong / missing** — The close's completeness conditions live at three inconsistent altitudes — DB hard gates (g1/g2/TB/unclassified), prompt text (g3 uncoded docs, g4 open recons, drafting, TX-provision), and a UI checklist (recons blocking, tie-outs warn-only) — and no altitude survives every caller path: the fn is EXECUTE-granted to every authenticated member with no role floor, the UI checklist fails open on a read error, and AR/AP/FA tie-outs gate nothing anywhere. A period can be locked over uncoded in-period source documents, open/unbalanced reconciliations, and failing subledger/FA tie-outs, after which trg_je_closed_period (25:297-322) blocks the corrections. The 'surface-and-acknowledge' doctrine also leaves NO persisted acknowledgment: the close receipt records nothing about what was unmet at close time.

**What the rebuild must do** — The rebuild's period-state machine must make close readiness a DB-owned typed checklist evaluated inside the close transaction: each condition (unreviewed+drafting entries, uncoded/unassigned in-period documents, open/unbalanced recons, AR/AP/FA tie-out drift, pending adjustments incl. depreciation) either hard-gates or requires an attributed, persisted acknowledgment receipt stored on the close row — so every caller path (agent, dashboard, direct RPC) meets the same gate and the sign-off state is auditable evidence, not prompt text.

### `GAP5-2` · **HIGH** · reverse_year_end_close hard-DELETEs the close's financial-position snapshot, and the entire close lifecycle (closing/opening entries + their reversals) writes zero journal_entry_history receipts
*Hero-prompt item: F1 (prior SEC-008)*

**Evidence**
- `db/v2/25-fns-ops.sql:819-821 (re-read) — 'remove the close-generated snapshot': DELETE FROM client_financial_position WHERE client_id=... AND generated_by_close_id = v_close.id — a hard delete, not supersession.`
- `db/v2/tests/reverse_year_end_close_test.sql:67-70 (re-read) — the DELETE is asserted as intended behaviour ('FAIL close snapshot not removed'); the PASS notice at :95 celebrates 'snapshot removed' — a ratified design defect, not a slip.`
- `db/v2/25-fns-ops.sql:779-782 (re-read) — reversal header comment: 'No journal_entry_history rows (symmetric with the close)'; the fn body (:783-829) confirms: no history insert anywhere.`
- `db/v2/25-fns-ops.sql:474-481 vs :566-704 (re-read) — within record_year_end_close the ONLY journal_entry_history row is for the optional tax-provision entry (:480-481); the closing entry (:567-569) and opening entry (:675-677) get none.`
- `db/v2/25-fns-ops.sql:799-816 (re-read) — reversal entries carry a HARDCODED review_reason 'year-end close reversed' — no operator reason is captured; p_actor is free text, unconstrained by app.audit_actor (:791,:824).`
- `db/v2/25-fns-ops.sql:830 (re-read) — grant execute to authenticated — no role floor on re-opening a signed-off year.`
- `db/v2/13-tables-client.sql:98 (verifier-corrected line) — client_financial_position.generated_by_close_id is a plain bigint with no FK ('no FK; client_fy_close in 14-tables-ops') — the deleted snapshot leaves no tombstone.`

**What is wrong / missing** — Re-opening a closed year destroys the signed-off position evidence: the FP snapshot that management accounts were issued against is deleted outright (violating the repo's own reverse-not-delete law that every other surface follows), and neither the close nor its reversal leaves per-entry history receipts — journal_entry_history, the append-only entry audit that feeds firm_activity_feed, is silent for the highest-stakes entry class. No reason is required to reverse, actor attribution is spoofable free text, and any member can do it. The only durable trace is the reversed_at/reversed_by stamp on client_fy_close plus the mirror journals themselves.

**What the rebuild must do** — The rebuild must supersede-not-delete close snapshots (version them or stamp reversed_at, keeping the signed-off figures readable forever), write typed history/receipt rows for every close-generated and reversal entry (actor, reason, lineage), require an explicit operator reason and a role floor on reverse_year_end_close, and surface close/reopen events in the activity feed.

### `GAP5-4` · **HIGH** · Professional tax confirmations cannot be persisted as audited decisions: no typed adjustment/confirmation write-back, no reviewed/finalized states, no persistent b/f relief ledger, and exports proceed while confirmations remain open
*Hero-prompt item: F2 (prior TAX-MY-005)*

**Evidence**
- `db/v2/23d-fns-tax.sql:40-52 (re-read) — compute_tax_draft's ONLY human inputs are client_id, fy, actor, msme_eligible, approved_donations_cents, notes — no input exists for a confirmed WHT disallowance, 916-000 fines split, doubtful-debts decision, exempt income, or brought-forward relief.`
- `db/v2/23d-fns-tax.sql:382-390 (re-read) — brought-forward business losses / unabsorbed CA are quoted as a confirmation string: 'NOT applied in this draft; confirm + deduct the brought-forward relief manually' — but 'manually' has no code path: no input key, no adjustment fn, no relief ledger table anywhere in db/v2.`
- `db/v2/19d-tables-tax.sql:112 (re-read) — tax_computations.status CHECK is ('draft','superseded') only — no reviewed or finalized state exists in the schema.`
- `dashboard/lib/taxComp.ts:4-7 (re-read verbatim) — as-built self-description: 'The honesty layer is DISPLAY-only ... the only "confirm" lever is a RECOMPUTE with the two human inputs ... there is no per-item persisted tick in the backend'.`
- `dashboard/components/tax/TaxComputation.tsx:106-114 (re-read) — 'Export forms' button is enabled on canExport && draft && w — NOT gated on w.confirmations_needed.length; the PendingBanner at :139 is display-only.`
- `dashboard/lib/taxComp.ts (buildExportFormsIntent) — routes the export as a free-text chat intent to Clara with no state precondition.`
- `db/v2/14-tables-ops.sql:133-135 (re-read) — export_receipts scope CHECK enumerates journals/trial_balance/documents/full/general_ledger/opening_balances/management_accounts/aging/sst_return/analysis — there is no tax_computation scope, so a tax-form export can only ride the untyped 'analysis' lane with no tax-specific receipt class.`
- `db/v2/23d-fns-tax.sql:447-448 (re-read) — confirmations persist only as a text[] inside the worksheet jsonb — free strings, not typed, not resolvable, not attributable.`

**What is wrong / missing** — Every open judgment the DB itself flags (WHT disallowance, fines split, doubtful debts, MSME eligibility beyond the boolean, brought-forward losses/unabsorbed CA) is a display-only string: the human tax agent's resolution cannot be recorded as an audited decision that recomputes the draft, the draft has no reviewed/finalized lifecycle, and a materially over/understated computation can be exported as filing-support material while confirmations remain open — the only defence is a banner. Prior-YA relief silently evaporates unless someone re-types it nowhere (there is no field to type it into).

**What the rebuild must do** — The rebuild needs a typed tax adjustment/confirmation model as schema, not polish: per-item confirmation records (item kind, decision, actor, reason, evidence link) that feed the recompute; a draft->reviewed->finalized state machine on tax_computations; a persistent relief ledger for b/f losses and unabsorbed CA that carries YA-to-YA; a first-class tax_computation export class; and an export gate that blocks (or requires explicit acknowledged override of) open confirmations.

### `GAP5-5` · **HIGH** · Read altitude is firm-wide by design while writes are scope-gated: cross-client read contamination surfaces as a scope-valid wrong posting, not an error — an unowned rebuild design decision
*Hero-prompt item: G3 (prior AR-10)*

**Evidence**
- `agent/src/tools/buildTools.ts:54-79 (re-read) — enforceScope runs on tool execute and gates by scopeRule; it is the WRITE-gate per the file header :2 'a write cannot target a client other than the resolved scope'.`
- `agent/src/tools/registry/reads.ts:1-2 (re-read verbatim) — header: 'No write-gate (reads are RLS-bounded to the firm; the agent may read any client in its own firm)'; every named read tool declares scopeRule:'none' (:13,:29,:46 re-verified; param docs :17,:50 repeat 'any client in the firm').`
- `agent/src/tools/buildTools.ts:110-122 (re-read) — queryToolDef (the freeform query_books read) calls assertReadOnlySql + ctx.query directly with NO enforceScope, no scope awareness at all.`
- `db/v2/26-fns-session.sql:119-141 (re-read) — agent_select is SECURITY INVOKER — RLS scopes to the FIRM only; no client predicate exists or is injected.`
- `The export/analysis lanes DO scope-check their client target (exportTool/analysisTool) — proving the scope machinery exists and reads were deliberately exempted.`
- `belcort/AGENTS.md:78 (re-read verbatim) — doctrine ratifies the posture: reads '(SELECT-only, RLS-scoped, no write-gate)'.`
- `agent/src/runtime/types.ts + server.ts — ActiveScope is resolved per turn and carried in ToolContext (the write gate consumes it); nothing tags read RESULTS with the client they came from.`

**What is wrong / missing** — While the active scope is client A, Clara can freely read client B's kb rules, aliases, memory notes, and transactions via query_books or any named read, compose A's answer or coding proposal from B's data, and the write gate then forces the resulting draft INTO A — converting cross-client read contamination into a wrong-but-scope-valid posting rather than a blocked one. There is no client-provenance tag on read results, no warning when reads cross the active scope, and no deliberate scope-transition event; the only mitigation is model behaviour. Within-firm cross-client mis-posting is exactly the 'never guess the client' failure class the doctrine calls firm-killing, yet the read layer has no altitude control at all.

**What the rebuild must do** — This belongs on the Gate-1 open-decision list for the rebuild's context-pack/read-tool layer: client-scoped reads by default (reads inherit the active scope unless a named cross-client/portfolio read is invoked), named firm-altitude reads as deliberate typed operations, explicit auditable scope transitions, and client-provenance tagging on read results so contamination is detectable rather than silent.

### `GAP5-6` · **HIGH** · A later clarify upload REPLACES the parked run's attachment batch, so held document_refs from an earlier upload (the Q12 opening records) silently resolve into the wrong batch — the documented onboarding happy path clobbers its own evidence
*Hero-prompt item: E (prior SDT-009)*

**Evidence**
- `agent/src/runtime/openai/runtime.ts:313-316 (re-read) — resolveClarify: `if (req.documents && req.documents.length > 0) { rec.context.documents = req.documents; }` — assignment REPLACES the whole batch; no append, no versioning.`
- `agent/src/tools/buildTools.ts:255,270-274 (re-read) — upload_document's document_ref is a '0-based index into this turn's attachments', resolved against the CURRENT ctx.documents; in-range stale refs resolve silently to the WRONG document, out-of-range raises UploadRejected. extract_document (:329-337) resolves the same way — OCR of the wrong file is silent.`
- `belcort/client-onboarding/SKILL.md:211-222 (re-read) — Q12 management-accounts files ride a mid-interview clarify answer and the model is EXPLICITLY told to 'HOLD them: index + OCR happen AFTER onboard_client' — i.e., deliberately defer using the refs across later clarify rounds.`
- `belcort/client-onboarding/SKILL.md:156-168 (re-read) — sample invoices are attached on a LATER clarify of the same paused run — the [[step:14/14:sample_invoices]] end-of-Phase-A step — followed by the Phase-B dry-run and onboard_client, all before the held Q12 refs are consumed.`
- `agent/src/runtime/openai/runtime.ts:44-58,188-193 (re-read) — each docs-carrying turn appends a manifest with document_ref indices to the message — earlier manifests with now-stale indices remain in the model's transcript context.`

**What is wrong / missing** — In the standard onboarding flow with BOTH uploads, the Q12 batch is always overwritten by the step-14 sample-invoice batch before the post-onboard upload step: the held Q12 document_refs then either hard-fail (index out of range) or — when the index is in range — silently upload and OCR a sample invoice AS the management accounts, feeding the ISA-510 carry-down proposal from the wrong evidence and binding the wrong bytes' sha256 into the opening records' provenance. The same aliasing bites any workflow where a user attaches documents across two clarify answers of one parked run. Only a skip (answering without documents) is safe, since the replace is conditional on a non-empty batch (runtime.ts:313).

**What the rebuild must do** — The rebuild needs immutable per-attachment references: stable, sha-addressed attachment IDs that survive the whole run (append-not-replace context), refs that fail loud on staleness instead of re-resolving by position, and per-batch identity in the manifest so a held reference can never silently alias into a later upload.

### `GAP2-4` · **MEDIUM** · The owner's Tier-2 proactive layer — weekly curator regenerating derived client views (coa-snapshot / vendor-roster / recurring-patterns) and mining un-noticed patterns — has no v2 equivalent; v2 learning is purely event-reactive
*Hero-prompt item: C — owner KB signals (Tier-2 curator + derived views)*

**Evidence**
- `scratchpad/signals/per-client-kb-mechanism.md:31-33 (weekly regen of coa-snapshot.md / vendor-roster.md / recurring-patterns.md by kb-curator), :137-141 + :223-263 (weekly kb-curator Mon 06:00: detect_new_rules -> proposals); kb-iteration-system.md §3 (the tier MINES data for patterns the user didn't notice) — all verified present.`
- `agent/src — no scheduler exists: grep 'cron|weekly|schedule|setInterval|curator|vendor-roster|recurring-patterns|coa-snapshot|graphify' (re-run) finds only the SSE keepalive setInterval (http/server.ts:155); no periodic job runner of any kind.`
- `Grep the same tokens across belcort/: zero hits — neither the detectors, the derived views, nor the graph builder were ported.`
- `v2's closest analogues are all event-driven reactions to single human verbs: record_kb_evidence auto-files an open proposal at >=3 tallies (db/v2/21-fns-kb.sql:199-207) and the learn-wakes fire per human triage/workbench/bank-match action (db/v2/25-fns-ops.sql:1526-1548, re-read); nothing scans accumulated coded history for rule-shaped or account-shaped patterns, and nothing regenerates a client-context digest for the agent's coding context.`

**What is wrong / missing** — The proactive half of the owner's two-tier learning model is missing: patterns the bookkeeper never explicitly acts on are never mined into proposals, and the agent has no regenerated per-client context views (vendor roster, recurring rhythms, COA snapshot) to code against — the C1 keep/merge/retire ruling at Gate 1 must weigh this whole tier, not just the rules table.

**What the rebuild must do** — The rebuild needs a scheduled (or wake-driven batch) curator lane: pattern detectors over coded history emitting human-gated proposals, plus regenerated per-client context packs that feed the agent's fresh-context assembly.

### `GAP3-5` · **MEDIUM** · legal_hold is a dead control: no audited place/release/extend function exists, direct UPDATE is revoked from the request plane, so no firm user or agent can actually place a legal hold through any governed path — and there is no disposal workflow it would gate
*Hero-prompt item: GAP-14 (E — DSE-009, legal-hold half)*

**Evidence**
- `Repo-wide grep legal_hold (re-run) = 3 hits total: the two column definitions (db/v2/10-tables-core.sql:92, db/v2/14-tables-ops.sql:177, both boolean not null default false) and belcort/AGENTS.md:94 which cites it as part of the operating retention creed.`
- `No SECURITY DEFINER fn writes it: no db/v2 module contains an UPDATE touching legal_hold (grep), and the agent tool registry / dashboard have no legal-hold surface.`
- `Direct writes are structurally impossible from the request plane: insert/update/delete on documents / export_artifacts are revoked from authenticated/anon — only service_role/migration could flip the flag, outside any audit trail.`
- `No lifecycle semantics exist anywhere: no hold-reason, no placed-by/released-by audit, no extend/expiry, no disposal process the flag would gate (10-tables-core.sql:89-90 admits 'a hold-gated purge job is future work').`

**What is wrong / missing** — The system's own doctrine presents legal_hold as an existing safeguard, but a firm receiving an LHDN audit notice, RMCD query, or litigation hold today has NO governed way to mark affected records — the flag can only be set by an operator with service_role, unaudited. Severity is medium only because no purge exists yet for the hold to gate (the reverse-not-delete grants are the real protection today); it becomes load-bearing the day any disposal process lands.

**What the rebuild must do** — The rebuild must ship legal hold as a real workflow: an audited place/release/extend function pair (admin+ floor, reason required, append-only hold audit), hold scope by client/period/matter not just per-row booleans, and a disposal process that is structurally blocked by both the derived statutory clock (GAP3-4) and any live hold.

### `GAP4-2` · **MEDIUM** · Same-scope concurrent runs: POST /chat has no lease/CAS/409 — two tabs mint two overlapping model loops on one session and set_active_run is last-writer-wins
*Hero-prompt item: GAP-17*

**Evidence**
- `agent/src/http/server.ts:340-371 (re-read) — the chat start path ensures the session, appends the user turn, starts the run, and fire-and-forgets setActiveRun; it destructures only { sessionId } at :354 — the prior live run is never consulted.`
- `agent/src/http/server.ts:416-431 (re-read) — the only run_in_flight 409 in the product guards POST /chat/reset, not chat start.`
- `db/v2/26-fns-session.sql:71-80 (re-read) — set_active_run is an unconditional UPDATE chat_sessions SET active_run_id; no compare-and-set against a still-running prior run, no error on overwrite.`
- `agent/src/runtime/openai/runtime.ts:175-206 (re-read) — startRun registers a fresh RunRecord with no per-session or per-scope exclusivity; each run streams independently (single-flight is per-run only, :225-228).`
- `dashboard/lib/chat/useHermesChat.ts:24 (re-read) — Send<->Stop serialization is per-tab client state; a second browser tab has its own state, so the server is the only possible authority and it has none.`

**What is wrong / missing** — Two tabs POSTing into one scope produce two concurrent model loops over the same session, each holding a history snapshot that excludes the other's turn (loadHistory runs before the sibling's append at server.ts:356-357) — interleaved transcript writes, cross-talking answers, both loops free to mutate the same client's books (multiplying GAP4-1's duplicate risk), and the session pointer forgetting the first run so its clarify/drop-recovery path is orphaned.

**What the rebuild must do** — The rebuild's run protocol needs a per-scope run lease: chat start performs a CAS on the scope's active run (typed 409 run_in_flight with the live run id, letting the UI attach instead), and active_run_id transitions are guarded, never overwritten.

### `GAP4-6` · **MEDIUM** · Live Fly app carries secrets (CLAMD_HOST/PORT/TIMEOUT_MS) with zero code counterpart on frozen master, and the running image cannot be tied to the audited tree — 'all planes in sync' is an unverifiable doc claim
*Hero-prompt item: GAP-20*

**Evidence**
- `flyctl secrets list -a belcort-agent (re-executed read-only 2026-07-17 by verifier): CLAMD_HOST, CLAMD_PORT, CLAMD_TIMEOUT_MS all 'Deployed' alongside the documented manifest (OPENAI_API_KEY, SUPABASE_*, WEBHOOK_SECRET, ALLOWED_ORIGINS, AZURE_DOCAI_*).`
- `Repo-wide grep for CLAMD|clamav on the frozen tree (re-run): zero hits; deploy/RUNTIME.md's env manifest and deploy/CUTOVER.md list no CLAMD variables.`
- `git (read-only, re-run): the only commit in any ref touching CLAMD is 1e77e835 'Complete Clara prompt objectives and release evidence' on unmerged branch codex/clara-release-evidence — NOT an ancestor of master (ac0a684f).`
- `flyctl releases -a belcort-agent (re-run): v50 deployed Jul 13 14:25 and v51 (current) Jul 14 02:57 — both AFTER that branch commit; flyctl status shows the live machine 080d16ef6461e8 running image belcort-agent:deployment-01KXF8WMQD997GXZ5Z0DXS0F4N, whose source git ref is not determinable read-only.`
- `CLAUDE.md + docs/architecture/backend.md:104 (frozen repo): 'all three planes (Supabase / Fly / Vercel) are in sync' — per the brief's evidence discipline, a doc claim that now disagrees with observable live config.`

**What is wrong / missing** — The live agent's configuration was provisioned for code that exists only on an unmerged (since-abandoned) branch, and the deploy cadence (releases through Jul 14) postdates the Jul-9 baseline the memory notes claim live equals — so every audit severity call describes the frozen tree while the production app may be running different, unaudited code. The clean-reset/relaunch plan must not assume live == master.

**What the rebuild must do** — Before the rebuild's destructive reset, take the private snapshot and positively identify the running image's git ref (or accept it as unknown and treat live as untrusted); the new build must stamp every deploy with its git SHA (image label + /health echo) and keep the env manifest authoritative so config-vs-code drift is mechanically detectable.

### `GAP4-7` · **MEDIUM** · Live inspection confirms the wake and OCR lanes are ARMED in production (SUPABASE_JWT_SECRET + AZURE_DOCAI_* deployed) — severity discounts that assumed unconfigured lanes are invalid
*Hero-prompt item: GAP-20*

**Evidence**
- `flyctl secrets list -a belcort-agent (re-run): SUPABASE_JWT_SECRET Deployed — so the wake-credential minter is constructed (agent/src/main.ts:136-138, re-read: mintWakeCaller built when cfg.jwtSecret present) and the 'wake dispatch not configured' honest-refusal branch (agent/src/http/server.ts:204, runtime.ts:347-349) is NOT the live state; condition wakes that pass the webhook HMAC will dispatch real model runs, including the mutation-capable [documents] lane (buildTools.ts:25 blocklist policy).`
- `flyctl secrets list (re-run): AZURE_DOCAI_ENDPOINT + AZURE_DOCAI_KEY Deployed — extract_document's 'OCR is not configured' degrade branch (main.ts:128-131) is not the live state either.`
- `curl https://belcort-agent.fly.dev/health -> {"ok":true,"runtime":"openai"} (re-run); flyctl status: exactly ONE machine, state started, 1/1 checks passing, region sin — matching fly.toml's single-machine in-memory-state posture (the no-durable-runs findings apply to the real production topology, not a hypothetical).`
- `vercel ls (re-run): belcort-dashboard-v2 latest Production deployment 3d old (Jul 14), consistent with the frozen plane; a second Vercel project clara-by-belcort has Production deploys as fresh as 2h (Jul 17); it appears nowhere in the frozen harness docs.`

**What is wrong / missing** — Prior lanes marked all live-config questions unverified and some severity calls (documents-wake mutation reach, OCR-dependent paths) were implicitly conditional on 'if configured live'. That conditional is now resolved AGAINST the discount: the [documents] wake lane — which can call approve_entry/reverse_entry/run_depreciation etc. — is reachable in production whenever a webhook fires, and the single-machine restart-loses-everything topology is the real deployment. Separately, the active clara-by-belcort Vercel project (likely the redo-rebuild's own new plane) is deploying to production during the audit and needs explicit ownership confirmation so the frozen-evidence boundary stays clean.

**What the rebuild must do** — Gate-1 packet should carry these live facts as settled: wake + OCR armed, one-machine topology confirmed, dashboard plane frozen since Jul 14; the rebuild's wake design must therefore treat per-mutation wake policy as a launch-blocking control, not a doc nicety, and the orchestrator should confirm clara-by-belcort is the redo plane (and that nothing deploys the OLD stack).

### `GAP5-7` · **MEDIUM** · Documents-tab 'Assign all' mass-files the ENTIRE mixed unassigned lane to one client with no grouped preview, no outlier handling, and no subset selection — despite per-row evidence pointing elsewhere
*Hero-prompt item: B (prior DSE-010)*

**Evidence**
- `dashboard/components/documents/FirmDocumentsTriage.tsx:125-153 (re-read) — assignAll: `for (const doc of docs)` applies the single bulkTarget to EVERY document currently in the lane; the only inputs are one select + one button — no per-doc checkboxes, no confirmation dialog, no pre-commit summary.`
- `dashboard/components/documents/FirmDocumentsTriage.tsx:294-320 (re-read) — each row DISPLAYS per-doc evidence — the OCR counterparty guess (:317) and Clara's client_match_conf (:299,:318-320) — but assignAll never consults it: a doc whose evidence points at a different client is filed identically, with no outlier warning.`
- `dashboard/components/documents/FirmDocumentsTriage.tsx:202,215-223 (re-read) — the verb is armed by one dropdown pick; the label 'Assign all {docs.length} to' is the entire preview; success toast (:148 'Clara's been notified') fires after commit.`
- `db/v2/25-fns-ops.sql:1526-1529 (re-read) — each assign writes a document_audit row that fires the durable document_triaged wake (actor is distinct from 'agent') — Clara is notified to file each mis-assigned doc, and the [documents] wake policy permits writes (buildTools.ts:25), so downstream filing/coding proceeds on wrong-client evidence.`
- `db/v2/22-fns-documents-recon.sql:86 (re-read) — reassign_document blocks CODED documents ('document_already_coded') — so a mass mis-file hardens into the wrong client's books once Clara or a human codes them.`
- `dashboard/components/documents/__tests__/FirmDocumentsTriage.test.tsx — tests verify only the loop-of-singles mechanics and partial-failure handling — no test exercises a mixed-evidence lane.`

**What is wrong / missing** — The unassigned lane is by definition multi-source (firm-scope chat uploads and unmatched inflow), so a mixed batch spanning several clients is the NORMAL case — yet the one bulk verb files everything to a single client in one click, ignoring the very match-confidence evidence the lane renders, with no grouped pre-commit summary and no way to exclude outliers short of assigning row-by-row. Each mis-file immediately notifies Clara to act on it, and becomes non-reassignable once coded — wrong-client evidence (and downstream wrong-client entries) in the highest-volume intake workflow.

**What the rebuild must do** — The rebuild's batch-assignment UX must group before committing: a pre-commit summary grouped by suggested client, outliers (low/other-client match confidence) excluded by default and individually opted in, subset selection, and a confirm step that names counts per target — one human verb per homogeneous group, never one verb per lane.

#### Verified as sound (workstream X)

- edit_entry cannot alter an entry's document provenance pair: its header UPDATE whitelist touches only description/posting_date/status/review_reason, so document_id/source_doc_sha256 are fixed after draft — the binding failure is confined to draft-time (no validation) and reassign-time (not cleared/moved), not to the edit path.  ·  _evidence:_ `db/v2/20-fns-journal.sql:305-310`
- reassign_entry has two real partial mitigations: it blocks 'approved' entries and clears kb_rule_id on the move (with an explanatory comment) — they simply do not cover auto_draft anchors, matched lines, recon fields, or document provenance.  ·  _evidence:_ `db/v2/20-fns-journal.sql:382; db/v2/20-fns-journal.sql:386-389`
- The deferred balance trigger still applies to in-place edits of posted entries — an edit cannot leave a non-drafting entry unbalanced at commit, so GAP0-4 is an immutability/audit-integrity breach, not a balance breach.  ·  _evidence:_ `db/v2/15-triggers.sql:33-75`
- Closed-period entries are incidentally shielded from edit_entry because its header UPDATE always fires the BEFORE-UPDATE closed-period guard on journal_entries; note the guard does not exist on journal_lines, so only paths that touch the header are covered.  ·  _evidence:_ `db/v2/25-fns-ops.sql:297-322; db/v2/20-fns-journal.sql:305-310`
- The interactive review family (approve/reject/edit/reassign/reverse) does enforce a real intra-firm role floor and actor constraint DB-side: assert_can_review + audit_actor are present in all five — GAP0-2 is about the missing human-approval event, not about missing RBAC on these five fns. NOTE the contrast: record_year_end_close / reverse_year_end_close / acknowledge_auto_draft_sweep carry NO such floor (GAP5-1/5-2/3-7).  ·  _evidence:_ `db/v2/20-fns-journal.sql:184-185; db/v2/20-fns-journal.sql:226-227; db/v2/20-fns-journal.sql:284-285; db/v2/20-fns-journal.sql:374-375; db/v2/22-fns-documents-recon.sql:782-783`
- reassign_document correctly re-asserts BOTH clients' firm ownership and blocks coded documents — firm isolation on the verb itself is sound; the defect is dependents, not scope.  ·  _evidence:_ `db/v2/22-fns-documents-recon.sql:78-89`
- match_bank_line/unmatch_bank_line firm-scoping, RBAC floor, and actor attribution are sound: assert_firm_owns_client + assert_can_review (bookkeeper+) + audit_actor anti-spoof on both verbs, FOR UPDATE row locks, and an append-only bank_match_audit row with real before/after — the flaw is the missing match-model constraints, not the security wrapper.  ·  _evidence:_ `db/v2/22-fns-documents-recon.sql:465-468; db/v2/22-fns-documents-recon.sql:527-530; db/v2/tests/match_bank_line_actor_test.sql`
- open_reconciliation's own contract is solid for what it checks: all seven fields required with clean domain errors, bank account verified against client+firm, statement document verified against firm AND client — cross-client statement docs rejected.  ·  _evidence:_ `db/v2/22-fns-documents-recon.sql:395-449; db/v2/tests/open_reconciliation_contract_test.sql`
- The access-token hook is authoritative at issuance in its NORMAL path: strips every inbound firm_id/firm_role (top-level and app_metadata) before injecting from the active membership in an ACTIVE firm, and EXECUTE is granted only to supabase_auth_admin. VERIFIER CAVEAT: the hook's exception handler FAILS OPEN (`exception when others then return event`, 00-foundation.sql:274-276) — on any error it returns the event UNCHANGED, inbound claims preserved. Deliberate (a throw blocks every login) but it means the strip is not unconditional.  ·  _evidence:_ `db/v2/00-foundation.sql:252-282; db/v2/90-isolation-tests.sql TEST 20`
- The agent HTTP shell authenticates with real signature verification (HS256 secret or JWKS, issuer+audience) on every /firms route plus an IDOR guard; decode-only helpers are explicitly fenced as non-auth — the stale-claims issue is upstream of, not in, this verifier.  ·  _evidence:_ `agent/src/http/auth.ts:93-125; agent/src/http/auth.ts:1-8,46-49; agent/src/http/server.ts:298-301`
- The tracing exporter bounds individual span fields at 100KB with truncation, so the export is size-bounded — this mitigates payload volume, not confidentiality, and does not weaken GAP1-8.  ·  _evidence:_ `agent/node_modules/@openai/agents-openai/dist/openaiTracingExporter.js`
- The signal docs the C verifier could not access DO exist (scratchpad/signals/kb-iteration-system.md, per-client-kb-mechanism.md) and the C-11..C-14 tier/proposal characterizations hold against them: v2's ladder is candidate/confirmed/retired with no 'locked' tier and its human-gated proposal flow matches the owner docs' user-gated-promotion intent — the un-ported pieces are the three mechanisms in GAP2-2/3/4, not the tier model.  ·  _evidence:_ `scratchpad/signals/per-client-kb-mechanism.md:117-118 ('locked' tier); db/v2/12-tables-kb.sql:19,54,72,96; db/v2/21-fns-kb.sql:199-207`
- v2 already has a sound batch-seeding primitive that a rebuilt Path-B lane could reuse: seed_client_knowledge is atomic, idempotent, alias-resolving, and array-driven (rules[] + notes[]) — the gap is the missing GL-parse feeder and the skill-side 'only human-ticked mappings' eligibility rule, not the DB function shape.  ·  _evidence:_ `db/v2/24-fns-onboard.sql:367-424; belcort/client-onboarding/SKILL.md:344-366`
- The close-lock discipline itself is correctly implemented where it was applied: run_recurring_journals, record_accrual, run_amortisation (23c:142/:234/:398), compute_tax_draft (23d:75) and compute_sst_return (23e:157) all take the same hashtextextended('belcort_close:'||cid) xact lock as record_year_end_close (25:382) — the defect in GAP2-1 is incomplete coverage, not a broken primitive.  ·  _evidence:_ `db/v2/23c-fns-adjustments.sql:142,234,398; db/v2/23d-fns-tax.sql:75; db/v2/23e-fns-sst.sql:157; db/v2/25-fns-ops.sql:382`
- The doctrine layer does NOT overclaim the FS pack: belcort/year-end-close/SKILL.md consistently calls the deliverable 'management accounts' — the overclaim is confined to the DB artifact's own MPERS/MFRS basis declaration (28-fns-reads.sql:775-780) and any downstream rendering of it.  ·  _evidence:_ `belcort/year-end-close/SKILL.md; db/v2/28-fns-reads.sql:775-780`
- The DB-side TAX-MY-001 remediation is genuinely present at the worksheet level: compute_sst_return produces separate sales and service blocks each with its own output/deduction/excess/payable figures, plus an explicit 'declared SEPARATELY' assumption for 'both' registrants, and SP5 pins the note.  ·  _evidence:_ `db/v2/23e-fns-sst.sql:660-661,751-775; db/v2/tests/sst_return_test.sql:259-260`
- The fn's period arithmetic is correct once given correct bounds: month-aligned due date = last day of the following month (s.26(1)) and DG-varied due date = end+30 (s.26(2)) are implemented and test-pinned, and overlap-supersede keeps exactly one live draft.  ·  _evidence:_ `db/v2/23e-fns-sst.sql:166-172,738-744; db/v2/tests/sst_return_test.sql:255-272`
- Wrong-rate SST drafts cannot auto-post unsupervised: doctrine forces every COMPUTED tax leg to needs_review with a human-confirm reason, and a document-stated SST amount always overrides computation — so the TAX-MY-003 default-8% defect produces reviewable drafts, not silent postings.  ·  _evidence:_ `belcort/coa-coding/SKILL.md:219-220,184-193; docs/reference/confidence-ladder.md:125-127`
- Today nothing can purge retained records regardless of the mis-anchored clock: table DELETE is revoked from the request plane on documents and export_artifacts, and the storage bucket defines no DELETE (or UPDATE) policy — reverse-not-delete is the operative protection while retain_until stays advisory.  ·  _evidence:_ `db/v2/10-tables-core.sql (revoke); db/v2/14-tables-ops.sql (revoke); db/v2/storage-setup.sql:43-59`
- Retry-after-unknown-outcome IS structurally covered for several mutation families via natural DB uniqueness: ingest_document idempotent on (firm_id, sha256); run_depreciation on (asset, period); run_recurring_journals on (template_id, occurrence_date); record_export_artifact write-once under an advisory lock; upload_document treats already-exists-at-exact-key as idempotent success.  ·  _evidence:_ `db/v2/10-tables-core.sql:98 unique(firm_id, sha256); db/v2/23c-fns-adjustments.sql:164-167; db/v2/25-fns-ops.sql:253-279; agent/src/tools/buildTools.ts:296-302`
- State-transition fns are duplication-safe by status gating: a duplicated approve_entry / reject_entry / finalize_coding retry fails loud on the status gate rather than double-posting — the idempotency gap (GAP4-1) is specific to insert-style fns, not the review verbs.  ·  _evidence:_ `db/v2/20-fns-journal.sql:190-191 (cannot_approve:<status>); db/v2/20-fns-journal.sql:148 (not_drafting:<status>)`
- Within a single browser tab the composer serializes turns (Send<->Stop state machine), so the two-tab exposure in GAP4-2 is cross-tab/server-side only.  ·  _evidence:_ `dashboard/lib/chat/useHermesChat.ts:24,40-41`
- The live Fly topology matches the repo's declared posture: one always-on machine in sin, checks passing, /health answering with the openai runtime — the audit's single-process durability findings describe the real deployment.  ·  _evidence:_ `flyctl status -a belcort-agent (re-run 2026-07-17): machine 080d16ef6461e8, v51, started, 1/1 checks; curl https://belcort-agent.fly.dev/health -> {"ok":true,"runtime":"openai"}; deploy/fly.toml:34-50`
- The belcort-dashboard-v2 Vercel plane has been quiet since Jul 14 (latest Production deploy 3d old at inspection time), consistent with the frozen-evidence assumption for the dashboard; the separate clara-by-belcort project is actively deploying (Production 2h/5h old).  ·  _evidence:_ `vercel ls belcort-dashboard-v2 + vercel ls clara-by-belcort (re-run 2026-07-17)`
- The dashboard DOES compose a real FY-close readiness checklist (statements balance, FY-scoped pending entries, open recons as a blocking item, uncoded docs, AR/AP/FA tie-outs, adjustments) and disables the Close button while blockers stand — the UI lane is materially better than the DB fn; the defect in GAP5-1 is that this checklist gates only a chat-intent button, degrades fail-open on read errors, and binds no other caller path.  ·  _evidence:_ `dashboard/lib/periodClose.ts:75-149; dashboard/components/books/PeriodClose.tsx`
- reverse_year_end_close does preserve the client_fy_close row itself (reversed_at/reversed_by stamp, reverse-not-delete) and both the original and mirror journal entries — the destroyed artifact is specifically the client_financial_position snapshot, and the missing artifact is the journal_entry_history receipts.  ·  _evidence:_ `db/v2/25-fns-ops.sql:823-825; db/v2/tests/reverse_year_end_close_test.sql:55-77`
- Answering a clarify WITHOUT attachments does not clobber a held batch — the replace at runtime.ts:313-315 is conditional on a non-empty req.documents, so a skipped sample-invoices step leaves the Q12 refs valid (GAP5-6 bites only when both steps carry attachments).  ·  _evidence:_ `agent/src/runtime/openai/runtime.ts:313-315`
- Assign-all mechanics are sound as far as they go: the bulk verb is a loop of singles through the same audited assign_document fn, partial failures stay in the lane and are named, and concurrent drains are reconciled — only the mixed-batch UX (GAP5-7) is the gap.  ·  _evidence:_ `dashboard/components/documents/FirmDocumentsTriage.tsx:123-153; dashboard/components/documents/__tests__/FirmDocumentsTriage.test.tsx`
- agent_select's FIRM-isolation boundary is sound as stated (SECURITY INVOKER + forced RLS, single-statement anchor, write-verb scan, 5s timeout) — GAP5-5 is about the missing CLIENT altitude within the firm, not about firm isolation; the separate SELECT-wrapped-DEFINER bypass remains the already-known SDT-001/SEC-001.  ·  _evidence:_ `db/v2/26-fns-session.sql:119-141`
- The tax draft's honesty layer itself (assumptions[] + confirmations_needed[] built by the DB, supersede-not-delete persistence, transparent-entity branch) works as documented and is rendered verbatim by the dashboard — GAP5-4 is that the layer is terminal display, not that it is wrong.  ·  _evidence:_ `db/v2/23d-fns-tax.sql:375-449; dashboard/components/tax/TaxComputation.tsx:139-143`
- VERIFIER-ADDED: belcort/client-onboarding/SKILL.md:219 instructs `ingest_document (kind='management_account', …)` for the Q12 carry-down files, but documents.kind CHECK (db/v2/10-tables-core.sql:79) permits only ('transaction_source','sample_invoice') — the documented onboarding procedure would raise a check violation at ingest (or the files get mislabeled as transaction sources). A doc-vs-code disagreement corroborating GAP2-2's 'knowledge artefacts have no legal home' and worth carrying into the Gate-1 packet.  ·  _evidence:_ `belcort/client-onboarding/SKILL.md:216-220; db/v2/10-tables-core.sql:79`

#### Unverified (workstream X) — could not be confirmed from frozen evidence; carried as open

- Prior-audit finding texts (DSE-003, EDGE-002, ACCT-009, SEC-007, VP-06, AR-01, SEC-004, EDGE-005, SDT-005, ACCT-002, SEC-003, ACCT-006/007/008/014, SEC-005/008, EDGE-003/004, OPS-001/005/006/007/008, AR-04/05/07/09/10, TAX-MY-001/003/004/005, DSE-009/010, SDT-009, VP-02/07) live under the forbidden tag pre-redo-rebuild-2026-07-16 and were NOT read by any lane; every 'confirms prior X' means the described defect class was independently re-verified from the frozen tree, not that the prior wording was checked.
- Live belcort-shared Supabase state: deployed fn bodies vs db/v2/*.sql, GoTrue access-token TTL (jwt_expiry — determines the exact GAP1-4 stale-authority window; Supabase default 1h), enable_signup, the access-token-hook wiring, backup/PITR tier (GAP1-6), actual retain_until/legal_hold row values, belcort_webhook_config rows and DB-webhook definitions (so end-to-end wake liveness), and whether any real rows exhibit cross-client provenance / orphaned anchors / stale snapshots — no live DB inspection was possible (supabase CLI absent; MCP requires interactive OAuth).
- The exact git ref of the running Fly image (belcort-agent:deployment-01KXF8WMQD997GXZ5Z0DXS0F4N) and of the current Vercel production builds — release timestamps and the CLAMD secrets strongly suggest post-baseline content (GAP4-6) but the image/deploy -> commit mapping is not determinable read-only. Fly runtime logs were not obtained (prior lane's flyctl logs attempt hung; not retried).
- OpenAI Agents SDK runtime semantics not exercised live: result.state.approve() behaviour for hypothetical future needsApproval tools (GAP0-2), and whether the model in practice reuses stale document_ref indices from earlier manifests (GAP5-6) — the mechanical overwrite and index re-resolution are code-verified; the behavioural half is exactly what the skill instructs ('HOLD them') but was not observed live. OpenAI-side trace retention/usage terms for ingested traces (GAP1-8) are external to the repo.
- The GAP2-1 close race and the GAP5-3 reversal-ordering corruption were proven from code + the author's own in-code admission, not reproduced with concurrent sessions against a rig (the frozen-repo brief bars rig mutation from this lane).
- Exact current statutory texts: ITA 1967 s.82/82A and CA2016 s.245 retention anchors (GAP3-4), and the precise 2025-07-01 SST expansion sector list/rates (GAP3-2) — taken from the prior-audit rulings as the work orders supplied them; not re-verified against gazette/RMCD primary sources. The repo's own docs already flag SST sector facts as requiring official-source re-verification.
- Whether the v1 Hermes-era mechanisms described in the owner signal docs (client_kb_materials table, weekly kb-curator cron, Path-B GL import) ever actually ran as documented (GAP2-2/3/4) — the v1 stack was purged; they are treated as authoritative statements of owner intent, which is what Gate 1 needs.
- Whether the dashboard renders the FS basis declaration verbatim to end users (GAP2-5 — the DB payload carrying the claim is verified at 28-fns-reads.sql:775-780) and whether the dashboard SST worksheet SURFACE presents the per-tax sales/service split adequately on screen (GAP3-3 concerns the exported filing artifact, which verifiably drops it).
- GitHub branch protection/required-check state vs CLAUDE.md's 2026-07-16 'protected: false' claim (context for GAP1-5) — not re-verified live in this pass.
- Whether any OTHER statement-line writer besides insert_bank_lines exists live (manually applied hotfix fns) that could interact with the GAP1-1/GAP1-2 constraints — the repo shows none; live-DB state uninspectable.
- clara-by-belcort Vercel project ownership/purpose (GAP4-7): Production deploys re-observed 2h/5h old on 2026-07-17 — almost certainly the redo-rebuild's new plane, but this must be confirmed by the orchestrator/owner rather than assumed.
- whether the live Fly app carries OPENAI_AGENTS_DISABLE_TRACING: RESOLVED by verifier — flyctl secrets list (2026-07-17) shows no such secret, so GAP1-8's exporter is armed in production (this item moves from unverified to verified-against).

#### Decision brief (workstream X)

> Adversarial verification of all six GAP-finder workstream blocks (42 findings) against the frozen tree at master ac0a684f, refute-by-default: 40 CONFIRMED, 2 ADJUSTED (GAP4-5: the runs Map has TTL eviction, not strictly 'unbounded' — but no size/concurrency cap and zero metering, so the finding and its high severity stand; GAP5-2: one citation line corrected, 13-tables-client.sql:98 not :86), 0 REFUTED. No severity changed: 8 critical (GAP0-1/0-2/0-3, GAP1-1/1-2/1-4/1-5/1-6, GAP2-1, GAP5-3 — 10 total critical), 25 high, 7 medium as drafted all held under the brief's rubric. Every load-bearing citation was re-read from the source files; the live-plane claims (CLAMD secrets, SUPABASE_JWT_SECRET/AZURE_DOCAI armed, single machine v51, /health ok, dashboard quiet since Jul 14, clara-by-belcort actively deploying) were independently re-executed read-only on 2026-07-17 and all reproduced, including git proof that the CLAMD-referencing commit 1e77e835 is NOT an ancestor of master. Verifier additions: (1) the access-token hook FAILS OPEN on exception (00-foundation.sql:274-276), returning inbound claims unchanged — a caveat on the GAP1-4 fine claim; (2) a fresh doc-vs-code contradiction — client-onboarding SKILL.md:219 instructs ingest_document kind='management_account' while the documents.kind CHECK permits only transaction_source|sample_invoice — corroborating GAP2-2; (3) OPENAI_AGENTS_DISABLE_TRACING confirmed ABSENT from live Fly secrets, upgrading GAP1-8's export-armed claim from inferred to observed; (4) CI runs its legacy SQL suite on postgres:16 while the product targets PG17 (extra corroboration for GAP1-5). The strongest cluster for the Gate-1 packet: structural provenance (GAP0-1), the absent human-authorization capability boundary (GAP0-2 + GAP0-5), the unserialized close family (GAP2-1 + GAP5-3), the unvalidated bank-match model (GAP1-1/1-2/1-3), claims-only authority with no revocation (GAP1-4), and misleading-green CI + no DR proof (GAP1-5/1-6).

---

