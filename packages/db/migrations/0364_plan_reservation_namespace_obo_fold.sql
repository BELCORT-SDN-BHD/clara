-- 0364_plan_reservation_namespace_obo_fold — #1150 (riders closing wave, lane L2): every plan
-- writer gets a nested reservation namespace of its own, and the estate's THIRD on-behalf-of
-- plan-creation body becomes a caller of the one that already exists.
-- =====================================================================================
-- Spec of record: GitHub issue #1150 (Agent Brief, 2026-09-26), whose two halves are candidates
-- D16 and D17 of `docs/plan/active/riders-2026-09-20/reports/waveS-followup-candidates.md`:
-- #1077's own follow-up 1 (`waveS-lane02-ticket1077.md`) and #1137's fix-round follow-up 1
-- (`waveS-lane08-fix.md` §6). Migration number 0364 assigned by the orchestrator in
-- `docs/plan/active/riders-2026-09-20/CLOSING-PLAN.md`. 0351 is not reclaimed. Every applied
-- migration is immutable and none is edited here.
--
-- HALF ONE — THE SHARED `:plan` NAMESPACE. `clara._reserve_op`
-- ([0004_governed_fns.sql](0004_governed_fns.sql):47) keys an operation receipt on
-- (firm_id, fn, op_key) — on the FIRM, not on the client. A door that nests another door hands it
-- a DERIVED key. 0336 (#1077) moved the deferred-revenue lane onto `:rrplan` / `:rrend` and
-- deliberately stopped there, which left THREE bodies outside that pair still deriving `<key>:plan`:
--
--     clara.create_accrual_adjustment          <key>:plan   under create_accounting_plan
--     clara._confirm_tenancy_rent_plan_core    <key>:plan   under create_accounting_plan
--     clara.correct_accrual_adjustment         <key>:plan   under revise_accounting_plan
--
-- …beside the prepayment lane's own `clara._prepayment_schedule_core` and
-- `clara.replace_prepayment_schedule`. One operation key spent on two of them reserved the SAME
-- row with different arguments and was answered `_reserve_op`'s own untyped CLR10
-- `op_key reused with different args`, which names neither lane and gives a surface nothing to
-- render. Measured on the rig before this file: a prepayment schedule and then an accrual
-- adjustment under one key raised exactly that (`p1150.cross_lane.create`, red).
--
-- WHICH LANE MOVES, AND WHY NOTHING IS BACKFILLED. 0336's own reasoning, followed here: the
-- prepayment lane KEEPS `:plan` / `:end`, so every key already spent on it keeps meaning what it
-- meant, and the lanes that move leave their pre-move receipts exactly where they are, because a
-- receipt records an act that happened. Nothing replays differently either way: the OUTER
-- reservation on each lane's own door short-circuits the whole body, so a genuine retry never
-- reaches the nested call at all.
--
--     prepayment          :plan     :end        unchanged
--     deferred revenue    :rrplan   :rrend      0336
--     accrual             :acplan   :acrev      THIS FILE
--     tenancy             :tnplan               THIS FILE
--
-- HALF TWO — THE THIRD ON-BEHALF-OF PLAN BODY. `clara._tenancy_plan_core`
-- ([0353_tenancy_agent_twins_obo_confirmations.sql](0353_tenancy_agent_twins_obo_confirmations.sql))
-- is a third snapshot of the on-behalf-of plan-creation step, beside `clara._obo_plan_core`
-- ([0338](0338_prepayment_close_standing_instruction.sql)) and `clara._accrual_plan_core`
-- ([0331](0331_accrual_plan_authority_wall.sql)). Half of 0353's own follow-up 1 landed at the
-- sweep wave's integration merge, which folded its hand-copied authority wall onto
-- `clara._assert_plan_authority`; the other half is here. `clara._obo_plan_core`'s closed kind set
-- gains `recurring_journal`, and `clara._tenancy_plan_core` becomes a caller of it — the shape
-- `clara._prepayment_plan_core` has had since #941.
--
-- NOTHING ADMITTED OR REFUSED MOVES. The tenancy step's own client-status wall (ADV-L08-01) stays
-- where that fix round put it, ABOVE the delegation, so its position in the ladder is unchanged;
-- every other wall it carried is `clara._obo_plan_core`'s already, raised in the same order with
-- the same SQLSTATE and the same typed `detail`. §TAIL re-measures that, and the battery drives it.
--
-- HALF THREE — THE CLOSED LANE SET. `p_lane` is a `text` argument of both tenancy confirmation
-- cores and decides which plan step runs. Both entrances pass a literal, so no caller can reach an
-- unknown lane today; the cores now say so rather than relying on it (ADV-L08-05, declined in the
-- sweep wave's lane L8 because the core was not being rewritten — it is being rewritten here).
--
-- THE SECTIONS:
--   §A  clara.create_accrual_adjustment            :plan  -> :acplan
--   §B  clara.correct_accrual_adjustment           :plan  -> :acrev
--   §C  clara._confirm_tenancy_rent_plan_core      :plan  -> :tnplan, and the closed lane set
--   §D  clara._confirm_tenancy_rent_plan_revision_core   the closed lane set
--   §E  clara._obo_plan_core                       admits the tenancy kind
--   §F  clara._tenancy_plan_core                   becomes a caller of §E
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not type `clara._reserve_op`'s reuse raise. Every governed door in the estate rides
--     that primitive; typing it would change what dozens of unrelated doors answer for a mistake
--     that has nothing to do with these lanes. That is #1077's follow-up 2 and owns its own ticket.
--   · It backfills and rewrites nothing. No `clara.op_receipts` row is read, moved or deleted.
--   · It does not move the WITHIN-LANE sharing that 0336 also left standing:
--     `clara._prepayment_schedule_core` and `clara.replace_prepayment_schedule` both derive
--     `:plan`, and `clara._revenue_recognition_core` and
--     `clara.replace_revenue_recognition_schedule` both derive `:rrplan`. Those pairs are ONE lane
--     each, which is the partition 0336 chose and #1150 follows; the residual is recorded as a
--     follow-up rather than swept in silence.
--   · It mints no new name, so it owes `tests/rig-meta.mjs` no cohort entry, and it mints no
--     database role (the closing wave's risk 1).
--   · It changes no ACL, no volatility, no owner and no `search_path`: every body below is its own
--     live text with the hunks this header names, and §TAIL re-measures the posture.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0364_pre$
declare
  v_n int; v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (riders
  -- closing wave lane L2 database `clara_c02`, 337 files, max `0361_reservation_release_advice`),
  -- never copied from an older migration's header — several of these have been recut since the
  -- file that first wrote them. Each admits exactly TWO pre-images: its measured live sha, or a
  -- body already carrying this file's own `0364` attribution, so a redo (#957) is admitted and
  -- real drift still refuses BY NAME.
  --
  --   · `create_accrual_adjustment` is 0222's own door, unmoved since.
  --   · `correct_accrual_adjustment` is 0284 (#936)'s.
  --   · `_confirm_tenancy_rent_plan_core` and `_confirm_tenancy_rent_plan_revision_core` are
  --     0353 (#1137)'s, as its own fix round left them.
  --   · `_obo_plan_core` is 0338 (#1050)'s, as the sweep wave's integration merge recut it.
  --   · `_tenancy_plan_core` is 0353's, at the sha the same merge left (3065a41f… → 9560414f…).
  v_recut text[][] := array[
    ['clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)',
     '09c682f52d6d9209425ff2923e37aba95ef4d483511ccee9d9829fd91985eed2'],
    ['clara.correct_accrual_adjustment(uuid,jsonb,text)',
     '6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa'],
    ['clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)',
     'e8a65796245bd331a72c7f92c6b882737f45e4f1be12c35739f5ea430265ef29']
  ];
  -- …AND THE NEIGHBOURS THIS FILE READS AND DOES NOT EDIT.
  --
  --   · `_reserve_op` is the primitive whose (firm, fn, op_key) key IS the defect. Pinned because
  --     the whole file is an argument about what it keys on; typing its raise is out of scope.
  --   · `create_accounting_plan` is the nested door all three lanes reach, and the body the
  --     tenancy lane's HUMAN branch hands its derived key to.
  --   · `_prepayment_schedule_core` and `replace_prepayment_schedule` are the lane that KEEPS
  --     `:plan` / `:end`. If either moved, "the prepayment lane is unchanged" would be false and
  --     every suffix below would need re-deciding.
  --   · `revise_accounting_plan` is the nested door §B reaches, and the thin delegate 0353 left
  --     in front of `clara._revise_accounting_plan_core`.
  v_keep text[][] := array[
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     '544cd88ecaa5b5237969aff36b1bd0d8a5cdf41aacea234e6415d3df54b523ea'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     'af096b607079e11a7888d907f8c5c9f03880ead0b9565ec26ee6feb9257dafd7'],
    ['clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)',
     'ed859dbe813067464a7635d6775c823a36c3f400b59f326952fb22c6ce34e699'],
    ['clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)',
     '94804ddc1dccd444c5bb5294524634db4afea043499eb8746dd7aae16b02ad77']
  ];
begin
  -- 1 · THE TWO FILES THIS ONE CONTINUES ARE ON THIS CHAIN. 0336 is the namespace decision this
  --     file extends; 0353 is the tenancy lane whose core it recuts. Applied ahead of either, this
  --     file would splice bodies that do not yet exist in the shape it was written against.
  select count(*) into v_n from clara.schema_migrations
   where version ~ 'revenue_recognition_plan_op_key$';
  if v_n <> 1 then
    raise exception '0364 prestate: 0336_revenue_recognition_plan_op_key is not applied (% rows) -- this file extends its namespace decision', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.schema_migrations
   where version ~ 'tenancy_agent_twins_obo_confirmations$';
  if v_n <> 1 then
    raise exception '0364 prestate: 0353_tenancy_agent_twins_obo_confirmations is not applied (% rows) -- this file recuts its confirmation core', v_n
      using errcode='CLR10';
  end if;

  -- 2 · THE DEFERRED-REVENUE LANE REALLY IS OFF `:plan` ALREADY, read off the bodies rather than
  --     assumed. If 0336 had been reverted, the suffix table in this file's header would be wrong
  --     and `:rrplan` would need re-deciding with the rest.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ~ 'p_op_key[[:space:]]*\|\|[[:space:]]*'':rrplan''';
  if v_n <> 2 then
    raise exception '0364 prestate: % bodies derive '':rrplan'' (expected 0336''s two) -- the deferred-revenue lane is not where this file was written against', v_n
      using errcode='CLR10';
  end if;

  -- 3 · NOTHING ALREADY OWNS THE SUFFIXES THIS FILE MINTS. A second body reaching for `:acplan`,
  --     `:acrev` or `:tnplan` would put this file's own lanes back in a shared namespace on the
  --     day it applied.
  for v_i in 1 .. 3 loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.prosrc ~ ('p_op_key[[:space:]]*\|\|[[:space:]]*''' || (array[':acplan', ':acrev', ':tnplan'])[v_i] || '''')
       and p.oid::regprocedure::text <> ALL (array[
         'clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)',
         'clara.correct_accrual_adjustment(uuid,jsonb,text)',
         'clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)']);
    if v_n <> 0 then
      raise exception '0364 prestate: % body/bodies outside this file''s own three already derive % -- the suffix is not free',
        v_n, (array[':acplan', ':acrev', ':tnplan'])[v_i] using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE BODIES THIS FILE RECUTS, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0364 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0364' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0364 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE NEIGHBOURS ARE EXACTLY WHAT THIS FILE WAS WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '0364 prestate: % moved (expected %, live %) -- this file reads it and does not edit it; re-measure before applying',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  raise notice '0364 prestate OK -- % FIRST, % REDO -- %', v_first, v_redo, v_modes;
end $c0364_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.create_accrual_adjustment — THE ACCRUAL LANE'S NESTED PLAN RESERVATION.
--
-- 0222's own body, verbatim from the live catalog, with ONE hunk: the derived key the nested
-- `clara.create_accounting_plan` call is handed. Nothing else in this door moves — not a wall,
-- not the order it raises in, not the outer reservation, not what it writes.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara.create_accrual_adjustment(p_client uuid, p_purpose text, p_authority_ref jsonb, p_accrual jsonb, p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text, p_effective_from date, p_effective_to date, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $c0364_a$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_basis jsonb; v_dedupe jsonb; v_plan jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'configuring an accrual requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- THE FLOOR, WITH A TYPED REASON. `clara._human_ctx` raises CLR04 with no detail at all, and a
  -- refusal a surface cannot classify is a refusal it cannot explain; this maps the three cases
  -- onto the estate's own vocabulary without recutting that guard.
  begin
    select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;
  exception when sqlstate 'CLR04' then
    raise exception 'configuring an accrual requires an active bookkeeper or above'
      using errcode='CLR04',
        detail=jsonb_build_object('reason',
          case when clara.jwt_sub() is null then 'no_authenticated_actor'
               when clara.jwt_firm() is null then 'actor_not_active'
               else 'insufficient_role' end)::text;
  end;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accrual' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accrual needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  if p_effective_from is null then
    raise exception 'an accrual needs the date its authority starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_from","constraint":"present"}';
  end if;

  -- THE PAYLOAD HALF, BEFORE THE RESERVATION.
  perform clara._assert_accrual_particulars(p_accrual);
  perform clara._assert_accrual_term_window(p_accrual, p_effective_from, p_effective_to);
  perform clara._assert_accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month,
    p_effective_from, p_effective_to);
  v_basis := clara._accrual_journal_basis(p_accrual, p_purpose, p_effective_from);

  -- THE RESERVATION, WITH THE ONE REFUSAL 0004 RAISES OUT OF IT GIVEN A TYPED REASON. The estate's
  -- `_reserve_op` (0004:46) raises exactly one CLR10 — `op_key reused with different args` — and it
  -- carries NO detail, so a surface could neither classify it nor say which control to look at
  -- (review round 1, A3). Re-raised here as this file's own token; the CLASS is unchanged.
  begin
    v_dedupe := clara._reserve_op(v_firm, 'create_accrual_adjustment', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'author', v_actor, 'purpose', btrim(p_purpose),
        'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
        'day_of_month', p_day_of_month, 'timezone', p_timezone,
        'effective_from', p_effective_from, 'effective_to', p_effective_to,
        'accrual', clara._accrual_canonical(p_accrual))));
  exception when sqlstate 'CLR10' then
    raise exception 'this accrual key already configured a DIFFERENT accrual' using errcode='CLR10',
      detail='{"reason":"op_key_conflict","field":"op_key"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this accrual key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- THE WORLD HALF, AFTER IT — an account retired, a filing withdrawn or a term superseded between
  -- two attempts under one key is a fact about the world, and refusing it ahead of the replay
  -- branch would turn a lost-response retry into a second configuration.
  perform clara._assert_accrual_world(v_firm, p_client, p_accrual);

  -- #1150 [0364]: THE ACCRUAL LANE'S OWN NESTED NAMESPACE, in 0336's shape. `clara._reserve_op`
  -- keys a receipt on (firm_id, fn, op_key), and the fn for this nested call is
  -- `create_accounting_plan` -- the same fn the prepayment lane's and the tenancy lane's nested
  -- calls use. While all three derived `<key>:plan`, one operation key spent on two of them
  -- reserved the SAME row with different arguments and was answered `_reserve_op`'s own untyped
  -- CLR10 `op_key reused with different args`, which names neither lane.
  --
  -- THE PREPAYMENT LANE KEEPS `:plan` and this lane moves, for 0336's own reason: a lane that
  -- keeps its suffix keeps every key already spent, and nothing is backfilled, because a receipt
  -- records an act that happened.
  v_plan := clara.create_accounting_plan(p_client, 'reversing_journal', p_purpose,
    'explicit_instruction', p_authority_ref, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, v_basis, 'next_period_first_day', p_op_key || ':acplan');

  v_result := clara._accrual_finish(v_firm, p_client, v_actor, p_purpose, p_accrual, v_plan,
    'explicit_instruction', p_authority_ref, p_effective_from, p_effective_to, p_op_key);
  return clara._finish_op(v_firm, 'create_accrual_adjustment', p_op_key, v_result);
end $c0364_a$;

-- =====================================================================================
-- §B — clara.correct_accrual_adjustment — THE ACCRUAL LANE'S NESTED **REVISION** RESERVATION.
--
-- 0284's own body (#936), verbatim from the live catalog, with ONE hunk in three places: the
-- derived key handed to `clara.revise_accounting_plan`, the `nested_op_key` the typed
-- `plan_op_key_conflict` refusal names, and the comment that explains both. #936's own wrap —
-- which types an UNTYPED CLR10 out of the nested call and re-raises everything else byte for byte
-- — is untouched, and `p1150.correction.namespace` drives it on the key that moved.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara.correct_accrual_adjustment(p_accrual_id uuid, p_accrual jsonb, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $c0364_b$
declare
  v_actor uuid; v_firm uuid;
  v_old clara.accrual_adjustments%rowtype;
  v_cur clara.accounting_plan_revisions%rowtype;
  v_fresh_corrected_by uuid;
  v_nested_detail text; v_nested_message text;
  v_basis jsonb; v_dedupe jsonb; v_revision jsonb; v_new_id uuid; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'correcting an accrual requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;

  -- THE FLOOR, WITH A TYPED REASON -- the same 0222 mapping `create_accrual_adjustment` uses for
  -- the identical reason: `clara._human_ctx` raises a bare CLR04 and a surface cannot classify it.
  begin
    select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;
  exception when sqlstate 'CLR04' then
    raise exception 'correcting an accrual requires an active bookkeeper or above'
      using errcode='CLR04',
        detail=jsonb_build_object('reason',
          case when clara.jwt_sub() is null then 'no_authenticated_actor'
               when clara.jwt_firm() is null then 'actor_not_active'
               else 'insufficient_role' end)::text;
  end;

  -- IDENTITY. NO EXISTENCE ORACLE ACROSS FIRMS: an id naming nothing and one belonging to another
  -- firm answer identically (0222's own rule for get_accrual_adjustment, reached the same way).
  select * into v_old from clara.accrual_adjustments where id = p_accrual_id and firm_id = v_firm;
  if v_old.id is null then
    raise exception 'accrual adjustment not found in your firm' using errcode='CLR11',
      detail='{"reason":"accrual_not_found"}';
  end if;

  -- THE PAYLOAD HALF, BEFORE THE RESERVATION -- deterministic, no side effects, safe to re-run on
  -- a replay. It is the payload ALONE: the term-window wall reads the LIVE revision's authority,
  -- which is mutable world state, so it sits in the world half below (see the header).
  perform clara._assert_accrual_particulars(p_accrual);

  -- #942 — THE SIDE IS NOT A CORRECTION. A correction restates the PARTICULARS of the accrual the
  -- plan is running; the side decides which two account TYPES those particulars are even allowed
  -- to name and which way every entry the plan has already posted was signed. Flipping it would
  -- leave a schedule whose posted periods are Dr expense / Cr liability and whose next period is
  -- Dr asset / Cr income, under one authority and one purpose. The honest act is to let this
  -- accrual's authority end and configure the other side's own accrual, so this is a typed
  -- refusal and never a silent re-interpretation. `v_old` is append-only, so this comparison is
  -- as deterministic as the particulars above it and belongs in the same half.
  if clara._accrual_side(p_accrual) is distinct from v_old.side then
    raise exception 'this is a % accrual; a correction restates it, it does not turn it into a % one',
      v_old.side, clara._accrual_side(p_accrual)
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_side_immutable','field','accrual.side',
          'side', v_old.side, 'requested_side', clara._accrual_side(p_accrual))::text;
  end if;

  -- THE RESERVATION. Re-raised with a typed reason, the same wrap `create_accrual_adjustment`
  -- gives `_reserve_op`'s own untyped "op_key reused with different args" (0004:46).
  begin
    v_dedupe := clara._reserve_op(v_firm, 'correct_accrual_adjustment', p_op_key,
      clara._hash(jsonb_build_object('accrual_id', p_accrual_id,
        'particulars', clara._accrual_canonical(p_accrual))));
  exception when sqlstate 'CLR10' then
    raise exception 'this correction key already corrected a DIFFERENT accrual' using errcode='CLR10',
      detail='{"reason":"op_key_conflict","field":"op_key"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this correction key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- THE WORLD HALF, AFTER THE RESERVATION BRANCH -- an account retired or a filing withdrawn
  -- between two attempts under one key, exactly 0222's own reasoning for `_assert_accrual_world`.
  perform clara._assert_accrual_world(v_firm, v_old.client_id, p_accrual);

  -- RUNG 1 -- the SAME accounting_plans row lock clara.revise_accounting_plan itself takes
  -- (0193:1679). Holding it BEFORE the recheck below is what makes "already corrected" a typed
  -- refusal rather than a race that surfaces as a bare 23505 on uq_accrual_adjustments_corrects
  -- (see the header).
  perform 1 from clara.accounting_plans where id = v_old.plan_id for update;

  select corrected_by_accrual_id into v_fresh_corrected_by
    from clara.accrual_adjustments where id = v_old.id;
  if v_fresh_corrected_by is not null then
    raise exception 'this accrual has already been corrected; correct its successor instead'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_already_corrected',
          'corrected_by_accrual_id', v_fresh_corrected_by)::text;
  end if;

  select * into v_cur from clara.accounting_plan_revisions
   where plan_id = v_old.plan_id and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision to correct' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;

  -- THE AUTHORITY WINDOW IS THE LIVE REVISION'S OWN, read under the lock that holds it still.
  -- Never `v_old`'s: that pair is what the accrual row remembered when it was written, and a
  -- lawful plan revision since then has moved it (see the header, ADV-01). The shared 0222
  -- predicate therefore judges the corrected term against the authority that is actually live.
  perform clara._assert_accrual_term_window(p_accrual, v_cur.effective_from, v_cur.effective_to);
  -- #937 - THE PER-PERIOD WALL, against the LIVE revision's own schedule and window (ADV-01's own
  -- rule, applied to this ticket's set): a corrected per-period set must cover exactly the
  -- periods the plan that is actually running will reach.
  perform clara._assert_accrual_period_amounts(p_accrual, v_cur.frequency, v_cur.day_rule,
    v_cur.day_of_month, v_cur.effective_from, v_cur.effective_to);
  v_basis := clara._accrual_journal_basis(p_accrual, v_old.purpose, v_cur.effective_from);

  -- THE NESTED DOOR -- clara.revise_accounting_plan, PINNED, UNTOUCHED (see the header for why:
  -- lane 05 pins this same body). Every schedule argument is the LIVE revision's own, carried
  -- through unchanged; only the basis is new.
  --
  -- THE DERIVED KEY'S OWN COLLISION IS TYPED (ADV-06). `clara._reserve_op` keys on
  -- (firm_id, fn, op_key), so `p_op_key || ':acrev'` shares the (firm, 'revise_accounting_plan')
  -- namespace with keys a caller chooses for that door DIRECTLY -- and #936 is the first place the
  -- nested door is one a human reaches with an arbitrary key of their own. When the two collide,
  -- the nested door re-raises `_reserve_op`'s own message with NO detail at all, so a surface can
  -- render only CLR10 and the raw sentence. This wrap types exactly that case -- an UNTYPED CLR10
  -- out of the nested call -- and re-raises everything else byte-identically with a bare `raise`,
  -- so no refusal the plan door already classifies is masked or renamed.
  --
  -- #1150 [0364]: THE ACCRUAL LANE'S OWN NESTED NAMESPACE, in 0336's shape. This derivation is
  -- taken at `revise_accounting_plan` rather than at `create_accounting_plan`, so it never
  -- collided with the two create doors; it shared the PREPAYMENT lane's `:plan` token all the
  -- same, and the partition this file settles is one suffix per lane, whichever nested door it is
  -- spent at. `:acrev` is the accrual lane's revision half, beside §A's `:acplan`.
  begin
    v_revision := clara.revise_accounting_plan(v_old.plan_id, v_cur.frequency, v_cur.day_rule,
      v_cur.day_of_month, v_cur.timezone, v_cur.effective_from, v_cur.effective_to, v_basis,
      v_cur.reversal_day_rule, p_op_key || ':acrev');
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_nested_detail = pg_exception_detail,
                            v_nested_message = message_text;
    if coalesce(btrim(v_nested_detail), '') = '' then
      raise exception 'the plan revision this correction records is blocked: %', v_nested_message
        using errcode='CLR10',
          detail=jsonb_build_object('reason','plan_op_key_conflict','field','op_key',
            'nested_op_key', p_op_key || ':acrev')::text;
    end if;
    raise;
  end;

  -- THE SUCCESSOR ROW, for the revision that just came out of the nested call. Every column
  -- `create_accrual_adjustment`'s own tail (`_accrual_finish`, 0222 §C) writes, from the CORRECTED
  -- particulars except purpose/authority, which this door does not ask the caller to restate.
  insert into clara.accrual_adjustments(firm_id, client_id, plan_id, revision, purpose,
      side, expense_account_code, liability_account_code, amount_cents, currency, effective_from,
      effective_to, service_period_start, service_period_end, term_source,
      document_service_period_id, method, authority_kind, authority_ref, source_document_id,
      instruction, corrects_accrual_id, recorded_by)
    values (v_firm, v_old.client_id, v_old.plan_id, (v_revision ->> 'revision')::int, v_old.purpose,
      -- #942: carried from the row being corrected, which the wall above has just proved the
      -- payload agrees with.
      v_old.side,
      btrim(p_accrual ->> 'expense_account_code'), btrim(p_accrual ->> 'liability_account_code'),
      (p_accrual ->> 'amount_cents')::bigint, 'MYR', v_cur.effective_from, v_cur.effective_to,
      (p_accrual ->> 'service_period_start')::date, (p_accrual ->> 'service_period_end')::date,
      p_accrual ->> 'term_source',
      nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'')::uuid,
      p_accrual -> 'method', v_old.authority_kind, v_old.authority_ref,
      nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'')::uuid,
      btrim(p_accrual ->> 'instruction'), v_old.id, v_actor)
    returning id into v_new_id;

  -- #937 - THE STATED PERIOD AMOUNTS, written in the SAME transaction as the detail they belong
  -- to and BEFORE any occurrence is admitted, because the resolver the admission core asks
  -- (clara._plan_accrual_period_line) reads exactly these rows. The `where` is the rule's own
  -- gate: a stated_amount accrual writes none, and clara._assert_accrual_period_amounts has
  -- already refused a period_amounts key under any other rule.
  insert into clara.accrual_period_amounts(firm_id, client_id, accrual_id, due_date,
      amount_cents, currency, recorded_by)
    select v_firm, v_old.client_id, v_new_id, (e ->> 'due_date')::date,
           (e ->> 'amount_cents')::bigint, 'MYR', v_actor
      from jsonb_array_elements(
             case when jsonb_typeof(p_accrual -> 'period_amounts') = 'array'
                  then p_accrual -> 'period_amounts' else '[]'::jsonb end) e
     where (p_accrual -> 'method' ->> 'rule') = 'stated_period_amount';

  -- THE ONE-WAY STAMP -- 0222's append-only trigger's ONE admitted update, ridden here for the
  -- first time: NULL -> an id, once (`t_accrual_adjustments_append_only`).
  update clara.accrual_adjustments set corrected_by_accrual_id = v_new_id where id = v_old.id;

  perform clara._audit(v_firm, v_actor, null, null, 'correct_accrual_adjustment', null,
    jsonb_build_object('client', v_old.client_id, 'plan', v_old.plan_id,
      'corrects_accrual_id', v_old.id, 'accrual_id', v_new_id,
      'revision', (v_revision ->> 'revision')::int,
      'amount_cents', (p_accrual ->> 'amount_cents')::bigint, 'op_key', p_op_key));

  v_result := jsonb_build_object(
    'accrual_id', v_new_id, 'corrects_accrual_id', v_old.id,
    'plan_id', v_old.plan_id, 'revision_id', v_revision ->> 'revision_id',
    'revision', (v_revision ->> 'revision')::int,
    'superseded_revision', (v_revision ->> 'superseded_revision')::int,
    'status', v_revision ->> 'status',
    'overlap_warning', v_revision -> 'overlap_warning');
  return clara._finish_op(v_firm, 'correct_accrual_adjustment', p_op_key, v_result);
end $c0364_b$;

-- =====================================================================================
-- §C — clara._confirm_tenancy_rent_plan_core — THE TENANCY LANE'S NESTED PLAN RESERVATION.
--
-- 0353's own body, verbatim from the live catalog as its fix round left it, with the hunks this
-- file's header names. The nested reservation belongs to the HUMAN branch alone: the on-behalf-of
-- branch hands `clara._tenancy_plan_core` no operation key at all, for the reason 0317 states
-- (`clara.create_accounting_plan` resolves its actor from a JWT a runtime connection does not
-- carry), so there was never a second nested reservation on that lane to move.
-- =====================================================================================
CREATE OR REPLACE FUNCTION clara._confirm_tenancy_rent_plan_core(p_firm uuid, p_actor uuid, p_lane text, p_client uuid, p_document uuid, p_rent_account text, p_payable_account text, p_judgement text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $c0364_c$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_filing uuid; v_kind text;
  v_draft jsonb; v_tr jsonb; v_plan jsonb; v_refusal jsonb; v_existing record;
  v_judgement text; v_confirmation uuid; v_purpose text; v_created jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'confirming a rent plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- #1137 [0353]: the BOOKKEEPER floor and the caller's identity are resolved ABOVE this core --
  -- by the human door through clara._human_ctx, and by the OBO twin through a LIVE re-check of the
  -- named author's own membership of this firm. The firm and the actor they resolved arrive as
  -- this function's first two arguments; every line below is the human door's own, byte for byte.
  select p_firm as firm, p_actor as actor into c;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select f.id into v_filing from clara.document_filings f
   where f.document_id = p_document and f.client_id = p_client and f.firm_id = c.firm
     and f.retired_at is null
   order by f.filed_at desc limit 1;
  if v_filing is null then
    raise exception 'document % is not a live filing of this client', p_document using errcode='CLR11';
  end if;
  select d.document_kind into v_kind from clara.documents d where d.id = p_document;
  if v_kind is distinct from 'agreement_contract' then
    raise exception 'a rent plan is confirmed against an agreement contract, not a %', coalesce(v_kind,'(unclassified)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','confirm_wrong_kind','kind',v_kind)::text;
  end if;

  v_judgement := nullif(btrim(coalesce(p_judgement,'')),'');

  v_dedupe := clara._reserve_op(c.firm, 'confirm_tenancy_rent_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'rent_account', p_rent_account, 'payable_account', p_payable_account,
      'judgement', v_judgement)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- ALREADY RUNNING? Derived from the confirmation the live plan cites, never a marker.
  select * into v_existing from clara._tenancy_rent_plan(p_document);
  if v_existing.plan_id is not null then
    raise exception 'this tenancy already runs a rent plan; revise or end that plan rather than confirming a second'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','rent_plan_already_confirmed',
          'plan_id', v_existing.plan_id, 'plan_status', v_existing.status,
          'confirmation_id', v_existing.confirmation_id)::text;
  end if;

  -- ONE LIVE RENT PLAN PER PAYABLE ACCOUNT (fix round, finding ADV-03). The open-rent read is a
  -- FIFO over the payable ACCOUNT's own balance, because 2050 has no subledger -- so two live
  -- tenancies pointed at one account share a single payment pool and each other's months. The
  -- first cut refused only a second plan on the SAME DOCUMENT, which let exactly that in. The
  -- remedy is the accountant's own choice the owner's ruling already gives them: point the second
  -- tenancy at its own liability account. Named refusal, carrying the tenancy that holds it.
  select cf.document_id, cf.id as confirmation_id, p.id as plan_id into v_existing
    from clara.contract_plan_confirmations cf
    join clara.accounting_plans p
      on p.authority_ref->>'kind' = 'contract_confirmation'
     and nullif(p.authority_ref->>'id','')::uuid = cf.id
   where cf.client_id = p_client and cf.kind = 'rent_plan' and p.status <> 'ended'
     and cf.payable_account_code = coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050')
   order by cf.confirmed_at desc limit 1;
  if v_existing.plan_id is not null then
    raise exception 'account % already carries another tenancy''s live rent plan; a second plan on one payable account would share its payments month for month -- give this tenancy its own liability account', coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','payable_account_in_use',
          'payable_account_code', coalesce(nullif(btrim(coalesce(p_payable_account,'')),''), '2050'),
          'plan_id', v_existing.plan_id, 'document_id', v_existing.document_id,
          'confirmation_id', v_existing.confirmation_id)::text;
  end if;

  v_draft := clara._tenancy_rent_plan_draft(p_client, p_document, p_rent_account, p_payable_account);
  v_tr := v_draft->'treatment';

  select value into v_refusal from jsonb_array_elements(v_draft->'refusals')
   where value->>'reason' = 'plan_credits_bank_account' limit 1;
  if v_refusal is not null then
    raise exception 'a rent plan may not credit % -- it is one of this client''s own bank accounts, and a plan that pays itself out of the bank double-counts the statement line that pays it', v_refusal->'detail'->>'account_code'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_credits_bank_account',
          'account_code', v_refusal->'detail'->>'account_code',
          'account_name', v_refusal->'detail'->>'account_name')::text;
  end if;
  select value into v_refusal from jsonb_array_elements(v_draft->'refusals')
   where value->>'reason' = 'account_not_in_chart' limit 1;
  if v_refusal is not null then
    raise exception 'account % is not in this client''s chart (or is inactive); add it before confirming the plan', v_refusal->'detail'->>'account_code'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','account_not_in_chart',
          'account_code', v_refusal->'detail'->>'account_code',
          'role', v_refusal->'detail'->>'role')::text;
  end if;

  v_plan := v_draft->'plan';
  if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
    raise exception 'there is no rent plan to confirm: %', coalesce(v_tr->>'question','the tenancy''s terms are not complete')
      using errcode='CLR10',
        detail=jsonb_build_object('reason', coalesce(v_tr->>'reason','terms_incomplete'),
          'missing_terms', v_tr->'missing_terms')::text;
  end if;

  -- THE BRANCH ASKED -> A WRITTEN JUDGEMENT IS OWED (the owner's ruling, and "beta, nothing
  -- dark": a compliance gate PROMPTS, it never disables). The message is the branch's OWN
  -- question, so the sentence on screen and the decision the lane took come out of one body.
  if (v_tr->>'drafts')::boolean is not true and v_judgement is null then
    raise exception '%', v_tr->>'question'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','professional_judgement_required',
          'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard')::text;
  end if;

  v_confirmation := gen_random_uuid();
  insert into clara.contract_plan_confirmations(id, firm_id, client_id, document_id, kind,
      monthly_rent_cents, rent_account_code, payable_account_code, term_start, term_end,
      treatment, professional_judgement, confirmed_by)
    values (v_confirmation, c.firm, p_client, p_document, 'rent_plan',
      (v_plan->>'monthly_rent_cents')::bigint,
      v_plan->>'rent_account_code', v_plan->>'payable_account_code',
      (v_plan->>'effective_from')::date, (v_plan->>'effective_to')::date,
      v_tr, v_judgement, c.actor);

  v_purpose := left((v_plan->>'purpose')
    || case when v_judgement is null then ''
            else format(' (confirmed on a professional judgement under %s)',
                        coalesce(v_tr->>'standard','the applicable framework')) end, 300);

  -- THE PLAN LANE'S OWN DOOR, called rather than re-implemented: every schedule check, every
  -- overlap advisory, every idempotency and locking rule 0193 carries applies to this plan
  -- unchanged. The authority it cites is the row inserted a moment ago.
  -- #1137 [0353]: ONE plan step per lane, and this branch is the ONLY difference between them.
  -- The HUMAN lane still calls clara.create_accounting_plan (0193) -- the granted plan door, with
  -- its own op key, its own receipt and whatever wall the plan lane adds next; nothing about the
  -- human entrance changes. The OBO lane cannot call it: that door resolves its actor through
  -- clara._human_ctx -> clara.jwt_sub(), and a clara_runtime connection carries no
  -- request.jwt.claims at all, so nesting it would raise CLR04 `no authenticated actor` on every
  -- call. It takes clara._tenancy_plan_core instead, with the named author in an argument --
  -- #915's own answer to exactly this problem (0307 §A, clara._prepayment_plan_core).
  -- THE BRANCH TESTS FOR `obo` AND NOT FOR `human`, so an unknown lane takes the JWT path and
  -- fails CLOSED (CLR04 `no authenticated actor`) rather than writing a plan with no receipt.
  if p_lane = 'obo' then
    v_created := clara._tenancy_plan_core(
      p_firm => c.firm,
      p_client => p_client,
      p_author => c.actor,
      p_purpose => v_purpose,
      p_authority_kind => 'explicit_instruction',
      p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
      p_frequency => v_plan->>'frequency',
      p_day_rule => v_plan->>'day_rule',
      p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
      p_timezone => v_plan->>'timezone',
      p_effective_from => (v_plan->>'effective_from')::date,
      p_effective_to => (v_plan->>'effective_to')::date,
      p_basis => v_plan->'basis');
  else
    v_created := clara.create_accounting_plan(
      p_client => p_client,
      p_kind => 'recurring_journal',
      p_purpose => v_purpose,
      p_authority_kind => 'explicit_instruction',
      p_authority_ref => jsonb_build_object('kind','contract_confirmation','id',v_confirmation),
      p_frequency => v_plan->>'frequency',
      p_day_rule => v_plan->>'day_rule',
      p_day_of_month => nullif(v_plan->>'day_of_month','')::int,
      p_timezone => v_plan->>'timezone',
      p_effective_from => (v_plan->>'effective_from')::date,
      p_effective_to => (v_plan->>'effective_to')::date,
      p_basis => v_plan->'basis',
      p_reversal_day_rule => null,
      -- #1150 [0364]: THE TENANCY LANE'S OWN NESTED NAMESPACE, in 0336's shape. This is the
      -- HUMAN branch, and the only one that takes a nested reservation at all: the OBO branch
      -- above hands `clara._tenancy_plan_core` no operation key, for the reason 0317 states.
      -- While this lane derived `<key>:plan` it shared the (firm, 'create_accounting_plan')
      -- namespace with the prepayment and accrual lanes, and one key spent on two of them was
      -- answered the untyped CLR10 `op_key reused with different args`.
      p_op_key => p_op_key || ':tnplan');
  end if;

  -- #1137 [0353]: the LANE travels on the audit row, exactly as 0222, 0307 and 0308 stamp `via`
  -- on theirs -- so a reader can tell a confirmation taken in a conversation from one taken on the
  -- Contract page without joining anything. The ACTOR is the named person either way: that is what
  -- an on-behalf-of act means, and clara.contract_plan_confirmations.confirmed_by says so too.
  perform clara._audit(c.firm, c.actor, null, null, 'confirm_tenancy_rent_plan', null,
    jsonb_build_object('via', case p_lane when 'obo' then 'confirm_tenancy_rent_plan_for' else 'confirm_tenancy_rent_plan' end,
      'client', p_client, 'document', p_document,
      'confirmation', v_confirmation, 'plan', v_created->>'plan_id',
      'treatment_reason', v_tr->>'reason', 'standard', v_tr->>'standard',
      'judgement_given', v_judgement is not null));

  return clara._finish_op(c.firm, 'confirm_tenancy_rent_plan', p_op_key,
    jsonb_build_object('document_id', p_document, 'client_id', p_client,
      'confirmation_id', v_confirmation,
      'plan_id', v_created->>'plan_id', 'revision_id', v_created->>'revision_id',
      'status', v_created->>'status',
      'occurrences', v_plan->'occurrences',
      'next_occurrences', v_created->'next_occurrences',
      'overlap_warning', v_created->'overlap_warning',
      'treatment', v_tr, 'professional_judgement', v_judgement));
end $c0364_c$;

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, read off the LIVE catalog rather than off this
-- file's own statements.
-- =====================================================================================
do $c0364_tail$
declare v_n int; v_src text; v_i int; v_sig text; v_suffix text;
begin
  -- 1 · EACH LANE THAT MOVED GAINED ITS OWN SUFFIX **AND LOST THE SHARED ONE**. The pair is what
  --     matters: gaining without losing would leave the collision exactly where it was.
  for v_i in 1 .. 3 loop
    v_sig := (array[
      'clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)',
      'clara.correct_accrual_adjustment(uuid,jsonb,text)',
      'clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)'])[v_i];
    v_suffix := (array[':acplan', ':acrev', ':tnplan'])[v_i];
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if v_src !~ ('p_op_key[[:space:]]*\|\|[[:space:]]*''' || v_suffix || '''') then
      raise exception '0364 tail: % does not derive %', v_sig, v_suffix using errcode='CLR10';
    end if;
    if v_src ~ 'p_op_key[[:space:]]*\|\|[[:space:]]*'':plan''' then
      raise exception '0364 tail: % still derives '':plan'' -- it gained % without losing the shared namespace',
        v_sig, v_suffix using errcode='CLR10';
    end if;
  end loop;

  -- 2 · THE PREPAYMENT LANE STILL HOLDS `:plan`, which is the half of the partition that keeps
  --     every key already spent meaning what it meant.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ~ 'p_op_key[[:space:]]*\|\|[[:space:]]*'':plan''';
  if v_n <> 2 then
    raise exception '0364 tail: % bodies derive '':plan'' (expected the prepayment lane''s two and nothing else)', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosrc ~ 'p_op_key[[:space:]]*\|\|[[:space:]]*'':plan'''
     and p.oid::regprocedure::text = ANY (array[
       'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
       'clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)']);
  if v_n <> 2 then
    raise exception '0364 tail: the two bodies that derive '':plan'' are not the prepayment lane''s own'
      using errcode='CLR10';
  end if;

  -- 3 · AND THE SUFFIXES THIS FILE MINTS ARE DERIVED BY EXACTLY ONE BODY EACH.
  for v_i in 1 .. 3 loop
    v_suffix := (array[':acplan', ':acrev', ':tnplan'])[v_i];
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.prosrc ~ ('p_op_key[[:space:]]*\|\|[[:space:]]*''' || v_suffix || '''');
    if v_n <> 1 then
      raise exception '0364 tail: % bodies derive % (expected exactly one)', v_n, v_suffix
        using errcode='CLR10';
    end if;
  end loop;

  -- 4 · THE POSTURE OF EVERY BODY THIS FILE RECUT IS UNMOVED: owner, SECURITY DEFINER, volatility
  --     and `search_path`. `create or replace function` preserves the ACL, and the census cells
  --     read it; this is the half a replace could silently move.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.oid::regprocedure::text = ANY (array[
       'clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,integer,text,date,date,text)',
       'clara.correct_accrual_adjustment(uuid,jsonb,text)',
       'clara._confirm_tenancy_rent_plan_core(uuid,uuid,text,uuid,uuid,text,text,text,text)'])
     and p.prosecdef and p.provolatile = 'v'
     and p.proowner::regrole::text = 'clara_fn_owner'
     and array_to_string(p.proconfig, ',') = 'search_path=clara, pg_temp';
  if v_n <> 3 then
    raise exception '0364 tail: % of the 3 recut bodies keep their posture (owner, secdef, volatile, search_path)', v_n
      using errcode='CLR10';
  end if;

  -- 5 · AND #936's TYPED WRAP NAMES THE KEY THE DOOR ACTUALLY DERIVES. A refusal that reported
  --     the old suffix would send a caller looking for a receipt that was never taken.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.correct_accrual_adjustment(uuid,jsonb,text)'::regprocedure;
  if position('''nested_op_key'', p_op_key || '':acrev''' in v_src) = 0 then
    raise exception '0364 tail: the correction door''s plan_op_key_conflict does not name the key it derives'
      using errcode='CLR10';
  end if;

  raise notice '0364 tail OK -- the accrual and tenancy lanes hold namespaces of their own and the prepayment lane keeps :plan';
end $c0364_tail$;
