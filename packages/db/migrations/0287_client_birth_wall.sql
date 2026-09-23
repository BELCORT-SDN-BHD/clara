-- 0287_client_birth_wall — #899: MOVE THE NAME-COLLISION WALL FROM A READ A CALLER CAN SKIP
-- TO THE DOOR THAT CREATES A CLIENT.
-- =====================================================================================
-- Spec of record: ticket #899's Agent Brief (triage 2026-09-19, "Remaining scope" narrowed to
-- the two still-open entrances), verified live on this branch before this file was written.
--
-- WHAT WAS WRONG. `clara.client_identity_candidates` (0219) is the only place the two-or-more
-- collision wall (0 proceeds, 1 is shown and acknowledged in the FACE, >=2 raises CLR10
-- `name_family_collision` with the candidate rows) was enforced. Two granted human entrances
-- reached `clara.clients` without ever calling it: the command palette dispatches straight to
-- `clara.begin_client_onboarding` with the typed name (`apps/web/lib/command/do-dispatch.ts`),
-- and `clara.create_client(text,text)` (0004) is a same-arity compatibility verb still granted
-- to `clara_authenticated` with no wall of its own. `packages/db/tests/client-onboarding-
-- identity.test.mjs`'s own `p649.identity.direct_birth_residual` documented the palette's half
-- of this by name: "at arity >=2 the READ refuses and clara.begin_client_onboarding STILL
-- succeeds ... A caller that never asks still births."
--
-- WHAT THIS FILE ADDS. `clara._client_birth_core` — ONE ungranted body that performs the SAME
-- candidate resolution `client_identity_candidates` already performs (it CALLS that function,
-- never a second implementation of the family predicate) and creates the client + its
-- onboarding plan in the same transaction. Two granted doors sit in front of it:
--   * `clara.open_client_onboarding(p_name, p_op_key, p_identifier, p_acknowledged_candidate)`
--     — NEW. The one birth verb the brief asks for: arity 0 proceeds, arity >=2 raises CLR10
--     `name_family_collision` with the read's own rows, and arity 1 RAISES CLR10
--     `identity_acknowledgement_required` unless `p_acknowledged_candidate` names the one
--     candidate the read returned. `apps/web/components/firm/add-client-control.tsx` (the
--     client register's Add Client control) and the command palette are both re-pointed at
--     this door in the same commit series (test-side / web-side, not this file).
--   * `clara.begin_client_onboarding(p_name, p_op_key)` — RE-POINTED (`create or replace`,
--     signature unchanged). It now raises the SAME CLR10 `name_family_collision` at arity >=2,
--     which is what closes `p649.identity.direct_birth_residual` — a caller that never reads
--     `client_identity_candidates` first can no longer create a THIRD same-family record. It
--     does NOT gain the arity-1 acknowledgement wall: see "WHY ARITY 1 IS NOT EXTENDED TO THE
--     LEGACY DOOR" below.
--
-- `clara.create_client(text,text)` IS DELIBERATELY LEFT UNTOUCHED — BODY AND GRANT BOTH — and
-- this is the one place this file departs from the brief's literal "no granted human role can
-- reach a client-minting verb that lacks the wall". See "WHY create_client IS NOT RE-POINTED"
-- below; `packages/db/tests/client-birth-wall.test.mjs`'s own
-- `p899.census.create_client_documented_exception` cell is the named, tested residual — the
-- estate's own convention (0219's header: "A residual nobody wrote down is a residual nobody
-- can close") applied to this file's one open gap.
--
-- =====================================================================================
-- WHY ARITY 1 IS NOT EXTENDED TO THE LEGACY DOOR (`begin_client_onboarding`). The estate's own
-- ruling (owner, 2026-09-15, restated in `identity.ts`'s header and in this suite's OWN
-- `p649.identity.arity_one` title — "the wall at arity 1 is the face's, by ruling") never made
-- arity 1 a DATABASE wall: `client_identity_candidates` RETURNS the one candidate at arity 1,
-- it never raises. `open_client_onboarding` above goes further than that ruling on PURPOSE,
-- because the brief asks for it and because it is the ONE door the two faces route through,
-- so it can afford to. `begin_client_onboarding` cannot: its two-argument signature has no
-- parameter to carry an acknowledgement (a THIRD argument would be a new overload, the exact
-- shape `p649.identity.direct_birth_residual`'s own comment already named as the reason no
-- earlier wave recut it — "the overload 0103:1055-1070 refuses"), so if it required one it
-- could never be satisfied through this door and arity 1 would become an unconditional refusal
-- through it. MEASURED, not assumed: `packages/db/tests/rig-fixtures.mjs`'s `buildWorld()` —
-- the whole estate's own shared fixture, read by dozens of battery files — creates TWO clients
-- in one firm (`${prefix}_A1`, `${prefix}_A2`) whose shared `SANDBOX_PREFIX` ("rig_",
-- `tests/fixtures/sandbox-marker.mjs`) is their common leading token, i.e. an arity-1 pair BY
-- CONSTRUCTION, every single run. An arity-1 wall on `begin_client_onboarding` would be
-- harmless there only because `buildWorld()` calls `create_client`, not
-- `begin_client_onboarding` — but the SAME shared-prefix pattern recurs against
-- `begin_client_onboarding` itself in `packages/db/tests/wave-b/wb-fixtures.mjs`'s
-- `onboardingClient()` helper and its callers. Raising the wall to arity 1 on the legacy door
-- would have turned an unrelated battery red for a fixture-naming coincidence, which is
-- exactly the kind of collateral this file's own scope-discipline rule (WORK-ORDER.md #5)
-- forbids introducing. Arity >=2 carries no such risk: the estate's OWN ruling already treats
-- two-or-more as never-tolerated, so nothing today has ever needed to construct three
-- same-family parties under one firm without going through the read first — measured across
-- every real caller of `begin_client_onboarding` found on this branch (rig-fixtures.mjs,
-- wave-b/wb-fixtures.mjs, wave-b/wb-o-lifecycle.test.mjs, wave-b-*.test.mjs,
-- interview-e2e.mjs, interview-kill-resume-e2e.mjs, opening-ledger-source-e2e.mjs,
-- kdoc-opening-tb-e2e.test.mjs) — none accumulates a third same-leading-token client or
-- counterparty in one firm through this door.
--
-- WHY create_client IS NOT RE-POINTED. The SAME `buildWorld()` fixture creates a THIRD
-- same-family ("rig_"-prefixed) client in firm A through `clara.create_client` the moment
-- `packages/db/tests/wave-b/wb-fixtures.mjs`'s `buildWaveBWorld()` calls it again for its own
-- `A3_archived` fixture (`buildWorld()` then `createClient({name: '${prefix}_A3_archived'})`),
-- and `packages/db/tests/name-only-guard.test.mjs` (via `createClient()`, this estate's shared
-- JS test fixture for `clara.create_client`) creates SIX more same-leading-token ("nog_")
-- clients in ONE firm across its own sequential test bodies. Re-pointing `create_client` at
-- `_client_birth_core` — even at the arity->=2-only floor `begin_client_onboarding` gets above
-- — would turn both of those batteries red on their third and further same-family creation,
-- for a reason that has nothing to do with what either battery is testing. `create_client` has
-- no product caller (this ticket's own triage measured that: a repo-wide grep finds it called
-- only from test fixtures), but forty-eight test files call it THROUGH
-- `rig-fixtures.mjs`'s `createClient()` helper, so WITHDRAWING its grant is exactly as
-- disruptive as re-pointing its body would be — every one of those forty-eight files would
-- meet a bare 42501 on its very first fixture client. Closing this residual for real needs a
-- dedicated migration of those forty-eight-plus call sites onto `open_client_onboarding` (or a
-- rewrite of the fixture naming convention so it stops manufacturing same-family collisions by
-- construction) BEFORE `create_client`'s own grant or body can safely move — recorded as this
-- file's own follow-up, not attempted here.
--
-- REDO-SAFE (#957). Every function statement below is `create or replace` (§A and §B are new
-- names, but `create or replace` on a first apply behaves exactly like `create`), and every
-- grant/revoke is idempotent — re-running this file against a database that already carries its
-- effects is safe (packages/db/README.md, "Redo (#957)"). MEASURED, not assumed: this file's own
-- first cut used a bare `create function` for §A/§B and reserved the op AFTER the wall instead of
-- before, and both defects were caught and fixed via exactly this redo path on this lane's own
-- database before this ticket's report was written — see §A's own comment on the reservation
-- ordering for the second one.
-- =====================================================================================

do $t899_pre$
declare
  v_sha text;
  v_begin_src text;
  v_redo boolean;
  -- THE FRONTIER PINS, MEASURED ON THIS LANE DATABASE NOW (no ticket earlier in this lane's
  -- chain touches any of these names — `git log` shows no prior commit on this branch).
  -- `begin_client_onboarding` is EXCLUDED from this array on purpose: this is the ONE body 0287
  -- itself recuts, so it is pinned separately below as a BIMODAL check (0287's own pre-image, or
  -- structural evidence of an in-progress redo), the same shape 0272's header documents for its
  -- own recut body ("the prestate reports FIRST or REDO ... two-valued by construction").
  v_pins text[][] := array[
    ['clara.create_client(text,text)',
     '7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf'],
    ['clara.client_identity_candidates(text,jsonb)',
     '70943a15d68f7ef5712704bb7b68c1a8ea17baeb8b7b241cf079283ef1d6f7f2'],
    ['clara._human_ctx(integer)',
     'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'],
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara._finish_op(uuid,text,text,jsonb)',
     'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'],
    ['clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
     '7f7d63ee3082c25747f33073614eda108cedcc8670284d409e306da05f0cd15a'],
    ['clara._hash(jsonb)',
     '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'],
    ['clara._onboarding_plan_snapshot(uuid)',
     'ec5f03902d01d9268c7d4adbed8e69b50693041a77e593b8c5b818a8043e505f']
  ];
  v_i int;
begin
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#899 prestate: % is absent', v_pins[v_i][1] using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#899 prestate: % has DRIFTED from its measured pre-image -- re-measure before applying (got %)',
        v_pins[v_i][1], v_sha using errcode = 'CLR10';
    end if;
  end loop;

  -- THE BIMODAL PIN. FIRST apply: begin_client_onboarding must still be byte-identical to the
  -- pre-0287 body measured on this lane database. REDO: it already calls the shared core (this
  -- file's own prior apply put that call there), so its EXACT current text is not pinned --
  -- §C's `create or replace` is about to overwrite it with this file's own text regardless, and
  -- re-measuring an intermediate fix-round sha here would only need updating on every edit.
  select prosrc into v_begin_src from pg_proc
   where oid = 'clara.begin_client_onboarding(text,text)'::regprocedure;
  v_redo := position('_client_birth_core' in v_begin_src) > 0;
  if not v_redo then
    if encode(sha256(convert_to(v_begin_src, 'UTF8')), 'hex')
       is distinct from '1b0cfc0676f08d20d3d79cbca62a7491b9ff7b928e6fed25449da17c4531cf09' then
      raise exception '#899 prestate: clara.begin_client_onboarding has DRIFTED from its measured pre-0287 pre-image -- re-measure before applying (got %)',
        encode(sha256(convert_to(v_begin_src, 'UTF8')), 'hex') using errcode = 'CLR10';
    end if;
  end if;

  if to_regprocedure('clara.open_client_onboarding(text,text,jsonb,uuid)') is not null then
    v_redo := true;
  end if;

  raise notice '#899 prestate: % apply -- create_client, client_identity_candidates and the six preamble routines this file relies on are all byte-identical to their measured pre-images; begin_client_onboarding is at its pre-0287 pin (FIRST) or already delegates to the shared core (REDO).',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$t899_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A -- clara._client_birth_core. Ungranted. The ONE body that creates a clara.clients row
-- through a governed human door, folding clara.client_identity_candidates' own candidate
-- resolution in ahead of the insert rather than leaving it a read a caller can skip.
-- `p_require_ack_at_one` is what lets the two granted doors below share this one core while
-- disagreeing about the arity-1 question -- see the file header for why the legacy door's
-- answer stays `false`.
-- =====================================================================================
create or replace function clara._client_birth_core(
    p_actor uuid, p_firm uuid, p_name text, p_identifier jsonb, p_acknowledged_candidate uuid,
    p_require_ack_at_one boolean, p_fn text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_client uuid; v_plan uuid; v_result jsonb;
  v_answer jsonb; v_arity int; v_candidates jsonb; v_only_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' or nullif(btrim(p_name), '') is null then
    raise exception 'client name and op_key are required' using errcode = 'CLR10';
  end if;

  -- RESERVE BEFORE THE WALL (house guard order, 0004's own header: "reserve/dedupe -> ...
  -- invariant guards -> work"). The wall below is a STATEFUL invariant guard, not input shape
  -- validation, and the name it is asked about is the one THIS OP_KEY is minting -- so once
  -- that mint has happened, that same name now legitimately matches itself (an exact_name
  -- candidate) on any retry. Checking the wall BEFORE reserving would make a byte-identical
  -- replay of an already-succeeded call re-evaluate the read against a firm that now contains
  -- the very row the first call created, and refuse its own successful retry — measured on this
  -- rig (`wave-b/wb-o-lifecycle.test.mjs`'s "O3: same-op_key retry" turned red for exactly this
  -- reason on the first cut of this file, before the ordering below fixed it).
  v_dedupe := clara._reserve_op(p_firm, p_fn, p_op_key,
    clara._hash(jsonb_build_object('name', btrim(p_name), 'identifier', p_identifier,
                                    'acknowledged_candidate', p_acknowledged_candidate)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- THE WALL. The SAME predicate clara.client_identity_candidates already publishes, called
  -- here rather than re-derived: an arity>=2 collision RAISES from inside that call (CLR10
  -- name_family_collision, the same name/arity/candidates detail the read itself answers with)
  -- and propagates UNCHANGED.
  v_answer := clara.client_identity_candidates(p_name, p_identifier);
  v_arity := coalesce((v_answer ->> 'arity')::int, 0);
  v_candidates := coalesce(v_answer -> 'candidates', '[]'::jsonb);

  -- ARITY 1 -- only a wall for a caller that can carry an acknowledgement. The candidate id is
  -- what is acknowledged, never a bare boolean: a stale or wrong id simply fails to clear this
  -- gate, so acknowledging a DIFFERENT answer than the one just read is not possible.
  if p_require_ack_at_one and v_arity = 1 then
    v_only_id := nullif(v_candidates -> 0 ->> 'id', '')::uuid;
    if p_acknowledged_candidate is null or p_acknowledged_candidate is distinct from v_only_id then
      raise exception 'this name matches an existing client or counterparty in your firm; open the client register''s Add Client control to review it and acknowledge before a new record is created'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'identity_acknowledgement_required', 'class', 'client_identity',
                                       'name', coalesce(v_answer ->> 'name', btrim(p_name)),
                                       'arity', v_arity, 'candidates', v_candidates)::text;
    end if;
  end if;

  begin
    insert into clara.clients(firm_id, name, status)
      values (p_firm, btrim(p_name), 'onboarding') returning id into v_client;
  exception when unique_violation then
    raise exception 'a client with that name already exists' using errcode = 'CLR10';
  end;

  insert into clara.onboarding_plans(firm_id, scope_kind, client_id, review_maker, reviewed_at, contributors)
    values (p_firm, 'client', v_client, p_actor, now(), array[p_actor])
    returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
    values (v_plan, 1, clara._onboarding_plan_snapshot(v_plan));

  perform clara._audit(p_firm, p_actor, null, null, p_fn, null,
    jsonb_build_object('client', v_client, 'plan', v_plan, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'client.onboarding_started', v_client, p_actor, null, null, null, null, null,
    jsonb_build_object('plan_id', v_plan));

  v_result := jsonb_build_object('client_id', v_client, 'plan_id', v_plan);
  return clara._finish_op(p_firm, p_fn, p_op_key, v_result);
end $$;

-- =====================================================================================
-- §B -- clara.open_client_onboarding. THE new birth verb. Admin floor, matching every other
-- client-minting body exactly. Own _human_ctx call (not delegated to §A) so the drift guard
-- `apps/web/lib/command/do-action-floors.test.ts` can read the floor line straight off this
-- body, as it already does for every other `{kind:"sql", fn}` transcription.
-- =====================================================================================
create or replace function clara.open_client_onboarding(
    p_name text, p_op_key text, p_identifier jsonb default null, p_acknowledged_candidate uuid default null)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  return clara._client_birth_core(c.actor, c.firm, p_name, p_identifier, p_acknowledged_candidate,
    true, 'open_client_onboarding', p_op_key);
end $$;
comment on function clara.open_client_onboarding(text, text, jsonb, uuid) is
  '#899: the client birth verb. Folds clara.client_identity_candidates'' own candidate '
  'resolution into the door that creates a client -- arity 0 proceeds, arity 1 requires '
  'p_acknowledged_candidate to name the one candidate the read returns, arity >=2 raises '
  'CLR10 name_family_collision with the same rows the read would answer with. Admin floor.';

-- =====================================================================================
-- §C -- clara.begin_client_onboarding, RE-POINTED. Signature unchanged (no overload minted);
-- behaviour unchanged at arity 0 and arity 1 (see the file header for why arity 1 is not
-- walled through this door); arity >=2 now raises instead of silently creating a third
-- same-family client -- closing p649.identity.direct_birth_residual.
-- =====================================================================================
create or replace function clara.begin_client_onboarding(p_name text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  return clara._client_birth_core(c.actor, c.firm, p_name, null, null,
    false, 'begin_client_onboarding', p_op_key);
end $$;

reset role;

-- =====================================================================================
-- §D -- GRANTS. `create function` grants EXECUTE to PUBLIC by default, so §A and §B are
-- revoked from PUBLIC first; §B is then granted to clara_authenticated alone, the coarse
-- human-lane grant every governed verb carries (the floor is in the body, never the grant).
-- §A stays granted to nobody. §C's `create or replace` PRESERVES its existing ACL
-- (clara_authenticated only, no PUBLIC entry) -- no grant statement touches it here.
-- =====================================================================================
revoke all on function clara._client_birth_core(uuid, uuid, text, jsonb, uuid, boolean, text, text) from public;
revoke all on function clara.open_client_onboarding(text, text, jsonb, uuid) from public;
grant execute on function clara.open_client_onboarding(text, text, jsonb, uuid) to clara_authenticated;

-- =====================================================================================
-- §E -- TAIL. Re-reads the live catalog rather than trusting §A-§D ran as written.
-- =====================================================================================
do $t899_tail$
declare
  v_posture text; v_sha text; v_i int;
  v_unmoved text[][] := array[
    ['clara.client_identity_candidates(text,jsonb)',
     '70943a15d68f7ef5712704bb7b68c1a8ea17baeb8b7b241cf079283ef1d6f7f2'],
    ['clara.create_client(text,text)',
     '7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf']
  ];
begin
  -- (T.1) BOTH NEW ROUTINES RESOLVE at the exact signatures the grants and every caller name.
  if to_regprocedure('clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)') is null then
    raise exception '#899 tail: clara._client_birth_core does not resolve at its eight-argument signature' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.open_client_onboarding(text,text,jsonb,uuid)') is null then
    raise exception '#899 tail: clara.open_client_onboarding does not resolve at its four-argument signature' using errcode = 'CLR10';
  end if;

  -- (T.2) POSTURE + ACL. §A: SECURITY DEFINER, owned by clara_fn_owner, pinned search_path,
  -- granted to NOBODY (no PUBLIC, no clara_authenticated -- reached only from inside a definer
  -- caller). §B: the same posture, granted to clara_authenticated alone.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
    raise exception '#899 tail: clara._client_birth_core''s posture or ACL is not the ungranted-internal shape -- got {%}', v_posture using errcode = 'CLR10';
  end if;

  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.open_client_onboarding(text,text,jsonb,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#899 tail: clara.open_client_onboarding''s posture or ACL is not the clara_authenticated-only human-door shape -- got {%}', v_posture using errcode = 'CLR10';
  end if;

  -- (T.3) clara.begin_client_onboarding KEEPS ITS EXACT PRE-EXISTING ACL (create or replace
  -- preserves it) -- clara_authenticated only, no PUBLIC entry -- and is now floored and wall-
  -- wired through the same core §B uses.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.begin_client_onboarding(text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#899 tail: clara.begin_client_onboarding''s posture or ACL MOVED -- got {%}', v_posture using errcode = 'CLR10';
  end if;
  select prosrc into v_posture from pg_proc where oid = 'clara.begin_client_onboarding(text,text)'::regprocedure;
  if position('_client_birth_core' in v_posture) = 0 then
    raise exception '#899 tail: clara.begin_client_onboarding does not call the shared core' using errcode = 'CLR10';
  end if;
  if position('false' in v_posture) = 0 then
    raise exception '#899 tail: clara.begin_client_onboarding must pass p_require_ack_at_one=false (the legacy two-argument door cannot carry an acknowledgement)' using errcode = 'CLR10';
  end if;

  -- (T.4) NOTHING THIS FILE MUST NOT TOUCH MOVED -- client_identity_candidates (the predicate
  -- both doors above now call) and create_client (this file's own documented, tested
  -- exception -- see the header) are byte-identical to their prestate pins.
  for v_i in 1 .. array_length(v_unmoved, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_unmoved[v_i][1]::regprocedure;
    if v_sha is distinct from v_unmoved[v_i][2] then
      raise exception '#899 tail: % MOVED while this file applied -- it must not have (got %)',
        v_unmoved[v_i][1], v_sha using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated', 'clara.create_client(text,text)'::regprocedure, 'execute') then
    raise exception '#899 tail: clara.create_client lost its clara_authenticated grant -- this file must not touch it (see the header)' using errcode = 'CLR10';
  end if;

  -- (T.5) THE FIVE ROLE-PRIVILEGE CENSUS 0103:1225-1239 PINS STAYS EMPTY. §A/§B/§C call
  -- clara.client_identity_candidates and clara.name_family_candidates only through that
  -- SECURITY DEFINER wrapper, never directly, so none of the three name_family_* helpers
  -- gained a grant of their own.
  if exists (
    select 1
      from (values ('clara.name_family_token(text)'), ('clara.name_family_candidates(uuid,text)'),
                   ('clara.name_family_is_ambiguous(uuid,text)')) f(sig)
     cross join (values ('clara_authenticated'), ('clara_runtime'), ('clara_agent_ro'),
                        ('clara_wake_interactive'), ('clara_wake_proactive')) r(rolename)
     where has_function_privilege(r.rolename, f.sig::regprocedure, 'execute')
  ) then
    raise exception '#899 tail: a name_family_* helper gained an application-role grant -- it must stay reachable only through clara.client_identity_candidates' using errcode = 'CLR10';
  end if;

  raise notice '#899 tail: OK -- clara._client_birth_core resolves ungranted; clara.open_client_onboarding resolves SECURITY DEFINER, owned by clara_fn_owner, granted to clara_authenticated alone; clara.begin_client_onboarding keeps its pre-existing ACL and now calls the shared core with p_require_ack_at_one=false; clara.client_identity_candidates and clara.create_client are byte-identical to their measured pre-images and create_client keeps its clara_authenticated grant untouched; the five-role name_family_* privilege census stays empty.';
end
$t899_tail$;
