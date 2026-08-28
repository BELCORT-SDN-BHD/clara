-- =================================================================================================
-- P4 tranche 2 -- self-serve registration + operator approval + operator-authority role ceiling +
-- counterparty_aliases' human read
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
-- REV-P4T2 ROUND 1 (native + Codex, both FIX-REQUIRED, this session) -- eleven findings folded in,
-- summarized here so a reviewer does not have to reconstruct intent from the diff alone:
--   F1 (HIGH, regression) -- create_firm's replay path returned a cached receipt to an UNCHECKED
--      caller (the fixed agent identity, or an unknown subject) presenting a previously-consumed
--      (token, op_key) pair, because the existence/is_agent walls lived ONLY inside
--      _create_firm_core, reached AFTER the replay already returned. Fixed by restoring both walls
--      to the ENTRANCE, before the token lookup -- they stay in the core too (defense in depth).
--   F2 (HIGH, pre-existing, folded in by conductor ruling) -- the advertised "owner+ AND
--      is_operator" ask-8 floor was reachable by an ADMIN in practice: set_member_role's own floor
--      is admin, with no ceiling on the role an admin may ASSIGN, so an operator-firm admin could
--      self-promote to owner, then approve. Fixed with one rule, three sites: an actor may never
--      assign/invite/promote to a role ABOVE their own rank (which subsumes "owner is grantable
--      only by an owner", since only rank 3 reaches rank 3) -- set_member_role (0005's LIVE body),
--      _add_member_core and invite_member (0141's LIVE bodies) all CoR'd to add it.
--      _add_member_core's own wall is exempted when p_actor = p_user (accept_invite's self-join,
--      where the role was already ceiling-checked once, at invite_member's own wall, when the
--      invite was issued -- the target has no membership yet to compare against). This makes
--      create_firm, set_member_role, _add_member_core and invite_member the four live writer
--      bodies this file replaces -- the D1 write-quiesce obligation (packages/db/README.md,
--      "Deploy contract") therefore names all four in the PR body, wider than the reviewer's own
--      draft (create_firm + set_member_role only), because the migrations rule binds the ACT of
--      replacing a body, not a subset of them.
--   F3 (MEDIUM) -- _create_firm_core's membership insert had no unique_violation translation (0141
--      C4's own class); fixed identically to _add_member_core's own idiom.
--   F4 (MEDIUM) -- the §K (8b) drift census matched raw text, so a comment could mask a real
--      regression (this session's own tranche-1 fix rounds already found this class once), and
--      NEITHER the census nor the battery pinned the shared "owner" RANK literal (only the
--      operator-existence fragment) -- an owner-to-admin edit in any of the three authority sites
--      would have passed silently. Fixed: every substring-based tail pin now comment-strips
--      (block + line) before matching, and a fifth pin covers the shared `role_rank('owner'`
--      fragment across both doors and the view; new admin-rank (rank 2) battery cells on the view
--      and both doors close the behavioural gap the census alone cannot.
--   F5 (MEDIUM) -- p4t2-approval.test.mjs's agent-applicant fixture root-inserted a row it never
--      cleaned up, parking an agent-owned OPEN request and breaking a second run on the same DB.
--      Fixed with an inline delete at the end of that test.
--   F6 (MEDIUM, ruling: the receipt contract is 0141's C2) -- request_firm_registration's replay
--      checked only (applicant, op_key, status='open'), so a reused op_key with DIFFERENT args
--      silently replayed the wrong receipt, and op_key uniqueness did not survive a decision
--      (rejected/approved). Fixed: the replay key is (applicant, op_key) across ALL statuses,
--      arg-complete (firm_name, note) and refuses "op_key reused with different args" on a
--      mismatch: a genuinely new request after a rejection needs a FRESH op_key. The concurrent-
--      identical-insert race is handled the same way inside the unique_violation handler, so two
--      callers racing the SAME (applicant, op_key, args) both see a replay, never one of them
--      seeing a spurious CLR09.
--   F7 (MEDIUM, ruling: add the self-decision wall) -- reject_firm_registration (and defensively
--      approve_firm_registration) now refuse an operator deciding their own request (CLR04) -- the
--      applicant-turned-operator-owner case.
--   F8 (MEDIUM) -- §F's CREATE POLICY + GRANT take an ACCESS EXCLUSIVE lock on the hot
--      counterparty_aliases table with no bound wait; `set local lock_timeout` added, the 0138
--      15s shape.
--   F9 (LOW) -- the constraint-15 claim was prose only; a catalog cell now backs it, 0140's shape.
--   F10 (LOW) -- approve/reject's dedupe hashes now bind c.actor, matching accept_invite's C2.
--   F11 (LOW, ruling: mask decided_by in SELF scope) -- the view now returns decided_by only to
--      the OPERATOR scope; a self-scoped applicant sees NULL -- they need status/reason/timestamps,
--      not the deciding operator's identity.
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
declare v_missing text; v_present text; v_acl text; v_owner text; v_src text; v_qual text; v_n int;
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

  -- (2) Every EXISTING object this file depends on OR patches (by exact signature) must resolve.
  --     set_member_role/_add_member_core/invite_member are PATCHED (F2), not new -- listed here
  --     the same way create_firm already was, each with its own stash block below.
  select string_agg(n, ', ') into v_missing from (values
    ('clara.create_firm(text,uuid,text)'), ('clara._human_ctx(integer)'),
    ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
    ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
    ('clara._reserve_op(uuid,text,text,bytea)'), ('clara._finish_op(uuid,text,text,jsonb)'),
    ('clara._hash(jsonb)'), ('clara.role_rank(text)'), ('clara.jwt_sub()'), ('clara.jwt_firm()'),
    ('clara.actor_role_rank()'), ('clara.agent_user_id()'), ('clara._onboarding_plan_snapshot(uuid)'),
    ('clara.set_member_role(uuid,text,text)'), ('clara._add_member_core(uuid,uuid,uuid,text)'),
    ('clara.invite_member(text,text,text)'), ('clara.add_member(uuid,uuid,text,text)'),
    ('clara.accept_invite(text,text,text)')
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

  -- (5b) Stash set_member_role's CURRENT prosrc + ACL (F2: this file adds a role-ceiling wall to
  --      its LIVE 0005 body -- the second replaced live writer).
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.set_member_role(uuid,text,text)'::regprocedure;
  insert into _p4t2_pre(k, v) values
    ('set_member_role.prosrc', v_src), ('set_member_role.acl', v_acl), ('set_member_role.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t2 prestate: clara.set_member_role is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('membership not in your firm' in v_src) = 0 or position('bad role' in v_src) = 0 then
    raise exception 'p4t2 prestate: set_member_role''s LIVE body is missing an expected wall string -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;

  -- (5c) Stash _add_member_core's CURRENT prosrc + ACL (F2/F3: role-ceiling wall AND the
  --      unique_violation translation on the membership insert -- the third replaced live writer).
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara._add_member_core(uuid,uuid,uuid,text)'::regprocedure;
  insert into _p4t2_pre(k, v) values
    ('add_member_core.prosrc', v_src), ('add_member_core.acl', v_acl), ('add_member_core.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t2 prestate: clara._add_member_core is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('user already belongs to a firm' in v_src) = 0 or position('the agent identity cannot be a firm member' in v_src) = 0 then
    raise exception 'p4t2 prestate: _add_member_core''s LIVE body is missing an expected wall string -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;

  -- (5d) Stash invite_member's CURRENT prosrc + ACL (F2: role-ceiling wall -- the fourth replaced
  --      live writer).
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.invite_member(text,text,text)'::regprocedure;
  insert into _p4t2_pre(k, v) values
    ('invite_member.prosrc', v_src), ('invite_member.acl', v_acl), ('invite_member.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t2 prestate: clara.invite_member is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('bad role' in v_src) = 0 or position('an invite is already pending for this email' in v_src) = 0 then
    raise exception 'p4t2 prestate: invite_member''s LIVE body is missing an expected wall string -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;

  -- (5e) Stash add_member's CURRENT prosrc + ACL (F2 round 2: the reviewer-found THIRD escalation
  --      route -- role-ceiling wall -- the fifth replaced live writer).
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.add_member(uuid,uuid,text,text)'::regprocedure;
  insert into _p4t2_pre(k, v) values
    ('add_member.prosrc', v_src), ('add_member.acl', v_acl), ('add_member.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t2 prestate: clara.add_member is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('not your firm' in v_src) = 0 then
    raise exception 'p4t2 prestate: add_member''s LIVE body is missing an expected wall string -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;

  -- (5f) Stash accept_invite's CURRENT prosrc + ACL (F2 round 2, ruling (i): the issuer-rank
  --      re-check at accept time -- the sixth replaced live writer).
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  insert into _p4t2_pre(k, v) values
    ('accept_invite.prosrc', v_src), ('accept_invite.acl', v_acl), ('accept_invite.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'p4t2 prestate: clara.accept_invite is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('invalid invite token' in v_src) = 0 or position('this invite has expired' in v_src) = 0 then
    raise exception 'p4t2 prestate: accept_invite''s LIVE body is missing an expected wall string -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;

  -- (5g) F2 round 2, ruling (i): REPORT (never delete/reject) how many PENDING invites already
  --      exceed their issuer's CURRENT rank -- a pre-fix admin-issued owner invite, or one whose
  --      issuer was later demoted. On a fresh throwaway rig this is always 0 (no invites predate
  --      this migration); on live it is a genuine population count this migration does not touch.
  select count(*)::int into v_n
    from clara.firm_invites fi
    left join clara.firm_memberships m
      on m.user_id = fi.invited_by and m.firm_id = fi.firm_id and m.status = 'active'
   where fi.status = 'pending' and clara.role_rank(fi.role) > coalesce(clara.role_rank(m.role), -1);
  insert into _p4t2_pre(k, v) values ('pending_invites_over_issuer_rank.pre', v_n::text);

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

  raise notice 'p4t2 prestate: OK -- 6 new names clear, 17 depended-upon functions + 5 depended-upon tables resolve, both partial-unique invariants present, no event_type collision, create_firm/set_member_role/_add_member_core/invite_member/add_member/accept_invite prosrc+acl+owner all stashed with their load-bearing strings confirmed present pre-edit, % pending invite(s) already exceed their issuer''s current rank (reported, not asserted zero -- expected 0 on a fresh rig), counterparties'' human-read qual stashed, counterparty_aliases confirmed to carry zero clara_authenticated grant today.', v_n;
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
-- Storing op_key here lets a genuine retry (same actor, same op_key, same args) replay its own
-- request's receipt regardless of its CURRENT status (open/approved/rejected) -- see §B's own F6
-- header note for the full replay/arg-mismatch contract.
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
--
-- F6 fix (rev-p4t2 round 1, ruling: the receipt contract is 0141's C2): op_key is unique per
-- (applicant, op_key) across ALL statuses, never scoped to status='open' alone -- a request that
-- was later approved or rejected still "used up" its op_key. A replay is arg-complete the same way
-- accept_invite's C2 fix made its own dedupe hash argument-complete: identical (firm_name, note) on
-- the SAME (applicant, op_key) replays the ORIGINAL request's receipt regardless of its CURRENT
-- status; any DIFFERENT arg on the SAME (applicant, op_key) refuses CLR10 rather than silently
-- returning someone else's receipt. A genuinely NEW request after a rejection needs a FRESH
-- op_key -- reusing the old one either replays the (now-rejected) receipt (identical args) or
-- refuses (different args); it can never open a second live request under the old key. The
-- concurrent-identical-insert race (two callers with the SAME (applicant, op_key, args) both
-- racing the unique_violation on uq_firm_registration_requests_open_applicant) is handled inside
-- the exception handler with the identical replay-or-refuse logic, so the LOSER of that race
-- replays too, never seeing a spurious CLR09.
-- =================================================================================================
create function clara.request_firm_registration(p_firm_name text, p_note text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_name text; v_note text; v_id uuid; v_prior record;
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
  v_note := nullif(btrim(p_note), '');

  if exists (select 1 from clara.firm_memberships where user_id = v_actor and status = 'active') then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR09';
  end if;

  -- Replay lookup: (applicant, op_key) across ALL statuses -- see this section's header note.
  select id, firm_name, note, status into v_prior
    from clara.firm_registration_requests where applicant = v_actor and op_key = p_op_key;
  if found then
    if v_prior.firm_name is distinct from v_name or v_prior.note is distinct from v_note then
      raise exception 'op_key reused with different args' using errcode = 'CLR10';
    end if;
    return jsonb_build_object('request_id', v_prior.id, 'status', v_prior.status);
  end if;

  if exists (select 1 from clara.firm_registration_requests where applicant = v_actor and status = 'open') then
    raise exception 'an open registration request already exists' using errcode = 'CLR09';
  end if;

  begin
    insert into clara.firm_registration_requests(applicant, firm_name, note, op_key)
      values (v_actor, v_name, v_note, p_op_key)
      returning id into v_id;
  exception when unique_violation then
    -- The race: a concurrent caller with the SAME (applicant, op_key) may have committed between
    -- our lookup above and this insert. Re-check for an identical-args match and replay it exactly
    -- as the non-concurrent path above would have; only a genuinely different attempt (an op_key
    -- collision with different args, or a second DIFFERENT open request) still refuses.
    select id, firm_name, note, status into v_prior
      from clara.firm_registration_requests where applicant = v_actor and op_key = p_op_key;
    if found then
      if v_prior.firm_name is distinct from v_name or v_prior.note is distinct from v_note then
        raise exception 'op_key reused with different args' using errcode = 'CLR10';
      end if;
      return jsonb_build_object('request_id', v_prior.id, 'status', v_prior.status);
    end if;
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
--   - p_actor is not the agent identity -> CLR04            check; BOTH walls run here too, before
--     (load-bearing for ask 8: structurally cannot mint     the admission-token lookup (F1 fix --
--     an agent-owned firm no matter what a request carries) see below); the token lookup+lock,
--   - p_actor holds no active membership anywhere -> CLR10    replay-return, and consumed-stamp
--   - p_name non-blank -> CLR10                              - approve_firm_registration: the
--   - INSERT firms, firm_memberships(...,'owner') (F3:         owner+operator authority pair,
--     unique_violation translated to the SAME CLR10)           _reserve_op/_finish_op under ITS
--   - opens onboarding_plans (scope 'firm') + revision 1        OWN verb string, the request row's
--   - returns {firm_id, plan_id}                                own lock+status check
--
-- UNLIKE _add_member_core (0141), _audit and _append_event('firm.created') stay at EACH ENTRANCE
-- here, never shared in the core -- annex §D.3 states this explicitly for both entrances (each
-- names its own action string; approve_firm_registration ALSO fires a second, decision-specific
-- event the create_firm entrance never does), so folding the event into the core would force a fact
-- neither entrance's set is a strict match for.
--
-- F1 fix (rev-p4t2 round 1, HIGH, regression): the existence + is_agent walls now run TWICE by
-- design -- once at create_firm's own ENTRANCE, before the admission-token lookup/replay, and
-- again here in the core. Before this fix they lived ONLY in the core, so a replay of a
-- previously-consumed (token, op_key) pair returned the cached {firm_id, plan_id} receipt without
-- ever re-checking WHO was asking -- the fixed agent identity, or any unknown subject who happened
-- to present a valid consumed-token/op_key pair, both received someone else's receipt. The core's
-- own copy stays as defense in depth for any future direct caller (e.g. approve_firm_registration,
-- which never goes through create_firm's entrance at all).
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
  -- F3 fix (rev-p4t2 round 1): translate a raw 23505 into the SAME typed refusal the exists-check
  -- above raises, mirroring _add_member_core's own C4 idiom -- a genuinely fresh clara.firms row
  -- means uq_membership_active_user can only fire here on a real concurrent race (p_actor acquired
  -- an active membership elsewhere between the exists-check above and this insert), and a racing
  -- caller must never see a raw unique_violation instead of the typed refusal.
  begin
    insert into clara.firm_memberships(firm_id, user_id, role) values (v_firm, p_actor, 'owner');
  exception when unique_violation then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR10';
  end;
  -- [R2-F4, preserved verbatim from the live body] the firm-plan opener is recorded both as
  -- opener and contributor.
  insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
    values (v_firm, 'firm', p_actor, now(), array[p_actor]) returning id into v_plan;
  insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
    values (v_plan, 1, clara._onboarding_plan_snapshot(v_plan));

  return jsonb_build_object('firm_id', v_firm, 'plan_id', v_plan);
end $$;

-- create_firm's ENTRANCE, recut to delegate. F1 fix: the existence + is_agent walls run HERE,
-- before the admission-token lookup/replay -- see §C's own header note above for the bug this
-- closes. The token check, replay-return and consumed-stamp are UNCHANGED, since those belong
-- only to this entrance.
create or replace function clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; a record; v_result jsonb;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  if not exists (select 1 from clara.users where id = v_actor) then
    raise exception 'unknown actor' using errcode = 'CLR04';
  end if;
  if exists (select 1 from clara.users where id = v_actor and is_agent) then
    raise exception 'the agent identity cannot own a firm' using errcode = 'CLR04';
  end if;
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
-- §C2 -- F2 fix (HIGH, pre-existing, folded in by conductor ruling; round 2 widened by the
-- reviewer's own pre-built panel before this file was reported green): the role-ceiling wall. An
-- actor may never assign, invite, or promote to a role ABOVE their own rank -- which subsumes
-- "owner is grantable only by an owner", since only rank 3 (owner) reaches rank 3. Without this,
-- the ask-8 "owner+ of the is_operator firm" floor was reachable by an ADMIN in practice --
-- set_member_role's own floor is admin (rank 2), with no ceiling on the role being assigned, so an
-- operator-firm admin could call set_member_role on their OWN membership with p_role='owner', then
-- approve_firm_registration.
--
-- ROUND 2 RULING on WHERE the ceiling lives (the reviewer's own re-verify panel found two more
-- routes round 1 missed): `_add_member_core(uuid,uuid,uuid,text)` carries NO caller-rank input,
-- and its signature stays UNCHANGED -- adding one would be exactly the same-name-different-
-- signature trap rig-meta's P4T1 signature-exact cohort exists to catch, and a same-body-new-
-- parameter change is a bigger diff than a security fix needs. The ceiling therefore lives
-- ENTIRELY AT THE ENTRANCES, each reading the caller's own rank from its own _human_ctx /
-- actor_role_rank() and refusing BEFORE delegating to the core:
--
--   set_member_role (0005)     -- role_rank(p_role) > actor_role_rank() -> CLR04, right after the
--                                  existing bad-role check.
--   add_member (0005)          -- the SAME comparison -- a THIRD escalation route the reviewer's
--                                  panel found live: its own floor is admin, with no ceiling
--                                  before this fix, so an admin could add someone directly as
--                                  'owner' without ever touching set_member_role at all.
--   invite_member (0141)       -- the SAME comparison against the inviter's own actor_role_rank(),
--                                  checked at ISSUE time, before the role is ever persisted onto
--                                  an invite row.
--   accept_invite (0141)       -- a FOURTH route the panel found: a ceiling at issue time does not
--                                  retract an invite ALREADY pending -- an owner-role invite minted
--                                  by an admin before this fix (or whose issuer was later demoted)
--                                  would otherwise still mint an owner membership untouched.
--                                  accept_invite now RE-CHECKS the ISSUER's CURRENT rank at ACCEPT
--                                  time (firm_invites.invited_by is stored): the invite's role must
--                                  not exceed the issuer's rank NOW, not merely at issue time.
--
-- _add_member_core itself carries ONLY F3's unique_violation translation in this file -- no
-- ceiling logic, by the ruling above. Four live bodies patched for the ceiling wall (plus
-- _add_member_core for F3 alone), six live writers replaced by this file in total counting
-- create_firm -- see the D1 write-quiesce line in the PR body.
-- =================================================================================================
create or replace function clara.set_member_role(p_membership uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_member_role', p_op_key,
    clara._hash(jsonb_build_object('mem', p_membership, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  -- F2 fix: the role-ceiling wall.
  if clara.role_rank(p_role) > coalesce(clara.actor_role_rank(), -1) then
    raise exception 'cannot assign a role above your own rank' using errcode = 'CLR04';
  end if;
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  if m.status <> 'active' then raise exception 'membership is not active' using errcode = 'CLR11'; end if;
  update clara.firm_memberships set role = p_role where id = p_membership;  -- guard_last_owner backstops CLR09
  if clara.role_rank(p_role) < clara.role_rank('bookkeeper') then
    update clara.wake_credentials set revoked_at = statement_timestamp()
      where on_behalf_of = m.user_id and firm_id = c.firm and revoked_at is null;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'set_member_role', null, jsonb_build_object('membership', p_membership, 'role', p_role));
  perform clara._append_event(c.firm, 'member.role_changed', null, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'set_member_role', p_op_key, jsonb_build_object('membership_id', p_membership, 'role', p_role));
end $$;

create or replace function clara._add_member_core(p_firm uuid, p_actor uuid, p_user uuid, p_role text) returns uuid
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
  -- Round 2 ruling (§C2's own header note): NO role-ceiling wall lives here -- this core has no
  -- caller-rank input by design (a signature change here is exactly the trap the P4T1
  -- signature-exact cohort exists to catch), and every entrance that reaches this core now
  -- enforces its own ceiling BEFORE calling in (add_member, accept_invite's issuer re-check).
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

create or replace function clara.invite_member(p_email text, p_role text, p_op_key text) returns jsonb
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
  -- F2 fix: the role-ceiling wall, checked against the INVITER's own rank -- the role is fixed
  -- here, at invite time, before _add_member_core (and its self-join exemption) is ever reached.
  if clara.role_rank(p_role) > coalesce(clara.actor_role_rank(), -1) then
    raise exception 'cannot invite to a role above your own rank' using errcode = 'CLR04';
  end if;
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

create or replace function clara.add_member(p_firm uuid, p_user uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_firm is distinct from c.firm then raise exception 'not your firm' using errcode = 'CLR11'; end if;
  -- F2 fix (round 2, the reviewer-found THIRD escalation route): add_member's own floor is admin,
  -- with no ceiling on the role being GRANTED -- an admin could add someone directly as 'owner',
  -- bypassing set_member_role entirely. The ceiling lives here, at the entrance, matching
  -- set_member_role/invite_member -- see §C2's own header note for why it does NOT live in
  -- _add_member_core.
  if clara.role_rank(p_role) > coalesce(clara.actor_role_rank(), -1) then
    raise exception 'cannot assign a role above your own rank' using errcode = 'CLR04';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'add_member', p_op_key,
    clara._hash(jsonb_build_object('u', p_user, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_id := clara._add_member_core(c.firm, c.actor, p_user, p_role);
  perform clara._audit(c.firm, c.actor, null, null, 'add_member', null, jsonb_build_object('user', p_user, 'role', p_role));
  return clara._finish_op(c.firm, 'add_member', p_op_key, jsonb_build_object('membership_id', v_id));
end $$;

create or replace function clara.accept_invite(p_token text, p_display_name text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_email text; v_hash bytea; inv record; v_dedupe jsonb; v_membership uuid; v_issuer_rank int;
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

  -- F2 fix (round 2, ruling (i)): re-check the ISSUER's rank at ACCEPT time, not just at issue
  -- time -- a pending owner-role invite minted by an admin BEFORE this fix (or whose issuer was
  -- later demoted) would otherwise still mint an owner membership untouched. firm_invites.invited_by
  -- is stored; the invite's role must not exceed the issuer's CURRENT active rank in this firm. An
  -- issuer with no active membership at all reads as rank -1 (coalesce), refusing too.
  select clara.role_rank(m.role) into v_issuer_rank
    from clara.firm_memberships m where m.user_id = inv.invited_by and m.firm_id = inv.firm_id and m.status = 'active';
  if clara.role_rank(inv.role) > coalesce(v_issuer_rank, -1) then
    raise exception 'invite exceeds the issuer''s rank -- re-issue by an owner' using errcode = 'CLR04';
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
  -- F10 fix (rev-p4t2 round 1): the dedupe hash now binds c.actor, matching accept_invite's own
  -- C2 fix -- the request id alone left the hash actor-agnostic.
  v_dedupe := clara._reserve_op(c.firm, 'approve_firm_registration', p_op_key,
    clara._hash(jsonb_build_object('request', p_request, 'actor', c.actor)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into req from clara.firm_registration_requests where id = p_request for update;
  if not found then raise exception 'unknown registration request' using errcode = 'CLR10'; end if;
  -- F7 fix (rev-p4t2 round 1, ruling: add the self-decision wall): an operator may never decide
  -- their OWN registration request -- the applicant-turned-operator-owner case (e.g. an applicant
  -- who separately already holds owner rank in the operator firm). Defensive here: approving one's
  -- own request mints a SECOND firm for the SAME person, which is not obviously wrong the way
  -- self-rejection is, but the identity conflict is real either way, so both doors carry the wall.
  if req.applicant = c.actor then
    raise exception 'cannot decide your own registration request' using errcode = 'CLR04';
  end if;
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
  -- F10 fix: the dedupe hash now binds c.actor, matching accept_invite's own C2 fix.
  v_dedupe := clara._reserve_op(c.firm, 'reject_firm_registration', p_op_key,
    clara._hash(jsonb_build_object('request', p_request, 'reason', v_reason, 'actor', c.actor)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into req from clara.firm_registration_requests where id = p_request for update;
  if not found then raise exception 'unknown registration request' using errcode = 'CLR10'; end if;
  -- F7 fix (ruling: add the self-decision wall): an operator may never reject their OWN request --
  -- the applicant-turned-operator-owner case this exact wall closes.
  if req.applicant = c.actor then
    raise exception 'cannot decide your own registration request' using errcode = 'CLR04';
  end if;
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
-- qual-pushdown ordering, nothing for target-list masking on its own, which is exactly why
-- `decided_by` below is masked with an explicit CASE rather than left to the qual alone (F11).
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
-- comment-stripping then normalizing (lowercase + strip all whitespace) before comparing, and the
-- `f` alias here removes Postgres's OWN auto-qualification of the bare `id`/`is_operator` columns
-- as a second source of divergence -- both were measured empirically, not assumed.
--
-- F11 fix (rev-p4t2 round 1, LOW, ruling: mask decided_by in SELF scope): the SELF scope needs
-- status/reason/timestamps to render §4 E's holding state -- it never needed the deciding
-- operator's own identity. `decided_by` is now NULL unless the CALLER is in the operator scope,
-- via the SAME operator-scope predicate repeated inline (the byte-copy discipline this view
-- already follows for the WHERE clause) rather than a second helper.
-- =================================================================================================
create view clara.firm_registration_requests_visible with (security_barrier) as
  select r.id, r.applicant, r.firm_name, r.note, r.status,
         case when coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('owner')
                   and exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)
              then r.decided_by else null end as decided_by,
         r.decided_at, r.reason, r.firm_id, r.created_at
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
--
-- F8 fix (rev-p4t2 round 1, MEDIUM): CREATE POLICY + GRANT below take an ACCESS EXCLUSIVE lock on
-- counterparty_aliases, a table this estate's agent path reads constantly (the alias-matching
-- resolver). LOAD-BEARING, the 0138 15s shape (packages/db/README.md, .claude/rules/db-migrations.md
-- "Put the timeout in the file, not in the ceremony"): without a bound wait, the runner's own
-- lock_timeout=0 default lets this DDL queue indefinitely behind any live reader/writer, stalling
-- every migration behind it too -- it should fail fast and let the ceremony retry in a quieter
-- window instead.
-- =================================================================================================
set local lock_timeout = '15s';

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
-- sweep. create_firm/set_member_role/_add_member_core/invite_member/add_member/accept_invite's
-- existing grants survive CREATE OR REPLACE untouched -- no re-grant needed or issued for any of them here (proven in the
-- tail, not assumed).
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
declare v_bad text; v_n int; v_frozen int; v_acl_now text; v_owner_now text; v_src_now text; v_code text; v_pending_over_rank int;
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

  -- (3) Closed-world column census on the view + security_barrier reloption. F11 masks a VALUE
  --     (decided_by), never removes the COLUMN, so the closed-world shape is unchanged.
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

  -- (4a) F1 fix, ordering proof: create_firm's OWN entrance body (not the core) must carry BOTH
  --      walls, and both must appear BEFORE the admission-token lookup -- the exact bug the
  --      reviewer found (a replay returning a cached receipt to an unchecked caller because the
  --      walls lived only in the core, reached after the replay already returned). The 0141 F4
  --      "wall-before-dedupe order" idiom, applied fresh here.
  if position('unknown actor' in v_src_now) = 0
     or position('the agent identity cannot own a firm' in v_src_now) = 0 then
    raise exception 'p4t2 tail: create_firm''s own entrance is missing the existence/is_agent wall (F1 regressed)' using errcode = 'CLR10';
  end if;
  if position('unknown actor' in v_src_now) > position('from clara.firm_admissions' in v_src_now)
     or position('the agent identity cannot own a firm' in v_src_now) > position('from clara.firm_admissions' in v_src_now) then
    raise exception 'p4t2 tail: create_firm''s existence/is_agent wall does not run BEFORE the admission-token lookup (F1 regressed)' using errcode = 'CLR10';
  end if;

  -- (4b) set_member_role: ACL byte-unchanged, prosrc genuinely changed, and the role-ceiling wall
  --      is present in comment-stripped CODE (F2, F4's comment-strip discipline applied fresh).
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.set_member_role(uuid,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t2_pre where k = 'set_member_role.acl') then
    raise exception 'p4t2 tail: set_member_role''s ACL moved during this migration -- was %, now %',
      (select v from _p4t2_pre where k = 'set_member_role.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t2 tail: set_member_role owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t2_pre where k = 'set_member_role.prosrc') then
    raise exception 'p4t2 tail: set_member_role''s body is byte-identical to prestate -- the F2 patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('cannot assign a role above your own rank' in v_code) = 0 then
    raise exception 'p4t2 tail: set_member_role is missing its role-ceiling wall in CODE' using errcode = 'CLR10';
  end if;

  -- (4c) _add_member_core: ACL byte-unchanged, prosrc genuinely changed (F3's unique_violation
  --      translation), and round 2's ruling proven NEGATIVELY -- no ceiling logic lives here.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara._add_member_core(uuid,uuid,uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t2_pre where k = 'add_member_core.acl') then
    raise exception 'p4t2 tail: _add_member_core''s ACL moved during this migration -- was %, now %',
      (select v from _p4t2_pre where k = 'add_member_core.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t2 tail: _add_member_core owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t2_pre where k = 'add_member_core.prosrc') then
    raise exception 'p4t2 tail: _add_member_core''s body is byte-identical to prestate -- the F3 patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('exception when unique_violation' in v_code) = 0 then
    raise exception 'p4t2 tail: _add_member_core is missing F3''s unique_violation translation in CODE' using errcode = 'CLR10';
  end if;
  if position('cannot assign a role above your own rank' in v_code) > 0 then
    raise exception 'p4t2 tail: _add_member_core carries a role-ceiling wall -- round 2''s ruling put it at the entrances only (signature-stability)' using errcode = 'CLR10';
  end if;

  -- (4d) invite_member: same three proofs.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.invite_member(text,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t2_pre where k = 'invite_member.acl') then
    raise exception 'p4t2 tail: invite_member''s ACL moved during this migration -- was %, now %',
      (select v from _p4t2_pre where k = 'invite_member.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t2 tail: invite_member owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t2_pre where k = 'invite_member.prosrc') then
    raise exception 'p4t2 tail: invite_member''s body is byte-identical to prestate -- the F2 patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('cannot invite to a role above your own rank' in v_code) = 0 then
    raise exception 'p4t2 tail: invite_member is missing its role-ceiling wall in CODE' using errcode = 'CLR10';
  end if;

  -- (4e) add_member: same three proofs (F2 round 2, the third escalation route).
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.add_member(uuid,uuid,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t2_pre where k = 'add_member.acl') then
    raise exception 'p4t2 tail: add_member''s ACL moved during this migration -- was %, now %',
      (select v from _p4t2_pre where k = 'add_member.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t2 tail: add_member owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t2_pre where k = 'add_member.prosrc') then
    raise exception 'p4t2 tail: add_member''s body is byte-identical to prestate -- the F2 round-2 patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('cannot assign a role above your own rank' in v_code) = 0 then
    raise exception 'p4t2 tail: add_member is missing its role-ceiling wall in CODE' using errcode = 'CLR10';
  end if;

  -- (4f) accept_invite: same three proofs, plus the issuer-rank re-check marker (F2 round 2,
  --      ruling (i), the fourth escalation route).
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.accept_invite(text,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _p4t2_pre where k = 'accept_invite.acl') then
    raise exception 'p4t2 tail: accept_invite''s ACL moved during this migration -- was %, now %',
      (select v from _p4t2_pre where k = 'accept_invite.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'p4t2 tail: accept_invite owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _p4t2_pre where k = 'accept_invite.prosrc') then
    raise exception 'p4t2 tail: accept_invite''s body is byte-identical to prestate -- the F2 round-2 patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('invite exceeds the issuer' in v_code) = 0 or position('v_issuer_rank' in v_code) = 0 then
    raise exception 'p4t2 tail: accept_invite is missing its issuer-rank re-check wall in CODE' using errcode = 'CLR10';
  end if;

  -- (4g) F2 round 2, ruling (i): re-report the pending-invites-over-issuer-rank population at the
  --      tail, same measure as the prestate -- this migration TOUCHES no existing invite row, so
  --      the count must be UNCHANGED across the transaction (a real assertion, not a dead local).
  select count(*)::int into v_pending_over_rank
    from clara.firm_invites fi
    left join clara.firm_memberships m
      on m.user_id = fi.invited_by and m.firm_id = fi.firm_id and m.status = 'active'
   where fi.status = 'pending' and clara.role_rank(fi.role) > coalesce(clara.role_rank(m.role), -1);
  if v_pending_over_rank::text is distinct from (select v from _p4t2_pre where k = 'pending_invites_over_issuer_rank.pre') then
    raise exception 'p4t2 tail: the pending-invites-over-issuer-rank count moved during this migration (was %, now %) -- this file must never touch existing invite rows',
      (select v from _p4t2_pre where k = 'pending_invites_over_issuer_rank.pre'), v_pending_over_rank using errcode = 'CLR10';
  end if;

  -- (5) approve_firm_registration routes through the core with the REQUEST'S applicant (never the
  --     operator), carries the self-decision wall (F7), and binds its dedupe hash to c.actor
  --     (F10). Comment-stripped (F4) before every substring match.
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.approve_firm_registration(uuid,text)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_bad, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('_create_firm_core' in v_code) = 0 then
    raise exception 'p4t2 tail: approve_firm_registration does not route through _create_firm_core' using errcode = 'CLR10';
  end if;
  if position('_create_firm_core(req.applicant' in v_code) = 0 then
    raise exception 'p4t2 tail: approve_firm_registration does not pass the REQUEST''S applicant as the core actor' using errcode = 'CLR10';
  end if;
  if position('_create_firm_core(c.actor' in v_code) > 0 or position('_create_firm_core(v_actor' in v_code) > 0 then
    raise exception 'p4t2 tail: approve_firm_registration appears to pass the OPERATOR as the core actor' using errcode = 'CLR10';
  end if;
  if position('req.applicant = c.actor' in v_code) = 0 then
    raise exception 'p4t2 tail: approve_firm_registration is missing the self-decision wall (F7)' using errcode = 'CLR10';
  end if;
  if position($q$'actor', c.actor$q$ in v_code) = 0 then
    raise exception 'p4t2 tail: approve_firm_registration''s dedupe hash is not bound to c.actor (F10)' using errcode = 'CLR10';
  end if;

  -- (5b) reject_firm_registration: reason-required wall, self-decision wall (F7), and actor-bound
  --      dedupe hash (F10) -- comment-stripped CODE (F4), all pins.
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.reject_firm_registration(uuid,text,text)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_bad, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('a rejection reason is required' in v_code) = 0 then
    raise exception 'p4t2 tail: reject_firm_registration has no reason-required wall in CODE' using errcode = 'CLR10';
  end if;
  if position('req.applicant = c.actor' in v_code) = 0 then
    raise exception 'p4t2 tail: reject_firm_registration is missing the self-decision wall (F7)' using errcode = 'CLR10';
  end if;
  if position($q$'actor', c.actor$q$ in v_code) = 0 then
    raise exception 'p4t2 tail: reject_firm_registration''s dedupe hash is not bound to c.actor (F10)' using errcode = 'CLR10';
  end if;

  -- (4e) request_firm_registration carries its OWN is_agent wall and F6's arg-mismatch refusal --
  --      comment-stripped CODE (F4), not merely present in raw text.
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.request_firm_registration(text,text,text)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_bad, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('the agent identity cannot request a firm registration' in v_code) = 0 then
    raise exception 'p4t2 tail: request_firm_registration is missing its own is_agent wall in CODE' using errcode = 'CLR10';
  end if;
  if position('op_key reused with different args' in v_code) = 0 then
    raise exception 'p4t2 tail: request_firm_registration is missing the arg-complete replay refusal (F6)' using errcode = 'CLR10';
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
  --     byte-unchanged. F8's tail additions: forced RLS is what makes the policy real, and
  --     clara_authenticated holds EXACTLY SELECT, never a write privilege.
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
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relname = 'counterparty_aliases' and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'p4t2 tail: counterparty_aliases lost forced RLS -- the new policy is only real because of it (F8 tail addition)' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'clara' and table_name = 'counterparty_aliases' and grantee = 'clara_authenticated'
       and privilege_type <> 'SELECT'
  ) then
    raise exception 'p4t2 tail: clara_authenticated holds more than SELECT on counterparty_aliases (F8 tail addition)' using errcode = 'CLR10';
  end if;

  -- (8b) Conductor condition (c) + F4's fix: the operator-authority fragment (existence) AND the
  --      owner-rank floor (F4's own finding: an owner->admin edit in the rank literal survived
  --      both the census and the battery, untouched) are byte-copies across
  --      approve_firm_registration, reject_firm_registration and the view -- both proven by
  --      comment-stripped, normalized substring match. A future edit to any ONE of the three
  --      without the other two, or a rank downgrade in any one, fails this check loudly.
  --
  --      The comparison is normalized (comments stripped, lowercase, all whitespace stripped), not
  --      a raw byte substring match, for a reason measured empirically this session rather than
  --      assumed: pg_get_viewdef() reconstructs the view's SQL from the parsed query tree on every
  --      call -- it is NOT the verbatim text as authored (unlike prosrc on a PL/pgSQL function,
  --      which IS stored close-to-verbatim). A throwaway scratch view proved this: the literal
  --      fragment `exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and
  --      f.is_operator)` comes back from pg_get_viewdef as `EXISTS ( SELECT 1\n   FROM
  --      clara.firms f\n  WHERE f.id = clara.jwt_firm() AND f.is_operator)` -- uppercased
  --      keywords and reformatted whitespace, even though the `f` alias (added to this file for
  --      exactly this reason -- see §D and §E's own comments) keeps Postgres from ALSO
  --      auto-qualifying the bare columns as `firms.id`/`firms.is_operator`, which would have been
  --      a second, non-cosmetic divergence no amount of whitespace/case normalization could close.
  --      Comment-stripping (F4) then lowercasing and stripping whitespace absorbs both the
  --      reformatting AND a comment-maskable defeat, while still failing loudly on any REAL
  --      structural drift (a different function call, a different operator, a missing/extra
  --      token, a downgraded rank literal) between the three bodies.
  declare
    v_frag constant text := $q$exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)$q$;
    v_frag_norm constant text := regexp_replace(lower(v_frag), '\s+', '', 'g');
    v_rank_frag constant text := $q$clara.role_rank('owner'$q$;
    v_rank_frag_norm constant text := regexp_replace(lower(v_rank_frag), '\s+', '', 'g');
    v_strip text;
  begin
    select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.approve_firm_registration(uuid,text)'::regprocedure;
    v_strip := regexp_replace(regexp_replace(lower(v_bad), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_strip := regexp_replace(v_strip, '\s+', '', 'g');
    if position(v_frag_norm in v_strip) = 0 then
      raise exception 'p4t2 tail: approve_firm_registration no longer carries the shared operator-authority fragment' using errcode = 'CLR10';
    end if;
    if position(v_rank_frag_norm in v_strip) = 0 then
      raise exception 'p4t2 tail: approve_firm_registration no longer carries the shared owner-rank floor (F4)' using errcode = 'CLR10';
    end if;

    select p.prosrc into v_bad from pg_proc p where p.oid = 'clara.reject_firm_registration(uuid,text,text)'::regprocedure;
    v_strip := regexp_replace(regexp_replace(lower(v_bad), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_strip := regexp_replace(v_strip, '\s+', '', 'g');
    if position(v_frag_norm in v_strip) = 0 then
      raise exception 'p4t2 tail: reject_firm_registration no longer carries the shared operator-authority fragment' using errcode = 'CLR10';
    end if;
    if position(v_rank_frag_norm in v_strip) = 0 then
      raise exception 'p4t2 tail: reject_firm_registration no longer carries the shared owner-rank floor (F4)' using errcode = 'CLR10';
    end if;

    select pg_get_viewdef('clara.firm_registration_requests_visible'::regclass, true) into v_bad;
    -- pg_get_viewdef never emits /* */ or -- comments of its own, so the comment-strip step is a
    -- no-op here -- applied anyway for one uniform pipeline across all three sources rather than a
    -- special-cased view path.
    v_strip := regexp_replace(regexp_replace(lower(v_bad), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_strip := regexp_replace(v_strip, '\s+', '', 'g');
    if position(v_frag_norm in v_strip) = 0 then
      raise exception 'p4t2 tail: firm_registration_requests_visible no longer carries the shared operator-authority fragment' using errcode = 'CLR10';
    end if;
    if position(v_rank_frag_norm in v_strip) = 0 then
      raise exception 'p4t2 tail: firm_registration_requests_visible no longer carries the shared owner-rank floor (F4)' using errcode = 'CLR10';
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

  -- (10) F9: constraint 15, the frozen schemas -- REPORTED, not asserted at zero (the Slice-0
  --      parked run lives there on live, so a census that reads green only because the fixture is
  --      empty is the vacuous-green class; 0140's own shape). What this file can positively claim
  --      is that none of its own new or patched names resolve inside them.
  select count(*)::int into v_frozen from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('workflow', 'graphile_worker', 'spike');
  if to_regclass('workflow.firm_registration_requests') is not null
     or to_regclass('graphile_worker.firm_registration_requests') is not null
     or to_regclass('spike.firm_registration_requests') is not null then
    raise exception 'p4t2 tail: firm_registration_requests exists in a frozen schema' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('workflow', 'graphile_worker', 'spike')
       and p.proname in ('request_firm_registration', 'approve_firm_registration', 'reject_firm_registration',
                          '_create_firm_core', 'create_firm', 'set_member_role', '_add_member_core', 'invite_member',
                          'add_member', 'accept_invite')
  ) then
    raise exception 'p4t2 tail: a p4t2 function name resolves inside a frozen schema' using errcode = 'CLR10';
  end if;

  raise notice 'p4t2 tail: OK -- clara.firm_registration_requests live (forced RLS, owner-only, zero clara_authenticated grant, 1 partial-unique index); request_firm_registration/approve_firm_registration/reject_firm_registration/create_firm all live with exact ACLs (4 human entrances reach clara_authenticated only, _create_firm_core ungranted everywhere, zero PUBLIC/agent/wake/runtime reach anywhere); create_firm''s existence/is_agent wall now runs at the ENTRANCE, positionally BEFORE the admission-token lookup, and still in the core too (F1); set_member_role/invite_member/add_member all carry the role-ceiling wall in comment-stripped CODE, ACL byte-unchanged, prosrc genuinely changed (F2); accept_invite carries the issuer-rank re-check wall (F2 round 2 ruling (i)), and % pending invite(s) exceed their issuer''s rank estate-wide, byte-unchanged across this transaction (reported, not asserted zero); _add_member_core carries F3''s unique_violation translation ONLY -- proven NEGATIVELY to carry no ceiling logic of its own, per round 2''s entrances-only ruling; _create_firm_core''s membership insert translates unique_violation to the typed CLR10 (F3); approve/reject carry the self-decision wall and an actor-bound dedupe hash (F7/F10); request_firm_registration carries its own is_agent wall AND the arg-complete replay refusal (F6); firm_registration_requests_visible (10 cols, security_barrier) closed-world column census clean, decided_by masked to the operator scope only (F11); the shared operator-authority fragment AND the shared owner-rank floor both byte-match, comment-stripped and normalized, across both doors and the view (F4); firm_registration.approved/rejected registered at the active taxonomy version as context_update; counterparty_aliases'' new human-read policy is BYTE-IDENTICAL to counterparties'' own (the measured shape, firm-only), forced RLS intact, clara_authenticated holds EXACTLY SELECT, the grant lands, clara_freeform_ro is untouched, and no agent/wake/runtime role gained reach (F8 tail additions); uq_membership_active_user and uq_firms_one_operator byte-untouched; constraint 15 (frozen schemas) holds % relation(s) estate-wide (reported, not asserted zero) and zero of them are this file''s own names (F9).', v_pending_over_rank, v_frozen;
end $$;
