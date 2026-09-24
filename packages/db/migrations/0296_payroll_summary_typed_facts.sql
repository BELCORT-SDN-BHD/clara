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
  v_sha text; v_n int; v_mode text; v_marked boolean; v_row record;
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

  -- (c) THE FIVE LIVE ROUTER-SIDE BODIES §E RECUTS, each pinned to its PRE-IMAGE sha measured on
  -- this rig. The REDO branch is recognised by the marker every one of them gains — the literal
  -- lane name `payroll_facts` — because a redo re-runs against this file's own post-image and a
  -- single-sha pin would refuse it. The integrator's list of pins is this block: a later lane
  -- that recuts any of these five will collide here rather than silently downstream.
  for v_row in select * from (values
      ('clara._enqueue_invoice_facts_core(uuid)','42e8b0b44babb5dbf71a9018f4d1004f3a9cba46eeff4e4a7178d43f113c2df2'),
      ('clara.enqueue_invoice_facts(uuid)','7dd035b2dd52424957fbfb71cc349267bc854498881c6979aba56551f67a5a86'),
      ('clara._tf_processing_task_update()','54fd2fc5c94ccbb5abe888b95bef8c72f69a2695daa49e635884a24e633f82f4'),
      ('clara.claim_document_processing_task(uuid,text,boolean)','01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0'),
      ('clara.release_held_document_tasks(integer)','b4bb3dc63901211543a162df08ff6e162779b48b0ff771f8ba4f559d1f95f8dd')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_row.sig) is null then
      raise exception '#945 prestate: % is absent -- the document processing lane must exist before #945 widens it', v_row.sig
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), position('payroll_facts' in p.prosrc) > 0
      into v_sha, v_marked
      from pg_proc p where p.oid = v_row.sig::regprocedure;
    if v_sha <> v_row.sha and not v_marked then
      raise exception '#945 prestate: % body drifted (sha %) -- it is neither the pre-image this file recuts nor a body already carrying this file''s own lane', v_row.sig, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (d) THE LANE IS NOT ALREADY MINTED BY SOMEONE ELSE. Asserted STRUCTURALLY — the lane roster
  -- CHECK must not already admit `payroll_facts` on a first apply — rather than by counting task
  -- rows. The first cut of this clause counted rows, and that was wrong twice over: on a genuine
  -- first apply the count is vacuously zero (the CHECK refuses the lane, so no row can exist),
  -- while on any database that has already run this file it is a claim about DATA that a
  -- rolled-back restore-the-pre-images probe cannot honour. Measured, not reasoned: the probe
  -- (docs/plan/active/riders-2026-09-20/reports/wave4-lane01-ticket945.md names it) refused on 48
  -- task rows the lane's own battery had left. The structural claim says the same thing and can
  -- be proven in both directions.
  if v_mode = 'FIRST' then
    select count(*)::int into v_n from pg_constraint
     where conrelid = 'clara.document_processing_tasks'::regclass
       and conname = 'ck_processing_task_lane_f_a1'
       and position('payroll_facts' in pg_get_constraintdef(oid)) > 0;
    if v_n <> 0 then
      raise exception '#945 prestate: the lane roster already admits payroll_facts on a FIRST apply -- this file would not be its first writer'
        using errcode = 'CLR10';
    end if;
  end if;

  -- (e) THE CAPABILITY REGISTRY, which §G re-derives. It must publish exactly one version today,
  -- and that version must be the 4 this file raises FROM (first apply) or the 5 it raises TO
  -- (redo) — anything else means another file republished between this file's two runs.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#945 prestate: the registry publishes % distinct registry_versions, not one', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n not in (4, 5) then
    raise exception '#945 prestate: the registry publishes version %, not the 4 this file raises from (nor the 5 it raises to on a redo)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and (mime_type = 'application/pdf' or mime_type like 'image/%');
  if v_n <> 6 then
    raise exception '#945 prestate: % payroll_summary pair(s) sit on the router''s pdf/image branch, not the 6 measured on this rig', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#945 prestate: the registry holds % rows, not the 240 measured on this rig -- this file inserts and deletes nothing', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version is distinct from c.registry_version;
  if v_n <> 0 then
    raise exception '#945 prestate: % pair(s) carry a high-water mark that disagrees with the published registry', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#945 prestate: OK (% apply) -- clara._assert_field_path is at a pinned sha, clara._field_path_conforms is untouched by this file, ck_document_regions_field_path_grammar is live, the five router-side bodies are at their pinned pre-images (or already carry this file''s lane), and the capability registry publishes one version across 240 rows with its high-water mark in agreement.', v_mode;
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

-- =====================================================================================
-- §C  THE ANSWER-VOCABULARY GATE (AC3, first half) — clara._payroll_answers_ok(jsonb, text).
--
--     ITS OWN CLOSURE, NOT AN ARM OF THE INVOICE FAMILY'S (AC1's own reason, applied to the DB
--     half). clara._witness_answers_ok's belt is the ELEVEN INVOICE fields and its body is
--     reached from clara.persist_witness_facts, which sits under the F-A1/F-A2 frozen-evaluator
--     regime; widening it would couple the payroll family's shape to another family's frozen
--     files and would make every future payroll wording change a change to the invoice lane's
--     validator. A separate body costs one function and buys two independent vocabularies.
--
--     THE VOCABULARY, AND WHY EACH NAME EXISTS. Eleven RUN-level questions — exactly the fixed
--     list the brief names ("the month, and the totals for gross pay, employee and employer EPF,
--     employee and employer SOCSO, employee and employer EIS, PCB, any HRDF levy, and net pay")
--     — each mapping one-to-one onto a code 0150 already seeds: gross_pay→6000,
--     epf_employee→2100, epf_employer→6010, socso_employee→2110, socso_employer→6020,
--     eis_employee→2120, eis_employer→6030, pcb→2130, hrdf_levy→2140/6040. `period` is the
--     month, and is the one non-monetary answer. Then SIX per-employee cells —
--     gross_pay/epf_employee/socso_employee/eis_employee/pcb/net_pay — which are exactly the
--     terms of the row identity `gross - (epf + socso + eis + pcb) = net` the evaluator checks.
--     The employer-side and HRDF columns have NO row counterpart because a payslip row does not
--     print the employer's own contribution; they are read from the run level only.
--
--     EVERY QUESTION IS ANSWERED, AND `not_printed` IS AN ANSWER. Both halves of the brief's
--     rule live here: a missing key is a refusal (the shape that would let a blank pass for a
--     zero), and `not_printed` is a first-class state (the shape that says the page is silent).
--     There is no third state and no default.
--
--     STABLE, SECURITY DEFINER, pinned search_path, UNGRANTED — clara._witness_answers_ok's own
--     disposition exactly. Its only caller is the persist door in §F, which runs as the owner.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara._payroll_answers_ok(p_envelope jsonb, p_channel text)
  returns boolean language plpgsql stable security definer
  set search_path = clara, pg_temp as $pao$
declare
  -- The ELEVEN run-level questions. `period` is the only non-monetary one; the other ten are
  -- money the page either prints or does not.
  v_run text[] := array['payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'];
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
  -- HALF ONE: every key present is a KNOWN key.
  if exists (select 1 from jsonb_object_keys(v_answers) as k(name)
              where k.name <> all(v_run)) then return false; end if;
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
  '#945: the payroll family''s OWN closed answer vocabulary — eleven run-level questions and six per-employee cells, every one of them answered, `not_printed` a first-class answer, an unknown key at any level a refusal. Deliberately NOT an arm of clara._witness_answers_ok: a versioned workflow may not couple its shape to another family''s frozen files. Ungranted; its only caller is clara.persist_payroll_facts, which runs as the owner.';

-- =====================================================================================
-- §D  THE DETERMINISTIC EVALUATOR (AC2) — clara.evaluate_payroll_run_state_v1(jsonb, jsonb).
--
--     THE MODEL NEVER SUMS. That is the owner decision this body exists to make true: the two
--     channel envelopes carry QUOTES — what the page prints, per run-level question and per
--     employee row — and every arithmetic result in the fact state is produced HERE, in SQL,
--     from those quotes. There is no arm in which a figure the model computed reaches a fact.
--
--     WHAT IT DOES, in the brief's own order: it sums each column across the quoted rows, checks
--     every row's own identity (gross minus employee EPF, SOCSO, EIS and PCB equals net),
--     cross-checks a printed totals row against those sums where the page prints one, and
--     compares the text-channel and vision-channel readings — the same pair discipline the
--     invoice lane uses. What it produces is a FACT STATE for the run: per question, whether the
--     figure is established, disagreed or missing, and why.
--
--     IT CALLS NO OTHER clara FUNCTION, and that is structural rather than stylistic (0140's own
--     recorded reason): registering a closure in clara.evaluator_versions freezes EVERY member
--     body estate-wide, so an N-member registration is N bodies a later lane can never recut.
--     The rendering-to-cents normalization is therefore written INLINE — once, in the flattening
--     statement — instead of reaching for clara._normalize_invoice_cents, which is a member of
--     the F-A1 witness closure and would drag that whole freeze in here.
--
--     IT READS NO TABLE EITHER, so it is genuinely IMMUTABLE: same two envelopes, same state,
--     forever. That is what makes a stored fact state reproducible from its own inputs.
--
--     THE CHANNEL COMPARISON IS ON THE FIGURE, NOT THE RENDERING. "1,000.00" and "1000.00" are
--     the same figure read twice, and refusing them as a disagreement would manufacture conflict
--     out of typography. Two renderings agree when their normalized cents agree; when neither
--     normalizes (an unreadable rendering) they agree when the rendering itself matches.
--
--     A ROW EITHER CHANNEL READS DIFFERENTLY IS NOT AN AGREED ROW, and no column sums over a
--     document with a contested, unbalanced or uncheckable row: a partial sum is a figure no
--     page states. This is the one place where being strict costs a number, and it is the right
--     trade — the fact state says WHY nothing was established, and a person reads the page.
--
--     REFUSALS, not exceptions. A malformed envelope returns a typed refusal object; the door in
--     §F is what refuses a malformed read at the write boundary (through §C's vocabulary gate).
--
--     REDO-SAFE: `create or replace function` (the freeze registration in §D.1 is guarded).
-- =====================================================================================
create or replace function clara.evaluate_payroll_run_state_v1(p_text jsonb, p_vision jsonb)
  returns jsonb language plpgsql immutable
  set search_path = clara, pg_temp as $eval$
declare
  -- The eleven run-level questions, in the brief's own order.
  v_run text[] := array['payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'];
  -- The SIX run-level questions that have a per-employee counterpart, paired with it. The four
  -- employer-side columns and the levy are deliberately absent: a payslip row does not print the
  -- employer's own contribution, so nothing sums them and nothing pretends to.
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
  v_established text[] := array[]::text[];
  v_disagreed text[] := array[]::text[];
  v_missing text[] := array[]::text[];
  v_i int; v_j int; v_f text; v_rf text;
  v_t_state text; v_t_raw text; v_t_cents bigint;
  v_v_state text; v_v_raw text; v_v_cents bigint;
  v_printed_cents bigint; v_printed_raw text;
  v_computed bigint; v_computable boolean;
  v_state text; v_reason text; v_basis text; v_fact jsonb;
begin
  if p_text is null or p_vision is null
     or jsonb_typeof(p_text->'payroll'->'answers') <> 'object'
     or jsonb_typeof(p_vision->'payroll'->'answers') <> 'object' then
    return jsonb_build_object('state_version','v1','refusal','payroll_envelope_malformed',
      'reason','each channel must carry a payroll envelope with an answers object');
  end if;

  -- -------------------------------------------------------------------------------------
  -- 1 · FLATTEN AND NORMALIZE, ONCE. Every quote from both channels — run answers and row cells
  --     alike — becomes one element carrying its channel, scope, row number, key, state, verbatim
  --     rendering and normalized cents. The rendering-to-cents rule is written HERE and nowhere
  --     else in this body: trim, drop an accounting parenthesis pair (recording its sign), drop
  --     an RM/MYR prefix, drop thousands separators and spaces, then require a plain decimal of
  --     at most thirteen integer digits and two decimal places. Anything else normalizes to NULL
  --     — an unreadable rendering, never a guess.
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
  -- 2 · THE ROWS. A row is AGREED when both channels quoted it and every one of its six cells
  --     carries the same figure on both; anything else is CONTESTED. Then each agreed row's own
  --     identity is checked — and a row that cannot be checked (a cell the page does not print,
  --     or a rendering that does not normalize) is UNCHECKED, never assumed to balance.
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
    -- The comparison key: the FIGURE when it normalizes, the rendering when it does not.
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
  -- 3 · THE ELEVEN QUESTIONS. Each one's verdict, in a fixed precedence: what the two channels
  --     say about it first, then whether the rows can speak to it at all, then the cross-check.
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

    -- Which per-employee column, if any, sums to this question.
    for v_j in 1 .. array_length(v_sum_run,1) loop
      if v_sum_run[v_j] = v_f then v_rf := v_sum_row[v_j]; end if;
    end loop;

    -- THE COLUMN SUM, computed only over a row set that can honestly be summed: at least one
    -- agreed row, no contested row, no unbalanced row, no unchecked row, and every agreed row
    -- printing a readable figure in this column.
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
      -- THE ONE NON-MONETARY QUESTION: compared as a rendering, because a month is not a figure.
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

  return jsonb_build_object(
    'state_version','v1',
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
    'established', to_jsonb(v_established),
    'disagreed', to_jsonb(v_disagreed),
    'missing', to_jsonb(v_missing));
end $eval$;

revoke all on function clara.evaluate_payroll_run_state_v1(jsonb, jsonb) from public;

comment on function clara.evaluate_payroll_run_state_v1(jsonb, jsonb) is
  '#945: the payroll run''s deterministic evaluator. Two channel envelopes in, one fact state out: the column sums over the quoted employee rows, each row''s own gross-minus-deductions identity, the cross-check against a printed totals row where the page prints one, and the text-vs-vision comparison. The MODEL never sums — every arithmetic result here is produced by this body from quoted renderings. It reads no table and calls no other clara function, which is what keeps its clara.evaluator_versions closure at ONE member and the freeze meaningful; a changed formula is a _v2, never an edit.';

reset role;

-- -------------------------------------------------------------------------------------
-- §D.1  THE FREEZE REGISTRATION, single-member by construction (0140's shape).
--
--       THE search_path HERE IS LOAD-BEARING, NOT COSMETIC (0059:243-245's recorded reason,
--       restated by 0091 and 0140): clara.verify_evaluator_freeze() reproduces the closure hash
--       under pg_catalog,pg_temp, so a registration performed under ANY OTHER search_path stores
--       a hash the verifier CANNOT reproduce and every later apply reds.
--
--       deployed = false: the deploy-lock flip is a one-way ceremony act under 0060's
--       _tf_evaluator_deploy_once, never a migration's to make. The freeze binds regardless —
--       the flag is about traffic, not about immutability.
--
--       REDO-SAFE, AND NOT BY RE-WRITING THE ROW — BY REFUSING TO. clara.evaluator_versions is
--       historical (t_evaluatorversions_deploy_once refuses every DELETE and every UPDATE but the
--       one deploy flip) and clara.evaluator_version_members is append-only, which is the whole
--       point of a freeze: a registration is a fact about a body, and a fact you may rewrite is
--       not a freeze. So this block INSERTS when the registration is absent and, when it is
--       already present, RE-DERIVES the closure hash from the live catalog and refuses if it has
--       moved. A redo of an UNCHANGED evaluator therefore passes silently; a redo after an edit
--       to the evaluator body fails by name, and its only lawful repair is a _v2 — which is
--       exactly the law this registry exists to enforce, applied to this file as to any other.
-- -------------------------------------------------------------------------------------
set local search_path = pg_catalog, pg_temp;
do $w945_freeze$
declare e uuid; h bytea; v_live bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), 'hex'),
           '' order by o), 'UTF8')) into h
    from (values (0, 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)')) m(o, s);

  select ev.closure_sha256 into v_live from clara.evaluator_versions ev
   where ev.evaluator_name = 'evaluate_payroll_run_state' and ev.version = 1;
  if v_live is not null then
    if v_live is distinct from h then
      raise exception '#945 freeze: clara.evaluate_payroll_run_state_v1 is already registered at a DIFFERENT closure hash. A registration is append-only and a frozen body is never recut in place: ship the change as clara.evaluate_payroll_run_state_v2 with its own version row.'
        using errcode = 'CLR10';
    end if;
    return;   -- already registered, at exactly this body: a redo has nothing to do here
  end if;

  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    values ('evaluate_payroll_run_state', 1, 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)', h,
      '0296_payroll_summary_typed_facts', false)
    returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), null::uuid
      from (values (0, 'clara.evaluate_payroll_run_state_v1(jsonb,jsonb)')) m(o, s);
end
$w945_freeze$;
set local search_path = clara, pg_temp;

-- =====================================================================================
-- §E  THE FACTS ROUTER STOPS TERMINATING A PAYROLL SUMMARY AS A SKIPPED KIND (AC4, first half).
--
--     WHAT WAS THERE BEFORE. clara._enqueue_invoice_facts_core's pdf/image branch routed
--     invoice-shaped kinds to `llm_witness` and a bank statement to `statement_facts`, and sent
--     EVERYTHING ELSE — a payroll summary included — to a terminal `failed/skipped_kind`
--     receipt. 0016's own tail says so in words: "payroll_summary NEVER reaches invoice_facts
--     (skipped_kind)". The capability registry's `stored_only` verdict for the pair is derived
--     from exactly that fall-through, which is why §G's re-derivation and this arm are one
--     change and not two.
--
--     WHY ITS OWN LANE AND NOT llm_witness. That lane is claimed BY LANE ALONE — the invoice
--     witness workflow owns every task on it, and clara._invoice_fact_state keys the witness
--     REGIME on it — so a payroll pair parked there would be read with invoice prompts and
--     resolved as an invoice corroboration. 0098 recorded the same reasoning when it declined to
--     move the bank statement onto it. A new lane costs five CHECK widenings and five surgical
--     recuts; borrowing one costs correctness.
--
--     THE FIVE LIVE BODIES RECUT BELOW, and why each one must be:
--       1. clara._enqueue_invoice_facts_core — the routing arm itself, the engine-kind map, the
--          enqueue-time typed-consent gate and the attempt-cap emit.
--       2. clara.enqueue_invoice_facts — the wrapper's lane-aware terminal emit: without this,
--          every payroll refusal would reach the spine as a PHANTOM INVOICE FAILURE and wake the
--          autodraft consumer for a document no invoice draft will ever be made from.
--       3. clara._tf_processing_task_update — the transition wall: the consent gate FLIPS an
--          in-flight queued task in place, and that transition is lane-scoped per verdict.
--       4. clara.claim_document_processing_task — the kill switch, the per-lane attempt cap, the
--          lane-true cap emit and the per-lane concurrency window. A lane no worker can claim is
--          a dark lane.
--       5. clara.release_held_document_tasks — the release sweep. A lane that can be HELD and
--          cannot be RELEASED is a permanent stall, and 0038's own comment says this list must
--          track the claim body's kill-switch list EXACTLY.
--
--     EVERY EDIT IS A LANE-LIST WIDENING OR A NEW BRANCH. No existing kind's route, refusal,
--     event, cap or window moves: the bodies below were produced by reading each live
--     pg_get_functiondef off this rig and applying exactly the named substitutions, never by
--     re-typing a body from memory.
--
--     REDO-SAFE: every constraint is dropped-if-exists before it is added, every insert is
--     `on conflict do nothing`, and every body is `create or replace`.
-- =====================================================================================
set role clara_fn_owner;

-- E1 · THE FIVE CHECK CONSTRAINTS THAT MAKE THE LANE EXIST AT ALL.
--
--      A CHECK is what turns "the router may write this" into "nothing may write anything else".
--      Each is dropped and re-added rather than altered, because a CHECK cannot be altered in
--      place and because an unconditional drop-then-add is what makes a redo install the clause
--      this file's CURRENT text states rather than a stale one.

alter table clara.document_processing_tasks drop constraint if exists ck_processing_task_lane_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_f_a1
  check (lane = any (array['ocr','structured_parse','none','invoice_facts','local_facts',
    'classify','statement_facts','statement_parse','llm_witness','payroll_facts']));

alter table clara.document_processing_tasks drop constraint if exists ck_processing_task_lane_engine_f_a1_stmt;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_f_a1_stmt
  check (engine_id like 'clara-fixture:%'
     or (lane = any (array['ocr','invoice_facts']) and engine_id like 'azure-%')
     or (lane = 'statement_facts' and (engine_id like 'azure-%' or engine_id like 'llm-%'))
     or (lane = any (array['structured_parse','local_facts','none']) and engine_id like 'clara-%')
     or (lane = 'classify' and engine_id like 'clara-classify-%')
     or (lane = 'statement_parse' and engine_id like 'clara-statement-%')
     or (lane = 'llm_witness' and engine_id like 'llm-%')
     -- #945: the payroll lane is a MODEL lane and may carry nothing but a model engine identity.
     or (lane = 'payroll_facts' and engine_id like 'llm-%'));

alter table clara.document_processing_tasks drop constraint if exists ck_processing_task_error_code_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_f_a1
  check (error_code is null or error_code = any (array['engine_error','timeout','engine_lost',
    'storage_error','corrupt','encrypted','bad_type','limit','budget','attempt_cap','internal',
    'skipped_kind','header_unreadable','totals_unreadable','readers_disagree','chain_broken',
    'continuity_mismatch','duplicate_period','overlapping_period','non_myr_statement',
    'account_unregistered','account_inactive','statement_multi_client','period_invalid',
    'line_date_out_of_period','consent_inactive','witness_multi_client','witness_consent_inactive',
    'wait_exhausted','document_processing_multi_client','document_processing_consent_inactive',
    'firm_narrow_consent_inactive',
    -- #945: the payroll lane's own two gate verdicts. Its OWN codes rather than a reuse of the
    -- witness family's, because a refusal a person reads must say which read was refused.
    'payroll_multi_client','payroll_consent_inactive']));

alter table clara.document_processing_tasks drop constraint if exists ck_processing_task_binding_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_binding_f_a1
  check ((status = any (array['queued','held_egress']) and workflow_run_id is null and started_at is null)
      or (status = any (array['running','done']) and workflow_run_id is not null and started_at is not null)
      or (status = 'failed' and ((workflow_run_id is not null and started_at is not null)
                              or (workflow_run_id is null and started_at is null
                                  and error_code = any (array['budget','attempt_cap','skipped_kind',
                                    'consent_inactive','statement_multi_client','witness_multi_client',
                                    'witness_consent_inactive','document_processing_multi_client',
                                    'document_processing_consent_inactive','firm_narrow_consent_inactive',
                                    -- #945: both payroll gate verdicts are NEVER-CLAIMED terminal
                                    -- receipts, exactly like every other enqueue-time gate code.
                                    'payroll_multi_client','payroll_consent_inactive'])))));

alter table clara.document_extractions drop constraint if exists ck_document_extractions_engine_kind_f_a1;
alter table clara.document_extractions add constraint ck_document_extractions_engine_kind_f_a1
  check (engine_kind = any (array['ocr','structured_parse','invoice_facts','doc_classify',
    'statement_facts','llm_text_facts','llm_vision_facts',
    -- #945: the payroll pair's two rows. Their OWN kinds, not a reuse of llm_text_facts /
    -- llm_vision_facts: clara._invoice_fact_state resolves the witness regime off those two
    -- kinds, so a payroll envelope banked under them would be read as an invoice corroboration.
    'payroll_text_facts','payroll_vision_facts']));

-- E2 · THE TWO EVENT TYPES THE LANE SPEAKS. clara.domain_events carries a foreign key onto
--      clara.event_types, so an unregistered type is an INSERT failure, not a silent drop. Both
--      are client-scoped (every payroll document is filed to exactly one client by the time the
--      router reaches it) and both are routed at the ACTIVE taxonomy version with decision
--      `ignore`, which is document.llm_witness_failed's own registration exactly: the workflow is
--      the registered consumer, and no router wake is wanted. Both tables are append-only
--      (t_event_types_append_only / t_trigger_taxonomy_append_only), so these are INSERTs with
--      `on conflict do nothing` — never an UPDATE, which those triggers would refuse.

insert into clara.event_types (name, client_scoped, description) values
  ('document.payroll_facts_completed', true,
   '#945: a payroll summary''s typed facts were read and banked (the text+vision pair persisted atomically). The facts workflow is the registered consumer; no router wake.'),
  ('document.payroll_facts_failed', true,
   '#945: a payroll summary''s read terminated without facts — an enqueue-time consent verdict, an attempt cap, or a worker-reported failure. The lane-true twin of document.invoice_facts_failed, so a payroll refusal never wakes the autodraft consumer.')
on conflict (name) do nothing;

insert into clara.trigger_taxonomy (version, event_type, decision, note)
  select a.version, e.name, 'ignore',
         '#945: the payroll facts workflow is the registered consumer; no router wake.'
    from clara.taxonomy_active a
    cross join (values ('document.payroll_facts_completed'), ('document.payroll_facts_failed')) e(name)
on conflict (version, event_type) do nothing;

-- E3 · THE FIVE RECUT BODIES, each one the live pre-image plus its named substitutions.

CREATE OR REPLACE FUNCTION clara._enqueue_invoice_facts_core(p_document uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $w945_router$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text; v_task_status text;
  v_engine_kind text; v_stmt_clients uuid[]; v_stmt_client uuid; v_gate text; v_flip int;
begin
  select * into d from clara.documents where id=p_document for update;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — never facts-extracted.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  if exists(select 1 from clara.document_filings df
      where df.document_id=p_document and df.retired_at is null)
     and not exists(select 1 from clara.document_filings df
       join clara.clients oc on oc.id=df.client_id and oc.status='active'
       where df.document_id=p_document and df.retired_at is null) then
    return jsonb_build_object('document_id',p_document,
      'status','skipped_client_onboarding');
  end if;
  -- 0015: mime chooses the engine family. 0016 (P3/WA21-R7): the DOCUMENT KIND
  -- gates the facts engines — only invoice-shaped kinds reach invoice_facts;
  -- a NULL kind classifies FIRST; xml stays rule-classified into the local lane.
  -- 0038 (design 4.3): 'bank_statement' now has TWO homes -- the vendor OCR lane for a
  -- pdf/image and the free local parse lane for a csv/ofx export.
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    if d.document_kind is null then
      if not exists (
        select 1 from clara.document_extractions e
         where e.document_id=p_document and e.firm_id=d.firm_id
           and e.status='done' and e.engine_kind in ('ocr','structured_parse')
      ) then
        return jsonb_build_object('document_id',p_document,'status','awaiting_extraction');
      end if;
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';
    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness
      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm
      -- served (mirrored above, never widened here). F-A2 OPENER 2: the engine identity moves
      -- to :v2 because witnessFacts.v2 is a NEW frozen prompt closure and its reads answer
      -- different questions -- v_engine MUST string-equal WITNESS_ENGINE_SNAPSHOT.engineId in
      -- the witnessFacts.v2 services module -- battery cell f-a2.engine-literal reads both
      -- sides and asserts equality.
      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';
    elsif d.document_kind='bank_statement' then
      -- 0038 arm 1 closed the bank_statement -> skipped_kind dead end 0026:392-410 left
      -- behind, on the vendor OCR read. F-A2 WINDOW B (the ACTIVATION, design SS3.7) re-aims
      -- it at the WITNESS PAIR: the same lane, a different engine identity.
      -- THE LANE DOES NOT MOVE, and that is 0098's own LANE DECISION (0098:120-138), not an
      -- omission: _invoice_fact_state keys the witness regime on lane llm_witness, so a
      -- statement pair there would be resolved as an INVOICE corroboration, and the invoice
      -- witness workflow claims that lane BY LANE ALONE and would read a statement with
      -- invoice prompts. Staying on statement_facts also keeps this task inside the
      -- enqueue-time page-budget reservation set (0098:114-118).
      -- v_engine MUST string-equal STATEMENT_WITNESS_ENGINE_SNAPSHOT.engineId in the
      -- statementFacts.v2 services module: the workflow compares the task's stamp against its
      -- own snapshot BEFORE any egress and WAITS on a mismatch rather than sending bytes under
      -- a receipt naming a model it did not call (0098:154-159), so a drifted literal STALLS
      -- the lane instead of mis-stamping it. Battery cell f-a2.activation-engine-literal reads
      -- both sides independently and asserts equality.
      v_lane:='statement_facts'; v_engine:='llm-openai:gpt-5.6-terra:stmt-witness-v1';
    elsif d.document_kind='payroll_summary' then
      -- #945 / parent #926 (owner ruling 2026-09-18, option G): "a payroll summary and a
      -- contract go down the same lane as any other accounting document, read and posted, not
      -- merely stored". Until this arm existed a payroll_summary fell straight through to the
      -- skipped_kind dead end below -- the capability registry's own `stored_only` verdict was
      -- literally derived from that fall-through. ITS OWN LANE, not llm_witness: that lane's
      -- claim is BY LANE ALONE (the bank-statement comment eight lines above records the same
      -- reasoning), so a payroll pair parked there would be read with invoice prompts and
      -- resolved by clara._invoice_fact_state as an invoice corroboration. v_engine MUST
      -- string-equal PAYROLL_ENGINE_SNAPSHOT.engineId in the payrollFacts.v1 services module;
      -- the workflow compares the task's stamp against its own snapshot BEFORE any egress and
      -- waits on a mismatch rather than sending bytes under a receipt naming a model it did not
      -- call, so a drifted literal STALLS the lane instead of mis-stamping it.
      v_lane:='payroll_facts'; v_engine:='llm-openai:gpt-5.6-terra:payroll-witness-v1';
    else
      -- (adjudication #11): the skipped_kind receipt lives on the task trail —
      -- a terminal failed row (never claimed, attempt_count 0 so it never
      -- consumes attempts), reused idempotently on re-invocation.
      select id into v_task from clara.document_processing_tasks
        where document_id=p_document and lane='invoice_facts'
          and status='failed' and error_code='skipped_kind'
        order by id limit 1;
      if v_task is null then
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane='invoice_facts';
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
            v_version,'invoice_facts','failed','skipped_kind',now())
          returning id into v_task;
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','skipped_kind','document_kind',d.document_kind);
    end if;
  elsif lower(coalesce(d.mime_type,'')) in ('application/xml','text/xml') then
    -- Delta-review round 2 (2026-07-31): the XML arm was KIND-BLIND -- a bank_statement
    -- xml rode the myinvois local lane into the INVOICE parser (wrong worker, wrong
    -- events, a phantom autodraft wake if it happened to parse). No xml statement parser
    -- exists in C-b (the structured lane is csv/ofx by design 4.3), so the honest verdict
    -- is the same terminal skipped_type a csv non-statement gets: never a misroute.
    if d.document_kind='bank_statement' then
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
  elsif lower(coalesce(d.mime_type,'')) in ('text/csv','application/csv',
      'application/x-ofx','application/ofx') then
    -- 0038 arm 2 (design 4.3): the csv/ofx mimes JOIN the dispatch. They dead-ended at
    -- skipped_type before the kind test could ever run. ONLY a bank statement routes; every
    -- other kind keeps the byte-identical skipped_type verdict it has today, so nothing that
    -- is not a statement changes behaviour.
    if d.document_kind='bank_statement' then
      v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';
    else
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
  else
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  if v_lane='classify' then
    -- a DONE classify verdict with the kind still NULL = the low-confidence
    -- hold: a human resolves it (set_document_kind / the review question);
    -- never re-enqueue in a loop.
    if exists(select 1 from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='doc_classify'
          and e.status='done') then
      return jsonb_build_object('document_id',p_document,'status','classify_low_confidence');
    end if;
  else
    -- 0038 (design 4.3): PER-LANE engine-kind. This short-circuit was hard-coded to
    -- 'invoice_facts', which is correct for invoice_facts AND for local_facts (both settle an
    -- invoice_facts extraction) and WRONG for either statement lane -- a fully ingested
    -- statement would read as un-extracted on every re-fire and re-buy a vendor read. The map
    -- preserves the two existing lanes exactly and names the two new ones.
    v_engine_kind := case when v_lane='payroll_facts'
                       then 'payroll_text_facts'  -- #945: the payroll pair's CANONICAL row,
                       -- the llm_witness precedent exactly -- a done text row proves a done
                       -- pair (one atomic writer transaction), so a re-fire is suppressed the
                       -- moment the pair lands.
                       when v_lane in ('statement_facts','statement_parse')
                       then 'statement_facts'  -- BOTH statement lanes settle a
                       -- statement_facts extraction (the lane records how the read was
                       -- bought; the engine_kind what it is -- the 0026:709 precedent)
                       when v_lane='llm_witness'
                       then 'llm_text_facts'  -- F-A1 PR-3: the CANONICAL witness row --
                       -- a done text row proves a done PAIR (one atomic writer transaction,
                       -- 0095 section 8), so a re-fire is suppressed the moment the pair lands.
                       else 'invoice_facts' end;
    select e.id into v_task from clara.document_extractions e
      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'
      order by e.version_n desc limit 1;
    -- F-A1 PR-3 (M-4, RULED): for the invoice-shaped lane ONLY, a done LEGACY extraction ALSO
    -- suppresses -- v_engine_kind above already names the witness side (llm_text_facts); this
    -- is the legacy side of the EITHER-REGIME check, consulted only when the witness lookup
    -- just found nothing.
    if v_task is null and v_lane='llm_witness' then
      select e.id into v_task from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc limit 1;
    end if;
    if v_task is not null then
      return jsonb_build_object('document_id',p_document,'status','already_completed',
        'extraction_id',v_task);
    end if;
  end if;
  -- 0038 (design 4.3/4.4, WCB-R1): THE ENQUEUE-TIME TYPED-CONSENT GATE, statement lanes only.
  -- It is here rather than in the claim body because the ratified 0020 section 6 byte-identity
  -- battery asserts claim_document_processing_task carries no call edge into the typed-consent
  -- surface — and because enqueue is the earlier, more honest place: an unauthorized client
  -- should never have a task queued in their name at all. Both verdicts write the terminal
  -- NEVER-CLAIMED failed receipt (the skipped_kind idiom), never a raise: this function runs
  -- inside file_document / finalize_document_intake / confirm_attribution_candidate /
  -- approve_wrong_client_correction, and a raise would abort an unrelated filing transaction.
  --
  -- ORDERING, decided here because the design does not fix it: the gate runs AFTER the
  -- already_completed short-circuit (an ingested statement raises no consent question and must
  -- not generate noise on a re-fire) and BEFORE the in-flight short-circuit. The other order
  -- has a real hole: a statement enqueued while one client held it, then filed to a SECOND
  -- client, would hit the in-flight branch and return the queued task, so the vendor read
  -- would proceed on a document with no answerable consent client. A re-fire whose gate now
  -- fails should say so even while a task is queued.
  if v_lane in ('statement_facts','statement_parse') then
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='statement_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      -- F-A2 WINDOW B (the ACTIVATION): the statement lane's typed consent is now keyed on the
      -- purpose the witness pair actually egresses under, not on the retiring vendor-OCR one.
      -- NO NEW CONSENT SURFACE IS NEEDED: the activation relation is keyed on
      -- (firm_id, client_id, purpose) ALONE -- no lane, no document_kind, no engine column
      -- (0038:5981-5987) -- so the activations already on file for the invoice witness pair
      -- answer this lookup unchanged. THIS ARM'S OWN REFUSAL VOCABULARY IS UNCHANGED
      -- (statement_multi_client / consent_inactive, 0098:161-165) and so is its
      -- document.statement_facts_failed emit; only the purpose literal moves. The retiring
      -- purpose STAYS REGISTERED in the purpose CHECKs -- historical authorization rows
      -- reference it and drops are BY NAME (the 0038:5462 contract).
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      -- AS-BUILT LADDER FIX (2026-07-31): the gate ACTS ON any in-flight queued task rather
      -- than writing a receipt beside it -- the ordering rationale above promises the vendor
      -- read stops, so it stops: the queued row flips to the gate verdict in this same
      -- transaction (never-claimed failed rows are legal for both gate codes -- the widened
      -- binding CHECK). A running task is past claiming and settles through its own persist.
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          -- Re-read of an EXISTING terminal receipt: this call acted on nothing, so it
          -- emits nothing (delta-review round 2, 2026-07-31: the unconditional emit here
          -- re-fired on every dark re-try and, picked by uuid order, could name an older
          -- task than the one the verdict actually acted on). The verdict reached the
          -- spine when its receipt was minted; re-reads only report it.
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        -- The flip acted: name the newest flipped row (version order, never uuid order).
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      -- 0038 as-built fix (2026-07-31): every statement-lane terminal receipt this core
      -- mints reaches the spine as the STATEMENT twin with its reason -- and EXACTLY ONCE
      -- per verdict instance: only the two acting branches (the flip, the fresh insert)
      -- reach this emit; the re-read branch returned above. The wrapper
      -- (enqueue_invoice_facts, recut in E2b) no longer emits its invoice twin for
      -- statement lanes, so this is the single emit site on every caller path --
      -- file_document's direct core calls included.
      perform clara._append_event(d.firm_id,'document.statement_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='llm_witness' then
    -- F-A1 PR-1 (design SS3.5/SS6, wall 6): the SAME enqueue-time typed-consent gate, keyed
    -- on purpose='witness_extraction' instead of 'statement_extraction', with its OWN named
    -- refusal codes (wall 7) rather than a reuse of the statement family's bare literals --
    -- witness and statement consent are granted independently, so the codes must stay
    -- distinguishable. INERT AT PR-1: nothing in this body (or anywhere else at this
    -- frontier) ever assigns v_lane:='llm_witness' -- no mime/kind arm mints it yet, and the
    -- lane CHECK plus enqueueForLane's runtime allowlist keep an old image from reaching this
    -- branch even by accident. Wired now so the gate exists the moment PR-3's router recut
    -- adds the classification arm, rather than landing a second CoR on this pinned body then.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='witness_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='witness_consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='witness_consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      perform clara._append_event(d.firm_id,'document.llm_witness_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='payroll_facts' then
    -- #945: THE SAME enqueue-time typed-consent gate the witness lanes hold, keyed on the SAME
    -- purpose ('witness_extraction') and with its OWN named refusal codes rather than a reuse of
    -- another family's literals -- a refusal a person reads must say which read was refused.
    --
    -- WHY THE EXISTING PURPOSE AND NOT A NEW ONE. 'witness_extraction' is the typed consent that
    -- authorizes sending a client's document BYTES to a model in order to READ them; that is
    -- exactly and only what this lane does. Minting a payroll-specific purpose would need its own
    -- CHECK widening, its own consent-capture surface and its own activation act, and until all
    -- three existed the lane would be dark for every firm -- which the standing "nothing dark"
    -- ruling refuses. The purpose IS a live gate here, not a bypass: a client with no live
    -- witness_extraction activation gets a terminal refusal, exactly as an invoice would.
    -- FOLLOW-UP, recorded rather than silently decided: a payroll summary carries employee-level
    -- personal data an invoice does not, so whether this class deserves its own consent moment is
    -- a product question for the owner, filed by #945's report and not answered here.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='payroll_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='payroll_consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='payroll_consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      perform clara._append_event(d.firm_id,'document.payroll_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='classify' then
    -- F-A7 gamma (D-18/AB-4): THE CLASSIFY CONSENT GATE, at enqueue, following the same
    -- statement-lane mechanism above. TWO populations, per design SS3.5: a FILED document
    -- requires its client's live 'document_processing' typed consent+activation; an UNFILED
    -- document (the pre-activation class, D-21) requires the firm's live firm-narrow
    -- 'attribution'-moment activation. Either verdict is a terminal never-claimed failed
    -- receipt, never a raise.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='document_processing_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=1 then
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='document_processing'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='document_processing_consent_inactive';
      end if;
    else
      -- Zero active filings: the pre-activation document class (D-21). The firm-narrow
      -- 'attribution' moment authorizes classify on an unfiled document; it is firm-scoped,
      -- so no multi-client ambiguity is possible here by construction.
      if not exists(select 1 from clara.firm_egress_purpose_activations a
          join clara.firm_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.purpose=a.purpose and c.moment=a.moment
          where a.firm_id=d.firm_id and a.purpose='firm_narrow_intake' and a.moment='attribution'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='firm_narrow_consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      perform clara._append_event(d.firm_id,'document.classify_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane;
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,v_engine,'{}'::jsonb,
        v_version,v_lane,'failed','attempt_cap',now()) returning id into v_task;
    -- 0038 as-built fix (2026-07-31, regression-cells lane finding): THIS branch, not the
    -- claim-time belt, is the one a capped statement actually reaches -- the running attempt
    -- sum already reads 3 when the next enqueue fires, so the pre-fail intercepts before any
    -- claim exists to emit. Without an emit here the statement feed never learns its document
    -- died. Statement lanes only: the invoice lane's enqueue-time cap has been event-silent
    -- since 0026, and lighting it now would wake the autodraft consumer on a path Wave A
    -- never exercised -- that silence stays, recorded here as a pre-existing residual.
    if v_lane in ('statement_facts','statement_parse','payroll_facts') then
      -- #945: the payroll lane joins this emit for the reason the statement lane did -- without
      -- it the payroll feed never learns its document died at the cap. The TYPE follows the lane:
      -- a payroll cap must never reach the autodraft consumer as a phantom invoice failure.
      perform clara._append_event(d.firm_id,
        case when v_lane='payroll_facts' then 'document.payroll_facts_failed'
             else 'document.statement_facts_failed' end,
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason','attempt_cap'));
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,v_engine,'{}'::jsonb,
      v_version,v_lane,'queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    -- 0026 (amendment A11): the widened (document_id,engine_id,version_n,lane) key means a
    -- conflict HERE is now a genuine same-lane duplicate — a cross-lane collision is
    -- structurally impossible, lane joins the key. The exact colliding row must exist
    -- regardless of its current status (it may already be done/failed by the time we look
    -- again); silence hid this for the product's whole life, so an absent row here is
    -- impossible-state-loud, not a null task_id.
    select id,status into v_task,v_task_status from clara.document_processing_tasks
      where document_id=p_document and engine_id=v_engine and version_n=v_version and lane=v_lane;
    if v_task is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
        p_document,v_engine,v_version,v_lane using errcode='CLR35';
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',v_task_status);
  end if;
  -- Only the AZURE lanes consume the page budget; classify, the local parse and the local
  -- statement parse reserve nothing. 0038 adds statement_facts to the reserving set, which is
  -- what "the statement lane joins every existing spend control" means concretely.
  if v_lane in ('invoice_facts','statement_facts') then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      -- 0038 as-built fix (2026-07-31): the statement lane's budget verdict reaches the
      -- spine as the STATEMENT twin (single emit site -- the wrapper, recut in E2b,
      -- suppresses its invoice twin for statement lanes). The invoice lane keeps its
      -- pre-existing shape: silent here, emitted by the wrapper.
      if v_lane='statement_facts' then
        perform clara._append_event(d.firm_id,'document.statement_facts_failed',
          null,null,null,null,
          null,p_document,null,jsonb_build_object('task_id',v_task,'reason','budget'));
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $w945_router$
;

CREATE OR REPLACE FUNCTION clara.enqueue_invoice_facts(p_document uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $w945_wrapper$
declare v_result jsonb; v_firm uuid; v_lane text;
begin
  v_result:=clara._enqueue_invoice_facts_core(p_document);
  if v_result->>'status'='failed' then
    -- 0038 E2b: lane-aware. The core owns every STATEMENT-lane terminal emit at its mint
    -- sites; this wrapper emitting its invoice twin for a statement receipt was a phantom
    -- invoice failure (it would wake the autodraft consumer for a bank statement) and a
    -- double-emit. Invoice lanes keep the wrapper emit byte-for-byte.
    select lane into v_lane from clara.document_processing_tasks
      where id=(v_result->>'task_id')::uuid;
    -- #945: payroll_facts joins the exclusion for the reason the statement lanes are in it --
    -- the core owns every payroll-lane terminal emit at its mint sites, and this wrapper
    -- emitting its INVOICE twin for a payroll receipt would be a phantom invoice failure that
    -- wakes the autodraft consumer for a document no invoice draft will ever be made from.
    if coalesce(v_lane,'') not in ('statement_facts','statement_parse','payroll_facts') then
      select firm_id into v_firm from clara.documents where id=p_document;
      perform clara._append_event(v_firm,'document.invoice_facts_failed',null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_result->>'task_id',
          'reason',v_result->>'reason'));
    end if;
  end if;
  return v_result;
end $w945_wrapper$
;

CREATE OR REPLACE FUNCTION clara._tf_processing_task_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $w945_taskupd$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'document processing tasks are not deleted' using errcode='CLR08'; end if;
  if old.status in ('done','failed') then raise exception 'terminal document processing task is immutable' using errcode='CLR16'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id or new.document_id<>old.document_id
     or new.engine_id<>old.engine_id or new.engine_config<>old.engine_config
     or new.version_n<>old.version_n or new.lane<>old.lane or new.created_at<>old.created_at then
    raise exception 'document processing task identity/config is immutable' using errcode='CLR08';
  end if;
  if new.status<>old.status then
    -- 0038 E2b: queued->failed widens by the two enqueue-time gate verdicts -- the gate
    -- flips an in-flight queued task in place when a later filing invalidates its consent
    -- basis. Both are never-claimed codes (ck_processing_task_binding_0038); the flip is
    -- the only writer that uses them on this transition, and it only ever acts on the
    -- statement lanes -- so the widening is LANE-SCOPED (delta-review round 2,
    -- 2026-07-31): a queued invoice/classify/ocr task still cannot be flipped to a gate
    -- verdict by any future writer.
    -- 0040 (C-c, WCC-R8 ride-along; register entry 9): RE-KIND RETIREMENT joins the
    -- queued->failed arm, LANE-SCOPED exactly as 0038 E2b scoped its two gate verdicts. A
    -- document's lane is a function of the kind it carried at enqueue; when a human or the
    -- classifier changes the kind, a queued task in a KIND-BOUND lane is work nobody wants --
    -- and it blocks the correct lane's enqueue, because the router's in-flight short-circuit
    -- hands back the stale task. So it is retired to the never-claimed `skipped_kind` receipt
    -- (already in the binding CHECK's allowlist, 0038:7304, and already the router's own idiom
    -- for "this document has nowhere to go"). The scoping is the point: the kind-INDEPENDENT
    -- 'classify' lane can never be retired this way, and no writer can flip a running or
    -- terminal task at all.
    -- F-A1 PR-1 (wall 13): the WITNESS gate verdicts join the queued->failed arm,
    -- LANE-SCOPED exactly as 0038 E2b and 0040 S4.11a scoped theirs. _enqueue_invoice_facts_core's
    -- llm_witness branch flips an in-flight queued task in place when the typed witness_extraction
    -- consent is absent/inactive or the document is filed to more than one client; both codes are
    -- never-claimed (ck_processing_task_binding_f_a1) and the flip is their only writer. Scoping is
    -- the point: no future writer can flip a queued invoice/classify/ocr/statement task to a
    -- WITNESS verdict, and no lane can flip a running or terminal task at all.
    -- F-A7 gamma (SECTION 6, D-18/AB-4): the CLASSIFY gate verdicts join the queued->failed arm,
    -- LANE-SCOPED exactly as every prior addition scoped its own. _enqueue_invoice_facts_core's
    -- classify branch flips an in-flight queued task in place when the client's document_processing
    -- consent (filed population) or the firm's firm-narrow attribution activation (unfiled
    -- population) is absent/inactive, or the document is filed to more than one client; all three
    -- codes are never-claimed (ck_processing_task_binding_f_a1) and the flip is their only writer.
    -- Scoping is the point: no future writer can flip a queued invoice/ocr/statement/witness task
    -- to a CLASSIFY verdict, and no lane can flip a running or terminal task at all.
    v_ok:=(old.status='queued' and new.status in ('running','held_egress'))
      or (old.status='queued' and new.status='failed'
          and (new.error_code in ('budget','attempt_cap')
               or (new.error_code in ('consent_inactive','statement_multi_client')
                   and new.lane in ('statement_facts','statement_parse'))
               or (new.error_code in ('witness_consent_inactive','witness_multi_client')
                   and new.lane='llm_witness')
               -- #945: the PAYROLL gate verdicts join the queued->failed arm, LANE-SCOPED
               -- exactly as every prior addition scoped its own. The router's payroll_facts
               -- branch flips an in-flight queued task in place when the typed
               -- witness_extraction consent is absent/inactive or the document is filed to more
               -- than one client; both codes are never-claimed and the flip is their only
               -- writer. No future writer can flip a queued task on another lane to a PAYROLL
               -- verdict, and no lane can flip a running or terminal task at all.
               or (new.error_code in ('payroll_consent_inactive','payroll_multi_client')
                   and new.lane='payroll_facts')
               or (new.error_code='skipped_kind'
                   and new.lane in ('invoice_facts','statement_facts','statement_parse','llm_witness','payroll_facts'))
               or (new.error_code in ('document_processing_multi_client','document_processing_consent_inactive','firm_narrow_consent_inactive')
                   and new.lane='classify')))
      or (old.status='held_egress' and new.status='queued')
      or (old.status='running' and new.status in ('done','failed','queued','held_egress'));
    if not v_ok then
      raise exception 'illegal document processing transition % -> %',old.status,new.status
        using errcode='CLR16';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $w945_taskupd$
;

CREATE OR REPLACE FUNCTION clara.claim_document_processing_task(p_task uuid, p_workflow_run_id text, p_egress_approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $w945_claim$
declare
  t record; d record; v_cap int; v_running int; v_attempts int;
  v_clients int; v_consented int; v_hold_reason text; v_secret text;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'workflow_run_id is required' using errcode='CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  select storage_path,sha256,mime_type,byte_size into d
    from clara.documents where id=t.document_id;

  -- The lease check precedes EVERY dispatching branch. Only the EGRESSING lanes
  -- (ocr, invoice_facts and -- 0038 -- statement_facts) are kill-switch-gated; invoice_facts
  -- additionally requires every active filing client to hold a live LEGACY consent. Local
  -- lanes (structured_parse, local_facts, classify, statement_parse) never hold.
  --
  -- 0038 (design 4.3/4.4): statement_facts joins the KILL SWITCH and nothing else here. The
  -- typed (consent, activation) it needs is checked at ENQUEUE -- the 0020 section 6
  -- byte-identity battery asserts this body carries no call edge into the typed-consent
  -- surface, and the two questions are orthogonal anyway: the switch asks whether the vendor is
  -- safe right now, the typed gate asks whether this client authorized this purpose. Widening
  -- the LEGACY branch below to statement_facts would make a purpose-blind consent authorize a
  -- statement-specific read, which is what 0020 section 1 built a separate relation to prevent.
  -- #945: payroll_facts is an EGRESSING lane (it sends document bytes to a model), so it
  -- joins the kill switch. It runs NO per-client LEGACY consent check here, for the reason
  -- statement_facts and llm_witness do not: its typed (consent, activation) pair is checked at
  -- ENQUEUE, and reading the purpose-blind legacy table here would let a generic consent
  -- authorize a payroll-specific read.
  if t.lane in ('ocr','invoice_facts','statement_facts','llm_witness','payroll_facts')
     and not coalesce(p_egress_approved,false) then
    v_hold_reason:='kill_switch';
  elsif t.lane='invoice_facts' then
    select count(distinct f.client_id)::int,
      count(distinct f.client_id) filter(where exists(
        select 1 from clara.client_egress_consents c
        where c.client_id=f.client_id and c.revoked_at is null))::int
      into v_clients,v_consented from clara.document_filings f
      where f.document_id=t.document_id and f.retired_at is null;
    if coalesce(v_clients,0)=0 or coalesce(v_consented,0)=0 then
      v_hold_reason:='no_consent';
    elsif v_consented<v_clients then
      v_hold_reason:='partial_consent';
    end if;
  end if;
  if v_hold_reason is not null then
    if t.status in ('queued','running') then
      update clara.document_processing_tasks set status='held_egress',
        workflow_run_id=null,started_at=null,vendor_op_ref=null where id=p_task;
      if t.lane='ocr' then
        update clara.documents set extraction_status='held_egress' where id=t.document_id;
      end if;
    elsif t.status<>'held_egress' then
      raise exception 'processing task is not dispatchable' using errcode='CLR16';
    end if;
    return jsonb_build_object('task_id',p_task,'status','held_egress',
      'workflow_run_id',null,'payload',jsonb_build_object(
        'clr','CLR28','reason',v_hold_reason));
  end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
      'storage_path',d.storage_path,'sha256',d.sha256,
      'mime_type',d.mime_type,'byte_size',d.byte_size);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  -- 0038: the attempt cap is now PER EGRESSING LANE. The sum was keyed on the literal
  -- 'invoice_facts' while the branch it guards was too; widening the branch without re-keying
  -- the sum would let one lane's attempts cap the other's. F-A1 PR-1: llm_witness joins the
  -- same per-lane cap.
  if t.lane in ('invoice_facts','statement_facts','llm_witness','payroll_facts') then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks where document_id=t.document_id
        and lane=t.lane;
    if v_attempts>=3 then
      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',
        finished_at=now() where id=p_task;
      perform clara._refund_processing_call(p_task,'attempt_cap');
      -- 0038 as-built fix: the terminal event follows the LANE -- a statement task's cap
      -- must fire the statement feed (its subscribed twin), never wake the autodraft
      -- consumer with a phantom invoice failure. F-A1 PR-1 (M9): llm_witness gets its OWN
      -- twin -- the subscriber census (packages/runtime/lib/autodraft.mjs's
      -- AUTODRAFT_EVENT_TYPES, and a repo-wide grep for both existing type strings) found
      -- no consumer of either existing type that a witness-lane failure could misfire into,
      -- so the lane-true default applies rather than folding into the invoice twin.
      perform clara._append_event(t.firm_id,
        case when t.lane='statement_facts' then 'document.statement_facts_failed'
             when t.lane='llm_witness' then 'document.llm_witness_failed'
             when t.lane='payroll_facts' then 'document.payroll_facts_failed'
             else 'document.invoice_facts_failed' end,
        null,null,null,null,
        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));
      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');
    end if;
  end if;
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts')
      and status='running';
  if t.lane in ('ocr','invoice_facts','statement_facts') and v_running>=v_cap then
    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
  end if;
  -- F-A1 PR-1 (M10): llm_witness gets its OWN concurrency window, counted over
  -- lane='llm_witness' alone -- it must NEVER be folded into the shared ocr/invoice_facts/
  -- statement_facts count above, or the slowest lane could starve the others' throughput.
  -- The limit column (llm_witness_concurrency) is nullable with a table-level default of 2,
  -- coalesced here exactly the way ocr_concurrency is above.
  -- #945: payroll_facts takes the SAME per-lane window, counted over its OWN lane. The limit
  -- COLUMN is shared (llm_witness_concurrency) because both are model-read lanes with the same
  -- cost shape and a firm that tunes one means both; the COUNT is per lane, which is the half
  -- that matters -- folding the two into one count would let a payroll backlog starve invoices.
  if t.lane in ('llm_witness','payroll_facts') then
    select coalesce(l.llm_witness_concurrency,2) into v_cap from clara.firms f
      left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
    select count(*)::int into v_running from clara.document_processing_tasks
      where firm_id=t.firm_id and lane=t.lane and status='running';
    if v_running>=v_cap then
      raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
    end if;
  end if;
  -- Q1: the CAPABILITY minted on this fresh claim — a random preimage whose digest ALONE
  -- is stored (never the preimage). Returned once, below, to this session only.
  v_secret:=gen_random_uuid()::text;
  update clara.document_processing_tasks set status='running',
    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1,
    claim_secret_digest=sha256(convert_to(v_secret,'UTF8'))
    where id=p_task;
  if t.lane='ocr' then update clara.documents set extraction_status='running' where id=t.document_id; end if;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,'document_id',t.document_id,
    'firm_id',t.firm_id,'lane',t.lane,'storage_path',d.storage_path,
    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size,
    'claim_secret',v_secret);
end $w945_claim$
;

CREATE OR REPLACE FUNCTION clara.release_held_document_tasks(p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $w945_release$
declare v_n int; v_ids uuid[];
begin
  -- The kill-switch RELEASE sweep. A lane that can be HELD and cannot be RELEASED is a
  -- permanent stall, so this lane list must track claim_document_processing_task's
  -- kill-switch list EXACTLY (0038 E4/E8; the migration tail re-asserts it).
  --
  -- F4 fix: 'held_egress' alone does NOT mean "kill-switch-blocked" -- the claim body
  -- writes three different hold reasons to that one status and records none of them. For
  -- the ONE lane that can be held for a reason the kill switch has no authority over
  -- (invoice_facts, the LEGACY purpose-blind consent gate) re-derive that gate FRESH, right
  -- here, off the same join the claim body runs (0038:6870-6878). A row this predicate
  -- declines stays held_egress, untouched.
  with picked as (
    select t.id from clara.document_processing_tasks t
    -- #945: payroll_facts joins BOTH lists together with the claim body's kill-switch list --
    -- a lane that can be HELD and cannot be RELEASED is a permanent stall.
    where t.status='held_egress' and t.lane in ('ocr','invoice_facts','statement_facts','llm_witness','payroll_facts')
      and (
        -- KILL-SWITCH-ONLY lanes. claim_document_processing_task runs no per-client LEGACY
        -- consent check for either: 'ocr' is pre-attribution, and 'statement_facts' is
        -- authorized by the TYPED (consent, activation) pair at enqueue -- reading the
        -- legacy table for it here would let a purpose-blind consent authorize a
        -- statement-specific vendor read (0038 E3 header / 0020 section 1). Their only
        -- hold cause is the switch this sweep's caller has already turned back on.
        t.lane in ('ocr','statement_facts','llm_witness','payroll_facts')
        or (t.lane='invoice_facts' and (
             exists (
               select 1 from clara.document_filings f
               where f.document_id=t.document_id and f.retired_at is null
             )
             and not exists (
               select 1 from clara.document_filings f
               where f.document_id=t.document_id and f.retired_at is null
                 and not exists (
                   select 1 from clara.client_egress_consents c
                   where c.client_id=f.client_id and c.revoked_at is null
                 )
             )
           ))
      )
    order by t.created_at,t.id for update skip locked
    limit greatest(1,least(p_limit,10000))
  ), moved as (
    update clara.document_processing_tasks t set status='queued'
    from picked p where t.id=p.id returning t.id
  )
  select count(*)::int,array_agg(id) into v_n,v_ids from moved;
  if v_ids is not null then
    update clara.documents d set extraction_status='pending'
      where d.id in (select t.document_id from clara.document_processing_tasks t
        where t.id=any(v_ids) and t.lane='ocr');
  end if;
  return jsonb_build_object('released',coalesce(v_n,0));
end $w945_release$
;

-- =====================================================================================
-- §F  THE PERSIST DOOR AND THE LANE'S OWN FAIL VERB.
--
--     clara.persist_payroll_facts(uuid, jsonb, jsonb, integer) is the ONE writer of payroll
--     facts: the atomic, idempotent two-row persist the invoice lane's clara.persist_witness_facts
--     set the shape for. clara.fail_payroll_facts(uuid, text) is its terminal twin.
--
--     WHAT IT STORES, AND THE ONE THING IT DELIBERATELY DOES NOT. The brief is explicit: "no
--     employee-level figure is persisted; the per-employee quotes exist only so the evaluator can
--     sum and cross-check them." That is not a promise this file makes in prose and leaves to a
--     runtime to keep — the door STRIPS the rows. What lands in clara.document_extractions.envelope
--     is the channel's eleven RUN-LEVEL answers plus, on the text row, the fact state §D computed;
--     the per-employee cells are consumed inside this transaction and never written. A payroll
--     document therefore leaves no durable record of any employee's name or salary, which is what
--     keeps #612's and #643's "full payroll processing stays out" true while #926's reading half
--     ships.
--
--     THE FACT STATE RIDES WITH THE READ RATHER THAN BEING RE-DERIVED, and that is a consequence
--     of the strip, stated so a reader does not mistake it for redundancy: §D's evaluator is
--     IMMUTABLE and could in principle be re-run on demand — but not from what is stored, because
--     what is stored no longer contains the rows it sums. So the state is banked at the one moment
--     the inputs exist, beside the answers it judges.
--
--     THE REGIONS ARE THE TYPED FACTS. One clara.document_regions row per run-level question,
--     hung off the CANONICAL text row of the pair, carrying the verbatim rendering, the DB's own
--     integer cents where the two channels agreed on a readable figure, and a locator — so a
--     person can click a figure and see where on the page it came from. AN UNPRINTED ANSWER STILL
--     GETS A ROW, carrying no rendering and no cents at all: that row IS the reading "the page
--     does not print this", and it is the reason the surface can say `not printed` instead of
--     showing a zero. (A figure the two channels read DIFFERENTLY also lands with no cents; the
--     region set is the facts, the banked state is the verdict, and the surface reads both.)
--
--     PERSIST WHOLE; NEVER REFUSE A READ FOR BEING WRONG. Structural malformation — a broken
--     vocabulary, a missing or unresolvable pin, two channels on one prompt — is refused at the
--     write boundary, before anything is inserted. A read that is well-formed but DISAGREES with
--     itself is banked in full, with the disagreement named in the state. That is the invoice
--     lane's own C4 discipline, applied here for the same reason: a person cannot adjudicate a
--     reading they cannot see.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.persist_payroll_facts(p_task uuid, p_text jsonb, p_vision jsonb,
    p_pages_used integer default null)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $ppf$
declare
  t record; d record;
  v_run text[] := array['payroll.run.period','payroll.run.gross_pay',
    'payroll.run.epf_employee','payroll.run.epf_employer',
    'payroll.run.socso_employee','payroll.run.socso_employer',
    'payroll.run.eis_employee','payroll.run.eis_employer',
    'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay'];
  v_text_env jsonb; v_vision_env jsonb; v_state jsonb;
  v_text_pin text; v_vision_pin text; v_text_hash text; v_vision_hash text;
  v_citations jsonb; v_usage_text jsonb; v_usage_vision jsonb;
  v_existing_text uuid; v_existing_vision uuid; v_ocr_ext uuid;
  v_vision_id uuid; v_text_id uuid; v_vision_at timestamptz; v_text_at timestamptz;
  v_text_store jsonb; v_vision_store jsonb;
  v_f text; v_ans jsonb; v_fact jsonb; v_raw text; v_cents bigint; v_idx int;
  v_cited_id uuid; v_cited_locator jsonb; v_locator jsonb;
begin
  if p_pages_used is not null and p_pages_used < 0 then
    raise exception 'payroll pages_used must be non-negative' using errcode='CLR10';
  end if;

  -- 1. TASK LOOKUP + LANE.
  select * into t from clara.document_processing_tasks where id = p_task;
  if not found or t.lane <> 'payroll_facts' then
    raise exception 'payroll-facts task not found or not in the payroll_facts lane' using errcode='CLR16';
  end if;

  -- 2. IDEMPOTENT REPLAY (the persist_invoice_facts precedent): a done task's pair already
  --    exists under the four-column unique; return the stored receipt, never re-insert.
  if t.status = 'done' then
    select id into v_existing_text from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='payroll_text_facts';
    select id into v_existing_vision from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='payroll_vision_facts';
    return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
      'engine_id',t.engine_id,'version_n',t.version_n,
      'text_extraction_id',v_existing_text,'vision_extraction_id',v_existing_vision,
      'status','done','replayed',true);
  end if;

  -- 3. THE ANSWER VOCABULARY (structural).
  v_text_env := p_text->'envelope'; v_vision_env := p_vision->'envelope';
  if not clara._payroll_answers_ok(v_text_env,'text')
     or not clara._payroll_answers_ok(v_vision_env,'vision') then
    raise exception 'payroll envelope is malformed (channel/answers vocabulary -- every run-level question is answered, `not_printed` included, and no unknown key is admitted)' using errcode='CLR10';
  end if;

  -- 4. THE INPUT PINS (structural). Text pins the PINNED, done, engine_kind='ocr' extraction of
  --    THIS document; vision pins documents.sha256 -- the document's own bytes.
  v_text_pin := nullif(btrim(p_text->>'input_pin'),'');
  v_vision_pin := nullif(btrim(p_vision->>'input_pin'),'');
  if v_text_pin is null or v_vision_pin is null then
    raise exception 'payroll call is missing an input pin' using errcode='CLR10';
  end if;
  select * into d from clara.documents where id = t.document_id and firm_id = t.firm_id;
  if not found then
    raise exception 'impossible state: payroll task % names no owning document', p_task using errcode='CLR35';
  end if;
  begin
    select e.id into v_ocr_ext from clara.document_extractions e
      where e.id = v_text_pin::uuid and e.document_id = t.document_id and e.firm_id = t.firm_id
        and e.engine_kind = 'ocr' and e.status = 'done';
  exception when invalid_text_representation then
    v_ocr_ext := null;
  end;
  if v_ocr_ext is null then
    raise exception 'the text payroll input pin does not resolve to a done OCR extraction of this document' using errcode='CLR10';
  end if;
  if lower(v_vision_pin) <> d.sha256 then
    raise exception 'the vision payroll input pin does not match documents.sha256' using errcode='CLR10';
  end if;

  -- 5. EQUAL PROMPT HASHES (structural) -- the independence receipt. Two channels that used one
  --    prompt are one reading twice, not two readings.
  v_text_hash := nullif(btrim(p_text->>'prompt_hash'),'');
  v_vision_hash := nullif(btrim(p_vision->>'prompt_hash'),'');
  if v_text_hash is null or v_vision_hash is null then
    raise exception 'payroll call is missing a prompt hash' using errcode='CLR10';
  end if;
  if v_text_hash = v_vision_hash then
    raise exception 'the text and vision channels used the same prompt hash -- the independence receipt requires distinct prompts' using errcode='CLR10';
  end if;

  v_citations := coalesce(p_text->'citations','[]'::jsonb);
  if jsonb_typeof(v_citations) <> 'array' then
    raise exception 'payroll citations payload is malformed' using errcode='CLR10';
  end if;

  if t.status <> 'running' then
    raise exception 'payroll-facts task is not running' using errcode='CLR16';
  end if;

  -- 6. THE EVALUATOR. Called BEFORE anything is written, on the FULL envelopes -- the only
  --    moment at which the per-employee quotes exist inside this estate at all.
  v_state := clara.evaluate_payroll_run_state_v1(v_text_env, v_vision_env);

  -- 7. THE STRIP. What is stored is the channel and its eleven run-level answers, and nothing
  --    else. `rows` is dropped from both envelopes here, once, by construction -- there is no
  --    branch in which a per-employee cell reaches clara.document_extractions.
  v_text_store := jsonb_build_object(
    'payroll', jsonb_build_object('channel','text','answers', v_text_env->'payroll'->'answers'),
    'payroll_state', v_state);
  v_vision_store := jsonb_build_object(
    'payroll', jsonb_build_object('channel','vision','answers', v_vision_env->'payroll'->'answers'));

  -- 8. THE ATOMIC PAIR INSERT -- vision FIRST, text LAST, each with an explicit clock reading, so
  --    the document-wide pointer lands on the TEXT row deterministically (the witness precedent).
  v_vision_at := clock_timestamp();
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
      status,page_count,envelope,extracted_at)
    values(t.firm_id,t.document_id,t.engine_id,'payroll_vision_facts',t.version_n,
      'done',p_pages_used,v_vision_store,v_vision_at)
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_vision_id;
  if v_vision_id is null then
    raise exception 'impossible state: an ON CONFLICT fired for the payroll vision row (document=%,engine=%,version=%) -- the pair row already exists at this key while its task is still running',
      t.document_id,t.engine_id,t.version_n using errcode='CLR35';
  end if;

  v_text_at := greatest(clock_timestamp(), v_vision_at + interval '1 microsecond');
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
      status,page_count,envelope,extracted_at)
    values(t.firm_id,t.document_id,t.engine_id,'payroll_text_facts',t.version_n,
      'done',p_pages_used,v_text_store,v_text_at)
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_text_id;
  if v_text_id is null then
    raise exception 'impossible state: an ON CONFLICT fired for the payroll text row (document=%,engine=%,version=%) -- the pair row already exists at this key while its task is still running',
      t.document_id,t.engine_id,t.version_n using errcode='CLR35';
  end if;

  -- 9. THE ELEVEN TYPED FACTS. One region per question, ANSWERED OR NOT.
  --
  --    The rendering comes from the TEXT channel -- the channel that can cite a region, and so
  --    the channel whose quote a person can be shown on the page. The CENTS come from the fact
  --    state, which is to say they exist only where the two channels agreed on a readable
  --    figure: a contested or unreadable figure lands with its rendering and NO integer, because
  --    there is no integer both readings support. An unprinted answer lands with neither, and
  --    that row is the reading "the page does not print this" -- never a zero.
  foreach v_f in array v_run loop
    v_ans := v_text_env->'payroll'->'answers'->v_f;
    v_fact := v_state->'facts'->v_f;
    v_raw := case when v_ans->>'state' = 'value' then v_ans->>'raw' end;
    v_cents := case when v_f <> 'payroll.run.period'
                    then nullif(v_fact->>'printed_cents','')::bigint end;

    -- The citation, when the text call supplied one for this question. Resolved through the ONE
    -- numbering the estate publishes (clara.witness_citation_regions / _witness_resolve_citation
    -- are the numbering, not an invoice-specific rule: they answer "the Nth region of this OCR
    -- extraction, in reading order"), so a payroll prompt builder numbers against exactly what
    -- this door resolves.
    v_cited_id := null; v_cited_locator := null; v_idx := null;
    if v_raw is not null then
      select c.region_idx into v_idx
        from jsonb_to_recordset(v_citations) as c(field_path text, region_idx int)
       where c.field_path = v_f limit 1;
      if v_idx is not null then
        select r.region_id, r.locator into v_cited_id, v_cited_locator
          from clara._witness_resolve_citation(v_ocr_ext, v_idx) r;
      end if;
    end if;
    if v_cited_id is not null then
      v_locator := jsonb_build_object(
        'page', case when (v_cited_locator->>'page') ~ '^[0-9]+$' then (v_cited_locator->>'page')::int end,
        'polygon', coalesce(v_cited_locator->'polygon','[]'::jsonb), 'source_region_id', v_cited_id);
    else
      v_locator := jsonb_build_object('polygon','[]'::jsonb);
    end if;

    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
        text_content,engine_confidence,monetary_raw,monetary_cents)
      values(t.firm_id,v_text_id,'page_polygon',v_locator,v_f,
        v_raw,null,
        case when v_f <> 'payroll.run.period' then v_raw end,
        v_cents);
  end loop;

  -- 10. USAGE METERING, optional at this layer exactly as it is for the witness pair: the runtime
  --     meters at call time (it alone knows a call that never reaches a persist), and a caller MAY
  --     also pass usage here so a pair that DOES persist carries at least one row per channel.
  v_usage_text := p_text->'usage'; v_usage_vision := p_vision->'usage';
  if jsonb_typeof(v_usage_text) = 'object' then
    perform clara.record_llm_usage_event(t.firm_id, t.document_id, p_task, 'text', t.engine_id,
      v_text_hash, nullif(v_usage_text->>'input_tokens','')::int,
      nullif(v_usage_text->>'output_tokens','')::int, nullif(v_usage_text->>'duration_ms','')::int,
      coalesce(v_usage_text->>'outcome','success'));
  end if;
  if jsonb_typeof(v_usage_vision) = 'object' then
    perform clara.record_llm_usage_event(t.firm_id, t.document_id, p_task, 'vision', t.engine_id,
      v_vision_hash, nullif(v_usage_vision->>'input_tokens','')::int,
      nullif(v_usage_vision->>'output_tokens','')::int, nullif(v_usage_vision->>'duration_ms','')::int,
      coalesce(v_usage_vision->>'outcome','success'));
  end if;

  -- 11. SETTLE + AUDIT + EMIT. The event is the lane's OWN twin: nothing in this estate drafts
  --     from a payroll read yet (#946 is the drafting half), so its taxonomy decision is `ignore`
  --     and no consumer wakes -- but the fact that the read completed is on the record, where a
  --     later consumer can subscribe to it without a second migration.
  update clara.document_processing_tasks set status='done', finished_at=now() where id=p_task;

  perform clara._audit(t.firm_id,null,null,null,'persist_payroll_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,
      'text_extraction',v_text_id,'vision_extraction',v_vision_id,'version',t.version_n,
      'established',jsonb_array_length(coalesce(v_state->'established','[]'::jsonb)),
      'disagreed',jsonb_array_length(coalesce(v_state->'disagreed','[]'::jsonb)),
      'missing',jsonb_array_length(coalesce(v_state->'missing','[]'::jsonb))));

  perform clara._append_event(t.firm_id,'document.payroll_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_text_id,'version_n',t.version_n));

  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
    'engine_id',t.engine_id,'version_n',t.version_n,
    'text_extraction_id',v_text_id,'vision_extraction_id',v_vision_id,
    'status','done','replayed',false);
end $ppf$;

revoke all on function clara.persist_payroll_facts(uuid, jsonb, jsonb, integer) from public;
grant execute on function clara.persist_payroll_facts(uuid, jsonb, jsonb, integer) to clara_runtime;

comment on function clara.persist_payroll_facts(uuid, jsonb, jsonb, integer) is
  '#945: the ONE writer of payroll typed facts -- the atomic, idempotent two-row persist for the payroll_facts lane, clara.persist_witness_facts'' shape. It evaluates the pair through clara.evaluate_payroll_run_state_v1 BEFORE writing, STRIPS the per-employee quotes (no employee-level figure is ever persisted), banks the two channels'' run-level answers plus the fact state, and writes one clara.document_regions row per run-level question -- including for an answer the page does not print, which lands carrying no rendering and no cents so a surface can say `not printed` instead of showing a zero. clara_runtime only.';

create or replace function clara.fail_payroll_facts(p_task uuid, p_code text)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $fpf$
declare t record; v_code text;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found or t.lane<>'payroll_facts' then
    raise exception 'payroll-facts task not found' using errcode='CLR16';
  end if;
  if t.status='failed' then
    return jsonb_build_object('task_id',p_task,'status','failed',
      'reason',coalesce(t.error_code,p_code),'replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'payroll-facts task is not running' using errcode='CLR16';
  end if;
  -- THE ADMITTED VOCABULARY -- the exact codes this lane''s worker can terminally report, and
  -- nothing broader. Anything else coerces to ''engine_error'', exactly as fail_witness_facts and
  -- fail_invoice_facts already coerce an unrecognised reason.
  v_code:=case when p_code in ('bad_type','limit','internal','corrupt','encrypted',
      'payroll_consent_inactive','payroll_multi_client','wait_exhausted')
    then p_code else 'engine_error' end;
  update clara.document_processing_tasks set status='failed',error_code=v_code,
    finished_at=now() where id=p_task;
  -- Harmless unconditionally: payroll_facts never reserves a page budget (it is a model lane, and
  -- the router reserves for the two Azure lanes alone), so this always finds no reservation --
  -- called anyway for the SAME reason its siblings call it: one shape over a lane-conditional one.
  perform clara._refund_processing_call(p_task,coalesce(nullif(btrim(p_code),''),v_code));
  perform clara._audit(t.firm_id,null,null,null,'fail_payroll_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'reason',v_code));
  perform clara._append_event(t.firm_id,'document.payroll_facts_failed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason',v_code));
  return jsonb_build_object('task_id',p_task,'status','failed','reason',v_code);
end $fpf$;

revoke all on function clara.fail_payroll_facts(uuid, text) from public;
grant execute on function clara.fail_payroll_facts(uuid, text) to clara_runtime;

comment on function clara.fail_payroll_facts(uuid, text) is
  '#945: the terminal settle for a RUNNING payroll_facts task -- clara.fail_witness_facts'' shape exactly, with the payroll lane''s own admitted code vocabulary and its own lane-true event twin. clara_runtime only.';

-- =====================================================================================
-- §G  THE CAPABILITY REGISTRY IS RE-DERIVED (AC4, second half).
--
--     THE REGISTRY IS A DERIVED CLAIM, NOT AN OPINION. `stored_only` on the payroll summary's
--     typed-facts axis was DERIVED from the router's own dead end — its reason sentence said so
--     in words ("The facts router terminates this pair cleanly (skipped_kind / skipped_type):
--     the document stays stored and readable and Clara derives no typed facts from it"). §E
--     removed that dead end, so leaving the registry alone would not be conservatism, it would
--     be a false statement about what this estate does. The two changes are one change.
--
--     SIX FORMATS MOVE, AND ONLY SIX. The router's payroll arm sits on the pdf/image mime
--     branch, so exactly the pairs whose mime is application/pdf or image/* gain a reader: pdf,
--     png, jpeg, tiff, webp, heic. csv/tsv/xlsx/docx and ofx keep `stored_only` — a spreadsheet
--     payroll export has no reader on this lane and the registry must not imply one — and
--     xml keeps `unsupported`, because the local lane reads MyInvois UBL only.
--
--     business_operation DOES NOT MOVE. #945 is the READING half; #946 is the drafting and
--     posting half. A registry that promised an operation over facts nothing yet posts would be
--     the exact overclaim this relation exists to prevent, and the live battery's own cell
--     ("business_operation never claims supported where typed_facts is not supported") is
--     one-directional precisely so that reading may run ahead of posting.
--
--     THE LIMIT IS NAMED, IN #782's OWN TWO-KEY SHAPE. The per-employee detail is not `planned`
--     — it is a permanent boundary this lane is built to hold (§F strips the quotes inside the
--     writer), so it is published as an `accepted_limitation` with a sibling reason key that
--     says the checkable fact: the quotes are summed and then discarded.
--
--     UPDATE, NEVER DELETE-THEN-INSERT (#846's wall), and the version raise is REGISTRY-WIDE
--     (0228's precedent, 0245's second use) because the registry's one-version law is enforced
--     by both the live battery and 0244's deferred uniformity trigger.
--
--     REDO-SAFE, and this is the one place it took a decision: the raise is written as a
--     SET-TO-LITERAL guarded by `where registry_version <> 5`, not as 0245's `+ 1`. A `+ 1`
--     re-run would carry the registry to 6 and every later reader's expectation with it. The
--     prestate accepts a registry at 4 (first apply) or already at 5 (redo) for the same reason
--     every other pin in this file is bimodal.
-- =====================================================================================
set role clara_fn_owner;

-- G1 · THE CONTENT. Additive on `limits` (0228's `limits || jsonb` idiom, which keeps any key a
--      later file adds), and an outright rewrite of the two columns whose old values described
--      the dead end. Scoped by MIME rather than by a transcribed format list, so it names the
--      same six pairs the router's own branch does.
update clara.document_capabilities
   set typed_facts = 'supported',
       basis = 'Bytes are sealed at intake and read by ' || engine_byte
             || '. Typed facts are persisted with source regions by llm-openai:gpt-5.6-terra:payroll-witness-v1: '
             || 'the run''s month and its printed totals for gross pay, employee and employer EPF, SOCSO and EIS, '
             || 'PCB and any HRDF levy. Clara reports what the page prints and a deterministic evaluator does every sum — '
             || 'she never adds anything up herself, never infers a rate or a threshold, and a figure the page does not '
             || 'print is reported as not printed rather than filled with zero. The per-employee rows are quoted only so '
             || 'the evaluator can sum and cross-check them and are never persisted. Nothing is posted from these facts '
             || 'yet; the filing appears as work a person completes.',
       limits = limits || jsonb_build_object(
         'payroll_employee_detail', 'accepted_limitation',
         'payroll_employee_detail_reason', 'quotes_are_summed_then_discarded')
 where document_kind = 'payroll_summary'
   and (mime_type = 'application/pdf' or mime_type like 'image/%')
   and (typed_facts <> 'supported' or not (limits ? 'payroll_employee_detail'));

-- G2 · THE REGISTRY-WIDE RAISE. One statement, every row, to the literal this file publishes at,
--      so `count(distinct registry_version)` stays 1 — enforced by the live battery AND by
--      0244's deferred constraint trigger. 0207's wall sees each row's transition and permits it
--      because it is a raise; 0244's high-water writer raises every pair's mark in lockstep, as
--      an AFTER trigger.
update clara.document_capabilities
   set registry_version = 5
 where registry_version <> 5;

reset role;

-- =====================================================================================
-- §Z  TAIL. Everything this file claims to have done, re-derived from the live catalog.
-- =====================================================================================
do $w945_tail$
declare
  v_sha text; v_n int; v_row record;
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

  -- 4 · THE ANSWER-VOCABULARY GATE EXISTS, IS CLOSED, AND IS REACHED BY NOBODY BUT THE OWNER.
  --     Driven, not asserted: a complete envelope is admitted, the same envelope missing one
  --     answer is refused, and the same envelope carrying one extra key is refused.
  if to_regprocedure('clara._payroll_answers_ok(jsonb,text)') is null then
    raise exception '#945 tail: clara._payroll_answers_ok was not created' using errcode = 'CLR10';
  end if;
  if not clara._payroll_answers_ok(
       jsonb_build_object('payroll', jsonb_build_object(
         'channel','text',
         'answers', (select jsonb_object_agg(f, jsonb_build_object('state','value','raw','1.00'))
                       from unnest(array['payroll.run.period','payroll.run.gross_pay',
                         'payroll.run.epf_employee','payroll.run.epf_employer',
                         'payroll.run.socso_employee','payroll.run.socso_employer',
                         'payroll.run.eis_employee','payroll.run.eis_employer',
                         'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay']) f),
         'rows','[]'::jsonb)), 'text') then
    raise exception '#945 tail: a complete payroll envelope was REFUSED by its own vocabulary gate'
      using errcode = 'CLR10';
  end if;
  if clara._payroll_answers_ok(
       jsonb_build_object('payroll', jsonb_build_object(
         'channel','text',
         'answers', (select jsonb_object_agg(f, jsonb_build_object('state','value','raw','1.00'))
                       from unnest(array['payroll.run.period','payroll.run.gross_pay',
                         'payroll.run.epf_employee','payroll.run.epf_employer',
                         'payroll.run.socso_employee','payroll.run.socso_employer',
                         'payroll.run.eis_employee','payroll.run.eis_employer',
                         'payroll.run.pcb','payroll.run.hrdf_levy']) f),
         'rows','[]'::jsonb)), 'text') then
    raise exception '#945 tail: an envelope missing payroll.run.net_pay was ADMITTED -- every question must be answered'
      using errcode = 'CLR10';
  end if;
  if clara._payroll_answers_ok(
       jsonb_build_object('payroll', jsonb_build_object(
         'channel','text',
         'answers', (select jsonb_object_agg(f, jsonb_build_object('state','value','raw','1.00'))
                       from unnest(array['payroll.run.period','payroll.run.gross_pay',
                         'payroll.run.epf_employee','payroll.run.epf_employer',
                         'payroll.run.socso_employee','payroll.run.socso_employer',
                         'payroll.run.eis_employee','payroll.run.eis_employer',
                         'payroll.run.pcb','payroll.run.hrdf_levy','payroll.run.net_pay',
                         'payroll.run.bonus']) f),
         'rows','[]'::jsonb)), 'text') then
    raise exception '#945 tail: an envelope carrying an unknown answer key was ADMITTED -- the vocabulary is no longer closed'
      using errcode = 'CLR10';
  end if;
  if pg_catalog.has_function_privilege('clara_authenticated','clara._payroll_answers_ok(jsonb,text)','EXECUTE')
     or pg_catalog.has_function_privilege('clara_runtime','clara._payroll_answers_ok(jsonb,text)','EXECUTE')
     or pg_catalog.has_function_privilege('clara_agent_ro','clara._payroll_answers_ok(jsonb,text)','EXECUTE') then
    raise exception '#945 tail: an application role holds EXECUTE on clara._payroll_answers_ok -- it is an internal'
      using errcode = 'CLR10';
  end if;

  -- 5 · THE LANE EXISTS AT EVERY WALL THAT HAS TO ADMIT IT, and the five recut bodies all carry
  --     it. A lane one wall admits and another refuses is a lane that stalls mid-flight.
  for v_row in select * from (values
      ('ck_processing_task_lane_f_a1','document_processing_tasks'),
      ('ck_processing_task_lane_engine_f_a1_stmt','document_processing_tasks'),
      ('ck_processing_task_error_code_f_a1','document_processing_tasks'),
      ('ck_processing_task_binding_f_a1','document_processing_tasks'),
      ('ck_document_extractions_engine_kind_f_a1','document_extractions')
    ) as t(conname, relname)
  loop
    select count(*)::int into v_n from pg_constraint
     where conrelid = ('clara.' || v_row.relname)::regclass and conname = v_row.conname;
    if v_n <> 1 then
      raise exception '#945 tail: % is not on clara.%', v_row.conname, v_row.relname using errcode = 'CLR10';
    end if;
  end loop;
  for v_row in select * from (values
      ('clara._enqueue_invoice_facts_core(uuid)'), ('clara.enqueue_invoice_facts(uuid)'),
      ('clara._tf_processing_task_update()'),
      ('clara.claim_document_processing_task(uuid,text,boolean)'),
      ('clara.release_held_document_tasks(integer)')
    ) as t(sig)
  loop
    if not exists (select 1 from pg_proc p
                    where p.oid = v_row.sig::regprocedure
                      and position('payroll_facts' in p.prosrc) > 0) then
      raise exception '#945 tail: % does not name the payroll_facts lane -- the recut did not land', v_row.sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 6 · THE LANE'S TWO EVENT TYPES ARE REGISTERED AND ROUTED. clara.domain_events carries an FK
  --     onto clara.event_types, so an unregistered type is an INSERT failure at the worst moment.
  select count(*)::int into v_n from clara.event_types
   where name in ('document.payroll_facts_completed','document.payroll_facts_failed') and client_scoped;
  if v_n <> 2 then
    raise exception '#945 tail: % of the 2 payroll event types are registered client-scoped', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version = t.version
   where t.event_type in ('document.payroll_facts_completed','document.payroll_facts_failed')
     and t.decision = 'ignore';
  if v_n <> 2 then
    raise exception '#945 tail: % of the 2 payroll event types are routed at the active taxonomy version', v_n
      using errcode = 'CLR10';
  end if;

  -- 7 · NO OTHER LANE MOVED. The three lane rosters this file widened still carry every value
  --     they carried before, so this is a widening and not a re-shuffle.
  for v_row in select * from unnest(array['ocr','structured_parse','none','invoice_facts',
      'local_facts','classify','statement_facts','statement_parse','llm_witness','payroll_facts']) as t(lane)
  loop
    if position('''' || v_row.lane || '''' in
        (select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'clara.document_processing_tasks'::regclass
            and conname = 'ck_processing_task_lane_f_a1')) = 0 then
      raise exception '#945 tail: the lane roster lost %', v_row.lane using errcode = 'CLR10';
    end if;
  end loop;

  -- 8 · THE LANE'S TWO DOORS EXIST, ARE clara_runtime-ONLY, AND ARE THE ONLY NEW GRANTED
  --     SURFACE. #945 adds no human EXECUTE at all: a person reads payroll facts back through
  --     get_document_extract, which already serves every family, and writes none.
  for v_row in select * from (values
      ('clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)'),
      ('clara.fail_payroll_facts(uuid,text)')
    ) as t(sig)
  loop
    if to_regprocedure(v_row.sig) is null then
      raise exception '#945 tail: % was not created', v_row.sig using errcode = 'CLR10';
    end if;
    if not pg_catalog.has_function_privilege('clara_runtime', v_row.sig, 'EXECUTE') then
      raise exception '#945 tail: clara_runtime cannot execute % -- the lane would be undrivable', v_row.sig
        using errcode = 'CLR10';
    end if;
    if pg_catalog.has_function_privilege('clara_authenticated', v_row.sig, 'EXECUTE')
       or pg_catalog.has_function_privilege('clara_agent_ro', v_row.sig, 'EXECUTE') then
      raise exception '#945 tail: a non-runtime role holds EXECUTE on % -- writing a payroll read is a worker act', v_row.sig
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_row.sig::regprocedure
       and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n <> 1 then
      raise exception '#945 tail: % does not carry the estate posture (fn_owner, SECURITY DEFINER, pinned search_path)', v_row.sig
        using errcode = 'CLR10';
    end if;
  end loop;
  if pg_catalog.has_function_privilege('clara_runtime','clara.evaluate_payroll_run_state_v1(jsonb,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('clara_authenticated','clara.evaluate_payroll_run_state_v1(jsonb,jsonb)','EXECUTE')
     or pg_catalog.has_function_privilege('clara_agent_ro','clara.evaluate_payroll_run_state_v1(jsonb,jsonb)','EXECUTE') then
    raise exception '#945 tail: an application role holds EXECUTE on the evaluator -- it is reached only from the persist door, which runs as the owner'
      using errcode = 'CLR10';
  end if;

  -- 9 · THE PERSIST DOOR STRIPS THE QUOTES, PROVEN BY ITS OWN BYTES. The body must never name
  --     the rows key on a value it writes: the two stored envelopes are built from `answers`
  --     alone, and this is the structural half of "no employee-level figure is persisted".
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)'::regprocedure
     and p.prosrc like '%''payroll'', jsonb_build_object(''channel'',''text'',''answers'', v_text_env->''payroll''->''answers'')%'
     and p.prosrc like '%''payroll'', jsonb_build_object(''channel'',''vision'',''answers'', v_vision_env->''payroll''->''answers'')%';
  if v_n <> 1 then
    raise exception '#945 tail: the persist door no longer builds BOTH stored envelopes from answers alone -- the per-employee strip is what keeps full payroll processing out of this estate'
      using errcode = 'CLR10';
  end if;

  -- 10 · THE REGISTRY RE-PUBLISHES, WHOLE, AT ONE NEW VERSION, and the six pairs that gained a
  --      reader say what is read while nobody else's row moves.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#945 tail: the registry publishes % distinct registry_versions -- the whole-registry raise is what keeps this at 1', v_n
      using errcode = 'CLR10';
  end if;
  select min(registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 5 then
    raise exception '#945 tail: the registry publishes version %, not 5', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities;
  if v_n <> 240 then
    raise exception '#945 tail: the registry now holds % rows -- this file inserts and deletes nothing', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary'
     and (mime_type = 'application/pdf' or mime_type like 'image/%')
     and typed_facts = 'supported'
     and business_operation = 'stored_only'
     and limits ->> 'payroll_employee_detail' = 'accepted_limitation'
     and limits ->> 'payroll_employee_detail_reason' = 'quotes_are_summed_then_discarded'
     and position('Typed facts are persisted with source regions by' in basis) > 0
     and position('terminates this pair cleanly' in basis) = 0;
  if v_n <> 6 then
    raise exception '#945 tail: % of the 6 payroll pdf/image pairs carry the re-derived verdict, its named limit and a reason sentence that no longer describes the removed dead end', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where limits ? 'payroll_employee_detail' and document_kind <> 'payroll_summary';
  if v_n <> 0 then
    raise exception '#945 tail: % row(s) outside the payroll family carry a payroll limit', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary' and typed_facts = 'supported'
     and not (mime_type = 'application/pdf' or mime_type like 'image/%');
  if v_n <> 0 then
    raise exception '#945 tail: % payroll pair(s) OFF the router''s pdf/image branch claim a reader they do not have', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version is distinct from c.registry_version;
  if v_n <> 0 then
    raise exception '#945 tail: % pair(s) carry a high-water mark that disagrees with the published registry after the raise', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where business_operation = 'supported' and typed_facts <> 'supported';
  if v_n <> 0 then
    raise exception '#945 tail: % row(s) promise an operation over facts that do not exist', v_n using errcode = 'CLR10';
  end if;
  if pg_catalog.has_table_privilege('clara_authenticated','clara.document_capabilities','INSERT')
     or pg_catalog.has_table_privilege('clara_authenticated','clara.document_capabilities','UPDATE')
     or pg_catalog.has_table_privilege('clara_authenticated','clara.document_capabilities','DELETE')
     or pg_catalog.has_table_privilege('clara_agent_ro','clara.document_capabilities','SELECT') then
    raise exception '#945 tail: an application role gained a write grant (or the agent lane gained SELECT) on the registry'
      using errcode = 'CLR10';
  end if;

  raise notice '#945 tail: OK -- the canonical field-path grammar registers the `payroll` namespace beside the five other fact families and still refuses an unregistered one with CLR10 / field_path_namespace; clara._field_path_conforms is byte-untouched and the recut body keeps its immutable, non-definer, clara_fn_owner disposition and all its EXECUTE holders; clara._payroll_answers_ok admits a complete envelope, refuses one missing an answer and one carrying an unknown key, and is granted to no application role.';
end
$w945_tail$;
