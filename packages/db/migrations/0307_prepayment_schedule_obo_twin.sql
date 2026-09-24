-- 0307_prepayment_schedule_obo_twin — #915 (riders wave 4, lane 04): #653's CHAT ENTRANCE STOPS AT
-- A GRANT WALL — `clara.create_prepayment_schedule` HAS NO `clara_runtime` TWIN.
-- =====================================================================================
-- Spec of record: issue #915's Agent Brief, as amended by its 2026-09-18 cross-reference comment
-- (#940's roster is asked by this door too) and its newest comment (the shared successor cut is
-- `chatTurn_v22` / `claraWork_v6`, not the v21/v5 pair that shipped without this ticket).
--
-- THE GAP THIS CLOSES, measured rather than recalled. 0223 grants `clara.create_prepayment_schedule`
-- to `clara_authenticated` ALONE and fronts it with `clara._human_ctx` at the bookkeeper rank; it
-- defines no `_for` twin, and the three reads are `clara_authenticated`-only. The runtime pool runs
-- as `clara_runtime` and carries no JWT, so the chat tool and the Work term-park contract written
-- in `packages/runtime/lib/prepayment-schedule-basis.ts` could only ever return a grant refusal —
-- which is why that module is still outside every frozen closure, and why `docs/PRD.md`'s chat
-- entrance line for prepayment amortisation is not yet true.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. An actor-explicit OBO twin
-- `clara.create_prepayment_schedule_for` in `clara.create_accrual_adjustment_for`'s shape
-- (`clara_runtime` only, the initiator named in an ARGUMENT and re-checked LIVE against this firm's
-- memberships, the human door's own `_reserve_op` key space) and one narrow machine-lane read of
-- the RECORDED TERM, `clara.read_prepayment_source_for` — and, so that the twin cannot drift from
-- the door it twins, it EXTRACTS the human door's whole body into one shared core that both
-- entrances call.
--
-- WHY A SHARED CORE RATHER THAN A SECOND BODY, and this is the one place this file departs from
-- 0222's precedent. The accrual pair duplicates ~60 lines of validation across its two doors and
-- has already drifted once: `clara._accrual_plan_core` still resolves authority with 0222's own
-- `exists` probes while `clara.create_accounting_plan` was narrowed by #977/0250 to refuse an
-- instruction that is not a PERSON's. The prepayment door's body is ~500 lines — the branch on the
-- term carrier, the roster gate, the shared negative wall, the expense half, the allocation, the
-- basis rung, the plan, the insert race and the audit — and this ticket's own acceptance criterion
-- is literally "the twin's refusal vocabulary matches the human door's for every shared rule". Two
-- copies of that body would make that criterion a promise; one body makes it a fact. So:
--
--   clara.create_prepayment_schedule      (unchanged signature, unchanged ACL, unchanged behaviour)
--     -> op key, clara._human_ctx(bookkeeper), the client ladder, then the CORE with lane 'human'
--   clara.create_prepayment_schedule_for  (new, clara_runtime only)
--     -> op key, the client ladder, the LIVE-AUTHORITY recheck of the named author, then the CORE
--        with lane 'obo'
--   clara._prepayment_schedule_core       (new, granted to NOBODY — the one-ungranted-core law)
--     -> everything from the purpose check and the op reservation onward, byte for byte what the
--        human door did before this file, with ONE branch: which plan step it takes.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--   · It does not widen `clara.create_prepayment_schedule`'s ACL. `clara_runtime` still cannot
--     execute it — an OBO call must name its human, and a runtime grant on the human door would be
--     a configuration with no named author at all. 0306's tail asserted that ("human-only until
--     #915") and this file keeps it true by adding a door rather than a grant.
--   · It grants the agent role and both wake roles NOTHING. The legacy
--     `clara.wake_establish_prepayment_schedule` (the template lane, wake source asserted disabled)
--     is untouched; #1036 is the ticket that reroutes it onto this door, and it lands after this
--     file in this same lane.
--   · It opens NO agent path to recording a service period or to enrolling a prepayment account.
--     Both are human doors with no wake wrapper, by hard constraint 2 and owner decision 4, and
--     this file adds neither a twin nor a read that could stand in for one.
--   · It reads NO document bytes. The machine-lane read returns the RECORDED term — the human's own
--     stated period, its basis kind and the text of the grounds they gave — and the byte door stays
--     0190's, unreachable from here.
--
-- ==================== THE PRESTATE PINS ARE PER BODY, NOT GLOBAL ====================
-- 0305 (#939) states the reasoning in full and 0306 (#940) inherits it; so does this file. The ONE
-- recut body admits exactly TWO pre-images — its measured live `sha256(prosrc)`, or a body that
-- already carries this file's own `#915` attribution — and anything else is real drift and refuses
-- BY NAME. The mode it was found in is reported in the notice. Two sibling tickets of this lane
-- (#941, #1036) recut or read some of the same bodies immediately after this file.
--
-- REDO-SAFE BY CONSTRUCTION (#957, packages/db/README.md): every object here is a
-- `create or replace function`, and the file writes no row and no schema object at all.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file does no
                                        -- backfill and no bulk scan. It creates four functions and
                                        -- replaces one.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t915_pre$
declare
  v_sha text; v_src text; v_i int; v_modes text := '';
  -- THE ONE BODY THIS FILE RECUTS, pinned by its sha256(prosrc) MEASURED ON THIS RIG after 0306
  -- (rule: pin what is LIVE, never a literal copied from an older migration's text).
  v_recut text[][] := array[
    ['clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     '446a8dcd060ca7e274012e7a15baa6f5c54e912ee7c53633748adc26b88340b0']
  ];
  -- …AND THE SIX NEIGHBOURS THIS FILE RELIES ON AND MUST NOT MOVE. The extracted core carries the
  -- calls to all six verbatim, so each one is part of this file's contract even though it edits
  -- none of them. Pinned UNCONDITIONALLY — there is no redo branch, because this file never touches
  -- them in either mode, so a changed sha is always a finding.
  --
  --   · clara.create_accounting_plan  — the HUMAN lane's plan step. §A deliberately does NOT call
  --     it (it needs a JWT), so a change to it is a change to one lane only, and this pin is what
  --     makes that visible instead of silent.
  --   · clara._authority_ref_refusal  — 0250/#977's ONE definition of "a person's instruction",
  --     which §A asks so the OBO lane answers exactly what 0193's door answers.
  --   · clara._prepayment_account_enrolled — #940's roster question, asked by the core.
  --   · clara._adj_line_eligibility_breach — 0042's shared negative wall, asked twice by the core.
  --   · clara.prepayment_schedule_v1 / v2 — the two FROZEN evaluators the core's two arms ride.
  v_keep text[][] := array[
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     '99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424'],
    ['clara._authority_ref_refusal(text,uuid,uuid,uuid)',
     'c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara.prepayment_schedule_v1(uuid,uuid)',
     'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2'],
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194']
  ];
begin
  if to_regclass('clara.prepayment_schedules') is null then
    raise exception '#915 prestate: clara.prepayment_schedules is absent -- 0223 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.prepayment_account_enrolments') is null then
    raise exception '#915 prestate: clara.prepayment_account_enrolments is absent -- 0306 must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.firm_memberships') is null then
    raise exception '#915 prestate: clara.firm_memberships is absent -- 0002 must apply first'
      using errcode='CLR10';
  end if;

  for v_i in 1 .. array_length(v_recut, 1) loop
    if to_regprocedure(v_recut[v_i][1]) is null then
      raise exception '#915 prestate: % does not resolve -- 0223/0305/0306 must apply first', v_recut[v_i][1]
        using errcode='CLR10';
    end if;
    select p.prosrc, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src, v_sha
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha = v_recut[v_i][2] then
      v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('#915' in v_src) > 0 then
      v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '#915 prestate: % has DRIFTED -- it is neither its measured pre-image nor a body this file already recut, so re-derive the extraction against the live text before applying (got %)',
        v_recut[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  for v_i in 1 .. array_length(v_keep, 1) loop
    if to_regprocedure(v_keep[v_i][1]) is null then
      raise exception '#915 prestate: % is absent', v_keep[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2]
      -- RIDERS WAVE 4 INTEGRATION. BIMODAL for the bodies lane 01's 0300_tenancy_terms_rent_plan.sql
      -- ALSO moves: 0300 splices clara.create_accounting_plan's authority-kind wall and
      -- clara._authority_ref_refusal's arm list to admit a THIRD authority_ref kind
      -- (contract_confirmation), and on the integrated chain 0300 applies BEFORE this file. This
      -- lane measured its pins on a rig that carried no 0300, so the pin below is right on that
      -- rig and wrong on the chain. It is therefore admitted at EITHER value. Nothing else is
      -- loosened: every other pin in this array stays exact. Precedent: wave 3's 0284.
       and v_sha is distinct from (case v_keep[v_i][1]
            when 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'
              then 'f9b19cf61ba2c1728b4c4ccc5d02e997b9a882779db4925cd1d267e92a669e63'
            when 'clara._authority_ref_refusal(text,uuid,uuid,uuid)'
              then '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208'
            else null end) then
      raise exception '#915 prestate: % has MOVED (got %) -- the extracted core calls it verbatim; re-measure this file against it before applying',
        v_keep[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- THE FOUR FUNCTIONS THIS FILE OWNS ARE BORN HERE. On a redo they already exist, and that is
  -- stated rather than silently tolerated. The count is over the LIVE catalog, so a redo that had
  -- lost one of them says so.
  select count(*)::int into v_i from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname in
     ('create_prepayment_schedule_for', 'read_prepayment_source_for',
      '_prepayment_schedule_core', '_prepayment_plan_core');
  if v_i = 0 then
    raise notice '#915 prestate: FIRST APPLY -- none of this file''s four functions exists yet. Recut mode: %', v_modes;
  else
    raise notice '#915 prestate: REDO -- % of this file''s four functions already exist. Recut mode: %',
      v_i, v_modes;
  end if;
end
$t915_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._prepayment_plan_core — THE PLAN STEP THE OBO LANE TAKES.
--
-- WHY IT EXISTS AT ALL. `clara.create_accounting_plan` (0193) resolves its actor through
-- `clara._human_ctx` -> `clara.jwt_sub()`, and a `clara_runtime` connection carries no
-- `request.jwt.claims`: nesting it from the OBO door would raise CLR04 `no authenticated actor` on
-- every call. `clara.create_accrual_adjustment_for` met exactly this in 0222 and answered it with
-- `clara._accrual_plan_core`; this is that same answer for the amortisation kind, and the shape is
-- deliberately 0222's so the two OBO lanes read alike.
--
-- WHAT IT IS NOT. It is not a second plan door. It is UNGRANTED (the one-ungranted-core law,
-- 0004:6-12), reachable only from a definer body, it takes NO op key of its own, and it admits ONE
-- kind — `amortisation_schedule`. A caller that wanted a different kind would be writing a second
-- plan lane, which is 0193's job and not this file's.
--
-- WHAT IT COPIES VERBATIM FROM 0193'S DOOR, and why each line is here rather than skipped:
--   · the authority SHAPE ladder (rule / kind / object / ref-kind / ref-id) — the OBO lane must
--     answer the same four `authority_ref_invalid` constraints the human lane answers, or this
--     ticket's "the twin's refusal vocabulary matches the human door's" criterion is false at the
--     first argument a chat tool gets wrong;
--   · the RESOLUTION through `clara._authority_ref_refusal` — 0250/#977's ONE definition. This is
--     the line `clara._accrual_plan_core` does NOT have (it still carries 0222's own `exists`
--     probes), which is the drift a second body buys you and the reason this file extracts a core
--     for the door itself rather than writing one more twin;
--   · `clara._assert_plan_schedule` and `clara._assert_journal_basis` — the schedule and basis
--     predicates, so an OBO configuration can never write a plan the human lane would refuse;
--   · the CLIENT RUNG `pg_advisory_xact_lock(203005004, hashtext(client))` — #929's own rung, in
--     0037 SECTION K's order (op-receipt -> advisory rung -> plan row). Advisory xact locks are
--     re-entrant, so the outer door re-taking it through this one costs nothing;
--   · the self-exclusion by IDENTITY in the overlap warning (#929 ADV-L05-03).
--
-- WHAT IT DOES NOT COPY: the op-key reservation and the `clara._finish_op` stamp (the OUTER door's
-- key already covers the whole configuration), the `_human_ctx` ladder (the caller resolved the
-- actor), the client firm/status ladder (likewise), and the `plan_kind_unsupported` wall (the kind
-- is a literal here, not an argument).
-- =====================================================================================

create or replace function clara._prepayment_plan_core(
    p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_authority_kind text,
    p_authority_ref jsonb, p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date, p_basis jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_reason text;
  v_warning jsonb; v_next jsonb;
begin
  -- THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- RESOLVED, and on the CHAT-LANE arm a PERSON'S instruction rather than a task the estate
  -- enqueued for itself (#977, 0250). The chat entrance this ticket opens is exactly the caller
  -- that will supply `{kind:'chat_task', id: <this turn>}`, so this is the wall that stops a wake
  -- run or an autodraft from authorising its own amortisation schedule.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, p_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
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
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, 'amortisation_schedule', 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, false,
      null, p_author)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, false,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  -- THE AUDIT ROW IS 0193'S OWN VERB with this file's `via`, exactly as 0222's core stamps its
  -- own: the audit trail says a plan was created and by WHICH entrance, and a reader can tell an
  -- OBO configuration from a human one without joining anything.
  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', 'amortisation_schedule',
      'revision', 1, 'authority', p_authority_ref, 'via', 'create_prepayment_schedule_for'));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', 'amortisation_schedule',
    'next_occurrences', coalesce(v_next,'[]'::jsonb), 'overlap_warning', v_warning);
end $$;

-- =====================================================================================
-- §B — clara._prepayment_schedule_core — THE ONE BODY BOTH ENTRANCES RUN.
--
-- IT IS THE HUMAN DOOR'S BODY, MOVED, not a paraphrase of it. Everything from the purpose check
-- onward is byte for byte what `clara.create_prepayment_schedule` ran after 0306, with exactly
-- three changes, each of which is marked `#915` where it sits:
--   1. the FIRM and the ACTOR arrive as arguments (`p_firm`, `p_actor`) instead of being resolved
--      from `clara._human_ctx`, because a runtime connection has no JWT to resolve them from;
--   2. a LANE argument, a closed set of two, decides which plan step runs (§A's reasoning);
--   3. nothing else. The op-key wall, the JWT ladder and the client ladder moved UP into the two
--      wrappers, because those are the three things the two entrances genuinely answer
--      differently.
--
-- WHY THE EXTRACTION IS SAFE TO READ AS "UNCHANGED": the prestate pins the pre-image by
-- sha256(prosrc), §TAIL asserts the human door still reaches this core and still carries #940's
-- roster call, and #653's, #939's and #940's whole batteries drive the human door through every
-- arm below. A behaviour that moved would fail one of them.
--
-- GRANTED TO NOBODY. It is reached only from the two doors' definer bodies — the one-ungranted-core
-- law (0004:6-12), and the same posture `clara._accrual_plan_core` and
-- `clara._prepayment_account_enrolled` already hold.
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
  if p_lane is null or p_lane not in ('human', 'obo') then
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
  else
    v_plan := clara._prepayment_plan_core(
      p_firm => p_firm, p_client => p_client, p_author => p_actor, p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
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
-- §C — clara.create_prepayment_schedule — THE HUMAN DOOR, NOW A WRAPPER.
--
-- ITS SIGNATURE, ITS ACL, ITS FLOOR, ITS REFUSALS AND ITS ANSWER ARE UNCHANGED. What it keeps is
-- exactly what only the human lane can do: read the actor and the firm out of the JWT at the
-- bookkeeper rank. What it hands on is everything else.
--
-- THE ORDER OF ITS OWN THREE WALLS IS 0223'S, UNTOUCHED: the op key first (a call with no key
-- cannot be made idempotent by anything that follows), then the identity, then the client. A reader
-- comparing this against the twin below sees the ONE difference the two entrances have.
-- =====================================================================================

create or replace function clara.create_prepayment_schedule(
    p_client uuid, p_source_entry uuid, p_expense_account text, p_expense_basis text,
    p_purpose text, p_authority_ref jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating a prepayment schedule requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- #915 — AND EVERYTHING ELSE IS THE SHARED CORE. The lane is a literal, so the human entrance
  -- can never take the OBO plan step and skip the JWT this wrapper just read.
  return clara._prepayment_schedule_core(p_firm => v_firm, p_client => p_client,
    p_actor => v_actor, p_lane => 'human', p_source_entry => p_source_entry,
    p_expense_account => p_expense_account, p_expense_basis => p_expense_basis,
    p_purpose => p_purpose, p_authority_ref => p_authority_ref, p_op_key => p_op_key);
end $$;

-- =====================================================================================
-- §D — clara.create_prepayment_schedule_for — THE OBO TWIN. `clara_runtime` ONLY.
--
-- IT IS `clara.create_accrual_adjustment_for`'s SHAPE (0222), line for line, and the four walls
-- below are that door's own, with its own sentences and its own tokens:
--
--   1. THE OP KEY, first and unconditional.
--   2. THE CLIENT, resolved to a firm — and a client this database does not hold answers
--      `client_not_found`, the estate's no-existence-oracle answer.
--   3. THE AUTHORITY, LIVE AT THE MOMENT THE BOOKS ARE CONFIGURED. A `p_author` with NO membership
--      in this firm at all answers EXACTLY as an unknown client does, so the pair cannot be used to
--      enumerate another firm's clients; a DEACTIVATED member of THIS firm gets the precise
--      `authority_lost` instead, because they already knew the client exists; and below the
--      bookkeeper rank it is `insufficient_role` — the same floor the human door's `_human_ctx`
--      applies, applied here to the named human rather than to the connection.
--   4. THE CLIENT'S OWN STATUS, after the authority, exactly as 0222 orders it: an inactive client
--      is a fact about the world and the caller's authority is the first thing that must hold.
--
-- WHAT IT DOES NOT DO, and each absence is a rule:
--   · it does not take an actor from a JWT (there is none) and it does not accept one from a
--     session setting (that would be an actor the caller could choose);
--   · it does not take the term, the amount, the period count, the cadence or the account class —
--     every one of those is derived by a FROZEN evaluator from rows this database already holds,
--     and the model's two contributions (which expense account, and why) are the only arguments
--     here that carry a judgement;
--   · it does not widen the op-key namespace. The reservation is taken inside the shared core,
--     under `create_prepayment_schedule` with a payload hash over the CALLER'S OWN ARGUMENTS and
--     not over the author — so a chat configuration and a human replay of the same decision under
--     the same key converge on ONE receipt and ONE schedule, which is this ticket's AC3.
-- =====================================================================================

create or replace function clara.create_prepayment_schedule_for(
    p_client uuid, p_author uuid, p_source_entry uuid, p_expense_account text,
    p_expense_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_client_status text; v_role text; v_member_status text;
begin
  -- #915 — THE FOUR WALLS THIS ENTRANCE OWNS. Everything after them is the shared core, so a rule
  -- that is not about WHO is calling can never be answered differently here than at the human door.
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating a prepayment schedule requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- A NULL AUTHOR IS ITS OWN REFUSAL, not a `client_not_found` in disguise: "no human was named"
  -- and "the human named is nobody here" are different mistakes, and only the first one is the
  -- caller's own shape. It cannot leak anything — it is answered before the client is read.
  if p_author is null then
    raise exception 'an on-behalf-of configuration names the human it acts for' using errcode='CLR10',
      detail='{"reason":"invalid_author","field":"author","constraint":"present"}';
  end if;
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the human this configuration acts for is no longer an active member of this firm'
      using errcode='CLR04',
        detail='{"reason":"authority_lost","field":"author"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'configuring a prepayment schedule requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  return clara._prepayment_schedule_core(p_firm => v_firm, p_client => p_client,
    p_actor => p_author, p_lane => 'obo', p_source_entry => p_source_entry,
    p_expense_account => p_expense_account, p_expense_basis => p_expense_basis,
    p_purpose => p_purpose, p_authority_ref => p_authority_ref, p_op_key => p_op_key);
end $$;

-- =====================================================================================
-- §E — clara.read_prepayment_source_for — THE MACHINE LANE'S READ OF THE RECORDED TERM.
--
-- WHAT IT IS FOR. `claraWork`'s term park (#653 AC5, restated in this ticket's brief) needs a run
-- to re-read the SOURCE of the prepayment it is about to ask a question about: which account the
-- prepaid leg sits on, how much it was, whether a term has been recorded at all, and — if one has —
-- the period, the kind of basis it rests on and the text of the grounds the person gave. Today the
-- run cannot read ANY of that: `clara.get_prepayment_schedule` and `clara.list_prepayment_schedules`
-- are `clara_authenticated`-only, and `clara.document_service_periods` grants SELECT to the human
-- lane alone.
--
-- WHY IT IS NARROW, and the posture is settled here because the read half has no precedent in the
-- accrual lane (which granted the runtime role only its write twin). It is
-- `clara.read_knowledge_record_for`'s shape: SCOPE-EXPLICIT (firm and client are arguments, never
-- inferred), `clara_runtime` ONLY, one subject, `stable`, and NO BYTES. There is no bytes key here
-- and there never will be: the byte door is 0190's and it is not reachable from a term read.
--
-- WHAT IT RETURNS AND WHY EACH FIELD IS THERE:
--   · `entry` — status, posting date and the document id (an IDENTIFIER, not content). The parked
--     question's context needs the document id; the run needs the status to know whether the
--     recognition has posted at all.
--   · `prepaid` — the one debited asset leg and its cents, derived by the SAME predicate the
--     schedule door's memo-only arm uses, and `candidate_legs` when it is not exactly one, so the
--     run can say "this entry's prepaid leg is ambiguous" instead of guessing which.
--   · `term` — the RECORDED term and nothing else: its source (`document_service_period` |
--     `human_stated` | null), the period, the basis KIND and the basis TEXT a person wrote. The
--     text is the human's own stated grounds, which is precisely what a run must cite instead of
--     inventing one.
--   · `schedule` — the schedule that already amortises this recognition, if there is one, so a run
--     can say so rather than driving the door to find out.
--
-- NO EXISTENCE ORACLE. A source entry belonging to another firm or another client answers exactly
-- as an id naming nothing does: CLR11 `prepayment_source_not_found`.
-- =====================================================================================

create or replace function clara.read_prepayment_source_for(
    p_firm uuid, p_client uuid, p_source_entry uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  -- SCALARS, NOT RECORDS, and the reason is a defect this file met on the rig: a plpgsql `record`
  -- that no `select into` ever reaches raises `record "v_sp" is not assigned yet` the moment a
  -- field is read — so a memo-only recognition (no document, hence no document-carrier select)
  -- would make the read RAISE instead of reporting the absence it exists to report. Scalars start
  -- NULL, which is exactly what "nothing recorded" means here.
  v_entry record; v_legs int;
  v_leg_code text; v_leg_cents bigint;
  v_sp_id uuid; v_sp_start date; v_sp_end date; v_sp_kind text; v_sp_basis text;
  v_st_id uuid; v_st_start date; v_st_end date; v_st_reason text;
  v_sched_id uuid; v_sched_plan uuid; v_sched_source text;
  v_term jsonb;
begin
  if p_firm is null or p_client is null or p_source_entry is null then
    raise exception 'the runtime prepayment-source read names firm, client and source entry'
      using errcode='CLR10', detail='{"reason":"prepayment_read_scope_required"}';
  end if;
  select je.id, je.status, je.document_id, je.posting_date into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'prepayment source entry not found in your firm' using errcode='CLR11',
      detail='{"reason":"prepayment_source_not_found"}';
  end if;

  -- THE PREPAID LEG, by the door's own predicate: exactly one DEBITED ASSET line. Zero or many is
  -- reported as a count rather than guessed at, for the same reason the door refuses it.
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  if v_legs = 1 then
    select jl.account_code, jl.debit_cents into v_leg_code, v_leg_cents
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  end if;

  -- THE RECORDED TERM. The document carrier first, because a document-bound recognition is the
  -- lane 0140 built; then #939's person-stated carrier. A recognition that binds a document does
  -- not carry a stated term at all (0305 refuses one), so the two arms cannot both answer.
  if v_entry.document_id is not null then
    select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis
      into v_sp_id, v_sp_start, v_sp_end, v_sp_kind, v_sp_basis
      from clara.document_service_periods sp
     where sp.document_id = v_entry.document_id and sp.superseded_at is null;
  end if;
  select t.id, t.period_start, t.period_end, t.reason
    into v_st_id, v_st_start, v_st_end, v_st_reason
    from clara.prepayment_stated_terms t
   where t.source_entry_id = p_source_entry and t.superseded_at is null;

  if v_sp_id is not null then
    v_term := jsonb_build_object('source', 'document_service_period',
      'service_period_id', v_sp_id, 'stated_term_id', null,
      'period_start', to_char(v_sp_start,'YYYY-MM-DD'),
      'period_end', to_char(v_sp_end,'YYYY-MM-DD'),
      'basis_kind', v_sp_kind, 'basis_text', v_sp_basis);
  elsif v_st_id is not null then
    v_term := jsonb_build_object('source', 'human_stated',
      'service_period_id', null, 'stated_term_id', v_st_id,
      'period_start', to_char(v_st_start,'YYYY-MM-DD'),
      'period_end', to_char(v_st_end,'YYYY-MM-DD'),
      'basis_kind', 'human_stated', 'basis_text', v_st_reason);
  else
    -- ABSENCE IS REPORTED AS ABSENCE, with the DOOR that fills it — never as an empty term a run
    -- could read as "no term is needed". The remedy named is the human one, because a service
    -- period is human-only by law and no agent path to it exists or ever will.
    v_term := jsonb_build_object('source', null,
      'service_period_id', null, 'stated_term_id', null,
      'period_start', null, 'period_end', null, 'basis_kind', null, 'basis_text', null,
      'remedy', case when v_entry.document_id is not null
                     then 'clara.record_document_service_period'
                     else 'clara.record_prepayment_stated_term' end);
  end if;

  select s.id, s.plan_id, s.term_source into v_sched_id, v_sched_plan, v_sched_source
    from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm;

  return jsonb_build_object(
    'status', 'ok', 'firm_id', p_firm, 'client_id', p_client,
    'source_entry_id', p_source_entry,
    'entry', jsonb_build_object('status', v_entry.status, 'document_id', v_entry.document_id,
      'posting_date', to_char(v_entry.posting_date,'YYYY-MM-DD')),
    'prepaid', jsonb_build_object('account_code', v_leg_code,
      'total_cents', v_leg_cents, 'candidate_legs', v_legs),
    'term', v_term,
    'schedule', case when v_sched_id is null then null
                     else jsonb_build_object('schedule_id', v_sched_id, 'plan_id', v_sched_plan,
                            'term_source', v_sched_source) end);
end $$;

-- =====================================================================================
-- §F — GRANTS AND COMMENTS.
--
-- THE TWIN AND THE READ GO TO `clara_runtime` AND NOWHERE ELSE. The human door keeps
-- `clara_authenticated` alone; the two cores hold NO application grant at all; the agent role and
-- both wake roles gain ZERO, because a lane that could configure its own amortisation schedule
-- would be the agent deciding what it is allowed to do (0193 §I's sentence, unchanged).
-- =====================================================================================

revoke all on function clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb) from public;
revoke all on function clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text) from public;
revoke all on function clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text) from public;
revoke all on function clara.read_prepayment_source_for(uuid,uuid,uuid) from public;

grant execute on function clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text) to clara_runtime;
grant execute on function clara.read_prepayment_source_for(uuid,uuid,uuid) to clara_runtime;

comment on function clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text) is
  '#915: the ONE body clara.create_prepayment_schedule and clara.create_prepayment_schedule_for '
  'both run -- the purpose wall, the op reservation, the duplicate check, the document/memo branch, '
  '#940''s roster gate, 0042''s shared negative wall, the expense half, the allocation, the basis '
  'rung, the plan, the insert race and the audit. The firm and the actor are ARGUMENTS because a '
  'runtime connection carries no JWT; the lane argument chooses the plan step and nothing else. '
  'UNGRANTED: reached only from the two doors.';
comment on function clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb) is
  '#915: the amortisation plan step for the OBO lane, in clara._accrual_plan_core''s shape (0222) '
  'and for its reason -- clara.create_accounting_plan resolves its actor through clara._human_ctx, '
  'which a clara_runtime connection can never satisfy. It asks clara._authority_ref_refusal '
  '(0250/#977), so the OBO lane answers exactly what 0193''s door answers. UNGRANTED.';
comment on function clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text) is
  '#915: configure ONE prepayment amortisation schedule ON BEHALF OF an explicitly named human, '
  'for clara_runtime ONLY (the clara.create_accrual_adjustment_for shape). It resolves its actor '
  'from the ARGUMENT and never from a JWT, re-checks that human''s membership LIVE at the bookkeeper '
  'floor, and shares the human door''s _reserve_op key space so a chat configuration and a human '
  'replay of the same decision converge on one receipt. Configuration only: it posts nothing.';
comment on function clara.read_prepayment_source_for(uuid,uuid,uuid) is
  '#915: the machine lane''s read of a prepayment recognition''s RECORDED term -- the prepaid leg, '
  'the entry''s status and bound document id, and the period/basis_kind/basis TEXT a person '
  'recorded (document_service_periods or #939''s prepayment_stated_terms). clara_runtime ONLY, '
  'scope-explicit, stable, and NO document bytes: the byte door is 0190''s and is not reachable '
  'from here. Its consumer is claraWork''s term park (read_prepayment_source).';

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- =====================================================================================
do $t915_tail$
declare
  v_n int; v_sig text; v_src text; v_sha text; v_role text; v_names text;
  v_expect text[][] := array[
    ['clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)', 'v'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)', 'v'],
    ['clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)', 'v'],
    ['clara.read_prepayment_source_for(uuid,uuid,uuid)', 's']
  ];
  v_keep text[][] := array[
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     '99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424'],
    ['clara._authority_ref_refusal(text,uuid,uuid,uuid)',
     'c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7'],
    ['clara._prepayment_account_enrolled(uuid,text,text)',
     '0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db'],
    ['clara._adj_line_eligibility_breach(uuid,jsonb)',
     '727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021'],
    ['clara.prepayment_schedule_v1(uuid,uuid)',
     'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2'],
    ['clara.prepayment_schedule_v2(bigint,text,text,date,date)',
     '9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194']
  ];
begin
  -- 1 · THE FOUR FUNCTIONS EXIST AT THEIR EXACT SIGNATURES, with this estate's posture: owned by
  --     clara_fn_owner, SECURITY DEFINER, search_path pinned, and the volatility each one claims
  --     (the read is STABLE; a VOLATILE read could not be planned the way a read should be).
  for v_n in 1 .. array_length(v_expect, 1) loop
    v_sig := v_expect[v_n][1];
    if to_regprocedure(v_sig) is null then
      raise exception '#915 tail: % does not resolve at its exact signature', v_sig using errcode='CLR10';
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = v_sig::regprocedure
                      and pg_get_userbyid(p.proowner) = 'clara_fn_owner' and p.prosecdef
                      and p.provolatile = v_expect[v_n][2]
                      and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=clara, pg_temp') then
      raise exception '#915 tail: %''s owner/definer/volatility/search_path posture is wrong -- got {%}',
        v_sig,
        (select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text
                || ' | ' || coalesce(array_to_string(p.proconfig, ','), '<none>')
           from pg_proc p where p.oid = v_sig::regprocedure)
        using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE TWO CORES HOLD NO APPLICATION GRANT AT ALL (the one-ungranted-core law).
  foreach v_sig in array array[
      'clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)',
      'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'] loop
    select count(*)::int into v_n from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = v_sig::regprocedure and pg_get_userbyid(a.grantee) <> 'clara_fn_owner';
    if v_n <> 0 then
      raise exception '#915 tail: % holds % application grant(s) -- it is reached from a definer body only',
        v_sig, v_n using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE TWIN AND THE READ ARE `clara_runtime` AND NOTHING ELSE.
  foreach v_sig in array array[
      'clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)',
      'clara.read_prepayment_source_for(uuid,uuid,uuid)'] loop
    if not has_function_privilege('clara_runtime', v_sig::regprocedure, 'execute') then
      raise exception '#915 tail: clara_runtime cannot execute % -- the lane this file exists for', v_sig
        using errcode='CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_wake_interactive',
                                  'clara_wake_proactive','public'] loop
      if has_function_privilege(v_role, v_sig::regprocedure, 'execute') then
        raise exception '#915 tail: % can execute % -- the OBO lane is clara_runtime only', v_role, v_sig
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- 4 · THE HUMAN DOOR'S ACL IS EXACTLY WHERE 0306 LEFT IT. This ticket adds a door; it does not
  --     widen a grant. A runtime grant here would be a configuration with no named author.
  if not has_function_privilege('clara_authenticated',
        'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime',
        'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute')
     or has_function_privilege('public',
        'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure, 'execute') then
    raise exception '#915 tail: clara.create_prepayment_schedule''s ACL moved -- the human door stays human'
      using errcode='CLR10';
  end if;

  -- 5 · BOTH ENTRANCES RUN THE SAME BODY, asserted at the CALL SITE rather than by an attribution
  --     comment: a wrapper that kept the comment and inlined a copy is exactly the drift this
  --     file's shape exists to prevent.
  foreach v_sig in array array[
      'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
      'clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position('clara._prepayment_schedule_core(' in v_src) = 0 or position('#915' in v_src) = 0 then
      raise exception '#915 tail: % does not call the shared core -- the extraction did not land', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  -- …and the HUMAN wrapper still reads its actor from the JWT at the bookkeeper rank, while the
  -- TWIN still re-checks the named author's membership. Neither may borrow the other's identity.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)'::regprocedure;
  if position('clara._human_ctx(clara.role_rank(''bookkeeper''))' in v_src) = 0 then
    raise exception '#915 tail: the human door lost its _human_ctx floor' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)'::regprocedure;
  if position('clara.firm_memberships' in v_src) = 0
     or position('authority_lost' in v_src) = 0
     or position('insufficient_role' in v_src) = 0
     or position('clara._human_ctx' in v_src) > 0 then
    raise exception '#915 tail: the OBO twin does not recheck its named author LIVE, or it reaches for a JWT it cannot have'
      using errcode='CLR10';
  end if;

  -- 6 · THE CORE CARRIES #940'S ROSTER GATE AND THIS FILE'S LANE BRANCH. The roster question moved
  --     with the body; a core that lost it would let the OBO lane amortise an unenrolled account.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'::regprocedure;
  if position('clara._prepayment_account_enrolled(p_client, v_prepaid, ''prepayment'')' in v_src) = 0
     or position('prepaid_account_not_enrolled' in v_src) = 0 then
    raise exception '#915 tail: the shared core lost #940''s roster gate' using errcode='CLR10';
  end if;
  if position('clara._adj_line_eligibility_breach(p_client' in v_src) = 0 then
    raise exception '#915 tail: the shared core lost 0042''s shared negative wall' using errcode='CLR10';
  end if;
  if position('clara.create_accounting_plan(' in v_src) = 0
     or position('clara._prepayment_plan_core(' in v_src) = 0 then
    raise exception '#915 tail: the shared core does not carry BOTH plan steps -- one lane would be unreachable'
      using errcode='CLR10';
  end if;

  -- 7 · NO WAKE WRAPPER AND NO SECOND OBO DOOR, by census rather than by convention. Exactly ONE
  --     function in the whole clara schema is named for the OBO configuration act, and exactly ONE
  --     for the machine-lane read.
  select count(*)::int, string_agg(p.proname, ', ' order by p.proname) into v_n, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname ~ 'prepayment_schedule_for$';
  if v_n <> 1 then
    raise exception '#915 tail: expected exactly ONE function named for the OBO prepayment-schedule act, found % (%)',
      v_n, coalesce(v_names, '<none>') using errcode='CLR10';
  end if;
  select count(*)::int, string_agg(p.proname, ', ' order by p.proname) into v_n, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname ~ 'prepayment_source_for$';
  if v_n <> 1 then
    raise exception '#915 tail: expected exactly ONE machine-lane prepayment-source read, found % (%)',
      v_n, coalesce(v_names, '<none>') using errcode='CLR10';
  end if;

  -- 8 · THE GRANT CENSUS THIS TICKET'S AC5 ASKS FOR, measured over the WHOLE LANE rather than over
  --     the two functions this file happens to know about: `clara_runtime` reaches the twin and the
  --     narrow read, and nothing else named for prepayments or amortisation anywhere in clara.
  select count(*)::int, string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_n, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and (p.proname ~ 'prepayment' or p.proname ~ 'amortis')
     and has_function_privilege('clara_runtime', p.oid, 'execute');
  if v_n <> 2
     or v_names is distinct from 'clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text), clara.read_prepayment_source_for(uuid,uuid,uuid)' then
    raise exception '#915 tail: clara_runtime reaches % function(s) in the prepayment lane: % -- it must reach the twin and the read, and nothing else',
      v_n, coalesce(v_names, '<none>') using errcode='CLR10';
  end if;

  -- 9 · THE SIX NEIGHBOURS ARE BYTE-IDENTICAL TO THEIR PRE-IMAGES, re-measured AFTER this file ran.
  --     "This file only extracts and adds" is a claim, and the shas are the evidence.
  for v_n in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_n][1]::regprocedure;
    if v_sha is distinct from v_keep[v_n][2]
      -- RIDERS WAVE 4 INTEGRATION. BIMODAL for the bodies lane 01's 0300_tenancy_terms_rent_plan.sql
      -- ALSO moves: 0300 splices clara.create_accounting_plan's authority-kind wall and
      -- clara._authority_ref_refusal's arm list to admit a THIRD authority_ref kind
      -- (contract_confirmation), and on the integrated chain 0300 applies BEFORE this file. This
      -- lane measured its pins on a rig that carried no 0300, so the pin below is right on that
      -- rig and wrong on the chain. It is therefore admitted at EITHER value. Nothing else is
      -- loosened: every other pin in this array stays exact. Precedent: wave 3's 0284.
       and v_sha is distinct from (case v_keep[v_n][1]
            when 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'
              then 'f9b19cf61ba2c1728b4c4ccc5d02e997b9a882779db4925cd1d267e92a669e63'
            when 'clara._authority_ref_refusal(text,uuid,uuid,uuid)'
              then '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208'
            else null end) then
      raise exception '#915 tail: % moved during this file (got %)', v_keep[v_n][1], v_sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#915 tail: OK -- clara.create_prepayment_schedule_for and clara.read_prepayment_source_for exist at their exact signatures, owned by clara_fn_owner as SECURITY DEFINERs with a pinned search_path (the read STABLE), executable by clara_runtime and by no human, agent, wake or PUBLIC principal; clara.create_prepayment_schedule keeps its clara_authenticated-ONLY ACL and its _human_ctx bookkeeper floor; BOTH doors run clara._prepayment_schedule_core, which holds no application grant and still carries #940''s roster gate, 0042''s shared negative wall and both plan steps; exactly one function is named for the OBO act and one for the machine-lane read; clara_runtime reaches EXACTLY those two in the whole prepayment lane; and all six pinned neighbours are byte-identical to their pre-images.';
end
$t915_tail$;
