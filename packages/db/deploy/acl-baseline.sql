-- Deployment ACL baseline. Run as the intended schema/database owner.
-- This separate operating step changes public-schema and database privileges;
-- the clara-scoped migration suite does not apply or prove the hosted baseline.
-- See packages/db/README.md, "Backup and recovery".
--
-- Confined roles lose public-schema access and database TEMP. Existing privileges
-- for other roles are snapshotted and restored, rather than granted indiscriminately.
-- Verify Auth, Storage, Realtime, PostgREST and pooler behavior on a scratch hosted
-- project before applying this platform-wide change. Prepare a rollback appropriate
-- to the measured grants; restoring PUBLIC USAGE/TEMP reverses the broad revocations.
-- Reapply and verify the baseline after full restore, which does not restore it.
--
-- This does NOT close the managed pg_catalog privilege limitation: pg_notify,
-- pg_advisory_*, pg_sleep and query_to_xml can be superuser-owned, so a non-superuser
-- REVOKE can warn without changing access. Clara now includes governed freeform SQL
-- reads; the former "typed reads only" severity rationale no longer applies.
-- Reassess the reachable surface with current roles and hosted evidence. The
-- superuser-only examples below are commented out, not an implemented mitigation.
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
-- The roster includes freeform SQL, webhook and auth-wall executors/logins.
-- Their intended privileges do not include arbitrary objects in public.
select unnest(array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                    'clara_agent_read_login','clara_wake_write_login',
                    'clara_freeform_ro','clara_freeform_login',
                    'clara_stripe_webhook','clara_stripe_webhook_login',
                    'clara_auth_wall','clara_auth_wall_login']) as confined_role;

\echo ''
\echo '===== EXISTENCE CHECK (fail-closed — a typo must not silently confine nothing) ====='
do $$
declare
  confined text[] := array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive',
                           'clara_agent_read_login','clara_wake_write_login',
                           'clara_freeform_ro','clara_freeform_login',
                           'clara_stripe_webhook','clara_stripe_webhook_login',
                           'clara_auth_wall','clara_auth_wall_login'];
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
                           'clara_agent_read_login','clara_wake_write_login',
                           'clara_freeform_ro','clara_freeform_login',
                           'clara_stripe_webhook','clara_stripe_webhook_login',
                           'clara_auth_wall','clara_auth_wall_login'];
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
  --    confined roles were already excluded), preserving status quo for every platform/
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
--    revoked" and changes nothing). Enable only on self-hosted Postgres or
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
                           'clara_agent_read_login','clara_wake_write_login',
                           'clara_freeform_ro','clara_freeform_login',
                           'clara_stripe_webhook','clara_stripe_webhook_login',
                           'clara_auth_wall','clara_auth_wall_login'];
  c text;
  bad text := '';
begin
  -- (a) ALL ELEVEN confined roles must lack effective public USAGE AND effective TEMP
  --     (Codex LOW-1: loop the whole array, not just the three group roles; assert TEMP;
  --     F-A6 PR-1 widened the array from five to seven; FS-4 C-2 widens it to nine and C-3 to
  --     eleven — see the EXISTENCE/APPLY blocks).
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
