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

reset role;

-- =====================================================================================
-- §Z  TAIL CENSUS. Everything above, re-read from the catalog.
-- =====================================================================================
do $w984_tail$
declare v_src text; v_sha text; v_def text; v_n int; v_role text;
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
     and r.rolname='clara_fn_owner' and p.prosecdef and p.proisstrict is not null
     and p.provolatile='i' and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#984 tail: clara._assert_adjustment_basis lost its owner, IMMUTABLE volatility, SECURITY DEFINER flag or pinned search_path'
      using errcode='CLR10';
  end if;
  foreach v_role in array array['public','clara_authenticated','clara_runtime','clara_agent_ro'] loop
    if to_regrole(v_role) is not null
       and has_function_privilege(v_role, 'clara._assert_adjustment_basis(text,jsonb)'::regprocedure, 'execute') then
      raise exception '#984 tail: % is EXECUTE-reachable on clara._assert_adjustment_basis -- it is an internal', v_role
        using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE TWO BODIES THIS FILE MUST NOT HAVE MOVED.
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

  raise notice '#984 tail: OK -- clara._assert_adjustment_basis admits the opening purpose with null particulars, refuses typed ones by name, still answers invalid_purpose outside the vocabulary, and keeps its owner, IMMUTABLE volatility, SECURITY DEFINER flag, pinned search_path and empty EXECUTE audience. clara._admit_accounting_work_core and clara._record_journal_entry_core are re-read at their pinned shas, unmoved.';
end
$w984_tail$;
