-- 0236_subledger_hook_caller_roster -- #868: `clara._subledger_on_approve` GAINS A STATEMENT OF
-- ITS OWN LIVE CALLER ROSTER. Body, owner, trigger wiring and grants are UNTOUCHED; this file
-- writes exactly one `comment on function`.
-- =====================================================================================
-- Spec of record: issue #868 (Agent Brief, 2026-09-17; restated 2026-09-19). Filed from wave
-- 2026-09-15 (PR #860) over WAVE-DIGEST.md §3 cross-cutting row 8: two migrations (0216 #639,
-- 0221 #638) each independently re-derived and re-pinned the hook's caller roster at six, per
-- DECISIONS §1.3's no-shared-recut rule, rather than fixing a shared stale text -- because there
-- was no shared text to fix. The 2026-09-17 triage comment re-scoped the ticket from "reconcile
-- two pins" (they already agree; nothing to reconcile) to "the hook itself states nothing, so
-- 0037:3840-3845's four-name census is the first thing a reader who greps the function's name
-- finds, and it has been stale by two since 0085."
--
-- WHAT WAS MEASURED, AND IS STALE.
--
--   `clara._subledger_on_approve` was created at 0037:1050, called at creation by FOUR bodies
--   (0037's own tail pins them at 0037:3840-3845): `_approve_entry_core`, `_approve_opening_entry`,
--   `approve_wrong_client_correction`, `reverse_entry`. Two later migrations each grew the roster
--   by one, in-body, without ever touching the hook:
--
--     * 0056:2003-2355 CREATEs `finalize_close` already calling the hook (0056:2276) -- the close
--       model's own closing-transfer entry, a genuine fifth approve path from its first migration.
--     * 0085:172-495 (`b3_reopen_ends_on`) recuts `reopen_fiscal_year`, which through 0056 routed
--       its unwind through `clara.reverse_entry` and so was NOT itself a direct caller -- 0085's
--       own header states this ("0056's reopen routes its unwind through clara.reverse_entry"),
--       and 0056's original body (measured: no `_subledger_on_approve(` token anywhere in
--       `reopen_fiscal_year`'s definition) confirms it. 0085 gives it a dedicated reversal mirror
--       and its OWN direct call (0085:399); 0086 (the sibling file "TWO FILES, ONE CHANGE" obliges)
--       pins the resulting caller census at six by name and the approve-writer census at six by
--       count, both re-derived from the live catalog rather than transcribed.
--
--   0216:930-947 and 0221 (#639, #638; wave 2026-09-15) each measured the same live six
--   independently and re-pinned it in their own tails, because a hazard review found no ONE place
--   to read it from. 0216's own comment attributes both new callers to "0056" -- imprecise on
--   `reopen_fiscal_year`, which per the paragraph above did not call the hook until 0085/0086; the
--   comment this file writes carries the corrected attribution and cites 0085, not 0056, for it.
--
--   NONE OF THIS IS A DEFECT IN 0037, 0056, 0085, 0086, 0216 OR 0221 -- every one of their
--   assertions is TRUE at its own position in the chain (0037's four was correct until 0056; 0085
--   is where the fifth call and the sixth direct call both exist; 0216/0221's six is correct
--   today). The defect this file closes is DISCOVERABILITY: nothing on the hook itself says so,
--   and 0037's is the census a `grep _subledger_on_approve` finds first.
--
-- =====================================================================================
-- THE ANSWER: ONE COMMENT, RE-DERIVED FROM THE CATALOG, NEVER TRANSCRIBED.
--
--   The prestate below runs the SAME re-derivation 0216/0221's tails already run (the position()
--   scan over `pg_proc.prosrc`, restricted to `clara`, excluding the hook itself) and refuses to
--   write a comment this file cannot back with a measurement taken NOW, on THIS database. Six
--   names, sorted, or the migration does not apply -- exactly AC1's "refuses if it is not the six
--   0216 and 0221 pin."
--
--   THE COMMENT NAMES ALL SIX WITH THE MIGRATION EACH ARRIVED IN (AC2), and states in one place
--   why 0037's four-name census is now stale and by how much -- so the NEXT reader who finds this
--   function by name reads a durable, dated statement instead of an obsolete inline comment.
--
-- WHAT THIS FILE DOES NOT DO (AC3; out of scope per the Agent Brief).
--   * It does not edit 0037, 0041, 0042, 0043 or 0045 -- all applied, all immutable.
--   * It does not touch `clara._subledger_on_approve`'s body, owner, SECURITY DEFINER flag, grant
--     or search_path. `comment on function` is the only DDL verb this file executes.
--   * It does not install a shared roster-census helper (out of scope, Agent Brief) -- each future
--     migration that must re-derive the roster keeps doing so in its own tail; this file only
--     gives the FIRST reader a place to learn what that census currently reads.
--   * It does not touch any trigger: the hook is `perform`-called from its six callers' bodies
--     and is not itself installed as a trigger function anywhere (measured: zero `pg_trigger` rows
--     name it as `tgfoid`) -- the tail re-confirms this stays zero.
--
-- CONSUMER ORDER. None owed. A catalog comment has no runtime effect on any query plan, wire
-- shape or caller; every session, old or new, sees the same function it always called. Rollback
-- is a successor migration's `comment on function clara._subledger_on_approve(uuid) is null;` --
-- the six-caller fact itself does not need reverting, only the record of it.
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
do $w868_pre$
declare v_sha text; v_names text[];
begin
  -- 1 · THE HOOK ITSELF, at the one sha it has held since 0037 authored it (measured on this rig
  -- at 230 migrations, 0001->0235, before this file existed).
  if to_regprocedure('clara._subledger_on_approve(uuid)') is null then
    raise exception '#868 prestate: clara._subledger_on_approve is absent -- 0037 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid='clara._subledger_on_approve(uuid)'::regprocedure;
  if v_sha is distinct from '6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd' then
    raise exception '#868 prestate: clara._subledger_on_approve has DRIFTED from its 0037 body (sha %) -- this file writes a comment about a body it cannot back with that measurement', v_sha
      using errcode='CLR10';
  end if;

  -- 2 · THE CALLER ROSTER, RE-DERIVED FROM THE CATALOG NOW -- the same scan 0216:938-941 and
  -- 0221's own tails run, never a literal copied from either. Refuses unless it is the measured
  -- six, by name (AC1).
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
     and p.proname <> '_subledger_on_approve';
  if v_names is distinct from array['_approve_entry_core','_approve_opening_entry',
                                    'approve_wrong_client_correction','finalize_close',
                                    'reopen_fiscal_year','reverse_entry'] then
    raise exception '#868 prestate: the subledger hook caller set is % -- expected the six 0216 and 0221 pin, re-derive the comment below against the live roster before writing it', v_names
      using errcode='CLR10';
  end if;

  -- 3 · THE HOOK IS REACHABLE BY NO TRIGGER DIRECTLY (it is `perform`-called, never installed as
  -- a trigger function) -- the fact this file's comment relies on when it says so.
  if exists (select 1 from pg_trigger where tgfoid = 'clara._subledger_on_approve(uuid)'::regprocedure) then
    raise exception '#868 prestate: clara._subledger_on_approve is now installed as a trigger function -- the comment this file writes says it is not'
      using errcode='CLR10';
  end if;

  raise notice '#868 prestate: clean -- clara._subledger_on_approve is at its 0037 body (sha %), and its live caller roster is exactly the measured six.', v_sha;
end
$w868_pre$;

-- =====================================================================================
-- §B  THE CHANGE. One statement. No `set role`: this file creates and alters nothing owned, so
-- ownership is irrelevant to it, and the migration connection (superuser) can comment regardless.
-- =====================================================================================
comment on function clara._subledger_on_approve(uuid) is
  '#868: the caller roster of this hook, MEASURED from the catalog, never transcribed. Six live '
  'callers today: _approve_entry_core (0037), _approve_opening_entry (0037), '
  'approve_wrong_client_correction (0037) and reverse_entry (0037) were the original four, called '
  'from the hook''s own creation (0037:3840-3845''s pin); finalize_close (0056) was created '
  'already calling it; reopen_fiscal_year (0085, superseding its earlier delegation through '
  'reverse_entry -- 0086 pinned the resulting six) grew the roster to six. Two wave migrations '
  '(0216, 0221) each independently re-derived and re-pinned this same six because this function '
  'carried no statement of its own. 0037''s four-name census (0037:3840-3845) is therefore STALE '
  'by two: it describes the schema as it stood before 0056 and 0085 grew the roster -- read this '
  'comment instead. '
  '#868 changes nothing else: this function''s body, owner, SECURITY DEFINER flag, search_path '
  'and (empty) grant are exactly as 0037 left them, and it is reachable by no trigger directly.';

-- =====================================================================================
-- §C  TAIL. Everything above, re-read from the catalog.
-- =====================================================================================
do $w868_tail$
declare v_sha text; v_names text[]; v_owner text; v_secdef bool; v_acl text; v_cmt text; v_n int;
begin
  -- 1 · THE COMMENT LANDED, AND NAMES ALL SIX WITH THE MIGRATION EACH ARRIVED IN (AC2).
  select obj_description('clara._subledger_on_approve(uuid)'::regprocedure, 'pg_proc') into v_cmt;
  if v_cmt is null or length(v_cmt) = 0 then
    raise exception '#868 tail: clara._subledger_on_approve carries no comment after this file applied'
      using errcode='CLR10';
  end if;
  if position('_approve_entry_core (0037)' in v_cmt) = 0
     or position('_approve_opening_entry (0037)' in v_cmt) = 0
     or position('approve_wrong_client_correction (0037)' in v_cmt) = 0
     or position('reverse_entry (0037)' in v_cmt) = 0
     or position('finalize_close (0056)' in v_cmt) = 0
     or position('reopen_fiscal_year (0085' in v_cmt) = 0 then
    raise exception '#868 tail: the comment does not credit all six callers with their arrival migrations -- %', v_cmt
      using errcode='CLR10';
  end if;
  if position('0216' in v_cmt) = 0 or position('0221' in v_cmt) = 0 or position('STALE' in v_cmt) = 0 then
    raise exception '#868 tail: the comment does not state that the historical four-name pin is stale and name the migrations that had to re-derive around it'
      using errcode='CLR10';
  end if;

  -- 2 · AC3: BODY, OWNER, DEFINER FLAG AND GRANT ARE BYTE-FOR-BYTE UNMOVED.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), r.rolname, p.prosecdef,
         coalesce(p.proacl::text,'(null)')
    into v_sha, v_owner, v_secdef, v_acl
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  if v_sha is distinct from '6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd' then
    raise exception '#868 tail: clara._subledger_on_approve''s body moved during this migration (sha %) -- this file must write a comment, nothing else', v_sha
      using errcode='CLR10';
  end if;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true then
    raise exception '#868 tail: clara._subledger_on_approve''s owner or SECURITY DEFINER flag moved (owner=%, secdef=%)', v_owner, v_secdef
      using errcode='CLR10';
  end if;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#868 tail: clara._subledger_on_approve gained or lost a grant (acl=%) -- this file must not touch EXECUTE reachability', v_acl
      using errcode='CLR10';
  end if;

  -- 3 · AC1/AC3, RESTATED FROM THE OTHER SIDE: the roster is still exactly the measured six, and
  -- the hook is still reachable by no trigger directly.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
     and p.proname <> '_subledger_on_approve';
  if v_names is distinct from array['_approve_entry_core','_approve_opening_entry',
                                    'approve_wrong_client_correction','finalize_close',
                                    'reopen_fiscal_year','reverse_entry'] then
    raise exception '#868 tail: the subledger hook caller set moved during this migration -- %', v_names
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgfoid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  if v_n <> 0 then
    raise exception '#868 tail: clara._subledger_on_approve is now installed as a trigger function (% rows)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#868 tail: OK -- clara._subledger_on_approve now carries a comment naming all six live callers (_approve_entry_core, _approve_opening_entry, approve_wrong_client_correction and reverse_entry from 0037; finalize_close from 0056; reopen_fiscal_year from 0085/0086) and stating that 0037''s four-name census is stale by two. Its body (sha unchanged), owner, SECURITY DEFINER flag, grant (still owner-only) and trigger reachability (still zero) are exactly as they were before this file applied -- the only DDL this migration executed was the one COMMENT ON FUNCTION.';
end
$w868_tail$;
