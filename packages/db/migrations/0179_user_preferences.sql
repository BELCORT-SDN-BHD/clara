-- 0179_user_preferences — #626 (refresh spec #612 journey D1): the caller's OWN
-- interface/notification preferences, keyed by PERSON, never by firm. A firm's
-- authority controls stay at clara.firms/clara.firm_memberships; this table is
-- the opposite axis on purpose — the same person keeps ONE preferences row
-- across every firm they ever join or leave, exactly like clara.users itself.
--
-- ADDITIVE ONLY. One new table, two new SECURITY DEFINER functions, RLS, and an
-- EXECUTE grant. Nothing existing is read, spliced or recut. Migration 0178 is
-- owned by a different lane and this file must apply cleanly whether or not
-- 0178 has landed in a given chain — it names no object 0178 could plausibly own
-- (personal preferences vs. that lane's unrelated subject) and reads nothing it
-- creates.
--
-- FRONTEND HOME (apps/web):
--   clara.get_my_preferences()   -> apps/web/lib/settings/preferences.ts (getMyPreferences),
--                                   read by apps/web/components/settings/account-settings.tsx
--   clara.save_my_preferences()  -> the same lib file's saveMyPreferences, called by the
--                                   Interface/Notifications sections' Save action
--
-- SHAPE. `interface` and `notifications` are jsonb OBJECTS holding only EXPLICIT
-- overrides — an absent key means "the product's own default", never a stored
-- sentinel. This is what makes PATCH semantics simple: `save_my_preferences`
-- shallow-merges (jsonb `||`) the caller's patch onto the stored object, so a
-- save that only touches `interface.motion` cannot clear `interface.
-- sidebarDefault` — the literal "one save cannot clear unrelated settings"
-- acceptance line. Every key/value the write accepts is enumerated in the
-- function body below; an unknown key or an out-of-enum value is refused CLR10
-- with a typed `detail.reason`, not silently stored. `notifications` accepts
-- ZERO keys today — nothing in this codebase reads a per-user notification
-- preference yet (clara.notifications, 0003:184, is a firm/client event log with
-- no recipient column and no reader in apps/web) — so the column exists for
-- forward-compatible additive growth and every current patch to it must be
-- empty; the web surface renders an honest "not configured yet" note instead of
-- a dead toggle.
--
-- CONCURRENCY. `version` starts at 0 (including the SYNTHETIC row
-- `get_my_preferences()` returns before any row exists) and increments by
-- exactly 1 per successful save. `save_my_preferences` takes the caller's own
-- last-read `p_expected_version` and refuses CLR06 ("changed elsewhere") the
-- instant it no longer matches the row's current value under `for update` —
-- the same optimistic-concurrency shape `approve_entry`'s `revision_token` uses
-- (0004:96-99), sized down from a random token to a plain counter because there
-- is exactly one writer per row (the row's own owner) and no cross-actor
-- collision to make unguessable.
--
-- WHY save_my_preferences REQUIRES ACTIVE FIRM MEMBERSHIP AND get_my_preferences
-- DOES NOT. `_reserve_op`/`_finish_op` (0004:46-68) key idempotency by
-- `(firm_id, fn, op_key)` — there is no user-scoped equivalent table, and adding
-- one would be a second idempotency mechanism for a single-row-per-user write
-- that already has a natural one, so the save door reuses `_human_ctx` (0004:
-- 299-308) and scopes its op_receipts row by the caller's CURRENT firm. Reading
-- back a stored preference has no such requirement and no side effect to
-- deduplicate, so `get_my_preferences` asks only "is there an authenticated
-- actor" (`clara.jwt_sub()`) — a signed-in caller between firms (the /pending
-- holding state) still gets an honest synthetic-defaults answer instead of a
-- refusal for a page that reads it opportunistically (e.g. the motion-
-- preference sync mounted at the app root, which runs before firm scope is
-- known). In practice `/settings/account` itself sits behind
-- `requireFirmScope()` (apps/web/lib/require-firm-scope.ts), so a session that
-- can reach the Save button already carries an active membership.

set local statement_timeout = '2min';
set local lock_timeout = '5s';

-- ==============================================================================================
-- 0. PRESTATE.
-- ==============================================================================================
do $pre$
begin
  if to_regclass('clara.users') is null then
    raise exception 'user_preferences prestate: clara.users is absent' using errcode='CLR10';
  end if;
  if to_regclass('clara.user_preferences') is not null then
    raise exception 'user_preferences prestate: clara.user_preferences already exists' using errcode='CLR10';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname in ('get_my_preferences','save_my_preferences')
  ) then
    raise exception 'user_preferences prestate: get_my_preferences/save_my_preferences already exist' using errcode='CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. TABLE. One row per person, ever — not per firm, not per membership.
-- ==============================================================================================
create table clara.user_preferences (
  user_id        uuid        primary key references clara.users(id),
  version        int         not null default 0 check (version >= 0),
  interface      jsonb       not null default '{}'::jsonb check (jsonb_typeof(interface) = 'object'),
  notifications  jsonb       not null default '{}'::jsonb check (jsonb_typeof(notifications) = 'object'),
  updated_at     timestamptz not null default now()
);
comment on table clara.user_preferences is
  '#626 D1 personal preferences. Keyed by clara.users(id), NOT by firm. interface/notifications '
  'hold only explicit overrides; absence means the product default. version is optimistic-'
  'concurrency for save_my_preferences (CLR06 on mismatch).';

alter table clara.user_preferences enable row level security;
alter table clara.user_preferences force row level security;

-- Owner belt (rig T17/T18, 0002:483-488's own pattern): the two governed
-- functions below run as clara_fn_owner and must reach any row regardless of
-- whose it is, exactly like every other table in this schema.
create policy p_user_preferences_owner on clara.user_preferences for all to clara_fn_owner
  using (true) with check (true);

-- Human self-read only. No clara_authenticated INSERT/UPDATE/DELETE policy and
-- no such grant exists below either — every write goes through
-- save_my_preferences so validation and the version gate cannot be bypassed by
-- a direct PostgREST mutation. The SELECT grant + this policy exist so a direct
-- read (the web's own SQL-function census, a future admin probe, or the DB
-- cells below) can prove "own row only" against the table itself, not only
-- against the function's own filtering.
create policy p_user_preferences_self on clara.user_preferences for select to clara_authenticated
  using (user_id = clara.jwt_sub());

grant select on clara.user_preferences to clara_authenticated;

-- ==============================================================================================
-- 2. READ. No firm requirement — see header. STABLE: no writes, no side effects.
-- ==============================================================================================
create function clara.get_my_preferences() returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid;
  v_row record;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;

  select version, interface, notifications, updated_at into v_row
    from clara.user_preferences where user_id = v_actor;

  if not found then
    -- SYNTHETIC defaults — no row minted merely by reading. version=0 matches
    -- the table's own DEFAULT so a first-ever save's p_expected_version=0 is
    -- exactly what a caller who has only ever called get_my_preferences() saw.
    return jsonb_build_object(
      'version', 0,
      'interface', '{}'::jsonb,
      'notifications', '{}'::jsonb,
      'updated_at', null
    );
  end if;

  return jsonb_build_object(
    'version', v_row.version,
    'interface', v_row.interface,
    'notifications', v_row.notifications,
    'updated_at', v_row.updated_at
  );
end $$;
comment on function clara.get_my_preferences() is
  '#626 D1. The caller''s own preferences, or honest synthetic defaults (version 0, empty '
  'objects) when no row has ever been saved. No firm requirement — see migration header.';

-- ==============================================================================================
-- 3. WRITE. PATCH semantics + validation + optimistic concurrency + op-key replay.
-- ==============================================================================================
create function clara.save_my_preferences(p_expected_version int, p_patch jsonb, p_op_key text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;                 -- (actor, firm) from _human_ctx
  v_dedupe jsonb;
  v_row record;
  v_patch_interface jsonb;
  v_patch_notifications jsonb;
  v_new_interface jsonb;
  v_new_notifications jsonb;
  v_key text;
  v_val jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));

  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'save_my_preferences', p_op_key,
    clara._hash(jsonb_build_object('actor', c.actor, 'expected_version', p_expected_version, 'patch', p_patch)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ---- validate shape and every key/value BEFORE touching the row ----------
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a jsonb object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'patch_not_object')::text;
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_patch) k where k not in ('interface', 'notifications')
  ) then
    raise exception 'patch may only contain interface/notifications' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'unsupported_top_level_key')::text;
  end if;

  v_patch_interface := coalesce(p_patch->'interface', '{}'::jsonb);
  if jsonb_typeof(v_patch_interface) <> 'object' then
    raise exception 'interface patch must be an object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'interface_not_object')::text;
  end if;

  -- THE SUPPORTED SET, enumerated (no key/value reaches storage that is not
  -- named here — #626's "expose only persisted supported preferences" is a
  -- write-side guarantee, not merely a UI convention):
  --   interface.motion         'system' | 'reduced'
  --   interface.sidebarDefault 'expanded' | 'collapsed'
  -- `reason` IS the field path, not a generic token + a separate `key` — the
  -- web's shared refusal parser (lib/wire.ts's `parseReasonToken`) surfaces
  -- ONLY `detail.reason` to a caller (independent review N2's one-taxonomy
  -- rule; every other detail field, e.g. a separate `key`, is discarded before
  -- it ever reaches a component). Folding the field path INTO `reason` is what
  -- lets `components/settings/account-settings.tsx` focus the exact control a
  -- refusal named, through the SAME mechanism every other door's refusal
  -- already rides, rather than a second, bespoke detail-parsing path.
  for v_key, v_val in select * from jsonb_each(v_patch_interface) loop
    if v_key = 'motion' then
      if (v_val #>> '{}') is distinct from 'system' and (v_val #>> '{}') is distinct from 'reduced' then
        raise exception 'unsupported value for interface.motion' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'interface.motion')::text;
      end if;
    elsif v_key = 'sidebarDefault' then
      if (v_val #>> '{}') is distinct from 'expanded' and (v_val #>> '{}') is distinct from 'collapsed' then
        raise exception 'unsupported value for interface.sidebarDefault' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'interface.sidebarDefault')::text;
      end if;
    else
      raise exception 'unsupported interface preference key' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'interface.' || v_key)::text;
    end if;
  end loop;

  -- notifications: no key is supported yet (see migration header) — any
  -- non-empty patch is refused rather than silently accepted and ignored.
  v_patch_notifications := coalesce(p_patch->'notifications', '{}'::jsonb);
  if jsonb_typeof(v_patch_notifications) <> 'object' then
    raise exception 'notifications patch must be an object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'notifications_not_object')::text;
  end if;
  if v_patch_notifications <> '{}'::jsonb then
    for v_key in select * from jsonb_object_keys(v_patch_notifications) loop
      raise exception 'no notification preferences are supported yet' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'notifications.' || v_key)::text;
    end loop;
  end if;

  -- ---- materialise the row (race-free: ON CONFLICT DO NOTHING never
  --      clobbers a row a concurrent first-save already created), THEN lock
  --      the now-certainly-existing row before checking the version. ---------
  insert into clara.user_preferences(user_id) values (c.actor) on conflict (user_id) do nothing;

  select version, interface, notifications into v_row
    from clara.user_preferences where user_id = c.actor for update;

  if v_row.version <> p_expected_version then
    raise exception 'preferences changed elsewhere' using errcode = 'CLR06',
      detail = jsonb_build_object('reason', 'stale_version', 'current_version', v_row.version)::text;
  end if;

  -- SHALLOW MERGE, not replace — the PATCH contract. A patch touching only
  -- interface.motion cannot clear interface.sidebarDefault, because `||`
  -- overwrites just the keys present on its right-hand side.
  v_new_interface := v_row.interface || v_patch_interface;
  v_new_notifications := v_row.notifications || v_patch_notifications;

  update clara.user_preferences
     set version = version + 1,
         interface = v_new_interface,
         notifications = v_new_notifications,
         updated_at = now()
   where user_id = c.actor
  returning version, interface, notifications, updated_at into v_row;

  return clara._finish_op(c.firm, 'save_my_preferences', p_op_key, jsonb_build_object(
    'version', v_row.version,
    'interface', v_row.interface,
    'notifications', v_row.notifications,
    'updated_at', v_row.updated_at
  ));
end $$;
comment on function clara.save_my_preferences(int, jsonb, text) is
  '#626 D1. PATCH semantics (jsonb || merge), full validation against the enumerated supported '
  'set (CLR10 detail.reason), CLR06 on a stale p_expected_version, op_key replay via '
  '_reserve_op/_finish_op scoped by the caller''s current firm.';

-- ==============================================================================================
-- 4. GRANTS. Human-only; no wake/agent variant exists or is needed.
--
-- MEASURED (0123:2323's own finding, reconfirmed here by the operation-contract census):
-- `set role clara_fn_owner;` before CREATE FUNCTION does NOT reliably inherit 0004:752's
-- `alter default privileges ... revoke execute on functions from public` — a fresh function
-- leaks PUBLIC EXECUTE until an EXPLICIT revoke closes it. Every new function gets the same
-- belt-and-suspenders idiom the rest of this schema uses: revoke, then grant to the one role
-- that should hold it.
-- ==============================================================================================
revoke all on function clara.get_my_preferences() from public;
revoke all on function clara.save_my_preferences(int, jsonb, text) from public;

grant execute on function clara.get_my_preferences() to clara_authenticated;
grant execute on function clara.save_my_preferences(int, jsonb, text) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 5. TAIL POSTCHECK.
-- ==============================================================================================
do $tail$
declare v_n int;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'user_preferences'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception 'user_preferences tail: table is missing or not FORCE ROW LEVEL SECURITY' using errcode = 'CLR10';
  end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'user_preferences';
  if v_n <> 2 then
    raise exception 'user_preferences tail: expected exactly 2 policies (owner + self), found %', v_n
      using errcode = 'CLR10';
  end if;

  -- The pseudo-role reads back as the literal 'PUBLIC' (uppercase) in this view, never
  -- lowercase 'public' — a lowercase comparison here would silently never match and mask
  -- exactly the leak this check exists to catch (confirmed against a live catalog).
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'clara' and routine_name in ('get_my_preferences', 'save_my_preferences')
     and grantee = 'PUBLIC';
  if v_n <> 0 then
    raise exception 'user_preferences tail: PUBLIC holds an EXECUTE grant on a new preferences function'
      using errcode = 'CLR10';
  end if;

  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = 'get_my_preferences' and grantee = 'clara_authenticated';
  if v_n <> 1 then
    raise exception 'user_preferences tail: get_my_preferences is not granted to clara_authenticated' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = 'save_my_preferences' and grantee = 'clara_authenticated';
  if v_n <> 1 then
    raise exception 'user_preferences tail: save_my_preferences is not granted to clara_authenticated' using errcode = 'CLR10';
  end if;

  raise notice 'user_preferences tail: OK -- clara.user_preferences forced-RLS with exactly 2 policies '
    '(clara_fn_owner using(true), clara_authenticated self-select); get_my_preferences/'
    'save_my_preferences both PUBLIC-revoked and clara_authenticated-granted; no wake/agent grant exists.';
end $tail$;
