-- 0285_prepayment_term_liveness — #919 (riders wave 3, lane 06): NEITHER PREPAYMENT SCHEDULE READ
-- SAYS WHETHER THE TERM ROW A SCHEDULE RODE IS STILL LIVE.
-- =====================================================================================
-- Spec of record: issue #919's Agent Brief (split from #910, items 2 and 3 stayed with the owner).
--
-- THE GAP THIS CLOSES. `clara.prepayment_schedules.service_period_id` (0223) names the
-- `clara.document_service_periods` row a schedule was DERIVED from, and 0223's own header states
-- the design in full: that table is supersede-never-mutate (0140), a corrected term is a NEW live
-- row, and "the stored allocation does not move with it, by design" — a re-derived schedule is a
-- NEW schedule on a NEW plan, never smuggled in as a revision. What was missing is the READ side of
-- that design: `clara.get_prepayment_schedule` and `clara.list_prepayment_schedules` echo
-- `service_period_id` verbatim but never say whether the row it names is STILL the live one, so "a
-- corrected term needs a new schedule" was tribal knowledge a person had to already hold rather
-- than a fact either read reports.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `term_live` and `term_superseded_by`, joined from
-- `clara.document_service_periods` on `service_period_id`, on BOTH reads — no new argument, no
-- floor change, no new relation, no new grant: the two doors' signatures and ACLs are untouched.
--
-- WHY A JOIN AND NOT A DENORMALISED COLUMN ON `prepayment_schedules`. That relation is
-- APPEND-ONLY IN FULL (0223's own trigger, `_tf_prepayment_schedules_append_only`) precisely
-- because every column on it is a fact DERIVED at the moment the schedule was created. Whether the
-- term row it names is STILL live is not such a fact — it can change at any later moment a
-- bookkeeper corrects the term on the same document — so it belongs on the READ, computed against
-- the CURRENT catalog state, never stored and left to go stale on a row this estate has already
-- promised never to touch again.
--
-- WHY THE JOIN IS SAFE TO ADD INSIDE A DEFINER BODY WITHOUT A NEW GRANT. Both reads already run AS
-- `clara_fn_owner` (SECURITY DEFINER), and `clara.document_service_periods` carries the SAME
-- owner-exempt-nothing RLS posture as `clara.prepayment_schedules` (FORCE ROW LEVEL SECURITY, with
-- `p_dsp_owner ... for all to clara_fn_owner using (true)`, 0140:619-627) — measured live on this
-- rig before this file was written (`select relrowsecurity, relforcerowsecurity from pg_class …`
-- for both relations returns `t | t`, and `clara_fn_owner` holds the unconditional owner policy on
-- each). The join reaches a row this door's own owner role can already see in full; nothing here
-- widens what either function's caller can read.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not re-derive the schedule, does not touch
-- `clara.document_service_periods` or its triggers, does not add a fifth reader or a write door,
-- and does not say what a superseded term does to a RUNNING schedule (the ticket's own "out of
-- scope" line — the flag reports only). #939, #940 and #941 build on this flag; none of the three
-- is this file's concern.
--
-- REDO-SAFE (#957). The only catalog-changing statements are two `create or replace function`; the
-- prestate asserts nothing about this file's own additions being absent, so a `CLARA_MIGRATION_REDO`
-- re-run is safe.
-- =====================================================================================

do $t919_pre$
declare v_sha text;
begin
  if to_regclass('clara.document_service_periods') is null then
    raise exception '#919 prestate: clara.document_service_periods is absent -- 0140 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.prepayment_schedules') is null then
    raise exception '#919 prestate: clara.prepayment_schedules is absent -- 0223 must apply first'
      using errcode='CLR10';
  end if;

  -- THE TWO BODIES THIS FILE RECUTS, PINNED BY PRE-IMAGE sha256(prosrc), MEASURED ON THIS RIG NOW
  -- (rule: pin what is live, never a literal copied from 0223's own text). This is lane 06's second
  -- ticket; #936 (0284) touched neither function, so both are still at their 0223 originals -- but
  -- the pin is measured, not assumed, for exactly the reason this comment states.
  if to_regprocedure('clara.get_prepayment_schedule(uuid)') is null then
    raise exception '#919 prestate: clara.get_prepayment_schedule(uuid) does not resolve -- 0223 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_prepayment_schedule(uuid)'::regprocedure;
  if v_sha is distinct from '40c5913fe3b0e05b489743f4b6e714313708c637609c9aa441b887e0f1932286' then
    raise exception '#919 prestate: clara.get_prepayment_schedule(uuid) has DRIFTED from its measured pre-image -- re-derive the recut against the live text before applying (got %)', v_sha
      using errcode='CLR10';
  end if;

  if to_regprocedure('clara.list_prepayment_schedules(uuid)') is null then
    raise exception '#919 prestate: clara.list_prepayment_schedules(uuid) does not resolve -- 0223 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.list_prepayment_schedules(uuid)'::regprocedure;
  if v_sha is distinct from 'e10eee318bf81bc12e987d30e7a580e5d29aa66245d20fa75ddca3b40171c51c' then
    raise exception '#919 prestate: clara.list_prepayment_schedules(uuid) has DRIFTED from its measured pre-image -- re-derive the recut against the live text before applying (got %)', v_sha
      using errcode='CLR10';
  end if;

  -- THE RLS POSTURE THE HEADER'S SAFETY ARGUMENT RESTS ON, measured rather than assumed.
  if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara' and c.relname = 'document_service_periods'
         and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#919 prestate: clara.document_service_periods is not RLS-forced -- the join''s safety argument does not hold'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_policy pol
                  where pol.polrelid = 'clara.document_service_periods'::regclass
                    and pol.polname = 'p_dsp_owner') then
    raise exception '#919 prestate: p_dsp_owner (0140) is absent -- clara_fn_owner has no unconditional read of the term carrier'
      using errcode='CLR10';
  end if;

  raise notice '#919 prestate: clean -- clara.document_service_periods and clara.prepayment_schedules exist, get_prepayment_schedule/list_prepayment_schedules are byte-identical to their measured 0223 pre-images, and document_service_periods is RLS-forced with clara_fn_owner''s unconditional owner policy live.';
end
$t919_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- clara.get_prepayment_schedule — RECUT. 0223's full body, with ONE addition: `term_live` and
-- `term_superseded_by`, joined from `clara.document_service_periods` on `service_period_id`.
-- Nothing else moves.
-- =====================================================================================
create or replace function clara.get_prepayment_schedule(p_schedule uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_ctx record; s clara.prepayment_schedules; p clara.accounting_plans; r record;
  v_occ jsonb; v_periods jsonb; v_entry record; v_covered date;
  v_term_live boolean; v_term_superseded_by uuid;  -- #919
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

  -- #919 — THE TERM-LIVENESS FLAG. `service_period_id` names the `document_service_periods` row
  -- this schedule was DERIVED from (0223's own append-only design: a corrected term supersedes
  -- that row and NEVER moves the stored allocation). Joined here rather than assumed live, because
  -- a bookkeeper can correct the term on the SAME document at any later point — through
  -- `clara.record_document_service_period`, which supersedes the prior live row — and this read is
  -- the only place that fact becomes visible: the schedule row itself keeps naming the row it
  -- actually rode.
  select (sp.superseded_at is null), sp.superseded_by
    into v_term_live, v_term_superseded_by
    from clara.document_service_periods sp
   where sp.id = s.service_period_id;

  return jsonb_build_object(
    'schedule_id', s.id, 'client_id', s.client_id, 'plan_id', s.plan_id,
    'revision', s.revision, 'kind', p.kind, 'status', p.status, 'purpose', p.purpose,
    'source_entry_id', s.source_entry_id,
    'source_posting_date', case when v_entry.posting_date is null then null
                                else to_char(v_entry.posting_date,'YYYY-MM-DD') end,
    'source_memo', v_entry.memo, 'source_status', v_entry.status,
    'document_id', s.document_id, 'service_period_id', s.service_period_id,
    'term_live', v_term_live, 'term_superseded_by', v_term_superseded_by,  -- #919
    'term_start', to_char(s.term_start,'YYYY-MM-DD'), 'term_end', to_char(s.term_end,'YYYY-MM-DD'),
    'basis_kind', s.basis_kind,
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

-- =====================================================================================
-- clara.list_prepayment_schedules — RECUT. 0223's full body, with the SAME ONE addition, joined
-- the same way. Nothing else moves.
-- =====================================================================================
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
        -- #919 — the SAME term-liveness flag get_prepayment_schedule carries, joined the same way.
        'term_live', (dsp.superseded_at is null), 'term_superseded_by', dsp.superseded_by,
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
        join clara.document_service_periods dsp on dsp.id = s.service_period_id  -- #919
       where s.client_id = p_client and s.firm_id = v_firm
    ) t;
  return jsonb_build_object('client_id', p_client, 'schedules', v_rows);
end $$;

reset role;

-- =====================================================================================
-- TAIL CENSUS. Re-reads the live catalog rather than trusting the block above ran as written.
-- =====================================================================================
do $t919_tail$
declare v_posture text; v_src text; v_n int;
begin
  -- 1 · both doors resolve at exactly the signatures the grant and every caller name.
  if to_regprocedure('clara.get_prepayment_schedule(uuid)') is null then
    raise exception '#919 tail: clara.get_prepayment_schedule(uuid) does not resolve' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_prepayment_schedules(uuid)') is null then
    raise exception '#919 tail: clara.list_prepayment_schedules(uuid) does not resolve' using errcode='CLR10';
  end if;

  -- 2 · neither door's posture moved: still STABLE (never VOLATILE -- these are reads), SECURITY
  --     DEFINER, owned by clara_fn_owner, with the pinned search_path.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p where p.oid = 'clara.get_prepayment_schedule(uuid)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | s | search_path=clara, pg_temp' then
    raise exception '#919 tail: get_prepayment_schedule''s posture moved -- got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
         || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p where p.oid = 'clara.list_prepayment_schedules(uuid)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | s | search_path=clara, pg_temp' then
    raise exception '#919 tail: list_prepayment_schedules''s posture moved -- got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 3 · the ACL is UNCHANGED -- clara_authenticated alone, no PUBLIC, no clara_runtime, no agent
  --     read lane, exactly p653.census.grants's own claim, re-measured after this file's recut.
  if not has_function_privilege('clara_authenticated',
        'clara.get_prepayment_schedule(uuid)'::regprocedure, 'execute')
     or not has_function_privilege('clara_authenticated',
        'clara.list_prepayment_schedules(uuid)'::regprocedure, 'execute') then
    raise exception '#919 tail: clara_authenticated lost EXECUTE on one of the two recut doors'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.get_prepayment_schedule(uuid)'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara.list_prepayment_schedules(uuid)'::regprocedure, 'execute')
  then
    raise exception '#919 tail: PUBLIC can execute a recut prepayment read' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime',
        'clara.get_prepayment_schedule(uuid)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime',
        'clara.list_prepayment_schedules(uuid)'::regprocedure, 'execute') then
    raise exception '#919 tail: clara_runtime can execute a recut prepayment read -- this lane is human-only'
      using errcode='CLR10';
  end if;

  -- 4 · THE FLAG IS ACTUALLY IN EACH BODY, as independent tokens -- never inferred from the diff
  --     having applied.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_prepayment_schedule(uuid)'::regprocedure;
  if position('term_live' in v_src) = 0 or position('term_superseded_by' in v_src) = 0
     or position('document_service_periods' in v_src) = 0 then
    raise exception '#919 tail: get_prepayment_schedule is missing the term-liveness join or flag'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_prepayment_schedules(uuid)'::regprocedure;
  if position('term_live' in v_src) = 0 or position('term_superseded_by' in v_src) = 0
     or position('document_service_periods' in v_src) = 0 then
    raise exception '#919 tail: list_prepayment_schedules is missing the term-liveness join or flag'
      using errcode='CLR10';
  end if;

  -- 5 · THIS FILE TOUCHES NO TABLE. `clara.document_service_periods` keeps its four triggers
  --     (t_dsp_region_congruent, t_dsp_supersede_only, t_dsp_no_delete, t_dsp_no_truncate) and its
  --     RLS-forced owner posture, measured live rather than assumed carried through.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.document_service_periods'::regclass and not tgisinternal;
  if v_n <> 4 then
    raise exception '#919 tail: expected 4 triggers on clara.document_service_periods, found %', v_n
      using errcode='CLR10';
  end if;
  if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara' and c.relname = 'document_service_periods'
         and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#919 tail: clara.document_service_periods is no longer RLS-forced' using errcode='CLR10';
  end if;

  raise notice '#919 tail: OK -- clara.get_prepayment_schedule(uuid) and clara.list_prepayment_schedules(uuid) both resolve, keep their STABLE/SECURITY DEFINER/clara_fn_owner/search_path posture and their clara_authenticated-only ACL (no PUBLIC, no clara_runtime), and both bodies carry the term_live/term_superseded_by join against clara.document_service_periods; that relation''s four triggers and RLS-forced owner posture are unmoved -- this file altered no table.';
end
$t919_tail$;
