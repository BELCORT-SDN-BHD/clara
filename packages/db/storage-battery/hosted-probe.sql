-- =====================================================================
-- #620 AC4/AC7 — HOSTED Storage grant/policy probe. READ-ONLY.
--
-- WHAT THIS IS FOR. `run.mjs` proves the ceremony's posture on a DISPOSABLE stack the CLI
-- builds from scratch. That is local evidence. It cannot answer what the LIVE project's
-- `storage.objects` actually carries today, and three live questions are open (recorded as
-- hosted-pending on #620):
--
--   1. Was `packages/db/deploy/wave-b-storage-update-amendment-REVERT.sql` ever applied? The
--      amendment granted UPDATE on `storage.objects` to `clara_storage_docs` on a WRONG
--      diagnosis (it probed PUT, a verb `putCanonical` never calls). Both the amendment and its
--      revert are manual ceremony scripts with NO applied/pending ledger — `packages/db`'s
--      ledger covers `migrations/` only — so the live grant is unknowable from source.
--   2. Does a wiki policy pair exist live? `putWikiCanonical` writes
--      `firms/<firm>/wiki/<client>/<sha>.md` into the SAME private bucket with the SAME
--      credential (packages/runtime/lib/storage.mjs:272-289), but this repository's ceremony
--      creates policies for `.../docs/<sha64>.<ext>` ONLY. Cell B12 of the local battery
--      measures that a conforming wiki key is REFUSED against the repository's ceremony.
--      Section 4 below is what says whether the live project has a second, out-of-band pair.
--   3. Is there a `reports/` (or any other) prefix policy nobody in this repository recorded?
--      Section 4 lists EVERY policy on `storage.objects`, not only the ones we expect, because
--      a boundary you only query by name cannot show you what else is standing.
--
-- HOW TO RUN IT (release session; the DSN travels on STDIN, never argv, never a file):
--
--   fly ssh console -a clara-runtime --machine <probe> -q \
--     -C "sh -c 'printf %s \"$WORKFLOW_POSTGRES_URL\"'" \
--     | node scripts/ops/dsn-pipe.mjs -- \
--         psql -v ON_ERROR_STOP=1 -X -f packages/db/storage-battery/hosted-probe.sql
--
-- SAFETY. The whole file runs inside ONE `read only` transaction: any statement that tried to
-- write would raise 25006 and abort rather than touch a live estate. Nothing here creates,
-- alters, grants or drops. Paste the output into the ticket as HOSTED evidence, labelled
-- separately from `run.mjs`'s LOCAL evidence (AC5/AC7 keep the classes apart).
-- =====================================================================

begin;
set transaction read only;

\echo '=== 1. clara_storage_docs role attributes (mirrors storage-provision.sql:39-55) ==='
select rolname,
       rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication,
       rolcanlogin, rolinherit,
       rolvaliduntil
  from pg_roles
 where rolname = 'clara_storage_docs';

\echo '=== 2. storage.objects privileges held by clara_storage_docs ==='
\echo '    EXPECTED: insert=t select=t, and update=f delete=f truncate=f references=f trigger=f.'
\echo '    A true in the update column means the 2026-07-26 amendment is still live and its'
\echo '    REVERT was never applied (hosted-pending item 1).'
select p as privilege,
       has_table_privilege('clara_storage_docs', 'storage.objects', p) as held
  from unnest(array['INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
 order by 1;

\echo '=== 2b. storage.buckets privileges held by clara_storage_docs (expected: all false) ==='
select p as privilege,
       has_table_privilege('clara_storage_docs', 'storage.buckets', p) as held
  from unnest(array['INSERT','SELECT','UPDATE','DELETE']) p
 order by 1;

\echo '=== 3. admin-inheritance detector — every base/admin role must be false ==='
\echo '    pg_has_role ERRORS on a role that does not exist and SQL does not short-circuit'
\echo '    WHERE, so the existence guard is a CASE: the one construct whose evaluation order'
\echo '    Postgres guarantees (wave-b-storage-update-amendment.sql:150-170).'
select r as base_role,
       case when exists (select 1 from pg_roles where rolname = r)
            then pg_has_role('clara_storage_docs', r, 'member')
            else null end as is_member
  from unnest(array['postgres','supabase_storage_admin','supabase_admin','service_role','authenticated','anon']) r
 order by 1;

\echo '=== 3b. what clara_storage_docs IS granted to (expected: exactly authenticator) ==='
select m.rolname as granted_to, a.admin_option
  from pg_auth_members a
  join pg_roles r on r.oid = a.member
  join pg_roles m on m.oid = a.roleid
 where r.rolname = 'clara_storage_docs'
 order by 1;

\echo '=== 4. EVERY policy on storage.objects — docs pair, any wiki pair, any reports pair ==='
\echo '    EXPECTED from this repository: clara_storage_docs_insert (INSERT) and'
\echo '    clara_storage_docs_select (SELECT), both keyed on bucket firm-docs plus the'
\echo '    content-addressed .../docs/<sha64>.<ext> regex. Anything else standing here was'
\echo '    created out of band and is not reproduced by any artifact in this repository.'
select policyname, cmd, permissive, roles, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;

\echo '=== 4b. is RLS actually enabled on storage.objects? (a policy on an RLS-off table binds nothing) ==='
select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
       pg_get_userbyid(c.relowner) as owner
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'storage' and c.relname in ('objects','buckets')
 order by 1;

\echo '=== 5. buckets, and 6. an object-key census by family — both PRIVILEGE-GUARDED ==='
\echo '    Sections 1-4 read pg_catalog/pg_policies, which every role may read. These two read'
\echo '    the storage tables themselves, which the DSN the release session happens to hold may'
\echo '    not be granted. They are wrapped so a permission denial prints a NOTICE and the probe'
\echo '    continues — under ON_ERROR_STOP=1 an unguarded denial would abort the whole file and'
\echo '    throw away the answers sections 1-4 already produced.'
do $$
declare r record;
begin
  begin
    for r in select id, name, public from storage.buckets order by id loop
      raise notice 'bucket: id=% name=% public=%  (firm-docs MUST exist and MUST be public=f)', r.id, r.name, r.public;
    end loop;
  exception when insufficient_privilege then
    raise notice 'bucket census SKIPPED: this principal cannot select storage.buckets (%)', sqlerrm;
  end;

  begin
    for r in
      select case
               when name ~ '^firms/[0-9a-f-]{36}/docs/[0-9a-f]{64}\.[a-z0-9]{1,12}$' then 'docs (policy-conforming)'
               when name ~ '^firms/[0-9a-f-]{36}/wiki/' then 'wiki'
               when name ~ '^firms/[0-9a-f-]{36}/reports/' then 'reports'
               else 'other'
             end as family,
             count(*) as objects
        from storage.objects
       where bucket_id = 'firm-docs'
       group by 1
       order by 1
    loop
      raise notice 'firm-docs key family: % -> % object(s)', r.family, r.objects;
    end loop;
  exception when insufficient_privilege then
    raise notice 'object census SKIPPED: this principal cannot select storage.objects (%)', sqlerrm;
  end;
end $$;

commit;
