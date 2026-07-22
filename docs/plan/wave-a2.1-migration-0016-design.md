# Migration 0016 — interface pins (Wave A2.1)

**Status: PINNED 2026-07-22 (implements `wave-a2.1-contract.md` v1.0 / ADR-028).**
These pins bind the implementation lane and the contract-blind test lane; deviations
go back through the orchestrator, not into code. 0016 is DB-only — no runtime/UI code
rides the migration. House law: same-arity CoRs, ACL-preserving, `clara_fn_owner`
ownership, tail assertions, throwaway-PG17 validation before anything live, and the
0015 tail-assertion strings that pin `sst_output` sales-only are **consciously
superseded where §P4 changes wording** (re-asserted in 0016's tail).

## P1 — The SST watch data plane (contract §2)

**Tables (all RLS-per-firm like siblings, `clara` schema):**

- `sst_threshold_schedule(service_group text, threshold_cents bigint, effective_from date, effective_to date, source_note text)`
  — PK `(service_group, effective_from)`. Seed: `('G', 50000000, '2018-09-01', null, 'STA 2018 First Sch; RM500k — factsheet §1')`,
  `('I', 50000000, '2018-09-01', null, 'Group I; real-estate brokerage in scope from 2024-02-26 — factsheet §4')`.
  System-maintained (migration-shipped); **no firm-editable writer exists**.
- `client_turnover_accounts(id uuid pk, firm_id, client_id, account_code, classification text CHECK IN ('included','excluded','unknown_or_mixed'), service_group text NULL, reason text, evidence_note text, set_by text, effective_from date NOT NULL, effective_to date NULL, created_at)`
  — FK `(client_id, account_code)` → `coa_accounts`; UNIQUE `(client_id, account_code, effective_from)`.
  **Missing row ⇒ `unknown_or_mixed`** (evaluator-side rule, asserted in tests).
- `sst_future_attestations(id, firm_id, client_id, service_group, expected_cents bigint, horizon_start date, evidence_note text NOT NULL, reviewer text NOT NULL, as_of date NOT NULL, expires_at date NOT NULL, created_at)` — append-only (no UPDATE/DELETE grants).
- `compliance_watches(id, firm_id, client_id, service_group, watch_kind text CHECK IN ('sst_registration') DEFAULT 'sst_registration', state text CHECK IN ('monitored','early_warning','crossed','overdue','resolved'), acknowledged_by text, acknowledged_at timestamptz, snoozed_until timestamptz, next_rearm_cents bigint, next_rearm_at timestamptz, earliest_crossing_month date, confirmed_included_cents bigint, unknown_or_mixed_cents bigint, screening_proxy_cents bigint, window_start date, window_end date, coverage_complete boolean, future_method_status text CHECK IN ('not_assessed','attested_below','attested_above','expired'), application_due date, schedule_effective_from date, evaluated_at timestamptz, evaluated_through_event_seq bigint, resolved_conclusion text CHECK IN ('registration_recorded','not_liable_documented') NULL, resolved_evidence text, resolved_by text, resolved_at timestamptz, created_at, updated_at)`
  — **partial UNIQUE `(client_id, service_group, watch_kind) WHERE state <> 'resolved'`** (one open episode).
- `compliance_watch_events(id, watch_id fk, event_kind text CHECK IN ('created','tier_change','acknowledged','snoozed','re_armed','resolved','evaluation'), state_before text, state_after text, figures jsonb, actor text, rationale text, created_at)` — append-only.
- `compliance_eval_runs(id, started_at, completed_at, clients_examined int, clients_changed int, clients_failed int, through_event_seq bigint, schedule_note text, error_note text)` — append-only receipts; **a run older than 48h is itself a surfaced condition** (via `list_review_queue` summary, P6).

**Index (required, EXPLAIN-evidenced in the rig):**
`ix_je_client_approved_posting ON journal_entries(client_id, posting_date, id) WHERE status='approved'`.

**Functions:**

- `evaluate_sst_watch(p_client uuid, p_op_key text) RETURNS jsonb` — SECURITY DEFINER,
  **GRANT clara_runtime ONLY** (never the agent role; not in any wake allowlist).
  Per service_group with any activity: calendar-month windows (month + 11 preceding),
  `sum(credit_cents - debit_cents)` over approved entries × the classification
  (tri-state; opening-balance entries excluded from observed turnover → coverage flag;
  future-dated excluded; reversal mirrors included; `is_year_end` excluded ONLY when the
  entry carries the closing-transfer marker — P7); **recomputed at every month-end since
  coverage start → earliest crossing**; boundary is strict **`>`** (RM 500,000.00 = NOT
  crossed); tier ladder monitored → early_warning (≥80% of threshold) → crossed →
  overdue (past `application_due` = last day of crossing-month + 1, factsheet §2);
  re-arm per stored `next_rearm_*` (crossing, +10pp of threshold, earlier backdated
  crossing, due-date worsening, snooze expiry, attestation expiry); transitions write
  `compliance_watch_events` + `_append_event` type `compliance.watch_transition` (P5);
  **exception-isolated per client** — never raises to the caller's transaction.
- `evaluate_sst_watches_all(p_op_key text) RETURNS jsonb` — the daily-sweep wrapper;
  writes ONE `compliance_eval_runs` receipt; per-client failures counted, not raised.
- Human-lane writers (bookkeeper+ unless noted; op_key idiom; audited via existing
  audit_log pattern): `set_turnover_classification(p_client, p_account_code, p_classification, p_service_group, p_reason, p_evidence, p_effective_from, p_op_key)`
  — **watch-lowering moves (→'excluded', or included→unknown) require admin+** (WA21-R5);
  `record_future_attestation(p_client, p_service_group, p_expected_cents, p_horizon_start, p_evidence, p_expires_at, p_op_key)` (admin+);
  `ack_compliance_watch(p_watch, p_rationale, p_op_key)`;
  `snooze_compliance_watch(p_watch, p_until, p_rationale, p_op_key)` — `p_until` ≤ 60 days;
  `resolve_compliance_watch(p_watch, p_conclusion, p_evidence, p_op_key)` — typed
  conclusion mandatory. **The agent role: zero EXECUTE on all of these.**
- **`_approve_entry_core` gains NO watch logic** (Codex refuse-list): the watch rides the
  `entry.approved` spine event (existing emission — no new event needed for triggering).

## P2 — Credit-side sightings + the sales lift (contract §3)

- `rule_sightings` + `side text CHECK IN ('debit','credit') NOT NULL DEFAULT 'debit'`
  (backfill 'debit'; drop DEFAULT after backfill); uniqueness widened to
  `(client_id, counterparty_id, account_code, entry_id, side)`. **Same migration** as the
  `_approve_entry_core` CoR that inserts credit-leg sightings (income-class credit legs;
  H2 carve-out `checked_via_rule_id IS NULL` + reversal guard verbatim).
- The 3-sighting `vendor_account` auto-proposal stays `side='debit'`-scoped.
- `coding_rules` + `evidence_class text CHECK IN ('structured','ocr_sales') NULL` —
  NOT NULL for `rule_type='autopost'` with `direction='sales'` (enforced in CHECK:
  sales autopost rows must carry an evidence_class; purchase rows stay NULL).
- `propose_autopost_rule` / `sign_autopost_rule` CoRs: `direction='sales'` admitted;
  sighting floor queries direction-aware (`side='credit'` pool for sales); the
  `sales_autopost_deferred` CLR27 raises removed; **OCR admission** (`evidence_class='ocr_sales'`)
  additionally requires ≥6 qualifying human-approved credit sightings across ≥6 distinct
  `document_id`s spanning ≥60 days (overrides + rule-posted outputs excluded) + the
  client's counterparty resolved (no birth in this lane, ever). Bounds: same as
  structured (WA21-R10).
- `execute_rule_post` CoR — the OCR re-derivation adds, in the sales branch when
  `evidence_class='ocr_sales'`: (a) polarity evidence = `documents.document_kind IN
  ('invoice')` set by the classifier/human (P3) — skip `polarity_unverified` otherwise;
  (b) direction evidence = supplier-side TIN/BRN + name/alias match to the client AND
  buyer must NOT resolve to the client — skip `direction_unproven`; (c) corroboration =
  total + invoice number + date + explicit net + explicit tax (zero allowed, missing not)
  + exact `net+tax+rounding=gross` + one additional independent numeric anchor — skip
  `anchor_missing`; (d) existing resolved customer — skip `customer_unresolved`;
  (e) `sales_credit_note` drafts skip `cn_not_autopostable` (named, replacing the
  incidental control-shape skip). Repeated (≥3 in 30 days) polarity/direction skips on
  one rule flip it to `status='suspended_pending_resignature'` (new status CHECK value)
  + a notification.

## P3 — The classifier gate (contract §5)

- `document_processing_tasks` lane CHECK + `'classify'`; lane↔engine CHECK per the 0015
  pattern with engine prefix `clara-classify-%`; extraction row `engine_kind='doc_classify'`
  (outside the 0015 AB-3 exemption set).
- `classify_document(p_document uuid, p_kind text, p_confidence numeric, p_engine_id text, p_op_key text) RETURNS jsonb`
  — DEFINER, **GRANT clara_runtime only**; kind ∈ the existing 18-value CHECK; sets
  `documents.document_kind` + audit + `_append_event('document.classified')`; a HUMAN
  override variant `set_document_kind(p_document, p_kind, p_reason, p_op_key)`
  (bookkeeper+) for corrections; low-confidence (< 0.8) classification leaves kind NULL
  and opens the ADR-023 review-question lane instead.
- `_enqueue_invoice_facts_core` CoR: consent-evidence branch FIRST verbatim (0014 tail
  assert); then kind gate — `invoice|credit_note|debit_note` + pdf/image → `invoice_facts`;
  xml → `local_facts`; other kinds → receipt `skipped_kind`; **NULL kind → enqueue
  `classify` first** (attempt-cap/failed-task pattern reused; facts enqueue re-fires on
  `document.classified`).
- `persist_invoice_facts` CoR: `document_kind` stamped **only-if-null**.

## P4 — The purchase visibility split (contract §4)

- `coa_accounts` `special_acc_type` CHECK + `'sst_purchase_cost'` (expense-typed account).
- `_assert_supplier_bill_shape` CoR: the outright sst refusal becomes — ≤1
  `sst_purchase_cost` DEBIT leg, tied exactly to stated `invoice.tax_total` (from
  `_invoice_fact_state`), only when tax facts exist; the expense=gross tie survives
  (the leg is expense-typed); `sst_output` on a purchase still refuses (unchanged).
- `execute_rule_post`: an `sst_purchase_cost` leg is **not sanctioned** — a purchase
  draft carrying it skips `purchase_sst_not_autopostable` (named). Human lanes only
  (WA21-R1).
- `packages/db/scripts/onboard-*.mjs` `SPECIAL_TYPES` fixed to the full live set
  (`rounding`,`sst_output`,`sst_purchase_cost` + existing) — the ADR-027 #44 class.

## P5 — Events + read surfaces

- `event_types` registry + `compliance.watch_transition`, `document.classified`.
- `get_context_pack` CoR → **schema_version 3**: adds `sst_registration_watch` exactly
  per the contract §2.3 JSON shape (status, three labeled figures, window, earliest
  crossing month, future_method_status, coverage/verification, evaluated_at,
  `permitted_use`). Version-bump tested.
- `get_draft_review` CoR: **human lane** returns a slim settled payload
  `{entry:{id,status,approved_at,withdrawn_at,coding_kind}}` when `status<>'draft'`;
  the wake/agent lane keeps returning NULL for settled (behavior-frozen).
- `list_review_queue` CoR: `row_kind='compliance_watch'` rows (open watches, tier in the
  payload) + a top-level `compliance` summary object (per-client figures + a
  `stale_evaluator` flag when the newest `compliance_eval_runs` is >48h old); the
  integer `counts` fields gain only integer counts. Queue envelope gains `coding_kind`
  on entry rows (§6.2 vocabulary needs it).

## P6 — What 0016 must NOT do (tail-asserted where assertable)

No `open_questions` writes from any watch path (grep-assert: `compliance` fns contain no
`open_questions` insert) · no watch logic inside `_approve_entry_core` · no new EXECUTE
for the agent role anywhere (re-run the 0015-style role-grant assertions) · no autopost
sanction for `sst_purchase_cost` · CN autopost impossible (named skip) · `sst_output`
remains sales-only.

## P7 — Closing-transfer marker (small, load-bearing)

`journal_entries` + `closing_transfer boolean NOT NULL DEFAULT false` settable only via
the existing revise/draft human path (flags-style); the evaluator excludes
`is_year_end AND closing_transfer` rows only — a year-end revenue *correction*
(is_year_end, not closing_transfer) still counts. Backfill: existing `is_year_end`
rows default false + a queue note for the owner to mark RPR's closing entries during
the eval ceremony.

## Rig battery map (contract §9 → test lanes, contract-blind)

Boundary (500,000.00/.01) · earliest-crossing incl. backdating · re-arm ladder (all six
triggers) · tri-state defaults (missing=unknown) · coverage/opening-balance · evaluator
failure isolation (a poisoned client never blocks the sweep or an approval) · RLS
isolation · per-group separation (G vs I never aggregate) · sighting side + floors ·
each OCR skip reason fail-pre/pass-post · CN named skip · purchase tie ·
classifier gate (payroll_summary never reaches invoice_facts; NULL-kind → classify →
facts) · only-if-null stamping · settled `get_draft_review` per lane · context-pack v3
shape · queue row_kind + stale-evaluator flag · closing-transfer exclusion semantics ·
**`reconcile_autopost_rules` expiry/nudge proof** (the DB-side half of the contract §7
/ PR #52 wiring: a live rule past `expires_at` hard-expires + notifies; a ¾-term
no-recent-post rule nudges — this test lands HERE, not in the runtime lane, per the
PR #52 spec review).

Test-lane caution (the rig truncate-deadlock lesson): the PR #52 leader wiring adds a
once-per-boot writer on `coding_rules`/`notifications` in any shared world-e2e DB —
TRUNCATE-based tests on those tables must use the truncateGuardError pattern.
