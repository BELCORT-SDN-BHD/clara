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

reset role;
