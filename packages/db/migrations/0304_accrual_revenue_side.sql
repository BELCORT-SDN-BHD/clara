-- 0304_accrual_revenue_side — #942 (riders wave 4, lane 03): THE ACCRUAL LANE GAINS A REVENUE
-- SIDE (Dr accrued income / Cr revenue, auto-reversed), MIRRORING EXPENSE ACCRUALS.
-- =====================================================================================
-- Spec of record: issue #942's body, its 2026-09-18/09-19 triage comment and the OWNER'S RULING
-- of 2026-09-20 on that comment. Parent: the owner's idea session of 2026-09-18. Domain words:
-- CONTEXT.md — "Accrual adjustment", "Accrual reversal", "Control account", "Plan occurrence".
--
-- THE GAP THIS CLOSES. At month end a service has been delivered and the invoice has not been
-- issued. The accountant states the amount and the service period; the books should carry
-- Dr accrued income (an asset) / Cr the revenue account on the due date, reversed on the first day
-- of the following month, so that when the invoice is finally issued the two net off and the
-- period carries ONE revenue amount. Today this lane can only accrue an expense
-- (`clara.accrual_adjustments` carries `expense_account_code` + `liability_account_code` and no
-- side; `clara._assert_accrual_world` judges them 'expense' and 'liability' by literal). This file
-- gives the SAME lane a side, and nothing else: one lane with a side, not a second lane, which is
-- the owner's own 2026-09-18 decision quoted in the ticket body.
--
-- THE ACCOUNTING, CHECKED BEFORE IT WAS BUILT (standing rule: "verify accounting before asking").
-- Accrued income is revenue earned and not yet billed. It is a CURRENT ASSET presented apart from
-- invoiced trade receivables, because no receivable exists until an invoice does — which is why
-- the owner's ruling gives it its own standard-chart row rather than reusing trade debtors, and
-- why this file refuses a CONTROL account on the asset leg exactly as the expense side refuses one
-- on the liability leg: a control account reconciles to identified detail (CONTEXT.md, "Control
-- account") and an accrual has no identified open item on either side. The entry is
-- Dr accrued income / Cr revenue on the due date and its exact reverse on the first day of the
-- following month (the plan lane's own `next_period_first_day` rule, unchanged by this file).
--
-- =====================================================================================
-- THE FIRST MEASUREMENT: THE TWO COLUMN NAMES STAY, AND THAT IS A CONSTRAINT, NOT A PREFERENCE.
--
-- `clara.accrual_adjustments.expense_account_code` becomes THE PROFIT-AND-LOSS LEG (an expense
-- account under `side='expense'`, an income account under `side='revenue'`) and
-- `liability_account_code` becomes THE BALANCE-SHEET LEG (a non-control liability, or the
-- accrued-income asset). The names are HISTORICAL: they were minted by 0222 when the lane had one
-- side. They are NOT renamed here, and the reason is measured rather than aesthetic — the wire
-- keys of `p_accrual` are the same two words, and the tool that sends them
-- (`packages/runtime/lib/accrual-basis.ts`, `start_accrual_work`) is FROZEN
-- (`frozen-workflows.json`); a frozen body is never edited (WORK-ORDER rule 5), so renaming the
-- keys would break a hosted tool the moment this migration applied. Renaming the COLUMNS while
-- keeping the keys would leave the estate with two names for one thing, which is worse than one
-- historical name with a stated meaning. #942's report carries the rename as a successor-contract
-- follow-up for the `chatTurn_v22` cut, where the tool is re-cut anyway.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: AN ABSENT SIDE IS `expense`, EVERYWHERE, BY ONE BODY.
--
-- Every row this table already carries, and every caller that predates this file, states no side
-- and means the expense lane. The column therefore carries `default 'expense'` and `not null`
-- (so the existing rows read `expense` with no backfill statement at all), and ONE body —
-- `clara._accrual_side(jsonb)` — answers what an absent key means, so the door, the canonical
-- form, the basis builder and the walls can never disagree about it. `clara._accrual_sides()`
-- mirrors `clara._accrual_methods()` (0222 §B, recut by 0303): the closed set lives in a function,
-- the table's CHECK carries the same literals, and this file's tail proves the two agree by
-- DRIVING the predicate rather than by reading it.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: WHAT THIS FILE DOES NOT DO.
--
-- · It does NOT touch `clara._plan_occurrence_basis` (0193): the reversal leg is produced by that
--   body swapping every line's debit and credit, which is already side-agnostic — a revenue
--   accrual's reversal is Dr revenue / Cr accrued income for exactly the reason an expense
--   accrual's is Dr liability / Cr expense. It is pinned here as non-regression.
-- · It does NOT touch `clara._plan_admit_occurrence` (0193/0223/0303): the side lives on the
--   accrual detail and in the frozen basis the revision carries, and the admission core reads
--   both through bodies this file recuts.
-- · It mints NO new granted name: `clara._accrual_sides()` and `clara._accrual_side(jsonb)` are
--   ungranted internals, so there is no `rig-meta.mjs` cohort (0285/0303's shape, not 0302's).
-- · It adds NO account to any chart template. `1180 Accrued Income` already exists on this base by
--   code and name (0295, `my_sme_starter` v2) under the owner's 2026-09-20 ruling that #941 and
--   #942 SHARE one row: this file CONSUMES it and mints nothing.
-- =====================================================================================

-- =====================================================================================
-- §0 PRESTATE. Every claim re-read from the live catalog; every body this file recuts or depends
--    on pinned by sha256(prosrc) MEASURED on THIS lane database after #938 (0302) and #937 (0303)
--    landed — never transcribed from an older migration's header. Each recut body is BIMODAL: it
--    hashes either to its pre-image (FIRST APPLY) or to this file's own output (REDO, #957).
-- =====================================================================================
do $t942_pre$
declare
  v_sha text; v_def text; v_pre text; v_post text; v_n int; v_mode text := null; v_row_mode text;
begin
  if to_regclass('clara.accrual_adjustments') is null
     or to_regclass('clara.accrual_period_amounts') is null
     or to_regclass('clara.coa_accounts') is null then
    raise exception '#942 prestate: the 0222/0303 accrual cohort is absent -- those files must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._accrual_methods()') is null then
    raise exception '#942 prestate: clara._accrual_methods() is GONE' using errcode='CLR10';
  end if;

  -- 1 · THE BODIES THIS FILE RECUTS, each pinned at (pre-image | this file's own output).
  --     A body at NEITHER value has been moved by something else and this file is derived from a
  --     source that no longer exists: stop rather than overwrite it.
  for v_def, v_pre, v_post in
    select * from (values
      ('clara._assert_accrual_account(uuid,text,text,text,boolean)',
       '0ace7c706d75b803d4a093ee060c9936e0b6ddac27ea00bb5a1a76f8e24d2f7d',
       '5e80929f7f6bb7c7e77218b69be34d1cb986d3b07010a5047353e2d55359987f'),
      ('clara._assert_accrual_particulars(jsonb)',
       '71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b',
       'a5a8e80f0a9843568e9c34ac69afacaf5897a0ba432ae85a92494ebdef4ad1f4'),
      ('clara._assert_accrual_world(uuid,uuid,jsonb)',
       '32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750',
       '7c26456962c4b7f145f626046db36aa90286a6d201161dbb5199fcc13b74f43f'),
      ('clara._accrual_canonical(jsonb)',
       'f7b2af98a7dcf0e3bb64434a12a6feb89431a551f37481bf9d888079a9c43a1b',
       '53d65bd346da9dd65dd27becf91d8f2ea9fca1ccf3e0356a12a36fe69fa13dc3'),
      ('clara._accrual_journal_basis(jsonb,text,date)',
       'd1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403',
       '5b77077993986a53422716f289a4abeac7a17d9ee0c23bcabb08c7f77cb581de'),
      ('clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)',
       'bbeb43099d0cee972a62b7a81c9eebe13620b94120c45ed05dc2c5e57287624b',
       '0c73cc38b532e99fbba70ca56c98c4f97449d16c275ff2381f3d504b4aa89006'),
      ('clara.correct_accrual_adjustment(uuid,jsonb,text)',
       '9975f948944d2351c49eaa1c178f0dd9dc5572d446a7f9338ef9d5ede0b0fd79',
       '6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa'),
      ('clara.get_accrual_adjustment(uuid)',
       '835c9dc7e419d480a0084ab84292f02e2bcb3fb99d3ef00dea85d50721641599',
       '9bc5da4b59aeba5066436583267998cb3e52757b95022a452c187667f576d7d4'),
      ('clara.list_accrual_adjustments(uuid,date,date)',
       '2fae3273ba7bde1bdf9a06f0fa151092ba3f1715b3f059644522a87382bc9635',
       'c4924f1dbbd6b3ae0dd073ceed5f9b19016cc842a796d4256bd5f909f58c22df'),
      ('clara._plan_accrual_period_line(uuid,date)',
       '2fd492a29fd9c9fc5e3f85a5881f5c86704205acaf67a237a6a4900f578901d1',
       '9951a63f8eb0926b99917a3ef7dfedd32689af88ff25598b75075f174adf7941')
    ) as t(sig, pre, post)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#942 prestate: % does not resolve', v_def using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_def::regprocedure;
    if v_sha = v_pre then v_row_mode := 'FIRST APPLY';
    elsif v_sha = v_post then v_row_mode := 'REDO';
    else
      raise exception '#942 prestate: % is at NEITHER its measured pre-image NOR this file''s own output (got %) -- re-derive this file against the LIVE body before applying', v_def, v_sha
        using errcode='CLR10';
    end if;
    if v_mode is null then v_mode := v_row_mode;
    elsif v_mode <> v_row_mode then
      -- A MIXED READ IS REPORTED, NOT REFUSED, AND THE REASON IS MEASURED. A migration applies in
      -- ONE transaction, so the estate can never get half of this file's recuts from an apply. The
      -- one way to read a mixture is a REDO (#957) of a file whose recut SET GREW between two
      -- redos on a development rig -- which is exactly how this file was built, one slice at a
      -- time. Refusing it would forbid the only supported way to iterate on an unmerged migration;
      -- the branch that actually protects the estate is the one above, which stops dead if any
      -- body is at NEITHER admitted value because something else moved it.
      v_mode := 'MIXED';
    end if;
  end loop;

  -- 2 · THE BODIES THIS FILE DEPENDS ON AND MUST NOT MOVE, pinned exactly.
  for v_def, v_pre in
    select * from (values
      ('clara._accrual_methods()',
       'f3fdd04bac3bf925fe39dc5a552bfa97269136859ec83ee147d2e8d08ff0aef1'),
      ('clara._accrual_date(jsonb,text,text)',
       'a76f12dcb2ed689117bb2149c18fca97d58d7c7bd32a0428fa01e9f982344e8c'),
      ('clara._assert_accrual_term_window(jsonb,date,date)',
       'e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09'),
      ('clara._assert_accrual_period_amounts(jsonb,text,text,integer,date,date)',
       '8fe150e87541bb218e80b91b0531b6606e6566b36027cf74a678a522d25be3f2'),
      ('clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
       '31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5'),
      ('clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)',
       '09c682f52d6d9209425ff2923e37aba95ef4d483511ccee9d9829fd91985eed2'),
      ('clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)',
       '8b85fa602f21cef1c4831a8bffe8a13044cc66b5425bb2498a21231f77d91a03'),
      ('clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
       '6980feab1f7d7851ab07c76f7af6d0114423bd016f39d30d4c5a324d1a05337b'),
      ('clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)',
       'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e'),
      ('clara._human_ctx(integer)',
       'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'),
      ('clara._hash(jsonb)',
       '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'),
      ('clara.role_rank(text)',
       '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#942 prestate: % does not resolve', v_def using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) is distinct from v_pre then
      raise exception '#942 prestate: % has DRIFTED from its measured pre-image -- re-measure before applying', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE TABLE. On a FIRST APPLY it carries no `side`; on a REDO it carries this file's own.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accrual_adjustments' and column_name='side';
  if v_mode = 'FIRST APPLY' and v_n <> 0 then
    raise exception '#942 prestate: clara.accrual_adjustments already carries a `side` column while the recut bodies read as a first apply'
      using errcode='CLR10';
  end if;
  -- THE DATA-DEPENDENT BRANCH, ENTERED RATHER THAN ASSUMED (wave-3 addendum): this database
  -- carries accrual rows written before this file, and `add column ... not null default` is what
  -- makes every one of them an expense accrual. What the prestate SAW is handed to the tail on a
  -- temporary table, because "every row that predates this file is an expense accrual" is a claim
  -- only a reader who knows the mode can make: after a REDO on a development rig, rows written by
  -- the battery in between are legitimately on the revenue side.
  select count(*)::int into v_n from clara.accrual_adjustments;
  create temporary table t942_prestate(mode text not null, rows_before int not null) on commit drop;
  insert into t942_prestate(mode, rows_before) values (v_mode, v_n);
  raise notice '#942 prestate: clean (%) -- the recut bodies are each at exactly one of their two admitted values, the twelve bodies this file depends on are at their measured pre-images, and % accrual row(s) already exist on this database.', v_mode, v_n;
end
$t942_pre$;

set role clara_fn_owner;
set local lock_timeout = '5s';

-- =====================================================================================
-- §A THE SIDE — the closed set, the body that answers what an absent side means, and the column.
-- =====================================================================================

create or replace function clara._accrual_sides()
returns text[] language sql immutable security definer set search_path = clara, pg_temp as $fn$
  -- THE SIDES THIS LANE PERFORMS, in the estate's own "the set lives in a function, the CHECK
  -- carries its literals, the tail proves they agree" shape (clara._accrual_methods, 0222 §B).
  --   `expense` -- Dr the expense account / Cr a non-control accrued-liability account.
  --   `revenue` -- Dr a non-control asset (accrued income) / Cr the income account.
  -- There is no third member and no 'both': an accrual accrues one thing in one direction.
  select array['expense','revenue']::text[]
$fn$;
revoke all on function clara._accrual_sides() from public;

create or replace function clara._accrual_side(p_accrual jsonb)
returns text language sql immutable security definer set search_path = clara, pg_temp as $fn$
  -- WHAT AN ABSENT SIDE MEANS, ANSWERED IN ONE PLACE. Every row written before 0304 and every
  -- caller that predates it -- including the FROZEN start_accrual_work tool -- states no side and
  -- means the expense lane. This body never VALIDATES (that is
  -- `clara._assert_accrual_particulars`'s one refusal): it answers what the particulars say.
  select coalesce(nullif(btrim(coalesce(p_accrual ->> 'side','')),''), 'expense')
$fn$;
revoke all on function clara._accrual_side(jsonb) from public;

-- THE COLUMN. `not null default 'expense'` is what makes "existing rows are expense" true with no
-- backfill statement: Postgres fills the default into every existing row as part of the ADD, and
-- the default stays so that any writer which does not name the column writes the side the wire
-- means by silence. Redo-safe: `if not exists`.
alter table clara.accrual_adjustments
  add column if not exists side text not null default 'expense';

alter table clara.accrual_adjustments
  drop constraint if exists ck_accrual_adjustments_side;
alter table clara.accrual_adjustments
  add constraint ck_accrual_adjustments_side check (side in ('expense','revenue'));

comment on column clara.accrual_adjustments.side is
  'Which way this accrual runs (#942): `expense` -- Dr expense_account_code / Cr '
  'liability_account_code; `revenue` -- Dr liability_account_code (the accrued-income ASSET) / Cr '
  'expense_account_code (the INCOME account). The two column names are historical (0222, when the '
  'lane had one side): expense_account_code is the profit-and-loss leg and liability_account_code '
  'is the balance-sheet leg. Existing rows and every caller that states no side are `expense`.';

-- =====================================================================================
-- §B THE ACCOUNT PREDICATE — one body, four types. The only edits are the refusal's own article
--    and the non-control token, which now names WHICH leg refused (`non_control_liability` for
--    the expense side, byte for byte as before; `non_control_asset` for the revenue side).
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._assert_accrual_account(p_client uuid, p_code text, p_type text, p_field text, p_non_control boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare a record;
begin
  select account_type, account_class into a from clara.coa_accounts
   where client_id = p_client and account_code = p_code and is_active;
  if a.account_type is null then
    raise exception '% codes to an account this client does not have active: %', p_field, p_code
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_account_relationship','field', p_field,
          'constraint','unknown_account','account_code', p_code)::text;
  end if;
  if a.account_type <> p_type then
    -- #942: the ARTICLE follows the type. This body now judges four types, not two -- 'income'
    -- and 'asset' joined 'expense' and 'liability' when the lane gained a revenue side -- and
    -- "must name a income account" is a sentence a preparer reads on screen.
    raise exception '% must name % % account; % is % %', p_field,
      case when p_type in ('asset','income','equity') then 'an' else 'a' end, p_type, p_code,
      case when a.account_type in ('asset','income','equity') then 'an' else 'a' end,
      a.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_account_relationship','field', p_field,
          'constraint', p_type || '_account', 'account_code', p_code,
          'account_type', a.account_type, 'expected_account_type', p_type)::text;
  end if;
  -- A CONTROL ACCOUNT RECONCILES TO IDENTIFIED DETAIL (CONTEXT.md, "Control account"). An accrual
  -- carries none: it is an estimate of an obligation nobody has invoiced yet, so putting it in the
  -- payables control would make that control disagree with its own open items by construction.
  if p_non_control and a.account_class is not null then
    raise exception '% names the % control account; an accrual carries no identified open item', p_field, a.account_class
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_account_relationship','field', p_field,
          -- #942: the token names WHICH non-control leg refused. For the liability leg it
          -- still renders the literal 'non_control_liability' this refusal has always carried;
          -- the revenue side's asset leg gets its own 'non_control_asset'.
          'constraint','non_control_' || p_type,'account_code', p_code,
          'account_class', a.account_class)::text;
  end if;
end $function$;

-- =====================================================================================
-- §C THE PARTICULARS — the side is judged as a closed set, and the two leg refusals name the
--    account the stated side actually asks for.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._assert_accrual_particulars(p_accrual jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_amount numeric; v_rule text; v_start date; v_end date; v_uuid uuid;
begin
  if p_accrual is null or jsonb_typeof(p_accrual) <> 'object' then
    raise exception 'the accrual particulars are a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual","constraint":"object"}';
  end if;

  -- THE AMOUNT. Exact minor units; never a float, never a string that would cast cleanly.
  if p_accrual -> 'amount_cents' is null or jsonb_typeof(p_accrual -> 'amount_cents') = 'null' then
    raise exception 'an accrual needs its stated amount' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"present"}';
  end if;
  if jsonb_typeof(p_accrual -> 'amount_cents') <> 'number' then
    raise exception 'the accrued amount is an integer JSON number of minor units' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"integer_cents"}';
  end if;
  v_amount := (p_accrual ->> 'amount_cents')::numeric;
  if v_amount <> trunc(v_amount) or v_amount > 9223372036854775807::numeric then
    raise exception 'the accrued amount is an integer number of minor units' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"integer_cents"}';
  end if;
  -- ZERO IS ITS OWN REFUSAL, AND IT IS A TERM PROBLEM (C08.2). The lines this lane posts are
  -- DERIVED from the particulars, so a degenerate particular yields degenerate lines and
  -- `clara._assert_journal_basis` would answer `lines[1] exactly_one_side` -- true of the derived
  -- lines, useless to the preparer, and not the honest name. Asked here it names the control the
  -- human typed in.
  if v_amount = 0 then
    raise exception 'an accrual of zero accrues nothing: state the amount or do not accrue'
      using errcode='CLR10',
        detail='{"reason":"accrual_zero_amount","field":"accrual.amount_cents"}';
  end if;
  if v_amount < 0 then
    raise exception 'an accrual amount is positive; a reversal is the schedule''s own second leg'
      using errcode='CLR10',
        detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"positive"}';
  end if;

  if upper(btrim(coalesce(p_accrual ->> 'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.currency","constraint":"myr"}';
  end if;

  -- BOTH LEGS. Neither leg of an accrual is derivable from the other.
  --
  -- #942 — THE TWO KEYS ARE THE PROFIT-AND-LOSS LEG AND THE BALANCE-SHEET LEG, and their names are
  -- HISTORICAL: they were minted (0222) when this lane had one side. `expense_account_code` is the
  -- P&L leg (an expense under `side='expense'`, an income account under `side='revenue'`) and
  -- `liability_account_code` is the balance-sheet leg (a non-control liability, or the accrued
  -- income asset). They are NOT renamed here because the FROZEN start_accrual_work tool sends
  -- exactly these keys and a frozen body is never edited (WORK-ORDER rule 5); the successor
  -- contract in #942's report proposes the rename for the chatTurn_v22 cut. The SENTENCE names
  -- whichever account the stated side actually asks for.
  if nullif(btrim(coalesce(p_accrual ->> 'expense_account_code','')),'') is null then
    raise exception 'an accrual names the % account it %',
      case when clara._accrual_side(p_accrual) = 'revenue' then 'income' else 'expense' end,
      case when clara._accrual_side(p_accrual) = 'revenue' then 'earns' else 'charges' end
      using errcode='CLR10',
        detail='{"reason":"invalid_accrual","field":"accrual.expense_account_code","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_accrual ->> 'liability_account_code','')),'') is null then
    raise exception 'an accrual names the % account it accrues into',
      case when clara._accrual_side(p_accrual) = 'revenue' then 'accrued income' else 'liability' end
      using errcode='CLR10',
        detail='{"reason":"invalid_accrual","field":"accrual.liability_account_code","constraint":"nonempty"}';
  end if;

  -- THE TERM. Absent on either side is `silent_term` and not a generic shape refusal, because
  -- "a silent term is rejected" is this ticket's own acceptance line and the preparer's next move
  -- differs: they have to go and find out, not fix a typo.
  if nullif(btrim(coalesce(p_accrual ->> 'service_period_start','')),'') is null then
    raise exception 'an accrual states the service period it belongs to' using errcode='CLR10',
      detail='{"reason":"silent_term","field":"accrual.service_period_start"}';
  end if;
  if nullif(btrim(coalesce(p_accrual ->> 'service_period_end','')),'') is null then
    raise exception 'an accrual states the service period it belongs to' using errcode='CLR10',
      detail='{"reason":"silent_term","field":"accrual.service_period_end"}';
  end if;
  v_start := clara._accrual_date(p_accrual, 'service_period_start', 'silent_term');
  v_end := clara._accrual_date(p_accrual, 'service_period_end', 'silent_term');
  if v_end < v_start then
    raise exception 'a service period cannot end before it starts' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.service_period_end","constraint":"after_start"}';
  end if;
  -- WHOSE TERM IT IS. One closed member: a period a MODEL read off a document may not enter a
  -- durable artifact (0140's table comment, CONFIRMED AS LAW).
  if coalesce(p_accrual ->> 'term_source','') <> 'human_stated' then
    raise exception 'an accrual term is one a person stated; a derived or extracted period is not an anchored fact'
      using errcode='CLR10',
        detail='{"reason":"silent_term","field":"accrual.term_source","constraint":"human_stated"}';
  end if;

  -- THE METHOD. A closed selection-rule object with exactly one key.
  if p_accrual -> 'method' is null or jsonb_typeof(p_accrual -> 'method') <> 'object' then
    raise exception 'an accrual names the rule that selects its amount' using errcode='CLR10',
      detail=jsonb_build_object('reason','accrual_method_unsupported','field','accrual.method',
        'supported', to_jsonb(clara._accrual_methods()))::text;
  end if;
  if (select count(*) from jsonb_object_keys(p_accrual -> 'method')) <> 1 then
    raise exception 'an accrual method carries its rule and nothing else' using errcode='CLR10',
      detail=jsonb_build_object('reason','accrual_method_unsupported','field','accrual.method',
        'constraint','rule_only', 'supported', to_jsonb(clara._accrual_methods()))::text;
  end if;
  v_rule := p_accrual -> 'method' ->> 'rule';
  if v_rule is null or not (v_rule = any (clara._accrual_methods())) then
    raise exception 'accrual method % is not a supported selection rule', coalesce(v_rule,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_method_unsupported','field','accrual.method.rule',
          'rule', v_rule, 'supported', to_jsonb(clara._accrual_methods()))::text;
  end if;
  -- #942 — THE SIDE. A closed set, and ABSENT MEANS 'expense': every row written before this
  -- file and every caller that predates it -- including the FROZEN start_accrual_work tool --
  -- states no side and means the expense lane it has always meant. A side that is present is
  -- judged; there is no third, silent way to be neither.
  if p_accrual ? 'side' then
    if jsonb_typeof(p_accrual -> 'side') <> 'string'
       or not (btrim(p_accrual ->> 'side') = any (clara._accrual_sides())) then
      raise exception 'an accrual accrues an expense or revenue; % is neither',
        coalesce(nullif(btrim(coalesce(p_accrual ->> 'side','')),''),'(null)')
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_side_unsupported','field','accrual.side',
            'side', p_accrual ->> 'side',
            'supported', to_jsonb(clara._accrual_sides()))::text;
    end if;
  end if;

  if nullif(btrim(coalesce(p_accrual ->> 'instruction','')),'') is null then
    raise exception 'an accrual records the instruction that authorised it' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.instruction","constraint":"nonempty"}';
  end if;
  if char_length(btrim(coalesce(p_accrual ->> 'memo',''))) > 4000 then
    raise exception 'the memo is % characters; the postable maximum is 4000',
      char_length(btrim(p_accrual ->> 'memo'))
      using errcode='CLR10',
        detail='{"reason":"invalid_accrual","field":"accrual.memo","constraint":"max_length"}';
  end if;

  -- THE TWO OPTIONAL IDS, shape only. Their WORLD half is `_assert_accrual_world`.
  for v_rule in select unnest(array['source_document_id','document_service_period_id']) loop
    if nullif(btrim(coalesce(p_accrual ->> v_rule,'')),'') is not null then
      begin
        v_uuid := (p_accrual ->> v_rule)::uuid;
      exception when others then
        raise exception '% does not name a row by id', v_rule using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_accrual','field','accrual.' || v_rule,
            'constraint','uuid')::text;
      end;
    end if;
  end loop;
  if nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'') is not null
     and nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'') is null then
    raise exception 'a term anchored to a document names that document too' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.source_document_id","constraint":"required_by_term"}';
  end if;
end $function$;

-- =====================================================================================
-- §D THE WORLD HALF — the pair is judged BY the side, through the same predicate and with the
--    same typed refusal reasons the expense side has always raised.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._assert_accrual_world(p_firm uuid, p_client uuid, p_accrual jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_doc uuid; v_term uuid; d record; v_side text;
begin
  -- #942 — THE PAIR IS JUDGED BY THE SIDE, through the SAME predicate, with the SAME typed
  -- refusal reasons. An expense accrual charges an expense and credits a non-control liability;
  -- a revenue accrual earns an income account and debits a non-control ASSET (accrued income).
  -- The non-control rule is the same rule for the same reason on both sides: a control account
  -- reconciles to identified detail (CONTEXT.md, "Control account") and an accrual has none --
  -- an unbilled fee is not an open item of the receivables ledger any more than an un-invoiced
  -- supply is one of the payables ledger.
  v_side := clara._accrual_side(p_accrual);
  perform clara._assert_accrual_account(p_client, btrim(p_accrual ->> 'expense_account_code'),
    case when v_side = 'revenue' then 'income' else 'expense' end,
    'accrual.expense_account_code', false);
  perform clara._assert_accrual_account(p_client, btrim(p_accrual ->> 'liability_account_code'),
    case when v_side = 'revenue' then 'asset' else 'liability' end,
    'accrual.liability_account_code', true);

  v_doc := nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'')::uuid;
  if v_doc is not null then
    -- NO EXISTENCE ORACLE: a document of another firm, one filed to another client and a uuid
    -- naming nothing all answer identically (0182's own rule, reached through its own predicate).
    if not clara._journal_document_filed(p_firm, p_client, v_doc) then
      raise exception 'the cited document is not an active verified document of this client'
        using errcode='CLR10',
          detail='{"reason":"invalid_source_ref","field":"accrual.source_document_id","constraint":"not_filed"}';
    end if;
  end if;

  v_term := nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'')::uuid;
  if v_term is not null then
    select * into d from clara.document_service_periods where id = v_term;
    if not found or d.firm_id <> p_firm or d.document_id is distinct from v_doc
       or d.superseded_at is not null or d.basis_kind <> 'human_stated'
       or d.period_start <> clara._accrual_date(p_accrual,'service_period_start','silent_term')
       or d.period_end <> clara._accrual_date(p_accrual,'service_period_end','silent_term') then
      raise exception 'the bound service period is not this document''s live human-stated term'
        using errcode='CLR10',
          detail='{"reason":"accrual_term_document_mismatch","field":"accrual.document_service_period_id"}';
    end if;
  end if;
end $function$;

-- =====================================================================================
-- §E THE CANONICAL FORM — the side joins what an op key stands for.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._accrual_canonical(p_accrual jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
  select jsonb_build_object(
    -- #942: the SIDE is part of what an op key stands for. Two configurations that differ only in
    -- their side are two different accruals, so one key can never answer for both (they hash
    -- differently and `_reserve_op` raises its own conflict).
    'side', clara._accrual_side(p_accrual),
    'expense_account_code', btrim(p_accrual ->> 'expense_account_code'),
    'liability_account_code', btrim(p_accrual ->> 'liability_account_code'),
    'amount_cents', (p_accrual ->> 'amount_cents')::numeric,
    'currency', 'MYR',
    'service_period_start', p_accrual ->> 'service_period_start',
    'service_period_end', p_accrual ->> 'service_period_end',
    'term_source', p_accrual ->> 'term_source',
    'method', p_accrual -> 'method',
    'instruction', btrim(p_accrual ->> 'instruction'),
    'memo', nullif(btrim(coalesce(p_accrual ->> 'memo','')),''),
    'source_document_id', nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),''),
    'document_service_period_id', nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),''),
    -- #937: the per-period amounts, or `[]` when the rule states one amount for every period.
    'period_amounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'due_date', e ->> 'due_date',
               'amount_cents', (e ->> 'amount_cents')::numeric)
             order by e ->> 'due_date'), '[]'::jsonb)
        from jsonb_array_elements(
               case when jsonb_typeof(p_accrual -> 'period_amounts') = 'array'
                    then p_accrual -> 'period_amounts' else '[]'::jsonb end) e));
$function$;

-- =====================================================================================
-- §E2 THE BASIS THE REVISION FREEZES — the side decides which leg is debited. The expense side's
--     own two lines come out byte-identical to what 0222 has always built (the `else` arm is the
--     old body, comment for comment), so no posted entry and no frozen revision basis in the
--     estate reads differently after this file. The REVERSAL leg needs nothing here:
--     `clara._plan_occurrence_basis` produces it by swapping every line's debit and credit, which
--     is already side-agnostic — pinned, untouched, and re-hashed in the tail.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._accrual_journal_basis(p_accrual jsonb, p_purpose text, p_posting_date date)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'posting_date', to_char(p_posting_date, 'YYYY-MM-DD'),
    'memo', coalesce(nullif(btrim(coalesce(p_accrual ->> 'memo','')),''), btrim(p_purpose)),
    'currency', 'MYR',
    -- #942 — THE SIDE DECIDES WHICH LEG IS DEBITED. An expense accrual is
    -- Dr expense / Cr accrued liability; a revenue accrual is its MIRROR, Dr accrued income
    -- (asset) / Cr revenue. Both legs' accounts come from the same two keys (the P&L leg is
    -- `expense_account_code`, the balance-sheet leg is `liability_account_code`); only the side
    -- each amount sits on changes. The lines stay in BALANCE-SHEET-LEG-second order on the
    -- expense side, byte for byte, so every entry 0222 has already posted is unmoved.
    'lines', case when clara._accrual_side(p_accrual) = 'revenue' then jsonb_build_array(
      jsonb_build_object(
        'account_code', btrim(p_accrual ->> 'liability_account_code'),
        'debit_cents', (p_accrual ->> 'amount_cents')::numeric,
        'credit_cents', 0,
        'description', 'accrued income'),
      jsonb_build_object(
        'account_code', btrim(p_accrual ->> 'expense_account_code'),
        'debit_cents', 0,
        'credit_cents', (p_accrual ->> 'amount_cents')::numeric,
        'description', 'one period of the accrual term ' || (p_accrual ->> 'service_period_start')
                       || ' to ' || (p_accrual ->> 'service_period_end')))
    else jsonb_build_array(
      jsonb_build_object(
        'account_code', btrim(p_accrual ->> 'expense_account_code'),
        'debit_cents', (p_accrual ->> 'amount_cents')::numeric,
        'credit_cents', 0,
        -- WHAT IS TRUE OF EVERY OCCURRENCE (THE SIXTH MEASUREMENT). This basis is FROZEN on the
        -- revision and `clara._plan_occurrence_basis` only moves the posting date, so a line
        -- reading "accrued <start> to <end>" would be a claim each of a recurring accrual's
        -- entries makes about a term only the whole schedule covers. The term is named; the
        -- entry's share of it is stated honestly.
        'description', 'one period of the accrual term ' || (p_accrual ->> 'service_period_start')
                       || ' to ' || (p_accrual ->> 'service_period_end')),
      jsonb_build_object(
        'account_code', btrim(p_accrual ->> 'liability_account_code'),
        'debit_cents', 0,
        'credit_cents', (p_accrual ->> 'amount_cents')::numeric,
        'description', 'accrual')) end);
$function$;

-- =====================================================================================
-- §F THE CONFIGURATION TAIL — the detail row records the side it was configured with.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._accrual_finish(p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_accrual jsonb, p_plan jsonb, p_authority_kind text, p_authority_ref jsonb, p_effective_from date, p_effective_to date, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_accrual uuid; v_event jsonb; v_occ jsonb := null; v_plan uuid;
        v_rev clara.accounting_plan_revisions%rowtype;   -- #937
begin
  v_plan := (p_plan ->> 'plan_id')::uuid;
  -- #937 - THE PER-PERIOD WALL, asked against the revision this configuration just wrote rather
  -- than against arguments passed down: the schedule that will actually produce the due dates is
  -- the one on the revision row, and reading it back is what makes "every period the schedule
  -- reaches is stated" a claim about the books instead of about a caller's parameters.
  select * into v_rev from clara.accounting_plan_revisions
   where plan_id = v_plan and revision = (p_plan ->> 'revision')::int;
  perform clara._assert_accrual_period_amounts(p_accrual, v_rev.frequency, v_rev.day_rule,
    v_rev.day_of_month, p_effective_from, p_effective_to);
  insert into clara.accrual_adjustments(firm_id, client_id, plan_id, revision, purpose,
      side, expense_account_code, liability_account_code, amount_cents, currency, effective_from,
      effective_to, service_period_start, service_period_end, term_source,
      document_service_period_id, method, authority_kind, authority_ref, source_document_id,
      instruction, recorded_by)
    values (p_firm, p_client, v_plan, (p_plan ->> 'revision')::int, btrim(p_purpose),
      -- #942: the side the particulars stated, resolved through the one body that answers what an
      -- absent side means (`clara._accrual_side`) rather than re-deciding it here.
      clara._accrual_side(p_accrual),
      btrim(p_accrual ->> 'expense_account_code'), btrim(p_accrual ->> 'liability_account_code'),
      (p_accrual ->> 'amount_cents')::bigint, 'MYR', p_effective_from, p_effective_to,
      (p_accrual ->> 'service_period_start')::date, (p_accrual ->> 'service_period_end')::date,
      p_accrual ->> 'term_source',
      nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'')::uuid,
      p_accrual -> 'method', p_authority_kind, p_authority_ref,
      nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'')::uuid,
      btrim(p_accrual ->> 'instruction'), p_author)
    returning id into v_accrual;

  -- #937 - THE STATED PERIOD AMOUNTS, written in the SAME transaction as the detail they belong
  -- to and BEFORE any occurrence is admitted, because the resolver the admission core asks
  -- (clara._plan_accrual_period_line) reads exactly these rows. The `where` is the rule's own
  -- gate: a stated_amount accrual writes none, and clara._assert_accrual_period_amounts has
  -- already refused a period_amounts key under any other rule.
  insert into clara.accrual_period_amounts(firm_id, client_id, accrual_id, due_date,
      amount_cents, currency, recorded_by)
    select p_firm, p_client, v_accrual, (e ->> 'due_date')::date,
           (e ->> 'amount_cents')::bigint, 'MYR', p_author
      from jsonb_array_elements(
             case when jsonb_typeof(p_accrual -> 'period_amounts') = 'array'
                  then p_accrual -> 'period_amounts' else '[]'::jsonb end) e
     where (p_accrual -> 'method' ->> 'rule') = 'stated_period_amount';

  -- THE CURRENT PERIOD'S OCCURRENCE, admitted through the plan lane's OWN core — the same body the
  -- runtime scan and the human catch-up call, so an accrual configured here and one admitted by a
  -- later scan are the same act. Only a PRIMARY leg is admitted at configuration: a brand-new
  -- plan has posted nothing, so its reversal has nothing to reverse and 0193's orphan wall would
  -- refuse it (and does, on its own terms, if a human ever asks for it by name).
  v_event := clara._plan_admissible_event(v_plan);
  if v_event is not null and (v_event ->> 'leg') = 'primary' then
    v_occ := clara._plan_admit_occurrence(v_plan, (v_event ->> 'due_date')::date, 'primary',
               clara._plan_run_model());
  end if;

  perform clara._audit(p_firm, p_author, null, null, 'create_accrual_adjustment', null,
    jsonb_build_object('client', p_client, 'accrual', v_accrual, 'plan', v_plan,
      'amount_cents', (p_accrual ->> 'amount_cents')::bigint,
      'service_period_start', p_accrual ->> 'service_period_start',
      'service_period_end', p_accrual ->> 'service_period_end',
      'method', p_accrual -> 'method', 'side', clara._accrual_side(p_accrual), 'op_key', p_op_key,
      -- #937: how many periods this configuration stated an amount for, so the audit row says
      -- what was recorded rather than only what rule was chosen.
      'period_amounts', (select count(*)::int from clara.accrual_period_amounts pa
                          where pa.accrual_id = v_accrual)));

  return jsonb_build_object(
    'accrual_id', v_accrual,
    'plan_id', v_plan,
    'revision_id', p_plan ->> 'revision_id',
    'revision', (p_plan ->> 'revision')::int,
    'kind', 'reversing_journal',
    'status', 'active',
    -- THE BOUNDARY, IN THE ANSWER ITSELF. Accepting a configuration posts nothing: the entry and
    -- its committed clara.operation_receipts row belong to the run's own later commit.
    'posted', false,
    'configuration_receipt', jsonb_build_object('fn','create_accrual_adjustment','op_key',p_op_key),
    'occurrence', v_occ,
    'next_occurrences', p_plan -> 'next_occurrences',
    'overlap_warning', p_plan -> 'overlap_warning');
end $function$;

-- =====================================================================================
-- §F2 THE CORRECTION PATH — the successor row carries the side it corrects, and a correction
--     that asks for the OTHER side is refused by name rather than silently re-interpreted.
--     (#936's door, 0284; the two edits sit inside its own payload half and its own INSERT.)
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara.correct_accrual_adjustment(p_accrual_id uuid, p_accrual jsonb, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  v_actor uuid; v_firm uuid;
  v_old clara.accrual_adjustments%rowtype;
  v_cur clara.accounting_plan_revisions%rowtype;
  v_fresh_corrected_by uuid;
  v_nested_detail text; v_nested_message text;
  v_basis jsonb; v_dedupe jsonb; v_revision jsonb; v_new_id uuid; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'correcting an accrual requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;

  -- THE FLOOR, WITH A TYPED REASON -- the same 0222 mapping `create_accrual_adjustment` uses for
  -- the identical reason: `clara._human_ctx` raises a bare CLR04 and a surface cannot classify it.
  begin
    select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;
  exception when sqlstate 'CLR04' then
    raise exception 'correcting an accrual requires an active bookkeeper or above'
      using errcode='CLR04',
        detail=jsonb_build_object('reason',
          case when clara.jwt_sub() is null then 'no_authenticated_actor'
               when clara.jwt_firm() is null then 'actor_not_active'
               else 'insufficient_role' end)::text;
  end;

  -- IDENTITY. NO EXISTENCE ORACLE ACROSS FIRMS: an id naming nothing and one belonging to another
  -- firm answer identically (0222's own rule for get_accrual_adjustment, reached the same way).
  select * into v_old from clara.accrual_adjustments where id = p_accrual_id and firm_id = v_firm;
  if v_old.id is null then
    raise exception 'accrual adjustment not found in your firm' using errcode='CLR11',
      detail='{"reason":"accrual_not_found"}';
  end if;

  -- THE PAYLOAD HALF, BEFORE THE RESERVATION -- deterministic, no side effects, safe to re-run on
  -- a replay. It is the payload ALONE: the term-window wall reads the LIVE revision's authority,
  -- which is mutable world state, so it sits in the world half below (see the header).
  perform clara._assert_accrual_particulars(p_accrual);

  -- #942 — THE SIDE IS NOT A CORRECTION. A correction restates the PARTICULARS of the accrual the
  -- plan is running; the side decides which two account TYPES those particulars are even allowed
  -- to name and which way every entry the plan has already posted was signed. Flipping it would
  -- leave a schedule whose posted periods are Dr expense / Cr liability and whose next period is
  -- Dr asset / Cr income, under one authority and one purpose. The honest act is to let this
  -- accrual's authority end and configure the other side's own accrual, so this is a typed
  -- refusal and never a silent re-interpretation. `v_old` is append-only, so this comparison is
  -- as deterministic as the particulars above it and belongs in the same half.
  if clara._accrual_side(p_accrual) is distinct from v_old.side then
    raise exception 'this is a % accrual; a correction restates it, it does not turn it into a % one',
      v_old.side, clara._accrual_side(p_accrual)
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_side_immutable','field','accrual.side',
          'side', v_old.side, 'requested_side', clara._accrual_side(p_accrual))::text;
  end if;

  -- THE RESERVATION. Re-raised with a typed reason, the same wrap `create_accrual_adjustment`
  -- gives `_reserve_op`'s own untyped "op_key reused with different args" (0004:46).
  begin
    v_dedupe := clara._reserve_op(v_firm, 'correct_accrual_adjustment', p_op_key,
      clara._hash(jsonb_build_object('accrual_id', p_accrual_id,
        'particulars', clara._accrual_canonical(p_accrual))));
  exception when sqlstate 'CLR10' then
    raise exception 'this correction key already corrected a DIFFERENT accrual' using errcode='CLR10',
      detail='{"reason":"op_key_conflict","field":"op_key"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this correction key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- THE WORLD HALF, AFTER THE RESERVATION BRANCH -- an account retired or a filing withdrawn
  -- between two attempts under one key, exactly 0222's own reasoning for `_assert_accrual_world`.
  perform clara._assert_accrual_world(v_firm, v_old.client_id, p_accrual);

  -- RUNG 1 -- the SAME accounting_plans row lock clara.revise_accounting_plan itself takes
  -- (0193:1679). Holding it BEFORE the recheck below is what makes "already corrected" a typed
  -- refusal rather than a race that surfaces as a bare 23505 on uq_accrual_adjustments_corrects
  -- (see the header).
  perform 1 from clara.accounting_plans where id = v_old.plan_id for update;

  select corrected_by_accrual_id into v_fresh_corrected_by
    from clara.accrual_adjustments where id = v_old.id;
  if v_fresh_corrected_by is not null then
    raise exception 'this accrual has already been corrected; correct its successor instead'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_already_corrected',
          'corrected_by_accrual_id', v_fresh_corrected_by)::text;
  end if;

  select * into v_cur from clara.accounting_plan_revisions
   where plan_id = v_old.plan_id and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision to correct' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;

  -- THE AUTHORITY WINDOW IS THE LIVE REVISION'S OWN, read under the lock that holds it still.
  -- Never `v_old`'s: that pair is what the accrual row remembered when it was written, and a
  -- lawful plan revision since then has moved it (see the header, ADV-01). The shared 0222
  -- predicate therefore judges the corrected term against the authority that is actually live.
  perform clara._assert_accrual_term_window(p_accrual, v_cur.effective_from, v_cur.effective_to);
  -- #937 - THE PER-PERIOD WALL, against the LIVE revision's own schedule and window (ADV-01's own
  -- rule, applied to this ticket's set): a corrected per-period set must cover exactly the
  -- periods the plan that is actually running will reach.
  perform clara._assert_accrual_period_amounts(p_accrual, v_cur.frequency, v_cur.day_rule,
    v_cur.day_of_month, v_cur.effective_from, v_cur.effective_to);
  v_basis := clara._accrual_journal_basis(p_accrual, v_old.purpose, v_cur.effective_from);

  -- THE NESTED DOOR -- clara.revise_accounting_plan, PINNED, UNTOUCHED (see the header for why:
  -- lane 05 pins this same body). Every schedule argument is the LIVE revision's own, carried
  -- through unchanged; only the basis is new.
  --
  -- THE DERIVED KEY'S OWN COLLISION IS TYPED (ADV-06). `clara._reserve_op` keys on
  -- (firm_id, fn, op_key), so `p_op_key || ':plan'` shares the (firm, 'revise_accounting_plan')
  -- namespace with keys a caller chooses for that door DIRECTLY -- and #936 is the first place the
  -- nested door is one a human reaches with an arbitrary key of their own. When the two collide,
  -- the nested door re-raises `_reserve_op`'s own message with NO detail at all, so a surface can
  -- render only CLR10 and the raw sentence. This wrap types exactly that case -- an UNTYPED CLR10
  -- out of the nested call -- and re-raises everything else byte-identically with a bare `raise`,
  -- so no refusal the plan door already classifies is masked or renamed.
  begin
    v_revision := clara.revise_accounting_plan(v_old.plan_id, v_cur.frequency, v_cur.day_rule,
      v_cur.day_of_month, v_cur.timezone, v_cur.effective_from, v_cur.effective_to, v_basis,
      v_cur.reversal_day_rule, p_op_key || ':plan');
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_nested_detail = pg_exception_detail,
                            v_nested_message = message_text;
    if coalesce(btrim(v_nested_detail), '') = '' then
      raise exception 'the plan revision this correction records is blocked: %', v_nested_message
        using errcode='CLR10',
          detail=jsonb_build_object('reason','plan_op_key_conflict','field','op_key',
            'nested_op_key', p_op_key || ':plan')::text;
    end if;
    raise;
  end;

  -- THE SUCCESSOR ROW, for the revision that just came out of the nested call. Every column
  -- `create_accrual_adjustment`'s own tail (`_accrual_finish`, 0222 §C) writes, from the CORRECTED
  -- particulars except purpose/authority, which this door does not ask the caller to restate.
  insert into clara.accrual_adjustments(firm_id, client_id, plan_id, revision, purpose,
      side, expense_account_code, liability_account_code, amount_cents, currency, effective_from,
      effective_to, service_period_start, service_period_end, term_source,
      document_service_period_id, method, authority_kind, authority_ref, source_document_id,
      instruction, corrects_accrual_id, recorded_by)
    values (v_firm, v_old.client_id, v_old.plan_id, (v_revision ->> 'revision')::int, v_old.purpose,
      -- #942: carried from the row being corrected, which the wall above has just proved the
      -- payload agrees with.
      v_old.side,
      btrim(p_accrual ->> 'expense_account_code'), btrim(p_accrual ->> 'liability_account_code'),
      (p_accrual ->> 'amount_cents')::bigint, 'MYR', v_cur.effective_from, v_cur.effective_to,
      (p_accrual ->> 'service_period_start')::date, (p_accrual ->> 'service_period_end')::date,
      p_accrual ->> 'term_source',
      nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'')::uuid,
      p_accrual -> 'method', v_old.authority_kind, v_old.authority_ref,
      nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'')::uuid,
      btrim(p_accrual ->> 'instruction'), v_old.id, v_actor)
    returning id into v_new_id;

  -- #937 - THE STATED PERIOD AMOUNTS, written in the SAME transaction as the detail they belong
  -- to and BEFORE any occurrence is admitted, because the resolver the admission core asks
  -- (clara._plan_accrual_period_line) reads exactly these rows. The `where` is the rule's own
  -- gate: a stated_amount accrual writes none, and clara._assert_accrual_period_amounts has
  -- already refused a period_amounts key under any other rule.
  insert into clara.accrual_period_amounts(firm_id, client_id, accrual_id, due_date,
      amount_cents, currency, recorded_by)
    select v_firm, v_old.client_id, v_new_id, (e ->> 'due_date')::date,
           (e ->> 'amount_cents')::bigint, 'MYR', v_actor
      from jsonb_array_elements(
             case when jsonb_typeof(p_accrual -> 'period_amounts') = 'array'
                  then p_accrual -> 'period_amounts' else '[]'::jsonb end) e
     where (p_accrual -> 'method' ->> 'rule') = 'stated_period_amount';

  -- THE ONE-WAY STAMP -- 0222's append-only trigger's ONE admitted update, ridden here for the
  -- first time: NULL -> an id, once (`t_accrual_adjustments_append_only`).
  update clara.accrual_adjustments set corrected_by_accrual_id = v_new_id where id = v_old.id;

  perform clara._audit(v_firm, v_actor, null, null, 'correct_accrual_adjustment', null,
    jsonb_build_object('client', v_old.client_id, 'plan', v_old.plan_id,
      'corrects_accrual_id', v_old.id, 'accrual_id', v_new_id,
      'revision', (v_revision ->> 'revision')::int,
      'amount_cents', (p_accrual ->> 'amount_cents')::bigint, 'op_key', p_op_key));

  v_result := jsonb_build_object(
    'accrual_id', v_new_id, 'corrects_accrual_id', v_old.id,
    'plan_id', v_old.plan_id, 'revision_id', v_revision ->> 'revision_id',
    'revision', (v_revision ->> 'revision')::int,
    'superseded_revision', (v_revision ->> 'superseded_revision')::int,
    'status', v_revision ->> 'status',
    'overlap_warning', v_revision -> 'overlap_warning');
  return clara._finish_op(v_firm, 'correct_accrual_adjustment', p_op_key, v_result);
end $function$;

-- =====================================================================================
-- §G THE TWO READS — both answer the side.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara.get_accrual_adjustment(p_accrual uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_actor uuid; v_firm uuid; a clara.accrual_adjustments; p clara.accounting_plans;
        r record; v_occ jsonb; v_reversal jsonb;
begin
  select x.actor, x.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) x;
  -- NO EXISTENCE ORACLE ACROSS FIRMS: the firm predicate is part of the lookup, so an accrual id
  -- belonging to somebody else's firm answers exactly as an id naming nothing does.
  select * into a from clara.accrual_adjustments where id = p_accrual and firm_id = v_firm;
  if a.id is null then
    raise exception 'accrual adjustment not found in your firm' using errcode='CLR11',
      detail='{"reason":"accrual_not_found"}';
  end if;
  select * into p from clara.accounting_plans where id = a.plan_id;
  select * into r from clara.accounting_plan_revisions
   where plan_id = a.plan_id and revision = a.revision;
  v_occ := clara._accrual_occurrences(a.plan_id);
  select e into v_reversal from jsonb_array_elements(v_occ) x(e)
   where x.e ->> 'leg' = 'reversal' order by x.e ->> 'due_date' desc limit 1;

  return jsonb_build_object(
    'accrual_id', a.id, 'client_id', a.client_id, 'purpose', a.purpose,
    -- #942: which side this accrual accrues. A reader that does not know it cannot tell whether
    -- `expense_account_code` names an expense or an income account.
    'side', a.side,
    'expense_account_code', a.expense_account_code,
    'liability_account_code', a.liability_account_code,
    'amount_cents', a.amount_cents, 'currency', a.currency,
    'effective_from', to_char(a.effective_from,'YYYY-MM-DD'),
    'effective_to', case when a.effective_to is null then null else to_char(a.effective_to,'YYYY-MM-DD') end,
    'service_period_start', to_char(a.service_period_start,'YYYY-MM-DD'),
    'service_period_end', to_char(a.service_period_end,'YYYY-MM-DD'),
    'term_source', a.term_source, 'method', a.method,
    -- #937 - THE AMOUNTS A PERSON STATED PER PERIOD, or [] under the stated_amount rule. The
    -- correction surface seeds its own controls from exactly this, so a per-period accrual can be
    -- restated through the browser instead of only through the door; a reader gets what WILL post
    -- for each due date rather than only the window's total.
    'period_amounts', (select coalesce(jsonb_agg(jsonb_build_object(
                                'due_date', to_char(pa.due_date,'YYYY-MM-DD'),
                                'amount_cents', pa.amount_cents) order by pa.due_date), '[]'::jsonb)
                         from clara.accrual_period_amounts pa where pa.accrual_id = a.id),
    'document_service_period_id', a.document_service_period_id,
    'source_document_id', a.source_document_id,
    'authority_kind', a.authority_kind, 'authority_ref', a.authority_ref,
    'instruction', a.instruction, 'recorded_by', a.recorded_by, 'created_at', a.created_at,
    'corrects_accrual_id', a.corrects_accrual_id,
    'corrected_by_accrual_id', a.corrected_by_accrual_id,
    'revision', a.revision,
    'plan', jsonb_build_object('plan_id', p.id, 'kind', p.kind, 'status', p.status,
      'purpose', p.purpose, 'authorised_by', p.authorised_by, 'authorised_at', p.authorised_at,
      'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
      'current_revision', p.current_revision,
      'frequency', r.frequency, 'day_rule', r.day_rule, 'day_of_month', r.day_of_month,
      'timezone', r.timezone, 'basis', r.basis, 'basis_digest', r.basis_digest,
      'auto_reverse', r.auto_reverse, 'reversal_day_rule', r.reversal_day_rule),
    'occurrences', v_occ,
    'reversal', v_reversal,
    'posted', exists (select 1 from jsonb_array_elements(v_occ) y(e)
                       where y.e ->> 'leg' = 'primary' and y.e ->> 'entry_id' is not null));
end $function$;

CREATE OR REPLACE FUNCTION clara.list_accrual_adjustments(p_client uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_actor uuid; v_firm uuid; v_rows jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'effective_from' desc, x ->> 'created_at' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'accrual_id', a.id, 'plan_id', a.plan_id, 'revision', a.revision, 'purpose', a.purpose,
        -- #942: the register's own side, so a filter and a column can name it.
        'side', a.side,
        'expense_account_code', a.expense_account_code,
        'liability_account_code', a.liability_account_code,
        'amount_cents', a.amount_cents, 'currency', a.currency,
        'effective_from', to_char(a.effective_from,'YYYY-MM-DD'),
        'effective_to', case when a.effective_to is null then null else to_char(a.effective_to,'YYYY-MM-DD') end,
        'service_period_start', to_char(a.service_period_start,'YYYY-MM-DD'),
        'service_period_end', to_char(a.service_period_end,'YYYY-MM-DD'),
        'term_source', a.term_source, 'method', a.method,
        'document_service_period_id', a.document_service_period_id,
        'source_document_id', a.source_document_id,
        'plan_status', p.status, 'plan_kind', p.kind,
        'recorded_by', a.recorded_by, 'created_at', a.created_at,
        'occurrence_count', (select count(*)::int from clara.accounting_plan_occurrences o
                              where o.plan_id = a.plan_id),
        -- POSTED means a COMMITTED receipt exists for one of this plan's occurrences. Derived,
        -- never cached: a cached flag can disagree with the ledger it claims to describe.
        'posted', exists (select 1 from clara.accounting_plan_occurrences o
                           join clara.operation_receipts rc on rc.work_id = o.work_id
                                                           and rc.outcome = 'committed'
                          where o.plan_id = a.plan_id and o.leg = 'primary')
      ) as x
        from clara.accrual_adjustments a
        join clara.accounting_plans p on p.id = a.plan_id
       where a.client_id = p_client and a.firm_id = v_firm
         and (p_from is null or a.effective_from >= p_from)
         and (p_to is null or a.effective_from <= p_to)
    ) s;
  return jsonb_build_object('client_id', p_client,
    'from', case when p_from is null then null else to_char(p_from,'YYYY-MM-DD') end,
    'to', case when p_to is null then null else to_char(p_to,'YYYY-MM-DD') end,
    'accruals', v_rows);
end $function$;

-- =====================================================================================
-- §H THE PER-PERIOD LINE OVERRIDE (#937, 0303) — the same mirror, applied to the figure a person
--    stated for one due date. The resolver reads the LIVE accrual detail, so it reads that row's
--    own side; `clara._plan_admit_occurrence` hands whatever comes back to the shared basis
--    builder unchanged and is pinned, untouched, in both the prestate and the tail.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._plan_accrual_period_line(p_plan uuid, p_due date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
  with live as (
    -- THE LIVE ACCRUAL DETAIL: the highest revision on this plan. See the header's SECOND
    -- MEASUREMENT for why this is not `= the live plan revision`.
    select a.* from clara.accrual_adjustments a
     where a.plan_id = p_plan
     order by a.revision desc, a.created_at desc
     limit 1)
  select jsonb_build_object(
           'accrual_id', a.id,
           'due_date', to_char(pa.due_date,'YYYY-MM-DD'),
           'amount_cents', pa.amount_cents,
           'side', a.side,
           'expense_account_code', a.expense_account_code,
           'liability_account_code', a.liability_account_code,
           -- THE LINES THE OCCURRENCE POSTS, built HERE rather than in the shared basis body --
           -- 0223's own reason, carried: that body stays a generic "use these lines instead" seam
           -- with no accrual vocabulary in it, and stays IMMUTABLE.
           -- #942: the same mirror `clara._accrual_journal_basis` applies to the revision's
           -- frozen basis, applied to the period's own stated amount -- so a per-period accrual
           -- posts the right way round on either side.
           'lines', case when a.side = 'revenue' then jsonb_build_array(
             jsonb_build_object('account_code', a.liability_account_code,
               'debit_cents', pa.amount_cents, 'credit_cents', 0,
               'description', 'accrued income'),
             jsonb_build_object('account_code', a.expense_account_code,
               'debit_cents', 0, 'credit_cents', pa.amount_cents,
               'description', 'the accrual period ending ' || to_char(pa.due_date,'YYYY-MM-DD')))
           else jsonb_build_array(
             jsonb_build_object('account_code', a.expense_account_code,
               'debit_cents', pa.amount_cents, 'credit_cents', 0,
               'description', 'the accrual period ending ' || to_char(pa.due_date,'YYYY-MM-DD')),
             jsonb_build_object('account_code', a.liability_account_code,
               'debit_cents', 0, 'credit_cents', pa.amount_cents,
               'description', 'accrual')) end)
    from live a
    join clara.accrual_period_amounts pa on pa.accrual_id = a.id and pa.due_date = p_due
   where a.method ->> 'rule' = 'stated_period_amount'
   limit 1;
$function$;

-- =====================================================================================
-- §I THE "A DOCUMENT ARRIVED INSIDE AN ACCRUED PERIOD" READ GAINS ITS REVENUE ARM.
--
--    #938 (0302) spliced `row_kind='accrual_bill_conflict'` onto clara.list_review_queue. Its
--    predicate is ALREADY side-agnostic: it joins the accrual's own profit-and-loss leg
--    (`aa.expense_account_code`), which on a revenue accrual IS the income account, so an issued
--    invoice or a receipt posting to it inside a posted, un-reversed period already surfaces the
--    item (MEASURED before this file was written: the battery's own p942.conflict cell reached
--    every assertion up to the side). What the arm cannot do yet is SAY which side it is about —
--    it calls every collision "a document-sourced entry", and a bookkeeper reading "a bill
--    arrived" about an accrued FEE is being told the wrong story.
--
--    FIVE EDITS, ALL ADDITIVE, ALL BY SPLICE ON THE INSTALLED BODY rather than by embedding a
--    recut copy — 0302's own idiom, for a reason this wave makes concrete: three other lanes are
--    adding row kinds to this same body in this same wave, and a file that embedded its own copy
--    would silently drop whichever arm landed at a LOWER migration number than this one.
--      (a) the sentence names the side, and the expense side's own words are byte-identical to
--          what #938 shipped (the `else` arm renders the same string, character for character);
--      (b) the row carries `accrual_side`, derived at json-build time from the shared `id` — the
--          `asset_id`/`advance_id`/`authority_id` idiom this body already uses three times, and
--          the reason 0302 gives for it: an extra identity that is fully derivable from `id`
--          never joins the 28-wide shared column vector, so no other arm is touched at all.
--
--    THE THREE THE FIX ROUND ADDED, each answering a finding the reviews drove:
--      (c) THE AMOUNT IS THE FLAGGED PERIOD'S OWN (ADV-04). #937 (0303) changed what
--          `accrual_adjustments.amount_cents` MEANS under the `stated_period_amount` rule -- it is
--          the WINDOW TOTAL, and each due date posts its own stated figure -- after #938 had
--          already written that column onto the row. A bookkeeper comparing a bill with "Accrual
--          amount" was therefore being shown the whole window's total, which is not a number the
--          period ever posted. The arm now resolves `clara._plan_accrual_period_line` -- the ONE
--          body 0303 gives for "what does THIS due date accrue" -- and falls back to the column
--          only where that body answers null, which is exactly the `stated_amount` rule it is
--          still true for.
--      (d) THE ROW CARRIES THE PLAN'S STATUS (ADV-03). Both remedies are plan-lane doors that
--          refuse a plan that is not active (`plan_ended` / `plan_paused`), while the double
--          count they were offered for is still on the books -- so ending a plan used to leave a
--          permanent item offering two buttons that could never succeed. Dropping such a row
--          would hide a live double count, so the row STAYS and says why instead: the surfaces
--          render the remedies unavailable with the reason. Derived from the shared `id` the
--          same way (b) is, so again no arm's column vector moves.
--      (e) AN ISSUED INVOICE IS NOT A FILED DOCUMENT (AC3, SPEC-02). AC3 asks for "an issued
--          invoice or receipt posting to the accrual's revenue account". MEASURED: a sales
--          invoice admitted through the trade-invoice lane posts through
--          `clara._record_journal_entry_core` (0225) with `origin='agent'` and a NULL
--          `document_id`, so the filed-document predicate #938 wrote could never see one, and an
--          accrued FEE double-counted its period unwarned. The REVENUE side therefore also admits
--          an entry that IS a `sales_invoice` trade invoice's own posting, joined the one way the
--          estate links them (`trade_invoices.work_id` -> the committed `operation_receipts` row
--          whose `effects` names the entry). The EXPENSE side is deliberately unwidened: #938's
--          own AC1 says "document-sourced journal entries", and a supplier bill reaches this
--          estate AS a filed document. The residual (a supplier bill admitted through the
--          trade-invoice lane) is named in the ticket report as a follow-up, not smuggled in here.
-- =====================================================================================
do $t942_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; r record; v_vector_pre int;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '#942 splice: clara.list_review_queue is GONE' using errcode='CLR10';
  end if;
  if position($$'accrual_bill_conflict'::text row_kind$$ in v_def) = 0 then
    raise exception '#942 splice: clara.list_review_queue carries no accrual_bill_conflict arm -- 0302 must apply first'
      using errcode='CLR10';
  end if;

  -- EACH EDIT GUARDS ITSELF (fix round 1). The block used to test ONE marker for the whole
  -- splice, which made it un-redoable the moment a later round added a second edit: under
  -- `CLARA_MIGRATION_REDO` the body already carried `accrual_side` and the new edits would have
  -- been skipped with it. Every edit below is now applied only when its OWN marker is absent, so a
  -- redo converges on exactly the same body an apply produces, and the postcheck runs either way.
  v_next := v_def;

  if position($$'document-sourced invoice or receipt'$$ in v_next) = 0 then
    -- (a) THE SENTENCE.
    v_anchor :=
      '      format(''A document-sourced entry posted inside the accrued period %s to %s for "%s"'','
      || chr(10) ||
      '        to_char(o.period_key,''YYYY-MM-DD''),to_char(pw.period_end,''YYYY-MM-DD''),aa.purpose) question_text,';
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#942 splice: the bill_rows sentence anchor appears % time(s) (expected 1) -- re-derive against the live body', v_n
        using errcode='CLR10';
    end if;
    v_repl :=
      '      format(''A %s posted inside the accrued period %s to %s for "%s"'',' || chr(10) ||
      '        case when aa.side=''revenue'' then ''document-sourced invoice or receipt''' || chr(10) ||
      '             else ''document-sourced entry'' end,' || chr(10) ||
      '        to_char(o.period_key,''YYYY-MM-DD''),to_char(pw.period_end,''YYYY-MM-DD''),aa.purpose) question_text,';
    v_next := replace(v_next, v_anchor, v_repl);
  end if;

  if position($$'accrual_side'$$ in v_next) = 0 then
    -- (b) THE SIDE ON THE ROW.
    v_anchor := $$'authority_id',case when p.row_kind='depreciation_authority_pending' then p.id end,$$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#942 splice: the json-build identity anchor appears % time(s) (expected 1)', v_n
        using errcode='CLR10';
    end if;
    v_repl := v_anchor
      || $$'accrual_side',case when p.row_kind='accrual_bill_conflict' then (select aa942.side from clara.accrual_adjustments aa942 where aa942.plan_id=p.id order by aa942.revision desc limit 1) end,$$;
    v_next := replace(v_next, v_anchor, v_repl);
  end if;

  if position('clara._plan_accrual_period_line(o.plan_id,o.due_date)' in v_next) = 0 then
    -- (c) THE FLAGGED PERIOD'S OWN AMOUNT (ADV-04).
    v_anchor := $$      aa.amount_cents,to_char(o.due_date,'YYYY-MM-DD') period,$$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#942 splice: the bill_rows amount anchor appears % time(s) (expected 1)', v_n
        using errcode='CLR10';
    end if;
    v_repl := $$      coalesce((clara._plan_accrual_period_line(o.plan_id,o.due_date)->>'amount_cents')::bigint,aa.amount_cents) amount_cents,to_char(o.due_date,'YYYY-MM-DD') period,$$;
    v_next := replace(v_next, v_anchor, v_repl);
  end if;

  if position($$'accrual_plan_status'$$ in v_next) = 0 then
    -- (d) THE PLAN'S STATUS ON THE ROW (ADV-03), appended to (b)'s own key so the two derived
    --     identities sit together and neither touches the shared column vector.
    v_anchor := $$'accrual_side',case when p.row_kind='accrual_bill_conflict' then (select aa942.side from clara.accrual_adjustments aa942 where aa942.plan_id=p.id order by aa942.revision desc limit 1) end,$$;
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#942 splice: the accrual_side key appears % time(s) (expected 1)', v_n
        using errcode='CLR10';
    end if;
    v_repl := v_anchor
      || $$'accrual_plan_status',case when p.row_kind='accrual_bill_conflict' then (select pl942.status from clara.accounting_plans pl942 where pl942.id=p.id) end,$$;
    v_next := replace(v_next, v_anchor, v_repl);
  end if;

  if position('ti942.kind=''sales_invoice''' in v_next) = 0 then
    -- (e) THE REVENUE SIDE'S ISSUED-INVOICE ROUTE (AC3, SPEC-02).
    v_anchor :=
      '      and je.status=''approved'' and je.origin=''document'' and je.document_id is not null'
      || chr(10) || '      and je.reversed_by is null';
    v_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#942 splice: the bill_rows document predicate appears % time(s) (expected 1)', v_n
        using errcode='CLR10';
    end if;
    v_repl :=
      '      and je.status=''approved'' and je.reversed_by is null' || chr(10) ||
      '      and ((je.origin=''document'' and je.document_id is not null)' || chr(10) ||
      '        or (aa.side=''revenue'' and je.origin=''agent'' and exists (' || chr(10) ||
      '             select 1 from clara.trade_invoices ti942' || chr(10) ||
      '               join clara.operation_receipts tr942 on tr942.work_id=ti942.work_id' || chr(10) ||
      '                    and tr942.outcome=''committed''' || chr(10) ||
      '              where ti942.client_id=o.client_id and ti942.kind=''sales_invoice''' || chr(10) ||
      '                and (tr942.effects->>''entry_id'')::uuid=je.id)))';
    v_next := replace(v_next, v_anchor, v_repl);
  end if;

  if v_next = v_def then
    -- REDO (#957): every edit this file makes is already in the installed body. Nothing is
    -- spliced and the postcheck below runs anyway, so a redo proves the same things an apply does.
    raise notice '#942 splice: clara.list_review_queue already carries every edit this file makes -- redo, nothing spliced.';
  else
    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#942 postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#942 postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode='CLR10';
    end if;
  end if;

  -- THE POSTCHECK, in BOTH branches: every row kind survives at its exact marker count (the
  -- 0146/0180/0260 HIGH-1 guard — a marker hiding in a comment must not count), the shared column
  -- vector is untouched, and this file's two edits are each present exactly once.
  v_code := regexp_replace(regexp_replace(
    (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1), ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1), ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1), ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1), ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'work_question'::text row_kind$$, 1), ($$'depreciation_authority_pending'::text row_kind$$, 1),
      ($$'accrual_bill_conflict'::text row_kind$$, 1),
      ($$'document-sourced invoice or receipt'$$, 1),
      ($$'document-sourced entry'$$, 1),
      ($$'accrual_side'$$, 1),
      ($$'accrual_plan_status'$$, 1),
      ('clara._plan_accrual_period_line(o.plan_id,o.due_date)', 1),
      ($$ti942.kind='sales_invoice'$$, 1)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#942 postcheck: marker "%" appears % time(s), expected % -- the splice was not additive', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;
  -- THE SHARED COLUMN VECTOR IS UNTOUCHED: this file adds no arm and no column, so the count is
  -- whatever the body carried when this block read it -- MEASURED, never a literal (fix round 1,
  -- ADV-01: a sibling lane of the same wave carries the same trailing column on its own arm, so
  -- an absolute of eleven would have killed the integrated chain here too).
  v_vector_pre := (length(regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'))
                   - length(replace(regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
                            'null::int open_proposal_count', '')))
                  / length('null::int open_proposal_count');
  v_n := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
         / length('null::int open_proposal_count');
  if v_n <> v_vector_pre or v_vector_pre < 11 then
    raise exception '#942 postcheck: the shared column vector appears % time(s), expected the % this block read before it spliced (at least 11)', v_n, v_vector_pre
      using errcode='CLR10';
  end if;

  raise notice '#942: clara.list_review_queue -- the accrual_bill_conflict sentence names the side, the row carries accrual_side and accrual_plan_status (both derived from the shared id), the amount is the FLAGGED PERIOD''s own under #937''s per-period rule, and the revenue side also sees a sales invoice admitted through the trade-invoice lane; every row kind survives at its exact marker count and the shared column vector is unmoved at %.', v_n;
end
$t942_lrq$;

-- =====================================================================================
-- §Z TAIL. Re-reads the live catalog rather than trusting the blocks above ran as written, and
--    DRIVES the side predicate rather than reading it.
-- =====================================================================================
reset role;
do $t942_tail$
declare
  v_sha text; v_def text; v_post text; v_n int; v_before int; v_mode text;
  v_side text; v_ok boolean;
  v_expr text; v_probe_expr text; v_sides text[];
begin
  -- 1 · THE COLUMN, ITS DEFAULT AND WHAT IT DID TO THE ROWS THAT WERE ALREADY THERE.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='accrual_adjustments' and column_name='side'
     and is_nullable='NO' and column_default = '''expense''::text';
  if v_n <> 1 then
    raise exception '#942 tail: clara.accrual_adjustments.side is not a NOT NULL column defaulting to ''expense'''
      using errcode='CLR10';
  end if;
  -- EVERY ROW THAT PREDATES THIS FILE IS AN EXPENSE ACCRUAL, asserted against what the prestate
  -- actually counted rather than against the table as it stands: on a FIRST APPLY the two numbers
  -- must agree exactly, and on a REDO the rows the battery wrote in between are allowed to be
  -- revenue accruals (they are the point).
  select mode, rows_before into v_mode, v_before from t942_prestate;
  if v_mode = 'FIRST APPLY' then
    select count(*)::int into v_n from clara.accrual_adjustments where side = 'expense';
    if v_n <> v_before then
      raise exception '#942 tail: % of the % accrual row(s) that predate this migration are not on the expense side -- the column default did not reach them',
        v_before - v_n, v_before using errcode='CLR10';
    end if;
    select count(*)::int into v_n from clara.accrual_adjustments;
    if v_n <> v_before then
      raise exception '#942 tail: the accrual row count moved from % to % -- this file writes no accrual row',
        v_before, v_n using errcode='CLR10';
    end if;
  end if;
  drop table t942_prestate;

  -- 2 · THE CLOSED SET AND THE CHECK AGREE, PROVEN BY DRIVING THE PREDICATE (0303's own idiom,
  --     for the same reason: a census that READS a constraint's text proves only that somebody
  --     typed the same words twice).
  v_sides := clara._accrual_sides();
  if array_length(v_sides, 1) <> 2
     or not ('expense' = any (v_sides)) or not ('revenue' = any (v_sides)) then
    raise exception '#942 tail: clara._accrual_sides() is %, expected exactly the two sides this lane performs',
      v_sides using errcode='CLR10';
  end if;
  select pg_get_expr(conbin, conrelid) into v_expr from pg_constraint
   where conrelid = 'clara.accrual_adjustments'::regclass
     and conname = 'ck_accrual_adjustments_side';
  if v_expr is null then
    raise exception '#942 tail: ck_accrual_adjustments_side is absent' using errcode='CLR10';
  end if;
  create temporary table t942_side_probe (
    side text not null check (side in ('expense','revenue'))
  ) on commit drop;
  select pg_get_expr(conbin, conrelid) into v_probe_expr from pg_constraint
   where conrelid = 't942_side_probe'::regclass and contype = 'c';
  if regexp_replace(v_probe_expr, '\s+', ' ', 'g')
     is distinct from regexp_replace(v_expr, '\s+', ' ', 'g') then
    raise exception '#942 tail: the probe predicate (%) is not the one on clara.accrual_adjustments (%)',
      v_probe_expr, v_expr using errcode='CLR10';
  end if;
  insert into t942_side_probe(side) select unnest(v_sides);
  select count(*)::int into v_n from t942_side_probe;
  if v_n <> array_length(v_sides, 1) then
    raise exception '#942 tail: the CHECK accepted % of the % sides clara._accrual_sides() offers',
      v_n, array_length(v_sides, 1) using errcode='CLR10';
  end if;
  -- …AND NOTHING ELSE IS: a plausible third word, the account TYPE rather than the side, a blank,
  -- and the right word in the wrong case.
  foreach v_side in array array['both','income','','Expense'] loop
    v_ok := false;
    begin
      insert into t942_side_probe(side) values (v_side);
      v_ok := true;
    exception when check_violation then v_ok := false;
    end;
    if v_ok then
      raise exception '#942 tail: the side CHECK admits "%", which clara._accrual_sides() does not offer', v_side
        using errcode='CLR10';
    end if;
  end loop;
  drop table t942_side_probe;

  -- 3 · WHAT AN ABSENT SIDE MEANS, DRIVEN rather than read: the one body every writer asks.
  if clara._accrual_side('{}'::jsonb) <> 'expense'
     or clara._accrual_side('{"side":"revenue"}'::jsonb) <> 'revenue'
     or clara._accrual_side('{"side":"  revenue  "}'::jsonb) <> 'revenue'
     or clara._accrual_side('{"side":""}'::jsonb) <> 'expense' then
    raise exception '#942 tail: clara._accrual_side does not answer expense for an absent or blank side'
      using errcode='CLR10';
  end if;

  -- 4 · THE RECUT BODIES ARE AT THIS FILE'S OWN OUTPUT.
  for v_def, v_post in
    select * from (values
      ('clara._assert_accrual_account(uuid,text,text,text,boolean)',
       '5e80929f7f6bb7c7e77218b69be34d1cb986d3b07010a5047353e2d55359987f'),
      ('clara._assert_accrual_particulars(jsonb)',
       'a5a8e80f0a9843568e9c34ac69afacaf5897a0ba432ae85a92494ebdef4ad1f4'),
      ('clara._assert_accrual_world(uuid,uuid,jsonb)',
       '7c26456962c4b7f145f626046db36aa90286a6d201161dbb5199fcc13b74f43f'),
      ('clara._accrual_canonical(jsonb)',
       '53d65bd346da9dd65dd27becf91d8f2ea9fca1ccf3e0356a12a36fe69fa13dc3'),
      ('clara._accrual_journal_basis(jsonb,text,date)',
       '5b77077993986a53422716f289a4abeac7a17d9ee0c23bcabb08c7f77cb581de'),
      ('clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)',
       '0c73cc38b532e99fbba70ca56c98c4f97449d16c275ff2381f3d504b4aa89006'),
      ('clara.correct_accrual_adjustment(uuid,jsonb,text)',
       '6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa'),
      ('clara.get_accrual_adjustment(uuid)',
       '9bc5da4b59aeba5066436583267998cb3e52757b95022a452c187667f576d7d4'),
      ('clara.list_accrual_adjustments(uuid,date,date)',
       'c4924f1dbbd6b3ae0dd073ceed5f9b19016cc842a796d4256bd5f909f58c22df'),
      ('clara._plan_accrual_period_line(uuid,date)',
       '9951a63f8eb0926b99917a3ef7dfedd32689af88ff25598b75075f174adf7941')
    ) as t(sig, sha)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_def::regprocedure;
    if v_sha is distinct from v_post then
      raise exception '#942 tail: % is not at this file''s own output (got %)', v_def, v_sha
        using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE TWO NEW INTERNALS ARE UNGRANTED, and no application role can reach either.
  foreach v_def in array array['clara._accrual_sides()','clara._accrual_side(jsonb)'] loop
    if to_regprocedure(v_def) is null then
      raise exception '#942 tail: % does not resolve', v_def using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_def::regprocedure, 'execute') then
      raise exception '#942 tail: % is executable by PUBLIC', v_def using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_roles r
     where r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner'
       and has_function_privilege(r.rolname, v_def::regprocedure, 'execute');
    if v_n <> 0 then
      raise exception '#942 tail: % is reachable by % application role(s)', v_def, v_n
        using errcode='CLR10';
    end if;
  end loop;

  -- 6 · THE DOORS' GRANTS ARE UNMOVED. This file recuts bodies; it grants nothing and revokes
  --     nothing, and a recut that silently widened a door would be the one mistake a reader of
  --     the diff could miss.
  if not has_function_privilege('clara_authenticated',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('public',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#942 tail: the correction door''s grant moved' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.get_accrual_adjustment(uuid)'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara.get_accrual_adjustment(uuid)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', 'clara.get_accrual_adjustment(uuid)'::regprocedure, 'execute') then
    raise exception '#942 tail: the accrual detail read''s grant moved' using errcode='CLR10';
  end if;
  -- …and the THIRD externally-granted body this file recuts. It was missing from this census
  -- (fix round 1, STD-942-01) although the corpus entry beside it claimed "every door grant it
  -- must not have moved": a self-check that covers two of three is not the claim it makes.
  if not has_function_privilege('clara_authenticated',
        'clara.list_accrual_adjustments(uuid,date,date)'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara.list_accrual_adjustments(uuid,date,date)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', 'clara.list_accrual_adjustments(uuid,date,date)'::regprocedure, 'execute') then
    raise exception '#942 tail: the accrual list read''s grant moved' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime',
        'clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_authenticated',
        'clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)'::regprocedure, 'execute') then
    raise exception '#942 tail: the OBO configuration door''s grant moved' using errcode='CLR10';
  end if;

  -- 7 · clara.accrual_adjustments keeps its three triggers and its forced RLS; this file added a
  --     column and a CHECK and nothing else.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.accrual_adjustments'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception '#942 tail: expected 3 triggers on clara.accrual_adjustments, found %', v_n
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_class c where c.oid='clara.accrual_adjustments'::regclass
                   and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#942 tail: clara.accrual_adjustments lost forced row level security'
      using errcode='CLR10';
  end if;

  raise notice '#942 tail: OK -- clara.accrual_adjustments carries a NOT NULL side defaulting to expense with every pre-existing row on the expense side; clara._accrual_sides() and ck_accrual_adjustments_side admit exactly expense and revenue, proven by driving a byte-identical predicate with both members and four non-members; clara._accrual_side answers expense for an absent or blank side; the recut bodies are at this file''s own output; the two new internals are ungranted and unreachable by every application role; and the configuration, correction and read doors'' grants are unmoved.';
end
$t942_tail$;
