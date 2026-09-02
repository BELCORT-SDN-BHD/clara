-- packages/db/deploy/roles-bootstrap.sql — DR role-recreation ceremony (FRESH TARGET ONLY).
--
-- >>> NEVER RUN ON A LIVE PROJECT. <<< This recreates the clara-custom roles for a DR
-- restore into a FRESH target (a new Supabase project, or a throwaway for a drill),
-- BEFORE restoring the full-profile dump — it is step (a) of scripts/restore-full.mjs.
-- On a LIVE project the login shells (clara_runtime_login, clara_agent_read_login,
-- clara_wake_write_login; clara_wake_bank_login once F-A3/PR-2's ceremony flips it)
-- have been flipped to LOGIN out of band; re-running here would
-- set them back to NOLOGIN and cut EVERY runtime / read-pool / wake-write connection.
-- The preflight below FAILS CLOSED if any login shell is already LOGIN, unless the
-- operator supplies `-v allow_relogin_reset=1` for a deliberate DR reset into a fresh
-- project. pg_dump never captures roles (they are cluster-global), and a raw
-- `pg_dumpall --globals` COLLIDES with a fresh project's managed roles — so this
-- reviewed script is the authoritative recreation path.
--
-- Mirrors: migration 0002 (the 6 group roles + the clara_agent_ro read-only belt +
-- the deploy-role SET grants), 0006 (the 2 login shells), 0009 (the write-login
-- shell), 0121 (clara_wake_bank + its clara_wake_bank_login shell — F-A3/PR-1b's
-- bank wake lane), 0126 (clara_wake_filing — F-A7 β's filing wake kind, group only),
-- 0160 (clara_stripe_webhook + its clara_stripe_webhook_login shell — FS-4 C-2's
-- Stripe webhook sweep lane, PR #484, added 2026-09-02 per the estate's "role mints
-- a same-commit roles-bootstrap twin" law — 0160 was the first role-minting
-- migration since this file was last synced), 0161_checkout_gate_c3_folded_door
-- (clara_auth_wall + its clara_auth_wall_login shell — FS-4 C-3's pre-session
-- confirmation-attempt wall), and deploy/storage-provision.sql
-- (clara_storage_docs). Derived and cross-checked against a live-shaped rig (apply
-- 0001..0010 to a scratch DB → query pg_roles / pg_auth_members) — the census
-- pre-0160 reproduced exactly (12 clara_% roles + clara_storage_docs); 0160 adds two
-- more and C-3 adds two more (18 schema-lane roles + clara_storage_docs).
-- CONVERGENCE SCOPE: on a FRESH target this produces the exact
-- census. It does NOT remove unexpected EXTRA memberships/settings on a pre-existing
-- role and it does NOT normalize NOLOGIN over a pre-existing login shell — so it is
-- NOT a general-purpose "converge a drifted live cluster" tool.
--
-- NO PASSWORDS, and every clara login role is created NOLOGIN here — exactly as the
-- migrations create them; the operator/ceremony enables LOGIN + a password OUT OF BAND.
-- The DR runbook re-runs deploy/write-login-ceremony.sql (clara_wake_write_login) and
-- deploy/read-logins-ceremony.sql (clara_runtime_login + clara_agent_read_login) AFTER
-- this + the full restore — so no credential is ever in git (mirrors the migration posture).
--
-- Posture: ceremony-tested, mirrors deploy/storage-provision.sql and
-- deploy/write-login-ceremony.sql. This is cluster-ROLE DDL, not clara-schema DDL —
-- never `psql -f` it into clara_test / the rig test DBs.
\set ON_ERROR_STOP on

-- Override defaults OFF. Supply `-v allow_relogin_reset=1` ONLY for a deliberate DR
-- reset into a fresh project (it lets the script re-NOLOGIN a pre-existing login shell).
\if :{?allow_relogin_reset}
\else
  \set allow_relogin_reset 0
\endif
-- psql variable interpolation is unreliable inside dollar-quoted bodies; stash the flag
-- in a session GUC the do-blocks read via current_setting instead.
select set_config('clara.allow_relogin_reset', :'allow_relogin_reset', false) as allow_relogin_reset;

-- Validate the override is EXACTLY 0 or 1 BEFORE any DDL (Codex re-verify NEW MEDIUM-1):
-- a stray value (e.g. -v allow_relogin_reset=2) must ABORT — never silently bypass the
-- live-login preflight or the NOLOGIN normalization.
do $$
declare v text := current_setting('clara.allow_relogin_reset', true);
begin
  if v is null or v not in ('0', '1') then
    raise exception 'roles-bootstrap ABORTED: allow_relogin_reset must be exactly 0 or 1 (got %). Refusing before any DDL.', coalesce(v, '<unset>');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. GROUP + LOGIN ROLES — created idempotently with the EXACT migration
--    attributes: NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT,
--    connlimit -1. Attribute normalization is SPLIT the same way the migrations
--    split it (0002 §1 / HIGH 8): the settable normalizers (NOCREATEROLE/INHERIT) run
--    for every role; the PRIVILEGED normalizers (NOSUPERUSER/NOBYPASSRLS/NOCREATEDB)
--    run ONLY under a superuser deploy (PG rejects them from a plain CREATEROLE role
--    even when setting them false; a freshly CREATEd role already defaults to them).
--    HIGH-1: the LOGIN bit is normalized to NOLOGIN ONLY for a role CREATED in this
--    invocation (or on an explicit -v allow_relogin_reset=1) — a pre-existing login
--    shell keeps its LOGIN bit, and the preflight guarantees it is NOLOGIN otherwise.
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
  v_super boolean := current_setting('is_superuser') = 'on';
  v_reset int := coalesce(nullif(current_setting('clara.allow_relogin_reset', true), '')::int, 0);
  created boolean;
  live text := '';
  -- Group roles the migrations create NOLOGIN and never flip to LOGIN — safe to
  -- re-assert NOLOGIN unconditionally.
  -- F-A6 PR-1 adds clara_freeform_ro here, and it is NOT optional bookkeeping: pg_dump never
  -- emits roles, so a role missing from this file is a role that does not exist at restore time
  -- — and the dump's `GRANT SELECT ON … TO clara_freeform_ro` then fails, taking the restore
  -- with it. The DR round-trip is where that would be discovered otherwise.
  grp text[] := array[
    'clara_fn_owner', 'clara_authenticated', 'clara_agent_ro',
    'clara_wake_interactive', 'clara_wake_proactive', 'clara_runtime',
    'clara_freeform_ro',
    'clara_wake_bank',  -- 0121 (F-A3/PR-1b): the bank wake lane's own group role
    'clara_wake_filing', -- 0126 (F-A7 β): the filing wake kind's role — group only, no login
                        -- shell and no postgres membership (reached via wake_credentials rows)
    'clara_stripe_webhook', -- 0160 (FS-4 C-2, PR #484): the Stripe webhook sweep's own
                        -- NOLOGIN group role, holding exactly the record/apply EXECUTE
                        -- surface and no table grants
    'clara_auth_wall'   -- FS-4 C-3: the confirmation-attempt wall's own NOLOGIN group
  ];
  -- Login SHELLS: created NOLOGIN here; a LIVE project flips them to LOGIN out of band.
  logins text[] := array['clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login',
                         'clara_freeform_login',
    'clara_wake_bank_login',  -- 0121: nologin shell until PR-2's DSN/pool ceremony
    'clara_stripe_webhook_login', -- 0160: member shell for clara_stripe_webhook
    'clara_auth_wall_login']; -- C-3: member shell for clara_auth_wall
begin
  -- Fail closed: never run on a live project (a login shell already LOGIN) w/o override.
  foreach r in array logins loop
    if exists (select 1 from pg_roles where rolname = r and rolcanlogin) then live := live || r || ' '; end if;
  end loop;
  if live <> '' and v_reset = 0 then
    raise exception 'roles-bootstrap ABORTED: login shell(s) already LOGIN (%). This is FRESH-TARGET-ONLY and must NEVER run on a live project — re-running would set them NOLOGIN and cut every runtime / read-pool / wake-write connection. For a deliberate DR reset into a FRESH project, re-run with -v allow_relogin_reset=1.', live;
  end if;

  foreach r in array grp loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);   -- defaults: NOSUPERUSER NOBYPASSRLS NOCREATEDB
    end if;
    execute format('alter role %I nologin nocreaterole inherit', r);
    if v_super then
      execute format('alter role %I nosuperuser nobypassrls nocreatedb', r);
    end if;
  end loop;

  foreach r in array logins loop
    created := not exists (select 1 from pg_roles where rolname = r);
    if created then
      execute format('create role %I nologin', r);
    end if;
    execute format('alter role %I nocreaterole inherit', r);   -- never touches the LOGIN bit
    if created or v_reset = 1 then
      execute format('alter role %I nologin', r);   -- newly created, or an opted-in DR reset
    end if;
    if v_super then
      execute format('alter role %I nosuperuser nobypassrls nocreatedb', r);
    end if;
  end loop;
end $$;

-- The read-only agent lane carries the session-level read-only belt (a rolconfig
-- setting; applies at LOGIN, NOT under SET ROLE — so the GRANTs, not this, are the
-- wall — 0002 §1). Best-effort: a deploy role lacking ADMIN on a pre-existing role
-- may not set it, and the belt is not load-bearing, so a failure must not abort.
do $$
begin
  alter role clara_agent_ro set default_transaction_read_only = on;
exception when insufficient_privilege then
  raise notice 'skipping default_transaction_read_only belt (deploy role lacks ADMIN on clara_agent_ro; not load-bearing)';
end $$;

-- clara_storage_docs — the Supabase Storage JWT role (deploy/storage-provision.sql).
-- NOINHERIT (unlike every group role) + NOREPLICATION. Live-only in normal operation;
-- recreated here so a fresh-project restore reproduces the FULL role census.
-- LOW-2: REPLICATION can only be changed by a role that HAS replication (even to
-- false), so a fresh-created role RELIES on the NOREPLICATION default and the explicit
-- normalizer is gated on the executor's own replication capability; the post-check
-- FAILs only if the role actually ended up REPLICATION-capable.
do $$
declare
  v_super boolean := current_setting('is_superuser') = 'on';
  v_can_repl boolean := (select rolsuper or rolreplication from pg_roles where rolname = current_user);
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_storage_docs') then
    create role clara_storage_docs nologin noinherit;   -- defaults: NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  end if;
  alter role clara_storage_docs nologin nocreaterole noinherit;
  if v_can_repl then
    alter role clara_storage_docs noreplication;
  end if;
  if v_super then
    alter role clara_storage_docs nosuperuser nobypassrls nocreatedb;
  end if;
  if (select rolreplication from pg_roles where rolname = 'clara_storage_docs') then
    raise exception 'clara_storage_docs ended up REPLICATION-capable — must be NOREPLICATION; run as a role able to clear it (superuser or a REPLICATION role)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. MEMBERSHIPS — reproduced with their EXACT inherit/set options.
-- ---------------------------------------------------------------------------

-- 2a. Each login shell is a member of EXACTLY its one group role, INHERIT FALSE /
--     SET TRUE: the pool authenticates AS the login, then SET ROLEs into its group
--     (without SET this fails 42501 on every checkout; INHERIT FALSE keeps the bare
--     login identity privilege-less until it explicitly SET ROLEs). Mirrors 0006/0009.
grant clara_runtime         to clara_runtime_login     with inherit false, set true;
grant clara_agent_ro        to clara_agent_read_login  with inherit false, set true;
grant clara_wake_interactive to clara_wake_write_login with inherit false, set true;
grant clara_freeform_ro      to clara_freeform_login   with inherit false, set true;
grant clara_stripe_webhook   to clara_stripe_webhook_login;
grant clara_auth_wall        to clara_auth_wall_login;
-- 0121's own membership is INHERIT-style, deliberately unlike the trio above — the plain
-- grant mirrors the migration's exact statement (clara_wake_bank_login is created `inherit`).
grant clara_wake_bank       to clara_wake_bank_login;
-- 0160's own membership is the SAME INHERIT-style plain grant, mirroring 0121's idiom exactly
-- (clara_stripe_webhook_login is created `inherit` too).
grant clara_stripe_webhook  to clara_stripe_webhook_login;

-- 2b. Deploy-role membership. The restoring role must be a member of clara_fn_owner
--     WITH INHERIT + SET so it can restore object ownership — the full dump emits
--     `ALTER … OWNER TO clara_fn_owner`, which requires membership WITH SET — and act
--     as the owner; SET on the other clara roles is the rig/impersonation surface
--     (SET ROLE into each lane). On Supabase the deploy role is `postgres`; grant to
--     it explicitly (guarded on it existing) so the membership census matches the
--     migrations EXACTLY. If the restoring role is NOT `postgres`, also grant it
--     clara_fn_owner (WITH INHERIT/SET) so ownership restore still works — a
--     documented, expected extra membership vs a postgres-restored source.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    grant clara_fn_owner         to postgres with inherit true,  set true;
    grant clara_authenticated    to postgres with inherit false, set true;
    grant clara_agent_ro         to postgres with inherit false, set true;
    grant clara_wake_interactive to postgres with inherit false, set true;
    grant clara_wake_proactive   to postgres with inherit false, set true;
    grant clara_runtime          to postgres with inherit false, set true;
    grant clara_runtime_login    to postgres with inherit false, set true;
    grant clara_agent_read_login to postgres with inherit false, set true;
    grant clara_wake_write_login to postgres with inherit false, set true;
    grant clara_freeform_ro      to postgres with inherit false, set true;
    grant clara_freeform_login   to postgres with inherit false, set true;
    grant clara_stripe_webhook_login to postgres;
    grant clara_auth_wall_login      to postgres;
    -- 0121's own postgres membership is a plain grant (rig-testability parity with the
    -- wake_write_login precedent) — mirrored exactly, not restyled.
    grant clara_wake_bank_login  to postgres;
    -- 0160's own postgres membership is the SAME plain grant, mirroring 0121's idiom exactly.
    grant clara_stripe_webhook_login to postgres;
  else
    raise notice 'postgres role absent — skipping the deploy-role SET grants (bare throwaway); the restoring role gets clara_fn_owner below';
  end if;
  if current_user <> 'postgres' then
    execute format('grant clara_fn_owner to %I with inherit true, set true', current_user);
    raise notice 'granted clara_fn_owner to the restoring role % (not postgres) so it can restore object ownership — an expected extra membership vs a postgres-restored source', current_user;
  end if;
end $$;

-- 2c. Supabase platform memberships — guarded on the managed grantee existing (absent
--     on a bare local/CI throwaway; present on a real Supabase project). The human
--     plane binds `authenticated → clara_authenticated` INHERIT TRUE (PostgREST
--     authenticates end users into `authenticated`, which then inherits clara USAGE +
--     SELECT + human-writer EXECUTE — 0002 §1). Storage's API runs as `authenticator`
--     and SET ROLEs to the JWT's role claim, so `clara_storage_docs → authenticator`
--     is required (storage-provision.sql); without it the SET ROLE fails outright.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant clara_authenticated to authenticated with inherit true;
  else
    raise notice 'authenticated role absent — skipping the human-plane membership (not a Supabase target)';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    grant clara_storage_docs to authenticator;
  else
    raise notice 'authenticator role absent — skipping the Storage SET-ROLE membership (not a Supabase target)';
  end if;
end $$;

-- 2d. Fail closed on a clara ROLE holding ADMIN OPTION (Codex re-verify NEW HIGH-1). The
--     escalation threat is a clara_% role that is a MEMBER of another role WITH ADMIN —
--     it could re-grant that lane onward. This script grants every lane membership
--     admin=false, and clara roles are NOCREATEROLE (so they never earn creator-admin),
--     so ANY clara_% role holding admin_option is unexpected — ABORT. (The deploy role's
--     own admin over the roles it created — postgres→clara_* — is legitimate and NOT
--     flagged: the filter is on the MEMBER being a clara_% role, not postgres.)
do $$
declare bad text;
begin
  select string_agg(format('%s->%s (admin)', m.rolname, p.rolname), ', ')
    into bad
    from pg_auth_members am
    join pg_roles m on m.oid = am.member
    join pg_roles p on p.oid = am.roleid
    where am.admin_option and m.rolname like 'clara\_%';
  if bad is not null and bad <> '' then
    raise exception 'roles-bootstrap ABORTED: a clara_%% role holds ADMIN OPTION (escalation path): %. This script grants none; investigate before restoring.', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. VERIFY (evidence — the DR drill / dr-verify diffs this against the source
--    census). Expect: 19 clara_% roles total (18 schema lanes + clara_storage_docs), all
--    rolcanlogin=f rolsuper=f rolbypassrls=f connlimit=-1; clara_agent_ro carries
--    {default_transaction_read_only=on}; clara_storage_docs is rolinherit=f, the rest rolinherit=t.
-- ---------------------------------------------------------------------------
select rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit, rolconnlimit, rolconfig
  from pg_roles where rolname like 'clara\_%' order by 1;

select member.rolname as member, parent.rolname as parent, am.inherit_option, am.set_option, am.admin_option
  from pg_auth_members am
  join pg_roles member on member.oid = am.member
  join pg_roles parent on parent.oid = am.roleid
  where member.rolname like 'clara\_%' or parent.rolname like 'clara\_%'
  order by 1, 2;
