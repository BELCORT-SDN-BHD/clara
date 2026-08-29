-- Pre-beta security-hardening batch, MIGRATION B -- owner-ruled 2026-08-28
-- (docs/plan/active/mohe-grill-rulings-2026-08-28.md, 裁-16). Hash-only bearer tokens at rest,
-- both instances named at the sitting, in one PR:
--
--   (a) clara.invite_member's receipt. Its LIVE body mints the plaintext invite token and hands
--       it to `_finish_op`, which BOTH returns it to the caller AND persists it, verbatim, into
--       `op_receipts.result` -- durable plaintext-at-rest for a bearer credential (measured:
--       p4t1-invite.test.mjs's own [C3] cell pins exactly this as the pre-fix shape, and is
--       fixed in the SAME commit below). `_finish_op`'s own contract (0004:62-68) is
--       `result := p_result; return p_result` -- the same jsonb is BOTH the return value and the
--       persisted row. This file does NOT touch `_finish_op` itself (it is a universal helper
--       called by every governed writer in the estate -- recutting its signature is a different,
--       much larger blast radius than this ruling asks for). Instead `invite_member` is recut to
--       call `_finish_op` with a HASH-ONLY receipt (so `op_receipts.result` never carries the
--       plaintext), capture ITS return value, then merge the plaintext token into
--       invite_member's OWN final `return` -- one layer above `_finish_op`, after persistence
--       already happened. THE CONTRACT, stated once here: the plaintext token is returned to the
--       caller EXACTLY ONCE, on the call that actually mints it; `op_receipts.result` stores only
--       `token_hash` (hex); a replay of the SAME op_key short-circuits at `_reserve_op`
--       (0004:46-60) and returns THAT persisted, hash-only jsonb -- a replay CANNOT re-mint or
--       re-surface the plaintext, by construction. TRUED (independent review, 2026-08-29): that
--       last clause is about receipts THIS BODY writes. It was first written as "there is no
--       plaintext anywhere for it to read back", which is FALSE on a populated database until
--       §B2 below has run -- every pre-hardening receipt still held its token, and a replay of
--       one of those op_keys would have handed it straight back. The sentence is true of the
--       whole table only AFTER §B2, and §K refuses the deploy if it is not.
--       `accept_invite`'s own token handling was VERIFIED, not changed: it already computes
--       `sha256(convert_to(btrim(p_token),'UTF8'))` and looks up `firm_invites.token_hash`
--       (0141 §F) -- it never receives, stores or returns a plaintext token itself.
--
--       (a2) LEGACY RECEIPTS ARE SCRUBBED IN THE SAME TRANSACTION (§B2). Recutting the body only
--       governs FUTURE `_finish_op` writes. Every `op_receipts` row written by the PRE-hardening
--       `invite_member` still carries its plaintext token in `result`, at rest, and
--       `_reserve_op` (0004:54-59) hands that cached jsonb straight back on any replay of the
--       same op_key -- so without §B2 BOTH halves of 裁-16a survive this deploy: plaintext at
--       rest, and plaintext RE-SURFACED to a caller after the fix shipped. Measured, not
--       reasoned: issue an invite under the old body with op_key K, deploy, call
--       `invite_member(E,'viewer',K)` again, and the reply carries `token` in the clear. §B2
--       rewrites every such row to the hash-only shape -- `token` removed, `token_hash` set to
--       the sha256 of the plaintext that was already sitting there (the LAST legitimate read of
--       it, exactly as §A's backfill is for the admission column) -- and §K refuses if a single
--       `fn='invite_member'` receipt still carries a `token` key.
--
--   (b) clara.firm_admissions.token (0002:255-260). Census of every reader/writer (below)
--       found the admission token stored and compared as PLAINTEXT `uuid` -- an
--       operator-minted, single-use bearer credential for `create_firm`. Converted to the SAME
--       hash-only shape `firm_invites`/`firm_open_questions` etc. already use: a new
--       `token_hash bytea` column (backfilled from every existing row's plaintext BEFORE the
--       plaintext column is dropped -- the last legitimate read of it), a fresh `id` surrogate
--       primary key (nothing in the estate holds a foreign key onto `firm_admissions.token`,
--       confirmed by census), and `create_firm` recut to compare against the hash. The
--       function's own SIGNATURE is UNCHANGED (`p_admission_token` stays `uuid`) -- every
--       existing caller (the frontend door, `packages/db/scripts/onboard-rpr.mjs`, the O7
--       seed, every rig fixture) keeps handing the SAME plaintext value it always held; only
--       the column it is compared against, and what persists at rest, changes.
--
--       EMAIL-WALL FINDING (the sitting's own "report either way" instruction): NO.
--       `create_firm` carries no email binding on the admission token whatsoever --
--       `firm_invites`/`accept_invite` binds a token to ONE email via `firm_invites.email` +
--       the caller's verified JWT email (0141 §F); `firm_admissions` has no such column and
--       `create_firm`'s live body never reads `clara._jwt_email()` or any email at all.
--       RE-VERIFIED against the 0145 frontier during the rebase below: 0145's F1 fix added an
--       existence + is_agent wall at create_firm's entrance, which narrows WHO may present a
--       token to "a known, non-agent subject", but still binds the token to NO identity -- any
--       such subject with no active firm membership can consume it and become that firm's
--       owner. Still a pure bearer-credential model, unlike the invite door. This is a FINDING,
--       not a fix: adding an identity/email binding to `create_firm` is a judgement-logic change
--       to WHO the ceremony admits, a different and larger question than "does the credential sit
--       in plaintext at rest" -- named here for the owner, not silently patched into this
--       hardening PR's scope.
--
--       COMPANION FILES UPDATED IN THE SAME PR (not migrations, but they read/write the column
--       this file changes and would break or silently regress to plaintext otherwise):
--       `packages/db/scripts/onboard-rpr.mjs` (the discovery query), `docs/ops/gate-f-provisioning.md`
--       (Act 2(b)'s mint recipe -- rewritten to the same mint-then-hash CTE shape),
--       `packages/db/tests/rig-fixtures.mjs` + `packages/runtime/tests/relay-fixtures.mjs`
--       (both carry their own `seedAdmission()`), `packages/db/tests/rig-isolation.test.mjs`
--       (T23's own `token = $1` read), `packages/db/tests/wave-b/wb-calls.mjs`
--       (`admissionRow`'s own `a.token=$1` read). `packages/db/seeds/0002_core_seed.sql`'s
--       fixed synthetic tokens (`k_tok_a`/`k_tok_b`) are UNCHANGED as VALUES -- they are public
--       constants checked into the repo already, not secrets; only the INSERT's target column
--       changes from `token` to `token_hash`.
--
-- D1 WRITE-QUIESCE OWED: TWO live audited writer bodies replaced --
-- clara.invite_member(text,text,text) and clara.create_firm(text,uuid,text). Quiesce both for
-- this file's deploy window (packages/db/README.md, "Deploy contract"). No third body is
-- replaced: `clara._create_firm_core(uuid,text)` is pinned BYTE-UNTOUCHED, pre and post.
--
-- =================================================================================================
-- REBASE ONTO THE 0145 FRONTIER (2026-08-29) -- why every body below reads differently from the
-- first authoring, and the ONE design question the rebase had to re-decide.
--
-- FRONTIER NOTE, and why nothing below needed re-deriving when it moved AGAIN: 0145 is where
-- these two bodies were last recut, and the pinned pre-images are 0145's. `0146` (裁-17, the
-- ninth needs-you row_kind) landed under this lane afterwards and touches neither body -- but
-- that is asserted here only because §0's sha compares MEASURED it on a live 0001-0146 chain and
-- accepted, which is a positive read of the catalog rather than an inference from 0146's diff.
-- If any later migration does recut either body, this file refuses at §0 and names the observed
-- hash instead of silently applying a surgery derived from text that no longer exists. The
-- migration NUMBER is claimed at merge and is not a premise of anything below. CLAIMED at merge
-- prep, 2026-08-29: 0147, one past 0146 (裁-17). The pinned pre-images are still 0145's, because
-- 0145 is where these two bodies were last recut -- the number this file carries and the frontier
-- its surgery was derived against are independent facts, and §0 is what reconciles them on every
-- apply.
--
-- This file was authored and rig-tested against the pre-0145 frontier and deliberately HELD
-- unpushed: P4 tranche-2 was, at that moment, CoR-ing create_firm / set_member_role / add_member /
-- invite_member / accept_invite in its own live fix round, and a cross-PR CREATE OR REPLACE on the
-- same body silently overwrites whichever PR merges second, with no conflict and no warning (the
-- 0136 lesson). Tranche-2 has since landed as `0145_p4_tranche2_registration_operator_alias`, so
-- BOTH bodies below were RE-DERIVED from the LIVE 0145 text -- not carried over from the earlier
-- draft -- and both the §0 pre-image and the §K post-image are pinned by whole-body prosrc sha256
-- (instrument named at every site: `encode(sha256(convert_to(prosrc,'UTF8')),'hex')`), with a
-- surgical-delta reconstruction proof that re-substituting this file's own blocks reproduces the
-- 0145 pre-image BYTE-FOR-BYTE. What 0145 put into these two bodies therefore survives here by
-- proof, not by assertion:
--
--   * create_firm  -- F1's existence + is_agent walls at the ENTRANCE, positionally BEFORE the
--                     admission-token lookup (0145's own tail pins that order; §K re-pins it);
--                     the delegation to `clara._create_firm_core(v_actor, p_name)`.
--   * invite_member -- F2's role-ceiling wall (`cannot invite to a role above your own rank`,
--                     CLR04), checked BEFORE `_reserve_op`.
--
-- DECISION RECORD -- where does the hash comparison belong now that `_create_firm_core` exists?
-- IN `create_firm`, unchanged from the original design. Decided by reading the 0145 text, not by
-- preference: `_create_firm_core(uuid,text)` takes an already-resolved actor and a name and never
-- names `clara.firm_admissions` at all -- the admission-token lookup, the consumed-replay return
-- and the consumed-stamp all live at create_firm's ENTRANCE, because 0145's §C header states
-- explicitly that they "belong only to this entrance" (the second entrance,
-- `approve_firm_registration`, reaches the core with no admission token in the picture). The
-- credential read is what this ruling hardens, so the hash comparison goes exactly where the read
-- is. `_create_firm_core` is consequently NOT recut by this file, and §0 + §K both pin its prosrc,
-- ACL and owner as byte-identical across this transaction -- a positive proof of non-interference,
-- not an absence.
--
-- SECOND, SMALLER REBASE CONSEQUENCE (recorded because it is a real behavioural line, not
-- formatting): the consumed-stamp UPDATE's predicate. 0145 stamps
-- `where token = p_admission_token`; that column does not survive §A, so the stamp is re-keyed to
-- `where id = a.id` -- the surrogate PK of the row §C already SELECTed FOR UPDATE. Same row, same
-- lock, one less hash computation; and unlike a re-hash of `p_admission_token` it cannot drift
-- from the row the entrance actually locked.
-- =================================================================================================

-- =================================================================================================
-- §0 -- PRESTATE. Every claim measured against the LIVE catalog on this rig.
-- =================================================================================================
create temp table _hrd_b_pre(k text primary key, v text) on commit drop;

do $$
declare
  v_missing text; v_src text; v_acl text; v_owner text; v_n int; v_sha text;
begin
  -- (1) invite_member resolves, owned by clara_fn_owner, and its WHOLE live body's sha256 equals
  --     the pinned 0145 pre-image. The sha is the load-bearing guard (a marker census admits an
  --     intervening recut that keeps every marker and changes something else -- the recut-body
  --     class the estate has already paid for: the 0136 lesson, PR-0 gate night). INSTRUMENT,
  --     stated explicitly: `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` on the LIVE
  --     pg_proc.prosrc -- NOT pg_get_functiondef(), a different and larger text.
  if to_regprocedure('clara.invite_member(text,text,text)') is null then
    raise exception 'hrd-b prestate: clara.invite_member(text,text,text) does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.invite_member(text,text,text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'hrd-b prestate: invite_member is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> 'd00104d1c75d81c0bd9412be6891de1ea5ac0d1bfe3cda4487645cfeac2d064f' then
    raise exception 'hrd-b prestate: invite_member''s live prosrc sha256 does not match the pinned 0145 pre-image -- observed % (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), expected d00104d1c75d81c0bd9412be6891de1ea5ac0d1bfe3cda4487645cfeac2d064f. §B below is a byte-surgical recut OF THAT EXACT TEXT (0145''s role-ceiling wall included); an intervening recut makes the surgery invalid. Re-read the LIVE catalog, re-derive the delta, and re-pin this hash, §K''s post-image hash AND §K''s reconstruction blocks before re-authoring. Refusing rather than guessing.', v_sha
      using errcode = 'CLR10';
  end if;
  -- Secondary, human-legible layer (not load-bearing on its own -- the sha above is the real
  -- guard): the fragments §B preserves, and the exact pre-fix plaintext-receipt fragment §B
  -- removes. A prestate that cannot see the defect it is about to fix is not grounded.
  if position('v_token' in v_src) = 0 or position('_finish_op' in v_src) = 0
     or position('token_hash' in v_src) = 0 or position('firm_invites' in v_src) = 0
     or position('cannot invite to a role above your own rank' in v_src) = 0 then
    raise exception 'hrd-b prestate: invite_member''s LIVE body is missing an expected fragment (0145''s role-ceiling wall among them) -- re-read the live catalog' using errcode = 'CLR10';
  end if;
  if position('''token'',v_token' in replace(v_src, ' ', '')) = 0 then
    raise exception 'hrd-b prestate: invite_member''s pre-fix plaintext-token receipt fragment not found -- re-read the live catalog before authoring the CoR' using errcode = 'CLR10';
  end if;
  insert into _hrd_b_pre(k, v) values ('invite_member.prosrc', v_src), ('invite_member.acl', v_acl);

  -- (2) create_firm: same treatment, pinned to 0145's post-F1 entrance body.
  if to_regprocedure('clara.create_firm(text,uuid,text)') is null then
    raise exception 'hrd-b prestate: clara.create_firm(text,uuid,text) does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara.create_firm(text,uuid,text)'::regprocedure;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'hrd-b prestate: create_firm is not owned by clara_fn_owner (owner=%)', v_owner using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> 'd6baec6adcbe9d5652f6f4df631e88701699b390ff1edd807fb9c5a9618daf24' then
    raise exception 'hrd-b prestate: create_firm''s live prosrc sha256 does not match the pinned 0145 pre-image -- observed % (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), expected d6baec6adcbe9d5652f6f4df631e88701699b390ff1edd807fb9c5a9618daf24. §C below is a byte-surgical recut OF THAT EXACT TEXT (0145''s F1 entrance walls and its _create_firm_core delegation included); an intervening recut makes the surgery invalid. Re-read the LIVE catalog, re-derive the delta, and re-pin this hash, §K''s post-image hash AND §K''s reconstruction blocks before re-authoring. Refusing rather than guessing.', v_sha
      using errcode = 'CLR10';
  end if;
  if position('wheretoken=p_admission_token' in replace(v_src, ' ', '')) = 0 then
    raise exception 'hrd-b prestate: create_firm''s LIVE body does not compare token=p_admission_token -- re-read the live catalog (frontier lineage: 0004 -> 0005 -> 0017 -> 0145)' using errcode = 'CLR10';
  end if;
  -- The wall strings §K re-asserts as PRESERVED. NOTE, corrected at the 0145 rebase: 'actor
  -- already belongs to a firm' is NO LONGER in this body -- 0145 moved it into
  -- `_create_firm_core`, so it is asserted there, in (3), instead. Asserting it here would fail
  -- for a right reason (the string genuinely moved), which is exactly the false-premise class this
  -- prestate exists to refuse.
  if position('invalid or consumed admission token' in v_src) = 0
     or position('the agent identity cannot own a firm' in v_src) = 0
     or position('unknown actor' in v_src) = 0
     or position('no authenticated actor' in v_src) = 0
     or position('firm name and op_key are required' in v_src) = 0
     or position('consumed_op_key' in v_src) = 0
     or position('consumed_result' in v_src) = 0
     or position('_create_firm_core' in v_src) = 0 then
    raise exception 'hrd-b prestate: create_firm''s LIVE body is missing an expected wall/column/delegation fragment' using errcode = 'CLR10';
  end if;
  -- 0145's own F1 ordering invariant, re-measured here so §K can prove this file preserved it:
  -- the existence and is_agent walls run BEFORE the admission-token lookup.
  if position('unknown actor' in v_src) > position('from clara.firm_admissions' in v_src)
     or position('the agent identity cannot own a firm' in v_src) > position('from clara.firm_admissions' in v_src) then
    raise exception 'hrd-b prestate: create_firm''s F1 entrance walls are NOT positionally before the admission-token lookup in the live body -- 0145''s own invariant is already broken; refusing to build on it' using errcode = 'CLR10';
  end if;
  insert into _hrd_b_pre(k, v) values ('create_firm.prosrc', v_src), ('create_firm.acl', v_acl);

  -- (3) _create_firm_core: THE DO-NOT-TOUCH BASELINE. 0145 extracted it out of create_firm's body;
  --     this file does not recut it (see the DECISION RECORD in the header). Pinned here and
  --     re-read in §K so non-interference is a positive proof rather than an absence.
  if to_regprocedure('clara._create_firm_core(uuid,text)') is null then
    raise exception 'hrd-b prestate: clara._create_firm_core(uuid,text) does not resolve -- 0145 is not the live frontier' using errcode = 'CLR10';
  end if;
  select p.prosrc, coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner)
    into v_src, v_acl, v_owner
    from pg_proc p where p.oid = 'clara._create_firm_core(uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> '545c7177b79157d163bc0031f055d5eba65555c37566b4ac8b358a677a26613b' then
    raise exception 'hrd-b prestate: _create_firm_core''s live prosrc sha256 does not match the pinned 0145 baseline -- observed % (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), expected 545c7177b79157d163bc0031f055d5eba65555c37566b4ac8b358a677a26613b', v_sha
      using errcode = 'CLR10';
  end if;
  if position('actor already belongs to a firm' in v_src) = 0
     or position('the agent identity cannot own a firm' in v_src) = 0 then
    raise exception 'hrd-b prestate: _create_firm_core is missing a wall string 0145 placed in it' using errcode = 'CLR10';
  end if;
  insert into _hrd_b_pre(k, v) values
    ('core.prosrc', v_src), ('core.acl', v_acl), ('core.owner', v_owner), ('core.sha', v_sha);

  -- (4) firm_admissions: exactly the pre-hardening shape (token uuid PK, no token_hash, no id).
  if not exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b prestate: clara.firm_admissions.token column absent -- already migrated?' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname in ('token_hash', 'id') and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b prestate: clara.firm_admissions already carries token_hash and/or id -- this file would double-apply' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_admissions;
  insert into _hrd_b_pre(k, v) values ('firm_admissions.rowcount', v_n::text);

  -- (4b) LEGACY invite_member receipts (HIGH-1). Measure BOTH populations, and stash them so
  --      §K proves a real before/after delta rather than an already-true zero. `op_receipts` is
  --      read here as the migration runner (superuser, RLS-exempt) and rewritten in §B2 under
  --      clara_fn_owner, whose own `p_op_receipts_owner` policy is `using (true) with check
  --      (true)` -- no wall is weakened to do it.
  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  insert into _hrd_b_pre(k, v) values ('op_receipts.legacy_plaintext', v_n::text);
  select count(*)::int into v_n from clara.op_receipts where fn = 'invite_member';
  insert into _hrd_b_pre(k, v) values ('op_receipts.invite_total', v_n::text);
  -- The SCOPING baseline: receipts of any OTHER verb that happen to carry their own `token` key.
  -- §B2's predicate is fn='invite_member'; §K proves this number is UNMOVED, which is what makes
  -- "scoped" a measurement rather than a claim about the WHERE clause's spelling.
  select count(*)::int into v_n
    from clara.op_receipts where fn <> 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  insert into _hrd_b_pre(k, v) values ('op_receipts.foreign_token', v_n::text);
  -- FAIL-CLOSED on a shape §B2's hash could not read honestly: every legacy `token` must be a
  -- jsonb STRING (that is what the pre-hardening body wrote, and `->>` on any other type would
  -- hash a rendering rather than the credential). Refuse rather than scrub something else.
  select count(*)::int into v_n
    from clara.op_receipts
   where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token' and jsonb_typeof(result -> 'token') <> 'string';
  if v_n > 0 then
    raise exception 'hrd-b prestate: % legacy invite_member receipt(s) carry a non-string `token` -- §B2 hashes result->>''token'' and would hash a rendering, not the credential. Refusing rather than guessing.', v_n using errcode = 'CLR10';
  end if;

  -- (5) Depended-upon functions/objects resolve, at their EXACT signatures (law 3: a name is a
  --     projection of the thing, not the thing).
  select string_agg(t.n, ', ') into v_missing
    from (values
      ('clara._human_ctx(integer)'), ('clara.role_rank(text)'), ('clara.actor_role_rank()'),
      ('clara._reserve_op(uuid,text,text,bytea)'), ('clara._finish_op(uuid,text,text,jsonb)'),
      ('clara._hash(jsonb)'), ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
      ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
      ('clara.jwt_sub()'), ('clara._create_firm_core(uuid,text)')
    ) t(n) where to_regprocedure(t.n) is null;
  if to_regclass('clara.op_receipts') is null then
    raise exception 'hrd-b prestate: clara.op_receipts does not resolve -- §B2 has nothing to scrub' using errcode = 'CLR10';
  end if;
  if v_missing is not null then
    raise exception 'hrd-b prestate: depended-upon function(s) missing: %', v_missing using errcode = 'CLR10';
  end if;

  raise notice 'hrd-b prestate: OK -- bodies derived against the 0145 frontier, pins RE-VERIFIED live here (0146 landed under this lane and left both byte-identical -- proven by these very sha compares, not by reading its diff). invite_member and create_firm resolve at clara_fn_owner with their WHOLE live bodies pinned by prosrc sha256 (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')) to the 0145 pre-images d00104d1... and d6baec6a..., prosrc/ACL stashed for §K''s reconstruction proof; invite_member carries 0145''s role-ceiling wall and the pre-fix plaintext-token receipt fragment; create_firm carries the token= comparison, all 5 entrance wall strings, the _create_firm_core delegation, and its F1 entrance walls measured POSITIONALLY before the admission-token lookup; _create_firm_core pinned as the DO-NOT-TOUCH baseline at 545c7177...; firm_admissions carries token but neither token_hash nor id, % row(s) stashed for a rowcount-preserved tail proof; % of % live invite_member op_receipts carry a legacy PLAINTEXT token and are stashed for §B2''s scrub (all string-typed); 10 depended-upon functions + clara.op_receipts resolve at exact signatures.',
    (select v from _hrd_b_pre where k = 'firm_admissions.rowcount'),
    (select v from _hrd_b_pre where k = 'op_receipts.legacy_plaintext'),
    (select v from _hrd_b_pre where k = 'op_receipts.invite_total');
end $$;

set role clara_fn_owner;

-- MED-4 (independent review): the runner pins `lock_timeout = 0` on its own connection, so
-- without this line §A would wait FOREVER behind any open reader of clara.firm_admissions
-- instead of failing the deploy fast. LOAD-BEARING, not precautionary.
--
-- ONE `set local` covers ALL FIVE of §A's ACCESS EXCLUSIVE statements (a GUC bound to the
-- runner's per-migration transaction, not a per-statement clause), enumerated so a later editor
-- can check nothing escaped it:
--   1. `add column id ... default gen_random_uuid()`   (volatile default -> full table rewrite)
--   2. `add column token_hash bytea`
--   3. `alter column token_hash set not null`          (validating scan under the same lock)
--   4. `drop constraint <pk>` / `add constraint ... primary key (id)`  (§A's DO block + ALTER)
--   5. `drop column token`
-- plus the `create unique index` between 4 and 5, which takes SHARE. Every one of them queues
-- behind any open reader of a table create_firm touches on every firm-creation ceremony.
-- 5s is the estate's D1 posture: a properly quiesced window needs milliseconds, and a deploy that
-- cannot take the lock in five seconds must abort loudly rather than park a queue of blocked
-- writers behind itself for the length of the migration.
set local lock_timeout = '5s';

-- =================================================================================================
-- §A -- firm_admissions: hash-only storage. A surrogate `id` PK (nothing in the estate holds a
-- foreign key onto `token`, confirmed by census -- see header), `token_hash` backfilled from
-- every existing row's plaintext BEFORE that plaintext column is dropped, then the plaintext
-- column is gone. `gen_random_uuid()` as the id default is VOLATILE, so this ADD COLUMN
-- rewrites the table -- immaterial at this table's size (an operator-seeded admission ledger,
-- never a books table).
-- =================================================================================================
alter table clara.firm_admissions add column id uuid not null default gen_random_uuid();
alter table clara.firm_admissions add column token_hash bytea;
update clara.firm_admissions set token_hash = sha256(convert_to(token::text, 'UTF8')) where token_hash is null;
alter table clara.firm_admissions alter column token_hash set not null;

do $$
declare v_pk text;
begin
  select conname into v_pk from pg_constraint
   where conrelid = 'clara.firm_admissions'::regclass and contype = 'p';
  if v_pk is null then
    raise exception 'hrd-b: firm_admissions has no primary key to drop -- unexpected shape' using errcode = 'CLR10';
  end if;
  execute format('alter table clara.firm_admissions drop constraint %I', v_pk);
end $$;

alter table clara.firm_admissions add constraint firm_admissions_pkey primary key (id);
create unique index uq_firm_admissions_token_hash on clara.firm_admissions (token_hash);
alter table clara.firm_admissions drop column token;

-- =================================================================================================
-- §B -- invite_member: hash-only receipt. RE-DERIVED FROM THE LIVE 0145 BODY: every byte outside
-- the declare line and the RECEIPT tail is 0145's own text, 0145's role-ceiling wall included,
-- and §K proves that byte-for-byte by re-substituting the two blocks below and comparing against
-- the §0 stash. `_finish_op` persists a HASH-ONLY jsonb (no plaintext token in op_receipts.result
-- from this call on); its return value (== what was just persisted) is captured, and the
-- plaintext token is merged into invite_member's OWN return, one layer above persistence. A
-- replay of the SAME op_key never reaches this code at all -- it returns at the `_reserve_op`
-- dedupe branch above, with whatever is in op_receipts.result: hash-only, going forward.
-- =================================================================================================
create or replace function clara.invite_member(p_email text, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_email text; v_token text; v_id uuid; v_expires timestamptz; v_receipt jsonb;
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
  -- 裁-16a: op_receipts.result carries ONLY the hash, going forward -- never the plaintext.
  v_receipt := clara._finish_op(c.firm, 'invite_member', p_op_key,
    jsonb_build_object('invite_id', v_id, 'token_hash', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'expires_at', v_expires));
  -- The plaintext is handed back to THIS caller, exactly once, ABOVE persistence -- a replay of
  -- this op_key short-circuits at the _reserve_op branch above and never reaches this line, so
  -- it can never re-mint or re-surface the plaintext.
  return v_receipt || jsonb_build_object('token', v_token);
end $$;

-- =================================================================================================
-- §B2 -- LEGACY RECEIPT SCRUB (HIGH-1, independent review 2026-08-29). §B governs only what
-- `_finish_op` writes FROM NOW ON. Every op_receipts row the PRE-hardening invite_member already
-- wrote still holds its plaintext token, and `_reserve_op` (0004:54-59) returns that cached jsonb
-- verbatim on any replay of the same op_key -- so a courier who replays a pre-deploy op_key gets
-- the plaintext back AFTER this migration ships. Both halves of 裁-16a would survive the fix.
--
-- The rewrite is the exact same one-way step §A performs for the admission column: read the
-- plaintext that is already there (the LAST legitimate read of it), store its sha256 under
-- `token_hash` in the estate's canonical hex spelling -- byte-identical to what §B's recut body
-- now writes, `encode(sha256(convert_to(<token>,'UTF8')),'hex')` -- and drop the `token` key. A
-- replay of a legacy op_key therefore returns {invite_id, expires_at, token_hash}: the SAME shape
-- a post-deploy replay returns, and no plaintext anywhere for it to read back.
--
-- SCOPED to fn='invite_member' deliberately. `token` is a receipt-local key name, and another
-- verb's receipt may legitimately carry a `token` meaning something else entirely; widening this
-- UPDATE to every fn would rewrite rows this ruling never spoke about. §K's zero-assertion is
-- scoped identically, so the proof and the action cannot drift apart.
--
-- IRREVERSIBLE, and deliberately so: after this runs, a pre-deploy invite token exists nowhere on
-- disk. A courier still holding one can still be re-sent it -- they have the plaintext in hand;
-- what is gone is the ability to fish it back OUT of the database, which is the whole ruling.
-- =================================================================================================
-- PRIVILEGE NOTE, found by the populated drill and NOT by reading the code (the whole reason
-- hrd-b-upgrade-drill.test.mjs exists): this block runs while the session is still `set role
-- clara_fn_owner`, so the UPDATE goes through op_receipts' OWN owner policy
-- (`p_op_receipts_owner ... using (true) with check (true)`) rather than bypassing RLS as the
-- superuser runner -- the mechanism under test is exercised, not stepped around. The price is
-- that this block CANNOT read `_hrd_b_pre`: that temp table belongs to the runner's session role,
-- and clara_fn_owner has no privilege on it (`permission denied for table _hrd_b_pre`, measured).
-- So §B2 only ACTS and reports; every before/after proof about what it touched lives in §K(3b),
-- which runs after `reset role` and can read the stash. Action and proof deliberately sit in
-- different privilege scopes.
do $$
declare v_scrubbed int;
begin
  -- THE INSTRUMENT, stated because getting it wrong is invisible: the value written here is
  -- `encode(sha256(convert_to(<plaintext>,'UTF8')),'hex')` -- HEX TEXT -- because that is exactly
  -- what §B's recut body now puts in `op_receipts.result.token_hash`. It is deliberately NOT the
  -- raw `bytea` that `clara.firm_invites.token_hash` (the COLUMN) stores: a jsonb receipt cannot
  -- hold bytea, and 0141's `accept_invite` compares against the COLUMN, never against the
  -- receipt. Same digest, two renderings, each matched to its own container -- a scrub that wrote
  -- the column's rendering into the receipt would make a scrubbed row shaped differently from
  -- every freshly-minted one, and nothing downstream would notice. The drill proves the two
  -- shapes IDENTICAL by minting a real invite on the same rig and comparing.
  --
  -- `jsonb_typeof(result) = 'object'` is a fail-closed guard, not decoration: `?` on a jsonb
  -- ARRAY tests its ELEMENTS, so a non-object receipt could match `result ? 'token'` and then be
  -- rewritten by `-`/`||` into something this ruling never described. §0's census uses the SAME
  -- predicate, so the count it stashes and the rows this touches cannot drift apart.
  --
  -- Every OTHER key is PRESERVED (`result - 'token'`, not a rebuilt object): a receipt is a
  -- durable record, and this migration was asked to remove a credential from it, not to decide
  -- which of its other keys deserve to survive.
  update clara.op_receipts
     set result = (result - 'token')
                  || jsonb_build_object('token_hash',
                       encode(sha256(convert_to(result ->> 'token', 'UTF8')), 'hex'))
   where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  get diagnostics v_scrubbed = row_count;
  raise notice 'hrd-b §B2: scrubbed % legacy invite_member receipt(s) from plaintext `token` to hash-only `token_hash` (hex sha256, the same spelling §B''s recut body now writes). A replay of a pre-deploy op_key can no longer re-surface a plaintext invite token. §K(3b) proves this against the §0 census.', v_scrubbed;
end $$;

-- =================================================================================================
-- §C -- create_firm: compare the admission token against its hash. RE-DERIVED FROM THE LIVE 0145
-- BODY: every byte outside the token-lookup block and the consumed-stamp predicate is 0145's own
-- text -- F1's entrance walls and the `_create_firm_core` delegation included -- and §K proves it
-- byte-for-byte by re-substitution. `p_admission_token` stays `uuid`: callers are unaffected; only
-- what the row stores, and what it is compared against, changes. `_create_firm_core` is NOT
-- touched by this file (header DECISION RECORD); §K re-reads it and proves that.
-- =================================================================================================
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

  -- 裁-16b: the admission credential is compared against its HASH; firm_admissions holds no
  -- plaintext token column at all after this file. p_admission_token stays uuid, so every
  -- caller keeps handing the same plaintext value it always held.
  select * into a from clara.firm_admissions where token_hash = sha256(convert_to(p_admission_token::text, 'UTF8')) for update;
  if not found then raise exception 'invalid or consumed admission token' using errcode = 'CLR04'; end if;
  if a.consumed_at is not null then
    if a.consumed_op_key = p_op_key and a.consumed_result is not null then
      return a.consumed_result;
    end if;
    raise exception 'invalid or consumed admission token' using errcode = 'CLR04';
  end if;

  v_result := clara._create_firm_core(v_actor, p_name);

  update clara.firm_admissions set consumed_at = now(), consumed_op_key = p_op_key, consumed_result = v_result
    where id = a.id;
  perform clara._audit((v_result->>'firm_id')::uuid, v_actor, null, null, 'create_firm', null,
    jsonb_build_object('name', p_name, 'plan_id', v_result->>'plan_id', 'op_key', p_op_key));
  perform clara._append_event((v_result->>'firm_id')::uuid, 'firm.created', null, v_actor, null, null,
    null, null, null, jsonb_build_object('plan_id', v_result->>'plan_id'));
  return v_result;
end $$;

reset role;

-- =================================================================================================
-- §K -- TAIL CENSUS.
-- =================================================================================================
do $$
declare
  v_bad text; v_n int; v_src_now text; v_acl_now text; v_owner_now text; v_code text; v_sha text;
  v_recon text; v_new text; v_old text;
begin
  -- (1) firm_admissions: token GONE, token_hash NOT NULL + unique, id PK, rowcount preserved.
  if exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b tail: firm_admissions.token STILL present -- the plaintext column was not dropped' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_attribute a where a.attrelid = 'clara.firm_admissions'::regclass
      and a.attname = 'token_hash' and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'hrd-b tail: firm_admissions.token_hash absent' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.firm_admissions where token_hash is null) then
    raise exception 'hrd-b tail: at least one firm_admissions row has a NULL token_hash' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'clara.firm_admissions'::regclass
      and contype = 'p' and conkey = (select array_agg(attnum) from pg_attribute
        where attrelid = 'clara.firm_admissions'::regclass and attname = 'id')
  ) then
    raise exception 'hrd-b tail: firm_admissions primary key is not on id' using errcode = 'CLR10';
  end if;
  -- LOW-5 (independent review): assert the index's PROPERTIES, not its NAME. A name is a
  -- projection of the thing (law 3) -- a same-named NON-unique index, or one over the wrong
  -- column, would satisfy a `pg_indexes.indexname` census while buying nothing. Read pg_index
  -- directly: unique, valid, live, exactly one key column, and that column is token_hash.
  if not exists (
    select 1 from pg_index i
     where i.indrelid = 'clara.firm_admissions'::regclass
       and i.indexrelid = to_regclass('clara.uq_firm_admissions_token_hash')
       and i.indisunique and i.indisvalid and i.indisready
       and i.indnkeyatts = 1
       and (select a.attname from pg_attribute a
             where a.attrelid = i.indrelid and a.attnum = i.indkey[0]) = 'token_hash'
  ) then
    raise exception 'hrd-b tail: uq_firm_admissions_token_hash is missing, NOT unique, not valid/ready, or is not a single-column index over token_hash -- read from pg_index, never from the name alone' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_admissions;
  if v_n::text is distinct from (select v from _hrd_b_pre where k = 'firm_admissions.rowcount') then
    raise exception 'hrd-b tail: firm_admissions row count moved -- was %, now %',
      (select v from _hrd_b_pre where k = 'firm_admissions.rowcount'), v_n using errcode = 'CLR10';
  end if;
  -- firm_admissions is still forced RLS, owner-only, ZERO clara_authenticated/agent/wake/runtime
  -- reach -- this file changes column shape, never the access wall.
  if not exists (
    select 1 from pg_class c where c.oid = 'clara.firm_admissions'::regclass
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'hrd-b tail: firm_admissions lost forced RLS' using errcode = 'CLR10';
  end if;
  select string_agg(t.role, ', ') into v_bad
    from (values ('clara_authenticated'), ('clara_agent_ro'), ('clara_wake_interactive'), ('clara_wake_proactive'), ('clara_runtime')) t(role)
   where has_table_privilege(t.role, 'clara.firm_admissions'::regclass, 'select');
  if v_bad is not null then
    raise exception 'hrd-b tail: firm_admissions unexpectedly reachable by: %', v_bad using errcode = 'CLR10';
  end if;

  -- (2) invite_member: ACL byte-unchanged, prosrc genuinely changed, WHOLE-body post-image sha
  --     pinned, and THE SURGICAL-DELTA PROOF -- re-substituting this file's own two blocks for
  --     0145's reproduces the §0 pre-image byte-for-byte. That is strictly stronger than any
  --     marker census: a marker census can be fooled by a recut that keeps every marker AND makes
  --     the intended change AND changes something else nearby; this cannot.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.invite_member(text,text,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _hrd_b_pre where k = 'invite_member.acl') then
    raise exception 'hrd-b tail: invite_member''s ACL moved -- was %, now %',
      (select v from _hrd_b_pre where k = 'invite_member.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'hrd-b tail: invite_member owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _hrd_b_pre where k = 'invite_member.prosrc') then
    raise exception 'hrd-b tail: invite_member''s body is byte-identical to prestate -- the fix did not land' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src_now, 'UTF8')), 'hex');
  if v_sha <> '809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c' then
    raise exception 'hrd-b tail: invite_member''s new prosrc sha256 does not match the pinned expected post-image (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')) -- observed %, expected 809d29ed4d702a7672931497a953ae0a66387b412597c5150b92d541ccc2636c', v_sha
      using errcode = 'CLR10';
  end if;
  -- The two blocks below are byte-for-byte the text §B writes and the text 0145 wrote,
  -- copy-pasted here rather than re-derived -- so a mismatch means THIS check's own copy has
  -- drifted from §B, not that the live body is wrong.
  v_new := $blk$declare c record; v_dedupe jsonb; v_email text; v_token text; v_id uuid; v_expires timestamptz; v_receipt jsonb;
$blk$;
  v_old := $blk$declare c record; v_dedupe jsonb; v_email text; v_token text; v_id uuid; v_expires timestamptz;
$blk$;
  v_recon := replace(v_src_now, v_new, v_old);
  v_new := $blk$  -- 裁-16a: op_receipts.result carries ONLY the hash, going forward -- never the plaintext.
  v_receipt := clara._finish_op(c.firm, 'invite_member', p_op_key,
    jsonb_build_object('invite_id', v_id, 'token_hash', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), 'expires_at', v_expires));
  -- The plaintext is handed back to THIS caller, exactly once, ABOVE persistence -- a replay of
  -- this op_key short-circuits at the _reserve_op branch above and never reaches this line, so
  -- it can never re-mint or re-surface the plaintext.
  return v_receipt || jsonb_build_object('token', v_token);
$blk$;
  v_old := $blk$  return clara._finish_op(c.firm, 'invite_member', p_op_key,
    jsonb_build_object('invite_id', v_id, 'token', v_token, 'expires_at', v_expires));
$blk$;
  v_recon := replace(v_recon, v_new, v_old);
  if v_recon is distinct from (select v from _hrd_b_pre where k = 'invite_member.prosrc') then
    raise exception 'hrd-b tail: re-substituting invite_member''s two changed blocks does not reproduce the 0145 (prestate) body byte-for-byte -- the recut touched something beyond the receipt, or §K''s block copies have drifted from §B''s own text' using errcode = 'CLR10';
  end if;
  -- Marker layer, in CODE (comments stripped, 0141 §K(5b)'s block-then-line double strip -- this
  -- file's own header and §B comments deliberately use the same phrases, so the strip is
  -- load-bearing here, not decorative).
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('''token_hash'',encode(sha256' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: invite_member''s _finish_op call does not carry a hash-only receipt in CODE' using errcode = 'CLR10';
  end if;
  if position('v_receipt||jsonb_build_object(''token''' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: invite_member''s final return does not merge the plaintext token above persistence, in CODE' using errcode = 'CLR10';
  end if;
  -- The exact pre-fix fragment (_finish_op called with the raw token inline) must be ABSENT.
  if position('jsonb_build_object(''invite_id'',v_id,''token'',v_token' in replace(v_code, ' ', '')) > 0 then
    raise exception 'hrd-b tail: invite_member still calls _finish_op with the raw token inline -- the plaintext-at-rest defect survives' using errcode = 'CLR10';
  end if;
  -- 0145's F2 role-ceiling wall survives this file's recut, in CODE, before _reserve_op.
  if position('cannot invite to a role above your own rank' in v_code) = 0 then
    raise exception 'hrd-b tail: 0145''s role-ceiling wall was lost across invite_member''s CoR' using errcode = 'CLR10';
  end if;
  if position('actor_role_rank' in v_code) > position('_reserve_op' in v_code) then
    raise exception 'hrd-b tail: invite_member''s role-ceiling wall no longer precedes _reserve_op in CODE' using errcode = 'CLR10';
  end if;

  -- (3) create_firm: the same ladder -- ACL byte-unchanged, body genuinely changed, whole-body
  --     post-image sha pinned, surgical-delta re-substitution, then the marker/ordering layer.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara.create_firm(text,uuid,text)'::regprocedure;
  if v_acl_now is distinct from (select v from _hrd_b_pre where k = 'create_firm.acl') then
    raise exception 'hrd-b tail: create_firm''s ACL moved -- was %, now %',
      (select v from _hrd_b_pre where k = 'create_firm.acl'), v_acl_now using errcode = 'CLR10';
  end if;
  if v_owner_now <> 'clara_fn_owner' then
    raise exception 'hrd-b tail: create_firm owner drifted to %', v_owner_now using errcode = 'CLR10';
  end if;
  if v_src_now = (select v from _hrd_b_pre where k = 'create_firm.prosrc') then
    raise exception 'hrd-b tail: create_firm''s body is byte-identical to prestate -- the fix did not land' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src_now, 'UTF8')), 'hex');
  if v_sha <> '59fa533d9c03a6754caa0ed906415fde013bd2e99eda41a288988074fafc0357' then
    raise exception 'hrd-b tail: create_firm''s new prosrc sha256 does not match the pinned expected post-image (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')) -- observed %, expected 59fa533d9c03a6754caa0ed906415fde013bd2e99eda41a288988074fafc0357', v_sha
      using errcode = 'CLR10';
  end if;
  v_new := $blk$  -- 裁-16b: the admission credential is compared against its HASH; firm_admissions holds no
  -- plaintext token column at all after this file. p_admission_token stays uuid, so every
  -- caller keeps handing the same plaintext value it always held.
  select * into a from clara.firm_admissions where token_hash = sha256(convert_to(p_admission_token::text, 'UTF8')) for update;
$blk$;
  v_old := $blk$  select * into a from clara.firm_admissions where token = p_admission_token for update;
$blk$;
  v_recon := replace(v_src_now, v_new, v_old);
  v_new := $blk$  update clara.firm_admissions set consumed_at = now(), consumed_op_key = p_op_key, consumed_result = v_result
    where id = a.id;
$blk$;
  v_old := $blk$  update clara.firm_admissions set consumed_at = now(), consumed_op_key = p_op_key, consumed_result = v_result
    where token = p_admission_token;
$blk$;
  v_recon := replace(v_recon, v_new, v_old);
  if v_recon is distinct from (select v from _hrd_b_pre where k = 'create_firm.prosrc') then
    raise exception 'hrd-b tail: re-substituting create_firm''s two changed blocks does not reproduce the 0145 (prestate) body byte-for-byte -- the recut touched something beyond the token comparison and the consumed-stamp predicate, or §K''s block copies have drifted from §C''s own text' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_src_now, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('token_hash=sha256(convert_to(p_admission_token' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: create_firm does not compare token_hash in CODE' using errcode = 'CLR10';
  end if;
  if position('wheretoken=p_admission_token' in replace(v_code, ' ', '')) > 0 then
    raise exception 'hrd-b tail: create_firm still compares the bare plaintext token in CODE' using errcode = 'CLR10';
  end if;
  if position('whereid=a.id' in replace(v_code, ' ', '')) = 0 then
    raise exception 'hrd-b tail: create_firm''s consumed-stamp is not re-keyed onto the locked row''s surrogate id in CODE' using errcode = 'CLR10';
  end if;
  -- Every prior wall string survives, and 0145's own delegation with it. 'actor already belongs
  -- to a firm' is deliberately NOT in this list -- 0145 moved it into _create_firm_core, and (4)
  -- below proves that body byte-untouched.
  if position('invalid or consumed admission token' in v_code) = 0
     or position('the agent identity cannot own a firm' in v_code) = 0
     or position('unknown actor' in v_code) = 0
     or position('no authenticated actor' in v_code) = 0
     or position('firm name and op_key are required' in v_code) = 0
     or position('_create_firm_core' in v_code) = 0 then
    raise exception 'hrd-b tail: a prior wall string or the _create_firm_core delegation was lost across create_firm''s CoR' using errcode = 'CLR10';
  end if;
  -- 0145's F1 ORDERING invariant, preserved: the existence and is_agent walls still run BEFORE
  -- the admission-token lookup (a replay must never return someone else's cached receipt without
  -- re-checking who is asking). Measured on the live body, not assumed from the file's text.
  if position('unknown actor' in v_src_now) > position('from clara.firm_admissions' in v_src_now)
     or position('the agent identity cannot own a firm' in v_src_now) > position('from clara.firm_admissions' in v_src_now) then
    raise exception 'hrd-b tail: create_firm''s F1 entrance walls no longer precede the admission-token lookup -- 0145''s ordering invariant was broken by this CoR' using errcode = 'CLR10';
  end if;

  -- (3b) HIGH-1: NOT ONE invite_member receipt still carries a plaintext `token`, and the
  --      population §B2 rewrote is the population §0 measured -- a before/after DELTA. NON-VACUOUS
  --      WHENEVER LEGACY ROWS EXIST; the populated drill (tests/hrd-b-upgrade-drill.test.mjs) is
  --      what supplies them. Measured, not assumed: on a zero-receipt database the scrub-dropped
  --      mutant applies cleanly past this check, which is exactly why that drill has to exist.
  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  if v_n > 0 then
    raise exception 'hrd-b tail: % invite_member op_receipts row(s) STILL carry a plaintext `token` -- a replay of those op_keys would re-surface the credential 裁-16a removes from the body', v_n
      using errcode = 'CLR10';
  end if;
  -- Same `jsonb_typeof(result) = 'object'` guard as its sibling above, and for the same reason
  -- read in the other direction: this check is a FLOOR (`v_n < expected` raises), so a non-object
  -- receipt whose `?` matched would INFLATE the count and could mask a scrub that dropped the key
  -- without writing the hash. Every predicate in this file's op_receipts census is the same shape,
  -- deliberately -- the scrub, the two prestate counts and both tail checks.
  select count(*)::int into v_n
    from clara.op_receipts where fn = 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token_hash';
  if v_n < (select v::int from _hrd_b_pre where k = 'op_receipts.legacy_plaintext') then
    raise exception 'hrd-b tail: only % invite_member receipt(s) carry token_hash, fewer than the % legacy plaintext row(s) §0 measured -- the scrub dropped the key instead of rewriting it', v_n, (select v from _hrd_b_pre where k = 'op_receipts.legacy_plaintext')
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.op_receipts where fn = 'invite_member';
  if v_n::text is distinct from (select v from _hrd_b_pre where k = 'op_receipts.invite_total') then
    raise exception 'hrd-b tail: the invite_member op_receipts row count moved across the scrub -- was %, now %',
      (select v from _hrd_b_pre where k = 'op_receipts.invite_total'), v_n using errcode = 'CLR10';
  end if;
  -- SCOPING, measured: `token` is a receipt-local key name and another verb may legitimately
  -- carry one. §B2 is scoped to fn='invite_member'; this proves no OTHER verb's receipt was
  -- rewritten, rather than trusting the WHERE clause's spelling (law 3).
  select count(*)::int into v_n
    from clara.op_receipts where fn <> 'invite_member' and jsonb_typeof(result) = 'object' and result ? 'token';
  if v_n::text is distinct from (select v from _hrd_b_pre where k = 'op_receipts.foreign_token') then
    raise exception 'hrd-b tail: the scrub reached BEYOND fn=invite_member -- % non-invite receipt(s) carried a `token` key before, % now',
      (select v from _hrd_b_pre where k = 'op_receipts.foreign_token'), v_n using errcode = 'CLR10';
  end if;

  -- (4) _create_firm_core: BYTE-UNTOUCHED. Positive proof of non-interference (the cross-PR
  --     CREATE OR REPLACE class this whole rebase exists to avoid), not an absence.
  select coalesce(p.proacl::text, '(null)'), pg_get_userbyid(p.proowner), p.prosrc
    into v_acl_now, v_owner_now, v_src_now
    from pg_proc p where p.oid = 'clara._create_firm_core(uuid,text)'::regprocedure;
  if v_src_now is distinct from (select v from _hrd_b_pre where k = 'core.prosrc')
     or v_acl_now is distinct from (select v from _hrd_b_pre where k = 'core.acl')
     or v_owner_now is distinct from (select v from _hrd_b_pre where k = 'core.owner') then
    raise exception 'hrd-b tail: _create_firm_core is NOT byte-identical to its prestate stash -- this file must not touch it' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src_now, 'UTF8')), 'hex');
  if v_sha <> '545c7177b79157d163bc0031f055d5eba65555c37566b4ac8b358a677a26613b' then
    raise exception 'hrd-b tail: _create_firm_core''s prosrc sha256 moved to % -- expected the pinned 0145 baseline', v_sha using errcode = 'CLR10';
  end if;

  -- (5) Constraint 15: nothing this file did reached a frozen schema.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('workflow', 'graphile_worker', 'spike')
       and c.relname in ('firm_admissions')
  ) then
    raise exception 'hrd-b tail: a same-named relation exists in a frozen schema -- refusing to claim this file left them alone' using errcode = 'CLR10';
  end if;

  raise notice 'hrd-b tail: OK -- derived against 0145, re-verified at the live frontier. firm_admissions carries token_hash (NOT NULL, unique-indexed) and no plaintext token column, id-keyed PK, row count preserved (%), forced RLS with zero app-role reach unchanged. invite_member: ACL/owner byte-unchanged, body genuinely changed, post-image prosrc sha256 pinned at 809d29ed... (instrument: encode(sha256(convert_to(prosrc,''UTF8'')),''hex'')), THE SURGICAL-DELTA RE-SUBSTITUTION reproduces the 0145 pre-image byte-for-byte, _finish_op now persists a hash-only receipt with the plaintext merged into the caller-facing return ABOVE persistence, the pre-fix inline-plaintext fragment is gone, and 0145''s role-ceiling wall survives IN CODE still positioned before _reserve_op. create_firm: ACL/owner byte-unchanged, body genuinely changed, post-image prosrc sha256 pinned at 59fa533d..., the surgical-delta re-substitution reproduces the 0145 pre-image byte-for-byte, it compares token_hash (the bare token= comparison is gone) and re-keys the consumed-stamp onto the locked row''s surrogate id, all 5 entrance wall strings and the _create_firm_core delegation survive, and 0145''s F1 ordering invariant (entrance walls BEFORE the admission-token lookup) is re-measured live and holds. _create_firm_core is byte-identical to its prestate stash on prosrc, ACL and owner, sha 545c7177... -- this file replaced TWO bodies, not three. LEGACY RECEIPTS (HIGH-1): zero fn=invite_member op_receipts rows still carry a plaintext `token`, the % row(s) §0 measured were rewritten to token_hash in place, and the invite_member receipt count is unmoved -- a replay of a PRE-deploy op_key can no longer re-surface a plaintext invite token. uq_firm_admissions_token_hash asserted from pg_index by PROPERTY (unique, valid, ready, single key column = token_hash), never by name. D1 OWED: clara.invite_member(text,text,text), clara.create_firm(text,uuid,text). No table in workflow/graphile_worker/spike touched.',
    (select v from _hrd_b_pre where k = 'firm_admissions.rowcount'),
    (select v from _hrd_b_pre where k = 'op_receipts.legacy_plaintext');
end $$;
