-- 0064_wave_e_theta_close_plan.sql -- Wave E lane theta: the CLOSE half of
-- plan-as-document (E-a, plumbing grade).
--
-- MIGRATION NUMBER claimed at MERGE (standing law). Authored UNNUMBERED while other
-- Wave E lanes (delta/epsilon/eta/zeta/the RS name-only guard) were landing in
-- parallel this session; claimed as 0064 -- AHEAD of epsilon (which was re-sequenced
-- behind theta after epsilon's independent review returned a deep fix round) -- on
-- top of repo frontier 0063 (delta 0058-0061 + the RS name-only guard 0062-0063,
-- both already merged). Renumber mechanically if the merge order moves again.
--
-- DESIGN HOME: docs/plan/active/wave-e-design-skeleton-part4.md SS4 ("Lane theta --
-- the CLOSE half of plan-as-document, plumbing grade"). The contract wins on any
-- conflict.
--
-- WHAT THIS FILE SHIPS: ONE new read, clara.get_close_plan(p_fiscal_year_id). The
-- close model is already the intended-vs-actual audit record SS4 asks for --
-- close_gate_checks IS the intended catalog, close_gate_results/close_attestations/
-- close_receipts ARE the actual/attested/settled record (0056). This lane adds no
-- table, no writer, no new persistence -- it types the existing four tables into
-- ONE plan document a dashboard can render without its own SQL. The two dashboard
-- surfaces (/close, /reports) that consume this read ship in the SAME PR under
-- apps/dashboard/app/close/** and apps/dashboard/app/reports/**, outside this file.
--
-- DUAL-LANE GRANT (clara_authenticated AND clara_agent_ro -- a read, and the
-- ONLY one of 0056's close-model reads granted to the agent lane). 0056 S6.4e's
-- own header explains why get_close_readiness/verify_close/list_fiscal_years are
-- clara_authenticated-ONLY: those bodies resolve context through clara._human_ctx,
-- i.e. JWT claims -- a session-settable GUC -- so an agent-role grant on a
-- JWT-trusting body is either dark (no membership resolves under clara_agent_ro)
-- or a cross-tenant read for a session that forges request.jwt.claims. This
-- function instead resolves its caller's firm through clara.actor_firm_id()
-- (0002:440-443), the standing dual-lane resolver already granted to BOTH roles:
-- coalesce(clara.wake_firm(), clara.jwt_firm()) -- the wake credential's
-- STRUCTURAL, credential-table-backed firm wins when a wake session is live (the
-- agent lane, never JWT-claim-trusted), the JWT membership's firm otherwise (the
-- human lane). Reused verbatim, never re-derived, so the two lanes cannot drift
-- apart from the resolver every other dual-role body already leans on. The
-- underlying tables (fiscal_years, close_gate_checks, close_runs,
-- close_gate_results, close_attestations, close_receipts) carry NO clara_agent_ro
-- RLS policy at all (0056's own posture: human-only visibility, by owner-policy
-- bypass only) -- so this function is SECURITY DEFINER, owned by clara_fn_owner,
-- and performs its own explicit firm-congruence filter on every read exactly as
-- get_close_readiness does; the definer read's tenant safety rests on that filter,
-- never on the tables' own RLS (0056 S1's own A6e lesson, applied here to a
-- caller that is sometimes an agent rather than a human).
--
-- LIVE-INERT, ADDITIVE, NO D1 WINDOW. This file creates ONE new function and
-- touches no existing body, no existing table, no trigger. It is additive in the
-- literal sense the deploy contract means: nothing here can change the observable
-- behaviour of any call that predates this migration, so it carries no
-- write-quiesce obligation (packages/db/README.md, "Deploy contract" -- that rule
-- binds a migration that REPLACES an audited writer's body; this migration
-- replaces nothing). The close model itself remains LIVE-INERT (0056: zero
-- fiscal_years rows in production at authoring), so on the live estate today this
-- function's honest answer is the CLR11 refusal for every fiscal_year_id -- there
-- is no fiscal year in ANY firm yet. That refusal path is exercised at test time
-- because the deploy state guarantees no other path is reachable in production
-- until the first human opens a year.
--
-- REFUSAL CODES: no new code claimed. CLR04 (no authenticated context, the
-- _human_ctx-family idiom) and CLR11 (fiscal year not found in your firm -- the
-- standing no-existence-oracle rule: a foreign FY and an absent FY read
-- identically, exactly as list_fiscal_years/days_in_period/snapshot_state/
-- get_close_readiness already answer their own analogous lookups).
--
-- CELLS: packages/db/tests/theta-close-plan.test.mjs. Contract-blind: every claim
-- is proved against the live catalog, never this file's text.
set local statement_timeout = '2min';   -- precautionary only: this file performs
                                         -- no data scan and no backfill, one DDL
                                         -- statement plus grants.

-- =====================================================================================
-- S0 -- PRESTATE.
-- =====================================================================================
do $s0$
declare v_t text;
begin
  -- (0.1) The close model + registry lanes this file reads must be applied.
  foreach v_t in array array['0056_wave_e_close_model','0057_wave_e_registry_snapshots'] loop
    if not exists (select 1 from clara.schema_migrations where version = v_t) then
      raise exception 'theta S0.1: % is not recorded as applied -- apply in order', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.2) THE BIRTH SET MUST BE ABSENT -- the re-apply refusal.
  if to_regprocedure('clara.get_close_plan(uuid)') is not null then
    raise exception 'theta S0.2: clara.get_close_plan(uuid) already exists -- refusing to re-birth'
      using errcode = 'CLR10';
  end if;

  -- (0.3) The close-model tables this function reads, at the shapes this file was
  -- authored against.
  foreach v_t in array array['clara.fiscal_years','clara.close_gate_checks',
      'clara.close_runs','clara.close_gate_results','clara.close_attestations',
      'clara.close_receipts'] loop
    if to_regclass(v_t) is null then
      raise exception 'theta S0.3: % is missing -- the close model must be applied first', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.4) The helpers this file leans on, at their pinned signatures -- including
  -- the dual-lane resolver this function's whole tenant-safety argument rests on.
  if to_regprocedure('clara.actor_firm_id()') is null
     or to_regprocedure('clara.wake_firm()') is null
     or to_regprocedure('clara.jwt_firm()') is null
     or to_regprocedure('clara._gate_outstanding_items(text,jsonb)') is null then
    raise exception 'theta S0.4: a required helper is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;

  -- (0.5) actor_firm_id must already be reachable by BOTH app roles (0004:763-764)
  -- -- a change here would silently break this function's own dual-lane premise.
  if not has_function_privilege('clara_authenticated', 'clara.actor_firm_id()', 'execute')
     or not has_function_privilege('clara_agent_ro', 'clara.actor_firm_id()', 'execute') then
    raise exception 'theta S0.5: clara.actor_firm_id() is not dual-granted -- the premise this function reuses has moved'
      using errcode = 'CLR10';
  end if;
end $s0$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara.get_close_plan: the typed plan document (skeleton SS4).
--
-- Every applicable check (all 13 catalog rows -- 0056 S6.3's own ruling, Codex R2
-- MAJOR 2, applies here too: a 'goods_trading' check is never SKIPPED, its
-- evaluator answers 'pass'/'not_goods_trading' for a service business, so
-- excluding it from the plan would hide the fresh positive evidence instead of
-- showing it) rides with its drawer, its intended assertion (title), its measured
-- state at the LATEST close run (or an honest 'not_yet_measured' when no close has
-- ever begun -- absence stated, never a fabricated 'unknown' the evaluator never
-- produced), and its outstanding items each carrying their attestation or an
-- explicit absence marker -- 'live' when the attestation is bound to the CURRENT
-- measured_digest (get_close_readiness's own freshness test, reused), 'stale' when
-- a superseded digest moved under it, 'absent' when none exists. The close
-- receipt (kind='close') rides last, an honest 'absent' state before finalize.
-- =====================================================================================
create function clara.get_close_plan(p_fiscal_year_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_firm    uuid;
  v_fy      record;
  v_run     record;
  v_checks  jsonb;
  v_receipt record;
begin
  -- DUAL-LANE FIRM RESOLUTION -- see file header. The wake credential's
  -- structural firm wins when a wake session is live; the JWT membership's firm
  -- otherwise. Never re-derived from either primitive directly.
  v_firm := clara.actor_firm_id();
  if v_firm is null then
    raise exception 'no authenticated context' using errcode = 'CLR04';
  end if;

  select * into v_fy from clara.fiscal_years fy
    where fy.id = p_fiscal_year_id and fy.firm_id = v_firm;
  if v_fy.id is null then
    -- NO EXISTENCE ORACLE (the standing CLR11 rule): an absent fiscal_year_id and
    -- a foreign one produce the IDENTICAL refusal. On the live LIVE-INERT estate
    -- (zero fiscal_years rows) this is the honest answer for every call today.
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;

  -- The LATEST close run for this FY, any state -- get_close_readiness's own
  -- lookup, reused verbatim so the two reads cannot disagree about "which run".
  select * into v_run from clara.close_runs r
    where r.fiscal_year_id = p_fiscal_year_id
    order by r.started_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'check_key', chk.check_key,
      'drawer', chk.drawer,
      'title', chk.title,
      'applies_when', chk.applies_when,
      'result', case when g.check_key is null then
          jsonb_build_object('state', 'not_yet_measured')
        else
          jsonb_build_object('state', g.state, 'measured', g.measured,
            'measured_digest', g.measured_digest, 'evaluated_at', g.evaluated_at)
        end,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'item_key', it.item_key,
            'attestation', case
              when att.id is null then
                jsonb_build_object('state', 'absent')
              when g.measured_digest is not null and att_gr.measured_digest = g.measured_digest then
                jsonb_build_object('state', 'live', 'attested_by', att.attested_by,
                  'reason', att.reason, 'attested_at', att.attested_at)
              else
                jsonb_build_object('state', 'stale', 'attested_by', att.attested_by,
                  'reason', att.reason, 'attested_at', att.attested_at)
              end)
            order by it.item_key), '[]'::jsonb)
        from unnest(
          case
            when g.check_key is null then array['__gate__']::text[]
            when coalesce(array_length(
                   clara._gate_outstanding_items(chk.check_key, g.measured), 1), 0) = 0
              then array['__gate__']::text[]
            else clara._gate_outstanding_items(chk.check_key, g.measured)
          end) it(item_key)
        left join clara.close_attestations att
          on att.close_run_id = v_run.id and att.check_key = chk.check_key
         and att.item_key = it.item_key and att.superseded_at is null
        left join clara.close_gate_results att_gr
          on att_gr.id = att.gate_result_id
      ))
    order by chk.drawer, chk.check_key), '[]'::jsonb)
    into v_checks
    from clara.close_gate_checks chk
    left join lateral (
      select r2.* from clara.close_gate_results r2
       where r2.close_run_id = v_run.id and r2.check_key = chk.check_key
       order by r2.seq desc limit 1
    ) g on true;

  -- The most recent close-kind receipt for this FY, active or superseded --
  -- absence stated, never omitted; a reopened FY's superseded receipt is still
  -- shown, honestly labelled, rather than made to look like no close ever ran.
  select cr.* into v_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = p_fiscal_year_id and cr.kind = 'close'
    order by cr.closed_at desc limit 1;

  return jsonb_build_object(
    'fiscal_year', jsonb_build_object(
      'id', v_fy.id, 'label', v_fy.label, 'ordinal', v_fy.ordinal,
      'starts_on', v_fy.starts_on, 'ends_on', v_fy.ends_on,
      'status', v_fy.status, 'fy_end_source', v_fy.fy_end_source),
    'close_run', case when v_run.id is null then
        jsonb_build_object('state', 'absent')
      else
        jsonb_build_object('state', 'present', 'close_run_id', v_run.id,
          'run_state', v_run.state, 'started_by', v_run.started_by,
          'started_at', v_run.started_at, 'ended_by', v_run.ended_by,
          'ended_at', v_run.ended_at, 'end_reason', v_run.end_reason)
      end,
    'checks', v_checks,
    'receipt', case when v_receipt.id is null then
        jsonb_build_object('state', 'absent')
      else
        jsonb_build_object('state', 'present', 'receipt_id', v_receipt.id,
          'kind', v_receipt.kind, 'status', v_receipt.status,
          'closed_by', v_receipt.closed_by, 'closed_at', v_receipt.closed_at,
          'segregation_mode', v_receipt.segregation_mode,
          'self_attestation', v_receipt.self_attestation,
          'pl_net_cents', v_receipt.pl_net_cents,
          'retained_earnings_account', v_receipt.retained_earnings_account,
          'closing_tb_digest', v_receipt.closing_tb_digest,
          'gate_digest', v_receipt.gate_digest,
          'books_watermark', v_receipt.books_watermark,
          'evaluator_version_ids', to_jsonb(v_receipt.evaluator_version_ids),
          'dataset_sha256', v_receipt.dataset_sha256,
          'close_entry_id', v_receipt.close_entry_id,
          'closing_position', v_receipt.snapshot -> 'closing_position')
      end);
end $$;
alter function clara.get_close_plan(uuid) owner to clara_fn_owner;
revoke all on function clara.get_close_plan(uuid) from public;
grant execute on function clara.get_close_plan(uuid) to clara_authenticated, clara_agent_ro;

reset role;

-- =====================================================================================
-- S2 -- TAIL CENSUS.
-- =====================================================================================
do $s2$
declare
  v_provolatile "char"; v_prosecdef bool; v_conf text[]; v_owner text; v_t text;
begin
  if to_regprocedure('clara.get_close_plan(uuid)') is null then
    raise exception 'theta S2.1: clara.get_close_plan(uuid) was not created' using errcode = 'CLR10';
  end if;

  -- (2.1) STABLE, SECURITY DEFINER, pinned search_path, owned by clara_fn_owner --
  -- the four properties the file header claims, read from the catalog, not
  -- assumed from the text above.
  select p.provolatile, p.prosecdef, p.proconfig, own.rolname
    into v_provolatile, v_prosecdef, v_conf, v_owner
    from pg_proc p join pg_roles own on own.oid = p.proowner
    where p.oid = 'clara.get_close_plan(uuid)'::regprocedure;
  if v_provolatile <> 's' then
    raise exception 'theta S2.1: get_close_plan is not STABLE (provolatile=%)', v_provolatile
      using errcode = 'CLR10';
  end if;
  if not v_prosecdef then
    raise exception 'theta S2.1: get_close_plan is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'theta S2.1: get_close_plan is owned by % (expected clara_fn_owner)', v_owner
      using errcode = 'CLR10';
  end if;
  if v_conf is null or not ('search_path=clara, pg_temp' = any(v_conf)) then
    raise exception 'theta S2.1: get_close_plan does not carry a pinned search_path -- got %', v_conf
      using errcode = 'CLR10';
  end if;

  -- (2.2) THE GRANT MATRIX, by has_function_privilege STATE, never grant-statement
  -- text (0056 S11.5's own instrument): clara_authenticated AND clara_agent_ro can
  -- execute (the one dual-lane read this file adds); every other app/wake role
  -- gains NOTHING new.
  if not has_function_privilege('clara_authenticated', 'clara.get_close_plan(uuid)', 'execute') then
    raise exception 'theta S2.2: clara_authenticated cannot execute get_close_plan -- the read is dark'
      using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_agent_ro', 'clara.get_close_plan(uuid)', 'execute') then
    raise exception 'theta S2.2: clara_agent_ro cannot execute get_close_plan -- the spec grant is missing'
      using errcode = 'CLR10';
  end if;
  foreach v_t in array array['clara_runtime','clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_t, 'clara.get_close_plan(uuid)', 'execute') then
      raise exception 'theta S2.2: % holds EXECUTE on get_close_plan -- outside the intended grant matrix', v_t
        using errcode = 'CLR10';
    end if;
  end loop;
  if has_function_privilege('public', 'clara.get_close_plan(uuid)', 'execute') then
    raise exception 'theta S2.2: PUBLIC holds EXECUTE on get_close_plan' using errcode = 'CLR10';
  end if;

  raise notice 'theta OK: clara.get_close_plan(uuid) created -- STABLE, SECURITY DEFINER, dual-granted to clara_authenticated + clara_agent_ro, no other role reached. Additive, no D1 window, LIVE-INERT until the first fiscal_years row exists.';
end $s2$;
