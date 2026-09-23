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
     'd55dcbdebd05a7d07adc8f1e8988d8ba440fdfed99b2573c24ea7f8ff07b56a1']
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
     'acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa']
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

reset role;

-- =====================================================================================
-- §TAIL — what a reader may rely on after this file, re-measured on the live catalog.
-- =====================================================================================
do $t941_tail$
declare
  v_sha text; v_src text; v_n int; v_sig text;
  v_keep text[][] := array[
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     'acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa']
  ];
begin
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

  raise notice '#941 tail: OK -- clara.enrol_prepayment_account states the deferred-revenue rule (a contract LIABILITY) beside the prepayment one (a prepaid ASSET), keeps 0042''s shared negative wall ahead of both, keeps its clara_authenticated-ONLY ACL with no machine lane and no wake wrapper, and every pinned prepayment-lane neighbour is byte-identical to its pre-image.';
end
$t941_tail$;
