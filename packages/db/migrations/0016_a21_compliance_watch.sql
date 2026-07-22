-- 0016_a21_compliance_watch.sql — Wave A2.1: the SST registration-threshold
-- structural watch (the headline), credit-side sightings + the sales-direction
-- autopost lift under the OCR compensating-control envelope, the doc-type
-- classifier gating the facts engines, the purchase-side SST visibility split,
-- and the read-surface CoRs (context pack v3, settled draft review, queue rows).
-- Companion: docs/plan/wave-a2.1-migration-0016-design.md (pins P1..P7);
-- contract: docs/plan/wave-a2.1-contract.md v1.0 (ADR-028, rulings WA21-R1..R12).
--
-- House CoR law throughout (0015 pattern): same-arity `create or replace` under
-- `set role clara_fn_owner`, ACLs preserved (Postgres keeps the ACL across a
-- same-arity create-or-replace), tail `do $$` assertions. NEVER change arity —
-- new inputs ride existing jsonb params. One migration = one transaction (the
-- runner supplies it). THROWAWAY-VALIDATED ONLY — never hand-applied to a live
-- project. Validate on a scratch PG17 before anything live.
--
-- Section map (pin P1..P7):
--   A   BARE DDL (existing-table ALTERs run as the migration/superuser role —
--       the 0014/0015 idiom): closing_transfer (P7) · sightings side (P2) ·
--       coding_rules evidence_class/suspension (P2) · coa sst_purchase_cost (P4)
--       · classify lane + lane<->engine + doc_classify (P3) · open_questions
--       origin += classification (P3) · the P1 approved-posting index · the P7
--       backfill queue note.
--   B   Under clara_fn_owner: the P1 watch data plane (6 tables + seeds +
--       triggers + RLS) · the P5 event pair · the P1 evaluators + human-lane
--       writers · the P2 CoRs (_approve_entry_core, _tf_coding_rule_update,
--       propose/sign_autopost_rule, execute_rule_post) · the P3 classify fns +
--       facts-gate CoRs · the P4 shape-floor CoR · the P7 draft CoR · the P5
--       read-surface CoRs.
--   C   Grants (evaluator/classify -> clara_runtime ONLY; human writers ->
--       clara_authenticated; the agent role gains ZERO EXECUTE anywhere).
--   D   Tail assertions (P6 incl. the must-nots) + in-migration smoke probes.
--
-- HARD MUST-NOTS carried structurally (pin P6 / contract §2.4, tail-asserted):
-- the watch NEVER blocks an approval or posts money; NO watch logic inside
-- _approve_entry_core (the watch rides the entry.approved spine event); NO
-- compliance fn ever writes open_questions; NO autopost sanction for
-- sst_purchase_cost; CN autopost impossible (named skip); sst_output stays
-- sales-only; the agent role gains zero EXECUTE anywhere in this wave.

-- =====================================================================
-- A — BARE DDL (the migration/superuser role; the 0014/0015 existing-table
-- ALTER idiom). New tables are created UNDER clara_fn_owner in section B.
-- =====================================================================

-- (A1/P7) journal_entries.closing_transfer — the typed closing-transfer marker.
-- Settable only at draft via the existing p_flags path (flags-style, like
-- is_year_end); the immutability trigger's allowsets never admit it after birth.
-- The SST evaluator excludes ONLY `is_year_end AND closing_transfer` rows — a
-- year-end revenue CORRECTION (is_year_end, not closing_transfer) still counts.
alter table clara.journal_entries
  add column closing_transfer boolean not null default false;

-- (A2/P2) rule_sightings gains `side` ('debit'|'credit'); backfill 'debit' via
-- the column default, then DROP the default (pin P2) so every future insert
-- states its side explicitly. The uniqueness key widens to include side under
-- the SAME constraint name (the 0011 approve core's ON CONFLICT names it).
alter table clara.rule_sightings
  add column side text not null default 'debit'
  check (side in ('debit','credit'));
alter table clara.rule_sightings alter column side drop default;
alter table clara.rule_sightings drop constraint uq_rule_sightings_mapping;
alter table clara.rule_sightings add constraint uq_rule_sightings_mapping
  unique (client_id,counterparty_id,account_code,entry_id,side);

-- (A3/P2) coding_rules: evidence_class (the §3.3 control-1 distinct OCR class),
-- and the `suspended_pending_resignature` status (§3.3 control 9). The status
-- enum CHECK is system-named inline (0011) — drop by DEFINITION, excluding the
-- named siblings that also mention statuses.
alter table clara.coding_rules
  add column evidence_class text,
  add constraint ck_coding_rules_evidence_class check (
    (evidence_class is null or evidence_class in ('structured','ocr_sales'))
    -- `is not null` (never `in (...)`) — an IN over a NULL evidence_class yields
    -- NULL and a NULL CHECK passes, which would let a classless sales autopost
    -- row through the raw-insert lane (integration finding; the vocabulary is
    -- already pinned by the first conjunct).
    and (rule_type<>'autopost' or direction is distinct from 'sales'
         or evidence_class is not null)
    and (rule_type<>'autopost' or direction is distinct from 'purchase'
         or evidence_class is null)
    and (rule_type<>'vendor_account' or evidence_class is null));
do $$
declare v_con text;
begin
  select con.conname into v_con from pg_constraint con
  join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='coding_rules' and con.contype='c'
    and con.conname not in ('ck_coding_rules_terminal','ck_coding_rules_tier',
      'coding_rules_rule_type_check','ck_coding_rules_evidence_class')
    and pg_get_constraintdef(con.oid) ilike '%status%'
    and pg_get_constraintdef(con.oid) ilike '%proposed%';
  if v_con is null then
    raise exception '0016: coding_rules status check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.coding_rules drop constraint %I',v_con);
end $$;
alter table clara.coding_rules add constraint coding_rules_status_check_0016 check (
  status in ('proposed','live','declined','retired','suspended_pending_resignature'));
-- terminal-shape check gains the suspended branch: a suspended rule WAS live
-- (signed fields present), is not retired/declined, and frees the one-live
-- partial index slot so an admin can sign a successor.
alter table clara.coding_rules drop constraint ck_coding_rules_terminal;
alter table clara.coding_rules add constraint ck_coding_rules_terminal check (
  (status='proposed' and signed_by is null and signed_at is null
    and retired_at is null and declined_at is null)
  or (status='live' and signed_by is not null and signed_at is not null
    and retired_at is null and declined_at is null)
  or (status='suspended_pending_resignature' and signed_by is not null
    and signed_at is not null and retired_at is null and declined_at is null)
  or (status='declined' and declined_by is not null and declined_at is not null
    and nullif(btrim(decline_reason),'') is not null and retired_at is null)
  or (status='retired' and retired_at is not null
    and nullif(btrim(retire_reason),'') is not null));

-- (A4/P4) coa_accounts.special_acc_type += 'sst_purchase_cost' (WA21-R1: the
-- purchase SST VISIBILITY split — an expense-typed SST-portion-of-cost marker,
-- never a recoverable asset; Malaysian SST has no input-tax credit). The
-- expense typing is CHECK-enforced so the supplier-bill expense=gross tie
-- survives structurally. uq_coa_special is per (client, VALUE) — it already
-- admits one sst_purchase_cost per client; no index change.
alter table clara.coa_accounts drop constraint coa_accounts_special_acc_type_check;
alter table clara.coa_accounts add constraint coa_accounts_special_acc_type_check check (
  special_acc_type is null or special_acc_type in ('rounding','sst_output','sst_purchase_cost'));
alter table clara.coa_accounts add constraint ck_coa_sst_purchase_cost_expense check (
  special_acc_type is distinct from 'sst_purchase_cost' or account_type='expense');

-- (A5/P3) document_processing_tasks.lane += 'classify' + the lane<->engine
-- binding widens per the 0015 pattern: the classify lane binds to the
-- clara-classify-% engine prefix (a local, non-egressing lane — the classifier
-- runs over already-extracted layout text through the EXISTING chat-model
-- egress; WA21-R7: no new egress class). Pre-assert no existing row violates.
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_0015;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_0016 check (
  lane in ('ocr','structured_parse','none','invoice_facts','local_facts','classify'));
do $$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.document_processing_tasks t
  where not (
    t.engine_id like 'clara-fixture:%'
    or (t.lane in ('ocr','invoice_facts') and t.engine_id like 'azure-%')
    or (t.lane in ('structured_parse','local_facts','none') and t.engine_id like 'clara-%')
    or (t.lane='classify' and t.engine_id like 'clara-classify-%'));
  if v_bad<>0 then
    raise exception '0016 lane<->engine pre-assert failed: % existing task row(s) violate',v_bad
      using errcode='CLR10';
  end if;
end $$;
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_engine_0015;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_0016 check (
  engine_id like 'clara-fixture:%'
  or (lane in ('ocr','invoice_facts') and engine_id like 'azure-%')
  or (lane in ('structured_parse','local_facts','none') and engine_id like 'clara-%')
  or (lane='classify' and engine_id like 'clara-classify-%'));
-- (adjudication #11): the kind-gate 'skipped_kind' receipt lives on the
-- document's document_processing_tasks trail — a terminal failed task with a
-- typed error_code, never claimed (workflow NULL), like the budget/attempt_cap
-- refusal rows.
alter table clara.document_processing_tasks drop constraint ck_processing_task_error_code_0009;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_0016 check (
  error_code is null or error_code in
    ('engine_error','timeout','engine_lost','storage_error','corrupt','encrypted',
     'bad_type','limit','budget','attempt_cap','internal','skipped_kind'));
alter table clara.document_processing_tasks drop constraint ck_processing_task_binding_0009;
alter table clara.document_processing_tasks add constraint ck_processing_task_binding_0016 check (
  (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
  or (status in ('running','done') and workflow_run_id is not null and started_at is not null)
  or (status = 'failed' and (
    (workflow_run_id is not null and started_at is not null)
    or (workflow_run_id is null and started_at is null
        and error_code in ('budget','attempt_cap','skipped_kind'))
  )));

-- (A5b/P3) document_extractions.engine_kind += 'doc_classify' — the classifier
-- verdict row. DELIBERATELY OUTSIDE the AB-3 attribution set: the matcher reads
-- ONLY engine_kind in ('ocr','structured_parse') (re-asserted in the tail), so
-- a classify verdict can never become an attribution source. classify verdicts
-- carry NO regions (the verdict rides the envelope), so no field_path can
-- collide with the attribution patterns either.
alter table clara.document_extractions drop constraint ck_document_extractions_engine_kind_0009;
alter table clara.document_extractions add constraint ck_document_extractions_engine_kind_0016 check (
  engine_kind in ('ocr','structured_parse','invoice_facts','doc_classify'));

-- (A6/P3) open_questions.origin += 'classification' — the ADR-023 review-
-- question lane for a LOW-CONFIDENCE classifier verdict (< 0.8 leaves the kind
-- NULL and asks a human instead). Document-scoped, so it gates only entries on
-- THAT document (the 0012 rule_proposal carve-out is untouched). The inline
-- origin CHECK is system-named — drop by definition (0014 idiom).
do $$
declare v_con text;
begin
  select con.conname into v_con from pg_constraint con
  join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='open_questions' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%origin%'
    and pg_get_constraintdef(con.oid) ilike '%clarify_promotion%';
  if v_con is null then
    raise exception '0016: open_questions origin check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.open_questions drop constraint %I',v_con);
end $$;
alter table clara.open_questions add constraint open_questions_origin_check_0016 check (
  origin in ('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal',
             'manual','classification'));

-- (A7/P1) the evaluator's supporting index (EXPLAIN evidence = the rig lane).
create index ix_je_client_approved_posting
  on clara.journal_entries(client_id, posting_date, id) where status='approved';

-- (A8/P7) Backfill queue note: existing is_year_end rows default to
-- closing_transfer=false (the column default). Marking a POSTED entry is not
-- possible through any current lane (approved entries admit only the reversal
-- pair) — the eval-ceremony marking of RPR's closing entries therefore needs a
-- reverse-and-rebook or a future audited lane; this note makes that work item
-- unmissable per firm/client with year-end history.
insert into clara.notifications(firm_id,client_id,kind,payload,created_by)
select e.firm_id,e.client_id,'closing_transfer_review',
  jsonb_build_object(
    'message','Migration 0016 added the closing_transfer marker (SST turnover evaluator excludes is_year_end AND closing_transfer rows only). Mark this client''s year-end closing-transfer entries during the eval ceremony.',
    'year_end_approved_entries',count(*)),
  null
from clara.journal_entries e
where e.is_year_end and e.status='approved'
group by e.firm_id,e.client_id;

set role clara_fn_owner;

-- =====================================================================
-- B1 — P1: THE SST WATCH DATA PLANE. Six tables, created under clara_fn_owner
-- (the 0011/0015 idiom) so the DEFINER writers reach them through the owner RLS
-- policy; zero direct app-role grants (tail-asserted).
-- =====================================================================

-- Effective-dated service-group threshold reference (WA21-R5). System-
-- maintained: shipped by migrations, NO firm-editable writer exists (asserted
-- in the tail: no granted fn writes it).
create table clara.sst_threshold_schedule (
  service_group   text   not null,
  threshold_cents bigint not null check (threshold_cents>0),
  effective_from  date   not null,
  effective_to    date,
  source_note     text   not null check (btrim(source_note)<>''),
  primary key (service_group, effective_from)
);
insert into clara.sst_threshold_schedule
    (service_group,threshold_cents,effective_from,effective_to,source_note) values
  ('G',50000000,'2018-09-01',null,'STA 2018 First Sch; RM500k — factsheet §1'),
  ('I',50000000,'2018-09-01',null,'Group I; real-estate brokerage in scope from 2024-02-26 — factsheet §4');

-- Tri-state, effective-dated per-(client, account) turnover classification
-- (WA21-R5). A MISSING row means 'unknown_or_mixed' — an evaluator-side rule,
-- never a stored default (rig-asserted by the contract-blind lane).
create table clara.client_turnover_accounts (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null,
  client_id      uuid not null,
  account_code   text not null,
  classification text not null check (classification in ('included','excluded','unknown_or_mixed')),
  service_group  text,
  reason         text,
  evidence_note  text,
  set_by         text,
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  constraint uq_client_turnover_accounts unique (client_id,account_code,effective_from),
  constraint fk_client_turnover_account foreign key (client_id,account_code)
    references clara.coa_accounts(client_id,account_code),
  constraint ck_client_turnover_effective check (
    effective_to is null or effective_to>=effective_from)
);
create index ix_client_turnover_accounts_lookup
  on clara.client_turnover_accounts(client_id,account_code,effective_from);

-- Human-attested future-method records (WA21-R6/R9): amount, horizon, evidence,
-- reviewer, as-of + expiry. APPEND-ONLY — a changed view is a NEW attestation.
create table clara.sst_future_attestations (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null,
  client_id      uuid not null,
  service_group  text not null,
  expected_cents bigint not null check (expected_cents>=0),
  horizon_start  date not null,
  evidence_note  text not null check (btrim(evidence_note)<>''),
  reviewer       text not null check (btrim(reviewer)<>''),
  as_of          date not null,
  expires_at     date not null,
  created_at     timestamptz not null default now()
);
create index ix_sst_future_attestations_client
  on clara.sst_future_attestations(client_id,service_group,as_of);

-- The durable per-(client, service_group) watch case (WA21-R3): the state
-- machine monitored -> early_warning(>=80%) -> crossed -> overdue, with
-- acknowledge/snooze as OVERLAYS that never erase the condition, and 'resolved'
-- only with a typed conclusion + evidence. Re-arm policy is DATA
-- (next_rearm_cents/next_rearm_at), not dismissal prose.
create table clara.compliance_watches (
  id                          uuid primary key default gen_random_uuid(),
  firm_id                     uuid not null,
  client_id                   uuid not null,
  service_group               text not null,
  watch_kind                  text not null default 'sst_registration'
                              check (watch_kind in ('sst_registration')),
  state                       text not null
                              check (state in ('monitored','early_warning','crossed','overdue','resolved')),
  acknowledged_by             text,
  acknowledged_at             timestamptz,
  snoozed_until               timestamptz,
  next_rearm_cents            bigint,
  next_rearm_at               timestamptz,
  earliest_crossing_month     date,
  confirmed_included_cents    bigint,
  unknown_or_mixed_cents      bigint,
  screening_proxy_cents       bigint,
  window_start                date,
  window_end                  date,
  coverage_complete           boolean,
  -- ADV-7: the statutory machine evaluates only COMPLETED months (STA 2018
  -- s.12 fixes liability at the END of a month). Month-to-date movement is a
  -- NON-STATUTORY provisional signal — surfaced as separate labeled figures,
  -- never a state.
  provisional_month           date,
  provisional_included_cents  bigint,
  provisional_crossed         boolean not null default false,
  future_method_status        text
                              check (future_method_status in
                                ('not_assessed','attested_below','attested_above','expired')),
  application_due             date,
  schedule_effective_from     date,
  evaluated_at                timestamptz,
  evaluated_through_event_seq bigint,
  resolved_conclusion         text
                              check (resolved_conclusion is null or resolved_conclusion in
                                ('registration_recorded','not_liable_documented')),
  resolved_evidence           text,
  resolved_by                 text,
  resolved_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint fk_compliance_watches_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint ck_compliance_watches_resolved check (
    (state='resolved' and resolved_conclusion is not null and resolved_at is not null
      and resolved_by is not null and nullif(btrim(resolved_evidence),'') is not null)
    or (state<>'resolved' and resolved_conclusion is null and resolved_at is null
      and resolved_by is null and resolved_evidence is null)),
  constraint ck_compliance_watches_ack check (
    (acknowledged_by is null)=(acknowledged_at is null))
);
-- ONE open episode per (client, service_group, watch_kind) — the pin's partial
-- unique index.
create unique index uq_compliance_watches_one_open
  on clara.compliance_watches(client_id,service_group,watch_kind) where state<>'resolved';
create index ix_compliance_watches_firm_state
  on clara.compliance_watches(firm_id,state,updated_at);

-- Append-only disposition trail: who/when/figure-at-moment/rationale.
create table clara.compliance_watch_events (
  id           uuid primary key default gen_random_uuid(),
  watch_id     uuid not null references clara.compliance_watches(id),
  event_kind   text not null check (event_kind in
    ('created','tier_change','acknowledged','snoozed','re_armed','resolved','evaluation')),
  state_before text,
  state_after  text,
  figures      jsonb not null default '{}'::jsonb check (jsonb_typeof(figures)='object'),
  actor        text,
  rationale    text,
  created_at   timestamptz not null default now()
);
create index ix_compliance_watch_events_watch
  on clara.compliance_watch_events(watch_id,created_at);

-- Append-only evaluation receipts (platform-wide daily sweep; a receipt older
-- than 48h is ITSELF a surfaced condition via list_review_queue's summary).
create table clara.compliance_eval_runs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null,
  completed_at      timestamptz,
  clients_examined  int,
  clients_changed   int,
  clients_failed    int,
  through_event_seq bigint,
  schedule_note     text,
  error_note        text
);
create index ix_compliance_eval_runs_recency on clara.compliance_eval_runs(started_at);

-- Immutability posture: attestations, watch events and eval receipts are
-- strictly append-only; every compliance table refuses TRUNCATE. The watch case
-- itself and the classification rows are writer-mutated (audited DEFINER fns).
create trigger t_sst_future_attestations_append_only before update or delete
  on clara.sst_future_attestations for each row execute function clara._tf_append_only();
create trigger t_compliance_watch_events_append_only before update or delete
  on clara.compliance_watch_events for each row execute function clara._tf_append_only();
create trigger t_compliance_eval_runs_append_only before update or delete
  on clara.compliance_eval_runs for each row execute function clara._tf_append_only();
do $$
declare t text;
begin
  foreach t in array array['sst_threshold_schedule','client_turnover_accounts',
    'sst_future_attestations','compliance_watches','compliance_watch_events',
    'compliance_eval_runs'] loop
    execute format('create trigger t_%s_no_truncate before truncate on clara.%I '
      'for each statement execute function clara._tf_no_truncate()',t,t);
    execute format('alter table clara.%I enable row level security',t);
    execute format('alter table clara.%I force row level security',t);
    execute format(
      'create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)',
      t,t);
  end loop;
end $$;

-- =====================================================================
-- B2 — P5: the typed events, registered into event_types + the ACTIVE taxonomy
-- (the 0011/0015 additive-pair idiom — no new version/repoint).
-- compliance.watch_transition rides the notification path (the watch card);
-- document.classified is 'ignore' at the taxonomy (the facts-gate re-enqueue is
-- a separate registered runtime consumer, the matcher precedent).
-- =====================================================================
with added(name,client_scoped,description,decision,note) as (values
  ('compliance.watch_transition',true,
   'An SST registration watch was created or changed tier/overlay','notification',null::text),
  ('document.classified',true,
   'A document kind was classified (classifier verdict or human attestation)','ignore',
   'facts-gate re-enqueue is a separate registered consumer')
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note from added x
join inserted_types i on i.name=x.name cross join clara.taxonomy_active a;

-- =====================================================================
-- B3 — P1: THE EVALUATOR. DB-computed statutory month-end rolling test with
-- earliest-crossing detection (WA21-R3). The DB owns every number: rolling
-- sums, crossings, deadlines and re-arm bounds are all computed HERE; the model
-- only narrates labeled figures. HARD NOTS (contract §2.4, tail-asserted): this
-- path never blocks an approval, never writes journal entries/legs/rules/
-- open_questions, and an evaluator failure never rolls back a caller — the
-- whole body is exception-isolated per client.
--
-- Semantics (pin P1):
--  * calendar-month windows (month + 11 preceding), sum(credit-debit) over
--    APPROVED entries x the tri-state classification effective at each entry's
--    posting_date (missing row => unknown_or_mixed);
--  * opening-balance entries excluded from observed turnover (-> coverage
--    flag); future-dated excluded; reversal mirrors INCLUDED (the pair nets);
--    is_year_end excluded ONLY when the entry carries closing_transfer (P7);
--  * recomputed at EVERY month-end since coverage start -> earliest crossing;
--    the statutory boundary is strict > (RM 500,000.00 exactly is NOT crossed);
--  * tier ladder monitored -> early_warning (>=80%) -> crossed -> overdue
--    (past application_due = last day of crossing-month + 1, factsheet §2);
--  * re-arm per the stored next_rearm_* ladder (crossing, +10pp of threshold,
--    earlier backdated crossing, due-date worsening, snooze expiry,
--    attestation expiry);
--  * transitions write compliance_watch_events + _append_event
--    'compliance.watch_transition'.
--
-- Judgment calls the pins left open (reported to the orchestrator): a
-- classification row with NULL service_group rides the default group 'G', and
-- a client with income activity but zero classification rows is screened under
-- 'G' (visibility-first); the tier ladder is driven by the CONFIRMED-INCLUDED
-- figure (the defensible statutory basis) with unknown_or_mixed and the
-- all-income proxy as separate labeled figures; a 'registration_recorded'
-- resolution never auto-reopens (s.18-20 sticky registration) while a
-- 'not_liable_documented' resolution reopens only on a NEW crossing after the
-- resolution month; op_key is validated + audited but not op_receipts-reserved
-- (re-evaluation is idempotent recomputation from the books).
create function clara.evaluate_sst_watch(p_client uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_firm uuid; v_today date:=current_date;
  v_cur_month date:=date_trunc('month',current_date)::date;
  -- ADV-7: the last COMPLETED month — the statutory evaluation horizon (STA
  -- 2018 s.12 fixes liability at the END of a month; the month in progress can
  -- only ever be a provisional signal).
  v_stat_month date:=(date_trunc('month',current_date)-interval '1 month')::date;
  v_groups text[]; g text; v_out jsonb:='[]'::jsonb; v_changed boolean:=false;
  v_threshold bigint; v_sched_from date;
  v_inc bigint; v_unk bigint; v_proxy bigint; v_first_month date;
  v_earliest date; v_due date; v_state text; v_has_ob boolean; v_cov boolean;
  v_fm text; v_att record; w record; v_watch uuid; v_seq bigint;
  v_rearm boolean; v_rearm_why text; v_group_changed boolean;
  v_figures jsonb; v_resolved record; v_first_posting date;
  v_prov_inc bigint; v_prov_crossed boolean; v_fut_month date;
begin
  begin
    if p_op_key is null or btrim(p_op_key)='' then
      raise exception 'op_key is required' using errcode='CLR10';
    end if;
    -- (adjudication #7): an unknown client is a NO-OP summary, never a raise —
    -- the evaluator can never poison a caller's transaction.
    select firm_id into v_firm from clara.clients where id=p_client;
    if v_firm is null then
      return jsonb_build_object('client_id',p_client,'status','skipped',
        'reason','client_not_found','changed',false,'groups','[]'::jsonb);
    end if;

    -- groups in play (ADV-9: a group can never DISAPPEAR from evaluation):
    -- every included/unknown classification group across the WHOLE effective
    -- history (a later reclassification must not orphan a historical crossing),
    -- UNION every open (unresolved) watch's group (backdating/expiry/deadline
    -- updates keep flowing), UNION every unexpired attestation's group.
    -- NULL group -> 'G'; a wholly-unclassified client with income activity is
    -- screened under 'G' so the condition can never hide behind missing setup.
    select coalesce(array_agg(distinct u.grp),'{}'::text[])
      into v_groups
      from (
        select coalesce(t.service_group,'G') as grp
          from clara.client_turnover_accounts t
          where t.client_id=p_client
            and t.classification in ('included','unknown_or_mixed')
        union
        select cw0.service_group
          from clara.compliance_watches cw0
          where cw0.client_id=p_client and cw0.watch_kind='sst_registration'
            and cw0.state<>'resolved'
        union
        select a0.service_group
          from clara.sst_future_attestations a0
          where a0.client_id=p_client and a0.expires_at>=v_today
      ) u;
    if coalesce(array_length(v_groups,1),0)=0 then
      if exists(select 1 from clara.journal_entries e
          join clara.journal_lines l on l.entry_id=e.id
          join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
          where e.client_id=p_client and e.status='approved' and a.account_type='income') then
        v_groups:=array['G'];
      else
        return jsonb_build_object('client_id',p_client,'status','ok','changed',false,
          'groups','[]'::jsonb);
      end if;
    end if;

    -- coverage (adjudication #5): coverage_complete=false iff ANY opening-
    -- balance entry exists for the client (compressed pre-history) OR the
    -- earliest approved posting_date starts INSIDE the current window (the
    -- books do not reach back the full 12 months). Opening-balance history is
    -- excluded from observed turnover either way and surfaced as missing-history.
    v_has_ob:=exists(select 1 from clara.journal_entries e
      where e.client_id=p_client and e.status='approved' and e.is_opening_balance);
    select min(e.posting_date) into v_first_posting from clara.journal_entries e
      where e.client_id=p_client and e.status='approved' and not e.is_opening_balance;
    v_cov:=not v_has_ob and v_first_posting is not null
      and v_first_posting<=(v_stat_month-interval '11 months')::date;
    select coalesce(max(seq),0) into v_seq from clara.domain_events where firm_id=v_firm;

    foreach g in array v_groups loop
      select s.threshold_cents,s.effective_from into v_threshold,v_sched_from
        from clara.sst_threshold_schedule s
        where s.service_group=g and s.effective_from<=v_today
          and (s.effective_to is null or s.effective_to>=v_today)
        order by s.effective_from desc limit 1;
      if v_threshold is null then
        v_out:=v_out||jsonb_build_object('service_group',g,'state',null,
          'error','no_threshold_schedule');
        continue;
      end if;

      -- monthly sums + the rolling recompute at every month-end since coverage
      -- start. The threshold is looked up per month-end (effective-dated).
      with counted as (
        select date_trunc('month',e.posting_date)::date as m,
          coalesce(sum(l.credit_cents-l.debit_cents) filter (where
            cls.classification='included' and coalesce(cls.service_group,'G')=g),0) as inc,
          coalesce(sum(l.credit_cents-l.debit_cents) filter (where
            (cls.classification='unknown_or_mixed' and coalesce(cls.service_group,'G')=g)
            or (cls.classification is null and a.account_type='income' and g='G')),0) as unk,
          coalesce(sum(l.credit_cents-l.debit_cents) filter (where
            a.account_type='income'),0) as proxy
        from clara.journal_entries e
        join clara.journal_lines l on l.entry_id=e.id
        join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
        left join lateral (
          select t.classification,t.service_group
          from clara.client_turnover_accounts t
          where t.client_id=e.client_id and t.account_code=l.account_code
            and t.effective_from<=e.posting_date
            and (t.effective_to is null or t.effective_to>=e.posting_date)
          order by t.effective_from desc limit 1) cls on true
        where e.client_id=p_client and e.status='approved'
          and not e.is_opening_balance
          and e.posting_date<=v_today
          and not (e.is_year_end and e.closing_transfer)
          and (a.account_type='income' or cls.classification is not null)
        group by 1
      ), months as (
        -- ADV-7: the statutory series stops at the last COMPLETED month; the
        -- month in progress never becomes a statutory month-end.
        select generate_series((select min(c0.m) from counted c0),v_stat_month,
          interval '1 month')::date as m
      ), rolled as (
        select mo.m,
          (select coalesce(sum(c1.inc),0) from counted c1
             where c1.m>=(mo.m-interval '11 months')::date and c1.m<=mo.m) as r_inc,
          (select coalesce(sum(c2.unk),0) from counted c2
             where c2.m>=(mo.m-interval '11 months')::date and c2.m<=mo.m) as r_unk,
          (select coalesce(sum(c3.proxy),0) from counted c3
             where c3.m>=(mo.m-interval '11 months')::date and c3.m<=mo.m) as r_proxy,
          (select s2.threshold_cents from clara.sst_threshold_schedule s2
             where s2.service_group=g
               and s2.effective_from<=(mo.m+interval '1 month'-interval '1 day')::date
               and (s2.effective_to is null
                 or s2.effective_to>=(mo.m+interval '1 month'-interval '1 day')::date)
             order by s2.effective_from desc limit 1) as thr
        from months mo
      )
      select
        (select min(r1.m) from rolled r1 where r1.thr is not null and r1.r_inc>r1.thr),
        (select r2.r_inc from rolled r2 where r2.m=v_stat_month),
        (select r3.r_unk from rolled r3 where r3.m=v_stat_month),
        (select r4.r_proxy from rolled r4 where r4.m=v_stat_month),
        (select min(c9.m) from counted c9),
        -- ADV-7: the PROVISIONAL rolling figure — the 12 months ending at the
        -- month in progress, month-to-date included. A separate labeled signal,
        -- never a statutory state input.
        (select coalesce(sum(c5.inc),0) from counted c5
           where c5.m>=(v_cur_month-interval '11 months')::date and c5.m<=v_cur_month)
        into v_earliest,v_inc,v_unk,v_proxy,v_first_month,v_prov_inc;
      v_inc:=coalesce(v_inc,0); v_unk:=coalesce(v_unk,0); v_proxy:=coalesce(v_proxy,0);
      v_prov_inc:=coalesce(v_prov_inc,0);
      v_prov_crossed:=v_prov_inc>v_threshold;

      -- ADV-8: the future method (WA21-R6) read BEFORE state derivation — a
      -- valid above-threshold attestation whose as-of month has ENDED is the
      -- statutory future test met in that month (s.12(c)/(d)); liability and
      -- the deadline follow the EARLIER of the two methods.
      select a2.* into v_att from clara.sst_future_attestations a2
        where a2.client_id=p_client and a2.service_group=g
        order by a2.as_of desc,a2.created_at desc limit 1;
      if v_att.id is null then v_fm:='not_assessed';
      elsif v_att.expires_at<v_today then v_fm:='expired';
      elsif v_att.expected_cents>v_threshold then v_fm:='attested_above';
      else v_fm:='attested_below';
      end if;
      v_fut_month:=null;
      if v_fm='attested_above'
         and date_trunc('month',v_att.as_of)::date<v_cur_month then
        v_fut_month:=date_trunc('month',v_att.as_of)::date;
      end if;
      v_earliest:=least(coalesce(v_earliest,v_fut_month),coalesce(v_fut_month,v_earliest));

      -- statutory countdown (factsheet §2 / s.13(1)): application due the last
      -- day of the month FOLLOWING the crossing month.
      v_due:=case when v_earliest is null then null
        else ((v_earliest+interval '2 months')::date - 1) end;
      v_state:=case
        when v_earliest is not null and v_today>((v_earliest+interval '2 months')::date - 1)
          then 'overdue'
        when v_earliest is not null then 'crossed'
        when v_inc*5>=v_threshold*4 then 'early_warning'   -- >=80%, integer-exact
        else 'monitored' end;

      v_figures:=jsonb_build_object(
        'confirmed_included_cents',v_inc,'unknown_or_mixed_cents',v_unk,
        'screening_proxy_cents',v_proxy,'threshold_cents',v_threshold,
        'earliest_crossing_month',v_earliest,'application_due',v_due,
        'window_start',(v_stat_month-interval '11 months')::date,'window_end',v_stat_month,
        'future_method_status',v_fm,'future_method_month',v_fut_month,
        'coverage_complete',v_cov,
        'provisional_month',v_cur_month,'provisional_included_cents',v_prov_inc,
        'provisional_crossed',v_prov_crossed);

      select * into w from clara.compliance_watches
        where client_id=p_client and service_group=g and watch_kind='sst_registration'
          and state<>'resolved'
        for update;
      if not found then
        -- resolved-episode gate: registration recorded is STICKY (never
        -- auto-reopen); a documented not-liable analysis reopens only on a NEW
        -- crossing after the resolution month.
        select cw.resolved_conclusion,cw.resolved_at into v_resolved
          from clara.compliance_watches cw
          where cw.client_id=p_client and cw.service_group=g
            and cw.watch_kind='sst_registration' and cw.state='resolved'
          order by cw.resolved_at desc nulls last limit 1;
        if v_resolved.resolved_conclusion='registration_recorded'
           or (v_resolved.resolved_conclusion='not_liable_documented'
               and (v_earliest is null
                    or v_earliest<=date_trunc('month',v_resolved.resolved_at)::date)) then
          v_out:=v_out||(jsonb_build_object('service_group',g,'state','resolved_episode')
            ||v_figures);
          continue;
        end if;
        insert into clara.compliance_watches(firm_id,client_id,service_group,watch_kind,
            state,earliest_crossing_month,confirmed_included_cents,unknown_or_mixed_cents,
            screening_proxy_cents,window_start,window_end,coverage_complete,
            provisional_month,provisional_included_cents,provisional_crossed,
            future_method_status,application_due,schedule_effective_from,
            evaluated_at,evaluated_through_event_seq)
          values(v_firm,p_client,g,'sst_registration',v_state,
            v_earliest,v_inc,v_unk,v_proxy,
            (v_stat_month-interval '11 months')::date,v_stat_month,v_cov,
            v_cur_month,v_prov_inc,v_prov_crossed,
            v_fm,v_due,v_sched_from,now(),v_seq)
          returning id into v_watch;
        insert into clara.compliance_watch_events(watch_id,event_kind,state_before,
            state_after,figures,actor,rationale)
          values(v_watch,'created',null,v_state,v_figures,'evaluator',null);
        perform clara._append_event(v_firm,'compliance.watch_transition',p_client,
          null,null,null,null,null,null,
          jsonb_build_object('watch_id',v_watch,'service_group',g,'kind','created',
            'state_before',null,'state_after',v_state));
        v_changed:=true;
      else
        v_watch:=w.id;
        -- the re-arm ladder acts only on an acknowledged/snoozed overlay: the
        -- condition was seen; a materially-worse or expired basis re-surfaces it.
        v_rearm:=false; v_rearm_why:=null;
        if w.acknowledged_at is not null or w.snoozed_until is not null then
          if v_earliest is not null and w.earliest_crossing_month is null then
            v_rearm:=true; v_rearm_why:='crossing';
          elsif w.next_rearm_cents is not null and v_inc>=w.next_rearm_cents then
            v_rearm:=true; v_rearm_why:='threshold_movement';
          elsif v_earliest is not null and w.earliest_crossing_month is not null
                and v_earliest<w.earliest_crossing_month then
            v_rearm:=true; v_rearm_why:='earlier_backdated_crossing';
          elsif v_due is not null and w.application_due is not null
                and v_due<w.application_due then
            v_rearm:=true; v_rearm_why:='due_date_worsening';
          elsif w.snoozed_until is not null and now()>w.snoozed_until then
            v_rearm:=true; v_rearm_why:='snooze_expired';
          elsif w.future_method_status in ('attested_below','attested_above')
                and v_fm='expired' then
            v_rearm:=true; v_rearm_why:='attestation_expired';
          end if;
        end if;
        v_group_changed:=v_state is distinct from w.state
          or v_inc is distinct from w.confirmed_included_cents
          or v_unk is distinct from w.unknown_or_mixed_cents
          or v_proxy is distinct from w.screening_proxy_cents
          or v_earliest is distinct from w.earliest_crossing_month
          or v_fm is distinct from w.future_method_status
          or v_prov_inc is distinct from w.provisional_included_cents
          or v_prov_crossed is distinct from w.provisional_crossed
          or v_rearm;
        update clara.compliance_watches set
          state=v_state,
          earliest_crossing_month=v_earliest,
          confirmed_included_cents=v_inc,unknown_or_mixed_cents=v_unk,
          screening_proxy_cents=v_proxy,
          window_start=(v_stat_month-interval '11 months')::date,window_end=v_stat_month,
          provisional_month=v_cur_month,provisional_included_cents=v_prov_inc,
          provisional_crossed=v_prov_crossed,
          coverage_complete=v_cov,future_method_status=v_fm,
          application_due=v_due,schedule_effective_from=v_sched_from,
          acknowledged_by=case when v_rearm then null else acknowledged_by end,
          acknowledged_at=case when v_rearm then null else acknowledged_at end,
          snoozed_until=case when v_rearm then null else snoozed_until end,
          next_rearm_cents=case when v_rearm then null else next_rearm_cents end,
          next_rearm_at=case when v_rearm then null else next_rearm_at end,
          evaluated_at=now(),evaluated_through_event_seq=v_seq,updated_at=now()
          where id=w.id;
        if v_rearm then
          insert into clara.compliance_watch_events(watch_id,event_kind,state_before,
              state_after,figures,actor,rationale)
            values(w.id,'re_armed',w.state,v_state,v_figures,'evaluator',v_rearm_why);
          perform clara._append_event(v_firm,'compliance.watch_transition',p_client,
            null,null,null,null,null,null,
            jsonb_build_object('watch_id',w.id,'service_group',g,'kind','re_armed',
              'reason',v_rearm_why,'state_before',w.state,'state_after',v_state));
          v_changed:=true;
        end if;
        if v_state is distinct from w.state then
          insert into clara.compliance_watch_events(watch_id,event_kind,state_before,
              state_after,figures,actor,rationale)
            values(w.id,'tier_change',w.state,v_state,v_figures,'evaluator',null);
          perform clara._append_event(v_firm,'compliance.watch_transition',p_client,
            null,null,null,null,null,null,
            jsonb_build_object('watch_id',w.id,'service_group',g,'kind','tier_change',
              'state_before',w.state,'state_after',v_state));
          v_changed:=true;
        elsif v_group_changed and not v_rearm then
          insert into clara.compliance_watch_events(watch_id,event_kind,state_before,
              state_after,figures,actor,rationale)
            values(w.id,'evaluation',w.state,v_state,v_figures,'evaluator',null);
          v_changed:=true;
        end if;
      end if;
      v_out:=v_out||(jsonb_build_object('service_group',g,'watch_id',v_watch,
        'state',v_state)||v_figures);
    end loop;

    if v_changed then
      perform clara._audit(v_firm,null,null,null,'evaluate_sst_watch',null,
        jsonb_build_object('client',p_client,'op_key',p_op_key,'groups',v_out));
    end if;
    return jsonb_build_object('client_id',p_client,'status','ok','changed',v_changed,
      'groups',v_out);
  exception when others then
    -- exception isolation (contract §2.4): an evaluator failure NEVER raises to
    -- the caller's transaction — a poisoned client can never block the sweep or
    -- an approval consumer.
    return jsonb_build_object('client_id',p_client,'status','failed','changed',false,
      'error',sqlerrm,'sqlstate',sqlstate);
  end;
end $$;
revoke all on function clara.evaluate_sst_watch(uuid,text) from public;

-- The daily-sweep wrapper (the §2.2 repair belt): re-evaluates every active
-- client, counts failures WITHOUT raising, and writes ONE append-only receipt.
create function clara.evaluate_sst_watches_all(p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_started timestamptz:=clock_timestamp(); cl record; v_res jsonb; v_run uuid;
  v_ex int:=0; v_ch int:=0; v_fail int:=0; v_seq bigint; v_first_err text;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  for cl in select c.id from clara.clients c where c.status='active' order by c.id loop
    v_res:=clara.evaluate_sst_watch(cl.id,p_op_key||':'||cl.id::text);
    v_ex:=v_ex+1;
    if v_res->>'status'='failed' then
      v_fail:=v_fail+1;
      if v_first_err is null then
        v_first_err:=cl.id::text||': '||coalesce(v_res->>'error','?');
      end if;
    elsif coalesce((v_res->>'changed')::boolean,false) then
      v_ch:=v_ch+1;
    end if;
  end loop;
  select coalesce(max(seq),0) into v_seq from clara.domain_events;
  insert into clara.compliance_eval_runs(started_at,completed_at,clients_examined,
      clients_changed,clients_failed,through_event_seq,schedule_note,error_note)
    values(v_started,clock_timestamp(),v_ex,v_ch,v_fail,v_seq,
      (select string_agg(s.service_group||'@'||s.effective_from,',' order by s.service_group)
         from clara.sst_threshold_schedule s
         where s.effective_from<=current_date
           and (s.effective_to is null or s.effective_to>=current_date)),
      v_first_err)
    returning id into v_run;
  return jsonb_build_object('run_id',v_run,'clients_examined',v_ex,
    'clients_changed',v_ch,'clients_failed',v_fail);
end $$;
revoke all on function clara.evaluate_sst_watches_all(text) from public;

-- =====================================================================
-- B3b — P1: THE HUMAN-LANE WRITERS (bookkeeper+ unless noted; op_key idiom;
-- audited via the existing audit_log pattern). Every one hard-refuses an agent
-- identity (the acknowledge_rule_posts pattern, CLR03) on top of the role-level
-- zero-EXECUTE — the §2.4 "agent writes nothing" invariant, belt + braces.
-- =====================================================================

-- set_turnover_classification: tri-state, effective-dated. Watch-LOWERING moves
-- (-> 'excluded', or included -> unknown_or_mixed) require admin+ (WA21-R5);
-- everything else is bookkeeper+. Closes the open predecessor row at
-- p_effective_from - 1 day so the effective-dated history stays gapless.
create function clara.set_turnover_classification(p_client uuid, p_account_code text,
    p_classification text, p_service_group text, p_reason text, p_evidence text,
    p_effective_from date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; wk record; v_dedupe jsonb; v_cur record; v_lowering boolean; v_id uuid;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot classify turnover accounts' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or nullif(btrim(coalesce(p_account_code,'')),'') is null
     or p_classification not in ('included','excluded','unknown_or_mixed')
     or p_reason is null or nullif(btrim(p_reason),'') is null
     or p_effective_from is null then
    raise exception 'turnover classification is malformed' using errcode='CLR10';
  end if;
  if p_service_group is not null and not exists(select 1 from clara.sst_threshold_schedule s
      where s.service_group=p_service_group) then
    raise exception 'unknown service group %',p_service_group using errcode='CLR10';
  end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  if not exists(select 1 from clara.coa_accounts where client_id=p_client
      and account_code=p_account_code) then
    raise exception 'account not found on the client chart' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'set_turnover_classification',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'account',p_account_code,
      'classification',p_classification,'group',p_service_group,
      'effective_from',p_effective_from)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- the classification in force at the new effective date; MISSING row means
  -- 'unknown_or_mixed' (the evaluator-side rule, mirrored here).
  select t.* into v_cur from clara.client_turnover_accounts t
    where t.client_id=p_client and t.account_code=p_account_code
      and t.effective_from<=p_effective_from
      and (t.effective_to is null or t.effective_to>=p_effective_from)
    order by t.effective_from desc limit 1;
  -- ADV-10: watch-lowering includes SERVICE-GROUP REASSIGNMENT of an existing
  -- classified account (moving turnover between groups splits it below both
  -- thresholds); every lowering move demands admin+ AND non-blank evidence.
  v_lowering:=(p_classification='excluded')
    or (coalesce(v_cur.classification,'unknown_or_mixed')='included'
        and p_classification='unknown_or_mixed')
    or (v_cur.id is not null
        and coalesce(v_cur.service_group,'G') is distinct from coalesce(p_service_group,'G'));
  if v_lowering and coalesce(clara.actor_role_rank(),-1)<clara.role_rank('admin') then
    raise exception 'a watch-lowering classification requires admin' using errcode='CLR04';
  end if;
  if v_lowering and (p_evidence is null or btrim(p_evidence)='') then
    raise exception 'a watch-lowering classification requires evidence' using errcode='CLR10';
  end if;
  update clara.client_turnover_accounts set effective_to=p_effective_from-1
    where client_id=p_client and account_code=p_account_code
      and effective_to is null and effective_from<p_effective_from;
  begin
    insert into clara.client_turnover_accounts(firm_id,client_id,account_code,
        classification,service_group,reason,evidence_note,set_by,effective_from)
      values(c.firm,p_client,p_account_code,p_classification,p_service_group,
        btrim(p_reason),p_evidence,c.actor::text,p_effective_from)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'a classification already exists for this account and effective date'
      using errcode='CLR10';
  end;
  perform clara._audit(c.firm,c.actor,null,null,'set_turnover_classification',null,
    jsonb_build_object('client',p_client,'account',p_account_code,
      'classification',p_classification,'group',p_service_group,
      'effective_from',p_effective_from,'lowering',v_lowering,'row',v_id,
      'op_key',p_op_key));
  return clara._finish_op(c.firm,'set_turnover_classification',p_op_key,
    jsonb_build_object('id',v_id,'classification',p_classification,
      'effective_from',p_effective_from));
end $$;
revoke all on function clara.set_turnover_classification(uuid,text,text,text,text,text,date,text) from public;

-- record_future_attestation (admin+, WA21-R6/R9): the future method is a HUMAN
-- attestation with amount, horizon, evidence, reviewer, as-of + expiry.
create function clara.record_future_attestation(p_client uuid, p_service_group text,
    p_expected_cents bigint, p_horizon_start date, p_evidence text,
    p_expires_at date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; wk record; v_dedupe jsonb; v_id uuid;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot attest the future method' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- (adjudication #4): a PAST expires_at is legal — historical paperwork may be
  -- recorded; the evaluator derives 'expired' from the newest row's expiry.
  if p_client is null or p_expected_cents is null or p_expected_cents<0
     or p_horizon_start is null or p_evidence is null or nullif(btrim(p_evidence),'') is null
     or p_expires_at is null then
    raise exception 'future-method attestation is malformed' using errcode='CLR10';
  end if;
  if p_service_group is null or not exists(select 1 from clara.sst_threshold_schedule s
      where s.service_group=p_service_group) then
    raise exception 'unknown service group %',p_service_group using errcode='CLR10';
  end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'record_future_attestation',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'group',p_service_group,
      'expected',p_expected_cents,'horizon',p_horizon_start,'expires',p_expires_at)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.sst_future_attestations(firm_id,client_id,service_group,
      expected_cents,horizon_start,evidence_note,reviewer,as_of,expires_at)
    values(c.firm,p_client,p_service_group,p_expected_cents,p_horizon_start,
      btrim(p_evidence),c.actor::text,current_date,p_expires_at)
    returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'record_future_attestation',null,
    jsonb_build_object('client',p_client,'group',p_service_group,
      'expected_cents',p_expected_cents,'expires_at',p_expires_at,'row',v_id,
      'op_key',p_op_key));
  return clara._finish_op(c.firm,'record_future_attestation',p_op_key,
    jsonb_build_object('id',v_id,'expires_at',p_expires_at));
end $$;
revoke all on function clara.record_future_attestation(uuid,text,bigint,date,text,date,text) from public;

-- ack_compliance_watch (bookkeeper+): acknowledge-requires-rationale. An ack is
-- an OVERLAY — it never erases the condition; the stored +10pp re-arm bound
-- (next_rearm_cents) is DATA the evaluator enforces.
create function clara.ack_compliance_watch(p_watch uuid, p_rationale text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; wk record; v_dedupe jsonb; w record; v_thr bigint;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot acknowledge a compliance watch' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_watch is null or p_rationale is null or nullif(btrim(p_rationale),'') is null then
    raise exception 'acknowledgement requires a rationale' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'ack_compliance_watch',p_op_key,
    clara._hash(jsonb_build_object('watch',p_watch,'rationale',p_rationale)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into w from clara.compliance_watches where id=p_watch for update;
  if not found or w.firm_id<>c.firm then
    raise exception 'watch not found' using errcode='CLR11';
  end if;
  if w.state='resolved' then
    raise exception 'a resolved watch cannot be acknowledged' using errcode='CLR10';
  end if;
  select s.threshold_cents into v_thr from clara.sst_threshold_schedule s
    where s.service_group=w.service_group and s.effective_from<=current_date
      and (s.effective_to is null or s.effective_to>=current_date)
    order by s.effective_from desc limit 1;
  update clara.compliance_watches set
    acknowledged_by=c.actor::text,acknowledged_at=now(),
    next_rearm_cents=coalesce(w.confirmed_included_cents,0)+coalesce(v_thr,0)/10,
    updated_at=now()
    where id=p_watch;
  insert into clara.compliance_watch_events(watch_id,event_kind,state_before,state_after,
      figures,actor,rationale)
    values(p_watch,'acknowledged',w.state,w.state,
      jsonb_build_object('confirmed_included_cents',w.confirmed_included_cents,
        'next_rearm_cents',coalesce(w.confirmed_included_cents,0)+coalesce(v_thr,0)/10),
      c.actor::text,btrim(p_rationale));
  perform clara._audit(c.firm,c.actor,null,null,'ack_compliance_watch',null,
    jsonb_build_object('watch',p_watch,'rationale',p_rationale,'op_key',p_op_key));
  return clara._finish_op(c.firm,'ack_compliance_watch',p_op_key,
    jsonb_build_object('watch_id',p_watch,'state',w.state,'acknowledged',true));
end $$;
revoke all on function clara.ack_compliance_watch(uuid,text,text) from public;

-- snooze_compliance_watch (bookkeeper+): bounded (<= 60 days), dated, rationale
-- required; snooze expiry is a stored re-arm trigger (next_rearm_at).
create function clara.snooze_compliance_watch(p_watch uuid, p_until timestamptz,
    p_rationale text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; wk record; v_dedupe jsonb; w record;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot snooze a compliance watch' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_watch is null or p_rationale is null or nullif(btrim(p_rationale),'') is null
     or p_until is null or p_until<=now() then
    raise exception 'snooze requires a future date and a rationale' using errcode='CLR10';
  end if;
  if p_until>now()+interval '60 days' then
    raise exception 'a snooze is bounded to 60 days' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'snooze_compliance_watch',p_op_key,
    clara._hash(jsonb_build_object('watch',p_watch,'until',p_until,
      'rationale',p_rationale)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into w from clara.compliance_watches where id=p_watch for update;
  if not found or w.firm_id<>c.firm then
    raise exception 'watch not found' using errcode='CLR11';
  end if;
  if w.state='resolved' then
    raise exception 'a resolved watch cannot be snoozed' using errcode='CLR10';
  end if;
  update clara.compliance_watches set
    snoozed_until=p_until,next_rearm_at=p_until,updated_at=now()
    where id=p_watch;
  insert into clara.compliance_watch_events(watch_id,event_kind,state_before,state_after,
      figures,actor,rationale)
    values(p_watch,'snoozed',w.state,w.state,
      jsonb_build_object('snoozed_until',p_until),c.actor::text,btrim(p_rationale));
  perform clara._audit(c.firm,c.actor,null,null,'snooze_compliance_watch',null,
    jsonb_build_object('watch',p_watch,'until',p_until,'rationale',p_rationale,
      'op_key',p_op_key));
  return clara._finish_op(c.firm,'snooze_compliance_watch',p_op_key,
    jsonb_build_object('watch_id',p_watch,'snoozed_until',p_until));
end $$;
revoke all on function clara.snooze_compliance_watch(uuid,timestamptz,text,text) from public;

-- resolve_compliance_watch (bookkeeper+): a TYPED conclusion + evidence is
-- mandatory — 'registration_recorded' (sticky, s.18-20) or
-- 'not_liable_documented'. Resolve touches ONLY the watch case (§2.4).
create function clara.resolve_compliance_watch(p_watch uuid, p_conclusion text,
    p_evidence text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; wk record; v_dedupe jsonb; w record;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot resolve a compliance watch' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_watch is null
     or p_conclusion not in ('registration_recorded','not_liable_documented')
     or p_evidence is null or nullif(btrim(p_evidence),'') is null then
    raise exception 'resolution requires a typed conclusion and evidence' using errcode='CLR10';
  end if;
  -- ADV-10: a documented NOT-LIABLE analysis is exemption-equivalent (a
  -- watch-lowering act) — admin+ only. Recording a registration stays
  -- bookkeeper+ (the positive compliance outcome).
  if p_conclusion='not_liable_documented'
     and coalesce(clara.actor_role_rank(),-1)<clara.role_rank('admin') then
    raise exception 'a not-liable resolution requires admin' using errcode='CLR04';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'resolve_compliance_watch',p_op_key,
    clara._hash(jsonb_build_object('watch',p_watch,'conclusion',p_conclusion,
      'evidence',p_evidence)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into w from clara.compliance_watches where id=p_watch for update;
  if not found or w.firm_id<>c.firm then
    raise exception 'watch not found' using errcode='CLR11';
  end if;
  if w.state='resolved' then
    raise exception 'watch is already resolved' using errcode='CLR10';
  end if;
  update clara.compliance_watches set
    state='resolved',resolved_conclusion=p_conclusion,
    resolved_evidence=btrim(p_evidence),resolved_by=c.actor::text,resolved_at=now(),
    acknowledged_by=null,acknowledged_at=null,snoozed_until=null,
    next_rearm_cents=null,next_rearm_at=null,updated_at=now()
    where id=p_watch;
  insert into clara.compliance_watch_events(watch_id,event_kind,state_before,state_after,
      figures,actor,rationale)
    values(p_watch,'resolved',w.state,'resolved',
      jsonb_build_object('conclusion',p_conclusion),c.actor::text,btrim(p_evidence));
  perform clara._append_event(c.firm,'compliance.watch_transition',w.client_id,c.actor,
    null,null,null,null,null,
    jsonb_build_object('watch_id',p_watch,'service_group',w.service_group,
      'kind','resolved','state_before',w.state,'state_after','resolved',
      'conclusion',p_conclusion));
  perform clara._audit(c.firm,c.actor,null,null,'resolve_compliance_watch',null,
    jsonb_build_object('watch',p_watch,'conclusion',p_conclusion,'op_key',p_op_key));
  return clara._finish_op(c.firm,'resolve_compliance_watch',p_op_key,
    jsonb_build_object('watch_id',p_watch,'state','resolved','conclusion',p_conclusion));
end $$;
revoke all on function clara.resolve_compliance_watch(uuid,text,text,text) from public;

-- =====================================================================
-- B4 — P2: CREDIT-SIDE SIGHTINGS + THE SALES AUTOPOST LIFT.
-- _approve_entry_core CoR (same arity, ACL preserved): the ONLY change is the
-- sighting block — the debit insert states side='debit' explicitly and an
-- income-class CREDIT insert (side='credit') joins it; the 3-sighting
-- vendor_account auto-proposal stays side='debit'-scoped. NO watch logic lives
-- here (pin P1/P6, the Codex refuse-list): the SST watch rides the
-- entry.approved spine event this core already emits. Everything else is
-- byte-identical to the 0015 body.
-- =====================================================================
create or replace function clara._approve_entry_core(p_ctx jsonb, p_entry uuid,
    p_expected_revision uuid, p_attestation text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; e record; v_dedupe jsonb; v_attest text; v_filing uuid;
  v_fingerprint jsonb; v_counterparty uuid; v_created boolean:=false;
  v_name text; v_reg text; v_tin text; v_name_n text; v_reg_n text;
  v_state jsonb; v_invoice_id text; v_question record; v_map record;
  v_rule uuid; v_question_id uuid; v_seen int;
  v_checked_via_rule uuid; v_kind text;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  v_checked_via_rule:=nullif(p_ctx->>'checked_via_rule_id','')::uuid;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_entry',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'rev',p_expected_revision,
      'att',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into e from clara.journal_entries where id=p_entry;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  -- CLR26 document-scope serialization (see the as-built filing-lock header): the
  -- filing FOR SHARE vs the question writer's FOR UPDATE serialize on the filing row.
  if e.document_id is not null then
    v_filing:=clara._active_document_filing(e.document_id,e.source_doc_sha256,e.client_id,true);
    if v_filing<>e.filing_id then
      raise exception 'entry is not bound to the active filing' using errcode='CLR02';
    end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry for update;
  if e.status<>'draft' then
    -- The detail reason lets execute_rule_post distinguish THIS benign status race
    -- (a human approved/withdrew concurrently) from every other CLR10 it must NOT mask
    -- (FIX-6 / adversarial #12). Human callers ignore the additive detail unchanged.
    raise exception 'entry is not a draft' using errcode='CLR10',detail='{"reason":"not_a_draft"}';
  end if;
  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;

  if e.reversal_of is not null then
    perform 1 from clara.journal_entries where id=e.reversal_of for update;
    if exists(select 1 from clara.journal_entries
              where id=e.reversal_of and reversed_by is not null) then
      raise exception 'the original was already reversed' using errcode='CLR10';
    end if;
    if exists(select 1 from clara.journal_entries r
              where r.reversal_of=e.reversal_of and r.status='approved'
                and r.id<>p_entry) then
      raise exception 'the original was already reversed by an approved reversal'
        using errcode='CLR10';
    end if;
  end if;

  -- S7: the birth kind follows the stored proposal's TOP-LEVEL kind (the same value
  -- draft/revise/_resolve_counterparty used), falling back to the coding_kind default
  -- (customer for a sales filing). Keeps birth consistent with the resolution scope.
  v_kind:=coalesce(nullif(btrim(e.proposed_counterparty->>'kind'),''),
    case when e.coding_kind in ('sales_invoice','sales_credit_note')
         then 'customer' else 'vendor' end);
  if e.proposed_counterparty is not null then
    v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
    if v_fingerprint is distinct from e.match_fingerprint then
      raise exception 'counterparty match landscape changed; revise the draft'
        using errcode='CLR23';
    end if;
    if v_fingerprint->>'decision'='birth' then
      v_name:=btrim(e.proposed_counterparty->'new'->>'name');
      v_reg:=nullif(btrim(e.proposed_counterparty->'new'->>'registration_no'),'');
      v_tin:=nullif(btrim(e.proposed_counterparty->'new'->>'tin'),'');
      v_name_n:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]','','g'));
      v_reg_n:=case when v_reg is null then null else
        lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
      begin
        insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,
            registration_no,registration_normalized,tin,created_by)
          values(c.firm,e.client_id,v_kind,v_name,v_name_n,v_reg,v_reg_n,v_tin,c.actor)
          returning id into v_counterparty;
        v_created:=true;
      exception when unique_violation then
        v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
        if v_fingerprint is distinct from e.match_fingerprint then
          raise exception 'counterparty birth raced with a changed match landscape'
            using errcode='CLR23';
        end if;
        raise exception 'counterparty identity could not be resolved after birth race'
          using errcode='CLR23';
      end;
    else
      v_counterparty:=clara._canonical_counterparty(
        e.client_id,(v_fingerprint->>'counterparty_id')::uuid);
    end if;
    -- S7: stamp the control counterparty on payable OR receivable lines.
    update clara.journal_lines l set counterparty_id=v_counterparty
    from clara.coa_accounts a
    where l.entry_id=p_entry and a.client_id=l.client_id
      and a.account_code=l.account_code and a.account_class in ('payable','receivable');
  else
    select clara._canonical_counterparty(e.client_id,min(l.counterparty_id::text)::uuid)
      into v_counterparty
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class in ('payable','receivable')
        and l.counterparty_id is not null;
  end if;

  if v_counterparty is not null then
    perform pg_advisory_xact_lock(203005003,
      hashtext(e.client_id::text||':'||v_counterparty::text));
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
  select * into v_question from clara._open_question_blocks(
    e.client_id,e.filing_id,v_counterparty) limit 1;
  if found then
    raise exception 'an open question blocks this entry'
      using errcode='CLR26',detail=jsonb_build_object('question_id',v_question.question_id,
        'scope',v_question.scope_kind)::text;
  end if;

  if e.document_id is not null then
    v_state:=clara._invoice_fact_state(e.document_id);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'newer facts identify an unsupported currency' using errcode='CLR25';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'newer machine facts contradict the draft evidence'
          using errcode='CLR25';
      end if;
      if (e.flags ? 'amount_exception') and not (e.flags ? 'amount_override') then
        raise exception 'proposed total conflicts with the machine-corroborated total'
          using errcode='CLR21',detail='{"reason":"amount_conflict"}';
      end if;
    end if;
    if e.coding_kind='supplier_bill' and e.reversal_of is null
       and v_counterparty is not null then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      if v_invoice_id is not null and not (e.flags ? 'duplicate_override') then
        perform pg_advisory_xact_lock(203005005,
          hashtext(e.client_id::text||':'||v_counterparty::text||':'||v_invoice_id));
        if exists (
          select 1 from clara.journal_entries e2
          where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
            and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
            and e2.document_id is not null
            and exists (select 1 from clara.journal_lines l2
              where l2.entry_id=e2.id
                and clara._canonical_counterparty(e.client_id,l2.counterparty_id)
                    =v_counterparty)
            and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id
        ) then
          raise exception 'an approved bill already exists for this vendor and invoice number'
            using errcode='CLR21',detail='{"reason":"duplicate_bill"}';
        end if;
      end if;
    end if;
    -- S7: sales duplicate = the SAME hard approve-time refusal (customer + invoice
    -- number; fallback customer + date + total). Override-flagged like duplicate_bill.
    if e.coding_kind in ('sales_invoice','sales_credit_note') and e.reversal_of is null
       and v_counterparty is not null and not (e.flags ? 'duplicate_override') then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      perform pg_advisory_xact_lock(203005005,
        hashtext(e.client_id::text||':'||v_counterparty::text||':'||coalesce(v_invoice_id,'')));
      if exists (
        select 1 from clara.journal_entries e2
        where e2.client_id=e.client_id and e2.coding_kind in ('sales_invoice','sales_credit_note')
          and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
          and e2.document_id is not null
          and exists (select 1 from clara.journal_lines l2 where l2.entry_id=e2.id
            and clara._canonical_counterparty(e.client_id,l2.counterparty_id)=v_counterparty)
          and (
            (v_invoice_id is not null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id)
            or (v_invoice_id is null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_date')
                    =nullif(v_state->>'invoice_date','')
              and (clara._invoice_fact_state(e2.document_id)->>'total_cents')::bigint
                    =nullif(v_state->>'total_cents','')::bigint))
      ) then
        raise exception 'an approved sales invoice already exists for this customer'
          using errcode='CLR21',detail='{"reason":"duplicate_sales"}';
      end if;
    end if;
  end if;
  perform clara._assert_supplier_bill_shape(p_entry);
  perform clara._assert_sales_invoice_shape(p_entry);

  if clara.is_high_stakes(p_entry) then
    if e.last_human_editor is null then
      if p_attestation is null or btrim(p_attestation)='' then
        raise exception 'agent-made high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"attestation_required"}';
      end if;
      v_attest:=p_attestation;
    elsif e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'high-stakes entry needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif p_attestation is null or btrim(p_attestation)='' then
        raise exception 'solo high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      else
        v_attest:=p_attestation;
      end if;
    end if;
  end if;

  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,
    proposed_counterparty=null,match_fingerprint=null,
    checked_via_rule_id=v_checked_via_rule,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'reversal'),updated_at=now()
      where id=e.reversal_of and reversed_by is null;
  end if;

  -- H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only. A rule-posted approval
  -- (checked_via_rule_id set) writes NO sighting and triggers NO proposal — else
  -- rules would breed rules from their own output (WA2-R9). The v_seen pool also
  -- filters to human-checked entries (checked_via_rule_id is null).
  -- 0016 P2 (§3.1): sightings are SIDE-aware. The 0015 debit pool states
  -- side='debit' explicitly; income-class CREDIT legs additionally record
  -- side='credit' sightings — the evidence pool for the sales-direction
  -- autopost floors. The 3-sighting vendor_account auto-proposal stays
  -- side='debit'-scoped (pin P2). The H2 carve-out + reversal guard above are
  -- verbatim.
  if v_counterparty is not null and e.reversal_of is null and v_checked_via_rule is null then
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry,'debit'
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.debit_cents>0 and a.is_active
      on conflict on constraint uq_rule_sightings_mapping do nothing;
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry,'credit'
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.credit_cents>0 and a.is_active
        and a.account_type='income'
      on conflict on constraint uq_rule_sightings_mapping do nothing;

    -- ADV-2: the vendor_account auto-proposal breeds ONLY for canonical
    -- VENDOR-kind counterparties onto NON-CONTROL accounts — a customer's AR
    -- control debit sighting must never spawn a vendor_account rule (nor a
    -- blocking vendor question) binding a customer to the receivable control.
    for v_map in select distinct s.account_code from clara.rule_sightings s
        join clara.coa_accounts am on am.client_id=s.client_id and am.account_code=s.account_code
        where s.entry_id=p_entry and s.counterparty_id=v_counterparty and s.side='debit'
          and coalesce(am.account_class,'') not in ('payable','receivable')
          and exists(select 1 from clara.counterparties cpv
            where cpv.id=v_counterparty and cpv.kind='vendor'
              and cpv.merged_into is null and cpv.retired_at is null)
    loop
      select count(distinct s.entry_id)::int into v_seen
      from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
      where s.client_id=e.client_id and s.account_code=v_map.account_code and s.side='debit'
        and clara._canonical_counterparty(e.client_id,s.counterparty_id)=v_counterparty
        and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null;
      if v_seen=3 and not exists(select 1 from clara.coding_rules r
          where r.client_id=e.client_id and r.counterparty_id=v_counterparty
            and r.rule_type='vendor_account' and r.status in ('proposed','live')) then
        insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
            account_code,status,pinned,origin,content_hash,created_by)
          values(c.firm,e.client_id,'vendor_account',v_counterparty,v_map.account_code,
            'proposed',false,'proposed',encode(clara._hash(jsonb_build_object(
              'type','vendor_account','client',e.client_id,'counterparty',v_counterparty,
              'account_code',v_map.account_code)),'hex'),c.actor)
          returning id into v_rule;
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,
            counterparty_id,origin,question_text,status,opener_kind,opened_by,spawned_rule_id)
          values(c.firm,e.client_id,'vendor',v_counterparty,v_counterparty,
            'rule_proposal','Use account '||v_map.account_code||' for this vendor?',
            'open','human',c.actor,v_rule) returning id into v_question_id;
        perform clara._append_event(c.firm,'kb_rule.proposed',e.client_id,c.actor,null,null,
          null,null,null,jsonb_build_object('rule_id',v_rule,'question_id',v_question_id,
            'counterparty_id',v_counterparty,'account_code',v_map.account_code));
      end if;
    end loop;
  end if;

  perform clara._audit(c.firm,c.actor,null,null,'approve_entry',p_entry,
    jsonb_build_object('filing',e.filing_id,'counterparty',v_counterparty,'op_key',p_op_key,
      'checked_via_rule_id',v_checked_via_rule));
  if v_created then
    perform clara._append_event(c.firm,'counterparty.created',e.client_id,c.actor,null,null,
      null,null,null,jsonb_build_object('counterparty_id',v_counterparty));
  end if;
  perform clara._append_event(c.firm,'entry.approved',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  if e.reversal_of is not null then
    perform clara._append_event(c.firm,'entry.reversed',e.client_id,c.actor,null,null,
      e.reversal_of,null,null,'{}'::jsonb);
  end if;
  return clara._finish_op(c.firm,'approve_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'status','approved'));
end $$;
revoke all on function clara._approve_entry_core(jsonb,uuid,uuid,text,text) from public;

-- _tf_coding_rule_update CoR (P2): evidence_class joins the frozen content set
-- (the §3.3 control-1 class is BOUND into the signed rule); the transition set
-- gains live -> suspended_pending_resignature (the §3.3 control-9 executor
-- flip) and suspended -> retired (human cleanup). Everything else byte-identical.
create or replace function clara._tf_coding_rule_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'coding rules are historical' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id or new.client_id<>old.client_id
     or new.rule_type<>old.rule_type or new.counterparty_id<>old.counterparty_id
     or new.account_code<>old.account_code or new.origin<>old.origin
     or new.content_hash<>old.content_hash or new.created_by is distinct from old.created_by
     or new.created_at<>old.created_at
     or new.amount_cap_cents is distinct from old.amount_cap_cents
     or new.frequency_window is distinct from old.frequency_window
     or new.window_max_posts is distinct from old.window_max_posts
     or new.expires_at is distinct from old.expires_at
     or new.direction is distinct from old.direction
     or new.evidence_class is distinct from old.evidence_class
     or new.supersedes_rule_id is distinct from old.supersedes_rule_id then
    raise exception 'coding-rule content is immutable' using errcode='CLR08';
  end if;
  v_ok:=(old.status='proposed' and new.status in ('live','declined','retired'))
    or (old.status='live' and new.status in ('retired','suspended_pending_resignature'))
    or (old.status='suspended_pending_resignature' and new.status='retired');
  if new.status<>old.status and not v_ok then
    raise exception 'illegal coding-rule transition' using errcode='CLR27';
  end if;
  return new;
end $$;

-- ADV-5: the OCR six-sighting authority as ONE centralized predicate, called
-- at PROPOSAL, at SIGNING, and atomically at POSTING (under the client
-- serialization lock) — the floor is re-derived live, so reversing the
-- evidence after proposal strips the authority. Qualifying = human-approved
-- (never a rule's own output), unreversed, override-free, NON-FUTURE credit
-- sightings; distinct documents AND distinct stated invoice numbers (two docs
-- sharing a stated invoice_id collapse to one; a doc with no stated number
-- counts by document identity); posting-date span >= 60 days.
create function clara._ocr_sales_floor(p_client uuid, p_cp uuid, p_account text)
  returns table(qualifying int, distinct_docs int, distinct_invoices int, span_days int)
  language sql stable security definer set search_path=clara,pg_temp as $$
  select count(distinct s.entry_id)::int,
         count(distinct j.document_id)::int,
         count(distinct coalesce(
           nullif(clara._invoice_fact_state(j.document_id)->>'invoice_id',''),
           j.document_id::text))::int,
         (max(j.posting_date)-min(j.posting_date))::int
  from clara.rule_sightings s
  join clara.journal_entries j on j.id=s.entry_id
  where s.client_id=p_client and s.account_code=p_account and s.side='credit'
    and clara._canonical_counterparty(p_client,s.counterparty_id)=p_cp
    and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null
    and j.document_id is not null
    and j.posting_date<=current_date
    and not (j.flags ? 'amount_override') and not (j.flags ? 'duplicate_override');
$$;
revoke all on function clara._ocr_sales_floor(uuid,uuid,text) from public;

-- propose_autopost_rule CoR (same arity — new keys ride the jsonb): the
-- sales_autopost_deferred CLR27 refusal is REMOVED (the Wave-A2.1 lift,
-- WA21-R2); the sighting floor becomes DIRECTION-AWARE (side='credit' pool for
-- sales); a sales proposal must declare its evidence_class ('structured' |
-- 'ocr_sales', §3.3 control 1 — purchase stays classless); the OCR class
-- additionally requires >=6 qualifying human-approved credit sightings across
-- >=6 distinct documents whose human approvals span >=60 days, with
-- override-flagged entries + rule-posted outputs excluded, and never births a
-- counterparty. Bounds are the SAME as structured (WA21-R10, owner override).
create or replace function clara.propose_autopost_rule(p_proposal jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_cp uuid; v_id uuid; v_hash text;
  v_seen int; v_expires timestamptz; v_hs bigint;
  v_client uuid; v_counterparty uuid; v_account text; v_direction text;
  v_cap bigint; v_window text; v_maxposts int; v_rationale text; v_cap_raw text;
  v_side text; v_evc text; v_docs int; v_span_days int; v_hash_obj jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_proposal is null or jsonb_typeof(p_proposal)<>'object' then
    raise exception 'autopost proposal is malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  v_account:=nullif(btrim(p_proposal->>'account_code'),'');
  v_direction:=nullif(btrim(p_proposal->>'direction'),'');
  v_window:=coalesce(nullif(btrim(p_proposal->>'frequency_window'),''),'monthly');
  v_rationale:=nullif(btrim(p_proposal->>'rationale'),'');
  v_cap_raw:=nullif(btrim(p_proposal->>'amount_cap'),'');
  v_evc:=nullif(btrim(p_proposal->>'evidence_class'),'');
  begin
    v_client:=(p_proposal->>'client_id')::uuid;
    v_counterparty:=(p_proposal->>'counterparty_id')::uuid;
    v_maxposts:=coalesce((p_proposal->>'window_max_posts')::int,3);
    v_expires:=coalesce(nullif(btrim(p_proposal->>'expires_at'),'')::timestamptz,
                        now()+interval '12 months');
    v_cap:=case when v_cap_raw is null then null else clara._normalize_invoice_cents(v_cap_raw) end;
  exception when others then
    raise exception 'autopost proposal fields are malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end;
  if v_client is null or v_counterparty is null or v_account is null
     or v_direction not in ('purchase','sales') or v_cap is null or v_cap<=0
     or v_maxposts<=0 or v_window<>'monthly' then
    raise exception 'autopost rule is malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  -- ADV-6: the pinned bounds are NOT caller-widenable — monthly, <=3 posts per
  -- window, expiry within 12 months of proposal (structurally re-enforced by
  -- ck_coding_rules_autopost_bounds; re-verified at signing).
  if v_maxposts>3 or v_expires>now()+interval '12 months' then
    raise exception 'autopost bounds exceed the pinned envelope (monthly / <=3 posts / <=12-month expiry)'
      using errcode='CLR27',detail='{"reason":"bounds_exceeded"}';
  end if;
  -- 0016/P2: the evidence class is part of the SIGNED authority. A sales rule
  -- must declare 'structured' (MyInvois) or 'ocr_sales' (the §3.3 envelope); a
  -- purchase rule carries none (the 0015 purchase semantics are class-free).
  if v_direction='sales' and (v_evc is null or v_evc not in ('structured','ocr_sales')) then
    raise exception 'a sales autopost rule requires an evidence class'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  if v_direction='purchase' and v_evc is not null then
    raise exception 'a purchase autopost rule carries no evidence class'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  if not exists(select 1 from clara.clients where id=v_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'propose_autopost_rule',p_op_key,
    clara._hash(jsonb_build_object('client',v_client,'counterparty',v_counterparty,
      'account_code',v_account,'direction',v_direction,'cap',v_cap)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_cp:=clara._canonical_counterparty(v_client,v_counterparty);
  if v_cp is null or not exists(select 1 from clara.counterparties where id=v_cp
      and firm_id=c.firm and retired_at is null) then raise exception 'counterparty not found' using errcode='CLR11'; end if;
  if not exists(select 1 from clara.coa_accounts where client_id=v_client
      and account_code=v_account and is_active) then
    raise exception 'rule account is not postable'
      using errcode='CLR27',detail='{"reason":"account_not_postable"}';
  end if;
  -- cap ceiling visible at propose (min of rule cap and the firm high-stakes bound).
  select high_stakes_amount_cents into v_hs from clara.firms where id=c.firm;
  if v_hs is not null and v_cap>v_hs then
    raise exception 'autopost cap cannot exceed the firm high-stakes threshold'
      using errcode='CLR27',detail='{"reason":"cap_exceeds_high_stakes"}';
  end if;
  -- structural gaming guard, DIRECTION-AWARE (P2): >=3 congruent human-approved,
  -- unreversed, human-checked sightings on the direction-correct SIDE (purchase
  -- => 'debit', sales => 'credit'; never a rule's own output).
  v_side:=case when v_direction='sales' then 'credit' else 'debit' end;
  select count(distinct s.entry_id)::int into v_seen
  from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
  where s.client_id=v_client and s.account_code=v_account and s.side=v_side
    and clara._canonical_counterparty(v_client,s.counterparty_id)=v_cp
    and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null;
  if v_seen<3 then
    raise exception 'an autopost proposal needs at least 3 congruent human-approved sightings'
      using errcode='CLR27',detail='{"reason":"insufficient_evidence"}';
  end if;
  -- OCR admission floor (§3.3 control 6, pin P2; adjudication #8): >=6
  -- qualifying human-approved credit sightings across >=6 DISTINCT documents
  -- spanning >=60 days measured on POSTING_DATE; override-flagged entries +
  -- rule-posted outputs excluded; the counterparty must ALREADY be resolved
  -- (v_cp above — no birth in this lane, ever).
  if v_evc='ocr_sales' then
    -- ADV-5: the centralized predicate — the same floor is re-derived at
    -- signing and at posting.
    select f.qualifying,f.distinct_invoices,f.span_days
      into v_seen,v_docs,v_span_days
      from clara._ocr_sales_floor(v_client,v_cp,v_account) f;
    if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6
       or v_span_days is null or v_span_days<60 then
      raise exception 'an OCR-sales autopost proposal needs 6+ human-approved credit sightings across 6+ documents/invoice numbers spanning 60+ days'
        using errcode='CLR27',detail='{"reason":"insufficient_evidence"}';
    end if;
  end if;
  -- the evidence class is bound into the content hash for sales rules; a
  -- purchase hash stays byte-identical to 0015 (no key appended).
  v_hash_obj:=jsonb_build_object('type','autopost',
    'counterparty',v_cp,'account_code',v_account,'direction',v_direction,
    'cap',v_cap,'expires_at',v_expires);
  if v_evc is not null then
    v_hash_obj:=v_hash_obj||jsonb_build_object('evidence_class',v_evc);
  end if;
  v_hash:=encode(sha256(convert_to(v_hash_obj::text,'UTF8')),'hex');
  insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
      account_code,status,pinned,origin,content_hash,created_by,
      amount_cap_cents,frequency_window,window_max_posts,expires_at,direction,
      evidence_class)
    values(c.firm,v_client,'autopost',v_cp,v_account,'proposed',false,
      'authored',v_hash,c.actor,v_cap,v_window,v_maxposts,v_expires,v_direction,v_evc)
    returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'propose_autopost_rule',null,
    jsonb_build_object('rule',v_id,'client',v_client,'counterparty',v_cp,
      'direction',v_direction,'evidence_class',v_evc,'sightings',v_seen,
      'rationale',v_rationale,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.proposed',v_client,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',v_id,'counterparty_id',v_cp,'tier','autopost'));
  return clara._finish_op(c.firm,'propose_autopost_rule',p_op_key,
    jsonb_build_object('rule_id',v_id,'status','proposed'));
end $$;

-- sign_autopost_rule CoR (same arity/grant): ONLY the sales_autopost_deferred
-- refusal is removed (the lift). The admin+ floor, account/cap re-verification
-- and the one-live index race handling are byte-identical; the CHECK on
-- coding_rules structurally guarantees a sales rule carries its evidence class
-- before it can exist, so signing needs no extra class gate.
create or replace function clara.sign_autopost_rule(p_rule uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record; v_constraint text; v_hs bigint;
  v_seen int; v_docs int; v_span int;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_rule is null then raise exception 'rule is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'sign_autopost_rule',p_op_key,
    clara._hash(jsonb_build_object('rule',p_rule)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.coding_rules where id=p_rule for update;
  if not found or r.firm_id<>c.firm then raise exception 'rule not found' using errcode='CLR11'; end if;
  if r.rule_type<>'autopost' or r.status<>'proposed' then
    raise exception 'rule is not a proposed autopost rule'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  if not exists(select 1 from clara.coa_accounts where client_id=r.client_id
      and account_code=r.account_code and is_active) then
    raise exception 'rule account is not postable'
      using errcode='CLR27',detail='{"reason":"account_not_postable"}';
  end if;
  select high_stakes_amount_cents into v_hs from clara.firms where id=c.firm;
  if v_hs is not null and r.amount_cap_cents>v_hs then
    raise exception 'autopost cap cannot exceed the firm high-stakes threshold'
      using errcode='CLR27',detail='{"reason":"cap_exceeds_high_stakes"}';
  end if;
  -- ADV-6: the pinned bounds re-verified at signing (defense-in-depth beside
  -- the structural CHECK — a raw out-of-bounds proposal can never go live).
  if r.frequency_window is distinct from 'monthly'
     or r.window_max_posts not between 1 and 3
     or r.expires_at is null or r.expires_at>r.created_at+interval '12 months' then
    raise exception 'autopost bounds exceed the pinned envelope (monthly / <=3 posts / <=12-month expiry)'
      using errcode='CLR27',detail='{"reason":"bounds_exceeded"}';
  end if;
  -- ADV-5: the OCR sighting floor re-derived at SIGNING — evidence reversed
  -- after proposal strips the authority before it can go live.
  if r.direction='sales' and r.evidence_class='ocr_sales' then
    select f.qualifying,f.distinct_invoices,f.span_days into v_seen,v_docs,v_span
      from clara._ocr_sales_floor(r.client_id,
        clara._canonical_counterparty(r.client_id,r.counterparty_id),r.account_code) f;
    if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6 or v_span is null or v_span<60 then
      raise exception 'the OCR-sales sighting floor no longer holds (evidence reversed or lost since proposal)'
        using errcode='CLR27',detail='{"reason":"insufficient_evidence"}';
    end if;
  end if;
  begin
    update clara.coding_rules set status='live',signed_by=c.actor,signed_at=now() where id=p_rule;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_coding_rules_one_live_vendor' then
      raise exception 'a live rule already exists for this counterparty'
        using errcode='CLR27',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'sign_autopost_rule',null,
    jsonb_build_object('rule',p_rule,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.signed',r.client_id,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',p_rule,'tier','autopost'));
  return clara._finish_op(c.firm,'sign_autopost_rule',p_op_key,
    jsonb_build_object('rule_id',p_rule,'status','live'));
end $$;

-- execute_rule_post CoR (same arity; the login-direct ACL is preserved by the
-- CoR). The 0015 gate ladder is byte-identical; 0016 adds, in order:
--  * `cn_not_autopostable` — a sales_credit_note draft is NEVER autopostable
--    (named, replacing the incidental control-shape skip; P2(e)/P6);
--  * `purchase_sst_not_autopostable` — the P4 visibility leg carries NO
--    autopost sanction this wave (WA21-R1): a purchase draft with an
--    sst_purchase_cost leg skips by NAME before the generic enumeration;
--  * the §3.3 OCR envelope re-derivation (evidence_class='ocr_sales' only,
--    control 8 — re-derive EVERYTHING at post time): (a) polarity evidence =
--    documents.document_kind='invoice' set by the classifier/human (a done
--    doc_classify verdict row exists — persist's only-if-null default stamp
--    does NOT qualify; caller-selected coding_kind is never polarity evidence)
--    else `polarity_unverified`; (b) hard direction evidence = supplier
--    TIN/BRN hard-id match AND name/alias match to the client, and the buyer
--    must NOT resolve to the client (name-only direction stays human) else
--    `direction_unproven`; (c) corroboration = gross + invoice number + date +
--    explicit net + explicit tax (zero allowed, missing not) + exact
--    net+tax+rounding=gross + the amount-due anchor (= gross, single) else
--    `anchor_missing`; (d) the rule's counterparty is still a live resolved
--    CUSTOMER else `customer_unresolved`. Repeated (>=3 in 30 days) polarity/
--    direction skips flip the rule to status='suspended_pending_resignature'
--    + a notification (§3.3 control 9).
create or replace function clara.execute_rule_post(p_entry uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  e record; r record; v_direction text; v_kind text; v_fp jsonb;
  v_counterparty uuid; v_total bigint; v_window_start timestamptz; v_count int;
  v_result jsonb; v_run uuid; v_ctrl_total int; v_ctrl_ok int; v_detail text;
  v_state jsonb; v_gross bigint; v_tax bigint; v_ctrl_amount bigint;
  v_signed_ok int; v_signed_wrong int; v_sst_legs int; v_sst_amt bigint;
  v_round_legs int; v_round_imb bigint; v_outside_legs int;
  v_net bigint; v_round bigint; v_inv_id text; v_inv_date text;
  v_kind_doc text; v_fx uuid; v_sup_reg text; v_sup_name text;
  v_cust_reg text; v_cust_taxid text; v_cust_name text; v_client_name text;
  v_hard_ok boolean; v_name_ok boolean; v_buyer_hit boolean;
  v_due_c int; v_due_amt bigint; v_skips int; v_suspended boolean:=false;
  v_doc_lane text; v_doc_class text; v_verdict jsonb;
  v_cust_name_raw text; v_cust_reg_raw text; v_buyer_fp jsonb; v_buyer_id uuid;
  v_fseen int; v_fdocs int; v_fspan int;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into e from clara.journal_entries where id=p_entry;
  if not found then raise exception 'entry not found' using errcode='CLR11'; end if;

  if e.status<>'draft' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_a_draft');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
  end if;
  if e.coding_kind is null or e.document_id is null or e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_eligible_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_eligible_shape');
  end if;

  -- direction (client-aware) — an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction(e.document_id,e.client_id);
  exception when sqlstate 'CLR30' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'direction_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','direction_unresolved');
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_ambiguous');
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_unresolved');
  end if;
  v_counterparty:=clara._canonical_counterparty(e.client_id,(v_fp->>'counterparty_id')::uuid);

  -- match + LOCK the live autopost rule (count-and-post atomic per rule).
  select * into r from clara.coding_rules
    where client_id=e.client_id and counterparty_id=v_counterparty
      and direction=v_direction and rule_type='autopost' and status='live'
    for update;
  if not found then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'no_live_rule');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_live_rule');
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'high_stakes');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','high_stakes');
  end if;
  -- 0016 P2(e)/P6: CN autopost is IMPOSSIBLE — a sales_credit_note draft skips
  -- by NAME (the 0015 control-shape refusal was incidental; this is the law).
  if v_direction='sales' and e.coding_kind='sales_credit_note' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'cn_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','cn_not_autopostable');
  end if;
  -- 0016 P4 (WA21-R1): the sst_purchase_cost visibility leg is NOT sanctioned
  -- for autopost — human lanes only. A purchase draft carrying one skips by
  -- NAME before the generic account enumeration.
  if v_direction='purchase' and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost') then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'purchase_sst_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','purchase_sst_not_autopostable');
  end if;
  -- FIX-1+7 (adversarial laundering — COUNT+IDENTITY enumeration, REPLACING the v2
  -- Σ|dr−cr| tolerance). N tiny decoy legs could inflate a sum tolerance (each extra leg
  -- lifts the old greatest(5,n_legs) bound), and the old sst_output exemption was an
  -- untied free bucket. Instead the entry's legs must form EXACTLY the sanctioned set,
  -- verified by leg COUNT + account IDENTITY — there is NO aggregate tolerance to inflate.
  -- The post is REJECTED (control_shape / account_mismatch skip) if ANY of these fails:
  --   (a) EXACTLY ONE direction-correct control leg (purchase => one payable CREDIT;
  --       sales => one receivable DEBIT), whose amount = the stated gross when the facts
  --       state one (a control<>gross entry never auto-posts — the DB owns the number);
  --   (b) >= 1 leg to the rule's signed account on the direction-correct side, and ZERO
  --       signed-account legs on the wrong side;
  --   (c) sst_output is a SALES-side (output-tax) role ONLY (FIX-2 v4). On a SALES post it
  --       is a sanctioned role bounded to AT MOST ONE leg tied to the stated tax fact
  --       (invoice.tax_total). On a PURCHASE post it is NOT sanctioned at all — a purchase
  --       sst_output leg is an OUTSIDE leg (Malaysian purchase SST is expensed INTO cost,
  --       expense=gross; a separate sst leg is the item-7 laundering vector) → refuse (e).
  --   (d) AT MOST ONE rounding leg (special_acc_type='rounding'), |dr−cr| <= 5 sen;
  --   (e) ZERO legs to ANY OTHER account (every leg is one of the sanctioned roles above —
  --       a decoy leg to an unaccounted account, at ANY count or size, refuses — closes item
  --       1; on a purchase an sst_output leg lands here too — closes item 2). 0016: an
  --       sst_purchase_cost leg is never sanctioned either — the named skip above fires
  --       first on a purchase; on a sales draft it lands here as an outside leg.
  v_state := clara._invoice_fact_state(e.document_id);
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;

  -- (a) the single direction-correct control leg + its amount.
  select
    count(*) filter (where a.account_class in ('payable','receivable')),
    count(*) filter (where (v_direction='purchase' and a.account_class='payable'    and l.credit_cents>0)
                        or (v_direction='sales'    and a.account_class='receivable' and l.debit_cents>0)),
    coalesce(sum(case when v_direction='purchase' and a.account_class='payable'    then l.credit_cents
                      when v_direction='sales'    and a.account_class='receivable' then l.debit_cents
                      else 0 end),0)
    into v_ctrl_total, v_ctrl_ok, v_ctrl_amount
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_total<>1 or v_ctrl_ok<>1
     or (v_gross is not null and v_ctrl_amount<>v_gross) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'control_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','control_shape');
  end if;

  -- (b) signed-account legs by side; (c) sst_output legs + tied magnitude; (d) rounding
  -- legs + imbalance; (e) legs to an account OUTSIDE the four sanctioned roles. Every leg
  -- is classified by its account (join to coa_accounts) — count+identity, never a Σ bound.
  select
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.debit_cents>0) or (v_direction='sales' and l.credit_cents>0))),
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.credit_cents>0) or (v_direction='sales' and l.debit_cents>0))),
    count(*) filter (where coalesce(a.special_acc_type,'')='sst_output'),
    coalesce(sum(l.debit_cents+l.credit_cents) filter (where coalesce(a.special_acc_type,'')='sst_output'),0),
    count(*) filter (where coalesce(a.special_acc_type,'')='rounding'),
    coalesce(sum(abs(l.debit_cents-l.credit_cents)) filter (where coalesce(a.special_acc_type,'')='rounding'),0),
    count(*) filter (where coalesce(a.account_class,'') not in ('payable','receivable')
      and l.account_code<>r.account_code
      and coalesce(a.special_acc_type,'')<>'rounding'
      and not (v_direction='sales' and coalesce(a.special_acc_type,'')='sst_output'))
    into v_signed_ok, v_signed_wrong, v_sst_legs, v_sst_amt, v_round_legs, v_round_imb, v_outside_legs
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_signed_ok<1 or v_signed_wrong>0
     or v_outside_legs>0
     or v_sst_legs>1 or (v_sst_legs=1 and (v_tax is null or v_sst_amt<>v_tax))
     or v_round_legs>1 or v_round_imb>5 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'account_mismatch');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','account_mismatch');
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'over_cap');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','over_cap');
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'window_exhausted');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','window_exhausted');
  end if;
  if r.expires_at<=now() then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'expired');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','expired');
  end if;
  if e.revision_token is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'no_revision');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_revision');
  end if;

  -- FIX v5 (item 5 — CORROBORATION-REQUIRED to auto-post): the confidence ladder auto-posts
  -- ONLY DB-VERIFIED entries. Every rule gate above re-derives cap/window/shape, but the
  -- control-leg tie (a) only anchors to gross when gross is non-NULL. A NON-corroborated
  -- document — a blank / malformed / unreadable total, or ANY state short of Tier-A — leaves
  -- v_gross NULL, so the tie stays inert and an interactive wake draft (the runtime submits
  -- EVERY coded entry.drafted to this executor — rule-post.mjs, not only autodraft) could cite
  -- a non-total region, carry an ARBITRARY under-cap balanced amount, and be auto-posted with
  -- no verified anchor ("the DB owns every number"). Require the document fact-state's
  -- `corroborated` signal to be true before driving the post; otherwise SKIP `not_corroborated`
  -- and leave the entry in the human queue. This is the executor's ADMISSION gate, not a persist
  -- refusal: `invoice.total` still persists blank/non-corroborated at the write boundary
  -- (fail-closed, unchanged). A corroborated bill (gross verified ⇒ the (a) tie already fired)
  -- is unaffected — the positive path still auto-posts. Placed LAST so every specific rule-gate
  -- skip (control_shape / account_mismatch / over_cap / window_exhausted / expired / no_revision)
  -- still fires first for a shaped-but-non-corroborated draft; a CLEAN-shaped non-corroborated
  -- draft (the residual-5 laundering path) lands here.
  if not coalesce((v_state->>'corroborated')::boolean,false) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'not_corroborated');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_corroborated');
  end if;

  -- ADV-1: the DOCUMENT's ACTUAL evidence class, derived from its latest done
  -- facts task lane (the local no-egress MyInvois parse = 'structured'; the
  -- Azure OCR lane = 'ocr_sales') — NEVER from the rule label alone. A signed
  -- class that does not match the document's real extraction source is a named
  -- visible skip: an OCR document can never ride a 'structured' rule around
  -- the envelope, and an XML document never consumes an OCR authority.
  if v_direction='sales' then
    select t.lane into v_doc_lane
      from clara.document_processing_tasks t
      join clara.document_extractions x on x.document_id=t.document_id
        and x.engine_id=t.engine_id and x.version_n=t.version_n
        and x.engine_kind='invoice_facts' and x.status='done'
      where t.document_id=e.document_id
        and t.lane in ('invoice_facts','local_facts') and t.status='done'
      order by t.version_n desc,t.id desc limit 1;
    v_doc_class:=case v_doc_lane when 'local_facts' then 'structured'
                                 when 'invoice_facts' then 'ocr_sales' end;
    if v_doc_class is null or v_doc_class is distinct from r.evidence_class then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'evidence_class_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','evidence_class_mismatch','document_class',v_doc_class,
        'rule_class',r.evidence_class);
    end if;
  end if;

  -- 0016 §3.3: the OCR compensating-control envelope, RE-DERIVED at post time
  -- (control 8 — no trust in signing-time state).
  if v_direction='sales' and r.evidence_class='ocr_sales' then
    -- (a) positive polarity evidence (ADV-3: a done classifier row is not by
    -- itself positive evidence — the WINNING verdict must POSITIVELY say
    -- 'invoice'): the human correction outranks classifier verdicts; among
    -- classifier rows the newest version wins; the verdict must be
    -- high-confidence (>=0.8, never low_confidence) or human, and must agree
    -- with the CURRENT document_kind.
    select d2.document_kind into v_kind_doc from clara.documents d2 where d2.id=e.document_id;
    select x.envelope into v_verdict from clara.document_extractions x
      where x.document_id=e.document_id and x.engine_kind='doc_classify'
        and x.status='done'
      order by case when x.envelope->>'source'='human' then 0 else 1 end,
        x.version_n desc limit 1;
    if v_kind_doc is distinct from 'invoice'
       or v_verdict is null
       or (v_verdict->>'verdict_kind') is distinct from 'invoice'
       or coalesce((v_verdict->>'low_confidence')::boolean,false)
       or not ((v_verdict->>'source')='human'
               or coalesce((v_verdict->>'confidence')::numeric,0)>=0.8) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'polarity_unverified');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','polarity_unverified','rule_suspended',v_suspended);
    end if;
    -- (b) hard direction evidence.
    select x.id into v_fx from clara.document_extractions x
      where x.document_id=e.document_id and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc limit 1;
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_name';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_taxid from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_taxid';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=e.client_id;
    v_hard_ok:=v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg);
    v_name_ok:=v_sup_name is not null and (v_sup_name=v_client_name
      or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
          and al.retired_at is null and al.alias_normalized=v_sup_name));
    v_buyer_hit:=
      (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_reg))
      or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_taxid))
      or (v_cust_name is not null and (v_cust_name=v_client_name
        or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
            and al.retired_at is null and al.alias_normalized=v_cust_name)));
    if not (v_hard_ok and v_name_ok) or v_buyer_hit then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'direction_unproven');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','direction_unproven','rule_suspended',v_suspended);
    end if;
    -- (b2) ADV-4: stated-buyer <-> signed-counterparty CONGRUENCE. Control (b)
    -- proves only that the buyer is NOT the client; the invoice's stated buyer
    -- must ALSO resolve (kind-scoped, no birth ever) to the SAME canonical
    -- customer the signed rule names — an invoice billing Buyer B can never be
    -- posted through Customer A's authority. Absence, ambiguity, birth, or a
    -- registration contradiction is a named visible skip.
    select nullif(btrim(min(dr.text_content)),'') into v_cust_name_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select nullif(btrim(min(dr.text_content)),'') into v_cust_reg_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    v_buyer_id:=null;
    if v_cust_name_raw is not null then
      begin
        v_buyer_fp:=clara._resolve_counterparty(e.client_id,jsonb_strip_nulls(
          jsonb_build_object('kind','customer','new',jsonb_build_object(
            'name',v_cust_name_raw,'registration_no',v_cust_reg_raw))));
        if v_buyer_fp is not null and v_buyer_fp->>'decision'<>'birth'
           and (v_buyer_fp->>'counterparty_id') is not null then
          v_buyer_id:=clara._canonical_counterparty(e.client_id,
            (v_buyer_fp->>'counterparty_id')::uuid);
        end if;
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' then
        v_buyer_id:=null; -- ambiguity/contradiction => mismatch below
      end;
    end if;
    if v_buyer_id is null
       or v_buyer_id is distinct from clara._canonical_counterparty(e.client_id,r.counterparty_id) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'buyer_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','buyer_mismatch');
    end if;
    -- (c) full multi-anchor corroboration.
    v_net:=nullif(v_state->>'total_excl_tax_cents','')::bigint;
    v_round:=nullif(v_state->>'rounding_cents','')::bigint;
    v_inv_id:=nullif(v_state->>'invoice_id','');
    v_inv_date:=nullif(v_state->>'invoice_date','');
    select count(*)::int,min(dr.monetary_cents) into v_due_c,v_due_amt
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.amount_due';
    if v_gross is null or v_inv_id is null or v_inv_date is null
       or v_net is null or v_tax is null
       or (v_net+v_tax+coalesce(v_round,0))<>v_gross
       or v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'anchor_missing');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','anchor_missing');
    end if;
    -- (d) an EXISTING resolved customer, re-derived live (no birth ever).
    if not exists(select 1 from clara.counterparties cp where cp.id=r.counterparty_id
        and cp.client_id=e.client_id and cp.kind='customer'
        and cp.merged_into is null and cp.retired_at is null) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'customer_unresolved');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','customer_unresolved');
    end if;
    -- (e2) ADV-5: the sighting FLOOR re-derived atomically at post time, under
    -- the client serialization lock (the same advisory lock the approve core
    -- takes — reentrant in this transaction, so a concurrent reversal cannot
    -- slip between the floor check and the post). Evidence reversed since
    -- signing strips the live authority: a named visible skip.
    perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
    select f.qualifying,f.distinct_invoices,f.span_days into v_fseen,v_fdocs,v_fspan
      from clara._ocr_sales_floor(e.client_id,
        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;
    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or v_fspan is null or v_fspan<60 then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'floor_lost');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','floor_lost');
    end if;
  end if;

  -- Drive the SAME approve core with the rule identity. ONLY the benign races become
  -- skips (review M2): CLR06 (stale revision) and the CLR10 that is specifically the
  -- not-a-draft status race (a human approved/withdrew concurrently — detail reason
  -- 'not_a_draft'). FIX-6 (adversarial #12): any OTHER CLR10 — e.g. a shape-floor
  -- CLR10 like sst_account_missing — PROPAGATES honestly, never masked as not_a_draft.
  begin
    v_result:=clara._approve_entry_core(
      jsonb_build_object('actor',r.signed_by,'firm',e.firm_id,'checked_via_rule_id',r.id),
      p_entry,e.revision_token,null,p_op_key);
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%not_a_draft%' then
        raise;   -- propagate every non-race CLR10 (e.g. sst_account_missing)
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'not_a_draft');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','type_polarity_mismatch');
    when sqlstate 'CLR06' then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'stale_revision');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','stale_revision');
  end;

  -- Receipt (rule snapshot at post time, for the audit join) + the typed event.
  insert into clara.rule_post_runs(firm_id,client_id,rule_id,entry_id,posted_at,snapshot)
    values(e.firm_id,e.client_id,r.id,p_entry,now(),
      jsonb_build_object('rule_id',r.id,'account_code',r.account_code,'direction',r.direction,
        'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
        'window_max_posts',r.window_max_posts,'signed_by',r.signed_by,
        'content_hash',r.content_hash,'posted_total_cents',v_total,
        'evidence_class',r.evidence_class))
    returning id into v_run;
  perform clara._append_event(e.firm_id,'entry.rule_posted',e.client_id,r.signed_by,null,null,
    p_entry,e.document_id,null,jsonb_build_object('rule_id',r.id,'run_id',v_run,
      'counterparty_id',v_counterparty,'account_code',r.account_code));
  return jsonb_build_object('entry_id',p_entry,'status','posted','rule_id',r.id,'run_id',v_run);
end $$;

-- =====================================================================
-- B4b — ADV-2 (4a): LIVE-BOOKS REPAIR — the pre-0016 auto-proposal pool
-- admitted every active debit leg, so a CUSTOMER's receivable-control debits
-- could breed vendor_account rules (and open blocking vendor questions) on
-- live books. Retire (live) / decline (proposed) every vendor_account rule
-- whose counterparty is not a live canonical VENDOR or whose target account is
-- control-class; dismiss the questions they spawned; audit one explicit repair
-- record per firm. A no-op on empty books (the fresh-rig case).
-- =====================================================================
do $$
declare r record; v_n int:=0; v_firms uuid[]:='{}';
begin
  for r in
    select cr.id,cr.firm_id,cr.status,cr.created_by,
           cp.kind as cp_kind,coalesce(a.account_class,'') as acct_class
      from clara.coding_rules cr
      join clara.counterparties cp on cp.id=cr.counterparty_id
      left join clara.coa_accounts a on a.client_id=cr.client_id
        and a.account_code=cr.account_code
      where cr.rule_type='vendor_account' and cr.status in ('proposed','live')
        and (cp.kind<>'vendor' or cp.merged_into is not null or cp.retired_at is not null
             or coalesce(a.account_class,'') in ('payable','receivable'))
  loop
    if r.status='proposed' then
      update clara.coding_rules set status='declined',declined_by=r.created_by,
        declined_at=now(),
        decline_reason='0016 A21 repair: auto-proposal bound a '||r.cp_kind
          ||' / '||coalesce(nullif(r.acct_class,''),'non-control')||' account'
        where id=r.id;
    else
      update clara.coding_rules set status='retired',retired_at=now(),
        retire_reason='0016 A21 repair: vendor_account rule bound a '||r.cp_kind
          ||' / '||coalesce(nullif(r.acct_class,''),'non-control')||' account'
        where id=r.id;
    end if;
    update clara.open_questions set status='dismissed',resolved_at=now(),
        resolution_text='0016 A21 repair: the spawning vendor_account rule was invalid (customer/control-class pool defect) and has been '
          ||case when r.status='proposed' then 'declined' else 'retired' end
      where spawned_rule_id=r.id and status='open';
    v_n:=v_n+1;
    if not r.firm_id=any(v_firms) then v_firms:=v_firms||r.firm_id; end if;
    perform clara._audit(r.firm_id,null,null,null,'a21_repair_vendor_account_rule',null,
      jsonb_build_object('rule_id',r.id,'prior_status',r.status,
        'counterparty_kind',r.cp_kind,'account_class',nullif(r.acct_class,''),
        'migration','0016_a21_compliance_watch'));
  end loop;
  if v_n>0 then
    raise notice '0016 A21 repair: % customer/control-class vendor_account rule(s) retired/declined across % firm(s)',v_n,array_length(v_firms,1);
  end if;
end $$;

-- =====================================================================
-- B4c — ADV-6: the pinned autopost bounds become STRUCTURAL. Pre-existing
-- out-of-bounds authorities are repaired first (a live one is SUSPENDED
-- pending re-signature — its content is hash-frozen, so clamping is not
-- legal; a proposed one is declined), then the CHECK lands. Terminal rows
-- (declined/retired/suspended) are exempt so history survives.
-- =====================================================================
do $$
declare r record;
begin
  for r in select cr.* from clara.coding_rules cr
      where cr.rule_type='autopost' and cr.status in ('proposed','live')
        and (cr.frequency_window is distinct from 'monthly'
             or cr.window_max_posts not between 1 and 3
             or cr.expires_at is null
             or cr.expires_at>cr.created_at+interval '12 months')
  loop
    if r.status='proposed' then
      update clara.coding_rules set status='declined',declined_by=r.created_by,
        declined_at=now(),
        decline_reason='0016 A21 repair: proposal exceeds the pinned autopost bounds (monthly / <=3 posts / <=12-month expiry)'
        where id=r.id;
    else
      update clara.coding_rules set status='suspended_pending_resignature'
        where id=r.id;
    end if;
    perform clara._audit(r.firm_id,null,null,null,'a21_repair_autopost_bounds',null,
      jsonb_build_object('rule_id',r.id,'prior_status',r.status,
        'frequency_window',r.frequency_window,'window_max_posts',r.window_max_posts,
        'expires_at',r.expires_at,'migration','0016_a21_compliance_watch'));
  end loop;
end $$;
alter table clara.coding_rules add constraint ck_coding_rules_autopost_bounds check (
  rule_type<>'autopost'
  or status in ('declined','retired','suspended_pending_resignature')
  or (frequency_window='monthly'
      and window_max_posts between 1 and 3
      and expires_at is not null
      and expires_at<=created_at+interval '12 months'));

-- =====================================================================
-- B4d — ADV-12 (4b): client aliases are now a LOAD-BEARING OCR direction
-- control (§3.3 control 3) — the writer must store the RESOLVER's exact
-- strip-normalization, and the existing rows must be brought canonical.
-- add_client_alias CoR (same arity, ACL preserved): normalize with
-- lower(regexp_replace(...,'[^a-zA-Z0-9]','','g')) and refuse an alias that
-- normalizes to empty. Preflight repair: a stored non-canonical alias is
-- retired (identity rows are immutable) and re-inserted canonical unless the
-- canonical form already lives for the firm — every move audited.
-- =====================================================================
create or replace function clara.add_client_alias(p_client uuid, p_alias_normalized text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_norm text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_norm := lower(regexp_replace(btrim(coalesce(p_alias_normalized,'')),'[^a-zA-Z0-9]','','g'));
  if v_norm = '' then
    raise exception 'alias normalizes to empty (letters/digits required)' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'add_client_alias',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'alias',v_norm)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists (select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  insert into clara.client_aliases(firm_id,client_id,alias_normalized,added_by)
    values(c.firm,p_client,v_norm,c.actor) returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'add_client_alias',null,
    jsonb_build_object('client',p_client,'alias',v_id,'op_key',p_op_key));
  return clara._finish_op(c.firm,'add_client_alias',p_op_key,jsonb_build_object('alias_id',v_id));
end $$;

do $$
declare r record; v_norm text; v_new uuid;
begin
  for r in select a.* from clara.client_aliases a
      where a.retired_at is null
        and a.alias_normalized
            <> lower(regexp_replace(btrim(a.alias_normalized),'[^a-zA-Z0-9]','','g'))
  loop
    v_norm := lower(regexp_replace(btrim(r.alias_normalized),'[^a-zA-Z0-9]','','g'));
    update clara.client_aliases set retired_at=now(),retired_by=r.added_by
      where id=r.id;
    v_new := null;
    if v_norm <> '' and not exists (select 1 from clara.client_aliases a2
        where a2.firm_id=r.firm_id and a2.alias_normalized=v_norm
          and a2.retired_at is null) then
      insert into clara.client_aliases(firm_id,client_id,alias_normalized,added_by)
        values(r.firm_id,r.client_id,v_norm,r.added_by) returning id into v_new;
    end if;
    perform clara._audit(r.firm_id,null,null,null,'a21_repair_client_alias',null,
      jsonb_build_object('retired_alias',r.id,'stored',r.alias_normalized,
        'canonical',nullif(v_norm,''),'replacement',v_new,
        'collision',v_norm<>'' and v_new is null,
        'migration','0016_a21_compliance_watch'));
  end loop;
end $$;

-- =====================================================================
-- B5 — P3: THE CLASSIFIER GATE (WA21-R7). classify_document is the SINGLE
-- audited writer for a classifier verdict: it settles a CLAIMED classify task
-- (a task is not required — WA21-R11's ceremony re-classifies already-extracted
-- docs), persists the verdict as a document_extractions row
-- (engine_kind='doc_classify', OUTSIDE the AB-3 set, NO regions), sets
-- documents.document_kind at confidence >= 0.8 (overwriting a mis-stamp — the
-- WA21-R11 backfill path), and emits 'document.classified'. LOW confidence
-- (< 0.8) leaves the kind untouched and opens the ADR-023 review question
-- (origin='classification') per active filing instead — and emits NO
-- document.classified event, so the facts-gate consumer can never loop.
-- consent_evidence is a PROTECTED class in both directions (0014's egress-path
-- ownership). GRANT clara_runtime ONLY; the agent role gets nothing.
-- =====================================================================
create function clara.classify_document(p_document uuid, p_kind text,
    p_confidence numeric, p_engine_id text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  d record; t record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
  f record; v_q uuid; v_questions jsonb:='[]'::jsonb; v_set boolean:=false;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into d from clara.documents where id=p_document;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_engine_id is null or p_engine_id not like 'clara-classify-%' then
    raise exception 'classifier engine must carry the clara-classify- prefix' using errcode='CLR10';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>1 then
    raise exception 'classifier confidence is malformed' using errcode='CLR10';
  end if;
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','other') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  -- 0014: consent evidence is a legal artifact owned by the egress-consent path;
  -- the classifier may neither assign nor overwrite it.
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  v_dedupe:=clara._reserve_op(d.firm_id,'classify_document',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
      'confidence',p_confidence,'engine',p_engine_id)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- settle the claimed classify task, when one is running (the enqueue path).
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane='classify' and status='running'
    order by id limit 1 for update;
  if found then
    update clara.document_processing_tasks set status='done',finished_at=now()
      where id=t.id;
  end if;

  -- the verdict row: engine_kind='doc_classify', NO regions (the verdict rides
  -- the envelope — nothing here can ever collide with an attribution pattern).
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id=p_engine_id;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(d.firm_id,p_document,p_engine_id,'doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',p_confidence,
        'low_confidence',p_confidence<0.8,'source','classifier'))
    returning id into v_ext;

  v_prior:=d.document_kind;
  if p_confidence>=0.8 then
    update clara.documents set document_kind=p_kind where id=p_document;
    v_set:=true;
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,'op_key',p_op_key));
    perform clara._append_event(d.firm_id,'document.classified',null,null,null,null,
      null,p_document,null,
      jsonb_build_object('document_kind',p_kind,'confidence',p_confidence,
        'engine_id',p_engine_id,'extraction_id',v_ext,'prior_kind',v_prior,
        'source','classifier'));
  else
    for f in select df.client_id,df.id as filing_id from clara.document_filings df
        where df.document_id=p_document and df.retired_at is null loop
      if not exists(select 1 from clara.open_questions q
          where q.client_id=f.client_id and q.document_id=p_document
            and q.origin='classification' and q.status='open') then
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,document_id,
            origin,question_text,status,opener_kind,opened_by)
          values(d.firm_id,f.client_id,'document',p_document,p_document,'classification',
            'What kind of document is this? The classifier was not confident ('
              ||round(p_confidence*100)::text||'%; best guess: '||p_kind||').',
            'open','wake',null)
          returning id into v_q;
        v_questions:=v_questions||to_jsonb(v_q);
        perform clara._append_event(d.firm_id,'open_question.opened',f.client_id,null,null,null,
          null,p_document,null,
          jsonb_build_object('question_id',v_q,'origin','classification'));
      end if;
    end loop;
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,
        'low_confidence',true,'questions',v_questions,'op_key',p_op_key));
  end if;
  return clara._finish_op(d.firm_id,'classify_document',p_op_key,
    jsonb_build_object('document_id',p_document,'extraction_id',v_ext,
      'document_kind',case when v_set then p_kind else v_prior end,
      'kind_set',v_set,'confidence',p_confidence,'questions',v_questions));
end $$;
revoke all on function clara.classify_document(uuid,text,numeric,text,text) from public;

-- set_document_kind (bookkeeper+): the HUMAN override/correction lane. The
-- attestation ALSO lands as a doc_classify extraction row (engine
-- 'clara-classify-human:v1') so the OCR-sales polarity evidence has ONE
-- structural source: a done doc_classify verdict (classifier or human) — never
-- persist's only-if-null default stamp. consent_evidence protected both ways.
create function clara.set_document_kind(p_document uuid, p_kind text,
    p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; wk record; d record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot set a document kind' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_document is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'a document and a reason are required' using errcode='CLR10';
  end if;
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','other') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  select * into d from clara.documents where id=p_document;
  if not found or d.firm_id<>c.firm then
    raise exception 'document not in your firm' using errcode='CLR11';
  end if;
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'set_document_kind',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_prior:=d.document_kind;
  update clara.documents set document_kind=p_kind where id=p_document;
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id='clara-classify-human:v1';
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(c.firm,p_document,'clara-classify-human:v1','doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',1,
        'source','human','actor',c.actor,'reason',btrim(p_reason)))
    returning id into v_ext;
  perform clara._audit(c.firm,c.actor,null,null,'set_document_kind',null,
    jsonb_build_object('document',p_document,'kind',p_kind,'prior_kind',v_prior,
      'reason',p_reason,'extraction',v_ext,'op_key',p_op_key));
  perform clara._append_event(c.firm,'document.classified',null,c.actor,null,null,
    null,p_document,null,
    jsonb_build_object('document_kind',p_kind,'prior_kind',v_prior,
      'extraction_id',v_ext,'source','human'));
  return clara._finish_op(c.firm,'set_document_kind',p_op_key,
    jsonb_build_object('document_id',p_document,'document_kind',p_kind,
      'prior_kind',v_prior,'extraction_id',v_ext));
end $$;
revoke all on function clara.set_document_kind(uuid,text,text,text) from public;

-- _enqueue_invoice_facts_core CoR (P3, same arity, owner-only): the consent-
-- evidence exemption stays FIRST VERBATIM (the 0014 tail assert, re-asserted in
-- 0016's tail). Then the KIND gate: invoice/credit_note/debit_note + pdf/image
-- -> the Azure invoice_facts lane; xml -> the local MyInvois lane (XML stays
-- rule-classified, WA21-R7 — a NULL-kind xml never waits on the classifier);
-- any OTHER kind -> a 'skipped_kind' receipt; a NULL-kind pdf/image ->
-- ENQUEUE CLASSIFY FIRST (the attempt-cap/failed-task pattern reused; the
-- facts enqueue re-fires on 'document.classified' via the runtime consumer). A
-- done classify verdict that left the kind NULL is the low-confidence hold —
-- returned as 'classify_low_confidence', never re-looped.
create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text;
begin
  select * into d from clara.documents where id=p_document;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — never facts-extracted.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  -- 0015: mime chooses the engine family. 0016 (P3/WA21-R7): the DOCUMENT KIND
  -- gates the facts engines — only invoice-shaped kinds reach invoice_facts;
  -- a NULL kind classifies FIRST; xml stays rule-classified into the local lane.
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    if d.document_kind is null then
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';
    elsif d.document_kind in ('invoice','credit_note','debit_note') then
      v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';
    else
      -- (adjudication #11): the skipped_kind receipt lives on the task trail —
      -- a terminal failed row (never claimed, attempt_count 0 so it never
      -- consumes attempts), reused idempotently on re-invocation.
      select id into v_task from clara.document_processing_tasks
        where document_id=p_document and lane='invoice_facts'
          and status='failed' and error_code='skipped_kind'
        order by id limit 1;
      if v_task is null then
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane='invoice_facts';
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
            v_version,'invoice_facts','failed','skipped_kind',now())
          returning id into v_task;
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','skipped_kind','document_kind',d.document_kind);
    end if;
  elsif lower(coalesce(d.mime_type,'')) in ('application/xml','text/xml') then
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
  else
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  if v_lane='classify' then
    -- a DONE classify verdict with the kind still NULL = the low-confidence
    -- hold: a human resolves it (set_document_kind / the review question);
    -- never re-enqueue in a loop.
    if exists(select 1 from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='doc_classify'
          and e.status='done') then
      return jsonb_build_object('document_id',p_document,'status','classify_low_confidence');
    end if;
  else
    select e.id into v_task from clara.document_extractions e
      where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
      order by e.version_n desc limit 1;
    if v_task is not null then
      return jsonb_build_object('document_id',p_document,'status','already_completed',
        'extraction_id',v_task);
    end if;
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane;
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,v_engine,'{}'::jsonb,
        v_version,v_lane,'failed','attempt_cap',now()) returning id into v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,v_engine,'{}'::jsonb,
      v_version,v_lane,'queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    select id,status into v_task,t.status from clara.document_processing_tasks
      where document_id=p_document and lane=v_lane
        and status in ('queued','held_egress','running') order by id limit 1;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',t.status);
  end if;
  -- Only the Azure lane consumes the page budget; classify + the local parse
  -- reserve nothing.
  if v_lane='invoice_facts' then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;

-- persist_invoice_facts CoR (P3, same arity, ACL preserved): the ONLY change is
-- the document_kind stamp becoming ONLY-IF-NULL (WA21-R7: persist stops
-- stamping unconditionally — a classifier/human verdict is never overwritten by
-- the facts writer's default). Everything else is byte-identical to 0015.
create or replace function clara.persist_invoice_facts(p_task uuid, p_fields jsonb,
    p_raw_sha256 text, p_normalization_version text, p_pages_used int,
    p_envelope jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_ext uuid; v_existing uuid; v_entry uuid; v_date date;
  elem jsonb; v_path text; v_raw text; v_page int; v_conf numeric;
  v_cents bigint; v_region uuid; v_token uuid;
  v_newstate jsonb; v_p_payable bigint; v_p_expense bigint;
  v_eflags jsonb; v_ekind text;
begin
  select * into t from clara.document_processing_tasks where id=p_task;
  if not found or t.lane not in ('invoice_facts','local_facts') then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if jsonb_typeof(p_fields)<>'array' or p_raw_sha256 !~ '^[0-9a-f]{64}$'
     or p_normalization_version is null or btrim(p_normalization_version)=''
     or p_pages_used is null or p_pages_used<0 then
    raise exception 'invoice-facts payload is malformed' using errcode='CLR10';
  end if;

  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null
    order by f.id for update;
  perform 1 from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id for update of e;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'invoice-facts task is not running' using errcode='CLR16';
  end if;

  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,
      'invoice_facts',t.version_n,'done',p_pages_used,
      coalesce(p_envelope,'{}'::jsonb) || jsonb_build_object('raw_sha256',p_raw_sha256,
        'normalization_version',p_normalization_version,
        'field_count',jsonb_array_length(p_fields)))
    returning id into v_ext;

  for elem in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(elem)<>'object' or nullif(elem->>'field_path','') is null
       or not (elem ? 'page') or not (elem ? 'polygon') then
      raise exception 'invoice-facts field is malformed' using errcode='CLR10';
    end if;
    v_path:=elem->>'field_path';
    if v_path not in ('invoice.total','invoice.amount_due','invoice.currency',
        'invoice.vendor_name','invoice.vendor_registration','invoice.invoice_id',
        'invoice.invoice_date','invoice.deposit',
        'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
        'invoice.type_code','invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid') then
      raise exception 'unsupported invoice field_path %',v_path using errcode='CLR10';
    end if;
    begin
      v_page:=(elem->>'page')::int;
      v_conf:=(elem->>'confidence')::numeric;
    exception when others then
      raise exception 'invoice-facts page/confidence is malformed' using errcode='CLR10';
    end;
    if v_page<1 or v_conf<0 or v_conf>1
       or jsonb_typeof(elem->'polygon') not in ('array','object') then
      raise exception 'invoice-facts locator/confidence is invalid' using errcode='CLR10';
    end if;
    v_raw:=elem->>'value_raw';
    v_cents:=case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
                  'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
                  then clara._normalize_invoice_cents(v_raw) else null end;
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
      values(t.firm_id,v_ext,'page_polygon',
        jsonb_build_object('page',v_page,'polygon',elem->'polygon'),
        v_path,v_raw,v_conf,
        case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
             'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
             then v_raw end,v_cents)
      returning id into v_region;
    if v_path='invoice.invoice_date' and v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin v_date:=v_raw::date; exception when others then v_date:=null; end;
    end if;
  end loop;

  -- FIX-2/3/4 + FIX-3/4/5 v4 (the DB owns the number — REJECT bad facts at the WRITE BOUNDARY
  -- rather than min()-selecting one at read time, where SQL NULL semantics silently drop a
  -- blank). All checks are inert for the Azure/OCR corpus (one region per field, no rounding
  -- fact, no conflicts) and for the MyInvois parser (mapFactsFields emits each path at most
  -- once + always a type_code), so the AP exact-diff and the live local_facts producer are
  -- unaffected.
  --   (a) CONFLICTING duplicates, UNIFORM over EVERY per-field fact: a field appearing more
  --     than once with ANY differing value — INCLUDING a blank/NULL vs a real value — is a
  --     contradiction the DB refuses; IDENTICAL duplicates collapse. The v3 checks used
  --     count(distinct <value>), which IGNORES a NULL/blank (SQL semantics) — so a crafted
  --     ['', real] pair slipped past and min() then selected the blank -> NULL, re-opening
  --     polarity (type_code) / direction (customer_taxid) / duplicate-bill (invoice_id/date).
  --     Coalescing to a control-char SENTINEL (chr(1), never a real cents/text value) makes
  --     the blank a DISTINCT value, so ['', '02'] / ['', clientTIN] / ['', 'N/A'] all conflict.
  --     Monetary fields compare on normalized cents; text fields on the trimmed value. The
  --     text set now also covers invoice_id / invoice_date / tax_breakdown / myinvois_* (a
  --     conflicting id/date/breakdown was otherwise min-selected past the guard).
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.total','invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
    group by r.field_path
    having count(distinct coalesce(r.monetary_cents::text, chr(1))) > 1
  ) or exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.type_code','invoice.currency','invoice.vendor_name',
        'invoice.vendor_registration','invoice.customer_name','invoice.customer_registration',
        'invoice.customer_taxid','invoice.invoice_id','invoice.invoice_date',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid')
    group by r.field_path
    having count(distinct coalesce(nullif(btrim(r.text_content),''), chr(1))) > 1
  ) then
    raise exception 'invoice-facts payload carries conflicting duplicate facts for a single field'
      using errcode='CLR10';
  end if;
  --   (b) a PRESENT-but-malformed monetary value (raw text stated, cents normalize to NULL)
  --     is REFUSED for every REQUIRED monetary field — never silently treated as zero or
  --     "not stated" (item 5). Covers amount_due / deposit ('N/A' -> NULL was accepted as
  --     "no due" and defaulted deposit to 0, re-opening the total/deposit corroboration
  --     guards) and total_excl_tax / tax_total / rounding (a stated-but-unparseable component
  --     is a data error). NB: invoice.total is DELIBERATELY EXCLUDED — an unreadable OCR total
  --     still persists (non-corroborated: v_total NULL => corroborated=false, fail-closed),
  --     exactly as before; a blank (empty) raw is "not stated" and is unaffected (nullif
  --     drops it, so an omitted/empty field never trips this).
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding')
      and nullif(btrim(r.monetary_raw),'') is not null and r.monetary_cents is null
  ) then
    raise exception 'invoice-facts monetary value is malformed' using errcode='CLR10';
  end if;
  --   (2c) a local-facts (MyInvois structured) payload MUST state a type_code — a structured
  --     e-invoice with no document type cannot be polarity-bound. OCR/Azure (invoice_facts)
  --     carry no type_code and are unaffected.
  if t.lane='local_facts'
     and not exists(select 1 from clara.document_regions
       where extraction_id=v_ext and field_path='invoice.type_code'
         and nullif(btrim(text_content),'') is not null) then
    raise exception 'a local-facts payload must state invoice.type_code' using errcode='CLR10';
  end if;

  -- Only the Azure lane carries a processing-call reservation; the local parse is free.
  if t.lane='invoice_facts' then
    perform clara._settle_processing_call(p_task,p_pages_used);
  end if;
  update clara.document_processing_tasks set status='done',vendor_op_ref=p_raw_sha256,
    finished_at=now() where id=p_task;
  select * into d from clara.documents where id=t.document_id;
  -- 0016 (P3/WA21-R7): the kind stamp is ONLY-IF-NULL — the facts writer's
  -- lane default never overwrites a classifier verdict or a human attestation.
  update clara.documents set
    document_kind=coalesce(document_kind,
      case when t.lane='local_facts' then 'e_invoice_xml' else 'invoice' end),
    financial_date=coalesce(v_date,financial_date) where id=t.document_id;

  v_newstate:=clara._invoice_fact_state(t.document_id);
  for v_entry in
    select e.id from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id
  loop
    select coding_kind,coalesce(flags,'{}'::jsonb) into v_ekind,v_eflags
      from clara.journal_entries where id=v_entry;
    v_eflags:=v_eflags - 'amount_exception' - 'amount_override';
    if v_ekind='supplier_bill'
       and coalesce((v_newstate->>'corroborated')::boolean,false) then
      select coalesce(sum(l.credit_cents),0) into v_p_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_p_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_p_payable<>(v_newstate->>'total_cents')::bigint
         or v_p_expense<>(v_newstate->>'total_cents')::bigint then
        v_eflags:=v_eflags||jsonb_build_object('amount_exception',jsonb_build_object(
          'machine_total_cents',(v_newstate->>'total_cents')::bigint,
          'proposed_cents',v_p_payable,
          'fact_hash',v_newstate->>'total_fact_hash','at',now()));
      end if;
    end if;
    update clara.journal_entries set revision_token=gen_random_uuid(),
      flags=v_eflags,updated_at=now()
      where id=v_entry and status='draft' returning revision_token into v_token;

    insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
        revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
      select j.firm_id,j.client_id,j.id,
        coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
          where r.entry_id=j.id),0),v_token,'facts',null,'facts_rotated',
        to_jsonb(j)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
        coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
          'account_code',l.account_code,'debit_cents',l.debit_cents,
          'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
            else 'credit' end,'counterparty_id',l.counterparty_id,
          'description',l.description) order by l.line_no)
          from clara.journal_lines l where l.entry_id=j.id),'[]'::jsonb),
        (select rd.id from clara.rule_decisions rd where rd.entry_id=j.id
          order by rd.created_at desc,rd.id desc limit 1),
        coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
          'region_id',ev.region_id,'fact_hash',ev.fact_hash,
          'provenance_tier',ev.provenance_tier) order by ev.id)
          from clara.entry_evidence ev where ev.entry_id=j.id),'[]'::jsonb)
      from clara.journal_entries j where j.id=v_entry;
  end loop;
  perform clara._audit(t.firm_id,null,null,null,'persist_invoice_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,
      'version',t.version_n,'pages',p_pages_used));
  perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_ext,'version_n',t.version_n));
  return jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status','done');
end $$;

-- persist_document_extraction CoR (P3 guard, same arity, ACL preserved): ONE
-- added refusal — a classify-lane task can never be settled here. Without it a
-- classify task would fall into the lane->engine_kind default and be persisted
-- as engine_kind='structured_parse', an ATTRIBUTION-VISIBLE surface (AB-3).
-- classify tasks settle ONLY via classify_document. Byte-identical otherwise.
create or replace function clara.persist_document_extraction(p_task uuid, p_status text, p_page_count int,
    p_envelope jsonb, p_regions jsonb, p_error_code text, p_vendor_op_ref text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'persist_document_extraction',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'status',p_status,'pages',p_page_count,
      'envelope',p_envelope,'regions',p_regions,'error',p_error_code,'vendor',p_vendor_op_ref)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_status not in ('done','failed') then raise exception 'extraction status must be done/failed' using errcode='CLR10'; end if;
  if t.lane='none' then raise exception 'store-only tasks do not create extractions' using errcode='CLR16'; end if;
  -- 0016 P3: classify verdicts are settled ONLY by classify_document (the
  -- audited writer) — never through the generic persist path (which would
  -- stamp an attribution-visible engine_kind).
  if t.lane='classify' then
    raise exception 'classify tasks are settled by classify_document' using errcode='CLR16';
  end if;
  v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,v_ekind,
      t.version_n,p_status,p_page_count,coalesce(p_envelope,'{}'::jsonb))
    on conflict(document_id,engine_id,version_n) do nothing returning id into v_ext;
  if v_ext is null then
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n;
  elsif p_status='done' then
    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      if v_ekind='structured_parse'
         and (lower(coalesce(elem->>'field_path','')) like '%tin%'
           or lower(coalesce(elem->>'field_path','')) like '%ssm%'
           or lower(coalesce(elem->>'field_path','')) like '%brn%'
           or lower(coalesce(elem->>'field_path','')) like '%account%')
         and lower(coalesce(elem->>'field_path','')) not in
             ('myinvois.supplier_tin','myinvois.supplier_brn') then
        raise exception 'structured_parse attribution field_path % is not on the allowlist',
          elem->>'field_path'
          using errcode='CLR10',detail='{"reason":"attribution_field_not_allowed"}';
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',(elem->>'monetary_cents')::bigint);
    end loop;
  end if;
  update clara.document_processing_tasks set status=p_status,error_code=case when p_status='failed' then p_error_code end,
    vendor_op_ref=p_vendor_op_ref,finished_at=now() where id=p_task;
  update clara.documents set extraction_status=p_status,page_count=p_page_count where id=t.document_id;
  if p_status='done' then perform clara._settle_document_reservation(t.firm_id,p_task,coalesce(p_page_count,0));
  else perform clara._refund_document_reservation(t.firm_id,
    (select intake_id from clara.document_ingest_reservations where task_id=p_task),coalesce(p_error_code,'engine_error')); end if;
  perform clara._audit(t.firm_id,null,null,null,'persist_document_extraction',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,'status',p_status,'op_key',p_op_key));
  v_event:=case when p_status='done' then 'document.extraction_completed' else 'document.extraction_failed' end;
  perform clara._append_event(t.firm_id,v_event,null,null,null,null,null,t.document_id,null,
    jsonb_build_object('extraction_id',v_ext,'engine_id',t.engine_id,'version_n',t.version_n));
  return clara._finish_op(t.firm_id,'persist_document_extraction',p_op_key,
    jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status',p_status));
end $$;

-- =====================================================================
-- B6 — P4: _assert_supplier_bill_shape CoR (same arity). The 0015 body is
-- byte-identical EXCEPT one added block: a supplier bill MAY now carry AT MOST
-- ONE sst_purchase_cost DEBIT leg, admitted ONLY when the document states a tax
-- fact and tied EXACTLY to invoice.tax_total (WA21-R1 — the visibility split,
-- answering the FIX-2 item-7 laundering revert with count+tie+corroboration).
-- The leg is expense-typed (CHECK-enforced) so the expense=gross tie below
-- survives verbatim; sst_output on a purchase still refuses OUTRIGHT
-- (sales-only, unchanged — the 0015 wording stands).
-- =====================================================================
create or replace function clara._assert_supplier_bill_shape(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_payable_credit bigint; v_expense_debit bigint;
  v_verified_total bigint; v_payable_debit bigint; v_recv_lines int;
  v_type text; v_round_imb bigint; v_leg_n int;
  v_sst_legs int;
  v_sstp_legs int; v_sstp_credit bigint; v_sstp_debit bigint; v_tax bigint;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class in ('payable','receivable')
      and l.counterparty_id is null
  ) then
    raise exception 'every control-class line requires a counterparty' using errcode = 'CLR23';
  end if;
  if e.coding_kind = 'supplier_bill' and e.reversal_of is null then
    -- RESIDUAL-2 (supplier-bill polarity): a supplier document whose stated MyInvois type
    -- is anything other than 01 (invoice) cannot be coded as a plain bill — a type-02
    -- supplier credit note drafted Dr expense / Cr payable would wrongly INCREASE payable.
    -- Refuse (=> NEEDS YOU). OCR bills carry no type_code => the binding is inert (unchanged
    -- for the RPR OCR corpus). Mirrors the sales floor's type<->polarity binding.
    if e.document_id is not null then
      v_type := nullif(clara._invoice_fact_state(e.document_id)->>'type_code','');
      if v_type is not null and v_type <> '01' then
        raise exception 'a supplier document of type % cannot be coded as a plain bill', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    end if;
    -- Defense-in-depth (adversarial #2, control-account laundering): a supplier bill
    -- admits NO receivable-class leg and NO payable leg on the DEBIT side (an
    -- opposite/unaccounted control leg through which an amount could be laundered
    -- under the control exemption). At least one payable CREDIT still ties to gross.
    select count(*) filter (where a.account_class='receivable'),
           coalesce(sum(l.credit_cents) filter (where a.account_class='payable'),0),
           coalesce(sum(l.debit_cents)  filter (where a.account_class='payable'),0)
      into v_recv_lines, v_payable_credit, v_payable_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry;
    if v_recv_lines > 0 then
      raise exception 'a supplier bill admits no receivable-class leg' using errcode = 'CLR23';
    end if;
    if v_payable_debit > 0 then
      raise exception 'a supplier bill admits no payable-class debit leg' using errcode = 'CLR23';
    end if;
    if v_payable_credit <= 0 then
      raise exception 'supplier bill requires a payable-class credit' using errcode = 'CLR23';
    end if;
    -- RESIDUAL-1 (defense-in-depth): a supplier bill's rounding account may carry only an
    -- IMMATERIAL amount. A caller-supplied 'rounding' leg of any size would otherwise
    -- launder the balance past the whole-entry constraint when the evidence is non-verified
    -- (the executor closes the autopost path; this closes the human/agent approve path).
    -- Aggregate |dr−cr| over rounding legs must be <= greatest(5, n_legs) sen. Taxonomy-
    -- consistent with the executor bound; leaves the open-ended expense/asset debit side
    -- untouched (asset-debit bills exist), so the AP exact-diff is preserved.
    select count(*)::int into v_leg_n from clara.journal_lines where entry_id=p_entry;
    select coalesce(sum(abs(l.debit_cents-l.credit_cents)),0) into v_round_imb
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='rounding';
    if v_round_imb > greatest(5, v_leg_n) then
      raise exception 'a supplier bill admits no material amount in a rounding leg' using errcode = 'CLR23';
    end if;
    -- FIX-2 (v4, item 2 — sst_output is SALES-side ONLY): a supplier bill (purchase) admits
    -- NO sst_output leg. Malaysian purchase SST is expensed INTO cost (expense=gross); output
    -- tax (sst_output) is a SALES liability, never a purchase leg. This REVERTS the v2/v3
    -- purchase-side sst TIE (which admitted a tied sst leg): a separate sst leg on a purchase
    -- is the item-7 laundering vector, not a legit shape, so it is refused OUTRIGHT — whether
    -- or not it would tie to a stated tax fact. Azure/OCR AP bills carry no sst_output leg =>
    -- inert for the RPR/AP corpus (the exact-diff is preserved). The open-ended expense/asset
    -- debit side (multi-account human splits) stays untouched. Mirrors the executor's
    -- purchase outside-leg rejection (execute_rule_post).
    select count(*)::int into v_sst_legs
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_output';
    if v_sst_legs > 0 then
      raise exception 'a supplier bill admits no sst_output leg (purchase SST is expensed into cost)'
        using errcode = 'CLR23';
    end if;
    -- 0016 P4 (WA21-R1 — the purchase VISIBILITY split): AT MOST ONE
    -- sst_purchase_cost DEBIT leg, admitted ONLY when the document STATES a tax
    -- total, and tied EXACTLY (to the sen) to invoice.tax_total from
    -- _invoice_fact_state. The account is expense-typed (CHECK), so the
    -- expense=gross tie below counts it — expense total still equals gross.
    -- Count + tie + corroboration: never a free bucket.
    select count(*)::int,
           coalesce(sum(l.credit_cents),0),
           coalesce(sum(l.debit_cents),0)
      into v_sstp_legs, v_sstp_credit, v_sstp_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost';
    if v_sstp_legs > 0 then
      if v_sstp_legs > 1 or v_sstp_credit > 0 then
        raise exception 'a supplier bill admits at most one sst_purchase_cost debit leg'
          using errcode='CLR23';
      end if;
      v_tax := case when e.document_id is null then null
        else nullif(clara._invoice_fact_state(e.document_id)->>'tax_total_cents','')::bigint end;
      if v_tax is null then
        raise exception 'an sst_purchase_cost leg requires a stated document tax total'
          using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
      end if;
      if v_sstp_debit <> v_tax then
        raise exception 'sst_purchase_cost leg differs from the stated tax total'
          using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
      end if;
    end if;
    select coalesce(r.monetary_cents,clara._normalize_invoice_cents(ev.quote))
      into v_verified_total
    from clara.entry_evidence ev
    join clara.document_regions r on r.id=ev.region_id and r.extraction_id=ev.extraction_id
    where ev.entry_id=p_entry and ev.provenance_tier='verified'
      and ev.field_path='invoice.total'
    order by ev.id limit 1;
    if v_verified_total is not null and not (e.flags ? 'amount_override') then
      select coalesce(sum(l.debit_cents),0) into v_expense_debit
      from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='expense';
      if v_payable_credit <> v_verified_total or v_expense_debit <> v_verified_total then
        raise exception 'supplier-bill payable/expense total differs from supported gross'
          using errcode = 'CLR23';
      end if;
    end if;
  end if;
end $$;

-- =====================================================================
-- B7 — P7: _draft_entry_core CoR (same arity, 19 params, owner-only). The ONLY
-- change: the journal_entries insert stamps closing_transfer from the existing
-- p_flags jsonb (flags-style, like is_year_end) — the pin's "settable only via
-- the existing revise/draft path". After birth no allowset admits it (frozen).
-- Everything else is byte-identical to the 0015 body.
-- =====================================================================
create or replace function clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_is_human boolean, p_client uuid, p_resolution uuid,
    p_posting_date date, p_memo text, p_lines jsonb, p_document uuid, p_sha256 text,
    p_flags jsonb, p_op_key text, p_books_version bigint,
    p_proposed_counterparty jsonb, p_evidence jsonb, p_coding jsonb,
    p_coding_kind text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_client_firm uuid; v_client_status text; v_origin text;
  v_entry uuid; v_token uuid; v_filing uuid; v_lines jsonb; v_fingerprint jsonb;
  v_receipt jsonb; v_seq bigint; v_state jsonb; v_payable bigint; v_expense bigint;
  v_task uuid; v_part jsonb; v_tier text; v_constraint text; v_exception jsonb;
  v_rule record; v_rule_counterparty uuid; v_rule_decision uuid; v_proposal jsonb; v_kind text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(p_firm,'draft_entry',p_op_key,
    clara._hash(jsonb_build_object(
      'c',p_client,'r',p_resolution,'d',p_posting_date,'m',p_memo,'l',p_lines,
      'doc',p_document,'sha',p_sha256,'f',p_flags,
      'counterparty',p_proposed_counterparty,'evidence',p_evidence,
      'coding',p_coding,'coding_kind',p_coding_kind)));
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id,status into v_client_firm,v_client_status
    from clara.clients where id=p_client;
  if v_client_firm is null or v_client_firm<>p_firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  if v_client_status='archived' then
    raise exception 'client is archived -- no new postings' using errcode='CLR10';
  end if;
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,null);
  end if;
  if (p_document is null) <> (p_sha256 is null) then
    raise exception 'document and sha256 must be both set or both null' using errcode='CLR10';
  end if;
  if p_document is not null then
    v_filing := clara._active_document_filing(p_document,p_sha256,p_client,true);
    if exists (
      select 1 from clara.journal_entries
      where filing_id=v_filing and status='approved' and reversed_by is null
    ) then
      raise exception 'active filing is already coded'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end if;
  end if;
  perform clara.assert_client_resolved(p_client,p_resolution,p_document);
  if p_coding_kind is not null
     and p_coding_kind not in ('supplier_bill','sales_invoice','sales_credit_note') then
    raise exception 'unsupported coding kind' using errcode='CLR10';
  end if;
  if p_coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
     and (p_document is null or p_proposed_counterparty is null) then
    raise exception 'coded entry requires a document and counterparty proposal'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if p_coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
     and (p_evidence is null or jsonb_typeof(p_evidence)<>'array'
          or jsonb_array_length(p_evidence)=0) then
    raise exception 'coded entry requires a cited evidence array'
      using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
  end if;
  if p_coding is not null then
    if p_is_human or p_document is null or jsonb_typeof(p_coding)<>'object'
       or jsonb_typeof(p_coding->'part_payload')<>'object' then
      raise exception 'coding-attempt payload is malformed' using errcode='CLR10';
    end if;
    begin
      v_task := (p_coding->>'task_id')::uuid;
    exception when others then
      raise exception 'coding-attempt task is malformed' using errcode='CLR10';
    end;
    if not exists (
      select 1 from clara.agent_tasks t where t.id=v_task and t.firm_id=p_firm
        and t.client_id=p_client and (
          (t.kind='chat_turn' and t.status in ('queued','running','awaiting_input'))
          or (t.kind='autodraft' and t.status in ('queued','running')))
    ) then
      raise exception 'coding-attempt task is not eligible' using errcode='CLR11';
    end if;
    v_part := p_coding->'part_payload';
  end if;

  -- S7: the resolution kind rides the TOP LEVEL of the proposal (parallel to
  -- new/existing_id). Honor a caller-sent kind; else derive from coding_kind (sales
  -- => customer). The vendor default is never stamped, so AP callers stay byte-identical.
  v_kind := coalesce(nullif(btrim(p_proposed_counterparty->>'kind'),''),
    case when p_coding_kind in ('sales_invoice','sales_credit_note') then 'customer' else 'vendor' end);
  v_proposal := case when p_proposed_counterparty is null or v_kind='vendor'
    then p_proposed_counterparty
    else p_proposed_counterparty || jsonb_build_object('kind',v_kind) end;
  v_fingerprint := clara._resolve_counterparty(p_client,v_proposal);
  v_lines := clara._validate_entry_lines(p_client,p_lines);
  v_origin := case when p_document is not null then 'document'
                   when p_is_human then 'manual' else 'agent' end;
  if p_document is null and (p_memo is null or btrim(p_memo)='') then
    raise exception 'a non-document entry requires a memo (its basis)' using errcode='CLR10';
  end if;
  -- ADV-11 (P7): the closing-transfer marker is HUMAN-ONLY authority — it
  -- narrows the SST evaluator's turnover base, so the wake/agent lane may
  -- never author it.
  if not p_is_human and coalesce((p_flags->>'closing_transfer')::boolean,false) then
    raise exception 'closing_transfer is a human-lane marker' using errcode='CLR03';
  end if;

  begin
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,resolution_id,is_opening_balance,
        is_year_end,tax_affecting,maker_actor,last_human_editor,
        proposed_counterparty,match_fingerprint,coding_kind,closing_transfer)
      values(p_client,'draft',p_posting_date,p_memo,v_origin,p_document,v_filing,
        p_sha256,p_resolution,false,
        coalesce((p_flags->>'is_year_end')::boolean,false),
        coalesce((p_flags->>'tax_affecting')::boolean,false),p_actor,
        case when p_is_human then p_actor end,
        v_proposal,v_fingerprint,p_coding_kind,
        coalesce((p_flags->>'closing_transfer')::boolean,false))
      returning id into v_entry;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint='uq_journal_entries_one_open_draft_filing' then
      raise exception 'active filing already has an open draft'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end if;
    raise;
  end;

  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description)
    select v_entry,x.idx,(x.elem->>'account_code'),
      (x.elem->>'debit_cents')::bigint,(x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem,idx);
  perform clara._assert_balanced(v_entry);

  if p_document is not null then
    if clara._evidence_cites_non_myr(p_evidence) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if p_evidence is not null then
      perform clara._write_entry_evidence(v_entry,p_document,p_evidence);
    end if;
    v_state := clara._invoice_fact_state(p_document);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    -- RESIDUAL-2 (supplier-bill polarity, at DRAFT): a supplier document whose stated
    -- MyInvois type is not 01 (invoice) cannot be coded as a plain bill (a type-02 credit
    -- note booked Dr expense / Cr payable would wrongly increase payable). Refuse at draft
    -- (=> NEEDS YOU); the shape floor re-asserts it at approve. OCR bills carry no type_code.
    if p_coding_kind='supplier_bill'
       and nullif(v_state->>'type_code','') is not null
       and nullif(v_state->>'type_code','') <> '01' then
      raise exception 'a supplier document of type % cannot be coded as a plain bill', v_state->>'type_code'
        using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
    end if;
    if p_coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(v_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'corroborated total is not bound by evidence'
          using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
      end if;
      select coalesce(sum(l.credit_cents),0) into v_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_payable<>(v_state->>'total_cents')::bigint
         or v_expense<>(v_state->>'total_cents')::bigint then
        v_exception := jsonb_build_object(
          'machine_total_cents',(v_state->>'total_cents')::bigint,
          'proposed_cents',v_payable,
          'fact_hash',v_state->>'total_fact_hash','at',now());
      end if;
    end if;
  elsif p_evidence is not null and p_evidence<>'[]'::jsonb then
    raise exception 'unbound evidence is not accepted'
      using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
  end if;

  if v_exception is not null then
    update clara.journal_entries
      set flags = flags || jsonb_build_object('amount_exception',v_exception),
          updated_at=now()
      where id=v_entry;
  end if;

  select revision_token into v_token from clara.journal_entries where id=v_entry;
  if v_fingerprint->>'decision' in
       ('registration_match','name_match_unregistered','alias_match') then
    v_rule_counterparty:=clara._canonical_counterparty(
      p_client,(v_fingerprint->>'counterparty_id')::uuid);
    select r.* into v_rule from clara.coding_rules r
      join clara.coa_accounts a on a.client_id=r.client_id
        and a.account_code=r.account_code and a.is_active
      where r.client_id=p_client and r.counterparty_id=v_rule_counterparty
        and r.rule_type='vendor_account' and r.status='live'
      for share of r;
    if found then
      insert into clara.rule_decisions(firm_id,client_id,entry_id,revision_token,
          rule_id,rule_type,counterparty_id,account_code,content_hash,pinned,
          account_matched,snapshot)
        values(p_firm,p_client,v_entry,v_token,v_rule.id,v_rule.rule_type,
          v_rule.counterparty_id,v_rule.account_code,v_rule.content_hash,v_rule.pinned,
          exists(select 1 from clara.journal_lines l where l.entry_id=v_entry
            and l.account_code=v_rule.account_code and l.debit_cents>0),
          jsonb_build_object('rule_id',v_rule.id,'rule_type',v_rule.rule_type,
            'counterparty_id',v_rule.counterparty_id,'account_code',v_rule.account_code,
            'content_hash',v_rule.content_hash,'pinned',v_rule.pinned,
            'origin',v_rule.origin,'signed_by',v_rule.signed_by,
            'signed_at',v_rule.signed_at)) returning id into v_rule_decision;
    end if;
  end if;

  select case when exists(select 1 from clara.entry_evidence
                    where entry_id=v_entry and provenance_tier='verified')
              then 'verified' else 'model_read' end into v_tier;
  if v_task is not null then
    begin
      insert into clara.coding_attempts(firm_id,client_id,task_id,filing_id,
          document_id,entry_id,part_payload)
        values(p_firm,p_client,v_task,v_filing,p_document,v_entry,
          v_part || jsonb_build_object('entry_id',v_entry,'revision_token',v_token,
            'client_id',p_client,'document_id',p_document,'provenance_tier',v_tier,
            'exception',(v_exception is not null),
            'rule_decision_id',v_rule_decision,
            'rule_account_matched',coalesce((select account_matched
              from clara.rule_decisions where id=v_rule_decision),false)));
    exception when unique_violation then
      raise exception 'coding task or filing was already coded'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end;
  end if;

  insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
      revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
    select e.firm_id,e.client_id,e.id,0,e.revision_token,
      case when p_is_human then 'human' else 'agent' end,p_actor,'drafted',
      to_jsonb(e)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
      coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
        'account_code',l.account_code,'debit_cents',l.debit_cents,
        'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
          else 'credit' end,'counterparty_id',l.counterparty_id,
        'description',l.description) order by l.line_no)
        from clara.journal_lines l where l.entry_id=e.id),'[]'::jsonb),
      v_rule_decision,
      coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
        'region_id',ev.region_id,'fact_hash',ev.fact_hash,
        'provenance_tier',ev.provenance_tier) order by ev.id)
        from clara.entry_evidence ev where ev.entry_id=e.id),'[]'::jsonb)
    from clara.journal_entries e where e.id=v_entry;

  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,'draft_entry',v_entry,
    jsonb_build_object('client',p_client,'filing',v_filing,'task',v_task,'op_key',p_op_key));
  v_seq := clara._append_event(p_firm,'entry.drafted',p_client,p_actor,p_obo,p_wake_kind,
    v_entry,p_document,p_resolution,'{}'::jsonb);
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,v_seq);
  end if;
  v_receipt := jsonb_build_object('entry_id',v_entry,'revision_token',v_token,
    'status','draft','filing_id',v_filing,'exception',(v_exception is not null),
    'provenance_tier',v_tier,'rule_decision_id',v_rule_decision,
    'rule_account_matched',coalesce((select account_matched from clara.rule_decisions
      where id=v_rule_decision),false));
  return clara._finish_op(p_firm,'draft_entry',p_op_key,v_receipt);
end $$;

-- =====================================================================
-- B8 — P5: READ-SURFACE CoRs.
-- get_context_pack -> pack_schema_version 3: adds the `sst_registration_watch`
-- block (contract §2.3) — status, the THREE labeled figures, window, earliest
-- candidate crossing month, future_method_status, coverage/verification flags,
-- evaluated_at, and permitted_use — framed as a DB-COMPUTED SCREENING ESTIMATE
-- the agent may only surface with basis + verification status. Emitted as an
-- array (one element per open service-group watch; [] when none). Everything
-- else byte-identical to the 0011 v2 body.
-- =====================================================================
create or replace function clara.get_context_pack(p_client uuid,p_purpose text) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; c record; v_firm uuid;
begin
  if p_client is null or p_purpose is null or btrim(p_purpose)='' then
    raise exception 'a client and context-pack purpose are required' using errcode='CLR10';
  end if;
  -- ADR-015: inside SECURITY DEFINER the caller's SET ROLE is invisible
  -- (current_role = the owner), so the wake-secret GUC's PRESENCE is the agent
  -- lane's structural marker. A human PostgREST caller CAN set clara.wake_secret,
  -- but that is not a bypass: a garbage/forged value makes wake_context() return
  -- no row → CLR03 refusal (never data); a valid secret is exactly an authorized
  -- agent credential. The security boundary is wake_context()'s hash+liveness
  -- check, NOT the GUC being unreachable. (Runtime pools SET LOCAL it per request.)
  if coalesce(current_setting('clara.wake_secret',true),'')<>'' then
    select * into w from clara.wake_context();
    if w.credential_id is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_context_pack');
    end if;
    if w.client_id is not null and p_client<>w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    c:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=c.firm;
  end if;
  return (
    select jsonb_build_object(
      'pack_schema_version',3,'purpose',p_purpose,'generated_at',now(),
      'books_version',(select coalesce(max(de.seq),0) from clara.domain_events de
        where de.firm_id=cl.firm_id),
      'client',jsonb_build_object('id',cl.id,'name',cl.name,'status',cl.status),
      'firm',(select jsonb_build_object('id',f.id,'name',f.name,
        'high_stakes_amount_cents',f.high_stakes_amount_cents)
        from clara.firms f where f.id=cl.firm_id),
      'coa',(select coalesce(jsonb_agg(jsonb_build_object('account_code',a.account_code,
        'name',a.name,'account_type',a.account_type,'special_acc_type',a.special_acc_type,
        'is_active',a.is_active) order by a.account_code),'[]'::jsonb)
        from clara.coa_accounts a where a.client_id=cl.id),
      'trial_balance',(select coalesce(jsonb_agg(to_jsonb(tb) order by tb.account_code),
        '[]'::jsonb) from clara.trial_balance(cl.id) tb),
      'recent_entries',(select coalesce(jsonb_agg(jsonb_build_object('entry',to_jsonb(je),
        'lines',(select coalesce(jsonb_agg(to_jsonb(jl) order by jl.line_no),'[]'::jsonb)
          from clara.journal_lines jl where jl.entry_id=je.id))
          order by je.posting_date desc,je.created_at desc),'[]'::jsonb)
        from (select * from clara.journal_entries where client_id=cl.id
          and status<>'withdrawn' order by posting_date desc,created_at desc limit 50) je),
      'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,
        'sha256',d.sha256,'original_filename',d.original_filename,'mime_type',d.mime_type,
        'byte_size',d.byte_size,'status',d.status,'bytes_verified_at',d.bytes_verified_at,
        'page_count',d.page_count,'extraction_status',d.extraction_status,
        'document_kind',d.document_kind,'financial_date',d.financial_date,
        'retention_state',d.retention_state,'retain_until',d.retain_until,
        'legal_hold',d.legal_hold,'created_at',d.created_at,'filing_id',df.id,
        'filed_at',df.filed_at,'filing_basis',df.basis) order by df.filed_at desc),'[]'::jsonb)
        from clara.document_filings df join clara.documents d on d.id=df.document_id
        where df.client_id=cl.id and df.retired_at is null),
      'resolutions',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),
        '[]'::jsonb) from clara.client_resolutions r
        where r.client_id=cl.id and r.superseded_at is null),
      'approval_history',(select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,
        'status',je.status,'approved_at',je.approved_at,'checker_actor',je.checker_actor,
        'maker_actor',je.maker_actor,'reversal_of',je.reversal_of,
        'reversed_by',je.reversed_by) order by je.approved_at desc),'[]'::jsonb)
        from (select * from clara.journal_entries where client_id=cl.id
          and approved_at is not null order by approved_at desc limit 25) je),
      'sst_registration_watch',(select coalesce(jsonb_agg(jsonb_build_object(
        'watch_id',cw.id,'service_group',cw.service_group,'status',cw.state,
        'confirmed_included_cents',cw.confirmed_included_cents,
        'unknown_or_mixed_cents',cw.unknown_or_mixed_cents,
        'screening_proxy_cents',cw.screening_proxy_cents,
        'window_start',cw.window_start,'window_end',cw.window_end,
        'earliest_crossing_month',cw.earliest_crossing_month,
        'application_due',cw.application_due,
        'future_method_status',cw.future_method_status,
        'coverage_complete',cw.coverage_complete,
        'provisional_month',cw.provisional_month,
        'provisional_included_cents',cw.provisional_included_cents,
        'provisional_crossed',cw.provisional_crossed,
        'acknowledged_at',cw.acknowledged_at,'snoozed_until',cw.snoozed_until,
        'evaluated_at',cw.evaluated_at,
        'basis','db_computed_screening_estimate',
        'permitted_use','surface_and_request_professional_review_only')
        order by cw.service_group),'[]'::jsonb)
        from clara.compliance_watches cw
        where cw.client_id=cl.id and cw.state<>'resolved')
    ) from clara.clients cl where cl.id=p_client and cl.firm_id=v_firm
  );
end $$;

-- get_draft_review CoR (P5/§6.1): the HUMAN lane now returns a SLIM settled
-- payload {entry:{id,status,approved_at,withdrawn_at,coding_kind}} when the
-- entry is no longer a draft (a true terminal receipt for the dashboard cards);
-- the WAKE/AGENT lane keeps returning NULL for a settled entry
-- (behavior-frozen). The draft path is byte-identical to the 0011 body.
create or replace function clara.get_draft_review(p_entry uuid,p_client uuid default null)
  returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  e record; v_current jsonb; cp record; v_result jsonb; w record; c record;
  v_high boolean; v_reasons text[]; v_debits bigint; v_threshold bigint;
  v_near jsonb; v_cp uuid; v_dinv_date text; v_dtotal bigint; v_firm uuid;
  v_name_n text; v_reg_n text; v_alias boolean; v_agent boolean:=false;
begin
  -- ADR-015: inside SECURITY DEFINER the caller's SET ROLE is invisible
  -- (current_role = the owner), so the wake-secret GUC's PRESENCE is the agent
  -- lane's structural marker. A human PostgREST caller CAN set clara.wake_secret,
  -- but that is not a bypass: a garbage/forged value makes wake_context() return
  -- no row → CLR03 refusal (never data); a valid secret is exactly an authorized
  -- agent credential. The security boundary is wake_context()'s hash+liveness
  -- check, NOT the GUC being unreachable. (Runtime pools SET LOCAL it per request.)
  if coalesce(current_setting('clara.wake_secret',true),'')<>'' then
    v_agent:=true;
    select * into w from clara.wake_context();
    if w.credential_id is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_draft_review');
    end if;
    if p_client is null or (w.client_id is not null and p_client<>w.client_id) then
      return null;
    end if;
    v_firm:=w.firm_id;
  else
    c:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=c.firm;
  end if;
  select * into e from clara.journal_entries where id=p_entry and firm_id=v_firm
    and (p_client is null or client_id=p_client);
  if not found then return null; end if;
  if e.status<>'draft' then
    -- 0016 §6.1: the human lane gets a TRUE terminal receipt; the wake/agent
    -- lane stays NULL-for-settled (frozen behavior).
    if v_agent then return null; end if;
    return jsonb_build_object('entry',jsonb_build_object(
      'id',e.id,'status',e.status,'approved_at',e.approved_at,
      'withdrawn_at',e.withdrawn_at,'coding_kind',e.coding_kind));
  end if;
  v_current:=e.match_fingerprint;
  if e.proposed_counterparty is not null then
    if e.proposed_counterparty?'existing_id' then
      begin
        v_cp:=clara._canonical_counterparty(
          e.client_id,(e.proposed_counterparty->>'existing_id')::uuid);
        select * into cp from clara.counterparties where id=v_cp and client_id=e.client_id
          and merged_into is null and retired_at is null;
        if found then
          v_current:=jsonb_strip_nulls(jsonb_build_object(
            'decision',case when cp.registration_normalized is null
              then 'name_match_unregistered' else 'registration_match' end,
            'counterparty_id',cp.id,'name_normalized',cp.name_normalized,
            'registration_normalized',cp.registration_normalized));
        end if;
      exception when others then null;
      end;
    elsif e.proposed_counterparty?'new' then
      v_name_n:=lower(regexp_replace(coalesce(
        e.proposed_counterparty->'new'->>'name',''),'[^a-zA-Z0-9]','','g'));
      v_reg_n:=nullif(lower(regexp_replace(coalesce(
        e.proposed_counterparty->'new'->>'registration_no',''),
        '[^a-zA-Z0-9]','','g')),'');
      if v_reg_n is not null then
        select * into cp from clara.counterparties where client_id=e.client_id
          and registration_normalized=v_reg_n
        order by (merged_into is null) desc,id limit 1;
        if found then
          v_cp:=clara._canonical_counterparty(e.client_id,cp.id);
          select * into cp from clara.counterparties where id=v_cp;
          v_current:=jsonb_build_object('decision','registration_match',
            'counterparty_id',cp.id,'name_normalized',cp.name_normalized,
            'registration_normalized',cp.registration_normalized);
        elsif exists(select 1 from clara.counterparties x
          left join clara.counterparty_aliases a on a.counterparty_id=x.id
            and a.retired_at is null and a.alias_normalized=v_name_n
          where x.client_id=e.client_id and x.merged_into is null and x.retired_at is null
            and (x.name_normalized=v_name_n or a.id is not null)
            and x.registration_normalized is not null
            and x.registration_normalized<>v_reg_n) then
          v_current:=jsonb_build_object('decision','registration_conflict',
            'name_normalized',v_name_n);
        else
          v_current:=jsonb_build_object('decision','birth','name_normalized',v_name_n,
            'registration_normalized',v_reg_n);
        end if;
      else
        select x.*,a.id is not null as via_alias into cp
        from clara.counterparties x
        left join clara.counterparty_aliases a on a.counterparty_id=x.id
          and a.retired_at is null and a.alias_normalized=v_name_n
        where x.client_id=e.client_id and x.merged_into is null and x.retired_at is null
          and (x.name_normalized=v_name_n or a.id is not null)
        order by (x.registration_normalized is not null) desc,x.id limit 1;
        if found and cp.registration_normalized is not null then
          v_current:=jsonb_build_object('decision','registered_name_ambiguous',
            'counterparty_id',cp.id,'name_normalized',cp.name_normalized,
            'registration_normalized',cp.registration_normalized);
        elsif found then
          v_alias:=coalesce(cp.via_alias,false) and cp.name_normalized<>v_name_n;
          v_current:=jsonb_build_object('decision',case when v_alias then 'alias_match'
            else 'name_match_unregistered' end,'counterparty_id',cp.id,
            'name_normalized',cp.name_normalized);
        else
          v_current:=jsonb_build_object('decision','birth','name_normalized',v_name_n);
        end if;
      end if;
    end if;
  end if;

  select coalesce((select sum(l.debit_cents) from clara.journal_lines l
                   where l.entry_id=e.id),0),
         (select f.high_stakes_amount_cents from clara.firms f where f.id=e.firm_id)
    into v_debits,v_threshold;
  v_high:=e.is_opening_balance or e.is_year_end or e.tax_affecting
    or (e.flags?'amount_override') or v_debits>=v_threshold;
  v_reasons:='{}'::text[];
  if e.is_opening_balance then v_reasons:=array_append(v_reasons,'opening_balance'); end if;
  if e.is_year_end then v_reasons:=array_append(v_reasons,'year_end'); end if;
  if e.tax_affecting then v_reasons:=array_append(v_reasons,'tax_affecting'); end if;
  if v_debits>=v_threshold then v_reasons:=array_append(v_reasons,'amount_threshold'); end if;
  if e.flags?'amount_override' then v_reasons:=array_append(v_reasons,'amount_override'); end if;

  v_cp:=nullif(v_current->>'counterparty_id','')::uuid;
  v_cp:=clara._canonical_counterparty(e.client_id,v_cp);
  if v_cp is null or e.document_id is null then
    v_near:='[]'::jsonb;
  else
    select nullif(btrim(min(r.text_content) filter
             (where r.field_path='invoice.invoice_date')),''),
           min(r.monetary_cents) filter (where r.field_path='invoice.total')
      into v_dinv_date,v_dtotal
    from clara.document_regions r where r.extraction_id=(select ex.id
      from clara.document_extractions ex where ex.document_id=e.document_id
        and ex.engine_kind='invoice_facts' and ex.status='done'
      order by ex.version_n desc,ex.id desc limit 1);
    select coalesce(jsonb_agg(z.x order by z.x_posting,z.x_id),'[]'::jsonb) into v_near
    from (
      select e2.id x_id,e2.posting_date x_posting,
        jsonb_build_object('entry_id',e2.id,'document_id',e2.document_id,
          'invoice_id',cf.inv_id,'total_cents',cf.total_cents,
          'posting_date',e2.posting_date) x
      from clara.journal_entries e2 cross join lateral (
        select nullif(btrim(min(r.text_content) filter
                 (where r.field_path='invoice.invoice_id')),'') inv_id,
               nullif(btrim(min(r.text_content) filter
                 (where r.field_path='invoice.invoice_date')),'') inv_date,
               min(r.monetary_cents) filter (where r.field_path='invoice.total') total_cents
        from clara.document_regions r where r.extraction_id=(select ex.id
          from clara.document_extractions ex where ex.document_id=e2.document_id
            and ex.engine_kind='invoice_facts' and ex.status='done'
          order by ex.version_n desc,ex.id desc limit 1)) cf
      where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
        and e2.status='approved' and e2.reversed_by is null and e2.id<>e.id
        and e2.document_id is not null and exists(select 1 from clara.journal_lines l2
          where l2.entry_id=e2.id
            and clara._canonical_counterparty(e.client_id,l2.counterparty_id)=v_cp)
        and ((v_dinv_date is not null and cf.inv_date=v_dinv_date)
          or (v_dtotal is not null and cf.total_cents=v_dtotal))
    ) z;
  end if;

  select jsonb_build_object('entry',to_jsonb(e),
    'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,
      'line_no',l.line_no,'account_code',l.account_code,'account_name',a.name,
      'account_type',a.account_type,'account_class',a.account_class,
      'debit_cents',l.debit_cents,'credit_cents',l.credit_cents,
      'description',l.description,'counterparty_id',l.counterparty_id) order by l.line_no)
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id),'[]'::jsonb),
    'counterparty',jsonb_build_object('proposal',e.proposed_counterparty,
      'fingerprint',e.match_fingerprint,'current_outcome',v_current),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,
      'document_id',ev.document_id,'extraction_id',ev.extraction_id,
      'region_id',ev.region_id,'field_path',ev.field_path,'quote',ev.quote,
      'fact_hash',ev.fact_hash,'provenance_tier',ev.provenance_tier) order by ev.id)
      from clara.entry_evidence ev where ev.entry_id=e.id),'[]'::jsonb),
    'eligible_checker_count',(select count(*)::int from clara.firm_memberships m
      join clara.users u on u.id=m.user_id where m.firm_id=e.firm_id
        and m.status='active' and m.role in ('bookkeeper','admin','owner') and not u.is_agent),
    'high_stakes',v_high,'high_stakes_reasons',to_jsonb(v_reasons),
    'flags',coalesce(e.flags,'{}'::jsonb),'near_duplicates',v_near)
    into v_result;
  return v_result;
end $$;

-- list_review_queue CoR (P5/§2.3/§6.2): the queue unions OPEN compliance
-- watches as row_kind='compliance_watch' (crossed/overdue rank into needs_you —
-- top of queue; monitored/early_warning into needs_review; the tier rides the
-- row), the envelope gains a top-level `compliance` summary (per-client figures
-- + a `stale_evaluator` flag when the newest compliance_eval_runs receipt is
-- older than 48h — or absent), the integer `counts` gain ONLY the integer
-- `compliance_watches` count (never a monetary figure), and entry rows gain
-- `coding_kind` (the §6.2 direction-aware vocabulary needs it). Sort tuple,
-- cursor grammar and every 0011 row shape are otherwise unchanged (additive
-- keys only).
create or replace function clara.list_review_queue(p_scope jsonb,p_cursor jsonb,
    p_limit int default 50) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; v_client uuid; v_cursor text[]; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  if p_scope is null then p_scope:='{}'::jsonb; end if;
  if jsonb_typeof(p_scope)<>'object' or exists(select 1 from jsonb_object_keys(p_scope) k
      where k<>'client_id') then
    raise exception 'queue scope is malformed' using errcode='CLR10';
  end if;
  if p_scope?'client_id' then
    begin v_client:=(p_scope->>'client_id')::uuid;
    exception when others then raise exception 'queue scope is malformed' using errcode='CLR10'; end;
    if not exists(select 1 from clara.clients where id=v_client and firm_id=c.firm) then
      raise exception 'queue scope is malformed' using errcode='CLR10';
    end if;
  end if;
  -- Clamp, never refuse, the limit (the list_unassigned_documents precedent):
  -- pins §5a validates cursor/scope only.
  p_limit:=least(greatest(coalesce(p_limit,50),1),500);
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object' or jsonb_typeof(p_cursor->'tuple')<>'array'
       or jsonb_array_length(p_cursor->'tuple')<>5 then
      raise exception 'queue cursor is malformed' using errcode='CLR10';
    end if;
    select array_agg(value order by ord) into v_cursor
      from jsonb_array_elements_text(p_cursor->'tuple') with ordinality x(value,ord);
    begin
      perform v_cursor[1]::int; perform v_cursor[2]::uuid;
      perform v_cursor[4]::timestamptz; perform v_cursor[5]::uuid;
    exception when others then raise exception 'queue cursor is malformed' using errcode='CLR10'; end;
  end if;

  with draft_rows as (
    select 2 section_rank,'draft'::text row_kind,
      case when ln.lane='needs_you' then 'needs_you' else 'needs_review' end section,
      e.client_id,cp.counterparty_id,e.filing_id,e.id entry_id,null::uuid question_id,
      null::uuid task_id,e.document_id,ln.lane,false auto,
      exists(select 1 from clara.rule_decisions rd where rd.entry_id=e.id
        and rd.account_matched) rule_backed,clara.is_high_stakes(e.id) high_stakes,
      e.created_at aged_since,(select coalesce(sum(l.debit_cents),0)
        from clara.journal_lines l where l.entry_id=e.id) amount_cents,
      e.posting_date::text period,null::text question_text,e.created_at,e.id,
      coalesce(cp.counterparty_id::text,'') vendor_group,
      e.coding_kind coding_kind,null::uuid watch_id,null::text tier
    from clara.journal_entries e
    left join lateral (select clara._canonical_counterparty(e.client_id,l.counterparty_id)
      counterparty_id from clara.journal_lines l where l.entry_id=e.id
        and l.counterparty_id is not null order by l.line_no limit 1) cp on true
    left join lateral (select * from clara._coding_lane_core(e.client_id,e.filing_id)) ln on true
    where e.firm_id=c.firm and e.status='draft'
      and (v_client is null or e.client_id=v_client)
  ), filing_rows as (
    select case when ln.lane='needs_you' then 1 else 2 end section_rank,
      'uncoded_filing'::text row_kind,
      case when ln.lane='needs_you' then 'needs_you' else 'needs_review' end section,
      f.client_id,null::uuid counterparty_id,f.id filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,f.document_id,ln.lane,
      false auto,(ln.reasons@>array['rule_backed']) rule_backed,
      (ln.reasons@>array['high_stakes']) high_stakes,f.filed_at aged_since,
      nullif(clara._invoice_fact_state(f.document_id)->>'total_cents','')::bigint amount_cents,
      clara._invoice_fact_state(f.document_id)->>'invoice_date' period,
      null::text question_text,f.filed_at created_at,f.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier
    from clara.document_filings f
    cross join lateral clara._coding_lane_core(f.client_id,f.id) ln
    where f.firm_id=c.firm and f.retired_at is null
      and (v_client is null or f.client_id=v_client)
      and not exists(select 1 from clara.journal_entries e where e.filing_id=f.id
        and (e.status='draft' or (e.status='approved' and e.reversed_by is null)))
  ), question_rows as (
    select 1 section_rank,'open_question'::text row_kind,'needs_you'::text section,
      q.client_id,q.counterparty_id,null::uuid filing_id,null::uuid entry_id,q.id question_id,
      null::uuid task_id,q.document_id,'needs_you'::text lane,
      q.opener_kind='wake' auto,q.spawned_rule_id is not null rule_backed,false high_stakes,
      q.opened_at aged_since,null::bigint amount_cents,null::text period,
      q.question_text,q.opened_at created_at,q.id,
      coalesce(q.counterparty_id::text,'') vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier
    from clara.open_questions q where q.firm_id=c.firm and q.status='open'
      and (v_client is null or q.client_id=v_client)
  ), task_rows as (
    select 2 section_rank,'coding_task'::text row_kind,'needs_review'::text section,
      t.client_id,null::uuid counterparty_id,t.filing_id,null::uuid entry_id,
      null::uuid question_id,t.id task_id,t.document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,t.created_at aged_since,
      null::bigint amount_cents,null::text period,null::text question_text,
      t.created_at,t.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier
    from clara.coding_tasks t where t.firm_id=c.firm and t.status='open'
      and (v_client is null or t.client_id=v_client)
  ), compliance_rows as (
    select case when cw.state in ('crossed','overdue') then 1 else 2 end section_rank,
      'compliance_watch'::text row_kind,
      case when cw.state in ('crossed','overdue') then 'needs_you' else 'needs_review' end section,
      cw.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,cw.created_at aged_since,
      null::bigint amount_cents,cw.window_end::text period,
      ('SST registration threshold watch ('||cw.service_group||')')::text question_text,
      cw.created_at created_at,cw.id,''::text vendor_group,
      null::text coding_kind,cw.id watch_id,cw.state tier
    from clara.compliance_watches cw
    where cw.firm_id=c.firm and cw.watch_kind='sst_registration' and cw.state<>'resolved'
      and (v_client is null or cw.client_id=v_client)
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows
  ), keyed as (
    select r.*,array[r.section_rank::text,r.client_id::text,r.vendor_group,
      r.created_at::text,r.id::text] sort_tuple from all_rows r
  ), page as (
    select * from keyed where v_cursor is null or sort_tuple>v_cursor
    order by sort_tuple limit p_limit
  ), counts as (
    select count(*) filter(where lane='ready')::int ready,
      count(*) filter(where lane='needs_review')::int needs_review,
      count(*) filter(where lane='needs_you')::int needs_you,
      count(*) filter(where row_kind='draft')::int open_drafts,
      count(*) filter(where row_kind='open_question')::int open_questions,
      count(*) filter(where row_kind='coding_task')::int open_tasks,
      count(*) filter(where row_kind='compliance_watch')::int compliance_watches from all_rows
  ), sweep as (
    select exists(select 1 from clara.sweep_runs r where r.firm_id=c.firm
        and r.state='open') open_run,
      (select max(r.finalized_at) from clara.sweep_runs r where r.firm_id=c.firm
        and r.state='finalized') last_finalized_at,
      (select max(r.acknowledged_at) from clara.sweep_runs r where r.firm_id=c.firm)
        last_ack_at
  )
  select jsonb_build_object(
    'watermark',coalesce((select max(de.seq)::text from clara.domain_events de
      where de.firm_id=c.firm and (v_client is null or de.client_id=v_client)),'0'),
    'counts',jsonb_build_object('ready',counts.ready,'needs_review',counts.needs_review,
      'needs_you',counts.needs_you,'open_drafts',counts.open_drafts,
      'open_questions',counts.open_questions,'open_tasks',counts.open_tasks,
      'compliance_watches',counts.compliance_watches),
    'sweep',jsonb_build_object('open_run',sweep.open_run,
      'last_finalized_at',sweep.last_finalized_at,'last_ack_at',sweep.last_ack_at),
    'compliance',jsonb_build_object(
      'stale_evaluator',coalesce(
        (select max(coalesce(r.completed_at,r.started_at))
           from clara.compliance_eval_runs r)<now()-interval '48 hours',true),
      'clients',(select coalesce(jsonb_agg(jsonb_build_object(
          'client_id',cw.client_id,'service_group',cw.service_group,'state',cw.state,
          'confirmed_included_cents',cw.confirmed_included_cents,
          'unknown_or_mixed_cents',cw.unknown_or_mixed_cents,
          'screening_proxy_cents',cw.screening_proxy_cents,
          'earliest_crossing_month',cw.earliest_crossing_month,
          'application_due',cw.application_due,
          'future_method_status',cw.future_method_status)
          order by cw.client_id,cw.service_group),'[]'::jsonb)
        from clara.compliance_watches cw
        where cw.firm_id=c.firm and cw.state<>'resolved'
          and (v_client is null or cw.client_id=v_client))),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('row_kind',p.row_kind,
      'section',p.section,'sort',to_jsonb(p.sort_tuple),'client_id',p.client_id,
      'counterparty_id',p.counterparty_id,'filing_id',p.filing_id,'entry_id',p.entry_id,
      'question_id',p.question_id,'task_id',p.task_id,'document_id',p.document_id,
      'lane',p.lane,'auto',p.auto,'rule_backed',p.rule_backed,
      'high_stakes',p.high_stakes,'aged_since',p.aged_since,
      'amount_cents',p.amount_cents,'period',p.period,'question_text',p.question_text,
      'created_at',p.created_at,'id',p.id,
      'coding_kind',p.coding_kind,'watch_id',p.watch_id,'tier',p.tier) order by p.sort_tuple)
      from page p),'[]'::jsonb),
    'next_cursor',(select jsonb_build_object('tuple',to_jsonb(p.sort_tuple))
      from page p order by p.sort_tuple desc limit 1)) into v_result
  from counts cross join sweep;
  return v_result;
end $$;

reset role;

-- =====================================================================
-- C — GRANTS. The 0011 pg_default_acl reality (0015 header): strip PUBLIC from
-- every clara fn in one shot, then grant the new surfaces explicitly. Same-arity
-- CoRs above kept their as-built ACLs (tail-asserted). The evaluator + classify
-- fns go to clara_runtime ONLY (never any wake allowlist, never the agent
-- role); the human writers ride the existing clara_authenticated pattern
-- (floors body-enforced by _human_ctx). THE AGENT ROLE GAINS ZERO EXECUTE
-- ANYWHERE IN THIS MIGRATION (tail-asserted like 0015).
-- =====================================================================
revoke execute on all functions in schema clara from public;

grant execute on function
  clara.set_turnover_classification(uuid,text,text,text,text,text,date,text),
  clara.record_future_attestation(uuid,text,bigint,date,text,date,text),
  clara.ack_compliance_watch(uuid,text,text),
  clara.snooze_compliance_watch(uuid,timestamptz,text,text),
  clara.resolve_compliance_watch(uuid,text,text,text),
  clara.set_document_kind(uuid,text,text,text)
to clara_authenticated;

grant execute on function
  clara.evaluate_sst_watch(uuid,text),
  clara.evaluate_sst_watches_all(text),
  clara.classify_document(uuid,text,numeric,text,text)
to clara_runtime;

-- =====================================================================
-- D — TAIL ASSERTIONS (P6, 0015 idiom): the AB-3 boundary re-pin, the 0014
-- consent-evidence re-pin, PUBLIC=0 + one-overload on every touched fn, the
-- role-grant matrix (the agent role gained ZERO EXECUTE anywhere), the P6
-- must-not grep-asserts, the new CHECK/column/index/seed shapes, the new-table
-- RLS posture, and the taxonomy pairs — then three in-migration smoke probes
-- (watch boundary/ladder · classifier gate · purchase-SST tie), each fully
-- rolled back via a sentinel errcode.
-- =====================================================================
do $$
declare
  v_src text; v_public int; v_extra int; v_name text; v_count int; v_def text;
  v_recreated text[]:=array[
    'evaluate_sst_watch','evaluate_sst_watches_all','set_turnover_classification',
    'record_future_attestation','ack_compliance_watch','snooze_compliance_watch',
    'resolve_compliance_watch','classify_document','set_document_kind',
    '_approve_entry_core','execute_rule_post','propose_autopost_rule',
    'sign_autopost_rule','_tf_coding_rule_update','_enqueue_invoice_facts_core',
    'persist_invoice_facts','persist_document_extraction','_assert_supplier_bill_shape',
    '_draft_entry_core','get_context_pack','get_draft_review','list_review_queue'];
  v_new_tables text[]:=array['sst_threshold_schedule','client_turnover_accounts',
    'sst_future_attestations','compliance_watches','compliance_watch_events',
    'compliance_eval_runs'];
  v_compliance_fns text[]:=array[
    'clara.evaluate_sst_watch(uuid,text)','clara.evaluate_sst_watches_all(text)',
    'clara.set_turnover_classification(uuid,text,text,text,text,text,date,text)',
    'clara.record_future_attestation(uuid,text,bigint,date,text,date,text)',
    'clara.ack_compliance_watch(uuid,text,text)',
    'clara.snooze_compliance_watch(uuid,timestamptz,text,text)',
    'clara.resolve_compliance_watch(uuid,text,text,text)'];
  v_new_sigs text[]:=array[
    'clara.evaluate_sst_watch(uuid,text)','clara.evaluate_sst_watches_all(text)',
    'clara.classify_document(uuid,text,numeric,text,text)',
    'clara.set_document_kind(uuid,text,text,text)',
    'clara.set_turnover_classification(uuid,text,text,text,text,text,date,text)',
    'clara.record_future_attestation(uuid,text,bigint,date,text,date,text)',
    'clara.ack_compliance_watch(uuid,text,text)',
    'clara.snooze_compliance_watch(uuid,timestamptz,text,text)',
    'clara.resolve_compliance_watch(uuid,text,text,text)'];
  v_sig text;
begin
  -- (1) AB-3 boundary untouched: login-direct grant + the engine predicate +
  -- the %brn% extension all still exactly as 0015 left them.
  if not pg_catalog.has_function_privilege('clara_runtime_login',
       'clara.record_rule_resolution(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_runtime',
       'clara.record_rule_resolution(uuid,text)','execute') then
    raise exception '0016 AB-3 login-direct grant assertion failed' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.record_rule_resolution(uuid,text)'::regprocedure;
  if position('engine_kind in (''ocr'',''structured_parse'')' in lower(v_src))=0
     or position('%brn%' in v_src)=0 then
    raise exception '0016 AB-3 engine predicate / brn assertion failed' using errcode='CLR10';
  end if;

  -- (2) the 0014 consent-evidence branch survived the facts-gate CoR — ADV-13:
  -- asserted on the EXECUTABLE branch expression AND its ORDER (the exemption
  -- must fire BEFORE the kind gate), never on token presence alone.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_enqueue_invoice_facts_core';
  if v_src is null
     or position('if d.document_kind=''consent_evidence'' then' in v_src)=0
     or position('d.document_kind in (''invoice'',''credit_note'',''debit_note'')' in v_src)=0
     or position('if d.document_kind=''consent_evidence'' then' in v_src)
        >= position('d.document_kind in (''invoice'',''credit_note'',''debit_note'')' in v_src) then
    raise exception '0016 _enqueue_invoice_facts_core lost the consent_evidence exemption (or its precedence over the kind gate)'
      using errcode='CLR10';
  end if;

  -- (3) PUBLIC holds zero EXECUTE + one-overload on every recreated/new fn.
  foreach v_name in array v_recreated loop
    select count(*)::int into v_public
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname='clara' and p.proname=v_name and a.grantee=0 and a.privilege_type='EXECUTE';
    if v_public<>0 then
      raise exception '0016 PUBLIC execute leaked on clara.%',v_name using errcode='CLR10';
    end if;
    select count(*)::int into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_name;
    if v_count<>1 then
      raise exception '0016 overload assertion failed: clara.% has % overloads',v_name,v_count
        using errcode='CLR10';
    end if;
  end loop;

  -- (4) the private approve core still leaks ZERO non-owner EXECUTE.
  select count(*)::int into v_extra
  from pg_proc p cross join lateral aclexplode(p.proacl) a
  join pg_roles r on r.oid=a.grantee
  where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure
    and r.rolname<>'clara_fn_owner';
  if v_extra<>0 then
    raise exception '0016 _approve_entry_core leaked % non-owner grant(s)',v_extra using errcode='CLR10';
  end if;

  -- (5) the role-grant matrix. Evaluator + classify: clara_runtime ONLY; the
  -- human writers: clara_authenticated. THE AGENT ROLE (clara_agent_ro) AND the
  -- wake roles hold ZERO EXECUTE on every new surface (contract §8).
  if not pg_catalog.has_function_privilege('clara_runtime','clara.evaluate_sst_watch(uuid,text)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.evaluate_sst_watches_all(text)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime','clara.classify_document(uuid,text,numeric,text,text)','execute')
     or pg_catalog.has_function_privilege('clara_authenticated','clara.evaluate_sst_watch(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_authenticated','clara.evaluate_sst_watches_all(text)','execute')
     or pg_catalog.has_function_privilege('clara_authenticated','clara.classify_document(uuid,text,numeric,text,text)','execute') then
    raise exception '0016 evaluator/classify grant matrix failed' using errcode='CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated','clara.set_turnover_classification(uuid,text,text,text,text,text,date,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.record_future_attestation(uuid,text,bigint,date,text,date,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.ack_compliance_watch(uuid,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.snooze_compliance_watch(uuid,timestamptz,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.resolve_compliance_watch(uuid,text,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated','clara.set_document_kind(uuid,text,text,text)','execute') then
    raise exception '0016 human-writer grant matrix failed' using errcode='CLR10';
  end if;
  foreach v_sig in array v_new_sigs loop
    if pg_catalog.has_function_privilege('clara_agent_ro',v_sig,'execute')
       or pg_catalog.has_function_privilege('clara_wake_interactive',v_sig,'execute')
       or pg_catalog.has_function_privilege('clara_wake_proactive',v_sig,'execute') then
      raise exception '0016 agent/wake role gained EXECUTE on % (must be ZERO)',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  -- no wake allowlist row admits the new fns for any wake kind.
  if exists(select 1 from clara.wake_fn_allowlist where function_name in
      ('evaluate_sst_watch','evaluate_sst_watches_all','classify_document',
       'set_document_kind','set_turnover_classification','record_future_attestation',
       'ack_compliance_watch','snooze_compliance_watch','resolve_compliance_watch')) then
    raise exception '0016 a new fn leaked into the wake allowlist' using errcode='CLR10';
  end if;

  -- (6) the human approve wrapper STILL never sets checked_via_rule_id.
  if position('checked_via_rule_id' in
      (select p.prosrc from pg_proc p where p.oid='clara.approve_entry(uuid,uuid,text,text)'::regprocedure))<>0 then
    raise exception '0016 approve_entry wrapper must not set checked_via_rule_id' using errcode='CLR10';
  end if;

  -- (7) P6 must-nots + load-bearing body markers.
  --  (7a) NO watch logic inside _approve_entry_core; the side-aware sightings ARE there.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if position('compliance' in v_src)<>0 or position('evaluate_sst' in v_src)<>0
     or position('sst_threshold' in v_src)<>0 then
    raise exception '0016 _approve_entry_core must carry NO watch logic' using errcode='CLR10';
  end if;
  if position('account_type=''income''' in v_src)=0 or position('''credit''' in v_src)=0
     or position('s.side=''debit''' in v_src)=0 then
    raise exception '0016 _approve_entry_core missing the side-aware sighting block' using errcode='CLR10';
  end if;
  --  (7b) NO compliance fn writes open_questions or journal rows (grep-assert).
  foreach v_sig in array v_compliance_fns loop
    select p.prosrc into v_src from pg_proc p where p.oid=v_sig::regprocedure;
    if position('open_questions' in v_src)<>0 then
      raise exception '0016 % must never touch open_questions',v_sig using errcode='CLR10';
    end if;
    if position('insert into clara.journal' in v_src)<>0
       or position('update clara.journal' in v_src)<>0 then
      raise exception '0016 % must never write journal rows',v_sig using errcode='CLR10';
    end if;
  end loop;
  --  (7c) executor: the named skips + the suspension flip + the retained 0015
  --  markers (count+identity gate, corroboration gate, purchase sst_output-as-
  --  outside) — and NO sanction for sst_purchase_cost.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.execute_rule_post(uuid,text)'::regprocedure;
  if position('cn_not_autopostable' in v_src)=0
     or position('purchase_sst_not_autopostable' in v_src)=0
     or position('polarity_unverified' in v_src)=0
     or position('direction_unproven' in v_src)=0
     or position('anchor_missing' in v_src)=0
     or position('customer_unresolved' in v_src)=0
     or position('evidence_class_mismatch' in v_src)=0
     or position('buyer_mismatch' in v_src)=0
     or position('floor_lost' in v_src)=0
     or position('suspended_pending_resignature' in v_src)=0
     or position('not_corroborated' in v_src)=0
     or position('v_outside_legs' in v_src)=0
     -- ADV-13: the EXECUTABLE outside-leg filter (never a prose comment) — a
     -- purchase-side sst_output leg is enumerated as an outside leg by this
     -- exact code expression.
     or position('not (v_direction=''sales'' and coalesce(a.special_acc_type,'''')=''sst_output'')' in v_src)=0
     or position('pg_exception_detail' in lower(v_src))=0 then
    raise exception '0016 execute_rule_post missing a named skip / retained 0015 gate' using errcode='CLR10';
  end if;
  --  (7d) supplier-bill floor: sst_output stays refused outright (sales-only);
  --  the sst_purchase_cost tie is present; the 0015 rounding/type markers stay.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_supplier_bill_shape(uuid)'::regprocedure;
  if position('admits no sst_output leg' in v_src)=0
     or position('sst_purchase_cost' in v_src)=0
     or position('no material amount in a rounding leg' in v_src)=0
     or position('type_polarity_mismatch' in v_src)=0 then
    raise exception '0016 _assert_supplier_bill_shape missing the sst tie / retained 0015 floors' using errcode='CLR10';
  end if;
  --  (7e) propose/sign: the sales deferral is LIFTED; the OCR floor + the
  --  direction-aware side pool are present.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.propose_autopost_rule(jsonb,text)'::regprocedure;
  if position('sales_autopost_deferred' in v_src)<>0
     or position('ocr_sales' in v_src)=0 or position('v_side' in v_src)=0 then
    raise exception '0016 propose_autopost_rule deferral-lift / OCR floor assertion failed' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.sign_autopost_rule(uuid,text)'::regprocedure;
  if position('sales_autopost_deferred' in v_src)<>0 then
    raise exception '0016 sign_autopost_rule still carries the sales deferral' using errcode='CLR10';
  end if;
  --  (7f) the facts gate + only-if-null stamping + the classify persist guard.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if position('classify' in v_src)=0 or position('skipped_kind' in v_src)=0
     or position('classify_low_confidence' in v_src)=0 then
    raise exception '0016 _enqueue_invoice_facts_core missing the classify gate' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  if position('document_kind=coalesce(document_kind' in v_src)=0
     or position('local_facts' in v_src)=0 or position('chr(1)' in v_src)=0
     or position('monetary value is malformed' in v_src)=0
     or position('must state invoice.type_code' in v_src)=0 then
    raise exception '0016 persist_invoice_facts missing only-if-null / retained 0015 refusals' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure;
  if position('settled by classify_document' in v_src)=0
     or position('myinvois.supplier_tin' in v_src)=0 or position('%brn%' in v_src)=0 then
    raise exception '0016 persist_document_extraction missing the classify guard / write-gate' using errcode='CLR10';
  end if;
  --  (7g) read surfaces: pack v3 + the watch block; the settled human lane; the
  --  queue rows/summary/coding_kind.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_context_pack(uuid,text)'::regprocedure;
  if position('''pack_schema_version'',3' in v_src)=0
     or position('sst_registration_watch' in v_src)=0
     or position('surface_and_request_professional_review_only' in v_src)=0 then
    raise exception '0016 get_context_pack missing the v3 watch block' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_draft_review(uuid,uuid)'::regprocedure;
  if position('withdrawn_at' in v_src)=0 or position('v_agent' in v_src)=0 then
    raise exception '0016 get_draft_review missing the settled human-lane payload' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.list_review_queue(jsonb,jsonb,int)'::regprocedure;
  if position('compliance_watch' in v_src)=0 or position('stale_evaluator' in v_src)=0
     or position('coding_kind' in v_src)=0 then
    raise exception '0016 list_review_queue missing the compliance rows / summary / coding_kind' using errcode='CLR10';
  end if;
  --  (7h) sst_threshold_schedule is system-maintained: NO fn granted to any app
  --  role writes it.
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
    join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and a.privilege_type='EXECUTE'
      and r.rolname in ('clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive')
      and (p.prosrc ilike '%insert into clara.sst_threshold_schedule%'
        or p.prosrc ilike '%update clara.sst_threshold_schedule%'
        or p.prosrc ilike '%delete from clara.sst_threshold_schedule%')) then
    raise exception '0016 a granted fn writes sst_threshold_schedule (must be migration-only)'
      using errcode='CLR10';
  end if;

  -- (8) shape assertions: columns, CHECKs, index, uniqueness, seeds.
  if not exists(select 1 from pg_attribute where attrelid='clara.journal_entries'::regclass
      and attname='closing_transfer' and attnotnull) then
    raise exception '0016 journal_entries.closing_transfer missing/nullable' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_attribute where attrelid='clara.rule_sightings'::regclass
      and attname='side' and attnotnull and not atthasdef) then
    raise exception '0016 rule_sightings.side missing / kept its default' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='uq_rule_sightings_mapping';
  if v_def is null or v_def not like '%side%' then
    raise exception '0016 uq_rule_sightings_mapping does not include side' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='coding_rules_status_check_0016';
  if v_def is null or v_def not like '%suspended_pending_resignature%' then
    raise exception '0016 coding_rules status CHECK missing suspension' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint where conname='ck_coding_rules_evidence_class') then
    raise exception '0016 coding_rules evidence_class CHECK missing' using errcode='CLR10';
  end if;
  -- the sales-mandatory conjunct must be NULL-proof (`is not null`, never a
  -- NULL-yielding IN) — else a classless sales autopost row passes the CHECK.
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conname='ck_coding_rules_evidence_class')
     !~* 'evidence_class\s+is\s+not\s+null' then
    raise exception '0016 evidence_class CHECK lost its NULL-proof sales conjunct'
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_coding_rules_terminal';
  if v_def is null or v_def not like '%suspended_pending_resignature%' then
    raise exception '0016 ck_coding_rules_terminal missing the suspended branch' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='coa_accounts_special_acc_type_check';
  if v_def is null or v_def not like '%sst_purchase_cost%' or v_def not like '%sst_output%' then
    raise exception '0016 coa special_acc_type CHECK missing sst_purchase_cost' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint where conname='ck_coa_sst_purchase_cost_expense') then
    raise exception '0016 sst_purchase_cost expense-typing CHECK missing' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_processing_task_lane_0016';
  if v_def is null or v_def not like '%classify%' then
    raise exception '0016 task lane CHECK missing classify' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_processing_task_lane_engine_0016';
  if v_def is null or v_def not like '%clara-classify-%' or v_def not like '%local_facts%' then
    raise exception '0016 lane<->engine CHECK missing the classify binding' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_processing_task_error_code_0016';
  if v_def is null or v_def not like '%skipped_kind%' then
    raise exception '0016 error_code CHECK missing skipped_kind' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_processing_task_binding_0016';
  if v_def is null or v_def not like '%skipped_kind%' then
    raise exception '0016 task binding CHECK missing the skipped_kind terminal shape' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='ck_document_extractions_engine_kind_0016';
  if v_def is null or v_def not like '%doc_classify%' then
    raise exception '0016 engine_kind CHECK missing doc_classify' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conname='open_questions_origin_check_0016';
  if v_def is null or v_def not like '%classification%' then
    raise exception '0016 open_questions origin CHECK missing classification' using errcode='CLR10';
  end if;
  -- ADV-13: the evaluator's supporting index asserted by CATALOG SHAPE —
  -- exact column list AND the approved-only predicate, never the name alone.
  if not exists(
    select 1 from pg_index ix
    join pg_class ic on ic.oid=ix.indexrelid
    join pg_namespace n on n.oid=ic.relnamespace
    where n.nspname='clara' and ic.relname='ix_je_client_approved_posting'
      and (select array_agg(a.attname order by k.ord)
             from unnest(ix.indkey::int2[]) with ordinality as k(attnum,ord)
             join pg_attribute a on a.attrelid=ix.indrelid and a.attnum=k.attnum)
          = array['client_id','posting_date','id']::name[]
      and pg_get_expr(ix.indpred,ix.indrelid) ilike '%status%approved%') then
    raise exception '0016 ix_je_client_approved_posting missing or wrong shape (columns/predicate)' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='clara'
      and indexname='uq_compliance_watches_one_open'
      and indexdef like '%state <> ''resolved''%') then
    raise exception '0016 one-open-episode partial unique index missing' using errcode='CLR10';
  end if;
  select count(*)::int into v_count from clara.sst_threshold_schedule
    where threshold_cents=50000000 and effective_from='2018-09-01'
      and service_group in ('G','I');
  if v_count<>2 then
    raise exception '0016 threshold schedule seeds missing (got % rows)',v_count using errcode='CLR10';
  end if;

  -- (9) new tables: RLS + FORCE + owner policy + zero direct app grants.
  foreach v_name in array v_new_tables loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_name and c.relkind='r'
          and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '0016 RLS/FORCE assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where n.nspname='clara' and c.relname=v_name and a.grantee<>(select oid
          from pg_roles where rolname='clara_fn_owner')) then
      raise exception '0016 direct table grant assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
    if not exists(select 1 from pg_policies p where p.schemaname='clara'
        and p.tablename=v_name and p.roles=array['clara_fn_owner']::name[]) then
      raise exception '0016 owner policy assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
  end loop;

  -- (10) the typed events are registered AND in the active taxonomy.
  foreach v_name in array array['compliance.watch_transition','document.classified'] loop
    if not exists(select 1 from clara.event_types where name=v_name)
       or not exists(select 1 from clara.trigger_taxonomy t join clara.taxonomy_active a
          on a.version=t.version and a.singleton where t.event_type=v_name) then
      raise exception '0016 % taxonomy pair assertion failed',v_name using errcode='CLR10';
    end if;
  end loop;
end $$;

-- =====================================================================
-- D-P1 SMOKE PROBE — the statutory boundary + the ladder, live against the
-- REAL evaluator and human writers, fully rolled back (sentinel ZA016).
-- RM 500,000.00 exactly must NOT cross (strict >); +1 sen must cross with the
-- correct earliest month + due date; ack stores the +10pp re-arm bound and a
-- +10pp movement re-arms; a 61-day snooze refuses; a typed resolution closes
-- the episode and 'registration_recorded' never auto-reopens. The watch path
-- writes ZERO open_questions.
-- =====================================================================
do $$
declare
  v_firm uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
  v_client uuid:=gen_random_uuid(); v_res jsonb; v_watch uuid; v_e uuid;
  v_m date:=(date_trunc('month',current_date)-interval '1 month')::date;
  v_cm date:=date_trunc('month',current_date)::date;
  i int; v_err boolean;
begin
  begin
    insert into clara.firms(id,name) values(v_firm,'0016 watch probe');
    insert into clara.users(id,display_name,email) values(v_user,'0016 watch probe',
      '0016-watch-'||v_user||'@invalid.example');
    insert into clara.firm_memberships(firm_id,user_id,role) values(v_firm,v_user,'owner');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user)::text,true);
    insert into clara.clients(id,firm_id,name) values(v_client,v_firm,'0016 watch client');
    insert into clara.coa_accounts(client_id,account_code,name,account_type)
      values(v_client,'500-000','Revenue','income'),
            (v_client,'300-000','Trade debtors','asset');
    perform clara.set_turnover_classification(v_client,'500-000','included','G',
      'probe classification','probe evidence','2018-09-01','0016-probe-cls');
    -- exactly RM500,000.00 of included turnover across the 12 months ending
    -- LAST month (11 x 4,000,000 + 6,000,000 in the oldest month). Lines land
    -- while the entry is a draft (line immutability), then a legal
    -- draft->approved transition.
    for i in 0..11 loop
      insert into clara.journal_entries(client_id,status,posting_date,memo,origin,maker_actor)
        values(v_client,'draft',(v_m-make_interval(months=>i))::date,
          '0016 probe revenue','manual',v_user) returning id into v_e;
      insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents)
        values(v_e,1,'300-000',case when i=11 then 6000000 else 4000000 end,0),
              (v_e,2,'500-000',0,case when i=11 then 6000000 else 4000000 end);
      update clara.journal_entries set status='approved',checker_actor=v_user,
        approved_at=now(),updated_at=now() where id=v_e;
    end loop;
    v_res:=clara.evaluate_sst_watch(v_client,'0016-probe-eval1');
    if v_res->>'status'<>'ok' then
      raise exception '0016 probe: evaluator failed: %',v_res::text using errcode='CLR10';
    end if;
    -- ADV-7: the statutory window ends at the last COMPLETED month (v_m), so
    -- the confirmed figure is the FULL RM500,000.00 = 50,000,000c — still NOT
    -- crossed (strict >).
    if v_res->'groups'->0->>'state'<>'early_warning'
       or (v_res->'groups'->0->>'earliest_crossing_month') is not null
       or (v_res->'groups'->0->>'confirmed_included_cents')::bigint<>50000000 then
      raise exception '0016 probe: RM500,000.00 exactly must NOT cross (got %)',v_res::text
        using errcode='CLR10';
    end if;
    -- +1 sen inside the window ending last month => crossed, earliest = last month.
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,maker_actor)
      values(v_client,'draft',v_m,'0016 probe one sen','manual',v_user)
      returning id into v_e;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents)
      values(v_e,1,'300-000',1,0),(v_e,2,'500-000',0,1);
    update clara.journal_entries set status='approved',checker_actor=v_user,
      approved_at=now(),updated_at=now() where id=v_e;
    v_res:=clara.evaluate_sst_watch(v_client,'0016-probe-eval2');
    if v_res->'groups'->0->>'state'<>'crossed'
       or (v_res->'groups'->0->>'earliest_crossing_month')::date<>v_m
       or (v_res->'groups'->0->>'application_due')::date
          <>((v_m+interval '2 months')::date-1) then
      raise exception '0016 probe: +1 sen must cross at % (got %)',v_m,v_res::text
        using errcode='CLR10';
    end if;
    v_watch:=(v_res->'groups'->0->>'watch_id')::uuid;
    -- ack stores the +10pp bound (statutory confirmed 50,000,001 + 5,000,000).
    perform clara.ack_compliance_watch(v_watch,'probe acknowledged','0016-probe-ack');
    if (select next_rearm_cents from clara.compliance_watches where id=v_watch)
       <>50000001+5000000 then
      raise exception '0016 probe: ack must store the +10pp re-arm bound' using errcode='CLR10';
    end if;
    -- ADV-7: CURRENT-MONTH movement is PROVISIONAL — it must set the
    -- provisional figures without touching the statutory state or re-arming
    -- the acknowledged watch (the statutory machine stays clean).
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,maker_actor)
      values(v_client,'draft',v_cm,'0016 probe provisional','manual',v_user)
      returning id into v_e;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents)
      values(v_e,1,'300-000',99000000,0),(v_e,2,'500-000',0,99000000);
    update clara.journal_entries set status='approved',checker_actor=v_user,
      approved_at=now(),updated_at=now() where id=v_e;
    v_res:=clara.evaluate_sst_watch(v_client,'0016-probe-eval2b');
    if (select acknowledged_at from clara.compliance_watches where id=v_watch) is null
       or (select confirmed_included_cents from clara.compliance_watches where id=v_watch)<>50000001
       or not (select provisional_crossed from clara.compliance_watches where id=v_watch)
       or (select provisional_included_cents from clara.compliance_watches where id=v_watch)
          <>143000001 then
      raise exception '0016 probe: current-month movement must stay provisional (got %)',
        v_res::text using errcode='CLR10';
    end if;
    -- a +10pp movement in a COMPLETED month re-arms.
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,maker_actor)
      values(v_client,'draft',v_m,'0016 probe movement','manual',v_user)
      returning id into v_e;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents)
      values(v_e,1,'300-000',5000100,0),(v_e,2,'500-000',0,5000100);
    update clara.journal_entries set status='approved',checker_actor=v_user,
      approved_at=now(),updated_at=now() where id=v_e;
    v_res:=clara.evaluate_sst_watch(v_client,'0016-probe-eval3');
    if (select acknowledged_at from clara.compliance_watches where id=v_watch) is not null
       or not exists(select 1 from clara.compliance_watch_events
         where watch_id=v_watch and event_kind='re_armed') then
      raise exception '0016 probe: a +10pp movement must re-arm the acknowledged watch'
        using errcode='CLR10';
    end if;
    -- a snooze beyond 60 days refuses.
    v_err:=false;
    begin
      perform clara.snooze_compliance_watch(v_watch,now()+interval '61 days',
        'probe snooze','0016-probe-sn1');
    exception when sqlstate 'CLR10' then v_err:=true;
    end;
    if not v_err then
      raise exception '0016 probe: a 61-day snooze must refuse' using errcode='CLR10';
    end if;
    -- a typed resolution closes the episode; registration is sticky.
    perform clara.resolve_compliance_watch(v_watch,'registration_recorded',
      'SST-02 registration recorded (probe)','0016-probe-res');
    v_res:=clara.evaluate_sst_watch(v_client,'0016-probe-eval4');
    if exists(select 1 from clara.compliance_watches
        where client_id=v_client and state<>'resolved')
       or v_res->'groups'->0->>'state'<>'resolved_episode' then
      raise exception '0016 probe: registration_recorded must never auto-reopen (got %)',
        v_res::text using errcode='CLR10';
    end if;
    -- the watch path wrote ZERO open_questions (P6).
    if exists(select 1 from clara.open_questions where client_id=v_client) then
      raise exception '0016 probe: the watch path wrote open_questions' using errcode='CLR10';
    end if;
    raise exception '0016 watch probe rollback' using errcode='ZA016';
  exception when sqlstate 'ZA016' then null;
  end;
end $$;

-- =====================================================================
-- D-P3 SMOKE PROBE — the classifier gate (sentinel ZB016). A NULL-kind pdf
-- enqueues CLASSIFY first (clara-classify engine); a classified
-- payroll_summary NEVER reaches invoice_facts (skipped_kind); xml stays
-- rule-classified into local_facts without waiting on the classifier; a
-- low-confidence verdict leaves the kind NULL and holds (never loops).
-- =====================================================================
do $$
declare
  v_firm uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
  v_doc uuid:=gen_random_uuid(); v_doc2 uuid:=gen_random_uuid();
  v_doc3 uuid:=gen_random_uuid(); v_res jsonb; v_task uuid;
begin
  begin
    insert into clara.firms(id,name) values(v_firm,'0016 classify probe');
    insert into clara.users(id,display_name,email) values(v_user,'0016 classify probe',
      '0016-classify-'||v_user||'@invalid.example');
    insert into clara.documents(id,firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,uploaded_by,bytes_verified_at)
      values(v_doc,v_firm,repeat('c',64),'probe.pdf','application/pdf',1,
        'firms/'||v_firm||'/docs/'||repeat('c',64)||'.pdf',v_user,now()),
       (v_doc2,v_firm,repeat('d',64),'probe.xml','application/xml',1,
        'firms/'||v_firm||'/docs/'||repeat('d',64)||'.xml',v_user,now()),
       (v_doc3,v_firm,repeat('e',64),'probe3.pdf','application/pdf',1,
        'firms/'||v_firm||'/docs/'||repeat('e',64)||'.pdf',v_user,now());
    -- NULL kind + pdf => classify first.
    v_res:=clara._enqueue_invoice_facts_core(v_doc);
    if v_res->>'status'<>'queued' then
      raise exception '0016 probe: NULL-kind pdf must enqueue classify (got %)',v_res::text
        using errcode='CLR10';
    end if;
    v_task:=(v_res->>'task_id')::uuid;
    if not exists(select 1 from clara.document_processing_tasks
        where id=v_task and lane='classify' and engine_id like 'clara-classify-%') then
      raise exception '0016 probe: the classify task lane/engine binding failed' using errcode='CLR10';
    end if;
    -- claim (local lane: no egress hold) then classify with high confidence.
    v_res:=clara.claim_document_processing_task(v_task,'0016-probe-wf',false);
    if v_res->>'status'<>'running' then
      raise exception '0016 probe: classify claim failed (got %)',v_res::text using errcode='CLR10';
    end if;
    v_res:=clara.classify_document(v_doc,'payroll_summary',0.97,
      'clara-classify-llm:v1','0016-probe-cls1');
    if (select document_kind from clara.documents where id=v_doc)<>'payroll_summary'
       or not exists(select 1 from clara.document_extractions
         where document_id=v_doc and engine_kind='doc_classify' and status='done') then
      raise exception '0016 probe: classify_document did not persist the verdict' using errcode='CLR10';
    end if;
    -- the facts gate must now SKIP the kind — payroll_summary never reaches
    -- invoice_facts.
    v_res:=clara._enqueue_invoice_facts_core(v_doc);
    if v_res->>'status'<>'skipped_kind' then
      raise exception '0016 probe: payroll_summary must never reach invoice_facts (got %)',
        v_res::text using errcode='CLR10';
    end if;
    -- (adjudication #11) the skipped_kind receipt lives on the task trail and
    -- is reused idempotently.
    if not exists(select 1 from clara.document_processing_tasks
        where id=(v_res->>'task_id')::uuid and document_id=v_doc
          and status='failed' and error_code='skipped_kind') then
      raise exception '0016 probe: skipped_kind must leave a task-trail receipt' using errcode='CLR10';
    end if;
    if (clara._enqueue_invoice_facts_core(v_doc)->>'task_id')<>v_res->>'task_id' then
      raise exception '0016 probe: the skipped_kind receipt must be reused, not duplicated'
        using errcode='CLR10';
    end if;
    -- xml stays rule-classified: straight to local_facts, no classifier wait.
    v_res:=clara._enqueue_invoice_facts_core(v_doc2);
    if v_res->>'status'<>'queued' or not exists(select 1 from clara.document_processing_tasks
        where id=(v_res->>'task_id')::uuid and lane='local_facts') then
      raise exception '0016 probe: NULL-kind xml must enqueue local_facts (got %)',v_res::text
        using errcode='CLR10';
    end if;
    -- low confidence leaves the kind NULL and holds without looping.
    v_res:=clara._enqueue_invoice_facts_core(v_doc3);
    v_task:=(v_res->>'task_id')::uuid;
    perform clara.claim_document_processing_task(v_task,'0016-probe-wf3',false);
    v_res:=clara.classify_document(v_doc3,'invoice',0.5,
      'clara-classify-llm:v1','0016-probe-cls3');
    if (select document_kind from clara.documents where id=v_doc3) is not null then
      raise exception '0016 probe: a low-confidence verdict must leave the kind NULL'
        using errcode='CLR10';
    end if;
    v_res:=clara._enqueue_invoice_facts_core(v_doc3);
    if v_res->>'status'<>'classify_low_confidence' then
      raise exception '0016 probe: the low-confidence hold must not loop (got %)',v_res::text
        using errcode='CLR10';
    end if;
    raise exception '0016 classify probe rollback' using errcode='ZB016';
  exception when sqlstate 'ZB016' then null;
  end;
end $$;

-- =====================================================================
-- D-P4 SMOKE PROBE — the purchase-SST visibility tie (sentinel ZC016). A
-- supplier bill with a stated tax fact admits ONE tied sst_purchase_cost DEBIT
-- leg; a mistied leg refuses CLR21 tax_tie_failed; a second leg refuses CLR23;
-- an sst_output leg on a purchase STILL refuses outright; a leg with NO stated
-- tax fact refuses.
-- =====================================================================
do $$
declare
  v_firm uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
  v_client uuid:=gen_random_uuid(); v_cp uuid:=gen_random_uuid();
  v_doc uuid:=gen_random_uuid(); v_doc2 uuid:=gen_random_uuid();
  v_ext uuid:=gen_random_uuid(); v_ext2 uuid:=gen_random_uuid();
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid; v_err boolean;
  v_sha text:=repeat('f',64); v_sha2 text:=repeat('a',64);
  v_fil uuid:=gen_random_uuid(); v_fil2 uuid:=gen_random_uuid();
  v_res1 uuid:=gen_random_uuid(); v_res2 uuid:=gen_random_uuid();
begin
  begin
    insert into clara.firms(id,name) values(v_firm,'0016 sst probe');
    insert into clara.users(id,display_name,email) values(v_user,'0016 sst probe',
      '0016-sst-'||v_user||'@invalid.example');
    insert into clara.clients(id,firm_id,name) values(v_client,v_firm,'0016 sst client');
    insert into clara.coa_accounts(client_id,account_code,name,account_type)
      values(v_client,'600-000','Purchases','expense');
    insert into clara.coa_accounts(client_id,account_code,name,account_type,special_acc_type)
      values(v_client,'610-000','SST in cost','expense','sst_purchase_cost'),
            (v_client,'620-000','SST output','liability','sst_output');
    insert into clara.coa_accounts(client_id,account_code,name,account_type,account_class)
      values(v_client,'400-000','Trade creditors','liability','payable');
    insert into clara.counterparties(id,firm_id,client_id,kind,name,name_normalized,created_by)
      values(v_cp,v_firm,v_client,'vendor','Probe Vendor','probevendor',v_user);
    -- document + facts extraction (fixture engine escape; task joined by
    -- _invoice_fact_state) stating tax_total = RM 6,000.00.
    insert into clara.documents(id,firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,uploaded_by,bytes_verified_at)
      values(v_doc,v_firm,v_sha,'bill.pdf','application/pdf',1,
        'firms/'||v_firm||'/docs/'||v_sha||'.pdf',v_user,now()),
       (v_doc2,v_firm,v_sha2,'bill2.pdf','application/pdf',1,
        'firms/'||v_firm||'/docs/'||v_sha2||'.pdf',v_user,now());
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at,finished_at)
      values(v_firm,v_doc,'clara-fixture:v1','{}'::jsonb,1,'invoice_facts','done',
        '0016-probe',now(),now()),
       (v_firm,v_doc2,'clara-fixture:v1','{}'::jsonb,1,'invoice_facts','done',
        '0016-probe',now(),now());
    insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count)
      values(v_ext,v_firm,v_doc,'clara-fixture:v1','invoice_facts',1,'done',1),
            (v_ext2,v_firm,v_doc2,'clara-fixture:v1','invoice_facts',1,'done',1);
    insert into clara.client_resolutions(id,client_id,subject_kind,subject_id,confidence,
        method,resolved_by)
      values(v_res1,v_client,'document',v_doc,1.0,'human',v_user),
            (v_res2,v_client,'document',v_doc2,1.0,'human',v_user);
    insert into clara.document_filings(id,firm_id,document_id,client_id,filed_by,
        resolution_id,basis)
      values(v_fil,v_firm,v_doc,v_client,v_user,v_res1,'human'),
            (v_fil2,v_firm,v_doc2,v_client,v_user,v_res2,'human');
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,monetary_raw,monetary_cents,engine_confidence)
      values(v_firm,v_ext,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'invoice.tax_total','6,000.00','6,000.00',600000,1.0);
    -- (1) tied: Dr expense 100,000.00 + Dr sst 6,000.00 / Cr payable 106,000.00 PASSES.
    -- Each case withdraws its draft afterwards (one open draft per filing).
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,maker_actor,coding_kind)
      values(v_client,'draft',current_date,null,'document',v_doc,v_fil,v_sha,v_user,'supplier_bill')
      returning id into v_e1;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,counterparty_id)
      values(v_e1,1,'600-000',10000000,0,null),(v_e1,2,'610-000',600000,0,null),
            (v_e1,3,'400-000',0,10600000,v_cp);
    perform clara._assert_supplier_bill_shape(v_e1);
    update clara.journal_entries set status='withdrawn',withdrawn_by=v_user,
      withdrawn_at=now(),withdrawal_reason='probe',updated_at=now() where id=v_e1;
    -- (2) mistied leg refuses CLR21 tax_tie_failed.
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,maker_actor,coding_kind)
      values(v_client,'draft',current_date,null,'document',v_doc,v_fil,v_sha,v_user,'supplier_bill')
      returning id into v_e2;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,counterparty_id)
      values(v_e2,1,'600-000',10000001,0,null),(v_e2,2,'610-000',599999,0,null),
            (v_e2,3,'400-000',0,10600000,v_cp);
    v_err:=false;
    begin perform clara._assert_supplier_bill_shape(v_e2);
    exception when sqlstate 'CLR21' then v_err:=true; end;
    if not v_err then
      raise exception '0016 probe: a mistied sst_purchase_cost leg must refuse' using errcode='CLR10';
    end if;
    update clara.journal_entries set status='withdrawn',withdrawn_by=v_user,
      withdrawn_at=now(),withdrawal_reason='probe',updated_at=now() where id=v_e2;
    -- (3) two sst_purchase_cost legs refuse CLR23.
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,maker_actor,coding_kind)
      values(v_client,'draft',current_date,null,'document',v_doc,v_fil,v_sha,v_user,'supplier_bill')
      returning id into v_e3;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,counterparty_id)
      values(v_e3,1,'600-000',10000000,0,null),(v_e3,2,'610-000',300000,0,null),
            (v_e3,3,'610-000',300000,0,null),(v_e3,4,'400-000',0,10600000,v_cp);
    v_err:=false;
    begin perform clara._assert_supplier_bill_shape(v_e3);
    exception when sqlstate 'CLR23' then v_err:=true; end;
    if not v_err then
      raise exception '0016 probe: a second sst_purchase_cost leg must refuse' using errcode='CLR10';
    end if;
    update clara.journal_entries set status='withdrawn',withdrawn_by=v_user,
      withdrawn_at=now(),withdrawal_reason='probe',updated_at=now() where id=v_e3;
    -- (4) sst_output on a purchase STILL refuses outright (sales-only, unchanged).
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,maker_actor,coding_kind)
      values(v_client,'draft',current_date,null,'document',v_doc,v_fil,v_sha,v_user,'supplier_bill')
      returning id into v_e4;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,counterparty_id)
      values(v_e4,1,'600-000',10000000,0,null),(v_e4,2,'620-000',600000,0,null),
            (v_e4,3,'400-000',0,10600000,v_cp);
    v_err:=false;
    begin perform clara._assert_supplier_bill_shape(v_e4);
    exception when sqlstate 'CLR23' then v_err:=true; end;
    if not v_err then
      raise exception '0016 probe: a purchase sst_output leg must refuse outright' using errcode='CLR10';
    end if;
    update clara.journal_entries set status='withdrawn',withdrawn_by=v_user,
      withdrawn_at=now(),withdrawal_reason='probe',updated_at=now() where id=v_e4;
    -- (5) an sst_purchase_cost leg with NO stated tax fact refuses.
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,maker_actor,coding_kind)
      values(v_client,'draft',current_date,null,'document',v_doc2,v_fil2,v_sha2,v_user,'supplier_bill')
      returning id into v_e5;
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,counterparty_id)
      values(v_e5,1,'600-000',10000000,0,null),(v_e5,2,'610-000',600000,0,null),
            (v_e5,3,'400-000',0,10600000,v_cp);
    v_err:=false;
    begin perform clara._assert_supplier_bill_shape(v_e5);
    exception when sqlstate 'CLR21' then v_err:=true; end;
    if not v_err then
      raise exception '0016 probe: an sst_purchase_cost leg without a stated tax fact must refuse'
        using errcode='CLR10';
    end if;
    raise exception '0016 sst probe rollback' using errcode='ZC016';
  exception when sqlstate 'ZC016' then null;
  end;
end $$;
