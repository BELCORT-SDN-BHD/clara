-- 0315_prepayment_wake_reroute — #1036 (riders wave 4, lane 04): the agent-lane prepayment wake
-- door stops proposing a retired 0045 template and lands in the SAME durable record a person's own
-- configuration does.
-- =====================================================================================
-- Spec of record: issue #1036's body (the wave-3 integration ruling, 2026-09-23) plus the
-- WAVE-4 LANE 04 rules (this lane's own work order addendum, 2026-09-20): build AFTER #915 and
-- #941, at migration 0315 (the wave's overflow block, reserved for this ticket).
--
-- THE GAP THIS CLOSES, measured rather than recalled. `clara.wake_establish_prepayment_schedule`
-- (0140, wrapper 12) still calls `clara._agent_prepayment_schedule_core`, which calls
-- `clara._propose_adjustment_template_core` and can mint a `proposed` `clara.adjustment_templates`
-- row -- a row #927 (0282) left no door to sign, no belt to run (#928, 0283) and no advisory to
-- name (#929, 0283). The path cannot fire in production today: the wake's only
-- `clara.wake_fn_allowlist` row is for `wake_kind = close_prep`, and that source's
-- `clara.wake_engine_sources` row is `enabled = false` -- but the path is a live, callable body,
-- and `plan-overlap-template-arm-retired.test.mjs`'s `p929.containment` cell was written to pin
-- exactly that residual until this ticket closed it.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. The wrapper's SAME NAME and SAME SEVEN ARGUMENTS now
-- delegate to `clara._prepayment_schedule_core` -- #915's shared body, already proven identical
-- for the 'human' and 'obo' lanes -- through a THIRD lane, 'wake', so an agent-lane wake produces a
-- real `clara.prepayment_schedules` row (configuration only, exactly like a person's own call)
-- with the SAME roster gate, the SAME expense-account eligibility wall, the SAME term derivation
-- and the SAME `clara._reserve_op`/`clara._finish_op` idempotency a human or a chat configuration
-- gets. `clara._agent_prepayment_schedule_core` and `clara._propose_adjustment_template_core` are
-- never called by this wrapper again.
--
-- THE ONE GENUINE ARCHITECTURAL PROBLEM, faced rather than routed around. `clara.create_accounting
-- _plan` and its OBO sibling `clara._obo_plan_core` (0193, #915, #941) BOTH resolve the plan's
-- authority through `clara._authority_ref_refusal`, which admits only an `accounting_work` row or
-- a `chat_turn`-kind `agent_tasks` row with a non-null `created_by` -- i.e. ONLY a person's own
-- instruction, BY DESIGN (0307 sec A's own words: "the wall that stops a wake run or an autodraft
-- from authorising its own amortisation schedule"). A `close_prep` wake is exactly that caller: its
-- credential is minted with `on_behalf_of` FORBIDDEN BY CONSTRUCTION (0138:827-830, "there is no
-- directing human on the clocked lane"), so it can never supply a ref that wall would admit, and
-- `clara.accounting_plans.authority_kind` is a closed one-member CHECK (`explicit_instruction`
-- only) -- widening it is a real schema change to the plan model this ticket does not make. So this
-- file adds ONE new ungranted core, `clara._prepayment_plan_core_wake`, in `clara._obo_plan_core`'s
-- shape MINUS the authority-instruction wall: the authority is recorded HONESTLY instead, as
-- `{kind:'agent_wake', wake_kind, task_id}` -- never dressed up as a person's instruction, and
-- `authorised_by`/`created_by` is `clara.agent_user_id()`, the estate's own "the agent wrote this"
-- idiom (0103:264, 0154's `proposed_by_agent`). Everything else the plan step does --
-- `clara._assert_plan_schedule`, `clara._assert_journal_basis`, the client advisory rung, the
-- overlap warning, the next-occurrences preview, the audit row -- is byte-identical in shape to the
-- human and OBO plan steps.
--
-- THE MULTIPLICITY KEY, carried forward from the retired core (0140:3618-3621, design close-key-1
-- Annex E): `clara._close_wake_ctx`'s op key is derived per (task, verb, CLIENT), so two source
-- entries amortised in ONE wake task would collide on ONE `clara._reserve_op(create_prepayment_
-- schedule, ...)` slot. The wrapper sub-keys by `p_op_key || ':' || p_source_entry`, exactly as the
-- retired core did.
--
-- THE TEMPLATE CORE IS RETIRED, 0282's OWN WAY (a typed refusal, kept present rather than dropped,
-- so a future reader who resolves it by name finds a sentence, not an absence). `clara._agent_
-- prepayment_schedule_core` -- now caller-less -- is recut to an unconditional refusal at its exact
-- pre-#1036 signature and ACL; `clara._propose_adjustment_template_core` is untouched (non-
-- regression pin below) and, once this file lands, has NO caller anywhere in the `clara` schema's
-- own text -- the tail measures that by scanning `pg_proc.prosrc`, not by trusting the two bodies
-- above to say so.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not widen `clara.accounting_plans.authority_kind` or touch `clara._authority_ref_
--     refusal`, `clara.create_accounting_plan`, `clara._obo_plan_core` or `clara._prepayment_plan_
--     core` -- the human and OBO plan lanes are pinned unconditionally below and take neither
--     branch this file adds.
--   · It does not change the roster gate, the expense-account wall, the term derivation or the
--     dedupe/idempotency machinery `clara._prepayment_schedule_core` already carries for every
--     lane -- `Out of scope: any change to the prepayment door's own rules` (the ticket's own
--     words). The 'wake' branch changes ONLY which function drafts the plan.
--   · It does not enable `clara.wake_engine_sources.close_prep` -- `Out of scope: enabling the
--     close_prep source on hosted` (the ticket's own words). The flag stays exactly as #927/#929
--     left it; this file only makes the path SAFE to enable, by giving it somewhere real to land.
--   · It does not write `clara.agent_act_receipts`. That table's F-A4 Tier-A/B/C rung discipline
--     belonged to the retired core; the 'wake' lane's refusals now RAISE, exactly as a human's or a
--     chat configuration's do (the ticket's own words: "the same validation... and refusals a
--     person's own creation gets"), and its idempotency rides `clara._reserve_op`/`clara._finish_
--     op`, the newer and stronger mechanism #915/#939/#940 already proved for this door.
--
-- ==================== THE PRESTATE PINS ARE PER BODY, NOT GLOBAL ====================
-- 0305/0306/0307/0308 state the reasoning in full and this file inherits it: each RECUT body admits
-- exactly TWO pre-images -- its measured live `sha256(prosrc)` (a fresh apply), or a body that
-- already carries this file's own `#1036` attribution (a redo) -- and anything else is real drift
-- and refuses BY NAME. Every UNCONDITIONAL neighbour pin is measured LIVE on `clara_l04` after 0308
-- (never copied from an earlier migration's header), because #939/#940/#915/#941 all recut bodies
-- this file relies on or sits beside.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md): every object here is a
-- `create or replace function`, and the file writes no row and no schema object at all.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file does no
                                        -- backfill and no bulk scan. It creates one function and
                                        -- replaces three.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t1036_pre$
declare
  v_sha text; v_src text; v_i int; v_modes text := '';
  v_recut text[][] := array[
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     'acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa'],
    ['clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     '143d4526bea145be8529b77c95a1438fb0753c17c11dc57e4f742edfd3130c9f'],
    ['clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)',
     '9be069dafd6884f9aed991e162bb64719d6e70d5841d11bb08011bbf8f7649c7']
  ];
  v_keep text[][] := array[
    ['clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)',
     'b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810'],
    ['clara._close_wake_ctx(text,text,uuid,text)',
     '5327c96be6ab4f930570c089e33cd8734bfae9a604f559ff02e9fa8959e9258e'],
    ['clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
     '266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a'],
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     'c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188'],
    ['clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     '62f909b7802faacf1d8b18e4040e9bf70f99ce344f7120bc35f37be7c0e54879'],
    ['clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)',
     '230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a'],
    ['clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)',
     'ce0b24fd9d46531722ed80e83915444817731ad759a4a2c36f2147064bcd0c78'],
    ['clara._assert_journal_basis(jsonb)',
     '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684'],
    ['clara._plan_overlap_warning(uuid,jsonb,uuid)',
     'c2566349405844d14c94ba57836ee9256878001f744ad627b0337ae5b8caf7dc'],
    ['clara._plan_due_events(date,text,text,integer,boolean,date,date,integer)',
     '66100718e518a0d587bab68dc63ffb5efb24f95b7d2b899cef3f55d3e3be3384'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1']
  ];
begin
  if to_regclass('clara.prepayment_schedules') is null then
    raise exception '#1036 prestate: clara.prepayment_schedules is absent -- 0223 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.accounting_plans') is null then
    raise exception '#1036 prestate: clara.accounting_plans is absent -- 0193 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is null then
    raise exception '#1036 prestate: wrapper 12 does not resolve -- 0140 must apply first'
      using errcode='CLR10';
  end if;

  for v_i in 1 .. array_length(v_recut, 1) loop
    if to_regprocedure(v_recut[v_i][1]) is null then
      raise exception '#1036 prestate: % does not resolve -- an earlier migration must apply first', v_recut[v_i][1]
        using errcode='CLR10';
    end if;
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha = v_recut[v_i][2] then
      v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('#1036' in v_src) > 0 then
      v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '#1036 prestate: % has DRIFTED -- it is neither its measured pre-image nor a body this file already recut, so re-derive the splice against the live text before applying (got %)',
        v_recut[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  for v_i in 1 .. array_length(v_keep, 1) loop
    if to_regprocedure(v_keep[v_i][1]) is null then
      raise exception '#1036 prestate: % is absent', v_keep[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '#1036 prestate: % has MOVED (got %) -- this file relies on its live shape; re-measure before applying',
        v_keep[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- THE ONE NEW FUNCTION IS BORN HERE. On a redo it already exists, stated rather than silently
  -- tolerated.
  select count(*)::int into v_i from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_prepayment_plan_core_wake';
  if v_i = 0 then
    raise notice '#1036 prestate: FIRST APPLY -- clara._prepayment_plan_core_wake does not exist yet. Recut modes: %', v_modes;
  else
    raise notice '#1036 prestate: REDO -- clara._prepayment_plan_core_wake already exists. Recut modes: %', v_modes;
  end if;

  -- THE RESIDUAL THIS FILE CLOSES, measured one more time before it is closed: exactly ONE function
  -- in the whole clara schema mentions the template core by name, and it is the agent core this
  -- file is about to retire.
  select count(*)::int into v_i from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ilike '%_propose_adjustment_template_core%';
  if v_i <> 1 then
    raise exception '#1036 prestate: % clara function(s) mention _propose_adjustment_template_core by name, not the expected 1 (clara._agent_prepayment_schedule_core) -- the residual this ticket closes has moved',
      v_i using errcode='CLR10';
  end if;
end
$t1036_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._prepayment_plan_core_wake — THE PLAN STEP THE WAKE LANE TAKES.
--
-- IN clara._obo_plan_core's SHAPE (0308), MINUS THE AUTHORITY-INSTRUCTION WALL. Everything from
-- the purpose check onward is the same rung order the human and OBO plan steps take; the ONE
-- structural difference is what precedes it -- a shape check on the wake's own honest authority
-- payload, never clara._authority_ref_refusal (see this file's header for why that wall cannot be
-- asked here at all).
--
-- UNGRANTED (the one-ungranted-core law, 0004:6-12), reachable only from clara._prepayment_
-- schedule_core's 'wake' branch.
-- =====================================================================================

create function clara._prepayment_plan_core_wake(
    p_firm uuid, p_client uuid, p_actor uuid, p_purpose text, p_authority_ref jsonb,
    p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date, p_basis jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_warning jsonb; v_next jsonb;
begin
  -- #1036 -- THE WAKE LANE'S OWN AUTHORITY SHAPE, asserted rather than assumed (law 2). An
  -- unattended close_prep wake names no person, so this core does not ask clara._authority_ref_
  -- refusal at all -- it records the authority HONESTLY: kind 'agent_wake', naming the wake_kind
  -- and the mechanically-bound task that drove it (clara._close_wake_ctx's own `task_id`), never a
  -- person's instruction and never dressed as one. Unreachable with a malformed payload from the
  -- one caller that exists (the wrapper always builds this object), so this is a construction
  -- invariant, checked rather than trusted.
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object'
     or p_authority_ref ->> 'kind' is distinct from 'agent_wake'
     or nullif(btrim(coalesce(p_authority_ref ->> 'wake_kind', '')), '') is null
     or nullif(btrim(coalesce(p_authority_ref ->> 'task_id', '')), '') is null then
    raise exception 'clara._prepayment_plan_core_wake: malformed wake authority reference'
      using errcode='CLR10',
        detail='{"reason":"authority_ref_invalid","constraint":"agent_wake_shape"}';
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule('amortisation_schedule', p_frequency, p_day_rule,
    p_day_of_month, p_timezone, p_effective_from, p_effective_to, null);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, 'amortisation_schedule', 'active', btrim(p_purpose),
      'explicit_instruction', p_authority_ref, p_actor, p_effective_from, 1, p_actor);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, 'amortisation_schedule', 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, false,
      null, p_actor)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, false,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  -- THE AUDIT ROW IS 0193'S OWN VERB with this file's `via`, exactly as 0222's and 0307's cores
  -- stamp their own: the audit trail says a plan was created and by WHICH entrance.
  perform clara._audit(p_firm, p_actor, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', 'amortisation_schedule',
      'revision', 1, 'authority', p_authority_ref, 'via', 'wake_establish_prepayment_schedule'));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', 'amortisation_schedule',
    'next_occurrences', coalesce(v_next,'[]'::jsonb), 'overlap_warning', v_warning);
end $$;
revoke all on function clara._prepayment_plan_core_wake(uuid,uuid,uuid,text,jsonb,text,text,int,text,date,date,jsonb) from public;
comment on function clara._prepayment_plan_core_wake(uuid,uuid,uuid,text,jsonb,text,text,int,text,date,date,jsonb) is
  '#1036: the amortisation plan step for the WAKE lane, in clara._obo_plan_core''s shape (0308) '
  'minus the person-instruction wall -- an unattended close_prep wake names no person, so the '
  'authority is recorded honestly as {kind:''agent_wake'',wake_kind,task_id} and clara._authority_'
  'ref_refusal is never asked. UNGRANTED: reached only from clara._prepayment_schedule_core''s '
  '''wake'' lane.';

-- =====================================================================================
-- §B — clara._prepayment_schedule_core — RECUT: A THIRD LANE, 'wake'.
--
-- THE SAME BODY #915/#939/#940 built, with EXACTLY two changes (diffed against the live pre-image
-- in this file's own report): the lane closed-set widens to admit 'wake', and the plan-step branch
-- gains one more arm calling clara._prepayment_plan_core_wake instead of clara.create_accounting_
-- plan / clara._prepayment_plan_core. Nothing else moved -- the purpose wall, the op reservation,
-- the duplicate check, the document/memo branch, #940's roster gate, 0042's shared negative wall,
-- the expense half, the allocation, the basis rung, the insert race and the audit are byte-for-byte
-- what the human and OBO lanes already ran.
-- =====================================================================================

create or replace function clara._prepayment_schedule_core(
    p_firm uuid, p_client uuid, p_actor uuid, p_lane text,
    p_source_entry uuid, p_expense_account text, p_expense_basis text, p_purpose text,
    p_authority_ref jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$

declare
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb; v_line jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_prepaid text; v_target text; v_basis_text text;
  v_acct record; v_breach jsonb; v_period record; v_doc uuid; v_entry record;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_existing uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
  -- #939 — the term provenance this door now CHOOSES rather than assumes.
  v_term_source text; v_sp_id uuid; v_st_id uuid; v_term_start date; v_term_end date;
  v_basis_kind text; v_legs int; v_leg record; v_fy record; v_st record;
begin
  -- #915 — THE LANE IS A CLOSED SET, and an unknown one RAISES rather than falling through to the
  -- OBO branch. Unreachable from either door (both pass a literal); a later lane that widens the
  -- set finds this line instead of a silent misroute.
  if p_lane is null or p_lane not in ('human', 'obo', 'wake') then
    raise exception 'clara._prepayment_schedule_core: unknown lane %', coalesce(p_lane, '(null)')
      using errcode='CLR10', detail='{"reason":"prepayment_lane_unknown"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a prepayment schedule needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;

  -- ---- THE RESERVATION, TAKEN BEFORE THE DUPLICATE CHECK, AND THE ORDER IS MEASURED. ----
  --
  -- A REPLAY OF THE SAME DECISION MUST WIN OVER "THAT PREPAYMENT ALREADY HAS A SCHEDULE". The
  -- first cut asked the duplicate question first and the two answers collided: a caller whose
  -- response was lost retried with the SAME op key and got CLR13 `prepayment_schedule_exists`
  -- instead of the schedule it had already created -- a lost response turned into a second
  -- question, which is the exact defect `_reserve_op` exists to prevent. Measured by
  -- `p653.schedule.one_per_entry` before this order was written.
  --
  -- THE PAYLOAD HASH IS OVER THE CALLER'S OWN ARGUMENTS ONLY, never over the derived allocation:
  -- the key identifies the DECISION a human made, and the term, the period count and the
  -- allocation are OUTPUTS of that decision. Hashing an output would make the same decision
  -- collide with itself whenever the document's term was corrected in between.
  --
  -- A REFUSAL BELOW COSTS NOTHING. Every raise from here on aborts the statement's transaction and
  -- takes this reservation row with it, so the caller may fix the input and retry under the SAME
  -- key. That is why validating after reserving is safe here even though 0193's own doors validate
  -- first -- and it is stated rather than left to be inferred.
  v_dedupe := clara._reserve_op(p_firm, 'create_prepayment_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'expense_account', nullif(btrim(coalesce(p_expense_account,'')),''),
      'expense_basis', nullif(btrim(coalesce(p_expense_basis,'')),''),
      'purpose', btrim(p_purpose), 'authority', p_authority_ref)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-schedule key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- ONE SCHEDULE PER RECOGNITION ENTRY. `uq_prepayment_schedules_source` is the structural
  -- backstop; this is the typed answer, and it names the schedule that already exists so the
  -- surface can send the caller there instead of offering a second configuration.
  select s.id into v_existing from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm;
  if v_existing is not null then
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- #939 — WHICH LANE IS THIS RECOGNITION ON? The door reads the entry ONCE and branches on
  -- the one fact that decides it: whether it binds a document. The absent/foreign case answers
  -- with v1's OWN token and sentence, so a caller cannot tell this recut from the body it
  -- replaced on that arm.
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;

  if v_entry.document_id is not null then
    -- ================= THE DOCUMENT LANE — UNCHANGED FROM 0223 =================
    -- THE FROZEN EVALUATOR. Reached as a DEFINER owned by its own owner role: it is a registered
    -- single-member `clara.evaluator_versions` closure AND a member of the rig's closed ungranted
    -- census, so minting a grant to reach it would red the rig and editing it would red the apply.
    -- Its refusals are RETURNED rather than raised, which is exactly why they can be re-raised here
    -- with their own payloads intact.
    v_sched := clara.prepayment_schedule_v1(p_client, p_source_entry);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
    end if;

    -- THE TERM CARRIER THE EVALUATOR ACTUALLY RODE, re-read here so the schedule row names the exact
    -- `clara.document_service_periods` row rather than "whatever is live at read time". A later
    -- correction supersedes that row; this schedule keeps naming the one it was derived from.
    v_doc := v_entry.document_id;
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis into v_period
      from clara.document_service_periods sp
     where sp.document_id = v_doc and sp.superseded_at is null;
    if v_period.id is null then
      -- Unreachable behind the evaluator's own `prepayment_term_underivable` arm; asserted rather
      -- than assumed, because a schedule row whose `service_period_id` were NULL would be a derived
      -- record that cannot say what it was derived from.
      raise exception 'no live service period is recorded for the document this entry binds'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'missing','document_service_periods','document_id', v_doc)::text;
    end if;
    v_term_source := 'document_service_period';
    v_sp_id       := v_period.id;
    v_st_id       := null;
    v_term_start  := v_period.period_start;
    v_term_end    := v_period.period_end;
    v_basis_kind  := v_period.basis_kind;
  else
    -- ================= #939 — THE MEMO-ONLY LANE =================
    -- (a) THE SOURCE MUST HAVE POSTED. v1's first arm, its token and its sentence verbatim.
    if v_entry.status <> 'approved' then
      raise exception 'a prepayment schedule amortises a POSTED entry; this one is %', v_entry.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text','a prepayment schedule amortises a POSTED entry; this one is ' || v_entry.status,
            'source_entry', p_source_entry, 'status', v_entry.status)::text;
    end if;
    -- (b) THE PREPAID-ASSET LEG must be UNAMBIGUOUS: exactly one debited asset line. Zero or many
    -- is a refusal, never a guess -- picking one of two candidate legs would be the surface
    -- choosing a number. v1's second arm, asked HERE because v2 reads no table.
    select count(*)::int into v_legs
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
    if v_legs <> 1 then
      raise exception '%', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end,
            'source_entry', p_source_entry, 'candidate_legs', v_legs)::text;
    end if;
    select jl.account_code, jl.debit_cents into v_leg
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';

    -- (c) THE TERM. This is the arm the whole ticket is about: before #939 the answer here was
    -- `prepayment_term_underivable` naming `journal_entries.document_id`, which told a firm its
    -- prepayment could never be amortised at all. It now names the CARRIER and the DOOR that
    -- fills it, so the person's next act is one call -- 0140's own "the refusal NAMES what to
    -- record and where", finally true for this lane too.
    select t.id, t.period_start, t.period_end into v_st
      from clara.prepayment_stated_terms t
     where t.source_entry_id = p_source_entry and t.superseded_at is null;
    if v_st.id is null then
      raise exception 'this recognition binds no document and nobody has stated its service period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','this recognition binds no document and nobody has stated its service period',
            'missing','prepayment_stated_terms',
            'remedy','clara.record_prepayment_stated_term',
            'source_entry', p_source_entry)::text;
    end if;

    -- (d) THE FY ARM. v1's third arm, and it is a SELF-HEALABLE state rather than a dead end: the
    -- successor year can be opened and the call retried.
    select fy.id, fy.starts_on, fy.ends_on into v_fy
      from clara.fiscal_years fy
     where fy.client_id = p_client
       and v_entry.posting_date between fy.starts_on and fy.ends_on;
    if v_fy.id is null then
      raise exception 'the source entry does not sit inside any opened fiscal year for this client'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the source entry does not sit inside any opened fiscal year for this client',
            'missing','fiscal_years','source_entry', p_source_entry)::text;
    end if;
    if v_st.period_end > v_fy.ends_on
       and not exists (select 1 from clara.fiscal_years nx
                        where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                          and nx.status in ('open', 'reopened')) then
      raise exception 'the term runs past this fiscal year and no successor year is open yet'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the term runs past this fiscal year and no successor year is open yet',
            'missing','fiscal_years.successor','fy_ends_on', v_fy.ends_on,
            'period_end', v_st.period_end, 'source_entry', p_source_entry)::text;
    end if;

    -- (e) THE SECOND EVALUATOR, with the leg and the term this door just picked. A prepaid ASSET
    -- is released by CREDIT, which is why the side is stated here rather than defaulted there.
    v_sched := clara.prepayment_schedule_v2(v_leg.debit_cents, v_leg.account_code, 'credit',
      v_st.period_start, v_st.period_end);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
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

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;
  -- v1 names the released leg `prepaid_account_code`; v2 names it `release_account_code`, because
  -- the leg it releases may be a liability. ONE local either way.
  v_prepaid := coalesce(v_sched ->> 'prepaid_account_code', v_sched ->> 'release_account_code');

  -- ---- #940 — THE ROSTER IS ASKED FIRST, AND THE WALL AFTERWARDS. ----
  --
  -- WHAT THIS CLOSES, and it is 0223's own carried-forward note rather than a new worry. The wall
  -- below is NEGATIVE — is this leg ineligible? — so an ordinary asset account with no class, no
  -- bank stamp and no reserved role passes it, on BOTH lanes. A utility deposit, an inventory
  -- purchase and a prepaid tax all satisfy every predicate this door had, and each one could be
  -- amortised into expense for a whole stated term with every entry balanced and every period
  -- receipted. The missing half was a POSITIVE statement that this account holds prepayments, and
  -- 0306 carries it: a per-client roster, enrolled by a bookkeeper with a stated reason.
  --
  -- WHY THE ORDER IS ROSTER-THEN-WALL (the brief's own words, and owner decision 6 behind them).
  -- Every reason an account can NEVER be enrolled — unknown, inactive, control-class, bank-bound,
  -- reserved by the fixed-asset or staff-advance roster — is answered at the ENROLMENT door, with
  -- a stated reason, where the person is deciding about the account. Here the person is amortising
  -- a prepayment, and the one useful answer is "this account is not on the roster; here is where
  -- to put it". So an account that fails both is told about the roster, and the wall still guards
  -- the accounts the roster admits (an account enrolled while eligible can be bound as a bank
  -- account the next day).
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit` WITH A NEW AXIS. The brief's line is "its
  -- ineligibility refusal gains a not-enrolled axis that names the roster panel" — one axis, not a
  -- second vocabulary, so every surface already rendering this refusal renders this one.
  --
  -- ONE SPELLING, THREE CALLERS. `clara._prepayment_account_enrolled` is the same predicate §G's
  -- arm B asks, so the band can never advertise a recognition this door would refuse; #915's OBO
  -- twin and #941's deferred-revenue mirror ask it too, with their own purpose.
  --
  -- #915 — AND THE TWIN NOW ASKS IT BY BEING HERE. The OBO door does not copy these five lines: it
  -- calls this core, so the roster question, its order relative to the shared wall, its token, its
  -- axis, its remedy and its panel are ONE body for both entrances. The brief's "whichever of #915
  -- and #940 lands second carries the check into the other's door" is discharged by having no
  -- second door to carry it into.
  --
  -- A SCHEDULE ALREADY RUNNING IS NEVER RE-CHECKED (owner decision 3). This call is the only place
  -- a NEW schedule is born; nothing on the plan lane's monthly admission path asks the roster, so
  -- retiring an account closes the future and leaves the past posting to term end.
  if not clara._prepayment_account_enrolled(p_client, v_prepaid, 'prepayment') then
    raise exception 'account % is not enrolled as a prepayment account for this client', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','account ' || v_prepaid || ' is not enrolled as a prepayment account for this client',
          'axis','prepaid_account_not_enrolled', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;

  -- ---- THE PREPAID LEG IS JUDGED TOO, BY THE ESTATE'S OWN RULE. ----
  --
  -- WHY THIS WALL EXISTS AT ALL, and it is the finding a review measured rather than a precaution.
  -- `clara.prepayment_schedule_v1` takes "the one debited asset leg" VERBATIM (0140:1046-1064) and
  -- never asks WHICH asset. Its whole predicate -- approved, binds a document, debits exactly one
  -- asset line -- is satisfied by every ordinary sales invoice (Dr trade receivables), every
  -- documented bank receipt and every fixed-asset purchase. Without this the door would accept a
  -- RECEIVABLE as a prepayment and post Dr expense / Cr receivable every month for the whole
  -- stated term, and §E's arm B would ADVERTISE those entries as "posted, not yet amortised" with
  -- a "configure the schedule" action beside them. Measured on the rig: a document-bound
  -- Dr-374-C56 invoice was accepted and its schedule credited the control account.
  --
  -- IT IS THE SAME HELPER THE EXPENSE HALF ALREADY USES (0042:643) -- `account_class is not null`
  -- (a control account), `is_bank_account` / `clara.bank_accounts`, `is_active`, and the FA
  -- role-reservation census -- so this is the estate's OWN existing eligibility rule applied to a
  -- second leg, never a second rule written here. The line is shaped as a CREDIT because that is
  -- the side every period will actually post against this account.
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit`, because that is exactly what this says: the
  -- SOURCE entry is not fit to be amortised. No new vocabulary; the web mirror and the chat-lane
  -- mirror already carry it, and `axis` says which leg so a surface can name it.
  --
  -- WHAT THIS DOES NOT CLOSE, stated rather than implied: an ordinary asset account with no class,
  -- no bank stamp and no reserved role still passes -- the wall is NEGATIVE (is this leg
  -- ineligible?) and not a POSITIVE prepayment-class roster. A roster would need a chart-level
  -- classification this estate does not carry; it is named as a follow-up rather than invented.
  --
  -- #939: it guards BOTH lanes, because it is asked AFTER the branch on the leg either lane picked.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_prepaid,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % holds this entry''s debited asset, and it cannot carry a prepayment', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'axis','prepaid_account_ineligible', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry, 'breach', v_breach)::text;
  end if;

  -- THE SIX DERIVED SCHEDULE FIELDS, every one read off the evaluator's own output: the cadence is
  -- monthly / last-day-of-month because the evaluator emits whole calendar months, the window opens
  -- on the FIRST line's `period_end` and closes on the LAST line's, `day_of_month` and
  -- `reversal_day_rule` are absent. None of them is a parameter of this door.
  v_from    := (v_lines -> 0 ->> 'period_end')::date;
  v_to      := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base    := (v_lines -> 0 ->> 'credit_cents')::bigint;

  -- ---- THE EXPENSE HALF, RE-DERIVED. 0140's three tokens, 0042's helper, no new vocabulary. ----
  v_target := nullif(btrim(coalesce(p_expense_account, '')), '');
  if v_target is null then
    -- The no-plausible-account arm, NOT a default path (0140:3455-3462): a lane that refused
    -- whenever it was unsure of a classification would never charge anything.
    raise exception 'no expense account was proposed for the amortisation charge'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"account_missing"}';
  end if;
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_target;
  if v_acct.account_code is null then
    raise exception 'this client''s chart holds no account %', v_target using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','account_unknown',
        'account_code', v_target)::text;
  end if;
  if v_acct.account_type <> 'expense' then
    -- An amortisation charge is an expense. A balance-sheet target would move the prepayment
    -- sideways and never charge it (0140:3474-3480).
    raise exception 'account % is a % account; an amortisation charge is an expense', v_target, v_acct.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','not_expense_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type)::text;
  end if;
  -- THE SAME HELPER THE PROPOSE DOOR AND THE POSTER ALREADY USE, so a bank-class, control,
  -- inactive or role-reserved account refuses by the estate's OWN existing rule rather than a
  -- second one written here.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % cannot carry an amortisation charge', v_target using errcode='CLR10',
      detail=(jsonb_build_object('reason','prepayment_target_ineligible') || v_breach)::text;
  end if;
  v_basis_text := nullif(btrim(coalesce(p_expense_basis, '')), '');
  if v_basis_text is null then
    -- A judgement with NO RECORDED BASIS is what this wall exists to prevent (0140:3489-3495):
    -- refuse rather than record an unexplained classification.
    raise exception 'the expense account was proposed without its stated grounds'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"basis_missing"}';
  end if;

  -- ---- THE PAIRED ALLOCATION. The evaluator's line VERBATIM plus this lane's own pairing. ----
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'credit_cents')::bigint,
           'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code));
  end loop;

  -- ---- THE PROPOSAL, THROUGH THE SHARED PREDICATE. ----
  v_memo := 'Prepayment amortisation: ' || btrim(p_purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'amortisation charge'),
      jsonb_build_object('account_code', v_prepaid, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'prepaid release')));
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
    -- C3 (0140:3505-3523), RESTATED AS THE SHARED PREDICATE'S OWN ANSWER. One cent over two months
    -- truncates to a base of 0, so the first period's derived basis moves no money and
    -- `clara._assert_journal_basis` refuses it. That raw refusal is correct but not actionable, so
    -- it becomes F-A4's typed rung -- carrying the predicate's OWN constraint and naming it as the
    -- owner, so a reader can see this door routed through it rather than inventing a second check.
    --
    -- MEASURED, not assumed: an all-zero balanced basis is refused by 0178's PER-LINE
    -- `exactly_one_side` arm (`0178:771-775`), which fires BEFORE its `nonzero_total` arm
    -- (`0178:785-787`) can ever be reached -- every line that survives the per-line arm carries
    -- exactly one POSITIVE side, so the debit total can never be zero. C08.2's owner is confirmed
    -- to be this predicate; the arm that actually answers is `exactly_one_side`, and that is a
    -- finding about 0178 rather than about this door. The constraint is therefore CARRIED THROUGH
    -- from whatever 0178 raised rather than asserted here to be any particular word.
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'this term charges nothing in at least one period: % cents over % periods truncates to a base of 0', v_total, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PLAN. Through 0193's OWN door, so the authority resolution, the schedule assertion,
  -- the basis predicate, the overlap warning and the audit row are all its, not a second copy. ----
  --
  -- #915 — AND THROUGH `clara._prepayment_plan_core` ON THE OBO LANE, FOR A MEASURED REASON.
  -- `clara.create_accounting_plan` resolves its actor through `clara._human_ctx` ->
  -- `clara.jwt_sub()` (0193, 0004:299-308), and a `clara_runtime` connection carries no
  -- `request.jwt.claims` at all, so nesting it here would raise CLR04 `no authenticated actor` on
  -- EVERY OBO call — the exact reason `clara.create_accrual_adjustment_for` (0222) nests
  -- `clara._accrual_plan_core` instead of 0193's door. The two steps write the SAME plan row, the
  -- SAME first revision, the same overlap warning and the same audit line, and §A asks
  -- `clara._authority_ref_refusal` — 0250's ONE definition — so the two lanes cannot drift on the
  -- one judgement that matters here: whether the instruction cited is a PERSON'S.
  --
  -- THE ONE DELIBERATE DIFFERENCE, stated rather than left to be found: the human lane additionally
  -- holds the nested `op_key || ':plan'` reservation 0193's own door takes, and the OBO lane does
  -- not. It costs the OBO lane nothing — the outer `create_prepayment_schedule` key already covers
  -- the whole configuration, and a second reservation under a DERIVED key would only be reachable
  -- by a caller that could name it, which no runtime caller can.
  if p_lane = 'human' then
    v_plan := clara.create_accounting_plan(
      p_client => p_client, p_kind => 'amortisation_schedule', p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  elsif p_lane = 'obo' then
    v_plan := clara._prepayment_plan_core(
      p_firm => p_firm, p_client => p_client, p_author => p_actor, p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis);
  else
    -- #1036 -- THE WAKE LANE. An unattended close_prep wake names no person (0138:827-830), so the
    -- plan step runs through clara._prepayment_plan_core_wake, which records the authority
    -- HONESTLY (kind 'agent_wake') and never asks clara._authority_ref_refusal -- that wall exists
    -- precisely to stop an unattended run from authorising its own schedule (0307 sec A /
    -- clara._obo_plan_core), and this lane IS that caller, by construction, not by omission.
    v_plan := clara._prepayment_plan_core_wake(
      p_firm => p_firm, p_client => p_client, p_actor => p_actor, p_purpose => btrim(p_purpose),
      p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis);
  end if;
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1, taken here too although this door reaches no `clara.accounting_work`: the
  -- plan row is the lane's first rung (0193:253-262) and a writer that took the schedule row first
  -- would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  -- #939 — THE EVALUATOR VERSION ROW THIS SCHEDULE ACTUALLY RODE, resolved by the entrypoint
  -- signature of the evaluator the branch above chose rather than by a literal.
  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = case when v_term_source = 'human_stated'
       then 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
       else 'clara.prepayment_schedule_v1(uuid,uuid)' end
   order by e.version desc limit 1;

  -- THE STRUCTURAL BACKSTOP ANSWERS IN THE LANE'S OWN WORDS. The typed duplicate check above
  -- cannot see a WINNER THAT HAS NOT COMMITTED: two people configuring the same recognition at
  -- once both pass it, and the loser queues on `uq_prepayment_schedules_source` until the winner
  -- commits. Before this block that loser was answered a bare 23505 -- `duplicate key value
  -- violates unique constraint "uq_prepayment_schedules_source"` -- a sentence with no next act,
  -- which no surface has a case for. MEASURED by `p653.schedule.duplicate_race` behind a real lock
  -- barrier. The index is still the authority; this only re-reads the winning row and re-raises the
  -- SAME CLR13 payload the pre-check raises, so both paths are one answer.
  begin
    insert into clara.prepayment_schedules(firm_id, client_id, plan_id, plan_kind, revision,
        source_entry_id, prepaid_account_code, expense_account_code, expense_account_basis,
        service_period_id, document_id, term_start, term_end, basis_kind, period_lines,
        total_cents, period_count, remainder_placement, schedule_version, evaluator_version_id,
        created_by, term_source, stated_term_id)
      values (p_firm, p_client, v_plan_id, 'amortisation_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_prepaid, v_acct.account_code, v_basis_text,
        v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        coalesce(v_sched ->> 'schedule_version', 'v1'), v_eval, p_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    -- The read runs in the OUTER transaction, after the failed subtransaction rolled back, so the
    -- winner is visible by now. `v_existing` may still be null if some OTHER unique index fired --
    -- in which case the payload says so by carrying a null schedule_id rather than pretending.
    select s.id into v_existing from clara.prepayment_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = p_firm;
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(p_firm, p_actor, null, null, 'create_prepayment_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_sp_id,
      'term_source', v_term_source, 'stated_term', v_st_id,
      'expense_account', v_acct.account_code, 'periods', v_n, 'total_cents', v_total,
      'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'amortisation_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'basis_kind', v_basis_kind,
    -- #939 — WHERE THE TERM CAME FROM, in the door's own answer, so a surface never has to infer
    -- it from the absence of a document id.
    'term_source', v_term_source, 'stated_term_id', v_st_id,
    'term_start', to_char(v_term_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_term_end, 'YYYY-MM-DD'),
    'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code,
    'expense_account_basis', v_basis_text,
    'total_cents', v_total, 'period_count', v_n,
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v1'),
    'period_lines', v_paired,
    -- THE DERIVED CADENCE, echoed so the caller can SEE that none of it was theirs to choose.
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    -- THE BOUNDARY, IN THE DOOR'S OWN ANSWER (AC4). Accepted configuration is not a posted
    -- occurrence, and recognition + configuration in ONE commit is unbuildable on v1 because the
    -- evaluator refuses a source entry that has not posted.
    'configuration_only', true);
  return clara._finish_op(p_firm, 'create_prepayment_schedule', p_op_key, v_result);
end 
$$;

-- =====================================================================================
-- §C — clara.wake_establish_prepayment_schedule — RECUT: THE REROUTE ITSELF.
--
-- SAME NAME, SAME SEVEN ARGUMENTS, SAME ACL (clara_fn_owner + clara_wake_interactive; unchanged --
-- the ticket's own words: "the wake allowlist row for the door is unchanged"). The new body carries
-- NO DML text of its own, exactly as 0140's original comment required of every wrapper: it names
-- itself in its clara._close_wake_ctx call and delegates.
-- =====================================================================================

create or replace function clara.wake_establish_prepayment_schedule(p_client uuid, p_source_entry uuid,
    p_target_account text, p_target_basis text, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $wake$
declare v_ctx jsonb; v_purpose text; v_authority jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_establish_prepayment_schedule', 'client', p_client, p_op_key);

  -- #1036 -- p_rationale DOUBLES AS THE PLAN'S PURPOSE: the shared core's own purpose wall (below,
  -- inside clara._prepayment_schedule_core) needs something non-blank, and the model's stated
  -- rationale for amortising this recognition is exactly that sentence -- refused by the CORE's own
  -- wall, never duplicated here. p_model is accepted for signature stability (the ticket keeps this
  -- door's name and arguments unchanged) and carries nothing this lane still reads: the request-
  -- digest/receipt machinery that once consumed it belonged to the retired agent core.
  v_purpose := nullif(btrim(coalesce(p_rationale, '')), '');

  -- THE AUTHORITY IS RECORDED HONESTLY, never as a person's instruction (this file's header
  -- explains why clara._obo_plan_core cannot be asked here at all).
  v_authority := jsonb_build_object('kind', 'agent_wake', 'wake_kind', v_ctx ->> 'wake_kind',
    'task_id', v_ctx ->> 'task_id');

  -- THE SUB-KEY, the retired core's own idiom (0140:3618-3621): clara._close_wake_ctx derives its
  -- key per (task, verb, CLIENT), so two source entries amortised in ONE wake task would otherwise
  -- collide on ONE clara._reserve_op(create_prepayment_schedule, ...) slot.
  return clara._prepayment_schedule_core(p_firm => (v_ctx ->> 'firm_id')::uuid,
    p_client => p_client, p_actor => clara.agent_user_id(), p_lane => 'wake',
    p_source_entry => p_source_entry, p_expense_account => p_target_account,
    p_expense_basis => p_target_basis, p_purpose => v_purpose, p_authority_ref => v_authority,
    p_op_key => p_op_key || ':' || p_source_entry::text);
end $wake$;

comment on function clara.wake_establish_prepayment_schedule(uuid, uuid, text, text, text, jsonb, text) is
  '#1036: wrapper 12, REROUTED. Reaches clara._prepayment_schedule_core''s ''wake'' lane and lands '
  'in clara.prepayment_schedules -- the same durable record a person''s own configuration does -- '
  'with the same roster gate, expense-account wall, term derivation and op-key idempotency. Never '
  'reaches clara._agent_prepayment_schedule_core or clara._propose_adjustment_template_core again '
  '(both retired as this door''s callers). DRAFT-ONLY BY CONSTRUCTION: configuration_only=true, '
  'exactly like the human and chat entrances.';

-- =====================================================================================
-- §D — clara._agent_prepayment_schedule_core — RETIRED, 0282's OWN WAY.
--
-- KEPT PRESENT, at its exact pre-#1036 signature and ACL (ungranted, clara_fn_owner only), so
-- nothing that once resolved it now finds it absent. An unconditional refusal is #927's own
-- precedent for a retired body with no live caller (0282's three human doors), applied here to an
-- internal core rather than an application-facing door.
-- =====================================================================================

create or replace function clara._agent_prepayment_schedule_core(p_ctx jsonb, p_client uuid,
    p_source_entry uuid, p_target_account text, p_target_basis text, p_rationale text,
    p_model jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $agent$
begin
  -- #1036 -- RETIRED. clara.wake_establish_prepayment_schedule no longer calls this core; it
  -- delegates to clara._prepayment_schedule_core's 'wake' lane instead, which lands in
  -- clara.prepayment_schedules rather than proposing a row on the retired 0045 template lane. The
  -- template lane's own extracted core is UNTOUCHED by this file and, once this migration applies,
  -- has no remaining caller anywhere in the clara schema's own text (see the tail's own census).
  raise exception 'this agent core is retired; wake_establish_prepayment_schedule no longer calls it (#1036)'
    using errcode='CLR10', detail='{"reason":"prepayment_agent_core_retired"}';
end $agent$;

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- =====================================================================================
do $t1036_tail$
declare
  v_n int; v_sig text; v_src text; v_sha text; v_acl text;
  v_expect text[] := array[
    'clara._prepayment_plan_core_wake(uuid,uuid,uuid,text,jsonb,text,text,int,text,date,date,jsonb)',
    'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
    'clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
    'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)'
  ];
  v_keep text[][] := array[
    ['clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)',
     'b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810'],
    ['clara._close_wake_ctx(text,text,uuid,text)',
     '5327c96be6ab4f930570c089e33cd8734bfae9a604f559ff02e9fa8959e9258e'],
    ['clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
     '266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a'],
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     'c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188'],
    ['clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     '62f909b7802faacf1d8b18e4040e9bf70f99ce344f7120bc35f37be7c0e54879'],
    ['clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)',
     '230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a'],
    ['clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)',
     'ce0b24fd9d46531722ed80e83915444817731ad759a4a2c36f2147064bcd0c78'],
    ['clara._assert_journal_basis(jsonb)',
     '2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684'],
    ['clara._plan_overlap_warning(uuid,jsonb,uuid)',
     'c2566349405844d14c94ba57836ee9256878001f744ad627b0337ae5b8caf7dc'],
    ['clara._plan_due_events(date,text,text,integer,boolean,date,date,integer)',
     '66100718e518a0d587bab68dc63ffb5efb24f95b7d2b899cef3f55d3e3be3384'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1']
  ];
begin
  -- 1 · THE FOUR TOUCHED/NEW FUNCTIONS RESOLVE AT THEIR EXACT SIGNATURES, this estate's posture:
  --     owned by clara_fn_owner, SECURITY DEFINER, search_path pinned.
  foreach v_sig in array v_expect loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1036 tail: % does not resolve at its exact signature', v_sig using errcode='CLR10';
    end if;
    if not exists (select 1 from pg_proc p
        where p.oid = v_sig::regprocedure and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
          and p.prosecdef = true
          and coalesce(array_to_string(p.proconfig,','),'') = 'search_path=clara, pg_temp') then
      raise exception '#1036 tail: % lost its posture (owner/definer/search_path)', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 2 · ACL, POSITIVE BOTH WAYS. The wrapper keeps EXACTLY its two grants; the three internals hold
  --     no application grant at all.
  select coalesce(array_to_string(p.proacl::text[],'|'),'(default)') into v_acl
    from pg_proc p where p.oid = 'clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure;
  if v_acl !~ 'clara_wake_interactive=X/clara_fn_owner' then
    raise exception '#1036 tail: wake_establish_prepayment_schedule lost its clara_wake_interactive grant (%)', v_acl using errcode='CLR10';
  end if;
  if v_acl ~ 'clara_runtime=|clara_agent_ro=|clara_wake_proactive=|clara_authenticated=' then
    raise exception '#1036 tail: wake_establish_prepayment_schedule gained a grant it must not hold (%)', v_acl using errcode='CLR10';
  end if;
  foreach v_sig in array array[
      'clara._prepayment_plan_core_wake(uuid,uuid,uuid,text,jsonb,text,text,int,text,date,date,jsonb)',
      'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
      'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)'] loop
    select coalesce(array_to_string(p.proacl::text[],'|'),'(default)') into v_acl
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_acl <> 'clara_fn_owner=X/clara_fn_owner' then
      raise exception '#1036 tail: % holds an application grant (%) -- the one-ungranted-core law', v_sig, v_acl using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE LANE'S SIGNATURE COUNT IS UNCHANGED -- exactly one clara._prepayment_schedule_core and
  --     one clara.wake_establish_prepayment_schedule, never a second overload from a mistyped
  --     CREATE OR REPLACE.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_prepayment_schedule_core';
  if v_n <> 1 then
    raise exception '#1036 tail: clara._prepayment_schedule_core resolves at % signatures, not 1', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='wake_establish_prepayment_schedule';
  if v_n <> 1 then
    raise exception '#1036 tail: clara.wake_establish_prepayment_schedule resolves at % signatures, not 1', v_n using errcode='CLR10';
  end if;

  -- 4 · THE REROUTE, BY TEXT. The wrapper reaches the shared core and no longer reaches the retired
  --     agent core or the template core; the retired agent core no longer reaches the template core
  --     either.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure;
  if position('_prepayment_schedule_core' in v_src) = 0 then
    raise exception '#1036 tail: the wrapper does not call clara._prepayment_schedule_core' using errcode='CLR10';
  end if;
  if position('_agent_prepayment_schedule_core' in v_src) > 0
     or position('adjustment_templates' in v_src) > 0
     or position('_propose_adjustment_template_core' in v_src) > 0 then
    raise exception '#1036 tail: the wrapper still mentions the retired agent/template lane' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)'::regprocedure;
  if position('_propose_adjustment_template_core' in v_src) > 0 then
    raise exception '#1036 tail: the retired agent core still mentions the template core' using errcode='CLR10';
  end if;

  -- 5 · THE RESIDUAL IS CLOSED: NO function anywhere in clara mentions the template core by name.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.prosrc ilike '%_propose_adjustment_template_core%';
  if v_n <> 0 then
    raise exception '#1036 tail: % clara function(s) still mention _propose_adjustment_template_core by name -- it must have NO caller', v_n using errcode='CLR10';
  end if;

  -- 6 · THE TEMPLATE CORE ITSELF IS BYTE-UNCHANGED (non-regression) and still executable by no
  --     application role -- this file never touches it, and the tail proves that rather than
  --     assuming it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha,
         coalesce(array_to_string(p.proacl::text[],'|'),'(default)') as acl
    into v_sha, v_acl
    from pg_proc p
   where p.oid = 'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)'::regprocedure;
  if v_sha <> 'b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810' then
    raise exception '#1036 tail: clara._propose_adjustment_template_core MOVED (got %) -- this file must never touch it', v_sha using errcode='CLR10';
  end if;
  if v_acl <> 'clara_fn_owner=X/clara_fn_owner' then
    raise exception '#1036 tail: clara._propose_adjustment_template_core holds an application grant (%)', v_acl using errcode='CLR10';
  end if;

  -- 7 · THE WAKE ALLOWLIST ROW IS UNCHANGED -- still thirteen close_prep rows, still exactly one
  --     naming this function, exactly as #915's own AC5 census expected of this ticket.
  select count(*)::int into v_n from clara.wake_fn_allowlist where wake_kind='close_prep';
  if v_n <> 13 then
    raise exception '#1036 tail: the close_prep allowlist has % rows, not thirteen -- this file must not touch it', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where wake_kind='close_prep' and function_name='wake_establish_prepayment_schedule';
  if v_n <> 1 then
    raise exception '#1036 tail: the close_prep allowlist does not name wake_establish_prepayment_schedule exactly once (%)', v_n using errcode='CLR10';
  end if;

  -- 8 · EVERY UNCONDITIONAL NEIGHBOUR IS BYTE-UNCHANGED.
  for v_n in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_n][1]::regprocedure;
    if v_sha is distinct from v_keep[v_n][2] then
      raise exception '#1036 tail: % MOVED (got %) -- it was pinned unconditionally', v_keep[v_n][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  raise notice '#1036 tail: OK -- wrapper 12 reroutes to clara._prepayment_schedule_core''s new ''wake'' lane through clara._prepayment_plan_core_wake, keeps its exact signature/ACL (clara_wake_interactive only), and the close_prep allowlist is untouched at thirteen rows. clara._agent_prepayment_schedule_core is retired to an unconditional refusal at its pre-#1036 signature/ACL. clara._propose_adjustment_template_core is byte-unchanged, still ungranted, and now has ZERO callers anywhere in the clara schema''s own text -- the residual plan-overlap-template-arm-retired.test.mjs''s p929.containment cell pinned is closed. Eleven unconditional neighbours (the human and OBO plan lanes, both prepayment doors, the wake ctx ladder and the five plan-writing helpers) are byte-identical to their measured pre-images.';
end
$t1036_tail$;
