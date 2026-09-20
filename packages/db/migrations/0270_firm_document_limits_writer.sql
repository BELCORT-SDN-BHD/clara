-- 0270_firm_document_limits_writer — #960 (lane 10, riders wave 2): THE FIRM'S OWN OWNER OR
-- ADMIN SETS ITS FOUR DOCUMENT-PROCESSING CAPS.
-- =====================================================================================
-- Spec of record: ticket #960's Agent Brief, ready-for-agent after the owner's ruling below.
-- (round 5 — the floor mirror and the no-cap-named refusal)
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
-- §A -- clara._firm_document_limit_ceiling(text). THE ESTATE'S OWN MAXIMUM per cap, and the one
-- place it is written down. Granted to NOBODY: it is reached only from §B's SECURITY DEFINER
-- body, exactly the disposition 0234's clara._legal_enforcement_mode and 0186's
-- clara._admission_capacity_state carry. A firm cannot raise a number it cannot reach.
--
-- WHY THESE FOUR NUMBERS. The estate runs ONE always-on `clara-runtime` machine
-- (docs/ARCHITECTURE.md's own deployment table: `min_machines_running = 1`,
-- `auto_stop_machines = false`, and the paragraph immediately under it that says in as many
-- words that this is deliberately NOT high availability). A per-firm concurrency ceiling of 16
-- is therefore already far above anything this deployment will actually run in parallel: it is
-- there so that a firm cannot write a number that would queue unbounded vendor calls against a
-- shared machine, not to promise throughput. The two daily ceilings are 100x the relation's own
-- first-insert values (0196's trigger: 100 / 1000) -- 10,000 documents and 100,000 pages in one
-- UTC day is past what any Malaysian accounting firm ingests in a day, and short of a number
-- that would let one firm's backlog exhaust the shared ingest lane.
--
-- THIS IS NOT A COLUMN CHECK, deliberately. A CHECK constraint would be the estate telling every
-- EXISTING row it is illegal, and this relation is written today only by the operator ceremony
-- and this rig's own root hand; the ticket's scope is a DOOR, and "the door carries it" is the
-- brief's own sentence. Nothing in this file touches the relation's constraint set.
-- =================================================================================================
create or replace function clara._firm_document_limit_ceiling(p_cap text) returns int
  language sql immutable set search_path = clara, pg_temp as $$
  select case p_cap
    when 'docs_per_day'            then 10000
    when 'pages_per_day'           then 100000
    when 'ocr_concurrency'         then 16
    when 'llm_witness_concurrency' then 16
    else null end;
$$;

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
  v_old clara.firm_document_limits%rowtype;
  v_new clara.firm_document_limits%rowtype;
  v_changed text[] := array[]::text[];
  v_previous jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_cap text;
  v_asked int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;

  -- A CALL THAT NAMES NO CAP IS REFUSED, never ridden through. Every cap argument is optional
  -- (that is what makes them individually settable), so this call is reachable -- and riding it
  -- through would mint a receipt and an audit row for a change that did not happen, in a trail
  -- the estate means to bill from.
  if p_docs_per_day is null and p_pages_per_day is null and p_ocr_concurrency is null
     and p_llm_witness_concurrency is null then
    raise exception 'name at least one cap to set' using errcode='CLR10',
      detail='{"reason":"no_cap_named"}';
  end if;

  -- BOTH BOUNDS, CHECKED BEFORE ANYTHING IS RESERVED OR WRITTEN.
  --  · the floor MIRRORS the relation's own CHECKs (`> 0` on three columns, `null or > 0` on the
  --    fourth) and refuses first, so a caller gets a Clara refusal it can render instead of a
  --    raw 23514 -- the same reasoning clara.set_firm_high_stakes_threshold states for its own
  --    mirror of `high_stakes_amount_cents > 0`;
  --  · the ceiling is the ESTATE's, and the refusal names the cap AND the number, because a
  --    bound a caller cannot see is a bound they cannot work with.
  foreach v_cap in array array['docs_per_day','pages_per_day','ocr_concurrency','llm_witness_concurrency'] loop
    v_asked := case v_cap
      when 'docs_per_day' then p_docs_per_day
      when 'pages_per_day' then p_pages_per_day
      when 'ocr_concurrency' then p_ocr_concurrency
      else p_llm_witness_concurrency end;
    if v_asked is null then continue; end if;
    if v_asked <= 0 then
      raise exception '% must be a positive whole number', v_cap
        using errcode='CLR10', detail='{"reason":"invalid_cap"}';
    end if;
    if v_asked > clara._firm_document_limit_ceiling(v_cap) then
      raise exception '% may not exceed the estate ceiling of %', v_cap,
        clara._firm_document_limit_ceiling(v_cap)
        using errcode='CLR10', detail='{"reason":"cap_above_ceiling"}';
    end if;
  end loop;

  v_dedupe := clara._reserve_op(c.firm, 'set_firm_document_limits', p_op_key,
    clara._hash(jsonb_build_object(
      'docs_per_day', p_docs_per_day, 'pages_per_day', p_pages_per_day,
      'ocr_concurrency', p_ocr_concurrency, 'llm_witness_concurrency', p_llm_witness_concurrency,
      'actor', c.actor)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ONE ADVISORY KEY OF ITS OWN, in the single-bigint space (0234's own idiom), so the
  -- read-then-write below cannot interleave with a second admin's. WITHOUT it two admins both
  -- read the SAME `previous` before either writes, and both receipts claim the same before-value
  -- -- 100->250 and 100->400, with a final value of 400. No serial order of those two calls is
  -- consistent with both receipts, and these receipts are usage-billing evidence.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.firm-document-limits:' || c.firm::text, 0));

  -- THE BEFORE-IMAGE. NULL on a firm that has never had a row: "no cap was stored" is a
  -- different fact from "the cap was zero", and the receipt says which.
  select * into v_old from clara.firm_document_limits where firm_id = c.firm for update;

  -- THE WRITE RIDES 0196's COLUMN-PRESERVING TRIGGER: a NULL argument is "leave this cap alone",
  -- and on a first insert the trigger supplies the relation's own first-insert values.
  insert into clara.firm_document_limits(firm_id, docs_per_day, pages_per_day, ocr_concurrency,
      llm_witness_concurrency, updated_by)
    values (c.firm, p_docs_per_day, p_pages_per_day, p_ocr_concurrency,
      p_llm_witness_concurrency, c.actor);
  select * into v_new from clara.firm_document_limits where firm_id = c.firm;

  -- WHAT ACTUALLY MOVED, decided by comparing the two images rather than by trusting the
  -- ARGUMENTS: a caller that names a cap at the value it already holds changed nothing, and
  -- saying otherwise would misstate the evidence.
  if v_new.docs_per_day is distinct from v_old.docs_per_day then
    v_changed := v_changed || 'docs_per_day'::text; end if;
  if v_new.pages_per_day is distinct from v_old.pages_per_day then
    v_changed := v_changed || 'pages_per_day'::text; end if;
  if v_new.ocr_concurrency is distinct from v_old.ocr_concurrency then
    v_changed := v_changed || 'ocr_concurrency'::text; end if;
  if v_new.llm_witness_concurrency is distinct from v_old.llm_witness_concurrency then
    v_changed := v_changed || 'llm_witness_concurrency'::text; end if;
  v_previous := jsonb_build_object(
    'docs_per_day', v_old.docs_per_day, 'pages_per_day', v_old.pages_per_day,
    'ocr_concurrency', v_old.ocr_concurrency,
    'llm_witness_concurrency', v_old.llm_witness_concurrency);

  -- BOTH SIDES OF EVERY CAP THAT MOVED, built from the two images the same way the list above
  -- is. A cap that did not move is ABSENT rather than present with old = new: an audit row that
  -- listed every cap on every call would make "what did this person actually change" a thing a
  -- reader has to work out, and this row is billing evidence.
  foreach v_cap in array v_changed loop
    v_changes := v_changes || jsonb_build_object(v_cap, jsonb_build_object(
      'old', v_previous -> v_cap,
      'new', to_jsonb(v_new) -> v_cap));
  end loop;

  perform clara._audit(c.firm, c.actor, null, null, 'set_firm_document_limits', null,
    jsonb_build_object('firm_id', c.firm, 'op_key', p_op_key,
      'changes', v_changes,
      'previous', v_previous,
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
    'previous', v_previous,
    'changed', to_jsonb(v_changed),
    'created', v_old.firm_id is null,
    'updated_at', v_new.updated_at));
end $$;

reset role;

revoke all on function clara._firm_document_limit_ceiling(text) from public;
revoke all on function clara.set_firm_document_limits(int,int,int,int,text) from public;
grant execute on function clara.set_firm_document_limits(int,int,int,int,text) to clara_authenticated;

do $w960_tail$
begin
  if to_regprocedure('clara.set_firm_document_limits(int,int,int,int,text)') is null then
    raise exception '#960 tail: the door does not resolve' using errcode='CLR10';
  end if;
  raise notice '#960 tail: OK (round 1).';
end
$w960_tail$;
