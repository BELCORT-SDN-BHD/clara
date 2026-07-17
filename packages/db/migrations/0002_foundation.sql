-- 0002_foundation — Slice-2 governed DB core, part 1 of 3: roles, ownership,
-- identity + session context, RBAC, wake credentials, admission, and the audit
-- spine. Parts 2/3 (0003 books tables + triggers, 0004 audited writers + grant
-- matrix) build on everything defined here.
--
-- WHY THIS LAYOUT (authority: docs/architecture/ARCHITECTURE.md §0/§3,
-- docs/prd/PRD.md §2/§6, and the Slice-2 design contract v1+v2):
--
--  * Every object in this migration is created while `SET ROLE clara_fn_owner`
--    so ownership is automatic (design v2 §B / F20). `clara_fn_owner` is NOT a
--    superuser and NOT BYPASSRLS — FORCE ROW LEVEL SECURITY applies to it too;
--    the isolation boundary is (grants ∩ RLS), asserted independently by the rig.
--
--  * Lane pinning is by GRANT, not by in-definer role detection. Design v2 §A/F3
--    empirically confirmed that inside a SECURITY DEFINER function `current_user`
--    is the function owner and the SET ROLE'd caller is invisible — so a definer
--    function CANNOT tell which lane called it. Therefore: the human write lane
--    and the wake write lane are SEPARATE entry-point functions (0004), each
--    trusting exactly ONE identity source, and the READ policies below are
--    ROLE-PINNED (clara_authenticated reads via jwt_firm(); clara_agent_ro reads
--    via wake_firm()). A forged request.jwt.claims in an agent session is inert
--    because the agent role's read policy never consults jwt claims, and the
--    agent role holds no EXECUTE on any human-lane writer.
--
--  * CONTRACT CORRECTION (empirically verified on PG16, this deploy): an RLS
--    policy that references a function requires the QUERYING role to hold EXECUTE
--    on that function (a policy call is checked as the querying role, not the
--    definer). So the policy-referenced resolvers (jwt_sub, jwt_firm, wake_firm,
--    shares_my_firm_human/wake, actor_role_rank) MUST be granted EXECUTE to the app roles whose
--    policies reference them — design v2 §B's "jwt_firm ungranted" is not
--    achievable while a policy references it. These resolvers each return only
--    the CALLER's own context (no firm argument that could probe another firm),
--    so granting EXECUTE does not widen the isolation boundary. The grants live
--    in 0004's matrix block. The genuinely internal helpers (assert_*,
--    is_high_stakes, eligible_checker_count, wake_context, _*_core) are never
--    referenced by a policy and stay ungranted.
--
-- Money is bigint cents everywhere. Error codes (RAISE ... USING ERRCODE):
--   CLR01 client-attribution · CLR02 provenance · CLR03 wake-authority ·
--   CLR04 authz/role-floor/actor · CLR05 maker-checker · CLR06 revision-token ·
--   CLR07 balance · CLR08 immutability/append-only · CLR09 last-owner ·
--   CLR10 bad-request · CLR11 not-found-in-your-firm (no cross-firm existence oracle).

-- =====================================================================
-- 1. ROLES (all NOLOGIN group roles; created idempotently with SAFE DEFAULTS).
--    Attribute normalization is SPLIT (design v2 §B / F19, HIGH 8): the settable
--    normalizers (NOLOGIN/NOCREATEDB/NOCREATEROLE/INHERIT) run on every apply and
--    are legal for a non-superuser CREATEROLE deploy role; the PRIVILEGED
--    normalizers (NOSUPERUSER/NOBYPASSRLS) run ONLY under a superuser deploy,
--    because PG16 rejects an ALTER ROLE that touches SUPERUSER/BYPASSRLS from a
--    plain CREATEROLE role even when setting them false — running them
--    unconditionally makes 0002 fail before object creation on non-superuser
--    Supabase (HIGH 8). A freshly CREATEd role already defaults to
--    NOSUPERUSER NOBYPASSRLS, so the guarantee holds on a first apply regardless.
--
--    CONVERGENCE HONESTY (HIGH 6/7 downgrade): this block re-runs only when 0002
--    runs — a FIRST apply or `db:reset` (which drops+re-applies). A PLAIN
--    re-migrate SKIPS the already-applied file, so it does NOT re-normalize a
--    role poisoned AFTER the initial apply; on a non-superuser deploy the
--    SUPERUSER/BYPASSRLS bits cannot be re-normalized here at all. Remediating a
--    poisoned role in place is an OPERATOR + SUPERUSER action (or a reset), not a
--    guarantee of every `pnpm db:migrate` — an always-run runner preflight is
--    deferred hardening.
-- =====================================================================
do $$
declare r text; v_super boolean := current_setting('is_superuser') = 'on';
begin
  foreach r in array array[
    'clara_fn_owner', 'clara_authenticated', 'clara_agent_ro',
    'clara_wake_interactive', 'clara_wake_proactive', 'clara_runtime'
  ] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);   -- safe defaults: NOSUPERUSER NOBYPASSRLS NOCREATEDB
    end if;
    -- Always-settable normalizers (legal for a non-superuser CREATEROLE deploy that
    -- holds ADMIN on the role): LOGIN, INHERIT, and — since this deploy has
    -- CREATEROLE — CREATEROLE. NOT CREATEDB here: PG16 requires the ALTERing role to
    -- itself HAVE CREATEDB to change another role's CREATEDB attribute (a freshly
    -- created role already defaults to NOCREATEDB, so first-apply safety holds).
    execute format('alter role %I nologin nocreaterole inherit', r);
    -- Privileged normalizers — need SUPERUSER (SUPERUSER/BYPASSRLS) or CREATEDB
    -- (CREATEDB); a superuser holds both, so it converges an externally-poisoned
    -- role. On a non-superuser deploy these are skipped (the role cannot be poisoned
    -- to SUPERUSER/BYPASSRLS/CREATEDB by a non-superuser there anyway).
    if v_super then
      execute format('alter role %I nosuperuser nobypassrls nocreatedb', r);
    end if;
  end loop;
end $$;

-- The read-only agent lane carries a session-level belt (applies only at LOGIN,
-- NOT under SET ROLE — so it is NOT the guarantee; the GRANTS are the wall, see
-- design v2 §B / F2). Kept for the eventual dedicated freeform-read LOGIN role.
-- Best-effort: a non-superuser deploy role may lack ADMIN on a pre-existing
-- clara_agent_ro; the belt is not load-bearing, so a failure here must not abort.
do $$
begin
  alter role clara_agent_ro set default_transaction_read_only = on;
exception when insufficient_privilege then
  raise notice 'skipping default_transaction_read_only belt (deploy role lacks ADMIN on clara_agent_ro; belt is not load-bearing — design v2 §B/F2)';
end $$;

-- The deploy role (current_user — superuser in CI/local, non-superuser Supabase
-- `postgres` with CREATEROLE elsewhere) needs membership WITH SET so it can
-- SET ROLE into each lane (this is what lets the rig impersonate each role on a
-- non-superuser deploy) and WITH INHERIT in clara_fn_owner so it can ALTER the
-- schema owner and act as the owner. Idempotent (re-GRANT with same options is a
-- no-op). fn_owner: inherit+set; the lanes: set only (no silent inheritance).
do $$
begin
  execute format('grant clara_fn_owner to %I with inherit true, set true', current_user);
  execute format('grant clara_authenticated to %I with inherit false, set true', current_user);
  execute format('grant clara_agent_ro to %I with inherit false, set true', current_user);
  execute format('grant clara_wake_interactive to %I with inherit false, set true', current_user);
  execute format('grant clara_wake_proactive to %I with inherit false, set true', current_user);
  execute format('grant clara_runtime to %I with inherit false, set true', current_user);
end $$;

-- Supabase human plane (design v2 §B / HIGH 9): PostgREST authenticates end users
-- into the shared `authenticated` role. Bind it to clara_authenticated WITH INHERIT
-- so a `set role authenticated` session inherits clara schema USAGE, table SELECT,
-- and human-writer EXECUTE. Guarded on the role existing (a non-Supabase CI/local
-- deploy has no `authenticated` role — there the rig SET ROLEs clara_authenticated
-- directly). The grantor (deploy role) holds ADMIN on clara_authenticated (it
-- created it), which is what GRANTing it onward requires.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant clara_authenticated to authenticated with inherit true';
  end if;
end $$;

-- Schema clara was created by the migration runner as the deploy role; hand it to
-- clara_fn_owner so every object created below (under SET ROLE) is owned by it.
alter schema clara owner to clara_fn_owner;

-- =====================================================================
-- 2. SCHEMA-USAGE CONFINEMENT (design v2 §B / F10). The agent/wake roles get
--    USAGE on clara ONLY; these direct REVOKEs remove any DIRECT public/extension
--    USAGE grant so they cannot even NAME a surface like net.http_post.
--
--    HONESTY (HIGH 10 / MEDIUM 16 downgrade): PostgreSQL privileges are ADDITIVE
--    across direct grants, role memberships, and PUBLIC. Every role is implicitly
--    in PUBLIC, so a DIRECT revoke here does NOT remove USAGE still held via a
--    PUBLIC grant on `public` (nor EXECUTE on side-effecting pg_catalog fns like
--    pg_notify). This block is therefore DEFENSE IN DEPTH, not airtight
--    confinement — full confinement needs a DB-wide ACL baseline that revokes
--    from PUBLIC and re-grants selectively (a runtime/deployment slice, v2 §H
--    item 3). Best-effort: a non-superuser deploy role may not own `public`/an
--    extension schema, so a revoke may be denied — that must not abort the
--    migration (the confinement it provides is not load-bearing).
-- =====================================================================
do $$
declare s text;
begin
  begin
    revoke usage on schema public from
      clara_agent_ro, clara_wake_interactive, clara_wake_proactive;
  exception when insufficient_privilege then
    raise notice 'skipping public-schema revoke (deploy role lacks ownership; PUBLIC-additivity confinement is a deferred ACL-baseline item — v2 §H)';
  end;
  foreach s in array array['net', 'extensions', 'graphile_worker', 'workflow', 'vault', 'cron'] loop
    if exists (select 1 from pg_namespace where nspname = s) then
      begin
        execute format(
          'revoke all on schema %I from clara_agent_ro, clara_wake_interactive, clara_wake_proactive', s);
      exception when insufficient_privilege then
        raise notice 'skipping revoke on schema % (deploy role lacks ownership)', s;
      end;
    end if;
  end loop;
end $$;

-- Everything from here is owned by clara_fn_owner.
set role clara_fn_owner;

-- Lock down the schema itself, then hand USAGE to exactly the app roles.
revoke all on schema clara from public;
grant usage on schema clara to
  clara_authenticated, clara_agent_ro,
  clara_wake_interactive, clara_wake_proactive, clara_runtime;

-- =====================================================================
-- 3. IDENTITY + RBAC TABLES
-- =====================================================================

-- Global identity. On Supabase, human ids equal auth.users.id (no cross-schema FK
-- — portability). ONE global agent identity row (id fixed) is inserted below and
-- is the maker/checker principal for every wake-lane write (design v2 §C: agent
-- work is NEVER stamped as a human).
create table clara.users (
  id           uuid primary key,
  display_name text        not null,
  email        text        unique,
  is_agent     boolean     not null default false,
  created_at   timestamptz not null default now()
);

create table clara.firms (
  id                       uuid primary key default gen_random_uuid(),
  name                     text        not null,
  -- The amount-threshold for the maker/checker high-stakes lane (design v2 §E/F6:
  -- this is the DB-DERIVED, non-bypassable criterion). RM10,000 = 1,000,000 cents.
  high_stakes_amount_cents bigint      not null default 1000000 check (high_stakes_amount_cents > 0),
  created_at               timestamptz not null default now()
);

-- RBAC. One ACTIVE membership per user across ALL firms (partial unique below) —
-- a removed user may re-join (design v2 §F/F21: DROP the global unique(user_id),
-- keep only the partial active one). role_rank orders viewer<bookkeeper<admin<owner.
create table clara.firm_memberships (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid        not null references clara.firms(id),
  user_id    uuid        not null references clara.users(id),
  role       text        not null check (role in ('viewer','bookkeeper','admin','owner')),
  status     text        not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
-- One active membership per user, total (one-firm-per-user for the active row).
create unique index uq_membership_active_user
  on clara.firm_memberships (user_id) where (status = 'active');

-- =====================================================================
-- 4. WAKE CREDENTIALS + ALLOWLIST (design §2, v2 §C)
--    The runtime mints a credential; the wake session carries the plaintext in
--    GUC clara.wake_secret (txn-local). Only the sha256 is stored. Proactive
--    credentials are single-use (consumed_at); interactive are multi-use to expiry.
-- =====================================================================
create table clara.wake_credentials (
  id           uuid primary key default gen_random_uuid(),
  wake_kind    text        not null check (wake_kind in ('interactive','proactive')),
  firm_id      uuid        not null references clara.firms(id),
  on_behalf_of uuid        references clara.users(id),
  secret_hash  bytea       not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
-- Lookup index + collision backstop on the stored hash (secrets are random per
-- mint, so this is effectively unique; the index also speeds wake_context lookup).
create unique index uq_wake_secret_hash on clara.wake_credentials (secret_hash);

-- Belt on top of the per-role EXECUTE grants: which WAKE entry fn each wake_kind
-- may invoke (design v2 §F/F22 — the allowlist lists the wake_* entry fn names).
create table clara.wake_fn_allowlist (
  wake_kind     text not null,
  function_name text not null,
  primary key (wake_kind, function_name)
);

-- Fail-closed firm creation (design v2 §F/F23): create_firm consumes an
-- operator-seeded admission token. Self-serve signup/billing is post-Slice-2.
create table clara.firm_admissions (
  token       uuid primary key,
  note        text,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 5. AUDIT + IDEMPOTENCY + FREEFORM-READ SPINE
-- =====================================================================

-- Append-only receipts of COMMITTED SUCCESSES only (design v2 §G / F17): a writer
-- inserts its receipt just before returning; a RAISE aborts the whole txn incl.
-- the receipt, so there is never a false "raise" row. UPDATE/DELETE/TRUNCATE are
-- blocked by triggers (0003) even against a definer-context bug.
--
-- HONESTY NOTE (design v2 §G): a platform SUPERUSER can drop a trigger or the
-- table and thus sits OUTSIDE this append-only guarantee. This is defense in
-- depth against app/agent/definer-bug tampering — NOT against a compromised DB
-- superuser (that boundary belongs to the platform). args is REDACTED (ids/keys
-- only, never document/payload bodies).
create table clara.audit_log (
  id            bigint generated always as identity primary key,
  firm_id       uuid        not null,
  actor         uuid,
  on_behalf_of  uuid,
  via_wake_kind text,
  fn            text        not null,
  entry_id      uuid,
  args          jsonb,
  outcome       text        not null default 'ok' check (outcome in ('ok')),
  error_code    text,
  at            timestamptz not null default now()
);

-- Firm-scoped idempotency (design v2 §F/F11). PK (firm_id, fn, op_key): the SAME
-- op_key in two firms is two independent operations (a global op_key PK would let
-- firm B collide with / probe / deny firm A's keys). request_hash pins the arg
-- tuple so op_key reuse with DIFFERENT args is rejected (CLR10) rather than
-- silently returning a stale receipt. Writers reserve-before-effect.
create table clara.op_receipts (
  firm_id      uuid        not null,
  fn           text        not null,
  op_key       text        not null,
  request_hash bytea       not null,
  result       jsonb,
  created_at   timestamptz not null default now(),
  primary key (firm_id, fn, op_key)
);

-- The read-only agent role cannot write, so the RUNTIME writes this row before
-- running a freeform read (ARCHITECTURE §3.2). INSERT is granted to clara_runtime
-- only (0004-adjacent grant below) + a runtime RLS policy.
create table clara.freeform_read_log (
  id            bigint generated always as identity primary key,
  firm_id       uuid,
  credential_id uuid,
  query_text    text,
  purpose       text,
  at            timestamptz not null default now()
);

-- =====================================================================
-- 6. SESSION-CONTEXT RESOLVERS (identity, anti-spoof). These are referenced by
--    the RLS policies below (and by the 0004 writers), so they must exist here.
--    Table-reading resolvers are SECURITY DEFINER owned by clara_fn_owner with a
--    pinned search_path (rig T18); they read guarded tables under the owner's
--    using(true) policies. Each returns only the CALLER's own context.
-- =====================================================================

-- Pure RBAC ordering (viewer<bookkeeper<admin<owner). IMMUTABLE — no I/O.
create function clara.role_rank(p_role text) returns int
  language sql immutable as $$
  select case p_role
    when 'viewer' then 0 when 'bookkeeper' then 1
    when 'admin' then 2 when 'owner' then 3 else null end;
$$;

-- The fixed global agent user id (design §2). Internal only.
create function clara.agent_user_id() returns uuid
  language sql immutable as $$ select '00000000-0000-4000-8000-000000c1a7a0'::uuid $$;

-- The human sub from PostgREST's request.jwt.claims GUC. Reads no table (a plain
-- SECURITY INVOKER helper); NULL when absent/garbage. Never trusts a malformed value.
create function clara.jwt_sub() returns uuid
  language plpgsql stable as $$
declare v_raw text; v_sub text;
begin
  v_raw := current_setting('request.jwt.claims', true);
  if v_raw is null or v_raw = '' then return null; end if;
  begin
    v_sub := (v_raw::jsonb) ->> 'sub';
  exception when others then return null; end;
  if v_sub is null then return null; end if;
  begin
    return v_sub::uuid;
  exception when others then return null; end;
end $$;

-- The live, valid wake credential for this session's clara.wake_secret GUC, or no
-- row. TTL uses statement_timestamp() (design v2 §C/F9: a long txn started before
-- expiry must not keep using the credential). Excludes revoked and consumed.
-- LIVE on_behalf_of REVALIDATION (HIGH 5): an on_behalf_of credential is honoured
-- ONLY while that member still holds a LIVE active bookkeeper+ membership in the
-- credential's firm — so demoting/removing the member makes every one of their
-- outstanding credentials inert on the NEXT use, even one minted concurrently
-- with (and thus missed by) the demotion's revocation scan.
create function clara.wake_context()
  returns table(credential_id uuid, wake_kind text, firm_id uuid, on_behalf_of uuid)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_raw text; v_hash bytea;
begin
  v_raw := current_setting('clara.wake_secret', true);
  if v_raw is null or v_raw = '' then return; end if;
  v_hash := sha256(convert_to(v_raw, 'UTF8'));
  return query
    select c.id, c.wake_kind, c.firm_id, c.on_behalf_of
    from clara.wake_credentials c
    where c.secret_hash = v_hash
      and c.revoked_at is null
      and c.consumed_at is null
      and c.expires_at > statement_timestamp()
      and (c.on_behalf_of is null or exists (
        select 1 from clara.firm_memberships m
        where m.user_id = c.on_behalf_of and m.firm_id = c.firm_id
          and m.status = 'active'
          and clara.role_rank(m.role) >= clara.role_rank('bookkeeper')))
    limit 1;
end $$;

-- Like wake_context() but does NOT filter out a CONSUMED credential, and returns
-- consumed_at. Internal (ungranted) — used ONLY by wake_record_notification so an
-- idempotent op_key RETRY after a lost response can still replay the original receipt
-- of a single-use proactive credential (design v2 §C/F8 + ADR-009 at-least-once).
create function clara._wake_cred_full()
  returns table(credential_id uuid, wake_kind text, firm_id uuid, on_behalf_of uuid, consumed_at timestamptz)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_raw text; v_hash bytea;
begin
  v_raw := current_setting('clara.wake_secret', true);
  if v_raw is null or v_raw = '' then return; end if;
  v_hash := sha256(convert_to(v_raw, 'UTF8'));
  return query
    select c.id, c.wake_kind, c.firm_id, c.on_behalf_of, c.consumed_at
    from clara.wake_credentials c
    where c.secret_hash = v_hash
      and c.revoked_at is null
      and c.expires_at > statement_timestamp()
      and (c.on_behalf_of is null or exists (         -- live revalidation, HIGH 5
        select 1 from clara.firm_memberships m
        where m.user_id = c.on_behalf_of and m.firm_id = c.firm_id
          and m.status = 'active'
          and clara.role_rank(m.role) >= clara.role_rank('bookkeeper')))
    limit 1;
end $$;

-- Single-source firm resolvers. wake_firm(): the wake credential's firm ONLY
-- (ignores jwt). jwt_firm(): the firm of the jwt sub's LIVE ACTIVE membership
-- ONLY (ignores wake) — no active membership → NULL → no rows/writes (live
-- revocation). These are the role-pinned policy resolvers (design v2 §A).
create function clara.wake_firm() returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $$
  select firm_id from clara.wake_context() limit 1;
$$;

create function clara.jwt_firm() returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $$
  select m.firm_id from clara.firm_memberships m
  where m.user_id = clara.jwt_sub() and m.status = 'active' limit 1;
$$;

-- Convenience actor/firm accessors (design v2 §A/§B — granted to app roles).
-- current_actor_id(): the agent user for a wake session (NEVER on_behalf_of), else
-- the jwt sub. actor_firm_id(): coalesce(wake, jwt) — used for stamping the firm
-- on parentless firm-scoped rows inside a trusted writer, and never for a write
-- authorization decision (writes go through the lane entry points).
create function clara.current_actor_id() returns uuid
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  if exists (select 1 from clara.wake_context()) then
    return clara.agent_user_id();
  end if;
  return clara.jwt_sub();
end $$;

create function clara.actor_firm_id() returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(clara.wake_firm(), clara.jwt_firm());
$$;

-- The jwt actor's role rank in their active firm (NULL if none) — used by the
-- audit_log read policy floor. Single-source (jwt), like jwt_firm().
create function clara.actor_role_rank() returns int
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara.role_rank(m.role) from clara.firm_memberships m
  where m.user_id = clara.jwt_sub() and m.status = 'active' limit 1;
$$;

-- Does p_user share the CALLER's own firm? (MEDIUM 13: the old 2-arg shares_firm
-- accepted an arbitrary p_firm and was granted to app roles — a cross-tenant
-- membership oracle, "is user X in firm B?". These one-arg helpers resolve the
-- caller's own firm INTERNALLY (human via jwt_firm(), agent via wake_firm()) so a
-- firm-A caller can only ever ask "is X in MY firm A". No helper taking an
-- arbitrary firm is granted.) Used only by the users read policy.
create function clara.shares_my_firm_human(p_user uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.firm_memberships m
    where m.user_id = p_user and m.firm_id = clara.jwt_firm() and m.status = 'active'
  );
$$;
create function clara.shares_my_firm_wake(p_user uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.firm_memberships m
    where m.user_id = p_user and m.firm_id = clara.wake_firm() and m.status = 'active'
  );
$$;

-- =====================================================================
-- 7. RLS — forced everywhere. Owner policies are CONSTANT true (design §4
--    recursion law: a helper call in clara_fn_owner's own policy would recurse,
--    since the helpers read these very tables as fn_owner). App read policies are
--    ROLE-PINNED to a single identity source (branch pinning by role, design v2
--    §A). App roles hold ZERO DML grants; the human FOR ALL + WITH CHECK is a
--    belt (if a future migration ever mis-grants DML, RLS still scopes it).
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'users','firms','firm_memberships','wake_credentials','wake_fn_allowlist',
    'firm_admissions','audit_log','op_receipts','freeform_read_log'
  ] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
  end loop;
end $$;

-- users: self + firm-mates. Role-pinned resolver per lane; the shares-firm helper
-- resolves the caller's OWN firm internally (MEDIUM 13 — no cross-firm probe).
create policy p_users_human on clara.users for select to clara_authenticated
  using (id = clara.jwt_sub() or clara.shares_my_firm_human(id));
create policy p_users_agent on clara.users for select to clara_agent_ro
  using (clara.shares_my_firm_wake(id));

-- firms: your own firm only.
create policy p_firms_human on clara.firms for select to clara_authenticated
  using (id = clara.jwt_firm());
create policy p_firms_agent on clara.firms for select to clara_agent_ro
  using (id = clara.wake_firm());

-- firm_memberships: your firm's roster. FOR ALL + WITH CHECK for the human belt.
create policy p_firm_memberships_human on clara.firm_memberships for all to clara_authenticated
  using (firm_id = clara.jwt_firm()) with check (firm_id = clara.jwt_firm());
create policy p_firm_memberships_agent on clara.firm_memberships for select to clara_agent_ro
  using (firm_id = clara.wake_firm());

-- audit_log: bookkeeper+ of the firm may read (design v2 §F/F24). NOTE: the
-- contract's literal ">= 2" is inconsistent with role_rank('bookkeeper')=1 and
-- its own "(bookkeeper+)" label; implemented as the labelled INTENT (bookkeeper+
-- = rank>=1). A viewer (rank 0) sees zero audit rows. No agent read. (FLAGGED.)
create policy p_audit_log_human on clara.audit_log for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper'));

-- freeform_read_log: the runtime writes it before a freeform read; nobody else
-- touches it (wake_credentials, op_receipts, firm_admissions, wake_fn_allowlist
-- get no app policy at all — invisible to app roles).
create policy p_freeform_read_log_runtime on clara.freeform_read_log for insert to clara_runtime
  with check (true);

-- =====================================================================
-- 8. TABLE-LEVEL SELECT GRANTS (RLS still scopes every read). App roles get
--    ZERO write grants anywhere — the wall that makes `select approve_entry(...)`
--    unreachable for the agent lane is the absence of a grant, not session state.
--    (0003 tables grant their own SELECTs; function EXECUTE is the 0004 matrix.)
-- =====================================================================
grant select on
  clara.users, clara.firms, clara.firm_memberships, clara.audit_log
  to clara_authenticated;
grant select on
  clara.users, clara.firms, clara.firm_memberships
  to clara_agent_ro;
-- The runtime writes the freeform-read receipt directly (it is the only writer
-- that is not a definer function).
grant insert on clara.freeform_read_log to clara_runtime;

-- =====================================================================
-- 9. SEED THE STRUCTURAL CONSTANTS (idempotent). The global agent identity and
--    the wake allowlist are part of the schema's structural contract, not demo
--    data — they belong in the migration, not the seed.
-- =====================================================================
insert into clara.users (id, display_name, is_agent)
values (clara.agent_user_id(), 'Clara (agent)', true)
on conflict (id) do nothing;

insert into clara.wake_fn_allowlist (wake_kind, function_name) values
  ('interactive', 'wake_draft_entry'),
  ('interactive', 'wake_record_client_resolution'),
  ('interactive', 'wake_ingest_document'),
  ('interactive', 'wake_record_notification'),
  ('proactive',   'wake_record_notification')
on conflict do nothing;

reset role;
