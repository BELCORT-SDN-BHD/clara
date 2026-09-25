-- 0336_revenue_recognition_plan_op_key — #1077 (riders sweep wave, lane 02): TWO LANES DERIVED THE
-- SAME NESTED IDEMPOTENCY KEY, SO ONE OPERATION KEY SPENT ON BOTH COLLIDED ON A RESERVATION
-- NEITHER CALLER CAN NAME.
-- =====================================================================================
-- Spec of record: issue #1077's Agent Brief (no comments on the ticket; the brief is the whole
-- contract).
--
-- THE DEFECT. Both schedule lanes write their underlying accounting plan through 0193's own human
-- door, and both derived the nested operation key the same way — `p_op_key || ':plan'`:
--
--   · `clara._prepayment_schedule_core`  (0317:1767, the human arm)
--   · `clara._revenue_recognition_core`  (0317:2250, the human arm)
--
-- `clara._reserve_op` (0004:47) keys a receipt on (firm_id, fn, op_key), and the fn for BOTH nested
-- calls is `create_accounting_plan`. The OUTER reservations never collided — those carry the two
-- doors' own fns, `create_prepayment_schedule` and `create_revenue_recognition_schedule`. The
-- DERIVED one did: a caller that spends one operation key on both lanes (a run deriving its keys
-- from a shared seed is the ticket's own example) inserts `(firm, 'create_accounting_plan',
-- '<key>:plan')` on the first lane, and the second lane finds that row with a different request
-- hash and raises `op_key reused with different args` under CLR10 with NO detail at all. A caller
-- reading that answer cannot tell it from any other bad request, and nothing about it names the
-- lane, the key or the fact that a reservation was reused.
--
-- MEASURED, not inferred: on this lane's rig a prepayment schedule and a deferred-revenue schedule
-- configured under one key answered
--   `op_key reused with different args` / CLR10 / (no detail)
-- at the SECOND door, before this file. The cell that measured it is
-- `p1077.cross_lane.create` in tests/revenue-recognition-plan-op-key.test.mjs.
--
-- WHICH FIX, AND WHY THIS ONE. The ticket offers two: qualify the nested key per lane, or give
-- `clara._reserve_op`'s reuse raise a typed reason. This file takes the FIRST.
--   · `clara._reserve_op` is 0004's, it is the reserve-before-effect primitive EVERY governed door
--     in this estate rides, and its reuse raise is the shared answer for a genuine retry-with-
--     different-arguments on any of them. Re-coding it would change what dozens of doors answer for
--     a mistake that has nothing to do with these two lanes. The sweep plan says the same
--     (`SWEEP-PLAN.md:141-147`): recutting `clara._reserve_op` "has a far larger blast radius and is
--     NOT this ticket's job".
--   · A typed reason would also only make the collision legible. Qualifying the key REMOVES it, and
--     the ticket names that arm first ("for example `:rrplan` for the deferred-revenue lane,
--     keeping `:plan` for prepayment"). The deferred-revenue lane moves because it is the later of
--     the two and because the ticket names it as the one to move; the prepayment lane's key is
--     untouched, so no schedule already configured anywhere changes the key it reserved.
--
-- WHAT MOVES, EXACTLY. Both bodies of the DEFERRED-REVENUE lane that derive a nested plan key:
--
--   · `clara._revenue_recognition_core`            `:plan` → `:rrplan`
--   · `clara.replace_revenue_recognition_schedule` `:end`  → `:rrend`,  `:plan` → `:rrplan`
--
-- The correction door is here for the same reason and not as a widening: `clara.replace_prepayment_
-- schedule` (0317:789, 801) derives `:end` and `:plan` from ITS caller's key under
-- `end_accounting_plan` and `create_accounting_plan`, so two corrections sharing one operation key
-- collided at `:end` one step BEFORE they reached the plan. AC1 asks that "the two lanes' nested
-- plan reservations no longer share a key namespace", and leaving the correction pair sharing one
-- would make that false at the very first reservation either door takes.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not touch `clara._reserve_op`, `clara.create_accounting_plan` or
--     `clara.end_accounting_plan`. Not one line, and not one sha pin either: `clara.create_
--     accounting_plan` is written by another lane of this wave, and a pin here would make this file
--     refuse to apply behind it. That the two nested reservations really land under those two fns
--     is proved where it belongs — by DRIVING the doors and reading `clara.op_receipts`, in
--     `p1077.cross_lane.create` and `p1077.cross_lane.replace`.
--   · It does not change either lane's normal idempotency (AC3). A true retry — the same door, the
--     same key, the same arguments — is answered by the OUTER reservation, which this file does not
--     touch: the door replays its stored result and never reaches the nested call at all. A retry
--     with DIFFERENT arguments is still refused by the same outer reservation, with the same
--     message. Both are driven in `p1077.same_lane.idempotent`.
--   · It mints no function, no relation, no grant, no role and no reason token. Two
--     `create or replace function` statements, each VERBATIM from its live 0317 cut except the
--     derived key literals and the comments explaining them.
--   · It backfills no `clara.op_receipts` row. Receipts already written under `<key>:plan` by the
--     deferred-revenue lane stay exactly as they are: they are historical records of acts that
--     happened, the outer receipt is what a retry of those acts replays from, and rewriting an
--     idempotency ledger to match a later naming decision would be the more dangerous act.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md "Redo"): the whole file is two
-- `create or replace function` statements between a marker-tolerant prestate and a tail that reads
-- the live catalog. A redo over its own effects re-installs identical text.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0336_pre$
declare
  v_sha text; v_src text; v_i int; v_n int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (riders sweep
  -- lane 02 database `clara_l05`, 310 files, max 0335_internal_refusal_errcode — #1114 landed
  -- before this ticket and moved neither of them), never copied from an older migration's header.
  -- Each admits exactly TWO pre-images of its own — its measured live sha, or a body that already
  -- carries this file's own `0336` attribution — so a redo is admitted and real drift still refuses
  -- BY NAME. 0317's and 0335's idiom, line for line.
  v_recut text[][] := array[
    ['clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
     '28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd']
  ];
  -- …AND THE PREPAYMENT SIBLINGS THIS FILE MUST NOT MOVE AND DEPENDS ON NOT MOVING. The whole
  -- change is an ASYMMETRY — the deferred-revenue lane's derived keys become its own and the
  -- prepayment lane's stay `:plan` / `:end` — so a prepayment body that drifted under this file
  -- could re-introduce the collision without a line here changing. Both are this lane's own bodies;
  -- no other lane of this wave writes either.
  v_keep text[][] := array[
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     '87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a'],
    ['clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)',
     'ed859dbe813067464a7635d6775c823a36c3f400b59f326952fb22c6ce34e699']
  ];
begin
  -- 1 · THE RECUT BODIES, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0336 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0336' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0336 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE PREPAYMENT SIBLINGS ARE EXACTLY WHAT THIS ASYMMETRY WAS WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '0336 prestate: % moved (expected %, live %)',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE COLLISION IS REAL AND IT IS WHERE THIS FILE SAYS IT IS. Before the recut, the two
  --     CREATE cores derive the SAME nested key literal; after it, only the prepayment one does.
  --     Either state is admissible (a redo has already split them); anything else means the defect
  --     moved and this file is patching a body that no longer carries it.
  select count(*) into v_n from pg_proc p
   where p.oid = any (array[
           'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'::regprocedure,
           'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure])
     and p.prosrc like '%p_op_key || '':plan''%';
  if v_n not in (1, 2) then
    raise exception '0336 prestate: expected the two schedule cores to derive '':plan'' (2 before, 1 after), found %', v_n
      using errcode='CLR10';
  end if;

  -- 4 · THE NEW KEY SUFFIXES ARE FREE. `:rrplan` and `:rrend` must be minted by this file and by
  --     nothing else, or the collision this file removes would simply move somewhere new.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and (p.prosrc like '%'':rrplan''%' or p.prosrc like '%'':rrend''%')
     and p.oid::regprocedure::text <> all (array[
           'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
           'clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)']);
  if v_n <> 0 then
    raise exception '0336 prestate: '':rrplan''/'':rrend'' are already derived by % body(ies) outside this file''s two', v_n
      using errcode='CLR10';
  end if;

  raise notice '0336 prestate OK — % FIRST, % REDO — %', v_first, v_redo, v_modes;
end $c0336_pre$;

-- =====================================================================================
-- §A — clara._revenue_recognition_core (0317 §B's cut, unmoved by 0335). VERBATIM except the
--      derived nested plan key on the human arm, and the comment that explains it.
-- =====================================================================================
create or replace function clara._revenue_recognition_core(p_firm uuid, p_client uuid, p_actor uuid, p_lane text, p_source_entry uuid, p_revenue_account text, p_revenue_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text, p_pattern text)
returns jsonb language plpgsql security definer
set search_path = clara, pg_temp as $c0336_rrc$
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
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
  if v_existing is not null then
    raise exception 'this advance is already recognised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','deferred_revenue_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- THE SOURCE. Read ONCE; absent and foreign answer with ONE refusal (the 0021 rule), so
  -- this door is not an existence oracle for another client's entries. ----
  select je.id, je.status, je.document_id, je.posting_date, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;

  -- ================= #1036 FIX ROUND / ADV-05 — A REVERSED RECOGNITION IS NOT SCHEDULABLE ========
  --
  -- WHAT WAS MEASURED. `clara.reverse_entry` leaves the original at status 'approved' and sets
  -- `reversed_by`, so a REFUNDED advance passed the status wall above. Driven on the rig before
  -- this arm: a 90000-sen advance was reversed through the real door and
  -- `clara.create_revenue_recognition_schedule` then returned a schedule of 90000 over 3 periods --
  -- a plan that would post Dr deferred revenue / Cr revenue against money the client got back,
  -- driving the liability into a debit balance and recognising revenue on a cancelled performance
  -- obligation (MFRS 15 / MPERS section 23, the standard this lane's own header names). The
  -- prepayment twin did the same against a refunded prepaid asset.
  --
  -- THE LANE'S TWO HALVES DISAGREED, which is the sharpest evidence this was an oversight rather
  -- than a decision: `clara.list_revenue_recognition_attention` (0308), `clara.list_prepayment_
  -- attention` (0305) and #940's own band all filter `je.reversed_by is null`, so the band would
  -- NEVER offer a receipt this door was accepting. The predicate below is theirs, verbatim.
  if v_entry.reversed_by is not null then
    raise exception 'this advance has been reversed, so there is no obligation left to recognise'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','deferred_revenue_source_unfit',
          'reason_text','this advance has been reversed, so there is no obligation left to recognise',
          'axis','source_reversed', 'source_entry', p_source_entry,
          'reversed_by', v_entry.reversed_by)::text;
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
      -- #1077 [0336] — THE NESTED KEY IS THIS LANE'S OWN (`:rrplan`, not `:plan`).
      -- `clara._reserve_op` keys a receipt on (firm, fn, op_key) and the fn here is
      -- `create_accounting_plan` for BOTH schedule lanes, so while the prepayment core
      -- (`clara._prepayment_schedule_core`) and this one both suffixed their caller's key with the
      -- same four characters, a caller that spent one operation key on both lanes reserved the SAME
      -- receipt row twice with different arguments and was answered `op_key reused with different
      -- args` — CLR10 with no detail at all, indistinguishable from any other bad request. Note
      -- that the OUTER reservations never
      -- collided (their fns differ); only this derived one did. Qualifying it per lane is the fix
      -- the ticket names first, and it leaves `clara._reserve_op` — which every door in the estate
      -- rides — untouched.
      p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':rrplan');
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
     where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
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
end $c0336_rrc$;
-- =====================================================================================
-- §C — TAIL. Read off the LIVE catalog, never off this file's own text.
-- =====================================================================================
do $c0336_tail$
declare v_src text; v_n int; v_sig text;
  v_mine text[] := array[
    'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'
  ];
begin
  -- 1 · THE DEFERRED-REVENUE LANE DERIVES ITS OWN KEYS AND NO LONGER DERIVES THE PREPAYMENT
  --     LANE'S. Both halves matter: gaining `:rrplan` without losing `:plan` would leave the
  --     collision exactly where it was.
  foreach v_sig in array v_mine loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if v_src is null then
      raise exception '0336 tail: % is absent after the recut', v_sig using errcode='CLR10';
    end if;
    if v_src not like '%p_op_key || '':rrplan''%' then
      raise exception '0336 tail: % does not derive '':rrplan''', v_sig using errcode='CLR10';
    end if;
    if v_src like '%p_op_key || '':plan''%' then
      raise exception '0336 tail: % still derives '':plan''', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE PREPAYMENT LANE IS UNTOUCHED. Its core still derives `:plan` and has not learned this
  --     file's keys, which is the whole of the asymmetry the fix consists of.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'::regprocedure;
  if v_src not like '%p_op_key || '':plan''%' or v_src like '%:rrplan%' or v_src like '%:rrend%' then
    raise exception '0336 tail: the prepayment core lost '':plan'' or learned this file''s keys'
      using errcode='CLR10';
  end if;

  -- 3 · NO BODY IN THE ESTATE DERIVES BOTH NAMESPACES, and `:rrplan`/`:rrend` are derived by this
  --     file's bodies alone. A third lane reaching for either suffix later is visible here rather
  --     than silent.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and (p.prosrc like '%'':rrplan''%' or p.prosrc like '%'':rrend''%')
     and p.oid::regprocedure::text <> all (v_mine);
  if v_n <> 0 then
    raise exception '0336 tail: % clara body(ies) outside this file derive '':rrplan''/'':rrend''', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and (p.prosrc like '%'':rrplan''%' or p.prosrc like '%'':rrend''%')
     and (p.prosrc like '%p_op_key || '':plan''%' or p.prosrc like '%p_op_key || '':end''%');
  if v_n <> 0 then
    raise exception '0336 tail: % clara body(ies) derive BOTH lanes'' nested keys', v_n
      using errcode='CLR10';
  end if;

  -- 4 · NOTHING ELSE MOVED. No overload was minted and the ACL is exactly what 0317 left: the core
  --     is an INTERNAL body no application role reaches, and `create or replace function` preserves
  --     a grant rather than granting one.
  foreach v_sig in array v_mine loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname = split_part(split_part(v_sig, '.', 2), '(', 1);
    if v_n <> 1 then
      raise exception '0336 tail: % has % catalog entries, expected exactly 1', v_sig, v_n
        using errcode='CLR10';
    end if;
  end loop;
  if has_function_privilege('clara_authenticated',
       'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_runtime',
       'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('public',
       'clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0336 tail: a role reached the deferred-revenue core, which is ungranted by design'
      using errcode='CLR10';
  end if;

  raise notice '0336 OK: the deferred-revenue lane derives its own nested plan key (op_key || '':rrplan''), the prepayment lane still derives op_key || '':plan'', no clara body derives both namespaces, and nothing else about either lane moved.';
end $c0336_tail$;
