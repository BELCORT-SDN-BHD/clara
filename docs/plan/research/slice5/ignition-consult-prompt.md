# Debate: post-ingest ignition + client attribution for Clara Slice 5

You are consulted as an independent senior architect for a DEBATE. Challenge my position; argue the strongest case for each alternative; then give a decisive recommendation. You may read this repo read-only (docs/prd/PRD.md, docs/architecture/ARCHITECTURE.md §7, packages/db/migrations/0003_books_core.sql + 0004_governed_fns.sql, docs/audit/01-findings-report.md E-9/GAP3-6).

## The question
Clara (multi-tenant AI accounting OS for Malaysian firms) is building the document pipeline: upload → deterministic OCR (Azure DI, no LLM in the critical path) → persist-always into an unassigned lane → human assign/reassign. After a document persists and OCR completes, WHAT IGNITES AUTOMATICALLY? Specifically client attribution (which of the firm's clients does this invoice/receipt/statement belong to?) — and any agent-shaped follow-through.

## Fixed constraints (law)
- Client attribution is a STRUCTURAL DB gate: no book write without a ≥0.95-confidence client resolution; resolution methods currently legal in the DB: 'human' and 'rule' (deterministic). An agent/model-method resolution never self-authorizes.
- The old build was condemned (E-9) for model-only matching with fabricated confidence rendered as "Evidence". The falsifiable eval harness that would calibrate any model confidence (attribution precision/abstention) is a Phase-5 gate and DOES NOT EXIST YET.
- No autonomous LLM run ignites in Slice 4 (owner ruling, scoped to Slice 4); Slice 5 may change this deliberately.
- Wake authority is a per-wake DB allowlist; a background wake lane does not exist yet (only 'interactive'/'proactive').
- Books are protected regardless: draft/post re-validates resolution + provenance in-txn. The risk surface of a wrong SUGGESTION is human time + trust, not a wrong posting.
- The triage UI direction (already ruled): group unassigned docs by suggested client, exclude low-confidence outliers by default, confidence shown as a shaped band never a raw %.

## My provisional position (attack it)
Deterministic matcher only in Slice 5: exact-identifier hits (client bank account numbers, SSM/TIN, exact registered-name/alias matches in OCR text) create rule-method ≥0.95 resolutions surfaced as grouped suggestions; everything else lands plain-unassigned; NO model-based matching until the eval harness exists; no autonomous LLM run ignites.

## Alternatives to argue properly
1. Fully inert: no matcher at all; humans assign everything. (Cost: month-end batches fully manual; the group-by-suggested-client UX has nothing to feed it.)
2. Deterministic-only (my position).
3. LLM-suggested attribution behind human confirm: the model proposes (uncalibrated), UI clearly frames it as an unverified suggestion, human confirm is the only path to a resolution row. This is what the accounting-automation incumbents (Dext, Hubdoc, AutoEntry, QuickBooks/Xero receipt capture) and spend platforms (Ramp/Brex) broadly do — evaluate whether their pattern transfers, and whether shipping uncalibrated suggestions pre-eval-harness repeats E-9 or is fine because the human confirm + framing changes the epistemics.
4. Full agentic ignition: document events raise wakes; an agent run reads the OCR facts + context pack and proposes attribution + coding as HELD tasks a human approves.

## Consider
- What 2025-2026 AI-agent SaaS / agentic-OS products actually do post-ingest (suggestion queues, confidence-gated automation, human-in-the-loop ladders).
- The trust dynamics for professional accountants: a wrong suggestion wearing a confident UI erodes trust faster than no suggestion (E-9 lesson) — but a lane of 80 documents with zero grouping is its own failure.
- Staging: what ships in Slice 5 vs what the eval-harness gate (Phase-5) unlocks; whether the Slice-5 schema should already carry the fields a model-suggestion lane will need (so no reshape later).
- Cross-tenant safety: a suggestion must never leak another client's data into the wrong context.

## Deliverable
Verdict on my position (uphold / amend / replace), the strongest counter-argument you found, the recommended ignition design for Slice 5 (concrete: what runs, what it writes, what the human sees), and what is explicitly deferred behind the eval-harness gate.
