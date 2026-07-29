-- =====================================================================
-- Migration 0030 (vendor-binding F1 longest-common-prefix, task #36) —
-- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database
-- immediately after applying 0030:
--
--   psql "$DSN" -v ON_ERROR_STOP=1 \
--     -f vendor-binding-f1-lcp-0030-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success. Source
-- checks strip both SQL comment styles and normalize whitespace, so deleting a
-- control and pasting its words into a comment cannot satisfy a probe.
--
-- WHAT 0030 CLAIMS, restated as structural/catalog probes:
--   1. The mandatory 0029 prior migration and 0030 itself are recorded.
--   2. _binding_f1_floor_holds(text) is IMMUTABLE SQL and owner-private.
--   3. _derive_vendor_binding_proposal derives F1 with
--      _binding_common_prefix, applies the new floor, and has no old
--      count(DISTINCT ...) byte-equality shape.
--   4. _resolve_vendor_binding matches F1 with starts_with(document, stored).
--   5. execute_rule_post uses that same direction independently in the
--      other-binding lateral and the bound entry's own F1 re-check.
--   6. Derivation's dwell, F2 LCP/floor, and F3 controls are unchanged.
--   7. Resolver/executor F2, F3, and condition-5 admission controls remain.
--
-- COMMENT-STRIPPING DISCIPLINE. Every body assertion strips BOTH `--` line
-- comments and `/* ... */` block comments before normalizing whitespace. A
-- deleted guard pasted back as a comment therefore cannot satisfy a probe.
--
-- THE HONEST FRAMING. This file is BELT, not exhaustive proof of LCP
-- derivation, floor behavior, Slot-A resolution, or post-time refusal. Those
-- are behavioral rig responsibilities. These probes re-check the deployed
-- catalog and executable source from outside the migration transaction.

do $verify$
declare
  v_n int;
  v_src text;
  v_derive text;
  v_resolve text;
  v_exec text;
  v_f1_slice text;
  v_f2_slice text;
  v_bm_slice text;
  v_own_f1_slice text;
  v_pos_f1 int;
  v_pos_f2 int;
  v_pos_f3 int;
  v_pos_bm int;
  v_pos_bm_end int;
  v_pos_own_f1 int;
  v_pos_own_f1_end int;
begin
  -- (1) mandatory prior-migration chain and this migration's ledger row.
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0029_vendor_binding_executor';
  if v_n<>1 then
    raise exception
      '0030 postverify: prior migration 0029_vendor_binding_executor is not recorded';
  end if;
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0030_vendor_binding_f1_lcp';
  if v_n<>1 then
    raise exception
      '0030 postverify: migration 0030_vendor_binding_f1_lcp is not recorded';
  end if;
  raise notice
    '0030 postverify OK (1/7): migration chain intact through 0030';

  -- (2) The new helper has the exact immutable SQL/private posture. A NULL
  -- proacl is a failure because it implies PUBLIC EXECUTE on functions.
  select count(*)::int into v_n
  from pg_proc p
  join pg_language l on l.oid=p.prolang
  where p.oid='clara._binding_f1_floor_holds(text)'::regprocedure
    and p.provolatile='i'
    and l.lanname='sql'
    and p.proowner='clara_fn_owner'::regrole
    and p.proacl is not null
    and not exists (
      select 1 from lateral aclexplode(p.proacl) a
      where a.privilege_type='EXECUTE'
        and (a.grantee=0 or pg_get_userbyid(a.grantee)<>'clara_fn_owner')
    );
  if v_n<>1 then
    raise exception
      '0030 postverify: _binding_f1_floor_holds is missing, not IMMUTABLE SQL, not clara_fn_owner-owned, or not owner-private';
  end if;
  raise notice
    '0030 postverify OK (2/7): _binding_f1_floor_holds is IMMUTABLE SQL and owner-only';

  -- Pull and normalize each recut body once. All later slices derive from these
  -- comment-free executable-source strings.
  select pg_get_functiondef(
    'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)'::regprocedure
  ) into v_src;
  v_derive:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  select pg_get_functiondef(
    'clara._resolve_vendor_binding(uuid,uuid,uuid)'::regprocedure
  ) into v_src;
  v_resolve:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  select pg_get_functiondef(
    'clara.execute_rule_post(uuid,text)'::regprocedure
  ) into v_src;
  v_exec:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  -- (3) Isolate derivation's F1 block between the F1 and F2 assignments. It
  -- must call the shared LCP helper and the floor. The old count(DISTINCT ...)
  -- plus MIN byte-equality derivation must be absent from executable source.
  v_pos_f1:=position(
    'v_f1:=clara._binding_common_prefix(' in v_derive);
  v_pos_f2:=position(
    'v_f2:=clara._binding_common_prefix(' in v_derive);
  if v_pos_f1=0 or v_pos_f2=0 or v_pos_f1>=v_pos_f2 then
    raise exception
      '0030 postverify: derivation F1/F2 LCP assignment order is missing (F1=%, F2=%)',
      v_pos_f1,v_pos_f2;
  end if;
  v_f1_slice:=substring(v_derive from v_pos_f1 for v_pos_f2-v_pos_f1);
  if position(
       'v_evidence->0->>''f1_vendor_name_norm''' in v_f1_slice)=0
     or position(
       'v_evidence->1->>''f1_vendor_name_norm''' in v_f1_slice)=0
     or position(
       'v_evidence->2->>''f1_vendor_name_norm''' in v_f1_slice)=0
     or position(
       'if not clara._binding_f1_floor_holds(v_f1) then' in v_f1_slice)=0
     or v_derive ~
       'count\s*\(\s*distinct\s+value\s*->>\s*''f1_vendor_name_norm''\s*\)'
     or v_derive ~
       'min\s*\(\s*value\s*->>\s*''f1_vendor_name_norm''\s*\)' then
    raise exception
      '0030 postverify: derivation lacks the three-input F1 LCP/floor or retains the old byte-equality shape';
  end if;
  raise notice
    '0030 postverify OK (3/7): derivation uses the three-fragment F1 LCP plus floor and contains no old byte-equality shape';

  -- (4) Slot A must compare document F1 to stored F1 in the same direction as
  -- F2: starts_with(document_fragment, stored_prefix), never equality.
  if v_resolve !~
       'starts_with\s*\(\s*v_norm_name\s*,\s*b\.f1_vendor_name_norm\s*\)'
     or v_resolve ~
       'b\.f1_vendor_name_norm\s*=\s*v_norm_name'
     or v_resolve ~
       'v_norm_name\s*=\s*b\.f1_vendor_name_norm' then
    raise exception
      '0030 postverify: _resolve_vendor_binding lacks document-to-stored F1 starts_with or retains equality';
  end if;
  raise notice
    '0030 postverify OK (4/7): Slot A matches document F1 with starts_with(document, stored)';

  -- (5a) Isolate the executor's other-binding candidate lateral exactly as
  -- 0029's own postverify does, then prove its F1 predicate independently.
  v_pos_bm:=position(
    'left join lateral ( select count(*)::int as match_count,'
    in v_exec);
  v_pos_bm_end:=case when v_pos_bm=0 then 0 else
    position(') bm on true;' in substring(v_exec from v_pos_bm))
  end;
  if v_pos_bm=0 or v_pos_bm_end=0 then
    raise exception
      '0030 postverify: execute_rule_post binding candidate lateral is missing';
  end if;
  v_bm_slice:=substring(v_exec from v_pos_bm for v_pos_bm_end);
  if v_bm_slice !~
       'starts_with\s*\(\s*clara\._binding_normalize\s*\(\s*vn\.vendor_name\s*\)\s*,\s*b2\.f1_vendor_name_norm\s*\)'
     or v_bm_slice ~
       'b2\.f1_vendor_name_norm\s*=\s*clara\._binding_normalize\s*\(\s*vn\.vendor_name\s*\)' then
    raise exception
      '0030 postverify: executor other-binding lateral lacks F1 starts_with or retains equality';
  end if;
  -- O-round confirmation finding 4: this site must carry the SAME explicit
  -- NULL guard as F2's/v_f1_ok's own starts_with idiom (WHERE already
  -- excludes a NULL result, so this is a source-discipline probe, not a
  -- behavioral one).
  if v_bm_slice !~
       'clara\._binding_normalize\s*\(\s*vn\.vendor_name\s*\)\s+is\s+not\s+null' then
    raise exception
      '0030 postverify: executor other-binding lateral lacks the explicit F1 NULL guard';
  end if;

  -- (5b) Independently isolate the bound entry's own F1 assignment/re-check,
  -- ending strictly before F2. This prevents one starts_with site from masking
  -- the accidental loss of the other.
  v_pos_own_f1:=position(
    'v_f1_current:=clara._binding_normalize(v_vendor_name);' in v_exec);
  v_pos_own_f1_end:=case when v_pos_own_f1=0 then 0 else
    position('v_f2_ok:=' in substring(v_exec from v_pos_own_f1))
  end;
  if v_pos_own_f1=0 or v_pos_own_f1_end=0 then
    raise exception
      '0030 postverify: executor own-binding F1 slice is missing';
  end if;
  v_own_f1_slice:=substring(
    v_exec from v_pos_own_f1 for v_pos_own_f1_end);
  if v_own_f1_slice !~
       'v_f1_ok\s*:=\s*v_f1_current\s+is\s+not\s+null\s+and\s+starts_with\s*\(\s*v_f1_current\s*,\s*b\.f1_vendor_name_norm\s*\)'
     or v_own_f1_slice ~
       'v_f1_current\s+is\s+not\s+distinct\s+from\s+b\.f1_vendor_name_norm' then
    raise exception
      '0030 postverify: executor own-binding F1 re-check lacks starts_with or retains equality';
  end if;
  raise notice
    '0030 postverify OK (5/7): both executor F1 sites independently use starts_with(document, stored)';

  -- (6) Derivation's surrounding law did not move: the collective dwell gate,
  -- the three-input F2 LCP, its exact length/alpha floor, and per-item F3 call.
  v_pos_f3:=position(
    'for v_item in select value from jsonb_array_elements(v_evidence) loop if not clara._binding_f3_holds('
    in v_derive);
  if v_pos_f2=0 or v_pos_f3=0 or v_pos_f2>=v_pos_f3 then
    raise exception
      '0030 postverify: derivation F2/F3 slice order is missing (F2=%, F3=%)',
      v_pos_f2,v_pos_f3;
  end if;
  v_f2_slice:=substring(v_derive from v_pos_f2 for v_pos_f3-v_pos_f2);
  if position(
       'if v_dates<>3 or v_span is null or v_span<14 then' in v_derive)=0
     or position(
       'v_evidence->0->>''invoice_id_norm''' in v_f2_slice)=0
     or position(
       'v_evidence->1->>''invoice_id_norm''' in v_f2_slice)=0
     or position(
       'v_evidence->2->>''invoice_id_norm''' in v_f2_slice)=0
     or position(
       'if length(v_f2)<6 or v_alpha_count<3 or v_leading in ('
       in v_f2_slice)=0
     or position(
       '(v_item->>''document_id'')::uuid, cp.registration_normalized, cp.name_normalized'
       in substring(v_derive from v_pos_f3))=0 then
    raise exception
      '0030 postverify: derivation dwell, F2 LCP/floor, or F3 controls drifted';
  end if;
  raise notice
    '0030 postverify OK (6/7): derivation dwell, F2 LCP/floor, and F3 controls remain intact';

  -- (7) Resolver/executor surrounding controls remain executable too. Check
  -- F2 and F3 in both functions, plus 0029's condition-5 registration source
  -- and same-page admission branch.
  if position(
       'not starts_with(v_invoice_id_norm,v_f2_prefix)' in v_resolve)=0
     or position(
       '_binding_f3_holds( p_document,cp.registration_normalized,cp.name_normalized)'
       in v_resolve)=0
     or position(
       '(p_page_candidate is null or b.counterparty_id=p_page_candidate)'
       in v_resolve)=0
     or position(
       '_binding_f3_holds( e.document_id,cp2.registration_normalized,cp2.name_normalized)'
       in v_bm_slice)=0
     or position(
       'v_f2_ok:=v_invoice_id_norm is not null and starts_with(v_invoice_id_norm,b.f2_invoice_prefix);'
       in v_exec)=0
     or position(
       'v_matching_f2_ok:=coalesce(v_binding_matches,0)=1 and v_invoice_id_norm is not null and starts_with(v_invoice_id_norm,v_matching_f2);'
       in v_exec)=0
     or position(
       '''registration_no'',v_vendor_registration' in v_exec)=0
     or position('elsif v_page_same then null;' in v_exec)=0 then
    raise exception
      '0030 postverify: resolver/executor F2, F3, or condition-5 admission controls drifted';
  end if;
  raise notice
    '0030 postverify OK (7/7): resolver/executor F2, F3, and condition-5 admission controls remain intact';

  raise notice
    '0030 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED — behavioral LCP and refusal correctness remains the rig suite''s job';
end
$verify$;
