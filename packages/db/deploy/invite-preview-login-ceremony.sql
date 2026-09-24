-- #871 — the SIGNED-OUT INVITE PREVIEW login ceremony (DO NOT run in the local DB rig).
--
-- Run in the LIVE project (or a fresh DR target) as a superuser/owner AFTER migration
-- 0309_invite_preview_public_door.sql has applied and the role exists as NOLOGIN. 0309 creates
-- `clara_invite_preview` (the NOLOGIN group that owns the one EXECUTE) and
-- `clara_invite_preview_login` (its NOLOGIN, password-less member shell) and its own tail REFUSES
-- `rolcanlogin` on either, so no credential can arrive by migration. This file is where the
-- credential arrives, out of band, exactly as read-logins-ceremony.sql and write-login-ceremony.sql
-- do for their own shells.
--
-- Mirrors: deploy/read-logins-ceremony.sql (the shape), migration 0163's auth-wall pair (the
-- posture), and deploy/roles-bootstrap.sql (which creates both roles NOLOGIN on a fresh DR target).
--
-- POSTURE. `clara_invite_preview_login` is a PURE SET-ROLE SHELL: zero direct grants, zero direct
-- schema USAGE, zero table privilege. Everything it can do arrives through ONE membership, and that
-- membership reaches exactly ONE function — `clara.preview_invite_by_token(text, bytea)`. The
-- verification block below asserts that, so the ceremony proves the blast radius rather than
-- describing it.
--
-- Zero secrets in this file: the password comes from \prompt. Rotate by re-running with a fresh
-- secret, updating CLARA_INVITE_PREVIEW_DATABASE_URL, verifying, then terminating old sessions out
-- of band. Never `psql -f` this into a rig database.
\set ON_ERROR_STOP on

\prompt 'clara_invite_preview_login password (echoes -- run in a PRIVATE session): ' clara_invite_preview_pw
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_invite_preview_login') then
    raise exception 'clara_invite_preview_login is absent -- apply migration 0309 / roles-bootstrap first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'clara_invite_preview') then
    raise exception 'clara_invite_preview is absent -- apply migration 0309 / roles-bootstrap first';
  end if;
  if not exists (
    select 1 from pg_auth_members m
    join pg_roles r on r.oid = m.member
    join pg_roles g on g.oid = m.roleid
    where r.rolname = 'clara_invite_preview_login' and g.rolname = 'clara_invite_preview'
  ) then
    raise exception 'clara_invite_preview_login is not a member of clara_invite_preview -- the shell would authenticate and reach nothing';
  end if;
end $$;
alter role clara_invite_preview_login login password :'clara_invite_preview_pw';
-- Privilege-SPLIT normalization (0002 §1 / HIGH-8; see roles-bootstrap.sql): PG needs SUPERUSER to
-- set SUPERUSER/BYPASSRLS/CREATEDB even when setting them FALSE, and Supabase's `postgres` is not
-- one — unguarded, this aborts the ceremony (42501).
alter role clara_invite_preview_login nocreaterole inherit;
do $$
begin
  if current_setting('is_superuser') = 'on' then
    alter role clara_invite_preview_login nosuperuser nobypassrls nocreatedb;
  end if;
end $$;
\unset clara_invite_preview_pw

-- Fail closed: a privilege-less login shell that only becomes useful after SET ROLE into its group.
do $$
declare bad text;
begin
  select string_agg(format('%s:%s', rolname, x), ', ') into bad from (
    select rolname, 'SUPERUSER' x from pg_roles where rolname = 'clara_invite_preview_login' and rolsuper
    union all select rolname, 'BYPASSRLS' from pg_roles where rolname = 'clara_invite_preview_login' and rolbypassrls
    union all select rolname, 'CREATEDB' from pg_roles where rolname = 'clara_invite_preview_login' and rolcreatedb
    union all select rolname, 'CREATEROLE' from pg_roles where rolname = 'clara_invite_preview_login' and rolcreaterole
  ) s;
  if bad is not null and bad <> '' then
    raise exception 'invite-preview ceremony ABORTED: %. This must be a privilege-less login shell.', bad;
  end if;
  -- THE GROUP MUST NEVER BE A LOGIN. The credential belongs to the shell; a LOGIN group role would
  -- be a credential that carries the grant directly, with no SET ROLE to audit.
  if exists (select 1 from pg_roles where rolname = 'clara_invite_preview' and rolcanlogin) then
    raise exception 'invite-preview ceremony ABORTED: clara_invite_preview carries LOGIN -- only its shell may';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- POST-CEREMONY VERIFICATION -- eyeball each result against the expected value.
-- ---------------------------------------------------------------------------

-- (1) The shell is LOGIN; every escalation/bypass bit off; rolinherit TRUE (so the explicit SET
--     ROLE carries the group's privilege). The GROUP stays NOLOGIN.
--     Expect: clara_invite_preview       f f f f f t
--             clara_invite_preview_login t f f f f t
select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
  from pg_roles where rolname in ('clara_invite_preview','clara_invite_preview_login') order by 1;

-- (2) EXACTLY ONE membership for the shell, in its own group. Expect one row.
select member.rolname as login_role, parent.rolname as group_role, am.inherit_option, am.set_option, am.admin_option
  from pg_auth_members am
  join pg_roles member on member.oid = am.member
  join pg_roles parent on parent.oid = am.roleid
  where member.rolname = 'clara_invite_preview_login' order by 1;

-- (3) EVERY function in schema clara this lane can EXECUTE, through the group or directly.
--     Expect EXACTLY ONE row: preview_invite_by_token.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara'
   and has_function_privilege('clara_invite_preview_login', p.oid, 'EXECUTE')
 order by 1;

-- (4) NO direct table grant, and no direct schema USAGE on the shell itself (the group holds the
--     USAGE; the shell reaches it only through SET ROLE). Expect 0 rows, then f.
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where grantee in ('clara_invite_preview','clara_invite_preview_login') and table_schema = 'clara'
 order by 1, 2;
select rolname, has_schema_privilege(rolname, 'clara', 'USAGE') as direct_clara_usage
  from pg_roles where rolname = 'clara_invite_preview_login';

-- (5) OUT-OF-BAND connection + SET ROLE smoke (cannot authenticate inline from psql -f). After
--     wiring CLARA_INVITE_PREVIEW_DATABASE_URL, in a PRIVATE session:
--       psql "<the new DSN>" -c "set role clara_invite_preview; \
--         select clara.preview_invite_by_token('not-a-real-token', decode(repeat('00',32),'hex'));"
--     Expect {"outcome":"not_previewable"} -- the door's own single refusal, which proves the whole
--     chain (authenticate -> SET ROLE -> EXECUTE -> the wall counted it) with no real token and no
--     information disclosed. Then terminate any stale sessions from a rotated credential.
