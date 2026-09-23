-- 0308_deferred_revenue_recognition — #941 (riders wave 4, lane 04, SECOND HALF): RECOGNISE A
-- RECEIPT PAID AHEAD BY A CUSTOMER AS REVENUE OVER ITS SERVICE PERIOD — the mirror of the
-- prepayment amortisation lane.
-- =====================================================================================
-- Spec of record: issue #941's body (its newest Agent Brief — the issue carries two comments, the
-- 2026-09-19 chart-row coordination note and the 2026-09-23 ruling that minted `my_sme_starter`
-- v2 and retired v1; neither is a later Agent Brief and there is no 2026-09-20 owner ruling
-- comment on this issue).
--
-- THE FIRST HALF IS ALREADY ON THIS BASE AND THIS FILE MINTS NO CHART ROW. Acceptance row 5 —
-- "a new migration appends 2030 Deferred Revenue and 1180 Accrued Income to the standard chart
-- template" — was built ALONE as the wave-4 pre-step (0295_wave4_chart_rows.sql, `my_sme_starter`
-- version 2, v1 retired), by the owner's ruling that the four rows this family needs go into ONE
-- chart migration. MEASURED on this rig before a line of this file was written:
-- `select account_code, account_type from clara.coa_template_accounts a join clara.coa_templates t
--  on t.id = a.template_id where t.version = 2 and a.account_code = '2030'` returns
-- `2030 | liability`. This file therefore CONSUMES that row by name and never inserts one.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A `revenue_recognition_schedule` accounting-plan kind, a
-- `clara.revenue_recognition_schedules` relation in `clara.prepayment_schedules`' exact shape, the
-- deferred-revenue arm of #940's enrolment door, and a recognition door with the OBO twin and the
-- machine-lane read #915 gave the expense side — all riding #939's `clara.prepayment_schedule_v2`
-- evaluator with the release SIDE set to `debit`, which is the argument #939 put there for exactly
-- this caller ("a prepaid ASSET is released by credit and a deferred-revenue LIABILITY by debit").
--
-- THE ACCOUNTING, STATED SO A REVIEWER CAN CHECK IT AGAINST THE STANDARD. A customer's advance is
-- a CONTRACT LIABILITY (MFRS 15 / MPERS §23): the entity owes a service, not money, and recognises
-- revenue as it satisfies the performance obligation. This lane posts Dr deferred revenue / Cr the
-- revenue account, one entry a month, whole calendar months, straight line, the cent remainder in
-- the final period, until the liability clears to zero. It moves the REVENUE leg only:
--   · SST OUTPUT TAX IS NEVER TOUCHED. Output tax on an advance is a tax liability owed to the
--     Royal Malaysian Customs Department under the Service Tax Act 2018 — it is not revenue and it
--     never becomes revenue. §F therefore EXCLUDES any credited leg stamped
--     `special_acc_type = 'sst_output'` from the candidate set BY THE ESTATE'S OWN STAMP rather
--     than by code or name, so a receipt of `Dr bank / Cr deferred revenue / Cr SST output` has
--     exactly ONE candidate liability leg and the tax leg is left where the invoice put it. That
--     exclusion is STRUCTURAL, not a guess between two legs: a tax account can never be deferred
--     revenue, so removing it from the candidate set removes an impossibility rather than making a
--     choice. MyInvois is untouched — this file names no invoice door at all.
--   · STRAIGHT LINE IS THE ONLY PATTERN. Usage-based and milestone recognition need a measure of
--     progress this estate does not carry, and inventing one would be the database choosing a
--     number. §F refuses any other pattern by name, `recognition_pattern_unsupported`.
--
-- WHY A SECOND RELATION RATHER THAN A `kind` COLUMN ON `clara.prepayment_schedules`. That table's
-- own CHECK pins `plan_kind = 'amortisation_schedule'` and its columns are named for the expense
-- side (`prepaid_account_code`, `expense_account_code`, `expense_account_basis`); widening it
-- would either leave a liability schedule filed under columns that name it wrongly, or rename
-- columns four batteries, three reads and a web surface already spell. The relation below is that
-- table COLUMN FOR COLUMN with three renamed for this side, which is what the brief asks for ("a
-- deferred-revenue schedule table in the shape of the prepayment schedule").
--
-- WHY THE REFUSAL TOKENS ARE THIS LANE'S OWN. 0140's five prepayment tokens say "prepayment", and
-- a bookkeeper recognising a customer's advance on a Deferred revenue page would be told the wrong
-- half of the books. The SHAPE is carried over token for token — `_source_unfit` with an `axis`,
-- `_term_underivable` with a `missing` and a `remedy`, `_target_ineligible` / `_target_underivable`
-- — so every surface that renders one renders the other with no second grammar.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--   · It mints no chart row and edits no chart template (above).
--   · It opens NO agent path to stating a term or to enrolling an account. Both stay human doors
--     with no wake wrapper, by hard constraint 2 and #940's owner decision 4, and §TAIL asserts
--     the absence by `pg_proc` count rather than by convention.
--   · It reads NO document bytes. §I's machine-lane read returns the RECORDED term — the period a
--     person recorded or stated, its basis kind and the grounds they wrote — and the byte door
--     stays 0190's, unreachable from here.
--   · It edits no frozen evaluator. `clara.prepayment_schedule_v2` is ridden as an argument-taking
--     function and pinned unconditionally at both ends of this file.
--   · It touches `clara.prepayment_schedules` not at all: the expense lane's relation, doors,
--     reads and batteries are byte-identical after this file, and §TAIL re-measures the five
--     prepayment bodies it relies on to prove it.
--
-- ==================== THE PRESTATE PINS ARE PER BODY, NOT GLOBAL ====================
-- 0305 (#939) states the reasoning in full; 0306 (#940) and 0307 (#915) inherit it, and so does
-- this file. Each RECUT body admits exactly TWO pre-images — its measured live `sha256(prosrc)`,
-- or a body that already carries this file's own `#941` attribution — and anything else is real
-- drift and refuses BY NAME. Every KEPT neighbour is pinned UNCONDITIONALLY. The mode each body
-- was found in is reported in the notice.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md): every function is a
-- `create or replace`, the relation is `create table if not exists` with `drop trigger if exists`
-- / `drop policy if exists` before each creation, and the ONE constraint swap drops by name before
-- it adds. The file writes no row.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file does no
                                        -- backfill and no bulk scan.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t941_pre$
declare
  v_sha text; v_src text; v_i int; v_modes text := ''; v_n int;
  -- THE BODIES THIS FILE RECUTS, pinned by `sha256(prosrc)` MEASURED ON THIS RIG after 0307
  -- (rule: pin what is LIVE, never a literal copied from an older migration's text).
  v_recut text[][] := array[
    ['clara.enrol_prepayment_account(uuid,text,text,text,text)',
     'd55dcbdebd05a7d07adc8f1e8988d8ba440fdfed99b2573c24ea7f8ff07b56a1'],
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     '99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424'],
    ['clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)',
     '1aca2dc26d5a9d0ac5ead59144561eb3292feb9df520f45982952604a9666b40'],
    ['clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
     '0b34d44d70fa92f78f1d13dcf7866ce38aa99f7a6d2430cf329a48e4a7cd17dc'],
    ['clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
     'a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46'],
    ['clara.preview_accounting_plan(uuid,integer)',
     '49416814c59f54bc43d07ee0d795b87edb40aa41c6b54e058ed12fc81a7b05c6']
  ];
  -- …AND THE NEIGHBOURS THIS FILE RELIES ON AND MUST NOT MOVE.
  --   · clara._adj_line_eligibility_breach — 0042's shared negative wall, asked by §A before the
  --     per-purpose type rule and by the recognition door on both of its legs.
  --   · clara._prepayment_account_enrolled — #940's ONE spelling of the roster question, asked by
  --     this lane with its own purpose.
  --   · clara.prepayment_schedule_v2 — #939's FROZEN evaluator, ridden with `release_side` =
  --     'debit'. A change to it would move every allocation this file derives.
  --   · clara._prepayment_schedule_core — the expense lane's shared body. This file must leave it
  --     byte-identical: "the prepayment lane is untouched" is a claim, and this is its evidence.
  v_keep text[][] := array[
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     'acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa'],
    ['clara._authority_ref_refusal(text,uuid,uuid,uuid)',
     'c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7'],
    ['clara._assert_journal_basis(jsonb)',
     '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684'],
    ['clara.prepayment_schedule_v1(uuid,uuid)',
     'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2'],
    ['clara._plan_amortisation_period_line(uuid,date)',
     '88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c'],
    ['clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)',
     'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e']
  ];
begin
  if to_regclass('clara.prepayment_account_enrolments') is null then
    raise exception '#941 prestate: clara.prepayment_account_enrolments is absent -- 0306 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.prepayment_stated_terms') is null then
    raise exception '#941 prestate: clara.prepayment_stated_terms is absent -- 0305 must apply first'
      using errcode='CLR10';
  end if;

  -- THE PURPOSE COLUMN ADMITS THE SECOND VALUE ALREADY (0306 carried it from birth, deliberately);
  -- this file states its RULE. A column that did not admit it would make §A unreachable.
  if not exists (
        select 1 from pg_constraint
         where conrelid = 'clara.prepayment_account_enrolments'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) like '%deferred_revenue%') then
    raise exception '#941 prestate: clara.prepayment_account_enrolments.purpose does not admit deferred_revenue -- 0306 carried that column from birth'
      using errcode='CLR10';
  end if;

  -- THE PRE-STEP'S CHART ROW IS ON THIS BASE, by code AND by type. This file consumes it and
  -- mints none; a base without it would make the lane's whole point untestable.
  select count(*)::int into v_n
    from clara.coa_template_accounts a
    join clara.coa_templates t on t.id = a.template_id
   where t.scope = 'platform' and t.template_key = 'my_sme_starter' and t.state = 'published'
     and a.account_code = '2030' and a.account_type = 'liability';
  if v_n < 1 then
    raise exception '#941 prestate: no PUBLISHED platform chart template carries 2030 Deferred Revenue as a liability -- 0295 (the wave-4 pre-step, the first half of this ticket) must apply first'
      using errcode='CLR10';
  end if;

  for v_i in 1 .. array_length(v_recut, 1) loop
    if to_regprocedure(v_recut[v_i][1]) is null then
      raise exception '#941 prestate: % does not resolve -- 0306/0307 must apply first', v_recut[v_i][1]
        using errcode='CLR10';
    end if;
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha = v_recut[v_i][2] then
      v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('#941' in v_src) > 0 then
      v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '#941 prestate: % has DRIFTED -- it is neither its measured pre-image nor a body this file already recut, so re-derive this file against the live text before applying (got %)',
        v_recut[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  for v_i in 1 .. array_length(v_keep, 1) loop
    if to_regprocedure(v_keep[v_i][1]) is null then
      raise exception '#941 prestate: % is absent', v_keep[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '#941 prestate: % has MOVED (got %) -- this file calls it verbatim or promises not to touch it; re-measure before applying',
        v_keep[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- THE OBJECTS THIS FILE OWNS ARE BORN HERE. On a redo they already exist, and that is stated
  -- rather than silently tolerated. Counted over the LIVE catalog, so a redo that lost one says so.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname in
     ('create_revenue_recognition_schedule', 'create_revenue_recognition_schedule_for',
      'read_revenue_recognition_source_for', '_revenue_recognition_core', '_obo_plan_core',
      '_plan_revenue_recognition_period_line', '_revenue_recognition_ctx',
      'get_revenue_recognition_schedule', 'list_revenue_recognition_schedules',
      'list_revenue_recognition_attention', '_tf_revenue_recognition_schedules_append_only');
  if v_n = 0 then
    raise notice '#941 prestate: FIRST APPLY -- none of this file''s eleven functions exists yet. Recut mode: %', v_modes;
  else
    raise notice '#941 prestate: REDO -- % of this file''s eleven functions already exist. Recut mode: %',
      v_n, v_modes;
  end if;
end
$t941_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.enrol_prepayment_account — THE SECOND PURPOSE STOPS BEING A COLUMN AND BECOMES A RULE.
--
-- 0306 carried `purpose in ('prepayment','deferred_revenue')` on the COLUMN from birth and made
-- the DOOR refuse the second value by name (`purpose_rule_not_stated`, naming this ticket), on the
-- stated ground that admitting a purpose with no rule of its own would enrol a liability under the
-- asset rule. This file states the rule and deletes that raise.
--
-- WHAT CHANGES, AND NOTHING ELSE: the ONE positive account-type arm becomes a branch on the
-- purpose. Everything around it is 0306's body verbatim — the op key, `clara._human_ctx` at the
-- bookkeeper rank, the client ladder, the reserve-before-mutable-validation order, the required
-- non-blank reason, the closed purpose set, the SHARED NEGATIVE WALL asked before the type rule,
-- the version-forward block, the redacted audit row and the `clara._finish_op` envelope.
--
-- WHY THE WALL STILL ANSWERS FIRST, and it is load-bearing rather than incidental: an UNKNOWN code
-- has no row to read a type from, so a type rule that ran first would answer `not_liability_class`
-- about an account that does not exist. `clara._adj_line_eligibility_breach` answers
-- `account_unknown` for exactly that case, and #940 put it first for exactly that reason.
--
-- THE ONE NEW AXIS is `not_liability_class`, beside 0306's `not_asset_class` and spelled the same
-- way, carrying `account_type` and `purpose` so a panel can point at the field and say what it
-- found. No new refusal TOKEN: `prepayment_account_enrolment_invalid` is the door's own.
-- =====================================================================================
create or replace function clara.enrol_prepayment_account(
  p_client uuid, p_account text, p_purpose text, p_reason text, p_op_key text)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_code text; v_purpose text; v_reason text;
  v_breach jsonb; v_type text; v_existing record; v_id uuid;
  -- #941 — the per-purpose positive rule, as data rather than as two copies of one branch.
  v_want_type text; v_want_axis text; v_want_words text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'enrolling a prepayment account requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment-account enrolment' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  v_code    := nullif(btrim(coalesce(p_account, '')), '');
  v_purpose := nullif(btrim(coalesce(p_purpose, '')), '');
  v_reason  := nullif(btrim(coalesce(p_reason, '')), '');

  -- RESERVE-BEFORE-MUTABLE-VALIDATION (0305 §B's placement and its reasoning): the replay
  -- short-circuit sits after identity/authz and before anything reading mutable world state, so a
  -- retry of a SUCCEEDED call returns its stored receipt even though the chart moved. A FIRST call
  -- that fails a later validation raises, and the raise rolls the reservation back with it, so the
  -- caller may fix the input and retry under the SAME key.
  v_dedupe := clara._reserve_op(v_firm, 'enrol_prepayment_account', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'account', v_code,
      'purpose', v_purpose, 'reason', v_reason)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-account enrolment key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- WHO/REASON/WHEN is the ruled trio. A fact without its basis is REFUSED, never defaulted; the
  -- table CHECK says the same thing, and this is the door saying it by name first.
  if v_reason is null then
    raise exception 'enrolling an account as a prepayment account requires its one-line reason'
      using errcode='CLR37',
        detail='{"reason":"prepayment_account_enrolment_invalid","axis":"reason_missing"}';
  end if;
  if v_purpose is null or v_purpose not in ('prepayment', 'deferred_revenue') then
    raise exception 'a prepayment-account enrolment has purpose ''prepayment'' or ''deferred_revenue''; got %',
      coalesce(v_purpose, '<null>') using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis','purpose_unknown', 'purpose', v_purpose)::text;
  end if;

  -- THE SHARED NEGATIVE WALL, ASKED HERE (#940's decision 6). Unknown, inactive, control-class,
  -- bank and role-reserved accounts are refused at ENROLMENT with the wall's OWN axis carried
  -- through, so the reason a person reads is the estate's own rather than a paraphrase. It is
  -- PURPOSE-AGNOSTIC and this file leaves it exactly where 0306 put it.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_code,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % cannot be enrolled as a prepayment account for this client', coalesce(v_code, '<null>')
      using errcode='CLR37',
        detail=(jsonb_build_object('reason','prepayment_account_enrolment_invalid',
                  'account_code', v_code) || v_breach)::text;
  end if;

  -- …AND THE ONE POSITIVE RULE THE PURPOSE ADDS, NOW A BRANCH (#941).
  --
  --   'prepayment'       -> a prepaid ASSET, released by credit (0306's rule, unchanged).
  --   'deferred_revenue' -> a contract LIABILITY, released by debit. A customer's advance is an
  --                         obligation to render a service (MFRS 15 / MPERS §23); an asset,
  --                         expense, income or equity account could never carry one, and the door
  --                         that would have refused it is three screens away.
  --
  -- The CONTROL axis is already discharged by the wall above (`account_class is not null`), so
  -- this arm adds the TYPE and nothing else — which is why it is one comparison and not a second
  -- eligibility rule written here.
  if v_purpose = 'deferred_revenue' then
    v_want_type := 'liability'; v_want_axis := 'not_liability_class';
    v_want_words := 'deferred revenue is a contract LIABILITY';
  else
    v_want_type := 'asset'; v_want_axis := 'not_asset_class';
    v_want_words := 'a prepayment is a prepaid ASSET';
  end if;
  select ca.account_type into v_type from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_code;
  if v_type is distinct from v_want_type then
    raise exception 'account % is a % account; %', v_code, v_type, v_want_words
      using errcode='CLR37',
        detail=jsonb_build_object('reason','prepayment_account_enrolment_invalid',
          'axis', v_want_axis, 'account_code', v_code, 'account_type', v_type,
          'purpose', v_purpose)::text;
  end if;

  -- VERSION-FORWARD, NEVER MUTATE (0041's round-3 fold F5b). An unchanged re-enrolment is
  -- idempotent and must not move the interval under live history; a RESTATED reason retires the
  -- live row and inserts a fresh one, so the basis a schedule was configured under stays readable
  -- for as long as the schedule does. Keyed on (client, account, PURPOSE), so the two purposes
  -- version forward independently and neither can retire the other's enrolment.
  select * into v_existing from clara.prepayment_account_enrolments
   where client_id = p_client and account_code = v_code and purpose = v_purpose and active
   limit 1 for update;
  if found and v_existing.reason = v_reason then
    v_id := v_existing.id;
  else
    if found then
      update clara.prepayment_account_enrolments
         set active = false, retired_by = v_actor, retired_at = now()
       where id = v_existing.id;
    end if;
    insert into clara.prepayment_account_enrolments(firm_id, client_id, account_code, purpose,
        reason, created_by)
      values (v_firm, p_client, v_code, v_purpose, v_reason, v_actor)
      returning id into v_id;
  end if;

  -- args stay REDACTED (ids and codes, never the reason text -- the reason lives on the row, which
  -- is the record of record; 0002's audit_log doctrine).
  perform clara._audit(v_firm, v_actor, null, null, 'enrol_prepayment_account', null,
    jsonb_build_object('client', p_client, 'account', v_code, 'purpose', v_purpose,
      'enrolment_id', v_id, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'enrol_prepayment_account', p_op_key,
    jsonb_build_object('enrolment_id', v_id, 'client_id', p_client, 'account_code', v_code,
      'purpose', v_purpose, 'reason', v_reason, 'enrolled_by', v_actor, 'active', true));
end $fn$;

comment on function clara.enrol_prepayment_account(uuid,text,text,text,text) is
  'Enrol one of a client''s chart accounts on the prepayment-account roster under a stated purpose. '
  '#940 built it for ''prepayment'' (a prepaid asset); #941 states the rule for ''deferred_revenue'' '
  '(a contract liability). Bookkeeper floor, clara_authenticated only, no wake wrapper: whether an '
  'account holds prepayments or customer advances is a judgement about the client''s chart.';

-- =====================================================================================
-- §B — THE PLAN KIND, WIDENED ADDITIVELY IN BOTH PLACES THAT HOLD IT.
--
-- The kind set lives in exactly TWO places on this estate, MEASURED before this file was written
-- (`select conname, pg_get_constraintdef(oid) from pg_constraint where contype='c' and
--  pg_get_constraintdef(oid) like '%amortisation_schedule%'` → the plans CHECK and the prepayment
-- schedules' own `plan_kind` CHECK; `select oid::regprocedure from pg_proc where prosrc like
-- '%recurring_journal%'` → `clara.create_accounting_plan` alone). The prepayment relation's CHECK
-- is NOT widened: its rows are amortisation schedules and stay so.
--
-- ADDITIVE means the three existing kinds keep their exact spelling, their order and their
-- refusal: a caller that names a depreciation or a close schedule still gets
-- `plan_kind_unsupported` BY NAME with the supported list in the payload, which is 0193's own
-- reason for spelling that refusal rather than letting the CHECK answer.
-- =====================================================================================
alter table clara.accounting_plans drop constraint if exists accounting_plans_kind_check;
alter table clara.accounting_plans add constraint accounting_plans_kind_check
  check (kind = any (array['recurring_journal', 'reversing_journal', 'amortisation_schedule',
                           'revenue_recognition_schedule']));

-- …AND THE DERIVED-CADENCE WALL, which is the half that actually protects the books. A schedule
-- of either derived kind emits WHOLE CALENDAR MONTHS, so every `period_end` it produces IS a month
-- end; a `day_of_month` cadence would put every due date OFF every line boundary and the period
-- line lookup would then miss SILENTLY — a schedule that looked configured and posted nothing,
-- every month, with no audit row, no Work and no notification. 0193 refused that for the
-- amortisation kind; this arm refuses it for the recognition kind, in its own words, leaving the
-- amortisation sentences byte-identical so no existing caller's message moves.
create or replace function clara._assert_plan_schedule(
  p_kind text, p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text,
  p_effective_from date, p_effective_to date, p_reversal_day_rule text)
returns void language plpgsql immutable security definer
set search_path = clara, pg_temp as $fn$
begin
  if p_frequency is null or p_frequency not in ('monthly','quarterly','annual') then
    raise exception 'unknown plan frequency %', coalesce(p_frequency,'(null)') using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"frequency","constraint":"enum"}';
  end if;
  if p_day_rule is null or p_day_rule not in ('day_of_month','last_day_of_month') then
    raise exception 'unknown plan day rule %', coalesce(p_day_rule,'(null)') using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"enum"}';
  end if;
  if p_day_rule = 'day_of_month' and (p_day_of_month is null or p_day_of_month not between 1 and 28) then
    raise exception 'a day-of-month schedule needs a day between 1 and 28 (use last_day_of_month for a month end)'
      using errcode='CLR10',
        detail='{"reason":"invalid_schedule","field":"day_of_month","constraint":"between_1_and_28"}';
  end if;
  if p_day_rule = 'last_day_of_month' and p_day_of_month is not null then
    raise exception 'a last-day-of-month schedule carries no day number' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"day_of_month","constraint":"absent"}';
  end if;
  if p_timezone is distinct from 'Asia/Kuala_Lumpur' then
    raise exception 'the only supported plan timezone is Asia/Kuala_Lumpur' using errcode='CLR10',
      detail='{"reason":"timezone_unsupported","field":"timezone"}';
  end if;
  if p_effective_from is null then
    raise exception 'a plan needs the date its authority starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_from","constraint":"present"}';
  end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'a plan cannot end before it starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_to","constraint":"after_effective_from"}';
  end if;
  if p_kind = 'reversing_journal' then
    if p_reversal_day_rule is not null and p_reversal_day_rule <> 'next_period_first_day' then
      raise exception 'the only supported reversal rule is next_period_first_day' using errcode='CLR10',
        detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"enum"}';
    end if;
    -- THE ONE COLLIDING SHAPE (the header's identity-law note): a monthly accrual on the 1st would
    -- put period k's reversal and period k+1's accrual on the same day, and `unique (plan_id,
    -- due_date)` would refuse the second as a bare 23505 nobody can classify. Named here instead.
    if p_frequency = 'monthly' and p_day_rule = 'day_of_month' and p_day_of_month = 1 then
      raise exception 'a monthly reversing plan cannot accrue on the 1st: its reversal would land on the next accrual''s own day'
        using errcode='CLR10',
          detail='{"reason":"reversal_collides_with_next_occurrence","field":"day_of_month"}';
    end if;
  else
    if p_reversal_day_rule is not null then
      raise exception 'a % plan carries no reversal rule', coalesce(p_kind,'(null)')
        using errcode='CLR10',
          detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"absent"}';
    end if;
    -- #653 - THE AMORTISATION CADENCE IS DERIVED FROM THE FROZEN EVALUATOR, NEVER TYPED, and this
    -- arm is what makes that true on BOTH paths: `clara.create_accounting_plan` and
    -- `clara.revise_accounting_plan` are this function's ONLY callers, so `revise_accounting_plan`
    -- needs no edit of its own and a revision cannot move the cadence.
    --
    -- WHY IT MATTERS MORE THAN AN ORDINARY ENUM. `clara.prepayment_schedule_v1` emits whole
    -- calendar months, so every `period_end` it produces IS a month end. The generic machinery
    -- above would happily take `day_of_month = 1..28`, which would put every due date OFF every
    -- line boundary -- and `clara._plan_amortisation_period_line`'s `period_end = due_date` join
    -- would then miss SILENTLY. A schedule that looked configured and posted nothing, every month,
    -- with no audit row, no Work and no notification, is the worst failure this lane can have; it
    -- is refused here instead.
    if p_kind = 'amortisation_schedule' then
      if p_frequency <> 'monthly' then
        raise exception 'an amortisation schedule charges whole calendar months: its frequency is derived from the term, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"frequency","constraint":"monthly"}';
      end if;
      if p_day_rule <> 'last_day_of_month' then
        raise exception 'an amortisation schedule falls on each period''s own month end: its day rule is derived from the term, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"last_day_of_month"}';
      end if;
    end if;
    -- #941 - THE SAME WALL FOR THE REVENUE SIDE, and for the same reason: a recognition schedule
    -- rides `clara.prepayment_schedule_v2`, which emits whole calendar months on either release
    -- side, and `clara._plan_revenue_recognition_period_line` joins on `period_end = due_date`
    -- exactly as the amortisation lookup does. Spelled as its OWN arm rather than folded into the
    -- one above so the amortisation lane's two sentences are byte-identical to what 0193 shipped.
    if p_kind = 'revenue_recognition_schedule' then
      if p_frequency <> 'monthly' then
        raise exception 'a revenue recognition schedule recognises whole calendar months: its frequency is derived from the service period, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"frequency","constraint":"monthly"}';
      end if;
      if p_day_rule <> 'last_day_of_month' then
        raise exception 'a revenue recognition schedule falls on each period''s own month end: its day rule is derived from the service period, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"last_day_of_month"}';
      end if;
    end if;
  end if;
  -- #908 - THE SHARED DOOR'S OWN WALL. Every shape this validator refuses on its own terms has
  -- already raised by now, so `clara._accrual_schedule_yields` receiving these same five arguments
  -- answers only for a schedule that is otherwise well-formed but structurally unable to ever
  -- reach a due date inside its own window. An open-ended schedule has no window to run out of and
  -- is skipped, mirroring `_assert_accrual_schedule_yields`'s own guard.
  if p_effective_to is not null
     and not clara._accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month,
           p_effective_from, p_effective_to) then
    raise exception 'this schedule reaches no due date between % and %, so the plan would be recorded and never perform',
      to_char(p_effective_from,'YYYY-MM-DD'), to_char(p_effective_to,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_schedule_yields_no_occurrence',
          'field', case when p_day_rule = 'day_of_month' then 'day_of_month' else 'day_rule' end,
          'constraint','yields_occurrence', 'kind', p_kind, 'frequency', p_frequency,
          'day_rule', p_day_rule,
          'effective_from', to_char(p_effective_from,'YYYY-MM-DD'),
          'effective_to', to_char(p_effective_to,'YYYY-MM-DD'))::text;
  end if;
end $fn$;

-- …AND THE HUMAN PLAN DOOR'S OWN CLOSED SET. One line moves; everything else is 0193's body
-- verbatim, including the `plan_kind_unsupported` payload that still names the supported list.
create or replace function clara.create_accounting_plan(
  p_client uuid, p_kind text, p_purpose text, p_authority_kind text, p_authority_ref jsonb,
  p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text,
  p_effective_from date, p_effective_to date, p_basis jsonb, p_reversal_day_rule text,
  p_op_key text)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_plan uuid; v_rev uuid; v_digest text; v_auto boolean;
  v_ref_kind text; v_ref_id uuid; v_reason text; v_warning jsonb; v_next jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting plan' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- THE EXCLUDED ADAPTERS, REFUSED BY NAME (the header's scope note).
  -- #653 widened this list by ONE member; #941 widens it by one more. Depreciation and close
  -- schedules STILL answer `plan_kind_unsupported` BY NAME, so a later file can widen it again
  -- additively and every caller that tried one in the meantime got a typed answer rather than a
  -- silent success.
  if p_kind is null or p_kind not in ('recurring_journal','reversing_journal','amortisation_schedule','revenue_recognition_schedule') then
    raise exception 'plan kind % is not supported in this slice (recurring_journal, reversing_journal, amortisation_schedule, revenue_recognition_schedule)', coalesce(p_kind,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind,
          'supported', jsonb_build_array('recurring_journal','reversing_journal','amortisation_schedule','revenue_recognition_schedule'))::text;
  end if;
  -- THE AUTHORITY SHAPE.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- #977 (0250): RESOLVED, not merely well-shaped -- and, on the CHAT-LANE arm, a PERSON'S
  -- INSTRUCTION rather than a task the estate enqueued for itself. A Knowledge preference, a
  -- calculation policy or a repeated debit has no row here, so none of them can supply authority;
  -- an agent run HAS one, and #977 is the ruling that stops it counting.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, v_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p_kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'create_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'kind', p_kind, 'purpose', p_purpose,
      'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone,
      'effective_from', p_effective_from, 'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this plan key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- #929 (fix round, ADV-L05-04): THE CLIENT RUNG, 203005004 -- the same rung
  -- clara.retire_adjustment_template and fifty other client-scoped bodies already take. Without it
  -- two sessions creating overlapping plans for ONE client each read the other's row as
  -- uncommitted and BOTH answered null; under this rung the second one waits and then sees the
  -- first, so the advisory answers the same thing concurrently that it answers in sequence.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, v_firm, p_client, p_kind, 'active', btrim(p_purpose), p_authority_kind,
      p_authority_ref, v_actor, p_effective_from, 1, v_actor);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, v_firm, p_client, p_kind, 1, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;

  -- #929 (fix round, ADV-L05-03): SELF-EXCLUSION BY IDENTITY. The advisory used to exclude the row
  -- this door just inserted by comparing BASIS VALUES, which also hid every OTHER plan carrying the
  -- same basis -- total overlap, the case a human most needs told. It now takes the plan id this
  -- door already holds.
  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, v_auto,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(v_firm, v_actor, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind, 'revision', 1,
      'authority', p_authority_ref, 'op_key', p_op_key));

  v_result := jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind, 'next_occurrences', coalesce(v_next, '[]'::jsonb),
    'overlap_warning', v_warning);
  return clara._finish_op(v_firm, 'create_accounting_plan', p_op_key, v_result);
end $fn$;

-- =====================================================================================
-- §C — clara.revenue_recognition_schedules — THE DERIVED RECORD, IN THE PREPAYMENT SCHEDULE'S
-- EXACT SHAPE.
--
-- Column for column `clara.prepayment_schedules` (0223/0285/0305), with THREE renamed for this
-- side of the books (`deferred_account_code`, `revenue_account_code`, `revenue_account_basis`) and
-- ONE added (`recognition_pattern`, a closed set of one member today, so the pattern a schedule
-- was derived under is recorded on the row rather than implied by the absence of an alternative).
--
-- THE POSTURE IS 0223'S, not a new one: NO ACL AT ALL (no SELECT, no DML — every reach is a
-- definer door, so a plain PostgREST table read 42501s and there is no second path to be tempted
-- by), forced RLS with an owner-only policy, an append-only trigger pair and the two uniqueness
-- laws (one schedule per plan, one per source entry).
--
-- TENANCY IS STRUCTURAL: the composite FKs onto `clara.clients(id, firm_id)`,
-- `clara.documents(id, firm_id)` and `clara.accounting_plans(id, kind)` mean a row cannot name a
-- client of another firm, a document of another firm, or a plan of the wrong kind — the same three
-- the prepayment relation carries, for the same reason.
-- =====================================================================================
create table if not exists clara.revenue_recognition_schedules (
  id                     uuid primary key default gen_random_uuid(),
  firm_id                uuid not null references clara.firms(id),
  client_id              uuid not null,
  plan_id                uuid not null,
  plan_kind              text not null check (plan_kind = 'revenue_recognition_schedule'),
  revision               integer not null check (revision >= 1),
  source_entry_id        uuid not null references clara.journal_entries(id),
  deferred_account_code  text not null check (btrim(deferred_account_code) <> ''),
  revenue_account_code   text not null check (btrim(revenue_account_code) <> ''),
  revenue_account_basis  text not null check (btrim(revenue_account_basis) <> ''),
  service_period_id      uuid references clara.document_service_periods(id),
  document_id            uuid,
  term_start             date not null,
  term_end               date not null,
  basis_kind             text not null check (basis_kind in ('human_stated', 'extracted')),
  period_lines           jsonb not null
                           check (jsonb_typeof(period_lines) = 'array'
                                  and jsonb_array_length(period_lines) >= 1),
  total_cents            bigint not null check (total_cents > 0),
  period_count           integer not null check (period_count >= 1),
  remainder_placement    text not null check (remainder_placement = 'final_period'),
  -- #941 — THE PATTERN, RECORDED RATHER THAN IMPLIED. Straight line is the only member today; a
  -- later file that adds one finds this column and this CHECK instead of a schedule whose pattern
  -- nobody wrote down.
  recognition_pattern    text not null default 'straight_line'
                           check (recognition_pattern = 'straight_line'),
  schedule_version       text not null check (btrim(schedule_version) <> ''),
  evaluator_version_id   uuid references clara.evaluator_versions(id),
  created_by             uuid not null references clara.users(id),
  created_at             timestamptz not null default now(),
  term_source            text not null,
  stated_term_id         uuid references clara.prepayment_stated_terms(id),
  constraint ck_revenue_recognition_schedules_lines
    check (jsonb_array_length(period_lines) = period_count),
  constraint ck_revenue_recognition_schedules_term check (term_end >= term_start),
  -- A ROW NAMES EXACTLY ONE TERM CARRIER AND CAN NEVER CLAIM A PROVENANCE IT CANNOT POINT AT —
  -- 0305's `ck_ps_term_source_carrier` verbatim, which is also what makes `term_source` safe to
  -- branch on in every read.
  constraint ck_rrs_term_source_carrier check (
    case term_source
      when 'document_service_period'
        then service_period_id is not null and document_id is not null and stated_term_id is null
      when 'human_stated'
        then stated_term_id is not null and service_period_id is null and document_id is null
      else false
    end),
  constraint fk_revenue_recognition_schedules_client
    foreign key (client_id, firm_id) references clara.clients(id, firm_id),
  constraint fk_revenue_recognition_schedules_document
    foreign key (document_id, firm_id) references clara.documents(id, firm_id),
  constraint fk_revenue_recognition_schedules_plan_kind
    foreign key (plan_id, plan_kind) references clara.accounting_plans(id, kind),
  constraint fk_revenue_recognition_schedules_revision
    foreign key (plan_id, revision, firm_id, client_id)
      references clara.accounting_plan_revisions(plan_id, revision, firm_id, client_id),
  constraint uq_revenue_recognition_schedules_plan unique (plan_id),
  constraint uq_revenue_recognition_schedules_source unique (source_entry_id)
);

create index if not exists ix_revenue_recognition_schedules_client
  on clara.revenue_recognition_schedules (client_id, created_at desc);

create or replace function clara._tf_revenue_recognition_schedules_append_only()
returns trigger language plpgsql security definer
set search_path = clara, pg_temp as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'a revenue recognition schedule is never deleted (end its plan, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"revenue_recognition_schedule_immutable","column":"*"}';
  end if;
  raise exception 'a revenue recognition schedule is a derived record and is never edited; a corrected term is a new schedule'
    using errcode='CLR08', detail='{"reason":"revenue_recognition_schedule_immutable"}';
end $fn$;

drop trigger if exists t_revenue_recognition_schedules_append_only
  on clara.revenue_recognition_schedules;
create trigger t_revenue_recognition_schedules_append_only
  before delete or update on clara.revenue_recognition_schedules
  for each row execute function clara._tf_revenue_recognition_schedules_append_only();
drop trigger if exists t_revenue_recognition_schedules_no_truncate
  on clara.revenue_recognition_schedules;
create trigger t_revenue_recognition_schedules_no_truncate
  before truncate on clara.revenue_recognition_schedules
  for each statement execute function clara._tf_no_truncate();

alter table clara.revenue_recognition_schedules enable row level security;
alter table clara.revenue_recognition_schedules force row level security;
drop policy if exists p_revenue_recognition_schedules_owner on clara.revenue_recognition_schedules;
create policy p_revenue_recognition_schedules_owner on clara.revenue_recognition_schedules
  for all to clara_fn_owner using (true) with check (true);
-- NO `revoke ... from public` HERE, and that is deliberate rather than an omission: a table
-- created by `clara_fn_owner` grants PUBLIC nothing, so its `relacl` stays NULL — which is exactly
-- 0223's posture for `clara.prepayment_schedules` (MEASURED: `relacl` is null there). A revoke
-- would MATERIALISE the owner's own entry and make the two relations' postures differ for no gain.
-- §TAIL censuses the ACL by grantee rather than by null, so either spelling is caught if a later
-- file ever grants one.

comment on table clara.revenue_recognition_schedules is
  'One derived recognition schedule per advance receipt: the straight-line allocation of a '
  'customer advance into revenue over its service period, riding a revenue_recognition_schedule '
  'accounting plan. Append-only and never edited -- a corrected term is a new schedule from the '
  'next period. #941.';

-- =====================================================================================
-- §D — clara._obo_plan_core — ONE PLAN STEP FOR EVERY ON-BEHALF LANE, AND WHY IT IS AN
-- EXTRACTION RATHER THAN A SECOND TWIN.
--
-- #915 wrote `clara._prepayment_plan_core` because `clara.create_accounting_plan` resolves its
-- actor through `clara._human_ctx` -> `clara.jwt_sub()`, and a `clara_runtime` connection carries
-- no `request.jwt.claims` at all: nesting it from an OBO door raises CLR04 `no authenticated
-- actor` on every call. #941's OBO twin meets the same wall, and its report names the drift a
-- second copy buys: `clara._accrual_plan_core` still resolves authority with 0222's own `exists`
-- probes while `clara.create_accounting_plan` was narrowed by #977/0250, so the accrual OBO lane
-- accepts an authority reference the human lane refuses.
--
-- So this file does to the PLAN STEP what #915 did to the SCHEDULE BODY: ONE body, the KIND as an
-- argument from a closed set, and `clara._prepayment_plan_core` kept at its exact signature as a
-- one-line delegation. Nothing about the amortisation lane's behaviour moves — the same plan row,
-- the same first revision, the same overlap warning and the SAME audit payload, whose `via` key
-- is derived from the kind so a reader still sees `create_prepayment_schedule_for` there.
--
-- UNGRANTED (the one-ungranted-core law): reachable only from a definer body.
-- =====================================================================================
create or replace function clara._obo_plan_core(
  p_kind text, p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_authority_kind text,
  p_authority_ref jsonb, p_frequency text, p_day_rule text, p_day_of_month integer,
  p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_reason text;
  v_warning jsonb; v_next jsonb; v_via text;
begin
  -- THE KIND IS A CLOSED SET, and an unknown one RAISES rather than writing a plan row the CHECK
  -- would refuse with a bare 23514. Unreachable from either caller (both pass a literal); a later
  -- lane that widens the set finds this line instead of a silent constraint violation.
  if p_kind is null or p_kind not in ('amortisation_schedule', 'revenue_recognition_schedule') then
    raise exception 'clara._obo_plan_core: unknown plan kind %', coalesce(p_kind, '(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind)::text;
  end if;
  v_via := case p_kind when 'amortisation_schedule' then 'create_prepayment_schedule_for'
                       else 'create_revenue_recognition_schedule_for' end;

  -- THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- RESOLVED, and on the CHAT-LANE arm a PERSON'S instruction rather than a task the estate
  -- enqueued for itself (#977, 0250). The chat entrance these doors open is exactly the caller
  -- that will supply `{kind:'chat_task', id: <this turn>}`, so this is the wall that stops a wake
  -- run or an autodraft from authorising its own schedule.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, p_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule,
    p_day_of_month, p_timezone, p_effective_from, p_effective_to, null);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, p_kind, 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, p_kind, 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, false,
      null, p_author)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, false,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  -- THE AUDIT ROW IS 0193'S OWN VERB with the entrance's `via`, exactly as 0222's core stamps its
  -- own: the audit trail says a plan was created and by WHICH entrance, and a reader can tell an
  -- OBO configuration from a human one without joining anything.
  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind,
      'revision', 1, 'authority', p_authority_ref, 'via', v_via));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind,
    'next_occurrences', coalesce(v_next,'[]'::jsonb), 'overlap_warning', v_warning);
end $fn$;

-- …AND #915'S OWN PLAN STEP, NOW A DELEGATION AT ITS EXACT SIGNATURE. Its callers (the shared
-- prepayment core's OBO branch) are untouched, and #915's own tail assertion — that it holds no
-- application grant and that the prepayment core carries both plan steps — stays true.
create or replace function clara._prepayment_plan_core(
  p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_authority_kind text,
  p_authority_ref jsonb, p_frequency text, p_day_rule text, p_day_of_month integer,
  p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- #941 — ONE BODY FOR EVERY OBO PLAN STEP. This wrapper exists so #915's signature, its ACL
  -- posture (none) and its call sites do not move; everything it did is now
  -- `clara._obo_plan_core` with the kind as its first argument.
  return clara._obo_plan_core('amortisation_schedule', p_firm, p_client, p_author, p_purpose,
    p_authority_kind, p_authority_ref, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_basis);
end $fn$;

-- =====================================================================================
-- §E — clara._revenue_recognition_core — THE ONE BODY BOTH ENTRANCES RUN.
--
-- #915's shape, for #915's reason: this ticket's acceptance asks for "an on-behalf twin door in
-- the shape of #915", and the only way a twin's refusal vocabulary can MATCH its human door for
-- every shared rule is for there to be one body. The human door keeps what only a human lane can
-- do (the op key, `clara._human_ctx(bookkeeper)`, the client ladder); the twin keeps its own four
-- walls; both hand on to this.
--
-- HOW IT DIFFERS FROM `clara._prepayment_schedule_core`, deliberately and in four places:
--
--  1. THE LEG. A prepayment is the ONE DEBITED ASSET line; an advance is the ONE CREDITED
--     LIABILITY line, MINUS any leg stamped `special_acc_type = 'sst_output'`. That exclusion is
--     the file header's accounting note made executable: output tax on an advance is owed to the
--     Royal Malaysian Customs Department, it is not revenue and it never becomes revenue, so it
--     is not a CANDIDATE at all. Removing an impossibility is not choosing between two legs —
--     zero or many REAL candidates is still refused, never guessed.
--  2. THE EVALUATOR SIDE. `clara.prepayment_schedule_v2(total, account, 'debit', start, end)`:
--     #939 put `release_side` in the signature for exactly this caller.
--  3. THE TARGET. An amortisation charge is an EXPENSE; a recognition credit is INCOME. Same
--     three arms (present / known / right class), same shared negative wall, same required
--     written basis, this lane's own tokens.
--  4. BOTH LANES ASK THE FITNESS ARMS HERE. The expense side has a `v1` evaluator that asks them
--     for the document lane; the revenue side has none, so this body asks them once for both term
--     carriers and branches only on WHERE THE TERM COMES FROM. That is fewer moving parts, and it
--     is why the document lane and the memo-only lane cannot answer differently about the leg.
-- =====================================================================================
create or replace function clara._revenue_recognition_core(
  p_firm uuid, p_client uuid, p_actor uuid, p_lane text, p_source_entry uuid,
  p_revenue_account text, p_revenue_basis text, p_purpose text, p_authority_ref jsonb,
  p_op_key text, p_pattern text)
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_deferred text; v_target text; v_basis_text text; v_pattern text;
  v_acct record; v_breach jsonb; v_entry record; v_existing uuid;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
  v_term_source text; v_sp_id uuid; v_st_id uuid; v_doc uuid;
  v_term_start date; v_term_end date; v_basis_kind text;
  v_legs int; v_leg record; v_fy record; v_period record; v_st record;
begin
  if p_lane is null or p_lane not in ('human', 'obo') then
    raise exception 'clara._revenue_recognition_core: unknown lane %', coalesce(p_lane, '(null)')
      using errcode='CLR10', detail='{"reason":"revenue_recognition_lane_unknown"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a revenue recognition schedule needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;

  -- ---- ONE PATTERN, AND ANYTHING ELSE IS A TYPED REFUSAL (owner decision 2, 2026-09-18). ----
  --
  -- Usage-based and milestone recognition need a MEASURE OF PROGRESS — units delivered, stages
  -- accepted — that this estate does not carry anywhere, and a database that guessed one would be
  -- choosing a number on a firm's behalf. So the argument exists, its set is closed, and a caller
  -- that asks for another pattern is told WHICH patterns exist rather than silently given the only
  -- one. Asked with the purpose, BEFORE the reservation: it is a shape check on the caller's own
  -- argument, like the purpose, and a reservation taken under a pattern the door cannot honour
  -- would replay a refusal.
  v_pattern := coalesce(nullif(btrim(coalesce(p_pattern, '')), ''), 'straight_line');
  if v_pattern <> 'straight_line' then
    raise exception 'this estate recognises deferred revenue on a straight line over whole calendar months; % is not offered', v_pattern
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recognition_pattern_unsupported',
          'pattern', v_pattern,
          'supported', jsonb_build_array('straight_line'),
          'reason_text','usage-based and milestone recognition need a measure of progress this estate does not record')::text;
  end if;

  -- ---- THE RESERVATION, TAKEN BEFORE THE DUPLICATE CHECK. ----
  --
  -- 0223's order and its reasoning: a caller whose response was lost retries with the SAME op key
  -- and must get the schedule it already created, not CLR13 `..._schedule_exists` — a lost
  -- response turned into a second question is the exact defect `_reserve_op` exists to prevent.
  --
  -- THE PAYLOAD HASH IS OVER THE CALLER'S OWN ARGUMENTS ONLY, never over the derived allocation:
  -- the key identifies the DECISION a human made, and the term, the period count and the
  -- allocation are OUTPUTS of that decision. The AUTHOR is deliberately NOT in the hash, which is
  -- what lets the human door and its OBO twin share one key space (#915's AC3).
  v_dedupe := clara._reserve_op(p_firm, 'create_revenue_recognition_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'revenue_account', nullif(btrim(coalesce(p_revenue_account,'')),''),
      'revenue_basis', nullif(btrim(coalesce(p_revenue_basis,'')),''),
      'purpose', btrim(p_purpose), 'authority', p_authority_ref, 'pattern', v_pattern)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this recognition-schedule key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- ONE SCHEDULE PER RECEIPT. `uq_revenue_recognition_schedules_source` is the structural
  -- backstop; this is the typed answer, and it names the schedule that already exists so the
  -- surface can send the caller there instead of offering a second configuration.
  select s.id into v_existing from clara.revenue_recognition_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm;
  if v_existing is not null then
    raise exception 'this advance is already recognised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','deferred_revenue_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- THE SOURCE. Read ONCE; absent and foreign answer with ONE refusal (the 0021 rule), so
  -- this door is not an existence oracle for another client's entries. ----
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;
  if v_entry.status <> 'approved' then
    raise exception 'a recognition schedule recognises a POSTED receipt; this one is %', v_entry.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','a recognition schedule recognises a POSTED receipt; this one is ' || v_entry.status,
          'axis','source_not_posted',
          'source_entry', p_source_entry, 'status', v_entry.status)::text;
  end if;

  -- ---- THE DEFERRED-REVENUE LEG: exactly one CREDITED LIABILITY line that is not the tax leg. ----
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.credit_cents > 0
     and ca.account_type = 'liability'
     and coalesce(ca.special_acc_type, '') <> 'sst_output';
  if v_legs <> 1 then
    raise exception '%', case when v_legs = 0 then 'the source entry credits no liability account that could hold deferred revenue'
                              else 'the source entry credits more than one liability account, so its deferred-revenue leg is ambiguous' end
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text', case when v_legs = 0 then 'the source entry credits no liability account that could hold deferred revenue'
                              else 'the source entry credits more than one liability account, so its deferred-revenue leg is ambiguous' end,
          'source_entry', p_source_entry, 'candidate_legs', v_legs)::text;
  end if;
  select jl.account_code, jl.credit_cents into v_leg
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.credit_cents > 0
     and ca.account_type = 'liability'
     and coalesce(ca.special_acc_type, '') <> 'sst_output';
  v_deferred := v_leg.account_code;

  -- ---- THE TERM. Two carriers, one shape, and the DOOR chooses between them by the one fact
  -- that decides it: whether the receipt binds a document. ----
  --
  -- THE 120-MONTH CAP IS THE CARRIERS' OWN. `ck_dsp_max_periods` and 0305's `ck_pst_max_periods`
  -- (the same expression verbatim) refuse a longer term at the recording door, and
  -- `clara.prepayment_schedule_v2` refuses one it is handed anyway with `term_too_long`. There is
  -- no third cap here; a cap computed a second way would be a second cap.
  if v_entry.document_id is not null then
    v_doc := v_entry.document_id;
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind into v_period
      from clara.document_service_periods sp
     where sp.document_id = v_doc and sp.superseded_at is null;
    if v_period.id is null then
      raise exception 'no live service period is recorded for the document this receipt binds'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
            'reason_text','no live service period is recorded for the document this receipt binds',
            'missing','document_service_periods',
            'remedy','clara.record_document_service_period',
            'document_id', v_doc, 'source_entry', p_source_entry)::text;
    end if;
    v_term_source := 'document_service_period';
    v_sp_id       := v_period.id;
    v_st_id       := null;
    v_term_start  := v_period.period_start;
    v_term_end    := v_period.period_end;
    v_basis_kind  := v_period.basis_kind;
  else
    select t.id, t.period_start, t.period_end into v_st
      from clara.prepayment_stated_terms t
     where t.source_entry_id = p_source_entry and t.superseded_at is null;
    if v_st.id is null then
      raise exception 'this receipt binds no document and nobody has stated its service period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
            'reason_text','this receipt binds no document and nobody has stated its service period',
            'missing','prepayment_stated_terms',
            'remedy','clara.record_prepayment_stated_term',
            'source_entry', p_source_entry)::text;
    end if;
    v_term_source := 'human_stated';
    v_sp_id       := null;
    v_doc         := null;
    v_st_id       := v_st.id;
    v_term_start  := v_st.period_start;
    v_term_end    := v_st.period_end;
    -- The carrier column keeps its meaning: a HUMAN said this, rather than an extraction having
    -- read it off a page. The stated-term lane has no 'extracted' arm at all.
    v_basis_kind  := 'human_stated';
  end if;

  -- ---- THE FISCAL-YEAR ARM, 0140's third, and a SELF-HEALABLE state rather than a dead end: the
  -- successor year can be opened and the call retried. ----
  select fy.id, fy.starts_on, fy.ends_on into v_fy
    from clara.fiscal_years fy
   where fy.client_id = p_client
     and v_entry.posting_date between fy.starts_on and fy.ends_on;
  if v_fy.id is null then
    raise exception 'the source entry does not sit inside any opened fiscal year for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'reason_text','the source entry does not sit inside any opened fiscal year for this client',
          'missing','fiscal_years','source_entry', p_source_entry)::text;
  end if;
  if v_term_end > v_fy.ends_on
     and not exists (select 1 from clara.fiscal_years nx
                      where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                        and nx.status in ('open', 'reopened')) then
    raise exception 'the service period runs past this fiscal year and no successor year is open yet'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_term_underivable',
          'reason_text','the service period runs past this fiscal year and no successor year is open yet',
          'missing','fiscal_years.successor','fy_ends_on', v_fy.ends_on,
          'period_end', v_term_end, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- #939'S FROZEN EVALUATOR, WITH THE RELEASE SIDE THIS LANE NEEDS. ----
  -- Reached as a DEFINER owned by its own owner role: it is a registered single-member
  -- `clara.evaluator_versions` closure AND a member of the rig's closed ungranted census, so
  -- minting a grant to reach it would red the rig and editing it would red the apply. Its
  -- refusals are RETURNED rather than raised, which is why they can be re-raised here with their
  -- own payloads intact, under this lane's own token.
  v_sched := clara.prepayment_schedule_v2(v_leg.credit_cents, v_deferred, 'debit',
    v_term_start, v_term_end);
  v_refusal := v_sched ->> 'refusal';
  if v_refusal is not null then
    raise exception '%', coalesce(v_sched ->> 'reason', 'this advance cannot be recognised')
      using errcode='CLR10',
        detail=(jsonb_build_object('reason', 'deferred_revenue_term_underivable',
                  'evaluator_refusal', v_refusal,
                  'reason_text', v_sched ->> 'reason')
                || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
  end if;

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;

  -- ---- #940'S ROSTER IS ASKED FIRST, AND THE SHARED WALL AFTERWARDS — the same order the
  -- prepayment core asks them in, for the same reason. ----
  --
  -- Every reason an account can NEVER be enrolled (unknown, inactive, control-class, bank-bound,
  -- reserved) is answered at the ENROLMENT door, where the person is deciding about the account.
  -- Here the person is recognising an advance, and the one useful answer is "this account is not
  -- on the roster; here is where to put it". An account that fails both is told about the roster.
  --
  -- THE PREDICATE IS THE ONE SPELLING #940 wrote, asked with THIS lane's purpose, so the band, the
  -- human door and the OBO twin can never drift about which accounts hold deferred revenue.
  --
  -- A SCHEDULE ALREADY RUNNING IS NEVER RE-CHECKED. This call is the only place a NEW schedule is
  -- born; nothing on the plan lane's monthly admission path asks the roster, so retiring an
  -- account closes the future and leaves the past recognising to term end.
  if not clara._prepayment_account_enrolled(p_client, v_deferred, 'deferred_revenue') then
    raise exception 'account % is not enrolled as a deferred-revenue account for this client', v_deferred
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','account ' || v_deferred || ' is not enrolled as a deferred-revenue account for this client',
          'axis','deferred_account_not_enrolled', 'deferred_account_code', v_deferred,
          'source_entry', p_source_entry,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;

  -- 0042'S SHARED NEGATIVE WALL on the deferred leg, shaped as a DEBIT because that is the side
  -- every period will actually post against this account. The roster is a POSITIVE statement made
  -- once; this is the estate's own eligibility rule asked at configuration time, so an account
  -- enrolled while eligible and bound as something else the next day is still caught.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_deferred,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % holds this receipt''s credited liability, and it cannot carry deferred revenue', v_deferred
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'axis','deferred_account_ineligible', 'deferred_account_code', v_deferred,
          'source_entry', p_source_entry, 'breach', v_breach)::text;
  end if;

  -- ---- THE REVENUE HALF. 0140's three arms, 0042's helper, this lane's tokens. ----
  v_target := nullif(btrim(coalesce(p_revenue_account, '')), '');
  if v_target is null then
    raise exception 'no revenue account was proposed for the recognition'
      using errcode='CLR10',
        detail='{"reason":"revenue_target_underivable","axis":"account_missing"}';
  end if;
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_target;
  if v_acct.account_code is null then
    raise exception 'this client''s chart holds no account %', v_target using errcode='CLR10',
      detail=jsonb_build_object('reason','revenue_target_ineligible','axis','account_unknown',
        'account_code', v_target)::text;
  end if;
  if v_acct.account_type <> 'income' then
    -- Recognising an advance CREDITS revenue. A balance-sheet target would move the liability
    -- sideways and never recognise anything, and an expense target would recognise it backwards.
    raise exception 'account % is a % account; recognising deferred revenue credits INCOME', v_target, v_acct.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','revenue_target_ineligible','axis','not_income_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type)::text;
  end if;
  -- THE SAME HELPER THE EXPENSE HALF USES, so a bank-class, control, inactive or role-reserved
  -- account refuses by the estate's OWN existing rule rather than a second one written here. The
  -- line is shaped as a CREDIT because that is the side every period posts against it.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % cannot carry a revenue recognition', v_target using errcode='CLR10',
      detail=(jsonb_build_object('reason','revenue_target_ineligible') || v_breach)::text;
  end if;
  v_basis_text := nullif(btrim(coalesce(p_revenue_basis, '')), '');
  if v_basis_text is null then
    -- A judgement with NO RECORDED BASIS is what this wall exists to prevent: refuse rather than
    -- record an unexplained classification.
    raise exception 'the revenue account was proposed without its stated grounds'
      using errcode='CLR10',
        detail='{"reason":"revenue_target_underivable","axis":"basis_missing"}';
  end if;

  -- ---- THE PAIRED ALLOCATION. The evaluator's line VERBATIM plus this lane's own pairing. ----
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'debit_cents')::bigint,
           'deferred_account_code', v_deferred, 'revenue_account_code', v_acct.account_code));
  end loop;

  -- ---- THE DERIVED CADENCE AND THE PROPOSAL. ----
  v_from := (v_lines -> 0 ->> 'period_end')::date;
  v_to   := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base := (v_lines -> 0 ->> 'debit_cents')::bigint;

  v_memo := 'Deferred revenue recognition: ' || btrim(p_purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_deferred, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'deferred revenue released'),
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'revenue recognised')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    -- ONE CENT OVER TWO MONTHS truncates to a base of 0, so the first period's derived basis moves
    -- no money and the shared predicate refuses it. That raw refusal is correct but not
    -- actionable, so it becomes this lane's typed rung — carrying the predicate's OWN constraint
    -- and naming it as the owner, so a reader can see this door routed through it rather than
    -- inventing a second check.
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'this service period recognises nothing in at least one period: % cents over % periods truncates to a base of 0', v_total, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','deferred_revenue_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PLAN, through 0193's OWN door on the human lane and `clara._obo_plan_core` on the
  -- machine one, for the reason §D states: `clara.create_accounting_plan` resolves its actor from
  -- a JWT a runtime connection does not have. ----
  if p_lane = 'human' then
    v_plan := clara.create_accounting_plan(
      p_client => p_client, p_kind => 'revenue_recognition_schedule',
      p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  else
    v_plan := clara._obo_plan_core(
      p_kind => 'revenue_recognition_schedule',
      p_firm => p_firm, p_client => p_client, p_author => p_actor, p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis);
  end if;
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1: the plan row is the lane's first rung, and a writer that took the schedule
  -- row first would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  -- THE EVALUATOR VERSION ROW THIS SCHEDULE ACTUALLY RODE, resolved by the entrypoint signature
  -- rather than by a literal.
  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
   order by e.version desc limit 1;

  -- THE STRUCTURAL BACKSTOP ANSWERS IN THE LANE'S OWN WORDS. The typed duplicate check above
  -- cannot see a WINNER THAT HAS NOT COMMITTED: two people recognising the same receipt at once
  -- both pass it, and the loser queues on `uq_revenue_recognition_schedules_source` until the
  -- winner commits. Without this block that loser would be answered a bare 23505, a sentence with
  -- no next act. The index is still the authority; this only re-reads the winning row and
  -- re-raises the SAME CLR13 payload the pre-check raises, so both paths are one answer.
  begin
    insert into clara.revenue_recognition_schedules(firm_id, client_id, plan_id, plan_kind,
        revision, source_entry_id, deferred_account_code, revenue_account_code,
        revenue_account_basis, service_period_id, document_id, term_start, term_end, basis_kind,
        period_lines, total_cents, period_count, remainder_placement, recognition_pattern,
        schedule_version, evaluator_version_id, created_by, term_source, stated_term_id)
      values (p_firm, p_client, v_plan_id, 'revenue_recognition_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_deferred, v_acct.account_code,
        v_basis_text, v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        v_pattern, coalesce(v_sched ->> 'schedule_version', 'v2'), v_eval, p_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    select s.id into v_existing from clara.revenue_recognition_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = p_firm;
    raise exception 'this advance is already recognised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','deferred_revenue_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(p_firm, p_actor, null, null, 'create_revenue_recognition_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_sp_id,
      'term_source', v_term_source, 'stated_term', v_st_id,
      'deferred_account', v_deferred, 'revenue_account', v_acct.account_code,
      'periods', v_n, 'total_cents', v_total, 'pattern', v_pattern,
      'lane', p_lane, 'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'revenue_recognition_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'basis_kind', v_basis_kind,
    'term_source', v_term_source, 'stated_term_id', v_st_id,
    'term_start', to_char(v_term_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_term_end, 'YYYY-MM-DD'),
    'deferred_account_code', v_deferred, 'revenue_account_code', v_acct.account_code,
    'revenue_account_basis', v_basis_text,
    'total_cents', v_total, 'period_count', v_n,
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'recognition_pattern', v_pattern,
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v2'),
    'period_lines', v_paired,
    -- THE DERIVED CADENCE, echoed so the caller can SEE that none of it was theirs to choose.
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    -- THE BOUNDARY, IN THE DOOR'S OWN ANSWER: accepted configuration is not a posted occurrence.
    'configuration_only', true);
  return clara._finish_op(p_firm, 'create_revenue_recognition_schedule', p_op_key, v_result);
end $fn$;

-- …AND THE HUMAN ENTRANCE. It keeps only what a human lane alone can do — the op key, the
-- bookkeeper floor read from the JWT, the client ladder — and hands everything else to the core.
create or replace function clara.create_revenue_recognition_schedule(
  p_client uuid, p_source_entry uuid, p_revenue_account text, p_revenue_basis text,
  p_purpose text, p_authority_ref jsonb, p_op_key text,
  p_pattern text default 'straight_line')
returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
begin
  -- #941 — the human entrance of the recognition door. The body it runs is
  -- `clara._revenue_recognition_core`, shared with the OBO twin.
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'configuring a revenue recognition schedule requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('bookkeeper')) a;
  select c.firm_id, c.status into v_client_firm, v_client_status
    from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new revenue recognition schedule'
      using errcode='CLR10', detail='{"reason":"client_inactive"}';
  end if;
  return clara._revenue_recognition_core(v_firm, p_client, v_actor, 'human', p_source_entry,
    p_revenue_account, p_revenue_basis, p_purpose, p_authority_ref, p_op_key, p_pattern);
end $fn$;

-- =====================================================================================
-- §F — THE MONTHLY ADMISSION ARM: the mirror of the amortisation one, and nothing else moves.
--
-- `clara._plan_admit_occurrence` is the ONE body that turns a due date into an
-- `clara.accounting_work`, and #653 taught it that an amortisation revision's stored basis carries
-- ONE period's lines while every OTHER period posts its own amount. A recognition schedule has
-- exactly the same shape and exactly the same hazard, so it gets exactly the same arm:
--
--   · a per-plan, per-due-date lookup that returns the resolved line (or NULL);
--   · NULL recorded on the occurrence as a typed refusal rather than raised, so it is legible in
--     the plan's own history and the SAME row becomes admissible if a schedule later covers the
--     date — never allowed to fall back to the revision's constant, which would post the first
--     period's amount for every period of the term.
--
-- THE LINES THE OCCURRENCE POSTS ARE BUILT IN THE LOOKUP, not in the shared basis body, so
-- `clara._plan_occurrence_basis` stays a generic "use these lines instead" seam with no
-- amortisation and no recognition vocabulary in it. It is pinned unchanged at both ends of this
-- file, which is the evidence for that sentence.
--
-- THE DIRECTION IS THE MIRROR: Dr the deferred-revenue liability, Cr the revenue account. Nothing
-- in this arm can reach the tax leg — the schedule row names two accounts and the SST account is
-- neither of them.
-- =====================================================================================
create or replace function clara._plan_revenue_recognition_period_line(p_plan uuid, p_due date)
returns jsonb language sql stable security definer
set search_path = clara, pg_temp as $fn$
  select jsonb_build_object(
           'schedule_id', s.id,
           'period_start', l ->> 'period_start',
           'period_end', l ->> 'period_end',
           -- #939's evaluator releases a LIABILITY by DEBIT, so the period's amount is on the
           -- debit side of its own line — the mirror of the amortisation lookup's `credit_cents`.
           'amount_cents', (l ->> 'debit_cents')::bigint,
           'deferred_account_code', s.deferred_account_code,
           'revenue_account_code', s.revenue_account_code,
           'lines', jsonb_build_array(
             jsonb_build_object('account_code', s.deferred_account_code,
               'debit_cents', (l ->> 'debit_cents')::bigint, 'credit_cents', 0,
               'description', 'deferred revenue released ' || (l ->> 'period_start') || ' to ' || (l ->> 'period_end')),
             jsonb_build_object('account_code', s.revenue_account_code,
               'debit_cents', 0, 'credit_cents', (l ->> 'debit_cents')::bigint,
               'description', 'revenue recognised ' || (l ->> 'period_start') || ' to ' || (l ->> 'period_end'))))
    from clara.revenue_recognition_schedules s
    cross join lateral jsonb_array_elements(s.period_lines) l
   where s.plan_id = p_plan and (l ->> 'period_end')::date = p_due
   limit 1;
$fn$;

create or replace function clara._plan_admit_occurrence(
  p_plan uuid, p_due date, p_leg text, p_model text, p_allow_reattempt boolean default false)
returns jsonb language plpgsql security definer
set search_path = clara, pg_temp as $fn$
declare
  p record; r record; o record; v_existing boolean := false;
  v_basis jsonb; v_intent text; v_answer jsonb; v_occ uuid;
  v_client_status text; v_detail text; v_reason text;
  v_code text; v_message text; v_outcome jsonb;
  v_period date; v_primary_due date; v_ceiling date; v_attempt int := 1;
  v_old_work uuid; v_old_status text; v_reattempt boolean := false;
  v_primary_entry uuid; v_primary_state text;
  v_line jsonb; v_line_missing boolean := false;  -- #653
  v_line_reason text; v_line_message text;        -- #941
begin
  -- RUNG 1.
  select * into p from clara.accounting_plans where id = p_plan for update;
  if not found then
    return jsonb_build_object('admitted', false, 'reason', 'plan_not_found');
  end if;
  if p.status <> 'active' then
    return jsonb_build_object('admitted', false, 'plan_id', p.id,
      'reason', case p.status when 'paused' then 'plan_paused' else 'plan_ended' end);
  end if;

  select c.status into v_client_status from clara.clients c
   where c.id = p.client_id and c.firm_id = p.firm_id;
  if v_client_status is distinct from 'active' then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'client_inactive');
  end if;

  select * into r from clara.accounting_plan_revisions
   where plan_id = p.id and superseded_at is null;
  if not found then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'no_live_revision');
  end if;
  -- The authority window, re-asserted at the moment of admission rather than trusted from the
  -- caller's arithmetic. A future schedule never authorises a historical run and an ended window
  -- never authorises a later one — EXCEPT that a reversing plan's ceiling reaches the reversal of
  -- its last accrual (review finding S6), because an authority that ends on the last accrual must
  -- still let that accrual be undone.
  v_ceiling := case when p_leg = 'reversal'
                    then clara._plan_window_ceiling(r.effective_to, r.auto_reverse)
                    else coalesce(r.effective_to, 'infinity'::date) end;
  if p_due < r.effective_from or p_due > v_ceiling then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'outside_authority_window',
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
      'leg_ceiling', case when v_ceiling = 'infinity'::date then null else to_char(v_ceiling,'YYYY-MM-DD') end);
  end if;
  -- THE DUE GATE, on the house legal date. A plan due TOMORROW in Kuala Lumpur is not admitted
  -- today, whatever zone the session opened in.
  if p_due > clara._book_today() then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'not_yet_due',
      'due_date', to_char(p_due,'YYYY-MM-DD'));
  end if;

  -- CONVERGENCE. The occurrence row is the identity of the due event; a second scan reads it
  -- instead of making a second one, and answers with the SAME work id.
  select * into o from clara.accounting_plan_occurrences
   where plan_id = p.id and due_date = p_due;
  -- FOUND is captured NOW rather than re-read below: plpgsql resets it on every SQL-bearing
  -- statement, and the second test is several statements away.
  v_existing := found;
  v_period := clara._plan_occurrence_period_key(p.authority_from, r.effective_from, r.frequency,
                r.day_rule, r.day_of_month, p_due, p_leg);

  if v_existing and o.work_id is not null then
    -- A RE-ATTEMPT IS THE ONE EXIT FROM CONVERGENCE (review finding S7), and only a human's
    -- catch-up may ask for it: a Work the human CANCELLED, or one that FAILED, posted nothing and
    -- leaves the period owed. A COMPLETED Work, or any Work carrying a committed receipt, converges
    -- as before — money is on the books.
    v_old_work := o.work_id;
    select w.status into v_old_status from clara.accounting_work w where w.id = v_old_work;
    v_reattempt := p_allow_reattempt
      and v_old_status in ('cancelled','failed')
      and not exists (select 1 from clara.operation_receipts rc
                       where rc.work_id = v_old_work and rc.outcome = 'committed');
    if not v_reattempt then
      return jsonb_build_object('admitted', false, 'converged', true, 'plan_id', p.id,
        'occurrence_id', o.id, 'work_id', o.work_id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'),
        'leg', o.leg, 'revision', o.revision, 'intent_key', o.intent_key, 'outcome', o.outcome);
    end if;
    v_attempt := o.attempt + 1;
  end if;

  -- ONE PERIOD, ONE LEG, ONE OCCURRENCE (review finding B1). A revision that moves the due day
  -- names a NEW date for a period that already ran, and admitting it would post a second entry for
  -- one period. Refused BEFORE any row is written, because a second row for the same period is not
  -- a due event to record — it is the same event under a different spelling.
  if not v_existing and exists (
        select 1 from clara.accounting_plan_occurrences o2
         where o2.plan_id = p.id and o2.leg = p_leg and o2.period_key = v_period) then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'period_already_admitted',
      'code', 'CLR13', 'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg,
      'period_key', to_char(v_period,'YYYY-MM-DD'),
      'occurrence_id', (select o2.id from clara.accounting_plan_occurrences o2
                         where o2.plan_id = p.id and o2.leg = p_leg and o2.period_key = v_period
                         limit 1));
  end if;

  -- THE ENTRY A REVERSAL WOULD UNDO, measured HERE — under the plan row lock, in the same
  -- statement sequence that writes the occurrence — rather than inherited from the picker's
  -- unlocked choice (review round 2, BLOCKER-1).
  if p_leg = 'reversal' then
    v_primary_due := clara._plan_primary_for_reversal(r.effective_from, r.frequency, r.day_rule,
                       r.day_of_month, p_due);
    if v_primary_due is not null then
      v_primary_entry := clara._plan_primary_entry(p.id, v_primary_due);
    end if;
  end if;
  -- #653 - THE PER-PERIOD BASIS. An amortisation revision's stored basis carries ONE period's
  -- lines; every OTHER period posts its own amount, and the FINAL period posts the base plus
  -- the whole remainder. The resolved line is looked up HERE, in a VOLATILE body that may read
  -- a table, and handed to `clara._plan_occurrence_basis` as an ARGUMENT - which is exactly
  -- what lets that body stay IMMUTABLE. NULL is a real answer and is refused below BY NAME,
  -- never allowed to fall back to the revision's constant (which would post the first period's
  -- amount for every period of the term).
  --
  -- #941 - THE SAME ARM FOR THE REVENUE SIDE, with its own lookup and its own typed reason: an
  -- operator reading "this amortisation schedule has no period line" beside a deferred-revenue
  -- plan would be reading about the wrong half of the books.
  if p.kind = 'amortisation_schedule' then
    v_line := clara._plan_amortisation_period_line(p.id, p_due);
    v_line_missing := (v_line is null);
    v_line_reason  := 'amortisation_period_line_missing';
    v_line_message := 'this amortisation schedule has no period line ending on this due date';
  elsif p.kind = 'revenue_recognition_schedule' then
    v_line := clara._plan_revenue_recognition_period_line(p.id, p_due);
    v_line_missing := (v_line is null);
    v_line_reason  := 'revenue_recognition_period_line_missing';
    v_line_message := 'this recognition schedule has no period line ending on this due date';
  end if;
  v_basis := clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry, v_line);
  v_intent := 'plan:' || p.id::text || ':r' || r.revision::text || ':' || to_char(p_due,'YYYY-MM-DD')
              || case when v_attempt > 1 then ':a' || v_attempt::text else '' end;

  if v_existing then
    -- A previously REFUSED occurrence, or a cancelled/failed one being re-attempted. The identity
    -- stays; the revision, the key and the attempt move to what this admission actually runs under,
    -- which is the whole of review finding S5 — a row printing `r1` beside a Work admitted under
    -- `r2` was a record of something that did not happen.
    --
    -- A RE-ATTEMPT WRITES THEM WITH THE NEW WORK, IN ONE STATEMENT (below), because the row still
    -- names the cancelled Work at this point and the identity trigger admits those three columns
    -- moving only alongside a lawful `work_id` move.
    v_occ := o.id;
    if not v_reattempt then
      update clara.accounting_plan_occurrences
         set revision = r.revision, intent_key = v_intent, attempt = v_attempt
       where id = v_occ;
    end if;
  else
    insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
        due_date, period_key, attempt, intent_key, outcome)
      values (p.firm_id, p.client_id, p.id, r.revision, p_leg, p_due, v_period, v_attempt, v_intent,
        jsonb_build_object('state','pending','at', now()))
      returning id into v_occ;
  end if;

  -- #653 - THE MISSING PERIOD LINE. Recorded on the occurrence rather than raised, exactly as
  -- the orphan wall below is: the refusal is legible in the plan's own history, nothing is
  -- admitted, and the SAME row becomes admissible if a schedule later covers the date. A
  -- corrected term does NOT re-derive an existing schedule, so this is the typed way a due date
  -- outside the derived allocation answers.
  if v_line_missing then
    v_outcome := jsonb_build_object('state','refused','code','CLR10',
      'reason', v_line_reason,
      'message', v_line_message,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', v_line_reason, 'code', 'CLR10');
  end if;

  -- THE ORPHAN WALL (review finding B2, recut on BLOCKER-1's law). A reversal exists to undo its
  -- OWN period's accrual, so admitting one with no POSTED accrual behind it would put a
  -- swapped-sides entry in the ledger reversing nothing. `clara._plan_admissible_event` never
  -- surfaces such an event, and this is the same wall for the path a HUMAN can reach: a catch-up
  -- window naming only the reversal day. Recorded on the occurrence rather than raised, so it is
  -- legible in the history — and the SAME row becomes admissible once the accrual posts.
  --
  -- `primary_state` NAMES WHICH OF THE THREE WAYS the accrual fails to stand behind it, because
  -- "no occurrence at all", "admitted but nothing posted yet" and "posted and since reversed" are
  -- three different facts about the books and the operator's next move differs for each.
  if p_leg = 'reversal' and v_primary_entry is null then
    v_primary_state := case
      when v_primary_due is null then 'no_schedule'
      when not exists (select 1 from clara.accounting_plan_occurrences o2
                        where o2.plan_id = p.id and o2.due_date = v_primary_due
                          and o2.leg = 'primary' and o2.work_id is not null) then 'no_occurrence'
      when not exists (select 1 from clara.accounting_plan_occurrences o2
                        join clara.operation_receipts rc on rc.work_id = o2.work_id
                                                        and rc.outcome = 'committed'
                        where o2.plan_id = p.id and o2.due_date = v_primary_due
                          and o2.leg = 'primary') then 'not_posted'
      else 'entry_not_live' end;
    v_outcome := jsonb_build_object('state','refused','code','CLR13',
      'reason','reversal_before_primary',
      'message','this reversal has no posted accrual behind it to reverse',
      'primary_state', v_primary_state,
      'primary_due_date', case when v_primary_due is null then null
                               else to_char(v_primary_due,'YYYY-MM-DD') end,
      'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', 'reversal_before_primary', 'code', 'CLR13', 'primary_state', v_primary_state,
      'primary_due_date', case when v_primary_due is null then null
                               else to_char(v_primary_due,'YYYY-MM-DD') end);
  end if;

  begin
    -- RUNG 2. 0178's OWN door, with the plan's authorising human as the author: it rechecks
    -- membership, activity, role rank and client status, and it is idempotent on
    -- (firm, client, intent_key) — so a replay of this whole body returns the same Work.
    v_answer := clara.admit_journal_work(p.client_id, p.authorised_by, v_intent, v_basis,
                  'user_direct', '[]'::jsonb, p_model);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_message = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
    exception when others then
      v_reason := null;
    end;
    v_outcome := jsonb_build_object('state','refused','code', v_code, 'reason',
                   coalesce(v_reason,'unclassified'), 'message', v_message, 'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', coalesce(v_reason,'unclassified'), 'code', v_code, 'message', v_message);
  end;

  v_outcome := jsonb_build_object('state','admitted',
                 'logical_op_id', v_answer->>'logical_op_id',
                 'replayed', coalesce((v_answer->>'replayed')::boolean, false), 'at', now());
  -- ONE STATEMENT: the Work, the entry it reverses, and the attempt appended to the occurrence's
  -- own append-only ledger (review finding SHOULD-2) — so the superseded attempt of an S7
  -- re-admission stays reachable from the plan instead of surviving only in clara.audit_log.
  update clara.accounting_plan_occurrences
     set work_id = (v_answer->>'work_id')::uuid, admitted_at = now(), outcome = v_outcome,
         revision = r.revision, intent_key = v_intent, attempt = v_attempt,
         reverses_entry_id = v_primary_entry,
         attempts = attempts || jsonb_build_array(jsonb_build_object(
           'attempt', v_attempt, 'work_id', v_answer->>'work_id', 'intent_key', v_intent,
           'revision', r.revision, 'admitted_at', now()))
   where id = v_occ;

  perform clara._audit(p.firm_id, p.authorised_by, null, null, 'plan_occurrence_admitted', null,
    jsonb_build_object('plan', p.id, 'occurrence', v_occ, 'work', v_answer->>'work_id',
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'intent_key', v_intent));

  return jsonb_build_object('admitted', true, 'plan_id', p.id, 'occurrence_id', v_occ,
    'work_id', v_answer->>'work_id', 'task_id', v_answer->>'task_id',
    'logical_op_id', v_answer->>'logical_op_id',
    'replayed', coalesce((v_answer->>'replayed')::boolean, false),
    'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
    'attempt', v_attempt, 'period_key', to_char(v_period,'YYYY-MM-DD'),
    'reverses_entry_id', v_primary_entry,
    'intent_key', v_intent);
end $fn$;

-- …AND THE PREVIEW, so a recognition plan shows each period's own amount rather than the
-- revision's constant. 0193's body with ONE `case` arm added; the amortisation arm is untouched.
create or replace function clara.preview_accounting_plan(p_plan uuid, p_count integer)
returns jsonb language plpgsql stable security definer
set search_path = clara, pg_temp as $fn$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; r record;
  v_count int; v_after date; v_start date; v_end date; v_step int; v_rows jsonb;
begin
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('viewer')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  select * into r from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    return jsonb_build_object('plan_id', p_plan, 'status', p.status, 'occurrences', '[]'::jsonb,
      'reason', 'no_live_revision');
  end if;
  v_count := least(greatest(coalesce(p_count, 3), 1), 24);
  select max(o.due_date) into v_after from clara.accounting_plan_occurrences o where o.plan_id = p_plan;
  v_start := greatest(r.effective_from, coalesce(v_after + 1, r.effective_from));
  v_step := case r.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  v_end := (date_trunc('month', v_start::timestamp)
            + (((v_count + 2) * v_step) * interval '1 month')
            + interval '1 month' - interval '1 day')::date;
  -- The leg-aware ceiling, so a reversing plan's final reversal appears in the preview too.
  if r.effective_to is not null then
    v_end := least(v_end, clara._plan_window_ceiling(r.effective_to, r.auto_reverse));
  end if;
  -- #653 - AN AMORTISATION PREVIEW SHOWS EACH PERIOD'S OWN AMOUNT rather than the revision's
  -- constant, and projects the resolved line beside the basis so a surface can render the
  -- allocation without re-deriving it. Both lookups are STABLE and this body already is, so the
  -- second arm changes nothing about this function's own volatility class.
  --
  -- #941 - THE RECOGNITION ARM. Without it a deferred-revenue plan previewed every period at the
  -- FIRST period's amount, which is the same silent defect #653 met on the expense side.
  select coalesce(jsonb_agg(jsonb_build_object(
           'due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg,
           'period_line', x.line,
           'basis', clara._plan_occurrence_basis(r.basis, e.due_date, e.leg, null, x.line))
         order by e.due_date), '[]'::jsonb) into v_rows
    from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule, r.day_of_month,
           r.auto_reverse, v_start, v_end, v_count) e
    cross join lateral (select case p.kind
                                 when 'amortisation_schedule'
                                   then clara._plan_amortisation_period_line(p_plan, e.due_date)
                                 when 'revenue_recognition_schedule'
                                   then clara._plan_revenue_recognition_period_line(p_plan, e.due_date)
                                 else null end as line) x;
  return jsonb_build_object('plan_id', p_plan, 'status', p.status, 'revision', r.revision,
    'timezone', r.timezone, 'today', to_char(clara._book_today(),'YYYY-MM-DD'),
    'from_date', to_char(v_start,'YYYY-MM-DD'),
    -- A PAUSED plan still previews its schedule, and says the schedule is not being admitted. An
    -- empty preview would read as "there is nothing scheduled", which is a different fact.
    'admitting', (p.status = 'active'), 'occurrences', v_rows);
end $fn$;

reset role;

-- =====================================================================================
-- §G — GRANTS. A new function is created with EXECUTE to PUBLIC, so every one of them is revoked
-- first and then granted to the ONE principal that may reach it. The two cores are granted to
-- NOBODY (the one-ungranted-core law): they are reached from a definer body only.
-- =====================================================================================
revoke all on function clara._obo_plan_core(
  text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb) from public;
revoke all on function clara._revenue_recognition_core(
  uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text) from public;
revoke all on function clara._tf_revenue_recognition_schedules_append_only() from public;
revoke all on function clara._plan_revenue_recognition_period_line(uuid,date) from public;
revoke all on function clara.create_revenue_recognition_schedule(
  uuid,uuid,text,text,text,jsonb,text,text) from public;
grant execute on function clara.create_revenue_recognition_schedule(
  uuid,uuid,text,text,text,jsonb,text,text) to clara_authenticated;

-- =====================================================================================
-- §TAIL — what a reader may rely on after this file, re-measured on the live catalog.
-- =====================================================================================
do $t941_tail$
declare
  v_sha text; v_src text; v_n int; v_sig text; v_role text; v_names text;
  v_keep text[][] := array[
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     'acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa'],
    ['clara._authority_ref_refusal(text,uuid,uuid,uuid)',
     'c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7'],
    ['clara._assert_journal_basis(jsonb)',
     '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684'],
    ['clara.prepayment_schedule_v1(uuid,uuid)',
     'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2'],
    ['clara._plan_amortisation_period_line(uuid,date)',
     '88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c'],
    ['clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)',
     'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e']
  ];
  -- The functions this file owns, with the volatility each one claims.
  v_expect text[][] := array[
    ['clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)', 'v'],
    ['clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)', 'v'],
    ['clara.create_revenue_recognition_schedule(uuid,uuid,text,text,text,jsonb,text,text)', 'v'],
    ['clara._plan_revenue_recognition_period_line(uuid,date)', 's']
  ];
begin
  -- 0 · THE PLAN KIND IS WIDENED IN BOTH PLACES, ADDITIVELY. The three older kinds keep their
  --     exact spelling; a fourth is admitted; nothing else moved.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.accounting_plans'::regclass
                    and conname = 'accounting_plans_kind_check'
                    and pg_get_constraintdef(oid) like '%revenue_recognition_schedule%'
                    and pg_get_constraintdef(oid) like '%recurring_journal%'
                    and pg_get_constraintdef(oid) like '%reversing_journal%'
                    and pg_get_constraintdef(oid) like '%amortisation_schedule%') then
    raise exception '#941 tail: accounting_plans_kind_check does not admit all four kinds'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'::regprocedure;
  if position('revenue_recognition_schedule' in v_src) = 0
     or position('plan_kind_unsupported' in v_src) = 0 then
    raise exception '#941 tail: clara.create_accounting_plan does not admit the new kind, or lost its typed refusal'
      using errcode='CLR10';
  end if;
  -- …AND THE PREPAYMENT RELATION'S OWN kind CHECK IS UNTOUCHED: its rows are amortisation
  --    schedules and stay so.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.prepayment_schedules'::regclass
                    and conname = 'prepayment_schedules_plan_kind_check'
                    and pg_get_constraintdef(oid) not like '%revenue_recognition%') then
    raise exception '#941 tail: the prepayment relation''s plan_kind CHECK moved' using errcode='CLR10';
  end if;
  -- …and the derived-cadence wall covers BOTH schedule kinds.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)'::regprocedure;
  if position('p_kind = ''amortisation_schedule''' in v_src) = 0
     or position('p_kind = ''revenue_recognition_schedule''' in v_src) = 0 then
    raise exception '#941 tail: the derived-cadence wall does not cover both schedule kinds'
      using errcode='CLR10';
  end if;
  -- 1 · THE ENROLMENT DOOR KEEPS ITS POSTURE AND ITS ACL. This file widens a RULE, never a grant.
  v_sig := 'clara.enrol_prepayment_account(uuid,text,text,text,text)';
  if not exists (select 1 from pg_proc p
                  where p.oid = v_sig::regprocedure
                    and pg_get_userbyid(p.proowner) = 'clara_fn_owner' and p.prosecdef
                    and p.provolatile = 'v'
                    and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=clara, pg_temp') then
    raise exception '#941 tail: %''s owner/definer/volatility/search_path posture is wrong', v_sig
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
    raise exception '#941 tail: clara_authenticated lost the enrolment door' using errcode='CLR10';
  end if;
  foreach v_src in array array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                               'clara_wake_proactive','public'] loop
    if has_function_privilege(v_src, v_sig::regprocedure, 'execute') then
      raise exception '#941 tail: % can execute % -- enrolment is a human judgement with no machine lane',
        v_src, v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE RULE IS LIVE: the door no longer refuses the second purpose by name, and it carries
  --     BOTH per-purpose axes. Asserted on the body's own text, because the behavioural proof is
  --     the battery's and this is the apply-time statement that the extraction landed.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  if position('purpose_rule_not_stated' in v_src) > 0 then
    raise exception '#941 tail: the enrolment door still refuses deferred_revenue as a purpose with no rule'
      using errcode='CLR10';
  end if;
  if position('not_liability_class' in v_src) = 0 or position('not_asset_class' in v_src) = 0 then
    raise exception '#941 tail: the enrolment door does not carry BOTH per-purpose account-type axes'
      using errcode='CLR10';
  end if;
  if position('clara._adj_line_eligibility_breach(p_client' in v_src) = 0 then
    raise exception '#941 tail: the enrolment door lost 0042''s shared negative wall' using errcode='CLR10';
  end if;

  -- 3 · NO WAKE WRAPPER AND NO SECOND ENROLMENT DOOR, by census rather than by convention.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname ~ 'enrol_prepayment_account';
  if v_n <> 1 then
    raise exception '#941 tail: expected exactly ONE enrolment door, found %', v_n using errcode='CLR10';
  end if;

  -- 3a · THE DERIVED RELATION EXISTS WITH 0223'S OWN POSTURE: no application ACL at all, forced
  --      RLS, an owner-only policy, and the append-only trigger pair. A relation reachable by a
  --      plain PostgREST read would be a second path around every door in this file.
  if to_regclass('clara.revenue_recognition_schedules') is null then
    raise exception '#941 tail: clara.revenue_recognition_schedules does not exist' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'clara' and c.relname = 'revenue_recognition_schedules'
                    and c.relrowsecurity and c.relforcerowsecurity
                    and pg_get_userbyid(c.relowner) = 'clara_fn_owner') then
    raise exception '#941 tail: clara.revenue_recognition_schedules'' owner/RLS posture is wrong -- got {%}',
      (select coalesce(pg_get_userbyid(c.relowner),'?') || ' | ' || c.relrowsecurity::text || ' | '
              || c.relforcerowsecurity::text
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'clara' and c.relname = 'revenue_recognition_schedules')
      using errcode='CLR10';
  end if;
  -- …AND NO APPLICATION ROLE HOLDS A PRIVILEGE ON IT AT ALL, censused by GRANTEE rather than by a
  -- null `relacl`: every reach is a definer door, so a plain PostgREST table read must 42501.
  select count(*)::int into v_n
    from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   where c.oid = 'clara.revenue_recognition_schedules'::regclass
     and pg_get_userbyid(a.grantee) <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '#941 tail: clara.revenue_recognition_schedules holds % application grant(s)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.revenue_recognition_schedules'::regclass and not tgisinternal;
  if v_n <> 2 then
    raise exception '#941 tail: expected the append-only and no-truncate trigger pair, found %', v_n
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['uq_revenue_recognition_schedules_plan',
                               'uq_revenue_recognition_schedules_source',
                               'ck_rrs_term_source_carrier',
                               'fk_revenue_recognition_schedules_client',
                               'fk_revenue_recognition_schedules_plan_kind'] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'clara.revenue_recognition_schedules'::regclass
                      and conname = v_sig) then
      raise exception '#941 tail: clara.revenue_recognition_schedules is missing %', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 3b · THE FUNCTIONS THIS FILE OWNS EXIST AT THEIR EXACT SIGNATURES, with this estate's posture.
  for v_n in 1 .. array_length(v_expect, 1) loop
    v_sig := v_expect[v_n][1];
    if to_regprocedure(v_sig) is null then
      raise exception '#941 tail: % does not resolve at its exact signature', v_sig using errcode='CLR10';
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = v_sig::regprocedure
                      and pg_get_userbyid(p.proowner) = 'clara_fn_owner' and p.prosecdef
                      and p.provolatile = v_expect[v_n][2]
                      and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=clara, pg_temp') then
      raise exception '#941 tail: %''s owner/definer/volatility/search_path posture is wrong', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 3c · THE TWO CORES HOLD NO APPLICATION GRANT AT ALL (the one-ungranted-core law).
  foreach v_sig in array array[
      'clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
      'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'] loop
    select count(*)::int into v_n from pg_proc p,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = v_sig::regprocedure and pg_get_userbyid(a.grantee) <> 'clara_fn_owner';
    if v_n <> 0 then
      raise exception '#941 tail: % holds % application grant(s) -- it is reached from a definer body only',
        v_sig, v_n using errcode='CLR10';
    end if;
  end loop;

  -- 3d · THE HUMAN DOOR IS `clara_authenticated` AND NOTHING ELSE, and it carries the bookkeeper
  --      floor read from the JWT. A machine principal on the human door would be a configuration
  --      with no named author at all.
  v_sig := 'clara.create_revenue_recognition_schedule(uuid,uuid,text,text,text,jsonb,text,text)';
  if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
    raise exception '#941 tail: clara_authenticated cannot execute the human recognition door'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                                'clara_wake_proactive','public'] loop
    if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
      raise exception '#941 tail: % can execute % -- the human door stays human', v_role, v_sig
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  if position('clara._human_ctx(clara.role_rank(''bookkeeper''))' in v_src) = 0
     or position('clara._revenue_recognition_core(' in v_src) = 0 then
    raise exception '#941 tail: the human recognition door lost its floor or does not call the shared core'
      using errcode='CLR10';
  end if;

  -- 3e · THE CORE CARRIES THE FOUR RULES THIS LANE EXISTS FOR, asserted at the call site rather
  --      than by an attribution comment.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure;
  if position('''sst_output''' in v_src) = 0 then
    raise exception '#941 tail: the recognition core does not exclude the SST output leg -- output tax is not revenue'
      using errcode='CLR10';
  end if;
  if position('clara._prepayment_account_enrolled(p_client, v_deferred, ''deferred_revenue'')' in v_src) = 0
     or position('deferred_account_not_enrolled' in v_src) = 0 then
    raise exception '#941 tail: the recognition core lost #940''s roster gate' using errcode='CLR10';
  end if;
  if position('clara.prepayment_schedule_v2(v_leg.credit_cents, v_deferred, ''debit''' in v_src) = 0 then
    raise exception '#941 tail: the recognition core does not ride #939''s evaluator on the DEBIT side'
      using errcode='CLR10';
  end if;
  if position('recognition_pattern_unsupported' in v_src) = 0 then
    raise exception '#941 tail: the recognition core does not refuse a pattern other than straight line'
      using errcode='CLR10';
  end if;
  if position('clara.create_accounting_plan(' in v_src) = 0
     or position('clara._obo_plan_core(' in v_src) = 0 then
    raise exception '#941 tail: the recognition core does not carry BOTH plan steps -- one lane would be unreachable'
      using errcode='CLR10';
  end if;

  -- 3e2 · THE MONTHLY ADMISSION ARM CARRIES BOTH LOOKUPS AND BOTH TYPED REASONS, and the
  --       amortisation half is untouched. A recognition plan that fell through to the revision's
  --       constant would post the FIRST period's amount for every period of the term.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)'::regprocedure;
  if position('clara._plan_amortisation_period_line(p.id, p_due)' in v_src) = 0
     or position('clara._plan_revenue_recognition_period_line(p.id, p_due)' in v_src) = 0 then
    raise exception '#941 tail: the admission body does not carry BOTH per-period lookups'
      using errcode='CLR10';
  end if;
  if position('amortisation_period_line_missing' in v_src) = 0
     or position('revenue_recognition_period_line_missing' in v_src) = 0 then
    raise exception '#941 tail: the admission body does not carry BOTH missing-line reasons'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.preview_accounting_plan(uuid,integer)'::regprocedure;
  if position('clara._plan_revenue_recognition_period_line(p_plan, e.due_date)' in v_src) = 0 then
    raise exception '#941 tail: the plan preview does not project a recognition period line'
      using errcode='CLR10';
  end if;

  -- 3f · #915'S PLAN STEP IS NOW A DELEGATION AND STILL HOLDS NO GRANT. The extraction must not
  --      have left a second body behind.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)'::regprocedure;
  if position('clara._obo_plan_core(''amortisation_schedule''' in v_src) = 0 then
    raise exception '#941 tail: clara._prepayment_plan_core is not the one-line delegation this file made it'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.oid = 'clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)'::regprocedure
     and pg_get_userbyid(a.grantee) <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '#941 tail: clara._prepayment_plan_core gained an application grant' using errcode='CLR10';
  end if;

  -- 4 · THE PINNED NEIGHBOURS ARE BYTE-IDENTICAL TO THEIR PRE-IMAGES, re-measured AFTER this file
  --     ran. "This file leaves the prepayment lane alone" is a claim, and the shas are the evidence.
  for v_n in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_n][1]::regprocedure;
    if v_sha is distinct from v_keep[v_n][2] then
      raise exception '#941 tail: % moved during this file (got %)', v_keep[v_n][1], v_sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#941 tail: OK -- the accounting-plan kind set admits revenue_recognition_schedule additively in both places that hold it and the derived-cadence wall covers it; clara.revenue_recognition_schedules exists with no application ACL, forced RLS, an owner-only policy, the append-only trigger pair and its two uniqueness laws; clara.create_revenue_recognition_schedule is clara_authenticated-ONLY at the bookkeeper floor and runs clara._revenue_recognition_core, which excludes the SST output leg, asks #940''s roster with the deferred_revenue purpose, rides #939''s evaluator on the DEBIT side, refuses any pattern but straight line and carries both plan steps; clara._prepayment_plan_core is now a one-line delegation to clara._obo_plan_core and both cores hold no application grant; clara.enrol_prepayment_account states the deferred-revenue rule beside the prepayment one; and every pinned prepayment-lane neighbour is byte-identical to its pre-image.';
end
$t941_tail$;
