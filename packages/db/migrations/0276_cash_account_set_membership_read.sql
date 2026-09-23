-- 0276_cash_account_set_membership_read — #1002 (riders wave 3, lane 03): THE SECOND-PASS
-- MEMBERSHIP EDITOR'S OWN READ. One new function, `clara.get_client_cash_account_set_members`,
-- and nothing else. No table, column, trigger, policy or grant on any existing relation moves.
-- =====================================================================================
-- Spec of record: issue #1002's Agent Brief (comment, 2026-09-20), which is also the owner's
-- ruling comment on the ticket -- it OVERTURNS the ticket body's own "wait for the first firm to
-- ask" recommendation: build the second-pass editor now, because the publish door already
-- supersedes the whole set on every call (an editor adds no new destructive power) and the
-- 2026-09-19 release measured zero published sets on hosted (this lands ahead of the first real
-- firm by choice, not by accident).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `clara.get_client_cash_account_set_members(p_client
-- uuid) returns jsonb` -- a STABLE SECURITY INVOKER read, viewer floor, that enumerates the
-- client's CURRENT PUBLISHED cash-account-set version's membership, each member carrying its
-- RECORDED `member_reason`.
--
-- =====================================================================================
-- WHY A NEW READ RATHER THAN WIDENING `propose_client_cash_accounts`.
--
-- `clara.propose_client_cash_accounts` (0232) answers a DIFFERENT question: which accounts
-- COULD be cash, by structure alone (`coa_accounts.is_bank_account`), with an `already_member`
-- flag layered on TOP of that structural population. It therefore cannot, and must not be made
-- to, name a member the human declared cash or petty cash on an account with no bank-registry
-- marker -- that account never enters its candidate population at all, by design (0232's own
-- header: "It PROPOSES; it never publishes", and petty cash has no structural marker in this
-- schema whatsoever, 0121:4749). The ticket's own "Current behavior" names the resulting gap
-- verbatim: "a member a human declared as cash or petty cash is invisible to the list and would
-- have its reason rewritten" if the authoring dialog's own "always bank_registry" submission
-- shape were reused to resubmit it.
--
-- This file's read answers the COMPLEMENTARY question instead: of the accounts that ARE
-- members today, which are they and WHY -- read straight off `cash_account_set_members`, with
-- no structural filter and no bank-registry assumption anywhere in the body. Together, the two
-- reads give a second-pass editor everything it needs: `propose_client_cash_accounts` for the
-- structurally derivable candidates (so a firm can still ADD a bank account that was never a
-- member), and this file's read for the CURRENT membership's own recorded reasons (so a
-- pre-checked box never claims a reason the human never gave it).
--
-- =====================================================================================
-- WHY VIEWER FLOOR, NOT ADMIN. This is a READ, over relations `clara_authenticated` can already
-- SELECT behind their own FORCED, firm-scoped RLS policy (0232:1607-1613 -- firm ONLY, no rank
-- distinction). Flooring this read above viewer would not protect a single fact a viewer cannot
-- already see through the base tables; it would only make the entrance's OWN readiness check
-- (does a published set exist at all, so the entrance can choose which dialog to open) invisible
-- to the same viewer who can already open the first-publish dialog today. The WRITE stays
-- admin-floored exactly as it always has (`publish_client_cash_account_set`, unrecut and
-- untouched by this file): a viewer who opens the second-pass editor and clicks submit is
-- refused there, exactly as a viewer who opens the FIRST-publish dialog is refused there today.
--
-- =====================================================================================
-- NO IS_ACTIVE FILTER, EVER, on this read either -- the same rule 0232 states for the other two:
-- an inactive bank account that still carries a live balance is a legitimate member, and this
-- read must be able to say so (`is_active` travels on the wire) rather than hide it.
--
-- NO AGENT TWIN, NO WAKE WRAPPER, NO ALLOWLIST ROW -- the same posture as all three of 0232's own
-- doors and for the same reason (0232's own header): this is a human-authoring surface over the
-- client's own governed membership, and no model lane is designed to read or act on it.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO.
--   · Recuts NOTHING. `propose_client_cash_accounts`, `publish_client_cash_account_set` and
--     `get_client_financial_pack` are untouched -- pinned in the prestate and re-pinned
--     byte-identical in the tail.
--   · Mints NO table, trigger or policy. The two relations this read selects from
--     (`cash_account_set_versions`, `cash_account_set_members`) already FORCE row-level security
--     and already grant SELECT to `clara_authenticated` (0232); this file adds no new grant to
--     either relation.
--   · Computes NO balance. `propose_client_cash_accounts` already carries a candidate's balance
--     for the accounts it lists; a member with no bank-registry candidacy has never had a
--     balance on any surface this estate ships, and this read does not invent one.
--   · Widens NO refusal vocabulary on the publish door. `effective_from_required` and
--     `effective_from_not_after_current` are unchanged, unrecut, and this file's tail re-pins
--     the publish door byte-identical.
--
-- FRONTEND HOME (apps/web):
--   clara.get_client_cash_account_set_members(...) -> apps/web/lib/dashboard/financial-pack.ts
--                                                   -> apps/web/components/firm/client-home/
--                                                      client-cash-set-dialog.tsx
-- =====================================================================================

do $t1002_pre$
declare
  v_sha text;
  v_missing text;
begin
  -- THE TWO RELATIONS THIS READ SELECTS FROM must already exist with the shape 0232 gave them.
  if to_regclass('clara.cash_account_set_versions') is null
     or to_regclass('clara.cash_account_set_members') is null then
    raise exception '#1002 prestate: the cash-account-set relations are absent (0232 has not applied)'
      using errcode = 'CLR10';
  end if;
  select string_agg(n, ', ') into v_missing from (
    select n from unnest(array[
      'client_id','state','revision','effective_from','member_count'
    ]) as t(n)
     where not exists (select 1 from information_schema.columns
                         where table_schema = 'clara' and table_name = 'cash_account_set_versions'
                           and column_name = t.n)
  ) x;
  if v_missing is not null then
    raise exception '#1002 prestate: clara.cash_account_set_versions is missing column(s): %', v_missing
      using errcode = 'CLR10';
  end if;
  select string_agg(n, ', ') into v_missing from (
    select n from unnest(array[
      'cash_account_set_version_id','account_id','member_reason','ordinal'
    ]) as t(n)
     where not exists (select 1 from information_schema.columns
                         where table_schema = 'clara' and table_name = 'cash_account_set_members'
                           and column_name = t.n)
  ) x;
  if v_missing is not null then
    raise exception '#1002 prestate: clara.cash_account_set_members is missing column(s): %', v_missing
      using errcode = 'CLR10';
  end if;

  -- THE OVERLOAD WALL (0232's own idiom, 0232:308-318): per NAME, so an overload at any
  -- signature is caught, not only the one this file is about to add.
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
              where ns.nspname = 'clara' and p.proname = 'get_client_cash_account_set_members') then
    raise exception '#1002 prestate: clara.get_client_cash_account_set_members already exists'
      using errcode = 'CLR10';
  end if;

  -- THE FIVE PINS. `jwt_sub`/`jwt_firm`/`actor_role_rank`/`role_rank` are the exact inline floor
  -- `propose_client_cash_accounts` (0232) already uses -- this file COPIES that calling
  -- convention rather than sharing a body with it, so a drift in any of the four would silently
  -- diverge the two reads' floors from each other. `propose_client_cash_accounts` itself is
  -- pinned because this file's header argues the two reads are DELIBERATE COMPLEMENTS of one
  -- population; if that body moves, the argument needs re-checking before this one applies.
  --
  -- MEASURED, NEVER TRANSCRIBED (WORK-ORDER rule 8): every sha below is sha256 of the LIVE
  -- `prosrc` read off `pg_proc` on this lane's own database, right now -- not copied from 0232's
  -- creating text, since a live body can be a prosrc splice of a later migration.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.jwt_sub()'::regprocedure;
  if v_sha <> 'c4051473a0619987796d2aa7a64817536ac21d161f0fd827b6912ca8ce1aa243' then
    raise exception '#1002 prestate: clara.jwt_sub has DRIFTED from its measured pre-image (got %) -- this file copies its calling convention from clara.propose_client_cash_accounts and must re-derive it against the live body', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.jwt_firm()'::regprocedure;
  if v_sha <> '43338e8393c961c9f3d06fb0929479cfcc33ff91c67f8575478a790b6fab0a45' then
    raise exception '#1002 prestate: clara.jwt_firm has DRIFTED from its measured pre-image (got %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.actor_role_rank()'::regprocedure;
  if v_sha <> '9b011800f23ff8a774285845902892af53350f58778a967abd69773d91eb699d' then
    raise exception '#1002 prestate: clara.actor_role_rank has DRIFTED from its measured pre-image (got %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.role_rank(text)'::regprocedure;
  if v_sha <> '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f' then
    raise exception '#1002 prestate: clara.role_rank(text) has DRIFTED from its measured pre-image (got %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.propose_client_cash_accounts(uuid)'::regprocedure;
  if v_sha <> 'c2d04e73e08bbb33fd591413fa243d4cda58ab6b4da07fd41c4e9de29012d261' then
    raise exception '#1002 prestate: clara.propose_client_cash_accounts has DRIFTED from its measured pre-image (got %) -- this file''s "two deliberate complements" argument must be re-derived against the live body', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#1002 prestate: clean -- the cash-account-set relations carry the shape this read selects from, clara.get_client_cash_account_set_members does not yet exist at any signature, and the four RLS-helper bodies plus clara.propose_client_cash_accounts are all at their measured (live) bodies.';
end
$t1002_pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- clara.get_client_cash_account_set_members — enumerates the CURRENT PUBLISHED version's
-- membership, each member carrying its RECORDED reason. STABLE SECURITY INVOKER, viewer floor.
-- No published version -> published_version_id: null, members: [] (never a fabricated version).
-- ==============================================================================================
create function clara.get_client_cash_account_set_members(p_client uuid) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp as $$
declare
  c              record;
  v_set_id       uuid;
  v_revision     int;
  v_effective    date;
  v_member_count int;
  v_rows         jsonb;
begin
  -- THE INLINE FLOOR, copied verbatim from clara.propose_client_cash_accounts (0232) rather than
  -- shared with it: an INVOKER body cannot call clara._human_ctx (no application-role EXECUTE
  -- grant on it), so it asks the helpers that ARE granted, exactly as its sibling read does.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('viewer') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_client')::text;
  end if;

  -- THE CURRENT PUBLISHED VERSION, if any. NO EXPLICIT client-firm-membership check: exactly
  -- like its sibling `propose_client_cash_accounts`, this body relies on the FORCED, firm-scoped
  -- RLS policy already on both relations (0232:1607-1613) to make a client naming another firm's
  -- id read as "no published version" rather than as a different, distinguishing refusal -- the
  -- same no-oracle posture `p660.pack.no_oracle` proves for the pack and the proposal read.
  select v.id, v.revision, v.effective_from, v.member_count
    into v_set_id, v_revision, v_effective, v_member_count
    from clara.cash_account_set_versions v
   where v.client_id = p_client and v.state = 'published';

  -- THE MEMBERSHIP, ordered by ordinal (the order publish_client_cash_account_set recorded it
  -- in). NO is_active FILTER, matching 0232's own rule for this whole relation family: an
  -- inactive account that still carries a live balance is a legitimate member, and hiding it
  -- here is how a second-pass editor would silently drop it from a resubmission.
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ordinal), '[]'::jsonb) into v_rows
    from (
      select a.account_id     as account_id,
             a.account_code   as account_code,
             a.name           as name,
             a.is_active      as is_active,
             m.member_reason  as member_reason,
             m.ordinal        as ordinal
        from clara.cash_account_set_members m
        join clara.coa_accounts a on a.account_id = m.account_id
       where m.cash_account_set_version_id = v_set_id
    ) x;

  return jsonb_build_object(
    'published_version_id', v_set_id,
    'revision',             v_revision,
    'effective_from',       v_effective::text,
    'member_count',         v_member_count,
    'members',              v_rows
  );
end $$;

comment on function clara.get_client_cash_account_set_members(uuid) is
  '#1002. Enumerates the client''s CURRENT PUBLISHED cash-account-set version''s membership, each '
  'member carrying its RECORDED member_reason (bank_registry | declared_cash | '
  'declared_petty_cash) -- the fact clara.propose_client_cash_accounts cannot give, since it '
  'lists only structurally derivable bank-registry candidates and flags already_member for those '
  'alone. A client with NO published version returns published_version_id: null, revision: null, '
  'effective_from: null, member_count: null, members: []. STABLE SECURITY INVOKER, viewer floor '
  '(propose_client_cash_accounts'' own floor, copied inline rather than shared), over relations '
  'already RLS-scoped to the caller''s firm. NO is_active filter, matching the rest of this '
  'relation family. It enumerates; it never writes and never infers a reason from a name or a '
  'code. NO agent twin, no wake wrapper, no allowlist row. EXECUTE to clara_authenticated only.';

revoke all on function clara.get_client_cash_account_set_members(uuid) from public;
grant execute on function clara.get_client_cash_account_set_members(uuid) to clara_authenticated;

reset role;

-- ==============================================================================================
-- TAIL POSTCHECK. Every claim is re-READ from the catalog.
-- ==============================================================================================
do $t1002_tail$
declare
  v_n int;
  v_bad text;
  v_sig constant text := 'clara.get_client_cash_account_set_members(uuid)';
  v_sha text;
  v_name text;
begin
  -- (1) EXISTS EXACTLY ONCE, AT EXACTLY THIS SIGNATURE.
  if to_regprocedure(v_sig) is null then
    raise exception '#1002 tail: % is absent', v_sig using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'clara' and p.proname = 'get_client_cash_account_set_members';
  if v_n <> 1 then
    raise exception '#1002 tail: expected exactly one clara.get_client_cash_account_set_members, found % -- this file is not purely additive', v_n
      using errcode = 'CLR10';
  end if;
  if pg_get_function_arguments(v_sig::regprocedure) <> 'p_client uuid' then
    raise exception '#1002 tail: signature is %', pg_get_function_arguments(v_sig::regprocedure)
      using errcode = 'CLR10';
  end if;

  -- (2) POSTURE: owner, SECURITY INVOKER, STABLE, search_path pinned -- the same shape
  -- `propose_client_cash_accounts` carries.
  select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                then 'owned by ' || pg_get_userbyid(p.proowner)
              when p.prosecdef is distinct from false then 'is not SECURITY INVOKER'
              when p.provolatile <> 's' then 'is not STABLE'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%search_path=clara,pg_temp%' then 'search_path is not pinned'
              else null end
    into v_bad from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad is not null then
    raise exception '#1002 tail: % %', v_sig, v_bad using errcode = 'CLR10';
  end if;

  -- (3) THE ACL: PUBLIC has none, clara_authenticated has it, and the ACL is EXACTLY what this
  -- file granted -- no wider than the two entries below.
  if has_function_privilege('public', v_sig::regprocedure, 'execute') then
    raise exception '#1002 tail: PUBLIC still holds EXECUTE on %', v_sig using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
    raise exception '#1002 tail: clara_authenticated cannot execute %', v_sig using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(p.proacl, ' | '), '(null)') into v_bad
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad is distinct from 'clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner' then
    raise exception '#1002 tail: the EXECUTE ACL on % is not exactly what this file granted: %', v_sig, v_bad
      using errcode = 'CLR10';
  end if;
  -- NO MODEL LANE REACHES IT, asserted per role by NAME (0232's own idiom).
  for v_name in select rolname from pg_roles
                 where rolname in ('clara_runtime','clara_agent_ro')
                    or rolname like 'clara\_wake\_%' loop
    if has_function_privilege(v_name, v_sig::regprocedure, 'execute') then
      raise exception '#1002 tail: % holds EXECUTE on % -- this file grants no model lane anything', v_name, v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (4) THE BODY'S OWN RULE, read back from prosrc: no WHERE/AND/OR clause FILTERS on
  -- `is_active` -- it is selected as DATA (the envelope's own `is_active` field), never as a
  -- predicate that would drop a row. A bare substring probe for "is_active" would trip on that
  -- legitimate SELECT-list occurrence (0232's own `propose_client_cash_accounts` carries the
  -- same column for the same reason), so this probe looks for the FILTERING shape specifically.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_bad
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad ~* '(where|and|or)\s+a\.is_active\M' then
    raise exception '#1002 tail: % filters on is_active -- this relation family filters none', v_sig
      using errcode = 'CLR10';
  end if;

  -- (5) THIS FILE RECUTS NOTHING. The four RLS-helper bodies and propose_client_cash_accounts
  -- are byte-identical to their prestate pins, and publish_client_cash_account_set /
  -- get_client_financial_pack / book_today did not move at all (this file never named them in a
  -- CREATE OR REPLACE, so a drift here would mean some OTHER statement in this very file
  -- touched them -- it does not, but the re-pin makes that a checked fact rather than an
  -- inference from "I didn't write a CREATE OR REPLACE for it").
  for v_name, v_sha in select * from (values
    ('clara.jwt_sub()', 'c4051473a0619987796d2aa7a64817536ac21d161f0fd827b6912ca8ce1aa243'),
    ('clara.jwt_firm()', '43338e8393c961c9f3d06fb0929479cfcc33ff91c67f8575478a790b6fab0a45'),
    ('clara.actor_role_rank()', '9b011800f23ff8a774285845902892af53350f58778a967abd69773d91eb699d'),
    ('clara.role_rank(text)', '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'),
    ('clara.propose_client_cash_accounts(uuid)', 'c2d04e73e08bbb33fd591413fa243d4cda58ab6b4da07fd41c4e9de29012d261')
  ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_bad
      from pg_proc p where p.oid = v_name::regprocedure;
    if v_bad is distinct from v_sha then
      raise exception '#1002 tail: % MOVED while this file applied -- it must not have (got %)', v_name, v_bad
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1002 tail: OK -- clara.get_client_cash_account_set_members exists exactly once at the expected signature, owned by clara_fn_owner, SECURITY INVOKER, STABLE, search_path pinned, granted to clara_authenticated alone with no PUBLIC entry and no model-lane reach, carries no is_active predicate, and the five neighbour bodies this file relies on did not move.';
end
$t1002_tail$;
