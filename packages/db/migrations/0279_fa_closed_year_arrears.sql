-- 0279_fa_closed_year_arrears — #975 (riders wave 3, lane 04): A DEPRECIATION RUN STOPS AND ASKS
-- BEFORE IT FOLDS A CLOSING OR CLOSED FISCAL YEAR'S MONTHS INTO THE NEXT OPEN PERIOD, AND THE
-- ACCOUNTANT'S ANSWER IS RECORDED AGAINST THAT CLIENT, YEAR AND RUN.
-- =====================================================================================
-- Spec of record: issue #975 and its owner ruling of 2026-09-20 — "Clara asks the accountant
-- once when a run's arrears belong to a closed fiscal year: she states the amount and the year,
-- then offers two resolutions, fold into the current year as immaterial, or reopen the prior
-- year and charge it there as a restatement." The ruling is neither option the ticket offered:
-- (A) would have ratified today's silent arrears-by-construction as the lane's permanent
-- treatment and (B) would have moved the charge forward. Under IAS 8 a MATERIAL prior-period
-- error is restated in the prior year and only an IMMATERIAL one is folded into the current
-- year, so the treatment turns on MATERIALITY — a professional judgement Clara may not default.
--
-- Builds on 0041 (the register, its depreciation arithmetic and both run doors), 0056 (the close
-- model and its period walls), 0227/#651 (the locked-period wall at the running door, the due
-- oracle's closed-period skip and its `skipped_closed` report) and 0277/#932 (this lane's own
-- prior ticket, whose prestate/pin/cohort idioms this file follows).
--
-- =====================================================================================
-- FOUR THINGS A LATER READER MUST NOT MIS-READ.
--
-- (1) THIS FILE DOES NOT CORRECT 0227'S OWN COMMENT, AND THAT IS THE RULING, NOT AN OVERSIGHT.
--     0227's live text calls arrears "the ordinary accounting treatment of an omitted charge".
--     The owner ruled on 2026-09-20 that the sentence overstates the standard and that the
--     correction belongs in `CONTEXT.md`, NEVER in the applied migration file — an applied
--     migration's bytes are immutable (packages/db/README.md). `CONTEXT.md`'s
--     "Closed-year arrears resolution" term carries the corrected statement.
--
-- (2) THE LOCKED-PERIOD REFUSAL IS UNCHANGED, AND SO IS THE SKIPPED-CLOSED REPORT'S OWN SHAPE.
--     `clara._fa_assert_period_open` is pinned NON-REGRESSION in the prestate and re-read in the
--     tail: a run DATED into a closing/closed year still dies on 0227's CLR38 `period_closed`
--     axis, before this file's question is ever reached. What this file adds is the NEXT
--     question — what happens to the months INSIDE that year which the next OPEN period's charge
--     would fold forward. `skipped_closed`'s own entries keep every key #651 gave them; the
--     arrears figure rides BESIDE them under a new key, so a reader pinning `skipped_closed`
--     sees no movement.
--
-- (3) THE ARREARS FIGURE IS THE ESTATE'S OWN ARITHMETIC, ASKED TWICE — never a second
--     implementation of it. `clara._fa_closed_arrears` computes a closed year's share as
--     charged(through the year's end) − charged(through the day before it opened), where
--     charged(X) is `clara._fa_compute_charges(client, X, X) ->> 'charged_cents'`. That is
--     exact because `clara._fa_compute_charges` passes ONLY its period END to
--     `clara._fa_asset_charges` (the start is echoed, never read), so charged(X) is a prefix sum
--     over the same forward month walk the poster runs. Both bodies are pinned UNMOVED here.
--
-- (4) NOTHING IS SWITCHED OFF. The human door still runs every lawful period; the belt still
--     sweeps; `clara.reopen_fiscal_year` is untouched and is the destination of the restatement
--     choice. A run that folds nothing behaves byte-for-byte as it did before this file, and a
--     run that folds something is stopped by a QUESTION, never by a disabled door.
--
-- =====================================================================================
-- THE ONE MEASUREMENT THAT SHAPED THE FIGURE (taken on clara_l04 before this file was written).
-- `clara._fa_asset_charges` emits contiguous CHARGE BLOCKS, and a block is closed at a fiscal-
-- year boundary only on the REDUCING-BALANCE arm (its own comment: "A CHARGE BLOCK NEVER
-- STRADDLES AN FY BOUNDARY"). A straight-line block may therefore span the boundary, so a
-- closed year's share can NOT be read off the blocks by classifying each block's period_start —
-- the apportionment would be a guess. The prefix-difference above needs no apportionment at all,
-- which is why it is the shape this file ships.
-- =====================================================================================

do $p975_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false;
  -- The live pre-image of the body this file recuts, measured off pg_proc.prosrc on the lane-04
  -- rig (clara_l04, PG 17, chain 0001..0278 — 0277 and 0278 are this lane's own prior tickets)
  -- moments before this file was written, never transcribed from an earlier migration's header.
  c_run_core_pre constant text :=
    'b22776bd955c3c3c6fafcc5a349b5367c49ae061ec3a5a5f596af4b4bf941605';
  -- The due oracle (0227's own recut) and the preview (0248's), the two bodies that carry the
  -- arrears figure to the surface. Both measured on the same rig at the same moment.
  c_due_oracle_pre constant text :=
    '234e5c4c71ce2e20739bd2f197726c1cdab8b7cf90b1cb78766d30673c9dda1c';
  c_preview_pre constant text :=
    'f76126612c9cba1a3aee42ec9ca4e3a6b287883ed921a4ffdd2383cb5a32fcf7';
begin
  if to_regclass('clara.fixed_assets') is null or to_regclass('clara.fiscal_years') is null then
    raise exception '#975 prestate: the fixed-asset register or the close model is absent -- 0041 and 0056 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)') is null then
    raise exception '#975 prestate: clara._fa_run_period_core is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_assert_period_open(uuid,date)') is null then
    raise exception '#975 prestate: clara._fa_assert_period_open is absent -- 0227 must apply first'
      using errcode='CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied, unmerged
  -- migration after an edit.) Every DDL section below is redo-safe by construction
  -- (`create table if not exists`, `create index if not exists`, `drop policy if exists` +
  -- `create policy`, `create or replace function`, `create or replace trigger`), so only the
  -- RECUT body's pre-image pin needs a redo branch: on a redo its live text is already THIS
  -- file's own prior effect. The signal is the one name only a live apply of THIS file creates.
  if to_regprocedure('clara._fa_closed_arrears(uuid,date)') is not null then
    v_redo := true;
    raise notice '#975 prestate: clara._fa_closed_arrears already exists -- treating this as a #957 REDO of 0279 itself. Every DDL section below is redo-safe by construction; the tail re-proves the whole post-state from scratch.';
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc,
  -- moments before this file was written. The RECUT entry is skipped on a redo (its pre-image is
  -- then this file's OWN prior effect); §T re-reads the whole roster afterwards either way.
  for v_pin in select * from (values
      -- RECUT by this file (§C).
      ('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)', c_run_core_pre, 'recut'),
      ('clara._fa_oldest_unmet_period(uuid)', c_due_oracle_pre, 'recut'),
      ('clara.preview_depreciation_run(uuid)', c_preview_pre, 'recut'),
      -- NON-REGRESSION: the locked-period wall this file must not move (AC4), the two run doors
      -- whose bodies only delegate, the reopen path the restatement choice points at, and every
      -- arithmetic body the new helper leans on.
      ('clara._fa_assert_period_open(uuid,date)',
       '1409428decf47d69743ef6fcbddedebae88716dd5185514ed10614cc3e409de0', 'unmoved'),
      ('clara.run_depreciation_manual(uuid,date,date,text)',
       '5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8', 'unmoved'),
      ('clara.run_depreciation_period(uuid,date,date,text)',
       '8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921', 'unmoved'),
      ('clara.reopen_fiscal_year(uuid,text,jsonb,text,text)',
       '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5', 'unmoved'),
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048', 'unmoved'),
      ('clara._fa_asset_charges(uuid,date,boolean)',
       'a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849', 'unmoved'),
      ('clara.depreciation_run_due(uuid)',
       '2b9bc128803e48da5c9e30781fde26d3f0491327f20a8590c531f5c727dd065c', 'unmoved'),
      ('clara._depreciation_run_due_core(uuid,uuid)',
       '403aef624e74ff50427b50281aebaa02aa5e8a6957f4f2b171b3bd3141e4f279', 'unmoved'),
      ('clara._fa_depreciation_leg_pairing(jsonb)',
       '2b80a29f6e10766e4af6895ae85dd6e371c90eccc0383c52e377ee770ec07d76', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#975 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- ANCHOR: the fiscal-year lifecycle this file reads is still the four-state one 0056 shipped,
  -- so "closing or closed" really is the whole set a charge may not enter and `reopened` really
  -- is the state the restatement choice unblocks. Measured off the CHECK's own rendering.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.fiscal_years'::regclass
                    and pg_get_constraintdef(c.oid) like '%status%'
                    and pg_get_constraintdef(c.oid) like '%''open''%'
                    and pg_get_constraintdef(c.oid) like '%''closing''%'
                    and pg_get_constraintdef(c.oid) like '%''closed''%'
                    and pg_get_constraintdef(c.oid) like '%''reopened''%') then
    raise exception '#975 prestate: clara.fiscal_years no longer constrains status to the open/closing/closed/reopened ladder this file reads'
      using errcode='CLR10';
  end if;

  raise notice '#975 prestate: clean -- the register and the close model exist; clara._fa_run_period_core is at its measured pre-image (or, on a redo, this file''s own prior effect); the locked-period wall, both run doors, the reopen path and the four arithmetic/oracle bodies the new helper leans on match what was measured moments before this file was written; and the fiscal-year status ladder still reads open/closing/closed/reopened.';
end
$p975_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A THE RECORD. One live resolution per (client, fiscal year), append-only: a change of mind
--    SUPERSEDES the live row and mints a fresh one, so "what did we decide, when, and who
--    decided it" stays a historical fact rather than a mutated column. `create table if not
--    exists` — every constraint lives INSIDE the statement, so one guarded DDL covers the whole
--    shape atomically and is safe over a redo's own prior effect (packages/db/README.md,
--    "Redo-safe by construction").
-- =====================================================================================
create table if not exists clara.fa_arrears_resolutions (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null,
  client_id      uuid        not null,
  fiscal_year_id uuid        not null,
  -- THE AMOUNT THE PERSON ACTUALLY JUDGED. A materiality judgement is made ABOUT a figure, so
  -- the figure is stored beside it: a reader a year later can tell whether the number that was
  -- weighed is the number that was charged.
  arrears_cents  bigint      not null,
  choice         text        not null,
  -- The RUN the question was asked for (AC2's "against that client, fiscal year and run").
  period_start   date,
  period_end     date,
  reason         text,
  active         boolean     not null default true,
  decided_by     uuid        not null references clara.users(id),
  decided_at     timestamptz not null default now(),
  superseded_by  uuid        references clara.users(id),
  superseded_at  timestamptz,
  constraint fk_faar_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- TENANT CONGRUENCE, DECLARATIVELY: a resolution can never name a fiscal year from another
  -- firm. (The CLIENT congruence is the door's own check — clara.fiscal_years carries no
  -- (id, client_id) unique to hang a second composite FK on.)
  constraint fk_faar_fy foreign key (fiscal_year_id, firm_id)
    references clara.fiscal_years(id, firm_id),
  constraint ck_faar_choice check (choice in ('fold_current', 'reopen_prior')),
  constraint ck_faar_arrears_positive check (arrears_cents > 0),
  constraint ck_faar_superseded check (
    (active and superseded_by is null and superseded_at is null)
    or (not active and superseded_by is not null and superseded_at is not null))
);
-- ONE LIVE ANSWER PER (client, fiscal year), ever — the shape AC2's "a later run honours the
-- record instead of asking again" rests on, and the same partial-unique idiom
-- `uq_fa_account_profiles_active` (0041) and `uq_fadp_active` (0277) use.
create unique index if not exists uq_faar_active
  on clara.fa_arrears_resolutions (client_id, fiscal_year_id) where active;
create index if not exists ix_faar_client
  on clara.fa_arrears_resolutions (client_id, active);

create or replace function clara._tf_faar_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'a closed-year arrears resolution is superseded, never deleted (record_fa_arrears_resolution)'
    using errcode = 'CLR37',
      detail = jsonb_build_object('reason', 'fa_arrears_resolution_never_deleted', 'resolution_id', old.id)::text;
end $$;
revoke all on function clara._tf_faar_no_delete() from public;
create or replace trigger t_faar_no_delete before delete on clara.fa_arrears_resolutions
  for each row execute function clara._tf_faar_no_delete();
create or replace trigger t_faar_no_truncate before truncate
  on clara.fa_arrears_resolutions for each statement execute function clara._tf_no_truncate();

alter table clara.fa_arrears_resolutions enable row level security;
alter table clara.fa_arrears_resolutions force row level security;
drop policy if exists p_faar_owner on clara.fa_arrears_resolutions;
create policy p_faar_owner on clara.fa_arrears_resolutions
  for all to clara_fn_owner using (true) with check (true);
-- THE SAME READ SHAPE 0277's own relation takes: direct SELECT, firm-scoped by the JWT, so the
-- surface can show the accountant what was decided without a new read RPC.
drop policy if exists p_faar_human on clara.fa_arrears_resolutions;
create policy p_faar_human on clara.fa_arrears_resolutions
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fa_arrears_resolutions to clara_authenticated;

-- =====================================================================================
-- §B THE ARREARS HELPER. UNGRANTED (no role holds EXECUTE; both doors reach it through their
--    own DEFINER bodies). See header note (3) for why the figure is a prefix difference rather
--    than a classification of the charge blocks.
-- =====================================================================================
create or replace function clara._fa_closed_arrears(p_client uuid, p_through date)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  fy record; v_years jsonb := '[]'::jsonb; v_total bigint := 0;
  v_before bigint; v_after bigint; v_amt bigint; v_end date; v_res jsonb;
begin
  if p_client is null or p_through is null then
    return jsonb_build_object('arrears_cents', 0, 'fiscal_years', '[]'::jsonb);
  end if;
  for fy in select f.id, f.label, f.status, f.starts_on, f.ends_on
              from clara.fiscal_years f
             where f.client_id = p_client
               and f.status in ('closing', 'closed')
               and f.starts_on <= p_through
             order by f.starts_on loop
    v_end := least(fy.ends_on, p_through);
    -- charged(X) = what the WHOLE client's register would charge if a run ended at X. The
    -- difference over a year's span is that year's share of the arrears, exactly — no
    -- apportionment, because `clara._fa_compute_charges` reads only its period END.
    --
    -- THE YEAR'S END IS MEASURED FIRST, AND A ZERO ENDS THE YEAR THERE. charged() is monotone and
    -- never negative, so charged(end) = 0 forces charged(start-1) = 0 and the difference is 0 too:
    -- the second computation would only re-confirm it. That matters because this body now runs
    -- inside the belt's own due probe, and the STEADY state — a client with closed years and
    -- nothing uncharged in them — is exactly this branch. One computation per closed year there,
    -- two only where a question is really owed.
    v_after := coalesce((clara._fa_compute_charges(p_client, v_end, v_end)
                         ->> 'charged_cents')::bigint, 0);
    if v_after <= 0 then
      -- A closed year with nothing uncharged in it is not an arrears question at all, and
      -- listing it would make the question unreadable on a client with a long history.
      continue;
    end if;
    v_before := coalesce((clara._fa_compute_charges(p_client, fy.starts_on - 1, fy.starts_on - 1)
                          ->> 'charged_cents')::bigint, 0);
    v_amt := greatest(v_after - v_before, 0);
    if v_amt <= 0 then
      continue;
    end if;
    select jsonb_build_object('id', r.id, 'choice', r.choice,
             'arrears_cents', r.arrears_cents, 'decided_by', r.decided_by,
             'decided_at', r.decided_at, 'reason', r.reason)
      into v_res
      from clara.fa_arrears_resolutions r
     where r.client_id = p_client and r.fiscal_year_id = fy.id and r.active;
    v_years := v_years || jsonb_build_array(jsonb_build_object(
      'fiscal_year_id', fy.id, 'fy_label', fy.label, 'fy_status', fy.status,
      'fy_starts_on', fy.starts_on, 'fy_ends_on', fy.ends_on,
      'arrears_cents', v_amt, 'resolution', v_res));
    v_total := v_total + v_amt;
    v_res := null;
  end loop;
  return jsonb_build_object('arrears_cents', v_total, 'fiscal_years', v_years);
end $$;
revoke all on function clara._fa_closed_arrears(uuid,date) from public;
alter function clara._fa_closed_arrears(uuid,date) owner to clara_fn_owner;

-- =====================================================================================
-- §B2 THE DOOR THE ACCOUNTANT ANSWERS THROUGH. bookkeeper+, the SAME floor
--     `clara.run_depreciation_manual` takes — the person who may run the period is the person
--     who may judge its arrears. NO machine role reaches it (§D): materiality is a professional
--     judgement, and a lane carrying no JWT claims could not pass `clara._human_ctx` even if it
--     held the grant.
--
--     THE FIGURE IS RE-MEASURED AT RECORD TIME AND MUST STILL MATCH. A materiality judgement is
--     made ABOUT an amount; if the amount moved between the question and the answer (another
--     asset's particulars were completed, a charge was reversed), the judgement was made about a
--     figure that no longer exists, and recording it would put a stale ruling on the file. The
--     door refuses on its own axis and states both numbers so the person can look again.
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
-- §D BULK GRANT LOOP (the 0038:8056-8064 idiom, copied 0041:4404-4423 and 0277 §D): revoke from
--    public, grant to clara_authenticated only, re-assert clara_fn_owner ownership. Idempotent —
--    safe on a redo.
-- =====================================================================================
do $p975_racl$ declare f text; begin
  foreach f in array array[
      'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $p975_racl$;

-- =====================================================================================
-- §B3 clara._fa_oldest_unmet_period, RECUT. 0227's body, byte for byte, plus the arrears figure
--     beside its own `skipped_closed` report. Nothing about WHICH period is due moves: the
--     authority floor, the closed-period skip, the draft freeze and the re-run gate are all
--     untouched, and `skipped_closed`'s entries keep every key #651 gave them.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._fa_oldest_unmet_period(p_client uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare au record; v_today date; v_horizon date; v_first date; v_ps date; v_pe date;
        v_skipped_closed jsonb := '[]'::jsonb; v_guard int := 0;
        v_fy_id uuid; v_fy_label text; v_fy_status text;
        fa record; v_one date;
begin
  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status = 'live';
  if not found then
    return jsonb_build_object('due', false, 'reason', 'authority_not_live');
  end if;
  v_today := clara._fa_today();
  v_horizon := clara._fa_month_end(v_today);
  -- DRAFT-N BLOCKS N+1 [L2/round-2 fold 1]. The sweep never calls into a refusal it can
  -- predict, so the probe answers false rather than letting the verb raise.
  if exists (select 1 from clara.journal_entries je
             where je.client_id = p_client and je.status = 'draft'
               and je.flags ? 'depreciation_charges') then
    return jsonb_build_object('due', false, 'reason', 'period_draft_outstanding');
  end if;
  -- 0042 (as-built ladder round 6): THE ONE RE-RUN ADMISSION QUESTION, ASKED OF THIS CLIENT'S
  -- OWN CHARGE ROWS. A charge whose unwind carries a different effective_date left the month it
  -- charged still holding money while flipping the coverage probe below to "uncovered" -- so
  -- this body would report the month due and the poster would charge it a second time, over a
  -- figure that never left. Measured before the fix at exactly double, unattended, with the
  -- register tie certifying zero difference. The horizon is the widest month this walk can
  -- reach, so the gate sees every row a proposal out of here could cause to be re-charged.
  -- Reasoning, and the identical question the adjustment lane asks: clara._wdb_rerun_breach.
  if clara._wdb_rerun_breach(p_client, 'depreciation_charges', null::text[],
                             v_horizon, v_horizon) is not null then
    return jsonb_build_object('due', false, 'reason', 'period_correction_unsound');
  end if;
  -- THE ONE ORACLE (S2.2b): due-ness is what the ARITHMETIC emits, over exactly the status
  -- scope the computation charges [round-3 fold F3]. Every filter the earlier form spelled out
  -- here -- method, completeness, the money clock, the supersede bound, the disposal month --
  -- now lives inside clara._fa_asset_charges, which is the only place it can never drift from
  -- what actually posts. The outstanding-disposal-draft freeze stays here because it is a
  -- CLIENT-scope sequencing fact, not part of an asset's schedule.
  -- THE SHRINKING HORIZON [round-3.5 fold G6, cheap win]. Only the EARLIEST due month matters,
  -- so once a candidate is in hand every later asset is asked a strictly smaller question: bound
  -- it at the day before the current minimum and the arithmetic stops at that month instead of
  -- projecting the whole horizon. Semantically identical (the answer is still min over assets);
  -- measurably cheaper on a client with many assets, which is the sweep's hot loop.
  for fa in select f.id as id from clara.fixed_assets f
            where f.client_id = p_client and f.status in ('active', 'superseded')
            order by f.acquired_date, f.id loop
    if clara._fa_disposal_draft_outstanding(p_client, fa.id, v_horizon) then
      continue;
    end if;
    v_one := clara._fa_first_due_month(fa.id,
               case when v_first is null then v_horizon else v_first - 1 end);
    if v_one is not null then v_first := v_one; end if;
  end loop;
  if v_first is null then
    return jsonb_build_object('due', false, 'reason', 'nothing_due');
  end if;
  -- 0227 (#651, D8 + D9): THE AUTHORITY FLOOR AND THE CLOSED-PERIOD SKIP, IN ONE WALK.
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
        'skipped_closed', v_skipped_closed,
        'closed_arrears', clara._fa_closed_arrears(p_client, coalesce(v_pe, v_first)));
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
        'skipped_closed', v_skipped_closed,
        'closed_arrears', clara._fa_closed_arrears(p_client, v_pe));
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
  -- #975 (0279): THE REPORT GAINS THE ARREARS IT WOULD OTHERWISE FOLD FORWARD, and
  -- `skipped_closed` itself does not move a byte -- the figure rides BESIDE it, so the question
  -- can be asked before anything posts (the ticket's first key interface). It is measured at the
  -- OPEN period's end, which is exactly the through-date the run will use, so the surface and the
  -- poster can never state two different numbers about the same fold. It is reported even when
  -- nothing was skipped: a closed year can carry arrears with no period skipped at all (an asset
  -- whose particulars were completed after that year closed), and the run stops for those too.
  return jsonb_build_object('due', true, 'period_start', v_ps, 'period_end', v_pe,
    'cadence', au.cadence, 'skipped_closed', v_skipped_closed,
    'closed_arrears', clara._fa_closed_arrears(p_client, v_pe));
end $function$


;

-- =====================================================================================
-- §B4 clara.preview_depreciation_run, RECUT. 0248's body, byte for byte, plus the ONE key that
--     carries the oracle's arrears report to the surface. The preview still writes nothing.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara.preview_depreciation_run(p_client uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
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
      -- #975 (0279): the oracle's own arrears report, passed through unchanged. `coalesce` keeps
      -- the key present and EMPTY on every answer that carries none, so a reader never has to
      -- tell "no arrears" from "this build does not say".
      'closed_arrears', coalesce(v_due -> 'closed_arrears',
        jsonb_build_object('arrears_cents', 0, 'fiscal_years', '[]'::jsonb)),
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
    'closed_arrears', coalesce(v_due -> 'closed_arrears',
      jsonb_build_object('arrears_cents', 0, 'fiscal_years', '[]'::jsonb)),
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
end $function$


;

-- =====================================================================================
-- §C clara._fa_run_period_core, RECUT. The body 0041 shipped and 0042/0227/0248 have each
--    spliced, byte for byte, PLUS the closed-year arrears question between 0227's locked-period
--    wall and the first write. Nothing above the wall moves; nothing below it moves except the
--    two places the receipt and the audit row now name the ruling a fold proceeded under.
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
    -- The years this charge would fold forward, split by whether a person has answered for
    -- them: v_unresolved has no live resolution at all; v_awaiting chose the restatement and is
    -- waiting for its year to be reopened. Either one stops the run.
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_unresolved
      from jsonb_array_elements(v_arr -> 'fiscal_years') y
     where coalesce(jsonb_typeof(y -> 'resolution'), 'null') = 'null';
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_awaiting
      from jsonb_array_elements(v_arr -> 'fiscal_years') y
     where y -> 'resolution' ->> 'choice' = 'reopen_prior';
    if jsonb_array_length(v_unresolved) > 0 then
      if p_verb = 'run_depreciation_manual' then
        raise exception 'this run would charge % sen belonging to fiscal year % (%), which is %. Under IAS 8 that is folded into the current period only when it is IMMATERIAL; a MATERIAL prior-period error is restated in that year instead. Materiality is your judgement, never Clara''s: record it with clara.record_fa_arrears_resolution -- fold_current, or reopen_prior and reopen the year through clara.reopen_fiscal_year.',
          (v_arr ->> 'arrears_cents')::bigint,
          v_unresolved -> 0 ->> 'fy_label', v_unresolved -> 0 ->> 'fiscal_year_id',
          v_unresolved -> 0 ->> 'fy_status'
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'arrears_resolution_required',
              'axis', 'closed_year_arrears',
              'arrears_cents', (v_arr ->> 'arrears_cents')::bigint,
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
          'arrears_cents', (v_arr ->> 'arrears_cents')::bigint,
          'fiscal_years', v_unresolved,
          'resolutions', jsonb_build_array('fold_current', 'reopen_prior'),
          'chosen', null, 'remedy', 'record_fa_arrears_resolution'));
    end if;
    if jsonb_array_length(v_awaiting) > 0 then
      if p_verb = 'run_depreciation_manual' then
        raise exception 'fiscal year % (%) was judged MATERIAL and is to be restated in that year rather than folded into this period. Reopen it through clara.reopen_fiscal_year and charge it there; this run carries % sen that belong to it.',
          v_awaiting -> 0 ->> 'fy_label', v_awaiting -> 0 ->> 'fiscal_year_id',
          (v_arr ->> 'arrears_cents')::bigint
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'arrears_awaiting_reopen',
              'axis', 'closed_year_arrears',
              'arrears_cents', (v_arr ->> 'arrears_cents')::bigint,
              'fiscal_years', v_awaiting,
              'chosen', 'reopen_prior',
              'period_start', v_ps, 'period_end', v_pe,
              'remedy', 'reopen_fiscal_year')::text;
      end if;
      return clara._finish_op(p_firm, p_verb, p_op_key,
        jsonb_build_object('status', 'parked', 'reason', 'arrears_awaiting_reopen',
          'client_id', p_client, 'period_start', v_ps, 'period_end', v_pe,
          'arrears_cents', (v_arr ->> 'arrears_cents')::bigint,
          'fiscal_years', v_awaiting, 'chosen', 'reopen_prior',
          'remedy', 'reopen_fiscal_year'));
    end if;
    -- EVERY affected year was answered fold_current. The run proceeds exactly as it did before
    -- this file -- the charge rows keep their own months, the entry is dated in this open
    -- period, the closed year's reported figures do not move -- and the receipt now NAMES the
    -- ruling it proceeded under, so a reader a year later sees a JUDGED fold, not a silent one.
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
-- §T THE TAIL. Every assertion re-read from the CATALOG after the recut/creation.
-- =====================================================================================
do $p975_tail$
declare
  v_src text; v_n int; v_pin record; v_sha text; v_rls boolean; v_force boolean; v_priv text;
  v_role text;
begin
  -- T.1 THE RECORD: exists, RLS enabled+forced, exactly the two policies, SELECT and nothing
  -- else granted to clara_authenticated, one-live-per-year indexed.
  if to_regclass('clara.fa_arrears_resolutions') is null then
    raise exception '#975 tail T.1: clara.fa_arrears_resolutions does not exist' using errcode='CLR10';
  end if;
  select relrowsecurity, relforcerowsecurity into v_rls, v_force from pg_class
    where oid = 'clara.fa_arrears_resolutions'::regclass;
  if not v_rls or not v_force then
    raise exception '#975 tail T.1b: clara.fa_arrears_resolutions is not RLS enabled+forced' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policies
    where schemaname = 'clara' and tablename = 'fa_arrears_resolutions';
  if v_n <> 2 then
    raise exception '#975 tail T.1c: expected exactly 2 policies on clara.fa_arrears_resolutions, found %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int, min(privilege_type) into v_n, v_priv
    from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'fa_arrears_resolutions'
     and grantee = 'clara_authenticated';
  if v_n <> 1 or v_priv <> 'SELECT' then
    raise exception '#975 tail T.1d: clara_authenticated must hold exactly one grant (SELECT) on clara.fa_arrears_resolutions, found % (%)', v_n, v_priv
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'clara' and tablename = 'fa_arrears_resolutions'
                    and indexname = 'uq_faar_active') then
    raise exception '#975 tail T.1e: uq_faar_active is missing -- one live resolution per (client, fiscal year) is not enforced' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.fa_arrears_resolutions'::regclass and conname = 'fk_faar_fy') then
    raise exception '#975 tail T.1f: fk_faar_fy is missing -- a resolution could name another firm''s fiscal year' using errcode='CLR10';
  end if;

  -- T.2 THE HELPER IS AN INTERNAL: STABLE, definer-owned, search_path pinned, and NO role holds
  -- EXECUTE on it — not PUBLIC, not clara_authenticated, not clara_runtime. It is reached only
  -- from the DEFINER bodies of the doors that ask the question.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_closed_arrears(uuid,date)'::regprocedure
     and p.provolatile = 's' and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 tail T.2: clara._fa_closed_arrears is missing its stable/definer/owner/search_path shape' using errcode='CLR10';
  end if;
  foreach v_role in array array['public', 'clara_authenticated', 'clara_runtime'] loop
    if has_function_privilege(v_role, 'clara._fa_closed_arrears(uuid,date)'::regprocedure, 'EXECUTE') then
      raise exception '#975 tail T.2b: % holds EXECUTE on clara._fa_closed_arrears -- it is an ungranted internal', v_role
        using errcode='CLR10';
    end if;
  end loop;

  -- T.2c THE DOOR: SECURITY DEFINER, owned by clara_fn_owner, search_path pinned, PUBLIC holds
  -- no EXECUTE, clara_authenticated holds EXACTLY EXECUTE, and no machine role holds any.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 tail T.2c: clara.record_fa_arrears_resolution is missing its definer/owner/search_path shape' using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#975 tail T.2d: PUBLIC holds EXECUTE on clara.record_fa_arrears_resolution' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#975 tail T.2e: clara_authenticated does NOT hold EXECUTE on clara.record_fa_arrears_resolution' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara.record_fa_arrears_resolution(uuid,uuid,text,bigint,date,date,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#975 tail T.2f: clara_runtime holds EXECUTE on clara.record_fa_arrears_resolution -- materiality is a human judgement, no machine role' using errcode='CLR10';
  end if;

  -- T.3 THE RECUT RUN CORE carries the question exactly once, in BOTH of its renderings, and
  -- every section this file did NOT touch keeps a representative marker — so a recut that
  -- damaged an earlier arm fails HERE rather than only in a behavioural cell far from this file.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
  for v_pin in select * from (values
      -- the question itself
      ('clara._fa_closed_arrears(p_client, v_pe)', 1),
      ($$'arrears_resolution_required'$$, 2),
      ($$'arrears_awaiting_reopen'$$, 2),
      ($$p_verb = 'run_depreciation_manual'$$, 2),
      ($$'status', 'parked'$$, 2),
      ($$jsonb_build_array('fold_current', 'reopen_prior')$$, 2),
      ('arrears_folded', 3),
      -- NON-REGRESSION markers, one per arm this file must not have moved.
      ('perform clara._fa_assert_period_open(p_client, v_pe);', 1),
      ($$"reason":"authority_not_live"$$, 1),
      ($$'axis', 'not_cadence_aligned'$$, 1),
      ($$"reason":"period_draft_outstanding"$$, 1),
      ($$'reason', 'period_earlier_unmet'$$, 1),
      ($$'reason', 'period_correction_unsound'$$, 1),
      ($$'status', 'noop'$$, 1),
      ('clara._fa_depreciation_leg_pairing(v_res', 1),
      ('perform clara._assert_balanced(v_entry);', 1),
      ('clara._approve_entry_core(', 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#975 tail T.3: the recut clara._fa_run_period_core carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure
     and p.provolatile = 'v' and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 tail T.3b: clara._fa_run_period_core lost its volatile/definer/owner/search_path shape' using errcode='CLR10';
  end if;
  -- …and its CALLER SET is unchanged: 0227's own T.6 pins exactly four, and this file adds none.
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'clara' and p.prosrc like '%clara._fa_run_period_core(%'
     and p.proname <> '_fa_run_period_core';
  if v_n <> 4 then
    raise exception '#975 tail T.3c: clara._fa_run_period_core has % callers, expected the four 0227 pins (run_depreciation_period, run_depreciation_manual, _agent_depreciation_catchup_core, run_depreciation_period_for)', v_n
      using errcode='CLR10';
  end if;

  -- T.3d THE RECUT DUE ORACLE carries the arrears report on each of its three skipped-closed
  -- answers and NOTHING ELSE moved: #651's own skip, the authority floor, the draft freeze and
  -- the re-run gate each keep a marker here.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._fa_oldest_unmet_period(uuid)'::regprocedure;
  for v_pin in select * from (values
      ('clara._fa_closed_arrears(p_client,', 3),
      ($$'skipped_closed', v_skipped_closed$$, 3),
      ($$'reason', 'period_unreachable'$$, 1),
      ($$'reason', 'period_not_ended'$$, 1),
      ($$'reason', 'period_draft_outstanding'$$, 1),
      ($$'reason', 'period_correction_unsound'$$, 1),
      ($$'reason', 'nothing_due'$$, 1),
      ($$'reason', 'authority_not_live'$$, 1),
      ('au.authority_from is not null and v_ps < au.authority_from', 1),
      ($$v_fy_status not in ('open', 'reopened')$$, 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#975 tail T.3d: the recut clara._fa_oldest_unmet_period carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._fa_oldest_unmet_period(uuid)'::regprocedure
     and p.provolatile = 's' and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 tail T.3e: clara._fa_oldest_unmet_period lost its stable/definer/owner/search_path shape' using errcode='CLR10';
  end if;

  -- T.3f THE RECUT PREVIEW carries the key on BOTH of its returns and still writes nothing: its
  -- own not-due and due arms each keep their markers, and 0248's folded leg pairing is intact.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.preview_depreciation_run(uuid)'::regprocedure;
  for v_pin in select * from (values
      ($$'closed_arrears', coalesce(v_due -> 'closed_arrears'$$, 2),
      ($$'skipped_closed', coalesce(v_due -> 'skipped_closed'$$, 2),
      ('clara._fa_depreciation_leg_pairing(v_res', 1),
      ('clara._human_ctx(clara.role_rank(''viewer''))', 1),
      ($$'mode_would_be', v_mode$$, 1)) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#975 tail T.3f: the recut clara.preview_depreciation_run carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.preview_depreciation_run(uuid)'::regprocedure
     and p.provolatile = 's' and p.prosecdef and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#975 tail T.3g: clara.preview_depreciation_run lost its stable/definer/owner/search_path shape' using errcode='CLR10';
  end if;

  -- T.4 NON-REGRESSION, re-read: the locked-period wall, both run doors, the reopen path and
  -- the arithmetic/oracle bodies the helper leans on are byte-for-byte what the prestate
  -- measured. This file recuts exactly ONE body and mints exactly one relation and one internal.
  for v_pin in select * from (values
      ('clara._fa_assert_period_open(uuid,date)',
       '1409428decf47d69743ef6fcbddedebae88716dd5185514ed10614cc3e409de0'),
      ('clara.run_depreciation_manual(uuid,date,date,text)',
       '5272743305d59913abd3a72f83ce9e5f1e8e37e5a1add8dec7f37900789307c8'),
      ('clara.run_depreciation_period(uuid,date,date,text)',
       '8dd19b9c50fb49859646c07df178b2ef69032a35aecf692cacdf208ed298b921'),
      ('clara.reopen_fiscal_year(uuid,text,jsonb,text,text)',
       '3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5'),
      ('clara._fa_compute_charges(uuid,date,date)',
       'a6566557a258444c0511c6ed14bad033ce738c841e8ce54c50ce227ca152e048'),
      ('clara._fa_asset_charges(uuid,date,boolean)',
       'a0122346d1e54ed847eebc60288e52b95cb5199e3035920f2c833fd2743ab849'),
      ('clara.depreciation_run_due(uuid)',
       '2b9bc128803e48da5c9e30781fde26d3f0491327f20a8590c531f5c727dd065c'),
      ('clara._depreciation_run_due_core(uuid,uuid)',
       '403aef624e74ff50427b50281aebaa02aa5e8a6957f4f2b171b3bd3141e4f279'),
      ('clara._fa_depreciation_leg_pairing(jsonb)',
       '2b80a29f6e10766e4af6895ae85dd6e371c90eccc0383c52e377ee770ec07d76')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#975 tail T.4: % MOVED (measured %, expected %) -- this file recuts exactly one body', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#975 tail OK: clara.fa_arrears_resolutions exists, RLS-walled, SELECT-only to clara_authenticated, one-live-per-(client,year) indexed and firm-congruent by FK; clara._fa_closed_arrears is a STABLE definer-owned internal no role can execute; the recut clara._fa_run_period_core carries the question in both renderings exactly once each, keeps all four of its untouched arms'' markers and still has exactly four callers; and the locked-period wall, both run doors, the reopen path and the four arithmetic/oracle bodies are byte-for-byte unmoved.';
end
$p975_tail$;
