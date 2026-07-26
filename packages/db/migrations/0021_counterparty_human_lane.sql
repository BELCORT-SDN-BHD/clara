-- Migration 0021 — the HUMAN counterparty lane.
--
-- THE GAP THIS CLOSES, found on the Bee Creative live-gate run (2026-07-26).
--
-- An opening carry-down seeds a payables or receivables position as `ap_open_item` /
-- `ar_open_item`, and both REQUIRE a counterparty_id (0017:3202-3204). But a counterparty
-- can only come into existence inside `clara.approve_entry` (0011:3039), on the
-- `proposed_counterparty->'new'` birth path — i.e. by approving a coded journal entry.
-- There is no standalone verb and no dashboard surface. So at takeover, before any entry
-- exists, a carry-down CANNOT seed opening payables or receivables — the two commonest
-- opening balances a real trading client has.
--
-- It went unnoticed because the only prior Gate-K run (Rome Secretary, 2026-07-24) was a
-- company with no payables: its seed used `equity_net` + `gl_balance` only, so the
-- `ap_open_item` path has never executed in production. Bee Creative is the first client
-- with a real trade creditor at takeover (RM105,000.00 owed to LOST INVENTION SDN BHD
-- across two December 2024 invoices) and hit it immediately.
--
-- The workaround that is NOT acceptable: coding those purchase invoices through the daily
-- loop to mint the counterparty as a side effect. That posts YA2024 purchase entries into
-- the very period the opening balance is being seeded for — the double-counting shape ruled
-- against in WB-R29. The opening lane needs its own door.
--
-- WHAT THIS ADDS. One governed verb, deliberately narrow:
--   clara.create_counterparty(p_client, p_kind, p_name, p_registration_no, p_tin, p_op_key)
-- It mints a counterparty and nothing else. It does not code, resolve, match, merge or
-- touch an entry. Identity resolution stays exactly where it is — the birth path in
-- approve_entry is unchanged, and `_resolve_counterparty` keeps its monopoly on deciding
-- whether an incoming document names an EXISTING party.
--
-- WHY A BOOKKEEPER FLOOR. It is the same floor as `clara.upsert_account` (0004:372): both
-- create reference data that later postings hang off, neither moves money, and both are
-- ordinary setup work. Creating a counterparty authorizes nothing on its own.
--
-- IDEMPOTENCE AND THE RACE. `_reserve_op` gives replay on the same op_key. Independently,
-- the relation's own unique index on (client_id, name_normalized) is the real guard: a
-- concurrent birth through approve_entry's path raises unique_violation, and this verb
-- RETURNS THE EXISTING ROW rather than failing. That is correct for a create-or-get of
-- reference data and it means a bookkeeper cannot accidentally fork a counterparty that
-- the coding lane has just minted from a document.

create function clara.create_counterparty(
    p_client uuid, p_kind text, p_name text,
    p_registration_no text default null, p_tin text default null,
    p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c            record;
  v_dedupe     jsonb;
  v_client_firm uuid;
  v_name       text;
  v_name_n     text;
  v_reg        text;
  v_reg_n      text;
  v_tin        text;
  v_id         uuid;
  v_created    boolean := false;
begin
  -- Same floor as upsert_account: reference data, not money.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'counterparty name is required' using errcode = 'CLR10';
  end if;
  if p_kind is null or p_kind not in ('vendor', 'customer') then
    raise exception 'counterparty kind must be vendor or customer' using errcode = 'CLR10';
  end if;

  -- The client must belong to the caller's firm. Checked explicitly rather than left to
  -- RLS: a cross-firm client id must be an honest refusal, never a silent no-op.
  select firm_id into v_client_firm from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'create_counterparty', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'k', p_kind, 'n', v_name)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Normalisation is byte-identical to the approve_entry birth path (0011:3035-3037), so
  -- a human-created party and a document-born one collide on the SAME unique index rather
  -- than living side by side as near-duplicates.
  v_name_n := lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));
  v_reg    := nullif(btrim(coalesce(p_registration_no, '')), '');
  v_reg_n  := case when v_reg is null then null
                   else lower(regexp_replace(v_reg, '[^a-zA-Z0-9]', '', 'g')) end;
  v_tin    := nullif(btrim(coalesce(p_tin, '')), '');

  begin
    insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized,
        registration_no, registration_normalized, tin, created_by)
      values (c.firm, p_client, p_kind, v_name, v_name_n, v_reg, v_reg_n, v_tin, c.actor)
      returning id into v_id;
    v_created := true;
  exception when unique_violation then
    -- CREATE-OR-GET. The coding lane may have minted this party from a document between
    -- our check and our insert; forking it would be the worse outcome. Return the live row.
    --
    -- The recovery MUST mirror the two partial unique indexes exactly, because they key on
    -- different columns depending on whether a registration number is present:
    --   uq_counterparties_client_registration       (client_id, kind, registration_normalized) WHERE reg IS NOT NULL
    --   uq_counterparties_client_unregistered_name  (client_id, kind, name_normalized)         WHERE reg IS NULL
    -- A name-only lookup would (a) drop `kind`, so the same name legitimately held by a
    -- vendor AND a customer returns the wrong row or raises "more than one row", and
    -- (b) find nothing at all when the collision was on REGISTRATION and the names differ,
    -- reporting a retired-party collision that never happened.
    if v_reg_n is not null then
      select id into v_id from clara.counterparties
       where client_id = p_client and kind = p_kind and registration_normalized = v_reg_n
         and merged_into is null and retired_at is null;
    else
      select id into v_id from clara.counterparties
       where client_id = p_client and kind = p_kind and name_normalized = v_name_n
         and registration_normalized is null
         and merged_into is null and retired_at is null;
    end if;
    -- Neither index predicate excludes a retired or merged row, so such a row still holds
    -- the slot. Finding nothing here therefore means exactly that, and says so.
    if v_id is null then
      raise exception 'counterparty collides with a retired or merged party for this client and kind'
        using errcode = 'CLR10';
    end if;
  end;

  perform clara._audit(c.firm, c.actor, p_client, null, 'create_counterparty', null,
    jsonb_build_object('counterparty_id', v_id, 'name', v_name, 'kind', p_kind,
      'created', v_created, 'op_key', p_op_key));

  return clara._finish_op(c.firm, 'create_counterparty', p_op_key,
    jsonb_build_object('counterparty_id', v_id, 'created', v_created));
end $$;

-- OWNERSHIP FIRST. A SECURITY DEFINER function executes as its OWNER, so the owner IS the
-- authority it lends. Every governed verb in this schema is owned by clara_fn_owner; a verb
-- left owned by the migration role would run with THAT role's rights — which on a managed
-- Supabase project is a far wider set than the governed surface is supposed to lend. The
-- rig's T18 invariant enforces this over every definer in the schema, and it caught this
-- exact omission on the first run.
alter function clara.create_counterparty(uuid, text, text, text, text, text)
  owner to clara_fn_owner;

revoke all on function clara.create_counterparty(uuid, text, text, text, text, text) from public;
grant execute on function clara.create_counterparty(uuid, text, text, text, text, text)
  to clara_authenticated;

-- ---------------------------------------------------------------------------------
-- §TAIL — in-transaction assertions. The apply proves them or rolls back whole.
-- ---------------------------------------------------------------------------------
do $tail$
declare v_acl text; v_cfg text;
begin
  if to_regprocedure('clara.create_counterparty(uuid,text,text,text,text,text)') is null then
    raise exception '0021 tail: create_counterparty is absent at its exact signature';
  end if;

  select coalesce(array_to_string(p.proconfig, ','), '') into v_cfg
    from pg_proc p
   where p.oid = 'clara.create_counterparty(uuid,text,text,text,text,text)'::regprocedure;
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception '0021 tail: create_counterparty has no pinned search_path (%)', v_cfg;
  end if;

  if not (select prosecdef from pg_proc
           where oid = 'clara.create_counterparty(uuid,text,text,text,text,text)'::regprocedure) then
    raise exception '0021 tail: create_counterparty is not SECURITY DEFINER';
  end if;

  -- OWNERSHIP. Added after the first rig run failed T18 with `owner=postgres`: this tail
  -- checked prosecdef, search_path and PUBLIC but NOT the owner, so it had exactly the same
  -- blind spot as the code above it and would have certified a verb that lends the wrong
  -- authority. A definer's owner is the authority it lends; assert it here too, so the
  -- apply itself refuses rather than relying on a battery someone might not run.
  if (select pg_get_userbyid(proowner) from pg_proc
       where oid = 'clara.create_counterparty(uuid,text,text,text,text,text)'::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0021 tail: create_counterparty is not owned by clara_fn_owner';
  end if;

  -- PUBLIC must not hold EXECUTE (the C-1 law: an explicit revoke, verified).
  select coalesce(string_agg(pg_get_userbyid(a.grantee), ','), '') into v_acl
    from pg_proc p, lateral aclexplode(p.proacl) a
   where p.oid = 'clara.create_counterparty(uuid,text,text,text,text,text)'::regprocedure
     and a.grantee = 0;
  if v_acl <> '' then
    raise exception '0021 tail: create_counterparty is EXECUTABLE BY PUBLIC';
  end if;

  -- The runtime lane must NOT gain this verb: minting a counterparty is a human act.
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara.create_counterparty(uuid,text,text,text,text,text)'::regprocedure
                and pg_get_userbyid(a.grantee) in ('clara_runtime','clara_agent_ro',
                                                   'clara_wake_interactive','clara_wake_proactive')) then
    raise exception '0021 tail: create_counterparty is granted to a non-human role';
  end if;

  raise notice '0021: create_counterparty installed — SECURITY DEFINER, search_path pinned, clara_authenticated only';
end
$tail$;
