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

reset role;

grant execute on function clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)
  to clara_authenticated;

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
