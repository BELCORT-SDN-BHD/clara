-- 0282_retire_adjustment_template_doors -- #927 (riders wave 3, lane 05), step 1 of 3 of the
-- 0045 recurring-adjustment template lane's retirement (#788 owner ruling 2026-09-18: "retire
-- the 0045 recurring-adjustment template lane fully"; the hosted census the same day found ZERO
-- rows in clara.adjustment_templates, of any status -- restated at 0281's own header). CLOSES
-- the three doors that could ever CREATE or ADVANCE a template's schedule --
-- `clara.propose_adjustment_template`, `clara.sign_adjustment_template` and
-- `clara.run_adjustment_manual` -- with ONE typed refusal apiece, naming the retirement and
-- pointing at the surviving lane (Client -> Plans, `clara.create_accounting_plan`). #928 removes
-- the daily runtime sweep next (the only OTHER way a period could ever fall due); #929 drops the
-- plan-overlap advisory's template arm and rewrites the product record once nothing can ever
-- create a template again.
-- =====================================================================================
-- WHAT STAYS EXACTLY AS IT IS, AND WHY THIS IS THREE `create or replace function` STATEMENTS
-- AND NOTHING ELSE. `retire_adjustment_template` (the correction lane's own terminal act),
-- `reverse_adjustment_pair` / `approve_pair_reversal` / `cancel_pair_reversal` (the reversal-pair
-- machine) and every READ of the three 0045 relations (`clara._adj_correction_door`,
-- `list_adjustment_templates`, `list_adjustment_runs`, `get_adjustment_run`, and the plain
-- `clara.adjustment_templates` / `clara.adjustment_runs` / `clara.adjustment_pair_reversals`
-- table reads `apps/web/lib/registers/adjustments.ts` makes directly) are D6's "historical
-- receipts and in-flight legacy visibility are retained" -- a firm that ran this lane before
-- today must still be able to read its history, correct a mis-booked figure and finish a reversal
-- already in flight. None of those bodies is touched, recut or re-granted by this file; §0 pins
-- every one of them by its LIVE pre-image, measured on THIS rig now, and §T re-reads every pin
-- unchanged. `run_adjustment_occurrence` (the machine-lane scheduled poster) and
-- `adjustment_run_due` (the due-oracle read both lanes share) are ALSO untouched here -- #928,
-- not this file, retires the runtime belt that is their only remaining caller; until it lands the
-- door itself must keep working exactly as it does today, or a mid-flight sweep tick would be a
-- silent behaviour change this file did not own.
--
-- THE THREE CLOSED DOORS KEEP THEIR EXACT SIGNATURES, OWNER, SECURITY DEFINER FLAG, search_path
-- AND ACL. `create or replace function` on the SAME argument list is what makes this both
-- (a) invisible to every existing PostgREST route and named-argument caller (the door still
-- resolves; it simply always refuses now) and (b) naturally idempotent DDL, so a #957
-- `CLARA_MIGRATION_REDO` of this file converges to the same three bodies whether it is a fresh
-- apply or a re-run over its own prior output -- §0 recognises both starting shapes by the
-- refusal token itself, the same idiom 0281's header states in full.
--
-- ONE REASON, ONE MESSAGE, ALL THREE DOORS: `errcode = 'CLR10'`, `detail.reason =
-- 'adjustment_template_lane_retired'` -- the SAME token on all three, because a caller does not
-- need three different words for "this door is gone"; the message text alone varies per door (it
-- names the specific verb that no longer exists) and every message ends by pointing at the
-- successor (`create an accounting plan instead -- Client -> Plans`). The three x42.t1/t2/t3
-- cells in `x42-adjustments.test.mjs` are "a cell per closed door" naming this reason.
--
-- =====================================================================================
-- THE PRESTATE GUARD THAT MAKES THIS FILE SAFE TO APPLY AT ALL: NO NON-RETIRED TEMPLATE MAY
-- EXIST WHEN IT LANDS. A `proposed` row could never be signed again (sign is closing in the same
-- transaction); a `live` row could never run another occurrence by hand again (manual-run is
-- closing too) and, once #928 lands, never again at all -- either shape would be this file
-- silently orphaning a schedule a firm is still relying on. A `retired` row is already terminal
-- and is exactly the historical shape D6 keeps readable, so it is the ONLY status this prestate
-- admits. Measured on clara_l05 before this file was authored: ten LEFTOVER `status='live'` rows
-- from #909's own rig fixtures (`plan-overlap-sibling-arm.test.mjs`'s "Rig combo template" /
-- "Rig overlap template" cells, born 2026-09-20, never cleaned up because that file's own fixture
-- INSERTs directly and no cell retires them). Retired by hand through the still-open
-- `retire_adjustment_template` door before this file was written (ten rows, reason "#927 lane
-- cleanup: retire stray #909 rig fixtures ..."), which is the intended remedy this guard expects
-- of any lane that meets it non-empty -- never a silent DELETE (retire, never delete, is this
-- table's own law throughout 0045). A from-scratch chain carries no `adjustment_templates` row at
-- all, so the guard is vacuously satisfied there; this lane's own db needed the one-time cleanup
-- because it is not from-scratch.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §0  PRESTATE. Pin every body this file recuts (redo-tolerant) or merely stands beside
--     (unconditional, non-regression) by its LIVE pre-image sha256(prosrc), measured off
--     pg_proc on THIS rig now (281 migrations, 0001->0281, clara_l05, 2026-09-20/21) -- never
--     transcribed from an older migration's own header. Then refuse a non-retired template.
-- =====================================================================================
do $w927_pre$
declare
  v_sha text; v_prosrc text; v_n int;
  v_propose_old boolean; v_sign_old boolean; v_manual_old boolean;
begin
  if to_regclass('clara.adjustment_templates') is null
     or to_regprocedure('clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)') is null
     or to_regprocedure('clara.sign_adjustment_template(uuid,uuid,text)') is null
     or to_regprocedure('clara.run_adjustment_manual(uuid,uuid,date,date,text)') is null then
    raise exception '#927 prestate: the 0045 adjustment-template lane (table + the three doors this file closes) is absent -- 0045/0140 must apply first'
      using errcode = 'CLR10';
  end if;

  -- THE THREE DOORS THIS FILE RECUTS -- redo-tolerant, exactly 0281's own idiom: EITHER the
  -- measured pre-#927 pre-image (a fresh apply) OR this file's own prior output (a #957 redo),
  -- recognised by the refusal token; anything else is refused rather than guessed past.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_prosrc, v_sha
    from pg_proc p where p.oid = 'clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)'::regprocedure;
  if v_sha = '1319ba44fe95000588c117b447125ed93751eb85884997a8f34ddc5e6e3c7cd5' then
    v_propose_old := true;
  elsif position('adjustment_template_lane_retired' in v_prosrc) > 0 then
    v_propose_old := false;
  else
    raise exception '#927 prestate: clara.propose_adjustment_template is neither at its measured pre-#927 pre-image (sha %) nor recognisably this file''s own prior output -- refusing rather than guessing which body this is', v_sha
      using errcode = 'CLR10';
  end if;

  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_prosrc, v_sha
    from pg_proc p where p.oid = 'clara.sign_adjustment_template(uuid,uuid,text)'::regprocedure;
  if v_sha = 'e7ace43b004328179f061be342aa1edb95766990688cff582e79e947388c2dff' then
    v_sign_old := true;
  elsif position('adjustment_template_lane_retired' in v_prosrc) > 0 then
    v_sign_old := false;
  else
    raise exception '#927 prestate: clara.sign_adjustment_template is neither at its measured pre-#927 pre-image (sha %) nor recognisably this file''s own prior output -- refusing rather than guessing which body this is', v_sha
      using errcode = 'CLR10';
  end if;

  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_prosrc, v_sha
    from pg_proc p where p.oid = 'clara.run_adjustment_manual(uuid,uuid,date,date,text)'::regprocedure;
  if v_sha = '45c4546994c72db572645743afca2900f7eacf9b48da134168a64b9715f1edc6' then
    v_manual_old := true;
  elsif position('adjustment_template_lane_retired' in v_prosrc) > 0 then
    v_manual_old := false;
  else
    raise exception '#927 prestate: clara.run_adjustment_manual is neither at its measured pre-#927 pre-image (sha %) nor recognisably this file''s own prior output -- refusing rather than guessing which body this is', v_sha
      using errcode = 'CLR10';
  end if;

  if v_propose_old is distinct from v_sign_old or v_propose_old is distinct from v_manual_old then
    raise exception '#927 prestate: the three doors this file recuts are in MIXED states (propose old=%, sign old=%, manual old=%) -- a partial prior apply, which this file refuses to build on'
      , v_propose_old, v_sign_old, v_manual_old using errcode = 'CLR10';
  end if;

  -- NON-REGRESSION, UNCONDITIONAL (this file never touches any of the following): the two
  -- 0193-pinned 0045 doors this file does NOT close, the correction door, the reversal-pair
  -- machine, the three reads, and the OLD propose door's own former callee (still the agent-lane
  -- prepayment limb's entrance, 0140:1232 -- untouched, and still reachable through
  -- clara._agent_prepayment_schedule_core, which this file does not go near).
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.retire_adjustment_template(uuid,uuid,text,text)'::regprocedure)
     is distinct from '66a113f25326aeb8e66f090d5a58f1a3ef5f7a41cbd794321b4d5ae0007d8b45' then
    raise exception '#927 prestate: clara.retire_adjustment_template has moved from its measured pre-image -- this file asserts it is UNTOUCHED' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.run_adjustment_occurrence(uuid,uuid,date,date,text)'::regprocedure)
     is distinct from 'd61707e27aa431cc3b01727ab94a29c7026528e1813fac65bb8a2c21c5a8b252' then
    raise exception '#927 prestate: clara.run_adjustment_occurrence has moved from its measured pre-image -- this file asserts it is UNTOUCHED (the runtime belt is #928''s, not this file''s)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.adjustment_run_due(uuid)'::regprocedure)
     is distinct from 'f01e9e403a733b7320218de563115cf4c8df97f90f31527c27226e8f8d126052' then
    raise exception '#927 prestate: clara.adjustment_run_due has moved from its measured pre-image -- this file asserts it is UNTOUCHED' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)'::regprocedure)
     is distinct from 'b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810' then
    raise exception '#927 prestate: clara._propose_adjustment_template_core has moved from its measured pre-image -- this file asserts it is UNTOUCHED (the agent-lane prepayment limb''s own entrance, 0140)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara._adj_correction_door(uuid)'::regprocedure)
     is distinct from '5b22b62819fe01007fa0d389efa5751825c0374690a28e3eb0a3805197793e52' then
    raise exception '#927 prestate: clara._adj_correction_door has moved from its measured pre-image -- this file asserts the correction door is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.reverse_adjustment_pair(uuid,uuid,text,text)'::regprocedure)
     is distinct from 'f167cab16f5c77a4ec5f3d42f0ff489dcb41c1f4c10b3c6e95452004965f8580' then
    raise exception '#927 prestate: clara.reverse_adjustment_pair has moved from its measured pre-image -- this file asserts the reversal-pair door is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.approve_pair_reversal(uuid,uuid,text,text)'::regprocedure)
     is distinct from '5fa46ad5ca2ab11f3a7e647e4bb56791c70dc39d2a178f2f9358b3538ae50d9d' then
    raise exception '#927 prestate: clara.approve_pair_reversal has moved from its measured pre-image -- this file asserts it is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.cancel_pair_reversal(uuid,uuid,text,text)'::regprocedure)
     is distinct from 'ad7e0fc6ebeedb0f56caddab56b2899f1a232d041ec232351d801dad54881192' then
    raise exception '#927 prestate: clara.cancel_pair_reversal has moved from its measured pre-image -- this file asserts it is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.list_adjustment_templates(uuid)'::regprocedure)
     is distinct from '97cabd66390478e92a3b11b2349e93dd906d0abf3c7be927b6d597b419f875ff' then
    raise exception '#927 prestate: clara.list_adjustment_templates has moved from its measured pre-image -- this file asserts every read is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.list_adjustment_runs(uuid)'::regprocedure)
     is distinct from '197872e84d54a51bd36b3f523c812d626858fc9af51e2d8f8c929f4cc63fc93f' then
    raise exception '#927 prestate: clara.list_adjustment_runs has moved from its measured pre-image -- this file asserts every read is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.get_adjustment_run(uuid)'::regprocedure)
     is distinct from 'ff75553cab62a787e03ddd59a11f98843088b086ced55261b30693105c758ac3' then
    raise exception '#927 prestate: clara.get_adjustment_run has moved from its measured pre-image -- this file asserts every read is UNTOUCHED (D6)' using errcode = 'CLR10';
  end if;

  -- THE LIVE-TEMPLATE GUARD (this file's own header, "safe to apply at all"). 'retired' is the
  -- only admitted status; a from-scratch chain carries no row at all and passes vacuously.
  select count(*)::int into v_n from clara.adjustment_templates where status <> 'retired';
  if v_n <> 0 then
    raise exception '#927 prestate: % clara.adjustment_templates row(s) are not retired -- this file refuses to close propose/sign/run_adjustment_manual while a proposed or live template could still be orphaned; retire every such row (clara.retire_adjustment_template, still open) before applying', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#927 prestate: clean -- propose_adjustment_template/sign_adjustment_template/run_adjustment_manual are all %, every 0045 body this file does not touch is byte-identical to its measured pre-image, and zero clara.adjustment_templates rows are non-retired.',
    case when v_propose_old then 'at their measured pre-#927 pre-image (a fresh apply)' else 'already this file''s own prior output (a #957 redo)' end;
end
$w927_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE CHANGE. Three `create or replace function` statements on their EXACT existing
--     signatures -- no new relation, no new grant, no DROP. Each raises the SAME typed
--     refusal (ABI-shaped: one errcode, one detail.reason) before touching any argument,
--     any table or `_human_ctx` -- the door is closed to every caller alike, not merely
--     re-floored, so no role check is left to explain WHY it is closed.
-- =====================================================================================

create or replace function clara.propose_adjustment_template(p_client uuid, p_name text, p_cadence text,
    p_start_date date, p_end_date date, p_auto_reverse boolean, p_lines jsonb,
    p_memo_template text, p_op_key text, p_replaces uuid default null, p_schedule jsonb default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'clara.propose_adjustment_template is retired (#927): the recurring-adjustment template lane no longer accepts a new template; create an accounting plan instead (Client -> Plans)'
    using errcode = 'CLR10',
      detail = '{"reason":"adjustment_template_lane_retired"}';
end $$;
revoke all on function clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb) from public;

create or replace function clara.sign_adjustment_template(p_client uuid, p_template uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'clara.sign_adjustment_template is retired (#927): the recurring-adjustment template lane no longer signs a template live; create an accounting plan instead (Client -> Plans)'
    using errcode = 'CLR10',
      detail = '{"reason":"adjustment_template_lane_retired"}';
end $$;
revoke all on function clara.sign_adjustment_template(uuid,uuid,text) from public;

create or replace function clara.run_adjustment_manual(p_client uuid, p_template uuid,
    p_period_start date, p_period_end date, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'clara.run_adjustment_manual is retired (#927): the recurring-adjustment template lane no longer runs an occurrence by hand; create an accounting plan instead (Client -> Plans)'
    using errcode = 'CLR10',
      detail = '{"reason":"adjustment_template_lane_retired"}';
end $$;
revoke all on function clara.run_adjustment_manual(uuid,uuid,date,date,text) from public;

reset role;

-- =====================================================================================
-- §T  TAIL. Every claim re-READ from the live catalog, plus a BEHAVIOURAL proof (the three
--     doors actually called, not merely their prosrc inspected) -- and the same non-regression
--     census as §0, so a redo cannot silently widen what this file touches.
-- =====================================================================================
do $w927_tail$
declare
  v_src text; v_sha text; v_acl text; v_owner text; v_secdef bool; v_vol text; v_cfg text;
  v_sqlstate text; v_detail text; v_reason text; v_raised boolean;
begin
  -- (T.1) THE THREE CLOSED DOORS: the token landed, the posture (owner, SECURITY DEFINER,
  -- search_path, ACL) is EXACTLY what it was before this file ran.
  foreach v_sha in array array[
      'clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)',
      'clara.sign_adjustment_template(uuid,uuid,text)',
      'clara.run_adjustment_manual(uuid,uuid,date,date,text)']
  loop
    select p.prosrc, pg_get_userbyid(p.proowner), p.prosecdef,
           coalesce(array_to_string(p.proconfig,','),'<none>'), coalesce(p.proacl::text,'(null)')
      into v_src, v_owner, v_secdef, v_cfg, v_acl
      from pg_proc p where p.oid = v_sha::regprocedure;
    if position('adjustment_template_lane_retired' in v_src) = 0 then
      raise exception '#927 tail: % is missing the retirement token in its body', v_sha using errcode='CLR10';
    end if;
    if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
      raise exception '#927 tail: % owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_sha, v_owner, v_secdef using errcode='CLR10';
    end if;
    if v_cfg <> 'search_path=clara, pg_temp' then
      raise exception '#927 tail: %''s search_path moved (%)', v_sha, v_cfg using errcode='CLR10';
    end if;
    if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
      raise exception '#927 tail: %''s ACL moved (%) -- it must stay exactly clara_authenticated-only, unwidened and unnarrowed by closing the door', v_sha, v_acl using errcode='CLR10';
    end if;
  end loop;

  -- (T.2) THE BEHAVIOURAL PROOF: call each closed door for real (owner role, so no
  -- _human_ctx/PostgREST session is needed) and catch its own refusal by SQLSTATE.
  v_raised := false;
  begin
    perform clara.propose_adjustment_template(gen_random_uuid(), 't927', 'monthly',
      current_date, null, false, '[{"account_code":"1","debit_cents":1,"credit_cents":0}]'::jsonb,
      'm', 't927op', null, null);
  exception when sqlstate 'CLR10' then
    v_raised := true;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  if not v_raised then
    raise exception '#927 tail: clara.propose_adjustment_template did not raise CLR10 when called' using errcode='CLR10';
  end if;
  v_reason := (nullif(v_detail,'')::jsonb) ->> 'reason';
  if v_reason is distinct from 'adjustment_template_lane_retired' then
    raise exception '#927 tail: clara.propose_adjustment_template raised CLR10 but detail.reason was % (want adjustment_template_lane_retired)', v_reason using errcode='CLR10';
  end if;

  v_raised := false;
  begin
    perform clara.sign_adjustment_template(gen_random_uuid(), gen_random_uuid(), 't927op');
  exception when sqlstate 'CLR10' then
    v_raised := true;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  if not v_raised then
    raise exception '#927 tail: clara.sign_adjustment_template did not raise CLR10 when called' using errcode='CLR10';
  end if;
  v_reason := (nullif(v_detail,'')::jsonb) ->> 'reason';
  if v_reason is distinct from 'adjustment_template_lane_retired' then
    raise exception '#927 tail: clara.sign_adjustment_template raised CLR10 but detail.reason was % (want adjustment_template_lane_retired)', v_reason using errcode='CLR10';
  end if;

  v_raised := false;
  begin
    perform clara.run_adjustment_manual(gen_random_uuid(), gen_random_uuid(), current_date, current_date, 't927op');
  exception when sqlstate 'CLR10' then
    v_raised := true;
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  if not v_raised then
    raise exception '#927 tail: clara.run_adjustment_manual did not raise CLR10 when called' using errcode='CLR10';
  end if;
  v_reason := (nullif(v_detail,'')::jsonb) ->> 'reason';
  if v_reason is distinct from 'adjustment_template_lane_retired' then
    raise exception '#927 tail: clara.run_adjustment_manual raised CLR10 but detail.reason was % (want adjustment_template_lane_retired)', v_reason using errcode='CLR10';
  end if;

  -- (T.3) NON-REGRESSION, RE-READ: the same eleven bodies §0 pinned, still byte-identical.
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.retire_adjustment_template(uuid,uuid,text,text)'::regprocedure)
     is distinct from '66a113f25326aeb8e66f090d5a58f1a3ef5f7a41cbd794321b4d5ae0007d8b45' then
    raise exception '#927 tail: clara.retire_adjustment_template MOVED while this file applied' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.run_adjustment_occurrence(uuid,uuid,date,date,text)'::regprocedure)
     is distinct from 'd61707e27aa431cc3b01727ab94a29c7026528e1813fac65bb8a2c21c5a8b252' then
    raise exception '#927 tail: clara.run_adjustment_occurrence MOVED while this file applied' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.adjustment_run_due(uuid)'::regprocedure)
     is distinct from 'f01e9e403a733b7320218de563115cf4c8df97f90f31527c27226e8f8d126052' then
    raise exception '#927 tail: clara.adjustment_run_due MOVED while this file applied' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)'::regprocedure)
     is distinct from 'b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810' then
    raise exception '#927 tail: clara._propose_adjustment_template_core MOVED while this file applied' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara._adj_correction_door(uuid)'::regprocedure)
     is distinct from '5b22b62819fe01007fa0d389efa5751825c0374690a28e3eb0a3805197793e52' then
    raise exception '#927 tail: clara._adj_correction_door MOVED -- D6''s correction door must stay byte-unchanged' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.reverse_adjustment_pair(uuid,uuid,text,text)'::regprocedure)
     is distinct from 'f167cab16f5c77a4ec5f3d42f0ff489dcb41c1f4c10b3c6e95452004965f8580' then
    raise exception '#927 tail: clara.reverse_adjustment_pair MOVED -- D6''s reversal-pair door must stay byte-unchanged' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.approve_pair_reversal(uuid,uuid,text,text)'::regprocedure)
     is distinct from '5fa46ad5ca2ab11f3a7e647e4bb56791c70dc39d2a178f2f9358b3538ae50d9d' then
    raise exception '#927 tail: clara.approve_pair_reversal MOVED -- D6''s reversal-pair door must stay byte-unchanged' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.cancel_pair_reversal(uuid,uuid,text,text)'::regprocedure)
     is distinct from 'ad7e0fc6ebeedb0f56caddab56b2899f1a232d041ec232351d801dad54881192' then
    raise exception '#927 tail: clara.cancel_pair_reversal MOVED -- D6''s reversal-pair door must stay byte-unchanged' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.list_adjustment_templates(uuid)'::regprocedure)
     is distinct from '97cabd66390478e92a3b11b2349e93dd906d0abf3c7be927b6d597b419f875ff' then
    raise exception '#927 tail: clara.list_adjustment_templates MOVED -- D6''s reads must stay byte-unchanged' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.list_adjustment_runs(uuid)'::regprocedure)
     is distinct from '197872e84d54a51bd36b3f523c812d626858fc9af51e2d8f8c929f4cc63fc93f' then
    raise exception '#927 tail: clara.list_adjustment_runs MOVED -- D6''s reads must stay byte-unchanged' using errcode='CLR10';
  end if;
  if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
       where p.oid = 'clara.get_adjustment_run(uuid)'::regprocedure)
     is distinct from 'ff75553cab62a787e03ddd59a11f98843088b086ced55261b30693105c758ac3' then
    raise exception '#927 tail: clara.get_adjustment_run MOVED -- D6''s reads must stay byte-unchanged' using errcode='CLR10';
  end if;

  raise notice '#927 tail: OK -- clara.propose_adjustment_template / clara.sign_adjustment_template / clara.run_adjustment_manual each raise CLR10 detail.reason=adjustment_template_lane_retired on a real call, keep their exact pre-#927 owner/SECURITY DEFINER/search_path/ACL, and every 0045 body this file does not touch (retire_adjustment_template, run_adjustment_occurrence, adjustment_run_due, _propose_adjustment_template_core, the correction door, the reversal-pair machine, and the three reads) is byte-identical to its measured pre-image.';
end
$w927_tail$;
