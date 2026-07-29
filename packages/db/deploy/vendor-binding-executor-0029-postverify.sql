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
  v_exact_slice text; v_bm_slice text;
  v_pos_exec int; v_pos_approve int; v_pos_first_lock int;
  v_pos_rule int; v_pos_rule_exact int;
  v_pos_filing int; v_pos_entry int; v_pos_binding int;
  v_pos_marker_if int; v_pos_gate int; v_pos_gate_use int;
  v_pos_approve_call int;
  v_pos_bm int; v_pos_bm_end int;
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
    '0029 postverify OK (1/7): migration chain intact through 0029';

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
  v_pos_gate:=position(
    'v_binding_live:=b.status=''live'' and b.expires_at>now();'
    in v_norm);
  v_pos_gate_use:=position('not v_binding_live' in v_norm);
  v_pos_approve_call:=position(
    'v_result:=clara._approve_entry_core(' in v_norm);
  if v_pos_gate=0 or v_pos_gate_use=0 or v_pos_approve_call=0
     or v_pos_gate>=v_pos_gate_use
     or v_pos_gate_use>=v_pos_approve_call then
    raise exception
      '0029 postverify: binding liveness assignment/use/approve order invalid (gate=%, use=%, approve=%)',
      v_pos_gate,v_pos_gate_use,v_pos_approve_call;
  end if;
  raise notice
    '0029 postverify OK (2/7): binding live/unexpired assignment feeds refusal control before approval';

  -- (3) Position 0 and the total data-lock order. Both distinct receipt rows
  -- must be reserved strictly before the first data lock, and the first
  -- acquisitions must follow rule -> filing -> entry -> binding.
  v_pos_exec:=position(
    '_reserve_op(v_locator.firm_id,''execute_rule_post''' in v_norm);
  v_pos_approve:=position(
    '_reserve_op(v_locator.firm_id,''approve_entry''' in v_norm);
  v_pos_rule:=position('from clara.coding_rules cr' in v_norm);
  v_pos_rule_exact:=position(
    'select * into r from clara.coding_rules where id=any(v_locked_rule_ids)'
    in v_norm);
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
     or v_pos_rule=0 or v_pos_rule_exact=0
     or v_pos_filing=0 or v_pos_entry=0 or v_pos_binding=0
     or v_pos_rule>=v_pos_filing or v_pos_filing>=v_pos_entry
     or v_pos_entry>=v_pos_rule_exact
     or v_pos_rule_exact>=v_pos_binding then
    raise exception
      '0029 postverify: receipt/rule-lock/filing/entry/rule-read/binding positions invalid (exec=%, approve=%, first=%, rule_lock=%, filing=%, entry=%, rule_read=%, binding=%)',
      v_pos_exec,v_pos_approve,v_pos_first_lock,
      v_pos_rule,v_pos_filing,v_pos_entry,v_pos_rule_exact,v_pos_binding;
  end if;
  v_exact_slice:=substring(
    v_norm from v_pos_rule_exact
    for position('if not found then' in substring(v_norm from v_pos_rule_exact))
  );
  if position('for update' in v_exact_slice)<>0 then
    raise exception
      '0029 postverify: exact coding_rules lookup contains a second FOR UPDATE';
  end if;
  raise notice
    '0029 postverify OK (3/7): both receipts are position 0; coding_rules locks once before filing/entry and the later exact lookup is plain';

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
    '0029 postverify OK (4/7): core signature unchanged; executor bypass is explicit; human ctx remains unmarked';

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
    '0029 postverify OK (5/7): unbound entries cannot reach the binding-control block';

  -- (6) F1 candidate counting is independent of F2, the complete X6 key set is
  -- recognized, and step 5 supplies registration before accepting equality.
  v_pos_bm:=position(
    'left join lateral ( select count(*)::int as match_count,'
    in v_norm);
  v_pos_bm_end:=case when v_pos_bm=0 then 0 else
    position(') bm on true;' in substring(v_norm from v_pos_bm))
  end;
  if v_pos_bm=0 or v_pos_bm_end=0 then
    raise exception
      '0029 postverify: binding candidate lateral query is missing';
  end if;
  v_bm_slice:=substring(v_norm from v_pos_bm for v_pos_bm_end);
  if position('starts_with' in v_bm_slice)<>0
     or position('array_agg(b2.id order by b2.id)' in v_bm_slice)=0
     or position('v_matching_f2_ok:=' in v_norm)=0
     or position(
       'coalesce(v_binding_matches,0)>1' in v_norm)=0
     or position('''matched'',''absent'',''ambiguous''' in v_norm)=0
     or position('''typed_collapsed''' in v_norm)=0
     or position('''emitted''' in v_norm)=0
     or position(
       '''registration_no'',v_vendor_registration' in v_norm)=0
     or position('elsif v_page_same then null;' in v_norm)=0 then
    raise exception
      '0029 postverify: F1/F2 two-phase selection, full receipt vocabulary, or step-5 equality source is incomplete';
  end if;
  raise notice
    '0029 postverify OK (6/7): F1 count precedes F2; full X6 receipt keys and registered-page equality are executable';

  -- (7) Every typed skip is settled through the private helper: one skip row,
  -- deletion of the never-used approve receipt, and _finish_op on the executor
  -- receipt. No direct skip insert remains in execute_rule_post, while the
  -- posted success path still settles itself exactly as before.
  select pg_get_functiondef(
    'clara._settle_rule_post_skip(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure
  ) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('insert into clara.rule_post_skips(' in v_norm)=0
     or position(
       'delete from clara.op_receipts where firm_id=p_firm and fn=''approve_entry'' and op_key=p_approve_op_key;'
       in v_norm)=0
     or position(
       'return clara._finish_op( p_firm,''execute_rule_post'',p_op_key,v_result);'
       in v_norm)=0
     or exists (
       select 1
       from pg_proc p, lateral aclexplode(p.proacl) a
       where p.oid=
         'clara._settle_rule_post_skip(uuid,uuid,uuid,uuid,text,text,text)'::regprocedure
         and a.grantee=0
         and a.privilege_type='EXECUTE'
     ) then
    raise exception
      '0029 postverify: _settle_rule_post_skip body or private ACL is incomplete';
  end if;

  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure
  ) into v_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if regexp_count(
       v_norm,'return clara\._settle_rule_post_skip\('
     )<>32
     or position('insert into clara.rule_post_skips' in v_norm)<>0
     or position(
       'return clara._finish_op( e.firm_id,''execute_rule_post'',p_op_key,v_result);'
       in v_norm)=0 then
    raise exception
      '0029 postverify: executor skip settlement coverage or posted success settlement drifted';
  end if;
  raise notice
    '0029 postverify OK (7/7): all 32 skips settle/replay and delete the unused approve receipt; posted success remains independently settled';

  raise notice
    '0029 postverify: ALL PROBES PASSED — Slot C receipts, lock order, liveness gate, core bypass, and unbound path are installed';
end
$verify$;
