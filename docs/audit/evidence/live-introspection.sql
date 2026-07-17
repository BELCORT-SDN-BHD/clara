-- Clara Phase-1 · live READ-ONLY introspection of the frozen belcort-shared project.
-- Paste this whole block into the Supabase Dashboard → SQL Editor (project msegmhvkmwcyxtxoszzp)
-- and run it. It is STRICTLY READ-ONLY (only selects from system catalogs) — it changes nothing.
-- Copy the result of each query back to me; I diff it against the repo's db/v2/*.sql.

-- 1) All tables in public + whether RLS is enabled and FORCED (should be true/true on every books table)
select c.relname            as table_name,
       c.relrowsecurity     as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2) Count of tables (repo claims 57)
select count(*) as public_table_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r';

-- 3) Every function in public + schema, security type (DEFINER vs INVOKER), volatility
select p.proname as fn_name,
       case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
       case p.provolatile when 'v' then 'volatile' when 's' then 'stable' when 'i' then 'immutable' end as volatility,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
order by p.proname;

-- 4) EXECUTE grants: which roles can execute which public functions (the ADR-030 EXECUTE-only surface)
select p.proname as fn_name,
       r.rolname as grantee
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
cross join lateral aclexplode(p.proacl) a
join pg_roles r on r.oid=a.grantee
where n.nspname='public' and a.privilege_type='EXECUTE'
order by p.proname, r.rolname;

-- 5) Table-level DML grants to runtime roles (should be NONE for authenticated on books tables — EXECUTE-only)
select c.relname as table_name, r.rolname as grantee, a.privilege_type
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(c.relacl) a
join pg_roles r on r.oid=a.grantee
where n.nspname='public' and c.relkind='r'
  and a.privilege_type in ('INSERT','UPDATE','DELETE')
  and r.rolname in ('authenticated','anon')
order by c.relname, r.rolname;

-- 6) All RLS policies (name, table, command, roles, using/with-check expressions)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, policyname;

-- 7) Triggers on public tables (expect the deferred balance trigger + firm-stamp triggers)
select c.relname as table_name, t.tgname as trigger_name,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
order by c.relname, t.tgname;

-- 8) Storage buckets + whether public
select id, name, public, created_at from storage.buckets order by name;

-- 9) Storage RLS policies (the firm-scoped firm-docs path enforcement)
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='storage'
order by tablename, policyname;

-- 10) Row counts on the key books tables (confirms this is a NO-real-client-data project as claimed)
select 'firms' t, count(*) n from public.firms
union all select 'clients', count(*) from public.clients
union all select 'journal_entries', count(*) from public.journal_entries
union all select 'journal_lines', count(*) from public.journal_lines
union all select 'documents', count(*) from public.documents
order by t;

-- 11) Postgres version (repo claims PG17)
select version();
