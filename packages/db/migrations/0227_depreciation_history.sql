-- 0227_depreciation_history — #651 (refresh wave 2026-09-18; journeys C7/C8): DEPRECIATION RUNS
-- UNDER AN EXPLICIT, RESOLVED INSTRUCTION WITH A FROZEN WINDOW; A LOCKED PERIOD IS REFUSED AT THE
-- RUNNING DOOR RATHER THAN AT APPROVE; AND EVERY REVISION NAMES WHAT KIND OF CHANGE IT IS.
-- =====================================================================================
-- Spec of record: issue #651 — "按明确政策执行折旧并保留估计变更历史". Domain words: CONTEXT.md —
-- "Depreciation change class", "Depreciation authority window", "Depreciation run preview".
-- Builds on 0041 (the fixed-asset register and its depreciation engine), 0042 §S5.15c/§S5.15d
-- (the two spliced FA bodies this file splices again), 0056 (the close model and its period
-- walls), 0193 (the accounting-plan authority shape this file copies) and 0216 (#639's
-- acquisition lane, whose prestate/pin/cohort idioms this file follows).
--
-- =====================================================================================
-- FOUR THINGS A LATER READER MUST NOT MIS-READ.
--
-- (1) `clara._fa_run_period_core` HAS THREE CALLERS TODAY AND FOUR AFTER THIS FILE.
--     `run_depreciation_period` (0041:3580), `run_depreciation_manual` (0041:3598),
--     `_agent_depreciation_catchup_core` (0138:2398) and the new `run_depreciation_period_for`.
--     MEASURED on clara_651 before this file was written: exactly the first three. A tail written
--     for three PASSES while the new door sits outside the set, so §I (T.6) pins FOUR by name.
--
-- (2) THE FLOOR REMOVES THE AGENT CATCH-UP LANE'S REACH, AND THAT LOSS IS DELIBERATE.
--     `clara.fa_depreciation_authorities.authority_from` floors the DUE ORACLE, and
--     `_agent_depreciation_catchup_core` derives every period it runs from
--     `clara._depreciation_run_due_core` (0138:1130-1138 — a one-line passthrough to that oracle),
--     with `p_through` bounding only the loop's UPPER exit (0138:2396). So after this file the
--     parked agent catch-up lane can never propose a PRE-FLOOR period, and a future `closePrep_v2`
--     inherits that loss. The human catch-up door `clara.run_depreciation_manual` (bookkeeper+,
--     caller-named period, identical mechanics) is unchanged and is the one way back.
--
-- (3) `clara._fa_assert_period_open` IS WRITTEN FOR #678 TO ADOPT UNCHANGED. #651 settles the
--     locked-period law for the whole fixed-asset lane; #678 inherits it rather than minting a
--     second predicate. It is UNGRANTED and it is the ONLY new helper this file installs.
--
-- (4) THIS FILE DOES NOT UNPARK `close_prep`. The wake source stays registered-and-disabled
--     (0133:915-917, re-asserted 0138:2939-2941 and 0223:247-248); §I (T.10) re-asserts it in
--     0223:247-250's own idiom so no later reader can read this file as having opened an agent
--     close lane.
--
-- =====================================================================================
-- THE MEASUREMENT THAT RE-AIMED THE LOCKED-PERIOD SLICE (measured on clara_651 at 0224, before a
-- line of this file was written; the probe is reproduced as `p651.period.closed_refused`).
--
-- The brief and the gap map both said: a depreciation run over a CLOSED fiscal year DRAFTS
-- successfully and dies at APPROVE on 0056's entry-level wall (CLR19 `write_into_closed_period`),
-- leaving a dead draft that blocks the client's entire depreciation queue. THAT IS NOT WHAT
-- HAPPENS. `clara._tf_period_wall_lines` — a BEFORE INSERT/UPDATE/DELETE trigger on
-- `clara.journal_lines` — refuses the LINE insert with the same CLR19 reason token, so the whole
-- `run_depreciation_manual` transaction rolls back and NO draft survives. Measured:
--
--     run_depreciation_manual(client, 2026-06-01, 2026-06-30) with FY 2026-03-01..2026-07-31 closed
--       -> CLR19 {"reason":"write_into_closed_period","entry_id":…,"fy_status":"closed"}
--          "entry … sits in closed fiscal year 2026; its lines may not change"
--       -> zero depreciation entries left behind
--       -> depreciation_run_due afterwards: {"due":true,"period_start":"2026-06-01", …}
--
-- So the real defect is the THIRD line, not the first: the oracle keeps advertising a period its
-- poster can never post, once per sweep, FOREVER — which is precisely the failure 0042:4441 names
-- in its own words, and `reconciler-fa.mjs:108-157` records it as one `faFailed` per client per
-- cycle and nothing louder. This file therefore does BOTH halves in one commit: the wall moves to
-- the running door (typed, CLR38 axis `period_closed`, naming the fiscal year and the reopen
-- path, before any work is done), AND the oracle skips a closed period and offers the next open
-- one, reporting what it skipped. Flooring or walling the poster while leaving the oracle
-- untouched is the one shape that must never ship here.
--
-- WHAT THE SKIP DOES AND DOES NOT MEAN. A skipped period's ARREARS are not destroyed: the next
-- open period's run charges them, because `clara._fa_asset_charges` charges every uncharged month
-- up to the period end and this file does not touch that arithmetic (it is pinned NON-REGRESSION
-- in the prestate and the tail). The charge ROWS keep their own `period_start`/`period_end`, so a
-- reader sees which month each belongs to; the journal ENTRY is dated in the OPEN period, which is
-- what keeps 0056's walls satisfied and the closed year's reported figures unmoved. That is the
-- ordinary accounting treatment of an omitted charge, and it is visible in the receipt rather than
-- silent. `skipped_closed` therefore means "this period will never be RUN in its own right", not
-- "this money is gone".
--
-- =====================================================================================
-- THE AUTHORITY TRANSITION TRIGGER HAD TO BE RECUT, AND THAT IS A MEASUREMENT, NOT A WIDENING.
--
-- `clara._tf_fa_authority_transition` refuses any UPDATE that changes a column outside
-- `v_frozen` — the allowlist of columns the sign/retire TRANSITIONS are allowed to write. The two
-- new columns this file adds are written at SIGN time (`authority_ref` by the signer, `authority_from`
-- by the door), so without them in that array the four-argument sign door could not write at all:
-- it would raise CLR38 `authority_immutable` against itself. The array is widened by exactly two
-- names and nothing else about the trigger moves — the transition graph, the DELETE refusal and
-- the same-status refusal are byte-identical, re-asserted in §I (T.11).
--
-- …AND BECAUSE AN ALLOWLIST IS NOT A FREEZE, §B.2 splices the write-once wall for those same two
-- columns into the same trigger (D8's own words), and §B.3 teaches
-- `clara.retire_depreciation_authority` to stamp the window floor the way it already stamps the
-- signature — without which this file's OWN `ck_fa_authorities_window` turns the lawful withdrawal
-- of a never-signed authority into a raw 23514. Both are recuts of bodies the brief's roster does
-- not name; both are repairs of damage this file would otherwise do, and both are pinned,
-- postchecked and re-read in the tail like every other body here.
--
-- =====================================================================================
-- THE REFUSAL VOCABULARY THIS FILE OWNS. Everything else it can raise is INHERITED and
-- deliberately NOT re-spelled (CLR38 `authority_not_live` / `period_draft_outstanding` /
-- `period_earlier_unmet` / `period_request_invalid` axes `not_cadence_aligned` and `not_ended` /
-- `period_correction_unsound`; CLR37 `fa_particulars_invalid` + axis; CLR19
-- `write_into_closed_period`; CLR07 the exact-balance test).
--
--   CLR37 fa_change_class_required        a revision named no change class, or a blank reason
--   CLR37 fa_change_class_unsupported     `policy` / `error` — the retrospective-restatement lane
--                                         is #680's, under #679's lock law. NOT built here.
--   CLR37 fa_change_class_on_completion   a FIRST completion is not a change
--   CLR37 fa_particulars_invalid axis change_class   a class outside the three admitted values
--   CLR38 period_request_invalid axis period_closed  the running door's locked-period wall
--   CLR38 authority_ref_invalid + constraint object|kind|id   the instruction's shape
--   CLR38 authority_ref_unresolved + kind + id       …it names no row in this firm AND client
--   CLR04 obo_not_active / insufficient_role         the OBO run door's live-authority recheck
--   CLR10 client_inactive                            …and its client-state arm
--   CLR11 client_not_found                           …and its unknown-client arm
--
-- =====================================================================================

do $p651_pre$
declare v_sha text; v_n int; v_sig text; v_pin record;
begin
  if to_regclass('clara.fixed_assets') is null or to_regclass('clara.fa_depreciation_authorities') is null then
    raise exception '#651 prestate: the fixed-asset register is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;

  -- (1) NOTHING OF THIS SLICE EXISTS YET. A half-applied #651 must be visible, not merged into.
  for v_sig in select unnest(array[
      'clara._fa_assert_period_open(uuid,date)',
      'clara.preview_depreciation_run(uuid)',
      'clara.run_depreciation_period_for(uuid,date,text,uuid)',
      'clara.sign_depreciation_authority(uuid,uuid,text,jsonb)']) loop
    if to_regprocedure(v_sig) is not null then
      raise exception '#651 prestate: % already exists', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- …and the naming trap is recorded rather than re-discovered: `_fa_fy_open_for` (0041:1057) and
  -- `_fa_fy_month_open_for` (0042:6027) already exist and mean "the first DAY of the fiscal year
  -- containing this month", NOT "the fiscal year is open". This file mints no `_fa_period_open`.
  if to_regprocedure('clara._fa_period_open(uuid,date)') is not null then
    raise exception '#651 prestate: a _fa_period_open predicate exists -- the roster is ONE helper'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='fixed_assets' and column_name in ('change_class','change_reason');
  if v_n <> 0 then
    raise exception '#651 prestate: clara.fixed_assets already carries a change classification'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='fa_depreciation_authorities'
     and column_name in ('authority_kind','authority_ref','authority_from');
  if v_n <> 0 then
    raise exception '#651 prestate: clara.fa_depreciation_authorities already carries an authority window'
      using errcode='CLR10';
  end if;

  -- (2) THE PREREQUISITE ROSTER, in `::regprocedure` form (0216:172-199 / 0180:102-159 idiom).
  -- Every one of these is a body this file CALLS, RECUTS or RELIES ON. Two entries correct the
  -- brief's roster against the MEASURED catalog: `clara.withdraw_draft` is FOUR arguments
  -- (p_entry, p_reason, p_expected_revision, p_op_key), not three, and
  -- `clara._depreciation_run_due_core(uuid,uuid)` is named explicitly because the preview and the
  -- OBO door call THAT rather than the granted wrapper (whose `_assert_due_read_ctx` admission is
  -- a CALLER question both of them have already answered at their own floors).
  foreach v_sig in array array[
      'clara._fa_oldest_unmet_period(uuid)',
      'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)',
      'clara._fa_compute_charges(uuid,date,date)',
      'clara._fa_asset_charges(uuid,date,boolean)',
      'clara._fa_asset_json(uuid,date)',
      'clara._depreciation_run_due_core(uuid,uuid)',
      'clara.depreciation_run_due(uuid)',
      'clara.get_fixed_asset(uuid)',
      'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
      'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
      'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)',
      'clara.sign_depreciation_authority(uuid,uuid,text)',
      'clara.run_depreciation_manual(uuid,date,date,text)',
      'clara._fa_validate_particulars(jsonb)',
      'clara._fa_particulars_complete(clara.fixed_assets)',
      'clara._fa_month_start(date)', 'clara._fa_month_end(date)', 'clara._fa_today()',
      'clara._fa_fy_open_for(uuid,date)', 'clara._fa_fy_end_for(uuid,date)',
      'clara._wdb_rerun_breach(uuid,text,text[],date,date)',
      'clara._human_ctx(integer)', 'clara.role_rank(text)',
      'clara._reserve_op(uuid,text,text,bytea)', 'clara._finish_op(uuid,text,text,jsonb)',
      'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)', 'clara._hash(jsonb)',
      'clara.withdraw_draft(uuid,text,uuid,text)',
      'clara.retire_depreciation_authority(uuid,uuid,text,text)',
      'clara._tf_fa_authority_transition()'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#651 prestate: prerequisite % is absent', v_sig using errcode='CLR10';
    end if;
  end loop;
  if to_regclass('clara.fiscal_years') is null then
    raise exception '#651 prestate: clara.fiscal_years is absent -- 0056 must apply first'
      using errcode='CLR10';
  end if;

  -- (3) PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON A MIGRATED clara_651 (0001->0224,
  -- PG 17.11) OFF pg_proc.prosrc — never transcribed from file text. TWO of them CANNOT be read
  -- off 0041's text at all: `_fa_oldest_unmet_period` and `_fa_run_period_core` are 0042 STRING
  -- SPLICES (§S5.15c at 0042:4097, §S5.15d at 0042:4225), applied with replace() over
  -- pg_get_functiondef against the live catalog, so a `grep` for `create or replace function` finds
  -- neither and the file text is NOT the live body. Both live bodies carry
  -- `clara._wdb_rerun_breach(` — asserted below — which is the cheap proof that they are spliced.
  for v_pin in select * from (values
      -- RECUT by this file
      ('clara._fa_oldest_unmet_period(uuid)',
       'b09bca2154a443f89de97337379239566881b285f3bdf99532b8435f97625c67', 'recut'),
      ('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)',
       '3447ce0cabdec6e132b9a7837fcdc313ff3e0cc327e86f0d322a698c2e6279f2', 'recut'),
      ('clara._fa_asset_json(uuid,date)',
       'a16b37b4899913dfde702aebbd3f31be1357d5a147a56d4e7478297e28258c96', 'recut'),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
       '0c1895d4bc37b2a44e72672a86c45539674b362e6b29da748a35b02482c1d136', 'recut'),
      ('clara.sign_depreciation_authority(uuid,uuid,text)',
       '003a212cda2c6dfd1c229498a2ef8c677fc8169c771c4ae0fc7aca1e01b713d5', 'recut'),
      ('clara._fa_validate_particulars(jsonb)',
       '095816f37ee027f6b386d761c848af43b1e6b25f98cfd5cb84fe6fe398ec990c', 'recut'),
      ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
       'a3162c3aef4f75e89d6567a009a57dd19e842e9024e2d31e8a144f14e1f41494', 'recut'),
      ('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)',
       'efc9039d2ca43b5ab4f4ad797c9bb66dd8c35847eed399389b2728fa8fc9879d', 'recut'),
      ('clara._tf_fa_authority_transition()',
       '95aaa6f6eb9498d8ed5e1a229f0ad4757d95c587bf41093e5eda9e1ddd71865e', 'recut'),
      -- THE RETIRE DOOR IS RECUT BECAUSE THIS FILE'S OWN CHECK BREAKS IT (§B.3). Measured on
      -- clara_651 off pg_proc.prosrc, like every pin above.
      ('clara.retire_depreciation_authority(uuid,uuid,text,text)',
       '35b0facd3735e62d13120eb66e9fbe55ac1ae1db4efa0b9cee6b0fe313c57b00', 'recut'),
      -- NON-REGRESSION: this file must not move these, and §I re-reads them afterwards.
      ('clara.get_fixed_asset(uuid)',
       'da9333ebdd3bcaeea916f31651dbf0e87378a525e8c19fd98035141f6fd8be5a', 'unmoved'),
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048', 'unmoved'),
      ('clara._fa_asset_charges(uuid,date,boolean)',
       'a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849', 'unmoved')
    ) as t(sig, sha, kind) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#651 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;
  for v_sig in select unnest(array[
      'clara._fa_oldest_unmet_period(uuid)',
      'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)']) loop
    if position('clara._wdb_rerun_breach(' in pg_get_functiondef(v_sig::regprocedure)) = 0 then
      raise exception '#651 prestate: % does not carry 0042''s spliced re-run gate -- the live body is not what this file splices', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- (4) `_fa_run_period_core`'s CALLER SET IS EXACTLY THREE BEFORE THIS FILE. §I (T.6) pins FOUR.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname <> '_fa_run_period_core'
     and p.prosrc like '%clara._fa_run_period_core(%';
  if v_n <> 3 then
    raise exception '#651 prestate: _fa_run_period_core has % caller(s), expected exactly 3 (run_depreciation_period, run_depreciation_manual, _agent_depreciation_catchup_core)', v_n
      using errcode='CLR10';
  end if;

  -- (5) …AND THE `close_prep` WAKE SOURCE IS STILL DISABLED (0223:247-250's idiom). This file
  -- must be readable, five years from now, as NOT having unparked an agent close lane.
  if (select enabled from clara.wake_engine_sources where source_key = 'close_prep') is not false then
    raise exception '#651 prestate: the close_prep wake source is not disabled' using errcode='CLR10';
  end if;

  raise notice '#651 prestate: clean -- no change classification, no authority window, no period-open helper, no preview, no OBO run door; the TEN recut bodies and the three non-regression bodies are at their measured pre-images; both 0042 splices are live; _fa_run_period_core has exactly three callers; close_prep is still disabled.';
end
$p651_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE CHANGE CLASSIFICATION (AC1, D10). Two columns and ONE one-directional CHECK.
--
-- THE CHECK IS ONE-DIRECTIONAL ON PURPOSE. A two-directional form ("a class is set IFF
-- supersedes_asset_id is not null") would fail to validate against any PRE-EXISTING revision row
-- on the hosted database, which carries neither column and cannot be back-filled — 0017's
-- post-approval immutability allowlist (`_tf_fixed_assets_immutable_0017`) does not admit them.
-- The REQUIREMENT that every NEW revision names a class lives in the recut door (§C), never here:
-- the estate's standing "door enforces, CHECK guards shape" split.
--
-- THREE CLASSES ARE RECORDED, ONE IS IMPLEMENTED (D10). `policy` and `error` are retrospective
-- restatements; that lane is #680's (锁期后的迟到资料与重开决定), under #679's lock law. Recording
-- all three in the CHECK means the column never has to change when #680 lands.
-- =====================================================================================

alter table clara.fixed_assets add column change_class text;
alter table clara.fixed_assets add column change_reason text;
alter table clara.fixed_assets
  add constraint ck_fixed_assets_change_class check (
    (change_class is null and change_reason is null)
    or (change_class in ('estimate','policy','error')
        and supersedes_asset_id is not null
        and change_reason is not null and btrim(change_reason) <> ''));

comment on column clara.fixed_assets.change_class is
  '#651: what KIND of change minted this generation -- estimate | policy | error. Set by '
  'clara.revise_fixed_asset_particulars on the SUCCESSOR row only, never back-filled. NULL on '
  'every root row and on every revision minted before 0227. Only `estimate` is implemented; '
  '`policy` and `error` refuse by name (CLR37 fa_change_class_unsupported) and belong to #680.';
comment on column clara.fixed_assets.change_reason is
  '#651: the human sentence that goes with change_class. Non-blank by CHECK when a class is set.';

-- =====================================================================================
-- §B  THE AUTHORITY'S EXPLICIT INSTRUCTION AND ITS WINDOW (AC5, D7 + D8).
--
-- SHAPE COPIED FROM `clara.accounting_plans` (0193:415-430) — `authority_kind` with its CHECK,
-- `authority_ref jsonb` refusing a non-object, and `authority_from date` "written once and
-- frozen" — and RELAXED TO NULL-ABLE for exactly one reason: the backfill. A pre-0227 authority
-- has no instruction on file and none can be invented, so `authority_ref` back-fills NULL and the
-- window CHECK below is the only thing that binds it going forward.
--
-- D7 (binding): depreciation does NOT move into the plan lane. `accounting_plans.kind` is not
-- widened, `create_accounting_plan` is not touched, and CONTEXT.md:37's sentence ("Depreciation
-- and close schedules are not plan kinds and are refused by name") stays true — 0223:590-598
-- still refuses `depreciation_schedule` by name.
-- =====================================================================================

alter table clara.fa_depreciation_authorities
  add column authority_kind text not null default 'explicit_instruction'
    check (authority_kind in ('explicit_instruction'));
alter table clara.fa_depreciation_authorities
  add column authority_ref jsonb
    check (authority_ref is null or jsonb_typeof(authority_ref) = 'object');
alter table clara.fa_depreciation_authorities add column authority_from date;

-- THE BACKFILL, and the ONE line of this file that was escalated to the orchestrator and ratified
-- (DECISIONS §6.1, 2026-09-19: "Approved as the brief writes it").
--
-- DECISIONS §2.1 wrote it as `date_trunc('month', signed_at)`. That is SESSION-TIMEZONE-DEPENDENT
-- on a `timestamptz` column (`signed_at`, 0041:623): a row signed between 00:00 and 07:59 MYT on
-- the first of a month lands in the PREVIOUS month under a UTC session and in the correct month
-- under a MYT one — on a ONE-TIME, UNREPEATABLE stamp. The composition below is byte-for-byte
-- what a sign performed today stamps (§D), because `clara._fa_today()` is
-- `(now() at time zone 'Asia/Kuala_Lumpur')::date` (0041:1012-1013) and `clara._fa_month_start(date)`
-- is `date_trunc('month', p_d)::date` (0041:1016-1017); WORK-ORDER rule 8 ("Asia/Kuala_Lumpur
-- calendar days") stands behind both. MEASURED on clara_651: 157 signed rows, 157 live-or-retired,
-- ZERO rows where the two candidates differ under either a MYT or a UTC session — the hazard is
-- real and simply did not bite this rig's stamps, which all fall mid-month. The HOSTED count is a
-- release-time read in the runbook and is never assumed zero.
--
-- `clara._tf_fa_authority_transition` refuses any UPDATE outside its sign/retire allowlist AND any
-- same-status update, so it is disabled for exactly this one statement and re-enabled immediately
-- — inside the runner's own per-migration transaction, so a failure anywhere below rolls the
-- disable back with everything else. §I (T.11) asserts it is enabled again rather than trusting
-- these three lines. Precedent: 0176:261-266, 0184:406-408, 0007:831-853.
alter table clara.fa_depreciation_authorities disable trigger t_fa_authorities_transition;
update clara.fa_depreciation_authorities
   set authority_from = clara._fa_month_start((signed_at at time zone 'Asia/Kuala_Lumpur')::date)
 where signed_at is not null and authority_from is null;
alter table clara.fa_depreciation_authorities enable trigger t_fa_authorities_transition;

alter table clara.fa_depreciation_authorities
  add constraint ck_fa_authorities_window check (
    (status = 'proposed' and authority_from is null)
    or (status in ('live','retired') and authority_from is not null));

comment on column clara.fa_depreciation_authorities.authority_kind is
  '#651: only `explicit_instruction` today. An authority RULE (a standing policy that authorises '
  'itself) is not admitted -- the same boundary 0193:1472-1477 draws for accounting plans.';
comment on column clara.fa_depreciation_authorities.authority_ref is
  '#651: {"kind":"accounting_work"|"chat_task","id":<uuid>} -- the row in THIS database that '
  'carries the firm''s instruction. RESOLVED by clara.sign_depreciation_authority against the '
  'SAME firm AND client; a Knowledge preference, a calculation policy or a repeated debit resolves '
  'to nothing and is refused by name (CLR38 authority_ref_unresolved). NULL only on rows signed '
  'before 0227.';
comment on column clara.fa_depreciation_authorities.authority_from is
  '#651 (D8): THE AUTHORITY WINDOW''S FLOOR -- the first day of the SIGNING month, in the book''s '
  'Asia/Kuala_Lumpur calendar, written once at sign time and frozen. The due oracle never proposes '
  'a period starting before it, so a signature is not permission to charge every past period. '
  'Earlier periods reach a run only through the explicit human catch-up door '
  'clara.run_depreciation_manual.';

-- THE TRANSITION TRIGGER'S ALLOWLIST GAINS EXACTLY THE TWO SIGN-TIME COLUMNS, spliced off the
-- LIVE body so nothing else in it can move. Without this the four-argument sign door below would
-- raise CLR38 `authority_immutable` against its own UPDATE.
do $p651_trig$
declare v_sig text := 'clara._tf_fa_authority_transition()';
        v_def text; v_frm text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_frm := $f$declare v_frozen text[] := array['status','signed_by','signed_at','signed_op_key',
  'retired_by','retired_at','retired_reason','retired_op_key'];$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §B: the authority-transition allowlist appears % time(s) (expected exactly once)', v_cnt
      using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare v_frozen text[] := array['status','signed_by','signed_at','signed_op_key',
  'retired_by','retired_at','retired_reason','retired_op_key',
  -- 0227 (#651): the TWO sign-time columns. `v_frozen` is the allowlist of columns the
  -- sign/retire TRANSITIONS may write, not a list of columns that never change; the authority's
  -- instruction reference and its window floor are written by clara.sign_depreciation_authority
  -- in the same UPDATE that flips the status, and nothing else may ever move them.
  'authority_ref','authority_from'];$t$);
  execute v_def;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position($m$'authority_ref','authority_from'$m$ in v_def) = 0
     or position('authority_transition_illegal' in v_def) = 0
     or position('authority_never_deleted' in v_def) = 0
     or position('authority_immutable' in v_def) = 0 then
    raise exception '#651 §B postcheck: the authority-transition splice damaged the body'
      using errcode='CLR10';
  end if;
end $p651_trig$;

-- §B.2  …AND THE TWO SIGN-TIME COLUMNS ARE WRITE-ONCE, WHICH IS A SEPARATE LAW FROM THE ONE
-- ABOVE. `v_frozen` is the allowlist of columns a LAWFUL TRANSITION may write; adding the two
-- columns to it (B.1) makes them writable by EVERY admitted transition, which would leave D8's
-- "written once at sign time and frozen" enforced by convention in two door bodies rather than by
-- the trigger. 0193's own `_tf_accounting_plans_immutable` (0193:476-478) freezes the plan lane's
-- `authority_ref` / `authority_from` by name, and accounting-plans.test.mjs:448-456 says why in as
-- many words: "a frozen column nobody tests is a promise". This block writes the FA lane's half of
-- that wall (the cell is `p651.authority.floor_frozen`).
--
-- SPLICED ON ITS OWN ANCHOR rather than folded into B.1: the anchor below is present in 0041's
-- ORIGINAL body and in B.1's post-image alike, so the two blocks are independent and either can be
-- read, re-run or reviewed without the other.
do $p651_trig_freeze$
declare v_sig text := 'clara._tf_fa_authority_transition()';
        v_def text; v_anchor text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_anchor := '  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then';
  v_cnt := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_cnt <> 1 then
    raise exception '#651 §B.2: the frozen-diff guard appears % time(s) (expected exactly once)', v_cnt
      using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_anchor,
    $t$  -- 0227 (#651): WRITE-ONCE, and this is the wall rather than a convention. `v_frozen`
  -- above admits the two sign-time columns to a lawful transition; it says nothing about writing
  -- them TWICE. clara.sign_depreciation_authority stamps both on the proposed -> live edge and
  -- clara.retire_depreciation_authority stamps a floor on a NEVER-SIGNED withdrawal (§B.3);
  -- after that, no transition may move either one.
  if old.authority_from is not null and new.authority_from is distinct from old.authority_from then
    raise exception 'a depreciation authority window floor is written once and never moved'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_immutable', 'authority_id', old.id,
          'column', 'authority_from')::text;
  end if;
  if old.authority_ref is not null and new.authority_ref is distinct from old.authority_ref then
    raise exception 'a depreciation authority instruction reference is written once and never moved'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_immutable', 'authority_id', old.id,
          'column', 'authority_ref')::text;
  end if;
$t$ || v_anchor);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('written once and never moved' in v_def) = 0
     or position($m$'column', 'authority_from'$m$ in v_def) = 0
     or position($m$'column', 'authority_ref'$m$ in v_def) = 0
     or position('authority_transition_illegal' in v_def) = 0
     or position('authority_never_deleted' in v_def) = 0 then
    raise exception '#651 §B.2 postcheck: the write-once splice damaged the body' using errcode='CLR10';
  end if;
  -- ORDER IS LOAD-BEARING: the write-once wall must be reached BEFORE the transition-legality
  -- raise, or a second write on an unlawful edge would be reported as an illegal transition and
  -- the column that actually moved would never be named.
  if position('written once and never moved' in v_def) > position('authority_transition_illegal' in v_def) then
    raise exception '#651 §B.2 postcheck: the write-once wall is spliced AFTER the transition raise'
      using errcode='CLR10';
  end if;
end $p651_trig_freeze$;

-- §B.3  THE RETIRE DOOR STAMPS THE WINDOW FLOOR THE SAME WAY IT ALREADY STAMPS THE SIGNATURE.
--
-- THE DEFECT THIS CLOSES IS THIS FILE'S OWN (adversarial review ADV-651-1, fix-round 1).
-- `ck_fa_authorities_window` above demands a floor on every `live`/`retired` row.
-- `clara.retire_depreciation_authority` (0041:3361) is the ONE way a NEVER-SIGNED authority leaves
-- `proposed` — a firm proposes the wrong cadence and withdraws it — and 0041 wrote it for exactly
-- that case, coalescing `signed_by` / `signed_at` (0041:3393-3394) instead of demanding them. The
-- transition trigger admits `proposed -> retired` by name, so nothing upstream stops the act; the
-- CHECK would stop it, with a raw 23514 carrying no CLR code, no reason token and no remedy, in a
-- dialog an admin is looking at (fa-authority-ceremony.tsx renders Retire for a proposed authority
-- too; only Sign is gated on the status).
--
-- THE FIX IS ONE COALESCE, IN THE SAME UPDATE, in the same shape as the two beside it. A SIGNED
-- authority's floor is therefore never moved by a retirement (§B.2 raises on that anyway), and a
-- never-signed one leaves with the month it was withdrawn in — which is what the row's invented
-- `signed_at` already says. Spliced off the LIVE body (0042's idiom) rather than transcribed.
do $p651_retire$
declare v_sig text := 'clara.retire_depreciation_authority(uuid,uuid,text,text)';
        v_def text; v_anchor text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_anchor := '    signed_by = coalesce(au.signed_by, c.actor), signed_at = coalesce(au.signed_at, now())'
    || E'\n    where id = p_authority;';
  v_cnt := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_cnt <> 1 then
    raise exception '#651 §B.3: the retire UPDATE''s signature-stamp tail appears % time(s) (expected exactly once)', v_cnt
      using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_anchor,
    '    signed_by = coalesce(au.signed_by, c.actor), signed_at = coalesce(au.signed_at, now()),'
    || E'\n' || $t$    -- 0227 (#651): THE WINDOW FLOOR, stamped exactly the way the two values before it are.
    -- ck_fa_authorities_window demands one on every non-proposed row, and this door is the only
    -- way a NEVER-SIGNED authority becomes `retired`. `coalesce` so a signed authority's floor is
    -- carried through untouched.
    authority_from = coalesce(au.authority_from, clara._fa_month_start(clara._fa_today()))$t$
    || E'\n    where id = p_authority;');
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('authority_from = coalesce(au.authority_from, clara._fa_month_start(clara._fa_today()))' in v_def) = 0
     or position('signed_at = coalesce(au.signed_at, now())' in v_def) = 0
     or position('authority_not_live' in v_def) = 0
     or position('clara._reserve_op(c.firm' in v_def) = 0
     or position('clara._finish_op(c.firm' in v_def) = 0
     or position('role_rank(''admin'')' in v_def) = 0 then
    raise exception '#651 §B.3 postcheck: the retire splice damaged the body' using errcode='CLR10';
  end if;
end $p651_retire$;

-- =====================================================================================
-- §C  THE CLASSIFICATION'S TRANSPORT — MEASUREMENT M1'S GREEN ARM.
--
-- M1, run on clara_651 before this section was written: a scratch `create or replace` widened the
-- LIVE `clara._fa_validate_particulars` closed key set with `change_class` / `change_reason`, and
-- then
--     packages/db/tests/fixed-asset-acquisition.test.mjs        21/21 pass (p639.particulars.axes,
--                                                               p639.question.dependent included)
--     packages/runtime/tests/fixed-asset-acquisition-unit.test.mjs  9/9 pass (fa.keys, fa.fields)
--     node scripts/check-frozen-workflows.mjs                   OK, 296 frozen files verified
-- all stayed green, and the validator was restored to its pinned pre-image before this file was
-- written. GREEN ⇒ the classification travels inside `p_particulars` and
-- `clara.revise_fixed_asset_particulars` KEEPS its five-argument signature (DECISIONS §2.1,
-- verbatim); no `revise_fixed_asset_particulars_classified` verb is minted, no call site moves and
-- the two exact-set censuses in x42-reservation-authority.test.mjs are untouched.
--
-- KNOWN, RECORDED DRIFT: the frozen mirror `FA_PARTICULARS_KEYS`
-- (packages/runtime/lib/fixed-asset-acquisition.ts:54-57) becomes a strict SUBSET of the DB's
-- admitted set, and `fa.keys`' PROSE claim ("exactly the nine clara._fa_validate_particulars
-- accepts") goes stale even though its assertion stays true. The two new keys are REVISION-ONLY
-- and are refused outright on a first completion (below), so they never travel through that
-- module's `.strict()` answer schema — which is exactly why the mirror stays fit for its purpose.
-- The assertion is NOT weakened.
-- =====================================================================================

do $p651_validator$
declare v_sig text := 'clara._fa_validate_particulars(jsonb)';
        v_def text; v_frm text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('change_class' in v_def) <> 0 then
    raise exception '#651 §C prestate: the validator already admits a change class' using errcode='CLR10';
  end if;

  -- (a) THE DECLARATION.
  v_frm := $f$declare v_method text; v_life int; v_rate int; v_res bigint; v_start date; k text;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §C (a): the validator declaration appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare v_method text; v_life int; v_rate int; v_res bigint; v_start date; k text;
        v_class text; v_creason text;$t$);

  -- (b) THE CLOSED KEY SET, WIDENED BY EXACTLY TWO.
  v_frm := $f$'description', 'ca_class', 'is_commercial_vehicle', 'is_new') then$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §C (b): the closed key set appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$'description', 'ca_class', 'is_commercial_vehicle', 'is_new',
                 -- 0227 (#651): REVISION-ONLY. Both completion doors refuse them by name
                 -- (CLR37 fa_change_class_on_completion) -- a first completion is not a change.
                 'change_class', 'change_reason') then$t$);

  -- (c) SHAPE VALIDATION AND THE WIDENED PROJECTION. The validator owns SHAPE only: whether a
  -- class is REQUIRED, and which classes are implemented, are the door's questions (§D).
  v_frm := $f$  return jsonb_build_object('method', v_method, 'useful_life_months', v_life,
    'rate_bps', v_rate, 'residual_cents', v_res, 'start_date', v_start,
    'description', nullif(btrim(p_particulars ->> 'description'), ''),
    'ca_class', nullif(btrim(p_particulars ->> 'ca_class'), ''),
    'is_commercial_vehicle', nullif(p_particulars ->> 'is_commercial_vehicle', '')::boolean,
    'is_new', nullif(p_particulars ->> 'is_new', '')::boolean);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §C (c): the validator projection appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  -- 0227 (#651): THE CHANGE CLASSIFICATION'S SHAPE, on the same axis vocabulary every other
  -- particulars value uses. A value outside the three recorded classes is a malformed value, not
  -- a policy decision -- `fa_change_class_unsupported` (the policy decision) is the DOOR's.
  v_class := nullif(btrim(p_particulars ->> 'change_class'), '');
  v_creason := nullif(btrim(p_particulars ->> 'change_reason'), '');
  if v_class is not null and v_class not in ('estimate', 'policy', 'error') then
    raise exception 'change_class must be estimate, policy or error'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', 'change_class',
          'change_class', v_class)::text;
  end if;
  return jsonb_build_object('method', v_method, 'useful_life_months', v_life,
    'rate_bps', v_rate, 'residual_cents', v_res, 'start_date', v_start,
    'description', nullif(btrim(p_particulars ->> 'description'), ''),
    'ca_class', nullif(btrim(p_particulars ->> 'ca_class'), ''),
    'is_commercial_vehicle', nullif(p_particulars ->> 'is_commercial_vehicle', '')::boolean,
    'is_new', nullif(p_particulars ->> 'is_new', '')::boolean,
    'change_class', v_class, 'change_reason', v_creason);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('IMMUTABLE' in upper(v_def)) = 0 then
    raise exception '#651 §C postcheck: the validator is no longer IMMUTABLE' using errcode='CLR10';
  end if;
  if (select count(*) from (select unnest(array['unknown_key','malformed','drivers','residual',
        'start_date','method','change_class']) as m) t
      where position(t.m in v_def) = 0) <> 0 then
    raise exception '#651 §C postcheck: the validator lost one of its axes' using errcode='CLR10';
  end if;
end $p651_validator$;

-- THE TWO COMPLETION BODIES GAIN THE SAME WALL. They each carry their OWN body and each call the
-- validator INDEPENDENTLY — measured: `clara.complete_fixed_asset_particulars` (0041:3035) does
-- NOT route through 0216's shared core — so the wall belongs in both, and putting it in
-- `_fa_complete_particulars_core` is what gives 0216's runtime door
-- `complete_fixed_asset_particulars_for` the identical refusal.
-- ONE BLOCK PER BODY, EACH NAMING ITS TARGET AS A LITERAL — 0042 §S5.15c/§S5.15d's own shape,
-- and not a stylistic choice. An earlier cut looped over a two-row VALUES list and spliced
-- `r.sig::regprocedure`, which is a dynamic `execute` no static reader can attribute to a
-- function: `apps/web/test/sqlFunctionCensus.ts` threw
-- `sql_function_census_unresolved_execute:0227_depreciation_history.sql:v_def` and took FOUR live
-- web census suites down with it (do-action-floors, firm capabilities, members-doors,
-- firm-scope-db-pins). A migration whose recuts an estate-wide instrument cannot read is a
-- migration nothing downstream can police, so the loop is unrolled. The two bodies' anchors
-- differ (only the human door takes `_human_ctx` first), which is why they were never one splice.

do $p651_completion_human$
declare
  v_sig text := 'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)';
  v_def text; v_frm text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_frm := $f$  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §Ca: the op-key anchor in % appears % time(s)', v_sig, v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm, v_frm || $t$
  -- 0227 (#651): A FIRST COMPLETION IS NOT A CHANGE. The change classification describes what
  -- kind of REVISION superseded a generation; a row whose particulars were never filled in has
  -- nothing to reclassify, and admitting the keys here would let a caller stamp a class on a root
  -- row that `ck_fixed_assets_change_class` would then refuse with a constraint name instead of a
  -- sentence. Refused BEFORE the op key is reserved, so a retry is clean.
  if p_particulars ? 'change_class' or p_particulars ? 'change_reason' then
    raise exception 'depreciation particulars are being completed for the first time; a change class describes a REVISION (clara.revise_fixed_asset_particulars), not a completion'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_change_class_on_completion',
          'asset_id', p_asset, 'remedy', 'revise_fixed_asset_particulars')::text;
  end if;$t$);
  execute v_def;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('fa_change_class_on_completion' in v_def) = 0
     or position('fa_particulars_already_complete' in v_def) = 0
     or position('clara._fa_validate_particulars(p_particulars)' in v_def) = 0 then
    raise exception '#651 §Ca postcheck: the completion wall splice damaged %', v_sig using errcode='CLR10';
  end if;
end $p651_completion_human$;

do $p651_completion_core$
declare
  v_sig text := 'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)';
  v_def text; v_frm text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_frm := $f$  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_op_key"}';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §Cb: the op-key anchor in % appears % time(s)', v_sig, v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm, v_frm || $t$
  -- 0227 (#651): A FIRST COMPLETION IS NOT A CHANGE. The change classification describes what
  -- kind of REVISION superseded a generation; a row whose particulars were never filled in has
  -- nothing to reclassify, and admitting the keys here would let a caller stamp a class on a root
  -- row that `ck_fixed_assets_change_class` would then refuse with a constraint name instead of a
  -- sentence. Refused BEFORE the op key is reserved, so a retry is clean.
  if p_particulars ? 'change_class' or p_particulars ? 'change_reason' then
    raise exception 'depreciation particulars are being completed for the first time; a change class describes a REVISION (clara.revise_fixed_asset_particulars), not a completion'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_change_class_on_completion',
          'asset_id', p_asset, 'remedy', 'revise_fixed_asset_particulars')::text;
  end if;$t$);
  execute v_def;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('fa_change_class_on_completion' in v_def) = 0
     or position('fa_particulars_already_complete' in v_def) = 0
     or position('clara._fa_validate_particulars(p_particulars)' in v_def) = 0 then
    raise exception '#651 §Cb postcheck: the completion wall splice damaged %', v_sig using errcode='CLR10';
  end if;
end $p651_completion_core$;

-- =====================================================================================
-- §D  THE REVISION DOOR REQUIRES A CLASS AND STAMPS IT FORWARD (AC1, D10).
--
-- FIVE ARGUMENTS, UNMOVED (DECISIONS §2.1, verbatim; risk 4 — the verb is granted BY EXACT
-- SIGNATURE at 0041:4414 and censused BY NAME at rig-meta.mjs:697). Every existing guard stays
-- byte-identical: `fa_revise_effective_conflict` (0041:3164-3172), the carried-baseline bound
-- (:3174-3179), the pre-birth bound (:3181-3186), the disposal-draft freeze and the 64-edge cap.
-- The class is stamped on the SUCCESSOR row inside the existing supersede-forward insert
-- (0041:3209-3224) and nowhere else, so a predecessor's history is untouched by construction.
-- =====================================================================================

do $p651_revise$
declare v_sig text := 'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)';
        v_def text; v_frm text; v_cnt int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._fa_validate_particulars(p_particulars)', 1),
      ('fa_revise_effective_conflict', 3),
      ('clara._fa_assert_lineage_mintable(p_asset', 1),
      ('insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,', 1),
      ('update clara.fixed_assets set status = ''superseded''', 1)) as t(marker, want) loop
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '#651 §D prestate: the revise door carries "%" % time(s), expected %', r.marker, v_cnt, r.want
        using errcode='CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION.
  v_frm := $f$declare c record; v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §D (a): the revise declaration appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare c record; v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype;
        v_class text; v_creason text;$t$);

  -- (b) THE CLASSIFICATION IS REQUIRED, AND TWO OF THE THREE CLASSES REFUSE BY NAME (D10).
  v_frm := $f$  v_p := clara._fa_validate_particulars(p_particulars);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §D (b): the validator call appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  v_p := clara._fa_validate_particulars(p_particulars);
  -- 0227 (#651, AC1 + D10): EVERY REVISION NAMES WHAT KIND OF CHANGE IT IS, AND WHY.
  -- Without this the register cannot tell an estimate revision (prospective, which is what this
  -- door has always done) from a policy change or an error correction (both RETROSPECTIVE, and
  -- neither of them this door's act). Recorded: three classes. Implemented: one.
  v_class := v_p ->> 'change_class';
  v_creason := v_p ->> 'change_reason';
  if v_class is null then
    raise exception 'a prospective revision must say what kind of change it is: change_class must be one of estimate, policy, error (only estimate is supported today)'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_change_class_required', 'asset_id', p_asset,
          'axis', 'change_class', 'admits', jsonb_build_array('estimate', 'policy', 'error'),
          'implemented', jsonb_build_array('estimate'))::text;
  end if;
  if v_creason is null then
    raise exception 'a prospective revision must carry a non-blank change_reason'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_change_class_required', 'asset_id', p_asset,
          'axis', 'change_reason', 'change_class', v_class)::text;
  end if;
  if v_class <> 'estimate' then
    -- NAMED, NOT SILENT. A policy change and an error correction restate periods the books have
    -- already reported; that lane is #680 (锁期后的迟到资料与重开决定), under #679's lock law. This
    -- door is prospective by construction (the effective-from guards above), so admitting either
    -- here would produce a prospective row labelled as a retrospective act.
    raise exception 'a % change is a retrospective restatement; this door only makes PROSPECTIVE estimate revisions. Ticket #680 owns the restatement lane, under #679''s lock law.', v_class
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_change_class_unsupported',
          'change_class', v_class, 'asset_id', p_asset,
          'owning_ticket', '#680', 'lock_law', '#679',
          'remedy', 'record the restatement through #680''s lane once it ships; an estimate revision is prospective and is admitted here today')::text;
  end if;$t$);

  -- (c) THE STAMP, ON THE SUCCESSOR ROW ONLY.
  v_frm := $f$      supersedes_asset_id, effective_from, ca_class, is_commercial_vehicle, is_new)$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §D (c): the successor column list appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$      supersedes_asset_id, effective_from, ca_class, is_commercial_vehicle, is_new,
      change_class, change_reason)$t$);

  v_frm := $f$      coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new))
    returning id into v_new;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §D (c2): the successor value list appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$      coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new),
      v_class, v_creason)
    returning id into v_new;$t$);

  -- (d) THE RECEIPT NAMES THE CLASS. A surface that renders a revision receipt must be able to
  -- say what kind of change it just made without a second read.
  v_frm := $f$      'effective_from', p_effective_from, 'client_id', p_client,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §D (d): the receipt anchor appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$      'effective_from', p_effective_from, 'client_id', p_client,
      'change_class', v_class, 'change_reason', v_creason,$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('fa_change_class_required', 2),
      ('fa_change_class_unsupported', 1),
      ('fa_revise_effective_conflict', 3),
      ('clara._fa_assert_lineage_mintable(p_asset', 1),
      ('change_class, change_reason)', 1)) as t(marker, want) loop
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '#651 §D postcheck: marker "%" is now % (expected %)', r.marker, v_cnt, r.want
        using errcode='CLR10';
    end if;
  end loop;
  -- THE REFUSAL NAMES THE TICKETS IT HANDS THE WORK TO. An accountant reads this string and the
  -- next implementer greps it, so #680 (the retrospective-restatement lane) and #679 (its lock
  -- law) are asserted PRESENT rather than counted -- a count would break on a reworded sentence
  -- while a missing ticket number would not.
  if position('#680' in v_def) = 0 or position('#679' in v_def) = 0 then
    raise exception '#651 §D postcheck: the unsupported-class refusal no longer names #680 and #679'
      using errcode='CLR10';
  end if;
  if position('#676' in v_def) <> 0 then
    raise exception '#651 §D postcheck: the refusal names #676, which governs allocated-entry corrections and has nothing to do with fixed assets (DECISIONS D10 records the correction)'
      using errcode='CLR10';
  end if;
end $p651_revise$;

-- =====================================================================================
-- §E  THE LOCKED-PERIOD LAW (AC2, D9). ONE new helper, adopted unchanged by #678.
-- =====================================================================================

create function clara._fa_assert_period_open(p_client uuid, p_date date) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_fy_id uuid; v_fy_label text; v_fy_status text; v_fy_starts date; v_fy_ends date;
begin
  -- THE FY CONTAINING THIS DATE, selected EXACTLY the way 0056:656-662 selects it: zero rows means
  -- a client with no close model at all (inert on arrival), and the CLOSED state wins if
  -- contiguity ever admitted two matches -- a derived state a guard never rests on.
  select fy.id, fy.label, fy.status, fy.starts_on, fy.ends_on
    into v_fy_id, v_fy_label, v_fy_status, v_fy_starts, v_fy_ends
    from clara.fiscal_years fy
   where fy.client_id = p_client
     and p_date between fy.starts_on and fy.ends_on
   order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
   limit 1;
  if v_fy_id is null or v_fy_status in ('open', 'reopened') then
    return;
  end if;
  -- REFUSED AT THE RUNNING DOOR, NOT AT APPROVE. Measured before this file: the run died anyway,
  -- but on `clara._tf_period_wall_lines`' CLR19 -- a LINE-level refusal naming an entry id, raised
  -- after the whole computation had run, with no remedy a professional could act on. This refusal
  -- names the fiscal year, its status, the date that could not enter it, and the one way back in.
  raise exception 'fiscal year % (% to %) is %; a depreciation charge dated % may not be run into it -- the formal reopen path (clara.reopen_fiscal_year) is the one way back in', v_fy_label, v_fy_starts, v_fy_ends, v_fy_status, p_date
    using errcode = 'CLR38',
      detail = jsonb_build_object('reason', 'period_request_invalid', 'axis', 'period_closed',
        'fiscal_year_id', v_fy_id, 'fy_label', v_fy_label, 'fy_status', v_fy_status,
        'fy_starts_on', v_fy_starts, 'fy_ends_on', v_fy_ends,
        'period_end', p_date, 'remedy', 'reopen_fiscal_year')::text;
end $$;
revoke all on function clara._fa_assert_period_open(uuid,date) from public;
comment on function clara._fa_assert_period_open(uuid,date) is
  '#651: the fixed-asset lane''s LOCKED-PERIOD LAW, in one ungranted body. Raises CLR38 '
  'period_request_invalid / axis period_closed when the fiscal year containing p_date is closing '
  'or closed; returns silently when there is no fiscal year or it is open/reopened. #678 adopts '
  'this unchanged rather than minting a second predicate.';

-- THE POSTER ASKS IT, immediately before the draft insert and AFTER the zero-charge `noop` arm,
-- so a closed period with nothing to charge is still a lawful noop rather than a refusal.
do $p651_poster$
declare v_sig text := 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)';
        v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  -- 0042 S5.15d's OWN postcheck census, re-run as this splice's PRESTATE (0042:4331-4345).
  for r in select * from (values
      ('clara._wdb_rerun_breach(p_client', 1),
      ('period_correction_unsound', 1),
      ('retire_depreciation_authority', 2),
      ('pg_advisory_xact_lock(203005004', 1),
      ('authority_not_live', 1),
      ('clara._fa_oldest_unmet_period(p_client)', 1),
      ('period_earlier_unmet', 1),
      ('clara._fa_compute_charges(p_client, v_ps, v_pe)', 1),
      ('clara._assert_balanced(v_entry)', 1),
      ('clara._approve_entry_core(', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#651 §E prestate: the FA poster carries "%" % time(s), expected % -- the body drifted; re-derive this splice against the live catalog', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;

  v_frm := $f$  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §E: the draft-insert anchor appears % time(s) (expected exactly once)', v_cnt
      using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  -- 0227 (#651, D9): THE LOCKED-PERIOD WALL, AT THE RUNNING DOOR. It sits AFTER the
  -- zero-charge noop arm (a closed period with nothing to charge is still a lawful noop, and a
  -- refusal there would turn a no-op into an error for every sweep) and BEFORE the first write,
  -- so a refused run leaves nothing behind. The posting date this draft would carry is v_pe, which
  -- is exactly the date 0056's own walls would judge -- so the two can never disagree about WHICH
  -- fiscal year is in question, only about WHEN the refusal arrives.
  perform clara._fa_assert_period_open(p_client, v_pe);
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._wdb_rerun_breach(p_client', 1),
      ('period_correction_unsound', 1),
      ('pg_advisory_xact_lock(203005004', 1),
      ('authority_not_live', 1),
      ('clara._fa_oldest_unmet_period(p_client)', 1),
      ('period_earlier_unmet', 1),
      ('clara._fa_compute_charges(p_client, v_ps, v_pe)', 1),
      ('clara._assert_balanced(v_entry)', 1),
      ('clara._approve_entry_core(', 1),
      ('clara._fa_assert_period_open(p_client, v_pe)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#651 §E postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;
  -- ORDERED: rung -> sequencing -> the re-run gate -> the arithmetic -> THE PERIOD WALL -> the
  -- write -> the approve path. The wall after the arithmetic is deliberate (see the splice text).
  if not (position('clara._fa_compute_charges(p_client, v_ps, v_pe)' in v_def)
            < position('clara._fa_assert_period_open(p_client, v_pe)' in v_def)
          and position('clara._fa_assert_period_open(p_client, v_pe)' in v_def)
            < position('insert into clara.journal_entries(client_id, status, posting_date' in v_def)
          and position('insert into clara.journal_entries(client_id, status, posting_date' in v_def)
            < position('clara._approve_entry_core(' in v_def)) then
    raise exception '#651 §E postcheck: the period wall is not between the arithmetic and the first write'
      using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure) <> 'clara_fn_owner' then
    raise exception '#651 §E postcheck: _fa_run_period_core changed owner' using errcode='CLR10';
  end if;
end $p651_poster$;

-- THE ORACLE SKIPS WHAT THE POSTER WOULD REFUSE, AND FLOORS WHAT THE AUTHORITY DOES NOT REACH.
--
-- THE SAME FISCAL-YEAR PREDICATE, INLINE — never a call into the assert and never a
-- `begin/exception` around one. This body is STABLE and is the leader sweep's hot-path probe; its
-- own comment at 0041:1915-1916 says "The sweep never calls into a refusal it can predict, so the
-- probe answers false rather than letting the verb raise", and catching a raise to manufacture a
-- boolean would also swallow any other CLR38 reachable from it. §I (T.12) binds the two fragments
-- together so the wall and the skip can never drift apart.
do $p651_oracle$
declare v_sig text := 'clara._fa_oldest_unmet_period(uuid)';
        v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  -- 0042 S5.15c's OWN postcheck census, re-run as this splice's PRESTATE (0042:4193-4207).
  for r in select * from (values
      ('clara._wdb_rerun_breach(p_client', 1),
      ('period_correction_unsound', 1),
      ('period_draft_outstanding', 1),
      ('nothing_due', 1),
      ('period_not_ended', 1),
      ('clara._fa_first_due_month(fa.id', 1),
      ('clara._fa_disposal_draft_outstanding(p_client, fa.id, v_horizon)', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#651 §E prestate: the FA due oracle carries "%" % time(s), expected % -- the body drifted; re-derive this splice against the live catalog', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;

  -- (a) THE DECLARATION.
  v_frm := $f$declare au record; v_today date; v_horizon date; v_first date; v_ps date; v_pe date;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §E (a): the oracle declaration appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$declare au record; v_today date; v_horizon date; v_first date; v_ps date; v_pe date;
        v_skipped_closed jsonb := '[]'::jsonb; v_guard int := 0;
        v_fy_id uuid; v_fy_label text; v_fy_status text;$t$);

  -- (b) THE PERIOD WALK: floor, then skip, then answer.
  v_frm := $f$  if au.cadence = 'monthly' then
    v_ps := v_first; v_pe := clara._fa_month_end(v_first);
  else
    v_ps := clara._fa_fy_open_for(p_client, v_first);
    v_pe := clara._fa_fy_end_for(p_client, v_first);
  end if;
  -- A period is DUE only once it has ENDED (design SS3.1). MYT, never the session zone.
  if v_pe >= v_today then
    return jsonb_build_object('due', false, 'reason', 'period_not_ended');
  end if;
  return jsonb_build_object('due', true, 'period_start', v_ps, 'period_end', v_pe,
    'cadence', au.cadence);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §E (b): the oracle answer block appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  -- 0227 (#651, D8 + D9): THE AUTHORITY FLOOR AND THE CLOSED-PERIOD SKIP, IN ONE WALK.
  -- The arithmetic above answers WHICH MONTH first owes a charge; this walk answers WHICH PERIOD
  -- may lawfully be PROPOSED for it. Two questions can move the answer forward, neither of them
  -- arithmetic: the authority's own window floor (D8 -- a signature is not permission to charge
  -- every past period) and a fiscal year that is closing or closed (D9 -- the poster would refuse,
  -- and an oracle that does not ask advertises a period its poster refuses, once per sweep,
  -- forever; 0042:4441 names that exact failure).
  -- WHAT A SKIP DOES NOT MEAN: the skipped months' ARREARS are still charged by the next open
  -- period's run, because clara._fa_asset_charges charges every uncharged month up to the period
  -- end and this file does not touch it. The charge ROWS keep their own months; the journal ENTRY
  -- is dated in the open period. `skipped_closed` means "never RUN in its own right", never
  -- "this money is gone" -- and it is reported so a professional can see it happen.
  loop
    v_guard := v_guard + 1;
    if v_guard > 1200 then
      -- A hundred years of monthly periods. Unreachable in practice; the probe must ANSWER.
      return jsonb_build_object('due', false, 'reason', 'period_unreachable',
        'skipped_closed', v_skipped_closed);
    end if;
    if au.cadence = 'monthly' then
      v_ps := v_first; v_pe := clara._fa_month_end(v_first);
    else
      v_ps := clara._fa_fy_open_for(p_client, v_first);
      v_pe := clara._fa_fy_end_for(p_client, v_first);
    end if;
    -- A period is DUE only once it has ENDED (design SS3.1). MYT, never the session zone.
    if v_pe >= v_today then
      return jsonb_build_object('due', false, 'reason', 'period_not_ended',
        'skipped_closed', v_skipped_closed);
    end if;
    -- THE AUTHORITY WINDOW'S FLOOR (D8). NULL on every authority signed before 0227, which is
    -- what keeps this inert until a signature carries a window.
    if au.authority_from is not null and v_ps < au.authority_from then
      v_first := v_pe + 1;
      continue;
    end if;
    select fy.id, fy.label, fy.status into v_fy_id, v_fy_label, v_fy_status
      from clara.fiscal_years fy
     where fy.client_id = p_client
       and v_pe between fy.starts_on and fy.ends_on
     order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
     limit 1;
    if v_fy_id is not null and v_fy_status not in ('open', 'reopened') then
      v_skipped_closed := v_skipped_closed || jsonb_build_array(jsonb_build_object(
        'period_start', v_ps, 'period_end', v_pe, 'fiscal_year_id', v_fy_id,
        'fy_label', v_fy_label, 'fy_status', v_fy_status));
      v_first := v_pe + 1;
      continue;
    end if;
    exit;
  end loop;
  return jsonb_build_object('due', true, 'period_start', v_ps, 'period_end', v_pe,
    'cadence', au.cadence, 'skipped_closed', v_skipped_closed);$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('clara._wdb_rerun_breach(p_client', 1),
      ('period_correction_unsound', 1),
      ('period_draft_outstanding', 1),
      ('nothing_due', 1),
      ('period_not_ended', 1),
      ('clara._fa_first_due_month(fa.id', 1),
      ('clara._fa_disposal_draft_outstanding(p_client, fa.id, v_horizon)', 1),
      ('skipped_closed', 10),
      ('au.authority_from', 2)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#651 §E postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;
  -- 0042 S5.15c's OWN ORDERING LAW, re-run against the recut body.
  if not (position('period_draft_outstanding' in v_def)
            < position('clara._wdb_rerun_breach(p_client' in v_def)
          and position('clara._wdb_rerun_breach(p_client' in v_def)
            < position('for fa in select f.id as id from clara.fixed_assets f' in v_def)) then
    raise exception '#651 §E postcheck: 0042 S5.15c''s ordering law no longer reads true of the recut oracle'
      using errcode='CLR10';
  end if;
  if position('STABLE' in upper(v_def)) = 0 then
    raise exception '#651 §E postcheck: the oracle is no longer STABLE -- it must ANSWER, never write'
      using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure) <> 'clara_fn_owner' then
    raise exception '#651 §E postcheck: _fa_oldest_unmet_period changed owner' using errcode='CLR10';
  end if;
end $p651_oracle$;

-- =====================================================================================
-- §F  THE SIGN DOOR TAKES A REQUIRED, RESOLVED INSTRUCTION AND STAMPS THE WINDOW (AC5, D8).
--
-- DROP + CREATE, NOT AN OVERLOAD (§2.2 rule 4 — exactly ONE pg_proc row per name). The 0018:188
-- scar is the precedent: adding `p_resolution` to `seed_fixed_asset` needed a DROP + CREATE and
-- the old arity's grant died with it, so the grant and the owner are RE-STATED in this same file
-- (§H) rather than inherited.
--
-- THE RESOLUTION LADDER IS `clara.create_accounting_plan`'s (0193:1482-1514), carried onto the FA
-- family's CLR38 axis so one surface renders one vocabulary. A Knowledge preference, a calculation
-- policy or a repeated debit has no row in either relation, so none of them can supply authority.
--
-- WHAT THAT LADDER PROVES, EXACTLY (adversarial review ADV-651-2, fix-round 1 — written here so
-- the next reader does not have to re-derive it): it proves PROVENANCE, not INSTRUCTION. The
-- reference must name a REAL row of `clara.accounting_work` or `clara.agent_tasks` in THIS firm
-- and THIS client — which is what rules out a Knowledge preference, a policy or a standing rule,
-- and it is the whole of AC5's executable half. It does NOT read the row's `kind`, `status`,
-- `purpose` or author, so a machine-born task nobody typed also satisfies it. That is deliberate
-- and it is the ESTATE's position rather than this file's: 0193:1500-1514 is byte-for-byte the
-- same existence test, with the same comment, for the plan lane. Narrowing one lane and not the
-- other would give a firm two different meanings for one word, so the narrowing is a cross-lane
-- decision and a NAMED RESIDUAL here, not a quiet tightening. See #651's fix-round report.
-- =====================================================================================

drop function clara.sign_depreciation_authority(uuid,uuid,text);

create function clara.sign_depreciation_authority(p_client uuid, p_authority uuid, p_op_key text,
    p_authority_ref jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; au record;
        v_ref_kind text; v_ref_id uuid; v_ok boolean; v_from date;
begin
  -- WD-R9: the SIGN floor is ADMIN+. Depreciation is the strongest autopost case in the
  -- product; the signature is what the autonomy derives from, so it sits with the firm's
  -- administration, not with whoever coded the asset.
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- THE REPLAY IDENTITY IS UNMOVED (client + authority). The instruction reference is validated
  -- before anything is written, so a replay of the same signature returns the first receipt
  -- whatever reference the retry carried -- which is what a lost response needs.
  v_dedupe := clara._reserve_op(c.firm, 'sign_depreciation_authority', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'authority', p_authority)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into au from clara.fa_depreciation_authorities
    where id = p_authority and client_id = p_client for update;
  if not found then
    raise exception 'depreciation authority is not in this client' using errcode = 'CLR11';
  end if;
  if au.status <> 'proposed' then
    raise exception 'only a proposed depreciation authority can be signed'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_already_live', 'status', au.status)::text;
  end if;
  if exists (select 1 from clara.fa_depreciation_authorities
             where client_id = p_client and status = 'live') then
    raise exception 'this client already has a live depreciation authority; retire it first'
      using errcode = 'CLR38', detail = '{"reason":"authority_already_live"}';
  end if;

  -- 0227 (#651, AC5): THE EXPLICIT INSTRUCTION, SHAPED THEN RESOLVED.
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a depreciation authority names the instruction that carries it'
      using errcode = 'CLR38',
        detail = '{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work', 'chat_task') then
    raise exception 'a depreciation authority reference names an accounting_work or a chat_task'
      using errcode = 'CLR38',
        detail = '{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a depreciation authority reference names a row by id'
      using errcode = 'CLR38',
        detail = '{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- RESOLVED, not merely well-shaped, and in the SAME firm AND client. A Knowledge preference, a
  -- calculation policy or a repeated debit has no row here, so none of them can supply authority.
  -- THE TEST IS EXISTENCE: it proves the instruction's PROVENANCE (a real row of this client's
  -- own work or chat lane), NOT that a person typed it. `kind`, `status` and author are not read
  -- — deliberately, and identically to 0193:1500-1514 for accounting plans. See §F's header.
  if v_ref_kind = 'accounting_work' then
    select exists (select 1 from clara.accounting_work w
                    where w.id = v_ref_id and w.firm_id = c.firm and w.client_id = p_client) into v_ok;
  else
    select exists (select 1 from clara.agent_tasks t
                    where t.id = v_ref_id and t.firm_id = c.firm and t.client_id = p_client) into v_ok;
  end if;
  if not v_ok then
    raise exception 'the instruction this depreciation authority cites does not exist for this client'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_ref_unresolved',
          'kind', v_ref_kind, 'id', v_ref_id)::text;
  end if;

  -- 0227 (#651, D8): THE WINDOW'S FLOOR, WRITTEN ONCE AND FROZEN. The first day of the SIGNING
  -- month in the BOOK's calendar -- never `now()` read in whatever zone the session carries.
  v_from := clara._fa_month_start(clara._fa_today());

  update clara.fa_depreciation_authorities set status = 'live', signed_by = c.actor,
    signed_at = now(), signed_op_key = p_op_key,
    authority_ref = p_authority_ref, authority_from = v_from
    where id = p_authority;
  perform clara._audit(c.firm, c.actor, null, null, 'sign_depreciation_authority', null,
    jsonb_build_object('client', p_client, 'authority', p_authority, 'op_key', p_op_key,
      'authority_ref', p_authority_ref, 'authority_from', v_from));
  return clara._finish_op(c.firm, 'sign_depreciation_authority', p_op_key,
    jsonb_build_object('authority_id', p_authority, 'client_id', p_client, 'status', 'live',
      'cadence', au.cadence, 'authority_ref', p_authority_ref, 'authority_from', v_from));
end $$;
comment on function clara.sign_depreciation_authority(uuid,uuid,text,jsonb) is
  '#651: sign a proposed depreciation authority. ADMIN+ (WD-R9). p_authority_ref is REQUIRED and '
  'RESOLVED against clara.accounting_work / clara.agent_tasks in the same firm AND client; '
  'authority_from is stamped as the first day of the signing month in Asia/Kuala_Lumpur and never '
  'moves again. Replaces the three-argument door (0041:3316) -- one pg_proc row, no overload.';

-- =====================================================================================
-- §G  THE PREVIEW READ (AC5) AND THE OBO RUN DOOR (AC5, the successor contract's door).
-- =====================================================================================

-- THE PREVIEW IS `stable`, WHICH IS THE POINT: the language itself refuses to let it write. It
-- reserves no op key, mints no receipt and touches no ledger. It asks the ungranted oracle CORE
-- rather than the granted `depreciation_run_due` wrapper, because that wrapper's
-- `_assert_due_read_ctx` admission is a CALLER question this body has already answered at its own
-- viewer floor; the ANSWER is the same body either way.
--
-- THE LEG AGGREGATION IS DUPLICATED, NOT EXTRACTED — the same ruling SYNTHESIS J3 gives #657 for
-- the twinned candidate projection: re-plumbing the poster's aggregation inside a 0042 splice is
-- the riskiest edit available for a cosmetic gain. It is bound TWO ways: §I (T.13) asserts the
-- normalized fragment occurs in BOTH bodies, and `p651.preview.matches_run` asserts the two agree
-- behaviourally. Named as a residual with a follow-up.
create function clara.preview_depreciation_run(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; au record; v_due jsonb; v_res jsonb; v_legs jsonb := '[]'::jsonb;
        v_mode text; v_ramp boolean; r record;
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
  -- LEGS AGGREGATED PER (expense, accumulated) PAIR -- the poster's own aggregation, duplicated
  -- verbatim so the preview can never show a different pairing from the entry the run will write.
  for r in select f.depr_expense_account_code as exp_code, f.accum_depr_account_code as acc_code,
                  sum((x ->> 'amount_cents')::bigint) as amt
           from jsonb_array_elements(v_res -> 'charges') x
           join clara.fixed_assets f on f.id = (x ->> 'asset_id')::uuid
           group by 1, 2 order by 1, 2 loop
    v_legs := v_legs || jsonb_build_array(
      jsonb_build_object('account_code', r.exp_code, 'debit_cents', r.amt, 'credit_cents', 0),
      jsonb_build_object('account_code', r.acc_code, 'debit_cents', 0, 'credit_cents', r.amt));
  end loop;
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
  'clara._fa_compute_charges stays UNGRANTED: this wrapper is the only way a browser reaches it.';

-- THE OBO RUN DOOR. `clara_runtime` ONLY, and a NEW NAME is MANDATORY rather than stylistic:
-- rig-meta.mjs:691-693 is an executable census whose own words are that
-- `clara.run_depreciation_manual` "must NEVER reach a machine role, or the maker-checker ladder
-- would have a bypass". The live-authority ladder is `complete_fixed_asset_particulars_for`'s
-- (0216:761-812) VERBATIM, including the measured lock pair -- the firm row `for key share` first
-- (weakest mode, same lock ORDER as the posting core) then the membership `for share` -- without
-- which a demotion committing between the read and the write slips past a check whose whole
-- purpose is to be current.
--
-- IT DELEGATES AND NEVER INSERTS. The `origin='scheduled_run'` writer set is deepEqual-pinned to
-- three names at x41b2-surface.test.mjs:132-138 and x42b2-r8-tails.test.mjs:174-180; this door
-- calls `clara._fa_run_period_core` and writes no entry of its own.
--
-- IT IS FLOORED AND CARRIES NO BYPASS. Its four arguments hold no floor override, so Clara cannot
-- reach a pre-`authority_from` period through it at all; the human door
-- `clara.run_depreciation_manual` is the catch-up, and the runtime module's sentence map says so.
create function clara.run_depreciation_period_for(p_client uuid, p_through date, p_op_key text,
    p_obo uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_role text; v_status text; v_client_status text;
        v_dedupe jsonb; v_through date; v_due jsonb; v_result jsonb;
        v_ran jsonb := '[]'::jsonb; v_guard int := 0;
begin
  if p_obo is null then
    raise exception 'the human this operation acts for is required' using errcode = 'CLR04',
      detail = '{"reason":"obo_not_active"}';
  end if;
  select cl.firm_id, cl.status into v_firm, v_client_status
    from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11',
      detail = '{"reason":"client_not_found"}';
  end if;
  perform 1 from clara.firms f where f.id = v_firm for key share;
  select m.role, m.status into v_role, v_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
     for share;
  if v_role is null or v_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode = 'CLR04',
      detail = jsonb_build_object('reason', 'obo_not_active', 'obo', p_obo)::text;
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode = 'CLR04',
        detail = jsonb_build_object('reason', 'insufficient_role', 'obo', p_obo)::text;
  end if;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active' using errcode = 'CLR10',
      detail = '{"reason":"client_inactive"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(v_firm, 'run_depreciation_period_for', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'through', p_through, 'obo', p_obo)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_through := coalesce(p_through, clara._fa_today());

  -- THE PERIODS ARE THE ORACLE'S OWN ARITHMETIC, never this body's -- the same law
  -- `_agent_depreciation_catchup_core` (0138:2386-2404) states for the agent lane, applied here.
  -- The finite guard is the belt's own posture: at most twelve periods clear per call, so a
  -- mis-answering oracle cannot spin this loop forever.
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 12;
    v_due := clara._depreciation_run_due_core(p_client, v_firm);
    exit when v_due is null or jsonb_typeof(v_due) <> 'object'
      or not coalesce((v_due ->> 'due')::boolean, false)
      or (v_due ->> 'period_end') is null
      or (v_due ->> 'period_end')::date > v_through;
    v_result := clara._fa_run_period_core(p_client, (v_due ->> 'period_start')::date,
      (v_due ->> 'period_end')::date,
      p_op_key || ':' || (v_due ->> 'period_end'), p_obo, v_firm, 'run_depreciation_period_for');
    v_ran := v_ran || jsonb_build_array(jsonb_build_object(
      'period_start', v_due ->> 'period_start', 'period_end', v_due ->> 'period_end',
      'result', v_result));
    exit when (v_result ->> 'status') = 'noop';
  end loop;

  perform clara._audit(v_firm, p_obo, null, null, 'run_depreciation_period_for', null,
    jsonb_build_object('client', p_client, 'through', v_through, 'op_key', p_op_key,
      'periods_run', jsonb_array_length(v_ran)));
  return clara._finish_op(v_firm, 'run_depreciation_period_for', p_op_key,
    jsonb_build_object('client_id', p_client, 'through', v_through,
      'periods_run', jsonb_array_length(v_ran), 'periods', v_ran,
      'still_due', clara._depreciation_run_due_core(p_client, v_firm)));
end $$;
revoke all on function clara.run_depreciation_period_for(uuid,date,text,uuid) from public;
comment on function clara.run_depreciation_period_for(uuid,date,text,uuid) is
  '#651: clear every DUE depreciation period from the authority floor forward, up to p_through, ON '
  'BEHALF OF a named human whose authority is RE-READ LIVE (active membership of the client''s '
  'firm, the bookkeeper floor, an active client). clara_runtime ONLY -- the browser uses '
  'clara.run_depreciation_manual, which must never reach a machine role. It DELEGATES to '
  'clara._fa_run_period_core and inserts nothing itself, and it carries NO floor bypass.';

-- =====================================================================================
-- §H  THE DETAIL READ (AC4). `_fa_asset_json` gains exactly two keys; `get_fixed_asset` does not
--     move -- it merely composes, and its birth-key census at 0216:993 stays true.
--
--     NOTE FOR EVERY FUTURE FILE: `_fa_asset_json` was pinned by 0216:205-219 at its 0041 text.
--     After this file, a pin must use THIS file's post-image. §I (T.14) records it.
-- =====================================================================================

do $p651_assetjson$
declare v_sig text := 'clara._fa_asset_json(uuid,date)';
        v_def text; v_frm text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_frm := $f$    'acquisition_document_id', v_doc);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '#651 §H: the _fa_asset_json projection tail appears % time(s)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    'acquisition_document_id', v_doc,
    -- 0227 (#651): THE CHANGE CLASSIFICATION, on every generation this body projects. `lineage`
    -- walks one of these per ancestor, so a revision timeline reads WHY each generation exists
    -- without a second query -- which is the whole of AC4's "separates ... policy-effective
    -- revision". NULL on a root row and on every revision minted before 0227, and the surface
    -- says "not recorded" rather than inventing a class.
    'change_class', f.change_class,
    'change_reason', f.change_reason);$t$);
  execute v_def;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position($m$'change_class', f.change_class$m$ in v_def) = 0
     or position('uncharged_due' in v_def) = 0
     or position('split_month_advisory' in v_def) = 0
     or position('acquisition_document_id' in v_def) = 0 then
    raise exception '#651 §H postcheck: the _fa_asset_json splice damaged the projection'
      using errcode='CLR10';
  end if;
end $p651_assetjson$;

-- =====================================================================================
-- §I  GRANTS. Everything new is revoked from public; the three application-facing names get
--     exactly the lane they belong to; every new or recut body is owned by clara_fn_owner.
--
--     `clara._fa_compute_charges` is NOT granted — I6/Q6: the wrapper is granted, never the core,
--     and rig-meta.mjs:712/:725 fails the main sweep if a grant ever appears on it.
-- =====================================================================================

do $p651_acl$ declare f text; begin
  execute 'revoke all on function clara.preview_depreciation_run(uuid) from public';
  execute 'grant execute on function clara.preview_depreciation_run(uuid) to clara_authenticated';
  execute 'alter function clara.preview_depreciation_run(uuid) owner to clara_fn_owner';

  execute 'revoke all on function clara.run_depreciation_period_for(uuid,date,text,uuid) from public';
  execute 'grant execute on function clara.run_depreciation_period_for(uuid,date,text,uuid) to clara_runtime';
  execute 'alter function clara.run_depreciation_period_for(uuid,date,text,uuid) owner to clara_fn_owner';

  -- THE DROP + CREATE KILLED THE OLD ARITY'S GRANT (the 0018:188 scar). Re-state it here.
  execute 'revoke all on function clara.sign_depreciation_authority(uuid,uuid,text,jsonb) from public';
  execute 'grant execute on function clara.sign_depreciation_authority(uuid,uuid,text,jsonb) to clara_authenticated';
  execute 'alter function clara.sign_depreciation_authority(uuid,uuid,text,jsonb) owner to clara_fn_owner';

  foreach f in array array['clara._fa_assert_period_open(uuid,date)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;

  -- The recut bodies keep their existing ACLs (create or replace preserves them), but the owner is
  -- re-stated so it is a FACT of this file rather than an inheritance.
  foreach f in array array[
      'clara._fa_oldest_unmet_period(uuid)',
      'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)',
      'clara._fa_asset_json(uuid,date)',
      'clara._fa_validate_particulars(jsonb)',
      'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)',
      'clara._tf_fa_authority_transition()',
      'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
      'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)'] loop
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $p651_acl$;

reset role;

-- =====================================================================================
-- §J  TAIL CENSUS. Every claim this file made, re-READ from the committed catalog.
-- =====================================================================================
do $p651_tail$
declare v_n int; v_src text; v_names text[]; v_sig text; r record;
  -- The normalizer every fragment assertion below shares: comments out, whitespace collapsed,
  -- lower-cased. A fragment that survives it is a fragment two bodies really share.
  v_a text; v_b text;
begin
  -- (T.1) THE TWO COLUMN FAMILIES AND THEIR CHECKS.
  for v_sig in select unnest(array['change_class','change_reason']) loop
    select count(*)::int into v_n from information_schema.columns
     where table_schema='clara' and table_name='fixed_assets' and column_name=v_sig
       and data_type='text' and is_nullable='YES';
    if v_n <> 1 then
      raise exception '#651 tail: clara.fixed_assets.% is not a nullable text column', v_sig using errcode='CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.fixed_assets'::regclass and conname='ck_fixed_assets_change_class') then
    raise exception '#651 tail: ck_fixed_assets_change_class is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.fa_depreciation_authorities'::regclass
                    and conname='ck_fa_authorities_window') then
    raise exception '#651 tail: ck_fa_authorities_window is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.fa_depreciation_authorities
   where status in ('live','retired') and authority_from is null;
  if v_n <> 0 then
    raise exception '#651 tail: % signed authority row(s) still carry no window floor', v_n using errcode='CLR10';
  end if;

  -- (T.2) OWNER / SECURITY / SEARCH_PATH / ACL, re-proved byte-for-byte for every body this file
  -- installs or recuts.
  for r in select * from (values
      ('clara._fa_assert_period_open(uuid,date)', true, true, 'none'),
      ('clara.preview_depreciation_run(uuid)', true, true, 'clara_authenticated'),
      ('clara.run_depreciation_period_for(uuid,date,text,uuid)', true, false, 'clara_runtime'),
      ('clara.sign_depreciation_authority(uuid,uuid,text,jsonb)', true, false, 'clara_authenticated'),
      ('clara._fa_oldest_unmet_period(uuid)', true, true, 'none'),
      ('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)', true, false, 'none'),
      ('clara._fa_asset_json(uuid,date)', true, true, 'none'),
      ('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)', true, false, 'none'),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)', true, false, 'clara_authenticated'),
      ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)', true, false, 'clara_authenticated'),
      -- §B.3's recut. It is spliced off its own live body, so its 0041 grant and owner survive;
      -- this row is what PROVES that rather than assuming it (the 0018:188 scar in reverse).
      ('clara.retire_depreciation_authority(uuid,uuid,text,text)', true, false, 'clara_authenticated')
    ) as t(sig, definer, is_stable, lane) loop
    select p.prosecdef::text || '|' || p.provolatile::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
           || '|' || p.proowner::regrole::text
      into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if split_part(v_src, '|', 1) <> 'true' then
      raise exception '#651 tail: % is not SECURITY DEFINER', r.sig using errcode='CLR10';
    end if;
    if position('search_path=clara, pg_temp' in replace(split_part(v_src, '|', 3), ' ', ' ')) = 0 then
      raise exception '#651 tail: % does not pin search_path (got %)', r.sig, split_part(v_src, '|', 3)
        using errcode='CLR10';
    end if;
    if split_part(v_src, '|', 4) <> 'clara_fn_owner' then
      raise exception '#651 tail: % is not owned by clara_fn_owner', r.sig using errcode='CLR10';
    end if;
    if r.is_stable and split_part(v_src, '|', 2) <> 's' then
      raise exception '#651 tail: % is no longer STABLE', r.sig using errcode='CLR10';
    end if;
    if r.lane = 'none' then
      if has_function_privilege('clara_authenticated', r.sig::regprocedure, 'EXECUTE')
         or has_function_privilege('clara_runtime', r.sig::regprocedure, 'EXECUTE') then
        raise exception '#651 tail: the ungranted body % holds an application grant', r.sig using errcode='CLR10';
      end if;
    else
      if not has_function_privilege(r.lane, r.sig::regprocedure, 'EXECUTE') then
        raise exception '#651 tail: % is not executable by %', r.sig, r.lane using errcode='CLR10';
      end if;
    end if;
    if has_function_privilege('public', r.sig::regprocedure, 'EXECUTE') then
      raise exception '#651 tail: % is executable by PUBLIC', r.sig using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) THE PREVIEW IS GRANTED; ITS CORE IS NOT. I6/Q6, and rig-meta.mjs:712/:725's own law.
  for v_sig in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro']) loop
    if exists (select 1 from pg_roles where rolname = v_sig)
       and has_function_privilege(v_sig, 'clara._fa_compute_charges(uuid,date,date)'::regprocedure, 'EXECUTE') then
      raise exception '#651 tail: clara._fa_compute_charges holds an EXECUTE grant for %', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (T.4) `run_depreciation_manual` STILL HOLDS NO GRANT FOR ANY MACHINE ROLE. rig-meta.mjs:691-693
  -- is an executable census whose own words are that a machine grant here would be a maker-checker
  -- bypass; this file mints a NEW name precisely so that stays true.
  for v_sig in select unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive']) loop
    if exists (select 1 from pg_roles where rolname = v_sig)
       and has_function_privilege(v_sig, 'clara.run_depreciation_manual(uuid,date,date,text)'::regprocedure, 'EXECUTE') then
      raise exception '#651 tail: clara.run_depreciation_manual reached the machine role %', v_sig using errcode='CLR10';
    end if;
  end loop;
  -- …and the new OBO door is the mirror image: machine only, never a browser.
  if has_function_privilege('clara_authenticated',
       'clara.run_depreciation_period_for(uuid,date,text,uuid)'::regprocedure, 'EXECUTE') then
    raise exception '#651 tail: the OBO run door reached clara_authenticated' using errcode='CLR10';
  end if;

  -- (T.5) THE `_wdb_rerun_breach` CONSUMER SET IS STILL EXACTLY THE FOUR NAMES. Two live CI
  -- batteries deepEqual-pin it (x42b2-r7-s5-census.test.mjs:118-120, x42b2-period-class.test.mjs:162-167),
  -- and both of this file's splices land inside two of those four bodies.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p where p.pronamespace = 'clara'::regnamespace
      and p.proname <> '_wdb_rerun_breach'
      and p.prosrc like '%clara._wdb_rerun_breach(%';
  if v_names is distinct from array['_adj_oldest_unmet_period','_adj_run_occurrence_core',
                                    '_fa_oldest_unmet_period','_fa_run_period_core'] then
    raise exception '#651 tail: the re-run gate consumer set moved: %', v_names using errcode='CLR10';
  end if;

  -- (T.6) `_fa_run_period_core`'s CALLER SET IS NOW EXACTLY FOUR, NAMED. A tail written for three
  -- would pass while the new door sat outside the set -- risk 1, closed here.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p where p.pronamespace = 'clara'::regnamespace
      and p.proname <> '_fa_run_period_core'
      and p.prosrc like '%clara._fa_run_period_core(%';
  if v_names is distinct from array['_agent_depreciation_catchup_core','run_depreciation_manual',
                                    'run_depreciation_period','run_depreciation_period_for'] then
    raise exception '#651 tail: the poster caller set is not the four names: %', v_names using errcode='CLR10';
  end if;

  -- (T.7) THE `origin='scheduled_run'` WRITER SET IS STILL EXACTLY THREE. The new OBO door
  -- DELEGATES; it inserts nothing. Two batteries deepEqual-pin this too.
  -- COMMENTS STRIPPED FIRST, exactly as x41b2-surface.test.mjs:120-127 strips them: the RAW
  -- prosrc instrument reports `_pair_reverse_core` as a writer, and that is a FALSE POSITIVE the
  -- estate has already pinned AS one -- it names 'scheduled_run' only inside a comment and writes
  -- origin='reversal', because a pair correction is a HUMAN corrective act.
  select array_agg(x.n order by x.n) into v_names from (
    select p.proname as n, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as b
      from pg_proc p where p.pronamespace = 'clara'::regnamespace) x
   where x.b like '%insert into clara.journal_entries%' and x.b like '%scheduled_run%';
  if v_names is distinct from array['_adj_on_approve','_adj_run_occurrence_core','_fa_run_period_core'] then
    raise exception '#651 tail: the scheduled_run writer set moved: %', v_names using errcode='CLR10';
  end if;

  -- (T.8) NAME PURITY: every name this file installs or recuts resolves to EXACTLY ONE pg_proc
  -- row. `revise_fixed_asset_particulars` keeps its five-argument signature and gains no overload;
  -- `sign_depreciation_authority` has exactly one row after the DROP + CREATE. The estate holds
  -- only two such censuses (0103:1055-1070 and 0126:2129-2139) and NEITHER reaches these names,
  -- so this file writes its own.
  for r in select unnest(array['_fa_assert_period_open','preview_depreciation_run',
      'run_depreciation_period_for','sign_depreciation_authority','revise_fixed_asset_particulars',
      'complete_fixed_asset_particulars','_fa_complete_particulars_core','_fa_validate_particulars',
      '_fa_asset_json','_fa_oldest_unmet_period','_fa_run_period_core',
      '_tf_fa_authority_transition','retire_depreciation_authority']) as n loop
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace = 'clara'::regnamespace and p.proname = r.n;
    if v_n <> 1 then
      raise exception '#651 tail: clara.% resolves to % pg_proc row(s), expected exactly 1', r.n, v_n
        using errcode='CLR10';
    end if;
  end loop;
  if to_regprocedure('clara.sign_depreciation_authority(uuid,uuid,text)') is not null then
    raise exception '#651 tail: the three-argument sign door survived the DROP' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)') is null then
    raise exception '#651 tail: the five-argument revise door lost its signature' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_period_open(uuid,date)') is not null then
    raise exception '#651 tail: a second period predicate was minted -- the roster is ONE helper'
      using errcode='CLR10';
  end if;

  -- (T.9) `get_fixed_asset` IS UNMOVED. It merely composes; its birth-key census at 0216:993 stays
  -- true and this file must not have touched it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src
    from pg_proc p where p.oid = 'clara.get_fixed_asset(uuid)'::regprocedure;
  if v_src <> 'da9333ebdd3bcaeea916f31651dbf0e87378a525e8c19fd98035141f6fd8be5a' then
    raise exception '#651 tail: clara.get_fixed_asset MOVED (sha %) -- this file must not touch it', v_src
      using errcode='CLR10';
  end if;
  for r in select * from (values
      ('clara._fa_compute_charges(uuid,date,date)', 'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048'),
      ('clara._fa_asset_charges(uuid,date,boolean)', 'a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_src <> r.sha then
      raise exception '#651 tail: % MOVED (sha %) -- the arithmetic is NON-REGRESSION here', r.sig, v_src
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.10) THE `close_prep` WAKE SOURCE IS STILL DISABLED (0223:247-250's idiom, verbatim).
  if (select enabled from clara.wake_engine_sources where source_key = 'close_prep') is not false then
    raise exception '#651 tail: the close_prep wake source is no longer disabled' using errcode='CLR10';
  end if;

  -- (T.11) THE AUTHORITY TRANSITION TRIGGER IS ENABLED AGAIN, and its graph is untouched: only the
  -- write allowlist grew, by exactly the two sign-time columns.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.fa_depreciation_authorities'::regclass
                    and t.tgname = 't_fa_authorities_transition' and t.tgenabled = 'O') then
    raise exception '#651 tail: t_fa_authorities_transition is not enabled' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_fa_authority_transition()'::regprocedure;
  if position($m$'authority_ref','authority_from'$m$ in v_src) = 0
     or position($m$(old.status = 'proposed' and new.status in ('live', 'retired'))$m$ in v_src) = 0
     or position($m$(old.status = 'live' and new.status = 'retired')$m$ in v_src) = 0
     or position('authority_never_deleted' in v_src) = 0
     or position('authority_immutable' in v_src) = 0
     or position('authority_transition_illegal' in v_src) = 0 then
    raise exception '#651 tail: the authority transition graph moved' using errcode='CLR10';
  end if;
  -- …AND THE WRITE-ONCE WALL (§B.2) IS IN THE COMMITTED BODY, ahead of the transition raise. D8's
  -- "written once at sign time and frozen" is a trigger law here, not a convention two doors keep.
  if position('written once and never moved' in v_src) = 0
     or position($m$'column', 'authority_from'$m$ in v_src) = 0
     or position($m$'column', 'authority_ref'$m$ in v_src) = 0
     or position('written once and never moved' in v_src) > position('authority_transition_illegal' in v_src) then
    raise exception '#651 tail: the sign-time columns are not frozen by the trigger' using errcode='CLR10';
  end if;
  -- …AND THE RETIRE DOOR STAMPS A FLOOR (§B.3), so a NEVER-SIGNED authority can still be withdrawn
  -- without meeting ck_fa_authorities_window as a raw 23514.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.retire_depreciation_authority(uuid,uuid,text,text)'::regprocedure;
  if position('authority_from = coalesce(au.authority_from, clara._fa_month_start(clara._fa_today()))' in v_src) = 0
     or position('signed_at = coalesce(au.signed_at, now())' in v_src) = 0 then
    raise exception '#651 tail: retire_depreciation_authority does not stamp the window floor'
      using errcode='CLR10';
  end if;

  -- (T.12) THE WALL AND THE SKIP ASK THE SAME QUESTION. The fiscal-year selection fragment is
  -- normalized (comments out, whitespace collapsed, the two date/client tokens unified) and must
  -- occur in BOTH `_fa_assert_period_open` and the recut `_fa_oldest_unmet_period`. Without this
  -- the two can drift and the oracle starts advertising periods the door refuses.
  select lower(regexp_replace(regexp_replace(replace(replace(p.prosrc, 'p_date', '<d>'), 'v_pe', '<d>'),
           '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_a from pg_proc p where p.oid = 'clara._fa_assert_period_open(uuid,date)'::regprocedure;
  select lower(regexp_replace(regexp_replace(replace(replace(p.prosrc, 'p_date', '<d>'), 'v_pe', '<d>'),
           '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_b from pg_proc p where p.oid = 'clara._fa_oldest_unmet_period(uuid)'::regprocedure;
  v_src := 'from clara.fiscal_years fy where fy.client_id = p_client and <d> between fy.starts_on '
        || 'and fy.ends_on order by (fy.status in (''closing'',''closed'')) desc, fy.starts_on desc limit 1';
  if position(v_src in v_a) = 0 then
    raise exception '#651 tail: the fiscal-year selection is not in _fa_assert_period_open in its normalized form'
      using errcode='CLR10';
  end if;
  if position(v_src in v_b) = 0 then
    raise exception '#651 tail: the recut oracle does not ask the wall''s own fiscal-year question'
      using errcode='CLR10';
  end if;

  -- (T.13) THE LEG AGGREGATION IS THE SAME FRAGMENT IN BOTH BODIES. Named as a residual; bound
  -- here so the preview can never quietly pair legs differently from the entry the run writes.
  select lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_a from pg_proc p where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
  select lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
    into v_b from pg_proc p where p.oid = 'clara.preview_depreciation_run(uuid)'::regprocedure;
  v_src := 'from jsonb_array_elements(v_res -> ''charges'') x join clara.fixed_assets f on f.id = '
        || '(x ->> ''asset_id'')::uuid group by 1, 2 order by 1, 2';
  if position(v_src in v_a) = 0 or position(v_src in v_b) = 0 then
    raise exception '#651 tail: the leg-aggregation fragment does not occur in BOTH the poster and the preview'
      using errcode='CLR10';
  end if;

  -- (T.14) BOTH FA COHORTS STILL RESOLVE WHOLE. A cohort that half-exists is what
  -- `cohortFailures()` is built to catch; asserting it here means a from-scratch replay says so at
  -- APPLY time rather than at test time. (The rosters themselves live in rig-meta.mjs.)
  for r in select unnest(array[
      '_fa_on_approve','_fa_run_period_core','_fa_compute_charges','_fa_asset_charges','_fa_asset_json',
      '_fa_validate_particulars','_fa_oldest_unmet_period','run_depreciation_period','run_depreciation_manual',
      'depreciation_run_due','sign_depreciation_authority','revise_fixed_asset_particulars',
      'complete_fixed_asset_particulars','get_fixed_asset','list_depreciation_runs',
      '_tf_fa_acquisition_birth','_fa_acquisition_json','_fa_acquisition_history',
      '_fa_complete_particulars_core','complete_fixed_asset_particulars_for']) as n loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'clara'::regnamespace and p.proname = r.n) then
      raise exception '#651 tail: FA cohort member clara.% is absent', r.n using errcode='CLR10';
    end if;
  end loop;

  raise notice '#651 tail: the classification columns and their CHECK are in place; the authority window is backfilled and CHECKed; the period wall and the oracle skip ask the same fiscal-year question; the poster''s callers are exactly four; the scheduled_run writers are still three; the re-run gate consumers are still four; get_fixed_asset, _fa_compute_charges and _fa_asset_charges are unmoved; run_depreciation_manual holds no machine grant; _fa_compute_charges holds no application grant; the authority transition trigger is enabled with its graph intact; and close_prep is still disabled.';
end
$p651_tail$;
