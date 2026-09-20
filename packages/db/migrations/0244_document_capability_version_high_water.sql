-- 0244_document_capability_version_high_water — #846: THE CAPABILITY REGISTRY'S VERSION NUMBER
-- STOPS BEING UNDERCUTTABLE BY DELETE-THEN-INSERT.
-- =====================================================================================
-- Spec of record: issue #846 (Agent Brief, 2026-09-17), which is #779's OWN residual list,
-- written down in 0207's header rather than closed there:
--
--   1. "A DELETE-then-INSERT at a lower version is NOT blocked. This wall constrains UPDATE
--      transitions for a live row; a row that is deleted and re-inserted is, to the database, a
--      first publication of that key."
--   2. "…the 'every row published together carries the same integer' convention itself is still
--      a convention: nothing here enforces cross-row uniformity."
--
-- MEASURED ON THIS RIG BEFORE THIS FILE WAS WRITTEN (PG 17.11, chain 0001→0234, 229 files):
-- `pdf x invoice` published `registry_version` 2; deleting the row and re-inserting it at 1 was
-- ACCEPTED and the table then read 1. Not a theory — the hole is reproducible in one transaction.
--
-- PARENT FILES, NEITHER EDITED HERE: 0191_document_capability_registry.sql (the table, its axes,
-- its positivity CHECK, its two policies and its grants) and 0207_document_capabilities_version
-- _monotone.sql (the BEFORE UPDATE transition wall, whose CLR08 code and `detail.reason` shape
-- every wall below reuses rather than minting a second spelling for the same fact).
--
-- WHY A HIGH-WATER RELATION AND NOT A DELETE REFUSAL. The other way to close residual 1 is to
-- refuse DELETE on the registry outright. #846's brief rules that out in its own words — "a
-- version once published for a pair can never be undercut by any route, WHILE RETIRING A ROW
-- STAYS POSSIBLE" — and the estate agrees: 0191 publishes one row per (format, kind) for the
-- LIVE vocabulary, and a kind or a format that leaves that vocabulary must be able to leave the
-- registry with it. A high-water mark keeps the memory of what was published WITHOUT keeping the
-- publication, which is exactly the distinction a retirement needs.
--
-- WHY THE MARK IS ITS OWN RELATION AND NOT A COLUMN. A column on `clara.document_capabilities`
-- would be deleted with the row it is meant to outlive — the defect, restated. The mark has to
-- survive its subject, so it is a sibling table whose rows are never deleted and whose version
-- only ever rises (§B.3's wall makes both of those a refusal rather than a habit).
--
-- "STATEMENT-LEVEL CONSTRAINT TRIGGER" IS NOT AVAILABLE, AND THE BRIEF'S INTENT IS KEPT ANYWAY.
-- #846 asks for "a statement-level constraint trigger" for residual 2. PostgreSQL has no such
-- object: `create constraint trigger ... for each statement` is a SYNTAX ERROR (42601), measured
-- on this rig at authoring, and the upstream grammar (src/backend/parser/gram.y, the
-- `CREATE opt_or_replace CONSTRAINT TRIGGER` production) hard-codes `FOR EACH ROW`. What the
-- brief actually asks for is a check over the WHOLE TABLE at the END of the transaction — which
-- is what DEFERRABLE INITIALLY DEFERRED buys — so §B.4 is an AFTER ROW constraint trigger whose
-- body is table-wide. It fires at COMMIT (or at an explicit `set constraints … immediate`), not
-- per statement, so a publish that passes through a non-uniform intermediate state — which every
-- multi-statement republish does — is judged on what it LEAVES, never on what it passed through.
-- `create or replace constraint trigger` is likewise unsupported (0A000, measured), which is why
-- §B.4 drops and recreates rather than replaces.
--
-- REDO-SAFE BY CONSTRUCTION (wave-2 rule; packages/db/README.md "Redo (#957)"). Every object
-- below is created with naturally idempotent DDL — `create table if not exists`, `create or
-- replace function`, `drop trigger if exists` before each `create trigger`, `drop policy if
-- exists` before the policy — and the backfill is an `on conflict … do update` that only ever
-- RAISES. Re-running this file against a database that already carries its effects is therefore
-- a no-op plus a re-proof. The prestate below says which of the two it is instead of refusing.
--
-- WHAT DOES NOT CHANGE: the four capability axes and their closed set, the seeded verdicts, the
-- `registry_version >= 1` positivity CHECK, 0191's two policies and its grants, 0207's BEFORE
-- UPDATE wall and its body, and the output of `clara._document_capability(text,text)` /
-- `clara.get_document_state(uuid,uuid)`. No application role gains anything anywhere in this
-- file: the high-water relation is granted to NOBODY and its walls are ungranted internals.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it is building on, measured.
-- =====================================================================================
do $w846_pre$
declare
  v_n int; v_def text; v_sha text; v_role text; v_redo boolean;
begin
  foreach v_role in array array['clara_fn_owner','clara_authenticated','clara_agent_ro'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      raise exception '#846 prestate: role % is missing', v_role using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE SUBJECT. 0191's registry must be there, keyed the way the mark is keyed: a registry
  -- re-keyed since 0191 would make "the same (format, document_kind) pair" mean something other
  -- than what the high-water relation remembers.
  if to_regclass('clara.document_capabilities') is null then
    raise exception '#846 prestate: clara.document_capabilities is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'p';
  if v_def is null or v_def not ilike '%(format, document_kind)%' then
    raise exception '#846 prestate: clara.document_capabilities is no longer primary-keyed on (format, document_kind) -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;

  -- (b) THE POSITIVITY CHECK STAYS. This file adds walls ALONGSIDE it, exactly as 0207 did.
  select count(*)::int into v_n from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%registry_version >= 1%';
  if v_n <> 1 then
    raise exception '#846 prestate: the registry_version >= 1 positivity CHECK is not on the column (found %)', v_n
      using errcode = 'CLR10';
  end if;

  -- (c) THE WALL THIS FILE EXTENDS, PINNED BY BODY. 0207's BEFORE UPDATE trigger is the half of
  -- the invariant that already exists; the walls below reuse its errcode and detail shape and
  -- this file's header asserts its residuals verbatim. A recut body would mean the refusal a
  -- caller sees on the UPDATE side is no longer the one this file was written beside. MEASURED
  -- on the lane rig 2026-09-20 with encode(sha256(convert_to(prosrc,'UTF8')),'hex') keyed by
  -- to_regprocedure -- never transcribed from 0207's file text.
  if to_regprocedure('clara._tf_document_capabilities_version_monotone()') is null then
    raise exception '#846 prestate: clara._tf_document_capabilities_version_monotone is absent -- 0207 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure;
  if v_sha <> '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#846 prestate: clara._tf_document_capabilities_version_monotone body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.document_capabilities'::regclass
                    and t.tgname = 't_document_capabilities_version_monotone' and not t.tgisinternal) then
    raise exception '#846 prestate: 0207''s t_document_capabilities_version_monotone is not attached'
      using errcode = 'CLR10';
  end if;

  -- (d) THE BACKFILL'S PREMISE, AND THE UNIFORMITY WALL'S. The registry publishes exactly ONE
  -- distinct version today (0191's convention, which §B.4 turns into a refusal). Arming a
  -- deferred uniformity wall over a table that ALREADY carries two versions would make the next
  -- writer's transaction fail for a condition it did not create, so the condition is measured
  -- here and the file refuses rather than arming a wall nobody can satisfy.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#846 prestate: the registry publishes % distinct registry_version(s), not one -- §B.4''s uniformity wall would refuse every writer until that is repaired', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n is null or v_n < 1 then
    raise exception '#846 prestate: the registry publishes no positive version (min %)', coalesce(v_n, -1)
      using errcode = 'CLR10';
  end if;

  -- (e) FIRST APPLY OR REDO. This file is redo-safe on purpose (wave-2 rule), so an already-
  -- present object is not a refusal here the way 0191's and 0207's idempotency checks are; it is
  -- a FACT to state, so the apply log says which of the two happened.
  v_redo := to_regclass('clara.document_capability_version_high_water') is not null;
  raise notice '#846 prestate: clean -- registry publishes one version (%), 0207''s wall is live at its pinned body, this is a % apply.',
    v_n, case when v_redo then 'REDO' else 'FIRST' end;
end
$w846_pre$;

-- =====================================================================================
-- §B.1  THE HIGH-WATER RELATION.
-- =====================================================================================
set role clara_fn_owner;

create table if not exists clara.document_capability_version_high_water (
  format           text        not null check (btrim(format) <> ''),
  document_kind    text        not null check (btrim(document_kind) <> ''),
  registry_version int         not null check (registry_version >= 1),
  first_seen_at    timestamptz not null default now(),
  recorded_at      timestamptz not null default now(),
  primary key (format, document_kind)
);

comment on table clara.document_capability_version_high_water is
  'The HIGH-WATER MARK of clara.document_capabilities.registry_version, per (format, document_kind) (#846). One row per pair that has EVER been published, carrying the highest version that pair has ever carried. Written by clara._tf_document_capabilities_high_water_record (AFTER INSERT OR UPDATE on the registry) and read by clara._tf_document_capabilities_version_high_water (BEFORE INSERT), which is what closes #779''s first residual: a registry row can still be RETIRED, but the version it published outlives it, so a DELETE-then-INSERT can never land below it. Append-only in effect: clara._tf_document_capability_high_water_monotone refuses a DELETE and refuses an UPDATE that lowers the version, re-keys the row or moves first_seen_at. Global, not per-firm, exactly as its subject is; granted to NO application role -- it is an integrity ledger, not a read surface.';
comment on column clara.document_capability_version_high_water.registry_version is
  'The highest clara.document_capabilities.registry_version this pair has ever carried. Only ever rises.';
comment on column clara.document_capability_version_high_water.first_seen_at is
  'When this pair was FIRST published. Immutable: the append-only wall refuses an update that moves it.';
comment on column clara.document_capability_version_high_water.recorded_at is
  'When the current high-water value was reached. Moves only upward with registry_version.';

alter table clara.document_capability_version_high_water enable row level security;
alter table clara.document_capability_version_high_water force row level security;

-- Forced RLS applies to the owner too, so without this the DEFINER walls below -- which run AS
-- clara_fn_owner -- would read ZERO high-water rows and every re-insert would look like a first
-- publication. Safe-directioned but wrong, which is 0191's own lesson about this very table.
drop policy if exists p_document_capability_high_water_owner on clara.document_capability_version_high_water;
create policy p_document_capability_high_water_owner on clara.document_capability_version_high_water
  for all to clara_fn_owner using (true) with check (true);

-- NO application policy and NO grant of any kind, deliberately. 0191 settled the twin question
-- for the registry itself: clara_agent_ro reaches capability facts through the SECURITY DEFINER
-- doors and holds no table privilege, and clara_authenticated holds SELECT on the registry only
-- because a browser renders it. NOTHING renders a high-water mark. A grant here would be a
-- second way in with nothing behind it.

reset role;

-- =====================================================================================
-- §B.2  THE INSERT-SIDE WALL, and the writer that feeds it.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._tf_document_capabilities_version_high_water() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_high int;
begin
  select h.registry_version into v_high
    from clara.document_capability_version_high_water h
   where h.format = new.format and h.document_kind = new.document_kind;

  -- A pair with no mark has never been published: this IS a first publication and is admitted,
  -- which is #846's fourth acceptance criterion and the reason this wall reads a relation rather
  -- than refusing INSERT outright.
  if v_high is not null and new.registry_version < v_high then
    raise exception 'a capability registry_version never goes backwards (% x %: high water %, attempted %)',
      new.format, new.document_kind, v_high, new.registry_version
      using errcode = 'CLR08',
        detail = jsonb_build_object(
          'reason', 'registry_version_high_water',
          'column', 'registry_version',
          'format', new.format,
          'document_kind', new.document_kind,
          'from', v_high,
          'to', new.registry_version)::text;
  end if;
  return new;
end
$fn$;
revoke all on function clara._tf_document_capabilities_version_high_water() from public;
comment on function clara._tf_document_capabilities_version_high_water() is
  'BEFORE INSERT row wall on clara.document_capabilities (#846): an INSERT may not land BELOW the high-water mark clara.document_capability_version_high_water holds for its (format, document_kind). This is the half 0207''s BEFORE UPDATE wall structurally cannot see -- a deleted-then-reinserted row is a first publication to the database. A pair with no mark has never been published and is admitted. Raises CLR08 with detail.reason = registry_version_high_water, the same code family and detail shape clara._tf_document_capabilities_version_monotone (0207) and clara._tf_accounting_plans_immutable (0193) raise.';

create or replace function clara._tf_document_capabilities_high_water_record() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  insert into clara.document_capability_version_high_water as h
    (format, document_kind, registry_version)
  values (new.format, new.document_kind, new.registry_version)
  on conflict (format, document_kind) do update
     set registry_version = excluded.registry_version,
         recorded_at      = now()
   where excluded.registry_version > h.registry_version;
  return null;   -- AFTER trigger: the return value is ignored.
end
$fn$;
revoke all on function clara._tf_document_capabilities_high_water_record() from public;
comment on function clara._tf_document_capabilities_high_water_record() is
  'AFTER INSERT OR UPDATE row writer on clara.document_capabilities (#846): raises the pair''s high-water mark to the version just written, or creates the mark on a first publication. Never lowers -- the conflict arm carries `where excluded.registry_version > h.registry_version`, so an unchanged or lower write leaves the mark and its recorded_at exactly where they were. It is a WRITER, not a wall: the refusals live in clara._tf_document_capabilities_version_high_water (INSERT side) and clara._tf_document_capabilities_version_monotone (UPDATE side, 0207), both of which run BEFORE this one.';

drop trigger if exists t_document_capabilities_version_high_water on clara.document_capabilities;
create trigger t_document_capabilities_version_high_water
  before insert on clara.document_capabilities
  for each row execute function clara._tf_document_capabilities_version_high_water();

drop trigger if exists t_document_capabilities_high_water_record on clara.document_capabilities;
create trigger t_document_capabilities_high_water_record
  after insert or update on clara.document_capabilities
  for each row execute function clara._tf_document_capabilities_high_water_record();

reset role;

-- =====================================================================================
-- §C  THE BACKFILL. Every pair the registry publishes TODAY has published that version, so the
-- mark starts where the registry is. Without this the walls above would treat the entire live
-- registry as never-published and the hole would stay open for every existing pair -- which is
-- every pair there is.
-- =====================================================================================
set role clara_fn_owner;

insert into clara.document_capability_version_high_water as h
  (format, document_kind, registry_version)
select c.format, c.document_kind, c.registry_version from clara.document_capabilities c
on conflict (format, document_kind) do update
   set registry_version = excluded.registry_version,
       recorded_at      = now()
 where excluded.registry_version > h.registry_version;

reset role;

-- =====================================================================================
-- §D  TAIL. The relation, the walls, the backfill — and proof that the refusal actually fires.
-- =====================================================================================
do $w846_tail$
declare
  v_n int; v_def text; v_owner text; v_secdef boolean; v_cfg text[]; v_cols text;
  v_err text; v_detail text; v_reason jsonb; v_published int; v_stored int;
  r clara.document_capabilities%rowtype;
begin
  -- (1) THE RELATION, exactly as §B.1 declares it.
  if to_regclass('clara.document_capability_version_high_water') is null then
    raise exception '#846 tail: the high-water relation is absent' using errcode = 'CLR10';
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'clara.document_capability_version_high_water'::regclass
     and a.attnum > 0 and not a.attisdropped;
  if v_cols <> 'format,document_kind,registry_version,first_seen_at,recorded_at' then
    raise exception '#846 tail: the high-water relation carries the columns (%) rather than the five this file declares', v_cols
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'clara.document_capability_version_high_water'::regclass and c.contype = 'p';
  if v_def is null or v_def not ilike '%(format, document_kind)%' then
    raise exception '#846 tail: the high-water relation is not primary-keyed on (format, document_kind) -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint c
   where c.conrelid = 'clara.document_capability_version_high_water'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%registry_version >= 1%';
  if v_n <> 1 then
    raise exception '#846 tail: the high-water relation has no registry_version >= 1 positivity CHECK' using errcode = 'CLR10';
  end if;
  if (select c.relowner::regrole::text from pg_class c
       where c.oid = 'clara.document_capability_version_high_water'::regclass) <> 'clara_fn_owner' then
    raise exception '#846 tail: the high-water relation is not owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           where c.oid = 'clara.document_capability_version_high_water'::regclass) then
    raise exception '#846 tail: the high-water relation is not RLS-enabled AND forced' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'document_capability_version_high_water';
  if v_n <> 1 then
    raise exception '#846 tail: the high-water relation carries % policies, not the owner policy alone', v_n
      using errcode = 'CLR10';
  end if;
  -- NO application role holds ANYTHING on it. An integrity ledger is not a read surface.
  foreach v_def in array array['clara_authenticated','clara_agent_ro'] loop
    if pg_catalog.has_table_privilege(v_def, 'clara.document_capability_version_high_water', 'SELECT')
       or pg_catalog.has_table_privilege(v_def, 'clara.document_capability_version_high_water', 'INSERT')
       or pg_catalog.has_table_privilege(v_def, 'clara.document_capability_version_high_water', 'UPDATE')
       or pg_catalog.has_table_privilege(v_def, 'clara.document_capability_version_high_water', 'DELETE') then
      raise exception '#846 tail: % holds a privilege on the high-water relation', v_def using errcode = 'CLR10';
    end if;
  end loop;
  if pg_catalog.obj_description('clara.document_capability_version_high_water'::regclass, 'pg_class') is null then
    raise exception '#846 tail: the high-water relation carries no comment' using errcode = 'CLR10';
  end if;

  -- (2) DEFINER HYGIENE for every body this file installs: owner-owned, SECURITY DEFINER, pinned
  -- search_path, no EXECUTE for PUBLIC, commented. The house shape for clara._tf_*.
  foreach v_def in array array[
    'clara._tf_document_capabilities_version_high_water()',
    'clara._tf_document_capabilities_high_water_record()'] loop
    if to_regprocedure(v_def) is null then
      raise exception '#846 tail: % was not installed', v_def using errcode = 'CLR10';
    end if;
    select p.proowner::regrole::text, p.prosecdef, p.proconfig into v_owner, v_secdef, v_cfg
      from pg_proc p where p.oid = to_regprocedure(v_def);
    if v_owner <> 'clara_fn_owner' then
      raise exception '#846 tail: % is owned by % rather than clara_fn_owner', v_def, v_owner using errcode = 'CLR10';
    end if;
    if not v_secdef or v_cfg is null or not ('search_path=clara, pg_temp' = any (v_cfg)) then
      raise exception '#846 tail: % is not SECURITY DEFINER with a pinned search_path (secdef=%, config=%)', v_def, v_secdef, v_cfg
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = to_regprocedure(v_def) and a.grantee = 0 and a.privilege_type = 'EXECUTE';
    if v_n <> 0 then
      raise exception '#846 tail: PUBLIC holds EXECUTE on %', v_def using errcode = 'CLR10';
    end if;
    if pg_catalog.obj_description(to_regprocedure(v_def), 'pg_proc') is null then
      raise exception '#846 tail: % carries no comment', v_def using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) THE TRIGGERS, at the timings the invariant needs and with no WHEN clause to narrow them.
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_version_high_water' and not t.tgisinternal;
  if v_def is null or v_def !~* 'BEFORE INSERT' or v_def !~* 'FOR EACH ROW' or v_def ~* '\mWHEN\M' then
    raise exception '#846 tail: the INSERT wall is not an unconditional BEFORE INSERT FOR EACH ROW trigger -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_high_water_record' and not t.tgisinternal;
  if v_def is null or v_def !~* 'AFTER INSERT OR UPDATE' or v_def !~* 'FOR EACH ROW' or v_def ~* '\mWHEN\M' then
    raise exception '#846 tail: the high-water writer is not an unconditional AFTER INSERT OR UPDATE FOR EACH ROW trigger -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;

  -- (4) NOTHING 0191 OR 0207 OWNS MOVED.
  select count(*)::int into v_n from pg_constraint c
   where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%registry_version >= 1%';
  if v_n <> 1 then
    raise exception '#846 tail: 0191''s registry_version >= 1 positivity CHECK is gone' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'document_capabilities';
  if v_n <> 2 then
    raise exception '#846 tail: clara.document_capabilities carries % policies, not 0191''s owner + human-read pair', v_n
      using errcode = 'CLR10';
  end if;
  if pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated', 'clara.document_capabilities', 'DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro', 'clara.document_capabilities', 'SELECT') then
    raise exception '#846 tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capabilities_version_monotone()'::regprocedure), 'UTF8')), 'hex')
     <> '170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56' then
    raise exception '#846 tail: 0207''s wall body was modified by this file' using errcode = 'CLR10';
  end if;

  -- (5) THE BACKFILL IS TOTAL. Every published pair carries a mark at least as high as the
  -- version it publishes. A partial backfill would leave the hole open for exactly the pairs it
  -- missed, silently.
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version < c.registry_version;
  if v_n <> 0 then
    raise exception '#846 tail: % published pair(s) carry no high-water mark at or above their version', v_n
      using errcode = 'CLR10';
  end if;

  -- (6) IT ACTUALLY REFUSES. Structural presence is not enforcement: a wall whose body no longer
  -- read the mark would pass every assertion above. This probe reproduces the exact defect #846
  -- was filed for, against the live table, and is rolled back WHOLE through the estate's
  -- in-migration sentinel idiom (0016 D-P1's shape, 0207's §C(4) usage).
  select min(registry_version)::int into v_published from clara.document_capabilities;
  if v_published < 2 then
    raise exception '#846 tail: the registry publishes version %, too low for a lowering probe that stays above the positivity CHECK', v_published
      using errcode = 'CLR10';
  end if;
  begin
    select * into r from clara.document_capabilities where format = 'pdf' and document_kind = 'invoice';
    if r.format is null then
      raise exception '#846 tail: the probe pair pdf x invoice is not in the registry' using errcode = 'CLR10';
    end if;
    delete from clara.document_capabilities where format = 'pdf' and document_kind = 'invoice';

    -- 6a — BELOW the mark: refused, with the machine-readable reason.
    begin
      insert into clara.document_capabilities
        (format, document_kind, mime_type, custody, byte_extraction, typed_facts,
         business_operation, engine_id, engine_byte, registry_version, basis, limits)
      values (r.format, r.document_kind, r.mime_type, r.custody, r.byte_extraction, r.typed_facts,
              r.business_operation, r.engine_id, r.engine_byte, r.registry_version - 1, r.basis, r.limits);
      raise exception '#846 tail: a DELETE-then-INSERT BELOW the published version was ACCEPTED -- the wall is installed but does not enforce'
        using errcode = 'CLR10';
    exception when sqlstate 'CLR08' then
      get stacked diagnostics v_err = message_text, v_detail = pg_exception_detail;
      v_reason := nullif(v_detail, '')::jsonb;
      if coalesce(v_reason ->> 'reason', '') <> 'registry_version_high_water'
         or coalesce(v_reason ->> 'column', '') <> 'registry_version'
         or coalesce((v_reason ->> 'from')::int, -1) <> r.registry_version then
        raise exception '#846 tail: the refusal carries no machine-readable reason naming the high water (detail %)', coalesce(v_detail, '<null>')
          using errcode = 'CLR10';
      end if;
    end;

    -- 6b — AT the mark: admitted. The wall closes a hole; it does not close the door.
    insert into clara.document_capabilities
      (format, document_kind, mime_type, custody, byte_extraction, typed_facts,
       business_operation, engine_id, engine_byte, registry_version, basis, limits)
    values (r.format, r.document_kind, r.mime_type, r.custody, r.byte_extraction, r.typed_facts,
            r.business_operation, r.engine_id, r.engine_byte, r.registry_version, r.basis, r.limits);
    select registry_version into v_stored from clara.document_capabilities
     where format = 'pdf' and document_kind = 'invoice';
    if v_stored <> r.registry_version then
      raise exception '#846 tail: re-inserting AT the published version did not restore it (stored %)', v_stored
        using errcode = 'CLR10';
    end if;

    raise exception '#846 high-water probe rollback' using errcode = 'ZA244';
  exception when sqlstate 'ZA244' then null;
  end;

  -- (7) THE PROBE LEFT NOTHING BEHIND, in either table.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#846 tail: the probe leaked -- the registry publishes % distinct versions', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capability_version_high_water
   where registry_version <> v_published;
  if v_n <> 0 then
    raise exception '#846 tail: the probe leaked -- % high-water row(s) sit off the published version', v_n using errcode = 'CLR10';
  end if;

  raise notice '#846 tail: OK -- clara.document_capability_version_high_water holds the highest registry_version every (format, document_kind) has ever published (backfilled TOTAL over the live registry at version %), clara._tf_document_capabilities_version_high_water refuses an INSERT below that mark with CLR08 / detail.reason = registry_version_high_water, and clara._tf_document_capabilities_high_water_record raises the mark on every INSERT or UPDATE without ever lowering it. Proven behaviourally against the live table and rolled back whole: #846''s reproducer (delete pdf x invoice at %, re-insert at %) was REFUSED with the typed code and the named reason, and re-inserting AT the published version was ACCEPTED. 0191''s positivity CHECK, its two policies, the absent application write grant and the agent lane''s door-only access are re-read unchanged, and 0207''s wall body still hashes to its pinned pre-image. Neither 0191 nor 0207 is edited by this file.',
    v_published, v_published, v_published - 1;
end
$w846_tail$;
