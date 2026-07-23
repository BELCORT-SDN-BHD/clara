-- 0017_wave_b.sql — Wave B: knowledge + onboarding.
-- Contract: docs/plan/wave-b-contract.md (ADR-032, WB-R1..WB-R18).
-- Pins: docs/plan/wave-b-migration-0017-design.md + part2 + part3
-- (Blocks W/O/K/S/L/G; all eight adjudicated forks ratified 2026-07-23).
--
-- The migration runner supplies ONE transaction. Existing-table ALTERs run as
-- the migration role; new tables and every function are owned by
-- clara_fn_owner. PUBLIC is swept before the named grants. The tail battery is
-- deliberately fail-closed.
--
-- Errcode allocation was re-verified against 0001..0016. CLR30 is already the
-- 0015/0016 supplier-bill shape family, so the next free values are:
--   CLR31 opening seed · CLR32 wiki · CLR33 lint · CLR34 seeding.
--
-- FORK-6 literals (the design pins the mechanism, but leaves the literal names
-- to build): purpose = 'wiki_coding'; txn-local consumer marker = 'v25'.
-- Both are asserted in the tail.

-- =====================================================================
-- A — BARE DDL. Existing tables are owned by the migration role.
-- =====================================================================

-- O1: clients.status is an inline/system-named CHECK in 0003.
do $$
declare v_con text;
begin
  select con.conname into v_con
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='clients' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
    and pg_get_constraintdef(con.oid) ilike '%archived%';
  if v_con is null then
    raise exception '0017: clients status check not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.clients drop constraint %I',v_con);
end $$;

-- =====================================================================
-- F — SAME-ARITY COMPATIBILITY REPLACEMENTS.
--
-- These fail-closed source transforms preserve every byte of the ratified
-- 0016 behavior outside the numbered 0017 deltas. pg_get_functiondef is used
-- only against the migration's required 16-migration prestate; every expected
-- fragment is asserted before CREATE OR REPLACE executes.
-- =====================================================================

set role clara_fn_owner;

do $cor$
declare v_def text; v_next text;
begin
  -- O8.1: generic draft/wake drafting becomes active-only.
  select pg_get_functiondef(
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$  if v_client_status='archived' then
    raise exception 'client is archived -- no new postings' using errcode='CLR10';
  end if;$old$,
$new$  perform clara._assert_client_operational(p_client,p_firm);$new$);
  if v_next=v_def then
    raise exception '0017: _draft_entry_core prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  -- O8.11: resolutions are intake-capable for active/onboarding, never archived.
  select pg_get_functiondef(
    'clara._record_client_resolution_core(uuid,uuid,uuid,text,text,uuid,text,uuid,numeric,jsonb,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
    'declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;',
    'declare v_dedupe jsonb; v_client_firm uuid; v_client_status text; v_id uuid;');
  v_next:=replace(v_next,
    'select firm_id into v_client_firm from clara.clients where id = p_client;',
    'select firm_id,status into v_client_firm,v_client_status from clara.clients where id = p_client;');
  v_next:=replace(v_next,
$old$  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;$old$,
$new$  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  if v_client_status not in ('active','onboarding') then
    raise exception 'client is not available for intake' using errcode='CLR10';
  end if;$new$);
  if v_next=v_def then
    raise exception '0017: resolution core prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  -- O8.10: filing and filing-move preview admit takeover/onboarding.
  select pg_get_functiondef(
    'clara.file_document(uuid,uuid,text,text)'::regprocedure) into v_def;
  v_next:=replace(v_def,
    'and status=''active'') then',
    'and status in (''active'',''onboarding'')) then');
  if v_next=v_def then
    raise exception '0017: file_document prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.preview_wrong_client_correction(uuid,uuid,uuid)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
    'and status=''active'') then',
    'and status in (''active'',''onboarding'')) then');
  if v_next=v_def then
    raise exception '0017: correction preview prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  -- O8.2: both DB coding enumerators are active-only.
  select pg_get_functiondef('clara.coding_lane(uuid,uuid)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
    'where c.id=p_client and c.firm_id=v_firm)',
    'where c.id=p_client and c.firm_id=v_firm and c.status=''active'')');
  if v_next=v_def then
    raise exception '0017: coding_lane prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef('clara.list_coding_lanes(uuid)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
    'where c.id=p_client and c.firm_id=v_firm)',
    'where c.id=p_client and c.firm_id=v_firm and c.status=''active'')');
  if v_next=v_def then
    raise exception '0017: list_coding_lanes prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  -- O8.2: these are the actual autodraft sweep discovery surfaces. A coding
  -- lane is operational only when the filing's client is active.
  select pg_get_functiondef(
    'clara.list_autodraft_candidates()'::regprocedure) into v_def;
  v_next:=replace(v_def,
    'select f.firm_id,f.id from clara.document_filings f' || chr(10) ||
    '  where f.retired_at is null',
    'select f.firm_id,f.id from clara.document_filings f' || chr(10) ||
    '  join clara.clients oc on oc.id=f.client_id and oc.status=''active''' ||
      chr(10) || '  where f.retired_at is null');
  if v_next=v_def then
    raise exception '0017: list_autodraft_candidates prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.list_document_autodraft_candidates(uuid)'::regprocedure) into v_def;
  v_next:=replace(v_def,
    'select f.firm_id,f.id from clara.document_filings f' || chr(10) ||
    '  where f.document_id=p_document',
    'select f.firm_id,f.id from clara.document_filings f' || chr(10) ||
    '  join clara.clients oc on oc.id=f.client_id and oc.status=''active''' ||
      chr(10) || '  where f.document_id=p_document');
  if v_next=v_def then
    raise exception '0017: list_document_autodraft_candidates prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  -- S2: the exact prior-GL vocabulary is duplicated in both kind writers.
  select pg_get_functiondef(
    'clara.classify_document(uuid,text,numeric,text,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
    '''knowledge_artifact'',''handwritten_note'',''consent_evidence'',''other'')',
    '''knowledge_artifact'',''handwritten_note'',''consent_evidence'',''prior_gl'',''other'')');
  -- O8.6: low-confidence questions are an operational queue and therefore
  -- only materialize for active-client filings.
  v_next:=replace(v_next,
$old$from clara.document_filings df
        where df.document_id=p_document and df.retired_at is null loop$old$,
$new$from clara.document_filings df
        join clara.clients oc on oc.id=df.client_id and oc.status='active'
        where df.document_id=p_document and df.retired_at is null loop$new$);
  if v_next=v_def or position('prior_gl' in v_next)=0
     or position('oc.status=''active''' in v_next)=0 then
    raise exception '0017: classify_document prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.set_document_kind(uuid,text,text,text)'::regprocedure) into v_def;
  v_next:=replace(v_def,
    '''knowledge_artifact'',''handwritten_note'',''consent_evidence'',''other'')',
    '''knowledge_artifact'',''handwritten_note'',''consent_evidence'',''prior_gl'',''other'')');
  if v_next=v_def or position('prior_gl' in v_next)=0 then
    raise exception '0017: set_document_kind prestate drift' using errcode='CLR10';
  end if;
  execute v_next;

  -- O8.6: no classifier/facts work is enqueued for a document filed only to
  -- inactive clients. The terminal receipt is stable and task-free.
  select pg_get_functiondef(
    'clara._enqueue_invoice_facts_core(uuid)'::regprocedure) into v_def;
  v_next:=replace(v_def,
$old$  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;$old$,
$new$  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  if exists(select 1 from clara.document_filings df
      where df.document_id=p_document and df.retired_at is null)
     and not exists(select 1 from clara.document_filings df
       join clara.clients oc on oc.id=df.client_id and oc.status='active'
       where df.document_id=p_document and df.retired_at is null) then
    return jsonb_build_object('document_id',p_document,
      'status','skipped_client_onboarding');
  end if;$new$);
  if v_next=v_def or position('skipped_client_onboarding' in v_next)=0 then
    raise exception '0017: invoice-facts core prestate drift' using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

-- [R1-F1] Opening entries are exclusively mutable through the K-family. Every
-- generic lifecycle/mutation surface rejects the immutable OB marker before
-- taking an entry/advisory lock (and before reserving an operation receipt).
-- All replacements are same-arity CoRs, preserving their pre-0017 ACLs.
do $cor$
declare v_def text; v_next text;
begin
  select pg_get_functiondef(
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_entry'$old$,
$new$  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- [R1-F1] K-family-only lifecycle boundary; preflight precedes every lock.
  if exists(select 1 from clara.journal_entries
      where id=p_entry and firm_id=c.firm and is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_entry'$new$);
  if v_next=v_def or position('opening_entry_k_family_only' in v_next)=0 then
    raise exception '0017: _approve_entry_core R1-F1 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.reverse_entry(uuid,text,text)'::regprocedure) into v_def;
  v_next:=replace(v_def,
$old$  v_dedupe:=clara._reserve_op(c.firm,'reverse_entry',p_op_key,$old$,
$new$  -- [R1-F1] K-family-only lifecycle boundary; preflight precedes every lock.
  if exists(select 1 from clara.journal_entries
      where id=p_entry and firm_id=c.firm and is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'reverse_entry',p_op_key,$new$);
  if v_next=v_def or position('opening_entry_k_family_only' in v_next)=0 then
    raise exception '0017: reverse_entry R1-F1 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.withdraw_draft(uuid,text,uuid,text)'::regprocedure) into v_def;
  v_next:=replace(v_def,
$old$  v_dedupe:=clara._reserve_op(c.firm,'withdraw_draft',p_op_key,$old$,
$new$  -- [R1-F1] K-family-only lifecycle boundary; preflight precedes every lock.
  if exists(select 1 from clara.journal_entries
      where id=p_entry and firm_id=c.firm and is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'withdraw_draft',p_op_key,$new$);
  if v_next=v_def or position('opening_entry_k_family_only' in v_next)=0 then
    raise exception '0017: withdraw_draft R1-F1 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$  v_dedupe:=clara._reserve_op(c.firm,'revise_entry',p_op_key,$old$,
$new$  -- [R1-F1] K-family-only lifecycle boundary; preflight precedes every lock.
  if exists(select 1 from clara.journal_entries
      where id=p_entry and firm_id=c.firm and is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revise_entry',p_op_key,$new$);
  if v_next=v_def or position('opening_entry_k_family_only' in v_next)=0 then
    raise exception '0017: revise_entry R1-F1 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,$old$,
$new$  -- [R1-F1] A filing correction may not capture any K-family entry.
  if exists(select 1 from clara.filing_correction_items i
      join clara.journal_entries je on je.id=i.entry_id
      where i.correction_id=p_correction and je.is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,$new$);
  if v_next=v_def or position('opening_entry_k_family_only' in v_next)=0 then
    raise exception '0017: approve_wrong_client_correction R1-F1 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null$old$,
$new$  -- [R1-F1] Facts persistence revises document-bound drafts; K entries are
  -- outside this generic mutation class.
  if exists(select 1 from clara.journal_entries je
      join clara.document_filings jf on jf.id=je.filing_id
      where jf.document_id=t.document_id and jf.retired_at is null
        and je.status='draft' and je.is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null$new$);
  if v_next=v_def or position('opening_entry_k_family_only' in v_next)=0 then
    raise exception '0017: persist_invoice_facts R1-F1 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

-- [R1-F5] Complete the WB-R1 operational exclusion on the four missed
-- enumerator/reconciler surfaces. These are same-arity CoRs; every replacement
-- has its own drift check so one successful surgery cannot mask another miss.
do $cor$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef(
    'clara.list_uncoded_filings(uuid)'::regprocedure) into v_def;
  v_next:=replace(v_def,
    'from clara.document_filings f join clara.documents d on d.id=f.document_id',
    'from clara.document_filings f join clara.documents d on d.id=f.document_id ' ||
      'join clara.clients active_uncoded_client on active_uncoded_client.id=f.client_id ' ||
      'and active_uncoded_client.status=''active''');
  if v_next=v_def or position('active_uncoded_client.status=''active''' in v_next)=0 then
    raise exception '0017: list_uncoded_filings R1-F5 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.list_autopost_rules(jsonb)'::regprocedure) into v_def;
  v_next:=replace(v_def,
    'from clara.coding_rules r' || chr(10) ||
      '    join clara.counterparties cp',
    'from clara.coding_rules r' || chr(10) ||
      '    join clara.clients active_autopost_client on ' ||
        'active_autopost_client.id=r.client_id ' ||
        'and active_autopost_client.status=''active''' || chr(10) ||
      '    join clara.counterparties cp');
  if v_next=v_def or position('active_autopost_client.status=''active''' in v_next)=0 then
    raise exception '0017: list_autopost_rules R1-F5 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.list_notifications(jsonb,text[])'::regprocedure) into v_def;
  v_next:=replace(v_def,
    'from clara.notifications n' || chr(10) ||
      '    where n.firm_id=c.firm',
    'from clara.notifications n' || chr(10) ||
      '    left join clara.clients active_notification_client' ||
        ' on active_notification_client.id=n.client_id' || chr(10) ||
      '    where n.firm_id=c.firm' || chr(10) ||
      '      and (n.client_id is null or ' ||
        'active_notification_client.status=''active'')');
  if v_next=v_def
     or position('active_notification_client.status=''active''' in v_next)=0 then
    raise exception '0017: list_notifications R1-F5 prestate drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.reconcile_autopost_rules()'::regprocedure) into v_def;
  v_next:=replace(v_def,
$old$for rr in select * from clara.coding_rules where rule_type='autopost' and status='live'
      and expires_at<=now() order by id for update skip locked loop$old$,
$new$for rr in select r.* from clara.coding_rules r
      join clara.clients active_expiry_client on active_expiry_client.id=r.client_id
        and active_expiry_client.status='active'
      where r.rule_type='autopost' and r.status='live'
        and r.expires_at<=now() order by r.id for update of r skip locked loop$new$);
  if v_next=v_def or position('active_expiry_client.status=''active''' in v_next)=0 then
    raise exception '0017: reconcile_autopost_rules expiry R1-F5 drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$for rr in select * from clara.coding_rules where rule_type='autopost' and status='live'
      and expires_at>now() and expires_at<=now()+interval '3 months' order by id loop$old$,
$new$for rr in select r.* from clara.coding_rules r
      join clara.clients active_nudge_client on active_nudge_client.id=r.client_id
        and active_nudge_client.status='active'
      where r.rule_type='autopost' and r.status='live'
        and r.expires_at>now() and r.expires_at<=now()+interval '3 months'
      order by r.id loop$new$);
  if v_next=v_prior or position('active_nudge_client.status=''active''' in v_next)=0 then
    raise exception '0017: reconcile_autopost_rules nudge R1-F5 drift'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

-- [R2-F6] O8 operational exclusion also binds the catalog-equivalent sweep
-- reconciler. Recovery, task completion, and attempt release each join the
-- client ACTIVE allowlist; each same-arity source surgery has its own drift
-- assertion so one branch cannot mask another.
do $cor$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef(
    'clara.reconcile_sweep_runs()'::regprocedure) into v_def;
  v_next:=replace(v_def,
$old$      select a.*,ca.entry_id from clara.autodraft_attempts a
      join clara.coding_attempts ca on ca.task_id=a.task_id
      join clara.journal_entries e on e.id=ca.entry_id and e.status='draft'
      where a.run_id=sr.id$old$,
$new$      select a.*,ca.entry_id from clara.autodraft_attempts a
      join clara.clients active_recovery_client
        on active_recovery_client.id=a.client_id
        and active_recovery_client.firm_id=a.firm_id
        and active_recovery_client.status='active'
      join clara.coding_attempts ca on ca.task_id=a.task_id
      join clara.journal_entries e on e.id=ca.entry_id and e.status='draft'
      where a.run_id=sr.id$new$);
  if v_next=v_def
     or position('active_recovery_client.status=''active''' in v_next)=0 then
    raise exception '0017: reconcile_sweep_runs recovery R2-F6 drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$      update clara.agent_tasks t set status='completed'
        from clara.autodraft_attempts a where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested');$old$,
$new$      update clara.agent_tasks t set status='completed'
        from clara.autodraft_attempts a
        join clara.clients active_completion_client
          on active_completion_client.id=a.client_id
          and active_completion_client.firm_id=a.firm_id
          and active_completion_client.status='active'
        where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested');$new$);
  if v_next=v_prior
     or position('active_completion_client.status=''active''' in v_next)=0 then
    raise exception '0017: reconcile_sweep_runs completion R2-F6 drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$      update clara.autodraft_attempts aa set state='idle',attempt_count=0,
        reserved_tokens=0 where aa.run_id=sr.id and aa.state='active'
        and exists(select 1 from clara.coding_attempts ca where ca.task_id=aa.task_id);$old$,
$new$      update clara.autodraft_attempts aa set state='idle',attempt_count=0,
        reserved_tokens=0 where aa.run_id=sr.id and aa.state='active'
        and exists(select 1 from clara.clients active_release_client
          where active_release_client.id=aa.client_id
            and active_release_client.firm_id=aa.firm_id
            and active_release_client.status='active')
        and exists(select 1 from clara.coding_attempts ca where ca.task_id=aa.task_id);$new$);
  if v_next=v_prior
     or position('active_release_client.status=''active''' in v_next)=0 then
    raise exception '0017: reconcile_sweep_runs release R2-F6 drift'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

-- L5/O8.4: additive lint queue rows plus an active-client guard in every row
-- CTE. Cursor grammar and all pre-0017 keys remain unchanged. ADR-031 (WA21-R14)
-- rank alignment folded per the design's ruled-before-build conditional: draft
-- rows now rank by lane (needs_you lane = rank 1), matching filing_rows, so the
-- envelope's total order agrees with the rendered section order across pages.
do $cor$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef(
    'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure) into v_def;
  v_next:=replace(v_def,'null::text tier','null::text tier,null::uuid finding_id');
  v_next:=replace(v_next,'cw.state tier','cw.state tier,null::uuid finding_id');
  v_next:=replace(v_next,
    '    from clara.journal_entries e' || chr(10) ||
    '    left join lateral',
    '    from clara.journal_entries e' || chr(10) ||
    '    join clara.clients active_entry_client on active_entry_client.id=e.client_id' ||
      ' and active_entry_client.status=''active''' || chr(10) ||
    '    left join lateral');
  if position('active_entry_client.status=''active''' in v_next)=0 then
    raise exception '0017: queue draft_rows R1-F5 replacement drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
    '    from clara.document_filings f' || chr(10) ||
    '    cross join lateral',
    '    from clara.document_filings f' || chr(10) ||
    '    join clara.clients active_filing_client on active_filing_client.id=f.client_id' ||
      ' and active_filing_client.status=''active''' || chr(10) ||
    '    cross join lateral');
  if v_next=v_prior
     or position('active_filing_client.status=''active''' in v_next)=0 then
    raise exception '0017: queue filing_rows R1-F5 replacement drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
    '    from clara.open_questions q where q.firm_id=c.firm',
    '    from clara.open_questions q join clara.clients active_question_client' ||
      ' on active_question_client.id=q.client_id' ||
      ' and active_question_client.status=''active''' ||
      ' where q.firm_id=c.firm');
  if v_next=v_prior
     or position('active_question_client.status=''active''' in v_next)=0 then
    raise exception '0017: queue question_rows R1-F5 replacement drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
    '    from clara.coding_tasks t where t.firm_id=c.firm',
    '    from clara.coding_tasks t join clara.clients active_task_client' ||
      ' on active_task_client.id=t.client_id' ||
      ' and active_task_client.status=''active''' ||
      ' where t.firm_id=c.firm');
  if v_next=v_prior
     or position('active_task_client.status=''active''' in v_next)=0 then
    raise exception '0017: queue task_rows R1-F5 replacement drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
    '    from clara.compliance_watches cw' || chr(10) ||
    '    where cw.firm_id=c.firm',
    '    from clara.compliance_watches cw' || chr(10) ||
    '    join clara.clients active_watch_client on active_watch_client.id=cw.client_id' ||
      ' and active_watch_client.status=''active''' || chr(10) ||
    '    where cw.firm_id=c.firm');
  if v_next=v_prior
     or position('active_watch_client.status=''active''' in v_next)=0 then
    raise exception '0017: queue compliance_rows R1-F5 replacement drift'
      using errcode='CLR10';
  end if;
  -- [R1-F5] The compliance envelope is a separate enumerator from its row CTE.
  v_prior:=v_next;
  v_next:=replace(v_next,
    '        from clara.compliance_watches cw' || chr(10) ||
      '        where cw.firm_id=c.firm and cw.state<>''resolved''',
    '        from clara.compliance_watches cw' || chr(10) ||
      '        join clara.clients active_envelope_client' ||
        ' on active_envelope_client.id=cw.client_id' ||
        ' and active_envelope_client.status=''active''' || chr(10) ||
      '        where cw.firm_id=c.firm and cw.state<>''resolved''');
  if v_next=v_prior
     or position('active_envelope_client.status=''active''' in v_next)=0 then
    raise exception '0017: queue compliance.clients R1-F5 replacement drift'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_next,
    '  ), all_rows as (',
$lint$  ), lint_rows as (
    select case when lf.severity='critical' then 1 else 2 end section_rank,
      'lint_finding'::text row_kind,
      case when lf.severity='critical' then 'needs_you' else 'needs_review' end section,
      lf.client_id,null::uuid counterparty_id,null::uuid filing_id,
      null::uuid entry_id,null::uuid question_id,null::uuid task_id,
      null::uuid document_id,null::text lane,false auto,false rule_backed,
      false high_stakes,lf.opened_at aged_since,null::bigint amount_cents,
      null::text period,('Lint: '||lf.finding_kind)::text question_text,
      lf.created_at,lf.id,''::text vendor_group,null::text coding_kind,
      null::uuid watch_id,lf.severity tier,lf.id finding_id
    from clara.lint_findings lf
    join clara.clients active_lint_client on active_lint_client.id=lf.client_id
      and active_lint_client.status='active'
    where lf.firm_id=c.firm and lf.state='open'
      and (v_client is null or lf.client_id=v_client)
  ), all_rows as ($lint$);
  v_next:=replace(v_next,
    '    union all select * from compliance_rows',
    '    union all select * from compliance_rows union all select * from lint_rows');
  v_next:=replace(v_next,
    'count(*) filter(where row_kind=''compliance_watch'')::int compliance_watches from all_rows',
    'count(*) filter(where row_kind=''compliance_watch'')::int compliance_watches,' ||
    ' count(*) filter(where row_kind=''lint_finding'')::int lint_findings from all_rows');
  v_next:=replace(v_next,
    '''compliance_watches'',counts.compliance_watches)',
    '''compliance_watches'',counts.compliance_watches,' ||
      '''lint_findings'',counts.lint_findings)');
  v_next:=replace(v_next,
    '    ''rows'',coalesce',
$lint$    'lint',jsonb_build_object(
      'stale_evaluator',coalesce(
        (select max(coalesce(lr.completed_at,lr.started_at))
          from clara.lint_runs lr)<now()-interval '48 hours',true)),
    'rows',coalesce$lint$);
  v_next:=replace(v_next,
    '''coding_kind'',p.coding_kind,''watch_id'',p.watch_id,''tier'',p.tier)',
    '''coding_kind'',p.coding_kind,''watch_id'',p.watch_id,''tier'',p.tier,' ||
      '''finding_id'',p.finding_id)');
  v_next:=replace(v_next,
    'select 2 section_rank,''draft''::text row_kind',
    'select case when ln.lane=''needs_you'' then 1 else 2 end section_rank,' ||
      '''draft''::text row_kind');
  if v_next=v_def or position('lint_finding' in v_next)=0
     or position('finding_id' in v_next)=0
     or position('active_entry_client.status=''active''' in v_next)=0
     or position('active_filing_client.status=''active''' in v_next)=0
     or position('active_question_client.status=''active''' in v_next)=0
     or position('active_task_client.status=''active''' in v_next)=0
     or position('active_watch_client.status=''active''' in v_next)=0
     or position('active_envelope_client.status=''active''' in v_next)=0
     or position('active_lint_client.status=''active''' in v_next)=0
     or position('case when ln.lane=''needs_you'' then 1 else 2 end section_rank'
       in v_next)=0 then
    raise exception '0017: list_review_queue prestate drift' using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

reset role;
alter table clara.clients add constraint clients_status_check_0017
  check (status in ('active','archived','onboarding'));

-- O6: onboarding is reserved in the origin vocabulary. No 0017 writer emits
-- it. It is intentionally NOT excluded by _open_question_blocks.
alter table clara.open_questions
  drop constraint open_questions_origin_check_0016;
alter table clara.open_questions
  add constraint open_questions_origin_check_0017 check (
    origin in ('clarify_promotion','rule_proposal','rule_conflict',
      'sweep_refusal','manual','classification','onboarding'));

-- K7: OBE and retained-earnings markers are equity-only. uq_coa_special
-- already supplies one-per-client-per-marker.
alter table clara.coa_accounts
  drop constraint coa_accounts_special_acc_type_check;
alter table clara.coa_accounts
  add constraint coa_accounts_special_acc_type_check check (
    special_acc_type is null or special_acc_type in
      ('rounding','sst_output','sst_purchase_cost',
       'opening_balance_equity','retained_earnings'));
alter table clara.coa_accounts
  add constraint ck_coa_obe_equity check (
    special_acc_type is distinct from 'opening_balance_equity'
    or account_type='equity');
alter table clara.coa_accounts
  add constraint ck_coa_retained_earnings_equity check (
    special_acc_type is distinct from 'retained_earnings'
    or account_type='equity');

-- S2 / FORK-4: the prior-GL kind is explicit.
alter table clara.documents
  drop constraint documents_document_kind_check;
alter table clara.documents
  add constraint documents_document_kind_check check (
    document_kind is null or document_kind in (
      'invoice','receipt','credit_note','debit_note','bank_statement',
      'payment_voucher','claim_form','payroll_summary','tax_correspondence',
      'ssm_company_doc','agreement_contract','e_invoice_xml',
      'management_account','opening_balance_doc','knowledge_artifact',
      'handwritten_note','consent_evidence','prior_gl','other'));

-- O7: create_firm's replay receipt lives on the single-use token because a
-- firm-scoped op_receipt cannot exist before the firm does.
alter table clara.firm_admissions
  add column consumed_op_key text,
  add column consumed_result jsonb,
  add constraint ck_firm_admissions_consumed_receipt_0017 check (
    (consumed_at is null and consumed_op_key is null and consumed_result is null)
    or (consumed_at is not null and consumed_op_key is null
        and consumed_result is null) -- legacy pre-0017 consumptions
    or (consumed_at is not null
        and nullif(btrim(consumed_op_key),'') is not null
        and consumed_result is not null
        and jsonb_typeof(consumed_result)='object'));

-- [R3-F1] One cross-engine authoritative-current extraction pointer lives on
-- the document. The pointer target is constrained back to that exact
-- (firm,document), and every pre-0017 document is deterministically collapsed
-- to its chronologically latest unsuperseded accepted extraction. Future
-- accepted runs hand this pointer over under a document-row lock (trigger
-- below), regardless of either engine's version_n sequence.
alter table clara.document_extractions
  add constraint uq_document_extractions_authority_target_0017
  unique(id,firm_id,document_id);
alter table clara.documents
  add column authoritative_extraction_id uuid;
with ranked as (
  select de.id,de.firm_id,de.document_id,
    row_number() over(
      partition by de.firm_id,de.document_id
      order by de.extracted_at desc,de.id desc) as rn
  from clara.document_extractions de
  where de.status='done' and de.superseded_by is null
), heads as (
  select id,firm_id,document_id from ranked where rn=1
)
update clara.document_extractions de
set superseded_by=h.id
from heads h
where de.firm_id=h.firm_id and de.document_id=h.document_id
  and de.id<>h.id and de.status='done' and de.superseded_by is null;
update clara.documents d
set authoritative_extraction_id=de.id
from clara.document_extractions de
where de.firm_id=d.firm_id and de.document_id=d.id
  and de.status='done' and de.superseded_by is null;
alter table clara.documents
  add constraint fk_documents_authoritative_extraction_0017
  foreign key(authoritative_extraction_id,firm_id,id)
  references clara.document_extractions(id,firm_id,document_id)
  deferrable initially deferred;

-- [R3-F1] Canonical extracted trial-balance facts are stored on the exact
-- evidence region they were independently derived from. Generic regions keep
-- all three columns NULL; opening facts carry an indivisible
-- account/amount/side triple and a matching monetary value.
alter table clara.document_regions
  add column opening_account_code text,
  add column opening_amount_cents bigint,
  add column opening_side text,
  add constraint ck_document_regions_opening_fact_0017 check (
    (opening_account_code is null and opening_amount_cents is null
      and opening_side is null)
    or (nullif(btrim(opening_account_code),'') is not null
      and opening_amount_cents>0
      and opening_side in ('debit','credit')
      and field_path='opening_tb.line'
      and monetary_cents=opening_amount_cents));

-- [R3-F4] Every draft-linked register row, initial or replacement, is pending.
-- K5 activates initials and K6 performs the replacement hand-off. A pending
-- row's required lineage is its acquisition entry; replacement lineage remains
-- additionally pinned by supersedes_asset_id in the K6 writer.
alter table clara.fixed_assets
  drop constraint fixed_assets_status_check;
alter table clara.fixed_assets
  add column updated_at timestamptz not null default now(),
  add column superseded_by_asset_id uuid,
  add column supersedes_asset_id uuid,
  add constraint fixed_assets_status_check_0017
    check (status in ('pending','active','disposed','superseded')),
  add constraint fk_fixed_assets_superseded_by_0017
    foreign key(superseded_by_asset_id) references clara.fixed_assets(id)
    deferrable initially deferred,
  add constraint fk_fixed_assets_supersedes_0017
    foreign key(supersedes_asset_id) references clara.fixed_assets(id)
    deferrable initially deferred,
  add constraint ck_fixed_assets_superseded_state_0017 check (
    (status='superseded' and superseded_by_asset_id is not null)
    or (status<>'superseded' and superseded_by_asset_id is null)),
  add constraint ck_fixed_assets_pending_lineage_0017 check (
    status<>'pending' or acquisition_entry_id is not null),
  add constraint ck_fixed_assets_no_self_lineage_0017 check (
    superseded_by_asset_id is distinct from id
    and supersedes_asset_id is distinct from id);

-- K2/K3: one opening item is one journal entry, while a carry-down document
-- lawfully backs many items. Preserve the generic one-draft-per-filing floor
-- and exempt only the OB flag that no generic writer can set.
drop index clara.uq_journal_entries_one_open_draft_filing;
create unique index uq_journal_entries_one_open_draft_filing
  on clara.journal_entries(filing_id)
  where status='draft' and filing_id is not null and not is_opening_balance;

set role clara_fn_owner;

-- =====================================================================
-- B1 — TABLE PLANE (W/O/K/S/L), all under clara_fn_owner.
-- =====================================================================

-- W7 / FORK-5: system-maintained named budgets.
create table clara.wiki_budgets (
  budget_key text primary key,
  value_int bigint not null check (value_int>0),
  note text not null check (btrim(note)<>'')
);
insert into clara.wiki_budgets(budget_key,value_int,note) values
  ('max_pages_per_client',40,'WB-R8: hard per-client page cap'),
  ('max_page_bytes',8192,'WB-R8: hard UTF-8 bytes per page'),
  ('pack_max_pages',6,'WB-R8: pack relevance window'),
  ('pack_max_bytes',12288,'WB-R8: pack UTF-8 byte budget');

-- W1: page index.
create table clara.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9/_-]{0,199}$'),
  page_kind text not null check (page_kind in
    ('profile','counterparty','treatment','recurring_pattern',
     'open_question','period_context')),
  title text not null check (btrim(title)<>''),
  counterparty_id uuid,
  current_version_id uuid,
  state text not null default 'active' check (state in ('active','retired')),
  retired_at timestamptz,
  retired_by uuid references clara.users(id),
  retire_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_wiki_pages_client_slug unique(client_id,slug),
  constraint uq_wiki_pages_id_firm_client unique(id,firm_id,client_id),
  constraint fk_wiki_pages_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_wiki_pages_counterparty
    foreign key(counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint ck_wiki_pages_counterparty check (
    (page_kind='counterparty')=(counterparty_id is not null)),
  constraint ck_wiki_pages_retired check (
    (state='active' and retired_at is null and retired_by is null
      and retire_reason is null)
    or
    (state='retired' and retired_at is not null and retired_by is not null
      and nullif(btrim(retire_reason),'') is not null))
);

-- W2/P17: immutable page versions.
create table clara.wiki_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  firm_id uuid not null,
  client_id uuid not null,
  version_n int not null check (version_n>=1),
  content text not null check (octet_length(content) between 1 and 65536),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null,
  size_bytes bigint not null check (size_bytes>0),
  state text not null check (state in
    ('uploaded','verified','published','superseded')),
  synthesis text not null check (synthesis in ('deterministic','model')),
  engine_id text,
  projected_from_seq bigint check (projected_from_seq is null or projected_from_seq>=0),
  created_at timestamptz not null default now(),
  constraint uq_wiki_page_versions_page_n unique(page_id,version_n),
  constraint uq_wiki_page_versions_id_firm_client unique(id,firm_id,client_id),
  constraint fk_wiki_page_versions_page foreign key(page_id,firm_id,client_id)
    references clara.wiki_pages(id,firm_id,client_id),
  constraint fk_wiki_page_versions_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint ck_wiki_page_versions_storage_key check (
    storage_key ~ ('^firms/'||firm_id::text||'/wiki/'||client_id::text||
      '/'||content_sha256||'[.]md$')),
  constraint ck_wiki_page_versions_engine check (
    (synthesis='model')=(engine_id is not null))
);
alter table clara.wiki_pages
  add constraint fk_wiki_pages_current_version
  foreign key(current_version_id,firm_id,client_id)
  references clara.wiki_page_versions(id,firm_id,client_id)
  deferrable initially deferred;

create table clara.wiki_page_citations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  firm_id uuid not null,
  client_id uuid not null,
  source_kind text not null check (source_kind in
    ('document','entry','counterparty','human_note','prior_gl_line')),
  document_id uuid,
  entry_id uuid,
  counterparty_id uuid,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
  created_at timestamptz not null default now(),
  constraint fk_wiki_citations_version
    foreign key(version_id,firm_id,client_id)
    references clara.wiki_page_versions(id,firm_id,client_id),
  constraint fk_wiki_citations_document
    foreign key(document_id,firm_id) references clara.documents(id,firm_id),
  constraint fk_wiki_citations_entry
    foreign key(entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint fk_wiki_citations_counterparty
    foreign key(counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint ck_wiki_citations_target check (
    (source_kind in ('document','prior_gl_line') and document_id is not null
      and entry_id is null and counterparty_id is null)
    or (source_kind='entry' and document_id is null and entry_id is not null
      and counterparty_id is null)
    or (source_kind='counterparty' and document_id is null and entry_id is null
      and counterparty_id is not null)
    or (source_kind='human_note' and document_id is null and entry_id is null
      and counterparty_id is null
      and nullif(btrim(detail->>'note'),'') is not null))
);

create table clara.wiki_page_refs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  firm_id uuid not null,
  client_id uuid not null,
  ref_kind text not null check (ref_kind in
    ('wiki_page','counterparty','document','entry','account')),
  ref_page_id uuid,
  counterparty_id uuid,
  document_id uuid,
  entry_id uuid,
  account_code text,
  created_at timestamptz not null default now(),
  constraint fk_wiki_refs_page foreign key(page_id,firm_id,client_id)
    references clara.wiki_pages(id,firm_id,client_id),
  constraint fk_wiki_refs_ref_page foreign key(ref_page_id,firm_id,client_id)
    references clara.wiki_pages(id,firm_id,client_id),
  constraint fk_wiki_refs_counterparty
    foreign key(counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint fk_wiki_refs_document
    foreign key(document_id,firm_id) references clara.documents(id,firm_id),
  constraint fk_wiki_refs_entry
    foreign key(entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint fk_wiki_refs_account foreign key(client_id,account_code)
    references clara.coa_accounts(client_id,account_code),
  constraint ck_wiki_refs_target check (
    (ref_kind='wiki_page' and ref_page_id is not null and counterparty_id is null
      and document_id is null and entry_id is null and account_code is null)
    or (ref_kind='counterparty' and ref_page_id is null
      and counterparty_id is not null and document_id is null
      and entry_id is null and account_code is null)
    or (ref_kind='document' and ref_page_id is null and counterparty_id is null
      and document_id is not null and entry_id is null and account_code is null)
    or (ref_kind='entry' and ref_page_id is null and counterparty_id is null
      and document_id is null and entry_id is not null and account_code is null)
    or (ref_kind='account' and ref_page_id is null and counterparty_id is null
      and document_id is null and entry_id is null and account_code is not null))
);

create table clara.wiki_log (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  page_id uuid,
  action text not null check (action in
    ('ingest','publish','supersede','retire','lint_pass','hold','release')),
  actor_kind text not null check (actor_kind in ('runtime','human')),
  actor uuid references clara.users(id),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
  created_at timestamptz not null default now(),
  constraint fk_wiki_log_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_wiki_log_page foreign key(page_id,firm_id,client_id)
    references clara.wiki_pages(id,firm_id,client_id)
);

create table clara.wiki_synthesis_holds (
  client_id uuid primary key,
  firm_id uuid not null,
  reason text not null check (btrim(reason)<>''),
  since timestamptz not null default now(),
  constraint uq_wiki_holds_client_firm unique(client_id,firm_id),
  constraint fk_wiki_holds_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id)
);

-- O5/P14/P19: plan-as-document.
create table clara.onboarding_plans (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references clara.firms(id),
  scope_kind text not null check (scope_kind in ('firm','client')),
  client_id uuid,
  state text not null default 'open' check (state in ('open','committed','cancelled')),
  revision_token uuid not null default gen_random_uuid(),
  revision_n int not null default 1 check (revision_n>=1),
  committed_at timestamptz,
  committed_by uuid references clara.users(id),
  -- [R2-F4] review_maker is the immutable opener attribution. Every material
  -- maker is additionally accumulated in contributors; Gate O excludes the
  -- complete set, not merely this first actor.
  review_maker uuid references clara.users(id),
  reviewed_at timestamptz,
  contributors uuid[] not null default '{}'::uuid[],
  commit_attestation text,
  cancelled_at timestamptz,
  cancelled_by uuid references clara.users(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_onboarding_plans_id_firm_client unique(id,firm_id,client_id),
  constraint fk_onboarding_plans_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint ck_onboarding_plans_scope check (
    (scope_kind='client')=(client_id is not null)),
  constraint ck_onboarding_plans_review_maker_0017 check (
    (review_maker is null)=(reviewed_at is null)),
  constraint ck_onboarding_plans_contributors_0017 check (
    array_position(contributors,null) is null
    and (review_maker is null or review_maker=any(contributors))),
  constraint ck_onboarding_plans_commit_attestation_0017 check (
    state='committed' or commit_attestation is null),
  constraint ck_onboarding_plans_terminal check (
    (state='open' and committed_at is null and committed_by is null
      and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (state='committed' and committed_at is not null and committed_by is not null
      and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (state='cancelled' and committed_at is null and committed_by is null
      and cancelled_at is not null and cancelled_by is not null
      and nullif(btrim(cancel_reason),'') is not null))
);
create unique index uq_onboarding_plans_one_open
  on clara.onboarding_plans(firm_id,client_id) where state='open';

create table clara.onboarding_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  firm_id uuid not null,
  item_kind text not null check (item_kind in ('must_ask','capture','todo')),
  item_key text not null check (btrim(item_key)<>''),
  question text,
  answer jsonb,
  state text not null default 'pending'
    check (state in ('pending','answered','resolved','deferred')),
  required_for_commit boolean not null default false,
  answered_by uuid references clara.users(id),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_onboarding_plan_items_key unique(plan_id,item_key),
  constraint fk_onboarding_plan_items_plan foreign key(plan_id)
    references clara.onboarding_plans(id),
  constraint ck_onboarding_plan_items_answer check (
    (state='pending' and answer is null and answered_by is null and answered_at is null)
    or (state in ('answered','resolved') and answer is not null
      and answered_by is not null and answered_at is not null)
    or (state='deferred' and answered_by is not null and answered_at is not null))
);

create table clara.onboarding_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references clara.onboarding_plans(id),
  revision_n int not null check (revision_n>=1),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_at timestamptz not null default now(),
  constraint uq_onboarding_plan_revisions_n unique(plan_id,revision_n)
);

-- K1: seeded-once registry.
create table clara.opening_seed_registry (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  plan_id uuid not null,
  as_of date not null,
  state text not null default 'open'
    check (state in ('open','finalized','cancelled')),
  tie_document_id uuid,
  tie_document_sha256 text check (
    tie_document_sha256 is null or tie_document_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references clara.users(id),
  created_at timestamptz not null default now(),
  batch_n int not null default 0 check (batch_n>=0),
  finalized_at timestamptz,
  finalized_by uuid references clara.users(id),
  tie_asserted_at timestamptz,
  through_event_seq bigint,
  cancelled_at timestamptz,
  cancelled_by uuid references clara.users(id),
  cancel_reason text,
  constraint uq_opening_seed_registry_id_firm_client unique(id,firm_id,client_id),
  constraint fk_opening_seed_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_opening_seed_plan foreign key(plan_id,firm_id,client_id)
    references clara.onboarding_plans(id,firm_id,client_id),
  constraint fk_opening_seed_document foreign key(tie_document_id,firm_id)
    references clara.documents(id,firm_id),
  constraint ck_opening_seed_tie_pair check (
    (tie_document_id is null)=(tie_document_sha256 is null)),
  constraint ck_opening_seed_terminal check (
    (state='open' and finalized_at is null and finalized_by is null
      and tie_asserted_at is null and cancelled_at is null
      and cancelled_by is null and cancel_reason is null)
    or (state='finalized' and finalized_at is not null
      and finalized_by is not null and tie_asserted_at is not null
      and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (state='cancelled' and finalized_at is null and finalized_by is null
      and tie_asserted_at is null and cancelled_at is not null
      and cancelled_by is not null and nullif(btrim(cancel_reason),'') is not null))
);
create unique index uq_opening_seed_registry_once
  on clara.opening_seed_registry(client_id) where state<>'cancelled';

-- K2 / FORK-1. supersedes_item_id is the typed pending-correction link needed
-- by K6; the ratified public shape and constraints are otherwise unchanged.
create table clara.opening_items (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  seed_id uuid not null,
  item_kind text not null check (item_kind in
    ('gl_balance','ar_open_item','ap_open_item','bank_uncleared',
     'fixed_asset','equity_net','obe_plug')),
  item_key text not null check (btrim(item_key)<>''),
  entry_id uuid not null unique,
  counterparty_id uuid,
  fixed_asset_id uuid,
  item_ref text,
  item_date date,
  amount_cents bigint not null,
  sst_portion_cents bigint check (sst_portion_cents>=0),
  sst_rate_bp int check (sst_rate_bp>0),
  sst_basis text check (sst_basis is null or btrim(sst_basis)<>''),
  state text not null default 'active' check (state in ('active','superseded')),
  superseded_by_item uuid,
  supersedes_item_id uuid,
  created_by uuid not null references clara.users(id),
  created_at timestamptz not null default now(),
  constraint uq_opening_items_seed_key unique(seed_id,item_key),
  constraint uq_opening_items_id_firm_client unique(id,firm_id,client_id),
  constraint fk_opening_items_seed foreign key(seed_id,firm_id,client_id)
    references clara.opening_seed_registry(id,firm_id,client_id),
  constraint fk_opening_items_entry foreign key(entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint fk_opening_items_counterparty
    foreign key(counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint fk_opening_items_superseded_by
    foreign key(superseded_by_item,firm_id,client_id)
    references clara.opening_items(id,firm_id,client_id)
    deferrable initially deferred,
  constraint fk_opening_items_supersedes
    foreign key(supersedes_item_id,firm_id,client_id)
    references clara.opening_items(id,firm_id,client_id),
  constraint ck_opening_items_counterparty check (
    (item_kind in ('ar_open_item','ap_open_item'))=(counterparty_id is not null)),
  constraint ck_opening_items_sst check (
    (sst_portion_cents is null and sst_rate_bp is null and sst_basis is null)
    or (item_kind in ('ar_open_item','ap_open_item')
      and sst_portion_cents is not null and sst_rate_bp is not null
      and sst_basis is not null)),
  constraint ck_opening_items_bank_detail check (
    item_kind<>'bank_uncleared'
    or (nullif(btrim(item_ref),'') is not null and item_date is not null)),
  constraint ck_opening_items_supersede_state check (
    (state='active' and superseded_by_item is null)
    or (state='superseded' and superseded_by_item is not null)),
  constraint ck_opening_items_no_self_link check (
    superseded_by_item is distinct from id and supersedes_item_id is distinct from id)
);

-- K4: document-primary or attributed-keyed tie targets.
create table clara.opening_tb_targets (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  seed_id uuid not null,
  line_key text not null check (btrim(line_key)<>''),
  account_code text,
  source_label text not null check (btrim(source_label)<>''),
  debit_cents bigint not null default 0 check (debit_cents>=0),
  credit_cents bigint not null default 0 check (credit_cents>=0),
  provenance_kind text not null check (provenance_kind in ('document','keyed')),
  document_id uuid,
  source_sha256 text check (
    source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  extraction_ref jsonb,
  entered_by uuid references clara.users(id),
  created_at timestamptz not null default now(),
  constraint uq_opening_tb_targets_key unique(seed_id,line_key),
  constraint fk_opening_tb_targets_seed foreign key(seed_id,firm_id,client_id)
    references clara.opening_seed_registry(id,firm_id,client_id),
  constraint fk_opening_tb_targets_account foreign key(client_id,account_code)
    references clara.coa_accounts(client_id,account_code),
  constraint fk_opening_tb_targets_document foreign key(document_id,firm_id)
    references clara.documents(id,firm_id),
  constraint ck_opening_tb_targets_side check (
    (debit_cents>0)<>(credit_cents>0)),
  constraint ck_opening_tb_targets_provenance check (
    (provenance_kind='document' and document_id is not null
      and source_sha256 is not null and entered_by is null
      and extraction_ref is not null and jsonb_typeof(extraction_ref)='object')
    or (provenance_kind='keyed' and document_id is null
      and source_sha256 is null and extraction_ref is null
      and entered_by is not null))
);
-- [R2-F1] One stored extraction fact can back at most one target in a seed;
-- otherwise a correctly matched fact could still be duplicated into the tie.
create unique index uq_opening_tb_targets_extraction_fact_0017
  on clara.opening_tb_targets(
    seed_id,(extraction_ref->>'extraction_id'),(extraction_ref->>'region_id'))
  where provenance_kind='document';

create table clara.opening_seed_approvals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  seed_id uuid not null,
  batch_n int not null check (batch_n>=1),
  entry_id uuid not null,
  item_id uuid,
  checker uuid not null references clara.users(id),
  attestation_kind text not null check (attestation_kind in
    ('distinct_checker','self_approval_attestation')),
  approved_at timestamptz not null default now(),
  constraint uq_opening_seed_approvals_entry unique(seed_id,entry_id),
  constraint fk_opening_seed_approvals_seed
    foreign key(seed_id,firm_id,client_id)
    references clara.opening_seed_registry(id,firm_id,client_id),
  constraint fk_opening_seed_approvals_entry
    foreign key(entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint fk_opening_seed_approvals_item
    foreign key(item_id) references clara.opening_items(id)
);

-- K8: complete the circular asset↔opening-item linkage after both tables exist.
alter table clara.opening_items
  add constraint fk_opening_items_fixed_asset
  foreign key(fixed_asset_id) references clara.fixed_assets(id)
  deferrable initially deferred,
  add constraint ck_opening_items_fixed_asset check (
    (item_kind='fixed_asset')=(fixed_asset_id is not null));

-- S1: proposal batch is the landing state.
create table clara.seeding_batches (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  source_document_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'open'
    check (state in ('open','completed','cancelled')),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats)='object'),
  created_by uuid references clara.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references clara.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references clara.users(id),
  cancel_reason text,
  constraint uq_seeding_batches_id_firm_client unique(id,firm_id,client_id),
  constraint fk_seeding_batches_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_seeding_batches_document foreign key(source_document_id,firm_id)
    references clara.documents(id,firm_id),
  constraint ck_seeding_batches_terminal check (
    (state='open' and completed_at is null and completed_by is null
      and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (state='completed' and completed_at is not null and completed_by is not null
      and cancelled_at is null and cancelled_by is null and cancel_reason is null)
    or (state='cancelled' and completed_at is null and completed_by is null
      and cancelled_at is not null and cancelled_by is not null
      and nullif(btrim(cancel_reason),'') is not null))
);
create unique index uq_seeding_batches_one_open_source
  on clara.seeding_batches(client_id,source_sha256) where state='open';

create table clara.seeding_proposals (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  firm_id uuid not null,
  client_id uuid not null,
  proposal_kind text not null check (proposal_kind in
    ('vendor_account_rule','counterparty_birth','wiki_fact')),
  proposal_key text not null check (btrim(proposal_key)<>''),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  state text not null default 'proposed'
    check (state in ('proposed','ticked','declined','refused')),
  decided_by uuid references clara.users(id),
  decided_at timestamptz,
  decision_reason text,
  refuse_reason text,
  resulting_rule_id uuid references clara.coding_rules(id),
  resulting_counterparty_id uuid references clara.counterparties(id),
  created_at timestamptz not null default now(),
  constraint uq_seeding_proposals_key unique(batch_id,proposal_key),
  constraint fk_seeding_proposals_batch foreign key(batch_id,firm_id,client_id)
    references clara.seeding_batches(id,firm_id,client_id),
  constraint ck_seeding_proposals_terminal check (
    (state='proposed' and decided_by is null and decided_at is null
      and decision_reason is null and refuse_reason is null)
    or (state='ticked' and decided_by is not null and decided_at is not null
      and refuse_reason is null)
    or (state='declined' and decided_by is not null and decided_at is not null
      and nullif(btrim(decision_reason),'') is not null and refuse_reason is null)
    or (state='refused' and decided_by is null and decided_at is not null
      and nullif(btrim(refuse_reason),'') is not null))
);

-- L1/P18: first-class findings and append-only transition trail.
create table clara.lint_findings (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  finding_kind text not null check (finding_kind in
    ('contradiction','stale_claim','orphan_page','cap_pages','cap_page_size',
     'wiki_synthesis_held','opening_tb_tie_broken','opening_doc_unfiled')),
  dedupe_key text not null check (btrim(dedupe_key)<>''),
  severity text not null check (severity in ('info','warn','critical')),
  page_id uuid references clara.wiki_pages(id),
  seed_id uuid references clara.opening_seed_registry(id),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
  state text not null default 'open' check (state in ('open','superseded','resolved')),
  prior_finding_id uuid references clara.lint_findings(id),
  opened_at timestamptz not null default now(),
  evaluated_through_event_seq bigint,
  resolved_conclusion text check (resolved_conclusion is null or
    resolved_conclusion in
      ('corrected','accepted_revision','false_positive','superseded_by_edit')),
  resolved_note text,
  resolved_by uuid references clara.users(id),
  resolved_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_lint_findings_id_firm_client unique(id,firm_id,client_id),
  constraint fk_lint_findings_client foreign key(client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint ck_lint_findings_resolved check (
    (state='open' and resolved_conclusion is null and resolved_note is null
      and resolved_by is null and resolved_at is null and superseded_at is null)
    or (state='resolved' and resolved_conclusion is not null
      and nullif(btrim(resolved_note),'') is not null
      and resolved_by is not null and resolved_at is not null
      and superseded_at is null)
    or (state='superseded' and resolved_conclusion is null
      and resolved_note is null and resolved_by is null and resolved_at is null
      and superseded_at is not null))
);
create unique index uq_lint_findings_one_open
  on clara.lint_findings(client_id,dedupe_key) where state='open';

create table clara.lint_finding_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null,
  client_id uuid not null,
  finding_id uuid not null,
  event_kind text not null check (event_kind in
    ('created','superseded','resolved','recheck_opened','evaluation')),
  state_before text,
  state_after text,
  figures jsonb not null default '{}'::jsonb check (jsonb_typeof(figures)='object'),
  actor text,
  rationale text,
  created_at timestamptz not null default now(),
  constraint fk_lint_finding_events_finding
    foreign key(finding_id,firm_id,client_id)
    references clara.lint_findings(id,firm_id,client_id)
);

create table clara.lint_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz,
  clients_examined int,
  clients_changed int,
  clients_failed int,
  through_event_seq bigint,
  error_note text
);
create index ix_lint_runs_recency on clara.lint_runs(started_at);

-- Append-only/no-truncate posture.
create trigger t_wiki_log_append_only before update or delete
  on clara.wiki_log for each row execute function clara._tf_append_only();
create trigger t_onboarding_plan_revisions_append_only before update or delete
  on clara.onboarding_plan_revisions for each row execute function clara._tf_append_only();
create trigger t_opening_seed_approvals_append_only before update or delete
  on clara.opening_seed_approvals for each row execute function clara._tf_append_only();
create trigger t_lint_finding_events_append_only before update or delete
  on clara.lint_finding_events for each row execute function clara._tf_append_only();
create trigger t_lint_runs_append_only before update or delete
  on clara.lint_runs for each row execute function clara._tf_append_only();

do $$
declare t text;
begin
  foreach t in array array[
    'wiki_budgets','wiki_pages','wiki_page_versions','wiki_page_citations',
    'wiki_page_refs','wiki_log','wiki_synthesis_holds',
    'onboarding_plans','onboarding_plan_items','onboarding_plan_revisions',
    'opening_seed_registry','opening_items','opening_tb_targets',
    'opening_seed_approvals','seeding_batches','seeding_proposals',
    'lint_findings','lint_finding_events','lint_runs'
  ] loop
    execute format('create trigger t_%s_no_truncate before truncate on clara.%I '
      'for each statement execute function clara._tf_no_truncate()',t,t);
    execute format('alter table clara.%I enable row level security',t);
    execute format('alter table clara.%I force row level security',t);
    execute format(
      'create policy p_%s_owner on clara.%I for all to clara_fn_owner '
      'using (true) with check (true)',t,t);
  end loop;
end $$;

-- Tenant read policies. Agent policies exist as the standard 0007 posture, but
-- no table SELECT grant is given to clara_agent_ro; wiki reaches the agent only
-- through the FORK-6-gated context pack.
do $$
declare t text;
begin
  foreach t in array array[
    'wiki_pages','wiki_page_versions','wiki_page_citations','wiki_page_refs',
    'wiki_log','wiki_synthesis_holds','onboarding_plans',
    'onboarding_plan_items','opening_seed_registry','opening_items',
    'opening_tb_targets','opening_seed_approvals','seeding_batches',
    'seeding_proposals','lint_findings','lint_finding_events'
  ] loop
    execute format(
      'create policy p_%s_human on clara.%I for select to clara_authenticated '
      'using (firm_id=clara.jwt_firm())',t,t);
    execute format(
      'create policy p_%s_agent on clara.%I for select to clara_agent_ro '
      'using (firm_id=clara.wake_firm())',t,t);
    execute format(
      'create policy p_%s_runtime on clara.%I for select to clara_runtime '
      'using (true)',t,t);
  end loop;
end $$;
create policy p_onboarding_plan_revisions_human
  on clara.onboarding_plan_revisions for select to clara_authenticated
  using (exists(select 1 from clara.onboarding_plans p
    where p.id=plan_id and p.firm_id=clara.jwt_firm()));
create policy p_onboarding_plan_revisions_agent
  on clara.onboarding_plan_revisions for select to clara_agent_ro
  using (exists(select 1 from clara.onboarding_plans p
    where p.id=plan_id and p.firm_id=clara.wake_firm()));
create policy p_onboarding_plan_revisions_runtime
  on clara.onboarding_plan_revisions for select to clara_runtime using (true);
create policy p_lint_runs_runtime
  on clara.lint_runs for select to clara_runtime using (true);
create policy p_wiki_budgets_runtime
  on clara.wiki_budgets for select to clara_runtime using (true);

-- [R3-F1] The only canonical opening triple is derived from the complete,
-- anchored evidence text stored on the region. monetary_cents, when supplied,
-- is an independent second representation and must agree exactly.
create function clara._derive_opening_region_fact(
    p_field_path text,p_text_content text,p_monetary_cents bigint)
  returns table(account_code text,amount_cents bigint,side text)
  language plpgsql immutable security definer set search_path=clara,pg_temp as $$
declare m text[];
begin
  if p_field_path is distinct from 'opening_tb.line'
     or p_text_content is null then
    return;
  end if;
  m:=regexp_match(p_text_content,
    '^([0-9]{4,8}|[0-9]{3}-[0-9A-Z]{2,4})[[:space:]]+.+[[:space:]]+RM[[:space:]]+([0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)[.]([0-9]{2})[[:space:]]+(DR|CR)$');
  if m is null then return; end if;
  begin
    account_code:=m[1];
    amount_cents:=replace(m[2],',','')::bigint*100+m[3]::bigint;
    side:=case m[4] when 'DR' then 'debit' when 'CR' then 'credit' end;
  exception when others then
    raise exception 'opening extraction evidence is malformed'
      using errcode='CLR31',
        detail='{"reason":"opening_extraction_evidence_malformed"}';
  end;
  if amount_cents<=0 or side is null then
    raise exception 'opening extraction evidence is malformed'
      using errcode='CLR31',
        detail='{"reason":"opening_extraction_evidence_malformed"}';
  end if;
  if p_monetary_cents is not null
     and p_monetary_cents is distinct from amount_cents then
    raise exception 'opening extraction monetary evidence contradicts its text'
      using errcode='CLR31',
        detail='{"reason":"opening_extraction_monetary_mismatch"}';
  end if;
  return next;
end $$;

-- [R3-F1] Every chronologically newer accepted extraction, including a
-- cross-engine lower-version run, supersedes every prior current run and
-- becomes the document's sole authoritative pointer while the document row is
-- locked. A late-arriving older run is itself superseded by that pointer.
create function clara._tf_set_authoritative_extraction_0017() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_current uuid; v_current_at timestamptz;
begin
  if new.status<>'done' then return new; end if;
  select d.authoritative_extraction_id into v_current
    from clara.documents d
    where d.id=new.document_id and d.firm_id=new.firm_id for update;
  if not found then
    raise exception 'accepted extraction has no owning document'
      using errcode='CLR11';
  end if;
  if v_current is not null then
    select de.extracted_at into v_current_at
      from clara.document_extractions de
      where de.id=v_current and de.firm_id=new.firm_id
        and de.document_id=new.document_id and de.status='done'
        and de.superseded_by is null;
    if not found then
      raise exception 'document authoritative extraction pointer is corrupt'
        using errcode='CLR31',
          detail='{"reason":"opening_extraction_pointer_corrupt"}';
    end if;
  end if;
  if v_current is null
     or (new.extracted_at,new.id)>(v_current_at,v_current) then
    update clara.document_extractions de set superseded_by=new.id
      where de.firm_id=new.firm_id and de.document_id=new.document_id
        and de.id<>new.id and de.status='done' and de.superseded_by is null;
    update clara.documents d set authoritative_extraction_id=new.id
      where d.id=new.document_id and d.firm_id=new.firm_id;
  else
    update clara.document_extractions de set superseded_by=v_current
      where de.id=new.id and de.firm_id=new.firm_id
        and de.document_id=new.document_id and de.superseded_by is null;
  end if;
  return new;
end $$;
create trigger t_document_extractions_authority_0017
  after insert on clara.document_extractions for each row
  execute function clara._tf_set_authoritative_extraction_0017();

-- [R3-F1] Same-arity extraction CoR: an engine's optional caller-supplied
-- `opening_fact` is accepted only when it is exactly equivalent to the
-- independently derived evidence triple. The derived values, never the caller
-- assertion, are what get stored.
do $cor$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef(
    'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$declare t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;$old$,
$new$declare
  t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;
  v_opening_fact jsonb; v_opening_account text; v_opening_side text;
  v_opening_amount bigint; v_region_money bigint; v_derived record;
  v_derived_found boolean;$new$);
  if v_next=v_def then
    raise exception '0017: persist_document_extraction declaration R2-F1 drift'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',(elem->>'monetary_cents')::bigint);$old$,
$new$      -- [R3-F1] Derive the fact from the stored evidence first.
      v_opening_fact:=null; v_opening_account:=null; v_opening_side:=null;
      v_opening_amount:=null; v_region_money:=null;
      begin
        v_region_money:=nullif(elem->>'monetary_cents','')::bigint;
      exception when others then
        raise exception 'opening extraction monetary evidence is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_evidence_malformed"}';
      end;
      select * into v_derived from clara._derive_opening_region_fact(
        elem->>'field_path',elem->>'text_content',v_region_money);
      v_derived_found:=found;
      if elem ? 'opening_fact' then
        v_opening_fact:=elem->'opening_fact';
        if jsonb_typeof(v_opening_fact)<>'object' then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        begin
          v_opening_account:=nullif(btrim(v_opening_fact->>'account_code'),'');
          v_opening_side:=nullif(v_opening_fact->>'side','');
          v_opening_amount:=nullif(v_opening_fact->>'amount_cents','')::bigint;
        exception when others then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end;
        if v_opening_account is null
           or v_opening_side not in ('debit','credit')
           or v_opening_amount is null or v_opening_amount<=0 then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        if not v_derived_found then
          raise exception 'opening extraction fact has no independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_unverifiable"}';
        end if;
        if v_opening_account is distinct from v_derived.account_code
           or v_opening_amount is distinct from v_derived.amount_cents
           or v_opening_side is distinct from v_derived.side then
          raise exception 'opening extraction fact contradicts independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_mismatch"}';
        end if;
      end if;
      if v_derived_found then
        v_opening_account:=v_derived.account_code;
        v_opening_amount:=v_derived.amount_cents;
        v_opening_side:=v_derived.side;
      else
        v_opening_account:=null; v_opening_amount:=null; v_opening_side:=null;
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents,
          opening_account_code,opening_amount_cents,opening_side)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',
          coalesce(v_region_money,v_opening_amount),
          v_opening_account,v_opening_amount,v_opening_side);$new$);
  if v_next=v_prior
     or position('opening_extraction_fact_unverifiable' in v_next)=0
     or position('opening_extraction_fact_mismatch' in v_next)=0
     or position('_derive_opening_region_fact' in v_next)=0
     or position('opening_account_code,opening_amount_cents,opening_side' in v_next)=0 then
    raise exception '0017: persist_document_extraction facts R2-F1 drift'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

-- =====================================================================
-- B2 — INTERNAL HELPERS / EXISTING-TABLE TRIGGERS.
-- =====================================================================

-- O2: the one shared operational-client predicate and assertion.
create function clara._client_operational(p_client uuid) returns boolean
  language sql stable security definer set search_path=clara,pg_temp as $$
  select exists(select 1 from clara.clients c
    where c.id=p_client and c.status='active');
$$;

create function clara._assert_client_operational(p_client uuid,p_firm uuid)
  returns void language plpgsql stable security definer
  set search_path=clara,pg_temp as $$
declare c record;
begin
  select firm_id,status into c from clara.clients where id=p_client;
  if c.firm_id is null or c.firm_id<>p_firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  if c.status<>'active' then
    raise exception
      'client is not active -- operational consumers exclude onboarding/archived clients (WB-R1)'
      using errcode='CLR10';
  end if;
end $$;

-- [R3-F1] A document target is evidence-bound only when its JSON reference
-- names the document's locked authoritative extraction pointer and a region
-- belonging to that exact (firm,document,extraction) tuple.
create function clara._assert_opening_extraction_ref(
    p_firm uuid,p_document uuid,p_ref jsonb) returns void
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_extraction uuid; v_region uuid; x record;
begin
  if jsonb_typeof(p_ref)<>'object' then
    raise exception 'opening target extraction reference is malformed'
      using errcode='CLR31',detail='{"reason":"extraction_ref_malformed"}';
  end if;
  begin
    v_extraction:=nullif(p_ref->>'extraction_id','')::uuid;
    v_region:=nullif(p_ref->>'region_id','')::uuid;
  exception when others then
    raise exception 'opening target extraction reference is malformed'
      using errcode='CLR31',detail='{"reason":"extraction_ref_malformed"}';
  end;
  if v_extraction is null or v_region is null then
    raise exception 'opening target extraction reference is malformed'
      using errcode='CLR31',detail='{"reason":"extraction_ref_malformed"}';
  end if;
  select de.status,de.superseded_by,d.authoritative_extraction_id,
      dr.opening_account_code,dr.opening_amount_cents,dr.opening_side
    into x
  from clara.document_extractions de
  join clara.documents d on d.id=de.document_id
    and d.firm_id=de.firm_id
  join clara.document_regions dr on dr.extraction_id=de.id
    and dr.firm_id=de.firm_id
  where de.id=v_extraction and de.firm_id=p_firm
    and de.document_id=p_document
    and d.id=p_document and d.firm_id=p_firm
    and dr.id=v_region;
  if not found then
    raise exception 'opening target extraction is not stored for the tie document'
      using errcode='CLR31',detail='{"reason":"extraction_ref_not_found"}';
  end if;
  if x.status<>'done' or x.superseded_by is not null then
    raise exception 'opening target extraction is not an accepted current version'
      using errcode='CLR31',detail='{"reason":"extraction_not_accepted"}';
  end if;
  if x.authoritative_extraction_id is distinct from v_extraction then
    raise exception 'opening target extraction is not the authoritative current run'
      using errcode='CLR31',detail='{"reason":"stale_extraction_version"}';
  end if;
end $$;

-- [R3-F1] Every read re-derives from the complete anchored evidence grammar:
--   <account> <label> RM <comma-grouped amount>.<sen> <DR|CR>
-- Stored typed columns are only a checked cache and must match that independent
-- derivation exactly; they can never override the evidence.
create function clara._opening_region_fact(p_firm uuid,p_region uuid)
  returns table(account_code text,amount_cents bigint,side text)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare r record; f record;
begin
  select dr.field_path,dr.text_content,dr.opening_account_code,
      dr.opening_amount_cents,dr.opening_side,dr.monetary_cents into r
  from clara.document_regions dr
  join clara.document_extractions de on de.id=dr.extraction_id
    and de.firm_id=dr.firm_id
  where dr.id=p_region and dr.firm_id=p_firm and de.firm_id=p_firm;
  if not found then
    raise exception 'opening target extraction region is not stored'
      using errcode='CLR31',detail='{"reason":"extraction_ref_not_found"}';
  end if;
  select * into f from clara._derive_opening_region_fact(
    r.field_path,r.text_content,r.monetary_cents);
  if not found then
    raise exception 'opening target region has no canonical trial-balance fact'
      using errcode='CLR31',detail='{"reason":"extraction_fact_missing"}';
  end if;
  if (r.opening_account_code is not null
      or r.opening_amount_cents is not null or r.opening_side is not null)
     and (r.opening_account_code is distinct from f.account_code
       or r.opening_amount_cents is distinct from f.amount_cents
       or r.opening_side is distinct from f.side) then
    raise exception 'stored opening fact contradicts its evidence'
      using errcode='CLR31',
        detail='{"reason":"opening_extraction_fact_storage_mismatch"}';
  end if;
  account_code:=f.account_code;
  amount_cents:=f.amount_cents;
  side:=f.side;
  return next;
end $$;

-- [R2-F1] Every caller-supplied target field is compared to the stored region
-- fact. The reasons are intentionally field-specific for the review surface.
create function clara._assert_opening_target_fact(
    p_firm uuid,p_document uuid,p_ref jsonb,p_account text,
    p_debit bigint,p_credit bigint) returns void
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_region uuid; f record; v_side text; v_amount bigint;
begin
  perform clara._assert_opening_extraction_ref(p_firm,p_document,p_ref);
  begin
    v_region:=nullif(p_ref->>'region_id','')::uuid;
  exception when others then
    raise exception 'opening target extraction reference is malformed'
      using errcode='CLR31',detail='{"reason":"extraction_ref_malformed"}';
  end;
  select * into f from clara._opening_region_fact(p_firm,v_region);
  v_side:=case when p_debit>0 and p_credit=0 then 'debit'
    when p_credit>0 and p_debit=0 then 'credit' end;
  v_amount:=greatest(p_debit,p_credit);
  if f.account_code is distinct from p_account then
    raise exception 'opening target account does not match its extracted fact'
      using errcode='CLR31',
        detail='{"reason":"opening_target_account_mismatch"}';
  end if;
  if f.amount_cents is distinct from v_amount then
    raise exception 'opening target cents do not match its extracted fact'
      using errcode='CLR31',
        detail='{"reason":"opening_target_cents_mismatch"}';
  end if;
  if f.side is distinct from v_side then
    raise exception 'opening target sign does not match its extracted fact'
      using errcode='CLR31',
        detail='{"reason":"opening_target_sign_mismatch"}';
  end if;
end $$;

-- [R2-F2] Filing retirement/move and wiki publication serialize on the same
-- client row. Once the lock is held, any citation on an active page's current
-- version or any active-page document ref is a named live-citation blocker.
create function clara._assert_filing_wiki_unreferenced(
    p_firm uuid,p_client uuid,p_document uuid) returns void
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_blockers jsonb;
begin
  perform 1 from clara.clients c
    where c.id=p_client and c.firm_id=p_firm for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;
  select coalesce(jsonb_agg(b.blocker order by b.kind,b.page_id),
      '[]'::jsonb) into v_blockers
  from (
    select 'citation'::text kind,p.id page_id,
      jsonb_build_object('kind','citation','page_id',p.id,
        'version_id',c.version_id,'citation_id',c.id) blocker
    from clara.wiki_pages p
    join clara.wiki_page_citations c on c.version_id=p.current_version_id
      and c.client_id=p.client_id and c.firm_id=p.firm_id
    where p.firm_id=p_firm and p.client_id=p_client and p.state='active'
      and c.document_id=p_document
    union all
    select 'ref'::text,p.id,
      jsonb_build_object('kind','ref','page_id',p.id,'ref_id',r.id)
    from clara.wiki_pages p
    join clara.wiki_page_refs r on r.page_id=p.id
      and r.client_id=p.client_id and r.firm_id=p.firm_id
    where p.firm_id=p_firm and p.client_id=p_client and p.state='active'
      and r.ref_kind='document' and r.document_id=p_document
  ) b;
  if jsonb_array_length(v_blockers)>0 then
    raise exception 'filing has live wiki citation/ref blockers: %',
      v_blockers::text using errcode='CLR10',
      detail=jsonb_build_object(
        'reason','active_wiki_document_reference',
        'document_id',p_document,'client_id',p_client)::text;
  end if;
end $$;

-- [R2-F2] Same-arity CoRs cover the complete filing transition set:
-- retire_document_filing and approve_wrong_client_correction. The helper call
-- precedes the filing UPDATE in each body, and holds the client lock to commit.
do $cor$
declare v_def text; v_next text; v_norm text;
begin
  select pg_get_functiondef(
    'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure) into v_def;
  v_next:=replace(v_def,
$old$  if f.revision_token <> p_expected_revision then raise exception 'stale filing revision' using errcode = 'CLR17'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,'posting_date',je.posting_date,$old$,
$new$  if f.revision_token <> p_expected_revision then raise exception 'stale filing revision' using errcode = 'CLR17'; end if;
  -- [R2-F2] Active wiki provenance blocks retirement under the client lock.
  perform clara._assert_filing_wiki_unreferenced(
    f.firm_id,f.client_id,f.document_id);
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',je.id,'posting_date',je.posting_date,$new$);
  v_norm:=regexp_replace(lower(v_next),'\s+','','g');
  if v_next=v_def
     or position('_assert_filing_wiki_unreferenced(f.firm_id,f.client_id,f.document_id)'
       in v_norm)=0
     or position('_assert_filing_wiki_unreferenced' in v_norm)>
        position('updateclara.document_filingssetretired_at' in v_norm) then
    raise exception '0017: retire_document_filing R2-F2 drift'
      using errcode='CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure)
    into v_def;
  v_next:=replace(v_def,
$old$  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id$old$,
$new$  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  -- [R2-F2] A correction move retires the source filing, so the same active
  -- wiki provenance blocker and client-row lock apply.
  perform clara._assert_filing_wiki_unreferenced(
    c.firm,x.from_client,x.document_id);
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id$new$);
  v_norm:=regexp_replace(lower(v_next),'\s+','','g');
  if v_next=v_def
     or position('_assert_filing_wiki_unreferenced(c.firm,x.from_client,x.document_id)'
       in v_norm)=0
     or position('_assert_filing_wiki_unreferenced' in v_norm)>
        position('updateclara.document_filingssetretired_at' in v_norm) then
    raise exception '0017: approve_wrong_client_correction R2-F2 drift'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

-- UTF-8 byte-safe prefix used by the W6 running-window budget.
create function clara._left_utf8_bytes(p_text text,p_bytes bigint) returns text
  language plpgsql immutable security definer set search_path=clara,pg_temp as $$
declare v text:=coalesce(p_text,''); n int;
begin
  if p_bytes<=0 then return ''; end if;
  if octet_length(v)<=p_bytes then return v; end if;
  n:=least(length(v),p_bytes::int);
  while n>0 and octet_length(left(v,n))>p_bytes loop n:=n-1; end loop;
  return left(v,n);
end $$;

create function clara._onboarding_plan_snapshot(p_plan uuid) returns jsonb
  language sql stable security definer set search_path=clara,pg_temp as $$
  select jsonb_build_object(
    'plan',to_jsonb(p),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.item_key)
      from clara.onboarding_plan_items i where i.plan_id=p.id),'[]'::jsonb))
  from clara.onboarding_plans p where p.id=p_plan;
$$;

-- [R2-F4] Add one material maker to the plan's contributor SET. A newly seen
-- actor rotates the plan CAS and appends a revision snapshot; a repeat maker
-- is already represented and needs no redundant plan write.
create function clara._record_onboarding_contributor(
    p_plan uuid,p_actor uuid) returns void
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare p record; v_n int; v_contributors uuid[];
begin
  if p_actor is null then
    raise exception 'onboarding contribution requires an attributed actor'
      using errcode='CLR10';
  end if;
  select * into p from clara.onboarding_plans where id=p_plan for update;
  if not found then
    raise exception 'onboarding plan not found' using errcode='CLR11';
  end if;
  if p_actor=any(p.contributors) then return; end if;
  select array_agg(distinct x.contributor order by x.contributor)
    into v_contributors
  from unnest(p.contributors||array[p_actor]) as x(contributor);
  v_n:=p.revision_n+1;
  update clara.onboarding_plans set contributors=v_contributors,
    revision_n=v_n,revision_token=gen_random_uuid(),updated_at=now()
    where id=p_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(p_plan,v_n,clara._onboarding_plan_snapshot(p_plan));
end $$;

-- K8 / FORK-7(b): once its acquisition OB entry is approved, an FA baseline
-- cannot be edited. Wave D's disposal fields plus K6's explicit supersede state
-- are the only allowlist.
create function clara._tf_fixed_assets_immutable_0017() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_approved boolean;
begin
  if tg_op='DELETE' then
    raise exception 'fixed assets are corrected by opening supersede, never deleted'
      using errcode='CLR13';
  end if;
  select exists(select 1 from clara.journal_entries e
    where e.id=old.acquisition_entry_id and e.status='approved') into v_approved;
  if v_approved and
     (to_jsonb(new)-array[
       'disposed_at','status','superseded_by_asset_id','updated_at'])
       is distinct from
     (to_jsonb(old)-array[
       'disposed_at','status','superseded_by_asset_id','updated_at']) then
    raise exception 'an approved fixed-asset baseline is immutable'
      using errcode='CLR13';
  end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger t_fixed_assets_immutable_0017 before update or delete
  on clara.fixed_assets for each row
  execute function clara._tf_fixed_assets_immutable_0017();

-- W3 core: shared by publish and deterministic ingest. It has no grants, no
-- receipt, no audit, and no event; the public mutation-class wrapper owns those.
create function clara._publish_wiki_page_version_core(
    p_firm uuid,p_client uuid,p_slug text,p_page_kind text,p_title text,
    p_counterparty uuid,p_content text,p_content_sha256 text,p_storage_key text,
    p_citations jsonb,p_refs jsonb,p_synthesis text,p_engine_id text,
    p_projected_from_seq bigint,p_actor uuid,p_actor_kind text,p_log_action text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare
  v_page uuid; v_version uuid; v_prior uuid; v_n int; v_size bigint;
  v_max_pages bigint; v_max_bytes bigint; j jsonb; v_kind text;
  v_doc uuid; v_entry uuid; v_cp uuid; v_ref_page uuid; v_account text;
begin
  if p_slug is null or p_slug!~'^[a-z0-9][a-z0-9/_-]{0,199}$'
     or p_page_kind not in ('profile','counterparty','treatment',
       'recurring_pattern','open_question','period_context')
     or nullif(btrim(p_title),'') is null
     or (p_page_kind='counterparty')<>(p_counterparty is not null)
     or p_synthesis not in ('deterministic','model')
     or (p_synthesis='model')<>(p_engine_id is not null) then
    raise exception 'wiki page metadata is malformed'
      using errcode='CLR32',detail='{"reason":"bad_state"}';
  end if;
  if p_content is null or octet_length(p_content)=0 then
    raise exception 'wiki page content is required'
      using errcode='CLR32',detail='{"reason":"bad_state"}';
  end if;
  if p_content_sha256 is distinct from
      encode(sha256(convert_to(p_content,'UTF8')),'hex') then
    raise exception 'wiki content hash does not match'
      using errcode='CLR32',detail='{"reason":"sha_mismatch"}';
  end if;
  if p_storage_key is distinct from
      ('firms/'||p_firm::text||'/wiki/'||p_client::text||'/'||
       p_content_sha256||'.md') then
    raise exception 'wiki storage key does not match its immutable content'
      using errcode='CLR32',detail='{"reason":"sha_mismatch"}';
  end if;
  select value_int into v_max_pages from clara.wiki_budgets
    where budget_key='max_pages_per_client';
  select value_int into v_max_bytes from clara.wiki_budgets
    where budget_key='max_page_bytes';
  if v_max_pages is null or v_max_bytes is null then
    raise exception 'wiki budget configuration is incomplete'
      using errcode='CLR32',detail='{"reason":"budget_unknown"}';
  end if;
  v_size:=octet_length(p_content);
  if v_size>v_max_bytes then
    raise exception 'wiki page exceeds the configured byte cap'
      using errcode='CLR32',detail=jsonb_build_object(
        'reason','cap_exceeded','budget_key','max_page_bytes',
        'actual',v_size,'limit',v_max_bytes)::text;
  end if;
  if jsonb_typeof(p_citations)<>'array' or jsonb_array_length(p_citations)=0 then
    raise exception 'a published wiki page requires provenance citations'
      using errcode='CLR32',detail='{"reason":"citation_required"}';
  end if;
  if p_refs is null then p_refs:='[]'::jsonb; end if;
  if jsonb_typeof(p_refs)<>'array' then
    raise exception 'wiki page refs are malformed'
      using errcode='CLR32',detail='{"reason":"bad_state"}';
  end if;
  if p_synthesis='model' and exists(select 1 from clara.wiki_synthesis_holds h
      where h.client_id=p_client) then
    raise exception 'wiki synthesis is held for this client'
      using errcode='CLR32',detail='{"reason":"consent_held"}';
  end if;

  -- [R1-F7] Serialize the page-count check and new-slug insert on one
  -- client-scoped row lock. Concurrent different slugs can no longer both
  -- observe cap-1 and overrun the hard WB-R8 cap.
  perform 1 from clara.clients c
    where c.id=p_client and c.firm_id=p_firm for update;
  if not found then
    raise exception 'wiki client not in the supplied firm' using errcode='CLR11';
  end if;
  select id,current_version_id into v_page,v_prior
  from clara.wiki_pages
  where client_id=p_client and slug=p_slug for update;
  if v_page is null then
    if (select count(*) from clara.wiki_pages
        where client_id=p_client and state='active')>=v_max_pages then
      raise exception 'wiki client page cap reached'
        using errcode='CLR32',detail=jsonb_build_object(
          'reason','cap_exceeded','budget_key','max_pages_per_client',
          'limit',v_max_pages)::text;
    end if;
    insert into clara.wiki_pages(
        firm_id,client_id,slug,page_kind,title,counterparty_id)
      values(p_firm,p_client,p_slug,p_page_kind,btrim(p_title),p_counterparty)
      returning id into v_page;
    v_n:=1;
  else
    if not exists(select 1 from clara.wiki_pages p where p.id=v_page
        and p.firm_id=p_firm and p.state='active'
        and p.page_kind=p_page_kind
        and p.counterparty_id is not distinct from p_counterparty) then
      raise exception 'wiki page identity is immutable or retired'
        using errcode='CLR32',detail='{"reason":"bad_state"}';
    end if;
    select coalesce(max(version_n),0)+1 into v_n
      from clara.wiki_page_versions where page_id=v_page;
    if v_prior is not null then
      update clara.wiki_page_versions set state='superseded'
        where id=v_prior and state='published';
      insert into clara.wiki_log(firm_id,client_id,page_id,action,
          actor_kind,actor,detail)
        values(p_firm,p_client,v_page,'supersede',p_actor_kind,p_actor,
          jsonb_build_object('version_id',v_prior));
    end if;
  end if;

  insert into clara.wiki_page_versions(page_id,firm_id,client_id,version_n,
      content,content_sha256,storage_key,size_bytes,state,synthesis,engine_id,
      projected_from_seq)
    values(v_page,p_firm,p_client,v_n,p_content,p_content_sha256,p_storage_key,
      v_size,'published',p_synthesis,p_engine_id,p_projected_from_seq)
    returning id into v_version;

  for j in select value from jsonb_array_elements(p_citations) loop
    v_kind:=j->>'source_kind'; v_doc:=null; v_entry:=null; v_cp:=null;
    begin
      if nullif(j->>'document_id','') is not null then
        v_doc:=(j->>'document_id')::uuid;
      end if;
      if nullif(j->>'entry_id','') is not null then
        v_entry:=(j->>'entry_id')::uuid;
      end if;
      if nullif(j->>'counterparty_id','') is not null then
        v_cp:=(j->>'counterparty_id')::uuid;
      end if;
    exception when others then
      raise exception 'wiki citation target is malformed'
        using errcode='CLR32',detail='{"reason":"citation_required"}';
    end;
    if v_doc is not null then
      -- [R1-F8] Document provenance is client-bound, not merely firm-bound.
      if not exists(select 1 from clara.documents d
          join clara.document_filings df on df.document_id=d.id
            and df.client_id=p_client and df.retired_at is null
          where d.id=v_doc and d.firm_id=p_firm) then
        raise exception 'wiki citation document is not actively filed to this client'
          using errcode='CLR02';
      end if;
      if exists(select 1 from clara.documents d where d.id=v_doc
          and d.document_kind='consent_evidence') then
        raise exception 'consent evidence cannot be a wiki citation'
          using errcode='CLR28';
      end if;
    end if;
    insert into clara.wiki_page_citations(version_id,firm_id,client_id,
        source_kind,document_id,entry_id,counterparty_id,detail)
      values(v_version,p_firm,p_client,v_kind,v_doc,v_entry,v_cp,
        coalesce(j->'detail','{}'::jsonb));
  end loop;

  delete from clara.wiki_page_refs where page_id=v_page;
  for j in select value from jsonb_array_elements(p_refs) loop
    v_kind:=j->>'ref_kind'; v_ref_page:=null; v_doc:=null;
    v_entry:=null; v_cp:=null; v_account:=nullif(j->>'account_code','');
    begin
      if nullif(j->>'ref_page_id','') is not null then
        v_ref_page:=(j->>'ref_page_id')::uuid;
      end if;
      if nullif(j->>'document_id','') is not null then
        v_doc:=(j->>'document_id')::uuid;
      end if;
      if nullif(j->>'entry_id','') is not null then
        v_entry:=(j->>'entry_id')::uuid;
      end if;
      if nullif(j->>'counterparty_id','') is not null then
        v_cp:=(j->>'counterparty_id')::uuid;
      end if;
    exception when others then
      raise exception 'wiki ref target is malformed'
        using errcode='CLR32',detail='{"reason":"bad_state"}';
    end;
    -- [R1-F8] A document ref has the same active client-filing floor as a
    -- citation. The firm-only document FK is defense-in-depth, not authority.
    if v_doc is not null and not exists(select 1 from clara.documents d
        join clara.document_filings df on df.document_id=d.id
          and df.client_id=p_client and df.retired_at is null
        where d.id=v_doc and d.firm_id=p_firm) then
      raise exception 'wiki ref document is not actively filed to this client'
        using errcode='CLR02';
    end if;
    insert into clara.wiki_page_refs(page_id,firm_id,client_id,ref_kind,
        ref_page_id,counterparty_id,document_id,entry_id,account_code)
      values(v_page,p_firm,p_client,v_kind,v_ref_page,v_cp,v_doc,v_entry,v_account);
  end loop;

  update clara.wiki_pages set current_version_id=v_version,
      title=btrim(p_title),updated_at=now() where id=v_page;
  insert into clara.wiki_log(firm_id,client_id,page_id,action,actor_kind,actor,detail)
    values(p_firm,p_client,v_page,p_log_action,p_actor_kind,p_actor,
      jsonb_build_object('version_id',v_version,'version_n',v_n,
        'content_sha256',p_content_sha256,'storage_key',p_storage_key));
  -- [R1-F6] This is the canonical reconstruction envelope shared by every
  -- publication path. Content bytes live in immutable Storage; everything
  -- needed to rebuild page/version/provenance/ref index rows is returned here.
  return jsonb_build_object('page_id',v_page,'version_id',v_version,
    'version_n',v_n,'slug',p_slug,'page_kind',p_page_kind,
    'title',btrim(p_title),'counterparty_id',p_counterparty,
    'storage_key',p_storage_key,'content_sha256',p_content_sha256,
    'size_bytes',v_size,'synthesis',p_synthesis,'engine_id',p_engine_id,
    'projected_from_seq',p_projected_from_seq,
    'citations',p_citations,'refs',p_refs);
end $$;

-- W3: runtime projection/interview/seeding writer.
create function clara.publish_wiki_page_version(
    p_client uuid,p_slug text,p_page_kind text,p_title text,
    p_counterparty uuid,p_content text,p_content_sha256 text,p_storage_key text,
    p_citations jsonb,p_refs jsonb,p_synthesis text,p_engine_id text,
    p_projected_from_seq bigint,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_firm uuid; v_status text; v_dedupe jsonb; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select firm_id,status into v_firm,v_status from clara.clients where id=p_client;
  if v_firm is null then raise exception 'client not found' using errcode='CLR11'; end if;
  if v_status not in ('active','onboarding') then
    raise exception 'wiki writes require an active or onboarding client'
      using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(v_firm,'publish_wiki_page_version',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'slug',p_slug,
      'page_kind',p_page_kind,'title',p_title,'counterparty',p_counterparty,
      'content_sha256',p_content_sha256,'storage_key',p_storage_key,
      'citations',p_citations,'refs',p_refs,'synthesis',p_synthesis,
      'engine_id',p_engine_id,'projected_from_seq',p_projected_from_seq)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_result:=clara._publish_wiki_page_version_core(v_firm,p_client,p_slug,
    p_page_kind,p_title,p_counterparty,p_content,p_content_sha256,p_storage_key,
    p_citations,p_refs,p_synthesis,p_engine_id,p_projected_from_seq,
    null,'runtime','publish');
  perform clara._audit(v_firm,null,null,null,'publish_wiki_page_version',
    (v_result->>'page_id')::uuid,
    jsonb_build_object('client',p_client,'version_id',v_result->>'version_id',
      'op_key',p_op_key));
  -- [R1-F6] Canonical complete reconstruction event. Its domain-event seq is
  -- the replay order; projected_from_seq preserves the source sequence.
  perform clara._append_event(v_firm,'wiki.page_published',p_client,null,null,null,
    null,null,null,v_result||jsonb_build_object(
      'reconstruction_schema',1,'state','published'));
  return clara._finish_op(v_firm,'publish_wiki_page_version',p_op_key,v_result);
end $$;

create function clara.record_wiki_source_ingest(
    p_client uuid,p_document uuid,p_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  d record; v_client_status text; v_dedupe jsonb; v_content text; v_sha text;
  v_key text; v_result jsonb; v_title text;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select doc.* into d from clara.documents doc
    join clara.document_filings f on f.document_id=doc.id and f.client_id=p_client
      and f.retired_at is null
    join clara.clients c on c.id=f.client_id and c.firm_id=doc.firm_id
    where doc.id=p_document and doc.bytes_verified_at is not null;
  if not found then
    raise exception 'wiki ingest source is not actively filed and verified'
      using errcode='CLR02';
  end if;
  select c.status into v_client_status from clara.clients c where c.id=p_client;
  if v_client_status not in ('active','onboarding') then
    raise exception 'wiki writes require an active or onboarding client'
      using errcode='CLR10';
  end if;
  if d.document_kind='consent_evidence' then
    raise exception 'consent evidence cannot feed wiki ingest' using errcode='CLR28';
  end if;
  v_content:=coalesce(nullif(btrim(p_note),''),
    'Source document: '||coalesce(d.original_filename,p_document::text));
  v_sha:=encode(sha256(convert_to(v_content,'UTF8')),'hex');
  v_key:='firms/'||d.firm_id::text||'/wiki/'||p_client::text||'/'||v_sha||'.md';
  v_title:='Source: '||coalesce(d.original_filename,p_document::text);
  v_dedupe:=clara._reserve_op(d.firm_id,'record_wiki_source_ingest',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'document',p_document,
      'note',p_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_result:=clara._publish_wiki_page_version_core(d.firm_id,p_client,
    'sources/'||p_document::text,'period_context',v_title,null,v_content,v_sha,
    v_key,jsonb_build_array(jsonb_build_object('source_kind','document',
      'document_id',p_document,'detail',jsonb_build_object(
        'document_sha256',d.sha256,'deterministic_ingest',true))),
    '[]'::jsonb,'deterministic',null,null,null,'runtime','ingest');
  perform clara._audit(d.firm_id,null,null,null,'record_wiki_source_ingest',
    (v_result->>'page_id')::uuid,
    jsonb_build_object('client',p_client,'document',p_document,'op_key',p_op_key));
  -- [R1-F6] Keep the ingest trail, then emit the same canonical publication
  -- event as the model/projection path. The canonical event is the final domain
  -- append and makes deterministic-ingest pages replayable.
  perform clara._append_event(d.firm_id,'wiki.source_ingested',p_client,null,null,null,
    null,p_document,null,jsonb_build_object(
      'page_id',v_result->>'page_id','version_id',v_result->>'version_id',
      'storage_key',v_key,'content_sha256',v_sha));
  perform clara._append_event(d.firm_id,'wiki.page_published',p_client,null,null,null,
    null,p_document,null,v_result||jsonb_build_object(
      'reconstruction_schema',1,'state','published',
      'publication_path','deterministic_ingest'));
  return clara._finish_op(d.firm_id,'record_wiki_source_ingest',p_op_key,v_result);
end $$;

create function clara.retire_wiki_page(
    p_page uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; p record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and retire reason are required' using errcode='CLR10';
  end if;
  select * into p from clara.wiki_pages where id=p_page for update;
  if not found or p.firm_id<>c.firm then
    raise exception 'wiki page not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'retire_wiki_page',p_op_key,
    clara._hash(jsonb_build_object('page',p_page,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state<>'active' then
    raise exception 'wiki page is not active'
      using errcode='CLR32',detail='{"reason":"bad_state"}';
  end if;
  update clara.wiki_pages set state='retired',retired_at=now(),
    retired_by=c.actor,retire_reason=btrim(p_reason),updated_at=now()
    where id=p_page;
  insert into clara.wiki_log(firm_id,client_id,page_id,action,actor_kind,actor,detail)
    values(c.firm,p.client_id,p_page,'retire','human',c.actor,
      jsonb_build_object('reason',btrim(p_reason)));
  perform clara._audit(c.firm,c.actor,null,null,'retire_wiki_page',p_page,
    jsonb_build_object('client',p.client_id,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'wiki.page_retired',p.client_id,c.actor,null,null,
    null,null,null,jsonb_build_object('page_id',p_page,'slug',p.slug,
      'current_version_id',p.current_version_id,'reason',btrim(p_reason)));
  v_result:=jsonb_build_object('page_id',p_page,'status','retired');
  return clara._finish_op(c.firm,'retire_wiki_page',p_op_key,v_result);
end $$;

create function clara.set_wiki_synthesis_hold(
    p_client uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and hold reason are required' using errcode='CLR10';
  end if;
  select firm_id into v_firm from clara.clients where id=p_client;
  if v_firm is null then raise exception 'client not found' using errcode='CLR11'; end if;
  v_dedupe:=clara._reserve_op(v_firm,'set_wiki_synthesis_hold',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.wiki_synthesis_holds(client_id,firm_id,reason,since)
    values(p_client,v_firm,btrim(p_reason),now())
    on conflict(client_id) do update set reason=excluded.reason,since=now();
  insert into clara.wiki_log(firm_id,client_id,action,actor_kind,detail)
    values(v_firm,p_client,'hold','runtime',
      jsonb_build_object('reason',btrim(p_reason)));
  perform clara._audit(v_firm,null,null,null,'set_wiki_synthesis_hold',null,
    jsonb_build_object('client',p_client,'reason',p_reason,'op_key',p_op_key));
  v_result:=jsonb_build_object('client_id',p_client,'status','held');
  return clara._finish_op(v_firm,'set_wiki_synthesis_hold',p_op_key,v_result);
end $$;

create function clara.clear_wiki_synthesis_hold(
    p_client uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_reason text; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select firm_id into v_firm from clara.clients where id=p_client;
  if v_firm is null then raise exception 'client not found' using errcode='CLR11'; end if;
  v_dedupe:=clara._reserve_op(v_firm,'clear_wiki_synthesis_hold',p_op_key,
    clara._hash(jsonb_build_object('client',p_client)));
  if v_dedupe is not null then return v_dedupe; end if;
  delete from clara.wiki_synthesis_holds where client_id=p_client
    returning reason into v_reason;
  insert into clara.wiki_log(firm_id,client_id,action,actor_kind,detail)
    values(v_firm,p_client,'release','runtime',
      jsonb_build_object('prior_reason',v_reason));
  perform clara._audit(v_firm,null,null,null,'clear_wiki_synthesis_hold',null,
    jsonb_build_object('client',p_client,'op_key',p_op_key));
  v_result:=jsonb_build_object('client_id',p_client,'status','released');
  return clara._finish_op(v_firm,'clear_wiki_synthesis_hold',p_op_key,v_result);
end $$;

-- [R1-F4] W8 pure query verbs. Human and runtime lanes remain one signature,
-- but the runtime branch requires the explicit v25 server marker from FORK-6.
-- Missing human claims never infer runtime authority or widen tenant scope.
create function clara.get_wiki_page(p_client uuid,p_slug text) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_firm uuid;
begin
  v_firm:=clara.jwt_firm();
  if v_firm is null then
    if current_setting('clara.pack_consumer',true) is distinct from 'v25'
       or (session_user<>'clara_runtime'
         and current_setting('role',true) is distinct from 'clara_runtime') then
      raise exception 'wiki read requires human claims or the trusted v25 runtime marker'
        using errcode='CLR03';
    end if;
    select firm_id into v_firm from clara.clients where id=p_client;
  else
    perform clara._human_ctx(clara.role_rank('viewer'));
    if not exists(select 1 from clara.clients
        where id=p_client and firm_id=v_firm) then return null; end if;
  end if;
  return (select jsonb_build_object(
      'page',to_jsonb(p),
      'version',to_jsonb(v),
      'citations',coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
        from clara.wiki_page_citations c where c.version_id=v.id),'[]'::jsonb),
      'refs',coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
        from clara.wiki_page_refs r where r.page_id=p.id),'[]'::jsonb))
    from clara.wiki_pages p
    join clara.wiki_page_versions v on v.id=p.current_version_id
    where p.client_id=p_client and p.firm_id=v_firm and p.slug=p_slug);
end $$;

create function clara.list_wiki_pages(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_firm uuid;
begin
  v_firm:=clara.jwt_firm();
  if v_firm is null then
    if current_setting('clara.pack_consumer',true) is distinct from 'v25'
       or (session_user<>'clara_runtime'
         and current_setting('role',true) is distinct from 'clara_runtime') then
      raise exception 'wiki read requires human claims or the trusted v25 runtime marker'
        using errcode='CLR03';
    end if;
    select firm_id into v_firm from clara.clients where id=p_client;
  else
    perform clara._human_ctx(clara.role_rank('viewer'));
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'slug',p.slug,'page_kind',p.page_kind,'title',p.title,
      'counterparty_id',p.counterparty_id,'state',p.state,
      'current_version_id',p.current_version_id,'version_n',v.version_n,
      'content_sha256',v.content_sha256,'storage_key',v.storage_key,
      'size_bytes',v.size_bytes,'updated_at',p.updated_at)
      order by p.slug),'[]'::jsonb)
    from clara.wiki_pages p
    left join clara.wiki_page_versions v on v.id=p.current_version_id
    where p.client_id=p_client and p.firm_id=v_firm);
end $$;

-- =====================================================================
-- B3 — O: ONBOARDING LIFECYCLE + PLAN WRITERS.
-- =====================================================================

-- O7: same-arity create_firm CoR with a durable token-row receipt and the
-- first firm-scope plan.
create or replace function clara.create_firm(
    p_name text,p_admission_token uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_plan uuid; a record; v_result jsonb;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  if not exists(select 1 from clara.users where id=v_actor) then
    raise exception 'unknown actor' using errcode='CLR04';
  end if;
  if exists(select 1 from clara.users where id=v_actor and is_agent) then
    raise exception 'the agent identity cannot own a firm' using errcode='CLR04';
  end if;
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_name),'') is null then
    raise exception 'firm name and op_key are required' using errcode='CLR10';
  end if;
  select * into a from clara.firm_admissions
    where token=p_admission_token for update;
  if not found then
    raise exception 'invalid or consumed admission token' using errcode='CLR04';
  end if;
  if a.consumed_at is not null then
    if a.consumed_op_key=p_op_key and a.consumed_result is not null then
      return a.consumed_result;
    end if;
    raise exception 'invalid or consumed admission token' using errcode='CLR04';
  end if;
  if exists(select 1 from clara.firm_memberships
      where user_id=v_actor and status='active') then
    raise exception 'actor already belongs to a firm' using errcode='CLR10';
  end if;
  insert into clara.firms(name) values(btrim(p_name)) returning id into v_firm;
  insert into clara.firm_memberships(firm_id,user_id,role)
    values(v_firm,v_actor,'owner');
  -- [R2-F4] The firm-plan opener is recorded both as opener and contributor.
  insert into clara.onboarding_plans(
      firm_id,scope_kind,review_maker,reviewed_at,contributors)
    values(v_firm,'firm',v_actor,now(),array[v_actor]) returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(v_plan,1,clara._onboarding_plan_snapshot(v_plan));
  v_result:=jsonb_build_object('firm_id',v_firm,'plan_id',v_plan);
  update clara.firm_admissions set consumed_at=now(),
    consumed_op_key=p_op_key,consumed_result=v_result
    where token=p_admission_token;
  perform clara._audit(v_firm,v_actor,null,null,'create_firm',null,
    jsonb_build_object('name',p_name,'plan_id',v_plan,'op_key',p_op_key));
  perform clara._append_event(v_firm,'firm.created',null,v_actor,null,null,
    null,null,null,jsonb_build_object('plan_id',v_plan));
  return v_result;
end $$;

create function clara.begin_client_onboarding(p_name text,p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_client uuid; v_plan uuid; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_name),'') is null then
    raise exception 'client name and op_key are required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'begin_client_onboarding',p_op_key,
    clara._hash(jsonb_build_object('name',btrim(p_name))));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    insert into clara.clients(firm_id,name,status)
      values(c.firm,btrim(p_name),'onboarding') returning id into v_client;
  exception when unique_violation then
    raise exception 'a client with that name already exists' using errcode='CLR10';
  end;
  -- [R2-F4] The opener remains separately attributed, and is the first member
  -- of the contributor set that Gate O excludes from commit.
  insert into clara.onboarding_plans(
      firm_id,scope_kind,client_id,review_maker,reviewed_at,contributors)
    values(c.firm,'client',v_client,c.actor,now(),array[c.actor])
    returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(v_plan,1,clara._onboarding_plan_snapshot(v_plan));
  perform clara._audit(c.firm,c.actor,null,null,'begin_client_onboarding',null,
    jsonb_build_object('client',v_client,'plan',v_plan,'op_key',p_op_key));
  perform clara._append_event(c.firm,'client.onboarding_started',v_client,
    c.actor,null,null,null,null,null,jsonb_build_object('plan_id',v_plan));
  v_result:=jsonb_build_object('client_id',v_client,'plan_id',v_plan);
  return clara._finish_op(c.firm,'begin_client_onboarding',p_op_key,v_result);
end $$;

-- [R3-F2] Same-arity compatibility CoR: the legacy granted creator is now an
-- onboarding birth verb too. There is no granted client-minting surface whose
-- post-image is active or lacks a plan.
create or replace function clara.create_client(p_name text,p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_client uuid; v_plan uuid; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_name),'') is null then
    raise exception 'client name and op_key are required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'create_client',p_op_key,
    clara._hash(jsonb_build_object('name',btrim(p_name))));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    insert into clara.clients(firm_id,name,status)
      values(c.firm,btrim(p_name),'onboarding') returning id into v_client;
  exception when unique_violation then
    raise exception 'a client with that name already exists' using errcode='CLR10';
  end;
  insert into clara.onboarding_plans(
      firm_id,scope_kind,client_id,review_maker,reviewed_at,contributors)
    values(c.firm,'client',v_client,c.actor,now(),array[c.actor])
    returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(v_plan,1,clara._onboarding_plan_snapshot(v_plan));
  perform clara._audit(c.firm,c.actor,null,null,'create_client',null,
    jsonb_build_object('client',v_client,'plan',v_plan,'op_key',p_op_key));
  perform clara._append_event(c.firm,'client.onboarding_started',v_client,
    c.actor,null,null,null,null,null,
    jsonb_build_object('plan_id',v_plan,'compatibility_surface','create_client'));
  v_result:=jsonb_build_object('client_id',v_client,'plan_id',v_plan,
    'status','onboarding');
  return clara._finish_op(c.firm,'create_client',p_op_key,v_result);
end $$;

-- [R3-F2] B-12 bridge for active clients born before 0017. The verb is
-- admin-only, audited, receipt-idempotent, and plan-idempotent across fresh
-- op_keys. It creates exactly the incremental carry-down vehicle and never
-- changes the client's already-active status.
create function clara.bootstrap_client_plan(
    p_client uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; cl record; p record; v_dedupe jsonb; v_plan uuid; v_item uuid;
  v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into cl from clara.clients where id=p_client for update;
  if not found or cl.firm_id<>c.firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  if cl.status<>'active' then
    raise exception 'plan bootstrap is only for pre-0017 active clients'
      using errcode='CLR10',
        detail='{"reason":"active_client_bootstrap_required"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'bootstrap_client_plan',p_op_key,
    clara._hash(jsonb_build_object('client',p_client)));
  if v_dedupe is not null then return v_dedupe; end if;
  select p0.* into p from clara.onboarding_plans p0
    where p0.firm_id=c.firm and p0.client_id=p_client
    order by p0.created_at desc,p0.id desc limit 1 for update;
  if found then
    select i.id into v_item from clara.onboarding_plan_items i
      where i.plan_id=p.id and i.item_key='carry_down_deferred'
        and i.item_kind='todo' and i.state in ('deferred','resolved');
    if v_item is null then
      raise exception 'active client already has a non-bootstrap onboarding plan'
        using errcode='CLR10',
          detail='{"reason":"active_client_plan_already_exists"}';
    end if;
    v_result:=jsonb_build_object('client_id',p_client,'plan_id',p.id,
      'item_id',v_item,'status','active','bootstrap_status','already_bootstrapped');
    return clara._finish_op(c.firm,'bootstrap_client_plan',p_op_key,v_result);
  end if;
  insert into clara.onboarding_plans(
      firm_id,scope_kind,client_id,review_maker,reviewed_at,contributors)
    values(c.firm,'client',p_client,c.actor,now(),array[c.actor])
    returning id into v_plan;
  insert into clara.onboarding_plan_items(
      plan_id,firm_id,item_kind,item_key,question,answer,state,
      required_for_commit,answered_by,answered_at)
    values(v_plan,c.firm,'todo','carry_down_deferred',
      'Carry down the pre-0017 client opening position incrementally',
      null,'deferred',false,c.actor,now())
    returning id into v_item;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(v_plan,1,clara._onboarding_plan_snapshot(v_plan));
  perform clara._audit(c.firm,c.actor,null,null,'bootstrap_client_plan',null,
    jsonb_build_object('client',p_client,'plan',v_plan,'item',v_item,
      'status_unchanged',cl.status,'op_key',p_op_key));
  perform clara._append_event(c.firm,'onboarding.plan_bootstrapped',p_client,
    c.actor,null,null,null,null,null,jsonb_build_object(
      'plan_id',v_plan,'item_id',v_item,'item_key','carry_down_deferred',
      'client_status',cl.status));
  v_result:=jsonb_build_object('client_id',p_client,'plan_id',v_plan,
    'item_id',v_item,'status',cl.status,'bootstrap_status','created');
  return clara._finish_op(c.firm,'bootstrap_client_plan',p_op_key,v_result);
end $$;

-- Runtime interview CAS writer. Must-asks remain plan items only.
create function clara.update_onboarding_plan(
    p_plan uuid,p_expected_revision uuid,p_items jsonb,p_answered_by uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  p record; v_dedupe jsonb; j jsonb; v_key text; v_kind text; v_state text;
  v_token uuid; v_n int; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key)='' or jsonb_typeof(p_items)<>'array' then
    raise exception 'plan items and op_key are required' using errcode='CLR10';
  end if;
  select * into p from clara.onboarding_plans where id=p_plan for update;
  if not found then raise exception 'onboarding plan not found' using errcode='CLR11'; end if;
  -- [R1-F11] Reserve the full review-revision request before the mutable plan
  -- CAS. Exact retries replay; a changed payload under the same key is the
  -- receipt-hash CLR10 even after the first revision rotated the token.
  v_dedupe:=clara._reserve_op(p.firm_id,'update_onboarding_plan',p_op_key,
    clara._hash(jsonb_build_object('plan',p_plan,'revision',p_expected_revision,
      'items',p_items,'answered_by',p_answered_by)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state<>'open' then
    raise exception 'onboarding plan is not open' using errcode='CLR10';
  end if;
  if p.revision_token is distinct from p_expected_revision then
    -- AMB-9 adjudication: plan-CAS rides the CLR06 revision class; CLR31/'stale_plan'
    -- is the SEED family's (K14).
    raise exception 'stale onboarding plan revision'
      using errcode='CLR06',detail='{"reason":"stale_plan"}';
  end if;
  if not exists(select 1 from clara.firm_memberships m
      where m.firm_id=p.firm_id and m.user_id=p_answered_by
        and m.status='active'
        and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')) then
    raise exception 'answered_by is not an active bookkeeper for this firm'
      using errcode='CLR04';
  end if;
  for j in select value from jsonb_array_elements(p_items) loop
    v_key:=nullif(btrim(j->>'item_key'),'');
    v_kind:=j->>'item_kind';
    v_state:=coalesce(nullif(j->>'state',''),'pending');
    if v_key is null or v_kind not in ('must_ask','capture','todo')
       or v_state not in ('pending','answered','resolved','deferred') then
      raise exception 'onboarding plan item is malformed' using errcode='CLR10';
    end if;
    insert into clara.onboarding_plan_items(plan_id,firm_id,item_kind,item_key,
        question,answer,state,required_for_commit,answered_by,answered_at)
      values(p_plan,p.firm_id,v_kind,v_key,nullif(j->>'question',''),j->'answer',
        v_state,coalesce((j->>'required_for_commit')::boolean,false),
        case when v_state='pending' then null else p_answered_by end,
        case when v_state='pending' then null else now() end)
      on conflict(plan_id,item_key) do update set
        item_kind=excluded.item_kind,question=excluded.question,
        answer=excluded.answer,state=excluded.state,
        required_for_commit=excluded.required_for_commit,
        answered_by=excluded.answered_by,answered_at=excluded.answered_at,
        updated_at=now();
  end loop;
  v_token:=gen_random_uuid(); v_n:=p.revision_n+1;
  -- [R2-F4] Answers are material plan work: add their attributed professional
  -- to the contributor SET. review_maker remains the opener.
  update clara.onboarding_plans set revision_token=v_token,revision_n=v_n,
    contributors=(select array_agg(distinct x.contributor order by x.contributor)
      from unnest(contributors||array[p_answered_by]) as x(contributor)),
    updated_at=now()
    where id=p_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(p_plan,v_n,clara._onboarding_plan_snapshot(p_plan));
  perform clara._audit(p.firm_id,p_answered_by,null,null,'update_onboarding_plan',
    null,jsonb_build_object('plan',p_plan,'revision_n',v_n,'op_key',p_op_key));
  v_result:=jsonb_build_object('plan_id',p_plan,'revision_token',v_token,
    'revision_n',v_n,'status','updated');
  return clara._finish_op(p.firm_id,'update_onboarding_plan',p_op_key,v_result);
end $$;

create function clara.resolve_onboarding_plan_item(
    p_plan uuid,p_item_key text,p_resolution text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; p record; i record; v_dedupe jsonb; v_state text;
  v_token uuid; v_n int; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_item_key),'') is null
     or nullif(btrim(p_resolution),'') is null then
    raise exception 'plan item resolution is malformed' using errcode='CLR10';
  end if;
  select * into p from clara.onboarding_plans where id=p_plan for update;
  if not found or p.firm_id<>c.firm then
    raise exception 'onboarding plan not in your firm' using errcode='CLR11';
  end if;
  if p.state<>'open' then raise exception 'onboarding plan is not open' using errcode='CLR10'; end if;
  select * into i from clara.onboarding_plan_items
    where plan_id=p_plan and item_key=p_item_key for update;
  if not found then raise exception 'onboarding plan item not found' using errcode='CLR10'; end if;
  v_state:='resolved';
  v_dedupe:=clara._reserve_op(c.firm,'resolve_onboarding_plan_item',p_op_key,
    clara._hash(jsonb_build_object('plan',p_plan,'item_key',p_item_key,
      'resolution',p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.onboarding_plan_items set state=v_state,
    answer=to_jsonb(p_resolution),
    answered_by=c.actor,answered_at=now(),updated_at=now() where id=i.id;
  v_token:=gen_random_uuid(); v_n:=p.revision_n+1;
  -- [R2-F4] Human resolutions are material plan work and add the resolver to
  -- the contributor SET; the opener attribution is not rewritten.
  update clara.onboarding_plans set revision_token=v_token,revision_n=v_n,
    contributors=(select array_agg(distinct x.contributor order by x.contributor)
      from unnest(contributors||array[c.actor]) as x(contributor)),
    updated_at=now() where id=p_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(p_plan,v_n,clara._onboarding_plan_snapshot(p_plan));
  perform clara._audit(c.firm,c.actor,null,null,'resolve_onboarding_plan_item',
    null,jsonb_build_object('plan',p_plan,'item_key',p_item_key,
      'state',v_state,'op_key',p_op_key));
  v_result:=jsonb_build_object('plan_id',p_plan,'item_id',i.id,
    'state',v_state,'revision_token',v_token,'revision_n',v_n);
  return clara._finish_op(c.firm,'resolve_onboarding_plan_item',p_op_key,v_result);
end $$;

create function clara.commit_client_onboarding(
    p_client uuid,p_plan uuid,p_expected_plan_revision uuid,p_op_key text,
    p_attestation text default null)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare
  c record; p record; cl record; v_dedupe jsonb; v_n int; v_result jsonb;
  v_commit_attestation text; v_attestation_kind text;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into cl from clara.clients where id=p_client for update;
  if not found or cl.firm_id<>c.firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  select * into p from clara.onboarding_plans where id=p_plan for update;
  if not found or p.firm_id<>c.firm or p.client_id<>p_client then
    raise exception 'onboarding plan does not belong to this client'
      using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'commit_client_onboarding',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'plan',p_plan,
      'revision',p_expected_plan_revision,'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state<>'open' or cl.status<>'onboarding' then
    raise exception 'client onboarding is not open' using errcode='CLR10';
  end if;
  if p.revision_token is distinct from p_expected_plan_revision then
    -- AMB-9 adjudication: plan-CAS rides the CLR06 revision class; CLR31/'stale_plan'
    -- is the SEED family's (K14).
    raise exception 'stale onboarding plan revision'
      using errcode='CLR06',detail='{"reason":"stale_plan"}';
  end if;
  -- [R2-F4] Gate O excludes EVERY material contributor, not just the opener.
  -- The existing solo-firm attestation path is the only exception.
  if cardinality(p.contributors)=0 then
    raise exception 'onboarding plan has no attributed contributors'
      using errcode='CLR05',detail='{"reason":"checker_required"}';
  end if;
  if c.actor=any(p.contributors) then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'onboarding commit requires a non-contributor checker'
        using errcode='CLR05',detail='{"reason":"distinct_checker"}';
    elsif nullif(btrim(p_attestation),'') is null then
      raise exception 'solo onboarding commit requires an attestation'
        using errcode='CLR05',detail='{"reason":"self_attestation"}';
    else
      v_commit_attestation:=btrim(p_attestation);
      v_attestation_kind:='self_approval_attestation';
    end if;
  else
    v_attestation_kind:='distinct_checker';
  end if;
  if exists(select 1 from clara.onboarding_plan_items i
      where i.plan_id=p_plan and i.required_for_commit
        and i.state not in ('answered','resolved')) then
    raise exception 'required onboarding questions remain unresolved'
      using errcode='CLR10';
  end if;
  if not exists(select 1 from clara.opening_seed_registry s
        where s.client_id=p_client and s.plan_id=p_plan and s.state='finalized')
     and not exists(select 1 from clara.onboarding_plan_items i
        where i.plan_id=p_plan and i.item_key='first_year_zero_opening'
          and i.state in ('answered','resolved'))
     and not exists(select 1 from clara.onboarding_plan_items i
        where i.plan_id=p_plan and i.item_key='carry_down_deferred'
          and i.state in ('deferred','resolved')) then
    raise exception 'an opening position is required before activation'
      using errcode='CLR10';
  end if;
  update clara.clients set status='active' where id=p_client;
  v_n:=p.revision_n+1;
  update clara.onboarding_plans set state='committed',committed_at=now(),
    committed_by=c.actor,commit_attestation=v_commit_attestation,
    revision_token=gen_random_uuid(),revision_n=v_n,
    updated_at=now() where id=p_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(p_plan,v_n,clara._onboarding_plan_snapshot(p_plan));
  perform clara._audit(c.firm,c.actor,null,null,'commit_client_onboarding',null,
    jsonb_build_object('client',p_client,'plan',p_plan,'op_key',p_op_key));
  perform clara._append_event(c.firm,'onboarding.plan_committed',p_client,
    c.actor,null,null,null,null,null,jsonb_build_object('plan_id',p_plan));
  perform clara._append_event(c.firm,'client.activated',p_client,
    c.actor,null,null,null,null,null,jsonb_build_object('plan_id',p_plan));
  v_result:=jsonb_build_object('client_id',p_client,'plan_id',p_plan,
    'status','active','review_maker',p.review_maker,
    'attestation_kind',v_attestation_kind);
  return clara._finish_op(c.firm,'commit_client_onboarding',p_op_key,v_result);
end $$;

create function clara.cancel_client_onboarding(
    p_client uuid,p_plan uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; p record; cl record; v_dedupe jsonb; v_n int; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and cancellation reason are required' using errcode='CLR10';
  end if;
  select * into cl from clara.clients where id=p_client for update;
  select * into p from clara.onboarding_plans where id=p_plan for update;
  if cl.firm_id is distinct from c.firm or p.firm_id is distinct from c.firm
     or p.client_id is distinct from p_client then
    raise exception 'onboarding plan not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'cancel_client_onboarding',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'plan',p_plan,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if cl.status<>'onboarding' or p.state<>'open' then
    raise exception 'client onboarding is not open' using errcode='CLR10';
  end if;
  update clara.clients set status='archived' where id=p_client;
  v_n:=p.revision_n+1;
  update clara.onboarding_plans set state='cancelled',cancelled_at=now(),
    cancelled_by=c.actor,cancel_reason=btrim(p_reason),
    revision_token=gen_random_uuid(),revision_n=v_n,updated_at=now()
    where id=p_plan;
  insert into clara.onboarding_plan_revisions(plan_id,revision_n,snapshot)
    values(p_plan,v_n,clara._onboarding_plan_snapshot(p_plan));
  perform clara._audit(c.firm,c.actor,null,null,'cancel_client_onboarding',null,
    jsonb_build_object('client',p_client,'plan',p_plan,'reason',p_reason,
      'op_key',p_op_key));
  v_result:=jsonb_build_object('client_id',p_client,'plan_id',p_plan,
    'status','archived');
  return clara._finish_op(c.firm,'cancel_client_onboarding',p_op_key,v_result);
end $$;

-- =====================================================================
-- B4 — K: CARRY-DOWN.
-- =====================================================================

create function clara.create_opening_seed(
    p_client uuid,p_plan uuid,p_as_of date,p_tie_document uuid,
    p_tie_sha256 text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; cl record; p record; d record; v_dedupe jsonb; v_seed uuid;
  v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or p_as_of is null
     or ((p_tie_document is null)<>(p_tie_sha256 is null)) then
    raise exception 'opening seed arguments are malformed' using errcode='CLR10';
  end if;
  select * into cl from clara.clients where id=p_client;
  if not found or cl.firm_id<>c.firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  if cl.status not in ('active','onboarding') then
    raise exception 'opening seed requires an active or onboarding client'
      using errcode='CLR10';
  end if;
  select * into p from clara.onboarding_plans where id=p_plan;
  if not found or p.firm_id<>c.firm or p.client_id<>p_client then
    raise exception 'opening seed plan does not belong to the client'
      using errcode='CLR11';
  end if;
  if p_tie_document is not null then
    perform clara._active_document_filing(
      p_tie_document,p_tie_sha256,p_client,true);
    select document_kind into d from clara.documents where id=p_tie_document;
    if d.document_kind not in ('opening_balance_doc','management_account') then
      raise exception 'opening tie document has the wrong kind'
        using errcode='CLR02';
    end if;
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'create_opening_seed',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'plan',p_plan,
      'as_of',p_as_of,'tie_document',p_tie_document,'sha256',p_tie_sha256)));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    insert into clara.opening_seed_registry(firm_id,client_id,plan_id,as_of,
        tie_document_id,tie_document_sha256,created_by)
      values(c.firm,p_client,p_plan,p_as_of,p_tie_document,p_tie_sha256,c.actor)
      returning id into v_seed;
  exception when unique_violation then
    raise exception 'this client already has a semantic opening seed'
      using errcode='CLR31',detail='{"reason":"duplicate_seed"}';
  end;
  -- [R2-F4] Seed/as-of/tie authoring is material plan work.
  perform clara._record_onboarding_contributor(p_plan,c.actor);
  perform clara._audit(c.firm,c.actor,null,null,'create_opening_seed',null,
    jsonb_build_object('client',p_client,'plan',p_plan,'seed',v_seed,
      'as_of',p_as_of,'op_key',p_op_key));
  v_result:=jsonb_build_object('seed_id',v_seed,'client_id',p_client,
    'plan_id',p_plan,'as_of',p_as_of,'status','open');
  return clara._finish_op(c.firm,'create_opening_seed',p_op_key,v_result);
end $$;

-- The design's state machine and close battery require a cancelled seed to
-- release the partial-unique slot. This narrow verb is the typed transition.
create function clara.cancel_opening_seed(
    p_seed uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; s record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and cancellation reason are required' using errcode='CLR10';
  end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if not found or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'cancel_opening_seed',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if s.state<>'open' or exists(select 1 from clara.opening_items where seed_id=p_seed) then
    raise exception 'only an empty open seed may be cancelled'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  update clara.opening_seed_registry set state='cancelled',
    cancelled_at=now(),cancelled_by=c.actor,cancel_reason=btrim(p_reason)
    where id=p_seed;
  -- [R3-F3] Cancelling/restaging the plan's opening vehicle is material work.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  perform clara._audit(c.firm,c.actor,null,null,'cancel_opening_seed',null,
    jsonb_build_object('seed',p_seed,'reason',p_reason,'op_key',p_op_key));
  v_result:=jsonb_build_object('seed_id',p_seed,'status','cancelled');
  return clara._finish_op(c.firm,'cancel_opening_seed',p_op_key,v_result);
end $$;

create function clara.record_opening_target(
    p_seed uuid,p_line jsonb,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; s record; v_dedupe jsonb; v_id uuid; v_key text;
  v_debit bigint; v_credit bigint; v_result jsonb; v_kind text;
  v_document uuid; v_sha text; v_ref jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or jsonb_typeof(p_line)<>'object' then
    raise exception 'opening target is malformed' using errcode='CLR10';
  end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if not found or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  v_key:=nullif(btrim(p_line->>'line_key'),'');
  begin
    v_debit:=coalesce((p_line->>'debit_cents')::bigint,0);
    v_credit:=coalesce((p_line->>'credit_cents')::bigint,0);
  exception when others then
    raise exception 'opening target amounts are malformed' using errcode='CLR10';
  end;
  if v_key is null or (v_debit>0)=(v_credit>0) then
    raise exception 'opening target is malformed' using errcode='CLR10';
  end if;
  -- [R1-F2] The human writer no longer overwrites provenance_kind. A tied
  -- registry accepts only exact-document/extraction evidence; a registry
  -- without a tie document is the attributed keyed fallback.
  v_kind:=coalesce(nullif(p_line->>'provenance_kind',''),
    case when s.tie_document_id is null then 'keyed' end);
  if s.tie_document_id is not null then
    -- [R2-F1] Document-primary facts enter only through the runtime parsed
    -- writer, where account/cents/sign are compared to stored extraction facts.
    raise exception 'document opening targets require the parsed target writer'
      using errcode='CLR31',
        detail='{"reason":"parsed_target_writer_required"}';
  else
    if v_kind is distinct from 'keyed'
       or nullif(p_line->>'document_id','') is not null
       or nullif(p_line->>'source_sha256','') is not null
       or p_line ? 'extraction_ref' then
      raise exception 'opening keyed fallback must be fully keyed and attributed'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    v_document:=null; v_sha:=null; v_ref:=null;
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'record_opening_target',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,'line',p_line)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.opening_tb_targets(firm_id,client_id,seed_id,line_key,
      account_code,source_label,debit_cents,credit_cents,provenance_kind,
      document_id,source_sha256,entered_by,extraction_ref)
    values(c.firm,s.client_id,p_seed,v_key,nullif(p_line->>'account_code',''),
      coalesce(nullif(p_line->>'source_label',''),v_key),v_debit,v_credit,
      v_kind,v_document,v_sha,
      case when v_kind='keyed' then c.actor end,v_ref)
    on conflict(seed_id,line_key) do update set
      account_code=excluded.account_code,source_label=excluded.source_label,
      debit_cents=excluded.debit_cents,credit_cents=excluded.credit_cents,
      provenance_kind=excluded.provenance_kind,
      document_id=excluded.document_id,source_sha256=excluded.source_sha256,
      extraction_ref=excluded.extraction_ref,entered_by=excluded.entered_by
    returning id into v_id;
  -- [R2-F4] Keyed target authoring records the human maker on the plan.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  perform clara._audit(c.firm,c.actor,null,null,'record_opening_target',null,
    jsonb_build_object('seed',p_seed,'target',v_id,'op_key',p_op_key));
  v_result:=jsonb_build_object('target_id',v_id,'seed_id',p_seed,
    'provenance_kind',v_kind);
  return clara._finish_op(c.firm,'record_opening_target',p_op_key,v_result);
end $$;

create function clara.record_opening_targets_parsed(
    p_seed uuid,p_lines jsonb,p_document uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  s record; d record; v_dedupe jsonb; j jsonb; v_count int:=0;
  v_debit bigint; v_credit bigint; v_key text; v_account text; v_result jsonb;
  v_asserted_account text; v_asserted_side text; v_asserted_amount bigint;
begin
  if p_op_key is null or btrim(p_op_key)='' or jsonb_typeof(p_lines)<>'array' then
    raise exception 'parsed opening targets are malformed' using errcode='CLR10';
  end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if not found then raise exception 'opening seed not found' using errcode='CLR11'; end if;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  select * into d from clara.documents where id=p_document and firm_id=s.firm_id;
  if not found or d.document_kind='consent_evidence'
     or p_document is distinct from s.tie_document_id
     or d.sha256 is distinct from s.tie_document_sha256 then
    if d.document_kind='consent_evidence' then
      raise exception 'consent evidence cannot feed opening targets' using errcode='CLR28';
    end if;
    raise exception 'parsed targets do not match the tie document'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
  perform clara._active_document_filing(p_document,d.sha256,s.client_id,true);
  v_dedupe:=clara._reserve_op(s.firm_id,'record_opening_targets_parsed',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,'document',p_document,
      'lines',p_lines)));
  if v_dedupe is not null then return v_dedupe; end if;
  for j in select value from jsonb_array_elements(p_lines) loop
    v_key:=nullif(btrim(j->>'line_key'),'');
    v_account:=nullif(j->>'account_code','');
    begin
      v_debit:=coalesce((j->>'debit_cents')::bigint,0);
      v_credit:=coalesce((j->>'credit_cents')::bigint,0);
    exception when others then
      raise exception 'parsed opening target amount is malformed' using errcode='CLR10';
    end;
    if v_key is null or (v_debit>0)=(v_credit>0)
       or jsonb_typeof(j->'extraction_ref')<>'object' then
      raise exception 'parsed opening target is malformed' using errcode='CLR10';
    end if;
    -- [R2-F1] The exact account, positive cents, and debit/credit sign must
    -- match the canonical fact stored on the cited latest extraction region.
    perform clara._assert_opening_target_fact(
      s.firm_id,p_document,j->'extraction_ref',
      v_account,v_debit,v_credit);
    -- [R3-F1] A parser may echo its asserted fact, but that echo is accepted
    -- only when it is exactly the same triple independently proved above.
    if j ? 'opening_fact' then
      if jsonb_typeof(j->'opening_fact')<>'object' then
        raise exception 'caller opening fact is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_fact_malformed"}';
      end if;
      begin
        v_asserted_account:=nullif(btrim(j#>>'{opening_fact,account_code}'),'');
        v_asserted_amount:=nullif(j#>>'{opening_fact,amount_cents}','')::bigint;
        v_asserted_side:=lower(nullif(btrim(j#>>'{opening_fact,side}'),''));
      exception when others then
        raise exception 'caller opening fact is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_fact_malformed"}';
      end;
      if v_asserted_account is null or v_asserted_amount is null
         or v_asserted_amount<=0
         or v_asserted_side not in ('debit','credit') then
        raise exception 'caller opening fact is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_fact_malformed"}';
      end if;
      if v_asserted_account is distinct from v_account
         or v_asserted_amount is distinct from greatest(v_debit,v_credit)
         or v_asserted_side is distinct from
           (case when v_debit>0 then 'debit' else 'credit' end) then
        raise exception 'caller opening fact contradicts extraction evidence'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_fact_mismatch"}';
      end if;
    end if;
    insert into clara.opening_tb_targets(firm_id,client_id,seed_id,line_key,
        account_code,source_label,debit_cents,credit_cents,provenance_kind,
        document_id,source_sha256,extraction_ref)
      values(s.firm_id,s.client_id,p_seed,v_key,v_account,
        coalesce(nullif(j->>'source_label',''),v_key),v_debit,v_credit,
        'document',p_document,d.sha256,j->'extraction_ref')
      on conflict(seed_id,line_key) do update set
        account_code=excluded.account_code,source_label=excluded.source_label,
        debit_cents=excluded.debit_cents,credit_cents=excluded.credit_cents,
        provenance_kind='document',document_id=excluded.document_id,
        source_sha256=excluded.source_sha256,
        extraction_ref=excluded.extraction_ref,entered_by=null;
    v_count:=v_count+1;
  end loop;
  -- [R2-F4] The runtime-derived targets are attributed to the seed author,
  -- the human who selected the document/as-of and owns this material input.
  perform clara._record_onboarding_contributor(s.plan_id,s.created_by);
  perform clara._audit(s.firm_id,null,null,null,'record_opening_targets_parsed',
    null,jsonb_build_object('seed',p_seed,'document',p_document,
      'targets',v_count,'op_key',p_op_key));
  v_result:=jsonb_build_object('seed_id',p_seed,'document_id',p_document,
    'targets_recorded',v_count,'provenance_kind','document');
  return clara._finish_op(s.firm_id,'record_opening_targets_parsed',p_op_key,v_result);
end $$;

-- Private K3 core. Generic _draft_entry_core remains false forever.
create function clara._draft_opening_item_core(
    p_actor uuid,p_firm uuid,p_client uuid,p_seed uuid,p_item jsonb,p_lines jsonb,
    p_resolution uuid,p_document uuid,p_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  s record; cl record; v_kind text; v_key text; v_amount bigint; v_cp uuid;
  v_lines jsonb; v_filing uuid; v_entry uuid; v_item uuid; v_token uuid;
  v_obe text; v_re text; v_fixed uuid; a jsonb; v_method text;
  v_supersedes_item uuid; v_supersedes_asset uuid;
  v_asset_code text; v_accum_code text; v_expense_code text;
  v_cost bigint; v_accum bigint; v_residual bigint; v_life int;
  v_control text; v_control_count int; v_dr bigint; v_cr bigint;
  v_constraint text;
begin
  if jsonb_typeof(p_item)<>'object' then
    raise exception 'opening item is malformed' using errcode='CLR10';
  end if;
  select * into s from clara.opening_seed_registry where id=p_seed for share;
  if not found or s.firm_id<>p_firm or s.client_id<>p_client then
    raise exception 'opening seed not in your firm/client' using errcode='CLR11';
  end if;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  select * into cl from clara.clients where id=p_client;
  if cl.status not in ('active','onboarding') then
    raise exception 'opening items require an active or onboarding client'
      using errcode='CLR10';
  end if;
  v_kind:=p_item->>'item_kind';
  v_key:=nullif(btrim(p_item->>'item_key'),'');
  begin
    v_amount:=nullif(p_item->>'amount_cents','')::bigint;
    v_cp:=nullif(p_item->>'counterparty_id','')::uuid;
    v_supersedes_item:=nullif(p_item->>'supersedes_item_id','')::uuid;
  exception when others then
    raise exception 'opening item identity/amount is malformed' using errcode='CLR10';
  end;
  if v_kind not in ('gl_balance','ar_open_item','ap_open_item',
      'bank_uncleared','fixed_asset','equity_net','obe_plug')
     or v_key is null
     or (v_kind in ('ar_open_item','ap_open_item','equity_net','obe_plug')
       and (v_amount is null or v_amount=0)) then
    raise exception 'opening item is malformed' using errcode='CLR10';
  end if;
  perform clara.assert_client_resolved(p_client,p_resolution,p_document);
  if (p_document is null)<>(p_sha256 is null) then
    raise exception 'document and sha256 must be both set or both null'
      using errcode='CLR10';
  end if;
  if p_document is not null then
    -- [R1-F2] Preserve the binding CLR02 provenance floor before applying the
    -- seed-family exact-tie policy (a bad active filing/hash stays CLR02).
    v_filing:=clara._active_document_filing(p_document,p_sha256,p_client,true);
    if not exists(select 1 from clara.documents d where d.id=p_document
        and d.document_kind in ('opening_balance_doc','management_account')) then
      raise exception 'opening item provenance has the wrong document kind'
        using errcode='CLR02';
    end if;
  end if;
  -- [R1-F2] Document-primary carry-down is document-bound. A tied seed's
  -- entries all bind to that exact active filing/hash; only a no-document seed
  -- may use the fully keyed fallback.
  if s.tie_document_id is not null and (
      p_document is distinct from s.tie_document_id
      or p_sha256 is distinct from s.tie_document_sha256) then
    raise exception 'opening item must bind to the exact tie document'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  elsif s.tie_document_id is null and p_document is not null then
    raise exception 'keyed opening fallback cannot mix document provenance'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
  select account_code into v_obe from clara.coa_accounts
    where client_id=p_client and special_acc_type='opening_balance_equity'
      and is_active;
  select account_code into v_re from clara.coa_accounts
    where client_id=p_client and special_acc_type='retained_earnings'
      and is_active;
  if v_obe is null or v_re is null then
    raise exception 'OBE and retained-earnings markers are required'
      using errcode='CLR31',detail='{"reason":"obe_not_nil"}';
  end if;

  if v_kind in ('gl_balance','bank_uncleared') then
    if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
      raise exception 'opening GL item requires at least one typed leg'
        using errcode='CLR10';
    end if;
    if exists(
        select 1 from jsonb_array_elements(p_lines) x
        join clara.coa_accounts ca on ca.client_id=p_client
          and ca.account_code=x->>'account_code'
        where ca.account_class in ('payable','receivable')
           or ca.special_acc_type in ('opening_balance_equity','retained_earnings')) then
      raise exception 'GL carry-down cannot carry control, OBE, or RE accounts'
        using errcode='CLR10';
    end if;
    begin
      select coalesce(sum((x->>'debit_cents')::bigint),0),
             coalesce(sum((x->>'credit_cents')::bigint),0)
        into v_dr,v_cr from jsonb_array_elements(p_lines) x;
    exception when others then
      raise exception 'opening GL amounts are malformed' using errcode='CLR10';
    end;
    if v_dr=v_cr then
      raise exception 'opening GL item has no net carried amount' using errcode='CLR10';
    end if;
    v_amount:=v_dr-v_cr;
    v_lines:=p_lines||jsonb_build_array(jsonb_build_object(
      'account_code',v_obe,
      'debit_cents',case when v_cr>v_dr then v_cr-v_dr else 0 end,
      'credit_cents',case when v_dr>v_cr then v_dr-v_cr else 0 end,
      'description','opening balance equity contra'));
  -- [R1-F9] AMB-4: obe_plug accepts no caller legs. Its signed amount is
  -- posted between the marker-resolved OBE and RE accounts; positive is the
  -- natural equity (credit) polarity, negative is debit. K4/K5 then require
  -- the resulting canonical OBE net to be exactly zero.
  elsif v_kind='obe_plug' then
    if p_lines is not null then
      raise exception 'OBE plug lines are DB-resolved; p_lines must be null'
        using errcode='CLR10';
    end if;
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',v_obe,
        'debit_cents',case when v_amount<0 then -v_amount else 0 end,
        'credit_cents',case when v_amount>0 then v_amount else 0 end,
        'description','opening-balance-equity plug'),
      jsonb_build_object('account_code',v_re,
        'debit_cents',case when v_amount>0 then v_amount else 0 end,
        'credit_cents',case when v_amount<0 then -v_amount else 0 end,
        'description','opening-balance-equity plug contra'));
  elsif v_kind in ('ar_open_item','ap_open_item') then
    select min(account_code),count(*)::int into v_control,v_control_count
      from clara.coa_accounts
      where client_id=p_client and is_active
        and account_class=case when v_kind='ar_open_item'
          then 'receivable' else 'payable' end;
    if v_cp is null or v_control_count<>1 or v_amount<=0 then
      raise exception 'AR/AP opening item identity/control is malformed'
        using errcode='CLR10';
    end if;
    v_cp:=clara._canonical_counterparty(p_client,v_cp);
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',v_control,
        'debit_cents',case when v_kind='ar_open_item' then v_amount else 0 end,
        'credit_cents',case when v_kind='ap_open_item' then v_amount else 0 end,
        'description',coalesce(p_item->>'item_ref',v_key)),
      jsonb_build_object('account_code',v_obe,
        'debit_cents',case when v_kind='ap_open_item' then v_amount else 0 end,
        'credit_cents',case when v_kind='ar_open_item' then v_amount else 0 end,
        'description','opening balance equity contra'));
  elsif v_kind='equity_net' then
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',v_re,
        'debit_cents',case when v_amount<0 then -v_amount else 0 end,
        'credit_cents',case when v_amount>0 then v_amount else 0 end,
        'description','carried retained earnings'),
      jsonb_build_object('account_code',v_obe,
        'debit_cents',case when v_amount>0 then v_amount else 0 end,
        'credit_cents',case when v_amount<0 then -v_amount else 0 end,
        'description','opening balance equity contra'));
  elsif v_kind='fixed_asset' then
    a:=p_item->'asset';
    if jsonb_typeof(a)<>'object' then
      raise exception 'fixed asset baseline is malformed' using errcode='CLR10';
    end if;
    v_method:=coalesce(nullif(a->>'depreciation_method',''),'straight_line');
    if v_method<>'straight_line' then
      raise exception 'non-straight-line depreciation is deferred to Wave D'
        using errcode='CLR31',
          detail='{"reason":"depreciation_method_unsupported"}';
    end if;
    begin
      v_cost:=(a->>'cost_cents')::bigint;
      v_accum:=coalesce((a->>'accumulated_depreciation_cents')::bigint,0);
      v_residual:=coalesce((a->>'residual_cents')::bigint,0);
      v_life:=(a->>'useful_life_months')::int;
    exception when others then
      raise exception 'fixed asset numeric baseline is malformed' using errcode='CLR10';
    end;
    v_asset_code:=nullif(a->>'asset_account_code','');
    v_accum_code:=nullif(a->>'accum_depr_account_code','');
    v_expense_code:=nullif(a->>'depr_expense_account_code','');
    if nullif(btrim(a->>'description'),'') is null
       or nullif(a->>'acquired_date','') is null
       or v_cost<=0 or v_life<=0 or v_accum<0 or v_residual<0
       or v_accum>v_cost-v_residual
       or nullif(a->>'depreciation_start_date','') is null
       or exists(select 1 from (values(v_asset_code),(v_accum_code),(v_expense_code)) q(code)
          where code is null or not exists(select 1 from clara.coa_accounts ca
            where ca.client_id=p_client and ca.account_code=q.code and ca.is_active
              and coalesce(ca.account_class,'') not in ('payable','receivable'))) then
      raise exception 'fixed asset books-grade baseline is incomplete'
        using errcode='CLR10';
    end if;
    v_amount:=v_cost;
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',v_asset_code,'debit_cents',v_cost,
        'credit_cents',0,'description',a->>'description'),
      jsonb_build_object('account_code',v_accum_code,'debit_cents',0,
        'credit_cents',v_accum,'description','carried accumulated depreciation'),
      jsonb_build_object('account_code',v_obe,'debit_cents',0,
        'credit_cents',v_cost-v_accum,
        'description','opening balance equity contra'));
  end if;
  if v_kind='bank_uncleared' and (
      nullif(btrim(p_item->>'item_ref'),'') is null
      or nullif(p_item->>'item_date','') is null) then
    raise exception 'uncleared bank item requires reference and instrument date'
      using errcode='CLR10';
  end if;
  v_lines:=clara._validate_entry_lines(p_client,v_lines);

  insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
      document_id,filing_id,source_doc_sha256,resolution_id,is_opening_balance,
      is_year_end,tax_affecting,maker_actor,last_human_editor,coding_kind,flags)
    values(p_client,'draft',s.as_of,
      case when p_document is null then 'opening carry-down: '||v_key
           else coalesce(nullif(p_item->>'memo',''),'opening carry-down: '||v_key) end,
      'manual',
      p_document,v_filing,p_sha256,p_resolution,true,false,false,p_actor,p_actor,
      null,jsonb_build_object('opening_seed_id',p_seed,'opening_item_key',v_key))
    returning id,revision_token into v_entry,v_token;
  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description,counterparty_id)
    select v_entry,x.idx,x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint,(x.elem->>'credit_cents')::bigint,
      x.elem->>'description',
      case when v_kind in ('ar_open_item','ap_open_item')
        and exists(select 1 from clara.coa_accounts ca where ca.client_id=p_client
          and ca.account_code=x.elem->>'account_code'
          and ca.account_class in ('payable','receivable'))
        then v_cp else null end
    from jsonb_array_elements(v_lines) with ordinality x(elem,idx);
  perform clara._assert_balanced(v_entry);
  -- Journal-line insertion rotates the draft revision token through the
  -- existing touch trigger; the receipt must expose the post-lines token.
  select revision_token into v_token from clara.journal_entries where id=v_entry;

  if v_kind='fixed_asset' then
    a:=p_item->'asset';
    if jsonb_typeof(a)<>'object' then
      raise exception 'fixed asset baseline is malformed' using errcode='CLR10';
    end if;
    v_method:=coalesce(nullif(a->>'depreciation_method',''),'straight_line');
    if v_method<>'straight_line' then
      raise exception 'non-straight-line depreciation is deferred to Wave D'
        using errcode='CLR31',
          detail='{"reason":"depreciation_method_unsupported"}';
    end if;
    begin
      v_cost:=(a->>'cost_cents')::bigint;
      v_accum:=coalesce((a->>'accumulated_depreciation_cents')::bigint,0);
      v_residual:=coalesce((a->>'residual_cents')::bigint,0);
      v_life:=(a->>'useful_life_months')::int;
    exception when others then
      raise exception 'fixed asset numeric baseline is malformed' using errcode='CLR10';
    end;
    v_asset_code:=nullif(a->>'asset_account_code','');
    v_accum_code:=nullif(a->>'accum_depr_account_code','');
    v_expense_code:=nullif(a->>'depr_expense_account_code','');
    if nullif(btrim(a->>'description'),'') is null
       or nullif(a->>'acquired_date','') is null
       or v_cost<=0 or v_life<=0 or v_accum<0 or v_residual<0
       or v_accum>v_cost-v_residual
       or nullif(a->>'depreciation_start_date','') is null
       or exists(select 1 from (values(v_asset_code),(v_accum_code),(v_expense_code)) q(code)
          where code is null or not exists(select 1 from clara.coa_accounts ca
            where ca.client_id=p_client and ca.account_code=q.code and ca.is_active
              and coalesce(ca.account_class,'') not in ('payable','receivable'))) then
      raise exception 'fixed asset books-grade baseline is incomplete'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    -- [R3-F4] Every acquisition entry is still a draft here, so every linked
    -- asset stages pending. Replacement lineage additionally identifies the
    -- old register for K6's atomic switch.
    if v_supersedes_item is not null then
      select old.fixed_asset_id into v_supersedes_asset
      from clara.opening_items old
      where old.id=v_supersedes_item and old.seed_id=p_seed
        and old.client_id=p_client and old.item_kind='fixed_asset'
        and old.state='active';
      if v_supersedes_asset is null then
        raise exception 'fixed-asset replacement lineage is invalid'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
    end if;
    insert into clara.fixed_assets(firm_id,client_id,description,acquired_date,cost_cents,
        residual_cents,useful_life_months,depreciation_method,asset_account_code,
        accum_depr_account_code,depr_expense_account_code,acquisition_entry_id,
        accumulated_depreciation_cents,depreciation_start_date,baseline_as_of,status,
        supersedes_asset_id)
      values(p_firm,p_client,btrim(a->>'description'),(a->>'acquired_date')::date,v_cost,
        v_residual,v_life,'straight_line',v_asset_code,v_accum_code,v_expense_code,
        v_entry,v_accum,(a->>'depreciation_start_date')::date,s.as_of,
        'pending',
        v_supersedes_asset)
      returning id into v_fixed;
  end if;

  insert into clara.opening_items(firm_id,client_id,seed_id,item_kind,item_key,
      entry_id,counterparty_id,fixed_asset_id,item_ref,item_date,amount_cents,
      sst_portion_cents,sst_rate_bp,sst_basis,supersedes_item_id,created_by)
    values(p_firm,p_client,p_seed,v_kind,v_key,v_entry,v_cp,v_fixed,
      nullif(p_item->>'item_ref',''),nullif(p_item->>'item_date','')::date,v_amount,
      nullif(p_item->>'sst_portion_cents','')::bigint,
      nullif(p_item->>'sst_rate_bp','')::int,nullif(p_item->>'sst_basis',''),
      v_supersedes_item,p_actor)
    returning id into v_item;
  insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
      revision_token,actor_kind,actor,reason,header,legs,evidence_refs)
    select e.firm_id,e.client_id,e.id,0,e.revision_token,'human',p_actor,
      'opening carry-down drafted',
      to_jsonb(e)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
      coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
        'account_code',l.account_code,'debit_cents',l.debit_cents,
        'credit_cents',l.credit_cents,'side',case when l.debit_cents>0
          then 'debit' else 'credit' end,'counterparty_id',l.counterparty_id,
        'description',l.description) order by l.line_no)
        from clara.journal_lines l where l.entry_id=e.id),'[]'::jsonb),
      '[]'::jsonb
    from clara.journal_entries e where e.id=v_entry;
  -- [R2-F4] Every opening item author is a material plan contributor. The
  -- private core centralizes the rule for GL, AR/AP, bank, equity, and FA.
  perform clara._record_onboarding_contributor(s.plan_id,p_actor);
  return jsonb_build_object('seed_id',p_seed,'item_id',v_item,
    'entry_id',v_entry,'revision_token',v_token,'fixed_asset_id',v_fixed,
    'status','draft');
exception when unique_violation then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint='uq_opening_items_seed_key' then
    raise exception 'opening item key already exists for this seed'
      using errcode='CLR31',detail='{"reason":"duplicate_seed"}';
  end if;
  raise;
end $$;

create function clara.draft_opening_item(
    p_client uuid,p_seed uuid,p_item jsonb,p_lines jsonb,p_resolution uuid,
    p_document uuid,p_sha256 text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'draft_opening_item',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'seed',p_seed,
      'item',p_item,'lines',p_lines,'resolution',p_resolution,
      'document',p_document,'sha256',p_sha256)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_result:=clara._draft_opening_item_core(c.actor,c.firm,p_client,p_seed,
    p_item,p_lines,p_resolution,p_document,p_sha256);
  perform clara._audit(c.firm,c.actor,null,null,'draft_opening_item',
    (v_result->>'entry_id')::uuid,jsonb_build_object(
      'client',p_client,'seed',p_seed,'item_id',v_result->>'item_id',
      'op_key',p_op_key));
  -- [R5-F1] K3 follows the generic draft-family event shape at the public tail.
  perform clara._append_event(c.firm,'entry.drafted',p_client,c.actor,null,null,
    (v_result->>'entry_id')::uuid,p_document,p_resolution,'{}'::jsonb);
  return clara._finish_op(c.firm,'draft_opening_item',p_op_key,v_result);
end $$;

-- K8 public writer. The jsonb envelope carries the same K3 fields so the
-- fixed-asset mutation remains one atomic human-lane call.
create function clara.seed_fixed_asset(
    p_client uuid,p_seed uuid,p_asset jsonb,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; s record; v_dedupe jsonb; v_item jsonb; v_result jsonb;
  v_resolution uuid; v_document uuid; v_sha text; v_asset jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' or jsonb_typeof(p_asset)<>'object' then
    raise exception 'fixed asset envelope and op_key are required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'seed_fixed_asset',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'seed',p_seed,
      'asset',p_asset)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into s from clara.opening_seed_registry
    where id=p_seed and firm_id=c.firm and client_id=p_client;
  if not found then
    raise exception 'opening seed not in your firm/client' using errcode='CLR11';
  end if;
  v_document:=s.tie_document_id; v_sha:=s.tie_document_sha256;
  if v_document is not null then
    select f.resolution_id into v_resolution from clara.document_filings f
      where f.document_id=v_document and f.client_id=p_client
        and f.retired_at is null order by f.filed_at desc limit 1;
  end if;
  v_asset:=coalesce(p_asset->'asset',p_asset);
  v_item:=jsonb_build_object('item_kind','fixed_asset',
    'item_key',v_asset->>'item_key','amount_cents',v_asset->>'cost_cents',
    'asset',v_asset);
  v_result:=clara._draft_opening_item_core(c.actor,c.firm,p_client,p_seed,
    v_item,null,v_resolution,v_document,v_sha);
  perform clara._audit(c.firm,c.actor,null,null,'seed_fixed_asset',
    (v_result->>'entry_id')::uuid,jsonb_build_object(
      'client',p_client,'seed',p_seed,
      'fixed_asset_id',v_result->>'fixed_asset_id','op_key',p_op_key));
  -- [R5-F1] K8's K3-created draft uses the same human attribution and payload.
  perform clara._append_event(c.firm,'entry.drafted',p_client,c.actor,null,null,
    (v_result->>'entry_id')::uuid,v_document,v_resolution,'{}'::jsonb);
  return clara._finish_op(c.firm,'seed_fixed_asset',p_op_key,v_result);
end $$;

-- K10.
create function clara.trial_balance_as_of(p_client uuid,p_as_of date)
  returns table(account_code text,name text,debit_cents bigint,credit_cents bigint)
  language sql stable security invoker set search_path=clara,pg_temp as $$
  select a.account_code,a.name,
    coalesce(sum(jl.debit_cents) filter(where je.status='approved'
      and je.posting_date<=p_as_of),0)::bigint,
    coalesce(sum(jl.credit_cents) filter(where je.status='approved'
      and je.posting_date<=p_as_of),0)::bigint
  from clara.coa_accounts a
  left join clara.journal_lines jl
    on jl.client_id=a.client_id and jl.account_code=a.account_code
  left join clara.journal_entries je on je.id=jl.entry_id
  where a.client_id=p_client
  group by a.account_code,a.name order by a.account_code;
$$;

-- Actual-vs-target line deltas. Drafts are included for the pre-approval
-- assertion and excluded for the finalized lint watch.
-- [R3-F5] The one canonical tie basis: exact-firm/client approved ledger
-- through as_of plus this exact seed's pending item/reversal drafts,
-- deduplicated by entry id.
-- OBE is present here once, then handled uniformly by the delta/OBE views.
create function clara._opening_seed_basis(p_seed uuid)
  returns table(account_code text,actual_debit bigint,actual_credit bigint)
  language sql stable security definer set search_path=clara,pg_temp as $$
  with seed_cfg as (
    select id seed_id,firm_id,client_id,as_of
    from clara.opening_seed_registry where id=p_seed
  ), candidate_entries as (
    select e.id,e.firm_id,e.client_id from seed_cfg s
    join clara.journal_entries e on e.client_id=s.client_id
      and e.firm_id=s.firm_id
    where e.status='approved' and e.posting_date<=s.as_of
    union
    select e.id,e.firm_id,e.client_id from seed_cfg s
    join clara.journal_entries e on e.client_id=s.client_id
      and e.firm_id=s.firm_id
    where e.status='draft' and e.posting_date<=s.as_of and (
      exists(select 1 from clara.opening_items oi
        where oi.seed_id=s.seed_id and oi.firm_id=s.firm_id
          and oi.client_id=s.client_id and oi.entry_id=e.id)
      or exists(select 1 from clara.opening_items oi
        where oi.seed_id=s.seed_id and oi.firm_id=s.firm_id
          and oi.client_id=s.client_id and oi.entry_id=e.reversal_of))
  ), actual_net as (
    select l.account_code,
      sum(l.debit_cents-l.credit_cents)::bigint net
    from candidate_entries ce
    join clara.journal_lines l on l.entry_id=ce.id
      and l.firm_id=ce.firm_id and l.client_id=ce.client_id
    group by l.account_code
  )
  select account_code,greatest(net,0)::bigint,
    greatest(-net,0)::bigint from actual_net
  order by account_code;
$$;

-- Compatibility signature retained: p_include_drafts is deliberately ignored
-- because dry-run, K5/K6, and L4 must consume the identical canonical basis.
create function clara._opening_seed_deltas(p_seed uuid,p_include_drafts boolean)
  returns table(account_code text,target_debit bigint,target_credit bigint,
    actual_debit bigint,actual_credit bigint,delta_debit bigint,delta_credit bigint)
  language sql stable security definer set search_path=clara,pg_temp as $$
  with target_net as (
    select t.account_code,
      sum(t.debit_cents-t.credit_cents)::bigint net
    from clara.opening_seed_registry s
    join clara.opening_tb_targets t on t.seed_id=s.id
      and t.firm_id=s.firm_id and t.client_id=s.client_id
    where s.id=p_seed
    group by t.account_code
  ), target as (
    select account_code,greatest(net,0)::bigint debit,
      greatest(-net,0)::bigint credit
    from target_net
  ), actual as (
    select b.account_code,b.actual_debit debit,b.actual_credit credit
    from clara._opening_seed_basis(p_seed) b
    join clara.opening_seed_registry s on s.id=p_seed
    join clara.coa_accounts ca on ca.client_id=s.client_id
      and ca.account_code=b.account_code
    where ca.special_acc_type is distinct from 'opening_balance_equity'
  )
  select coalesce(t.account_code,a.account_code),
    coalesce(t.debit,0),coalesce(t.credit,0),
    coalesce(a.debit,0),coalesce(a.credit,0),
    coalesce(a.debit,0)-coalesce(t.debit,0),
    coalesce(a.credit,0)-coalesce(t.credit,0)
  from target t full join actual a using(account_code)
  order by coalesce(t.account_code,a.account_code);
$$;

create function clara._opening_seed_obe_net(p_seed uuid) returns bigint
  language sql stable security definer set search_path=clara,pg_temp as $$
  select coalesce(sum(b.actual_debit-b.actual_credit),0)::bigint
  from clara._opening_seed_basis(p_seed) b
  join clara.opening_seed_registry s on s.id=p_seed
  join clara.coa_accounts ca on ca.client_id=s.client_id
    and ca.account_code=b.account_code
  where ca.special_acc_type='opening_balance_equity';
$$;

create function clara._assert_opening_tie(p_seed uuid) returns void
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare s record; v_obe text; v_net bigint;
begin
  select * into s from clara.opening_seed_registry where id=p_seed;
  if not found then raise exception 'opening seed not found' using errcode='CLR11'; end if;
  if not exists(select 1 from clara.opening_tb_targets t
       where t.seed_id=s.id and t.firm_id=s.firm_id
         and t.client_id=s.client_id)
     or exists(select 1 from clara.opening_tb_targets t
       where t.seed_id=s.id and t.firm_id=s.firm_id
         and t.client_id=s.client_id and t.account_code is null)
     or exists(select 1 from clara._opening_seed_deltas(p_seed,true)
       where delta_debit<>0 or delta_credit<>0) then
    raise exception 'opening trial balance does not tie to the target'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
  select account_code into v_obe from clara.coa_accounts
    where client_id=s.client_id and special_acc_type='opening_balance_equity';
  select clara._opening_seed_obe_net(p_seed) into v_net;
  if v_net<>0 then
    raise exception 'opening-balance-equity is not nil'
      using errcode='CLR31',detail='{"reason":"obe_not_nil"}';
  end if;
end $$;

create function clara._assert_fa_baseline(p_seed uuid) returns void
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
begin
  if exists(
    select 1 from clara.opening_seed_registry s
    join clara.opening_items oi on oi.seed_id=s.id
      and oi.firm_id=s.firm_id and oi.client_id=s.client_id
    join clara.fixed_assets fa on fa.id=oi.fixed_asset_id
      and fa.firm_id=oi.firm_id and fa.client_id=oi.client_id
    join clara.journal_entries je on je.id=oi.entry_id
      and je.firm_id=oi.firm_id and je.client_id=oi.client_id
    where s.id=p_seed and oi.item_kind='fixed_asset' and (
      fa.acquisition_entry_id is distinct from oi.entry_id
      or fa.baseline_as_of is distinct from s.as_of
      or fa.cost_cents is null or fa.cost_cents<=0
      or fa.accumulated_depreciation_cents>fa.cost_cents-coalesce(fa.residual_cents,0)
      -- [R3-F4] Current draft assets are pending and current approved assets
      -- are active. Superseded item/asset pairs remain historical.
      or not (
        (oi.state='active' and (
          (je.status='draft' and fa.status='pending')
          or (je.status='approved' and fa.status='active')))
        or (oi.state='superseded' and je.status='approved'
          and fa.status='superseded'))
      or coalesce((select sum(l.debit_cents) from clara.journal_lines l
          where l.entry_id=oi.entry_id
            and l.firm_id=oi.firm_id and l.client_id=oi.client_id
            and l.account_code=fa.asset_account_code),0)<>fa.cost_cents
      or coalesce((select sum(l.credit_cents) from clara.journal_lines l
          where l.entry_id=oi.entry_id
            and l.firm_id=oi.firm_id and l.client_id=oi.client_id
            and l.account_code=fa.accum_depr_account_code),0)
          <>fa.accumulated_depreciation_cents
    )) then
    raise exception 'fixed-asset opening baseline does not tie'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
end $$;

create function clara.get_opening_dryrun(p_seed uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; s record; v_obe text; v_net bigint;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  select * into s from clara.opening_seed_registry where id=p_seed;
  if not found or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  select account_code into v_obe from clara.coa_accounts where client_id=s.client_id
    and special_acc_type='opening_balance_equity';
  select clara._opening_seed_obe_net(p_seed) into v_net;
  return jsonb_build_object('seed_id',p_seed,'client_id',s.client_id,
    'as_of',s.as_of,'state',s.state,'obe_net_cents',v_net,
    'deltas',coalesce((select jsonb_agg(to_jsonb(d) order by d.account_code)
      from clara._opening_seed_deltas(p_seed,true) d),'[]'::jsonb),
    'unmapped_labels',coalesce((select jsonb_agg(jsonb_build_object(
      'line_key',t.line_key,'source_label',t.source_label) order by t.line_key)
      from clara.opening_tb_targets t where t.seed_id=p_seed
        and t.account_code is null),'[]'::jsonb),
    'missing_must_asks',coalesce((select jsonb_agg(jsonb_build_object(
      'item_key',i.item_key,'question',i.question) order by i.item_key)
      from clara.onboarding_plan_items i where i.plan_id=s.plan_id
        and i.required_for_commit and i.state not in ('answered','resolved')),
      '[]'::jsonb));
end $$;

create function clara._opening_revision_matches(
    p_revisions jsonb,p_entry uuid,p_token uuid) returns boolean
  language plpgsql immutable security definer set search_path=clara,pg_temp as $$
declare v text;
begin
  if jsonb_typeof(p_revisions)='object' then
    v:=p_revisions->>p_entry::text;
  elsif jsonb_typeof(p_revisions)='array' then
    select x->>'revision_token' into v from jsonb_array_elements(p_revisions) x
      where x->>'entry_id'=p_entry::text limit 1;
  else
    return false;
  end if;
  return v is not null and v::uuid=p_token;
exception when others then return false;
end $$;

-- Dedicated approval core: no sightings, no kb_rule proposal loop.
create function clara._approve_opening_entry(
    p_seed uuid,p_entry uuid,p_checker uuid,p_attestation text,p_batch_n int)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare e record; s record; v_attest text; v_kind text; v_item uuid;
begin
  select * into s from clara.opening_seed_registry where id=p_seed;
  select * into e from clara.journal_entries where id=p_entry for update;
  if not found or e.firm_id<>s.firm_id or e.client_id<>s.client_id
     or e.status<>'draft' or not e.is_opening_balance then
    raise exception 'opening entry is not an approvable draft'
      using errcode='CLR31',detail='{"reason":"revision_mismatch"}';
  end if;
  if e.last_human_editor=p_checker then
    if clara.eligible_checker_count(s.firm_id)>=2 then
      raise exception 'opening entry needs a distinct checker'
        using errcode='CLR05',detail='{"reason":"distinct_checker"}';
    elsif nullif(btrim(p_attestation),'') is null then
      raise exception 'solo opening approval requires an attestation'
        using errcode='CLR05',detail='{"reason":"self_attestation"}';
    else
      v_attest:=p_attestation; v_kind:='self_approval_attestation';
    end if;
  else
    v_kind:='distinct_checker';
  end if;
  update clara.journal_entries set status='approved',checker_actor=p_checker,
    approved_at=now(),self_approval_attestation=v_attest,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'opening supersede'),
      updated_at=now() where id=e.reversal_of and reversed_by is null;
  end if;
  select id into v_item from clara.opening_items where entry_id=p_entry;
  insert into clara.opening_seed_approvals(
      firm_id,client_id,seed_id,batch_n,entry_id,item_id,checker,attestation_kind)
    values(s.firm_id,s.client_id,p_seed,p_batch_n,p_entry,v_item,p_checker,v_kind);
  return jsonb_build_object('entry_id',p_entry,'item_id',v_item,
    'attestation_kind',v_kind);
end $$;

create function clara.approve_opening_seed(
    p_seed uuid,p_expected_plan_revision uuid,p_tie_document_sha256 text,
    p_entry_revisions jsonb,p_attestation text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; s record; p record; e record; q record; v_dedupe jsonb;
  v_batch int; v_entries jsonb:='[]'::jsonb; v_result jsonb; v_seq bigint;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if current_setting('transaction_isolation')<>'serializable' then
    raise exception 'opening batch approval requires serializable isolation'
      using errcode='CLR31',detail='{"reason":"not_serializable"}';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select firm_id into s from clara.opening_seed_registry where id=p_seed;
  if s.firm_id is null or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_opening_seed',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,
      'plan_revision',p_expected_plan_revision,
      'tie_sha256',p_tie_document_sha256,
      'entry_revisions',p_entry_revisions,'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(s.client_id::text));
  select * into p from clara.onboarding_plans where id=s.plan_id for update;
  if p.revision_token is distinct from p_expected_plan_revision then
    raise exception 'stale onboarding plan revision'
      using errcode='CLR31',detail='{"reason":"stale_plan"}';
  end if;
  if s.tie_document_id is not null then
    if p_tie_document_sha256 is distinct from s.tie_document_sha256 then
      raise exception 'tie document hash changed'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    perform clara._active_document_filing(
      s.tie_document_id,s.tie_document_sha256,s.client_id,true);
    -- [R1-F2] A tied registry is wholly document-primary. Every target must
    -- carry the exact tie identity/hash and resolve to stored extraction rows.
    if exists(select 1 from clara.opening_tb_targets t
        where t.seed_id=s.id and t.firm_id=s.firm_id
          and t.client_id=s.client_id and (
          t.provenance_kind<>'document'
          or t.document_id is distinct from s.tie_document_id
          or t.source_sha256 is distinct from s.tie_document_sha256
          or t.extraction_ref is null)) then
      raise exception 'every opening target must bind to the tie document'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    -- [R2-F1] K5 re-runs the field-level fact comparison so a stale extraction
    -- or any target mutation cannot be laundered between parse and approval.
    for q in select extraction_ref,account_code,debit_cents,credit_cents
        from clara.opening_tb_targets t
        where t.seed_id=s.id and t.firm_id=s.firm_id
          and t.client_id=s.client_id
          and t.document_id=s.tie_document_id loop
      perform clara._assert_opening_target_fact(
        s.firm_id,s.tie_document_id,q.extraction_ref,
        q.account_code,q.debit_cents,q.credit_cents);
    end loop;
  elsif exists(select 1 from clara.opening_tb_targets t
      where t.seed_id=s.id and t.firm_id=s.firm_id
        and t.client_id=s.client_id and (
        t.provenance_kind<>'keyed' or t.entered_by is null
        or t.document_id is not null or t.source_sha256 is not null
        or t.extraction_ref is not null
        or not exists(select 1 from clara.firm_memberships m
          where m.firm_id=s.firm_id and m.user_id=t.entered_by
            and m.status='active'
            and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')))) then
    -- [R1-F2] The no-document fallback is wholly keyed and attributable to a
    -- currently eligible firm professional.
    raise exception 'keyed fallback requires every target to be attributed'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
  if not exists(select 1 from clara.opening_items oi
      join clara.journal_entries je on je.id=oi.entry_id
      where oi.seed_id=p_seed and je.status='draft') then
    raise exception 'opening seed has no draft entries'
      using errcode='CLR31',detail='{"reason":"revision_mismatch"}';
  end if;
  for e in select je.* from clara.opening_items oi
      join clara.journal_entries je on je.id=oi.entry_id
      where oi.seed_id=p_seed and je.status='draft' order by oi.item_key loop
    -- [R1-F2] Revalidate each draft's active filing and immutable content hash
    -- at K5, rather than trusting evidence captured when K3 drafted it.
    if s.tie_document_id is not null then
      if e.document_id is distinct from s.tie_document_id
         or e.source_doc_sha256 is distinct from s.tie_document_sha256 then
        raise exception 'opening entry no longer binds to the tie document'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
      perform clara._active_document_filing(
        e.document_id,e.source_doc_sha256,s.client_id,true);
    elsif e.document_id is not null or e.filing_id is not null
       or e.source_doc_sha256 is not null then
      raise exception 'keyed opening fallback cannot contain a document entry'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    if not clara._opening_revision_matches(
        p_entry_revisions,e.id,e.revision_token) then
      raise exception 'opening entry revision mismatch'
        using errcode='CLR31',detail=jsonb_build_object(
          'reason','revision_mismatch','entry_id',e.id)::text;
    end if;
    -- K5 step order (battery DEF-1): the checker separation is verified HERE, with
    -- the revisions, BEFORE the tie assert. _approve_opening_entry re-checks as
    -- defense-in-depth (same CLR05 semantics).
    if e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'opening entry needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif nullif(btrim(p_attestation),'') is null then
        raise exception 'solo opening approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      end if;
    end if;
  end loop;
  select * into q from clara._open_question_blocks(s.client_id,null,null) limit 1;
  if found then
    raise exception 'an open question blocks the opening batch'
      using errcode='CLR26',detail=jsonb_build_object(
        'question_id',q.question_id,'scope',q.scope_kind)::text;
  end if;
  perform clara._assert_opening_tie(p_seed);
  perform clara._assert_fa_baseline(p_seed);
  v_batch:=s.batch_n+1;
  for e in select je.* from clara.opening_items oi
      join clara.journal_entries je on je.id=oi.entry_id
      where oi.seed_id=p_seed and je.status='draft' order by oi.item_key loop
    v_entries:=v_entries||clara._approve_opening_entry(
      p_seed,e.id,c.actor,p_attestation,v_batch);
  end loop;
  -- [R3-F4] K5 publishes initial register rows only after every linked
  -- acquisition entry has approved in this same transaction. Correction
  -- replacements remain K6-only because they carry supersedes_asset_id.
  update clara.fixed_assets fa set status='active',updated_at=now()
  from clara.opening_items oi,clara.journal_entries je
  where oi.seed_id=p_seed and oi.item_kind='fixed_asset'
    and oi.state='active' and oi.supersedes_item_id is null
    and oi.firm_id=s.firm_id and oi.client_id=s.client_id
    and fa.id=oi.fixed_asset_id and fa.firm_id=oi.firm_id
    and fa.client_id=oi.client_id and fa.status='pending'
    and fa.supersedes_asset_id is null
    and je.id=oi.entry_id and je.firm_id=oi.firm_id
    and je.client_id=oi.client_id and je.status='approved';
  perform clara._assert_fa_baseline(p_seed);
  update clara.onboarding_plan_items set state='resolved',
    answer=coalesce(answer,jsonb_build_object('source','opening_seed',
      'seed_id',p_seed)),answered_by=coalesce(answered_by,c.actor),
    answered_at=coalesce(answered_at,now()),updated_at=now()
    where plan_id=s.plan_id and item_kind='capture'
      and state in ('pending','answered');
  -- [R3-F3] Conservative checker policy: checking a K5 set influences that
  -- plan, so the checker is recorded through the same contributor effect used
  -- at every other material boundary.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  select coalesce(max(seq),0) into v_seq from clara.domain_events
    where firm_id=c.firm;
  update clara.opening_seed_registry set state='finalized',batch_n=v_batch,
    finalized_at=now(),finalized_by=c.actor,tie_asserted_at=now(),
    through_event_seq=v_seq where id=p_seed;
  perform clara._audit(c.firm,c.actor,null,null,'approve_opening_seed',null,
    jsonb_build_object('seed',p_seed,'batch_n',v_batch,
      'entries',v_entries,'op_key',p_op_key));
  for e in select je.* from clara.opening_seed_approvals a
      join clara.journal_entries je on je.id=a.entry_id
      where a.seed_id=p_seed and a.batch_n=v_batch order by a.id loop
    perform clara._append_event(c.firm,'entry.approved',s.client_id,c.actor,
      null,null,e.id,e.document_id,null,
      jsonb_build_object('opening_seed_id',p_seed,'batch_n',v_batch));
  end loop;
  perform clara._append_event(c.firm,'opening_seed.batch_approved',s.client_id,
    c.actor,null,null,null,s.tie_document_id,null,
    jsonb_build_object('seed_id',p_seed,'batch_n',v_batch,
      'entry_count',jsonb_array_length(v_entries)));
  v_result:=jsonb_build_object('seed_id',p_seed,'status','finalized',
    'batch_n',v_batch,'entries',v_entries);
  return clara._finish_op(c.firm,'approve_opening_seed',p_op_key,v_result);
end $$;

create function clara.reopen_opening_seed(
    p_seed uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; s record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and reopen reason are required' using errcode='CLR10';
  end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if not found or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'reopen_opening_seed',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if s.state<>'finalized' then
    raise exception 'only a finalized opening seed may be reopened'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  update clara.opening_seed_registry set state='open',finalized_at=null,
    finalized_by=null,tie_asserted_at=null,through_event_seq=null where id=p_seed;
  -- [R3-F3] Reopening the carry-down set changes the plan's review surface.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  perform clara._audit(c.firm,c.actor,null,null,'reopen_opening_seed',null,
    jsonb_build_object('seed',p_seed,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'opening_seed.reopened',s.client_id,
    c.actor,null,null,null,s.tie_document_id,null,
    jsonb_build_object('seed_id',p_seed,'reason',btrim(p_reason)));
  v_result:=jsonb_build_object('seed_id',p_seed,'status','open',
    'next_batch_n',s.batch_n+1);
  return clara._finish_op(c.firm,'reopen_opening_seed',p_op_key,v_result);
end $$;

create function clara.supersede_opening_item(
    p_item uuid,p_replacement jsonb,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; oi record; s record; e record; v_dedupe jsonb; v_rev uuid;
  v_token uuid; v_replacement jsonb; v_replacement_item uuid; v_reversal_item uuid;
  v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into oi from clara.opening_items where id=p_item for update;
  if not found or oi.firm_id<>c.firm then
    raise exception 'opening item not in your firm' using errcode='CLR11';
  end if;
  select * into s from clara.opening_seed_registry where id=oi.seed_id for update;
  if oi.state<>'active' or s.state<>'finalized' then
    raise exception 'opening item correction requires a finalized seed'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  select * into e from clara.journal_entries where id=oi.entry_id for update;
  if e.status<>'approved' or e.reversed_by is not null then
    raise exception 'opening item is not correctable'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'supersede_opening_item',p_op_key,
    clara._hash(jsonb_build_object('item',p_item,'replacement',p_replacement)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- K6 opens its own correction batch. K12's explicit reopen verb remains the
  -- distinct additive-carry path for newly-arrived items.
  update clara.opening_seed_registry set state='open',finalized_at=null,
    finalized_by=null,tie_asserted_at=null,through_event_seq=null
    where id=s.id;
  insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
      document_id,filing_id,source_doc_sha256,resolution_id,is_opening_balance,
      is_year_end,tax_affecting,maker_actor,last_human_editor,reversal_of,
      reversal_reason,flags)
    values(e.client_id,'draft',s.as_of,'opening supersede: '||oi.item_key,
      'reversal',e.document_id,e.filing_id,e.source_doc_sha256,e.resolution_id,
      true,false,false,c.actor,c.actor,e.id,'opening supersede',
      jsonb_build_object('opening_seed_id',s.id,'supersedes_item_id',p_item))
    returning id,revision_token into v_rev,v_token;
  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description,counterparty_id)
    select v_rev,l.line_no,l.account_code,l.credit_cents,l.debit_cents,
      'reversal: '||coalesce(l.description,''),l.counterparty_id
    from clara.journal_lines l where l.entry_id=e.id order by l.line_no;
  perform clara._assert_balanced(v_rev);
  select revision_token into v_token from clara.journal_entries where id=v_rev;
  insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
      revision_token,actor_kind,actor,reason,header,legs,evidence_refs)
    select r.firm_id,r.client_id,r.id,0,r.revision_token,'human',c.actor,
      'opening supersede reversal drafted',
      to_jsonb(r)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no)
        from clara.journal_lines l where l.entry_id=r.id),'[]'::jsonb),'[]'::jsonb
    from clara.journal_entries r where r.id=v_rev;
  if p_replacement is not null and p_replacement<>'null'::jsonb then
    if jsonb_typeof(p_replacement)<>'object' then
      raise exception 'opening replacement is malformed' using errcode='CLR10';
    end if;
    -- [R1-F10] The public K6 envelope keeps the books-grade asset baseline
    -- beside `item`; fold it into the private item's canonical shape.
    v_replacement:=clara._draft_opening_item_core(c.actor,c.firm,s.client_id,s.id,
      (p_replacement->'item')
        ||case when p_replacement ? 'asset'
          then jsonb_build_object('asset',p_replacement->'asset')
          else '{}'::jsonb end
        ||jsonb_build_object('supersedes_item_id',p_item),
      p_replacement->'lines',
      coalesce(nullif(p_replacement->>'resolution_id','')::uuid,e.resolution_id),
      coalesce(nullif(p_replacement->>'document_id','')::uuid,e.document_id),
      coalesce(nullif(p_replacement->>'source_sha256',''),e.source_doc_sha256));
    v_replacement_item:=(v_replacement->>'item_id')::uuid;
  else
    if oi.item_kind='fixed_asset' then
      raise exception 'a fixed-asset supersede requires a replacement baseline'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    insert into clara.opening_items(firm_id,client_id,seed_id,item_kind,item_key,
        entry_id,counterparty_id,item_ref,item_date,amount_cents,
        sst_portion_cents,sst_rate_bp,sst_basis,supersedes_item_id,created_by)
      values(c.firm,s.client_id,s.id,oi.item_kind,
        'reversal:'||oi.item_key||':'||(s.batch_n+1)::text,v_rev,oi.counterparty_id,
        oi.item_ref,oi.item_date,-oi.amount_cents,oi.sst_portion_cents,
        oi.sst_rate_bp,oi.sst_basis,p_item,c.actor)
      returning id into v_reversal_item;
    v_replacement_item:=v_reversal_item;
  end if;
  -- [R3-F3] The public supersede boundary is material even when the replacement
  -- is NULL. This unconditional call closes the pure-reversal laundering path;
  -- replacement drafts have already recorded the same actor idempotently.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  perform clara._audit(c.firm,c.actor,null,null,'supersede_opening_item',v_rev,
    jsonb_build_object('seed',s.id,'old_item',p_item,
      'replacement_item',v_replacement_item,'op_key',p_op_key));
  -- [R5-F1] The audit precedes the consecutive event tail: reversal first,
  -- then the optional replacement, matching their creation order.
  perform clara._append_event(c.firm,'entry.drafted',s.client_id,c.actor,null,null,
    v_rev,e.document_id,e.resolution_id,'{}'::jsonb);
  if v_replacement is not null then
    perform clara._append_event(c.firm,'entry.drafted',s.client_id,c.actor,null,null,
      (v_replacement->>'entry_id')::uuid,
      coalesce(nullif(p_replacement->>'document_id','')::uuid,e.document_id),
      coalesce(nullif(p_replacement->>'resolution_id','')::uuid,e.resolution_id),
      '{}'::jsonb);
  end if;
  v_result:=jsonb_build_object('seed_id',s.id,'old_item_id',p_item,
    'reversal_entry_id',v_rev,'reversal_revision_token',v_token,
    'replacement_item_id',v_replacement_item,
    'replacement_entry_id',v_replacement->>'entry_id','status','draft');
  return clara._finish_op(c.firm,'supersede_opening_item',p_op_key,v_result);
end $$;

create function clara.approve_opening_correction(
    p_seed uuid,p_entry_revisions jsonb,p_attestation text,p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare
  c record; s record; e record; q record; oi record; v_dedupe jsonb;
  v_batch int; v_entries jsonb:='[]'::jsonb; v_result jsonb; v_replacement uuid;
  v_asset_transition_count int;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if current_setting('transaction_isolation')<>'serializable' then
    raise exception 'opening correction approval requires serializable isolation'
      using errcode='CLR31',detail='{"reason":"not_serializable"}';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select firm_id into s from clara.opening_seed_registry where id=p_seed;
  if s.firm_id is null or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_opening_correction',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,
      'entry_revisions',p_entry_revisions,'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(s.client_id::text));
  select * into q from clara._open_question_blocks(s.client_id,null,null) limit 1;
  if found then
    raise exception 'an open question blocks the opening correction'
      using errcode='CLR26',detail=jsonb_build_object(
        'question_id',q.question_id,'scope',q.scope_kind)::text;
  end if;
  if not exists(select 1 from clara.journal_entries je
      where je.status='draft' and je.is_opening_balance and (
        exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.id and x.supersedes_item_id is not null)
        or exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.reversal_of))) then
    raise exception 'opening correction has no draft entries'
      using errcode='CLR31',detail='{"reason":"revision_mismatch"}';
  end if;
  for e in select je.* from clara.journal_entries je
      where je.status='draft' and je.is_opening_balance and (
        exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.id and x.supersedes_item_id is not null)
        or exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.reversal_of)) order by je.id loop
    if not clara._opening_revision_matches(
        p_entry_revisions,e.id,e.revision_token) then
      raise exception 'opening correction revision mismatch'
        using errcode='CLR31',detail=jsonb_build_object(
          'reason','revision_mismatch','entry_id',e.id)::text;
    end if;
    -- [R1-F12] K6 mirrors K5: checker separation is preflighted for every
    -- correction draft before any tie or fixed-asset assertion can run.
    if e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'opening correction needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif nullif(btrim(p_attestation),'') is null then
        raise exception 'solo opening correction requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      end if;
    end if;
  end loop;
  perform clara._assert_opening_tie(p_seed);
  perform clara._assert_fa_baseline(p_seed);
  v_batch:=s.batch_n+1;
  for e in select je.* from clara.journal_entries je
      where je.status='draft' and je.is_opening_balance and (
        exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.id and x.supersedes_item_id is not null)
        or exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.reversal_of)) order by je.id loop
    v_entries:=v_entries||clara._approve_opening_entry(
      p_seed,e.id,c.actor,p_attestation,v_batch);
  end loop;
  for oi in select old.* from clara.opening_items old
      where old.seed_id=p_seed and old.state='active'
        and exists(select 1 from clara.opening_items repl
          where repl.seed_id=p_seed and repl.supersedes_item_id=old.id
            and exists(select 1 from clara.journal_entries je
              where je.id=repl.entry_id and je.status='approved')) loop
    select id into v_replacement from clara.opening_items
      where seed_id=p_seed and supersedes_item_id=oi.id
      order by created_at desc,id desc limit 1;
    update clara.opening_items set state='superseded',
      superseded_by_item=v_replacement where id=oi.id;
    -- [R2-F3] One SQL statement performs the register hand-off: the pending
    -- replacement becomes active exactly as the predecessor becomes
    -- superseded. A two-row count is required; partial transitions abort.
    if oi.fixed_asset_id is not null then
      update clara.fixed_assets fa set
        status=case when fa.id=oi.fixed_asset_id
          then 'superseded' else 'active' end,
        superseded_by_asset_id=case when fa.id=oi.fixed_asset_id
          then repl.fixed_asset_id else null end,
        updated_at=now()
      from clara.opening_items repl
      where repl.id=v_replacement and repl.fixed_asset_id is not null
        and fa.id in (oi.fixed_asset_id,repl.fixed_asset_id)
        and ((fa.id=oi.fixed_asset_id and fa.status='active')
          or (fa.id=repl.fixed_asset_id and fa.status='pending'));
      get diagnostics v_asset_transition_count=row_count;
      if v_asset_transition_count<>2 then
        raise exception 'fixed-asset replacement transition is incomplete'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
    end if;
  end loop;
  -- [R3-F3] K5 and K6 use one checker policy: approving either set records the
  -- checker as a contributor before the plan can be used at Gate O.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  -- [R3-F4] Re-check the post-hand-off correspondence in the same transaction.
  perform clara._assert_fa_baseline(p_seed);
  update clara.opening_seed_registry set state='finalized',batch_n=v_batch,
    finalized_at=now(),finalized_by=c.actor,tie_asserted_at=now(),
    through_event_seq=(select coalesce(max(seq),0) from clara.domain_events
      where firm_id=c.firm) where id=p_seed;
  perform clara._audit(c.firm,c.actor,null,null,'approve_opening_correction',null,
    jsonb_build_object('seed',p_seed,'batch_n',v_batch,
      'entries',v_entries,'op_key',p_op_key));
  for e in select je.* from clara.opening_seed_approvals a
      join clara.journal_entries je on je.id=a.entry_id
      where a.seed_id=p_seed and a.batch_n=v_batch order by a.id loop
    perform clara._append_event(c.firm,'entry.approved',s.client_id,c.actor,
      null,null,e.id,e.document_id,null,
      jsonb_build_object('opening_seed_id',p_seed,'batch_n',v_batch,
        'correction',true));
    if e.reversal_of is not null then
      perform clara._append_event(c.firm,'entry.reversed',s.client_id,c.actor,
        null,null,e.reversal_of,null,null,
        jsonb_build_object('opening_seed_id',p_seed));
    end if;
  end loop;
  for oi in select * from clara.opening_items where seed_id=p_seed
      and state='superseded'
      and superseded_by_item in (select item_id from clara.opening_seed_approvals
        where seed_id=p_seed and batch_n=v_batch) loop
    perform clara._append_event(c.firm,'opening_item.superseded',s.client_id,
      c.actor,null,null,oi.entry_id,null,null,jsonb_build_object(
        'seed_id',p_seed,'item_id',oi.id,
        'superseded_by_item',oi.superseded_by_item,'batch_n',v_batch));
  end loop;
  v_result:=jsonb_build_object('seed_id',p_seed,'status','finalized',
    'batch_n',v_batch,'entries',v_entries);
  return clara._finish_op(c.firm,'approve_opening_correction',p_op_key,v_result);
end $$;

-- =====================================================================
-- B5 — S: PRIOR-GL SEEDING PROPOSALS + ONE-TICK/ONE-SIGNATURE CEREMONY.
-- =====================================================================

create function clara.create_seeding_batch(
    p_client uuid,p_document uuid,p_proposals jsonb,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  d record; cl record; v_dedupe jsonb; v_batch uuid; j jsonb; v_key text;
  v_kind text; v_state text; v_reason text; v_count int:=0; v_refused int:=0;
  v_account text; v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key)='' or jsonb_typeof(p_proposals)<>'array' then
    raise exception 'seeding proposals and op_key are required' using errcode='CLR10';
  end if;
  select doc.*,f.client_id into d from clara.documents doc
    join clara.document_filings f on f.document_id=doc.id
      and f.client_id=p_client and f.retired_at is null
    where doc.id=p_document and doc.bytes_verified_at is not null;
  if not found then
    raise exception 'seeding source is not actively filed and verified'
      using errcode='CLR02';
  end if;
  select * into cl from clara.clients where id=p_client and firm_id=d.firm_id;
  if not found or cl.status not in ('active','onboarding') then
    raise exception 'seeding requires an active or onboarding client'
      using errcode='CLR10';
  end if;
  if d.document_kind='consent_evidence' then
    raise exception 'consent evidence cannot feed prior-GL seeding' using errcode='CLR28';
  end if;
  if d.document_kind not in ('prior_gl','management_account') then
    raise exception 'seeding source is not prior GL'
      using errcode='CLR34',detail='{"reason":"not_prior_gl"}';
  end if;
  v_dedupe:=clara._reserve_op(d.firm_id,'create_seeding_batch',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'document',p_document,
      'proposals',p_proposals)));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    insert into clara.seeding_batches(firm_id,client_id,source_document_id,
        source_sha256,stats)
      values(d.firm_id,p_client,p_document,d.sha256,'{}'::jsonb)
      returning id into v_batch;
  exception when unique_violation then
    raise exception 'an open seeding batch already exists for this source'
      using errcode='CLR34',detail='{"reason":"duplicate_batch"}';
  end;
  for j in select value from jsonb_array_elements(p_proposals) loop
    v_kind:=j->>'proposal_kind';
    v_key:=nullif(btrim(j->>'proposal_key'),'');
    if v_kind not in ('vendor_account_rule','counterparty_birth','wiki_fact')
       or v_key is null or jsonb_typeof(j->'payload')<>'object'
       or jsonb_typeof(j->'evidence')<>'object' then
      raise exception 'seeding proposal is malformed' using errcode='CLR10';
    end if;
    v_state:='proposed'; v_reason:=null;
    if v_kind='vendor_account_rule' then
      v_account:=nullif(j->'payload'->>'account_code','');
      if v_account is null or not exists(select 1 from clara.coa_accounts a
          where a.client_id=p_client and a.account_code=v_account and a.is_active) then
        raise exception 'seeded rule target account is missing' using errcode='CLR10';
      end if;
      if exists(select 1 from clara.coa_accounts a where a.client_id=p_client
          and a.account_code=v_account
          and a.account_class in ('payable','receivable')) then
        v_state:='refused'; v_reason:='control_account'; v_refused:=v_refused+1;
      end if;
    end if;
    insert into clara.seeding_proposals(batch_id,firm_id,client_id,proposal_kind,
        proposal_key,payload,evidence,state,decided_at,refuse_reason)
      values(v_batch,d.firm_id,p_client,v_kind,v_key,j->'payload',j->'evidence',
        v_state,case when v_state='refused' then now() end,v_reason);
    v_count:=v_count+1;
  end loop;
  update clara.seeding_batches set stats=jsonb_build_object(
    'proposal_count',v_count,'refused_count',v_refused,
    'source_document_id',p_document) where id=v_batch;
  perform clara._audit(d.firm_id,null,null,null,'create_seeding_batch',null,
    jsonb_build_object('client',p_client,'document',p_document,'batch',v_batch,
      'proposal_count',v_count,'refused_count',v_refused,'op_key',p_op_key));
  perform clara._append_event(d.firm_id,'seeding.batch_created',p_client,
    null,null,null,null,p_document,null,jsonb_build_object(
      'batch_id',v_batch,'proposal_count',v_count,'refused_count',v_refused,
      'source_sha256',d.sha256));
  v_result:=jsonb_build_object('batch_id',v_batch,'client_id',p_client,
    'proposal_count',v_count,'refused_count',v_refused,'status','open',
    'wiki_ingest_required',true,'wiki_source_document_id',p_document);
  return clara._finish_op(d.firm_id,'create_seeding_batch',p_op_key,v_result);
end $$;

create function clara.tick_seeding_proposal(p_proposal uuid,p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path=clara,pg_temp as $$
declare
  c record; sp record; b record; v_dedupe jsonb; v_cp uuid; v_rule uuid;
  v_proposal jsonb; v_fp jsonb; v_name text; v_name_n text; v_reg text;
  v_reg_n text; v_tin text; v_account text; v_created boolean:=false;
  a jsonb; v_alias text; v_result jsonb; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into sp from clara.seeding_proposals where id=p_proposal for update;
  if not found or sp.firm_id<>c.firm then
    raise exception 'seeding proposal not in your firm' using errcode='CLR11';
  end if;
  select * into b from clara.seeding_batches where id=sp.batch_id for update;
  v_dedupe:=clara._reserve_op(c.firm,'tick_seeding_proposal',p_op_key,
    clara._hash(jsonb_build_object('proposal',p_proposal)));
  if v_dedupe is not null then return v_dedupe; end if;
  if b.state<>'open' then
    raise exception 'seeding batch is not open'
      using errcode='CLR34',detail='{"reason":"batch_not_open"}';
  end if;
  if sp.state<>'proposed' then
    raise exception 'seeding proposal is not open'
      using errcode='CLR34',detail='{"reason":"proposal_not_open"}';
  end if;

  if sp.proposal_kind in ('vendor_account_rule','counterparty_birth') then
    if nullif(sp.payload->>'counterparty_id','') is not null then
      v_proposal:=jsonb_build_object(
        'existing_id',sp.payload->>'counterparty_id','kind','vendor');
    else
      v_proposal:=jsonb_build_object('kind','vendor','new',
        jsonb_build_object('name',coalesce(
            nullif(sp.payload->>'name',''),
            sp.payload->>'counterparty_name'),
          'registration_no',sp.payload->>'registration_no',
          'tin',sp.payload->>'tin'));
    end if;
    v_fp:=clara._resolve_counterparty(sp.client_id,v_proposal);
    if v_fp->>'decision'='birth' then
      v_name:=btrim(coalesce(
        nullif(sp.payload->>'name',''),
        sp.payload->>'counterparty_name'));
      v_reg:=nullif(btrim(sp.payload->>'registration_no'),'');
      v_tin:=nullif(btrim(sp.payload->>'tin'),'');
      v_name_n:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]','','g'));
      v_reg_n:=case when v_reg is null then null else
        lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
      begin
        insert into clara.counterparties(firm_id,client_id,kind,name,
            name_normalized,registration_no,registration_normalized,tin,created_by)
          values(c.firm,sp.client_id,'vendor',v_name,v_name_n,v_reg,v_reg_n,
            v_tin,c.actor) returning id into v_cp;
        v_created:=true;
      exception when unique_violation then
        raise exception 'counterparty birth raced with an existing identity'
          using errcode='CLR23',detail='{"reason":"registration_conflict"}';
      end;
    else
      v_cp:=clara._canonical_counterparty(
        sp.client_id,(v_fp->>'counterparty_id')::uuid);
      select cp.name_normalized into v_name_n
        from clara.counterparties cp where cp.id=v_cp;
    end if;
    if jsonb_typeof(sp.payload->'aliases')='array' then
      for a in select value from jsonb_array_elements(sp.payload->'aliases') loop
        v_alias:=nullif(btrim(a#>>'{}'),'');
        if v_alias is not null and lower(regexp_replace(v_alias,
            '[^a-zA-Z0-9]','','g'))<>v_name_n then
          begin
            insert into clara.counterparty_aliases(firm_id,client_id,
                counterparty_id,alias_normalized,alias_display,origin,created_by)
              values(c.firm,sp.client_id,v_cp,
                lower(regexp_replace(v_alias,'[^a-zA-Z0-9]','','g')),
                v_alias,'human',c.actor);
          exception when unique_violation then
            raise exception 'a live counterparty alias already owns this name'
              using errcode='CLR23',detail='{"reason":"alias_collision"}';
          end;
        end if;
      end loop;
    end if;
  end if;

  if sp.proposal_kind='vendor_account_rule' then
    v_account:=sp.payload->>'account_code';
    begin
      insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
          account_code,status,pinned,origin,content_hash,created_by,signed_by,signed_at)
        values(c.firm,sp.client_id,'vendor_account',v_cp,v_account,'live',false,
          'authored',encode(clara._hash(jsonb_build_object(
            'type','vendor_account','client',sp.client_id,
            'counterparty',v_cp,'account_code',v_account)),'hex'),
          c.actor,c.actor,now()) returning id into v_rule;
    exception when unique_violation then
      get stacked diagnostics v_constraint=constraint_name;
      if v_constraint='uq_coding_rules_one_live_vendor' then
        raise exception 'a live rule already exists for this counterparty'
          using errcode='CLR27',detail='{"reason":"duplicate_live"}';
      end if;
      raise;
    end;
  end if;
  update clara.seeding_proposals set state='ticked',decided_by=c.actor,
    decided_at=now(),resulting_rule_id=v_rule,
    resulting_counterparty_id=v_cp where id=p_proposal;
  perform clara._audit(c.firm,c.actor,null,null,'tick_seeding_proposal',null,
    jsonb_build_object('proposal',p_proposal,'batch',sp.batch_id,
      'counterparty',v_cp,'rule',v_rule,'op_key',p_op_key));
  if v_created then
    perform clara._append_event(c.firm,'counterparty.created',sp.client_id,
      c.actor,null,null,null,null,null,jsonb_build_object('counterparty_id',v_cp));
  end if;
  if v_rule is not null then
    perform clara._append_event(c.firm,'kb_rule.signed',sp.client_id,c.actor,
      null,null,null,null,null,jsonb_build_object(
        'rule_id',v_rule,'counterparty_id',v_cp,'account_code',v_account,
        'seeding_proposal_id',p_proposal));
  end if;
  perform clara._append_event(c.firm,'seeding.proposal_decided',sp.client_id,
    c.actor,null,null,null,b.source_document_id,null,jsonb_build_object(
      'batch_id',sp.batch_id,'proposal_id',p_proposal,'decision','ticked',
      'proposal_kind',sp.proposal_kind,'resulting_rule_id',v_rule,
      'resulting_counterparty_id',v_cp,
      'wiki_dispatch_required',sp.proposal_kind='wiki_fact'));
  v_result:=jsonb_build_object('proposal_id',p_proposal,'status','ticked',
    'proposal_kind',sp.proposal_kind,'counterparty_id',v_cp,'rule_id',v_rule,
    'wiki_dispatch_required',sp.proposal_kind='wiki_fact',
    'wiki_source_document_id',b.source_document_id,
    'wiki_payload',case when sp.proposal_kind='wiki_fact'
      then jsonb_build_object('payload',sp.payload,'evidence',sp.evidence) end);
  return clara._finish_op(c.firm,'tick_seeding_proposal',p_op_key,v_result);
end $$;

create function clara.decline_seeding_proposal(
    p_proposal uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; sp record; b record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and decline reason are required' using errcode='CLR10';
  end if;
  select * into sp from clara.seeding_proposals where id=p_proposal for update;
  if not found or sp.firm_id<>c.firm then
    raise exception 'seeding proposal not in your firm' using errcode='CLR11';
  end if;
  select * into b from clara.seeding_batches where id=sp.batch_id for update;
  v_dedupe:=clara._reserve_op(c.firm,'decline_seeding_proposal',p_op_key,
    clara._hash(jsonb_build_object('proposal',p_proposal,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if b.state<>'open' then
    raise exception 'seeding batch is not open'
      using errcode='CLR34',detail='{"reason":"batch_not_open"}';
  end if;
  if sp.state<>'proposed' then
    raise exception 'seeding proposal is not open'
      using errcode='CLR34',detail='{"reason":"proposal_not_open"}';
  end if;
  update clara.seeding_proposals set state='declined',decided_by=c.actor,
    decided_at=now(),decision_reason=btrim(p_reason) where id=p_proposal;
  perform clara._audit(c.firm,c.actor,null,null,'decline_seeding_proposal',null,
    jsonb_build_object('proposal',p_proposal,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'seeding.proposal_decided',sp.client_id,
    c.actor,null,null,null,b.source_document_id,null,jsonb_build_object(
      'batch_id',sp.batch_id,'proposal_id',p_proposal,'decision','declined',
      'reason',btrim(p_reason)));
  v_result:=jsonb_build_object('proposal_id',p_proposal,'status','declined');
  return clara._finish_op(c.firm,'decline_seeding_proposal',p_op_key,v_result);
end $$;

create function clara.complete_seeding_batch(p_batch uuid,p_op_key text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; b record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into b from clara.seeding_batches where id=p_batch for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'seeding batch not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'complete_seeding_batch',p_op_key,
    clara._hash(jsonb_build_object('batch',p_batch)));
  if v_dedupe is not null then return v_dedupe; end if;
  if b.state<>'open' then
    raise exception 'seeding batch is not open'
      using errcode='CLR34',detail='{"reason":"batch_not_open"}';
  end if;
  update clara.seeding_batches set state='completed',completed_at=now(),
    completed_by=c.actor,stats=stats||jsonb_build_object(
      'ticked',(select count(*) from clara.seeding_proposals
        where batch_id=p_batch and state='ticked'),
      'declined',(select count(*) from clara.seeding_proposals
        where batch_id=p_batch and state='declined'),
      'refused',(select count(*) from clara.seeding_proposals
        where batch_id=p_batch and state='refused'),
      'still_proposed',(select count(*) from clara.seeding_proposals
        where batch_id=p_batch and state='proposed'))
    where id=p_batch;
  perform clara._audit(c.firm,c.actor,null,null,'complete_seeding_batch',null,
    jsonb_build_object('batch',p_batch,'op_key',p_op_key));
  perform clara._append_event(c.firm,'seeding.batch_completed',b.client_id,
    c.actor,null,null,null,b.source_document_id,null,
    jsonb_build_object('batch_id',p_batch,'status','completed'));
  v_result:=jsonb_build_object('batch_id',p_batch,'status','completed');
  return clara._finish_op(c.firm,'complete_seeding_batch',p_op_key,v_result);
end $$;

create function clara.cancel_seeding_batch(
    p_batch uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; b record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' or nullif(btrim(p_reason),'') is null then
    raise exception 'op_key and cancellation reason are required' using errcode='CLR10';
  end if;
  select * into b from clara.seeding_batches where id=p_batch for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'seeding batch not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'cancel_seeding_batch',p_op_key,
    clara._hash(jsonb_build_object('batch',p_batch,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if b.state<>'open' then
    raise exception 'seeding batch is not open'
      using errcode='CLR34',detail='{"reason":"batch_not_open"}';
  end if;
  update clara.seeding_batches set state='cancelled',cancelled_at=now(),
    cancelled_by=c.actor,cancel_reason=btrim(p_reason) where id=p_batch;
  perform clara._audit(c.firm,c.actor,null,null,'cancel_seeding_batch',null,
    jsonb_build_object('batch',p_batch,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'seeding.batch_completed',b.client_id,
    c.actor,null,null,null,b.source_document_id,null,
    jsonb_build_object('batch_id',p_batch,'status','cancelled',
      'reason',btrim(p_reason)));
  v_result:=jsonb_build_object('batch_id',p_batch,'status','cancelled');
  return clara._finish_op(c.firm,'cancel_seeding_batch',p_op_key,v_result);
end $$;

-- =====================================================================
-- B6 — L: HYGIENE LINT BELT + FIRST-CLASS FINDINGS.
-- =====================================================================

create function clara.run_client_lint(p_client uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  cl record; h record; p record; x record; y record; s record; f record;
  v_conditions jsonb:='[]'::jsonb; j jsonb; v_open uuid; v_prior uuid;
  v_event_kind text; v_head bigint; v_changed boolean:=false;
  v_created jsonb:='[]'::jsonb; v_transitions jsonb:='[]'::jsonb;
  v_pages bigint; v_max_pages bigint; v_max_bytes bigint; v_largest bigint;
  v_detail jsonb; v_result jsonb;
begin
  begin
    if p_op_key is null or btrim(p_op_key)='' then
      raise exception 'op_key is required' using errcode='CLR10';
    end if;
    select * into cl from clara.clients where id=p_client;
    if not found or cl.status<>'active' then
      return jsonb_build_object('client_id',p_client,'status','skipped',
        'changed',false);
    end if;
    select coalesce(max(seq),0) into v_head from clara.domain_events
      where firm_id=cl.firm_id;
    select value_int into v_max_pages from clara.wiki_budgets
      where budget_key='max_pages_per_client';
    select value_int into v_max_bytes from clara.wiki_budgets
      where budget_key='max_page_bytes';

    -- W9 held state.
    select * into h from clara.wiki_synthesis_holds where client_id=p_client;
    if found then
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','wiki_synthesis_held','dedupe_key','held:'||p_client,
        'severity','critical','detail',jsonb_build_object(
          'reason',h.reason,'since',h.since));
    end if;

    -- L7 soft cap approach/breach.
    select count(*)::bigint into v_pages from clara.wiki_pages
      where client_id=p_client and state='active';
    if v_pages*10>=v_max_pages*9 then
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','cap_pages',
        'dedupe_key','cap:'||p_client||':max_pages_per_client',
        'severity',case when v_pages>v_max_pages then 'critical' else 'warn' end,
        'detail',jsonb_build_object('actual',v_pages,'limit',v_max_pages,
          'budget_key','max_pages_per_client'));
    end if;
    select coalesce(max(v.size_bytes),0) into v_largest
      from clara.wiki_page_versions v where v.client_id=p_client
        and v.state='published';
    if v_largest*10>=v_max_bytes*9 then
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','cap_page_size',
        'dedupe_key','cap:'||p_client||':max_page_bytes',
        'severity',case when v_largest>v_max_bytes then 'critical' else 'warn' end,
        'detail',jsonb_build_object('largest_bytes',v_largest,'limit',v_max_bytes,
          'budget_key','max_page_bytes'));
    end if;

    -- Orphans: verified-never-published, or a live page with zero refs.
    for p in
      select distinct wp.id from clara.wiki_pages wp
      left join clara.wiki_page_versions vv on vv.page_id=wp.id
      where wp.client_id=p_client and (
        (vv.state='verified' and vv.id is distinct from wp.current_version_id)
        or (wp.state='active' and not exists(
          select 1 from clara.wiki_page_refs r where r.page_id=wp.id)))
    loop
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','orphan_page','dedupe_key','orphan:'||p.id,
        'severity','warn','page_id',p.id,
        'detail',jsonb_build_object('page_id',p.id));
    end loop;

    -- Contradiction is typed: same citation detail.subject_key, different
    -- detail.value on two currently-published pages.
    for x in
      select least(c1.version_id::text,c2.version_id::text) a,
        greatest(c1.version_id::text,c2.version_id::text) b,
        c1.detail->>'subject_key' subject_key,
        c1.detail->'value' value_a,c2.detail->'value' value_b,
        v1.page_id page_a,v2.page_id page_b
      from clara.wiki_page_citations c1
      join clara.wiki_page_citations c2 on c2.client_id=c1.client_id
        and c2.id>c1.id
        and nullif(c2.detail->>'subject_key','')=
            nullif(c1.detail->>'subject_key','')
        and c2.detail->'value' is distinct from c1.detail->'value'
      join clara.wiki_page_versions v1 on v1.id=c1.version_id
        and v1.state='published'
      join clara.wiki_page_versions v2 on v2.id=c2.version_id
        and v2.state='published' and v2.page_id<>v1.page_id
      where c1.client_id=p_client
    loop
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','contradiction',
        'dedupe_key','contradiction:'||least(x.page_a::text,x.page_b::text)||
          ':'||greatest(x.page_a::text,x.page_b::text),
        'severity','critical','page_id',x.page_a,
        'detail',jsonb_build_object('page_a',x.page_a,'page_b',x.page_b,
          'subject_key',x.subject_key,'value_a',x.value_a,'value_b',x.value_b));
    end loop;

    -- Stale typed claim: a current page's source_at predates a newer current
    -- citation for the same subject_key.
    for x in
      select distinct v1.page_id,
        c1.detail->>'subject_key' subject_key,
        c1.detail->>'source_at' source_at,
        max(c2.detail->>'source_at') newer_source_at
      from clara.wiki_page_citations c1
      join clara.wiki_page_versions v1 on v1.id=c1.version_id
        and v1.state='published'
      join clara.wiki_page_citations c2 on c2.client_id=c1.client_id
        and c2.detail->>'subject_key'=c1.detail->>'subject_key'
        and c2.detail->>'source_at'>c1.detail->>'source_at'
      join clara.wiki_page_versions v2 on v2.id=c2.version_id
        and v2.state='published'
      where c1.client_id=p_client
        and nullif(c1.detail->>'subject_key','') is not null
        and coalesce(c1.detail->>'source_at','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        and coalesce(c2.detail->>'source_at','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      group by v1.page_id,c1.detail->>'subject_key',c1.detail->>'source_at'
    loop
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','stale_claim','dedupe_key','stale:'||x.page_id,
        'severity','warn','page_id',x.page_id,
        'detail',jsonb_build_object('subject_key',x.subject_key,
          'source_at',x.source_at,'newer_source_at',x.newer_source_at));
    end loop;

    -- [R1-F3] L4 consumes the same canonical approved-plus-pending basis as
    -- dry-run and K5/K6, including the same separately-tested OBE treatment.
    for s in select * from clara.opening_seed_registry
        where client_id=p_client and state='finalized' loop
      if exists(select 1 from clara._opening_seed_deltas(s.id,false)
          where delta_debit<>0 or delta_credit<>0)
         or clara._opening_seed_obe_net(s.id)<>0 then
        select coalesce(jsonb_agg(to_jsonb(d) order by d.account_code),'[]'::jsonb)
          into v_detail from clara._opening_seed_deltas(s.id,false) d
          where d.delta_debit<>0 or d.delta_credit<>0;
        v_conditions:=v_conditions||jsonb_build_object(
          'finding_kind','opening_tb_tie_broken',
          'dedupe_key','obtie:'||s.id,'severity','critical','seed_id',s.id,
          'detail',jsonb_build_object('seed_id',s.id,'as_of',s.as_of,
            'deltas',v_detail,'obe_net_cents',
            clara._opening_seed_obe_net(s.id)));
      end if;
      if s.tie_document_id is not null and not exists(
          select 1 from clara.document_filings df
          where df.document_id=s.tie_document_id and df.client_id=p_client
            and df.retired_at is null) then
        v_conditions:=v_conditions||jsonb_build_object(
          'finding_kind','opening_doc_unfiled',
          'dedupe_key','obdoc:'||s.id,'severity','critical','seed_id',s.id,
          'detail',jsonb_build_object('seed_id',s.id,
            'document_id',s.tie_document_id));
      end if;
    end loop;

    -- Converge current conditions into one-open episodes.
    for j in select value from jsonb_array_elements(v_conditions) loop
      v_open:=null;
      select id into v_open from clara.lint_findings
        where client_id=p_client and dedupe_key=j->>'dedupe_key'
          and state='open' for update;
      if v_open is not null then
        update clara.lint_findings set severity=j->>'severity',
          detail=coalesce(j->'detail','{}'::jsonb),
          evaluated_through_event_seq=v_head,updated_at=now()
          where id=v_open;
        insert into clara.lint_finding_events(
            firm_id,client_id,finding_id,event_kind,state_before,state_after,
            figures,actor,rationale)
          values(cl.firm_id,p_client,v_open,'evaluation','open','open',
            coalesce(j->'detail','{}'::jsonb),'runtime','daily lint convergence');
      else
        select id into v_prior from clara.lint_findings
          where client_id=p_client and dedupe_key=j->>'dedupe_key'
            and state<>'open' order by updated_at desc,id desc limit 1;
        insert into clara.lint_findings(firm_id,client_id,finding_kind,dedupe_key,
            severity,page_id,seed_id,detail,prior_finding_id,
            evaluated_through_event_seq)
          values(cl.firm_id,p_client,j->>'finding_kind',j->>'dedupe_key',
            j->>'severity',nullif(j->>'page_id','')::uuid,
            nullif(j->>'seed_id','')::uuid,coalesce(j->'detail','{}'::jsonb),
            v_prior,v_head) returning id into v_open;
        v_event_kind:=case when v_prior is null then 'created'
          else 'recheck_opened' end;
        insert into clara.lint_finding_events(
            firm_id,client_id,finding_id,event_kind,state_before,state_after,
            figures,actor,rationale)
          values(cl.firm_id,p_client,v_open,v_event_kind,
            case when v_prior is null then null else 'resolved' end,'open',
            coalesce(j->'detail','{}'::jsonb),'runtime','daily lint transition');
        if v_prior is null then
          v_created:=v_created||jsonb_build_object('finding_id',v_open,
            'dedupe_key',j->>'dedupe_key','finding_kind',j->>'finding_kind',
            'severity',j->>'severity');
        end if;
        v_transitions:=v_transitions||jsonb_build_object('finding_id',v_open,
          'event_kind',v_event_kind,'finding_kind',j->>'finding_kind',
          'dedupe_key',j->>'dedupe_key','severity',j->>'severity');
        v_changed:=true;
      end if;
    end loop;

    for f in select * from clara.lint_findings lf
        where lf.client_id=p_client and lf.state='open' for update loop
      if not exists(select 1 from jsonb_array_elements(v_conditions) z
          where z->>'dedupe_key'=f.dedupe_key) then
        update clara.lint_findings set state='superseded',
          superseded_at=now(),evaluated_through_event_seq=v_head,updated_at=now()
          where id=f.id;
        insert into clara.lint_finding_events(
            firm_id,client_id,finding_id,event_kind,state_before,state_after,
            figures,actor,rationale)
          values(cl.firm_id,p_client,f.id,'superseded','open','superseded',
            f.detail,'runtime','condition no longer present');
        v_transitions:=v_transitions||jsonb_build_object('finding_id',f.id,
          'event_kind','superseded','finding_kind',f.finding_kind,
          'dedupe_key',f.dedupe_key,'severity',f.severity);
        v_changed:=true;
      end if;
    end loop;

    if exists(select 1 from clara.wiki_pages where client_id=p_client) then
      insert into clara.wiki_log(firm_id,client_id,action,actor_kind,detail)
        values(cl.firm_id,p_client,'lint_pass','runtime',
          jsonb_build_object('through_event_seq',v_head,
            'condition_count',jsonb_array_length(v_conditions)));
    end if;
    if v_changed then
      perform clara._audit(cl.firm_id,null,null,null,'run_client_lint',null,
        jsonb_build_object('client',p_client,'op_key',p_op_key,
          'transitions',v_transitions));
    end if;

    -- L6 exactly once per CREATED episode. The notification core's receipt key
    -- is finding-episode-specific. Rechecks are not notified.
    for j in select value from jsonb_array_elements(v_created) loop
      begin
        perform clara._record_notification_core(null,cl.firm_id,null,null,
          p_client,'lint_finding_opened',j,
          'lint:'||(j->>'dedupe_key')||':'||(j->>'finding_id'));
      exception when others then null;
      end;
    end loop;
    for j in select value from jsonb_array_elements(v_transitions) loop
      perform clara._append_event(cl.firm_id,'lint.finding_transition',p_client,
        null,null,null,null,null,null,j);
    end loop;
    return jsonb_build_object('client_id',p_client,'status','ok',
      'changed',v_changed,'condition_count',jsonb_array_length(v_conditions),
      'transitions',v_transitions);
  exception when others then
    return jsonb_build_object('client_id',p_client,'status','failed',
      'changed',false,'error',sqlerrm,'sqlstate',sqlstate);
  end;
end $$;

create function clara.run_lint_all(p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_started timestamptz:=clock_timestamp(); cl record; r jsonb;
  v_examined int:=0; v_changed int:=0; v_failed int:=0; v_run uuid;
  v_result jsonb;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  for cl in select c.id from clara.clients c
      where c.status='active' order by c.id loop
    v_examined:=v_examined+1;
    r:=clara.run_client_lint(cl.id,p_op_key||':'||cl.id);
    if r->>'status'='failed' then v_failed:=v_failed+1;
    elsif coalesce((r->>'changed')::boolean,false) then v_changed:=v_changed+1;
    end if;
  end loop;
  insert into clara.lint_runs(started_at,completed_at,clients_examined,
      clients_changed,clients_failed,through_event_seq,error_note)
    values(v_started,clock_timestamp(),v_examined,v_changed,v_failed,
      (select coalesce(max(seq),0) from clara.domain_events),
      case when v_failed>0 then v_failed||' client lint pass(es) failed' end)
    returning id into v_run;
  v_result:=jsonb_build_object('run_id',v_run,'clients_examined',v_examined,
    'clients_changed',v_changed,'clients_failed',v_failed);
  return v_result;
end $$;

create function clara.get_lint_finding(p_finding uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  return (select jsonb_build_object('finding',to_jsonb(f),
      'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id)
        from clara.lint_finding_events e where e.finding_id=f.id),'[]'::jsonb))
    from clara.lint_findings f where f.id=p_finding and f.firm_id=c.firm);
end $$;

create function clara.resolve_lint_finding(
    p_finding uuid,p_conclusion text,p_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; f record; v_dedupe jsonb; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)=''
     or p_conclusion not in
       ('corrected','accepted_revision','false_positive','superseded_by_edit')
     or nullif(btrim(p_note),'') is null then
    raise exception 'lint resolution is malformed'
      using errcode='CLR33',detail='{"reason":"bad_conclusion"}';
  end if;
  select * into f from clara.lint_findings where id=p_finding for update;
  if not found or f.firm_id<>c.firm then
    raise exception 'lint finding not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'resolve_lint_finding',p_op_key,
    clara._hash(jsonb_build_object('finding',p_finding,
      'conclusion',p_conclusion,'note',p_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if f.state<>'open' then
    raise exception 'lint finding is not open'
      using errcode='CLR33',detail='{"reason":"finding_not_open"}';
  end if;
  update clara.lint_findings set state='resolved',
    resolved_conclusion=p_conclusion,resolved_note=btrim(p_note),
    resolved_by=c.actor,resolved_at=now(),updated_at=now() where id=p_finding;
  insert into clara.lint_finding_events(
      firm_id,client_id,finding_id,event_kind,state_before,state_after,
      figures,actor,rationale)
    values(c.firm,f.client_id,p_finding,'resolved','open','resolved',
      f.detail,c.actor::text,btrim(p_note));
  perform clara._audit(c.firm,c.actor,null,null,'resolve_lint_finding',null,
    jsonb_build_object('finding',p_finding,'conclusion',p_conclusion,
      'note',p_note,'op_key',p_op_key));
  perform clara._append_event(c.firm,'lint.finding_transition',f.client_id,
    c.actor,null,null,null,null,null,jsonb_build_object(
      'finding_id',p_finding,'event_kind','resolved',
      'finding_kind',f.finding_kind,'dedupe_key',f.dedupe_key,
      'conclusion',p_conclusion));
  v_result:=jsonb_build_object('finding_id',p_finding,'status','resolved',
    'conclusion',p_conclusion);
  return clara._finish_op(c.firm,'resolve_lint_finding',p_op_key,v_result);
end $$;

-- W6: pack v4. The v3 object is preserved byte-for-byte apart from the version
-- integer; the gated wiki object is concatenated last.
do $cor$
declare v_def text; v_next text;
begin
  select pg_get_functiondef(
    'clara.get_context_pack(uuid,text)'::regprocedure) into v_def;
  v_next:=replace(v_def,'''pack_schema_version'',3',
    '''pack_schema_version'',4');
  v_next:=replace(v_next,
    '    ) from clara.clients cl where cl.id=p_client and cl.firm_id=v_firm',
$wiki$    ) || case when
      p_purpose='wiki_coding'
      and (coalesce(current_setting('clara.wake_secret',true),'')=''
        or current_setting('clara.pack_consumer',true)='v25')
    then jsonb_build_object('wiki',jsonb_build_object(
      'last_projected_seq',coalesce((select rc.last_seq
        from clara.relay_checkpoints rc
        where rc.firm_id=v_firm and rc.consumer='wiki_projection'),0),
      'held',exists(select 1 from clara.wiki_synthesis_holds wh
        where wh.client_id=cl.id),
      'budget',jsonb_build_object(
        'pages',(select wb.value_int from clara.wiki_budgets wb
          where wb.budget_key='pack_max_pages'),
        'bytes',(select wb.value_int from clara.wiki_budgets wb
          where wb.budget_key='pack_max_bytes')),
      'pages',(
        with cfg as (
          select
            max(value_int) filter(where budget_key='pack_max_pages') page_cap,
            max(value_int) filter(where budget_key='pack_max_bytes') byte_cap
          from clara.wiki_budgets
        ), candidates as (
          select wp.slug,wp.title,wp.page_kind,wv.id version_id,
            wv.version_n,wp.updated_at,wv.content,
            octet_length(convert_to(wv.content,'UTF8')) content_bytes,
            case wp.page_kind
              when 'profile' then 1 when 'period_context' then 2
              when 'treatment' then 3 when 'recurring_pattern' then 4
              when 'counterparty' then 5 else 6 end priority
          from clara.wiki_pages wp
          join clara.wiki_page_versions wv on wv.id=wp.current_version_id
          where wp.client_id=cl.id and wp.state='active'
        ), ranked as (
          select x.*,
            row_number() over(order by priority,updated_at desc,slug) ord,
            sum(content_bytes) over(order by priority,updated_at desc,slug
              rows between unbounded preceding and current row) running_bytes
          from candidates x
        )
        select coalesce(jsonb_agg(jsonb_build_object(
          'slug',r.slug,'title',r.title,'page_kind',r.page_kind,
          'version_n',r.version_n,'updated_at',r.updated_at,
          'citations',coalesce((select jsonb_agg(jsonb_build_object(
              'source_kind',wc.source_kind,'document_id',wc.document_id,
              'entry_id',wc.entry_id,'counterparty_id',wc.counterparty_id,
              'detail',wc.detail)
              order by wc.created_at,wc.id)
            from clara.wiki_page_citations wc
            where wc.version_id=r.version_id),'[]'::jsonb),
          'content',r.content) order by r.ord),'[]'::jsonb)
        from ranked r cross join cfg
        where r.ord<=cfg.page_cap and r.running_bytes<=cfg.byte_cap
      ),
      'basis','clara_maintained_advisory_notes',
      'permitted_use','inform_never_decide'))
    else '{}'::jsonb end
    from clara.clients cl where cl.id=p_client and cl.firm_id=v_firm$wiki$);
  if v_next=v_def
     or position('''pack_schema_version'',4' in v_next)=0
     or position('wiki_coding' in v_next)=0
     or position('''v25''' in v_next)=0 then
    raise exception '0017: get_context_pack prestate drift' using errcode='CLR10';
  end if;
  execute v_next;
end
$cor$;

reset role;

-- =====================================================================
-- G1 — EVENT TAXONOMY (one additive pair against the active version).
-- =====================================================================
with added(name,client_scoped,description,decision,note) as (values
  ('wiki.page_published',true,'A Clara wiki page version was published','ignore',null::text),
  ('wiki.page_retired',true,'A Clara wiki page was retired','ignore',null::text),
  ('wiki.source_ingested',true,'A deterministic wiki source was ingested','ignore',null::text),
  ('lint.finding_transition',true,'A lint finding changed lifecycle state','notification',null::text),
  ('client.onboarding_started',true,'A client onboarding plan was started','ignore',null::text),
  ('onboarding.plan_bootstrapped',true,'A pre-0017 active client received its B-12 plan','ignore',null::text),
  ('client.activated',true,'An onboarding client became operational','ignore',null::text),
  ('onboarding.plan_committed',true,'An onboarding plan was committed','ignore',null::text),
  ('opening_seed.batch_approved',true,'An opening seed batch was approved','ignore',null::text),
  ('opening_seed.reopened',true,'A finalized opening seed was reopened','ignore',null::text),
  ('opening_item.superseded',true,'An opening item was superseded','ignore',null::text),
  ('seeding.batch_created',true,'A prior-GL proposal batch was created','ignore',null::text),
  ('seeding.proposal_decided',true,'A prior-GL proposal was decided','ignore',null::text),
  ('seeding.batch_completed',true,'A prior-GL proposal batch was completed','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note from added x
join inserted_types i on i.name=x.name cross join clara.taxonomy_active a;

-- =====================================================================
-- G2/G3 — PUBLIC SWEEP, TABLE READS, AND THE EXACT EXECUTE MATRIX.
-- =====================================================================
revoke execute on all functions in schema clara from public;

grant select on
  clara.wiki_pages,clara.wiki_page_versions,clara.wiki_page_citations,
  clara.wiki_page_refs,clara.wiki_log,clara.wiki_synthesis_holds,
  clara.onboarding_plans,clara.onboarding_plan_items,
  clara.onboarding_plan_revisions,clara.opening_seed_registry,
  clara.opening_items,clara.opening_tb_targets,clara.opening_seed_approvals,
  clara.seeding_batches,clara.seeding_proposals,clara.lint_findings,
  clara.lint_finding_events
to clara_authenticated,clara_runtime;
grant select on clara.wiki_budgets,clara.lint_runs to clara_runtime;

grant execute on function
  clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text),
  clara.record_wiki_source_ingest(uuid,uuid,text,text),
  clara.set_wiki_synthesis_hold(uuid,text,text),
  clara.clear_wiki_synthesis_hold(uuid,text),
  clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text),
  clara.record_opening_targets_parsed(uuid,jsonb,uuid,text),
  clara.create_seeding_batch(uuid,uuid,jsonb,text),
  clara.run_client_lint(uuid,text),
  clara.run_lint_all(text)
to clara_runtime;

grant execute on function
  clara.retire_wiki_page(uuid,text,text),
  clara.create_client(text,text),
  clara.begin_client_onboarding(text,text),
  clara.bootstrap_client_plan(uuid,text),
  clara.commit_client_onboarding(uuid,uuid,uuid,text,text),
  clara.cancel_client_onboarding(uuid,uuid,text,text),
  clara.resolve_onboarding_plan_item(uuid,text,text,text),
  clara.create_opening_seed(uuid,uuid,date,uuid,text,text),
  clara.cancel_opening_seed(uuid,text,text),
  clara.draft_opening_item(uuid,uuid,jsonb,jsonb,uuid,uuid,text,text),
  clara.record_opening_target(uuid,jsonb,text),
  clara.seed_fixed_asset(uuid,uuid,jsonb,text),
  clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text),
  clara.supersede_opening_item(uuid,jsonb,text),
  clara.approve_opening_correction(uuid,jsonb,text,text),
  clara.reopen_opening_seed(uuid,text,text),
  clara.get_opening_dryrun(uuid),
  clara.tick_seeding_proposal(uuid,text),
  clara.decline_seeding_proposal(uuid,text,text),
  clara.complete_seeding_batch(uuid,text),
  clara.cancel_seeding_batch(uuid,text,text),
  clara.get_lint_finding(uuid),
  clara.resolve_lint_finding(uuid,text,text,text)
to clara_authenticated;

grant execute on function
  clara.get_wiki_page(uuid,text),
  clara.list_wiki_pages(uuid),
  clara.trial_balance_as_of(uuid,date)
to clara_authenticated,clara_runtime;

-- =====================================================================
-- G5 — FAIL-CLOSED TAIL BATTERY.
-- =====================================================================
do $tail$
declare
  v_def text; v_src text; v_name text; v_sig text; v_count int;
  v_new_sigs text[]:=array[
    'clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)',
    'clara.record_wiki_source_ingest(uuid,uuid,text,text)',
    'clara.retire_wiki_page(uuid,text,text)',
    'clara.set_wiki_synthesis_hold(uuid,text,text)',
    'clara.clear_wiki_synthesis_hold(uuid,text)',
    'clara.get_wiki_page(uuid,text)','clara.list_wiki_pages(uuid)',
    'clara.create_client(text,text)',
    'clara.begin_client_onboarding(text,text)',
    'clara.bootstrap_client_plan(uuid,text)',
    'clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)',
    'clara.resolve_onboarding_plan_item(uuid,text,text,text)',
    'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)',
    'clara.cancel_client_onboarding(uuid,uuid,text,text)',
    'clara.create_opening_seed(uuid,uuid,date,uuid,text,text)',
    'clara.cancel_opening_seed(uuid,text,text)',
    'clara.record_opening_target(uuid,jsonb,text)',
    'clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
    'clara.draft_opening_item(uuid,uuid,jsonb,jsonb,uuid,uuid,text,text)',
    'clara.seed_fixed_asset(uuid,uuid,jsonb,text)',
    'clara.trial_balance_as_of(uuid,date)',
    'clara.get_opening_dryrun(uuid)',
    'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
    'clara.reopen_opening_seed(uuid,text,text)',
    'clara.supersede_opening_item(uuid,jsonb,text)',
    'clara.approve_opening_correction(uuid,jsonb,text,text)',
    'clara.create_seeding_batch(uuid,uuid,jsonb,text)',
    'clara.tick_seeding_proposal(uuid,text)',
    'clara.decline_seeding_proposal(uuid,text,text)',
    'clara.complete_seeding_batch(uuid,text)',
    'clara.cancel_seeding_batch(uuid,text,text)',
    'clara.run_client_lint(uuid,text)','clara.run_lint_all(text)',
    'clara.get_lint_finding(uuid)',
    'clara.resolve_lint_finding(uuid,text,text,text)'
  ];
  v_runtime_only text[]:=array[
    'clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)',
    'clara.record_wiki_source_ingest(uuid,uuid,text,text)',
    'clara.set_wiki_synthesis_hold(uuid,text,text)',
    'clara.clear_wiki_synthesis_hold(uuid,text)',
    'clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)',
    'clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
    'clara.create_seeding_batch(uuid,uuid,jsonb,text)',
    'clara.run_client_lint(uuid,text)','clara.run_lint_all(text)'
  ];
  v_auth_only text[]:=array[
    'clara.retire_wiki_page(uuid,text,text)',
    'clara.create_client(text,text)',
    'clara.begin_client_onboarding(text,text)',
    'clara.bootstrap_client_plan(uuid,text)',
    'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)',
    'clara.cancel_client_onboarding(uuid,uuid,text,text)',
    'clara.resolve_onboarding_plan_item(uuid,text,text,text)',
    'clara.create_opening_seed(uuid,uuid,date,uuid,text,text)',
    'clara.cancel_opening_seed(uuid,text,text)',
    'clara.draft_opening_item(uuid,uuid,jsonb,jsonb,uuid,uuid,text,text)',
    'clara.record_opening_target(uuid,jsonb,text)',
    'clara.seed_fixed_asset(uuid,uuid,jsonb,text)',
    'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
    'clara.supersede_opening_item(uuid,jsonb,text)',
    'clara.approve_opening_correction(uuid,jsonb,text,text)',
    'clara.reopen_opening_seed(uuid,text,text)',
    'clara.get_opening_dryrun(uuid)',
    'clara.tick_seeding_proposal(uuid,text)',
    'clara.decline_seeding_proposal(uuid,text,text)',
    'clara.complete_seeding_batch(uuid,text)',
    'clara.cancel_seeding_batch(uuid,text,text)',
    'clara.get_lint_finding(uuid)',
    'clara.resolve_lint_finding(uuid,text,text,text)'
  ];
begin
  -- Constraint vocabulary and typed marker checks.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.clients'::regclass
      and conname='clients_status_check_0017';
  if coalesce(v_def,'') not ilike '%onboarding%' then
    raise exception '0017 clients status constraint assertion failed' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.open_questions'::regclass
      and conname='open_questions_origin_check_0017';
  if coalesce(v_def,'') not ilike '%onboarding%' then
    raise exception '0017 open-question origin assertion failed' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.coa_accounts'::regclass
      and conname='coa_accounts_special_acc_type_check';
  if coalesce(v_def,'') not ilike '%opening_balance_equity%'
     or coalesce(v_def,'') not ilike '%retained_earnings%' then
    raise exception '0017 CoA special marker assertion failed' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.documents'::regclass
      and conname='documents_document_kind_check';
  if coalesce(v_def,'') not ilike '%prior_gl%' then
    raise exception '0017 document kind assertion failed' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint where
      conrelid='clara.coa_accounts'::regclass and conname='ck_coa_obe_equity')
     or not exists(select 1 from pg_constraint where
      conrelid='clara.coa_accounts'::regclass
        and conname='ck_coa_retained_earnings_equity') then
    raise exception '0017 CoA equity binding checks are missing' using errcode='CLR10';
  end if;

  -- Load-bearing CoR body markers.
  select prosrc into v_src from pg_proc
    where oid='clara.get_context_pack(uuid,text)'::regprocedure;
  if position('''pack_schema_version'',4' in v_src)=0
     or position('wiki_coding' in v_src)=0
     or position('''v25''' in v_src)=0 or position('''wiki''' in v_src)=0
     or position('sst_registration_watch' in v_src)=0
     or position('surface_and_request_professional_review_only' in v_src)=0 then
    raise exception '0017 pack-v4 CoR assertion failed' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  if position('lint_finding' in v_src)=0 or position('finding_id' in v_src)=0
     -- [R1-F5] Assert every surgery independently; no one marker can mask a
     -- missed queue row family or the compliance.clients envelope.
     or position('active_entry_client.status=''active''' in v_src)=0
     or position('active_filing_client.status=''active''' in v_src)=0
     or position('active_question_client.status=''active''' in v_src)=0
     or position('active_task_client.status=''active''' in v_src)=0
     or position('active_watch_client.status=''active''' in v_src)=0
     or position('active_lint_client.status=''active''' in v_src)=0
     or position('active_envelope_client.status=''active''' in v_src)=0 then
    raise exception '0017 queue CoR assertion failed' using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara.list_uncoded_filings(uuid)',
    'clara.list_autopost_rules(jsonb)',
    'clara.list_notifications(jsonb,text[])'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    if position('active_' in v_src)=0
       or position('status=''active''' in v_src)=0 then
      raise exception '0017 R1-F5 enumerator assertion failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select prosrc into v_src from pg_proc
    where oid='clara.reconcile_autopost_rules()'::regprocedure;
  if position('active_expiry_client.status=''active''' in v_src)=0
     or position('active_nudge_client.status=''active''' in v_src)=0 then
    raise exception '0017 R1-F5 reconciler assertion failed' using errcode='CLR10';
  end if;

  -- [R1-F1] Every generic entry mutator carries the named CLR31 boundary.
  foreach v_sig in array array[
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
    'clara.reverse_entry(uuid,text,text)',
    'clara.withdraw_draft(uuid,text,uuid,text)',
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
    'clara.approve_wrong_client_correction(uuid,text,text,text)',
    'clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    if position('opening_entry_k_family_only' in v_src)=0 then
      raise exception '0017 R1-F1 lifecycle assertion failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- [R3-F5][R3-F1] Effect-sensitive extraction assertions: the document owns
  -- one constrained pointer; the insert trigger locks and hands it over across
  -- engines; persistence stores only independently derived fields; readers use
  -- exact document/region joins; parse-time and K5 both revalidate.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.document_regions'::regclass
      and conname='ck_document_regions_opening_fact_0017';
  v_def:=regexp_replace(lower(coalesce(v_def,'')),'\s+','','g');
  if position('opening_amount_cents>0' in v_def)=0
     or position('opening_side=any(array[''debit''::text,''credit''::text])'
       in v_def)=0
     or position('field_path=''opening_tb.line''::text' in v_def)=0
     or position('monetary_cents=opening_amount_cents' in v_def)=0
     or not exists(select 1 from pg_class i
       join pg_namespace n on n.oid=i.relnamespace
       where n.nspname='clara'
         and i.relname='uq_opening_tb_targets_extraction_fact_0017'
         and i.relkind='i') then
    raise exception '0017 R2-F1 stored fact constraint assertion failed'
      using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_attribute
      where attrelid='clara.documents'::regclass
        and attname='authoritative_extraction_id'
        and atttypid='uuid'::regtype and not attisdropped)
     or not exists(select 1 from pg_constraint
       where conrelid='clara.documents'::regclass
         and conname='fk_documents_authoritative_extraction_0017'
         and condeferrable and condeferred)
     or not exists(select 1 from pg_trigger
       where tgrelid='clara.document_extractions'::regclass
         and tgname='t_document_extractions_authority_0017'
         and not tgisinternal) then
    raise exception '0017 R3-F1 authoritative pointer structure assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara._tf_set_authoritative_extraction_0017()'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('selectd.authoritative_extraction_idintov_currentfromclara.documentsdwhered.id=new.document_idandd.firm_id=new.firm_idforupdate'
       in v_src)=0
     or position('(new.extracted_at,new.id)>(v_current_at,v_current)' in v_src)=0
     or position('updateclara.document_extractionsdesetsuperseded_by=new.idwherede.firm_id=new.firm_idandde.document_id=new.document_idandde.id<>new.idandde.status=''done''andde.superseded_byisnull'
       in v_src)=0
     or position('updateclara.documentsdsetauthoritative_extraction_id=new.idwhered.id=new.document_idandd.firm_id=new.firm_id'
       in v_src)=0
     or position('updateclara.document_extractionsdesetsuperseded_by=v_currentwherede.id=new.idandde.firm_id=new.firm_idandde.document_id=new.document_idandde.superseded_byisnull'
       in v_src)=0 then
    raise exception '0017 R3-F1 authoritative pointer effect assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara._derive_opening_region_fact(text,text,bigint)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('p_field_pathisdistinctfrom''opening_tb.line''' in v_src)=0
     or position('regexp_match(p_text_content,' in v_src)=0
     or position('rm[[:space:]]+' in v_src)=0
     or position('(dr|cr)$' in v_src)=0
     or position('amount_cents:=replace(m[2],'','','''')::bigint*100+m[3]::bigint'
       in v_src)=0
     or position('p_monetary_centsisdistinctfromamount_cents' in v_src)=0
     or position('"reason":"opening_extraction_monetary_mismatch"' in v_src)=0 then
    raise exception '0017 R3-F1 independent derivation assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('elem?''opening_fact''' in v_src)=0
     or position('select*intov_derivedfromclara._derive_opening_region_fact(elem->>''field_path'',elem->>''text_content'',v_region_money)'
       in v_src)=0
     or position('v_opening_accountisdistinctfromv_derived.account_code' in v_src)=0
     or position('v_opening_amountisdistinctfromv_derived.amount_cents' in v_src)=0
     or position('v_opening_sideisdistinctfromv_derived.side' in v_src)=0
     or position('"reason":"opening_extraction_fact_unverifiable"' in v_src)=0
     or position('"reason":"opening_extraction_fact_mismatch"' in v_src)=0
     or position('v_opening_account:=v_derived.account_code' in v_src)=0
     or position('v_opening_amount:=v_derived.amount_cents' in v_src)=0
     or position('v_opening_side:=v_derived.side' in v_src)=0
     or position('coalesce(v_region_money,v_opening_amount)' in v_src)=0
     or position('opening_account_code,opening_amount_cents,opening_side' in v_src)=0 then
    raise exception '0017 R3-F1 evidence-derived persistence assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._assert_opening_extraction_ref(uuid,uuid,jsonb)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('x.status<>''done''orx.superseded_byisnotnull' in v_src)=0
     or position('joinclara.documentsdond.id=de.document_idandd.firm_id=de.firm_id'
       in v_src)=0
     or position('joinclara.document_regionsdrondr.extraction_id=de.idanddr.firm_id=de.firm_id'
       in v_src)=0
     or position('de.id=v_extractionandde.firm_id=p_firmandde.document_id=p_documentandd.id=p_documentandd.firm_id=p_firmanddr.id=v_region'
       in v_src)=0
     or position('x.authoritative_extraction_idisdistinctfromv_extraction'
       in v_src)=0
     or position('"reason":"stale_extraction_version"' in v_src)=0 then
    raise exception '0017 R3-F1 exact authoritative join assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._opening_region_fact(uuid,uuid)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('joinclara.document_extractionsdeonde.id=dr.extraction_idandde.firm_id=dr.firm_id'
       in v_src)=0
     or position('dr.id=p_regionanddr.firm_id=p_firmandde.firm_id=p_firm'
       in v_src)=0
     or position('fromclara._derive_opening_region_fact(r.field_path,r.text_content,r.monetary_cents)'
       in v_src)=0
     or position('r.opening_account_codeisdistinctfromf.account_code' in v_src)=0
     or position('r.opening_amount_centsisdistinctfromf.amount_cents' in v_src)=0
     or position('r.opening_sideisdistinctfromf.side' in v_src)=0
     or position('account_code:=f.account_code' in v_src)=0
     or position('amount_cents:=f.amount_cents' in v_src)=0
     or position('side:=f.side' in v_src)=0 then
    raise exception '0017 R3-F1 evidence re-derivation assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('v_amount:=greatest(p_debit,p_credit)' in v_src)=0
     or position('f.account_codeisdistinctfromp_account' in v_src)=0
     or position('f.amount_centsisdistinctfromv_amount' in v_src)=0
     or position('f.sideisdistinctfromv_side' in v_src)=0
     or position('p_debit>0andp_credit=0then''debit''' in v_src)=0
     or position('p_credit>0andp_debit=0then''credit''' in v_src)=0 then
    raise exception '0017 R2-F1 target fact comparison assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('_assert_opening_target_fact(s.firm_id,p_document,j->''extraction_ref'',v_account,v_debit,v_credit)'
       in v_src)=0
     or position('j?''opening_fact''' in v_src)=0
     or position('v_asserted_accountisdistinctfromv_account' in v_src)=0
     or position('v_asserted_amountisdistinctfromgreatest(v_debit,v_credit)'
       in v_src)=0
     or position('v_asserted_sideisdistinctfrom(casewhenv_debit>0then''debit''else''credit''end)'
       in v_src)=0
     or position('"reason":"opening_extraction_fact_mismatch"' in v_src)=0
     or position('fromclara.documentswhereid=p_documentandfirm_id=s.firm_id'
       in v_src)=0
     or position('p_documentisdistinctfroms.tie_document_id' in v_src)=0
     or position('values(s.firm_id,s.client_id,p_seed,v_key,v_account' in v_src)=0 then
    raise exception '0017 R2-F1 parsed writer assertion failed' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('_assert_opening_target_fact(s.firm_id,s.tie_document_id,q.extraction_ref,q.account_code,q.debit_cents,q.credit_cents)'
       in v_src)=0
     or position('t.document_idisdistinctfroms.tie_document_id' in v_src)=0
     or position('t.source_sha256isdistinctfroms.tie_document_sha256' in v_src)=0
     or position('t.provenance_kind<>''document''' in v_src)=0
     or position('t.provenance_kind<>''keyed''' in v_src)=0
     or regexp_count(v_src,
       't[.]seed_id=s[.]idandt[.]firm_id=s[.]firm_idandt[.]client_id=s[.]client_id')<3 then
    raise exception '0017 R2-F1 K5 evidence assertion failed' using errcode='CLR10';
  end if;

  -- [R3-F5] F3: pin full firm/client/seed predicates, shared as-of
  -- comparisons, reversal inclusion, and UNION (not UNION ALL) de-duplication.
  select prosrc into v_src from pg_proc
    where oid='clara._opening_seed_basis(uuid)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('selectidseed_id,firm_id,client_id,as_offromclara.opening_seed_registrywhereid=p_seed'
       in v_src)=0
     or regexp_count(v_src,'e[.]client_id=s[.]client_idande[.]firm_id=s[.]firm_id')<>2
     or position('e.status=''approved''ande.posting_date<=s.as_of' in v_src)=0
     or position('e.status=''draft''ande.posting_date<=s.as_of' in v_src)=0
     or position('oi.seed_id=s.seed_idandoi.firm_id=s.firm_idandoi.client_id=s.client_idandoi.entry_id=e.id'
       in v_src)=0
     or position('oi.seed_id=s.seed_idandoi.firm_id=s.firm_idandoi.client_id=s.client_idandoi.entry_id=e.reversal_of'
       in v_src)=0
     or position('l.entry_id=ce.idandl.firm_id=ce.firm_idandl.client_id=ce.client_id'
       in v_src)=0
     or position('s.as_ofunionselecte.id,e.firm_id,e.client_id' in v_src)=0
     or position('unionallselecte.id' in v_src)>0 then
    raise exception '0017 R1-F3 canonical basis assertion failed' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._opening_seed_deltas(uuid,boolean)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('fromclara._opening_seed_basis(p_seed)b' in v_src)=0
     or position('joinclara.opening_tb_targetstont.seed_id=s.idandt.firm_id=s.firm_idandt.client_id=s.client_id'
       in v_src)=0
     or position('wheres.id=p_seed' in v_src)=0
     or position('coalesce(a.debit,0)-coalesce(t.debit,0)' in v_src)=0
     or position('coalesce(a.credit,0)-coalesce(t.credit,0)' in v_src)=0 then
    raise exception '0017 R1-F3 delta basis assertion failed' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._assert_opening_tie(uuid)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('delta_debit<>0ordelta_credit<>0' in v_src)=0
     or position('v_net<>0' in v_src)=0 then
    raise exception '0017 R1-F3 tie comparison assertion failed' using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara.get_opening_dryrun(uuid)',
    'clara.run_client_lint(uuid,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    v_src:=regexp_replace(lower(v_src),'\s+','','g');
    if position('_opening_seed_deltas' in v_src)=0
       or position('_opening_seed_obe_net' in v_src)=0 then
      raise exception '0017 R1-F3 consumer assertion failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- [R2-F5] F4: normalized boolean text pins the role-plus-GUC conjunction;
  -- either a missing marker OR a non-runtime role reaches the refusal.
  foreach v_sig in array array[
    'clara.get_wiki_page(uuid,text)','clara.list_wiki_pages(uuid)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    v_src:=regexp_replace(lower(v_src),'\s+','','g');
    if position(
      'ifcurrent_setting(''clara.pack_consumer'',true)isdistinctfrom''v25''or(session_user<>''clara_runtime''andcurrent_setting(''role'',true)isdistinctfrom''clara_runtime'')then'
      in v_src)=0 then
      raise exception '0017 R1-F4 read-lane conjunction assertion failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- [R2-F5] F6/F7/F8: pin the replay field mappings, the lock-before-cap
  -- comparison, both active-filing comparisons, and the retirement/move lock
  -- helper's current-version/active-page semantics.
  select prosrc into v_src from pg_proc where oid=
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('''page_id'',v_page,''version_id'',v_version,''version_n'',v_n,''slug'',p_slug,''page_kind'',p_page_kind'
       in v_src)=0
     or position('''storage_key'',p_storage_key,''content_sha256'',p_content_sha256,''size_bytes'',v_size'
       in v_src)=0
     or position('''synthesis'',p_synthesis,''engine_id'',p_engine_id,''projected_from_seq'',p_projected_from_seq'
       in v_src)=0
     or position('''citations'',p_citations,''refs'',p_refs' in v_src)=0 then
    raise exception '0017 R1-F6 replay field-mapping assertion failed'
      using errcode='CLR10';
  end if;
  if position('wherec.id=p_clientandc.firm_id=p_firmforupdate' in v_src)=0
     or position('whereclient_id=p_clientandstate=''active'')>=v_max_pages' in v_src)=0
     or position('wherec.id=p_clientandc.firm_id=p_firmforupdate' in v_src)>
        position('whereclient_id=p_clientandstate=''active'')>=v_max_pages' in v_src) then
    raise exception '0017 R1-F7 cap lock ordering assertion failed'
      using errcode='CLR10';
  end if;
  if regexp_count(v_src,
       'df[.]client_id=p_clientanddf[.]retired_atisnull')<>2 then
    raise exception '0017 R1-F8 publication filing comparison assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('wherec.id=p_clientandc.firm_id=p_firmforupdate' in v_src)=0
     or position('c.version_id=p.current_version_id' in v_src)=0
     or regexp_count(v_src,'p[.]state=''active''')<>2
     or position('r.ref_kind=''document''andr.document_id=p_document' in v_src)=0
     or position('''reason'',''active_wiki_document_reference''' in v_src)=0 then
    raise exception '0017 R2-F2 filing/wiki blocker assertion failed'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara.retire_document_filing(uuid,text,uuid,text)',
    'clara.approve_wrong_client_correction(uuid,text,text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    v_src:=regexp_replace(lower(v_src),'\s+','','g');
    if position('_assert_filing_wiki_unreferenced' in v_src)=0
       or position('_assert_filing_wiki_unreferenced' in v_src)>
          position('updateclara.document_filingssetretired_at' in v_src) then
      raise exception '0017 R2-F2 filing transition assertion failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array array[
    'clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)',
    'clara.record_wiki_source_ingest(uuid,uuid,text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    v_src:=regexp_replace(lower(v_src),'\s+','','g');
    if position('v_result||jsonb_build_object(''reconstruction_schema'',1,''state'',''published'''
         in v_src)=0 then
      raise exception '0017 R1-F6 replay state assertion failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- [R1-F9] OBE plug polarity remains semantically pinned.
  select prosrc into v_src from pg_proc where oid=
    'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure;
  if position('p_lines must be null' in v_src)=0
     or position('special_acc_type=''opening_balance_equity''' in v_src)=0
     or position('v_amount<0' in v_src)=0 or position('v_amount>0' in v_src)=0 then
    raise exception '0017 R1-F9 OBE plug assertion failed' using errcode='CLR10';
  end if;
  -- [R3-F5][R3-F4] Initial and replacement assets stage pending, K5 activates
  -- only approved initials, K6 retains its two-row hand-off, and the baseline
  -- helper enforces draft<->pending / approved<->active correspondence.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.fixed_assets'::regclass
      and conname='fixed_assets_status_check_0017';
  if coalesce(v_def,'') not ilike '%pending%' then
    raise exception '0017 R3-F4 pending asset state assertion failed'
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid='clara.fixed_assets'::regclass
      and conname='ck_fixed_assets_pending_lineage_0017';
  v_def:=regexp_replace(lower(coalesce(v_def,'')),'\s+','','g');
  if position('status<>''pending''::text' in v_def)=0
     or position('acquisition_entry_idisnotnull' in v_def)=0
     or position('supersedes_asset_idisnotnull' in v_def)>0 then
    raise exception '0017 R3-F4 initial-pending lineage assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('v_entry,v_accum,(a->>''depreciation_start_date'')::date,s.as_of,''pending'',v_supersedes_asset'
       in v_src)=0 then
    raise exception '0017 R3-F4 all-drafts-pending assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara._assert_fa_baseline(uuid)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('oi.seed_id=s.idandoi.firm_id=s.firm_idandoi.client_id=s.client_id'
       in v_src)=0
     or position('fa.id=oi.fixed_asset_idandfa.firm_id=oi.firm_idandfa.client_id=oi.client_id'
       in v_src)=0
     or position('je.id=oi.entry_idandje.firm_id=oi.firm_idandje.client_id=oi.client_id'
       in v_src)=0
     or position('je.status=''draft''andfa.status=''pending''' in v_src)=0
     or position('je.status=''approved''andfa.status=''active''' in v_src)=0
     or position('oi.state=''superseded''andje.status=''approved''andfa.status=''superseded'''
       in v_src)=0 then
    raise exception '0017 R3-F4 FA correspondence assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('updateclara.fixed_assetsfasetstatus=''active'',updated_at=now()fromclara.opening_itemsoi,clara.journal_entriesje'
       in v_src)=0
     or position('oi.seed_id=p_seedandoi.item_kind=''fixed_asset''andoi.state=''active''andoi.supersedes_item_idisnull'
       in v_src)=0
     or position('fa.status=''pending''andfa.supersedes_asset_idisnull' in v_src)=0
     or position('je.id=oi.entry_idandje.firm_id=oi.firm_idandje.client_id=oi.client_idandje.status=''approved'''
       in v_src)=0
     or regexp_count(v_src,'performclara[.]_assert_fa_baseline[(]p_seed[)]')<2 then
    raise exception '0017 R3-F4 K5 activation effect assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('status=casewhenfa.id=oi.fixed_asset_idthen''superseded''else''active''end'
       in v_src)=0
     or position('fa.status=''active''' in v_src)=0
     or position('fa.status=''pending''' in v_src)=0
     or position('v_asset_transition_count<>2' in v_src)=0
     or regexp_count(v_src,'performclara[.]_assert_fa_baseline[(]p_seed[)]')<2 then
    raise exception '0017 R2-F3 atomic asset handoff assertion failed'
      using errcode='CLR10';
  end if;
  if position('ife.last_human_editor=c.actorthen' in v_src)=0
     or position('clara.eligible_checker_count(c.firm)>=2' in v_src)=0
     or position('ife.last_human_editor=c.actorthen' in v_src)>
        position('performclara._assert_opening_tie(p_seed)' in v_src) then
    raise exception '0017 R1-F12 K6 checker-order assertion failed'
      using errcode='CLR10';
  end if;

  -- [R3-F5][R3-F3] Contributor assertions pin the helper's write effect and
  -- arguments, then pin every public material boundary to the correct plan and
  -- actor. A helper-name token without the update+snapshot effect cannot pass.
  if not exists(select 1 from pg_attribute
      where attrelid='clara.onboarding_plans'::regclass
        and attname='contributors' and atttypid='uuid[]'::regtype
        and attnotnull and not attisdropped) then
    raise exception '0017 R2-F4 contributor-set column assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara._record_onboarding_contributor(uuid,uuid)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('whereid=p_planforupdate' in v_src)=0
     or position('p_actor=any(p.contributors)' in v_src)=0
     or position('fromunnest(p.contributors||array[p_actor])asx(contributor)'
       in v_src)=0
     or position('updateclara.onboarding_planssetcontributors=v_contributors,revision_n=v_n,revision_token=gen_random_uuid(),updated_at=now()whereid=p_plan'
       in v_src)=0
     or position('insertintoclara.onboarding_plan_revisions(plan_id,revision_n,snapshot)values(p_plan,v_n,clara._onboarding_plan_snapshot(p_plan))'
       in v_src)=0 then
    raise exception '0017 R3-F3 contributor helper effect assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('c.actor=any(p.contributors)' in v_src)=0
     or position('clara.eligible_checker_count(c.firm)>=2' in v_src)=0
     or position('nullif(btrim(p_attestation),'''')isnull' in v_src)=0 then
    raise exception '0017 R2-F4 Gate O contributor assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('_reserve_op' in v_src)=0
     or position('_reserve_op' in v_src)>
        position('staleonboardingplanrevision' in v_src)
     or position('updateclara.onboarding_planssetrevision_token=v_token,revision_n=v_n,contributors=(selectarray_agg(distinctx.contributororderbyx.contributor)fromunnest(contributors||array[p_answered_by])asx(contributor)),updated_at=now()whereid=p_plan'
       in v_src)=0 then
    raise exception '0017 R2-F4 answer contributor/receipt assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.resolve_onboarding_plan_item(uuid,text,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('updateclara.onboarding_planssetrevision_token=v_token,revision_n=v_n,contributors=(selectarray_agg(distinctx.contributororderbyx.contributor)fromunnest(contributors||array[c.actor])asx(contributor)),updated_at=now()whereid=p_plan'
       in v_src)=0 then
    raise exception '0017 R2-F4 resolution contributor assertion failed'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara.create_opening_seed(uuid,uuid,date,uuid,text,text)',
    'clara.cancel_opening_seed(uuid,text,text)',
    'clara.record_opening_target(uuid,jsonb,text)',
    'clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
    'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
    'clara.reopen_opening_seed(uuid,text,text)',
    'clara.supersede_opening_item(uuid,jsonb,text)',
    'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
    'clara.approve_opening_correction(uuid,jsonb,text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    v_src:=regexp_replace(lower(v_src),'\s+','','g');
    v_def:=case v_sig
      when 'clara.create_opening_seed(uuid,uuid,date,uuid,text,text)'
        then 'performclara._record_onboarding_contributor(p_plan,c.actor)'
      when 'clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)'
        then 'performclara._record_onboarding_contributor(s.plan_id,s.created_by)'
      when 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'
        then 'performclara._record_onboarding_contributor(s.plan_id,p_actor)'
      when 'clara.supersede_opening_item(uuid,jsonb,text)'
        then 'performclara._record_onboarding_contributor(s.plan_id,c.actor)'
      else 'performclara._record_onboarding_contributor(s.plan_id,c.actor)'
    end;
    if position(v_def in v_src)=0
       or (v_sig='clara.supersede_opening_item(uuid,jsonb,text)'
         and position(v_def in v_src)<
           position('v_replacement_item:=v_reversal_item;endif;' in v_src)) then
      raise exception '0017 R3-F3 contributor boundary effect failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select prosrc into v_src from pg_proc where oid=
    'clara.draft_opening_item(uuid,uuid,jsonb,jsonb,uuid,uuid,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('clara._draft_opening_item_core(c.actor,c.firm,p_client,p_seed,p_item,p_lines,p_resolution,p_document,p_sha256)'
       in v_src)=0 then
    raise exception '0017 R3-F3 draft boundary dispatch assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.seed_fixed_asset(uuid,uuid,jsonb,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('clara._draft_opening_item_core(c.actor,c.firm,p_client,p_seed,v_item,null,v_resolution,v_document,v_sha)'
       in v_src)=0 then
    raise exception '0017 R3-F3 fixed-asset boundary dispatch assertion failed'
      using errcode='CLR10';
  end if;

  -- [R5-F1] Effect-sensitive event-tail assertions pin the exact generic
  -- draft-family attribution/payload, call count, and audit -> event -> receipt
  -- order. Supersede pins reversal before its conditional replacement event.
  select prosrc into v_src from pg_proc where oid=
    'clara.draft_opening_item(uuid,uuid,jsonb,jsonb,uuid,uuid,text,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  v_def:='performclara._append_event(c.firm,''entry.drafted'',p_client,c.actor,null,null,(v_result->>''entry_id'')::uuid,p_document,p_resolution,''{}''::jsonb);';
  if regexp_count(v_src,'performclara[.]_append_event[(]')<>1
     or position(v_def in v_src)=0
     or position('performclara._audit(' in v_src)=0
     or position('performclara._audit(' in v_src)>position(v_def in v_src)
     or position(v_def in v_src)>
        position('returnclara._finish_op(c.firm,''draft_opening_item'',p_op_key,v_result)' in v_src) then
    raise exception '0017 R5-F1 draft-opening event-tail assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.seed_fixed_asset(uuid,uuid,jsonb,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  v_def:='performclara._append_event(c.firm,''entry.drafted'',p_client,c.actor,null,null,(v_result->>''entry_id'')::uuid,v_document,v_resolution,''{}''::jsonb);';
  if regexp_count(v_src,'performclara[.]_append_event[(]')<>1
     or position(v_def in v_src)=0
     or position('performclara._audit(' in v_src)=0
     or position('performclara._audit(' in v_src)>position(v_def in v_src)
     or position(v_def in v_src)>
        position('returnclara._finish_op(c.firm,''seed_fixed_asset'',p_op_key,v_result)' in v_src) then
    raise exception '0017 R5-F1 fixed-asset event-tail assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc where oid=
    'clara.supersede_opening_item(uuid,jsonb,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  v_def:='performclara._append_event(c.firm,''entry.drafted'',s.client_id,c.actor,null,null,v_rev,e.document_id,e.resolution_id,''{}''::jsonb);';
  v_name:='performclara._append_event(c.firm,''entry.drafted'',s.client_id,c.actor,null,null,(v_replacement->>''entry_id'')::uuid,coalesce(nullif(p_replacement->>''document_id'','''')::uuid,e.document_id),coalesce(nullif(p_replacement->>''resolution_id'','''')::uuid,e.resolution_id),''{}''::jsonb);';
  if regexp_count(v_src,'performclara[.]_append_event[(]')<>2
     or position(v_def in v_src)=0 or position(v_name in v_src)=0
     or position('performclara._audit(' in v_src)=0
     or position('performclara._audit(' in v_src)>position(v_def in v_src)
     or position(v_def in v_src)>position('ifv_replacementisnotnullthen' in v_src)
     or position('ifv_replacementisnotnullthen' in v_src)>position(v_name in v_src)
     or position(v_name in v_src)>
        position('returnclara._finish_op(c.firm,''supersede_opening_item'',p_op_key,v_result)' in v_src) then
    raise exception '0017 R5-F1 supersede event-tail assertion failed'
      using errcode='CLR10';
  end if;

  -- [R2-F5] F6 guard: both recovery and task-completion paths (including
  -- attempt release) carry their own exact ACTIVE-client comparisons.
  select prosrc into v_src from pg_proc
    where oid='clara.reconcile_sweep_runs()'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('active_recovery_client.id=a.client_idandactive_recovery_client.firm_id=a.firm_idandactive_recovery_client.status=''active'''
       in v_src)=0
     or position('active_completion_client.id=a.client_idandactive_completion_client.firm_id=a.firm_idandactive_completion_client.status=''active'''
       in v_src)=0
     or position('active_release_client.id=aa.client_idandactive_release_client.firm_id=aa.firm_idandactive_release_client.status=''active'''
       in v_src)=0 then
    raise exception '0017 R2-F6 sweep reconciler assertion failed'
      using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  if position('_assert_client_operational' in v_src)=0 then
    raise exception '0017 draft operational guard assertion failed' using errcode='CLR10';
  end if;
  select prosrc into v_src from pg_proc
    where oid='clara.create_firm(text,uuid,text)'::regprocedure;
  if position('consumed_op_key' in v_src)=0 then
    raise exception '0017 create_firm receipt assertion failed' using errcode='CLR10';
  end if;
  -- [R3-F5][R3-F2] Every granted client-minting body is a closed onboarding
  -- set, and the pre-0017 bridge proves its plan/item writes, unchanged status,
  -- audit receipt, and event arguments.
  if exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
    join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and a.privilege_type='EXECUTE'
      and r.rolname in ('clara_authenticated','clara_runtime',
        'clara_agent_ro','clara_wake_interactive','clara_wake_proactive')
      and regexp_replace(lower(p.prosrc),'\s+','','g')
        like '%insertintoclara.clients(%'
      and p.proname not in ('create_client','begin_client_onboarding')) then
    raise exception '0017 R3-F2 ungoverned granted client creator detected'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara.create_client(text,text)',
    'clara.begin_client_onboarding(text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    v_src:=regexp_replace(lower(v_src),'\s+','','g');
    if position('insertintoclara.clients(firm_id,name,status)' in v_src)=0
       or position('''onboarding'')returningidintov_client' in v_src)=0
       or position('insertintoclara.onboarding_plans(' in v_src)=0
       or position('values(c.firm,''client'',v_client,c.actor,now(),array[c.actor])'
         in v_src)=0
       or position('client.onboarding_started' in v_src)=0 then
      raise exception '0017 R3-F2 onboarding creator CoR failed for %',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select prosrc into v_src from pg_proc where oid=
    'clara.bootstrap_client_plan(uuid,text)'::regprocedure;
  v_src:=regexp_replace(lower(v_src),'\s+','','g');
  if position('ifcl.status<>''active''then' in v_src)=0
     or position('insertintoclara.onboarding_plans(' in v_src)=0
     or position('''todo'',''carry_down_deferred''' in v_src)=0
     or position('''deferred'',false,c.actor,now()' in v_src)=0
     or position('updateclara.clients' in v_src)>0
     or position('''bootstrap_client_plan''' in v_src)=0
     or position('''onboarding.plan_bootstrapped'',p_client,c.actor' in v_src)=0 then
    raise exception '0017 R3-F2 active-client bootstrap effect assertion failed'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara.classify_document(uuid,text,numeric,text,text)',
    'clara.set_document_kind(uuid,text,text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    if position('prior_gl' in v_src)=0 then
      raise exception '0017 prior_gl CoR assertion failed for %',v_sig using errcode='CLR10';
    end if;
  end loop;

  -- Wiki must never enter authority/bound/floor/autopost or K/S writers.
  foreach v_name in array array[
    '_approve_entry_core','_draft_entry_core','draft_entry','wake_draft_entry',
    'approve_entry','execute_rule_post','propose_coding_rule','sign_coding_rule',
    'propose_autopost_rule','sign_autopost_rule','reconcile_autopost_rules',
    '_assert_supplier_bill_shape','_assert_supplier_bill_shape_at',
    'is_high_stakes','assert_client_resolved','assert_books_current',
    'assert_provenance','_open_question_blocks','evaluate_sst_watch','coding_lane',
    'create_opening_seed','cancel_opening_seed','draft_opening_item',
    'seed_fixed_asset','approve_opening_seed','reopen_opening_seed',
    'supersede_opening_item','approve_opening_correction',
    'create_seeding_batch','tick_seeding_proposal','decline_seeding_proposal',
    'complete_seeding_batch','cancel_seeding_batch'
  ] loop
    -- [R1-F15] Match qualified and search_path-relative references with the
    -- same word-bounded seven-table-family expression as wb-w-pack.
    if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara' and p.proname=v_name
          and p.prosrc ~* '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M') then
      raise exception '0017 wiki authority dependency leaked into %',v_name
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_name in array array[
    'approve_opening_seed','_approve_opening_entry',
    'approve_opening_correction','create_seeding_batch',
    'tick_seeding_proposal','decline_seeding_proposal',
    'complete_seeding_batch','cancel_seeding_batch'
  ] loop
    select string_agg(p.prosrc,chr(10)) into v_src
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_name;
    if coalesce(v_src,'') ilike '%insert into clara.rule_sightings%'
       or coalesce(v_src,'') ilike '%autopost%' then
      raise exception '0017 opening/seeding authority leak in %',v_name
        using errcode='CLR10';
    end if;
  end loop;
  select prosrc into v_src from pg_proc
    where oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_src ilike '%lint%' or v_src ilike '%compliance%'
     or v_src ilike '%evaluate_sst%' then
    raise exception '0017 generic approve core gained watch/lint logic' using errcode='CLR10';
  end if;

  -- Granted functions that touch wiki data are an explicit closed set.
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
    join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and a.privilege_type='EXECUTE'
      and r.rolname in ('clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive')
      -- [R1-F15] Keep the inverse granted-function scan identical.
      and p.prosrc ~* '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M'
      and p.proname not in (
        'publish_wiki_page_version','record_wiki_source_ingest',
        'retire_wiki_page','set_wiki_synthesis_hold','clear_wiki_synthesis_hold',
        'get_wiki_page','list_wiki_pages','get_context_pack',
        'run_client_lint')) then
    raise exception '0017 a granted non-whitelisted function references wiki data'
      using errcode='CLR10';
  end if;

  -- Named grant matrix; no new signature reaches agent or wake roles.
  foreach v_sig in array v_runtime_only loop
    if not has_function_privilege('clara_runtime',v_sig,'execute')
       or has_function_privilege('clara_authenticated',v_sig,'execute') then
      raise exception '0017 runtime-only ACL failed for %',v_sig using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array v_auth_only loop
    if not has_function_privilege('clara_authenticated',v_sig,'execute')
       or has_function_privilege('clara_runtime',v_sig,'execute') then
      raise exception '0017 auth-only ACL failed for %',v_sig using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array array[
    'clara.get_wiki_page(uuid,text)','clara.list_wiki_pages(uuid)',
    'clara.trial_balance_as_of(uuid,date)'
  ] loop
    if not has_function_privilege('clara_authenticated',v_sig,'execute')
       or not has_function_privilege('clara_runtime',v_sig,'execute') then
      raise exception '0017 dual-read ACL failed for %',v_sig using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array v_new_sigs loop
    if has_function_privilege('clara_agent_ro',v_sig,'execute')
       or has_function_privilege('clara_wake_interactive',v_sig,'execute')
       or has_function_privilege('clara_wake_proactive',v_sig,'execute') then
      raise exception '0017 agent/wake role gained EXECUTE on %',v_sig using errcode='CLR10';
    end if;
  end loop;

  -- No new allowlist row and no PUBLIC execute anywhere in clara.
  if exists(select 1 from clara.wake_fn_allowlist where function_name in (
      select split_part(split_part(s,'clara.',2),'(',1)
      from unnest(v_new_sigs) s)) then
    raise exception '0017 function leaked into wake_fn_allowlist' using errcode='CLR10';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(
        coalesce(p.proacl,acldefault('f',p.proowner))) a
      where n.nspname='clara' and a.grantee=0
        and a.privilege_type='EXECUTE') then
    raise exception '0017 PUBLIC execute sweep assertion failed' using errcode='CLR10';
  end if;

  -- Exact config seeds.
  if (select count(*) from clara.wiki_budgets)<>4
     or not exists(select 1 from clara.wiki_budgets
       where budget_key='max_pages_per_client' and value_int=40)
     or not exists(select 1 from clara.wiki_budgets
       where budget_key='max_page_bytes' and value_int=8192)
     or not exists(select 1 from clara.wiki_budgets
       where budget_key='pack_max_pages' and value_int=6)
     or not exists(select 1 from clara.wiki_budgets
       where budget_key='pack_max_bytes' and value_int=12288) then
    raise exception '0017 wiki budget seed assertion failed' using errcode='CLR10';
  end if;
  foreach v_name in array array[
    'wiki.page_published','wiki.page_retired','wiki.source_ingested',
    'lint.finding_transition','client.onboarding_started',
    'onboarding.plan_bootstrapped','client.activated',
    'onboarding.plan_committed','opening_seed.batch_approved',
    'opening_seed.reopened','opening_item.superseded',
    'seeding.batch_created','seeding.proposal_decided',
    'seeding.batch_completed'
  ] loop
    if not exists(select 1 from clara.event_types where name=v_name)
       or not exists(select 1 from clara.trigger_taxonomy t
         join clara.taxonomy_active a on a.version=t.version and a.singleton
         where t.event_type=v_name) then
      raise exception '0017 taxonomy pair assertion failed for %',v_name
        using errcode='CLR10';
    end if;
  end loop;
  if exists(select 1 from clara.event_types e
      left join clara.trigger_taxonomy t on t.event_type=e.name
        and t.version=(select version from clara.taxonomy_active where singleton)
      where t.event_type is null) then
    raise exception '0017 active taxonomy lacks full event coverage' using errcode='CLR10';
  end if;

  -- Every new table is FORCE-RLS with an owner policy. Direct app access is
  -- SELECT-only and never reaches the agent role.
  foreach v_name in array array[
    'wiki_budgets','wiki_pages','wiki_page_versions','wiki_page_citations',
    'wiki_page_refs','wiki_log','wiki_synthesis_holds','onboarding_plans',
    'onboarding_plan_items','onboarding_plan_revisions',
    'opening_seed_registry','opening_items','opening_tb_targets',
    'opening_seed_approvals','seeding_batches','seeding_proposals',
    'lint_findings','lint_finding_events','lint_runs'
  ] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_name
          and c.relrowsecurity and c.relforcerowsecurity)
       or not exists(select 1 from pg_policies p where p.schemaname='clara'
          and p.tablename=v_name
          and p.roles=array['clara_fn_owner']::name[]) then
      raise exception '0017 RLS/owner posture failed for %',v_name using errcode='CLR10';
    end if;
    if has_table_privilege('clara_agent_ro','clara.'||v_name,'select')
       or has_table_privilege('clara_authenticated','clara.'||v_name,'insert')
       or has_table_privilege('clara_authenticated','clara.'||v_name,'update')
       or has_table_privilege('clara_authenticated','clara.'||v_name,'delete')
       or has_table_privilege('clara_runtime','clara.'||v_name,'insert')
       or has_table_privilege('clara_runtime','clara.'||v_name,'update')
       or has_table_privilege('clara_runtime','clara.'||v_name,'delete') then
      raise exception '0017 direct table authority leaked for %',v_name using errcode='CLR10';
    end if;
  end loop;
end
$tail$;
