-- =====================================================================
-- Migration 0035 (the drafting-trio DB half, ledger #21 + #34) --
-- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database
-- immediately after applying 0035:
--
--   psql "$DSN" -v ON_ERROR_STOP=1 \
--     -f drafting-trio-0035-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean
-- run ends with five notices and nothing else.
--
-- WHAT 0035 CLAIMS, restated as structural/catalog probes:
--   1. The mandatory prior migration (0029, clara._approve_entry_core's true
--      content dependency) and 0035 itself are recorded as applied.
--   2. SECTION B: the old "revise the draft" remedy phrase is fully retired
--      from clara._approve_entry_core, and the new remedy phrase appears
--      exactly once, still attached to errcode CLR23.
--   3. SECTION A: the advisory-warning conditional
--      (coding_kind='supplier_bill' and v_counterparty is null) sits strictly
--      between v_counterparty's fallback-resolution block closing and the
--      advisory locks that follow it -- proving it reads v_counterparty's
--      FINAL value, not a not-yet-resolved one.
--   4. The final return and the audit call both carry the conditional
--      warning append, additive only -- no change to the op_key/_reserve_op/
--      _finish_op mechanics.
--   5. A whole-schema scan confirms clara._approve_entry_core is the ONLY
--      live clara function carrying EITHER the old or the new CLR23 remedy
--      phrase (checking only the old phrase would leave the "sole carrier of
--      the new text" half of the claim unproven) -- proving section B's fix
--      is exhaustive, not merely local to the one occurrence this migration
--      edited. Excludes by exact OID, not by proname, so a differently-typed
--      overload of the same name could never be silently skipped.
--
-- ---------------------------------------------------------------------------
-- TRUED 2026-08-30 BY 裁-18b PR-3 (binding_pr_3_post_time_recheck). THIS FILE
-- WAS ALREADY RED, at two probes, and had been for two frontiers -- found by
-- RUNNING it on a pristine 0001..0155 replay rather than by reading it:
--
--   probe 2  pinned the remedy phrase "withdraw the draft and re-draft; the new
--            draft will resolve against the current counterparty landscape".
--            0053 §7-A F8 REWORDED that remedy -- it now carries a parenthetical
--            naming the doors that actually exist -- so the pin has matched ZERO
--            occurrences since 0053 applied. PR-3 additionally replaces the word
--            "budget" in that parenthetical with the live successor gate name
--            "concurrency" (F-A9 PR-1B removed the token-budget gate whole;
--            measured on the live comment-stripped body of admit_autodraft_task).
--            The pin below is the CURRENT live phrase, in full.
--
--   probe 4  pinned the audit call as clara._audit(c.firm,c.actor,null,null,...).
--            0106 §E change (2) replaced those two hard-coded nulls with the ctx
--            identity channels v_obo / v_via_wake_kind. The pin is now written to
--            the part of that call that 0035 actually owns -- the fn name, the
--            entry and the filing key -- so it stops re-breaking every time an
--            unrelated file threads another channel through the same call.
--
-- What 0035 CLAIMS has not changed and neither has any probe's INTENT: this is a
-- pin refresh against the live catalog, not a relaxation. Probe 3's three
-- position pins and probe 5's whole-schema sole-carrier scan are untouched in
-- substance; probe 5 simply follows probe 2's phrase.
--
-- THE PAIR THAT COVERS BOTH READINGS, worth knowing before changing either half:
-- probe 2 below reads a COMMENT-STRIPPED, whitespace-collapsed, lower-cased
-- projection of the body, so it cannot be satisfied by prose in a comment. The
-- PR-3 migration's own postcheck (UNNUMBERED_binding_pr_3_post_time_recheck.sql,
-- the "stale budget gate name survives" guard) reads the RAW pg_get_functiondef
-- instead, so it also refuses the retired word appearing in a comment. Neither
-- read subsumes the other: the pair is what makes "the gate name is gone" true
-- of the executable code AND of what a reader sees beside it.
-- ---------------------------------------------------------------------------

do $post$
declare
  v_migration_count int; v_prior_count int; v_src text; v_old_count int; v_new_count int;
  v_pos_else_close int; v_pos_section_a int; v_pos_locks int;
  v_pos_return int; v_pos_return_case int; v_pos_audit int; v_pos_audit_case int;
  r record; v_scan_src text; v_leak_old_count int; v_leak_new_count int;
  v_target_oid oid;
begin
  v_target_oid:='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  select count(*) into v_migration_count from clara.schema_migrations
    where version = '0035_drafting_trio';
  if v_migration_count <> 1 then
    raise exception '0035 postverify: migration 0035_drafting_trio is not recorded as applied';
  end if;
  select count(*) into v_prior_count from clara.schema_migrations
    where version = '0029_vendor_binding_executor';
  if v_prior_count <> 1 then
    raise exception '0035 postverify: migration 0029_vendor_binding_executor (the true content dependency for clara._approve_entry_core) is not recorded as applied';
  end if;
  raise notice '0035 postverify OK (1/5): 0035 is recorded applied, and its true content-dependency (0029) precedes it';

  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_src;
  v_src:=lower(regexp_replace(
    regexp_replace(
      regexp_replace(v_src,'/\*[\s\S]*?\*/','','g'),
      '--[^\n]*','','g'),
    '\s+',' ','g'));

  v_old_count:=(length(v_src)-length(replace(v_src,'revise the draft','')))
    / length('revise the draft');
  if v_old_count <> 0 then
    raise exception '0035 postverify: the old "revise the draft" remedy phrase is still present (% occurrences) in clara._approve_entry_core', v_old_count;
  end if;
  v_new_count:=(length(v_src)-length(replace(v_src,
      'withdraw the draft and re-draft (after withdrawing, a bookkeeper can ask the autodraft door to try again; it may still refuse on the usual lane, consent, concurrency or attempt gates, or you can re-draft through the chat or hand-draft lanes); the new draft will resolve against the current counterparty landscape','')))
    / length('withdraw the draft and re-draft (after withdrawing, a bookkeeper can ask the autodraft door to try again; it may still refuse on the usual lane, consent, concurrency or attempt gates, or you can re-draft through the chat or hand-draft lanes); the new draft will resolve against the current counterparty landscape');
  if v_new_count <> 1 then
    raise exception '0035 postverify: the new CLR23 remedy phrase must appear exactly once in clara._approve_entry_core -- found %', v_new_count;
  end if;
  -- ...and the RETIRED gate name is gone, which is the half a count alone cannot say.
  if position('lane, consent, budget or attempt gates' in v_src) <> 0 then
    raise exception '0035 postverify: the remedy still names the retired token-budget gate (F-A9 PR-1B removed it)';
  end if;
  if position('the new draft will resolve against the current counterparty landscape'' using errcode=''clr23' in v_src) = 0 then
    raise exception '0035 postverify: the new remedy phrase is not attached to errcode CLR23';
  end if;
  raise notice '0035 postverify OK (2/5): section B''s old remedy phrase is fully retired from clara._approve_entry_core and the new phrase appears exactly once, still CLR23';

  v_pos_else_close:=position(
    'from clara.journal_lines l join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code where l.entry_id=p_entry and a.account_class in (''payable'',''receivable'') and l.counterparty_id is not null; end if;'
    in v_src);
  v_pos_section_a:=position(
    'if e.coding_kind=''supplier_bill'' and v_counterparty is null then'
    in v_src);
  v_pos_locks:=position(
    'if v_counterparty is not null then perform pg_advisory_xact_lock(203005003,'
    in v_src);
  if v_pos_else_close=0 or v_pos_section_a=0 or v_pos_locks=0
     or not (v_pos_else_close < v_pos_section_a and v_pos_section_a < v_pos_locks) then
    raise exception '0035 postverify: section A''s warning check is not positioned between the v_counterparty fallback resolution and the advisory locks (else_close=%, section_a=%, locks=%)',
      v_pos_else_close, v_pos_section_a, v_pos_locks;
  end if;
  raise notice '0035 postverify OK (3/5): section A''s warning check sits strictly between v_counterparty''s fallback resolution and the advisory locks, so it reads the FINAL v_counterparty value';

  v_pos_return:=position(
    'return clara._finish_op(c.firm,''approve_entry'',p_op_key, jsonb_build_object(''entry_id'',p_entry,''status'',''approved'')'
    in v_src);
  v_pos_return_case:=position(
    'jsonb_build_object(''warnings'',jsonb_build_array(v_no_cp_warning))'
    in v_src);
  if v_pos_return=0 or v_pos_return_case=0 or v_pos_return_case < v_pos_return then
    raise exception '0035 postverify: the final return does not carry the conditional warnings-array append';
  end if;
  -- The fn name + entry + filing key are what 0035 owns here. The two identity arguments in
  -- between are NOT: 0106 §E replaced their hard-coded nulls with v_obo / v_via_wake_kind, and a
  -- pin that spanned them re-broke this probe for a change it was never about.
  v_pos_audit:=position(
    '''approve_entry'',p_entry, jsonb_build_object(''filing'''
    in v_src);
  v_pos_audit_case:=position(
    'jsonb_build_object(''warning'',v_no_cp_warning)'
    in v_src);
  if v_pos_audit=0 or v_pos_audit_case=0 or v_pos_audit_case < v_pos_audit
     or v_pos_audit_case > v_pos_return then
    raise exception '0035 postverify: the audit call does not carry the conditional warning-key append in the right place';
  end if;
  raise notice '0035 postverify OK (4/5): the final return and the audit call both carry the conditional warning append, additive only';

  v_leak_old_count:=0; v_leak_new_count:=0;
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.oid <> v_target_oid order by p.proname loop
    begin
      v_scan_src := pg_get_functiondef(r.oid);
    exception when others then
      raise notice '0035 postverify: SKIP % (functiondef error: %)', r.proname, sqlerrm;
      continue;
    end;
    if v_scan_src ilike '%revise the draft%' then
      v_leak_old_count:=v_leak_old_count+1;
      raise notice '0035 postverify: LEAK (old phrase) -- % still carries the old remedy phrase', r.proname;
    end if;
    if v_scan_src ilike '%the new draft will resolve against the current counterparty landscape%' then
      v_leak_new_count:=v_leak_new_count+1;
      raise notice '0035 postverify: LEAK (new phrase) -- % unexpectedly also carries the new remedy phrase', r.proname;
    end if;
  end loop;
  if v_leak_old_count <> 0 then
    raise exception '0035 postverify: % other live function(s) still carry the old remedy phrase -- section B is not exhaustive', v_leak_old_count;
  end if;
  if v_leak_new_count <> 0 then
    raise exception '0035 postverify: % other live function(s) unexpectedly carry the new remedy phrase -- clara._approve_entry_core is not the sole carrier', v_leak_new_count;
  end if;
  raise notice '0035 postverify OK (5/5): whole-schema scan confirms clara._approve_entry_core is the ONLY live function carrying EITHER the old or the new CLR23 remedy phrase';
  raise notice '0035 postverify: ALL STRUCTURAL/CATALOG PROBES PASSED -- behavioral warning/refusal correctness remains the rig suite''s job (tests/x35-drafting-trio.test.mjs)';
end
$post$;
