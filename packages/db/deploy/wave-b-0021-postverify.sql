-- =====================================================================
-- Migration 0021 (the human counterparty lane) — POST-DEPLOY VERIFY PROBES.
-- READ-ONLY.  Run as the OWNER/ceremony role.
--
-- WHY THIS FILE EXISTS. 0021 carries an in-transaction tail, and the tail proves
-- THE APPLY — it runs inside the migration's own transaction, against the state
-- that transaction is building. That is the 0016 lesson and it is not the same
-- claim as "the COMMITTED catalog has these properties". This file re-reads the
-- load-bearing ones from outside, which is the only place an operator's "it went
-- fine" can be checked against the database.
--
-- It also re-asserts the two facts the verb's create-or-get recovery SILENTLY
-- DEPENDS ON: that both counterparty unique indexes still exist and are still
-- kind-scoped. If a later migration widened or dropped either one, the recovery
-- branch would keep compiling and start returning the wrong party — a payable
-- attached to a customer. A dependency a function cannot express in its own
-- signature is exactly the kind that needs an external probe.
--
-- USAGE (live env, DSN from the environment — NEVER in argv):
--     psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0021-postverify.sql
--
-- It raises on the FIRST failed invariant and prints a green line per section
-- otherwise. It writes NOTHING — safe inside `begin read only` (a write raises
-- 25006), which is the cheap total proof of that.
--
-- NO psql meta-commands anywhere in this file: the rig runs it VERBATIM through
-- node-postgres, which cannot parse them. Section banners are RAISE NOTICE.
-- =====================================================================
do $$ begin raise notice '=== 0021 post-verify - READ-ONLY ==='; end $$;

-- ---------------------------------------------------------------------
-- 1. The migration is at 0021, and 0020 is still there.
--    The HEAD, not merely "0021 is present": on a ceremony the load-bearing
--    claim is that the apply did not run PAST the migration being deployed.
--
--    THE RIG ESCAPE HATCH, and why it is a GUC rather than a weaker predicate.
--    The 0021 battery runs this file VERBATIM — that is the only thing that keeps
--    a ceremony artifact honest between deploys. But the rig's database is at
--    HEAD, so the day 0022 lands, a strict head check would fail there for a
--    reason that has nothing to do with 0021. The 0020 fixture solved the same
--    problem by bounding its migrate; this battery has no upgrade fixture to
--    bound. So: the STRICT check is the default, and a caller who knows it is
--    looking at a later database says so out loud with
--        set clara.postverify_allow_later = 'on';
--    which no ceremony does and no operator types by accident. Weakening the
--    predicate itself to "0021 is somewhere in the history" was the other option
--    and would have thrown away the production protection to buy a green test.
-- ---------------------------------------------------------------------
do $$
declare v text; v_later boolean;
begin
  v_later := coalesce(current_setting('clara.postverify_allow_later', true), '') in ('on','true','1');
  select max(version) into v from clara.schema_migrations;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0021_counterparty_human_lane') then
    raise exception 'POST-VERIFY 1: 0021_counterparty_human_lane is NOT applied (head is %)', v;
  end if;
  if v <> '0021_counterparty_human_lane' and not v_later then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — 0021 is not the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations where version = '0020_typed_consent') then
    raise exception 'POST-VERIFY 1: 0020 is missing from the history';
  end if;
  if v_later then
    raise notice 'OK 1  0021 applied, 0020 intact (head is % - later migrations ALLOWED by clara.postverify_allow_later)', v;
  else
    raise notice 'OK 1  at 0021_counterparty_human_lane, 0020 intact';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. The verb exists at its EXACT signature, is SECURITY DEFINER, pins its
--    search_path, and is OWNED BY clara_fn_owner.
--
--    Ownership is not decoration. A definer executes as its OWNER — the owner IS
--    the authority the function lends its caller. Left owned by the migration
--    role on a managed project, this verb would run with a far wider set of
--    rights than the governed surface is supposed to hand out. The first rig run
--    of 0021 caught exactly that (owner=postgres), which is why it is asserted
--    in three places: the migration body, its tail, and here.
-- ---------------------------------------------------------------------
do $$
declare v_oid oid; v_cfg text; v_owner text;
begin
  v_oid := to_regprocedure('clara.create_counterparty(uuid,text,text,text,text,text)');
  if v_oid is null then
    raise exception 'POST-VERIFY 2: clara.create_counterparty is absent at its exact signature';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'POST-VERIFY 2: create_counterparty is not SECURITY DEFINER';
  end if;
  select coalesce(array_to_string(proconfig, ','), ''), pg_get_userbyid(proowner)
    into v_cfg, v_owner from pg_proc where oid = v_oid;
  -- Postgres stores this as `search_path=clara, pg_temp` — WITH A SPACE. A matcher
  -- that forgets that fails every verb in the schema and looks like a real finding.
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception 'POST-VERIFY 2: create_counterparty has no pinned search_path (%)', v_cfg;
  end if;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'POST-VERIFY 2: create_counterparty is owned by % — a definer lends its OWNER''s authority', v_owner;
  end if;
  raise notice 'OK 2  create_counterparty: SECURITY DEFINER, search_path pinned, owned by clara_fn_owner';
end $$;

-- ---------------------------------------------------------------------
-- 3. EXECUTE is held by clara_authenticated and by NOBODY else — no PUBLIC, no
--    runtime, no wake role. Minting a counterparty is a human act; a wake lane
--    that could mint one could invent a trading partner out of a document.
--
--    Read from pg_proc.proacl via aclexplode, NOT information_schema.
--    `routine_privileges` only shows rows where the querying role is the grantor,
--    the grantee, or a member of the grantee — so on a cluster where the ceremony
--    role does not inherit the function owner it returns nothing and this probe
--    would FAIL OPEN. proacl NULL means default privileges, which for a function
--    means EXECUTE TO PUBLIC — so a NULL acl is a FAILURE here, not a pass.
-- ---------------------------------------------------------------------
do $$
declare v_oid oid; v_acl aclitem[]; v_bad text; v_have text;
begin
  v_oid := to_regprocedure('clara.create_counterparty(uuid,text,text,text,text,text)');
  select proacl into v_acl from pg_proc where oid = v_oid;
  if v_acl is null then
    raise exception 'POST-VERIFY 3: create_counterparty has a NULL acl — default function privileges are EXECUTE TO PUBLIC';
  end if;

  select string_agg(distinct pg_get_userbyid(a.grantee), ', ') into v_bad
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE'
     and (a.grantee = 0
          or pg_get_userbyid(a.grantee) in ('clara_runtime','clara_agent_ro',
                                            'clara_wake_interactive','clara_wake_proactive'));
  if v_bad is not null then
    raise exception 'POST-VERIFY 3: create_counterparty is EXECUTABLE by %', v_bad;
  end if;

  select string_agg(distinct pg_get_userbyid(a.grantee), ', ') into v_have
    from aclexplode(v_acl) a
   where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'clara_authenticated';
  if v_have is null then
    raise exception 'POST-VERIFY 3: clara_authenticated does NOT hold EXECUTE — the human lane cannot call its own verb';
  end if;
  raise notice 'OK 3  EXECUTE: clara_authenticated only (no PUBLIC, no runtime, no wake) - read from proacl';
end $$;

-- ---------------------------------------------------------------------
-- 4. THE INDEX CONTRACT the create-or-get recovery depends on.
--    Both partial unique indexes must exist AND carry `kind`. The recovery
--    branches on which one collided; if either lost `kind`, one client's
--    identically-named vendor and customer would collapse into one party and a
--    payable would attach to a receivable relationship. Nothing in the function's
--    signature can express this, so it is asserted here.
-- ---------------------------------------------------------------------
do $$
declare v_reg text; v_name text;
begin
  select pg_get_indexdef(i.indexrelid) into v_reg
    from pg_index i where i.indexrelid = 'clara.uq_counterparties_client_registration'::regclass;
  select pg_get_indexdef(i.indexrelid) into v_name
    from pg_index i where i.indexrelid = 'clara.uq_counterparties_client_unregistered_name'::regclass;

  if v_reg is null or v_reg not like '%kind%' or v_reg not like '%registration_normalized%' then
    raise exception 'POST-VERIFY 4: the registration index is missing or no longer kind-scoped: %', v_reg;
  end if;
  if v_reg not like '%WHERE (registration_normalized IS NOT NULL)%' then
    raise exception 'POST-VERIFY 4: the registration index lost its partial predicate: %', v_reg;
  end if;
  if v_name is null or v_name not like '%kind%' or v_name not like '%name_normalized%' then
    raise exception 'POST-VERIFY 4: the unregistered-name index is missing or no longer kind-scoped: %', v_name;
  end if;
  if v_name not like '%WHERE (registration_normalized IS NULL)%' then
    raise exception 'POST-VERIFY 4: the unregistered-name index lost its partial predicate: %', v_name;
  end if;
  raise notice 'OK 4  both counterparty unique indexes intact, kind-scoped, and still partial';
end $$;

-- ---------------------------------------------------------------------
-- 5. IDENTITY RESOLUTION IS UNTOUCHED. 0021's whole claim is that it adds a
--    DOOR and changes no policy: `_resolve_counterparty` keeps its monopoly on
--    deciding whether an incoming document names an EXISTING party, and
--    approve_entry keeps the birth path. A probe that only checked the new verb
--    would not notice if the migration had also quietly widened either.
-- ---------------------------------------------------------------------
do $$
declare v_n int;
begin
  if to_regprocedure('clara._resolve_counterparty(uuid,uuid,jsonb,uuid)') is null
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'clara' and p.proname = '_resolve_counterparty') then
    raise exception 'POST-VERIFY 5: clara._resolve_counterparty is GONE — identity resolution lost its owner';
  end if;
  if to_regprocedure('clara.approve_entry(uuid,text,jsonb,text)') is null
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'clara' and p.proname = 'approve_entry') then
    raise exception 'POST-VERIFY 5: clara.approve_entry is GONE';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname like '%counterpart%';
  raise notice 'OK 5  identity resolution intact (_resolve_counterparty + approve_entry present); % counterparty-named fn(s) in clara', v_n;
end $$;

-- ---------------------------------------------------------------------
-- 6. THE INERTNESS RECEIPT — 0021 added a DOOR, not data.
--
--    Stated EXACTLY, via xmin: `migrate.mjs` applies a migration and records its
--    schema_migrations row in ONE transaction, so that row's xmin IS the apply's
--    transaction id. Any row the migration itself wrote carries the same xmin.
--    A time-window predicate ("created_at >= applied_at") would have looked
--    equivalent and been wrong in both directions: it fails on ordinary use of
--    the new verb after the deploy, and on a busy database it sweeps in rows the
--    migration had nothing to do with. This asks the only question worth asking.
--
--    FREEZING: after an aggressive vacuum, xmin becomes FrozenTransactionId and
--    the comparison would pass VACUOUSLY. Detect that and say the probe cannot be
--    evaluated — a check that silently stops checking is worse than no check.
-- ---------------------------------------------------------------------
do $$
declare v_xid xid; v_cp bigint;
begin
  select xmin into v_xid from clara.schema_migrations
   where version = '0021_counterparty_human_lane';
  if v_xid is null then
    raise exception 'POST-VERIFY 6: no schema_migrations row for 0021 (probe 1 should have caught this)';
  end if;
  if v_xid::text::bigint < 3 then
    raise exception 'POST-VERIFY 6: the 0021 schema_migrations row is FROZEN (xmin=%) — this probe can no longer distinguish the migration''s writes and must not report green', v_xid;
  end if;
  select count(*) into v_cp from clara.counterparties where xmin = v_xid;
  if v_cp <> 0 then
    raise exception 'POST-VERIFY 6: the 0021 apply transaction wrote % counterparty row(s) — it is a data migration, not a door', v_cp;
  end if;
  raise notice 'OK 6  the 0021 apply transaction (xid %) wrote no counterparty row', v_xid;
end $$;

do $$ begin raise notice '=== 0021 post-verify COMPLETE - 6/6 ==='; end $$;
