-- 0316_create_client_human_grant_withdrawn — #1038 (riders wave 4, lane 06): CLOSES #899's OWN
-- NAMED RESIDUAL. clara.create_client KEEPS ITS BODY -- unwalled, no identity check, still the
-- rig's own shared test fixtures' and packages/db/scripts/onboard-rpr.mjs's one unwalled
-- client-minting door -- but its clara_authenticated EXECUTE grant is WITHDRAWN. No human role
-- can execute it any more.
-- =====================================================================================
-- Spec of record: issue #1038's Agent Brief (the issue body itself; zero comments, re-verified
-- live on this branch before this file was written). Parent: #899
-- (0287_client_birth_wall.sql), whose own header names this EXACT residual and the exact reason
-- it could not be closed inside that ticket: "`create_client` has no product caller ... but
-- forty-eight test files call it THROUGH `rig-fixtures.mjs`'s `createClient()` helper, so
-- WITHDRAWING its grant is exactly as disruptive as re-pointing its body would be ... Closing
-- this residual for real needs a dedicated migration of those forty-eight-plus call sites onto
-- `open_client_onboarding` ... BEFORE `create_client`'s own grant or body can safely move."
-- Domain words: CONTEXT.md — "Client identity candidate" (unchanged by this file; this ticket
-- mints no new noun).
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO, AND WHY THAT IS ENOUGH TO CLOSE THE RESIDUAL. 0287's header
-- measured what would break if `create_client`'s UNWALLED CREATION BEHAVIOUR moved:
-- `buildWorld()`/`buildWaveBWorld()` construct two- and three-same-family clients through it by
-- fixture convention (A1/A2, then `A3_archived`), and `name-only-guard.test.mjs` mints six
-- same-leading-token clients across its own sequential bodies. NONE of that is a GRANT
-- dependency — it is a dependency on the BODY staying reachable and staying unwalled. So this
-- file does not touch `clara.create_client`'s body at all (prestate-pinned below, byte-for-byte,
-- and re-pinned at the tail): it revokes exactly ONE grant. Every caller that still needs the
-- unwalled shape now reaches it the SAME way `packages/db/scripts/onboard-rpr.mjs` already does
-- — and has always done, unmodified by this file, for its own one non-test call site: connect as
-- the postgres superuser (which the EXECUTE grant this file revokes never applied to in the
-- first place — a superuser bypasses ACL checks entirely) and hand-set `request.jwt.claims` so
-- `clara._human_ctx` resolves the SAME actor/firm/floor a granted caller would have gotten. This
-- is not a new idiom invented for this ticket: it is `seeds/0002_core_seed.sql`'s own pattern,
-- which `onboard-rpr.mjs`'s own header names "the HUMAN-CONTEXT IDIOM" — already audited,
-- already the house pattern for exactly this shape of privileged call. The companion test-side
-- commits in this same ticket move the rig's own shared fixture (`packages/db/tests/rig-
-- fixtures.mjs`'s `createClient()`/`createClientRaw()`, the ONE call site all forty-eight-plus
-- test files reach through) and a dozen more direct callers this migration's own author found by
-- grep onto that SAME idiom — no fixture-naming convention changes: `buildWorld()` still creates
-- same-family A1/A2, `name-only-guard.test.mjs` still creates six same-leading-token clients,
-- unmodified — moving WHO calls `create_client`, never WHAT it does when called.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * it does not touch `clara.create_client`'s BODY (prestate + tail pin it byte-for-byte).
--   * it does not touch `clara.open_client_onboarding`, `clara.begin_client_onboarding` or
--     `clara._client_birth_core` — the ticket's own "Out of scope: Any change to the walled
--     entrances' own rules." All three are pinned below as untouched neighbours.
--   * it grants NOTHING to anyone. No new role, no new name — closing this residual needed only
--     a revoke, once every caller stopped depending on the grant.
--   * it does not widen `clara.firm_setup_keys`, chart rows, or anything else outside this one
--     door's grant and catalogue comment.
--
-- REDO-SAFE (#957), the `0273_vendor_binding_write_doors_revoked.sql` idiom verbatim: `revoke
-- execute ... from <role>` is a no-op, not an error, against a grant that is already absent, and
-- `comment on function` simply overwrites, so neither statement below needs an `if exists`
-- guard. The prestate reads the CURRENT grant state (whichever it is) rather than assuming
-- "first apply", and prints which branch it is taking.
-- =====================================================================================

do $p1038_pre$
declare
  v_create_client text := 'clara.create_client(text,text)';
  v_open text := 'clara.open_client_onboarding(text,text,jsonb,uuid)';
  v_begin text := 'clara.begin_client_onboarding(text,text)';
  v_core text := 'clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)';
  v_sha text;
  v_auth boolean;
begin
  -- THE ONE DOOR THIS FILE MOVES. Pin its body unconditionally — a REVOKE never touches body
  -- text, so this pin holds in both the first-apply and the redo branch, and is re-asserted
  -- verbatim in the tail.
  if to_regprocedure(v_create_client) is null then
    raise exception '#1038 prestate: % is absent -- 0004 must apply first', v_create_client using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_create_client::regprocedure;
  if v_sha is distinct from '7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf' then
    raise exception '#1038 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not change its body, so re-measure before revoking its grant',
      v_create_client, v_sha using errcode = 'CLR10';
  end if;
  select has_function_privilege('clara_authenticated', v_create_client::regprocedure, 'execute') into v_auth;
  if v_auth then
    raise notice '#1038 prestate: FIRST APPLY -- clara.create_client is still granted to clara_authenticated; revoking now.';
  else
    raise notice '#1038 prestate: REDO -- clara.create_client is already ungranted (CLARA_MIGRATION_REDO of this file); the REVOKE statement below is a no-op.';
  end if;
  if has_function_privilege('public', v_create_client::regprocedure, 'execute') then
    raise exception '#1038 prestate: PUBLIC holds EXECUTE on clara.create_client -- that leak predates this file and must be fixed before it applies'
      using errcode = 'CLR10';
  end if;

  -- THE THREE #899 NEIGHBOURS THIS FILE MUST NOT TOUCH -- pinned unconditionally, in EITHER
  -- branch: byte-identical body, exactly as 0287 left them. `_client_birth_core` stays granted
  -- to nobody; the two doors stay granted to clara_authenticated alone.
  if to_regprocedure(v_open) is null or to_regprocedure(v_begin) is null or to_regprocedure(v_core) is null then
    raise exception '#1038 prestate: the #899 birth-wall objects are missing -- this file must not run without 0287' using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_open::regprocedure;
  if v_sha is distinct from '0a169df316c23a5b33e66e0b1c8512ed479d4cda33f10c4c10725afa8012ec79' then
    raise exception '#1038 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
      v_open, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_begin::regprocedure;
  if v_sha is distinct from '9edd80ef8fa66f855b1ed7cb8667ee60dafb80c302cf638b3dd62fdb391602a7' then
    raise exception '#1038 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
      v_begin, v_sha using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_core::regprocedure;
  if v_sha is distinct from '5d8a7a295f8b33d62b719ee068b2ce507d3359d6a361abcd80cfe87613335d08' then
    raise exception '#1038 prestate: % has DRIFTED from its measured pre-image (got %) -- this file must not touch it, so re-measure before applying',
      v_core, v_sha using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_open::regprocedure, 'execute') then
    raise exception '#1038 prestate: % is not granted to clara_authenticated -- this file must not be the reason it is missing', v_open using errcode = 'CLR10';
  end if;

  raise notice '#1038 prestate: clean -- clara.create_client is present and byte-identical to its measured pre-image; open_client_onboarding, begin_client_onboarding and _client_birth_core are all present, byte-identical to their #899 pre-images, and untouched by this file.';
end
$p1038_pre$;

-- =====================================================================================
-- THE CHANGE. Idempotent by construction (see the header's REDO-SAFE note) — no `if exists`
-- guard is needed or written. Runs as the migration runner's own (superuser) privilege: a REVOKE
-- and a COMMENT ON need no ownership switch, and `clara.create_client`'s body is not touched, so
-- no `set role clara_fn_owner` window is opened at all.
-- =====================================================================================
revoke execute on function clara.create_client(text,text) from clara_authenticated;

comment on function clara.create_client(text, text) is
  '#899/#1038: SUPERSEDED by clara.open_client_onboarding, which is the client birth verb. This '
  'verb keeps its body -- unwalled, no identity check -- but as of #1038 (0316) its '
  'clara_authenticated grant is WITHDRAWN: no human role can execute it any more. The two '
  'remaining callers, the rig''s own shared test fixtures (packages/db/tests/rig-fixtures.mjs) '
  'and packages/db/scripts/onboard-rpr.mjs, both reach it as the postgres superuser with a '
  'hand-set request.jwt.claims GUC (seeds/0002_core_seed.sql''s own house idiom), never through '
  'a grant. New callers use open_client_onboarding.';

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the REVOKE/COMMENT ran as written.
-- =====================================================================================
do $p1038_tail$
declare
  v_create_client text := 'clara.create_client(text,text)';
  v_open text := 'clara.open_client_onboarding(text,text,jsonb,uuid)';
  v_begin text := 'clara.begin_client_onboarding(text,text)';
  v_core text := 'clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)';
  v_sha text; v_comment text; v_n int;
begin
  -- THE REVOKED DOOR: no human EXECUTE, no PUBLIC leak, body byte-identical to the pinned
  -- pre-image (a REVOKE must never move a function's text).
  if has_function_privilege('clara_authenticated', v_create_client::regprocedure, 'execute') then
    raise exception '#1038 tail: clara_authenticated STILL holds EXECUTE on clara.create_client -- the revoke did not take' using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', v_create_client::regprocedure, 'execute') then
    raise exception '#1038 tail: PUBLIC can execute clara.create_client' using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_create_client::regprocedure;
  if v_sha is distinct from '7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf' then
    raise exception '#1038 tail: clara.create_client''s BODY moved -- a grant-only change must not touch body text (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- THE FIVE-ROLE CENSUS: no application-facing role reaches it any more -- clara_authenticated
  -- (just revoked), clara_runtime, clara_agent_ro and both wake roles (never granted in the
  -- first place, re-measured rather than assumed).
  select count(*)::int into v_n from (
    select 1 from pg_roles r
     where r.rolname in ('clara_authenticated','clara_runtime','clara_agent_ro',
                          'clara_wake_interactive','clara_wake_proactive')
       and has_function_privilege(r.rolname, v_create_client::regprocedure, 'execute')
  ) x;
  if v_n <> 0 then
    raise exception '#1038 tail: % application-facing role(s) still hold EXECUTE on clara.create_client', v_n
      using errcode = 'CLR10';
  end if;

  select obj_description(v_create_client::regprocedure, 'pg_proc') into v_comment;
  if v_comment is null or v_comment !~* '#1038' or v_comment !~* 'withdrawn' then
    raise exception '#1038 tail: clara.create_client''s catalogue comment does not name #1038/withdrawn (got %)', v_comment
      using errcode = 'CLR10';
  end if;

  -- THE THREE UNTOUCHED #899 NEIGHBOURS: still exactly as 0287 left them.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_open::regprocedure;
  if v_sha is distinct from '0a169df316c23a5b33e66e0b1c8512ed479d4cda33f10c4c10725afa8012ec79' then
    raise exception '#1038 tail: % MOVED while this file applied -- it must not have (got %)', v_open, v_sha using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_open::regprocedure, 'execute') then
    raise exception '#1038 tail: % lost its clara_authenticated grant -- this file must not touch it', v_open using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_begin::regprocedure;
  if v_sha is distinct from '9edd80ef8fa66f855b1ed7cb8667ee60dafb80c302cf638b3dd62fdb391602a7' then
    raise exception '#1038 tail: % MOVED while this file applied -- it must not have (got %)', v_begin, v_sha using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_begin::regprocedure, 'execute') then
    raise exception '#1038 tail: % lost its clara_authenticated grant -- this file must not touch it', v_begin using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_core::regprocedure;
  if v_sha is distinct from '5d8a7a295f8b33d62b719ee068b2ce507d3359d6a361abcd80cfe87613335d08' then
    raise exception '#1038 tail: % MOVED while this file applied -- it must not have (got %)', v_core, v_sha using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
     join pg_roles ro on ro.oid = a.grantee
    where p.oid = v_core::regprocedure and a.privilege_type = 'EXECUTE'
      and ro.rolname in ('clara_authenticated','clara_runtime','clara_agent_ro',
                          'clara_wake_interactive','clara_wake_proactive')
  ) then
    raise exception '#1038 tail: clara._client_birth_core gained an application-role grant -- this file must not touch it' using errcode = 'CLR10';
  end if;

  raise notice '#1038 tail: OK -- clara.create_client is byte-identical to its pre-image; clara_authenticated (and every other application-facing role) no longer holds EXECUTE on it; PUBLIC never did; its catalogue comment names #1038''s closure; open_client_onboarding, begin_client_onboarding and _client_birth_core are all untouched, byte-identical to their #899 pre-images with their #899 grant posture unmoved.';
end
$p1038_tail$;
