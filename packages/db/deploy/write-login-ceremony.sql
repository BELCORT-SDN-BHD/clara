-- Slice-6 write-floor LOGIN ceremony (DO NOT run in the local DB rig).
-- Run in the LIVE project as a superuser/owner AFTER migration 0009 has created
-- clara_wake_write_login as NOLOGIN with a single membership of clara_wake_interactive
-- (WITH INHERIT FALSE, SET TRUE). Migration 0009 deliberately leaves the role
-- password-less and NOLOGIN so no credential is ever committed; this ceremony flips
-- it to LOGIN and sets the password the runtime write pool authenticates with via
-- CLARA_WRITE_DATABASE_URL. The role stays non-superuser and non-bypass-RLS and
-- inherits NO app privilege until withWriteWakeScoped does `SET ROLE
-- clara_wake_interactive` inside its transaction. Zero secrets live in this file:
-- the password is supplied interactively via psql \prompt. Rotate by re-running with
-- a fresh secret, updating CLARA_WRITE_DATABASE_URL, verifying INSERT/COMMIT under a
-- wake secret, then terminating the old sessions out of band.
--
-- The local Postgres rig has no live runtime, so this posture is ceremony-tested
-- (mirrors deploy/storage-provision.sql). Never `psql -f` it into clara_test.

\prompt 'clara_wake_write_login password (echoes -- run in a PRIVATE session): ' clara_write_pw

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_wake_write_login') then
    raise exception 'clara_wake_write_login is absent -- apply migration 0009 first';
  end if;
end $$;

-- Flip to LOGIN with the operator-supplied secret. The remaining posture bits are
-- pinned by 0009 and re-asserted here for a deploy role that lacks them. rolinherit
-- stays TRUE (so the explicit SET ROLE carries clara_wake_interactive's privileges);
-- the MEMBERSHIP is INHERIT FALSE, so the role carries nothing until it SET ROLEs.
alter role clara_wake_write_login login password :'clara_write_pw';
-- Attribute normalization is SPLIT by privilege (the 0002 §1 / HIGH-8 law, mirrored
-- from deploy/roles-bootstrap.sql). PostgreSQL requires SUPERUSER to set SUPERUSER /
-- BYPASSRLS / CREATEDB **even when setting them to false**; Supabase's `postgres` is
-- NOT a superuser, so an unguarded ALTER here fails 42501 and aborts the ceremony
-- under ON_ERROR_STOP (drill-proven on a real project, 2026-07-20). Migration 0009
-- already creates the role with these defaults, so the guarantee holds regardless —
-- these are defense-in-depth for a deploy role that happens to have the privilege,
-- and the fail-closed check below asserts the posture either way.
alter role clara_wake_write_login nocreaterole inherit;
do $$
begin
  if current_setting('is_superuser') = 'on' then
    alter role clara_wake_write_login nosuperuser nobypassrls nocreatedb;
  end if;
end $$;

-- Fail closed: the write floor's whole premise is that this login carries NO privilege
-- of its own until it SET ROLEs. Assert it rather than assume it.
do $$
declare bad text;
begin
  select string_agg(x, ', ') into bad from (
    select 'SUPERUSER' x from pg_roles where rolname='clara_wake_write_login' and rolsuper
    union all select 'BYPASSRLS' from pg_roles where rolname='clara_wake_write_login' and rolbypassrls
    union all select 'CREATEDB' from pg_roles where rolname='clara_wake_write_login' and rolcreatedb
    union all select 'CREATEROLE' from pg_roles where rolname='clara_wake_write_login' and rolcreaterole
  ) s;
  if bad is not null and bad <> '' then
    raise exception 'write-login ceremony ABORTED: clara_wake_write_login carries %. The write floor requires a privilege-less login.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Post-ceremony verification -- ALL must hold before wiring the runtime DSN.
-- ---------------------------------------------------------------------------

-- (1) Login is on; every escalation/bypass bit is off; rolinherit stays TRUE.
--     Expect: rolcanlogin=t, rolsuper=f, rolbypassrls=f, rolcreatedb=f,
--             rolcreaterole=f, rolinherit=t.
select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
  from pg_roles where rolname = 'clara_wake_write_login';

-- (2) Exactly ONE membership: clara_wake_interactive, INHERIT FALSE, SET TRUE, ADMIN FALSE.
--     Expect a single row: parent_role=clara_wake_interactive,
--     inherit_option=f, set_option=t, admin_option=f.
select parent.rolname as parent_role, am.inherit_option, am.set_option, am.admin_option
  from pg_auth_members am
  join pg_roles member on member.oid = am.member
  join pg_roles parent on parent.oid = am.roleid
  where member.rolname = 'clara_wake_write_login';

-- (3) The role holds NO direct function grant of its own -- privilege arrives only
--     after SET ROLE clara_wake_interactive inside the write closure. Expect 0.
select count(*) as direct_function_grants
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(p.proacl) a
  join pg_roles gr on gr.oid = a.grantee
  where n.nspname = 'clara' and gr.rolname = 'clara_wake_write_login';

-- (4) The role holds NO direct base-table grant of its own. Expect 0.
select count(*) as direct_table_grants
  from information_schema.role_table_grants
  where grantee = 'clara_wake_write_login' and table_schema = 'clara';

\unset clara_write_pw

-- Intentionally absent: any GRANT to clara_wake_write_login (it needs none -- it only
-- SET ROLEs); NOINHERIT on the role (it must INHERIT so the SET ROLE takes effect);
-- and any hard-coded secret (supplied at run time by \prompt only).
