-- 0205_resolve_stripe_event_problem_audit — #775:
-- THE OPERATOR'S RESOLUTION OF A PROVIDER PROBLEM GAINS THE AUDIT ROW ITS SIBLINGS ALREADY WRITE.
-- =====================================================================================
-- Spec of record: issue #775 and the Agent Brief in its triage comment. Domain words: CONTEXT.md.
-- docs/ARCHITECTURE.md §2 (the admission-and-operator-support anchor) records the closed gap.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.resolve_stripe_event_problem` (0160 §5) — the
-- one governed operator decision on the admission estate that left NO entry in
-- `clara.audit_log` — gains exactly one `perform clara._audit(...)` call, in the same position and
-- the same positional shape `clara.set_admission_capacity` (0186 §C),
-- `clara.set_wake_source_enabled` (0133) and `clara.claim_paid_firm` already use. NOTHING ELSE in
-- the body moves: the same `(uuid,text,text)` signature, the same authority fragment, the same
-- CLR10/CLR11/CLR09 refusals, the same `_reserve_op`/`_finish_op` receipt, the same return jsonb.
--
-- WHY A RECUT RATHER THAN AN EDIT. 0160's applied bytes are immutable (packages/db/README.md,
-- "Migration and deployment behavior"); nothing between 0160 and 0198 recuts or pins this body,
-- so 0160 is still the live owner and `create or replace function` is the whole change. 0198 is
-- the closest precedent for the shape of this file — a prestate block that refuses to apply
-- unless the live body is exactly the one it claims to be editing, the recut under the function
-- owner role with the revoke/grant lines repeated, and a tail census that re-reads the COMMITTED
-- catalog rather than trusting the statements above it.
--
-- WHERE THE CALL SITS, AND WHY IT MATTERS. AFTER the `clara._reserve_op` replay check and BEFORE
-- `clara._finish_op`. Inside the reservation, a lost-response retry under the same `op_key`
-- returns at the replay check and writes NO second audit row — one decision, one audit line.
-- Placed BEFORE the reservation it would write one row per retry, which is the arm
-- `packages/db/tests/operator-support.test.mjs` os.13 now pins behaviourally.
--
-- WHAT RIDES IN `args`, AND WHY IT IS LAWFUL. `{problem, event, resolution}` — the problem id, the
-- provider event id the body already reads for its own receipt, and the TRIMMED resolution text.
-- `clara.audit_log`'s own header admits ids and keys and refuses document or payload bodies; an
-- operator-typed sentence is admitted by precedent, because `clara.set_admission_capacity` already
-- writes its operator-typed `reason` into the same column.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: NONE THAT IS NEW.
--
-- clara.resolve_stripe_event_problem                          (operator-firm owner)
--   CLR04 'insufficient role'                       — not the operator firm / below owner rank
--   CLR10 'problem is required' / 'resolution is required' / 'op_key is required'
--   CLR10 'op_key reused with different args'       — _reserve_op's own, unchanged
--   CLR11 'stripe event problem not found'
--   CLR09 'stripe event problem is already resolved'
-- Every one of them is 0160's, carried over verbatim. This file opens no door and closes none.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w775_pre$
declare n text; v_src text; v_n int; v_missing text;
begin
  -- 0.1 · the prerequisites the recut body calls, in exact regprocedure form. The verb itself must
  -- already exist, because this file REPLACES it rather than creating it.
  foreach n in array array[
    'clara.resolve_stripe_event_problem(uuid,text,text)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._reserve_op(uuid,text,text,bytea)',
    'clara._finish_op(uuid,text,text,jsonb)',
    'clara._human_ctx(integer)',
    'clara._hash(jsonb)',
    'clara.role_rank(text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#775 prestate: prerequisite absent: % (migration 0160 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the relations the body and the new audit row touch.
  if to_regclass('clara.stripe_event_problems') is null or to_regclass('clara.audit_log') is null then
    raise exception '#775 prestate: clara.stripe_event_problems or clara.audit_log is absent'
      using errcode='CLR10';
  end if;

  -- 0.3 · EXACTLY ONE body of this name. A recut that created an OVERLOAD instead of replacing the
  -- live body would leave PostgREST calling whichever one resolves — 0198 §0.3 states the same
  -- rule for the same hazard, and 0105's tail states it for clara.begin_chat_turn.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='resolve_stripe_event_problem';
  if v_n <> 1 then
    raise exception '#775 prestate: clara.resolve_stripe_event_problem has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.4 · THE LIVE BODY IS 0160's, AND IT DOES NOT ALREADY CARRY THE AUDIT CALL. Measured from
  -- prosrc rather than assumed from a file listing: this file's whole claim is "one call arrives
  -- and nothing else moves", and that claim is only checkable against the text actually installed.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;
  if position('clara._audit(' in v_src) <> 0 then
    raise exception '#775 prestate: the live clara.resolve_stripe_event_problem ALREADY calls clara._audit — this file has nothing to add and would silently re-write somebody else''s body'
      using errcode='CLR10';
  end if;
  v_missing := '';
  if position('clara._reserve_op(c.firm,''resolve_stripe_event_problem'',p_op_key' in v_src) = 0
    then v_missing := v_missing || ' reserve_op'; end if;
  if position('clara._finish_op(c.firm,''resolve_stripe_event_problem'',p_op_key,v_result)' in v_src) = 0
    then v_missing := v_missing || ' finish_op'; end if;
  if position('f.id = clara.jwt_firm() and f.is_operator' in v_src) = 0
    then v_missing := v_missing || ' operator-fragment'; end if;
  if position('clara._human_ctx(clara.role_rank(''owner''))' in v_src) = 0
    then v_missing := v_missing || ' owner-floor'; end if;
  if position('stripe event problem is already resolved' in v_src) = 0
    then v_missing := v_missing || ' already-resolved-refusal'; end if;
  if position('stripe event problem not found' in v_src) = 0
    then v_missing := v_missing || ' not-found-refusal'; end if;
  if position('set resolved_at=now(), resolved_by=c.actor, resolution=v_resolution' in v_src) = 0
    then v_missing := v_missing || ' resolution-stamp'; end if;
  if v_missing <> '' then
    raise exception '#775 prestate: the live clara.resolve_stripe_event_problem is not 0160''s body — missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.5 · THE REFERENCE SHAPE THIS FILE COPIES. `clara.set_admission_capacity` is the sibling whose
  -- positional `clara._audit` call this recut reproduces; if IT no longer carries one, the shape
  -- being copied has moved and this file would be inventing a convention rather than following it.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_admission_capacity(integer,text,text)'::regprocedure;
  if v_src is null or position('clara._audit(c.firm, c.actor, null, null,' in v_src) = 0 then
    raise exception '#775 prestate: the reference body (set_admission_capacity) no longer carries the positional clara._audit call this file copies'
      using errcode='CLR10';
  end if;

  raise notice '#775 prestate: clean — clara.resolve_stripe_event_problem exists exactly once at (uuid,text,text), carries 0160''s body (owner floor, operator fragment, both refusals, the resolution stamp, _reserve_op and _finish_op) and calls clara._audit nowhere; clara.set_admission_capacity still carries the positional audit shape this recut copies.';
end
$w775_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §1 THE RECUT. 0160 §5's body with ONE call added.
--
-- The body below is 0160's, character for character, except for the `perform clara._audit(...)`
-- statement between the resolution stamp and the `clara._finish_op` return. The posture 0160
-- established is re-asserted rather than inherited — same signature, SECURITY DEFINER,
-- `search_path = clara, pg_temp`, and the revoke/grant pair repeated below — so a reader of this
-- file sees the whole door rather than a diff against a file they would have to go and find.
--
-- NO `plan_cache_mode` PIN. 0183's pin belongs to bodies that bind the session firm into a cached
-- read; this is a WRITE door reached once per decision, 0160 gave it no pin, and adding one here
-- would be a posture change this ticket did not ask for.
-- =====================================================================================
create or replace function clara.resolve_stripe_event_problem(
  p_problem uuid,
  p_resolution text,
  p_op_key text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;
  v_dedupe jsonb;
  v_problem clara.stripe_event_problems%rowtype;
  v_resolution text;
  v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
  if p_problem is null then
    raise exception 'problem is required' using errcode='CLR10';
  end if;
  v_resolution := nullif(btrim(p_resolution),'');
  if v_resolution is null then
    raise exception 'resolution is required' using errcode='CLR10';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;

  v_dedupe := clara._reserve_op(c.firm,'resolve_stripe_event_problem',p_op_key,
    clara._hash(jsonb_build_object(
      'problem',p_problem,'resolution',v_resolution,'actor',c.actor)));
  if v_dedupe is not null then
    return v_dedupe;
  end if;

  select * into v_problem from clara.stripe_event_problems
   where id=p_problem for update;
  if not found then
    raise exception 'stripe event problem not found' using errcode='CLR11';
  end if;
  if v_problem.resolved_at is not null then
    raise exception 'stripe event problem is already resolved' using errcode='CLR09';
  end if;

  update clara.stripe_event_problems
     set resolved_at=now(), resolved_by=c.actor, resolution=v_resolution
   where id=p_problem;

  -- #775 · THE ONE NEW STATEMENT. Positional, exactly as set_admission_capacity calls it:
  -- (firm, actor, on_behalf_of, via_wake_kind, fn, entry_id, args). On-behalf-of, wake kind and
  -- entry are null — an operator decides in their own name, on no journal entry — and the row's
  -- timestamp is clara.audit_log's own default.
  perform clara._audit(c.firm, c.actor, null, null, 'resolve_stripe_event_problem', null,
    jsonb_build_object('problem',p_problem,'event',v_problem.event_id,'resolution',v_resolution));

  v_result := jsonb_build_object(
    'problem_id',p_problem,'event_id',v_problem.event_id,'resolved',true);
  return clara._finish_op(c.firm,'resolve_stripe_event_problem',p_op_key,v_result);
end $$;

revoke all on function clara.resolve_stripe_event_problem(uuid,text,text) from public;
grant execute on function clara.resolve_stripe_event_problem(uuid,text,text) to clara_authenticated;

comment on function clara.resolve_stripe_event_problem(uuid,text,text) is
  '#615 (0160 §5), audit recut by #775: an operator resolves one Stripe event problem. OWNER of '
  'the OPERATOR firm only. Idempotent through clara._reserve_op/_finish_op on p_op_key. Writes '
  'ONE clara.audit_log row — fn resolve_stripe_event_problem, the operator firm, the resolving '
  'operator, args {problem, event, resolution} — INSIDE the reservation, so a lost-response retry '
  'replays the receipt and writes no second row. Refuses CLR04 (not the operator firm / below '
  'owner rank), CLR10 (problem/resolution/op_key required, op_key reused with different args), '
  'CLR11 (problem not found) and CLR09 (already resolved).';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w775_tail$
declare v_src text; v_n int; v_posture text; v_missing text; v_audit_count int;
begin
  -- 1 · still exactly ONE body, at the same signature. An added overload is this file's sharpest
  -- failure mode and the reason 0160's signature is named literally here.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='resolve_stripe_event_problem';
  if v_n <> 1 then
    raise exception '#775 tail: clara.resolve_stripe_event_problem now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.resolve_stripe_event_problem(uuid,text,text)') is null then
    raise exception '#775 tail: clara.resolve_stripe_event_problem(uuid,text,text) no longer resolves'
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;

  -- 2 · THE AUDIT CALL IS THERE, EXACTLY ONCE, AND IT CARRIES THE THREE KEYS. The literal probe
  -- this whole file exists for. A COUNT rather than a presence check: two calls would write two
  -- rows for one decision, which no assertion about the first row would notice.
  v_audit_count := (length(v_src) - length(replace(v_src, 'clara._audit(', '')))
                   / length('clara._audit(');
  if v_audit_count <> 1 then
    raise exception '#775 tail: the committed body calls clara._audit % time(s), expected exactly 1', v_audit_count
      using errcode='CLR10';
  end if;
  if position('''resolve_stripe_event_problem'', null,' in v_src) = 0 then
    raise exception '#775 tail: the audit call does not name fn=resolve_stripe_event_problem with a null entry'
      using errcode='CLR10';
  end if;
  if position('jsonb_build_object(''problem'',p_problem,''event'',v_problem.event_id,''resolution'',v_resolution)' in v_src) = 0 then
    raise exception '#775 tail: the audit call does not carry args {problem, event, resolution}'
      using errcode='CLR10';
  end if;

  -- 3 · IT SITS INSIDE THE RESERVATION. A text census can state the ORDER of the three statements,
  -- which is exactly the property a replay depends on; the behavioural half is
  -- packages/db/tests/operator-support.test.mjs os.13.
  if not (position('clara._reserve_op(' in v_src) < position('clara._audit(' in v_src)
          and position('clara._audit(' in v_src) < position('clara._finish_op(' in v_src)) then
    raise exception '#775 tail: the audit call is not between clara._reserve_op and clara._finish_op -- a retry would write a second row'
      using errcode='CLR10';
  end if;

  -- 4 · EVERY OTHER ARM 0160 SHIPPED SURVIVED, arm by arm, against the committed text.
  v_missing := '';
  if position('clara._human_ctx(clara.role_rank(''owner''))' in v_src) = 0
    then v_missing := v_missing || ' owner-floor'; end if;
  if position('f.id = clara.jwt_firm() and f.is_operator' in v_src) = 0
    then v_missing := v_missing || ' operator-fragment'; end if;
  if position('''problem is required''' in v_src) = 0 then v_missing := v_missing || ' problem-required'; end if;
  if position('''resolution is required''' in v_src) = 0 then v_missing := v_missing || ' resolution-required'; end if;
  if position('''op_key is required''' in v_src) = 0 then v_missing := v_missing || ' op_key-required'; end if;
  if position('nullif(btrim(p_resolution),'''')' in v_src) = 0 then v_missing := v_missing || ' resolution-trim'; end if;
  if position('where id=p_problem for update' in v_src) = 0 then v_missing := v_missing || ' row-lock'; end if;
  if position('''stripe event problem not found''' in v_src) = 0 then v_missing := v_missing || ' not-found'; end if;
  if position('''stripe event problem is already resolved''' in v_src) = 0 then v_missing := v_missing || ' already-resolved'; end if;
  if position('set resolved_at=now(), resolved_by=c.actor, resolution=v_resolution' in v_src) = 0
    then v_missing := v_missing || ' resolution-stamp'; end if;
  if position('''problem_id'',p_problem,''event_id'',v_problem.event_id,''resolved'',true' in v_src) = 0
    then v_missing := v_missing || ' return-shape'; end if;
  if v_missing <> '' then
    raise exception '#775 tail: the recut LOST arm(s):% -- only the audit call may arrive', v_missing
      using errcode='CLR10';
  end if;
  -- …and the owner-rank floor is stated EXACTLY once (0145 §K (8b)'s correction: a presence check
  -- stays green while a second, decorative occurrence masks a downgrade of the real one).
  v_n := (length(v_src) - length(replace(v_src, 'clara.role_rank(''owner''', '')))
         / length('clara.role_rank(''owner''');
  if v_n <> 1 then
    raise exception '#775 tail: the owner-rank floor occurs % time(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;

  -- 5 · POSTURE, read from the catalog rather than from this file's own text: owner, SECURITY
  -- DEFINER, pinned search_path, and the EXACT ACL (grantor included) -- clara_authenticated and
  -- nobody else, PUBLIC revoked. This is what keeps the estate-wide grant matrix and the FS-4 C-2
  -- door cohort census green across the recut.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#775 tail: the door has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and EXECUTE to clara_authenticated only; got {%}', v_posture
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure, 'execute') then
    raise exception '#775 tail: PUBLIC still holds EXECUTE on clara.resolve_stripe_event_problem'
      using errcode='CLR10';
  end if;

  -- 6 · THE SIBLING DOOR THIS FILE DID NOT TOUCH. clara.list_stripe_event_problems shares 0160 §5
  -- and its cohort census; a recut that had accidentally dropped or re-owned it would show here.
  if not exists (
    select 1 from pg_proc p
     where p.oid = 'clara.list_stripe_event_problems(boolean)'::regprocedure
       and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
       and has_function_privilege('clara_authenticated', p.oid, 'execute')
       and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception '#775 tail: clara.list_stripe_event_problems moved -- this file touches only its sibling'
      using errcode='CLR10';
  end if;

  raise notice '#775 tail: OK -- clara.resolve_stripe_event_problem exists exactly once at (uuid,text,text), owned by clara_fn_owner, SECURITY DEFINER, search_path-pinned, PUBLIC-revoked and EXECUTE-reachable by clara_authenticated alone; it now calls clara._audit EXACTLY once, with fn=resolve_stripe_event_problem, a null entry and args {problem, event, resolution}, positioned between clara._reserve_op and clara._finish_op so a lost-response retry replays the receipt and writes no second row; and every arm 0160 shipped is re-measured present in the committed text -- the owner-rank floor stated exactly once, the byte-copied operator-firm fragment, the three CLR10 argument refusals, the trimmed resolution, the FOR UPDATE row lock, the CLR11 not-found and CLR09 already-resolved refusals, the resolution stamp and the {problem_id, event_id, resolved} return. clara.list_stripe_event_problems is untouched.';
end
$w775_tail$;
