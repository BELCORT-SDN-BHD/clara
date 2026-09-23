-- 0303_accrual_period_amounts — #937 (riders wave 4, lane 03): AN ACCRUAL MAY CARRY A
-- PERSON-STATED AMOUNT PER PERIOD.
-- =====================================================================================
-- Spec of record: issue #937's body (its five acceptance criteria). Parent #907, owner ruling
-- 2026-09-18: "an accrual may carry a person-stated amount per period; the other two withdrawn
-- rules stay withdrawn, and reading the amount from a document is excluded". Domain words:
-- CONTEXT.md — "Accrual adjustment", "Accrual reversal", "Accrual correction",
-- "Calculation method", "Stated period amount".
--
-- THE GAP THIS CLOSES. Today an accrual states ONE amount and every period of its authority
-- window posts that same figure: `clara._accrual_journal_basis` (0222) freezes it into the plan
-- revision's basis and `clara._plan_occurrence_basis` (0193/0223) only moves the posting date. An
-- accountant whose July rent is 3,000 and whose August rent is 3,500 has no way to say so — the
-- only shapes available are one accrual per month (three plans, three authorities, three
-- schedules for one instruction) or an average nobody stated.
--
-- THE SEAM ALREADY EXISTS, AND THIS FILE RIDES IT RATHER THAN INVENTING A SECOND ONE. #653
-- (0223) faced exactly this for prepayment amortisation and cut the answer into the shared
-- admission core: `clara._plan_admit_occurrence` resolves a PER-DUE-DATE line in its own VOLATILE
-- body and hands it to `clara._plan_occurrence_basis` as an ARGUMENT — which is precisely what
-- lets that body stay IMMUTABLE — and a NULL line is a real answer that is refused BY NAME on the
-- occurrence, never allowed to fall back to the revision's constant. This file adds the accrual
-- lane's own resolver beside the amortisation one and teaches the admission core to ask it.
-- `clara._plan_occurrence_basis` is NOT TOUCHED (AC1): it is pinned below, re-hashed in the tail,
-- and stays IMMUTABLE.
--
-- =====================================================================================
-- THE FIRST MEASUREMENT: WHERE THE AMOUNTS LIVE.
--
-- A NEW APPEND-ONLY RELATION, `clara.accrual_period_amounts`, KEYED ON THE ACCRUAL DETAIL AND THE
-- DUE DATE (AC1's own words). Not a jsonb column on `clara.accrual_adjustments`: that relation is
-- append-only by trigger with exactly ONE admitted update (0284's correction stamp), so a jsonb
-- array on it could never be corrected, and a per-period amount is a figure a human states, keyed
-- by a date the schedule produces — a row, not a blob. Not the amortisation lane's
-- `period_lines` jsonb either, because THAT array is a frozen evaluator's DERIVED output carried
-- verbatim (0223 §A), and this one is a set of figures a person typed; the two have opposite
-- provenance and must not share a carrier that blurs it.
--
-- IT CARRIES NO plan_id AND NO revision. The accrual detail it hangs off already names both, and
-- a denormalised pair would be a second place for them to disagree. `(accrual_id, due_date)` is
-- unique, the composite FK carries the tenant, and the resolver reaches the plan through the
-- detail — one hop, on an index the accrual relation already has.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: WHICH ACCRUAL DETAIL IS THE LIVE ONE.
--
-- `clara._plan_accrual_period_line(p_plan, p_due)` resolves the HIGHEST-REVISION accrual detail
-- on the plan, not the one whose `revision` equals the live plan revision's. Measured reason: a
-- bookkeeper may lawfully revise the plan itself (`clara.revise_accounting_plan`, 0193) — to widen
-- or withdraw authority — which advances the plan to a revision the accrual detail does not name.
-- Keying the resolver on `= r.revision` would make it answer NULL for an accrual that is plainly
-- still running, and the admission core would then post the frozen constant (the accrual's TOTAL)
-- for every remaining period. Highest revision is exactly the rule `apps/web/lib/accruals/api.ts`'s
-- own `liveAccrualForPlan` already states for the same relation, for the same reason: a correction
-- leaves BOTH rows and `uq_accrual_adjustments_plan_revision` makes the newest one the live one.
--
-- A PLAIN REVERSING JOURNAL NOBODY CONFIGURED FROM AN ACCRUAL IS UNAFFECTED. It has no
-- `clara.accrual_adjustments` row at all (measured on this rig: reversing plans exist both with
-- and without one), so the probe answers NULL, neither arm is taken, and its constant basis keeps
-- posting byte for byte as before.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: WHAT A REVERSAL REVERSES.
--
-- A `reversing_journal` plan's reversal leg falls on the first day of the month AFTER the accrual
-- it undoes (`clara._plan_reversal_date`, 0193) — a DIFFERENT date from the accrual's own due
-- date, and one this new relation deliberately holds no row for. The recut admission core
-- therefore resolves the reversal's line on `v_primary_due` (the accrual date the core has
-- already measured under the plan lock for the orphan wall), never on the reversal's own date, so
-- a reversal undoes the amount its period actually posted rather than nothing at all.
--
-- AND IT RESOLVES ONE ONLY ONCE A POSTED ACCRUAL STANDS BEHIND IT. `v_primary_entry is not null`
-- gates the accrual arm for a reversal leg, so a reversal with no posted accrual behind it falls
-- through to 0193's own orphan wall and is refused as `reversal_before_primary` — its honest
-- name — instead of being told its period has no stated amount, which would be true but useless.
--
-- =====================================================================================
-- THE FOURTH MEASUREMENT: WHAT THE DOOR ENFORCES, AND WHAT THE OCCURRENCE ENFORCES.
--
-- THE DOOR (`clara._assert_accrual_period_amounts`, called from the configuration tail and from
-- the correction door) asks five questions of a stated set, all of them answerable from the
-- particulars and the schedule alone:
--
--   1. SHAPE. Every element is an object carrying an ISO `due_date` and a positive integer
--      `amount_cents`; no two elements name the same date.
--   2. SCHEDULED. Every stated date is a date this schedule actually produces inside the
--      authority window — `clara._plan_due_nth`, the plan lane's own arithmetic, walked from k=0.
--      A typo'd date would otherwise be money stated for a period that never comes due.
--   3. COMPLETE. Every date the schedule produces inside the window is stated. "Clara asks when a
--      period is missing" is the conversation half of this same rule; here it is a refusal.
--   4. EXACT SUM. The stated amounts sum EXACTLY to the accrual's own `amount_cents`, which under
--      this rule is the TOTAL for the window rather than the per-period figure. That is the one
--      meaning-shift this rule makes to an existing column, and it is what makes the set
--      checkable at all: without it the total and the periods are two unrelated claims.
--   5. THE FINAL-PERIOD REMAINDER (the prepayment lane's `final_period` rule, 0140/0223). It
--      binds exactly the shape it names: when the stated set IS an equal split with one odd
--      period — every amount is either `trunc(total/n)` or `trunc(total/n) + remainder`, and
--      exactly one is the latter — that odd period must be the LAST one. A genuinely uneven set
--      (July 3,000, August 3,500) never enters this arm, which is the whole point of the rule:
--      the convention governs where a DIVISION's leftover cent goes, not what a person may state.
--
-- THE OCCURRENCE enforces the one thing the door cannot see: a due date that appears AFTER the
-- accrual was configured. `clara.revise_accounting_plan` can widen the authority window, and the
-- ticket's own rule is that such a date "posts nothing and records a typed refusal on that
-- occurrence, exactly as prepayment amortisation does; the plan's constant is never used as a
-- fallback". `accrual_period_amount_missing` (CLR10) is that refusal, recorded on the occurrence
-- and legible in the plan's own history — and the SAME row becomes admissible once a correction
-- states the amount, exactly as 0223's own missing-line refusal does.
--
-- =====================================================================================
-- THE FIFTH MEASUREMENT: `_accrual_canonical` MUST SEE THEM.
--
-- Both create doors and the correction door reserve on `clara._hash(… clara._accrual_canonical(
-- p_accrual) …)`. A canonical form blind to `period_amounts` would make two DIFFERENT per-period
-- sets under one op key a REPLAY of the first rather than the typed `op_key_conflict` the estate
-- promises — the same figures-changed-under-one-key hole 0222's own canonicaliser exists to
-- close. It is recut here to fold the set in, sorted by due date so the hash is order-blind.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--
--   · IT DOES NOT TOUCH `clara._plan_occurrence_basis` (AC1, explicitly). It stays IMMUTABLE and
--     byte-identical; the tail re-hashes it.
--   · IT DOES NOT TOUCH THE TWO WITHDRAWN RULES. `source_document_amount` and
--     `prior_period_amount` stay refused by name (owner ruling 2026-09-18), and reading an amount
--     off a document stays out of scope.
--   · IT DOES NOT WIDEN THE CONVERSATION TOOL. `start_accrual_work` and its carrier
--     `packages/runtime/lib/accrual-basis.ts` are FROZEN; AC4 is delivered as a successor contract
--     in this ticket's report for the `chatTurn_v22` cut. The database doors it will call exist
--     after this file.
--   · IT MINTS NO NEW GRANTED NAME. Every function here is an ungranted internal reached through
--     the doors that already exist, so `packages/db/tests/rig-meta.mjs` needs no cohort — the
--     0285/0295 shape, not the 0284/0302 one.
--
-- REDO-SAFE BY CONSTRUCTION (wave-2 rule, `packages/db/README.md` "Redo (#957)"):
-- `create table if not exists`, `create or replace function`, `drop trigger if exists` before
-- each `create trigger`, `drop policy if exists` before the policy, `drop constraint if exists`
-- before the widened CHECK, and a prestate that reports FIRST or REDO instead of refusing on this
-- file's own objects. The five bodies this file RECUTS are pinned at their pre-image OR at this
-- file's own output; every other pin is exact. The FIRST-APPLY branch of those five was driven by
-- hand inside a rolled-back transaction before this file was committed (see the ticket report).
-- =====================================================================================

do $t937_pre$
declare
  v_sha text; v_i int; v_redo boolean := false; v_first boolean := false;
  -- The five bodies this file RECUTS, as [signature, pre-image, this file's own output]. A redo
  -- re-runs the file over its own effects, so each is accepted at EITHER value and the tail then
  -- asserts the post-image exactly.
  v_recut text[][] := array[
    ['clara._accrual_methods()',
     '51b59fae542b4f6214b8dca261265348b3c9973dc12f608c8b6442298cea917f',
     'f3fdd04bac3bf925fe39dc5a552bfa97269136859ec83ee147d2e8d08ff0aef1'],
    ['clara._accrual_canonical(jsonb)',
     '8c9dc78817e6730b6283727f0271c229a5794643c2f90038622504621c2a237e',
     'f7b2af98a7dcf0e3bb64434a12a6feb89431a551f37481bf9d888079a9c43a1b'],
    ['clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)',
     'dbcedcc778a04a237efe4c653f90605acc1121aa63117e23fb8fed1033f7e436',
     'bbeb43099d0cee972a62b7a81c9eebe13620b94120c45ed05dc2c5e57287624b'],
    ['clara.correct_accrual_adjustment(uuid,jsonb,text)',
     '8cce0629770abe6ea6594c9792b57d16fb8ffd1d2568abb9bd8a85dacdac7ebb',
     '9975f948944d2351c49eaa1c178f0dd9dc5572d446a7f9338ef9d5ede0b0fd79'],
    ['clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
     'a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46',
     '6980feab1f7d7851ab07c76f7af6d0114423bd016f39d30d4c5a324d1a05337b']
  ];
  -- The bodies this file CALLS or RELIES ON and must not move. Measured on clara_l03 after this
  -- lane's #938 (0302) landed — pin what is LIVE, never a literal copied from an older header.
  v_pins text[][] := array[
    ['clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)',
     'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e'],
    ['clara._plan_amortisation_period_line(uuid,date)',
     '88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c'],
    ['clara._accrual_journal_basis(jsonb,text,date)',
     'd1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403'],
    ['clara._assert_accrual_particulars(jsonb)',
     '71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b'],
    ['clara._assert_accrual_term_window(jsonb,date,date)',
     'e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09'],
    ['clara._assert_accrual_world(uuid,uuid,jsonb)',
     '32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750'],
    ['clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)',
     '31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5'],
    ['clara._plan_due_nth(date,text,text,int,int)',
     'f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e'],
    ['clara._plan_primary_for_reversal(date,text,text,int,date)',
     'd0b2bb5b777d282b9811db452b4cef26e885d7bf916b592d7356f36be308a328'],
    ['clara._plan_primary_entry(uuid,date)',
     'e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46'],
    ['clara._plan_window_ceiling(date,boolean)',
     'dd7f4ceaf3cf2568d3a9d379e10d0b61af02d4b835da521ea4ff07e14165cf8c'],
    ['clara._plan_occurrence_period_key(date,date,text,text,int,date,text)',
     '6d9f60d345da4df4f4e237746b5e875d746a785892af24f4a316d0f8bbeac63f'],
    ['clara._plan_admissible_event(uuid)',
     '3b569e338f1c1ff563c61a2185db7198c565c804bf66c92fa941c06a4470f4b3'],
    ['clara._plan_run_model()',
     'c0bdc01a3f61a9ac384de879f124336d28c961468800eecb2dcdd696306913c3'],
    ['clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
     '011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114'],
    ['clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
     '8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886'],
    ['clara._human_ctx(integer)',
     'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'],
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara._finish_op(uuid,text,text,jsonb)',
     'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'],
    ['clara._hash(jsonb)',
     '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'],
    ['clara.role_rank(text)',
     '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'],
    ['clara._tf_accrual_adjustment_append_only()',
     'e2d6fb3e2df66848053b6f5f442726e8984e1abd400c2fd23bd4a7cb90b1db4c'],
    ['clara._tf_accrual_adjustment_term_congruent()',
     '1e0483a6e9c19604305194b09b64a14c0bcfb6a1ca6133bcd3907efa7ea4411b']
  ];
begin
  if to_regclass('clara.accrual_adjustments') is null then
    raise exception '#937 prestate: clara.accrual_adjustments is absent -- 0222 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.accounting_plan_occurrences') is null then
    raise exception '#937 prestate: the plan lane (0193) is absent' using errcode='CLR10';
  end if;
  -- 0222's method CHECK must be exactly the ONE-RULE shape this file widens. A chain where it
  -- already reads two rules is a REDO (or a collision), never a first apply.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.accrual_adjustments'::regclass
                    and conname = 'accrual_adjustments_method_check') then
    raise exception '#937 prestate: accrual_adjustments_method_check is absent -- 0222 must have it'
      using errcode='CLR10';
  end if;

  v_first := to_regclass('clara.accrual_period_amounts') is null;
  v_redo  := not v_first;

  for v_i in 1 .. array_length(v_recut, 1) loop
    if to_regprocedure(v_recut[v_i][1]) is null then
      raise exception '#937 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha = v_recut[v_i][2] then
      if v_redo then
        raise exception '#937 prestate: % is at its PRE-IMAGE while clara.accrual_period_amounts already exists -- a half-applied state, not a redo',
          v_recut[v_i][1] using errcode='CLR10';
      end if;
    elsif v_sha = v_recut[v_i][3] then
      if v_first then
        raise exception '#937 prestate: % already carries THIS FILE''s body while clara.accrual_period_amounts is absent -- a half-applied state',
          v_recut[v_i][1] using errcode='CLR10';
      end if;
    else
      raise exception '#937 prestate: % has DRIFTED from BOTH its measured pre-image and this file''s own output -- re-measure before applying (got %)',
        v_recut[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#937 prestate: % is absent', v_pins[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#937 prestate: % has DRIFTED from its measured pre-image -- this file must not touch it, so re-measure before applying (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  raise notice '#937 prestate: clean (%) -- the five bodies this file recuts are each at exactly one of their two admitted values, and the twenty-four bodies it calls or relies on are byte-identical to their measured pre-images.',
    case when v_first then 'FIRST APPLY' else 'REDO' end;
end
$t937_pre$;

set role clara_fn_owner;
set local lock_timeout = '5s';

-- =====================================================================================
-- §A THE RELATION. One row per (accrual detail, due date): the amount a person stated for that
--    period. Append-only in full, no grants to any application role, reached ONLY through the
--    doors below and the resolver in §C.
-- =====================================================================================
create table if not exists clara.accrual_period_amounts (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null references clara.firms(id),
  client_id     uuid        not null,
  -- THE ACCRUAL DETAIL THIS AMOUNT BELONGS TO. Not the plan: a correction writes a SUCCESSOR
  -- detail row (0284) and its own amounts, and the superseded detail keeps naming the amounts it
  -- actually ran under -- which is what makes "what was this period posting before" answerable.
  accrual_id    uuid        not null,
  -- THE DUE DATE THE SCHEDULE PRODUCES. A date, never a month label: a remedy, a refusal and a
  -- resolver must all name the same occurrence byte for byte.
  due_date      date        not null,
  amount_cents  bigint      not null check (amount_cents > 0),
  currency      text        not null check (currency = 'MYR'),
  recorded_by   uuid        not null references clara.users(id),
  created_at    timestamptz not null default now(),
  constraint uq_accrual_period_amounts_detail_due unique (accrual_id, due_date),
  constraint fk_accrual_period_amounts_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- THE TENANT TRAVELS WITH THE PARENT, as a storage fact rather than a door's promise -- 0222's
  -- own `uq_accrual_adjustments_id_firm_client` exists for exactly this composite reference.
  constraint fk_accrual_period_amounts_accrual foreign key (accrual_id, firm_id, client_id)
    references clara.accrual_adjustments(id, firm_id, client_id)
);
comment on table clara.accrual_period_amounts is
  '#937: the amount a PERSON stated for one period of one accrual. Written ONLY by '
  'clara._accrual_finish (configuration) and clara.correct_accrual_adjustment (correction); no '
  'application role holds DML or SELECT. APPEND-ONLY IN FULL: a changed amount is a CORRECTION, '
  'which writes a successor accrual detail and its own rows, never an UPDATE of these. Read by '
  'clara._plan_accrual_period_line, which the shared admission core asks once per due event.';

create index if not exists ix_accrual_period_amounts_due
  on clara.accrual_period_amounts(due_date);

alter table clara.accrual_period_amounts enable row level security;
alter table clara.accrual_period_amounts force row level security;
drop policy if exists p_accrual_period_amounts_owner on clara.accrual_period_amounts;
create policy p_accrual_period_amounts_owner on clara.accrual_period_amounts for all
  to clara_fn_owner using (true) with check (true);

create or replace function clara._tf_accrual_period_amount_append_only()
returns trigger language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  -- NO ADMITTED UPDATE AT ALL, which is the one way this relation differs from
  -- clara.accrual_adjustments (whose trigger admits the single correction stamp). A stated period
  -- amount has no lifecycle: it is what somebody said, and a different figure is a different
  -- statement, recorded as a correction's own row.
  raise exception 'a stated period amount is append-only: correct the accrual instead'
    using errcode='CLR08',
      detail='{"reason":"append_only","relation":"accrual_period_amounts"}';
end $fn$;
revoke all on function clara._tf_accrual_period_amount_append_only() from public;

drop trigger if exists t_accrual_period_amounts_append_only on clara.accrual_period_amounts;
create trigger t_accrual_period_amounts_append_only
  before update or delete on clara.accrual_period_amounts
  for each row execute function clara._tf_accrual_period_amount_append_only();

-- =====================================================================================
-- §B THE METHOD SET AND THE TABLE CHECK WIDEN TOGETHER (AC2). The literal in the CHECK and the
--    array in the function are the SAME two rules, and the tail proves it by driving the CHECK
--    with every member of the function's own answer.
-- =====================================================================================
create or replace function clara._accrual_methods()
returns text[] language sql immutable security definer set search_path = clara, pg_temp as $fn$
  -- TWO RULES, BECAUSE TWO RULES ARE NOW PERFORMED.
  --   `stated_amount`        -- the figure stated on the record, accrued in EVERY period. The
  --                             revision's frozen basis carries it and the posting date moves.
  --   `stated_period_amount` -- one figure per DUE DATE, stated by a person, resolved at
  --                             admission by clara._plan_accrual_period_line and handed to the
  --                             shared basis builder as a line override. The revision's constant
  --                             is NEVER a fallback: a period nobody stated is refused by name.
  -- `source_document_amount` and `prior_period_amount` stay withdrawn (owner ruling 2026-09-18):
  -- nothing performs them, and a rule offered but not honoured is a promise the ledger breaks.
  select array['stated_amount','stated_period_amount']::text[]
$fn$;
revoke all on function clara._accrual_methods() from public;

alter table clara.accrual_adjustments
  drop constraint if exists accrual_adjustments_method_check;
alter table clara.accrual_adjustments
  add constraint accrual_adjustments_method_check
  check (jsonb_typeof(method) = 'object'
         and (method - 'rule') = '{}'::jsonb
         and (method ->> 'rule') in ('stated_amount','stated_period_amount'));

-- =====================================================================================
-- §C THE RESOLVER — the accrual lane's twin of clara._plan_amortisation_period_line (0223).
--    STABLE (it reads tables), SECURITY DEFINER with a pinned search_path, ungranted, and NULL is
--    a REAL ANSWER: "this plan states no amount for this date", which the admission core refuses
--    by name rather than papering over with the revision's constant.
-- =====================================================================================
create or replace function clara._plan_accrual_period_line(p_plan uuid, p_due date)
returns jsonb language sql stable security definer set search_path = clara, pg_temp as $fn$
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
           'expense_account_code', a.expense_account_code,
           'liability_account_code', a.liability_account_code,
           -- THE LINES THE OCCURRENCE POSTS, built HERE rather than in the shared basis body --
           -- 0223's own reason, carried: that body stays a generic "use these lines instead" seam
           -- with no accrual vocabulary in it, and stays IMMUTABLE.
           'lines', jsonb_build_array(
             jsonb_build_object('account_code', a.expense_account_code,
               'debit_cents', pa.amount_cents, 'credit_cents', 0,
               'description', 'the accrual period ending ' || to_char(pa.due_date,'YYYY-MM-DD')),
             jsonb_build_object('account_code', a.liability_account_code,
               'debit_cents', 0, 'credit_cents', pa.amount_cents,
               'description', 'accrual')))
    from live a
    join clara.accrual_period_amounts pa on pa.accrual_id = a.id and pa.due_date = p_due
   where a.method ->> 'rule' = 'stated_period_amount'
   limit 1;
$fn$;
revoke all on function clara._plan_accrual_period_line(uuid,date) from public;

-- =====================================================================================
-- §D THE DOOR'S OWN WALLS. Five questions, answerable from the particulars and the schedule
--    alone (see the header's FOURTH MEASUREMENT). IMMUTABLE: it reads no table, and the plan
--    arithmetic it walks (clara._plan_due_nth) is IMMUTABLE too.
-- =====================================================================================
create or replace function clara._assert_accrual_period_amounts(
  p_accrual jsonb, p_frequency text, p_day_rule text, p_day_of_month integer,
  p_effective_from date, p_effective_to date)
returns void language plpgsql immutable security definer set search_path = clara, pg_temp as $fn$
declare
  v_rule text; v_n int; v_i int; v_el jsonb; v_due date; v_amt numeric;
  v_total numeric; v_sum numeric := 0; v_k int := 0;
  v_stated date[] := array[]::date[]; v_amounts numeric[] := array[]::numeric[];
  v_scheduled date[] := array[]::date[]; v_missing date[] := array[]::date[];
  v_base numeric; v_rem numeric; v_at_base int; v_at_odd int; v_odd_due date;
begin
  v_rule := p_accrual -> 'method' ->> 'rule';

  -- EVERY OTHER RULE FORBIDS THE KEY OUTRIGHT. A `stated_amount` accrual carrying per-period
  -- amounts would be two claims about what each period posts, and the one the ledger would
  -- honour is not the one the caller typed last.
  if v_rule is distinct from 'stated_period_amount' then
    if p_accrual ? 'period_amounts'
       and jsonb_typeof(p_accrual -> 'period_amounts') <> 'null' then
      raise exception 'per-period amounts belong to the stated_period_amount rule; this accrual states one amount for every period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amounts_unexpected',
            'field','accrual.period_amounts','rule', v_rule)::text;
    end if;
    return;
  end if;

  if jsonb_typeof(p_accrual -> 'period_amounts') <> 'array'
     or jsonb_array_length(p_accrual -> 'period_amounts') = 0 then
    raise exception 'an accrual whose amount is stated per period states one for each period'
      using errcode='CLR10',
        detail='{"reason":"accrual_period_amounts_absent","field":"accrual.period_amounts","constraint":"nonempty_array"}';
  end if;
  v_n := jsonb_array_length(p_accrual -> 'period_amounts');

  -- 1 · SHAPE, element by element, and no two elements naming one date.
  for v_i in 0 .. v_n - 1 loop
    v_el := p_accrual -> 'period_amounts' -> v_i;
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'each stated period amount is a JSON object of a due date and an amount'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amount_invalid',
            'field','accrual.period_amounts[' || v_i || ']','constraint','object')::text;
    end if;
    begin
      v_due := (v_el ->> 'due_date')::date;
    exception when others then
      v_due := null;
    end;
    if v_due is null then
      raise exception 'each stated period amount names the due date it is for, as YYYY-MM-DD'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amount_invalid',
            'field','accrual.period_amounts[' || v_i || '].due_date','constraint','iso_date')::text;
    end if;
    if jsonb_typeof(v_el -> 'amount_cents') <> 'number' then
      raise exception 'a stated period amount is an integer JSON number of minor units'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amount_invalid',
            'field','accrual.period_amounts[' || v_i || '].amount_cents',
            'constraint','integer_cents')::text;
    end if;
    v_amt := (v_el ->> 'amount_cents')::numeric;
    if v_amt <> trunc(v_amt) or v_amt <= 0 then
      raise exception 'a stated period amount is a positive integer number of minor units'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amount_invalid',
            'field','accrual.period_amounts[' || v_i || '].amount_cents',
            'constraint','positive_integer_cents')::text;
    end if;
    if v_due = any (v_stated) then
      raise exception 'two stated amounts name the same due date (%)', to_char(v_due,'YYYY-MM-DD')
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amount_duplicate',
            'field','accrual.period_amounts','due_date', to_char(v_due,'YYYY-MM-DD'))::text;
    end if;
    v_stated := v_stated || v_due;
    v_amounts := v_amounts || v_amt;
    v_sum := v_sum + v_amt;
  end loop;

  -- THE SCHEDULE'S OWN DATES, walked with the plan lane's own arithmetic rather than a second
  -- copy of it. The guard is 0193's (`clara._plan_due_events` uses the same 4096).
  loop
    v_due := clara._plan_due_nth(p_effective_from, p_frequency, p_day_rule, p_day_of_month, v_k);
    exit when v_due is null or v_due > p_effective_to or v_k > 4095;
    if v_due >= p_effective_from then v_scheduled := v_scheduled || v_due; end if;
    v_k := v_k + 1;
  end loop;

  -- 2 · SCHEDULED. A date the schedule never produces is money stated for a period that never
  --     comes due.
  for v_i in 1 .. array_length(v_stated, 1) loop
    if not (v_stated[v_i] = any (v_scheduled)) then
      raise exception '% is not a due date of this schedule inside its authority window',
        to_char(v_stated[v_i],'YYYY-MM-DD')
        using errcode='CLR10',
          detail=jsonb_build_object('reason','accrual_period_amount_not_scheduled',
            'field','accrual.period_amounts',
            'due_date', to_char(v_stated[v_i],'YYYY-MM-DD'))::text;
    end if;
  end loop;

  -- 3 · COMPLETE. Every period the schedule reaches is stated; the constant is never a fallback.
  if array_length(v_scheduled, 1) is not null then
    for v_i in 1 .. array_length(v_scheduled, 1) loop
      if not (v_scheduled[v_i] = any (v_stated)) then
        v_missing := v_missing || v_scheduled[v_i];
      end if;
    end loop;
  end if;
  if array_length(v_missing, 1) is not null then
    raise exception 'no amount is stated for % of this schedule''s periods; the first is %',
      array_length(v_missing, 1), to_char(v_missing[1],'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_period_amount_missing',
          'field','accrual.period_amounts',
          'due_date', to_char(v_missing[1],'YYYY-MM-DD'),
          'missing', (select jsonb_agg(to_char(d,'YYYY-MM-DD') order by d)
                        from unnest(v_missing) d))::text;
  end if;

  -- 4 · EXACT SUM. Under this rule `amount_cents` is the TOTAL for the window (the header's
  --     FOURTH MEASUREMENT says why), and a total that disagrees with its own parts is two
  --     claims about one accrual.
  v_total := (p_accrual ->> 'amount_cents')::numeric;
  if v_sum <> v_total then
    raise exception 'the stated period amounts come to % , not the accrual total of %',
      v_sum, v_total
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_period_amounts_unbalanced',
          'field','accrual.period_amounts','total_cents', v_total, 'stated_cents', v_sum,
          'difference_cents', v_sum - v_total)::text;
  end if;

  -- 5 · THE FINAL-PERIOD REMAINDER, and ONLY over the shape it governs: an equal split with one
  --     odd period. A genuinely uneven set never enters this arm.
  v_base := trunc(v_total / v_n);
  v_rem := v_total - v_base * v_n;
  if v_rem <> 0 then
    select count(*) filter (where x = v_base), count(*) filter (where x = v_base + v_rem)
      into v_at_base, v_at_odd
      from unnest(v_amounts) x;
    if v_at_base = v_n - 1 and v_at_odd = 1 then
      select v_stated[i] into v_odd_due
        from generate_subscripts(v_amounts, 1) i
       where v_amounts[i] = v_base + v_rem
       limit 1;
      if v_odd_due is distinct from (select max(d) from unnest(v_stated) d) then
        raise exception 'an even split leaves % cent(s) over; the remainder belongs to the final period (%), not to %',
          v_rem, to_char((select max(d) from unnest(v_stated) d),'YYYY-MM-DD'),
          to_char(v_odd_due,'YYYY-MM-DD')
          using errcode='CLR10',
            detail=jsonb_build_object('reason','accrual_period_remainder_misplaced',
              'field','accrual.period_amounts','remainder_cents', v_rem,
              'remainder_placement','final_period',
              'final_due_date', to_char((select max(d) from unnest(v_stated) d),'YYYY-MM-DD'),
              'stated_on', to_char(v_odd_due,'YYYY-MM-DD'))::text;
      end if;
    end if;
  end if;
end $fn$;
revoke all on function clara._assert_accrual_period_amounts(jsonb,text,text,integer,date,date) from public;

-- =====================================================================================
-- §E THE CANONICAL FORM SEES THEM (the header's FIFTH MEASUREMENT). Sorted by due date, so the
--    reservation hash is order-blind and two spellings of one decision are one decision.
-- =====================================================================================
create or replace function clara._accrual_canonical(p_accrual jsonb)
returns jsonb language sql immutable security definer set search_path = clara, pg_temp as $fn$
  select jsonb_build_object(
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
$fn$;
revoke all on function clara._accrual_canonical(jsonb) from public;

-- =====================================================================================
-- §F THE CONFIGURATION TAIL WRITES THE ROWS. clara._accrual_finish is recut to ask the wall
--    against the revision it just wrote, write one clara.accrual_period_amounts row per stated
--    period, and only THEN admit the first occurrence -- which is the order the resolver needs.
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
      expense_account_code, liability_account_code, amount_cents, currency, effective_from,
      effective_to, service_period_start, service_period_end, term_source,
      document_service_period_id, method, authority_kind, authority_ref, source_document_id,
      instruction, recorded_by)
    values (p_firm, p_client, v_plan, (p_plan ->> 'revision')::int, btrim(p_purpose),
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
      'method', p_accrual -> 'method', 'op_key', p_op_key,
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
end $function$
;

-- =====================================================================================
-- §G THE CORRECTION PATH CARRIES THEM FORWARD (#936's door, 0284). An amount change is a
--    correction, never an in-place edit: the successor accrual detail gets its OWN rows and the
--    superseded one keeps the amounts it actually ran under.
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
      expense_account_code, liability_account_code, amount_cents, currency, effective_from,
      effective_to, service_period_start, service_period_end, term_source,
      document_service_period_id, method, authority_kind, authority_ref, source_document_id,
      instruction, corrects_accrual_id, recorded_by)
    values (v_firm, v_old.client_id, v_old.plan_id, (v_revision ->> 'revision')::int, v_old.purpose,
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
end $function$
;

-- =====================================================================================
-- §H THE ADMISSION CORE ASKS THE ACCRUAL RESOLVER the way it already asks the amortisation one.
--    Recut from the INSTALLED body (never re-typed): three edits, all inside the #653 seam --
--    the reason and message of a missing line become variables, the accrual arm is added beside
--    the amortisation one, and the shared refusal block names whichever lane refused.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._plan_admit_occurrence(p_plan uuid, p_due date, p_leg text, p_model text, p_allow_reattempt boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  p record; r record; o record; v_existing boolean := false;
  v_basis jsonb; v_intent text; v_answer jsonb; v_occ uuid;
  v_client_status text; v_detail text; v_reason text;
  v_code text; v_message text; v_outcome jsonb;
  v_period date; v_primary_due date; v_ceiling date; v_attempt int := 1;
  v_old_work uuid; v_old_status text; v_reattempt boolean := false;
  v_primary_entry uuid; v_primary_state text;
  v_line jsonb; v_line_missing boolean := false;  -- #653
  -- #937 - THE NAME OF THE REFUSAL A MISSING LINE RECORDS. Two lanes now resolve a per-due-date
  -- line (amortisation, 0223; accrual, 0303) and a missing one is a DIFFERENT fact in each, so
  -- the reason and its sentence travel in variables instead of being literals inside the one
  -- shared refusal block below.
  v_line_reason text; v_line_message text; v_accrual_rule text;
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
  -- THE DUE GATE, on the house legal date (see clara._plan_admissible_event above). A plan due
  -- TOMORROW in Kuala Lumpur is not admitted today, whatever zone the session opened in.
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
  if p.kind = 'amortisation_schedule' then
    v_line := clara._plan_amortisation_period_line(p.id, p_due);
    v_line_missing := (v_line is null);
    v_line_reason := 'amortisation_period_line_missing';
    v_line_message := 'this amortisation schedule has no period line ending on this due date';
  elsif p.kind = 'reversing_journal' then
    -- #937 - THE SAME SEAM FOR AN ACCRUAL WHOSE AMOUNT A PERSON STATED PER PERIOD. The accrual
    -- detail is read the way the web layer's own `liveAccrualForPlan` reads it -- the HIGHEST
    -- revision on the plan, which is the live one (0284's correction lineage leaves both rows) --
    -- rather than `= r.revision`, because a lawful `clara.revise_accounting_plan` moves the plan
    -- to a revision the accrual detail does not name and the accrual is still the one running.
    -- A plain reversing journal nobody configured from an accrual answers NULL here and takes
    -- neither arm, so the constant basis keeps posting for it exactly as before.
    select (a.method ->> 'rule') into v_accrual_rule
      from clara.accrual_adjustments a
     where a.plan_id = p.id
     order by a.revision desc, a.created_at desc
     limit 1;
    -- THE REVERSAL LEG RESOLVES ITS OWN PRIMARY'S LINE, never its own date: a reversal exists to
    -- undo one period's accrual and must undo the amount that period actually posted. It is
    -- resolved only once a POSTED accrual stands behind it (`v_primary_entry`), so a reversal with
    -- nothing behind it falls through to the orphan wall below and is refused THERE, by its own
    -- honest name, instead of being told its period has no stated amount.
    if v_accrual_rule = 'stated_period_amount'
       and (p_leg = 'primary' or v_primary_entry is not null) then
      v_line := clara._plan_accrual_period_line(p.id,
                  case when p_leg = 'reversal' then v_primary_due else p_due end);
      v_line_missing := (v_line is null);
      v_line_reason := 'accrual_period_amount_missing';
      v_line_message := 'this accrual has no amount stated for this period';
    end if;
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
  -- corrected term does NOT re-derive an existing schedule (0223 SB's own comment says why),
  -- so this is the typed way a due date outside the derived allocation answers.
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
end $function$
;
revoke all on function clara._accrual_methods() from public;
revoke all on function clara._accrual_canonical(jsonb) from public;
revoke all on function clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text) from public;
revoke all on function clara._plan_admit_occurrence(uuid,date,text,text,boolean) from public;

reset role;

-- =====================================================================================
-- §I THE TAIL. What this file claims, asserted against the catalog it just wrote.
-- =====================================================================================
do $t937_tail$
declare
  v_n int; v_sha text; v_i int; v_src text; v_expr text; v_ok boolean; r text;
  v_rules text[];
  v_methods_sha constant text := 'f3fdd04bac3bf925fe39dc5a552bfa97269136859ec83ee147d2e8d08ff0aef1';
  v_canonical_sha constant text := 'f7b2af98a7dcf0e3bb64434a12a6feb89431a551f37481bf9d888079a9c43a1b';
  v_finish_sha constant text := 'bbeb43099d0cee972a62b7a81c9eebe13620b94120c45ed05dc2c5e57287624b';
  v_correct_sha constant text := '9975f948944d2351c49eaa1c178f0dd9dc5572d446a7f9338ef9d5ede0b0fd79';
  v_admit_sha constant text := '6980feab1f7d7851ab07c76f7af6d0114423bd016f39d30d4c5a324d1a05337b';
  v_pins text[][] := array[
    ['clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)',
     'cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e'],
    ['clara._plan_amortisation_period_line(uuid,date)',
     '88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c'],
    ['clara._accrual_journal_basis(jsonb,text,date)',
     'd1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403'],
    ['clara._assert_accrual_particulars(jsonb)',
     '71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b'],
    ['clara._assert_accrual_term_window(jsonb,date,date)',
     'e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09'],
    ['clara._assert_accrual_world(uuid,uuid,jsonb)',
     '32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750'],
    ['clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)',
     '31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5'],
    ['clara._plan_due_nth(date,text,text,int,int)',
     'f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e'],
    ['clara._plan_primary_for_reversal(date,text,text,int,date)',
     'd0b2bb5b777d282b9811db452b4cef26e885d7bf916b592d7356f36be308a328'],
    ['clara._plan_primary_entry(uuid,date)',
     'e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46'],
    ['clara._plan_window_ceiling(date,boolean)',
     'dd7f4ceaf3cf2568d3a9d379e10d0b61af02d4b835da521ea4ff07e14165cf8c'],
    ['clara._plan_occurrence_period_key(date,date,text,text,int,date,text)',
     '6d9f60d345da4df4f4e237746b5e875d746a785892af24f4a316d0f8bbeac63f'],
    ['clara._plan_admissible_event(uuid)',
     '3b569e338f1c1ff563c61a2185db7198c565c804bf66c92fa941c06a4470f4b3'],
    ['clara._plan_run_model()',
     'c0bdc01a3f61a9ac384de879f124336d28c961468800eecb2dcdd696306913c3'],
    ['clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
     '011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114'],
    ['clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
     '8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886'],
    ['clara._human_ctx(integer)',
     'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'],
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara._finish_op(uuid,text,text,jsonb)',
     'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'],
    ['clara._hash(jsonb)',
     '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'],
    ['clara.role_rank(text)',
     '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'],
    ['clara._tf_accrual_adjustment_append_only()',
     'e2d6fb3e2df66848053b6f5f442726e8984e1abd400c2fd23bd4a7cb90b1db4c'],
    ['clara._tf_accrual_adjustment_term_congruent()',
     '1e0483a6e9c19604305194b09b64a14c0bcfb6a1ca6133bcd3907efa7ea4411b']
  ];
begin
  -- 1 · THE RELATION.
  if to_regclass('clara.accrual_period_amounts') is null then
    raise exception '#937 tail: clara.accrual_period_amounts is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.accrual_period_amounts'::regclass
                    and conname = 'uq_accrual_period_amounts_detail_due' and contype = 'u') then
    raise exception '#937 tail: the (accrual_id, due_date) key is absent -- one stated amount per period has nothing enforcing it at the storage layer'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_class where oid = 'clara.accrual_period_amounts'::regclass
                  and relrowsecurity and relforcerowsecurity) then
    raise exception '#937 tail: row level security is not FORCED on clara.accrual_period_amounts'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.accrual_period_amounts'::regclass and not tgisinternal;
  if v_n <> 1 then
    raise exception '#937 tail: expected exactly 1 trigger on clara.accrual_period_amounts, found %', v_n
      using errcode='CLR10';
  end if;
  -- NO APPLICATION ROLE HOLDS ANY GRANT (0185 §A, the estate's standing posture): `relacl` stays
  -- NULL exactly as it does on clara.accrual_adjustments and clara.prepayment_schedules.
  if (select relacl from pg_class where oid = 'clara.accrual_period_amounts'::regclass) is not null then
    raise exception '#937 tail: clara.accrual_period_amounts has a materialised ACL -- every reach is a definer door'
      using errcode='CLR10';
  end if;

  -- 2 · THE RESOLVER: STABLE, SECURITY DEFINER, pinned search_path, owned by clara_fn_owner, and
  --     reachable by NO application role (AC1's "ungranted").
  if to_regprocedure('clara._plan_accrual_period_line(uuid,date)') is null then
    raise exception '#937 tail: clara._plan_accrual_period_line is absent' using errcode='CLR10';
  end if;
  select p.provolatile::text || case when p.prosecdef then 'D' else 'i' end
    into v_src from pg_proc p where p.oid = 'clara._plan_accrual_period_line(uuid,date)'::regprocedure;
  if v_src <> 'sD' then
    raise exception '#937 tail: the resolver must be STABLE and SECURITY DEFINER (got %)', v_src
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'clara._plan_accrual_period_line(uuid,date)'::regprocedure
                    and p.proconfig @> array['search_path=clara, pg_temp']) then
    raise exception '#937 tail: the resolver has no pinned search_path' using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara._plan_accrual_period_line(uuid,date)'::regprocedure, 'execute') then
    raise exception '#937 tail: PUBLIC can execute the resolver' using errcode='CLR10';
  end if;
  for r in select rolname from pg_roles
            where rolname like 'clara\_%' and rolname <> 'clara_fn_owner' loop
    if has_function_privilege(r, 'clara._plan_accrual_period_line(uuid,date)'::regprocedure, 'execute') then
      raise exception '#937 tail: % can execute the resolver -- it is an ungranted internal', r
        using errcode='CLR10';
    end if;
    if has_function_privilege(r, 'clara._assert_accrual_period_amounts(jsonb,text,text,integer,date,date)'::regprocedure, 'execute') then
      raise exception '#937 tail: % can execute the period-amount wall -- it is an ungranted internal', r
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE CENSUS (AC2): clara._accrual_methods() and the table CHECK admit exactly the same
  --     rules. Not a text comparison -- the constraint's OWN expression is evaluated, once per
  --     member of the function's own answer, and once per withdrawn rule.
  v_rules := clara._accrual_methods();
  if array_length(v_rules, 1) <> 2
     or not ('stated_amount' = any (v_rules)) or not ('stated_period_amount' = any (v_rules)) then
    raise exception '#937 tail: clara._accrual_methods() is %, expected exactly the two performed rules',
      v_rules using errcode='CLR10';
  end if;
  select pg_get_expr(conbin, conrelid) into v_expr from pg_constraint
   where conrelid = 'clara.accrual_adjustments'::regclass
     and conname = 'accrual_adjustments_method_check';
  if v_expr is null then
    raise exception '#937 tail: accrual_adjustments_method_check is absent' using errcode='CLR10';
  end if;
  foreach r in array v_rules loop
    execute format('select (%s) from (values (%L::jsonb)) as t(method)', v_expr,
              jsonb_build_object('rule', r)::text) into v_ok;
    if v_ok is distinct from true then
      raise exception '#937 tail: clara._accrual_methods() offers %, which the table CHECK refuses -- the two must agree', r
        using errcode='CLR10';
    end if;
  end loop;
  foreach r in array array['source_document_amount','prior_period_amount','','anything'] loop
    execute format('select (%s) from (values (%L::jsonb)) as t(method)', v_expr,
              jsonb_build_object('rule', r)::text) into v_ok;
    if v_ok is not distinct from true then
      raise exception '#937 tail: the table CHECK admits %, which clara._accrual_methods() does not offer', r
        using errcode='CLR10';
    end if;
  end loop;
  -- …and the method object still carries its rule and NOTHING else.
  execute format('select (%s) from (values (%L::jsonb)) as t(method)', v_expr,
            '{"rule":"stated_period_amount","cents":1}') into v_ok;
  if v_ok is not distinct from true then
    raise exception '#937 tail: the table CHECK admits a method object carrying a second key'
      using errcode='CLR10';
  end if;

  -- 4 · THE FIVE RECUT BODIES are at THIS file's own output, and each carries the marker that
  --     makes its change legible.
  for v_i in 1 .. 5 loop
    select case v_i when 1 then 'clara._accrual_methods()'
                    when 2 then 'clara._accrual_canonical(jsonb)'
                    when 3 then 'clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)'
                    when 4 then 'clara.correct_accrual_adjustment(uuid,jsonb,text)'
                    else 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)' end into v_src;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_src::regprocedure;
    if v_sha is distinct from (case v_i when 1 then v_methods_sha when 2 then v_canonical_sha
                                        when 3 then v_finish_sha when 4 then v_correct_sha
                                        else v_admit_sha end) then
      raise exception '#937 tail: % is not at this file''s own output (got %)', v_src, v_sha
        using errcode='CLR10';
    end if;
  end loop;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)'::regprocedure;
  foreach r in array array['clara._plan_accrual_period_line(', 'accrual_period_amount_missing',
      'v_line_reason', 'v_line_message', 'stated_period_amount',
      'clara._plan_amortisation_period_line(', 'amortisation_period_line_missing',
      'clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry, v_line)'] loop
    if position(r in v_src) = 0 then
      raise exception '#937 tail: the admission core is missing "%"', r using errcode='CLR10';
    end if;
  end loop;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text)'::regprocedure;
  foreach r in array array['clara._assert_accrual_period_amounts(',
      'insert into clara.accrual_period_amounts(', 'clara._plan_admit_occurrence('] loop
    if position(r in v_src) = 0 then
      raise exception '#937 tail: the configuration tail is missing "%"', r using errcode='CLR10';
    end if;
  end loop;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure;
  foreach r in array array['clara._assert_accrual_period_amounts(p_accrual, v_cur.frequency',
      'insert into clara.accrual_period_amounts(', 'clara.revise_accounting_plan('] loop
    if position(r in v_src) = 0 then
      raise exception '#937 tail: the correction door is missing "%"', r using errcode='CLR10';
    end if;
  end loop;
  -- …and the correction door's OWN grant did not move: `create or replace` preserves an ACL, and
  -- this file states that it relies on exactly that.
  if not has_function_privilege('clara_authenticated',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#937 tail: clara_authenticated lost EXECUTE on the correction door'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('public',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#937 tail: the correction door gained a grant it never had' using errcode='CLR10';
  end if;

  -- 5 · THIS FILE RECUT NOTHING ELSE -- and clara._plan_occurrence_basis in particular is still
  --     IMMUTABLE and byte-identical, which is AC1's own words.
  for v_i in 1 .. array_length(v_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#937 tail: % MOVED while this file applied -- it must not have (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_proc
                  where oid = 'clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)'::regprocedure
                    and provolatile = 'i') then
    raise exception '#937 tail: clara._plan_occurrence_basis is no longer IMMUTABLE' using errcode='CLR10';
  end if;

  -- 6 · clara.accrual_adjustments keeps its three triggers; this file altered only its CHECK.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.accrual_adjustments'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception '#937 tail: expected 3 triggers on clara.accrual_adjustments, found %', v_n
      using errcode='CLR10';
  end if;

  raise notice '#937 tail: OK -- clara.accrual_period_amounts is append-only, RLS-forced, ACL-less and keyed on (accrual_id, due_date); clara._plan_accrual_period_line is STABLE, SECURITY DEFINER, pinned and reachable by no application role; clara._accrual_methods() and accrual_adjustments_method_check admit exactly stated_amount and stated_period_amount, proven by evaluating the constraint''s OWN expression once per rule and refusing the two withdrawn ones; the five recut bodies are at this file''s own output and carry their markers; the correction door''s grant is unmoved; and the twenty-four bodies this file depends on -- clara._plan_occurrence_basis among them, still IMMUTABLE -- hash byte-identically to their measured pre-images.';
end
$t937_tail$;
