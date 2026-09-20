-- 0248_fa_depreciation_leg_fold — #973 (riders wave 2, lane 04): FOLD `preview_depreciation_run`'S
-- DUPLICATED LEG-PAIRING AGGREGATION INTO `clara._fa_run_period_core`'S OWN, BOTH THROUGH ONE ROUTINE.
-- =====================================================================================
-- Spec of record: issue #973 — "Fold preview_depreciation_run's duplicated aggregation into
-- _fa_run_period_core". Builds on 0041 (`clara._fa_run_period_core`, the poster) and 0227
-- (`clara.preview_depreciation_run`, the preview) — this file recuts both bodies and coins no new
-- domain vocabulary of its own.
--
-- =====================================================================================
-- THE RESIDUAL, IN ONE PARAGRAPH.
--
-- `clara.preview_depreciation_run` answers what the NEXT depreciation run would do. To show the
-- legs the run would write, it re-derives the per-(expense account, accumulated account) leg
-- pairing from the computed charges with its own grouped aggregation, copied VERBATIM from the
-- poster `clara._fa_run_period_core` — 0227's own comment on the preview says so. #651 (0227) did
-- not fold the two: SYNTHESIS J3 ruled that re-plumbing the poster's aggregation inside a 0042
-- splice was the riskiest edit available for a cosmetic gain, so 0227 bound the two copies with a
-- tail assertion instead (§I, T.13: the same normalized fragment must occur in BOTH bodies) and
-- named the fold as its own follow-up (651-final.md follow-up #2). The duplication is bound two
-- ways today — 0227's T.13 and the behavioural cell `p651.preview.matches_run` — but both are
-- AGREEMENT checks, not shared code: a change to one body's grouping rule can still diverge from
-- the other until one of those assertions catches it.
--
-- =====================================================================================
-- THE FIX: ONE ROUTINE, AND BOTH CALLERS ASK IT.
--
-- `clara._fa_depreciation_leg_pairing(p_charges jsonb)` is the exact fragment T.13 pins, lifted
-- unchanged into its own function: it groups `p_charges` (the `{asset_id, amount_cents}` shape
-- `clara._fa_compute_charges` already returns) by the PAIR of the asset's expense and accumulated
-- account codes — never by either account alone, because two assets can share one and differ on
-- the other — and returns the two-line-per-pair legs both callers post, ordered by
-- (expense_code, accumulated_code) exactly as before. It is an UNGRANTED INTERNAL CORE: owned by
-- clara_fn_owner like its siblings (`_fa_compute_charges`, `_fa_assert_period_open`), EXECUTE
-- revoked from PUBLIC, granted to no role, `stable` so the language itself refuses to let it write.
--
-- `clara.preview_depreciation_run` now assigns its `v_legs` straight from the routine's return —
-- its OWN returned shape is unchanged, because the routine returns exactly the jsonb array the
-- preview used to build inline. `clara._fa_run_period_core` now loops the routine's return to
-- insert its `journal_lines`, one row per leg, in the SAME order with the SAME two description
-- strings — its signature, its posting behaviour and its floor/authority/sequencing checks are
-- untouched; only the aggregation's HOME moved. Neither caller's caller set, grant, or ACL moves.
-- `_fa_run_period_core` also keeps BOTH of the SPLICES already live in its body — neither is a
-- `create or replace` in its own migration file, so neither shows up in a plain grep of the
-- migrations directory, and a hand recut against 0041's ORIGINAL file text alone (never re-reading
-- the live, already-spliced body) drops both silently: 0042 §S5.15d's re-run admission gate
-- (`clara._wdb_rerun_breach`, immediately before the arithmetic) and 0227 §E's locked-period wall
-- (`clara._fa_assert_period_open`, between the zero-charge noop arm and the first write). §T
-- (T.8, T.9) re-prove both are there, phrased identically, and in the same relative order each
-- splice's own postcheck already established.
--
-- 0227's tail assertion T.13 is NOT edited (an applied migration is immutable, and T.13 is not
-- this file's to touch): it still passes at its own point in a from-scratch chain, because it
-- runs BEFORE this file does, against the pre-fold bodies the chain has built up to that point.
-- What replaces its JOB after this file runs is this file's own tail (§T, T.2): the shared
-- routine's call now appears in both recut bodies, and the raw fragment T.13 compared survives in
-- EXACTLY ONE clara function afterwards — the new core — never zero, never two.
--
-- WHAT THIS FILE DOES NOT DO. It does not change what is charged or how a period is chosen as due
-- (`clara._fa_compute_charges`, `clara._fa_oldest_unmet_period` — untouched, pinned in the
-- prestate and re-read in the tail). It does not fold the two fixed-asset PARTICULARS completion
-- bodies (`complete_fixed_asset_particulars` / `complete_fixed_asset_particulars_for`) — a
-- separate, separately filed duplication, out of this ticket's scope by name. It adds no door, no
-- grant and no refusal vocabulary.
-- =====================================================================================

do $p973_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false; v_live_poster text;
  -- The live pre-images of the TWO bodies this file recuts, measured off pg_proc.prosrc on the
  -- lane-04 rig (clara_l04, PG 17, chain 0001..0234 + 0247 + wave-2 lane-04 commits through #972)
  -- — never transcribed from file text. The poster's pre-image is 0041's ORIGINAL body PLUS
  -- 0227's own SPLICE (§E: a runtime `pg_get_functiondef` + string-replace that installs
  -- `perform clara._fa_assert_period_open(p_client, v_pe);` before the draft insert) — 0227 never
  -- re-declares `clara._fa_run_period_core` with `create or replace`, so that splice is otherwise
  -- invisible to a `grep` of the migrations directory and easy to lose in a hand recut. This
  -- file's own §B keeps it, in the same position, so the locked-period wall #651 (0227, D9) added
  -- survives the fold.
  c_poster_pre constant text :=
    '8a69c2355559e700f060c94c7a97950366e9743dd6794d810985fcbc74237681';
  c_preview_pre constant text :=
    '193597c9bc9321fb57dc3c417d9994433a6f868804b5248a889986af9405d304';
begin
  if to_regprocedure('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)') is null then
    raise exception '#973 prestate: clara._fa_run_period_core is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.preview_depreciation_run(uuid)') is null then
    raise exception '#973 prestate: clara.preview_depreciation_run is absent -- 0227 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_assert_period_open(uuid,date)') is null then
    raise exception '#973 prestate: clara._fa_assert_period_open is absent -- 0227 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._wdb_rerun_breach(uuid,text,text[],date,date)') is null then
    raise exception '#973 prestate: clara._wdb_rerun_breach is absent -- 0042 must apply first'
      using errcode='CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied, unmerged
  -- migration after an edit.) `create or replace` is safe over its own old effects, but a prestate
  -- pinned to the PRE-fold image would refuse the redo outright. Admitted LOUDLY, and only on the
  -- one signal that means it: the live poster already calls this file's own new core.
  if to_regprocedure('clara._fa_depreciation_leg_pairing(jsonb)') is not null then
    select p.prosrc into v_live_poster from pg_proc p
     where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
    if position('clara._fa_depreciation_leg_pairing(' in v_live_poster) > 0 then
      v_redo := true;
      raise notice '#973 prestate: the live poster ALREADY calls clara._fa_depreciation_leg_pairing -- treating this as a #957 REDO of 0248 itself. The recut is create-or-replace and the tail below re-proves the whole post-state from scratch.';
    else
      raise exception '#973 prestate: clara._fa_depreciation_leg_pairing already exists but the poster does not call it -- re-derive this file against the live catalog before applying'
        using errcode='CLR10';
    end if;
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc. The
  -- two RECUT entries are skipped on a redo (their pre-image is this file's OWN prior effect, not
  -- the pin below); §T re-reads all seven afterwards to confirm the final state either way.
  for v_pin in select * from (values
      ('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)', c_poster_pre, 'recut'),
      ('clara.preview_depreciation_run(uuid)', c_preview_pre, 'recut'),
      -- NON-REGRESSION: everything else in the FA depreciation lane is untouched by this file.
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048', 'unmoved'),
      ('clara.run_depreciation_period(uuid,date,date,text)',
       '8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921', 'unmoved'),
      ('clara.run_depreciation_manual(uuid,date,date,text)',
       '5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8', 'unmoved'),
      ('clara.run_depreciation_period_for(uuid,date,text,uuid)',
       '051112ecd71e2c0c3fe70b91757f03c74054bff0665a41c57045e2e257dba1e5', 'unmoved'),
      ('clara._agent_depreciation_catchup_core(jsonb,uuid,date,text,jsonb,text)',
       'c354db4e234e58ac5213a81751522f256562b9b484153b8e7570f33a3bf9d1fc', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#973 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- THE FRAGMENT T.13 BINDS IS STILL LIVE, IN BOTH BODIES, EXACTLY ONCE EACH — the pre-condition
  -- for calling this a FOLD rather than an independent rewrite. Meaningless on a redo (the live
  -- bodies are already this file's OWN post-fold effect, which carries no such inline fragment at
  -- all — see T.3/T.4 below, which re-prove that unconditionally). Normalized the same way T.13
  -- is: lowercased, comments stripped, whitespace collapsed.
  if not v_redo then
    declare
      v_a text; v_b text; v_n int;
      v_frag constant text := 'from jsonb_array_elements(v_res -> ''charges'') x join clara.fixed_assets f on f.id = '
        || '(x ->> ''asset_id'')::uuid group by 1, 2 order by 1, 2';
    begin
      select lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
        into v_a from pg_proc p where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
      select lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
        into v_b from pg_proc p where p.oid = 'clara.preview_depreciation_run(uuid)'::regprocedure;
      v_n := (length(v_a) - length(replace(v_a, v_frag, ''))) / length(v_frag);
      if v_n <> 1 then
        raise exception '#973 prestate: the poster carries the leg-aggregation fragment % time(s), expected exactly 1 -- this file is a FOLD of an existing duplication, not an independent rewrite', v_n
          using errcode='CLR10';
      end if;
      v_n := (length(v_b) - length(replace(v_b, v_frag, ''))) / length(v_frag);
      if v_n <> 1 then
        raise exception '#973 prestate: the preview carries the leg-aggregation fragment % time(s), expected exactly 1', v_n
          using errcode='CLR10';
      end if;
    end;
  end if;

  raise notice '#973 prestate: clean -- clara._fa_run_period_core and clara.preview_depreciation_run are both at their measured pre-images (or, on a redo, this file''s own prior effect), clara._fa_assert_period_open is live, the five non-regression bodies are unmoved, and (pre-redo) the duplicated leg-aggregation fragment is live in both bodies exactly once each.';
end
$p973_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE SHARED CORE. Lifted verbatim from the poster's own loop (0041:3521-3525) — the same
--     fragment 0227's T.13 already pins in both bodies — so the fold changes WHERE the arithmetic
--     lives, never WHAT it computes.
-- =====================================================================================
create or replace function clara._fa_depreciation_leg_pairing(p_charges jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_legs jsonb := '[]'::jsonb; r record;
begin
  for r in select f.depr_expense_account_code as exp_code, f.accum_depr_account_code as acc_code,
                  sum((x ->> 'amount_cents')::bigint) as amt
           from jsonb_array_elements(p_charges) x
           join clara.fixed_assets f on f.id = (x ->> 'asset_id')::uuid
           group by 1, 2 order by 1, 2 loop
    v_legs := v_legs || jsonb_build_array(
      jsonb_build_object('account_code', r.exp_code, 'debit_cents', r.amt, 'credit_cents', 0),
      jsonb_build_object('account_code', r.acc_code, 'debit_cents', 0, 'credit_cents', r.amt));
  end loop;
  return v_legs;
end $$;
revoke all on function clara._fa_depreciation_leg_pairing(jsonb) from public;
comment on function clara._fa_depreciation_leg_pairing(jsonb) is
  '#973 (0248): THE ONE routine that turns a charge set (clara._fa_compute_charges''s own '
  '{asset_id, amount_cents,...} array) into the two-line-per-pair GL legs both '
  'clara.preview_depreciation_run and clara._fa_run_period_core post. Grouped by the PAIR of '
  '(expense account, accumulated account) -- never by either account alone, because two assets '
  'can share one and differ on the other. An UNGRANTED internal core: owned by clara_fn_owner, '
  'EXECUTE revoked from public, granted to no role -- reachable only from another SECURITY '
  'DEFINER body already running as the owner. Replaces the two independent copies 0227''s own '
  'comment on preview_depreciation_run named as a residual (follow-up from 651-final.md).';

-- =====================================================================================
-- §B  THE POSTER. `clara._fa_run_period_core` (0041:3422) — signature, posting behaviour, floor
--     and sequencing checks UNCHANGED. Only the leg-insertion loop now reads the shared core's
--     return instead of re-deriving the pairing.
-- =====================================================================================
create or replace function clara._fa_run_period_core(p_client uuid, p_period_start date, p_period_end date,
    p_op_key text, p_actor uuid, p_firm uuid, p_verb text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_approve_key text; au record; v_due jsonb; v_res jsonb;
  v_ps date; v_pe date; v_entry uuid; v_rev uuid; v_line int := 0; v_leg jsonb;
  v_actor uuid; v_ramp boolean; v_status text; v_dr bigint; v_cr bigint; v_breach jsonb;
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

  perform clara._audit(p_firm, v_actor, null, null, p_verb, v_entry,
    jsonb_build_object('client', p_client, 'authority', au.id, 'period_start', v_ps,
      'period_end', v_pe, 'charged_cents', (v_res ->> 'charged_cents')::bigint,
      'entries', (v_res ->> 'entries')::int, 'status', v_status, 'op_key', p_op_key));
  return clara._finish_op(p_firm, p_verb, p_op_key,
    jsonb_build_object('status', v_status, 'entry_id', v_entry,
      'charged_cents', (v_res ->> 'charged_cents')::bigint,
      'entries', (v_res ->> 'entries')::int, 'skipped', v_res -> 'skipped'));
end $$;
revoke all on function clara._fa_run_period_core(uuid, date, date, text, uuid, uuid, text) from public;

-- =====================================================================================
-- §C  THE PREVIEW. `clara.preview_depreciation_run` (0227) — returned shape UNCHANGED. Its
--     `v_legs` now comes straight from the shared core instead of an inline copy of the loop.
-- =====================================================================================
create or replace function clara.preview_depreciation_run(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; au record; v_due jsonb; v_res jsonb; v_legs jsonb := '[]'::jsonb;
        v_mode text; v_ramp boolean;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_found"}';
  end if;
  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status = 'live';
  v_due := clara._depreciation_run_due_core(p_client, c.firm);
  if not coalesce((v_due ->> 'due')::boolean, false) then
    return jsonb_build_object('client_id', p_client, 'due', false,
      'reason', v_due ->> 'reason', 'cadence', au.cadence,
      'authority_from', au.authority_from,
      'skipped_closed', coalesce(v_due -> 'skipped_closed', '[]'::jsonb),
      'charges', '[]'::jsonb, 'skipped', '[]'::jsonb, 'legs', '[]'::jsonb,
      'charged_cents', 0, 'entries', 0);
  end if;
  v_res := clara._fa_compute_charges(p_client, (v_due ->> 'period_start')::date,
    (v_due ->> 'period_end')::date);
  -- LEGS AGGREGATED PER (expense, accumulated) PAIR. #973 (0248): the pairing now lives in
  -- clara._fa_depreciation_leg_pairing, the ONE routine this preview and the poster
  -- clara._fa_run_period_core both call, so the preview can never show a different pairing
  -- from the entry the run will write (see that function's own comment).
  v_legs := clara._fa_depreciation_leg_pairing(v_res -> 'charges');
  -- THE RAMP PREDICATE, DERIVED exactly as the poster derives it (0041's design SS1.4). It
  -- answers what the run WOULD do; a high-stakes entry still drafts, which the surface says.
  v_ramp := exists (select 1 from clara.journal_entries j
                    where j.client_id = p_client and j.origin = 'scheduled_run'
                      and j.status = 'approved' and j.reversed_by is null
                      and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id);
  v_mode := case when v_ramp then 'post' else 'draft' end;
  return jsonb_build_object('client_id', p_client, 'due', true,
    'reason', v_due ->> 'reason',
    'period_start', (v_due ->> 'period_start')::date,
    'period_end', (v_due ->> 'period_end')::date,
    'cadence', au.cadence, 'authority_from', au.authority_from,
    'authority_ref', au.authority_ref,
    'skipped_closed', coalesce(v_due -> 'skipped_closed', '[]'::jsonb),
    'charges', (select coalesce(jsonb_agg(jsonb_build_object(
          'asset_id', x ->> 'asset_id',
          'description', (select f.description from clara.fixed_assets f
                           where f.id = (x ->> 'asset_id')::uuid),
          'period_start', x ->> 'period_start', 'period_end', x ->> 'period_end',
          'amount_cents', (x ->> 'amount_cents')::bigint) order by x ->> 'period_start'),
        '[]'::jsonb) from jsonb_array_elements(v_res -> 'charges') x),
    'skipped', coalesce(v_res -> 'skipped', '[]'::jsonb),
    'charged_cents', (v_res ->> 'charged_cents')::bigint,
    'entries', (v_res ->> 'entries')::int,
    'legs', v_legs,
    'mode_would_be', v_mode, 'ramp_earned', v_ramp);
end $$;
revoke all on function clara.preview_depreciation_run(uuid) from public;
comment on function clara.preview_depreciation_run(uuid) is
  '#651: what the NEXT depreciation run would do -- the exact period the database chose, the '
  'per-asset amounts, the two GL legs, the skipped assets with their reasons, and whether it would '
  'post or draft. VIEWER+, clara_authenticated only, `stable` so it cannot write. '
  'clara._fa_compute_charges stays UNGRANTED: this wrapper is the only way a browser reaches it. '
  '#973 (0248): the leg pairing is clara._fa_depreciation_leg_pairing''s, the SAME routine '
  'clara._fa_run_period_core posts from -- no longer a duplicated copy.';

reset role;

-- =====================================================================================
-- §T  THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p973_tail$
declare
  v_src text; v_a text; v_b text; v_n int; v_pin record; v_sha text; v_names text[];
  -- THE FULL fragment, source-expression included (`v_res -> 'charges'`) — what a RECUT body must
  -- no longer carry AT ALL (T.3): it named the input by the OLD callers' own local variable, and a
  -- recut body keeps no inline aggregation of any shape once it only calls the shared core.
  v_frag_full constant text := 'from jsonb_array_elements(v_res -> ''charges'') x join clara.fixed_assets f on f.id = '
    || '(x ->> ''asset_id'')::uuid group by 1, 2 order by 1, 2';
  -- THE CORE fragment, source-expression-INDEPENDENT — what now must live in EXACTLY ONE clara
  -- function (T.4). The extracted routine reads its own parameter (`p_charges`), never the old
  -- callers' `v_res`, so the census that used to key on the caller-specific text keys on the part
  -- that is invariant to who is calling: the join and the group-by that decide the PAIRING itself.
  v_frag_core constant text := 'join clara.fixed_assets f on f.id = '
    || '(x ->> ''asset_id'')::uuid group by 1, 2 order by 1, 2';
begin
  -- T.1 THE NEW CORE EXISTS, is STABLE, SECURITY DEFINER, owned by clara_fn_owner, its
  -- search_path pinned, and grants EXECUTE to nobody -- an INTERNAL like its siblings.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_depreciation_leg_pairing(jsonb)'::regprocedure
     and p.provolatile = 's' and p.prosecdef
     and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#973 tail T.1: clara._fa_depreciation_leg_pairing is missing its stable/definer/owner/search_path shape'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = 'clara._fa_depreciation_leg_pairing(jsonb)'::regprocedure
     and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#973 tail T.1b: clara._fa_depreciation_leg_pairing gained % grant(s) -- it is an INTERNAL, granted to nobody', v_n
      using errcode='CLR10';
  end if;

  -- T.2 BOTH RECUT BODIES NOW CALL THE SHARED CORE, BY ITS FULLY-QUALIFIED NAME. This is what
  -- replaces the JOB 0227's T.13 did by text comparison: the two callers can no longer disagree,
  -- because there is only one aggregation, and this is the assertion that they both reach it.
  select p.prosrc into v_a from pg_proc p
   where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
  select p.prosrc into v_b from pg_proc p
   where p.oid = 'clara.preview_depreciation_run(uuid)'::regprocedure;
  if position('clara._fa_depreciation_leg_pairing(' in v_a) = 0 then
    raise exception '#973 tail T.2: clara._fa_run_period_core does not call the shared leg-pairing core'
      using errcode='CLR10';
  end if;
  if position('clara._fa_depreciation_leg_pairing(' in v_b) = 0 then
    raise exception '#973 tail T.2: clara.preview_depreciation_run does not call the shared leg-pairing core'
      using errcode='CLR10';
  end if;

  -- T.3 …AND THE RAW FRAGMENT IS GONE FROM BOTH — the extraction is real, not a vacuous
  -- "call it AND keep the inline copy" replace.
  if position(v_frag_full in lower(regexp_replace(regexp_replace(v_a, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0 then
    raise exception '#973 tail T.3: clara._fa_run_period_core still carries the raw leg-aggregation fragment -- the fold was vacuous'
      using errcode='CLR10';
  end if;
  if position(v_frag_full in lower(regexp_replace(regexp_replace(v_b, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0 then
    raise exception '#973 tail T.3: clara.preview_depreciation_run still carries the raw leg-aggregation fragment -- the fold was vacuous'
      using errcode='CLR10';
  end if;

  -- T.4 THE core FRAGMENT NOW SURVIVES IN EXACTLY ONE clara FUNCTION — the new core. Never zero
  -- (the arithmetic vanished), never two-or-more (a THIRD copy crept in somewhere).
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(v_frag_core in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_n <> 1 then
    raise exception '#973 tail T.4: the leg-aggregation fragment now occurs in % clara function(s), expected exactly 1 (clara._fa_depreciation_leg_pairing)', v_n
      using errcode='CLR10';
  end if;
  select p.proname into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(v_frag_core in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_src is distinct from '_fa_depreciation_leg_pairing' then
    raise exception '#973 tail T.4b: the ONE function carrying the leg-aggregation fragment is %, expected _fa_depreciation_leg_pairing', v_src
      using errcode='CLR10';
  end if;

  -- T.5 THE POSTER'S CALLER SET IS STILL EXACTLY FOUR, NAMED (0227 T.6's own roster) — this file
  -- changed the poster's BODY, never its callers.
  select array_agg(p.proname order by p.proname) into v_names from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_fa_run_period_core'
     and p.prosrc like '%clara._fa_run_period_core(%';
  if v_names is distinct from array['_agent_depreciation_catchup_core', 'run_depreciation_manual',
                                 'run_depreciation_period', 'run_depreciation_period_for'] then
    raise exception '#973 tail T.5: clara._fa_run_period_core''s caller set is %, expected exactly the four 0227 named', v_names
      using errcode='CLR10';
  end if;

  -- T.6 NON-REGRESSION, re-read: the oracle, the two machine/human posters, the OBO door and the
  -- agent catch-up core are byte-for-byte what the prestate measured — this file recut exactly
  -- two bodies.
  for v_pin in select * from (values
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048'),
      ('clara.run_depreciation_period(uuid,date,date,text)',
       '8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921'),
      ('clara.run_depreciation_manual(uuid,date,date,text)',
       '5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8'),
      ('clara.run_depreciation_period_for(uuid,date,text,uuid)',
       '051112ecd71e2c0c3fe70b91757f03c74054bff0665a41c57045e2e257dba1e5'),
      ('clara._agent_depreciation_catchup_core(jsonb,uuid,date,text,jsonb,text)',
       'c354db4e234e58ac5213a81751522f256562b9b484153b8e7570f33a3bf9d1fc')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#973 tail T.6: % MOVED (measured %, expected %) -- this file recuts exactly two bodies', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.7 THE POSTER AND THE PREVIEW KEEP THEIR OWN SHAPE: SECURITY DEFINER, owner and search_path
  -- unmoved, and PUBLIC still has no EXECUTE on either — `create or replace` preserves all of
  -- this, and this proves it did.
  for v_pin in select * from (values
      ('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'),
      ('clara.preview_depreciation_run(uuid)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#973 tail T.7: % lost its owner, its SECURITY DEFINER flag or its pinned search_path', v_pin.sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#973 tail T.7b: PUBLIC gained EXECUTE on %', v_pin.sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.8 0227's OWN §E SPLICE SURVIVED THE FOLD. `_fa_run_period_core` is never re-declared by
  -- 0227 with `create or replace` — the locked-period wall was installed at RUNTIME by a
  -- `pg_get_functiondef` + string-replace, so a hand recut against the 0041 file text ALONE (never
  -- re-reading the live, already-spliced body) drops it silently. This is exactly that mistake,
  -- caught: the wall must still be there, phrased identically to 0227's own splice, and still
  -- between the arithmetic and the first write.
  v_n := (length(v_a) - length(replace(v_a, 'perform clara._fa_assert_period_open(p_client, v_pe);', '')))
    / length('perform clara._fa_assert_period_open(p_client, v_pe);');
  if v_n <> 1 then
    raise exception '#973 tail T.8: clara._fa_run_period_core carries the locked-period wall (0227 §E) % time(s), expected exactly 1 -- the fold must not drop 0227''s own splice', v_n
      using errcode='CLR10';
  end if;
  if not (position('clara._fa_compute_charges(p_client, v_ps, v_pe)' in v_a)
            < position('clara._fa_assert_period_open(p_client, v_pe)' in v_a)
          and position('clara._fa_assert_period_open(p_client, v_pe)' in v_a)
            < position('insert into clara.journal_entries(client_id, status, posting_date' in v_a)
          and position('insert into clara.journal_entries(client_id, status, posting_date' in v_a)
            < position('clara._approve_entry_core(' in v_a)) then
    raise exception '#973 tail T.8b: the locked-period wall is no longer between the arithmetic and the first write'
      using errcode='CLR10';
  end if;

  -- T.9 0042 §S5.15d's OWN SPLICE ALSO SURVIVED THE FOLD — the re-run admission gate, asked
  -- immediately before the arithmetic. `p651.census.rerun_gate` (depreciation-history.test.mjs)
  -- reads this off the catalog independently; this is the migration's OWN proof of the same fact,
  -- at apply time, on a from-scratch chain, before that test ever runs.
  v_n := (length(v_a) - length(replace(v_a, 'clara._wdb_rerun_breach(p_client', '')))
    / length('clara._wdb_rerun_breach(p_client');
  if v_n <> 1 then
    raise exception '#973 tail T.9: clara._fa_run_period_core carries the 0042 re-run admission gate % time(s), expected exactly 1 -- the fold must not drop 0042''s own splice', v_n
      using errcode='CLR10';
  end if;
  if not (position('clara._fa_oldest_unmet_period(p_client)' in v_a)
            < position('clara._wdb_rerun_breach(p_client' in v_a)
          and position('clara._wdb_rerun_breach(p_client' in v_a)
            < position('clara._fa_compute_charges(p_client, v_ps, v_pe)' in v_a)
          and position('clara._fa_compute_charges(p_client, v_ps, v_pe)' in v_a)
            < position('clara._approve_entry_core(' in v_a)) then
    raise exception '#973 tail T.9b: the re-run admission gate is no longer between the sequencing block and the arithmetic'
      using errcode='CLR10';
  end if;

  raise notice '#973 tail OK: clara._fa_depreciation_leg_pairing exists, stable, definer-owned by clara_fn_owner and ungranted; clara._fa_run_period_core and clara.preview_depreciation_run both call it and no longer carry the raw fragment, which now lives in exactly that one function; the poster''s caller set is unchanged at four; both of 0042''s and 0227''s own splices (the re-run gate and the locked-period wall) survive the fold, each still in place; and clara._fa_compute_charges, run_depreciation_period, run_depreciation_manual, run_depreciation_period_for and _agent_depreciation_catchup_core are byte-for-byte unmoved.';
end
$p973_tail$;
