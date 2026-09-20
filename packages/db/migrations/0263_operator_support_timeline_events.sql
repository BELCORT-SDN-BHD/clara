-- 0263_operator_support_timeline_events — #843: THE OPERATOR'S SUPPORT ACTS BECOME READABLE ON
-- THE OPERATOR FIRM'S OWN TIMELINE.
-- =====================================================================================
-- Spec of record: issue #843's Agent Brief (triage comment of 2026-09-17), the owner's route-A
-- confirmation of 2026-09-18, and the correction comment that replaces the brief's retiring read
-- (`clara.list_firm_timeline`) with `clara.list_activity`. Domain words: CONTEXT.md — "Activity",
-- "Operator firm".
--
-- THE PROBLEM, IN ONE SENTENCE. The operator console offers THREE support acts, all three are
-- stamped in `clara.audit_log` (0145, 0186 §C, 0205), and only ONE of them appends a domain event:
-- `clara.reject_firm_registration` fires `firm_registration.rejected` (0145 §D) and therefore
-- appears on the firm's timeline, while `clara.set_admission_capacity` and
-- `clara.resolve_stripe_event_problem` append an audit row nobody reads — no door in the estate
-- reads `clara.audit_log`, and the only human reach is the firm-scoped table SELECT that
-- `operator-support.test.mjs` os.13 exercises.
--
-- WHAT THIS FILE CHANGES. The two silent acts each gain ONE `clara._append_event` call, in the
-- position their `clara._audit` call already occupies and INSIDE the operation reservation, and
-- the two event types they name are registered and routed. No new door, no new read surface, no
-- change to `clara.list_activity` / `clara.get_activity_event` / `clara.firm_timeline_visible`,
-- and not one byte of the redacted audit table is exposed.
--
-- =====================================================================================
-- THE TWO NEW EVENT TYPE NAMES, AND WHY THESE.
--
--   admission.capacity_set        — clara.set_admission_capacity
--   stripe_event.problem_resolved — clara.resolve_stripe_event_problem
--
-- The catalog's house shape is `<aggregate>.<fact>`, where the fact may be a compound
-- (`bank.account_created`, `bank.line_exception_resolved`, `firm_setup.item_answered`,
-- `client.onboarding_facts_settled`), and the aggregate is the THING decided about — never the
-- function that decides. `admission` is the estate-level subject `clara.admission_capacity` and
-- the whole `claim_paid_firm` wall already belong to; `stripe_event` is the subject
-- `clara.stripe_event_problems` hangs off. Both are firm-level (`client_scoped = false`): an
-- admission act names no client, which is the brief's own words.
--
-- ROUTED `context_update` at the ACTIVE taxonomy version, which is 0145 §G's own choice for the
-- two registration-decision types and 0141's for invite.issued/invite.revoked, stated there in
-- one line this file has no reason to depart from: "an operator's ruling is not something that
-- wakes the agent."
--
-- =====================================================================================
-- THE ACTIVITY KIND THEY LAND ON: THE DOOR'S STATED DEFAULT, DELIBERATELY.
--
-- `clara.list_activity`'s ladder (0202) recognises `sweep.run_completed`, `entry.%`, `document.%`,
-- `close.%` and `work.%`, and files everything else under `documents` — its stated `else` arm.
-- Neither new type matches a recognised prefix, so both ride that default. #843's own correction
-- comment asks this file to DECIDE that with #861 (the open recut of the same ladder) and to say
-- which: they RIDE THE DEFAULT, and they do it together with `firm_registration.rejected`, the
-- support act that was already visible and already rides it.
--
-- The reason is the owner's #861 ruling of 2026-09-18, which fixes FIVE new kinds — `people`
-- (member.*, invite.*), `assets` (asset.*), `counterparties` (counterparty.*), `clients`
-- (client.*, knowledge.*), `firm` (firm.*) — and none of them covers an operator admission act.
-- Note `firm_registration.rejected` is NOT matched by `firm.%` (the fifth character is `_`, and
-- `.` in a LIKE pattern is a literal), so the already-visible act rides the default after #861
-- too; putting the two new types anywhere else would SPLIT the three acts this ticket exists to
-- show together. A sixth kind is new user-visible vocabulary, and vocabulary is the owner's call.
--
-- =====================================================================================
-- THE PAYLOADS ARE ID-SHAPED OR EMPTY, AND THAT IS A CONFIDENTIALITY RULE, NOT A SHORTCUT.
--
-- `clara.domain_events` is read ESTATE-WIDE by `clara_runtime` (0005's own N2 note: "money never
-- appears here — the log is id-shaped only"), whereas `clara.audit_log` is firm-scoped under
-- forced RLS. `clara.reject_firm_registration` already draws that line inside one body: its audit
-- row carries `{request, reason}` and its event carries `{request}` — the operator's free text
-- stays behind the firm wall. This file copies that line exactly:
--
--   * `stripe_event.problem_resolved` carries `{problem}` and NOT the operator's resolution text.
--   * `admission.capacity_set` carries `{}`. There is no id to carry (`clara.admission_capacity`
--     is a one-row singleton keyed `id = true`), and `max_firms`/`firms_count` are precisely the
--     business-confidential numbers #628's own review round (S4) moved BEHIND the operator wall —
--     "how many firms this estate has sold" is not something to hand `clara_runtime` for every
--     firm. `clara.member.role_changed` (0145 §D) appends the same empty payload for the same
--     reason. The figures stay where they already are: the audit row one line above.
--
-- Neither payload is read by the timeline in any case: `clara.firm_timeline_visible` projects no
-- `payload` column at all, so a timeline row is (event_type, description, actor, occurred_at).
--
-- =====================================================================================
-- WHY `create or replace`, AND WHERE THE NEW STATEMENT SITS.
--
-- Neither recut changes a signature, so `create or replace` is the correct tool and the safer one:
-- it preserves owner, SECURITY DEFINER, every pinned `search_path`/`plan_cache_mode` setting and
-- the exact ACL. §0.6 measures that posture before, §T re-reads it after, because a property is
-- not preserved because a migration says it is. The revoke/grant/comment triple is nevertheless
-- re-issued for both doors — 0205's own discipline for this exact pair of bodies: "a reader of
-- this file sees the whole door rather than a diff against a file they would have to go and find."
--
-- THE CALL SITS IMMEDIATELY AFTER THE `clara._audit` CALL, which is `reject_firm_registration`'s
-- own order and is INSIDE the `_reserve_op`/`_finish_op` reservation. That placement is the whole
-- idempotence story: a lost-response retry under the same op_key returns at the `v_dedupe` guard,
-- long before either write, so it appends no second line — exactly what os.13 already proves for
-- the audit row, and what this ticket's os.21 now proves for the event.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md). A pre-merge fix-round edit of THIS file uses the supported redo path
-- (`CLARA_MIGRATION_REDO`, #957), which is why §0.3 admits a re-apply over its own effects
-- explicitly instead of refusing it.
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME AS BEFORE. Neither
-- recut adds, removes or renames a refusal — `clara._append_event` validates no caller input. The
-- two rosters are restated on the two `comment on function` lines below, unchanged.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits —
-- sha256(prosrc) pins MEASURED ON THIS RIG NOW, per the wave-2 addendum (a ticket before this one
-- in the lane may have recut a body this file touches; #840's 0262 recut the two ACTIVITY doors
-- and neither of them is touched here, but the discipline is the same either way: pin what is
-- LIVE, never what a file listing implies).
-- =====================================================================================
do $w843_pre$
declare
  n text; v_src text; v_sha text; v_posture text; v_n int; v_missing text;
  v_applied_cap boolean; v_applied_res boolean;
begin
  -- 0.1 · the prerequisites this file recuts, calls or registers against.
  foreach n in array array[
    'clara.set_admission_capacity(integer,text,text)',
    'clara.resolve_stripe_event_problem(uuid,text,text)',
    'clara.reject_firm_registration(uuid,text,text)',
    'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._human_ctx(int)', 'clara.role_rank(text)', 'clara.jwt_firm()',
    'clara._admission_capacity_state()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#843 prestate: prerequisite absent: % (0145 / 0186 / 0205 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;
  foreach n in array array[
    'clara.event_types', 'clara.trigger_taxonomy', 'clara.taxonomy_active', 'clara.domain_events',
    'clara.firm_timeline_visible', 'clara.admission_capacity', 'clara.stripe_event_problems'
  ] loop
    if to_regclass(n) is null then
      raise exception '#843 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · exactly ONE body per name. An added overload is this file's sharpest failure mode: a
  -- second `set_admission_capacity` at a different arity would still resolve for some callers.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='set_admission_capacity';
  if v_n <> 1 then
    raise exception '#843 prestate: clara.set_admission_capacity has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='resolve_stripe_event_problem';
  if v_n <> 1 then
    raise exception '#843 prestate: clara.resolve_stripe_event_problem has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.3 · THE LIVE BODY IS 0186 §C's, pinned by prosrc sha-256, MEASURED ON THIS RIG NOW —
  -- *unless* this file's own effect is already present, which is the supported redo path (#957,
  -- packages/db/README.md). A redo re-runs the edited file against a database carrying the OLD
  -- effects, so a bare "must equal the pre-image" pin would make this file un-redoable; a bare
  -- "already applied" tolerance would let it overwrite a body it never read. Both are measured,
  -- and the two outcomes are named separately in the notice below.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_admission_capacity(integer,text,text)'::regprocedure;
  v_applied_cap := position('''admission.capacity_set''' in v_src) <> 0;
  if not v_applied_cap then
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha is distinct from '190d0fe847c2ab24eb6a257c68e2478f10c5df857f96e085846f6b43243a7c86' then
      raise exception '#843 prestate: clara.set_admission_capacity has DRIFTED from the pinned 0186 body (sha %) -- re-derive §2 against the live body before applying', v_sha
        using errcode='CLR10';
    end if;
  end if;

  -- …and the same, for 0205 §1's body (the #775 audit recut, which is what is live today).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;
  v_applied_res := position('''stripe_event.problem_resolved''' in v_src) <> 0;
  if not v_applied_res then
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha is distinct from '979898e7f342fa818c81c070b68f013e951dd53829eb3a8926055507349d28c7' then
      raise exception '#843 prestate: clara.resolve_stripe_event_problem has DRIFTED from the pinned 0205 body (sha %) -- re-derive §3 against the live body before applying', v_sha
        using errcode='CLR10';
    end if;
  end if;
  -- THE TWO DOORS ARE MEASURED SEPARATELY AND ARE ALLOWED TO DISAGREE, deliberately. Both recuts
  -- land in ONE transaction, so this file itself never leaves one door ahead of the other; the
  -- only way to reach that state is a hand recut on a development rig (a vacuity control reverting
  -- ONE body to prove a cell red, then re-applying through the #957 redo path). Refusing it would
  -- turn a legitimate rig operation into a dead end, because the catalog half CANNOT be undone:
  -- clara.event_types is append-only (0005 / rig-events-structure.test.mjs §6), so a registration
  -- is permanent once made. Each door's own body is still pinned above, which is the check that
  -- matters: nothing is overwritten unread.

  -- 0.4 · THE ARMS THIS RECUT CARRIES OVER UNCHANGED, named one by one against the live text, so
  -- a reader of a failure knows WHICH property the sha was standing for. Asserted on BOTH paths
  -- (pre-image and redo): these are the properties the new statement depends on, not decoration.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_admission_capacity(integer,text,text)'::regprocedure;
  v_missing := '';
  if position('clara._human_ctx(clara.role_rank(''owner''))' in v_src) = 0
    then v_missing := v_missing || ' owner-floor'; end if;
  if position('f.id = clara.jwt_firm() and f.is_operator' in v_src) = 0
    then v_missing := v_missing || ' operator-fragment'; end if;
  if position('clara._reserve_op(c.firm, ''set_admission_capacity'', p_op_key' in v_src) = 0
    then v_missing := v_missing || ' reserve_op'; end if;
  if position('clara._finish_op(c.firm, ''set_admission_capacity'', p_op_key' in v_src) = 0
    then v_missing := v_missing || ' finish_op'; end if;
  if position('clara._audit(c.firm, c.actor, null, null, ''set_admission_capacity'', null,' in v_src) = 0
    then v_missing := v_missing || ' audit-call'; end if;
  if position('pg_catalog.hashtextextended(''clara.admission-capacity'', 0)' in v_src) = 0
    then v_missing := v_missing || ' advisory-lock'; end if;
  if v_missing <> '' then
    raise exception '#843 prestate: the live clara.set_admission_capacity is not 0186 §C''s body -- missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;
  v_missing := '';
  if position('clara._human_ctx(clara.role_rank(''owner''))' in v_src) = 0
    then v_missing := v_missing || ' owner-floor'; end if;
  if position('f.id = clara.jwt_firm() and f.is_operator' in v_src) = 0
    then v_missing := v_missing || ' operator-fragment'; end if;
  if position('clara._reserve_op(c.firm,''resolve_stripe_event_problem'',p_op_key' in v_src) = 0
    then v_missing := v_missing || ' reserve_op'; end if;
  if position('clara._finish_op(c.firm,''resolve_stripe_event_problem'',p_op_key,v_result)' in v_src) = 0
    then v_missing := v_missing || ' finish_op'; end if;
  if position('clara._audit(c.firm, c.actor, null, null, ''resolve_stripe_event_problem'', null,' in v_src) = 0
    then v_missing := v_missing || ' audit-call'; end if;
  if position('set resolved_at=now(), resolved_by=c.actor, resolution=v_resolution' in v_src) = 0
    then v_missing := v_missing || ' resolution-stamp'; end if;
  if position('stripe event problem is already resolved' in v_src) = 0
    then v_missing := v_missing || ' already-resolved-refusal'; end if;
  if position('stripe event problem not found' in v_src) = 0
    then v_missing := v_missing || ' not-found-refusal'; end if;
  if v_missing <> '' then
    raise exception '#843 prestate: the live clara.resolve_stripe_event_problem is not 0205 §1''s body -- missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.5 · THE REFERENCE SHAPE THIS FILE COPIES. `clara.reject_firm_registration` is the sibling
  -- that already audits AND appends; if IT no longer carries the pair, the convention being
  -- followed has moved and this file would be inventing one rather than following it.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.reject_firm_registration(uuid,text,text)'::regprocedure;
  if v_src is null
     or position('clara._audit(c.firm, c.actor, null, null, ''reject_firm_registration'', null,' in v_src) = 0
     or position('clara._append_event(c.firm, ''firm_registration.rejected'', null, c.actor' in v_src) = 0 then
    raise exception '#843 prestate: the reference body (reject_firm_registration) no longer carries the audit-then-append pair this file copies'
      using errcode='CLR10';
  end if;

  -- 0.6 · THE POSTURE `create or replace` is trusted to preserve, measured now so §T's re-read
  -- after the recut is a COMPARISON rather than a hopeful assertion.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.set_admission_capacity(integer,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#843 prestate: clara.set_admission_capacity does not carry the posture this file re-asserts; got {%}', v_posture
      using errcode='CLR10';
  end if;
  -- The sibling's posture is DELIBERATELY NOT identical: 0205's own header states why this door
  -- carries no `plan_cache_mode` pin ("0183's pin belongs to bodies that bind the session firm
  -- into a cached read; this is a WRITE door reached once per decision"). Pinned as it IS, so
  -- this file cannot quietly add or drop one.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#843 prestate: clara.resolve_stripe_event_problem does not carry the posture this file re-asserts; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 0.7 · THE TAXONOMY, as it stands. An active version must exist (every registration this file
  -- makes routes at it), and the two names must be either wholly absent (first apply) or wholly
  -- present (redo) — a half-registered type is the state that breaks the estate-wide coverage law
  -- rig-events-structure.test.mjs §7 enforces, so it is refused here rather than discovered there.
  if not exists (select 1 from clara.taxonomy_active) then
    raise exception '#843 prestate: no active taxonomy version to route the new event types at'
      using errcode='CLR10';
  end if;
  -- ONE DIRECTION IS DANGEROUS AND ONE IS NOT, and only the dangerous one is refused.
  --   * A BODY that appends a type the catalog does not carry is a door that raises a foreign-key
  --     violation the first time an operator uses it (clara.domain_events.event_type references
  --     clara.event_types(name), 0005 A.3). Refused here rather than discovered in production.
  --   * A REGISTERED type with no appender is inert: an unused catalog row, still routed, still
  --     satisfying the coverage law. It is also the NORMAL state after a rig-side revert, because
  --     clara.event_types is append-only and a registration can never be withdrawn. Admitted, and
  --     named in the notice below rather than silently ignored.
  select count(*)::int into v_n from clara.event_types where name = 'admission.capacity_set';
  if v_applied_cap and v_n = 0 then
    raise exception '#843 prestate: clara.set_admission_capacity appends admission.capacity_set but the catalog does not carry that type -- every call would raise a foreign-key violation'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.event_types where name = 'stripe_event.problem_resolved';
  if v_applied_res and v_n = 0 then
    raise exception '#843 prestate: clara.resolve_stripe_event_problem appends stripe_event.problem_resolved but the catalog does not carry that type -- every call would raise a foreign-key violation'
      using errcode='CLR10';
  end if;

  raise notice '#843 prestate: clean -- clara.set_admission_capacity exists exactly once at (integer,text,text), carries 0186 §C''s owner floor, operator fragment, reservation pair, audit call and advisory lock, and its posture (clara_fn_owner, SECURITY DEFINER, search_path + plan_cache_mode pinned, PUBLIC-revoked, EXECUTE to clara_authenticated only) is the one create-or-replace is about to preserve; clara.reject_firm_registration still carries the audit-then-append pair this recut copies; an active taxonomy version exists; clara.resolve_stripe_event_problem likewise exists exactly once at (uuid,text,text), carries 0205 §1''s body and its own (deliberately pin-free) posture. Re-apply over this file''s own effects (redo #957) -- set_admission_capacity already appends: %, resolve_stripe_event_problem already appends: %.', v_applied_cap, v_applied_res;
end
$w843_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §1 THE TAXONOMY. Register the new type and ROUTE it at the active version.
--
-- 0145 §G's idiom, with ONE deliberate departure: that file routes only the rows its own INSERT
-- returned (`with inserted_types as (... returning name) insert into trigger_taxonomy select ...
-- from inserted_types`). Under a redo the event_types INSERT conflicts, returns nothing, and the
-- routing INSERT would then be skipped — harmless when the routing row is already there, and a
-- silent coverage hole if it is not. Routing from a LITERAL list with its own
-- `on conflict do nothing` is idempotent on both paths and depends on nothing the statement above
-- happened to return.
-- =====================================================================================
insert into clara.event_types(name, client_scoped, description) values
  ('admission.capacity_set', false,
   'An operator changed the estate''s admission capacity (clara.set_admission_capacity)'),
  ('stripe_event.problem_resolved', false,
   'An operator resolved a Stripe event problem (clara.resolve_stripe_event_problem)')
on conflict (name) do nothing;

insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, t.name, 'context_update', null
  from clara.taxonomy_active a
 cross join (values ('admission.capacity_set'), ('stripe_event.problem_resolved')) as t(name)
on conflict (version, event_type) do nothing;

-- =====================================================================================
-- §2 THE RECUT — clara.set_admission_capacity. 0186 §C's body, character for character, plus ONE
-- `perform clara._append_event(...)` statement between the audit call and the `_finish_op`
-- return. The signature, SECURITY DEFINER, both pinned settings and the revoke/grant pair are
-- re-asserted below rather than inherited.
-- =====================================================================================
create or replace function clara.set_admission_capacity(
  p_max_firms integer, p_reason text, p_op_key text
) returns jsonb
  language plpgsql security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  c record;
  v_dedupe jsonb;
  v_reason text;
  v_state jsonb;
  v_at timestamptz;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode='CLR04', detail='{"reason":"not_operator_firm"}';
  end if;
  if nullif(btrim(p_op_key),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_max_firms is not null and p_max_firms < 0 then
    raise exception 'a capacity cannot be negative' using errcode='CLR10',
      detail='{"reason":"invalid_capacity"}';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required' using errcode='CLR10', detail='{"reason":"reason_required"}';
  end if;
  if length(v_reason) > 500 then
    raise exception 'that reason is too long' using errcode='CLR10', detail='{"reason":"reason_too_long"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(c.firm, 'set_admission_capacity', p_op_key,
      clara._hash(jsonb_build_object('max_firms',p_max_firms,'reason',v_reason,'actor',c.actor)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args" (0004:57), re-raised WITH a
    -- detail so every refusal this door emits carries (errcode, detail.reason).
    raise exception 'this op key was already used for a different capacity change'
      using errcode='CLR10', detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this capacity change is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                                  -- the ORIGINAL receipt, byte-identical
  end if;

  -- The SAME key clara.claim_paid_firm holds across its count-and-insert, so a capacity change
  -- cannot land between a claim's count and its firm.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.admission-capacity', 0));
  v_at := now();
  update clara.admission_capacity
     set max_firms = p_max_firms, reason = v_reason, updated_by = c.actor, updated_at = v_at
   where id;
  if not found then
    raise exception 'the admission capacity row is missing' using errcode='CLR10',
      detail='{"reason":"capacity_row_missing"}';
  end if;
  v_state := clara._admission_capacity_state();

  perform clara._audit(c.firm, c.actor, null, null, 'set_admission_capacity', null,
    jsonb_build_object('max_firms',p_max_firms,'reason',v_reason,
      'firms_count',v_state->'firms_count','full',v_state->'full'));

  -- #843 · THE ONE NEW STATEMENT. Positional, exactly as clara.reject_firm_registration (0145 §D)
  -- calls it: (firm, type, client, actor, on_behalf_of, via_wake_kind, entry, document,
  -- resolution, payload). The OPERATOR firm, because that is the firm this act belongs to and the
  -- only firm whose timeline may show it. Client null (an admission act names no client, which is
  -- why the type is registered client_scoped=false); on-behalf-of, wake kind and the three entity
  -- ids null — an operator decides in their own name, on no entry, document or resolution.
  -- EMPTY payload: clara.domain_events is read ESTATE-WIDE by clara_runtime, and max_firms /
  -- firms_count are the business-confidential numbers #628's review round (S4) put behind the
  -- operator wall. They stay in the firm-scoped audit row one statement above. See the header.
  perform clara._append_event(c.firm, 'admission.capacity_set', null, c.actor, null, null,
    null, null, null, '{}'::jsonb);

  return clara._finish_op(c.firm, 'set_admission_capacity', p_op_key, jsonb_build_object(
    'status','set','max_firms',
    case when p_max_firms is null then null else to_jsonb(p_max_firms) end,
    'reason',v_reason,'firms_count',v_state->'firms_count','full',v_state->'full',
    'updated_at',v_at));
end $$;

revoke all on function clara.set_admission_capacity(integer,text,text) from public;
grant execute on function clara.set_admission_capacity(integer,text,text) to clara_authenticated;

comment on function clara.set_admission_capacity(integer,text,text) is
  '#628 (0186 §C), timeline recut by #843: set the estate''s admission capacity (NULL = '
  'unlimited). Owner of the OPERATOR firm only (the approve_firm_registration predicate, '
  're-derived at call time). op_receipts-idempotent; writes a clara._audit receipt AND appends '
  'ONE admission.capacity_set domain event under the operator firm -- both INSIDE the reservation, '
  'so a lost-response retry replays the receipt and writes neither a second time. The event''s '
  'payload is EMPTY on purpose: clara.domain_events is read estate-wide by clara_runtime and the '
  'capacity figures are operator-only (#628 S4); they stay on the firm-scoped audit row. '
  'Refusals carry detail.reason: invalid_op_key | invalid_capacity | reason_required | '
  'reason_too_long | op_key_conflict | capacity_row_missing (CLR10), operation_in_flight (CLR13), '
  'not_operator_firm (CLR04).';

-- =====================================================================================
-- §3 THE RECUT, PART 2 — clara.resolve_stripe_event_problem. 0205 §1's body, character for
-- character, plus ONE `perform clara._append_event(...)` statement between its audit call and the
-- `_finish_op` return — the same shape and the same position §2 above uses.
--
-- NO `plan_cache_mode` PIN, and that is inherited on purpose: 0205's own header states why this
-- door carries none ("0183's pin belongs to bodies that bind the session firm into a cached read;
-- this is a WRITE door reached once per decision"). Adding one here would be a posture change
-- this ticket did not ask for, and §0.6 pins the absence so a later edit cannot drift into one.
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

  -- #843 · THE SECOND NEW STATEMENT, beside #775's and inside the SAME reservation, so a
  -- lost-response retry returns at the `v_dedupe` guard above and appends no second line.
  -- ID-SHAPED payload, exactly as clara.reject_firm_registration carries `{request}` and not its
  -- reason: the operator's free-text resolution and the Stripe event id stay on the firm-scoped
  -- clara.audit_log row one statement above, never in the estate-wide event log. See the header.
  perform clara._append_event(c.firm, 'stripe_event.problem_resolved', null, c.actor, null, null,
    null, null, null, jsonb_build_object('problem',p_problem));

  v_result := jsonb_build_object(
    'problem_id',p_problem,'event_id',v_problem.event_id,'resolved',true);
  return clara._finish_op(c.firm,'resolve_stripe_event_problem',p_op_key,v_result);
end $$;

revoke all on function clara.resolve_stripe_event_problem(uuid,text,text) from public;
grant execute on function clara.resolve_stripe_event_problem(uuid,text,text) to clara_authenticated;

comment on function clara.resolve_stripe_event_problem(uuid,text,text) is
  '#615 (0160 §5), audit recut by #775, timeline recut by #843: an operator resolves one Stripe '
  'event problem. OWNER of the OPERATOR firm only. Idempotent through clara._reserve_op/'
  '_finish_op on p_op_key. Writes ONE clara.audit_log row — fn resolve_stripe_event_problem, the '
  'operator firm, the resolving operator, args {problem, event, resolution} — AND appends ONE '
  'stripe_event.problem_resolved domain event under the operator firm with the id-shaped payload '
  '{problem}; both sit INSIDE the reservation, so a lost-response retry replays the receipt and '
  'writes neither a second time. Refuses CLR04 (not the operator firm / below owner rank), CLR10 '
  '(problem/resolution/op_key required, op_key reused with different args), CLR11 (problem not '
  'found) and CLR09 (already resolved).';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. Nothing below trusts that
-- the body above ran as written.
-- =====================================================================================
do $w843_tail$
declare v_src text; v_n int; v_posture text; v_append_count int; v_audit_count int;
        v_pos_reserve int; v_pos_append int; v_pos_finish int; v_uncovered text;
begin
  -- 1 · still exactly ONE body, at the same signature.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='set_admission_capacity';
  if v_n <> 1 then
    raise exception '#843 tail: clara.set_admission_capacity now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.set_admission_capacity(integer,text,text)') is null then
    raise exception '#843 tail: clara.set_admission_capacity(integer,text,text) no longer resolves'
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_admission_capacity(integer,text,text)'::regprocedure;

  -- 2 · THE APPEND IS THERE, EXACTLY ONCE, AND IT NAMES THE RIGHT TYPE. A COUNT rather than a
  -- presence check: two calls would put two lines on the timeline for one decision, which no
  -- assertion about the first line would notice.
  v_append_count := (length(v_src) - length(replace(v_src, 'clara._append_event(', '')))
                    / length('clara._append_event(');
  if v_append_count <> 1 then
    raise exception '#843 tail: the committed clara.set_admission_capacity calls clara._append_event % time(s), expected exactly 1', v_append_count
      using errcode='CLR10';
  end if;
  if position('clara._append_event(c.firm, ''admission.capacity_set'', null, c.actor, null, null,' in v_src) = 0 then
    raise exception '#843 tail: the append does not name admission.capacity_set under the operator firm with a null client'
      using errcode='CLR10';
  end if;
  if position('null, null, null, ''{}''::jsonb)' in v_src) = 0 then
    raise exception '#843 tail: the append does not carry the empty payload this file''s confidentiality note requires'
      using errcode='CLR10';
  end if;

  -- 3 · …and the audit row it joins is UNTOUCHED, still exactly once.
  v_audit_count := (length(v_src) - length(replace(v_src, 'clara._audit(', '')))
                   / length('clara._audit(');
  if v_audit_count <> 1 then
    raise exception '#843 tail: the committed body calls clara._audit % time(s), expected exactly 1', v_audit_count
      using errcode='CLR10';
  end if;

  -- 4 · THE APPEND IS INSIDE THE RESERVATION. The whole idempotence claim, measured positionally
  -- rather than asserted in prose: the new statement sits after `_reserve_op` and before
  -- `_finish_op`, so the `v_dedupe` early return above it is reached first on a replay.
  v_pos_reserve := position('clara._reserve_op(c.firm, ''set_admission_capacity''' in v_src);
  v_pos_append  := position('clara._append_event(c.firm, ''admission.capacity_set''' in v_src);
  v_pos_finish  := position('clara._finish_op(c.firm, ''set_admission_capacity''' in v_src);
  if v_pos_reserve = 0 or v_pos_append = 0 or v_pos_finish = 0
     or not (v_pos_reserve < v_pos_append and v_pos_append < v_pos_finish) then
    raise exception '#843 tail: the append is NOT between _reserve_op (%) and _finish_op (%) -- append at % -- a replay would write a second line', v_pos_reserve, v_pos_finish, v_pos_append
      using errcode='CLR10';
  end if;

  -- 5 · POSTURE, re-read rather than assumed: `create or replace` is trusted to preserve it and
  -- the revoke/grant pair is re-issued, so this compares the result against §0.6's measurement.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.set_admission_capacity(integer,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#843 tail: clara.set_admission_capacity''s posture moved during the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 6 · THE TAXONOMY, RE-READ. The type is registered firm-level, routed context_update at the
  -- ACTIVE version, and — the estate-wide law rig-events-structure.test.mjs §7 enforces — no
  -- catalog row anywhere is left unrouted by this file's insert.
  select count(*)::int into v_n from clara.event_types
   where name = 'admission.capacity_set' and client_scoped = false;
  if v_n <> 1 then
    raise exception '#843 tail: admission.capacity_set is not registered exactly once as a firm-level (client_scoped=false) type'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version = (select version from clara.taxonomy_active)
     and tt.event_type = 'admission.capacity_set' and tt.decision = 'context_update';
  if v_n <> 1 then
    raise exception '#843 tail: admission.capacity_set is not routed context_update at the active taxonomy version'
      using errcode='CLR10';
  end if;
  select coalesce(string_agg(et.name, ', '), '') into v_uncovered
    from clara.event_types et
   where et.name not like 'rig.%'
     and not exists (select 1 from clara.trigger_taxonomy tt
                      where tt.version = (select version from clara.taxonomy_active)
                        and tt.event_type = et.name);
  if v_uncovered <> '' then
    raise exception '#843 tail: the active taxonomy version does not route every event type -- uncovered: %', v_uncovered
      using errcode='CLR10';
  end if;

  raise notice '#843 tail (part 1/2): OK -- clara.set_admission_capacity exists exactly once at (integer,text,text), calls clara._audit exactly once and clara._append_event exactly once, the append names admission.capacity_set under the operator firm with a null client and an EMPTY payload, it sits strictly between _reserve_op and _finish_op so a replayed op_key writes no second line, the door''s posture (clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, PUBLIC-revoked, EXECUTE to clara_authenticated only) is byte-identical to what §0.6 measured before the recut, and admission.capacity_set is registered exactly once as a firm-level type routed context_update at the active taxonomy version with no catalog row left unrouted.';

  -- ===================================================================================
  -- PART 2 — the SAME census, over clara.resolve_stripe_event_problem. Written out rather than
  -- looped: the two doors differ in the type they append, in their payload and in their posture
  -- (this one carries no plan_cache_mode pin), and a loop over three parameter arrays would hide
  -- exactly the differences a reader of a failure needs to see.
  -- ===================================================================================
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='resolve_stripe_event_problem';
  if v_n <> 1 then
    raise exception '#843 tail: clara.resolve_stripe_event_problem now has % bodies (expected exactly 1) -- the recut created an overload instead of replacing the live body', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.resolve_stripe_event_problem(uuid,text,text)') is null then
    raise exception '#843 tail: clara.resolve_stripe_event_problem(uuid,text,text) no longer resolves'
      using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;

  v_append_count := (length(v_src) - length(replace(v_src, 'clara._append_event(', '')))
                    / length('clara._append_event(');
  if v_append_count <> 1 then
    raise exception '#843 tail: the committed clara.resolve_stripe_event_problem calls clara._append_event % time(s), expected exactly 1', v_append_count
      using errcode='CLR10';
  end if;
  if position('clara._append_event(c.firm, ''stripe_event.problem_resolved'', null, c.actor, null, null,' in v_src) = 0 then
    raise exception '#843 tail: the append does not name stripe_event.problem_resolved under the operator firm with a null client'
      using errcode='CLR10';
  end if;
  if position('null, null, null, jsonb_build_object(''problem'',p_problem))' in v_src) = 0 then
    raise exception '#843 tail: the append does not carry the id-shaped {problem} payload -- the operator''s resolution text must not reach the estate-wide event log'
      using errcode='CLR10';
  end if;
  -- …and the resolution text is NOT in the append. A literal probe, because "id-shaped" is the
  -- confidentiality rule this file is keeping, not a style preference: v_resolution appears in the
  -- audit call and in the resolution stamp, and must appear nowhere between the append's own
  -- parentheses.
  if position('''stripe_event.problem_resolved'', null, c.actor, null, null,
    null, null, null, jsonb_build_object(''problem'',p_problem))' in v_src) = 0 then
    raise exception '#843 tail: the stripe_event.problem_resolved append does not carry EXACTLY the id-shaped payload this file commits to'
      using errcode='CLR10';
  end if;

  v_audit_count := (length(v_src) - length(replace(v_src, 'clara._audit(', '')))
                   / length('clara._audit(');
  if v_audit_count <> 1 then
    raise exception '#843 tail: the committed clara.resolve_stripe_event_problem calls clara._audit % time(s), expected exactly 1 (0205''s row must survive)', v_audit_count
      using errcode='CLR10';
  end if;

  v_pos_reserve := position('clara._reserve_op(c.firm,''resolve_stripe_event_problem''' in v_src);
  v_pos_append  := position('clara._append_event(c.firm, ''stripe_event.problem_resolved''' in v_src);
  v_pos_finish  := position('clara._finish_op(c.firm,''resolve_stripe_event_problem''' in v_src);
  if v_pos_reserve = 0 or v_pos_append = 0 or v_pos_finish = 0
     or not (v_pos_reserve < v_pos_append and v_pos_append < v_pos_finish) then
    raise exception '#843 tail: the append is NOT between _reserve_op (%) and _finish_op (%) -- append at % -- a replay would write a second line', v_pos_reserve, v_pos_finish, v_pos_append
      using errcode='CLR10';
  end if;

  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.resolve_stripe_event_problem(uuid,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#843 tail: clara.resolve_stripe_event_problem''s posture moved during the recut; got {%}', v_posture
      using errcode='CLR10';
  end if;

  select count(*)::int into v_n from clara.event_types
   where name = 'stripe_event.problem_resolved' and client_scoped = false;
  if v_n <> 1 then
    raise exception '#843 tail: stripe_event.problem_resolved is not registered exactly once as a firm-level (client_scoped=false) type'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
   where tt.version = (select version from clara.taxonomy_active)
     and tt.event_type = 'stripe_event.problem_resolved' and tt.decision = 'context_update';
  if v_n <> 1 then
    raise exception '#843 tail: stripe_event.problem_resolved is not routed context_update at the active taxonomy version'
      using errcode='CLR10';
  end if;

  -- THE COVERAGE ANTI-JOIN, RE-READ ONCE MORE now that BOTH registrations have landed: the
  -- estate-wide law rig-events-structure.test.mjs §7 enforces, measured here against the
  -- committed catalog rather than left for that battery to discover.
  select coalesce(string_agg(et.name, ', '), '') into v_uncovered
    from clara.event_types et
   where et.name not like 'rig.%'
     and not exists (select 1 from clara.trigger_taxonomy tt
                      where tt.version = (select version from clara.taxonomy_active)
                        and tt.event_type = et.name);
  if v_uncovered <> '' then
    raise exception '#843 tail: the active taxonomy version does not route every event type -- uncovered: %', v_uncovered
      using errcode='CLR10';
  end if;

  -- AND THE THIRD ACT, THE ONE THIS FILE DID NOT TOUCH. clara.reject_firm_registration has
  -- appended firm_registration.rejected since 0145; the ticket's claim is that ALL THREE support
  -- acts are readable together, so the one that was already readable is re-measured here rather
  -- than assumed to have survived two recuts in the same transaction.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.reject_firm_registration(uuid,text,text)'::regprocedure;
  if position('clara._append_event(c.firm, ''firm_registration.rejected'', null, c.actor' in v_src) = 0 then
    raise exception '#843 tail: clara.reject_firm_registration no longer appends firm_registration.rejected -- the third support act has stopped being readable'
      using errcode='CLR10';
  end if;

  raise notice '#843 tail (part 2/2): OK -- clara.resolve_stripe_event_problem exists exactly once at (uuid,text,text), calls clara._audit exactly once (0205''s row survives) and clara._append_event exactly once, the append names stripe_event.problem_resolved under the operator firm with a null client and EXACTLY the id-shaped {problem} payload (no resolution text reaches the estate-wide log), it sits strictly between _reserve_op and _finish_op, the door''s posture (clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp with NO plan_cache_mode pin, PUBLIC-revoked, EXECUTE to clara_authenticated only) is byte-identical to what §0.6 measured, stripe_event.problem_resolved is registered exactly once as a firm-level type routed context_update at the active taxonomy version with no catalog row left unrouted, and the third support act (clara.reject_firm_registration -> firm_registration.rejected, 0145) still appends its own event.';
end
$w843_tail$;
