-- 0284_accrual_correction — #936 (riders wave 3, lane 06): A DEDICATED ACCRUAL-CORRECTION DOOR.
-- =====================================================================================
-- Spec of record: issue #936's Agent Brief. Parent: #907 (owner ruling 2026-09-18; this bug was
-- measured during its review).
--
-- THE BUG THIS CLOSES. Today the only way to change an accrual's amount is the generic plan
-- revision door (`clara.revise_accounting_plan`, 0193): it records a new plan revision with the
-- new basis while the accrual's own detail row (service period, method, source document,
-- correction pointers) stays at the FIRST revision, because `clara.accrual_adjustments` is keyed
-- on (plan_id, revision) (0222) and the accrual configuration door only ever writes the first one.
-- A reader who joins plan → revision → accrual after such a "revision" sees the OLD amount beside
-- the NEW one the ledger will post from the next due date on — the books contradicting themselves.
--
-- THE CHOICE, AND WHY IT IS THE ONLY ONE OF THE TWO THE TICKET OFFERS. The Agent Brief names two
-- shapes: "either the plan revision door writes the accrual detail for the new revision, or a
-- dedicated accrual correction door writes the successor row with `corrects_accrual_id` set". This
-- file is the SECOND shape, and lane 05 (#908) is why: that lane's own migration pins
-- `clara.revise_accounting_plan`'s body as UNCHANGED (its own prestate re-hashes it, unconditionally
-- of what it touches), so a migration in THIS lane that recut the plan-revision door's body would
-- collide with lane 05's own pin at integration -- two migrations asserting incompatible things
-- about the SAME function's source text. `clara.correct_accrual_adjustment` NESTS
-- `clara.revise_accounting_plan` exactly as `clara.create_accrual_adjustment` nests
-- `clara.create_accounting_plan` (0222 §D) -- calling it, never recutting it.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. `clara.correct_accrual_adjustment` -- one door,
-- bookkeeper+ human-only, `clara_authenticated` alone -- which takes the accrual being corrected
-- and the corrected particulars, nests `clara.revise_accounting_plan` UNCHANGED to advance the
-- plan to a new live revision carrying the corrected basis, writes the SUCCESSOR accrual-detail row
-- for that new revision with `corrects_accrual_id` naming the row it supersedes, and stamps the
-- superseded row's `corrected_by_accrual_id` -- the ONE update 0222's append-only trigger has ever
-- admitted, ridden here for the first time.
--
-- WHY THE SCHEDULE AND THE AUTHORITY WINDOW DO NOT MOVE. The ticket's own acceptance line is that
-- "already-posted occurrences (and their reversals) are unchanged (the change applies from the
-- next due date)" -- exactly the property `clara.revise_accounting_plan` already has structurally
-- (0193: a revision supersedes the LIVE row and keeps the predecessor; a past occurrence keeps
-- naming the revision it ran under, 0193:1626-1627's own header). This door carries the SAME
-- frequency, day_rule, day_of_month, timezone, reversal_day_rule and (effective_from, effective_to)
-- the LIVE revision already has -- read under RUNG 1, the same accounting_plans row lock the plan
-- lane's own writers take -- and passes them straight through unchanged. It corrects the AMOUNT
-- (and, structurally, any other stated particular: expense/liability leg, service period, method,
-- instruction, memo, source document) -- never the schedule, never the authority window. A ticket
-- that wants to correct THOSE stays on `clara.revise_accounting_plan` itself.
--
-- AND "THE LIVE REVISION" MEANS THE LIVE REVISION, NOT THE ACCRUAL ROW'S MEMORY OF IT (ADV-01,
-- riders wave 3 review round 1, driven on clara_l06 inside rolled-back transactions). An accrual's
-- plan is reachable by the GENERIC plan-revision door a bookkeeper uses today, and a firm may
-- lawfully move that window afterwards -- withdrawing future authority it no longer grants, or
-- extending it. `clara.accrual_adjustments.effective_from/effective_to` is a fact DERIVED at the
-- moment its own row was written; after such a revision it is STALE. An earlier cut of this file
-- read the window from `v_old` (the superseded accrual row) while reading every other schedule
-- argument from `v_cur` (the live revision), so a correction silently reverted a lawful plan
-- revision: it restored an authority the firm had withdrawn -- the money-posting direction, since
-- the plan then accrues months nobody authorised -- or dropped one it had extended, with no
-- refusal and no overlap warning. Every place the window is used now reads `v_cur`, which also
-- means the SHARED 0222 predicate `clara._assert_accrual_term_window` is evaluated against the
-- authority that is actually live: a corrected term that no longer brackets it is refused by name
-- (`accrual_term_window_mismatch`) instead of quietly shrinking the window to fit.
--
-- WHICH IS WHY THE TERM-WINDOW WALL SITS AFTER RUNG 1 AND NOT WITH THE PAYLOAD HALF. It is not a
-- payload check at all: one of its two operands is MUTABLE WORLD STATE (the live revision's
-- window), exactly like the accounts and the filing `clara._assert_accrual_world` proves. It
-- belongs where the rest of the world half is -- after the reservation branch, under the plan row
-- lock that stops the window moving between the read and the nested revision. What stays above the
-- reservation is `clara._assert_accrual_particulars`, which reads nothing but the payload.
--
-- WHY THE COLUMNS AND THE UNIQUE INDEX NEEDED NO MIGRATION OF THEIR OWN. 0222 already declared
-- `corrects_accrual_id`, `corrected_by_accrual_id`, the append-only trigger's one-admitted-update
-- arm (`old.corrected_by_accrual_id is not null or new.corrected_by_accrual_id is null` -> refuse)
-- and `uq_accrual_adjustments_corrects` (one correction per target, structurally) -- the ticket's
-- own acceptance line says so ("the columns and the unique index exist; no writer does today").
-- This file therefore adds NO table, NO column, NO trigger and NO index: exactly one new function,
-- its grant, and nothing else.
--
-- THE RACE THIS DOOR CLOSES ITSELF: TWO CONCURRENT CORRECTIONS OF ONE ACCRUAL. Reading
-- `corrected_by_accrual_id` unlocked and racing the INSERT would let both callers pass the check
-- and then collide on `uq_accrual_adjustments_corrects` as a bare 23505 neither could classify.
-- This door instead takes RUNG 1 -- `accounting_plans` FOR UPDATE, the SAME row (and the SAME lock)
-- `clara.revise_accounting_plan` itself takes -- BEFORE re-reading `corrected_by_accrual_id`, so a
-- second caller targeting the SAME accrual (which is always the SAME plan) blocks on that lock and,
-- once it proceeds, sees the FIRST caller's stamp and is refused by name
-- (`accrual_already_corrected`) rather than by an unclassifiable unique-constraint error.
--
-- WHAT THIS FILE DOES NOT DO. It does not touch `clara.revise_accounting_plan`,
-- `clara._plan_door_ctx`, `clara._assert_plan_schedule` or any other 0193 body -- lane 05's own
-- pin. It does not touch `clara.create_accrual_adjustment`, `clara.create_accrual_adjustment_for`,
-- `clara._accrual_plan_core`, `clara._accrual_finish` or any 0222 body it calls: every one it
-- depends on is pinned below and re-hashed in the tail. It mints no new CLR reason outside its own
-- one addition (`accrual_already_corrected`) and inherits every other refusal token from the doors
-- and predicates it nests.
--
-- REDO-SAFE (#957). The one statement that changes the catalog is `create or replace function`;
-- the grant/revoke pair is idempotent. The prestate asserts nothing about this file's OWN function
-- being absent, so a `CLARA_MIGRATION_REDO` re-run of this file is safe.
-- =====================================================================================

do $t936_pre$
declare
  v_sha text;
  v_pins text[][] := array[
    ['clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
     '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f'],
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
    ['clara._assert_accrual_particulars(jsonb)',
     '71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b'],
    ['clara._assert_accrual_term_window(jsonb,date,date)',
     'e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09'],
    ['clara._assert_accrual_world(uuid,uuid,jsonb)',
     '32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750'],
    ['clara._accrual_journal_basis(jsonb,text,date)',
     'd1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403'],
    ['clara._accrual_canonical(jsonb)',
     '8c9dc78817e6730b6283727f0271c229a5794643c2f90038622504621c2a237e']
  ];
  v_i int;
begin
  if to_regclass('clara.accrual_adjustments') is null then
    raise exception '#936 prestate: clara.accrual_adjustments is absent -- 0222 must apply first'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.accrual_adjustments'::regclass
                    and attname in ('corrects_accrual_id','corrected_by_accrual_id')
                    and not attisdropped
                  having count(*) = 2) then
    raise exception '#936 prestate: clara.accrual_adjustments is missing corrects_accrual_id or corrected_by_accrual_id -- 0222 must have both'
      using errcode='CLR10';
  end if;
  -- A PARTIAL UNIQUE INDEX (0222's `create unique index ... where (corrects_accrual_id is not
  -- null)`), not an `alter table ... add constraint` -- Postgres records the first kind in
  -- pg_index/pg_class alone, never in pg_constraint, so the check reads the index catalog.
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'clara.accrual_adjustments'::regclass
                    and c.relname = 'uq_accrual_adjustments_corrects' and i.indisunique) then
    raise exception '#936 prestate: uq_accrual_adjustments_corrects (0222) is absent -- one correction per target has nothing enforcing it at the storage layer'
      using errcode='CLR10';
  end if;

  -- THE PINS, MEASURED ON THIS LANE DATABASE NOW (rule: pin what is LIVE, never a copied literal).
  -- This is the FIRST ticket of lane 06, so nothing here has been recut by an earlier ticket of
  -- this lane; every value above was measured on this rig moments before this file was written.
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#936 prestate: % is absent', v_pins[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#936 prestate: % has DRIFTED from its measured pre-image -- this file must not touch it, so re-measure before applying (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  raise notice '#936 prestate: clean -- clara.accrual_adjustments carries corrects_accrual_id, corrected_by_accrual_id and uq_accrual_adjustments_corrects (0222); the twelve bodies this door nests or calls are byte-identical to their measured pre-images.';
end
$t936_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- clara.correct_accrual_adjustment — bookkeeper+, clara_authenticated ONLY. See the header for
-- the full shape; in short: identity check (payload-independent) -> the payload half
-- (particulars + term-window walls, before any reservation) -> the reservation -> the world half
-- (accounts/filing, THEN the already-corrected recheck under RUNG 1) -> the nested plan revision
-- -> the successor row -> the one-way correction stamp -> audit -> receipt.
-- =====================================================================================
create or replace function clara.correct_accrual_adjustment(
    p_accrual_id uuid, p_accrual jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
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
end $$;
revoke all on function clara.correct_accrual_adjustment(uuid,jsonb,text) from public;
grant execute on function clara.correct_accrual_adjustment(uuid,jsonb,text) to clara_authenticated;

comment on function clara.correct_accrual_adjustment(uuid,jsonb,text) is
  '#936: correct an accrual''s particulars (amount, either leg, term, method, instruction). Nests '
  'clara.revise_accounting_plan UNCHANGED to advance the plan to a new live revision carrying the '
  'corrected basis, writes the SUCCESSOR accrual-detail row for that revision with '
  'corrects_accrual_id naming the row it supersedes, and stamps the superseded row''s '
  'corrected_by_accrual_id -- the one update 0222''s append-only trigger admits. The schedule and '
  'the authority window are the live revision''s own -- read under the plan row lock, never the '
  'superseded accrual row''s stale copy -- and carried through unchanged: this door corrects '
  'what was STATED, never when or how often the plan runs, and a corrected term that no longer '
  'brackets the LIVE authority is refused accrual_term_window_mismatch. bookkeeper+; idempotent on '
  '(firm, correct_accrual_adjustment, op_key); the plan verb it nests holds the derived key '
  'op_key||'':plan''; already-posted occurrences and their reversals are untouched -- the correction '
  'applies from the next due date, exactly as clara.revise_accounting_plan''s own supersede-and-keep '
  'shape already guarantees.';

reset role;

-- =====================================================================================
-- TAIL CENSUS. Re-reads the live catalog rather than trusting the block above ran as written.
-- =====================================================================================
do $t936_tail$
declare
  v_sha text; v_src text; v_posture text; v_n int; r text; v_i int;
  v_pins text[][] := array[
    ['clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
     '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f'],
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
    ['clara._assert_accrual_particulars(jsonb)',
     '71e7f7f078b840c217b7582b1b78728f8f79b5601d5d8f4f821feca9b15e624b'],
    ['clara._assert_accrual_term_window(jsonb,date,date)',
     'e13e895f126e7cf34bea5bab2dbcb74733384ef0a427f58b84d6b5b07b771a09'],
    ['clara._assert_accrual_world(uuid,uuid,jsonb)',
     '32b3da54707f011987c8206106342317766021387d03df15d58ebf14c1d35750'],
    ['clara._accrual_journal_basis(jsonb,text,date)',
     'd1da9cc4fd61d376ce140441a8849d501aafee77a1c81587116901d5fe3c6403'],
    ['clara._accrual_canonical(jsonb)',
     '8c9dc78817e6730b6283727f0271c229a5794643c2f90038622504621c2a237e']
  ];
begin
  -- 1 · the door resolves at exactly the signature the grant and every caller name.
  if to_regprocedure('clara.correct_accrual_adjustment(uuid,jsonb,text)') is null then
    raise exception '#936 tail: clara.correct_accrual_adjustment(uuid,jsonb,text) does not resolve'
      using errcode='CLR10';
  end if;

  -- 2 · its posture and ACL: SECURITY DEFINER, clara_fn_owner, pinned search_path,
  --     clara_authenticated alone -- no PUBLIC, no clara_runtime, no agent, no wake role.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p
   where p.oid = 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | search_path=clara, pg_temp' then
    raise exception '#936 tail: the door''s posture is not the expected SECURITY DEFINER shape -- got {%}', v_posture
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#936 tail: clara_authenticated cannot execute the correction door' using errcode='CLR10';
  end if;
  if has_function_privilege('public',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#936 tail: PUBLIC can execute the correction door' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#936 tail: clara_runtime can execute the correction door -- this is a human-only lane, no OBO twin'
      using errcode='CLR10';
  end if;
  if to_regrole('clara_agent_ro') is not null and has_function_privilege('clara_agent_ro',
        'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#936 tail: the agent read lane can execute the correction door' using errcode='CLR10';
  end if;

  -- 3 · the house shape, as independent tokens in the body: the floor, the reservation, the
  --     receipt, the audit row, the nested plan verb, the accrual-lane predicates it shares with
  --     0222's own doors, and NO recut of the nested door (a `create or replace` of it inside this
  --     file's own source would be the collision the header names).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure;
  foreach r in array array['clara._human_ctx(clara.role_rank(''bookkeeper''))', 'clara._reserve_op(',
      'clara._finish_op(', 'clara._audit(', 'clara.revise_accounting_plan(',
      'clara._assert_accrual_particulars(', 'clara._assert_accrual_term_window(',
      'clara._assert_accrual_world(', 'for update', 'corrected_by_accrual_id = v_new_id',
      'accrual_already_corrected',
      -- ADV-01: the authority window comes from the LIVE revision, at BOTH places it is used
      -- (the shared term-window predicate and the nested plan verb).
      'clara._assert_accrual_term_window(p_accrual, v_cur.effective_from, v_cur.effective_to)',
      'v_cur.effective_from, v_cur.effective_to, v_basis',
      -- ADV-06: the derived nested key's collision is classified rather than bare.
      'plan_op_key_conflict'] loop
    if position(r in v_src) = 0 then
      raise exception '#936 tail: the door is missing "%"', r using errcode='CLR10';
    end if;
  end loop;
  -- …AND THE STALE PAIR IS NOWHERE IN THE BODY. An assertion about what IS present cannot catch a
  -- second, forgotten use of the superseded accrual row's remembered window, which is exactly the
  -- shape ADV-01 found: five schedule arguments read from the live revision and the sixth from
  -- `v_old`. `v_old` is still read for identity, purpose, authority and the plan id; its window is
  -- what must never be read again.
  foreach r in array array['v_old.effective_from', 'v_old.effective_to'] loop
    if position(r in v_src) > 0 then
      raise exception '#936 tail: the door still reads "%" -- the authority window is the LIVE revision''s, never the superseded accrual row''s', r
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THIS FILE RECUT NOTHING -- the twelve bodies it nests or calls, re-hashed against the
  --     SAME pins the prestate measured.
  for v_i in 1 .. array_length(v_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#936 tail: % MOVED while this file applied -- it must not have (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 5 · the relation this door writes carries the same three triggers, the same tenant-carrying
  --     FK and the same one-correction-per-target unique it did before this file ran -- this file
  --     alters no table.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.accrual_adjustments'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception '#936 tail: expected 3 triggers on clara.accrual_adjustments, found %', v_n
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'clara.accrual_adjustments'::regclass
                    and c.relname = 'uq_accrual_adjustments_corrects' and i.indisunique) then
    raise exception '#936 tail: uq_accrual_adjustments_corrects moved -- this file must not touch it'
      using errcode='CLR10';
  end if;

  raise notice '#936 tail: OK -- clara.correct_accrual_adjustment resolves, is SECURITY DEFINER owned by clara_fn_owner with a pinned search_path, granted to clara_authenticated alone (no PUBLIC, no clara_runtime, no agent read lane); its body carries the bookkeeper floor, the reservation/receipt pair, the audit call, the nested (never recut) clara.revise_accounting_plan, the shared 0222 particulars/term-window/world predicates, the RUNG-1 lock, the one-way correction stamp, the accrual_already_corrected and plan_op_key_conflict tokens, and the authority window read from the LIVE revision at both of its uses with the superseded row''s stale pair absent from the body entirely; the twelve bodies it depends on hash byte-identically to their measured pre-images, so nothing was recut; and clara.accrual_adjustments keeps its three triggers and uq_accrual_adjustments_corrects unmoved.';
end
$t936_tail$;
