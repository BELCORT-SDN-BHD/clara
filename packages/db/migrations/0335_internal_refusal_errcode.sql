-- 0335_internal_refusal_errcode — #1114 (riders sweep wave, lane 02): ONE ERRCODE MEANT TWO
-- THINGS, AND ONE OF THEM WAS NEVER MEANT TO BE SEEN.
-- =====================================================================================
-- Spec of record: issue #1114's Agent Brief (no owner ruling comment; the brief is the contract).
--
-- THE FINDING, in the ticket's own words: "One errcode currently means two different things
-- depending on which door raised it: an internal, never-render-this wiring failure, and a
-- legitimate, user-actionable business refusal with its own remedy and panel."
--
-- BOTH HALVES ARE REAL AND BOTH ARE THIS LANE'S:
--
--   · `prepayment_source_unfit` / axis `prepaid_account_not_enrolled`, raised by the shared roster
--     check inside `clara._prepayment_schedule_core` (0317:1588-1596), and its deferred-revenue
--     twin `deferred_revenue_source_unfit` / `deferred_account_not_enrolled` (0317:2127-2134).
--     Each carries `reason_text`, the account code, `remedy` (`clara.enrol_prepayment_account`)
--     and `panel` (`client_registers_prepayment_accounts`), and the web already renders it
--     (`apps/web/lib/prepayments/schedule.ts:27`, `apps/web/lib/deferred-revenue/schedule.ts:16`).
--     This is a REFUSAL A PERSON ACTS ON.
--
--   · `invalid_author` on the two on-behalf-of twins, and `prepayment_read_scope_required` /
--     `revenue_recognition_read_scope_required` on the two machine-lane reads. All four doors are
--     `clara_runtime` ONLY and all four nulls are impossible for any correctly wired caller: the
--     run always holds the actor and always holds its own firm/client scope. The estate says so
--     itself, in the successor contracts wave 4 wrote for the chat tools built on these doors —
--     "`invalid_author` (CLR10) → an internal wiring error, never shown: the successor always has
--     the actor" and "`prepayment_read_scope_required` → an internal wiring error, never shown"
--     (docs/plan/active/riders-2026-09-20/reports/wave4-lane04-ticket915.md:359 and :389, carried
--     into CUT-PLAN.md:210 and :215). This is a PROGRAM FAULT.
--
-- WHICH SIDE MOVES, AND WHY IT IS THIS ONE. CLR10 is the estate's `bad-request`
-- (0002_foundation.sql:42) and it is raised 5293 times across the migration set, almost all of
-- them refusals a surface is expected to render. Moving the renderable half would mean re-coding
-- thousands of raises — and would leave the never-shown half sitting on CLR10 beside them, so the
-- ticket's own test ("any code path that branches on the error code first … cannot accidentally
-- treat a real, actionable refusal as an internal error to be swallowed, or vice versa") would
-- still fail. Moving the never-shown half is four raises and PARTITIONS the two meanings:
--
--     CLR10  — a bad request a surface may render. Unchanged, everywhere.
--     CLR44  — a caller-contract violation: a `clara_runtime`-only door was handed a null its own
--              caller's contract guarantees. Never rendered; there is no remedy to offer.
--
-- THE AUDIT (the ticket's AC2). There is no errcode catalog FILE in this estate: CLR10's meaning
-- lives in 0002's header comment and in packages/db/README.md prose, and the code-side catalogs are
-- `packages/db/tests/rig-helpers.mjs` (CLR01-CLR12) and `packages/db/tests/work-journal-fixtures.mjs`
-- (a subset). Every CLR10 raise in packages/db/migrations was grepped and read by reason token; the
-- four moved here are the ONLY ones the estate's own prose calls never-shown or internal. The
-- census, the grep that produced it and the rule for a future raise are written up in this file's
-- README section. `invalid_op_key` deliberately STAYS on CLR10: human doors all over the estate
-- raise it for a person's own malformed call, so it is not a caller-contract class.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not touch a reason, an axis or a detail payload. Every token, every field and every
--     sentence is byte-identical; only the SQLSTATE moves. The ticket puts payload reshaping and
--     new reasons out of scope, and the tail re-measures the four payloads to prove it.
--   · It does not touch `clara._prepayment_schedule_core` or `clara._revenue_recognition_core`.
--     The renderable refusals live there and they keep CLR10; the tail asserts it, so the two
--     bodies riders sweep lane 02 recuts NEXT (#1077) are left exactly as 0317 wrote them.
--   · It mints no function, no relation, no grant and no role. `create or replace function`
--     preserves the ACL, and the tail re-measures all four ACLs against 0307/0308/0317's posture.
--   · It adds no web surface. The web keys on `reason` and `axis`, never on the errcode
--     (`apps/web/lib/prepayments/schedule.ts:27`, `apps/web/lib/deferred-revenue/schedule.ts:16`
--     and `:38`), and none of the four moved refusals is reachable from a browser at all.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md "Redo"): the whole file is four
-- `create or replace function` statements between a marker-tolerant prestate and a tail that reads
-- the live catalog. A redo over its own effects re-installs identical text.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0335_pre$
declare
  v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE FOUR BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG
  -- (riders lane 02 database `clara_l05`, 309 files, max 0318_knowledge_fye_pair_applicability),
  -- never copied from an older migration's header. Each admits exactly TWO pre-images of its own —
  -- its measured live sha, or a body that already carries this file's own `0335` attribution — so
  -- a redo is admitted and real drift still refuses BY NAME. 0317's own idiom, line for line.
  v_recut text[][] := array[
    ['clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)',
     '230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a'],
    ['clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)',
     '2344bc09dddbe5f38a324ad3ac2ef22ceb28b5940b4521b4421ae8ac73cfbe5e'],
    ['clara.read_prepayment_source_for(uuid,uuid,uuid)',
     '6c7ed11e97a7001ee24eedf53d53d2b61cb0e2c9539ef040e22201b6a99e84c7'],
    ['clara.read_revenue_recognition_source_for(uuid,uuid,uuid)',
     '9701ddda2a73f4f635ca32e356403ad27dd2aed91a1c0fbfbd4992b84ebc1753']
  ];
  -- …AND THE TWO SHARED CORES THIS FILE MUST NOT MOVE. Both create doors tail-call one of them and
  -- the renderable refusals this ticket is ABOUT are raised inside them, so a core that drifted
  -- under this file would change which side of the new partition a refusal lands on without
  -- changing a line here. Pinned exactly; riders sweep lane 02's NEXT ticket (#1077) recuts them
  -- from these same post-images.
  v_keep text[][] := array[
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     '87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a'],
    ['clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
     '28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd']
  ];
begin
  -- 1 · THE FOUR RECUT BODIES, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0335 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0335' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0335 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE TWO SHARED CORES ARE EXACTLY WHAT THE FOUR DOORS WERE WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '0335 prestate: % moved (expected %, live %)',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  -- 3 · CLR44 IS FREE. The whole point of this file is that the new code carries ONE meaning, so a
  --     body already raising it before this file runs would be a collision minted somewhere else.
  --     A redo is admitted: by then the four bodies below are this file's own.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'clara' and p.prosrc ~ 'errcode\s*=\s*''CLR44'''
                and p.oid::regprocedure::text <> all (array[
                      'clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)',
                      'clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)',
                      'clara.read_prepayment_source_for(uuid,uuid,uuid)',
                      'clara.read_revenue_recognition_source_for(uuid,uuid,uuid)'])) then
    raise exception '0335 prestate: CLR44 is already raised by a body outside this file''s four'
      using errcode='CLR10';
  end if;

  -- 4 · THE RENDERABLE HALF IS WHERE THIS FILE THINKS IT IS. The two roster refusals must be
  --     raised, under CLR10, inside the two shared cores — not in the doors below. If one had
  --     moved into a door, recutting that door would silently re-code a refusal the web renders.
  if (select count(*) from pg_proc p
       where p.oid = 'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'::regprocedure
         and p.prosrc like '%prepayment_source_unfit%' and p.prosrc like '%prepaid_account_not_enrolled%') <> 1 then
    raise exception '0335 prestate: the prepayment roster refusal is not in the shared core'
      using errcode='CLR10';
  end if;
  if (select count(*) from pg_proc p
       where p.oid = 'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure
         and p.prosrc like '%deferred_revenue_source_unfit%' and p.prosrc like '%deferred_account_not_enrolled%') <> 1 then
    raise exception '0335 prestate: the deferred-revenue roster refusal is not in the shared core'
      using errcode='CLR10';
  end if;

  raise notice '0335 prestate OK — % FIRST, % REDO — %', v_first, v_redo, v_modes;
end $c0335_pre$;

-- =====================================================================================
-- §A — clara.create_prepayment_schedule_for (0307 §D). VERBATIM except the null-author SQLSTATE.
-- =====================================================================================
create or replace function clara.create_prepayment_schedule_for(
    p_client uuid, p_author uuid, p_source_entry uuid, p_expense_account text,
    p_expense_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $c0335_cpsf$
declare v_firm uuid; v_client_status text; v_role text; v_member_status text;
begin
  -- #915 — THE FOUR WALLS THIS ENTRANCE OWNS. Everything after them is the shared core, so a rule
  -- that is not about WHO is calling can never be answered differently here than at the human door.
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating a prepayment schedule requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- A NULL AUTHOR IS ITS OWN REFUSAL, not a `client_not_found` in disguise: "no human was named"
  -- and "the human named is nobody here" are different mistakes, and only the first one is the
  -- caller's own shape. It cannot leak anything — it is answered before the client is read.
  -- #1114 [0335] — AND THE CODE IS CLR44, NOT CLR10. The only caller of this door is a
  -- `clara_runtime` body that always holds the actor (the successor contract says so:
  -- reports/wave4-lane04-ticket915.md line 359, "an internal wiring error, never shown"), so a
  -- null here is the calling PROGRAM's own fault. CLR10 is the code a surface renders — the
  -- roster's `prepayment_source_unfit` carries a remedy and a panel under it — and a generic
  -- handler that branched on the code alone could not tell the two apart while they shared one.
  if p_author is null then
    raise exception 'an on-behalf-of configuration names the human it acts for' using errcode='CLR44',
      detail='{"reason":"invalid_author","field":"author","constraint":"present"}';
  end if;
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the human this configuration acts for is no longer an active member of this firm'
      using errcode='CLR04',
        detail='{"reason":"authority_lost","field":"author"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'configuring a prepayment schedule requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  return clara._prepayment_schedule_core(p_firm => v_firm, p_client => p_client,
    p_actor => p_author, p_lane => 'obo', p_source_entry => p_source_entry,
    p_expense_account => p_expense_account, p_expense_basis => p_expense_basis,
    p_purpose => p_purpose, p_authority_ref => p_authority_ref, p_op_key => p_op_key);
end $c0335_cpsf$;

-- =====================================================================================
-- §B — clara.create_revenue_recognition_schedule_for (0308 §E2). VERBATIM except the same wall.
-- =====================================================================================
create or replace function clara.create_revenue_recognition_schedule_for(
  p_client uuid, p_author uuid, p_source_entry uuid, p_revenue_account text,
  p_revenue_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text,
  p_pattern text default 'straight_line')
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $c0335_crrsf$
declare v_firm uuid; v_client_status text; v_role text; v_member_status text;
begin
  -- #941 — THE FOUR WALLS THIS ENTRANCE OWNS. Everything after them is the shared core.
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'configuring a revenue recognition schedule requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- A NULL AUTHOR IS ITS OWN REFUSAL, not a `client_not_found` in disguise: "no human was named"
  -- and "the human named is nobody here" are different mistakes, and only the first one is the
  -- caller's own shape. It cannot leak anything — it is answered before the client is read.
  -- #1114 [0335] — AND THE CODE IS CLR44, NOT CLR10. The only caller of this door is a
  -- `clara_runtime` body that always holds the actor (the successor contract says so:
  -- reports/wave4-lane04-ticket915.md line 359, "an internal wiring error, never shown"), so a
  -- null here is the calling PROGRAM's own fault. CLR10 is the code a surface renders — the
  -- roster's `prepayment_source_unfit` carries a remedy and a panel under it — and a generic
  -- handler that branched on the code alone could not tell the two apart while they shared one.
  if p_author is null then
    raise exception 'an on-behalf-of configuration names the human it acts for' using errcode='CLR44',
      detail='{"reason":"invalid_author","field":"author","constraint":"present"}';
  end if;
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the human this configuration acts for is no longer an active member of this firm'
      using errcode='CLR04',
        detail='{"reason":"authority_lost","field":"author"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'configuring a revenue recognition schedule requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new revenue recognition schedule'
      using errcode='CLR10', detail='{"reason":"client_inactive"}';
  end if;

  return clara._revenue_recognition_core(p_firm => v_firm, p_client => p_client,
    p_actor => p_author, p_lane => 'obo', p_source_entry => p_source_entry,
    p_revenue_account => p_revenue_account, p_revenue_basis => p_revenue_basis,
    p_purpose => p_purpose, p_authority_ref => p_authority_ref, p_op_key => p_op_key,
    p_pattern => p_pattern);
end $c0335_crrsf$;

-- =====================================================================================
-- §C — clara.read_prepayment_source_for (0317's cut). VERBATIM except the scope SQLSTATE.
-- =====================================================================================
create or replace function clara.read_prepayment_source_for(p_firm uuid, p_client uuid, p_source_entry uuid)
returns jsonb language plpgsql stable security definer
set search_path = clara, pg_temp as $c0335_rpsf$
declare
  -- SCALARS, NOT RECORDS, and the reason is a defect this file met on the rig: a plpgsql `record`
  -- that no `select into` ever reaches raises `record "v_sp" is not assigned yet` the moment a
  -- field is read — so a memo-only recognition (no document, hence no document-carrier select)
  -- would make the read RAISE instead of reporting the absence it exists to report. Scalars start
  -- NULL, which is exactly what "nothing recorded" means here.
  v_entry record; v_legs int;
  v_leg_code text; v_leg_cents bigint;
  v_sp_id uuid; v_sp_start date; v_sp_end date; v_sp_kind text; v_sp_basis text;
  v_st_id uuid; v_st_start date; v_st_end date; v_st_reason text;
  v_sched_id uuid; v_sched_plan uuid; v_sched_source text;
  v_term jsonb;
begin
  -- #1114 [0335] — CLR44, THE CALLER-CONTRACT CLASS. This read is `clara_runtime` ONLY and
  -- its scope is three explicit arguments the run always holds; a null is a mis-wired caller,
  -- never a person's mistake, and the successor contract already says it is never shown
  -- (reports/wave4-lane04-ticket915.md line 389). CLR10 stays the code of a refusal a
  -- surface renders, so the two can no longer be confused by a handler reading the code.
  if p_firm is null or p_client is null or p_source_entry is null then
    raise exception 'the runtime prepayment-source read names firm, client and source entry'
      using errcode='CLR44', detail='{"reason":"prepayment_read_scope_required"}';
  end if;
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'prepayment source entry not found in your firm' using errcode='CLR11',
      detail='{"reason":"prepayment_source_not_found"}';
  end if;

  -- THE PREPAID LEG, by the door's own predicate: exactly one DEBITED ASSET line. Zero or many is
  -- reported as a count rather than guessed at, for the same reason the door refuses it.
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  if v_legs = 1 then
    select jl.account_code, jl.debit_cents into v_leg_code, v_leg_cents
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  end if;

  -- THE RECORDED TERM. The document carrier first, because a document-bound recognition is the
  -- lane 0140 built; then #939's person-stated carrier. A recognition that binds a document does
  -- not carry a stated term at all (0305 refuses one), so the two arms cannot both answer.
  if v_entry.document_id is not null then
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis
      into v_sp_id, v_sp_start, v_sp_end, v_sp_kind, v_sp_basis
      from clara.document_service_periods sp
     where sp.document_id = v_entry.document_id and sp.superseded_at is null;
  end if;
  select t.id, t.period_start, t.period_end, t.reason
    into v_st_id, v_st_start, v_st_end, v_st_reason
    from clara.prepayment_stated_terms t
   where t.source_entry_id = p_source_entry and t.superseded_at is null;

  if v_sp_id is not null then
    v_term := jsonb_build_object('source', 'document_service_period',
      'service_period_id', v_sp_id, 'stated_term_id', null,
      'period_start', to_char(v_sp_start,'YYYY-MM-DD'),
      'period_end', to_char(v_sp_end,'YYYY-MM-DD'),
      'basis_kind', v_sp_kind, 'basis_text', v_sp_basis);
  elsif v_st_id is not null then
    v_term := jsonb_build_object('source', 'human_stated',
      'service_period_id', null, 'stated_term_id', v_st_id,
      'period_start', to_char(v_st_start,'YYYY-MM-DD'),
      'period_end', to_char(v_st_end,'YYYY-MM-DD'),
      'basis_kind', 'human_stated', 'basis_text', v_st_reason);
  else
    -- ABSENCE IS REPORTED AS ABSENCE, with the DOOR that fills it — never as an empty term a run
    -- could read as "no term is needed". The remedy named is the human one, because a service
    -- period is human-only by law and no agent path to it exists or ever will.
    v_term := jsonb_build_object('source', null,
      'service_period_id', null, 'stated_term_id', null,
      'period_start', null, 'period_end', null, 'basis_kind', null, 'basis_text', null,
      'remedy', case when v_entry.document_id is not null
                     then 'clara.record_document_service_period'
                     else 'clara.record_prepayment_stated_term' end);
  end if;

  select s.id, s.plan_id, s.term_source into v_sched_id, v_sched_plan, v_sched_source
    from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one

  return jsonb_build_object(
    'status', 'ok', 'firm_id', p_firm, 'client_id', p_client,
    'source_entry_id', p_source_entry,
    'entry', jsonb_build_object('status', v_entry.status, 'document_id', v_entry.document_id,
      'posting_date', to_char(v_entry.posting_date,'YYYY-MM-DD')),
    'prepaid', jsonb_build_object('account_code', v_leg_code,
      'total_cents', v_leg_cents, 'candidate_legs', v_legs),
    'term', v_term,
    'schedule', case when v_sched_id is null then null
                     else jsonb_build_object('schedule_id', v_sched_id, 'plan_id', v_sched_plan,
                            'term_source', v_sched_source) end);
end $c0335_rpsf$;

-- =====================================================================================
-- §D — clara.read_revenue_recognition_source_for (0317's cut). VERBATIM except the same scope.
-- =====================================================================================
create or replace function clara.read_revenue_recognition_source_for(p_firm uuid, p_client uuid, p_source_entry uuid)
returns jsonb language plpgsql stable security definer
set search_path = clara, pg_temp as $c0335_rrsf$
declare
  v_entry record; v_legs int;
  v_leg_code text; v_leg_cents bigint;
  v_sp_id uuid; v_sp_start date; v_sp_end date; v_sp_kind text; v_sp_basis text;
  v_st_id uuid; v_st_start date; v_st_end date; v_st_reason text;
  v_sched_id uuid; v_sched_plan uuid; v_sched_source text;
  v_term jsonb;
begin
  -- #1114 [0335] — CLR44, THE CALLER-CONTRACT CLASS. This read is `clara_runtime` ONLY and
  -- its scope is three explicit arguments the run always holds; a null is a mis-wired caller,
  -- never a person's mistake, and the successor contract already says it is never shown
  -- (reports/wave4-lane04-ticket915.md line 389). CLR10 stays the code of a refusal a
  -- surface renders, so the two can no longer be confused by a handler reading the code.
  if p_firm is null or p_client is null or p_source_entry is null then
    raise exception 'the runtime recognition-source read names firm, client and source entry'
      using errcode='CLR44', detail='{"reason":"revenue_recognition_read_scope_required"}';
  end if;
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'recognition source entry not found in your firm' using errcode='CLR11',
      detail='{"reason":"revenue_recognition_source_not_found"}';
  end if;

  -- THE DEFERRED LEG, by the door's own predicate: exactly one CREDITED LIABILITY line that is not
  -- the tax leg. Zero or many is reported as a COUNT rather than guessed at, for the same reason
  -- the door refuses it.
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.credit_cents > 0
     and ca.account_type = 'liability'
     and coalesce(ca.special_acc_type, '') <> 'sst_output';
  if v_legs = 1 then
    select jl.account_code, jl.credit_cents into v_leg_code, v_leg_cents
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.credit_cents > 0
       and ca.account_type = 'liability'
       and coalesce(ca.special_acc_type, '') <> 'sst_output';
  end if;

  -- THE RECORDED TERM. The document carrier first, because a document-bound receipt is the lane
  -- 0140 built; then #939's person-stated carrier. A receipt that binds a document does not carry
  -- a stated term at all (0305 refuses one), so the two arms cannot both answer.
  if v_entry.document_id is not null then
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis
      into v_sp_id, v_sp_start, v_sp_end, v_sp_kind, v_sp_basis
      from clara.document_service_periods sp
     where sp.document_id = v_entry.document_id and sp.superseded_at is null;
  end if;
  select t.id, t.period_start, t.period_end, t.reason
    into v_st_id, v_st_start, v_st_end, v_st_reason
    from clara.prepayment_stated_terms t
   where t.source_entry_id = p_source_entry and t.superseded_at is null;

  if v_sp_id is not null then
    v_term := jsonb_build_object('source', 'document_service_period',
      'service_period_id', v_sp_id, 'stated_term_id', null,
      'period_start', to_char(v_sp_start,'YYYY-MM-DD'),
      'period_end', to_char(v_sp_end,'YYYY-MM-DD'),
      'basis_kind', v_sp_kind, 'basis_text', v_sp_basis);
  elsif v_st_id is not null then
    v_term := jsonb_build_object('source', 'human_stated',
      'service_period_id', null, 'stated_term_id', v_st_id,
      'period_start', to_char(v_st_start,'YYYY-MM-DD'),
      'period_end', to_char(v_st_end,'YYYY-MM-DD'),
      'basis_kind', 'human_stated', 'basis_text', v_st_reason);
  else
    -- ABSENCE IS REPORTED AS ABSENCE, with the DOOR that fills it — never as an empty term a run
    -- could read as "no term is needed". The remedy named is the HUMAN one, because a service
    -- period is human-only by law and no agent path to it exists or ever will.
    v_term := jsonb_build_object('source', null,
      'service_period_id', null, 'stated_term_id', null,
      'period_start', null, 'period_end', null, 'basis_kind', null, 'basis_text', null,
      'remedy', case when v_entry.document_id is not null
                     then 'clara.record_document_service_period'
                     else 'clara.record_prepayment_stated_term' end);
  end if;

  select s.id, s.plan_id, s.term_source into v_sched_id, v_sched_plan, v_sched_source
    from clara.revenue_recognition_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one

  return jsonb_build_object(
    'status', 'ok', 'firm_id', p_firm, 'client_id', p_client,
    'source_entry_id', p_source_entry,
    'entry', jsonb_build_object('status', v_entry.status, 'document_id', v_entry.document_id,
      'posting_date', to_char(v_entry.posting_date,'YYYY-MM-DD')),
    'deferred', jsonb_build_object('account_code', v_leg_code,
      'total_cents', v_leg_cents, 'candidate_legs', v_legs),
    'term', v_term,
    'schedule', case when v_sched_id is null then null
                     else jsonb_build_object('schedule_id', v_sched_id, 'plan_id', v_sched_plan,
                            'term_source', v_sched_source) end);
end $c0335_rrsf$;

-- =====================================================================================
-- §E — TAIL. Read off the LIVE catalog, never off this file's own text.
-- =====================================================================================
do $c0335_tail$
declare
  v_sig text; v_src text; v_i int; v_n int;
  v_moved text[][] := array[
    ['clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)', 'invalid_author'],
    ['clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)', 'invalid_author'],
    ['clara.read_prepayment_source_for(uuid,uuid,uuid)', 'prepayment_read_scope_required'],
    ['clara.read_revenue_recognition_source_for(uuid,uuid,uuid)', 'revenue_recognition_read_scope_required']
  ];
begin
  -- 1 · EACH MOVED RAISE CARRIES CLR44, AND ITS TOKEN IS NO LONGER ON A CLR10 RAISE ANYWHERE IN
  --     THE BODY. Matched across the newline the estate wraps these raises on.
  for v_i in 1 .. array_length(v_moved, 1) loop
    v_sig := v_moved[v_i][1];
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if v_src is null then
      raise exception '0335 tail: % is absent after the recut', v_sig using errcode='CLR10';
    end if;
    if v_src !~ ('errcode=''CLR44'',[[:space:]]*detail=''\{"reason":"' || v_moved[v_i][2] || '"') then
      raise exception '0335 tail: %''s % raise does not carry CLR44', v_sig, v_moved[v_i][2]
        using errcode='CLR10';
    end if;
    if v_src ~ ('errcode=''CLR10'',[[:space:]]*detail=''\{"reason":"' || v_moved[v_i][2] || '"') then
      raise exception '0335 tail: %''s % raise still carries CLR10', v_sig, v_moved[v_i][2]
        using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE PAYLOADS AND SENTENCES ARE BYTE-IDENTICAL. The ticket puts payload reshaping out of
  --     scope, so the two author walls still say `field`/`constraint` and still say it in the same
  --     words, and the two reads still carry `reason` alone.
  for v_i in 1 .. 2 loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_moved[v_i][1]::regprocedure;
    if v_src not like '%{"reason":"invalid_author","field":"author","constraint":"present"}%' then
      raise exception '0335 tail: %''s invalid_author payload was reshaped', v_moved[v_i][1]
        using errcode='CLR10';
    end if;
    if v_src not like '%an on-behalf-of configuration names the human it acts for%' then
      raise exception '0335 tail: %''s invalid_author sentence changed', v_moved[v_i][1]
        using errcode='CLR10';
    end if;
  end loop;
  for v_i in 3 .. 4 loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_moved[v_i][1]::regprocedure;
    if v_src not like ('%{"reason":"' || v_moved[v_i][2] || '"}%') then
      raise exception '0335 tail: %''s scope payload was reshaped', v_moved[v_i][1]
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE PARTITION IS EXACT. Over the WHOLE clara schema, CLR44 is raised by these four bodies
  --     and by nothing else, so the new code carries ONE meaning — which is the ticket's ask.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ~ 'errcode\s*=\s*''CLR44''';
  if v_n <> 4 then
    raise exception '0335 tail: CLR44 is raised by % clara bodies, expected exactly 4', v_n
      using errcode='CLR10';
  end if;

  -- 4 · THE RENDERABLE HALF DID NOT MOVE. Both roster refusals still carry CLR10 inside the two
  --     shared cores, and neither core learned CLR44. This is the OTHER half of AC1: the
  --     account-not-enrolled refusal and the invalid-author refusal are now distinguishable by
  --     errcode alone.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'::regprocedure;
  if v_src !~ 'errcode=''CLR10'',[[:space:]]*detail=jsonb_build_object\(''reason'',''prepayment_source_unfit'''
     or v_src ~ 'CLR44' then
    raise exception '0335 tail: the prepayment roster refusal no longer carries CLR10, or the core learned CLR44'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure;
  if v_src !~ 'errcode=''CLR10'',[[:space:]]*detail=jsonb_build_object\(''reason'',''deferred_revenue_source_unfit'''
     or v_src ~ 'CLR44' then
    raise exception '0335 tail: the deferred-revenue roster refusal no longer carries CLR10, or the core learned CLR44'
      using errcode='CLR10';
  end if;

  -- 5 · NO OVERLOAD WAS MINTED, and the ACLs are exactly 0307/0308/0317's: `clara_runtime` and
  --     nobody else, PUBLIC included. `create or replace function` preserves a grant, and this
  --     re-measures it rather than trusting it.
  for v_i in 1 .. array_length(v_moved, 1) loop
    v_sig := v_moved[v_i][1];
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.proname = split_part(split_part(v_sig, '.', 2), '(', 1);
    if v_n <> 1 then
      raise exception '0335 tail: % has % catalog entries, expected exactly 1', v_sig, v_n
        using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_runtime', v_sig::regprocedure, 'EXECUTE') then
      raise exception '0335 tail: clara_runtime lost EXECUTE on %', v_sig using errcode='CLR10';
    end if;
    if has_function_privilege('clara_authenticated', v_sig::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_sig::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_wake_interactive', v_sig::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_wake_proactive', v_sig::regprocedure, 'EXECUTE')
       or has_function_privilege('public', v_sig::regprocedure, 'EXECUTE') then
      raise exception '0335 tail: a role outside clara_runtime reached %', v_sig using errcode='CLR10';
    end if;
  end loop;

  raise notice '0335 OK: the four caller-contract refusals (invalid_author on both on-behalf-of twins, and the two machine-lane read scopes) now raise CLR44 and nothing else in clara raises it; every payload, sentence, reason and axis is byte-identical; the two renderable roster refusals (prepayment_source_unfit / prepaid_account_not_enrolled and deferred_revenue_source_unfit / deferred_account_not_enrolled) still raise CLR10 inside the two shared cores, which this file did not touch; all four doors remain clara_runtime-only with one catalog entry each and no PUBLIC execute.';
end $c0335_tail$;
