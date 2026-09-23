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
