-- 0013_vendor_registration_facts.sql — Wave-A.1 follow-up (AB-16 / as-built
-- residual #2): make REGISTERED vendors reachable by the autodraft sweep.
--
-- Today invoice_facts captures only the vendor NAME, so _coding_lane_core hands a
-- name-only proposal to _resolve_counterparty, which correctly treats a name-only
-- match against a REGISTERED vendor as ambiguous (CLR23 → 'vendor_ambiguous' → NEEDS
-- REVIEW, never READY). The fix captures the vendor's registration number and FEEDS
-- it into resolution (which already does registration-dominant matching).
--
-- Two SAME-ARITY CREATE OR REPLACEs (ACLs preserved by CoR), NO arity change:
--
-- (A) clara.persist_invoice_facts — the field_path whitelist gains
--     'invoice.vendor_registration'. The mapper (invoiceFacts.v1.azure.mjs v3) now
--     emits the vendor's registration number (Azure prebuilt-invoice `VendorTaxId`)
--     as a NON-MONETARY facts field; WITHOUT this whitelist entry the guard raises
--     CLR10 'unsupported invoice field_path' and ABORTS every persist of an invoice
--     carrying a VendorTaxId. vendor_registration is NEVER added to the monetary
--     list ('invoice.total'/'invoice.amount_due'/'invoice.deposit'), so it stays
--     non-monetary and can never corroborate a Tier-A total. Body otherwise
--     byte-identical to the 0011 definition (the current live one).
--
-- (B) clara._coding_lane_core — reads 'invoice.vendor_registration' from the SAME
--     latest done invoice_facts extraction it already reads the vendor NAME from,
--     into a new v_vendor_reg, and passes it as `registration_no` to
--     _resolve_counterparty when present-and-nonblank. _resolve_counterparty already
--     returns 'registration_match' on a matching registration, so a registered
--     vendor now resolves to its EXISTING counterparty (v_counterparty set, no
--     CLR23) → the lane reaches 'ready' instead of 'vendor_ambiguous'. When NO
--     registration region exists (v_vendor_reg null) the proposal is name-only,
--     BYTE-IDENTICAL to the prior behavior (still 'vendor_ambiguous' for a
--     registered vendor). _coding_lane_core stays a private helper (owner-only, zero
--     PUBLIC); the caller coding_lane keeps its authenticated + agent_ro grant.
--
-- AB-3 SAFETY (why 'invoice.vendor_registration' cannot collide with the matcher's
-- identifier CTE): the region is written to an engine_kind='invoice_facts'
-- extraction, and record_rule_resolution's identifier CTE reads ONLY
-- engine_kind in ('ocr','structured_parse') — invoice_facts extractions are
-- structurally invisible to attribution. Independently, the field_path
-- 'invoice.vendor_registration' matches NONE of the CTE's tin/ssm/account
-- field_path patterns. It can never become an attribution identifier.
--
-- The runner supplies this migration's transaction. Validate on a throwaway PG only.

set role clara_fn_owner;

-- (A) persist_invoice_facts — whitelist 'invoice.vendor_registration' ------------
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
    -- 0013(A): 'invoice.vendor_registration' is a NON-MONETARY identity field the
    -- coding lane feeds into registration-dominant vendor resolution. It is NOT in
    -- the monetary list below, so it never normalizes to cents / corroborates Tier A.
    if v_path not in ('invoice.total','invoice.amount_due','invoice.currency',
        'invoice.vendor_name','invoice.vendor_registration','invoice.invoice_id',
        'invoice.invoice_date','invoice.deposit') then
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

-- (B) _coding_lane_core — feed the vendor registration into resolution -----------
create or replace function clara._coding_lane_core(p_client uuid,p_filing uuid)
  returns table(lane text,reasons text[])
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  f record; v_state jsonb; v_reasons text[]:='{}'::text[]; v_vendor text;
  v_vendor_reg text;
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
  -- 0013(B): read the vendor REGISTRATION from the SAME latest done invoice_facts
  -- extraction. nullif(btrim(...),'') yields null when the region is absent or
  -- blank, so v_vendor_reg is non-null only when a real registration was captured.
  select nullif(btrim(min(r.text_content)),'') into v_vendor_reg
    from clara.document_regions r where r.extraction_id=(
      select e.id from clara.document_extractions e
      where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
      order by e.version_n desc,e.id desc limit 1)
      and r.field_path='invoice.vendor_registration';
  if v_vendor is null then
    v_reasons:=array_append(v_reasons,'vendor_unresolved');
  else
    begin
      -- Carry registration_no when captured so _resolve_counterparty's
      -- registration-dominant lane returns 'registration_match' for a registered
      -- vendor (else a name-only proposal → CLR23 'vendor_ambiguous', as before).
      v_fp:=clara._resolve_counterparty(p_client,
        jsonb_build_object('new',case when v_vendor_reg is not null
          then jsonb_build_object('name',v_vendor,'registration_no',v_vendor_reg)
          else jsonb_build_object('name',v_vendor) end));
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

reset role;

-- Tail asserts ------------------------------------------------------------------
do $$
declare v_src text; v_public int; v_core_extra int;
begin
  -- (B) _coding_lane_core now references the registration field_path.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_coding_lane_core';
  if v_src is null or position('invoice.vendor_registration' in v_src)=0 then
    raise exception '0013 expected _coding_lane_core to reference invoice.vendor_registration'
      using errcode='CLR10';
  end if;
  -- (A) persist_invoice_facts now whitelists the registration field_path.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='persist_invoice_facts';
  if v_src is null or position('invoice.vendor_registration' in v_src)=0 then
    raise exception '0013 expected persist_invoice_facts to whitelist invoice.vendor_registration'
      using errcode='CLR10';
  end if;
  -- PUBLIC holds zero execute on either recreated fn (private/definer posture).
  select count(*)::int into v_public
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='clara' and p.proname in ('_coding_lane_core','persist_invoice_facts')
    and a.grantee=0 and a.privilege_type='EXECUTE';
  if v_public<>0 then
    raise exception '0013 PUBLIC execute assertion failed: % exposed',v_public using errcode='CLR10';
  end if;
  -- _coding_lane_core stays a PRIVATE helper — no app-role gained EXECUTE (only the
  -- owner clara_fn_owner). CoR preserves ACLs; this asserts nothing leaked in.
  select count(*)::int into v_core_extra
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
  where n.nspname='clara' and p.proname='_coding_lane_core'
    and r.rolname<>'clara_fn_owner';
  if v_core_extra<>0 then
    raise exception '0013 _coding_lane_core leaked % non-owner EXECUTE grant(s)',v_core_extra
      using errcode='CLR10';
  end if;
  -- The caller coding_lane KEEPS its authenticated + agent_ro grant (untouched).
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and p.proname='coding_lane'
      and r.rolname='clara_authenticated' and a.privilege_type='EXECUTE')
   or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and p.proname='coding_lane'
      and r.rolname='clara_agent_ro' and a.privilege_type='EXECUTE') then
    raise exception '0013 coding_lane lost its authenticated/agent_ro EXECUTE'
      using errcode='CLR10';
  end if;
  -- persist_invoice_facts KEEPS its clara_runtime grant (untouched).
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and p.proname='persist_invoice_facts'
      and r.rolname='clara_runtime' and a.privilege_type='EXECUTE') then
    raise exception '0013 persist_invoice_facts lost its clara_runtime EXECUTE'
      using errcode='CLR10';
  end if;
end $$;
