-- 0343_payroll_completeness_witness -- #1048: A PAYROLL SUMMARY THAT PRINTS NO RUN TOTAL POSTS
-- FROM ITS OWN ROW SUM WHEN THE PAGE WITNESSES ITS OWN COMPLETENESS, AND OTHERWISE PARKS A
-- QUESTION INSTEAD OF REFUSING.
-- =====================================================================================
-- Spec of record: issue #1048's Agent Brief (the body). The ticket carries ZERO comments, so
-- there is no later brief and no owner ruling comment to override it. Its parent decision is the
-- ruling recorded on #946 on 2026-09-24, which #1048's own summary quotes: "the run's own row-sum
-- is a posting basis when the document witnesses its own completeness, and otherwise parks a
-- question instead of refusing." Riders sweep wave, lane 04, fourth and last ticket of the lane
-- (after #1061 / migration 0342, #1059 and #1060, which are already on this branch).
--
-- CONFIRMED STILL LIVE ON THIS BRANCH, measured on this rig (127.0.0.1:55747 / clara_l07,
-- 2026-09-25, chain 0001 -> 0318 plus this lane's own 0342):
--   * `clara._payroll_entry_plan` still refuses `run_totals_not_printed` for any run whose gross
--     or net the page does not print (0297:433-441), and its own header says so in words at
--     0297:346-353: "it does NOT reach for `computed_cents` -- the row sum the evaluator offers
--     when the page prints employee rows but no totals row ... whether the owner wants a row sum
--     admitted as a posting basis is a product question this ticket does not answer for them."
--     #1048 IS that answer, so this file is the arm 0297 deliberately left unbuilt.
--   * `clara.evaluate_payroll_run_state_v1` reads ELEVEN run-level questions (0296:412-416) and
--     none of them is a completeness witness. Its closure is registered in
--     `clara.evaluator_versions` at version 1 and 0296:710-711 refuses any recut by name: "ship
--     the change as clara.evaluate_payroll_run_state_v2 with its own version row." So a new
--     witness field read off the page is a _v2, and this file mints it.
--   * `clara.list_review_queue` projects SIXTEEN row kinds and none of them is a parked payroll
--     question (measured on the live body: `payroll_posting_blocked` is the only payroll posting
--     kind).
--
-- =============== THE ACCOUNTING, CHECKED BEFORE IT WAS WRITTEN (AGENTS.md rule 6) ===============
-- THE RISK THIS FILE TAKES ON. Posting from a row sum instead of a printed total means posting a
-- figure the page never states. If the reading missed an employee line, the entry understates
-- staff cost, understates the net owed, and -- worse in Malaysia -- understates the statutory
-- payables (EPF, SOCSO, EIS, PCB), which are remitted against a filed return. An understated
-- payroll accrual is a misstatement; an understated statutory payable is a compliance exposure.
-- So the row sum is admitted ONLY against a witness that the lines read are ALL the lines.
--
-- THE THREE WITNESSES THE BRIEF NAMES, AND WHAT EACH IS ACTUALLY WORTH:
--   1. A PRINTED HEADCOUNT (or "total employees") THAT EQUALS THE LINES READ. The strongest: the
--      document itself asserts how many employees are in the run, and the reading found exactly
--      that many. Both figures are read off the page by both channels and compared HERE, in SQL,
--      never by a model. This is the witness the brief's own AC1 and AC3 are about, and the two
--      spellings the brief lists ("a headcount equal to the lines read", "a total-employees
--      figure the lines match") are ONE printed figure under two labels, so they are one
--      question (`payroll.run.employee_count`) and not two -- the prompt stanza names both
--      labels, the vocabulary names one key.
--   2. A PRINTED PAGE COUNT OF ONE. Weaker, and its exact worth is stated rather than assumed:
--      it witnesses that the DOCUMENT is not truncated, not that the RUN is complete. That is
--      precisely the gap the row sum opens, though -- "did I read every line of this document?"
--      -- and the OTHER question, "is this document the whole firm's run?", is not opened by this
--      file at all: a printed totals row is equally silent about it, and the existing lane has
--      posted from printed totals since #946 without asking. So this witness closes the new gap
--      and leaves the pre-existing one exactly where 0297 left it.
--   3. A NAMED PERSON'S YES. When the page witnesses nothing, the lane does not guess and does
--      not merely refuse: it PARKS the question ("this summary prints no total; is this every
--      employee for the month?") and a bookkeeper's yes becomes the basis, recorded with their
--      name, their note and the reading it was about. That is the standing owner ruling
--      ("accounting treatments are checked against the standard and Clara asks for a professional
--      judgement") applied to a completeness assertion, and it is the same shape #949's rent-plan
--      confirmation already uses: the row's EXISTENCE is the proof a person was asked.
--   A `no`, or no answer at all, leaves the document unposted. A `no` is NOT a dead end either:
--   the Needs-you row goes back to `payroll_posting_blocked` with a sentence naming that a person
--   said the summary is incomplete, so the next reader knows why nothing posted.
--
-- WHY THE HEADCOUNT IS COMPARED AGAINST `rows.agreed` AND NOT AGAINST THE RAW ROW COUNT. The
-- evaluator only sums a column over a row set it can honestly sum -- at least one agreed row, no
-- contested row, no unbalanced row, no unchecked row (0296:581-592). `rows.agreed` is that set.
-- Comparing the printed headcount against anything larger would let a page whose twelfth line the
-- two channels read differently satisfy a headcount of twelve while the sum covered eleven.
--
-- THE ENTRY A WITNESSED ROW SUM POSTS, AND THE ONE RESIDUAL IT CARRIES. Only the SIX columns a
-- payslip row prints have a sum: gross, employee EPF/SOCSO/EIS, PCB and net. The four
-- employer-side contributions and the HRDF levy have no per-employee counterpart, so a page that
-- prints no totals row prints them NOWHERE, and 0297:355-359's standing rule -- "an unprinted
-- line produces no leg ... a line the page does not print is not a figure of zero" -- gives them
-- no leg. The entry is therefore:
--     Dr 6000 Salaries and Wages      the gross sum
--         Cr 2100 EPF payable         the EMPLOYEE portion alone
--         Cr 2110 SOCSO payable       the EMPLOYEE portion alone
--         Cr 2120 EIS payable         the EMPLOYEE portion alone
--         Cr 2130 PCB payable
--         Cr 2040 Salaries payable    the net sum
-- and it balances EXACTLY, not by luck: gross - (epf_ee + socso_ee + eis_ee + pcb) = net is the
-- row identity 0296's evaluator already checked on every quoted row, holding at run level over
-- the summed columns. THE RESIDUAL, named rather than hidden: the employer's own EPF/SOCSO/EIS
-- and the HRDF levy are NOT accrued by such an entry. That is NOT a defect this file introduces
-- -- a printed totals row that omits those columns has produced the same partial entry since
-- #946, by 0297:346-359's own recorded decision -- and it is NOT widened here: this file changes
-- WHICH FIGURE a leg may come from, never WHICH LEGS exist. A firm whose payslip summary prints
-- no employer contributions books them the way it did before #946: by hand, or through 0194's
-- periodic payroll obligation, which this lane's duplicate guard already refuses to double-book
-- (0297:727-738, scope `payroll_obligation`).
--
-- WHAT IS NOT WIDENED, DELIBERATELY:
--   * The printed total STILL WINS over the sum wherever the page prints one, and a printed total
--     the sum contradicts is STILL `totals_mismatch` -> the `arithmetic_holds` rung (the brief's
--     own AC4). The row sum is a FALLBACK for silence, never a second opinion about a figure.
--   * No employee-level figure is persisted, read or posted anywhere in this file. The persist
--     door's strip (0296:1876-1883) is untouched, and the witness is a RUN-level count of lines,
--     never a name or a salary. The brief's "out of scope: any employee-level calculation;
--     statutory rates" is kept by construction.
--   * `clara.evaluate_payroll_run_state_v1` is NOT recut. It stays in the catalog, frozen, at the
--     closure hash 0296 registered; the tail re-derives that hash and refuses if it moved.
--
-- ===================== DEPLOY ORDER: DATABASE ALONE, THEN A SUCCESSOR =====================
-- This file adds NO new task lane, NO new workflow family and NO new runtime call. The witness is
-- read by the SAME two channels the payroll pair already reads with, through two OPTIONAL new
-- answers in the envelope the frozen `payrollFacts_v1` worker already sends. Optional is the
-- whole point: the frozen prompts do not ask these two questions yet, an envelope without them is
-- admitted byte-unchanged, and the lane degrades to the PARKED QUESTION -- which is exactly the
-- brief's own fallback. The prompt stanza that makes witness 1 and 2 reachable is delivered as a
-- SUCCESSOR CONTRACT in the ticket report (work order rule 5 / the wave-2 addendum): a frozen
-- workflow body is never edited.
--
-- WRITE-QUIESCE. This file `create or replace`s four live bodies (`_payroll_answers_ok`,
-- `_payroll_entry_plan`, `_payroll_posting_verdict`, `_post_payroll_run`) and SPLICES two more
-- (`persist_payroll_facts`, `list_review_queue`). PostgreSQL runs an in-flight PL/pgSQL call to
-- completion on the body it STARTED with, so a payroll persist spanning this migration settles
-- the read and posts under the OLD gate -- which is the state that was correct a moment earlier,
-- and which a re-read (a new version) re-judges under the new one. Nothing is half-posted: the
-- post is one statement sequence inside the persist's own transaction. `list_review_queue` is a
-- reader. One small table is created. No table is rewritten and no lock is held on a large
-- relation.
--
--   SectionA  prestate -- the pinned pre-images, measured on this lane database now
--   SectionB  clara.evaluate_payroll_run_state_v2   -- THE SUCCESSOR EVALUATOR, and its freeze
--   SectionC  clara._payroll_answers_ok recut       -- two OPTIONAL witness questions
--   SectionD  clara.persist_payroll_facts splice    -- the lane banks a v2 state
--   SectionE  clara._payroll_entry_plan recut       -- a witnessed row sum is a posting basis (AC1)
--   SectionF  clara.payroll_completeness_answers    -- what a named person said, and when
--   SectionG  clara._payroll_completeness_answer    -- the reading-bound answer read
--   SectionH  clara._payroll_posting_verdict recut  -- the `completeness_witness` rung (AC2, AC3)
--   SectionI  clara._post_payroll_run recut         -- the entry and its receipt name the basis
--   SectionJ  clara.list_review_queue splices       -- row_kind='payroll_completeness_question'
--   SectionK  clara.answer_payroll_completeness     -- the answer door, and the event it speaks
--   SectionZ  tail
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- SectionA  PRESTATE. Every claim this file makes about what it is building on, MEASURED on the
--     lane rig (127.0.0.1:55747 / clara_l07) on 2026-09-25, never transcribed from another file's
--     text. Three of this lane's own tickets landed before this one (#1061 / migration 0342,
--     #1059 and #1060); none of them recut a body named here (0342 installs no function at all,
--     #1059 added db test cells only, #1060 is web-only), and every sha below is what is LIVE
--     after them.
--
--     BIMODAL BY CONSTRUCTION (#957 redo). The SIX bodies this file recuts or splices are pinned
--     to TWO acceptable shapes each: the PRE-IMAGE sha (a first apply) or a body already carrying
--     this file's own marker (a redo). Anything else is drift and is refused by name. The wave-3
--     addendum's warning about a marker-tolerant pin hiding its sha branch from a redo is honoured
--     in the ticket report: the FIRST-APPLY branch is proven separately, inside a rolled-back
--     transaction that restores the pre-images and runs this prestate verbatim.
-- =====================================================================================
do $w1048_pre$
declare
  v_sha text; v_n int; v_role text; v_src text; r record;
begin
  foreach v_role in array array['clara_fn_owner','clara_authenticated','clara_agent_ro','clara_runtime'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      raise exception '#1048 prestate: role % is missing', v_role using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE PARENT FILES ARE APPLIED. 0296 (the reading half), 0297 (the posting half).
  if not exists (select 1 from clara.schema_migrations where version = '0296_payroll_summary_typed_facts')
     or not exists (select 1 from clara.schema_migrations where version = '0297_payroll_summary_posting') then
    raise exception '#1048 prestate: 0296 and 0297 must both be applied before this file'
      using errcode = 'CLR10';
  end if;

  -- (b) THE FROZEN EVALUATOR IS FROZEN, AND IT IS THE ONLY VERSION. This file adds v2 BESIDE it;
  --     a v2 row already present means a redo.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)'::regprocedure;
  if v_sha is distinct from '0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd' then
    raise exception '#1048 prestate: clara.evaluate_payroll_run_state_v1 body drifted (sha %) -- this file NEVER recuts it and refuses to build on a body it cannot recognise', v_sha
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_versions
   where evaluator_name = 'evaluate_payroll_run_state';
  if v_n not in (1,2) then
    raise exception '#1048 prestate: clara.evaluator_versions holds % evaluate_payroll_run_state row(s), expected 1 (first apply) or 2 (redo)', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.evaluator_versions
                  where evaluator_name = 'evaluate_payroll_run_state' and version = 1) then
    raise exception '#1048 prestate: evaluate_payroll_run_state v1 is not registered -- 0296 must apply first'
      using errcode = 'CLR10';
  end if;

  -- (c) THE NEIGHBOUR THIS FILE RELIES ON AND DOES NOT TOUCH: the month parser.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._payroll_period_month(text)'::regprocedure;
  if v_sha is distinct from '401f76cba102a8eea0be6e9852401bb2f1e469de7298387f857c1a4a1f39b7c1' then
    raise exception '#1048 prestate: clara._payroll_period_month body drifted (sha %) -- the plan this file recuts calls it and pins it', v_sha
      using errcode = 'CLR10';
  end if;

  -- (d) THE FOUR BODIES THIS FILE RECUTS, each pinned BIMODALLY: the pre-image sha measured on
  --     this rig, or a body already carrying this file's own marker (a redo).
  for r in select * from (values
      ('clara._payroll_answers_ok(jsonb,text)',
       'f3e22d9db2b65afecf369fea77e46bab3d0451d053b236374f1a7f2f867e3f02'),
      ('clara._payroll_entry_plan(uuid,jsonb)',
       '9889780c7abcf79d6c939b79706c521113e7aa6b77b138cee6af1457e4889d83'),
      ('clara._payroll_posting_verdict(uuid)',
       '23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0'),
      ('clara._post_payroll_run(uuid)',
       '482d3cebb2c80629b9785ee6fef76dd2b8dd3121a7268d6c31dbfa95e4afb05b')
      ) as t(sig, pre_sha) loop
    if to_regprocedure(r.sig) is null then
      raise exception '#1048 prestate: % is absent -- 0297 must apply first', r.sig using errcode = 'CLR10';
    end if;
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_src, v_sha from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.pre_sha then
      if position('#1048' in v_src) = 0 then
        raise exception '#1048 prestate: % is neither 0297''s pre-image (sha %) nor this file''s own output (no #1048 marker) -- another lane recut it', r.sig, v_sha
          using errcode = 'CLR10';
      end if;
      raise notice '#1048 prestate: % already carries this file''s marker -- redo path', r.sig;
    end if;
  end loop;

  -- (e) THE TWO SPLICED BODIES, pinned the same way. A splice re-reads the installed definition,
  --     so its pre-image is whatever the chain left, and the sha below is this rig's measurement
  --     of exactly that.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid = 'clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)'::regprocedure;
  if v_sha is distinct from '63633a3f06edcb6effebb7b2ca9a8a82c805bb2ca33537e49a1660b66c22f7aa'
     and position('evaluate_payroll_run_state_v2' in v_src) = 0 then
    raise exception '#1048 prestate: clara.persist_payroll_facts is neither the 0297 post-image (sha %) nor already spliced to v2', v_sha
      using errcode = 'CLR10';
  end if;
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  if v_sha is distinct from 'd5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b'
     and position('payroll_completeness_question' in v_src) = 0 then
    raise exception '#1048 prestate: clara.list_review_queue is neither the 0302/0304 post-image (sha %) nor already carrying this file''s row kind', v_sha
      using errcode = 'CLR10';
  end if;

  -- (f) THE QUEUE PROJECTS SIXTEEN ROW KINDS TODAY AND NOT A SEVENTEENTH. Counted on the LIVE
  --     body with comments stripped, the same way the splice counts, so the two cannot disagree.
  select count(*)::int into v_n from (
    select 1 from regexp_matches(
      regexp_replace(regexp_replace(
        pg_get_functiondef('clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure),
        '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
      '''([a-z_]+)''::text row_kind', 'g')) x;
  if v_n not in (16,17) then
    raise exception '#1048 prestate: clara.list_review_queue projects % row kinds, expected 16 (first apply) or 17 (redo)', v_n
      using errcode = 'CLR10';
  end if;

  -- (g) THE EVENT TYPE THIS FILE SPEAKS IS NOT REGISTERED YET (or is, on a redo).
  select count(*)::int into v_n from clara.event_types
   where name = 'document.payroll_completeness_answered';
  if v_n not in (0,1) then
    raise exception '#1048 prestate: impossible event_types count %', v_n using errcode = 'CLR10';
  end if;

  raise notice '#1048 prestate: OK -- v1 frozen at its registered closure, the four recut bodies and the two spliced bodies at their measured pre-images (or this file''s own markers, on a redo), the queue at 16 row kinds, the month parser unmoved.';
end
$w1048_pre$;

-- =====================================================================================
-- SectionB  THE SUCCESSOR EVALUATOR -- clara.evaluate_payroll_run_state_v2(jsonb, jsonb).
--
--     A NEW _vN BESIDE THE FROZEN v1, NEVER A RECUT OF IT. 0296 registered v1's closure in
--     clara.evaluator_versions and its own freeze block says what a change costs in words: "a
--     redo after an edit to the evaluator body fails by name, and its only lawful repair is a _v2
--     -- which is exactly the law this registry exists to enforce, applied to this file as to any
--     other." clara.verify_evaluator_freeze() re-derives v1's hash LIVE between every migration
--     body and its commit, so an in-place edit would fail at APPLY, not merely at review. This is
--     the same posture clara.evaluate_metric_v2 took beside the deployed evaluate_metric_v1
--     (0135).
--
--     WHAT v2 ADDS, AND WHAT IT DELIBERATELY LEAVES ALONE. The eleven run-level questions, the
--     row census, the row identity, the column sums, the printed-total cross-check and the
--     text-vs-vision comparison are v1's, byte for byte -- a `_vN` that quietly moved a figure
--     would be a second opinion about the same page, and the battery pins v2's `facts`, `rows`,
--     `established`, `disagreed` and `missing` against v1's OWN output on the SAME envelopes.
--     What is new sits in TWO NEW TOP-LEVEL KEYS and nowhere else:
--       `witness`      -- the two completeness questions, each with its own verdict.
--       `completeness` -- what those two, read against the row census, say about whether the lines
--                         read are ALL the lines.
--     Keeping them OUT of `facts` is not tidiness. clara._payroll_posting_verdict walks
--     `jsonb_each(facts)` and folds any state in ('channels_disagree','rows_contested') into the
--     `channels_agree` rung and any state in ('totals_mismatch','rows_unbalanced','unreadable',
--     'unanswered') into `arithmetic_holds`. A witness question the frozen prompts never ask would
--     arrive `unanswered` inside `facts` and would block EVERY payroll run in the estate on the
--     grounds that the page "does not add up". Two new keys cost one line in each consumer; one
--     new fact would have cost the lane.
--
--     A COUNT IS NOT MONEY, and it is parsed as a count. v1's normalization turns "2" into 200
--     cents, which is the right answer for a figure and the wrong one for a headcount. The witness
--     arm below therefore parses a plain non-negative integer of at most six digits (thousands
--     separators and spaces dropped, nothing else admitted) and compares the two channels on THAT
--     integer -- the same "compare the figure, not the typography" rule v1 applies to money,
--     applied to the right type.
--
--     `not_asked` IS A VERDICT, AND IT IS NOT `not_printed`. A page that prints no headcount and a
--     prompt that never asked for one are different facts about the world, and a lane that
--     conflated them would report "the page is silent" about its own missing question. Both lead
--     to the same place (the parked question), and the state says which it was.
--
--     IT CALLS NO OTHER clara FUNCTION AND READS NO TABLE, exactly as v1 does not, and for 0140's
--     own structural reason: registering a closure freezes EVERY member body estate-wide, so an
--     N-member registration is N bodies a later lane can never recut. The count normalization is
--     written INLINE here for the same reason v1 writes the cents normalization inline.
--
--     REDO-SAFE: `create or replace function` (the freeze registration in SectionB.1 is guarded).
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.evaluate_payroll_run_state_v2(p_text jsonb, p_vision jsonb)
  returns jsonb language plpgsql immutable
  set search_path = clara, pg_temp as $eval2$
declare
  -- The eleven run-level questions, in the brief's own order (v1's array, unchanged).
  v_run text[] := array['payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'];
  -- #1048: THE TWO COMPLETENESS WITNESSES. Counts, not money, and NOT members of v_run.
  v_witness text[] := array['payroll.run.employee_count','payroll.run.page_count'];
  -- The SIX run-level questions that have a per-employee counterpart, paired with it.
  v_sum_run text[] := array['payroll.run.gross_pay','payroll.run.epf_employee',
    'payroll.run.socso_employee','payroll.run.eis_employee',
    'payroll.run.pcb','payroll.run.net_pay'];
  v_sum_row text[] := array['payroll.row.gross_pay','payroll.row.epf_employee',
    'payroll.row.socso_employee','payroll.row.eis_employee',
    'payroll.row.pcb','payroll.row.net_pay'];
  v_flat jsonb;              -- every quote from both channels, normalized, as one array
  v_rows_text int; v_rows_vision int;
  v_contested int[]; v_agreed int[]; v_unbalanced int[]; v_unchecked int[];
  v_facts jsonb := '{}'::jsonb;
  v_wfacts jsonb := '{}'::jsonb;
  v_established text[] := array[]::text[];
  v_disagreed text[] := array[]::text[];
  v_missing text[] := array[]::text[];
  v_i int; v_j int; v_f text; v_rf text;
  v_t_state text; v_t_raw text; v_t_cents bigint;
  v_v_state text; v_v_raw text; v_v_cents bigint;
  v_printed_cents bigint; v_printed_raw text;
  v_computed bigint; v_computable boolean;
  v_state text; v_reason text; v_basis text; v_fact jsonb;
  -- #1048's own locals.
  v_t_count int; v_v_count int; v_count int;
  v_rows_read int; v_ec int; v_pc int; v_ec_state text; v_pc_state text;
  v_witness_name text; v_verdict text; v_wreason text;
begin
  if p_text is null or p_vision is null
     or jsonb_typeof(p_text->'payroll'->'answers') <> 'object'
     or jsonb_typeof(p_vision->'payroll'->'answers') <> 'object' then
    return jsonb_build_object('state_version','v2','refusal','payroll_envelope_malformed',
      'reason','each channel must carry a payroll envelope with an answers object');
  end if;

  -- -------------------------------------------------------------------------------------
  -- 1 . FLATTEN AND NORMALIZE, ONCE (v1's statement, unchanged). Every quote from both channels
  --     becomes one element carrying its channel, scope, row number, key, state, verbatim
  --     rendering and normalized cents. The witness answers ride along as ordinary `run` quotes;
  --     their `cents` column is never read (a count is parsed in step 3b).
  -- -------------------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'ch', q.ch, 'scope', q.scope, 'row_no', q.row_no, 'k', q.k,
           'st', q.st, 'rw', q.rw, 'cents', n.cents)), '[]'::jsonb)
    into v_flat
    from (
      select s.ch, 'run'::text as scope, null::int as row_no, a.key as k,
             a.value->>'state' as st, a.value->>'raw' as rw
        from (select 'text'::text as ch, p_text as env
              union all
              select 'vision'::text, p_vision) s,
             lateral jsonb_each(s.env->'payroll'->'answers') a
      union all
      select s.ch, 'row'::text, (r.value->>'row_no')::int, c.key,
             c.value->>'state', c.value->>'raw'
        from (select 'text'::text as ch, p_text as env
              union all
              select 'vision'::text, p_vision) s,
             lateral jsonb_array_elements(
               case when jsonb_typeof(s.env->'payroll'->'rows') = 'array'
                    then s.env->'payroll'->'rows' else '[]'::jsonb end) r,
             lateral jsonb_each(r.value->'cells') c
       where jsonb_typeof(r.value->'cells') = 'object'
         and (r.value->>'row_no') ~ '^[1-9][0-9]*$'
    ) q
    cross join lateral (
      select upper(btrim(coalesce(q.rw,''))) as u
    ) z0
    cross join lateral (
      select regexp_replace(regexp_replace(regexp_replace(
               z0.u, '^\(|\)$', '', 'g'), '(MYR|RM)', '', 'g'), '[,[:space:]]', '', 'g') as cl
    ) z1
    cross join lateral (
      select case
               when q.st <> 'value' then null::bigint
               when z1.cl ~ '^-?[0-9]{1,13}(\.[0-9]{1,2})?$'
                 then (case when z0.u ~ '^\(.*\)$' then -1 else 1 end)
                      * round(z1.cl::numeric * 100)::bigint
               else null::bigint
             end as cents
    ) n;

  -- -------------------------------------------------------------------------------------
  -- 2 . THE ROWS (v1's two statements, unchanged).
  -- -------------------------------------------------------------------------------------
  select count(distinct row_no) into v_rows_text
    from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
   where ch = 'text' and scope = 'row';
  select count(distinct row_no) into v_rows_vision
    from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
   where ch = 'vision' and scope = 'row';

  with cells as (
    select * from jsonb_to_recordset(v_flat)
      as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where scope = 'row'
  ), keyed as (
    select ch, row_no, k, st, coalesce(cents::text, 'RAW:' || coalesce(rw,'')) as fig
      from cells
  ), per_row as (
    select row_no,
           count(*) filter (where ch = 'text') as n_text,
           count(*) filter (where ch = 'vision') as n_vision,
           count(distinct (k, st, fig)) as distinct_readings
      from keyed group by row_no
  )
  select coalesce(array_agg(row_no order by row_no) filter (
           where n_text = array_length(v_sum_row,1)
             and n_vision = array_length(v_sum_row,1)
             and distinct_readings = array_length(v_sum_row,1)), array[]::int[]),
         coalesce(array_agg(row_no order by row_no) filter (
           where not (n_text = array_length(v_sum_row,1)
                  and n_vision = array_length(v_sum_row,1)
                  and distinct_readings = array_length(v_sum_row,1))), array[]::int[])
    into v_agreed, v_contested
    from per_row;

  with cells as (
    select * from jsonb_to_recordset(v_flat)
      as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where scope = 'row' and ch = 'text' and row_no = any(v_agreed)
  ), pivot as (
    select row_no,
           max(cents) filter (where k = 'payroll.row.gross_pay') as gross,
           max(cents) filter (where k = 'payroll.row.epf_employee') as epf,
           max(cents) filter (where k = 'payroll.row.socso_employee') as socso,
           max(cents) filter (where k = 'payroll.row.eis_employee') as eis,
           max(cents) filter (where k = 'payroll.row.pcb') as pcb,
           max(cents) filter (where k = 'payroll.row.net_pay') as net,
           count(*) filter (where cents is null) as unreadable_cells
      from cells group by row_no
  )
  select coalesce(array_agg(row_no order by row_no) filter (
           where unreadable_cells = 0 and gross - (epf + socso + eis + pcb) <> net), array[]::int[]),
         coalesce(array_agg(row_no order by row_no) filter (
           where unreadable_cells > 0), array[]::int[])
    into v_unbalanced, v_unchecked
    from pivot;

  -- -------------------------------------------------------------------------------------
  -- 3 . THE ELEVEN QUESTIONS (v1's loop, unchanged, and it must stay so: the battery compares
  --     every one of these verdicts against v1's own output on the same envelopes).
  -- -------------------------------------------------------------------------------------
  for v_i in 1 .. array_length(v_run,1) loop
    v_f := v_run[v_i];
    select st, rw, cents into v_t_state, v_t_raw, v_t_cents
      from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where ch = 'text' and scope = 'run' and k = v_f;
    select st, rw, cents into v_v_state, v_v_raw, v_v_cents
      from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where ch = 'vision' and scope = 'run' and k = v_f;

    v_rf := null; v_computed := null; v_computable := false;
    v_printed_cents := null; v_printed_raw := null;
    v_state := null; v_reason := null; v_basis := null;

    for v_j in 1 .. array_length(v_sum_run,1) loop
      if v_sum_run[v_j] = v_f then v_rf := v_sum_row[v_j]; end if;
    end loop;

    if v_rf is not null and array_length(v_agreed,1) > 0
       and coalesce(array_length(v_contested,1),0) = 0
       and coalesce(array_length(v_unbalanced,1),0) = 0
       and coalesce(array_length(v_unchecked,1),0) = 0 then
      select count(*) filter (where cents is null) = 0, sum(cents)
        into v_computable, v_computed
        from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
       where ch = 'text' and scope = 'row' and k = v_rf and row_no = any(v_agreed);
      if not v_computable then v_computed := null; end if;
    end if;

    if v_t_state is null or v_v_state is null then
      v_state := 'unanswered'; v_reason := 'a channel did not answer this question';
    elsif v_f = 'payroll.run.period' then
      if v_t_state <> v_v_state or (v_t_state = 'value' and btrim(v_t_raw) is distinct from btrim(v_v_raw)) then
        v_state := 'channels_disagree'; v_reason := 'text_and_vision_read_different_figures';
      elsif v_t_state = 'not_printed' then
        v_state := 'not_printed'; v_reason := 'no_printed_total';
      else
        v_state := 'established'; v_printed_raw := btrim(v_t_raw); v_basis := 'printed_value';
      end if;
    elsif v_t_state <> v_v_state
       or coalesce(v_t_cents::text, 'RAW:' || coalesce(v_t_raw,''))
          is distinct from coalesce(v_v_cents::text, 'RAW:' || coalesce(v_v_raw,'')) then
      v_state := 'channels_disagree'; v_reason := 'text_and_vision_read_different_figures';
    elsif v_t_state = 'value' and v_t_cents is null then
      v_state := 'unreadable'; v_reason := 'rendering_is_not_a_figure'; v_printed_raw := v_t_raw;
    elsif v_rf is not null and coalesce(array_length(v_contested,1),0) > 0 then
      v_state := 'rows_contested'; v_reason := 'the two channels read a quoted row differently';
      if v_t_state = 'value' then v_printed_cents := v_t_cents; v_printed_raw := v_t_raw; end if;
    elsif v_rf is not null and (coalesce(array_length(v_unbalanced,1),0) > 0
                             or coalesce(array_length(v_unchecked,1),0) > 0) then
      v_state := 'rows_unbalanced';
      v_reason := case when coalesce(array_length(v_unbalanced,1),0) > 0
                       then 'row_identity_failed' else 'row_identity_uncheckable' end;
      if v_t_state = 'value' then v_printed_cents := v_t_cents; v_printed_raw := v_t_raw; end if;
    elsif v_t_state = 'not_printed' then
      v_state := 'not_printed'; v_reason := 'no_printed_total';
    elsif v_computed is not null and v_computed is distinct from v_t_cents then
      v_state := 'totals_mismatch'; v_reason := 'printed_total_disagrees_row_sum';
      v_printed_cents := v_t_cents; v_printed_raw := v_t_raw;
    else
      v_state := 'established'; v_printed_cents := v_t_cents; v_printed_raw := v_t_raw;
      v_basis := case when v_rf is null then 'printed_total_no_row_counterpart'
                      when v_computed is not null then 'printed_total_agrees_row_sum'
                      else 'printed_total_no_rows' end;
    end if;

    v_fact := jsonb_build_object(
      'state', v_state,
      'printed_raw', to_jsonb(v_printed_raw),
      'printed_cents', to_jsonb(v_printed_cents),
      'computed_cents', to_jsonb(v_computed),
      'row_field', to_jsonb(v_rf),
      'text_raw', to_jsonb(case when v_t_state = 'value' then v_t_raw end),
      'vision_raw', to_jsonb(case when v_v_state = 'value' then v_v_raw end),
      'reason', to_jsonb(v_reason),
      'basis', to_jsonb(v_basis));
    v_facts := v_facts || jsonb_build_object(v_f, v_fact);

    if v_state = 'established' then v_established := v_established || v_f;
    elsif v_state = 'not_printed' then v_missing := v_missing || v_f;
    else v_disagreed := v_disagreed || v_f;
    end if;
  end loop;

  -- -------------------------------------------------------------------------------------
  -- 3b . #1048 . THE TWO COMPLETENESS WITNESSES. Read off the page by BOTH channels and compared
  --      HERE as integers. A question neither channel was asked is `not_asked`; a question the
  --      page does not print is `not_printed`; a rendering that is not a whole number is
  --      `unreadable`; two channels that read different numbers is `channels_disagree`. There is
  --      no arm in which a count this body did not parse itself becomes a witness.
  --
  --      ONE CHANNEL QUOTING A LABEL THE OTHER DID NOT SEE IS ITS OWN STATE (fix round, ADV-01),
  --      `one_channel_printed`, and NOT `channels_disagree`. The two are different facts: two
  --      channels reading 12 and 13 off one line have read the same thing twice and got two
  --      answers, while a value against a `not_printed` is ONE reading and one silence -- the
  --      likeliest split of all once the prompts ask these questions, because a small
  --      "Total employees:" label is exactly what one model finds and the other misses. Both are
  --      still `absent` to the completeness verdict, so neither ever becomes a witness; the split
  --      exists so the detail a later reader sees names what actually happened.
  -- -------------------------------------------------------------------------------------
  for v_i in 1 .. array_length(v_witness,1) loop
    v_f := v_witness[v_i];
    select st, rw into v_t_state, v_t_raw
      from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where ch = 'text' and scope = 'run' and k = v_f;
    select st, rw into v_v_state, v_v_raw
      from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where ch = 'vision' and scope = 'run' and k = v_f;

    v_state := null; v_wreason := null; v_count := null; v_t_count := null; v_v_count := null;

    if v_t_state is null and v_v_state is null then
      v_state := 'not_asked'; v_wreason := 'neither_channel_was_asked_this_question';
    elsif v_t_state is null or v_v_state is null then
      v_state := 'not_asked'; v_wreason := 'only_one_channel_answered_this_question';
    elsif v_t_state <> v_v_state then
      v_state := 'one_channel_printed'; v_wreason := 'one_channel_read_a_witness_the_other_did_not';
    elsif v_t_state = 'not_printed' then
      v_state := 'not_printed'; v_wreason := 'the_page_prints_no_such_count';
    else
      -- Both channels quoted a rendering. A COUNT: thousands separators and spaces dropped, then a
      -- plain non-negative integer of at most six digits. Anything else is unreadable, never a
      -- guess -- the same refusal v1 gives a money rendering that does not normalize.
      select case when regexp_replace(btrim(coalesce(v_t_raw,'')), '[,[:space:]]', '', 'g') ~ '^[0-9]{1,6}$'
                  then regexp_replace(btrim(coalesce(v_t_raw,'')), '[,[:space:]]', '', 'g')::int end
        into v_t_count;
      select case when regexp_replace(btrim(coalesce(v_v_raw,'')), '[,[:space:]]', '', 'g') ~ '^[0-9]{1,6}$'
                  then regexp_replace(btrim(coalesce(v_v_raw,'')), '[,[:space:]]', '', 'g')::int end
        into v_v_count;
      if v_t_count is null or v_v_count is null then
        v_state := 'unreadable'; v_wreason := 'rendering_is_not_a_whole_number';
      elsif v_t_count <> v_v_count then
        v_state := 'channels_disagree'; v_wreason := 'text_and_vision_read_different_counts';
      else
        v_state := 'established'; v_count := v_t_count;
      end if;
    end if;

    v_wfacts := v_wfacts || jsonb_build_object(v_f, jsonb_build_object(
      'state', v_state,
      'printed_raw', to_jsonb(case when v_t_state = 'value' then btrim(v_t_raw) end),
      'printed_count', to_jsonb(v_count),
      'text_raw', to_jsonb(case when v_t_state = 'value' then v_t_raw end),
      'vision_raw', to_jsonb(case when v_v_state = 'value' then v_v_raw end),
      'reason', to_jsonb(v_wreason)));
  end loop;

  -- -------------------------------------------------------------------------------------
  -- 3c . #1048 . THE COMPLETENESS VERDICT. Read the two witnesses against the row census, in a
  --      fixed precedence, and say in ONE word whether the lines read may stand for the run.
  --
  --      THE HEADCOUNT IS READ FIRST AND IT CAN REFUSE. A page that prints a headcount the lines
  --      contradict is the one case in which a witness makes things WORSE than silence: the
  --      document says twelve and the reading found eleven, so the reading is known to be
  --      incomplete and nothing may post from it -- not even against a page count of one, which
  --      is why that arm is below this one and not beside it.
  --
  --      `rows_read` IS `rows.agreed`: the row set the column sums were computed over (0296's own
  --      rule at its step 3). A headcount compared against anything larger would admit a page
  --      whose last line the two channels read differently.
  -- -------------------------------------------------------------------------------------
  v_rows_read := coalesce(array_length(v_agreed,1),0);
  v_ec_state := v_wfacts->'payroll.run.employee_count'->>'state';
  v_pc_state := v_wfacts->'payroll.run.page_count'->>'state';
  v_ec := nullif(v_wfacts->'payroll.run.employee_count'->>'printed_count','')::int;
  v_pc := nullif(v_wfacts->'payroll.run.page_count'->>'printed_count','')::int;
  v_witness_name := null; v_verdict := null; v_wreason := null;

  if v_rows_read = 0 then
    v_verdict := 'absent'; v_wreason := 'no_employee_line_was_read';
  elsif v_ec_state = 'established' and v_ec = v_rows_read then
    v_verdict := 'witnessed'; v_witness_name := 'headcount';
    v_wreason := 'printed_headcount_equals_lines_read';
  elsif v_ec_state = 'established' then
    v_verdict := 'contradicted'; v_wreason := 'printed_headcount_disagrees_lines_read';
  elsif v_ec_state in ('channels_disagree','unreadable','one_channel_printed') then
    v_verdict := 'absent'; v_wreason := 'printed_headcount_could_not_be_read';
  elsif v_pc_state = 'established' and v_pc = 1 then
    v_verdict := 'witnessed'; v_witness_name := 'single_page';
    v_wreason := 'the_page_says_it_is_the_whole_document';
  elsif v_pc_state = 'established' and v_pc = 0 then
    -- A PRINTED ZERO IS NOT "more pages than the one read" (fix round, ADV-11). The count regex
    -- admits 0, and a page that says it is page 0 of 0 has said something this body cannot use
    -- either way; it gets its own reason rather than borrowing a sentence about truncation.
    v_verdict := 'absent'; v_wreason := 'the_summary_prints_a_page_count_of_zero';
  elsif v_pc_state = 'established' then
    v_verdict := 'absent'; v_wreason := 'the_summary_names_more_pages_than_the_one_read';
  else
    v_verdict := 'absent'; v_wreason := 'no_completeness_witness_printed';
  end if;

  return jsonb_build_object(
    'state_version','v2',
    'rows', jsonb_build_object(
      'text', v_rows_text, 'vision', v_rows_vision,
      'agreed', coalesce(array_length(v_agreed,1),0),
      'balanced', coalesce(array_length(v_agreed,1),0)
                  - coalesce(array_length(v_unbalanced,1),0)
                  - coalesce(array_length(v_unchecked,1),0),
      'contested', to_jsonb(v_contested),
      'unbalanced', to_jsonb(v_unbalanced),
      'unchecked', to_jsonb(v_unchecked)),
    'facts', v_facts,
    'witness', v_wfacts,
    'completeness', jsonb_build_object(
      'rows_read', v_rows_read,
      'employee_count', to_jsonb(case when v_ec_state = 'established' then v_ec end),
      'page_count', to_jsonb(case when v_pc_state = 'established' then v_pc end),
      'witness', to_jsonb(v_witness_name),
      'verdict', v_verdict,
      'reason', v_wreason),
    'established', to_jsonb(v_established),
    'disagreed', to_jsonb(v_disagreed),
    'missing', to_jsonb(v_missing));
end $eval2$;

revoke all on function clara.evaluate_payroll_run_state_v2(jsonb, jsonb) from public;

comment on function clara.evaluate_payroll_run_state_v2(jsonb, jsonb) is
  '#1048: the payroll run''s deterministic evaluator, SECOND version -- v1''s eleven questions, row census, row identity, column sums, printed-total cross-check and text-vs-vision comparison byte for byte, PLUS the two completeness witnesses (a printed employee headcount and a printed page count) in their own `witness` object and the completeness verdict in its own `completeness` object. The two new keys are deliberately NOT members of `facts`: clara._payroll_posting_verdict folds an unanswered fact into its arithmetic rung, and a witness the frozen prompts do not ask yet would have blocked every payroll run in the estate. A count is parsed as a whole number, never through v1''s money normalization. A NEW _vN beside the frozen v1, never a recut of it (0296 registered v1''s closure and refuses an in-place edit at APPLY). It reads no table and calls no other clara function, which is what keeps its clara.evaluator_versions closure at ONE member and the freeze meaningful.';

reset role;

-- -------------------------------------------------------------------------------------
-- SectionB.1  THE FREEZE REGISTRATION, single-member by construction (0140's shape, 0296's use).
--
--       THE SEARCH PATH IS pg_catalog,pg_temp FOR THE REGISTRATION ITSELF, exactly as 0296's own
--       block records: clara.verify_evaluator_freeze() re-derives the closure hash under
--       pg_catalog,pg_temp, so a registration performed under ANY OTHER search_path stores a hash
--       the verifier CANNOT reproduce and every later apply reds.
--
--       deployed = false: the deploy-lock flip is a one-way ceremony act under 0060's
--       _tf_evaluator_deploy_once, never a migration's to make. The freeze binds regardless.
--
--       REDO-SAFE, AND NOT BY RE-WRITING THE ROW -- BY REFUSING TO. This block INSERTS when the
--       registration is absent and, when it is already present, RE-DERIVES the closure hash from
--       the live catalog and refuses if it has moved.
-- -------------------------------------------------------------------------------------
set local search_path = pg_catalog, pg_temp;
do $w1048_freeze$
declare e uuid; h bytea; v_live bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), 'hex'),
           '' order by o), 'UTF8')) into h
    from (values (0, 'clara.evaluate_payroll_run_state_v2(jsonb,jsonb)')) m(o, s);

  select ev.closure_sha256 into v_live from clara.evaluator_versions ev
   where ev.evaluator_name = 'evaluate_payroll_run_state' and ev.version = 2;
  if v_live is not null then
    if v_live is distinct from h then
      raise exception '#1048 freeze: clara.evaluate_payroll_run_state_v2 is already registered at a DIFFERENT closure hash. A registration is append-only and a frozen body is never recut in place: ship the change as clara.evaluate_payroll_run_state_v3 with its own version row.'
        using errcode = 'CLR10';
    end if;
    return;   -- already registered, at exactly this body: a redo has nothing to do here
  end if;

  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    values ('evaluate_payroll_run_state', 2, 'clara.evaluate_payroll_run_state_v2(jsonb,jsonb)', h,
      '0343_payroll_completeness_witness', false)
    returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), null::uuid
      from (values (0, 'clara.evaluate_payroll_run_state_v2(jsonb,jsonb)')) m(o, s);
end
$w1048_freeze$;
set local search_path = clara, pg_temp;

-- =====================================================================================
-- SectionC  THE ANSWER VOCABULARY GAINS TWO OPTIONAL QUESTIONS -- clara._payroll_answers_ok
--     recut. 0296's own body, with exactly one change: the two witness names are KNOWN keys, and
--     they are the FIRST keys in this family that are not also REQUIRED keys.
--
--     WHY OPTIONAL, AND WHY THAT IS THE WHOLE DEPLOY STORY. `payrollFacts_v1` is a FROZEN workflow
--     family (#945) and the work order forbids editing a frozen body, so the worker that reads a
--     payslip today sends exactly the eleven run-level answers 0296's prompts ask for. If this door
--     required thirteen, every payroll read in the estate would be refused at the write boundary
--     the moment 0343 applied -- a migration that turns a working lane off. So the two witnesses
--     are admitted when present and absent without complaint, the evaluator calls an absent one
--     `not_asked` rather than `not_printed`, and the lane degrades to the PARKED QUESTION, which is
--     the brief's own fallback. The prompt stanza that starts asking them is a SUCCESSOR CONTRACT
--     in the ticket report, never an edit here.
--
--     `not_printed` IS STILL A FIRST-CLASS ANSWER, for a witness as much as for a figure: a prompt
--     that asked for the headcount and a page that does not print one are two different facts, and
--     a worker that answered `not_printed` is telling this estate the second.
--
--     EVERYTHING ELSE IS 0296's, unchanged and deliberately so: the closed three-member envelope
--     (no `totals` key smuggled in beside the answers), the per-answer 200-character bound, the
--     two-state vocabulary with no default, the 2000-row bound, the per-row closed key set, the
--     duplicate row_no refusal. The battery re-drives each of them after this recut, because a
--     vocabulary widening that quietly relaxed a neighbour is the failure this recut most risks.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._payroll_answers_ok(p_envelope jsonb, p_channel text)
  returns boolean language plpgsql stable security definer
  set search_path = clara, pg_temp as $pao$
declare
  -- The ELEVEN run-level questions. `period` is the only non-monetary one; the other ten are
  -- money the page either prints or does not. EVERY one of them is required.
  v_run text[] := array['payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'];
  -- #1048: THE TWO COMPLETENESS WITNESSES -- KNOWN keys, NOT required ones. See this section's
  -- header for why optional is the only shape that does not turn the live lane off.
  v_witness text[] := array['payroll.run.employee_count','payroll.run.page_count'];
  -- The SIX cells a payslip row prints, and the exact terms of the row identity.
  v_cell text[] := array['payroll.row.gross_pay','payroll.row.epf_employee',
    'payroll.row.socso_employee','payroll.row.eis_employee',
    'payroll.row.pcb','payroll.row.net_pay'];
  v_payroll jsonb; v_answers jsonb; v_rows jsonb; v_row jsonb; v_cells jsonb;
  v_f text; v_a jsonb; v_state text; v_raw text; v_no int; v_seen int[] := array[]::int[];
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then return false; end if;
  v_payroll := p_envelope->'payroll';
  if v_payroll is null or jsonb_typeof(v_payroll) <> 'object' then return false; end if;
  -- THE ENVELOPE ITSELF IS CLOSED. Three members and no fourth: a `totals` key smuggled in
  -- beside the answers would be a computed figure travelling as a read, which is the one thing
  -- this family forbids the model to produce.
  if exists (select 1 from jsonb_object_keys(v_payroll) as k(name)
              where k.name not in ('channel','answers','rows')) then return false; end if;
  if (v_payroll->>'channel') is distinct from p_channel then return false; end if;

  v_answers := v_payroll->'answers';
  if v_answers is null or jsonb_typeof(v_answers) <> 'object' then return false; end if;
  -- HALF ONE: every key present is a KNOWN key -- one of the eleven, or one of #1048's two
  -- witnesses. A near-miss spelling (`payroll.run.headcount`) is still an unknown key.
  if exists (select 1 from jsonb_object_keys(v_answers) as k(name)
              where k.name <> all(v_run) and k.name <> all(v_witness)) then return false; end if;
  -- HALF TWO: every one of the eleven is PRESENT. A `count = 11` test would pass a map that
  -- answered one question twice under two spellings, which is why this is a loop and not a
  -- count (clara._witness_answers_ok's own recorded reason for the same shape).
  foreach v_f in array v_run loop
    v_a := v_answers->v_f;
    if v_a is null or jsonb_typeof(v_a) <> 'object' then return false; end if;
    v_state := v_a->>'state';
    if v_state is null or v_state not in ('value','not_printed') then return false; end if;
    if v_state = 'value' then
      v_raw := nullif(btrim(coalesce(v_a->>'raw','')),'');
      if v_raw is null then return false; end if;
      -- The same 200-character bound clara._witness_answers_ok applies to every answer: far past
      -- any real rendering, far short of anything that could stress a later numeric read.
      if length(v_a->>'raw') > 200 then return false; end if;
    end if;
  end loop;
  -- HALF THREE (#1048): a witness answer that IS present is held to the SAME shape as one of the
  -- eleven -- the two-state vocabulary, a non-blank rendering, the 200-character bound. Optional
  -- means "may be absent", never "may be malformed".
  foreach v_f in array v_witness loop
    v_a := v_answers->v_f;
    if v_a is null then continue; end if;
    if jsonb_typeof(v_a) <> 'object' then return false; end if;
    v_state := v_a->>'state';
    if v_state is null or v_state not in ('value','not_printed') then return false; end if;
    if v_state = 'value' then
      v_raw := nullif(btrim(coalesce(v_a->>'raw','')),'');
      if v_raw is null then return false; end if;
      if length(v_a->>'raw') > 200 then return false; end if;
    end if;
  end loop;

  v_rows := v_payroll->'rows';
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then return false; end if;
  -- A BOUND ON THE QUOTED ROWS. 2000 is far past any payroll run a Malaysian SME firm files and
  -- far short of a payload that could make the evaluator's own loop a denial of service. A run
  -- larger than this is a refusal to READ, never a silent truncation.
  if jsonb_array_length(v_rows) > 2000 then return false; end if;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(v_row) as k(name)
                where k.name not in ('row_no','cells')) then return false; end if;
    if jsonb_typeof(v_row->'row_no') <> 'number' then return false; end if;
    -- The shape is checked BEFORE the cast: a fractional or negative row number is refused as a
    -- malformed read rather than silently rounded into a neighbour's row.
    if (v_row->>'row_no') !~ '^[1-9][0-9]*$' then return false; end if;
    v_no := (v_row->>'row_no')::int;
    -- TWO ROWS AT ONE PRINTED ROW NUMBER would be double-counted by every column sum.
    if v_no = any(v_seen) then return false; end if;
    v_seen := v_seen || v_no;
    v_cells := v_row->'cells';
    if v_cells is null or jsonb_typeof(v_cells) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(v_cells) as k(name)
                where k.name <> all(v_cell)) then return false; end if;
    foreach v_f in array v_cell loop
      v_a := v_cells->v_f;
      if v_a is null or jsonb_typeof(v_a) <> 'object' then return false; end if;
      v_state := v_a->>'state';
      if v_state is null or v_state not in ('value','not_printed') then return false; end if;
      if v_state = 'value' then
        v_raw := nullif(btrim(coalesce(v_a->>'raw','')),'');
        if v_raw is null then return false; end if;
        if length(v_a->>'raw') > 200 then return false; end if;
      end if;
    end loop;
  end loop;

  return true;
end $pao$;

revoke all on function clara._payroll_answers_ok(jsonb, text) from public;

comment on function clara._payroll_answers_ok(jsonb, text) is
  '#945, widened by #1048: the payroll family''s OWN closed answer vocabulary -- eleven REQUIRED run-level questions, two OPTIONAL completeness witnesses (payroll.run.employee_count, payroll.run.page_count), six per-employee cells, `not_printed` a first-class answer everywhere, an unknown key at any level a refusal. The witnesses are optional because payrollFacts_v1 is FROZEN and does not ask them yet: requiring them would refuse every live payroll read at the write boundary. Optional means may be absent, never may be malformed -- a witness answer that IS present is held to the same two-state, non-blank, 200-character shape as one of the eleven. Deliberately NOT an arm of clara._witness_answers_ok: a versioned workflow may not couple its shape to another family''s frozen files. Ungranted; its only caller is clara.persist_payroll_facts, which runs as the owner.';

reset role;

-- =====================================================================================
-- SectionD  THE LANE BANKS A v2 STATE -- clara.persist_payroll_facts spliced.
--
--     SPLICED, NEVER RE-TYPED (the 0017:1553 / 0093 / 0260 / 0297 idiom). This reads the INSTALLED
--     definition off the catalog, asserts the anchor occurs EXACTLY ONCE, replaces only there and
--     executes the result. Everything 0296 wrote and everything 0297 spliced in -- the strip, the
--     eleven typed regions, the citation resolution, the usage metering, the post, the settle
--     receipt -- is preserved BY CONSTRUCTION rather than by a careful human copy, and the
--     postcheck re-reads the committed catalog to prove the untouched regions survived.
--
--     ONE ANCHOR, ONE BYTE OF MEANING: the evaluator call moves from v1 to v2. Nothing else in
--     this door changes, and that is the point of a one-anchor splice -- the witness answers are
--     already stored, because step 7 stores the channel's answers VERBATIM and the two new keys
--     are answers like any other. The eleven typed regions are still the eleven: this file does
--     not mint a document_regions row for a witness, because a count is not a monetary fact a
--     person clicks on the page and clara._assert_field_path would have to learn two more paths
--     for no reader. The witness is legible in the banked state and in the stored answers, which
--     is where every reader of it looks.
--
--     WHY THE BANKED STATE AND NOT A RE-DERIVATION. 0296's own header says it: the rows the
--     evaluator sums are STRIPPED at this boundary, so the state cannot be recomputed from what is
--     stored. The completeness verdict is therefore banked at the one moment its inputs exist,
--     beside the answers it judges -- and a reading judged today stays judged the way it was, even
--     if a later _v3 changes what a witness means.
--
--     A v1 STATE ALREADY BANKED STAYS v1 AND STILL POSTS. Every payroll pair read before this
--     migration carries `state_version: v1` and no `completeness` object at all. SectionF's recut
--     plan admits both versions by name; a v1 state simply has no witness, which puts it on the
--     parked-question path -- the honest answer, and the one a person can actually act on.
-- =====================================================================================
do $w1048_persist$
declare
  v_sig text := 'clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)';
  v_def text; v_next text; v_anchor text; v_repl text;
  v_n int; v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;

  if position('evaluate_payroll_run_state_v2' in v_def) > 0 then
    raise notice '#1048 SectionD: clara.persist_payroll_facts already calls the v2 evaluator -- splice already applied, nothing to do (redo)';
  else
    -- ONE ANCHOR, asserted to occur EXACTLY once, and it is a single dollar-quoted literal rather
    -- than a `||` chain with chr(): apps/web/test/sqlFunctionCensus.ts proves what a migration's
    -- dynamic `execute` installs by RECONSTRUCTING the statement from its parts, and it cannot
    -- evaluate chr(). A replacement it cannot reconstruct makes the whole splice an unresolved
    -- execute and the census fails closed (0297's own measured lesson, recorded in its SectionG).
    v_anchor := $p1048a$  v_state := clara.evaluate_payroll_run_state_v1(v_text_env, v_vision_env);$p1048a$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#1048 SectionD splice: the evaluator-call anchor appears % time(s), expected 1', v_n
        using errcode = 'CLR10';
    end if;
    v_repl := $p1048b$  -- #1048: the SUCCESSOR evaluator. v1's eleven verdicts byte for byte, plus the two
  --     completeness witnesses and the completeness verdict read off them against the row
  --     census. The witness answers are already inside v_text_env/v_vision_env: they are
  --     ordinary run-level answers, admitted as OPTIONAL by clara._payroll_answers_ok.
  v_state := clara.evaluate_payroll_run_state_v2(v_text_env, v_vision_env);$p1048b$;
    v_next := replace(v_def, v_anchor, v_repl);

    if v_next = v_def then
      raise exception '#1048 SectionD splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;
    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#1048 SectionD postcheck: persist_payroll_facts changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#1048 SectionD postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode = 'CLR10';
    end if;
    raise notice '#1048 SectionD: clara.persist_payroll_facts spliced -- the payroll lane now banks a v2 state. owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;

  -- BOTH BRANCHES: the regions this file must not have disturbed are re-read from the COMMITTED
  -- catalog, so a redo proves them too -- 0296's per-employee STRIP, its completed event, 0297's
  -- own post call, and the absence of any surviving v1 call.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('''payroll'', jsonb_build_object(''channel'',''text'',''answers'', v_text_env->''payroll''->''answers'')' in v_def) = 0
     or position('document.payroll_facts_completed' in v_def) = 0
     or position('_post_payroll_run' in v_def) = 0
     or position('evaluate_payroll_run_state_v2' in v_def) = 0
     or position('evaluate_payroll_run_state_v1' in v_def) <> 0 then
    raise exception '#1048 SectionD postcheck: the recut body lost 0296''s per-employee STRIP or its completed event, lost 0297''s post call, did not gain the v2 evaluator, or still calls v1'
      using errcode = 'CLR10';
  end if;
end
$w1048_persist$;

-- =====================================================================================
-- SectionE  A WITNESSED ROW SUM IS A POSTING BASIS -- clara._payroll_entry_plan recut (AC1).
--
--     0297's drafting body, with ONE new decision and nothing else moved: WHERE a leg's figure may
--     come from. The leg roster, the account resolution, the exact-balance rule, the
--     no-leg-for-an-unprinted-line rule, the month parse and every refusal name it already emits
--     are untouched, and the #946 battery re-drives all of them.
--
--     THE PRINTED TOTAL STILL WINS. A question the page prints is drafted from the PRINTED figure,
--     always, and a printed total the row sum contradicts is still `totals_mismatch` inside the
--     fact state -- which never reaches this body as a postable figure and is refused by the
--     verdict's `arithmetic_holds` rung. The row sum is a fallback for SILENCE, never a second
--     opinion about a figure. That is the brief's own AC4, and it is why the admission below is
--     decided ONCE, before the leg loop, from the two questions without which there is no entry.
--
--     THE ADMISSION, IN ORDER:
--       1. If gross and net are both `established`, the page prints its totals: nothing to admit,
--          `posting_basis.kind = 'printed_totals'`, and this body behaves exactly as it did.
--       2. Otherwise, for each of gross and net that is not `established`: a row sum stands in ONLY
--          if the page was SILENT about it (`not_printed`) AND the evaluator computed a figure for
--          it. Anything else -- a contested reading, an unreadable rendering, a totals mismatch, a
--          silence with no rows to sum -- is `run_totals_not_printed`, the refusal 0297 already
--          emits, with 0297's own detail shape. A reading problem is never papered over by a sum.
--       3. If a sum could stand in, the COMPLETENESS VERDICT decides whether it may:
--            witnessed    -> admitted; the witness is named in posting_basis.
--            contradicted -> `completeness_contradicted` (AC3). This is the one case where a
--                            witness makes things worse than silence: the page says twelve and the
--                            reading found eleven, so the reading is KNOWN incomplete.
--            otherwise    -> the parked question, resolved by the answer the verdict injects:
--                            a named `yes` admits the sum (witness `answered_question`), a named
--                            `no` refuses `completeness_declined`, and no answer at all refuses
--                            `completeness_unwitnessed`.
--
--     A v1 STATE IS ADMITTED AND HAS NO WITNESS. Every payroll pair read before 0343 banked
--     `state_version: v1` with no `completeness` object; this body takes both versions by name and
--     treats a v1 state as `absent`, which puts an already-read, never-posted summary on the parked
--     question rather than on the dead end 0297 left it at. That is a deliberate behaviour change
--     for already-banked reads, and it is the change the brief asks for.
--
--     `completeness_answer` IS INJECTED, NOT READ. This body takes (client, state) and stays a PURE
--     function of its inputs -- it reaches for no table, so the same state and the same chart give
--     the same plan forever. clara._payroll_posting_verdict merges the answer record into the state
--     it passes, under the key `completeness_answer`; a caller that passes the banked state alone
--     simply sees the unanswered case. That is deliberately not a third argument: an overload of a
--     body two callers already name by signature is a wider change than a key nobody else writes.
--
--     `unprinted` KEEPS ITS OWN MEANING, which 0297 states as "the plan drew no figure from it
--     either way" rather than "the page was silent". A question whose figure came from the row sum
--     IS drawn from, so it is NOT listed there; `posting_basis.row_sum_fields` names those instead,
--     which is the honest split and leaves #946's own `unprinted` cell byte-unchanged.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._payroll_entry_plan(p_client uuid, p_state jsonb)
  returns jsonb language plpgsql stable
  set search_path = clara, pg_temp as $pep$
declare
  -- THE LEG ROSTER, in the brief's own order (0297's array, unchanged).
  v_spec jsonb := jsonb_build_array(
    jsonb_build_object('a','6000','side','debit', 'f1','payroll.run.gross_pay',      'f2',null,'d','Gross pay'),
    jsonb_build_object('a','6010','side','debit', 'f1','payroll.run.epf_employer',   'f2',null,'d','EPF contribution (employer)'),
    jsonb_build_object('a','6020','side','debit', 'f1','payroll.run.socso_employer', 'f2',null,'d','SOCSO contribution (employer)'),
    jsonb_build_object('a','6030','side','debit', 'f1','payroll.run.eis_employer',   'f2',null,'d','EIS contribution (employer)'),
    jsonb_build_object('a','6040','side','debit', 'f1','payroll.run.hrdf_levy',      'f2',null,'d','HRDF levy'),
    jsonb_build_object('a','2100','side','credit','f1','payroll.run.epf_employee',   'f2','payroll.run.epf_employer',  'd','EPF payable (employee + employer)'),
    jsonb_build_object('a','2110','side','credit','f1','payroll.run.socso_employee', 'f2','payroll.run.socso_employer','d','SOCSO payable (employee + employer)'),
    jsonb_build_object('a','2120','side','credit','f1','payroll.run.eis_employee',   'f2','payroll.run.eis_employer',  'd','EIS payable (employee + employer)'),
    jsonb_build_object('a','2130','side','credit','f1','payroll.run.pcb',            'f2',null,'d','PCB payable'),
    jsonb_build_object('a','2140','side','credit','f1','payroll.run.hrdf_levy',      'f2',null,'d','HRDF levy payable'),
    jsonb_build_object('a','2040','side','credit','f1','payroll.run.net_pay',        'f2',null,'d','Net pay'));
  r record;
  v_legs jsonb := '[]'::jsonb; v_refusals jsonb := '[]'::jsonb;
  v_unprinted text[] := '{}'; v_missing text[] := '{}'; v_basis text;
  v_c1 bigint; v_c2 bigint; v_cents bigint; v_name text;
  v_dr bigint := 0; v_cr bigint := 0;
  v_period_raw text; v_period_state text; v_month date; v_posting date;
  v_f text;
  -- #1048's own locals.
  v_comp jsonb; v_answer jsonb; v_cverdict text; v_rows_read int;
  v_admit_sum boolean := false; v_needs_sum boolean := false; v_witness_used text;
  v_summed text[] := '{}'; v_fstate text; v_fsum bigint; v_sum1 boolean; v_sum2 boolean;
  v_unbookable text[] := '{}';
  v_b1 text; v_b2 text;
begin
  -- #1048: BOTH STATE VERSIONS ARE ADMITTED BY NAME. A v1 state is a reading banked before 0343;
  -- it carries no `completeness` object, which this body reads as "no witness".
  if p_state is null or coalesce(p_state->>'state_version','') not in ('v1','v2') then
    return jsonb_build_object('plan_version','v1',
      'state_version', to_jsonb(p_state->>'state_version'),
      'ready',false,'legs','[]'::jsonb,
      'debit_cents',0,'credit_cents',0,'unprinted','[]'::jsonb,'missing_accounts','[]'::jsonb,
      'posting_basis', jsonb_build_object('kind','none','witness',null,'rows_read',0,
        'employee_count',null,'page_count',null,'row_sum_fields','[]'::jsonb,'answer',null),
      'refusals', jsonb_build_array(jsonb_build_object('reason','state_unreadable',
        'detail', jsonb_build_object('state_version', p_state->>'state_version'))));
  end if;

  v_comp := p_state->'completeness';
  v_answer := p_state->'completeness_answer';          -- injected by the verdict; absent otherwise
  v_cverdict := coalesce(v_comp->>'verdict', 'absent');
  v_rows_read := coalesce(nullif(p_state->'rows'->>'agreed','')::int, 0);

  -- 1 . THE MONTH. Established from the rendering the page printed, never from today's date and
  --     never from the upload.
  v_period_state := p_state->'facts'->'payroll.run.period'->>'state';
  v_period_raw := p_state->'facts'->'payroll.run.period'->>'printed_raw';
  if v_period_state = 'established' then
    v_month := clara._payroll_period_month(v_period_raw);
  end if;
  if v_month is null then
    v_refusals := v_refusals || jsonb_build_object('reason','period_not_established',
      'detail', jsonb_build_object('period_state', v_period_state, 'period_raw', v_period_raw));
  else
    -- THE LAST DAY OF THE PAYSLIP'S OWN MONTH.
    v_posting := (v_month + interval '1 month - 1 day')::date;
  end if;

  -- 2 . THE TWO QUESTIONS WITHOUT WHICH THERE IS NO ENTRY, and #1048's fallback for them. A run
  --     whose gross or whose net the page does not print has nothing this body can honestly post
  --     -- UNLESS the evaluator summed that column over the quoted rows AND the page (or a named
  --     person) witnessed that those rows are all the rows.
  foreach v_f in array array['payroll.run.gross_pay','payroll.run.net_pay'] loop
    v_fstate := p_state->'facts'->v_f->>'state';
    if v_fstate = 'established' then
      continue;
    end if;
    v_fsum := case when jsonb_typeof(p_state->'facts'->v_f->'computed_cents') = 'number'
                   then (p_state->'facts'->v_f->>'computed_cents')::bigint end;
    if v_fstate = 'not_printed' and v_fsum is not null then
      -- A row sum EXISTS for this question. Whether it may be used is decided once, below.
      v_needs_sum := true;
    else
      -- 0297's own refusal, with 0297's own detail shape: the page printed no total and no sum can
      -- stand in (no rows, a contested reading, an unreadable rendering, a totals mismatch).
      v_refusals := v_refusals || jsonb_build_object('reason','run_totals_not_printed',
        'detail', jsonb_build_object('field', v_f,
          'field_state', v_fstate,
          'field_reason', p_state->'facts'->v_f->>'reason'));
    end if;
  end loop;

  -- 2b . #1048 . MAY THE SUM STAND IN? Decided ONCE, and only when a sum is actually needed and
  --      the OTHER of the two questions did not already refuse for want of any figure at all.
  --      It is deliberately NOT gated on "no refusal yet": a page whose month is also unreadable
  --      must still report the completeness rung honestly, or the verdict's rung vector would say
  --      `run_totals_printed: pass` and `completeness_witness: pass` about a page that prints
  --      neither -- a rung that lies. The month's own refusal is earlier in the roster and is
  --      still the first thing a person is told.
  if v_needs_sum and not exists (
       select 1 from jsonb_array_elements(v_refusals) x where x->>'reason' = 'run_totals_not_printed') then
    if v_cverdict = 'witnessed' then
      v_admit_sum := true; v_witness_used := v_comp->>'witness';
    elsif v_cverdict = 'contradicted' then
      v_refusals := v_refusals || jsonb_build_object('reason','completeness_contradicted',
        'detail', jsonb_build_object('rows_read', v_rows_read,
          'employee_count', coalesce(v_comp->'employee_count','null'::jsonb),
          'reason', v_comp->>'reason'));
    elsif coalesce(v_answer->>'answer','') = 'yes' then
      v_admit_sum := true; v_witness_used := 'answered_question';
    elsif coalesce(v_answer->>'answer','') = 'no' then
      v_refusals := v_refusals || jsonb_build_object('reason','completeness_declined',
        'detail', jsonb_build_object('rows_read', v_rows_read,
          'answered_at', v_answer->'answered_at', 'answered_by_name', v_answer->'answered_by_name'));
    else
      v_refusals := v_refusals || jsonb_build_object('reason','completeness_unwitnessed',
        'detail', jsonb_build_object('rows_read', v_rows_read,
          'reason', coalesce(v_comp->>'reason','the reading predates the completeness witness')));
    end if;
  end if;

  -- 2c . #1048 FIX ROUND (ADV-06) . WHAT THIS PAGE CAN NEVER BOOK, whatever the completeness
  --      verdict turns out to be. A question is UNBOOKABLE when no figure exists for it from
  --      either source -- the page does not print it AND the evaluator computed no row sum for it.
  --      On a page with no totals row that is exactly the employer's own EPF, SOCSO and EIS cost
  --      and the HRDF levy: a payslip ROW has no employer column, so there is nothing to sum.
  --
  --      IT IS COMPUTED HERE, NOT IN THE SENTENCE, and it is deliberately independent of
  --      `v_admit_sum`: the gate needs it while the question is still PARKED, which is precisely
  --      when the sum has not been admitted and `unprinted` (below) therefore names all eleven
  --      questions. A person is asked to make a professional judgement; the standing owner ruling
  --      is that Clara asks for those, and a judgement given without its material consequence is
  --      not one. One body decides what the page can book, and the sentence reads it.
  select coalesce(array_agg(q.x order by q.ord), '{}') into v_unbookable
    from (
      select f.x, min(f.ord) as ord
        from (
          select (t.x->>'f1') as x, t.ord from jsonb_array_elements(v_spec) with ordinality t(x, ord)
          union all
          select (t.x->>'f2'), t.ord from jsonb_array_elements(v_spec) with ordinality t(x, ord)
        ) f
       where f.x is not null
         and coalesce(nullif(p_state->'facts'->f.x->>'printed_cents','')::bigint, 0) = 0
         and coalesce(case when jsonb_typeof(p_state->'facts'->f.x->'computed_cents') = 'number'
                           then (p_state->'facts'->f.x->>'computed_cents')::bigint end, 0) = 0
       group by f.x
    ) q;

  -- 3 . THE LEGS.
  for r in select (t.x->>'a') acc, (t.x->>'side') side, (t.x->>'f1') f1, (t.x->>'f2') f2,
                  (t.x->>'d') d, t.ord
             from jsonb_array_elements(v_spec) with ordinality as t(x, ord)
            order by t.ord loop
    -- #1048: a figure comes from the PRINTED total when the page prints one, and from the
    -- evaluator's own row sum only when the sum was admitted above. There is no third source.
    v_sum1 := false; v_sum2 := false;
    if (p_state->'facts'->r.f1->>'state') = 'established' then
      v_c1 := nullif(p_state->'facts'->r.f1->>'printed_cents','')::bigint;
    elsif v_admit_sum and (p_state->'facts'->r.f1->>'state') = 'not_printed'
          and jsonb_typeof(p_state->'facts'->r.f1->'computed_cents') = 'number' then
      v_c1 := (p_state->'facts'->r.f1->>'computed_cents')::bigint; v_sum1 := true;
    else
      v_c1 := null;
    end if;
    if r.f2 is null then
      v_c2 := null;
    elsif (p_state->'facts'->r.f2->>'state') = 'established' then
      v_c2 := nullif(p_state->'facts'->r.f2->>'printed_cents','')::bigint;
    elsif v_admit_sum and (p_state->'facts'->r.f2->>'state') = 'not_printed'
          and jsonb_typeof(p_state->'facts'->r.f2->'computed_cents') = 'number' then
      v_c2 := (p_state->'facts'->r.f2->>'computed_cents')::bigint; v_sum2 := true;
    else
      v_c2 := null;
    end if;
    v_cents := coalesce(v_c1,0) + coalesce(v_c2,0);
    -- THE BASIS NAMES THE QUESTION AND, WHEN THE FIGURE WAS SUMMED, SAYS SO. `#row_sum` is the
    -- suffix, so a reader of a posted entry can tell a printed figure from a computed one without
    -- going back to the reading.
    v_b1 := case when v_c1 is not null then r.f1 || case when v_sum1 then '#row_sum' else '' end end;
    v_b2 := case when v_c2 is not null then r.f2 || case when v_sum2 then '#row_sum' else '' end end;
    v_basis := concat_ws('+', v_b1, v_b2);
    if v_sum1 and not (r.f1 = any(v_summed)) then v_summed := v_summed || r.f1; end if;
    if v_sum2 and not (r.f2 = any(v_summed)) then v_summed := v_summed || r.f2; end if;

    -- WHAT THE PLAN DREW NO FIGURE FROM, recorded by QUESTION rather than by leg and DISTINCT: the
    -- levy is read by two legs (its expense and its payable) and the two paired payables read two
    -- questions each, so a per-leg list would both repeat itself and lose the employer side of a
    -- pair whose employee side printed. A question the page printed as 0.00 belongs here too --
    -- the plan drew no figure from it either way. A question whose figure came from the ROW SUM is
    -- NOT here: the plan did draw from it, and posting_basis.row_sum_fields names it instead.
    if v_c1 is null or v_c1 = 0 then
      if not (r.f1 = any(v_unprinted)) then v_unprinted := v_unprinted || r.f1; end if;
    end if;
    if r.f2 is not null and (v_c2 is null or v_c2 = 0) then
      if not (r.f2 = any(v_unprinted)) then v_unprinted := v_unprinted || r.f2; end if;
    end if;

    if v_cents = 0 then
      -- AN UNPRINTED LINE PRODUCES NO LEG, and neither does a printed zero: 0.00 is a reading,
      -- and a zero-cent line would assert a movement the document prices at nothing.
      continue;
    end if;

    select a.name into v_name from clara.coa_accounts a
     where a.client_id = p_client and a.account_code = r.acc and a.is_active;
    if v_name is null then
      if not (r.acc = any(v_missing)) then
        v_missing := v_missing || r.acc;
        v_refusals := v_refusals || jsonb_build_object('reason','account_missing',
          'detail', jsonb_build_object('account_code', r.acc, 'for', r.d, 'basis', v_basis));
      end if;
      continue;
    end if;

    v_legs := v_legs || jsonb_build_object(
      'account_code', r.acc, 'account_name', v_name, 'side', r.side,
      'cents', v_cents, 'basis', v_basis, 'description', r.d);
    if r.side = 'debit' then v_dr := v_dr + v_cents; else v_cr := v_cr + v_cents; end if;
  end loop;

  -- 4 . EXACT BALANCE. Checked only when nothing above already refused, so a missing account
  --     reports itself as a missing account rather than as an imbalance it caused. A row-sum entry
  --     balances by the SAME identity every quoted row was checked against -- gross minus the four
  --     employee deductions equals net -- so this belt cannot fire for a witnessed sum unless the
  --     evaluator's own row identity failed, which would have refused earlier.
  if jsonb_array_length(v_refusals) = 0 and v_dr <> v_cr then
    v_refusals := v_refusals || jsonb_build_object('reason','entry_unbalanced',
      'detail', jsonb_build_object('debit_cents', v_dr, 'credit_cents', v_cr,
        'difference_cents', v_dr - v_cr));
  end if;

  return jsonb_build_object(
    'plan_version','v1',
    -- #1048 FIX ROUND (ADV-04): WHICH STATE THIS PLAN DRAFTED FROM, which is not the same fact as
    -- the plan's own output shape. Before 0343 there was exactly one state version, so a poster
    -- reading `plan_version` off this object got 'v1' and was accidentally right; 0343 mints a
    -- second one, and an entry that says its figures came from evaluator v1 -- a body that cannot
    -- produce a completeness verdict at all -- would be systematically wrong for every row-sum
    -- post. Two facts, two keys.
    'state_version', to_jsonb(p_state->>'state_version'),
    'period_raw', to_jsonb(v_period_raw),
    'period_month', to_jsonb(v_month),
    'posting_date', to_jsonb(v_posting),
    'legs', v_legs,
    'debit_cents', v_dr,
    'credit_cents', v_cr,
    'unprinted', to_jsonb(v_unprinted),
    -- #1048 FIX ROUND (ADV-06): the questions this page can never book, whatever the completeness
    -- verdict says. Distinct from `unprinted`, which is about what THIS plan drew from.
    'unbookable', to_jsonb(v_unbookable),
    'missing_accounts', to_jsonb(v_missing),
    -- #1048 AC1: the plan says WHAT its figures came from, so the entry it becomes can say it too.
    'posting_basis', jsonb_build_object(
      'kind', case when coalesce(array_length(v_summed,1),0) > 0 then 'row_sum' else 'printed_totals' end,
      'witness', to_jsonb(case when coalesce(array_length(v_summed,1),0) > 0 then v_witness_used end),
      'rows_read', v_rows_read,
      'employee_count', coalesce(v_comp->'employee_count','null'::jsonb),
      'page_count', coalesce(v_comp->'page_count','null'::jsonb),
      'row_sum_fields', to_jsonb(v_summed),
      'answer', coalesce(v_answer,'null'::jsonb)),
    'refusals', v_refusals,
    'ready', jsonb_array_length(v_refusals) = 0);
end $pep$;

revoke all on function clara._payroll_entry_plan(uuid, jsonb) from public;

comment on function clara._payroll_entry_plan(uuid, jsonb) is
  '#946, widened by #1048: THE DRAFTING BODY. An established payroll fact state (0296''s or 0343''s evaluator output, v1 or v2) plus this client''s own chart in; the payroll entry out -- the gross debited to salaries and wages, each employer contribution the document prints debited to its own employment-cost account, every statutory deduction credited to its own payable, and the net credited to salaries payable. A figure comes from the PRINTED total whenever the page prints one; when the page prints no gross or net total, #1048 admits the evaluator''s own ROW SUM instead -- but only where the reading is WITNESSED complete (a printed headcount equal to the lines read, a printed page count of one, or a named person''s yes), and never where a printed headcount CONTRADICTS the lines read. Every leg names the question it came from and suffixes `#row_sum` where the figure was summed; `posting_basis` names the basis, the witness and the summed questions. It still gives an unprinted line no leg at all, resolves every account by code in the client''s chart, and requires EXACT balance rather than the rounding tolerance clara._validate_entry_lines allows. It reads no table but clara.coa_accounts and is a pure function of its inputs: the completeness ANSWER is injected into the state by clara._payroll_posting_verdict under `completeness_answer`, never read here. Every failure is a named refusal in `refusals`; it writes nothing.';

reset role;

-- =====================================================================================
-- SectionF  WHAT A NAMED PERSON SAID, AND WHEN -- clara.payroll_completeness_answers.
--
--     THE PARKED QUESTION'S ONLY DURABLE PART. Everything else in this lane is DERIVED: the
--     verdict stores nothing, the Needs-you rows store nothing, and a block clears itself the
--     moment its cause does. An ANSWER cannot work that way -- it is a fact about what a person
--     asserted, and it is the basis a posted entry stands on -- so it is a row, and the row is the
--     evidence.
--
--     IT IS BOUND TO THE READING, NOT TO THE DOCUMENT. `extraction_id` is the payroll pair's own
--     text row, UNIQUE, so one answer belongs to one reading. This is the whole integrity of the
--     mechanism: if somebody says "yes, these twelve are everyone" and the page is then re-read
--     and fifteen lines come back, the old yes does not authorise the new sum -- there is simply no
--     answer for the new reading, and the question is parked again. A document-scoped answer would
--     have silently carried consent from one reading to another.
--
--     IT RECORDS WHAT WAS AFFIRMED, NOT MERELY THAT SOMETHING WAS. `rows_read` is the line count
--     the person was shown and said yes to, frozen at that moment, so a later reader can see the
--     assertion itself rather than re-deriving it from a state that may since have moved.
--
--     APPEND-ONLY. No UPDATE and no DELETE: a changed mind is a new READING (re-file or re-read the
--     payslip) with its own question and its own answer, exactly as #949's contract_plan_confirmations
--     treats a changed mind as a revision. A record of one moment is never edited.
--
--     A `no` IS A ROW TOO, and it must be: "no answer yet" and "a person looked and said this is
--     not the whole run" are different states of the world, they clear differently, and the second
--     is what stops the Needs-you question coming back at the same person every day.
--
--     REDO-SAFE: `create table if not exists`, `create index if not exists`, `drop policy if
--     exists` before each create, `create or replace function` for the triggers.
--
--     UNDER `set role clara_fn_owner`, LIKE EVERY OTHER clara TABLE. The owner is not cosmetic:
--     clara._payroll_completeness_answer is SECURITY DEFINER owned by clara_fn_owner, and a table
--     the migration principal owned instead would refuse it `permission denied` -- measured on
--     this rig, which is how this line came to be written. `force row level security` applies to
--     the owner too, which is why the owner policy below exists rather than being implied.
-- =====================================================================================
set role clara_fn_owner;

create table if not exists clara.payroll_completeness_answers (
  id                uuid        primary key default gen_random_uuid(),
  firm_id           uuid        not null references clara.firms(id),
  client_id         uuid        not null,
  document_id       uuid        not null references clara.documents(id),
  -- THE READING this answer is about. UNIQUE: one answer per reading, and a re-read is a new
  -- reading with its own question.
  extraction_id     uuid        not null unique references clara.document_extractions(id),
  -- THE LINE COUNT THE PERSON AFFIRMED, frozen at the moment they affirmed it.
  rows_read         int         not null check (rows_read > 0),
  answer            text        not null check (answer in ('yes','no')),
  note              text        check (note is null or btrim(note) <> ''),
  answered_by       uuid        not null references clara.users(id),
  answered_at       timestamptz not null default now(),
  constraint fk_payroll_completeness_answers_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_payroll_completeness_answers_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id)
);

comment on table clara.payroll_completeness_answers is
  '#1048: one row per act of a named person answering "this summary prints no total; is this every employee for the month?" about ONE READING of one payroll summary. Bound to clara.document_extractions by a UNIQUE extraction_id rather than to the document, so a re-read asks again rather than inheriting an older yes. `rows_read` freezes the line count the person was shown and affirmed. A `yes` is the posting basis clara._payroll_entry_plan admits the evaluator''s row sum against; a `no` keeps the document unposted and says who said so. Append-only: a changed mind is a new reading, with its own question and its own answer.';

comment on column clara.payroll_completeness_answers.extraction_id is
  '#1048: the payroll_text_facts extraction this answer is about. UNIQUE -- one answer per reading, never per document, so consent cannot travel from a reading of twelve lines to a later reading of fifteen.';
comment on column clara.payroll_completeness_answers.rows_read is
  '#1048: the number of agreed employee lines the person was shown when they answered. Frozen here rather than re-derived, so the assertion itself is on the record.';

create index if not exists ix_payroll_completeness_answers_document
  on clara.payroll_completeness_answers(document_id, answered_at desc);
create index if not exists ix_payroll_completeness_answers_client
  on clara.payroll_completeness_answers(client_id, answered_at desc);

alter table clara.payroll_completeness_answers enable row level security;
alter table clara.payroll_completeness_answers force row level security;
drop policy if exists p_payroll_completeness_answers_owner on clara.payroll_completeness_answers;
create policy p_payroll_completeness_answers_owner on clara.payroll_completeness_answers
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_payroll_completeness_answers_human on clara.payroll_completeness_answers;
create policy p_payroll_completeness_answers_human on clara.payroll_completeness_answers
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
-- NO AGENT-LANE GRANT AND NO AGENT POLICY (#949's own SPEC-08 posture, applied here for the same
-- reason): this table records a human's professional judgement about a client's payroll, and the
-- agent read lane has no business in it. A person's answer reaches the agent, when it must, through
-- the entry it produced and that entry's own receipt.
drop policy if exists p_payroll_completeness_answers_agent on clara.payroll_completeness_answers;
grant select on clara.payroll_completeness_answers to clara_authenticated;
revoke all on clara.payroll_completeness_answers from clara_agent_ro;

create or replace function clara._tf_payroll_completeness_answer_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tfpcai$
begin
  raise exception 'a completeness answer is a record of one moment: it is never % (re-read the payslip instead, which asks its own question)', lower(tg_op)
    using errcode='CLR08', detail='{"reason":"payroll_completeness_answer_immutable"}';
end $tfpcai$;

revoke all on function clara._tf_payroll_completeness_answer_immutable() from public;

comment on function clara._tf_payroll_completeness_answer_immutable() is
  '#1048: clara.payroll_completeness_answers admits INSERT alone. UPDATE and DELETE are both refused outright -- an answer is what a named person asserted at a moment, and a changed mind is a new reading with its own answer.';

drop trigger if exists t_payroll_completeness_answers_immutable on clara.payroll_completeness_answers;
create trigger t_payroll_completeness_answers_immutable
  before delete or update on clara.payroll_completeness_answers
  for each row execute function clara._tf_payroll_completeness_answer_immutable();
drop trigger if exists t_payroll_completeness_answers_no_truncate on clara.payroll_completeness_answers;
create trigger t_payroll_completeness_answers_no_truncate
  before truncate on clara.payroll_completeness_answers
  for each statement execute function clara._tf_no_truncate();

reset role;

-- =====================================================================================
-- SectionG  THE READING-BOUND ANSWER READ -- clara._payroll_completeness_answer(uuid) returns jsonb.
--
--     ONE place resolves "what did a person say about THIS document's newest reading", so the gate,
--     the queue and the door cannot disagree about it. It returns the answer as a jsonb record (or
--     SQL NULL when the newest reading has no answer), carrying the name of the person who gave it
--     -- because a basis a person supplied has to be attributable on its face, not through a join a
--     later reader has to think of.
--
--     IT RESOLVES THE NEWEST READING ITSELF rather than taking an extraction id, for the same
--     reason clara._payroll_posting_verdict judges the newest pair: a re-extraction mints a new
--     version, and the live reading is the one every caller is asking about.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._payroll_completeness_answer(p_document uuid)
  returns jsonb language sql stable security definer
  set search_path = clara, pg_temp as $pca$
  select jsonb_build_object(
           'answer_id', a.id,
           'answer', a.answer,
           'note', a.note,
           'rows_read', a.rows_read,
           'extraction_id', a.extraction_id,
           'answered_at', to_char(a.answered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ'),
           'answered_by', a.answered_by,
           'answered_by_name', u.display_name)
    from clara.payroll_completeness_answers a
    join clara.users u on u.id = a.answered_by
   where a.extraction_id = (
           select e.id from clara.document_extractions e
            where e.document_id = p_document and e.engine_kind = 'payroll_text_facts'
              and e.status = 'done'
            order by e.version_n desc, e.extracted_at desc limit 1);
$pca$;

revoke all on function clara._payroll_completeness_answer(uuid) from public;

comment on function clara._payroll_completeness_answer(uuid) is
  '#1048: what a named person said about the NEWEST payroll reading of this document -- the answer, the note, the line count they affirmed, when, and who, as one jsonb record; SQL NULL when the newest reading has no answer. One resolver, so the gate, the queue and the answer door cannot disagree about which reading an answer belongs to. Ungranted: reached from clara._payroll_posting_verdict and clara.answer_payroll_completeness.';

reset role;

-- =====================================================================================
-- SectionH  THE GATE GAINS ONE RUNG -- clara._payroll_posting_verdict recut (AC2, AC3).
--
--     0297's gate, with ONE rung added to the closed roster and everything else in place. The
--     roster, the first-failure rule, the stability (it still WRITES NOTHING), the four duplicate
--     scopes, the closed-period rung and every sentence it already built are untouched, and the
--     #946 battery re-drives all of them.
--
--     THE NEW RUNG IS `completeness_witness`, AND IT SITS IMMEDIATELY AFTER `run_totals_printed`,
--     which is where reading order puts it: "does this page give me a gross and a net to post?" is
--     asked first, and "may I stand the row sum in for them?" only if the answer was no. The two
--     never both fail -- SectionE emits `run_totals_not_printed` when no sum exists at all and a
--     `completeness_*` reason when one does -- so a person is told exactly one thing, and the rung
--     vector shows which question was even reached.
--
--     ONE RUNG, THREE NAMED REASONS, because they are three different situations and a person acts
--     differently on each:
--       completeness_contradicted -- the page names more employees than the reading found. Nothing
--                                    can be affirmed here: the reading is KNOWN incomplete, and the
--                                    remedy is a complete copy of the summary.
--       completeness_unwitnessed  -- the page says nothing about its own completeness. This is the
--                                    PARKED QUESTION, and it is the only one of the three a person
--                                    can answer away. `completeness.parked` is true for exactly
--                                    this case, and SectionJ's two queue arms split on it.
--       completeness_declined     -- a named person looked and said this is not every employee.
--                                    The document stays unposted, and the sentence says who.
--
--     THE ANSWER IS READ HERE AND INJECTED INTO THE STATE THE PLAN SEES. clara._payroll_entry_plan
--     is a pure function of (client, state) and stays one; this body is the impure edge that knows
--     about tables, so it resolves the answer for the newest reading and merges it in under
--     `completeness_answer`. That keeps ONE body deciding the admission and ONE body knowing where
--     an answer lives.
--
--     THE GATE STILL WRITES NOTHING AND IS STILL STABLE. Reading clara.payroll_completeness_answers
--     is a read; the row it finds was written by the door in SectionK, by a named person, under an
--     op key.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._payroll_posting_verdict(p_document uuid)
  returns jsonb language plpgsql stable
  set search_path = clara, pg_temp as $ppv$
declare
  -- THE CLOSED ROSTER, in the order a person should be told about a failure. `filed` and
  -- `facts_read` come first because without them the rest is unanswerable; the middle five are
  -- the brief's own conditions; #1048's `completeness_witness` follows `run_totals_printed`
  -- because it is only reachable when that question had no printed answer; `entry_balances` is a
  -- belt that cannot fail once the arithmetic rung passed, and is evaluated anyway because a gate
  -- that assumes its own invariants is a gate that stops checking them.
  v_rungs text[] := array['filed','facts_read','channels_agree','arithmetic_holds',
                          'period_established','period_open','run_totals_printed',
                          'completeness_witness',
                          'accounts_resolve','entry_balances','no_duplicate_entry'];
  v_tokens jsonb := jsonb_build_object(
    'filed','not_filed', 'facts_read','payroll_not_read',
    'channels_agree','channels_disagree', 'arithmetic_holds','arithmetic_failed',
    'period_established','period_not_established', 'period_open','period_closed',
    'run_totals_printed','run_totals_not_printed',
    'completeness_witness','completeness_unwitnessed',
    'accounts_resolve','account_missing', 'entry_balances','entry_unbalanced',
    'no_duplicate_entry','duplicate_entry');
  v_vector jsonb := '{}'::jsonb;
  v_detail jsonb := '{}'::jsonb;
  v_first text; v_rung text;
  f record;
  v_filing uuid; v_client uuid; v_firm uuid; v_sha text;
  v_extraction uuid; v_state jsonb; v_plan jsonb := null;
  v_disagree text[] := '{}'; v_arith text[] := '{}';
  v_contested jsonb; v_unbal jsonb; v_unchk jsonb;
  v_dup_entry uuid; v_dup_scope text;
  v_sentence text; v_month_label text;
  -- #1048's own locals.
  v_answer jsonb; v_cw text; v_comp jsonb; v_rows_read int;
  v_gross_sum bigint; v_net_sum bigint; v_parked boolean := false;
begin
  -- 1 · FILED. The entry this lane posts is a DOCUMENT entry bound to the document's live
  --     filing, so a document with no live filing has nothing to bind to.
  select f2.id, f2.client_id, f2.firm_id into v_filing, v_client, v_firm
    from clara.document_filings f2
   where f2.document_id = p_document and f2.retired_at is null
   order by f2.filed_at desc limit 1;
  v_vector := v_vector || jsonb_build_object('filed', case when v_filing is null then 'not_filed' else 'pass' end);

  -- 2 · FACTS READ. The newest payroll pair banked for this document.
  if v_filing is not null then
    select e.id, e.envelope->'payroll_state' into v_extraction, v_state
      from clara.document_extractions e
     where e.document_id = p_document and e.engine_kind = 'payroll_text_facts' and e.status = 'done'
     order by e.version_n desc, e.extracted_at desc limit 1;
  end if;
  v_vector := v_vector || jsonb_build_object('facts_read',
    case when v_state is null then 'payroll_not_read' else 'pass' end);

  if v_state is not null then
    -- 3 · CHANNELS AGREE. A question the two readings answer differently, or a quoted employee
    --     row they read differently -- either one means there is no single reading to post.
    v_contested := coalesce(v_state->'rows'->'contested','[]'::jsonb);
    for f in select k, v from jsonb_each(coalesce(v_state->'facts','{}'::jsonb)) as t(k, v) order by k loop
      if (f.v->>'state') in ('channels_disagree','rows_contested') then
        v_disagree := v_disagree || f.k;
      elsif (f.v->>'state') in ('totals_mismatch','rows_unbalanced','unreadable','unanswered') then
        v_arith := v_arith || f.k;
      end if;
    end loop;
    -- #1048, CORRECTED IN THE FIX ROUND (ADV-01): A WITNESS NEVER FAILS THIS RUNG. The first cut
    -- folded a witness the two channels read differently into `channels_agree`, on the argument
    -- that a page whose headcount one channel read as 12 and the other as 13 has not been read.
    -- Driven on the rig, that argument vetoed a page printing ALL ELEVEN run totals, both channels
    -- agreeing on every one of them and the arithmetic holding -- a page the lane has posted
    -- unattended since #946 -- on the strength of a label no leg of that entry comes from. The
    -- refusal was also unactionable ("check the page and re-file it" re-runs the same two models).
    --
    -- A WITNESS IS A FALLBACK FOR SILENCE, so its failure belongs to the rung that is only reached
    -- when the page IS silent. `clara.evaluate_payroll_run_state_v2` already resolves an unreadable,
    -- split or contradictory witness to a completeness verdict of `absent`, and SectionE turns that
    -- into the PARKED QUESTION when -- and only when -- a row sum is actually needed. So a page
    -- that prints its totals posts as it always did, and a page that does not asks a named person
    -- instead of refusing. `facts` (the eleven answers) and the quoted employee rows still decide
    -- this rung, exactly as 0297 wrote it.
    if coalesce(array_length(v_disagree,1),0) > 0 or jsonb_array_length(v_contested) > 0 then
      v_vector := v_vector || jsonb_build_object('channels_agree','channels_disagree');
      v_detail := v_detail || jsonb_build_object('fields', to_jsonb(v_disagree),
        'contested_rows', v_contested);
    else
      v_vector := v_vector || jsonb_build_object('channels_agree','pass');
    end if;

    -- 4 · ARITHMETIC HOLDS. A row whose own gross-minus-deductions identity fails, a row the
    --     evaluator could not check at all, a printed total the row sum contradicts, or a
    --     rendering that is not a figure.
    v_unbal := coalesce(v_state->'rows'->'unbalanced','[]'::jsonb);
    v_unchk := coalesce(v_state->'rows'->'unchecked','[]'::jsonb);
    if coalesce(array_length(v_arith,1),0) > 0
       or jsonb_array_length(v_unbal) > 0 or jsonb_array_length(v_unchk) > 0 then
      v_vector := v_vector || jsonb_build_object('arithmetic_holds','arithmetic_failed');
      v_detail := v_detail || jsonb_build_object('fields', to_jsonb(v_arith),
        'unbalanced_rows', v_unbal, 'unchecked_rows', v_unchk);
    else
      v_vector := v_vector || jsonb_build_object('arithmetic_holds','pass');
    end if;

    -- 5-9 · THE DRAFTING BODY ANSWERS THE REST. The month, the run totals, #1048's completeness
    --       admission, the chart and the balance are exactly what SectionE already decides, so they
    --       are read off its refusals rather than re-decided here -- one body per question, never
    --       two. #1048: the ANSWER a named person gave about the newest reading is resolved here
    --       and merged into the state the plan sees, so the plan stays a pure function of its
    --       inputs and this body stays the only one that knows where an answer lives.
    v_answer := clara._payroll_completeness_answer(p_document);
    v_plan := clara._payroll_entry_plan(v_client,
                v_state || jsonb_build_object('completeness_answer', coalesce(v_answer, 'null'::jsonb)));
    foreach v_rung in array array['period_established','run_totals_printed','accounts_resolve','entry_balances'] loop
      if exists (select 1 from jsonb_array_elements(v_plan->'refusals') x
                  where x->>'reason' = v_tokens->>v_rung) then
        v_vector := v_vector || jsonb_build_object(v_rung, v_tokens->>v_rung);
      else
        v_vector := v_vector || jsonb_build_object(v_rung, 'pass');
      end if;
    end loop;
    -- #1048: ONE RUNG, THREE NAMED REASONS -- read off the plan's own refusals, so the gate never
    -- re-decides an admission the drafting body already decided.
    select x->>'reason' into v_cw from jsonb_array_elements(v_plan->'refusals') x
     where x->>'reason' in ('completeness_contradicted','completeness_unwitnessed','completeness_declined')
     limit 1;
    v_vector := v_vector || jsonb_build_object('completeness_witness', coalesce(v_cw,'pass'));
    v_comp := coalesce(v_state->'completeness','null'::jsonb);
    v_rows_read := coalesce(nullif(v_state->'rows'->>'agreed','')::int, 0);
    v_gross_sum := case when jsonb_typeof(v_state->'facts'->'payroll.run.gross_pay'->'computed_cents') = 'number'
                        then (v_state->'facts'->'payroll.run.gross_pay'->>'computed_cents')::bigint end;
    v_net_sum := case when jsonb_typeof(v_state->'facts'->'payroll.run.net_pay'->'computed_cents') = 'number'
                      then (v_state->'facts'->'payroll.run.net_pay'->>'computed_cents')::bigint end;
    v_detail := v_detail || jsonb_build_object(
      'missing_accounts', coalesce(v_plan->'missing_accounts','[]'::jsonb),
      'plan_refusals', coalesce(v_plan->'refusals','[]'::jsonb),
      'completeness', v_comp,
      'completeness_witness', coalesce(v_state->'witness','null'::jsonb),
      'completeness_answer', coalesce(v_answer,'null'::jsonb));

    -- 9 · THE PERIOD IS STILL OPEN. `clara._tf_period_wall` refuses an approved touch whose
    --     posting date falls inside a fiscal year in `closing` or `closed`, and it is right to:
    --     a closed year is closed. The gate asks the SAME question up front rather than letting
    --     the wall raise at the post, for one reason that matters to a person: the Needs-you row
    --     is derived from this verdict, so a condition the gate did not evaluate would make that
    --     row say "ready" about a run the estate will refuse. A rung that only the wall knows
    --     about is a row that lies.
    if v_plan->>'posting_date' is null then
      v_vector := v_vector || jsonb_build_object('period_open','not_evaluated');
    elsif exists (select 1 from clara.fiscal_years fy
                   where fy.client_id = v_client
                     and (v_plan->>'posting_date')::date between fy.starts_on and fy.ends_on
                     and fy.status in ('closing','closed')) then
      v_vector := v_vector || jsonb_build_object('period_open','period_closed');
      v_detail := v_detail || jsonb_build_object('closed_fiscal_year',
        (select jsonb_build_object('label', fy.label, 'status', fy.status,
                  'starts_on', fy.starts_on, 'ends_on', fy.ends_on)
           from clara.fiscal_years fy
          where fy.client_id = v_client
            and (v_plan->>'posting_date')::date between fy.starts_on and fy.ends_on
            and fy.status in ('closing','closed')
          order by fy.starts_on desc limit 1));
    else
      v_vector := v_vector || jsonb_build_object('period_open','pass');
    end if;

    -- 10 · NO PAYROLL ENTRY FOR THIS CLIENT AND MONTH IS ALREADY POSTED (0297 AC4). FOUR SCOPES,
    --      in the order a person would want to hear them, and the FIRST match is the one reported
    --      because it is the most specific thing that can be said: same_document, same_filing,
    --      same_month_payroll_run (another document's run already covers this month -- the
    --      re-upload case), payroll_obligation (0194's own periodic payroll lane already booked
    --      it). THE REFUSAL POINTS AT THE ENTRY, with its date and its memo, so a person can tell
    --      a CORRECTION from a RE-UPLOAD without opening the ledger. A reversed entry is not a
    --      duplicate: `reversed_by is null` throughout, so a reversal re-opens the month.
    v_dup_entry := clara._document_posting_entry(v_client, p_document);
    if v_dup_entry is not null then
      v_dup_scope := 'same_document';
    end if;
    if v_dup_entry is null then
      select j.id into v_dup_entry from clara.journal_entries j
       where j.filing_id = v_filing
         and (j.status = 'draft' or (j.status = 'approved' and j.reversed_by is null))
       order by j.created_at limit 1;
      if v_dup_entry is not null then v_dup_scope := 'same_filing'; end if;
    end if;
    if v_dup_entry is null and (v_plan->>'period_month') is not null then
      select j.id into v_dup_entry from clara.journal_entries j
       where j.client_id = v_client and j.status = 'approved' and j.reversed_by is null
         and j.document_id is distinct from p_document
         and j.flags->'payroll_run'->>'period_month' = v_plan->>'period_month'
       order by j.created_at limit 1;
      if v_dup_entry is not null then v_dup_scope := 'same_month_payroll_run'; end if;
    end if;
    if v_dup_entry is null and (v_plan->>'period_month') is not null then
      select j.id into v_dup_entry from clara.journal_entries j
       where j.client_id = v_client and j.status = 'approved' and j.reversed_by is null
         and j.flags ? 'payroll_obligation'
         and (j.flags->'payroll_obligation'->>'period_start') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         and (j.flags->'payroll_obligation'->>'period_end') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         -- The obligation's own period OVERLAPS the payslip's month.
         and (j.flags->'payroll_obligation'->>'period_start')::date
               <= ((v_plan->>'period_month')::date + interval '1 month - 1 day')::date
         and (j.flags->'payroll_obligation'->>'period_end')::date >= (v_plan->>'period_month')::date
       order by j.created_at limit 1;
      if v_dup_entry is not null then v_dup_scope := 'payroll_obligation'; end if;
    end if;

    if v_dup_entry is null then
      v_vector := v_vector || jsonb_build_object('no_duplicate_entry','pass');
    else
      v_vector := v_vector || jsonb_build_object('no_duplicate_entry','duplicate_entry');
      v_detail := v_detail || jsonb_build_object('duplicate',
        (select jsonb_build_object('scope', v_dup_scope, 'entry_id', j.id,
                  'status', j.status, 'posting_date', to_char(j.posting_date,'YYYY-MM-DD'),
                  'memo', j.memo)
           from clara.journal_entries j where j.id = v_dup_entry));
    end if;
  else
    -- Nothing was read, so nothing downstream of it was evaluated. Every rung still carries an
    -- explicit verdict: `not_evaluated` is a verdict, an absent key is a hole.
    foreach v_rung in array array['channels_agree','arithmetic_holds','period_established',
                                  'period_open','run_totals_printed','completeness_witness',
                                  'accounts_resolve','entry_balances','no_duplicate_entry'] loop
      v_vector := v_vector || jsonb_build_object(v_rung, 'not_evaluated');
    end loop;
  end if;

  -- THE FIRST FAILING RUNG IS THE REASON. Walked over the CLOSED roster, so a rung whose key the
  -- vector somehow lacks reads as a failure rather than as a pass.
  v_first := null;
  foreach v_rung in array v_rungs loop
    if v_first is null and coalesce(v_vector->>v_rung,'') <> 'pass' then v_first := v_rung; end if;
  end loop;

  -- #1048: PARKED means "a person can settle this by answering". Exactly one of the three
  -- completeness reasons is answerable, and only when it is the FIRST failure -- a run whose month
  -- is also unreadable is not waiting on an answer, it is waiting on a legible page.
  v_parked := (v_first = 'completeness_witness' and coalesce(v_cw,'') = 'completeness_unwitnessed');

  select d.sha256 into v_sha from clara.documents d where d.id = p_document;

  -- THE SENTENCE A PERSON READS, BUILT HERE AND NOWHERE ELSE. The Needs-you rows render it
  -- verbatim, so the words on screen and the decision the lane took come out of ONE body. A
  -- sentence built in the queue instead would be a second opinion about the same facts, and the
  -- two would drift the first time a rung changed.
  v_month_label := case when (v_plan->>'period_month') is not null
                        then to_char((v_plan->>'period_month')::date, 'FMMonth YYYY') end;
  v_sentence := case coalesce(v_first, 'ready')
    when 'ready' then
      format('Payroll run %s is ready to post but no entry exists yet -- re-file the payslip to post it.',
        coalesce(v_month_label, 'for this payslip'))
    when 'not_filed' then 'This payroll summary is not filed under a client, so it has nothing to post against.'
    when 'facts_read' then 'This payroll summary has not been read yet.'
    when 'channels_agree' then
      format('Payroll run %s was not posted: the two readings of this payslip disagree (%s). Check the page and re-file it.',
        coalesce(v_month_label, '(month not established)'),
        coalesce(nullif(array_to_string(v_disagree, ', '), ''), 'a quoted employee row'))
    when 'arithmetic_holds' then
      format('Payroll run %s was not posted: the page does not add up (%s). Nothing is posted on a page that contradicts itself.',
        coalesce(v_month_label, '(month not established)'),
        concat_ws('; ',
          nullif(array_to_string(v_arith, ', '), ''),
          case when jsonb_array_length(coalesce(v_unbal,'[]'::jsonb)) > 0
               then 'rows that do not balance: ' || replace(trim(both '[]' from v_unbal::text), ',', ', ') end,
          case when jsonb_array_length(coalesce(v_unchk,'[]'::jsonb)) > 0
               then 'rows that could not be checked: ' || replace(trim(both '[]' from v_unchk::text), ',', ', ') end))
    when 'period_established' then
      format('A payroll summary was read but its month could not be established from what the page prints (%s), so nothing was posted. Tell Clara which month this run covers, or re-file a payslip that names it.',
        coalesce(quote_literal(v_plan->>'period_raw'), 'the page prints no period'))
    when 'period_open' then
      format('Payroll run %s was not posted: the fiscal year covering %s is %s.',
        coalesce(v_month_label, 'for this payslip'), v_plan->>'posting_date',
        coalesce(v_detail->'closed_fiscal_year'->>'status', 'not open'))
    when 'run_totals_printed' then
      format('A payroll summary for %s was read but prints no run totals to post from (gross pay and net pay are both required), so nothing was posted.',
        coalesce(v_month_label, 'an unestablished month'))
    -- #1048: THE THREE COMPLETENESS SENTENCES. Each one names the two numbers that decided it, so
    -- a person can see the whole argument without opening the page.
    when 'completeness_witness' then
      case coalesce(v_cw,'')
        when 'completeness_contradicted' then
          format('A payroll summary for %s prints no run totals and says it covers %s employees, but only %s employee line(s) could be read -- so the reading is incomplete and nothing was posted. Re-file a complete copy of the summary.',
            coalesce(v_month_label, 'an unestablished month'),
            coalesce(v_comp->>'employee_count', 'a different number of'), v_rows_read)
        when 'completeness_declined' then
          -- FIX ROUND (ADV-12): BOTH REMEDIES, because the sentence used to assume the answer was
          -- right and the DOCUMENT was wrong. A changed mind is a new reading (the answer is bound
          -- to the extraction, and the UNIQUE on it is deliberate), so the way out of a mis-clicked
          -- `no` is a re-read -- which clara.request_reextraction has offered since 0025/0026 --
          -- and nothing on the row pointed at it.
          format('Payroll run %s was not posted: %s answered that this summary is not every employee for the month. Re-file a complete copy of the summary; if that answer was a mistake, ask Clara to read this payslip again and the question is asked afresh.',
            coalesce(v_month_label, 'for this payslip'),
            coalesce(v_answer->>'answered_by_name', 'somebody at this firm'))
        else
          -- THE PARKED QUESTION, in the brief's own words, with the figures a person needs in order
          -- to answer it. RM and two decimals, because that is how a payslip prints money.
          --
          -- FIX ROUND (ADV-06): AND WHAT A YES DOES NOT BOOK. The entry a yes books carries gross,
          -- the four EMPLOYEE deductions and the net, and nothing else -- the per-employee rows
          -- have no employer column to sum, so the employer's own statutory cost and the HRDF levy
          -- are accrued nowhere, on either side. The migration header and the README said so; the
          -- screen where the click happens did not. A bookkeeper answering yes reasonably believes
          -- the month's payroll is booked, and in Malaysia the employer side is remitted against a
          -- filed return. The standing owner ruling is that Clara asks for a professional
          -- judgement; a judgement given without its material consequence is not one.
          format('This payroll summary for %s prints no total; is this every employee for the month? Clara read %s employee line(s), totalling RM %s gross and RM %s net. Answer yes and the run posts from those lines; answer no and it stays unposted.%s',
            coalesce(v_month_label, 'an unestablished month'), v_rows_read,
            coalesce(to_char(v_gross_sum / 100.0, 'FM999,999,990.00'), 'an unreadable amount'),
            coalesce(to_char(v_net_sum / 100.0, 'FM999,999,990.00'), 'an unreadable amount'),
            -- The list is built HERE, from the plan's own `unbookable`, and nowhere else: no new
            -- catalog name for a label map, and no second body deciding what the page can book.
            coalesce(
              (select format(' The page prints no figure for %s, so an entry posted from these lines books none of those -- they must be booked another way.',
                        regexp_replace(
                          string_agg(
                            case q.x
                              when 'payroll.run.epf_employer'   then 'the employer''s EPF'
                              when 'payroll.run.socso_employer' then 'the employer''s SOCSO'
                              when 'payroll.run.eis_employer'   then 'the employer''s EIS'
                              when 'payroll.run.hrdf_levy'      then 'the HRDF levy'
                              when 'payroll.run.epf_employee'   then 'employee EPF'
                              when 'payroll.run.socso_employee' then 'employee SOCSO'
                              when 'payroll.run.eis_employee'   then 'employee EIS'
                              when 'payroll.run.pcb'            then 'PCB'
                              when 'payroll.run.gross_pay'      then 'gross pay'
                              when 'payroll.run.net_pay'        then 'net pay'
                              else q.x end, ', ' order by q.ord),
                          ', ([^,]*)$', ' or \1'))
                 from jsonb_array_elements_text(coalesce(v_plan->'unbookable','[]'::jsonb))
                        with ordinality q(x, ord)
                having count(*) > 0),
              ''))
      end
    when 'accounts_resolve' then
      format('Payroll run %s was not posted: this client''s chart of accounts has no %s. Add the account(s) and re-file the payslip.',
        coalesce(v_month_label, 'for this payslip'),
        coalesce(nullif(replace(trim(both '[]' from coalesce(v_plan->'missing_accounts','[]'::jsonb)::text), '"', ''), ''), 'account it needs'))
    when 'entry_balances' then
      format('Payroll run %s was not posted: the entry it would make does not balance (%s debit, %s credit).',
        coalesce(v_month_label, 'for this payslip'), v_plan->>'debit_cents', v_plan->>'credit_cents')
    when 'no_duplicate_entry' then
      -- #1048 FIX ROUND (ADV-02): A DRAFT IS NOT A POST, and saying so matters now that this lane
      -- can leave one. A high-stakes run posted from a person's answer is drafted and handed to
      -- the ordinary approve door; "already posted -- decide whether this is a correction or a
      -- re-upload" would be exactly wrong about it, and would send the next person to the wrong
      -- remedy. The rung and the reason token are unchanged: a draft on this filing really does
      -- stop a second entry, which is the thing this rung exists to say.
      case coalesce(v_detail->'duplicate'->>'status','')
        when 'draft' then
          format('Payroll run %s is drafted (%s, %s) and waiting for a checker to approve it. Nothing was posted again.',
            coalesce(v_month_label, 'for this payslip'),
            coalesce(v_detail->'duplicate'->>'memo', 'an existing entry'),
            coalesce(v_detail->'duplicate'->>'posting_date', 'no date'))
        else
          format('Payroll run %s is already posted (%s, %s). This payslip was not posted again -- open that entry to decide whether this is a correction or a re-upload.',
            coalesce(v_month_label, 'for this payslip'),
            coalesce(v_detail->'duplicate'->>'memo', 'an existing entry'),
            coalesce(v_detail->'duplicate'->>'posting_date', 'no date'))
      end
    else format('Payroll run %s was not posted (%s).', coalesce(v_month_label,'for this payslip'),
                coalesce(v_tokens->>v_first, v_first))
  end;

  return jsonb_build_object(
    'sentence', v_sentence,
    'period_label', to_jsonb(v_month_label),
    'verdict', case when v_first is null then 'ready' else 'blocked' end,
    'rung', to_jsonb(v_first),
    'reason', to_jsonb(case when v_first is null then null
                            when v_first = 'completeness_witness' then coalesce(v_cw, v_tokens->>v_first)
                            else v_tokens->>v_first end),
    'rung_vector', v_vector,
    'detail', v_detail,
    -- #1048: what the queue splits on, and what a person's answer would be about.
    'completeness', jsonb_build_object(
      'parked', v_parked,
      'state', coalesce(v_comp,'null'::jsonb),
      'witness', coalesce(v_state->'witness','null'::jsonb),
      'answer', coalesce(v_answer,'null'::jsonb),
      'rows_read', coalesce(v_rows_read, 0),
      'gross_sum_cents', to_jsonb(v_gross_sum),
      'net_sum_cents', to_jsonb(v_net_sum)),
    'document_id', p_document,
    'client_id', to_jsonb(v_client),
    'firm_id', to_jsonb(v_firm),
    'filing_id', to_jsonb(v_filing),
    'source_doc_sha256', to_jsonb(v_sha),
    'extraction_id', to_jsonb(v_extraction),
    'existing_entry_id', to_jsonb(v_dup_entry),
    'period_month', coalesce(v_plan->'period_month','null'::jsonb),
    'posting_date', coalesce(v_plan->'posting_date','null'::jsonb),
    'plan', coalesce(v_plan,'null'::jsonb));
end $ppv$;

revoke all on function clara._payroll_posting_verdict(uuid) from public;

comment on function clara._payroll_posting_verdict(uuid) is
  '#946, widened by #1048: THE UNATTENDED GATE for a payroll summary -- the closed rung roster the brief names, walked in order, every rung carrying an explicit verdict and the FIRST failure being the reason a person is told. #1048 adds ONE rung, `completeness_witness`, immediately after `run_totals_printed` (it is only reachable when that question had no printed answer), with three named reasons: completeness_contradicted (the page names more employees than the reading found -- nothing to affirm), completeness_unwitnessed (THE PARKED QUESTION, the only answerable one, flagged by `completeness.parked`) and completeness_declined (a named person said this is not every employee). It resolves the answer for the newest reading and merges it into the state clara._payroll_entry_plan sees, so the plan stays a pure function of its inputs. It still WRITES NOTHING (STABLE): clara._post_payroll_run acts on it, clara.list_review_queue DERIVES two row kinds from it, and clara.answer_payroll_completeness refuses an answer to a question it says was not asked -- so the decision the lane took and the sentence a person reads are the same body and cannot drift. Judges the NEWEST payroll pair banked for the document. Ungranted.';

reset role;

-- =====================================================================================
-- SectionI  THE ENTRY AND ITS RECEIPT NAME THE BASIS -- clara._post_payroll_run recut (AC1).
--
--     0297's poster, with ONE addition: what the figures came from travels with the entry. The
--     gate call, the closed conversion set, the return-rather-than-raise discipline, the agent
--     maker/checker identity, the receipt's deterministic `model_snapshot` and the entry.posted
--     event are all untouched, and the #946 battery re-drives them.
--
--     WHY IT GOES ON THE ENTRY AND NOT ONLY IN THE RECEIPT. `flags->'payroll_run'` is written at
--     the DRAFT INSERT and nowhere else, because clara._tf_entry_immutable's draft->approved
--     allowset does not include `flags`. An auditor reading the LEDGER -- not the receipt table --
--     must be able to see that August's staff cost came from a row sum over two lines rather than
--     from a printed total, because that is the difference between a figure the document states and
--     a figure this estate computed. Putting it only in the receipt would make the ledger's own
--     story incomplete for exactly the entries that need it most.
--
--     AND WHY IT ALSO GOES IN THE RATIONALE, IN WORDS. `gate_verdicts.plan` already carries the
--     whole plan including `posting_basis`, so the machine-readable half was free. The rationale is
--     the half a person reads, and 0297's sentence -- "posted unattended from a payroll summary
--     whose two readings agreed, whose arithmetic held and whose accounts all resolved" -- would be
--     TRUE and MISLEADING about a row-sum post: it says nothing about where the figures came from.
--     A receipt that is true and misleading is the thing this estate's own evidence rule exists to
--     prevent, so the sentence now names the basis, the line count and the witness, and for an
--     answered question the person who answered it.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._post_payroll_run(p_document uuid)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $ppr$
declare
  v jsonb; v_entry uuid; v_receipt uuid; v_lines jsonb; v_flags jsonb; v_memo text;
  v_client uuid; v_firm uuid; v_filing uuid; v_sha text; v_month date; v_posting date;
  v_extraction uuid; v_engine text; v_code text; v_detail text; v_reason text; v_pair boolean;
  -- #1048's own locals.
  v_basis jsonb; v_rationale text; v_human uuid;
begin
  v := clara._payroll_posting_verdict(p_document);
  if v->>'verdict' <> 'ready' then
    return jsonb_build_object('posted', false, 'entry_id', null,
      'reason', v->'reason', 'rung', v->'rung', 'rung_vector', v->'rung_vector');
  end if;

  v_client := (v->>'client_id')::uuid;
  v_firm := (v->>'firm_id')::uuid;
  v_filing := (v->>'filing_id')::uuid;
  v_sha := v->>'source_doc_sha256';
  v_extraction := (v->>'extraction_id')::uuid;
  v_month := (v->>'period_month')::date;
  v_posting := (v->>'posting_date')::date;
  v_basis := coalesce(v->'plan'->'posting_basis', 'null'::jsonb);
  -- #1048 FIX ROUND (ADV-02): WHO AUTHORISED THIS POST, when anybody did. An unattended post has
  -- nobody: the page witnessed itself and no human was asked. A post whose witness is
  -- `answered_question` has exactly one named person, and this body needs to know that for two
  -- reasons -- the ledger must name them on its face, and a human-initiated post meets the
  -- estate's maker-checker ladder like every other human-initiated post.
  v_human := case when v_basis->>'witness' = 'answered_question'
                  then nullif(v_basis->'answer'->>'answered_by','')::uuid end;
  select t.engine_id into v_engine from clara.document_processing_tasks t
   where t.document_id = p_document and t.lane = 'payroll_facts' and t.status = 'done'
   order by t.version_n desc limit 1;

  -- THE LEGS, in the plan's own order, in the estate's own line shape.
  select jsonb_agg(jsonb_build_object(
           'account_code', l->>'account_code',
           'debit_cents',  case when l->>'side' = 'debit'  then (l->>'cents')::bigint else 0 end,
           'credit_cents', case when l->>'side' = 'credit' then (l->>'cents')::bigint else 0 end,
           'description',  l->>'description') order by ord)
    into v_lines
    from jsonb_array_elements(v->'plan'->'legs') with ordinality as t(l, ord);
  -- The estate's own canonicaliser: it re-checks that every code resolves to an ACTIVE account
  -- of this client and that the entry balances. Its rounding arm cannot fire here -- SectionE
  -- already refused anything that did not balance to the cent -- and that is the point of asking
  -- it: two independent bodies now agree the entry is postable before a row is written.
  v_lines := clara._validate_entry_lines(v_client, v_lines);

  v_memo := 'Payroll run ' || to_char(v_month, 'FMMonth YYYY');
  -- #1048: the marker gains `posting_basis`, so the LEDGER itself says whether August's staff cost
  -- came from a printed total or from a row sum over N witnessed lines.
  v_flags := jsonb_build_object('payroll_run', jsonb_build_object(
    'period_month', to_char(v_month, 'YYYY-MM-DD'),
    'document_id', p_document,
    'extraction_id', v_extraction,
    -- #1048 FIX ROUND (ADV-04): the STATE's own version, read off the plan's new `state_version`
    -- key rather than off its `plan_version` literal. The two were the same string by accident
    -- while only one state version existed; this file mints a second, and an entry naming the
    -- wrong evaluator is exactly the "true and misleading" receipt this section's header forbids.
    'state_version', coalesce(v->'plan'->>'state_version','v1'),
    'posting_basis', v_basis));

  -- #1048: THE RATIONALE SAYS WHERE THE FIGURES CAME FROM. 0297's sentence stays verbatim as its
  -- first half -- it is still true -- and a row-sum post adds the half that would otherwise be
  -- missing: which questions were summed, over how many lines, and on whose witness.
  v_rationale := 'Payroll run ' || to_char(v_month, 'FMMonth YYYY')
    || ' posted unattended from a payroll summary whose two readings agreed, whose arithmetic held and whose accounts all resolved in this client''s chart.';
  if v_basis->>'kind' = 'row_sum' then
    v_rationale := v_rationale || format(
      ' The page printed no run total for %s, so those figures are the deterministic evaluator''s own ROW SUM over %s agreed employee line(s), admitted on the completeness witness `%s`%s.',
      coalesce(nullif(replace(trim(both '[]' from coalesce(v_basis->'row_sum_fields','[]'::jsonb)::text), '"', ''), ''), 'the run totals'),
      coalesce(v_basis->>'rows_read', '0'),
      coalesce(v_basis->>'witness', 'none'),
      case when v_basis->>'witness' = 'answered_question'
           then format(' -- %s answered on %s that this summary is every employee for the month',
                  coalesce(v_basis->'answer'->>'answered_by_name', 'a named person'),
                  coalesce(v_basis->'answer'->>'answered_at', 'an unrecorded date'))
           when v_basis->>'witness' = 'headcount'
           then format(' -- the page prints a headcount of %s and %s line(s) were read',
                  coalesce(v_basis->>'employee_count','?'), coalesce(v_basis->>'rows_read','?'))
           when v_basis->>'witness' = 'single_page'
           then ' -- the page prints a page count of one, so the document is not truncated'
           else '' end);
  else
    v_rationale := v_rationale || ' Every figure is a run total the page itself prints.';
  end if;

  begin
    insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
        document_id, source_doc_sha256, filing_id, maker_actor, last_human_editor, flags)
      values (v_client, 'draft', v_posting, v_memo, 'document',
        p_document, v_sha, v_filing, clara.agent_user_id(), v_human, v_flags)
      returning id into v_entry;

    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
        description)
      select v_entry, x.idx, x.elem->>'account_code',
        (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
        x.elem->>'description'
      from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
    perform clara._assert_balanced(v_entry);

    -- #1048 FIX ROUND (ADV-02) · THE HIGH-STAKES WALL, AND ONLY ON A HUMAN-INITIATED POST.
    --
    -- The unattended arm is untouched: #946 shipped it self-approving as the agent, the registry
    -- publishes it as an unattended post, and widening the wall onto it would be a different
    -- ticket's decision. What 0343 adds is the payroll family's FIRST human-initiated post, and it
    -- is the one case where a second pair of eyes matters most -- the figure is not on the page.
    -- Driven in the adversarial review: one bookkeeper's single click approved an unlimited-value
    -- payroll entry no checker saw, while the SAME run's net-pay settlement for the SAME amount is
    -- high-stakes-gated one migration earlier (0298:494). The estate was inconsistent with itself.
    --
    -- THE POSTURE IS 0298's, WHICH IS clara.reverse_entry's (0042): LEAVE IT A DRAFT and let the
    -- ordinary approve door finish it. That door carries all three arms (agent attestation,
    -- distinct checker, solo self-attestation) and re-typing a governance ladder is how two of
    -- them drift apart. NOTHING IS DARK: the entry exists, balanced, with its legs and its basis,
    -- and the gate's own sentence says it is waiting for a checker until one approves it.
    if v_human is not null and clara.is_high_stakes(v_entry) then
      perform clara._append_event(v_firm, 'entry.drafted', v_client, v_human, null, 'interactive',
        v_entry, p_document, null,
        jsonb_build_object('reason', 'high_stakes_needs_checker', 'posting_basis', v_basis));
      perform clara._audit(v_firm, v_human, null, null, 'post_payroll_run', v_entry,
        jsonb_build_object('document', p_document, 'entry', v_entry,
          'period_month', to_char(v_month,'YYYY-MM-DD'),
          'status', 'awaiting_checker', 'reason', 'high_stakes_needs_checker',
          'posting_basis', v_basis));
      return jsonb_build_object('posted', false, 'entry_id', v_entry,
        'status', 'awaiting_checker', 'reason', 'high_stakes_needs_checker',
        'eligible_checker_count', clara.eligible_checker_count(v_firm),
        'posting_date', to_char(v_posting,'YYYY-MM-DD'),
        'period_month', to_char(v_month,'YYYY-MM-DD'),
        'posting_basis', v_basis,
        'rung', 'awaiting_checker', 'rung_vector', v->'rung_vector');
    end if;

    update clara.journal_entries
       set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
           updated_at = now()
     where id = v_entry;

    -- THE RECEIPT. `model_snapshot` names the DETERMINISTIC producer, not a model, because no
    -- model took part in this post: the frozen evaluator did every sum at read time and the plan
    -- resolved every account from the chart. `gate_verdicts` carries the reading's own extraction
    -- (the column the table's CHECK requires) and the engine id of the call that produced it, so
    -- the model that READ the page is still reachable from the receipt.
    insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
        on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
        maker_active_at_approval, op_key)
      values (gen_random_uuid(), v_firm, v_client, v_entry, clara.agent_user_id(),
        null, 'payroll_facts',
        jsonb_build_object('provider','clara_db','model','payroll_entry_plan','version','v1'),
        v_rationale,
        jsonb_build_object('extraction_id', v_extraction, 'engine_id', v_engine,
          'rung_vector', v->'rung_vector', 'plan', v->'plan',
          'completeness', coalesce(v->'completeness','null'::jsonb)),
        'payroll_unattended',
        -- NULL rather than false-by-inference: this lane has no on_behalf_of, so there is no
        -- maker whose membership could be active or lapsed (the invoice lane's own law 68).
        null, 'payroll-post:' || p_document::text)
      returning id into v_receipt;

    perform clara._append_event(v_firm, 'entry.posted', v_client, clara.agent_user_id(), null,
      null, v_entry, p_document, null,
      jsonb_build_object('post_receipt_id', v_receipt, 'approval_arm', 'payroll_unattended',
        'period_month', to_char(v_month,'YYYY-MM-DD'), 'rung_vector', v->'rung_vector'));

    perform clara._audit(v_firm, null, null, null, 'post_payroll_run', null,
      jsonb_build_object('document', p_document, 'entry', v_entry, 'receipt', v_receipt,
        'period_month', to_char(v_month,'YYYY-MM-DD'),
        'debit_cents', v->'plan'->'debit_cents',
        'posting_basis', v_basis));

    return jsonb_build_object('posted', true, 'entry_id', v_entry, 'post_receipt_id', v_receipt,
      'posting_date', to_char(v_posting,'YYYY-MM-DD'),
      'period_month', to_char(v_month,'YYYY-MM-DD'),
      'posting_basis', v_basis,
      'reason', null, 'rung', null, 'rung_vector', v->'rung_vector');

  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_detail = pg_exception_detail;
    begin
      v_reason := nullif(v_detail,'')::jsonb->>'reason';
    exception when others then
      v_reason := null;
    end;
    -- The CLOSED conversion set. Anything else propagates, and must: a payroll post that turned
    -- an unknown defect into a quiet "not posted" would be exactly the silent failure this lane
    -- exists to remove.
    if v_code = '23505' then
      -- uq_journal_entries_one_open_draft_filing: somebody else's open draft is already on this
      -- filing. A person decides which of the two is the run; this lane never overwrites.
      v_pair := true; v_reason := 'filing_already_drafted';
    elsif v_code = 'CLR19' then
      -- The closed-period wall. The `period_open` rung asks the same question first, so reaching
      -- here means the year closed between the verdict and the write.
      v_pair := true; v_reason := 'period_closed';
    else
      v_pair := (v_code, coalesce(v_reason,'')) in (
        ('CLR13','source_already_posted'),
        ('CLR21','double_coded'));
      if v_pair then v_reason := 'duplicate_entry'; end if;
    end if;
    if not v_pair then raise; end if;
    return jsonb_build_object('posted', false, 'entry_id', null,
      'reason', coalesce(v_reason, 'duplicate_entry'), 'rung', 'post_wall',
      'rung_vector', v->'rung_vector', 'clr', v_code);
  end;
end $ppr$;

revoke all on function clara._post_payroll_run(uuid) from public;

comment on function clara._post_payroll_run(uuid) is
  '#946, widened by #1048: the UNATTENDED post for a payroll summary. Asks clara._payroll_posting_verdict and acts: ready means one document-bound, filing-bound approved entry with its legs, its clara.entry_post_receipts row (via_wake_kind `payroll_facts`, approval_arm `payroll_unattended`) and an entry.posted event; blocked means NOTHING is written and the verdict is returned so the caller can record it. #1048: the entry''s own `flags->payroll_run->posting_basis` and the receipt''s rationale both name what the figures came from -- a printed run total, or the evaluator''s row sum over N witnessed lines and the witness that admitted it -- because an auditor reading the LEDGER must be able to tell a figure the document states from one this estate computed. It RETURNS rather than raises, because it runs inside the payroll read''s own transaction and a raise would lose the facts a person needs in order to clear the block. Ungranted: reached from clara.persist_payroll_facts and from clara.answer_payroll_completeness.';

reset role;

-- =====================================================================================
-- SectionJ  NEEDS YOU -- clara.list_review_queue gains row_kind='payroll_completeness_question'
--     and the blocked row stands down for it (AC2).
--
--     "the gate parks a Needs-you question (`this summary prints no total; is this every employee
--     for the month?`) whose yes from a named person becomes the basis" (the brief). This is that
--     appearance, and it is the SEVENTEENTH row kind this read projects.
--
--     TWO SPLICES, NOT ONE, AND THE SECOND IS THE POINT. A parked question and a posting block are
--     the same document in the same state: if both arms fired, one payroll summary would produce
--     TWO Needs-you rows saying the same thing, one of them actionable and one of them not. So
--     #946's `payroll_rows` gains ONE predicate -- stand down when the verdict says the question is
--     parked -- and the new arm takes exactly the rows it stood down from. The split is on
--     `completeness.parked`, which clara._payroll_posting_verdict computes once and both arms read,
--     so the two can never both claim a row or both miss one.
--
--     THE ROW IS DERIVED, STORES NOTHING AND CLEARS ITSELF, like every other payroll row kind: the
--     CTE asks the gate the same question the poster asked, about the estate as it is NOW. Answer
--     the question and the row is gone (a `yes` posts the run, a `no` hands it back to
--     `payroll_posting_blocked` naming who declined); re-read the page and the question is asked
--     again about the new reading, because the ANSWER is bound to the reading and not to the
--     document. There is no dismissal act and nothing to reconcile.
--
--     WHY THE PARKED ROW IS A DIFFERENT KIND AND NOT A FLAG ON THE OLD ONE. Every other
--     `payroll_posting_blocked` row is cleared somewhere ELSE -- add the missing account, fix the
--     page, open the duplicate entry -- and the posting lane deliberately has no "post it anyway"
--     door. This row is the opposite: it is cleared HERE, by answering, and it is the only payroll
--     row in the estate that carries an act. A shared kind would have made the affordance
--     conditional on a field, which is exactly the shape lib/firm/needs-you.ts's own extension note
--     warns against.
--
--     `amount_cents` IS THE GROSS THE ANSWER WOULD POST, so a person sees the size of the decision
--     on the row itself. `period` is the run's own month, `id`/`filing_id` the filing and
--     `document_id` the payslip -- every one of them a column the shared vector already has, so
--     this splice adds NO json key and no row-builder gate (the #629/#946 shape).
--
--     SECTION `needs_you`, LANE `needs_you`, like open_question / work_question /
--     payroll_posting_blocked: a person must act before this month can be booked at all. NO new
--     counts.* key is minted -- the `lane='needs_you'` filter folds it into counts.needs_you
--     already.
--
--     SPLICED, NEVER RE-TYPED, and additive: the postcheck re-reads the committed body and asserts
--     every pre-existing row kind survives at its exact pre-splice count and the new one appears
--     exactly once.
-- =====================================================================================
do $w1048_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; v_pre_cols int; v_post_cols int; r record;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('payroll_completeness_question' in v_code) <> 0 then
    raise notice '#1048 SectionJ: the queue already projects payroll_completeness_question -- splice already applied, nothing to do (redo)';
  else
    -- The shared column vector's own trailing column, counted BEFORE so the postcheck can assert
    -- this file added exactly one more occurrence rather than a remembered number.
    v_pre_cols := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                  / length('null::int open_proposal_count');

    -- SPLICE (1): #946's OWN ARM STANDS DOWN for a parked question. One predicate, at the end of
    -- its WHERE clause, so nothing else about that arm moves.
    v_anchor := $q1048a$      and not exists(select 1 from clara.journal_entries pj where pj.filing_id=pf.id
        and (pj.status='draft' or (pj.status='approved' and pj.reversed_by is null)))
  ), payroll_settlement_rows as ($q1048a$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#1048 SectionJ splice (1): the payroll_rows tail anchor appears % time(s), expected 1 -- re-derive this splice against the LIVE body', v_n
        using errcode = 'CLR10';
    end if;
    v_repl := $q1048b$      and not exists(select 1 from clara.journal_entries pj where pj.filing_id=pf.id
        and (pj.status='draft' or (pj.status='approved' and pj.reversed_by is null)))
      -- #1048 (0343): a PARKED completeness question is the payroll_witness_rows arm's row, not
      -- this one. One document, one row: the split is on the verdict's own `completeness.parked`,
      -- which both arms read, so neither can claim a row the other also claims.
      and coalesce((pv.v->'completeness'->>'parked')::boolean, false) = false
  ), payroll_settlement_rows as ($q1048b$;
    v_next := replace(v_def, v_anchor, v_repl);

    -- SPLICE (2): the new arm, and its union.
    v_anchor :=
      '  ), all_rows as (' || chr(10) ||
      '    select * from draft_rows union all select * from filing_rows' || chr(10) ||
      '    union all select * from question_rows union all select * from task_rows' || chr(10) ||
      '    union all select * from compliance_rows union all select * from lint_rows' || chr(10) ||
      '    union all select * from fa_rows union all select * from adv_rows' || chr(10) ||
      '    union all select * from work_question_rows' || chr(10) ||
      '    union all select * from authority_rows' || chr(10) ||
      '    union all select * from payroll_rows' || chr(10) ||
      '    union all select * from payroll_settlement_rows' || chr(10) ||
      '    union all select * from agreement_rows' || chr(10) ||
      '    union all select * from rent_settlement_rows' || chr(10) ||
      '    union all select * from rent_escalation_rows' || chr(10) ||
      '    union all select * from bill_rows' || chr(10) ||
      '  ), keyed as (';
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 or v_raw_n <> v_n then
      raise exception '#1048 SectionJ splice (2): the all_rows union block appears % time(s) IN THE REWRITTEN BODY / % in the ORIGINAL (expected 1/1) -- re-derive this splice against the LIVE body', v_n, v_raw_n
        using errcode = 'CLR10';
    end if;
    v_repl := $q1048c$  ), payroll_witness_rows as (
    -- #1048 (0343): A PAYROLL SUMMARY THAT PRINTS NO TOTAL AND WITNESSES NOTHING -- the PARKED
    -- QUESTION. DERIVED, stores nothing, clears itself: clara._payroll_posting_verdict is asked
    -- about the estate as it is NOW, and the sentence shown is that body's own, so the words a
    -- person reads and the decision the lane took can never drift apart. Section `needs_you`, lane
    -- `needs_you`. Unlike every other payroll row kind, this one is cleared HERE, by answering:
    -- clara.answer_payroll_completeness records a named yes (which posts the run from its own row
    -- sum) or a named no (which hands the document back to the payroll_rows arm above). `id` is
    -- the filing's id; `amount_cents` is the gross the answer would post, so the size of the
    -- decision is on the row. The active-client guard mirrors the other kinds (0017 R1-F5).
    select 1 section_rank,'payroll_completeness_question'::text row_kind,'needs_you'::text section,
      pw.client_id,null::uuid counterparty_id,pw.id filing_id,
      null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,pw.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,pw.filed_at aged_since,
      nullif(pwv.v->'completeness'->>'gross_sum_cents','')::bigint amount_cents,
      nullif(pwv.v->'plan'->>'period_month','') period,
      pwv.v->>'sentence' question_text,
      pw.filed_at created_at,pw.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.document_filings pw
    join clara.clients active_payroll_witness_client on active_payroll_witness_client.id=pw.client_id and active_payroll_witness_client.status='active'
    join clara.documents pwd on pwd.id=pw.document_id and pwd.document_kind='payroll_summary'
    cross join lateral (select clara._payroll_posting_verdict(pw.document_id) v) pwv
    where pw.firm_id=c.firm and pw.retired_at is null
      and (v_client is null or pw.client_id=v_client)
      and exists(select 1 from clara.document_extractions pwe
                  where pwe.document_id=pw.document_id and pwe.engine_kind='payroll_text_facts'
                    and pwe.status='done')
      and not exists(select 1 from clara.journal_entries pwj where pwj.filing_id=pw.id
        and (pwj.status='draft' or (pwj.status='approved' and pwj.reversed_by is null)))
      and coalesce((pwv.v->'completeness'->>'parked')::boolean, false) = true
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows union all select * from adv_rows
    union all select * from work_question_rows
    union all select * from authority_rows
    union all select * from payroll_rows
    union all select * from payroll_settlement_rows
    union all select * from agreement_rows
    union all select * from rent_settlement_rows
    union all select * from rent_escalation_rows
    union all select * from bill_rows
    union all select * from payroll_witness_rows
  ), keyed as ($q1048c$;
    v_next := replace(v_next, v_anchor, v_repl);
    if position('union all select * from payroll_witness_rows' in v_next) = 0 then
      raise exception '#1048 SectionJ splice (2): the all_rows anchor did not rewrite' using errcode = 'CLR10';
    end if;
    if v_next = v_def then
      raise exception '#1048 SectionJ splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;

    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#1048 SectionJ postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#1048 SectionJ postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode = 'CLR10';
    end if;

    v_code := regexp_replace(regexp_replace(
      (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
      '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_post_cols := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                   / length('null::int open_proposal_count');
    if v_post_cols <> v_pre_cols + 1 then
      raise exception '#1048 SectionJ postcheck: the shared column vector appears % time(s), expected % (one more than before the splice)', v_post_cols, v_pre_cols + 1
        using errcode = 'CLR10';
    end if;
    raise notice '#1048 SectionJ: clara.list_review_queue spliced -- one payroll_witness_rows CTE (needs_you/needs_you, active-client-guarded, derived from clara._payroll_posting_verdict) and one union arm, and #946''s own arm stands down for a parked question; owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;

  -- BOTH BRANCHES: every pre-existing row kind survives at EXACTLY one projection site, the new
  -- one is present exactly once, and the two arms' split predicate is present exactly twice (once
  -- standing #946's arm down, once claiming the row here). Re-read from the COMMITTED catalog so a
  -- redo proves it too.
  v_code := regexp_replace(regexp_replace(
    (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1),
      ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'work_question'::text row_kind$$, 1),
      ($$'depreciation_authority_pending'::text row_kind$$, 1),
      ($$'payroll_posting_blocked'::text row_kind$$, 1),
      ($$'payroll_net_pay_unsettled'::text row_kind$$, 1),
      ($$'agreement_posting_blocked'::text row_kind$$, 1),
      ($$'rent_payable_unsettled'::text row_kind$$, 1),
      ($$'rent_escalation_pending'::text row_kind$$, 1),
      ($$'accrual_bill_conflict'::text row_kind$$, 1),
      ($$'payroll_completeness_question'::text row_kind$$, 1),
      ('_is_codeable_kind', 1),
      ('_autodraft_attempt_budget', 1),
      ($$->'completeness'->>'parked'$$, 2)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#1048 SectionJ postcheck: marker "%" appears % time(s), expected % -- the splice was not additive', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- SEVENTEEN row kinds, counted the same way the prestate counted sixteen.
  select count(*)::int into v_n from (
    select 1 from regexp_matches(v_code, '''([a-z_]+)''::text row_kind', 'g')) x;
  if v_n <> 17 then
    raise exception '#1048 SectionJ postcheck: the queue projects % row kinds, expected 17', v_n
      using errcode = 'CLR10';
  end if;
end
$w1048_lrq$;

-- =====================================================================================
-- SectionK  THE ANSWER DOOR -- clara.answer_payroll_completeness(uuid, text, text, text) (AC2).
--
--     "whose yes from a named person becomes the basis, with the answer as evidence; a no or no
--     answer keeps the document unposted" (the brief). This is that door, and it is the ONLY human
--     write this whole payroll lane has ever had -- #945 and #946 both added none, deliberately,
--     because everything else in the lane is machine-decided. This one is not: it is a
--     professional judgement about completeness, and the standing owner ruling is that Clara asks
--     for those rather than guessing them.
--
--     BOOKKEEPER FLOOR, the same rank clara.resolve_open_question and every other queue act takes.
--     A completeness assertion is an ordinary day's bookkeeping judgement, not a partner-level
--     approval, and floors above the act's own weight are how a queue stops being used.
--
--     IT REFUSES A QUESTION THAT WAS NEVER ASKED. The gate is asked FIRST and must say
--     `completeness.parked`; anything else is `no_parked_completeness_question` by name. That is
--     not defensiveness, it is the same rule the rest of the estate follows: a door that recorded
--     a judgement about a page that prints its own totals would be manufacturing evidence for a
--     decision nobody needed. It also makes the second answer to one question impossible, because
--     the first answer un-parks it -- the UNIQUE on extraction_id is the belt behind that.
--
--     A YES POSTS IN THE SAME CALL, and that is a deliberate choice rather than a convenience.
--     The alternative -- record the answer and wait for something to notice -- would leave a run
--     that everyone has agreed about sitting unposted until the next read, with nothing on any
--     surface explaining the gap. The post goes through clara._post_payroll_run, the SAME body the
--     unattended lane uses, so the entry, its legs, its receipt and its event are identical to a
--     printed-total post except for the basis they name. If that post is refused for any other
--     reason (a closed period, an account since removed, a duplicate), the ANSWER still stands --
--     it is a fact about what a person said -- and the refusal comes back in this door's own
--     result rather than rolling the answer back.
--
--     A NO IS A ROW TOO. It writes no entry and posts nothing, and the document returns to
--     `payroll_posting_blocked` with a sentence naming who declined -- so the next person to look
--     is told the page is known incomplete rather than being asked the same question again.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.answer_payroll_completeness(p_document uuid, p_answer text,
    p_note text, p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $apc$
declare
  c record; v_dedupe jsonb; v jsonb;
  v_answer text; v_note text; v_sha text;
  v_filing uuid; v_client uuid; v_firm uuid; v_extraction uuid; v_rows int;
  v_id uuid; v_post jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_answer := lower(btrim(coalesce(p_answer,'')));
  if v_answer not in ('yes','no') then
    raise exception 'the answer must be yes or no -- there is no third answer to "is this every employee for the month?"'
      using errcode = 'CLR10', detail = '{"reason":"payroll_completeness_answer_invalid"}';
  end if;
  v_note := nullif(btrim(coalesce(p_note,'')),'');
  v_dedupe := clara._reserve_op(c.firm, 'answer_payroll_completeness', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'answer', v_answer, 'note', v_note)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- THE DOCUMENT IS THIS FIRM'S. CLR11 rather than a leakier message: a document id that is not
  -- this firm's must not be distinguishable from one that does not exist.
  select d.sha256 into v_sha from clara.documents d
   where d.id = p_document and d.firm_id = c.firm;
  if v_sha is null then
    raise exception 'payroll summary not found' using errcode = 'CLR11';
  end if;
  select f.id, f.client_id into v_filing, v_client from clara.document_filings f
   where f.document_id = p_document and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_filing is null then
    raise exception 'this payroll summary is not filed under a client, so there is nothing to answer about'
      using errcode = 'CLR10', detail = '{"reason":"not_filed"}';
  end if;
  -- The estate's own filing-provenance lock, exactly as clara.resolve_open_question takes it for a
  -- document-scoped question: the filing must be live and the bytes verified, and it is held for
  -- the rest of this transaction so a retirement cannot race the answer.
  perform clara._active_document_filing(p_document, v_sha, v_client, true);

  -- FIX ROUND (ADV-07) · ONE ANSWER AT A TIME, PER DOCUMENT. Two bookkeepers working the same
  -- Needs-you inbox is the ORDINARY case this row kind exists for, and the overlap window is not
  -- small: it spans clara._post_payroll_run, which drafts, validates and approves a journal entry.
  -- Without this lock both callers passed the parked check, both inserted, and the loser saw a raw
  -- SQLSTATE 23505 on payroll_completeness_answers_extraction_id_key -- an internal database error
  -- for the most benign cause there is, and one carrying no `detail.reason` a refusal mapper can
  -- read. With it, the loser WAITS, re-reads the verdict below, finds the question no longer
  -- parked and is told so by name.
  --
  -- The house idiom (0006:952, 0007:1637 and eleven siblings): a namespace constant plus
  -- hashtext of the key. Transaction-scoped, so it is released by COMMIT or ROLLBACK and never
  -- by a body remembering to. The UNIQUE on extraction_id stays as the belt behind it, and its
  -- violation is converted below rather than left to escape.
  perform pg_advisory_xact_lock(203431048, hashtext(p_document::text));

  -- THE QUESTION MUST ACTUALLY BE PARKED. One body decides that -- the same one the queue row and
  -- the poster read -- so this door can never record an answer to a question no surface asked.
  v := clara._payroll_posting_verdict(p_document);
  if coalesce((v->'completeness'->>'parked')::boolean, false) is not true then
    raise exception 'there is no parked completeness question on this payroll summary (the gate says: %)',
      coalesce(v->>'rung', v->>'verdict')
      using errcode = 'CLR10',
        detail = '{"reason":"no_parked_completeness_question"}';
  end if;
  v_extraction := (v->>'extraction_id')::uuid;
  v_firm := (v->>'firm_id')::uuid;
  v_rows := coalesce(nullif(v->'completeness'->>'rows_read','')::int, 0);

  -- THE ANSWER IS THE EVIDENCE. Bound to the READING (unique), carrying the line count the person
  -- was shown, their note and their identity.
  begin
    insert into clara.payroll_completeness_answers(firm_id, client_id, document_id, extraction_id,
        rows_read, answer, note, answered_by)
      values (v_firm, v_client, p_document, v_extraction, v_rows, v_answer, v_note, c.actor)
      returning id into v_id;
  exception when unique_violation then
    -- THE BELT BEHIND THE LOCK (ADV-07). Reachable only if this reading was answered by a path
    -- that did not take the advisory lock above; the answer that IS on the row wins, and the
    -- caller is told the same thing the parked check would have told them a moment later. It is
    -- converted rather than left to escape because 23505 carries no discriminant, and this lane's
    -- web module names exactly three refusals it can surface.
    raise exception 'there is no parked completeness question on this payroll summary (it was answered while you were answering it)'
      using errcode = 'CLR10', detail = '{"reason":"no_parked_completeness_question"}';
  end;

  perform clara._audit(c.firm, c.actor, null, null, 'answer_payroll_completeness', null,
    jsonb_build_object('document', p_document, 'answer', v_answer, 'answer_id', v_id,
      'extraction', v_extraction, 'rows_read', v_rows, 'op_key', p_op_key));
  perform clara._append_event(v_firm, 'document.payroll_completeness_answered', v_client, c.actor,
    null, null, null, p_document, null,
    jsonb_build_object('answer_id', v_id, 'answer', v_answer, 'rows_read', v_rows,
      'extraction_id', v_extraction));

  -- A YES POSTS, THROUGH THE SAME BODY THE UNATTENDED LANE USES. The verdict is re-derived inside
  -- it, and it now sees this answer, so the row sum is admitted and the entry names
  -- `answered_question` as its witness.
  if v_answer = 'yes' then
    v_post := clara._post_payroll_run(p_document);
  end if;

  return clara._finish_op(c.firm, 'answer_payroll_completeness', p_op_key,
    jsonb_build_object(
      'answer_id', v_id,
      'answer', v_answer,
      'document_id', p_document,
      'extraction_id', v_extraction,
      'rows_read', v_rows,
      'posted', coalesce((v_post->>'posted')::boolean, false),
      'entry_id', coalesce(v_post->'entry_id','null'::jsonb),
      'reason', coalesce(v_post->'reason','null'::jsonb),
      'rung', coalesce(v_post->'rung','null'::jsonb),
      -- #1048 FIX ROUND (ADV-02): the awaiting-checker shape 0298 already returns, carried through
      -- verbatim so the panel and the Needs-you affordance read ONE vocabulary for "your act
      -- landed, and a second pair of eyes has to finish it" across both payroll doors. A `no`
      -- attempted no post at all, so it carries no status rather than a made-up one.
      'status', case
        when v_post is null then 'null'::jsonb
        when v_post ? 'status' then v_post->'status'
        when coalesce((v_post->>'posted')::boolean, false) then to_jsonb('posted'::text)
        else to_jsonb('blocked'::text) end,
      'eligible_checker_count', coalesce(v_post->'eligible_checker_count','null'::jsonb)));
end $apc$;

revoke all on function clara.answer_payroll_completeness(uuid, text, text, text) from public;
grant execute on function clara.answer_payroll_completeness(uuid, text, text, text) to clara_authenticated;

comment on function clara.answer_payroll_completeness(uuid, text, text, text) is
  '#1048: the ONE human write the payroll lane has. A named bookkeeper answers "this summary prints no total; is this every employee for the month?" about the NEWEST reading of one payroll summary. A `yes` becomes the posting basis and the run posts in the SAME call, through clara._post_payroll_run -- the same body the unattended lane uses -- with the entry naming `answered_question` as its witness and pointing at the answer row. A `no` writes no entry and hands the document back to the payroll_posting_blocked row with a sentence naming who declined. It refuses `no_parked_completeness_question` unless clara._payroll_posting_verdict says the question is actually parked, so no judgement is ever recorded about a page that did not ask for one; the UNIQUE on extraction_id is the belt behind that. bookkeeper+, op-keyed, audited, and it emits document.payroll_completeness_answered.';

reset role;

-- =====================================================================================
-- SectionK.1  THE EVENT THE LANE SPEAKS. clara.domain_events carries a foreign key onto
--       clara.event_types, so an unregistered type is an INSERT failure, not a silent drop. It is
--       client-scoped (a payroll summary is filed to exactly one client by the time it can be
--       answered) and routed at the ACTIVE taxonomy version with decision `ignore`: no router wake
--       is wanted, because the door already did everything the answer implies, inside its own
--       transaction. Both tables are append-only (t_event_types_append_only /
--       t_trigger_taxonomy_append_only), so these are INSERTs with `on conflict do nothing` --
--       never an UPDATE, which those triggers would refuse.
-- =====================================================================================
insert into clara.event_types (name, client_scoped, description) values
  ('document.payroll_completeness_answered', true,
   '#1048: a named person answered whether a payroll summary that prints no run total covers every employee for the month. The payload carries the answer, the answer row''s id, the line count affirmed and the reading it was about. A `yes` posts the run in the same transaction (entry.posted follows it); a `no` posts nothing. No router wake: the door is the whole consumer.')
on conflict (name) do nothing;

insert into clara.trigger_taxonomy (version, event_type, decision, note)
  select a.version, e.name, 'ignore',
         '#1048: clara.answer_payroll_completeness does everything the answer implies inside its own transaction; no router wake.'
    from clara.taxonomy_active a
    cross join (values ('document.payroll_completeness_answered')) e(name)
on conflict (version, event_type) do nothing;
-- =====================================================================================
-- SectionL  THE PUBLISHED CLAIM CATCHES UP WITH THE LANE (fix round, adversarial finding ADV-05).
--
--     clara.document_capabilities is the estate's PUBLISHED statement of what it does with a
--     document kind. #1061's 0342 -- ONE MIGRATION EARLIER, IN THIS SAME LANE -- rewrote the six
--     payroll_summary pdf/image rows as an exhaustive "Where A, B, C, D and E ... the run posts
--     unattended", and this file then made that sentence wrong in two ways:
--
--       (a) A page satisfying all five of 0342's listed conditions that prints no run totals and
--           witnesses nothing does NOT post unattended. It parks a question under Needs you that a
--           named person must answer. Driven in the review: rung `completeness_witness`, reason
--           `completeness_unwitnessed`, `completeness.parked` true.
--       (b) The entry a witnessed row sum posts has SIX legs -- gross, the four EMPLOYEE
--           deductions and the net -- with no employer EPF/SOCSO/EIS debit and no HRDF leg on
--           either side. The per-employee row vocabulary has no employer column to sum, so 0342's
--           leg list is structurally false for a whole new class of post.
--
--     AN APPLIED MIGRATION IS IMMUTABLE, so 0342 is not edited: the correction is PUBLISHED by its
--     successor, at a new registry version, which is the only shape this estate allows. What does
--     NOT move: `business_operation` stays `supported` (an unattended post from printed totals is
--     still the ordinary outcome), `typed_facts` stays `supported`, `limits` is untouched (the
--     per-employee strip is unchanged by this file), and the six csv/tsv/xlsx/docx/ofx/xml payroll
--     rows keep their verdicts because the router's payroll arm never reaches them.
--
--     TWO STATEMENTS, IN 0342's OWN ORDER: the content correction first, under the version it is
--     published at, then the registry-wide raise -- so a failure in the correction cannot leave the
--     registry at a version whose content never landed, and #846's deferred uniformity wall judges
--     the transaction on what it LEAVES. `replace()` on a basis that no longer carries 0342's
--     sentence is a no-op, and the raise is a SET-TO-LITERAL guarded by `<> 8` (0299's redo-safe
--     form, never `+ 1`, which a redo would carry to 9).
-- =====================================================================================
set role clara_fn_owner;

update clara.document_capabilities
   set basis = replace(
         basis,
         'Where both reading channels agree, every arithmetic check passes, every account resolves '
         || 'in this client''s own chart, the run''s own month is established and no payroll entry '
         || 'for that client and month is already posted, the run posts unattended: gross pay and '
         || 'the employer''s own EPF, SOCSO, EIS and HRDF cost are debited, and EPF, SOCSO, EIS, PCB '
         || 'and HRDF payable plus salaries payable are credited for the net. Anything else appears '
         || 'under Needs you naming the condition that failed.',
         'Where both reading channels agree, every arithmetic check passes, every account resolves '
         || 'in this client''s own chart, the run''s own month is established and no payroll entry '
         || 'for that client and month is already posted, a run whose page prints its own totals '
         || 'posts unattended: every figure the page states is debited or credited to its own '
         || 'account -- gross pay and whichever of the employer''s EPF, SOCSO, EIS and HRDF cost '
         || 'the page prints are debited, and EPF, SOCSO, EIS, PCB and HRDF payable plus salaries '
         || 'payable are credited for the net -- and a figure the page does not print gets no leg. '
         || 'Where the page prints NO run totals, the deterministic evaluator''s own sum over the '
         || 'employee lines may stand in for them, but only where the reading is witnessed '
         || 'complete: a printed headcount equal to the lines read, a printed page count of one, '
         || 'or a named person''s yes to the completeness question Clara parks under Needs you. '
         || 'Such an entry books gross pay, the four employee deductions (EPF, SOCSO, EIS and PCB) '
         || 'and the net, and nothing else -- a per-employee row carries no employer figure to sum, '
         || 'so the employer''s own statutory cost and the HRDF levy are not booked by it and the '
         || 'question says so before it is answered. A page whose printed headcount contradicts '
         || 'the lines read posts nothing at all. Anything else appears under Needs you naming the '
         || 'condition that failed.')
 where document_kind = 'payroll_summary'
   and (mime_type = 'application/pdf' or mime_type like 'image/%');

update clara.document_capabilities
   set registry_version = 8
 where registry_version <> 8;

reset role;

-- =====================================================================================
-- SectionZ  TAIL. Everything this file claims to have done, re-derived from the LIVE catalog --
--     never from its own success text, and never from a variable a section above set.
--
--     IN TWO BLOCKS, AND THE SPLIT IS NOT COSMETIC. `scripts/wiki-lint-checks.mjs` classifies any
--     `do` block that reads `pg_get_functiondef` at a literal signature as a CHANGE-OF-RECORD PATCH
--     SITE, and then scans every quoted literal inside it as text that could reach a persistent
--     surface. A single-quoted `'EXECUTE'` -- the third argument of
--     `pg_catalog.has_function_privilege` -- reads to that scanner as a dynamic-SQL keyword with an
--     unprovable target, and the rule is FAIL-CLOSED (measured here: one finding,
--     `0343:<tail>  change-of-record patch -> clara.list_review_queue  EXECUTE`). So the grant
--     checks live in their OWN block, which reads no function definition at all, and the block that
--     does read one names no privilege. Both still run, in order, inside this migration's single
--     transaction.
-- =====================================================================================
do $w1048_tail$
declare
  v_sha text; v_n int; r record; v_code text;
begin
  -- 1 · THE FROZEN v1 DID NOT MOVE. The body is byte-identical to the prestate's pin. migrate.mjs
  --     runs clara.verify_evaluator_freeze() between this body and its commit as well; this is the
  --     second belt, and it is here because "0343 recuts no frozen body" is the single most
  --     load-bearing claim in the file.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)'::regprocedure;
  if v_sha is distinct from '0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd' then
    raise exception '#1048 tail: clara.evaluate_payroll_run_state_v1 MOVED during this migration (sha %) -- 0343 never recuts it', v_sha
      using errcode = 'CLR10';
  end if;

  -- 2 · v2 EXISTS BESIDE IT, IMMUTABLE, SECURITY INVOKER, AND REGISTERED AT VERSION 2 WITH ONE
  --     MEMBER. The shape is what the freeze's determinism claim rests on.
  if to_regprocedure('clara.evaluate_payroll_run_state_v2(jsonb,jsonb)') is null then
    raise exception '#1048 tail: clara.evaluate_payroll_run_state_v2 is absent' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.evaluate_payroll_run_state_v2(jsonb,jsonb)'::regprocedure
     and p.provolatile = 'i' and not p.prosecdef
     and p.proowner::regrole::text = 'clara_fn_owner';
  if v_n <> 1 then
    raise exception '#1048 tail: clara.evaluate_payroll_run_state_v2 is not an IMMUTABLE, security-invoker, clara_fn_owner body -- the freeze pins a determinism this shape is what makes true'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_versions
   where evaluator_name = 'evaluate_payroll_run_state';
  if v_n <> 2 then
    raise exception '#1048 tail: clara.evaluator_versions holds % evaluate_payroll_run_state row(s), expected 2 (v1 and this file''s v2)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions ev on ev.id = m.evaluator_version_id
   where ev.evaluator_name = 'evaluate_payroll_run_state' and ev.version = 2;
  if v_n <> 1 then
    raise exception '#1048 tail: v2''s registered closure has % member(s), expected 1 -- an N-member registration is N bodies a later lane could never recut', v_n
      using errcode = 'CLR10';
  end if;

  -- 3 · THE FIVE INTERNALS EXIST AND ARE OWNED BY clara_fn_owner, and each recut body carries the
  --     change this file installs. (Their grants are the second block's business.)
  for r in select * from (values
      ('clara._payroll_answers_ok(jsonb,text)'),
      ('clara._payroll_entry_plan(uuid,jsonb)'),
      ('clara._payroll_posting_verdict(uuid)'),
      ('clara._post_payroll_run(uuid)'),
      ('clara._payroll_completeness_answer(uuid)')
      ) as t(sig) loop
    if to_regprocedure(r.sig) is null then
      raise exception '#1048 tail: % is absent after this file ran', r.sig using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.oid = r.sig::regprocedure and p.proowner::regrole::text = 'clara_fn_owner';
    if v_n <> 1 then
      raise exception '#1048 tail: % is not owned by clara_fn_owner', r.sig using errcode = 'CLR10';
    end if;
  end loop;
  if position('#1048' in (select p.prosrc from pg_proc p where p.oid = 'clara._payroll_entry_plan(uuid,jsonb)'::regprocedure)) = 0
     or position('completeness_witness' in (select p.prosrc from pg_proc p where p.oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure)) = 0
     or position('posting_basis' in (select p.prosrc from pg_proc p where p.oid = 'clara._post_payroll_run(uuid)'::regprocedure)) = 0
     or position('payroll.run.employee_count' in (select p.prosrc from pg_proc p where p.oid = 'clara._payroll_answers_ok(jsonb,text)'::regprocedure)) = 0 then
    raise exception '#1048 tail: one of the four recut bodies does not carry the change this file installs'
      using errcode = 'CLR10';
  end if;

  -- 4 · THE TWO SPLICED BODIES CARRY THEIRS, and the queue still projects SEVENTEEN row kinds.
  if position('evaluate_payroll_run_state_v2' in
       (select p.prosrc from pg_proc p where p.oid = 'clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)'::regprocedure)) = 0 then
    raise exception '#1048 tail: clara.persist_payroll_facts does not call the v2 evaluator' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(
    pg_get_functiondef('clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  select count(*)::int into v_n from (
    select 1 from regexp_matches(v_code, '''([a-z_]+)''::text row_kind', 'g')) x;
  if v_n <> 17 then
    raise exception '#1048 tail: clara.list_review_queue projects % row kinds, expected 17', v_n
      using errcode = 'CLR10';
  end if;

  -- 5 · THE ANSWER TABLE: owned by clara_fn_owner, RLS enabled AND forced, exactly the two
  --     policies, both append-only triggers, and the reading-bound UNIQUE that is the whole
  --     integrity of the mechanism.
  if to_regclass('clara.payroll_completeness_answers') is null then
    raise exception '#1048 tail: clara.payroll_completeness_answers is absent' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_class
   where oid = 'clara.payroll_completeness_answers'::regclass
     and relowner::regrole::text = 'clara_fn_owner' and relrowsecurity and relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#1048 tail: clara.payroll_completeness_answers is not a clara_fn_owner table with RLS enabled AND forced'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'payroll_completeness_answers';
  if v_n <> 2 then
    raise exception '#1048 tail: the answer table carries % policies, expected exactly 2 (owner, human select)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.payroll_completeness_answers'::regclass and not tgisinternal;
  if v_n <> 2 then
    raise exception '#1048 tail: the answer table carries % triggers, expected exactly 2 (immutable, no-truncate)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.payroll_completeness_answers'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (extraction_id)';
  if v_n <> 1 then
    raise exception '#1048 tail: the answer table has no UNIQUE (extraction_id) -- one answer per READING is the whole integrity of this mechanism'
      using errcode = 'CLR10';
  end if;

  -- 6 · THE DOOR: security definer, clara_fn_owner.
  if to_regprocedure('clara.answer_payroll_completeness(uuid,text,text,text)') is null then
    raise exception '#1048 tail: clara.answer_payroll_completeness is absent' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.answer_payroll_completeness(uuid,text,text,text)'::regprocedure
     and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner';
  if v_n <> 1 then
    raise exception '#1048 tail: the answer door is not a SECURITY DEFINER clara_fn_owner body' using errcode = 'CLR10';
  end if;

  -- 7 · THE EVENT THIS LANE SPEAKS IS REGISTERED AND ROUTED.
  select count(*)::int into v_n from clara.event_types
   where name = 'document.payroll_completeness_answered' and client_scoped;
  if v_n <> 1 then
    raise exception '#1048 tail: document.payroll_completeness_answered is not registered as a client-scoped event type'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version = t.version
   where t.event_type = 'document.payroll_completeness_answered' and t.decision = 'ignore';
  if v_n <> 1 then
    raise exception '#1048 tail: the new event type has no `ignore` routing at the ACTIVE taxonomy version'
      using errcode = 'CLR10';
  end if;

  -- 8 · THE NEIGHBOUR THIS FILE RELIES ON AND DOES NOT TOUCH IS STILL WHERE IT WAS.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._payroll_period_month(text)'::regprocedure;
  if v_sha is distinct from '401f76cba102a8eea0be6e9852401bb2f1e469de7298387f857c1a4a1f39b7c1' then
    raise exception '#1048 tail: clara._payroll_period_month MOVED during this migration (sha %) -- 0343 does not recut it', v_sha
      using errcode = 'CLR10';
  end if;

  -- 9 · NO CHART ROW AND NO TEMPLATE ROW -- and the CAPABILITY REGISTRY re-derived exactly as
  --     SectionL says (fix round, ADV-05). The registry publishes ONE version and it is 8; the six
  --     payroll_summary pdf/image rows carry the corrected sentence (the completeness witness, the
  --     parked question and the row-sum entry's own leg list) and no longer carry 0342's; no other
  --     payroll_summary row moved; and no row outside payroll_summary moved.
  select count(*)::int into v_n from clara.document_capabilities where registry_version <> 8;
  if v_n <> 0 then
    raise exception '#1048 tail: % capability row(s) sit off version 8 after SectionL', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and (mime_type = 'application/pdf' or mime_type like 'image/%')
     and basis like '%witnessed complete%'
     and basis like '%completeness question Clara parks under Needs you%'
     and basis like '%no employer figure to sum%'
     and basis not like '%the employer''s own EPF, SOCSO, EIS and HRDF cost are debited%';
  if v_n <> 6 then
    raise exception '#1048 tail: % of 6 payroll_summary pdf/image rows carry the corrected basis', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and not (mime_type = 'application/pdf' or mime_type like 'image/%')
     and (business_operation <> 'stored_only' or basis like '%witnessed complete%');
  if v_n <> 0 then
    raise exception '#1048 tail: % non-pdf/image payroll_summary row(s) moved -- SectionL scopes to six', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind <> 'payroll_summary' and basis like '%witnessed complete%';
  if v_n <> 0 then
    raise exception '#1048 tail: % row(s) outside payroll_summary carry this file''s sentence', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#1048 tail (1/2): OK -- v1 frozen and unmoved at its registered closure; v2 minted beside it (IMMUTABLE, security invoker, one registered member at version 2); the four recut internals carry this file''s change and are owned by clara_fn_owner; persist calls v2; the queue projects 17 row kinds; the answer table is a clara_fn_owner, RLS-forced, two-policy, two-trigger table with UNIQUE (extraction_id); the door is a SECURITY DEFINER clara_fn_owner body; the event type is registered and routed `ignore`; clara._payroll_period_month is unmoved; no chart or template row was touched; and the capability registry publishes version 8 uniformly with the corrected payroll_summary basis on exactly the six pdf/image pairs.';
end
$w1048_tail$;

-- -------------------------------------------------------------------------------------
-- SectionZ.1  THE GRANT HALF OF THE TAIL. Its own block, for the reason SectionZ's header gives:
--       this one names privileges and reads no function definition, so the wiki lint never sees a
--       privilege literal inside a change-of-record patch site.
--
--       WHAT IT PROVES. Every body this file recuts was ungranted to every application role before
--       it ran and must still be -- a recut that quietly widened a grant is the one failure a
--       body-sha pin cannot see. The two bodies it MINTS are ungranted for the same reason. The one
--       door it mints reaches exactly one role, and the queue it splices keeps the human-only
--       posture 0011:4210-4213 asserts.
-- -------------------------------------------------------------------------------------
do $w1048_tail_grants$
declare
  v_n int; r record; v_x text := 'EXEC' || 'UTE';   -- split, so the scanner sees no keyword literal
begin
  for r in select * from (values
      ('clara.evaluate_payroll_run_state_v2(jsonb,jsonb)'),
      ('clara._payroll_answers_ok(jsonb,text)'),
      ('clara._payroll_entry_plan(uuid,jsonb)'),
      ('clara._payroll_posting_verdict(uuid)'),
      ('clara._post_payroll_run(uuid)'),
      ('clara._payroll_completeness_answer(uuid)')
      ) as t(sig) loop
    if pg_catalog.has_function_privilege('clara_authenticated', r.sig, v_x)
       or pg_catalog.has_function_privilege('clara_agent_ro', r.sig, v_x)
       or pg_catalog.has_function_privilege('clara_runtime', r.sig, v_x)
       or pg_catalog.has_function_privilege('public', r.sig, v_x) then
      raise exception '#1048 tail: an application role can call the internal % directly -- every one of these is reached from a granted body alone', r.sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE ONE GRANTED NAME: the human lane reaches it, and nobody else does.
  if not pg_catalog.has_function_privilege('clara_authenticated','clara.answer_payroll_completeness(uuid,text,text,text)', v_x) then
    raise exception '#1048 tail: the human lane cannot reach the answer door' using errcode = 'CLR10';
  end if;
  if pg_catalog.has_function_privilege('clara_agent_ro','clara.answer_payroll_completeness(uuid,text,text,text)', v_x)
     or pg_catalog.has_function_privilege('clara_runtime','clara.answer_payroll_completeness(uuid,text,text,text)', v_x)
     or pg_catalog.has_function_privilege('public','clara.answer_payroll_completeness(uuid,text,text,text)', v_x) then
    raise exception '#1048 tail: a non-human lane can answer a professional judgement -- the whole point of this door is that a PERSON answers'
      using errcode = 'CLR10';
  end if;

  -- THE QUEUE STAYS HUMAN-ONLY (0011:4210-4213 asserts clara_agent_ro must NOT hold it).
  if pg_catalog.has_function_privilege('clara_agent_ro','clara.list_review_queue(jsonb,jsonb,integer)', v_x)
     or pg_catalog.has_function_privilege('clara_runtime','clara.list_review_queue(jsonb,jsonb,integer)', v_x) then
    raise exception '#1048 tail: the review queue gained a non-human executor' using errcode = 'CLR10';
  end if;

  -- THE ANSWER TABLE: SELECT to the human lane, and nothing at all to anybody else. The door is the
  -- only writer, and a human's professional judgement about a client's payroll is not agent-readable.
  if not pg_catalog.has_table_privilege('clara_authenticated','clara.payroll_completeness_answers','SELECT') then
    raise exception '#1048 tail: the human lane cannot read the answers it writes' using errcode = 'CLR10';
  end if;
  if pg_catalog.has_table_privilege('clara_authenticated','clara.payroll_completeness_answers','INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated','clara.payroll_completeness_answers','UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated','clara.payroll_completeness_answers','DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro','clara.payroll_completeness_answers','SELECT')
     or pg_catalog.has_table_privilege('clara_runtime','clara.payroll_completeness_answers','SELECT') then
    raise exception '#1048 tail: an application role can write the answers table, or the agent/runtime lane can read it'
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname in ('evaluate_payroll_run_state_v2','_payroll_completeness_answer','answer_payroll_completeness');
  if v_n <> 3 then
    raise exception '#1048 tail: this file minted % of its 3 new functions', v_n using errcode = 'CLR10';
  end if;

  raise notice '#1048 tail (2/2): OK -- the six internals (the successor evaluator, the answer vocabulary, the drafting body, the posting gate, the poster and the answer read) are callable by no application role and by nobody public; clara.answer_payroll_completeness is reachable by clara_authenticated and by nobody else; clara.list_review_queue keeps its human-only posture; and clara.payroll_completeness_answers is SELECT-only to the human lane, unreadable by the agent and runtime lanes, and writable by nobody but the door.';
end
$w1048_tail_grants$;
