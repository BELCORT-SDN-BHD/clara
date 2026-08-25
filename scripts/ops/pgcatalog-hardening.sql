-- scripts/ops/pgcatalog-hardening.sql — pg_catalog residual hardening (F-A6 B-1 / H-5), CEREMONY.
--
-- STATUS: REHEARSED ONLY. NOT YET RUN ANYWHERE LIVE. The rehearsal report
-- (docs/ops/pgcatalog-hardening-rehearsal.md) found the live deploy role (the Session-pooler
-- DSN behind `clara-backup`'s DATABASE_URL, "≈ project admin") is CONFIRMED not the owner of any
-- pg_catalog function and CONFIRMED not a superuser (ADR-0020; wave-e-delta-ceremony-asrun.md's
-- live SQLSTATE 42501 field evidence) — so both the REVOKE below and the re-GRANT allowlist are
-- structurally impossible for that role to run on the managed Supabase cluster. This script's
-- live branch is written and guarded for completeness and for the day the platform posture
-- changes (a superuser maintenance window, self-hosted Postgres, or a Supabase-granted exception)
-- — it is NOT a pending action item. Read the rehearsal report before ever pointing this at a
-- non-throwaway target.
--
-- This is NOT a migration (packages/db/migrations/ never touches pg_catalog — cluster-role
-- surgery is ceremony-class, like deploy/acl-baseline.sql). It requires SUPERUSER (or ownership
-- of every named pg_catalog function, which in practice means superuser on any stock Postgres,
-- since those functions are owned by the initdb bootstrap role).
--
-- MEASURED allowlist (packages/db/README's "measure, don't assume" — see the rehearsal report
-- for the full derivation, the breakage log, and why "revoke ALL of pg_catalog" (the ticket's
-- literal starting point) is infeasible: it also strips EXECUTE on the functions backing
-- ordinary operators/casts, e.g. `select 1+1` fails with "permission denied for function
-- int4pl" the instant PUBLIC EXECUTE is revoked catalog-wide. The scope below is the NAMED
-- residual family only — pg_notify / pg_advisory_* / pg_sleep* / the query_to_xml family —
-- exactly the surface acl-baseline.sql:7-12/129-145 already named as the accepted gap.
--
--   clara_fn_owner  pg_notify(text,text)                            0005:489, 0006:887 (via the
--                                                                    SECURITY DEFINER writer
--                                                                    bodies these functions run
--                                                                    inside — ACL is checked
--                                                                    against the OWNER under
--                                                                    SECURITY DEFINER, not the
--                                                                    original caller)
--   clara_fn_owner  pg_advisory_xact_lock(integer,integer)          0006/0007/0009/0011, the
--                                                                    literal-int-pair firm/client
--                                                                    lock-key family (203005001..7,
--                                                                    202991617)
--   clara_fn_owner  pg_advisory_xact_lock(bigint)                   hashtextextended(...) call
--                                                                    sites (0007/0009/0011 etc.)
--   clara_fn_owner  pg_advisory_xact_lock_shared(integer,integer)   0056:769, _tf_close_serialize
--                                                                    — a trigger on 8 close-domain
--                                                                    tables, fires on ORDINARY
--                                                                    writes, not just close verbs
--   clara_runtime   pg_notify(text,text)                            packages/runtime/lib/
--                                                                    reconciler.mjs:104 — issued
--                                                                    DIRECTLY (not via a DEFINER
--                                                                    body) on a role-set
--                                                                    `clara_runtime` connection
--   clara_runtime   pg_advisory_lock(bigint)                        packages/runtime/lib/
--                                                                    relay.mjs:168 — leader
--                                                                    election, SESSION-scoped by
--                                                                    design (BEGIN/COMMIT must not
--                                                                    release it); a REAL need this
--                                                                    ticket's own "session-level
--                                                                    need may be ZERO app roles"
--                                                                    hypothesis got WRONG —
--                                                                    corrected by measurement
--
-- Deliberately NOT granted to anyone: pg_sleep* (no production caller anywhere in the estate;
-- the one caller, a wb-0020 test helper simulating wall-clock passage, should move to a JS-side
-- `setTimeout` between two queries on the same open transaction instead of `select pg_sleep(...)`
-- — see the rehearsal report's breakage log); the xml family (no caller in the estate); every
-- SESSION-scoped advisory-lock function beyond the one clara_runtime leader-election call
-- (pg_try_advisory_lock, pg_advisory_unlock, the _shared session variants, the (integer,integer)
-- session overloads) — H-5's whole point is that a read-sandbox-adjacent role must NOT be able
-- to squat a session lock, so the allowlist stays exactly as tight as the measured call sites,
-- not "whatever might be convenient".
--
-- KNOWN GAP this script does NOT close (informational, not a blocker): packages/db/scripts/
-- migrate.mjs's F10 concurrent-runner guard and scripts/dr-selftest.mjs both take a raw
-- pg_advisory_lock(integer,integer)/pg_advisory_unlock(integer,integer) session lock on
-- whatever role runs `pnpm db:migrate` / `pnpm db:dr:selftest` — NOT clara_fn_owner or
-- clara_runtime, but the ambient deploy credential. On the throwaway rig that's `postgres`
-- (superuser, bypasses ACL, so this rehearsal's own migration runs never surfaced the gap). If
-- this hardening is EVER run somewhere the deploy role is NOT superuser, that role also needs
-- `pg_advisory_lock(integer,integer)` + `pg_advisory_unlock(integer,integer)` or `pnpm db:migrate`
-- aborts at its very first statement. Not added to the allowlist below because on live the point
-- is moot (the deploy role can't run this script at all — see STATUS above); a self-hosted
-- target with a genuinely different deploy role must add this line by hand and say so in the
-- ceremony's own as-run record.
\set ON_ERROR_STOP on

-- ===========================================================================================
-- GUARD — mirrors packages/db/lib/guard.mjs's disposable-target discipline (never hand-rolled
-- ad hoc): refuse to run destructive cluster-role surgery against an arbitrary target. A
-- pg_catalog REVOKE has cluster-wide, not schema-scoped, blast radius, so the guard is stricter
-- than guard.mjs's: even a NAMED-target confirmation is not enough by itself — the operator must
-- ALSO affirmatively swear the pre-flight ownership/superuser check (below) was read and is TRUE
-- (or accept the abort). Pass both:
--   psql ... -v ceremony_confirm='I_READ_THE_REHEARSAL_REPORT' -v ceremony_target='<user@host:port/db>'
-- A throwaway/disposable target (localhost, or a *_ci/_test/_tmp/_scratch/_ephemeral database
-- name — the exact EPHEMERAL_DB shape guard.mjs uses) skips the named-target requirement, same
-- policy as the node guard, but NEVER skips the confirm phrase — this file changes cluster ACLs,
-- which no throwaway-ness excuses skipping a read of the rehearsal report for.
-- ===========================================================================================
\echo '===== PREFLIGHT ====='
select current_database() as db, current_user as deploy_role, inet_server_addr() as server_addr,
       inet_server_port() as server_port;

select current_user as deploy_role,
       (select rolsuper from pg_roles where rolname = current_user) as deploy_is_superuser,
       (select bool_and(pg_has_role(current_user, p.proowner, 'USAGE'))
          from pg_proc p where p.pronamespace = 'pg_catalog'::regnamespace and p.proname = 'pg_notify'
       ) as deploy_owns_pg_notify;
\echo 'MUST show deploy_is_superuser = t (OR deploy_owns_pg_notify = t) — otherwise EVERY revoke/grant'
\echo 'below silently fails or aborts loudly (rehearsal report §3). This is not a migration; there is'
\echo 'no atomic single-transaction guarantee across every statement below on managed Supabase.'

\if :{?ceremony_confirm}
\else
  \warn 'ABORTED: pass -v ceremony_confirm=I_READ_THE_REHEARSAL_REPORT (exact phrase) to proceed.'
  \q
\endif

select :'ceremony_confirm' = 'I_READ_THE_REHEARSAL_REPORT' as confirm_ok \gset
\if :confirm_ok
\else
  \warn 'ABORTED: ceremony_confirm did not match the exact required phrase. Refusing.'
  \q
\endif

\if :{?ceremony_target}
\else
  \set ceremony_target ''
\endif
set clara_hardening.named_target = :'ceremony_target';
do $$
declare
  db text := current_database();
  is_ephemeral boolean;
  identity text := current_user || '@' || coalesce(inet_server_addr()::text, 'unix_socket') || ':'
                   || coalesce(inet_server_port()::text, '0') || '/' || current_database();
  named text := nullif(current_setting('clara_hardening.named_target', true), '');
begin
  is_ephemeral := (inet_server_addr() is null)  -- unix socket / localhost-only listener
    or (inet_server_addr() = '127.0.0.1'::inet)
    or (inet_server_addr() = '::1'::inet)
    or (db ~* '(^|[._-])(ci|test|tmp|temp|scratch|ephemeral)$');
  if not is_ephemeral and (named is null or named <> identity) then
    raise exception 'ABORTED: target % does not look disposable (no *_ci/_test/_tmp/_scratch/_ephemeral suffix, not loopback), and -v ceremony_target did not match it EXACTLY. Re-run with -v ceremony_target=''%'' if this is deliberately a named non-throwaway target — copy the identity from THIS abort message, never author it by hand — and re-read the rehearsal report''s GO/NO-GO section first (spoiler: it is NO-GO on managed Supabase — see STATUS at the top of this file).', identity, identity;
  end if;
  raise notice 'disposable-target check OK (identity=%)', identity;
end $$;

\echo '===== BEFORE: PUBLIC pg_catalog EXECUTE count ====='
select count(*) from pg_proc p where p.pronamespace = 'pg_catalog'::regnamespace
  and has_function_privilege('public', p.oid, 'EXECUTE');

-- ===========================================================================================
-- REVOKE — the named residual family, 32 functions (rehearsal report §1, complete overload
-- enumeration — a superset of acl-baseline.sql:133-143's commented 11, which missed
-- pg_advisory_unlock_all, every _shared variant, every (integer,integer) overload, pg_sleep_for/
-- pg_sleep_until, and 5 of 8 xml siblings).
-- ===========================================================================================
\echo '===== REVOKE: the named residual family from PUBLIC ====='
revoke execute on function
  pg_catalog.pg_notify(text,text),
  pg_catalog.pg_sleep(double precision),
  pg_catalog.pg_sleep_for(interval),
  pg_catalog.pg_sleep_until(timestamp with time zone),
  pg_catalog.pg_advisory_lock(bigint),
  pg_catalog.pg_advisory_lock(integer,integer),
  pg_catalog.pg_advisory_lock_shared(bigint),
  pg_catalog.pg_advisory_lock_shared(integer,integer),
  pg_catalog.pg_try_advisory_lock(bigint),
  pg_catalog.pg_try_advisory_lock(integer,integer),
  pg_catalog.pg_try_advisory_lock_shared(bigint),
  pg_catalog.pg_try_advisory_lock_shared(integer,integer),
  pg_catalog.pg_advisory_unlock(bigint),
  pg_catalog.pg_advisory_unlock(integer,integer),
  pg_catalog.pg_advisory_unlock_shared(bigint),
  pg_catalog.pg_advisory_unlock_shared(integer,integer),
  pg_catalog.pg_advisory_unlock_all(),
  pg_catalog.pg_advisory_xact_lock(bigint),
  pg_catalog.pg_advisory_xact_lock(integer,integer),
  pg_catalog.pg_advisory_xact_lock_shared(bigint),
  pg_catalog.pg_advisory_xact_lock_shared(integer,integer),
  pg_catalog.pg_try_advisory_xact_lock(bigint),
  pg_catalog.pg_try_advisory_xact_lock(integer,integer),
  pg_catalog.pg_try_advisory_xact_lock_shared(bigint),
  pg_catalog.pg_try_advisory_xact_lock_shared(integer,integer),
  pg_catalog.query_to_xml(text,boolean,boolean,text),
  pg_catalog.query_to_xmlschema(text,boolean,boolean,text),
  pg_catalog.query_to_xml_and_xmlschema(text,boolean,boolean,text),
  pg_catalog.table_to_xml(regclass,boolean,boolean,text),
  pg_catalog.table_to_xmlschema(regclass,boolean,boolean,text),
  pg_catalog.table_to_xml_and_xmlschema(regclass,boolean,boolean,text),
  pg_catalog.cursor_to_xml(refcursor,integer,boolean,boolean,text),
  pg_catalog.cursor_to_xmlschema(refcursor,boolean,boolean,text)
from public;

-- ===========================================================================================
-- RE-GRANT — the measured allowlist. Six grants, two roles, both DERIVED from real call sites
-- (grep + the rig estate-suite run), not from the design doc's a-priori guesses.
-- ===========================================================================================
\echo '===== RE-GRANT: measured allowlist ====='
grant execute on function pg_catalog.pg_notify(text,text) to clara_fn_owner;
grant execute on function pg_catalog.pg_advisory_xact_lock(integer,integer) to clara_fn_owner;
grant execute on function pg_catalog.pg_advisory_xact_lock(bigint) to clara_fn_owner;
grant execute on function pg_catalog.pg_advisory_xact_lock_shared(integer,integer) to clara_fn_owner;
grant execute on function pg_catalog.pg_notify(text,text) to clara_runtime;
grant execute on function pg_catalog.pg_advisory_lock(bigint) to clara_runtime;

-- ===========================================================================================
-- VERIFY — fail-closed, both directions: the residual is CLOSED to PUBLIC, and the allowlist
-- holds EXACTLY these six rows (no drift, no silent extra grantee).
-- ===========================================================================================
\echo '===== VERIFY (a): named residual now closed to PUBLIC — MUST be 0 rows ====='
select p.oid::regprocedure from pg_proc p
where p.pronamespace = 'pg_catalog'::regnamespace
  and has_function_privilege('public', p.oid, 'EXECUTE')
  and (p.proname = 'pg_notify' or p.proname like 'pg\_advisory\_%' or p.proname like 'pg\_try\_advisory\_%'
       or p.proname in ('pg_sleep','pg_sleep_for','pg_sleep_until')
       or p.proname in ('query_to_xml','query_to_xmlschema','query_to_xml_and_xmlschema',
                         'table_to_xml','table_to_xmlschema','table_to_xml_and_xmlschema',
                         'cursor_to_xml','cursor_to_xmlschema'));

do $$
declare n int;
begin
  select count(*) into n from pg_proc p
  where p.pronamespace = 'pg_catalog'::regnamespace
    and has_function_privilege('public', p.oid, 'EXECUTE')
    and (p.proname = 'pg_notify' or p.proname like 'pg\_advisory\_%' or p.proname like 'pg\_try\_advisory\_%'
         or p.proname in ('pg_sleep','pg_sleep_for','pg_sleep_until')
         or p.proname in ('query_to_xml','query_to_xmlschema','query_to_xml_and_xmlschema',
                           'table_to_xml','table_to_xmlschema','table_to_xml_and_xmlschema',
                           'cursor_to_xml','cursor_to_xmlschema'));
  if n <> 0 then
    raise exception 'VERIFY (a) FAILED: % residual function(s) still PUBLIC-executable — the REVOKE above silently no-oped (expected on a non-owner, non-superuser deploy role; see rehearsal report §3)', n;
  end if;
  raise notice 'VERIFY (a) OK: zero residual functions remain PUBLIC-executable';
end $$;

\echo '===== VERIFY (b): allowlist holds EXACTLY six grants, no drift ====='
do $$
declare
  expected jsonb := '[
    {"role":"clara_fn_owner","fn":"pg_notify(text,text)"},
    {"role":"clara_fn_owner","fn":"pg_advisory_xact_lock(integer,integer)"},
    {"role":"clara_fn_owner","fn":"pg_advisory_xact_lock(bigint)"},
    {"role":"clara_fn_owner","fn":"pg_advisory_xact_lock_shared(integer,integer)"},
    {"role":"clara_runtime","fn":"pg_notify(text,text)"},
    {"role":"clara_runtime","fn":"pg_advisory_lock(bigint)"}
  ]'::jsonb;
  e record;
  bad text := '';
  extra_count int;
begin
  for e in select value->>'role' as role, value->>'fn' as fn from jsonb_array_elements(expected)
  loop
    if not has_function_privilege(e.role, ('pg_catalog.' || e.fn)::regprocedure, 'EXECUTE') then
      bad := bad || format('MISSING: %s lacks EXECUTE on %s. ', e.role, e.fn);
    end if;
  end loop;
  -- reverse direction: no OTHER clara_% role holds EXECUTE on any residual function
  select count(*) into extra_count
  from pg_proc p
  cross join (select rolname from pg_roles where rolname like 'clara%') r
  where p.pronamespace = 'pg_catalog'::regnamespace
    and (p.proname = 'pg_notify' or p.proname like 'pg\_advisory\_%' or p.proname like 'pg\_try\_advisory\_%'
         or p.proname in ('pg_sleep','pg_sleep_for','pg_sleep_until')
         or p.proname in ('query_to_xml','query_to_xmlschema','query_to_xml_and_xmlschema',
                           'table_to_xml','table_to_xmlschema','table_to_xml_and_xmlschema',
                           'cursor_to_xml','cursor_to_xmlschema'))
    and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    and not exists (select 1 from jsonb_array_elements(expected) x
                     where x->>'role' = r.rolname and ('pg_catalog.' || (x->>'fn'))::regprocedure = p.oid);
  if extra_count <> 0 then
    bad := bad || format('%s unexpected grant(s) beyond the allowlist — re-derive before shipping. ', extra_count);
  end if;
  if bad <> '' then raise exception 'VERIFY (b) FAILED: %', bad; end if;
  raise notice 'VERIFY (b) OK: allowlist holds exactly the measured six grants, nothing more';
end $$;

\echo '===== AFTER: PUBLIC pg_catalog EXECUTE count (informational — expect BEFORE - 32) ====='
select count(*) from pg_proc p where p.pronamespace = 'pg_catalog'::regnamespace
  and has_function_privilege('public', p.oid, 'EXECUTE');

\echo '===== DONE — re-run the full estate suite + the runtime suite before trusting this session ====='
