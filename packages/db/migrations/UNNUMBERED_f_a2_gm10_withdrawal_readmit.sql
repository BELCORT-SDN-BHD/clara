-- UNNUMBERED_f_a2_gm10_withdrawal_readmit.sql -- F-A2 PR-2, GM-10.
-- Number is claimed at merge; the rig must apply a numbered COPY because migrate.mjs
-- deliberately ignores UNNUMBERED_* files.
--
-- DESIGN CHOICE -- DB-SUPPORTED RUNTIME TRIGGER, NOT A SWEEP-GATE RELAXATION.
-- The runtime sees entry.withdrawn and owns orchestration, but the event alone does not tell it
-- which of a document's possibly-many active filings produced the withdrawn entry. The runtime
-- role also has no direct SELECT on journal_entries/document_filings. Guessing from a document
-- projection could therefore re-admit the wrong filing. This narrow DEFINER read proves the
-- exact event -> entry -> coding_attempt -> autodraft task -> filing identity in the DB, proves
-- drafted < human-revised < withdrawn from the event rows themselves, audits the resulting machine
-- act on behalf of the withdrawing human, and delegates to 0053's existing one_click exception.
-- clara.admit_autodraft_task is NOT replaced: every ordinary sweep continues through its
-- byte-identical already_done branch.
--
-- `entry.revised` is evidence, never the trigger. The only event accepted as p_event is the
-- later `entry.withdrawn`, which is the deliberate human act that opens OQ-4 exit 2 after the
-- double-coding wall no longer has a live human-edited draft to protect.
--
-- D1: NONE. This adds one function and changes no deployed writer body.
-- RLS: no relation is created, so there is no RLS surface to configure.

set local statement_timeout = '60s';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE -- refuse if the exact door we delegate to, its duplicate wall, or the PR-1
-- frontier is not positively present. Capture the three deployed bodies/ACLs we promise not
-- to alter so the tail can prove this file really left them byte-identical.
-- =====================================================================================
create temp table _gm10_pre (
  signature text primary key,
  prosrc text not null,
  proacl text not null,
  prosecdef boolean not null,
  proconfig text not null,
  proowner oid not null
) on commit drop;

do $prestate$
declare
  v_n int;
  v_admit text;
  v_withdraw text;
  v_revise text;
begin
  select count(*) into v_n
    from clara.schema_migrations
   where version ~ 'f_a2_posted_chain$';
  if v_n <> 1 then
    raise exception 'GM-10 prestate: F-A2 PR-1 posted-chain frontier is not applied exactly once (found %)', v_n
      using errcode = 'CLR10';
  end if;

  if to_regprocedure('clara.readmit_autodraft_after_withdrawal(uuid,text,bigint)') is not null then
    raise exception 'GM-10 prestate: readmit_autodraft_after_withdrawal already exists -- refuse an ambiguous replacement'
      using errcode = 'CLR10';
  end if;

  select p.prosrc into v_admit
    from pg_proc p
   where p.oid = 'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure;
  select p.prosrc into v_withdraw
    from pg_proc p
   where p.oid = 'clara.withdraw_draft(uuid,text,uuid,text)'::regprocedure;
  select p.prosrc into v_revise
    from pg_proc p
   where p.oid = 'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure;

  if v_admit is null
     or position('re_admitted_after_withdrawal' in v_admit) = 0
     or position('p_origin=''one_click''' in v_admit) = 0
     or position('''outcome'',''already_done''' in v_admit) = 0 then
    raise exception 'GM-10 prestate: 0053''s one_click withdrawal exception and ordinary already_done wall are not both positively present'
      using errcode = 'CLR10';
  end if;
  if v_withdraw is null or position('''entry.withdrawn''' in v_withdraw) = 0
     or position('withdrawn_by=c.actor' in v_withdraw) = 0 then
    raise exception 'GM-10 prestate: withdraw_draft no longer emits the actor-bound entry.withdrawn event this trigger reads'
      using errcode = 'CLR10';
  end if;
  if v_revise is null or position('''entry.revised''' in v_revise) = 0
     or position('last_human_editor=c.actor' in v_revise) = 0 then
    raise exception 'GM-10 prestate: revise_entry no longer records the human revision evidence this door requires'
      using errcode = 'CLR10';
  end if;

  -- Before this migration the historical 0053 claim is still true: request_autodraft is the
  -- sole SQL producer of one_click. This file deliberately becomes the second producer, but
  -- only behind the positively-proved human withdrawal chain below; the tail enumerates both.
  select count(*) into v_n
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and coalesce(p.prosrc, '') like '%''one_click''%'
     and p.proname <> 'admit_autodraft_task';
  if v_n <> 1 or not exists (
    select 1 from pg_proc p
     where p.pronamespace = 'clara'::regnamespace
       and p.proname = 'request_autodraft'
       and coalesce(p.prosrc, '') like '%''one_click''%'
  ) then
    raise exception 'GM-10 prestate: expected request_autodraft to be the sole one_click SQL producer before this additive door (found % producers)', v_n
      using errcode = 'CLR10';
  end if;

  insert into _gm10_pre(signature, prosrc, proacl, prosecdef, proconfig, proowner)
  select p.oid::regprocedure::text, p.prosrc,
         coalesce(p.proacl::text, '<default>'), p.prosecdef,
         coalesce(array_to_string(p.proconfig, '|'), '<none>'), p.proowner
    from pg_proc p
   where p.oid in (
     'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure,
     'clara.withdraw_draft(uuid,text,uuid,text)'::regprocedure,
     'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure
   );
  if (select count(*) from _gm10_pre) <> 3 then
    raise exception 'GM-10 prestate: deployed-body snapshot is incomplete'
      using errcode = 'CLR10';
  end if;

  raise notice 'GM-10 prestate: 0053 door + already_done wall present; withdrawal/revision event evidence present; deployed bodies captured';
end
$prestate$;

-- =====================================================================================
-- THE DOOR. Only clara_runtime can call it, but authority is not inferred from that role:
-- every admission is bound to a human-authored withdrawal event and recorded as the agent
-- acting on behalf of that human. Near-misses are honest no-ops, not evidence by absence.
-- =====================================================================================
set role clara_fn_owner;

create function clara.readmit_autodraft_after_withdrawal(
  p_event uuid,
  p_model text,
  p_reserve_tokens bigint
) returns jsonb
  language plpgsql
  security definer
  set search_path = clara, pg_temp
as $fn$
declare
  w record;
  v_dedupe jsonb;
  v_admission jsonb;
  v_result jsonb;
  v_op_key text;
begin
  if p_event is null then
    raise exception 'withdrawal event is required' using errcode = 'CLR10';
  end if;
  if p_model is null or btrim(p_model) = '' then
    raise exception 'model is required' using errcode = 'CLR10';
  end if;
  if p_reserve_tokens is null or p_reserve_tokens <= 0 then
    raise exception 'reserve_tokens must be positive' using errcode = 'CLR10';
  end if;

  -- POSITIVE IDENTITY CHAIN. Spelling is not identity and absence is not evidence:
  --   * the supplied row IS an entry.withdrawn event;
  --   * it names the exact immutable withdrawn entry and actor recorded by withdraw_draft;
  --   * that entry IS the coding_attempt result of the registry's autodraft task;
  --   * the agent drafted it through the autodraft wake lane;
  --   * a real prior entry.revised event names its last_human_editor.
  -- Only that complete chain means the human's withdrawal deliberately opens GM-10.
  select de.firm_id, de.client_id, de.actor as withdrawn_by, de.entry_id,
         de.document_id, de.seq, je.filing_id, aa.task_id as prior_task,
         je.last_human_editor, at.status as task_status
    into w
    from clara.domain_events de
    join clara.journal_entries je
      on je.id = de.entry_id
     and je.firm_id = de.firm_id
     and je.client_id = de.client_id
     and je.document_id is not distinct from de.document_id
    join clara.coding_attempts ca
      on ca.entry_id = je.id
     and ca.firm_id = je.firm_id
     and ca.client_id = je.client_id
     and ca.filing_id = je.filing_id
     and ca.document_id = je.document_id
    join clara.autodraft_attempts aa
      on aa.task_id = ca.task_id
     and aa.filing_id = ca.filing_id
     and aa.firm_id = ca.firm_id
     and aa.client_id = ca.client_id
     and aa.document_id = ca.document_id
    join clara.agent_tasks at
      on at.id = aa.task_id
     and at.firm_id = aa.firm_id
     and at.client_id = aa.client_id
   where de.id = p_event
     and de.event_type = 'entry.withdrawn'
     and de.actor is not null
     and je.status = 'withdrawn'
     and je.withdrawn_by = de.actor
     and je.withdrawn_at is not null
     and btrim(coalesce(je.withdrawal_reason, '')) <> ''
     and je.maker_actor = clara.agent_user_id()
     and je.last_human_editor is not null
     and je.last_human_editor <> clara.agent_user_id()
     and at.kind = 'autodraft'
     and exists (
       select 1
         from clara.domain_events revised
        where revised.firm_id = de.firm_id
          and revised.entry_id = de.entry_id
          and revised.event_type = 'entry.revised'
          and revised.actor = je.last_human_editor
          and revised.seq < de.seq
          and exists (
            select 1
              from clara.domain_events drafted
             where drafted.firm_id = revised.firm_id
               and drafted.entry_id = revised.entry_id
               and drafted.event_type = 'entry.drafted'
               and drafted.actor = clara.agent_user_id()
               and drafted.via_wake_kind = 'autodraft'
               and drafted.seq < revised.seq
          )
     );

  if not found then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  -- A human can act in the short interval between wake_draft_entry committing and the WDK
  -- settle step. That is a proved chain whose task state is merely not terminal YET, not a
  -- permanent near-miss. Name it so the consumer retains the event without checkpointing or
  -- poisoning its dead-letter budget. Once the owner task settles, replaying this SAME event
  -- reaches 0053. The DB remains the authority for whether the task is still live.
  if w.task_status in ('queued', 'held', 'running', 'awaiting_input', 'cancel_requested') then
    return jsonb_build_object(
      'outcome', 'retry_pending_settlement',
      'withdrawal_event_id', p_event,
      'source_entry_id', w.entry_id,
      'filing_id', w.filing_id,
      'prior_task_id', w.prior_task
    );
  end if;
  if w.task_status not in ('completed', 'failed', 'cancelled', 'expired') then
    return jsonb_build_object('outcome', 'not_eligible');
  end if;

  v_op_key := 'gm10-withdrawal:' || p_event::text;
  v_dedupe := clara._reserve_op(w.firm_id, 'readmit_autodraft_after_withdrawal',
    v_op_key, clara._hash(jsonb_build_object(
      'event', p_event,
      'model', btrim(p_model),
      'reserve_tokens', p_reserve_tokens
    )));
  if v_dedupe is not null then
    return v_dedupe;
  end if;

  -- 0053 remains the sole owner of duplicate/retry/budget/lane judgement. This explicit
  -- one_click call is NOT a generic unattended sweep: its eligibility was proved above from
  -- the exact human withdrawal event, and no document projection can select a sibling filing.
  select clara.admit_autodraft_task(
    p_filing => w.filing_id,
    p_origin => 'one_click',
    p_run_id => null,
    p_model => btrim(p_model),
    p_reserve_tokens => p_reserve_tokens
  ) into v_admission;

  v_result := coalesce(v_admission, '{}'::jsonb) || jsonb_build_object(
    'withdrawal_event_id', p_event,
    'source_entry_id', w.entry_id,
    'filing_id', w.filing_id,
    'prior_task_id', w.prior_task
  );

  -- Actor = machine; OBO = the human whose deliberate withdrawal opened exit 2. This is the
  -- same two-identity audit shape used by other runtime workers, and it does not misreport a
  -- runtime call as if the human executed this function directly.
  perform clara._audit(
    w.firm_id,
    clara.agent_user_id(),
    w.withdrawn_by,
    null,
    'readmit_autodraft_after_withdrawal',
    w.entry_id,
    jsonb_build_object(
      'op_key', v_op_key,
      'withdrawal_event_id', p_event,
      'filing_id', w.filing_id,
      'prior_task_id', w.prior_task,
      'task_id', v_admission->>'task_id',
      'outcome', v_admission->>'outcome',
      'model', btrim(p_model),
      'reserve_tokens', p_reserve_tokens
    )
  );

  return clara._finish_op(
    w.firm_id,
    'readmit_autodraft_after_withdrawal',
    v_op_key,
    v_result
  );
end
$fn$;

-- FUNCTIONS ONLY. No REVOKE is issued on any relation.
revoke all on function clara.readmit_autodraft_after_withdrawal(uuid, text, bigint) from public;

reset role;

grant execute on function clara.readmit_autodraft_after_withdrawal(uuid, text, bigint)
  to clara_runtime;

-- =====================================================================================
-- TAIL -- exact function/ACL census, two-producer origin proof, trigger markers, and the
-- byte-identity proof that the deployed admission/withdraw/revise bodies were untouched.
-- =====================================================================================
do $tail$
declare
  v_n int;
  v_src text;
  v_names text[];
  r record;
begin
  select count(*), min(p.prosrc) into v_n, v_src
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname = 'readmit_autodraft_after_withdrawal';
  if v_n <> 1 then
    raise exception 'GM-10 tail: expected exactly one readmit_autodraft_after_withdrawal overload, found %', v_n
      using errcode = 'CLR10';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.oid = 'clara.readmit_autodraft_after_withdrawal(uuid,text,bigint)'::regprocedure
       and p.prosecdef
       and p.proowner = 'clara_fn_owner'::regrole
       and 'search_path=clara, pg_temp' = any(p.proconfig)
  ) then
    raise exception 'GM-10 tail: the door lost SECURITY DEFINER, clara_fn_owner ownership, or its pinned search_path'
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(p.proacl) a
     where p.oid = 'clara.readmit_autodraft_after_withdrawal(uuid,text,bigint)'::regprocedure
       and a.privilege_type = 'EXECUTE'
       and (a.grantee = 0 or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))
  ) or not has_function_privilege(
    'clara_runtime',
    'clara.readmit_autodraft_after_withdrawal(uuid,text,bigint)',
    'EXECUTE'
  ) then
    raise exception 'GM-10 tail: execute ACL must be exactly owner + clara_runtime, with PUBLIC absent'
      using errcode = 'CLR10';
  end if;

  for r in select * from (values
      ('de.event_type = ''entry.withdrawn''', 1),
      ('drafted.event_type = ''entry.drafted''', 1),
      ('drafted.via_wake_kind = ''autodraft''', 1),
      ('revised.event_type = ''entry.revised''', 1),
      ('revised.seq < de.seq', 1),
      ('drafted.seq < revised.seq', 1),
      ('''retry_pending_settlement''', 1),
      ('clara.admit_autodraft_task(', 1),
      ('p_origin => ''one_click''', 1),
      ('''readmit_autodraft_after_withdrawal''', 3)
    ) as t(marker, want)
  loop
    if (length(v_src) - length(replace(v_src, r.marker, ''))) / length(r.marker) <> r.want then
      raise exception 'GM-10 tail: function marker "%" does not occur exactly % time(s)', r.marker, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and coalesce(p.prosrc, '') like '%''one_click''%'
     and p.proname <> 'admit_autodraft_task';
  if v_names is distinct from array['readmit_autodraft_after_withdrawal', 'request_autodraft']::text[] then
    raise exception 'GM-10 tail: one_click SQL producers must be exactly the audited withdrawal door + human request door (found %)', v_names
      using errcode = 'CLR10';
  end if;

  for r in
    select pre.signature
      from _gm10_pre pre
      join pg_proc p on p.oid = pre.signature::regprocedure
     where p.prosrc is distinct from pre.prosrc
        or coalesce(p.proacl::text, '<default>') is distinct from pre.proacl
        or p.prosecdef is distinct from pre.prosecdef
        or coalesce(array_to_string(p.proconfig, '|'), '<none>') is distinct from pre.proconfig
        or p.proowner is distinct from pre.proowner
  loop
    raise exception 'GM-10 tail: deployed function % changed even though this migration is additive', r.signature
      using errcode = 'CLR10';
  end loop;

  -- No relations were created. The absence of a table/view REVOKE in this file is deliberate;
  -- PUBLIC lockdown above is function-scoped only, per the migration rule.
  raise notice 'GM-10 tail: clean -- trigger is entry.withdrawn; drafted < revised < withdrawn and exact task/entry/filing are positively proved; a live owner task defers without consuming the event; one_click has exactly two audited human-act producers; ordinary 0053 body/ACL and already_done wall are byte-identical; door ACL is owner + runtime only; no relation created';
end
$tail$;
