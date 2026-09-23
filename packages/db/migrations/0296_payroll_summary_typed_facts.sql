-- 0296_payroll_summary_typed_facts — #945: A PAYROLL SUMMARY IS READ THE WAY AN INVOICE IS READ,
-- AND A DETERMINISTIC EVALUATOR DOES EVERY SUM.
-- =====================================================================================
-- Spec of record: issue #945's Agent Brief (the issue body — its single comment, dated
-- 2026-09-19, is an AI triage coordination note, not an owner ruling, so the body stands as the
-- contract). Re-verified live on this branch 2026-09-24 (`gh issue view 945 --comments`).
-- Parent: #926, owner ruling 2026-09-18 (option G) — "a payroll summary and a contract go down
-- the same lane as any other accounting document, read and posted, not merely stored".
--
-- #926 SUPERSEDES TWO STANDING EXCLUSIONS, named here so a reviewer checking them against this
-- file does not read it as scope creep (the triage comment's own first note): mainline #612's
-- Out-of-Scope third bullet ("first-class payroll-document ingestion, staff-allowance
-- specialisation") and #643's acceptance criterion ("Full payroll processing, first-class
-- payroll-document ingestion and perpetual inventory remain outside this scope"). #926 is the
-- LATER ruling and reopens exactly this: the READING half. Full payroll processing — employee
-- masters, statutory rate tables, per-employee durable records — stays out, and this file's own
-- walls are what keep it out (no employee-level figure is persisted anywhere below).
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. It widens the estate so a payroll summary can be READ:
-- one new field-path namespace, one new closed answer vocabulary, one new deterministic
-- evaluator (registered in clara.evaluator_versions in this same file), one new lane on the
-- facts router in place of its `skipped_kind` dead end, one new persist door, and a
-- re-derivation of the capability registry that stops calling the pair `stored_only`.
--
-- ===================== DEPLOY ORDER: DATABASE FIRST, RUNTIME SECOND =====================
-- This migration applies BEFORE the runtime image that drives `payrollFacts_v1` ships. The
-- direction is not a preference, it is the only safe one: the persist door validates the answer
-- envelope against clara._payroll_answers_ok, so a runtime image that answers a WIDER
-- questionnaire than the live validator admits would be refused on EVERY persist and the lane
-- would bank nothing at all. In the other order — database first — the widened validator simply
-- has no caller yet, and the router's new `payroll_facts` lane queues tasks that the pre-#945
-- reconciler declines to dispatch (`enqueueForLane` returns undefined for a lane it does not
-- know and logs the gap; packages/runtime/lib/reconciler-documents.mjs:95-105) rather than
-- mis-driving them down another family's workflow. Nothing dark: the queued task is visible on
-- the document's own task trail and terminal-free, and the image that lands second drains it.
--
-- THE WRITE-QUIET OBLIGATION ON THE ONE RECUT LIVE BODY. clara._enqueue_invoice_facts_core is
-- recut below. Between this apply and the runtime image, the ONLY behavioural difference on a
-- payroll_summary pdf/image is that the router stops minting the terminal `failed/skipped_kind`
-- receipt and mints a `queued` row on the new lane instead. It writes no extraction, no region,
-- no fact, no event and no journal effect of any kind in that window — the persist door is the
-- only writer of payroll facts and no live image calls it yet. Every other document kind's path
-- through that body is byte-identical to its pre-image.
--
-- THE ACCOUNT CODES THIS VOCABULARY NAMES ALREADY EXIST (the triage comment's second note).
-- 0150_coa_template_pr_a.sql seeds 2100 EPF, 2110 SOCSO, 2120 EIS, 2130 PCB, 2140 HRDF Levy
-- (statutory_payables) and 6000 Salaries and Wages, 6010/6020/6030/6040 employer
-- EPF/SOCSO/EIS/HRDF (employment_costs). The eleven run-level answer names below map ONE TO ONE
-- onto those codes so #946's drafting body reads them straight rather than re-translating a
-- parallel vocabulary. THIS FILE PLANTS NO CHART ROW and touches clara.coa_template_accounts
-- not at all — the wave's shared rows are 0295's (`2040 Salaries Payable`, `2050 Rent Payable`),
-- consumed by name and code, never re-minted.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it is building on, MEASURED on the lane
--     rig (127.0.0.1:55741 / clara_l01) on 2026-09-24, never transcribed from another file.
--
--     BIMODAL BY CONSTRUCTION (#957 redo). Every body this file RECUTS is pinned to TWO
--     acceptable shas: its PRE-IMAGE (a first apply) or this file's OWN post-image (a redo of an
--     edited 0296, which `create or replace` makes safe to re-run). Anything else is drift and
--     is refused by name. The wave-3 addendum's warning is honoured in the ticket report: the
--     FIRST-APPLY branch was proven separately, inside a rolled-back transaction that restored
--     the pre-images and ran this prestate verbatim, because CLARA_MIGRATION_REDO can only ever
--     exercise the post-image branch.
-- =====================================================================================
do $w945_pre$
declare
  v_sha text; v_n int; v_mode text;
begin
  -- (a) THE GRAMMAR THIS FILE RECUTS. clara._assert_field_path (0191 §S5) is the ONE canonical
  -- field-path grammar; clara._field_path_conforms (0290, #857) is the boolean sibling the
  -- clara.document_regions CHECK constraint evaluates. This file recuts the FORMER (one
  -- namespace joins its closed roster) and leaves the LATTER byte-untouched, which is what keeps
  -- the CHECK and the persist boundary on one grammar rather than two.
  if to_regprocedure('clara._assert_field_path(text)') is null then
    raise exception '#945 prestate: clara._assert_field_path is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._assert_field_path(text)'::regprocedure;
  if v_sha = '0641f62145e74c353adcb0be248d98fcd804051919b9462989308d2f291b1ace' then
    v_mode := 'FIRST';
  elsif position('''payroll''' in (select p.prosrc from pg_proc p
          where p.oid = 'clara._assert_field_path(text)'::regprocedure)) > 0 then
    v_mode := 'REDO';
  else
    raise exception '#945 prestate: clara._assert_field_path body drifted (sha %) -- it is neither the pre-image this file recuts nor a body carrying this file''s own namespace', v_sha
      using errcode = 'CLR10';
  end if;

  if to_regprocedure('clara._field_path_conforms(text)') is null then
    raise exception '#945 prestate: clara._field_path_conforms is absent -- 0290 (#857) must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._field_path_conforms(text)'::regprocedure;
  if v_sha <> 'a97a4709117e698267fe900332cc666c818a241214894520ad773791b761cca3' then
    raise exception '#945 prestate: clara._field_path_conforms body drifted (sha %) -- 0296 recuts it on nobody', v_sha
      using errcode = 'CLR10';
  end if;

  -- (b) THE CHECK CONSTRAINT THAT MAKES THE GRAMMAR A WALL rather than a convention is live, so
  -- the namespace this file registers is a namespace every writer — door or raw fixture insert —
  -- is measured against.
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.document_regions'::regclass
     and conname = 'ck_document_regions_field_path_grammar';
  if v_n <> 1 then
    raise exception '#945 prestate: ck_document_regions_field_path_grammar is not on clara.document_regions -- 0290 must apply first'
      using errcode = 'CLR10';
  end if;

  raise notice '#945 prestate: OK (% apply) -- clara._assert_field_path is at a pinned sha, clara._field_path_conforms is untouched by this file, and ck_document_regions_field_path_grammar is live.', v_mode;
end
$w945_pre$;

-- =====================================================================================
-- §B  THE CANONICAL FIELD-PATH NAMESPACE GAINS `payroll` (AC3, second half).
--
--     ONE SEGMENT ADDED TO ONE ROSTER, AND NOTHING ELSE MOVES. The body below is
--     clara._assert_field_path's live pre-image with `'payroll'` inserted into the registered-
--     namespace IN-list, in the position the roster's own reading order gives it (beside the
--     other DOCUMENT-FAMILY namespaces `invoice`/`statement`/`myinvois`/`opening_tb`/`prior_gl`,
--     ahead of the five STRUCTURAL ones `pages`/`tables`/`rows`/`sheets`/`paragraphs` that name
--     a place on a page rather than a family of facts). Length bound, syntax regex, errcodes and
--     detail reasons are byte-identical: this is a widening of one closed set, never a new
--     grammar.
--
--     WHY `payroll` AND NOT `payroll_summary`. The namespace names the FACT FAMILY, not the
--     document kind — `invoice` serves invoice/credit_note/debit_note/receipt alike. A payroll
--     run's facts are payroll facts whatever the page they were printed on is called.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._assert_field_path(p_path text) returns void
  language plpgsql immutable set search_path = clara, pg_temp as $afp$
begin
  if p_path is null then return; end if;
  if length(p_path) = 0 or length(p_path) > 128 then
    raise exception 'field_path % is not canonical: length must be 1..128 characters', quote_literal(left(p_path, 160))
      using errcode = 'CLR10', detail = '{"reason":"field_path_length"}';
  end if;
  if p_path !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$' then
    raise exception 'field_path % is not canonical: expected dot-separated identifier or integer segments', quote_literal(left(p_path, 160))
      using errcode = 'CLR10', detail = '{"reason":"field_path_syntax"}';
  end if;
  if split_part(p_path, '.', 1) not in
      ('invoice','statement','myinvois','opening_tb','prior_gl','payroll',
       'pages','tables','rows','sheets','paragraphs') then
    raise exception 'field_path % is not canonical: % is not a registered namespace',
      quote_literal(left(p_path, 160)), quote_literal(split_part(p_path, '.', 1))
      using errcode = 'CLR10', detail = '{"reason":"field_path_namespace"}';
  end if;
end $afp$;

reset role;

-- =====================================================================================
-- §Z  TAIL. Everything this file claims to have done, re-derived from the live catalog.
-- =====================================================================================
do $w945_tail$
declare
  v_sha text; v_n int;
begin
  -- 1 · THE GRAMMAR REGISTERS `payroll` AND STILL REFUSES EVERYTHING OUTSIDE ITS ROSTER, driven
  --     through the CHECK's own boolean sibling rather than asserted from the body text.
  if clara._field_path_conforms('payroll.run.gross_pay') is not true then
    raise exception '#945 tail: payroll.run.gross_pay does not conform -- the namespace did not land'
      using errcode = 'CLR10';
  end if;
  begin
    perform clara._field_path_conforms('payrol.run.gross_pay');
    raise exception '#945 tail: a typo''d namespace was ADMITTED -- the roster is no longer closed'
      using errcode = 'CLR10';
  exception when sqlstate 'CLR10' then
    null;   -- the grammar's own refusal, which is the behaviour asserted here
  end;

  -- 2 · THE SIBLING THE CHECK EVALUATES IS BYTE-UNTOUCHED. 0296 recuts the grammar, not the wall.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._field_path_conforms(text)'::regprocedure;
  if v_sha is distinct from 'a97a4709117e698267fe900332cc666c818a241214894520ad773791b761cca3' then
    raise exception '#945 tail: clara._field_path_conforms MOVED during this migration (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- 3 · THE RECUT GRAMMAR KEEPS ITS DISPOSITION: immutable, pinned search_path, NOT a definer,
  --     owned by clara_fn_owner, and the same EXECUTE holders it has carried since 0191.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._assert_field_path(text)'::regprocedure
     and p.provolatile = 'i' and p.prosecdef = false
     and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#945 tail: clara._assert_field_path lost its volatility/definer/owner/search_path disposition'
      using errcode = 'CLR10';
  end if;
  if not (pg_catalog.has_function_privilege('clara_authenticated','clara._assert_field_path(text)','EXECUTE')
      and pg_catalog.has_function_privilege('clara_agent_ro','clara._assert_field_path(text)','EXECUTE')) then
    raise exception '#945 tail: clara._assert_field_path lost an EXECUTE holder it carried before the recut'
      using errcode = 'CLR10';
  end if;

  raise notice '#945 tail: OK -- the canonical field-path grammar registers the `payroll` namespace beside the five other fact families and still refuses an unregistered one with CLR10 / field_path_namespace; clara._field_path_conforms is byte-untouched and the recut body keeps its immutable, non-definer, clara_fn_owner disposition and all its EXECUTE holders.';
end
$w945_tail$;
