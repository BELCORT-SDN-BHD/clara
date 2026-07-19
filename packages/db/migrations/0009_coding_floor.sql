-- 0009_coding_floor -- Slice 6 coding floor, counterparty subledger, durable
-- coding tasks, invoice-facts enrichment, filing-keyed draft lifecycle, and the
-- client-pinned review surface.
--
-- Authority: docs/plan/slice6-migration-0009-design.md v1.3,
-- docs/plan/slice6-thin-e2e-contract.md v1.3, the ratified S6-D1/S6-D2
-- companion, and .tmp/slice6-build/INTERFACE-PINS.md.
-- The runner supplies this migration's transaction. Deploying it over a live
-- runtime requires the writer quiesce described in packages/db/README.md (D1).
--
-- DB-LAYER ERROR MAP (C-20; runtime/card mappings live in their owning lanes):
--
-- SQLSTATE / constraint or source                       -> Clara result
-- CLR21, DETAIL {"reason":"amount_conflict"}          -> CLR21 amount exception
-- CLR21, DETAIL {"reason":"currency_unsupported"}     -> CLR21 terminal refusal
-- CLR21, DETAIL {"reason":"vendor_malformed"}         -> CLR21 terminal refusal
-- CLR21, DETAIL {"reason":"evidence_invalid"}         -> CLR21 terminal refusal
-- CLR21, DETAIL {"reason":"double_coded"}             -> CLR21 terminal refusal
-- CLR21, DETAIL {"reason":"duplicate_bill"}           -> CLR21 duplicate exact bill
-- 23505 uq_journal_entries_one_open_draft_filing        -> CLR21 double_coded
-- 23505 uq_coding_attempts_task / uq_coding_attempts_entry -> CLR21 double_coded
--
-- AMOUNT-EXCEPTION / GOVERNED-OVERRIDE SEMANTICS (W1/W2):
--   A supplier_bill draft whose corroborated machine total conflicts with the
--   proposed total does NOT raise at draft/revise -- it PERSISTS carrying
--   journal_entries.flags.amount_exception {machine_total_cents, proposed_cents,
--   fact_hash, at}. approve_entry then refuses CLR21 amount_conflict while the
--   exception is present unless flags.amount_override {reason, region_id, actor,
--   at} was stamped by revise_entry's p_amount_override. A conforming revise
--   clears both. A newer facts completion voids the override and recomputes the
--   exception (persist_invoice_facts). An exact (client, resolved vendor, facts
--   invoice_id) duplicate refuses CLR21 duplicate_bill unless
--   flags.duplicate_override {reason, actor, at} (revise's p_duplicate_override).
-- 23505 uq_counterparties_client_registration           -> CLR23
-- 23505 uq_counterparties_client_unregistered_name      -> CLR23
-- CLR22 revise/withdraw lifecycle or missing reason     -> CLR22
-- CLR23 counterparty/fingerprint/supplier-bill shape    -> CLR23
-- CLR24 coding-task transition/result proof             -> CLR24
-- CLR25 facts newer than the draft's bound evidence     -> CLR25
-- 23503 entry-evidence/counterparty tenant congruence    -> CLR11 not-found collapse
-- 23503 coding-task result/filing tenant congruence      -> CLR24 not-found collapse
-- CLR03 / CLR04 / CLR08                                  -> inherited wake/auth/immutability
-- 42501 agent call of a human writer                     -> structural privilege refusal
-- Runtime-only session_unbound                          -> NOT raised by this migration

-- =====================================================================
-- 0. WRITE-POOL LOGIN SHELL (deploy role; clara_fn_owner is NOCREATEROLE)
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_wake_write_login') then
    create role clara_wake_write_login nologin;
  end if;
  alter role clara_wake_write_login nologin nocreaterole inherit;
  if current_setting('is_superuser') = 'on' then
    alter role clara_wake_write_login nosuperuser nobypassrls nocreatedb;
  end if;
end $$;

set role clara_fn_owner;

-- =====================================================================
-- 4. INTERNAL VALIDATORS, IDENTITY RESOLUTION, FACTS STATE, AND METERING
-- =====================================================================

-- The existing task state machine gains only the two honest pre-call terminal
-- edges used by invoice facts (budget and attempt-cap). Identity remains frozen.
create or replace function clara._tf_processing_task_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'document processing tasks are not deleted' using errcode = 'CLR08';
  end if;
  if old.status in ('done','failed') then
    raise exception 'terminal document processing task is immutable' using errcode = 'CLR16';
  end if;
  if new.id <> old.id or new.firm_id <> old.firm_id or new.document_id <> old.document_id
     or new.engine_id <> old.engine_id or new.engine_config <> old.engine_config
     or new.version_n <> old.version_n or new.lane <> old.lane
     or new.created_at <> old.created_at then
    raise exception 'document processing task identity/config is immutable' using errcode = 'CLR08';
  end if;
  if new.status <> old.status then
    v_ok := (old.status = 'queued' and new.status in ('running','held_egress'))
         or (old.status = 'queued' and new.status = 'failed'
             and new.error_code in ('budget','attempt_cap'))
         or (old.status = 'held_egress' and new.status = 'queued')
         or (old.status = 'running' and new.status in ('done','failed','queued'));
    if not v_ok then
      raise exception 'illegal document processing transition % -> %', old.status, new.status
        using errcode = 'CLR16';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Deterministic MYR normalization: currency labels and grouping separators are
-- discarded, but ambiguous precision and non-numeric text never become money.
create function clara._normalize_invoice_cents(p_raw text) returns bigint
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v text; v_negative boolean := false; v_amount numeric;
begin
  if p_raw is null or btrim(p_raw) = '' then return null; end if;
  v := upper(btrim(p_raw));
  v := regexp_replace(v, '(MYR|RM)', '', 'g');
  v := regexp_replace(v, '[,[:space:]]', '', 'g');
  if v ~ '^\([0-9]+([.][0-9]{1,2})?\)$' then
    v_negative := true;
    v := substr(v, 2, length(v) - 2);
  elsif v !~ '^-?[0-9]+([.][0-9]{1,2})?$' then
    return null;
  end if;
  begin
    v_amount := v::numeric;
  exception when others then
    return null;
  end;
  if v_negative then v_amount := -v_amount; end if;
  return (v_amount * 100)::bigint;
end $$;

-- FIX-S-1: the single fact-hash equation. jsonb normalizes key order, so this is
-- byte-identical to the former inline copies regardless of build order.
create function clara._fact_hash(p_extraction uuid, p_region uuid, p_field text,
    p_quote text, p_cents bigint) returns text
  language sql immutable set search_path = clara, pg_temp as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'extraction_id', p_extraction, 'region_id', p_region,
    'field_path', p_field, 'quote', coalesce(p_quote,''),
    'monetary_cents', p_cents)::text, 'UTF8')), 'hex');
$$;

-- Selects one concrete completed (engine, version) snapshot and returns its
-- corroboration state. The chosen extraction id/version is always in the result;
-- no caller relies on an unversioned "current extraction" alias.
create function clara._invoice_fact_state(p_document uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_ext uuid; v_version int; v_total_count int; v_total_region uuid;
  v_total bigint; v_conf numeric; v_locator text; v_currency text;
  v_due bigint; v_deposit bigint; v_hash text; v_ok boolean;
  v_locator_json jsonb; v_poly_ok boolean; v_ineligible text;
  v_invoice_id text; v_invoice_date text;
begin
  select e.id, e.version_n, nullif(btrim(e.envelope->>'corroboration_ineligible'),'')
    into v_ext, v_version, v_ineligible
  from clara.document_processing_tasks t
  join clara.document_extractions e
    on e.document_id = t.document_id and e.engine_id = t.engine_id
   and e.version_n = t.version_n and e.engine_kind = 'invoice_facts'
   and e.status = 'done'
  where t.document_id = p_document and t.lane = 'invoice_facts' and t.status = 'done'
  order by t.version_n desc, t.id desc limit 1;
  if v_ext is null then return '{}'::jsonb; end if;

  select count(*)::int into v_total_count
  from clara.document_regions
  where extraction_id = v_ext and field_path = 'invoice.total';
  select id, monetary_cents, engine_confidence, locator_kind, locator
    into v_total_region, v_total, v_conf, v_locator, v_locator_json
  from clara.document_regions
  where extraction_id = v_ext and field_path = 'invoice.total'
  order by id limit 1;
  select upper(regexp_replace(coalesce(min(text_content),''), '[^A-Za-z]', '', 'g'))
    into v_currency from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.currency';
  select min(monetary_cents) into v_due from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.amount_due';
  select min(monetary_cents) into v_deposit from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.deposit';
  select nullif(btrim(min(text_content)),'') into v_invoice_id from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.invoice_id';
  select nullif(btrim(min(text_content)),'') into v_invoice_date from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.invoice_date';

  if v_total_region is not null then
    select clara._fact_hash(r.extraction_id, r.id, r.field_path, r.text_content,
      r.monetary_cents) into v_hash from clara.document_regions r where r.id = v_total_region;
  end if;
  -- W3: a total with no physical geometry (empty polygon array) can never reach
  -- Tier A. Persistence still stores such rows; they simply never corroborate.
  v_poly_ok := jsonb_typeof(v_locator_json->'polygon') = 'array'
    and jsonb_array_length(v_locator_json->'polygon') > 0;
  v_ok := v_total_count = 1 and v_total is not null and v_total > 0
    and coalesce(v_conf, 0) >= 0.95 and v_locator = 'page_polygon' and v_poly_ok
    and v_currency = 'MYR'
    and (v_due is null or v_due = v_total)
    and coalesce(v_deposit, 0) = 0
    and v_ineligible is null;
  return jsonb_build_object(
    'extraction_id', v_ext, 'version_n', v_version,
    'total_region_id', v_total_region, 'total_cents', v_total,
    'total_fact_hash', v_hash, 'currency', nullif(v_currency,''),
    'invoice_id', v_invoice_id, 'invoice_date', v_invoice_date,
    'corroboration_ineligible', v_ineligible,
    'corroborated', v_ok,
    'explicit_non_myr', nullif(v_currency,'') is not null and v_currency <> 'MYR'
  );
end $$;

-- FIX-S-2: the single corroboration-binding equation. True when the entry carries a
-- 'verified' invoice.total evidence row whose cited cents equal the corroborated
-- machine total AND whose stored fact_hash still matches the current region (so a
-- newer/contradicting facts version fails it). Callers decide the raised code:
-- draft/revise raise CLR21 evidence_invalid, approve raises CLR25 (stale evidence).
-- plpgsql (not sql) so its reference to entry_evidence -- created later in this
-- migration -- is resolved at call time, not at CREATE time.
create function clara._corroboration_bound(p_entry uuid, p_total_cents bigint)
  returns boolean
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  return exists (
    select 1 from clara.entry_evidence ev
    join clara.document_regions r on r.id = ev.region_id
      and r.extraction_id = ev.extraction_id
    where ev.entry_id = p_entry and ev.provenance_tier = 'verified'
      and ev.field_path = 'invoice.total'
      and coalesce(r.monetary_cents, clara._normalize_invoice_cents(ev.quote)) = p_total_cents
      and ev.fact_hash = clara._fact_hash(r.extraction_id, r.id, r.field_path,
        r.text_content, r.monetary_cents)
  );
end $$;

-- W5: an explicit non-MYR currency indicator (ISO code or symbol). Conservative --
-- true ONLY for an EXPLICIT non-MYR token; bare RM/MYR/blank never trips it.
create function clara._is_explicit_non_myr(p_quote text) returns boolean
  language sql immutable set search_path = clara, pg_temp as $$
  with n as (select upper(regexp_replace(coalesce(p_quote,''), '[[:space:]]', '', 'g')) as q)
  select case
    when (select q from n) = '' then false
    when (select q from n) in ('RM','MYR','RMMYR','MYRRM') then false
    -- explicit ISO codes / symbols for non-MYR currencies (word-boundary safe)
    when (select q from n) ~ '(^|[^A-Z])(USD|SGD|EUR|GBP|JPY|CNY|RMB|AUD|NZD|CAD|CHF|HKD|IDR|THB|PHP|VND|INR|KRW|TWD|BND|AED|SAR|MMK|LAK|KHR)([^A-Z]|$)' then true
    when (select q from n) ~ '(US\$|S\$|A\$|NZ\$|HK\$|C\$|€|£|¥|₩|฿|₱|₫|₹|Rp)' then true
    else false
  end;
$$;

-- W5: true when the SUBMITTED evidence array cites an invoice.currency row whose
-- quote is an explicit non-MYR currency. Checked against the raw submission BEFORE
-- evidence recoverability, so a non-MYR quote refuses as currency_unsupported rather
-- than being swallowed as merely unrecoverable evidence.
create function clara._evidence_cites_non_myr(p_evidence jsonb) returns boolean
  language sql immutable set search_path = clara, pg_temp as $$
  select case when jsonb_typeof(p_evidence) = 'array' then coalesce((
    select bool_or(clara._is_explicit_non_myr(z.elem->>'quote'))
    from jsonb_array_elements(p_evidence) as z(elem)
    where z.elem->>'field_path' = 'invoice.currency'), false)
  else false end;
$$;

-- Shared line validator used by draft and revise. Its returned array includes the
-- governed <=5-cent rounding append, so both paths have byte-identical line law.
create function clara._validate_entry_lines(p_client uuid, p_lines jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_n int; v_dr bigint := 0; v_cr bigint := 0; v_residual bigint;
  v_round text; v_round_dr bigint := 0; v_round_cr bigint := 0;
  v_result jsonb := '[]'::jsonb; e record; v_debit bigint; v_credit bigint;
begin
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a JSON array' using errcode = 'CLR10';
  end if;
  v_n := jsonb_array_length(p_lines);
  if v_n < 2 then
    raise exception 'an entry needs at least two lines' using errcode = 'CLR10';
  end if;
  for e in select elem, idx from jsonb_array_elements(p_lines)
      with ordinality as x(elem, idx) loop
    if jsonb_typeof(e.elem) <> 'object' or nullif(e.elem->>'account_code','') is null then
      raise exception 'each line requires an account_code' using errcode = 'CLR10';
    end if;
    begin
      v_debit := coalesce((e.elem->>'debit_cents')::bigint, 0);
      v_credit := coalesce((e.elem->>'credit_cents')::bigint, 0);
    exception when others then
      raise exception 'malformed line amounts (cents must be integers)' using errcode = 'CLR10';
    end;
    if v_debit < 0 or v_credit < 0 or ((v_debit > 0) = (v_credit > 0)) then
      raise exception 'each line must carry exactly one positive debit or credit'
        using errcode = 'CLR10';
    end if;
    if not exists (
      select 1 from clara.coa_accounts a
      where a.client_id = p_client and a.account_code = e.elem->>'account_code'
        and a.is_active
    ) then
      raise exception 'line codes to a non-existent account' using errcode = 'CLR10';
    end if;
    v_dr := v_dr + v_debit;
    v_cr := v_cr + v_credit;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'account_code', e.elem->>'account_code',
      'debit_cents', v_debit, 'credit_cents', v_credit,
      'description', e.elem->>'description'));
  end loop;
  v_residual := abs(v_dr - v_cr);
  if v_residual > 5 then
    raise exception 'entry is unbalanced by %c', v_residual using errcode = 'CLR07';
  end if;
  if v_residual between 1 and 5 then
    select account_code into v_round from clara.coa_accounts
    where client_id = p_client and special_acc_type = 'rounding' and is_active;
    if v_round is null then
      raise exception 'rounding_account_missing' using errcode = 'CLR10';
    end if;
    if v_dr > v_cr then v_round_cr := v_residual; else v_round_dr := v_residual; end if;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'account_code', v_round, 'debit_cents', v_round_dr,
      'credit_cents', v_round_cr, 'description', 'auto rounding'));
  end if;
  return v_result;
end $$;

-- Registration dominates; the helper resolves only. Birth remains inside
-- approve_entry after full-fingerprint congruence has been proved.
create function clara._resolve_counterparty(p_client uuid, p_proposal jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_name text; v_name_n text; v_reg text; v_reg_n text; v_existing uuid;
  v_row record;
begin
  if p_proposal is null then return null; end if;
  if jsonb_typeof(p_proposal) <> 'object' then
    raise exception 'counterparty proposal is malformed'
      using errcode = 'CLR21', detail = '{"reason":"vendor_malformed"}';
  end if;

  if p_proposal ? 'existing_id' and not (p_proposal ? 'new') then
    begin
      v_existing := (p_proposal->>'existing_id')::uuid;
    exception when others then
      raise exception 'counterparty proposal is malformed'
        using errcode = 'CLR21', detail = '{"reason":"vendor_malformed"}';
    end;
    select * into v_row from clara.counterparties
      where id = v_existing and client_id = p_client;
    if not found then
      raise exception 'selected counterparty does not belong to the client' using errcode = 'CLR23';
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'decision', case when v_row.registration_normalized is null
                       then 'name_match_unregistered' else 'registration_match' end,
      'counterparty_id', v_row.id,
      'name_normalized', v_row.name_normalized,
      'registration_normalized', v_row.registration_normalized));
  end if;

  if not (p_proposal ? 'new') or jsonb_typeof(p_proposal->'new') <> 'object' then
    raise exception 'counterparty proposal is malformed'
      using errcode = 'CLR21', detail = '{"reason":"vendor_malformed"}';
  end if;
  v_name := nullif(btrim(p_proposal->'new'->>'name'), '');
  v_reg := nullif(btrim(p_proposal->'new'->>'registration_no'), '');
  v_name_n := lower(regexp_replace(coalesce(v_name,''), '[^a-zA-Z0-9]', '', 'g'));
  v_reg_n := case when v_reg is null then null else
    lower(regexp_replace(v_reg, '[^a-zA-Z0-9]', '', 'g')) end;
  if v_name is null or v_name_n = '' or (v_reg is not null and v_reg_n = '') then
    raise exception 'counterparty proposal is malformed'
      using errcode = 'CLR21', detail = '{"reason":"vendor_malformed"}';
  end if;

  if v_reg_n is not null then
    select * into v_row from clara.counterparties
      where client_id = p_client and registration_normalized = v_reg_n;
    if found then
      return jsonb_build_object(
        'decision','registration_match','counterparty_id',v_row.id,
        'name_normalized',v_row.name_normalized,
        'registration_normalized',v_row.registration_normalized);
    end if;
    select * into v_row from clara.counterparties
      where client_id = p_client and name_normalized = v_name_n
        and registration_normalized is not null
        and registration_normalized <> v_reg_n
      order by id limit 1;
    if found then
      raise exception 'counterparty registration conflicts with the name match'
        using errcode = 'CLR23',
          detail = jsonb_build_object('candidate_id',v_row.id)::text;
    end if;
  else
    select * into v_row from clara.counterparties
      where client_id = p_client and name_normalized = v_name_n
        and registration_normalized is not null
      order by id limit 1;
    if found then
      raise exception 'registered name match is ambiguous without a registration number'
        using errcode = 'CLR23',
          detail = jsonb_build_object('candidate_id',v_row.id)::text;
    end if;
    select * into v_row from clara.counterparties
      where client_id = p_client and name_normalized = v_name_n
        and registration_normalized is null;
    if found then
      return jsonb_build_object(
        'decision','name_match_unregistered','counterparty_id',v_row.id,
        'name_normalized',v_row.name_normalized);
    end if;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'decision','birth','name_normalized',v_name_n,
    'registration_normalized',v_reg_n));
end $$;

-- Evidence is replaced only while the parent is a draft. Every citation is
-- checked against a concrete extraction+region belonging to the cited document.
create function clara._write_entry_evidence(p_entry uuid, p_document uuid,
    p_evidence jsonb) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; x record; je record; v_region uuid; v_field text; v_hash text;
  v_state jsonb; v_tier text; v_source_cents bigint;
begin
  select * into je from clara.journal_entries where id = p_entry;
  if not found or je.status <> 'draft' then
    raise exception 'evidence parent is not an open draft'
      using errcode = 'CLR21', detail = '{"reason":"evidence_invalid"}';
  end if;
  if p_document is null or jsonb_typeof(p_evidence) <> 'array'
     or jsonb_array_length(p_evidence) = 0 then
    raise exception 'document-bound drafts require evidence'
      using errcode = 'CLR21', detail = '{"reason":"evidence_invalid"}';
  end if;
  delete from clara.entry_evidence where entry_id = p_entry;
  v_state := clara._invoice_fact_state(p_document);
  for e in select elem from jsonb_array_elements(p_evidence) as z(elem) loop
    if jsonb_typeof(e.elem) <> 'object' then
      raise exception 'evidence item is malformed'
        using errcode = 'CLR21', detail = '{"reason":"evidence_invalid"}';
    end if;
    begin
      v_region := (e.elem->>'region_id')::uuid;
    exception when others then
      raise exception 'evidence region is malformed'
        using errcode = 'CLR21', detail = '{"reason":"evidence_invalid"}';
    end;
    select r.*, de.document_id, de.status as extraction_status, de.engine_kind
      into x
    from clara.document_regions r
    join clara.document_extractions de on de.id = r.extraction_id
    where r.id = v_region and de.document_id = p_document and de.status = 'done';
    if not found or nullif(btrim(e.elem->>'quote'),'') is null
       or position(e.elem->>'quote' in coalesce(x.text_content,'')) = 0 then
      raise exception 'evidence is not recoverable from the cited region'
        using errcode = 'CLR21', detail = '{"reason":"evidence_invalid"}';
    end if;
    v_field := coalesce(nullif(e.elem->>'field_path',''), x.field_path, 'document.text');
    if e.elem ? 'field_path' and x.field_path is not null and v_field <> x.field_path then
      raise exception 'evidence field_path does not match its region'
        using errcode = 'CLR21', detail = '{"reason":"evidence_invalid"}';
    end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object(
      'extraction_id', x.extraction_id, 'region_id', x.id,
      'field_path', x.field_path, 'quote', coalesce(x.text_content,''),
      'monetary_cents', x.monetary_cents)::text, 'UTF8')), 'hex');
    v_source_cents := coalesce(x.monetary_cents,
      clara._normalize_invoice_cents(e.elem->>'quote'));
    v_tier := case
      when coalesce((v_state->>'corroborated')::boolean,false)
       and v_field = 'invoice.total'
       and v_source_cents = (v_state->>'total_cents')::bigint
      then 'verified' else 'model_read' end;
    insert into clara.entry_evidence(entry_id,firm_id,client_id,document_id,
        extraction_id,region_id,field_path,quote,fact_hash,provenance_tier)
      values(p_entry,je.firm_id,je.client_id,p_document,x.extraction_id,x.id,
        v_field,e.elem->>'quote',v_hash,v_tier);
  end loop;
end $$;

-- Structural supplier-bill floor. The verified-total equation uses only the
-- extraction explicitly bound in entry_evidence; approve_entry separately checks
-- whether a newer facts version made that evidence stale.
create function clara._assert_supplier_bill_shape(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_payable_credit bigint; v_expense_debit bigint;
  v_verified_total bigint;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class='payable' and l.counterparty_id is null
  ) then
    raise exception 'every payable-class line requires a counterparty' using errcode = 'CLR23';
  end if;
  if e.coding_kind = 'supplier_bill' and e.reversal_of is null then
    select coalesce(sum(l.credit_cents),0) into v_payable_credit
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class='payable';
    if v_payable_credit <= 0 then
      raise exception 'supplier bill requires a payable-class credit' using errcode = 'CLR23';
    end if;
    select coalesce(r.monetary_cents,clara._normalize_invoice_cents(ev.quote))
      into v_verified_total
    from clara.entry_evidence ev
    join clara.document_regions r on r.id=ev.region_id and r.extraction_id=ev.extraction_id
    where ev.entry_id=p_entry and ev.provenance_tier='verified'
      and ev.field_path='invoice.total'
    order by ev.id limit 1;
    -- W1: a governed amount_override explicitly permits the proposed total to
    -- diverge from the corroborated machine total, so the gross equation is
    -- relaxed (the payable-credit floor above still holds). The distinct-checker
    -- law binds via is_high_stakes(amount_override) at approve.
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

create function clara._tf_assert_supplier_bill_shape() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_supplier_bill_shape(new.id);
  return null;
end $$;

-- WHEN scope is load-bearing: facts completion rotates draft tokens without
-- entering this approved-transition constraint trigger.
create constraint trigger t_je_supplier_bill_shape
  after update on clara.journal_entries
  deferrable initially deferred
  for each row when (old.status is distinct from new.status and new.status = 'approved')
  execute function clara._tf_assert_supplier_bill_shape();

create or replace function clara._tf_entry_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_allowed text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'journal entries are never deleted (reverse, not delete)' using errcode = 'CLR08';
  end if;
  if old.status = 'draft' and new.status = 'draft' then
    v_allowed := array['revision_token','updated_at','proposed_counterparty',
                       'match_fingerprint','last_human_editor','flags'];
  elsif old.status = 'draft' and new.status = 'approved' then
    if old.checker_actor is not null or new.checker_actor is null or new.approved_at is null then
      raise exception 'illegal approval transition' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','checker_actor','approved_at','self_approval_attestation',
                       'proposed_counterparty','match_fingerprint','updated_at'];
  elsif old.status = 'draft' and new.status = 'withdrawn' then
    if new.withdrawn_by is null or new.withdrawn_at is null
       or btrim(coalesce(new.withdrawal_reason,'')) = '' then
      raise exception 'withdrawal requires actor, time, and reason' using errcode = 'CLR08';
    end if;
    v_allowed := array['status','withdrawn_by','withdrawn_at','withdrawal_reason',
                       'proposed_counterparty','match_fingerprint','updated_at'];
  elsif old.status = 'approved' and new.status = 'approved' then
    if old.reversed_by is not null or old.reversal_reason is not null then
      raise exception 'entry already reversed' using errcode = 'CLR08';
    end if;
    if new.reversed_by is null or btrim(coalesce(new.reversal_reason,'')) = '' then
      raise exception 'approved entries permit only a complete reversal-linkage pair'
        using errcode = 'CLR08';
    end if;
    v_allowed := array['reversed_by','reversal_reason','updated_at'];
  else
    raise exception 'illegal status transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'illegal change to entry (status % -> %)', old.status, new.status
      using errcode = 'CLR08';
  end if;
  return new;
end $$;

create function clara._reserve_processing_call(p_task uuid, p_pages int) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_limit int; v_used bigint; v_id uuid;
begin
  if p_pages < 0 then raise exception 'processing pages must be non-negative' using errcode='CLR18'; end if;
  select * into t from clara.document_processing_tasks where id=p_task;
  if not found or t.lane<>'invoice_facts' then
    raise exception 'invoice-facts task not found' using errcode='CLR18';
  end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select coalesce(sum(pages),0) into v_used from (
    select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
    from clara.document_ingest_reservations
    where firm_id=t.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
    union all
    select case when state='settled' then settled_pages else pages_reserved end::bigint
    from clara.processing_call_reservations
    where firm_id=t.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
  ) q;
  if v_used + p_pages > v_limit then
    raise exception 'invoice-facts daily page limit reached' using errcode='CLR18';
  end if;
  insert into clara.processing_call_reservations(firm_id,task_id,pages_reserved)
    values(t.firm_id,p_task,p_pages) returning id into v_id;
  return v_id;
end $$;

create function clara._settle_processing_call(p_task uuid, p_pages int) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_limit int; v_used bigint;
begin
  if p_pages < 0 then raise exception 'actual pages must be non-negative' using errcode='CLR18'; end if;
  select * into r from clara.processing_call_reservations where task_id=p_task;
  if not found then raise exception 'invoice-facts reservation not found' using errcode='CLR18'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(r.firm_id::text));
  select * into r from clara.processing_call_reservations where task_id=p_task for update;
  if r.state='settled' then return r.id; end if;
  if r.state='refunded' then raise exception 'refunded processing call cannot settle' using errcode='CLR18'; end if;
  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=r.firm_id;
  select coalesce(sum(pages),0) into v_used from (
    select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
    from clara.document_ingest_reservations
    where firm_id=r.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
    union all
    select case when state='settled' then settled_pages else pages_reserved end::bigint
    from clara.processing_call_reservations
    where firm_id=r.firm_id and id<>r.id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
  ) q;
  if v_used + p_pages > v_limit then
    raise exception 'actual invoice-facts pages exceed daily limit' using errcode='CLR18';
  end if;
  update clara.processing_call_reservations set state='settled',settled_pages=p_pages,
    settled_at=now() where id=r.id;
  return r.id;
end $$;

create function clara._refund_processing_call(p_task uuid, p_reason text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record;
begin
  select * into r from clara.processing_call_reservations where task_id=p_task;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(r.firm_id::text));
  select * into r from clara.processing_call_reservations where task_id=p_task for update;
  if r.state='refunded' then return r.id; end if;
  if r.state='settled' then raise exception 'settled processing call cannot refund' using errcode='CLR18'; end if;
  update clara.processing_call_reservations set state='refunded',refunded_at=now(),
    refund_reason=coalesce(nullif(btrim(p_reason),''),'unspecified') where id=r.id;
  return r.id;
end $$;

create function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
begin
  select * into d from clara.documents where id=p_document;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  if not (lower(coalesce(d.mime_type,''))='application/pdf'
      or lower(coalesce(d.mime_type,'')) like 'image/%') then
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  select e.id into v_task from clara.document_extractions e
    where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
    order by e.version_n desc limit 1;
  if v_task is not null then
    return jsonb_build_object('document_id',p_document,'status','already_completed',
      'extraction_id',v_task);
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane='invoice_facts'
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane='invoice_facts';
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
        v_version,'invoice_facts','failed','attempt_cap',now()) returning id into v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
      v_version,'invoice_facts','queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    select id,status into v_task,t.status from clara.document_processing_tasks
      where document_id=p_document and lane='invoice_facts'
        and status in ('queued','held_egress','running') order by id limit 1;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',t.status);
  end if;
  v_pages := greatest(coalesce(d.page_count,1),1);
  begin
    perform clara._reserve_processing_call(v_task,v_pages);
  exception when sqlstate 'CLR18' then
    update clara.document_processing_tasks set status='failed',error_code='budget',
      finished_at=now() where id=v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','budget');
  end;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;

create function clara.enqueue_invoice_facts(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_result jsonb; v_firm uuid;
begin
  v_result:=clara._enqueue_invoice_facts_core(p_document);
  if v_result->>'status'='failed' then
    select firm_id into v_firm from clara.documents where id=p_document;
    perform clara._append_event(v_firm,'document.invoice_facts_failed',null,null,null,null,
      null,p_document,null,jsonb_build_object('task_id',v_result->>'task_id',
        'reason',v_result->>'reason'));
  end if;
  return v_result;
end $$;

reset role;

-- One membership only: the shell must explicitly SET ROLE before it carries any
-- privilege. A newly-created role has no other memberships.
grant clara_wake_interactive to clara_wake_write_login
  with inherit false, set true;

-- Best-effort deploy-role impersonation for the local/non-superuser rig, matching
-- 0006. This does not add a parent role to clara_wake_write_login.
do $$
begin
  execute format('grant clara_wake_write_login to %I with inherit false, set true', current_user);
exception when insufficient_privilege then
  raise notice 'skipping write-login impersonation grant (deploy role lacks ADMIN)';
end $$;

set role clara_fn_owner;

-- =====================================================================
-- 1. EVOLVED CARRIERS + DEPLOY-ONTO-EXISTING ASSERTIONS
-- =====================================================================

-- RPR display codes are retained exactly. The old generated check name is stable
-- on both the fresh and upgrade paths because 0003 named only the column check.
alter table clara.coa_accounts
  drop constraint coa_accounts_account_code_check;
alter table clara.coa_accounts
  add constraint ck_coa_account_code_0009 check (
    account_code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$'
  ),
  add column account_class text,
  add constraint ck_coa_account_class check (
    account_class is null or account_class in ('payable')
  );

alter table clara.document_processing_tasks
  drop constraint document_processing_tasks_lane_check,
  drop constraint document_processing_tasks_error_code_check,
  drop constraint ck_processing_task_binding;
alter table clara.document_processing_tasks
  add constraint ck_processing_task_lane_0009 check (
    lane in ('ocr','structured_parse','none','invoice_facts')
  ),
  add constraint ck_processing_task_error_code_0009 check (
    error_code is null or error_code in
      ('engine_error','timeout','engine_lost','storage_error','corrupt','encrypted',
       'bad_type','limit','budget','attempt_cap','internal')
  ),
  add constraint ck_processing_task_binding_0009 check (
    (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
    or (status in ('running','done') and workflow_run_id is not null and started_at is not null)
    or (status = 'failed' and (
      (workflow_run_id is not null and started_at is not null)
      or (workflow_run_id is null and started_at is null and error_code in ('budget','attempt_cap'))
    ))
  );

alter table clara.document_extractions
  drop constraint document_extractions_engine_kind_check;
alter table clara.document_extractions
  add constraint ck_document_extractions_engine_kind_0009 check (
    engine_kind in ('ocr','structured_parse','invoice_facts')
  );

-- Congruence anchors used by the new composite tenant FKs.
alter table clara.journal_entries
  add constraint uq_journal_entries_id_firm_client unique (id, firm_id, client_id);
alter table clara.document_filings
  add constraint uq_document_filings_id_firm_client_document
    unique (id, firm_id, client_id, document_id);
alter table clara.document_extractions
  add constraint uq_document_extractions_id_firm_document
    unique (id, firm_id, document_id);
alter table clara.document_regions
  add constraint uq_document_regions_id_firm_extraction
    unique (id, firm_id, extraction_id);
alter table clara.agent_tasks
  add constraint uq_agent_tasks_id_firm_client unique (id, firm_id, client_id);

create table clara.counterparties (
  id                      uuid primary key default gen_random_uuid(),
  firm_id                 uuid        not null,
  client_id               uuid        not null,
  kind                    text        not null default 'vendor'
                            check (kind in ('vendor')),
  name                    text        not null check (btrim(name) <> ''),
  name_normalized         text        not null check (btrim(name_normalized) <> ''),
  registration_no         text,
  registration_normalized text,
  tin                     text,
  created_by              uuid        not null references clara.users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, firm_id, client_id),
  constraint fk_counterparties_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint ck_counterparties_name_normalized check (
    name_normalized = lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))
  ),
  constraint ck_counterparties_registration_normalized check (
    (registration_no is null and registration_normalized is null)
    or (registration_no is not null
        and registration_normalized =
          lower(regexp_replace(registration_no, '[^a-zA-Z0-9]', '', 'g'))
        and btrim(registration_normalized) <> '')
  )
);
create unique index uq_counterparties_client_registration
  on clara.counterparties(client_id, registration_normalized)
  where registration_normalized is not null;
create unique index uq_counterparties_client_unregistered_name
  on clara.counterparties(client_id, name_normalized)
  where registration_normalized is null;

alter table clara.journal_entries
  add column proposed_counterparty jsonb,
  add column match_fingerprint jsonb,
  add column coding_kind text,
  add column flags jsonb not null default '{}'::jsonb,
  add constraint ck_je_flags_shape check (jsonb_typeof(flags) = 'object'),
  add constraint ck_je_coding_kind check (
    coding_kind is null or coding_kind in ('supplier_bill')
  ),
  add constraint ck_je_proposed_counterparty_shape check (
    proposed_counterparty is null or (
      jsonb_typeof(proposed_counterparty) = 'object'
      and (
        (proposed_counterparty ? 'existing_id'
          and jsonb_typeof(proposed_counterparty->'existing_id') = 'string'
          and not (proposed_counterparty ? 'new'))
        or
        (proposed_counterparty ? 'new'
          and jsonb_typeof(proposed_counterparty->'new') = 'object'
          and jsonb_typeof(proposed_counterparty->'new'->'name') = 'string'
          and btrim(proposed_counterparty->'new'->>'name') <> ''
          and not (proposed_counterparty ? 'existing_id'))
      )
    )
  ),
  add constraint ck_je_match_fingerprint_shape check (
    match_fingerprint is null or (
      jsonb_typeof(match_fingerprint) = 'object'
      and match_fingerprint->>'decision' in
        ('registration_match','name_match_unregistered','birth')
      and nullif(match_fingerprint->>'name_normalized','') is not null
    )
  );

alter table clara.journal_lines add column counterparty_id uuid;

create table clara.entry_evidence (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid        not null,
  firm_id         uuid        not null,
  client_id       uuid        not null,
  document_id     uuid        not null,
  extraction_id   uuid        not null,
  region_id       uuid,
  field_path      text        not null check (btrim(field_path) <> ''),
  quote           text        not null check (btrim(quote) <> ''),
  fact_hash       text        not null check (fact_hash ~ '^[0-9a-f]{64}$'),
  provenance_tier text        not null check (provenance_tier in ('verified','model_read')),
  created_at      timestamptz not null default now(),
  unique (id, firm_id),
  constraint fk_entry_evidence_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_entry_evidence_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_entry_evidence_extraction foreign key (extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  constraint fk_entry_evidence_region foreign key (region_id, firm_id, extraction_id)
    references clara.document_regions(id, firm_id, extraction_id)
);
create index ix_entry_evidence_entry on clara.entry_evidence(entry_id, id);
create index ix_entry_evidence_document on clara.entry_evidence(document_id, entry_id);

alter table clara.journal_lines
  add constraint fk_journal_lines_counterparty foreign key
    (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id);

create table clara.coding_tasks (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid        not null,
  client_id       uuid        not null,
  document_id     uuid        not null,
  filing_id       uuid        not null,
  origin          text        not null check (origin in ('correction','manual')),
  correction_id   uuid,
  status          text        not null default 'open'
                              check (status in ('open','done','dismissed')),
  opened_by       uuid        not null references clara.users(id),
  closed_by       uuid        references clara.users(id),
  closed_reason   text,
  result_entry_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  unique (id, firm_id),
  constraint fk_coding_tasks_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_coding_tasks_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_coding_tasks_filing foreign key (filing_id, firm_id, client_id, document_id)
    references clara.document_filings(id, firm_id, client_id, document_id),
  constraint fk_coding_tasks_correction foreign key (correction_id, firm_id)
    references clara.filing_corrections(id, firm_id),
  constraint fk_coding_tasks_result_entry foreign key (result_entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint ck_coding_tasks_origin check (
    (origin = 'correction' and correction_id is not null)
    or (origin = 'manual' and correction_id is null)
  ),
  constraint ck_coding_tasks_terminal check (
    (status = 'open' and closed_by is null and closed_at is null
      and closed_reason is null and result_entry_id is null)
    or (status = 'done' and closed_by is not null and closed_at is not null
      and closed_reason is null and result_entry_id is not null)
    or (status = 'dismissed' and closed_by is not null and closed_at is not null
      and closed_reason is not null and btrim(closed_reason) <> ''
      and result_entry_id is null)
  )
);
create unique index uq_coding_tasks_correction
  on clara.coding_tasks(correction_id) where correction_id is not null;
create index ix_coding_tasks_firm_status
  on clara.coding_tasks(firm_id, status, created_at);

create table clara.coding_attempts (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid        not null,
  client_id    uuid        not null,
  task_id      uuid        not null,
  filing_id    uuid        not null,
  document_id  uuid        not null,
  entry_id     uuid        not null,
  part_payload jsonb       not null check (jsonb_typeof(part_payload) = 'object'),
  created_at   timestamptz not null default now(),
  unique (id, firm_id),
  -- W4 (F5, one-coding-per-TASK): a task admits exactly ONE coding attempt (the v2
  -- segment stops after the first successful draft), so recovery via the scalar
  -- get_coding_attempt(task_id) is sound. This DEVIATES from companion §10's pinned
  -- (task_id, filing_id) pair -- adjudicated in INTERFACE-PINS §6.6 W4 (C-12 scalar
  -- recovery + S6-R11 one-doc-one-card). unique(entry_id) is retained.
  constraint uq_coding_attempts_task unique (task_id),
  constraint uq_coding_attempts_entry unique (entry_id),
  constraint fk_coding_attempts_task foreign key (task_id, firm_id, client_id)
    references clara.agent_tasks(id, firm_id, client_id),
  constraint fk_coding_attempts_filing foreign key (filing_id, firm_id, client_id, document_id)
    references clara.document_filings(id, firm_id, client_id, document_id),
  constraint fk_coding_attempts_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_coding_attempts_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id)
);

create table clara.processing_call_reservations (
  id               uuid primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  task_id          uuid        not null,
  state            text        not null default 'reserved'
                              check (state in ('reserved','settled','refunded')),
  pages_reserved   int         not null check (pages_reserved >= 0),
  settled_pages    int         check (settled_pages is null or settled_pages >= 0),
  refund_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  settled_at       timestamptz,
  refunded_at      timestamptz,
  unique (id, firm_id),
  unique (task_id),
  constraint fk_processing_call_reservation_task foreign key (task_id, firm_id)
    references clara.document_processing_tasks(id, firm_id),
  constraint ck_processing_call_reservation_terminal check (
    (state = 'reserved' and settled_at is null and refunded_at is null
      and settled_pages is null and refund_reason is null)
    or (state = 'settled' and settled_at is not null and refunded_at is null
      and settled_pages is not null and refund_reason is null)
    or (state = 'refunded' and refunded_at is not null and settled_at is null
      and refund_reason is not null and btrim(refund_reason) <> '')
  )
);
create index ix_processing_call_reservations_daily
  on clara.processing_call_reservations(firm_id, created_at, state);

-- Deploy-onto-existing safety: fail with a specific diagnostic before attempting
-- the immediate partial unique index.
do $$
declare v_filing uuid; v_count int;
begin
  select filing_id, count(*)::int into v_filing, v_count
  from clara.journal_entries
  where status = 'draft' and filing_id is not null
  group by filing_id having count(*) > 1
  order by filing_id limit 1;
  if v_filing is not null then
    raise exception '0009 pre-flight: filing % already has % open drafts', v_filing, v_count
      using errcode = 'CLR21', detail = '{"reason":"double_coded"}';
  end if;
end $$;
create unique index uq_journal_entries_one_open_draft_filing
  on clara.journal_entries(filing_id)
  where status = 'draft' and filing_id is not null;

create unique index uq_document_processing_one_live_lane
  on clara.document_processing_tasks(document_id, lane)
  where status in ('queued','held_egress','running');

-- =====================================================================
-- 2. STATE-MACHINE TRIGGERS, RLS, MASKED SURFACE
-- =====================================================================

create function clara._tf_coding_task_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'coding tasks are historical' using errcode = 'CLR08';
  end if;
  if old.status <> 'open' or new.status not in ('done','dismissed') then
    raise exception 'illegal coding-task transition % -> %', old.status, new.status
      using errcode = 'CLR24';
  end if;
  if (to_jsonb(new) - array['status','closed_by','closed_reason','result_entry_id',
                            'closed_at','updated_at'])
     is distinct from
     (to_jsonb(old) - array['status','closed_by','closed_reason','result_entry_id',
                            'closed_at','updated_at']) then
    raise exception 'coding-task identity is immutable' using errcode = 'CLR08';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_coding_tasks_update before update or delete on clara.coding_tasks
  for each row execute function clara._tf_coding_task_update();

create function clara._tf_processing_call_reservation_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'processing-call reservations are historical' using errcode = 'CLR08';
  end if;
  if old.state <> 'reserved' or new.state not in ('settled','refunded') then
    raise exception 'illegal processing-call reservation transition' using errcode = 'CLR18';
  end if;
  if new.id <> old.id or new.firm_id <> old.firm_id or new.task_id <> old.task_id
     or new.pages_reserved <> old.pages_reserved or new.created_at <> old.created_at then
    raise exception 'processing-call reservation identity is immutable' using errcode = 'CLR08';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_processing_call_reservations_update
  before update or delete on clara.processing_call_reservations
  for each row execute function clara._tf_processing_call_reservation_update();

create trigger t_counterparties_no_truncate before truncate on clara.counterparties
  for each statement execute function clara._tf_no_truncate();
create trigger t_coding_tasks_no_truncate before truncate on clara.coding_tasks
  for each statement execute function clara._tf_no_truncate();
create trigger t_entry_evidence_no_truncate before truncate on clara.entry_evidence
  for each statement execute function clara._tf_no_truncate();
create trigger t_coding_attempts_append_only before update or delete on clara.coding_attempts
  for each row execute function clara._tf_append_only();
create trigger t_coding_attempts_no_truncate before truncate on clara.coding_attempts
  for each statement execute function clara._tf_no_truncate();
create trigger t_processing_call_reservations_no_truncate
  before truncate on clara.processing_call_reservations
  for each statement execute function clara._tf_no_truncate();

do $$
declare t text;
begin
  foreach t in array array[
    'counterparties','coding_tasks','entry_evidence','coding_attempts',
    'processing_call_reservations'
  ] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format(
      'create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)',
      t, t);
  end loop;
end $$;

create policy p_counterparties_human on clara.counterparties for select
  to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_counterparties_agent on clara.counterparties for select
  to clara_agent_ro using (firm_id = clara.wake_firm());
create policy p_coding_tasks_human on clara.coding_tasks for select
  to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_entry_evidence_human on clara.entry_evidence for select
  to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_entry_evidence_agent on clara.entry_evidence for select
  to clara_agent_ro using (firm_id = clara.wake_firm());
-- W7 (F7): no runtime-tree reader of processing_call_reservations exists (the
-- reconciler reads document_processing_tasks, never this metering table), so the
-- clara_runtime SELECT grant + its unrestricted policy are dropped -- companion §9
-- is the law and grants runtime only the three invoice-facts functions. The table
-- stays owner/definer-only; _reserve/_settle/_refund run security-definer.

create view clara.coding_tasks_visible as
  select id, client_id, document_id, filing_id, origin, correction_id, status,
    opened_by, closed_by, closed_reason, result_entry_id,
    created_at, updated_at, closed_at
  from clara.coding_tasks
  where firm_id = clara.jwt_firm();

-- =====================================================================
-- 3. ACTIVE TAXONOMY V2: COUPLED ADDITIVE PAIRS, NO REPOINT
-- =====================================================================

with added(name, client_scoped, description, decision, note) as (values
  ('counterparty.created', true, 'A client counterparty was created',
    'context_update', null::text),
  ('entry.revised', true, 'A journal-entry draft was revised',
    'context_update', null::text),
  ('entry.withdrawn', true, 'A journal-entry draft was withdrawn',
    'context_update', null::text),
  ('coding_task.opened', true, 'A durable coding task was opened',
    'context_update', null::text),
  ('coding_task.closed', true, 'A durable coding task was completed or dismissed',
    'context_update', null::text),
  ('document.invoice_facts_completed', true, 'Invoice facts completed',
    'ignore', 'facts workflow is the registered consumer; no router wake'),
  ('document.invoice_facts_failed', true, 'Invoice facts failed honestly',
    'ignore', 'Tier B remains available; no router wake')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

do $$
declare v_active int; v_missing int; v_extra int;
begin
  select version into v_active from clara.taxonomy_active where singleton;
  if v_active <> 2 then
    raise exception '0009 expected active taxonomy v2, found %', v_active using errcode = 'CLR10';
  end if;
  select count(*)::int into v_missing
  from clara.event_types e
  where not exists (
    select 1 from clara.trigger_taxonomy t
    where t.version = v_active and t.event_type = e.name
  );
  select count(*)::int into v_extra
  from clara.trigger_taxonomy t
  where t.version = v_active and not exists (
    select 1 from clara.event_types e where e.name = t.event_type
  );
  if v_missing <> 0 or v_extra <> 0 then
    raise exception 'active taxonomy coverage is not whole (missing %, extra %)',
      v_missing, v_extra using errcode = 'CLR10';
  end if;
end $$;

-- =====================================================================
-- 5. ARITY-CHANGED WRITERS (C-1: DROP -> CREATE -> REVOKE -> RE-GRANT)
-- =====================================================================

drop function clara.wake_draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint);
drop function clara.draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text);
drop function clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,
  jsonb,uuid,text,jsonb,text,bigint);
drop function clara.upsert_account(uuid,text,text,text,text,text);

create function clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid,
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
  -- Evidence is HARD-REQUIRED only on the coding flow (D-L2-2 ruling): a SQL-null
  -- p_evidence on a plain doc-bound draft keeps its shipped 0005/0007 lawfulness.
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
        and t.client_id=p_client and t.kind='chat_turn'
        and t.status in ('queued','running','awaiting_input')
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
    -- W5: an explicit non-MYR currency in a SUBMITTED evidence row is terminal at
    -- either tier -- checked against the raw submission BEFORE recoverability.
    if clara._evidence_cites_non_myr(p_evidence) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if p_evidence is not null then
      perform clara._write_entry_evidence(v_entry,p_document,p_evidence);
    end if;
    v_state := clara._invoice_fact_state(p_document);
    -- Tier-A facts that themselves say non-MYR are equally terminal.
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'explicit non-MYR currency is unsupported'
        using errcode='CLR21',detail='{"reason":"currency_unsupported"}';
    end if;
    if p_coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      -- The corroborated machine total must be evidence-bound (verified tier) in
      -- every corroborated case -- exception or not (FIX-S-2 helper).
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
      -- W1: a machine/proposed mismatch does NOT raise -- it persists a reviewable
      -- amount exception. approve_entry gates on it (CLR21 amount_conflict) unless
      -- revise stamps a governed override.
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
            'exception',(v_exception is not null)));
    exception when unique_violation then
      raise exception 'coding task or filing was already coded'
        using errcode='CLR21',detail='{"reason":"double_coded"}';
    end;
  end if;

  perform clara._audit(p_firm,p_actor,p_obo,p_wake_kind,'draft_entry',v_entry,
    jsonb_build_object('client',p_client,'filing',v_filing,'task',v_task,'op_key',p_op_key));
  v_seq := clara._append_event(p_firm,'entry.drafted',p_client,p_actor,p_obo,p_wake_kind,
    v_entry,p_document,p_resolution,'{}'::jsonb);
  if not p_is_human then
    perform clara.assert_books_current(p_firm,p_client,p_books_version,v_seq);
  end if;
  v_receipt := jsonb_build_object('entry_id',v_entry,'revision_token',v_token,
    'status','draft','filing_id',v_filing,'exception',(v_exception is not null),
    'provenance_tier',v_tier);
  return clara._finish_op(p_firm,'draft_entry',p_op_key,v_receipt);
end $$;
revoke all on function clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,
  date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text) from public;

create function clara.draft_entry(p_client uuid, p_resolution uuid,
    p_posting_date date, p_memo text, p_lines jsonb,
    p_document uuid default null, p_sha256 text default null,
    p_flags jsonb default '{}', p_op_key text default null,
    p_proposed_counterparty jsonb default null, p_evidence jsonb default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._draft_entry_core(c.actor,c.firm,null,null,true,p_client,p_resolution,
    p_posting_date,p_memo,p_lines,p_document,p_sha256,p_flags,p_op_key,null,
    p_proposed_counterparty,p_evidence,null,null);
end $$;
revoke all on function clara.draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,
  text,jsonb,jsonb) from public;
grant execute on function clara.draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,
  text,jsonb,jsonb) to clara_authenticated;

create function clara.wake_draft_entry(p_client uuid, p_resolution uuid,
    p_posting_date date, p_memo text, p_lines jsonb,
    p_document uuid default null, p_sha256 text default null,
    p_flags jsonb default '{}', p_op_key text default null,
    p_books_version bigint default null,
    p_proposed_counterparty jsonb default null, p_evidence jsonb default null,
    p_coding jsonb default null, p_coding_kind text default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode='CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind,'wake_draft_entry');
  if p_books_version is null then
    raise exception 'wake_draft_entry requires a books_version token' using errcode='CLR10';
  end if;
  return clara._draft_entry_core(clara.agent_user_id(),w.firm_id,w.on_behalf_of,
    w.wake_kind,false,p_client,p_resolution,p_posting_date,p_memo,p_lines,p_document,
    p_sha256,p_flags,p_op_key,p_books_version,p_proposed_counterparty,p_evidence,
    p_coding,p_coding_kind);
end $$;
revoke all on function clara.wake_draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,
  text,bigint,jsonb,jsonb,jsonb,text) from public;
grant execute on function clara.wake_draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,
  text,bigint,jsonb,jsonb,jsonb,text) to clara_wake_interactive;

create function clara.upsert_account(p_client uuid, p_code text, p_name text,
    p_type text, p_special_acc_type text default null, p_op_key text default null,
    p_account_class text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_client_firm uuid; v_existing record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'upsert_account',p_op_key,
    clara._hash(jsonb_build_object('c',p_client,'code',p_code,'n',p_name,'t',p_type,
      's',p_special_acc_type,'account_class',p_account_class)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_client_firm from clara.clients where id=p_client;
  if v_client_firm is null or v_client_firm<>c.firm then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  select * into v_existing from clara.coa_accounts
    where client_id=p_client and account_code=p_code;
  if found and (v_existing.account_type<>p_type
      or v_existing.account_class is distinct from p_account_class)
     and exists(select 1 from clara.journal_lines
                where client_id=p_client and account_code=p_code) then
    raise exception 'cannot change type/class of an account that has lines' using errcode='CLR10';
  end if;
  begin
    insert into clara.coa_accounts(client_id,account_code,name,account_type,
        special_acc_type,account_class)
      values(p_client,p_code,p_name,p_type,p_special_acc_type,p_account_class)
      on conflict(client_id,account_code) do update set name=excluded.name,
        account_type=excluded.account_type,special_acc_type=excluded.special_acc_type,
        account_class=excluded.account_class,is_active=true;
  exception when unique_violation then
    raise exception 'a rounding account already exists for this client' using errcode='CLR10';
  end;
  perform clara._audit(c.firm,c.actor,null,null,'upsert_account',null,
    jsonb_build_object('client',p_client,'code',p_code));
  perform clara._append_event(c.firm,'account.upserted',p_client,c.actor,null,null,
    null,null,null,'{}'::jsonb);
  return clara._finish_op(c.firm,'upsert_account',p_op_key,
    jsonb_build_object('client_id',p_client,'account_code',p_code));
end $$;
revoke all on function clara.upsert_account(uuid,text,text,text,text,text,text) from public;
grant execute on function clara.upsert_account(uuid,text,text,text,text,text,text)
  to clara_authenticated;

-- =====================================================================
-- 6. APPROVAL, REVERSAL, AND DRAFT-LIFECYCLE WRITERS
-- =====================================================================

-- W1/FIX-SP-5: a stamped governed amount_override raises the entry to high-stakes
-- so the distinct-checker law (CLR05) binds on the approval that clears it.
create or replace function clara.is_high_stakes(p_entry uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select je.is_opening_balance or je.is_year_end or je.tax_affecting
      or (je.flags ? 'amount_override')
      or coalesce((select sum(debit_cents) from clara.journal_lines where entry_id = je.id), 0)
         >= f.high_stakes_amount_cents
  from clara.journal_entries je join clara.firms f on f.id = je.firm_id
  where je.id = p_entry;
$$;

create or replace function clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; e record; v_dedupe jsonb; v_attest text; v_filing uuid;
  v_fingerprint jsonb; v_counterparty uuid; v_created boolean:=false;
  v_name text; v_reg text; v_tin text; v_name_n text; v_reg_n text;
  v_state jsonb; v_payable bigint; v_expense bigint; v_invoice_id text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_entry',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'rev',p_expected_revision,
      'att',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Unlocked identity read, then the active filing is the first row lock.
  select * into e from clara.journal_entries where id=p_entry;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
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

  -- Originals precede the unique approved-reversal slot in every path.
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
        -- Re-run once after the winning insert becomes visible. Full fingerprint
        -- congruence deliberately refuses birth->existing re-binding.
        v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
        if v_fingerprint is distinct from e.match_fingerprint then
          raise exception 'counterparty birth raced with a changed match landscape'
            using errcode='CLR23';
        end if;
        raise exception 'counterparty identity could not be resolved after birth race'
          using errcode='CLR23';
      end;
    else
      v_counterparty:=(v_fingerprint->>'counterparty_id')::uuid;
    end if;
    update clara.journal_lines l set counterparty_id=v_counterparty
    from clara.coa_accounts a
    where l.entry_id=p_entry and a.client_id=l.client_id
      and a.account_code=l.account_code and a.account_class='payable';
  end if;

  -- Re-read facts while the active filing FOR SHARE lock is still held. A facts
  -- writer that won first is therefore visible; one that lost cannot pass us.
  if e.document_id is not null then
    v_state:=clara._invoice_fact_state(e.document_id);
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'newer facts identify an unsupported currency' using errcode='CLR25';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      -- CLR25 FIRST (stale-evidence semantics unchanged): the verified invoice.total
      -- evidence must still bind the CURRENT facts. A newer/contradicting facts
      -- version rotated the token; if it was re-fetched but not re-cited, the bound
      -- fact_hash no longer matches -> stale evidence. This precedes the amount gate
      -- so a genuine facts contradiction always surfaces as CLR25, never CLR21.
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'newer machine facts contradict the draft evidence'
          using errcode='CLR25';
      end if;
      -- W1: evidence is fresh; a persisted amount exception gates approval (CLR21
      -- amount_conflict) unless revise stamped a governed override.
      if (e.flags ? 'amount_exception') and not (e.flags ? 'amount_override') then
        raise exception 'proposed total conflicts with the machine-corroborated total'
          using errcode='CLR21',detail='{"reason":"amount_conflict"}';
      end if;
    end if;
    -- W2: an exact (client, resolved vendor, facts invoice_id) duplicate of another
    -- approved-unreversed supplier bill refuses (CLR21 duplicate_bill) unless a
    -- governed duplicate override was stamped. invoice_id needs no corroboration.
    if e.coding_kind='supplier_bill' and e.reversal_of is null
       and v_counterparty is not null then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      if v_invoice_id is not null and not (e.flags ? 'duplicate_override')
         and exists (
           select 1 from clara.journal_entries e2
           where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
             and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
             and e2.document_id is not null
             and exists (select 1 from clara.journal_lines l2
                         where l2.entry_id=e2.id and l2.counterparty_id=v_counterparty)
             and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id
         ) then
        raise exception 'an approved bill already exists for this vendor and invoice number'
          using errcode='CLR21',detail='{"reason":"duplicate_bill"}';
      end if;
    end if;
  end if;
  perform clara._assert_supplier_bill_shape(p_entry);

  if clara.is_high_stakes(p_entry) and e.last_human_editor is not null
     and e.last_human_editor=c.actor then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'high-stakes entry needs a distinct checker' using errcode='CLR05';
    elsif p_attestation is null or btrim(p_attestation)='' then
      raise exception 'solo high-stakes approval requires an attestation' using errcode='CLR05';
    else v_attest:=p_attestation; end if;
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

create or replace function clara.reverse_entry(p_entry uuid, p_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; o record; v_mirror uuid; v_status text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'reverse_entry',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into o from clara.journal_entries where id=p_entry for update;
  if not found or o.firm_id<>c.firm then raise exception 'entry not in your firm' using errcode='CLR11'; end if;
  if o.status<>'approved' then raise exception 'only an approved entry can be reversed' using errcode='CLR10'; end if;
  if o.reversal_of is not null then raise exception 'cannot reverse a reversal' using errcode='CLR10'; end if;
  if o.reversed_by is not null then raise exception 'entry already reversed' using errcode='CLR10'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'a reversal reason is required' using errcode='CLR10'; end if;
  insert into clara.journal_entries(client_id,status,posting_date,memo,origin,resolution_id,
      is_opening_balance,is_year_end,tax_affecting,maker_actor,last_human_editor,
      reversal_of,reversal_reason)
    values(o.client_id,'draft',current_date,'Reversal: '||p_reason,'reversal',o.resolution_id,
      o.is_opening_balance,o.is_year_end,o.tax_affecting,c.actor,c.actor,p_entry,p_reason)
    returning id into v_mirror;
  insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
      credit_cents,description,counterparty_id)
    select v_mirror,line_no,account_code,credit_cents,debit_cents,description,counterparty_id
    from clara.journal_lines where entry_id=p_entry order by line_no;
  perform clara._assert_balanced(v_mirror);
  if clara.is_high_stakes(v_mirror) then
    v_status:='draft';
  else
    perform clara._assert_supplier_bill_shape(v_mirror);
    update clara.journal_entries set status='approved',checker_actor=c.actor,
      approved_at=now(),updated_at=now() where id=v_mirror;
    update clara.journal_entries set reversed_by=v_mirror,reversal_reason=p_reason,
      updated_at=now() where id=p_entry;
    v_status:='approved';
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'reverse_entry',v_mirror,
    jsonb_build_object('original',p_entry,'op_key',p_op_key));
  perform clara._append_event(c.firm,'entry.drafted',o.client_id,c.actor,null,null,
    v_mirror,null,null,'{}'::jsonb);
  if v_status='approved' then
    perform clara._append_event(c.firm,'entry.approved',o.client_id,c.actor,null,null,
      v_mirror,null,null,'{}'::jsonb);
    perform clara._append_event(c.firm,'entry.reversed',o.client_id,c.actor,null,null,
      p_entry,null,null,'{}'::jsonb);
  end if;
  return clara._finish_op(c.firm,'reverse_entry',p_op_key,
    jsonb_build_object('reversal_id',v_mirror,'status',v_status));
end $$;

create function clara.revise_entry(p_entry uuid, p_lines jsonb,
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
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  -- W1/W2: the governed overrides join the request hash (C-1 law).
  v_dedupe:=clara._reserve_op(c.firm,'revise_entry',p_op_key,
    clara._hash(jsonb_build_object('entry',p_entry,'lines',p_lines,
      'counterparty',p_proposed_counterparty,'evidence',p_evidence,
      'revision',p_expected_revision,'amount_override',p_amount_override,
      'duplicate_override',p_duplicate_override)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into e from clara.journal_entries where id=p_entry for update;
  if not found or e.firm_id<>c.firm then raise exception 'entry not in your firm' using errcode='CLR11'; end if;
  if e.status<>'draft' then raise exception 'only a draft can be revised' using errcode='CLR22'; end if;
  if e.revision_token is distinct from p_expected_revision then raise exception 'stale revision token' using errcode='CLR06'; end if;
  if e.coding_kind='supplier_bill' and p_proposed_counterparty is null then
    raise exception 'supplier bill requires a vendor proposal'
      using errcode='CLR21',detail='{"reason":"vendor_malformed"}';
  end if;
  -- D-L2-2 ruling: the coding flow keeps its evidence on revise too; plain doc
  -- drafts may revise evidence-less (SQL-null p_evidence leaves prior rows).
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
  -- W1/W2: recompute amount flags fresh each revise; preserve any duplicate_override.
  v_new_flags:=coalesce(e.flags,'{}'::jsonb) - 'amount_exception' - 'amount_override';
  if e.document_id is not null then
    -- W5: explicit non-MYR in a SUBMITTED evidence row is terminal at either tier.
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
      -- W1: a mismatch persists a reviewable exception (never raises here). A
      -- CONFORMING revised total leaves both flags cleared (stripped above).
      if v_payable<>(v_state->>'total_cents')::bigint
         or v_expense<>(v_state->>'total_cents')::bigint then
        v_exception:=jsonb_build_object(
          'machine_total_cents',(v_state->>'total_cents')::bigint,
          'proposed_cents',v_payable,
          'fact_hash',v_state->>'total_fact_hash','at',now());
        v_new_flags:=v_new_flags||jsonb_build_object('amount_exception',v_exception);
        -- The governed amount override: a reason + a region cited in the revised
        -- evidence that belongs to this document. Only meaningful on a mismatch.
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
  -- W2: the governed duplicate-bill override (reason-coded). Preserved across
  -- ordinary revises; re-stamped when re-provided.
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
  perform clara._audit(c.firm,c.actor,null,null,'revise_entry',p_entry,
    jsonb_build_object('op_key',p_op_key));
  perform clara._append_event(c.firm,'entry.revised',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  return clara._finish_op(c.firm,'revise_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'revision_token',v_token,'status','draft'));
end $$;

create function clara.withdraw_draft(p_entry uuid, p_reason text,
    p_expected_revision uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; e record; v_dedupe jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'withdraw_draft',p_op_key,
    clara._hash(jsonb_build_object('entry',p_entry,'reason',p_reason,
      'revision',p_expected_revision)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into e from clara.journal_entries where id=p_entry for update;
  if not found or e.firm_id<>c.firm then raise exception 'entry not in your firm' using errcode='CLR11'; end if;
  if e.status<>'draft' then raise exception 'only a draft can be withdrawn' using errcode='CLR22'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'withdrawal reason is required' using errcode='CLR22'; end if;
  if e.revision_token is distinct from p_expected_revision then raise exception 'stale revision token' using errcode='CLR06'; end if;
  update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
    withdrawn_at=now(),withdrawal_reason=p_reason,proposed_counterparty=null,
    match_fingerprint=null,updated_at=now() where id=p_entry;
  perform clara._audit(c.firm,c.actor,null,null,'withdraw_draft',p_entry,
    jsonb_build_object('reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'entry.withdrawn',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  return clara._finish_op(c.firm,'withdraw_draft',p_op_key,
    jsonb_build_object('entry_id',p_entry,'status','withdrawn'));
end $$;

-- =====================================================================
-- 7. DURABLE CODING-TASK WRITERS
-- =====================================================================

create function clara.open_coding_task(p_client uuid, p_document uuid, p_filing uuid,
    p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'coding-task reason is required' using errcode='CLR24'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'open_coding_task',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'document',p_document,
      'filing',p_filing,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.document_filings where id=p_filing
      and firm_id=c.firm and client_id=p_client and document_id=p_document
      and retired_at is null) then
    raise exception 'active coding-task filing not found' using errcode='CLR24';
  end if;
  insert into clara.coding_tasks(firm_id,client_id,document_id,filing_id,origin,
      opened_by)
    values(c.firm,p_client,p_document,p_filing,'manual',c.actor) returning id into v_id;
  perform clara._audit(c.firm,c.actor,null,null,'open_coding_task',null,
    jsonb_build_object('coding_task',v_id,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'coding_task.opened',p_client,c.actor,null,null,
    null,p_document,null,jsonb_build_object('coding_task_id',v_id,'filing_id',p_filing));
  return clara._finish_op(c.firm,'open_coding_task',p_op_key,
    jsonb_build_object('coding_task_id',v_id,'status','open'));
end $$;

create function clara.complete_coding_task(p_task uuid, p_result_entry uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; t record; v_dedupe jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'complete_coding_task',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'entry',p_result_entry)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into t from clara.coding_tasks where id=p_task for update;
  if not found or t.firm_id<>c.firm then raise exception 'coding task not found' using errcode='CLR24'; end if;
  if t.status<>'open' then raise exception 'coding task is not open' using errcode='CLR24'; end if;
  if not exists(select 1 from clara.document_filings f where f.id=t.filing_id
      and f.firm_id=t.firm_id and f.client_id=t.client_id
      and f.document_id=t.document_id and f.retired_at is null)
     or not exists(select 1 from clara.journal_entries e where e.id=p_result_entry
      and e.firm_id=t.firm_id and e.client_id=t.client_id and e.filing_id=t.filing_id
      and e.status='approved' and e.reversed_by is null) then
    raise exception 'coding-task result is not an active approved entry' using errcode='CLR24';
  end if;
  update clara.coding_tasks set status='done',closed_by=c.actor,closed_at=now(),
    result_entry_id=p_result_entry where id=p_task;
  perform clara._audit(c.firm,c.actor,null,null,'complete_coding_task',p_result_entry,
    jsonb_build_object('coding_task',p_task,'op_key',p_op_key));
  perform clara._append_event(c.firm,'coding_task.closed',t.client_id,c.actor,null,null,
    p_result_entry,t.document_id,null,
    jsonb_build_object('coding_task_id',p_task,'status','done'));
  return clara._finish_op(c.firm,'complete_coding_task',p_op_key,
    jsonb_build_object('coding_task_id',p_task,'status','done','result_entry_id',p_result_entry));
end $$;

create function clara.dismiss_coding_task(p_task uuid, p_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; t record; v_dedupe jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_reason is null or btrim(p_reason)='' then raise exception 'dismissal reason is required' using errcode='CLR24'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'dismiss_coding_task',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into t from clara.coding_tasks where id=p_task for update;
  if not found or t.firm_id<>c.firm then raise exception 'coding task not found' using errcode='CLR24'; end if;
  if t.status<>'open' then raise exception 'coding task is not open' using errcode='CLR24'; end if;
  update clara.coding_tasks set status='dismissed',closed_by=c.actor,closed_at=now(),
    closed_reason=p_reason where id=p_task;
  perform clara._audit(c.firm,c.actor,null,null,'dismiss_coding_task',null,
    jsonb_build_object('coding_task',p_task,'reason',p_reason,'op_key',p_op_key));
  perform clara._append_event(c.firm,'coding_task.closed',t.client_id,c.actor,null,null,
    null,t.document_id,null,
    jsonb_build_object('coding_task_id',p_task,'status','dismissed'));
  return clara._finish_op(c.firm,'dismiss_coding_task',p_op_key,
    jsonb_build_object('coding_task_id',p_task,'status','dismissed'));
end $$;

-- =====================================================================
-- 8. INVOICE-FACTS TERMINAL WRITERS + DUAL-LANE CLAIM/RELEASE
-- =====================================================================

create function clara.persist_invoice_facts(p_task uuid, p_fields jsonb,
    p_raw_sha256 text, p_normalization_version text, p_pages_used int,
    p_envelope jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_ext uuid; v_existing uuid; v_entry uuid; v_date date;
  elem jsonb; v_path text; v_raw text; v_page int; v_conf numeric;
  v_cents bigint; v_region uuid;
  v_newstate jsonb; v_p_payable bigint; v_p_expense bigint;
  v_eflags jsonb; v_ekind text;
begin
  -- Identity is read without a row lock so filing UUID order remains first.
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
      -- W3 (ratified): the runtime's p_envelope (e.g. {corroboration_ineligible:
      -- 'multi_document'|'credit_note'}) is merged in; the DB-authoritative keys are
      -- applied LAST so the runtime can never spoof the raw hash / normalization /
      -- field_count. _invoice_fact_state reads envelope->>'corroboration_ineligible'.
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

  -- Explicit one-row updates preserve the entry-id order established above.
  -- W1: newer facts force re-review by rotating the token AND, for supplier-bill
  -- drafts, VOID any amount override + RECOMPUTE the amount exception against the
  -- new facts (a preserved duplicate_override is untouched). Stale evidence still
  -- surfaces as CLR25 at approve (corroboration_bound), regardless of this flag.
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
      where id=v_entry and status='draft';
  end loop;
  perform clara._audit(t.firm_id,null,null,null,'persist_invoice_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,
      'version',t.version_n,'pages',p_pages_used));
  perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_ext,'version_n',t.version_n));
  return jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status','done');
end $$;

create function clara.fail_invoice_facts(p_task uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_code text;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found or t.lane<>'invoice_facts' then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  if t.status='failed' then
    return jsonb_build_object('task_id',p_task,'status','failed',
      'reason',coalesce(t.error_code,p_reason),'replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'invoice-facts task is not running' using errcode='CLR16';
  end if;
  v_code:=case when p_reason in ('engine_error','timeout','engine_lost','storage_error',
      'corrupt','encrypted','bad_type','limit','budget','attempt_cap','internal')
    then p_reason else 'engine_error' end;
  update clara.document_processing_tasks set status='failed',error_code=v_code,
    finished_at=now() where id=p_task;
  perform clara._refund_processing_call(p_task,coalesce(nullif(btrim(p_reason),''),v_code));
  perform clara._audit(t.firm_id,null,null,null,'fail_invoice_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'reason',v_code));
  perform clara._append_event(t.firm_id,'document.invoice_facts_failed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason',v_code));
  return jsonb_build_object('task_id',p_task,'status','failed','reason',v_code);
end $$;

create or replace function clara.claim_document_processing_task(p_task uuid,
    p_workflow_run_id text, p_egress_approved boolean) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; d record; v_cap int; v_running int; v_attempts int;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'workflow_run_id is required' using errcode='CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  -- PIN-AB-6: claimed work carries its document metadata in the receipt (definer
  -- read — the runtime holds no SELECT on clara.documents and must not gain one).
  select storage_path,sha256,mime_type,byte_size into d
    from clara.documents where id=t.document_id;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
      'storage_path',d.storage_path,'sha256',d.sha256,
      'mime_type',d.mime_type,'byte_size',d.byte_size);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  if t.lane in ('ocr','invoice_facts') and not coalesce(p_egress_approved,false) then
    update clara.document_processing_tasks set status='held_egress' where id=p_task;
    if t.lane='ocr' then
      update clara.documents set extraction_status='held_egress' where id=t.document_id;
    end if;
    return jsonb_build_object('task_id',p_task,'status','held_egress','workflow_run_id',null);
  end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  if t.lane='invoice_facts' then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks
      where document_id=t.document_id and lane='invoice_facts';
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
  if t.lane='ocr' then
    update clara.documents set extraction_status='running' where id=t.document_id;
  end if;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,
    'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
    'storage_path',d.storage_path,'sha256',d.sha256,
    'mime_type',d.mime_type,'byte_size',d.byte_size);
end $$;

create or replace function clara.release_held_document_tasks(p_limit int default 1000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_ids uuid[];
begin
  with picked as (
    select id from clara.document_processing_tasks
    where status='held_egress' and lane in ('ocr','invoice_facts')
    order by created_at,id for update skip locked
    limit greatest(1,least(p_limit,10000))
  ), moved as (
    update clara.document_processing_tasks t set status='queued'
    from picked p where t.id=p.id returning t.id
  )
  select count(*)::int,array_agg(id) into v_n,v_ids from moved;
  if v_ids is not null then
    update clara.documents d set extraction_status='pending'
      where d.id in (select t.document_id from clara.document_processing_tasks t
        where t.id=any(v_ids) and t.lane='ocr');
  end if;
  return jsonb_build_object('released',coalesce(v_n,0));
end $$;

-- Status honesty requires the existing stranded-run writer to avoid changing the
-- primary layout status for an invoice-facts task.
create or replace function clara.requeue_stranded_document_task(p_task uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_dedupe jsonb;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'task is not stranded-running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'requeue_stranded_document_task',p_op_key,
    clara._hash(jsonb_build_object('task',p_task)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'task is not stranded-running' using errcode='CLR16'; end if;
  update clara.document_processing_tasks set status='queued',workflow_run_id=null,
    started_at=null,vendor_op_ref=null where id=p_task;
  if t.lane='ocr' then
    update clara.documents set extraction_status='pending' where id=t.document_id;
  end if;
  return clara._finish_op(t.firm_id,'requeue_stranded_document_task',p_op_key,
    jsonb_build_object('task_id',p_task,'status','queued'));
end $$;

-- =====================================================================
-- 9. FILING ENQUEUE SITES + WRONG-CLIENT CORRECTION TASK INSERTION
-- =====================================================================

create or replace function clara.file_document(p_document uuid, p_client uuid,
    p_resolution text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_doc_firm uuid; v_id uuid; v_basis text;
  v_resolution uuid; v_input_resolution uuid; v_created boolean:=false;
  v_resolution_created boolean:=false; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'file_document',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'client',p_client,
      'resolution',p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_doc_firm from clara.documents where id=p_document for update;
  if v_doc_firm is null or v_doc_firm<>c.firm then raise exception 'document not in your firm' using errcode='CLR11'; end if;
  begin v_input_resolution:=nullif(p_resolution,'')::uuid;
  exception when invalid_text_representation then
    raise exception 'client attribution not established' using errcode='CLR01';
  end;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm and status='active') then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  select id into v_id from clara.document_filings
    where document_id=p_document and client_id=p_client and retired_at is null;
  if v_id is not null then raise exception 'document is already actively filed to this client' using errcode='CLR10'; end if;
  select r.id,r.method into v_resolution,v_basis from clara.client_resolutions r
    where r.id=v_input_resolution and r.client_id=p_client and r.firm_id=c.firm
      and r.method in ('human','rule') and r.confidence>=0.95 and r.superseded_at is null
      and r.subject_kind='document' and r.subject_id=p_document;
  if v_resolution is null then
    if v_input_resolution is not null and not exists(select 1 from clara.client_resolutions r
        where r.id=v_input_resolution and r.client_id=p_client and r.firm_id=c.firm
          and r.method in ('human','rule') and r.confidence>=0.95
          and r.superseded_at is null) then
      raise exception 'client attribution not established' using errcode='CLR01';
    end if;
    insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,
        confidence,method,evidence,resolved_by)
      values(c.firm,p_client,'document',p_document,1.0,'human',
        jsonb_build_object('source_resolution_id',v_input_resolution,
          'source','file_document'),c.actor)
      returning id,method into v_resolution,v_basis;
    v_resolution_created:=true;
  end if;
  insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
      resolution_id,basis)
    values(c.firm,p_document,p_client,c.actor,v_resolution,
      case when v_basis='rule' then 'rule' else 'human' end)
    returning id into v_id;
  v_created:=true;
  perform clara._recompute_document_retention(p_document);
  v_facts:=clara._enqueue_invoice_facts_core(p_document);
  perform clara._audit(c.firm,c.actor,null,null,'file_document',null,
    jsonb_build_object('document',p_document,'client',p_client,
      'resolution',v_resolution,'filing',v_id,'facts_task',v_facts->>'task_id',
      'op_key',p_op_key));
  if v_resolution_created then
    perform clara._append_event(c.firm,'client.resolved',p_client,c.actor,null,null,
      null,p_document,v_resolution,'{}'::jsonb);
  end if;
  if v_created then
    perform clara._append_event(c.firm,'document.filed',p_client,c.actor,null,null,
      null,p_document,v_resolution,jsonb_build_object('filing_id',v_id));
  end if;
  if v_facts->>'status'='failed' then
    perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
      null,p_document,null,jsonb_build_object('task_id',v_facts->>'task_id',
        'reason',v_facts->>'reason'));
  end if;
  return clara._finish_op(c.firm,'file_document',p_op_key,
    jsonb_build_object('filing_id',v_id,'document_id',p_document,'client_id',p_client));
end $$;

create or replace function clara.confirm_attribution_candidate(p_candidate uuid,
    p_op_key text, p_file_document boolean default false) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; x record; v_res uuid; v_filing uuid;
  v_filed boolean:=false; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'confirm_attribution_candidate',p_op_key,
    clara._hash(jsonb_build_object('candidate',p_candidate,'file',p_file_document)));
  if v_dedupe is not null then return v_dedupe; end if;
  select ac.*,aa.document_id into x from clara.attribution_candidates ac
    join clara.attribution_attempts aa on aa.id=ac.attempt_id
    where ac.id=p_candidate for update;
  if not found or x.firm_id<>c.firm then raise exception 'candidate not in your firm' using errcode='CLR11'; end if;
  if x.disposition<>'open' then raise exception 'candidate is already disposed' using errcode='CLR20'; end if;
  insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,
      confidence,method,evidence,resolved_by)
    values(c.firm,x.client_id,'document',x.document_id,1.0,'human',
      jsonb_build_object('candidate_id',p_candidate),c.actor) returning id into v_res;
  update clara.attribution_candidates set disposition='confirmed',disposed_by=c.actor,
    disposed_at=now() where id=p_candidate;
  if p_file_document then
    select id into v_filing from clara.document_filings
      where document_id=x.document_id and client_id=x.client_id and retired_at is null;
    if v_filing is null then
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
          resolution_id,basis)
        values(c.firm,x.document_id,x.client_id,c.actor,v_res,'human')
        returning id into v_filing;
      perform clara._recompute_document_retention(x.document_id);
      v_facts:=clara._enqueue_invoice_facts_core(x.document_id);
      v_filed:=true;
    end if;
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'confirm_attribution_candidate',null,
    jsonb_build_object('candidate',p_candidate,'document',x.document_id,
      'client',x.client_id,'resolution',v_res,'filing',v_filing,
      'facts_task',v_facts->>'task_id','op_key',p_op_key));
  perform clara._append_event(c.firm,'client.resolved',x.client_id,c.actor,null,null,
    null,case when v_filed then x.document_id else null end,v_res,'{}'::jsonb);
  if v_filed then
    perform clara._append_event(c.firm,'document.filed',x.client_id,c.actor,null,null,
      null,x.document_id,v_res,jsonb_build_object('filing_id',v_filing));
    if v_facts->>'status'='failed' then
      perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
        null,x.document_id,null,jsonb_build_object('task_id',v_facts->>'task_id',
          'reason',v_facts->>'reason'));
    end if;
  end if;
  return clara._finish_op(c.firm,'confirm_attribution_candidate',p_op_key,
    jsonb_build_object('candidate_id',p_candidate,'resolution_id',v_res,
      'filing_id',v_filing));
end $$;

create or replace function clara.approve_wrong_client_correction(p_correction uuid,
    p_plan_hash text, p_attestation text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; x record; it record; o record; pending record;
  v_current bigint; v_mirror uuid; v_to_filing uuid; v_from_filing uuid;
  v_resolution uuid; v_solo text; v_adopted boolean;
  v_recode_notification uuid; v_coding_task uuid; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  select * into x from clara.filing_corrections where id=p_correction;
  if not found or x.firm_id<>c.firm then raise exception 'correction not in your firm' using errcode='CLR11'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_wrong_client_correction',p_op_key,
    clara._hash(jsonb_build_object('correction',p_correction,'plan_hash',p_plan_hash,
      'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005002,hashtext(c.firm::text));
  select * into x from clara.filing_corrections where id=p_correction for update;
  if x.status<>'proposed' or x.plan_hash<>p_plan_hash then raise exception 'correction plan/state mismatch' using errcode='CLR12'; end if;
  if c.actor=x.maker then
    if clara.eligible_checker_count(c.firm)>=2 then
      raise exception 'correction requires a distinct checker' using errcode='CLR19';
    elsif p_attestation is null or btrim(p_attestation)='' then
      raise exception 'solo correction approval requires attestation' using errcode='CLR19';
    else v_solo:=p_attestation; end if;
  end if;
  select coalesce(max(seq),0) into v_current from clara.domain_events where firm_id=c.firm;
  if v_current<>x.books_version then raise exception 'correction plan is stale (books version moved)' using errcode='CLR19'; end if;

  perform 1 from clara.document_filings f where f.document_id=x.document_id and f.firm_id=c.firm
    order by f.id for update;
  select id into v_from_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.from_client and retired_at is null;
  if v_from_filing is null then raise exception 'source filing is no longer active' using errcode='CLR19'; end if;
  perform 1 from clara.journal_entries je join clara.filing_correction_items i on i.entry_id=je.id
    where i.correction_id=x.id order by je.id for update of je;
  if exists(select 1 from clara.filing_correction_items i
      where i.correction_id=x.id and i.entry_state_hash<>clara._entry_state_hash(i.entry_id)) then
    raise exception 'correction item state changed' using errcode='CLR19';
  end if;
  if exists(select 1 from clara.filing_correction_items i where i.correction_id=x.id
      and clara._correction_period_state(i.entry_id)<>'no_period_model') then
    raise exception 'correction touches a closed period' using errcode='CLR19';
  end if;
  select id into v_resolution from clara.client_resolutions
    where firm_id=c.firm and client_id=x.to_client and subject_kind='document'
      and subject_id=x.document_id and method in ('human','rule') and confidence>=0.95
      and superseded_at is null order by created_at desc limit 1;
  if v_resolution is null then raise exception 'destination client attribution is not authoritative' using errcode='CLR01'; end if;

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    select * into o from clara.journal_entries where id=it.entry_id;
    if it.action='reverse' then
      v_mirror:=null; v_adopted:=false;
      for pending in select * from clara.journal_entries
          where reversal_of=o.id and status='draft' order by id for update loop
        if v_mirror is null
           and clara._entry_state_hash(pending.id)=clara._expected_reversal_state_hash(pending.id,o.id) then
          v_mirror:=pending.id; v_adopted:=true;
        else
          update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
            withdrawn_at=now(),withdrawal_reason='superseded-by-correction',
            proposed_counterparty=null,match_fingerprint=null,updated_at=now()
            where id=pending.id;
        end if;
      end loop;
      if v_mirror is null then
        insert into clara.journal_entries(client_id,status,posting_date,memo,origin,
            resolution_id,is_opening_balance,is_year_end,tax_affecting,maker_actor,
            last_human_editor,reversal_of,reversal_reason)
          values(o.client_id,'draft',current_date,'Correction reversal: '||x.reason,
            'reversal',o.resolution_id,o.is_opening_balance,o.is_year_end,o.tax_affecting,
            c.actor,c.actor,o.id,x.reason) returning id into v_mirror;
        insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,
            credit_cents,description,counterparty_id)
          select v_mirror,line_no,account_code,credit_cents,debit_cents,
            description,counterparty_id
          from clara.journal_lines where entry_id=o.id order by line_no;
      end if;
      perform clara._assert_balanced(v_mirror);
      perform clara._assert_supplier_bill_shape(v_mirror);
      update clara.journal_entries set status='approved',checker_actor=c.actor,
        approved_at=now(),self_approval_attestation=v_solo,updated_at=now()
        where id=v_mirror;
      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;
      update clara.filing_correction_items set reversal_id=v_mirror,outcome='reversed',
        adopted_reversal=v_adopted where id=it.id;
    elsif it.action='withdraw_draft' then
      update clara.journal_entries set status='withdrawn',withdrawn_by=c.actor,
        withdrawn_at=now(),withdrawal_reason=x.reason,proposed_counterparty=null,
        match_fingerprint=null,updated_at=now() where id=o.id;
      update clara.filing_correction_items set outcome='withdrawn' where id=it.id;
    else
      update clara.filing_correction_items set outcome='already_reversed' where id=it.id;
    end if;
  end loop;

  update clara.document_filings set retired_at=now(),retired_by=c.actor,
    retirement_reason=x.reason,correction_id=x.id where id=v_from_filing;
  select id into v_to_filing from clara.document_filings where document_id=x.document_id
    and client_id=x.to_client and retired_at is null;
  if v_to_filing is null then
    insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
        resolution_id,basis,correction_id)
      values(c.firm,x.document_id,x.to_client,c.actor,v_resolution,'correction',x.id)
      returning id into v_to_filing;
  end if;
  perform clara._recompute_document_retention(x.document_id);
  v_facts:=clara._enqueue_invoice_facts_core(x.document_id);
  insert into clara.coding_tasks(firm_id,client_id,document_id,filing_id,origin,
      correction_id,opened_by)
    values(c.firm,x.to_client,x.document_id,v_to_filing,'correction',x.id,c.actor)
    returning id into v_coding_task;
  insert into clara.notifications(firm_id,client_id,kind,payload,created_by)
    values(c.firm,x.to_client,'document_recode_required',jsonb_build_object(
      'correction_id',x.id,'document_id',x.document_id,'to_client',x.to_client,
      'coding_task_id',v_coding_task,'work_kind','recode_document','status','pending',
      'carrier','slice6-coding-floor'),c.actor) returning id into v_recode_notification;
  update clara.filing_corrections set status='completed',checker=c.actor,
    attestation=v_solo,approved_at=now(),completed_at=now() where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'approve_wrong_client_correction',null,
    jsonb_build_object('correction',x.id,'document',x.document_id,
      'from_filing',v_from_filing,'to_filing',v_to_filing,
      'coding_task',v_coding_task,'plan_hash',p_plan_hash,'op_key',p_op_key));

  for it in select * from clara.filing_correction_items where correction_id=x.id order by entry_id loop
    if it.outcome='reversed' then
      if not it.adopted_reversal then
        perform clara._append_event(c.firm,'entry.drafted',x.from_client,c.actor,null,null,
          it.reversal_id,null,null,'{}'::jsonb);
      end if;
      perform clara._append_event(c.firm,'entry.approved',x.from_client,c.actor,null,null,
        it.reversal_id,null,null,'{}'::jsonb);
      perform clara._append_event(c.firm,'entry.reversed',x.from_client,c.actor,null,null,
        it.entry_id,null,null,'{}'::jsonb);
    end if;
  end loop;
  perform clara._append_event(c.firm,'document.filing_retired',x.from_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('filing_id',v_from_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.filed',x.to_client,c.actor,null,null,
    null,x.document_id,v_resolution,jsonb_build_object('filing_id',v_to_filing,
      'correction_id',x.id));
  perform clara._append_event(c.firm,'document.correction_applied',null,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('correction_id',x.id));
  perform clara._append_event(c.firm,'coding_task.opened',x.to_client,c.actor,null,null,
    null,x.document_id,null,jsonb_build_object('coding_task_id',v_coding_task,
      'filing_id',v_to_filing,'correction_id',x.id));
  perform clara._append_event(c.firm,'notification.recorded',x.to_client,c.actor,null,null,
    null,null,null,jsonb_build_object('notification_id',v_recode_notification,
      'correction_id',x.id,'coding_task_id',v_coding_task));
  if v_facts->>'status'='failed' then
    perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
      null,x.document_id,null,jsonb_build_object('task_id',v_facts->>'task_id',
        'reason',v_facts->>'reason'));
  end if;
  return clara._finish_op(c.firm,'approve_wrong_client_correction',p_op_key,
    jsonb_build_object('correction_id',x.id,'status','completed',
      'from_filing_id',v_from_filing,'to_filing_id',v_to_filing,
      'coding_task_id',v_coding_task));
end $$;

-- =====================================================================
-- 10. CLIENT-PINNED SECURITY-INVOKER READS + ATTEMPT RECOVERY
-- =====================================================================

create function clara.list_unassigned_documents(p_limit int default 50)
  returns setof jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
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

create function clara.get_document_extract(p_document uuid, p_client uuid default null,
    p_max_chars int default 20000) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare v_result jsonb; v_budget int:=least(greatest(coalesce(p_max_chars,20000),0),100000);
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
  end if;
  with target as (
    select d.*,
      not exists(select 1 from clara.document_filings f
                 where f.document_id=d.id and f.retired_at is null) as unassigned
    from clara.documents d where d.id=p_document
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

create function clara.get_draft_review(p_entry uuid, p_client uuid default null)
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
  if e.is_opening_balance then v_reasons:=v_reasons||'opening_balance'; end if;
  if e.is_year_end then v_reasons:=v_reasons||'year_end'; end if;
  if e.tax_affecting then v_reasons:=v_reasons||'tax_affecting'; end if;
  if v_debits >= v_threshold then v_reasons:=v_reasons||'amount_threshold'; end if;
  if e.flags ? 'amount_override' then v_reasons:=v_reasons||'amount_override'; end if;

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

create function clara.list_uncoded_filings(p_client uuid default null)
  returns setof jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
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

create function clara.get_journal_entry_for(p_entry uuid, p_client uuid) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if current_role='clara_agent_ro' then
    if clara.wake_firm() is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
  end if;
  return (select jsonb_build_object('entry',to_jsonb(e),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no)
      from clara.journal_lines l where l.entry_id=e.id),'[]'::jsonb))
    from clara.journal_entries e where e.id=p_entry and e.client_id=p_client);
end $$;

-- PIN-AB-1: recovery is intentionally a definer read and is granted only to the
-- trusted runtime; coding_attempts has no base-table grant.
create function clara.get_coding_attempt(p_task uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object('id',a.id,'task_id',a.task_id,'filing_id',a.filing_id,
    'document_id',a.document_id,'entry_id',a.entry_id,'client_id',a.client_id,
    'part_payload',a.part_payload,'created_at',a.created_at,
    'revision_token',e.revision_token,'entry_status',e.status,
    'exception',(e.flags ? 'amount_exception'))
  from clara.coding_attempts a join clara.journal_entries e on e.id=a.entry_id
  where a.task_id=p_task;
$$;

-- =====================================================================
-- 11. GRANT DELTA + MIGRATION-TAIL CATALOG ASSERTIONS
-- =====================================================================

grant select on clara.counterparties,clara.entry_evidence
  to clara_authenticated,clara_agent_ro;
grant select on clara.coding_tasks_visible to clara_authenticated;
-- W7 (F7): processing_call_reservations carries NO app-lane grant (companion §9).

-- The bare same-firm entry oracle remains human-only.
revoke execute on function clara.get_journal_entry(uuid) from clara_agent_ro;

-- PUBLIC defaults to EXECUTE after CREATE and DROP+CREATE resets ACLs. Sweep first,
-- then name every app-lane capability explicitly.
alter default privileges for role clara_fn_owner in schema clara
  revoke execute on functions from public;
revoke execute on all functions in schema clara from public;

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
  clara.get_coding_attempt(uuid)
to clara_runtime;

grant execute on function
  clara.wake_draft_entry(uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,
    jsonb,jsonb,jsonb,text)
to clara_wake_interactive;

do $$
declare
  v_name text; v_count int; v_public int; v_members int; v_bad_options int;
  v_expected text[]:=array[
    '_draft_entry_core','wake_draft_entry','draft_entry','upsert_account',
    'approve_entry','reverse_entry','revise_entry','withdraw_draft',
    'file_document','confirm_attribution_candidate','approve_wrong_client_correction',
    'open_coding_task','complete_coding_task','dismiss_coding_task',
    'enqueue_invoice_facts','persist_invoice_facts','fail_invoice_facts',
    'claim_document_processing_task','release_held_document_tasks',
    'requeue_stranded_document_task','list_unassigned_documents',
    'get_document_extract','get_draft_review','list_uncoded_filings',
    'get_journal_entry_for','get_coding_attempt'
  ];
begin
  foreach v_name in array v_expected loop
    select count(*)::int into v_count from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_name;
    if v_count<>1 then
      raise exception '0009 overload assertion failed: clara.% has % overloads',
        v_name,v_count using errcode='CLR10';
    end if;
  end loop;

  select count(*)::int into v_public
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='clara' and a.grantee=0 and a.privilege_type='EXECUTE';
  if v_public<>0 then
    raise exception '0009 PUBLIC execute assertion failed: % clara functions exposed',
      v_public using errcode='CLR10';
  end if;

  select count(*)::int into v_members from pg_auth_members am
    join pg_roles member on member.oid=am.member
    where member.rolname='clara_wake_write_login';
  select count(*)::int into v_bad_options from pg_auth_members am
    join pg_roles member on member.oid=am.member
    join pg_roles parent on parent.oid=am.roleid
    where member.rolname='clara_wake_write_login'
      and (parent.rolname<>'clara_wake_interactive'
        or am.inherit_option or not am.set_option);
  if v_members<>1 or v_bad_options<>0 then
    raise exception '0009 write-login membership assertion failed' using errcode='CLR10';
  end if;

  select count(*)::int into v_count
  from (values ('counterparty.created'),('entry.revised'),('entry.withdrawn'),
    ('coding_task.opened'),('coding_task.closed'),
    ('document.invoice_facts_completed'),('document.invoice_facts_failed')) x(name)
  join clara.event_types e on e.name=x.name
  join clara.taxonomy_active a on a.singleton
  join clara.trigger_taxonomy t on t.version=a.version and t.event_type=x.name;
  if v_count<>7 then
    raise exception '0009 active taxonomy pair assertion failed: %/7',v_count
      using errcode='CLR10';
  end if;
end $$;

reset role;
