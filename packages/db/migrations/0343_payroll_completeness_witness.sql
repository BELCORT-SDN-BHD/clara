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
--   SectionD  clara.payroll_completeness_answers    -- what a named person said, and when
--   SectionE  clara._payroll_completeness_answer    -- the reading-bound answer read
--   SectionF  clara._payroll_entry_plan recut       -- a witnessed row sum is a posting basis (AC1)
--   SectionG  clara._payroll_posting_verdict recut  -- the `completeness_witness` rung (AC2, AC3)
--   SectionH  clara._post_payroll_run recut         -- the entry and its receipt name the basis
--   SectionI  clara.persist_payroll_facts splice    -- the lane banks a v2 state
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
      v_state := 'channels_disagree'; v_wreason := 'one_channel_read_a_witness_the_other_did_not';
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
  elsif v_ec_state in ('channels_disagree','unreadable') then
    v_verdict := 'absent'; v_wreason := 'printed_headcount_could_not_be_read';
  elsif v_pc_state = 'established' and v_pc = 1 then
    v_verdict := 'witnessed'; v_witness_name := 'single_page';
    v_wreason := 'the_page_says_it_is_the_whole_document';
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
