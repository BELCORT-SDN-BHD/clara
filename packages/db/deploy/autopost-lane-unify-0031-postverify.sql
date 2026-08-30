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
    'clara._reserve_op(f.firm_id,''admit_autodraft_task'',v_op_key,' in v_norm);
  if v_pos_lock=0 or v_pos_recheck=0 or v_pos_lane=0 or v_pos_opkey=0
     or v_pos_lock>=v_pos_recheck or v_pos_recheck>=v_pos_lane
     or v_pos_lane>=v_pos_opkey then
    raise exception
      '0031 postverify: admit_autodraft_task lock/recheck/lane/op-key order is wrong (lock=%, recheck=%, lane=%, opkey=%)',
      v_pos_lock,v_pos_recheck,v_pos_lane,v_pos_opkey;
  end if;
  raise notice '0031 postverify OK (2/6): admit_autodraft_task''s lock -> registry recheck -> lane check -> the REAL _reserve_op call order is intact';

  -- (3) O-round confirmation findings 2+4: the slice from the lane check through the
  -- ACTUAL _reserve_op call (not merely the v_op_key assignment) must contain no
  -- _finish_op call -- this now spans BOTH the not-ready lane branch AND the budget/
  -- concurrency-cap refusal branches, since all three must return their outcome
  -- directly without ever touching op_receipts. There is exactly one _finish_op call
  -- anywhere in the function (the admitted path's own settlement, probe 4) -- if this
  -- slice found one, it would necessarily be a SECOND, illegitimate occurrence.
  v_refusal_slice:=substring(v_norm from v_pos_lane for v_pos_opkey-v_pos_lane);
  if position('_finish_op' in v_refusal_slice)<>0 then
    raise exception '0031 postverify: a not-ready or budget-refused branch still settles an op-key receipt -- the stale-cache defect is not fully fixed';
  end if;
  if position('outcome'',''lane_changed' in v_refusal_slice)=0 then
    raise exception '0031 postverify: the not-ready lane branch no longer returns the lane_changed outcome';
  end if;
  -- SUCCESSION (F-A9 PR-1B, `f_a9_pr_1b_brake_census`). Before that migration this slice
  -- carried TWO `outcome','refused_budget` returns: the token-budget refusal and the
  -- concurrency refusal, which shared one string. PR-1B REMOVES the first (owner ruling
  -- TA-P12 = A, digest law 76) and RENAMES the second to `refused_concurrency` (law 22), so
  -- the post-arm expects exactly ONE direct return, spelled the new way. Gated on the
  -- migration STEM, never a number: the file is numbered at MERGE.
  -- The property this probe actually protects -- a refusal returns DIRECTLY, ahead of
  -- op-key reservation, settling no receipt -- is unchanged on both sides of the gate.
  select count(*)::int into v_n from clara.schema_migrations
   where version like '%\_f\_a9\_pr\_1b\_brake\_census';
  if v_n=0 then
    if position('outcome'',''refused_budget' in v_refusal_slice)=0
       or (select count(*) from regexp_matches(v_refusal_slice,'outcome'',''refused_budget','g'))<2 then
      raise exception '0031 postverify: both budget/concurrency-cap refusal branches must return refused_budget directly, ahead of op-key reservation';
    end if;
    raise notice '0031 postverify OK (3/6): a not-ready lane AND both budget refusal branches return directly, settling no op_receipts row';
  else
    if position('outcome'',''refused_budget' in v_refusal_slice)<>0 then
      raise exception '0031 postverify: post-F-A9-PR-1B, NO refusal branch may still return refused_budget -- the token budget is removed and the concurrency refusal is renamed refused_concurrency';
    end if;
    if (select count(*) from regexp_matches(v_refusal_slice,'outcome'',''refused_concurrency','g'))<>1 then
      raise exception '0031 postverify: post-F-A9-PR-1B the concurrency refusal branch must return refused_concurrency directly, exactly once, ahead of op-key reservation';
    end if;
    raise notice '0031 postverify OK (3/6, post-F-A9-PR-1B): a not-ready lane AND the surviving concurrency refusal return directly, settling no op_receipts row; the removed token-budget branch leaves no refused_budget return behind';
  end if;

  -- (4) the admitted (success) path still reaches _reserve_op/_finish_op --
  -- idempotency is preserved for the outcome that actually creates a task. Exactly
  -- one _finish_op call exists anywhere in the function (probe 3 already proved the
  -- refusal slice contains none), so this occurrence can only be the genuine one.
  --
  -- SUCCESSION-AWARE (2026-08-30, backend-small lane item 4 / PROGRESS.md Known-issues
  -- 3d: "ALREADY RED at step 4/6 at the 0147 frontier on both sides -- pre-existing and
  -- unrelated to F-A9"). RUN AND CONFIRMED on a fresh 0001-0155 replay: this probe reds
  -- with exactly that message, on a chain that never touched F-A9 PR-1B at all -- so the
  -- true cause predates 0147 by a lot. MEASURED, not guessed: pg_get_functiondef on the
  -- live body shows the bare literal this probe pinned, `outcome','admitted`, is GONE --
  -- not because the admitted path stopped settling a receipt (probe 3's own count already
  -- proves there is exactly one _finish_op site and it is this one), but because
  -- 0053_autodraft_readmit_after_withdrawal spliced the plain literal into a three-way
  -- CASE (its own anchor/replacement pair, 0053:951/958-959) so a human one_click
  -- re-admission after a withdrawal reports its own outcome token
  -- (`re_admitted_after_withdrawal`) instead of colliding with `admitted`/`re_admitted`.
  -- `'admitted'` never left; it is that CASE's `else` branch, byte-identical to 0053's own
  -- splice text, confirmed directly against a live 0155-frontier rig before this file was
  -- touched. Gated on the migration STEM, never a number (numbers are claimed at merge,
  -- `.claude/rules/db-migrations.md`): a chain that genuinely lacks 0053 keeps the
  -- original pre-0053 literal check.
  --
  -- NARROWED (fold FIND-1): that fallback's own real reach is smaller than "any pre-0053
  -- chain" -- `admit_autodraft_task`'s outcome has been a CASE since 0034
  -- (`0034_autodraft_retry_door.sql:410` splices the bare literal into
  -- `case when v_is_retry then 're_admitted' else 'admitted' end`), so the plain
  -- `outcome','admitted` substring this else-branch pins only ever matched the ORIGINAL
  -- 0031 ceremony window -- frontiers 31 through 33, before 0034 applied. On any chain at
  -- 34 or later but short of 0053 (a window with no live deploy history to protect), this
  -- probe would ALSO fail to find the bare literal and this else-branch would red for the
  -- same reason the pre-fix if-branch did -- correctly, since neither this file's fix nor
  -- its fallback claims to track every intermediate outcome shape, only the two that ever
  -- mattered to a real ceremony (0031's own, and 0053-onward's).
  if exists (select 1 from clara.schema_migrations
              where version = '0053_autodraft_readmit_after_withdrawal') then
    if position('v_dedupe:=clara._reserve_op(f.firm_id,''admit_autodraft_task''' in v_norm)=0
       or position('''outcome'',case when v_withdrawn_readmit then ''re_admitted_after_withdrawal'' when v_is_retry then ''re_admitted'' else ''admitted'' end' in v_norm)=0
       or position('return clara._finish_op(f.firm_id,''admit_autodraft_task''' in v_norm)=0
       or (select count(*) from regexp_matches(v_norm,'_finish_op\(f\.firm_id,''admit_autodraft_task''','g'))<>1 then
      raise exception '0031 postverify: the admitted (success) path no longer reserves/settles an idempotent op-key receipt, the post-0053 three-way outcome CASE (admitted/re_admitted/re_admitted_after_withdrawal) drifted, or a second _finish_op site appeared';
    end if;
    raise notice '0031 postverify OK (4/6, post-0053): the admitted path still reserves and settles an idempotent op-key receipt (the ONLY such site), and its outcome token survives as the three-way CASE''s else branch (admitted / re_admitted / re_admitted_after_withdrawal)';
  else
    if position('v_dedupe:=clara._reserve_op(f.firm_id,''admit_autodraft_task''' in v_norm)=0
       or position('outcome'',''admitted' in v_norm)=0
       or position('return clara._finish_op(f.firm_id,''admit_autodraft_task''' in v_norm)=0
       or (select count(*) from regexp_matches(v_norm,'_finish_op\(f\.firm_id,''admit_autodraft_task''','g'))<>1 then
      raise exception '0031 postverify: the admitted (success) path no longer reserves/settles an idempotent op-key receipt, or a second _finish_op site appeared';
    end if;
    raise notice '0031 postverify OK (4/6): the admitted path still reserves and settles an idempotent op-key receipt, and it is the ONLY such site';
  end if;

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
