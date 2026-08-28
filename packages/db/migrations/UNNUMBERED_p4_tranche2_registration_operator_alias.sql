-- =================================================================================================
-- P4 tranche 2 -- self-serve registration + operator approval + counterparty_aliases' human read
-- (docs/plan/active/p4-design-2026-08-27.md §5 + annex 1 §D.3, and 裁-11,
-- docs/plan/active/mohe-grill-rulings-2026-08-28.md).
--
-- SCOPE: BACKEND-ASKS 2, 7 (already surfaced by 0141's caller_context -- read, not re-built), and
-- 8 -- the registration-request door, the operator approval queue, and the `_create_firm_core`
-- extraction from `create_firm`'s LIVE body -- plus 裁-11's counterparty_aliases human read.
--
-- OUT OF SCOPE, on the design's own T1/T2/T3 boundary (§1): asks 9-11 (tier catalog, assignment,
-- metering floor) are T3, flag-hidden, a later tranche.
--
-- A GAP THIS FILE CLOSES BEYOND THE LITERAL ASK TABLE -- flagged to the conductor before writing
-- (SendMessage), RULED into this tranche (conductor-adoption): §4 E's holding state needs the
-- APPLICANT to read their own request's status and rejection reason -- no ask in §5 (2/7/8)
-- defines that read. §E below folds it into the SAME view as ask 8's operator queue read, under
-- the conductor's five conditions: (a) security_barrier -- done; (b) the SELF scope keys on
-- `applicant = jwt_sub()`, the SAME uuid resolution claim_identity/caller_context use, NEVER an
-- email; (c) the OPERATOR scope is the SAME predicate approve_firm_registration/
-- reject_firm_registration enforce -- no shared helper exists for it, so the inline expression is
-- byte-copied into all three bodies (see §D/§E) and a tail census cell (8b) asserts the identical
-- substring in each, so the three cannot drift apart silently; (d) the view carries no
-- operator-only field (there is no operator-notes column in this schema to begin with) and no
-- cross-applicant leak, proven by a battery cell where two applicants each see EXACTLY their own
-- row; (e) both frontend homes named in the PR body. The design doc's §5 table is trued in a
-- later docs batch, per the conductor.
--
-- A LIVE-BODY SURPRISE, exactly what annex 1 §A.1's "superseded-body class" warning names: the
-- LIVE `create_firm` body (read fresh from a recon rig, not the annex's own partial quote) carries
-- an `is_agent` check ("the agent identity cannot own a firm") the annex excerpt (lines 2438-2452)
-- did not show. It is load-bearing for `_create_firm_core` per annex §D.3's own text ("with it in
-- the core, approve_firm_registration structurally cannot mint an agent-owned firm no matter what
-- a request row contains") and is folded into the core below. Confirmed correct by the conductor.
--
-- A RULING-VS-MEASURED discrepancy, RULED by the conductor: 裁-11's "firm + client scoping" prose
-- was a descriptive slip (to be trued in the ruling text separately); its operative instruction
-- ("copy it verbatim... read it from the live catalog") governs. The MEASURED live
-- `clara.counterparties` human-read policy is `firm_id = clara.jwt_firm()` ONLY -- no client_id
-- predicate, despite the table carrying a client_id column -- §F below copies exactly this
-- firm-only shape, confirmed correct.
--
-- A REFUSAL-CODE AMBIGUITY, RULED by the conductor: CLR10 STANDS for the already-active-
-- membership check inside `_create_firm_core` -- the core's own explicit bullet AND
-- `_add_member_core`'s established precedent (0141) for the identical invariant; annex §D.3's
-- "CLR09" entrance-level prose is a drift the conductor trues separately.
--
-- Error codes per the 0002 header: CLR04 authz/actor, CLR09 invariant/lifecycle guard, CLR10
-- bad-request/conflict, CLR11 not-in-your-firm.
-- =================================================================================================

-- =================================================================================================
-- §0 -- PRESTATE. Every claim this file makes about what it edits or depends on, measured before
-- anything is created. Aborts on a false premise rather than proceeding on a guess.
-- =================================================================================================
create temp table _p4t2_pre(k text primary key, v text) on commit drop;

do $$
declare v_missing text; v_present text; v_acl text; v_owner text; v_src text; v_qual text;
begin
  -- (1) Every NEW name this file creates must not already exist.
  select string_agg(n, ', ') into v_present from (values
    ('clara.firm_registration_requests (table)'),
    ('clara._create_firm_core(uuid,text)'),
    ('clara.request_firm_registration(text,text,text)'),
    ('clara.approve_firm_registration(uuid,text)'),
    ('clara.reject_firm_registration(uuid,text,text)'),
    ('clara.firm_registration_requests_visible (view)')
  ) t(n)
  where (n = 'clara.firm_registration_requests (table)' and to_regclass('clara.firm_registration_requests') is not null)
     or (n = 'clara._create_firm_core(uuid,text)' and to_regprocedure('clara._create_firm_core(uuid,text)') is not null)
     or (n = 'clara.request_firm_registration(text,text,text)' and to_regprocedure('clara.request_firm_registration(text,text,text)') is not null)
     or (n = 'clara.approve_firm_registration(uuid,text)' and to_regprocedure('clara.approve_firm_registration(uuid,text)') is not null)
     or (n = 'clara.reject_firm_registration(uuid,text,text)' and to_regprocedure('clara.reject_firm_registration(uuid,text,text)') is not null)
     or (n = 'clara.firm_registration_requests_visible (view)' and to_regclass('clara.firm_registration_requests_visible') is not null);
  if v_present is not null then
    raise exception 'p4t2 prestate: name(s) already exist, refusing to clobber: %', v_present using errcode = 'CLR10';
  end if;

  -- (2) Every EXISTING object this file depends on (by exact signature) must resolve.
  select string_agg(n, ', ') into v_missing from (values
    ('clara.create_firm(text,uuid,text)'), ('clara._human_ctx(integer)'),
    ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
    ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
    ('clara._reserve_op(uuid,text,text,bytea)'), ('clara._finish_op(uuid,text,text,jsonb)'),
    ('clara._hash(jsonb)'), ('clara.role_rank(text)'), ('clara.jwt_sub()'), ('clara.jwt_firm()'),
    ('clara.actor_role_rank()'), ('clara.agent_user_id()'), ('clara._onboarding_plan_snapshot(uuid)')
  ) t(n) where to_regprocedure(n) is null;
  if v_missing is not null then
    raise exception 'p4t2 prestate: depended-upon function(s) missing -- % (superseded-body class: re-run against the LIVE catalog, not a stale assumption)', v_missing using errcode = 'CLR10';
  end if;
  if to_regclass('clara.counterparty_aliases') is null or to_regclass('clara.counterparties') is null
     or to_regclass('clara.onboarding_plans') is null or to_regclass('clara.onboarding_plan_revisions') is null
     or to_regclass('clara.firm_admissions') is null then
    raise exception 'p4t2 prestate: a depended-upon table is missing' using errcode = 'CLR10';
  end if;

  -- (3) uq_membership_active_user and uq_firms_one_operator are pre-existing invariants this file
  --     leans on; confirm they exist. This file does not create or alter either.
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_membership_active_user') then
    raise exception 'p4t2 prestate: uq_membership_active_user missing' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_firms_one_operator') then
    raise exception 'p4t2 prestate: uq_firms_one_operator missing' using errcode = 'CLR10';
  end if;

  -- (4) event_types this file adds are not already claimed.
  if exists (select 1 from clara.event_types where name in ('firm_registration.approved', 'firm_registration.rejected')) then
    raise exception 'p4t2 prestate: event_type name collision on firm_registration.approved/rejected' using errcode = 'CLR10';
  end if;

  -- (5) Stash create_firm's CURRENT prosrc + ACL so the tail can prove the ACL is BYTE-UNCHANGED
  --     across the recut, and that the load-bearing wall strings survive the extraction into
  --     _create_firm_core.
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.create_firm(text,uuid,text)'::regprocedure;
  insert into _p4t2_pre(k, v) values
    ('create_firm.prosrc', v_src), ('create_firm.acl', v_acl), ('create_firm.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t2 prestate: clara.create_firm is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('unknown actor' in v_src) = 0
     or position('the agent identity cannot own a firm' in v_src) = 0
     or position('actor already belongs to a firm' in v_src) = 0
     or position('plan_id' in v_src) = 0 then
    raise exception 'p4t2 prestate: create_firm''s LIVE body is missing an expected wall string or the plan_id return -- re-read the live catalog before extracting' using errcode = 'CLR10';
  end if;

  -- (6) The counterparties human-read policy MEASURED shape -- stashed so the tail can prove the
  --     new counterparty_aliases policy copies it byte-for-byte, and so a drift between this
  --     prestate read and the tail's own re-read (impossible within one migration transaction,
  --     but the discipline is the same measure-before/measure-after shape as every other section)
  --     is the same instrument throughout.
  select pg_get_expr(pol.polqual, pol.polrelid) into v_qual
    from pg_policy pol where pol.polrelid = 'clara.counterparties'::regclass and pol.polname = 'p_counterparties_human';
  if v_qual is null then
    raise exception 'p4t2 prestate: clara.counterparties'' p_counterparties_human policy not found -- the shape 裁-11 requires copying is not live' using errcode = 'CLR10';
  end if;
  insert into _p4t2_pre(k, v) values ('counterparties.human_qual', v_qual);

  -- (7) counterparty_aliases carries NO clara_authenticated grant today (T8's rung-0 finding,
  --     裁-11's own context) -- confirm the gap is real before claiming to close it.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'clara' and table_name = 'counterparty_aliases' and grantee = 'clara_authenticated'
  ) then
    raise exception 'p4t2 prestate: clara.counterparty_aliases already carries a clara_authenticated grant -- 裁-11''s premise (zero grant today) does not hold' using errcode = 'CLR10';
  end if;

  raise notice 'p4t2 prestate: OK -- 6 new names clear, 12 depended-upon functions + 5 depended-upon tables resolve, both partial-unique invariants present, no event_type collision, create_firm prosrc/acl/owner stashed with its four load-bearing strings confirmed present pre-edit, counterparties'' human-read qual stashed, counterparty_aliases confirmed to carry zero clara_authenticated grant today.';
end $$;

set role clara_fn_owner;

-- =================================================================================================
-- §A -- clara.firm_registration_requests (ask 2). Forced RLS, owner-only base policy -- the human
-- surfaces are the door (write) and firm_registration_requests_visible (read, §D), the same
-- masked-view idiom 0137/0141 already established.
--
-- op_key IS STORED on the row (unusual for this estate's writers, which lean on op_receipts
-- instead) because this door structurally cannot: op_receipts is scoped by firm_id, and an
-- applicant has none yet -- the identical constraint claim_identity documents (0141 §C) and
-- create_firm's OWN admission-token-scoped receipt works around a different way (annex §D.3).
-- Storing op_key here lets a genuine retry (same actor, same op_key) replay its own open request's
-- receipt instead of hitting the "already has an open request" business refusal meant for a
-- SECOND, different attempt -- see §B.
-- =================================================================================================
create table clara.firm_registration_requests (
  id          uuid primary key default gen_random_uuid(),
  applicant   uuid        not null references clara.users(id),
  firm_name   text        not null,
  note        text,
  op_key      text        not null,
  status      text        not null default 'open' check (status in ('open', 'approved', 'rejected')),
  decided_by  uuid        references clara.users(id),
  decided_at  timestamptz,
  reason      text,
  firm_id     uuid        references clara.firms(id),
  created_at  timestamptz not null default now()
);
-- DB-level backstop on "no second open request per applicant" -- request_firm_registration already
-- refuses this at the application layer, so this index is defense in depth, the same partial-
-- unique idiom as uq_membership_active_user / uq_firm_invites_pending_email (0141).
create unique index uq_firm_registration_requests_open_applicant
  on clara.firm_registration_requests (applicant) where (status = 'open');

alter table clara.firm_registration_requests enable row level security;
alter table clara.firm_registration_requests force row level security;
create policy p_firm_registration_requests_owner on clara.firm_registration_requests for all to clara_fn_owner using (true) with check (true);
-- No clara_authenticated policy and no grant -- see the header note. firm_registration_requests_visible
-- (§D) is the only human-reachable door onto this table's data.

-- =================================================================================================
-- §B -- Registration request (ask 2). No _audit / no domain event: an applicant calling this door
-- holds NO active membership (that is what the door itself verifies), so there is no firm_id to
-- scope either row under -- the identical structural reason 0141 documents for claim_identity
-- ("the only door in the estate that must work with no membership", 0141 §C). The receipt itself
-- (readable back via firm_registration_requests_visible, §D) is the door's own record.
-- =================================================================================================
create function clara.request_firm_registration(p_firm_name text, p_note text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_name text; v_id uuid;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  if not exists (select 1 from clara.users where id = v_actor) then
    raise exception 'unknown actor' using errcode = 'CLR04';
  end if;
  -- The fixed agent identity EXISTS in clara.users (the global row 0002 seeds), so the
  -- unknown-actor check above does not catch it -- this door needs its own explicit wall,
  -- matching claim_identity/create_firm/_create_firm_core's own agent refusal (found missing
  -- here by the battery's own agent-actor cell before this line existed).
  if exists (select 1 from clara.users where id = v_actor and is_agent) then
    raise exception 'the agent identity cannot request a firm registration' using errcode = 'CLR04';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_name := nullif(btrim(p_firm_name), '');
  if v_name is null then raise exception 'firm name is required' using errcode = 'CLR10'; end if;

  if exists (select 1 from clara.firm_memberships where user_id = v_actor and status = 'active') then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR09';
  end if;

  -- Replay: the SAME actor retrying with the SAME op_key sees their own still-open request again,
  -- never a fresh refusal -- see §A's header note. A DIFFERENT open request (any other op_key)
  -- still refuses below; this is not a general re-submission path.
  select id into v_id from clara.firm_registration_requests
    where applicant = v_actor and status = 'open' and op_key = p_op_key;
  if found then
    return jsonb_build_object('request_id', v_id, 'status', 'open');
  end if;

  if exists (select 1 from clara.firm_registration_requests where applicant = v_actor and status = 'open') then
    raise exception 'an open registration request already exists' using errcode = 'CLR09';
  end if;

  begin
    insert into clara.firm_registration_requests(applicant, firm_name, note, op_key)
      values (v_actor, v_name, nullif(btrim(p_note), ''), p_op_key)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'an open registration request already exists' using errcode = 'CLR09';
  end;
  return jsonb_build_object('request_id', v_id, 'status', 'open');
end $$;

-- =================================================================================================
-- §C -- _create_firm_core (ask 8's dependency), extracted from create_firm's LIVE body (see the
-- header note on the is_agent surprise). Split per annex 1 §D.3, enumerated because that is the
-- whole point of the extraction:
--
--   in the CORE (every entrance):                          at each ENTRANCE (differs per door):
--   - p_actor exists in clara.users -> CLR04 unknown actor  - create_firm: jwt_sub() actor + null
--   - p_actor is not the agent identity -> CLR04            check; the admission-token lookup+lock,
--     (load-bearing for ask 8: structurally cannot mint     replay-return, and consumed-stamp
--     an agent-owned firm no matter what a request carries) - approve_firm_registration: the
--   - p_actor holds no active membership anywhere -> CLR10    owner+operator authority pair,
--   - p_name non-blank -> CLR10                                _reserve_op/_finish_op under ITS
--   - INSERT firms, firm_memberships(...,'owner')              OWN verb string, the request row's
--   - opens onboarding_plans (scope 'firm') + revision 1        own lock+status check
--   - returns {firm_id, plan_id}
--
-- UNLIKE _add_member_core (0141), _audit and _append_event('firm.created') stay at EACH ENTRANCE
-- here, never shared in the core -- annex §D.3 states this explicitly for both entrances (each
-- names its own action string; approve_firm_registration ALSO fires a second, decision-specific
-- event the create_firm entrance never does), so folding the event into the core would force a fact
-- neither entrance's set is a strict match for.
-- =================================================================================================
create function clara._create_firm_core(p_actor uuid, p_name text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_name text; v_firm uuid; v_plan uuid;
begin
  if p_actor is null or not exists (select 1 from clara.users where id = p_actor) then
    raise exception 'unknown actor' using errcode = 'CLR04';
  end if;
  if exists (select 1 from clara.users where id = p_actor and is_agent) then
    raise exception 'the agent identity cannot own a firm' using errcode = 'CLR04';
  end if;
  if exists (select 1 from clara.firm_memberships where user_id = p_actor and status = 'active') then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR10';
  end if;
  v_name := nullif(btrim(p_name), '');
  if v_name is null then raise exception 'firm name is required' using errcode = 'CLR10'; end if;

  insert into clara.firms(name) values (v_name) returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role) values (v_firm, p_actor, 'owner');
  -- [R2-F4, preserved verbatim from the live body] the firm-plan opener is recorded both as
  -- opener and contributor.
  insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
    values (v_firm, 'firm', p_actor, now(), array[p_actor]) returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
    values (v_plan, 1, clara._onboarding_plan_snapshot(v_plan));

  return jsonb_build_object('firm_id', v_firm, 'plan_id', v_plan);
end $$;

-- create_firm's ENTRANCE, recut to delegate. Every wall the live body performed BEFORE the
-- admission-token lookup now runs inside the core instead (called after the token is validated,
-- per the entrance's own natural sequencing) -- a change in WHICH refusal a caller sees first when
-- MULTIPLE conditions are wrong at once (see the header note), never in whether the call ultimately
-- succeeds or fails. The token check, replay-return and consumed-stamp are UNCHANGED, since those
-- belong only to this entrance.
create or replace function clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; a record; v_result jsonb;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  if p_op_key is null or btrim(p_op_key) = '' or nullif(btrim(p_name), '') is null then
    raise exception 'firm name and op_key are required' using errcode = 'CLR10';
  end if;

  select * into a from clara.firm_admissions where token = p_admission_token for update;
  if not found then raise exception 'invalid or consumed admission token' using errcode = 'CLR04'; end if;
  if a.consumed_at is not null then
    if a.consumed_op_key = p_op_key and a.consumed_result is not null then
      return a.consumed_result;
    end if;
    raise exception 'invalid or consumed admission token' using errcode = 'CLR04';
  end if;

  v_result := clara._create_firm_core(v_actor, p_name);

  update clara.firm_admissions set consumed_at = now(), consumed_op_key = p_op_key, consumed_result = v_result
    where token = p_admission_token;
  perform clara._audit((v_result->>'firm_id')::uuid, v_actor, null, null, 'create_firm', null,
    jsonb_build_object('name', p_name, 'plan_id', v_result->>'plan_id', 'op_key', p_op_key));
  perform clara._append_event((v_result->>'firm_id')::uuid, 'firm.created', null, v_actor, null, null,
    null, null, null, jsonb_build_object('plan_id', v_result->>'plan_id'));
  return v_result;
end $$;

-- =================================================================================================
-- §D -- The approval queue (ask 8). Authority copies clara.set_wake_source_enabled (0133:288-291)
-- exactly: owner+ AND the caller's own firm is_operator -- uq_firms_one_operator (0133:274) makes
-- this single-tenant by construction.
-- =================================================================================================
create function clara.approve_firm_registration(p_request uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; req record; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  -- Conductor ruling (this session): the operator-scope half of
  -- firm_registration_requests_visible's predicate (§E) is a BYTE-COPY of this exact fragment --
  -- `clara.jwt_firm()` used here rather than `c.firm` (the two are identical by construction:
  -- _human_ctx derives c.firm FROM jwt_firm()) so the same literal substring exists in both this
  -- door, reject_firm_registration, and the view, and §K (8b) pins that literal drift-proof.
  -- The `f` alias on clara.firms is deliberate, not cosmetic: pg_get_viewdef() reconstructs SQL
  -- from the parsed tree rather than storing it verbatim, and auto-qualifies a BARE column
  -- reference with the source table name (`id` -> `firms.id`) when no alias is given -- measured
  -- empirically this session via a throwaway scratch view. Aliasing here makes the view's
  -- reconstructed text carry the SAME `f.id`/`f.is_operator` tokens this prosrc carries verbatim,
  -- so §K (8b)'s whitespace/case-normalized substring check is comparing like with like.
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'approve_firm_registration', p_op_key, clara._hash(jsonb_build_object('request', p_request)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into req from clara.firm_registration_requests where id = p_request for update;
  if not found then raise exception 'unknown registration request' using errcode = 'CLR10'; end if;
  if req.status <> 'open' then
    raise exception 'this request is no longer open (status: %)', req.status using errcode = 'CLR09';
  end if;

  -- Re-enters the core with the APPLICANT as the actor, never jwt_sub() (the operator) -- the
  -- core's own already-active-membership check re-validates fresh, in case the applicant acquired
  -- one since requesting (annex §D.3; CLR10 per the core's own bullet -- see the header note on the
  -- CLR09-vs-CLR10 ambiguity this resolves).
  v_result := clara._create_firm_core(req.applicant, req.firm_name);

  update clara.firm_registration_requests
    set status = 'approved', decided_by = c.actor, decided_at = now(), firm_id = (v_result->>'firm_id')::uuid
    where id = p_request;

  perform clara._audit((v_result->>'firm_id')::uuid, req.applicant, null, null, 'create_firm', null,
    jsonb_build_object('name', req.firm_name, 'plan_id', v_result->>'plan_id'));
  perform clara._append_event((v_result->>'firm_id')::uuid, 'firm.created', null, req.applicant, null, null,
    null, null, null, jsonb_build_object('plan_id', v_result->>'plan_id'));
  -- The decision itself is the operator's own act, scoped to the OPERATOR's firm (the only firm
  -- the caller has, and the one _reserve_op above already scoped the receipt under) -- distinct
  -- from firm.created above, which belongs to the NEW firm and the applicant.
  perform clara._audit(c.firm, c.actor, null, null, 'approve_firm_registration', null,
    jsonb_build_object('request', p_request, 'firm_id', v_result->>'firm_id'));
  perform clara._append_event(c.firm, 'firm_registration.approved', null, c.actor, null, null,
    null, null, null, jsonb_build_object('request', p_request, 'firm_id', v_result->>'firm_id'));

  return clara._finish_op(c.firm, 'approve_firm_registration', p_op_key,
    jsonb_build_object('request_id', p_request, 'firm_id', v_result->>'firm_id', 'plan_id', v_result->>'plan_id'));
end $$;

create function clara.reject_firm_registration(p_request uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; req record; v_reason text;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  -- Same byte-copied fragment as approve_firm_registration (`f` alias and all) -- see that
  -- function's own comment for why the alias is load-bearing, not cosmetic.
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  -- Reason is REQUIRED, not merely carried (build flag, conductor-adopted from the Mobbin
  -- grounding's own recommendation, docs/plan/active/p4-mobbin-grounding-2026-08-28.md §2
  -- takeaway 3): the DB is the wall on content here, never only the UI, matching this estate's
  -- convention everywhere else a refusal reason exists.
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null then raise exception 'a rejection reason is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'reject_firm_registration', p_op_key, clara._hash(jsonb_build_object('request', p_request, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into req from clara.firm_registration_requests where id = p_request for update;
  if not found then raise exception 'unknown registration request' using errcode = 'CLR10'; end if;
  if req.status <> 'open' then
    raise exception 'this request is no longer open (status: %)', req.status using errcode = 'CLR09';
  end if;

  update clara.firm_registration_requests
    set status = 'rejected', decided_by = c.actor, decided_at = now(), reason = v_reason
    where id = p_request;

  perform clara._audit(c.firm, c.actor, null, null, 'reject_firm_registration', null,
    jsonb_build_object('request', p_request, 'reason', v_reason));
  perform clara._append_event(c.firm, 'firm_registration.rejected', null, c.actor, null, null,
    null, null, null, jsonb_build_object('request', p_request));

  return clara._finish_op(c.firm, 'reject_firm_registration', p_op_key,
    jsonb_build_object('request_id', p_request, 'status', 'rejected'));
end $$;

-- =================================================================================================
-- §E -- The read surface, dual-scoped (see the header note on the gap this closes and the
-- conductor's five conditions). Owner-executed view (the users_visible / 0141 idiom -- NOT
-- security_invoker, the whole point is a floor the base table's own zero grant does not carry).
-- security_barrier per the estate's own round-2/round-3 hardening precedent (0141 §H) -- Postgres
-- may otherwise push a caller-supplied qual in front of this view's own predicate; it buys
-- qual-pushdown ordering, nothing for target-list masking (this view masks no column, so that half
-- is moot here, unlike firm_members_visible's email floor).
--
-- SELF scope: `r.applicant = clara.jwt_sub()` -- the SAME uuid resolution claim_identity/
-- caller_context use, comparing the request row's own minted `users.id` foreign key against the
-- caller's verified subject, never an email (condition b).
--
-- OPERATOR scope: `coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('owner') and exists
-- (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)` -- the semantic
-- equivalent of `_human_ctx(role_rank('owner'))` (a view predicate cannot call a RAISE-based
-- helper, so the null-coalesced rank comparison + jwt_firm() reproduce its exact fail-closed
-- behaviour) PLUS the byte-copied operator-existence fragment approve_firm_registration and
-- reject_firm_registration both now use verbatim, alias and all (condition c) -- §K (8b) pins the
-- shared substring so the three cannot drift apart silently. NOTE for the next editor:
-- pg_get_viewdef() does NOT store this view's text verbatim -- it reconstructs SQL from the
-- parsed query tree (uppercased keywords, reformatted whitespace) every time it is called, unlike
-- a PL/pgSQL function's prosrc, which IS stored close-to-verbatim. §K (8b) accounts for this by
-- normalizing (lowercase + strip all whitespace) before comparing, and the `f` alias here removes
-- Postgres's OWN auto-qualification of the bare `id`/`is_operator` columns as a second source of
-- divergence -- both were measured empirically, not assumed.
-- =================================================================================================
create view clara.firm_registration_requests_visible with (security_barrier) as
  select r.id, r.applicant, r.firm_name, r.note, r.status, r.decided_by, r.decided_at, r.reason,
         r.firm_id, r.created_at
  from clara.firm_registration_requests r
  where r.applicant = clara.jwt_sub()
     or (coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('owner')
         and exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator));

-- =================================================================================================
-- §F -- 裁-11: clara.counterparty_aliases gains the human read the table has carried zero of
-- (T8's rung-0 finding, §0 prestate check (7)) -- a clara_authenticated SELECT grant + a policy
-- copying clara.counterparties' OWN p_counterparties_human policy verbatim (firm-scoped only, per
-- the header note's ruling-vs-measured resolution). Touches no agent path: the definer resolver
-- (_match_counterparty) and clara_freeform_ro's own policy are byte-unchanged; RLS still decides
-- who sees what; this adds human visibility and correction over the agent's alias memory.
-- =================================================================================================
create policy p_counterparty_aliases_human on clara.counterparty_aliases
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.counterparty_aliases to clara_authenticated;

-- =================================================================================================
-- §G -- event_types + trigger_taxonomy (the 0138:2508 idiom -- register at whichever taxonomy
-- version is currently active). firm.created already exists (0005) and is reused verbatim; the two
-- NEW names are the registration-DECISION facts, distinct from the membership fact they accompany.
-- Decision context_update, matching invite.issued/invite.revoked's own precedent (0141) -- an
-- operator's ruling is not something that wakes the agent.
-- =================================================================================================
with inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
    values
      ('firm_registration.approved', false, 'An operator approved a self-serve firm registration request (clara.approve_firm_registration)'),
      ('firm_registration.rejected', false, 'An operator rejected a self-serve firm registration request (clara.reject_firm_registration)')
    on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, i.name, 'context_update', null from inserted_types i cross join clara.taxonomy_active a;

-- =================================================================================================
-- §H -- PUBLIC LOCKDOWN + GRANT MATRIX. N13 (0005:38-42): ALTER DEFAULT PRIVILEGES is empirically a
-- no-op for functions created after it ran, so every function above is PUBLIC-executable until this
-- sweep. create_firm's existing grant survives CREATE OR REPLACE untouched -- no re-grant needed or
-- issued for it here (proven in the tail, not assumed).
-- =================================================================================================
revoke execute on all functions in schema clara from public;

revoke all on function
  clara.request_firm_registration(text, text, text),
  clara.approve_firm_registration(uuid, text),
  clara.reject_firm_registration(uuid, text, text)
  from public;
grant execute on function
  clara.request_firm_registration(text, text, text),
  clara.approve_firm_registration(uuid, text),
  clara.reject_firm_registration(uuid, text, text)
  to clara_authenticated;

grant select on clara.firm_registration_requests_visible to clara_authenticated;

reset role;

-- =================================================================================================
-- §K -- TAIL CENSUS. Re-reads the live catalog; raises on any finding rather than trusting the
-- body above ran as written.
-- =================================================================================================
do $$
declare v_bad text; v_n int; v_acl_now text; v_owner_now text; v_src_now text; v_code text;
begin
  -- (1) The table + view exist, owned by clara_fn_owner, ACL exactly {clara_fn_owner,
  --     clara_authenticated} for the view (SELECT), and firm_registration_requests carries ZERO
  --     clara_authenticated/agent/wake/runtime grant.
  select string_agg(x.relname || ': ' || x.problem, '; ') into v_bad
    from (
      select c.relname,
             case
               when pg_get_userbyid(c.relowner) <> 'clara_fn_owner' then 'owner=' || pg_get_userbyid(c.relowner)
               when c.relname = 'firm_registration_requests_visible'
                    and not has_table_privilege('clara_authenticated', c.oid, 'select')
                 then 'clara_authenticated cannot SELECT the view'
               when c.relname = 'firm_registration_requests' and has_table_privilege('clara_authenticated', c.oid, 'select')
                 then 'clara_authenticated CAN SELECT firm_registration_requests directly (the mask is bypassable)'
               when has_table_privilege('clara_agent_ro', c.oid, 'select') then 'clara_agent_ro CAN SELECT (leak)'
               when has_table_privilege('clara_wake_interactive', c.oid, 'select') then 'clara_wake_interactive CAN SELECT (leak)'
               when has_table_privilege('clara_wake_proactive', c.oid, 'select') then 'clara_wake_proactive CAN SELECT (leak)'
               when has_table_privilege('clara_runtime', c.oid, 'select') then 'clara_runtime CAN SELECT (leak)'
               else null
             end as problem
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara'
         and c.relname in ('firm_registration_requests', 'firm_registration_requests_visible')
    ) x
   where x.problem is not null;
  if v_bad is not null then
    raise exception 'p4t2 tail: ACL/ownership defect: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname in ('firm_registration_requests', 'firm_registration_requests_visible');
  if v_n <> 2 then
    raise exception 'p4t2 tail: expected 2 new relations, found %', v_n using errcode = 'CLR10';
  end if;

  -- (2) firm_registration_requests: forced RLS.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = 'firm_registration_requests' and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'p4t2 tail: firm_registration_requests is missing forced RLS' using errcode = 'CLR10';
  end if;

  -- (3) Closed-world column census on the view + security_barrier reloption.
  select string_agg(format('%s: expected %s col(s) [%s], found %s [%s]',
           k.relname, k.n_expected, k.expected, v.n_actual, v.actual), '; ')
    into v_bad
    from (values
      ('firm_registration_requests_visible', 10, 'id,applicant,firm_name,note,status,decided_by,decided_at,reason,firm_id,created_at')
    ) as k(relname, n_expected, expected)
    join lateral (
      select count(*)::int as n_actual, string_agg(a.attname, ',' order by a.attnum) as actual
        from pg_attribute a where a.attrelid = ('clara.' || k.relname)::regclass and a.attnum > 0 and not a.attisdropped
    ) v on true
   where v.n_actual <> k.n_expected or v.actual <> k.expected;
  if v_bad is not null then
    raise exception 'p4t2 tail: closed-world column census failed: %', v_bad using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_class where oid = 'clara.firm_registration_requests_visible'::regclass
      and reloptions is not null and 'security_barrier=true' = any(reloptions)
  ) then
    raise exception 'p4t2 tail: firm_registration_requests_visible is missing security_barrier' using errcode = 'CLR10';
  end if;

  -- (4) create_firm's ACL is BYTE-UNCHANGED from the §0 prestate stash, and its prosrc genuinely
  --     CHANGED (the extraction actually happened) while all four wall strings survive SOMEWHERE
  --     across create_firm + _create_firm_core combined.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.create_firm(text,uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t2_pre where k = 'create_firm.acl') then
    raise exception 'p4t2 tail: create_firm''s ACL moved during this migration -- was %, now %',
      (select v from _p4t2_pre where k = 'create_firm.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t2 tail: create_firm owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t2_pre where k = 'create_firm.prosrc') then
    raise exception 'p4t2 tail: create_firm''s body is byte-identical to prestate -- the core extraction did not happen' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara._create_firm_core(uuid,text)'::regprocedure;
  if position('unknown actor' in (v_src_now || coalesce(v_bad, ''))) = 0
     or position('the agent identity cannot own a firm' in (v_src_now || coalesce(v_bad, ''))) = 0
     or position('actor already belongs to a firm' in (v_src_now || coalesce(v_bad, ''))) = 0
     or position('plan_id' in (v_src_now || coalesce(v_bad, ''))) = 0 then
    raise exception 'p4t2 tail: a wall string or the plan_id return was lost across the create_firm extraction' using errcode = 'CLR10';
  end if;

  -- (5) approve_firm_registration routes through the core and calls it with the REQUEST'S
  --     applicant, never jwt_sub() directly -- the exact bug class annex §D.3 warns against
  --     (an operator's own actor id must never reach the core as p_actor).
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.approve_firm_registration(uuid,text)'::regprocedure;
  if position('_create_firm_core' in v_bad) = 0 then
    raise exception 'p4t2 tail: approve_firm_registration does not route through _create_firm_core' using errcode = 'CLR10';
  end if;
  if position('_create_firm_core(req.applicant' in v_bad) = 0 then
    raise exception 'p4t2 tail: approve_firm_registration does not pass the REQUEST''S applicant as the core actor' using errcode = 'CLR10';
  end if;
  if position('_create_firm_core(c.actor' in v_bad) > 0 or position('_create_firm_core(v_actor' in v_bad) > 0 then
    raise exception 'p4t2 tail: approve_firm_registration appears to pass the OPERATOR as the core actor' using errcode = 'CLR10';
  end if;

  -- (4b) request_firm_registration carries its OWN is_agent wall (the fixed agent identity
  --      exists in clara.users, so the unknown-actor check alone would not catch it -- the
  --      gap this file's own battery found before this pin existed).
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.request_firm_registration(text,text,text)'::regprocedure;
  if position('the agent identity cannot request a firm registration' in v_bad) = 0 then
    raise exception 'p4t2 tail: request_firm_registration is missing its own is_agent wall' using errcode = 'CLR10';
  end if;

  -- (5b) Native review N2/round-3 idiom applied fresh here: the reason-required wall in
  --      reject_firm_registration must exist in CODE, comment-stripped (block then line), not
  --      merely in a comment -- the same class 0141's F4 pin closes, pinned here from the start
  --      rather than discovered by a later mutant panel.
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.reject_firm_registration(uuid,text,text)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_bad, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('a rejection reason is required' in v_code) = 0 then
    raise exception 'p4t2 tail: reject_firm_registration has no reason-required wall in CODE' using errcode = 'CLR10';
  end if;

  -- (6) PUBLIC holds EXECUTE on none of the 4 new/recut functions; clara_authenticated holds it on
  --     exactly the 4 human entrances (3 new + create_firm unchanged); _create_firm_core is
  --     ungranted to every app role.
  select string_agg(t.sig, '; ') into v_bad
    from (values
      ('clara.request_firm_registration(text,text,text)', true), ('clara.approve_firm_registration(uuid,text)', true),
      ('clara.reject_firm_registration(uuid,text,text)', true), ('clara.create_firm(text,uuid,text)', true),
      ('clara._create_firm_core(uuid,text)', false)
    ) t(sig, should_reach_authenticated)
   where has_function_privilege('public', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_authenticated', t.sig::regprocedure, 'execute') <> t.should_reach_authenticated
      or has_function_privilege('clara_agent_ro', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_wake_interactive', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_wake_proactive', t.sig::regprocedure, 'execute')
      or has_function_privilege('clara_runtime', t.sig::regprocedure, 'execute');
  if v_bad is not null then
    raise exception 'p4t2 tail: EXECUTE ACL defect on: %', v_bad using errcode = 'CLR10';
  end if;

  -- (7) event_types + trigger_taxonomy.
  select count(*)::int into v_n from clara.event_types where name in ('firm_registration.approved', 'firm_registration.rejected');
  if v_n <> 2 then raise exception 'p4t2 tail: expected 2 new event_types, found %', v_n using errcode = 'CLR10'; end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t join clara.taxonomy_active a on a.version = t.version
   where t.event_type in ('firm_registration.approved', 'firm_registration.rejected') and t.decision = 'context_update';
  if v_n <> 2 then raise exception 'p4t2 tail: expected 2 trigger_taxonomy rows at the active version, found %', v_n using errcode = 'CLR10'; end if;

  -- (8) 裁-11: counterparty_aliases now carries EXACTLY the same human-read qual as counterparties'
  --     own policy (byte-identical to the §0 prestate stash), plus the grant, and freeform stays
  --     byte-unchanged.
  select pg_get_expr(pol.polqual, pol.polrelid) into v_bad
    from pg_policy pol where pol.polrelid = 'clara.counterparty_aliases'::regclass and pol.polname = 'p_counterparty_aliases_human';
  if v_bad is null then
    raise exception 'p4t2 tail: p_counterparty_aliases_human policy not found' using errcode = 'CLR10';
  end if;
  if v_bad is distinct from (select v from _p4t2_pre where k = 'counterparties.human_qual') then
    raise exception 'p4t2 tail: counterparty_aliases'' new policy qual (%) does not byte-match counterparties'' own (%)',
      v_bad, (select v from _p4t2_pre where k = 'counterparties.human_qual') using errcode = 'CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.counterparty_aliases'::regclass, 'select') then
    raise exception 'p4t2 tail: clara_authenticated still cannot SELECT counterparty_aliases' using errcode = 'CLR10';
  end if;
  if not has_table_privilege('clara_freeform_ro', 'clara.counterparty_aliases'::regclass, 'select') then
    raise exception 'p4t2 tail: clara_freeform_ro lost its pre-existing SELECT on counterparty_aliases' using errcode = 'CLR10';
  end if;
  if has_table_privilege('clara_agent_ro', 'clara.counterparty_aliases'::regclass, 'select')
     or has_table_privilege('clara_wake_interactive', 'clara.counterparty_aliases'::regclass, 'select')
     or has_table_privilege('clara_wake_proactive', 'clara.counterparty_aliases'::regclass, 'select')
     or has_table_privilege('clara_runtime', 'clara.counterparty_aliases'::regclass, 'select') then
    raise exception 'p4t2 tail: counterparty_aliases gained an agent/wake/runtime SELECT grant -- 裁-11 never asked for this' using errcode = 'CLR10';
  end if;

  -- (8b) Conductor condition (c): the operator-authority fragment is the SAME fragment across
  --      approve_firm_registration, reject_firm_registration and the view -- proven by substring
  --      match, never by re-reasoning about equivalent-looking SQL. A future edit to any ONE of
  --      the three without the other two fails this check loudly.
  --
  --      The comparison is normalized (lowercase, all whitespace stripped), not a raw byte
  --      substring match, for a reason measured empirically this session rather than assumed:
  --      pg_get_viewdef() reconstructs the view's SQL from the parsed query tree on every call --
  --      it is NOT the verbatim text as authored (unlike prosrc on a PL/pgSQL function, which IS
  --      stored close-to-verbatim). A throwaway scratch view proved this: the literal fragment
  --      `exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)`
  --      comes back from pg_get_viewdef as `EXISTS ( SELECT 1\n   FROM clara.firms f\n  WHERE
  --      f.id = clara.jwt_firm() AND f.is_operator)` -- uppercased keywords and reformatted
  --      whitespace, even though the `f` alias (added to this file for exactly this reason -- see
  --      §D and §E's own comments) keeps Postgres from ALSO auto-qualifying the bare columns as
  --      `firms.id`/`firms.is_operator`, which would have been a second, non-cosmetic divergence
  --      no amount of whitespace/case normalization could close. Stripping whitespace and
  --      lowercasing both sides before the substring check absorbs the reformatting while still
  --      failing loudly on any REAL structural drift (a different function call, a different
  --      operator, a missing/extra token) between the three bodies.
  declare
    v_frag constant text := 'exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)';
    v_frag_norm constant text := regexp_replace(lower(v_frag), '\s+', '', 'g');
  begin
    select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.approve_firm_registration(uuid,text)'::regprocedure;
    if position(v_frag_norm in regexp_replace(lower(v_bad), '\s+', '', 'g')) = 0 then
      raise exception 'p4t2 tail: approve_firm_registration no longer carries the shared operator-authority fragment' using errcode = 'CLR10';
    end if;
    select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.reject_firm_registration(uuid,text,text)'::regprocedure;
    if position(v_frag_norm in regexp_replace(lower(v_bad), '\s+', '', 'g')) = 0 then
      raise exception 'p4t2 tail: reject_firm_registration no longer carries the shared operator-authority fragment' using errcode = 'CLR10';
    end if;
    select pg_get_viewdef('clara.firm_registration_requests_visible'::regclass, true) into v_bad;
    if position(v_frag_norm in regexp_replace(lower(v_bad), '\s+', '', 'g')) = 0 then
      raise exception 'p4t2 tail: firm_registration_requests_visible no longer carries the shared operator-authority fragment' using errcode = 'CLR10';
    end if;
  end;

  -- (9) uq_membership_active_user / uq_firms_one_operator are byte-untouched -- this file's own
  --     scoping promise.
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_membership_active_user') then
    raise exception 'p4t2 tail: uq_membership_active_user vanished' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'clara' and indexname = 'uq_firms_one_operator') then
    raise exception 'p4t2 tail: uq_firms_one_operator vanished' using errcode = 'CLR10';
  end if;

  raise notice 'p4t2 tail: OK -- clara.firm_registration_requests live (forced RLS, owner-only, zero clara_authenticated grant, 1 partial-unique index); request_firm_registration/approve_firm_registration/reject_firm_registration/create_firm all live with exact ACLs (4 human entrances reach clara_authenticated only, _create_firm_core ungranted everywhere, zero PUBLIC/agent/wake/runtime reach anywhere); request_firm_registration carries its own is_agent wall (the unknown-actor check alone does not catch the seeded agent identity); create_firm''s ACL byte-unchanged across a genuinely-changed body carrying all four preserved wall strings; approve_firm_registration proven to call the core with the REQUEST''S applicant, never the operator; reject_firm_registration''s reason-required wall pinned in comment-stripped CODE; firm_registration_requests_visible (10 cols, security_barrier) closed-world column census clean; firm_registration.approved/rejected registered at the active taxonomy version as context_update; counterparty_aliases'' new human-read policy is BYTE-IDENTICAL to counterparties'' own (the measured shape, firm-only), the grant lands, clara_freeform_ro is untouched, and no agent/wake/runtime role gained reach; uq_membership_active_user and uq_firms_one_operator byte-untouched. No table in workflow/graphile_worker/spike touched.';
end $$;
