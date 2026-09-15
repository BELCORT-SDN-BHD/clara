-- 0212_payroll_settled_cents — #797: THE PAYROLL SETTLEMENT SPLIT BECOMES A STORED PARTICULAR.
-- =====================================================================================
-- Spec of record: issue #797 — "Store the payroll settlement split (settled_cents) as a stored
-- particular". Domain words: CONTEXT.md — "Supplied obligation particulars", "Periodic
-- adjustment". Successor to 0194, which shipped the periodic-adjustment lane and is the LAST
-- file to have cut the three bodies this one recuts (0195 recuts only their CALLERS, by name).
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. A `payroll_obligation`'s SETTLEMENT SPLIT — how much
-- of the obligation was paid in the same entry — stops being a browser-only derivation input and
-- becomes an OPTIONAL typed particular that the basis validates, the relationship check holds the
-- posted lines to, and the canonical builder EMITS, so the history row states the split instead of
-- asking a reader to open the posted entry and recover it from the lines.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES THIS FILE: ABSENCE MUST STAY ADMISSIBLE.
--
-- `start_periodic_adjustment_work` ships inside a FROZEN chatTurn v19 closure. It emits
-- `payment_account_code`, derives its settlement leg locally, and deliberately keeps
-- `settled_cents` OUT of the object it stores — `packages/runtime/tests/chat-turn-v19-tools.test.mjs`
-- asserts that omission and then hands that exact object to `clara._assert_adjustment_basis`.
-- A rule that made this particular MANDATORY whenever a payment account is named would refuse
-- every chat-originated payroll obligation in the estate, and the closure cannot be edited to
-- supply it. So the particular is OPTIONAL in the strong sense: when the key is absent NOTHING
-- about today's behaviour moves, and the existing nonzero `payment_leg` rule remains the only
-- check on that leg. Every arm below is guarded on presence and says so.
--
-- =====================================================================================
-- WHY ALL THREE BODIES, AND WHY THE CANONICAL BUILDER IS THE ONE THAT MAKES THE TICKET TRUE.
--
--   `_assert_adjustment_basis`          — the particular is SHAPED (integer, unsigned, not more
--                                         than the obligation) and its three relationship faults
--                                         are refused ON THE FIELD THE WEB FORM NAMES for the
--                                         same fault.
--   `_assert_adjustment_relationships`  — the particular AGREES WITH THE POSTED LINES, in the
--                                         payload half, beside the existing leg rules: the named
--                                         payment leg's net must be a CREDIT of exactly the stated
--                                         figure, refused in the `adjustment_lines_mismatch` shape
--                                         the expense-leg check already uses.
--   `_adjustment_basis_canonical`       — the particular is STORED. `clara.periodic_adjustments.basis`
--                                         IS this builder's output (0194 §F), so without this line
--                                         the figure would be validated and then discarded and the
--                                         history still could not state it. Both sides of the
--                                         intent-payload conflict recompute this from the stored
--                                         `adjustment_basis` (0194's `_admit_accounting_work_core`
--                                         reads `clara._adjustment_basis_canonical(x.purpose,
--                                         x.adjustment_basis)`), so NOTHING already admitted is
--                                         re-hashed against a stale canonical form — and a
--                                         re-submitted intent key carrying a DIFFERENT split is
--                                         now a typed conflict, which is the intended consequence
--                                         and is how every other particular already behaves.
--
-- NO READ DOOR MOVES. `clara.list_periodic_adjustments` returns `basis` as stored and the web
-- history disclosure renders every key it carries, so the split appears with no change to either.
--
-- NOTHING IS BACKFILLED. `clara.periodic_adjustments` is append-only and the rows recorded before
-- this file keep the basis they were stored with.
--
-- =====================================================================================
-- §0  PRESTATE. Each recut is pinned to the EXACT 0194 text it is derived from, on its own,
-- because a recut is a full copy: if any of the three has drifted under a later build, the copy
-- below is a SILENT REVERT of that build rather than an addition to it. Measured live on the
-- 0001→0198 chain.
-- =====================================================================================
do $w797_prestate$
declare v_sha text;
begin
  if to_regprocedure('clara._assert_adjustment_basis(text,jsonb)') is null then
    raise exception '#797 prestate: clara._assert_adjustment_basis is absent -- 0194 must apply first'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._assert_adjustment_basis(text,jsonb)'::regprocedure;
  if v_sha <> '9acbeb45dde502b3f029a8b785e87b93db9cc152eff83e5e22b46a827b0a0e82' then
    raise exception '#797 prestate: clara._assert_adjustment_basis has DRIFTED from the pinned 0194 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._adjustment_basis_canonical(text,jsonb)'::regprocedure;
  if v_sha <> '99a158ff3f537a1a2664f0e96727279dbb77ad710bf7e89ca388b9b0a6b1ea3c' then
    raise exception '#797 prestate: clara._adjustment_basis_canonical has DRIFTED from the pinned 0194 body (sha %)', v_sha
      using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)'::regprocedure;
  if v_sha <> 'c55219e03219bb3f6b94dfe18bc1870123a7c72912fb56a2f0ff16db1a552854' then
    raise exception '#797 prestate: clara._assert_adjustment_relationships has DRIFTED from the pinned 0194 body (sha %)', v_sha
      using errcode='CLR10';
  end if;

  -- …AND THE PARTICULAR DOES NOT ALREADY EXIST. A second application of this file, or a build
  -- that shipped the key another way, would otherwise be indistinguishable from a clean run.
  if position('settled_cents' in (select p.prosrc from pg_proc p
       where p.oid='clara._adjustment_basis_canonical(text,jsonb)'::regprocedure)) <> 0 then
    raise exception '#797 prestate: the canonical builder already emits settled_cents'
      using errcode='CLR10';
  end if;

  raise notice '#797 prestate: clean -- all three 0194 bodies are at their pinned texts and no settled_cents particular exists.';
end
$w797_prestate$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara._assert_adjustment_basis — RECUT. The full 0194 body; the ONLY addition is the
-- `-- #797` block in the payroll arm, and the one declaration it needs.
-- =====================================================================================
create or replace function clara._assert_adjustment_basis(p_purpose text, p_adjustment jsonb) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare
  v_start date; v_end date; v_amount bigint; v_open bigint; v_close bigint;
  v_method text; v_kind text; v_inv text; v_cost text; v_exp text; v_liab text;
  v_adv text; v_pay text; v_counted date;
  v_settled bigint;                                                        -- #797
begin
  if p_purpose = 'journal_entry' then
    if p_adjustment is not null then
      raise exception 'a journal-entry work carries no typed particulars' using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment","constraint":"not_supported"}';
    end if;
    return;
  end if;
  if p_purpose not in ('periodic_stock_adjustment','payroll_obligation') then
    raise exception 'unknown accounting-work purpose %', p_purpose using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_purpose','field','purpose')::text;
  end if;
  if p_adjustment is null or jsonb_typeof(p_adjustment) <> 'object' then
    raise exception 'the typed particulars are a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_adjustment","field":"adjustment","constraint":"object"}';
  end if;

  -- ---- the half both purposes share -------------------------------------------------
  v_start := clara._adjustment_date(p_adjustment, 'period_start');
  v_end   := clara._adjustment_date(p_adjustment, 'period_end');
  if v_end < v_start then
    raise exception 'the period ends before it starts (% .. %)', v_start, v_end using errcode='CLR10',
      detail='{"reason":"invalid_adjustment","field":"adjustment.period_end","constraint":"order"}';
  end if;
  if upper(btrim(coalesce(p_adjustment->>'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_adjustment","field":"adjustment.currency","constraint":"myr"}';
  end if;
  -- THE INSTRUCTION IS THE BASIS IN WORDS, and it is required for the same reason a documentless
  -- entry's memo is (`clara.journal_entries`' own ck_je_basis): a movement nobody explained is a
  -- figure without a reason. Capped at the memo's own 4000 so a form cannot admit one the posted
  -- entry could not carry.
  perform clara._adjustment_text(p_adjustment, 'instruction', 4000);
  -- The CORRECTION LINK, optional and shape-checked here; the world half (does it exist, is its
  -- entry reversed, is it already corrected) is `_assert_adjustment_relationships`'s.
  if nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'') is not null then
    begin
      perform (p_adjustment->>'corrects_adjustment_id')::uuid;
    exception when others then
      raise exception 'corrects_adjustment_id does not name an adjustment' using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.corrects_adjustment_id","constraint":"uuid"}';
    end;
  end if;

  if p_purpose = 'periodic_stock_adjustment' then
    v_method := btrim(coalesce(p_adjustment->>'method',''));
    if v_method not in ('opening_closing_count','explicit_adjustment') then
      raise exception 'unknown stock-adjustment method %', v_method using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.method","constraint":"method"}';
    end if;
    v_inv  := clara._adjustment_text(p_adjustment, 'inventory_account_code', 64);
    v_cost := clara._adjustment_text(p_adjustment, 'cost_account_code', 64);
    if v_inv = v_cost then
      raise exception 'the inventory and cost legs name one account (%)', v_inv using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.cost_account_code","constraint":"distinct"}';
    end if;
    v_amount := clara._adjustment_cents(p_adjustment, 'adjustment_cents', true);
    if v_method = 'opening_closing_count' then
      v_open  := clara._adjustment_cents(p_adjustment, 'opening_cents', false);
      v_close := clara._adjustment_cents(p_adjustment, 'closing_cents', false);
      if v_amount <> v_close - v_open then
        raise exception 'the counted movement is % but closing - opening is %',
          v_amount, v_close - v_open using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_adjustment',
            'field','adjustment.adjustment_cents','constraint','derived_amount',
            'opening_cents', v_open, 'closing_cents', v_close)::text;
      end if;
    else
      -- An EXPLICIT movement carries no count. Refused by name rather than ignored: a set of
      -- particulars carrying both would leave a reader unable to say which one the entry stands
      -- on, and the derived-amount check above would silently not have run.
      if p_adjustment ? 'opening_cents' or p_adjustment ? 'closing_cents' then
        raise exception 'an explicit adjustment carries no opening/closing count' using errcode='CLR10',
          detail='{"reason":"invalid_adjustment","field":"adjustment.opening_cents","constraint":"absent"}';
      end if;
    end if;
    v_counted := clara._adjustment_date(p_adjustment, 'counted_at', false);
    if v_counted is not null and (v_counted < v_start or v_counted > v_end) then
      -- STALE INPUT, by #643's own name: a count taken outside the period it is offered for is
      -- not evidence about that period. It is a payload fact, so it is refused at ADMISSION.
      raise exception 'the count was taken on %, outside % .. %', v_counted, v_start, v_end
        using errcode='CLR10',
        detail=jsonb_build_object('reason','stale_basis','field','adjustment.counted_at',
          'constraint','counted_at_outside_period', 'counted_at', v_counted,
          'period_start', v_start, 'period_end', v_end)::text;
    end if;
    perform clara._adjustment_text(p_adjustment, 'count_reference', 200, false);
    if v_amount = 0 then
      raise exception 'this adjustment moves no money' using errcode='CLR10',
        detail=jsonb_build_object('reason','adjustment_all_zero',
          'field','adjustment.adjustment_cents')::text;
    end if;
  else
    v_kind := btrim(coalesce(p_adjustment->>'obligation_kind',''));
    if v_kind not in ('epf','socso','eis','pcb_mtd','hrdf','salary','other_supplied') then
      raise exception 'unknown obligation kind %', v_kind using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.obligation_kind","constraint":"obligation_kind"}';
    end if;
    v_exp  := clara._adjustment_text(p_adjustment, 'expense_account_code', 64);
    v_liab := clara._adjustment_text(p_adjustment, 'liability_account_code', 64);
    if v_exp = v_liab then
      raise exception 'the expense and liability legs name one account (%)', v_exp using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.liability_account_code","constraint":"distinct"}';
    end if;
    v_adv := clara._adjustment_text(p_adjustment, 'advance_account_code', 64, false);
    v_pay := clara._adjustment_text(p_adjustment, 'payment_account_code', 64, false);
    if v_adv is not null and v_adv in (v_exp, v_liab) then
      raise exception 'the advance leg repeats another named account (%)', v_adv using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.advance_account_code","constraint":"distinct"}';
    end if;
    if v_pay is not null and v_pay in (v_exp, v_liab, coalesce(v_adv,'')) then
      raise exception 'the payment leg repeats another named account (%)', v_pay using errcode='CLR10',
        detail='{"reason":"invalid_adjustment","field":"adjustment.payment_account_code","constraint":"distinct"}';
    end if;
    -- WHERE THE FIGURES CAME FROM, in the accountant's own words. Required, because #643's
    -- boundary is "supplied obligation particulars": an amount with no stated source would be an
    -- obligation the estate could not attribute to anything a human said.
    perform clara._adjustment_text(p_adjustment, 'particulars_source', 500);
    v_amount := clara._adjustment_cents(p_adjustment, 'amount_cents', false);
    if v_amount = 0 then
      raise exception 'this obligation moves no money' using errcode='CLR10',
        detail=jsonb_build_object('reason','adjustment_all_zero',
          'field','adjustment.amount_cents')::text;
    end if;
    -- ---- #797 · THE SETTLEMENT SPLIT, OPTIONAL AND STORED ---------------------------
    -- WHY OPTIONAL, AND WHY THAT IS A HARD PRECONDITION RATHER THAN A CONVENIENCE. The chat
    -- entrance `start_periodic_adjustment_work` ships inside a FROZEN closure; it emits
    -- `payment_account_code`, derives its settlement leg locally and deliberately keeps
    -- `settled_cents` OUT of the object it hands this function. A rule that demanded the
    -- particular whenever a payment account is named would refuse every chat-originated payroll
    -- obligation the estate can produce. So ABSENCE IS ADMITTED and unchanged: the only check on
    -- that leg stays `_assert_adjustment_relationships`' existing nonzero `payment_leg` rule.
    --
    -- WHEN IT IS STATED it is a real particular, read through the SAME total cents reader every
    -- other figure uses (so `"30000"`, `300.5` and `-1` are refused by name rather than coerced),
    -- and each of the three relationship refusals lands on the control the web form names for
    -- that same fault: `overSettled` and `paymentLegUnused` on the figure, `settlementNeedsAccount`
    -- on the account.
    v_settled := clara._adjustment_cents(p_adjustment, 'settled_cents', false, false);
    if v_settled is not null then
      if v_settled > v_amount then
        raise exception 'the settled part is % but the obligation is %', v_settled, v_amount
          using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_adjustment',
            'field','adjustment.settled_cents','constraint','over_settled',
            'settled_cents', v_settled, 'amount_cents', v_amount)::text;
      end if;
      if v_settled > 0 and v_pay is null then
        raise exception 'a settled amount needs the account it was settled from'
          using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_adjustment',
            'field','adjustment.payment_account_code','constraint','settlement_needs_account',
            'settled_cents', v_settled)::text;
      end if;
      if v_settled = 0 and v_pay is not null then
        raise exception 'a payment account is named but nothing was settled through it'
          using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_adjustment',
            'field','adjustment.settled_cents','constraint','payment_leg_unused',
            'account_code', v_pay)::text;
      end if;
    end if;
    -- ---- #797 ends ------------------------------------------------------------------
  end if;
end $$;
revoke all on function clara._assert_adjustment_basis(text,jsonb) from public;

-- =====================================================================================
-- §B  clara._adjustment_basis_canonical — RECUT. The full 0194 body; the ONLY addition is the
-- `settled_cents` line in the `payroll_obligation` branch. The stock branch is byte-identical,
-- so no stock adjustment's canonical form — and therefore no stock Work's intent comparison —
-- moves at all.
-- =====================================================================================
create or replace function clara._adjustment_basis_canonical(p_purpose text, p_adjustment jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when p_adjustment is null or jsonb_typeof(p_adjustment) <> 'object' then null
    when p_purpose = 'periodic_stock_adjustment' then jsonb_build_object(
      'purpose', p_purpose,
      'period_start', btrim(coalesce(p_adjustment->>'period_start','')),
      'period_end',   btrim(coalesce(p_adjustment->>'period_end','')),
      'method',       btrim(coalesce(p_adjustment->>'method','')),
      'opening_cents', clara._adjustment_cents_value(p_adjustment, 'opening_cents'),
      'closing_cents', clara._adjustment_cents_value(p_adjustment, 'closing_cents'),
      'counted_at',    nullif(btrim(coalesce(p_adjustment->>'counted_at','')),''),
      'count_reference', nullif(btrim(coalesce(p_adjustment->>'count_reference','')),''),
      'inventory_account_code', btrim(coalesce(p_adjustment->>'inventory_account_code','')),
      'cost_account_code',      btrim(coalesce(p_adjustment->>'cost_account_code','')),
      'adjustment_cents', clara._adjustment_cents_value(p_adjustment, 'adjustment_cents'),
      'currency', upper(btrim(coalesce(p_adjustment->>'currency',''))),
      'instruction', btrim(coalesce(p_adjustment->>'instruction','')),
      'corrects_adjustment_id',
        lower(nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'')))
    when p_purpose = 'payroll_obligation' then jsonb_build_object(
      'purpose', p_purpose,
      'period_start', btrim(coalesce(p_adjustment->>'period_start','')),
      'period_end',   btrim(coalesce(p_adjustment->>'period_end','')),
      'obligation_kind', btrim(coalesce(p_adjustment->>'obligation_kind','')),
      'expense_account_code',   btrim(coalesce(p_adjustment->>'expense_account_code','')),
      'liability_account_code', btrim(coalesce(p_adjustment->>'liability_account_code','')),
      'advance_account_code', nullif(btrim(coalesce(p_adjustment->>'advance_account_code','')),''),
      'payment_account_code', nullif(btrim(coalesce(p_adjustment->>'payment_account_code','')),''),
      'amount_cents', clara._adjustment_cents_value(p_adjustment, 'amount_cents'),
      -- #797 · THE STATED SETTLEMENT SPLIT. This line is what makes the particular REAL: the
      -- `basis` column of `clara.periodic_adjustments` is this builder's output, so without it
      -- the figure would be validated and then thrown away and the history still could not
      -- state the split. NULL when the key is absent, exactly as the optional account codes and
      -- the stock branch's counted figures already are.
      'settled_cents', clara._adjustment_cents_value(p_adjustment, 'settled_cents'),
      'currency', upper(btrim(coalesce(p_adjustment->>'currency',''))),
      'particulars_source', btrim(coalesce(p_adjustment->>'particulars_source','')),
      'instruction', btrim(coalesce(p_adjustment->>'instruction','')),
      'corrects_adjustment_id',
        lower(nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'')))
    else null end;
$$;
revoke all on function clara._adjustment_basis_canonical(text,jsonb) from public;

-- =====================================================================================
-- §C  clara._assert_adjustment_relationships — RECUT. The full 0194 body; the ONLY addition is
-- the `-- #797` block in the PAYLOAD half of the payroll branch (the half that runs without the
-- world checks), beside the existing leg rules, and the one declaration it needs.
-- =====================================================================================
create or replace function clara._assert_adjustment_relationships(p_client uuid, p_purpose text,
    p_adjustment jsonb, p_lines jsonb, p_check_world boolean default true) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_amount bigint; v_abs bigint; v_inv text; v_cost text; v_exp text; v_liab text;
  v_adv text; v_pay text; v_n int; v_named text[]; v_bad text; v_settled bigint;  -- #797
  v_start date; v_end date; v_fy record; v_fy_n int; v_target record; v_firm uuid;
begin
  if p_purpose = 'journal_entry' then return; end if;
  v_amount := clara._adjustment_amount_cents(p_purpose, p_adjustment);
  v_abs := abs(coalesce(v_amount, 0));
  v_start := (p_adjustment->>'period_start')::date;
  v_end   := (p_adjustment->>'period_end')::date;
  select c.firm_id into v_firm from clara.clients c where c.id = p_client;

  if p_purpose = 'periodic_stock_adjustment' then
    v_inv  := btrim(coalesce(p_adjustment->>'inventory_account_code',''));
    v_cost := btrim(coalesce(p_adjustment->>'cost_account_code',''));
    if not p_check_world then
      -- EXACTLY TWO LINES. A stock movement is one debit and one credit; a third leg would be
      -- another accounting fact riding a marker the close gate reads.
      v_n := jsonb_array_length(coalesce(p_lines,'[]'::jsonb));
      if v_n <> 2 then
        raise exception 'a periodic stock adjustment posts exactly two lines (got %)', v_n
          using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch','field','lines',
            'constraint','two_lines','lines', v_n)::text;
      end if;
      -- …AND THEY ARE THE TWO NAMED ACCOUNTS, in the direction the SIGN of the movement fixes:
      -- a positive movement (the count is above the opening figure) DEBITS inventory and CREDITS
      -- the cost account; a negative one is its mirror.
      if clara._adjustment_net_cents(p_lines, v_inv) <> (case when v_amount > 0 then v_abs else -v_abs end) then
        raise exception 'the inventory leg does not carry the movement' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.inventory_account_code','constraint','inventory_leg',
            'account_code', v_inv, 'expected_net_cents',
            (case when v_amount > 0 then v_abs else -v_abs end),
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_inv))::text;
      end if;
      if clara._adjustment_net_cents(p_lines, v_cost) <> (case when v_amount > 0 then -v_abs else v_abs end) then
        raise exception 'the cost leg does not mirror the movement' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.cost_account_code','constraint','cost_leg',
            'account_code', v_cost, 'expected_net_cents',
            (case when v_amount > 0 then -v_abs else v_abs end),
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_cost))::text;
      end if;
    else
      -- THE WORLD: the two accounts are this client's, live, and of the class their ROLE requires.
      -- A "cost of sales" leg pointing at a liability would balance perfectly and mean nothing.
      perform clara._assert_adjustment_account(p_client, v_inv, 'asset',
        'adjustment.inventory_account_code', 'inventory_account_class');
      perform clara._assert_adjustment_account(p_client, v_cost, 'expense',
        'adjustment.cost_account_code', 'cost_account_class');
    end if;
  else
    v_exp  := btrim(coalesce(p_adjustment->>'expense_account_code',''));
    v_liab := btrim(coalesce(p_adjustment->>'liability_account_code',''));
    v_adv  := nullif(btrim(coalesce(p_adjustment->>'advance_account_code','')),'');
    v_pay  := nullif(btrim(coalesce(p_adjustment->>'payment_account_code','')),'');
    if not p_check_world then
      -- NOTHING ANONYMOUS. Every line must be on an account the particulars NAMED, so an
      -- obligation cannot smuggle an unrelated leg past a form that only shows four codes.
      v_named := array_remove(array[v_exp, v_liab, v_adv, v_pay], null);
      select btrim(coalesce(x.elem->>'account_code','')) into v_bad
        from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) as x(elem)
       where not (btrim(coalesce(x.elem->>'account_code','')) = any(v_named))
       limit 1;
      if v_bad is not null then
        raise exception 'line account % is not one of this obligation''s named accounts', v_bad
          using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch','field','lines',
            'constraint','unnamed_account','account_code', v_bad)::text;
      end if;
      -- THE COST OF THE OBLIGATION is the supplied amount, and it lands on the expense account.
      if clara._adjustment_net_cents(p_lines, v_exp) <> v_abs then
        raise exception 'the expense leg does not carry the obligation' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.expense_account_code','constraint','expense_amount',
            'account_code', v_exp, 'expected_net_cents', v_abs,
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_exp))::text;
      end if;
      -- EVERY NAMED LEG IS ACTUALLY USED. The SPLIT between the liability, a staff-advance
      -- account and a settlement leg is the ACCOUNTANT'S — this lane records supplied
      -- particulars, so it refuses a set that names an account the entry never touches and says
      -- nothing about how much belongs on each.
      --
      -- AND THE DIRECTION IS NOT PRESCRIBED, for a MEASURED reason. The first cut required each
      -- of these to be CREDITED, which reads right for an accrual and is wrong for the estate:
      -- `clara._adv_on_approve` (0043) births a staff advance from a DEBIT line on an enrolled
      -- account and refuses a CREDIT that does not say which advance it discharges (CLR40,
      -- remedy `book_staff_advance_application`). Prescribing "credited" here would have made
      -- this lane assert an accounting direction the subledger then refuses — and #643's own
      -- boundary says missing settlement facts are not invented. So the rule is "used", the
      -- amount split is the accountant's, and the staff-advance register stays the authority on
      -- what a movement on ITS accounts requires.
      if clara._adjustment_net_cents(p_lines, v_liab) = 0 then
        raise exception 'the liability leg is named but carries nothing' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.liability_account_code','constraint','liability_leg',
            'account_code', v_liab, 'actual_net_cents', 0)::text;
      end if;
      if v_adv is not null and clara._adjustment_net_cents(p_lines, v_adv) = 0 then
        raise exception 'the advance leg is named but carries nothing' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.advance_account_code','constraint','advance_leg',
            'account_code', v_adv, 'actual_net_cents', 0)::text;
      end if;
      if v_pay is not null and clara._adjustment_net_cents(p_lines, v_pay) = 0 then
        raise exception 'the payment leg is named but carries nothing' using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.payment_account_code','constraint','payment_leg',
            'account_code', v_pay, 'actual_net_cents', 0)::text;
      end if;
      -- ---- #797 · AND WHEN THE SPLIT IS STATED, THE PAYMENT LEG MUST BE IT -------------
      -- The expense leg has always had to equal `amount_cents` exactly; the payment leg only had
      -- to be nonzero, because until #797 no particular said how much belonged on it. Now one
      -- can. The net-cents reader returns DEBIT MINUS CREDIT and both derivation lanes CREDIT the
      -- settlement leg, so the expected net is the NEGATION of the stated figure. Absent
      -- particular, absent rule: `_adjustment_cents_value` returns null and this arm does not run,
      -- which is how the frozen chat closure's obligations keep posting.
      v_settled := clara._adjustment_cents_value(p_adjustment, 'settled_cents');
      if v_settled is not null
         and clara._adjustment_net_cents(p_lines, v_pay) <> -v_settled then
        raise exception 'the payment leg carries % but the particulars settle %',
          clara._adjustment_net_cents(p_lines, v_pay), v_settled using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_lines_mismatch',
            'field','adjustment.settled_cents','constraint','settled_amount',
            'account_code', v_pay, 'expected_net_cents', -v_settled,
            'actual_net_cents', clara._adjustment_net_cents(p_lines, v_pay))::text;
      end if;
      -- ---- #797 ends ------------------------------------------------------------------
    else
      perform clara._assert_adjustment_account(p_client, v_exp, 'expense',
        'adjustment.expense_account_code', 'expense_account_class');
      perform clara._assert_adjustment_account(p_client, v_liab, 'liability',
        'adjustment.liability_account_code', 'liability_account_class');
      if v_pay is not null then
        perform clara._assert_adjustment_account(p_client, v_pay, 'asset',
          'adjustment.payment_account_code', 'payment_account_class');
      end if;
      if v_adv is not null then
        -- THE STAFF-ADVANCE CONTROL RELATIONSHIP. `clara.staff_advance_accounts` (0043) is the
        -- estate's own register of which chart code is a staff-advance subledger and for whom;
        -- the subledger belt (`_adv_on_approve`) already guards the ledger. A payroll obligation
        -- that recovered an advance from an account NOBODY ENROLLED would be booking against a
        -- control account with no detail behind it — #643's "required account/control
        -- relationships", refused by name rather than left to the belt's generic wording.
        --
        -- …AND THE BELT REMAINS THE AUTHORITY ON WHAT THE MOVEMENT ITSELF NEEDS. This arm asks
        -- "is this account a live staff-advance enrolment of this client"; it does NOT ask which
        -- advance a credit discharges, because `clara.book_staff_advance_application` is the door
        -- that answers that and `clara._adv_on_approve` refuses CLR40 without it. A periodic
        -- adjustment may therefore name an advance account and still be refused at approve — by
        -- the register, under the register's own name, with the register's own remedy. That is
        -- the correct outcome: an allocation is a missing settlement fact, and #643 does not
        -- invent those.
        if not exists (select 1 from clara.staff_advance_accounts a
                        where a.client_id = p_client and a.account_code = v_adv and a.active) then
          raise exception 'account % is not a live staff-advance enrolment for this client', v_adv
            using errcode='CLR10',
            detail=jsonb_build_object('reason','advance_not_enrolled',
              'field','adjustment.advance_account_code','account_code', v_adv)::text;
        end if;
        perform clara._assert_adjustment_account(p_client, v_adv, 'asset',
          'adjustment.advance_account_code', 'advance_account_class');
      end if;
    end if;
  end if;

  if not p_check_world then return; end if;

  -- ---- the world half both purposes share -------------------------------------------
  --
  -- SCOPE. A periodic adjustment belongs to ONE fiscal year: a period spanning two years cannot
  -- produce one closing position, and a period running past the year end is a claim about books
  -- that are not yet written. Neither is refused by guessing — both are measured against
  -- `clara.fiscal_years`, and a client with NO year covering the period is left alone (the estate
  -- does not require a registered year to keep books, and inventing one here would be a rule this
  -- lane made up).
  select count(*)::int into v_fy_n from clara.fiscal_years fy
   where fy.client_id = p_client
     and fy.starts_on <= v_end and fy.ends_on >= v_start;
  if v_fy_n > 1 then
    raise exception 'the period % .. % spans % fiscal years', v_start, v_end, v_fy_n
      using errcode='CLR10',
      detail=jsonb_build_object('reason','scope_overbroad','field','adjustment.period_end',
        'constraint','spans_fiscal_years','fiscal_years', v_fy_n,
        'period_start', v_start, 'period_end', v_end)::text;
  end if;
  select * into v_fy from clara.fiscal_years fy
   where fy.client_id = p_client and v_start between fy.starts_on and fy.ends_on
   order by fy.starts_on desc limit 1;
  if v_fy.id is not null then
    if v_end > v_fy.ends_on then
      raise exception 'the period ends % , after fiscal year % ends %', v_end, v_fy.label, v_fy.ends_on
        using errcode='CLR10',
        detail=jsonb_build_object('reason','scope_overbroad','field','adjustment.period_end',
          'constraint','after_fiscal_year_end','fiscal_year_id', v_fy.id,
          'fy_ends_on', v_fy.ends_on, 'period_end', v_end)::text;
    end if;
    -- THE LOCKED PERIOD, TYPED AND EARLY. `t_period_wall` refuses the approved INSERT with the
    -- same CLR19 and the same reason, and stays the actual law; this arm exists so an ADMISSION
    -- into a sealed year is refused before a Work row, a run and a budget are spent on something
    -- the wall will reject seconds later.
    if v_fy.status in ('closing','closed') then
      raise exception 'fiscal year % (% to %) is %; a periodic adjustment dated in it is not admitted',
        v_fy.label, v_fy.starts_on, v_fy.ends_on, v_fy.status
        using errcode='CLR19',
        detail=jsonb_build_object('reason','write_into_closed_period','field','adjustment.period_end',
          'fiscal_year_id', v_fy.id, 'fy_status', v_fy.status,
          'period_start', v_start, 'period_end', v_end)::text;
    end if;
  end if;

  -- THE CORRECTION TARGET, when there is one. A correction FOLLOWS a reversal: the original entry
  -- must already be reversed, or the books would carry both movements at once. The estate's own
  -- `clara.reverse_entry` is the door; this arm only asks whether it has been used.
  if nullif(btrim(coalesce(p_adjustment->>'corrects_adjustment_id','')),'') is not null then
    select pa.*, je.reversed_by, je.status as entry_status into v_target
      from clara.periodic_adjustments pa
      join clara.journal_entries je on je.id = pa.entry_id
     where pa.id = (p_adjustment->>'corrects_adjustment_id')::uuid
       and pa.client_id = p_client;
    if v_target.id is null then
      raise exception 'no periodic adjustment of this client carries that id' using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_not_found',
          'field','adjustment.corrects_adjustment_id')::text;
    end if;
    if v_target.corrected_by_adjustment_id is not null then
      raise exception 'that adjustment has already been corrected' using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_already_corrected',
          'field','adjustment.corrects_adjustment_id',
          'adjustment_id', v_target.corrected_by_adjustment_id)::text;
    end if;
    if v_target.reversed_by is null then
      raise exception 'reverse the entry that adjustment posted before correcting it'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_live',
          'field','adjustment.corrects_adjustment_id', 'entry_id', v_target.entry_id)::text;
    end if;
  end if;
end $$;
revoke all on function clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean) from public;

reset role;

-- =====================================================================================
-- §T  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog — 0194 §I's
-- own ceremony, narrowed to the three bodies this file touches.
-- =====================================================================================
do $w797_tail$
declare v_src text; v_def text; v_expect text; v_probe jsonb; v_lines jsonb; v_got text;
  v_admitted boolean;
begin
  -- (T.1) THE PARTICULAR IS IN ALL THREE BODIES, read from the live catalog rather than asserted
  -- from this file's own text.
  foreach v_def in array array['clara._assert_adjustment_basis(text,jsonb)',
      'clara._adjustment_basis_canonical(text,jsonb)',
      'clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(v_def);
    if position('settled_cents' in v_src) = 0 then
      raise exception '#797 tail: % does not mention settled_cents', v_def using errcode='CLR10';
    end if;
  end loop;

  -- (T.2) THE RECUTS KEPT EVERY 0194 ARM. A full-copy recut that quietly dropped one would pass
  -- every functional cell that does not exercise it, so each body is read token by token.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._assert_adjustment_basis(text,jsonb)'::regprocedure;
  foreach v_def in array array['not_supported','invalid_purpose','derived_amount','stale_basis',
      'counted_at_outside_period','adjustment_all_zero','obligation_kind','particulars_source',
      'corrects_adjustment_id','advance_account_code','payment_account_code','myr'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#797 tail: the recut basis check LOST 0194''s arm/token %', v_def
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_def in array array['over_settled','settlement_needs_account','payment_leg_unused'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#797 tail: the recut basis check is MISSING this file''s own refusal %', v_def
        using errcode='CLR10';
    end if;
  end loop;

  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)'::regprocedure;
  foreach v_def in array array['two_lines','inventory_leg','cost_leg','unnamed_account',
      'expense_amount','liability_leg','advance_leg','payment_leg','advance_not_enrolled',
      'spans_fiscal_years','after_fiscal_year_end','write_into_closed_period',
      'correction_target_not_found','correction_target_already_corrected','correction_target_live',
      'settled_amount'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#797 tail: the recut relationship check LOST/MISSES the arm %', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) THE STOCK BRANCH OF THE CANONICAL BUILDER DID NOT MOVE. Measured as an ANSWER, not as
  -- text: a canonical form that changed would silently turn every admitted stock Work's replay
  -- into an intent-payload conflict.
  v_probe := jsonb_build_object('period_start','2026-01-01','period_end','2026-12-31',
    'method','opening_closing_count','opening_cents',400000,'closing_cents',650000,
    'adjustment_cents',250000,'counted_at','2026-12-31','count_reference','STOCKTAKE',
    'inventory_account_code','1200','cost_account_code','5040','currency','MYR',
    'instruction','probe');
  if (select count(*) from jsonb_object_keys(
        clara._adjustment_basis_canonical('periodic_stock_adjustment', v_probe))) <> 14 then
    raise exception '#797 tail: the stock canonical form no longer carries exactly its 0194 keys'
      using errcode='CLR10';
  end if;
  if clara._adjustment_basis_canonical('periodic_stock_adjustment', v_probe) ? 'settled_cents' then
    raise exception '#797 tail: settled_cents leaked into the STOCK branch' using errcode='CLR10';
  end if;

  -- (T.4) ABSENCE IS STILL ADMITTED, end to end, on the SHAPE the frozen chat closure produces:
  -- `payment_account_code` named, `settled_cents` absent, the payment leg carrying something.
  v_probe := jsonb_build_object('period_start','2026-08-01','period_end','2026-08-31',
    'obligation_kind','epf','expense_account_code','6010','liability_account_code','2100',
    'payment_account_code','1150','amount_cents',130000,'currency','MYR',
    'particulars_source','probe','instruction','probe');
  perform clara._assert_adjustment_basis('payroll_obligation', v_probe);
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code','6010','debit_cents',130000,'credit_cents',0),
    jsonb_build_object('account_code','2100','debit_cents',0,'credit_cents',100000),
    jsonb_build_object('account_code','1150','debit_cents',0,'credit_cents',30000));
  perform clara._assert_adjustment_relationships(null, 'payroll_obligation', v_probe, v_lines, false);
  if clara._adjustment_basis_canonical('payroll_obligation', v_probe) -> 'settled_cents'
       <> 'null'::jsonb then
    raise exception '#797 tail: an ABSENT settled_cents did not canonicalise to JSON null'
      using errcode='CLR10';
  end if;

  -- …AND A STATED SPLIT IS CARRIED AND HELD TO THE LINES.
  v_probe := v_probe || jsonb_build_object('settled_cents', 30000);
  perform clara._assert_adjustment_basis('payroll_obligation', v_probe);
  perform clara._assert_adjustment_relationships(null, 'payroll_obligation', v_probe, v_lines, false);
  if (clara._adjustment_basis_canonical('payroll_obligation', v_probe) ->> 'settled_cents') <> '30000' then
    raise exception '#797 tail: the stated split is not carried into the canonical form'
      using errcode='CLR10';
  end if;
  v_admitted := false;
  begin
    perform clara._assert_adjustment_relationships(null, 'payroll_obligation',
      v_probe || jsonb_build_object('settled_cents', 20000), v_lines, false);
    v_admitted := true;                     -- the flag, not a raise: a raise here would be caught
  exception when sqlstate 'CLR10' then      -- by this very handler and read as a pass.
    get stacked diagnostics v_got = pg_exception_detail;
    if v_got is null or position('settled_amount' in v_got) = 0 then
      raise exception '#797 tail: the disagreement refusal is not the settled_amount shape (got %)', v_got
        using errcode='CLR10';
    end if;
  end;
  if v_admitted then
    raise exception '#797 tail: a split that disagrees with the payment leg was ADMITTED'
      using errcode='CLR10';
  end if;

  -- (T.5) THE POSTURE CEREMONY, for the three recut bodies — owner, SECURITY DEFINER, pinned
  -- search_path, the EXACT ungranted ACL text (grantor included) and the VOLATILITY 0194 gave
  -- each. `create or replace` preserves owner and ACL, but "preserves" is a claim about the
  -- server, and 0194 §I's rule is that a claim is re-read from the catalog.
  for v_def, v_expect in
    select * from (values
      ('clara._assert_adjustment_basis(text,jsonb)', 'i'),
      ('clara._adjustment_basis_canonical(text,jsonb)', 'i'),
      ('clara._assert_adjustment_relationships(uuid,text,jsonb,jsonb,boolean)', 's')
    ) as t(sig, vol)
  loop
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>') || ' | ' || p.provolatile::text
      into v_src from pg_proc p where p.oid = to_regprocedure(v_def);
    if v_src is distinct from ('clara_fn_owner | true | search_path=clara, pg_temp | '
                               || 'clara_fn_owner=X/clara_fn_owner | ' || v_expect) then
      raise exception '#797 tail: % has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp, the ungranted ACL and volatility %; got {%}',
        v_def, v_expect, v_src using errcode='CLR10';
    end if;
    for v_got in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                                     'clara_wake_interactive','clara_wake_proactive']) loop
      if has_function_privilege(v_got, v_def, 'EXECUTE') then
        raise exception '#797 tail: % is EXECUTE-reachable by % -- it must stay ungranted', v_def, v_got
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (T.6) THE CALLERS 0195 RECUT ARE UNTOUCHED and still invoke these three BY NAME, so this file
  -- changed what they assert without changing who asserts it.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  foreach v_def in array array['_assert_adjustment_basis','_adjustment_basis_canonical',
      '_assert_adjustment_relationships'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#797 tail: the admission core no longer calls %', v_def using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('_assert_adjustment_relationships' in v_src) = 0
     or position('_adjustment_basis_canonical' in v_src) = 0 then
    raise exception '#797 tail: the posting core no longer calls the recut predicates'
      using errcode='CLR10';
  end if;

  raise notice '#797 tail: OK -- settled_cents is an OPTIONAL payroll particular in all three recut bodies; the basis check refuses over_settled / settlement_needs_account / payment_leg_unused on the fields the web form names and keeps every 0194 arm; the relationship check holds a STATED split to a payment leg credited exactly that figure under the adjustment_lines_mismatch / settled_amount shape and keeps every 0194 leg, world and correction arm; the canonical builder EMITS the key so clara.periodic_adjustments.basis -- and therefore clara.list_periodic_adjustments and the history disclosure -- states the split, while the STOCK branch is answer-identical to 0194; ABSENCE is admitted end to end on the exact shape the frozen chatTurn v19 closure produces and canonicalises to JSON null; and all three bodies are re-read for owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp, the exact ungranted ACL, their 0194 volatility (immutable, immutable, stable) and EXECUTE-unreachability by every application role.';
end
$w797_tail$;
