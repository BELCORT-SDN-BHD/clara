-- 0299_agreement_contract_acquisition — #948: A HIRE-PURCHASE OR FINANCE-LEASE AGREEMENT IS READ
-- THE WAY A PAYSLIP IS READ, AND THE ACQUISITION IT CREATES ON THE DAY IT IS SIGNED IS DRAFTED
-- INTO THE FIXED-ASSET LANE.
-- =====================================================================================
-- Spec of record: issue #948's Agent Brief (the issue body — its single comment, dated
-- 2026-09-19, is an AI triage note, not an owner ruling, so the body stands as the contract).
-- Re-verified live on this branch 2026-09-24 (`gh issue view 948 --comments`).
-- Parent: #926, owner ruling 2026-09-18 (option G) — "a payroll summary and a contract go down
-- the same lane as any other accounting document, read and posted, not merely stored".
--
-- THE TRIAGE COMMENT'S FACTUAL CORRECTION IS THE DESIGN HERE, not a footnote. AC4's "existing
-- birth door" does not exist and must not be invented: `clara._tf_fa_acquisition_birth`
-- (0216_fixed_asset_acquisition.sql) is a lane-AGNOSTIC deferred constraint trigger on
-- clara.journal_entries. It fires on any entry that reaches `approved`, whatever posted it, and
-- for every line debiting an account enrolled in clara.fa_account_profiles
-- (0041_wave_d_a_fa_register.sql) it inserts the clara.fixed_assets row itself, idempotently
-- against clara._fa_on_approve arm 4, reading the account's live depreciation policy
-- (clara.fa_account_depreciation_policies, #932) for the particulars. So the drafting body below
-- calls NOTHING fixed-asset-specific. It posts an ordinary entry that debits the enrolled asset
-- account, and the trigger does the rest — which is also how "depreciation particulars come from
-- the account's policy and are never invented here" (AC4) is made true structurally rather than
-- by a promise: this file writes no depreciation column anywhere.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. It widens the estate so an agreement contract can be READ
-- and, when it is a financing agreement whose arithmetic holds, POSTED: one new field-path
-- namespace, one new closed answer vocabulary, one new deterministic evaluator (registered in
-- clara.evaluator_versions in this same file), one new lane on the facts router in place of its
-- `skipped_kind` dead end, one new persist door, a drafting body, an unattended gate, the post it
-- acts on, one new derived Needs-you row kind, and a re-derivation of the capability registry
-- that stops calling the pair `stored_only`.
--
-- ===================== DEPLOY ORDER: DATABASE FIRST, RUNTIME SECOND =====================
-- Identical in shape and in reason to 0296's. The persist door validates the answer envelope
-- against clara._agreement_answers_ok, so a runtime image answering a WIDER questionnaire than
-- the live validator admits would be refused on EVERY persist and the lane would bank nothing at
-- all. In the other order — database first — the widened validator simply has no caller yet, and
-- the router's new `contract_facts` lane queues tasks that a pre-#948 reconciler declines to
-- dispatch (`enqueueForLane` returns undefined for a lane it does not know and logs the gap;
-- packages/runtime/lib/reconciler-documents.mjs) rather than mis-driving them down another
-- family's workflow. Nothing dark: the queued task is visible on the document's own task trail
-- and terminal-free, and the image that lands second drains it.
--
-- THE WRITE-QUIET OBLIGATION ON THE RECUT LIVE BODIES. Five router-side bodies are recut below.
-- Between this apply and the runtime image, the ONLY behavioural difference on an
-- agreement_contract pdf/image is that the router stops minting the terminal
-- `failed/skipped_kind` receipt and mints a `queued` row on the new lane instead. It writes no
-- extraction, no region, no fact, no event, no entry and no journal effect of any kind in that
-- window — the persist door is the only writer of agreement facts and the only caller of the
-- post, and no live image calls it yet. Every other document kind's path through those bodies is
-- byte-identical to its pre-image.
--
-- THE ACCOUNT CODES THIS LANE POSTS TO ALREADY EXIST, AND THIS FILE PLANTS NO CHART ROW.
-- 0150_coa_template_pr_a.sql seeds, under family `borrowings_and_lease_liabilities`:
--   2430 Hire Purchase Creditor · 2440 Hire Purchase Interest Suspense · 2450 Finance Lease
--   Obligation
-- and under `trade_payables`: 2010 Other Payables. The wave's shared rows are 0295's (2040
-- Salaries Payable, 2050 Rent Payable, 1180 Accrued Income, 2030 Deferred Revenue), consumed by
-- code and name and never re-minted; this file touches clara.coa_template_accounts not at all.
--
-- THE ACCOUNTING TREATMENT, AND WHY IT DIFFERS BY KIND (AGENTS.md rule 6: checked against the
-- standard, not against what is convenient).
--   HIRE PURCHASE — the GROSS method, which is what the estate's own standard chart already
--   encodes by shipping an *Interest Suspense* account beside the *Creditor*: the whole amount
--   payable under the agreement is a liability at signing and the unexpired finance charge sits
--   in suspense against it.
--       Dr  <enrolled asset account>        cash price
--       Dr  2440 HP Interest Suspense       total charges       (only where the page prints them)
--           Cr  2430 HP Creditor            amount financed + total charges
--           Cr  2010 Other Payables         deposit             (only where the page states one)
--   FINANCE LEASE — the NET method. MPERS Section 20.9 has the lessee recognise the asset and
--   the lease liability at the LOWER of fair value and the present value of the minimum lease
--   payments, with the finance charge allocated over the term as it accrues; the liability is
--   therefore recorded NET of the unexpired charge, and the standard chart agrees — it ships
--   2450 Finance Lease Obligation with NO interest-suspense counterpart.
--       Dr  <enrolled asset account>        cash price
--           Cr  2450 Finance Lease Obligation   amount financed
--           Cr  2010 Other Payables             deposit         (only where the page states one)
--   BOTH entries balance on the evaluator's OWN identity, deposit + financed = cash price, which
--   is exactly the check AC2 names: an agreement whose printed figures fail it cannot produce a
--   balanced entry and does not post.
--
-- WHY THE DEPOSIT LEG CREDITS A PAYABLE AND NEVER A BANK ACCOUNT. Clara did not see the money
-- move. The agreement STATES a deposit; it does not state which of this client's bank accounts
-- paid it, and choosing one would be Clara choosing rather than reading. This is the estate's own
-- "an expectation is posted, the real payment arrives later and is reconciled" shape — the owner
-- cross-referenced it across #938, #947 and #949 on 2026-09-18 — so the deposit is credited to
-- 2010 Other Payables, named in the leg's description, and the bank line that actually paid it
-- clears that payable through the ordinary matcher. Whether the owner would rather see a
-- dedicated deposit-clearing row on the standard chart is a product question this file records
-- for #948's report and does not answer by minting one.
--
-- WHICH ASSET ACCOUNT, AND WHY AMBIGUITY IS A REFUSAL RATHER THAN A GUESS. The page prints what
-- was acquired as PROSE ("Toyota Hilux 2.8 AT"), and no reading of prose is an account code. The
-- lane therefore resolves the asset account from the CLIENT'S OWN ENROLMENTS
-- (clara.fa_account_profiles, active): exactly one active enrolment resolves; none or several is
-- a NAMED refusal a person clears by enrolling the account, or by telling Clara which one. That
-- is the standing owner ruling applied verbatim — Clara asks for a professional judgement rather
-- than inventing one — and it is also what makes the birth trigger's own precondition true by
-- construction.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Every claim this file makes about what it is building on, MEASURED on the lane
--     rig (127.0.0.1:55741 / clara_l01) on 2026-09-24, never transcribed from another file. The
--     pins are what #945, #946 and #947 left live on this branch, not what their own headers
--     pinned: three tickets of this lane recut bodies between 0295 and here.
--
--     BIMODAL BY CONSTRUCTION (#957 redo). Every body this file RECUTS is pinned to TWO
--     acceptable shas: its PRE-IMAGE (a first apply) or a body already carrying this file's own
--     marker (a redo of an edited 0299, which `create or replace` makes safe to re-run). Anything
--     else is drift and is refused by name. The wave-3 addendum's warning is honoured in the
--     ticket report: the FIRST-APPLY branch is proven separately, inside a rolled-back
--     transaction that restores the pre-images and runs this prestate verbatim, because
--     CLARA_MIGRATION_REDO can only ever exercise the marker branch.
-- =====================================================================================
do $w948_pre$
declare
  v_sha text; v_n int; v_mode text; v_marked boolean; v_row record;
begin
  -- (a) THE GRAMMAR THIS FILE RECUTS. clara._assert_field_path (0191 §S5, last recut by 0296) is
  -- the ONE canonical field-path grammar; clara._field_path_conforms (0290, #857) is the boolean
  -- sibling the clara.document_regions CHECK constraint evaluates. This file recuts the FORMER
  -- (one namespace joins its closed roster) and leaves the LATTER byte-untouched, which is what
  -- keeps the CHECK and the persist boundary on one grammar rather than two.
  if to_regprocedure('clara._assert_field_path(text)') is null then
    raise exception '#948 prestate: clara._assert_field_path is absent -- 0191 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._assert_field_path(text)'::regprocedure;
  if v_sha = '9783e0e77d7f95f2f5566ba62dbe00fc45e7d87e7a8d9e30445978a91666ad44' then
    v_mode := 'FIRST';
  elsif position('''contract''' in (select p.prosrc from pg_proc p
          where p.oid = 'clara._assert_field_path(text)'::regprocedure)) > 0 then
    v_mode := 'REDO';
  else
    raise exception '#948 prestate: clara._assert_field_path body drifted (sha %) -- it is neither the pre-image this file recuts (0296''s own post-image) nor a body carrying this file''s own namespace', v_sha
      using errcode = 'CLR10';
  end if;

  if to_regprocedure('clara._field_path_conforms(text)') is null then
    raise exception '#948 prestate: clara._field_path_conforms is absent -- 0290 (#857) must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._field_path_conforms(text)'::regprocedure;
  if v_sha <> 'a97a4709117e698267fe900332cc666c818a241214894520ad773791b761cca3' then
    raise exception '#948 prestate: clara._field_path_conforms body drifted (sha %) -- 0299 recuts it on nobody', v_sha
      using errcode = 'CLR10';
  end if;

  -- (b) THE CHECK CONSTRAINT THAT MAKES THE GRAMMAR A WALL rather than a convention is live, so
  -- the namespace this file registers is a namespace every writer -- door or raw fixture insert
  -- -- is measured against.
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.document_regions'::regclass
     and conname = 'ck_document_regions_field_path_grammar';
  if v_n <> 1 then
    raise exception '#948 prestate: ck_document_regions_field_path_grammar is not on clara.document_regions -- 0290 must apply first'
      using errcode = 'CLR10';
  end if;

  raise notice '#948 prestate: OK (% apply) -- clara._assert_field_path is at a pinned sha, clara._field_path_conforms is untouched by this file, ck_document_regions_field_path_grammar is live.', v_mode;
end
$w948_pre$;

-- =====================================================================================
-- §B  THE CANONICAL FIELD-PATH NAMESPACE GAINS `contract` (AC1, second half).
--
--     ONE SEGMENT ADDED TO ONE ROSTER, AND NOTHING ELSE MOVES. The body below is
--     clara._assert_field_path's live pre-image with `'contract'` inserted into the registered-
--     namespace IN-list, in the position the roster's own reading order gives it (beside the
--     other DOCUMENT-FAMILY namespaces invoice/statement/myinvois/opening_tb/prior_gl/payroll,
--     ahead of the five STRUCTURAL ones pages/tables/rows/sheets/paragraphs that name a place on
--     a page rather than a family of facts). Length bound, syntax regex, errcodes and detail
--     reasons are byte-identical: this is a widening of one closed set, never a new grammar.
--
--     WHY `contract` AND NOT `agreement_contract`. The namespace names the FACT FAMILY, not the
--     document kind -- `invoice` serves invoice/credit_note/debit_note/receipt alike, and
--     `payroll` serves a payroll summary whatever the page is called. A hire-purchase
--     agreement's terms are contract facts; so are a tenancy's, which is why #949 reads the same
--     namespace rather than minting a second.
--
--     TWO SUB-FAMILIES UNDER IT, spelled by the questionnaire rather than by the grammar:
--     `contract.agreement.*` for the eleven run-level questions and `contract.schedule.*` for
--     the four cells a printed repayment-schedule row prints. The grammar admits both because it
--     admits the NAMESPACE; it has never judged what comes after the first segment.
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
      ('invoice','statement','myinvois','opening_tb','prior_gl','payroll','contract',
       'pages','tables','rows','sheets','paragraphs') then
    raise exception 'field_path % is not canonical: % is not a registered namespace',
      quote_literal(left(p_path, 160)), quote_literal(split_part(p_path, '.', 1))
      using errcode = 'CLR10', detail = '{"reason":"field_path_namespace"}';
  end if;
end $afp$;

-- =====================================================================================
-- §C  THE ANSWER-VOCABULARY GATE (AC1, first half) — clara._agreement_answers_ok(jsonb, text).
--
--     ITS OWN CLOSURE, NOT AN ARM OF ANOTHER FAMILY'S. clara._witness_answers_ok's belt is the
--     ELEVEN INVOICE fields and its body is reached from clara.persist_witness_facts, under the
--     F-A1/F-A2 frozen-evaluator regime; clara._payroll_answers_ok's belt is the payslip's. A
--     versioned workflow may not couple its shape to another family's frozen files, so this
--     family gets its own body — one function, two independent vocabularies, exactly the trade
--     0296 §C recorded.
--
--     THE VOCABULARY, AND WHY EACH NAME EXISTS. ELEVEN RUN-level questions, which are the brief's
--     own list ("what was acquired, the cash price, the deposit or trade-in, the amount financed,
--     the term, the instalment") plus the three a lane needs before it may act on any of them:
--       kind              — what the agreement CALLS ITSELF, verbatim. AC2's "it distinguishes a
--                           hire-purchase or finance-lease agreement from other agreements and
--                           says which it read" is decided from THIS rendering by §D's closed
--                           roster; the model quotes, it never classifies.
--       financier         — the named owner / lessor / financier. Part of the agreement's
--                           identity, which is what the duplicate guard keys on.
--       agreement_date    — the day it was signed, which is the day the asset and the liability
--                           come into existence and therefore this entry's posting date.
--       asset_description — what was acquired, as prose. Carried onto the entry's memo; it is
--                           NEVER read as an account code (see the header).
--       cash_price · deposit · amount_financed · total_charges · total_payable
--                         — the five money figures. `deposit` is the brief's "deposit or
--                           trade-in": one question, because the page states one figure at
--                           signing whichever it is, and a trade-in allowance reduces what is
--                           financed exactly as cash does.
--       term_months · instalment_amount
--                         — the brief's "the term, and the instalment".
--     Then FOUR per-instalment cells — due_date, instalment, principal, interest — which are
--     exactly the terms of the row identity `principal + interest = instalment` §D checks, and
--     exactly the three columns whose sums reconcile to amount_financed, total_charges and
--     total_payable.
--
--     EVERY QUESTION IS ANSWERED, AND `not_printed` IS AN ANSWER. Both halves of the rule live
--     here: a missing key is a refusal (the shape that would let a blank pass for a zero), and
--     `not_printed` is a first-class state (the shape that says the page is silent — an
--     agreement that prints no repayment schedule prints no charges either, and must be able to
--     say so). There is no third state and no default.
--
--     THE ENVELOPE ITSELF IS CLOSED to three members. A `totals` key smuggled in beside the
--     answers would be a computed figure travelling as a read, which is the one thing this family
--     forbids the model to produce.
--
--     STABLE, SECURITY DEFINER, pinned search_path, UNGRANTED — clara._witness_answers_ok's own
--     posture, kept: its only caller is the persist door, which runs as the owner.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
create or replace function clara._agreement_answers_ok(p_envelope jsonb, p_channel text)
  returns boolean language plpgsql stable security definer
  set search_path = clara, pg_temp as $aao$
declare
  -- The ELEVEN run-level questions. Four are non-monetary renderings (kind, financier,
  -- agreement_date, asset_description), one is a count (term_months); the other six are money
  -- the page either prints or does not.
  v_run text[] := array['contract.agreement.kind','contract.agreement.financier',
    'contract.agreement.agreement_date','contract.agreement.asset_description',
    'contract.agreement.cash_price','contract.agreement.deposit',
    'contract.agreement.amount_financed','contract.agreement.total_charges',
    'contract.agreement.total_payable','contract.agreement.term_months',
    'contract.agreement.instalment_amount'];
  -- The FOUR cells a printed repayment-schedule row prints.
  v_cell text[] := array['contract.schedule.due_date','contract.schedule.instalment',
    'contract.schedule.principal','contract.schedule.interest'];
  v_contract jsonb; v_answers jsonb; v_rows jsonb; v_row jsonb; v_cells jsonb;
  v_f text; v_a jsonb; v_state text; v_raw text; v_no int; v_seen int[] := array[]::int[];
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then return false; end if;
  v_contract := p_envelope->'contract';
  if v_contract is null or jsonb_typeof(v_contract) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(v_contract) as k(name)
              where k.name not in ('channel','answers','rows')) then return false; end if;
  if (v_contract->>'channel') is distinct from p_channel then return false; end if;

  v_answers := v_contract->'answers';
  if v_answers is null or jsonb_typeof(v_answers) <> 'object' then return false; end if;
  -- HALF ONE: every key present is a KNOWN key.
  if exists (select 1 from jsonb_object_keys(v_answers) as k(name)
              where k.name <> all(v_run)) then return false; end if;
  -- HALF TWO: every one of the eleven is PRESENT. A `count = 11` test would pass a map that
  -- answered one question twice under two spellings, which is why this is a loop and not a count
  -- (clara._witness_answers_ok's own recorded reason for the same shape).
  foreach v_f in array v_run loop
    v_a := v_answers->v_f;
    if v_a is null or jsonb_typeof(v_a) <> 'object' then return false; end if;
    v_state := v_a->>'state';
    if v_state is null or v_state not in ('value','not_printed') then return false; end if;
    if v_state = 'value' then
      v_raw := nullif(btrim(coalesce(v_a->>'raw','')),'');
      if v_raw is null then return false; end if;
      -- The same 200-character bound clara._witness_answers_ok applies to every answer. An asset
      -- description longer than that is a refusal to READ, never a silent truncation: the memo a
      -- person reads must be the rendering the page carries.
      if length(v_a->>'raw') > 200 then return false; end if;
    end if;
  end loop;

  v_rows := v_contract->'rows';
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then return false; end if;
  -- A BOUND ON THE QUOTED ROWS. 2000 is far past any repayment schedule a Malaysian SME's
  -- agreement prints (a 30-year mortgage-style schedule is 360) and far short of a payload that
  -- could make the evaluator's own loop a denial of service.
  if jsonb_array_length(v_rows) > 2000 then return false; end if;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(v_row) as k(name)
                where k.name not in ('row_no','cells')) then return false; end if;
    if jsonb_typeof(v_row->'row_no') <> 'number' then return false; end if;
    -- The shape is checked BEFORE the cast: a fractional or negative instalment number is refused
    -- as a malformed read rather than silently rounded into a neighbour's row.
    if (v_row->>'row_no') !~ '^[1-9][0-9]*$' then return false; end if;
    v_no := (v_row->>'row_no')::int;
    -- TWO ROWS AT ONE PRINTED INSTALMENT NUMBER would be double-counted by every column sum.
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
end $aao$;

revoke all on function clara._agreement_answers_ok(jsonb, text) from public;

comment on function clara._agreement_answers_ok(jsonb, text) is
  '#948: the agreement-contract family''s OWN closed answer vocabulary — eleven run-level questions (what the agreement calls itself, the financier, the signing date, what was acquired, the cash price, the deposit or trade-in, the amount financed, the total charges, the total payable, the term and the instalment) and four per-instalment schedule cells, every one of them answered, `not_printed` a first-class answer, an unknown key at any level a refusal. Deliberately NOT an arm of clara._witness_answers_ok or clara._payroll_answers_ok: a versioned workflow may not couple its shape to another family''s frozen files. Ungranted; its only caller is clara.persist_agreement_facts, which runs as the owner.';

-- =====================================================================================
-- §D  THE DETERMINISTIC EVALUATOR (AC2) — clara.evaluate_agreement_contract_state_v1(jsonb,jsonb).
--
--     THE MODEL NEVER COMPUTES, AND IT NEVER CLASSIFIES. Those are the two owner decisions this
--     body exists to make true. The two channel envelopes carry QUOTES — what the agreement
--     prints, per question and per scheduled instalment — and every arithmetic result, and the
--     verdict about WHICH KIND of agreement this is, are produced HERE, in SQL, from those
--     quotes. There is no arm in which a figure or a classification the model produced reaches a
--     fact.
--
--     WHAT IT DOES, in the brief's own order:
--       (1) It classifies the agreement from the rendering the page uses for ITSELF, against a
--           CLOSED, ORDERED keyword roster spelled below. An unrecognised rendering is `other`,
--           never a financing class: "we could not tell" and "it is a hire purchase" are
--           different answers and this body never conflates them.
--       (2) It checks each agreed schedule row's own identity, principal + interest = instalment.
--       (3) It sums the three schedule columns across the agreed rows and cross-checks them
--           against the printed totals where the page prints them — amount_financed against the
--           principal column, total_charges against the interest column, total_payable against
--           the instalment column.
--       (4) It checks AC2's first named identity: deposit + amount financed = cash price.
--       (5) It checks AC2's second: the printed schedule's instalments reconcile to the amount
--           financed plus the printed charges.
--       (6) It compares the text-channel and vision-channel readings — the same pair discipline
--           every other family uses.
--
--     A `not_printed` DEPOSIT IS ABSENT, NOT ZERO. The price identity is still checkable when the
--     page states a cash price and an amount financed and no deposit at all: the identity simply
--     reduces to financed = cash price, which is what "there was no deposit" MEANS on such a
--     page. That is not filling a silence with a zero — no figure is invented, and if the two
--     differ the check FAILS by name (`deposit_not_printed_but_financed_differs_from_cash_price`)
--     instead of quietly inferring the gap as an unprinted deposit.
--
--     IT CALLS NO OTHER clara FUNCTION, and that is structural rather than stylistic (0140's own
--     recorded reason, restated by 0296): registering a closure in clara.evaluator_versions
--     freezes EVERY member body estate-wide, so an N-member registration is N bodies a later lane
--     can never recut. The rendering-to-cents normalization is therefore written INLINE — once,
--     in the flattening statement — instead of reaching for clara._normalize_invoice_cents (a
--     member of the F-A1 witness closure) or for 0296's own inline copy.
--
--     IT READS NO TABLE EITHER, so it is genuinely IMMUTABLE: same two envelopes, same state,
--     forever. That is what makes a stored fact state reproducible from its own inputs.
--
--     THE CHANNEL COMPARISON IS ON THE FIGURE, NOT THE RENDERING, for the six monetary questions
--     and the three monetary schedule cells: "RM 120,000.00" and "120000.00" are one figure read
--     twice, and refusing them as a disagreement would manufacture conflict out of typography.
--     The five NON-monetary questions (what it calls itself, the financier, the signing date,
--     what was acquired, the term in months) and the due-date cell are compared as renderings,
--     because a name is not a figure.
--
--     A ROW EITHER CHANNEL READS DIFFERENTLY IS NOT AN AGREED ROW, and no column sums over a
--     schedule with a contested, unbalanced or uncheckable row: a partial sum is a figure no page
--     states.
--
--     REFUSALS, not exceptions. A malformed envelope returns a typed refusal object; the door in
--     §F is what refuses a malformed read at the write boundary (through §C's vocabulary gate).
--
--     REDO-SAFE: `create or replace function` (the freeze registration in §D.1 is guarded).
-- =====================================================================================
create or replace function clara.evaluate_agreement_contract_state_v1(p_text jsonb, p_vision jsonb)
  returns jsonb language plpgsql immutable
  set search_path = clara, pg_temp as $eval$
declare
  -- The eleven run-level questions, in the questionnaire's own order.
  v_run text[] := array['contract.agreement.kind','contract.agreement.financier',
    'contract.agreement.agreement_date','contract.agreement.asset_description',
    'contract.agreement.cash_price','contract.agreement.deposit',
    'contract.agreement.amount_financed','contract.agreement.total_charges',
    'contract.agreement.total_payable','contract.agreement.term_months',
    'contract.agreement.instalment_amount'];
  -- The FIVE questions compared as renderings rather than as figures. `term_months` is a COUNT:
  -- normalizing "36" to 3600 cents and comparing that would be arithmetic about a number of
  -- months, which is not what the question asks.
  v_text_q text[] := array['contract.agreement.kind','contract.agreement.financier',
    'contract.agreement.agreement_date','contract.agreement.asset_description',
    'contract.agreement.term_months'];
  -- The THREE run-level questions a printed schedule column sums to, paired with their column.
  -- cash_price, deposit, instalment_amount and the five renderings have NO counterpart: a
  -- schedule does not re-print the cash price, and the deposit is paid before the first
  -- instalment rather than inside one.
  v_sum_run text[] := array['contract.agreement.amount_financed','contract.agreement.total_charges',
    'contract.agreement.total_payable'];
  v_sum_row text[] := array['contract.schedule.principal','contract.schedule.interest',
    'contract.schedule.instalment'];
  -- Every cell a row prints, which is what "both channels quoted this row" means.
  v_cell text[] := array['contract.schedule.due_date','contract.schedule.instalment',
    'contract.schedule.principal','contract.schedule.interest'];
  -- THE CLOSED CLASSIFICATION ROSTER, IN ORDER, and the order is load-bearing. A page headed
  -- "Hire Purchase Agreement (Lease Schedule)" carries both words; the FIRST match wins and the
  -- roster is read top to bottom, so the most specific financing form is recognised before the
  -- generic one. The Malay forms are the ones that actually appear on Malaysian agreements
  -- (`sewa beli` = hire purchase, `pajakan kewangan` = finance lease, `perjanjian sewa` =
  -- tenancy). Anything that matches nothing is `other`.
  v_class_tok text[] := array['HIRE PURCHASE','HIRE-PURCHASE','SEWA BELI',
    'FINANCE LEASE','FINANCE-LEASE','FINANCIAL LEASE','CAPITAL LEASE','PAJAKAN KEWANGAN',
    'TENANCY','PERJANJIAN SEWA','RENTAL AGREEMENT','LEASE OF PREMISES',
    'OPERATING LEASE','SUPPLY'];
  v_class_val text[] := array['hire_purchase','hire_purchase','hire_purchase',
    'finance_lease','finance_lease','finance_lease','finance_lease','finance_lease',
    'tenancy','tenancy','tenancy','tenancy',
    'operating_lease','supply'];
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
  v_class text := 'not_established'; v_class_basis text := 'kind_not_established';
  v_kind_raw text; v_kind_u text;
  v_cash bigint; v_dep bigint; v_fin bigint; v_chg bigint;
  v_dep_printed boolean;
  v_price jsonb; v_recon jsonb;
  v_inst_sum bigint; v_expected bigint;
begin
  if p_text is null or p_vision is null
     or jsonb_typeof(p_text->'contract'->'answers') is distinct from 'object'
     or jsonb_typeof(p_vision->'contract'->'answers') is distinct from 'object' then
    return jsonb_build_object('state_version','v1','refusal','agreement_envelope_malformed',
      'reason','each channel must carry a contract envelope with an answers object');
  end if;

  -- -------------------------------------------------------------------------------------
  -- 1 · FLATTEN AND NORMALIZE, ONCE. Every quote from both channels — run answers and schedule
  --     cells alike — becomes one element carrying its channel, scope, row number, key, state,
  --     verbatim rendering and normalized cents. The rendering-to-cents rule is written HERE and
  --     nowhere else in this body: trim, drop an accounting parenthesis pair (recording its
  --     sign), drop an RM/MYR prefix, drop thousands separators and spaces, then require a plain
  --     decimal of at most thirteen integer digits and two decimal places. Anything else
  --     normalizes to NULL — an unreadable rendering, never a guess.
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
             lateral jsonb_each(s.env->'contract'->'answers') a
      union all
      select s.ch, 'row'::text, (r.value->>'row_no')::int, c.key,
             c.value->>'state', c.value->>'raw'
        from (select 'text'::text as ch, p_text as env
              union all
              select 'vision'::text, p_vision) s,
             lateral jsonb_array_elements(
               case when jsonb_typeof(s.env->'contract'->'rows') = 'array'
                    then s.env->'contract'->'rows' else '[]'::jsonb end) r,
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
  -- 2 · THE SCHEDULE ROWS. A row is AGREED when both channels quoted all four of its cells and
  --     every one carries the same reading on both; anything else is CONTESTED. Then each agreed
  --     row's own identity is checked over its three MONEY cells — and a row that cannot be
  --     checked (a cell the page does not print, or a rendering that does not normalize) is
  --     UNCHECKED, never assumed to balance.
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
    -- The comparison key: the FIGURE when it normalizes, the rendering when it does not (which
    -- is also how the due-date cell, a rendering by nature, is compared).
    select ch, row_no, k, st,
           case when k = 'contract.schedule.due_date' then 'RAW:' || btrim(coalesce(rw,''))
                else coalesce(cents::text, 'RAW:' || coalesce(rw,'')) end as fig
      from cells
  ), per_row as (
    select row_no,
           count(*) filter (where ch = 'text') as n_text,
           count(*) filter (where ch = 'vision') as n_vision,
           count(distinct (k, st, fig)) as distinct_readings
      from keyed group by row_no
  )
  select coalesce(array_agg(row_no order by row_no) filter (
           where n_text = array_length(v_cell,1)
             and n_vision = array_length(v_cell,1)
             and distinct_readings = array_length(v_cell,1)), array[]::int[]),
         coalesce(array_agg(row_no order by row_no) filter (
           where not (n_text = array_length(v_cell,1)
                  and n_vision = array_length(v_cell,1)
                  and distinct_readings = array_length(v_cell,1))), array[]::int[])
    into v_agreed, v_contested
    from per_row;

  with cells as (
    select * from jsonb_to_recordset(v_flat)
      as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
     where scope = 'row' and ch = 'text' and row_no = any(v_agreed)
       and k <> 'contract.schedule.due_date'
  ), pivot as (
    select row_no,
           max(cents) filter (where k = 'contract.schedule.principal') as principal,
           max(cents) filter (where k = 'contract.schedule.interest') as interest,
           max(cents) filter (where k = 'contract.schedule.instalment') as instalment,
           count(*) filter (where cents is null) as unreadable_cells
      from cells group by row_no
  )
  select coalesce(array_agg(row_no order by row_no) filter (
           where unreadable_cells = 0 and principal + interest <> instalment), array[]::int[]),
         coalesce(array_agg(row_no order by row_no) filter (
           where unreadable_cells > 0), array[]::int[])
    into v_unbalanced, v_unchecked
    from pivot;

  -- -------------------------------------------------------------------------------------
  -- 3 · THE ELEVEN QUESTIONS. Each one's verdict, in a fixed precedence: what the two channels
  --     say about it first, then whether the schedule can speak to it at all, then the
  --     cross-check.
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

    -- Which schedule column, if any, sums to this question.
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
    elsif v_f = any(v_text_q) then
      -- THE FIVE NON-MONETARY QUESTIONS: compared as renderings, because a name, a date and a
      -- count of months are not figures.
      if v_t_state <> v_v_state or (v_t_state = 'value' and btrim(v_t_raw) is distinct from btrim(v_v_raw)) then
        v_state := 'channels_disagree'; v_reason := 'text_and_vision_read_different_renderings';
      elsif v_t_state = 'not_printed' then
        v_state := 'not_printed'; v_reason := 'not_printed_on_the_page';
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
      v_state := 'rows_contested'; v_reason := 'the two channels read a scheduled instalment differently';
      if v_t_state = 'value' then v_printed_cents := v_t_cents; v_printed_raw := v_t_raw; end if;
    elsif v_rf is not null and (coalesce(array_length(v_unbalanced,1),0) > 0
                             or coalesce(array_length(v_unchecked,1),0) > 0) then
      v_state := 'rows_unbalanced';
      v_reason := case when coalesce(array_length(v_unbalanced,1),0) > 0
                       then 'row_identity_failed' else 'row_identity_uncheckable' end;
      if v_t_state = 'value' then v_printed_cents := v_t_cents; v_printed_raw := v_t_raw; end if;
    elsif v_t_state = 'not_printed' then
      v_state := 'not_printed'; v_reason := 'not_printed_on_the_page';
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
  -- 4 · WHICH AGREEMENT THIS IS (AC2's "says which it read"). Decided from the ESTABLISHED
  --     rendering alone, against the closed ordered roster. A kind the two channels read
  --     differently, or that the page does not print, leaves the class `not_established` — and
  --     `not_established` is not `other`: one says the page did not tell us, the other says it
  --     told us something this lane does not act on.
  -- -------------------------------------------------------------------------------------
  if (v_facts->'contract.agreement.kind'->>'state') = 'established' then
    v_kind_raw := v_facts->'contract.agreement.kind'->>'printed_raw';
    v_kind_u := regexp_replace(upper(btrim(coalesce(v_kind_raw,''))), '[[:space:]]+', ' ', 'g');
    v_class := 'other'; v_class_basis := 'printed_kind_unrecognised';
    for v_i in 1 .. array_length(v_class_tok,1) loop
      if v_class = 'other' and position(v_class_tok[v_i] in v_kind_u) > 0 then
        v_class := v_class_val[v_i];
        v_class_basis := 'printed_kind_matched:' || v_class_tok[v_i];
      end if;
    end loop;
  end if;

  -- -------------------------------------------------------------------------------------
  -- 5 · AC2's FIRST NAMED CHECK — deposit + amount financed = cash price.
  --
  --     THE TWO CHECKS BELOW READ THE PRINTED FIGURES, NOT THE `established` VERDICT, and that
  --     distinction is the difference between a check and a tautology. `printed_cents` is set
  --     exactly when BOTH channels agreed on a readable figure THE PAGE PRINTED — which is all
  --     either check needs. Requiring `established` would additionally require that no OTHER
  --     check already objected to the same question, and since `amount_financed` and
  --     `total_charges` each have a schedule column that can contradict them, a cross-check
  --     failure would silently make these two checks `not_checkable`: an agreement whose
  --     instalments do not add up would report nothing at all under the very check the brief
  --     names for it. Measured, not reasoned — the first cut of this body did exactly that, and
  --     its `fails` arm turned out to be unreachable.
  -- -------------------------------------------------------------------------------------
  v_cash := nullif(v_facts->'contract.agreement.cash_price'->>'printed_cents','')::bigint;
  v_fin := nullif(v_facts->'contract.agreement.amount_financed'->>'printed_cents','')::bigint;
  v_dep := nullif(v_facts->'contract.agreement.deposit'->>'printed_cents','')::bigint;
  v_dep_printed := (v_facts->'contract.agreement.deposit'->>'state') <> 'not_printed';
  v_chg := nullif(v_facts->'contract.agreement.total_charges'->>'printed_cents','')::bigint;

  if v_cash is null then
    v_price := jsonb_build_object('state','not_checkable','reason','cash_price_not_established');
  elsif v_fin is null then
    v_price := jsonb_build_object('state','not_checkable','reason','amount_financed_not_established');
  elsif v_dep is null and v_dep_printed then
    -- The page prints SOMETHING as a deposit and this lane could not read it as a figure (the
    -- two channels disagreed, or the rendering is prose such as a trade-in description). That is
    -- not the same as no deposit, and it is not checkable.
    v_price := jsonb_build_object('state','not_checkable','reason','deposit_not_established');
  else
    v_price := jsonb_build_object(
      'state', case when coalesce(v_dep,0) + v_fin = v_cash then 'holds' else 'fails' end,
      'reason', case when coalesce(v_dep,0) + v_fin = v_cash then null
                     when v_dep_printed then 'deposit_plus_financed_differs_from_cash_price'
                     else 'deposit_not_printed_but_financed_differs_from_cash_price' end,
      'cash_price_cents', v_cash, 'deposit_cents', to_jsonb(v_dep), 'financed_cents', v_fin,
      'difference_cents', v_cash - (coalesce(v_dep,0) + v_fin));
  end if;

  -- -------------------------------------------------------------------------------------
  -- 6 · AC2's SECOND NAMED CHECK — the printed schedule's instalments reconcile to the amount
  --     financed plus the printed charges. It reads the PRINTED totals, not the column sums:
  --     reconciling a sum against itself would be a tautology, and the per-question
  --     `totals_mismatch` above is where a printed total is compared with its own column.
  -- -------------------------------------------------------------------------------------
  select sum(cents), count(*) filter (where cents is null) = 0
    into v_inst_sum, v_computable
    from jsonb_to_recordset(v_flat) as c(ch text, scope text, row_no int, k text, st text, rw text, cents bigint)
   where ch = 'text' and scope = 'row' and k = 'contract.schedule.instalment'
     and row_no = any(v_agreed);

  if coalesce(array_length(v_agreed,1),0) = 0 then
    v_recon := jsonb_build_object('state','not_checkable','reason','no_printed_schedule',
      'rows_agreed', 0);
  elsif coalesce(array_length(v_contested,1),0) > 0
     or coalesce(array_length(v_unbalanced,1),0) > 0
     or coalesce(array_length(v_unchecked,1),0) > 0
     or not coalesce(v_computable,false) then
    v_recon := jsonb_build_object('state','not_checkable','reason','rows_not_summable',
      'rows_agreed', coalesce(array_length(v_agreed,1),0));
  elsif v_fin is null then
    v_recon := jsonb_build_object('state','not_checkable','reason','amount_financed_not_established',
      'rows_agreed', coalesce(array_length(v_agreed,1),0),
      'instalment_sum_cents', v_inst_sum);
  elsif v_chg is null and (v_facts->'contract.agreement.total_charges'->>'state') is distinct from 'not_printed' then
    v_recon := jsonb_build_object('state','not_checkable','reason','total_charges_not_established',
      'rows_agreed', coalesce(array_length(v_agreed,1),0),
      'instalment_sum_cents', v_inst_sum);
  else
    -- A page that prints no charges at all reconciles against the financed amount alone: an
    -- interest-free instalment plan is a real agreement, and refusing to check it would be
    -- refusing to read it.
    v_expected := v_fin + coalesce(v_chg,0);
    v_recon := jsonb_build_object(
      'state', case when v_inst_sum = v_expected then 'holds' else 'fails' end,
      'reason', case when v_inst_sum = v_expected then null
                     else 'instalments_do_not_reconcile_to_financed_plus_charges' end,
      'rows_agreed', coalesce(array_length(v_agreed,1),0),
      'instalment_sum_cents', v_inst_sum,
      'expected_cents', v_expected,
      'difference_cents', v_inst_sum - v_expected);
  end if;

  return jsonb_build_object(
    'state_version','v1',
    'agreement_class', v_class,
    'financing', v_class in ('hire_purchase','finance_lease'),
    'class_basis', v_class_basis,
    'rows', jsonb_build_object(
      'text', v_rows_text, 'vision', v_rows_vision,
      'agreed', coalesce(array_length(v_agreed,1),0),
      'balanced', coalesce(array_length(v_agreed,1),0)
                  - coalesce(array_length(v_unbalanced,1),0)
                  - coalesce(array_length(v_unchecked,1),0),
      'contested', to_jsonb(v_contested),
      'unbalanced', to_jsonb(v_unbalanced),
      'unchecked', to_jsonb(v_unchecked)),
    'checks', jsonb_build_object('price_identity', v_price, 'schedule_reconciles', v_recon),
    'facts', v_facts,
    'established', to_jsonb(v_established),
    'disagreed', to_jsonb(v_disagreed),
    'missing', to_jsonb(v_missing));
end $eval$;

revoke all on function clara.evaluate_agreement_contract_state_v1(jsonb, jsonb) from public;

comment on function clara.evaluate_agreement_contract_state_v1(jsonb, jsonb) is
  '#948: the agreement contract''s deterministic evaluator. Two channel envelopes in, one fact state out: which KIND of agreement the page calls itself (a closed ordered keyword roster over the printed rendering — the model quotes, it never classifies), each scheduled instalment''s own principal + interest = instalment identity, the three column sums cross-checked against the printed totals, deposit + amount financed = cash price, the schedule''s instalments reconciled to financed plus charges, and the text-vs-vision comparison. The MODEL never computes: every arithmetic result here is produced by this body from quoted renderings. It reads no table and calls no other clara function, which is what keeps its clara.evaluator_versions closure at ONE member and the freeze meaningful; a changed formula is a _v2, never an edit.';

reset role;

-- -------------------------------------------------------------------------------------
-- §D.1  THE FREEZE REGISTRATION, single-member by construction (0140's shape, 0296's use).
--
--       THE search_path HERE IS LOAD-BEARING, NOT COSMETIC (0059:243-245's recorded reason,
--       restated by 0091, 0140 and 0296): clara.verify_evaluator_freeze() reproduces the closure
--       hash under pg_catalog,pg_temp, so a registration performed under ANY OTHER search_path
--       stores a hash the verifier CANNOT reproduce and every later apply reds.
--
--       deployed = false: the deploy-lock flip is a one-way ceremony act under 0060's
--       _tf_evaluator_deploy_once, never a migration's to make. The freeze binds regardless —
--       the flag is about traffic, not about immutability.
--
--       REDO-SAFE, AND NOT BY RE-WRITING THE ROW — BY REFUSING TO. clara.evaluator_versions is
--       historical and clara.evaluator_version_members is append-only, which is the whole point
--       of a freeze. So this block INSERTS when the registration is absent and, when it is
--       already present, RE-DERIVES the closure hash from the live catalog and refuses if it has
--       moved. A redo of an UNCHANGED evaluator passes silently; a redo after an edit to the
--       evaluator body fails by name, and its only lawful repair is a _v2.
-- -------------------------------------------------------------------------------------
set local search_path = pg_catalog, pg_temp;
do $w948_freeze$
declare e uuid; h bytea; v_live bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), 'hex'),
           '' order by o), 'UTF8')) into h
    from (values (0, 'clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)')) m(o, s);

  select ev.closure_sha256 into v_live from clara.evaluator_versions ev
   where ev.evaluator_name = 'evaluate_agreement_contract_state' and ev.version = 1;
  if v_live is not null then
    if v_live is distinct from h then
      raise exception '#948 freeze: clara.evaluate_agreement_contract_state_v1 is already registered at a DIFFERENT closure hash. A registration is append-only and a frozen body is never recut in place: ship the change as clara.evaluate_agreement_contract_state_v2 with its own version row.'
        using errcode = 'CLR10';
    end if;
    return;   -- already registered, at exactly this body: a redo has nothing to do here
  end if;

  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    values ('evaluate_agreement_contract_state', 1,
      'clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)', h,
      '0299_agreement_contract_acquisition', false)
    returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), null::uuid
      from (values (0, 'clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)')) m(o, s);
end
$w948_freeze$;
set local search_path = clara, pg_temp;

-- =====================================================================================
-- §E  THE FACTS ROUTER STOPS TERMINATING AN AGREEMENT CONTRACT AS A SKIPPED KIND.
--
--     WHAT WAS THERE BEFORE. clara._enqueue_invoice_facts_core's pdf/image branch routed
--     invoice-shaped kinds to `llm_witness`, a bank statement to `statement_facts` and (since
--     0296) a payroll summary to `payroll_facts`, and sent EVERYTHING ELSE — an agreement
--     contract included — to a terminal `failed/skipped_kind` receipt. The capability registry's
--     `stored_only` verdict for the pair is DERIVED from exactly that fall-through and says so in
--     words, which is why §G's re-derivation and this arm are one change and not two.
--
--     WHY ITS OWN LANE AND NOT llm_witness OR payroll_facts. Every facts lane in this estate is
--     claimed BY LANE ALONE: the workflow that owns a lane reads every task on it with its own
--     prompts. A contract pair parked on `llm_witness` would be read with INVOICE prompts and
--     resolved by clara._invoice_fact_state as an invoice corroboration; on `payroll_facts` it
--     would be read with PAYSLIP prompts. 0098 recorded the same reasoning when it declined to
--     move the bank statement onto the witness lane, and 0296 when it declined to move the
--     payslip. A new lane costs five CHECK widenings and five surgical recuts; borrowing one
--     costs correctness.
--
--     THE FIVE LIVE BODIES RECUT BELOW, and why each one must be:
--       1. clara._enqueue_invoice_facts_core — the routing arm itself, the engine-kind map, the
--          enqueue-time typed-consent gate and the attempt-cap emit.
--       2. clara.enqueue_invoice_facts — the wrapper's lane-aware terminal emit: without this,
--          every agreement refusal would reach the spine as a PHANTOM INVOICE FAILURE and wake
--          the autodraft consumer for a document no invoice draft will ever be made from.
--       3. clara._tf_processing_task_update — the transition wall: the consent gate FLIPS an
--          in-flight queued task in place, and that transition is lane-scoped per verdict.
--       4. clara.claim_document_processing_task — the kill switch, the per-lane attempt cap, the
--          lane-true cap emit and the per-lane concurrency window. A lane no worker can claim is
--          a dark lane.
--       5. clara.release_held_document_tasks — the release sweep. A lane that can be HELD and
--          cannot be RELEASED is a permanent stall, and 0038's own comment says this list must
--          track the claim body's kill-switch list EXACTLY.
--
--     SPLICED, NEVER RE-TYPED (the 0017:1553 / 0093 / 0260 / 0297 idiom). Each block below reads
--     the INSTALLED definition off the catalog, asserts each anchor occurs EXACTLY ONCE, replaces
--     only at those anchors and executes the result. Everything in those five bodies that this
--     file does not name is preserved BY CONSTRUCTION rather than by a careful human copy — which
--     matters more here than anywhere else in the file, because three of the five were recut by
--     #945 eleven days of chain-order ago and re-typing them from 0296's text would silently
--     revert whatever landed since. Every anchor and every replacement is ONE dollar-quoted
--     literal, never a `||` chain with chr(): apps/web/test/sqlFunctionCensus.ts proves what a
--     migration's dynamic `execute` installs by RECONSTRUCTING the statement from its parts and
--     cannot evaluate chr() (0297 §G's own measured note).
--
--     EVERY EDIT IS A LANE-LIST WIDENING OR A NEW BRANCH. No existing kind's route, refusal,
--     event, cap or window moves, and each postcheck re-reads the COMMITTED catalog to prove the
--     untouched regions survived.
--
--     REDO-SAFE: every constraint is dropped-if-exists before it is added, every insert is
--     `on conflict do nothing`, and every splice detects its own marker in the installed body and
--     no-ops on a redo.
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
    'classify','statement_facts','statement_parse','llm_witness','payroll_facts',
    'contract_facts']));

alter table clara.document_processing_tasks drop constraint if exists ck_processing_task_lane_engine_f_a1_stmt;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_f_a1_stmt
  check (engine_id like 'clara-fixture:%'
     or (lane = any (array['ocr','invoice_facts']) and engine_id like 'azure-%')
     or (lane = 'statement_facts' and (engine_id like 'azure-%' or engine_id like 'llm-%'))
     or (lane = any (array['structured_parse','local_facts','none']) and engine_id like 'clara-%')
     or (lane = 'classify' and engine_id like 'clara-classify-%')
     or (lane = 'statement_parse' and engine_id like 'clara-statement-%')
     or (lane = 'llm_witness' and engine_id like 'llm-%')
     or (lane = 'payroll_facts' and engine_id like 'llm-%')
     -- #948: the contract lane is a MODEL lane and may carry nothing but a model engine identity.
     or (lane = 'contract_facts' and engine_id like 'llm-%'));

alter table clara.document_processing_tasks drop constraint if exists ck_processing_task_error_code_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_f_a1
  check (error_code is null or error_code = any (array['engine_error','timeout','engine_lost',
    'storage_error','corrupt','encrypted','bad_type','limit','budget','attempt_cap','internal',
    'skipped_kind','header_unreadable','totals_unreadable','readers_disagree','chain_broken',
    'continuity_mismatch','duplicate_period','overlapping_period','non_myr_statement',
    'account_unregistered','account_inactive','statement_multi_client','period_invalid',
    'line_date_out_of_period','consent_inactive','witness_multi_client','witness_consent_inactive',
    'wait_exhausted','document_processing_multi_client','document_processing_consent_inactive',
    'firm_narrow_consent_inactive','payroll_multi_client','payroll_consent_inactive',
    -- #948: the contract lane's own two gate verdicts. Its OWN codes rather than a reuse of
    -- another family's literals, because a refusal a person reads must say which read was
    -- refused.
    'agreement_multi_client','agreement_consent_inactive']));

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
                                    'payroll_multi_client','payroll_consent_inactive',
                                    -- #948: both contract gate verdicts are NEVER-CLAIMED terminal
                                    -- receipts, exactly like every other enqueue-time gate code.
                                    'agreement_multi_client','agreement_consent_inactive'])))));

alter table clara.document_extractions drop constraint if exists ck_document_extractions_engine_kind_f_a1;
alter table clara.document_extractions add constraint ck_document_extractions_engine_kind_f_a1
  check (engine_kind = any (array['ocr','structured_parse','invoice_facts','doc_classify',
    'statement_facts','llm_text_facts','llm_vision_facts',
    'payroll_text_facts','payroll_vision_facts',
    -- #948: the agreement pair's two kinds. Their OWN kinds, not a reuse of llm_text_facts /
    -- llm_vision_facts: clara._invoice_fact_state resolves the witness regime off those two, so
    -- an agreement envelope banked under them would be read as an invoice corroboration.
    'agreement_text_facts','agreement_vision_facts']));

-- E2 · THE TWO EVENT TYPES THE LANE SPEAKS. clara.domain_events carries a foreign key onto
--      clara.event_types, so an unregistered type is an INSERT failure, not a silent drop. Both
--      are client-scoped (every agreement document is filed to exactly one client by the time the
--      router reaches it) and both are routed at the ACTIVE taxonomy version with decision
--      `ignore`, which is document.llm_witness_failed's own registration exactly: the workflow is
--      the registered consumer, and no router wake is wanted. Both tables are append-only
--      (t_event_types_append_only / t_trigger_taxonomy_append_only), so these are INSERTs with
--      `on conflict do nothing` — never an UPDATE, which those triggers would refuse.

insert into clara.event_types (name, client_scoped, description) values
  ('document.agreement_facts_completed', true,
   '#948: an agreement contract''s typed terms were read and banked (the text+vision pair persisted atomically). The facts workflow is the registered consumer; no router wake.'),
  ('document.agreement_facts_failed', true,
   '#948: an agreement contract''s read terminated without facts — an enqueue-time consent verdict, an attempt cap, or a worker-reported failure. The lane-true twin of document.invoice_facts_failed, so an agreement refusal never wakes the autodraft consumer.')
on conflict (name) do nothing;

insert into clara.trigger_taxonomy (version, event_type, decision, note)
  select a.version, e.name, 'ignore',
         '#948: the agreement facts workflow is the registered consumer; no router wake.'
    from clara.taxonomy_active a
    cross join (values ('document.agreement_facts_completed'), ('document.agreement_facts_failed')) e(name)
on conflict (version, event_type) do nothing;

-- E3 · THE FIVE SPLICED BODIES.

do $w948_router$
declare
  v_sig text := 'clara._enqueue_invoice_facts_core(uuid)';
  v_def text; v_next text; v_anchor text; v_repl text;
  v_n int; v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text; r record;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;

  if position('contract_facts' in v_def) > 0 then
    raise notice '#948 §E3(1): clara._enqueue_invoice_facts_core already routes contract_facts -- splice already applied, nothing to do (redo)';
  else
    v_next := v_def;

    -- SPLICE (1a): THE ROUTING ARM, immediately after the payroll arm and immediately before the
    -- skipped_kind dead end, which is where reading order puts it: the arm a kind falls into
    -- must be read before the arm every unrouted kind falls into.
    v_anchor := $a1$      v_lane:='payroll_facts'; v_engine:='llm-openai:gpt-5.6-terra:payroll-witness-v1';
    else$a1$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (1a): the payroll routing arm appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $a2$      v_lane:='payroll_facts'; v_engine:='llm-openai:gpt-5.6-terra:payroll-witness-v1';
    elsif d.document_kind='agreement_contract' then
      -- #948 / parent #926 (owner ruling 2026-09-18, option G): a contract goes down the same
      -- lane as any other accounting document, read and posted, not merely stored. Until this
      -- arm existed an agreement_contract fell straight through to the skipped_kind dead end
      -- below -- the capability registry's own `stored_only` verdict was literally derived from
      -- that fall-through. ITS OWN LANE, not llm_witness and not payroll_facts: a facts lane is
      -- claimed BY LANE ALONE, so a contract pair parked on either would be read with that
      -- family's prompts. v_engine MUST string-equal AGREEMENT_ENGINE_SNAPSHOT.engineId in the
      -- agreementFacts.v1 services module; the workflow compares the task's stamp against its
      -- own snapshot BEFORE any egress and waits on a mismatch rather than sending bytes under a
      -- receipt naming a model it did not call, so a drifted literal STALLS the lane instead of
      -- mis-stamping it.
      v_lane:='contract_facts'; v_engine:='llm-openai:gpt-5.6-terra:agreement-witness-v1';
    else$a2$;
    v_next := replace(v_next, v_anchor, v_repl);

    -- SPLICE (1b): THE PER-LANE ENGINE-KIND SHORT-CIRCUIT. Without this arm a fully read
    -- agreement would read as un-extracted on every re-fire and re-buy a vendor read.
    v_anchor := $a3$    v_engine_kind := case when v_lane='payroll_facts'$a3$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (1b): the engine-kind map head appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $a4$    v_engine_kind := case when v_lane='contract_facts'
                       then 'agreement_text_facts'  -- #948: the agreement pair's CANONICAL row,
                       -- the llm_witness/payroll precedent exactly -- a done text row proves a
                       -- done pair (one atomic writer transaction), so a re-fire is suppressed
                       -- the moment the pair lands.
                       when v_lane='payroll_facts'$a4$;
    v_next := replace(v_next, v_anchor, v_repl);

    -- SPLICE (1c): THE ENQUEUE-TIME TYPED-CONSENT GATE, the payroll arm's shape with this
    -- family's own two verdict codes.
    v_anchor := $a5$      perform clara._append_event(d.firm_id,'document.payroll_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='classify' then$a5$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (1c): the payroll gate tail appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $a6$      perform clara._append_event(d.firm_id,'document.payroll_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='contract_facts' then
    -- #948: THE SAME enqueue-time typed-consent gate the witness and payroll lanes hold, keyed
    -- on the SAME purpose ('witness_extraction') and with its OWN named refusal codes rather
    -- than a reuse of another family's literals -- a refusal a person reads must say which read
    -- was refused.
    --
    -- WHY THE EXISTING PURPOSE AND NOT A NEW ONE. 'witness_extraction' is the typed consent that
    -- authorizes sending a client's document BYTES to a model in order to READ them; that is
    -- exactly and only what this lane does. Minting a contract-specific purpose would need its
    -- own CHECK widening, its own consent-capture surface and its own activation act, and until
    -- all three existed the lane would be dark for every firm -- which the standing "nothing
    -- dark" ruling refuses. The purpose IS a live gate here, not a bypass: a client with no live
    -- witness_extraction activation gets a terminal refusal, exactly as an invoice would.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='agreement_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='agreement_consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='agreement_consent_inactive';
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
      perform clara._append_event(d.firm_id,'document.agreement_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='classify' then$a6$;
    v_next := replace(v_next, v_anchor, v_repl);

    -- SPLICE (1d): THE ENQUEUE-TIME ATTEMPT-CAP EMIT, lane-true. Without it the agreement feed
    -- never learns its document died at the cap, and folding it into the invoice twin would wake
    -- the autodraft consumer on a phantom invoice failure.
    v_anchor := $a7$    if v_lane in ('statement_facts','statement_parse','payroll_facts') then$a7$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (1d-i): the cap-emit lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $a8$    if v_lane in ('statement_facts','statement_parse','payroll_facts','contract_facts') then$a8$;
    v_next := replace(v_next, v_anchor, v_repl);

    v_anchor := $a9$        case when v_lane='payroll_facts' then 'document.payroll_facts_failed'$a9$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (1d-ii): the cap-emit type map appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $b1$        case when v_lane='contract_facts' then 'document.agreement_facts_failed'
             when v_lane='payroll_facts' then 'document.payroll_facts_failed'$b1$;
    v_next := replace(v_next, v_anchor, v_repl);

    if v_next = v_def then
      raise exception '#948 §E3(1) splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;
    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#948 §E3(1) postcheck: % changed owner (% -> %) or ACL (% -> %)',
        v_sig, v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#948 §E3(1) postcheck: prosrc sha256 did not change -- the splice was a no-op' using errcode = 'CLR10';
    end if;
    raise notice '#948 §E3(1): clara._enqueue_invoice_facts_core spliced -- one routing arm, one engine-kind arm, one consent gate, one lane-true cap emit. owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;

  -- BOTH BRANCHES: every other family's route is re-read from the COMMITTED catalog and asserted
  -- present at exactly its pre-splice count, so a redo proves it too.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      -- MEASURED on this rig, not guessed: `llm_witness` is named twice (the invoice-shaped
      -- kinds arm and the F-A1 receipt arm), `skipped_kind` three times.
      ($$v_lane:='llm_witness'$$, 2),
      ($$v_lane:='statement_facts'$$, 1),
      ($$v_lane:='statement_parse'$$, 1),
      ($$v_lane:='payroll_facts'$$, 1),
      ($$v_lane:='contract_facts'$$, 1),
      ($$v_lane:='local_facts'$$, 1),
      ($$v_lane:='classify'$$, 1),
      ($$'skipped_kind'$$, 3),
      ($$d.document_kind='agreement_contract'$$, 1)
      ) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#948 §E3(1) postcheck: marker "%" appears % time(s), expected % -- the splice was not additive', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
end
$w948_router$;

do $w948_wrap$
declare
  v_sig text := 'clara.enqueue_invoice_facts(uuid)';
  v_def text; v_next text; v_anchor text; v_repl text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('contract_facts' in v_def) > 0 then
    raise notice '#948 §E3(2): clara.enqueue_invoice_facts already excludes contract_facts from the invoice twin -- nothing to do (redo)';
  else
    v_anchor := $c1$    if coalesce(v_lane,'') not in ('statement_facts','statement_parse','payroll_facts') then$c1$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (2): the wrapper''s lane exclusion appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $c2$    -- #948: contract_facts joins the exclusion for the reason the statement and payroll lanes
    -- are in it -- the core owns every contract-lane terminal emit at its mint sites, and this
    -- wrapper emitting its INVOICE twin for an agreement receipt would be a phantom invoice
    -- failure that wakes the autodraft consumer for a document no invoice draft will ever be
    -- made from.
    if coalesce(v_lane,'') not in ('statement_facts','statement_parse','payroll_facts','contract_facts') then$c2$;
    v_next := replace(v_def, v_anchor, v_repl);
    execute v_next;
    raise notice '#948 §E3(2): clara.enqueue_invoice_facts spliced -- contract_facts joins the invoice-twin exclusion.';
  end if;
end
$w948_wrap$;

do $w948_wall$
declare
  v_sig text := 'clara._tf_processing_task_update()';
  v_def text; v_next text; v_anchor text; v_repl text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('contract_facts' in v_def) > 0 then
    raise notice '#948 §E3(3): clara._tf_processing_task_update already admits the contract verdicts -- nothing to do (redo)';
  else
    -- (3a) THE TWO GATE VERDICTS join the queued->failed arm, LANE-SCOPED exactly as every prior
    -- addition scoped its own: no future writer can flip a queued task on another lane to an
    -- AGREEMENT verdict, and no lane can flip a running or terminal task at all.
    v_anchor := $d1$               or (new.error_code in ('payroll_consent_inactive','payroll_multi_client')
                   and new.lane='payroll_facts')$d1$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (3a): the payroll verdict arm appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $d2$               or (new.error_code in ('payroll_consent_inactive','payroll_multi_client')
                   and new.lane='payroll_facts')
               -- #948: the AGREEMENT gate verdicts, the same shape and the same lane scope.
               or (new.error_code in ('agreement_consent_inactive','agreement_multi_client')
                   and new.lane='contract_facts')$d2$;
    v_next := replace(v_def, v_anchor, v_repl);

    -- (3b) THE skipped_kind ARM. The router no longer mints one for this kind, but a document
    -- whose kind is CORRECTED away from agreement_contract can still meet it, and a lane missing
    -- from this list would make that transition illegal.
    v_anchor := $d3$                   and new.lane in ('invoice_facts','statement_facts','statement_parse','llm_witness','payroll_facts'))$d3$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (3b): the skipped_kind lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $d4$                   and new.lane in ('invoice_facts','statement_facts','statement_parse','llm_witness','payroll_facts','contract_facts'))$d4$;
    v_next := replace(v_next, v_anchor, v_repl);
    execute v_next;
    raise notice '#948 §E3(3): clara._tf_processing_task_update spliced -- two lane-scoped verdict arms.';
  end if;
end
$w948_wall$;

do $w948_claim$
declare
  v_sig text := 'clara.claim_document_processing_task(uuid,text,boolean)';
  v_def text; v_next text; v_anchor text; v_repl text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('contract_facts' in v_def) > 0 then
    raise notice '#948 §E3(4): clara.claim_document_processing_task already knows contract_facts -- nothing to do (redo)';
  else
    -- (4a) THE KILL SWITCH. contract_facts is an EGRESSING lane (it sends document bytes to a
    -- model), so it joins it. It runs NO per-client LEGACY consent check, for the reason
    -- statement_facts, llm_witness and payroll_facts do not: its typed (consent, activation) pair
    -- is checked at ENQUEUE, and reading the purpose-blind legacy table here would let a generic
    -- consent authorize a contract-specific read.
    v_anchor := $e1$  if t.lane in ('ocr','invoice_facts','statement_facts','llm_witness','payroll_facts')
     and not coalesce(p_egress_approved,false) then$e1$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (4a): the kill-switch lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $e2$  if t.lane in ('ocr','invoice_facts','statement_facts','llm_witness','payroll_facts','contract_facts')
     and not coalesce(p_egress_approved,false) then$e2$;
    v_next := replace(v_def, v_anchor, v_repl);

    -- (4b) THE PER-LANE ATTEMPT CAP, counted over its OWN lane so one lane's attempts never cap
    -- another's.
    v_anchor := $e3$  if t.lane in ('invoice_facts','statement_facts','llm_witness','payroll_facts') then$e3$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (4b): the attempt-cap lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $e4$  if t.lane in ('invoice_facts','statement_facts','llm_witness','payroll_facts','contract_facts') then$e4$;
    v_next := replace(v_next, v_anchor, v_repl);

    -- (4c) THE LANE-TRUE CAP EMIT.
    v_anchor := $e5$             when t.lane='payroll_facts' then 'document.payroll_facts_failed'$e5$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (4c): the cap-emit type map appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $e6$             when t.lane='payroll_facts' then 'document.payroll_facts_failed'
             when t.lane='contract_facts' then 'document.agreement_facts_failed'$e6$;
    v_next := replace(v_next, v_anchor, v_repl);

    -- (4d) THE PER-LANE CONCURRENCY WINDOW. The limit COLUMN is shared (llm_witness_concurrency)
    -- because all three are model-read lanes with the same cost shape and a firm that tunes one
    -- means all; the COUNT is per lane, which is the half that matters -- folding them into one
    -- count would let a contract backlog starve invoices.
    v_anchor := $e7$  if t.lane in ('llm_witness','payroll_facts') then$e7$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (4d): the concurrency-window lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $e8$  if t.lane in ('llm_witness','payroll_facts','contract_facts') then$e8$;
    v_next := replace(v_next, v_anchor, v_repl);
    execute v_next;
    raise notice '#948 §E3(4): clara.claim_document_processing_task spliced -- kill switch, attempt cap, cap emit and concurrency window.';
  end if;
end
$w948_claim$;

do $w948_release$
declare
  v_sig text := 'clara.release_held_document_tasks(integer)';
  v_def text; v_next text; v_anchor text; v_repl text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('contract_facts' in v_def) > 0 then
    raise notice '#948 §E3(5): clara.release_held_document_tasks already releases contract_facts -- nothing to do (redo)';
  else
    -- #948: contract_facts joins BOTH lists together with the claim body's kill-switch list --
    -- a lane that can be HELD and cannot be RELEASED is a permanent stall, and 0038's own comment
    -- says this list must track the claim body's list EXACTLY.
    v_anchor := $f1$    where t.status='held_egress' and t.lane in ('ocr','invoice_facts','statement_facts','llm_witness','payroll_facts')$f1$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (5a): the held-lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $f2$    where t.status='held_egress' and t.lane in ('ocr','invoice_facts','statement_facts','llm_witness','payroll_facts','contract_facts')$f2$;
    v_next := replace(v_def, v_anchor, v_repl);

    v_anchor := $f3$        t.lane in ('ocr','statement_facts','llm_witness','payroll_facts')$f3$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §E3 splice (5b): the kill-switch-only lane list appears % time(s), expected 1', v_n using errcode = 'CLR10';
    end if;
    v_repl := $f4$        t.lane in ('ocr','statement_facts','llm_witness','payroll_facts','contract_facts')$f4$;
    v_next := replace(v_next, v_anchor, v_repl);
    execute v_next;
    raise notice '#948 §E3(5): clara.release_held_document_tasks spliced -- contract_facts joins both lists.';
  end if;
end
$w948_release$;

reset role;

-- =====================================================================================
-- §F  THE PERSIST DOOR AND THE LANE'S OWN FAIL VERB.
--
--     clara.persist_agreement_facts(uuid, jsonb, jsonb, integer) is the ONE writer of agreement
--     facts: the atomic, idempotent two-row persist clara.persist_witness_facts set the shape for
--     and clara.persist_payroll_facts last restated. clara.fail_agreement_facts(uuid, text) is
--     its terminal twin.
--
--     WHAT IT STORES, AND WHY THE SCHEDULE IS KEPT WHERE THE PAYSLIP'S ROWS WERE DISCARDED. 0296
--     STRIPS the per-employee rows before writing, because #945's brief said in terms that no
--     employee-level figure is persisted. This family's brief says the opposite in terms: "where
--     the agreement prints a repayment schedule, each scheduled instalment with its principal
--     and interest split" is part of WHAT CLARA READS. A repayment schedule is the agreement's
--     own printed table, not a third party's pay; it is the record a later interest-allocation
--     lane must read, and discarding it would make this lane unable to answer the one question
--     an MPERS 20 / MFRS 16 successor will ask (how much of instalment N is finance charge).
--     So both channel rows carry the channel's answers AND its quoted schedule, and the text row
--     additionally carries the fact state §D computed.
--
--     THE FACT STATE RIDES WITH THE READ. §D's evaluator is IMMUTABLE and, because the rows ARE
--     banked here, genuinely re-runnable from what is stored — but it is banked anyway, at the
--     one moment both envelopes exist, so the verdict a surface renders is the verdict the post
--     acted on and not a later re-derivation that could differ if a _v2 ever ships.
--
--     THE REGIONS ARE THE TYPED FACTS. One clara.document_regions row per run-level question,
--     hung off the CANONICAL text row of the pair, carrying the verbatim rendering, the DB's own
--     integer cents where the two channels agreed on a readable figure, and a locator — so a
--     person can click a figure and see where on the page it came from. ELEVEN rows and no more:
--     `uq_document_regions_extraction_field_path` admits ONE region per field path per
--     extraction, so a schedule cell could not have a region of its own even if this door wanted
--     to write one. The schedule lives in the envelope; the typed facts are the run-level terms.
--
--     AN UNPRINTED ANSWER STILL GETS A ROW, carrying no rendering and no cents at all: that row
--     IS the reading "the page does not print this", and it is the reason a surface can say
--     `not printed` instead of showing a zero. A figure the two channels read DIFFERENTLY also
--     lands with no cents; the region set is the facts, the banked state is the verdict.
--
--     THE FIVE NON-MONETARY QUESTIONS CARRY NO MONETARY COLUMN AT ALL. What the agreement calls
--     itself, the financier, the signing date, what was acquired and the term in months are a
--     name, a name, a date, prose and a count. Writing `monetary_raw` for any of them would
--     invite a reader to sum a term of months, which is the class of mistake this family's whole
--     "the model never computes" posture exists to prevent.
--
--     PERSIST WHOLE; NEVER REFUSE A READ FOR BEING WRONG. Structural malformation — a broken
--     vocabulary, a missing or unresolvable pin, two channels on one prompt — is refused at the
--     write boundary, before anything is inserted. A read that is well-formed but DISAGREES with
--     itself, or whose arithmetic fails, is banked in full with the failure named in the state.
--     That is the invoice lane's own C4 discipline: a person cannot adjudicate a reading they
--     cannot see, and AC5's non-financing agreement is READ by exactly this path before §H
--     decides it drafts nothing.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.persist_agreement_facts(p_task uuid, p_text jsonb, p_vision jsonb,
    p_pages_used integer default null)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $paf$
declare
  t record; d record;
  -- The eleven run-level questions, in the questionnaire's own order.
  v_run text[] := array['contract.agreement.kind','contract.agreement.financier',
    'contract.agreement.agreement_date','contract.agreement.asset_description',
    'contract.agreement.cash_price','contract.agreement.deposit',
    'contract.agreement.amount_financed','contract.agreement.total_charges',
    'contract.agreement.total_payable','contract.agreement.term_months',
    'contract.agreement.instalment_amount'];
  -- The SIX that are money. The other five are a name, a name, a date, prose and a count.
  v_money text[] := array['contract.agreement.cash_price','contract.agreement.deposit',
    'contract.agreement.amount_financed','contract.agreement.total_charges',
    'contract.agreement.total_payable','contract.agreement.instalment_amount'];
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
    raise exception 'agreement pages_used must be non-negative' using errcode='CLR10';
  end if;

  -- 1. TASK LOOKUP + LANE.
  select * into t from clara.document_processing_tasks where id = p_task;
  if not found or t.lane <> 'contract_facts' then
    raise exception 'agreement-facts task not found or not in the contract_facts lane' using errcode='CLR16';
  end if;

  -- 2. IDEMPOTENT REPLAY (the persist_invoice_facts precedent): a done task's pair already
  --    exists under the four-column unique; return the stored receipt, never re-insert.
  if t.status = 'done' then
    select id into v_existing_text from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='agreement_text_facts';
    select id into v_existing_vision from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='agreement_vision_facts';
    return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
      'engine_id',t.engine_id,'version_n',t.version_n,
      'text_extraction_id',v_existing_text,'vision_extraction_id',v_existing_vision,
      'status','done','replayed',true);
  end if;

  -- 3. THE ANSWER VOCABULARY (structural).
  v_text_env := p_text->'envelope'; v_vision_env := p_vision->'envelope';
  if not clara._agreement_answers_ok(v_text_env,'text')
     or not clara._agreement_answers_ok(v_vision_env,'vision') then
    raise exception 'agreement envelope is malformed (channel/answers vocabulary -- every run-level question is answered, `not_printed` included, every quoted schedule row answers all four cells, and no unknown key is admitted)' using errcode='CLR10';
  end if;

  -- 4. THE INPUT PINS (structural). Text pins the PINNED, done, engine_kind='ocr' extraction of
  --    THIS document; vision pins documents.sha256 -- the document's own bytes.
  v_text_pin := nullif(btrim(p_text->>'input_pin'),'');
  v_vision_pin := nullif(btrim(p_vision->>'input_pin'),'');
  if v_text_pin is null or v_vision_pin is null then
    raise exception 'agreement call is missing an input pin' using errcode='CLR10';
  end if;
  select * into d from clara.documents where id = t.document_id and firm_id = t.firm_id;
  if not found then
    raise exception 'impossible state: agreement task % names no owning document', p_task using errcode='CLR35';
  end if;
  begin
    select e.id into v_ocr_ext from clara.document_extractions e
      where e.id = v_text_pin::uuid and e.document_id = t.document_id and e.firm_id = t.firm_id
        and e.engine_kind = 'ocr' and e.status = 'done';
  exception when invalid_text_representation then
    v_ocr_ext := null;
  end;
  if v_ocr_ext is null then
    raise exception 'the text agreement input pin does not resolve to a done OCR extraction of this document' using errcode='CLR10';
  end if;
  if lower(v_vision_pin) <> d.sha256 then
    raise exception 'the vision agreement input pin does not match documents.sha256' using errcode='CLR10';
  end if;

  -- 5. EQUAL PROMPT HASHES (structural) -- the independence receipt. Two channels that used one
  --    prompt are one reading twice, not two readings.
  v_text_hash := nullif(btrim(p_text->>'prompt_hash'),'');
  v_vision_hash := nullif(btrim(p_vision->>'prompt_hash'),'');
  if v_text_hash is null or v_vision_hash is null then
    raise exception 'agreement call is missing a prompt hash' using errcode='CLR10';
  end if;
  if v_text_hash = v_vision_hash then
    raise exception 'the text and vision channels used the same prompt hash -- the independence receipt requires distinct prompts' using errcode='CLR10';
  end if;

  v_citations := coalesce(p_text->'citations','[]'::jsonb);
  if jsonb_typeof(v_citations) <> 'array' then
    raise exception 'agreement citations payload is malformed' using errcode='CLR10';
  end if;

  if t.status <> 'running' then
    raise exception 'agreement-facts task is not running' using errcode='CLR16';
  end if;

  -- 6. THE EVALUATOR. Called BEFORE anything is written, on the FULL envelopes.
  v_state := clara.evaluate_agreement_contract_state_v1(v_text_env, v_vision_env);

  -- 7. WHAT IS BANKED. Each channel's own answers and its own quoted schedule; the fact state on
  --    the TEXT row alone, because there is exactly one state per pair and the text row is the
  --    pair's canonical row everywhere else in this estate.
  v_text_store := jsonb_build_object(
    'contract', jsonb_build_object('channel','text',
      'answers', v_text_env->'contract'->'answers', 'rows', v_text_env->'contract'->'rows'),
    'contract_state', v_state);
  v_vision_store := jsonb_build_object(
    'contract', jsonb_build_object('channel','vision',
      'answers', v_vision_env->'contract'->'answers', 'rows', v_vision_env->'contract'->'rows'));

  -- 8. THE ATOMIC PAIR INSERT -- vision FIRST, text LAST, each with an explicit clock reading, so
  --    the document-wide pointer lands on the TEXT row deterministically (the witness precedent).
  v_vision_at := clock_timestamp();
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
      status,page_count,envelope,extracted_at)
    values(t.firm_id,t.document_id,t.engine_id,'agreement_vision_facts',t.version_n,
      'done',p_pages_used,v_vision_store,v_vision_at)
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_vision_id;
  if v_vision_id is null then
    raise exception 'impossible state: an ON CONFLICT fired for the agreement vision row (document=%,engine=%,version=%) -- the pair row already exists at this key while its task is still running',
      t.document_id,t.engine_id,t.version_n using errcode='CLR35';
  end if;

  v_text_at := greatest(clock_timestamp(), v_vision_at + interval '1 microsecond');
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
      status,page_count,envelope,extracted_at)
    values(t.firm_id,t.document_id,t.engine_id,'agreement_text_facts',t.version_n,
      'done',p_pages_used,v_text_store,v_text_at)
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_text_id;
  if v_text_id is null then
    raise exception 'impossible state: an ON CONFLICT fired for the agreement text row (document=%,engine=%,version=%) -- the pair row already exists at this key while its task is still running',
      t.document_id,t.engine_id,t.version_n using errcode='CLR35';
  end if;

  -- 9. THE ELEVEN TYPED FACTS. One region per question, ANSWERED OR NOT.
  foreach v_f in array v_run loop
    v_ans := v_text_env->'contract'->'answers'->v_f;
    v_fact := v_state->'facts'->v_f;
    v_raw := case when v_ans->>'state' = 'value' then v_ans->>'raw' end;
    v_cents := case when v_f = any(v_money)
                    then nullif(v_fact->>'printed_cents','')::bigint end;

    -- The citation, when the text call supplied one for this question. Resolved through the ONE
    -- numbering the estate publishes (clara._witness_resolve_citation answers "the Nth region of
    -- this OCR extraction, in reading order"), so an agreement prompt builder numbers against
    -- exactly what this door resolves.
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
        case when v_f = any(v_money) then v_raw end,
        v_cents);
  end loop;

  -- 10. USAGE METERING, optional at this layer exactly as it is for the witness and payroll
  --     pairs: the runtime meters at call time (it alone knows a call that never reaches a
  --     persist), and a caller MAY also pass usage here so a pair that DOES persist carries at
  --     least one row per channel.
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

  -- 11. SETTLE + AUDIT + EMIT.
  update clara.document_processing_tasks set status='done', finished_at=now() where id=p_task;

  perform clara._audit(t.firm_id,null,null,null,'persist_agreement_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,
      'text_extraction',v_text_id,'vision_extraction',v_vision_id,'version',t.version_n,
      'agreement_class',v_state->>'agreement_class',
      'established',jsonb_array_length(coalesce(v_state->'established','[]'::jsonb)),
      'disagreed',jsonb_array_length(coalesce(v_state->'disagreed','[]'::jsonb)),
      'missing',jsonb_array_length(coalesce(v_state->'missing','[]'::jsonb))));

  perform clara._append_event(t.firm_id,'document.agreement_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_text_id,'version_n',t.version_n,
      'agreement_class',v_state->>'agreement_class'));

  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
    'engine_id',t.engine_id,'version_n',t.version_n,
    'text_extraction_id',v_text_id,'vision_extraction_id',v_vision_id,
    'status','done','replayed',false);
end $paf$;

revoke all on function clara.persist_agreement_facts(uuid, jsonb, jsonb, integer) from public;
grant execute on function clara.persist_agreement_facts(uuid, jsonb, jsonb, integer) to clara_runtime;

comment on function clara.persist_agreement_facts(uuid, jsonb, jsonb, integer) is
  '#948: the ONE writer of agreement-contract typed facts -- the atomic, idempotent two-row persist for the contract_facts lane, clara.persist_witness_facts'' shape. It evaluates the pair through clara.evaluate_agreement_contract_state_v1 BEFORE writing, banks each channel''s run-level answers AND its quoted repayment schedule (the payslip lane strips its rows because #945''s brief forbids persisting an employee figure; a repayment schedule is the agreement''s own printed table and #948''s brief asks for it), and writes one clara.document_regions row per run-level question -- including for a term the page does not print, which lands carrying no rendering and no cents so a surface can say `not printed` instead of showing a zero. The five non-monetary questions carry no monetary column at all. clara_runtime only.';

create or replace function clara.fail_agreement_facts(p_task uuid, p_code text)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $faf$
declare t record; v_code text;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found or t.lane<>'contract_facts' then
    raise exception 'agreement-facts task not found' using errcode='CLR16';
  end if;
  if t.status='failed' then
    return jsonb_build_object('task_id',p_task,'status','failed',
      'reason',coalesce(t.error_code,p_code),'replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'agreement-facts task is not running' using errcode='CLR16';
  end if;
  -- THE ADMITTED VOCABULARY -- the exact codes this lane''s worker can terminally report, and
  -- nothing broader. Anything else coerces to ''engine_error'', exactly as fail_witness_facts,
  -- fail_invoice_facts and fail_payroll_facts already coerce an unrecognised reason.
  v_code:=case when p_code in ('bad_type','limit','internal','corrupt','encrypted',
      'agreement_consent_inactive','agreement_multi_client','wait_exhausted')
    then p_code else 'engine_error' end;
  update clara.document_processing_tasks set status='failed',error_code=v_code,
    finished_at=now() where id=p_task;
  -- Harmless unconditionally: contract_facts never reserves a page budget (it is a model lane,
  -- and the router reserves for the two Azure lanes alone), so this always finds no reservation
  -- -- called anyway for the SAME reason its siblings call it: one shape over a lane-conditional
  -- one.
  perform clara._refund_processing_call(p_task,coalesce(nullif(btrim(p_code),''),v_code));
  perform clara._audit(t.firm_id,null,null,null,'fail_agreement_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'reason',v_code));
  perform clara._append_event(t.firm_id,'document.agreement_facts_failed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason',v_code));
  return jsonb_build_object('task_id',p_task,'status','failed','reason',v_code);
end $faf$;

revoke all on function clara.fail_agreement_facts(uuid, text) from public;
grant execute on function clara.fail_agreement_facts(uuid, text) to clara_runtime;

comment on function clara.fail_agreement_facts(uuid, text) is
  '#948: the terminal settle for a RUNNING contract_facts task -- clara.fail_witness_facts'' shape exactly, with the agreement lane''s own admitted code vocabulary (its two enqueue-time gate verdicts included) and its own lane-true event twin, so an agreement refusal never reaches the spine as a phantom invoice failure. clara_runtime only.';

reset role;

-- =====================================================================================
-- §G  THE CAPABILITY REGISTRY IS RE-DERIVED (AC3).
--
--     THE REGISTRY IS A DERIVED CLAIM, NOT AN OPINION. `stored_only` on the agreement contract's
--     typed-facts axis was DERIVED from the router's own dead end — its reason sentence said so
--     in words ("The facts router terminates this pair cleanly (skipped_kind / skipped_type): the
--     document stays stored and readable and Clara derives no typed facts from it"). §E removed
--     that dead end, so leaving the registry alone would not be conservatism, it would be a false
--     statement about what this estate does. The two changes are one change.
--
--     BOTH AXES MOVE HERE, WHICH IS WHERE #945 AND #948 DIFFER. 0296 moved `typed_facts` and
--     deliberately left `business_operation` at `stored_only`, because #945 was the reading half
--     and #946 shipped the posting half in a later file. #948 is BOTH halves in one file: §H-§K
--     below carry these typed facts into a posted acquisition, which is the column's own
--     published definition of `supported` ("supported where Clara can carry typed facts into
--     it"). Leaving it at `stored_only` would understate the estate exactly as leaving
--     `typed_facts` there would overstate the dead end. #946's payroll row is NOT touched: this
--     file re-publishes the registry's VERSION, it does not restate another ticket's verdict.
--
--     SIX FORMATS MOVE, AND ONLY SIX. The router's agreement arm sits on the pdf/image mime
--     branch, so exactly the pairs whose mime is application/pdf or image/* gain a reader: pdf,
--     png, jpeg, tiff, webp, heic. csv/tsv/xlsx/docx and ofx keep `stored_only` — a spreadsheet
--     of agreement terms has no reader on this lane and the registry must not imply one — and xml
--     keeps `unsupported`, because the local lane reads MyInvois UBL only.
--
--     THE TWO LIMITS ARE NAMED, IN #782's OWN TWO-KEY SHAPE, and both are `accepted_limitation`
--     rather than `planned`, because both are permanent boundaries this lane is BUILT to hold:
--       agreement_non_financing — a tenancy, an operating lease or a supply contract creates no
--         asset and no liability on the day it is signed, so there is no entry for this lane to
--         draft. That is the accounting, not a gap in the build: #949's contract-terms record
--         reads such an agreement, and it still posts nothing at signing.
--       agreement_asset_account — the page prints what was acquired as PROSE, and no reading of
--         prose is an account code. The asset account is resolved from the CLIENT'S OWN
--         enrolments (clara.fa_account_profiles, active); none or several is a named refusal a
--         person clears, never a guess. That is the standing owner ruling applied verbatim.
--
--     UPDATE, NEVER DELETE-THEN-INSERT (#846's wall), and the version raise is REGISTRY-WIDE
--     (0228's precedent, 0245's second use, 0296's third) because the registry's one-version law
--     is enforced by both the live battery and 0244's deferred uniformity trigger.
--
--     REDO-SAFE: the raise is a SET-TO-LITERAL guarded by `where registry_version <> 6`, not
--     0245's `+ 1`. A `+ 1` re-run would carry the registry to 7 and every later reader's
--     expectation with it. The same literal form also makes this file SAFE BESIDE another lane
--     that raises to 6 in the same wave: two SET-TO-6 statements compose, two `+ 1`s do not.
-- =====================================================================================
set role clara_fn_owner;

-- G1 · THE CONTENT. Additive on `limits` (0228's `limits || jsonb` idiom, which keeps any key a
--      later file adds), and an outright rewrite of the three columns whose old values described
--      the dead end. Scoped by MIME rather than by a transcribed format list, so it names the
--      same six pairs the router's own branch does.
update clara.document_capabilities
   set typed_facts = 'supported',
       business_operation = 'supported',
       basis = 'Bytes are sealed at intake and read by ' || engine_byte
             || '. Typed facts are persisted with source regions by llm-openai:gpt-5.6-terra:agreement-witness-v1: '
             || 'what the agreement calls itself, the financier, the signing date, what was acquired, the cash price, '
             || 'the deposit or trade-in, the amount financed, the total charges, the total payable, the term and the '
             || 'instalment, and every row of a printed repayment schedule with its principal and interest split. '
             || 'Clara reports what the page prints and a deterministic evaluator does every sum and the '
             || 'classification — she never adds anything up herself, never decides from anything but the rendering '
             || 'the page uses for itself, and a figure the page does not print is reported as not printed rather '
             || 'than filled with zero. Where the page is a hire purchase or a finance lease whose arithmetic holds, '
             || 'the acquisition it creates on the day of signing is posted unattended into the fixed-asset lane, '
             || 'with the liability recognised against the financier and the deposit leg where the agreement states '
             || 'one; the depreciation particulars come from the account''s own policy and are never invented here. '
             || 'Anything else goes to Needs you naming the condition that failed.',
       limits = limits || jsonb_build_object(
         'agreement_non_financing', 'accepted_limitation',
         'agreement_non_financing_reason', 'no_entry_exists_at_signing_for_a_non_financing_agreement',
         'agreement_asset_account', 'accepted_limitation',
         'agreement_asset_account_reason', 'resolved_from_client_enrolment_never_from_prose')
 where document_kind = 'agreement_contract'
   and (mime_type = 'application/pdf' or mime_type like 'image/%')
   and (typed_facts <> 'supported' or business_operation <> 'supported'
        or not (limits ? 'agreement_non_financing'));

-- G2 · THE REGISTRY-WIDE RAISE. One statement, every row, to the literal this file publishes at,
--      so `count(distinct registry_version)` stays 1 — enforced by the live battery AND by 0244's
--      deferred constraint trigger. 0207's wall sees each row's transition and permits it because
--      it is a raise; 0244's high-water writer raises every pair's mark in lockstep.
update clara.document_capabilities
   set registry_version = 6
 where registry_version <> 6;

reset role;

-- =====================================================================================
-- §H  THE SIGNING DATE -- clara._agreement_signed_date(text) returns date.
--
--     The entry this lane posts is dated the day the agreement was SIGNED, because that is the
--     day the asset and the liability come into existence -- not the day the pdf was uploaded.
--     This body is the "establish" half: it turns the VERBATIM rendering the page printed into a
--     date, or returns NULL, which §I turns into a named refusal and §L turns into a Needs-you
--     row. It never guesses.
--
--     WHY IT PARSES AT ALL, rather than demanding ISO. This family's questionnaire asks the model
--     to quote the signing date AS PRINTED, which is the never-infer-never-compute rule applied
--     to a date. Something has to read that rendering and it must be this side of the boundary: a
--     model that normalised the date would be computing.
--
--     THE ALL-NUMERIC TRIPLE, AND WHERE THIS BODY PARTS FROM clara._payroll_period_month. 0297
--     refuses EVERY all-numeric triple, because a payslip month read the wrong way round is a
--     whole period in the wrong place. That rule is too blunt for a signing date: `14/03/2026` is
--     what a Malaysian agreement actually prints and it has exactly ONE reading, since 14 is not
--     a month. So this body tries BOTH orderings and admits the rendering only when exactly one
--     of them is a real date:
--       14/03/2026   -> 2026-03-14   (only day-first is possible)
--       03/14/2026   -> 2026-03-14   (only month-first is possible)
--       03/04/2026   -> NULL         (3 April and 4 March are both real; ASKED, never guessed)
--       31/02/2026   -> NULL         (neither ordering is a real date)
--     A year-first ISO rendering is unambiguous by construction and is read directly.
--
--     MONTH NAMES IN BOTH LANGUAGES, for the same reason §D's classification roster carries
--     `sewa beli` and `pajakan kewangan`: a Malaysian agreement prints `14 Mac 2026` as readily as
--     `14 March 2026`, and refusing the one it actually printed would send a readable page to a
--     person for no reason. Full name or three-letter prefix, in either language.
--
--     LOCALE-FREE BY CONSTRUCTION: the month names are this body's own arrays, never
--     `to_date(..., 'Month YYYY')`, whose behaviour depends on the session. That is also what
--     makes the function honestly IMMUTABLE.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._agreement_signed_date(p_raw text) returns date
  language plpgsql immutable set search_path = pg_catalog, pg_temp as $asd$
declare
  v_s text; v_y int; v_a int; v_b int; v_name text; v_d int; v_m int; v_i int;
  v_en text[] := array['january','february','march','april','may','june',
                       'july','august','september','october','november','december'];
  v_ms text[] := array['januari','februari','mac','april','mei','jun',
                       'julai','ogos','september','oktober','november','disember'];
  v_first date; v_second date; v_hits int;
begin
  v_s := btrim(coalesce(p_raw, ''));
  if v_s = '' then return null; end if;
  v_s := regexp_replace(v_s, '\s+', ' ', 'g');

  -- 1 · YEAR FIRST. The only numeric shape that carries its own disambiguation.
  if v_s ~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}$' then
    v_y := (regexp_replace(v_s, '^([0-9]{4}).*$', '\1'))::int;
    v_a := (regexp_replace(v_s, '^[0-9]{4}[-/.]0*([0-9]{1,2})[-/.][0-9]{1,2}$', '\1'))::int;
    v_b := (regexp_replace(v_s, '^[0-9]{4}[-/.][0-9]{1,2}[-/.]0*([0-9]{1,2})$', '\1'))::int;
    begin
      return make_date(v_y, v_a, v_b);
    exception when others then
      return null;   -- '2026-02-31' is a rendering, not a date
    end;
  end if;

  -- 2 · YEAR LAST, ALL NUMERIC. Both orderings are tried and the rendering is admitted only when
  --     exactly one of them is a real date.
  if v_s ~ '^[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{4}$' then
    v_a := (regexp_replace(v_s, '^0*([0-9]{1,2})[-/.][0-9]{1,2}[-/.][0-9]{4}$', '\1'))::int;
    v_b := (regexp_replace(v_s, '^[0-9]{1,2}[-/.]0*([0-9]{1,2})[-/.][0-9]{4}$', '\1'))::int;
    v_y := (regexp_replace(v_s, '^[0-9]{1,2}[-/.][0-9]{1,2}[-/.]([0-9]{4})$', '\1'))::int;
    if v_y < 1900 or v_y > 2999 then return null; end if;
    begin v_first := make_date(v_y, v_b, v_a); exception when others then v_first := null; end;   -- day first
    begin v_second := make_date(v_y, v_a, v_b); exception when others then v_second := null; end; -- month first
    v_hits := (case when v_first is null then 0 else 1 end) + (case when v_second is null then 0 else 1 end);
    if v_hits <> 1 then
      -- Two readings, or none. Either way the page has not told this lane a date.
      return null;
    end if;
    return coalesce(v_first, v_second);
  end if;

  -- 3 · A DAY, A MONTH NAME AND A YEAR, in either of the two orders a page prints them.
  if v_s ~* '^[0-9]{1,2}[ ,/-]+[A-Za-z]{3,9}[ ,/-]+[0-9]{4}$' then
    v_d := (regexp_replace(v_s, '^0*([0-9]{1,2})[ ,/-]+[A-Za-z]{3,9}[ ,/-]+[0-9]{4}$', '\1'))::int;
    v_name := lower(regexp_replace(v_s, '^[0-9]{1,2}[ ,/-]+([A-Za-z]{3,9})[ ,/-]+[0-9]{4}$', '\1'));
    v_y := (regexp_replace(v_s, '^[0-9]{1,2}[ ,/-]+[A-Za-z]{3,9}[ ,/-]+([0-9]{4})$', '\1'))::int;
  elsif v_s ~* '^[A-Za-z]{3,9}[ ,/-]+[0-9]{1,2}[ ,/-]+[0-9]{4}$' then
    v_name := lower(regexp_replace(v_s, '^([A-Za-z]{3,9})[ ,/-]+[0-9]{1,2}[ ,/-]+[0-9]{4}$', '\1'));
    v_d := (regexp_replace(v_s, '^[A-Za-z]{3,9}[ ,/-]+0*([0-9]{1,2})[ ,/-]+[0-9]{4}$', '\1'))::int;
    v_y := (regexp_replace(v_s, '^[A-Za-z]{3,9}[ ,/-]+[0-9]{1,2}[ ,/-]+([0-9]{4})$', '\1'))::int;
  else
    return null;
  end if;

  v_m := null;
  for v_i in 1 .. 12 loop
    -- A three-letter prefix is the only abbreviation admitted, and it must be a prefix of the
    -- month it names, in either language: 'mar'/'march'/'mac' resolve to March, 'ma' does not.
    if v_name = v_en[v_i] or (length(v_name) = 3 and v_name = left(v_en[v_i], 3))
       or v_name = v_ms[v_i] or (length(v_name) = 3 and v_name = left(v_ms[v_i], 3)) then
      v_m := v_i;
    end if;
  end loop;
  if v_m is null then return null; end if;
  if v_y < 1900 or v_y > 2999 then return null; end if;
  begin
    return make_date(v_y, v_m, v_d);
  exception when others then
    return null;   -- '31 February 2026' is a rendering, not a date
  end;
end $asd$;

revoke all on function clara._agreement_signed_date(text) from public;

comment on function clara._agreement_signed_date(text) is
  '#948: the day the agreement was signed, established from the rendering the page printed. Year-first ISO is read directly; an all-numeric YEAR-LAST triple is admitted ONLY where exactly one of the two orderings is a real date (14/03/2026 resolves, 03/04/2026 is ASKED rather than guessed, 31/02/2026 is neither); a day with a month NAME is admitted in English or Malay, full or three-letter prefix, in either order. Everything else returns NULL so the acquisition is asked rather than posted on a guess. Locale-free: the month names are this body''s own arrays, which is also what makes it honestly IMMUTABLE. Ungranted: reached only from clara._agreement_entry_plan.';

reset role;

-- =====================================================================================
-- §I  THE DRAFTING BODY (AC4) -- clara._agreement_entry_plan(uuid, jsonb) returns jsonb.
--
--     An ESTABLISHED agreement fact state in; the entry the brief describes out. It takes the
--     state rather than a document deliberately (0297 §C's own reason): the state is §D's output
--     and the plan is a pure function of it plus this client's chart and enrolments, so the
--     arithmetic can be driven and proved without a document, a filing or a task in the way.
--
--     IT DRAFTS FROM `established` ALONE. §D classifies every run-level question as `established`
--     (both channels agree on a readable figure the page printed, and every cross-check it could
--     run passed), `not_printed` (the page does not print it), or anything else (they disagree, a
--     printed total contradicts the column sum, a rendering is not a figure). A figure that is
--     not `established` produces no leg and, where the entry needs it, a NAMED refusal.
--
--     THE TWO TREATMENTS, AND WHY THEY DIFFER (AGENTS.md rule 6 -- checked against the standard).
--       HIRE PURCHASE -- the GROSS method, which the estate's own standard chart already encodes
--       by shipping an Interest Suspense account beside the Creditor: the whole amount payable is
--       a liability at signing and the unexpired finance charge sits in suspense against it.
--       FINANCE LEASE -- the NET method. MPERS Section 20.9 has the lessee recognise the asset and
--       the lease liability at the LOWER of fair value and the present value of the minimum lease
--       payments, with the finance charge allocated over the term as it accrues; the liability is
--       recorded NET of the unexpired charge, and the chart agrees -- 2450 ships with no
--       interest-suspense counterpart. Both entries balance on §D's own identity
--       `deposit + financed = cash price`, which is exactly AC2's first check.
--
--     WHY THE DEPOSIT LEG CREDITS A PAYABLE AND NEVER A BANK ACCOUNT. Clara did not see the money
--     move. The agreement STATES a deposit; it does not state which of this client's bank accounts
--     paid it, and choosing one would be Clara choosing rather than reading. So the deposit is
--     credited to 2010 Other Payables, named in the leg's description, and the bank line that
--     actually paid it clears that payable through the ordinary matcher.
--
--     AN UNPRINTED LINE PRODUCES NO LEG, and neither does a printed zero: a line the page does not
--     print is not a figure of zero, and a 0.00 deposit leg would assert a payment the document
--     never mentioned.
--
--     WHICH ASSET ACCOUNT, AND WHY AMBIGUITY IS A REFUSAL RATHER THAN A GUESS. The page prints
--     what was acquired as PROSE, and no reading of prose is an account code. The lane resolves
--     the asset account from the CLIENT'S OWN ENROLMENTS (clara.fa_account_profiles, active):
--     exactly one resolves; none or several is a NAMED refusal carrying the accounts it could not
--     choose between, which a person clears by enrolling the account or by saying which one. That
--     is the standing owner ruling applied verbatim, and it is also what makes
--     clara._tf_fa_acquisition_birth's own precondition true by construction -- the entry debits
--     an enrolled account, so the register row is born without this file calling anything
--     fixed-asset-specific.
--
--     IT WRITES NO DEPRECIATION PARTICULAR OF ANY KIND. No accumulated-depreciation leg, no
--     expense leg, no useful life, no rate. #932/#933 own the policy and the birth trigger reads
--     it; this body could not invent one if it wanted to, because it never touches those columns.
--
--     EXACT BALANCE, NEVER ROUNDED. clara._validate_entry_lines tolerates a residual of up to 5
--     cents and books it to the rounding account. This body refuses instead: an acquisition whose
--     debits and credits differ AT ALL is an agreement whose printed figures did not hold, and
--     smoothing it into the rounding account would hide exactly the defect the gate exists to
--     catch. The balance is checked only when nothing above already refused, so a missing account
--     reports itself as a missing account rather than as the imbalance it caused.
--
--     ACCOUNTS ARE RESOLVED BY CODE IN THIS CLIENT'S OWN CHART, and each leg carries the NAME it
--     resolved to. A code the client does not hold (or holds inactive) is a NAMED refusal carrying
--     the code -- never a silent substitution and never an account this lane creates.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._agreement_entry_plan(p_client uuid, p_state jsonb)
  returns jsonb language plpgsql stable
  set search_path = clara, pg_temp as $aep$
declare
  v_class text; v_financing boolean;
  v_refusals jsonb := '[]'::jsonb; v_legs jsonb := '[]'::jsonb;
  v_unprinted text[] := '{}'; v_missing text[] := '{}';
  v_date_raw text; v_date_state text; v_posting date;
  v_cash bigint; v_dep bigint; v_fin bigint; v_chg bigint; v_dep_printed boolean;
  v_bad text[] := '{}';
  v_asset_code text; v_asset_name text; v_enrol int; v_accounts text[];
  v_desc text; v_memo_asset text;
  v_dr bigint := 0; v_cr bigint := 0;
  v_spec jsonb; r record; v_name text; v_price jsonb; v_recon jsonb;
begin
  if p_state is null or p_state->>'state_version' is distinct from 'v1' then
    return jsonb_build_object('plan_version','v1','ready',false,'legs','[]'::jsonb,
      'stage','kind',
      'agreement_class',null,'financing',false,
      'agreement_date_raw',null,'posting_date',null,
      'asset_account_code',null,'asset_account_name',null,
      'debit_cents',0,'credit_cents',0,'unprinted','[]'::jsonb,'missing_accounts','[]'::jsonb,
      'refusals', jsonb_build_array(jsonb_build_object('reason','state_unreadable',
        'detail', jsonb_build_object('state_version', p_state->>'state_version'))));
  end if;

  v_class := p_state->>'agreement_class';
  v_financing := coalesce((p_state->>'financing')::boolean, false);
  v_memo_asset := case when (p_state->'facts'->'contract.agreement.asset_description'->>'state') = 'established'
                       then p_state->'facts'->'contract.agreement.asset_description'->>'printed_raw' end;

  -- 1 · IS THERE AN ACQUISITION AT ALL (AC5). A tenancy, an operating lease or a supply contract
  --     creates no asset and no liability on the day it is signed, so there is nothing for this
  --     body to draft -- and nothing to complain about either. It returns HERE, with ONE named
  --     refusal, rather than walking on and reporting a missing account or an unbalanced entry
  --     about an entry that should never exist.
  --
  --     "We could not read what kind of page this is" and "it is a tenancy" are DIFFERENT
  --     answers, and they get different reasons, because a person clears them differently: one by
  --     checking the page, the other not at all.
  if v_class is null or v_class = 'not_established' then
    v_refusals := jsonb_build_array(jsonb_build_object('reason','agreement_kind_not_established',
      'detail', jsonb_build_object('kind_state', p_state->'facts'->'contract.agreement.kind'->>'state',
        'kind_raw', p_state->'facts'->'contract.agreement.kind'->>'printed_raw')));
  elsif not v_financing then
    v_refusals := jsonb_build_array(jsonb_build_object('reason','not_a_financing_agreement',
      'detail', jsonb_build_object('agreement_class', v_class,
        'class_basis', p_state->>'class_basis',
        'kind_raw', p_state->'facts'->'contract.agreement.kind'->>'printed_raw')));
  end if;
  if jsonb_array_length(v_refusals) > 0 then
    return jsonb_build_object('plan_version','v1','ready',false,'legs','[]'::jsonb,
      'stage','kind',
      'agreement_class', to_jsonb(v_class),'financing', v_financing,
      'agreement_date_raw',null,'posting_date',null,
      'asset_account_code',null,'asset_account_name',null,
      'debit_cents',0,'credit_cents',0,'unprinted','[]'::jsonb,'missing_accounts','[]'::jsonb,
      'refusals', v_refusals);
  end if;

  -- 2 · THE SIGNING DATE. Established from the rendering the page printed, never from today and
  --     never from the upload.
  v_date_state := p_state->'facts'->'contract.agreement.agreement_date'->>'state';
  v_date_raw := p_state->'facts'->'contract.agreement.agreement_date'->>'printed_raw';
  if v_date_state = 'established' then
    v_posting := clara._agreement_signed_date(v_date_raw);
  end if;
  if v_posting is null then
    v_refusals := v_refusals || jsonb_build_object('reason','agreement_date_not_established',
      'detail', jsonb_build_object('date_state', v_date_state, 'date_raw', v_date_raw));
  end if;

  -- 3 · THE PRINTED MONEY THE ENTRY IS MADE OF.
  v_cash := case when (p_state->'facts'->'contract.agreement.cash_price'->>'state') = 'established'
                 then nullif(p_state->'facts'->'contract.agreement.cash_price'->>'printed_cents','')::bigint end;
  v_fin := case when (p_state->'facts'->'contract.agreement.amount_financed'->>'state') = 'established'
                then nullif(p_state->'facts'->'contract.agreement.amount_financed'->>'printed_cents','')::bigint end;
  v_dep := case when (p_state->'facts'->'contract.agreement.deposit'->>'state') = 'established'
                then nullif(p_state->'facts'->'contract.agreement.deposit'->>'printed_cents','')::bigint end;
  v_dep_printed := (p_state->'facts'->'contract.agreement.deposit'->>'state') is distinct from 'not_printed';
  v_chg := case when (p_state->'facts'->'contract.agreement.total_charges'->>'state') = 'established'
                then nullif(p_state->'facts'->'contract.agreement.total_charges'->>'printed_cents','')::bigint end;

  -- THE CASH PRICE AND THE AMOUNT FINANCED ARE THE ANCHOR: without either there is no entry at
  -- all, not a partial one. A deposit the page PRINTS and this lane could not establish is the
  -- same case -- the credit side would be short by a figure the page states.
  if v_cash is null then v_bad := v_bad || 'contract.agreement.cash_price'::text; end if;
  if v_fin is null then v_bad := v_bad || 'contract.agreement.amount_financed'::text; end if;
  if v_dep is null and v_dep_printed then v_bad := v_bad || 'contract.agreement.deposit'::text; end if;
  if coalesce(array_length(v_bad,1),0) > 0 then
    v_refusals := v_refusals || jsonb_build_object('reason','price_terms_not_established',
      'detail', jsonb_build_object('fields', to_jsonb(v_bad),
        'cash_price_state', p_state->'facts'->'contract.agreement.cash_price'->>'state',
        'amount_financed_state', p_state->'facts'->'contract.agreement.amount_financed'->>'state',
        'deposit_state', p_state->'facts'->'contract.agreement.deposit'->>'state'));
    return jsonb_build_object('plan_version','v1','ready',false,'legs','[]'::jsonb,
      'stage','price',
      'agreement_class', to_jsonb(v_class),'financing', v_financing,
      'agreement_date_raw', to_jsonb(v_date_raw),'posting_date', to_jsonb(v_posting),
      'asset_account_code',null,'asset_account_name',null,
      'debit_cents',0,'credit_cents',0,'unprinted','[]'::jsonb,'missing_accounts','[]'::jsonb,
      'refusals', v_refusals);
  end if;

  -- 4 · AC2's TWO NAMED CHECKS, read off §D's own verdicts rather than re-computed here: one body
  --     does the arithmetic and this one acts on it. `not_checkable` is not a failure -- an
  --     agreement that prints no repayment schedule is a real agreement and posts.
  v_price := p_state->'checks'->'price_identity';
  if v_price->>'state' = 'fails' then
    v_refusals := v_refusals || jsonb_build_object('reason','price_identity_failed', 'detail', v_price);
  end if;
  v_recon := p_state->'checks'->'schedule_reconciles';
  if v_recon->>'state' = 'fails' then
    v_refusals := v_refusals || jsonb_build_object('reason','schedule_does_not_reconcile', 'detail', v_recon);
  end if;

  -- 5 · THE ASSET ACCOUNT, from this client's own ACTIVE enrolments.
  select count(*)::int, array_agg(p.asset_account_code order by p.asset_account_code)
    into v_enrol, v_accounts
    from clara.fa_account_profiles p
   where p.client_id = p_client and p.active and p.retired_at is null;
  if coalesce(v_enrol,0) <> 1 then
    v_refusals := v_refusals || jsonb_build_object('reason','asset_account_unresolved',
      'detail', jsonb_build_object('enrolments', coalesce(v_enrol,0),
        'accounts', coalesce(to_jsonb(v_accounts), '[]'::jsonb)));
  else
    v_asset_code := v_accounts[1];
  end if;

  -- 6 · THE LEGS, in the order a reader wants them: what was acquired, then what it cost, then
  --     what is owed. `a` is the account code, `side` the direction, `c` the cents, `f1`/`f2` the
  --     printed terms the figure came from.
  if v_class = 'hire_purchase' then
    v_spec := jsonb_build_array(
      jsonb_build_object('a', v_asset_code, 'side','debit', 'c', v_cash,
        'f1','contract.agreement.cash_price','f2',null,
        'd', 'Asset acquired under hire purchase' || coalesce(' -- ' || left(v_memo_asset, 120), '')),
      jsonb_build_object('a','2440','side','debit', 'c', v_chg,
        'f1','contract.agreement.total_charges','f2',null,
        'd','Unexpired hire-purchase finance charge'),
      jsonb_build_object('a','2430','side','credit','c', v_fin + coalesce(v_chg,0),
        'f1','contract.agreement.amount_financed',
        'f2', case when v_chg is not null then 'contract.agreement.total_charges' end,
        'd','Hire purchase creditor'),
      jsonb_build_object('a','2010','side','credit','c', v_dep,
        'f1','contract.agreement.deposit','f2',null,
        'd','Deposit stated in the agreement, payable to the financier'));
  else
    -- finance_lease: the NET method, so the unexpired charge is recognised nowhere at signing.
    v_spec := jsonb_build_array(
      jsonb_build_object('a', v_asset_code, 'side','debit', 'c', v_cash,
        'f1','contract.agreement.cash_price','f2',null,
        'd', 'Asset acquired under finance lease' || coalesce(' -- ' || left(v_memo_asset, 120), '')),
      jsonb_build_object('a','2450','side','credit','c', v_fin,
        'f1','contract.agreement.amount_financed','f2',null,
        'd','Finance lease obligation'),
      jsonb_build_object('a','2010','side','credit','c', v_dep,
        'f1','contract.agreement.deposit','f2',null,
        'd','Deposit stated in the agreement, payable to the lessor'));
  end if;

  for r in select (t.x->>'a') acc, (t.x->>'side') side,
                  nullif(t.x->>'c','')::bigint cents,
                  (t.x->>'f1') f1, (t.x->>'f2') f2, (t.x->>'d') d, t.ord
             from jsonb_array_elements(v_spec) with ordinality as t(x, ord)
            order by t.ord loop
    -- WHAT THE PAGE WAS SILENT ABOUT, recorded by QUESTION and DISTINCT, so a reader sees which
    -- term produced no leg. A term the page printed as 0.00 belongs here too: the plan drew no
    -- figure from it either way.
    if r.f1 is not null and coalesce(r.cents,0) = 0 and not (r.f1 = any(v_unprinted)) then
      v_unprinted := v_unprinted || r.f1;
    end if;

    if coalesce(r.cents,0) = 0 then
      continue;   -- an unprinted line, and a printed zero, produce no leg at all
    end if;
    if r.acc is null then
      continue;   -- the asset account did not resolve; §5 already named that refusal
    end if;

    select a.name into v_name from clara.coa_accounts a
     where a.client_id = p_client and a.account_code = r.acc and a.is_active;
    if v_name is null then
      if not (r.acc = any(v_missing)) then
        v_missing := v_missing || r.acc;
        v_refusals := v_refusals || jsonb_build_object('reason','account_missing',
          'detail', jsonb_build_object('account_code', r.acc, 'for', r.d));
      end if;
      continue;
    end if;
    if r.acc = v_asset_code then v_asset_name := v_name; end if;

    v_legs := v_legs || jsonb_build_object(
      'account_code', r.acc, 'account_name', v_name, 'side', r.side,
      'cents', r.cents,
      'basis', concat_ws('+', r.f1, r.f2),
      'description', r.d);
    if r.side = 'debit' then v_dr := v_dr + r.cents; else v_cr := v_cr + r.cents; end if;
  end loop;

  -- 7 · EXACT BALANCE. Checked only when nothing above already refused.
  if jsonb_array_length(v_refusals) = 0 and v_dr <> v_cr then
    v_refusals := v_refusals || jsonb_build_object('reason','entry_unbalanced',
      'detail', jsonb_build_object('debit_cents', v_dr, 'credit_cents', v_cr,
        'difference_cents', v_dr - v_cr));
  end if;

  return jsonb_build_object(
    'plan_version','v1',
    -- HOW FAR THIS BODY GOT. The two early returns above mean the questions past them were
    -- genuinely never asked, and 0299 §J writes `not_evaluated` rather than `pass` for those
    -- rungs. Deriving it from the plan's own stage is what keeps the two bodies from disagreeing
    -- about where it stopped.
    'stage','complete',
    'agreement_class', to_jsonb(v_class),
    'financing', v_financing,
    'agreement_date_raw', to_jsonb(v_date_raw),
    'posting_date', to_jsonb(v_posting),
    'asset_account_code', to_jsonb(v_asset_code),
    'asset_account_name', to_jsonb(v_asset_name),
    'asset_description', to_jsonb(v_memo_asset),
    'financier', to_jsonb(case when (p_state->'facts'->'contract.agreement.financier'->>'state') = 'established'
                               then p_state->'facts'->'contract.agreement.financier'->>'printed_raw' end),
    'cash_price_cents', to_jsonb(v_cash),
    'legs', v_legs,
    'debit_cents', v_dr,
    'credit_cents', v_cr,
    'unprinted', to_jsonb(v_unprinted),
    'missing_accounts', to_jsonb(v_missing),
    'refusals', v_refusals,
    'ready', jsonb_array_length(v_refusals) = 0);
end $aep$;

revoke all on function clara._agreement_entry_plan(uuid, jsonb) from public;

comment on function clara._agreement_entry_plan(uuid, jsonb) is
  '#948: THE DRAFTING BODY. An established agreement fact state (clara.evaluate_agreement_contract_state_v1''s output) plus this client''s own chart and fixed-asset enrolments in; the acquisition entry out -- the asset debited at the printed cash price to the account the client ENROLLED, the liability recognised against the financier (a hire purchase GROSS, with the unexpired charge in suspense; a finance lease NET, per MPERS 20.9), and the deposit the agreement states credited to a payable rather than to a bank account Clara never saw move. A non-financing agreement drafts NOTHING and says so by name. It writes no depreciation particular of any kind -- #932/#933 own the policy and clara._tf_fa_acquisition_birth reads it. Exact balance, never the rounding tolerance. Every failure is a named refusal in `refusals`; it writes nothing. Ungranted: reached from clara._agreement_posting_verdict.';

reset role;

-- =====================================================================================
-- §J  THE UNATTENDED GATE (AC4) -- clara._agreement_posting_verdict(uuid) returns jsonb.
--
--     "The same unattended gate as the payroll lane applies: both reading channels agreeing,
--     every arithmetic check passing, every account resolving, no already-posted acquisition for
--     this agreement. Anything else goes to Needs you naming what failed." (the brief.) This is
--     that gate, condition for condition, with the two rungs this family has and the payroll lane
--     does not -- WHICH KIND of agreement it is, and WHICH asset account it belongs to.
--
--     THE SHAPE IS 0297 §D's, AND THAT IS DELIBERATE. Three properties are carried over rather
--     than re-invented:
--       (1) A CLOSED RUNG ROSTER, walked in order, EVERY rung carrying an explicit verdict. A
--           rung whose key were missing from the vector would be a gate that fails OPEN, which is
--           the D26 defect the invoice lane found the hard way.
--       (2) THE FIRST FAILING RUNG IS THE REASON. A person is told the condition that stopped the
--           post, not a list -- but the whole vector travels beside it so a reviewer can see
--           everything that was evaluated.
--       (3) THE GATE WRITES NOTHING. It is STABLE: no receipt, no marker, no refusal row. A
--           blocked acquisition is visible because §L DERIVES its Needs-you row from this same
--           body, so the row clears itself the moment the block does.
--
--     ONE BODY, TWO READERS. §K (the post) and §L (the queue) both call this, so the sentence a
--     person reads and the decision the lane acted on cannot drift apart.
--
--     `not_evaluated` IS A VERDICT, AN ABSENT KEY IS A HOLE. §I returns EARLY at two points (a
--     page that is not a financing agreement, and one whose price terms are not established), and
--     the rungs beyond that point were genuinely never run. The plan says how far it got in
--     `stage`, and this body writes `not_evaluated` for everything past it rather than reading a
--     missing refusal as a pass. That is the same fails-open defect from the other direction, and
--     deriving it from the plan's own stage keeps the two bodies from disagreeing about where it
--     stopped.
--
--     WHICH READING IT JUDGES: the NEWEST agreement pair banked for the document
--     (`engine_kind='agreement_text_facts'`, highest `version_n`). A re-extraction mints a new
--     version, and the live reading is the one the lane is asked about.
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._agreement_posting_verdict(p_document uuid)
  returns jsonb language plpgsql stable
  set search_path = clara, pg_temp as $apv$
declare
  -- THE CLOSED ROSTER, in the order a person should be told about a failure. `filed` and
  -- `facts_read` come first because without them the rest is unanswerable; `entry_balances` is a
  -- belt that cannot fail once the arithmetic and the price identity passed, and is evaluated
  -- anyway because a gate that assumes its own invariants is a gate that stops checking them.
  v_rungs text[] := array['filed','facts_read','channels_agree','arithmetic_holds',
                          'agreement_kind_read','financing_agreement','agreement_date_established',
                          'period_open','price_terms_printed','price_identity_holds',
                          'schedule_reconciles','asset_account_resolves','accounts_resolve',
                          'entry_balances','no_duplicate_entry'];
  -- Each rung's token IS the plan refusal reason it reads, where the plan decides it.
  v_tokens jsonb := jsonb_build_object(
    'filed','not_filed', 'facts_read','agreement_not_read',
    'channels_agree','channels_disagree', 'arithmetic_holds','arithmetic_failed',
    'agreement_kind_read','agreement_kind_not_established',
    'financing_agreement','not_a_financing_agreement',
    'agreement_date_established','agreement_date_not_established',
    'period_open','period_closed',
    'price_terms_printed','price_terms_not_established',
    'price_identity_holds','price_identity_failed',
    'schedule_reconciles','schedule_does_not_reconcile',
    'asset_account_resolves','asset_account_unresolved',
    'accounts_resolve','account_missing', 'entry_balances','entry_unbalanced',
    'no_duplicate_entry','duplicate_entry');
  -- The rungs §I answers, in roster order, paired with the STAGE at which each becomes
  -- answerable. A plan that returned at `kind` answers only the first two.
  v_plan_rungs text[] := array['agreement_kind_read','financing_agreement',
                               'agreement_date_established','price_terms_printed',
                               'price_identity_holds','schedule_reconciles',
                               'asset_account_resolves','accounts_resolve','entry_balances'];
  v_plan_stage text[] := array['kind','kind',
                               'price','price',
                               'complete','complete','complete','complete','complete'];
  v_stage_rank jsonb := jsonb_build_object('kind',1,'price',2,'complete',3);
  v_vector jsonb := '{}'::jsonb;
  v_detail jsonb := '{}'::jsonb;
  v_first text; v_rung text;
  f record;
  v_filing uuid; v_client uuid; v_firm uuid; v_sha text;
  v_extraction uuid; v_state jsonb; v_plan jsonb := null; v_stage text;
  v_disagree text[] := '{}'; v_arith text[] := '{}';
  v_contested jsonb; v_unbal jsonb; v_unchk jsonb;
  v_dup_entry uuid; v_dup_scope text;
  v_sentence text; v_label text; v_i int;
begin
  -- 1 · FILED. The entry this lane posts is a DOCUMENT entry bound to the document's live filing,
  --     so a document with no live filing has nothing to bind to.
  select f2.id, f2.client_id, f2.firm_id into v_filing, v_client, v_firm
    from clara.document_filings f2
   where f2.document_id = p_document and f2.retired_at is null
   order by f2.filed_at desc limit 1;
  v_vector := v_vector || jsonb_build_object('filed', case when v_filing is null then 'not_filed' else 'pass' end);

  -- 2 · FACTS READ. The newest agreement pair banked for this document.
  if v_filing is not null then
    select e.id, e.envelope->'contract_state' into v_extraction, v_state
      from clara.document_extractions e
     where e.document_id = p_document and e.engine_kind = 'agreement_text_facts' and e.status = 'done'
     order by e.version_n desc, e.extracted_at desc limit 1;
  end if;
  v_vector := v_vector || jsonb_build_object('facts_read',
    case when v_state is null then 'agreement_not_read' else 'pass' end);

  if v_state is not null then
    -- 3 · CHANNELS AGREE. A question the two readings answer differently, or a quoted schedule
    --     row they read differently -- either one means there is no single reading to post.
    v_contested := coalesce(v_state->'rows'->'contested','[]'::jsonb);
    for f in select k, v from jsonb_each(coalesce(v_state->'facts','{}'::jsonb)) as t(k, v) order by k loop
      if (f.v->>'state') in ('channels_disagree','rows_contested') then
        v_disagree := v_disagree || f.k;
      elsif (f.v->>'state') in ('totals_mismatch','rows_unbalanced','unreadable') then
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

    -- 4 · ARITHMETIC HOLDS. A schedule row whose own principal + interest = instalment identity
    --     fails, a row the evaluator could not check at all, a printed total the column sum
    --     contradicts, or a rendering that is not a figure.
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

    -- 5 · THE DRAFTING BODY ANSWERS THE REST. The kind, the class, the date, the price terms, the
    --     two named checks, the enrolment, the chart and the balance are exactly what §I already
    --     decides, so they are read off its refusals rather than re-decided here -- one body per
    --     question, never two.
    v_plan := clara._agreement_entry_plan(v_client, v_state);
    v_stage := coalesce(v_plan->>'stage','complete');
    for v_i in 1 .. array_length(v_plan_rungs,1) loop
      v_rung := v_plan_rungs[v_i];
      if exists (select 1 from jsonb_array_elements(v_plan->'refusals') x
                  where x->>'reason' = v_tokens->>v_rung) then
        v_vector := v_vector || jsonb_build_object(v_rung, v_tokens->>v_rung);
      elsif (v_stage_rank->>v_plan_stage[v_i])::int > (v_stage_rank->>v_stage)::int then
        -- The plan returned before this question was asked. `not_evaluated` is a verdict.
        v_vector := v_vector || jsonb_build_object(v_rung, 'not_evaluated');
      else
        v_vector := v_vector || jsonb_build_object(v_rung, 'pass');
      end if;
    end loop;
    v_detail := v_detail || jsonb_build_object(
      'missing_accounts', coalesce(v_plan->'missing_accounts','[]'::jsonb),
      'enrolled_accounts', coalesce(
        (select x->'detail'->'accounts' from jsonb_array_elements(v_plan->'refusals') x
          where x->>'reason' = 'asset_account_unresolved' limit 1), '[]'::jsonb),
      'plan_refusals', coalesce(v_plan->'refusals','[]'::jsonb));

    -- 6 · THE PERIOD IS STILL OPEN. `clara._tf_period_wall` refuses an approved touch whose
    --     posting date falls inside a fiscal year in `closing` or `closed`, and it is right to.
    --     The gate asks the SAME question up front rather than letting the wall raise at the
    --     post, for one reason that matters to a person: §L derives the Needs-you row from this
    --     verdict, so a condition the gate did not evaluate would make that row say "ready" about
    --     an acquisition the estate will refuse. A rung that only the wall knows about is a row
    --     that lies.
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

    -- 7 · NO ACQUISITION FOR THIS AGREEMENT IS ALREADY POSTED. THREE SCOPES, in the order a
    --     person would want to hear them, and the FIRST match is reported because it is the most
    --     specific thing that can be said:
    --
    --     same_document  -- this very document already backs a posted entry. The estate's own
    --                       clara._document_posting_entry, asked here so the answer is a NAMED
    --                       refusal rather than the source-binding wall's raise at the write.
    --     same_filing    -- this filing already carries a live draft or approved entry. Somebody
    --                       (or something) got there first; this lane never overwrites another
    --                       writer's work, and the one-open-draft unique index would refuse the
    --                       insert anyway.
    --     same_agreement -- ANOTHER document's acquisition already covers THIS agreement. The
    --                       re-upload case: a second scan of the same contract, or a corrected
    --                       copy filed again. Keyed on the three printed terms that ARE the
    --                       agreement's identity -- the financier, the signing date and the cash
    --                       price -- read off this lane's own `flags->'agreement_acquisition'`
    --                       marker on the ledger itself rather than a side table nobody else
    --                       maintains. Two DIFFERENT agreements with one financier, one signing
    --                       date and one cash price is a coincidence a person adjudicates; one
    --                       agreement posted twice is a defect, and this guard prefers to ask.
    --
    --     A reversed entry is not a duplicate: `reversed_by is null` throughout, so a reversal
    --     re-opens the agreement.
    -- ONLY WHEN THERE IS AN ACQUISITION TO DUPLICATE. A tenancy, or a page whose price terms are
    -- not established, drafts nothing, so "is it already posted" is a question about an entry
    -- that will not be made: `not_evaluated` is the honest verdict, and a `pass` here would be a
    -- gate reporting a check it never ran.
    if v_stage <> 'complete' then
      v_vector := v_vector || jsonb_build_object('no_duplicate_entry','not_evaluated');
    else
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
    if v_dup_entry is null and (v_plan->>'financier') is not null
       and (v_plan->>'posting_date') is not null and (v_plan->>'cash_price_cents') is not null then
      select j.id into v_dup_entry from clara.journal_entries j
       where j.client_id = v_client and j.status = 'approved' and j.reversed_by is null
         and j.document_id is distinct from p_document
         and j.flags->'agreement_acquisition'->>'financier' = v_plan->>'financier'
         and j.flags->'agreement_acquisition'->>'agreement_date' = v_plan->>'posting_date'
         and j.flags->'agreement_acquisition'->>'cash_price_cents' = v_plan->>'cash_price_cents'
       order by j.created_at limit 1;
      if v_dup_entry is not null then v_dup_scope := 'same_agreement'; end if;
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
    end if;
  else
    -- Nothing was read, so nothing downstream of it was evaluated. Every rung still carries an
    -- explicit verdict: `not_evaluated` is a verdict, an absent key is a hole.
    foreach v_rung in array array['channels_agree','arithmetic_holds','agreement_kind_read',
                                  'financing_agreement','agreement_date_established','period_open',
                                  'price_terms_printed','price_identity_holds','schedule_reconciles',
                                  'asset_account_resolves','accounts_resolve','entry_balances',
                                  'no_duplicate_entry'] loop
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

  -- THE SENTENCE A PERSON READS, BUILT HERE AND NOWHERE ELSE. §L's Needs-you row renders it
  -- verbatim, so the words on screen and the decision the lane took come out of ONE body.
  v_label := case when v_plan->>'posting_date' is not null
                  then coalesce(nullif(v_plan->>'financier',''), 'this agreement')
                       || ' dated ' || to_char((v_plan->>'posting_date')::date, 'FMDD FMMonth YYYY')
                  else 'This agreement' end;
  v_sentence := case coalesce(v_first, 'ready')
    when 'ready' then
      format('The acquisition under %s is ready to post but no entry exists yet -- re-file the agreement to post it.', v_label)
    when 'filed' then 'This agreement is not filed under a client, so it has nothing to post against.'
    when 'facts_read' then 'This agreement has not been read yet.'
    when 'channels_agree' then
      format('%s was not posted: the two readings of this agreement disagree (%s). Check the page and re-file it.',
        v_label, coalesce(nullif(array_to_string(v_disagree, ', '), ''), 'a quoted instalment row'))
    when 'arithmetic_holds' then
      format('%s was not posted: the page does not add up (%s). Nothing is posted from a page that contradicts itself.',
        v_label,
        concat_ws('; ',
          nullif(array_to_string(v_arith, ', '), ''),
          case when jsonb_array_length(coalesce(v_unbal,'[]'::jsonb)) > 0
               then 'instalments that do not balance: ' || replace(trim(both '[]' from v_unbal::text), ',', ', ') end,
          case when jsonb_array_length(coalesce(v_unchk,'[]'::jsonb)) > 0
               then 'instalments that could not be checked: ' || replace(trim(both '[]' from v_unchk::text), ',', ', ') end))
    when 'agreement_kind_read' then
      'An agreement was read but the page does not say, readably, what kind of agreement it is, so nothing was posted. Tell Clara whether this is a hire purchase, a finance lease or something else.'
    when 'financing_agreement' then
      format('This is a %s, which creates no asset and no liability on the day it is signed, so there is nothing to post. Its terms have been read and are on the document.',
        replace(coalesce(v_plan->>'agreement_class','agreement'), '_', ' '))
    when 'agreement_date_established' then
      format('An agreement was read but the day it was signed could not be established from what the page prints (%s), so nothing was posted. Tell Clara the signing date, or re-file a copy that prints it unambiguously.',
        coalesce(quote_literal(v_plan->>'agreement_date_raw'), 'the page prints no date'))
    when 'period_open' then
      format('%s was not posted: the fiscal year covering %s is %s.',
        v_label, v_plan->>'posting_date',
        coalesce(v_detail->'closed_fiscal_year'->>'status', 'not open'))
    when 'price_terms_printed' then
      'An agreement was read but the cash price and the amount financed are not both established from what the page prints, so nothing was posted. Check the page and re-file it.'
    when 'price_identity_holds' then
      format('%s was not posted: the deposit and the amount financed do not add up to the cash price (%s). Nothing is posted from a page that contradicts itself.',
        v_label, coalesce(v_detail->'plan_refusals'->0->'detail'->>'reason', 'the figures differ'))
    when 'schedule_reconciles' then
      format('%s was not posted: the printed repayment schedule does not reconcile to the amount financed plus the charges. Check the page and re-file it.', v_label)
    when 'asset_account_resolves' then
      format('%s was not posted: Clara cannot tell which fixed-asset account this belongs to (%s enrolled). The page describes what was acquired in words, and a description is not an account -- enrol the account, or tell Clara which one to use.',
        v_label,
        coalesce((select x->'detail'->>'enrolments' from jsonb_array_elements(coalesce(v_plan->'refusals','[]'::jsonb)) x
                   where x->>'reason' = 'asset_account_unresolved' limit 1), 'no account'))
    when 'accounts_resolve' then
      format('%s was not posted: this client''s chart of accounts has no %s. Add the account(s) and re-file the agreement.',
        v_label,
        coalesce(nullif(replace(trim(both '[]' from coalesce(v_plan->'missing_accounts','[]'::jsonb)::text), '"', ''), ''), 'account it needs'))
    when 'entry_balances' then
      format('%s was not posted: the entry it would make does not balance (%s debit, %s credit).',
        v_label, v_plan->>'debit_cents', v_plan->>'credit_cents')
    when 'no_duplicate_entry' then
      format('%s is already posted (%s, %s). This copy was not posted again -- open that entry to decide whether this is a correction or a re-upload.',
        v_label,
        coalesce(v_detail->'duplicate'->>'memo', 'an existing entry'),
        coalesce(v_detail->'duplicate'->>'posting_date', 'no date'))
    else format('%s was not posted (%s).', v_label, coalesce(v_tokens->>v_first, v_first))
  end;

  return jsonb_build_object(
    'sentence', v_sentence,
    'agreement_label', to_jsonb(v_label),
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
    'existing_entry_id', to_jsonb(v_dup_entry),
    'agreement_class', coalesce(v_plan->'agreement_class','null'::jsonb),
    'posting_date', coalesce(v_plan->'posting_date','null'::jsonb),
    'plan', coalesce(v_plan,'null'::jsonb));
end $apv$;

revoke all on function clara._agreement_posting_verdict(uuid) from public;

comment on function clara._agreement_posting_verdict(uuid) is
  '#948: THE UNATTENDED GATE for an agreement contract -- the closed rung roster the brief names, walked in order, every rung carrying an explicit verdict and the FIRST failure being the reason a person is told. It is 0297 §D''s shape condition for condition, plus the two rungs this family has and the payroll lane does not: WHICH KIND of agreement the page says it is, and WHICH fixed-asset account the client enrolled. It WRITES NOTHING (STABLE): clara._post_agreement_acquisition acts on it and clara.list_review_queue DERIVES its agreement_posting_blocked row from it, so the decision the lane took and the sentence a person reads are the same body and cannot drift. Judges the NEWEST agreement pair banked for the document. Ungranted: reached from those two callers alone.';

reset role;

-- =====================================================================================
-- §K  THE RECEIPT SAYS WHICH LANE POSTED -- clara.entry_post_receipts.via_wake_kind gains
--     `contract_facts`.
--
--     `clara._tf_assert_agent_post_receipt` requires EXACTLY ONE receipt for every agent-approved
--     entry, in either clara.entry_post_receipts (the document lane) or clara.operation_receipts
--     (the accounting-operation lane). An acquisition is a DOCUMENT post, so it writes the
--     document-shaped one -- and that table's `via_wake_kind` vocabulary was closed to the kinds
--     that could reach it before this lane existed.
--
--     WIDENED RATHER THAN BORROWED, for 0297 §E's own recorded reason: writing `autodraft` on an
--     agreement receipt would be the cheaper edit and it would be a lie -- no autodraft wake
--     credential exists for this post, no model was woken, and an auditor reading receipts by lane
--     would find acquisitions filed under the invoice lane's name. The column keeps its name
--     because the table's reader contract does; `contract_facts` is the lane name the task, the
--     event twin and the capability registry already use.
--
--     REDO-SAFE: drop-if-exists then add, the estate's constraint-swap idiom. `payroll_facts`
--     (0297) is carried forward verbatim -- this is a WIDENING of the live clause, never a
--     re-typing of an older one.
-- =====================================================================================
alter table clara.entry_post_receipts
  drop constraint if exists entry_post_receipts_via_wake_kind_check;
alter table clara.entry_post_receipts
  add constraint entry_post_receipts_via_wake_kind_check
  check (via_wake_kind = any (array['autodraft'::text, 'interactive'::text, 'bank_agent'::text,
                                    'payroll_facts'::text, 'contract_facts'::text]));

-- =====================================================================================
-- §L  THE POST -- clara._post_agreement_acquisition(uuid) returns jsonb.
--
--     Asks §J, and acts. Ready: one draft entry, its legs, the approval, the receipt, the event.
--     Blocked: NOTHING AT ALL is written, and the verdict comes back so the caller can record it
--     in its own settle receipt. There is no third outcome.
--
--     WHY IT RETURNS INSTEAD OF RAISING (0297 §F's reason, unchanged). This body runs INSIDE the
--     agreement worker's own persist transaction (§M). A raise would abort the READ as well as the
--     post -- the worker would retry, read again, and be refused again, and the facts a person
--     needs in order to clear the block would never land.
--
--     THE ENTRY IS A DOCUMENT ENTRY, BOUND TO THE FILING. `origin='document'`, with
--     `document_id`, `source_doc_sha256` and `filing_id` all set, which is what makes the filing's
--     `uncoded_filing` row disappear the moment this entry exists and come back if it is reversed.
--
--     AND THAT BINDING IS WHAT BIRTHS THE FIXED ASSET. Nothing below calls anything
--     fixed-asset-specific. `clara._tf_fa_acquisition_birth` (0216) is a deferred constraint
--     trigger on clara.journal_entries: it fires when this entry reaches `approved`, sees a line
--     debiting an account this client ENROLLED in clara.fa_account_profiles, and inserts the
--     clara.fixed_assets row itself -- reading the account's own accumulated-depreciation and
--     expense codes and its live depreciation policy (#932) for the particulars. AC4's "the
--     depreciation particulars come from the enrolled account's policy and are never invented" is
--     therefore true of this file structurally: it writes no depreciation column anywhere.
--
--     THE ACTOR IS THE ESTATE'S OWN AGENT IDENTITY (clara.agent_user_id()), as maker and as
--     checker. clara.journal_entries.maker_actor is NOT NULL and references a real user, so an
--     unattended post has to name someone; naming the agent identity is what makes
--     clara._tf_assert_agent_post_receipt fire (it resolves users.is_agent) and therefore what
--     makes the receipt STRUCTURAL rather than a convention. `last_human_editor` stays NULL
--     because no human touched it.
--
--     THE MARKER `flags->'agreement_acquisition'` IS WRITTEN AT THE DRAFT INSERT AND NOWHERE ELSE,
--     because clara._tf_entry_immutable's draft->approved allowset does not include `flags`. It
--     carries the agreement's own identity -- the financier, the signing date and the cash price --
--     so the duplicate guard can ask "is this agreement already posted" of the ledger itself
--     rather than of a side table nobody else maintains. Same footing as 0297's `payroll_run` and
--     0194's `payroll_obligation` markers.
--
--     TIER C -- CONVERSION ON NAMED PAIRS ONLY, copied from the invoice and payroll lanes. The
--     gate is meant to have answered everything, and these are the estate walls that could still
--     speak: the one-open-draft-per-filing unique, the source-binding wall, and the closed-period
--     wall (which §J's `period_open` rung already asks about, so that arm is the race, not the
--     case). An unlisted error PROPAGATES: an acquisition post must never turn an unknown defect
--     into a quiet "not posted".
--
--     REDO-SAFE: `create or replace function`.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._post_agreement_acquisition(p_document uuid)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $paa$
declare
  v jsonb; v_entry uuid; v_receipt uuid; v_lines jsonb; v_flags jsonb; v_memo text;
  v_client uuid; v_firm uuid; v_filing uuid; v_sha text; v_posting date;
  v_extraction uuid; v_engine text; v_code text; v_detail text; v_reason text; v_pair boolean;
  v_class text; v_label text;
begin
  v := clara._agreement_posting_verdict(p_document);
  if v->>'verdict' <> 'ready' then
    return jsonb_build_object('posted', false, 'entry_id', null,
      'reason', v->'reason', 'rung', v->'rung', 'rung_vector', v->'rung_vector');
  end if;

  v_client := (v->>'client_id')::uuid;
  v_firm := (v->>'firm_id')::uuid;
  v_filing := (v->>'filing_id')::uuid;
  v_sha := v->>'source_doc_sha256';
  v_extraction := (v->>'extraction_id')::uuid;
  v_posting := (v->>'posting_date')::date;
  v_class := v->>'agreement_class';
  select t.engine_id into v_engine from clara.document_processing_tasks t
   where t.document_id = p_document and t.lane = 'contract_facts' and t.status = 'done'
   order by t.version_n desc limit 1;

  -- THE LEGS, in the plan's own order, in the estate's own line shape.
  select jsonb_agg(jsonb_build_object(
           'account_code', l->>'account_code',
           'debit_cents',  case when l->>'side' = 'debit'  then (l->>'cents')::bigint else 0 end,
           'credit_cents', case when l->>'side' = 'credit' then (l->>'cents')::bigint else 0 end,
           'description',  l->>'description') order by ord)
    into v_lines
    from jsonb_array_elements(v->'plan'->'legs') with ordinality as t(l, ord);
  -- The estate's own canonicaliser: it re-checks that every code resolves to an ACTIVE account of
  -- this client and that the entry balances. Its rounding arm cannot fire here -- §I already
  -- refused anything that did not balance to the cent -- and that is the point of asking it: two
  -- independent bodies now agree the entry is postable before a row is written.
  v_lines := clara._validate_entry_lines(v_client, v_lines);

  v_label := case when v_class = 'finance_lease' then 'Finance lease' else 'Hire purchase' end;
  v_memo := v_label || ' acquisition'
    || coalesce(' -- ' || left(nullif(v->'plan'->>'asset_description',''), 120), '')
    || coalesce(' (' || nullif(v->'plan'->>'financier','') || ')', '');
  v_flags := jsonb_build_object('agreement_acquisition', jsonb_build_object(
    'agreement_class', v_class,
    'agreement_date', to_char(v_posting, 'YYYY-MM-DD'),
    'financier', v->'plan'->>'financier',
    'cash_price_cents', v->'plan'->>'cash_price_cents',
    'document_id', p_document,
    'extraction_id', v_extraction,
    'plan_version', coalesce(v->'plan'->>'plan_version','v1')));

  begin
    insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
        document_id, source_doc_sha256, filing_id, maker_actor, last_human_editor, flags)
      values (v_client, 'draft', v_posting, v_memo, 'document',
        p_document, v_sha, v_filing, clara.agent_user_id(), null, v_flags)
      returning id into v_entry;

    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
        description)
      select v_entry, x.idx, x.elem->>'account_code',
        (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
        x.elem->>'description'
      from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
    perform clara._assert_balanced(v_entry);

    update clara.journal_entries
       set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
           updated_at = now()
     where id = v_entry;

    -- THE RECEIPT. `model_snapshot` names the DETERMINISTIC producer, not a model, because no
    -- model took part in this post: §D's frozen evaluator did every sum and the classification at
    -- read time and §I resolved every account from the chart. `gate_verdicts` carries the
    -- reading's own extraction and the engine id of the call that produced it, so the model that
    -- READ the page is still reachable from the receipt.
    insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
        on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
        maker_active_at_approval, op_key)
      values (gen_random_uuid(), v_firm, v_client, v_entry, clara.agent_user_id(),
        null, 'contract_facts',
        jsonb_build_object('provider','clara_db','model','agreement_entry_plan','version','v1'),
        v_label || ' acquisition posted unattended from an agreement whose two readings agreed, whose printed figures held, and whose accounts all resolved in this client''s chart.',
        jsonb_build_object('extraction_id', v_extraction, 'engine_id', v_engine,
          'rung_vector', v->'rung_vector', 'plan', v->'plan'),
        'agreement_unattended',
        -- NULL rather than false-by-inference: this lane has no on_behalf_of, so there is no maker
        -- whose membership could be active or lapsed (the invoice lane's own law 68).
        null, 'agreement-post:' || p_document::text)
      returning id into v_receipt;

    perform clara._append_event(v_firm, 'entry.posted', v_client, clara.agent_user_id(), null,
      null, v_entry, p_document, null,
      jsonb_build_object('post_receipt_id', v_receipt, 'approval_arm', 'agreement_unattended',
        'agreement_class', v_class, 'agreement_date', to_char(v_posting,'YYYY-MM-DD'),
        'rung_vector', v->'rung_vector'));

    perform clara._audit(v_firm, null, null, null, 'post_agreement_acquisition', null,
      jsonb_build_object('document', p_document, 'entry', v_entry, 'receipt', v_receipt,
        'agreement_class', v_class, 'agreement_date', to_char(v_posting,'YYYY-MM-DD'),
        'debit_cents', v->'plan'->'debit_cents'));

    return jsonb_build_object('posted', true, 'entry_id', v_entry, 'post_receipt_id', v_receipt,
      'posting_date', to_char(v_posting,'YYYY-MM-DD'),
      'agreement_class', v_class,
      'reason', null, 'rung', null, 'rung_vector', v->'rung_vector');

  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_detail = pg_exception_detail;
    begin
      v_reason := nullif(v_detail,'')::jsonb->>'reason';
    exception when others then
      v_reason := null;
    end;
    if v_code = '23505' then
      -- uq_journal_entries_one_open_draft_filing: somebody else's open draft is already on this
      -- filing. A person decides which of the two is the acquisition; this lane never overwrites.
      v_pair := true; v_reason := 'filing_already_drafted';
    elsif v_code = 'CLR19' then
      -- The closed-period wall. §J's `period_open` rung asks the same question first, so reaching
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
end $paa$;

revoke all on function clara._post_agreement_acquisition(uuid) from public;

comment on function clara._post_agreement_acquisition(uuid) is
  '#948: the UNATTENDED post for a hire-purchase or finance-lease agreement. Asks clara._agreement_posting_verdict and acts: ready means one document-bound, filing-bound approved entry with its legs, its clara.entry_post_receipts row (via_wake_kind `contract_facts`, approval_arm `agreement_unattended`) and an entry.posted event; blocked means NOTHING is written and the verdict is returned so the caller can record it. It calls nothing fixed-asset-specific -- the entry debits the account the client ENROLLED, and clara._tf_fa_acquisition_birth (0216) makes the register row itself from the account''s own policy. It RETURNS rather than raises, because it runs inside the agreement read''s own transaction and a raise would lose the facts a person needs in order to clear the block. Ungranted: reached from clara.persist_agreement_facts alone.';

reset role;

-- =====================================================================================
-- §M  THE LANE POSTS WHAT IT READS -- clara.persist_agreement_facts calls the post (AC4).
--
--     SPLICED, NEVER RE-TYPED (the 0017:1553 / 0093 / 0260 / 0297 idiom). This reads the INSTALLED
--     definition off the catalog, asserts each anchor occurs EXACTLY ONCE, replaces only at those
--     anchors and executes the result. Everything §F wrote that this section does not name is
--     preserved BY CONSTRUCTION rather than by a careful human copy, and the postcheck re-reads
--     the committed catalog to prove the untouched regions survived.
--
--     WHY HERE AND NOT IN A RUNTIME STEP. The agreement questionnaire family is a FROZEN workflow
--     family and the work order forbids editing a frozen body. A new posting step would need a new
--     family, a new task lane and a reconciler arm -- for an act with no model in it. The persist
--     door is already the ONE writer of agreement facts and already runs at exactly the moment the
--     state it posts from comes into existence, so the post belongs in the same transaction: an
--     acquisition is never read-but-unposted for a window nobody can see.
--
--     WHAT THE CALLER GETS. The settle receipt gains a `posting` object -- `posted`, the
--     `entry_id`, and on a refusal the `reason`, the `rung` and the whole vector -- so the worker
--     (and a person reading the task) can see what the read led to without a second query.
--
--     REPLAY IS UNAFFECTED. The idempotent-replay arm returns before this point, so re-settling a
--     done task neither re-posts nor re-refuses: the entry that exists is the one this call made.
-- =====================================================================================
do $w948_persist$
declare
  v_sig text := 'clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)';
  v_def text; v_next text; v_anchor text; v_repl text;
  v_n int; v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;

  if position('_post_agreement_acquisition' in v_def) > 0 then
    raise notice '#948 §M: clara.persist_agreement_facts already calls the post -- splice already applied, nothing to do (redo)';
  else
    -- SPLICE (1): the declaration this splice needs.
    --
    -- EVERY anchor and replacement below is ONE dollar-quoted literal, never a `||` chain with
    -- chr(10): apps/web/test/sqlFunctionCensus.ts proves what a migration's dynamic `execute`
    -- installs by RECONSTRUCTING the statement from its parts, and it cannot evaluate chr()
    -- (0297 §G's own measured note).
    v_anchor := $q948a$  v_cited_id uuid; v_cited_locator jsonb; v_locator jsonb;$q948a$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §M splice (1): the declare anchor appears % time(s), expected 1', v_n
        using errcode = 'CLR10';
    end if;
    v_repl := $q948b$  v_cited_id uuid; v_cited_locator jsonb; v_locator jsonb;
  v_posting jsonb;   -- #948: what the post made of this read$q948b$;
    v_next := replace(v_def, v_anchor, v_repl);

    -- SPLICE (2): the post, and the settle receipt that reports it.
    v_anchor := $q948c$  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
    'engine_id',t.engine_id,'version_n',t.version_n,
    'text_extraction_id',v_text_id,'vision_extraction_id',v_vision_id,
    'status','done','replayed',false);$q948c$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#948 §M splice (2): the final-return anchor appears % time(s), expected 1', v_n
        using errcode = 'CLR10';
    end if;
    v_repl := $q948d$  -- 12. #948 · THE POST. The facts are banked and the state is judged, so a financing
  --     agreement posts its acquisition here -- inside this transaction, under its own gate,
  --     with no human and no model in the loop. A blocked or non-financing agreement writes
  --     NOTHING and reports why; the derived Needs-you row (clara.list_review_queue,
  --     row_kind=agreement_posting_blocked) is what puts that reason in front of a person, and
  --     it clears itself when the block does.
  v_posting := clara._post_agreement_acquisition(t.document_id);

  return jsonb_build_object('task_id',p_task,'document_id',t.document_id,
    'engine_id',t.engine_id,'version_n',t.version_n,
    'text_extraction_id',v_text_id,'vision_extraction_id',v_vision_id,
    'status','done','replayed',false,'posting',v_posting);$q948d$;
    v_next := replace(v_next, v_anchor, v_repl);

    if v_next = v_def then
      raise exception '#948 §M splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;
    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#948 §M postcheck: persist_agreement_facts changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#948 §M postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode = 'CLR10';
    end if;
    raise notice '#948 §M: clara.persist_agreement_facts spliced -- the agreement lane now posts what it reads. owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;

  -- BOTH BRANCHES: the §F regions this section must not have disturbed are re-read from the
  -- COMMITTED catalog, so a redo proves them too.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('clara.evaluate_agreement_contract_state_v1(v_text_env, v_vision_env)' in v_def) = 0
     or position('''contract'', jsonb_build_object(''channel'',''text''' in v_def) = 0
     or position('document.agreement_facts_completed' in v_def) = 0
     or position('_post_agreement_acquisition' in v_def) = 0 then
    raise exception '#948 §M postcheck: the recut body lost one of §F''s own regions (the evaluator call, the text-channel store, or the completed event) or did not gain the post'
      using errcode = 'CLR10';
  end if;
end
$w948_persist$;

-- =====================================================================================
-- §N  NEEDS YOU -- clara.list_review_queue gains row_kind='agreement_posting_blocked' (AC4).
--
--     "Anything else goes to Needs you naming what failed" (the brief). This is that appearance.
--
--     THE ROW IS DERIVED, STORES NOTHING AND CLEARS ITSELF. There is no refusal table, no attempt
--     record and no dismissal act: the CTE asks §J the same question the poster asked, about the
--     estate as it is NOW. Add the missing account and the sentence changes on the next read; post
--     the acquisition and the row is gone; retire the filing and it is gone. This is the
--     Settlement candidate row's own discipline (CONTEXT.md), applied to a posting block --
--     derived, stores nothing, clears itself, offers the reason and never chooses.
--
--     WHICH AGREEMENTS IT SHOWS: an agreement contract that is FILED, has been READ (an agreement
--     pair is banked for it) and whose filing carries NO live entry. Read off the ledger, that is
--     exactly "was read, and did not post" -- which is why a posted acquisition has no row (its
--     filing has an entry), a blocked one does, and one whose block was cleared but which nobody
--     re-filed STILL does, saying it is ready. A rung only the poster knew about would leave that
--     last state invisible, which is why §J carries the sentence rather than the queue building
--     one.
--
--     A TENANCY GETS A ROW TOO, AND THAT IS THE POINT OF AC5. It was read; it will never post; a
--     person reading the queue is told what the page IS ("This is a tenancy, which creates no
--     asset ... its terms have been read and are on the document") rather than left to wonder why
--     a filed agreement produced nothing. #949's contract-terms record is what that reading
--     becomes; this row is how a person learns it exists.
--
--     THE ROW COEXISTS WITH `uncoded_filing`, which is the same model #946 recorded: before an
--     entry exists the filing IS uncoded, and this row sits beside it saying WHY. Narrowing
--     `filing_rows` to hide it would change what an existing kind means for every firm already
--     reading that queue.
--
--     SECTION `needs_you`, LANE `needs_you`, like open_question / work_question /
--     payroll_posting_blocked. NO new counts.* key is minted -- the `lane='needs_you'` filter folds
--     it into counts.needs_you already.
--
--     `id` IS THE FILING'S id, and `entry_id` names the entry a DUPLICATE refusal points at, so a
--     person can open it from the row. Both ride columns the shared vector already has; this
--     splice adds NO json key and therefore no row-builder gate (the #629 shape).
--
--     SPLICED, NEVER RE-TYPED, and additive: the postcheck re-reads the committed body and asserts
--     every pre-existing row kind survives at its exact pre-splice marker count.
-- =====================================================================================
do $w948_lrq$
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

  if position('agreement_posting_blocked' in v_code) <> 0 then
    raise notice '#948 §N: the queue already projects agreement_posting_blocked -- splice already applied, nothing to do (redo)';
  else
    -- The shared column vector's own trailing column, counted BEFORE so the postcheck can assert
    -- this file added exactly one more occurrence rather than a remembered number.
    v_pre_cols := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                  / length('null::int open_proposal_count');

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
      '  ), keyed as (';
    v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
    v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 or v_raw_n <> v_n then
      raise exception '#948 §N prestate: the all_rows union block appears % time(s) IN CODE / % in RAW text (expected 1/1) -- re-derive this splice against the LIVE body', v_n, v_raw_n
        using errcode = 'CLR10';
    end if;

    v_repl := $agree$  ), agreement_rows as (
    -- #948 (0299): AN AGREEMENT CONTRACT THAT WAS READ AND DID NOT POST. DERIVED, stores
    -- nothing, clears itself: clara._agreement_posting_verdict is asked about the estate as it
    -- is NOW, and the sentence shown is that body's own, so the words a person reads and the
    -- decision the lane took can never drift apart. A NON-FINANCING agreement gets a row too --
    -- it was read, it will never post, and a person is told what the page IS rather than left to
    -- wonder why a filed agreement produced nothing. Section `needs_you`, lane `needs_you`.
    -- `id` is the filing's id; `entry_id` names the entry a duplicate refusal points at. The
    -- active-client guard mirrors the other kinds (0017 R1-F5).
    select 1 section_rank,'agreement_posting_blocked'::text row_kind,'needs_you'::text section,
      af.client_id,null::uuid counterparty_id,af.id filing_id,
      nullif(av.v->>'existing_entry_id','')::uuid entry_id,
      null::uuid question_id,null::uuid task_id,af.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,af.filed_at aged_since,
      nullif(av.v->'plan'->>'debit_cents','')::bigint amount_cents,
      nullif(av.v->'plan'->>'posting_date','') period,
      av.v->>'sentence' question_text,
      af.filed_at created_at,af.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.document_filings af
    join clara.clients active_agreement_client on active_agreement_client.id=af.client_id and active_agreement_client.status='active'
    join clara.documents ad on ad.id=af.document_id and ad.document_kind='agreement_contract'
    cross join lateral (select clara._agreement_posting_verdict(af.document_id) v) av
    where af.firm_id=c.firm and af.retired_at is null
      and (v_client is null or af.client_id=v_client)
      and exists(select 1 from clara.document_extractions ae
                  where ae.document_id=af.document_id and ae.engine_kind='agreement_text_facts'
                    and ae.status='done')
      and not exists(select 1 from clara.journal_entries aj where aj.filing_id=af.id
        and (aj.status='draft' or (aj.status='approved' and aj.reversed_by is null)))
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
  ), keyed as ($agree$;
    v_next := replace(v_def, v_anchor, v_repl);
    if position('union all select * from agreement_rows' in v_next) = 0 then
      raise exception '#948 §N splice: the all_rows anchor did not rewrite' using errcode = 'CLR10';
    end if;
    if v_next = v_def then
      raise exception '#948 §N splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;

    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#948 §N postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#948 §N postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode = 'CLR10';
    end if;

    v_code := regexp_replace(regexp_replace(
      (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
      '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_post_cols := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                   / length('null::int open_proposal_count');
    if v_post_cols <> v_pre_cols + 1 then
      raise exception '#948 §N postcheck: the shared column vector appears % time(s), expected % (one more than before the splice)', v_post_cols, v_pre_cols + 1
        using errcode = 'CLR10';
    end if;
    raise notice '#948 §N: clara.list_review_queue spliced -- one agreement_rows CTE (needs_you/needs_you, active-client-guarded, derived from clara._agreement_posting_verdict) and one union arm; owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;

  -- BOTH BRANCHES: every pre-existing row kind survives at EXACTLY one projection site, and the
  -- new one is present exactly once. Re-read from the COMMITTED catalog so a redo proves it too.
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
      ('_is_codeable_kind', 1),
      ('_autodraft_attempt_budget', 1),
      ('_payroll_posting_verdict', 1),
      ('_payroll_net_pay_unsettled', 1),
      ('_agreement_posting_verdict', 1)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#948 §N postcheck: marker "%" appears % time(s), expected % -- the splice was not additive', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
end
$w948_lrq$;

-- =====================================================================================
-- §Z  TAIL. Everything this file claims to have done, re-derived from the live catalog.
--
--     TWO NEW GRANTED OBJECTS, SO ONE rig-meta COHORT. clara.persist_agreement_facts and
--     clara.fail_agreement_facts are clara_runtime doors and sit in AGREEMENT_0299_COHORT
--     (packages/db/tests/rig-meta.mjs) together with their names in ALLOWED[clara_runtime].
--     Every OTHER body this file adds is an INTERNAL, reached from bodies that are already
--     granted: the persist door calls the poster, and clara.list_review_queue
--     (clara_authenticated, viewer-floored) calls the verdict. The T17 sweep's
--     "expected = false" over those names IS the assertion for them, and the grant check below
--     is the second belt. #948 adds NO human door: the decision is machine-made, the terms a
--     person reads come back through the ordinary document read, and the only new surface is the
--     Needs-you row.
-- =====================================================================================
do $w948_tail$
declare
  v_def text; v_code text; v_n int; v_sha text; v_state jsonb; v_plan jsonb; r record;
  v_env jsonb; v_text jsonb; v_vision jsonb;
begin
  -- 1 · THE GRAMMAR REGISTERS `contract` AND STILL REFUSES EVERYTHING OUTSIDE ITS ROSTER, driven
  --     through the CHECK's own boolean sibling rather than asserted from the body text.
  if clara._field_path_conforms('contract.agreement.cash_price') is not true
     or clara._field_path_conforms('contract.schedule.instalment') is not true then
    raise exception '#948 tail: a contract field path does not conform -- the namespace did not land'
      using errcode = 'CLR10';
  end if;
  begin
    perform clara._field_path_conforms('contrakt.agreement.cash_price');
    raise exception '#948 tail: a typo''d namespace was ADMITTED -- the roster is no longer closed'
      using errcode = 'CLR10';
  exception when sqlstate 'CLR10' then
    null;   -- the grammar's own refusal, which is the behaviour asserted here
  end;
  -- The neighbour namespaces are untouched: this file widened the roster by ONE.
  for r in select * from (values ('invoice.total'),('payroll.run.gross_pay'),('statement.period_start')) as t(p) loop
    if clara._field_path_conforms(r.p) is not true then
      raise exception '#948 tail: % stopped conforming -- the recut roster dropped a neighbour', r.p
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 2 · THE SIBLING THE CHECK EVALUATES IS BYTE-UNTOUCHED. 0299 recuts the grammar, not the wall.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._field_path_conforms(text)'::regprocedure;
  if v_sha is distinct from 'a97a4709117e698267fe900332cc666c818a241214894520ad773791b761cca3' then
    raise exception '#948 tail: clara._field_path_conforms MOVED during this migration (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- 3 · EVERY NEW BODY EXISTS, IS OWNED BY clara_fn_owner AND PINS ITS search_path; the internals
  --     are EXECUTE-reachable by NO application role, and the two doors by clara_runtime alone.
  for r in select * from (values
      ('clara._agreement_answers_ok(jsonb,text)', false),
      ('clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)', false),
      ('clara._agreement_signed_date(text)', false),
      ('clara._agreement_entry_plan(uuid,jsonb)', false),
      ('clara._agreement_posting_verdict(uuid)', false),
      ('clara._post_agreement_acquisition(uuid)', false),
      ('clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)', true),
      ('clara.fail_agreement_facts(uuid,text)', true)
      ) as t(sig, runtime_door) loop
    if to_regprocedure(r.sig) is null then
      raise exception '#948 tail: % is absent', r.sig using errcode = 'CLR10';
    end if;
    if (select p.proowner::regrole::text from pg_proc p where p.oid = r.sig::regprocedure)
       is distinct from 'clara_fn_owner' then
      raise exception '#948 tail: % is not owned by clara_fn_owner', r.sig using errcode = 'CLR10';
    end if;
    if (select coalesce(array_to_string(p.proconfig, ','), '') from pg_proc p
         where p.oid = r.sig::regprocedure) not like '%search_path=%' then
      raise exception '#948 tail: % does not pin its search_path', r.sig using errcode = 'CLR10';
    end if;
    -- NOT a proacl-is-null test: `revoke all ... from public` leaves the owner's own entry
    -- behind, so a non-null ACL here is the NORMAL shape of an ungranted body. What matters is
    -- that PUBLIC cannot execute it, and that the two doors are reachable by clara_runtime while
    -- the internals are reachable by no application role at all.
    if exists (select 1 from aclexplode((select p.proacl from pg_proc p where p.oid = r.sig::regprocedure)) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception '#948 tail: % is EXECUTE-reachable by PUBLIC', r.sig using errcode = 'CLR10';
    end if;
    if r.runtime_door then
      if not pg_catalog.has_function_privilege('clara_runtime', r.sig, 'EXECUTE') then
        raise exception '#948 tail: % is not reachable by clara_runtime -- the worker cannot settle', r.sig
          using errcode = 'CLR10';
      end if;
      if pg_catalog.has_function_privilege('clara_authenticated', r.sig, 'EXECUTE') then
        raise exception '#948 tail: % is reachable by clara_authenticated -- #948 mints no human door', r.sig
          using errcode = 'CLR10';
      end if;
    else
      for v_code in select unnest(array['clara_authenticated','clara_agent_ro','clara_runtime']) loop
        if pg_catalog.has_function_privilege(v_code, r.sig, 'EXECUTE') then
          raise exception '#948 tail: % is EXECUTE-reachable by % -- it is an internal', r.sig, v_code
            using errcode = 'CLR10';
        end if;
      end loop;
    end if;
  end loop;

  -- 4 · THE VOCABULARY GATE IS CLOSED, DRIVEN rather than asserted: a complete envelope is
  --     admitted, the same envelope missing one answer is refused, and one carrying an extra key
  --     is refused.
  v_env := jsonb_build_object('contract', jsonb_build_object(
    'channel','text',
    'answers', (select jsonb_object_agg(f, jsonb_build_object('state','value','raw','1.00'))
                  from unnest(array['contract.agreement.kind','contract.agreement.financier',
                    'contract.agreement.agreement_date','contract.agreement.asset_description',
                    'contract.agreement.cash_price','contract.agreement.deposit',
                    'contract.agreement.amount_financed','contract.agreement.total_charges',
                    'contract.agreement.total_payable','contract.agreement.term_months',
                    'contract.agreement.instalment_amount']) f),
    'rows','[]'::jsonb));
  if not clara._agreement_answers_ok(v_env,'text') then
    raise exception '#948 tail: a complete agreement envelope was REFUSED by its own vocabulary gate'
      using errcode = 'CLR10';
  end if;
  if clara._agreement_answers_ok(
       jsonb_set(v_env, '{contract,answers}', (v_env->'contract'->'answers') - 'contract.agreement.total_payable'),
       'text') then
    raise exception '#948 tail: an envelope missing contract.agreement.total_payable was ADMITTED -- every question must be answered'
      using errcode = 'CLR10';
  end if;
  if clara._agreement_answers_ok(
       jsonb_set(v_env, '{contract,answers,contract.agreement.residual_value}',
                 jsonb_build_object('state','value','raw','1.00')),
       'text') then
    raise exception '#948 tail: an envelope carrying an UNKNOWN question was ADMITTED -- the vocabulary is not closed'
      using errcode = 'CLR10';
  end if;

  -- 5 · THE EVALUATOR IS REGISTERED AND FROZEN AT ONE MEMBER, and the freeze verifies.
  if not exists (select 1 from clara.evaluator_versions v
                  where v.evaluator_name = 'evaluate_agreement_contract_state' and v.version = 1) then
    raise exception '#948 tail: the evaluator is not registered in clara.evaluator_versions'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions v on v.id = m.evaluator_version_id
   where v.evaluator_name = 'evaluate_agreement_contract_state' and v.version = 1;
  if v_n <> 1 then
    raise exception '#948 tail: the registered closure has % member(s), expected exactly 1', v_n
      using errcode = 'CLR10';
  end if;
  perform clara.verify_evaluator_freeze();

  -- 6 · THE ROUTER'S FIVE RECUT BODIES CARRY THE NEW LANE, and every other family's route is
  --     still exactly where it was. Counts MEASURED on this rig, never guessed.
  for r in select * from (values
      ('clara._enqueue_invoice_facts_core(uuid)', 'contract_facts'),
      ('clara.enqueue_invoice_facts(uuid)', 'contract_facts'),
      ('clara._tf_processing_task_update()', 'contract_facts'),
      ('clara.claim_document_processing_task(uuid,text,boolean)', 'contract_facts'),
      ('clara.release_held_document_tasks(integer)', 'contract_facts')
      ) as t(sig, marker) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = r.sig::regprocedure;
    if position(r.marker in v_def) = 0 then
      raise exception '#948 tail: % does not carry %', r.sig, r.marker using errcode = 'CLR10';
    end if;
  end loop;
  -- The ROUTING ARMS specifically, counted at the assignment that makes each one -- a bare
  -- substring count over the whole body would also count comments and receipt arms (measured:
  -- `llm_witness` appears 12 times in the live definition, only 2 of them as a lane assignment).
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  for r in select * from (values
      ($$v_lane:='llm_witness'$$, 2),
      ($$v_lane:='statement_facts'$$, 1),
      ($$v_lane:='payroll_facts'$$, 1),
      ($$v_lane:='contract_facts'$$, 1),
      ($$'skipped_kind'$$, 3)
      ) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#948 tail: the router names "%" % time(s), expected the % measured on this rig -- another family''s route moved', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 7 · THE PERSIST DOOR KEEPS ITS clara_runtime GRANT AND NOW CALLS THE POST; the queue keeps
  --     its clara_authenticated grant and projects the new row kind exactly once.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid = 'clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)'::regprocedure;
  if position('_post_agreement_acquisition' in v_def) = 0 then
    raise exception '#948 tail: the persist door does not call the post -- the lane reads without posting'
      using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated','clara.list_review_queue(jsonb,jsonb,integer)','EXECUTE') then
    raise exception '#948 tail: clara.list_review_queue lost its clara_authenticated grant' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(
    (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  v_n := (length(v_code) - length(replace(v_code, '''agreement_posting_blocked''::text row_kind', '')))
         / length('''agreement_posting_blocked''::text row_kind');
  if v_n <> 1 then
    raise exception '#948 tail: the queue projects agreement_posting_blocked % time(s), expected 1', v_n
      using errcode = 'CLR10';
  end if;

  -- 8 · THE RECEIPT TABLE ADMITS THE LANE THAT POSTS, beside the four it already admitted.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.entry_post_receipts'::regclass
       and conname = 'entry_post_receipts_via_wake_kind_check'
       and pg_get_constraintdef(oid) like '%contract_facts%'
       and pg_get_constraintdef(oid) like '%payroll_facts%'
       and pg_get_constraintdef(oid) like '%autodraft%') then
    raise exception '#948 tail: entry_post_receipts.via_wake_kind does not admit contract_facts beside the kinds it already carried'
      using errcode = 'CLR10';
  end if;

  -- 9 · THE REGISTRY IS RE-DERIVED, WHOLE, AT ONE VERSION, and this file appended no row to it
  --     and no row to the published standard chart.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#948 tail: the registry publishes % versions, expected exactly 1', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'agreement_contract'
     and (mime_type = 'application/pdf' or mime_type like 'image/%')
     and typed_facts = 'supported' and business_operation = 'supported'
     and limits ? 'agreement_non_financing' and limits ? 'agreement_asset_account';
  if v_n <> 6 then
    raise exception '#948 tail: % of the six pdf/image agreement pairs carry the re-derived verdict, expected 6', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where document_kind = 'payroll_summary' and mime_type = 'application/pdf'
     and typed_facts = 'supported' and business_operation = 'stored_only';
  if v_n <> 1 then
    raise exception '#948 tail: #946''s payroll row moved -- this file republishes the VERSION, never another ticket''s verdict'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.coa_template_accounts a
    join clara.coa_templates t on t.id = a.template_id
   where t.template_key = 'my_sme_starter' and t.state = 'published'
     and a.account_code in ('2430','2440','2450','2010');
  if v_n <> 4 then
    raise exception '#948 tail: the published standard chart carries % of the four codes this lane posts to, expected the 4 that 0150 already seeds (this file appends none)', v_n
      using errcode = 'CLR10';
  end if;

  -- 10 · A FIXTURE-FREE PROBE that drives the evaluator, the date parser and the drafting body
  --      together. It uses a client id that cannot exist, so the chart lookup and the enrolment
  --      lookup both find nothing -- which is exactly the state whose refusals this asserts.
  v_text := jsonb_build_object('contract', jsonb_build_object('channel','text','rows','[]'::jsonb,
    'answers', jsonb_build_object(
      'contract.agreement.kind', jsonb_build_object('state','value','raw','Hire Purchase Agreement'),
      'contract.agreement.financier', jsonb_build_object('state','value','raw','Probe Bank Berhad'),
      'contract.agreement.agreement_date', jsonb_build_object('state','value','raw','14 March 2026'),
      'contract.agreement.asset_description', jsonb_build_object('state','value','raw','probe lorry'),
      'contract.agreement.cash_price', jsonb_build_object('state','value','raw','120,000.00'),
      'contract.agreement.deposit', jsonb_build_object('state','value','raw','20,000.00'),
      'contract.agreement.amount_financed', jsonb_build_object('state','value','raw','100,000.00'),
      'contract.agreement.total_charges', jsonb_build_object('state','not_printed'),
      'contract.agreement.total_payable', jsonb_build_object('state','not_printed'),
      'contract.agreement.term_months', jsonb_build_object('state','value','raw','36'),
      'contract.agreement.instalment_amount', jsonb_build_object('state','not_printed'))));
  v_vision := jsonb_set(v_text, '{contract,channel}', '"vision"'::jsonb);
  v_state := clara.evaluate_agreement_contract_state_v1(v_text, v_vision);
  if v_state->>'agreement_class' is distinct from 'hire_purchase' or (v_state->>'financing')::boolean is not true then
    raise exception '#948 tail probe: the evaluator did not classify a page headed "Hire Purchase Agreement" (%)',
      v_state->>'agreement_class' using errcode = 'CLR10';
  end if;
  if v_state->'checks'->'price_identity'->>'state' is distinct from 'holds' then
    raise exception '#948 tail probe: 20,000 + 100,000 = 120,000 did not hold (%)',
      v_state->'checks'->'price_identity' using errcode = 'CLR10';
  end if;
  v_plan := clara._agreement_entry_plan('00000000-0000-4000-8000-000000000000'::uuid, v_state);
  if v_plan->>'posting_date' is distinct from '2026-03-14' then
    raise exception '#948 tail probe: "14 March 2026" did not establish the signing date (posting_date %) -- the parser is not live',
      v_plan->>'posting_date' using errcode = 'CLR10';
  end if;
  if (v_plan->>'ready')::boolean is not false
     or not exists (select 1 from jsonb_array_elements(v_plan->'refusals') x
                     where x->>'reason' = 'asset_account_unresolved') then
    raise exception '#948 tail probe: a client with no fixed-asset enrolment did not produce a NAMED asset_account_unresolved refusal (%)', v_plan
      using errcode = 'CLR10';
  end if;
  if jsonb_array_length(coalesce(v_plan->'legs','[]'::jsonb)) <> 0 then
    raise exception '#948 tail probe: legs were drafted for a client holding no chart at all' using errcode = 'CLR10';
  end if;
  -- …and the non-financing branch refuses by NAME, with no complaint about accounts it never
  -- looked up.
  v_plan := clara._agreement_entry_plan(
    '00000000-0000-4000-8000-000000000000'::uuid,
    clara.evaluate_agreement_contract_state_v1(
      jsonb_set(v_text, '{contract,answers,contract.agreement.kind}', jsonb_build_object('state','value','raw','Tenancy Agreement')),
      jsonb_set(v_vision, '{contract,answers,contract.agreement.kind}', jsonb_build_object('state','value','raw','Tenancy Agreement'))));
  if (v_plan->>'agreement_class') is distinct from 'tenancy'
     or (v_plan->>'stage') is distinct from 'kind'
     or jsonb_array_length(v_plan->'refusals') <> 1
     or v_plan->'refusals'->0->>'reason' is distinct from 'not_a_financing_agreement' then
    raise exception '#948 tail probe: a tenancy did not refuse by name with exactly one reason (%)', v_plan
      using errcode = 'CLR10';
  end if;

  raise notice '#948 tail: OK -- the contract namespace is live and the roster still closed; clara._field_path_conforms is byte-unmoved; eight new bodies are owned by clara_fn_owner and search_path-pinned, the two clara_runtime doors reachable by clara_runtime alone and the six internals by no application role; the vocabulary gate admits a complete envelope and refuses both a missing question and an unknown one; the evaluator is registered, frozen at ONE member and re-verifies; the router''s five recut bodies carry contract_facts while every other family''s routing arm stays at its measured count; the persist door calls the post and keeps its grant; the queue projects agreement_posting_blocked exactly once and keeps its clara_authenticated grant; entry_post_receipts admits contract_facts beside the kinds it already carried; the registry publishes ONE version with all six pdf/image agreement pairs re-derived and #946''s payroll row untouched; the published standard chart still carries the four codes 0150 seeds and this file appends none; and a fixture-free probe drove the evaluator, the date parser and the drafting body together -- classifying a hire purchase, holding the price identity, establishing 14 March 2026 from the page''s own rendering, refusing an unenrolled client BY NAME, and refusing a tenancy with exactly one reason and no legs.';
end
$w948_tail$;
