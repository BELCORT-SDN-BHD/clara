-- 0297_payroll_summary_posting -- #946 (riders wave 4, lane 01): A PAYROLL SUMMARY THAT HAS BEEN
-- READ AND WHOSE ARITHMETIC HOLDS POSTS ITSELF, THE WAY A VALIDATED INVOICE DOES.
-- =====================================================================================
-- Spec of record: issue #946's Agent Brief (the body). Its single comment (belcorttao,
-- 2026-09-19) is an AI triage coordination note, not an owner ruling, and nothing on this ticket
-- is dated 2026-09-20 -- so the body stands and the comment's three instructions are followed as
-- guidance (all three are honoured below and each is named where it lands). Parent #926's owner
-- ruling (2026-09-18, option G): "a payroll summary and a contract go down the same lane as any
-- other accounting document, read and posted, not merely stored." #945 (migration 0296) shipped
-- the READING half; this file is the DRAFTING AND POSTING half.
--
-- AC1 IS ALREADY SATISFIED ON THIS BASE, AND THIS FILE DELIBERATELY ADDS NO CHART ROW.
-- `0295_wave4_chart_rows.sql` -- the wave-4 pre-step that landed the four standard-chart rows
-- #941/#942/#946/#949 share, ONCE, before those lanes were cut -- already minted
-- `2040 Salaries Payable` (liability, no class, no statutory tag) as part of `my_sme_starter`
-- version 2, quoting #946's own AC1 and body as its reason. The triage comment's third
-- instruction ("merge the chart migration ... use one migration for both appends rather than two
-- migrations racing the same template-count assertions") is therefore already carried out, by a
-- file that is not this one. THIS FILE CONSUMES THE ROW BY CODE AND NAME AND INSERTS NOTHING.
--
-- ...AND THE OTHER TEN ACCOUNTS ARE 0150'S, RESOLVED BY CODE (the triage comment's second
-- instruction, honoured): 6000 Salaries and Wages and 6010/6020/6030/6040 (employer
-- EPF/SOCSO/EIS/HRDF) under `employment_costs`, 2100/2110/2120/2130/2140 (EPF/SOCSO/EIS/PCB/HRDF
-- payable) under `statutory_payables`, all seeded by `0150_coa_template_pr_a.sql`. Nothing here
-- appends any of them again.
--
-- THE ACCOUNTING, CHECKED AGAINST THE STANDARD BEFORE IT WAS WRITTEN (AGENTS.md rule 6 and the
-- standing "accounting treatments are checked against the standard" ruling). A Malaysian monthly
-- payroll run books:
--     Dr  Salaries and Wages                       the GROSS
--     Dr  EPF / SOCSO / EIS employer contributions the EMPLOYER's own cost
--     Dr  HRDF levy                                the EMPLOYER's own cost
--         Cr  EPF payable      employee portion + employer portion
--         Cr  SOCSO payable    employee portion + employer portion
--         Cr  EIS payable      employee portion + employer portion
--         Cr  PCB payable      employee portion only (PCB has no employer side)
--         Cr  HRDF levy payable
--         Cr  SALARIES PAYABLE the NET
-- The employee's own EPF, SOCSO, EIS and PCB are DEDUCTIONS FROM GROSS, never a second expense:
-- they are already inside the gross debit, and expensing them again would overstate staff cost
-- and double-count the liability. That is why the entry balances without them: gross minus those
-- four equals net, which is the same identity 0296's evaluator checks on every quoted row.
--
-- TWO OWNER DECISIONS THE BRIEF CARRIES, KEPT VERBATIM IN BEHAVIOUR:
--   * "the net-pay leg always goes to salaries payable and never straight to the bank, because a
--     payslip is not a payment voucher and does not say the money left" -- this file has NO bank
--     arm, and 2040 is the only account the net can reach.
--   * "salaries payable is an ordinary liability account and deliberately not a control account,
--     since this lane carries no employee-level detail to reconcile against" -- 0295 minted the
--     row with `account_class` NULL, and the subledger/open-item belts therefore never ask this
--     entry for a counterparty. #945 STRIPS every per-employee quote at the persist boundary, so
--     there is no grain a control account could be reconciled against even in principle.
--
-- ===================== WHY THE DATABASE POSTS THIS, AND NOT AN AGENT =====================
-- The ticket's title says "under the invoice lane's own gate", and the body says the run posts
-- "the way a validated invoice does". What is REUSED is the invoice lane's GATE DISCIPLINE, not
-- its body, and the difference is stated here so nobody reads this file as a shortcut.
--
--   * The invoice lane's unattended post is `clara._agent_post_entry_core` driven by
--     `clara.wake_post_entry` from autoDraft_v10: a rung vector evaluated over a CLOSED roster,
--     a first-failure refusal that COMMITS (so the reason is durable) and writes no receipt, and
--     exactly one `clara.entry_post_receipts` row on a successful post. THIS FILE COPIES ALL
--     THREE of those properties, in §E.
--   * What it does NOT reuse is that core's rungs, because they are invoice-shaped by
--     construction and would refuse a payroll summary on grounds that have no meaning here: B2
--     and B3 require `clara._invoice_fact_state` corroboration bound to `invoice.total` (a
--     payroll pair banks its state under `payroll_text_facts` and has no `invoice.total` region
--     at all); B1/B14/B15 reason about coding kinds, AR/AP control legs and counterparty
--     identity, none of which a payroll run has. Routing a payroll pair through it would not be
--     strictness -- it would be a gate that always answers "no" for reasons unrelated to payroll.
--   * And an AGENT is not needed at all, which is the real reason this is a database body: an
--     invoice needs a model because CODING it is a judgement (which expense account, which
--     counterparty, which direction). A payroll run's coding is FIXED -- the statutory chart
--     decides every account, and 0296's frozen evaluator has already done every sum. There is
--     nothing left to decide, so putting a model in the loop would add a guess to a lane whose
--     whole promise is that it never guesses.
--
-- The receipt this file writes says exactly that: `model_snapshot` names the deterministic
-- producer (provider `clara_db`), never a model, and `gate_verdicts` carries the READING's own
-- engine id so an auditor can still reach the model call that produced the facts.
--
-- ===================== DEPLOY ORDER: DATABASE ALONE. NO RUNTIME STEP. =====================
-- This file adds NO new task lane, NO new workflow family and NO new runtime call. The posting
-- happens inside `clara.persist_payroll_facts` -- the door the (frozen) payrollFacts_v1 worker
-- already settles through -- so the lane that reads a payslip is the lane that posts it, and the
-- frozen workflow body is not touched. `node scripts/check-frozen-workflows.mjs` shows no
-- manifest diff from this file.
--
-- WRITE-QUIESCE (D1). This file `create or replace`s exactly ONE live body,
-- `clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)`, and SPLICES exactly one more,
-- `clara.list_review_queue(jsonb,jsonb,integer)`. PostgreSQL runs an in-flight PL/pgSQL call to
-- completion on the body it STARTED with, so a payroll persist spanning this migration settles
-- the read WITHOUT posting -- which is the same state a persist under a failed gate leaves, and
-- which the derived Needs-you row of §H reports honestly. Nothing is half-posted in that window:
-- the post is one statement sequence inside the persist's own transaction. `list_review_queue`
-- is a reader. No table is rewritten and no lock is held on a large relation.
--
--   §A  prestate -- the pinned pre-images, measured on this lane database now
--   §B  clara._payroll_period_month(text)        -- the month parser, closed and locale-free
--   §C  clara._payroll_entry_plan(uuid, jsonb)   -- THE DRAFTING BODY (AC2)
--   §D  clara._payroll_posting_verdict(uuid)     -- THE UNATTENDED GATE (AC3, AC4, AC5)
--   §E  clara._post_payroll_run(uuid)            -- the post itself, and its receipt
--   §F  clara.persist_payroll_facts recut        -- the lane posts what it reads (AC3)
--   §G  clara.entry_post_receipts widening       -- the receipt says which lane posted
--   §H  clara.list_review_queue splice           -- row_kind='payroll_posting_blocked' (AC3)
--   §Z  tail
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it is building on, MEASURED on the lane
--     rig (127.0.0.1:55741 / clara_l01) on 2026-09-24, never transcribed from another file.
--
--     BIMODAL BY CONSTRUCTION (#957 redo). The two bodies this file RECUTS are pinned to TWO
--     acceptable shapes each: the PRE-IMAGE sha (a first apply) or a body already carrying this
--     file's own marker (a redo). Anything else is drift and is refused by name. The wave-3
--     addendum's warning is honoured in the ticket report: the FIRST-APPLY branch is proven
--     separately, inside a rolled-back transaction that restores the pre-images and runs this
--     prestate verbatim, because CLARA_MIGRATION_REDO can only ever exercise the redo branch.
-- =====================================================================================
do $w946_pre$
declare v_sha text; v_code text; v_def text; v_n int; v_raw_n int; r record;
begin
  -- 1 · THE READING HALF MUST BE LIVE. #946 consumes #945's banked fact state; without it there
  --     is nothing to draft from and every cell below would be vacuous.
  if to_regprocedure('clara.evaluate_payroll_run_state_v1(jsonb,jsonb)') is null
     or to_regprocedure('clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)') is null then
    raise exception '#946 prestate: the payroll READING lane (0296) is absent -- 0296 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)'::regprocedure;
  if v_sha is distinct from '0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd' then
    raise exception '#946 prestate: clara.evaluate_payroll_run_state_v1 has MOVED (sha %) -- this file drafts from its output shape and a changed formula is a _v2, never an edit', v_sha
      using errcode = 'CLR10';
  end if;

  -- 2 · THE PERSIST DOOR, BIMODAL: its 0296 pre-image, or a body already carrying this file's
  --     own call (a redo).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), p.prosrc into v_sha, v_code from pg_proc p
   where p.oid = 'clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)'::regprocedure;
  if position('_post_payroll_run' in v_code) = 0
     and v_sha is distinct from '85a708a386743ccdf0e3f6763de4a9fe14f793ffdca0e275c637c0cb23d6d83e' then
    raise exception '#946 prestate: clara.persist_payroll_facts is neither at its pinned 0296 pre-image (measured %) nor already carrying this file''s post call -- re-derive this recut against the LIVE body before applying', v_sha
      using errcode = 'CLR10';
  end if;

  -- 3 · THE QUEUE, BIMODAL, same shape. The splice in §H reads the INSTALLED definition, so the
  --     pin exists to prove the anchors this file was authored against are the live ones.
  if to_regprocedure('clara.list_review_queue(jsonb,jsonb,integer)') is null then
    raise exception '#946 prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), p.prosrc into v_sha, v_code from pg_proc p
   where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  if position('payroll_posting_blocked' in v_code) = 0
     and v_sha is distinct from 'f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69' then
    raise exception '#946 prestate: clara.list_review_queue has DRIFTED from its pinned pre-image (measured %) and does not already carry this file''s row kind -- re-derive the splice against the LIVE body', v_sha
      using errcode = 'CLR10';
  end if;

  -- 4 · THE NEIGHBOURS THIS FILE RELIES ON AND MUST NOT MOVE (house practice: a prestate pins the
  --     bodies it recuts AND the ones it leans on, so a later lane that recuts one collides here
  --     rather than silently changing what this lane posts).
  for r in select * from (values
      ('clara._document_posting_entry(uuid,uuid)',
       '8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0'),
      ('clara._validate_entry_lines(uuid,jsonb)',
       '37b03159a535770d6d7053aa826270703fcafa86f3864e9e344fe5bb886d3c71'),
      ('clara._is_codeable_kind(text)',
       '0c0780e3dc7d52affc84f2ded39b28fe8a1af7f5024a6ac813fa932210d40b28')
      ) as t(sig, want) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
     where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.want then
      raise exception '#946 prestate: % has MOVED (measured %, expected %) -- this file leans on it unchanged', r.sig, v_sha, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 5 · THE SALARIES-PAYABLE ROW IS ALREADY ON THE PUBLISHED STANDARD CHART (AC1, satisfied by
  --     0295). STRUCTURAL, not a count: this file inserts no chart row, so what it needs to be
  --     true is that the row it consumes EXISTS, as an ordinary liability with no class.
  if not exists (
    select 1 from clara.coa_template_accounts a
     join clara.coa_templates t on t.id = a.template_id
    where t.template_key = 'my_sme_starter' and t.scope = 'platform' and t.state = 'published'
      and a.account_code = '2040' and a.name = 'Salaries Payable'
      and a.account_type = 'liability' and a.account_class is null) then
    raise exception '#946 prestate: `2040 Salaries Payable` is not on the published my_sme_starter chart as an ordinary liability with no class -- 0295 must apply first (this file appends NO chart row)'
      using errcode = 'CLR10';
  end if;

  -- 6 · A PAYROLL SUMMARY IS A CODEABLE KIND. The whole of AC6 rests on it: the filing's own
  --     `uncoded_filing` row exists BECAUSE the kind is codeable, and it clears when this file's
  --     entry appears on the filing. If the kind were ever ruled un-codeable, AC6 would be
  --     vacuous rather than satisfied, and that must fail loudly here.
  if clara._is_codeable_kind('payroll_summary') is not true then
    raise exception '#946 prestate: payroll_summary is not a codeable kind -- the uncoded_filing lane this ticket clears does not exist for it'
      using errcode = 'CLR10';
  end if;

  -- 7 · THE RECEIPT WALL IS LIVE AND STILL SHAPED AS THIS FILE EXPECTS. An agent-approved entry
  --     owes EXACTLY ONE receipt (clara._tf_assert_agent_post_receipt); §E writes the
  --     document-shaped one, and §G widens the lane vocabulary it is allowed to name.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'clara.journal_entries'::regclass
                    and tgname = 't_je_agent_post_receipt') then
    raise exception '#946 prestate: t_je_agent_post_receipt is absent -- the post receipt this file writes has no wall to satisfy'
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.entry_post_receipts'::regclass
     and conname = 'entry_post_receipts_via_wake_kind_check';
  if v_def is null then
    raise exception '#946 prestate: entry_post_receipts_via_wake_kind_check is absent' using errcode = 'CLR10';
  end if;
  if position('payroll_facts' in v_def) = 0
     and v_def is distinct from 'CHECK ((via_wake_kind = ANY (ARRAY[''autodraft''::text, ''interactive''::text, ''bank_agent''::text])))' then
    raise exception '#946 prestate: entry_post_receipts_via_wake_kind_check is neither at its pinned pre-image nor already widened by this file (live: %)', v_def
      using errcode = 'CLR10';
  end if;

  raise notice '#946 prestate: OK -- 0296''s evaluator is at its pinned sha, persist_payroll_facts and list_review_queue are each at a pinned pre-image (or already carry this file''s own marker), the three leaned-on neighbours are unmoved, `2040 Salaries Payable` is already on the published standard chart (0295), payroll_summary is codeable, and the agent-post receipt wall is live.';
end
$w946_pre$;

-- =====================================================================================
-- §B  THE MONTH PARSER -- clara._payroll_period_month(text) returns date.
--
--     "The entry is dated at the end of the payslip's own month, not the day it was uploaded. A
--     month Clara cannot establish is asked, never assumed." (the brief). This body is the
--     "establish" half: it turns the VERBATIM rendering the page printed into the first day of a
--     month, or returns NULL -- which §D turns into a named refusal and §H turns into a Needs-you
--     row. It never guesses.
--
--     WHY IT PARSES AT ALL, rather than demanding ISO. #945's frozen prompt asks the model to
--     quote the period AS PRINTED ("'August 2026', '08/2026', '2026-08' -- whatever the page
--     says"), which is the never-infer-never-compute rule applied to a date. Something has to
--     read that rendering, and it must be this side of the boundary: a model that normalised the
--     month would be computing.
--
--     THE ADMITTED RENDERINGS ARE A CLOSED SET, and every one of them is UNAMBIGUOUS:
--       2026-08, 2026/08          year first, because the 4-digit group is first
--       08/2026, 08-2026          month first, because the 4-digit group is last
--       2026-08-31                a full ISO date inside the month -> that month
--       August 2026, Aug 2026     an English month name with a year, either order
--       2026 August
--     DELIBERATELY REFUSED: any all-numeric triple (31/08/2026 vs 08/31/2026 cannot be told
--     apart, and a payroll month read the wrong way round is a whole period in the wrong place),
--     a bare year, a bare month name, a quarter, and a range. Each of those returns NULL and the
--     run is ASKED rather than posted.
--
--     LOCALE-FREE BY CONSTRUCTION: the twelve month names are this body's own array, never
--     `to_date(..., 'Month YYYY')`, whose behaviour would otherwise depend on the session.
--     That is also what makes the function honestly IMMUTABLE.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._payroll_period_month(p_raw text) returns date
  language plpgsql immutable set search_path = pg_catalog, pg_temp as $ppm$
declare
  v_s text; v_a text; v_b text; v_y int; v_m int; v_name text;
  v_months text[] := array['january','february','march','april','may','june',
                           'july','august','september','october','november','december'];
  v_i int;
begin
  v_s := btrim(coalesce(p_raw, ''));
  if v_s = '' then return null; end if;
  -- One space between tokens, so 'August   2026' and 'August 2026' are one rendering.
  v_s := regexp_replace(v_s, '\s+', ' ', 'g');

  -- A full ISO date inside the month. Checked FIRST: it is the only numeric shape with three
  -- groups this body admits, and admitting it before the two-group shapes keeps those regexes
  -- anchored and simple.
  if v_s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      return date_trunc('month', v_s::date)::date;
    exception when others then
      return null;   -- '2026-02-31' is a rendering, not a date
    end;
  end if;

  -- Two numeric groups. Which is the year is decided by DIGIT COUNT, never by position alone.
  if v_s ~ '^[0-9]{4}[-/ ][0-9]{1,2}$' then
    v_y := (regexp_replace(v_s, '^([0-9]{4}).*$', '\1'))::int;
    v_m := (regexp_replace(v_s, '^[0-9]{4}[-/ ]0*([0-9]{1,2})$', '\1'))::int;
  elsif v_s ~ '^[0-9]{1,2}[-/ ][0-9]{4}$' then
    v_m := (regexp_replace(v_s, '^0*([0-9]{1,2})[-/ ][0-9]{4}$', '\1'))::int;
    v_y := (regexp_replace(v_s, '^[0-9]{1,2}[-/ ]([0-9]{4})$', '\1'))::int;
  -- A month NAME with a year, in either order. Punctuation between them is tolerated because a
  -- page prints 'August, 2026' as readily as 'August 2026'.
  elsif v_s ~* '^[A-Za-z]{3,9}[ ,/-]+[0-9]{4}$' then
    v_a := lower(regexp_replace(v_s, '^([A-Za-z]{3,9})[ ,/-]+[0-9]{4}$', '\1'));
    v_y := (regexp_replace(v_s, '^[A-Za-z]{3,9}[ ,/-]+([0-9]{4})$', '\1'))::int;
    v_name := v_a;
  elsif v_s ~* '^[0-9]{4}[ ,/-]+[A-Za-z]{3,9}$' then
    v_y := (regexp_replace(v_s, '^([0-9]{4})[ ,/-]+[A-Za-z]{3,9}$', '\1'))::int;
    v_b := lower(regexp_replace(v_s, '^[0-9]{4}[ ,/-]+([A-Za-z]{3,9})$', '\1'));
    v_name := v_b;
  else
    return null;
  end if;

  if v_name is not null then
    v_m := null;
    for v_i in 1 .. 12 loop
      -- A three-letter prefix is the only abbreviation admitted, and it must be a prefix of the
      -- month it names: 'jun'/'june' resolve, 'ju' and 'junio' do not.
      if v_name = v_months[v_i] or (length(v_name) = 3 and v_name = left(v_months[v_i], 3)) then
        v_m := v_i;
      end if;
    end loop;
    if v_m is null then return null; end if;
  end if;

  if v_m is null or v_m < 1 or v_m > 12 then return null; end if;
  if v_y is null or v_y < 1900 or v_y > 2999 then return null; end if;
  return make_date(v_y, v_m, 1);
end $ppm$;

revoke all on function clara._payroll_period_month(text) from public;

comment on function clara._payroll_period_month(text) is
  '#946: the payslip month, established from the rendering the page printed. A closed set of unambiguous renderings (ISO year-month either separator, month-year, a full ISO date inside the month, and an English month name with a year in either order); everything else -- in particular any all-numeric triple, which cannot be told apart from its own reversal -- returns NULL so the run is ASKED rather than posted on a guess. Locale-free: the twelve month names are this body''s own array, which is also what makes it honestly IMMUTABLE. Ungranted: reached only from clara._payroll_entry_plan.';

reset role;

-- =====================================================================================
-- §C  THE DRAFTING BODY (AC2) -- clara._payroll_entry_plan(uuid, jsonb) returns jsonb.
--
--     An ESTABLISHED payroll fact state in; the entry the brief describes out. It takes the
--     state rather than a document deliberately: the state is 0296's own output and the plan is
--     a pure function of it plus this client's chart, so the arithmetic can be driven and proved
--     without a document, a filing or a task in the way.
--
--     WHAT "ESTABLISHED" MEANS HERE, AND WHY IT IS THE EVALUATOR'S WORD, NOT THIS FILE'S. 0296's
--     evaluator classifies every one of the eleven run-level questions as `established` (both
--     channels agree on a readable figure the page printed, and every cross-check it could run
--     passed), `not_printed` (the page does not print it), or anything else (they disagree, a
--     printed total contradicts the row sum, a row does not balance, a rendering is not a
--     figure). THIS BODY DRAFTS FROM `established` ALONE.
--
--     In particular it does NOT reach for `computed_cents` -- the row sum the evaluator offers
--     when the page prints employee rows but no totals row. That is a deliberate narrowing and
--     it is recorded as such: the evaluator's own verdict for such a run is `not_printed`, and a
--     posting body that re-judged its verdict from outside its frozen closure would be doing
--     exactly what the freeze exists to prevent. Such a run does not post; it appears under
--     Needs you naming `run_totals_not_printed`, and whether the owner wants a row sum admitted
--     as a posting basis is a product question this ticket does not answer for them.
--
--     AN UNPRINTED LINE PRODUCES NO LEG. `not_printed` contributes nothing at all -- no zero
--     leg, no zero-cent line -- because a line the page does not print is not a figure of zero,
--     and an entry carrying a 0.00 HRDF leg would assert a levy the document never mentioned.
--     Where a payable has two sides (EPF, SOCSO, EIS) and only one is printed, the credit is the
--     printed side alone and the leg''s `basis` names only the fact it actually came from.
--
--     THE EMPLOYEE PORTIONS ARE NEVER DEBITED. They reduce the net-pay credit (they are already
--     inside the gross debit) and ride the payable credits. This is asserted arithmetically
--     rather than by inspection: the plan balances ONLY because
--     gross - (epf_ee + socso_ee + eis_ee + pcb) = net, which is 0296''s own row identity at run
--     level. An implementation that expensed them twice could not balance.
--
--     EXACT BALANCE, NEVER ROUNDED. clara._validate_entry_lines tolerates a residual of up to 5
--     cents and books it to the rounding account. This body refuses instead: a payroll entry
--     whose debits and credits differ AT ALL is a payroll run whose arithmetic did not hold, and
--     smoothing it into the rounding account would hide exactly the defect the gate exists to
--     catch.
--
--     ACCOUNTS ARE RESOLVED BY CODE IN THIS CLIENT''S OWN CHART, and each leg carries the NAME it
--     resolved to. By code, because clara.coa_accounts is keyed (client_id, account_code) and a
--     firm may rename its own accounts; the resolved name travels with the leg so a reader can
--     see WHICH account in this client''s chart the code found. A code the client does not hold
--     (or holds inactive) is a NAMED refusal carrying the code -- never a silent substitution
--     and never an account this lane creates.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._payroll_entry_plan(p_client uuid, p_state jsonb)
  returns jsonb language plpgsql stable
  set search_path = clara, pg_temp as $pep$
declare
  -- THE LEG ROSTER, in the brief's own order: the gross, each employer contribution the document
  -- prints, then every statutory payable, then the net. `a` is the account code, `side` the
  -- direction, `f1`/`f2` the run-level questions whose printed figures make the amount.
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
begin
  if p_state is null or p_state->>'state_version' is distinct from 'v1' then
    return jsonb_build_object('plan_version','v1','ready',false,'legs','[]'::jsonb,
      'debit_cents',0,'credit_cents',0,'unprinted','[]'::jsonb,'missing_accounts','[]'::jsonb,
      'refusals', jsonb_build_array(jsonb_build_object('reason','state_unreadable',
        'detail', jsonb_build_object('state_version', p_state->>'state_version'))));
  end if;

  -- 1 · THE MONTH. Established from the rendering the page printed, never from today's date and
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

  -- 2 · THE TWO QUESTIONS WITHOUT WHICH THERE IS NO ENTRY. A run whose gross or whose net the
  --     page does not print (the summary-only page with no totals row, above) has nothing this
  --     body can honestly post.
  foreach v_f in array array['payroll.run.gross_pay','payroll.run.net_pay'] loop
    if (p_state->'facts'->v_f->>'state') is distinct from 'established' then
      v_refusals := v_refusals || jsonb_build_object('reason','run_totals_not_printed',
        'detail', jsonb_build_object('field', v_f,
          'field_state', p_state->'facts'->v_f->>'state',
          'field_reason', p_state->'facts'->v_f->>'reason'));
    end if;
  end loop;

  -- 3 · THE LEGS.
  for r in select (t.x->>'a') acc, (t.x->>'side') side, (t.x->>'f1') f1, (t.x->>'f2') f2,
                  (t.x->>'d') d, t.ord
             from jsonb_array_elements(v_spec) with ordinality as t(x, ord)
            order by t.ord loop
    v_c1 := case when (p_state->'facts'->r.f1->>'state') = 'established'
                 then nullif(p_state->'facts'->r.f1->>'printed_cents','')::bigint end;
    v_c2 := case when r.f2 is not null and (p_state->'facts'->r.f2->>'state') = 'established'
                 then nullif(p_state->'facts'->r.f2->>'printed_cents','')::bigint end;
    v_cents := coalesce(v_c1,0) + coalesce(v_c2,0);
    v_basis := concat_ws('+', case when v_c1 is not null then r.f1 end,
                              case when v_c2 is not null then r.f2 end);

    -- WHAT THE PAGE WAS SILENT ABOUT, recorded by QUESTION rather than by leg and DISTINCT: the
    -- levy is read by two legs (its expense and its payable) and the two paired payables read two
    -- questions each, so a per-leg list would both repeat itself and lose the employer side of a
    -- pair whose employee side printed. A question the page printed as 0.00 belongs here too --
    -- the plan drew no figure from it either way.
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

  -- 4 · EXACT BALANCE. Checked only when nothing above already refused, so a missing account
  --     reports itself as a missing account rather than as an imbalance it caused.
  if jsonb_array_length(v_refusals) = 0 and v_dr <> v_cr then
    v_refusals := v_refusals || jsonb_build_object('reason','entry_unbalanced',
      'detail', jsonb_build_object('debit_cents', v_dr, 'credit_cents', v_cr,
        'difference_cents', v_dr - v_cr));
  end if;

  return jsonb_build_object(
    'plan_version','v1',
    'period_raw', to_jsonb(v_period_raw),
    'period_month', to_jsonb(v_month),
    'posting_date', to_jsonb(v_posting),
    'legs', v_legs,
    'debit_cents', v_dr,
    'credit_cents', v_cr,
    'unprinted', to_jsonb(v_unprinted),
    'missing_accounts', to_jsonb(v_missing),
    'refusals', v_refusals,
    'ready', jsonb_array_length(v_refusals) = 0);
end $pep$;

revoke all on function clara._payroll_entry_plan(uuid, jsonb) from public;

comment on function clara._payroll_entry_plan(uuid, jsonb) is
  '#946: THE DRAFTING BODY. An established payroll fact state (0296''s evaluator output) plus this client''s own chart in; the payroll entry out -- the gross debited to salaries and wages, each employer contribution the document prints debited to its own employment-cost account, every statutory deduction (employee and employer portions together) credited to its own payable, and the net credited to salaries payable. It drafts from `established` facts ALONE, gives an unprinted line no leg at all, resolves every account by code in the client''s chart and carries the name it resolved, and requires EXACT balance rather than the rounding tolerance clara._validate_entry_lines allows. Every failure is a named refusal in `refusals`; it writes nothing. Ungranted: reached from clara._payroll_posting_verdict.';

reset role;

-- =====================================================================================
-- §D  THE UNATTENDED GATE (AC3) -- clara._payroll_posting_verdict(uuid) returns jsonb.
--
--     "It posts unattended only when every condition holds: both reading channels agree, every
--     arithmetic check passes, every account resolves in this client's own chart, the payslip's
--     own month is established, and no payroll entry for that client and month is already
--     posted. When any condition fails the run does not post; it appears under Needs you naming
--     the condition that failed" (the brief).
--
--     THE SHAPE IS THE INVOICE LANE'S, AND THAT IS DELIBERATE (see the header). Three properties
--     are copied from clara._agent_post_entry_core rather than re-invented:
--       (1) A CLOSED RUNG ROSTER, walked in order, with EVERY rung carrying an explicit verdict.
--           The roster is the array below and nothing else; a rung whose key were missing from
--           the vector would be a gate that fails OPEN, which is the D26 defect the invoice lane
--           found the hard way and which its own comment records.
--       (2) THE FIRST FAILING RUNG IS THE REASON. A person is told the condition that stopped
--           the post, not a list -- but the whole vector travels beside it so a reviewer can see
--           everything that was evaluated.
--       (3) THE GATE WRITES NOTHING. It is STABLE: no receipt, no marker, no refusal row. A
--           blocked run is visible because §H DERIVES its Needs-you row from this same body, so
--           the row clears itself the moment the block does -- no dismissal mechanism, nothing
--           stored, nothing to reconcile.
--
--     ONE BODY, TWO READERS. §E (the post) and §H (the queue) both call this, so the sentence a
--     person reads under Needs you and the decision the lane acted on cannot drift apart. That
--     is the whole reason the gate is a function rather than a branch inside the poster.
--
--     WHICH READING IT JUDGES: the NEWEST payroll pair banked for the document
--     (`engine_kind='payroll_text_facts'`, highest `version_n`). A re-extraction mints a new
--     version, and the live reading is the one the lane is asked about.
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
  -- the brief's own conditions; `entry_balances` is a belt that cannot fail once the arithmetic
  -- rung passed, and is evaluated anyway because a gate that assumes its own invariants is a
  -- gate that stops checking them.
  v_rungs text[] := array['filed','facts_read','channels_agree','arithmetic_holds',
                          'period_established','run_totals_printed','accounts_resolve',
                          'entry_balances'];
  v_tokens jsonb := jsonb_build_object(
    'filed','not_filed', 'facts_read','payroll_not_read',
    'channels_agree','channels_disagree', 'arithmetic_holds','arithmetic_failed',
    'period_established','period_not_established', 'run_totals_printed','run_totals_not_printed',
    'accounts_resolve','account_missing', 'entry_balances','entry_unbalanced');
  v_vector jsonb := '{}'::jsonb;
  v_detail jsonb := '{}'::jsonb;
  v_first text; v_rung text;
  f record;
  v_filing uuid; v_client uuid; v_firm uuid; v_sha text;
  v_extraction uuid; v_state jsonb; v_plan jsonb := null;
  v_disagree text[] := '{}'; v_arith text[] := '{}';
  v_contested jsonb; v_unbal jsonb; v_unchk jsonb;
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

    -- 5-8 · THE DRAFTING BODY ANSWERS THE REST. The month, the run totals, the chart and the
    --       balance are exactly what §C already decides, so they are read off its refusals
    --       rather than re-decided here -- one body per question, never two.
    v_plan := clara._payroll_entry_plan(v_client, v_state);
    foreach v_rung in array array['period_established','run_totals_printed','accounts_resolve','entry_balances'] loop
      if exists (select 1 from jsonb_array_elements(v_plan->'refusals') x
                  where x->>'reason' = v_tokens->>v_rung) then
        v_vector := v_vector || jsonb_build_object(v_rung, v_tokens->>v_rung);
      else
        v_vector := v_vector || jsonb_build_object(v_rung, 'pass');
      end if;
    end loop;
    v_detail := v_detail || jsonb_build_object(
      'missing_accounts', coalesce(v_plan->'missing_accounts','[]'::jsonb),
      'plan_refusals', coalesce(v_plan->'refusals','[]'::jsonb));
  else
    -- Nothing was read, so nothing downstream of it was evaluated. Every rung still carries an
    -- explicit verdict: `not_evaluated` is a verdict, an absent key is a hole.
    foreach v_rung in array array['channels_agree','arithmetic_holds','period_established',
                                  'run_totals_printed','accounts_resolve','entry_balances'] loop
      v_vector := v_vector || jsonb_build_object(v_rung, 'not_evaluated');
    end loop;
  end if;

  -- THE FIRST FAILING RUNG IS THE REASON. Walked over the CLOSED roster, so a rung whose key the
  -- vector somehow lacks reads as a failure rather than as a pass.
  v_first := null;
  foreach v_rung in array v_rungs loop
    if v_first is null and coalesce(v_vector->>v_rung,'') <> 'pass' then v_first := v_rung; end if;
  end loop;

  select d.sha256 into v_sha from clara.documents d where d.id = p_document;

  return jsonb_build_object(
    'verdict', case when v_first is null then 'ready' else 'blocked' end,
    'rung', to_jsonb(v_first),
    'reason', to_jsonb(case when v_first is null then null else v_tokens->>v_first end),
    'rung_vector', v_vector,
    'detail', v_detail,
    'document_id', p_document,
    'client_id', to_jsonb(v_client),
    'firm_id', to_jsonb(v_firm),
    'filing_id', to_jsonb(v_filing),
    'source_doc_sha256', to_jsonb(v_sha),
    'extraction_id', to_jsonb(v_extraction),
    'period_month', coalesce(v_plan->'period_month','null'::jsonb),
    'posting_date', coalesce(v_plan->'posting_date','null'::jsonb),
    'plan', coalesce(v_plan,'null'::jsonb));
end $ppv$;

revoke all on function clara._payroll_posting_verdict(uuid) from public;

comment on function clara._payroll_posting_verdict(uuid) is
  '#946: THE UNATTENDED GATE for a payroll summary -- the closed rung roster the brief names, walked in order, every rung carrying an explicit verdict and the FIRST failure being the reason a person is told. It WRITES NOTHING (STABLE): clara._post_payroll_run acts on it and clara.list_review_queue DERIVES its payroll_posting_blocked row from it, so the decision the lane took and the sentence a person reads are the same body and cannot drift. Judges the NEWEST payroll pair banked for the document. Ungranted: reached from those two callers alone.';

reset role;
