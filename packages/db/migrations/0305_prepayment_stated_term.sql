-- 0305_prepayment_stated_term — #939 (riders wave 4, lane 04): A PREPAYMENT POSTED WITH NO
-- DOCUMENT CANNOT BE AMORTISED AT ALL.
-- =====================================================================================
-- Spec of record: issue #939's Agent Brief (parent #910; owner ruling 2026-09-18, option C with
-- its six defaults).
--
-- THE GAP THIS CLOSES. `ck_je_basis` (0003:127) admits a MEMO-ONLY journal entry — the client paid
-- a year of insurance and said so, the accountant recorded the payment against a prepaid asset, and
-- no invoice ever arrived. `clara.prepayment_schedule_v1` (0140) reads its term off
-- `clara.document_service_periods`, which is keyed to a DOCUMENT, so such an entry answers
-- `prepayment_term_underivable` naming `journal_entries.document_id` and there the lane stops: a
-- prepaid asset sits on the books with nothing amortising it, and the only "fix" a firm could find
-- was to invent a document. The ACCRUAL lane already accepts a person-stated period with no
-- document (0222/0284); this brings the prepayment lane level with it.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A second, INDEPENDENT term carrier —
-- `clara.prepayment_stated_terms`, at RECOGNITION-ENTRY grain, with the same fact-with-a-basis
-- discipline `clara.document_service_periods` carries — its one human door
-- `clara.record_prepayment_stated_term`, a `clara.prepayment_schedule_v2` that takes the amount and
-- the term as INPUTS so the door (not the evaluator) picks the source leg and the term source, and
-- the term-source provenance on `clara.prepayment_schedules` and on its two reads.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It does not touch `clara.document_service_periods`, its
-- triggers, its policies or either of its two doors: the two lanes SHARE that table today and the
-- ticket's own sentence is "without touching the document service-period table the two lanes
-- share". It does not edit the frozen `clara.prepayment_schedule_v1` body (law 9: a changed formula
-- is a _v2, never an edit) and it does not re-derive any schedule that already exists.
--
-- PROVENANCE IS THE ONLY DIFFERENCE. A schedule derived from a stated term behaves exactly like one
-- derived from a document's own service period: the same whole-calendar-month straight line, the
-- same cent remainder wholly in the final period, the same one Work and one receipt per month, the
-- same 120-month cap. What the estate records in addition is WHERE the term came from, WHO said so,
-- WHEN and WHY.
--
-- ==================== THE PRESTATE PINS ARE PER BODY, NOT GLOBAL ====================
-- 0285 (#919) pinned its two recut bodies under ONE mode — every body at its pre-image (FIRST) or
-- every body already recut (REDO) — and refused a half-and-half reading. That coupling is right for
-- two bodies recut for ONE reason in ONE go. It is wrong here, and the difference is stated rather
-- than slipped: this file recuts FOUR bodies for FOUR different reasons, and three sibling tickets
-- of this same lane (#940, #915, #941) recut some of the same reads immediately after it. A global
-- mode would refuse a legitimate estate in which a sibling had already moved one of them. So each
-- body admits exactly TWO pre-images of its OWN — its measured live sha256(prosrc), or a body that
-- already carries this file's own `#939` attribution — and anything else is real drift and still
-- refuses BY NAME. The mode each body was found in is reported in the notice, so a half-and-half
-- reading is visible rather than silent.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md): `create table if not exists`,
-- `create or replace function`, `drop trigger if exists` before each `create trigger`, `drop policy
-- if exists` before each policy, `add column if not exists`, and every constraint added under a
-- `pg_constraint` guard. Re-running this file against a database that already carries its old
-- effects is therefore safe, which is what `CLARA_MIGRATION_REDO` requires.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file does no
                                        -- backfill and no bulk scan. The one NOT NULL column added
                                        -- to an existing relation carries a constant default, which
                                        -- PostgreSQL 11+ records in the catalog rather than
                                        -- rewriting the heap.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t939_pre$
declare
  v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE FOUR BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (rule:
  -- pin what is LIVE, never a literal copied from an older migration's text). 0285 (#919) recut the
  -- last two of them; the shas below are that post-0285 text.
  v_recut text[][] := array[
    ['clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     'aa917dfd042be429eb62c96c7b2075003c097ac445e77d9a35501762740f506f'],
    ['clara.list_prepayment_attention(uuid)',
     '0ac2975581a0f330b5e5e0ebb6b1f9d56a5d5d6cdae9973f59a24142a4fd1e49'],
    ['clara.get_prepayment_schedule(uuid)',
     '2d7d8c2a4dfa89cd7c12146ab90b35fd57303668c6b2b73e56b4e139c4f8e686'],
    ['clara.list_prepayment_schedules(uuid)',
     'faf6e995045457bc14f122cd02abfdfd160147f36bd3b164a8e38497e493511e']
  ];
  -- …AND THE NEIGHBOUR THIS FILE MUST NOT MOVE. `clara.prepayment_schedule_v1` is a registered,
  -- single-member `clara.evaluator_versions` closure: an edit reds the apply through
  -- clara.verify_evaluator_freeze(). It is pinned here UNCONDITIONALLY — there is no redo branch,
  -- because this file never touches it in either mode, so a changed sha is always a finding.
  v_v1_pin text := 'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2';
begin
  if to_regclass('clara.prepayment_schedules') is null then
    raise exception '#939 prestate: clara.prepayment_schedules is absent -- 0223 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.document_service_periods') is null then
    raise exception '#939 prestate: clara.document_service_periods is absent -- 0140 must apply first'
      using errcode='CLR10';
  end if;

  for v_i in 1 .. array_length(v_recut, 1) loop
    if to_regprocedure(v_recut[v_i][1]) is null then
      raise exception '#939 prestate: % does not resolve -- 0223/0285 must apply first', v_recut[v_i][1]
        using errcode='CLR10';
    end if;
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('#939' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '#939 prestate: % has DRIFTED -- it is neither its measured pre-image nor a body this file already recut, so re-derive the recut against the live text before applying (got %)',
        v_recut[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- THE FROZEN EVALUATOR IS EXACTLY WHERE 0140 LEFT IT. Read positively: "this file does not edit
  -- v1" is a claim, and the sha is the evidence.
  if to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is null then
    raise exception '#939 prestate: clara.prepayment_schedule_v1 is absent -- 0140 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.prepayment_schedule_v1(uuid,uuid)'::regprocedure;
  if v_sha is distinct from v_v1_pin then
    raise exception '#939 prestate: clara.prepayment_schedule_v1 has MOVED (got %) -- it is a registered evaluator closure member and this file''s whole v2 argument rests on it being untouched',
      v_sha using errcode='CLR10';
  end if;

  -- THE RLS POSTURE THE NEW RELATION MIRRORS, measured rather than assumed carried through.
  if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara' and c.relname = 'document_service_periods'
         and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#939 prestate: clara.document_service_periods is not RLS-forced -- the shape this file mirrors is not what it was measured to be'
      using errcode='CLR10';
  end if;

  raise notice '#939 prestate: clean -- clara.prepayment_schedules and clara.document_service_periods exist, the four recut bodies are each at one of their two admitted pre-images (%), clara.prepayment_schedule_v1 is byte-identical to its 0140 body, and document_service_periods is RLS-forced.', btrim(v_modes);
end
$t939_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.prepayment_stated_terms — THE SECOND TERM CARRIER, at RECOGNITION-ENTRY grain.
--
-- WHY A SECOND RELATION AND NOT A NULLABLE document_id ON THE FIRST. `clara.document_service_periods`
-- is DOCUMENT-grain by construction: its tenancy is a composite FK onto `clara.documents(id, firm_id)`,
-- its liveness index is `unique (document_id) where superseded_at is null`, and its evidence-region
-- congruence trigger resolves region -> extraction -> document. Making `document_id` nullable would
-- void all three at once and would touch the table the accrual lane and the prepayment lane SHARE —
-- which is exactly what the ticket says not to do. A term stated for a memo-only prepayment has a
-- different natural key (the recognition ENTRY, because that is the only durable thing it is about),
-- so it is a different relation.
--
-- WHY ENTRY GRAIN AND NOT CLIENT GRAIN. The term answers "over what period does THIS payment get
-- consumed". Two prepayments of the same client have two terms; one entry has one.
--
-- THE DISCIPLINE IS `clara.document_service_periods`' OWN, column for column: supersede-never-mutate,
-- one live row per subject, a REQUIRED free-text basis (here named `reason`, the ticket's own word),
-- a recorded actor, finite and domain-bounded dates, and the SAME 120-month cap computed with the
-- SAME arithmetic the evaluator uses (decision 5).
-- =====================================================================================
create table if not exists clara.prepayment_stated_terms (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null references clara.firms(id),
  client_id       uuid        not null,
  source_entry_id uuid        not null,
  period_start    date        not null,
  period_end      date        not null,
  -- THE STATED REASON. Not optional and not defaulted — 0055:392-396's rule verbatim, and the
  -- ticket's own ruling 1: "the term must be stated by a named person with a reason".
  reason          text        not null check (btrim(reason) <> ''),
  stated_by       uuid        not null references clara.users(id),
  stated_at       timestamptz not null default now(),
  -- DEFERRABLE so the door can stamp the predecessor with the successor's id and insert the
  -- successor in ONE transaction (checked at commit) — clara.client_facts' own idiom, 0055:401-403.
  superseded_by   uuid        references clara.prepayment_stated_terms(id) deferrable initially deferred,
  superseded_at   timestamptz,
  constraint ck_pst_period_order check (period_end >= period_start),
  -- FINITE AND BOUNDED, at the TABLE as well as at the door: `date` admits 'infinity' and years in
  -- the millions, and a bookkeeper keys this by hand. The door refuses these BY NAME so a caller
  -- gets a reason; these exist so no OTHER writer, now or later, can get past them. The domain is
  -- `clara.document_service_periods`' own (ck_dsp_domain), because the two carriers describe the
  -- same kind of fact and a term admissible on one lane must be admissible on the other.
  constraint ck_pst_finite check (isfinite(period_start) and isfinite(period_end)),
  constraint ck_pst_domain check (
    period_start >= date '1900-01-01' and period_start <= date '2200-12-31'
    and period_end >= date '1900-01-01' and period_end <= date '2200-12-31'),
  -- THE LIMIT BINDS ON THE PERIOD COUNT THE RULED PREDICATE DERIVES, not on a date subtraction —
  -- ck_dsp_max_periods' expression verbatim, because decision 5 is "the same 120-month cap as a
  -- document term" and a cap computed a second way would be a second cap.
  constraint ck_pst_max_periods check (
    ((extract(year from date_trunc('month', period_end))::int * 12
      + extract(month from date_trunc('month', period_end))::int)
     - (extract(year from case when period_start = date_trunc('month', period_start)::date
                               then date_trunc('month', period_start)
                               else date_trunc('month', period_start) + interval '1 month' end)::int * 12
        + extract(month from case when period_start = date_trunc('month', period_start)::date
                                  then date_trunc('month', period_start)
                                  else date_trunc('month', period_start) + interval '1 month' end)::int)
     + 1) <= 120),
  -- The stamp is ONE act: both columns or neither (0055:405-408).
  constraint ck_pst_supersession_paired check (
    (superseded_by is null) = (superseded_at is null)),
  -- TENANCY IS STRUCTURAL, not a trusted column. The (entry, firm, client) triple is ONE fact,
  -- enforced by the composite FK onto `uq_journal_entries_id_firm_client` — so RLS's firm predicate
  -- and every reader's entry predicate are provably the same tenant, and a term can never name an
  -- entry of another client of the same firm.
  constraint fk_pst_entry foreign key (source_entry_id, firm_id, client_id)
    references clara.journal_entries (id, firm_id, client_id),
  constraint fk_pst_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id)
);

-- ONE LIVE STATED TERM PER RECOGNITION ENTRY. Partial-unique on the live population, exactly the
-- uq_document_service_period_live shape. A superseded row does not contend, so two people racing on
-- the same entry serialize on the predecessor's row lock and the loser meets this index loudly
-- rather than producing a silent double-live state.
create unique index if not exists uq_prepayment_stated_term_live
  on clara.prepayment_stated_terms (source_entry_id) where superseded_at is null;
create index if not exists ix_prepayment_stated_terms_entry
  on clara.prepayment_stated_terms (source_entry_id, stated_at desc);
create index if not exists ix_prepayment_stated_terms_client
  on clara.prepayment_stated_terms (client_id, stated_at desc);

-- -------------------------------------------------------------------------------------------------
-- §A.1 — SUPERSEDE-ONLY + APPEND-ONLY. The ONE lawful update is the supersession stamp; everything
-- else on the row is immutable from INSERT, and a row already superseded is immutable outright.
-- Mirrors clara._tf_dsp_supersede_only (0140) column for column.
-- -------------------------------------------------------------------------------------------------
create or replace function clara._tf_pst_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded prepayment term is immutable'
      using errcode = 'CLR08', detail = '{"reason":"prepayment_stated_term_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id              is distinct from old.id
     or new.firm_id         is distinct from old.firm_id
     or new.client_id       is distinct from old.client_id
     or new.source_entry_id is distinct from old.source_entry_id
     or new.period_start    is distinct from old.period_start
     or new.period_end      is distinct from old.period_end
     or new.reason          is distinct from old.reason
     or new.stated_by       is distinct from old.stated_by
     or new.stated_at       is distinct from old.stated_at then
    raise exception 'prepayment_stated_terms admits exactly one update: the supersession stamp (superseded_by and superseded_at together, set once)'
      using errcode = 'CLR08', detail = '{"reason":"prepayment_stated_term_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_pst_supersede_only() from public;

drop trigger if exists t_pst_supersede_only on clara.prepayment_stated_terms;
create trigger t_pst_supersede_only before update on clara.prepayment_stated_terms
  for each row execute function clara._tf_pst_supersede_only();
drop trigger if exists t_pst_no_delete on clara.prepayment_stated_terms;
create trigger t_pst_no_delete before delete on clara.prepayment_stated_terms
  for each row execute function clara._tf_append_only();
drop trigger if exists t_pst_no_truncate on clara.prepayment_stated_terms;
create trigger t_pst_no_truncate before truncate on clara.prepayment_stated_terms
  for each statement execute function clara._tf_no_truncate();

-- -------------------------------------------------------------------------------------------------
-- §A.2 — FORCED RLS + THE POLICY PAIR, spelled exactly as clara.document_service_periods' pair is.
-- The human read carries the BOOKKEEPER FLOOR, not the bare firm predicate: this table holds a
-- professional's STATED REASON, the same data class 0140 walled off there.
-- -------------------------------------------------------------------------------------------------
alter table clara.prepayment_stated_terms enable row level security;
alter table clara.prepayment_stated_terms force row level security;
drop policy if exists p_pst_owner on clara.prepayment_stated_terms;
create policy p_pst_owner on clara.prepayment_stated_terms
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_pst_human on clara.prepayment_stated_terms;
create policy p_pst_human on clara.prepayment_stated_terms
  for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and clara.actor_role_rank() >= clara.role_rank('bookkeeper'));
grant select on clara.prepayment_stated_terms to clara_authenticated;

comment on table clara.prepayment_stated_terms is
  '#939: the DB-OWNED term carrier for a prepayment recognised with NO document, at RECOGNITION-ENTRY grain, on the clara.document_service_periods fact-with-a-basis discipline (ADR-062). Its ONE lawful producer is a human through clara.record_prepayment_stated_term: there is no agent grant and no wake wrapper, because a period a model supplied is a model-generated value entering a durable artifact (hard constraint 2; owner default 6, 2026-09-18). Supersede-never-mutate; one live term per recognition entry; a mis-stated term is corrected by superseding it and opening a NEW schedule from the next period, never by moving a running one.';

-- =====================================================================================
-- §B — clara.record_prepayment_stated_term — THE ONE HUMAN DOOR.
--
-- BOOKKEEPER FLOOR (owner decision 2: "stating a term is bookkeeper work, the same floor as
-- recording a document's service period"). clara_authenticated ONLY: no agent role, no wake role,
-- no runtime role, and no wake wrapper anywhere in this file.
--
-- RESERVE-BEFORE-MUTABLE-VALIDATION (the 0055:518-524 placement, same reasoning as 0140's own term
-- door): the replay short-circuit sits after identity/authz and before anything reading mutable
-- world state, so a retry of a SUCCEEDED call returns its stored receipt even though the world
-- moved. A FIRST call that fails a later validation raises, and the raise rolls the reservation
-- back with it, so the caller may fix the input and retry under the SAME key.
-- =====================================================================================
create or replace function clara.record_prepayment_stated_term(
    p_client uuid, p_source_entry uuid, p_period_start date, p_period_end date,
    p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_entry record; v_prior uuid; v_new uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'stating a prepayment term requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
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
    raise exception 'client is not active -- no new stated prepayment term' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'record_prepayment_stated_term', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'period_start', p_period_start, 'period_end', p_period_end,
      'reason', btrim(coalesce(p_reason, '')))));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this stated-term key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- WHO/REASON/WHEN is the ruled trio (ADR-062): a fact without its basis is REFUSED, never
  -- defaulted. The table CHECK says the same thing; this is the door saying it by name first, so
  -- the caller gets a reason rather than a constraint violation.
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a stated prepayment term requires its reason -- who said so, on what grounds'
      using errcode='CLR10', detail='{"reason":"prepayment_stated_term_reason_missing"}';
  end if;
  if p_period_start is null or p_period_end is null then
    raise exception 'a stated prepayment term requires both of its dates'
      using errcode='CLR10', detail='{"reason":"prepayment_stated_term_dates_missing"}';
  end if;
  if p_period_end < p_period_start then
    raise exception 'a stated prepayment term ends on or after it starts'
      using errcode='CLR10', detail='{"reason":"prepayment_stated_term_dates_inverted"}';
  end if;

  -- THE 0021 RULE (the 0022:203-206 door idiom): absent and foreign answer with ONE refusal, so
  -- this door is not an existence oracle for another client's entries. The predicate is the FULL
  -- tenancy triple, which is also what the composite FK below will enforce structurally.
  select je.id, je.status, je.document_id, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = v_firm;
  if v_entry.id is null then
    raise exception 'recognition entry not found for this client'
      using errcode='CLR11', detail='{"reason":"prepayment_source_entry_not_found"}';
  end if;
  -- A TERM IS STATED OVER A POSTED PAYMENT. 0140's own `prepayment_source_unfit` token, because
  -- that is exactly what this says — no new vocabulary for an old fact.
  if v_entry.status <> 'approved' then
    raise exception 'a prepayment term is stated over a POSTED entry; this one is %', v_entry.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'axis','source_not_posted', 'source_entry', p_source_entry,
          'status', v_entry.status)::text;
  end if;
  -- THIS DOOR IS FOR THE MEMO-ONLY LANE ONLY, and that is a wall rather than a convention. A
  -- document-bound recognition already has a lawful term carrier with its own door, its own
  -- evidence-region congruence and its own supersession chain; admitting one here would create a
  -- SECOND live term for one prepayment and no rule for which of them wins.
  if v_entry.document_id is not null then
    raise exception 'this recognition binds a document -- record its service period on the document instead'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_stated_term_source_has_document',
          'source_entry', p_source_entry, 'document_id', v_entry.document_id,
          'remedy', 'clara.record_document_service_period')::text;
  end if;

  -- SUPERSESSION, NEVER UPDATE (0055:610-623's idiom, 0140's spelling). Lock the live predecessor,
  -- stamp it with the successor's id (the FK is deferred to commit), then insert the successor.
  select t.id into v_prior from clara.prepayment_stated_terms t
   where t.source_entry_id = p_source_entry and t.superseded_at is null
   for update;
  v_new := gen_random_uuid();
  if v_prior is not null then
    update clara.prepayment_stated_terms
      set superseded_by = v_new, superseded_at = now()
      where id = v_prior;
  end if;
  insert into clara.prepayment_stated_terms(id, firm_id, client_id, source_entry_id,
      period_start, period_end, reason, stated_by)
    values (v_new, v_firm, p_client, p_source_entry,
      p_period_start, p_period_end, btrim(p_reason), v_actor);

  -- args stay REDACTED (ids and dates, never the reason text -- the reason lives on the row, which
  -- is the record of record; 0002's audit_log doctrine).
  perform clara._audit(v_firm, v_actor, null, null, 'record_prepayment_stated_term', null,
    jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'stated_term_id', v_new, 'superseded_id', v_prior,
      'period_start', p_period_start, 'period_end', p_period_end, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'record_prepayment_stated_term', p_op_key,
    jsonb_build_object('stated_term_id', v_new, 'client_id', p_client,
      'source_entry_id', p_source_entry,
      'period_start', to_char(p_period_start, 'YYYY-MM-DD'),
      'period_end', to_char(p_period_end, 'YYYY-MM-DD'),
      'reason', btrim(p_reason), 'stated_by', v_actor,
      'superseded_id', v_prior));
end $$;
revoke all on function clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text) from public;

comment on function clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text) is
  '#939: the ONE lawful producer of clara.prepayment_stated_terms. Bookkeeper floor, clara_authenticated only; NO agent grant and NO wake wrapper exists, because a service period a model supplied would be a model-generated value entering a durable artifact (hard constraint 2; owner default 6, 2026-09-18) -- the model may only ever ask the fixed two-date question. Refuses a document-bound recognition by name: that lane has its own carrier and its own door, and two live terms for one prepayment would have no rule for which wins.';

-- =====================================================================================
-- §C — clara.prepayment_schedule_v2 — THE SAME FORMULA, WITH THE AMOUNT AND THE TERM AS INPUTS.
--
-- WHY A _v2 AND NOT AN EDIT. `clara.prepayment_schedule_v1` is a registered single-member
-- `clara.evaluator_versions` closure: `clara.verify_evaluator_freeze()` re-derives its body hash
-- LIVE from the catalog between every migration's body and its commit, so an in-place edit fails at
-- APPLY, not merely at review. Law 9 applied to evaluators: a changed formula is a _vN, never an
-- edit. The formula here is UNCHANGED — the two evaluators agree line for line on every input v1
-- can see, and cell `p939.evaluator.v2_agrees` drives both and compares them rather than asserting
-- it.
--
-- WHAT ACTUALLY CHANGES IS WHO DECIDES. v1 reads the term off `clara.document_service_periods` and
-- the amount off "the one debited asset leg" of the source entry, so the EVALUATOR picks both the
-- source leg and the term source. v2 takes all three as ARGUMENTS, which moves those two choices to
-- the DOOR — where they belong, because they are exactly what #939 makes conditional: the term may
-- now come from a person's statement, and the released leg may now be a CREDITED LIABILITY rather
-- than a debited asset (the deferred-revenue mirror #941 builds on 2030, which is why
-- `p_release_side` is an argument and not this body's guess). The arithmetic stays where it was.
--
-- IT CALLS NO OTHER clara FUNCTION AND READS NO TABLE, which is what keeps its own registration a
-- genuine SINGLE-MEMBER closure (§C.1). Registering an N-member closure freezes N bodies estate-wide
-- — `verify_evaluator_freeze()` ignores the `deployed` flag and hashes the full
-- `pg_get_functiondef` — so every member is a body a later lane can never recut without reding an
-- apply. v1 earned its one member the same way and §TAIL censuses this one for the same property.
--
-- THE CAP LIVES HERE TOO, and that is not duplication. v1 can never meet a term longer than 120
-- charged months because its carrier refuses to hold one (`ck_dsp_max_periods`,
-- `ck_pst_max_periods`). v2's term is an ARGUMENT, so without this wall it would happily emit a
-- 121st line for a term no door in this estate would accept. Same constant, same arithmetic, same
-- reason — the owner's decision 5 is "the same 120-month cap as a document term".
--
-- ITS REFUSALS ARE RETURNED, NEVER RAISED — 0140's own contract for an evaluator, which is exactly
-- what lets a door re-raise them with their payloads intact and an agent lane land them as rungs.
-- The tokens are 0140's five, unchanged; `axis` says which arm answered.
--
-- POSTURE: STABLE, SECURITY DEFINER, pinned search_path, owned by `clara_fn_owner`, and UNGRANTED —
-- v1's posture verbatim. The definer confers nothing (no application role can execute it at all);
-- it is spelled the same so the pair can be compared on the formula rather than on the frame.
-- =====================================================================================
create or replace function clara.prepayment_schedule_v2(
    p_total_cents bigint, p_account_code text, p_release_side text,
    p_term_start date, p_term_end date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $eval2$
declare
  v_code  text;
  v_side  text;
  v_first date;
  v_last  date;
  v_n     int;
  v_base  bigint;
  v_rem   bigint;
  v_lines jsonb := '[]'::jsonb;
  v_ps    date;
  v_pe    date;
  v_amt   bigint;
  i       int;
begin
  -- -----------------------------------------------------------------------------------------
  -- FITNESS OF THE SUPPLIED LEG. v1 answers these by reading the entry; here the caller states
  -- them, so each one is a first-class refusal rather than an assumption about a good caller.
  -- -----------------------------------------------------------------------------------------
  if p_total_cents is null or p_total_cents <= 0 then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_source_unfit',
      'axis', 'amount_not_positive',
      'reason', 'an amortisation releases a positive amount',
      'total_cents', p_total_cents);
  end if;
  v_code := nullif(btrim(coalesce(p_account_code, '')), '');
  if v_code is null then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_source_unfit',
      'axis', 'account_missing',
      'reason', 'the released leg names no account');
  end if;
  -- A CLOSED SET, and the caller must choose. A default would be this body guessing which side of
  -- the released leg the periods post against — a prepaid ASSET is released by CREDIT and a
  -- deferred-revenue LIABILITY by DEBIT, and getting that wrong posts the books backwards.
  v_side := btrim(coalesce(p_release_side, ''));
  if v_side not in ('credit', 'debit') then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_source_unfit',
      'axis', 'release_side_unknown',
      'reason', 'the released leg is either credited (a prepaid asset) or debited (a deferred-revenue liability)',
      'release_side', p_release_side);
  end if;

  -- -----------------------------------------------------------------------------------------
  -- THE TERM. ORDER IS LOAD-BEARING (0140's own Codex P4a finding, restated because this body
  -- repeats the arithmetic): presence, then finiteness, then the DOMAIN in pure date comparison,
  -- and only THEN anything that does interval arithmetic. A finite 5874897-AD date passes
  -- isfinite and then OVERFLOWS the timestamp domain inside `date_trunc(...) + interval '1 month'`,
  -- so the guard would blow up before the typed refusal it guards could speak.
  -- -----------------------------------------------------------------------------------------
  if p_term_start is null or p_term_end is null then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_term_underivable',
      'axis', 'dates_missing', 'reason', 'a term needs both of its dates');
  end if;
  if not isfinite(p_term_start) or not isfinite(p_term_end) then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_term_underivable',
      'axis', 'dates_not_finite', 'reason', 'a term must carry finite dates');
  end if;
  if p_term_start < date '1900-01-01' or p_term_start > date '2200-12-31'
     or p_term_end < date '1900-01-01' or p_term_end > date '2200-12-31' then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_term_underivable',
      'axis', 'dates_out_of_domain',
      'reason', 'a term must fall inside 1900-01-01 .. 2200-12-31',
      'domain_from', date '1900-01-01', 'domain_to', date '2200-12-31',
      'term_start', p_term_start, 'term_end', p_term_end);
  end if;
  if p_term_end < p_term_start then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_term_underivable',
      'axis', 'dates_inverted', 'reason', 'a term ends on or after it starts',
      'term_start', p_term_start, 'term_end', p_term_end);
  end if;

  -- THE PERIODS — v1's ruled predicate, spelled identically: the first charged month is the first
  -- whose day 1 the term covers; the last is the last whose day 1 the term covers.
  v_first := case when p_term_start = date_trunc('month', p_term_start)::date
                  then p_term_start
                  else (date_trunc('month', p_term_start) + interval '1 month')::date end;
  v_last  := date_trunc('month', p_term_end)::date;
  v_n := ((extract(year from v_last)::int * 12 + extract(month from v_last)::int)
        - (extract(year from v_first)::int * 12 + extract(month from v_first)::int)) + 1;
  if v_n < 1 then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_term_underivable',
      'axis', 'no_whole_month',
      'reason', 'the term covers no calendar month''s first day, so it charges no whole month',
      'term_start', p_term_start, 'term_end', p_term_end);
  end if;
  if v_n > 120 then
    return jsonb_build_object('schedule_version', 'v2', 'refusal', 'prepayment_term_underivable',
      'axis', 'term_too_long',
      'reason', 'a term spanning more charged months than this estate''s carriers admit',
      'max_periods', 120, 'derived_periods', v_n,
      'term_start', p_term_start, 'term_end', p_term_end);
  end if;

  -- base truncated toward zero; the remainder lands WHOLLY in the final period, so the emitted
  -- amounts sum to total_cents EXACTLY. v1's line, and the reason is the same: "round each period"
  -- loses sen.
  v_base := p_total_cents / v_n;
  v_rem  := p_total_cents - (v_base * v_n);

  for i in 0 .. v_n - 1 loop
    v_ps := (v_first + (i || ' months')::interval)::date;
    v_pe := ((v_first + ((i + 1) || ' months')::interval) - interval '1 day')::date;
    v_amt := v_base + case when i = v_n - 1 then v_rem else 0 end;
    -- THE RELEASED HALF ONLY, exactly as v1 emits it. The charge half is the door's: it pairs each
    -- of these with the judged EXPENSE (or earned REVENUE) account for the same amount, which is
    -- what keeps this evaluator amounts-only and hard constraint 2 exact.
    v_lines := v_lines || jsonb_build_object(
      'period_start', v_ps, 'period_end', v_pe,
      'debit_cents',  case when v_side = 'debit'  then v_amt else 0 end,
      'credit_cents', case when v_side = 'credit' then v_amt else 0 end,
      'account_code', v_code);
  end loop;

  return jsonb_build_object(
    'schedule_version', 'v2',
    'period_lines', v_lines,
    'total_cents', p_total_cents,
    'period_count', v_n,
    'release_account_code', v_code,
    'release_side', v_side,
    'term_start', p_term_start, 'term_end', p_term_end,
    'remainder_placement', 'final_period');
end $eval2$;
revoke all on function clara.prepayment_schedule_v2(bigint,text,text,date,date) from public;

-- -------------------------------------------------------------------------------------------------
-- §C.1 — THE FREEZE REGISTRATION, single-member by construction. 0140 §C.1's shape verbatim.
--
-- THE search_path HERE IS LOAD-BEARING, NOT COSMETIC (0059:243-245's recorded reason, which 0091
-- and 0140 restate): clara.verify_evaluator_freeze() reproduces the closure hash under
-- pg_catalog,pg_temp, so a registration performed under ANY OTHER search_path stores a hash the
-- verifier CANNOT reproduce and every later apply reds. It is set immediately before and restored
-- immediately after.
--
-- ONE MEMBER, deliberately. Registering a closure freezes EVERY member body estate-wide, so an
-- N-member registration is N bodies a later lane can never recut without reding an apply.
-- clara.prepayment_schedule_v2 calls no other clara function precisely so that this list can
-- honestly have one entry, and §TAIL censuses that property rather than trusting this comment.
--
-- deployed = false: evaluator versions are BORN undeployed (clara._tf_evaluator_deploy_once) and
-- the flip is a one-way ceremony act run from merged main. The freeze binds regardless — the flag
-- is about traffic, not about immutability.
--
-- GUARDED FOR REDO (#957), and the guard is a PRESENCE test rather than an upsert on purpose:
-- clara.evaluator_version_members is append-only and clara.evaluator_versions refuses DELETE
-- outright, so this registration is a ONE-SHOT act. A redo after an edit to the v2 BODY would
-- therefore leave a stale member hash and clara.verify_evaluator_freeze() would fail the apply —
-- loudly, which is the correct outcome: once registered, a changed formula is a _v3 and never an
-- edit. That is law 9, and it applies to this file's own author too.
-- -------------------------------------------------------------------------------------------------
set local search_path = pg_catalog, pg_temp;
do $t939_freeze$
declare e uuid; h bytea;
begin
  if exists (select 1 from clara.evaluator_versions
              where evaluator_name = 'prepayment_schedule' and version = 2 and firm_id is null) then
    raise notice '#939 freeze: prepayment_schedule v2 is already registered -- this is a redo, and the registration is a one-shot act (clara.evaluator_version_members is append-only). clara.verify_evaluator_freeze() will refuse this apply if the body moved since.';
  else
    select sha256(convert_to(string_agg(
             encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), 'hex'),
             '' order by o), 'UTF8')) into h
      from (values (0, 'clara.prepayment_schedule_v2(bigint,text,text,date,date)')) m(o, s);
    insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
        closure_sha256, migration_version, deployed)
      values ('prepayment_schedule', 2,
        'clara.prepayment_schedule_v2(bigint,text,text,date,date)', h,
        -- *** CLAIMED AT MERGE: the literal is this file's own name, trued from its authored form
        -- in the SAME commit as any rename (.claude/rules/db-migrations.md). A stale literal here
        -- would point a later reader at a file that does not exist. ***
        '0305_prepayment_stated_term', false)
      returning id into e;
    insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
        body_sha256, firm_id)
      select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')),
             null::uuid
        from (values (0, 'clara.prepayment_schedule_v2(bigint,text,text,date,date)')) m(o, s);
  end if;
end
$t939_freeze$;
set local search_path = clara, pg_temp;

comment on function clara.prepayment_schedule_v2(bigint,text,text,date,date) is
  '#939: the versioned deterministic evaluator behind the memo-only prepayment lane. clara.prepayment_schedule_v1''s formula UNCHANGED — whole-calendar-month straight line, a month charged iff the term covers its FIRST day, the remainder wholly in the final period — with the amount, the released account, the released SIDE and the term supplied as arguments, so the DOOR picks the source leg and the term source rather than this body. The side is an argument because a prepaid ASSET is released by credit and a deferred-revenue LIABILITY by debit, and a default would be this body guessing which. Calls no other clara function and reads no table, which is what keeps its evaluator_versions closure at ONE member and the freeze meaningful; a changed formula is a _v3, never an edit.';


-- =====================================================================================
-- §D — clara.prepayment_schedules LEARNS WHERE ITS TERM CAME FROM.
--
-- TWO NEW COLUMNS AND TWO RELAXED ONES. `term_source` is the closed set
-- ('document_service_period' | 'human_stated'); `stated_term_id` names the
-- `clara.prepayment_stated_terms` row a human-stated schedule was DERIVED from, exactly as
-- `service_period_id` names the document row a document-backed one was derived from. Those two and
-- `document_id` become NULLABLE, because a memo-only prepayment has neither — they were NOT NULL
-- only because, before this file, no other lane existed.
--
-- THE CARRIER CONSTRAINT IS WHAT KEEPS THAT HONEST. A row says exactly one of the two things: a
-- document-backed schedule carries its document and its service period and NO stated term; a
-- human-stated one carries its stated term and NEITHER. Without it "nullable" would mean a schedule
-- could claim a document provenance while naming nothing, which is the provenance theatre this
-- whole family exists to refuse.
--
-- THE BACKFILL IS THE DEFAULT, and it is correct rather than convenient: every row that exists
-- before this file was derived from a document's own service period, because that was the only
-- route there was. The default is then DROPPED, so every later writer must say which lane it is on
-- rather than inheriting an answer.
--
-- `clara.prepayment_schedules` is APPEND-ONLY through `_tf_prepayment_schedules_append_only`, which
-- is a row-level DML trigger: `alter table … add column` with a constant default is a catalog-only
-- operation on PostgreSQL 11+ and fires no trigger and rewrites no heap.
-- =====================================================================================
alter table clara.prepayment_schedules
  add column if not exists term_source text not null default 'document_service_period';
alter table clara.prepayment_schedules
  add column if not exists stated_term_id uuid references clara.prepayment_stated_terms(id);
alter table clara.prepayment_schedules alter column term_source drop default;
alter table clara.prepayment_schedules alter column service_period_id drop not null;
alter table clara.prepayment_schedules alter column document_id drop not null;

do $t939_carrier$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.prepayment_schedules'::regclass
                    and conname = 'ck_ps_term_source_carrier') then
    alter table clara.prepayment_schedules add constraint ck_ps_term_source_carrier check (
      case term_source
        when 'document_service_period' then
          service_period_id is not null and document_id is not null and stated_term_id is null
        when 'human_stated' then
          stated_term_id is not null and service_period_id is null and document_id is null
        else false
      end);
  end if;
end
$t939_carrier$;

comment on column clara.prepayment_schedules.term_source is
  '#939: WHERE this schedule''s term came from — ''document_service_period'' (a clara.document_service_periods row, named by service_period_id) or ''human_stated'' (a clara.prepayment_stated_terms row, named by stated_term_id). ck_ps_term_source_carrier makes the pairing structural: a row names exactly one carrier and never claims a provenance it cannot point at.';

-- =====================================================================================
-- §E — clara.create_prepayment_schedule — RECUT. 0223's full body, with ONE branch added: when the
-- recognition entry binds NO document, the term comes from the live `clara.prepayment_stated_terms`
-- row and the amounts come from `clara.prepayment_schedule_v2`. Nothing on the document lane moves.
--
-- WHY THE FITNESS ARMS ARE SPELLED HERE FOR THE MEMO LANE. On the document lane the frozen v1 asks
-- them (posted, exactly one debited asset leg, a fiscal year that admits the term) and returns its
-- refusals, which this door re-raises. v2 cannot ask them: it reads no table by design, which is
-- what keeps its closure at one member. So the DOOR asks them — with 0140's OWN tokens, sentences
-- and payload keys, so a surface that already carries the document lane's refusals carries this
-- lane's unchanged. That is the ticket's own line: the door, not the evaluator, picks the source
-- leg and the term source.
-- =====================================================================================
create or replace function clara.create_prepayment_schedule(p_client uuid, p_source_entry uuid,
    p_expense_account text, p_expense_basis text, p_purpose text, p_authority_ref jsonb,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
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
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating a prepayment schedule requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
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
  v_dedupe := clara._reserve_op(v_firm, 'create_prepayment_schedule', p_op_key,
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
   where s.source_entry_id = p_source_entry and s.firm_id = v_firm;
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
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = v_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
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
  v_plan := clara.create_accounting_plan(
    p_client => p_client, p_kind => 'amortisation_schedule', p_purpose => btrim(p_purpose),
    p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
    p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
    p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
    p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
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
      values (v_firm, p_client, v_plan_id, 'amortisation_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_prepaid, v_acct.account_code, v_basis_text,
        v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        coalesce(v_sched ->> 'schedule_version', 'v1'), v_eval, v_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    -- The read runs in the OUTER transaction, after the failed subtransaction rolled back, so the
    -- winner is visible by now. `v_existing` may still be null if some OTHER unique index fired --
    -- in which case the payload says so by carrying a null schedule_id rather than pretending.
    select s.id into v_existing from clara.prepayment_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = v_firm;
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(v_firm, v_actor, null, null, 'create_prepayment_schedule', null,
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
  return clara._finish_op(v_firm, 'create_prepayment_schedule', p_op_key, v_result);
end $$;


-- =====================================================================================
-- §F — THE TWO SCHEDULE READS, EXTENDED. #919 (0285) gave both reads five term-liveness fields
-- joined from `clara.document_service_periods`. #939 adds a SECOND carrier, and the ticket's own
-- line is "the reads #919 recuts are extended, not forked".
--
-- SO THERE IS ONE SET OF FIELDS, NOT TWO. `term_live`, `term_superseded_by`, `term_moved`,
-- `term_current_start` and `term_current_end` keep their exact #919 meanings and are computed
-- against WHICHEVER carrier the schedule actually rode, chosen by `term_source`. A surface written
-- against #919 keeps working and gains nothing to learn; a schedule on the new lane answers the
-- same questions. Forking them into `document_term_live` / `stated_term_live` would have made
-- every reader ask which pair to trust.
--
-- ADV-02 CARRIES OVER UNCHANGED, because the second carrier has the same property that made it
-- necessary: `clara.record_prepayment_stated_term` supersedes the live statement UNCONDITIONALLY —
-- it compares no dates — so `term_live` goes false on a restatement that repeats the term byte for
-- byte. `term_moved` stays the fact a surface may act on, and it is computed against the statement
-- that stands TODAY, never against `superseded_by`'s, which may be an intermediate row of a
-- twice-corrected chain.
--
-- THE `join` BECAME A `left join`, AND THAT IS THE BUG THIS SECTION ALSO FIXES. 0285's list read
-- joined `clara.document_service_periods` INNER on `service_period_id`. The moment a schedule
-- exists with no document row — which is precisely what §E now creates — that schedule would be
-- ABSENT from its own firm's list: live in the books, invisible on the screen. Cell
-- `p939.reads.term_source` drives both reads with one schedule of each lane on one client.
--
-- THREE FIELDS ARE GENUINELY NEW, and they are the difference the ticket is about: `term_source`
-- says which carrier, and `term_stated_by` / `term_stated_at` / `term_reason` carry WHO stated the
-- term, WHEN and WHY. They are NULL on the document lane rather than filled with the document's
-- own recorder, because "a person stated this term" is a different claim from "somebody typed a
-- service period off an invoice", and the surface must be able to tell them apart.
-- =====================================================================================
create or replace function clara.get_prepayment_schedule(p_schedule uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_ctx record; s clara.prepayment_schedules; p clara.accounting_plans; r record;
  v_occ jsonb; v_periods jsonb; v_entry record; v_covered date;
  v_term_live boolean; v_term_superseded_by uuid; v_term_moved boolean;  -- #919
  v_term_current_start date; v_term_current_end date;                    -- #919
  v_term_stated_by uuid; v_term_stated_at timestamptz; v_term_reason text;  -- #939
begin
  select * into v_ctx from clara._prepayment_ctx(p_schedule, clara.role_rank('viewer')) c;
  s := v_ctx.sc;
  select * into p from clara.accounting_plans where id = s.plan_id;
  select * into r from clara.accounting_plan_revisions
   where plan_id = s.plan_id and superseded_at is null;
  v_covered := clara._plan_covered_through(s.plan_id);
  select je.posting_date, je.memo, je.status into v_entry
    from clara.journal_entries je where je.id = s.source_entry_id;

  -- EVERY OCCURRENCE, with the same projection 0193's own occurrence read gives — the committed
  -- receipt only, the entry id out of its effects, the typed refusal reason, and the Work's own
  -- settled error where the refusal happened at POSTING rather than at admission.
  select coalesce(jsonb_agg(x order by x ->> 'due_date'), '[]'::jsonb) into v_occ
    from (
      select jsonb_build_object(
        'occurrence_id', o.id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'), 'leg', o.leg,
        'period_key', to_char(o.period_key,'YYYY-MM-DD'), 'attempt', o.attempt,
        'revision', o.revision, 'intent_key', o.intent_key, 'work_id', o.work_id,
        'admitted_at', o.admitted_at, 'outcome', o.outcome, 'created_at', o.created_at,
        'attempts', o.attempts,
        'work_status', w.status, 'work_error', w.error,
        'receipt_id', (select rc.id from clara.operation_receipts rc
                        where rc.work_id = o.work_id and rc.outcome = 'committed'
                        order by rc.created_at limit 1),
        'entry_id', (select rc.effects ->> 'entry_id' from clara.operation_receipts rc
                      where rc.work_id = o.work_id and rc.outcome = 'committed'
                      order by rc.created_at limit 1)) as x
        from clara.accounting_plan_occurrences o
        left join clara.accounting_work w on w.id = o.work_id
       where o.plan_id = s.plan_id
    ) t;

  select coalesce(jsonb_agg(y order by y ->> 'period_end'), '[]'::jsonb) into v_periods
    from (
      select (l || jsonb_build_object('occurrence',
               (select e from jsonb_array_elements(v_occ) e
                 where e ->> 'due_date' = l ->> 'period_end' limit 1))) as y
        from jsonb_array_elements(s.period_lines) l
    ) u;

  -- #919/#939 — THE TERM-LIVENESS FIELDS, over the carrier this schedule actually rode.
  -- `service_period_id` / `stated_term_id` name the row this schedule was DERIVED from (0223's own
  -- append-only design: a corrected term supersedes that row and NEVER moves the stored
  -- allocation). Joined here rather than assumed live, because a bookkeeper can correct the term at
  -- any later point — through `clara.record_document_service_period` or, on the memo-only lane,
  -- `clara.record_prepayment_stated_term` — and this read is the only place that fact becomes
  -- visible: the schedule row itself keeps naming the row it actually rode.
  --
  -- `term_live` is the AUDIT fact (is the row this schedule rode still the live statement?).
  -- `term_moved` is the fact a SURFACE may act on: BOTH term doors supersede unconditionally, so a
  -- re-record that restates the SAME dates flips `term_live` while changing nothing a firm needs
  -- to act on (ADV-02). The comparison is against the term that stands TODAY — the carrier's one
  -- `superseded_at is null` row — never against `superseded_by`'s, which may be an intermediate row
  -- of a twice-corrected chain.
  if s.term_source = 'human_stated' then
    select (t.superseded_at is null), t.superseded_by, cur.period_start, cur.period_end,
           (t.superseded_at is not null
              and (cur.period_start, cur.period_end)
                    is distinct from (t.period_start, t.period_end)),
           t.stated_by, t.stated_at, t.reason
      into v_term_live, v_term_superseded_by, v_term_current_start, v_term_current_end,
           v_term_moved, v_term_stated_by, v_term_stated_at, v_term_reason
      from clara.prepayment_stated_terms t
      left join lateral (
        select c.period_start, c.period_end from clara.prepayment_stated_terms c
         where c.source_entry_id = t.source_entry_id and c.superseded_at is null limit 1) cur on true
     where t.id = s.stated_term_id;
  else
    select (sp.superseded_at is null), sp.superseded_by, cur.period_start, cur.period_end,
           (sp.superseded_at is not null
              and (cur.period_start, cur.period_end)
                    is distinct from (sp.period_start, sp.period_end))
      into v_term_live, v_term_superseded_by, v_term_current_start, v_term_current_end, v_term_moved
      from clara.document_service_periods sp
      left join lateral (
        select c.period_start, c.period_end from clara.document_service_periods c
         where c.document_id = sp.document_id and c.superseded_at is null limit 1) cur on true
     where sp.id = s.service_period_id;
  end if;

  return jsonb_build_object(
    'schedule_id', s.id, 'client_id', s.client_id, 'plan_id', s.plan_id,
    'revision', s.revision, 'kind', p.kind, 'status', p.status, 'purpose', p.purpose,
    'source_entry_id', s.source_entry_id,
    'source_posting_date', case when v_entry.posting_date is null then null
                                else to_char(v_entry.posting_date,'YYYY-MM-DD') end,
    'source_memo', v_entry.memo, 'source_status', v_entry.status,
    'document_id', s.document_id, 'service_period_id', s.service_period_id,
    -- #939 — WHICH CARRIER, and on the stated lane WHO said so, WHEN and WHY. Null on the document
    -- lane rather than filled from the document's own recorder: "a person stated this term" is a
    -- different claim from "somebody typed a service period off an invoice".
    'term_source', s.term_source, 'stated_term_id', s.stated_term_id,
    'term_stated_by', v_term_stated_by, 'term_stated_at', v_term_stated_at,
    'term_reason', v_term_reason,
    'term_live', v_term_live, 'term_superseded_by', v_term_superseded_by,  -- #919
    'term_moved', v_term_moved,                                            -- #919
    'term_current_start', case when v_term_current_start is null then null
                               else to_char(v_term_current_start,'YYYY-MM-DD') end,
    'term_current_end', case when v_term_current_end is null then null
                             else to_char(v_term_current_end,'YYYY-MM-DD') end,
    'term_start', to_char(s.term_start,'YYYY-MM-DD'), 'term_end', to_char(s.term_end,'YYYY-MM-DD'),
    'basis_kind', s.basis_kind)
    -- THE ENVELOPE IS BUILT IN TWO HALVES AND CONCATENATED, and that is a LIMIT, not a taste:
    -- jsonb_build_object is a variadic function and PostgreSQL refuses more than 100 arguments
    -- (54023, measured on this rig the moment #939's five new keys were added). `||` over two
    -- objects is the estate's own spelling for the same value; no key moves and no key changes.
    || jsonb_build_object(
    'prepaid_account_code', s.prepaid_account_code,
    'expense_account_code', s.expense_account_code,
    'expense_account_basis', s.expense_account_basis,
    'total_cents', s.total_cents, 'period_count', s.period_count,
    'remainder_placement', s.remainder_placement, 'schedule_version', s.schedule_version,
    'created_by', s.created_by, 'created_at', s.created_at,
    'authority_kind', p.authority_kind, 'authority_ref', p.authority_ref,
    'authorised_by', p.authorised_by, 'authorised_at', p.authorised_at,
    'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
    'covered_through', case when v_covered is null then null else to_char(v_covered,'YYYY-MM-DD') end,
    'paused_at', p.paused_at, 'paused_by', p.paused_by, 'paused_reason', p.paused_reason,
    'ended_at', p.ended_at, 'ended_by', p.ended_by, 'ended_reason', p.ended_reason,
    'live_revision', case when r.revision is null then null else jsonb_build_object(
      'revision', r.revision, 'frequency', r.frequency, 'day_rule', r.day_rule,
      'day_of_month', r.day_of_month, 'timezone', r.timezone,
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
      'basis', r.basis, 'basis_digest', r.basis_digest) end,
    'periods', v_periods, 'occurrences', v_occ,
    -- THE TWO BOUNDARY SENTENCES THE SURFACE MUST SAY, answered by the database rather than
    -- written into a component: a schedule creates journal Work and never initiates a payment, and
    -- accepted configuration is not a posted occurrence.
    'configuration_only', true);
end $$;

create or replace function clara.list_prepayment_schedules(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_rows jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'schedule_id', s.id, 'plan_id', s.plan_id, 'purpose', p.purpose, 'status', p.status,
        'source_entry_id', s.source_entry_id, 'document_id', s.document_id,
        'term_start', to_char(s.term_start,'YYYY-MM-DD'),
        'term_end', to_char(s.term_end,'YYYY-MM-DD'),
        -- #939 — WHICH CARRIER the term came from, and on the stated lane who said so, when and
        -- why. The list carries them so a marker and a filter need no second read.
        'term_source', s.term_source, 'stated_term_id', s.stated_term_id,
        'term_stated_by', pst.stated_by, 'term_stated_at', pst.stated_at,
        'term_reason', pst.reason,
        -- #919/#939 — the SAME term-liveness fields get_prepayment_schedule carries, computed the
        -- same way against the term that stands TODAY (ADV-02), over whichever carrier this
        -- schedule rode.
        'term_live', case when s.term_source = 'human_stated'
                          then (pst.superseded_at is null)
                          else (dsp.superseded_at is null) end,
        'term_superseded_by', case when s.term_source = 'human_stated'
                          then pst.superseded_by else dsp.superseded_by end,
        'term_moved', case when s.term_source = 'human_stated'
                          then (pst.superseded_at is not null
                                and (pcur.period_start, pcur.period_end)
                                      is distinct from (pst.period_start, pst.period_end))
                          else (dsp.superseded_at is not null
                                and (dcur.period_start, dcur.period_end)
                                      is distinct from (dsp.period_start, dsp.period_end)) end,
        'term_current_start', case
          when s.term_source = 'human_stated' then
            case when pcur.period_start is null then null
                 else to_char(pcur.period_start,'YYYY-MM-DD') end
          else case when dcur.period_start is null then null
                    else to_char(dcur.period_start,'YYYY-MM-DD') end end,
        'term_current_end', case
          when s.term_source = 'human_stated' then
            case when pcur.period_end is null then null
                 else to_char(pcur.period_end,'YYYY-MM-DD') end
          else case when dcur.period_end is null then null
                    else to_char(dcur.period_end,'YYYY-MM-DD') end end,
        'prepaid_account_code', s.prepaid_account_code,
        'expense_account_code', s.expense_account_code,
        'total_cents', s.total_cents, 'period_count', s.period_count,
        'basis_kind', s.basis_kind, 'created_at', s.created_at,
        'effective_from', case when r.effective_from is null then null
                               else to_char(r.effective_from,'YYYY-MM-DD') end,
        'effective_to', case when r.effective_to is null then null
                             else to_char(r.effective_to,'YYYY-MM-DD') end,
        -- HOW MANY PERIODS ACTUALLY PUT MONEY ON THE BOOKS. A committed receipt, never an
        -- admitted Work: "admitted" and "posted" are two facts and the list says the second one.
        'posted_periods', (select count(*)::int from clara.accounting_plan_occurrences o
                            join clara.operation_receipts rc on rc.work_id = o.work_id
                                                            and rc.outcome = 'committed'
                            where o.plan_id = s.plan_id),
        'occurrence_count', (select count(*)::int from clara.accounting_plan_occurrences o
                              where o.plan_id = s.plan_id),
        'next_due', (select to_char(e.due_date,'YYYY-MM-DD')
                       from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule,
                              r.day_of_month, r.auto_reverse,
                              greatest(r.effective_from, coalesce(
                                (select max(o.due_date) + 1 from clara.accounting_plan_occurrences o
                                  where o.plan_id = s.plan_id), r.effective_from)),
                              coalesce(r.effective_to, r.effective_from + 3650), 1) e limit 1)
      ) as x
        from clara.prepayment_schedules s
        join clara.accounting_plans p on p.id = s.plan_id
        left join clara.accounting_plan_revisions r
               on r.plan_id = s.plan_id and r.superseded_at is null
        -- #939 — LEFT, not INNER. 0285 joined the document carrier INNER on service_period_id,
        -- which silently DROPPED any schedule with no document row from its own firm's list the
        -- moment such a schedule could exist. Both carriers are now optional joins and
        -- `term_source` says which one to read.
        left join clara.document_service_periods dsp on dsp.id = s.service_period_id
        left join lateral (
          select c.period_start, c.period_end from clara.document_service_periods c
           where c.document_id = dsp.document_id and c.superseded_at is null limit 1) dcur on true
        left join clara.prepayment_stated_terms pst on pst.id = s.stated_term_id
        left join lateral (
          select c.period_start, c.period_end from clara.prepayment_stated_terms c
           where c.source_entry_id = pst.source_entry_id and c.superseded_at is null limit 1) pcur on true
       where s.client_id = p_client and s.firm_id = v_firm
    ) t;
  return jsonb_build_object('client_id', p_client, 'schedules', v_rows);
end $$;


-- =====================================================================================
-- §G — clara.list_prepayment_attention — RECUT. Arm B is "recognised, not yet amortised", and
-- before this file it filtered `je.document_id is not null`. That filter was not arbitrary: with
-- no other term carrier, a memo-only recognition could never be configured, so advertising it
-- would have been offering an action that could only refuse. #939 makes it configurable, so the
-- filter now HIDES exactly the prepayments this ticket exists to rescue — a prepaid asset sitting
-- on the books with nothing tracking it and nothing on any screen saying so.
--
-- WHAT THE ARM NOW SAYS. Each candidate carries WHICH carrier its term would live in
-- (`term_carrier`), whether that carrier already holds a live term (`has_live_term`), and the
-- person's NEXT ACT as a closed token (`next_step`): `configure_schedule` when a term already
-- stands, `record_document_service_period` for a document-bound recognition that has none, and
-- `state_service_period` for a memo-only one. A token rather than a sentence, because the copy is
-- the surface's and the FACT is the database's.
--
-- ARM A AND THE PAGING ENVELOPE DO NOT MOVE. The cap, the ordering-before-cutting and the two
-- truncation flags are 0223's, unchanged.
-- =====================================================================================
create or replace function clara.list_prepayment_attention(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_a jsonb; v_b jsonb;
        v_a_trunc boolean := false; v_b_trunc boolean := false;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;

  -- THE PAGE IS ORDERED BEFORE IT IS CUT, and the envelope says when the cut bit. A `limit 50`
  -- inside a select with NO ORDER BY hands back an ARBITRARY fifty and the ordering applied
  -- afterwards only sorts the survivors -- so on a client with more candidates than the cap the
  -- NEWEST refusal, which is the one this read exists to surface, could simply be absent with
  -- nothing saying so. Measured by `p653.attention.window`.
  with cand_a as (
      select jsonb_build_object(
        'arm', 'refusing', 'schedule_id', s.id, 'plan_id', s.plan_id, 'purpose', p.purpose,
        'status', p.status, 'occurrence_id', o.id,
        'due_date', to_char(o.due_date,'YYYY-MM-DD'),
        'period_key', to_char(o.period_key,'YYYY-MM-DD'),
        'attempt', o.attempt, 'work_id', o.work_id,
        -- WHERE it stopped, because the operator's next move differs: an admission refusal is a
        -- plan-lane fact (authority, window, period line), a posting refusal is a books fact
        -- (closed period, withdrawn egress authority) recorded on the Work.
        'stage', case when coalesce(o.outcome ->> 'state','') = 'refused' then 'admission'
                      else 'posting' end,
        'code', case when coalesce(o.outcome ->> 'state','') = 'refused' then o.outcome ->> 'code'
                     else w.error ->> 'code' end,
        'reason', case when coalesce(o.outcome ->> 'state','') = 'refused' then o.outcome ->> 'reason'
                       else w.error ->> 'reason' end,
        'message', case when coalesce(o.outcome ->> 'state','') = 'refused' then o.outcome ->> 'message'
                        else w.error ->> 'message' end,
        'work_status', w.status,
        -- The catch-up window this period would need, so the surface can offer the EXISTING
        -- window-only door rather than inventing a recovery of its own.
        'catch_up_from', to_char(o.due_date,'YYYY-MM-DD'),
        'catch_up_to', to_char(o.due_date,'YYYY-MM-DD')) as x,
        o.due_date as sk
        from clara.prepayment_schedules s
        join clara.accounting_plans p on p.id = s.plan_id
        cross join lateral (
          select o2.* from clara.accounting_plan_occurrences o2
           where o2.plan_id = s.plan_id
           order by o2.due_date desc, o2.created_at desc limit 1) o
        left join clara.accounting_work w on w.id = o.work_id
       where s.client_id = p_client and s.firm_id = v_firm and p.status <> 'ended'
         and (
           coalesce(o.outcome ->> 'state','') = 'refused'
           or (o.work_id is not null
               and w.status in ('failed','refused','cancelled','expired')
               and not exists (select 1 from clara.operation_receipts rc
                                where rc.work_id = o.work_id and rc.outcome = 'committed')))
    )
  select coalesce(jsonb_agg(p.x order by p.sk desc, p.x ->> 'occurrence_id'), '[]'::jsonb),
         (select count(*) from cand_a) > 50
    into v_a, v_a_trunc
    from (select c.x, c.sk from cand_a c order by c.sk desc, c.x ->> 'occurrence_id' limit 50) p;

  with cand_b as (
      select jsonb_build_object(
        'arm', 'unscheduled', 'entry_id', je.id,
        'posting_date', to_char(je.posting_date,'YYYY-MM-DD'), 'memo', je.memo,
        'document_id', je.document_id,
        'prepaid_account_code', x.account_code, 'amount_cents', x.debit_cents,
        -- #939 — WHICH CARRIER this recognition's term lives in. A document-bound recognition's
        -- term belongs to its document; a memo-only one's belongs to the person who states it.
        'term_carrier', case when je.document_id is not null
                             then 'document_service_period' else 'human_stated' end,
        'has_live_term', case when je.document_id is not null
          then exists (select 1 from clara.document_service_periods sp
                        where sp.document_id = je.document_id and sp.superseded_at is null)
          else exists (select 1 from clara.prepayment_stated_terms t
                        where t.source_entry_id = je.id and t.superseded_at is null) end,
        -- #939 — THE NEXT ACT, as a CLOSED TOKEN. The copy is the surface's; the fact is this
        -- read's. Before this file a memo-only prepayment was not listed at all, so there was no
        -- next act to name and a firm had no way to discover the gap.
        'next_step', case
          when (case when je.document_id is not null
                then exists (select 1 from clara.document_service_periods sp
                              where sp.document_id = je.document_id and sp.superseded_at is null)
                else exists (select 1 from clara.prepayment_stated_terms t
                              where t.source_entry_id = je.id and t.superseded_at is null) end)
            then 'configure_schedule'
          when je.document_id is not null then 'record_document_service_period'
          else 'state_service_period' end) as y,
        je.posting_date as sk
        from clara.journal_entries je
        cross join lateral (
          select jl.account_code, jl.debit_cents, count(*) over () as legs
            from clara.journal_lines jl
            join clara.coa_accounts ca on ca.client_id = jl.client_id
                                      and ca.account_code = jl.account_code
           where jl.entry_id = je.id and jl.debit_cents > 0 and ca.account_type = 'asset') x
       where je.client_id = p_client and je.status = 'approved'
         -- #939 — THE `document_id is not null` FILTER IS GONE. It was not arbitrary: with no
         -- other term carrier a memo-only recognition could never be configured, so listing it
         -- would have offered an action that could only refuse. Now it can be, so the filter
         -- hides exactly the prepayments this ticket exists to rescue.
         and je.reversed_by is null
         and x.legs = 1
         and not exists (select 1 from clara.prepayment_schedules s
                          where s.source_entry_id = je.id)
         -- THE SAME ELIGIBILITY WALL THE DOOR APPLIES to the prepaid leg (§D), so the band cannot
         -- advertise a recognition the door would refuse. Without it arm B lists every ordinary
         -- sales invoice, documented bank receipt and fixed-asset purchase as "posted, not yet
         -- amortised" with a "configure the schedule" action -- measured on the rig.
         and clara._adj_line_eligibility_breach(p_client,
               jsonb_build_array(jsonb_build_object('account_code', x.account_code,
                 'debit_cents', 0, 'credit_cents', 1))) is null
    )
  select coalesce(jsonb_agg(q.y order by q.sk desc, q.y ->> 'entry_id'), '[]'::jsonb),
         (select count(*) from cand_b) > 50
    into v_b, v_b_trunc
    from (select c.y, c.sk from cand_b c order by c.sk desc, c.y ->> 'entry_id' limit 50) q;

  return jsonb_build_object('client_id', p_client, 'refusing', v_a, 'unscheduled', v_b,
    -- THE CAP, SAID OUT LOUD. A band showing fifty of nine hundred without this reads as "nothing
    -- else is failing", which is the exact misreading the whole read exists to prevent.
    'refusing_truncated', v_a_trunc, 'unscheduled_truncated', v_b_trunc,
    'cap', 50,
    'attention', v_a || v_b);
end $$;

reset role;

grant execute on function clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)
  to clara_authenticated;
-- clara.prepayment_schedule_v2 is granted to NOBODY, exactly as v1 is: it is reached only from a
-- definer door, no consumer exists for a human grant, and law 31 says do not mint one.

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- =====================================================================================
do $t939_tail$
declare v_n int; v_posture text; v_sha text;
begin
  -- 1 · THE RELATION EXISTS with the posture §A claims, and it is FORCED RLS with the owner policy
  --     and the bookkeeper-floored human read — not one or the other.
  if to_regclass('clara.prepayment_stated_terms') is null then
    raise exception '#939 tail: clara.prepayment_stated_terms does not exist' using errcode='CLR10';
  end if;
  if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara' and c.relname = 'prepayment_stated_terms'
         and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#939 tail: clara.prepayment_stated_terms is not RLS-forced' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'clara.prepayment_stated_terms'::regclass
                   and polname = 'p_pst_owner')
     or not exists (select 1 from pg_policy where polrelid = 'clara.prepayment_stated_terms'::regclass
                      and polname = 'p_pst_human') then
    raise exception '#939 tail: the policy pair on clara.prepayment_stated_terms is incomplete'
      using errcode='CLR10';
  end if;
  -- THE HUMAN POLICY CARRIES THE BOOKKEEPER RANK CONJUNCT, asserted BY EXPRESSION rather than by
  -- name: a policy that kept its name and lost its floor would pass a count.
  if not exists (
      select 1 from pg_policy
       where polrelid = 'clara.prepayment_stated_terms'::regclass and polname = 'p_pst_human'
         and position('bookkeeper' in pg_get_expr(polqual, polrelid)) > 0
         and position('jwt_firm' in pg_get_expr(polqual, polrelid)) > 0
         and polcmd = 'r') then
    raise exception '#939 tail: p_pst_human is not a SELECT-only policy carrying BOTH the firm predicate and the bookkeeper rank conjunct'
      using errcode='CLR10';
  end if;

  -- 2 · THE THREE TRIGGERS. Supersede-only, no delete, no truncate — the clara.document_service_periods
  --     discipline, minus its evidence-region congruence trigger (this carrier cites no region).
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.prepayment_stated_terms'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception '#939 tail: expected 3 triggers on clara.prepayment_stated_terms, found %', v_n
      using errcode='CLR10';
  end if;

  -- 3 · THE LIVENESS INDEX IS PARTIAL, pinned by its predicate rather than by its name.
  if not exists (
      select 1 from pg_index i
       where i.indrelid = 'clara.prepayment_stated_terms'::regclass and i.indisunique
         and position('superseded_at IS NULL' in pg_get_expr(i.indpred, i.indrelid)) > 0) then
    raise exception '#939 tail: clara.prepayment_stated_terms has no partial-unique LIVE index'
      using errcode='CLR10';
  end if;

  -- 4 · THE DOOR'S POSTURE AND ITS ACL. This is decision 6 made structural: the human lane holds
  --     EXECUTE and nothing else does, and no wake wrapper exists anywhere in the catalog.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p
   where p.oid = 'clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | v | search_path=clara, pg_temp' then
    raise exception '#939 tail: the stating door''s posture is wrong -- got {%}', v_posture
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)'::regprocedure, 'execute') then
    raise exception '#939 tail: clara_authenticated cannot execute the stating door' using errcode='CLR10';
  end if;
  if has_function_privilege('public',
        'clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)'::regprocedure, 'execute') then
    raise exception '#939 tail: PUBLIC can execute the stating door' using errcode='CLR10';
  end if;
  foreach v_posture in array array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                                   'clara_runtime'] loop
    if has_function_privilege(v_posture,
          'clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)'::regprocedure, 'execute') then
      raise exception '#939 tail: % can execute the stating door -- owner default 6 says the model never supplies dates', v_posture
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname ~ 'prepayment_stated_term';
  if v_n <> 1 then
    raise exception '#939 tail: expected exactly ONE function named for the stated term (the human door), found % -- a wake wrapper or an agent core would be one of them', v_n
      using errcode='CLR10';
  end if;

  -- 4b · THE SECOND EVALUATOR. It resolves at its exact signature, wears v1's posture verbatim,
  --      holds NO grant at all, and — the property its single-member freeze rests on — CALLS NO
  --      OTHER clara FUNCTION. The census matches a CALL SHAPE (`clara.<identifier>(`) rather than
  --      the bare string 'clara.', because a qualified table name would match that and report call
  --      sites that do not exist (0140's own W11 note). It is a SPELLING instrument, not an
  --      identity one; §C.1's single-member registration is the structural half that binds.
  if to_regprocedure('clara.prepayment_schedule_v2(bigint,text,text,date,date)') is null then
    raise exception '#939 tail: clara.prepayment_schedule_v2 does not resolve at its exact signature'
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p
   where p.oid = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | s | search_path=clara, pg_temp' then
    raise exception '#939 tail: prepayment_schedule_v2''s posture is not v1''s -- got {%}', v_posture
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
   where p.oid = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'::regprocedure
     and pg_get_userbyid(a.grantee) <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '#939 tail: clara.prepayment_schedule_v2 holds % application grant(s) -- it is reached only from a definer door and law 31 says do not mint one', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_posture from pg_proc p
   where p.oid = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'::regprocedure;
  if v_posture ~ 'clara\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(' then
    raise exception '#939 tail: clara.prepayment_schedule_v2 calls another clara function -- its closure cannot honestly be registered with one member'
      using errcode='CLR10';
  end if;

  -- 4c · THE FOUR RECUT BODIES. Each keeps its posture and its clara_authenticated-ONLY ACL, and
  --      each actually carries this file's own attribution — never inferred from the diff having
  --      applied. (`list_prepayment_attention` is recut by §G; it is censused here with the rest.)
  foreach v_posture in array array[
      'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
      'clara.get_prepayment_schedule(uuid)',
      'clara.list_prepayment_schedules(uuid)',
      'clara.list_prepayment_attention(uuid)'] loop
    if to_regprocedure(v_posture) is null then
      raise exception '#939 tail: % does not resolve after the recut', v_posture using errcode='CLR10';
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = v_posture::regprocedure
                      and pg_get_userbyid(p.proowner) = 'clara_fn_owner' and p.prosecdef
                      and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=clara, pg_temp') then
      raise exception '#939 tail: %''s owner/definer/search_path posture moved', v_posture
        using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_posture::regprocedure, 'execute') then
      raise exception '#939 tail: clara_authenticated lost EXECUTE on %', v_posture using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_posture::regprocedure, 'execute')
       or has_function_privilege('clara_runtime', v_posture::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', v_posture::regprocedure, 'execute') then
      raise exception '#939 tail: % gained a PUBLIC, runtime or agent grant -- this lane is human-only',
        v_posture using errcode='CLR10';
    end if;
    select p.prosrc into v_sha from pg_proc p where p.oid = v_posture::regprocedure;
    if position('#939' in v_sha) = 0 then
      raise exception '#939 tail: % does not carry this file''s own attribution -- the recut did not land',
        v_posture using errcode='CLR10';
    end if;
  end loop;

  -- 4d · THE TWO READS CARRY ONE SET OF TERM-LIVENESS FIELDS OVER TWO CARRIERS, and the list's
  --      join is LEFT rather than INNER -- the fix without which a memo-only schedule would be
  --      absent from its own firm's list.
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara.list_prepayment_schedules(uuid)'::regprocedure;
  if position('left join clara.document_service_periods' in v_sha) = 0
     or position('left join clara.prepayment_stated_terms' in v_sha) = 0
     or position('term_source' in v_sha) = 0 or position('term_moved' in v_sha) = 0 then
    raise exception '#939 tail: list_prepayment_schedules is missing a LEFT term join or the term_source projection'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara.get_prepayment_schedule(uuid)'::regprocedure;
  if position('clara.prepayment_stated_terms' in v_sha) = 0
     or position('term_stated_by' in v_sha) = 0 or position('term_reason' in v_sha) = 0
     or position('term_moved' in v_sha) = 0 then
    raise exception '#939 tail: get_prepayment_schedule is missing the stated-term branch or its who/when/why projection'
      using errcode='CLR10';
  end if;

  -- 4e · THE SCHEDULE RELATION'S NEW SHAPE, and the constraint that keeps a provenance claim
  --      pointing at something.
  if not exists (select 1 from pg_attribute where attrelid = 'clara.prepayment_schedules'::regclass
                   and attname = 'term_source' and attnotnull and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid = 'clara.prepayment_schedules'::regclass
                      and attname = 'stated_term_id' and not attisdropped) then
    raise exception '#939 tail: clara.prepayment_schedules is missing term_source (NOT NULL) or stated_term_id'
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'clara.prepayment_schedules'::regclass
               and attname in ('service_period_id','document_id') and attnotnull and not attisdropped) then
    raise exception '#939 tail: service_period_id/document_id are still NOT NULL -- a memo-only schedule cannot be stored'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.prepayment_schedules'::regclass
                   and conname = 'ck_ps_term_source_carrier') then
    raise exception '#939 tail: ck_ps_term_source_carrier is absent -- a row could claim a provenance it cannot point at'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.prepayment_schedules where term_source is null;
  if v_n <> 0 then
    raise exception '#939 tail: % existing schedule(s) carry no term_source', v_n using errcode='CLR10';
  end if;

  -- 5 · THE FROZEN EVALUATOR IS STILL EXACTLY WHERE 0140 LEFT IT, re-measured AFTER this file ran.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.prepayment_schedule_v1(uuid,uuid)'::regprocedure;
  if v_sha is distinct from 'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2' then
    raise exception '#939 tail: clara.prepayment_schedule_v1 moved during this file' using errcode='CLR10';
  end if;

  -- 6 · THIS FILE TOUCHED NEITHER SHARED CARRIER. clara.document_service_periods keeps its four
  --     triggers and its RLS-forced posture — measured live, never assumed carried through.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.document_service_periods'::regclass and not tgisinternal;
  if v_n <> 4 then
    raise exception '#939 tail: clara.document_service_periods no longer carries its 4 triggers (found %)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#939 tail: OK -- clara.prepayment_stated_terms exists RLS-FORCED with its owner policy and a SELECT-only, firm-predicated, bookkeeper-floored human policy, its three supersede/append-only triggers and its partial-unique live index; clara.record_prepayment_stated_term is the ONLY function named for it (no wake wrapper, no agent core), is owned by clara_fn_owner as a VOLATILE SECURITY DEFINER with a pinned search_path, and is executable by clara_authenticated and by no agent, wake, runtime or PUBLIC principal; clara.prepayment_schedule_v1 is byte-identical to its pre-image and clara.document_service_periods still carries its four triggers -- this file touched neither.';
end
$t939_tail$;
