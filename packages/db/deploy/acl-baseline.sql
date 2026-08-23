-- packages/db/deploy/acl-baseline.sql — HIGH-10 deployment ACL baseline (CEREMONY).
--
-- Run in the LIVE project as the schema/db OWNER (Supabase `postgres`). This is NOT a
-- migration and is NOT run against the clara rig by `pnpm test` (it changes `public`
-- nspacl + database datacl, which the clara-scoped migration chain must not own — the
-- delivery-vehicle argument is in the Lane C report §6). It confines the agent/wake
-- lanes from schema `public`; it CANNOT close the pg_catalog residual (pg_notify /
-- pg_advisory_* / pg_sleep / query_to_xml are superuser-owned — a non-superuser REVOKE
-- there only prints "no privileges could be revoked" and changes nothing; report
-- §4b/§5). That residual is an ACCEPTED, documented gap on managed Supabase, with low
-- practical severity today (the sanctioned agent surface is curated typed reads, not
-- raw SQL — report §3); the superuser-only close is the commented block at the end.
--
-- The public-USAGE and database-TEMP changes are SNAPSHOT-AND-PRESERVE (Codex HIGH-7 /
-- MEDIUM-1): before revoking PUBLIC, the APPLY block snapshots which non-confined roles
-- effectively hold each privilege and re-grants EXACTLY that set — so managed Supabase
-- service roles KEEP the TEMP they had, and a re-run does NOT widen a role created after
-- a prior baseline. Because this local rig cannot exercise hosted GoTrue/Auth, Storage,
-- Realtime, PostgREST, or Supavisor, the SCRATCH-PROJECT DRESS REHEARSAL (docs/ops/
-- DR-full-drill.md) is the hosted-services preflight: stage this in a maintenance window
-- with Auth/Storage/Realtime/PostgREST/pooler smokes and a prepared
-- `grant temp on database <db> to public; grant usage on schema public to public;` rollback.
--
-- Ceremony-tested on a local PG16 throwaway (full db suite 265/0/11 before and after,
-- non-breaking); posture mirrors deploy/storage-provision.sql. A DR restore does NOT
-- carry this baseline (a --no-privileges-free full dump captures clara ACLs but the
-- restore recreates `public` with its default PUBLIC USAGE), so RE-RUNNING THIS SCRIPT
-- IS A MANDATORY POST-RESTORE STEP — see docs/ops/DR.md and Lane C report §9.
\set ON_ERROR_STOP on

\echo '===== PREFLIGHT (review before proceeding) ====='
select current_database() as db, current_user as deploy_role,
       pg_get_userbyid(datdba) as db_owner
  from pg_database where datname = current_database();
-- MUST show deploy_is_dbowner_member = t, else the public revoke will SILENTLY no-op.
select nspname, pg_get_userbyid(nspowner) as public_owner,
       pg_has_role(current_user,'pg_database_owner','USAGE') as deploy_is_dbowner_member
  from pg_namespace where nspname='public';
\echo '--- roles that will be CONFINED (agent/wake lanes + their logins) — edit ONLY with owner sign-off ---'
-- F-A6 PR-1 adds the freeform read lane. It is confined for the SAME reason the other read
-- lanes are: it must reach exactly its 35 enumerated relations and nothing the public schema
-- happens to expose. Leaving it out would have made the newest, widest-reading role the ONE
-- lane the ACL baseline does not confine.
select unnest(array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                    'clara_agent_read_login','clara_wake_write_login',
                    'clara_freeform_ro','clara_freeform_login']) as confined_role;

\echo ''
\echo '===== EXISTENCE CHECK (fail-closed — a typo must not silently confine nothing) ====='
do $$
declare
  confined text[] := array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                           'clara_agent_read_login','clara_wake_write_login'];
  c text;
  missing text := '';
begin
  foreach c in array confined loop
    if not exists (select 1 from pg_roles where rolname = c) then
      missing := missing || c || ' ';
    end if;
  end loop;
  if missing <> '' then
    raise exception 'ACL BASELINE ABORTED: confined role(s) do not exist: %. A typo (or an un-migrated target) would confine nothing and silently pass — refusing. Fix the confined array or apply the migrations / roles-bootstrap first.', missing;
  end if;
  raise notice 'existence check OK: all % confined roles present', array_length(confined,1);
end $$;

\echo ''
\echo '===== APPLY ====='
do $$
declare
  confined text[] := array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                           'clara_agent_read_login','clara_wake_write_login'];
  rn text;
  usage_snapshot text[];
  temp_snapshot text[];
begin
  -- SNAPSHOT-AND-PRESERVE (Codex HIGH-7 + MEDIUM-1). Before revoking, capture which
  -- non-confined roles have EFFECTIVE public USAGE and EFFECTIVE database TEMP, then
  -- re-grant EXACTLY that snapshot. Two properties this buys:
  --   * FIRST run on a virgin DB: every role holds both via PUBLIC, so the snapshot is
  --     "all non-confined roles" — identical outcome to the pre-review blanket re-grant,
  --     and every managed Supabase service role KEEPS the TEMP it effectively had
  --     (HIGH-7: the blanket `revoke temp from public` no longer silently strips them).
  --   * RE-RUN after the baseline: a role created since (deliberately isolated) has no
  --     effective USAGE/TEMP, so it is NOT in the snapshot and NOT re-granted — the
  --     mandatory post-restore re-run no longer WIDENS it (MEDIUM-1).
  select coalesce(array_agg(rolname), '{}') into usage_snapshot from pg_roles
    where rolname not like 'pg\_%' and rolname <> 'public'
      and not (rolname = any(confined))
      and has_schema_privilege(rolname, 'public', 'USAGE');
  select coalesce(array_agg(rolname), '{}') into temp_snapshot from pg_roles
    where rolname not like 'pg\_%' and rolname <> 'public'
      and not (rolname = any(confined))
      and has_database_privilege(rolname, current_database(), 'TEMP');

  -- 1) Remove the additive PUBLIC grants. The schema-USAGE revoke requires the deploy
  --    role to OWN public (member of pg_database_owner) or be superuser; otherwise PG
  --    emits a WARNING and the grant SURVIVES (VERIFY below fails closed on that). KEEP
  --    database CONNECT for PUBLIC — a global CONNECT revoke would lock out every login
  --    lacking an explicit grant (the runtime logins + all Supabase platform logins).
  revoke usage on schema public from public;
  execute format('revoke temp on database %I from public', current_database());

  -- 2) Re-grant public USAGE + database TEMP to EXACTLY the pre-revoke snapshots (the
  --    confined five were already excluded), preserving status quo for every platform/
  --    app role while cutting off exactly the agent/wake lanes.
  foreach rn in array usage_snapshot loop
    execute format('grant usage on schema public to %I', rn);
  end loop;
  foreach rn in array temp_snapshot loop
    execute format('grant temp on database %I to %I', current_database(), rn);
  end loop;

  -- 3) Belt (defense in depth): explicit direct revoke of public from the confined roles.
  --    Redundant with step 1 (they held it only via PUBLIC) but audit-visible and future-proof.
  execute format('revoke all on schema public from %s',
                 (select string_agg(quote_ident(c), ', ') from unnest(confined) c));

  -- 4) Verify the FULL preservation snapshots (Codex re-verify LOW-1): EVERY snapshotted
  --    non-confined role must have its USAGE / TEMP back — not just a sample. Fail closed.
  foreach rn in array usage_snapshot loop
    if not has_schema_privilege(rn, 'public', 'USAGE') then
      raise exception 'ACL BASELINE: preserved role % lost public USAGE (re-grant failed)', rn;
    end if;
  end loop;
  foreach rn in array temp_snapshot loop
    if not has_database_privilege(rn, current_database(), 'TEMP') then
      raise exception 'ACL BASELINE: preserved role % lost database TEMP (re-grant failed)', rn;
    end if;
  end loop;
end $$;

-- 5) OPTIONAL / SUPERUSER-ONLY (managed Supabase CANNOT run this — pg_catalog is
--    superuser-owned; a non-superuser REVOKE here only prints "no privileges could be
--    revoked" and changes nothing — report §4b). Enable ONLY on self-hosted Postgres or
--    inside a superuser maintenance window. Closes the pg_notify/advisory residual.
-- revoke execute on function pg_catalog.pg_notify(text,text) from public;
-- revoke execute on function pg_catalog.pg_advisory_lock(bigint) from public;
-- revoke execute on function pg_catalog.pg_advisory_lock(int,int) from public;
-- revoke execute on function pg_catalog.pg_advisory_xact_lock(bigint) from public;
-- revoke execute on function pg_catalog.pg_advisory_xact_lock(int,int) from public;
-- revoke execute on function pg_catalog.pg_try_advisory_lock(bigint) from public;
-- revoke execute on function pg_catalog.pg_try_advisory_xact_lock(bigint) from public;
-- revoke execute on function pg_catalog.pg_advisory_unlock(bigint) from public;
-- revoke execute on function pg_catalog.pg_advisory_lock_shared(bigint) from public;
-- revoke execute on function pg_catalog.pg_sleep(double precision) from public;
-- revoke execute on function pg_catalog.query_to_xml(text,boolean,boolean,text) from public;
--   (re-grant EXECUTE back to the specific roles that need advisory locks — e.g.
--    graphile_worker's/WDK's connection role — before doing this; verify the worker still runs.)

\echo ''
\echo '===== VERIFY (fail-closed) ====='
do $$
declare
  confined text[] := array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                           'clara_agent_read_login','clara_wake_write_login'];
  c text;
  bad text := '';
begin
  -- (a) ALL FIVE confined roles must lack effective public USAGE AND effective TEMP
  --     (Codex LOW-1: loop the whole array, not just the three group roles; assert TEMP).
  foreach c in array confined loop
    if has_schema_privilege(c, 'public', 'USAGE') then
      bad := bad || format('%s still has public USAGE (revoke no-oped — deploy role likely does not own public). ', c);
    end if;
    if has_database_privilege(c, current_database(), 'TEMP') then
      bad := bad || format('%s still has database TEMP (should have been confined). ', c);
    end if;
  end loop;
  -- (b) a preserved non-confined role must keep BOTH (the snapshot re-grant worked).
  if not has_schema_privilege('clara_runtime', 'public', 'USAGE') then
    bad := bad || 'clara_runtime lost public USAGE (re-grant failed). ';
  end if;
  if not has_database_privilege('clara_runtime', current_database(), 'TEMP') then
    bad := bad || 'clara_runtime lost database TEMP (re-grant failed). ';
  end if;
  if bad <> '' then raise exception 'ACL BASELINE VERIFY FAILED: %', bad; end if;
  raise notice 'ACL baseline verify: OK';
end $$;

select r.rolname,
       has_schema_privilege(r.rolname,'public','USAGE') as usage_public,
       has_database_privilege(r.rolname,current_database(),'TEMP') as temp_db
  from pg_roles r where r.rolname like 'clara%' order by 1;
select nspacl::text as public_nspacl from pg_namespace where nspname='public';
select datacl::text as db_datacl from pg_database where datname=current_database();
