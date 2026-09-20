-- 0237_journal_basis_zero_total_unreachable -- #906: `clara._assert_journal_basis` GAINS A
-- STATEMENT THAT ITS OWN `nonzero_total` ARM CANNOT FIRE. Body, owner, SECURITY DEFINER flag,
-- search_path and owner-only ACL are UNTOUCHED; this file writes exactly one `comment on function`.
-- =====================================================================================
-- Spec of record: issue #906 (Agent Brief, 2026-09-17). Filed from wave 2026-09-15 (PR #860) over
-- WAVE-DIGEST.md §3 ticket-specific row 42, found independently from both the accrual (#652) and
-- prepayment (#653) sides while each wired refusal logic through this shared predicate. The
-- 2026-09-17 triage comment re-scoped the ticket from "reorder the arms so `nonzero_total` is
-- reachable" (rejected: reordering would change which constraint token an all-zero basis answers
-- with, and the prepayment door at 0223:1263 already carries that token through to its own typed
-- refusal -- a live consumer, not a hypothetical one) to "document the arm as unreachable, with
-- the reason and the two arms that make it so."
--
-- THE PROOF, RE-DERIVED HERE RATHER THAN TRANSCRIBED FROM THE TRIAGE COMMENT.
--
--   `clara._assert_journal_basis` (created 0178:693, never recut -- this file's own prestate
--   pins its body's live sha256(prosrc) before touching it) validates a basis in this order:
--   object shape, posting date, memo, currency, then EACH line, then the two whole-basis totals.
--   Three of its arms combine to foreclose `nonzero_total` (0178:785-787, "the basis moves no
--   money"):
--
--     1. `at_least_two` (0178:743-745) refuses fewer than two lines, so the per-line loop below
--        always runs at least twice -- the vacuous "zero lines, both totals initialise to zero"
--        shape can never reach the totals check.
--     2. `exactly_one_side` (0178:769-772) refuses any line whose debit and credit are equally
--        signed -- both positive, or (the case this matters for) both zero. Combined with
--        `clara._journal_cents` (0178:672) refusing a negative minor-unit value, every line that
--        survives the loop carries EXACTLY ONE strictly positive side.
--     3. `balanced` (0178:780-783) refuses `v_dr <> v_cr` BEFORE `nonzero_total` ever runs.
--
--   Two ways a basis could make `v_dr = 0` at the top of the `nonzero_total` check, and both are
--   already gone by the time control reaches it:
--
--     * EVERY line has both sides zero (the literal "all-zero balanced basis" AC3's cell
--       constructs). Arm 2 refuses the FIRST such line on its own -- `(0>0)=(0>0)` is `true`,
--       which is exactly what `exactly_one_side` raises on. Control never leaves the loop, let
--       alone reaches `nonzero_total`. This is what AC3's cell measures directly: the all-zero
--       basis is refused naming `exactly_one_side` (`lines[1]`), never `nonzero_total`.
--     * SOME lines are non-degenerate but the debit total still sums to zero. Since every
--       surviving line's debit is a non-negative integer (arm 2 + `_journal_cents`), a debit total
--       of zero forces EVERY line's debit to be exactly zero, which by arm 2 forces every line's
--       credit to be strictly positive. With at least two such lines (arm 1), the credit total is
--       then strictly positive while the debit total is zero -- `v_dr <> v_cr`, so arm 3
--       (`balanced`) raises first and `nonzero_total`'s own `if v_dr = 0` line is never reached.
--
--   `nonzero_total` is therefore retained as a FOLD GUARD ONLY: a defensive line a reader might
--   assume is live defence-in-depth, kept for the day one of the two arms above is ever loosened,
--   but unreachable while `at_least_two` and `exactly_one_side` both stand exactly as 0178 wrote
--   them. This is downstream knowledge today (0223:1257-1266, the prepayment door's own comment,
--   carries the SAME finding at its call site) where a reader of the shared predicate itself does
--   not see it; this file gives the predicate its own statement of its own contract.
--
-- WHAT THIS FILE DOES NOT DO (out of scope per the Agent Brief).
--   * It does not reorder or remove the `nonzero_total` arm, and it does not touch the refusal
--     vocabulary any consumer classifies against -- `at_least_two`, `exactly_one_side`, `balanced`
--     and `nonzero_total` all still exist, in the same order, raising the same messages.
--   * It does not recut any caller (`clara.create_accounting_plan` at 0193:1521, the prepayment
--     door at 0223:1246, or any other) -- their own typed refusals are unmoved.
--   * It does not touch `clara._assert_journal_basis`'s body, owner, SECURITY DEFINER flag,
--     search_path or grant. `comment on function` is the only DDL verb this file executes.
--
-- CONSUMER ORDER. None owed. A catalog comment has no runtime effect on any query plan, wire
-- shape or caller; every session, old or new, sees the same function it always called. Rollback
-- is a successor migration's
-- `comment on function clara._assert_journal_basis(jsonb) is null;` -- the unreachability fact
-- itself does not need reverting, only the record of it.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. The world this file reasons about, measured rather than remembered.
--
-- REDO-TOLERANT BY CONSTRUCTION (#957, packages/db/README.md "Redo"): `comment on function` is
-- naturally idempotent DDL -- re-running this file over its own old effects replaces the comment
-- with byte-identical text and changes nothing else, so no bimodal branch is needed here.
-- =====================================================================================
do $w906_pre$
declare v_sha text; v_owner text; v_secdef bool; v_acl text; v_prosrc text;
begin
  -- 1 · THE PREDICATE ITSELF, at the one sha it has held since 0178 authored it (measured on this
  -- rig at 236 migrations, 0001->0236, before this file existed).
  if to_regprocedure('clara._assert_journal_basis(jsonb)') is null then
    raise exception '#906 prestate: clara._assert_journal_basis is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), r.rolname, p.prosecdef,
         coalesce(p.proacl::text,'(null)'), p.prosrc
    into v_sha, v_owner, v_secdef, v_acl, v_prosrc
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara._assert_journal_basis(jsonb)'::regprocedure;
  if v_sha is distinct from '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684' then
    raise exception '#906 prestate: clara._assert_journal_basis has DRIFTED from its 0178 body (sha %) -- this file writes a comment about a body it cannot back with that measurement', v_sha
      using errcode='CLR10';
  end if;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#906 prestate: clara._assert_journal_basis owner or SECURITY DEFINER flag has moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#906 prestate: clara._assert_journal_basis carries a grant (acl=%) -- expected the historical owner-only ACL (revoked from public, 0178:790)', v_acl
      using errcode='CLR10';
  end if;

  -- 2 · THE TWO GUARDING ARMS ARE STILL LIVE, BY NAME, IN THE BODY THIS FILE IS ABOUT TO DESCRIBE
  -- -- re-derived from the catalog now rather than assumed from the migration history above.
  if position('at_least_two' in v_prosrc) = 0
     or position('exactly_one_side' in v_prosrc) = 0
     or position('nonzero_total' in v_prosrc) = 0 then
    raise exception '#906 prestate: the live body no longer carries all three of at_least_two, exactly_one_side and nonzero_total -- re-derive this file''s comment against the live body before writing it'
      using errcode='CLR10';
  end if;

  raise notice '#906 prestate: clean -- clara._assert_journal_basis is at its 0178 body (sha %), owner clara_fn_owner, SECURITY DEFINER, owner-only ACL, and still carries at_least_two, exactly_one_side and nonzero_total by name.', v_sha;
end
$w906_pre$;

-- =====================================================================================
-- §B  THE CHANGE. One statement. No `set role`: this file creates and alters nothing owned, so
-- ownership is irrelevant to it, and the migration connection (superuser) can comment regardless.
-- =====================================================================================
comment on function clara._assert_journal_basis(jsonb) is
  '#906: the `nonzero_total` arm (0178:785-787, "the basis moves no money") is UNREACHABLE BY '
  'CONSTRUCTION and is retained only as a fold guard. Two earlier arms in this same function '
  'foreclose it: `at_least_two` (0178:743-745) refuses fewer than two lines, so the per-line loop '
  'always runs; `exactly_one_side` (0178:769-772) refuses any line whose debit and credit are '
  'equally signed, including both zero, so every surviving line carries exactly one strictly '
  'positive side (non-negative cents come from clara._journal_cents). An all-zero basis is '
  'therefore refused by `exactly_one_side` on its first line, never by `nonzero_total`; and a '
  'basis whose debit total is genuinely zero forces every line''s credit to be strictly positive, '
  'which the `balanced` arm (0178:780-783) refuses -- v_dr<>v_cr -- before `nonzero_total`''s own '
  'check ever runs. Verified at 65fde7f3 for #906; the prepayment door (0223:1257-1266) already '
  'carries the same finding at its own call site. This comment changes nothing about the arm, the '
  'refusal vocabulary or any caller: `at_least_two`, `exactly_one_side`, `balanced` and '
  '`nonzero_total` all still exist, in the same order, raising the same messages.';

-- =====================================================================================
-- §C  TAIL. Everything above, re-read from the catalog.
-- =====================================================================================
do $w906_tail$
declare v_sha text; v_owner text; v_secdef bool; v_acl text; v_cmt text;
begin
  -- 1 · THE COMMENT LANDED, NAMES `nonzero_total` AS UNREACHABLE, AND NAMES BOTH GUARDING ARMS
  -- (AC1).
  select obj_description('clara._assert_journal_basis(jsonb)'::regprocedure, 'pg_proc') into v_cmt;
  if v_cmt is null or length(v_cmt) = 0 then
    raise exception '#906 tail: clara._assert_journal_basis carries no comment after this file applied'
      using errcode='CLR10';
  end if;
  if position('nonzero_total' in v_cmt) = 0
     or position('UNREACHABLE' in v_cmt) = 0 then
    raise exception '#906 tail: the comment does not name nonzero_total as unreachable -- %', v_cmt
      using errcode='CLR10';
  end if;
  if position('at_least_two' in v_cmt) = 0 or position('exactly_one_side' in v_cmt) = 0 then
    raise exception '#906 tail: the comment does not name both guarding arms (at_least_two, exactly_one_side) -- %', v_cmt
      using errcode='CLR10';
  end if;

  -- 2 · AC2: BODY, OWNER, DEFINER FLAG AND GRANT ARE BYTE-FOR-BYTE UNMOVED.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), r.rolname, p.prosecdef,
         coalesce(p.proacl::text,'(null)')
    into v_sha, v_owner, v_secdef, v_acl
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara._assert_journal_basis(jsonb)'::regprocedure;
  if v_sha is distinct from '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684' then
    raise exception '#906 tail: clara._assert_journal_basis''s body moved during this migration (sha %) -- this file must write a comment, nothing else', v_sha
      using errcode='CLR10';
  end if;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#906 tail: clara._assert_journal_basis''s owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#906 tail: clara._assert_journal_basis gained a grant (acl=%) -- this file must not touch EXECUTE reachability', v_acl
      using errcode='CLR10';
  end if;

  raise notice '#906 tail: OK -- clara._assert_journal_basis now carries a comment naming nonzero_total (0178:785-787) as unreachable by construction and naming at_least_two (0178:743-745) and exactly_one_side (0178:769-772) as the two arms that make it so. Its body (sha unchanged), owner, SECURITY DEFINER flag and ACL (still owner-only) are exactly as they were before this file applied -- the only DDL this migration executed was the one COMMENT ON FUNCTION.';
end
$w906_tail$;
