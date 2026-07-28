-- =====================================================================
-- Migration 0029 (vendor-binding executor Slot C, task #36) —
-- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database
-- immediately after applying 0029:
--
--   psql "$DSN" -v ON_ERROR_STOP=1 \
--     -f vendor-binding-executor-0029-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success. Source
-- checks strip both SQL comment styles and normalize whitespace, so deleting a
-- control and pasting its words into a comment cannot satisfy a probe.
--
-- The durable source-gate string below MUST stay synchronized with
-- scripts/check-binding-post-control.mjs:
--
--   v_binding_live:=b.status='live' and b.expires_at>now();

do $verify$
declare
  v_n int;
  v_src text; v_norm text; v_identity_args text;
  v_pos_exec int; v_pos_approve int; v_pos_first_lock int;
  v_pos_rule int; v_pos_filing int; v_pos_entry int; v_pos_binding int;
  v_pos_marker_if int;
begin
  -- (1) mandatory prior-migration and current-migration checks.
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0028_vendor_identity_binding';
  if v_n<>1 then
    raise exception
      '0029 postverify: prior migration 0028_vendor_identity_binding is not recorded';
  end if;
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0029_vendor_binding_executor';
  if v_n<>1 then
    raise exception
      '0029 postverify: migration 0029_vendor_binding_executor is not recorded';
  end if;
  raise notice
    '0029 postverify OK (1/5): migration chain intact through 0029';

  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure
  ) into v_src;
  if v_src is null then
    raise exception '0029 postverify: execute_rule_post is missing';
  end if;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  -- (2) Layer-2 interlock, by the exact liveness gate installed in 0029.
  -- Keep this literal synchronized with check-binding-post-control.mjs.
  if position(
    'v_binding_live:=b.status=''live'' and b.expires_at>now();'
    in v_norm
  )=0 then
    raise exception
      '0029 postverify: execute_rule_post lacks the binding liveness gate';
  end if;
  raise notice
    '0029 postverify OK (2/5): exact binding live/unexpired gate is present';

  -- (3) Position 0 and the total data-lock order. Both distinct receipt rows
  -- must be reserved strictly before the first data lock, and the first
  -- acquisitions must follow rule -> filing -> entry -> binding.
  v_pos_exec:=position(
    '_reserve_op(v_locator.firm_id,''execute_rule_post''' in v_norm);
  v_pos_approve:=position(
    '_reserve_op(v_locator.firm_id,''approve_entry''' in v_norm);
  v_pos_rule:=position('from clara.coding_rules' in v_norm);
  v_pos_filing:=position(
    'v_filing:=clara._active_document_filing' in v_norm);
  v_pos_entry:=position(
    'from clara.journal_entries where id=p_entry for update' in v_norm);
  v_pos_binding:=position(
    'from clara.vendor_identity_bindings where id=e.vendor_binding_id for update'
    in v_norm);
  v_pos_first_lock:=least(
    nullif(v_pos_rule,0),nullif(v_pos_filing,0),
    nullif(v_pos_entry,0),nullif(v_pos_binding,0));
  if v_pos_exec=0 or v_pos_approve=0 or v_pos_first_lock is null
     or v_pos_exec>=v_pos_first_lock or v_pos_approve>=v_pos_first_lock
     or v_pos_rule=0 or v_pos_filing=0 or v_pos_entry=0 or v_pos_binding=0
     or v_pos_rule>=v_pos_filing or v_pos_filing>=v_pos_entry
     or v_pos_entry>=v_pos_binding then
    raise exception
      '0029 postverify: receipt/data-lock positions invalid (exec=%, approve=%, first=%, rule=%, filing=%, entry=%, binding=%)',
      v_pos_exec,v_pos_approve,v_pos_first_lock,
      v_pos_rule,v_pos_filing,v_pos_entry,v_pos_binding;
  end if;
  raise notice
    '0029 postverify OK (3/5): both receipts are position 0; rule -> filing -> entry -> binding is strict';

  -- (4) _approve_entry_core keeps the exact live signature and conditionally
  -- bypasses only its existing reservation. The human wrapper still supplies a
  -- ctx without receipt_preheld, so its reservation behavior remains unchanged.
  select pg_get_functiondef(
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure
  ) into v_src;
  select pg_get_function_identity_arguments(
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure
  ) into v_identity_args;
  if v_identity_args is distinct from
       'p_ctx jsonb, p_entry uuid, p_expected_revision uuid, p_attestation text, p_op_key text'
  then
    raise exception
      '0029 postverify: _approve_entry_core signature drifted: %',
      v_identity_args;
  end if;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position(
    'if not coalesce((p_ctx->>''receipt_preheld'')::boolean,false) then'
    in v_norm
  )=0 then
    raise exception
      '0029 postverify: _approve_entry_core lacks receipt_preheld branch';
  end if;
  select pg_get_functiondef(
    'clara.approve_entry(uuid,uuid,text,text)'::regprocedure
  ) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position(
    'jsonb_build_object(''actor'',c.actor,''firm'',c.firm)'
    in v_norm
  )=0 or position('receipt_preheld' in v_norm)<>0 then
    raise exception
      '0029 postverify: human approve_entry ctx behavior changed';
  end if;
  raise notice
    '0029 postverify OK (4/5): core signature unchanged; executor bypass is explicit; human ctx remains unmarked';

  -- (5) The vendor-binding block is marker-guarded. An unbound row therefore
  -- cannot reach the binding row lock or any binding resolution write.
  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure
  ) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  v_pos_marker_if:=position(
    'if e.vendor_binding_id is not null then' in v_norm);
  v_pos_binding:=position(
    'from clara.vendor_identity_bindings where id=e.vendor_binding_id for update'
    in v_norm);
  if v_pos_marker_if=0 or v_pos_binding=0
     or v_pos_marker_if>=v_pos_binding then
    raise exception
      '0029 postverify: binding lock is not guarded by vendor_binding_id IS NOT NULL (guard=%, lock=%)',
      v_pos_marker_if,v_pos_binding;
  end if;
  raise notice
    '0029 postverify OK (5/5): unbound entries cannot reach the binding-control block';

  raise notice
    '0029 postverify: ALL PROBES PASSED — Slot C receipts, lock order, liveness gate, core bypass, and unbound path are installed';
end
$verify$;
