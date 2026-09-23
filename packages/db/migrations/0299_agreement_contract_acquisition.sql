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
