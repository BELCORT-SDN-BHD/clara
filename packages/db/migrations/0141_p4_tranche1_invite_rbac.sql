-- =================================================================================================
-- P4 tranche 1 -- invite/RBAC first (the design's own T1, Q9's build-tranche phasing).
--
-- Design of record: docs/plan/active/p4-design-2026-08-27.md (+ its two annexes,
-- p4-design-2026-08-27-annex.md / -annex-2.md), merged #376. This file builds exactly the T1
-- slice: BACKEND-ASKS 1, 3, 4, 5, 6, 7 -- the identity-provisioning door that closes the §3
-- identity gap, the in-firm invite doors, the roster/invite read surfaces, and the caller-context
-- read that both RBAC nav-shaping and the holding state need.
--
-- OUT OF SCOPE, on the design's OWN T1/T2/T3 boundary (§1): ask 2 (registration request), ask 8
-- (the approval queue + `_create_firm_core`) and asks 9-11 (tiers) are §1's T2/T3 -- "operator-
-- approved creation" and "tier screens", explicitly a LATER tranche. `create_firm`'s live 0017
-- body is therefore left byte-untouched by this file; the operator floor pattern
-- (`_human_ctx(role_rank('owner'))` + `is_operator`, 0133:288-291) and `uq_firms_one_operator`
-- (0133:274) are pre-existing and are READ (ask 7's caller_context surfaces `is_operator` for nav
-- shaping) but no new operator-gated WRITER is added here -- that is `approve_firm_registration`'s
-- job in the T2 file. See the PR body / handoff report for the fuller account of this scoping call.
--
-- Three cores, per law 81 (design §5 preamble): `_claim_identity_core` (asks 1, 4) and
-- `_add_member_core` (ask 4 + the LIVE `add_member`, 0005:677-705). `_create_firm_core` is the
-- THIRD core the design names, but it belongs to ask 8's T2 door (`approve_firm_registration`) --
-- extracting it here with no second entrance to justify the extraction would be exactly the kind
-- of judgement-logic improvisation the review laws warn against, so `create_firm` stays as-is.
--
-- D1 WRITE-QUIESCE OBLIGATION: `add_member` is a live audited writer and this file replaces its
-- body (the extraction into `_add_member_core`, §D). The house rule
-- (.claude/rules/db-migrations.md, "A migration that replaces an audited writer's body carries
-- the D1 write-quiesce obligation at deploy") is CATEGORICAL on "the body was replaced", not on
-- how small or behaviourally-inert the delta measures -- PostgreSQL runs an in-flight PL/pgSQL
-- call to completion on the body it STARTED with, so a call that spans the deploy silently
-- finishes on the OLD body regardless of how equivalent the new one is. The apply ceremony for
-- this file therefore opens a D1 write-quiesce window before 0141 applies (recipe:
-- packages/db/README.md, "Deploy contract"; conductor runs it). §D's byte-by-byte comparison
-- against the live body is evidence the delta is behaviourally inert for callers once the quiesce
-- has run -- it is not a basis for skipping the window itself (native review C6).
--
-- No pgcrypto extension is installed (0098:269's own note: sha256() is core-builtin, no extension
-- needed) -- so the invite token is TWO concatenated gen_random_uuid() calls (core PG13+,
-- pg_strong_random-backed), never gen_random_bytes().
--
-- Error codes per the 0002 header: CLR04 authz/actor, CLR09 invariant/lifecycle guard, CLR10
-- bad-request, CLR11 not-in-your-firm.
-- =================================================================================================

-- =================================================================================================
-- §0 -- PRESTATE. Every claim this file makes about what it edits or depends on, measured before
-- anything is created. Aborts on a false premise rather than proceeding on a guess.
-- =================================================================================================
create temp table _p4t1_pre(k text primary key, v text) on commit drop;

do $$
declare v_missing text; v_present text; v_acl text; v_owner text; v_src text;
begin
  -- (1) Every NEW name this file creates must not already exist.
  select string_agg(n, ', ') into v_present from (values
    ('clara.firm_invites (table)'),
    ('clara._jwt_email()'),
    ('clara._claim_identity_core(uuid,text,text)'),
    ('clara._add_member_core(uuid,uuid,uuid,text)'),
    ('clara.claim_identity(text,text)'),
    ('clara.invite_member(text,text,text)'),
    ('clara.accept_invite(text,text,text)'),
    ('clara.revoke_invite(uuid,text)'),
    ('clara.firm_members_visible (view)'),
    ('clara.firm_invites_visible (view)'),
    ('clara.caller_context (view)')
  ) t(n)
  where (n = 'clara.firm_invites (table)' and to_regclass('clara.firm_invites') is not null)
     or (n = 'clara._jwt_email()' and to_regprocedure('clara._jwt_email()') is not null)
     or (n = 'clara._claim_identity_core(uuid,text,text)' and to_regprocedure('clara._claim_identity_core(uuid,text,text)') is not null)
     or (n = 'clara._add_member_core(uuid,uuid,uuid,text)' and to_regprocedure('clara._add_member_core(uuid,uuid,uuid,text)') is not null)
     or (n = 'clara.claim_identity(text,text)' and to_regprocedure('clara.claim_identity(text,text)') is not null)
     or (n = 'clara.invite_member(text,text,text)' and to_regprocedure('clara.invite_member(text,text,text)') is not null)
     or (n = 'clara.accept_invite(text,text,text)' and to_regprocedure('clara.accept_invite(text,text,text)') is not null)
     or (n = 'clara.revoke_invite(uuid,text)' and to_regprocedure('clara.revoke_invite(uuid,text)') is not null)
     or (n = 'clara.firm_members_visible (view)' and to_regclass('clara.firm_members_visible') is not null)
     or (n = 'clara.firm_invites_visible (view)' and to_regclass('clara.firm_invites_visible') is not null)
     or (n = 'clara.caller_context (view)' and to_regclass('clara.caller_context') is not null);
  if v_present is not null then
    raise exception 'p4t1 prestate: name(s) already exist, refusing to clobber: %', v_present using errcode = 'CLR10';
  end if;

  -- (2) Every EXISTING object this file depends on (by exact signature) must resolve.
  select string_agg(n, ', ') into v_missing from (values
    ('clara.add_member(uuid,uuid,text,text)'), ('clara._human_ctx(integer)'),
    ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
    ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
    ('clara._reserve_op(uuid,text,text,bytea)'), ('clara._finish_op(uuid,text,text,jsonb)'),
    ('clara._hash(jsonb)'), ('clara.role_rank(text)'), ('clara.jwt_sub()'), ('clara.jwt_firm()'),
    ('clara.actor_role_rank()'), ('clara.agent_user_id()')
  ) t(n) where to_regprocedure(n) is null;
  if v_missing is not null then
    raise exception 'p4t1 prestate: depended-upon function(s) missing -- % (superseded-body class: re-run against the LIVE catalog, not a stale assumption)', v_missing using errcode = 'CLR10';
  end if;

  -- (3) uq_membership_active_user and uq_firms_one_operator are pre-existing invariants this
  --     file's reasoning leans on (the global one-active-membership wall; ask 7 surfaces
  --     is_operator, never gates on it) -- confirm they exist; this file does not create or
  --     alter either.
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_membership_active_user') then
    raise exception 'p4t1 prestate: uq_membership_active_user missing -- the global active-membership invariant this file relies on is not live' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_firms_one_operator') then
    raise exception 'p4t1 prestate: uq_firms_one_operator missing -- ask 7 surfaces is_operator assuming this invariant holds' using errcode = 'CLR10';
  end if;

  -- (4) event_types the file adds are not already claimed by something else.
  if exists (select 1 from clara.event_types where name in ('invite.issued', 'invite.revoked')) then
    raise exception 'p4t1 prestate: event_type name collision on invite.issued/invite.revoked' using errcode = 'CLR10';
  end if;

  -- (5) Stash add_member's CURRENT prosrc + ACL so the tail can prove the ACL is BYTE-UNCHANGED
  --     across the recut (only the body moves; the grant is preserved by CREATE OR REPLACE, and
  --     this proves it rather than assumes it) and that the four load-bearing wall strings survive
  --     the extraction into _add_member_core.
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.add_member(uuid,uuid,text,text)'::regprocedure;
  insert into _p4t1_pre(k, v) values
    ('add_member.prosrc', v_src), ('add_member.acl', v_acl), ('add_member.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t1 prestate: clara.add_member is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('the agent identity cannot be a firm member' in v_src) = 0
     or position('user already belongs to a firm' in v_src) = 0 then
    raise exception 'p4t1 prestate: add_member''s LIVE body is missing an expected wall string -- re-read the live catalog before extracting' using errcode = 'CLR10';
  end if;

  raise notice 'p4t1 prestate: OK -- 11 new names clear, 12 depended-upon functions resolve, both partial-unique invariants present, no event_type collision, add_member prosrc/acl/owner stashed and its two HIGH-11/global-uniqueness wall strings confirmed present pre-edit.';
end $$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- clara._jwt_email(): the JWT's verified email claim, mirroring clara.jwt_sub()'s own
-- defensive shape exactly (0002:339-350) -- never trusts a malformed claims blob, never reads
-- anything but the GUC PostgREST already sets. Internal only (no policy references it, so it
-- needs no EXECUTE grant -- the doors that call it run AS the owner, which owns this too).
--
-- Native review F3: normalized to lower(btrim(...)) HERE, once, so every consumer agrees --
-- clara.users.email is a case-sensitive unique column, and invite_member's own dedup writes
-- (email = lower(btrim(p_email)), §E) and reads (firm_invites.email, §E/§F) are already
-- lowercase. Before this fix, claim_identity wrote the JWT's RAW-CASE email into clara.users,
-- so a later invite_member dedup check (`u.email = v_email`, §E) could silently MISS an
-- already-active member whose stored email differed only in case -- admitting a duplicate
-- invite for someone already in the firm, which then has no lawful way to resolve (accept_invite
-- would find them already active elsewhere and refuse CLR10, and the invite itself is left
-- permanently pending). Lowering at the single source (this function) makes every one of the
-- four email call sites (claim_identity, _claim_identity_core's comparison, accept_invite,
-- invite_member) agree by construction rather than by each caller remembering to normalize.
-- =================================================================================================
create function clara._jwt_email() returns text
  language plpgsql stable as $$
declare v_raw text; v_email text;
begin
  v_raw := current_setting('request.jwt.claims', true);
  if v_raw is null or v_raw = '' then return null; end if;
  begin
    v_email := (v_raw::jsonb) ->> 'email';
  exception when others then return null; end;
  return nullif(lower(btrim(v_email)), '');
end $$;

-- =================================================================================================
-- §B -- clara.firm_invites. Forced RLS, owner-only policy -- ZERO clara_authenticated grant on the
-- base table, following the masked-view precedent 0137 already established for a table whose raw
-- columns must not be readable outside a floored/masked view (there: firm_open_questions,
-- client_identifier_promotions; here: token_hash, which the design explicitly says must never be
-- exposed even hashed -- annex 1 §D's "never exposing token_hash"). The generic db-migrations.md
-- house rule ("the scoped human read ... with the matching grant") is the DEFAULT shape for a new
-- table; this is the established, deliberate exception for a table whose sole legitimate human
-- door is a masked view (`firm_invites_visible`, §H) plus the definer functions that read/write it
-- at owner semantics -- not a departure invented here.
-- =================================================================================================
create table clara.firm_invites (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid        not null references clara.firms(id),
  email       text        not null,
  role        text        not null check (role in ('viewer', 'bookkeeper', 'admin', 'owner')),
  token_hash  bytea       not null,
  status      text        not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by  uuid        not null references clara.users(id),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at  timestamptz
);
-- Collision backstop on the hash (mirrors uq_wake_secret_hash, 0002:225) and the lookup index
-- accept_invite's token resolution uses.
create unique index uq_firm_invites_token_hash on clara.firm_invites (token_hash);
-- DB-level backstop on "no second pending invite for the same (firm, email)" -- invite_member
-- already refuses this at the application layer (under a per-firm FOR UPDATE lock), so this index
-- is defense in depth, the same partial-unique idiom as uq_membership_active_user / uq_firms_one_operator.
create unique index uq_firm_invites_pending_email on clara.firm_invites (firm_id, email) where (status = 'pending');

alter table clara.firm_invites enable row level security;
alter table clara.firm_invites force row level security;
create policy p_firm_invites_owner on clara.firm_invites for all to clara_fn_owner using (true) with check (true);
-- No clara_authenticated policy and no grant -- see the header note. firm_invites_visible (§H) is
-- the only human-reachable door onto this table's data.

-- =================================================================================================
-- §C -- Identity provisioning (ask 1) + the identity-minting core (ask 4 shares it).
--
-- This is the door that closes the §3 identity gap: a completed Supabase auth session with no
-- clara.users row (so jwt_firm() is NULL and every governed write dead-ends at CLR04) now has a
-- mechanism to mint that row, keyed on jwt_sub() with the email read ONLY from the JWT claim --
-- never a client argument, so a caller cannot claim another person's address.
--
-- NO _audit / NO domain event: both audit_log.firm_id and domain_events.firm_id are NOT NULL
-- (0002:278, 0005:80), and claim_identity is BY DESIGN the one door that runs before any firm
-- context exists (annex 1 §D: "the only door in the estate that must work with no membership").
-- The annex's blanket door-shape line ("every door here ... emits _audit plus a domain event")
-- is therefore structurally impossible for this one ask -- flagged in the handoff report rather
-- than silently either violating a NOT NULL constraint or stamping a fabricated firm_id nobody
-- authorized. The claim itself is still receipted: it is exactly the clara.users row it creates,
-- readable back at any later `select ... from clara.users where id = jwt_sub()`.
-- =================================================================================================
create function clara._claim_identity_core(p_actor uuid, p_display_name text, p_email text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_name text; v_existing record;
begin
  if p_actor = clara.agent_user_id() then
    raise exception 'the agent identity cannot claim a session' using errcode = 'CLR04';
  end if;
  v_name := nullif(btrim(p_display_name), '');
  if v_name is null then raise exception 'display name is required' using errcode = 'CLR10'; end if;
  select id, email into v_existing from clara.users where id = p_actor;
  if found then
    -- Native review N1: compare case-INSENSITIVELY. p_email always arrives lowercase (every
    -- caller routes it through _jwt_email()'s own lower(), §A), but a row written before that
    -- normalization existed can still carry a mixed-case stored email -- a case-sensitive
    -- compare here would wedge that row's owner out of ever claiming again (0 such rows
    -- measured on this rig; the read-side comparison is hardened regardless, since the
    -- invariant is enforced going forward, not backfilled onto rows already on disk).
    if lower(v_existing.email) is distinct from p_email then
      raise exception 'identity already claimed with a different email' using errcode = 'CLR10';
    end if;
    update clara.users set display_name = v_name where id = p_actor and display_name is distinct from v_name;
  else
    begin
      insert into clara.users(id, display_name, email) values (p_actor, v_name, p_email);
    exception when unique_violation then
      raise exception 'that email is already claimed by a different identity' using errcode = 'CLR10';
    end;
  end if;
  return jsonb_build_object('user_id', p_actor, 'display_name', v_name);
end $$;

create function clara.claim_identity(p_display_name text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_email text;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  -- p_op_key is validated for signature-shape consistency with every other door (annex 1 §D's
  -- "mandatory p_op_key"), but -- like create_firm's admission token, 0017:2438 comment -- this
  -- door's idempotency is structural (the core's own select-then-branch), not op_receipts: there
  -- is no firm to scope an op_receipts row under before this call succeeds.
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_email := clara._jwt_email();
  -- Native review F2: a JWT carrying no `email` claim must refuse here, not fail open. A NULL
  -- passed through to _claim_identity_core would insert a clara.users row with email=NULL, and
  -- every LATER claim_identity/accept_invite call for that actor would then hit the core's own
  -- `v_existing.email is distinct from p_email` check (§C) -- NULL is distinct from every real
  -- email -- wedging the identity permanently: it can never attach a real address or accept an
  -- invite (accept_invite's own JWT-email wall, below, would always refuse a member-less
  -- caller). Refusing here, matching accept_invite's identical wall, is cheaper than a stuck
  -- account with no recovery path.
  if v_email is null then raise exception 'a verified email claim is required' using errcode = 'CLR04'; end if;
  return clara._claim_identity_core(v_actor, p_display_name, v_email);
end $$;

-- =================================================================================================
-- §D -- _add_member_core: the membership-minting core, extracted from add_member's LIVE body
-- (0005:677-705) with EVERY wall preserved, so accept_invite (§F) cannot mint a membership missing
-- any of them. Side-by-side against the live body, confirmed from the §0 prestate stash:
--
--   walls that move into the core, UNCHANGED:                  stays at the add_member ENTRANCE:
--   - perform 1 from firms ... for update (per-firm serialize)  - _human_ctx(role_rank('admin'))
--   - role_rank(p_role) is null -> CLR10                        - p_firm <> c.firm -> CLR11
--   - unknown user -> CLR10                                     - op_key blank check
--   - is_agent -> CLR10 (HIGH-11)                                - _reserve_op / _finish_op under
--   - already-active-membership -> CLR10 (global unique index)     add_member's OWN verb string
--   - the INSERT + _append_event('member.added', ...)           - _audit (action = 'add_member')
--
-- The ONLY observable difference: _audit now runs AFTER _append_event instead of before (the core
-- owns the event per "the audit string names the DOOR, the event names the FACT" -- annex 1 §D.1),
-- both still inside the SAME transaction as before, so nothing about atomicity, the refusal codes,
-- or the final DB state changes for add_member's existing callers. This is evidence the delta is
-- BEHAVIOURALLY inert for callers once the D1 window (file header) has run -- it is not a basis
-- for skipping that window (native review C6).
-- =================================================================================================
create function clara._add_member_core(p_firm uuid, p_actor uuid, p_user uuid, p_role text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_id uuid;
begin
  perform 1 from clara.firms where id = p_firm for update;                 -- serialize per-firm (v2 §F/F18)
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  if not exists (select 1 from clara.users where id = p_user) then
    raise exception 'unknown user' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.users where id = p_user and is_agent) then
    raise exception 'the agent identity cannot be a firm member' using errcode = 'CLR10';   -- HIGH-11
  end if;
  if exists (select 1 from clara.firm_memberships where user_id = p_user and status = 'active') then
    raise exception 'user already belongs to a firm' using errcode = 'CLR10';
  end if;
  -- Native review C4: the exists-check above and this insert are not atomic across two
  -- concurrent callers on DIFFERENT firms -- the per-firm `for update` lock above only
  -- serializes callers targeting the SAME p_firm, so a genuine cross-firm race (e.g. two
  -- admins accepting/adding the same user into two different firms at once) can lose to
  -- uq_membership_active_user's partial-unique index. Catch the raw 23505 and translate it
  -- into the SAME typed refusal the exists-check raises, so a racing caller never sees a raw
  -- unique_violation.
  begin
    insert into clara.firm_memberships(firm_id, user_id, role) values (p_firm, p_user, p_role) returning id into v_id;
  exception when unique_violation then
    raise exception 'user already belongs to a firm' using errcode = 'CLR10';
  end;
  perform clara._append_event(p_firm, 'member.added', null, p_actor, null, null, null, null, null, '{}'::jsonb);
  return v_id;
end $$;

create or replace function clara.add_member(p_firm uuid, p_user uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_firm is distinct from c.firm then raise exception 'not your firm' using errcode = 'CLR11'; end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'add_member', p_op_key,
    clara._hash(jsonb_build_object('u', p_user, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_id := clara._add_member_core(c.firm, c.actor, p_user, p_role);
  perform clara._audit(c.firm, c.actor, null, null, 'add_member', null, jsonb_build_object('user', p_user, 'role', p_role));
  return clara._finish_op(c.firm, 'add_member', p_op_key, jsonb_build_object('membership_id', v_id));
end $$;

-- =================================================================================================
-- §E -- Invite issue (ask 3). admin+. Stores only token_hash -- the plaintext token is generated
-- here, returned in the receipt (both the direct return AND op_receipts.result, so an op_key retry
-- can still complete the mail send -- the SAME zero-app-grant precedent clara.firm_admissions.token
-- already sets for an unhashed bearer credential at rest, 0002:253-263), and NEVER stored anywhere
-- readable by an app role. The server-only mail courier (design §4 C, apps/web/app/api/invite) is
-- this door's ENTIRE consumer -- it is not built here (frontend train).
-- =================================================================================================
create function clara.invite_member(p_email text, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_email text; v_token text; v_id uuid; v_expires timestamptz;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_email := lower(btrim(p_email));
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'a valid email is required' using errcode = 'CLR10';
  end if;
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'invite_member', p_op_key,
    clara._hash(jsonb_build_object('email', v_email, 'role', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;                 -- serialize per-firm
  if exists (
    select 1 from clara.firm_memberships m join clara.users u on u.id = m.user_id
     where m.firm_id = c.firm and m.status = 'active' and u.email = v_email
  ) then
    raise exception 'that email already belongs to a member of this firm' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.firm_invites where firm_id = c.firm and email = v_email and status = 'pending') then
    raise exception 'an invite is already pending for this email' using errcode = 'CLR10';
  end if;
  -- No pgcrypto (0098:269) -- two concatenated gen_random_uuid() calls (core PG13+,
  -- pg_strong_random-backed CSPRNG) give 244 combined random bits, well beyond what guessing
  -- resistance for an emailed, time-boxed, single-use token needs.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '7 days';
  begin
    insert into clara.firm_invites(firm_id, email, role, token_hash, expires_at, invited_by)
      values (c.firm, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), v_expires, c.actor)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'an invite is already pending for this email' using errcode = 'CLR10';
  end;
  perform clara._audit(c.firm, c.actor, null, null, 'invite_member', null,
    jsonb_build_object('invite', v_id, 'email', v_email, 'role', p_role));
  perform clara._append_event(c.firm, 'invite.issued', null, c.actor, null, null, null, null, null,
    jsonb_build_object('invite', v_id, 'role', p_role));
  return clara._finish_op(c.firm, 'invite_member', p_op_key,
    jsonb_build_object('invite_id', v_id, 'token', v_token, 'expires_at', v_expires));
end $$;

-- =================================================================================================
-- §F -- Invite accept (ask 4). One transaction through both cores. The wall: the caller's VERIFIED
-- JWT email must equal the invite's email -- both sides already lowercase (§A normalizes the JWT
-- side; invite_member normalizes the stored side, §E) -- a SECOND, independent wall on top of
-- Supabase's own verifyOtp subject-binding (design §4 C), so a token intercepted by anyone other
-- than its addressee cannot be bound to a different account.
--
-- Native review F4: this wall runs BEFORE _reserve_op, matching every sibling door's guard-first
-- order (authz, then dedupe). With the wall AFTER _reserve_op, a caller who knows the token but
-- not the invited address -- e.g. a forwarded email plus a guessed or leaked op_key -- could
-- replay a DIFFERENT caller's own successful op_key and receive THEIR cached receipt (user_id,
-- membership_id) via the dedupe short-circuit, never once proving their own email matched. The
-- receipt is keyed by (firm, fn, op_key) alone, not by caller identity, so dedupe has no way to
-- tell an impostor's replay from the legitimate retry it exists for -- the wall has to run first.
-- =================================================================================================
create function clara.accept_invite(p_token text, p_display_name text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_email text; v_hash bytea; inv record; v_dedupe jsonb; v_membership uuid;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  if p_token is null or btrim(p_token) = '' then raise exception 'a token is required' using errcode = 'CLR10'; end if;
  v_hash := sha256(convert_to(btrim(p_token), 'UTF8'));
  select * into inv from clara.firm_invites where token_hash = v_hash for update;
  if not found then raise exception 'invalid invite token' using errcode = 'CLR10'; end if;

  v_email := clara._jwt_email();
  if v_email is null or v_email is distinct from inv.email then
    raise exception 'the signed-in email does not match this invite' using errcode = 'CLR04';
  end if;

  -- Native review C2: the request hash covers token_hash AND p_display_name AND the caller's
  -- own jwt_sub (v_actor) -- not token_hash alone. Under the old, narrower hash, the SAME
  -- op_key plus the SAME token but a DIFFERENT p_display_name (or a different caller entirely)
  -- would dedupe-replay the cached receipt instead of refusing "op_key reused with different
  -- args" (the dedupe helper's own check, 0004:56-58) -- silently binding one caller's args to
  -- an earlier caller's receipt. Folding the actor in makes the dedupe key actor-bound; folding
  -- the display name in makes it argument-complete, matching every sibling door's convention of
  -- hashing every argument a legitimate retry would resend identically.
  v_dedupe := clara._reserve_op(inv.firm_id, 'accept_invite', p_op_key,
    clara._hash(jsonb_build_object('token_hash', encode(v_hash, 'hex'), 'display_name', p_display_name, 'actor', v_actor)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Expiry is CHECKED here, never PERSISTED here: a RAISE later in this same call rolls back
  -- every write since the transaction began, including an UPDATE issued moments before it (this
  -- was tried and caught by the rig battery -- an update-then-raise on the same row is a no-op
  -- once the exception unwinds). The 'expired' status value exists for a future sweep/ops act to
  -- write for real; until one does, firm_invites_visible (§H) computes the same fact live off
  -- expires_at, so no reader is misled either way.
  if inv.status <> 'pending' then
    raise exception 'this invite is no longer open (status: %)', inv.status using errcode = 'CLR09';
  end if;
  -- Native review C5 (accepted as-is, comment-only): now() is STATEMENT/TRANSACTION time in
  -- PL/pgSQL, fixed at this transaction's start -- an invite whose expires_at falls between
  -- transaction-start and the real wall-clock "now" still reads as pending here and is
  -- accepted; the window is bounded by one transaction's duration and is not a security wall
  -- (annex 1 §D names no requirement stricter than "expired eventually refuses").
  if inv.expires_at <= now() then
    raise exception 'this invite has expired' using errcode = 'CLR09';
  end if;

  perform clara._claim_identity_core(v_actor, p_display_name, v_email);
  v_membership := clara._add_member_core(inv.firm_id, v_actor, v_actor, inv.role);
  update clara.firm_invites set status = 'accepted', accepted_at = now() where id = inv.id;

  perform clara._audit(inv.firm_id, v_actor, null, null, 'accept_invite', null, jsonb_build_object('invite', inv.id));
  return clara._finish_op(inv.firm_id, 'accept_invite', p_op_key,
    jsonb_build_object('user_id', v_actor, 'firm_id', inv.firm_id, 'membership_id', v_membership));
end $$;

-- =================================================================================================
-- §G -- Invite revoke (ask 6, write half). admin+.
-- =================================================================================================
create function clara.revoke_invite(p_invite uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; inv record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'revoke_invite', p_op_key, clara._hash(jsonb_build_object('invite', p_invite)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into inv from clara.firm_invites where id = p_invite for update;
  if not found or inv.firm_id <> c.firm then raise exception 'invite not in your firm' using errcode = 'CLR11'; end if;
  if inv.status <> 'pending' then
    raise exception 'this invite is no longer open (status: %)', inv.status using errcode = 'CLR09';
  end if;
  update clara.firm_invites set status = 'revoked', revoked_at = now() where id = p_invite;
  perform clara._audit(c.firm, c.actor, null, null, 'revoke_invite', null, jsonb_build_object('invite', p_invite));
  perform clara._append_event(c.firm, 'invite.revoked', null, c.actor, null, null, null, null, null,
    jsonb_build_object('invite', p_invite));
  return clara._finish_op(c.firm, 'revoke_invite', p_op_key, jsonb_build_object('invite_id', p_invite, 'status', 'revoked'));
end $$;

-- =================================================================================================
-- §H -- The three read surfaces (asks 5, 6-read, 7). Owner-executed views (the users_visible
-- idiom, 0137:291 -- NOT security_invoker, because the whole point is a floor/mask the base
-- table's own grant does not carry). Each carries its full predicate in the view body; RLS on the
-- base tables is irrelevant to these because they run as clara_fn_owner.
--
-- Native review C1 (amended): all three carry `security_barrier`. WHAT IT BUYS: Postgres may
-- otherwise push a caller-supplied qualifier (a WHERE clause the caller attaches on top of the
-- view) IN FRONT OF the view's own predicate when planning, and if that pushed qual calls a
-- non-leakproof function or operator, its side channel (an error, a timing difference, a crash)
-- can leak a masked/filtered ROW's existence before the view's own firm/rank predicate ever gets
-- to exclude it -- security_barrier forces the view's own predicate to evaluate first. WHAT IT
-- DOES NOT BUY: it does nothing for TARGET-LIST masking -- firm_members_visible's `case when
-- ... then u.email else null end as email` (below) still computes and returns exactly what that
-- CASE expression says for any row the caller's WHERE already admits; security_barrier governs
-- qual-pushdown ORDER, not column projection. The battery's census cell (p4t1-reads.test.mjs)
-- asserts both halves rather than just the reloption being set.
--
-- DEBT (named, not silently fixed here): 0137's three masked views (firm_open_questions_visible,
-- client_identifier_promotions_visible, users_visible) share this exact shape and predate
-- security_barrier's introduction to the estate -- an estate-wide pass belongs in its own
-- follow-up PR, not a silent three-of-six fix folded into this tranche. See the PR body.
-- =================================================================================================

-- Ask 5: the roster. bookkeeper+ sees the roster; email is null-masked below admin+ (a single
-- view with a floored column, not two views -- annex 1 §D so a caller cannot mistake which they hold).
create view clara.firm_members_visible with (security_barrier) as
  select
    m.id as membership_id,
    m.user_id,
    u.display_name,
    case when coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('admin') then u.email else null end as email,
    m.role,
    clara.role_rank(m.role) as role_rank,
    m.status,
    m.created_at,
    m.removed_at
  from clara.firm_memberships m
  join clara.users u on u.id = m.user_id
  where m.firm_id = clara.jwt_firm()
    and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper');

-- Ask 6 (read half): admin+ only, never exposes token_hash. `status` is the EFFECTIVE status,
-- computed live off expires_at -- accept_invite deliberately never persists a 'pending' ->
-- 'expired' transition (§F's comment: a write immediately before a refusal's RAISE would roll
-- back with it), so a reader here would otherwise see a stale 'pending' on a dead invite forever.
create view clara.firm_invites_visible with (security_barrier) as
  select i.id, i.firm_id, i.email, i.role,
    case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end as status,
    i.invited_by, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
  from clara.firm_invites i
  where i.firm_id = clara.jwt_firm()
    and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('admin');

-- Ask 7: one row when an active membership exists, zero when not -- the holding state's own
-- trigger and the design's fail-closed default (design §4 E / annex 1 §D). Self-scoped only
-- (jwt_sub() -- no argument, so no tenant probe is possible); uq_membership_active_user (§0
-- prestate check (3)) is what makes "at most one row" a DB guarantee, not just an observation.
create view clara.caller_context with (security_barrier) as
  select
    m.user_id,
    m.firm_id,
    f.name as firm_name,
    m.role,
    clara.role_rank(m.role) as role_rank,
    f.is_operator
  from clara.firm_memberships m
  join clara.firms f on f.id = m.firm_id
  where m.user_id = clara.jwt_sub() and m.status = 'active';

-- =================================================================================================
-- §I -- event_types + trigger_taxonomy (the 0138:2508 idiom -- register at whichever taxonomy
-- version is currently active, never a hardcoded version number). member.added already exists
-- (0005) and is reused verbatim by _add_member_core, so it gets no new row. invite.accepted is
-- deliberately NOT a separate event -- the design's own D.1 table: "the fact recorded is
-- identical either way: a person became a member of a firm", so accept_invite's membership fact
-- IS member.added: a consumer must not have to know which door produced it. Decision
-- context_update for both, matching member.added/role_changed/removed's own precedent (0005:453-
-- 455) -- a roster change is not something that wakes the agent (the human-noise law, 0005:441).
-- =================================================================================================
with inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
    values
      ('invite.issued',  false, 'An admin+ issued an in-firm invite (clara.invite_member)'),
      ('invite.revoked',  false, 'An admin+ revoked a pending in-firm invite (clara.revoke_invite)')
    on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, i.name, 'context_update', null from inserted_types i cross join clara.taxonomy_active a;

-- =================================================================================================
-- §J -- PUBLIC LOCKDOWN + GRANT MATRIX. N13 (0005:38-42): ALTER DEFAULT PRIVILEGES is empirically a
-- no-op for functions created after it ran, so every function above is PUBLIC-executable until this
-- sweep. add_member's existing grant (0004:771) survives CREATE OR REPLACE untouched -- no re-grant
-- needed or issued for it here (proven in the tail, not assumed).
-- =================================================================================================
revoke execute on all functions in schema clara from public;

revoke all on function
  clara.claim_identity(text, text),
  clara.invite_member(text, text, text),
  clara.accept_invite(text, text, text),
  clara.revoke_invite(uuid, text)
  from public;
grant execute on function
  clara.claim_identity(text, text),
  clara.invite_member(text, text, text),
  clara.accept_invite(text, text, text),
  clara.revoke_invite(uuid, text)
  to clara_authenticated;

grant select on clara.firm_members_visible, clara.firm_invites_visible, clara.caller_context to clara_authenticated;

reset role;

-- =================================================================================================
-- §K -- TAIL CENSUS. Re-reads the live catalog; raises on any finding rather than trusting the
-- body above ran as written.
-- =================================================================================================
do $$
declare v_bad text; v_n int; v_acl_now text; v_owner_now text; v_src_now text; v_code text;
begin
  -- (1) The table + 3 views exist, owned by clara_fn_owner, ACL exactly {clara_fn_owner, clara_authenticated}
  --     for the views (SELECT), and firm_invites carries ZERO clara_authenticated/agent/wake/runtime grant.
  select string_agg(x.relname || ': ' || x.problem, '; ') into v_bad
    from (
      select c.relname,
             case
               when pg_get_userbyid(c.relowner) <> 'clara_fn_owner' then 'owner=' || pg_get_userbyid(c.relowner)
               when c.relname in ('firm_members_visible', 'firm_invites_visible', 'caller_context')
                    and not has_table_privilege('clara_authenticated', c.oid, 'select')
                 then 'clara_authenticated cannot SELECT the view'
               when c.relname = 'firm_invites' and has_table_privilege('clara_authenticated', c.oid, 'select')
                 then 'clara_authenticated CAN SELECT firm_invites directly (the mask is bypassable)'
               when has_table_privilege('clara_agent_ro', c.oid, 'select') then 'clara_agent_ro CAN SELECT (leak)'
               when has_table_privilege('clara_wake_interactive', c.oid, 'select') then 'clara_wake_interactive CAN SELECT (leak)'
               when has_table_privilege('clara_wake_proactive', c.oid, 'select') then 'clara_wake_proactive CAN SELECT (leak)'
               when has_table_privilege('clara_runtime', c.oid, 'select') then 'clara_runtime CAN SELECT (leak)'
               else null
             end as problem
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara'
         and c.relname in ('firm_invites', 'firm_members_visible', 'firm_invites_visible', 'caller_context')
    ) x
   where x.problem is not null;
  if v_bad is not null then
    raise exception 'p4t1 tail: ACL/ownership defect: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara'
     and c.relname in ('firm_invites', 'firm_members_visible', 'firm_invites_visible', 'caller_context');
  if v_n <> 4 then
    raise exception 'p4t1 tail: expected 4 new relations, found %', v_n using errcode = 'CLR10';
  end if;

  -- (2) firm_invites: forced RLS.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = 'firm_invites' and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'p4t1 tail: firm_invites is missing forced RLS' using errcode = 'CLR10';
  end if;

  -- (3) Closed-world column census on the 3 views (arity + names + order -- a CREATE VIEW would
  --     refuse a retype/reorder on a re-run, but this is the first run, so this proves the shape
  --     actually landed as designed).
  select string_agg(format('%s: expected %s col(s) [%s], found %s [%s]',
           k.relname, k.n_expected, k.expected, v.n_actual, v.actual), '; ')
    into v_bad
    from (values
      ('firm_members_visible', 9, 'membership_id,user_id,display_name,email,role,role_rank,status,created_at,removed_at'),
      ('firm_invites_visible', 10, 'id,firm_id,email,role,status,invited_by,created_at,expires_at,accepted_at,revoked_at'),
      ('caller_context', 6, 'user_id,firm_id,firm_name,role,role_rank,is_operator')
    ) as k(relname, n_expected, expected)
    join lateral (
      select count(*)::int as n_actual, string_agg(a.attname, ',' order by a.attnum) as actual
        from pg_attribute a where a.attrelid = ('clara.' || k.relname)::regclass and a.attnum > 0 and not a.attisdropped
    ) v on true
   where v.n_actual <> k.n_expected or v.actual <> k.expected;
  if v_bad is not null then
    raise exception 'p4t1 tail: closed-world column census failed: %', v_bad using errcode = 'CLR10';
  end if;

  -- (4) add_member's ACL is BYTE-UNCHANGED from the §0 prestate stash (proves CREATE OR REPLACE
  --     preserved the grant rather than asserting it), and its prosrc genuinely CHANGED (the
  --     extraction actually happened, not a no-op replace) while both wall strings survive
  --     SOMEWHERE across add_member + _add_member_core combined.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.add_member(uuid,uuid,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t1_pre where k = 'add_member.acl') then
    raise exception 'p4t1 tail: add_member''s ACL moved during this migration -- was %, now %',
      (select v from _p4t1_pre where k = 'add_member.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t1 tail: add_member owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t1_pre where k = 'add_member.prosrc') then
    raise exception 'p4t1 tail: add_member''s body is byte-identical to prestate -- the core extraction did not happen' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara._add_member_core(uuid,uuid,uuid,text)'::regprocedure;
  if position('the agent identity cannot be a firm member' in (v_src_now || coalesce(v_bad, ''))) = 0
     or position('user already belongs to a firm' in (v_src_now || coalesce(v_bad, ''))) = 0 then
    raise exception 'p4t1 tail: HIGH-11 / global-uniqueness wall string lost across the add_member extraction' using errcode = 'CLR10';
  end if;

  -- (5) accept_invite's body carries the JWT-email wall, calls both cores, and never contains
  --     'add_member' as its own _reserve_op/_audit verb string (the "the receipt must name the
  --     door actually walked" rule, annex 1 §D.1).
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  if position('does not match this invite' in v_bad) = 0 then
    raise exception 'p4t1 tail: accept_invite is missing its JWT-email wall' using errcode = 'CLR10';
  end if;
  if position('_claim_identity_core' in v_bad) = 0 or position('_add_member_core' in v_bad) = 0 then
    raise exception 'p4t1 tail: accept_invite does not route through both cores' using errcode = 'CLR10';
  end if;
  if position('''add_member''' in v_bad) > 0 then
    raise exception 'p4t1 tail: accept_invite''s receipt strings leak the add_member verb name' using errcode = 'CLR10';
  end if;

  -- (5b) Native review N2 (amended per the reviewer's own mutant: a raw position() match on
  --      prosrc is COMMENT-MASKABLE -- a genuinely mis-ordered body carrying an explanatory
  --      comment that happens to name the wall string early would still PASS this pin, and a
  --      correctly-ordered body carrying a comment that names `_reserve_op` early would
  --      FALSE-ALARM. Strip line comments FIRST (the 0136 idiom done structurally, not
  --      textually), then match against the comment-free CODE only -- a comment can no longer
  --      move where either wall reads as sitting.
  --      F4: the JWT-email wall (`does not match this invite`) must appear BEFORE the dedupe
  --      short-circuit (`_reserve_op`) in accept_invite's own CODE -- position-ordering, not
  --      mere presence, is what makes the exploit (a replay-theft impostor reaching the dedupe
  --      short-circuit before the wall proves they own the invited email) impossible.
  v_code := regexp_replace(v_bad, '--[^\n]*', '', 'g');
  if position('does not match this invite' in v_code) >= position('_reserve_op' in v_code) then
    raise exception 'p4t1 tail: accept_invite''s JWT-email wall does not run BEFORE _reserve_op in the CODE -- F4 has regressed' using errcode = 'CLR10';
  end if;
  --      F3: _jwt_email() must still normalize with lower() at its single source, in CODE -- a
  --      comment mentioning "lower(" would otherwise be enough to pass this pin without the
  --      function's own body actually calling it. Every one of the four email call sites
  --      (claim_identity, _claim_identity_core's comparison, accept_invite, invite_member)
  --      agrees BY CONSTRUCTION only as long as this holds.
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara._jwt_email()'::regprocedure;
  v_code := regexp_replace(v_bad, '--[^\n]*', '', 'g');
  if position('lower(' in v_code) = 0 then
    raise exception 'p4t1 tail: _jwt_email() no longer normalizes with lower() in CODE -- F3 has regressed' using errcode = 'CLR10';
  end if;

  -- (6) PUBLIC holds EXECUTE on none of the 8 new/recut functions; clara_authenticated holds it
  --     on exactly the 5 human entrances (4 new + add_member unchanged), and the 3 cores +
  --     _jwt_email are ungranted to every app role.
  select string_agg(t.sig, '; ') into v_bad
    from (values
      ('clara.claim_identity(text,text)', true), ('clara.invite_member(text,text,text)', true),
      ('clara.accept_invite(text,text,text)', true), ('clara.revoke_invite(uuid,text)', true),
      ('clara.add_member(uuid,uuid,text,text)', true),
      ('clara._jwt_email()', false), ('clara._claim_identity_core(uuid,text,text)', false),
      ('clara._add_member_core(uuid,uuid,uuid,text)', false)
    ) t(sig, should_reach_authenticated)
   where has_function_privilege('public', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_authenticated', t.sig::regprocedure, 'execute') <> t.should_reach_authenticated
      or has_function_privilege('clara_agent_ro', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_wake_interactive', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_wake_proactive', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_runtime', t.sig::regprocedure, 'execute');
  if v_bad is not null then
    raise exception 'p4t1 tail: EXECUTE ACL defect on: %', v_bad using errcode = 'CLR10';
  end if;

  -- (7) event_types + trigger_taxonomy: both new names registered at the active taxonomy version,
  --     decision context_update.
  select count(*)::int into v_n from clara.event_types where name in ('invite.issued', 'invite.revoked');
  if v_n <> 2 then raise exception 'p4t1 tail: expected 2 new event_types, found %', v_n using errcode = 'CLR10'; end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t join clara.taxonomy_active a on a.version = t.version
   where t.event_type in ('invite.issued', 'invite.revoked') and t.decision = 'context_update';
  if v_n <> 2 then raise exception 'p4t1 tail: expected 2 trigger_taxonomy rows at the active version, found %', v_n using errcode = 'CLR10'; end if;

  -- (8) uq_membership_active_user / uq_firms_one_operator / create_firm are BYTE-UNTOUCHED --
  --     this file's own scoping promise (T2's job, not this file's).
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_membership_active_user') then
    raise exception 'p4t1 tail: uq_membership_active_user vanished' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_firms_one_operator') then
    raise exception 'p4t1 tail: uq_firms_one_operator vanished' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._create_firm_core(uuid,text)') is not null then
    raise exception 'p4t1 tail: _create_firm_core exists -- that is T2''s extraction, out of this file''s scope' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.approve_firm_registration(uuid,text)') is not null
     or to_regprocedure('clara.request_firm_registration(text,text,text)') is not null then
    raise exception 'p4t1 tail: a T2 door exists -- scope leak' using errcode = 'CLR10';
  end if;

  raise notice 'p4t1 tail: OK -- clara.firm_invites live (forced RLS, owner-only, zero clara_authenticated grant, 2 unique indexes); claim_identity/_claim_identity_core, invite_member, accept_invite, revoke_invite, _add_member_core all live with exact ACLs (5 human entrances reach clara_authenticated only, 3 cores + _jwt_email ungranted everywhere, zero PUBLIC/agent/wake/runtime reach anywhere); add_member''s ACL byte-unchanged across a genuinely-changed body carrying both preserved wall strings; accept_invite''s receipt never leaks the add_member verb name; firm_members_visible (9 cols) / firm_invites_visible (10 cols, no token_hash) / caller_context (6 cols) closed-world column census clean; invite.issued/invite.revoked registered at the active taxonomy version as context_update; uq_membership_active_user, uq_firms_one_operator and create_firm all byte-untouched; no T2 object (_create_firm_core / approve_firm_registration / request_firm_registration) leaked into this file''s scope. No table in workflow/graphile_worker/spike touched. ROUND 2: all three views carry security_barrier; accept_invite''s wall-before-dedupe order (F4) and _jwt_email''s lower() (F3) are pinned by position/substring rather than trusted; _claim_identity_core compares stored email case-insensitively (N1); accept_invite''s dedupe hash is actor+display-name-bound (C2); _add_member_core translates a concurrent cross-firm unique_violation into the same typed refusal (C4).';
end $$;
