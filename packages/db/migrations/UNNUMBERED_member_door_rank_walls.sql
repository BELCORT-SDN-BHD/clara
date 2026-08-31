-- =================================================================================================
-- Member-door rank walls -- closing #455 review's BLOCKER + M1 + M2. G14 RULED 裁-94, the
-- 2026-09-01 morning sitting: KEEP THE WALL -- a subordinate never acts on a strict superior
-- (equal rank stays allowed: owner-on-owner, admin-on-admin); no self-demotion or self-removal.
-- This is now the ruled shape, not a pending default -- the recommendation was taken as-is; the
-- accepted cost is named in docs/plan/active/mohe-grill-rulings-2026-08-31.md's 裁-94 entry (an
-- admin who genuinely needs to act on an owner must ask another owner).
--
-- THE FINDING (from #455's fresh review, verified fresh at the live bodies before writing this
-- file):
--   set_member_role (0145:592-620) compares only the ASSIGNED role to the caller -- never the
--     TARGET's current rank. An admin can demote an owner to bookkeeper: the F2 ceiling (0145)
--     only stops an admin ASSIGNING 'owner', it says nothing about the rank of who is being acted
--     on.
--   remove_member (0005:732-751) has NO rank comparison at all -- never re-cut since 0005 -- and
--     reserves the op (_reserve_op) BEFORE any of its walls run.
--   revoke_invite (0141:466-484) carries the identical two defects as remove_member (no rank
--     wall, reserve-before-wall), one door over: an invite's role stands in for a not-yet-real
--     membership's rank.
--   Net (M1): an admin demotes or removes any owner but the last in two clicks on #455's new
--   surface -- set_member_role(target, 'bookkeeper') then remove_member(target), or
--   revoke_invite on an owner-role invite an admin has no business touching.
--
-- THIS FILE -- three recuts, CREATE OR REPLACE, each body's existing behaviour otherwise
-- unchanged (read fresh from the live catalog below, in the §0 prestate, before any DDL runs):
--
--   (1) TARGET-RANK WALL, all three doors. Refuses (CLR04, detail.reason=cannot_act_on_superior)
--       when the TARGET's CURRENT rank -- for revoke_invite, the INVITE's own `role` column,
--       since there is no membership yet -- is STRICTLY greater than
--       coalesce(clara.actor_role_rank(), -1). Strictly-greater only: owner-on-owner and
--       admin-on-admin stay allowed, mirroring the existing assigned-role ceiling's `>` (0145 F2,
--       `cannot assign a role above your own rank`). This wall is additional to, not a
--       replacement for, that existing ceiling.
--
--   (2) AUTHZ-BEFORE / LIFECYCLE-AFTER REORDER, all three doors. Every AUTHZ-class wall
--       (firm-membership scope, the new target-rank wall, the new self-act wall) now runs BEFORE
--       _reserve_op; every LIFECYCLE-class check (active/pending status) runs AFTER it, inside the
--       non-replay branch -- accept_invite's own established split (0141:420 the email-match wall
--       before dedupe at :432, :442 the status/expiry checks after), applied uniformly to all
--       three doors here for the first time. set_member_role's own target-membership fetch is
--       ALSO moved before _reserve_op: a structural necessity of walls (1) and (3) needing the
--       target row's CURRENT role and user_id to compare against.
--
--       #482 REVIEW MATERIAL-1 CORRECTION: this file's first cut moved the LIFECYCLE checks
--       BEFORE _reserve_op too (an over-broad "every wall wall-first" reading of 0145:598-606,
--       which only ever meant the ASSIGNED-role ceiling -- an AUTHZ wall). That breaks a
--       legitimate same-op_key retry after success (a lost HTTP response, a courier re-drive):
--       remove_member/revoke_invite's own mutation flips the very state their premature status
--       check re-read, so a retry hit a fresh CLR11/CLR09 instead of the cached receipt
--       (ARCHITECTURE.md: a retry is a no-op, not a duplicate). Fixed by moving LIFECYCLE checks
--       to AFTER the dedupe branch in all three doors. Two consequences, both DELIBERATE and
--       pinned by mdrw-rank-walls.test.mjs, not incidental: (i) a FRESH op_key acting on an
--       ALREADY-INACTIVE target that ALSO fails the self/rank walls now answers CLR04, not the
--       LIFECYCLE code that fired under the old order ("mdrw.precedence" cells); (ii) a same-
--       op_key REPLAY of a successful call returns the identical cached receipt in all three
--       doors ("mdrw.replay" cells).
--
--   (3) SELF-ACT REFUSAL (M2), set_member_role and remove_member only. `m.user_id = c.actor`
--       refuses (CLR04, detail.reason=cannot_act_on_self) -- the lockout foot-gun: an actor
--       changing or removing their OWN membership with no recovery path but another owner.
--       Invites have no self case (an invite has no actor-in-place to self-act on) -- revoke_invite
--       gets walls (1) and (2) only, per the order above. CARVE-OUT, found by this file's own rig
--       run against the pre-existing T14/T14-HIGH-11 cells (rig-isolation.test.mjs): the SOLE
--       owner acting on themselves is ALSO the pre-existing clara._tf_guard_last_owner case, and
--       the estate's established contract answers THAT with the more specific CLR09
--       ("cannot demote/remove the last active owner"), not this wall's generic CLR04 -- both
--       bodies read the trigger's own condition before raising, and skip the self-act refusal in
--       exactly that case so the UPDATE still reaches the trigger, unchanged from before this file.
--
--   (4) clara._tf_guard_last_owner (0003:415, attached 0003:477) is UNTOUCHED by this file -- it
--       remains the final backstop under every wall above. The §K tail proves this NEGATIVELY:
--       its prosrc is byte-identical to the §0 prestate stash.
--
--   (5) #482 REVIEW CODEX ADVERSARIAL LEG (F-C1/F-C2/F-C3), concurrency/TOCTOU class, all
--       PRE-EXISTING hazards hardened in passing (confirmed against the pre-PR live prosrc:
--       _human_ctx's floor check ran before ANY lock in all three original bodies too), never
--       introduced by this file:
--       F-C1 (HIGH, set_member_role + remove_member) -- actor authority was evaluated only ONCE,
--       before the firm lock; an actor demoted/removed WHILE blocked on that lock could complete
--       the call on privilege no longer held once unblocked (the target-rank/self walls only
--       compare RELATIVE rank, so they do not by themselves catch this). Fixed: after the lock,
--       re-read the actor's OWN membership FRESH and firm-qualified, re-verify liveness AND the
--       admin floor, and source every downstream wall verdict from that read -- never
--       clara.actor_role_rank() (0002:447), which the F-C2 finding also names for carrying no
--       firm predicate at all.
--       F-C2 (HIGH, revoke_invite) -- the rank re-read used clara.actor_role_rank(), unscoped by
--       firm: an actor who moves their own membership from firm A to firm B while the invite row
--       stays locked would have their FIRM-B rank compared against a FIRM-A invite -- cross-firm
--       authority confusion. Fixed the same way as F-C1: a fresh, firm-qualified read.
--       F-C3 (LOW, revoke_invite) -- the invite's FOR UPDATE lock ran BEFORE the firm-scope check,
--       so a cross-firm invite id probe blocked on a foreign tenant's lock (an existence/latency
--       oracle). Fixed: firm_id sits IN the locking WHERE itself, so a cross-firm id matches zero
--       rows and refuses immediately, no lock contention.
--       Final order per door, precedence table restated in the PR body: op_key/format checks ->
--       firm lock/scope -> fresh firm-qualified actor re-validation (liveness + floor) -> the
--       remaining AUTHZ walls (assigned-role ceiling, self-act, target-rank), all sourced from
--       that fresh read -> _reserve_op -> LIFECYCLE checks -> the mutation.
--
-- D1 WRITE-QUIESCE (packages/db/README.md, "Deploy contract"): THREE live writer bodies are
-- replaced by this file -- clara.set_member_role, clara.remove_member, clara.revoke_invite. An
-- in-flight call spanning the deploy would otherwise silently finish on the OLD body and skip
-- these walls. The application write-quiesce window is named in the PR body.
--
-- D2 re-witness: does not apply. Confirmed by grep across every migration file's INSERT INTO
-- clara.control_witnesses before writing this file -- none of the three patched functions is
-- named there (the table is 0154's, an unrelated "binding proposal" domain).
--
-- Error codes per the 0002 header: CLR04 authz/actor, CLR09 invariant/lifecycle guard, CLR10
-- bad-request/conflict, CLR11 not-in-your-firm.
-- =================================================================================================

-- =================================================================================================
-- §0 -- PRESTATE. Every claim this file makes about what it edits or depends on, measured before
-- anything is created. Aborts on a false premise rather than proceeding on a guess.
-- =================================================================================================
create temp table _mdrw_pre(k text primary key, v text) on commit drop;

do $$
declare v_missing text; v_acl text; v_owner text; v_src text; v_n int;
begin
  -- (1) Every EXISTING object this file depends on or patches must resolve, by exact signature --
  --     the superseded-body class: re-run against the LIVE catalog, not a stale assumption.
  select string_agg(n, ', ') into v_missing from (values
    ('clara.role_rank(text)'), ('clara.actor_role_rank()'), ('clara._human_ctx(integer)'),
    ('clara._reserve_op(uuid,text,text,bytea)'), ('clara._finish_op(uuid,text,text,jsonb)'),
    ('clara._hash(jsonb)'), ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
    ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
    ('clara.set_member_role(uuid,text,text)'), ('clara.remove_member(uuid,text)'),
    ('clara.revoke_invite(uuid,text)'), ('clara._tf_guard_last_owner()')
  ) t(n) where to_regprocedure(n) is null;
  if v_missing is not null then
    raise exception 'mdrw prestate: depended-upon function(s) missing -- % (superseded-body class: re-run against the LIVE catalog, not a stale assumption)', v_missing using errcode = 'CLR10';
  end if;
  if to_regclass('clara.firms') is null or to_regclass('clara.firm_memberships') is null
     or to_regclass('clara.firm_invites') is null or to_regclass('clara.wake_credentials') is null then
    raise exception 'mdrw prestate: a depended-upon table is missing' using errcode = 'CLR10';
  end if;

  -- (2) clara._tf_guard_last_owner is genuinely ATTACHED as a trigger on firm_memberships -- this
  --     file leans on it staying the backstop under the new walls, never touches it, and the tail
  --     re-proves this negatively.
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'clara.firm_memberships'::regclass
       and t.tgfoid = 'clara._tf_guard_last_owner()'::regprocedure
       and not t.tgisinternal
  ) then
    raise exception 'mdrw prestate: _tf_guard_last_owner is not attached to clara.firm_memberships' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_guard_last_owner()'::regprocedure;
  insert into _mdrw_pre(k, v) values ('tf_guard_last_owner.prosrc', v_src);

  -- (3) firm_invites.role is the text column this file reads as revoke_invite's "target rank"
  --     source (there is no membership yet for a pending invite).
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'firm_invites' and column_name = 'role' and data_type = 'text'
  ) then
    raise exception 'mdrw prestate: clara.firm_invites.role (text) is missing' using errcode = 'CLR10';
  end if;

  -- (4) Stash set_member_role's CURRENT prosrc + ACL + owner, and confirm it is genuinely the
  --     F2-fixed live body (0145) this file is patching, not a stale pre-F2 assumption.
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.set_member_role(uuid,text,text)'::regprocedure;
  insert into _mdrw_pre(k, v) values
    ('set_member_role.prosrc', v_src), ('set_member_role.acl', v_acl), ('set_member_role.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'mdrw prestate: clara.set_member_role is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('membership not in your firm' in v_src) = 0
     or position('cannot assign a role above your own rank' in v_src) = 0 then
    raise exception 'mdrw prestate: set_member_role''s LIVE body is missing an expected wall string (not the F2-fixed body?) -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;

  -- (5) Stash remove_member's CURRENT prosrc + ACL + owner, and confirm the pre-fix shape: it has
  --     NEVER carried a rank wall (the finding's own premise), so this positively demonstrates the
  --     gap exists before this file closes it.
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.remove_member(uuid,text)'::regprocedure;
  insert into _mdrw_pre(k, v) values
    ('remove_member.prosrc', v_src), ('remove_member.acl', v_acl), ('remove_member.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'mdrw prestate: clara.remove_member is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('membership not in your firm' in v_src) = 0 then
    raise exception 'mdrw prestate: remove_member''s LIVE body is missing the expected firm wall -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;
  -- Confirms the finding's own premise: remove_member's floor check already calls
  -- role_rank('admin') (every sibling entrance does, via _human_ctx), so a bare substring search
  -- on "role_rank" would be vacuously true -- what must be ABSENT pre-edit is the actual new wall
  -- this file adds, not any use of the helper.
  if position('cannot act on a member ranked above you' in v_src) > 0
     or position('cannot_act_on_superior' in v_src) > 0
     or position('cannot_act_on_self' in v_src) > 0 then
    raise exception 'mdrw prestate: remove_member unexpectedly already carries a rank/self wall -- the "never re-cut since 0005" premise this file''s header states does not hold, re-verify before patching' using errcode = 'CLR10';
  end if;

  -- (6) Stash revoke_invite's CURRENT prosrc + ACL + owner, same pre-fix confirmation.
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.revoke_invite(uuid,text)'::regprocedure;
  insert into _mdrw_pre(k, v) values
    ('revoke_invite.prosrc', v_src), ('revoke_invite.acl', v_acl), ('revoke_invite.owner', v_owner);
  if v_owner <> 'clara_fn_owner' then
    raise exception 'mdrw prestate: clara.revoke_invite is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  if position('invite not in your firm' in v_src) = 0 then
    raise exception 'mdrw prestate: revoke_invite''s LIVE body is missing the expected firm wall -- re-read the live catalog before patching' using errcode = 'CLR10';
  end if;
  -- Same correction as remove_member's (5): the floor check already calls role_rank('admin'), so
  -- what must be ABSENT pre-edit is the new wall itself, not any use of the helper.
  if position('cannot act on an invite ranked above you' in v_src) > 0
     or position('cannot_act_on_superior' in v_src) > 0 then
    raise exception 'mdrw prestate: revoke_invite unexpectedly already carries a rank wall -- the "no rank wall" premise this file''s header states does not hold, re-verify before patching' using errcode = 'CLR10';
  end if;

  -- (7) Report (never assert zero -- absence is not evidence, and a live estate is not this
  --     file's to silently correct) the plain population this migration's new walls will start
  --     covering: how many firms have more than one owner (the only population the
  --     strictly-greater rule ever lets an owner act on another owner within).
  select count(*)::int into v_n from (
    select firm_id from clara.firm_memberships where status = 'active' and role = 'owner'
     group by firm_id having count(*) > 1
  ) x;
  insert into _mdrw_pre(k, v) values ('firms_with_multiple_owners.pre', v_n::text);

  raise notice 'mdrw prestate: OK -- 12 depended-upon functions + 4 depended-upon tables resolve, _tf_guard_last_owner confirmed attached to firm_memberships (prosrc stashed), firm_invites.role (text) confirmed, set_member_role/remove_member/revoke_invite prosrc+acl+owner all stashed with set_member_role confirmed as the F2-fixed live body and remove_member/revoke_invite confirmed to carry NEITHER the new rank wall NOR the new self-act wall pre-edit (the finding''s own premise -- their pre-existing role_rank(''admin'') floor call via _human_ctx is expected and not itself a wall), % firm(s) estate-wide carry more than one active owner (reported, the only population owner-on-owner ever applies within).', v_n;
end $$;

set role clara_fn_owner;

-- Precautionary, not load-bearing: this file only recuts three small PL/pgSQL bodies (no bulk
-- data DDL, no new index, no table rewrite) -- the bound wait is the same 0131/0138/0145 shape
-- applied on principle, not because any of these three CREATE OR REPLACE statements is expected
-- to queue.
set local lock_timeout = '15s';

-- =================================================================================================
-- §A -- set_member_role. Adds the target-rank wall (1) and the self-act wall (3); moves the target
-- membership fetch and firm-scope check to BEFORE _reserve_op so both new AUTHZ walls can read
-- the target row wall-first (idiom (2)); the LIFECYCLE status check is deferred to AFTER the
-- dedupe branch (#482 review MATERIAL-1). The pre-existing F2 assigned-role ceiling wall is
-- untouched, in its original position.
-- =================================================================================================
create or replace function clara.set_member_role(p_membership uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record; v_actor_role text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  -- #482 REVIEW F-C1 FIX (Codex adversarial leg, HIGH): _human_ctx's floor check (and, in the
  -- pre-PR live body, the F2 ceiling too) ran BEFORE any lock -- a PRE-EXISTING hazard, confirmed
  -- against 0145's live prosrc before this fix (both ran before the firm lock there as well, and
  -- the firm lock itself came even LATER, after _reserve_op) -- hardened in passing here, not
  -- introduced by this file. Race: an owner holds the firm lock demoting actor A (still admin in
  -- committed state); A's own call passes _human_ctx's floor check on that stale snapshot, then
  -- blocks on the SAME lock; once the owner commits and A's call resumes, nothing had re-verified
  -- A still meets the floor -- the target-rank/self walls only compare RELATIVE rank, so a
  -- just-demoted A could still act on a target ranked below their NEW (lower) role. FIX: after
  -- the lock, re-read the actor's OWN membership FRESH, firm-qualified (never
  -- clara.actor_role_rank(), 0002:447, which carries NO firm predicate at all -- the same
  -- cross-firm confusion class F-C2 names for revoke_invite), and re-verify BOTH liveness and the
  -- admin floor before any wall verdict below is trusted. The (pre-existing) F2 ceiling is moved
  -- here too, sourced from this fresh read, per the same fix.
  perform 1 from clara.firms where id = c.firm for update;
  select m2.role into v_actor_role
    from clara.firm_memberships m2
   where m2.user_id = c.actor and m2.firm_id = c.firm and m2.status = 'active';
  if v_actor_role is null or clara.role_rank(v_actor_role) < clara.role_rank('admin') then
    raise exception 'you no longer meet the required rank for this action' using errcode = 'CLR04', detail = '{"reason":"actor_rank_changed"}';
  end if;
  -- F2 fix (0145), moved here (post-lock, fresh firm-qualified read) by the F-C1 fix above: the
  -- ASSIGNED-role ceiling -- an actor may never assign a role above their own rank.
  if clara.role_rank(p_role) > clara.role_rank(v_actor_role) then
    raise exception 'cannot assign a role above your own rank' using errcode = 'CLR04';
  end if;
  -- #455 review finding (BLOCKER): the ceiling above compares only the ASSIGNED role to the
  -- caller -- never the TARGET's CURRENT rank. The target row is fetched HERE.
  --
  -- #482 REVIEW MATERIAL-1 FIX: AUTHZ-class walls (firm-scope, self-act, target-rank) run BEFORE
  -- _reserve_op, matching accept_invite's own established idiom (0141:420 the email-match wall
  -- before dedupe at :432, :442 the status/expiry checks AFTER) -- so a legitimate same-op_key
  -- retry after success (a lost HTTP response, a courier re-drive) hits the dedupe branch and
  -- returns the cached receipt, never a fresh refusal (ARCHITECTURE.md: a retry is a no-op, not a
  -- duplicate). The LIFECYCLE check (m.status) is deferred to AFTER _reserve_op, in the
  -- non-replay branch below, because a successful call CAN move the target out of the state that
  -- check verifies (a concurrent remove_member on this same row between an original call and a
  -- retry) -- checking status again before the dedupe would wrongly refuse the legitimate retry
  -- on a state some call itself produced. The first cut of this file got this backwards (status
  -- checked before the AUTHZ walls); fixed here.
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  -- M2, self-act refusal, ruled 裁-94 (2026-09-01 morning: KEEP THE WALL): an actor may not
  -- change their OWN role through this door -- a self-demotion lockout with no recovery path but
  -- another owner. CARVE-OUT (fix, found by this file's own rig run against T14/T14-HIGH-11 in
  -- rig-isolation.test.mjs): the SOLE owner demoting themselves is ALSO the pre-existing
  -- guard_last_owner (0003:415/477) case, which the estate's established contract answers with
  -- the MORE SPECIFIC CLR09 ("cannot demote/remove the last active owner"), not a generic
  -- self-act CLR04 -- this wall must not pre-empt that trigger. The exists-check below is the
  -- trigger's own condition, read before the wall runs, never a new invariant: skip the self-act
  -- refusal in exactly the case guard_last_owner would fire, and fall through to let the UPDATE
  -- (and the trigger) answer with CLR09, exactly as it did before this file.
  if m.user_id = c.actor
     and not (m.role = 'owner' and p_role <> 'owner' and not exists (
       select 1 from clara.firm_memberships m2 join clara.users u2 on u2.id = m2.user_id
        where m2.firm_id = c.firm and m2.role = 'owner' and m2.status = 'active'
          and m2.id <> m.id and u2.is_agent = false
     ))
  then
    raise exception 'cannot change your own role' using errcode = 'CLR04', detail = '{"reason":"cannot_act_on_self"}';
  end if;
  -- #455 review finding (BLOCKER), the target-rank wall, ruled 裁-94: refuses acting on a target
  -- whose CURRENT rank exceeds the caller's. Strictly-greater only -- owner-on-owner and
  -- admin-on-admin stay allowed, mirroring the assigned-role ceiling's `>`. Sourced from the
  -- fresh v_actor_role (F-C1 fix), never clara.actor_role_rank().
  if clara.role_rank(m.role) > clara.role_rank(v_actor_role) then
    raise exception 'cannot act on a member ranked above you' using errcode = 'CLR04', detail = '{"reason":"cannot_act_on_superior"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_member_role', p_op_key,
    clara._hash(jsonb_build_object('mem', p_membership, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- LIFECYCLE check, deferred (MATERIAL-1): reached only on a fresh, non-replay call. A NEW
  -- op_key acting on an already-inactive target that ALSO fails the self/rank walls above answers
  -- THAT refusal (CLR04), never reaching here -- a chosen contract (#482 review point b), pinned
  -- by mdrw-rank-walls.test.mjs's "mdrw.precedence" cell, not silent drift.
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

-- =================================================================================================
-- §B -- remove_member. AUTHZ-before/LIFECYCLE-after reorder (2): firm/rank/self run BEFORE
-- _reserve_op; the active-status check runs AFTER it (#482 review MATERIAL-1). Adds the
-- target-rank wall (1) and the self-act wall (3).
-- =================================================================================================
create or replace function clara.remove_member(p_membership uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record; v_actor_role text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  -- #455 review finding (BLOCKER + wall-first reorder): this door had NO rank comparison at all
  -- (never re-cut since 0005) and reserved the op BEFORE its walls.
  --
  -- #482 REVIEW F-C1 FIX (Codex adversarial leg, HIGH): _human_ctx's floor check ran BEFORE any
  -- lock in the pre-PR live body too (0005's original had no firm lock at all before
  -- _reserve_op) -- a PRE-EXISTING hazard, hardened in passing here; see set_member_role's
  -- identical header comment for the full race and fix reasoning. Re-read the actor's OWN
  -- membership FRESH, firm-qualified, after the lock, and re-verify the admin floor before any
  -- wall verdict below is trusted.
  perform 1 from clara.firms where id = c.firm for update;
  select m2.role into v_actor_role
    from clara.firm_memberships m2
   where m2.user_id = c.actor and m2.firm_id = c.firm and m2.status = 'active';
  if v_actor_role is null or clara.role_rank(v_actor_role) < clara.role_rank('admin') then
    raise exception 'you no longer meet the required rank for this action' using errcode = 'CLR04', detail = '{"reason":"actor_rank_changed"}';
  end if;
  --
  -- #482 REVIEW MATERIAL-1 FIX: AUTHZ-class walls (firm, rank, self) run BEFORE _reserve_op,
  -- matching accept_invite's own idiom (0141:420/442) -- see set_member_role's identical header
  -- comment above for the full reasoning. The LIFECYCLE check (m.status) is deferred to AFTER
  -- _reserve_op: this door's OWN mutation flips status to 'removed', so checking it again BEFORE
  -- the dedupe would refuse a legitimate same-op_key retry on the exact state THIS call produced
  -- -- the first cut of this file got this backwards; fixed here.
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  -- M2, self-act refusal, ruled 裁-94: an actor may not remove their OWN membership through this
  -- door. CARVE-OUT (fix, found by this file's own rig run against T14/T14-HIGH-11 in
  -- rig-isolation.test.mjs): the SOLE owner removing themselves is ALSO the pre-existing
  -- guard_last_owner (0003:415/477) case, which the estate's established contract answers with
  -- the MORE SPECIFIC CLR09, not a generic self-act CLR04 -- see set_member_role's identical
  -- carve-out above for the full reasoning; the exists-check mirrors the trigger's own condition.
  if m.user_id = c.actor
     and not (m.role = 'owner' and not exists (
       select 1 from clara.firm_memberships m2 join clara.users u2 on u2.id = m2.user_id
        where m2.firm_id = c.firm and m2.role = 'owner' and m2.status = 'active'
          and m2.id <> m.id and u2.is_agent = false
     ))
  then
    raise exception 'cannot remove your own membership' using errcode = 'CLR04', detail = '{"reason":"cannot_act_on_self"}';
  end if;
  -- #455 review finding (BLOCKER), the target-rank wall, ruled 裁-94: same shape as
  -- set_member_role's (1) -- strictly-greater only. Sourced from the fresh v_actor_role (F-C1
  -- fix), never clara.actor_role_rank().
  if clara.role_rank(m.role) > clara.role_rank(v_actor_role) then
    raise exception 'cannot act on a member ranked above you' using errcode = 'CLR04', detail = '{"reason":"cannot_act_on_superior"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'remove_member', p_op_key, clara._hash(jsonb_build_object('mem', p_membership)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- LIFECYCLE check, deferred (MATERIAL-1): reached only on a fresh, non-replay call. A NEW
  -- op_key acting on an already-inactive target that ALSO fails the self/rank walls above answers
  -- THAT refusal (CLR04), never reaching here -- a chosen contract (#482 review point b), pinned
  -- by mdrw-rank-walls.test.mjs's "mdrw.precedence" cell, not silent drift.
  if m.status <> 'active' then raise exception 'membership is not active' using errcode = 'CLR11'; end if;
  update clara.firm_memberships set status = 'removed', removed_at = now()
    where id = p_membership and status = 'active';                         -- guard_last_owner backstops CLR09
  update clara.wake_credentials set revoked_at = statement_timestamp()
    where on_behalf_of = m.user_id and firm_id = c.firm and revoked_at is null;
  perform clara._audit(c.firm, c.actor, null, null, 'remove_member', null, jsonb_build_object('membership', p_membership));
  perform clara._append_event(c.firm, 'member.removed', null, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'remove_member', p_op_key, jsonb_build_object('membership_id', p_membership, 'status', 'removed'));
end $$;

-- =================================================================================================
-- §C -- revoke_invite. AUTHZ-before/LIFECYCLE-after reorder (2): firm/rank run BEFORE
-- _reserve_op; the pending-status check runs AFTER it (#482 review MATERIAL-1). Adds the
-- target-rank wall (1), keyed on the INVITE's own `role` column (there is no membership yet). No
-- self case (3): an invite has no actor-in-place to self-act on.
-- =================================================================================================
create or replace function clara.revoke_invite(p_invite uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; inv record; v_actor_role text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  -- #455 review finding (BLOCKER + wall-first reorder), the same class as remove_member: the
  -- AUTHZ walls (firm, rank) now run BEFORE _reserve_op. No self case here.
  --
  -- #482 REVIEW F-C3 FIX (Codex adversarial leg, LOW): firm_id now sits IN the locking WHERE, not
  -- a separate check after the lock -- a cross-firm invite id previously still acquired the FOR
  -- UPDATE lock before the firm check ran (:410's old shape), so probing a foreign tenant's
  -- invite id blocked on THEIR lock -- an existence/latency oracle. A cross-firm id now matches
  -- ZERO rows and refuses immediately, no lock contention at all.
  select * into inv from clara.firm_invites where id = p_invite and firm_id = c.firm for update;
  if not found then raise exception 'invite not in your firm' using errcode = 'CLR11'; end if;
  -- #482 REVIEW F-C2 FIX (Codex adversarial leg, HIGH): the rank re-read must be firm-qualified.
  -- clara.actor_role_rank() (0002:447) reads the actor's SOLE active membership with NO firm
  -- predicate at all. Race: an attacker holds the invite row locked (a slow client, or another
  -- blocked call), moves their OWN membership from firm A to firm B during the hold (removed from
  -- A, accepted into B), and the eventually-unblocked actor_role_rank() read would return
  -- firm-B's rank while inv.firm_id was checked against firm A -- a cross-firm authority
  -- confusion, not a rank comparison that corresponds to any real authority in firm A anymore.
  -- Fixed the same way as F-C1 for the other two doors: a fresh, firm-qualified read of the
  -- actor's own membership, which also re-verifies liveness/floor in this firm post-lock (this
  -- door never had an F2-ceiling-style re-check of its own before this fix).
  select m2.role into v_actor_role
    from clara.firm_memberships m2
   where m2.user_id = c.actor and m2.firm_id = c.firm and m2.status = 'active';
  if v_actor_role is null or clara.role_rank(v_actor_role) < clara.role_rank('admin') then
    raise exception 'you no longer meet the required rank for this action' using errcode = 'CLR04', detail = '{"reason":"actor_rank_changed"}';
  end if;
  -- #455 review finding (BLOCKER), the target-rank wall, ruled 裁-94: the invite's OWN `role`
  -- column stands in for the target rank -- there is no membership yet.
  if clara.role_rank(inv.role) > clara.role_rank(v_actor_role) then
    raise exception 'cannot act on an invite ranked above you' using errcode = 'CLR04', detail = '{"reason":"cannot_act_on_superior"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'revoke_invite', p_op_key, clara._hash(jsonb_build_object('invite', p_invite)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- LIFECYCLE check, deferred (MATERIAL-1): reached only on a fresh, non-replay call. A NEW
  -- op_key acting on an already-revoked/accepted invite that ALSO fails the rank wall above
  -- answers THAT refusal (CLR04), never reaching here -- a chosen contract (#482 review point b),
  -- pinned by mdrw-rank-walls.test.mjs's "mdrw.precedence" cell, not silent drift.
  if inv.status <> 'pending' then
    raise exception 'this invite is no longer open (status: %)', inv.status using errcode = 'CLR09';
  end if;
  update clara.firm_invites set status = 'revoked', revoked_at = now() where id = p_invite;
  perform clara._audit(c.firm, c.actor, null, null, 'revoke_invite', null, jsonb_build_object('invite', p_invite));
  perform clara._append_event(c.firm, 'invite.revoked', null, c.actor, null, null, null, null, null,
    jsonb_build_object('invite', p_invite));
  return clara._finish_op(c.firm, 'revoke_invite', p_op_key, jsonb_build_object('invite_id', p_invite, 'status', 'revoked'));
end $$;

reset role;

-- =================================================================================================
-- §K -- TAIL CENSUS. Re-reads the live catalog; raises on any finding rather than trusting the
-- body above ran as written. Every wall string is matched in COMMENT-STRIPPED code (0145 F4's
-- discipline) -- a comment could otherwise satisfy a naive raw-prosrc string search without the
-- code actually doing anything.
-- =================================================================================================
do $$
declare v_acl_now text; v_owner_now text; v_src_now text; v_code text; v_bad text;
begin
  -- (1) set_member_role: ACL byte-unchanged, owner unchanged, prosrc genuinely changed, both new
  --     walls present in CODE, and both new walls sit BEFORE _reserve_op( positionally (wall-first).
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.set_member_role(uuid,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _mdrw_pre where k = 'set_member_role.acl') then
    raise exception 'mdrw tail: set_member_role''s ACL moved during this migration -- was %, now %',
      (select v from _mdrw_pre where k = 'set_member_role.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'mdrw tail: set_member_role owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _mdrw_pre where k = 'set_member_role.prosrc') then
    raise exception 'mdrw tail: set_member_role''s body is byte-identical to prestate -- the patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('cannot act on a member ranked above you' in v_code) = 0
     or position('cannot_act_on_superior' in v_code) = 0 then
    raise exception 'mdrw tail: set_member_role is missing its target-rank wall in CODE' using errcode = 'CLR10';
  end if;
  if position('cannot change your own role' in v_code) = 0
     or position('cannot_act_on_self' in v_code) = 0 then
    raise exception 'mdrw tail: set_member_role is missing its self-act wall in CODE' using errcode = 'CLR10';
  end if;
  if position('cannot act on a member ranked above you' in v_code) > position('_reserve_op(' in v_code)
     or position('cannot change your own role' in v_code) > position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: set_member_role''s new AUTHZ walls do not run BEFORE _reserve_op (wall-first regressed)' using errcode = 'CLR10';
  end if;
  -- #482 review F-C1 fix: the fresh, firm-qualified actor re-validation is present, runs BEFORE
  -- _reserve_op, and clara.actor_role_rank() (the non-firm-qualified helper the finding named) is
  -- gone from this body entirely -- a strong negative proof it was fully replaced, not just
  -- supplemented.
  if position('actor_rank_changed' in v_code) = 0
     or position('you no longer meet the required rank for this action' in v_code) = 0 then
    raise exception 'mdrw tail: set_member_role is missing the F-C1 post-lock actor re-validation' using errcode = 'CLR10';
  end if;
  if position('you no longer meet the required rank for this action' in v_code) > position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: set_member_role''s F-C1 actor re-validation does not run BEFORE _reserve_op' using errcode = 'CLR10';
  end if;
  if position('actor_role_rank(' in v_code) > 0 then
    raise exception 'mdrw tail: set_member_role still calls the non-firm-qualified clara.actor_role_rank() (F-C1/F-C2 class regressed)' using errcode = 'CLR10';
  end if;
  -- #482 review MATERIAL-1: the LIFECYCLE check (status) must run AFTER _reserve_op -- checking
  -- it before would refuse a legitimate same-op_key retry on state a prior call itself produced.
  if position('membership is not active' in v_code) = 0 then
    raise exception 'mdrw tail: set_member_role lost its lifecycle status check' using errcode = 'CLR10';
  end if;
  if position('membership is not active' in v_code) < position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: set_member_role''s LIFECYCLE status check runs BEFORE _reserve_op (MATERIAL-1 regressed)' using errcode = 'CLR10';
  end if;

  -- (2) remove_member: ACL/owner unchanged, prosrc genuinely changed, both new walls present in
  --     CODE, and every wall (firm, active, rank, self) sits BEFORE _reserve_op( positionally.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.remove_member(uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _mdrw_pre where k = 'remove_member.acl') then
    raise exception 'mdrw tail: remove_member''s ACL moved during this migration -- was %, now %',
      (select v from _mdrw_pre where k = 'remove_member.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'mdrw tail: remove_member owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _mdrw_pre where k = 'remove_member.prosrc') then
    raise exception 'mdrw tail: remove_member''s body is byte-identical to prestate -- the patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('cannot act on a member ranked above you' in v_code) = 0
     or position('cannot_act_on_superior' in v_code) = 0 then
    raise exception 'mdrw tail: remove_member is missing its target-rank wall in CODE' using errcode = 'CLR10';
  end if;
  if position('cannot remove your own membership' in v_code) = 0
     or position('cannot_act_on_self' in v_code) = 0 then
    raise exception 'mdrw tail: remove_member is missing its self-act wall in CODE' using errcode = 'CLR10';
  end if;
  if position('membership not in your firm' in v_code) > position('_reserve_op(' in v_code)
     or position('cannot remove your own membership' in v_code) > position('_reserve_op(' in v_code)
     or position('cannot act on a member ranked above you' in v_code) > position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: remove_member''s AUTHZ walls (firm, self, rank) do not all run BEFORE _reserve_op (wall-first reorder regressed)' using errcode = 'CLR10';
  end if;
  -- #482 review F-C1 fix: same proof as set_member_role's.
  if position('actor_rank_changed' in v_code) = 0
     or position('you no longer meet the required rank for this action' in v_code) = 0 then
    raise exception 'mdrw tail: remove_member is missing the F-C1 post-lock actor re-validation' using errcode = 'CLR10';
  end if;
  if position('you no longer meet the required rank for this action' in v_code) > position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: remove_member''s F-C1 actor re-validation does not run BEFORE _reserve_op' using errcode = 'CLR10';
  end if;
  if position('actor_role_rank(' in v_code) > 0 then
    raise exception 'mdrw tail: remove_member still calls the non-firm-qualified clara.actor_role_rank() (F-C1/F-C2 class regressed)' using errcode = 'CLR10';
  end if;
  -- #482 review MATERIAL-1: the LIFECYCLE check (status) must run AFTER _reserve_op -- this
  -- door's own mutation flips status, so checking it before dedupe would refuse a legitimate
  -- same-op_key retry on the state THIS call itself produced.
  if position('membership is not active' in v_code) = 0 then
    raise exception 'mdrw tail: remove_member lost its lifecycle status check' using errcode = 'CLR10';
  end if;
  if position('membership is not active' in v_code) < position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: remove_member''s LIFECYCLE status check runs BEFORE _reserve_op (MATERIAL-1 regressed)' using errcode = 'CLR10';
  end if;

  -- (3) revoke_invite: ACL/owner unchanged, prosrc genuinely changed, the new wall present in
  --     CODE, no self-act wall added (by design), and every wall sits BEFORE _reserve_op(.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.revoke_invite(uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _mdrw_pre where k = 'revoke_invite.acl') then
    raise exception 'mdrw tail: revoke_invite''s ACL moved during this migration -- was %, now %',
      (select v from _mdrw_pre where k = 'revoke_invite.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'mdrw tail: revoke_invite owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _mdrw_pre where k = 'revoke_invite.prosrc') then
    raise exception 'mdrw tail: revoke_invite''s body is byte-identical to prestate -- the patch did not happen' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('cannot act on an invite ranked above you' in v_code) = 0
     or position('cannot_act_on_superior' in v_code) = 0 then
    raise exception 'mdrw tail: revoke_invite is missing its target-rank wall in CODE' using errcode = 'CLR10';
  end if;
  if position('cannot_act_on_self' in v_code) > 0 then
    raise exception 'mdrw tail: revoke_invite unexpectedly carries a self-act wall -- invites have no self case' using errcode = 'CLR10';
  end if;
  if position('invite not in your firm' in v_code) > position('_reserve_op(' in v_code)
     or position('cannot act on an invite ranked above you' in v_code) > position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: revoke_invite''s AUTHZ walls (firm, rank) do not all run BEFORE _reserve_op (wall-first reorder regressed)' using errcode = 'CLR10';
  end if;
  -- #482 review F-C3 fix: firm_id sits IN the locking WHERE (never a separate check after the
  -- lock) -- a cross-firm invite id must match zero rows and never acquire a foreign tenant's
  -- lock at all.
  if position('where id = p_invite and firm_id = c.firm for update' in v_code) = 0 then
    raise exception 'mdrw tail: revoke_invite''s invite lock no longer scopes firm_id IN the locking WHERE (F-C3 regressed -- a cross-firm probe would contend for a foreign lock again)' using errcode = 'CLR10';
  end if;
  -- #482 review F-C2 fix: same proof shape as F-C1 -- the fresh, firm-qualified actor
  -- re-validation is present, runs BEFORE _reserve_op, and clara.actor_role_rank() (the
  -- non-firm-qualified helper the finding named) is gone from this body entirely.
  if position('actor_rank_changed' in v_code) = 0
     or position('you no longer meet the required rank for this action' in v_code) = 0 then
    raise exception 'mdrw tail: revoke_invite is missing the F-C2 firm-qualified actor re-validation' using errcode = 'CLR10';
  end if;
  if position('you no longer meet the required rank for this action' in v_code) > position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: revoke_invite''s F-C2 actor re-validation does not run BEFORE _reserve_op' using errcode = 'CLR10';
  end if;
  if position('actor_role_rank(' in v_code) > 0 then
    raise exception 'mdrw tail: revoke_invite still calls the non-firm-qualified clara.actor_role_rank() (F-C2 class regressed)' using errcode = 'CLR10';
  end if;
  -- #482 review MATERIAL-1: the LIFECYCLE check (status) must run AFTER _reserve_op -- this
  -- door's own mutation flips status, so checking it before dedupe would refuse a legitimate
  -- same-op_key retry on the state THIS call itself produced.
  if position('this invite is no longer open' in v_code) = 0 then
    raise exception 'mdrw tail: revoke_invite lost its lifecycle status check' using errcode = 'CLR10';
  end if;
  if position('this invite is no longer open' in v_code) < position('_reserve_op(' in v_code) then
    raise exception 'mdrw tail: revoke_invite''s LIFECYCLE status check runs BEFORE _reserve_op (MATERIAL-1 regressed)' using errcode = 'CLR10';
  end if;

  -- (4) _tf_guard_last_owner: untouched, proven negatively -- byte-identical prosrc, still
  --     attached to firm_memberships. The final backstop under every wall above, unmoved.
  select p.prosrc into v_bad from pg_proc p where p.oid = 'clara._tf_guard_last_owner()'::regprocedure;
  if v_bad is distinct from (select v from _mdrw_pre where k = 'tf_guard_last_owner.prosrc') then
    raise exception 'mdrw tail: _tf_guard_last_owner''s prosrc changed -- this file must not touch the last-owner backstop' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'clara.firm_memberships'::regclass
       and t.tgfoid = 'clara._tf_guard_last_owner()'::regprocedure
       and not t.tgisinternal
  ) then
    raise exception 'mdrw tail: _tf_guard_last_owner is no longer attached to clara.firm_memberships' using errcode = 'CLR10';
  end if;

  raise notice 'mdrw tail: OK -- set_member_role/remove_member/revoke_invite all: ACL byte-unchanged, owner still clara_fn_owner, prosrc genuinely changed, new wall(s) present in comment-stripped CODE; every AUTHZ-class wall (firm scope, target-rank, self-act) runs BEFORE _reserve_op, and every LIFECYCLE-class check (active/pending status) runs AFTER it, positionally proven (#482 review MATERIAL-1 fix -- the first cut had this backwards for the lifecycle checks, breaking same-op_key retries); revoke_invite carries no self-act wall (by design, invites have no self case); _tf_guard_last_owner is byte-identical to its prestate stash and remains attached to firm_memberships -- the last-owner backstop is untouched under every new wall; all three bodies carry the F-C1/F-C2 fresh firm-qualified actor re-validation BEFORE _reserve_op and NO LONGER call clara.actor_role_rank() at all (the non-firm-qualified helper both findings named); revoke_invite''s invite lock scopes firm_id IN the locking WHERE (F-C3). Ruled 裁-94 (2026-09-01 morning): KEEP THE WALL is the shipped shape, not a pending default.';
end $$;
