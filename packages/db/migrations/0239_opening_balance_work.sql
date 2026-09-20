-- 0239_opening_balance_work — #984 (owner's ruling, 2026-09-20): THE OPENING LANE BECOMES A WORK.
-- =====================================================================================
-- Spec of record: issue #984 (Agent Brief + owner ruling, both 2026-09-20). Parent files:
-- 0178 (#623, `clara.accounting_work` + `clara.operation_receipts` and their one-value purpose),
-- 0194 (#643, the three-value vocabulary and `clara._assert_adjustment_basis`), 0195 (#631, the
-- posting core's closed purpose lookup), 0017 (wave B, the two opening approval doors) and 0235
-- (#1014, the binding claim those doors now take). It closes #656's AC5, which the
-- 2026-09-15 wave recorded as "descoped (authority)".
--
-- WHAT IS TRUE TODAY, AND WHY IT IS THE DEFECT.
--
--   Approving an opening seed or an opening correction writes opening's OWN receipt relation
--   (`clara.opening_seed_approvals`, one row per approved entry) and nothing else. No
--   `clara.accounting_work` row, no `clara.operation_receipts` row. So the one accounting act a
--   firm performs at the very start of a client's books — the act every later figure carries
--   down from — gets none of the Work list, Work detail, Work audit or firm Activity treatment
--   every other accounting act gets. A person looking at "what accounting work has been done for
--   this client" cannot see the opening at all.
--
--   THE OWNER'S RULING REVERSES THE TICKET'S OWN RECOMMENDATION. The triage brief recommended
--   Option B — rule that opening needs no Work-shaped record. The owner corrected that: #656's
--   AC5 asked for the Work-and-receipt pair here and the wave descoped it as an AUTHORITY
--   question, not as a finding that the Work model is wrong for opening.
--
-- WHY THIS IS A GOVERNED WIDENING RATHER THAN AN ORDINARY COLUMN CHANGE. The purpose vocabulary
-- is closed INDEPENDENTLY in six places, each of which would refuse a fourth value on its own:
--
--   1. `clara.accounting_work.purpose`'s CHECK                 — widened here.
--   2. `clara.operation_receipts.purpose`'s CHECK              — widened here.
--   3. `ck_accounting_work_adjustment_basis`                   — widened here: an opening Work
--      carries NO typed particulars, and that CHECK demands particulars for every purpose that
--      is not `journal_entry`.
--   4. `clara._assert_adjustment_basis`'s own closed list      — widened here (§B).
--   5. `clara._admit_accounting_work_core`'s closed list       — NOT widened. That core inserts
--      an `clara.agent_tasks` row for a model run and demands a model name; an opening approval
--      is deterministic and human-made and must acquire neither. §D adds a SIBLING admission
--      path instead, and the tail re-reads the core at its pinned sha.
--   6. `clara._record_journal_entry_core`'s purpose lookup     — NOT widened, and the tail proves
--      it: an opening Work never reaches the posting core, because its entries are already
--      posted by `clara._approve_opening_entry` before the Work exists.
--
-- TWO SHAPE CHECKS ON `clara.operation_receipts` ALSO READ THE PURPOSE, and both are the reason
-- this file is larger than a two-line CHECK swap:
--
--   * `operation_receipts.task_id` is NOT NULL with an FK to `clara.agent_tasks`. The Agent
--     Brief's AC3 forbids an agent task for an opening Work, so the column becomes NULLABLE and
--     a NEW purpose-keyed CHECK (`ck_operation_receipts_task_by_purpose`) makes the nullability
--     EXACT rather than merely permitted: the three model-served purposes still REQUIRE a task,
--     and the opening purpose REFUSES one. The invariant is tightened, not loosened.
--   * `ck_operation_receipts_outcome_shape` demanded a non-blank `effects->>'entry_id'` on every
--     committed receipt. An opening batch commits N entries and has no single one; inventing a
--     first-of-N would be a receipt that names the wrong fact. The opening arm demands
--     `effects->>'seed_id'` instead, and the three existing purposes keep the entry_id arm
--     byte-for-byte. Leaving `entry_id` OUT is load-bearing twice over:
--       — `clara._tf_assert_agent_post_receipt` counts receipts naming an entry and refuses any
--         count other than exactly one, so an opening receipt carrying an entry_id would make an
--         agent-posted entry look doubly-receipted;
--       — `clara.list_activity` / `clara.get_activity_event` join their entry by that same text
--         expression, and both already tolerate a NULL (left joins), so the opening receipt shows
--         up on the Activity feed under its purpose and names no entry it does not own.
--
-- WHAT AN OPENING WORK IS, EXACTLY.
--
--   ONE per approved BATCH, not one per entry: a batch is one operation, taken under one op key,
--   and `clara.opening_seed_approvals` already owns the per-entry record. `status` is
--   `completed` at birth because the act is already finished when the row is written — the
--   entries are approved, the registry is finalized, and there is no run to wait for.
--   `basis_origin` is `user_direct`: a person approved it. `source_refs` stays the empty array
--   (documentless) even when the seed is tied to a document — a source ref is the evidence claim
--   the journal lane's link machinery reads, and stamping one here would silently enrol the tie
--   document in `clara._tf_intake_batch_member_work_stamp`'s open-batch hand-off. The tie
--   document is recorded in `basis.tie_document_id` instead, where it is a fact and not a claim.
--   `adjustment_basis` is NULL, which is what §C's widened CHECK and §B's widened gate now admit.
--
--   NO MODEL RUN, ANYWHERE. No `clara.agent_tasks` row, `current_task_id` NULL, `task_id` NULL on
--   the receipt, and no model name recorded in any of them. `acting_actor` and `on_behalf_of` are
--   both the approving human, because no agent acted: the receipt's `via_wake_kind` says
--   `opening_approval`, a raw technical token the Activity row renders verbatim exactly as it
--   renders every other wake kind.
--
-- KNOWN COSMETIC CONSEQUENCE, recorded rather than left to be discovered: the firm Activity row
-- renders "<person> on behalf of <same person>" for an opening receipt, because
-- `clara.operation_receipts.on_behalf_of` is NOT NULL and the approver acted for themselves.
-- That is what the receipt says and it is true; suppressing the phrase when the two are equal is
-- a web change this file deliberately does not reach for.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md "Redo"). Every statement below is
-- `create or replace`, or `drop constraint if exists` before `add constraint`, or an
-- idempotent `alter column drop not null`. §A admits BOTH lawful states of every object this
-- file replaces and says which one it found.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. The world this file reasons about, measured on the rig rather than remembered.
--
-- The three shas in part 3 are ABSOLUTE: this file does not replace those bodies and cannot
-- prove it left them alone if it does not know what they were.
-- =====================================================================================
do $w984_pre$
declare
  v_sha text; v_src text; v_def text; v_n int; v_state text; v_states text := '';
begin
  -- 1 · THE TWO PURPOSE CHECKS, at 0194's exact three-value text (or this file's own four).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.accounting_work'::regclass and conname='accounting_work_purpose_check';
  if v_def is null then
    raise exception '#984 prestate: accounting_work_purpose_check is absent' using errcode='CLR10';
  end if;
  if v_def = 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
    v_states := v_states || 'accounting_work CHECK: first apply (0194 three); ';
  elsif position('opening_balance' in v_def) > 0 then
    v_states := v_states || 'accounting_work CHECK: redo (#984''s four already live); ';
  else
    raise exception '#984 prestate: accounting_work_purpose_check is neither 0194''s three-value text nor #984''s four -- it reads %; a third party widened or narrowed the vocabulary and this file must not overwrite a value it cannot account for', v_def
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.operation_receipts'::regclass and conname='operation_receipts_purpose_check';
  if v_def is null then
    raise exception '#984 prestate: operation_receipts_purpose_check is absent' using errcode='CLR10';
  end if;
  if v_def = 'CHECK ((purpose = ANY (ARRAY[''journal_entry''::text, ''periodic_stock_adjustment''::text, ''payroll_obligation''::text])))' then
    v_states := v_states || 'operation_receipts CHECK: first apply (0194 three); ';
  elsif position('opening_balance' in v_def) > 0 then
    v_states := v_states || 'operation_receipts CHECK: redo; ';
  else
    raise exception '#984 prestate: operation_receipts_purpose_check is neither 0194''s three-value text nor #984''s four -- it reads %', v_def
      using errcode='CLR10';
  end if;

  -- 2 · THE TWO SHAPE CHECKS THAT READ THE PURPOSE, and the NOT NULL this file relaxes.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.accounting_work'::regclass and conname='ck_accounting_work_adjustment_basis';
  if v_def is null then
    raise exception '#984 prestate: ck_accounting_work_adjustment_basis is absent' using errcode='CLR10';
  end if;
  if v_def = 'CHECK ((((purpose = ''journal_entry''::text) AND (adjustment_basis IS NULL)) OR ((purpose <> ''journal_entry''::text) AND (adjustment_basis IS NOT NULL) AND (jsonb_typeof(adjustment_basis) = ''object''::text))))' then
    v_states := v_states || 'adjustment_basis CHECK: first apply (0194 one-purpose form); ';
  elsif position('opening_balance' in v_def) > 0 then
    v_states := v_states || 'adjustment_basis CHECK: redo; ';
  else
    raise exception '#984 prestate: ck_accounting_work_adjustment_basis is neither 0194''s form nor #984''s -- it reads %', v_def
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.operation_receipts'::regclass and conname='ck_operation_receipts_outcome_shape';
  if v_def is null then
    raise exception '#984 prestate: ck_operation_receipts_outcome_shape is absent' using errcode='CLR10';
  end if;
  if v_def = 'CHECK ((((outcome = ''committed''::text) AND (NULLIF(btrim(COALESCE((effects ->> ''entry_id''::text), ''''::text)), ''''::text) IS NOT NULL) AND (refusal IS NULL)) OR ((outcome = ''refused''::text) AND (refusal IS NOT NULL))))' then
    v_states := v_states || 'outcome-shape CHECK: first apply (entry_id for every purpose); ';
  elsif position('seed_id' in v_def) > 0 then
    v_states := v_states || 'outcome-shape CHECK: redo; ';
  else
    raise exception '#984 prestate: ck_operation_receipts_outcome_shape is neither 0178''s entry_id-only form nor #984''s -- it reads %', v_def
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_attribute
   where attrelid='clara.operation_receipts'::regclass and attname='task_id' and attnotnull;
  if v_n = 1 then
    v_states := v_states || 'operation_receipts.task_id: first apply (NOT NULL); ';
  else
    v_states := v_states || 'operation_receipts.task_id: redo (already nullable); ';
  end if;

  -- 3 · THE THREE BODIES THIS FILE LEAVES ALONE, pinned absolutely. Each closes the vocabulary
  --     on its own, and a drift in any of them changes what a fourth purpose would mean.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612' then
    raise exception '#984 prestate: clara._admit_accounting_work_core has DRIFTED (sha %) -- this file adds a SIBLING admission path precisely so this body is not recut, and cannot prove it left it alone against a body it does not know', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha is distinct from 'c4396f6cb28d6832ffe7efed98fb23af2ad776c25f57feda0fb6d14c0b7762bb' then
    raise exception '#984 prestate: clara._record_journal_entry_core has DRIFTED (sha %) -- the posting core''s three-value lookup is what AC5 asks this file to leave untouched', v_sha
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('''journal_entry'',''periodic_stock_adjustment'',''payroll_obligation''' in v_src) = 0 then
    raise exception '#984 prestate: the posting core no longer carries 0195''s three-value purpose IN-list'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure;
  if v_sha is distinct from '314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7' then
    raise exception '#984 prestate: clara._approve_opening_entry has DRIFTED (sha %) -- the per-entry approval this file counts the Work against', v_sha
      using errcode='CLR10';
  end if;

  -- 4 · THE GATE THIS FILE RECUTS: 0194's body, or #984's own after a redo.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid='clara._assert_adjustment_basis(text,jsonb)'::regprocedure;
  if v_sha = '69377e43cb924ad73ce87f6fd0fa26aa5c18597064b59bc88e8247fb31e2c263' then
    v_states := v_states || '_assert_adjustment_basis: first apply (0221-era body); ';
  elsif position('opening_balance' in v_src) > 0 then
    v_states := v_states || '_assert_adjustment_basis: redo; ';
  else
    raise exception '#984 prestate: clara._assert_adjustment_basis is neither its pinned body nor #984''s own (sha %) -- a third party recut the vocabulary gate', v_sha
      using errcode='CLR10';
  end if;

  -- 5 · THE TWO HUMAN DOORS THIS FILE RECUTS, at the bodies 0235 left AND at 0171's isolation
  --     pin. `create or replace` drops every SET clause it does not restate, so the pin is a
  --     premise of this file, not an incidental.
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid='clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha = 'f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132' then
    v_states := v_states || 'approve_opening_seed: first apply; ';
  elsif position('_admit_opening_work' in v_src) > 0 then
    v_states := v_states || 'approve_opening_seed: redo; ';
  else
    raise exception '#984 prestate: clara.approve_opening_seed is neither its pinned body nor #984''s own (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
    from pg_proc p where p.oid='clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure;
  if v_sha = '4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4' then
    v_states := v_states || 'approve_opening_correction: first apply; ';
  elsif position('_admit_opening_work' in v_src) > 0 then
    v_states := v_states || 'approve_opening_correction: redo; ';
  else
    raise exception '#984 prestate: clara.approve_opening_correction is neither its pinned body nor #984''s own (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure,
                   'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
     and p.proconfig::text like '%default_transaction_isolation=serializable%';
  if v_n <> 2 then
    raise exception '#984 prestate: % of the 2 opening doors still carry 0171''s SERIALIZABLE proconfig pin -- this file restates it and must not be the place it is lost', v_n
      using errcode='CLR10';
  end if;

  -- 6 · THE SIBLING NAME THIS FILE MINTS must not already belong to somebody else.
  if to_regprocedure('clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)') is null
     and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='clara' and p.proname='_admit_opening_work') then
    raise exception '#984 prestate: clara._admit_opening_work exists under a DIFFERENT signature -- this file would leave two'
      using errcode='CLR10';
  end if;

  v_state := v_states;
  raise notice '#984 prestate: clean -- %. The three bodies this file leaves alone (clara._admit_accounting_work_core, clara._record_journal_entry_core with its three-value IN-list, clara._approve_opening_entry) are at their pinned shas, and both opening doors still carry 0171''s SERIALIZABLE proconfig.', v_state;
end
$w984_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B  THE VOCABULARY GATE, RECUT. One new arm, in the position the journal-entry arm already
-- occupies: a purpose that carries no typed particulars, and refuses them by name when offered.
-- Everything else in this body is byte-identical to the body the rig carried before this file —
-- the statement below was generated FROM that body rather than retyped.
-- =====================================================================================
create or replace function clara._assert_adjustment_basis(p_purpose text, p_adjustment jsonb)
  returns void language plpgsql immutable security definer
  set search_path = clara, pg_temp as $abfn$
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
  -- #984 · THE OPENING ARM. An opening-balance work carries NO typed particulars, exactly as a
  -- journal-entry work does not: opening's figures are the opening ITEMS, already posted entries
  -- whose tie-out `clara._assert_opening_tie` owns. The refusal below is the journal-entry arm's
  -- own spelling because it is the same fault -- a purpose that supports none being offered some.
  if p_purpose = 'opening_balance' then
    if p_adjustment is not null then
      raise exception 'an opening-balance work carries no typed particulars' using errcode='CLR10',
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
end $abfn$;

-- =====================================================================================
-- §C  THE VOCABULARY ITSELF, widened in the four places the columns close it.
--
-- `drop constraint if exists` before `add constraint` is the redo rule (#957): re-running this
-- file over its own effects must be safe, and a CHECK is validated against every existing row as
-- it is added, so each of these is also a live proof that nothing already stored violates it.
--
-- THE THREE EXISTING VALUES ARE UNTOUCHED in every one of them: each list below is the old list
-- with ONE value appended, and §Z re-reads all four and refuses a text that lost one.
-- =====================================================================================

-- 1 · `clara.accounting_work.purpose` — 0178's column, 0194's three values, plus one.
alter table clara.accounting_work drop constraint if exists accounting_work_purpose_check;
alter table clara.accounting_work add constraint accounting_work_purpose_check
  check (purpose = any (array['journal_entry'::text, 'periodic_stock_adjustment'::text,
                             'payroll_obligation'::text, 'opening_balance'::text]));

-- 2 · `clara.operation_receipts.purpose` — the same vocabulary, asserted independently, so it is
--     widened in the same transaction. A receipt whose purpose its Work could not carry (or the
--     reverse) is the drift both CHECKs exist to make impossible.
alter table clara.operation_receipts drop constraint if exists operation_receipts_purpose_check;
alter table clara.operation_receipts add constraint operation_receipts_purpose_check
  check (purpose = any (array['journal_entry'::text, 'periodic_stock_adjustment'::text,
                             'payroll_obligation'::text, 'opening_balance'::text]));

-- 3 · THE TYPED-PARTICULARS SHAPE. 0194 wrote this as "journal_entry means none, anything else
--     means some". An opening Work is the second purpose that carries none, so the rule becomes a
--     two-value list on the NONE side and the complement on the other — the periodic-adjustment
--     and payroll arms are byte-for-byte what they were.
alter table clara.accounting_work drop constraint if exists ck_accounting_work_adjustment_basis;
alter table clara.accounting_work add constraint ck_accounting_work_adjustment_basis
  check (
    (purpose in ('journal_entry', 'opening_balance') and adjustment_basis is null)
    or (purpose not in ('journal_entry', 'opening_balance')
        and adjustment_basis is not null and jsonb_typeof(adjustment_basis) = 'object')
  );

-- 4 · THE RECEIPT'S OUTCOME SHAPE. A committed receipt must name what it did. For the three
--     model-served purposes that is the ONE entry the posting core wrote, and that arm is
--     unchanged. An opening batch commits N entries and owns none of them singly, so its arm
--     names the SEED — the object the batch is, and the key `effects` actually carries.
alter table clara.operation_receipts drop constraint if exists ck_operation_receipts_outcome_shape;
alter table clara.operation_receipts add constraint ck_operation_receipts_outcome_shape
  check (
    (outcome = 'committed' and refusal is null and (
       (purpose = 'opening_balance'
          and nullif(btrim(coalesce(effects ->> 'seed_id', '')), '') is not null)
       or (purpose <> 'opening_balance'
          and nullif(btrim(coalesce(effects ->> 'entry_id', '')), '') is not null)))
    or (outcome = 'refused' and refusal is not null)
  );

-- 5 · THE RUN THE OPENING LANE DOES NOT HAVE. `task_id` was NOT NULL with an FK to
--     `clara.agent_tasks`; an opening approval owns no run, so the column becomes nullable AND a
--     purpose-keyed CHECK makes that EXACT rather than merely permitted. The three model-served
--     purposes still REQUIRE their task — the invariant is tightened here, not loosened: before
--     this file "every receipt has a task" was a column property, and it is now a stated rule
--     with one named exception.
alter table clara.operation_receipts alter column task_id drop not null;
alter table clara.operation_receipts drop constraint if exists ck_operation_receipts_task_by_purpose;
alter table clara.operation_receipts add constraint ck_operation_receipts_task_by_purpose
  check (
    (purpose = 'opening_balance' and task_id is null)
    or (purpose <> 'opening_balance' and task_id is not null)
  );

-- =====================================================================================
-- §D  THE SIBLING ADMISSION PATH. Everything `clara._admit_accounting_work_core` does that an
-- opening approval needs, and nothing it does that an opening approval must not have.
--
-- WHY NOT THE CORE. `clara._admit_accounting_work_core` (a) holds its own closed three-value
-- purpose list, (b) demands a non-blank MODEL NAME, (c) inserts a `clara.agent_tasks` row and
-- points `current_task_id` at it, (d) asserts a JOURNAL BASIS (`clara._assert_journal_basis`:
-- posting date, memo, balanced lines) and (e) asserts the payload's relationship to those lines.
-- An opening approval has no model, no run, and no journal basis that is not already POSTED — its
-- lines are the opening items' own, approved by `clara._approve_opening_entry` before this
-- function is reached, and their tie-out is `clara._assert_opening_tie`'s. Widening that core
-- would mean either fabricating a model name and a synthetic basis to get past its gates, or
-- carving four branches through a body whose whole job is to admit model-served work. The Agent
-- Brief leaves the choice to the implementer "subject to the criteria"; those criteria are what
-- rules the core out.
--
-- WHAT IT IS NOT. It is not a door: granted to nobody, reachable only from the two SECURITY
-- DEFINER opening approvers, which have already taken `clara._human_ctx(role_rank('admin'))`, the
-- registry row lock, the client advisory rung and the whole tie assertion before they call it.
-- It re-derives no authority and asks no question they have not already answered — except the
-- one thing it CAN check cheaply and must: that the approver is still a member of this firm.
-- =====================================================================================
create or replace function clara._admit_opening_work(
    p_firm uuid, p_client uuid, p_actor uuid, p_seed uuid, p_batch integer,
    p_entries jsonb, p_op_key text, p_tie_document uuid, p_batch_kind text)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp as $aowfn$
declare
  v_work uuid; v_receipt uuid; v_logical text; v_role text; v_digest text;
  v_basis jsonb; v_effects jsonb; v_intent text; v_count int;
begin
  if p_batch_kind is null or p_batch_kind not in ('seed','correction') then
    raise exception 'unknown opening batch kind %', p_batch_kind using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"batch_kind","constraint":"closed_set"}';
  end if;
  if p_op_key is null or p_op_key ~ '^\s*$' then
    -- The receipt's `run_id` is this key and the column refuses a blank one with an untyped
    -- 23514. Both doors already refuse a blank op key by name; this says so again where the
    -- value is USED, so a future caller cannot reach the constraint instead of the refusal.
    raise exception 'an opening work receipt requires the operation key it was taken under'
      using errcode='CLR10', detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;
  -- THE PREDICATE SAYS WHAT THE REFUSAL SAYS (fix round, ADV-L01-04). This probe first ordered
  -- `active` rows ahead of the rest and took the top one, which tested membership EXISTENCE while
  -- the sentence and the `actor_not_active` detail claimed it had tested membership STATUS -- and
  -- `initiator_role`, the role this Work is recorded as taken under, could then be read off a
  -- REMOVED row. Unreachable through the two doors (both pass `c.firm`/`c.actor` from
  -- `clara._human_ctx`, whose `clara.jwt_firm()` and `clara.actor_role_rank()` each select
  -- `and m.status='active'`), but this body is a SEAM, and a third caller would inherit its own
  -- guard, not its callers'. The house pattern is the one §F uses 150 lines below.
  -- `order by created_at desc` stays: it makes the pick deterministic if a firm ever carries two
  -- active rows for one person, which is a different question from this one.
  select m.role into v_role from clara.firm_memberships m
   where m.user_id = p_actor and m.firm_id = p_firm and m.status = 'active'
   order by m.created_at desc limit 1;
  if v_role is null then
    raise exception 'the approver is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;

  v_count := coalesce(jsonb_array_length(p_entries), 0);
  -- THE BASIS IS WHAT WAS APPROVED, not a journal basis. There are no lines here on purpose: the
  -- lines belong to the entries, which are already posted and already tied out. `tie_document_id`
  -- is recorded as a FACT; it is deliberately NOT a `source_refs` entry, because a source ref is
  -- the journal lane's evidence CLAIM and stamping one would enrol the tie document in
  -- `clara._tf_intake_batch_member_work_stamp`'s open-batch hand-off.
  v_basis := jsonb_build_object(
    'kind', 'opening_balance', 'batch', p_batch_kind, 'seed_id', p_seed, 'batch_n', p_batch,
    'entry_count', v_count, 'entries', coalesce(p_entries, '[]'::jsonb),
    'tie_document_id', p_tie_document);
  v_digest := encode(clara._hash(v_basis), 'hex');
  -- THE VOCABULARY GATE, ASKED HERE TOO. §B taught it the opening purpose; asking it from the one
  -- body that mints an opening Work is what keeps that arm live rather than decorative — the day
  -- an opening Work grows typed particulars, it is refused in the same place every other purpose
  -- is refused.
  perform clara._assert_adjustment_basis('opening_balance', null);

  -- IDEMPOTENT ON (firm, client, intent_key), like every other Work. The key is derived from the
  -- seed and the BATCH NUMBER, which the registry increments on every approval, so a correction
  -- batch is a second Work rather than a conflict — and a replayed approval never reaches here at
  -- all, because `clara._reserve_op` answers the stored receipt first.
  v_intent := 'opening:' || p_batch_kind || ':' || p_seed::text || ':' || p_batch::text;
  v_work := gen_random_uuid();
  v_logical := 'work:' || v_work::text || ':opening_balance:1';
  insert into clara.accounting_work(id, firm_id, client_id, purpose, status, initiator,
      initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin, source_refs,
      adjustment_basis, current_task_id, result)
    values (v_work, p_firm, p_client, 'opening_balance', 'completed', p_actor, v_role, v_intent,
      v_logical, v_basis, v_digest, 'user_direct', '[]'::jsonb, null, null,
      jsonb_build_object('seed_id', p_seed, 'batch_n', p_batch, 'entry_count', v_count,
        'entries', coalesce(p_entries, '[]'::jsonb)));

  -- THE RECEIPT. `acting_actor` is the HUMAN, not `clara.agent_user_id()`: nothing acted on
  -- anyone's behalf here, and `on_behalf_of` is the same person for the same reason. `task_id` is
  -- null, which §C's purpose-keyed CHECK now requires for this purpose and refuses for the other
  -- three. `run_id` is the operation key the door was called under — the only run identity a
  -- human door has. `effects` names the SEED and the batch, never an entry (see §C item 4).
  v_effects := jsonb_build_object('seed_id', p_seed, 'batch_n', p_batch, 'entry_count', v_count,
    'batch_kind', p_batch_kind, 'entries', coalesce(p_entries, '[]'::jsonb));
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    values (p_firm, p_client, v_work, 'opening_balance', v_logical, v_digest,
      p_actor, p_actor, 'opening_approval', v_digest, p_op_key, null, 'committed', v_effects)
    returning id into v_receipt;

  return jsonb_build_object('work_id', v_work, 'receipt_id', v_receipt,
    'logical_op_id', v_logical, 'intent_key', v_intent);
end $aowfn$;
revoke all on function clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text) from public;
comment on function clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text) is
  '#984: mints the ONE clara.accounting_work row and the ONE clara.operation_receipts row an '
  'approved opening batch (seed or correction) now carries, under the opening_balance purpose. '
  'The SIBLING of clara._admit_accounting_work_core, not a widening of it: no agent task, no '
  'model name, no journal basis and no posting — the entries are already approved by '
  'clara._approve_opening_entry and tied out by clara._assert_opening_tie before this is called. '
  'Granted to nobody: reachable only from clara.approve_opening_seed and '
  'clara.approve_opening_correction, which have already taken the admin floor, the registry lock '
  'and the client rung.';

-- =====================================================================================
-- §E  THE HUMAN DOORS, RECUT. One statement each, in the same position: after the registry is
-- finalized and before the audit row, so the audit names the Work and the receipt it minted.
-- Everything else in both bodies is byte-identical to what the rig carried before this file —
-- both statements were generated FROM those bodies rather than retyped, and §A pinned the shas
-- they were generated from.
--
-- 0171's `default_transaction_isolation = serializable` and the pinned `search_path` are RESTATED
-- here because `create or replace function` drops every SET clause it does not repeat. §Z counts
-- the isolation-pinned bodies in the whole database and refuses any answer but these two.
-- =====================================================================================
create or replace function clara.approve_opening_seed(p_seed uuid, p_expected_plan_revision uuid,
    p_tie_document_sha256 text, p_entry_revisions jsonb, p_attestation text, p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp
  set default_transaction_isolation = serializable as $aosfn$
declare
  c record; s record; p record; e record; q record; v_dedupe jsonb;
  v_batch int; v_entries jsonb:='[]'::jsonb; v_result jsonb; v_seq bigint;
  v_work jsonb;                                                            -- #984
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if current_setting('transaction_isolation')<>'serializable' then
    raise exception 'opening batch approval requires serializable isolation'
      using errcode='CLR31',detail='{"reason":"not_serializable"}';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select firm_id into s from clara.opening_seed_registry where id=p_seed;
  if s.firm_id is null or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_opening_seed',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,
      'plan_revision',p_expected_plan_revision,
      'tie_sha256',p_tie_document_sha256,
      'entry_revisions',p_entry_revisions,'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(s.client_id::text));
  select * into p from clara.onboarding_plans where id=s.plan_id for update;
  if p.revision_token is distinct from p_expected_plan_revision then
    raise exception 'stale onboarding plan revision'
      using errcode='CLR31',detail='{"reason":"stale_plan"}';
  end if;
  if s.tie_document_id is not null then
    if p_tie_document_sha256 is distinct from s.tie_document_sha256 then
      raise exception 'tie document hash changed'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    perform clara._active_document_filing(
      s.tie_document_id,s.tie_document_sha256,s.client_id,true);
    -- [R1-F2] A tied registry is wholly document-primary. Every target must
    -- carry the exact tie identity/hash and resolve to stored extraction rows.
    if exists(select 1 from clara.opening_tb_targets t
        where t.seed_id=s.id and t.firm_id=s.firm_id
          and t.client_id=s.client_id and (
          t.provenance_kind<>'document'
          or t.document_id is distinct from s.tie_document_id
          or t.source_sha256 is distinct from s.tie_document_sha256
          or t.extraction_ref is null)) then
      raise exception 'every opening target must bind to the tie document'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    -- [R2-F1] K5 re-runs the field-level fact comparison so a stale extraction
    -- or any target mutation cannot be laundered between parse and approval.
    for q in select extraction_ref,account_code,debit_cents,credit_cents
        from clara.opening_tb_targets t
        where t.seed_id=s.id and t.firm_id=s.firm_id
          and t.client_id=s.client_id
          and t.document_id=s.tie_document_id loop
      perform clara._assert_opening_target_fact(
        s.firm_id,s.tie_document_id,q.extraction_ref,
        q.account_code,q.debit_cents,q.credit_cents);
    end loop;
  elsif exists(select 1 from clara.opening_tb_targets t
      where t.seed_id=s.id and t.firm_id=s.firm_id
        and t.client_id=s.client_id and (
        t.provenance_kind<>'keyed' or t.entered_by is null
        or t.document_id is not null or t.source_sha256 is not null
        or t.extraction_ref is not null
        or not exists(select 1 from clara.firm_memberships m
          where m.firm_id=s.firm_id and m.user_id=t.entered_by
            and m.status='active'
            and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')))) then
    -- [R1-F2] The no-document fallback is wholly keyed and attributable to a
    -- currently eligible firm professional.
    raise exception 'keyed fallback requires every target to be attributed'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
  if not exists(select 1 from clara.opening_items oi
      join clara.journal_entries je on je.id=oi.entry_id
      where oi.seed_id=p_seed and je.status='draft') then
    raise exception 'opening seed has no draft entries'
      using errcode='CLR31',detail='{"reason":"revision_mismatch"}';
  end if;
  for e in select je.* from clara.opening_items oi
      join clara.journal_entries je on je.id=oi.entry_id
      where oi.seed_id=p_seed and je.status='draft' order by oi.item_key loop
    -- [R1-F2] Revalidate each draft's active filing and immutable content hash
    -- at K5, rather than trusting evidence captured when K3 drafted it.
    if s.tie_document_id is not null then
      if e.document_id is distinct from s.tie_document_id
         or e.source_doc_sha256 is distinct from s.tie_document_sha256 then
        raise exception 'opening entry no longer binds to the tie document'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
      perform clara._active_document_filing(
        e.document_id,e.source_doc_sha256,s.client_id,true);
    elsif e.document_id is not null or e.filing_id is not null
       or e.source_doc_sha256 is not null then
      raise exception 'keyed opening fallback cannot contain a document entry'
        using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
    end if;
    if not clara._opening_revision_matches(
        p_entry_revisions,e.id,e.revision_token) then
      raise exception 'opening entry revision mismatch'
        using errcode='CLR31',detail=jsonb_build_object(
          'reason','revision_mismatch','entry_id',e.id)::text;
    end if;
    -- K5 step order (battery DEF-1): the checker separation is verified HERE, with
    -- the revisions, BEFORE the tie assert. _approve_opening_entry re-checks as
    -- defense-in-depth (same CLR05 semantics).
    if e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'opening entry needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif nullif(btrim(p_attestation),'') is null then
        raise exception 'solo opening approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      end if;
    end if;
  end loop;
  select * into q from clara._open_question_blocks(s.client_id,null,null) limit 1;
  if found then
    raise exception 'an open question blocks the opening batch'
      using errcode='CLR26',detail=jsonb_build_object(
        'question_id',q.question_id,'scope',q.scope_kind)::text;
  end if;
  if exists(select 1 from clara._opening_seed_draft_class(p_seed) where is_correction) then raise exception 'a correction draft blocks the opening batch' using errcode='CLR31',detail='{"reason":"correction_draft_present"}'; end if; perform clara._assert_opening_tie(p_seed);
  -- 0056 (Wave E lane beta, skeleton 2.6 item 2 / matrix A19g): the seed-approval arm
  -- of opening(n+1) = closing(n), asserted against the PRIOR receipt's PINNED position.
  perform clara._assert_seed_matches_prior_pin(p_seed);
  perform clara._assert_fa_baseline(p_seed);
  v_batch:=s.batch_n+1;
  for e in select je.* from clara.opening_items oi
      join clara.journal_entries je on je.id=oi.entry_id
      where oi.seed_id=p_seed and je.status='draft' order by oi.item_key loop
    v_entries:=v_entries||clara._approve_opening_entry(
      p_seed,e.id,c.actor,p_attestation,v_batch);
  end loop;
  -- [R3-F4] K5 publishes initial register rows only after every linked
  -- acquisition entry has approved in this same transaction. Correction
  -- replacements remain K6-only because they carry supersedes_asset_id.
  update clara.fixed_assets fa set status='active',updated_at=now()
  from clara.opening_items oi,clara.journal_entries je
  where oi.seed_id=p_seed and oi.item_kind='fixed_asset'
    and oi.state='active' and oi.supersedes_item_id is null
    and oi.firm_id=s.firm_id and oi.client_id=s.client_id
    and fa.id=oi.fixed_asset_id and fa.firm_id=oi.firm_id
    and fa.client_id=oi.client_id and fa.status='pending'
    and fa.supersedes_asset_id is null
    and je.id=oi.entry_id and je.firm_id=oi.firm_id
    and je.client_id=oi.client_id and je.status='approved';
  perform clara._assert_fa_baseline(p_seed);
  update clara.onboarding_plan_items set state='resolved',
    answer=coalesce(answer,jsonb_build_object('source','opening_seed',
      'seed_id',p_seed)),answered_by=coalesce(answered_by,c.actor),
    answered_at=coalesce(answered_at,now()),updated_at=now()
    where plan_id=s.plan_id and item_kind='capture'
      and state in ('pending','answered');
  -- [R3-F3] Conservative checker policy: checking a K5 set influences that
  -- plan, so the checker is recorded through the same contributor effect used
  -- at every other material boundary.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  select coalesce(max(seq),0) into v_seq from clara.domain_events
    where firm_id=c.firm;
  update clara.opening_seed_registry set state='finalized',batch_n=v_batch,
    finalized_at=now(),finalized_by=c.actor,tie_asserted_at=now(),
    through_event_seq=v_seq where id=p_seed;
  -- #984 · THE WORK AND ITS RECEIPT. One `clara.accounting_work` row and one
  -- `clara.operation_receipts` row under the `opening_balance` purpose, minted by the SIBLING
  -- admission path (`clara._admit_opening_work`) rather than by `clara._admit_accounting_work_core`:
  -- that core inserts an `agent_tasks` row for a model run, and this approval is deterministic and
  -- human-made. The dedicated `clara.opening_seed_approvals` receipt above is untouched.
  -- `v_entries` CANNOT BE EMPTY HERE (fix round, ADV-L01-08): this door's own "opening seed has no
  -- draft entries" arm (0017's, kept verbatim above) refuses an empty batch BEFORE the loop that
  -- builds it, so no `entry_count = 0` Work is reachable through either door. Measured on the rig
  -- rather than reasoned: approving a seed with nothing staged raises CLR31 and writes no
  -- accounting_work and no operation_receipts row (`obw984.zero_entry`). The order matters -- a
  -- later recut that hoists this call above that arm would mint a Work out of nothing.
  v_work:=clara._admit_opening_work(c.firm,s.client_id,c.actor,p_seed,v_batch,v_entries,
    p_op_key,s.tie_document_id,'seed');
  perform clara._audit(c.firm,c.actor,null,null,'approve_opening_seed',null,
    jsonb_build_object('seed',p_seed,'batch_n',v_batch,
      'entries',v_entries,'op_key',p_op_key,
      'work',v_work->>'work_id','receipt',v_work->>'receipt_id',
      'purpose','opening_balance'));
  for e in select je.* from clara.opening_seed_approvals a
      join clara.journal_entries je on je.id=a.entry_id
      where a.seed_id=p_seed and a.batch_n=v_batch order by a.id loop
    perform clara._append_event(c.firm,'entry.approved',s.client_id,c.actor,
      null,null,e.id,e.document_id,null,
      jsonb_build_object('opening_seed_id',p_seed,'batch_n',v_batch));
  end loop;
  perform clara._append_event(c.firm,'opening_seed.batch_approved',s.client_id,
    c.actor,null,null,null,s.tie_document_id,null,
    jsonb_build_object('seed_id',p_seed,'batch_n',v_batch,
      'entry_count',jsonb_array_length(v_entries)));
  v_result:=jsonb_build_object('seed_id',p_seed,'status','finalized',
    'batch_n',v_batch,'entry_count',jsonb_array_length(v_entries),'entries',v_entries);
  return clara._finish_op(c.firm,'approve_opening_seed',p_op_key,v_result);
end $aosfn$;
create or replace function clara.approve_opening_correction(p_seed uuid, p_entry_revisions jsonb,
    p_attestation text, p_op_key text)
  returns jsonb language plpgsql security definer
  set search_path = clara, pg_temp
  set default_transaction_isolation = serializable as $aocfn$
declare
  c record; s record; e record; q record; oi record; v_dedupe jsonb;
  v_batch int; v_entries jsonb:='[]'::jsonb; v_result jsonb; v_replacement uuid;
  v_work jsonb;                                                            -- #984
  v_asset_transition_count int;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if current_setting('transaction_isolation')<>'serializable' then
    raise exception 'opening correction approval requires serializable isolation'
      using errcode='CLR31',detail='{"reason":"not_serializable"}';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select firm_id into s from clara.opening_seed_registry where id=p_seed;
  if s.firm_id is null or s.firm_id<>c.firm then
    raise exception 'opening seed not in your firm' using errcode='CLR11';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'approve_opening_correction',p_op_key,
    clara._hash(jsonb_build_object('seed',p_seed,
      'entry_revisions',p_entry_revisions,'attestation',p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into s from clara.opening_seed_registry where id=p_seed for update;
  if s.state<>'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31',detail='{"reason":"registry_not_open"}';
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(s.client_id::text));
  select * into q from clara._open_question_blocks(s.client_id,null,null) limit 1;
  if found then
    raise exception 'an open question blocks the opening correction'
      using errcode='CLR26',detail=jsonb_build_object(
        'question_id',q.question_id,'scope',q.scope_kind)::text;
  end if;
  if exists(select 1 from clara._opening_seed_draft_class(p_seed) where not is_correction) then raise exception 'a non-correction draft blocks the opening correction' using errcode='CLR31',detail='{"reason":"non_correction_draft_present"}'; end if; if not exists(select 1 from clara.journal_entries je
      where je.status='draft' and je.is_opening_balance and (
        exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.id and x.supersedes_item_id is not null)
        or exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.reversal_of))) then
    raise exception 'opening correction has no draft entries'
      using errcode='CLR31',detail='{"reason":"revision_mismatch"}';
  end if;
  for e in select je.* from clara.journal_entries je
      where je.status='draft' and je.is_opening_balance and (
        exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.id and x.supersedes_item_id is not null)
        or exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.reversal_of)) order by je.id loop
    if not clara._opening_revision_matches(
        p_entry_revisions,e.id,e.revision_token) then
      raise exception 'opening correction revision mismatch'
        using errcode='CLR31',detail=jsonb_build_object(
          'reason','revision_mismatch','entry_id',e.id)::text;
    end if;
    -- [R1-F12] K6 mirrors K5: checker separation is preflighted for every
    -- correction draft before any tie or fixed-asset assertion can run.
    if e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'opening correction needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif nullif(btrim(p_attestation),'') is null then
        raise exception 'solo opening correction requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      end if;
    end if;
  end loop;
  -- 0056 S9b (Wave E lane beta; the battery's seventh catch): while a pinned
  -- close stands, a correction batch must be balance-sheet-neutral per account --
  -- anything else moves every subsequent closing; reopen first (key 3).
  perform clara._assert_correction_pin_neutral(p_seed);
  perform clara._assert_opening_tie(p_seed);
  perform clara._assert_fa_baseline(p_seed);
  v_batch:=s.batch_n+1;
  for e in select je.* from clara.journal_entries je
      where je.status='draft' and je.is_opening_balance and (
        exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.id and x.supersedes_item_id is not null)
        or exists(select 1 from clara.opening_items x where x.seed_id=p_seed
          and x.entry_id=je.reversal_of)) order by je.id loop
    v_entries:=v_entries||clara._approve_opening_entry(
      p_seed,e.id,c.actor,p_attestation,v_batch);
  end loop;
  for oi in select old.* from clara.opening_items old
      where old.seed_id=p_seed and old.state='active'
        and exists(select 1 from clara.opening_items repl
          where repl.seed_id=p_seed and repl.supersedes_item_id=old.id
            and exists(select 1 from clara.journal_entries je
              where je.id=repl.entry_id and je.status='approved')) loop
    select id into v_replacement from clara.opening_items
      where seed_id=p_seed and supersedes_item_id=oi.id
      order by created_at desc,id desc limit 1;
    update clara.opening_items set state='superseded',
      superseded_by_item=v_replacement where id=oi.id;
    -- [R2-F3] One SQL statement performs the register hand-off: the pending
    -- replacement becomes active exactly as the predecessor becomes
    -- superseded. A two-row count is required; partial transitions abort.
    if oi.fixed_asset_id is not null then
      update clara.fixed_assets fa set
        status=case when fa.id=oi.fixed_asset_id
          then 'superseded' else 'active' end,
        superseded_by_asset_id=case when fa.id=oi.fixed_asset_id
          then repl.fixed_asset_id else null end,
        -- 0041 [round-3.5 fold G3] THE SUPERSEDE DATE. Without it clara._fa_included_at holds
        -- BOTH the corrected row and its replacement in the register at every as-of, and the
        -- D-a tie reads double on a corrected carry-down. The date is the correction entry's
        -- own posting date -- an accounting date, like every other boundary the as-of rule
        -- reads.
        superseded_at=case when fa.id=oi.fixed_asset_id
          then rje.posting_date else null end,
        updated_at=now()
      from clara.opening_items repl
        join clara.journal_entries rje on rje.id=repl.entry_id
      where repl.id=v_replacement and repl.fixed_asset_id is not null
        and fa.id in (oi.fixed_asset_id,repl.fixed_asset_id)
        and ((fa.id=oi.fixed_asset_id and fa.status='active')
          or (fa.id=repl.fixed_asset_id and fa.status='pending'));
      get diagnostics v_asset_transition_count=row_count;
      if v_asset_transition_count<>2 then
        raise exception 'fixed-asset replacement transition is incomplete'
          using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
      end if;
    end if;
  end loop;
  -- [R3-F3] K5 and K6 use one checker policy: approving either set records the
  -- checker as a contributor before the plan can be used at Gate O.
  perform clara._record_onboarding_contributor(s.plan_id,c.actor);
  -- [R3-F4] Re-check the post-hand-off correspondence in the same transaction.
  perform clara._assert_fa_baseline(p_seed);
  update clara.opening_seed_registry set state='finalized',batch_n=v_batch,
    finalized_at=now(),finalized_by=c.actor,tie_asserted_at=now(),
    through_event_seq=(select coalesce(max(seq),0) from clara.domain_events
      where firm_id=c.firm) where id=p_seed;
  -- #984 · THE WORK AND ITS RECEIPT, on exactly the footing the seed door mints them: one Work,
  -- one operation receipt, the `opening_balance` purpose, no agent task and no model name. A
  -- correction batch is a second approval of the same registry, so it is a SECOND Work -- its own
  -- batch_n is what keeps the intent key distinct.
  v_work:=clara._admit_opening_work(c.firm,s.client_id,c.actor,p_seed,v_batch,v_entries,
    p_op_key,s.tie_document_id,'correction');
  perform clara._audit(c.firm,c.actor,null,null,'approve_opening_correction',null,
    jsonb_build_object('seed',p_seed,'batch_n',v_batch,
      'entries',v_entries,'op_key',p_op_key,
      'work',v_work->>'work_id','receipt',v_work->>'receipt_id',
      'purpose','opening_balance'));
  for e in select je.* from clara.opening_seed_approvals a
      join clara.journal_entries je on je.id=a.entry_id
      where a.seed_id=p_seed and a.batch_n=v_batch order by a.id loop
    perform clara._append_event(c.firm,'entry.approved',s.client_id,c.actor,
      null,null,e.id,e.document_id,null,
      jsonb_build_object('opening_seed_id',p_seed,'batch_n',v_batch,
        'correction',true));
    if e.reversal_of is not null then
      perform clara._append_event(c.firm,'entry.reversed',s.client_id,c.actor,
        null,null,e.reversal_of,null,null,
        jsonb_build_object('opening_seed_id',p_seed));
    end if;
  end loop;
  for oi in select * from clara.opening_items where seed_id=p_seed
      and state='superseded'
      and superseded_by_item in (select item_id from clara.opening_seed_approvals
        where seed_id=p_seed and batch_n=v_batch) loop
    perform clara._append_event(c.firm,'opening_item.superseded',s.client_id,
      c.actor,null,null,oi.entry_id,null,null,jsonb_build_object(
        'seed_id',p_seed,'item_id',oi.id,
        'superseded_by_item',oi.superseded_by_item,'batch_n',v_batch));
  end loop;
  v_result:=jsonb_build_object('seed_id',p_seed,'status','finalized',
    'batch_n',v_batch,'entry_count',jsonb_array_length(v_entries),'entries',v_entries);
  return clara._finish_op(c.firm,'approve_opening_correction',p_op_key,v_result);
end $aocfn$;

reset role;

-- =====================================================================================
-- §Z  TAIL CENSUS. Everything above, re-read from the catalog.
-- =====================================================================================
do $w984_tail$
declare v_src text; v_sha text; v_def text; v_n int; v_role text; v_sig text;
begin
  -- 1 · THE VOCABULARY GATE knows the fourth value and still closes on a fifth.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._assert_adjustment_basis(text,jsonb)'::regprocedure;
  if position('opening_balance' in v_src) = 0 then
    raise exception '#984 tail: clara._assert_adjustment_basis does not know the opening purpose'
      using errcode='CLR10';
  end if;
  if position('invalid_purpose' in v_src) = 0 then
    raise exception '#984 tail: clara._assert_adjustment_basis no longer raises invalid_purpose -- widened, not opened, is the whole contract'
      using errcode='CLR10';
  end if;
  if position('''periodic_stock_adjustment'',''payroll_obligation''' in v_src) = 0 then
    raise exception '#984 tail: the gate''s two-purpose particulars list moved -- the three prior purposes must be untouched'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid='clara._assert_adjustment_basis(text,jsonb)'::regprocedure
     and r.rolname='clara_fn_owner' and p.prosecdef
     and p.provolatile='i' and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#984 tail: clara._assert_adjustment_basis lost its owner, IMMUTABLE volatility, SECURITY DEFINER flag or pinned search_path'
      using errcode='CLR10';
  end if;

  -- 2 · THE FOUR CHECKS. Each is re-read from the catalog, each must name the fourth value, and
  --     each must still name all THREE it had before. A widening that dropped one would pass a
  --     test that only looked for the new token.
  foreach v_sig in array array['clara.accounting_work|accounting_work_purpose_check',
                               'clara.operation_receipts|operation_receipts_purpose_check'] loop
    select pg_get_constraintdef(oid) into v_def from pg_constraint
     where conrelid = split_part(v_sig,'|',1)::regclass and conname = split_part(v_sig,'|',2);
    if v_def is null then
      raise exception '#984 tail: % is absent', v_sig using errcode='CLR10';
    end if;
    foreach v_role in array array['journal_entry','periodic_stock_adjustment','payroll_obligation',
                                  'opening_balance'] loop
      if position('''' || v_role || '''' in v_def) = 0 then
        raise exception '#984 tail: % no longer admits % -- the vocabulary is FOUR values, the three prior ones untouched', v_sig, v_role
          using errcode='CLR10';
      end if;
    end loop;
    select count(*)::int into v_n from regexp_matches(v_def, '''[a-z_]+''::text', 'g');
    if v_n <> 4 then
      raise exception '#984 tail: % lists % values, not 4', v_sig, v_n using errcode='CLR10';
    end if;
  end loop;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.accounting_work'::regclass and conname='ck_accounting_work_adjustment_basis';
  if position('opening_balance' in v_def) = 0 or position('journal_entry' in v_def) = 0 then
    raise exception '#984 tail: ck_accounting_work_adjustment_basis does not carry both no-particulars purposes -- it reads %', v_def
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.operation_receipts'::regclass and conname='ck_operation_receipts_outcome_shape';
  if position('seed_id' in v_def) = 0 or position('entry_id' in v_def) = 0 then
    raise exception '#984 tail: ck_operation_receipts_outcome_shape lost an arm -- the three prior purposes still name an ENTRY and opening names its SEED; it reads %', v_def
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.operation_receipts'::regclass and conname='ck_operation_receipts_task_by_purpose';
  if v_def is null then
    raise exception '#984 tail: ck_operation_receipts_task_by_purpose is absent -- dropping the NOT NULL without it would let ANY receipt lose its run'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_attribute
   where attrelid='clara.operation_receipts'::regclass and attname='task_id' and attnotnull;
  if v_n <> 0 then
    raise exception '#984 tail: clara.operation_receipts.task_id is still NOT NULL -- an opening receipt owns no run'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='clara.operation_receipts'::regclass
                   and conname='operation_receipts_task_id_fkey' and contype='f') then
    raise exception '#984 tail: the task FK is gone -- nullable is not unbound'
      using errcode='CLR10';
  end if;

  -- 3 · THE SIBLING ADMISSION PATH: owned, definer, pinned, and granted to NOBODY.
  if to_regprocedure('clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)') is null then
    raise exception '#984 tail: clara._admit_opening_work is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid=p.proowner
   where p.oid='clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)'::regprocedure
     and r.rolname='clara_fn_owner' and p.prosecdef
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#984 tail: clara._admit_opening_work is not a clara_fn_owner SECURITY DEFINER with a pinned search_path'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['public','clara_authenticated','clara_runtime','clara_agent_ro'] loop
    if to_regrole(v_role) is not null
       and has_function_privilege(v_role,
             'clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)'::regprocedure,
             'execute') then
      raise exception '#984 tail: % is EXECUTE-reachable on clara._admit_opening_work -- it is reachable only from the two opening doors', v_role
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,uuid,text)'::regprocedure;
  if position('agent_tasks' in v_src) > 0 then
    raise exception '#984 tail: clara._admit_opening_work names clara.agent_tasks -- an opening Work acquires no model run (AC3)'
      using errcode='CLR10';
  end if;
  if position('model' in v_src) > 0 then
    raise exception '#984 tail: clara._admit_opening_work names a model -- nothing served this act but a person'
      using errcode='CLR10';
  end if;
  if position('clara._assert_adjustment_basis' in v_src) = 0 then
    raise exception '#984 tail: clara._admit_opening_work does not ask the vocabulary gate -- §B''s new arm would be decorative'
      using errcode='CLR10';
  end if;
  -- (fix round, ADV-L01-04) The one authority question this body re-derives must be the one its
  -- refusal names. Read off the live body, not off the file this tail ships in.
  if position('m.status = ''active''' in v_src) = 0 then
    raise exception '#984 tail: clara._admit_opening_work''s membership probe does not filter status=''active'' -- it raises actor_not_active, so the predicate must test activeness and not mere membership'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_admit_opening_work';
  if v_n <> 1 then
    raise exception '#984 tail: % bodies answer to clara._admit_opening_work, not 1', v_n using errcode='CLR10';
  end if;

  -- 4 · THE HUMAN DOORS: recut to call the sibling, and unmoved in every other respect that can
  --     be read from the catalog. `create or replace` preserves owner and ACL; the SET clauses it
  --     does NOT preserve are restated in §E and re-read here.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if position('clara._admit_opening_work' in v_src) = 0 then
    raise exception '#984 tail: clara.approve_opening_seed does not mint the Work' using errcode='CLR10';
  end if;
  if position('clara._approve_opening_entry' in v_src) = 0
     or position('clara._assert_opening_tie' in v_src) = 0
     or position('clara._finish_op' in v_src) = 0 then
    raise exception '#984 tail: clara.approve_opening_seed lost the per-entry approval, the tie assertion or the op receipt -- this file adds one statement and removes none'
      using errcode='CLR10';
  end if;
  if position('clara._admit_opening_work' in v_src) < position('clara._assert_opening_tie' in v_src) then
    raise exception '#984 tail: the seed door mints its Work BEFORE it ties out -- the Work records an act that has already happened'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure;
  if position('clara._admit_opening_work' in v_src) = 0 then
    raise exception '#984 tail: clara.approve_opening_correction does not mint the Work -- both doors approve an opening batch and both owe one'
      using errcode='CLR10';
  end if;
  if position('clara._approve_opening_entry' in v_src) = 0
     or position('clara._assert_opening_tie' in v_src) = 0
     or position('clara._assert_correction_pin_neutral' in v_src) = 0
     or position('clara._finish_op' in v_src) = 0 then
    raise exception '#984 tail: clara.approve_opening_correction lost the per-entry approval, the pin-neutrality assertion, the tie assertion or the op receipt'
      using errcode='CLR10';
  end if;
  if position('clara._admit_opening_work' in v_src) < position('clara._assert_opening_tie' in v_src) then
    raise exception '#984 tail: the correction door mints its Work BEFORE it ties out'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
                               'clara.approve_opening_correction(uuid,jsonb,text,text)'] loop
    select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid=p.proowner
     where p.oid = v_sig::regprocedure and r.rolname='clara_fn_owner' and p.prosecdef
       and p.proconfig @> array['search_path=clara, pg_temp']
       and p.proconfig::text like '%default_transaction_isolation=serializable%';
    if v_n <> 1 then
      raise exception '#984 tail: % lost its owner, SECURITY DEFINER flag, pinned search_path or 0171 SERIALIZABLE pin', v_sig
        using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
      raise exception '#984 tail: clara_authenticated can no longer execute % -- the human door narrowed', v_sig
        using errcode='CLR10';
    end if;
    foreach v_role in array array['public','clara_runtime','clara_agent_ro'] loop
      if to_regrole(v_role) is not null
         and has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception '#984 tail: % gained EXECUTE on % -- the human door widened', v_role, v_sig
          using errcode='CLR10';
      end if;
    end loop;
  end loop;
  -- ...and the isolation pin is still carried by EXACTLY these two bodies and no other, which is
  -- 0235's own tail assertion restated: this file rewrote both of them and is the one place that
  -- pin could have been dropped.
  select count(*)::int into v_n from pg_proc p
   where p.proconfig::text like '%default_transaction_isolation=serializable%';
  if v_n <> 2 then
    raise exception '#984 tail: % bodies pin a transaction isolation level, not 2', v_n using errcode='CLR10';
  end if;

  -- 5 · THE TWO BODIES THIS FILE MUST NOT HAVE MOVED, and the posting core's closed lookup, which
  --     AC5 asks to be proven by RE-READING the body rather than by reasoning about it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from '10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612' then
    raise exception '#984 tail: clara._admit_accounting_work_core moved during this migration (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha is distinct from 'c4396f6cb28d6832ffe7efed98fb23af2ad776c25f57feda0fb6d14c0b7762bb' then
    raise exception '#984 tail: clara._record_journal_entry_core moved during this migration (sha %) -- AC5 asks exactly that it did not', v_sha
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if position('''journal_entry'',''periodic_stock_adjustment'',''payroll_obligation''' in v_src) = 0 then
    raise exception '#984 tail: the posting core''s purpose IN-list is no longer the 0195 three'
      using errcode='CLR10';
  end if;
  if position('opening_balance' in v_src) > 0 then
    raise exception '#984 tail: the posting core NAMES the opening purpose -- an opening Work must never reach it (its entries are posted before the Work exists)'
      using errcode='CLR10';
  end if;

  raise notice '#984 tail: OK -- the purpose vocabulary is FOUR values on both column CHECKs with the three prior ones untouched; ck_accounting_work_adjustment_basis now lists both no-particulars purposes; ck_operation_receipts_outcome_shape keeps the entry_id arm for the three model-served purposes and names the SEED for an opening batch; clara.operation_receipts.task_id is nullable but purpose-keyed, so the three still REQUIRE a run and opening REFUSES one, with the agent_tasks FK intact. clara._assert_adjustment_basis admits the opening purpose with null particulars and still answers invalid_purpose outside the vocabulary. clara._admit_opening_work is a clara_fn_owner SECURITY DEFINER with a pinned search_path, granted to NOBODY, naming neither clara.agent_tasks nor a model, and asking the vocabulary gate itself. clara.approve_opening_seed mints the Work AFTER its tie assertion and keeps its owner, SECURITY DEFINER flag, pinned search_path, 0171 SERIALIZABLE pin and its clara_authenticated-only EXECUTE audience; exactly two bodies in the database pin an isolation level and both are the opening doors. clara._admit_accounting_work_core and clara._record_journal_entry_core are re-read at their pinned shas, unmoved, and the posting core still looks a Work up through its closed three-value IN-list and does not name the opening purpose.';
end
$w984_tail$;
