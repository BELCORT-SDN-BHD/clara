-- 0317_schedule_term_correction — #939 AC4 / #941 AC3 (riders wave 4, lane 04): THE CORRECTION
-- PATH BOTH TICKETS NAME EXISTS IN NO DOOR.
-- =====================================================================================
-- Spec of record: issue #939's Agent Brief, acceptance criterion 4 and owner decision 3
-- (2026-09-18), and issue #941's acceptance criterion 3 and its cell list ("a term correction").
--
-- THE SENTENCE THIS FILE IMPLEMENTS, from the tickets' own words:
--
--   #939 decision 3 — "A mis-stated term is corrected by superseding it and opening a new schedule
--                      from the next period; already-posted periods are never touched."
--   #939 AC4       — "Superseding a stated term never alters a running schedule; A NEW SCHEDULE
--                      FROM THE NEXT PERIOD IS THE ONLY CORRECTION PATH; a cell proves posted
--                      occurrences and their receipts are unchanged."
--   #941 AC3       — "…superseding a term never alters a running schedule AND A NEW SCHEDULE FROM
--                      THE NEXT PERIOD IS THE ONLY CORRECTION."
--
-- Each of those sentences has two halves. 0305/0308 built the prohibition (the allocation is
-- append-only and a correction never moves it) and proved it. Neither built the ACT, so until this
-- file a firm that mis-stated a term was left with a wrong amortisation running and no remedy at
-- all: `uq_prepayment_schedules_source` (0223) and `uq_revenue_recognition_schedules_source` (0308)
-- were UNCONDITIONAL `unique (source_entry_id)` constraints, so a replacement was refused CLR13
-- while the first schedule ran AND after it had been ended.
--
-- THE DERIVATION IS PROSPECTIVE, AND THE TICKET CHOSE IT RATHER THAN THIS FILE. "already-posted
-- periods are never touched" and "a new schedule FROM THE NEXT PERIOD" are a change in accounting
-- ESTIMATE applied prospectively (MPERS section 10 / MFRS 108): the periods the schedule has
-- already taken up stand, and the balance those periods did not consume is re-spread over whatever
-- of the corrected term is still open. The alternative — treating the first amortisation as an
-- error, reversing it and re-deriving — is a prior-period correction, and the tickets exclude it in
-- the same breath ("already-posted periods are never touched"). No new professional judgement is
-- asked of the estate here; the judgement is the TERM, and a named person already stated it through
-- `clara.record_prepayment_stated_term` or `clara.record_document_service_period`.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A supersession chain on both schedule relations (the
-- `clara.prepayment_stated_terms` shape, verbatim), a partial uniqueness rule that admits at most
-- one LIVE schedule per recognition instead of at most one ever, the two shared predicates the act
-- needs (has the term moved? which periods has this plan already taken up?), and ONE human door per
-- lane — `clara.replace_prepayment_schedule` and `clara.replace_revenue_recognition_schedule`.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--   · It mints NO machine lane. A term correction is a judgement about a client's books made by a
--     named person; an OBO twin and a wake wrapper would both be a lane that could re-derive a
--     client's amortisation with nobody's name on it. `clara_runtime`, both agent read roles and
--     all four wake lanes gain ZERO, and the tail asserts the absence by pg_proc count.
--   · It edits NO frozen body: `clara.prepayment_schedule_v1`, `clara.prepayment_schedule_v2` and
--     every registered evaluator member are untouched (the tail re-measures v1 and v2).
--   · It adds NO web surface. #939 AC5 and #941 AC6 enumerate the surfaces those tickets buy and
--     neither names a correction control, so building one here would widen the ticket
--     (WORK-ORDER.md rule 5). The register copy that used to describe the estate as HAVING no
--     correction path is corrected in the same branch, because it is now false.
--   · It re-derives no schedule that already exists. Every existing row keeps `superseded_at` null,
--     which is exactly "live", so the new uniqueness rule admits precisely the estate that stood
--     before this file.
--
-- ==================== THE PRESTATE PINS ARE PER BODY, NOT GLOBAL ====================
-- 0305's reasoning, restated because it binds here too: this file recuts SIX bodies for TWO
-- different reasons, so each body admits exactly TWO pre-images of its OWN — its measured live
-- sha256(prosrc), or a body that already carries this file's own `0317` attribution — and anything
-- else is real drift and still refuses BY NAME. The mode each body was found in is reported in the
-- notice, so a half-and-half reading is visible rather than silent.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md): `add column if not exists`,
-- `create or replace function`, `drop trigger if exists` before each `create trigger`, every
-- constraint added under a `pg_constraint` guard, `create unique index if not exists`, and
-- `drop constraint if exists` for the one constraint this file retires.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: the three columns added
                                        -- to each relation are nullable with no default, which
                                        -- PostgreSQL records in the catalog without rewriting the
                                        -- heap, and the one new index is partial over a relation
                                        -- with one row per configured schedule.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0317_pre$
declare
  v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE SIX BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (rule:
  -- pin what is LIVE, never a literal copied from an older migration's text). 0305/0307/0308/0315
  -- all moved some of these; the shas below are that text as it stands after 0315.
  v_recut text[][] := array[
    ['clara._tf_prepayment_schedules_append_only()',
     '21d1fe05f5c9cc837a6f80bd8ec36954c46a395054b2c8278b938140202aa18c'],
    ['clara._tf_revenue_recognition_schedules_append_only()',
     'aaaa4202ad8c5b7adb40accf897290753763d26257c0903dcf5d743804437d5e'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     '78bbfce7ae46b3445a93689700958f727a1b795cdf483c7c522beef4f7b46ee2'],
    ['clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
     '03417b7903a6bf04ea49199bb6af27375537d49707874025b9ec62507705bf24'],
    ['clara.read_prepayment_source_for(uuid,uuid,uuid)',
     '6475458ed34d9b9ef357f8fb6e4eb9766042e30e1252c30d607fabd1a120495b'],
    ['clara.read_revenue_recognition_source_for(uuid,uuid,uuid)',
     '00501a388ada95f1a7db9fccf9ad1d94f04c0067083fd3c457ee9a06ecbe06ab']
  ];
  -- …AND THE NEIGHBOURS THIS FILE RELIES ON AND MUST NOT MOVE. The two doors below nest each of
  -- them; a body that drifted under this file would change what a correction DOES without changing
  -- a line of it, which is the failure mode a prestate exists to catch.
  v_keep text[][] := array[
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara._assert_journal_basis(jsonb)',
     '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684'],
    ['clara.end_accounting_plan(uuid,text,text)',
     'b3d6f214b2fa8e875ad3bce966bf51557f235b3b0d046a06cdb0e208b58f870c'],
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     'c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188']
  ];
begin
  -- 1 · THE TWO CARRIERS THIS FILE'S WHOLE ACT DEPENDS ON ALREADY CARRY A SUPERSESSION CHAIN.
  --     `clara.prepayment_stated_terms` (0305) and `clara.document_service_periods` (0140) each
  --     hold `superseded_by`/`superseded_at` and a live-row uniqueness rule. Without both, "the
  --     term has been corrected" is not a question the estate can answer.
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.prepayment_stated_terms'::regclass
                    and attname = 'superseded_at' and not attisdropped) then
    raise exception '0317 prestate: clara.prepayment_stated_terms carries no supersession stamp'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.document_service_periods'::regclass
                    and attname = 'superseded_at' and not attisdropped) then
    raise exception '0317 prestate: clara.document_service_periods carries no supersession stamp'
      using errcode='CLR10';
  end if;

  -- 2 · THE UNCONDITIONAL UNIQUENESS THIS FILE RETIRES IS STILL UNCONDITIONAL. Pinned as a
  --     CONSTRAINT DEFINITION rather than by name alone: the finding this file closes is that the
  --     rule carries NO status predicate, so a later partial index of the same name would be a
  --     different rule wearing the same label.
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.prepayment_schedules'::regclass
                and conname = 'uq_prepayment_schedules_source') then
    if (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid = 'clara.prepayment_schedules'::regclass
           and conname = 'uq_prepayment_schedules_source') <> 'UNIQUE (source_entry_id)' then
      raise exception '0317 prestate: uq_prepayment_schedules_source is not the unconditional rule this file retires'
        using errcode='CLR10';
    end if;
    v_first := v_first + 1; v_modes := v_modes || 'chain=FIRST ';
  else
    if not exists (select 1 from pg_indexes where schemaname = 'clara'
                    and indexname = 'uq_prepayment_schedules_source_live') then
      raise exception '0317 prestate: the unconditional prepayment rule is gone and this file''s replacement is not there either'
        using errcode='CLR10';
    end if;
    v_redo := v_redo + 1; v_modes := v_modes || 'chain=REDO ';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.revenue_recognition_schedules'::regclass
                and conname = 'uq_revenue_recognition_schedules_source') then
    if (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid = 'clara.revenue_recognition_schedules'::regclass
           and conname = 'uq_revenue_recognition_schedules_source') <> 'UNIQUE (source_entry_id)' then
      raise exception '0317 prestate: uq_revenue_recognition_schedules_source is not the unconditional rule this file retires'
        using errcode='CLR10';
    end if;
  elsif not exists (select 1 from pg_indexes where schemaname = 'clara'
                     and indexname = 'uq_revenue_recognition_schedules_source_live') then
    raise exception '0317 prestate: the unconditional deferred-revenue rule is gone and this file''s replacement is not there either'
      using errcode='CLR10';
  end if;

  -- 3 · THE SIX RECUT BODIES, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0317 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0317' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0317 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE NEIGHBOURS ARE EXACTLY WHAT THE DOORS BELOW WERE WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2]
      -- RIDERS WAVE 4 INTEGRATION. BIMODAL for clara.create_accounting_plan, whose body 0308
      -- recuts: on the integrated chain 0308 recuts from 0300's post-image (it carries the third
      -- authority_ref kind contract_confirmation that lane 01's 0300 added), so its output is
      -- a7c108d5... rather than the c8e99098... this lane measured on a rig with no 0300. Admitted
      -- at EITHER value; every other pin in this array stays exact. Precedent: wave 3's 0284.
       and v_sha is distinct from (case v_keep[v_i][1]
            when 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'
              then 'a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c'
            else null end) then
      raise exception '0317 prestate: % moved (expected %, live %)',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  -- 5 · NEITHER DOOR THIS FILE MINTS MAY ALREADY EXIST UNDER A DIFFERENT SHAPE.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'clara' and p.proname = 'replace_prepayment_schedule'
                and pg_get_function_identity_arguments(p.oid)
                      <> 'p_client uuid, p_schedule uuid, p_reason text, p_authority_ref jsonb, p_op_key text') then
    raise exception '0317 prestate: a clara.replace_prepayment_schedule of another shape exists'
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'clara' and p.proname = 'replace_revenue_recognition_schedule'
                and pg_get_function_identity_arguments(p.oid)
                      <> 'p_client uuid, p_schedule uuid, p_reason text, p_authority_ref jsonb, p_op_key text') then
    raise exception '0317 prestate: a clara.replace_revenue_recognition_schedule of another shape exists'
      using errcode='CLR10';
  end if;

  raise notice '0317 prestate OK — % FIRST, % REDO — %', v_first, v_redo, v_modes;
end $c0317_pre$;

-- =====================================================================================
-- §A — THE SUPERSESSION CHAIN ON BOTH SCHEDULE RELATIONS.
--
-- THE SHAPE IS `clara.prepayment_stated_terms`' OWN (0305:172-175, 0055:401-408's idiom), not a
-- second design: a predecessor stamped with its successor's id, the stamp DEFERRABLE so the door
-- can stamp and insert in one transaction, and both columns moving together or not at all. What is
-- added beyond that shape is `replaces_schedule_id`, so the chain reads FORWARDS from the
-- replacement as well as backwards from the predecessor — a surface showing a schedule needs to
-- name the one it took over from without scanning for whoever points at it.
-- =====================================================================================
alter table clara.prepayment_schedules
  add column if not exists superseded_by        uuid,
  add column if not exists superseded_at        timestamptz,
  add column if not exists replaces_schedule_id uuid;

alter table clara.revenue_recognition_schedules
  add column if not exists superseded_by        uuid,
  add column if not exists superseded_at        timestamptz,
  add column if not exists replaces_schedule_id uuid;

do $c0317_fk$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'clara.prepayment_schedules'::regclass
                  and conname = 'fk_ps_superseded_by') then
    alter table clara.prepayment_schedules
      add constraint fk_ps_superseded_by foreign key (superseded_by)
        references clara.prepayment_schedules(id) deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.prepayment_schedules'::regclass
                  and conname = 'fk_ps_replaces') then
    alter table clara.prepayment_schedules
      add constraint fk_ps_replaces foreign key (replaces_schedule_id)
        references clara.prepayment_schedules(id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.prepayment_schedules'::regclass
                  and conname = 'ck_ps_supersession_paired') then
    alter table clara.prepayment_schedules
      add constraint ck_ps_supersession_paired
        check ((superseded_by is null) = (superseded_at is null));
  end if;
  -- A SCHEDULE NEVER REPLACES ITSELF. Cheap, and it is the one shape that would make the chain a
  -- cycle a reader could follow for ever.
  if not exists (select 1 from pg_constraint where conrelid = 'clara.prepayment_schedules'::regclass
                  and conname = 'ck_ps_chain_not_self') then
    alter table clara.prepayment_schedules
      add constraint ck_ps_chain_not_self
        check (superseded_by is distinct from id and replaces_schedule_id is distinct from id);
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.revenue_recognition_schedules'::regclass
                    and conname = 'fk_rrs_superseded_by') then
    alter table clara.revenue_recognition_schedules
      add constraint fk_rrs_superseded_by foreign key (superseded_by)
        references clara.revenue_recognition_schedules(id) deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.revenue_recognition_schedules'::regclass
                    and conname = 'fk_rrs_replaces') then
    alter table clara.revenue_recognition_schedules
      add constraint fk_rrs_replaces foreign key (replaces_schedule_id)
        references clara.revenue_recognition_schedules(id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.revenue_recognition_schedules'::regclass
                    and conname = 'ck_rrs_supersession_paired') then
    alter table clara.revenue_recognition_schedules
      add constraint ck_rrs_supersession_paired
        check ((superseded_by is null) = (superseded_at is null));
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.revenue_recognition_schedules'::regclass
                    and conname = 'ck_rrs_chain_not_self') then
    alter table clara.revenue_recognition_schedules
      add constraint ck_rrs_chain_not_self
        check (superseded_by is distinct from id and replaces_schedule_id is distinct from id);
  end if;
end $c0317_fk$;

-- ---- THE UNIQUENESS RULE IS QUALIFIED, NEVER DROPPED. ----
--
-- Before this file: at most one schedule per recognition, EVER. After it: at most one LIVE schedule
-- per recognition, with the superseded chain on the record. The structural rule is still the
-- authority — both doors' typed CLR13 is the readable answer in front of it, and both cores'
-- `unique_violation` handlers still re-raise that same payload behind it.
alter table clara.prepayment_schedules drop constraint if exists uq_prepayment_schedules_source;
create unique index if not exists uq_prepayment_schedules_source_live
  on clara.prepayment_schedules (source_entry_id) where superseded_at is null;
create index if not exists ix_prepayment_schedules_replaces
  on clara.prepayment_schedules (replaces_schedule_id) where replaces_schedule_id is not null;

alter table clara.revenue_recognition_schedules
  drop constraint if exists uq_revenue_recognition_schedules_source;
create unique index if not exists uq_revenue_recognition_schedules_source_live
  on clara.revenue_recognition_schedules (source_entry_id) where superseded_at is null;
create index if not exists ix_revenue_recognition_schedules_replaces
  on clara.revenue_recognition_schedules (replaces_schedule_id) where replaces_schedule_id is not null;

set role clara_fn_owner;

-- ---- THE TWO APPEND-ONLY TRIGGERS ADMIT EXACTLY ONE UPDATE: THE STAMP. ----
--
-- `clara._tf_pst_supersede_only` (0305) is the shape, and the difference is deliberate: that body
-- lists the columns it forbids by name, which is right for a five-column carrier and wrong for a
-- twenty-five-column derived record where a column added later would silently become editable.
-- These two compare the WHOLE row with the stamp removed, so any future column is covered by
-- construction.
create or replace function clara._tf_prepayment_schedules_append_only() returns trigger
language plpgsql security definer set search_path = clara, pg_temp as $c0317_tfp$
begin
  if tg_op = 'DELETE' then
    raise exception 'a prepayment schedule is never deleted (end its plan, do not erase it)'
      using errcode='CLR08', detail='{"reason":"prepayment_schedule_immutable","column":"*"}';
  end if;
  -- 0317 (#939 AC4) — a schedule already superseded is closed for good: the chain is append-only
  -- too, or a correction could be re-pointed at a different successor after the fact.
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded prepayment schedule is immutable'
      using errcode='CLR08',
        detail='{"reason":"prepayment_schedule_immutable","column":"superseded_by"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or (to_jsonb(new) - 'superseded_by' - 'superseded_at')
          is distinct from (to_jsonb(old) - 'superseded_by' - 'superseded_at') then
    raise exception 'a prepayment schedule is a derived record and is never edited; the one update it admits is the supersession stamp (superseded_by and superseded_at together, set once), which clara.replace_prepayment_schedule writes'
      using errcode='CLR08', detail='{"reason":"prepayment_schedule_immutable"}';
  end if;
  return new;
end $c0317_tfp$;

create or replace function clara._tf_revenue_recognition_schedules_append_only() returns trigger
language plpgsql security definer set search_path = clara, pg_temp as $c0317_tfr$
begin
  if tg_op = 'DELETE' then
    raise exception 'a revenue recognition schedule is never deleted (end its plan, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"revenue_recognition_schedule_immutable","column":"*"}';
  end if;
  -- 0317 (#941 AC3) — the mirror of the prepayment trigger above, for the same reason.
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded revenue recognition schedule is immutable'
      using errcode='CLR08',
        detail='{"reason":"revenue_recognition_schedule_immutable","column":"superseded_by"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or (to_jsonb(new) - 'superseded_by' - 'superseded_at')
          is distinct from (to_jsonb(old) - 'superseded_by' - 'superseded_at') then
    raise exception 'a revenue recognition schedule is a derived record and is never edited; the one update it admits is the supersession stamp (superseded_by and superseded_at together, set once), which clara.replace_revenue_recognition_schedule writes'
      using errcode='CLR08', detail='{"reason":"revenue_recognition_schedule_immutable"}';
  end if;
  return new;
end $c0317_tfr$;

-- =====================================================================================
-- §B — THE TWO SHARED PREDICATES. Both lanes ask the SAME two questions, so each has one
--      spelling and neither door carries a copy: "has the term this schedule rode been corrected?"
--      and "which of this schedule's periods has its plan already taken up?".
-- =====================================================================================

-- HAS THE TERM MOVED? `clara.get_prepayment_schedule`'s own #919 predicate, lifted verbatim so the
-- READ and the DOOR can never disagree about whether a correction happened. `term_live` is the
-- audit fact; `moved` is the fact an act may be taken on, because both term doors supersede
-- unconditionally and a re-statement of the same two dates is not grounds for re-deriving a
-- client's books (ADV-02, #1036's fix round).
create or replace function clara._schedule_term_correction(p_term_source text, p_carrier uuid)
returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp
as $c0317_tc$
declare v_r record;
begin
  if p_carrier is null then return null; end if;
  if p_term_source = 'human_stated' then
    select t.id as rode_id, t.period_start as rode_start, t.period_end as rode_end,
           (t.superseded_at is null) as rode_live,
           cur.id as live_id, cur.period_start as live_start, cur.period_end as live_end,
           'human_stated'::text as live_basis_kind, null::uuid as live_document
      into v_r
      from clara.prepayment_stated_terms t
      left join lateral (
        select c.id, c.period_start, c.period_end from clara.prepayment_stated_terms c
         where c.source_entry_id = t.source_entry_id and c.superseded_at is null limit 1) cur on true
     where t.id = p_carrier;
  elsif p_term_source = 'document_service_period' then
    select sp.id as rode_id, sp.period_start as rode_start, sp.period_end as rode_end,
           (sp.superseded_at is null) as rode_live,
           cur.id as live_id, cur.period_start as live_start, cur.period_end as live_end,
           cur.basis_kind as live_basis_kind, sp.document_id as live_document
      into v_r
      from clara.document_service_periods sp
      left join lateral (
        select c.id, c.period_start, c.period_end, c.basis_kind
          from clara.document_service_periods c
         where c.document_id = sp.document_id and c.superseded_at is null limit 1) cur on true
     where sp.id = p_carrier;
  else
    raise exception 'clara._schedule_term_correction: unknown term source %',
      coalesce(p_term_source, '(null)')
      using errcode='CLR10', detail='{"reason":"prepayment_term_source_unknown"}';
  end if;
  if v_r.rode_id is null then return null; end if;
  return jsonb_build_object(
    'term_source', p_term_source,
    'rode_id', v_r.rode_id, 'rode_start', v_r.rode_start, 'rode_end', v_r.rode_end,
    'rode_live', v_r.rode_live,
    'live_id', v_r.live_id, 'live_start', v_r.live_start, 'live_end', v_r.live_end,
    'live_basis_kind', v_r.live_basis_kind, 'live_document_id', v_r.live_document,
    'moved', (v_r.rode_live is false
              and (v_r.live_start, v_r.live_end)
                    is distinct from (v_r.rode_start, v_r.rode_end)));
end $c0317_tc$;

-- WHICH PERIODS HAS THIS PLAN ALREADY TAKEN UP? Two different questions, and conflating them is
-- how a correction loses a client's money or charges it twice:
--
--   · WHERE the replacement may start is the day after the LATEST admitted occurrence. It is an
--     ADMITTED occurrence, never a committed receipt: the moment the plan lane admits a Work for a
--     period the estate has taken responsibility for posting it, and a replacement that re-opened
--     that month would race a Work already in flight and could post the same month twice.
--   · WHAT the replacement re-spreads is the total LESS the periods that were actually admitted,
--     matched to their own due date. The plan scanner admits the latest due event per run, so a
--     schedule whose earlier month was never picked up has a GAP before the boundary: that month's
--     share is still sitting in the prepaid account (or the deferred-revenue liability), so it is
--     part of the remaining balance and is re-spread over the open term. Charging it to a plan that
--     is about to end would leave a balance nothing ever clears.
--
-- A period whose admitted Work later failed is NOT re-spread here: it is recovered through the
-- plan's own catch-up window (`clara.list_prepayment_attention`'s arm A offers it by name), and
-- counting it twice is exactly what this split avoids.
create or replace function clara._schedule_open_remainder(
  p_plan uuid, p_period_lines jsonb, p_total bigint)
returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp
as $c0317_or$
declare v_cutoff date; v_admitted int := 0; v_cents bigint := 0; v_x jsonb;
begin
  select max(o.due_date) into v_cutoff
    from clara.accounting_plan_occurrences o
   where o.plan_id = p_plan and o.leg = 'primary' and o.work_id is not null;
  for v_x in select value from jsonb_array_elements(coalesce(p_period_lines, '[]'::jsonb)) loop
    if exists (select 1 from clara.accounting_plan_occurrences o
                where o.plan_id = p_plan and o.leg = 'primary' and o.work_id is not null
                  and o.due_date = (v_x ->> 'period_end')::date) then
      v_admitted := v_admitted + 1;
      v_cents := v_cents + coalesce((v_x ->> 'amount_cents')::bigint, 0);
    end if;
  end loop;
  return jsonb_build_object(
    'cutoff', v_cutoff,
    'admitted_periods', v_admitted,
    'admitted_cents', v_cents,
    'remaining_cents', p_total - v_cents,
    -- THE FIRST OPEN DAY. The cadence is `last_day_of_month`, so a cutoff is always a month end and
    -- the day after it is the first day of the first month this plan has not taken up.
    'next_start', case when v_cutoff is null then null else (v_cutoff + 1) end);
end $c0317_or$;

-- =====================================================================================
-- §C — THE PREPAYMENT LANE'S CORRECTION DOOR (#939 AC4).
--
-- ONE ENTRANCE, so the body IS the core: the one-ungranted-core law exists because two entrances
-- must not carry two copies of a rule, and there is no second entrance here by design (see the
-- header: no machine lane).
-- =====================================================================================
create or replace function clara.replace_prepayment_schedule(
  p_client uuid, p_schedule uuid, p_reason text, p_authority_ref jsonb, p_op_key text)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp
as $c0317_rp$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text; v_dedupe jsonb;
  v_s clara.prepayment_schedules; v_entry record; v_plan_row clara.accounting_plans;
  v_corr jsonb; v_rem jsonb; v_remaining bigint; v_next date;
  v_new_start date; v_new_end date; v_sched jsonb; v_refusal text; v_lines jsonb;
  v_paired jsonb := '[]'::jsonb; v_x jsonb; v_n int; v_base bigint; v_from date; v_to date;
  v_acct record; v_breach jsonb; v_fy record; v_plan jsonb; v_plan_id uuid; v_rev_id uuid;
  v_memo text; v_basis jsonb; v_eval uuid; v_sid uuid;
  v_code text; v_detail text; v_reason text; v_constraint text;
  v_sp_id uuid; v_st_id uuid; v_doc uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'replacing a prepayment schedule requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- A CORRECTION RECORDS WHY, the same rule `clara.end_accounting_plan` and
  -- `clara.record_prepayment_stated_term` both carry: this act re-derives a client's books, and an
  -- unexplained one is the judgement-without-a-basis the estate refuses everywhere else.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'replacing a schedule records why' using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"reason","constraint":"nonempty"}';
  end if;

  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status
    from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no replacement schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- THE RESERVATION IS TAKEN BEFORE EVERY OTHER QUESTION, for `clara.create_prepayment_schedule`'s
  -- own measured reason (0223, restated in 0305): a caller whose response was lost must replay the
  -- replacement it already made rather than be told the schedule has already been superseded. Every
  -- raise from here on aborts the statement and takes this row with it, so a caller may fix the
  -- input and retry under the SAME key.
  v_dedupe := clara._reserve_op(v_firm, 'replace_prepayment_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'schedule', p_schedule,
      'reason', btrim(p_reason), 'authority', p_authority_ref)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this replacement key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- THE 0021 RULE: absent and foreign answer with ONE refusal, so this door is not an existence
  -- oracle for another client's schedules.
  select s.* into v_s from clara.prepayment_schedules s
   where s.id = p_schedule and s.client_id = p_client and s.firm_id = v_firm;
  if v_s.id is null then
    raise exception 'prepayment schedule not found for this client' using errcode='CLR11',
      detail='{"reason":"prepayment_schedule_not_found"}';
  end if;
  if v_s.superseded_at is not null then
    raise exception 'this schedule has already been replaced'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_superseded',
          'schedule_id', p_schedule, 'superseded_by', v_s.superseded_by)::text;
  end if;

  -- LOCK ORDER RUNG 1 (0193:253-262). Taken BEFORE the remainder is measured, so a wake scan
  -- cannot admit one more period between "which periods are open" and "stop this plan".
  perform 1 from clara.accounting_plans where id = v_s.plan_id for update;
  select * into v_plan_row from clara.accounting_plans where id = v_s.plan_id;

  -- ---- HAS THE TERM ACTUALLY BEEN CORRECTED? Two refusals, not one, because the two facts lead a
  -- firm to two different next acts.
  v_corr := clara._schedule_term_correction(v_s.term_source,
    coalesce(v_s.stated_term_id, v_s.service_period_id));
  if v_corr is null then
    raise exception 'the term carrier this schedule was derived from cannot be read'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_term_underivable',
          'axis','carrier_missing', 'schedule_id', p_schedule,
          'term_source', v_s.term_source)::text;
  end if;
  if (v_corr ->> 'rode_live')::boolean then
    raise exception 'the term this schedule was derived from is still the one on record'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_term_not_corrected',
          'reason_text','the term this schedule was derived from is still the one on record',
          'axis','term_live', 'schedule_id', p_schedule, 'term_source', v_s.term_source,
          'remedy', case when v_s.term_source = 'human_stated'
                         then 'clara.record_prepayment_stated_term'
                         else 'clara.record_document_service_period' end)::text;
  end if;
  if not (v_corr ->> 'moved')::boolean then
    raise exception 'the term on record states the same two dates this schedule already charges'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_term_not_corrected',
          'reason_text','the term on record states the same two dates this schedule already charges',
          'axis','term_unmoved', 'schedule_id', p_schedule,
          'term_start', to_char(v_s.term_start,'YYYY-MM-DD'),
          'term_end', to_char(v_s.term_end,'YYYY-MM-DD'))::text;
  end if;

  -- ---- THE RECOGNITION IS STILL FIT. Asked again rather than assumed: a schedule configured last
  -- quarter may name an entry that has since been reversed, and re-spreading a refunded advance
  -- would charge a client for a service nobody is going to receive. 0140's own token, 0315's axes.
  select je.id, je.status, je.document_id, je.posting_date, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = v_s.source_entry_id and je.client_id = p_client and je.firm_id = v_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_source_unfit',
        'axis','source_not_found', 'source_entry', v_s.source_entry_id)::text;
  end if;
  if v_entry.status <> 'approved' then
    raise exception 'a prepayment schedule amortises a POSTED entry; this one is %', v_entry.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'axis','source_not_posted', 'source_entry', v_s.source_entry_id,
          'status', v_entry.status)::text;
  end if;
  if v_entry.reversed_by is not null then
    raise exception 'this recognition has been reversed, so there is nothing left to amortise'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','this recognition has been reversed, so there is nothing left to amortise',
          'axis','source_reversed', 'source_entry', v_s.source_entry_id,
          'reversed_by', v_entry.reversed_by)::text;
  end if;

  -- ---- THE PROSPECTIVE BOUNDARY. Decision 3's "already-posted periods are never touched" and "a
  -- new schedule FROM THE NEXT PERIOD", derived rather than asserted.
  v_rem := clara._schedule_open_remainder(v_s.plan_id, v_s.period_lines, v_s.total_cents);
  v_remaining := (v_rem ->> 'remaining_cents')::bigint;
  v_next := (v_rem ->> 'next_start')::date;
  if v_remaining <= 0 then
    raise exception 'every period of this schedule has already been taken up; nothing is left to re-spread'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_correction_nothing_remaining',
          'reason_text','every period of this schedule has already been taken up; nothing is left to re-spread',
          'schedule_id', p_schedule, 'total_cents', v_s.total_cents,
          'admitted_periods', v_rem -> 'admitted_periods',
          'admitted_cents', v_rem -> 'admitted_cents')::text;
  end if;
  -- The replacement begins at the LATER of the corrected term's own start and the first month this
  -- plan has not taken up: a correction may move the term earlier, and the months already charged
  -- are not re-charged.
  v_new_start := greatest((v_corr ->> 'live_start')::date,
                          coalesce(v_next, (v_corr ->> 'live_start')::date));
  v_new_end   := (v_corr ->> 'live_end')::date;
  if v_new_end < v_new_start then
    raise exception 'the corrected term ends before the first period this schedule has not taken up'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_correction_no_open_period',
          'reason_text','the corrected term ends before the first period this schedule has not taken up',
          'schedule_id', p_schedule,
          'first_open_period_start', to_char(v_new_start,'YYYY-MM-DD'),
          'corrected_term_end', to_char(v_new_end,'YYYY-MM-DD'),
          'admitted_periods', v_rem -> 'admitted_periods')::text;
  end if;

  -- ---- THE FY ARM, asked against the term that will actually be charged. v1's third arm and its
  -- sentence, because a correction that runs into an unopened year is self-healable: open the
  -- successor and retry.
  select fy.id, fy.starts_on, fy.ends_on into v_fy
    from clara.fiscal_years fy
   where fy.client_id = p_client
     and v_entry.posting_date between fy.starts_on and fy.ends_on;
  if v_fy.id is null then
    raise exception 'the source entry does not sit inside any opened fiscal year for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_term_underivable',
          'reason_text','the source entry does not sit inside any opened fiscal year for this client',
          'missing','fiscal_years', 'source_entry', v_s.source_entry_id)::text;
  end if;
  if v_new_end > v_fy.ends_on
     and not exists (select 1 from clara.fiscal_years nx
                      where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                        and nx.status in ('open', 'reopened')) then
    raise exception 'the corrected term runs past this fiscal year and no successor year is open yet'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_term_underivable',
          'reason_text','the corrected term runs past this fiscal year and no successor year is open yet',
          'missing','fiscal_years.successor', 'fy_ends_on', v_fy.ends_on,
          'period_end', v_new_end, 'source_entry', v_s.source_entry_id)::text;
  end if;

  -- ---- THE EVALUATOR. A replacement ALWAYS rides v2, on both carriers, and that is not a
  -- shortcut: v1 derives the amount from the entry's own debited asset leg, and the amount a
  -- correction re-spreads is the REMAINING balance, which no entry carries. v2 takes the amount and
  -- the term as inputs, which is exactly what this act has. The released side is `credit`, because
  -- what is released here is a prepaid ASSET.
  v_sched := clara.prepayment_schedule_v2(v_remaining, v_s.prepaid_account_code, 'credit',
    v_new_start, v_new_end);
  v_refusal := v_sched ->> 'refusal';
  if v_refusal is not null then
    raise exception '%', coalesce(v_sched ->> 'reason', 'this correction cannot be scheduled')
      using errcode='CLR10',
        detail=(jsonb_build_object('reason', v_refusal, 'reason_text', v_sched ->> 'reason',
                  'schedule_id', p_schedule)
                || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
  end if;
  v_lines := v_sched -> 'period_lines';
  v_n     := (v_sched ->> 'period_count')::int;

  -- ---- THE ROSTER AND THE WALLS, ASKED AGAIN. A replacement is a NEW schedule, and #940's ruling
  -- is that a new schedule needs an enrolled account: an account retired from the roster since the
  -- first schedule was configured must not acquire a second one through this door.
  if not clara._prepayment_account_enrolled(p_client, v_s.prepaid_account_code, 'prepayment') then
    raise exception 'account % is not enrolled as a prepayment account for this client',
      v_s.prepaid_account_code
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','account ' || v_s.prepaid_account_code || ' is not enrolled as a prepayment account for this client',
          'axis','prepaid_account_not_enrolled',
          'prepaid_account_code', v_s.prepaid_account_code,
          'source_entry', v_s.source_entry_id,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_s.prepaid_account_code,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % can no longer carry a prepayment', v_s.prepaid_account_code
      using errcode='CLR10',
        detail=(jsonb_build_object('reason','prepayment_source_unfit',
          'axis','prepaid_account_ineligible',
          'prepaid_account_code', v_s.prepaid_account_code,
          'source_entry', v_s.source_entry_id) || jsonb_build_object('breach', v_breach))::text;
  end if;

  -- ---- THE CHARGED HALF IS CARRIED FORWARD, NEVER RE-PICKED. A term correction corrects the
  -- TERM. Re-asking the caller for an expense account would let a correction reclassify a client's
  -- expense silently, and defaulting one would be a judgement with no stated basis; the judgement
  -- and its recorded grounds on the predecessor are the ones that stand. Its ELIGIBILITY is
  -- re-asked, because an account deactivated since then cannot take the charge.
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_s.expense_account_code;
  if v_acct.account_code is null or v_acct.account_type <> 'expense' then
    raise exception 'the expense account this schedule charges is no longer an expense account on this chart'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_target_ineligible',
          'axis', case when v_acct.account_code is null then 'account_unknown'
                       else 'not_expense_class' end,
          'account_code', v_s.expense_account_code)::text;
  end if;
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % cannot carry an amortisation charge', v_acct.account_code
      using errcode='CLR10',
        detail=(jsonb_build_object('reason','prepayment_target_ineligible') || v_breach)::text;
  end if;

  -- ---- THE PAIRED ALLOCATION, THE CADENCE AND THE PROPOSAL. The create door's own shape.
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'credit_cents')::bigint,
           'prepaid_account_code', v_s.prepaid_account_code,
           'expense_account_code', v_acct.account_code));
  end loop;
  v_from := (v_lines -> 0 ->> 'period_end')::date;
  v_to   := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base := (v_lines -> 0 ->> 'credit_cents')::bigint;
  v_memo := 'Prepayment amortisation: ' || btrim(v_plan_row.purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'amortisation charge'),
      jsonb_build_object('account_code', v_s.prepaid_account_code, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'prepaid release')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'the remaining balance charges nothing in at least one period: % cents over % periods truncates to a base of 0', v_remaining, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_remaining, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PREDECESSOR STOPS FIRST, THROUGH THE PLAN'S OWN DOOR. Its ended reason is this
  -- correction's stated reason, so the audit trail reads as one act. `clara.end_accounting_plan` is
  -- idempotent on a plan already ended, so a schedule a firm stopped by hand before correcting the
  -- term is admitted with no second answer.
  perform clara.end_accounting_plan(v_s.plan_id, btrim(p_reason), p_op_key || ':end');

  -- ---- THE NEW PLAN, through 0193's own door: the authority resolution, the schedule assertion,
  -- the basis predicate, the overlap warning and the audit row are ITS, not a second copy. The
  -- authority is a FRESH instruction, because the correction is a new decision by a person and the
  -- instruction that authorised the first schedule said something about the first term.
  v_plan := clara.create_accounting_plan(
    p_client => p_client, p_kind => 'amortisation_schedule',
    p_purpose => btrim(v_plan_row.purpose),
    p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
    p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
    p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
    p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;
  perform 1 from clara.accounting_plans where id = v_plan_id for update;  -- RUNG 1

  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
   order by e.version desc limit 1;

  -- ---- THE CHAIN. STAMP FIRST, INSERT SECOND, and the order is load-bearing rather than
  -- stylistic: `uq_prepayment_schedules_source_live` admits ONE live schedule per recognition, so
  -- the predecessor must leave that index before the successor enters it. The FK is deferred to
  -- commit, which is what lets the stamp name a row that does not exist yet —
  -- `clara.record_prepayment_stated_term`'s own idiom (0305), and 0055:610-623's before that.
  v_sid := gen_random_uuid();
  update clara.prepayment_schedules
     set superseded_by = v_sid, superseded_at = now()
   where id = p_schedule;
  v_sp_id := case when v_s.term_source = 'document_service_period'
                  then (v_corr ->> 'live_id')::uuid else null end;
  v_st_id := case when v_s.term_source = 'human_stated'
                  then (v_corr ->> 'live_id')::uuid else null end;
  v_doc   := case when v_s.term_source = 'document_service_period'
                  then (v_corr ->> 'live_document_id')::uuid else null end;
  insert into clara.prepayment_schedules(id, firm_id, client_id, plan_id, plan_kind, revision,
      source_entry_id, prepaid_account_code, expense_account_code, expense_account_basis,
      service_period_id, document_id, term_start, term_end, basis_kind, period_lines,
      total_cents, period_count, remainder_placement, schedule_version, evaluator_version_id,
      created_by, term_source, stated_term_id, replaces_schedule_id)
    values (v_sid, v_firm, p_client, v_plan_id, 'amortisation_schedule',
      (v_plan ->> 'revision')::int, v_s.source_entry_id, v_s.prepaid_account_code,
      v_acct.account_code, v_s.expense_account_basis,
      v_sp_id, v_doc, v_new_start, v_new_end,
      coalesce(v_corr ->> 'live_basis_kind', v_s.basis_kind), v_paired,
      v_remaining, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
      coalesce(v_sched ->> 'schedule_version', 'v2'), v_eval, v_actor,
      v_s.term_source, v_st_id, p_schedule);

  perform clara._audit(v_firm, v_actor, null, null, 'replace_prepayment_schedule', null,
    jsonb_build_object('client', p_client, 'replaced_schedule', p_schedule,
      'replaced_plan', v_s.plan_id, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', v_s.source_entry_id, 'term_source', v_s.term_source,
      'term_carrier', v_corr ->> 'live_id',
      'admitted_periods', v_rem -> 'admitted_periods',
      'admitted_cents', v_rem -> 'admitted_cents',
      'remaining_cents', v_remaining, 'periods', v_n, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'replace_prepayment_schedule', p_op_key, jsonb_build_object(
    'schedule_id', v_sid, 'replaces_schedule_id', p_schedule,
    'replaced_plan_id', v_s.plan_id,
    'plan_id', v_plan_id, 'revision_id', v_rev_id, 'revision', (v_plan ->> 'revision')::int,
    'status', v_plan ->> 'status', 'kind', 'amortisation_schedule',
    'client_id', p_client, 'source_entry_id', v_s.source_entry_id, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'term_source', v_s.term_source, 'stated_term_id', v_st_id,
    'basis_kind', coalesce(v_corr ->> 'live_basis_kind', v_s.basis_kind),
    'term_start', to_char(v_new_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_new_end, 'YYYY-MM-DD'),
    'prepaid_account_code', v_s.prepaid_account_code,
    'expense_account_code', v_acct.account_code,
    'expense_account_basis', v_s.expense_account_basis,
    'total_cents', v_remaining, 'period_count', v_n,
    -- THE PROSPECTIVE HALF, SAID OUT LOUD: what the predecessor had already taken up, and what this
    -- schedule re-spreads. A surface that could not see these two numbers could not tell a firm why
    -- the replacement charges less than the payment.
    'admitted_periods', (v_rem ->> 'admitted_periods')::int,
    'admitted_cents', (v_rem ->> 'admitted_cents')::bigint,
    'first_open_period_start', to_char(v_new_start, 'YYYY-MM-DD'),
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v2'),
    'period_lines', v_paired,
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    'configuration_only', true));
end $c0317_rp$;

-- =====================================================================================
-- §D — THE DEFERRED-REVENUE LANE'S CORRECTION DOOR (#941 AC3), the mirror of §C.
--
-- The two bodies are separate for 0308's own stated reason: the tokens are this lane's own
-- (`deferred_revenue_*`), because a bookkeeper recognising a customer's advance reads the refusal
-- on a DEFERRED REVENUE surface and being told "this prepayment is unfit" would name the wrong half
-- of the books. Every RULE they share has exactly one spelling — `clara._schedule_term_correction`,
-- `clara._schedule_open_remainder`, `clara.prepayment_schedule_v2`,
-- `clara._prepayment_account_enrolled`, `clara._adj_line_eligibility_breach` — so the two lanes
-- cannot drift on anything but their vocabulary.
-- =====================================================================================
create or replace function clara.replace_revenue_recognition_schedule(
  p_client uuid, p_schedule uuid, p_reason text, p_authority_ref jsonb, p_op_key text)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp
as $c0317_rr$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text; v_dedupe jsonb;
  v_s clara.revenue_recognition_schedules; v_entry record; v_plan_row clara.accounting_plans;
  v_corr jsonb; v_rem jsonb; v_remaining bigint; v_next date;
  v_new_start date; v_new_end date; v_sched jsonb; v_refusal text; v_lines jsonb;
  v_paired jsonb := '[]'::jsonb; v_x jsonb; v_n int; v_base bigint; v_from date; v_to date;
  v_acct record; v_breach jsonb; v_fy record; v_plan jsonb; v_plan_id uuid; v_rev_id uuid;
  v_memo text; v_basis jsonb; v_eval uuid; v_sid uuid;
  v_code text; v_detail text; v_reason text; v_constraint text;
  v_sp_id uuid; v_st_id uuid; v_doc uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'replacing a revenue recognition schedule requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'replacing a schedule records why' using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"reason","constraint":"nonempty"}';
  end if;

  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status
    from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no replacement schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'replace_revenue_recognition_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'schedule', p_schedule,
      'reason', btrim(p_reason), 'authority', p_authority_ref)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this replacement key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  select s.* into v_s from clara.revenue_recognition_schedules s
   where s.id = p_schedule and s.client_id = p_client and s.firm_id = v_firm;
  if v_s.id is null then
    raise exception 'revenue recognition schedule not found for this client' using errcode='CLR11',
      detail='{"reason":"revenue_recognition_schedule_not_found"}';
  end if;
  if v_s.superseded_at is not null then
    raise exception 'this schedule has already been replaced'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','deferred_revenue_schedule_superseded',
          'schedule_id', p_schedule, 'superseded_by', v_s.superseded_by)::text;
  end if;

  perform 1 from clara.accounting_plans where id = v_s.plan_id for update;  -- RUNG 1
  select * into v_plan_row from clara.accounting_plans where id = v_s.plan_id;

  v_corr := clara._schedule_term_correction(v_s.term_source,
    coalesce(v_s.stated_term_id, v_s.service_period_id));
  if v_corr is null then
    raise exception 'the term carrier this schedule was derived from cannot be read'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'axis','carrier_missing', 'schedule_id', p_schedule,
          'term_source', v_s.term_source)::text;
  end if;
  if (v_corr ->> 'rode_live')::boolean then
    raise exception 'the term this schedule was derived from is still the one on record'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_not_corrected',
          'reason_text','the term this schedule was derived from is still the one on record',
          'axis','term_live', 'schedule_id', p_schedule, 'term_source', v_s.term_source,
          'remedy', case when v_s.term_source = 'human_stated'
                         then 'clara.record_prepayment_stated_term'
                         else 'clara.record_document_service_period' end)::text;
  end if;
  if not (v_corr ->> 'moved')::boolean then
    raise exception 'the term on record states the same two dates this schedule already recognises'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_not_corrected',
          'reason_text','the term on record states the same two dates this schedule already recognises',
          'axis','term_unmoved', 'schedule_id', p_schedule,
          'term_start', to_char(v_s.term_start,'YYYY-MM-DD'),
          'term_end', to_char(v_s.term_end,'YYYY-MM-DD'))::text;
  end if;

  select je.id, je.status, je.document_id, je.posting_date, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = v_s.source_entry_id and je.client_id = p_client and je.firm_id = v_firm;
  if v_entry.id is null then
    raise exception 'the source receipt is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
        'axis','source_not_found', 'source_entry', v_s.source_entry_id)::text;
  end if;
  if v_entry.status <> 'approved' then
    raise exception 'a recognition schedule recognises a POSTED receipt; this one is %', v_entry.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'axis','source_not_posted', 'source_entry', v_s.source_entry_id,
          'status', v_entry.status)::text;
  end if;
  if v_entry.reversed_by is not null then
    raise exception 'this receipt has been reversed, so there is nothing left to recognise'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','this receipt has been reversed, so there is nothing left to recognise',
          'axis','source_reversed', 'source_entry', v_s.source_entry_id,
          'reversed_by', v_entry.reversed_by)::text;
  end if;

  v_rem := clara._schedule_open_remainder(v_s.plan_id, v_s.period_lines, v_s.total_cents);
  v_remaining := (v_rem ->> 'remaining_cents')::bigint;
  v_next := (v_rem ->> 'next_start')::date;
  if v_remaining <= 0 then
    raise exception 'every period of this schedule has already been taken up; nothing is left to re-spread'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_correction_nothing_remaining',
          'reason_text','every period of this schedule has already been taken up; nothing is left to re-spread',
          'schedule_id', p_schedule, 'total_cents', v_s.total_cents,
          'admitted_periods', v_rem -> 'admitted_periods',
          'admitted_cents', v_rem -> 'admitted_cents')::text;
  end if;
  v_new_start := greatest((v_corr ->> 'live_start')::date,
                          coalesce(v_next, (v_corr ->> 'live_start')::date));
  v_new_end   := (v_corr ->> 'live_end')::date;
  if v_new_end < v_new_start then
    raise exception 'the corrected term ends before the first period this schedule has not taken up'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_correction_no_open_period',
          'reason_text','the corrected term ends before the first period this schedule has not taken up',
          'schedule_id', p_schedule,
          'first_open_period_start', to_char(v_new_start,'YYYY-MM-DD'),
          'corrected_term_end', to_char(v_new_end,'YYYY-MM-DD'),
          'admitted_periods', v_rem -> 'admitted_periods')::text;
  end if;

  select fy.id, fy.starts_on, fy.ends_on into v_fy
    from clara.fiscal_years fy
   where fy.client_id = p_client
     and v_entry.posting_date between fy.starts_on and fy.ends_on;
  if v_fy.id is null then
    raise exception 'the source receipt does not sit inside any opened fiscal year for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'reason_text','the source receipt does not sit inside any opened fiscal year for this client',
          'missing','fiscal_years', 'source_entry', v_s.source_entry_id)::text;
  end if;
  if v_new_end > v_fy.ends_on
     and not exists (select 1 from clara.fiscal_years nx
                      where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                        and nx.status in ('open', 'reopened')) then
    raise exception 'the corrected term runs past this fiscal year and no successor year is open yet'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'reason_text','the corrected term runs past this fiscal year and no successor year is open yet',
          'missing','fiscal_years.successor', 'fy_ends_on', v_fy.ends_on,
          'period_end', v_new_end, 'source_entry', v_s.source_entry_id)::text;
  end if;

  -- The released leg here is a deferred-revenue LIABILITY, which is released by DEBIT — the one
  -- argument that differs from §C, and the reason `clara.prepayment_schedule_v2` refuses to default
  -- it (0305: getting that side wrong posts the books backwards).
  v_sched := clara.prepayment_schedule_v2(v_remaining, v_s.deferred_account_code, 'debit',
    v_new_start, v_new_end);
  v_refusal := v_sched ->> 'refusal';
  if v_refusal is not null then
    raise exception '%', coalesce(v_sched ->> 'reason', 'this correction cannot be scheduled')
      using errcode='CLR10',
        detail=(jsonb_build_object(
                  'reason', case v_refusal
                              when 'prepayment_term_underivable' then 'deferred_revenue_term_underivable'
                              when 'prepayment_source_unfit' then 'deferred_revenue_source_unfit'
                              else v_refusal end,
                  'reason_text', v_sched ->> 'reason', 'schedule_id', p_schedule)
                || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
  end if;
  v_lines := v_sched -> 'period_lines';
  v_n     := (v_sched ->> 'period_count')::int;

  if not clara._prepayment_account_enrolled(p_client, v_s.deferred_account_code, 'deferred_revenue') then
    raise exception 'account % is not enrolled as a deferred-revenue account for this client',
      v_s.deferred_account_code
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','account ' || v_s.deferred_account_code || ' is not enrolled as a deferred-revenue account for this client',
          'axis','deferred_account_not_enrolled',
          'deferred_account_code', v_s.deferred_account_code,
          'source_entry', v_s.source_entry_id,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_s.deferred_account_code,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % can no longer carry deferred revenue', v_s.deferred_account_code
      using errcode='CLR10',
        detail=(jsonb_build_object('reason','deferred_revenue_source_unfit',
          'axis','deferred_account_ineligible',
          'deferred_account_code', v_s.deferred_account_code,
          'source_entry', v_s.source_entry_id) || jsonb_build_object('breach', v_breach))::text;
  end if;

  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_s.revenue_account_code;
  if v_acct.account_code is null or v_acct.account_type <> 'income' then
    raise exception 'the revenue account this schedule recognises into is no longer an income account on this chart'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','revenue_target_ineligible',
          'axis', case when v_acct.account_code is null then 'account_unknown'
                       else 'not_income_class' end,
          'account_code', v_s.revenue_account_code)::text;
  end if;
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % cannot carry recognised revenue', v_acct.account_code
      using errcode='CLR10',
        detail=(jsonb_build_object('reason','revenue_target_ineligible') || v_breach)::text;
  end if;

  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'debit_cents')::bigint,
           'deferred_account_code', v_s.deferred_account_code,
           'revenue_account_code', v_acct.account_code));
  end loop;
  v_from := (v_lines -> 0 ->> 'period_end')::date;
  v_to   := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base := (v_lines -> 0 ->> 'debit_cents')::bigint;
  v_memo := 'Deferred revenue recognition: ' || btrim(v_plan_row.purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_s.deferred_account_code, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'deferred revenue released'),
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'revenue recognised')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'the remaining balance recognises nothing in at least one period: % cents over % periods truncates to a base of 0', v_remaining, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_remaining, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  perform clara.end_accounting_plan(v_s.plan_id, btrim(p_reason), p_op_key || ':end');

  v_plan := clara.create_accounting_plan(
    p_client => p_client, p_kind => 'revenue_recognition_schedule',
    p_purpose => btrim(v_plan_row.purpose),
    p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
    p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
    p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
    p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;
  perform 1 from clara.accounting_plans where id = v_plan_id for update;  -- RUNG 1

  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
   order by e.version desc limit 1;

  v_sid := gen_random_uuid();
  update clara.revenue_recognition_schedules
     set superseded_by = v_sid, superseded_at = now()
   where id = p_schedule;
  v_sp_id := case when v_s.term_source = 'document_service_period'
                  then (v_corr ->> 'live_id')::uuid else null end;
  v_st_id := case when v_s.term_source = 'human_stated'
                  then (v_corr ->> 'live_id')::uuid else null end;
  v_doc   := case when v_s.term_source = 'document_service_period'
                  then (v_corr ->> 'live_document_id')::uuid else null end;
  insert into clara.revenue_recognition_schedules(id, firm_id, client_id, plan_id, plan_kind,
      revision, source_entry_id, deferred_account_code, revenue_account_code,
      revenue_account_basis, service_period_id, document_id, term_start, term_end, basis_kind,
      period_lines, total_cents, period_count, remainder_placement, recognition_pattern,
      schedule_version, evaluator_version_id, created_by, term_source, stated_term_id,
      replaces_schedule_id)
    values (v_sid, v_firm, p_client, v_plan_id, 'revenue_recognition_schedule',
      (v_plan ->> 'revision')::int, v_s.source_entry_id, v_s.deferred_account_code,
      v_acct.account_code, v_s.revenue_account_basis,
      v_sp_id, v_doc, v_new_start, v_new_end,
      coalesce(v_corr ->> 'live_basis_kind', v_s.basis_kind), v_paired,
      v_remaining, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
      -- The pattern is carried forward, and it is the one this estate offers. #941 decision 2:
      -- anything but straight line is a typed refusal at the create door, so there is no second
      -- pattern a correction could ever be asked to preserve.
      v_s.recognition_pattern,
      coalesce(v_sched ->> 'schedule_version', 'v2'), v_eval, v_actor,
      v_s.term_source, v_st_id, p_schedule);

  perform clara._audit(v_firm, v_actor, null, null, 'replace_revenue_recognition_schedule', null,
    jsonb_build_object('client', p_client, 'replaced_schedule', p_schedule,
      'replaced_plan', v_s.plan_id, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', v_s.source_entry_id, 'term_source', v_s.term_source,
      'term_carrier', v_corr ->> 'live_id',
      'admitted_periods', v_rem -> 'admitted_periods',
      'admitted_cents', v_rem -> 'admitted_cents',
      'remaining_cents', v_remaining, 'periods', v_n, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'replace_revenue_recognition_schedule', p_op_key,
    jsonb_build_object(
      'schedule_id', v_sid, 'replaces_schedule_id', p_schedule,
      'replaced_plan_id', v_s.plan_id,
      'plan_id', v_plan_id, 'revision_id', v_rev_id, 'revision', (v_plan ->> 'revision')::int,
      'status', v_plan ->> 'status', 'kind', 'revenue_recognition_schedule',
      'client_id', p_client, 'source_entry_id', v_s.source_entry_id, 'document_id', v_doc,
      'service_period_id', v_sp_id, 'term_source', v_s.term_source, 'stated_term_id', v_st_id,
      'basis_kind', coalesce(v_corr ->> 'live_basis_kind', v_s.basis_kind),
      'term_start', to_char(v_new_start, 'YYYY-MM-DD'),
      'term_end', to_char(v_new_end, 'YYYY-MM-DD'),
      'deferred_account_code', v_s.deferred_account_code,
      'revenue_account_code', v_acct.account_code,
      'revenue_account_basis', v_s.revenue_account_basis,
      'recognition_pattern', v_s.recognition_pattern,
      'total_cents', v_remaining, 'period_count', v_n,
      'admitted_periods', (v_rem ->> 'admitted_periods')::int,
      'admitted_cents', (v_rem ->> 'admitted_cents')::bigint,
      'first_open_period_start', to_char(v_new_start, 'YYYY-MM-DD'),
      'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
      'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v2'),
      'period_lines', v_paired,
      'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
      'timezone', 'Asia/Kuala_Lumpur',
      'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
      'next_occurrences', v_plan -> 'next_occurrences',
      'overlap_warning', v_plan -> 'overlap_warning',
      'configuration_only', true));
end $c0317_rr$;

-- =====================================================================================
-- §E — THE FOUR BODIES THAT ASKED "DOES A SCHEDULE EXIST?" NOW ASK "WHICH ONE STANDS?".
--
-- Each of these reads `… where s.source_entry_id = … and s.firm_id = …` and takes ONE row. Before
-- this file that was exactly one row by construction; after it a corrected recognition carries a
-- chain, and an unqualified read would hand a surface an arbitrary member of it — in the two cores
-- the schedule a refusal names ("this prepayment is already amortised by THIS schedule"), and in
-- the two machine-lane reads the schedule claraWork is told about. Both must be the LIVE one.
--
-- The bodies below are byte-for-byte their pre-images with that ONE predicate added at each site
-- (two sites in each core, one in each read); nothing else in them moved.
-- =====================================================================================
create or replace function clara._prepayment_schedule_core(p_firm uuid, p_client uuid, p_actor uuid, p_lane text, p_source_entry uuid, p_expense_account text, p_expense_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text)
returns jsonb language plpgsql security definer
set search_path = clara, pg_temp as $c0317_psc$

declare
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb; v_line jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_prepaid text; v_target text; v_basis_text text;
  v_acct record; v_breach jsonb; v_period record; v_doc uuid; v_entry record;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_existing uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
  -- #939 — the term provenance this door now CHOOSES rather than assumes.
  v_term_source text; v_sp_id uuid; v_st_id uuid; v_term_start date; v_term_end date;
  v_basis_kind text; v_legs int; v_leg record; v_fy record; v_st record;
begin
  -- #915 — THE LANE IS A CLOSED SET, and an unknown one RAISES rather than falling through to the
  -- OBO branch. Unreachable from either door (both pass a literal); a later lane that widens the
  -- set finds this line instead of a silent misroute.
  if p_lane is null or p_lane not in ('human', 'obo', 'wake') then
    raise exception 'clara._prepayment_schedule_core: unknown lane %', coalesce(p_lane, '(null)')
      using errcode='CLR10', detail='{"reason":"prepayment_lane_unknown"}';
  end if;

  -- #1036 (fix round) -- THE WAKE LANE AUTHORISES NO PLAN, AND SAYS SO FIRST.
  --
  -- An amortisation schedule is a PLAN, and every plan in this estate names the person whose
  -- instruction authorises it: clara.create_accounting_plan and clara._obo_plan_core both resolve
  -- that person through clara._authority_ref_refusal, and clara._plan_admit_occurrence then posts
  -- each month's Work AS that person (0308: `clara.admit_journal_work(p.client_id,
  -- p.authorised_by, ...)`, which re-checks their membership, activity and rank). An unattended
  -- close_prep wake has no such person -- clara.mint_wake_credential_for_task forbids
  -- `on_behalf_of` BY CONSTRUCTION (0138:827-830) -- so a plan written on this lane could never
  -- admit a single occurrence. MEASURED, not reasoned: the first cut of this file wrote one, and
  -- its first occurrence answered CLR11 `client_not_found` while an identical human-lane plan
  -- answered `admitted`. Configuring something that can never run is worse than refusing, so the
  -- lane refuses.
  --
  -- WHY IT IS ANSWERED HERE rather than in the wrapper: this is the ONE body every entrance to
  -- this door shares (#915's whole argument), so every reason the door can refuse is readable in
  -- one place, and re-opening the lane later is one arm in one body rather than a second door.
  --
  -- THE REFUSAL NAMES THE DOOR THAT CAN DO IT (0140's own "the refusal NAMES what to record and
  -- where"): a person configures this recognition through clara.create_prepayment_schedule.
  if p_lane = 'wake' then
    raise exception 'an unattended % wake names no directing human, so it cannot authorise an amortisation plan',
      coalesce(p_authority_ref ->> 'wake_kind', 'agent')
      using errcode='CLR03',
        detail=jsonb_build_object(
          'reason','wake_authority_absent',
          'reason_text','an unattended wake names no directing human, so it cannot authorise an amortisation plan',
          'lane','wake',
          'wake_kind', p_authority_ref ->> 'wake_kind',
          'task_id', p_authority_ref ->> 'task_id',
          'source_entry', p_source_entry,
          'remedy','clara.create_prepayment_schedule')::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a prepayment schedule needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;

  -- ---- THE RESERVATION, TAKEN BEFORE THE DUPLICATE CHECK, AND THE ORDER IS MEASURED. ----
  --
  -- A REPLAY OF THE SAME DECISION MUST WIN OVER "THAT PREPAYMENT ALREADY HAS A SCHEDULE". The
  -- first cut asked the duplicate question first and the two answers collided: a caller whose
  -- response was lost retried with the SAME op key and got CLR13 `prepayment_schedule_exists`
  -- instead of the schedule it had already created -- a lost response turned into a second
  -- question, which is the exact defect `_reserve_op` exists to prevent. Measured by
  -- `p653.schedule.one_per_entry` before this order was written.
  --
  -- THE PAYLOAD HASH IS OVER THE CALLER'S OWN ARGUMENTS ONLY, never over the derived allocation:
  -- the key identifies the DECISION a human made, and the term, the period count and the
  -- allocation are OUTPUTS of that decision. Hashing an output would make the same decision
  -- collide with itself whenever the document's term was corrected in between.
  --
  -- A REFUSAL BELOW COSTS NOTHING. Every raise from here on aborts the statement's transaction and
  -- takes this reservation row with it, so the caller may fix the input and retry under the SAME
  -- key. That is why validating after reserving is safe here even though 0193's own doors validate
  -- first -- and it is stated rather than left to be inferred.
  v_dedupe := clara._reserve_op(p_firm, 'create_prepayment_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'expense_account', nullif(btrim(coalesce(p_expense_account,'')),''),
      'expense_basis', nullif(btrim(coalesce(p_expense_basis,'')),''),
      'purpose', btrim(p_purpose), 'authority', p_authority_ref)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-schedule key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- ONE SCHEDULE PER RECOGNITION ENTRY. `uq_prepayment_schedules_source` is the structural
  -- backstop; this is the typed answer, and it names the schedule that already exists so the
  -- surface can send the caller there instead of offering a second configuration.
  select s.id into v_existing from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
  if v_existing is not null then
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- #939 — WHICH LANE IS THIS RECOGNITION ON? The door reads the entry ONCE and branches on
  -- the one fact that decides it: whether it binds a document. The absent/foreign case answers
  -- with v1's OWN token and sentence, so a caller cannot tell this recut from the body it
  -- replaced on that arm.
  select je.id, je.status, je.document_id, je.posting_date, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;

  -- ================= #1036 FIX ROUND / ADV-05 — A REVERSED RECOGNITION IS NOT SCHEDULABLE ========
  --
  -- WHAT WAS MEASURED. `clara.reverse_entry` leaves the original at status 'approved' and sets
  -- `reversed_by`, so a REFUNDED advance passed the status wall above. Driven on the rig before
  -- this arm: a 90000-sen advance was reversed through the real door and
  -- `clara.create_revenue_recognition_schedule` then returned a schedule of 90000 over 3 periods --
  -- a plan that would post Dr deferred revenue / Cr revenue against money the client got back,
  -- driving the liability into a debit balance and recognising revenue on a cancelled performance
  -- obligation (MFRS 15 / MPERS section 23, the standard this lane's own header names). The
  -- prepayment twin did the same against a refunded prepaid asset.
  --
  -- THE LANE'S TWO HALVES DISAGREED, which is the sharpest evidence this was an oversight rather
  -- than a decision: `clara.list_revenue_recognition_attention` (0308), `clara.list_prepayment_
  -- attention` (0305) and #940's own band all filter `je.reversed_by is null`, so the band would
  -- NEVER offer a receipt this door was accepting. The predicate below is theirs, verbatim.
  --
  -- ASKED ABOVE THE DOCUMENT/MEMO BRANCH, so neither carrier can drift from the other: a refunded
  -- payment is not amortisable whether its term came off an invoice or off a person's statement.
  if v_entry.reversed_by is not null then
    raise exception 'this prepayment has been reversed, so there is nothing left to amortise'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','this prepayment has been reversed, so there is nothing left to amortise',
          'axis','source_reversed', 'source_entry', p_source_entry,
          'reversed_by', v_entry.reversed_by)::text;
  end if;

  if v_entry.document_id is not null then
    -- ================= THE DOCUMENT LANE — UNCHANGED FROM 0223 =================
    -- THE FROZEN EVALUATOR. Reached as a DEFINER owned by its own owner role: it is a registered
    -- single-member `clara.evaluator_versions` closure AND a member of the rig's closed ungranted
    -- census, so minting a grant to reach it would red the rig and editing it would red the apply.
    -- Its refusals are RETURNED rather than raised, which is exactly why they can be re-raised here
    -- with their own payloads intact.
    v_sched := clara.prepayment_schedule_v1(p_client, p_source_entry);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
    end if;

    -- THE TERM CARRIER THE EVALUATOR ACTUALLY RODE, re-read here so the schedule row names the exact
    -- `clara.document_service_periods` row rather than "whatever is live at read time". A later
    -- correction supersedes that row; this schedule keeps naming the one it was derived from.
    v_doc := v_entry.document_id;
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis into v_period
      from clara.document_service_periods sp
     where sp.document_id = v_doc and sp.superseded_at is null;
    if v_period.id is null then
      -- Unreachable behind the evaluator's own `prepayment_term_underivable` arm; asserted rather
      -- than assumed, because a schedule row whose `service_period_id` were NULL would be a derived
      -- record that cannot say what it was derived from.
      raise exception 'no live service period is recorded for the document this entry binds'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'missing','document_service_periods','document_id', v_doc)::text;
    end if;
    v_term_source := 'document_service_period';
    v_sp_id       := v_period.id;
    v_st_id       := null;
    v_term_start  := v_period.period_start;
    v_term_end    := v_period.period_end;
    v_basis_kind  := v_period.basis_kind;
  else
    -- ================= #939 — THE MEMO-ONLY LANE =================
    -- (a) THE SOURCE MUST HAVE POSTED. v1's first arm, its token and its sentence verbatim.
    if v_entry.status <> 'approved' then
      raise exception 'a prepayment schedule amortises a POSTED entry; this one is %', v_entry.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text','a prepayment schedule amortises a POSTED entry; this one is ' || v_entry.status,
            'source_entry', p_source_entry, 'status', v_entry.status)::text;
    end if;
    -- (b) THE PREPAID-ASSET LEG must be UNAMBIGUOUS: exactly one debited asset line. Zero or many
    -- is a refusal, never a guess -- picking one of two candidate legs would be the surface
    -- choosing a number. v1's second arm, asked HERE because v2 reads no table.
    select count(*)::int into v_legs
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
    if v_legs <> 1 then
      raise exception '%', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end,
            'source_entry', p_source_entry, 'candidate_legs', v_legs)::text;
    end if;
    select jl.account_code, jl.debit_cents into v_leg
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';

    -- (c) THE TERM. This is the arm the whole ticket is about: before #939 the answer here was
    -- `prepayment_term_underivable` naming `journal_entries.document_id`, which told a firm its
    -- prepayment could never be amortised at all. It now names the CARRIER and the DOOR that
    -- fills it, so the person's next act is one call -- 0140's own "the refusal NAMES what to
    -- record and where", finally true for this lane too.
    select t.id, t.period_start, t.period_end into v_st
      from clara.prepayment_stated_terms t
     where t.source_entry_id = p_source_entry and t.superseded_at is null;
    if v_st.id is null then
      raise exception 'this recognition binds no document and nobody has stated its service period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','this recognition binds no document and nobody has stated its service period',
            'missing','prepayment_stated_terms',
            'remedy','clara.record_prepayment_stated_term',
            'source_entry', p_source_entry)::text;
    end if;

    -- (d) THE FY ARM. v1's third arm, and it is a SELF-HEALABLE state rather than a dead end: the
    -- successor year can be opened and the call retried.
    select fy.id, fy.starts_on, fy.ends_on into v_fy
      from clara.fiscal_years fy
     where fy.client_id = p_client
       and v_entry.posting_date between fy.starts_on and fy.ends_on;
    if v_fy.id is null then
      raise exception 'the source entry does not sit inside any opened fiscal year for this client'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the source entry does not sit inside any opened fiscal year for this client',
            'missing','fiscal_years','source_entry', p_source_entry)::text;
    end if;
    if v_st.period_end > v_fy.ends_on
       and not exists (select 1 from clara.fiscal_years nx
                        where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                          and nx.status in ('open', 'reopened')) then
      raise exception 'the term runs past this fiscal year and no successor year is open yet'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the term runs past this fiscal year and no successor year is open yet',
            'missing','fiscal_years.successor','fy_ends_on', v_fy.ends_on,
            'period_end', v_st.period_end, 'source_entry', p_source_entry)::text;
    end if;

    -- (e) THE SECOND EVALUATOR, with the leg and the term this door just picked. A prepaid ASSET
    -- is released by CREDIT, which is why the side is stated here rather than defaulted there.
    v_sched := clara.prepayment_schedule_v2(v_leg.debit_cents, v_leg.account_code, 'credit',
      v_st.period_start, v_st.period_end);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
    end if;
    v_term_source := 'human_stated';
    v_sp_id       := null;
    v_doc         := null;
    v_st_id       := v_st.id;
    v_term_start  := v_st.period_start;
    v_term_end    := v_st.period_end;
    -- The carrier column keeps its meaning: a HUMAN said this, rather than an extraction having
    -- read it off a page. The stated-term lane has no 'extracted' arm at all.
    v_basis_kind  := 'human_stated';
  end if;

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;
  -- v1 names the released leg `prepaid_account_code`; v2 names it `release_account_code`, because
  -- the leg it releases may be a liability. ONE local either way.
  v_prepaid := coalesce(v_sched ->> 'prepaid_account_code', v_sched ->> 'release_account_code');

  -- ---- #940 — THE ROSTER IS ASKED FIRST, AND THE WALL AFTERWARDS. ----
  --
  -- WHAT THIS CLOSES, and it is 0223's own carried-forward note rather than a new worry. The wall
  -- below is NEGATIVE — is this leg ineligible? — so an ordinary asset account with no class, no
  -- bank stamp and no reserved role passes it, on BOTH lanes. A utility deposit, an inventory
  -- purchase and a prepaid tax all satisfy every predicate this door had, and each one could be
  -- amortised into expense for a whole stated term with every entry balanced and every period
  -- receipted. The missing half was a POSITIVE statement that this account holds prepayments, and
  -- 0306 carries it: a per-client roster, enrolled by a bookkeeper with a stated reason.
  --
  -- WHY THE ORDER IS ROSTER-THEN-WALL (the brief's own words, and owner decision 6 behind them).
  -- Every reason an account can NEVER be enrolled — unknown, inactive, control-class, bank-bound,
  -- reserved by the fixed-asset or staff-advance roster — is answered at the ENROLMENT door, with
  -- a stated reason, where the person is deciding about the account. Here the person is amortising
  -- a prepayment, and the one useful answer is "this account is not on the roster; here is where
  -- to put it". So an account that fails both is told about the roster, and the wall still guards
  -- the accounts the roster admits (an account enrolled while eligible can be bound as a bank
  -- account the next day).
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit` WITH A NEW AXIS. The brief's line is "its
  -- ineligibility refusal gains a not-enrolled axis that names the roster panel" — one axis, not a
  -- second vocabulary, so every surface already rendering this refusal renders this one.
  --
  -- ONE SPELLING, THREE CALLERS. `clara._prepayment_account_enrolled` is the same predicate §G's
  -- arm B asks, so the band can never advertise a recognition this door would refuse; #915's OBO
  -- twin and #941's deferred-revenue mirror ask it too, with their own purpose.
  --
  -- #915 — AND THE TWIN NOW ASKS IT BY BEING HERE. The OBO door does not copy these five lines: it
  -- calls this core, so the roster question, its order relative to the shared wall, its token, its
  -- axis, its remedy and its panel are ONE body for both entrances. The brief's "whichever of #915
  -- and #940 lands second carries the check into the other's door" is discharged by having no
  -- second door to carry it into.
  --
  -- A SCHEDULE ALREADY RUNNING IS NEVER RE-CHECKED (owner decision 3). This call is the only place
  -- a NEW schedule is born; nothing on the plan lane's monthly admission path asks the roster, so
  -- retiring an account closes the future and leaves the past posting to term end.
  if not clara._prepayment_account_enrolled(p_client, v_prepaid, 'prepayment') then
    raise exception 'account % is not enrolled as a prepayment account for this client', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','account ' || v_prepaid || ' is not enrolled as a prepayment account for this client',
          'axis','prepaid_account_not_enrolled', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;

  -- ---- THE PREPAID LEG IS JUDGED TOO, BY THE ESTATE'S OWN RULE. ----
  --
  -- WHY THIS WALL EXISTS AT ALL, and it is the finding a review measured rather than a precaution.
  -- `clara.prepayment_schedule_v1` takes "the one debited asset leg" VERBATIM (0140:1046-1064) and
  -- never asks WHICH asset. Its whole predicate -- approved, binds a document, debits exactly one
  -- asset line -- is satisfied by every ordinary sales invoice (Dr trade receivables), every
  -- documented bank receipt and every fixed-asset purchase. Without this the door would accept a
  -- RECEIVABLE as a prepayment and post Dr expense / Cr receivable every month for the whole
  -- stated term, and §E's arm B would ADVERTISE those entries as "posted, not yet amortised" with
  -- a "configure the schedule" action beside them. Measured on the rig: a document-bound
  -- Dr-374-C56 invoice was accepted and its schedule credited the control account.
  --
  -- IT IS THE SAME HELPER THE EXPENSE HALF ALREADY USES (0042:643) -- `account_class is not null`
  -- (a control account), `is_bank_account` / `clara.bank_accounts`, `is_active`, and the FA
  -- role-reservation census -- so this is the estate's OWN existing eligibility rule applied to a
  -- second leg, never a second rule written here. The line is shaped as a CREDIT because that is
  -- the side every period will actually post against this account.
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit`, because that is exactly what this says: the
  -- SOURCE entry is not fit to be amortised. No new vocabulary; the web mirror and the chat-lane
  -- mirror already carry it, and `axis` says which leg so a surface can name it.
  --
  -- WHAT THIS DOES NOT CLOSE, stated rather than implied: an ordinary asset account with no class,
  -- no bank stamp and no reserved role still passes -- the wall is NEGATIVE (is this leg
  -- ineligible?) and not a POSITIVE prepayment-class roster. A roster would need a chart-level
  -- classification this estate does not carry; it is named as a follow-up rather than invented.
  --
  -- #939: it guards BOTH lanes, because it is asked AFTER the branch on the leg either lane picked.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_prepaid,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % holds this entry''s debited asset, and it cannot carry a prepayment', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'axis','prepaid_account_ineligible', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry, 'breach', v_breach)::text;
  end if;

  -- THE SIX DERIVED SCHEDULE FIELDS, every one read off the evaluator's own output: the cadence is
  -- monthly / last-day-of-month because the evaluator emits whole calendar months, the window opens
  -- on the FIRST line's `period_end` and closes on the LAST line's, `day_of_month` and
  -- `reversal_day_rule` are absent. None of them is a parameter of this door.
  v_from    := (v_lines -> 0 ->> 'period_end')::date;
  v_to      := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base    := (v_lines -> 0 ->> 'credit_cents')::bigint;

  -- ---- THE EXPENSE HALF, RE-DERIVED. 0140's three tokens, 0042's helper, no new vocabulary. ----
  v_target := nullif(btrim(coalesce(p_expense_account, '')), '');
  if v_target is null then
    -- The no-plausible-account arm, NOT a default path (0140:3455-3462): a lane that refused
    -- whenever it was unsure of a classification would never charge anything.
    raise exception 'no expense account was proposed for the amortisation charge'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"account_missing"}';
  end if;
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_target;
  if v_acct.account_code is null then
    raise exception 'this client''s chart holds no account %', v_target using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','account_unknown',
        'account_code', v_target)::text;
  end if;
  if v_acct.account_type <> 'expense' then
    -- An amortisation charge is an expense. A balance-sheet target would move the prepayment
    -- sideways and never charge it (0140:3474-3480).
    raise exception 'account % is a % account; an amortisation charge is an expense', v_target, v_acct.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','not_expense_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type)::text;
  end if;
  -- THE SAME HELPER THE PROPOSE DOOR AND THE POSTER ALREADY USE, so a bank-class, control,
  -- inactive or role-reserved account refuses by the estate's OWN existing rule rather than a
  -- second one written here.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % cannot carry an amortisation charge', v_target using errcode='CLR10',
      detail=(jsonb_build_object('reason','prepayment_target_ineligible') || v_breach)::text;
  end if;
  v_basis_text := nullif(btrim(coalesce(p_expense_basis, '')), '');
  if v_basis_text is null then
    -- A judgement with NO RECORDED BASIS is what this wall exists to prevent (0140:3489-3495):
    -- refuse rather than record an unexplained classification.
    raise exception 'the expense account was proposed without its stated grounds'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"basis_missing"}';
  end if;

  -- ---- THE PAIRED ALLOCATION. The evaluator's line VERBATIM plus this lane's own pairing. ----
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'credit_cents')::bigint,
           'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code));
  end loop;

  -- ---- THE PROPOSAL, THROUGH THE SHARED PREDICATE. ----
  v_memo := 'Prepayment amortisation: ' || btrim(p_purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'amortisation charge'),
      jsonb_build_object('account_code', v_prepaid, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'prepaid release')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    -- C3 (0140:3505-3523), RESTATED AS THE SHARED PREDICATE'S OWN ANSWER. One cent over two months
    -- truncates to a base of 0, so the first period's derived basis moves no money and
    -- `clara._assert_journal_basis` refuses it. That raw refusal is correct but not actionable, so
    -- it becomes F-A4's typed rung -- carrying the predicate's OWN constraint and naming it as the
    -- owner, so a reader can see this door routed through it rather than inventing a second check.
    --
    -- MEASURED, not assumed: an all-zero balanced basis is refused by 0178's PER-LINE
    -- `exactly_one_side` arm (`0178:771-775`), which fires BEFORE its `nonzero_total` arm
    -- (`0178:785-787`) can ever be reached -- every line that survives the per-line arm carries
    -- exactly one POSITIVE side, so the debit total can never be zero. C08.2's owner is confirmed
    -- to be this predicate; the arm that actually answers is `exactly_one_side`, and that is a
    -- finding about 0178 rather than about this door. The constraint is therefore CARRIED THROUGH
    -- from whatever 0178 raised rather than asserted here to be any particular word.
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'this term charges nothing in at least one period: % cents over % periods truncates to a base of 0', v_total, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PLAN. Through 0193's OWN door, so the authority resolution, the schedule assertion,
  -- the basis predicate, the overlap warning and the audit row are all its, not a second copy. ----
  --
  -- #915 — AND THROUGH `clara._prepayment_plan_core` ON THE OBO LANE, FOR A MEASURED REASON.
  -- `clara.create_accounting_plan` resolves its actor through `clara._human_ctx` ->
  -- `clara.jwt_sub()` (0193, 0004:299-308), and a `clara_runtime` connection carries no
  -- `request.jwt.claims` at all, so nesting it here would raise CLR04 `no authenticated actor` on
  -- EVERY OBO call — the exact reason `clara.create_accrual_adjustment_for` (0222) nests
  -- `clara._accrual_plan_core` instead of 0193's door. The two steps write the SAME plan row, the
  -- SAME first revision, the same overlap warning and the same audit line, and §A asks
  -- `clara._authority_ref_refusal` — 0250's ONE definition — so the two lanes cannot drift on the
  -- one judgement that matters here: whether the instruction cited is a PERSON'S.
  --
  -- THE ONE DELIBERATE DIFFERENCE, stated rather than left to be found: the human lane additionally
  -- holds the nested `op_key || ':plan'` reservation 0193's own door takes, and the OBO lane does
  -- not. It costs the OBO lane nothing — the outer `create_prepayment_schedule` key already covers
  -- the whole configuration, and a second reservation under a DERIVED key would only be reachable
  -- by a caller that could name it, which no runtime caller can.
  --
  -- #1036 (fix round) -- AND THERE IS NO THIRD ARM. The 'wake' lane never reaches this line: it is
  -- answered by the typed refusal at the top of this body, because the estate has no person for a
  -- clocked run to write a plan under. Two arms, two plan-writing bodies, both asking
  -- clara._authority_ref_refusal -- which is the invariant this door now carries end to end.
  if p_lane = 'human' then
    v_plan := clara.create_accounting_plan(
      p_client => p_client, p_kind => 'amortisation_schedule', p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  else
    v_plan := clara._prepayment_plan_core(
      p_firm => p_firm, p_client => p_client, p_author => p_actor, p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis);
  end if;
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1, taken here too although this door reaches no `clara.accounting_work`: the
  -- plan row is the lane's first rung (0193:253-262) and a writer that took the schedule row first
  -- would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  -- #939 — THE EVALUATOR VERSION ROW THIS SCHEDULE ACTUALLY RODE, resolved by the entrypoint
  -- signature of the evaluator the branch above chose rather than by a literal.
  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = case when v_term_source = 'human_stated'
       then 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
       else 'clara.prepayment_schedule_v1(uuid,uuid)' end
   order by e.version desc limit 1;

  -- THE STRUCTURAL BACKSTOP ANSWERS IN THE LANE'S OWN WORDS. The typed duplicate check above
  -- cannot see a WINNER THAT HAS NOT COMMITTED: two people configuring the same recognition at
  -- once both pass it, and the loser queues on `uq_prepayment_schedules_source` until the winner
  -- commits. Before this block that loser was answered a bare 23505 -- `duplicate key value
  -- violates unique constraint "uq_prepayment_schedules_source"` -- a sentence with no next act,
  -- which no surface has a case for. MEASURED by `p653.schedule.duplicate_race` behind a real lock
  -- barrier. The index is still the authority; this only re-reads the winning row and re-raises the
  -- SAME CLR13 payload the pre-check raises, so both paths are one answer.
  begin
    insert into clara.prepayment_schedules(firm_id, client_id, plan_id, plan_kind, revision,
        source_entry_id, prepaid_account_code, expense_account_code, expense_account_basis,
        service_period_id, document_id, term_start, term_end, basis_kind, period_lines,
        total_cents, period_count, remainder_placement, schedule_version, evaluator_version_id,
        created_by, term_source, stated_term_id)
      values (p_firm, p_client, v_plan_id, 'amortisation_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_prepaid, v_acct.account_code, v_basis_text,
        v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        coalesce(v_sched ->> 'schedule_version', 'v1'), v_eval, p_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    -- The read runs in the OUTER transaction, after the failed subtransaction rolled back, so the
    -- winner is visible by now. `v_existing` may still be null if some OTHER unique index fired --
    -- in which case the payload says so by carrying a null schedule_id rather than pretending.
    select s.id into v_existing from clara.prepayment_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(p_firm, p_actor, null, null, 'create_prepayment_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_sp_id,
      'term_source', v_term_source, 'stated_term', v_st_id,
      'expense_account', v_acct.account_code, 'periods', v_n, 'total_cents', v_total,
      'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'amortisation_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'basis_kind', v_basis_kind,
    -- #939 — WHERE THE TERM CAME FROM, in the door's own answer, so a surface never has to infer
    -- it from the absence of a document id.
    'term_source', v_term_source, 'stated_term_id', v_st_id,
    'term_start', to_char(v_term_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_term_end, 'YYYY-MM-DD'),
    'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code,
    'expense_account_basis', v_basis_text,
    'total_cents', v_total, 'period_count', v_n,
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v1'),
    'period_lines', v_paired,
    -- THE DERIVED CADENCE, echoed so the caller can SEE that none of it was theirs to choose.
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    -- THE BOUNDARY, IN THE DOOR'S OWN ANSWER (AC4). Accepted configuration is not a posted
    -- occurrence, and recognition + configuration in ONE commit is unbuildable on v1 because the
    -- evaluator refuses a source entry that has not posted.
    'configuration_only', true);
  return clara._finish_op(p_firm, 'create_prepayment_schedule', p_op_key, v_result);
end 
$c0317_psc$;

create or replace function clara._revenue_recognition_core(p_firm uuid, p_client uuid, p_actor uuid, p_lane text, p_source_entry uuid, p_revenue_account text, p_revenue_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text, p_pattern text)
returns jsonb language plpgsql security definer
set search_path = clara, pg_temp as $c0317_rrc$
declare
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_deferred text; v_target text; v_basis_text text; v_pattern text;
  v_acct record; v_breach jsonb; v_entry record; v_existing uuid;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
  v_term_source text; v_sp_id uuid; v_st_id uuid; v_doc uuid;
  v_term_start date; v_term_end date; v_basis_kind text;
  v_legs int; v_leg record; v_fy record; v_period record; v_st record;
begin
  if p_lane is null or p_lane not in ('human', 'obo') then
    raise exception 'clara._revenue_recognition_core: unknown lane %', coalesce(p_lane, '(null)')
      using errcode='CLR10', detail='{"reason":"revenue_recognition_lane_unknown"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a revenue recognition schedule needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;

  -- ---- ONE PATTERN, AND ANYTHING ELSE IS A TYPED REFUSAL (owner decision 2, 2026-09-18). ----
  --
  -- Usage-based and milestone recognition need a MEASURE OF PROGRESS — units delivered, stages
  -- accepted — that this estate does not carry anywhere, and a database that guessed one would be
  -- choosing a number on a firm's behalf. So the argument exists, its set is closed, and a caller
  -- that asks for another pattern is told WHICH patterns exist rather than silently given the only
  -- one. Asked with the purpose, BEFORE the reservation: it is a shape check on the caller's own
  -- argument, like the purpose, and a reservation taken under a pattern the door cannot honour
  -- would replay a refusal.
  v_pattern := coalesce(nullif(btrim(coalesce(p_pattern, '')), ''), 'straight_line');
  if v_pattern <> 'straight_line' then
    raise exception 'this estate recognises deferred revenue on a straight line over whole calendar months; % is not offered', v_pattern
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recognition_pattern_unsupported',
          'pattern', v_pattern,
          'supported', jsonb_build_array('straight_line'),
          'reason_text','usage-based and milestone recognition need a measure of progress this estate does not record')::text;
  end if;

  -- ---- THE RESERVATION, TAKEN BEFORE THE DUPLICATE CHECK. ----
  --
  -- 0223's order and its reasoning: a caller whose response was lost retries with the SAME op key
  -- and must get the schedule it already created, not CLR13 `..._schedule_exists` — a lost
  -- response turned into a second question is the exact defect `_reserve_op` exists to prevent.
  --
  -- THE PAYLOAD HASH IS OVER THE CALLER'S OWN ARGUMENTS ONLY, never over the derived allocation:
  -- the key identifies the DECISION a human made, and the term, the period count and the
  -- allocation are OUTPUTS of that decision. The AUTHOR is deliberately NOT in the hash, which is
  -- what lets the human door and its OBO twin share one key space (#915's AC3).
  v_dedupe := clara._reserve_op(p_firm, 'create_revenue_recognition_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'revenue_account', nullif(btrim(coalesce(p_revenue_account,'')),''),
      'revenue_basis', nullif(btrim(coalesce(p_revenue_basis,'')),''),
      'purpose', btrim(p_purpose), 'authority', p_authority_ref, 'pattern', v_pattern)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this recognition-schedule key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- ONE SCHEDULE PER RECEIPT. `uq_revenue_recognition_schedules_source` is the structural
  -- backstop; this is the typed answer, and it names the schedule that already exists so the
  -- surface can send the caller there instead of offering a second configuration.
  select s.id into v_existing from clara.revenue_recognition_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
  if v_existing is not null then
    raise exception 'this advance is already recognised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','deferred_revenue_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- THE SOURCE. Read ONCE; absent and foreign answer with ONE refusal (the 0021 rule), so
  -- this door is not an existence oracle for another client's entries. ----
  select je.id, je.status, je.document_id, je.posting_date, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;

  -- ================= #1036 FIX ROUND / ADV-05 — A REVERSED RECOGNITION IS NOT SCHEDULABLE ========
  --
  -- WHAT WAS MEASURED. `clara.reverse_entry` leaves the original at status 'approved' and sets
  -- `reversed_by`, so a REFUNDED advance passed the status wall above. Driven on the rig before
  -- this arm: a 90000-sen advance was reversed through the real door and
  -- `clara.create_revenue_recognition_schedule` then returned a schedule of 90000 over 3 periods --
  -- a plan that would post Dr deferred revenue / Cr revenue against money the client got back,
  -- driving the liability into a debit balance and recognising revenue on a cancelled performance
  -- obligation (MFRS 15 / MPERS section 23, the standard this lane's own header names). The
  -- prepayment twin did the same against a refunded prepaid asset.
  --
  -- THE LANE'S TWO HALVES DISAGREED, which is the sharpest evidence this was an oversight rather
  -- than a decision: `clara.list_revenue_recognition_attention` (0308), `clara.list_prepayment_
  -- attention` (0305) and #940's own band all filter `je.reversed_by is null`, so the band would
  -- NEVER offer a receipt this door was accepting. The predicate below is theirs, verbatim.
  if v_entry.reversed_by is not null then
    raise exception 'this advance has been reversed, so there is no obligation left to recognise'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','this advance has been reversed, so there is no obligation left to recognise',
          'axis','source_reversed', 'source_entry', p_source_entry,
          'reversed_by', v_entry.reversed_by)::text;
  end if;
  if v_entry.status <> 'approved' then
    raise exception 'a recognition schedule recognises a POSTED receipt; this one is %', v_entry.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','a recognition schedule recognises a POSTED receipt; this one is ' || v_entry.status,
          'axis','source_not_posted',
          'source_entry', p_source_entry, 'status', v_entry.status)::text;
  end if;

  -- ---- THE DEFERRED-REVENUE LEG: exactly one CREDITED LIABILITY line that is not the tax leg. ----
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.credit_cents > 0
     and ca.account_type = 'liability'
     and coalesce(ca.special_acc_type, '') <> 'sst_output';
  if v_legs <> 1 then
    raise exception '%', case when v_legs = 0 then 'the source entry credits no liability account that could hold deferred revenue'
                              else 'the source entry credits more than one liability account, so its deferred-revenue leg is ambiguous' end
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text', case when v_legs = 0 then 'the source entry credits no liability account that could hold deferred revenue'
                              else 'the source entry credits more than one liability account, so its deferred-revenue leg is ambiguous' end,
          'source_entry', p_source_entry, 'candidate_legs', v_legs)::text;
  end if;
  select jl.account_code, jl.credit_cents into v_leg
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.credit_cents > 0
     and ca.account_type = 'liability'
     and coalesce(ca.special_acc_type, '') <> 'sst_output';
  v_deferred := v_leg.account_code;

  -- ---- THE TERM. Two carriers, one shape, and the DOOR chooses between them by the one fact
  -- that decides it: whether the receipt binds a document. ----
  --
  -- THE 120-MONTH CAP IS THE CARRIERS' OWN. `ck_dsp_max_periods` and 0305's `ck_pst_max_periods`
  -- (the same expression verbatim) refuse a longer term at the recording door, and
  -- `clara.prepayment_schedule_v2` refuses one it is handed anyway with `term_too_long`. There is
  -- no third cap here; a cap computed a second way would be a second cap.
  if v_entry.document_id is not null then
    v_doc := v_entry.document_id;
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind into v_period
      from clara.document_service_periods sp
     where sp.document_id = v_doc and sp.superseded_at is null;
    if v_period.id is null then
      raise exception 'no live service period is recorded for the document this receipt binds'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
            'reason_text','no live service period is recorded for the document this receipt binds',
            'missing','document_service_periods',
            'remedy','clara.record_document_service_period',
            'document_id', v_doc, 'source_entry', p_source_entry)::text;
    end if;
    v_term_source := 'document_service_period';
    v_sp_id       := v_period.id;
    v_st_id       := null;
    v_term_start  := v_period.period_start;
    v_term_end    := v_period.period_end;
    v_basis_kind  := v_period.basis_kind;
  else
    select t.id, t.period_start, t.period_end into v_st
      from clara.prepayment_stated_terms t
     where t.source_entry_id = p_source_entry and t.superseded_at is null;
    if v_st.id is null then
      raise exception 'this receipt binds no document and nobody has stated its service period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
            'reason_text','this receipt binds no document and nobody has stated its service period',
            'missing','prepayment_stated_terms',
            'remedy','clara.record_prepayment_stated_term',
            'source_entry', p_source_entry)::text;
    end if;
    v_term_source := 'human_stated';
    v_sp_id       := null;
    v_doc         := null;
    v_st_id       := v_st.id;
    v_term_start  := v_st.period_start;
    v_term_end    := v_st.period_end;
    -- The carrier column keeps its meaning: a HUMAN said this, rather than an extraction having
    -- read it off a page. The stated-term lane has no 'extracted' arm at all.
    v_basis_kind  := 'human_stated';
  end if;

  -- ---- THE FISCAL-YEAR ARM, 0140's third, and a SELF-HEALABLE state rather than a dead end: the
  -- successor year can be opened and the call retried. ----
  select fy.id, fy.starts_on, fy.ends_on into v_fy
    from clara.fiscal_years fy
   where fy.client_id = p_client
     and v_entry.posting_date between fy.starts_on and fy.ends_on;
  if v_fy.id is null then
    raise exception 'the source entry does not sit inside any opened fiscal year for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'reason_text','the source entry does not sit inside any opened fiscal year for this client',
          'missing','fiscal_years','source_entry', p_source_entry)::text;
  end if;
  if v_term_end > v_fy.ends_on
     and not exists (select 1 from clara.fiscal_years nx
                      where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                        and nx.status in ('open', 'reopened')) then
    raise exception 'the service period runs past this fiscal year and no successor year is open yet'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'reason_text','the service period runs past this fiscal year and no successor year is open yet',
          'missing','fiscal_years.successor','fy_ends_on', v_fy.ends_on,
          'period_end', v_term_end, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- #939'S FROZEN EVALUATOR, WITH THE RELEASE SIDE THIS LANE NEEDS. ----
  -- Reached as a DEFINER owned by its own owner role: it is a registered single-member
  -- `clara.evaluator_versions` closure AND a member of the rig's closed ungranted census, so
  -- minting a grant to reach it would red the rig and editing it would red the apply. Its
  -- refusals are RETURNED rather than raised, which is why they can be re-raised here with their
  -- own payloads intact, under this lane's own token.
  v_sched := clara.prepayment_schedule_v2(v_leg.credit_cents, v_deferred, 'debit',
    v_term_start, v_term_end);
  v_refusal := v_sched ->> 'refusal';
  if v_refusal is not null then
    raise exception '%', coalesce(v_sched ->> 'reason', 'this advance cannot be recognised')
      using errcode='CLR10',
        detail=(jsonb_build_object('reason', 'deferred_revenue_term_underivable',
                  'evaluator_refusal', v_refusal,
                  'reason_text', v_sched ->> 'reason')
                || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
  end if;

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;

  -- ---- #940'S ROSTER IS ASKED FIRST, AND THE SHARED WALL AFTERWARDS — the same order the
  -- prepayment core asks them in, for the same reason. ----
  --
  -- Every reason an account can NEVER be enrolled (unknown, inactive, control-class, bank-bound,
  -- reserved) is answered at the ENROLMENT door, where the person is deciding about the account.
  -- Here the person is recognising an advance, and the one useful answer is "this account is not
  -- on the roster; here is where to put it". An account that fails both is told about the roster.
  --
  -- THE PREDICATE IS THE ONE SPELLING #940 wrote, asked with THIS lane's purpose, so the band, the
  -- human door and the OBO twin can never drift about which accounts hold deferred revenue.
  --
  -- A SCHEDULE ALREADY RUNNING IS NEVER RE-CHECKED. This call is the only place a NEW schedule is
  -- born; nothing on the plan lane's monthly admission path asks the roster, so retiring an
  -- account closes the future and leaves the past recognising to term end.
  if not clara._prepayment_account_enrolled(p_client, v_deferred, 'deferred_revenue') then
    raise exception 'account % is not enrolled as a deferred-revenue account for this client', v_deferred
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','account ' || v_deferred || ' is not enrolled as a deferred-revenue account for this client',
          'axis','deferred_account_not_enrolled', 'deferred_account_code', v_deferred,
          'source_entry', p_source_entry,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;

  -- 0042'S SHARED NEGATIVE WALL on the deferred leg, shaped as a DEBIT because that is the side
  -- every period will actually post against this account. The roster is a POSITIVE statement made
  -- once; this is the estate's own eligibility rule asked at configuration time, so an account
  -- enrolled while eligible and bound as something else the next day is still caught.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_deferred,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % holds this receipt''s credited liability, and it cannot carry deferred revenue', v_deferred
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'axis','deferred_account_ineligible', 'deferred_account_code', v_deferred,
          'source_entry', p_source_entry, 'breach', v_breach)::text;
  end if;

  -- ---- THE REVENUE HALF. 0140's three arms, 0042's helper, this lane's tokens. ----
  v_target := nullif(btrim(coalesce(p_revenue_account, '')), '');
  if v_target is null then
    raise exception 'no revenue account was proposed for the recognition'
      using errcode='CLR10',
        detail='{"reason":"revenue_target_underivable","axis":"account_missing"}';
  end if;
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_target;
  if v_acct.account_code is null then
    raise exception 'this client''s chart holds no account %', v_target using errcode='CLR10',
      detail=jsonb_build_object('reason','revenue_target_ineligible','axis','account_unknown',
        'account_code', v_target)::text;
  end if;
  if v_acct.account_type <> 'income' then
    -- Recognising an advance CREDITS revenue. A balance-sheet target would move the liability
    -- sideways and never recognise anything, and an expense target would recognise it backwards.
    raise exception 'account % is a % account; recognising deferred revenue credits INCOME', v_target, v_acct.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','revenue_target_ineligible','axis','not_income_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type)::text;
  end if;
  -- THE SAME HELPER THE EXPENSE HALF USES, so a bank-class, control, inactive or role-reserved
  -- account refuses by the estate's OWN existing rule rather than a second one written here. The
  -- line is shaped as a CREDIT because that is the side every period posts against it.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % cannot carry a revenue recognition', v_target using errcode='CLR10',
      detail=(jsonb_build_object('reason','revenue_target_ineligible') || v_breach)::text;
  end if;
  v_basis_text := nullif(btrim(coalesce(p_revenue_basis, '')), '');
  if v_basis_text is null then
    -- A judgement with NO RECORDED BASIS is what this wall exists to prevent: refuse rather than
    -- record an unexplained classification.
    raise exception 'the revenue account was proposed without its stated grounds'
      using errcode='CLR10',
        detail='{"reason":"revenue_target_underivable","axis":"basis_missing"}';
  end if;

  -- ---- THE PAIRED ALLOCATION. The evaluator's line VERBATIM plus this lane's own pairing. ----
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'debit_cents')::bigint,
           'deferred_account_code', v_deferred, 'revenue_account_code', v_acct.account_code));
  end loop;

  -- ---- THE DERIVED CADENCE AND THE PROPOSAL. ----
  v_from := (v_lines -> 0 ->> 'period_end')::date;
  v_to   := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base := (v_lines -> 0 ->> 'debit_cents')::bigint;

  v_memo := 'Deferred revenue recognition: ' || btrim(p_purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_deferred, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'deferred revenue released'),
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'revenue recognised')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    -- ONE CENT OVER TWO MONTHS truncates to a base of 0, so the first period's derived basis moves
    -- no money and the shared predicate refuses it. That raw refusal is correct but not
    -- actionable, so it becomes this lane's typed rung — carrying the predicate's OWN constraint
    -- and naming it as the owner, so a reader can see this door routed through it rather than
    -- inventing a second check.
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'this service period recognises nothing in at least one period: % cents over % periods truncates to a base of 0', v_total, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PLAN, through 0193's OWN door on the human lane and `clara._obo_plan_core` on the
  -- machine one, for the reason §D states: `clara.create_accounting_plan` resolves its actor from
  -- a JWT a runtime connection does not have. ----
  if p_lane = 'human' then
    v_plan := clara.create_accounting_plan(
      p_client => p_client, p_kind => 'revenue_recognition_schedule',
      p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  else
    v_plan := clara._obo_plan_core(
      p_kind => 'revenue_recognition_schedule',
      p_firm => p_firm, p_client => p_client, p_author => p_actor, p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis);
  end if;
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1: the plan row is the lane's first rung, and a writer that took the schedule
  -- row first would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  -- THE EVALUATOR VERSION ROW THIS SCHEDULE ACTUALLY RODE, resolved by the entrypoint signature
  -- rather than by a literal.
  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
   order by e.version desc limit 1;

  -- THE STRUCTURAL BACKSTOP ANSWERS IN THE LANE'S OWN WORDS. The typed duplicate check above
  -- cannot see a WINNER THAT HAS NOT COMMITTED: two people recognising the same receipt at once
  -- both pass it, and the loser queues on `uq_revenue_recognition_schedules_source` until the
  -- winner commits. Without this block that loser would be answered a bare 23505, a sentence with
  -- no next act. The index is still the authority; this only re-reads the winning row and
  -- re-raises the SAME CLR13 payload the pre-check raises, so both paths are one answer.
  begin
    insert into clara.revenue_recognition_schedules(firm_id, client_id, plan_id, plan_kind,
        revision, source_entry_id, deferred_account_code, revenue_account_code,
        revenue_account_basis, service_period_id, document_id, term_start, term_end, basis_kind,
        period_lines, total_cents, period_count, remainder_placement, recognition_pattern,
        schedule_version, evaluator_version_id, created_by, term_source, stated_term_id)
      values (p_firm, p_client, v_plan_id, 'revenue_recognition_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_deferred, v_acct.account_code,
        v_basis_text, v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        v_pattern, coalesce(v_sched ->> 'schedule_version', 'v2'), v_eval, p_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    select s.id into v_existing from clara.revenue_recognition_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
    raise exception 'this advance is already recognised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','deferred_revenue_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(p_firm, p_actor, null, null, 'create_revenue_recognition_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_sp_id,
      'term_source', v_term_source, 'stated_term', v_st_id,
      'deferred_account', v_deferred, 'revenue_account', v_acct.account_code,
      'periods', v_n, 'total_cents', v_total, 'pattern', v_pattern,
      'lane', p_lane, 'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'revenue_recognition_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'basis_kind', v_basis_kind,
    'term_source', v_term_source, 'stated_term_id', v_st_id,
    'term_start', to_char(v_term_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_term_end, 'YYYY-MM-DD'),
    'deferred_account_code', v_deferred, 'revenue_account_code', v_acct.account_code,
    'revenue_account_basis', v_basis_text,
    'total_cents', v_total, 'period_count', v_n,
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'recognition_pattern', v_pattern,
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v2'),
    'period_lines', v_paired,
    -- THE DERIVED CADENCE, echoed so the caller can SEE that none of it was theirs to choose.
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    -- THE BOUNDARY, IN THE DOOR'S OWN ANSWER: accepted configuration is not a posted occurrence.
    'configuration_only', true);
  return clara._finish_op(p_firm, 'create_revenue_recognition_schedule', p_op_key, v_result);
end $c0317_rrc$;

create or replace function clara.read_prepayment_source_for(p_firm uuid, p_client uuid, p_source_entry uuid)
returns jsonb language plpgsql stable security definer
set search_path = clara, pg_temp as $c0317_rpsf$
declare
  -- SCALARS, NOT RECORDS, and the reason is a defect this file met on the rig: a plpgsql `record`
  -- that no `select into` ever reaches raises `record "v_sp" is not assigned yet` the moment a
  -- field is read — so a memo-only recognition (no document, hence no document-carrier select)
  -- would make the read RAISE instead of reporting the absence it exists to report. Scalars start
  -- NULL, which is exactly what "nothing recorded" means here.
  v_entry record; v_legs int;
  v_leg_code text; v_leg_cents bigint;
  v_sp_id uuid; v_sp_start date; v_sp_end date; v_sp_kind text; v_sp_basis text;
  v_st_id uuid; v_st_start date; v_st_end date; v_st_reason text;
  v_sched_id uuid; v_sched_plan uuid; v_sched_source text;
  v_term jsonb;
begin
  if p_firm is null or p_client is null or p_source_entry is null then
    raise exception 'the runtime prepayment-source read names firm, client and source entry'
      using errcode='CLR10', detail='{"reason":"prepayment_read_scope_required"}';
  end if;
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'prepayment source entry not found in your firm' using errcode='CLR11',
      detail='{"reason":"prepayment_source_not_found"}';
  end if;

  -- THE PREPAID LEG, by the door's own predicate: exactly one DEBITED ASSET line. Zero or many is
  -- reported as a count rather than guessed at, for the same reason the door refuses it.
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  if v_legs = 1 then
    select jl.account_code, jl.debit_cents into v_leg_code, v_leg_cents
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  end if;

  -- THE RECORDED TERM. The document carrier first, because a document-bound recognition is the
  -- lane 0140 built; then #939's person-stated carrier. A recognition that binds a document does
  -- not carry a stated term at all (0305 refuses one), so the two arms cannot both answer.
  if v_entry.document_id is not null then
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis
      into v_sp_id, v_sp_start, v_sp_end, v_sp_kind, v_sp_basis
      from clara.document_service_periods sp
     where sp.document_id = v_entry.document_id and sp.superseded_at is null;
  end if;
  select t.id, t.period_start, t.period_end, t.reason
    into v_st_id, v_st_start, v_st_end, v_st_reason
    from clara.prepayment_stated_terms t
   where t.source_entry_id = p_source_entry and t.superseded_at is null;

  if v_sp_id is not null then
    v_term := jsonb_build_object('source', 'document_service_period',
      'service_period_id', v_sp_id, 'stated_term_id', null,
      'period_start', to_char(v_sp_start,'YYYY-MM-DD'),
      'period_end', to_char(v_sp_end,'YYYY-MM-DD'),
      'basis_kind', v_sp_kind, 'basis_text', v_sp_basis);
  elsif v_st_id is not null then
    v_term := jsonb_build_object('source', 'human_stated',
      'service_period_id', null, 'stated_term_id', v_st_id,
      'period_start', to_char(v_st_start,'YYYY-MM-DD'),
      'period_end', to_char(v_st_end,'YYYY-MM-DD'),
      'basis_kind', 'human_stated', 'basis_text', v_st_reason);
  else
    -- ABSENCE IS REPORTED AS ABSENCE, with the DOOR that fills it — never as an empty term a run
    -- could read as "no term is needed". The remedy named is the human one, because a service
    -- period is human-only by law and no agent path to it exists or ever will.
    v_term := jsonb_build_object('source', null,
      'service_period_id', null, 'stated_term_id', null,
      'period_start', null, 'period_end', null, 'basis_kind', null, 'basis_text', null,
      'remedy', case when v_entry.document_id is not null
                     then 'clara.record_document_service_period'
                     else 'clara.record_prepayment_stated_term' end);
  end if;

  select s.id, s.plan_id, s.term_source into v_sched_id, v_sched_plan, v_sched_source
    from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one

  return jsonb_build_object(
    'status', 'ok', 'firm_id', p_firm, 'client_id', p_client,
    'source_entry_id', p_source_entry,
    'entry', jsonb_build_object('status', v_entry.status, 'document_id', v_entry.document_id,
      'posting_date', to_char(v_entry.posting_date,'YYYY-MM-DD')),
    'prepaid', jsonb_build_object('account_code', v_leg_code,
      'total_cents', v_leg_cents, 'candidate_legs', v_legs),
    'term', v_term,
    'schedule', case when v_sched_id is null then null
                     else jsonb_build_object('schedule_id', v_sched_id, 'plan_id', v_sched_plan,
                            'term_source', v_sched_source) end);
end $c0317_rpsf$;

create or replace function clara.read_revenue_recognition_source_for(p_firm uuid, p_client uuid, p_source_entry uuid)
returns jsonb language plpgsql stable security definer
set search_path = clara, pg_temp as $c0317_rrsf$
declare
  v_entry record; v_legs int;
  v_leg_code text; v_leg_cents bigint;
  v_sp_id uuid; v_sp_start date; v_sp_end date; v_sp_kind text; v_sp_basis text;
  v_st_id uuid; v_st_start date; v_st_end date; v_st_reason text;
  v_sched_id uuid; v_sched_plan uuid; v_sched_source text;
  v_term jsonb;
begin
  if p_firm is null or p_client is null or p_source_entry is null then
    raise exception 'the runtime recognition-source read names firm, client and source entry'
      using errcode='CLR10', detail='{"reason":"revenue_recognition_read_scope_required"}';
  end if;
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'recognition source entry not found in your firm' using errcode='CLR11',
      detail='{"reason":"revenue_recognition_source_not_found"}';
  end if;

  -- THE DEFERRED LEG, by the door's own predicate: exactly one CREDITED LIABILITY line that is not
  -- the tax leg. Zero or many is reported as a COUNT rather than guessed at, for the same reason
  -- the door refuses it.
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.credit_cents > 0
     and ca.account_type = 'liability'
     and coalesce(ca.special_acc_type, '') <> 'sst_output';
  if v_legs = 1 then
    select jl.account_code, jl.credit_cents into v_leg_code, v_leg_cents
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.credit_cents > 0
       and ca.account_type = 'liability'
       and coalesce(ca.special_acc_type, '') <> 'sst_output';
  end if;

  -- THE RECORDED TERM. The document carrier first, because a document-bound receipt is the lane
  -- 0140 built; then #939's person-stated carrier. A receipt that binds a document does not carry
  -- a stated term at all (0305 refuses one), so the two arms cannot both answer.
  if v_entry.document_id is not null then
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis
      into v_sp_id, v_sp_start, v_sp_end, v_sp_kind, v_sp_basis
      from clara.document_service_periods sp
     where sp.document_id = v_entry.document_id and sp.superseded_at is null;
  end if;
  select t.id, t.period_start, t.period_end, t.reason
    into v_st_id, v_st_start, v_st_end, v_st_reason
    from clara.prepayment_stated_terms t
   where t.source_entry_id = p_source_entry and t.superseded_at is null;

  if v_sp_id is not null then
    v_term := jsonb_build_object('source', 'document_service_period',
      'service_period_id', v_sp_id, 'stated_term_id', null,
      'period_start', to_char(v_sp_start,'YYYY-MM-DD'),
      'period_end', to_char(v_sp_end,'YYYY-MM-DD'),
      'basis_kind', v_sp_kind, 'basis_text', v_sp_basis);
  elsif v_st_id is not null then
    v_term := jsonb_build_object('source', 'human_stated',
      'service_period_id', null, 'stated_term_id', v_st_id,
      'period_start', to_char(v_st_start,'YYYY-MM-DD'),
      'period_end', to_char(v_st_end,'YYYY-MM-DD'),
      'basis_kind', 'human_stated', 'basis_text', v_st_reason);
  else
    -- ABSENCE IS REPORTED AS ABSENCE, with the DOOR that fills it — never as an empty term a run
    -- could read as "no term is needed". The remedy named is the HUMAN one, because a service
    -- period is human-only by law and no agent path to it exists or ever will.
    v_term := jsonb_build_object('source', null,
      'service_period_id', null, 'stated_term_id', null,
      'period_start', null, 'period_end', null, 'basis_kind', null, 'basis_text', null,
      'remedy', case when v_entry.document_id is not null
                     then 'clara.record_document_service_period'
                     else 'clara.record_prepayment_stated_term' end);
  end if;

  select s.id, s.plan_id, s.term_source into v_sched_id, v_sched_plan, v_sched_source
    from clara.revenue_recognition_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one

  return jsonb_build_object(
    'status', 'ok', 'firm_id', p_firm, 'client_id', p_client,
    'source_entry_id', p_source_entry,
    'entry', jsonb_build_object('status', v_entry.status, 'document_id', v_entry.document_id,
      'posting_date', to_char(v_entry.posting_date,'YYYY-MM-DD')),
    'deferred', jsonb_build_object('account_code', v_leg_code,
      'total_cents', v_leg_cents, 'candidate_legs', v_legs),
    'term', v_term,
    'schedule', case when v_sched_id is null then null
                     else jsonb_build_object('schedule_id', v_sched_id, 'plan_id', v_sched_plan,
                            'term_source', v_sched_source) end);
end $c0317_rrsf$;


reset role;

-- =====================================================================================
-- §F — GRANTS. A new function is created with EXECUTE to PUBLIC, so every one of them is revoked
-- first and then granted to the ONE principal that may reach it. The two shared predicates are
-- granted to NOBODY: they are reached from a definer body only.
-- =====================================================================================
revoke all on function clara._schedule_term_correction(text,uuid) from public;
revoke all on function clara._schedule_open_remainder(uuid,jsonb,bigint) from public;
revoke all on function clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text) from public;
revoke all on function clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text) from public;

-- THE HUMAN LANE, AND ONLY IT. `clara_runtime`, `clara_agent_ro` and all four wake lanes gain
-- ZERO: re-deriving a client's amortisation is a judgement with a named person behind it, and a
-- machine grant here would be a correction nobody signed.
grant execute on function clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)
  to clara_authenticated;
grant execute on function clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)
  to clara_authenticated;

-- =====================================================================================
-- §TAIL — what a reader may rely on after this file, re-measured on the live catalog.
-- =====================================================================================
do $c0317_tail$
declare
  v_sig text; v_role text; v_n int; v_src text;
  v_keep text[][] := array[
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194'],
    ['clara.prepayment_schedule_v1(uuid,uuid)',
     'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara.end_accounting_plan(uuid,text,text)',
     'b3d6f214b2fa8e875ad3bce966bf51557f235b3b0d046a06cdb0e208b58f870c']
  ];
  v_expect text[][] := array[
    ['clara._schedule_term_correction(text,uuid)', 's'],
    ['clara._schedule_open_remainder(uuid,jsonb,bigint)', 's'],
    ['clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)', 'v'],
    ['clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)', 'v']
  ];
  v_i int;
begin
  -- 1 · THE UNIQUENESS RULE IS QUALIFIED, NOT GONE. Both halves asserted: the unconditional
  --     constraint is retired AND the partial index that replaces it exists with its predicate.
  foreach v_sig in array array['prepayment_schedules', 'revenue_recognition_schedules'] loop
    if exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                where t.relname = v_sig and c.conname like 'uq_%_source'
                  and pg_get_constraintdef(c.oid) = 'UNIQUE (source_entry_id)') then
      raise exception '0317 tail: %''s unconditional one-schedule-ever rule is still in force', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_indexes where schemaname = 'clara'
                  and indexname = 'uq_prepayment_schedules_source_live'
                  and indexdef like '%WHERE (superseded_at IS NULL)%') then
    raise exception '0317 tail: the prepayment live-schedule rule is missing or not partial'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'clara'
                  and indexname = 'uq_revenue_recognition_schedules_source_live'
                  and indexdef like '%WHERE (superseded_at IS NULL)%') then
    raise exception '0317 tail: the deferred-revenue live-schedule rule is missing or not partial'
      using errcode='CLR10';
  end if;

  -- 2 · THE CHAIN READS BOTH WAYS OR NOT AT ALL. Asserted rather than assumed, and asserted in a
  --     form that holds on a FIRST apply (where no row is superseded, so both counts are 0) and on
  --     a REDO of a rig that has already driven corrections: a stamped predecessor names the
  --     successor that names it back, and a successor that claims a predecessor is the one that
  --     predecessor points at. A half-written chain is a schedule a surface cannot place.
  select count(*)::int into v_n from clara.prepayment_schedules s
   where (s.superseded_by is not null
          and not exists (select 1 from clara.prepayment_schedules t
                           where t.id = s.superseded_by and t.replaces_schedule_id = s.id))
      or (s.replaces_schedule_id is not null
          and not exists (select 1 from clara.prepayment_schedules t
                           where t.id = s.replaces_schedule_id and t.superseded_by = s.id));
  if v_n <> 0 then
    raise exception '0317 tail: % prepayment schedule(s) carry a half-written supersession chain', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.revenue_recognition_schedules s
   where (s.superseded_by is not null
          and not exists (select 1 from clara.revenue_recognition_schedules t
                           where t.id = s.superseded_by and t.replaces_schedule_id = s.id))
      or (s.replaces_schedule_id is not null
          and not exists (select 1 from clara.revenue_recognition_schedules t
                           where t.id = s.replaces_schedule_id and t.superseded_by = s.id));
  if v_n <> 0 then
    raise exception '0317 tail: % recognition schedule(s) carry a half-written supersession chain', v_n
      using errcode='CLR10';
  end if;

  -- 3 · THE FOUR RECUT BODIES ASK THE LIVE QUESTION.
  foreach v_sig in array array[
    'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
    'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
    'clara.read_prepayment_source_for(uuid,uuid,uuid)',
    'clara.read_revenue_recognition_source_for(uuid,uuid,uuid)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position('s.superseded_at is null' in v_src) = 0 then
      raise exception '0317 tail: % still asks whether ANY schedule exists rather than which one stands', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE TWO TRIGGERS ADMIT THE STAMP AND NOTHING ELSE.
  foreach v_sig in array array['clara._tf_prepayment_schedules_append_only()',
                               'clara._tf_revenue_recognition_schedules_append_only()'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position('superseded_by' in v_src) = 0 or position('to_jsonb(new)' in v_src) = 0 then
      raise exception '0317 tail: % does not admit the supersession stamp', v_sig using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'prepayment_schedules'
                    and t.tgname = 't_prepayment_schedules_append_only' and not t.tgisinternal) then
    raise exception '0317 tail: the prepayment append-only trigger is not attached' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'revenue_recognition_schedules'
                    and t.tgname = 't_revenue_recognition_schedules_append_only'
                    and not t.tgisinternal) then
    raise exception '0317 tail: the recognition append-only trigger is not attached' using errcode='CLR10';
  end if;

  -- 5 · THE FOUR NEW BODIES' POSTURE AND VOLATILITY.
  for v_i in 1 .. array_length(v_expect, 1) loop
    if not exists (select 1 from pg_proc p
                    where p.oid = v_expect[v_i][1]::regprocedure
                      and pg_get_userbyid(p.proowner) = 'clara_fn_owner' and p.prosecdef
                      and p.provolatile = v_expect[v_i][2]
                      and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=clara, pg_temp') then
      raise exception '0317 tail: %''s owner/definer/volatility/search_path posture is wrong',
        v_expect[v_i][1] using errcode='CLR10';
    end if;
  end loop;

  -- 6 · THE ACL. The two doors reach clara_authenticated and NOTHING else; the two predicates reach
  --     no application role at all.
  foreach v_sig in array array['clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)',
                               'clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)'] loop
    if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
      raise exception '0317 tail: clara_authenticated cannot reach %', v_sig using errcode='CLR10';
    end if;
    foreach v_role in array array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                                  'clara_wake_proactive','public'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception '0317 tail: % can execute % -- a term correction names a person', v_role, v_sig
          using errcode='CLR10';
      end if;
    end loop;
  end loop;
  foreach v_sig in array array['clara._schedule_term_correction(text,uuid)',
                               'clara._schedule_open_remainder(uuid,jsonb,bigint)'] loop
    foreach v_role in array array['clara_authenticated','clara_runtime','clara_agent_ro',
                                  'clara_wake_interactive','clara_wake_proactive','public'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception '0317 tail: % holds a grant on the ungranted predicate %', v_role, v_sig
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- 7 · NO WAKE WRAPPER AND NO OBO TWIN EXISTS FOR EITHER DOOR, asserted by catalog count rather
  --     than by convention (0305's own instrument).
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and (p.proname ~ '^wake_.*replace_.*schedule$' or p.proname ~ '^replace_.*schedule_for$'
          or p.proname ~ '^_agent_.*replace_.*schedule');
  if v_n <> 0 then
    raise exception '0317 tail: % machine wrapper(s) exist for the correction doors', v_n
      using errcode='CLR10';
  end if;

  -- 8 · THE NEIGHBOURS THIS FILE NESTS ARE STILL THE BODIES IT WAS WRITTEN AGAINST — including the
  --     FROZEN evaluators, which this file must not have moved.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_src is distinct from v_keep[v_i][2]
      -- RIDERS WAVE 4 INTEGRATION. BIMODAL for clara.create_accounting_plan, whose body 0308
      -- recuts: on the integrated chain 0308 recuts from 0300's post-image (it carries the third
      -- authority_ref kind contract_confirmation that lane 01's 0300 added), so its output is
      -- a7c108d5... rather than the c8e99098... this lane measured on a rig with no 0300. Admitted
      -- at EITHER value; every other pin in this array stays exact. Precedent: wave 3's 0284.
       and v_src is distinct from (case v_keep[v_i][1]
            when 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'
              then 'a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c'
            else null end) then
      raise exception '0317 tail: % moved under this file (expected %, live %)',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_src, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  raise notice '0317 OK — the correction path exists on both lanes: 2 human doors, 2 ungranted predicates, 2 qualified uniqueness rules, 6 recut bodies, 0 machine wrappers';
end $c0317_tail$;
