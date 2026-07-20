# Wave A — migration 0011 design companion (`0011_daily_loop.sql`)

*Status: v1.0 DRAFT (pre-review) · 2026-07-21 · companion to `wave-a-daily-loop-contract.md`.
One migration, never split (house rule). Every recreated function follows the C-1
signature-change law where arity changes (DROP → CREATE → REVOKE ALL FROM PUBLIC → re-grant
exactly the lanes, same migration, tail asserts); body-only changes use CREATE OR REPLACE at
identical arity (ACL preserved). All new required array/jsonb inputs refuse identically across
all four SQL-null variants (AB-7). All text[] appends use `array_append` (AB-20).*

## §1 AB-3 pin (FIRST statement block)

`clara.record_rule_resolution` (0007): pin the extraction read to
`engine_kind in ('ocr','structured_parse')` — body-only change, arity unchanged, CREATE OR
REPLACE. Tail assert: a planted `invoice_facts` extraction row carrying a colliding
`field_path` is NOT visible to the fn's read (rig-proved, not reasoned). The runtime matcher
twin is already pinned; after 0011 the DB fn and the twin agree.

## §2 Counterparty aliases + governed merge

- **`clara.counterparty_aliases`**: (id, firm_id, client_id, counterparty_id [composite
  tenant FK to counterparties(id, firm_id, client_id)], alias_normalized [same normalizer as
  `name_normalized`], alias_display, origin ∈ {former_name, trade_name, human}, created_by,
  created_at, retired_at). Unique (client_id, alias_normalized) among unretired. Aliases are
  NAME-LANE CANDIDATE inputs only: `_resolve_counterparty` extends its name lane to consult
  unretired aliases, with the SAME registration-dominant law — an alias hit against a
  differing-registration vendor is the existing conflict/ambiguity refusal, never a merge.
  Alias hits surface in `get_draft_review.current_outcome` as `alias_match` (distinct token,
  card renders "matched via former name …").
- **`clara.merge_counterparties(p_client, p_survivor, p_merged, p_reason, p_op_key)`** —
  human lane (bookkeeper+), audited: re-keys children (journal_lines.counterparty_id,
  coding_rules, aliases, sightings) to the survivor in ONE transaction, writes a merge event
  + receipt, retires the merged row (no delete), auto-creates a former-name alias from the
  merged vendor's name. Refuses: cross-client; survivor==merged; merged has an OPEN draft
  citing it (CLR23 — resolve the draft first); registration conflict between the two unless
  `p_reason` is the governed conflict override (which flags HIGH-STAKES on the act's receipt).
  `_resolve_counterparty`'s fingerprint law is unchanged — a merge between propose and
  approve rotates nothing by itself, but approve's re-resolution then diverges → the existing
  CLR23 refusal + revise path (this is correct and stays; rig case required).
- **`_resolve_counterparty`** arity changes (alias input surface) → C-1 DROP/CREATE/REVOKE/
  re-grant.

## §3 The lane function

**`clara.coding_lane(p_client uuid, p_filing uuid) returns (lane text, reasons text[])`** —
STABLE read fn, security INVOKER, RLS-scoped; granted `clara_authenticated`,
`clara_agent_ro`. Lane ∈ {ready, needs_review, needs_you}; `reasons` carries the qualitative
tokens (new_vendor, model_read_amount, high_stakes, near_duplicate, amount_exception,
open_question, no_consent, non_myr, ambiguous_vendor, facts_failed…) that the UI renders as
copy — tokens, not scores. Reads: filing/draft state, `_resolve_counterparty` preview,
`_invoice_fact_state`, near-dup (inline invoker computation, 0009 precedent), `is_high_stakes`
on the would-be amount, `open_questions` in scope, `client_egress_consents`, live
`coding_rules`. A batch variant `clara.list_coding_lanes(p_client)` powers the queue read
without N calls. Determinism note: the fn is a PURE read — the sweep re-evaluates it at
execution time (admission recheck) so a lane computed at event time never authorizes a draft
later (freshness law; no TOCTOU).

## §4 The autodraft task lane

- `agent_tasks.kind` CHECK widens to include `'autodraft'` (CHECK-constraint replacement:
  drop + re-add constraint, additive).
- `_draft_entry_core` coding-eligibility branch accepts kind ∈ {chat_turn, autodraft} (still
  agent-lane only; still ONE live task per session — autodraft tasks get their own synthetic
  session per bill, AB-21). Arity unchanged if the branch is internal; if a parameter is
  added, C-1 applies. `uq_coding_attempts_task` unique(task_id) stands — one bill per task
  BY CONSTRUCTION.
- Admission: the sweep consumer inserts held tasks via the existing drain/held-task
  projection with wake kind on the allowlist for exactly: the read fns it needs +
  `wake_draft_entry` (NO widening of any other wake kind's allowlist). op_key
  `autodraft:<filing_id>`; attempt suffix only on operator-forced retry (`:retry-N`, audited).

## §5 Sweep receipts, acks, budget

- **`clara.sweep_runs`**: (id, firm_id, window_started_at, window_ended_at, drafted_count,
  skipped_count, refused_count, token_spend, consumer_checkpoint_seq). Per-filing outcomes in
  **`clara.sweep_run_items`** (run_id, filing_id, outcome ∈ {drafted, skipped_lane,
  refused_budget, refused_attempts, noop_existing}, entry_id nullable, refusal_token).
  Written by the runtime lane in the drafting transaction's settle path.
- **`clara.acknowledge_sweep_run(p_run, p_op_key)`** — human lane, ROLE FLOOR bookkeeper+
  enforced in-fn against live membership; the actor identity must be a human principal (an
  agent/wake identity refuses — the old build's self-satisfiable ack is killed by
  construction). Writes `sweep_run_acks` (run_id, actor, at). Idempotent per (run, actor).
- **`clara.firm_limits.sweep_budget_share`** numeric default 0.60 — the sweep admission
  check refuses (CLR29 refused_budget) when metered firm daily spend ≥ share × daily limit.
  Operator lever, same table as the existing metering.

## §6 The queue read

**`clara.list_review_queue(p_scope jsonb, p_cursor jsonb)`** — INVOKER, RLS + live-membership
scoped, keyset-paginated union: open drafts / uncoded filings (+lane via §3) / open
questions / open coding tasks, each row a typed identifier tuple + display accessories
(counts come from a sibling `review_queue_counts` fn — DB counts). Granted
`clara_authenticated` only (the dashboard's human lane; the agent has no queue business).
No new table — it fronts existing state (the 0009 "no parallel queue table" law).

## §7 Coding rules

- **`clara.coding_rules`**: (id, firm_id, client_id, rule_type CHECK ('vendor_account'),
  counterparty_id composite-FK, account_id FK [must exist + postable — refuse retired/
  non-postable at signing AND re-verify at draft-time application], status CHECK
  (proposed|live|declined|retired), pinned bool, origin CHECK (proposed|authored),
  content_hash, created_by/at, signed_by/at, retired_by/at, retire_reason). Partial unique:
  one LIVE rule per (client_id, counterparty_id, rule_type).
- **`clara.rule_sightings`**: per-sighting provenance rows (rule proposal evidence): (client,
  counterparty, account, entry_id, document_id, sighted_at) unique per entry — the ≥3
  congruent threshold is computed over DISTINCT approved entries (A-9 kill: no tallies).
  Written by a spine consumer hook on entry.approved events (or in approve receipts path —
  build lane decides; either way DB-idempotent).
- Writers (human lane, bookkeeper+): `propose_coding_rule` (also invoked by the system path
  that materializes the ≥3-sighting proposal + its `open_questions` row),
  `sign_coding_rule`, `decline_coding_rule`, `retire_coding_rule` (pinned → requires the
  conflict-question path token; CLR27 otherwise). Rule application at draft time: the runtime
  passes nothing — `_draft_entry_core` snapshots (rule_id, content_hash) into the coding
  attempt metadata when the proposal cites a rule; the card's "per your rule" chip hydrates
  from the snapshot (C-14 immutable fired-state).

## §8 Open questions

- **`clara.open_questions`**: (id, firm_id, client_id, scope_kind CHECK
  (document|vendor|client), document_id nullable, counterparty_id nullable [exactly the
  scope-matching id NON-NULL — CHECK], origin CHECK (clarify_promotion|rule_proposal|
  rule_conflict|sweep_refusal|manual), question_text, status CHECK (open|resolved|dismissed),
  opened_by/at, resolved_by/at, resolution_text, spawned_rule_id nullable). Composite tenant
  FKs; partial index on open per client.
- Writers: `open_question` (human + runtime lanes — the sweep/turn may ask; opening is not a
  gate change), `resolve_open_question` / `dismiss_open_question` (human lane, bookkeeper+).
- **approve_entry** gains the CLR26 check: an OPEN question whose scope covers the entry
  (its document, its resolved/proposed counterparty, or the client) refuses approval with the
  question id in DETAIL. Body change; arity unchanged → OR REPLACE. The lane fn (§3) reads
  the same predicate for READY demotion — ONE shared predicate fn `_open_question_blocks`
  so the two sites cannot drift (the guard.mjs propagation lesson).
- Clarify promotion: `promote_clarify_to_question(p_interruption, …)` — one-way, audited,
  carries the interruption's text + document scope.

## §9 Diff reads

- **`clara.get_entry_diff(p_entry, p_client)`** — revision walk from persisted history
  (receipts/events + line snapshots), per step: actor, at, reason, per-leg before/after
  (account, cents, counterparty). INVOKER, RLS; granted authenticated + agent_ro.
- **`clara.get_doc_entry_diff(p_entry, p_client)`** — per corroborated field: document-side
  value + region locator vs entry-side value, delta cents computed in SQL, plus the honest
  `no captured region` marker rows for uncorroborated fields (WA-R8). Fronts
  `_invoice_fact_state` + `entry_evidence`; no new state.

## §10 Egress registry

- **`clara.client_egress_consents`**: (id, firm_id, client_id, scope_note, evidence_document_id
  FK [the signed consent/engagement doc — a real ingested document, provenance law],
  granted_by/at, revoked_by/at, revoke_reason). Partial unique: one live row per client.
  Writers `grant_client_egress` / `revoke_client_egress` (human lane, OWNER role floor —
  consent is a firm-owner act, not bookkeeper).
- The egress claim gate (`claim_document_processing_task`'s held_egress logic + the intake
  path) rewires: egress requires (global kill-switch != 0) AND a live consent row for the
  document's client. `CLARA_DOC_EGRESS_APPROVED` semantics change is runtime-config only —
  =0 halts all (unchanged), =1 now DELEGATES to rows instead of granting firm-wide. Deploy
  ceremony: seed rows for currently-consented clients (RPR + owner-confirmed set) citing
  their consent evidence docs BEFORE the image carrying the new gate deploys (ordering note:
  migration first, rows second, image third — the gate must fail CLOSED between). Rig case:
  revocation mid-pipeline holds queued egress and demotes lanes.

## §11 Facts-capture fix

`captured_invoice_id` lossiness (null 14/17): root-cause in the invoiceFacts persist path —
the InvoiceId field mapping predates the field_path normalization. Fix in
`persist_invoice_facts`'s mapper (or the workflow's extraction shaping — build lane
root-causes; the DB refuses nothing new here). Re-measure on the eval corpus in the build
gates; until measured ≥16/17, no lane predicate references it (contract WA-L3).

## §12 Events + taxonomy (additive v3)

New event types: `sweep.run_completed`, `kb_rule.proposed`, `kb_rule.signed`,
`kb_rule.retired`, `open_question.opened`, `open_question.resolved`, `counterparty.merged`,
`egress.consent_granted`, `egress.consent_revoked`. Taxonomy v3 version rows: all default
`ignore` for the router EXCEPT `kb_rule.proposed` + `open_question.opened` → `notification`
(queue rows ride the read fn; the notification decision feeds later inbox work without
waking anything). The autodraft consumer subscribes DIRECTLY to
`document.invoice_facts_completed/failed` (no taxonomy dependency — matcher precedent).
Repoint via a new `taxonomy_versions` row + `taxonomy_active` update in-migration (the 0009
v2 pattern).

## §13 Grants delta (complete enumeration — nothing else moves)

| Object | clara_authenticated | clara_agent_ro | clara_wake_interactive | clara_runtime |
|---|---|---|---|---|
| coding_lane / list_coding_lanes | EXECUTE | EXECUTE | — | — |
| list_review_queue / review_queue_counts | EXECUTE | — | — | — |
| merge_counterparties | EXECUTE | — | — | — |
| acknowledge_sweep_run | EXECUTE | — | — | — |
| propose/sign/decline/retire_coding_rule | EXECUTE | — | — | — |
| open_question (writer) | EXECUTE | — | via allowlist | — |
| resolve/dismiss_open_question | EXECUTE | — | — | — |
| promote_clarify_to_question | EXECUTE | — | — | — |
| get_entry_diff / get_doc_entry_diff | EXECUTE | EXECUTE | — | — |
| grant/revoke_client_egress | EXECUTE (owner-floor in-fn) | — | — | — |
| sweep_runs/_items/_acks writers | — | — | — | EXECUTE (fn-wrapped) |
| All new TABLES | zero direct DML/SELECT grants — fn-fronted only (house law) | | | |

Tail asserts (0009 pattern): one overload per public writer; PUBLIC-zero-execute across every
new fn; the §13 matrix asserted row-by-row; the AB-3 pin probe (§1).

## §14 Concurrency + lock order

- Sweep draft vs chat draft on one filing: both funnel through `_draft_entry_core` → the
  one-open-draft partial unique serializes; loser maps to noop (sweep) / CLR21 double_coded
  (chat, existing UX). No new locks.
- Facts rotation vs approve: unchanged 0009 serialization (filing FOR UPDATE vs FOR SHARE);
  the lane fn takes NO locks (pure read).
- merge_counterparties lock order: counterparties (survivor, merged — deterministic id
  order) → children. Rig forced-schedule case vs a concurrent draft's resolve.
- approve CLR26 check reads open_questions AFTER taking its existing filing lock —
  no new deadlock edge (rig-proved).
- The consumer holds one connection, one txn per event (matcher contract); autodraft
  execution happens in the WORKFLOW, never in the consumer txn.

## §15 Second-run ledger (the DR-drill lens — every item exercised twice)

Consumer restart mid-backlog (checkpoint resume, no double-draft); migration 0011 re-apply
onto itself (idempotent guards); `acknowledge_sweep_run` twice (idempotent); merge run twice
(second refuses cleanly — merged already retired); consent grant→revoke→grant cycle; taxonomy
v3 repoint re-run; the deploy ceremony order (§10) executed on the rig end-to-end before any
live window.
