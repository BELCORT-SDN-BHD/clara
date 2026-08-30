-- G1 PR-2b (裁-40's own follow-up; g1-wake-engine-design.md §1.1/§3.6, bank-agency-design.md §3.6):
-- the bank_agent PRODUCER's one new DB surface.
--
-- clara._append_event is deliberately UNGRANTED -- "callable only inside definer writers" (0005
-- §D's own header comment), and every existing caller is a narrowly-scoped SECURITY DEFINER
-- writer (egress consent grant/revoke, kb_binding.revoked, invite.revoked, ...). No existing
-- writer emits `bank.agent_due`, so the leader-guarded cadence belt this PR builds
-- (packages/runtime/lib/reconciler-bank-agent.mjs) has NO lawful way to append the event at all
-- without one narrow door of its own -- widening _append_event's own grant to clara_runtime would
-- let the runtime forge ANY event type/firm/client/payload combination directly, which is a much
-- bigger hole than this gate needs to open.
--
-- clara.emit_bank_agent_due(p_client, p_bank_account, p_reason) is the smallest such door:
-- validate the client is real and active and the bank account genuinely belongs to it (defense in
-- depth -- the runtime never derives an authoritative fact, but it should not be ABLE to forge one
-- either), then call _append_event exactly once, CLIENT-scoped, with `bank_account_id` in the
-- payload -- the three producer-side contracts #437's own body recorded (bankAgent.v1.infra.ts):
-- (1) the payload carries bank_account_id (wake_get_bank_pack requires one, CLR11 otherwise, and
-- clara_wake_bank holds no SELECT on bank_accounts); (2) the event is appended CLIENT-scoped
-- (_tf_agent_task_insert's wake arm DERIVES the task's client from wake_intents ⋈ domain_events --
-- a client_id on the task INSERT itself is discarded); (3) clara.event_types must register
-- `bank.agent_due` with client_scoped=true, or _append_event's own insert-time gate refuses CLR10.
--
-- Granted to clara_runtime ONLY -- no wake role, no clara_authenticated, no PUBLIC. This is an
-- internal clock primitive, never a human or agent verb, and it names no frontend home (per
-- .claude/rules/db-migrations.md's door-naming rule) because it has none: the leader loop is its
-- only caller.
--
-- WHAT THIS FILE DOES NOT SHIP, named so the gap is understood rather than silently assumed:
--   * `bank.agent_due`'s own clara.event_types / clara.trigger_taxonomy registration -- that
--     COUPLED PAIR (0154's own tail names the half-registration hazard of splitting a registration
--     across two files) is lane g1-pr2-db's own migration, in flight as this file is authored.
--     Calling this wrapper before that registration lands is a well-formed CLR10 refusal
--     (clara.event_types has no row named 'bank.agent_due' yet, so _append_event's own
--     unregistered-type derivation returns null and the domain_events insert trigger refuses),
--     never a crash -- proven by this PR's own negative control against a RIG-ONLY stub
--     registration, since no real one exists on this branch to test against.
--   * clara.bank_agent_run_due(uuid) itself -- F-A3's own domain due-predicate (design §1.1: "a
--     new source ships its own clara.<source>_run_due(p_client uuid) returns jsonb"), unblocked
--     but not built by this gate. The runtime belt that calls this wrapper feature-detects that
--     predicate's exact signature per cycle (the reconciler-fa.mjs/-adjustments.mjs idiom) and
--     stays DORMANT until it exists, so this door is a well-formed no-op in production today.

set local statement_timeout = '5min'; -- precautionary; this file does no heavy scan

-- =====================================================================================
-- Prestate -- purely additive (no existing body recut), so the only claim to measure is that
-- the name is genuinely free under this exact arity.
-- =====================================================================================
do $$
begin
  if to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,text)') is not null then
    raise exception 'g1_pr_2b_bank_agent_due_emit prestate: clara.emit_bank_agent_due(uuid,uuid,text) already exists' using errcode='CLR10';
  end if;
end $$;

create function clara.emit_bank_agent_due(p_client uuid, p_bank_account uuid, p_reason text default null)
  returns bigint
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_seq bigint;
begin
  select c.firm_id into v_firm from clara.clients c where c.id = p_client and c.status = 'active';
  if v_firm is null then
    raise exception 'emit_bank_agent_due: unknown or inactive client %', p_client using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from clara.bank_accounts ba
     where ba.id = p_bank_account and ba.client_id = p_client and ba.active
  ) then
    raise exception 'emit_bank_agent_due: bank account % is not an active account of client %', p_bank_account, p_client
      using errcode = 'CLR10';
  end if;
  v_seq := clara._append_event(v_firm, 'bank.agent_due', p_client, null, null, null, null, null, null,
    jsonb_build_object('bank_account_id', p_bank_account, 'reason', coalesce(nullif(btrim(p_reason), ''), 'due')));
  return v_seq;
end $$;

revoke all on function clara.emit_bank_agent_due(uuid,uuid,text) from public;
grant execute on function clara.emit_bank_agent_due(uuid,uuid,text) to clara_runtime;

comment on function clara.emit_bank_agent_due(uuid,uuid,text) is
  'G1 PR-2b: the bank_agent producer''s sole write. clara_runtime ONLY -- the leader-guarded '
  'cadence belt''s one call per due (client, bank_account) pair, client-scoped, carrying '
  'bank_account_id in the payload (g1-wake-engine-design.md, "Three producer-side contracts"). '
  'Refuses CLR10 on an unknown/inactive client, a bank account not an active account of that '
  'client, or (via _append_event''s own insert-trigger derivation) an unregistered/firm-level '
  'event type -- the last is lane g1-pr2-db''s own registration to complete.';

-- =====================================================================================
-- Tail census -- positive reads only (review law 2: absence is not evidence).
-- =====================================================================================
do $$
declare v_fn_exists boolean; v_runtime_can boolean; v_public_can boolean; v_authed_can boolean;
begin
  select to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,text)') is not null into v_fn_exists;
  if not v_fn_exists then
    raise exception 'g1_pr_2b_bank_agent_due_emit tail: clara.emit_bank_agent_due(uuid,uuid,text) does not exist' using errcode='CLR10';
  end if;
  select has_function_privilege('clara_runtime', 'clara.emit_bank_agent_due(uuid,uuid,text)', 'execute') into v_runtime_can;
  if not v_runtime_can then
    raise exception 'g1_pr_2b_bank_agent_due_emit tail: clara_runtime cannot execute emit_bank_agent_due' using errcode='CLR10';
  end if;
  select has_function_privilege('public', 'clara.emit_bank_agent_due(uuid,uuid,text)', 'execute') into v_public_can;
  if v_public_can then
    raise exception 'g1_pr_2b_bank_agent_due_emit tail: PUBLIC can still execute emit_bank_agent_due' using errcode='CLR10';
  end if;
  select has_function_privilege('clara_authenticated', 'clara.emit_bank_agent_due(uuid,uuid,text)', 'execute') into v_authed_can;
  if v_authed_can then
    raise exception 'g1_pr_2b_bank_agent_due_emit tail: clara_authenticated can execute emit_bank_agent_due (this is an internal clock primitive, never a human verb)' using errcode='CLR10';
  end if;
  raise notice 'g1_pr_2b_bank_agent_due_emit tail: OK -- clara.emit_bank_agent_due(uuid,uuid,text) exists, clara_runtime EXECUTE-granted, PUBLIC and clara_authenticated both refused. No table in workflow/graphile_worker/spike touched (this file adds one function, zero tables).';
end $$;
