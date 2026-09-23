-- 0278_fa_belt_birth_convention — #882(b), riders wave 3 lane 04: the belt and the birth trigger
-- READ ENROLMENT DIFFERENTLY on purpose, and that purpose was nowhere in the catalog. This file
-- moves NO row and mints NO function: it is a comment-only migration, `comment on function`
-- twice, on two bodies 0041 and 0216/0247/0277 already shipped and never recut here.
-- =====================================================================================
-- THE DEFECT #882 TRIAGED. `clara._tf_fa_movement_belt` (0041, unrecut since) evaluates an
-- account's enrolment as a CLOSED interval over `approved_at`
-- (`coalesce(new.approved_at, now()) between fp.enrolled_at and fp.retired_at`, both bounds
-- inclusive). `clara._tf_fa_acquisition_birth` (0216, recut by 0247 then 0277) evaluates the SAME
-- question with a DIFFERENT signal: the CURRENT `fp.active` flag, read when IT fires (also
-- deferred, also at commit). Both readings are correct for the ordinary case — they only diverge
-- at one instant: an entry approved in the SAME transaction that retires its cost account's
-- enrolment profile. `now()` is transaction-constant, so that transaction stamps `retired_at`
-- EXACTLY EQUAL to `approved_at`. The belt's closed interval still matches at that equality
-- instant (by design — see its own comment, below); the birth trigger's `fp.active` reads FALSE
-- by the time it fires, because the retire already committed its effect earlier in the same
-- transaction. The birth therefore declines to register the row, the belt then finds no register
-- act behind the movement, and the whole transaction is refused CLR40
-- `fa_belt_unregistered_movement` — by the birth side's silence, not by the belt naming a race.
--
-- THE OWNER RULING (2026-09-18, ticket #882, half b): no trigger changes. The same-transaction
-- retire-and-approve instant is reachable by NO production door —
-- `clara.retire_fa_account_profile` is a human-only door, always its own transaction, and the
-- runtime has no path that opens one transaction spanning both a retirement and a posting. Today's
-- refusal there stays; the two triggers keep their own readings. What was missing was not a fix —
-- it was that the convention lived only in triage prose and in an in-body SQL comment on the belt
-- (0041:2680-2689), never in the catalog `comment on function` a later reader actually consults
-- for EITHER body, and never crossing the border to say the OTHER trigger reads something else.
-- This file writes that convention where both bodies already say the rest of their own story: the
-- belt's comment (first one it has ever carried) states its own closed-interval design AND names
-- the birth trigger's differing signal; the birth trigger's comment (already accretive across
-- #639/0216, #972/0247, #932/0277) gains one more sentence doing the same in the other direction.
--
-- WHY A NEW FILE AND NOT AN EDIT OF 0041/0216/0247/0277. All four are merged, applied history.
-- `packages/db/README.md`'s "Redo (#957)" section exists precisely so nobody hand-edits shipped
-- migrations; 0278 is a NEW comment-only successor, exactly as 0246 and 0272 (this same package)
-- re-issued a column comment from a successor file rather than reopening the migration that first
-- wrote it.
--
-- BOTH BODIES ARE COMMENT-ONLY TOUCHED. Neither `create or replace function` appears in this file:
-- the prestate pins each body's `prosrc` sha256 and the tail re-pins the SAME value, so a drift in
-- EITHER body's executable text — from this file or from anything else applied between the
-- prestate measurement and this file's own apply — fails loudly rather than silently landing a
-- comment beside a body it no longer describes.
--
-- THE BIRTH COMMENT IS ACCRETED, NEVER REWRITTEN. `comment on function ... is '<text>'` REPLACES
-- the whole comment (Postgres carries at most one per object), so this file's literal for
-- `clara._tf_fa_acquisition_birth` opens with 0277's own text VERBATIM (copied from
-- `0277_fa_default_depreciation_policy.sql:600-610`, never retyped from a printed value) and adds
-- new sentences after it — the same house convention 0247 and 0277 each used in turn on this exact
-- function. The tail proves the fidelity: it hashes the first 842 characters (0277's own measured
-- `comment_len`, measured live on clara_l04 before this file was written) of the new comment and
-- checks that prefix against 0277's measured `comment` sha256, so a single mistyped character in
-- the copied prefix fails the tail rather than silently corrupting the earlier provenance.
--
-- THE BELT'S COMMENT IS NEW, NOT ACCRETED. `clara._tf_fa_movement_belt` has carried NO catalog
-- comment since 0041 (measured `obj_description(...) is null` on clara_l04 before this file was
-- written) — its whole design lives only in the in-body `--` comments at 0041:2680-2689. This file
-- gives it its first one.
--
-- NO NEW ROLE-GRANT, NO NEW FUNCTION, NO RIG-META COHORT. Both bodies are already granted exactly
-- as 0041/0216 left them (both `revoke all ... from public`, reached only as trigger bodies), and
-- neither this file's prestate nor its tail touches `pg_proc.proacl`. `tests/rig-meta.mjs`'s
-- `cohortFailures()`/`grantMatrixFailures()` therefore need no new roster entry — the same finding
-- 0265 (#839) and 0266 (#880) each recorded for their own comment/projection-only migrations in
-- this package's own README.
--
-- REDO-SAFE BY CONSTRUCTION. `comment on function ... is '<literal>'` is a flat SET: applying this
-- file twice (the supported redo path, `packages/db/README.md` "Redo (#957)") sets the identical
-- final text both times, so no branch is needed in the change section itself. The prestate is
-- still bimodal on the ONE thing a redo could otherwise hide: it accepts either the
-- pre-#882 catalog state (first apply) or this file's own already-applied convention text (redo).
-- This run is a GENUINE FIRST APPLY on clara_l04 — 0278 carries no prior row in
-- `clara.schema_migrations` — so the prestate's first-apply branch is exercised by this very run,
-- not merely asserted; no separate rollback-and-restore probe is owed (packages/db's own wave-3
-- addendum on bimodal pins).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Measured on clara_l04 moments before this file was written, never transcribed
-- from an older migration's header (packages/db's wave-3 addendum: "pin what is LIVE").
-- =====================================================================================
do $p882bb_pre$
declare v_sha text; v_comment text; v_prefix_sha text; v_redo boolean;
begin
  if to_regprocedure('clara._tf_fa_movement_belt()') is null then
    raise exception '#882 prestate: clara._tf_fa_movement_belt is absent -- 0041 must apply first'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._tf_fa_acquisition_birth()') is null then
    raise exception '#882 prestate: clara._tf_fa_acquisition_birth is absent -- 0216 must apply first'
      using errcode = 'CLR10';
  end if;

  -- (a) BOTH BODIES, pinned by sha256(prosrc). Single-valued, not bimodal: this file recuts
  -- NEITHER body, on a first apply or a redo, so the executable text can only ever be this one
  -- value on either path.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_fa_movement_belt()'::regprocedure;
  if v_sha <> 'be97ea51a8db4d69a32da6986a1f0ab7b136c7dc8432913fe783354a3e4c8b5a' then
    raise exception '#882 prestate: clara._tf_fa_movement_belt body drifted (sha %) -- this file only comments it, never recuts it', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if v_sha <> 'c2c62b2997a6dd9a1202e509954b6f1b311ab5c704064b9a71d806e8fb456c50' then
    raise exception '#882 prestate: clara._tf_fa_acquisition_birth body drifted (sha %) -- this file only comments it, never recuts it', v_sha
      using errcode = 'CLR10';
  end if;

  -- (b) THE BELT'S COMMENT. NULL on a first apply (0041 never gave it one); this file's own
  -- convention marker on a redo.
  select obj_description('clara._tf_fa_movement_belt()'::regprocedure, 'pg_proc') into v_comment;
  if v_comment is not null and position('#882 (0278)' in v_comment) = 0 then
    raise exception '#882 prestate: clara._tf_fa_movement_belt already carries an UNRELATED comment -- refusing to overwrite it: %', v_comment
      using errcode = 'CLR10';
  end if;

  -- (c) THE BIRTH'S COMMENT. Either 0277's own measured pre-image (first apply) or this file's
  -- own already-applied text, whose first 842 characters must STILL be that same pre-image (redo
  -- — the accretion may never drift, even across a hand-edit-and-redo cycle).
  select obj_description('clara._tf_fa_acquisition_birth()'::regprocedure, 'pg_proc') into v_comment;
  if v_comment is null then
    raise exception '#882 prestate: clara._tf_fa_acquisition_birth carries NO comment to accrete onto -- 0277 must apply first'
      using errcode = 'CLR10';
  end if;
  v_redo := position('#882 (0278)' in v_comment) > 0;
  if not v_redo and char_length(v_comment) <> 842 then
    raise exception '#882 prestate: clara._tf_fa_acquisition_birth carries an UNEXPECTED comment on a first apply (length %, expected 842) -- 0277 or a later ticket may have recut it since this file''s prestate was measured', char_length(v_comment)
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(substring(v_comment from 1 for 842), 'UTF8')), 'hex') into v_prefix_sha;
  if v_prefix_sha <> '831df896cf2f76bb82e5378d1e2664b4d79056997d33aa0fe1712b9c44acb67c' then
    raise exception '#882 prestate: clara._tf_fa_acquisition_birth''s first 842 characters no longer hash to 0277''s measured pre-image (sha %) -- refusing to accrete onto drifted provenance', v_prefix_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#882 prestate: OK -- % apply. Both trigger bodies at their pinned pre-images; the belt carries no unrelated comment and the birth''s first 842 characters still hash to 0277''s measured pre-image.',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$p882bb_pre$;

-- =====================================================================================
-- §B  THE CHANGE. Two `comment on function` statements. Neither body is recut.
-- =====================================================================================
set role clara_fn_owner;

-- §B.1 THE BELT'S FIRST CATALOG COMMENT. States its own closed-interval design (already argued
-- in-body at 0041:2680-2689, restated here for a reader who consults the catalog and never opens
-- the migration file) AND names the birth trigger's differing signal for the one instant they
-- disagree at.
comment on function clara._tf_fa_movement_belt() is
  '#639 (0041): the fixed-asset movement belt. A DEFERRED constraint trigger on '
  'clara.journal_entries, firing AFTER t_je_fa_acquisition_birth (both deferred; PostgreSQL fires '
  'the queue in alphabetical trigger-name order, and the birth''s own name is chosen to sort '
  'first). Raises CLR40 when an approved entry moves an enrolled cost, accumulated-depreciation or '
  'expense-role account with no register act behind it: fa_k_gl_balance_on_enrolled for an '
  'itemised-opening escape, fa_cost_adjustment_deferred for a credit on the cost account, '
  'fa_belt_unregistered_movement otherwise. Enrolment is read as a CLOSED interval evaluated at '
  'approved_at (coalesce(new.approved_at, now()) between fp.enrolled_at and fp.retired_at, both '
  'bounds inclusive) -- deliberately: now() is transaction-constant, so a same-transaction retire '
  'stamps retired_at EQUAL to approved_at, and a half-open bound would hand a same-transaction '
  'race to the retirer. #882 (0278): clara._tf_fa_acquisition_birth answers the SAME enrolment '
  'question with a DIFFERENT signal -- the CURRENT fp.active flag, read at ITS OWN firing (also '
  'deferred, also at commit) -- never this closed interval. A same-transaction retire-and-approve '
  'therefore makes the two triggers disagree: the birth side declines (fp.active reads false by '
  'the time it fires) while this closed interval still matches at the equality instant, finds no '
  'register row to excuse the movement, and raises fa_belt_unregistered_movement. Owner ruling '
  '2026-09-18 (#882): that outcome stays -- the instant is reachable by no production door '
  '(retire_fa_account_profile is human-only, in its own transaction), and neither trigger is '
  'widened to read the other''s signal.';

-- §B.2 THE BIRTH'S COMMENT, ACCRETED. Lines 1-9 below are 0277's own text, copied VERBATIM from
-- 0277_fa_default_depreciation_policy.sql:601-609 (never retyped from a printed value); the tail
-- hashes their first 842 characters against 0277's own measured pre-image to prove it. Line 10
-- onward is this file's new sentence.
comment on function clara._tf_fa_acquisition_birth() is
  '#639: the LANE-AGNOSTIC fixed-asset acquisition birth. A deferred constraint trigger on '
  'clara.journal_entries, named to fire before t_je_fa_movement_belt (deferred triggers fire in '
  'alphabetical trigger-name order -- measured on clara_639, PG 17.11). Idempotent against '
  'clara._fa_on_approve arm 4 through the same on conflict (acquisition_line_id) do nothing. '
  '#972 (0247): the join carries the 0041 §1.2 enrolment watermark as the exact negation of '
  'clara.fa_register_tie''s own pre-enrolment test. #932 (0277): when the account carries a live '
  'clara.fa_account_depreciation_policies row, the register row is born COMPLETE from it '
  '(method, life-or-rate, residual, and a depreciation_start_date of the acquisition''s OWN '
  'posting date) and stamps the policy''s id and version; an account with no policy still births '
  'the pending row exactly as before. '
  '#882 (0278): this join reads fp.active -- the CURRENT enrolment flag, evaluated when THIS '
  'trigger fires (also deferred, also at commit) -- never the CLOSED approved_at interval '
  'clara._tf_fa_movement_belt reads (see that function''s own comment). A same-transaction '
  'retire-and-approve therefore makes the two triggers disagree: this side declines to birth '
  '(fp.active reads false by firing time) while the belt still matches (its closed interval '
  'catches the equality instant) and finds no register row, so it raises CLR40 '
  'fa_belt_unregistered_movement. Owner ruling 2026-09-18 (#882): that outcome stays -- the '
  'instant is reachable by no production door, and neither trigger is widened to read the '
  'other''s signal.';

reset role;

-- =====================================================================================
-- §C  TAIL. Both bodies are still byte-unchanged; both comments carry the convention; the birth's
-- accretion is a proven byte-exact prefix, never a rewrite.
-- =====================================================================================
do $p882bb_tail$
declare v_sha text; v_comment text; v_prefix_sha text;
begin
  -- (0) NEITHER BODY MOVED. A comment-only file that somehow left a body recut would be the one
  -- mistake this tail exists to catch.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_fa_movement_belt()'::regprocedure;
  if v_sha <> 'be97ea51a8db4d69a32da6986a1f0ab7b136c7dc8432913fe783354a3e4c8b5a' then
    raise exception '#882 tail: clara._tf_fa_movement_belt body moved (sha %) -- this file must be comment-only', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if v_sha <> 'c2c62b2997a6dd9a1202e509954b6f1b311ab5c704064b9a71d806e8fb456c50' then
    raise exception '#882 tail: clara._tf_fa_acquisition_birth body moved (sha %) -- this file must be comment-only', v_sha
      using errcode = 'CLR10';
  end if;

  -- (1) THE BELT'S NEW COMMENT names both its own design and the birth's differing signal.
  select obj_description('clara._tf_fa_movement_belt()'::regprocedure, 'pg_proc') into v_comment;
  if v_comment is null or position('#882 (0278)' in v_comment) = 0 then
    raise exception '#882 tail: clara._tf_fa_movement_belt carries no #882 (0278) convention comment'
      using errcode = 'CLR10';
  end if;
  if position('fa_belt_unregistered_movement' in v_comment) = 0
     or position('fp.active' in v_comment) = 0
     or position('CLOSED interval' in v_comment) = 0
     or position('retire_fa_account_profile' in v_comment) = 0 then
    raise exception '#882 tail: clara._tf_fa_movement_belt''s comment is missing one of the convention''s own terms -- got: %', v_comment
      using errcode = 'CLR10';
  end if;

  -- (2) THE BIRTH'S COMMENT is 0277's own text, byte-exact, PLUS the new sentence.
  select obj_description('clara._tf_fa_acquisition_birth()'::regprocedure, 'pg_proc') into v_comment;
  if v_comment is null or char_length(v_comment) <= 842 then
    raise exception '#882 tail: clara._tf_fa_acquisition_birth''s comment did not grow past 0277''s 842 characters'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(substring(v_comment from 1 for 842), 'UTF8')), 'hex') into v_prefix_sha;
  if v_prefix_sha <> '831df896cf2f76bb82e5378d1e2664b4d79056997d33aa0fe1712b9c44acb67c' then
    raise exception '#882 tail: clara._tf_fa_acquisition_birth''s first 842 characters no longer hash to 0277''s measured pre-image (sha %) -- the accretion REWROTE history instead of extending it', v_prefix_sha
      using errcode = 'CLR10';
  end if;
  if position('#882 (0278)' in v_comment) = 0
     or position('fa_belt_unregistered_movement' in v_comment) = 0
     or position('CLOSED approved_at interval' in v_comment) = 0
     or position('_tf_fa_movement_belt' in v_comment) = 0 then
    raise exception '#882 tail: clara._tf_fa_acquisition_birth''s new sentence is missing one of the convention''s own terms -- got: %', v_comment
      using errcode = 'CLR10';
  end if;
  -- …and #639/#972/#932's own provenance markers are still readable — the accretion did not
  -- merely hash-match a coincidental prefix, it kept the actual sentences a reader would look for.
  if position('#639' in v_comment) = 0 or position('#972 (0247)' in v_comment) = 0
     or position('#932 (0277)' in v_comment) = 0 then
    raise exception '#882 tail: clara._tf_fa_acquisition_birth''s comment lost an earlier provenance marker (#639 / #972 (0247) / #932 (0277))'
      using errcode = 'CLR10';
  end if;

  -- (3) NEITHER FUNCTION GAINED OR LOST A GRANT. This file is a documentation-only act. Pinned to
  -- the EXACT ACL measured on clara_l04 before this file was written (0041/0216's own
  -- `revoke all ... from public`, never re-granted since).
  if exists (
    select 1 from pg_proc p
     where p.oid in ('clara._tf_fa_movement_belt()'::regprocedure, 'clara._tf_fa_acquisition_birth()'::regprocedure)
       and p.proacl::text <> '{clara_fn_owner=X/clara_fn_owner}'
  ) then
    raise exception '#882 tail: a trigger body''s ACL moved -- this file grants nothing'
      using errcode = 'CLR10';
  end if;

  raise notice '#882 tail: OK -- clara._tf_fa_movement_belt (body byte-unchanged) carries its first catalog comment, naming its own closed-interval design and the birth trigger''s differing fp.active signal; clara._tf_fa_acquisition_birth (body byte-unchanged) carries 0277''s own 842-character text byte-exact as a proven prefix, PLUS one new sentence naming the same convention from the other side. Neither function''s grants moved.';
end
$p882bb_tail$;
