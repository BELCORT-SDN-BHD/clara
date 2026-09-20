-- 0270_firm_document_limits_writer — #960 (lane 10, riders wave 2): THE FIRM'S OWN OWNER OR
-- ADMIN SETS ITS FOUR DOCUMENT-PROCESSING CAPS.
-- =====================================================================================
-- Spec of record: ticket #960's Agent Brief, ready-for-agent after the owner's ruling below.
-- (round 1 — the door exists; the receipt states every resulting cap)
-- =====================================================================================

do $w960_pre$
declare v_cols text; v_grants text; v_trig_sha text;
begin
  if to_regclass('clara.firm_document_limits') is null then
    raise exception '#960 prestate: clara.firm_document_limits is absent -- 0007 must apply first' using errcode='CLR10';
  end if;
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema='clara' and table_name='firm_document_limits';
  if v_cols is distinct from 'firm_id,docs_per_day,pages_per_day,ocr_concurrency,updated_at,updated_by,llm_witness_concurrency' then
    raise exception '#960 prestate: clara.firm_document_limits is not the seven-column relation this door writes -- got %', v_cols using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_trig_sha
    from pg_proc p where p.oid='clara._tf_firm_document_limits_upsert()'::regprocedure;
  if v_trig_sha is distinct from 'e07fabd4e475ae29ac8b5fa6a4f8477f72698df26110bfe8d4f3e456aa1f8eb2' then
    raise exception '#960 prestate: clara._tf_firm_document_limits_upsert has DRIFTED from its measured pre-image -- this door RIDES that body, so re-measure before applying (got %)', v_trig_sha using errcode='CLR10';
  end if;

  select coalesce(string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type), '') into v_grants
    from information_schema.role_table_grants
   where table_schema='clara' and table_name='firm_document_limits'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_grants is distinct from 'clara_authenticated:SELECT' then
    raise exception '#960 prestate: clara.firm_document_limits application-role grant matrix has DRIFTED -- got %', v_grants using errcode='CLR10';
  end if;

  raise notice '#960 prestate: clean.';
end
$w960_pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §B -- clara.set_firm_document_limits. The firm's OWN owner or admin, its OWN firm, always.
-- =================================================================================================
create or replace function clara.set_firm_document_limits(
    p_docs_per_day int default null,
    p_pages_per_day int default null,
    p_ocr_concurrency int default null,
    p_llm_witness_concurrency int default null,
    p_op_key text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;
  v_dedupe jsonb;
  v_new clara.firm_document_limits%rowtype;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'set_firm_document_limits', p_op_key,
    clara._hash(jsonb_build_object(
      'docs_per_day', p_docs_per_day, 'pages_per_day', p_pages_per_day,
      'ocr_concurrency', p_ocr_concurrency, 'llm_witness_concurrency', p_llm_witness_concurrency,
      'actor', c.actor)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- THE WRITE RIDES 0196's COLUMN-PRESERVING TRIGGER: a NULL argument is "leave this cap alone",
  -- and on a first insert the trigger supplies the relation's own first-insert values.
  insert into clara.firm_document_limits(firm_id, docs_per_day, pages_per_day, ocr_concurrency,
      llm_witness_concurrency, updated_by)
    values (c.firm, p_docs_per_day, p_pages_per_day, p_ocr_concurrency,
      p_llm_witness_concurrency, c.actor);
  select * into v_new from clara.firm_document_limits where firm_id = c.firm;

  perform clara._audit(c.firm, c.actor, null, null, 'set_firm_document_limits', null,
    jsonb_build_object('firm_id', c.firm, 'op_key', p_op_key,
      'caps', jsonb_build_object(
        'docs_per_day', v_new.docs_per_day, 'pages_per_day', v_new.pages_per_day,
        'ocr_concurrency', v_new.ocr_concurrency,
        'llm_witness_concurrency', v_new.llm_witness_concurrency)));

  return clara._finish_op(c.firm, 'set_firm_document_limits', p_op_key, jsonb_build_object(
    'status', 'set',
    'firm_id', c.firm,
    'caps', jsonb_build_object(
      'docs_per_day', v_new.docs_per_day, 'pages_per_day', v_new.pages_per_day,
      'ocr_concurrency', v_new.ocr_concurrency,
      'llm_witness_concurrency', v_new.llm_witness_concurrency),
    'updated_at', v_new.updated_at));
end $$;

reset role;

grant execute on function clara.set_firm_document_limits(int,int,int,int,text) to clara_authenticated;

do $w960_tail$
begin
  if to_regprocedure('clara.set_firm_document_limits(int,int,int,int,text)') is null then
    raise exception '#960 tail: the door does not resolve' using errcode='CLR10';
  end if;
  raise notice '#960 tail: OK (round 1).';
end
$w960_tail$;
