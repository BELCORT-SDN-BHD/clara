-- 0293_fa_arrears_judgement_scope — #975 FIX ROUND (riders wave 3, lane 04 review): A MATERIALITY
-- JUDGEMENT LICENSES THE FIGURE IT WAS MADE ABOUT, THE REFUSAL STATES THE NAMED YEAR'S OWN
-- AMOUNT, AND EVERY REMEDY IT NAMES IS ONE THE READER CAN ACTUALLY REACH.
-- =====================================================================================
-- Spec of record: issue #975, its owner ruling of 2026-09-20, and the lane's own review
-- (adversarial ADV-L04-2 blocker, ADV-L04-3 and ADV-L04-4 major; spec SPEC-975-1 major and
-- SPEC-975-2 minor). All three were reproduced end to end on clara_l04 before this file was
-- written, by cells that now live in tests/fa-arrears-resolution.test.mjs.
--
-- THREE DEFECTS, ONE FAMILY: 0279 asks the right question and then mis-states the answer's scope.
--
-- (1) A JUDGEMENT ABOUT ONE AMOUNT AUTHORISED FOLDING ANY LATER AMOUNT (ADV-L04-2 / SPEC-975-2).
--     `clara.record_fa_arrears_resolution` enforces "a materiality judgement is made ABOUT an
--     amount" at RECORD time: it re-measures the year and refuses CLR37 `arrears_changed` when
--     the figure moved between the question and the answer, because recording it "would put a
--     stale ruling on the file" (0279's own comment). `clara._fa_run_period_core` applied no such
--     test at FOLD time: it read the CURRENTLY measured arrears and the STORED choice and never
--     compared the two. DRIVEN: a fold_current recorded about 10,000 sen proceeded to fold
--     20,000 sen, and the receipt named the very record whose own stored figure was 10,000. That
--     is Clara defaulting the materiality judgement the owner's ruling says she may never make.
--     A year whose live resolution was made about a different figure is now treated as
--     UNANSWERED on its own axis, `arrears_changed_since_judgement`, which names BOTH figures.
--     AC2's "a later run proceeds on the record without asking again" is unchanged for the
--     unmoved figure, which is what AC2 is about.
--
-- (2) THE REFUSAL STATED THE CLIENT-WIDE TOTAL AS THE NAMED YEAR'S AMOUNT (ADV-L04-3 /
--     SPEC-975-1). 0279 raised and parked with `v_arr ->> 'arrears_cents'` -- the sum over EVERY
--     closing/closed year carrying arrears, including years already answered -- while naming only
--     the FIRST unresolved year's label. It compounds: the record door re-measures PER YEAR, so a
--     caller answering with the number the refusal had just stated was refused CLR37
--     `arrears_changed` and the run stayed blocked. The web panel escaped it only because it
--     passes its own per-year figure; the documented chat path did not. Every sentence and every
--     `detail.arrears_cents` now carries the NAMED year's own amount, and the client-wide total
--     rides beside it under `total_arrears_cents`.
--
-- (3) reopen_prior WAS ADMITTED ON A YEAR THAT IS ONLY "CLOSING", WHOSE REMEDY DOES NOT EXIST
--     (ADV-L04-4). `clara._tf_fiscal_years_lifecycle` (0056:334-336) admits
--     open|reopened -> closing, closing -> open|closed, and closed -> reopened. There is NO
--     closing -> reopened edge, and `clara.reopen_fiscal_year` is the closed -> reopened verb.
--     DRIVEN: recording reopen_prior on a CLOSING year was admitted, the run then refused CLR38
--     `arrears_awaiting_reopen` with remedy `reopen_fiscal_year`, and that remedy's own write was
--     refused CLR10 `fy_lifecycle_edge_invalid`. The record door now refuses reopen_prior while
--     the year is still closing, on its own axis `year_still_closing`, naming
--     `clara.finalize_close` -- the edge that does exist. fold_current stays open on a closing
--     year, so this refuses one unreachable remedy and never the question ("nothing dark").
--     The run core derives its own awaiting-remedy from the named year's status too, for the one
--     path that can still reach a closing year with a live reopen_prior row on it
--     (closed -> reopened -> closing after the judgement was made).
--
-- WHAT THIS FILE IS. Two `create or replace function` statements -- 0279's own bodies for
-- `clara.record_fa_arrears_resolution` and `clara._fa_run_period_core`, taken byte for byte and
-- changed only in the places the three defects live -- and three static ACL statements
-- re-asserting the record door's grant. It creates no relation, mints no function, adds no role
-- and moves no grant, so it owes no rig-meta cohort (0278 and 0292 make the same claim for the
-- same reason). It contains NO dynamic SQL at all -- the ACL is three literal statements rather
-- than 0279's bulk loop -- so it needs no reviewed-barrier entry in
-- apps/web/tests/firm-scope-db-pins.corpus.ts either.
--
-- WHY A SEPARATE FILE AND NOT AN EDIT TO 0279. #957's redo path re-applies only the HIGHEST
-- applied version, and 0279 is no longer it. The number is provisional and is claimed at MERGE;
-- the battery gates on the STABLE STEM (`fa_arrears_judgement_scope$`), never on the number.
--
-- NOT TOUCHED, AND PINNED: `clara._fa_closed_arrears` (the figure itself is 0279's arithmetic and
-- is right -- only its SCOPE was mis-stated), the due oracle, the preview, both run verbs, the
-- Work lane's run door, `clara._fa_assert_period_open`, `clara.reopen_fiscal_year` and
-- `clara.finalize_close`.
-- =====================================================================================

do $p975b_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false;
  -- THE LIVE PRE-IMAGES, measured off pg_proc.prosrc on the lane-04 rig (clara_l04, PG 17, chain
  -- 0001..0279 plus this lane's own fix-round sibling, renumbered 0292 at merge) moments before
  -- this file was written, never transcribed from an earlier migration's header.
  c_core_pre constant text :=
    '5679c4ab696a3e9b48fede3054511c5d9e236c59cf4ceb9f72062fcb11ad4105';
  c_record_pre constant text :=
    '4a94c2abae6b00334f252ff7ab3e96fb7c42262a20e1affe3b2dceae2d225de1';
begin
  if to_regclass('clara.fa_arrears_resolutions') is null
     or to_regprocedure('clara._fa_closed_arrears(uuid,date)') is null then
    raise exception '#975 fix-round prestate: 0279 is absent -- it must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957.) Both statements below are
  -- `create or replace function` and the three ACL statements are idempotent, so a redo is safe
  -- by construction; only the pre-image pins need a redo branch. The signal is the marker only
  -- this file writes.
  select p.prosrc into v_sha from pg_proc p
   where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
  if position('#975 FIX ROUND (0293' in coalesce(v_sha, '')) > 0 then
    v_redo := true;
    raise notice '#975 fix-round prestate: the recut run core already carries this file''s marker -- treating this as a #957 REDO of 0293 itself. Every statement below is redo-safe by construction; the tail re-proves the whole post-state from scratch.';
  end if;

  for v_pin in select * from (values
      ('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)', c_core_pre),
      ('clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)', c_record_pre)
      ) as t(sig, sha) loop
    if v_redo then continue; end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is null then
      raise exception '#975 fix-round prestate: % is absent', v_pin.sig using errcode = 'CLR10';
    end if;
    if v_sha <> v_pin.sha then
      raise exception '#975 fix-round prestate: % has DRIFTED from its pinned pre-image (measured %, expected %) -- this file carries 0279''s bodies byte for byte apart from the three defects it closes, so re-derive it against the LIVE body before applying', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- NON-REGRESSION, pinned and NOT recut by this file. `clara._fa_closed_arrears` heads the list
  -- deliberately: the FIGURE it computes was never wrong, only the scope the refusal quoted it
  -- at, and this file changes no arithmetic.
  for v_pin in select * from (values
      ('clara._fa_closed_arrears(uuid,date)',
       '46344076dfe5357020a32e89337296210f7ca25ef7e783aa46403ec16912dd17'),
      ('clara._fa_oldest_unmet_period(uuid)',
       '1e2f3b5105c832237fefe020968905575ae6a63560c6da0cac88bf2fd7b5dcd3'),
      ('clara.preview_depreciation_run(uuid)',
       '28af775de5a805a9a2acd486a798ef63ee901c99e0e4b0d54032a64f671b1b09'),
      ('clara.run_depreciation_period_for(uuid,date,text,uuid)',
       '02d610598649a4d584ad1449ecc70bd27cec268744cc6c24b9aea3a009ee68b1'),
      ('clara.run_depreciation_manual(uuid,date,date,text)',
       '5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8'),
      ('clara.run_depreciation_period(uuid,date,date,text)',
       '8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921'),
      ('clara._fa_assert_period_open(uuid,date)',
       '1409428decf47d69743ef6fcbddedebae88716dd5185514ed10614cc3e409de0'),
      ('clara.reopen_fiscal_year(uuid,text,jsonb,text,text)',
       '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5'),
      ('clara.finalize_close(uuid,text,text)',
       '59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#975 fix-round prestate: % MOVED (measured %, expected %) -- this file recuts exactly two bodies and nothing else', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#975 fix-round prestate: clean (% apply) -- both recut bodies are at their measured 0279 post-images and the nine bodies this file does NOT touch, including the arrears arithmetic itself, are unmoved.',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$p975b_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A THE RECORD DOOR, RECUT. 0279 §B2's body, byte for byte, plus ONE new wall: reopen_prior is
--    refused while the year is still CLOSING, because the remedy it names cannot be reached from
--    there. Nothing else in this body moves.
--
--    ONE THING THIS FILE DELIBERATELY DOES NOT CHANGE (ADV-L04-6, note). `p_period_start` and
--    `p_period_end` are stored verbatim and nothing validates them: they are CALLER-ASSERTED
--    PROVENANCE ONLY, recording which run the person was looking at when they judged. No money
--    and no decision moves on them -- the figure that is re-measured and enforced is the year's
--    arrears, and the year is checked against the client -- so a wrong pair makes the record read
--    as a judgement about a run that never happened, and nothing worse. Validating them against
--    the client's cadence window is a real improvement and a real widening of the ticket; it is
--    named in the lane's fix report as a follow-up rather than taken here without a brief.
-- =====================================================================================
create or replace function clara.record_fa_arrears_resolution(p_client uuid, p_fiscal_year uuid,
    p_choice text, p_arrears_cents bigint, p_period_start date, p_period_end date,
    p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; fy record; v_choice text;
  v_arr jsonb; v_year jsonb; v_measured bigint; v_prior uuid; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'record_fa_arrears_resolution', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'fiscal_year', p_fiscal_year,
      'choice', p_choice, 'arrears_cents', p_arrears_cents)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- THE CLIENT RUNG, the SAME per-client serialisation point the run itself takes (0041 S3.4),
  -- so an answer and a run on the same client ORDER rather than race: a run can never read an
  -- answer half-written, and two answers can never both win the partial unique index.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_choice := lower(btrim(coalesce(p_choice, '')));
  if v_choice not in ('fold_current', 'reopen_prior') then
    raise exception 'the resolution must be fold_current (IAS 8: the omission is immaterial) or reopen_prior (IAS 8: it is material and the year is restated)'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_arrears_resolution_invalid', 'axis', 'choice',
          'resolutions', jsonb_build_array('fold_current', 'reopen_prior'))::text;
  end if;

  select f.id, f.label, f.status, f.starts_on, f.ends_on, f.client_id
    into fy from clara.fiscal_years f where f.id = p_fiscal_year;
  if fy.id is null or fy.client_id is distinct from p_client then
    raise exception 'that fiscal year does not belong to this client'
      using errcode = 'CLR37',
        detail = '{"reason":"fa_arrears_resolution_invalid","axis":"not_this_client"}';
  end if;
  if fy.status not in ('closing', 'closed') then
    raise exception 'fiscal year % is %; only a closing or closed year raises an arrears question', fy.label, fy.status
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_arrears_resolution_invalid',
          'axis', 'year_not_closed', 'fy_status', fy.status)::text;
  end if;
  -- #975 FIX ROUND (0293, adversarial review ADV-L04-4): reopen_prior NAMES A REMEDY, and on a
  -- year that is only CLOSING that remedy does not exist. clara._tf_fiscal_years_lifecycle
  -- (0056:334-336) admits open|reopened -> closing, closing -> open|closed, and closed ->
  -- reopened -- there is NO closing -> reopened edge, and clara.reopen_fiscal_year is the
  -- closed -> reopened verb. Admitting the restatement here therefore left the run parked on
  -- `arrears_awaiting_reopen` behind an instruction nobody could carry out, with the only ways
  -- out being to supersede the judgement with the fold the accountant had just rejected, or to
  -- finalise the close -- neither of which anything said. This wall names the edge that DOES
  -- exist. It refuses ONE unreachable remedy, never the question: fold_current stays open on a
  -- closing year, and once the close is final reopen_prior is admitted as before.
  if v_choice = 'reopen_prior' and fy.status = 'closing' then
    raise exception 'fiscal year % is still CLOSING, so it cannot be reopened yet -- clara.reopen_fiscal_year takes a CLOSED year. Finalise the close first (clara.finalize_close) and then record the restatement, or fold this year into the current period if the omission is immaterial.', fy.label
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_arrears_resolution_invalid',
          'axis', 'year_still_closing', 'fiscal_year_id', p_fiscal_year,
          'fy_status', fy.status, 'remedy', 'finalize_close')::text;
  end if;

  v_arr := clara._fa_closed_arrears(p_client, fy.ends_on);
  select y into v_year from jsonb_array_elements(v_arr -> 'fiscal_years') y
   where (y ->> 'fiscal_year_id')::uuid = p_fiscal_year;
  v_measured := coalesce((v_year ->> 'arrears_cents')::bigint, 0);
  if v_measured <= 0 then
    raise exception 'fiscal year % carries no uncharged depreciation, so there is nothing to judge', fy.label
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_arrears_resolution_invalid',
          'axis', 'no_arrears', 'fiscal_year_id', p_fiscal_year)::text;
  end if;
  if p_arrears_cents is distinct from v_measured then
    raise exception 'the arrears for fiscal year % now stand at % sen, not the % sen this judgement was made about; look again before recording it', fy.label, v_measured, p_arrears_cents
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_arrears_resolution_invalid',
          'axis', 'arrears_changed', 'fiscal_year_id', p_fiscal_year,
          'stated_cents', p_arrears_cents, 'measured_cents', v_measured)::text;
  end if;

  -- APPEND-ONLY. A change of mind SUPERSEDES the live row and mints a fresh one, so both the old
  -- judgement and the new one keep their author and their timestamp.
  update clara.fa_arrears_resolutions
     set active = false, superseded_by = c.actor, superseded_at = now()
   where client_id = p_client and fiscal_year_id = p_fiscal_year and active
   returning id into v_prior;
  insert into clara.fa_arrears_resolutions(firm_id, client_id, fiscal_year_id, arrears_cents,
      choice, period_start, period_end, reason, decided_by)
    values (c.firm, p_client, p_fiscal_year, v_measured, v_choice, p_period_start, p_period_end,
      nullif(btrim(coalesce(p_reason, '')), ''), c.actor)
    returning id into v_id;

  perform clara._audit(c.firm, c.actor, null, null, 'record_fa_arrears_resolution', null,
    jsonb_build_object('client', p_client, 'fiscal_year', p_fiscal_year, 'fy_label', fy.label,
      'choice', v_choice, 'arrears_cents', v_measured, 'supersedes', v_prior,
      'period_start', p_period_start, 'period_end', p_period_end, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'record_fa_arrears_resolution', p_op_key,
    jsonb_build_object('status', 'recorded', 'resolution_id', v_id, 'client_id', p_client,
      'fiscal_year_id', p_fiscal_year, 'fy_label', fy.label, 'choice', v_choice,
      'arrears_cents', v_measured, 'supersedes', v_prior,
      'remedy', case when v_choice = 'reopen_prior' then 'reopen_fiscal_year' else null end));
end $$;

-- =====================================================================================
-- §A2 THE RECORD DOOR'S ACL, RE-ASSERTED. `create or replace function` keeps an existing
--     function's owner and ACL, so these three statements change nothing on this rig; they are
--     here so a reader of THIS file can see the door is clara_authenticated-only and never
--     clara_runtime (materiality is a human judgement), and so a hand-restored body cannot leave
--     it wrong. Three literal statements rather than 0279's bulk `execute format` loop: this file
--     then contains no dynamic SQL at all.
-- =====================================================================================
revoke all on function clara.record_fa_arrears_resolution(uuid, uuid, text, bigint, date, date, text, text) from public;
grant execute on function clara.record_fa_arrears_resolution(uuid, uuid, text, bigint, date, date, text, text) to clara_authenticated;
alter function clara.record_fa_arrears_resolution(uuid, uuid, text, bigint, date, date, text, text) owner to clara_fn_owner;

-- =====================================================================================
-- §B clara._fa_run_period_core, RECUT. 0279 §C's body, byte for byte, with the arrears guard
--    between 0227's locked-period wall and the first write rewritten in three places: the third
--    bucket, the per-year figure, and the derived remedy. Everything above the wall and
--    everything below the guard is 0279's text unchanged.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._fa_run_period_core(p_client uuid, p_period_start date, p_period_end date, p_op_key text, p_actor uuid, p_firm uuid, p_verb text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  v_dedupe jsonb; v_approve_key text; au record; v_due jsonb; v_res jsonb;
  v_ps date; v_pe date; v_entry uuid; v_rev uuid; v_line int := 0; v_leg jsonb;
  v_actor uuid; v_ramp boolean; v_status text; v_dr bigint; v_cr bigint; v_breach jsonb;
  -- #975 (0279): the closed-year arrears question -- see the block below the locked-period wall.
  v_arr jsonb; v_unresolved jsonb; v_awaiting jsonb; v_chosen jsonb;
  -- #975 FIX ROUND (0293): the third bucket (a judgement whose figure has moved), the ONE year
  -- each refusal names, its OWN amount, the client-wide total under its own name, and the remedy
  -- that is actually reachable from the named year's status.
  v_stale jsonb; v_named jsonb; v_amt bigint; v_total bigint; v_remedy text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(p_firm, p_verb, p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'period_start', p_period_start,
      'period_end', p_period_end)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(p_firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', p_verb, 'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode = 'CLR10', detail = '{"reason":"approve_key_collision"}';
  end if;
  -- THE CLIENT RUNG, BEFORE ANY FA READ (design SS3.2). It is what makes the mode decision,
  -- the post and any concurrent reversal ONE lock-holding transaction -- which is why ramp
  -- flap is impossible rather than merely unlikely.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status = 'live';
  if not found then
    raise exception 'this client has no live, signed depreciation authority'
      using errcode = 'CLR38', detail = '{"reason":"authority_not_live"}';
  end if;
  v_actor := coalesce(p_actor, au.signed_by);

  -- THE PERIOD IS THE CADENCE'S, NOT THE CALLER'S (WD-R4 consumed).
  if au.cadence = 'monthly' then
    v_ps := clara._fa_month_start(p_period_start); v_pe := clara._fa_month_end(p_period_start);
  else
    v_ps := clara._fa_fy_open_for(p_client, p_period_start);
    v_pe := clara._fa_fy_end_for(p_client, p_period_start);
  end if;
  if v_ps is distinct from p_period_start or v_pe is distinct from p_period_end then
    raise exception 'this client''s % depreciation cadence runs % .. %, not % .. %', au.cadence, v_ps, v_pe, p_period_start, p_period_end
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid',
          'axis', 'not_cadence_aligned', 'cadence', au.cadence,
          'period_start', v_ps, 'period_end', v_pe)::text;
  end if;
  if v_pe >= clara._fa_today() then
    raise exception 'the period % .. % has not ended yet (MYT %)', v_ps, v_pe, clara._fa_today()
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid', 'axis', 'not_ended',
          'period_end', v_pe)::text;
  end if;

  -- SEQUENCING (design SS3.2). draft-N blocks N+1, and an earlier unmet period blocks a later
  -- one -- which is also what pins the RB arithmetic, since it can then never read around an
  -- unapproved period.
  v_due := clara._fa_oldest_unmet_period(p_client);
  if (v_due ->> 'reason') = 'period_draft_outstanding' then
    raise exception 'an un-dead depreciation draft is outstanding for this client; approve or withdraw it before running another period'
      using errcode = 'CLR38', detail = '{"reason":"period_draft_outstanding"}';
  end if;
  if coalesce((v_due ->> 'due')::boolean, false)
     and (v_due ->> 'period_start')::date < v_ps then
    raise exception 'an earlier period (% .. %) is still unmet; run the oldest unmet period first',
      (v_due ->> 'period_start')::date, (v_due ->> 'period_end')::date
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_earlier_unmet',
          'period_start', v_due ->> 'period_start', 'period_end', v_due ->> 'period_end')::text;
  end if;

  -- 0042 (as-built ladder round 6): THE ONE RE-RUN ADMISSION QUESTION, ASKED WHERE THE MONEY IS
  -- WRITTEN. The sequencing arms above read the due oracle, but only for its draft freeze and its
  -- earlier-unmet bound -- a caller naming a period directly is admitted past both. This asks the
  -- client's own charge rows whether anything already charged into range was unwound at a date
  -- other than the one it was charged at; if so, the month still holds money the coverage probe
  -- can no longer see, and charging it again puts the figure in twice. Measured before the fix at
  -- exactly double, posted unattended, with clara.fa_register_tie reporting accum_diff_cents = 0
  -- because register and ledger were made wrong together. Reasoning, and the identical question
  -- the adjustment lane asks: clara._wdb_rerun_breach.
  v_breach := clara._wdb_rerun_breach(p_client, 'depreciation_charges', null::text[], v_ps, v_pe);
  if v_breach is not null then
    raise exception 'this client has a depreciation charge (asset %, % .. %) booked at % whose reversal is dated %, so that period never cleared and charging again would leave the figure standing twice. Finish it by hand; retire the depreciation authority (clara.retire_depreciation_authority) to stop the period being proposed.',
      v_breach ->> 'asset_id', v_breach ->> 'period_start', v_breach ->> 'period_end',
      v_breach ->> 'posting_date', v_breach ->> 'correction_posting_date'
      using errcode = 'CLR38',
        detail = (jsonb_build_object('reason', 'period_correction_unsound',
          'period_start', v_ps, 'period_end', v_pe,
          'remedy', 'retire_depreciation_authority') || v_breach)::text;
  end if;
  v_res := clara._fa_compute_charges(p_client, v_ps, v_pe);
  if jsonb_array_length(v_res -> 'charges') = 0 then
    -- NOTHING DUE PERSISTS NOTHING (design SS1.5). No entry, no receipt, no ledger row --
    -- so a zero-charge period earns no ramp and leaves no receipt in the way of a later,
    -- lawful run over the same period.
    return clara._finish_op(p_firm, p_verb, p_op_key,
      jsonb_build_object('status', 'noop', 'client_id', p_client,
        'period_start', v_ps, 'period_end', v_pe, 'skipped', v_res -> 'skipped'));
  end if;

  -- 0227 (#651, D9): THE LOCKED-PERIOD WALL, AT THE RUNNING DOOR. It sits AFTER the
  -- zero-charge noop arm (a closed period with nothing to charge is still a lawful noop, and a
  -- refusal there would turn a no-op into an error for every sweep) and BEFORE the first write,
  -- so a refused run leaves nothing behind. The posting date this draft would carry is v_pe, which
  -- is exactly the date 0056's own walls would judge -- so the two can never disagree about WHICH
  -- fiscal year is in question, only about WHEN the refusal arrives.
  perform clara._fa_assert_period_open(p_client, v_pe);

  -- =====================================================================================
  -- #975 (0279, owner ruling 2026-09-20, checked against IAS 8): THE CLOSED-YEAR ARREARS
  -- QUESTION, ASKED BEFORE THE FIRST WRITE AND ANSWERED BY A PERSON.
  --
  -- WHAT 0227 LEFT. The wall above refuses a run DATED into a closing/closed year. It says
  -- nothing about the months INSIDE such a year that this OPEN period's charge folds forward:
  -- clara._fa_asset_charges charges every uncharged month up to v_pe, so a skipped year's
  -- months ride into this entry and the closed year's reported figures never move. That is
  -- arrears by CONSTRUCTION, with nobody asked.
  --
  -- WHY IT IS A QUESTION AND NOT A DEFAULT. Under IAS 8 a MATERIAL prior-period error is
  -- restated in the prior year; only an IMMATERIAL one is folded into the current year. Which
  -- one this is turns on MATERIALITY -- a professional judgement Clara may not make for the
  -- accountant. So the run states the amount and the year and asks for one of exactly two
  -- resolutions, choosing neither: fold_current (fold into this open period) or reopen_prior
  -- (reopen the year through clara.reopen_fiscal_year and charge it there as a restatement).
  --
  -- WHERE IT SITS, AND WHY. AFTER the zero-charge noop arm (a closed year with nothing to
  -- charge is still a lawful noop and must not become a question), AFTER the locked-period wall
  -- (a run dated INTO the closed year is refused on 0227's own axis, which this file does not
  -- touch), and BEFORE the first write -- so a stopped run leaves nothing behind, exactly as
  -- 0227's own refusal does.
  --
  -- TWO RENDERINGS OF ONE GUARD, discriminated by the VERB and nothing else. The HUMAN door
  -- (run_depreciation_manual) RAISES: a person is present, and the refusal IS the question.
  -- Every other verb -- the belt (run_depreciation_period, the name the agent catch-up lane
  -- also runs under) and the Work lane (run_depreciation_period_for) -- PARKS: it returns a
  -- stated, receipted `parked` status instead of posting, because nobody is there to answer and
  -- a machine may not fold a prior-period error on its own. Nothing is switched off: both doors
  -- stay callable and every branch stays testable.
  -- =====================================================================================
  v_arr := clara._fa_closed_arrears(p_client, v_pe);
  if coalesce((v_arr ->> 'arrears_cents')::bigint, 0) > 0 then
    v_total := (v_arr ->> 'arrears_cents')::bigint;
    -- THE YEARS THIS CHARGE WOULD FOLD FORWARD, SPLIT THREE WAYS by what a person has said about
    -- each one. `v_unresolved` has no live resolution at all; `v_stale` has one that was made
    -- about a DIFFERENT figure from the one now standing; `v_awaiting` chose the restatement at
    -- the figure that still stands and is waiting for its year to be reopened. Any of the three
    -- stops the run.
    --
    -- #975 FIX ROUND (0293, adversarial review ADV-L04-2): `v_stale` is new. The record door
    -- already enforces "a materiality judgement is made ABOUT an amount" at RECORD time (0279's
    -- own `arrears_changed` axis, and its comment: a judgement filed against a stale figure
    -- "would put a stale ruling on the file"). Nothing applied the same law at FOLD time, so a
    -- fold_current recorded about 10,000 sen silently authorised folding 10,010,000 sen -- Clara
    -- defaulting exactly the professional judgement the owner's 2026-09-20 ruling says she may
    -- never make. A judgement now licenses the figure it was made about, and nothing else; the
    -- standing record is never touched by a run, only superseded by a person.
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_unresolved
      from jsonb_array_elements(v_arr -> 'fiscal_years') y
     where coalesce(jsonb_typeof(y -> 'resolution'), 'null') = 'null';
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_stale
      from jsonb_array_elements(v_arr -> 'fiscal_years') y
     where coalesce(jsonb_typeof(y -> 'resolution'), 'null') <> 'null'
       and (y -> 'resolution' ->> 'arrears_cents')::bigint
           is distinct from (y ->> 'arrears_cents')::bigint;
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_awaiting
      from jsonb_array_elements(v_arr -> 'fiscal_years') y
     where y -> 'resolution' ->> 'choice' = 'reopen_prior'
       and (y -> 'resolution' ->> 'arrears_cents')::bigint
           is not distinct from (y ->> 'arrears_cents')::bigint;
    if jsonb_array_length(v_unresolved) > 0 then
      -- THE NAMED YEAR'S OWN AMOUNT, NEVER THE CLIENT-WIDE TOTAL [0293, ADV-L04-3 / SPEC-975-1].
      -- The sentence names ONE year, so it must quote THAT year's figure: quoting the sum over
      -- every closing/closed year made the remedy unusable, because clara.record_fa_arrears_
      -- resolution re-measures PER YEAR and refuses any other number. The total is a real figure
      -- and still rides, under a name of its own.
      v_named := v_unresolved -> 0;
      v_amt := (v_named ->> 'arrears_cents')::bigint;
      if p_verb = 'run_depreciation_manual' then
        raise exception 'this run would charge % sen belonging to fiscal year % (%), which is %. Under IAS 8 that is folded into the current period only when it is IMMATERIAL; a MATERIAL prior-period error is restated in that year instead. Materiality is your judgement, never Clara''s: record it with clara.record_fa_arrears_resolution -- fold_current, or reopen_prior and reopen the year through clara.reopen_fiscal_year.',
          v_amt, v_named ->> 'fy_label', v_named ->> 'fiscal_year_id', v_named ->> 'fy_status'
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'arrears_resolution_required',
              'axis', 'closed_year_arrears',
              'arrears_cents', v_amt,
              'total_arrears_cents', v_total,
              'fiscal_years', v_unresolved,
              'resolutions', jsonb_build_array('fold_current', 'reopen_prior'),
              'chosen', null,
              'period_start', v_ps, 'period_end', v_pe,
              'remedy', 'record_fa_arrears_resolution')::text;
      end if;
      -- PARKED: not posted, and not a failure either. The belt records what it did NOT do and
      -- moves on, and the same period completes once a person has answered.
      return clara._finish_op(p_firm, p_verb, p_op_key,
        jsonb_build_object('status', 'parked', 'reason', 'arrears_resolution_required',
          'client_id', p_client, 'period_start', v_ps, 'period_end', v_pe,
          'arrears_cents', v_amt,
          'total_arrears_cents', v_total,
          'fiscal_years', v_unresolved,
          'resolutions', jsonb_build_array('fold_current', 'reopen_prior'),
          'chosen', null, 'remedy', 'record_fa_arrears_resolution'));
    end if;
    if jsonb_array_length(v_stale) > 0 then
      v_named := v_stale -> 0;
      v_amt := (v_named ->> 'arrears_cents')::bigint;
      if p_verb = 'run_depreciation_manual' then
        raise exception 'fiscal year % (%) was judged at % sen and now stands at % sen, so the ruling on file was made about a figure that no longer exists. Materiality is judged about an AMOUNT, and Clara may not decide that the judgement still holds at the new one: record it again with clara.record_fa_arrears_resolution -- fold_current, or reopen_prior and reopen the year through clara.reopen_fiscal_year.',
          v_named ->> 'fy_label', v_named ->> 'fiscal_year_id',
          (v_named -> 'resolution' ->> 'arrears_cents')::bigint, v_amt
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'arrears_changed_since_judgement',
              'axis', 'closed_year_arrears',
              'arrears_cents', v_amt,
              'judged_cents', (v_named -> 'resolution' ->> 'arrears_cents')::bigint,
              'total_arrears_cents', v_total,
              'fiscal_years', v_stale,
              'resolutions', jsonb_build_array('fold_current', 'reopen_prior'),
              'chosen', v_named -> 'resolution' ->> 'choice',
              'period_start', v_ps, 'period_end', v_pe,
              'remedy', 'record_fa_arrears_resolution')::text;
      end if;
      return clara._finish_op(p_firm, p_verb, p_op_key,
        jsonb_build_object('status', 'parked', 'reason', 'arrears_changed_since_judgement',
          'client_id', p_client, 'period_start', v_ps, 'period_end', v_pe,
          'arrears_cents', v_amt,
          'judged_cents', (v_named -> 'resolution' ->> 'arrears_cents')::bigint,
          'total_arrears_cents', v_total,
          'fiscal_years', v_stale,
          'resolutions', jsonb_build_array('fold_current', 'reopen_prior'),
          'chosen', v_named -> 'resolution' ->> 'choice',
          'remedy', 'record_fa_arrears_resolution'));
    end if;
    if jsonb_array_length(v_awaiting) > 0 then
      v_named := v_awaiting -> 0;
      v_amt := (v_named ->> 'arrears_cents')::bigint;
      -- THE REMEDY IS DERIVED FROM THE NAMED YEAR'S OWN STATUS [0293, ADV-L04-4]. The record
      -- door now refuses reopen_prior on a CLOSING year outright, so this branch reaches a
      -- closing year only through a row recorded while the year was closed and since walked
      -- closed -> reopened -> closing. A refusal may not name an edge that does not exist from
      -- where the reader is standing, even down that path.
      v_remedy := case when v_named ->> 'fy_status' = 'closing'
                       then 'finalize_close' else 'reopen_fiscal_year' end;
      if p_verb = 'run_depreciation_manual' then
        raise exception 'fiscal year % (%) was judged MATERIAL and is to be restated in that year rather than folded into this period; this run carries % sen that belong to it. %',
          v_named ->> 'fy_label', v_named ->> 'fiscal_year_id', v_amt,
          case when v_remedy = 'finalize_close'
               then 'That year is still CLOSING: finalise the close through clara.finalize_close, then reopen it through clara.reopen_fiscal_year and charge it there.'
               else 'Reopen it through clara.reopen_fiscal_year and charge it there.' end
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'arrears_awaiting_reopen',
              'axis', 'closed_year_arrears',
              'arrears_cents', v_amt,
              'total_arrears_cents', v_total,
              'fiscal_years', v_awaiting,
              'chosen', 'reopen_prior',
              'period_start', v_ps, 'period_end', v_pe,
              'remedy', v_remedy)::text;
      end if;
      return clara._finish_op(p_firm, p_verb, p_op_key,
        jsonb_build_object('status', 'parked', 'reason', 'arrears_awaiting_reopen',
          'client_id', p_client, 'period_start', v_ps, 'period_end', v_pe,
          'arrears_cents', v_amt,
          'total_arrears_cents', v_total,
          'fiscal_years', v_awaiting, 'chosen', 'reopen_prior',
          'remedy', v_remedy));
    end if;
    -- EVERY affected year was answered fold_current, ABOUT THE FIGURE THAT NOW STANDS. The run
    -- proceeds exactly as it did before this file -- the charge rows keep their own months, the
    -- entry is dated in this open period, the closed year's reported figures do not move -- and
    -- the receipt now NAMES the ruling it proceeded under, so a reader a year later sees a JUDGED
    -- fold, not a silent one.
    select jsonb_agg(jsonb_build_object(
             'fiscal_year_id', y ->> 'fiscal_year_id', 'fy_label', y ->> 'fy_label',
             'arrears_cents', (y ->> 'arrears_cents')::bigint,
             'choice', y -> 'resolution' ->> 'choice',
             'resolution_id', y -> 'resolution' ->> 'id',
             'decided_by', y -> 'resolution' ->> 'decided_by',
             'decided_at', y -> 'resolution' ->> 'decided_at'))
      into v_chosen
      from jsonb_array_elements(v_arr -> 'fiscal_years') y;
  end if;
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', v_pe,
      'Depreciation ' || to_char(v_ps, 'YYYY-MM-DD') || ' to ' || to_char(v_pe, 'YYYY-MM-DD'),
      'scheduled_run', v_actor,
      -- THE SIGNER STAMP [L2/round-2 fold 8]. With last_human_editor NULL, _approve_entry_core
      -- accepts ANY approver plus an attestation, and WD-R5's distinct-checker intent would not
      -- bind at all on a machine-born high-stakes charge. Stamping the AUTHORITY SIGNER puts
      -- that signer on the distinct-checker arm: if they approve their own client's high-stakes
      -- depreciation draft, the core refuses.
      au.signed_by,
      jsonb_build_object('depreciation_charges', jsonb_build_object(
        'authority_id', au.id, 'op_key', p_op_key, 'charges', v_res -> 'charges')))
    returning id into v_entry;
  -- LEGS AGGREGATED PER (expense, accumulated) PAIR: one entry per period (SS9.3), not one
  -- per asset. The register carries the per-asset detail; the GL carries the movement.
  -- #973 (0248): the pairing itself now lives in clara._fa_depreciation_leg_pairing, the ONE
  -- routine this body and clara.preview_depreciation_run both call -- see that function's own
  -- comment. This loop only turns its returned legs into journal_lines, in the SAME order and
  -- with the SAME two description strings as before the fold.
  for v_leg in select jsonb_array_elements(clara._fa_depreciation_leg_pairing(v_res -> 'charges')) loop
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, v_leg ->> 'account_code', (v_leg ->> 'debit_cents')::bigint,
        (v_leg ->> 'credit_cents')::bigint,
        case when (v_leg ->> 'debit_cents')::bigint > 0
          then 'Depreciation charge' else 'Accumulated depreciation' end);
  end loop;
  -- EXACT EQUALITY BEFORE THE VALIDATOR (design SS3.1). _validate_entry_lines tolerates a
  -- five-sen rounding residue and would silently route it to a rounding account; a computed
  -- schedule that does not balance to the sen is a defect, not a rounding event.
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0) into v_dr, v_cr
    from clara.journal_lines where entry_id = v_entry;
  if v_dr <> v_cr then
    raise exception 'the computed depreciation entry does not balance exactly (% vs %)', v_dr, v_cr
      using errcode = 'CLR07';
  end if;
  perform clara._assert_balanced(v_entry);
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  -- THE RAMP PREDICATE, DERIVED (design SS1.4). No column, no receipt join: an approved,
  -- un-reversed origin='scheduled_run' entry for this client under THIS authority is the
  -- whole test. A zero-charge period minted no entry and therefore earns nothing; a reversal
  -- un-earns until a fresh reviewed run passes.
  v_ramp := exists (select 1 from clara.journal_entries j
                    where j.client_id = p_client and j.origin = 'scheduled_run'
                      and j.status = 'approved' and j.reversed_by is null and j.id <> v_entry
                      and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id);
  if v_ramp and not clara.is_high_stakes(v_entry) then
    -- The CLR26 open-question block or any other core refusal leaves the entry a DRAFT and
    -- the period due, honestly -- the transaction rolls back and nothing half-lands.
    perform clara._approve_entry_core(
      jsonb_build_object('actor', au.signed_by, 'firm', p_firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
  else
    v_status := 'drafted';
  end if;

  -- #975 (0279): `arrears_folded` is NULL on every run that folded nothing (the ordinary case,
  -- byte-for-byte the shape every existing reader knows) and, where a closed year WAS folded,
  -- the ruling that admitted it -- the year, the amount, the choice, who made it and when.
  perform clara._audit(p_firm, v_actor, null, null, p_verb, v_entry,
    jsonb_build_object('client', p_client, 'authority', au.id, 'period_start', v_ps,
      'period_end', v_pe, 'charged_cents', (v_res ->> 'charged_cents')::bigint,
      'entries', (v_res ->> 'entries')::int, 'status', v_status, 'op_key', p_op_key,
      'arrears_folded', v_chosen));
  return clara._finish_op(p_firm, p_verb, p_op_key,
    jsonb_build_object('status', v_status, 'entry_id', v_entry,
      'charged_cents', (v_res ->> 'charged_cents')::bigint,
      'entries', (v_res ->> 'entries')::int, 'skipped', v_res -> 'skipped',
      'arrears_folded', v_chosen));
end $function$


;

reset role;

-- =====================================================================================
-- §T THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p975b_tail$
declare v_src text; v_n int; v_pin record;
begin
  -- T.1 THE RUN CORE carries the three changes exactly once each, still carries every marker
  -- 0279's own tail pinned, and no longer carries the client-wide total in a year-scoped place.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
  for v_pin in select * from (values
      ($$'reason', 'arrears_changed_since_judgement'$$, 2),
      ($$'total_arrears_cents', v_total$$, 6),
      ('v_remedy := case when v_named', 1),
      ($$'remedy', v_remedy$$, 2),
      ('into v_stale', 1),
      -- 0279's own roster, unmoved.
      ('clara._fa_closed_arrears(p_client, v_pe)', 1),
      ($$'reason', 'arrears_resolution_required'$$, 2),
      ($$'reason', 'arrears_awaiting_reopen'$$, 2),
      ($$'arrears_folded', v_chosen$$, 2),
      ('clara._fa_assert_period_open(p_client, v_pe)', 1),
      -- …and no year-scoped key or sentence quotes the client-wide sum any more. `v_arr`'s own
      -- total is read exactly TWICE and only where it IS the total: the guard's entry test and
      -- the assignment into v_total.
      ($$'arrears_cents', (v_arr ->> 'arrears_cents')::bigint$$, 0),
      ($$(v_arr ->> 'arrears_cents')::bigint$$, 2)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#975 fix-round tail T.1: the recut run core carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 fix-round tail T.1b: clara._fa_run_period_core lost its owner, its SECURITY DEFINER flag or its pinned search_path' using errcode='CLR10';
  end if;

  -- T.2 THE RECORD DOOR carries the closing-year wall exactly once and keeps every other axis.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'::regprocedure;
  for v_pin in select * from (values
      ($$'axis', 'year_still_closing'$$, 1),
      ($$v_choice = 'reopen_prior' and fy.status = 'closing'$$, 1),
      ($$'remedy', 'finalize_close'$$, 1),
      ($$'axis', 'year_not_closed'$$, 1),
      ($$'axis', 'arrears_changed'$$, 1),
      ($$'axis', 'no_arrears'$$, 1),
      ($$'axis', 'choice'$$, 1),
      ($$"axis":"fa_arrears_resolution_invalid","axis":"not_this_client"$$, 0),
      ('pg_advisory_xact_lock(203005004, hashtext(p_client::text))', 1),
      ('clara._fa_closed_arrears(p_client, fy.ends_on)', 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#975 fix-round tail T.2: the recut record door carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 fix-round tail T.2b: clara.record_fa_arrears_resolution lost its owner, its SECURITY DEFINER flag or its pinned search_path' using errcode='CLR10';
  end if;
  -- …and it is STILL clara_authenticated-only. A machine role on this door would make materiality
  -- machine-decidable, which is the one thing the ticket's ruling forbids.
  if has_function_privilege('clara_runtime',
       'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)', 'EXECUTE') then
    raise exception '#975 fix-round tail T.2c: clara_runtime holds EXECUTE on the arrears record door' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
       'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)', 'EXECUTE') then
    raise exception '#975 fix-round tail T.2d: clara_authenticated does NOT hold EXECUTE on the arrears record door' using errcode='CLR10';
  end if;
  if has_function_privilege('public',
       'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)', 'EXECUTE') then
    raise exception '#975 fix-round tail T.2e: PUBLIC holds EXECUTE on the arrears record door' using errcode='CLR10';
  end if;

  -- T.3 NOTHING ELSE MOVED.
  for v_pin in select * from (values
      ('clara._fa_closed_arrears(uuid,date)',
       '46344076dfe5357020a32e89337296210f7ca25ef7e783aa46403ec16912dd17'),
      ('clara._fa_oldest_unmet_period(uuid)',
       '1e2f3b5105c832237fefe020968905575ae6a63560c6da0cac88bf2fd7b5dcd3'),
      ('clara.preview_depreciation_run(uuid)',
       '28af775de5a805a9a2acd486a798ef63ee901c99e0e4b0d54032a64f671b1b09'),
      ('clara.run_depreciation_period_for(uuid,date,text,uuid)',
       '02d610598649a4d584ad1449ecc70bd27cec268744cc6c24b9aea3a009ee68b1'),
      ('clara.run_depreciation_manual(uuid,date,date,text)',
       '5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8'),
      ('clara.run_depreciation_period(uuid,date,date,text)',
       '8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921'),
      ('clara._fa_assert_period_open(uuid,date)',
       '1409428decf47d69743ef6fcbddedebae88716dd5185514ed10614cc3e409de0'),
      ('clara.reopen_fiscal_year(uuid,text,jsonb,text,text)',
       '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5'),
      ('clara.finalize_close(uuid,text,text)',
       '59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4')) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_src is distinct from v_pin.sha then
      raise exception '#975 fix-round tail T.3: % MOVED (measured %, expected %)', v_pin.sig, v_src, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#975 fix-round tail OK: the run core splits the affected years THREE ways (unanswered, judged-at-another-figure, awaiting a reopen), states the NAMED year''s own arrears in every sentence and payload with the client-wide total beside it under its own name, and derives the awaiting remedy from that year''s status; the record door refuses reopen_prior on a year that is only closing and names clara.finalize_close; both bodies keep their owner, definer flag and search_path, the door is still clara_authenticated-only, and the nine bodies this file does not touch are unmoved.';
end
$p975b_tail$;
