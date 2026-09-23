-- 0280_fa_policy_enrolment_congruence — #932 FIX ROUND (riders wave 3, lane 04 review): A DEFAULT
-- DEPRECIATION POLICY APPLIES ONLY WHILE IT STILL FITS THE ENROLMENT IT WAS VALIDATED AGAINST.
-- =====================================================================================
-- Spec of record: issue #932 and the lane's own adversarial review (ADV-L04-1, blocker,
-- 2026-09-23), reproduced end to end on clara_l04 before this file was written.
--
-- THE DEFECT, IN ONE SENTENCE. `clara.set_fa_depreciation_policy` refuses every method but
-- `none` on a NON-DEPRECIABLE enrolment (0277 §B: "this account is a non-depreciable enrolment
-- (no accumulated-depreciation account); its policy method must be none"), and nothing re-checks
-- that afterwards. `clara.upsert_fa_account_profile` is version-forward and reads no policy (it
-- is pinned UNMOVED by 0277's own prestate and tail, and stays unmoved here), so ONE ordinary
-- re-enrolment with `accum_depr_account_code = null` leaves the straight_line policy LIVE. The
-- next acquisition on that account is then born COMPLETE from the policy while taking its
-- accumulated and expense codes from the NEW profile -- i.e. NULL:
--
--   clara.preview_depreciation_run  -> legs [{debit 10000, account_code null},
--                                            {credit 10000, account_code null}]
--   clara.run_depreciation_manual   -> SQLSTATE 23502, null value in column "account_code" of
--                                      relation "journal_lines" violates not-null constraint
--
-- That is not a typed CLR refusal, so no door can rescue it: `complete_fixed_asset_particulars`
-- refuses CLR37 `fa_particulars_already_complete` (the row IS complete) and
-- `revise_fixed_asset_particulars` refuses the `depreciation_method` key outright. The belt
-- (packages/runtime/lib/reconciler-fa.mjs) isolates the throw per client, so that client's
-- depreciation lane stops for good, silently.
--
-- WHY THE FIX IS AT THE BIRTH SITES AND NOWHERE ELSE.
--   * Auto-retiring the policy when the enrolment changes would have Clara DEFAULT a human
--     decision (the standing owner ruling is that she asks, never decides).
--   * Widening `clara.upsert_fa_account_profile` to refuse the re-enrolment would recut a body
--     0277's prestate and tail both pin unmoved, and would wall a lawful act (an account really
--     can stop being depreciable) on the strength of a stale default.
--   * Declining the stale policy at birth needs no new state and no new refusal: the row births
--     EXACTLY as an uncovered non-depreciable acquisition does -- pending, with method `none`
--     and no start date -- and the person is asked, which is what the estate already does for
--     every account that carries no policy at all. Pre-0277 this shape was unreachable for
--     exactly that reason (0247's own UNCOVERED branch, and 0249's
--     `clara._fa_assert_particulars_completable`, which refuses a HAND completion of the same
--     shape).
--
-- WHAT THIS FILE IS. Two `create or replace function` statements -- the SAME two bodies 0277 §E
-- and §E2 recut, taken from 0277 byte for byte and changed in exactly ONE line each (the
-- policy-covered branch's condition), plus the in-body comments that name the change -- and one
-- accreted catalog comment. It creates no relation, mints no function, moves no grant and adds no
-- role, so it owes no rig-meta cohort (0278 made the same claim for the same reason).
--
-- ONE OTHER PROSE CORRECTION RIDES HERE (SPEC-932-2, minor, same review). 0277's own covered-
-- branch comment claimed the policy's `effective_from` "only gates WHICH acquisitions the policy
-- reaches"; the lookup filters on `active` alone and nothing anywhere reads that column for a
-- decision, so the code and its own comment disagreed about a dated column. §B now says what is
-- true. No behaviour moves with it.
--
-- WHY IT IS A SEPARATE FILE AND NOT AN EDIT TO 0277. 0278's prestate pins 0277's post-image of
-- `clara._tf_fa_acquisition_birth` by `sha256(prosrc)` and accretes onto its 842-character
-- comment, and #957's redo path re-applies only the HIGHEST applied version. Editing 0277 in
-- place would therefore have broken 0278's prestate on a from-scratch chain and could not have
-- been re-applied to this rig at all. The number is provisional and is claimed at MERGE; every
-- gate in this family keys on the STABLE STEM (`fa_policy_enrolment_congruence$`), never on it.
-- =====================================================================================

do $p932c_pre$
declare
  v_sha text; v_pin record; v_comment text; v_prefix_sha text; v_redo boolean := false;
  -- THE LIVE PRE-IMAGES, measured off pg_proc.prosrc on the lane-04 rig (clara_l04, PG 17,
  -- chain 0001..0279 -- 0277/0278/0279 are this lane's own tickets) moments before this file was
  -- written, never transcribed from an earlier migration's header.
  c_birth_pre constant text :=
    'c2c62b2997a6dd9a1202e509954b6f1b311ab5c704064b9a71d806e8fb456c50';
  c_approve_pre constant text :=
    'ea7499ae782bbaef3bb0d1695273f014af39d17f583ee46409a763d0d33bed89';
  -- THE BIRTH'S CATALOG COMMENT after 0278's accretion, whole.
  c_birth_comment constant text :=
    '5a5c1d9821c1fdbf8a2039137b8d281b3827bc424a5cdd67a2db83f77b1c628a';
  c_birth_comment_len constant int := 1553;
begin
  if to_regclass('clara.fa_account_depreciation_policies') is null then
    raise exception '#932 fix-round prestate: clara.fa_account_depreciation_policies is absent -- 0277 must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957.) Both statements below are
  -- `create or replace function`, so a redo is safe by construction; only the pre-image pins
  -- need a redo branch, because on a redo the live text is this file's OWN prior effect. The
  -- signal is the marker only this file writes.
  select p.prosrc into v_comment from pg_proc p
   where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if position('#932 FIX ROUND (0280)' in coalesce(v_comment, '')) > 0 then
    v_redo := true;
    raise notice '#932 fix-round prestate: the recut birth body already carries this file''s marker -- treating this as a #957 REDO of 0280 itself. Both statements are create-or-replace; the tail re-proves the whole post-state from scratch.';
  end if;

  for v_pin in select * from (values
      ('clara._tf_fa_acquisition_birth()', c_birth_pre),
      ('clara._fa_on_approve(uuid)', c_approve_pre)) as t(sig, sha) loop
    if v_redo then continue; end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is null then
      raise exception '#932 fix-round prestate: % is absent', v_pin.sig using errcode = 'CLR10';
    end if;
    if v_sha <> v_pin.sha then
      raise exception '#932 fix-round prestate: % has DRIFTED from its pinned pre-image (measured %, expected %) -- this file carries 0277''s bodies byte for byte plus ONE changed line each, so re-derive it against the LIVE body before applying', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- NON-REGRESSION, pinned and NOT recut by this file: the enrolment door whose shape the guard
  -- below reads, the completeness predicate the guard's outcome is judged by, the policy door
  -- whose SET-time wall this file extends in time, and the read the register renders through.
  for v_pin in select * from (values
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
       '14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c'),
      ('clara._fa_particulars_complete(clara.fixed_assets)',
       '4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9'),
      ('clara.set_fa_depreciation_policy(uuid,text,text,int,int,bigint,text,text)',
       '11f0aa0a82334438bebb3dadd1c990c08ebd0b014eabf7d86d41204c2820b67d'),
      ('clara._fa_asset_json(uuid,date)',
       '41dc64108fd2eea95a61720e6b0e940cef1b0cb3957e264dfa5a04fc09a0bfd6')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#932 fix-round prestate: % MOVED (measured %, expected %) -- this file recuts exactly two bodies and nothing else', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE BIRTH'S COMMENT. 0278's accreted text on a first apply; this file's own longer text on a
  -- redo, whose first 1553 characters must STILL be that same pre-image (the accretion may never
  -- drift, even across a hand-edit-and-redo cycle).
  select obj_description('clara._tf_fa_acquisition_birth()'::regprocedure, 'pg_proc') into v_comment;
  if v_comment is null then
    raise exception '#932 fix-round prestate: clara._tf_fa_acquisition_birth carries NO comment to accrete onto -- 0277 and 0278 must apply first'
      using errcode = 'CLR10';
  end if;
  if not v_redo and char_length(v_comment) <> c_birth_comment_len then
    raise exception '#932 fix-round prestate: clara._tf_fa_acquisition_birth carries an UNEXPECTED comment on a first apply (length %, expected %) -- 0278 or a later ticket may have re-commented it since this file''s prestate was measured', char_length(v_comment), c_birth_comment_len
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(substring(v_comment from 1 for c_birth_comment_len), 'UTF8')), 'hex')
    into v_prefix_sha;
  if v_prefix_sha <> c_birth_comment then
    raise exception '#932 fix-round prestate: clara._tf_fa_acquisition_birth''s first % characters no longer hash to 0278''s measured text (sha %) -- refusing to accrete onto drifted provenance', c_birth_comment_len, v_prefix_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#932 fix-round prestate: clean (% apply) -- both birth sites are at their measured 0277 post-images, the four bodies this file does NOT touch are unmoved, and the birth''s catalog comment is 0278''s own text byte for byte.',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$p932c_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §B THE BIRTH TRIGGER, RECUT. 0277 §E's body, byte for byte, with ONE changed line: the
--    policy-covered branch's condition. The UNCOVERED branch is untouched, and it is what a
--    declined policy now falls through to.
-- =====================================================================================
create or replace function clara._tf_fa_acquisition_birth() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  l record; v_actor uuid; v_asset uuid; v_pol clara.fa_account_depreciation_policies%rowtype;
  v_desc text; v_method text; v_life int; v_rate int; v_residual bigint; v_start date;
  v_pol_id uuid; v_pol_ver int;
begin
  -- ARM 4's PREDICATE, VERBATIM (0041:2603) …
  if new.is_opening_balance then return null; end if;
  if new.reversal_of is not null then return null; end if;
  if new.flags ? 'fa_disposal' then return null; end if;
  -- … PLUS THE ONE EXCLUSION ARM 4 DOES NOT CARRY. A depreciation run debits the EXPENSE account,
  -- so the cost join below misses it today; closing the site itself means a phantom birth would
  -- need BOTH guards to fail rather than either (0041:2603's own risk note).
  if new.origin = 'scheduled_run' then return null; end if;

  v_actor := coalesce(new.checker_actor, new.maker_actor);
  for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                  fp.accum_depr_account_code as accum_code,
                  fp.depr_expense_account_code as expense_code
           from clara.journal_lines jl
           join clara.fa_account_profiles fp on fp.client_id = jl.client_id
             and fp.asset_account_code = jl.account_code and fp.active
             -- #972 THE §1.2 WATERMARK, ON EVERY FIRING — NOT ONLY THE FIRST APPROVE (0247,
             -- carried forward byte for byte; see 0247's own header for the full reasoning).
             and coalesce(new.approved_at, new.created_at) >= fp.enrolled_at
           where jl.entry_id = new.id and jl.debit_cents > 0
           order by jl.id loop
    v_asset := null;
    -- #932 THE ACCOUNT'S LIVE DEFAULT DEPRECIATION POLICY, IF ANY. Read once per line, inside
    -- the same loop that already resolves the enrolment: a policy is scoped to the SAME
    -- (client, asset_account_code) pair the profile join already keys on, so no extra join is
    -- needed, only one extra lookup. NULL when no active policy exists — the row then births
    -- EXACTLY as it always has (0216 §B / 0041 arm 4 / 0247).
    select * into v_pol from clara.fa_account_depreciation_policies
      where client_id = new.client_id and asset_account_code = l.account_code and active
      limit 1;
    -- #932 FIX ROUND (0280): THE POLICY MUST STILL FIT THE ENROLMENT IT WAS VALIDATED AGAINST.
    -- clara.set_fa_depreciation_policy refuses every method but `none` on a NON-DEPRECIABLE
    -- enrolment (0277 §B) -- but that is a wall at SET time only. Re-issuing the enrolment with
    -- no accumulated-depreciation account leaves the depreciating policy LIVE, and a row born
    -- from it would be COMPLETE while carrying a null accumulated and expense code:
    -- unchargeable, and fatal to every later run for that client (clara.run_depreciation_manual
    -- dies on an untyped 23502 from journal_lines.account_code, which no door can rescue and
    -- which the belt then isolates per client, silently stopping that client's depreciation for
    -- good). A policy that no longer fits its enrolment is therefore DECLINED here and the
    -- acquisition births exactly as an uncovered non-depreciable one does -- pending, for a
    -- person to answer. The enrolment door keeps accumulated and expense a PAIR (0041:2785-2789,
    -- "state BOTH ... or NEITHER"), so the accumulated code alone decides it.
    if v_pol.id is not null and not (l.accum_code is null and v_pol.method <> 'none') then
      -- POLICY-COVERED: the row is born COMPLETE, never "particulars pending". The start date is
      -- the ACQUISITION'S OWN posting date (owner ruling 2026-09-18) — never today's date, and
      -- never the policy's own effective_from.
      -- #932 FIX ROUND (0280), SPEC-932-2: 0277's own words here were "effective_from ... only
      -- gates WHICH acquisitions the policy reaches", and that was never true of the code
      -- underneath them — this lookup filters on `active` alone, and no consumer in packages/db
      -- or apps/web reads effective_from for any decision. It is a RECORDED fact (when the person
      -- says the policy took effect), carried on the row and shown in the register, and it gates
      -- NOTHING: the owner's 2026-09-18 ruling that "changing a policy affects later acquisitions
      -- only" is expressed by the active flag alone, which is why the column was never needed in
      -- the predicate. A later ticket that wants a genuinely dated policy must change this
      -- lookup; until it does, the code and this comment agree.
      -- Stated particulars always win: there is today no mechanism for an acquisition
      -- entry itself to carry particulars at posting time (this file's header), so there is
      -- nothing here that could ever override one.
      v_method := v_pol.method; v_life := v_pol.useful_life_months; v_rate := v_pol.rate_bps;
      v_residual := v_pol.residual_cents; v_start := new.posting_date;
      v_pol_id := v_pol.id; v_pol_ver := v_pol.version;
      v_desc := 'Fixed asset - ' || l.account_code || ' RM'
        || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
    else
      -- UNCOVERED: 0247's shape, byte for byte. "Particulars pending" stays the placeholder
      -- description, and every depreciation column stays unset until a person completes it.
      v_method := case when l.accum_code is null then 'none' end;
      v_life := null; v_rate := null; v_residual := 0; v_start := null;
      v_pol_id := null; v_pol_ver := null;
      v_desc := 'Fixed asset (particulars pending) - ' || l.account_code || ' RM'
        || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
    end if;
    -- THE SAME INSERT ARM 4 MAKES, WITH THE SAME CONFLICT TARGET, now widened by the four
    -- particulars columns a completion would otherwise be the only writer of, plus the two
    -- provenance columns. On the four lanes that already birth, the hook got here first and
    -- this writes nothing; on the Work lane it writes the row the estate never had.
    insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
        residual_cents, depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, acquisition_entry_id, acquisition_line_id,
        acquisition_document_id, accumulated_depreciation_cents, status,
        useful_life_months, depreciation_rate_bps, depreciation_start_date,
        depreciation_policy_id, depreciation_policy_version)
      values (new.firm_id, new.client_id, v_desc,
        new.posting_date, l.debit_cents, v_residual, v_method,
        l.account_code, l.accum_code, l.expense_code, new.id, l.line_id,
        new.document_id, 0, 'active',
        v_life, v_rate, v_start, v_pol_id, v_pol_ver)
      on conflict (acquisition_line_id) do nothing
      returning id into v_asset;
    if v_asset is not null then
      perform clara._append_event(new.firm_id, 'asset.acquired', new.client_id, v_actor,
        null, null, new.id, new.document_id, null,
        jsonb_build_object('asset_id', v_asset, 'line_id', l.line_id,
          'cost_cents', l.debit_cents, 'born_by', 'acquisition_birth_trigger',
          'depreciation_policy_id', v_pol_id, 'depreciation_policy_version', v_pol_ver));
    end if;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_fa_acquisition_birth() from public;

-- =====================================================================================
-- §C clara._fa_on_approve, RECUT. 0277 §E2's body, byte for byte, with the SAME one changed
--    line in arm 4's own soft-birth arm. THIS is the site that fires for an ordinary approve;
--    §B's covers the Work lane, where arm 4 is never reached.
-- =====================================================================================
create or replace function clara._fa_on_approve(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; o record; l record; d record; au record; su record;
  -- %ROWTYPE (not record): _fa_particulars_complete takes the composite type.
  a clara.fixed_assets%rowtype;
  v_actor uuid; v_asset uuid; v_prop jsonb; v_recomp jsonb; v_run uuid;
  v_mode text; v_ps date; v_pe date; v_want jsonb; v_have jsonb;
  v_cost bigint; v_accum bigint; v_res bigint; v_portion bigint;
  v_accum_share bigint; v_res_share bigint; v_disposed uuid; v_cont uuid;
  v_dispose_date date; v_unwound int := 0;
  v_bake bigint; v_stub_total bigint; v_ledger_at bigint; v_accum_at bigint; v_disp_accum bigint;
  -- #932 (0277): the SAME policy-lookup locals §E's recut of the deferred trigger declares.
  v_pol clara.fa_account_depreciation_policies%rowtype;
  v_desc text; v_method text; v_life int; v_rate int; v_residual bigint; v_start date;
  v_pol_id uuid; v_pol_ver int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  v_actor := coalesce(e.checker_actor, e.maker_actor);

  -- -----------------------------------------------------------------------------------
  -- (1) THE DEPRECIATION PROPOSAL (design SS3.2 "the hook at approve").
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'depreciation_charges' then
    v_prop := e.flags -> 'depreciation_charges';
    -- ORIGIN. The proposal and the origin are one fact; a depreciation proposal on a manual
    -- entry would be a forged machine post wearing a human's clothes.
    if e.origin <> 'scheduled_run' then
      raise exception 'a depreciation proposal may only ride an origin=scheduled_run entry'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'origin',
            'entry_id', p_entry)::text;
    end if;
    select * into au from clara.fa_depreciation_authorities
      where id = (v_prop ->> 'authority_id')::uuid;
    if not found or au.client_id <> e.client_id or au.status <> 'live' then
      raise exception 'the depreciation authority this proposal names is not live for this client; re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'authority_not_live',
            'authority_id', v_prop ->> 'authority_id')::text;
    end if;
    -- THE PERIOD IS DERIVED, NOT CARRIED: the run verb posts the entry ON the period end, so
    -- the cadence period containing posting_date IS the run's period. One less thing a
    -- proposal can lie about. (Derived BEFORE the issuer binding, which now pins it.)
    if au.cadence = 'monthly' then
      v_ps := clara._fa_month_start(e.posting_date); v_pe := clara._fa_month_end(e.posting_date);
    else
      v_ps := clara._fa_fy_open_for(e.client_id, e.posting_date);
      v_pe := clara._fa_fy_end_for(e.client_id, e.posting_date);
    end if;
    -- THE ISSUER BINDING THAT SURVIVES THE MAKER-CHECKER GAP: the run verb's op key must be
    -- present in the durable op-receipt ledger under one of the two run verbs. A flags blob
    -- alone proves nothing about who wrote it; a receipt does.
    -- BOUND TO THIS CLIENT AND THIS PERIOD, not merely to the firm [round-3 small / STR minor
    -- 1]. clara.op_receipts carries no client column, but _reserve_op stores the REQUEST HASH,
    -- and the run core hashes exactly (client, period_start, period_end) -- so re-deriving that
    -- hash from e.client_id and the period this hook itself derived turns a firm-wide receipt
    -- lookup into an exact match on the act that minted it. An op-receipt belonging to a
    -- SIBLING CLIENT of the same firm no longer authenticates this proposal.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id
                     and r.fn in ('run_depreciation_period', 'run_depreciation_manual')
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id, 'period_start', v_ps, 'period_end', v_pe))) then
      raise exception 'this depreciation proposal carries no issuer op-key receipt for this client and period; re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'issuer')::text;
    end if;
    -- REGISTER FRESHNESS, RE-DERIVED UNDER THE LOCKS (the WCA-R7 approve-time-twin pattern).
    -- The draft window between proposal and approve is a window in which assets complete,
    -- disposals approve and charges unwind. The stored proposal is a statement about a world;
    -- if the world moved, the honest answer is one named refusal whose remedy is stated.
    v_recomp := clara._fa_compute_charges(e.client_id, v_ps, v_pe);
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_want from jsonb_array_elements(v_recomp -> 'charges') x;
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_have from jsonb_array_elements(v_prop -> 'charges') x;
    if v_want is distinct from v_have then
      raise exception 'the register moved since this depreciation run was proposed; withdraw this draft and re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'charges',
            'period_start', v_ps, 'period_end', v_pe)::text;
    end if;
    -- MODE IS RE-DERIVED, NOT CARRIED (design SS3.3). The run verb's own decision -- ramp
    -- earned AND the entry not high-stakes -- is re-evaluated here from the same facts. It
    -- cannot have moved in between: the sequencing law refuses a second run while a draft is
    -- outstanding, so the ramp predicate is frozen for this entry's whole draft life. (A
    -- created_at/approved_at timestamp comparison was tried and REJECTED: it reads 'post' for
    -- any caller that drafts and approves inside ONE transaction, which is what a harness does.)
    v_mode := case when exists (select 1 from clara.journal_entries j
                       where j.client_id = e.client_id and j.origin = 'scheduled_run'
                         and j.status = 'approved' and j.reversed_by is null and j.id <> p_entry
                         and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id)
                     and not clara.is_high_stakes(p_entry)
                   then 'post' else 'draft' end;
    insert into clara.fa_depreciation_runs(firm_id, client_id, authority_id, period_start,
        period_end, mode, entries, charged_cents, skipped, entry_id, op_key)
      values (e.firm_id, e.client_id, au.id, v_ps, v_pe, v_mode,
        (v_recomp ->> 'entries')::int, (v_recomp ->> 'charged_cents')::bigint,
        v_recomp -> 'skipped', p_entry, v_prop ->> 'op_key')
      returning id into v_run;
    for d in select (x ->> 'asset_id')::uuid as asset_id, (x ->> 'period_start')::date as ps,
                    (x ->> 'period_end')::date as pe, (x ->> 'amount_cents')::bigint as amt
             from jsonb_array_elements(v_prop -> 'charges') x order by 1, 2 loop
      -- THE OVERLAP REFUSAL (design SS1.3). The partial unique index catches only an EXACT
      -- duplicate range; ranges legitimately span months (the annual arm, stubs), so the
      -- overlapping case needs its own probe. Client-rung-serialised, so a plain probe is
      -- sound.
      if clara._fa_range_covered(d.asset_id, d.ps, d.pe) then
        raise exception 'a live depreciation charge already covers % .. % for asset %', d.ps, d.pe, d.asset_id
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'fa_charge_overlap', 'asset_id', d.asset_id,
              'period_start', d.ps, 'period_end', d.pe)::text;
      end if;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (e.firm_id, e.client_id, d.asset_id, d.ps, d.pe, d.amt,
          e.posting_date, p_entry, v_run, null, true);
      perform clara._append_event(e.firm_id, 'asset.depreciated', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', d.asset_id, 'run_id', v_run, 'period_start', d.ps,
          'period_end', d.pe, 'amount_cents', d.amt));
    end loop;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (2) THE DISPOSAL PROPOSAL (design SS4.2/SS4.3).
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'fa_disposal' then
    v_prop := e.flags -> 'fa_disposal';
    v_dispose_date := (v_prop ->> 'disposal_date')::date;
    select * into a from clara.fixed_assets where id = (v_prop ->> 'asset_id')::uuid;
    if not found or a.client_id <> e.client_id then
      raise exception 'the disposal proposal names an asset that is not this client''s'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'asset')::text;
    end if;
    -- BOUND TO THIS CLIENT AND THIS REQUEST, not merely to the firm [round-3 small / STR minor
    -- 1] -- the same request-hash re-derivation the depreciation arm uses. The disposal verb
    -- hashes exactly these fields, and the proposal carries every one of them, so the receipt
    -- lookup is an exact match on the act that minted it rather than a firm-wide oracle.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id and r.fn = 'dispose_fixed_asset'
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id, 'asset', a.id,
                           'disposal_date', v_dispose_date,
                           'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint,
                           'proceeds_account', v_prop ->> 'proceeds_account',
                           'gain_account', v_prop ->> 'gain_account',
                           'loss_account', v_prop ->> 'loss_account',
                           'cost_portion_cents',
                             nullif(v_prop ->> 'cost_portion_cents', '')::bigint))) then
      raise exception 'this disposal proposal carries no issuer op-key receipt for this client and request; re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'issuer')::text;
    end if;
    if a.status <> 'active' or not clara._fa_particulars_complete(a) then
      raise exception 'this asset is no longer an active, complete register row; re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'lifecycle',
            'asset_id', a.id, 'status', a.status)::text;
    end if;
    -- FRESHNESS on the stub, same doctrine as the run arm. THE SAME ONE BODY THE VERB CALLED
    -- [round-4 fold G2b] -- the stub now spans the lineage (ancestor months inside the disposal
    -- period ride it), so re-deriving it from clara._fa_asset_charges alone would refuse every
    -- revised asset's disposal as stale. Sorted by (asset, period) because the array is no
    -- longer single-asset and a period-only sort is not a total order across rows.
    v_recomp := clara._fa_disposal_stub(a.id, v_dispose_date);
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_want from jsonb_array_elements(v_recomp -> 'charges') x;
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_have from jsonb_array_elements(coalesce(v_prop -> 'stub_charges', '[]'::jsonb)) x;
    if v_want is distinct from v_have then
      raise exception 'the register moved since this disposal was proposed; withdraw this draft and re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'stub',
            'asset_id', a.id)::text;
    end if;
    -- AND THE ACCUMULATED RELIEF IS RE-DERIVED TOO [round-3.5 fold G1]. The stub fingerprint
    -- above pins only THIS row's own uncharged months; the GL's accumulated-depreciation debit
    -- leg -- and therefore NBV and the gain or loss on this disposal -- is a LINEAGE figure. An
    -- ANCESTOR charged (or reversed) between draft and approve moves it silently, and the entry
    -- the checker approves would then relieve an amount the register no longer holds, breaking
    -- the tie at the disposal date with nothing to say why. Re-derived from the SAME period-net
    -- decomposition the verb used, under the same locks, and refused by name if it moved.
    v_bake := coalesce(a.accumulated_depreciation_cents, 0);
    v_stub_total := (v_recomp ->> 'amount_cents')::bigint;
    v_ledger_at := clara._fa_accumulated_periods_through(a.id,
                     clara._fa_month_end(v_dispose_date)) - v_bake + v_stub_total;
    v_accum_at := v_bake + v_ledger_at;
    v_portion := nullif(v_prop ->> 'cost_portion_cents', '')::bigint;
    v_disp_accum := case when v_portion is null then v_accum_at
                         else round(v_bake::numeric * v_portion / a.cost_cents)::bigint
                            + round(v_ledger_at::numeric * v_portion / a.cost_cents)::bigint end;
    if v_disp_accum is distinct from nullif(v_prop ->> 'accum_relieved_cents', '')::bigint then
      raise exception 'the accumulated depreciation this disposal relieves moved since it was proposed; withdraw this draft and re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'accum',
            'asset_id', a.id, 'proposed_cents',
            nullif(v_prop ->> 'accum_relieved_cents', '')::bigint,
            'recomputed_cents', v_disp_accum)::text;
    end if;
    -- THE STUB MATERIALISES HERE, beside the disposal, from the same one hook. PER ASSET
    -- ALREADY: the wire shape has always carried asset_id and this loop has always minted from
    -- it, which is why the G2b lineage extension needed no new mechanism here -- an ancestor's
    -- month lands on the ANCESTOR's row, and the entry's single expense/accumulated leg pair
    -- carries the total (clara._fa_disposal_stub refuses a lineage whose account codes diverge).
    for d in select (x ->> 'asset_id')::uuid as asset_id, (x ->> 'period_start')::date as ps,
                    (x ->> 'period_end')::date as pe, (x ->> 'amount_cents')::bigint as amt
             from jsonb_array_elements(coalesce(v_prop -> 'stub_charges', '[]'::jsonb)) x
             order by 1, 2 loop
      if clara._fa_range_covered(d.asset_id, d.ps, d.pe) then
        raise exception 'a live depreciation charge already covers % .. % for asset %', d.ps, d.pe, d.asset_id
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'fa_charge_overlap', 'asset_id', d.asset_id,
              'period_start', d.ps, 'period_end', d.pe)::text;
      end if;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (e.firm_id, e.client_id, d.asset_id, d.ps, d.pe, d.amt,
          v_dispose_date, p_entry, null, null, true);
      perform clara._append_event(e.firm_id, 'asset.depreciated', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', d.asset_id, 'run_id', null, 'period_start', d.ps,
          'period_end', d.pe, 'amount_cents', d.amt));
    end loop;

    v_portion := nullif(v_prop ->> 'cost_portion_cents', '')::bigint;
    if v_portion is null then
      update clara.fixed_assets set status = 'disposed', disposed_at = v_dispose_date,
        disposal_entry_id = p_entry, updated_at = now() where id = a.id;
      perform clara._append_event(e.firm_id, 'asset.disposed', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', a.id, 'partial', false, 'disposal_date', v_dispose_date,
          'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint));
    else
      -- THE SUPERSEDE SPLIT (design SS4.3; WD-R7). The original -> superseded; two successors
      -- born with effective_from = THE ENTRY'S POSTING DATE, so a pre-split as-of read sees
      -- ONLY the original and a post-split read sees ONLY the successors. That effective
      -- dating is what makes the round-2 worked RM100,000 double-count unrepresentable
      -- [L2/round-2 fold 3]. THE REMAINDER ABSORBS ALL ROUNDING (WD-R7's sen law), so
      -- register totals tie at every as-of by construction rather than by luck.
      v_cost := a.cost_cents;
      v_res := coalesce(a.residual_cents, 0);
      -- THE BAKE CARRIES THE BASELINE SHARE AND NOTHING ELSE [round-3 fold F1]. The parent's
      -- LEDGER content is not divided here at all -- clara._fa_accumulated_at pro-rates it at
      -- READ time, by the same remainder-absorbing rule, so a charge that lands on the
      -- superseded parent after the split still reaches the continuing successor instead of
      -- disappearing into a frozen number. Only the CARRIED baseline (which can never move) is
      -- split now, with the remainder absorbed by the continuing row exactly as before.
      v_accum := coalesce(a.accumulated_depreciation_cents, 0);
      v_accum_share := round(v_accum::numeric * v_portion / v_cost)::bigint;
      v_res_share := round(v_res::numeric * v_portion / v_cost)::bigint;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
          asset_account_code, accum_depr_account_code, depr_expense_account_code,
          accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
          supersedes_asset_id, effective_from, disposed_at, disposal_entry_id,
          ca_class, is_commercial_vehicle, is_new)
        values (e.firm_id, e.client_id, a.description || ' (disposed portion)', a.acquired_date,
          v_portion, v_res_share, a.useful_life_months, a.depreciation_method,
          a.depreciation_rate_bps, a.asset_account_code, a.accum_depr_account_code,
          a.depr_expense_account_code, v_accum_share, a.depreciation_start_date, e.posting_date,
          'disposed', a.id, e.posting_date, v_dispose_date, p_entry,
          a.ca_class, a.is_commercial_vehicle, a.is_new)
        returning id into v_disposed;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
          asset_account_code, accum_depr_account_code, depr_expense_account_code,
          accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
          supersedes_asset_id, effective_from, ca_class, is_commercial_vehicle, is_new)
        values (e.firm_id, e.client_id, a.description, a.acquired_date,
          v_cost - v_portion, v_res - v_res_share, a.useful_life_months, a.depreciation_method,
          a.depreciation_rate_bps, a.asset_account_code, a.accum_depr_account_code,
          a.depr_expense_account_code, v_accum - v_accum_share, a.depreciation_start_date,
          e.posting_date, 'active', a.id, e.posting_date,
          a.ca_class, a.is_commercial_vehicle, a.is_new)
        returning id into v_cont;
      -- SPLIT LINEAGE LAW (design SS1.1): superseded_by_asset_id always names the CONTINUING
      -- successor; the disposed portion is reachable upward only, and every read traverses up.
      update clara.fixed_assets set status = 'superseded', superseded_by_asset_id = v_cont,
        superseded_at = e.posting_date, updated_at = now() where id = a.id;
      perform clara._append_event(e.firm_id, 'asset.disposed', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', a.id, 'partial', true, 'disposal_date', v_dispose_date,
          'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint,
          'disposed_asset_id', v_disposed, 'continuing_asset_id', v_cont));
    end if;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (3) THE REVERSAL MIRROR: THE APPROVE-TIME TWINS (design SS2.4). Dependency-ordered --
  -- acquisition first (it refuses while descendants live), then the disposal restore, then
  -- the charge unwinds -- so every refusal reads UNTOUCHED state.
  -- K-family mirrors are skipped: the K-family owns its own rows (WD-R1's exclusion).
  -- -----------------------------------------------------------------------------------
  if e.reversal_of is not null and not e.is_opening_balance then
    select * into o from clara.journal_entries where id = e.reversal_of;

    -- EVERY REFUSAL READS UNTOUCHED STATE. All three probes run FIRST, from the one body the
    -- verb-side guard also calls (S2.4b), so no arm can mutate the world a later refusal is
    -- about to read, and the verb and the hook can never name different tokens.
    perform clara._fa_reversal_blocked(o.id);

    -- (3a) ACQUISITION REVERSAL -- the WHOLE revision chain unwinds (S2.4b law 1).
    if exists (select 1 from clara.fixed_assets f where f.acquisition_entry_id = o.id) then
      -- A superseded predecessor being unwound must ALSO release superseded_by_asset_id: the
      -- 0017 CHECK reads (status='superseded') = (superseded_by is not null), so leaving the
      -- link behind on an unwound row would violate it. Clearing it is honest anyway -- the
      -- revision it named is being unwound in the same statement.
      update clara.fixed_assets set status = 'unwound', superseded_by_asset_id = null,
        superseded_at = null, updated_at = now()
        where id = any(clara._fa_reversal_lineage(o.id)) and status <> 'unwound';
    end if;

    -- (3c) DISPOSAL REVERSAL -- full restore, or the PARTIAL-SPLIT reversal [L2/round-2 fold
    -- 9], DISCRIMINATED ON THE ENTRY [round-3 fold F4]: a partial disposal is one whose own
    -- fa_disposal proposal named a cost portion. Row lineage cannot decide this -- a revision
    -- successor and a split successor both carry supersedes_asset_id.
    if exists (select 1 from clara.fixed_assets f where f.disposal_entry_id = o.id) then
      if (o.flags -> 'fa_disposal' ->> 'cost_portion_cents') is not null then
        select * into a from clara.fixed_assets
          where disposal_entry_id = o.id and supersedes_asset_id is not null
            and status <> 'unwound' limit 1;
        if found then
          select * into su from clara.fixed_assets where id = a.supersedes_asset_id;
          -- THE WHOLE CLEAN CHAIN BELOW BOTH CHILDREN UNWINDS [round-3.5 fold G5], through the
          -- same closure the guard above admitted: a particulars revision made on a split
          -- successor is part of the split, not an independent act, and leaving it behind
          -- 'active' while its parent is unwound would strand a register row whose cost the GL
          -- no longer carries. Superseded links are released for the same 0017-CHECK reason arm
          -- 3a states: (status='superseded') = (superseded_by is not null).
          update clara.fixed_assets set status = 'unwound', disposed_at = null,
            disposal_entry_id = null, superseded_by_asset_id = null, superseded_at = null,
            updated_at = now()
            where id = any(clara._fa_revision_closure(
                            (select coalesce(array_agg(k.id), '{}'::uuid[])
                               from clara.fixed_assets k
                              where k.supersedes_asset_id = su.id and k.status <> 'unwound')))
              and status <> 'unwound';
          update clara.fixed_assets set status = 'active', superseded_by_asset_id = null,
            superseded_at = null, updated_at = now() where id = su.id;
        end if;
      else
        update clara.fixed_assets set status = 'active', disposed_at = null,
          disposal_entry_id = null, updated_at = now() where disposal_entry_id = o.id;
      end if;
    end if;

    -- (3b) CHARGE UNWINDS. is_live LAW (design SS1.3): FLIP the original false, THEN append
    -- the unwind row born DEAD. Neither can collide, because an unwind row never enters the
    -- partial unique index. Effective-dated at the MIRROR'S posting date (which the SS5.2 MYT
    -- splice makes the Malaysian legal date), so an as-of read before the reversal still sees
    -- the charge -- which is the truth.
    for d in select * from clara.fa_depreciation where entry_id = o.id and is_live
             order by asset_id, period_start loop
      update clara.fa_depreciation set is_live = false where id = d.id;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (d.firm_id, d.client_id, d.asset_id, d.period_start, d.period_end,
          d.amount_cents, e.posting_date, p_entry, null, d.id, false);
      v_unwound := v_unwound + 1;
    end loop;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (4) SOFT-BIRTH (design SS2.2; WD-R1). One row per LINE -- a multi-unit leg births one
  -- row (SS4.3's split divides later) and freight on a second line births a second row BY
  -- DESIGN: no merge door exists, and the practice is one asset per line (SS9.4).
  -- EXCLUSIONS: K-family entries (the carry-down owns its own rows, and including them
  -- double-birthed at K5 and wedged K6) and reversal mirrors (arm 3 owns those).
  -- -----------------------------------------------------------------------------------
  -- A DISPOSAL NEVER BIRTHS [round-3.5 fold G4]. A disposal's accumulated-depreciation relief
  -- is a DEBIT, and the day a freed accumulated code is re-enrolled as some other profile's
  -- COST account that debit matches this join and soft-births a phantom register row with a
  -- fabricated cost -- probed end to end. The reservation predicate (S2.4c) now makes that
  -- re-enrolment unreachable, and this exclusion closes the mechanical site itself, so the
  -- phantom needs BOTH guards to fail rather than either.
  if not e.is_opening_balance and e.reversal_of is null and not (e.flags ? 'fa_disposal') then
    for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                    fp.accum_depr_account_code as accum_code,
                    fp.depr_expense_account_code as expense_code
             from clara.journal_lines jl
             join clara.fa_account_profiles fp on fp.client_id = jl.client_id
               and fp.asset_account_code = jl.account_code and fp.active
             where jl.entry_id = p_entry and jl.debit_cents > 0
             order by jl.id loop
      v_asset := null;
      -- #932 (0277): THE ACCOUNT'S LIVE DEFAULT DEPRECIATION POLICY, IF ANY — the SAME lookup
      -- §E's recut of the deferred trigger makes. THIS is the birth site that actually fires
      -- for a normal approve (this file's header): arm 4 runs synchronously, before the
      -- deferred trigger's own commit-time fire, and both share one conflict target, so
      -- whichever inserts first wins and the other's "on conflict … do nothing" absorbs it.
      select * into v_pol from clara.fa_account_depreciation_policies
        where client_id = e.client_id and asset_account_code = l.account_code and active
        limit 1;
      -- #932 FIX ROUND (0280): THE SAME ENROLMENT-CONGRUENCE GUARD §B gives the deferred
      -- trigger, for the same reason and in the same words (see §B's own note): a policy whose
      -- enrolment has since been re-issued as non-depreciable is DECLINED, and the row births
      -- pending rather than COMPLETE-and-unchargeable.
      if v_pol.id is not null and not (l.accum_code is null and v_pol.method <> 'none') then
        v_method := v_pol.method; v_life := v_pol.useful_life_months; v_rate := v_pol.rate_bps;
        v_residual := v_pol.residual_cents; v_start := e.posting_date;
        v_pol_id := v_pol.id; v_pol_ver := v_pol.version;
        v_desc := 'Fixed asset - ' || l.account_code || ' RM'
          || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
      else
        v_method := case when l.accum_code is null then 'none' end;
        v_life := null; v_rate := null; v_residual := 0; v_start := null;
        v_pol_id := null; v_pol_ver := null;
        v_desc := 'Fixed asset (particulars pending) - ' || l.account_code || ' RM'
          || to_char(l.debit_cents / 100.0, 'FM999999999990.00');
      end if;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, depreciation_method, asset_account_code, accum_depr_account_code,
          depr_expense_account_code, acquisition_entry_id, acquisition_line_id,
          accumulated_depreciation_cents, status,
          useful_life_months, depreciation_rate_bps, depreciation_start_date,
          depreciation_policy_id, depreciation_policy_version)
        values (e.firm_id, e.client_id, v_desc,
          e.posting_date, l.debit_cents, v_residual, v_method,
          l.account_code, l.accum_code, l.expense_code, p_entry, l.line_id,
          0, 'active', v_life, v_rate, v_start, v_pol_id, v_pol_ver)
        on conflict (acquisition_line_id) do nothing
        returning id into v_asset;
      if v_asset is not null then
        perform clara._append_event(e.firm_id, 'asset.acquired', e.client_id, v_actor,
          null, null, p_entry, e.document_id, null,
          jsonb_build_object('asset_id', v_asset, 'line_id', l.line_id,
            'cost_cents', l.debit_cents,
            'depreciation_policy_id', v_pol_id, 'depreciation_policy_version', v_pol_ver));
      end if;
    end loop;
  end if;
end $$;
revoke all on function clara._fa_on_approve(uuid) from public;

-- =====================================================================================
-- §D THE CATALOG COMMENT, ACCRETED. Everything up to and including "...read the other's signal."
--    is 0278's own text, copied VERBATIM from 0278_fa_belt_birth_convention.sql:180-199 (never
--    retyped from a printed value); the tail hashes its first 1553 characters against 0278's own
--    measured text to prove it. One new sentence follows. #882's own review note stands: any
--    later file that re-comments this function accretes, never replaces.
-- =====================================================================================
comment on function clara._tf_fa_acquisition_birth() is
  '#639: the LANE-AGNOSTIC fixed-asset acquisition birth. A deferred constraint trigger on '
  'clara.journal_entries, named to fire before t_je_fa_movement_belt (deferred triggers fire in '
  'alphabetical trigger-name order -- measured on clara_639, PG 17.11). Idempotent against '
  'clara._fa_on_approve arm 4 through the same on conflict (acquisition_line_id) do nothing. '
  '#972 (0247): the join carries the 0041 §1.2 enrolment watermark as the exact negation of '
  'clara.fa_register_tie''s own pre-enrolment test. #932 (0277): when the account carries a live '
  'clara.fa_account_depreciation_policies row, the register row is born COMPLETE from it '
  '(method, life-or-rate, residual, and a depreciation_start_date of the acquisition''s OWN '
  'posting date) and stamps the policy''s id and version; an account with no policy still births '
  'the pending row exactly as before. '
  '#882 (0278): this join reads fp.active -- the CURRENT enrolment flag, evaluated when THIS '
  'trigger fires (also deferred, also at commit) -- never the CLOSED approved_at interval '
  'clara._tf_fa_movement_belt reads (see that function''s own comment). A same-transaction '
  'retire-and-approve therefore makes the two triggers disagree: this side declines to birth '
  '(fp.active reads false by firing time) while the belt still matches (its closed interval '
  'catches the equality instant) and finds no register row, so it raises CLR40 '
  'fa_belt_unregistered_movement. Owner ruling 2026-09-18 (#882): that outcome stays -- the '
  'instant is reachable by no production door, and neither trigger is widened to read the '
  'other''s signal. '
  '#932 FIX ROUND (0280): a policy applies only while it still FITS the enrolment it was '
  'validated against. Re-issuing the enrolment with no accumulated-depreciation account leaves a '
  'depreciating policy live, and a row born from it would be COMPLETE with nowhere to post -- so '
  'this trigger declines a live policy whose method is not none when the CURRENT enrolment '
  'carries no accumulated-depreciation account, and births the pending row instead.';

reset role;

-- =====================================================================================
-- §T THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p932c_tail$
declare v_src text; v_n int; v_pin record; v_comment text; v_prefix_sha text;
begin
  -- T.1 THE BIRTH BODY carries the guard exactly once, and every marker 0277's own tail T.3
  -- pinned is still there exactly as often -- a recut that damaged 0247's exclusions, the #972
  -- watermark, the single conflict-targeted insert or either description literal fails HERE
  -- rather than in a behavioural cell far from this file.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  for v_pin in select * from (values
      ($$if v_pol.id is not null and not (l.accum_code is null and v_pol.method <> 'none') then$$, 1),
      -- TWICE in this body: once on the guard itself, once on the SPEC-932-2 prose correction
      -- inside the covered branch (the header says why both ride here).
      ('#932 FIX ROUND (0280)', 2),
      ('from clara.fa_account_depreciation_policies', 1),
      ('insert into clara.fixed_assets(', 1),
      ('on conflict (acquisition_line_id) do nothing', 1),
      ($$'asset.acquired'$$, 1),
      ('if new.is_opening_balance then return null; end if;', 1),
      ('if new.reversal_of is not null then return null; end if;', 1),
      ($$if new.flags ? 'fa_disposal' then return null; end if;$$, 1),
      ($$if new.origin = 'scheduled_run' then return null; end if;$$, 1),
      ('coalesce(new.approved_at, new.created_at) >= fp.enrolled_at', 1),
      ($$'Fixed asset (particulars pending) - '$$, 1),
      ($$'Fixed asset - '$$, 1),
      -- ...and the UNGUARDED form is GONE from both bodies: the defect this file closes cannot
      -- be half-closed.
      ($$    if v_pol.id is not null then$$, 0)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#932 fix-round tail T.1: the recut birth body carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._tf_fa_acquisition_birth()'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#932 fix-round tail T.1b: clara._tf_fa_acquisition_birth lost its owner, its SECURITY DEFINER flag or its pinned search_path' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.journal_entries'::regclass and t.tgname = 't_je_fa_acquisition_birth'
     and t.tgdeferrable and t.tginitdeferred and not t.tgisinternal
     and t.tgfoid = 'clara._tf_fa_acquisition_birth()'::regprocedure;
  if v_n <> 1 then
    raise exception '#932 fix-round tail T.1c: t_je_fa_acquisition_birth is no longer the deferred constraint trigger on this recut body' using errcode='CLR10';
  end if;

  -- T.2 ARM 4 -- the site that actually fires for an ordinary approve -- carries the SAME guard,
  -- and 0277's own non-regression roster for the three arms it does NOT touch still reads.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._fa_on_approve(uuid)'::regprocedure;
  for v_pin in select * from (values
      ($$if v_pol.id is not null and not (l.accum_code is null and v_pol.method <> 'none') then$$, 1),
      ('#932 FIX ROUND (0280)', 1),
      ('from clara.fa_account_depreciation_policies', 1),
      ('on conflict (acquisition_line_id) do nothing', 1),
      ($$'Fixed asset (particulars pending) - '$$, 1),
      ($$'Fixed asset - '$$, 1),
      ($$e.flags ? 'depreciation_charges'$$, 1),
      ($$e.flags ? 'fa_disposal'$$, 2),
      ('e.reversal_of is not null and not e.is_opening_balance', 1),
      ('clara._fa_reversal_blocked(o.id)', 1),
      ($$      if v_pol.id is not null then$$, 0)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#932 fix-round tail T.2: the recut clara._fa_on_approve carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_on_approve(uuid)'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#932 fix-round tail T.2b: clara._fa_on_approve lost its owner, its SECURITY DEFINER flag or its pinned search_path' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'clara' and p.proname = '_subledger_on_approve'
                    and p.prosrc like '%clara._fa_on_approve(%') then
    raise exception '#932 fix-round tail T.2c: clara._subledger_on_approve no longer calls clara._fa_on_approve' using errcode='CLR10';
  end if;

  -- T.3 THE COMMENT is 0278's own 1553 characters byte-exact, PLUS this file's sentence, and
  -- every earlier provenance marker is still readable.
  select obj_description('clara._tf_fa_acquisition_birth()'::regprocedure, 'pg_proc') into v_comment;
  if v_comment is null or char_length(v_comment) <= 1553 then
    raise exception '#932 fix-round tail T.3: the birth''s comment did not grow past 0278''s 1553 characters' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(substring(v_comment from 1 for 1553), 'UTF8')), 'hex') into v_prefix_sha;
  if v_prefix_sha <> '5a5c1d9821c1fdbf8a2039137b8d281b3827bc424a5cdd67a2db83f77b1c628a' then
    raise exception '#932 fix-round tail T.3b: the birth''s first 1553 characters no longer hash to 0278''s measured text (sha %) -- the accretion REWROTE history instead of extending it', v_prefix_sha
      using errcode='CLR10';
  end if;
  if position('#639' in v_comment) = 0 or position('#972 (0247)' in v_comment) = 0
     or position('#932 (0277)' in v_comment) = 0 or position('#882 (0278)' in v_comment) = 0
     or position('#932 FIX ROUND (0280)' in v_comment) = 0 then
    raise exception '#932 fix-round tail T.3c: the birth''s comment lost a provenance marker (#639 / #972 (0247) / #932 (0277) / #882 (0278)) or never gained this file''s own' using errcode='CLR10';
  end if;

  -- T.4 NOTHING ELSE MOVED. The four bodies this file does not touch are still at the shas its
  -- prestate pinned, and neither recut body gained or lost a grant (both are ungranted trigger/
  -- hook bodies reached only through their own callers' DEFINER contexts).
  for v_pin in select * from (values
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
       '14cba9a309642dafa8a39131a3b850f9663b5b7d64e3fea8632852c11af0e41c'),
      ('clara._fa_particulars_complete(clara.fixed_assets)',
       '4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9'),
      ('clara.set_fa_depreciation_policy(uuid,text,text,int,int,bigint,text,text)',
       '11f0aa0a82334438bebb3dadd1c990c08ebd0b014eabf7d86d41204c2820b67d'),
      ('clara._fa_asset_json(uuid,date)',
       '41dc64108fd2eea95a61720e6b0e940cef1b0cb3957e264dfa5a04fc09a0bfd6')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_src is distinct from v_pin.sha then
      raise exception '#932 fix-round tail T.4: % MOVED (measured %, expected %)', v_pin.sig, v_src, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;
  if exists (
    select 1 from pg_proc p
     where p.oid in ('clara._tf_fa_acquisition_birth()'::regprocedure, 'clara._fa_on_approve(uuid)'::regprocedure)
       and p.proacl::text <> '{clara_fn_owner=X/clara_fn_owner}'
  ) then
    raise exception '#932 fix-round tail T.4b: a recut body''s ACL moved -- this file grants nothing' using errcode='CLR10';
  end if;

  raise notice '#932 fix-round tail OK: both birth sites decline a live policy whose method is not none when the CURRENT enrolment carries no accumulated-depreciation account, and fall through to 0247''s own UNCOVERED branch; every marker 0277''s tail pinned in both bodies still reads exactly as often; the birth''s catalog comment carries 0278''s 1553 characters byte-exact plus this file''s own sentence; and the four bodies this file does not touch, plus both recut bodies'' ACLs, are unmoved.';
end
$p932c_tail$;
