-- 0331_accrual_plan_authority_wall — #1080 (riders sweep wave, lane 01): THE ACCRUAL LANE JOINS
-- THE ONE AUTHORITY WALL. `clara._accrual_plan_core` stops resolving plan authority with 0222's
-- own hand-written block and its inline `exists` probes, and calls
-- `clara._assert_plan_authority` — the single predicate #1051 (0330) minted and the human plan
-- door and the on-behalf twin already call.
-- =====================================================================================
-- Spec of record: issue #1080's Agent Brief (the issue body; zero comments, re-verified live on
-- this branch before this file was written), inside the sweep wave's plan of record
-- `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` ("Why each lane is grouped this way", L1:
-- "#1080 then makes `clara._accrual_plan_core` call that predicate instead of its own `exists`
-- probes ... If #1080 is built by pasting the authority block a third time, it recreates the
-- drift #1051 exists to close").
--
-- THE GAP THIS FILE CLOSES, MEASURED RATHER THAN QUOTED.
--   * `clara._accrual_plan_core` (born 0222:978, recut byte-for-byte by 0283:618, sha
--     31adc6d4… on this rig) resolved a `{kind:'chat_task', id}` authority with
--
--         select exists (select 1 from clara.agent_tasks t
--                         where t.id = v_ref_id and t.firm_id = p_firm and t.client_id = p_client)
--
--     — a bare EXISTENCE test that never reads the named row's own kind or author. #977 (0250)
--     ruled that a task the estate enqueued FOR ITSELF is not a person's instruction, put the
--     answer in `clara._authority_ref_refusal`, and wired `clara.sign_depreciation_authority` and
--     `clara.create_accounting_plan` at it. 0250's own header says in as many words that it does
--     NOT touch this body (0250:63) and its tail pins the surviving inline probe to exactly this
--     one function (0250:604). #1051 (0330) then folded the plan family's whole wall into one
--     predicate and named this body as the third copy #1080 owns (0330:35).
--   * Only ONE of the two accrual entrances reaches this body, and it is the machine one.
--     `clara.create_accrual_adjustment` (human, `clara_authenticated`) nests
--     `clara.create_accounting_plan`, so it has been behind the shared wall since 0250 and behind
--     the shared PREDICATE since 0330. `clara.create_accrual_adjustment_for` (`clara_runtime`
--     only, actor from an argument because a runtime connection carries no JWT) nests
--     `clara._accrual_plan_core`. So the gap was exactly where #977 aimed: a wake task or an
--     autodraft run COULD authorise an accrual adjustment plan, through the on-behalf lane, on a
--     connection with no human on it. Measured on this rig before this file was written: the
--     runtime door ADMITTED a `wake` task reference and wrote the plan, the revision, the
--     occurrence, the accrual and the Work.
--
-- WHAT MOVES, AND WHY EACH ONE IS THE POINT RATHER THAN A SIDE EFFECT. Folding onto the ONE
-- predicate is what the ticket asks for ("resolve plan authority the same way every other OBO
-- plan core in the codebase now does"), and sameness is not selective:
--   1. THE REFUSAL THE TICKET IS ABOUT. A `chat_task` reference whose row is not a human-authored
--      `chat_turn` is now refused CLR10 `authority_ref_not_human_instruction`, where it was
--      admitted. The `authority_ref_unresolved` token still means "there is no such row", so the
--      two answers stay told apart — #977's own distinction, now reachable from this lane.
--   2. THE THIRD ADMITTED KIND, WHICH IS A PARITY FIX AND NOT A WIDENING OF THE ESTATE.
--      `contract_confirmation` (#949, 0300) was admitted by `clara.create_accounting_plan` and
--      therefore by the HUMAN accrual door, and refused `authority_ref_invalid`/`kind` by the
--      on-behalf one, because this body's list was frozen at 0222's two kinds. After this file the
--      two accrual entrances answer identically. Nothing new becomes authority: the same
--      `clara._authority_ref_refusal` resolves the row under the same firm-and-client ladder,
--      `clara.contract_plan_confirmations.confirmed_by` is NOT NULL, and the only two writers of
--      that table (`clara.confirm_tenancy_rent_plan`, `clara.confirm_tenancy_rent_plan_revision`)
--      are granted to `clara_authenticated` alone — a runtime connection cannot manufacture one.
--      The ticket's "out of scope: widening or narrowing the authority-reference vocabulary
--      itself" is respected: the estate's vocabulary is unchanged at three kinds, and this lane
--      stops being the one place that disagreed with it.
--   3. TWO SENTENCES. 'a plan authority reference names an accounting_work or a chat_task'
--      becomes the three-kind sentence, and 'the instruction this accrual cites does not exist
--      for this client' becomes 'the instruction this plan cites does not exist for this
--      client' — which is ALREADY what a human configuring an accrual is told, because that
--      entrance goes through `clara.create_accounting_plan`. Every SQLSTATE and every
--      `detail.reason` token is unchanged; what changes is that the two entrances stop giving one
--      client two different sentences for one refusal.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * it does not touch `clara._assert_plan_authority` (#1051, 0330) or
--     `clara._authority_ref_refusal` (#977, 0250) — both pinned below and re-pinned at the tail,
--     byte for byte. This file joins those definitions; it does not restate or amend them.
--   * it does not touch `clara.create_accounting_plan` or `clara._obo_plan_core`. They are
--     asserted to CALL the predicate (the census at the tail counts callers), never sha-pinned:
--     a later file has no business being coupled to another body's bytes when the fact it needs
--     is structural.
--   * it changes no grant, mints no name, mints no table, moves no chart row and touches no
--     CHECK. `clara._accrual_plan_core` keeps its signature, its owner, its SECURITY DEFINER
--     flag, its pinned `search_path` and its owner-only ACL, and the tail re-reads every one.
--   * it does not touch the accrual lane's other validation rules (the ticket's own out-of-scope
--     line): `_assert_plan_schedule`, `_assert_journal_basis`, the client rung, the plan and
--     revision inserts, the overlap warning, the preview and the audit row are the pre-image's
--     own, byte for byte, and the tail PROVES that by reverse substitution rather than asserting
--     it in prose.
--
-- REDO-SAFE (#957). Every statement below is `create or replace function`, `revoke` or
-- `comment on`, each idempotent by construction, and the prestate is BIMODAL on the one body this
-- file recuts: it admits either the measured pre-image (FIRST APPLY) or this file's own output
-- (REDO) and refuses anything else, printing which branch it took. Because a bimodal pin hides
-- its first-apply branch from `CLARA_MIGRATION_REDO` (which can only ever take the "already live"
-- branch), the first-apply branch was proved by hand on the lane database before this file was
-- committed: inside one transaction that was rolled back, 0283's own `create or replace function`
-- statement was re-run to restore the pre-image, this prestate block was run verbatim, and it
-- printed its FIRST APPLY notice and passed. The lane report records that run. This file has NO
-- data-dependent branch: every prestate and tail arm reads the catalog only, so no arm needs rows
-- to be entered.
-- =====================================================================================

do $p1080_pre$
declare
  v_accrual text := 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)';
  v_pred text := 'clara._assert_plan_authority(text,jsonb,uuid,uuid)';
  v_refusal text := 'clara._authority_ref_refusal(text,uuid,uuid,uuid)';
  v_human text := 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)';
  v_obo text := 'clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)';
  -- MEASURED ON THIS LANE DATABASE (clara_l04, 310 files, max 0330_plan_authority_wall_predicate)
  -- immediately before this file was written — never copied from an older migration's header.
  -- 0330 is a file of THIS lane and applied before this one, so the predicate's pin is what is
  -- LIVE after it, exactly as the wave's own rule requires.
  c_pred constant text := '60f2c5d10378f9fc853e672cc6bc53d662322283c3ed5276e399e87e71ee202b';
  c_refusal constant text := '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208';
  c_accrual_pre constant text := '31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5';
  c_accrual_post constant text := '89d2ac3a33e8dcda53b0f42a6c500a6a9aefd567af57ecfe181ce82eaa248625';
  c_call constant text := 'clara._assert_plan_authority(';
  v_sha text; v_branch text; v_n int; v_sig text; v_src text;
begin
  -- THE ONE PREDICATE THIS FILE JOINS. Pinned UNCONDITIONALLY: the whole of what this lane will
  -- admit and refuse after today is that body, so a drifted one would silently change the accrual
  -- lane's rules while this file's own diff looked like a two-line fold.
  if to_regprocedure(v_pred) is null then
    raise exception '#1080 prestate: % is absent -- 0330 (#1051) must apply first', v_pred using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_pred::regprocedure;
  if v_sha is distinct from c_pred then
    raise exception '#1080 prestate: % has DRIFTED from its measured #1051 image (got %) -- this file points a third body at it and must not do so blind',
      v_pred, v_sha using errcode = 'CLR10';
  end if;

  -- THE DEFINITION BENEATH IT (#977, 0250). The new refusal this lane gains
  -- (authority_ref_not_human_instruction) is that body's answer, not this file's, so it is pinned
  -- here and re-pinned at the tail.
  if to_regprocedure(v_refusal) is null then
    raise exception '#1080 prestate: % is absent -- 0250 must apply first', v_refusal using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_refusal::regprocedure;
  if v_sha is distinct from c_refusal then
    raise exception '#1080 prestate: % has DRIFTED from its #977 pre-image (got %)', v_refusal, v_sha
      using errcode = 'CLR10';
  end if;

  -- THE TWO BODIES ALREADY BEHIND THE PREDICATE. Asserted STRUCTURALLY, never sha-pinned: what
  -- this file relies on is that they are callers (the tail's census counts exactly three), and
  -- pinning 0330's output bytes from a later file of the same lane would couple this one to them
  -- for no gain.
  foreach v_sig in array array[v_human, v_obo] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1080 prestate: % is absent -- 0308 must apply first', v_sig using errcode = 'CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position(c_call in v_src) = 0 then
      raise exception '#1080 prestate: % does not call % -- 0330 folded both plan doors onto it and this file is the third; a chain where it did not is one nobody measured',
        v_sig, v_pred using errcode = 'CLR10';
    end if;
  end loop;

  -- THE BODY THIS FILE RECUTS, BIMODALLY.
  if to_regprocedure(v_accrual) is null then
    raise exception '#1080 prestate: % is absent -- 0222 must apply first', v_accrual using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_accrual::regprocedure;
  v_branch := case v_sha when c_accrual_pre then 'first' when c_accrual_post then 'redo' else null end;
  if v_branch is null then
    raise exception '#1080 prestate: % is neither its measured pre-image (%) nor this file''s own output (%) -- got % -- so the fold below would be written against a body nobody measured',
      v_accrual, c_accrual_pre, c_accrual_post, v_sha using errcode = 'CLR10';
  end if;

  -- AND ITS GRANT POSTURE, PINNED SO THE TAIL CAN PROVE THE RECUT PRESERVED IT. It is an
  -- ungranted definer-internal core (0004:6-12's one-ungranted-core law); a `create or replace`
  -- preserves an ACL, and this asserts there was nothing to preserve but the owner's own.
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_accrual::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1080 prestate: % carries % grant(s) beyond the owner''s own -- it is a definer-internal core and this file must not be applied over a leak',
      v_accrual, v_n using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_accrual::regprocedure, 'execute') then
    raise exception '#1080 prestate: PUBLIC can execute %', v_accrual using errcode = 'CLR10';
  end if;

  raise notice '#1080 prestate: % APPLY -- clara._assert_plan_authority is byte-identical to its #1051 image and clara._authority_ref_refusal to its #977 one; clara.create_accounting_plan and clara._obo_plan_core both already call the predicate; clara._accrual_plan_core is in the % state and is granted to nobody but its owner.',
    upper(v_branch), v_branch;
end
$p1080_pre$;

-- =====================================================================================
-- §A  THE THIRD BODY, FOLDED. 0283's own body verbatim — every wall it keeps, every payload,
--     every comment, the client rung, both inserts, the overlap warning, the preview and the
--     audit row — with exactly one block replaced by one `perform` of #1051's predicate and the
--     three declarations that block alone used (`v_ref_kind`, `v_ref_id`, `v_ok`) dropped with
--     it. The tail proves that claim mechanically by reverse substitution.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._accrual_plan_core(p_firm uuid, p_client uuid, p_author uuid, p_purpose text,
    p_authority_kind text, p_authority_ref jsonb, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $p1080acc$
declare
  v_plan uuid; v_rev uuid; v_digest text;
  v_warning jsonb; v_next jsonb;
begin
  -- THE AUTHORITY SHAPE AND ITS RESOLUTION -- #1080: THE ONE PREDICATE clara.create_accounting_plan
  -- and clara._obo_plan_core already call (#1051, 0330). Everything this block used to spell out
  -- by hand -- the two authority-kind refusals, the three authority_ref shape refusals, the
  -- admitted-kind list and the reference's resolution -- is now written ONCE. The resolution is
  -- the part that moves: 0222's own inline 'exists' probes tested only that a chat_task row with
  -- that id existed for this firm and client, so a wake task or an autodraft run -- work the
  -- estate enqueued FOR ITSELF -- satisfied the same check as an instruction a person typed.
  -- #977 (0250) ruled that is not authority and clara._authority_ref_refusal is the one place
  -- that ruling lives; this lane now reaches it like every other plan lane.
  perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, p_firm, p_client);

  perform clara._assert_plan_schedule('reversing_journal', p_frequency, p_day_rule, p_day_of_month,
    p_timezone, p_effective_from, p_effective_to, 'next_period_first_day');
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  -- PLACED by 0037 SECTION K's own order (op-receipt -> advisory rung) and above every
  -- clara.accounting_plans row lock in this body. Censused on the live catalog before it was
  -- added: of the fifty-one bodies that take 203005004, not one reads or locks
  -- clara.accounting_plans, so the only new pair is "rung -> plan row" and no body anywhere holds
  -- a plan row while waiting for this rung. Advisory xact locks are re-entrant, so the outer
  -- accrual and prepayment doors re-taking it through this one cost nothing.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, 'reversing_journal', 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, 'reversing_journal', 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, true,
      'next_period_first_day', p_author)
    returning id into v_rev;

  -- #929 (fix round, ADV-L05-03): self-exclusion by identity, as in clara.create_accounting_plan.
  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, true,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', 'reversing_journal',
      'revision', 1, 'authority', p_authority_ref, 'via', 'create_accrual_adjustment_for'));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', 'reversing_journal', 'next_occurrences', coalesce(v_next,'[]'::jsonb),
    'overlap_warning', v_warning);
end $p1080acc$;

revoke all on function clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb) from public;
comment on function clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb) is
  '#652 (0222): the accrual lane''s ACTOR-EXPLICIT plan step, nested by '
  'clara.create_accrual_adjustment_for on a clara_runtime connection that carries no human JWT. '
  '#1080 (0331): its authority resolution is no longer its own. It calls '
  'clara._assert_plan_authority -- the ONE plan authority wall #1051 (0330) minted and '
  'clara.create_accounting_plan and clara._obo_plan_core already call -- so an accrual plan is '
  'admitted on exactly the authority every other plan lane admits: an explicit instruction naming '
  'an accounting_work, a human-authored chat_turn or a contract_confirmation of this firm and '
  'client. Until 0331 this body ran 0222''s own inline exists probe against clara.agent_tasks, '
  'which never read the named task''s kind or author, so a wake task or an autodraft run could '
  'authorise an accrual plan through this lane -- the one place #977 (0250) did not reach. The '
  'HUMAN accrual entrance was never exposed: clara.create_accrual_adjustment nests '
  'clara.create_accounting_plan. Nothing else in this body moved; 0331''s tail proves that by '
  'putting 0222''s block back and re-hashing to the pre-image.';

reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written, and
-- proves the fold is a FOLD by reverse substitution. Nothing here writes a row.
-- =====================================================================================
do $p1080_tail$
declare
  v_accrual text := 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)';
  v_pred text := 'clara._assert_plan_authority(text,jsonb,uuid,uuid)';
  v_refusal text := 'clara._authority_ref_refusal(text,uuid,uuid,uuid)';
  c_pred constant text := '60f2c5d10378f9fc853e672cc6bc53d662322283c3ed5276e399e87e71ee202b';
  c_refusal constant text := '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208';
  c_accrual_pre constant text := '31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5';
  c_accrual_post constant text := '89d2ac3a33e8dcda53b0f42a6c500a6a9aefd567af57ecfe181ce82eaa248625';
  c_call constant text := 'clara._assert_plan_authority(';
  -- The wall's own sentence, in the prefix BOTH spellings share (0222's two-kind one and #949's
  -- three-kind one), so "this body still keeps a copy of the wall" cannot be dodged by a widening.
  c_sentence constant text := 'a plan authority reference names an accounting_work';
  -- 0222's own unresolved sentence, the one this lane stops giving while the human entrance gives
  -- another. After this file it must live nowhere.
  c_accrual_sentence constant text := 'the instruction this accrual cites';
  -- The inline chat-lane EXISTENCE test, normalized exactly as 0250's tail normalizes prosrc.
  -- 0250 pinned it to ONE surviving carrier (this body); after this file it must be ZERO.
  c_inline constant text := 'from clara.agent_tasks t where t.id = v_ref_id';
  v_sha text; v_src text; v_restored text; v_ok boolean; v_n int; v_names text;
begin
  -- T.1 — THE RECUT BODY: this file's own output, with its whole posture unmoved.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_accrual::regprocedure;
  if v_sha is distinct from c_accrual_post then
    raise exception '#1080 tail T.1: % is not this file''s measured output (got %, expected %)',
      v_accrual, v_sha, c_accrual_post using errcode = 'CLR10';
  end if;
  select p.prosecdef and p.provolatile = 'v' and p.proowner::regrole::text = 'clara_fn_owner'
         and 'search_path=clara, pg_temp' = any(p.proconfig)
    into v_ok from pg_proc p where p.oid = v_accrual::regprocedure;
  if v_ok is not true then
    raise exception '#1080 tail T.1b: % lost its definer/volatile/owner/search_path shape', v_accrual
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_accrual::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1080 tail T.1c: % gained % grant(s) across the recut -- it is a definer-internal core',
      v_accrual, v_n using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_accrual::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated', v_accrual::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', v_accrual::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', v_accrual::regprocedure, 'execute') then
    raise exception '#1080 tail T.1d: % is reachable by an application role', v_accrual using errcode = 'CLR10';
  end if;

  -- T.2 — THE FOLD, IN THE BODY'S OWN TEXT: it reaches the wall through the predicate and keeps
  --       no line of its own -- neither the sentence, nor the inline chat-lane probe.
  select p.prosrc into v_src from pg_proc p where p.oid = v_accrual::regprocedure;
  if position(c_call in v_src) = 0 then
    raise exception '#1080 tail T.2: % does not call %', v_accrual, v_pred using errcode = 'CLR10';
  end if;
  if position(c_sentence in v_src) > 0 then
    raise exception '#1080 tail T.2b: % still carries its own copy of the wall', v_accrual using errcode = 'CLR10';
  end if;
  if position(c_inline in lower(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) > 0 then
    raise exception '#1080 tail T.2c: % still carries the inline chat-lane existence test #977 replaced', v_accrual
      using errcode = 'CLR10';
  end if;

  -- T.3 — THE TWO DEFINITIONS THIS FILE JOINS, UNMOVED AND STILL UNGRANTED. A fold that moved
  --       either would be a rewrite of the rule, not a fold of a third copy onto it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_pred::regprocedure;
  if v_sha is distinct from c_pred then
    raise exception '#1080 tail T.3: % MOVED while this file applied (got %)', v_pred, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_refusal::regprocedure;
  if v_sha is distinct from c_refusal then
    raise exception '#1080 tail T.3b: % MOVED while this file applied (got %)', v_refusal, v_sha using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid in (v_pred::regprocedure, v_refusal::regprocedure)
     and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1080 tail T.3c: the shared wall or the definition under it gained % grant(s)', v_n
      using errcode = 'CLR10';
  end if;

  -- T.4 — THE CENSUS, THE POINT OF THE WHOLE FILE. `order by p.proname` is the catalog's own C
  --       ordering (`proname` is `name`, which never takes a database collation), so comparing
  --       against a literal roster is collation-proof by construction (sweep rule (e)).
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and position(c_sentence in p.prosrc) > 0;
  if v_names is distinct from '_assert_plan_authority' then
    raise exception '#1080 tail T.4: the wall''s sentence lives in {%} -- expected exactly clara._assert_plan_authority, the ONE spelling #1051 minted',
      v_names using errcode = 'CLR10';
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and position(c_call in p.prosrc) > 0;
  if v_names is distinct from '_accrual_plan_core, _obo_plan_core, create_accounting_plan' then
    raise exception '#1080 tail T.4b: the shared wall is called by {%} -- expected exactly the three plan bodies',
      v_names using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(c_inline in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) > 0;
  if v_n <> 0 then
    raise exception '#1080 tail T.4c: the inline chat-lane existence test #977 replaced survives in % clara function(s) -- expected ZERO; 0250:604 pinned it to exactly clara._accrual_plan_core and this file was the one that removed it',
      v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and position(c_accrual_sentence in p.prosrc) > 0;
  if v_n <> 0 then
    raise exception '#1080 tail T.4d: 0222''s own "the instruction this accrual cites" sentence survives in % clara function(s) -- expected ZERO; the two accrual entrances now give one client ONE sentence',
      v_n using errcode = 'CLR10';
  end if;

  -- T.5 — THE FOLD IS A FOLD, PROVED BY REVERSE SUBSTITUTION (0318's idiom, 0330's own tail
  --       T.8). A post-image pin says the catalog holds what this file's text says; it does NOT
  --       say that text is the pre-image with one block moved. So: read the INSTALLED body, put
  --       0222/0283's own authority block and the three declarations that block alone used back
  --       where they were, and require the result to hash to the pre-image the prestate pinned.
  --       Anything smuggled anywhere else in this pasted body reds this migration instead of
  --       shipping -- which is the whole of the ticket's "no change to the accrual plan's other
  --       validation rules".
  v_restored := replace(replace(v_src, $p1080_nb$  -- THE AUTHORITY SHAPE AND ITS RESOLUTION -- #1080: THE ONE PREDICATE clara.create_accounting_plan
  -- and clara._obo_plan_core already call (#1051, 0330). Everything this block used to spell out
  -- by hand -- the two authority-kind refusals, the three authority_ref shape refusals, the
  -- admitted-kind list and the reference's resolution -- is now written ONCE. The resolution is
  -- the part that moves: 0222's own inline 'exists' probes tested only that a chat_task row with
  -- that id existed for this firm and client, so a wake task or an autodraft run -- work the
  -- estate enqueued FOR ITSELF -- satisfied the same check as an instruction a person typed.
  -- #977 (0250) ruled that is not authority and clara._authority_ref_refusal is the one place
  -- that ruling lives; this lane now reaches it like every other plan lane.
  perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, p_firm, p_client);
$p1080_nb$, $p1080_ob$  -- THE AUTHORITY SHAPE AND ITS RESOLUTION, verbatim from 0193:1466-1512. A Knowledge preference,
  -- a calculation policy or a repeated debit has no row here, so none of them can supply authority.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  if v_ref_kind = 'accounting_work' then
    select exists (select 1 from clara.accounting_work w
                    where w.id = v_ref_id and w.firm_id = p_firm and w.client_id = p_client) into v_ok;
  else
    select exists (select 1 from clara.agent_tasks t
                    where t.id = v_ref_id and t.firm_id = p_firm and t.client_id = p_client) into v_ok;
  end if;
  if not v_ok then
    raise exception 'the instruction this accrual cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','authority_ref_unresolved','kind',v_ref_kind,'id',v_ref_id)::text;
  end if;
$p1080_ob$),
                        $p1080_nd$  v_plan uuid; v_rev uuid; v_digest text;
$p1080_nd$, $p1080_od$  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_ok boolean;
$p1080_od$);
  if encode(sha256(convert_to(v_restored,'UTF8')),'hex') is distinct from c_accrual_pre then
    raise exception '#1080 tail T.5: putting 0222''s own authority block back into the installed clara._accrual_plan_core does NOT reproduce its pre-image % -- something outside the wall moved in this file''s pasted body',
      c_accrual_pre using errcode = 'CLR10';
  end if;

  raise notice '#1080 tail: OK -- clara._accrual_plan_core is at this file''s measured output with its signature, owner, SECURITY DEFINER flag, pinned search_path and owner-only ACL unmoved; it reaches the plan authority wall through clara._assert_plan_authority and keeps neither the wall''s sentence nor #977''s inline chat-lane existence test; clara._assert_plan_authority and clara._authority_ref_refusal are byte-identical to their pre-images and still granted to nobody; the wall''s sentence now lives in exactly ONE clara body and the predicate is called by exactly the three plan bodies; the inline chat-lane existence test and 0222''s own "this accrual cites" sentence survive in ZERO clara bodies; and putting 0222''s block back reproduces the pre-image byte for byte, so nothing but the authority wall moved.';
end
$p1080_tail$;
