-- 0010_fix_high_stakes_reasons.sql — Slice-6 beta live find (GATE-3 eval):
-- get_draft_review's reason-array appends used `text[] || 'literal'`, which
-- Postgres resolves as anyarray||anyarray and parses the untyped literal as an
-- ARRAY literal -> 22P02 'malformed array literal' the moment ANY reason fires
-- (every above-threshold bill). Same-signature replace with array_append; the
-- fn is SECURITY INVOKER so CREATE OR REPLACE preserves the §9 ACLs, asserted
-- at the tail regardless.

create or replace function clara.get_draft_review(p_entry uuid, p_client uuid default null)
  returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare
  e record; v_current jsonb; cp record; v_result jsonb;
  v_high boolean; v_reasons text[]; v_debits bigint; v_threshold bigint;
  v_near jsonb; v_cp uuid; v_dinv_date text; v_dtotal bigint;
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
  end if;
  select * into e from clara.journal_entries where id=p_entry
    and status='draft' and (p_client is null or client_id=p_client);
  if not found or (current_role='clara_agent_ro'
      and (p_client is null or e.client_id<>p_client)) then
    return null;
  end if;
  v_current:=e.match_fingerprint;
  if e.match_fingerprint->>'decision'='birth' then
    if e.match_fingerprint ? 'registration_normalized' then
      select * into cp from clara.counterparties where client_id=e.client_id
        and registration_normalized=e.match_fingerprint->>'registration_normalized';
      if found then
        v_current:=jsonb_build_object('decision','registration_match',
          'counterparty_id',cp.id,'name_normalized',cp.name_normalized,
          'registration_normalized',cp.registration_normalized);
      elsif exists(select 1 from clara.counterparties where client_id=e.client_id
          and name_normalized=e.match_fingerprint->>'name_normalized'
          and registration_normalized is not null
          and registration_normalized<>e.match_fingerprint->>'registration_normalized') then
        v_current:=jsonb_build_object('decision','registration_conflict',
          'name_normalized',e.match_fingerprint->>'name_normalized');
      end if;
    else
      select * into cp from clara.counterparties where client_id=e.client_id
        and name_normalized=e.match_fingerprint->>'name_normalized'
      order by registration_normalized nulls last,id limit 1;
      if found and cp.registration_normalized is not null then
        v_current:=jsonb_build_object('decision','registered_name_ambiguous',
          'counterparty_id',cp.id,'name_normalized',cp.name_normalized,
          'registration_normalized',cp.registration_normalized);
      elsif found then
        v_current:=jsonb_build_object('decision','name_match_unregistered',
          'counterparty_id',cp.id,'name_normalized',cp.name_normalized);
      end if;
    end if;
  end if;

  select coalesce((select sum(l.debit_cents) from clara.journal_lines l
                   where l.entry_id=e.id),0),
         (select f.high_stakes_amount_cents from clara.firms f where f.id=e.firm_id)
    into v_debits, v_threshold;
  -- W1/FIX-SP-5: a stamped amount_override raises high-stakes; reasons mirror the
  -- boolean's terms plus 'amount_override' when present.
  v_high := e.is_opening_balance or e.is_year_end or e.tax_affecting
    or (e.flags ? 'amount_override') or v_debits >= v_threshold;
  v_reasons := '{}'::text[];
  if e.is_opening_balance then v_reasons:=array_append(v_reasons,'opening_balance'); end if;
  if e.is_year_end then v_reasons:=array_append(v_reasons,'year_end'); end if;
  if e.tax_affecting then v_reasons:=array_append(v_reasons,'tax_affecting'); end if;
  if v_debits >= v_threshold then v_reasons:=array_append(v_reasons,'amount_threshold'); end if;
  if e.flags ? 'amount_override' then v_reasons:=array_append(v_reasons,'amount_override'); end if;

  -- W2: advisory near-duplicates (never blocking). Computed INLINE as an invoker
  -- read (RLS-scoped) directly off the facts tables -- get_draft_review is
  -- security-invoker and must not call the ungranted definer _invoice_fact_state, and
  -- exposing that unscoped helper to the read lanes would leak cross-firm facts. A
  -- match = same resolved vendor + (same facts invoice_date OR equal facts total).
  v_cp := nullif(v_current->>'counterparty_id','')::uuid;
  if v_cp is null or e.document_id is null then
    v_near := '[]'::jsonb;
  else
    select nullif(btrim(min(r.text_content) filter (where r.field_path='invoice.invoice_date')),''),
           min(r.monetary_cents) filter (where r.field_path='invoice.total')
      into v_dinv_date, v_dtotal
    from clara.document_regions r
    where r.extraction_id = (select ex.id from clara.document_extractions ex
      where ex.document_id=e.document_id and ex.engine_kind='invoice_facts'
        and ex.status='done' order by ex.version_n desc, ex.id desc limit 1);
    select coalesce(jsonb_agg(z.x order by z.x_posting, z.x_id), '[]'::jsonb) into v_near
    from (
      select e2.id as x_id, e2.posting_date as x_posting,
        jsonb_build_object('entry_id',e2.id,'document_id',e2.document_id,
          'invoice_id',cf.inv_id,'total_cents',cf.total_cents,
          'posting_date',e2.posting_date) as x
      from clara.journal_entries e2
      cross join lateral (
        select nullif(btrim(min(r.text_content) filter (where r.field_path='invoice.invoice_id')),'') as inv_id,
               nullif(btrim(min(r.text_content) filter (where r.field_path='invoice.invoice_date')),'') as inv_date,
               min(r.monetary_cents) filter (where r.field_path='invoice.total') as total_cents
        from clara.document_regions r
        where r.extraction_id = (select ex.id from clara.document_extractions ex
          where ex.document_id=e2.document_id and ex.engine_kind='invoice_facts'
            and ex.status='done' order by ex.version_n desc, ex.id desc limit 1)
      ) cf
      where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
        and e2.status='approved' and e2.reversed_by is null and e2.id<>e.id
        and e2.document_id is not null
        and exists(select 1 from clara.journal_lines l2
                   where l2.entry_id=e2.id and l2.counterparty_id=v_cp)
        and ( (v_dinv_date is not null and cf.inv_date=v_dinv_date)
           or (v_dtotal is not null and cf.total_cents=v_dtotal) )
    ) z;
  end if;

  select jsonb_build_object(
    'entry',to_jsonb(e),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'line_no',l.line_no,'account_code',l.account_code,
      'account_name',a.name,'account_type',a.account_type,
      'account_class',a.account_class,'debit_cents',l.debit_cents,
      'credit_cents',l.credit_cents,'description',l.description,
      'counterparty_id',l.counterparty_id) order by l.line_no)
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=e.id),'[]'::jsonb),
    'counterparty',jsonb_build_object('proposal',e.proposed_counterparty,
      'fingerprint',e.match_fingerprint,'current_outcome',v_current),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object(
      'id',ev.id,'document_id',ev.document_id,'extraction_id',ev.extraction_id,
      'region_id',ev.region_id,'field_path',ev.field_path,'quote',ev.quote,
      'fact_hash',ev.fact_hash,'provenance_tier',ev.provenance_tier)
      order by ev.id) from clara.entry_evidence ev where ev.entry_id=e.id),'[]'::jsonb),
    'eligible_checker_count',(select count(*)::int from clara.firm_memberships m
      join clara.users u on u.id=m.user_id where m.firm_id=e.firm_id
        and m.status='active' and m.role in ('bookkeeper','admin','owner')
        and not u.is_agent),
    'high_stakes',v_high,
    'high_stakes_reasons',to_jsonb(v_reasons),
    'flags',coalesce(e.flags,'{}'::jsonb),
    'near_duplicates',v_near)
    into v_result;
  return v_result;
end $$;

do $$
declare v_bad int;
begin
  select count(*)::int into v_bad from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='get_draft_review'
      and pg_catalog.has_function_privilege('public', p.oid, 'execute');
  if v_bad <> 0 then
    raise exception '0010: get_draft_review leaked a PUBLIC execute';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='get_draft_review') <> 1 then
    raise exception '0010: get_draft_review overload count is not 1';
  end if;
end $$;
