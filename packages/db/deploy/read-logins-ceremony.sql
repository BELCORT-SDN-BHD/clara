-- Runtime + read-pool LOGIN ceremony (DO NOT run in the local DB rig).
-- Run in the LIVE project (or a fresh DR target) as a superuser/owner AFTER the roles
-- exist as NOLOGIN (migration 0006 / deploy/roles-bootstrap.sql created them NOLOGIN and
-- password-less so no credential is ever committed). Mirrors write-login-ceremony.sql:
-- it flips clara_runtime_login + clara_agent_read_login to LOGIN and sets the passwords
-- the runtime pools authenticate with (the runtime DSN / CLARA_READ_DATABASE_URL). Each
-- role stays non-superuser, non-bypass-RLS; its ONE membership is INHERIT FALSE / SET
-- TRUE — so it carries no GROUP privilege until the pool SET ROLEs into its group.
--
-- POSTURE DIFFERENCE from the write-login shell (deliberate, migration ground truth):
--   * clara_agent_read_login is a PURE set-role shell — ZERO direct grants (like the
--     write-login shell).
--   * clara_runtime_login receives ONE direct capability by design (0007:2801-2805):
--     EXECUTE on clara.record_rule_resolution(uuid,text) + USAGE on schema clara ("only
--     the non-inheriting runtime login shell receives this direct capability"). So its
--     posture check expects exactly that — not zero.
--
-- Zero secrets in this file: the passwords come from \prompt. Rotate by re-running with
-- fresh secrets, updating the DSNs, verifying, then terminating old sessions out of band.
-- The local rig has no live runtime, so this posture is ceremony-tested (mirrors
-- deploy/storage-provision.sql / write-login-ceremony.sql). Never `psql -f` into a rig DB.
\set ON_ERROR_STOP on

-- ===== clara_runtime_login (member of clara_runtime) =====
\prompt 'clara_runtime_login password (echoes -- run in a PRIVATE session): ' clara_runtime_pw
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_runtime_login') then
    raise exception 'clara_runtime_login is absent -- apply migration 0006 / roles-bootstrap first';
  end if;
end $$;
alter role clara_runtime_login login password :'clara_runtime_pw';
-- Privilege-SPLIT normalization (0002 §1 / HIGH-8; see roles-bootstrap.sql): PG needs
-- SUPERUSER to set SUPERUSER/BYPASSRLS/CREATEDB even when setting them FALSE, and
-- Supabase's `postgres` is not one — unguarded, this aborts the ceremony (42501).
alter role clara_runtime_login nocreaterole inherit;
do $$
begin
  if current_setting('is_superuser') = 'on' then
    alter role clara_runtime_login nosuperuser nobypassrls nocreatedb;
  end if;
end $$;
\unset clara_runtime_pw

-- ===== clara_agent_read_login (member of clara_agent_ro) =====
\prompt 'clara_agent_read_login password (echoes -- run in a PRIVATE session): ' clara_readlogin_pw
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_agent_read_login') then
    raise exception 'clara_agent_read_login is absent -- apply migration 0006 / roles-bootstrap first';
  end if;
end $$;
alter role clara_agent_read_login login password :'clara_readlogin_pw';
alter role clara_agent_read_login nocreaterole inherit;
do $$
begin
  if current_setting('is_superuser') = 'on' then
    alter role clara_agent_read_login nosuperuser nobypassrls nocreatedb;
  end if;
end $$;
\unset clara_readlogin_pw

-- Fail closed for BOTH read logins: each must be a privilege-less shell that only
-- becomes useful after SET ROLE into its one group.
do $$
declare bad text;
begin
  select string_agg(format('%s:%s', rolname, x), ', ') into bad from (
    select rolname, 'SUPERUSER' x from pg_roles where rolname in ('clara_runtime_login','clara_agent_read_login') and rolsuper
    union all select rolname, 'BYPASSRLS' from pg_roles where rolname in ('clara_runtime_login','clara_agent_read_login') and rolbypassrls
    union all select rolname, 'CREATEDB' from pg_roles where rolname in ('clara_runtime_login','clara_agent_read_login') and rolcreatedb
    union all select rolname, 'CREATEROLE' from pg_roles where rolname in ('clara_runtime_login','clara_agent_read_login') and rolcreaterole
  ) s;
  if bad is not null and bad <> '' then
    raise exception 'read-logins ceremony ABORTED: %. These must be privilege-less login shells.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- POST-CEREMONY VERIFICATION -- eyeball each result against the expected value.
-- ---------------------------------------------------------------------------

-- (1) Both LOGIN; every escalation/bypass bit off; rolinherit stays TRUE (so the
--     explicit SET ROLE carries the group's privileges). Expect: rolcanlogin=t,
--     rolsuper=f, rolbypassrls=f, rolcreatedb=f, rolcreaterole=f, rolinherit=t.
select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
  from pg_roles where rolname in ('clara_runtime_login','clara_agent_read_login') order by 1;

-- (2) Each has EXACTLY ONE membership, INHERIT FALSE / SET TRUE / ADMIN FALSE, in its own
--     group. Expect two rows: clara_agent_read_login->clara_agent_ro, clara_runtime_login->
--     clara_runtime, all inherit_option=f set_option=t admin_option=f.
select member.rolname as login_role, parent.rolname as group_role, am.inherit_option, am.set_option, am.admin_option
  from pg_auth_members am
  join pg_roles member on member.oid = am.member
  join pg_roles parent on parent.oid = am.roleid
  where member.rolname in ('clara_runtime_login','clara_agent_read_login') order by 1;

-- (3) DIRECT function grants held by each login role itself (NOT via the group).
--     Expect EXACTLY: clara_runtime_login -> record_rule_resolution (the one designed
--     direct capability); clara_agent_read_login -> (no rows).
select gr.rolname as login_role, p.proname as direct_function_grant
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(p.proacl) a
  join pg_roles gr on gr.oid = a.grantee
  where n.nspname = 'clara' and gr.rolname in ('clara_runtime_login','clara_agent_read_login')
  order by 1, 2;

-- (4) DIRECT schema-USAGE held by each login role itself. Expect: clara_runtime_login=t
--     (its designed direct USAGE), clara_agent_read_login=f (pure set-role shell).
select rolname, has_schema_privilege(rolname, 'clara', 'USAGE') as direct_clara_usage
  from pg_roles where rolname in ('clara_runtime_login','clara_agent_read_login') order by 1;

-- (5) Neither holds a DIRECT base-table grant of its own (table reads arrive only via
--     SET ROLE into the group). Expect 0 rows.
select grantee as login_role, table_name, privilege_type
  from information_schema.role_table_grants
  where grantee in ('clara_runtime_login','clara_agent_read_login') and table_schema = 'clara'
  order by 1, 2;

-- (6) OUT-OF-BAND connection + SET ROLE smoke (cannot authenticate inline from psql -f).
--     After wiring each DSN, in a PRIVATE session connect AS the login role and prove the
--     set-role chain, e.g.:
--       psql "<runtime DSN>"        -c "set role clara_runtime; select current_user, session_user;"
--       psql "<CLARA_READ_DATABASE_URL>" -c "set role clara_agent_ro; select clara.trial_balance('<a client uuid>') limit 1;"
--     Then terminate any stale sessions from a rotated credential out of band.
