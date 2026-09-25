-- 0330_plan_authority_wall_predicate — #1051 (riders sweep wave, lane 01): ONE AUTHORITY-WALL
-- PREDICATE. `clara.create_accounting_plan` and `clara._obo_plan_core` stop keeping two
-- independently hand-written copies of the plan authority wall and both call one new ungranted
-- internal, `clara._assert_plan_authority`. NOTHING EITHER DOOR ADMITS OR REFUSES MOVES.
-- =====================================================================================
-- Spec of record: issue #1051's Agent Brief (the issue body; zero comments, re-verified live on
-- this branch before this file was written) AS RE-BRIEFED by the sweep wave's plan of record,
-- `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` ("The four narrowed tickets, and the one
-- re-briefed").
--
-- THE TICKET'S STATED CURRENT BEHAVIOUR IS STALE, AND THAT CHANGES WHAT THIS FILE DOES.
-- #1051 was filed saying `clara._obo_plan_core` admits TWO authority-reference kinds while
-- `clara.create_accounting_plan` admits THREE, and it RECOMMENDED keeping the machine lane at
-- two. Measured on the integrated chain, both bodies already admit the SAME three kinds --
-- `0308_deferred_revenue_recognition.sql:893` carries
-- ('accounting_work','chat_task','contract_confirmation') against the identical list at line 614
-- -- because the riders wave-4 integrator carried #949's (0300) third kind into the twin as well
-- as into the human door. Taking the ticket's recommendation would therefore REMOVE a kind the
-- integrated wave deliberately added: a behaviour change no ticket asked for, on the machine
-- lane, in the direction of refusing something that is admitted today. This file does NOT take
-- it. It keeps all three kinds on both doors and folds the two copies into one.
--
-- WHAT IS ACTUALLY LIVE, AND WHAT THIS FILE CLOSES. The second half of the ticket:
--   * the wall is written out TWICE, by hand (0308:597-640 against 0308:871-919), so the next
--     lane to recut either one re-opens the drift #949 and the wave-4 integrator already paid to
--     close once;
--   * 0308:870's claim that the twin's copy is "verbatim from clara.create_accounting_plan" is
--     not true of anything any more -- the integrator's own splice moved one body and not the
--     other's comment. Applied migrations are immutable, so the correction is stated HERE and in
--     this file's own `packages/db/README.md` section, never by editing 0308.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * it does not touch `clara._authority_ref_refusal` (#977, 0250) -- pinned below and at the
--     tail, byte for byte. This file wraps that definition; it does not restate it.
--   * it does not touch `clara._accrual_plan_core`, which carries a THIRD hand-written copy of
--     this same wall (`0222_accrual_adjustments.sql:1014-1025`) and reaches the chat lane through
--     its own inline `exists` probes rather than through #977's definition. That is a live
--     authority gap and it has its OWN ticket, #1080, which points that body at the predicate
--     this file mints. Folding it here would widen #1051.
--   * it changes no grant, mints no table, moves no chart row and touches no CHECK.
--
-- REDO-SAFE (#957). Every statement below is `create or replace function`, `revoke` or
-- `comment on`, each idempotent by construction, and the prestate is BIMODAL: it admits either
-- the measured pre-images (FIRST APPLY) or this file's own outputs (REDO) and refuses anything
-- else, printing which branch it took. Because a bimodal pin hides its first-apply branch from
-- `CLARA_MIGRATION_REDO` (which can only ever take the "already live" branch), the first-apply
-- branch was proved by hand on the lane database before this file was committed: inside one
-- transaction that was rolled back, 0308's own two `create or replace function` statements were
-- re-run to restore the pre-images, this prestate block was run verbatim, and it printed its
-- FIRST APPLY notice and passed. The lane report records that run. This file has NO
-- data-dependent branch: every prestate and tail arm reads the catalog only, so no arm needs
-- rows to be entered.
-- =====================================================================================

do $p1051_pre$
declare
  v_refusal text := 'clara._authority_ref_refusal(text,uuid,uuid,uuid)';
  v_human text := 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)';
  v_obo text := 'clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)';
  v_accrual text := 'clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)';
  v_pred text := 'clara._assert_plan_authority(text,jsonb,uuid,uuid)';
  -- MEASURED ON THIS LANE DATABASE (clara_l04, 309 files, max 0318_knowledge_fye_pair_applicability)
  -- immediately before this file was written -- never copied from an older migration's header.
  c_refusal constant text := '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208';
  c_human_pre constant text := 'a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c';
  c_human_post constant text := '544cd88ecaa5b5237969aff36b1bd0d8a5cdf41aacea234e6415d3df54b523ea';
  c_obo_pre constant text := '2049c1c4404e47102b375d506271938f5f3e03405fd7a25b8d303118c13a6b4a';
  c_obo_post constant text := '149b4a3d0ff1b22b3dd8d11eabcfb7b0b8c113054cd7df76194355c2b976b61d';
  v_sha text; v_human_branch text; v_obo_branch text; v_pred_live boolean;
begin
  -- THE ONE DEFINITION THIS FILE WRAPS AND MUST NOT MOVE.
  if to_regprocedure(v_refusal) is null then
    raise exception '#1051 prestate: % is absent -- 0250 must apply first', v_refusal using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_refusal::regprocedure;
  if v_sha is distinct from c_refusal then
    raise exception '#1051 prestate: % has DRIFTED from its measured pre-image (got %) -- this file wraps it and must not change it, so re-measure before applying',
      v_refusal, v_sha using errcode = 'CLR10';
  end if;

  -- THE TWO BODIES THIS FILE RECUTS, BIMODALLY.
  if to_regprocedure(v_human) is null or to_regprocedure(v_obo) is null then
    raise exception '#1051 prestate: the plan doors are missing -- 0308 must apply first' using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_human::regprocedure;
  v_human_branch := case v_sha when c_human_pre then 'first' when c_human_post then 'redo' else null end;
  if v_human_branch is null then
    raise exception '#1051 prestate: % is neither its measured pre-image (%) nor this file''s own output (%) -- got % -- so the fold below would be written against a body nobody measured',
      v_human, c_human_pre, c_human_post, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_obo::regprocedure;
  v_obo_branch := case v_sha when c_obo_pre then 'first' when c_obo_post then 'redo' else null end;
  if v_obo_branch is null then
    raise exception '#1051 prestate: % is neither its measured pre-image (%) nor this file''s own output (%) -- got %',
      v_obo, c_obo_pre, c_obo_post, v_sha using errcode = 'CLR10';
  end if;
  if v_human_branch <> v_obo_branch then
    raise exception '#1051 prestate: the two doors are in DIFFERENT states (human=%, obo=%) -- exactly the drift this file exists to close, and it must be understood by hand before this file applies',
      v_human_branch, v_obo_branch using errcode = 'CLR10';
  end if;

  -- THE NAME THIS FILE MINTS: free on a first apply, live on a redo, and never out of step with
  -- the doors' own branch.
  v_pred_live := to_regprocedure(v_pred) is not null;
  if v_human_branch = 'first' and v_pred_live then
    raise exception '#1051 prestate: % already exists while both doors still carry their own walls -- a half-applied state this file must not paper over', v_pred
      using errcode = 'CLR10';
  end if;
  if v_human_branch = 'redo' and not v_pred_live then
    raise exception '#1051 prestate: both doors already call % but it does not exist -- the catalog is inconsistent', v_pred
      using errcode = 'CLR10';
  end if;

  -- THE HUMAN DOOR'S GRANT POSTURE, PINNED SO THE TAIL CAN PROVE A RECUT PRESERVED IT.
  if not has_function_privilege('clara_authenticated', v_human::regprocedure, 'execute') then
    raise exception '#1051 prestate: % is not granted to clara_authenticated -- this file must not be the reason it is missing', v_human using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_authenticated', v_obo::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', v_obo::regprocedure, 'execute')
     or has_function_privilege('public', v_obo::regprocedure, 'execute') then
    raise exception '#1051 prestate: % is reachable by an application role -- it is a definer-internal core and this file must not be applied over a leak', v_obo
      using errcode = 'CLR10';
  end if;

  -- THE THIRD COPY, NAMED RATHER THAN TOUCHED (#1080 owns it). Recorded, never pinned: pinning a
  -- body another ticket of this lane recuts would couple this file to that ticket's output for
  -- no gain.
  if to_regprocedure(v_accrual) is null then
    raise exception '#1051 prestate: % is absent -- 0222 must apply first', v_accrual using errcode = 'CLR10';
  end if;

  raise notice '#1051 prestate: % APPLY -- clara._authority_ref_refusal is byte-identical to its #977 pre-image; both plan doors are in the % state and agree with each other; clara._assert_plan_authority is %; the human door keeps its clara_authenticated grant and the twin keeps none; clara._accrual_plan_core is present and deliberately untouched (#1080).',
    upper(v_human_branch), v_human_branch, case when v_pred_live then 'already live' else 'not yet minted' end;
end
$p1051_pre$;

-- =====================================================================================
-- §A  THE ONE DEFINITION. An UNGRANTED INTERNAL in `clara._authority_ref_refusal`'s own shape
--     (0250 §A): owned by `clara_fn_owner`, `stable` (it reads and raises; the language itself
--     refuses to let it write), EXECUTE revoked from PUBLIC and granted to no role, so it is
--     reachable only from another SECURITY DEFINER body already running as the owner.
--
--     THE BODY IS THE HUMAN DOOR'S OWN WALL, MOVED. Every sentence, every errcode and every
--     `detail` payload below is byte-identical to what `clara.create_accounting_plan` carried
--     before this file, including the two comments #949 and #977 left inside it; the ONE token
--     that changes is the firm the resolution is asked about, which was the caller's own local
--     `v_firm` and is now this predicate's `p_firm` argument. The twin's copy was byte-identical
--     to the human door's already -- that is what the integrator's own cells
--     (`p915.obo.refusals_match`, `p941.obo.authority`) measure -- so folding produces exactly
--     one spelling of what both doors already said.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._assert_plan_authority(
    p_authority_kind text, p_authority_ref jsonb, p_firm uuid, p_client uuid) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare v_ref_kind text; v_ref_id uuid; v_reason text;
begin
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
  -- #949 (0300): a THIRD kind, additively. clara.contract_plan_confirmations is the tenancy
  -- lane's own record of a named person confirming a rent plan; clara._authority_ref_refusal
  -- resolves it under the same firm-and-client ladder as the other two.
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task','contract_confirmation') then
    raise exception 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'
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
  -- #977 (0250): RESOLVED, not merely well-shaped -- and, on the CHAT-LANE arm, a PERSON'S
  -- INSTRUCTION rather than a task the estate enqueued for itself. A Knowledge preference, a
  -- calculation policy or a repeated debit has no row here, so none of them can supply authority;
  -- an agent run HAS one, and #977 is the ruling that stops it counting.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, p_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;
end $fn$;
revoke all on function clara._assert_plan_authority(text, jsonb, uuid, uuid) from public;
comment on function clara._assert_plan_authority(text, jsonb, uuid, uuid) is
  '#1051 (0330): THE ONE plan authority wall. Raises the plan lane''s own refusal for an '
  'authority that is not an explicit instruction (authority_rule_unsupported, '
  'invalid_authority_kind), for a reference that is not a well-shaped {kind, id} object naming '
  'one of the THREE admitted kinds -- accounting_work, chat_task, contract_confirmation -- '
  '(authority_ref_invalid, constraint object | kind | id), and for a reference that does not '
  'resolve to a person''s instruction under this firm and client through '
  'clara._authority_ref_refusal (#977/0250: authority_ref_unresolved, '
  'authority_ref_not_human_instruction). Returns void; it either raises or the authority stands. '
  'clara.create_accounting_plan (the human door) and clara._obo_plan_core (the on-behalf twin) '
  'both call it, which is what 0308:870''s "verbatim from clara.create_accounting_plan" was '
  'trying and failing to guarantee -- that claim was already untrue when this file was written, '
  'because #949 (0300) widened the human door to three kinds and the wave-4 integrator widened '
  'the twin by hand. clara._accrual_plan_core still carries a THIRD hand-written copy and its '
  'own inline chat-lane probes; #1080 is the ticket that points it here. An UNGRANTED internal: '
  'reachable only from a SECURITY DEFINER body already running as clara_fn_owner.';

-- =====================================================================================
-- §B  THE HUMAN DOOR, RECUT. 0308's own body verbatim -- every wall, every payload, every
--     comment -- with exactly one block replaced by one `perform` of §A's predicate and the
--     three declarations that block alone used (`v_ref_kind`, `v_ref_id`, `v_reason`) dropped
--     with it. Its signature, volatility, definer flag, owner, pinned search_path and
--     clara_authenticated grant are all unmoved, and the tail re-reads every one of them.
-- =====================================================================================
create or replace function clara.create_accounting_plan(
  p_client uuid, p_kind text, p_purpose text, p_authority_kind text, p_authority_ref jsonb,
  p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text,
  p_effective_from date, p_effective_to date, p_basis jsonb, p_reversal_day_rule text,
  p_op_key text)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_plan uuid; v_rev uuid; v_digest text; v_auto boolean;
  v_warning jsonb; v_next jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting plan' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- THE EXCLUDED ADAPTERS, REFUSED BY NAME (the header's scope note).
  -- #653 widened this list by ONE member; #941 widens it by one more. Depreciation and close
  -- schedules STILL answer `plan_kind_unsupported` BY NAME, so a later file can widen it again
  -- additively and every caller that tried one in the meantime got a typed answer rather than a
  -- silent success.
  if p_kind is null or p_kind not in ('recurring_journal','reversing_journal','amortisation_schedule','revenue_recognition_schedule') then
    raise exception 'plan kind % is not supported in this slice (recurring_journal, reversing_journal, amortisation_schedule, revenue_recognition_schedule)', coalesce(p_kind,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind,
          'supported', jsonb_build_array('recurring_journal','reversing_journal','amortisation_schedule','revenue_recognition_schedule'))::text;
  end if;
  -- THE AUTHORITY SHAPE -- #1051: ONE PREDICATE, shared with clara._obo_plan_core.
  -- Everything this block used to spell out -- the two authority-kind refusals, the three
  -- authority_ref shape refusals, the admitted-kind list and #977 (0250) resolution through
  -- clara._authority_ref_refusal -- is now written ONCE, in clara._assert_plan_authority, byte
  -- for byte as this body carried it. Nothing about what this door admits or refuses moves.
  perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, v_firm, p_client);

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p_kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'create_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'kind', p_kind, 'purpose', p_purpose,
      'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone,
      'effective_from', p_effective_from, 'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this plan key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, v_firm, p_client, p_kind, 'active', btrim(p_purpose), p_authority_kind,
      p_authority_ref, v_actor, p_effective_from, 1, v_actor);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, v_firm, p_client, p_kind, 1, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;

  -- #929 (fix round, ADV-L05-03): SELF-EXCLUSION BY IDENTITY. The advisory used to exclude the row
  -- this door just inserted by comparing BASIS VALUES, which also hid every OTHER plan carrying the
  -- same basis -- total overlap, the case a human most needs told. It now takes the plan id this
  -- door already holds.
  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, v_auto,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(v_firm, v_actor, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind, 'revision', 1,
      'authority', p_authority_ref, 'op_key', p_op_key));

  v_result := jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind, 'next_occurrences', coalesce(v_next, '[]'::jsonb),
    'overlap_warning', v_warning);
  return clara._finish_op(v_firm, 'create_accounting_plan', p_op_key, v_result);
end $fn$;

-- =====================================================================================
-- §C  THE ON-BEHALF TWIN, RECUT. The same one-block replacement, and the SAME predicate call --
--     which is the whole of #1051. The twin passes its own `p_firm` argument where the human
--     door passes the firm it resolved through `clara._human_ctx`; everything else in this body,
--     including the closed plan-kind set and the `v_via` entrance label, is 0308's verbatim.
-- =====================================================================================
create or replace function clara._obo_plan_core(
  p_kind text, p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_authority_kind text,
  p_authority_ref jsonb, p_frequency text, p_day_rule text, p_day_of_month integer,
  p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_plan uuid; v_rev uuid; v_digest text;
  v_warning jsonb; v_next jsonb; v_via text;
begin
  -- THE KIND IS A CLOSED SET, and an unknown one RAISES rather than writing a plan row the CHECK
  -- would refuse with a bare 23514. Unreachable from either caller (both pass a literal); a later
  -- lane that widens the set finds this line instead of a silent constraint violation.
  if p_kind is null or p_kind not in ('amortisation_schedule', 'revenue_recognition_schedule') then
    raise exception 'clara._obo_plan_core: unknown plan kind %', coalesce(p_kind, '(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind)::text;
  end if;
  v_via := case p_kind when 'amortisation_schedule' then 'create_prepayment_schedule_for'
                       else 'create_revenue_recognition_schedule_for' end;

  -- THE AUTHORITY SHAPE -- #1051: THE SAME PREDICATE clara.create_accounting_plan calls, which
  -- is what "verbatim from clara.create_accounting_plan" was trying and failing to guarantee.
  -- The twin keeps ALL THREE admitted kinds (the riders wave-4 integrator carried
  -- contract_confirmation into this body; this file does not take it away), and it now keeps
  -- them by SHARING the list rather than by re-typing it.
  perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, p_firm, p_client);

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule,
    p_day_of_month, p_timezone, p_effective_from, p_effective_to, null);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, p_kind, 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, p_kind, 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, false,
      null, p_author)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, false,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  -- THE AUDIT ROW IS 0193'S OWN VERB with the entrance's `via`, exactly as 0222's core stamps its
  -- own: the audit trail says a plan was created and by WHICH entrance, and a reader can tell an
  -- OBO configuration from a human one without joining anything.
  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind,
      'revision', 1, 'authority', p_authority_ref, 'via', v_via));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind,
    'next_occurrences', coalesce(v_next,'[]'::jsonb), 'overlap_warning', v_warning);
end $fn$;

reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written, and
-- DRIVES the new predicate over every refusal axis it owns. Nothing here writes a row, so no
-- forced-rollback subtransaction is needed: the predicate is `stable` and the language enforces
-- that.
-- =====================================================================================
do $p1051_tail$
declare
  v_refusal text := 'clara._authority_ref_refusal(text,uuid,uuid,uuid)';
  v_human text := 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)';
  v_obo text := 'clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)';
  v_pred text := 'clara._assert_plan_authority(text,jsonb,uuid,uuid)';
  c_refusal constant text := '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208';
  c_human_post constant text := '544cd88ecaa5b5237969aff36b1bd0d8a5cdf41aacea234e6415d3df54b523ea';
  c_obo_post constant text := '149b4a3d0ff1b22b3dd8d11eabcfb7b0b8c113054cd7df76194355c2b976b61d';
  c_sentence constant text := 'a plan authority reference names an accounting_work';
  v_sha text; v_src text; v_restored text; v_ok boolean; v_n int; v_names text;
  v_detail text; v_reason text;
  c_human_pre constant text := 'a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c';
  c_obo_pre constant text := '2049c1c4404e47102b375d506271938f5f3e03405fd7a25b8d303118c13a6b4a';
  r record;
begin
  -- T.1 — THE PREDICATE'S SHAPE, the same five facts 0250 asserts about the definition it wraps.
  if to_regprocedure(v_pred) is null then
    raise exception '#1051 tail T.1: % was not created', v_pred using errcode = 'CLR10';
  end if;
  select p.provolatile = 's' and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner'
         and 'search_path=clara, pg_temp' = any(p.proconfig)
    into v_ok from pg_proc p where p.oid = v_pred::regprocedure;
  if v_ok is not true then
    raise exception '#1051 tail T.1: % is missing its stable/definer/owner/search_path shape', v_pred
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_pred::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1051 tail T.1b: % gained % grant(s) -- it is an INTERNAL, granted to nobody', v_pred, v_n
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_pred::regprocedure, 'execute') then
    raise exception '#1051 tail T.1c: PUBLIC can execute %', v_pred using errcode = 'CLR10';
  end if;

  -- T.2 — THE PREDICATE'S CONTENT: all three admitted kinds, every reason token the two doors
  --       used to raise by hand, and the ONE definition it resolves through.
  select p.prosrc into v_src from pg_proc p where p.oid = v_pred::regprocedure;
  foreach v_names in array array['accounting_work', 'chat_task', 'contract_confirmation',
      'authority_rule_unsupported', 'invalid_authority_kind', 'authority_ref_invalid',
      'clara._authority_ref_refusal(', 'authority_ref_not_human_instruction'] loop
    if position(v_names in v_src) = 0 then
      raise exception '#1051 tail T.2: % does not name %', v_pred, v_names using errcode = 'CLR10';
    end if;
  end loop;

  -- T.3 — THE HUMAN DOOR: this file's own output, its whole posture unmoved, the wall gone from
  --       its body and reached through the predicate instead.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_human::regprocedure;
  if v_sha is distinct from c_human_post then
    raise exception '#1051 tail T.3: % is not this file''s measured output (got %, expected %)',
      v_human, v_sha, c_human_post using errcode = 'CLR10';
  end if;
  select p.prosecdef and p.provolatile = 'v' and p.proowner::regrole::text = 'clara_fn_owner'
         and 'search_path=clara, pg_temp' = any(p.proconfig)
    into v_ok from pg_proc p where p.oid = v_human::regprocedure;
  if v_ok is not true then
    raise exception '#1051 tail T.3b: % lost its definer/volatile/owner/search_path shape', v_human
      using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_human::regprocedure, 'execute') then
    raise exception '#1051 tail T.3c: % lost its clara_authenticated grant to this recut', v_human
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_human::regprocedure
     and a::text not like 'clara_fn_owner=%' and a::text not like 'clara_authenticated=%';
  if v_n <> 0 then
    raise exception '#1051 tail T.3d: % gained % grant(s) beyond clara_authenticated', v_human, v_n
      using errcode = 'CLR10';
  end if;

  -- T.4 — THE TWIN: this file's own output, still reachable by no application role at all.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_obo::regprocedure;
  if v_sha is distinct from c_obo_post then
    raise exception '#1051 tail T.4: % is not this file''s measured output (got %, expected %)',
      v_obo, v_sha, c_obo_post using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_obo::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1051 tail T.4b: % gained % grant(s) -- it is a definer-internal core', v_obo, v_n
      using errcode = 'CLR10';
  end if;

  -- T.5 — THE ONE DEFINITION THIS FILE WRAPS: byte-identical to its #977 pre-image, still
  --       granted to nobody. A fold that moved it would be a rewrite, not a fold.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_refusal::regprocedure;
  if v_sha is distinct from c_refusal then
    raise exception '#1051 tail T.5: % MOVED while this file applied -- it must not have (got %)',
      v_refusal, v_sha using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
       unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = v_refusal::regprocedure and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1051 tail T.5b: % gained % grant(s)', v_refusal, v_n using errcode = 'CLR10';
  end if;

  -- T.6 — THE CENSUS, THE POINT OF THE WHOLE FILE. Exactly TWO clara bodies still spell the
  --       wall's own sentence: the predicate, and the third copy #1080 owns. Exactly TWO call
  --       the predicate: the two doors folded here. `order by p.proname` is the catalog's own C
  --       ordering (`proname` is `name`, which never takes a database collation), so this
  --       comparison against a literal roster is collation-proof by construction.
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and position(c_sentence in p.prosrc) > 0;
  if v_names is distinct from '_accrual_plan_core, _assert_plan_authority' then
    raise exception '#1051 tail T.6: the wall''s sentence lives in {%} -- expected exactly the new predicate and clara._accrual_plan_core, the third copy #1080 owns',
      v_names using errcode = 'CLR10';
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and position('clara._assert_plan_authority(' in p.prosrc) > 0;
  if v_names is distinct from '_obo_plan_core, create_accounting_plan' then
    raise exception '#1051 tail T.6b: the predicate is called by {%} -- expected exactly the two plan doors',
      v_names using errcode = 'CLR10';
  end if;

  -- T.7 — THE PREDICATE, DRIVEN. Every refusal axis it owns, answered by the token the two doors
  --       used to answer with. Read-only: the function is `stable`.
  for r in
    select * from (values
      ('authority_rule', '{"kind":"accounting_work","id":"00000000-0000-4000-8000-000000000001"}'::jsonb, 'authority_rule_unsupported'),
      ('rule_of_thumb',  '{"kind":"accounting_work","id":"00000000-0000-4000-8000-000000000001"}'::jsonb, 'invalid_authority_kind'),
      ('explicit_instruction', null::jsonb, 'authority_ref_invalid'),
      ('explicit_instruction', '"a conversation"'::jsonb, 'authority_ref_invalid'),
      ('explicit_instruction', '{"kind":"knowledge_record","id":"00000000-0000-4000-8000-000000000001"}'::jsonb, 'authority_ref_invalid'),
      ('explicit_instruction', '{"kind":"chat_task","id":"the one we just had"}'::jsonb, 'authority_ref_invalid'),
      ('explicit_instruction', '{"kind":"accounting_work","id":"00000000-0000-4000-8000-0000000000fd"}'::jsonb, 'authority_ref_unresolved'),
      ('explicit_instruction', '{"kind":"contract_confirmation","id":"00000000-0000-4000-8000-0000000000fd"}'::jsonb, 'authority_ref_unresolved')
    ) as t(kind, ref, expected)
  loop
    v_reason := null;
    begin
      perform clara._assert_plan_authority(r.kind, r.ref,
        '00000000-0000-4000-8000-0000000000fe'::uuid, '00000000-0000-4000-8000-0000000000ff'::uuid);
    exception when others then
      get stacked diagnostics v_detail = PG_EXCEPTION_DETAIL;
      v_reason := (v_detail::jsonb) ->> 'reason';
    end;
    if v_reason is distinct from r.expected then
      raise exception '#1051 tail T.7: the predicate answered % for (kind=%, ref=%) -- expected %',
        coalesce(v_reason, '(admitted)'), r.kind, coalesce(r.ref::text, '(null)'), r.expected
        using errcode = 'CLR10';
    end if;
  end loop;


  -- T.8 — THE FOLD IS A FOLD, PROVED BY REVERSE SUBSTITUTION (0318's own idiom). A post-image
  --       pin says the catalog holds what this file's text says; it does NOT say that text is
  --       the pre-image with one block moved. So: read the INSTALLED body, put 0308's own wall
  --       block and the three declarations that block alone used back where they were, and
  --       require the result to hash to the pre-image the prestate pinned. Anything smuggled
  --       anywhere else in either pasted body reds this migration instead of shipping.
  select p.prosrc into v_src from pg_proc p where p.oid = v_human::regprocedure;
  v_restored := replace(replace(v_src, $p1051_nh$  -- THE AUTHORITY SHAPE -- #1051: ONE PREDICATE, shared with clara._obo_plan_core.
  -- Everything this block used to spell out -- the two authority-kind refusals, the three
  -- authority_ref shape refusals, the admitted-kind list and #977 (0250) resolution through
  -- clara._authority_ref_refusal -- is now written ONCE, in clara._assert_plan_authority, byte
  -- for byte as this body carried it. Nothing about what this door admits or refuses moves.
  perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, v_firm, p_client);
$p1051_nh$, $p1051_oh$  -- THE AUTHORITY SHAPE.
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
  -- #949 (0300): a THIRD kind, additively. clara.contract_plan_confirmations is the tenancy
  -- lane's own record of a named person confirming a rent plan; clara._authority_ref_refusal
  -- resolves it under the same firm-and-client ladder as the other two.
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task','contract_confirmation') then
    raise exception 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'
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
  -- #977 (0250): RESOLVED, not merely well-shaped -- and, on the CHAT-LANE arm, a PERSON'S
  -- INSTRUCTION rather than a task the estate enqueued for itself. A Knowledge preference, a
  -- calculation policy or a repeated debit has no row here, so none of them can supply authority;
  -- an agent run HAS one, and #977 is the ruling that stops it counting.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, v_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;
$p1051_oh$),
                        $p1051_nhd$  v_warning jsonb; v_next jsonb; v_result jsonb;
$p1051_nhd$, $p1051_ohd$  v_ref_kind text; v_ref_id uuid; v_reason text; v_warning jsonb; v_next jsonb; v_result jsonb;
$p1051_ohd$);
  if encode(sha256(convert_to(v_restored,'UTF8')),'hex') is distinct from c_human_pre then
    raise exception '#1051 tail T.8: putting 0308''s own authority block back into the installed clara.create_accounting_plan does NOT reproduce its pre-image % -- something outside the wall moved in this file''s pasted body',
      c_human_pre using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_obo::regprocedure;
  v_restored := replace(replace(v_src, $p1051_no$  -- THE AUTHORITY SHAPE -- #1051: THE SAME PREDICATE clara.create_accounting_plan calls, which
  -- is what "verbatim from clara.create_accounting_plan" was trying and failing to guarantee.
  -- The twin keeps ALL THREE admitted kinds (the riders wave-4 integrator carried
  -- contract_confirmation into this body; this file does not take it away), and it now keeps
  -- them by SHARING the list rather than by re-typing it.
  perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, p_firm, p_client);
$p1051_no$, $p1051_oo$  -- THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan.
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
  -- RIDERS WAVE 4 INTEGRATION: the THIRD kind, because "verbatim from
  -- clara.create_accounting_plan" above is a claim this file's own cells MEASURE --
  -- p915.obo.refusals_match and p941.obo.authority drive both entrances on the same state
  -- and require the same sentence byte for byte. Lane 01's 0300 added
  -- contract_confirmation to the human door, so the twin carries it too or the parity
  -- breaks. It admits nothing new in substance: clara._authority_ref_refusal, which 0300
  -- also widened, still resolves the reference under the same firm-and-client ladder, and
  -- a contract_confirmation row IS a named person's own confirmation -- exactly the
  -- "person's instruction" #977 requires and an agent run cannot manufacture.
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task','contract_confirmation') then
    raise exception 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'
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
  -- RESOLVED, and on the CHAT-LANE arm a PERSON'S instruction rather than a task the estate
  -- enqueued for itself (#977, 0250). The chat entrance these doors open is exactly the caller
  -- that will supply `{kind:'chat_task', id: <this turn>}`, so this is the wall that stops a wake
  -- run or an autodraft from authorising its own schedule.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, p_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;
$p1051_oo$),
                        $p1051_nod$  v_plan uuid; v_rev uuid; v_digest text;
$p1051_nod$, $p1051_ood$  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_reason text;
$p1051_ood$);
  if encode(sha256(convert_to(v_restored,'UTF8')),'hex') is distinct from c_obo_pre then
    raise exception '#1051 tail T.8: putting 0308''s own authority block back into the installed clara._obo_plan_core does NOT reproduce its pre-image % -- something outside the wall moved in this file''s pasted body',
      c_obo_pre using errcode = 'CLR10';
  end if;

  raise notice '#1051 tail: OK -- clara._assert_plan_authority exists as a stable, definer, clara_fn_owner-owned, search_path-pinned internal granted to nobody, naming all THREE admitted kinds and resolving through clara._authority_ref_refusal, which is itself byte-identical to its #977 pre-image and still ungranted; clara.create_accounting_plan and clara._obo_plan_core are both at this file''s measured outputs with their grant postures unmoved, neither carries a line of the wall any more, and they are the ONLY two callers of the predicate; the wall''s own sentence now lives in exactly two bodies -- the predicate and clara._accrual_plan_core, the third copy #1080 owns; and the predicate answered every one of its eight refusal axes with the token the two doors used to answer with.';
end
$p1051_tail$;
