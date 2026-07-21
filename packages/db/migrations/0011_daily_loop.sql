-- 0011_daily_loop -- Wave-A daily coding loop: the AB-3 extraction pin,
-- counterparty identity-equivalence, DB-gated coding lanes, reserve-first
-- autodraft sweeps, governed rules/questions, revisions/diffs, and the
-- per-client invoice-facts egress registry.
--
-- Authority: .tmp/wave-a-build/INTERFACE-PINS.md (FINAL),
-- docs/plan/wave-a-migration-0011-design.md v1.1, and
-- docs/plan/wave-a-daily-loop-contract.md v1.1.
-- The runner supplies this migration's transaction.
--
-- DB-LAYER ERROR MAP (Wave-A delta):
-- CLR26 open question blocks an entry (DETAIL carries question_id + scope)
-- CLR27 governed rule refusal (role_floor, pinned_conflict, malformed,
--       duplicate_live, account_not_postable)
-- CLR28 egress refusal (no_consent, kill_switch, partial_consent,
--       evidence_mismatch, duplicate_live)
-- CLR29 sweep outcome/refusal (refused_budget, refused_attempts, lane_changed,
--       noop_existing, not_finalized)
-- CLR23 alias/merge refusal (alias_collision, registration_conflict,
--       target_retired, open_draft_blocks, cross_client)

-- =====================================================================
-- 1. AB-3 PIN -- FIRST STATEMENT BLOCK (body-only + both pinned probes)
-- =====================================================================

create or replace function clara.record_rule_resolution(p_document uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_dedupe jsonb; v_client uuid; v_n int; v_res uuid; v_fp text;
begin
  select firm_id into v_firm from clara.documents where id=p_document;
  if v_firm is null then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(v_firm,'record_rule_resolution',p_op_key,
    clara._hash(jsonb_build_object('document',p_document)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- AB-3: attribution may consume only identity-bearing OCR/structured snapshots.
  -- invoice_facts deliberately carries colliding field_path names and is not an
  -- attribution source.
  with hits as (
    select distinct ci.client_id
    from clara.document_extractions e
    join clara.document_regions r on r.extraction_id=e.id and r.firm_id=v_firm
    join clara.client_identifiers ci on ci.firm_id=v_firm
      and ci.value_normalized=lower(regexp_replace(coalesce(r.text_content,''),'\s+','','g'))
    where e.document_id=p_document and e.firm_id=v_firm and e.status='done'
      and e.engine_kind in ('ocr','structured_parse')
      and ((ci.kind='tin' and lower(coalesce(r.field_path,'')) like '%tin%')
        or (ci.kind='ssm' and lower(coalesce(r.field_path,'')) like '%ssm%')
        or (ci.kind='bank_account' and lower(coalesce(r.field_path,'')) like '%account%'))
  ) select (array_agg(client_id order by client_id))[1],count(*)::int
      into v_client,v_n from hits;

  if v_n<>1 then
    v_fp:=encode(sha256(convert_to(p_document::text||':'||coalesce(v_n,0)::text,'UTF8')),'hex');
    insert into clara.attribution_attempts(firm_id,document_id,matcher_version,input_fingerprint,
        outcome,conflict_reason)
      values(v_firm,p_document,'rule-v1',v_fp,'abstained',
        case when v_n=0 then 'no-unique-hard-identifier' else 'conflicting-hard-identifier' end)
      on conflict(document_id,matcher_version,input_fingerprint) do nothing;
    perform clara._audit(v_firm,null,null,null,'record_rule_resolution',null,
      jsonb_build_object('document',p_document,'outcome','abstained','match_count',v_n,'op_key',p_op_key));
    return clara._finish_op(v_firm,'record_rule_resolution',p_op_key,
      jsonb_build_object('resolution_id',null,'outcome','abstained','match_count',v_n));
  end if;
  insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,
      method,evidence,resolved_by)
    values(v_firm,v_client,'document',p_document,1.0,'rule','{"matcher":"rule-v1"}',null)
    on conflict(firm_id,subject_id,client_id)
      where subject_kind='document' and method='rule' and superseded_at is null
    do nothing returning id into v_res;
  if v_res is null then
    select id into v_res from clara.client_resolutions where firm_id=v_firm
      and subject_kind='document' and subject_id=p_document and client_id=v_client
      and method='rule' and superseded_at is null;
  end if;
  perform clara._audit(v_firm,null,null,null,'record_rule_resolution',null,
    jsonb_build_object('document',p_document,'client',v_client,'resolution',v_res,'op_key',p_op_key));
  perform clara._append_event(v_firm,'client.resolved',v_client,null,null,null,
    null,null,v_res,'{}'::jsonb);
  return clara._finish_op(v_firm,'record_rule_resolution',p_op_key,
    jsonb_build_object('resolution_id',v_res,'client_id',v_client,'outcome','rule_resolved'));
end $$;

-- AB-3 assertion 1: a colliding invoice_facts region is invisible to the
-- resolution engine. ZA011 rolls every fixture and append-only side effect back.
do $$
declare
  v_firm uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
  v_client uuid:=gen_random_uuid(); v_document uuid:=gen_random_uuid();
  v_extraction uuid:=gen_random_uuid(); v_sha text:=repeat('a',64); v_result jsonb;
begin
  begin
    insert into clara.firms(id,name) values(v_firm,'0011 AB-3 first-block probe');
    insert into clara.users(id,display_name,email) values(v_user,'0011 AB-3 probe',
      '0011-ab3-first-'||v_user||'@invalid.example');
    insert into clara.firm_memberships(firm_id,user_id,role) values(v_firm,v_user,'owner');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user)::text,true);
    insert into clara.clients(id,firm_id,name) values(v_client,v_firm,'0011 AB-3 client');
    insert into clara.documents(id,firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,uploaded_by,bytes_verified_at)
      values(v_document,v_firm,v_sha,'ab3.pdf','application/pdf',1,
        'firms/'||v_firm||'/docs/'||v_sha||'.pdf',v_user,now());
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values(v_firm,v_client,'tin','pinab3',v_user);
    insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count)
      values(v_extraction,v_firm,v_document,'0011-ab3','invoice_facts',1,'done',1);
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence)
      values(v_firm,v_extraction,'page_polygon',
        '{"page":1,"polygon":[0,0,1,1]}'::jsonb,'supplier.tin','PINAB3',1.0);
    v_result:=clara.record_rule_resolution(v_document,'0011-ab3-first-block');
    if v_result->>'outcome'<>'abstained' or (v_result->>'match_count')::int<>0
       or exists(select 1 from clara.client_resolutions where subject_id=v_document
          and method='rule' and superseded_at is null) then
      raise exception '0011 AB-3 invoice_facts collision probe failed' using errcode='CLR10';
    end if;
    raise exception '0011 AB-3 probe rollback' using errcode='ZA011';
  exception when sqlstate 'ZA011' then null;
  end;
end $$;

-- AB-3 assertion 2: the exceptional login-direct ACL survives CoR body replacement.
do $$
begin
  if not pg_catalog.has_function_privilege(
      'clara_runtime_login','clara.record_rule_resolution(uuid,text)','execute')
     or pg_catalog.has_function_privilege(
      'clara_runtime','clara.record_rule_resolution(uuid,text)','execute') then
    raise exception '0011 AB-3 login-direct grant was not preserved'
      using errcode='CLR10';
  end if;
end $$;

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
  if not found or t.lane<>'invoice_facts' then
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
    values(t.firm_id,t.document_id,'azure-di:prebuilt-invoice:2024-11-30',
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
        'invoice.vendor_name','invoice.invoice_id','invoice.invoice_date','invoice.deposit') then
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
    v_cents:=case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit')
                  then clara._normalize_invoice_cents(v_raw) else null end;
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
      values(t.firm_id,v_ext,'page_polygon',
        jsonb_build_object('page',v_page,'polygon',elem->'polygon'),
        v_path,v_raw,v_conf,
        case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit')
             then v_raw end,v_cents)
      returning id into v_region;
    if v_path='invoice.invoice_date' and v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin v_date:=v_raw::date; exception when others then v_date:=null; end;
    end if;
  end loop;

  perform clara._settle_processing_call(p_task,p_pages_used);
  update clara.document_processing_tasks set status='done',vendor_op_ref=p_raw_sha256,
    finished_at=now() where id=p_task;
  select * into d from clara.documents where id=t.document_id;
  update clara.documents set document_kind='invoice',
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

-- ---------------------------------------------------------------------------
-- Draft/revise/facts/approval integrations.  These are body-only replacements:
-- their public arities and shipped ACLs remain unchanged.
-- ---------------------------------------------------------------------------
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
  v_rule record; v_rule_counterparty uuid; v_rule_decision uuid;
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
  if p_coding_kind is not null and p_coding_kind<>'supplier_bill' then
    raise exception 'unsupported coding kind' using errcode='CLR10';
  end if;
  if p_coding_kind='supplier_bill'
     and (p_document is null or p_proposed_counterparty is null) then
    raise exception 'supplier bill requires a document and vendor proposal'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if p_coding_kind='supplier_bill'
     and (p_evidence is null or jsonb_typeof(p_evidence)<>'array'
          or jsonb_array_length(p_evidence)=0) then
    raise exception 'supplier-bill coding requires a cited evidence array'
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

  v_fingerprint := clara._resolve_counterparty(p_client,p_proposed_counterparty);
  v_lines := clara._validate_entry_lines(p_client,p_lines);
  v_origin := case when p_document is not null then 'document'
                   when p_is_human then 'manual' else 'agent' end;
  if p_document is null and (p_memo is null or btrim(p_memo)='') then
    raise exception 'a non-document entry requires a memo (its basis)' using errcode='CLR10';
  end if;

  begin
    insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
        document_id,filing_id,source_doc_sha256,resolution_id,is_opening_balance,
        is_year_end,tax_affecting,maker_actor,last_human_editor,
        proposed_counterparty,match_fingerprint,coding_kind)
      values(p_client,'draft',p_posting_date,p_memo,v_origin,p_document,v_filing,
        p_sha256,p_resolution,false,
        coalesce((p_flags->>'is_year_end')::boolean,false),
        coalesce((p_flags->>'tax_affecting')::boolean,false),p_actor,
        case when p_is_human then p_actor end,
        p_proposed_counterparty,v_fingerprint,p_coding_kind)
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

-- Probe AB-3 with a real colliding invoice_facts region. The deliberate ZA011
-- raise rolls the fixture and all append-only side effects back as a subtransaction.
do $$
declare
  v_firm uuid:=gen_random_uuid(); v_user uuid:=gen_random_uuid();
  v_client uuid:=gen_random_uuid(); v_document uuid:=gen_random_uuid();
  v_extraction uuid:=gen_random_uuid(); v_sha text:=repeat('a',64); v_result jsonb;
begin
  begin
    insert into clara.firms(id,name) values(v_firm,'0011 AB-3 probe');
    insert into clara.users(id,display_name,email) values(v_user,'0011 AB-3 probe',
      '0011-ab3-'||v_user||'@invalid.example');
    insert into clara.firm_memberships(firm_id,user_id,role) values(v_firm,v_user,'owner');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user)::text,true);
    insert into clara.clients(id,firm_id,name) values(v_client,v_firm,'0011 AB-3 client');
    insert into clara.documents(id,firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,uploaded_by,bytes_verified_at)
      values(v_document,v_firm,v_sha,'ab3.pdf','application/pdf',1,
        'firms/'||v_firm||'/docs/'||v_sha||'.pdf',v_user,now());
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values(v_firm,v_client,'tin','pinab3',v_user);
    insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,
        version_n,status,page_count)
      values(v_extraction,v_firm,v_document,'0011-ab3','invoice_facts',1,'done',1);
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence)
      values(v_firm,v_extraction,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,
        'supplier.tin','PINAB3',1.0);
    v_result:=clara.record_rule_resolution(v_document,'0011-ab3-probe');
    if v_result->>'outcome'<>'abstained' or (v_result->>'match_count')::int<>0
       or exists(select 1 from clara.client_resolutions where subject_id=v_document
          and method='rule' and superseded_at is null) then
      raise exception '0011 AB-3 invoice_facts collision probe failed' using errcode='CLR10';
    end if;
    raise exception '0011 AB-3 probe rollback' using errcode='ZA011';
  exception when sqlstate 'ZA011' then null;
  end;
end $$;

do $$
begin
  if not pg_catalog.has_function_privilege(
      'clara_runtime_login','clara.record_rule_resolution(uuid,text)','execute')
     or pg_catalog.has_function_privilege(
      'clara_runtime','clara.record_rule_resolution(uuid,text)','execute') then
    raise exception '0011 AB-3 login-direct record_rule_resolution grant was not preserved'
      using errcode='CLR10';
  end if;
end $$;

set role clara_fn_owner;

-- =====================================================================
-- 2. EVOLVED CARRIERS + NEW FN-FRONTED STATE
-- =====================================================================

alter table clara.counterparties
  add column merged_into uuid,
  add column retired_at timestamptz,
  add constraint fk_counterparties_merged_into foreign key
    (merged_into,firm_id,client_id) references clara.counterparties(id,firm_id,client_id),
  add constraint ck_counterparties_merge_retirement check (
    (merged_into is null and retired_at is null)
    or (merged_into is not null and retired_at is not null and merged_into<>id)
  );
create index ix_counterparties_merged_into
  on clara.counterparties(client_id,merged_into) where merged_into is not null;

alter table clara.wake_credentials
  drop constraint wake_credentials_wake_kind_check,
  add column client_id uuid,
  add constraint fk_wake_credentials_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  add constraint ck_wake_credentials_kind_0011 check (
    wake_kind in ('interactive','proactive','autodraft')),
  add constraint ck_wake_credentials_client_0011 check (
    (wake_kind='autodraft' and client_id is not null)
    or (wake_kind in ('interactive','proactive') and client_id is null)
  );

alter table clara.firm_limits
  add column sweep_budget_share numeric not null default 0.60,
  add column max_concurrent_sweeps int not null default 2,
  add constraint ck_firm_limits_sweep_budget_share check (
    sweep_budget_share>=0 and sweep_budget_share<=1),
  add constraint ck_firm_limits_max_concurrent_sweeps check (max_concurrent_sweeps>=0);

alter table clara.agent_tasks drop constraint agent_tasks_kind_check;
alter table clara.agent_tasks add constraint ck_agent_tasks_kind_0011
  check (kind in ('chat_turn','wake','autodraft'));

alter table clara.journal_entries drop constraint ck_je_match_fingerprint_shape;
alter table clara.journal_entries add constraint ck_je_match_fingerprint_shape check (
  match_fingerprint is null or (
    jsonb_typeof(match_fingerprint)='object'
    and match_fingerprint->>'decision' in
      ('registration_match','name_match_unregistered','birth','alias_match')
    and nullif(match_fingerprint->>'name_normalized','') is not null
  )
);

create table clara.counterparty_aliases (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid not null,
  client_id        uuid not null,
  counterparty_id  uuid not null,
  alias_normalized text not null check (btrim(alias_normalized)<>''),
  alias_display    text not null check (btrim(alias_display)<>''),
  origin           text not null check (origin in ('former_name','trade_name','human')),
  created_by       uuid not null references clara.users(id),
  created_at       timestamptz not null default now(),
  retired_at       timestamptz,
  unique(id,firm_id,client_id),
  constraint fk_counterparty_aliases_counterparty foreign key
    (counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint ck_counterparty_aliases_normalized check (
    alias_normalized=lower(regexp_replace(alias_display,'[^a-zA-Z0-9]','','g')))
);
create unique index uq_counterparty_aliases_live_name
  on clara.counterparty_aliases(client_id,alias_normalized) where retired_at is null;
create index ix_counterparty_aliases_counterparty
  on clara.counterparty_aliases(counterparty_id,created_at);

create table clara.sweep_runs (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null references clara.firms(id),
  state              text not null default 'open' check (state in ('open','finalized')),
  window_started_at  timestamptz not null default now(),
  window_ended_at    timestamptz,
  expected_count     int not null check (expected_count>=0),
  drafted_count      int not null default 0 check (drafted_count>=0),
  skipped_count      int not null default 0 check (skipped_count>=0),
  refused_count      int not null default 0 check (refused_count>=0),
  token_reserved     bigint not null default 0 check (token_reserved>=0),
  token_spent        bigint not null default 0 check (token_spent>=0),
  checkpoint_seq     bigint,
  acknowledged_by    uuid references clara.users(id),
  acknowledged_at    timestamptz,
  created_at         timestamptz not null default now(),
  finalized_at       timestamptz,
  constraint ck_sweep_runs_terminal check (
    (state='open' and finalized_at is null and window_ended_at is null)
    or (state='finalized' and finalized_at is not null and window_ended_at is not null)),
  constraint ck_sweep_runs_ack check (
    (acknowledged_by is null)=(acknowledged_at is null))
);
create index ix_sweep_runs_firm_state on clara.sweep_runs(firm_id,state,created_at);

create table clara.autodraft_attempts (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null,
  client_id       uuid not null,
  document_id     uuid not null,
  filing_id       uuid not null,
  task_id         uuid,
  origin          text not null check (origin in ('sweep','one_click')),
  run_id          uuid references clara.sweep_runs(id),
  attempt_count   int not null default 0 check (attempt_count>=0),
  state           text not null default 'active' check (state in ('active','parked','idle')),
  reserved_tokens bigint not null default 0 check (reserved_tokens>=0),
  usage_date      date,
  last_refusal    jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_autodraft_attempts_filing unique(filing_id),
  constraint fk_autodraft_attempts_filing foreign key
    (filing_id,firm_id,client_id,document_id)
    references clara.document_filings(id,firm_id,client_id,document_id),
  constraint fk_autodraft_attempts_task foreign key (task_id,firm_id,client_id)
    references clara.agent_tasks(id,firm_id,client_id),
  constraint ck_autodraft_attempts_reservation check (
    (state='active' and task_id is not null and reserved_tokens>0 and usage_date is not null)
    or state in ('parked','idle'))
);
create index ix_autodraft_attempts_state
  on clara.autodraft_attempts(firm_id,state,updated_at);

create table clara.sweep_run_items (
  run_id           uuid not null references clara.sweep_runs(id),
  filing_id        uuid not null,
  firm_id          uuid not null,
  client_id        uuid not null,
  document_id      uuid not null,
  outcome          text not null check (outcome in
    ('drafted','skipped_lane','refused_budget','refused_attempts','noop_existing')),
  entry_id         uuid,
  refusal_token    jsonb,
  tokens_reserved  bigint not null default 0 check (tokens_reserved>=0),
  tokens_spent     bigint not null default 0 check (tokens_spent>=0),
  created_at       timestamptz not null default now(),
  constraint pk_sweep_run_items primary key(run_id,filing_id),
  constraint fk_sweep_run_items_filing foreign key
    (filing_id,firm_id,client_id,document_id)
    references clara.document_filings(id,firm_id,client_id,document_id),
  constraint fk_sweep_run_items_entry foreign key (entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint ck_sweep_run_items_shape check (
    (outcome='drafted' and entry_id is not null)
    or (outcome<>'drafted' and entry_id is null))
);
create index ix_sweep_run_items_filing on clara.sweep_run_items(filing_id,created_at);

create table clara.coding_rules (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null,
  client_id         uuid not null,
  rule_type         text not null check (rule_type in ('vendor_account')),
  counterparty_id   uuid not null,
  account_code      text not null,
  status            text not null default 'proposed'
                    check (status in ('proposed','live','declined','retired')),
  pinned            boolean not null default false,
  origin            text not null check (origin in ('proposed','authored')),
  content_hash      text not null check (content_hash~'^[0-9a-f]{64}$'),
  created_by        uuid references clara.users(id),
  created_at        timestamptz not null default now(),
  signed_by         uuid references clara.users(id),
  signed_at         timestamptz,
  retired_by        uuid references clara.users(id),
  retired_at        timestamptz,
  retire_reason     text,
  declined_by       uuid references clara.users(id),
  declined_at       timestamptz,
  decline_reason    text,
  unique(id,firm_id,client_id),
  constraint fk_coding_rules_counterparty foreign key
    (counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint fk_coding_rules_account foreign key (client_id,account_code)
    references clara.coa_accounts(client_id,account_code),
  constraint ck_coding_rules_terminal check (
    (status='proposed' and signed_by is null and signed_at is null
      and retired_at is null and declined_at is null)
    or (status='live' and signed_by is not null and signed_at is not null
      and retired_at is null and declined_at is null)
    or (status='declined' and declined_by is not null and declined_at is not null
      and nullif(btrim(decline_reason),'') is not null and retired_at is null)
    or (status='retired' and retired_at is not null
      and nullif(btrim(retire_reason),'') is not null))
);
create unique index uq_coding_rules_one_live_vendor
  on clara.coding_rules(client_id,counterparty_id,rule_type) where status='live';
create index ix_coding_rules_client_status
  on clara.coding_rules(client_id,status,created_at);

create table clara.open_questions (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null,
  client_id         uuid not null,
  scope_kind        text not null check (scope_kind in ('document','vendor','client')),
  scope_id          uuid not null,
  document_id       uuid,
  counterparty_id   uuid,
  origin            text not null check (origin in
    ('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal','manual')),
  question_text     text not null check (btrim(question_text)<>''),
  status            text not null default 'open'
                    check (status in ('open','resolved','dismissed')),
  opener_kind       text not null check (opener_kind in ('human','wake')),
  opened_by         uuid references clara.users(id),
  opened_at         timestamptz not null default now(),
  resolved_by       uuid references clara.users(id),
  resolved_at       timestamptz,
  resolution_text   text,
  spawned_rule_id   uuid,
  constraint fk_open_questions_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_open_questions_document foreign key (document_id,firm_id)
    references clara.documents(id,firm_id),
  constraint fk_open_questions_counterparty foreign key
    (counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint ck_open_questions_scope check (
    (scope_kind='document' and scope_id=document_id and document_id is not null
      and counterparty_id is null)
    or (scope_kind='vendor' and scope_id=counterparty_id and counterparty_id is not null
      and document_id is null)
    or (scope_kind='client' and scope_id=client_id and document_id is null
      and counterparty_id is null)),
  constraint ck_open_questions_terminal check (
    (status='open' and resolved_by is null and resolved_at is null
      and resolution_text is null)
    or (status in ('resolved','dismissed') and resolved_by is not null
      and resolved_at is not null and nullif(btrim(resolution_text),'') is not null))
);
create index ix_open_questions_client_open
  on clara.open_questions(client_id,scope_kind,scope_id,opened_at) where status='open';

alter table clara.open_questions
  add constraint fk_open_questions_spawned_rule foreign key (spawned_rule_id)
    references clara.coding_rules(id);

create table clara.rule_sightings (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null,
  client_id       uuid not null,
  counterparty_id uuid not null,
  account_code    text not null,
  entry_id        uuid not null,
  created_at      timestamptz not null default now(),
  constraint uq_rule_sightings_mapping unique
    (client_id,counterparty_id,account_code,entry_id),
  constraint fk_rule_sightings_counterparty foreign key
    (counterparty_id,firm_id,client_id)
    references clara.counterparties(id,firm_id,client_id),
  constraint fk_rule_sightings_account foreign key (client_id,account_code)
    references clara.coa_accounts(client_id,account_code),
  constraint fk_rule_sightings_entry foreign key (entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id)
);
create index ix_rule_sightings_threshold
  on clara.rule_sightings(client_id,counterparty_id,account_code,created_at);

create table clara.rule_decisions (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null,
  client_id          uuid not null,
  entry_id           uuid not null,
  revision_token     uuid not null,
  rule_id            uuid not null,
  rule_type          text not null,
  counterparty_id    uuid not null,
  account_code       text not null,
  content_hash       text not null,
  pinned             boolean not null,
  account_matched    boolean not null,
  snapshot           jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_at         timestamptz not null default now(),
  constraint uq_rule_decisions_entry_revision unique(entry_id,revision_token),
  constraint fk_rule_decisions_entry foreign key (entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id),
  constraint fk_rule_decisions_rule foreign key (rule_id,firm_id,client_id)
    references clara.coding_rules(id,firm_id,client_id)
);

create table clara.journal_entry_revisions (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null,
  client_id         uuid not null,
  entry_id          uuid not null,
  revision_no       int not null check (revision_no>=0),
  revision_token    uuid not null,
  actor_kind        text not null check (actor_kind in ('human','agent','facts')),
  actor             uuid references clara.users(id),
  reason            text not null check (btrim(reason)<>''),
  header            jsonb not null check (jsonb_typeof(header)='object'),
  legs              jsonb not null check (jsonb_typeof(legs)='array'),
  rule_decision_id  uuid references clara.rule_decisions(id),
  evidence_refs     jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(evidence_refs)='array'),
  created_at        timestamptz not null default now(),
  constraint uq_journal_entry_revisions_no unique(entry_id,revision_no),
  constraint uq_journal_entry_revisions_token unique(entry_id,revision_token),
  constraint fk_journal_entry_revisions_entry foreign key (entry_id,firm_id,client_id)
    references clara.journal_entries(id,firm_id,client_id)
);
create index ix_journal_entry_revisions_walk
  on clara.journal_entry_revisions(entry_id,revision_no);

create table clara.client_egress_consents (
  id                   uuid primary key default gen_random_uuid(),
  firm_id              uuid not null,
  client_id            uuid not null,
  scope_note           text not null check (btrim(scope_note)<>''),
  evidence_document_id uuid not null,
  granted_by           uuid not null references clara.users(id),
  granted_at           timestamptz not null default now(),
  revoked_by           uuid references clara.users(id),
  revoked_at           timestamptz,
  revoke_reason        text,
  unique(id,firm_id,client_id),
  constraint fk_client_egress_consents_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_client_egress_consents_evidence foreign key
    (evidence_document_id,firm_id) references clara.documents(id,firm_id),
  constraint ck_client_egress_consents_revocation check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null
      and nullif(btrim(revoke_reason),'') is not null))
);
create unique index uq_client_egress_consents_one_live
  on clara.client_egress_consents(client_id) where revoked_at is null;
create index ix_client_egress_consents_firm_live
  on clara.client_egress_consents(firm_id,client_id) where revoked_at is null;

-- =====================================================================
-- 3. STATE-MACHINE / IMMUTABILITY TRIGGERS AND FORCE RLS
-- =====================================================================

create function clara._tf_counterparty_update_0011() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_allowed text[];
begin
  if tg_op='DELETE' then raise exception 'counterparties are retired or merged, not deleted' using errcode='CLR08'; end if;
  if old.merged_into is not null or old.retired_at is not null then
    raise exception 'a merged counterparty is immutable' using errcode='CLR08';
  end if;
  if new.merged_into is not null then
    v_allowed:=array['merged_into','retired_at','updated_at'];
  else
    v_allowed:=array['name','name_normalized','updated_at'];
  end if;
  if (to_jsonb(new)-v_allowed) is distinct from (to_jsonb(old)-v_allowed) then
    raise exception 'illegal counterparty mutation' using errcode='CLR08';
  end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger t_counterparties_update_0011 before update or delete on clara.counterparties
  for each row execute function clara._tf_counterparty_update_0011();

create function clara._tf_counterparty_alias_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'counterparty aliases are historical' using errcode='CLR08'; end if;
  if old.retired_at is not null or new.retired_at is null
     or (to_jsonb(new)-array['retired_at']) is distinct from
        (to_jsonb(old)-array['retired_at']) then
    raise exception 'counterparty alias permits only one retirement' using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_counterparty_aliases_update before update or delete
  on clara.counterparty_aliases for each row
  execute function clara._tf_counterparty_alias_update();

create function clara._tf_autodraft_attempt_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'autodraft attempts are durable' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id or new.client_id<>old.client_id
     or new.document_id<>old.document_id or new.filing_id<>old.filing_id
     or new.created_at<>old.created_at then
    raise exception 'autodraft registry identity is immutable' using errcode='CLR08';
  end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger t_autodraft_attempts_update before update or delete
  on clara.autodraft_attempts for each row execute function clara._tf_autodraft_attempt_update();

create function clara._tf_sweep_run_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'sweep runs are historical' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id
     or new.window_started_at<>old.window_started_at or new.expected_count<>old.expected_count
     or new.created_at<>old.created_at then
    raise exception 'sweep-run identity is immutable' using errcode='CLR08';
  end if;
  if old.state='finalized' and (new.state<>'finalized'
      or (to_jsonb(new)-array['acknowledged_by','acknowledged_at']) is distinct from
         (to_jsonb(old)-array['acknowledged_by','acknowledged_at'])) then
    raise exception 'finalized sweep totals are immutable' using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_sweep_runs_update before update or delete on clara.sweep_runs
  for each row execute function clara._tf_sweep_run_update();

create function clara._tf_coding_rule_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'coding rules are historical' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id or new.client_id<>old.client_id
     or new.rule_type<>old.rule_type or new.counterparty_id<>old.counterparty_id
     or new.account_code<>old.account_code or new.origin<>old.origin
     or new.content_hash<>old.content_hash or new.created_by is distinct from old.created_by
     or new.created_at<>old.created_at then
    raise exception 'coding-rule content is immutable' using errcode='CLR08';
  end if;
  v_ok:=(old.status='proposed' and new.status in ('live','declined','retired'))
    or (old.status='live' and new.status='retired');
  if new.status<>old.status and not v_ok then
    raise exception 'illegal coding-rule transition' using errcode='CLR27';
  end if;
  return new;
end $$;
create trigger t_coding_rules_update before update or delete on clara.coding_rules
  for each row execute function clara._tf_coding_rule_update();

create function clara._tf_open_question_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'open questions are historical' using errcode='CLR08'; end if;
  if old.status<>'open' or new.status not in ('resolved','dismissed')
     or (to_jsonb(new)-array['status','resolved_by','resolved_at','resolution_text','spawned_rule_id'])
        is distinct from
        (to_jsonb(old)-array['status','resolved_by','resolved_at','resolution_text','spawned_rule_id']) then
    raise exception 'illegal open-question transition' using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_open_questions_update before update or delete on clara.open_questions
  for each row execute function clara._tf_open_question_update();

create function clara._tf_egress_consent_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'egress consents are historical' using errcode='CLR08'; end if;
  if old.revoked_at is not null or new.revoked_at is null
     or (to_jsonb(new)-array['revoked_by','revoked_at','revoke_reason']) is distinct from
        (to_jsonb(old)-array['revoked_by','revoked_at','revoke_reason']) then
    raise exception 'egress consent permits only one revocation' using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_client_egress_consents_update before update or delete
  on clara.client_egress_consents for each row execute function clara._tf_egress_consent_update();

create trigger t_counterparty_aliases_no_truncate before truncate on clara.counterparty_aliases
  for each statement execute function clara._tf_no_truncate();
create trigger t_autodraft_attempts_no_truncate before truncate on clara.autodraft_attempts
  for each statement execute function clara._tf_no_truncate();
create trigger t_sweep_runs_no_truncate before truncate on clara.sweep_runs
  for each statement execute function clara._tf_no_truncate();
create trigger t_sweep_run_items_append_only before update or delete on clara.sweep_run_items
  for each row execute function clara._tf_append_only();
create trigger t_sweep_run_items_no_truncate before truncate on clara.sweep_run_items
  for each statement execute function clara._tf_no_truncate();
create trigger t_coding_rules_no_truncate before truncate on clara.coding_rules
  for each statement execute function clara._tf_no_truncate();
create trigger t_rule_sightings_append_only before update or delete on clara.rule_sightings
  for each row execute function clara._tf_append_only();
create trigger t_rule_sightings_no_truncate before truncate on clara.rule_sightings
  for each statement execute function clara._tf_no_truncate();
create trigger t_rule_decisions_append_only before update or delete on clara.rule_decisions
  for each row execute function clara._tf_append_only();
create trigger t_rule_decisions_no_truncate before truncate on clara.rule_decisions
  for each statement execute function clara._tf_no_truncate();
create trigger t_open_questions_no_truncate before truncate on clara.open_questions
  for each statement execute function clara._tf_no_truncate();
create trigger t_journal_entry_revisions_append_only before update or delete
  on clara.journal_entry_revisions for each row execute function clara._tf_append_only();
create trigger t_journal_entry_revisions_no_truncate before truncate
  on clara.journal_entry_revisions for each statement execute function clara._tf_no_truncate();
create trigger t_client_egress_consents_no_truncate before truncate
  on clara.client_egress_consents for each statement execute function clara._tf_no_truncate();

do $$
declare t text;
begin
  foreach t in array array[
    'counterparty_aliases','autodraft_attempts','sweep_runs','sweep_run_items',
    'coding_rules','rule_sightings','rule_decisions','open_questions',
    'journal_entry_revisions','client_egress_consents'
  ] loop
    execute format('alter table clara.%I enable row level security',t);
    execute format('alter table clara.%I force row level security',t);
    execute format(
      'create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)',
      t,t);
  end loop;
end $$;

-- =====================================================================
-- 4. C-1 WAKE CREDENTIAL EVOLUTION + TASK STATE MACHINES
-- =====================================================================

-- Temporarily remove wake_firm's SQL dependency on wake_context so the latter
-- can obey C-1 without CASCADE-dropping every RLS policy that calls wake_firm.
create or replace function clara.wake_firm() returns uuid
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_raw text; v_hash bytea; v_firm uuid;
begin
  v_raw:=current_setting('clara.wake_secret',true);
  if v_raw is null or v_raw='' then return null; end if;
  v_hash:=sha256(convert_to(v_raw,'UTF8'));
  select c.firm_id into v_firm from clara.wake_credentials c
  where c.secret_hash=v_hash and c.revoked_at is null and c.consumed_at is null
    and c.expires_at>statement_timestamp()
    and (c.on_behalf_of is null or exists(select 1 from clara.firm_memberships m
      where m.user_id=c.on_behalf_of and m.firm_id=c.firm_id and m.status='active'
        and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')))
  limit 1;
  return v_firm;
end $$;

drop function clara.wake_context();
drop function clara.mint_wake_credential(text,uuid,uuid,interval);

create function clara.wake_context()
  returns table(credential_id uuid,wake_kind text,firm_id uuid,
    on_behalf_of uuid,client_id uuid)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_raw text; v_hash bytea;
begin
  v_raw:=current_setting('clara.wake_secret',true);
  if v_raw is null or v_raw='' then return; end if;
  v_hash:=sha256(convert_to(v_raw,'UTF8'));
  return query
    select c.id,c.wake_kind,c.firm_id,c.on_behalf_of,c.client_id
    from clara.wake_credentials c
    where c.secret_hash=v_hash and c.revoked_at is null and c.consumed_at is null
      and c.expires_at>statement_timestamp()
      and (c.on_behalf_of is null or exists(
        select 1 from clara.firm_memberships m
        where m.user_id=c.on_behalf_of and m.firm_id=c.firm_id
          and m.status='active'
          and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')))
    limit 1;
end $$;
revoke all on function clara.wake_context() from public;

create function clara.mint_wake_credential(p_wake_kind text,p_firm uuid,
    p_on_behalf_of uuid default null,p_ttl interval default '15 minutes',
    p_client uuid default null)
  returns table(credential_id uuid,secret text)
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_secret text; v_id uuid;
begin
  if p_wake_kind is null or p_wake_kind not in ('interactive','proactive','autodraft') then
    raise exception 'bad wake_kind' using errcode='CLR10';
  end if;
  if p_firm is null or not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'unknown firm' using errcode='CLR10';
  end if;
  -- (No TTL-positivity guard: unpinned; a non-positive TTL mints an already-dead
  -- credential — harmless, and the rig's expiry probes rely on it.)
  if p_on_behalf_of is not null and not exists(
      select 1 from clara.firm_memberships where user_id=p_on_behalf_of
        and firm_id=p_firm and status='active'
        and clara.role_rank(role)>=clara.role_rank('bookkeeper')) then
    raise exception 'on_behalf_of must be an active bookkeeper+ of the firm'
      using errcode='CLR10';
  end if;
  if p_wake_kind='autodraft' then
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'autodraft wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_client is not null then
    raise exception 'legacy wake kinds do not accept a client binding' using errcode='CLR10';
  end if;
  v_secret:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind,firm_id,on_behalf_of,client_id,
      secret_hash,expires_at)
    values(p_wake_kind,p_firm,p_on_behalf_of,p_client,
      sha256(convert_to(v_secret,'UTF8')),statement_timestamp()+p_ttl)
    returning id into v_id;
  return query select v_id,v_secret;
end $$;
revoke all on function clara.mint_wake_credential(text,uuid,uuid,interval,uuid) from public;
grant execute on function clara.mint_wake_credential(text,uuid,uuid,interval,uuid)
  to clara_runtime;

create or replace function clara.wake_firm() returns uuid
  language sql stable security definer set search_path=clara,pg_temp as $$
  select firm_id from clara.wake_context() limit 1;
$$;
revoke all on function clara.wake_firm() from public;
grant execute on function clara.wake_firm() to clara_agent_ro;

create function clara.wake_client() returns uuid
  language sql stable security definer set search_path=clara,pg_temp as $$
  select client_id from clara.wake_context() limit 1;
$$;
revoke all on function clara.wake_client() from public;
grant execute on function clara.wake_client() to clara_agent_ro;

create or replace function clara._tf_agent_task_insert() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_firm uuid; v_client uuid;
begin
  if new.kind='chat_turn' then
    if new.session_id is null then raise exception 'chat_turn task requires session_id' using errcode='CLR10'; end if;
    if new.origin_intent_id is not null then raise exception 'chat_turn task cannot carry origin_intent_id' using errcode='CLR10'; end if;
    select firm_id,client_id into v_firm,v_client from clara.chat_sessions where id=new.session_id;
    if v_firm is null then raise exception 'agent_task references unknown session %',new.session_id using errcode='CLR10'; end if;
    if new.status<>'queued' then raise exception 'a chat_turn task is created queued' using errcode='CLR10'; end if;
  elsif new.kind='wake' then
    if new.origin_intent_id is null then raise exception 'wake task requires origin_intent_id' using errcode='CLR10'; end if;
    if new.session_id is not null then raise exception 'wake task cannot carry session_id' using errcode='CLR10'; end if;
    select wi.firm_id,de.client_id into v_firm,v_client
      from clara.wake_intents wi join clara.domain_events de on de.id=wi.event_id
      where wi.id=new.origin_intent_id;
    if v_firm is null then raise exception 'wake task references unknown intent %',new.origin_intent_id using errcode='CLR10'; end if;
    if new.status<>'held' then raise exception 'a wake task is created held' using errcode='CLR10'; end if;
  elsif new.kind='autodraft' then
    v_firm:=new.firm_id; v_client:=new.client_id;
    if v_firm is null or v_client is null or new.session_id is not null
       or new.origin_intent_id is not null or new.status<>'queued'
       or nullif(btrim(new.model_snapshot),'') is null
       or not exists(select 1 from clara.clients c where c.id=v_client
          and c.firm_id=v_firm and c.status='active') then
      raise exception 'autodraft task requires prevalidated firm/client, no session/intent, queued status, and model snapshot'
        using errcode='CLR10';
    end if;
  else
    raise exception 'unknown task kind %',new.kind using errcode='CLR10';
  end if;
  new.firm_id:=v_firm; new.client_id:=v_client; new.updated_at:=now();
  return new;
end $$;

create or replace function clara._tf_agent_task_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'agent_tasks are not deleted' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id
     or new.client_id is distinct from old.client_id or new.kind<>old.kind
     or new.origin_intent_id is distinct from old.origin_intent_id
     or new.session_id is distinct from old.session_id
     or new.turn_key is distinct from old.turn_key
     or new.created_by is distinct from old.created_by
     or new.model_snapshot is distinct from old.model_snapshot
     or new.created_at<>old.created_at then
    raise exception 'agent_task identity/config is immutable' using errcode='CLR08';
  end if;
  if new.status<>old.status then
    v_ok:=case
      when old.kind='chat_turn' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('awaiting_input','cancel_requested','completed','failed')
        when 'awaiting_input' then new.status in ('running','cancel_requested','expired','cancelled')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='wake' then old.status='held' and new.status='cancelled'
      when old.kind='autodraft' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      else false end;
    if not v_ok then
      raise exception 'illegal agent_task transition % -> % (kind %)',old.status,new.status,old.kind
        using errcode='CLR13';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $$;

create or replace function clara._tf_processing_task_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'document processing tasks are not deleted' using errcode='CLR08'; end if;
  if old.status in ('done','failed') then raise exception 'terminal document processing task is immutable' using errcode='CLR16'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id or new.document_id<>old.document_id
     or new.engine_id<>old.engine_id or new.engine_config<>old.engine_config
     or new.version_n<>old.version_n or new.lane<>old.lane or new.created_at<>old.created_at then
    raise exception 'document processing task identity/config is immutable' using errcode='CLR08';
  end if;
  if new.status<>old.status then
    v_ok:=(old.status='queued' and new.status in ('running','held_egress'))
      or (old.status='queued' and new.status='failed' and new.error_code in ('budget','attempt_cap'))
      or (old.status='held_egress' and new.status='queued')
      or (old.status='running' and new.status in ('done','failed','queued','held_egress'));
    if not v_ok then
      raise exception 'illegal document processing transition % -> %',old.status,new.status
        using errcode='CLR16';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $$;

-- =====================================================================
-- 5. CANONICAL COUNTERPARTY RESOLUTION (ALIASES ARE NAME-LANE CANDIDATES)
-- =====================================================================

create function clara._canonical_counterparty(p_client uuid,p_counterparty uuid)
  returns uuid language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_id uuid:=p_counterparty; v_next uuid; v_depth int:=0;
begin
  if p_client is null or p_counterparty is null then return null; end if;
  loop
    select merged_into into v_next from clara.counterparties
      where id=v_id and client_id=p_client;
    if not found then return null; end if;
    if v_next is null then return v_id; end if;
    v_depth:=v_depth+1;
    if v_depth>8 or v_next=v_id then
      raise exception 'counterparty merge chain is invalid' using errcode='CLR23';
    end if;
    v_id:=v_next;
  end loop;
end $$;
revoke all on function clara._canonical_counterparty(uuid,uuid) from public;

create or replace function clara._resolve_counterparty(p_client uuid,p_proposal jsonb)
  returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_name text; v_name_n text; v_reg text; v_reg_n text; v_existing uuid;
  v_canonical uuid; v_row record; v_alias boolean;
begin
  if p_proposal is null then return null; end if;
  if jsonb_typeof(p_proposal)<>'object' then
    raise exception 'counterparty proposal is malformed'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if p_proposal?'existing_id' and not (p_proposal?'new') then
    begin v_existing:=(p_proposal->>'existing_id')::uuid;
    exception when others then
      raise exception 'counterparty proposal is malformed'
        using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
    end;
    v_canonical:=clara._canonical_counterparty(p_client,v_existing);
    select * into v_row from clara.counterparties
      where id=v_canonical and client_id=p_client and merged_into is null and retired_at is null;
    if not found then raise exception 'selected counterparty does not belong to the client' using errcode='CLR23'; end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'decision',case when v_row.registration_normalized is null
        then 'name_match_unregistered' else 'registration_match' end,
      'counterparty_id',v_row.id,'name_normalized',v_row.name_normalized,
      'registration_normalized',v_row.registration_normalized));
  end if;
  if not (p_proposal?'new') or jsonb_typeof(p_proposal->'new')<>'object' then
    raise exception 'counterparty proposal is malformed'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  v_name:=nullif(btrim(p_proposal->'new'->>'name'),'');
  v_reg:=nullif(btrim(p_proposal->'new'->>'registration_no'),'');
  v_name_n:=lower(regexp_replace(coalesce(v_name,''),'[^a-zA-Z0-9]','','g'));
  v_reg_n:=case when v_reg is null then null else
    lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
  if v_name is null or v_name_n='' or (v_reg is not null and v_reg_n='') then
    raise exception 'counterparty proposal is malformed'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if v_reg_n is not null then
    select cp.* into v_row from clara.counterparties cp
      where cp.client_id=p_client and cp.registration_normalized=v_reg_n
      order by (cp.merged_into is null) desc,cp.id limit 1;
    if found then
      v_canonical:=clara._canonical_counterparty(p_client,v_row.id);
      select * into v_row from clara.counterparties where id=v_canonical;
      return jsonb_build_object('decision','registration_match','counterparty_id',v_row.id,
        'name_normalized',v_row.name_normalized,
        'registration_normalized',v_row.registration_normalized);
    end if;
    select cp.*,a.id is not null as via_alias into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases a on a.counterparty_id=cp.id
      and a.retired_at is null and a.alias_normalized=v_name_n
    where cp.client_id=p_client and cp.merged_into is null and cp.retired_at is null
      and (cp.name_normalized=v_name_n or a.id is not null)
      and cp.registration_normalized is not null
      and cp.registration_normalized<>v_reg_n
    order by cp.id limit 1;
    if found then
      raise exception 'counterparty registration conflicts with the name match'
        using errcode='CLR23',detail=jsonb_build_object(
          'reason','registration_conflict','candidate_id',v_row.id)::text;
    end if;
  else
    select cp.*,a.id is not null as via_alias into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases a on a.counterparty_id=cp.id
      and a.retired_at is null and a.alias_normalized=v_name_n
    where cp.client_id=p_client and cp.merged_into is null and cp.retired_at is null
      and (cp.name_normalized=v_name_n or a.id is not null)
      and cp.registration_normalized is not null
    order by cp.id limit 1;
    if found then
      raise exception 'registered name match is ambiguous without a registration number'
        using errcode='CLR23',detail=jsonb_build_object(
          'reason','registration_conflict','candidate_id',v_row.id)::text;
    end if;
    select cp.*,a.id is not null as via_alias into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases a on a.counterparty_id=cp.id
      and a.retired_at is null and a.alias_normalized=v_name_n
    where cp.client_id=p_client and cp.merged_into is null and cp.retired_at is null
      and (cp.name_normalized=v_name_n or a.id is not null)
      and cp.registration_normalized is null
    order by cp.id limit 1;
    if found then
      v_alias:=coalesce(v_row.via_alias,false) and v_row.name_normalized<>v_name_n;
      return jsonb_build_object('decision',case when v_alias then 'alias_match'
        else 'name_match_unregistered' end,'counterparty_id',v_row.id,
        'name_normalized',v_row.name_normalized);
    end if;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('decision','birth',
    'name_normalized',v_name_n,'registration_normalized',v_reg_n));
end $$;
revoke all on function clara._resolve_counterparty(uuid,jsonb) from public;

-- =====================================================================
-- 6. OPEN-QUESTION PREDICATE + DB-GATED CODING LANE
-- =====================================================================

create function clara._open_question_blocks(p_client uuid,p_filing uuid,
    p_counterparty uuid)
  returns table(question_id uuid,scope_kind text)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_document uuid; v_counterparty uuid;
begin
  select document_id into v_document from clara.document_filings
    where id=p_filing and client_id=p_client and retired_at is null;
  v_counterparty:=clara._canonical_counterparty(p_client,p_counterparty);
  return query
    select q.id,q.scope_kind from clara.open_questions q
    where q.client_id=p_client and q.status='open' and (
      q.scope_kind='client'
      or (q.scope_kind='document' and q.document_id=v_document)
      or (q.scope_kind='vendor' and clara._canonical_counterparty(
          p_client,q.counterparty_id)=v_counterparty))
    order by case q.scope_kind when 'document' then 1 when 'vendor' then 2 else 3 end,
      q.opened_at,q.id;
end $$;
revoke all on function clara._open_question_blocks(uuid,uuid,uuid) from public;

create function clara._coding_lane_core(p_client uuid,p_filing uuid)
  returns table(lane text,reasons text[])
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  f record; v_state jsonb; v_reasons text[]:='{}'::text[]; v_vendor text;
  v_fp jsonb; v_counterparty uuid; v_hard boolean:=false; v_total bigint;
  v_invoice_date text; v_rule boolean:=false;
begin
  select df.*,d.sha256 into f from clara.document_filings df
    join clara.documents d on d.id=df.document_id
    where df.id=p_filing and df.client_id=p_client and df.retired_at is null;
  if not found then
    return query select 'needs_you'::text,array['no_active_filing']::text[];
    return;
  end if;
  if exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and e.status='draft') then
    v_reasons:=array_append(v_reasons,'open_draft');
  end if;
  if exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and e.status='approved' and e.reversed_by is null) then
    v_reasons:=array_append(v_reasons,'already_coded');
  end if;
  v_state:=clara._invoice_fact_state(f.document_id);
  if v_state='{}'::jsonb then
    v_reasons:=array_append(v_reasons,'facts_pending');
  else
    if coalesce(v_state->>'corroboration_ineligible','')='multi_document' then
      v_reasons:=array_append(v_reasons,'multi_doc'); v_hard:=true;
    end if;
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      v_reasons:=array_append(v_reasons,'non_myr'); v_hard:=true;
    end if;
    if not coalesce((v_state->>'corroborated')::boolean,false) then
      v_reasons:=array_append(v_reasons,'tier_a_fails');
    end if;
  end if;
  select nullif(btrim(min(r.text_content)),'') into v_vendor
    from clara.document_regions r where r.extraction_id=(
      select e.id from clara.document_extractions e
      where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
      order by e.version_n desc,e.id desc limit 1)
      and r.field_path='invoice.vendor_name';
  if v_vendor is null then
    v_reasons:=array_append(v_reasons,'vendor_unresolved');
  else
    begin
      v_fp:=clara._resolve_counterparty(p_client,
        jsonb_build_object('new',jsonb_build_object('name',v_vendor)));
      if v_fp->>'decision'='birth' then
        v_reasons:=array_append(v_reasons,'vendor_unresolved');
      else
        v_counterparty:=(v_fp->>'counterparty_id')::uuid;
      end if;
    exception when sqlstate 'CLR23' then
      v_reasons:=array_append(v_reasons,'vendor_ambiguous'); v_hard:=true;
    end;
  end if;
  if exists(select 1 from clara._open_question_blocks(p_client,f.id,v_counterparty)) then
    v_reasons:=array_append(v_reasons,'open_question'); v_hard:=true;
  end if;
  if not exists(select 1 from clara.client_egress_consents c
      where c.client_id=p_client and c.revoked_at is null) then
    v_reasons:=array_append(v_reasons,'no_consent');
  end if;
  if exists(select 1 from clara.autodraft_attempts a
      where a.filing_id=f.id and a.state='parked') then
    v_reasons:=array_append(v_reasons,'parked');
  end if;
  if v_counterparty is not null and exists(select 1 from clara.coding_rules r
      where r.client_id=p_client and r.counterparty_id=v_counterparty
        and r.rule_type='vendor_account' and r.status='live') then
    v_reasons:=array_append(v_reasons,'rule_backed'); v_rule:=true;
  end if;
  begin v_total:=(v_state->>'total_cents')::bigint; exception when others then v_total:=null; end;
  if v_total is not null and v_total>=(select high_stakes_amount_cents
      from clara.firms where id=f.firm_id) then
    v_reasons:=array_append(v_reasons,'high_stakes');
  end if;
  v_invoice_date:=nullif(v_state->>'invoice_date','');
  if v_counterparty is not null and exists(
      select 1 from clara.journal_entries e
      where e.client_id=p_client and e.status='approved' and e.reversed_by is null
        and e.document_id is not null and exists(select 1 from clara.journal_lines l
          where l.entry_id=e.id and clara._canonical_counterparty(
            p_client,l.counterparty_id)=v_counterparty)
        and ((v_invoice_date is not null and
              clara._invoice_fact_state(e.document_id)->>'invoice_date'=v_invoice_date)
          or (v_total is not null and
              (clara._invoice_fact_state(e.document_id)->>'total_cents')::bigint=v_total))
    ) then
    v_reasons:=array_append(v_reasons,'near_duplicate');
  end if;
  if v_hard then lane:='needs_you';
  elsif coalesce(array_length(array_remove(v_reasons,'rule_backed'),1),0)=0 then lane:='ready';
  else lane:='needs_review'; end if;
  reasons:=v_reasons;
  return next;
end $$;
revoke all on function clara._coding_lane_core(uuid,uuid) from public;

create function clara.coding_lane(p_client uuid,p_filing uuid)
  returns table(lane text,reasons text[])
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null then
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'coding_lane');
    end if;
    if p_client is null or w.client_id is distinct from p_client then return; end if;
    v_firm:=w.firm_id;
  else
    v_firm:=clara.jwt_firm();
    if v_firm is null then raise exception 'no valid read context' using errcode='CLR03'; end if;
  end if;
  if not exists(select 1 from clara.clients c where c.id=p_client and c.firm_id=v_firm) then
    return;
  end if;
  return query select * from clara._coding_lane_core(p_client,p_filing);
end $$;
revoke all on function clara.coding_lane(uuid,uuid) from public;

create function clara.list_coding_lanes(p_client uuid)
  returns table(filing_id uuid,lane text,reasons text[])
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null then
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'list_coding_lanes');
    end if;
    if w.client_id is not null and w.client_id is distinct from p_client then return; end if;
    v_firm:=w.firm_id;
  else
    v_firm:=clara.jwt_firm();
    if v_firm is null then raise exception 'no valid read context' using errcode='CLR03'; end if;
  end if;
  if not exists(select 1 from clara.clients c where c.id=p_client and c.firm_id=v_firm) then return; end if;
  return query
    select f.id,l.lane,l.reasons from clara.document_filings f
    cross join lateral clara._coding_lane_core(p_client,f.id) l
    where f.client_id=p_client and f.retired_at is null order by f.filed_at,f.id;
end $$;
revoke all on function clara.list_coding_lanes(uuid) from public;

-- =====================================================================
-- 7. READ-PROLOGUE ENFORCEMENT (PIN-DELTA-2)
-- =====================================================================

create or replace function clara.list_unassigned_documents(p_limit int default 50)
  returns setof jsonb language plpgsql stable security definer
  set search_path=clara,pg_temp as $$
declare w record; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null then
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'list_unassigned_documents');
    end if;
    v_firm:=w.firm_id;
  else
    v_firm:=clara.jwt_firm();
  end if;
  if v_firm is null then raise exception 'no valid agent read context' using errcode='CLR03'; end if;
  return query select jsonb_build_object('id',d.id,'sha256',d.sha256,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'byte_size',d.byte_size,'bytes_verified_at',d.bytes_verified_at,
      'page_count',d.page_count,'extraction_status',d.extraction_status,
      'document_kind',d.document_kind,'financial_date',d.financial_date,
      'created_at',d.created_at,'unassigned',true)
    from clara.documents d where d.firm_id=v_firm and not exists(
      select 1 from clara.document_filings f where f.document_id=d.id and f.retired_at is null)
    order by d.created_at desc,d.id limit least(greatest(coalesce(p_limit,50),0),500);
end $$;

create or replace function clara.list_uncoded_filings(p_client uuid default null)
  returns setof jsonb language plpgsql stable security definer
  set search_path=clara,pg_temp as $$
declare w record; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null then
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'list_uncoded_filings');
    end if;
    if w.client_id is not null and w.client_id is distinct from p_client then return; end if;
    v_firm:=w.firm_id;
  else v_firm:=clara.jwt_firm(); end if;
  if v_firm is null then raise exception 'no valid agent read context' using errcode='CLR03'; end if;
  return query select jsonb_build_object('filing_id',f.id,'document_id',f.document_id,
      'client_id',f.client_id,'filed_at',f.filed_at,'basis',f.basis,
      'document_kind',d.document_kind,'financial_date',d.financial_date,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'extraction_status',d.extraction_status)
    from clara.document_filings f join clara.documents d on d.id=f.document_id
    where f.firm_id=v_firm and f.retired_at is null
      and (p_client is null or f.client_id=p_client)
      and not exists(select 1 from clara.journal_entries e where e.filing_id=f.id and e.status='draft')
      and not exists(select 1 from clara.journal_entries e where e.filing_id=f.id
        and e.status='approved' and e.reversed_by is null)
    order by f.filed_at,f.id;
end $$;

create or replace function clara.get_journal_entry_for(p_entry uuid,p_client uuid)
  returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null then
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_journal_entry_for');
    end if;
    if w.client_id is not null and w.client_id is distinct from p_client then return null; end if;
    v_firm:=w.firm_id;
  else v_firm:=clara.jwt_firm(); end if;
  if v_firm is null then raise exception 'no valid agent read context' using errcode='CLR03'; end if;
  return (select jsonb_build_object('entry',to_jsonb(e),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no)
      from clara.journal_lines l where l.entry_id=e.id),'[]'::jsonb))
    from clara.journal_entries e where e.id=p_entry and e.client_id=p_client
      and e.firm_id=v_firm);
end $$;

create or replace function clara.get_coding_attempt(p_task uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null and w.wake_kind not in ('interactive','proactive') then
    perform clara.assert_wake_allowed(w.wake_kind,'get_coding_attempt');
  end if;
  return (select jsonb_build_object('id',a.id,'task_id',a.task_id,'filing_id',a.filing_id,
    'document_id',a.document_id,'entry_id',a.entry_id,'client_id',a.client_id,
    'part_payload',a.part_payload,'created_at',a.created_at,
    'revision_token',e.revision_token,'entry_status',e.status,
    'exception',(e.flags?'amount_exception'))
    from clara.coding_attempts a join clara.journal_entries e on e.id=a.entry_id
    where a.task_id=p_task);
end $$;

-- =====================================================================
-- 8. COUNTERPARTY ALIAS / RENAME / IDENTITY-EQUIVALENCE MERGE WRITERS
-- =====================================================================

create function clara.add_counterparty_alias(p_client uuid,p_counterparty uuid,
    p_alias text,p_origin text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_norm text; v_id uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_counterparty is null or p_alias is null
     or nullif(btrim(p_alias),'') is null or p_origin is null
     or p_origin not in ('former_name','trade_name','human') then
    raise exception 'counterparty alias is malformed' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'add_counterparty_alias',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'alias',p_alias,'origin',p_origin)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_norm:=lower(regexp_replace(p_alias,'[^a-zA-Z0-9]','','g'));
  if v_norm='' then raise exception 'counterparty alias is malformed' using errcode='CLR10'; end if;
  if not exists(select 1 from clara.counterparties cp where cp.id=p_counterparty
      and cp.client_id=p_client and cp.firm_id=c.firm and cp.merged_into is null
      and cp.retired_at is null) then
    raise exception 'counterparty target is retired or not found'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;
  if exists(select 1 from clara.counterparties cp where cp.client_id=p_client
      and cp.name_normalized=v_norm) then
    raise exception 'alias collides with a canonical counterparty name'
      using errcode='CLR23',detail='{"reason":"alias_collision"}';
  end if;
  begin
    insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,
        alias_normalized,alias_display,origin,created_by)
      values(c.firm,p_client,p_counterparty,v_norm,btrim(p_alias),p_origin,c.actor)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'a live counterparty alias already owns this name'
      using errcode='CLR23',detail='{"reason":"alias_collision"}';
  end;
  perform clara._audit(c.firm,c.actor,null,null,'add_counterparty_alias',null,
    jsonb_build_object('client',p_client,'counterparty',p_counterparty,'alias',v_id,'op_key',p_op_key));
  return clara._finish_op(c.firm,'add_counterparty_alias',p_op_key,
    jsonb_build_object('alias_id',v_id,'counterparty_id',p_counterparty));
end $$;

create function clara.retire_counterparty_alias(p_client uuid,p_alias uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; a record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_alias is null then raise exception 'client and alias are required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'retire_counterparty_alias',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'alias',p_alias)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into a from clara.counterparty_aliases where id=p_alias for update;
  if not found or a.firm_id<>c.firm or a.client_id<>p_client then
    raise exception 'counterparty alias not found' using errcode='CLR11';
  end if;
  if a.retired_at is null then
    update clara.counterparty_aliases set retired_at=now() where id=p_alias;
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'retire_counterparty_alias',null,
    jsonb_build_object('client',p_client,'alias',p_alias,'op_key',p_op_key));
  return clara._finish_op(c.firm,'retire_counterparty_alias',p_op_key,
    jsonb_build_object('alias_id',p_alias,'status','retired'));
end $$;

create function clara.rename_counterparty(p_client uuid,p_counterparty uuid,
    p_new_name text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; cp record; v_norm text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_counterparty is null or p_new_name is null
     or nullif(btrim(p_new_name),'') is null then
    raise exception 'counterparty rename is malformed' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'rename_counterparty',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'name',p_new_name)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into cp from clara.counterparties where id=p_counterparty for update;
  if not found or cp.firm_id<>c.firm or cp.client_id<>p_client then
    raise exception 'counterparty not found' using errcode='CLR11';
  end if;
  if cp.merged_into is not null or cp.retired_at is not null then
    raise exception 'counterparty target is retired'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;
  v_norm:=lower(regexp_replace(p_new_name,'[^a-zA-Z0-9]','','g'));
  if v_norm='' then raise exception 'counterparty rename is malformed' using errcode='CLR10'; end if;
  if exists(select 1 from clara.counterparties x where x.client_id=p_client
      and x.id<>p_counterparty and x.name_normalized=v_norm)
     or exists(select 1 from clara.counterparty_aliases a where a.client_id=p_client
      and a.alias_normalized=v_norm and a.retired_at is null
      and a.counterparty_id<>p_counterparty) then
    raise exception 'counterparty name collides with an existing identity'
      using errcode='CLR23',detail='{"reason":"alias_collision"}';
  end if;
  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,
      alias_normalized,alias_display,origin,created_by)
    values(c.firm,p_client,p_counterparty,cp.name_normalized,cp.name,
      'former_name',c.actor) on conflict do nothing;
  update clara.counterparties set name=btrim(p_new_name),name_normalized=v_norm,
    updated_at=now() where id=p_counterparty;
  perform clara._audit(c.firm,c.actor,null,null,'rename_counterparty',null,
    jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'former_name',cp.name,'new_name',btrim(p_new_name),'op_key',p_op_key));
  return clara._finish_op(c.firm,'rename_counterparty',p_op_key,
    jsonb_build_object('counterparty_id',p_counterparty,'name',btrim(p_new_name)));
end $$;

create function clara.merge_counterparties(p_client uuid,p_survivor uuid,
    p_merged uuid,p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; v_dedupe jsonb; s record; m record; r record; v_new_rule uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_survivor is null or p_merged is null
     or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'merge arguments are required' using errcode='CLR10';
  end if;
  if p_survivor=p_merged then raise exception 'a counterparty cannot merge into itself' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'merge_counterparties',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'survivor',p_survivor,
      'merged',p_merged,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.counterparties cp where cp.id in (p_survivor,p_merged)
    order by cp.id for update;
  select * into s from clara.counterparties where id=p_survivor;
  select * into m from clara.counterparties where id=p_merged;
  if not found or s.id is null then raise exception 'counterparty not found' using errcode='CLR11'; end if;
  if s.firm_id<>c.firm or m.firm_id<>c.firm or s.client_id<>p_client
     or m.client_id<>p_client then
    raise exception 'counterparties are not in the same client'
      using errcode='CLR23',detail='{"reason":"cross_client"}';
  end if;
  if s.merged_into is not null or s.retired_at is not null
     or m.merged_into is not null or m.retired_at is not null then
    raise exception 'merge target is retired'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;
  if s.registration_normalized is not null and m.registration_normalized is not null
     and s.registration_normalized<>m.registration_normalized then
    raise exception 'differing registrations cannot be merged'
      using errcode='CLR23',detail='{"reason":"registration_conflict"}';
  end if;
  if exists(select 1 from clara.journal_entries e where e.client_id=p_client
      and e.status='draft' and (
        nullif(e.match_fingerprint->>'counterparty_id','')::uuid=p_merged
        or nullif(e.proposed_counterparty->>'existing_id','')::uuid=p_merged)) then
    raise exception 'an open draft cites the counterparty being merged'
      using errcode='CLR23',detail='{"reason":"open_draft_blocks"}';
  end if;
  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,
      alias_normalized,alias_display,origin,created_by)
    values(c.firm,p_client,p_survivor,m.name_normalized,m.name,'former_name',c.actor)
    on conflict do nothing;
  select * into r from clara.coding_rules where client_id=p_client
    and counterparty_id=p_merged and rule_type='vendor_account' and status='live'
    for update;
  if found then
    update clara.coding_rules set status='retired',retired_by=c.actor,
      retired_at=now(),retire_reason='merged' where id=r.id;
    if not exists(select 1 from clara.coding_rules where client_id=p_client
        and counterparty_id=p_survivor and rule_type='vendor_account' and status='live') then
      insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
          account_code,status,pinned,origin,content_hash,created_by)
        values(c.firm,p_client,'vendor_account',p_survivor,r.account_code,'proposed',
          r.pinned,'proposed',encode(sha256(convert_to(jsonb_build_object(
            'type','vendor_account','counterparty',p_survivor,
            'account_code',r.account_code)::text,'UTF8')),'hex'),c.actor)
        returning id into v_new_rule;
    end if;
  end if;
  update clara.counterparties set merged_into=p_survivor,retired_at=now(),
    updated_at=now() where id=p_merged;
  perform clara._audit(c.firm,c.actor,null,null,'merge_counterparties',null,
    jsonb_build_object('client',p_client,'survivor',p_survivor,'merged',p_merged,
      'reason',p_reason,'reissued_rule',v_new_rule,'op_key',p_op_key));
  perform clara._append_event(c.firm,'counterparty.merged',p_client,c.actor,null,null,
    null,null,null,jsonb_build_object('survivor_id',p_survivor,'merged_id',p_merged,
      'reason',p_reason,'reissued_rule_id',v_new_rule));
  return clara._finish_op(c.firm,'merge_counterparties',p_op_key,
    jsonb_build_object('survivor_id',p_survivor,'merged_id',p_merged,
      'reissued_rule_id',v_new_rule));
end $$;

-- =====================================================================
-- 9. GOVERNED CODING RULES + SERIALIZED OPEN QUESTIONS
-- =====================================================================

create function clara._open_question_core(p_actor uuid,p_firm uuid,p_obo uuid,
    p_wake_kind text,p_opener_kind text,p_client uuid,p_scope_kind text,
    p_scope_id uuid,p_question text,p_origin text) returns uuid
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_id uuid; v_document uuid; v_counterparty uuid; v_sha text;
begin
  if p_actor is null or p_firm is null or p_client is null or p_scope_kind is null
     or p_scope_id is null or p_question is null or nullif(btrim(p_question),'') is null
     or p_opener_kind not in ('human','wake')
     or p_origin not in ('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal','manual') then
    raise exception 'open question is malformed' using errcode='CLR10';
  end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=p_firm) then
    raise exception 'client not found' using errcode='CLR11';
  end if;
  if p_scope_kind='document' then
    v_document:=p_scope_id;
    select d.sha256 into v_sha from clara.documents d where d.id=v_document and d.firm_id=p_firm;
    if v_sha is null or not exists(select 1 from clara.document_filings f
        where f.document_id=v_document and f.client_id=p_client and f.retired_at is null) then
      raise exception 'question document not found' using errcode='CLR11';
    end if;
    -- CLR26 serialization vs approve_entry: lock the active filing row FOR UPDATE
    -- (approve holds it FOR SHARE to commit). SHARE-vs-UPDATE conflict ⇒ the two
    -- serialize on the existing row lock — no new advisory. FOR UPDATE also proves
    -- the verified active filing exists (its own provenance check, like
    -- _active_document_filing with p_lock).
    perform 1 from clara.document_filings f join clara.documents d on d.id=f.document_id
      where f.document_id=v_document and f.client_id=p_client and f.retired_at is null
        and d.sha256=v_sha and d.bytes_verified_at is not null
      for update of f;
  elsif p_scope_kind='vendor' then
    v_counterparty:=clara._canonical_counterparty(p_client,p_scope_id);
    if v_counterparty is null or not exists(select 1 from clara.counterparties cp
        where cp.id=v_counterparty and cp.firm_id=p_firm and cp.retired_at is null) then
      raise exception 'question vendor not found' using errcode='CLR11';
    end if;
    perform pg_advisory_xact_lock(203005003,
      hashtext(p_client::text||':'||v_counterparty::text));
  elsif p_scope_kind='client' then
    perform pg_advisory_xact_lock(203005004,hashtext(p_client::text));
  else
    raise exception 'unsupported question scope' using errcode='CLR10';
  end if;
  insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,
      document_id,counterparty_id,origin,question_text,opener_kind,opened_by)
    values(p_firm,p_client,p_scope_kind,
      case when p_scope_kind='vendor' then v_counterparty else p_scope_id end,
      v_document,v_counterparty,p_origin,btrim(p_question),p_opener_kind,p_actor)
    returning id into v_id;
  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,'open_question',null,
    jsonb_build_object('question',v_id,'client',p_client,'scope_kind',p_scope_kind,
      'scope_id',p_scope_id,'origin',p_origin));
  perform clara._append_event(p_firm,'open_question.opened',p_client,p_actor,p_obo,
    p_wake_kind,null,v_document,null,jsonb_build_object('question_id',v_id,
      'scope_kind',p_scope_kind,'scope_id',p_scope_id,'origin',p_origin));
  return v_id;
end $$;
revoke all on function clara._open_question_core(uuid,uuid,uuid,text,text,uuid,text,uuid,text,text)
  from public;

create function clara.open_question(p_client uuid,p_scope_kind text,p_scope_id uuid,
    p_question text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'open_question',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'scope_kind',p_scope_kind,
      'scope_id',p_scope_id,'question',p_question)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_id:=clara._open_question_core(c.actor,c.firm,null,null,'human',p_client,
    p_scope_kind,p_scope_id,p_question,'manual');
  return clara._finish_op(c.firm,'open_question',p_op_key,
    jsonb_build_object('question_id',v_id,'status','open'));
end $$;

-- PIN BLOCKER: interactive credentials deliberately carry client_id=NULL, so
-- the required equality against a chat session client cannot be established in
-- DB. The autodraft lane is fully pinned; the legacy interactive branch refuses
-- closed until the interface carries a verifiable session-client authority.
create function clara.wake_open_question(p_client uuid,p_scope_kind text,p_scope_id uuid,
    p_question text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare w record; v_dedupe jsonb; v_id uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind,'wake_open_question');
  if w.wake_kind<>'autodraft' or w.client_id is null
     or w.client_id is distinct from p_client then
    raise exception 'wake question client authority is not pinned' using errcode='CLR03';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(w.firm_id,'wake_open_question',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'scope_kind',p_scope_kind,
      'scope_id',p_scope_id,'question',p_question)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_id:=clara._open_question_core(clara.agent_user_id(),w.firm_id,w.on_behalf_of,
    w.wake_kind,'wake',p_client,p_scope_kind,p_scope_id,p_question,'sweep_refusal');
  return clara._finish_op(w.firm_id,'wake_open_question',p_op_key,
    jsonb_build_object('question_id',v_id,'status','open'));
end $$;

create function clara.resolve_open_question(p_question uuid,p_resolution text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; q record; v_sha text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_question is null or p_resolution is null or nullif(btrim(p_resolution),'') is null then
    raise exception 'question resolution is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'resolve_open_question',p_op_key,
    clara._hash(jsonb_build_object('question',p_question,'resolution',p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into q from clara.open_questions where id=p_question;
  if not found or q.firm_id<>c.firm then raise exception 'question not found' using errcode='CLR11'; end if;
  if q.scope_kind='document' then
    select sha256 into v_sha from clara.documents where id=q.document_id;
    perform clara._active_document_filing(q.document_id,v_sha,q.client_id,true);
  elsif q.scope_kind='vendor' then
    perform pg_advisory_xact_lock(203005003,
      hashtext(q.client_id::text||':'||clara._canonical_counterparty(
        q.client_id,q.counterparty_id)::text));
  else
    perform pg_advisory_xact_lock(203005004,hashtext(q.client_id::text));
  end if;
  select * into q from clara.open_questions where id=p_question for update;
  if q.status<>'open' then raise exception 'question is not open' using errcode='CLR10'; end if;
  update clara.open_questions set status='resolved',resolved_by=c.actor,
    resolved_at=now(),resolution_text=btrim(p_resolution) where id=p_question;
  perform clara._audit(c.firm,c.actor,null,null,'resolve_open_question',null,
    jsonb_build_object('question',p_question,'op_key',p_op_key));
  perform clara._append_event(c.firm,'open_question.resolved',q.client_id,c.actor,null,null,
    null,q.document_id,null,jsonb_build_object('question_id',p_question,'status','resolved'));
  return clara._finish_op(c.firm,'resolve_open_question',p_op_key,
    jsonb_build_object('question_id',p_question,'status','resolved'));
end $$;

create function clara.dismiss_open_question(p_question uuid,p_reason text,p_op_key text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; q record; v_sha text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_question is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'dismissal reason is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'dismiss_open_question',p_op_key,
    clara._hash(jsonb_build_object('question',p_question,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into q from clara.open_questions where id=p_question;
  if not found or q.firm_id<>c.firm then raise exception 'question not found' using errcode='CLR11'; end if;
  if q.scope_kind='document' then
    select sha256 into v_sha from clara.documents where id=q.document_id;
    perform clara._active_document_filing(q.document_id,v_sha,q.client_id,true);
  elsif q.scope_kind='vendor' then
    perform pg_advisory_xact_lock(203005003,
      hashtext(q.client_id::text||':'||clara._canonical_counterparty(
        q.client_id,q.counterparty_id)::text));
  else perform pg_advisory_xact_lock(203005004,hashtext(q.client_id::text)); end if;
  select * into q from clara.open_questions where id=p_question for update;
  if q.status<>'open' then raise exception 'question is not open' using errcode='CLR10'; end if;
  update clara.open_questions set status='dismissed',resolved_by=c.actor,
    resolved_at=now(),resolution_text=btrim(p_reason) where id=p_question;
  perform clara._audit(c.firm,c.actor,null,null,'dismiss_open_question',null,
    jsonb_build_object('question',p_question,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'open_question.resolved',q.client_id,c.actor,null,null,
    null,q.document_id,null,jsonb_build_object('question_id',p_question,'status','dismissed'));
  return clara._finish_op(c.firm,'dismiss_open_question',p_op_key,
    jsonb_build_object('question_id',p_question,'status','dismissed'));
end $$;

create function clara.promote_clarify_to_question(p_interruption uuid,p_scope_kind text,
    p_scope_id uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; i record; v_client uuid; v_id uuid; v_text text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_interruption is null or p_scope_kind is null or p_scope_id is null then
    raise exception 'clarify promotion is malformed' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'promote_clarify_to_question',p_op_key,
    clara._hash(jsonb_build_object('interruption',p_interruption,
      'scope_kind',p_scope_kind,'scope_id',p_scope_id)));
  if v_dedupe is not null then return v_dedupe; end if;
  select ai.*,t.client_id into i from clara.agent_interruptions ai
    join clara.agent_tasks t on t.id=ai.task_id where ai.id=p_interruption;
  if not found or i.firm_id<>c.firm then raise exception 'interruption not found' using errcode='CLR11'; end if;
  v_client:=i.client_id;
  v_text:=coalesce(nullif(btrim(i.question->>'question'),''),
    nullif(btrim(i.question->>'text'),''),'Clarification required');
  v_id:=clara._open_question_core(c.actor,c.firm,null,null,'human',v_client,
    p_scope_kind,p_scope_id,v_text,'clarify_promotion');
  perform clara._audit(c.firm,c.actor,null,null,'promote_clarify_to_question',null,
    jsonb_build_object('interruption',p_interruption,'question',v_id,'op_key',p_op_key));
  return clara._finish_op(c.firm,'promote_clarify_to_question',p_op_key,
    jsonb_build_object('question_id',v_id,'status','open'));
end $$;

create function clara.propose_coding_rule(p_client uuid,p_counterparty uuid,
    p_account_code text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_cp uuid; v_id uuid; v_hash text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_counterparty is null or p_account_code is null
     or nullif(btrim(p_account_code),'') is null then
    raise exception 'coding rule is malformed'
      using errcode='CLR27',detail='{"reason":"malformed"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'propose_coding_rule',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'account_code',p_account_code)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_cp:=clara._canonical_counterparty(p_client,p_counterparty);
  if v_cp is null or not exists(select 1 from clara.counterparties where id=v_cp
      and firm_id=c.firm and retired_at is null) then raise exception 'counterparty not found' using errcode='CLR11'; end if;
  if not exists(select 1 from clara.coa_accounts where client_id=p_client
      and account_code=p_account_code and is_active) then
    raise exception 'rule account is not postable'
      using errcode='CLR27',detail='{"reason":"account_not_postable"}';
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('type','vendor_account',
    'counterparty',v_cp,'account_code',p_account_code)::text,'UTF8')),'hex');
  insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
      account_code,status,pinned,origin,content_hash,created_by)
    values(c.firm,p_client,'vendor_account',v_cp,p_account_code,'proposed',false,
      'authored',v_hash,c.actor) returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'propose_coding_rule',null,
    jsonb_build_object('rule',v_id,'client',p_client,'counterparty',v_cp,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.proposed',p_client,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',v_id,'counterparty_id',v_cp));
  return clara._finish_op(c.firm,'propose_coding_rule',p_op_key,
    jsonb_build_object('rule_id',v_id,'status','proposed'));
end $$;

create function clara.sign_coding_rule(p_rule uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_rule is null then raise exception 'rule is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'sign_coding_rule',p_op_key,
    clara._hash(jsonb_build_object('rule',p_rule)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.coding_rules where id=p_rule for update;
  if not found or r.firm_id<>c.firm then raise exception 'rule not found' using errcode='CLR11'; end if;
  if r.status<>'proposed' then raise exception 'rule is not proposed' using errcode='CLR27',detail='{"reason":"malformed"}'; end if;
  if not exists(select 1 from clara.coa_accounts where client_id=r.client_id
      and account_code=r.account_code and is_active) then
    raise exception 'rule account is not postable'
      using errcode='CLR27',detail='{"reason":"account_not_postable"}';
  end if;
  begin
    update clara.coding_rules set status='live',signed_by=c.actor,signed_at=now() where id=p_rule;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_coding_rules_one_live_vendor' then
      raise exception 'a live rule already exists for this vendor'
        using errcode='CLR27',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'sign_coding_rule',null,
    jsonb_build_object('rule',p_rule,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.signed',r.client_id,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',p_rule));
  return clara._finish_op(c.firm,'sign_coding_rule',p_op_key,
    jsonb_build_object('rule_id',p_rule,'status','live'));
end $$;

create function clara.decline_coding_rule(p_rule uuid,p_reason text,p_op_key text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_rule is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'decline reason is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'decline_coding_rule',p_op_key,
    clara._hash(jsonb_build_object('rule',p_rule,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.coding_rules where id=p_rule for update;
  if not found or r.firm_id<>c.firm then raise exception 'rule not found' using errcode='CLR11'; end if;
  if r.status<>'proposed' then raise exception 'rule is not proposed' using errcode='CLR27',detail='{"reason":"malformed"}'; end if;
  update clara.coding_rules set status='declined',declined_by=c.actor,
    declined_at=now(),decline_reason=btrim(p_reason) where id=p_rule;
  perform clara._audit(c.firm,c.actor,null,null,'decline_coding_rule',null,
    jsonb_build_object('rule',p_rule,'reason',p_reason,'op_key',p_op_key));
  return clara._finish_op(c.firm,'decline_coding_rule',p_op_key,
    jsonb_build_object('rule_id',p_rule,'status','declined'));
end $$;

create function clara.retire_coding_rule(p_rule uuid,p_reason text,
    p_conflict_question uuid default null,p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_rule is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'retirement reason is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'retire_coding_rule',p_op_key,
    clara._hash(jsonb_build_object('rule',p_rule,'reason',p_reason,
      'conflict_question',p_conflict_question)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.coding_rules where id=p_rule for update;
  if not found or r.firm_id<>c.firm then raise exception 'rule not found' using errcode='CLR11'; end if;
  if r.status not in ('proposed','live') then raise exception 'rule cannot be retired' using errcode='CLR27',detail='{"reason":"malformed"}'; end if;
  if r.pinned and (p_conflict_question is null or not exists(
      select 1 from clara.open_questions q where q.id=p_conflict_question
        and q.firm_id=c.firm and q.client_id=r.client_id
        and q.scope_kind='vendor' and clara._canonical_counterparty(
          q.client_id,q.counterparty_id)=r.counterparty_id)) then
    raise exception 'pinned rule retirement requires its conflict question'
      using errcode='CLR27',detail='{"reason":"pinned_conflict"}';
  end if;
  update clara.coding_rules set status='retired',retired_by=c.actor,
    retired_at=now(),retire_reason=btrim(p_reason) where id=p_rule;
  perform clara._audit(c.firm,c.actor,null,null,'retire_coding_rule',null,
    jsonb_build_object('rule',p_rule,'reason',p_reason,
      'conflict_question',p_conflict_question,'op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_rule.retired',r.client_id,c.actor,null,null,null,null,null,
    jsonb_build_object('rule_id',p_rule,'reason',p_reason));
  return clara._finish_op(c.firm,'retire_coding_rule',p_op_key,
    jsonb_build_object('rule_id',p_rule,'status','retired'));
end $$;

-- =====================================================================
-- 10. PER-CLIENT EGRESS CONSENT + LAST-BOUNDARY CLAIM RECHECK
-- =====================================================================

create function clara.grant_client_egress(p_client uuid,p_evidence_document uuid,
    p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_evidence_document is null or p_scope_note is null
     or nullif(btrim(p_scope_note),'') is null then
    raise exception 'egress consent is malformed' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'evidence_document',p_evidence_document,
      'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm and status='ingested'
        and bytes_verified_at is not null) then
    raise exception 'consent evidence is not a real ingested document in the client firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_consents(firm_id,client_id,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_consents_one_live' then
      raise exception 'client already has a live egress consent'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress',null,
    jsonb_build_object('consent',v_id,'client',p_client,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.consent_granted',p_client,c.actor,null,null,
    null,p_evidence_document,null,jsonb_build_object('consent_id',v_id));
  return clara._finish_op(c.firm,'grant_client_egress',p_op_key,
    jsonb_build_object('consent_id',v_id,'status','live'));
end $$;

create function clara.revoke_client_egress(p_client uuid,p_reason text,p_op_key text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'egress revocation reason is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into x from clara.client_egress_consents where client_id=p_client
    and revoked_at is null for update;
  if not found or x.firm_id<>c.firm then
    raise exception 'live client consent not found'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress',null,
    jsonb_build_object('consent',x.id,'client',p_client,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.consent_revoked',p_client,c.actor,null,null,
    null,x.evidence_document_id,null,jsonb_build_object('consent_id',x.id,'reason',p_reason));
  return clara._finish_op(c.firm,'revoke_client_egress',p_op_key,
    jsonb_build_object('consent_id',x.id,'status','revoked'));
end $$;

create or replace function clara.claim_document_processing_task(p_task uuid,
    p_workflow_run_id text,p_egress_approved boolean) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  t record; d record; v_cap int; v_running int; v_attempts int;
  v_clients int; v_consented int; v_hold_reason text;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'workflow_run_id is required' using errcode='CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  select storage_path,sha256,mime_type,byte_size into d
    from clara.documents where id=t.document_id;

  -- The lease check precedes EVERY branch that can dispatch, including a same-run
  -- replay. OCR/structured_parse are kill-switch-only; invoice_facts additionally
  -- requires every active filing client to hold a live consent. Zero filings fail.
  if t.lane in ('ocr','structured_parse','invoice_facts')
     and not coalesce(p_egress_approved,false) then
    v_hold_reason:='kill_switch';
  elsif t.lane='invoice_facts' then
    select count(distinct f.client_id)::int,
      count(distinct f.client_id) filter(where exists(
        select 1 from clara.client_egress_consents c
        where c.client_id=f.client_id and c.revoked_at is null))::int
      into v_clients,v_consented from clara.document_filings f
      where f.document_id=t.document_id and f.retired_at is null;
    if coalesce(v_clients,0)=0 or coalesce(v_consented,0)=0 then
      v_hold_reason:='no_consent';
    elsif v_consented<v_clients then
      v_hold_reason:='partial_consent';
    end if;
  end if;
  if v_hold_reason is not null then
    if t.status in ('queued','running') then
      update clara.document_processing_tasks set status='held_egress',
        workflow_run_id=null,started_at=null,vendor_op_ref=null where id=p_task;
      if t.lane='ocr' then
        update clara.documents set extraction_status='held_egress' where id=t.document_id;
      end if;
    elsif t.status<>'held_egress' then
      raise exception 'processing task is not dispatchable' using errcode='CLR16';
    end if;
    return jsonb_build_object('task_id',p_task,'status','held_egress',
      'workflow_run_id',null,'payload',jsonb_build_object(
        'clr','CLR28','reason',v_hold_reason));
  end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
      'storage_path',d.storage_path,'sha256',d.sha256,
      'mime_type',d.mime_type,'byte_size',d.byte_size);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  if t.lane='invoice_facts' then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks where document_id=t.document_id
        and lane='invoice_facts';
    if v_attempts>=3 then
      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',
        finished_at=now() where id=p_task;
      perform clara._refund_processing_call(p_task,'attempt_cap');
      perform clara._append_event(t.firm_id,'document.invoice_facts_failed',null,null,null,null,
        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));
      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');
    end if;
  end if;
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane in ('ocr','invoice_facts') and status='running';
  if t.lane in ('ocr','invoice_facts') and v_running>=v_cap then
    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
  end if;
  update clara.document_processing_tasks set status='running',
    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1
    where id=p_task;
  if t.lane='ocr' then update clara.documents set extraction_status='running' where id=t.document_id; end if;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,'document_id',t.document_id,
    'firm_id',t.firm_id,'lane',t.lane,'storage_path',d.storage_path,
    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size);
end $$;

create function clara.get_document_for_human_read(p_document uuid,p_user uuid)
  returns jsonb language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_result jsonb;
begin
  if p_document is null or p_user is null then
    raise exception 'document not found' using errcode='CLR11';
  end if;
  select jsonb_build_object('storage_path',d.storage_path,'mime_type',d.mime_type,
      'byte_size',d.byte_size,'sha256',d.sha256) into v_result
    from clara.documents d where d.id=p_document and exists(
      select 1 from clara.firm_memberships m where m.user_id=p_user
        and m.firm_id=d.firm_id and m.status='active');
  if v_result is null then raise exception 'document not found' using errcode='CLR11'; end if;
  return v_result;
end $$;

-- =====================================================================
-- 11. AUTODRAFT ADMISSION, RESERVE-FIRST BUDGET, SETTLE, RECONCILE
-- =====================================================================

create function clara.open_sweep_run(p_firm uuid,p_expected int) returns uuid
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_id uuid;
begin
  if p_firm is null or p_expected is null or p_expected<0
     or not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'sweep run arguments are malformed' using errcode='CLR10';
  end if;
  insert into clara.sweep_runs(firm_id,expected_count) values(p_firm,p_expected)
    returning id into v_id;
  perform clara._audit(p_firm,null,null,null,'open_sweep_run',null,
    jsonb_build_object('run',v_id,'expected',p_expected));
  return v_id;
end $$;

-- Admission semantics (FINAL): registry short-circuit BEFORE op-key receipt;
-- deterministic op-key autodraft:<filing>:<origin>; request hash contains ONLY
-- {filing,origin} (p_run_id and p_model are excluded); lane is re-evaluated;
-- reserve-first into firm_usage_daily under advisory family 202991617 before the
-- agent task/registry write; settlement later applies actual-minus-reserved.
create function clara.admit_autodraft_task(p_filing uuid,p_origin text,p_run_id uuid,
    p_model text,p_reserve_tokens bigint) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  a record; f record; r record; v_dedupe jsonb; v_lane record; v_task uuid;
  v_op_key text; v_limit bigint; v_used bigint; v_share numeric; v_cap int;
  v_today date:=(now() at time zone 'UTC')::date; v_constraint text;
begin
  if p_filing is null then raise exception 'filing is required' using errcode='CLR10'; end if;

  -- Registry short-circuit is deliberately BEFORE op receipt lookup/creation.
  select aa.*,t.status as task_status into a from clara.autodraft_attempts aa
    left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;
  if found and a.state='active' and a.task_status in
      ('queued','running','cancel_requested') then
    -- A run-bound noop MUST still write its item, or the run's expected_count is
    -- never reached and it stays open forever (accumulating against the
    -- concurrent-sweep cap — a firm-wide wedge). Mirrors the parked branch.
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  elsif found and a.state='parked' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,
          'refused_attempts',jsonb_build_object('clr','CLR29','reason','refused_attempts'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_attempts','reason','refused_attempts');
  end if;

  if p_origin is null or p_origin not in ('sweep','one_click')
     or p_model is null or nullif(btrim(p_model),'') is null
     or p_reserve_tokens is null or p_reserve_tokens<1
     or (p_origin='sweep' and p_run_id is null)
     or (p_origin='one_click' and p_run_id is not null) then
    raise exception 'autodraft admission is malformed' using errcode='CLR10';
  end if;
  select df.* into f from clara.document_filings df where df.id=p_filing
    and df.retired_at is null for update;
  if not found then raise exception 'active filing not found' using errcode='CLR11'; end if;
  if p_run_id is not null and not exists(select 1 from clara.sweep_runs sr
      where sr.id=p_run_id and sr.firm_id=f.firm_id and sr.state='open') then
    raise exception 'open sweep run not found' using errcode='CLR11';
  end if;
  -- A waiter that lost the filing lock rechecks the registry before touching op receipts.
  select aa.*,t.status as task_status into a from clara.autodraft_attempts aa
    left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;
  if found and a.state='active' and a.task_status in
      ('queued','running','cancel_requested') then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  elsif found and a.state='parked' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,
          'refused_attempts',jsonb_build_object('clr','CLR29','reason','refused_attempts'))
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','refused_attempts','reason','refused_attempts');
  end if;

  v_op_key:='autodraft:'||p_filing||':'||p_origin;
  v_dedupe:=clara._reserve_op(f.firm_id,'admit_autodraft_task',v_op_key,
    clara._hash(jsonb_build_object('filing',p_filing,'origin',p_origin)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);
  if v_lane.lane<>'ready' then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'skipped_lane',
          jsonb_build_object('clr','CLR29','reason','lane_changed','lane',v_lane.lane,
            'reasons',v_lane.reasons)) on conflict do nothing;
    end if;
    return clara._finish_op(f.firm_id,'admit_autodraft_task',v_op_key,
      jsonb_build_object('outcome','lane_changed','lane',v_lane.lane,
        'reasons',v_lane.reasons));
  end if;

  perform pg_advisory_xact_lock(202991617,hashtext(f.firm_id::text));
  select coalesce(fl.daily_token_limit,1000000),fl.sweep_budget_share,
      fl.max_concurrent_sweeps into v_limit,v_share,v_cap
    from clara.firms z left join clara.firm_limits fl on fl.firm_id=z.id
    where z.id=f.firm_id;
  v_share:=coalesce(v_share,0.60); v_cap:=coalesce(v_cap,2);
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(f.firm_id,v_today,0) on conflict(firm_id,usage_date) do nothing;
  select tokens_used into v_used from clara.firm_usage_daily
    where firm_id=f.firm_id and usage_date=v_today for update;
  if p_origin='sweep' and (select count(*) from clara.sweep_runs
      where firm_id=f.firm_id and state='open')>=v_cap then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget','gate','concurrency'))
        on conflict do nothing;
    end if;
    return clara._finish_op(f.firm_id,'admit_autodraft_task',v_op_key,
      jsonb_build_object('outcome','refused_budget','reason','refused_budget'));
  end if;
  if (p_origin='sweep' and v_used+p_reserve_tokens>(v_limit*v_share)::bigint)
     or (p_origin='one_click' and v_used+p_reserve_tokens>v_limit) then
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,refusal_token)
        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,'refused_budget',
          jsonb_build_object('clr','CLR29','reason','refused_budget'))
        on conflict do nothing;
    end if;
    return clara._finish_op(f.firm_id,'admit_autodraft_task',v_op_key,
      jsonb_build_object('outcome','refused_budget','reason','refused_budget'));
  end if;
  update clara.firm_usage_daily set tokens_used=tokens_used+p_reserve_tokens
    where firm_id=f.firm_id and usage_date=v_today;
  insert into clara.agent_tasks(firm_id,client_id,kind,status,model_snapshot)
    values(f.firm_id,f.client_id,'autodraft','queued',btrim(p_model)) returning id into v_task;
  insert into clara.autodraft_attempts(firm_id,client_id,document_id,filing_id,
      task_id,origin,run_id,state,reserved_tokens,usage_date,last_refusal)
    values(f.firm_id,f.client_id,f.document_id,p_filing,v_task,p_origin,p_run_id,
      'active',p_reserve_tokens,v_today,null)
    on conflict(filing_id) do update set task_id=excluded.task_id,origin=excluded.origin,
      run_id=excluded.run_id,state='active',reserved_tokens=excluded.reserved_tokens,
      usage_date=excluded.usage_date,last_refusal=null,updated_at=now();
  perform clara._audit(f.firm_id,null,null,null,'admit_autodraft_task',null,
    jsonb_build_object('task',v_task,'filing',p_filing,'origin',p_origin,
      'run',p_run_id,'reserved_tokens',p_reserve_tokens));
  return clara._finish_op(f.firm_id,'admit_autodraft_task',v_op_key,
    jsonb_build_object('outcome','admitted','task_id',v_task,
      'reserved_tokens',p_reserve_tokens));
exception when unique_violation then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint='uq_autodraft_attempts_filing' then
    select * into a from clara.autodraft_attempts where filing_id=p_filing;
    if p_run_id is not null then
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome)
        values(p_run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,'noop_existing')
        on conflict do nothing;
    end if;
    return jsonb_build_object('outcome','noop_existing','task_id',a.task_id);
  end if;
  raise;
end $$;

create function clara.request_autodraft(p_filing uuid) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; f record; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_filing is null then raise exception 'filing is required' using errcode='CLR10'; end if;
  select * into f from clara.document_filings where id=p_filing and firm_id=c.firm
    and retired_at is null;
  if not found then raise exception 'active filing not found' using errcode='CLR11'; end if;
  v_result:=clara.admit_autodraft_task(p_filing,'one_click',null,
    coalesce(nullif(current_setting('clara.autodraft_model',true),''),'openai/gpt-5-mini'),40000);
  perform clara._audit(c.firm,c.actor,null,null,'request_autodraft',null,
    jsonb_build_object('filing',p_filing,'outcome',v_result->>'outcome'));
  return v_result;
end $$;

create function clara.begin_autodraft_task(p_task uuid,p_workflow_run_id text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare t record; a record;
begin
  if p_task is null or p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'task and workflow_run_id are required' using errcode='CLR10';
  end if;
  select * into t from clara.agent_tasks where id=p_task for update;
  if not found or t.kind<>'autodraft' then raise exception 'autodraft task not found' using errcode='CLR11'; end if;
  select * into a from clara.autodraft_attempts where task_id=p_task;
  if not found or a.state<>'active' then raise exception 'autodraft registry not active' using errcode='CLR11'; end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'firm_id',a.firm_id,'client_id',a.client_id,'document_id',a.document_id,
      'filing_id',a.filing_id,'origin',a.origin,'run_id',a.run_id,
      'model_snapshot',t.model_snapshot,'reserved_tokens',a.reserved_tokens);
  end if;
  if t.status<>'queued' then raise exception 'autodraft task is not queued' using errcode='CLR13'; end if;
  update clara.agent_tasks set status='running',workflow_run_id=p_workflow_run_id
    where id=p_task;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,'firm_id',a.firm_id,'client_id',a.client_id,
    'document_id',a.document_id,'filing_id',a.filing_id,'origin',a.origin,
    'run_id',a.run_id,'model_snapshot',t.model_snapshot,
    'reserved_tokens',a.reserved_tokens);
end $$;

create function clara.settle_autodraft_task(p_task uuid,p_outcome text,p_tokens bigint,
    p_entry uuid default null,p_refusal jsonb default null) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  t record; a record; v_actual bigint; v_item_outcome text; v_attempts int;
begin
  if p_task is null or p_outcome is null
     or p_outcome not in ('drafted','skipped_lane','noop_existing','failed')
     or p_tokens is null or p_tokens<0 then
    raise exception 'autodraft settlement is malformed' using errcode='CLR10';
  end if;
  select * into t from clara.agent_tasks where id=p_task for update;
  if not found or t.kind<>'autodraft' then raise exception 'autodraft task not found' using errcode='CLR11'; end if;
  if t.status in ('completed','failed') then
    return jsonb_build_object('task_id',p_task,'status',t.status,'replayed',true);
  end if;
  if t.status not in ('running','cancel_requested') then
    raise exception 'autodraft task is not running' using errcode='CLR13';
  end if;
  select * into a from clara.autodraft_attempts where task_id=p_task for update;
  if not found or a.state<>'active' then raise exception 'autodraft registry not active' using errcode='CLR11'; end if;
  if p_outcome='drafted' and (p_entry is null or not exists(
      select 1 from clara.journal_entries e where e.id=p_entry and e.firm_id=a.firm_id
        and e.client_id=a.client_id and e.filing_id=a.filing_id and e.status='draft')) then
    raise exception 'draft settlement entry not found' using errcode='CLR11';
  end if;
  v_actual:=case when p_outcome='failed' then 0 else p_tokens end;
  perform pg_advisory_xact_lock(202991617,hashtext(a.firm_id::text));
  insert into clara.firm_usage_daily(firm_id,usage_date,tokens_used)
    values(a.firm_id,a.usage_date,0) on conflict(firm_id,usage_date) do nothing;
  update clara.firm_usage_daily set tokens_used=greatest(0,
      tokens_used+v_actual-a.reserved_tokens)
    where firm_id=a.firm_id and usage_date=a.usage_date;
  insert into clara.task_usage(task_id,firm_id,tokens)
    values(p_task,a.firm_id,v_actual) on conflict(task_id) do nothing;
  if p_outcome='failed' then
    update clara.agent_tasks set status='failed',error_code='internal' where id=p_task;
    v_attempts:=a.attempt_count+1;
    update clara.autodraft_attempts set attempt_count=v_attempts,
      state=case when v_attempts>=2 then 'parked' else 'idle' end,
      reserved_tokens=0,last_refusal=coalesce(p_refusal,
        jsonb_build_object('clr','CLR29','reason','refused_attempts')) where id=a.id;
    v_item_outcome:='refused_attempts';
  else
    update clara.agent_tasks set status='completed' where id=p_task;
    update clara.autodraft_attempts set attempt_count=0,state='idle',reserved_tokens=0,
      last_refusal=case when p_outcome='drafted' then null else p_refusal end where id=a.id;
    v_item_outcome:=case p_outcome when 'drafted' then 'drafted'
      when 'noop_existing' then 'noop_existing' else 'skipped_lane' end;
  end if;
  if a.run_id is not null then
    insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
        outcome,entry_id,refusal_token,tokens_reserved,tokens_spent)
      values(a.run_id,a.filing_id,a.firm_id,a.client_id,a.document_id,v_item_outcome,
        case when v_item_outcome='drafted' then p_entry end,
        case when v_item_outcome<>'drafted' then coalesce(p_refusal,
          jsonb_build_object('clr','CLR29','reason',v_item_outcome)) end,
        a.reserved_tokens,v_actual) on conflict do nothing;
  end if;
  perform clara._audit(a.firm_id,null,null,null,'settle_autodraft_task',p_entry,
    jsonb_build_object('task',p_task,'outcome',p_outcome,'tokens',v_actual,
      'reserved',a.reserved_tokens,'run',a.run_id));
  return jsonb_build_object('task_id',p_task,'status',case when p_outcome='failed'
    then 'failed' else 'completed' end,'outcome',p_outcome,'entry_id',p_entry,
    'tokens_spent',v_actual,'tokens_refunded',greatest(a.reserved_tokens-v_actual,0));
end $$;

create function clara.reconcile_sweep_runs() returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare sr record; v_finalized int:=0; v_reconciled int:=0; v_count int;
begin
  for sr in select * from clara.sweep_runs where state='open'
      order by created_at,id for update skip locked loop
    with recovered as (
      select a.*,ca.entry_id from clara.autodraft_attempts a
      join clara.coding_attempts ca on ca.task_id=a.task_id
      join clara.journal_entries e on e.id=ca.entry_id and e.status='draft'
      where a.run_id=sr.id
        and not exists(select 1 from clara.sweep_run_items i
          where i.run_id=sr.id and i.filing_id=a.filing_id)
    ), inserted as (
      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,
          outcome,entry_id,tokens_reserved,tokens_spent)
        select sr.id,filing_id,firm_id,client_id,document_id,'drafted',entry_id,
          reserved_tokens,reserved_tokens from recovered
        on conflict do nothing returning filing_id
    ) select count(*)::int into v_count from inserted;
    v_reconciled:=v_reconciled+coalesce(v_count,0);
    if v_count>0 then
      update clara.agent_tasks t set status='completed'
        from clara.autodraft_attempts a where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested');
      update clara.autodraft_attempts aa set state='idle',attempt_count=0,
        reserved_tokens=0 where aa.run_id=sr.id and aa.state='active'
        and exists(select 1 from clara.coding_attempts ca where ca.task_id=aa.task_id);
    end if;
    -- §5b(E) staleness finalize (belt-and-suspenders): a run older than the window
    -- with NO bound attempt still in a non-terminal task state can never reach
    -- expected_count via the normal path, so finalize it with the ACTUAL counts
    -- (expected stays as declared — the receipt honestly shows expected vs actual,
    -- WA-L6). The guard (no live task) makes this safe — it can never cut off an
    -- in-flight draft. The item-write on noop/parked closes the common case; this
    -- catches any other stuck-open run.
    select count(*)::int into v_count from clara.sweep_run_items where run_id=sr.id;
    if v_count<sr.expected_count
       and sr.created_at < now() - interval '30 minutes'
       and not exists(select 1 from clara.autodraft_attempts aa
         join clara.agent_tasks t on t.id=aa.task_id
         where aa.run_id=sr.id and t.status in ('queued','running','cancel_requested')) then
      v_count:=sr.expected_count;  -- fall through to the finalize block below
    end if;
    if v_count>=sr.expected_count then
      update clara.sweep_runs set state='finalized',window_ended_at=now(),finalized_at=now(),
        drafted_count=(select count(*) from clara.sweep_run_items where run_id=sr.id and outcome='drafted'),
        skipped_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in ('skipped_lane','noop_existing')),
        refused_count=(select count(*) from clara.sweep_run_items where run_id=sr.id
          and outcome in ('refused_budget','refused_attempts')),
        token_reserved=(select coalesce(sum(tokens_reserved),0) from clara.sweep_run_items where run_id=sr.id),
        token_spent=(select coalesce(sum(tokens_spent),0) from clara.sweep_run_items where run_id=sr.id)
        where id=sr.id;
      perform clara._append_event(sr.firm_id,'sweep.run_completed',null,null,null,null,
        null,null,null,jsonb_build_object('run_id',sr.id,'expected_count',sr.expected_count));
      v_finalized:=v_finalized+1;
    end if;
  end loop;
  return jsonb_build_object('reconciled',v_reconciled,'finalized',v_finalized);
end $$;

create function clara.list_autodraft_candidates()
  returns table(firm_id uuid,filing_id uuid)
  language sql stable security definer set search_path=clara,pg_temp as $$
  select f.firm_id,f.id from clara.document_filings f
  where f.retired_at is null
    and exists(select 1 from clara.document_processing_tasks t
      where t.document_id=f.document_id and t.lane='invoice_facts' and t.status='done')
    and not exists(select 1 from clara.journal_entries e where e.filing_id=f.id
      and (e.status='draft' or (e.status='approved' and e.reversed_by is null)))
    and not exists(select 1 from clara.autodraft_attempts a where a.filing_id=f.id
      and a.state='parked')
  order by f.firm_id,f.filed_at,f.id;
$$;

create function clara.acknowledge_sweep_run(p_run uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; r record; w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot acknowledge a sweep' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_run is null then raise exception 'sweep run is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'acknowledge_sweep_run',p_op_key,
    clara._hash(jsonb_build_object('run',p_run,'actor',c.actor)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into r from clara.sweep_runs where id=p_run for update;
  if not found or r.firm_id<>c.firm then raise exception 'sweep run not found' using errcode='CLR11'; end if;
  if r.state<>'finalized' then
    raise exception 'sweep run is not finalized'
      using errcode='CLR29',detail='{"reason":"not_finalized"}';
  end if;
  if r.acknowledged_at is null then
    update clara.sweep_runs set acknowledged_by=c.actor,acknowledged_at=now() where id=p_run;
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'acknowledge_sweep_run',null,
    jsonb_build_object('run',p_run,'op_key',p_op_key));
  return clara._finish_op(c.firm,'acknowledge_sweep_run',p_op_key,
    jsonb_build_object('run_id',p_run,'acknowledged',true));
end $$;

create or replace function clara.revise_entry(p_entry uuid, p_lines jsonb,
    p_proposed_counterparty jsonb, p_evidence jsonb,
    p_expected_revision uuid, p_op_key text,
    p_amount_override jsonb default null,
    p_duplicate_override jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; e record; v_dedupe jsonb; v_lines jsonb; v_fingerprint jsonb;
  v_token uuid; v_state jsonb; v_payable bigint; v_expense bigint;
  v_new_flags jsonb; v_exception jsonb; v_ovr_region uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revise_entry',p_op_key,
    clara._hash(jsonb_build_object('entry',p_entry,'lines',p_lines,
      'counterparty',p_proposed_counterparty,'evidence',p_evidence,
      'revision',p_expected_revision,'amount_override',p_amount_override,
      'duplicate_override',p_duplicate_override)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into e from clara.journal_entries where id=p_entry for update;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  if e.status<>'draft' then
    raise exception 'only a draft can be revised' using errcode='CLR22';
  end if;
  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;
  if e.coding_kind='supplier_bill' and p_proposed_counterparty is null then
    raise exception 'supplier bill requires a vendor proposal'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  if e.coding_kind='supplier_bill'
     and (p_evidence is null or jsonb_typeof(p_evidence)<>'array'
          or jsonb_array_length(p_evidence)=0) then
    raise exception 'supplier-bill coding requires a cited evidence array'
      using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
  end if;
  v_fingerprint:=clara._resolve_counterparty(e.client_id,p_proposed_counterparty);
  v_lines:=clara._validate_entry_lines(e.client_id,p_lines);
  delete from clara.journal_lines where entry_id=p_entry;
  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description)
    select p_entry,x.idx,x.elem->>'account_code',(x.elem->>'debit_cents')::bigint,
      (x.elem->>'credit_cents')::bigint,x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem,idx);
  perform clara._assert_balanced(p_entry);
  v_new_flags:=coalesce(e.flags,'{}'::jsonb) - 'amount_exception' - 'amount_override';
  if e.document_id is not null then
    if clara._evidence_cites_non_myr(p_evidence) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if p_evidence is not null then
      perform clara._write_entry_evidence(p_entry,e.document_id,p_evidence);
    end if;
    v_state:=clara._invoice_fact_state(e.document_id);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'corroborated total is not bound by revised evidence'
          using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
      end if;
      select coalesce(sum(l.credit_cents),0) into v_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='expense';
      if v_payable<>(v_state->>'total_cents')::bigint
         or v_expense<>(v_state->>'total_cents')::bigint then
        v_exception:=jsonb_build_object(
          'machine_total_cents',(v_state->>'total_cents')::bigint,
          'proposed_cents',v_payable,
          'fact_hash',v_state->>'total_fact_hash','at',now());
        v_new_flags:=v_new_flags||jsonb_build_object('amount_exception',v_exception);
        if p_amount_override is not null then
          if jsonb_typeof(p_amount_override)<>'object'
             or nullif(btrim(p_amount_override->>'reason'),'') is null then
            raise exception 'amount override is malformed (reason required)'
              using errcode='CLR10';
          end if;
          begin v_ovr_region:=(p_amount_override->>'region_id')::uuid;
          exception when others then
            raise exception 'amount override region is malformed' using errcode='CLR10';
          end;
          if not exists (select 1 from clara.entry_evidence ev
              where ev.entry_id=p_entry and ev.region_id=v_ovr_region
                and ev.document_id=e.document_id) then
            raise exception 'amount override region must be cited in the revised evidence'
              using errcode='CLR21',detail='{"reason":"evidence_invalid"}';
          end if;
          v_new_flags:=v_new_flags||jsonb_build_object('amount_override',
            jsonb_build_object('reason',btrim(p_amount_override->>'reason'),
              'region_id',v_ovr_region,'actor',c.actor,'at',now()));
        end if;
      end if;
    end if;
  end if;
  if p_duplicate_override is not null then
    if jsonb_typeof(p_duplicate_override)<>'object'
       or nullif(btrim(p_duplicate_override->>'reason'),'') is null then
      raise exception 'duplicate override is malformed (reason required)' using errcode='CLR10';
    end if;
    v_new_flags:=v_new_flags||jsonb_build_object('duplicate_override',
      jsonb_build_object('reason',btrim(p_duplicate_override->>'reason'),
        'actor',c.actor,'at',now()));
  end if;
  update clara.journal_entries set proposed_counterparty=p_proposed_counterparty,
    match_fingerprint=v_fingerprint,last_human_editor=c.actor,flags=v_new_flags,
    revision_token=gen_random_uuid(),updated_at=now() where id=p_entry
    returning revision_token into v_token;

  insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
      revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
    select j.firm_id,j.client_id,j.id,
      coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
        where r.entry_id=j.id),0),j.revision_token,'human',c.actor,'revised',
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
    from clara.journal_entries j where j.id=p_entry;

  perform clara._audit(c.firm,c.actor,null,null,'revise_entry',p_entry,
    jsonb_build_object('op_key',p_op_key));
  perform clara._append_event(c.firm,'entry.revised',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  return clara._finish_op(c.firm,'revise_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'revision_token',v_token,'status','draft'));
end $$;

create or replace function clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; e record; v_dedupe jsonb; v_attest text; v_filing uuid;
  v_fingerprint jsonb; v_counterparty uuid; v_created boolean:=false;
  v_name text; v_reg text; v_tin text; v_name_n text; v_reg_n text;
  v_state jsonb; v_invoice_id text; v_question record; v_map record;
  v_rule uuid; v_question_id uuid; v_seen int;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
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
  -- CLR26 document-scope serialization: approve holds the active filing FOR SHARE
  -- (below, held to commit); the document-scope question writer takes the SAME
  -- filing row FOR UPDATE. SHARE-vs-UPDATE conflict, so the two serialize on the
  -- EXISTING filing row lock — no new broadly-held advisory (which would flood the
  -- lock graph). Whichever commits first is seen by the other: writer-first ⇒
  -- approve's CLR26 check (below) sees the committed question and refuses; approve-
  -- first ⇒ the writer blocks until approve commits, so no question existed during
  -- approve. No check-then-act window.
  if e.document_id is not null then
    v_filing:=clara._active_document_filing(e.document_id,e.source_doc_sha256,e.client_id,true);
    if v_filing<>e.filing_id then
      raise exception 'entry is not bound to the active filing' using errcode='CLR02';
    end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry for update;
  if e.status<>'draft' then
    raise exception 'entry is not a draft' using errcode='CLR10';
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
          values(c.firm,e.client_id,'vendor',v_name,v_name_n,v_reg,v_reg_n,v_tin,c.actor)
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
    update clara.journal_lines l set counterparty_id=v_counterparty
    from clara.coa_accounts a
    where l.entry_id=p_entry and a.client_id=l.client_id
      and a.account_code=l.account_code and a.account_class='payable';
  else
    select clara._canonical_counterparty(e.client_id,min(l.counterparty_id::text)::uuid)
      into v_counterparty
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='payable'
        and l.counterparty_id is not null;
  end if;

  -- (Document-scope CLR26 is serialized by the filing FOR SHARE vs the question
  -- writer's FOR UPDATE — see the filing-lock header above. Vendor + client scopes
  -- keep their exclusive advisories.)
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
  end if;
  perform clara._assert_supplier_bill_shape(p_entry);

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
    proposed_counterparty=null,match_fingerprint=null,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'reversal'),updated_at=now()
      where id=e.reversal_of and reversed_by is null;
  end if;

  if v_counterparty is not null and e.reversal_of is null then
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.debit_cents>0 and a.is_active
      on conflict on constraint uq_rule_sightings_mapping do nothing;

    for v_map in select distinct s.account_code from clara.rule_sightings s
        where s.entry_id=p_entry and s.counterparty_id=v_counterparty
    loop
      select count(distinct s.entry_id)::int into v_seen
      from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
      where s.client_id=e.client_id and s.account_code=v_map.account_code
        and clara._canonical_counterparty(e.client_id,s.counterparty_id)=v_counterparty
        and j.status='approved' and j.reversed_by is null;
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
    jsonb_build_object('filing',e.filing_id,'counterparty',v_counterparty,'op_key',p_op_key));
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

create function clara.approve_routine_entry(p_entry uuid,p_expected_revision uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; e record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_entry is null or p_expected_revision is null
     or p_op_key is null or btrim(p_op_key)='' then
    raise exception 'entry, revision, and op_key are required' using errcode='CLR10';
  end if;
  select * into e from clara.journal_entries where id=p_entry;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  if clara.is_high_stakes(p_entry) then
    raise exception 'routine approval refuses high-stakes entries'
      using errcode='CLR05',detail='{"reason":"routine_refuses_high_stakes"}';
  end if;
  return clara.approve_entry(p_entry,p_expected_revision,null,p_op_key);
end $$;

create or replace function clara.get_document_extract(p_document uuid,
    p_client uuid default null,p_max_chars int default 20000) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_result jsonb; v_budget int:=least(greatest(coalesce(p_max_chars,20000),0),100000);
  -- hc, not c: the extract query aliases the `chosen` CTE as c — a local record
  -- named c would capture the qualified c.* references (42703).
  w record; hc record; v_firm uuid;
begin
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
      perform clara.assert_wake_allowed(w.wake_kind,'get_document_extract');
    end if;
    if w.client_id is not null and p_client is distinct from w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    hc:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=hc.firm;
  end if;
  with target as (
    select d.*,
      not exists(select 1 from clara.document_filings f
                 where f.document_id=d.id and f.retired_at is null) as unassigned
    from clara.documents d where d.id=p_document and d.firm_id=v_firm
  ), admitted as (
    select * from target d where d.unassigned or exists(
      select 1 from clara.document_filings f where f.document_id=d.id
        and f.client_id=p_client and f.retired_at is null)
  ), chosen as (
    select distinct on (e.engine_kind) e.*
    from clara.document_extractions e join admitted d on d.id=e.document_id
    where e.status='done'
    order by e.engine_kind,e.version_n desc,e.id desc
  ), pieces as (
    select ('0:'||c.id::text) as ord,'envelope'::text as kind,c.id as extraction_id,
      null::uuid as region_id,c.envelope::text as content
    from chosen c
    union all
    select ('1:'||r.extraction_id::text||':'||r.id::text),'region',r.extraction_id,
      r.id,coalesce(r.text_content,'')
    from clara.document_regions r join chosen c on c.id=r.extraction_id
  ), budgeted as (
    select p.*,
      greatest(0,least(length(content),v_budget-coalesce(sum(length(content)) over(
        order by ord rows between unbounded preceding and 1 preceding),0)))::int as take_n
    from pieces p
  ), extraction_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'engine_id',c.engine_id,'engine_kind',c.engine_kind,
      'version_n',c.version_n,'status',c.status,'page_count',c.page_count,
      'envelope_text',coalesce((select left(b.content,b.take_n) from budgeted b
        where b.kind='envelope' and b.extraction_id=c.id),''),
      'raw_sha256',c.envelope->>'raw_sha256',
      'normalization_version',c.envelope->>'normalization_version')
      order by c.engine_kind,c.version_n),'[]'::jsonb) as value from chosen c
  ), region_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'extraction_id',r.extraction_id,'engine_kind',c.engine_kind,
      'version_n',c.version_n,'locator_kind',r.locator_kind,'locator',r.locator,
      'field_path',r.field_path,'text_content',left(b.content,b.take_n),
      'engine_confidence',r.engine_confidence,'monetary_raw',r.monetary_raw,
      'monetary_cents',r.monetary_cents) order by c.engine_kind,c.version_n,r.id),
      '[]'::jsonb) as value
    from clara.document_regions r join chosen c on c.id=r.extraction_id
    join budgeted b on b.kind='region' and b.region_id=r.id
  )
  select jsonb_build_object(
    'document',jsonb_build_object('id',d.id,'sha256',d.sha256,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'byte_size',d.byte_size,'bytes_verified_at',d.bytes_verified_at,
      'page_count',d.page_count,'extraction_status',d.extraction_status,
      'document_kind',d.document_kind,'financial_date',d.financial_date),
    'unassigned',d.unassigned,
    'filing',case when d.unassigned then null else (select jsonb_build_object(
      'id',f.id,'client_id',f.client_id,'filed_at',f.filed_at,'basis',f.basis)
      from clara.document_filings f where f.document_id=d.id
        and f.client_id=p_client and f.retired_at is null) end,
    'extractions',ej.value,'regions',rj.value,'max_chars',v_budget)
    into v_result
  from admitted d cross join extraction_json ej cross join region_json rj;
  return v_result;
end $$;

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
      'pack_schema_version',2,'purpose',p_purpose,'generated_at',now(),
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
          and approved_at is not null order by approved_at desc limit 25) je)
    ) from clara.clients cl where cl.id=p_client and cl.firm_id=v_firm
  );
end $$;

create or replace function clara.get_draft_review(p_entry uuid,p_client uuid default null)
  returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  e record; v_current jsonb; cp record; v_result jsonb; w record; c record;
  v_high boolean; v_reasons text[]; v_debits bigint; v_threshold bigint;
  v_near jsonb; v_cp uuid; v_dinv_date text; v_dtotal bigint; v_firm uuid;
  v_name_n text; v_reg_n text; v_alias boolean;
begin
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
    and status='draft' and (p_client is null or client_id=p_client);
  if not found then return null; end if;
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

create function clara.list_document_autodraft_candidates(p_document uuid)
  returns table(firm_id uuid,filing_id uuid)
  language sql stable security definer set search_path=clara,pg_temp as $$
  select f.firm_id,f.id from clara.document_filings f
  where f.document_id=p_document and f.retired_at is null
  order by f.firm_id,f.id;
$$;

create function clara.get_sweep_run(p_run uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  return (select jsonb_build_object('run',to_jsonb(r),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.filing_id)
      from clara.sweep_run_items i where i.run_id=r.id),'[]'::jsonb))
    from clara.sweep_runs r where r.id=p_run and r.firm_id=c.firm);
end $$;

create function clara.get_open_question(p_question uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  return (select jsonb_build_object('question',to_jsonb(q),
      'rule',case when r.id is null then null else to_jsonb(r) end)
    from clara.open_questions q left join clara.coding_rules r on r.id=q.spawned_rule_id
    where q.id=p_question and q.firm_id=c.firm);
end $$;

create function clara.get_coding_rule(p_rule uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  return (select jsonb_build_object('rule',to_jsonb(r),
      'counterparty',jsonb_build_object('id',cp.id,'name',cp.name,
        'registration_no',cp.registration_no),
      'question',(select to_jsonb(q) from clara.open_questions q
        where q.spawned_rule_id=r.id order by q.opened_at desc,q.id desc limit 1))
    from clara.coding_rules r join clara.counterparties cp on cp.id=r.counterparty_id
    where r.id=p_rule and r.firm_id=c.firm);
end $$;

create function clara.get_entry_diff(p_entry uuid,p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; c record; v_firm uuid;
begin
  if p_entry is null or p_client is null then
    raise exception 'entry and client are required' using errcode='CLR10';
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
    if w.credential_id is null then raise exception 'no valid agent read context' using errcode='CLR03'; end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_entry_diff');
    end if;
    if w.client_id is not null and p_client<>w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    c:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=c.firm;
  end if;
  return (
    with revisions as (
      select r.*,lag(r.header) over(order by r.revision_no) prev_header,
        lag(r.legs) over(order by r.revision_no) prev_legs
      from clara.journal_entry_revisions r
      where r.entry_id=p_entry and r.client_id=p_client and r.firm_id=v_firm
    ), shaped as (
      select r.*,
        coalesce((select jsonb_agg(d order by d->>'field') from (
          select jsonb_build_object('field',k,'before',r.prev_header->k,
            'after',r.header->k,'delta_cents',null) d
          from unnest(array['posting_date','memo','status','flags','revision_token']) k
          where r.prev_header is not null and r.prev_header->k is distinct from r.header->k
          union all
          select jsonb_build_object('field','total_debit_cents',
            'before',coalesce((select sum((x->>'debit_cents')::bigint)
              from jsonb_array_elements(r.prev_legs) x),0),
            'after',coalesce((select sum((x->>'debit_cents')::bigint)
              from jsonb_array_elements(r.legs) x),0),
            'delta_cents',coalesce((select sum((x->>'debit_cents')::bigint)
              from jsonb_array_elements(r.legs) x),0)-coalesce((select
              sum((x->>'debit_cents')::bigint) from jsonb_array_elements(r.prev_legs) x),0)) d
          where r.prev_legs is not null and r.prev_legs is distinct from r.legs
        ) delta_rows),'[]'::jsonb) deltas
      from revisions r
    )
    select jsonb_build_object('entry_id',p_entry,'revisions',coalesce(jsonb_agg(
      jsonb_build_object('revision_no',revision_no,'actor_kind',actor_kind,
        'actor',actor,'reason',reason,'created_at',created_at,'header',header,
        'legs',legs,'rule_decision_id',rule_decision_id,
        'deltas_vs_prev',deltas) order by revision_no),'[]'::jsonb))
    from shaped
  );
end $$;

create function clara.get_doc_entry_diff(p_entry uuid,p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record; c record; e record; v_firm uuid; v_fields jsonb;
begin
  if p_entry is null or p_client is null then
    raise exception 'entry and client are required' using errcode='CLR10';
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
    if w.credential_id is null then raise exception 'no valid agent read context' using errcode='CLR03'; end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_doc_entry_diff');
    end if;
    if w.client_id is not null and p_client<>w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    c:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=c.firm;
  end if;
  select * into e from clara.journal_entries where id=p_entry and client_id=p_client
    and firm_id=v_firm;
  if not found or e.document_id is null then return null; end if;
  with latest as (
    select x.id from clara.document_extractions x where x.document_id=e.document_id
      and x.engine_kind='invoice_facts' and x.status='done'
    order by x.version_n desc,x.id desc limit 1
  ), facts(field,entry_value,entry_cents) as (
    values
      ('invoice.total'::text,(select coalesce(sum(l.credit_cents),0)::text
        from clara.journal_lines l join clara.coa_accounts a
          on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=e.id and a.account_class='payable'),
        (select coalesce(sum(l.credit_cents),0) from clara.journal_lines l
          join clara.coa_accounts a on a.client_id=l.client_id
            and a.account_code=l.account_code where l.entry_id=e.id
            and a.account_class='payable')),
      ('invoice.invoice_date',e.posting_date::text,null::bigint),
      ('invoice.invoice_id',null::text,null::bigint),
      ('invoice.vendor_name',(select cp.name from clara.journal_lines l
        join clara.counterparties cp on cp.id=clara._canonical_counterparty(
          e.client_id,l.counterparty_id) where l.entry_id=e.id
          and l.counterparty_id is not null order by l.line_no limit 1),null::bigint),
      ('invoice.currency','MYR',null::bigint)
  )
  -- PIN-ADD-2: field rows carry the region's as-built locator verbatim so the
  -- doc_review overlay can render page_polygon chips (contract §5 / WA-R8);
  -- NULL on no-region rows. The envelope, not the UI, owns geometry.
  select coalesce(jsonb_agg(jsonb_build_object('field',f.field,
    'doc_value',coalesce(r.monetary_cents::text,r.text_content),
    'doc_region_id',r.id,'doc_page',r.locator->>'page',
    'doc_region_locator_kind',r.locator_kind,'doc_region_locator',r.locator,
    'entry_value',f.entry_value,
    'delta_cents',case when f.entry_cents is not null and r.monetary_cents is not null
      then f.entry_cents-r.monetary_cents end,'no_region',(r.id is null))
    order by f.field),'[]'::jsonb) into v_fields
  from facts f left join lateral (select dr.* from clara.document_regions dr
    where dr.extraction_id=(select id from latest) and dr.field_path=f.field
    order by dr.id limit 1) r on true;
  return jsonb_build_object('entry_id',e.id,'document_id',e.document_id,'fields',v_fields);
end $$;

create function clara.list_review_queue(p_scope jsonb,p_cursor jsonb,
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
      coalesce(cp.counterparty_id::text,'') vendor_group
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
      null::text question_text,f.filed_at created_at,f.id,''::text vendor_group
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
      coalesce(q.counterparty_id::text,'') vendor_group
    from clara.open_questions q where q.firm_id=c.firm and q.status='open'
      and (v_client is null or q.client_id=v_client)
  ), task_rows as (
    select 2 section_rank,'coding_task'::text row_kind,'needs_review'::text section,
      t.client_id,null::uuid counterparty_id,t.filing_id,null::uuid entry_id,
      null::uuid question_id,t.id task_id,t.document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,t.created_at aged_since,
      null::bigint amount_cents,null::text period,null::text question_text,
      t.created_at,t.id,''::text vendor_group
    from clara.coding_tasks t where t.firm_id=c.firm and t.status='open'
      and (v_client is null or t.client_id=v_client)
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
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
      count(*) filter(where row_kind='coding_task')::int open_tasks from all_rows
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
      'open_questions',counts.open_questions,'open_tasks',counts.open_tasks),
    'sweep',jsonb_build_object('open_run',sweep.open_run,
      'last_finalized_at',sweep.last_finalized_at,'last_ack_at',sweep.last_ack_at),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('row_kind',p.row_kind,
      'section',p.section,'sort',to_jsonb(p.sort_tuple),'client_id',p.client_id,
      'counterparty_id',p.counterparty_id,'filing_id',p.filing_id,'entry_id',p.entry_id,
      'question_id',p.question_id,'task_id',p.task_id,'document_id',p.document_id,
      'lane',p.lane,'auto',p.auto,'rule_backed',p.rule_backed,
      'high_stakes',p.high_stakes,'aged_since',p.aged_since,
      'amount_cents',p.amount_cents,'period',p.period,'question_text',p.question_text,
      'created_at',p.created_at,'id',p.id) order by p.sort_tuple) from page p),'[]'::jsonb),
    'next_cursor',(select jsonb_build_object('tuple',to_jsonb(p.sort_tuple))
      from page p order by p.sort_tuple desc limit 1)) into v_result
  from counts cross join sweep;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Active-taxonomy additive pair insert (the 0009 idiom: no new version/repoint).
-- ---------------------------------------------------------------------------
with added(name,client_scoped,description,decision,note) as (values
  ('sweep.run_completed',false,'An autodraft sweep run completed','ignore',null::text),
  ('kb_rule.proposed',true,'A coding rule was proposed','notification',null::text),
  ('kb_rule.signed',true,'A coding rule was signed','ignore',null::text),
  ('kb_rule.retired',true,'A coding rule was retired','ignore',null::text),
  ('open_question.opened',true,'An open question was created','notification',null::text),
  ('open_question.resolved',true,'An open question was resolved or dismissed','ignore',null::text),
  ('counterparty.merged',true,'Two counterparty identities were merged','ignore',null::text),
  ('egress.consent_granted',true,'Client egress consent was granted','ignore',null::text),
  ('egress.consent_revoked',true,'Client egress consent was revoked','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note from added x
join inserted_types i on i.name=x.name cross join clara.taxonomy_active a;

insert into clara.wake_fn_allowlist(wake_kind,function_name) values
  ('autodraft','wake_draft_entry'),
  ('autodraft','get_document_extract'),
  ('autodraft','get_context_pack'),
  ('autodraft','get_draft_review'),
  ('autodraft','coding_lane'),
  ('autodraft','wake_open_question'),
  ('interactive','wake_open_question');

-- ---------------------------------------------------------------------------
-- PIN-DELTA-2 completion (fix round): the three 0009 INVOKER readers
-- (list_unassigned_documents, list_uncoded_filings, get_journal_entry_for)
-- kept their invoker shape — converting their RLS-scoped bodies to DEFINER
-- would mean hand-rewriting their scoping (needless oracle risk). Instead a
-- small DEFINER helper (granted agent_ro ONLY) gives their invoker prologues
-- lawful sight of the credential facts: CLR03 on an invalid credential,
-- allowlist enforcement for NEW wake kinds, and the C-11 client-pin collapse
-- (returns false -> the caller returns the empty shape).

create function clara._agent_read_admitted(p_fn text, p_client uuid)
  returns boolean
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid agent read context' using errcode='CLR03';
  end if;
  if w.wake_kind not in ('interactive','proactive') then
    perform clara.assert_wake_allowed(w.wake_kind,p_fn);
  end if;
  if w.client_id is not null
     and (p_client is null or p_client is distinct from w.client_id) then
    return false;
  end if;
  return true;
end $$;
revoke all on function clara._agent_read_admitted(text,uuid) from public;
grant execute on function clara._agent_read_admitted(text,uuid) to clara_agent_ro;

create or replace function clara.list_unassigned_documents(p_limit int default 50)
  returns setof jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if not clara._agent_read_admitted('list_unassigned_documents',null) then return; end if;
  end if;
  return query
    select jsonb_build_object('id',d.id,'sha256',d.sha256,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'byte_size',d.byte_size,'bytes_verified_at',d.bytes_verified_at,
      'page_count',d.page_count,'extraction_status',d.extraction_status,
      'document_kind',d.document_kind,'financial_date',d.financial_date,
      'created_at',d.created_at,'unassigned',true)
    from clara.documents d
    where not exists(select 1 from clara.document_filings f
      where f.document_id=d.id and f.retired_at is null)
    order by d.created_at desc,d.id
    limit least(greatest(coalesce(p_limit,50),0),500);
end $$;

create or replace function clara.list_uncoded_filings(p_client uuid default null)
  returns setof jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if not clara._agent_read_admitted('list_uncoded_filings',p_client) then return; end if;
  end if;
  return query
    select jsonb_build_object('filing_id',f.id,'document_id',f.document_id,
      'client_id',f.client_id,'filed_at',f.filed_at,'basis',f.basis,
      'document_kind',d.document_kind,'financial_date',d.financial_date,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'extraction_status',d.extraction_status)
    from clara.document_filings f join clara.documents d on d.id=f.document_id
    where f.retired_at is null and (p_client is null or f.client_id=p_client)
      and not exists(select 1 from clara.journal_entries e
        where e.filing_id=f.id and e.status='draft')
      and not exists(select 1 from clara.journal_entries e
        where e.filing_id=f.id and e.status='approved' and e.reversed_by is null)
    order by f.filed_at,f.id;
end $$;

create or replace function clara.get_journal_entry_for(p_entry uuid, p_client uuid) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if not clara._agent_read_admitted('get_journal_entry_for',p_client) then return null; end if;
  end if;
  return (select jsonb_build_object('entry',to_jsonb(e),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no)
      from clara.journal_lines l where l.entry_id=e.id),'[]'::jsonb))
    from clara.journal_entries e where e.id=p_entry and e.client_id=p_client);
end $$;

-- ---------------------------------------------------------------------------
-- Complete grant sweep and exact 0011 matrix.
-- ---------------------------------------------------------------------------
alter default privileges for role clara_fn_owner in schema clara
  revoke execute on functions from public;
revoke execute on all functions in schema clara from public;

grant execute on function
  clara.add_counterparty_alias(uuid,uuid,text,text,text),
  clara.retire_counterparty_alias(uuid,uuid,text),
  clara.rename_counterparty(uuid,uuid,text,text),
  clara.merge_counterparties(uuid,uuid,uuid,text,text),
  clara.request_autodraft(uuid),
  clara.acknowledge_sweep_run(uuid,text),
  clara.propose_coding_rule(uuid,uuid,text,text),
  clara.sign_coding_rule(uuid,text),
  clara.decline_coding_rule(uuid,text,text),
  clara.retire_coding_rule(uuid,text,uuid,text),
  clara.open_question(uuid,text,uuid,text,text),
  clara.resolve_open_question(uuid,text,text),
  clara.dismiss_open_question(uuid,text,text),
  clara.promote_clarify_to_question(uuid,text,uuid,text),
  clara.grant_client_egress(uuid,uuid,text,text),
  clara.revoke_client_egress(uuid,text,text),
  clara.approve_routine_entry(uuid,uuid,text),
  clara.list_review_queue(jsonb,jsonb,int),
  clara.get_sweep_run(uuid),
  clara.get_open_question(uuid),
  clara.get_coding_rule(uuid)
to clara_authenticated;

grant execute on function
  clara.coding_lane(uuid,uuid),
  clara.list_coding_lanes(uuid),
  clara.get_entry_diff(uuid,uuid),
  clara.get_doc_entry_diff(uuid,uuid)
to clara_authenticated,clara_agent_ro;

grant execute on function
  clara.admit_autodraft_task(uuid,text,uuid,text,bigint),
  clara.begin_autodraft_task(uuid,text),
  clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb),
  clara.open_sweep_run(uuid,int),
  clara.reconcile_sweep_runs(),
  clara.list_autodraft_candidates(),
  clara.list_document_autodraft_candidates(uuid),
  clara.get_document_for_human_read(uuid,uuid)
to clara_runtime;

grant execute on function clara.wake_open_question(uuid,text,uuid,text,text)
to clara_wake_interactive;

-- Keep the shipped matrices explicit after the PUBLIC sweep.
grant execute on function
  clara.draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,jsonb,jsonb),
  clara.upsert_account(uuid,text,text,text,text,text,text),
  clara.approve_entry(uuid,uuid,text,text),
  clara.reverse_entry(uuid,text,text),
  clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb),
  clara.withdraw_draft(uuid,text,uuid,text),
  clara.file_document(uuid,uuid,text,text),
  clara.confirm_attribution_candidate(uuid,text,boolean),
  clara.approve_wrong_client_correction(uuid,text,text,text),
  clara.open_coding_task(uuid,uuid,uuid,text,text),
  clara.complete_coding_task(uuid,uuid,text),
  clara.dismiss_coding_task(uuid,text,text)
to clara_authenticated;

grant execute on function
  clara.list_unassigned_documents(int),
  clara.get_document_extract(uuid,uuid,int),
  clara.get_draft_review(uuid,uuid),
  clara.get_context_pack(uuid,text),
  clara.list_uncoded_filings(uuid),
  clara.get_journal_entry_for(uuid,uuid)
to clara_authenticated,clara_agent_ro;

grant execute on function
  clara.enqueue_invoice_facts(uuid),
  clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb),
  clara.fail_invoice_facts(uuid,text),
  clara.claim_document_processing_task(uuid,text,boolean),
  clara.release_held_document_tasks(int),
  clara.requeue_stranded_document_task(uuid,text),
  clara.get_coding_attempt(uuid),
  clara.begin_chat_turn(uuid,uuid,text,jsonb,text),
  clara.settle_chat_turn(uuid,jsonb,bigint,text,text)
to clara_runtime;

grant execute on function clara.wake_draft_entry(uuid,uuid,date,text,jsonb,uuid,text,
  jsonb,text,bigint,jsonb,jsonb,jsonb,text) to clara_wake_interactive;

-- ---------------------------------------------------------------------------
-- Migration-tail assertions (0009 idiom): catalog shape, ACL matrix, taxonomy,
-- unchanged surfaces, body pins, and the two CLR05 behavioral refusals.
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text; v_count int; v_public int; v_missing int; v_extra int; v_acl record;
  v_tables text[]:=array['counterparty_aliases','sweep_runs','autodraft_attempts',
    'sweep_run_items','coding_rules','open_questions','rule_sightings','rule_decisions',
    'journal_entry_revisions','client_egress_consents'];
  v_one_overload text[]:=array['coding_lane','list_coding_lanes','list_review_queue',
    'get_sweep_run','get_open_question','get_coding_rule','get_entry_diff',
    'get_doc_entry_diff','get_document_for_human_read','add_counterparty_alias',
    'retire_counterparty_alias','rename_counterparty','merge_counterparties',
    'admit_autodraft_task','request_autodraft','begin_autodraft_task',
    'settle_autodraft_task','open_sweep_run','reconcile_sweep_runs',
    'list_autodraft_candidates','list_document_autodraft_candidates',
    'acknowledge_sweep_run','propose_coding_rule','sign_coding_rule',
    'decline_coding_rule','retire_coding_rule','open_question','wake_open_question',
    'resolve_open_question','dismiss_open_question','promote_clarify_to_question',
    'grant_client_egress','revoke_client_egress','approve_routine_entry',
    '_open_question_blocks','wake_client','is_high_stakes','eligible_checker_count',
    'reverse_entry','draft_entry','wake_draft_entry','begin_chat_turn','settle_chat_turn'];
begin
  foreach v_name in array v_one_overload loop
    select count(*)::int into v_count from pg_proc p join pg_namespace n
      on n.oid=p.pronamespace where n.nspname='clara' and p.proname=v_name;
    if v_count<>1 then
      raise exception '0011 overload assertion failed: clara.% has % overloads',
        v_name,v_count using errcode='CLR10';
    end if;
  end loop;

  if to_regprocedure('clara.mint_wake_credential(text,uuid,uuid,interval)') is not null
     or to_regprocedure('clara.wake_context()') is null
     or to_regprocedure('clara.mint_wake_credential(text,uuid,uuid,interval,uuid)') is null
     or (select pg_get_function_result('clara.wake_context()'::regprocedure)) not like
       '%client_id uuid%' then
    raise exception '0011 C-1 wake signature assertion failed' using errcode='CLR10';
  end if;

  select count(*)::int into v_public from pg_proc p join pg_namespace n
    on n.oid=p.pronamespace cross join lateral
    aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname='clara' and a.grantee=0 and a.privilege_type='EXECUTE';
  if v_public<>0 then
    raise exception '0011 PUBLIC execute assertion failed: % functions exposed',v_public
      using errcode='CLR10';
  end if;

  foreach v_name in array v_tables loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_name and c.relkind='r'
          and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '0011 RLS/FORCE assertion failed for clara.%',v_name using errcode='CLR10';
    end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        where n.nspname='clara' and c.relname=v_name and a.grantee<>(select oid
          from pg_roles where rolname='clara_fn_owner')) then
      raise exception '0011 direct table grant assertion failed for clara.%',v_name
        using errcode='CLR10';
    end if;
    if not exists(select 1 from pg_policies p where p.schemaname='clara'
        and p.tablename=v_name and p.roles=array['clara_fn_owner']::name[]) then
      raise exception '0011 owner policy assertion failed for clara.%',v_name
        using errcode='CLR10';
    end if;
  end loop;

  select count(*)::int into v_count from clara.wake_fn_allowlist
    where wake_kind='autodraft' and function_name in ('wake_draft_entry',
      'get_document_extract','get_context_pack','get_draft_review','coding_lane',
      'wake_open_question');
  if v_count<>6 or (select count(*) from clara.wake_fn_allowlist
      where wake_kind='autodraft')<>6 or not exists(select 1 from clara.wake_fn_allowlist
      where wake_kind='interactive' and function_name='wake_open_question') then
    raise exception '0011 PIN-DELTA-1 allowlist assertion failed' using errcode='CLR10';
  end if;

  if not pg_catalog.has_function_privilege('clara_runtime_login',
      'clara.record_rule_resolution(uuid,text)','execute')
     or pg_catalog.has_function_privilege('clara_runtime',
      'clara.record_rule_resolution(uuid,text)','execute') then
    raise exception '0011 AB-3 direct login ACL assertion failed' using errcode='CLR10';
  end if;
  if position('engine_kind in (''ocr'',''structured_parse'')' in lower(
      (select p.prosrc from pg_proc p where p.oid=
        'clara.record_rule_resolution(uuid,text)'::regprocedure)))=0 then
    raise exception '0011 AB-3 engine predicate assertion failed' using errcode='CLR10';
  end if;

  if (select count(*) from (values ('sweep.run_completed'),('kb_rule.proposed'),
      ('kb_rule.signed'),('kb_rule.retired'),('open_question.opened'),
      ('open_question.resolved'),('counterparty.merged'),('egress.consent_granted'),
      ('egress.consent_revoked')) x(name) join clara.event_types e on e.name=x.name
      join clara.taxonomy_active a on a.singleton join clara.trigger_taxonomy t
        on t.version=a.version and t.event_type=x.name)<>9 then
    raise exception '0011 nine-event taxonomy pair assertion failed' using errcode='CLR10';
  end if;
  select count(*)::int into v_missing from clara.event_types e where not exists(
    select 1 from clara.trigger_taxonomy t join clara.taxonomy_active a
      on a.version=t.version and a.singleton where t.event_type=e.name);
  select count(*)::int into v_extra from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version=t.version and a.singleton
    where not exists(select 1 from clara.event_types e where e.name=t.event_type);
  if v_missing<>0 or v_extra<>0 then
    raise exception '0011 active taxonomy coverage is not whole (missing %, extra %)',
      v_missing,v_extra using errcode='CLR10';
  end if;

  if not pg_catalog.has_function_privilege('clara_authenticated',
       'clara.list_review_queue(jsonb,jsonb,integer)','execute')
     or pg_catalog.has_function_privilege('clara_agent_ro',
       'clara.list_review_queue(jsonb,jsonb,integer)','execute')
     or not pg_catalog.has_function_privilege('clara_agent_ro',
       'clara.coding_lane(uuid,uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_agent_ro',
       'clara.get_entry_diff(uuid,uuid)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime',
       'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime',
       'clara.get_document_for_human_read(uuid,uuid)','execute')
     or pg_catalog.has_function_privilege('clara_authenticated',
       'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)','execute')
     or not pg_catalog.has_function_privilege('clara_wake_interactive',
       'clara.wake_open_question(uuid,text,uuid,text,text)','execute') then
    raise exception '0011 grant matrix assertion failed' using errcode='CLR10';
  end if;

  for v_acl in select * from (values
    ('clara.coding_lane(uuid,uuid)',true,true,false,false),
    ('clara.list_coding_lanes(uuid)',true,true,false,false),
    ('clara.list_review_queue(jsonb,jsonb,integer)',true,false,false,false),
    ('clara.get_sweep_run(uuid)',true,false,false,false),
    ('clara.get_open_question(uuid)',true,false,false,false),
    ('clara.get_coding_rule(uuid)',true,false,false,false),
    ('clara.get_entry_diff(uuid,uuid)',true,true,false,false),
    ('clara.get_doc_entry_diff(uuid,uuid)',true,true,false,false),
    ('clara.get_document_for_human_read(uuid,uuid)',false,false,false,true),
    ('clara.add_counterparty_alias(uuid,uuid,text,text,text)',true,false,false,false),
    ('clara.retire_counterparty_alias(uuid,uuid,text)',true,false,false,false),
    ('clara.rename_counterparty(uuid,uuid,text,text)',true,false,false,false),
    ('clara.merge_counterparties(uuid,uuid,uuid,text,text)',true,false,false,false),
    ('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)',false,false,false,true),
    ('clara.request_autodraft(uuid)',true,false,false,false),
    ('clara.begin_autodraft_task(uuid,text)',false,false,false,true),
    ('clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)',false,false,false,true),
    ('clara.open_sweep_run(uuid,integer)',false,false,false,true),
    ('clara.reconcile_sweep_runs()',false,false,false,true),
    ('clara.list_autodraft_candidates()',false,false,false,true),
    ('clara.list_document_autodraft_candidates(uuid)',false,false,false,true),
    ('clara.acknowledge_sweep_run(uuid,text)',true,false,false,false),
    ('clara.propose_coding_rule(uuid,uuid,text,text)',true,false,false,false),
    ('clara.sign_coding_rule(uuid,text)',true,false,false,false),
    ('clara.decline_coding_rule(uuid,text,text)',true,false,false,false),
    ('clara.retire_coding_rule(uuid,text,uuid,text)',true,false,false,false),
    ('clara.open_question(uuid,text,uuid,text,text)',true,false,false,false),
    ('clara.wake_open_question(uuid,text,uuid,text,text)',false,false,true,false),
    ('clara.resolve_open_question(uuid,text,text)',true,false,false,false),
    ('clara.dismiss_open_question(uuid,text,text)',true,false,false,false),
    ('clara.promote_clarify_to_question(uuid,text,uuid,text)',true,false,false,false),
    ('clara.grant_client_egress(uuid,uuid,text,text)',true,false,false,false),
    ('clara.revoke_client_egress(uuid,text,text)',true,false,false,false),
    ('clara.approve_routine_entry(uuid,uuid,text)',true,false,false,false),
    ('clara._open_question_blocks(uuid,uuid,uuid)',false,false,false,false),
    ('clara.wake_client()',false,true,false,false),
    ('clara.mint_wake_credential(text,uuid,uuid,interval,uuid)',false,false,false,true),
    ('clara.list_unassigned_documents(integer)',true,true,false,false),
    ('clara.get_document_extract(uuid,uuid,integer)',true,true,false,false),
    ('clara.get_context_pack(uuid,text)',true,true,false,false),
    ('clara.get_draft_review(uuid,uuid)',true,true,false,false),
    ('clara.list_uncoded_filings(uuid)',true,true,false,false),
    ('clara.get_journal_entry_for(uuid,uuid)',true,true,false,false),
    ('clara.get_coding_attempt(uuid)',false,false,false,true)
  ) x(signature,authenticated,agent,wake,runtime)
  loop
    if pg_catalog.has_function_privilege('clara_authenticated',v_acl.signature,'execute')
         is distinct from v_acl.authenticated
       or pg_catalog.has_function_privilege('clara_agent_ro',v_acl.signature,'execute')
         is distinct from v_acl.agent
       or pg_catalog.has_function_privilege('clara_wake_interactive',v_acl.signature,'execute')
         is distinct from v_acl.wake
       or pg_catalog.has_function_privilege('clara_runtime',v_acl.signature,'execute')
         is distinct from v_acl.runtime then
      raise exception '0011 row-by-row grant assertion failed for %',v_acl.signature
        using errcode='CLR10';
    end if;
  end loop;

  if not pg_catalog.has_function_privilege('clara_authenticated',
       'clara.draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,jsonb,jsonb)','execute')
     or not pg_catalog.has_function_privilege('clara_authenticated',
       'clara.reverse_entry(uuid,text,text)','execute')
     or not pg_catalog.has_function_privilege('clara_wake_interactive',
       'clara.wake_draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime',
       'clara.begin_chat_turn(uuid,uuid,text,jsonb,text)','execute')
     or not pg_catalog.has_function_privilege('clara_runtime',
       'clara.settle_chat_turn(uuid,jsonb,bigint,text,text)','execute') then
    raise exception '0011 untouched function ACL assertion failed' using errcode='CLR10';
  end if;

  if position('203005005' in (select p.prosrc from pg_proc p where p.oid=
       'clara.approve_entry(uuid,uuid,text,text)'::regprocedure))=0
     or position('203005003' in (select p.prosrc from pg_proc p where p.oid=
       'clara.approve_entry(uuid,uuid,text,text)'::regprocedure))=0
     or position('203005004' in (select p.prosrc from pg_proc p where p.oid=
       'clara.approve_entry(uuid,uuid,text,text)'::regprocedure))=0
     or position('202991617' in (select p.prosrc from pg_proc p where p.oid=
       'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure))=0 then
    raise exception '0011 advisory-lock constant assertion failed' using errcode='CLR10';
  end if;
end $$;

do $$
declare
  v_firm uuid:=gen_random_uuid(); v_human uuid:=gen_random_uuid();
  v_agent uuid:=gen_random_uuid(); v_client uuid:=gen_random_uuid();
  v_cp uuid:=gen_random_uuid(); v_entry uuid:=gen_random_uuid();
  v_rev uuid; v_detail text;
begin
  begin
    insert into clara.firms(id,name,high_stakes_amount_cents)
      values(v_firm,'0011 CLR05 tail probe',50);
    insert into clara.users(id,display_name,email,is_agent) values
      (v_human,'0011 tail human','0011-human-'||v_human||'@invalid.example',false),
      (v_agent,'0011 tail agent','0011-agent-'||v_agent||'@invalid.example',true);
    insert into clara.firm_memberships(firm_id,user_id,role)
      values(v_firm,v_human,'owner');
    insert into clara.clients(id,firm_id,name) values(v_client,v_firm,'0011 tail client');
    insert into clara.coa_accounts(client_id,account_code,name,account_type,account_class)
      values(v_client,'5000','Tail expense','expense',null),
        (v_client,'2000','Tail payable','liability','payable');
    insert into clara.counterparties(id,firm_id,client_id,kind,name,name_normalized,created_by)
      values(v_cp,v_firm,v_client,'vendor','Tail vendor','tailvendor',v_human);
    insert into clara.journal_entries(id,client_id,status,posting_date,memo,origin,
        maker_actor,last_human_editor)
      values(v_entry,v_client,'draft',current_date,'agent high-stakes probe','agent',
        v_agent,null);
    insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
        credit_cents,counterparty_id) values
      (v_entry,1,'5000',100,0,null),(v_entry,2,'2000',0,100,v_cp);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_human)::text,true);
    select revision_token into v_rev from clara.journal_entries where id=v_entry;
    begin
      perform clara.approve_entry(v_entry,v_rev,null,'0011-tail-no-attestation');
      raise exception '0011 WA-D5 probe unexpectedly approved' using errcode='CLR10';
    exception when sqlstate 'CLR05' then
      get stacked diagnostics v_detail=pg_exception_detail;
      if v_detail is distinct from '{"reason":"attestation_required"}' then
        raise exception '0011 WA-D5 detail mismatch: %',v_detail using errcode='CLR10';
      end if;
    end;
    begin
      perform clara.approve_routine_entry(v_entry,v_rev,'0011-tail-routine');
      raise exception '0011 routine probe unexpectedly approved' using errcode='CLR10';
    exception when sqlstate 'CLR05' then
      get stacked diagnostics v_detail=pg_exception_detail;
      if v_detail is distinct from '{"reason":"routine_refuses_high_stakes"}' then
        raise exception '0011 routine detail mismatch: %',v_detail using errcode='CLR10';
      end if;
    end;
    raise exception '0011 CLR05 probe rollback' using errcode='ZA011';
  exception when sqlstate 'ZA011' then null;
  end;
end $$;

reset role;
