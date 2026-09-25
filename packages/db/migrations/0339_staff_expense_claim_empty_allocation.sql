-- 0339_staff_expense_claim_empty_allocation — #1067 (riders sweep wave, lane 03): AN
-- `advance_allocations` ARRAY THAT IS PRESENT CARRIES AT LEAST ONE ALLOCATION, BY NAME.
-- =====================================================================================
-- Spec of record: issue #1067's Agent Brief (no later comment; verified live on this branch).
-- Builds on 0221 (the claim, its door and its validator) and 0301 (#931's confirmed allocation
-- list). It recuts EXACTLY ONE body, `clara._assert_claim_basis(uuid,jsonb,boolean)`, at 0301's
-- post-image byte for byte plus ONE new rule, and it touches no relation, no grant and no other
-- function.
--
-- =====================================================================================
-- WHAT WAS LIVE, MEASURED ON THE LANE DATABASE RATHER THAN READ OFF THE TICKET.
--
-- 0301's payload half opens the allocation block with
--   `v_listed := jsonb_typeof(p_claim -> 'advance_allocations') = 'array'
--                and jsonb_array_length(p_claim -> 'advance_allocations') > 0;`
-- and then asks EVERY list rule under `if v_listed`. A present-but-EMPTY array therefore is not a
-- list at all to this validator, and all four of its rules — the settlement rule ("only an advance
-- application carries an allocation list"), the distinctness rule, the exact sum and the head rule
-- — are skipped. Three shapes follow, and all three were driven on the lane database (clara_l06,
-- chain 0001..0318) before this file was written:
--
--   (a) `settlement = 'advance_application'` WITH `advance_id`: **ADMITTED**. The claim states a
--       list, the list allocates nothing, and `clara._claim_allocations` falls through to its
--       single-advance branch — so the door admits the claim and posts it against an advance the
--       stated list does not name. The submission and the record disagree, silently.
--   (b) `settlement = 'advance_application'` WITHOUT `advance_id`: refused, but at the WRONG
--       field with the WRONG word — the world half's `advance_allocation_mismatch` /
--       `claim.advance_id` / `present`, which is the refusal a claim that named NO advance at all
--       receives. "I sent you an empty list" and "I told you nothing" are one refusal.
--   (c) any other settlement: **IGNORED**. The key travels, means nothing, and the settlement rule
--       that exists to refuse it never fires because the array is empty.
--
-- The ticket calls this an inconsistency between two layers, and it is: the runtime's own wire
-- schema already refuses an empty list (`packages/runtime/src/workRoutes.ts`,
-- `advance_allocations` / `at_least_one`). But the database door is the boundary ANY caller can
-- reach, and (a) shows that the incidental arithmetic the ticket expected to catch an empty list
-- — the exact-sum check — never runs against one.
--
-- =====================================================================================
-- THE MEASUREMENT: THE RULE IS THE KEY'S OWN SHAPE, SO IT IS ASKED WHERE SHAPE IS ASKED.
--
-- The new check sits immediately after "is `advance_allocations` an array?" and immediately
-- before anything that reads what the array SAYS — the same two-step `claim.items` is already
-- judged in (`array`, then `at_least_one`). Three consequences, all deliberate:
--
--   * it holds REGARDLESS of the claim's total (#1067 AC1's own words) and regardless of the
--     settlement, because it is a property of the submission and of nothing else;
--   * it makes `v_listed` HONEST. After this file `v_listed` is false only when the key is absent
--     or JSON `null`; every other present shape is refused by name before it is read, so the
--     settlement, distinctness, exact-sum and head rules can no longer be skipped by an empty
--     array;
--   * a claim carrying NO `advance_allocations` key is untouched (#1067 AC3), and so is a claim
--     carrying JSON `null` under it, which 0221's type rule admits as "absent" and this file does
--     not move.
--
-- THE WORD. `reason` stays the list's own `advance_allocation_mismatch` and the new `constraint`
-- is `at_least_one` — the word the runtime already refuses an empty list under, so the two layers
-- now say the same thing. #1067 AC2 asks that a reader can tell "empty list" from "does not add
-- up": both are `advance_allocation_mismatch` at `claim.advance_allocations`, and the constraint
-- alone separates `at_least_one` from `exact_sum`, which is this validator's own idiom for a named
-- specialisation. The web surface needs no change: `fieldForClaimPath`
-- (`apps/web/lib/work/staff-expense-claim.ts`) already maps `claim.advance_allocations` onto the
-- `advanceAllocations` control.
--
-- WHAT THIS FILE DOES NOT TOUCH, AND PINS: the normaliser `clara._claim_allocations`, the
-- settlement-account derivation, the canonical form (so every stored claim still replays byte for
-- byte), the journal basis, the door itself, the claimant resolver, the birth trigger, the shared
-- temporal cap and the enrolment reader. §0 pins them before and the tail re-measures them after.
--
-- REDO SAFETY (#957). The only statement is a `create or replace function`, and the prestate takes
-- a REDO branch on the marker only this file writes into that body. A redo over this file's own
-- effects is a no-op plus a re-proof. The FIRST-APPLY branch was additionally proved by hand
-- inside a rolled-back transaction (see the ticket report).
-- =====================================================================================

do $p1067_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false;
  -- THE LIVE PRE-IMAGE of the ONE body this file recuts, measured off pg_proc.prosrc on the
  -- lane-03 sweep rig (clara_l06, PG 17, chain 0001..0318) moments before this file was written,
  -- never transcribed from an older header. It is 0301's post-image: no migration between 0301
  -- and 0318 recuts this validator.
  c_assert_pre constant text :=
    'e439346cbf68a267b143aa2fe03c5285acd7eed3f769b0c0c6a0c31c38aae04a';
begin
  if to_regprocedure('clara._claim_allocations(jsonb)') is null then
    raise exception '#1067 prestate: 0301 (the confirmed allocation list) is absent -- it must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957.) The signal is the marker only this file writes into
  -- the recut validator.
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
  if position('#1067 (0339' in coalesce(v_sha, '')) > 0 then
    v_redo := true;
    raise notice '#1067 prestate: the validator already carries this file''s marker -- treating this as a #957 REDO of 0339 itself. The single statement below is a create-or-replace and is redo-safe by construction; the tail re-proves the whole post-state.';
  end if;

  -- THE ONE BODY THIS FILE RECUTS, at its measured 0301 post-image.
  if not v_redo then
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
    if v_sha is null then
      raise exception '#1067 prestate: clara._assert_claim_basis(uuid,jsonb,boolean) is absent'
        using errcode = 'CLR10';
    end if;
    if v_sha <> c_assert_pre then
      raise exception '#1067 prestate: clara._assert_claim_basis(uuid,jsonb,boolean) has DRIFTED from its pinned pre-image (measured %, expected %) -- this file carries 0301''s body byte for byte apart from ONE new rule, so re-derive it against the LIVE body before applying', v_sha, c_assert_pre
        using errcode = 'CLR10';
    end if;
  end if;

  -- NON-REGRESSION, pinned and NOT recut by this file. The normaliser heads the list: it is the
  -- body that turns an empty array into the single-advance shape, and it is exactly the body a
  -- reader of this file would be tempted to "also fix".
  for v_pin in select * from (values
      ('clara._claim_allocations(jsonb)',
       'c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737'),
      ('clara._claim_settlement_account(jsonb)',
       '49819cebb6b43dc99ba28adcbf90345227870d3ffdadae7edb42b26faee360ce'),
      ('clara._claim_basis_canonical(jsonb)',
       '42439eb94a7e2bcc5d8e7f1ba1cb88c01c234f0f9e6a9af694ef525cee8b2b5c'),
      ('clara._claim_journal_basis(jsonb)',
       '78de12f565d332db3a16d98a37c5cb98cacda392f3daff3a7b4666c1319b5cf9'),
      ('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)',
       '8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2'),
      ('clara._tf_adv_claim_application_birth()',
       'ab8efc36688a911f78c783b2e18845812771f880179df7709f830cc92effaee0'),
      ('clara._claim_resolve_claimant(uuid,uuid,jsonb,text)',
       '5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c'),
      ('clara._claim_item_total(jsonb)',
       '72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c'),
      ('clara._adv_over_application(uuid,bigint,date,bigint,date)',
       'b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769'),
      ('clara._adv_enrolment_at(uuid,text,timestamptz)',
       '54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1067 prestate: % MOVED (measured %, expected %) -- this file recuts exactly ONE body and nothing else', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1067 prestate: clean (% apply) -- the validator is at its measured 0301 post-image and the ten bodies this file does NOT touch, the allocation normaliser and the canonical form among them, are unmoved.',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$p1067_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- THE RECUT VALIDATOR. 0301's body, byte for byte, plus the ONE rule above. Every pre-existing
-- refusal keeps its code, its reason, its field and its position in the order.
-- =====================================================================================
create or replace function clara._assert_claim_basis(p_client uuid, p_claim jsonb,
    p_check_world boolean default true) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  e record; v_settlement text; v_incurred date; v_posting date; v_amount bigint;
  v_total bigint; v_n int; v_live int; v_code text; v_class text; v_type text;
  v_enrol uuid; v_claimant jsonb; v_credit text; v_firm uuid;
  v_target_id uuid; v_target_corrected uuid; v_target_entry uuid; v_target_reversed uuid;
  v_advance uuid; v_cap jsonb; v_fy record;
  -- #931 (0301): the confirmed allocation list.
  v_allocs jsonb; v_listed boolean; v_alloc_total bigint; v_alloc bigint;
  v_seen uuid[]; v_path text; v_field_code text; v_field_adv text;
  v_claim_enrol uuid; v_claim_label text; v_adv_enrol uuid; v_adv_code text;
begin
  if p_claim is null or jsonb_typeof(p_claim) <> 'object' then
    raise exception 'a staff expense claim is a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim","constraint":"object"}';
  end if;

  -- ---- THE CLAIMANT HANDLE -----------------------------------------------------------------
  v_claimant := p_claim -> 'claimant';
  if v_claimant is null or jsonb_typeof(v_claimant) <> 'object' then
    raise exception 'a claim names WHO claimed' using errcode='CLR10',
      detail='{"reason":"claimant_missing","field":"claim.claimant","constraint":"object"}';
  end if;
  v_enrol := clara._claim_uuid(v_claimant, 'enrolment_id', 'claim.claimant.enrolment_id');
  v_code := nullif(btrim(coalesce(v_claimant ->> 'account_code','')), '');
  if v_enrol is null and v_code is null then
    raise exception 'a claim names its claimant by enrolment or by the account dedicated to them'
      using errcode='CLR10',
      detail='{"reason":"claimant_missing","field":"claim.claimant","constraint":"present"}';
  end if;
  perform clara._claim_text(v_claimant, 'identifier', 120, 'claim.claimant.identifier', false);

  -- ---- THE TWO DATES -----------------------------------------------------------------------
  v_incurred := clara._claim_date(p_claim, 'incurred_date', 'claim.incurred_date',
    'incurred_date_missing');
  v_posting := clara._claim_date(p_claim, 'posting_date', 'claim.posting_date', 'invalid_claim');
  if v_incurred > v_posting then
    raise exception 'the expense was incurred on % but the claim posts on %', v_incurred, v_posting
      using errcode='CLR10',
      detail=jsonb_build_object('reason','incurred_after_posting','field','claim.incurred_date',
        'constraint','order','incurred_date',v_incurred,'posting_date',v_posting)::text;
  end if;

  -- ---- THE SOURCE AND THE WORDS ------------------------------------------------------------
  if btrim(coalesce(p_claim->>'source_kind','')) not in ('document','instruction') then
    raise exception 'a claim states whether its source is a document or an instruction'
      using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.source_kind","constraint":"source_kind"}';
  end if;
  perform clara._claim_text(p_claim, 'instruction', 4000, 'claim.instruction');

  if upper(btrim(coalesce(p_claim->>'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.currency","constraint":"myr"}';
  end if;

  -- ---- THE AMOUNT, BEFORE THE ITEMS --------------------------------------------------------
  v_amount := clara._claim_cents(p_claim, 'amount_cents', 'claim.amount_cents');
  if v_amount = 0 then
    raise exception 'this claim claims nothing' using errcode='CLR10',
      detail='{"reason":"claim_all_zero","field":"claim.amount_cents"}';
  end if;

  -- ---- THE ITEMISATION ----------------------------------------------------------------------
  if jsonb_typeof(p_claim -> 'items') <> 'array' then
    raise exception 'the claim items are a JSON array' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.items","constraint":"array"}';
  end if;
  v_n := jsonb_array_length(p_claim -> 'items');
  if v_n < 1 then
    raise exception 'a claim carries at least one itemised line' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.items","constraint":"at_least_one"}';
  end if;
  v_live := 0;
  for e in select x.elem, x.idx from jsonb_array_elements(p_claim -> 'items')
      with ordinality as x(elem, idx) loop
    if jsonb_typeof(e.elem) <> 'object' then
      raise exception 'item % is not a JSON object', e.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim',
          'field','claim.items[' || e.idx || ']','constraint','object')::text;
    end if;
    perform clara._claim_text(e.elem, 'description', 2000,
      'claim.items[' || e.idx || '].description');
    if nullif(btrim(coalesce(e.elem ->> 'pending_fact','')),'') is not null then
      perform clara._claim_text(e.elem, 'pending_fact', 120,
        'claim.items[' || e.idx || '].pending_fact');
      if e.elem -> 'amount_cents' is not null
         and jsonb_typeof(e.elem -> 'amount_cents') <> 'null' then
        raise exception 'item % is waiting on % and may not also claim an amount', e.idx,
          e.elem ->> 'pending_fact' using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim',
            'field','claim.items[' || e.idx || '].amount_cents','constraint','absent')::text;
      end if;
      continue;
    end if;
    v_live := v_live + 1;
    v_code := clara._claim_text(e.elem, 'expense_account_code', 64,
      'claim.items[' || e.idx || '].expense_account_code');
    if clara._claim_cents(e.elem, 'amount_cents',
         'claim.items[' || e.idx || '].amount_cents') <= 0 then
      raise exception 'item % claims nothing', e.idx using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim',
          'field','claim.items[' || e.idx || '].amount_cents',
          'constraint','positive_integer_cents')::text;
    end if;
    if p_check_world then
      select a.account_type, a.account_class into v_type, v_class from clara.coa_accounts a
       where a.client_id = p_client and a.account_code = v_code and a.is_active;
      if v_type is distinct from 'expense' then
        raise exception 'item % codes to %, which is not an active expense account of this client',
          e.idx, v_code using errcode='CLR10',
          detail=jsonb_build_object('reason','item_account_not_expense',
            'field','claim.items[' || e.idx || '].expense_account_code',
            'account_code', v_code, 'account_type', v_type)::text;
      end if;
    end if;
  end loop;
  if v_live = 0 then
    raise exception 'every item on this claim is waiting on a fact; there is nothing to post'
      using errcode='CLR10', detail='{"reason":"claim_all_zero","field":"claim.items"}';
  end if;
  v_total := clara._claim_item_total(p_claim);
  if v_total <> v_amount then
    raise exception 'the items add to % but the claim states %', v_total, v_amount
      using errcode='CLR10',
      detail=jsonb_build_object('reason','items_do_not_sum','field','claim.amount_cents',
        'constraint','exact_sum','items_cents',v_total,'amount_cents',v_amount)::text;
  end if;

  -- ---- THE SETTLEMENT AND ITS CREDIT LEGS ----------------------------------------------------
  v_settlement := btrim(coalesce(p_claim->>'settlement',''));
  if v_settlement not in ('reimbursement','advance_application','already_settled') then
    raise exception 'unknown settlement %', v_settlement using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.settlement","constraint":"settlement"}';
  end if;
  v_credit := clara._claim_settlement_account(p_claim);
  if v_credit is null then
    raise exception 'a % claim names the account it settles against', v_settlement
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim',
        'field', 'claim.' || (case v_settlement when 'reimbursement' then 'payable_account_code'
                                                when 'advance_application' then 'advance_account_code'
                                                else 'payment_account_code' end),
        'constraint','present')::text;
  end if;

  -- ---- #931 (0301) · THE ALLOCATION LIST, PAYLOAD HALF ---------------------------------------
  -- A property of the SUBMISSION and nothing else: the shape, the distinctness, and the exact sum.
  -- Whether each advance exists, is this claimant's and can carry its share is the world half.
  v_listed := jsonb_typeof(p_claim -> 'advance_allocations') = 'array'
              and jsonb_array_length(p_claim -> 'advance_allocations') > 0;
  if p_claim -> 'advance_allocations' is not null
     and jsonb_typeof(p_claim -> 'advance_allocations') not in ('array','null') then
    raise exception 'the advance allocations are a JSON array' using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.advance_allocations","constraint":"array"}';
  end if;
  -- ---- #1067 (0339) · A LIST THAT IS PRESENT ALLOCATES SOMETHING --------------------------
  -- `v_listed` above is "an array with MORE THAN ZERO members", so before this file a
  -- present-but-EMPTY array was not a list at all to this validator: the settlement rule, the
  -- distinctness rule, the exact sum and the head rule were ALL skipped, and the submission was
  -- judged on whatever else it happened to carry. On an advance application stating `advance_id`
  -- that meant ADMITTED — `clara._claim_allocations` falls through to the single-advance shape,
  -- so the door posted against an advance the stated list does not name. On any other settlement
  -- it meant IGNORED. Neither is a refusal a reader can act on.
  --
  -- THE RULE IS THE KEY'S OWN SHAPE, so it is asked HERE: after "is it an array?" and BEFORE
  -- anything that reads what the array says, the same order `claim.items` is already judged in
  -- (`array` then `at_least_one`). It therefore holds REGARDLESS of the claim's total and
  -- regardless of its settlement, which is what makes it a property of the SUBMISSION.
  --
  -- THE WORD IS `at_least_one`, the one the runtime's own wire schema already refuses an empty
  -- list under (`packages/runtime/src/workRoutes.ts`, `advance_allocations` / `at_least_one`), and
  -- the reason stays the list's own `advance_allocation_mismatch` — so "the list is empty" is a
  -- named SPECIALISATION of the list's reason and is told apart from "the list does not add up"
  -- (`exact_sum`) by its constraint alone.
  --
  -- A JSON `null` under this key is NOT an empty array: 0221's type rule admits it as "absent",
  -- and this file does not move that.
  if jsonb_typeof(p_claim -> 'advance_allocations') = 'array'
     and jsonb_array_length(p_claim -> 'advance_allocations') = 0 then
    raise exception 'this claim states an allocation list and allocates nothing'
      using errcode='CLR10',
      detail='{"reason":"advance_allocation_mismatch","field":"claim.advance_allocations","constraint":"at_least_one"}';
  end if;
  if v_listed and v_settlement <> 'advance_application' then
    raise exception 'only an advance application discharges advances, so only it carries an allocation list'
      using errcode='CLR10',
      detail='{"reason":"invalid_claim","field":"claim.advance_allocations","constraint":"settlement"}';
  end if;
  v_allocs := clara._claim_allocations(p_claim);
  if v_listed then
    v_alloc_total := 0;
    v_seen := array[]::uuid[];
    for e in select x.elem, x.idx from jsonb_array_elements(p_claim -> 'advance_allocations')
        with ordinality as x(elem, idx) loop
      v_path := 'claim.advance_allocations[' || e.idx || ']';
      if jsonb_typeof(e.elem) <> 'object' then
        raise exception 'allocation % is not a JSON object', e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim','field',v_path,
            'constraint','object')::text;
      end if;
      v_advance := clara._claim_uuid(e.elem, 'advance_id', v_path || '.advance_id');
      if v_advance is null then
        raise exception 'allocation % names no advance -- there is NO silent FIFO in this register (WD-R10)',
          e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_allocation_mismatch',
            'field', v_path || '.advance_id', 'constraint','present')::text;
      end if;
      if v_advance = any(v_seen) then
        raise exception 'advance % is named twice in one allocation list', v_advance
          using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_allocation_mismatch',
            'field', v_path || '.advance_id', 'constraint','distinct',
            'advance_id', v_advance)::text;
      end if;
      v_seen := v_seen || v_advance;
      v_alloc := clara._claim_cents(e.elem, 'amount_cents', v_path || '.amount_cents');
      if v_alloc <= 0 then
        raise exception 'allocation % discharges nothing', e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim','field', v_path || '.amount_cents',
            'constraint','positive_integer_cents')::text;
      end if;
      v_alloc_total := v_alloc_total + v_alloc;
      perform clara._claim_text(e.elem, 'account_code', 64, v_path || '.account_code', false);
    end loop;
    -- THE ALLOCATIONS ADD UP TO THE CLAIM, TO THE CENT. No partial settlement and no
    -- over-allocation: #881's ruling takes both out of scope, and a claim that settles only part
    -- of itself would leave the rest owed to nobody.
    if v_alloc_total <> v_amount then
      raise exception 'the allocations add to % but the claim states %', v_alloc_total, v_amount
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch',
          'field','claim.advance_allocations','constraint','exact_sum',
          'allocated_cents',v_alloc_total,'amount_cents',v_amount)::text;
    end if;
    -- THE HEAD IS WHAT THE CLAIM ROW'S OWN COLUMNS CARRY, so a stated head must BE the head.
    if nullif(btrim(coalesce(p_claim->>'advance_id','')),'') is not null
       and lower(btrim(p_claim->>'advance_id')) is distinct from (v_allocs -> 0 ->> 'advance_id') then
      raise exception 'claim.advance_id names an advance that is not the first allocation'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch','field','claim.advance_id',
          'constraint','allocation_head')::text;
    end if;
    if nullif(btrim(coalesce(p_claim->>'advance_account_code','')),'') is not null
       and nullif(btrim(coalesce(p_claim->>'advance_account_code','')),'')
           is distinct from (v_allocs -> 0 ->> 'account_code') then
      raise exception 'claim.advance_account_code names an account that is not the first allocation''s'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_allocation_mismatch',
          'field','claim.advance_account_code','constraint','allocation_head')::text;
    end if;
  end if;

  -- THE SETTLEMENT LEGS MAY NOT REPEAT AN ITEM'S OWN ACCOUNT: an entry that debits and credits one
  -- account for the same claim says nothing. Asked of EVERY credit account the claim implies.
  for e in select distinct a.code from (
             select v_credit as code
             union
             select x.elem ->> 'account_code' from jsonb_array_elements(v_allocs) as x(elem)
           ) a where a.code is not null loop
    if exists (select 1 from jsonb_array_elements(p_claim -> 'items') as x(elem)
                where nullif(btrim(coalesce(x.elem ->> 'pending_fact','')),'') is null
                  and btrim(coalesce(x.elem ->> 'expense_account_code','')) = e.code) then
      raise exception 'the settlement leg repeats an item''s own account (%)', e.code
        using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim','field','claim.settlement',
          'constraint','distinct','account_code',e.code)::text;
    end if;
  end loop;
  perform clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id');

  if not p_check_world then return; end if;

  -- =========================================================================================
  -- THE WORLD HALF. Everything below can change between two attempts under one intent key.
  -- =========================================================================================
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;

  -- (o) THE LOCKED PERIOD, TYPED AND EARLY.
  select * into v_fy from clara.fiscal_years fy
   where fy.client_id = p_client and v_posting between fy.starts_on and fy.ends_on
   order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
   limit 1;
  if v_fy.id is not null and v_fy.status in ('closing','closed') then
    raise exception 'fiscal year % (% to %) is %; a staff expense claim dated % is not admitted into it',
      v_fy.label, v_fy.starts_on, v_fy.ends_on, v_fy.status, v_posting
      using errcode='CLR19',
      detail=jsonb_build_object('reason','write_into_closed_period','field','claim.posting_date',
        'fiscal_year_id', v_fy.id, 'fy_status', v_fy.status, 'posting_date', v_posting)::text;
  end if;

  -- (i) THE CLAIMANT IS A LIVE ENROLMENT OF THIS CLIENT — or a code the door may enrol.
  if v_enrol is not null then
    if not exists (select 1 from clara.staff_advance_accounts sa
                    where sa.id = v_enrol and sa.client_id = p_client and sa.active) then
      raise exception 'that claimant is not a live staff-advance enrolment of this client'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','claimant_not_enrolled',
          'field','claim.claimant.enrolment_id','enrolment_id',v_enrol)::text;
    end if;
  end if;

  -- (ii) THE SETTLEMENT LEG'S OWN CLASS.
  select a.account_type, a.account_class into v_type, v_class from clara.coa_accounts a
   where a.client_id = p_client and a.account_code = v_credit and a.is_active;
  if v_type is null then
    raise exception 'the settlement account % is not an active account of this client', v_credit
      using errcode='CLR10',
      detail=jsonb_build_object('reason','invalid_claim',
        'field', 'claim.' || (case v_settlement when 'reimbursement' then 'payable_account_code'
                                                when 'advance_application' then 'advance_account_code'
                                                else 'payment_account_code' end),
        'constraint','unknown_account','account_code',v_credit)::text;
  end if;
  if v_settlement = 'reimbursement' then
    if v_class is not null then
      raise exception 'money owed to a claimant may not sit on the control account %', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','payable_account_is_control',
          'field','claim.payable_account_code','account_code',v_credit,
          'account_class',v_class)::text;
    end if;
    if v_type <> 'liability' then
      raise exception 'the claimant is owed money, so % must be a liability account', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim','field','claim.payable_account_code',
          'constraint','liability','account_code',v_credit,'account_type',v_type)::text;
    end if;
  elsif v_settlement = 'already_settled' then
    if v_type <> 'asset' or v_class is not null then
      raise exception 'an already-settled claim is paid from an asset account, not from %', v_credit
        using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_claim','field','claim.payment_account_code',
          'constraint','asset','account_code',v_credit,'account_type',v_type)::text;
    end if;
  else
    -- (iii) THE ADVANCE ARM, WIDENED TO A LIST (#931). The head account's enrolment and the
    -- "which advance?" refusal are asked FIRST and UNCHANGED, so a claim that named no advance,
    -- or named an unenrolled account, is refused with the same reason at the same field it always
    -- was.
    if clara._adv_enrolment_at(p_client, v_credit, now()) is null then
      raise exception 'no live staff-advance enrolment carries %', v_credit using errcode='CLR10',
        detail=jsonb_build_object('reason','advance_not_enrolled',
          'field','claim.advance_account_code','account_code',v_credit)::text;
    end if;
    if jsonb_array_length(v_allocs) = 0 then
      raise exception 'an advance application names WHICH advance it discharges -- there is NO silent FIFO in this register (WD-R10)'
        using errcode='CLR10',
        detail='{"reason":"advance_allocation_mismatch","field":"claim.advance_id","constraint":"present"}';
    end if;

    -- THE CLAIMANT, resolved the way clara._claim_resolve_claimant resolves it moments later: the
    -- stated enrolment, or the live enrolment on the account dedicated to them. NULL means the
    -- door is about to AUTO-ENROL a new claimant — who by construction holds no advance yet, so
    -- every allocation below is refused by name rather than by a missing join.
    v_claim_enrol := v_enrol;
    if v_claim_enrol is null then
      v_claim_enrol := clara._adv_enrolment_at(p_client,
        nullif(btrim(coalesce(v_claimant ->> 'account_code','')), ''), now());
    end if;
    select btrim(sa.person_label) into v_claim_label
      from clara.staff_advance_accounts sa where sa.id = v_claim_enrol;

    for e in select x.elem, x.idx from jsonb_array_elements(v_allocs)
        with ordinality as x(elem, idx) loop
      v_field_code := case when v_listed
        then 'claim.advance_allocations[' || e.idx || '].account_code'
        else 'claim.advance_account_code' end;
      v_field_adv := case when v_listed
        then 'claim.advance_allocations[' || e.idx || '].advance_id'
        else 'claim.advance_id' end;
      v_code := e.elem ->> 'account_code';
      if v_code is null then
        raise exception 'allocation % names no advance account', e.idx using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_claim','field',v_field_code,
            'constraint','present')::text;
      end if;
      -- EVERY ACCOUNT A CLAIM CREDITS IS AN ENROLLED ADVANCE ACCOUNT OF THIS CLIENT.
      if clara._adv_enrolment_at(p_client, v_code, now()) is null then
        raise exception 'no live staff-advance enrolment carries %', v_code using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_not_enrolled','field',v_field_code,
            'account_code',v_code)::text;
      end if;
      v_advance := (e.elem ->> 'advance_id')::uuid;
      select sa.enrolment_id, sa.account_code into v_adv_enrol, v_adv_code
        from clara.staff_advances sa where sa.id = v_advance and sa.client_id = p_client;
      if v_adv_enrol is null or v_adv_code is distinct from v_code then
        raise exception 'that advance is not one this client holds on %', v_code
          using errcode='CLR10',
          detail=jsonb_build_object('reason','advance_allocation_mismatch','field',v_field_adv,
            'constraint','not_this_client','advance_id',v_advance)::text;
      end if;
      -- …AND IT WAS ISSUED TO THIS CLAIMANT. See this file's fourth measurement for why the
      -- second arm compares two admin-attested enrolment labels and what replaces it.
      if v_adv_enrol is distinct from v_claim_enrol then
        if v_claim_label is null or not exists (
             select 1 from clara.staff_advance_accounts sa2
              where sa2.id = v_adv_enrol and sa2.client_id = p_client and sa2.active
                and btrim(sa2.person_label) = v_claim_label) then
          raise exception 'that advance was not issued to this claimant' using errcode='CLR10',
            detail=jsonb_build_object('reason','advance_allocation_mismatch','field',v_field_adv,
              'constraint','not_this_claimant','advance_id',v_advance,
              'claimant_enrolment_id',v_claim_enrol)::text;
        end if;
      end if;
      -- THE SHARED CAP (0043:1220), ASKED PER ALLOCATION — never once for the claim total. A cap
      -- asked once against the head advance would refuse a lawful split and admit an unlawful one.
      --
      -- THE REFUSAL NAMES THE ADVANCE, ITS OUTSTANDING ON THE BOUNDARY DAY, AND THE SHORTFALL.
      -- `clara._adv_over_application` already answers the first two in its own object; the
      -- SHORTFALL is what the preparer has to move, and making them subtract it themselves is how
      -- a refusal stops being actionable. It is `-resulting_cents` — the cap's own arithmetic read
      -- from its own answer, never a second walk.
      --
      -- AND IT ADDRESSES THE CONTROL THEY MUST CHANGE: the allocation's own amount when the claim
      -- states a LIST, and `claim.amount_cents` when it names ONE advance (0221's own path, and
      -- still the only control there is on that shape).
      v_alloc := (e.elem ->> 'amount_cents')::bigint;
      v_cap := clara._adv_over_application(v_advance, v_alloc, v_posting);
      if v_cap is not null then
        raise exception 'that advance cannot carry this claim: % cents outstanding at %, % claimed',
          v_cap->>'outstanding_cents', v_cap->>'boundary_date', v_alloc using errcode='CLR10',
          detail=(v_cap || jsonb_build_object('reason','advance_allocation_mismatch',
            'field', case when v_listed
              then 'claim.advance_allocations[' || e.idx || '].amount_cents'
              else 'claim.amount_cents' end,
            'constraint','over_application',
            'shortfall_cents', -((v_cap->>'resulting_cents')::bigint)))::text;
      end if;
    end loop;
  end if;

  -- (iv) THE CORRECTION TARGET, if there is one.
  if clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id') is not null then
    select sec.id, sec.corrected_by_claim_id, st.entry_id, je.reversed_by
      into v_target_id, v_target_corrected, v_target_entry, v_target_reversed
      from clara.staff_expense_claims sec
      left join clara.staff_expense_claim_status st
             on st.claim_id = sec.id and st.state = 'posted'
      left join clara.journal_entries je on je.id = st.entry_id
     where sec.id = clara._claim_uuid(p_claim, 'corrects_claim_id', 'claim.corrects_claim_id')
       and sec.client_id = p_client;
    if v_target_id is null then
      raise exception 'the claim being corrected is not one of this client''s' using errcode='CLR10',
        detail='{"reason":"correction_target_not_found","field":"claim.corrects_claim_id"}';
    end if;
    if v_target_corrected is not null then
      raise exception 'that claim has already been corrected' using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_already_corrected',
          'field','claim.corrects_claim_id','claim_id',v_target_corrected)::text;
    end if;
    if v_target_entry is not null and v_target_reversed is null then
      raise exception 'reverse the posted entry before correcting the claim it stands on'
        using errcode='CLR10',
        detail=jsonb_build_object('reason','correction_target_live','field','claim.corrects_claim_id',
          'entry_id',v_target_entry)::text;
    end if;
  end if;
end $$;
revoke all on function clara._assert_claim_basis(uuid,jsonb,boolean) from public;

reset role;

-- =====================================================================================
-- THE TAIL. The rule is DRIVEN here, not described: the payload half is called with each shape
-- and the refusal (or its absence) is read back out of the raised detail.
-- =====================================================================================
do $p1067_tail$
declare
  v_n int; v_sha text; v_pin record; v_detail jsonb; v_basis jsonb;
  c_nil constant uuid := '00000000-0000-0000-0000-000000000000';
  -- ONE well-formed advance-application claim, built once and varied per probe. `p_check_world`
  -- is false throughout, so no client, chart, enrolment or advance is needed and the tail asserts
  -- the PAYLOAD half exactly as `clara.admit_staff_expense_claim_work` step 2 calls it.
  c_base constant jsonb := jsonb_build_object(
    'claimant', jsonb_build_object('account_code','1190'),
    'source_kind','instruction', 'instruction','#1067 tail probe',
    'incurred_date','2026-03-04', 'posting_date','2026-03-31',
    'currency','MYR', 'amount_cents', 60500,
    'items', jsonb_build_array(jsonb_build_object('description','probe',
      'expense_account_code','6200','amount_cents',60500)),
    'settlement','advance_application', 'advance_account_code','1190');
begin
  -- T.1 THE RECUT BODY keeps its owner, its definer flag, its pinned search_path and its ACL, and
  -- carries BOTH markers: 0301's, because this file is 0301's body plus one rule rather than a
  -- rewrite, and this file's own.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#1067 tail T.1: the validator lost its owner, its SECURITY DEFINER flag or its pinned search_path'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara._assert_claim_basis(uuid,jsonb,boolean)', 'EXECUTE') then
    raise exception '#1067 tail T.1b: PUBLIC holds EXECUTE on the validator' using errcode='CLR10';
  end if;
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
  if position('#1067 (0339' in coalesce(v_sha,'')) = 0 then
    raise exception '#1067 tail T.1c: the validator does not carry this file''s marker'
      using errcode='CLR10';
  end if;
  if position('#931 (0301' in coalesce(v_sha,'')) = 0 then
    raise exception '#1067 tail T.1d: the validator lost 0301''s marker -- this file carries 0301''s body, it does not replace it'
      using errcode='CLR10';
  end if;

  -- T.2 AN EMPTY LIST IS REFUSED BY NAME, on an advance application. DRIVEN.
  begin
    perform clara._assert_claim_basis(c_nil,
      c_base || jsonb_build_object('advance_allocations','[]'::jsonb,
                                   'advance_id','11111111-1111-4111-8111-111111111111'), false);
    raise exception '#1067 tail T.2: an advance application stating an EMPTY allocation list was ADMITTED by the payload half'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_sha = pg_exception_detail;
    v_detail := nullif(v_sha,'')::jsonb;
    if v_detail is null then raise; end if;
    if v_detail ->> 'reason' <> 'advance_allocation_mismatch'
       or v_detail ->> 'field' <> 'claim.advance_allocations'
       or v_detail ->> 'constraint' <> 'at_least_one' then
      raise exception '#1067 tail T.2b: the empty-list refusal is % -- expected advance_allocation_mismatch / claim.advance_allocations / at_least_one', v_detail::text
        using errcode='CLR10';
    end if;
  end;

  -- …and on ANY OTHER settlement, because the rule is the key's own shape. Before this file a
  -- reimbursement carrying an empty list was admitted with the key silently ignored.
  begin
    perform clara._assert_claim_basis(c_nil,
      (c_base - 'advance_account_code')
        || jsonb_build_object('settlement','reimbursement','payable_account_code','2010',
                              'advance_allocations','[]'::jsonb), false);
    raise exception '#1067 tail T.2c: a reimbursement carrying an EMPTY allocation list was ADMITTED by the payload half'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_sha = pg_exception_detail;
    v_detail := nullif(v_sha,'')::jsonb;
    if v_detail is null then raise; end if;
    if v_detail ->> 'constraint' <> 'at_least_one'
       or v_detail ->> 'field' <> 'claim.advance_allocations' then
      raise exception '#1067 tail T.2d: the empty-list refusal on a reimbursement is % -- expected at_least_one at claim.advance_allocations', v_detail::text
        using errcode='CLR10';
    end if;
  end;

  -- T.2e A LIST THAT DOES NOT ADD UP still says `exact_sum`, at the same field: the two are told
  -- apart by their constraint, which is #1067 AC2.
  begin
    perform clara._assert_claim_basis(c_nil,
      c_base || jsonb_build_object('advance_allocations', jsonb_build_array(
        jsonb_build_object('advance_id','11111111-1111-4111-8111-111111111111','amount_cents',40000),
        jsonb_build_object('advance_id','22222222-2222-4222-8222-222222222222','amount_cents',20000))),
      false);
    raise exception '#1067 tail T.2e: a list that does not add up was ADMITTED by the payload half'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_sha = pg_exception_detail;
    v_detail := nullif(v_sha,'')::jsonb;
    if v_detail is null then raise; end if;
    if v_detail ->> 'constraint' <> 'exact_sum' then
      raise exception '#1067 tail T.2f: the not-adding-up refusal is % -- expected exact_sum, which is what the empty-list refusal must be distinguishable FROM', v_detail::text
        using errcode='CLR10';
    end if;
  end;

  -- T.3 THE SHAPES THIS FILE DOES NOT REFUSE, driven rather than argued (#1067 AC3). A claim with
  -- NO `advance_allocations` key at all, and a claim carrying JSON `null` under it, both still
  -- pass the payload half.
  perform clara._assert_claim_basis(c_nil,
    c_base || jsonb_build_object('advance_id','11111111-1111-4111-8111-111111111111'), false);
  perform clara._assert_claim_basis(c_nil,
    c_base || jsonb_build_object('advance_allocations', 'null'::jsonb,
                                 'advance_id','11111111-1111-4111-8111-111111111111'), false);

  -- T.4 THE SINGLE-ADVANCE SHAPE IS UNCHANGED, on the pure derivations: still no
  -- `advance_allocations` key in the canonical form (so every stored claim replays byte for byte)
  -- and still ONE credit leg carrying the whole amount.
  if (clara._claim_basis_canonical(
        c_base || jsonb_build_object('advance_id','11111111-1111-4111-8111-111111111111')))
     ? 'advance_allocations' then
    raise exception '#1067 tail T.4: a single-advance claim gained an advance_allocations key in its canonical form'
      using errcode='CLR10';
  end if;
  v_basis := clara._claim_journal_basis(
    c_base || jsonb_build_object('advance_id','11111111-1111-4111-8111-111111111111'));
  select count(*)::int into v_n from jsonb_array_elements(v_basis -> 'lines') as x(l)
   where (x.l ->> 'credit_cents')::bigint > 0;
  if v_n <> 1 then
    raise exception '#1067 tail T.4b: a single-advance claim derives % credit leg(s), expected 1', v_n
      using errcode='CLR10';
  end if;

  -- T.5 NOTHING ELSE MOVED — the same ten bodies the prestate pinned, re-measured after the recut.
  for v_pin in select * from (values
      ('clara._claim_allocations(jsonb)',
       'c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737'),
      ('clara._claim_settlement_account(jsonb)',
       '49819cebb6b43dc99ba28adcbf90345227870d3ffdadae7edb42b26faee360ce'),
      ('clara._claim_basis_canonical(jsonb)',
       '42439eb94a7e2bcc5d8e7f1ba1cb88c01c234f0f9e6a9af694ef525cee8b2b5c'),
      ('clara._claim_journal_basis(jsonb)',
       '78de12f565d332db3a16d98a37c5cb98cacda392f3daff3a7b4666c1319b5cf9'),
      ('clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)',
       '8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2'),
      ('clara._tf_adv_claim_application_birth()',
       'ab8efc36688a911f78c783b2e18845812771f880179df7709f830cc92effaee0'),
      ('clara._claim_resolve_claimant(uuid,uuid,jsonb,text)',
       '5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c'),
      ('clara._claim_item_total(jsonb)',
       '72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c'),
      ('clara._adv_over_application(uuid,bigint,date,bigint,date)',
       'b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769'),
      ('clara._adv_enrolment_at(uuid,text,timestamptz)',
       '54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1067 tail T.5: % MOVED (measured %, expected %)', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.6 NO STORED CLAIM WAS ADMITTED THROUGH THE GAP: no claim basis on this database carries an
  -- `advance_allocations` key that is an empty array. Always evaluated, over every row there is.
  select count(*)::int into v_n from clara.staff_expense_claims sec
   where jsonb_typeof(sec.basis -> 'advance_allocations') = 'array'
     and jsonb_array_length(sec.basis -> 'advance_allocations') = 0;
  if v_n <> 0 then
    raise exception '#1067 tail T.6: % stored claim(s) carry an EMPTY advance_allocations key in their canonical basis', v_n
      using errcode='CLR10';
  end if;

  raise notice '#1067 tail OK: a present `advance_allocations` array that allocates nothing is refused advance_allocation_mismatch / claim.advance_allocations / at_least_one on ANY settlement, driven on both arms; a list that does not add up still says exact_sum, so the two are told apart by their constraint; a claim carrying no key, and one carrying JSON null, still pass; the single-advance canonical form and its one credit leg are unmoved; and the ten bodies this file does not touch are unmoved.';
end
$p1067_tail$;
