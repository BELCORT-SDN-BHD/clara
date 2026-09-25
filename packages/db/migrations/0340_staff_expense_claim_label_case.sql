-- 0340_staff_expense_claim_label_case — #1052 (riders sweep wave, lane 03): THE #931 LABEL ARM
-- MATCHES ON `lower(btrim(person_label))`, THE FIRST OF THE OWNER'S TWO CONDITIONS.
-- =====================================================================================
-- Spec of record: issue #1052's Agent Brief (no later comment; verified live on this branch) and
-- the owner's ruling comment of 2026-09-24 on #931, which this file exists to meet:
--
--   "Arm (b) stands, under two conditions the wall must keep: the label match is EXACT AFTER
--    NORMALISATION (case and surrounding whitespace only, never a substring or a fuzzy match),
--    and the allocation editor shows, beside each such advance, the enrolment it came from […]
--    If the built match is not exact-normalised or the editor does not show the source enrolment,
--    that is a defect to fix in the sweep wave, not a reopening of this ruling."
--
-- The FIRST condition is this file's. The SECOND is a web change (`apps/web`) and carries no
-- database object; it ships in the same ticket's commits.
--
-- It recuts EXACTLY ONE body, `clara._assert_claim_basis(uuid,jsonb,boolean)`, at its LIVE
-- post-image — which on this branch is 0339's (#1067, the empty-allocation rule), not 0301's —
-- byte for byte apart from the two `lower(...)` calls and the comments that say why. No relation,
-- no grant, no other function.
--
-- =====================================================================================
-- WHAT WAS LIVE, MEASURED ON THE LANE DATABASE RATHER THAN READ OFF THE TICKET.
--
-- 0301's fourth measurement reads "this advance belongs to this claimant" in two arms:
--   (a) the advance's own enrolment IS the claimant's, or
--   (b) the advance's enrolment is ANOTHER LIVE enrolment of this client whose `person_label`
--       is the claimant's.
-- Arm (b) was built comparing `btrim(sa2.person_label) = btrim(sa.person_label)` — 0301:753 and
-- 0301:791, carried forward unchanged by 0339 at its lines 519 and 557. Measured on clara_l06
-- (chain 0001..0339) before this file was written, by driving the real doors:
--
--   * `clara.enrol_staff_advance_account` stores `nullif(btrim(coalesce(p_person_label,'')),'')`
--     (0043:1980) and 0221's auto-enrolment inside the claim door stores the same shape
--     (0221:1149), so SURROUNDING WHITESPACE is already normalised AT ENROLMENT and no stored
--     label carries padding. An admin who types "  farah BINTI idris  " leaves
--     "farah BINTI idris" on the row — proved by cell `p1052.label.case`, which reads the stored
--     label back off `clara.staff_advance_accounts`.
--   * CASE is normalised NOWHERE. A claim by the claimant enrolled on 1190 as "Farah binti Idris",
--     allocating against an advance held under the client's second live enrolment on 1191 labelled
--     "farah BINTI idris", was REFUSED `CLR10` / `advance_allocation_mismatch` /
--     `not_this_claimant` — the same refusal a genuinely different person's advance gets. That is
--     the defect: a lawful allocation refused, and refused under a word that tells the preparer
--     the advance is not theirs when it is.
--
-- So exactly ONE of the ruling's two normalisations was live, and it was live at the enrolment
-- door rather than at the wall. This file adds the other, at the wall, and keeps `btrim` there
-- for a row that predates those doors.
--
-- =====================================================================================
-- THE MEASUREMENT: `lower(btrim(...))` ON BOTH SIDES, AND NOTHING LOOSER.
--
--   * NOT a substring, NOT `like`, NOT a similarity, NOT `unaccent`. The ruling names case and
--     surrounding whitespace and forbids the rest by name; "Farah binti Idris B" and
--     "Farah binti Idris" stay two people, and cell `p1052.label.distinct` pins that they do.
--   * NOT a collation change and NOT a citext column. `lower()` is the smallest thing that answers
--     the ruling, it is what the ticket's own Desired behaviour spells out, and it leaves the
--     column, its indexes and every other reader of `person_label` untouched.
--   * The claimant's side is lowered ONCE, where `v_claim_label` is read, so the loop below
--     compares two already-normalised strings and there is exactly one place either side can
--     drift.
--
-- WHAT IT WIDENS, STATED PLAINLY. Two DIFFERENT people of one client labelled "Ali" and "ali" were
-- two claimants to this wall and are now one, exactly as two labelled "Ali" and "Ali" already
-- were. That is the ruling's own trade: the free-text label is not an identity, the staff master
-- (#1049, re-parented to the mainline on 2026-09-25) is the real fix, and until it lands the arm
-- must meet the ruling rather than be narrower than it. Nothing else about the arm moves: the same
-- client, an ACTIVE enrolment, the whole label, and the per-advance cap and the claimant floor
-- untouched. The change only ever admits an allocation the ruling says is lawful; it never widens
-- WHOSE books a claim may reach, because every arm still sits inside one client.
--
-- WHAT THIS FILE DOES NOT TOUCH, AND PINS: 0339's own empty-list rule (this file carries it
-- forward byte for byte and the tail re-proves it is still refused by name), the normaliser
-- `clara._claim_allocations`, the settlement-account derivation, the canonical form, the journal
-- basis, the door, the claimant resolver, the birth trigger, the shared temporal cap, the
-- enrolment reader, and `clara.enrol_staff_advance_account` — which is pinned here because the
-- WHITESPACE half of the ruling lives in its own `btrim`.
--
-- REDO SAFETY (#957). The only statement is a `create or replace function`, and the prestate takes
-- a REDO branch on the marker only this file writes into that body. A redo over this file's own
-- effects is a no-op plus a re-proof. The FIRST-APPLY branch was additionally proved by hand
-- inside a rolled-back transaction (see the ticket report).
-- =====================================================================================

do $p1052_pre$
declare
  v_sha text; v_src text; v_pin record; v_redo boolean := false;
  -- THE LIVE PRE-IMAGE of the ONE body this file recuts, measured off pg_proc.prosrc on the
  -- lane-03 sweep rig (clara_l06, PG 17, chain 0001..0339) moments before this file was written.
  -- It is 0339's post-image, NOT 0301's: #1067 landed earlier in this same lane and recut this
  -- validator, so pinning 0301's sha here would refuse on a branch that is exactly right.
  c_assert_pre constant text :=
    '5c55fc8d860bc74c4fd721a81442b4ea19ed66240ef3d20386efd53e2a2cd294';
begin
  if to_regprocedure('clara._claim_allocations(jsonb)') is null then
    raise exception '#1052 prestate: 0301 (the confirmed allocation list) is absent -- it must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957.) The signal is the marker only this file writes into
  -- the recut validator.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
  if position('#1052 (0340' in coalesce(v_src, '')) > 0 then
    v_redo := true;
    raise notice '#1052 prestate: the validator already carries this file''s marker -- treating this as a #957 REDO of 0340 itself. The single statement below is a create-or-replace and is redo-safe by construction; the tail re-proves the whole post-state.';
  end if;

  -- THE ONE BODY THIS FILE RECUTS, at its measured 0339 post-image.
  if not v_redo then
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
    if v_sha is null then
      raise exception '#1052 prestate: clara._assert_claim_basis(uuid,jsonb,boolean) is absent'
        using errcode = 'CLR10';
    end if;
    if v_sha <> c_assert_pre then
      raise exception '#1052 prestate: clara._assert_claim_basis(uuid,jsonb,boolean) has DRIFTED from its pinned pre-image (measured %, expected %) -- this file carries the LIVE body byte for byte apart from two lower() calls, so re-derive it against the live body before applying', v_sha, c_assert_pre
        using errcode = 'CLR10';
    end if;
  end if;

  -- #1067's rule must be IN the live body on BOTH branches: on a first apply the sha above already
  -- implies it, and on a REDO this file's own post-image carries 0339's marker forward. Asked by
  -- name so a reader of a failed apply is told WHICH predecessor is missing.
  if position('#1067 (0339' in coalesce(v_src, '')) = 0 then
    raise exception '#1052 prestate: the live validator does not carry #1067''s marker -- 0339 must apply first, because this file carries its body forward'
      using errcode = 'CLR10';
  end if;

  -- NON-REGRESSION, pinned and NOT recut by this file. `clara.enrol_staff_advance_account` heads
  -- the list: the ruling's WHITESPACE half lives in its `btrim`, so a change there would move half
  -- of what this file is accountable for without touching this file at all.
  for v_pin in select * from (values
      ('clara.enrol_staff_advance_account(uuid,text,text,boolean,text,text)',
       '6db2120df4ffa29cfda6cc282323cb633df6036dfdb76d47b7270a6e6adbf477'),
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
      raise exception '#1052 prestate: % MOVED (measured %, expected %) -- this file recuts exactly ONE body and nothing else', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1052 prestate: clean (% apply) -- %; it carries #1067''s rule; and the eleven bodies this file does NOT touch, the enrolment door that already btrims a label among them, are unmoved.',
    case when v_redo then 'REDO' else 'FIRST' end,
    case when v_redo then 'the validator already carries THIS file''s marker, so its pre-image sha is not asked'
         else 'the validator is at its measured 0339 post-image' end;
end
$p1052_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- THE RECUT VALIDATOR. 0339's body, byte for byte, plus `lower()` on both sides of the label
-- comparison and the two comments that say why. Every pre-existing refusal keeps its code, its
-- reason, its field and its position in the order; #1067's empty-list rule rides along unchanged.
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
    -- #1052 (0340) · THE CLAIMANT'S LABEL, NORMALISED ONCE. `lower(btrim(...))` and nothing
    -- looser: the owner's ruling of 2026-09-24 on #931 admits arm (b) only on an EXACT match
    -- after case and surrounding whitespace, never a substring and never a fuzzy match. The
    -- whitespace half is already done at enrolment (both doors store
    -- `nullif(btrim(coalesce(...,'')),'')`); the `btrim` here stays as 0301 wrote it, for a row
    -- that predates those doors. `v_claim_label` is the LOWERED form from here on, so the one
    -- comparison below must lower its own side too.
    select lower(btrim(sa.person_label)) into v_claim_label
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
      -- #1052 (0340): the second arm compares the two labels NORMALISED — `lower(btrim())` on
      -- both sides. Before this file `Farah binti Idris` and `farah BINTI idris` were two
      -- people to this wall, so a lawful allocation was refused `not_this_claimant`, which
      -- reads to a preparer as "this is not their advance" when it is. Nothing else about the
      -- arm moves: still the same client, still an ACTIVE enrolment, still an exact match of
      -- the whole label. The staff master (#1049) retires the arm; until it lands it must meet
      -- the ruling.
      if v_adv_enrol is distinct from v_claim_enrol then
        if v_claim_label is null or not exists (
             select 1 from clara.staff_advance_accounts sa2
              where sa2.id = v_adv_enrol and sa2.client_id = p_client and sa2.active
                and lower(btrim(sa2.person_label)) = v_claim_label) then
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
-- THE TAIL. The rule is DRIVEN here, not described. The label arm lives in the WORLD half, which
-- needs a client, a chart, two live enrolments and two advances to reach — so this tail builds
-- them, drives `clara._assert_claim_basis(..., true)` against them, and unwinds the fixtures
-- inside a CLR99 sub-transaction (the 0018 / 0019 / 0020 / 0146 / 0260 / 0302 probe idiom).
-- =====================================================================================
do $p1052_tail$
declare
  v_n int; v_sha text; v_src text; v_pin record; v_detail jsonb;
  v_user uuid; v_firm uuid; v_client uuid; v_entry uuid;
  v_enrol_a uuid; v_enrol_b uuid; v_enrol_c uuid;
  v_adv_a uuid; v_adv_b uuid; v_adv_c uuid;
  v_line_a uuid; v_line_b uuid; v_line_c uuid;
  v_claim jsonb; v_ok boolean;
begin
  -- T.1 THE RECUT BODY keeps its owner, its definer flag, its pinned search_path and its ACL, and
  -- carries THREE markers: 0301's (the arm itself), 0339's (#1067's rule, carried forward) and
  -- this file's — because this file is its predecessor's body plus two `lower()` calls, not a
  -- rewrite of either.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#1052 tail T.1: the validator lost its owner, its SECURITY DEFINER flag or its pinned search_path'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara._assert_claim_basis(uuid,jsonb,boolean)', 'EXECUTE') then
    raise exception '#1052 tail T.1b: PUBLIC holds EXECUTE on the validator' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_claim_basis(uuid,jsonb,boolean)'::regprocedure;
  if position('#1052 (0340' in coalesce(v_src,'')) = 0 then
    raise exception '#1052 tail T.1c: the validator does not carry this file''s marker'
      using errcode='CLR10';
  end if;
  if position('#1067 (0339' in coalesce(v_src,'')) = 0 then
    raise exception '#1052 tail T.1d: the validator lost #1067''s marker -- this file carries 0339''s body, it does not replace it'
      using errcode='CLR10';
  end if;
  if position('#931 (0301' in coalesce(v_src,'')) = 0 then
    raise exception '#1052 tail T.1e: the validator lost 0301''s marker' using errcode='CLR10';
  end if;

  -- T.1f THE COMPARISON ITSELF, read off the live body: both sides normalised, and the
  -- case-sensitive form gone. A structural assertion, stated as such — the BEHAVIOUR is driven in
  -- T.2 below.
  if position('lower(btrim(sa2.person_label)) = v_claim_label' in coalesce(v_src,'')) = 0
     or position('select lower(btrim(sa.person_label)) into v_claim_label' in coalesce(v_src,'')) = 0 then
    raise exception '#1052 tail T.1f: the label comparison is not lower(btrim(...)) on both sides'
      using errcode='CLR10';
  end if;
  if position('and btrim(sa2.person_label) = v_claim_label' in coalesce(v_src,'')) > 0 then
    raise exception '#1052 tail T.1g: the case-SENSITIVE comparison is still in the body'
      using errcode='CLR10';
  end if;

  -- T.2 THE ARM, DRIVEN against real rows. Fixtures are hand-written (every NOT NULL column, CHECK
  -- and foreign key the live catalog carries, measured on this rig before this file was written),
  -- narrower than the full disburse-and-approve ceremony the dedicated battery drives.
  begin
    v_user := gen_random_uuid();
    insert into clara.users(id, display_name) values (v_user, '1052-label-case probe');
    insert into clara.firms(id, name) values (gen_random_uuid(), '1052-label-case probe firm')
      returning id into v_firm;
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_firm, v_user, 'admin', 'active');
    insert into clara.clients(firm_id, name, status)
      values (v_firm, '1052-label-case probe client', 'active')
      returning id into v_client;
    insert into clara.coa_accounts(firm_id, client_id, account_code, name, account_type)
      values (v_firm, v_client, '6200', 'Travel (probe)', 'expense'),
             (v_firm, v_client, '1150', 'Bank (probe)', 'asset'),
             (v_firm, v_client, '1190', 'Staff advance A (probe)', 'asset'),
             (v_firm, v_client, '1191', 'Staff advance B (probe)', 'asset'),
             (v_firm, v_client, '1192', 'Staff advance C (probe)', 'asset');

    -- THREE LIVE ENROLMENTS OF ONE CLIENT.
    --   A  "Ali"      — the claimant's own, on 1190.
    --   B  "  ali  "  — the SAME person, written by another admin: a different case AND padding.
    --                   The padding is deliberate and is the one thing the real enrolment doors
    --                   can no longer produce, so this row is how the wall's own `btrim` is
    --                   exercised rather than assumed.
    --   C  "Ali B"    — a DIFFERENT person whose label merely starts with the claimant's. The
    --                   ruling forbids a substring match, and this row is what proves it.
    insert into clara.staff_advance_accounts(firm_id, client_id, account_code, person_label,
        enrolment_attestation, created_by, created_op_key)
      values (v_firm, v_client, '1190', 'Ali', '1052 probe: dedicated to one named person',
              v_user, '1052-probe-enrol-a')
      returning id into v_enrol_a;
    insert into clara.staff_advance_accounts(firm_id, client_id, account_code, person_label,
        enrolment_attestation, created_by, created_op_key)
      values (v_firm, v_client, '1191', '  ali  ', '1052 probe: dedicated to one named person',
              v_user, '1052-probe-enrol-b')
      returning id into v_enrol_b;
    insert into clara.staff_advance_accounts(firm_id, client_id, account_code, person_label,
        enrolment_attestation, created_by, created_op_key)
      values (v_firm, v_client, '1192', 'Ali B', '1052 probe: dedicated to one named person',
              v_user, '1052-probe-enrol-c')
      returning id into v_enrol_c;

    -- ONE BALANCED DISBURSEMENT ENTRY carrying the three advance legs, and the three register rows
    -- that hang off its lines.
    insert into clara.journal_entries(id, firm_id, client_id, status, posting_date, memo, origin,
        maker_actor)
      values (gen_random_uuid(), v_firm, v_client, 'draft', date '2026-01-10',
        '1052 probe advance disbursements', 'agent', v_user)
      returning id into v_entry;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 1, v_client, v_firm, '1190', 40000, 0) returning id into v_line_a;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 2, v_client, v_firm, '1191', 30000, 0) returning id into v_line_b;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 3, v_client, v_firm, '1192', 30000, 0) returning id into v_line_c;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code,
        debit_cents, credit_cents)
      values (v_entry, 4, v_client, v_firm, '1150', 0, 100000);

    insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
        disbursement_line_id, entry_id, issue_date, amount_cents)
      values (v_firm, v_client, v_enrol_a, '1190', v_line_a, v_entry, date '2026-01-10', 40000)
      returning id into v_adv_a;
    insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
        disbursement_line_id, entry_id, issue_date, amount_cents)
      values (v_firm, v_client, v_enrol_b, '1191', v_line_b, v_entry, date '2026-01-10', 30000)
      returning id into v_adv_b;
    insert into clara.staff_advances(firm_id, client_id, enrolment_id, account_code,
        disbursement_line_id, entry_id, issue_date, amount_cents)
      values (v_firm, v_client, v_enrol_c, '1192', v_line_c, v_entry, date '2026-01-10', 30000)
      returning id into v_adv_c;

    -- THE CLAIM: 60,500 sen by the claimant enrolled as "Ali" on 1190, allocating 40,000 to her
    -- own advance and 20,500 to an advance held under the client's OTHER enrolment.
    v_claim := jsonb_build_object(
      'claimant', jsonb_build_object('enrolment_id', v_enrol_a),
      'source_kind', 'instruction', 'instruction', '1052 label-case probe',
      'incurred_date', '2026-03-04', 'posting_date', '2026-03-31',
      'currency', 'MYR', 'amount_cents', 60500,
      'items', jsonb_build_array(jsonb_build_object('description', 'probe',
        'expense_account_code', '6200', 'amount_cents', 60500)),
      'settlement', 'advance_application', 'advance_account_code', '1190');

    -- (a) "Ali" vs "  ali  " — ADMITTED. Case and surrounding whitespace, and nothing else.
    begin
      perform clara._assert_claim_basis(v_client,
        v_claim || jsonb_build_object('advance_allocations', jsonb_build_array(
          jsonb_build_object('advance_id', v_adv_a, 'amount_cents', 40000, 'account_code', '1190'),
          jsonb_build_object('advance_id', v_adv_b, 'amount_cents', 20500, 'account_code', '1191'))),
        true);
      v_ok := true;
    exception when others then
      raise exception '#1052 tail T.2: an advance held under a second live enrolment labelled "  ali  " was REFUSED for a claimant labelled "Ali" (% / %) -- the ruling requires the match to succeed after case and surrounding whitespace', sqlstate, sqlerrm
        using errcode='CLR10';
    end;

    -- (b) "Ali" vs "Ali B" — REFUSED, by the arm's own name. A substring is not a match.
    begin
      perform clara._assert_claim_basis(v_client,
        v_claim || jsonb_build_object('advance_allocations', jsonb_build_array(
          jsonb_build_object('advance_id', v_adv_a, 'amount_cents', 40000, 'account_code', '1190'),
          jsonb_build_object('advance_id', v_adv_c, 'amount_cents', 20500, 'account_code', '1192'))),
        true);
      raise exception '#1052 tail T.2b: an advance held under an enrolment labelled "Ali B" was ADMITTED for a claimant labelled "Ali" -- the normalisation is looser than the ruling allows'
        using errcode='CLR10';
    exception when sqlstate 'CLR10' then
      get stacked diagnostics v_sha = pg_exception_detail;
      v_detail := nullif(v_sha,'')::jsonb;
      if v_detail is null then raise; end if;
      if v_detail ->> 'reason' <> 'advance_allocation_mismatch'
         or v_detail ->> 'constraint' <> 'not_this_claimant'
         or v_detail ->> 'field' <> 'claim.advance_allocations[2].advance_id' then
        raise exception '#1052 tail T.2c: the substring refusal is % -- expected advance_allocation_mismatch / not_this_claimant at claim.advance_allocations[2].advance_id', v_detail::text
          using errcode='CLR10';
      end if;
    end;

    -- (c) #1067's RULE, CARRIED FORWARD. An empty list is still refused by its own name, so the
    -- predecessor this file builds on is proved present by behaviour and not only by its marker.
    begin
      perform clara._assert_claim_basis(v_client,
        v_claim || jsonb_build_object('advance_allocations', '[]'::jsonb,
                                      'advance_id', v_adv_a), true);
      raise exception '#1052 tail T.2d: an EMPTY allocation list was admitted -- #1067''s rule was lost in this recut'
        using errcode='CLR10';
    exception when sqlstate 'CLR10' then
      get stacked diagnostics v_sha = pg_exception_detail;
      v_detail := nullif(v_sha,'')::jsonb;
      if v_detail is null then raise; end if;
      if v_detail ->> 'constraint' <> 'at_least_one'
         or v_detail ->> 'field' <> 'claim.advance_allocations' then
        raise exception '#1052 tail T.2e: the empty-list refusal is % -- expected at_least_one at claim.advance_allocations', v_detail::text
          using errcode='CLR10';
      end if;
    end;

    -- (d) A GENUINELY OTHER CLIENT'S advance is still refused at the earlier, unchanged wall. The
    -- arm this file widened sits INSIDE one client, and nothing about that moved.
    begin
      perform clara._assert_claim_basis(v_client,
        v_claim || jsonb_build_object('advance_allocations', jsonb_build_array(
          jsonb_build_object('advance_id', gen_random_uuid(), 'amount_cents', 60500,
                             'account_code', '1190'))),
        true);
      raise exception '#1052 tail T.2f: an advance this client does not hold was ADMITTED'
        using errcode='CLR10';
    exception when sqlstate 'CLR10' then
      get stacked diagnostics v_sha = pg_exception_detail;
      v_detail := nullif(v_sha,'')::jsonb;
      if v_detail is null then raise; end if;
      if v_detail ->> 'constraint' <> 'not_this_client' then
        raise exception '#1052 tail T.2g: the foreign-advance refusal is % -- expected not_this_client', v_detail::text
          using errcode='CLR10';
      end if;
    end;

    -- (e) A RETIRED enrolment is still not a claimant's, however its label reads. `sa2.active` is
    -- untouched by this file and this is the cell that says so out loud.
    update clara.staff_advance_accounts
       set active = false, retired_by = v_user, retired_at = now(),
           retired_reason = '1052 probe', retired_op_key = '1052-probe-retire'
     where id = v_enrol_b;
    begin
      perform clara._assert_claim_basis(v_client,
        v_claim || jsonb_build_object('advance_allocations', jsonb_build_array(
          jsonb_build_object('advance_id', v_adv_a, 'amount_cents', 40000, 'account_code', '1190'),
          jsonb_build_object('advance_id', v_adv_b, 'amount_cents', 20500, 'account_code', '1191'))),
        true);
      raise exception '#1052 tail T.2h: an advance under a RETIRED enrolment was admitted on a matching label'
        using errcode='CLR10';
    exception when sqlstate 'CLR10' then
      get stacked diagnostics v_sha = pg_exception_detail;
      v_detail := nullif(v_sha,'')::jsonb;
      if v_detail is null then raise; end if;
      -- 1191 no longer carries a live enrolment at all, so the EARLIER per-allocation enrolment
      -- wall answers first. Either way the allocation is refused and the reason is read, not
      -- assumed.
      if v_detail ->> 'reason' not in ('advance_not_enrolled','advance_allocation_mismatch') then
        raise exception '#1052 tail T.2i: the retired-enrolment refusal is %', v_detail::text
          using errcode='CLR10';
      end if;
    end;

    -- Force the subtransaction to unwind so no fixture row survives this migration's own commit.
    raise exception 'clara_1052_probe_rollback' using errcode='CLR99';
  exception
    when sqlstate 'CLR99' then null; -- expected: fixtures discarded
  end;
  if v_ok is not true then
    raise exception '#1052 tail T.2j: the probe did not reach its positive arm' using errcode='CLR10';
  end if;

  -- T.3 THE ELEVEN BODIES THIS FILE DOES NOT TOUCH, re-measured AFTER the recut.
  for v_pin in select * from (values
      ('clara.enrol_staff_advance_account(uuid,text,text,boolean,text,text)',
       '6db2120df4ffa29cfda6cc282323cb633df6036dfdb76d47b7270a6e6adbf477'),
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
      raise exception '#1052 tail T.3: % MOVED during this migration (measured %, expected %)', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.4 WHAT THIS FILE CHANGES ON THE DATA ALREADY HERE, counted rather than branched on: pairs of
  -- ACTIVE enrolments of ONE client whose labels were two people to the old wall and are one to
  -- the new one. Always evaluated; zero on a seeded rig, and the number a hosted apply should be
  -- read against. Nothing is written either way -- the wall is asked per claim, never backfilled.
  select count(*)::int into v_n
    from clara.staff_advance_accounts a
    join clara.staff_advance_accounts b
      on b.client_id = a.client_id and b.id <> a.id and b.active and a.active
     and lower(btrim(b.person_label)) = lower(btrim(a.person_label))
     and btrim(b.person_label) <> btrim(a.person_label);
  raise notice '#1052 tail T.4: % ordered pair(s) of live enrolments on this database become ONE claimant under the normalised match.', v_n;

  raise notice '#1052 tail OK: the label arm compares lower(btrim(person_label)) on both sides; DRIVEN on real rows, "Ali" matches "  ali  " and is refused against "Ali B" (not_this_claimant at the allocation''s own field); a retired enrolment and another client''s advance are still refused; #1067''s empty-list rule and the eleven neighbouring bodies are unmoved.';
end
$p1052_tail$;
