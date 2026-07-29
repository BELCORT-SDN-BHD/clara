-- =====================================================================
-- Migration 0031 (autopost lane unify: admission stale-cache + near_duplicate
-- discriminator, ledger #39/#40) -- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database
-- immediately after applying 0031:
--
--   psql "$DSN" -v ON_ERROR_STOP=1 \
--     -f autopost-lane-unify-0031-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean
-- run ends with one notice per probe and nothing else.
--
-- WHAT 0031 CLAIMS, restated as structural/catalog probes:
--   1. The mandatory 0030 prior migration and 0031 itself are recorded.
--   2. admit_autodraft_task's filing lock, lock-protected registry re-check,
--      lane check, and op-key reservation appear in that exact order -- the
--      lane check strictly BEFORE reservation is the entire fix.
--   3. The not-ready lane branch returns directly, with no _finish_op call in
--      its own source slice -- a refusal settles no op-key receipt.
--   4. The admitted (success) path still reaches _reserve_op/_finish_op --
--      idempotent replay protection is preserved for the outcome that
--      actually creates a resource.
--   5. clara.coding_lane (the read verb) still calls the identical
--      _coding_lane_core -- confirming admission and the read verb consume
--      one law, not two.
--   6. near_duplicate's amount limb carries the invoice_id + sha256
--      discriminator; the invoice_date limb's own predicate text is present
--      unchanged.
--
-- COMMENT-STRIPPING DISCIPLINE. Every body assertion strips BOTH `--` line
-- comments and `/* ... */` block comments before normalizing whitespace. A
-- deleted guard pasted back as a comment therefore cannot satisfy a probe.
--
-- THE HONEST FRAMING. This file is BELT, not exhaustive proof of the
-- admission/read-verb agreement or the near_duplicate discriminator's exact
-- admit/refuse boundary. Those are behavioral rig responsibilities
-- (packages/db/tests/x31-autopost-lane-unify.test.mjs). These probes re-check
-- committed catalog structure and executable source shape from outside the
-- migration transaction, on top of 0031's own in-transaction tail assertions.

do $verify$
declare
  v_n int;
  v_admit_src text;
  v_lane_src text;
  v_coding_lane_src text;
  v_norm text;
  v_pos_lock int;
  v_pos_recheck int;
  v_pos_lane int;
  v_pos_opkey int;
  v_refusal_slice text;
begin
  -- (1) mandatory prior-migration chain and this migration's ledger row.
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0030_vendor_binding_f1_lcp';
  if v_n<>1 then
    raise exception '0031 postverify: migration 0030_vendor_binding_f1_lcp is not recorded';
  end if;
  select count(*)::int into v_n
  from clara.schema_migrations
  where version='0031_autopost_lane_unify';
  if v_n<>1 then
    raise exception '0031 postverify: migration 0031_autopost_lane_unify is not recorded';
  end if;
  raise notice '0031 postverify OK (1/6): prior-migration chain intact through 0031';

  -- (2) admit_autodraft_task: lock, registry re-check, lane check, op-key
  -- reservation appear in that exact order.
  select pg_get_functiondef(
    'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure)
    into v_admit_src;
  v_norm:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_admit_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  v_pos_lock:=position('for update;' in v_norm);
  -- The registry-recheck SELECT is executable code that appears TWICE (the initial
  -- registry short-circuit, then the lock-protected recheck) -- search for the SECOND
  -- occurrence, strictly after the lock, not the first (comment-stripping already
  -- removed the "a waiter that lost the filing lock..." prose that used to anchor this).
  v_pos_recheck:=case when v_pos_lock=0 then 0 else
    position(
      'left join clara.agent_tasks t on t.id=aa.task_id where aa.filing_id=p_filing;'
      in substring(v_norm from v_pos_lock))
  end;
  v_pos_recheck:=case when v_pos_recheck=0 then 0 else v_pos_recheck+v_pos_lock-1 end;
  v_pos_lane:=position(
    'select * into v_lane from clara._coding_lane_core(f.client_id,p_filing);' in v_norm);
  v_pos_opkey:=position(
    'v_op_key:=''autodraft:''||p_filing||'':''||p_origin;' in v_norm);
  if v_pos_lock=0 or v_pos_recheck=0 or v_pos_lane=0 or v_pos_opkey=0
     or v_pos_lock>=v_pos_recheck or v_pos_recheck>=v_pos_lane
     or v_pos_lane>=v_pos_opkey then
    raise exception
      '0031 postverify: admit_autodraft_task lock/recheck/lane/op-key order is wrong (lock=%, recheck=%, lane=%, opkey=%)',
      v_pos_lock,v_pos_recheck,v_pos_lane,v_pos_opkey;
  end if;
  raise notice '0031 postverify OK (2/6): admit_autodraft_task''s lock -> registry recheck -> lane check -> op-key reservation order is intact';

  -- (3) the not-ready branch (between the lane check and the op-key
  -- assignment) settles no receipt -- no _finish_op call in that slice.
  v_refusal_slice:=substring(v_norm from v_pos_lane for v_pos_opkey-v_pos_lane);
  if position('_finish_op' in v_refusal_slice)<>0 then
    raise exception '0031 postverify: the not-ready lane branch still settles an op-key receipt -- the stale-cache defect is not fixed';
  end if;
  if position('outcome'',''lane_changed' in v_refusal_slice)=0 then
    raise exception '0031 postverify: the not-ready lane branch no longer returns the lane_changed outcome';
  end if;
  raise notice '0031 postverify OK (3/6): a not-ready lane returns directly, settling no op_receipts row';

  -- (4) the admitted (success) path still reaches _reserve_op/_finish_op --
  -- idempotency is preserved for the outcome that actually creates a task.
  if position('v_dedupe:=clara._reserve_op(f.firm_id,''admit_autodraft_task''' in v_norm)=0
     or position('outcome'',''admitted' in v_norm)=0
     or position('return clara._finish_op(f.firm_id,''admit_autodraft_task''' in v_norm)=0 then
    raise exception '0031 postverify: the admitted (success) path no longer reserves/settles an idempotent op-key receipt';
  end if;
  raise notice '0031 postverify OK (4/6): the admitted path still reserves and settles an idempotent op-key receipt';

  -- (5) clara.coding_lane (the read verb) still calls the identical
  -- _coding_lane_core -- admission and the read verb consume one law.
  select pg_get_functiondef('clara.coding_lane(uuid,uuid)'::regprocedure)
    into v_coding_lane_src;
  v_coding_lane_src:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_coding_lane_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('return query select * from clara._coding_lane_core(p_client,p_filing);'
       in v_coding_lane_src)=0 then
    raise exception '0031 postverify: clara.coding_lane no longer delegates to _coding_lane_core directly';
  end if;
  raise notice '0031 postverify OK (5/6): clara.coding_lane (the read verb) and admission consume the identical _coding_lane_core';

  -- (6) near_duplicate's amount limb carries the invoice_id + sha256
  -- discriminator; the invoice_date limb's predicate text is present, unchanged.
  select pg_get_functiondef('clara._coding_lane_core(uuid,uuid)'::regprocedure)
    into v_lane_src;
  v_lane_src:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_lane_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));
  if position('v_invoice_id:=nullif(v_state->>''invoice_id'','''');' in v_lane_src)=0
     or position('join clara.documents ed on ed.id=e.document_id' in v_lane_src)=0
     or position('and ed.sha256<>f.sha256' in v_lane_src)=0
     or position(
       'nullif(clara._invoice_fact_state(e.document_id)->>''invoice_id'','''')<>v_invoice_id'
       in v_lane_src)=0
     or position('v_invoice_date is not null and' in v_lane_src)=0
     or position(
       'clara._invoice_fact_state(e.document_id)->>''invoice_date''=v_invoice_date'
       in v_lane_src)=0 then
    raise exception '0031 postverify: near_duplicate does not carry the invoice_id/sha256 discriminator, or the invoice_date limb drifted';
  end if;
  raise notice '0031 postverify OK (6/6): near_duplicate''s amount limb is discriminated by invoice_id+sha256; the invoice_date limb is untouched';

  raise notice '0031 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED — behavioral admission/read-verb agreement and the discriminator''s admit/refuse boundary remain the rig suite''s job';
end
$verify$;
